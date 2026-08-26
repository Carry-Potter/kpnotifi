/**
 * Sinhronizacija KP kataloga u bazu: kategorije, grupe, lokacije se povlače
 * sa bilo koje stranice pretrage; atributi po kategoriji se dovlače lenjo,
 * tek kad neki korisnik otvori tu kategoriju u builderu.
 */
import { fetchCatalog } from './client.ts';
import {
  catalogAgeHours,
  replaceCatalogBase,
  replaceCategoryAttributes,
} from '../db/repo.ts';
import { sql } from '../db/index.ts';

const MAX_AGE_HOURS = 24;

/** Osveži osnovni katalog ako je stariji od 24h (ili ga nema/prazan je). */
export async function syncCatalogIfStale(): Promise<void> {
  const age = await catalogAgeHours();
  if (age !== null && age < MAX_AGE_HOURS) return;
  console.log('katalog: osvežavam osnovni katalog sa KP-a...');
  // Stranica konkretne kategorije nosi isti globalni katalog, a KP je
  // pouzdanije servira (generička /pretraga ume da stigne "prazna").
  const catalog = await fetchCatalog(23);
  if (catalog.categories.length < 10 || catalog.locations.length < 10) {
    throw new Error(
      `katalog sumnjivo prazan (${catalog.categories.length} kategorija) — ne upisujem`
    );
  }
  await replaceCatalogBase(catalog);
  console.log(
    `katalog: ${catalog.categories.length} kategorija, ${catalog.groups.length} grupa, ${catalog.locations.length} lokacija`
  );
}

/**
 * Vrati atribute za kategoriju; ako ih nema u bazi, dovuci ih sa KP-a.
 * KP šalje definicije atributa samo na stranici te kategorije.
 */
export async function getCategoryAttributes(categoryId: number) {
  const existing = await sql`
    select code, display_name, is_multi, data_type, ui_control, sort_order
    from kp_attributes where category_id = ${categoryId} order by sort_order`;
  if (existing.length > 0) return existing;

  await fetchAndStoreCategory(categoryId);
  return sql`
    select code, display_name, is_multi, data_type, ui_control, sort_order
    from kp_attributes where category_id = ${categoryId} order by sort_order`;
}

/**
 * Vrati podgrupe kategorije (npr. marke telefona); i one stižu samo sa
 * stranice te kategorije, pa se dovlače lenjo i keširaju u bazi.
 */
export async function getCategoryGroups(categoryId: number) {
  const existing = await sql`
    select id, name from kp_groups where category_id = ${categoryId} order by name`;
  if (existing.length > 0) return existing;

  await fetchAndStoreCategory(categoryId);
  return sql`
    select id, name from kp_groups where category_id = ${categoryId} order by name`;
}

/** Jedan KP zahtev puni i grupe i atribute za kategoriju. */
async function fetchAndStoreCategory(categoryId: number): Promise<void> {
  const catalog = await fetchCatalog(categoryId);
  await replaceCategoryAttributes(categoryId, catalog.attributes[String(categoryId)] ?? []);
  const groups = catalog.groups.filter((g) => g.parentId === categoryId);
  for (const g of groups) {
    await sql`
      insert into kp_groups (id, name, category_id) values (${g.id}, ${g.name}, ${g.parentId})
      on conflict (id) do update set name = excluded.name, category_id = excluded.category_id`;
  }
}
