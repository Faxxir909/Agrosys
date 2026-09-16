import { dbQuery, dbTransaction, isDbSimulated, simulatedDb } from '../../../server_db.ts';
import { notifyClients } from '../realtime.ts';
import { BCR_PIZARRA_URL, BCR_PUBLIC_SOURCE, fetchBcrPublicPrices } from './bcrPublicProvider.ts';
import {
  GRAIN_DISPLAY_NAMES,
  type GrainCode,
  type HistoricalPriceParams,
  type MarketPrice,
  type MarketSyncLog,
} from './types.ts';

export interface MarketRosarioResponse {
  success: boolean;
  market: 'Rosario';
  source: 'BCR_CAC_WEB';
  sourceUrl: string;
  priceDate: string | null;
  lastSync: string | null;
  stale: boolean;
  unconfigured?: boolean;
  message?: string;
  products: Array<{
    grain: GrainCode;
    name: string;
    priceArs: number | null;
    priceUsd: number | null;
    variationArs: number | null;
    movement: number | null;
    isEstimated: boolean;
    exchangeRate: number | null;
    priceDate: string;
  }>;
}

export interface IntegrationStatusResponse {
  provider: 'BCR_CAC_WEB';
  connected: boolean;
  configured: boolean;
  lastSuccessfulSync: string | null;
  lastPriceDate: string | null;
  products: number;
  message?: string;
}

export class MarketService {
  private static instance: MarketService;
  private isSyncing = false;
  private lastAttempt = 0;
  private lastSyncFailed = false;

  private constructor() {}

  public static getInstance(): MarketService {
    if (!MarketService.instance) {
      MarketService.instance = new MarketService();
    }
    return MarketService.instance;
  }

  /**
   * Sincroniza las cotizaciones oficiales de la BCR con la base de datos PostgreSQL.
   * Publicación CAC -> validación estricta -> UPSERT transaccional -> registro de sincronización.
   */
  public async syncBcrRosarioPrices(daysBack: number = 7): Promise<{
    success: boolean;
    received: number;
    saved: number;
    priceDate?: string;
    message?: string;
  }> {
    if (this.isSyncing) {
      console.log('[BCR] Sync already in progress, skipping duplicate call.');
      return { success: false, received: 0, saved: 0, message: 'Sincronización ya en curso' };
    }

    this.isSyncing = true;
    const startedAt = new Date();
    console.log(`[BCR] Starting market price sync (daysBack: ${daysBack})...`);

    this.lastAttempt = Date.now();
    try {
      // The public board contains one market date. Never fabricate a historical backfill.
      const prices = await fetchBcrPublicPrices();
      let savedCount = 0;

      if (isDbSimulated()) {
        for (const price of prices) await this.upsertMarketPrice(price);
      } else {
        await dbTransaction(async query => {
          for (const price of prices) await this.upsertMarketPrice(price, query);
        });
      }
      savedCount = prices.length;

      const latestDate = prices[0]?.priceDate || new Date().toISOString().split('T')[0];

      await this.logSyncRecord({
        provider: BCR_PUBLIC_SOURCE,
        startedAt,
        finishedAt: new Date(),
        status: 'success',
        recordsReceived: prices.length,
        recordsSaved: savedCount,
      });

      console.log(`[BCR] Saved ${savedCount} market prices. Sync completed successfully.`);

      // Notificar a clientes conectados vía WebSockets
      notifyClients('market-prices', {
        priceDate: latestDate,
        updatedAt: new Date().toISOString(),
        count: savedCount,
      });

      this.isSyncing = false;
      this.lastSyncFailed = false;
      return { success: true, received: prices.length, saved: savedCount, priceDate: latestDate };
    } catch (err: any) {
      const safeErrorMsg = (err.message || 'Error desconocido').slice(0, 200);
      console.error('[BCR] Sync failed:', safeErrorMsg);

      await this.logSyncRecord({
        provider: BCR_PUBLIC_SOURCE,
        startedAt,
        finishedAt: new Date(),
        status: 'error',
        recordsReceived: 0,
        recordsSaved: 0,
        errorCode: 'SYNC_ERROR',
        errorMessageSafe: safeErrorMsg,
      });

      this.isSyncing = false;
      this.lastSyncFailed = true;
      return { success: false, received: 0, saved: 0, message: safeErrorMsg };
    }
  }

