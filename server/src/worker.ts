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
import { syncCatalogIfStale } from './kp/catalog.ts';

const POLL_INTERVAL_MIN = Number(process.env.POLL_INTERVAL_MINUTES ?? 5);

console.log(`KP Notify worker: provera na ${POLL_INTERVAL_MIN} min, baza: ${maskDb()}`);
await runMigrations();

// preuzimanje od (blokiranog) Render pollera: skini pauze nastale njegovim greškama
await sql`update feeds set paused_until = null, error_count = 0 where paused_until is not null`;

while (true) {
  const started = Date.now();
  try {
    await syncCatalogIfStale();
    const r = await tick();
    if (r.checkedFeeds > 0 || r.errors > 0) {
      console.log(new Date().toLocaleTimeString('sr-RS'), JSON.stringify(r));
    }
  } catch (err: any) {
    console.error('worker greška:', err.message);
  }
  const waitMs = Math.max(30_000, POLL_INTERVAL_MIN * 60_000 - (Date.now() - started));
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

function maskDb(): string {
  try {
    const u = new URL(process.env.DATABASE_URL ?? '');
    return u.hostname;
  } catch {
    return '?';
  }
}
