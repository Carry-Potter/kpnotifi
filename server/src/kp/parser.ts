/**
 * Parsiranje KP stranice: iz HTML-a izvuče __NEXT_DATA__ JSON i iz njega
 * oglase, ukupan broj rezultata i katalog (kategorije/grupe/lokacije/atribute).
 */
import type {
  KpAd,
  KpAttributeDef,
  KpCatalog,
  KpCategory,
  KpGroup,
  KpLocation,
  KpSearchResult,
} from './types.ts';

const NEXT_DATA_RE =
  /<script id="__NEXT_DATA__" type="application\/json"[^>]*>(.*?)<\/script>/s;

export class KpParseError extends Error {}

/** Izvuče i parsira __NEXT_DATA__ iz HTML-a. */
export function extractNextData(html: string): any {
  const m = NEXT_DATA_RE.exec(html);
  if (!m || !m[1]) {
    throw new KpParseError(
      'Nema __NEXT_DATA__ na stranici — KP je promenio strukturu ili je vratio blokadu/captcha.'
    );
  }
  try {
    return JSON.parse(m[1]);
  } catch {
    throw new KpParseError('__NEXT_DATA__ nije ispravan JSON.');
  }
}

function reduxState(nextData: any): any {
  const state = nextData?.props?.initialReduxState;
  if (!state) throw new KpParseError('Nedostaje initialReduxState u __NEXT_DATA__.');
  return state;
}

function toAd(raw: any): KpAd {
  return {
    id: Number(raw.id),
    name: String(raw.name ?? ''),
    priceNumber: Number(raw.priceNumber ?? 0) || 0,
    currency: String(raw.currencyAcronym ?? ''),
    priceText: [raw.price, raw.currency].filter(Boolean).join(' ').trim() || 'Kontakt',
    location: String(raw.location ?? ''),
    condition: String(raw.condition ?? ''),
    conditionId: String(raw.conditionId ?? ''),
    type: String(raw.type ?? ''),
    categoryId: Number(raw.categoryId ?? 0),
    categoryName: String(raw.categoryName ?? ''),
    groupId: Number(raw.groupId ?? 0),
    groupName: String(raw.groupName ?? ''),
    image: String(raw.image ?? ''),
    adUrl: String(raw.adUrl ?? ''),
    postedRaw: String(raw.postedRaw ?? ''),
    descriptionSnippet: String(raw.descriptionSnippetDecoded ?? '').trim(),
  };
}

/** Rezultati pretrage sa jedne stranice. */
export function parseSearchResult(html: string): KpSearchResult {
  const state = reduxState(extractNextData(html));
  const search = state.search;
  if (!search || !Array.isArray(search.adsIds)) {
    throw new KpParseError('Nedostaje search sekcija u __NEXT_DATA__.');
  }
  const byId = search.byId ?? {};
  const ads: KpAd[] = [];
  for (const id of search.adsIds) {
    const raw = byId[String(id)];
    if (raw) ads.push(toAd(raw));
  }
  return {
    ads,
    total: Number(search.total ?? 0),
    pages: Number(search.pages ?? 0),
    page: Number(search.page ?? 1),
    filterName: decodeEntities(String(search.filterName ?? '')),
  };
}

/** Katalog kategorija/grupa/lokacija/atributa sa iste stranice. */
export function parseCatalog(html: string): KpCatalog {
  const state = reduxState(extractNextData(html));

  const categories: KpCategory[] = Object.values<any>(state.category?.categories ?? {})
    .filter((c) => c?.active !== 'no')
    .map((c) => ({ id: Number(c.id), name: String(c.name), kind: String(c.kind ?? 'goods') }));

  const groups: KpGroup[] = [];
  for (const perCategory of Object.values<any>(state.group?.groups ?? {})) {
    for (const g of Object.values<any>(perCategory ?? {})) {
      if (g?.active === 'no') continue;
      groups.push({ id: Number(g.id), name: String(g.name), parentId: Number(g.parentId) });
    }
  }

  const locations: KpLocation[] = Object.values<any>(state.location?.byId ?? {}).map((l) => ({
    id: Number(l.id),
    name: String(l.name),
    big: Boolean(l.big),
  }));

  const attributes: Record<string, KpAttributeDef[]> = {};
  const defs = state.adAttribute?.attributeDefinitionsSearch ?? {};
  for (const [categoryId, sections] of Object.entries<any>(defs)) {
    const list: KpAttributeDef[] = [];
    for (const section of Array.isArray(sections) ? sections : []) {
      for (const a of section?.attributes ?? []) {
        list.push({
          attributeId: Number(a.attributeId),
          code: String(a.code),
          displayName: String(a.displayName),
          isMultiSelect: Boolean(a.isMultiSelect),
          dataType: String(a.dataType ?? ''),
          uiControl: String(a.uiControl ?? ''),
          sortOrder: Number(a.sortOrder ?? 0),
        });
      }
    }
    if (list.length > 0) attributes[categoryId] = list;
  }

  return { categories, groups, locations, attributes };
}

function decodeEntities(s: string): string {
  return s
    .replaceAll('&euro;', '€')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}
