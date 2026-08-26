import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFilter,
  filterHash,
  buildSearchUrl,
  parseKpUrl,
} from '../src/kp/filters.ts';

test('normalizeFilter izbacuje prazne i nebitne parametre i sortira', () => {
  const n = normalizeFilter({
    page: '3',
    order: 'renewDateDesc',
    keywords: '',
    priceTo: '500',
    priceFrom: '100',
    locationIds: '5,1,11',
  });
  assert.deepEqual(n, { locationIds: '1,11,5', priceFrom: '100', priceTo: '500' });
});

test('filterHash je isti za ekvivalentne filtere', () => {
  const a = filterHash({ categoryId: '23', priceFrom: '100', page: '5' });
  const b = filterHash({ priceFrom: '100', categoryId: '23', order: 'priceAsc' });
  assert.equal(a, b);
  const c = filterHash({ categoryId: '23', priceFrom: '200' });
  assert.notEqual(a, c);
});

test('buildSearchUrl pravi /pretraga URL sa order=renewDateDesc', () => {
  const url = buildSearchUrl({ categoryId: '23', groupId: '234' });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, 'https://www.kupujemprodajem.com/pretraga');
  assert.equal(u.searchParams.get('order'), 'renewDateDesc');
  assert.equal(u.searchParams.get('categoryId'), '23');
});

test('parseKpUrl: round-trip kroz buildSearchUrl čuva filter', () => {
  const original = { categoryId: '2919', priceFrom: '2000', priceTo: '6000', currency: 'eur' };
  const parsed = parseKpUrl(buildSearchUrl(original));
  assert.deepEqual(parsed, normalizeFilter(original));
});

test('parseKpUrl prihvata URL sa slug putanjom', () => {
  const p = parseKpUrl(
    'https://www.kupujemprodajem.com/mobilni-telefoni/pretraga?categoryId=23&groupId=74&page=2'
  );
  assert.deepEqual(p, { categoryId: '23', groupId: '74' });
});

test('parseKpUrl spaja ponovljene parametre zarezom', () => {
  const p = parseKpUrl(
    'https://www.kupujemprodajem.com/pretraga?categoryId=23&locationIds=5&locationIds=1'
  );
  assert.equal(p.locationIds, '1,5');
});

test('parseKpUrl odbija strane domene i ne-pretragu', () => {
  assert.throws(() => parseKpUrl('https://www.polovniautomobili.com/pretraga?a=1'));
  assert.throws(() => parseKpUrl('https://www.kupujemprodajem.com/oglas/12345'));
  assert.throws(() => parseKpUrl('nije url'));
});
