import {
  BCR_GRAIN_IDS,
  GRAIN_ID_TO_CODE,
  type GrainCode,
  type MarketPrice,
  type RawBcrPreciosCamaraItem,
} from './types.ts';

/**
 * Resuelve el código canónico de grano a partir del ID oficial de BCR o del nombre.
 */
export function resolveGrainCode(grainIdOrName?: number | string | null): GrainCode | null {
  if (grainIdOrName === undefined || grainIdOrName === null) {
    return null;
  }

  // Búsqueda por ID numérico oficial
  const numericId = Number(grainIdOrName);
  if (!isNaN(numericId) && GRAIN_ID_TO_CODE[numericId]) {
    return GRAIN_ID_TO_CODE[numericId];
  }

  // Búsqueda por nombre de texto
  const str = String(grainIdOrName).toLowerCase().trim();
  if (str.includes('soja')) return 'soja';
  if (str.includes('maiz') || str.includes('maíz')) return 'maiz';
  if (str.includes('trigo')) return 'trigo';
  if (str.includes('sorgo')) return 'sorgo';
  if (str.includes('girasol')) return 'girasol';

  return null;
}

/**
 * Normaliza una fecha a formato YYYY-MM-DD.
 */
export function normalizeDate(dateStr?: string | null): string {
  if (!dateStr) {
    return new Date().toISOString().split('T')[0];
  }

  // Manejar formato ISO (2026-09-15T00:00:00) o YYYY-MM-DD
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // Manejar formato DD/MM/YYYY
  const arMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (arMatch) {
    const day = arMatch[1].padStart(2, '0');
    const month = arMatch[2].padStart(2, '0');
    const year = arMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Fallback con Date parser
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return new Date().toISOString().split('T')[0];
}

/**
 * Mapea un registro crudo de BCR GIX a la estructura canónica MarketPrice.
 */
export function mapBcrPriceToMarketPrice(raw: RawBcrPreciosCamaraItem): MarketPrice | null {
  const grainId = raw.id_Grano ?? raw.idGrano;
  const grainName = raw.nombre_Grano ?? raw.grano;
  const grain = resolveGrainCode(grainId ?? grainName);

  if (!grain) {
    return null; // Grano no soportado o no identificado
  }

  // ID de pizarra
  const rawExtId = raw.id_Pizarra ?? raw.idPizarra;
  const externalId = rawExtId !== undefined && rawExtId !== null && !isNaN(Number(rawExtId)) ? Number(rawExtId) : null;

  // Precios numéricos
  const rawPriceArs = raw.precio_Cotizacion ?? raw.precioCotizacion;
  const priceArs = rawPriceArs !== undefined && rawPriceArs !== null && !isNaN(Number(rawPriceArs)) && Number(rawPriceArs) > 0
    ? Number(rawPriceArs)
    : null;

  const rawExchangeRate = raw.cotizacion_Dolar ?? raw.cotizacionDolar;
  const exchangeRate = rawExchangeRate !== undefined && rawExchangeRate !== null && !isNaN(Number(rawExchangeRate)) && Number(rawExchangeRate) > 0
    ? Number(rawExchangeRate)
    : null;

  const rawPriceUsd = raw.precio_Dolar ?? raw.precioDolar;
  let priceUsd: number | null = null;
  if (rawPriceUsd !== undefined && rawPriceUsd !== null && !isNaN(Number(rawPriceUsd)) && Number(rawPriceUsd) > 0) {
    priceUsd = Number(rawPriceUsd);
  } else if (priceArs && exchangeRate && exchangeRate > 0) {
    // Si BCR informa precio ARS y cotización de dólar de la rueda, calculamos con la tasa oficial reportada
    priceUsd = Number((priceArs / exchangeRate).toFixed(2));
  }

  // Variación y movimiento
  const rawVar = raw.variacion_Cotizacion ?? raw.variacion;
  const variationArs = rawVar !== undefined && rawVar !== null && !isNaN(Number(rawVar)) ? Number(rawVar) : null;

  const rawMov = raw.movimiento_Cotizacion ?? raw.movimiento ?? raw.sentido_Variacion;
  let movement: number | null = null;
  if (rawMov !== undefined && rawMov !== null) {
    if (!isNaN(Number(rawMov))) {
      movement = Number(rawMov);
    } else if (typeof rawMov === 'string') {
      const upper = rawMov.toUpperCase();
      if (upper.includes('ALZA') || upper.includes('SUB') || upper === '+') movement = 1;
      else if (upper.includes('BAJA') || upper.includes('CA') || upper === '-') movement = -1;
      else if (upper.includes('SIN') || upper.includes('IGUAL') || upper === '0') movement = 0;
    }
  }

  // Estimativo
  const rawEst = raw.esEstimado_Cotizacion ?? raw.esEstimado;
  const isEstimated =
    rawEst === true ||
    rawEst === 1 ||
    rawEst === 'true' ||
    rawEst === '1' ||
    rawEst === 'S' ||
    rawEst === 'SI';

  // Fecha de operación / pizarra
  const rawDate = raw.fecha_Operacion_Pizarra ?? raw.fechaOperacion ?? raw.fecha;
  const priceDate = normalizeDate(rawDate);

  return {
    externalId,
    grain,
    market: 'Rosario',
    priceArs,
    priceUsd,
    variationArs,
    movement,
    isEstimated,
    exchangeRate,
    priceDate,
    source: 'BCR_GIX',
  };
}
