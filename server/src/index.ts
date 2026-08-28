/** Ulazna tačka: Fastify server (API + statika + webhook + tick) i poller. */
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { webhookCallback } from 'grammy';
import { runMigrations } from './db/migrate.ts';
import { syncCatalogIfStale } from './kp/catalog.ts';
import { registerApiRoutes } from './routes/api.ts';
import { bot, setupBot } from './telegram/bot.ts';
import { monitor, startInternalTimer, tick } from './jobs/poller.ts';
import { isDispatchConfigured, requestWorkerRun } from './github.ts';

const PORT = Number(process.env.PORT ?? 3000);
/** false na Renderu u hibridnom režimu — KP proveru radi worker sa druge mašine. */
const POLLER_ENABLED = (process.env.POLLER_ENABLED ?? 'true') !== 'false';
const PUBLIC_URL = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '');
const TICK_SECRET = process.env.TICK_SECRET ?? '';

await runMigrations();
setupBot();

const app = Fastify({ logger: { level: 'info' } });

app.get('/health', async () => ({
  ok: true,
  scraper: {
    lastOkAt: monitor.state.lastOkAt ? new Date(monitor.state.lastOkAt).toISOString() : null,
    consecutiveFailures: monitor.state.consecutive,
  },
}));

// Cron servisi šalju svakakav Content-Type (npr. x-www-form-urlencoded uz prazno
// telo) — bez ovoga Fastify vraća 415. Progutaj sve što nema svoj parser.
app.addContentTypeParser('*', (_req, payload, done) => {
  let data = '';
  payload.on('data', (c) => (data += c));
  payload.on('end', () => done(null, data || null));
});

// Spoljni cron (cron-job.org) udara ovde — ujedno budi uspavani Render servis.
// GET i POST rade isto, da podešavanje crona bude što jednostavnije.
const tickHandler = async (req: any, reply: any) => {
  const secret = (req.headers['x-tick-secret'] ?? (req.query as any)?.secret) as string;
  if (!TICK_SECRET || secret !== TICK_SECRET) {
    return reply.code(403).send({ error: 'Pogrešna tajna.' });
  }
  // u hibridnom režimu cron-job.org ping ovde pokreće GitHub worker
  // (GitHubov sopstveni cron je nepouzdan — ume da preskoči sate)
  if (!POLLER_ENABLED) {
    await requestWorkerRun('spoljni cron');
    return { ok: true, poller: isDispatchConfigured() ? 'dispatched' : 'disabled (nema GITHUB_DISPATCH_TOKEN)' };
  }
  const report = await tick();
  return report;
};
app.post('/internal/tick', tickHandler);
app.get('/internal/tick', tickHandler);

// Dijagnostika KP odgovora SA OVOG servera (degradirani odgovori za DC IP):
// GET /internal/kp-test?secret=... — proba razne UA/cookie kombinacije.
app.get('/internal/kp-test', async (req, reply) => {
  const secret = (req.query as any)?.secret as string;
  if (!TICK_SECRET || secret !== TICK_SECRET) return reply.code(403).send({ error: 'Ne.' });

  const { parseSearchResult } = await import('./kp/parser.ts');
  const target = 'https://www.kupujemprodajem.com/pretraga?categoryId=23&order=renewDateDesc';
  const pureUA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const results: Record<string, unknown> = {};

  async function probe(label: string, headers: Record<string, string>) {
    try {
      const res = await fetch(target, { headers, signal: AbortSignal.timeout(30_000) });
      const html = await res.text();
      let parsed: any = null;
      try {
        const r = parseSearchResult(html);
        parsed = { total: r.total, ads: r.ads.length, filterName: r.filterName.slice(0, 60) };
      } catch (e: any) {
        parsed = { parseError: e.message };
      }
      results[label] = { status: res.status, size: html.length, ...parsed };
    } catch (e: any) {
      results[label] = { error: e.message };
    }
  }

  await probe('pureUA', { 'user-agent': pureUA, accept: 'text/html' });
  try {
    const home = await fetch('https://www.kupujemprodajem.com/', {
      headers: { 'user-agent': pureUA, accept: 'text/html' },
      signal: AbortSignal.timeout(30_000),
    });
    await home.text();
    const cookies = (home.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    results.homeStatus = home.status;
    results.homeCookieCount = (home.headers.getSetCookie?.() ?? []).length;
    await probe('withCookies', { 'user-agent': pureUA, accept: 'text/html', cookie: cookies });
  } catch (e: any) {
    results.home = { error: e.message };
  }
  await probe('mobileUA', {
    'user-agent':
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    accept: 'text/html',
  });
  return results;
});

registerApiRoutes(app);

// Telegram webhook (samo u produkciji, kad postoji PUBLIC_URL)
if (bot && PUBLIC_URL) {
  app.post('/telegram/webhook', webhookCallback(bot, 'fastify'));
}

// Statika (web/dist) — u razvoju frontend ide preko Vite dev servera
const distDir = fileURLToPath(new URL('../../web/dist/', import.meta.url));
if (existsSync(distDir)) {
  app.register(fastifyStatic, { root: distDir });
}

await app.listen({ port: PORT, host: '0.0.0.0' });

// katalog + poller posle starta (ne blokiraju server); u hibridnom režimu
// oboje radi worker na mašini čiju IP KP normalno uslužuje
if (POLLER_ENABLED) {
  syncCatalogIfStale().catch((err) => console.error('katalog greška:', err.message));
  startInternalTimer();
} else {
  console.log('poller: isključen (POLLER_ENABLED=false) — KP proveru radi worker');
}

if (bot) {
  if (PUBLIC_URL) {
    await bot.api.setWebhook(`${PUBLIC_URL}/telegram/webhook`);
    console.log('telegram: webhook postavljen');
  } else {
    // long polling u razvoju; pušta grešku u log umesto da obori server
    // (npr. 409 Conflict kad je na produkciji aktivan webhook istog bota)
    bot.start().catch((err) => console.error('telegram polling greška:', err.message));
    console.log('telegram: long polling');
  }
}
