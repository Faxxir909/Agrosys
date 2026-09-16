import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import express from 'express';
import { signUserToken } from '../../jwt.ts';
import apiRouter from '../../../routes/index.ts';
import { requireAuth } from '../../../middlewares/auth.ts';
import { simulatedDb, initializeDatabase, dbQuery, isDbSimulated } from '../../../../server_db.ts';

describe('Market API Endpoints Integration Tests', () => {
  let server: http.Server;
  let port: number;
  let authToken: string;

  before(async () => {
    try {
      await initializeDatabase();
    } catch (err) {
      console.warn('[Test DB] initializeDatabase info:', err);
    }

    const app = express();
    app.use(express.json());
    app.use('/api', requireAuth);
    app.use('/api', apiRouter);

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address() as any;
        port = addr.port;
        resolve();
      });
    });

    authToken = signUserToken('test-user-id', 'test@agrosys.com');

    // Poblamos simulatedDb con datos de prueba
    simulatedDb.grain_market_prices = [
      {
        id: '1',
        externalId: 101,
        grain: 'soja',
        market: 'Rosario',
        priceArs: 550000,
        priceUsd: 366.67,
        variationArs: 5000,
        movement: 1,
        isEstimated: false,
        exchangeRate: 1500,
        priceDate: '2026-09-16',
        source: 'BCR_GIX',
      },
      {
        id: '2',
        externalId: 102,
        grain: 'maiz',
        market: 'Rosario',
        priceArs: 270000,
        priceUsd: 180,
        variationArs: 0,
        movement: 0,
        isEstimated: true,
        exchangeRate: 1500,
        priceDate: '2026-09-16',
        source: 'BCR_GIX',
      },
    ];

    if (!isDbSimulated()) {
      await dbQuery(`
        INSERT INTO grain_market_prices (
          grain, market, price_ars, price_usd, variation_ars, movement, is_estimated, exchange_rate, price_date, source
        ) VALUES (
          'soja', 'Rosario', 550000, 366.67, 5000, 1, FALSE, 1500, CURRENT_DATE, 'BCR_GIX'
        ) ON CONFLICT (grain, market, price_date) DO UPDATE SET price_usd = EXCLUDED.price_usd
      `);
    }
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  test('GET /api/market/rosario/status responde con estado de integración', async () => {
    const res = await fetch(`http://localhost:${port}/api/market/rosario/status`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.provider, 'BCR_GIX');
    assert.ok(typeof body.connected === 'boolean');
  });

  test('GET /api/market/rosario sin token retorna 401', async () => {
    const res = await fetch(`http://localhost:${port}/api/market/rosario`);
    assert.equal(res.status, 401);
  });

  test('GET /api/market/rosario con token retorna cotizaciones oficiales de Rosario', async () => {
    const res = await fetch(`http://localhost:${port}/api/market/rosario`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.success, true);
    assert.equal(body.market, 'Rosario');
    assert.equal(body.source, 'BCR_GIX');
    assert.ok(Array.isArray(body.products));
    assert.equal(body.products.length, 5); // Soja, Maíz, Trigo, Girasol, Sorgo
  });

  test('GET /api/market/rosario/history devuelve serie histórica', async () => {
    const res = await fetch(`http://localhost:${port}/api/market/rosario/history?grain=soja&days=30`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.success, true);
    assert.equal(body.grain, 'soja');
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 1);
    assert.equal(body.data[0].grain, 'soja');
  });

  test('GET /api/market/compare compara precio ofrecido vs pizarra', async () => {
    const res = await fetch(`http://localhost:${port}/api/market/compare?grain=soja&offeredPrice=380&currency=USD&quantityTn=500`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.success, true);
    assert.equal(body.hasReference, true);
    assert.ok(body.comparison);
    assert.equal(body.comparison.grain, 'soja');
    assert.equal(body.comparison.offeredPriceUsd, 380);
    assert.equal(body.comparison.quantityTn, 500);
    assert.ok(body.comparison.differenceUsdPerTn > 0);
  });
});
