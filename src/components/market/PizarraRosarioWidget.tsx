import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  LineChart as LineChartIcon,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { api } from '../../lib/api';
import { PizarraHistoryChart } from './PizarraHistoryChart';

interface ProductPrice {
  grain: string;
  name: string;
  priceArs: number | null;
  priceUsd: number | null;
  variationArs: number | null;
  movement: number | null;
  isEstimated: boolean;
  exchangeRate: number | null;
  priceDate: string;
}

interface MarketRosarioData {
  success: boolean;
  market: string;
  source: string;
  sourceUrl?: string;
  priceDate: string | null;
  lastSync: string | null;
  stale: boolean;
  unconfigured?: boolean;
  message?: string;
  products: ProductPrice[];
}

const GRAIN_EMOJIS: Record<string, string> = {
  soja: '🌱',
  maiz: '🌽',
  trigo: '🌾',
  girasol: '🌻',
  sorgo: '🎋',
};

const GRAIN_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  soja: { border: 'border-emerald-500/30', bg: 'bg-emerald-950/20', text: 'text-emerald-400' },
  maiz: { border: 'border-blue-500/30', bg: 'bg-blue-950/20', text: 'text-blue-400' },
  trigo: { border: 'border-amber-500/30', bg: 'bg-amber-950/20', text: 'text-amber-400' },
  girasol: { border: 'border-pink-500/30', bg: 'bg-pink-950/20', text: 'text-pink-400' },
  sorgo: { border: 'border-purple-500/30', bg: 'bg-purple-950/20', text: 'text-purple-400' },
};

