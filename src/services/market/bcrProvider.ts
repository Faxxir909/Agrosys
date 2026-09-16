import { bcrApiClient } from './bcrApiClient.ts';
import { bcrAuthService } from './bcrAuthService.ts';
import { validateBcrPreciosResponse } from './bcrValidation.ts';
import { mapBcrPriceToMarketPrice } from './bcrMapper.ts';
import {
  BCR_GRAIN_IDS,
  type GrainCode,
  type HistoricalPriceParams,
  type MarketPrice,
  type MarketPriceProvider,
} from './types.ts';

export class BcrGixMarketPriceProvider implements MarketPriceProvider {
  private static instance: BcrGixMarketPriceProvider;
  private readonly maxChunkDays = 7; // Límite oficial de rango de consulta en BCR GIX

  private constructor() {}

  public static getInstance(): BcrGixMarketPriceProvider {
    if (!BcrGixMarketPriceProvider.instance) {
      BcrGixMarketPriceProvider.instance = new BcrGixMarketPriceProvider();
    }
    return BcrGixMarketPriceProvider.instance;
  }

  /**
   * Obtiene las cotizaciones más recientes de la Cámara Arbitral de Cereales (Pizarra Rosario).
   */
  public async getCurrentPrices(): Promise<MarketPrice[]> {
    if (!bcrAuthService.isConfigured()) {
      throw new Error('Credenciales BCR no configuradas');
    }

    console.log('[BCR] Fetching Rosario current prices from PreciosCamara...');

    // Intentamos los endpoints oficiales conocidos de PreciosCamara
    const endpoints = ['PreciosCamara', 'api/PreciosCamara', 'gix/PreciosCamara'];
    let lastError: Error | null = null;

    for (const ep of endpoints) {
      try {
        const rawResponse = await bcrApiClient.get<unknown>(ep, {
          params: {
            mercado: 'Rosario',
            // Si el servicio acepta lista de granos
            idGranos: Object.values(BCR_GRAIN_IDS).join(','),
          },
        });

        const items = validateBcrPreciosResponse(rawResponse);
        const mapped = items
          .map(mapBcrPriceToMarketPrice)
          .filter((p): p is MarketPrice => p !== null);

        if (mapped.length > 0) {
          console.log(`[BCR] Received ${mapped.length} products from ${ep}`);
          return this.deduplicateLatestByGrain(mapped);
        }
      } catch (err: any) {
        lastError = err;
        if (err.message?.includes('404')) {
          continue;
        }
        throw err;
      }
    }

    if (lastError) {
      throw lastError;
    }

    return [];
  }

  /**
   * Obtiene cotizaciones históricas aplicando chunking de fechas automático para respetar
   * los límites de rango de la API BCR.
   */
  public async getHistoricalPrices(params: HistoricalPriceParams): Promise<MarketPrice[]> {
    if (!bcrAuthService.isConfigured()) {
      throw new Error('Credenciales BCR no configuradas');
    }

    const days = params.days ?? 30;
    const endDate = params.endDate ? new Date(params.endDate) : new Date();
    const startDate = params.startDate ? new Date(params.startDate) : new Date(endDate.getTime() - days * 86400000);

    const chunks = this.createDateChunks(startDate, endDate, this.maxChunkDays);
    console.log(`[BCR] Downloading ${days} days history in ${chunks.length} chunks (${this.maxChunkDays}d each)...`);

    const allPrices: MarketPrice[] = [];

    for (const chunk of chunks) {
      try {
        const queryParams: Record<string, string | number> = {
          fechaDesde: chunk.from,
          fechaHasta: chunk.to,
          mercado: 'Rosario',
        };

        if (params.grain && BCR_GRAIN_IDS[params.grain]) {
          queryParams.idGrano = BCR_GRAIN_IDS[params.grain];
        }

        const raw = await bcrApiClient.get<unknown>('PreciosCamara', { params: queryParams });
        const items = validateBcrPreciosResponse(raw);
        const mapped = items
          .map(mapBcrPriceToMarketPrice)
          .filter((p): p is MarketPrice => p !== null);

        allPrices.push(...mapped);

        // Pequeña pausa de 100ms para cuidar el rate limit del endpoint
        if (chunks.length > 1) {
          await new Promise(r => setTimeout(r, 100));
        }
      } catch (err: any) {
        console.warn(`[BCR] Error fetching chunk ${chunk.from} - ${chunk.to}:`, err.message || err);
      }
    }

    return this.deduplicatePrices(allPrices);
  }

  /**
   * Divide un rango de fechas en bloques de hasta maxDays días.
   */
  public createDateChunks(start: Date, end: Date, maxDays: number): Array<{ from: string; to: string }> {
    const chunks: Array<{ from: string; to: string }> = [];
    let currentStart = new Date(start);

    while (currentStart < end) {
      const currentEnd = new Date(currentStart.getTime() + (maxDays - 1) * 86400000);
      const actualEnd = currentEnd > end ? end : currentEnd;

      chunks.push({
        from: currentStart.toISOString().split('T')[0],
        to: actualEnd.toISOString().split('T')[0],
      });

      currentStart = new Date(actualEnd.getTime() + 86400000);
    }

    return chunks;
  }

  private deduplicateLatestByGrain(prices: MarketPrice[]): MarketPrice[] {
    const byGrain = new Map<GrainCode, MarketPrice>();
    for (const p of prices) {
      const existing = byGrain.get(p.grain);
      if (!existing || p.priceDate >= existing.priceDate) {
        byGrain.set(p.grain, p);
      }
    }
    return Array.from(byGrain.values());
  }

  private deduplicatePrices(prices: MarketPrice[]): MarketPrice[] {
    const seen = new Set<string>();
    const result: MarketPrice[] = [];

    for (const p of prices) {
      const key = `${p.grain}_${p.market}_${p.priceDate}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(p);
      }
    }

    return result.sort((a, b) => a.priceDate.localeCompare(b.priceDate));
  }
}

export const bcrGixMarketPriceProvider = BcrGixMarketPriceProvider.getInstance();
