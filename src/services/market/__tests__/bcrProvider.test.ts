import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { BcrGixMarketPriceProvider } from '../bcrProvider.ts';
import { bcrAuthService } from '../bcrAuthService.ts';
import type { MarketPrice } from '../types.ts';

describe('BcrGixMarketPriceProvider Unit Tests', () => {
  let provider: BcrGixMarketPriceProvider;

  beforeEach(() => {
    provider = BcrGixMarketPriceProvider.getInstance();
  });

  test('createDateChunks divide un rango de 20 días en bloques de <= 7 días', () => {
    const start = new Date('2026-09-01T00:00:00Z');
    const end = new Date('2026-09-20T00:00:00Z');

    const chunks = (provider as any).createDateChunks(start, end, 7);

    assert.ok(chunks.length >= 3);
    for (const chunk of chunks) {
      const fromDate = new Date(chunk.from);
      const toDate = new Date(chunk.to);
      const diffDays = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
      assert.ok(diffDays <= 7, `Chunk ${chunk.from} - ${chunk.to} excedió 7 días (${diffDays})`);
    }
  });

  test('deduplicateLatestByGrain preserva solo la última cotización por grano', () => {
    const prices: MarketPrice[] = [
      {
        grain: 'soja',
        market: 'Rosario',
        priceArs: 400000,
        priceUsd: 280,
        variationArs: 0,
        movement: 0,
        isEstimated: false,
        exchangeRate: 1400,
        priceDate: '2026-09-10',
        source: 'BCR_GIX',
      },
      {
        grain: 'soja',
        market: 'Rosario',
        priceArs: 420000,
        priceUsd: 290,
        variationArs: 20000,
        movement: 1,
        isEstimated: false,
        exchangeRate: 1450,
        priceDate: '2026-09-15',
        source: 'BCR_GIX',
      },
      {
        grain: 'maiz',
        market: 'Rosario',
        priceArs: 200000,
        priceUsd: 180,
        variationArs: 0,
        movement: 0,
        isEstimated: false,
        exchangeRate: 1450,
        priceDate: '2026-09-15',
        source: 'BCR_GIX',
      },
    ];

    const deduplicated = (provider as any).deduplicateLatestByGrain(prices);
    assert.equal(deduplicated.length, 2);

    const soja = deduplicated.find((p: any) => p.grain === 'soja');
    assert.ok(soja);
    assert.equal(soja.priceDate, '2026-09-15');
    assert.equal(soja.priceArs, 420000);
  });

  test('getCurrentPrices arroja error si las credenciales no están configuradas', async () => {
    delete process.env.BCR_API_KEY;
    delete process.env.BCR_API_SECRET;

    await assert.rejects(
      async () => {
        await provider.getCurrentPrices();
      },
      /Credenciales BCR no configuradas/
    );
  });
});
