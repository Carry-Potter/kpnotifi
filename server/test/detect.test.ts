import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectNewAds, parsePostedRaw } from '../src/jobs/detect.ts';
import type { KpAd } from '../src/kp/types.ts';

function ad(id: number, postedRaw: string): KpAd {
  return {
    id,
    name: `oglas ${id}`,
    priceNumber: 100,
    currency: 'eur',
    priceText: '100 €',
    location: 'Beograd',
    condition: '',
    conditionId: '',
    type: 'sell',
    categoryId: 23,
    categoryName: '',
    groupId: 0,
    groupName: '',
    image: '',
    adUrl: `/oglas/${id}`,
    postedRaw,
    descriptionSnippet: '',
  };
}

const feedCreatedAt = new Date('2026-08-10T12:00:00');

test('parsePostedRaw parsira KP format, odbija ostalo', () => {
  const d = parsePostedRaw('2026-08-16 08:38:04');
  assert.ok(d && d.getFullYear() === 2026 && d.getMonth() === 7 && d.getDate() === 16);
  assert.equal(parsePostedRaw('danas'), null);
  assert.equal(parsePostedRaw(''), null);
});

test('nov oglas: neviđen i objavljen posle nastanka feeda', () => {
  const fresh = ad(2, '2026-08-15 10:00:00');
  const result = detectNewAds({
    ads: [ad(1, '2026-08-01 10:00:00'), fresh],
    seenIds: new Set([1]),
    feedCreatedAt,
  });
  assert.deepEqual(result.map((a) => a.id), [2]);
});

test('obnovljen star oglas (neviđen ali objavljen davno pre feeda) se NE računa', () => {
  const result = detectNewAds({
    ads: [ad(3, '2026-07-01 10:00:00')],
    seenIds: new Set(),
    feedCreatedAt,
  });
  assert.deepEqual(result, []);
});

test('tolerancija 24h: oglas od juče u odnosu na feed prolazi', () => {
  const result = detectNewAds({
    ads: [ad(4, '2026-08-09 18:00:00')],
    seenIds: new Set(),
    feedCreatedAt,
  });
  assert.deepEqual(result.map((a) => a.id), [4]);
});

test('već viđen oglas se ne šalje ponovo, ma koliko nov bio', () => {
  const result = detectNewAds({
    ads: [ad(5, '2026-08-16 10:00:00')],
    seenIds: new Set([5]),
    feedCreatedAt,
  });
  assert.deepEqual(result, []);
});

test('neparsiv datum -> radije pošalji nego prećuti', () => {
  const result = detectNewAds({
    ads: [ad(6, 'danas')],
    seenIds: new Set(),
    feedCreatedAt,
  });
  assert.deepEqual(result.map((a) => a.id), [6]);
});
