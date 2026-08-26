/**
 * Poller: obilazi feedove kojima je isteklo POLL_INTERVAL_MINUTES, povlači
 * prvu stranu sa KP-a, upisuje viđene oglase i šalje obaveštenja
 * pretplaćenim korisnicima. Radi i preko internog tajmera i preko
 * POST /internal/tick (spoljni cron koji ujedno budi servis).
 */
import { sql } from '../db/index.ts';
import { cleanupLinkCodes, cleanupPreviewJobs } from '../db/repo.ts';
import { syncCatalogIfStale } from '../kp/catalog.ts';
import { searchAds } from '../kp/client.ts';
import { buildSearchUrl, type FilterParams } from '../kp/filters.ts';
import type { KpAd } from '../kp/types.ts';
import { detectNewAds, parsePostedRaw } from './detect.ts';
import { notifyAd, notifyAdmin, notifyBatch, notifySearchTooBroad } from '../telegram/bot.ts';
import { createMonitor, type FailureKind } from './monitor.ts';
import { KpHttpError } from '../kp/client.ts';
import { KpDegradedError, KpParseError, isDegradedResult } from '../kp/parser.ts';

/** Nadzor zdravlja scrapinga — alarmira admina kad KP počne da odbija/menja stranice. */
export const monitor = createMonitor({ alert: notifyAdmin });

function classifyError(err: unknown): FailureKind {
  if (err instanceof KpDegradedError) return 'block';
  if (err instanceof KpParseError) return 'parse';
  if (err instanceof KpHttpError && (err.status === 429 || err.status === 403)) return 'block';
  return 'other';
}

const POLL_INTERVAL_MIN = Number(process.env.POLL_INTERVAL_MINUTES ?? 5);
/** Više novih od ovoga u jednom prolazu -> jedna zbirna poruka. */
const BATCH_THRESHOLD = 20;
/** Koliko feedova najviše obraditi u jednom tick-u. */
const MAX_FEEDS_PER_TICK = 30;

let running = false;

export interface TickReport {
  checkedFeeds: number;
  newAds: number;
  sentNotifications: number;
  errors: number;
}

export async function tick(): Promise<TickReport> {
  // spreči preklapanje dva tick-a (interni tajmer + spoljni cron)
  if (running) return { checkedFeeds: 0, newAds: 0, sentNotifications: 0, errors: 0 };
  running = true;
  try {
    return await tickInner();
  } finally {
    running = false;
  }
}

async function tickInner(): Promise<TickReport> {
  const report: TickReport = { checkedFeeds: 0, newAds: 0, sentNotifications: 0, errors: 0 };

  await cleanupLinkCodes().catch(() => {}); // higijena: istekli kodovi za povezivanje
  await cleanupPreviewJobs().catch(() => {}); // higijena: stari zahtevi za pregled

  // katalog: samoizlečenje — ako startna sinhronizacija zakaže (spor cold start),
  // pokušava se ovde dok ne uspe (interno preskače ako je katalog svež)
  await syncCatalogIfStale().catch((err) => console.error('katalog greška:', err.message));

  // feedovi koji imaju bar jednu uključenu pretragu aktivnog korisnika,
  // nisu pauzirani i na redu su za proveru — najstariji prvo
  const feeds = await sql`
    select f.id, f.params, f.is_seeded, f.created_at, f.error_count
    from feeds f
    where (f.paused_until is null or f.paused_until < now())
      and (f.last_checked_at is null
           or f.last_checked_at < now() - ${POLL_INTERVAL_MIN + ' minutes'}::interval)
      and exists (
        select 1 from searches s
        join users u on u.id = s.user_id
        where s.feed_id = f.id and s.is_enabled and u.is_active)
    order by f.last_checked_at asc nulls first
    limit ${MAX_FEEDS_PER_TICK}`;

  for (const row of feeds) {
    const feed = {
      id: Number(row.id),
      params: row.params as FilterParams,
      is_seeded: Boolean(row.is_seeded),
      created_at: row.created_at as Date,
      error_count: Number(row.error_count),
    };
    try {
      await checkFeed(feed, report);
      monitor.recordSuccess();
      await sql`
        update feeds set last_checked_at = now(), last_ok_at = now(), error_count = 0
        where id = ${feed.id}`;
    } catch (err: any) {
      report.errors++;
      await monitor.recordFailure(classifyError(err), err.message);
      const errorCount = feed.error_count + 1;
      // eksponencijalna pauza: 10min, 20min, 40min... najviše 6h
      const pauseMin = Math.min(10 * 2 ** (errorCount - 1), 360);
      console.error(`feed ${feed.id}: ${err.message} (pauza ${pauseMin}min)`);
      await sql`
        update feeds
        set last_checked_at = now(), error_count = ${errorCount},
            paused_until = now() + ${pauseMin + ' minutes'}::interval
        where id = ${feed.id}`;
    }
    report.checkedFeeds++;
  }
  return report;
}

