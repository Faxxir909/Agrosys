import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBcrPublicBoard, fetchBcrPublicPrices } from '../bcrPublicProvider.ts';

// Actual official publication captured on 2026-09-16; no model-generated prices.
const html = readFileSync(new URL('./fixtures/cac-2026-09-15.html', import.meta.url), 'utf8');
const now = new Date('2026-09-16T15:00:00Z');

test('official board preserves original ARS, published USD, date and estimated status', () => {
  const prices = parseBcrPublicBoard(html, now);
  assert.equal(prices.length, 5);
  const soja = prices.find(p => p.grain === 'soja')!;
  assert.equal(soja.priceArs, 558000);
  assert.equal(soja.priceUsd, 372.62);
  assert.equal(soja.exchangeRate, 1497.5);
  assert.equal(soja.priceDate, '2026-09-15');
  assert.equal(soja.source, 'BCR_CAC_WEB');
  assert.equal(soja.isEstimated, false);
  const girasol = prices.find(p => p.grain === 'girasol')!;
  assert.equal(girasol.isEstimated, true);
  assert.equal(girasol.priceArs, 756230);
});

test('S/C without an estimate remains null rather than zero', () => {
  const noQuote = html.replace('$335.400,00', 'S/C').replace('223,97', 'S/C');
  const trigo = parseBcrPublicBoard(noQuote, now).find(p => p.grain === 'trigo')!;
  assert.equal(trigo.priceArs, null);
  assert.equal(trigo.priceUsd, null);
  assert.equal(trigo.isEstimated, false);
});

for (const [label, change] of [
  ['missing grain', (s: string) => s.replace('board-soja', 'board-other')],
  ['missing date', (s: string) => s.replace('Precios Pizarra del día', 'Error')],
  ['historic publication', (s: string) => s.replaceAll('15/09/2026', '10/08/2020')],
  ['future date', (s: string) => s.replaceAll('15/09/2026', '15/09/2027')],
  ['invalid date', (s: string) => s.replaceAll('15/09/2026', '31/02/2026')],
  ['inconsistent conversion', (s: string) => s.replace('372,62', '999,99')],
  ['missing exchange rate', (s: string) => s.replace('TC BNA Divisas', 'Cambio')],
  ['missing USD', (s: string) => s.replace('372,62', '')],
  ['unrecognized number', (s: string) => s.replace('$558.000,00', '$NaN')],
] as const) {
  test(`rejects ${label} instead of publishing unverified values`, () => {
    assert.throws(() => parseBcrPublicBoard(change(html), now));
  });
}

test('upstream HTTP errors are not treated as market data', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('Unavailable', { status: 503 }));
  await assert.rejects(fetchBcrPublicPrices(), /HTTP 503/);
});
