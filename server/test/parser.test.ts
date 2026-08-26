import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSearchResult, parseCatalog, KpParseError, extractNextData } from '../src/kp/parser.ts';

const mobilni = readFileSync(new URL('./fixtures/search-mobilni.html', import.meta.url), 'utf-8');
const automobili = readFileSync(
  new URL('./fixtures/search-automobili.html', import.meta.url),
  'utf-8'
);

test('parseSearchResult vraća oglase sa svim ključnim poljima', () => {
  const r = parseSearchResult(mobilni);
  assert.equal(r.ads.length, 30);
  assert.ok(r.total > 1000);
  assert.ok(r.pages > 10);
  for (const ad of r.ads) {
    assert.ok(ad.id > 0);
    assert.ok(ad.name.length > 0);
    assert.ok(ad.adUrl.startsWith('/'));
    assert.match(ad.postedRaw, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    assert.equal(ad.categoryId, 23);
  }
  // bar neki oglas ima cenu i sliku
  assert.ok(r.ads.some((a) => a.priceNumber > 0));
  assert.ok(r.ads.some((a) => a.image.startsWith('https://')));
});

test('parseSearchResult dekodira filterName entitete', () => {
  const r = parseSearchResult(automobili);
  assert.ok(r.filterName.includes('€'), `filterName: ${r.filterName}`);
  assert.ok(!r.filterName.includes('&euro;'));
});

test('parseCatalog vraća kategorije, grupe, lokacije', () => {
  const c = parseCatalog(mobilni);
  assert.ok(c.categories.length > 20);
  assert.ok(c.categories.some((x) => x.name === 'Mobilni telefoni'));
  assert.ok(c.groups.some((g) => g.parentId === 23 && g.name === 'Nokia'));
  assert.ok(c.locations.some((l) => l.name === 'Beograd' && l.big));
});

test('parseCatalog vraća dinamičke atribute za automobile', () => {
  const c = parseCatalog(automobili);
  const attrs = c.attributes['2919'];
  assert.ok(attrs && attrs.length > 0, 'očekujem atribute za categoryId 2919');
  const codes = attrs.map((a) => a.code);
  assert.ok(codes.includes('carModel'), `codes: ${codes.join(',')}`);
});

test('extractNextData baca KpParseError na HTML bez __NEXT_DATA__', () => {
  assert.throws(() => extractNextData('<html><body>captcha</body></html>'), KpParseError);
});
