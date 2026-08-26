/** REST API za web UI. Autentikacija: Bearer token iz Telegram /start linka. */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { searchAds } from '../kp/client.ts';
import { normalizeFilter, parseKpUrl, buildSearchUrl, type FilterParams } from '../kp/filters.ts';
import { getCategoryAttributes, getCategoryGroups } from '../kp/catalog.ts';
import { sql } from '../db/index.ts';
import {
  countSearches,
  createSearch,
  deleteSearch,
  ensureFeed,
  getSessionUser,
  listSearches,
  setSearchEnabled,
  type SessionUser,
} from '../db/repo.ts';
import { getBotUsername, notifySearchCreated } from '../telegram/bot.ts';

/** Limiti — štite KP, hosting i korisnika od preširokih/prebrojnih pretraga. */
const MAX_SEARCHES_PER_USER = Number(process.env.MAX_SEARCHES_PER_USER ?? 10);
const MAX_RESULTS_PER_SEARCH = Number(process.env.MAX_RESULTS_PER_SEARCH ?? 10_000);

async function auth(req: FastifyRequest): Promise<SessionUser | null> {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  return getSessionUser(token);
}

export function registerApiRoutes(app: FastifyInstance): void {
  // javno: podaci za landing stranicu (link ka botu)
  app.get('/api/config', async () => ({ botUsername: getBotUsername() }));

  // ko sam ja (provera tokena pri učitavanju sajta)
  app.get('/api/me', async (req, reply) => {
    const user = await auth(req);
    if (!user) return reply.code(401).send({ error: 'Prijava nije važeća.' });
    return { firstName: user.firstName };
  });

  // --- katalog za builder ---
  app.get('/api/catalog/categories', async (req, reply) => {
    if (!(await auth(req))) return reply.code(401).send({ error: 'Prijava nije važeća.' });
    const rows = await sql`select id, name from kp_categories order by name`;
    return rows;
  });

  app.get('/api/catalog/locations', async (req, reply) => {
    if (!(await auth(req))) return reply.code(401).send({ error: 'Prijava nije važeća.' });
    const rows = await sql`select id, name, big from kp_locations order by big desc, name`;
    return rows;
  });

  app.get('/api/catalog/categories/:id/groups', async (req, reply) => {
    if (!(await auth(req))) return reply.code(401).send({ error: 'Prijava nije važeća.' });
    const id = Number((req.params as any).id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'Loš id.' });
    return getCategoryGroups(id);
  });

  app.get('/api/catalog/categories/:id/attributes', async (req, reply) => {
    if (!(await auth(req))) return reply.code(401).send({ error: 'Prijava nije važeća.' });
    const id = Number((req.params as any).id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'Loš id.' });
    return getCategoryAttributes(id);
  });

  // --- probna pretraga (pre snimanja): koliko oglasa trenutno odgovara ---
  app.post('/api/preview', async (req, reply) => {
    if (!(await auth(req))) return reply.code(401).send({ error: 'Prijava nije važeća.' });
    const body = req.body as { params?: FilterParams; kpUrl?: string };
    let params: FilterParams;
    try {
      params = body.kpUrl ? parseKpUrl(body.kpUrl) : normalizeFilter(body.params ?? {});
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
    if (Object.keys(params).length === 0) {
      return reply.code(400).send({ error: 'Filter je prazan.' });
    }
    const result = await searchAds(params);
    return {
      params,
      kpUrl: buildSearchUrl(params),
      total: result.total,
      filterName: result.filterName,
      sample: result.ads.slice(0, 5).map((a) => ({
        id: a.id,
        name: a.name,
        priceText: a.priceText,
        location: a.location,
        image: a.image,
        adUrl: a.adUrl,
      })),
    };
  });

  // --- pretrage korisnika ---
  app.get('/api/searches', async (req, reply) => {
    const user = await auth(req);
    if (!user) return reply.code(401).send({ error: 'Prijava nije važeća.' });
    return listSearches(user.userId);
  });

  app.post('/api/searches', async (req, reply) => {
    const user = await auth(req);
    if (!user) return reply.code(401).send({ error: 'Prijava nije važeća.' });
    const body = req.body as { name?: string; params?: FilterParams; kpUrl?: string };
    let params: FilterParams;
    try {
      params = body.kpUrl ? parseKpUrl(body.kpUrl) : normalizeFilter(body.params ?? {});
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
    if (Object.keys(params).length === 0) {
      return reply.code(400).send({ error: 'Filter je prazan.' });
    }

    // limit: broj pretraga po korisniku
    const existing = await countSearches(user.userId);
    if (existing >= MAX_SEARCHES_PER_USER) {
      return reply.code(400).send({
        error: `Dostigao si limit od ${MAX_SEARCHES_PER_USER} pretraga. Obriši neku staru pa napravi novu.`,
      });
    }

    // limit: preširok filter — proveri na KP-u PRE snimanja
    const result = await searchAds(params);
    if (result.total > MAX_RESULTS_PER_SEARCH) {
      return reply.code(400).send({
        error:
          `Filter trenutno pogađa ${result.total.toLocaleString('sr-RS')} oglasa — preširoko je za praćenje ` +
          `(limit: ${MAX_RESULTS_PER_SEARCH.toLocaleString('sr-RS')}). Dodaj kategoriju, cenu ili preciznije ključne reči.`,
      });
    }

    const name = (body.name ?? '').trim() || 'Pretraga';
    const feed = await ensureFeed(params);
    const search = await createSearch(user.userId, feed.id, name);
    // potvrda u Telegram — korisnik odmah zna da je pretraga živa i šta da očekuje
    notifySearchCreated(user.telegramId, name, result.total).catch((err) =>
      console.error('potvrda pretrage nije poslata:', err.message)
    );
    return { id: search.id };
  });

  app.patch('/api/searches/:id', async (req, reply) => {
    const user = await auth(req);
    if (!user) return reply.code(401).send({ error: 'Prijava nije važeća.' });
    const id = Number((req.params as any).id);
    const body = req.body as { isEnabled?: boolean };
    if (typeof body.isEnabled !== 'boolean') {
      return reply.code(400).send({ error: 'Očekujem isEnabled true/false.' });
    }
    const ok = await setSearchEnabled(user.userId, id, body.isEnabled);
    if (!ok) return reply.code(404).send({ error: 'Pretraga ne postoji.' });
    return { ok: true };
  });

  app.delete('/api/searches/:id', async (req, reply) => {
    const user = await auth(req);
    if (!user) return reply.code(401).send({ error: 'Prijava nije važeća.' });
    const id = Number((req.params as any).id);
    const ok = await deleteSearch(user.userId, id);
    if (!ok) return reply.code(404).send({ error: 'Pretraga ne postoji.' });
    return { ok: true };
  });
}
