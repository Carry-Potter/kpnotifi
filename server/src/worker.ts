/**
 * KP Notify worker — proverava KP i šalje obaveštenja SA OVE mašine.
 *
 * Zašto postoji: KP datacenter IP adresama (Render i sl.) servira stranice
 * bez podataka, pa se KP mora čitati sa "obične" (rezidencijalne) IP adrese.
 * Worker deli istu bazu (Neon) i istog bota kao server na Renderu; na
 * Renderu se poller isključi sa POLLER_ENABLED=false.
 *
 * Pokretanje (DATABASE_URL mora pokazivati na produkcijsku bazu):
 *   npm run worker
 */
import { runMigrations } from './db/migrate.ts';
import { sql } from './db/index.ts';
import { tick } from './jobs/poller.ts';
import { processPreviewJobs } from './jobs/preview.ts';
import { syncCatalogIfStale } from './kp/catalog.ts';

const POLL_INTERVAL_MIN = Number(process.env.POLL_INTERVAL_MINUTES ?? 5);

console.log(`KP Notify worker: provera na ${POLL_INTERVAL_MIN} min, baza: ${maskDb()}`);
await runMigrations();

// preuzimanje od (blokiranog) Render pollera: skini pauze nastale njegovim greškama
await sql`update feeds set paused_until = null, error_count = 0 where paused_until is not null`;

// Jednoprolazni režim (GitHub Actions cron): odradi sve pa izađi.
if (process.env.WORKER_ONCE === '1') {
  let previews = await processPreviewJobs();
  await syncCatalogIfStale().catch((err: any) => console.error('katalog greška:', err.message));
  const r = await tick();
  // kratko sačekaj preglede koji stignu dok run traje (korisnik klikće na sajtu)
  const lingerUntil = Date.now() + 25_000;
  while (Date.now() < lingerUntil) {
    previews += await processPreviewJobs();
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  console.log(`WORKER_ONCE: pregleda=${previews} ${JSON.stringify(r)}`);
  await sql.end();
  process.exit(0);
}

// Brza petlja (4s): zahtevi za pregled sa sajta — korisnik čeka uživo.
// Spora petlja (POLL_INTERVAL): obilazak feedova + katalog.
let nextTickAt = 0;
while (true) {
  try {
    const previews = await processPreviewJobs();
    if (previews > 0) console.log(new Date().toLocaleTimeString('sr-RS'), `pregleda: ${previews}`);
    if (Date.now() >= nextTickAt) {
      nextTickAt = Date.now() + POLL_INTERVAL_MIN * 60_000;
      await syncCatalogIfStale();
      const r = await tick();
      if (r.checkedFeeds > 0 || r.errors > 0) {
        console.log(new Date().toLocaleTimeString('sr-RS'), JSON.stringify(r));
      }
    }
  } catch (err: any) {
    console.error('worker greška:', err.message);
  }
  await new Promise((resolve) => setTimeout(resolve, 4_000));
}

function maskDb(): string {
  try {
    const u = new URL(process.env.DATABASE_URL ?? '');
    return u.hostname;
  } catch {
    return '?';
  }
}
