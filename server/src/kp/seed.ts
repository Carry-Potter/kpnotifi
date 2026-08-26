/**
 * Punjenje/osvežavanje KP kataloga u bazu — pokreće se sa RAZVOJNE mašine
 * (KP datacenter IP adresama servira stranice bez kataloga, pa produkcija
 * ovo ne može sama):
 *
 *   DATABASE_URL=<neon-string> npm run catalog:seed
 *
 * Povlači osnovni katalog + grupe i atribute za sve kategorije (1 KP zahtev
 * po kategoriji, uz throttle). Bezbedno za ponavljanje: postojeće preskače,
 * osim uz --force koji osvežava sve.
 */
import { sql } from '../db/index.ts';
import { runMigrations } from '../db/migrate.ts';
import { fetchCatalog } from './client.ts';
import { replaceCatalogBase, replaceCategoryAttributes } from '../db/repo.ts';

const force = process.argv.includes('--force');

await runMigrations();

console.log('osnovni katalog...');
const base = await fetchCatalog(23);
if (base.categories.length < 10) {
  console.error('KP je vratio prazan katalog — pokreni sa mašine/mreže gde kp:probe radi.');
  process.exit(1);
}
await replaceCatalogBase(base);
console.log(`  ${base.categories.length} kategorija, ${base.locations.length} lokacija`);

const cats = await sql`select id, name from kp_categories order by id`;
let done = 0;
for (const c of cats) {
  if (!force) {
    const [have] = await sql`select count(*)::int n from kp_groups where category_id = ${c.id}`;
    if (have!.n > 0) continue;
  }
  try {
    const catalog = await fetchCatalog(Number(c.id));
    const groups = catalog.groups.filter((g) => g.parentId === Number(c.id));
    for (const g of groups) {
      await sql`
        insert into kp_groups (id, name, category_id) values (${g.id}, ${g.name}, ${g.parentId})
        on conflict (id) do update set name = excluded.name, category_id = excluded.category_id`;
    }
    await replaceCategoryAttributes(Number(c.id), catalog.attributes[String(c.id)] ?? []);
    done++;
    console.log(`  ${c.name}: ${groups.length} grupa`);
  } catch (err: any) {
    console.error(`  ${c.name}: GREŠKA — ${err.message}`);
  }
}

const [g] = await sql`select count(*)::int n from kp_groups`;
const [a] = await sql`select count(*)::int n from kp_attributes`;
console.log(`GOTOVO: ${done} kategorija obrađeno; ukupno ${g!.n} grupa, ${a!.n} atributa.`);
await sql.end();
