/** Upiti nad bazom — sve na jednom mestu, bez ORM-a. */
import { randomBytes } from 'node:crypto';
import { sql } from './index.ts';
import { filterHash, normalizeFilter, type FilterParams } from '../kp/filters.ts';

// --- korisnici i sesije ---

export async function upsertUser(tg: {
  id: number;
  first_name?: string;
  username?: string;
}): Promise<{ id: number }> {
  const rows = await sql`
    insert into users (telegram_id, first_name, username)
    values (${tg.id}, ${tg.first_name ?? ''}, ${tg.username ?? ''})
    on conflict (telegram_id) do update
      set first_name = excluded.first_name,
          username   = excluded.username,
          is_active  = true
    returning id`;
  return { id: Number(rows[0]!.id) };
}

export async function deactivateUser(telegramId: number): Promise<void> {
  await sql`update users set is_active = false where telegram_id = ${telegramId}`;
}

const SESSION_DAYS = 30;

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await sql`
    insert into sessions (token, user_id, expires_at)
    values (${token}, ${userId}, now() + ${SESSION_DAYS + ' days'}::interval)`;
  return token;
}

export interface SessionUser {
  userId: number;
  telegramId: number;
  firstName: string;
}

export async function getSessionUser(token: string): Promise<SessionUser | null> {
  const rows = await sql`
    select u.id, u.telegram_id, u.first_name
    from sessions s join users u on u.id = s.user_id
    where s.token = ${token} and s.expires_at > now() and u.is_active`;
  if (rows.length === 0) return null;
  const r = rows[0]!;
  return { userId: Number(r.id), telegramId: Number(r.telegram_id), firstName: r.first_name };
}

// --- feedovi i pretrage ---

/** Nađe ili napravi feed za dati (normalizovani) filter. */
export async function ensureFeed(params: FilterParams): Promise<{ id: number }> {
  const normalized = normalizeFilter(params);
  const hash = filterHash(normalized);
  const rows = await sql`
    insert into feeds (params, params_hash)
    values (${sql.json(normalized)}, ${hash})
    on conflict (params_hash) do update set params_hash = excluded.params_hash
    returning id`;
  return { id: Number(rows[0]!.id) };
}

export async function countSearches(userId: number): Promise<number> {
  const rows = await sql`select count(*)::int as n from searches where user_id = ${userId}`;
  return Number(rows[0]!.n);
}

export async function createSearch(
  userId: number,
  feedId: number,
  name: string
): Promise<{ id: number }> {
  const rows = await sql`
    insert into searches (user_id, feed_id, name)
    values (${userId}, ${feedId}, ${name})
    returning id`;
  return { id: Number(rows[0]!.id) };
}

export interface SearchRow {
  id: number;
  name: string;
  isEnabled: boolean;
  params: FilterParams;
  createdAt: string;
  lastNotifiedAt: string | null;
}

export async function listSearches(userId: number): Promise<SearchRow[]> {
  const rows = await sql`
    select s.id, s.name, s.is_enabled, s.created_at, s.last_notified_at, f.params
    from searches s join feeds f on f.id = s.feed_id
    where s.user_id = ${userId}
    order by s.created_at desc`;
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    isEnabled: r.is_enabled,
    params: r.params,
    createdAt: r.created_at.toISOString(),
    lastNotifiedAt: r.last_notified_at ? r.last_notified_at.toISOString() : null,
  }));
}

export async function setSearchEnabled(
  userId: number,
  searchId: number,
  enabled: boolean
): Promise<boolean> {
  const rows = await sql`
    update searches set is_enabled = ${enabled}
    where id = ${searchId} and user_id = ${userId}
    returning id`;
  return rows.length > 0;
}

export async function deleteSearch(userId: number, searchId: number): Promise<boolean> {
  const rows = await sql`
    delete from searches where id = ${searchId} and user_id = ${userId} returning feed_id`;
  if (rows.length === 0) return false;
  // počisti feed ako ga više niko ne koristi
  await sql`
    delete from feeds f
    where f.id = ${rows[0]!.feed_id}
      and not exists (select 1 from searches s where s.feed_id = f.id)`;
  return true;
}

// --- katalog ---

export async function replaceCatalogBase(catalog: {
  categories: { id: number; name: string; kind: string }[];
  groups: { id: number; name: string; parentId: number }[];
  locations: { id: number; name: string; big: boolean }[];
}): Promise<void> {
  await sql.begin(async (tx) => {
    for (const c of catalog.categories) {
      await tx`
        insert into kp_categories (id, name, kind) values (${c.id}, ${c.name}, ${c.kind})
        on conflict (id) do update set name = excluded.name, kind = excluded.kind`;
    }
    for (const g of catalog.groups) {
      await tx`
        insert into kp_groups (id, name, category_id) values (${g.id}, ${g.name}, ${g.parentId})
        on conflict (id) do update set name = excluded.name, category_id = excluded.category_id`;
    }
    for (const l of catalog.locations) {
      await tx`
        insert into kp_locations (id, name, big) values (${l.id}, ${l.name}, ${l.big})
        on conflict (id) do update set name = excluded.name, big = excluded.big`;
    }
    await tx`
      insert into catalog_meta (key, updated_at) values ('base', now())
      on conflict (key) do update set updated_at = now()`;
  });
}

export async function replaceCategoryAttributes(
  categoryId: number,
  attrs: {
    code: string;
    displayName: string;
    isMultiSelect: boolean;
    dataType: string;
    uiControl: string;
    sortOrder: number;
  }[]
): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`delete from kp_attributes where category_id = ${categoryId}`;
    for (const a of attrs) {
      await tx`
        insert into kp_attributes (category_id, code, display_name, is_multi, data_type, ui_control, sort_order)
        values (${categoryId}, ${a.code}, ${a.displayName}, ${a.isMultiSelect}, ${a.dataType}, ${a.uiControl}, ${a.sortOrder})`;
    }
  });
}

export async function catalogAgeHours(): Promise<number | null> {
  const rows = await sql`select updated_at from catalog_meta where key = 'base'`;
  if (rows.length === 0) return null;
  return (Date.now() - rows[0]!.updated_at.getTime()) / 3_600_000;
}