function formatARS(val: number | null): string {
  if (val === null || val === undefined || isNaN(val)) return 's/c';
  return `$ ${val.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatUSD(val: number | null): string {
  if (val === null || val === undefined || isNaN(val)) return 's/c';
  return `USD ${val.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateAR(dateStr: string | null): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export const PizarraRosarioWidget: React.FC = () => {
  const [data, setData] = useState<MarketRosarioData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showChart, setShowChart] = useState<boolean>(false);
  const [selectedGrainForChart, setSelectedGrainForChart] = useState<string>('all');


  const hasLoadedPrices = Boolean(data?.products && data.products.some((p) => p.priceArs !== null));

  const fetchPrices = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.market.getRosarioCurrent();
      if (res && res.success !== undefined) {
        setData(res);
      }
    } catch (err: any) {
      console.error('Error al obtener cotizaciones de Pizarra Rosario:', err);
      setError('No se pudo actualizar la pizarra. Los datos visibles conservan su fecha original.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await api.market.syncRosario(7);
      await fetchPrices();
      if (res && res.success) {
        setSyncMessage(`Sincronizado: ${res.log?.recordsSaved || 0} registros de la publicación oficial.`);
      } else {
        setError(res?.message || 'No se pudo sincronizar la publicación oficial.');
      }
    } catch (_err) {
      await fetchPrices();
      setError('Falló la sincronización con BCR. Se conserva la última publicación guardada.');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 4000);
    }
  };

  useEffect(() => {
    fetchPrices();
  }, []);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-sm h-full flex flex-col justify-between">
      <div>
        {/* Encabezado Principal */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    hasLoadedPrices ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    hasLoadedPrices ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
              </span>
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
                Pizarra Rosario
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-mono">
                  BCR Oficial
                </span>
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1 font-sans">
              Cámara Arbitral de Cereales • Publicación oficial
            </p>
          </div>

          {/* Botones de acción */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setShowChart((prev) => !prev);
                setSelectedGrainForChart('all');
              }}
              className={`p-2 rounded-xl transition-all border cursor-pointer flex items-center justify-center ${
                showChart
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border-zinc-700'
              }`}
              title={showChart ? 'Volver a grilla de precios' : 'Ver gráfico de tendencias'}
            >
              <LineChartIcon className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleManualSync}
              disabled={syncing || loading}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-zinc-300 hover:text-white transition-all border border-zinc-700 disabled:opacity-50 cursor-pointer flex items-center justify-center"
              title="Sincronizar cotizaciones con BCR"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Mensaje de feedback de sync */}
        {(error || data?.message) && (
          <div role="alert" className="mb-3 p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs">
            {error || data?.message}
          </div>
        )}
        {syncMessage && (
          <div className="mb-3 p-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{syncMessage}</span>
          </div>
        )}

        {/* Vista Grilla vs Vista Gráfico */}
        {showChart ? (
          <div className="mt-2 min-h-72">
            <PizarraHistoryChart
              initialGrain={selectedGrainForChart}
              onClose={() => setShowChart(false)}
            />
          </div>
        ) : (
          <div className="space-y-2.5">
            {loading && !data ? (
              <div className="py-8 text-center text-zinc-500 text-xs flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-emerald-500" />
                <span>Consultando cotizaciones oficiales...</span>
              </div>
            ) : data?.products && data.products.length > 0 ? (
              data.products.map((item) => {
                const colors = GRAIN_COLORS[item.grain] || {
                  border: 'border-zinc-700',
                  bg: 'bg-zinc-800',
                  text: 'text-zinc-300',
                };
                const hasPrice = item.priceArs !== null || item.priceUsd !== null;
                const mov = item.movement || 0;
                const hasVariation = item.variationArs !== null && item.variationArs !== 0;

                return (
                  <div
                    key={item.grain}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border bg-zinc-900/60 hover:bg-zinc-800/60 transition-all gap-2 group ${colors.border}`}
                  >
                    {/* Identificación del Grano */}
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl shrink-0">
                        {GRAIN_EMOJIS[item.grain] || '🌾'}
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-zinc-200 text-xs sm:text-sm">
                            {item.name}
                          </span>
                          {item.isEstimated && (
                            <span
                              className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-950/60 text-amber-400 border border-amber-800/50 uppercase"
                              title="Cotización estimada por la Cámara Arbitral de Cereales"
                            >
                              S/C · Estimativo
                            </span>
                          )}
                        </div>
                        {item.exchangeRate ? (
                          <span className="text-[10px] text-zinc-500 font-mono">
                            BNA divisa comprador: ${item.exchangeRate.toFixed(2)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Precios ARS y USD */}
                    <div className="flex sm:flex-col items-end justify-between sm:justify-center gap-1">
                      <div className="text-right">
                        <div className="text-xs sm:text-sm font-black text-white font-mono tabular-nums tracking-tight">
                          {formatARS(item.priceArs)}
                          <span className="text-[10px] text-zinc-500 font-normal ml-0.5">/tn</span>
                        </div>
                        <div className="text-[11px] font-bold text-emerald-400 font-mono tabular-nums">
                          {formatUSD(item.priceUsd)}
                          <span className="text-[9px] text-zinc-500 font-normal ml-0.5">/tn</span>
                        </div>
                      </div>

                      {/* Variación */}
                      {hasVariation && (
                        <div
                          className={`inline-flex items-center gap-0.5 text-[10px] font-mono font-bold ${
                            item.variationArs! > 0
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {item.variationArs! > 0 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          <span>
                            {item.variationArs! > 0 ? '+' : ''}
                            {formatARS(item.variationArs)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-6 text-center text-zinc-500 text-xs">
                No hay cotizaciones disponibles en este momento.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pie de Widget */}
      <p className="mt-3 text-[10px] text-zinc-400">
        Precios en ARS/tn. USD: conversión informativa publicada por la Cámara.
        {' '}<a href="https://www.cac.bcr.com.ar/es" target="_blank" rel="noreferrer" className="underline text-emerald-400">Ver fuente oficial</a>
      </p>
      <div className="mt-4 pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between text-[10px] text-zinc-500 font-mono gap-1">
        <div>
          <span>Fecha Pizarra: </span>
          <span className="text-zinc-300 font-bold">
            {formatDateAR(data?.priceDate || null) || 'Pendiente'}
          </span>
        </div>
        <div>
          <span>Última Sync: </span>
          <span className="text-zinc-400">
            {data?.lastSync ? new Date(data.lastSync).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : 'Nunca'}
          </span>
        </div>
      </div>
    </div>
  );
};