async function checkFeed(
  feed: { id: number; params: FilterParams; is_seeded: boolean; created_at: Date },
  report: TickReport
): Promise<void> {
  const result = await searchAds(feed.params);
  // prazna ljuštura = tihi blok; bolje greška i alarm nego "zasejano 0 oglasa"
  if (isDegradedResult(result)) throw new KpDegradedError();

  if (!feed.is_seeded) {
    // provera širine pri seedu — snimanje bez nje prolazi kad KP ne da
    // podatke serveru sajta (hibridni režim), pa je worker poslednja brana
    const maxResults = Number(process.env.MAX_RESULTS_PER_SEARCH ?? 10_000);
    if (result.total > maxResults) {
      const subs = await sql`
        select s.id, s.name, u.telegram_id
        from searches s join users u on u.id = s.user_id
        where s.feed_id = ${feed.id} and s.is_enabled`;
      for (const sub of subs) {
        await sql`update searches set is_enabled = false where id = ${sub.id}`;
        await notifySearchTooBroad(
          Number(sub.telegram_id),
          sub.name,
          result.total,
          buildSearchUrl(feed.params)
        ).catch(() => {});
      }
      await sql`update feeds set is_seeded = true where id = ${feed.id}`;
      return;
    }
    // prvi prolaz: samo zabeleži zatečeno stanje, bez poruka
    await recordSeen(feed.id, result.ads);
    await sql`update feeds set is_seeded = true where id = ${feed.id}`;
    return;
  }

  const seenRows = await sql`select ad_id from seen_ads where feed_id = ${feed.id}`;
  const seenIds = new Set<number>(seenRows.map((r) => Number(r.ad_id)));
  const newAds = detectNewAds({ ads: result.ads, seenIds, feedCreatedAt: feed.created_at });
  // upiši SVE nevidjene (i "obnovljene" stare, da ih ne proveravamo ponovo)
  await recordSeen(feed.id, result.ads.filter((a) => !seenIds.has(a.id)));
  if (newAds.length === 0) return;

  report.newAds += newAds.length;

  const subscribers = await sql`
    select s.id as search_id, s.name, u.telegram_id
    from searches s join users u on u.id = s.user_id
    where s.feed_id = ${feed.id} and s.is_enabled and u.is_active`;

  for (const sub of subscribers) {
    const telegramId = Number(sub.telegram_id);
    if (newAds.length > BATCH_THRESHOLD) {
      await notifyBatch(telegramId, sub.name, newAds.length, buildSearchUrl(feed.params));
      report.sentNotifications++;
      continue;
    }
    for (const ad of newAds) {
      // idempotencija: unique (search_id, ad_id) — ako je već poslato, preskoči
      const inserted = await sql`
        insert into notifications (search_id, ad_id)
        values (${sub.search_id}, ${ad.id})
        on conflict (search_id, ad_id) do nothing
        returning id`;
      if (inserted.length === 0) continue;
      try {
        await notifyAd(telegramId, sub.name, ad);
        report.sentNotifications++;
      } catch (err: any) {
        console.error(`slanje ka ${telegramId} nije uspelo: ${err.message}`);
        await sql`update notifications set status = 'failed'
                  where search_id = ${sub.search_id} and ad_id = ${ad.id}`;
      }
    }
    await sql`update searches set last_notified_at = now() where id = ${sub.search_id}`;
  }
}

async function recordSeen(feedId: number, ads: KpAd[]): Promise<void> {
  for (const ad of ads) {
    const posted = parsePostedRaw(ad.postedRaw);
    await sql`
      insert into seen_ads (feed_id, ad_id, posted_at, price_number, currency)
      values (${feedId}, ${ad.id}, ${posted}, ${ad.priceNumber}, ${ad.currency})
      on conflict (feed_id, ad_id) do nothing`;
  }
}

/** Interni tajmer — radi dok je proces budan (na Renderu između uspavljivanja). */
export function startInternalTimer(): void {
  const everyMs = Math.max(1, POLL_INTERVAL_MIN) * 60_000;
  setInterval(() => {
    tick().catch((err) => console.error('tick greška:', err.message));
  }, everyMs).unref();
}