  /**
   * Guarda o actualiza una cotización en PostgreSQL aplicando UPSERT.
   */
  public async upsertMarketPrice(price: MarketPrice, execute = dbQuery): Promise<void> {
    if (isDbSimulated()) {
      const idx = simulatedDb.grain_market_prices.findIndex(
        p => p.grain === price.grain && p.market === price.market && p.priceDate === price.priceDate
      );
      if (idx >= 0) {
        simulatedDb.grain_market_prices[idx] = { ...price, updatedAt: new Date() };
      } else {
        simulatedDb.grain_market_prices.push({ ...price, createdAt: new Date(), updatedAt: new Date() });
      }
      return;
    }

    const query = `
      INSERT INTO grain_market_prices (
        external_id, grain, market, price_ars, price_usd,
        variation_ars, movement, is_estimated, exchange_rate,
        price_date, source, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      ON CONFLICT (grain, market, price_date)
      DO UPDATE SET
        external_id = EXCLUDED.external_id,
        price_ars = EXCLUDED.price_ars,
        price_usd = EXCLUDED.price_usd,
        variation_ars = EXCLUDED.variation_ars,
        movement = EXCLUDED.movement,
        is_estimated = EXCLUDED.is_estimated,
        exchange_rate = EXCLUDED.exchange_rate,
        source = EXCLUDED.source,
        updated_at = NOW();
    `;

    const values = [
      price.externalId,
      price.grain,
      price.market,
      price.priceArs,
      price.priceUsd,
      price.variationArs,
      price.movement,
      price.isEstimated,
      price.exchangeRate,
      price.priceDate,
      price.source,
    ];

    await execute(query, values);
  }

  /**
   * Obtiene los precios actuales para la Pizarra Rosario desde PostgreSQL.
   */
  public async getRosarioCurrentPrices(): Promise<MarketRosarioResponse> {
    if (Date.now() - this.lastAttempt > 15 * 60 * 1000) {
      await this.syncBcrRosarioPrices(1);
    }
    let rows: any[] = [];
    let lastSync: string | null = null;

    if (isDbSimulated()) {
      rows = simulatedDb.grain_market_prices.filter(p => p.source === BCR_PUBLIC_SOURCE);
      const lastLog = simulatedDb.market_sync_logs[simulatedDb.market_sync_logs.length - 1];
      lastSync = lastLog?.finishedAt?.toISOString() || null;
    } else {
      const res = await dbQuery(`
        SELECT DISTINCT ON (grain)
          id, external_id as "externalId", grain, market,
          price_ars as "priceArs", price_usd as "priceUsd",
          variation_ars as "variationArs", movement,
          is_estimated as "isEstimated", exchange_rate as "exchangeRate",
          TO_CHAR(price_date, 'YYYY-MM-DD') as "priceDate",
          source, updated_at as "updatedAt"
        FROM grain_market_prices
        WHERE market = 'Rosario' AND source = 'BCR_CAC_WEB'
        ORDER BY grain, price_date DESC, updated_at DESC
      `);
      rows = res.rows;

      const logRes = await dbQuery(`
        SELECT finished_at as "finishedAt"
        FROM market_sync_logs
        WHERE status = 'success' AND provider = 'BCR_CAC_WEB'
        ORDER BY started_at DESC
        LIMIT 1
      `);
      if (logRes.rows[0]?.finishedAt) {
        lastSync = new Date(logRes.rows[0].finishedAt).toISOString();
      }
    }

    // Identificar si la información está desactualizada (más de 36 horas en día hábil)
    let latestPriceDate: string | null = null;
    const grainsOrder: GrainCode[] = ['soja', 'maiz', 'trigo', 'sorgo', 'girasol'];
    const productsMap = new Map<GrainCode, any>();

    for (const r of rows) {
      const g = r.grain as GrainCode;
      if (grainsOrder.includes(g)) {
        productsMap.set(g, {
          grain: g,
          name: GRAIN_DISPLAY_NAMES[g] || g,
          priceArs: r.priceArs !== null ? Number(r.priceArs) : null,
          priceUsd: r.priceUsd !== null ? Number(r.priceUsd) : null,
          variationArs: r.variationArs !== null ? Number(r.variationArs) : null,
          movement: r.movement !== null ? Number(r.movement) : null,
          isEstimated: Boolean(r.isEstimated),
          exchangeRate: r.exchangeRate !== null ? Number(r.exchangeRate) : null,
          priceDate: r.priceDate,
        });

        if (!latestPriceDate || r.priceDate > latestPriceDate) {
          latestPriceDate = r.priceDate;
        }
      }
    }

    // Armar lista homogénea en orden canónico
    const products = grainsOrder.map(g => {
      return (
        productsMap.get(g) || {
          grain: g,
          name: GRAIN_DISPLAY_NAMES[g],
          priceArs: null,
          priceUsd: null,
          variationArs: null,
          movement: null,
          isEstimated: false,
          exchangeRate: null,
          priceDate: latestPriceDate || new Date().toISOString().split('T')[0],
        }
      );
    });

    const isStale = this.lastSyncFailed || this.checkIfStale(latestPriceDate);

    let message: string | undefined;
    if (!latestPriceDate) {
      message = 'No se pudo obtener una publicación oficial de BCR. Reintente más tarde.';
    } else if (isStale) {
      message = '⚠ Temporalmente mostrando la última rueda oficial disponible de la Cámara Arbitral de Cereales.';
    }

    return {
      success: Boolean(latestPriceDate),
      market: 'Rosario',
      source: BCR_PUBLIC_SOURCE,
      sourceUrl: BCR_PIZARRA_URL,
      priceDate: latestPriceDate,
      lastSync,
      stale: isStale,
      unconfigured: false,
      message,
      products,
    };
  }

