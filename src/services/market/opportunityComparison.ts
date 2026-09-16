import {
  GRAIN_DISPLAY_NAMES,
  type GrainCode,
  type MarketPrice,
  type OpportunityComparison,
} from './types.ts';

/**
 * Formatea un número en pesos argentinos (ARS).
 * Ejemplo: 558000 -> "$558.000"
 */
export function formatArs(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return 'Sin cotización';
  }
  const formatted = new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amount);
  return `$ ${formatted}`;
}

/**
 * Formatea un número en dólares estadounidenses (USD) con coma decimal al estilo argentino.
 * Ejemplo: 372.62 -> "USD 372,62"
 */
export function formatUsd(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return 'Sin cotización';
  }
  const formatted = new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(amount);
  return `USD ${formatted}`;
}

/**
 * Formatea una fecha ISO (YYYY-MM-DD) al formato argentino (DD/MM/YYYY).
 * Ejemplo: "2026-09-15" -> "15/09/2026"
 */
export function formatArgentineDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return dateStr;
}

export function formatArsPerTn(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return 's/c';
  return `${formatArs(amount)} / tn`;
}

export function formatUsdPerTn(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return 's/c';
  return `${formatUsd(amount)} / tn`;
}

export function formatArDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  return formatArgentineDate(dateStr);
}

/**
 * Calcula la comparación matemática y financiera entre el precio de una oportunidad
 * y la Pizarra oficial de la BCR.
 */
export function calculateOpportunitySpread(
  grain: GrainCode,
  offeredPriceUsd: number,
  quantityTn: number,
  pizarraPrice: MarketPrice
): OpportunityComparison | null {
  const pizarraPriceUsd = pizarraPrice.priceUsd;
  if (!pizarraPriceUsd || pizarraPriceUsd <= 0 || !offeredPriceUsd || offeredPriceUsd <= 0) {
    return null;
  }

  const differenceUsdPerTn = Number((offeredPriceUsd - pizarraPriceUsd).toFixed(2));
  const deviationPct = Number((((offeredPriceUsd / pizarraPriceUsd) - 1) * 100).toFixed(2));
  const totalImpactUsd = Math.round(differenceUsdPerTn * (quantityTn || 0));

  return {
    grain,
    grainName: GRAIN_DISPLAY_NAMES[grain] || grain,
    offeredPriceUsd,
    pizarraPriceUsd,
    differenceUsdPerTn,
    deviationPct,
    quantityTn: quantityTn || 0,
    totalImpactUsd,
    isEstimated: pizarraPrice.isEstimated,
    pizarraDate: pizarraPrice.priceDate,
    source: pizarraPrice.source,
  };
}
