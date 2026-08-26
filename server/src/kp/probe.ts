/**
 * CLI provera parsera na živom KP-u:
 *   npm run kp:probe -- "https://www.kupujemprodajem.com/pretraga?categoryId=23"
 * Bez argumenta koristi kategoriju Mobilni telefoni.
 */
import { parseKpUrl, buildSearchUrl } from './filters.ts';
import { searchAds } from './client.ts';

const arg = process.argv[2];
const params = arg ? parseKpUrl(arg) : { categoryId: '23' };

console.log('Filter:', JSON.stringify(params));
console.log('URL:   ', buildSearchUrl(params));

const result = await searchAds(params);
console.log(`\nKP filter opis: ${result.filterName}`);
console.log(`Ukupno: ${result.total} oglasa, ${result.pages} strana. Prvih ${result.ads.length}:\n`);
for (const ad of result.ads.slice(0, 10)) {
  console.log(
    `#${ad.id} [${ad.postedRaw}] ${ad.priceText.padStart(12)} | ${ad.location.padEnd(15)} | ${ad.name}`
  );
}
