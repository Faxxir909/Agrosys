import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mapBcrPriceToMarketPrice } from '../bcrMapper.ts';

describe('BcrMapper Unit Tests', () => {
  test('Mapea correctamente cotización oficial de Soja (id: 21)', () => {
    const raw = {
      id_Pizarra: 101,
      id_Grano: 21,
      descripcion_Grano: 'Soja',
      mercado: 'Rosario',
      fecha_Operacion_Pizarra: '2026-09-16T00:00:00',
      precio_Cotizacion: 558000,
      cotizacion_Dolar: 1497.5,
      esEstimado_Cotizacion: false,
      variacion: 2000,
      sentido_Variacion: 'ALZA',
    };

    const mapped = mapBcrPriceToMarketPrice(raw);
    assert.ok(mapped);
    assert.equal(mapped.grain, 'soja');
    assert.equal(mapped.market, 'Rosario');
    assert.equal(mapped.priceArs, 558000);
    assert.equal(mapped.exchangeRate, 1497.5);
    // 558000 / 1497.5 = 372.62
    assert.equal(mapped.priceUsd, 372.62);
    assert.equal(mapped.isEstimated, false);
    assert.equal(mapped.variationArs, 2000);
    assert.equal(mapped.movement, 1);
    assert.equal(mapped.priceDate, '2026-09-16');
  });

  test('Mapea cotización con estimativo en true', () => {
    const raw = {
      id_Grano: 1,
      descripcion_Grano: 'Trigo',
      fecha_Operacion_Pizarra: '2026-09-15',
      precio_Cotizacion: 280000,
      cotizacion_Dolar: 1400,
      esEstimado_Cotizacion: 'SI',
      variacion: -1500,
      sentido_Variacion: 'BAJA',
    };

    const mapped = mapBcrPriceToMarketPrice(raw);
    assert.ok(mapped);
    assert.equal(mapped.grain, 'trigo');
    assert.equal(mapped.isEstimated, true);
    assert.equal(mapped.movement, -1);
    assert.equal(mapped.variationArs, -1500);
  });

  test('Mapea los 5 granos oficiales por ID', () => {
    const grains = [
      { id: 1, expected: 'trigo' },
      { id: 2, expected: 'maiz' },
      { id: 3, expected: 'sorgo' },
      { id: 20, expected: 'girasol' },
      { id: 21, expected: 'soja' },
    ];

    for (const g of grains) {
      const raw = {
        id_Grano: g.id,
        precio_Cotizacion: 100000,
        fecha_Operacion_Pizarra: '2026-09-16',
      };
      const res = mapBcrPriceToMarketPrice(raw);
      assert.ok(res);
      assert.equal(res.grain, g.expected);
    }
  });

  test('Ignora granos no monitoreados o IDs desconocidos retornando null', () => {
    const raw = {
      id_Grano: 999, // Grano no soportado
      precio_Cotizacion: 100000,
    };
    const res = mapBcrPriceToMarketPrice(raw);
    assert.equal(res, null);
  });
});
