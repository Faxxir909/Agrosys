import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateOpportunitySpread,
  formatArsPerTn,
  formatUsdPerTn,
  formatArDate,
} from '../opportunityComparison.ts';
import type { MarketPrice } from '../types.ts';

describe('Opportunity Comparison Unit Tests', () => {
  const mockPizarraSoja: MarketPrice = {
    grain: 'soja',
    market: 'Rosario',
    priceArs: 450000,
    priceUsd: 300,
    variationArs: 5000,
    movement: 1,
    isEstimated: false,
    exchangeRate: 1500,
    priceDate: '2026-09-16',
    source: 'BCR_GIX',
  };

  test('Calcula spread positivo correctamente (+USD 20 / tn)', () => {
    // Ofrecido: 320 vs Pizarra: 300
    const res = calculateOpportunitySpread('soja', 320, 500, mockPizarraSoja);
    assert.ok(res);
    assert.equal(res.offeredPriceUsd, 320);
    assert.equal(res.pizarraPriceUsd, 300);
    assert.equal(res.differenceUsdPerTn, 20);
    // (320 / 300 - 1) * 100 = 6.67%
    assert.equal(res.deviationPct, 6.67);
    // 20 * 500 = 10000 USD
    assert.equal(res.totalImpactUsd, 10000);
    assert.equal(res.isEstimated, false);
    assert.equal(res.source, 'BCR_GIX');
  });

  test('Calcula spread negativo correctamente (-USD 15 / tn)', () => {
    // Ofrecido: 285 vs Pizarra: 300
    const res = calculateOpportunitySpread('soja', 285, 1000, mockPizarraSoja);
    assert.ok(res);
    assert.equal(res.differenceUsdPerTn, -15);
    // (285 / 300 - 1) * 100 = -5%
    assert.equal(res.deviationPct, -5);
    // -15 * 1000 = -15000 USD
    assert.equal(res.totalImpactUsd, -15000);
  });

  test('Retorna null si no hay precio de pizarra o precio ofrecido válido', () => {
    const invalidPizarra: MarketPrice = {
      ...mockPizarraSoja,
      priceUsd: 0,
    };
    assert.equal(calculateOpportunitySpread('soja', 300, 100, invalidPizarra), null);
    assert.equal(calculateOpportunitySpread('soja', 0, 100, mockPizarraSoja), null);
    assert.equal(calculateOpportunitySpread('soja', -10, 100, mockPizarraSoja), null);
  });

  test('Formatea montos en ARS con estándar argentino', () => {
    assert.equal(formatArsPerTn(558000), '$ 558.000 / tn');
    assert.equal(formatArsPerTn(null), 's/c');
  });

  test('Formatea montos en USD con estándar argentino', () => {
    assert.equal(formatUsdPerTn(372.62), 'USD 372,62 / tn');
    assert.equal(formatUsdPerTn(null), 's/c');
  });

  test('Formatea fechas al estándar DD/MM/YYYY', () => {
    assert.equal(formatArDate('2026-09-16'), '16/09/2026');
    assert.equal(formatArDate(''), '');
  });
});
