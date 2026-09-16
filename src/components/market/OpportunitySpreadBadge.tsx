import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Info, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';

export interface OpportunityComparisonResult {
  grain: string;
  currency: 'ARS' | 'USD';
  offeredPrice: number;
  pizarraPriceArs: number | null;
  pizarraPriceUsd: number;
  differenceUsdPerTn: number;
  deviationPct: number;
  totalImpactUsd?: number | null;
  quantityTn?: number | null;
  isEstimated: boolean;
  pizarraDate: string;
  source: string;
}

interface OpportunitySpreadBadgeProps {
  grain: string;
  offeredPrice: number;
  type?: 'oferta' | 'demanda';
  currency?: 'ARS' | 'USD';
  quantityTn?: number;
  compact?: boolean;
}

export const OpportunitySpreadBadge: React.FC<OpportunitySpreadBadgeProps> = ({
  grain,
  offeredPrice,
  type = 'oferta',
  currency = 'USD',
  quantityTn,
  compact = false,
}) => {
  const [comparison, setComparison] = useState<OpportunityComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!grain || !offeredPrice || offeredPrice <= 0) {
      setComparison(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    api.market
      .compare(grain, offeredPrice, currency, quantityTn)
      .then((res: any) => {
        if (!isMounted) return;
        if (res?.success && res?.hasReference && res?.comparison) {
          setComparison(res.comparison);
        } else {
          setComparison(null);
          if (res?.message) setError(res.message);
        }
      })
      .catch((err: any) => {
        if (!isMounted) return;
        setError('No se pudo comparar con Pizarra Rosario');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [grain, offeredPrice, currency, quantityTn]);

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-800 text-zinc-400 animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-ping" />
        Comparando con Pizarra...
      </span>
    );
  }

  if (!comparison) {
    return null;
  }

  const diff = comparison.differenceUsdPerTn;
  const pct = comparison.deviationPct;
  const isPositive = diff > 0.05;
  const isNegative = diff < -0.05;

  // En una OFERTA: pedir por encima de pizarra es más caro (+spread), por debajo es barato (-spread).
  // En una DEMANDA: pagar por encima de pizarra es premio (+spread), pagar por debajo es descuento (-spread).
  const isFavorable = type === 'demanda' ? isPositive : !isPositive;

  const badgeColor = isPositive
    ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-400'
    : isNegative
    ? 'bg-amber-950/60 border-amber-700/60 text-amber-400'
    : 'bg-zinc-800 border-zinc-700 text-zinc-300';

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border ${badgeColor}`}
        title={`Pizarra BCR: USD ${comparison.pizarraPriceUsd.toFixed(2)} (${comparison.pizarraDate})`}
      >
        {isPositive ? <TrendingUp className="w-3 h-3 text-emerald-400" /> : isNegative ? <TrendingDown className="w-3 h-3 text-amber-400" /> : <Minus className="w-3 h-3" />}
        {diff >= 0 ? `+USD ${diff.toFixed(2)}` : `-USD ${Math.abs(diff).toFixed(2)}`} ({pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`})
      </span>
    );
  }

  return (
    <div className={`p-2.5 rounded-xl border text-xs font-sans transition-all ${badgeColor}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-bold">
          {isPositive ? (
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          ) : isNegative ? (
            <TrendingDown className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <Minus className="w-3.5 h-3.5 text-zinc-400" />
          )}
          <span>
            {diff >= 0 ? `+USD ${diff.toFixed(2)}/tn` : `-USD ${Math.abs(diff).toFixed(2)}/tn`}
            {' '}({pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`} vs Pizarra)
          </span>
        </div>
        <span className="text-[10px] text-zinc-400 font-mono">
          Ref: USD {comparison.pizarraPriceUsd.toFixed(2)}
          {comparison.isEstimated ? ' (Est.)' : ''}
        </span>
      </div>

      {comparison.totalImpactUsd && comparison.quantityTn ? (
        <div className="mt-1 text-[11px] text-zinc-300 flex items-center justify-between border-t border-zinc-800/80 pt-1">
          <span>Impacto en {comparison.quantityTn.toLocaleString('es-AR')} tn:</span>
          <span className="font-mono font-bold">
            {comparison.totalImpactUsd >= 0 ? '+' : ''}USD {Math.abs(comparison.totalImpactUsd).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      ) : null}

      <div className="mt-1 text-[9px] text-zinc-400 flex items-center justify-between font-mono">
        <span>Bolsa de Comercio de Rosario</span>
        <span>Fecha: {comparison.pizarraDate}</span>
      </div>
    </div>
  );
};
