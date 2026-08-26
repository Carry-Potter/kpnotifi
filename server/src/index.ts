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

const PORT = Number(process.env.PORT ?? 3000);
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
  const report = await tick();
  return report;
};
app.post('/internal/tick', tickHandler);
app.get('/internal/tick', tickHandler);

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

// katalog + poller posle starta (ne blokiraju server)
syncCatalogIfStale().catch((err) => console.error('katalog greška:', err.message));
startInternalTimer();

if (bot) {
  if (PUBLIC_URL) {
    await bot.api.setWebhook(`${PUBLIC_URL}/telegram/webhook`);
    console.log('telegram: webhook postavljen');
  } else {
    bot.start(); // long polling u razvoju
    console.log('telegram: long polling');
  }
}
