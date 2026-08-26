/**
 * HTTP klijent ka KP-u: globalni throttle (1 zahtev na KP_MIN_DELAY_MS),
 * retry sa backoff-om na 429/5xx i parsiranje odgovora.
 */
import { buildSearchUrl, type FilterParams } from './filters.ts';
import { parseCatalog, parseSearchResult } from './parser.ts';
import type { KpCatalog, KpSearchResult } from './types.ts';

const MIN_DELAY_MS = Number(process.env.KP_MIN_DELAY_MS ?? 2000);
const CONTACT = process.env.KP_CONTACT ?? 'kpnotifi';

const USER_AGENT =
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ` +
  `Chrome/124.0.0.0 Safari/537.36 ${CONTACT}`;

export class KpHttpError extends Error {
  status: number;
  constructor(status: number, url: string) {
    super(`KP je vratio HTTP ${status} za ${url}`);
    this.status = status;
  }
}

// --- globalni red: svi KP zahtevi idu jedan po jedan, sa razmakom ---
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const jitter = Math.random() * 500;
    const waitMs = lastRequestAt + MIN_DELAY_MS + jitter - Date.now();
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    try {
      return await task();
    } finally {
      lastRequestAt = Date.now();
    }
  });
  queue = run.catch(() => {}); // greška jednog zahteva ne ruši red
  return run;
}

async function fetchHtml(url: string, attempt = 0): Promise<string> {
  const res = await throttled(() =>
    fetch(url, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'sr-RS,sr;q=0.9,en;q=0.5',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    })
  );
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 3) throw new KpHttpError(res.status, url);
    const backoffMs = 5_000 * 2 ** attempt + Math.random() * 2_000;
    await new Promise((r) => setTimeout(r, backoffMs));
    return fetchHtml(url, attempt + 1);
  }
  if (!res.ok) throw new KpHttpError(res.status, url);
  return res.text();
}

/** Prva strana rezultata za dati filter. */
export async function searchAds(params: FilterParams): Promise<KpSearchResult> {
  const url = buildSearchUrl(params);
  return parseSearchResult(await fetchHtml(url));
}

/**
 * Katalog za datu kategoriju (ili globalni ako se izostavi).
 * Atributi specifični za kategoriju stižu samo kad je categoryId zadat.
 */
export async function fetchCatalog(categoryId?: number): Promise<KpCatalog> {
  const params: FilterParams = categoryId ? { categoryId: String(categoryId) } : {};
  const url = buildSearchUrl(params);
  return parseCatalog(await fetchHtml(url));
}
