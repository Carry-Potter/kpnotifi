/**
 * Model filtera pretrage i pretvaranje u/iz KP query stringa.
 *
 * KP prima filtere kao obične query parametre na /pretraga:
 *   categoryId, groupId, keywords, priceFrom, priceTo, currency,
 *   locationIds (zarezom razdvojeni), locationDistance, condition,
 *   hasPrice, hasPhoto, type (sell|buy), order, page, ...
 * plus dinamičke atribute po kategoriji (carModel, carManufactureYear, ...).
 *
 * Mi čuvamo filter kao "ravan" objekat string->string (multi vrednosti su
 * zarezom razdvojene, kao što ih i KP prima), normalizovan i heširan da bi
 * identične pretrage delile jedan feed.
 */
import { createHash } from 'node:crypto';

export type FilterParams = Record<string, string>;

export const KP_BASE = 'https://www.kupujemprodajem.com';

/** Parametri koji ne definišu pretragu pa se izbacuju pri normalizaciji. */
const IGNORED_PARAMS = new Set([
  'page',
  'order',
  'firstParam',
  'group',
  'ignoreUserId',
  'scrollToTop',
]);

/**
 * Normalizuje filter: izbaci prazne i nebitne parametre, sortira ključeve,
 * sortira multi vrednosti (locationIds=5,1 i 1,5 su ista pretraga).
 */
export function normalizeFilter(params: FilterParams): FilterParams {
  const out: FilterParams = {};
  for (const key of Object.keys(params).sort()) {
    if (IGNORED_PARAMS.has(key)) continue;
    const raw = (params[key] ?? '').trim();
    if (raw === '') continue;
    // multi vrednosti sortiramo da bi hash bio stabilan
    const value = raw.includes(',')
      ? raw.split(',').map((v) => v.trim()).filter(Boolean).sort().join(',')
      : raw;
    out[key] = value;
  }
  return out;
}

/** Stabilan hash normalizovanog filtera — ključ za deljenje feeda. */
export function filterHash(params: FilterParams): string {
  const normalized = normalizeFilter(params);
  const canonical = JSON.stringify(normalized);
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

/** Sastavi KP URL pretrage za dati filter (uvek najnoviji prvo, strana 1). */
export function buildSearchUrl(params: FilterParams, page = 1): string {
  const normalized = normalizeFilter(params);
  const qs = new URLSearchParams(normalized);
  qs.set('order', 'renewDateDesc');
  if (page > 1) qs.set('page', String(page));
  return `${KP_BASE}/pretraga?${qs.toString()}`;
}

/**
 * Parsira nalepljeni KP URL u filter model.
 * Prihvata i /kategorija/pretraga?... i /pretraga?... oblike.
 * Baca grešku ako URL nije sa kupujemprodajem.com ili nije pretraga.
 */
export function parseKpUrl(url: string): FilterParams {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    throw new Error('Ovo ne izgleda kao ispravan link.');
  }
  const host = u.hostname.replace(/^www\./, '');
  if (host !== 'kupujemprodajem.com' && host !== 'novi.kupujemprodajem.com') {
    throw new Error('Link mora biti sa kupujemprodajem.com.');
  }
  if (!u.pathname.endsWith('/pretraga') && u.pathname !== '/pretraga') {
    throw new Error(
      'Nalepi link stranice PRETRAGE (podesi filtere na KP-u pa kopiraj adresu iz browsera).'
    );
  }
  const params: FilterParams = {};
  for (const [key, value] of u.searchParams) {
    // ako se parametar ponavlja, KP očekuje zarezom razdvojene vrednosti
    params[key] = params[key] ? `${params[key]},${value}` : value;
  }
  return normalizeFilter(params);
}
