export type GrainCode = 'soja' | 'maiz' | 'trigo' | 'sorgo' | 'girasol';

export const BCR_GRAIN_IDS = {
  trigo: 1,
  maiz: 2,
  sorgo: 3,
  girasol: 20,
  soja: 21,
} as const;

export const GRAIN_ID_TO_CODE: Record<number, GrainCode> = {
  1: 'trigo',
  2: 'maiz',
  3: 'sorgo',
  20: 'girasol',
  21: 'soja',
};

export const GRAIN_DISPLAY_NAMES: Record<GrainCode, string> = {
  soja: 'Soja',
  maiz: 'Maíz',
  trigo: 'Trigo',
  sorgo: 'Sorgo',
  girasol: 'Girasol',
};

export interface MarketPrice {
  id?: string | number;
  externalId?: number | null;
  grain: GrainCode;
  market: 'Rosario';
  priceArs: number | null;
  priceUsd: number | null;
  variationArs: number | null;
  movement: number | null;
  isEstimated: boolean;
  exchangeRate: number | null;
  priceDate: string; // YYYY-MM-DD
  source: 'BCR_GIX' | 'BCR_CAC_WEB';
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MarketSyncLog {
  id?: string | number;
  provider: 'BCR_GIX' | 'BCR_CAC_WEB';
  startedAt: Date;
  finishedAt?: Date | null;
  status: 'success' | 'error' | 'in_progress' | 'skipped';
  recordsReceived: number;
  recordsSaved: number;
  errorCode?: string | null;
  errorMessageSafe?: string | null;
}

export interface OpportunityComparison {
  grain: GrainCode;
  grainName: string;
  offeredPriceUsd: number;
  pizarraPriceUsd: number;
  differenceUsdPerTn: number; // offered - pizarra
  deviationPct: number; // ((offered / pizarra) - 1) * 100
  quantityTn: number;
  totalImpactUsd: number; // differenceUsdPerTn * quantityTn
  isEstimated: boolean;
  pizarraDate: string;
  source: string;
}

export interface HistoricalPriceParams {
  grain?: GrainCode;
  days?: number; // 7, 30, 90, 180, 365
  currency?: 'ars' | 'usd' | 'all' | 'ALL' | 'ARS' | 'USD';
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export interface MarketPriceProvider {
  getCurrentPrices(): Promise<MarketPrice[]>;
  getHistoricalPrices(params: HistoricalPriceParams): Promise<MarketPrice[]>;
}

export interface BcrTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number; // seconds
  expires_at?: string;
}

export interface RawBcrPreciosCamaraItem {
  id_Pizarra?: number | string;
  idPizarra?: number | string;
  id_Grano?: number | string;
  idGrano?: number | string;
  grano?: string;
  nombre_Grano?: string;
  precio_Cotizacion?: number | string;
  precioCotizacion?: number | string;
  esEstimado_Cotizacion?: boolean | number | string;
  esEstimado?: boolean;
  variacion_Cotizacion?: number | string;
  variacion?: number | string;
  movimiento_Cotizacion?: number | string;
  movimiento?: number | string;
  fecha_Operacion_Pizarra?: string;
  fechaOperacion?: string;
  fecha?: string;
  precio_Dolar?: number | string;
  precioDolar?: number | string;
  cotizacion_Dolar?: number | string;
  cotizacionDolar?: number | string;
  mercado?: string;
  [key: string]: unknown;
}