  /**
   * Obtiene histórico de cotizaciones de Rosario para un grano determinado.
   */
  public async getRosarioHistory(params: HistoricalPriceParams): Promise<MarketPrice[]> {
    const grain = params.grain || null;
    const days = Number(params.days) || 30;

    if (isDbSimulated()) {
      return simulatedDb.grain_market_prices
        .filter(p => (!grain || p.grain === grain) && p.market === 'Rosario' && p.source === BCR_PUBLIC_SOURCE)
        .sort((a, b) => a.priceDate.localeCompare(b.priceDate))
        .slice(-days);
    }

    const res = await dbQuery(
      `
      SELECT
        id, external_id as "externalId", grain, market,
        price_ars as "priceArs", price_usd as "priceUsd",
        variation_ars as "variationArs", movement,
        is_estimated as "isEstimated", exchange_rate as "exchangeRate",
        TO_CHAR(price_date, 'YYYY-MM-DD') as "priceDate",
        source, created_at as "createdAt", updated_at as "updatedAt"
      FROM grain_market_prices
      WHERE ($1::text IS NULL OR grain = $1) AND market = 'Rosario' AND source = 'BCR_CAC_WEB' AND price_date >= (CURRENT_DATE - ($2 || ' days')::INTERVAL)
      ORDER BY price_date ASC
    `,
      [grain, days]
    );

    return res.rows.map((r: any) => ({
      id: r.id,
      externalId: r.externalId !== null ? Number(r.externalId) : null,
      grain: r.grain,
      market: r.market,
      priceArs: r.priceArs !== null ? Number(r.priceArs) : null,
      priceUsd: r.priceUsd !== null ? Number(r.priceUsd) : null,
      variationArs: r.variationArs !== null ? Number(r.variationArs) : null,
      movement: r.movement !== null ? Number(r.movement) : null,
      isEstimated: Boolean(r.isEstimated),
      exchangeRate: r.exchangeRate !== null ? Number(r.exchangeRate) : null,
      priceDate: r.priceDate,
      source: r.source,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /**
   * Obtiene la cotización oficial más reciente para un grano determinado.
   */
  public async getLatestPizarraPriceForGrain(grainInput: string): Promise<MarketPrice | null> {
    const grain = grainInput.toLowerCase().trim() as GrainCode;
    if (isDbSimulated()) {
      const matches = simulatedDb.grain_market_prices
        .filter((p: any) => p.grain === grain && p.market === 'Rosario' && p.source === BCR_PUBLIC_SOURCE)
        .sort((a: any, b: any) => b.priceDate.localeCompare(a.priceDate));
      return matches[0] || null;
    }

    const res = await dbQuery(
      `
      SELECT
        id, external_id as "externalId", grain, market,
        price_ars as "priceArs", price_usd as "priceUsd",
        variation_ars as "variationArs", movement,
        is_estimated as "isEstimated", exchange_rate as "exchangeRate",
        TO_CHAR(price_date, 'YYYY-MM-DD') as "priceDate",
        source, created_at as "createdAt", updated_at as "updatedAt"
      FROM grain_market_prices
      WHERE grain = $1 AND market = 'Rosario' AND source = 'BCR_CAC_WEB'
      ORDER BY price_date DESC
      LIMIT 1
    `,
      [grain]
    );

    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      externalId: r.externalId !== null ? Number(r.externalId) : null,
      grain: r.grain,
      market: r.market,
      priceArs: r.priceArs !== null ? Number(r.priceArs) : null,
      priceUsd: r.priceUsd !== null ? Number(r.priceUsd) : null,
      variationArs: r.variationArs !== null ? Number(r.variationArs) : null,
      movement: r.movement !== null ? Number(r.movement) : null,
      isEstimated: Boolean(r.isEstimated),
      exchangeRate: r.exchangeRate !== null ? Number(r.exchangeRate) : null,
      priceDate: r.priceDate,
      source: r.source,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  /**
   * Devuelve el estado técnico y conectividad de la integración BCR GIX.
   */
  public async getIntegrationStatus(): Promise<IntegrationStatusResponse> {
    const configured = true; // Public CAC publication requires no API credentials.
    let lastSync: string | null = null;
    let lastPriceDate: string | null = null;
    let productsCount = 0;

    if (isDbSimulated()) {
      productsCount = simulatedDb.grain_market_prices.length;
    } else {
      const logRes = await dbQuery(`
        SELECT finished_at as "finishedAt"
        FROM market_sync_logs
        WHERE status = 'success' AND provider = 'BCR_CAC_WEB'
        ORDER BY started_at DESC
        LIMIT 1
      `);
      if (logRes.rows[0]?.finishedAt) {
        lastSync = new Date(logRes.rows[0].finishedAt).toISOString();
      }

      const countRes = await dbQuery(`
        SELECT COUNT(DISTINCT grain) as count, MAX(price_date) as "maxDate"
        FROM grain_market_prices
        WHERE market = 'Rosario' AND source = 'BCR_CAC_WEB'
      `);
      productsCount = Number(countRes.rows[0]?.count || 0);
      if (countRes.rows[0]?.maxDate) {
        lastPriceDate = new Date(countRes.rows[0].maxDate).toISOString().split('T')[0];
      }
    }

    return {
      provider: BCR_PUBLIC_SOURCE,
      connected: Boolean(lastSync) && !this.lastSyncFailed,
      configured,
      lastSuccessfulSync: lastSync,
      lastPriceDate,
      products: productsCount,
      message: lastSync && !this.lastSyncFailed
        ? 'Publicación oficial CAC-BCR sincronizada'
        : 'Publicación oficial CAC-BCR pendiente de sincronización',
    };
  }

  private async logSyncRecord(record: MarketSyncLog): Promise<void> {
    if (isDbSimulated()) {
      simulatedDb.market_sync_logs.push(record);
      return;
    }

    try {
      await dbQuery(
        `
        INSERT INTO market_sync_logs (
          provider, started_at, finished_at, status,
          records_received, records_saved, error_code, error_message_safe
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
        [
          record.provider,
          record.startedAt,
          record.finishedAt || null,
          record.status,
          record.recordsReceived,
          record.recordsSaved,
          record.errorCode || null,
          record.errorMessageSafe || null,
        ]
      );
    } catch (err) {
      console.error('[BCR] Failed to write market_sync_logs record:', err);
    }
  }

  private checkIfStale(latestPriceDate?: string | null): boolean {
    if (!latestPriceDate) return true;
    const date = new Date(latestPriceDate);
    const now = new Date();
    const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    // Los fines de semana la pizarra no opera, consideramos stale solo si superó 72hs
    const dayOfWeek = now.getDay();
    const thresholdHours = dayOfWeek === 0 || dayOfWeek === 1 ? 72 : 48;
    return diffHours > thresholdHours;
  }
}

export const marketService = MarketService.getInstance();
