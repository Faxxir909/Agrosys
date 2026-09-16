import React, { useEffect, useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { Calendar, DollarSign, Loader2, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';

const GRAIN_COLORS: Record<string, string> = {
  soja: '#10b981',    // Verde Esmeralda
  maiz: '#3b82f6',    // Azul
  trigo: '#f59e0b',   // Ámbar
  girasol: '#ec4899', // Rosa/Magenta
  sorgo: '#8b5cf6',   // Violeta
};

const GRAIN_NAMES: Record<string, string> = {
  soja: 'Soja',
  maiz: 'Maíz',
  trigo: 'Trigo',
  girasol: 'Girasol',
  sorgo: 'Sorgo',
};

interface PizarraHistoryChartProps {
  initialGrain?: string;
  onClose?: () => void;
}

export const PizarraHistoryChart: React.FC<PizarraHistoryChartProps> = ({
  initialGrain,
  onClose,
}) => {
  const [selectedGrain, setSelectedGrain] = useState<string>(initialGrain || 'all');
  const [days, setDays] = useState<number>(30);
  const [currency, setCurrency] = useState<'USD' | 'ARS'>('USD');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.market.getRosarioHistory({
        grain: selectedGrain === 'all' ? undefined : selectedGrain,
        days,
        currency,
      });

      if (res && res.data) {
        // Agrupar cotizaciones por fecha
        // Cada registro: { priceDate, grain, priceArs, priceUsd }
        const mapByDate = new Map<string, any>();

        res.data.forEach((item: any) => {
          const dateKey = item.priceDate;
          if (!mapByDate.has(dateKey)) {
            const [y, m, d] = dateKey.split('-');
            mapByDate.set(dateKey, {
              date: dateKey,
              formattedDate: `${d}/${m}`,
            });
          }
          const row = mapByDate.get(dateKey);
          const val = currency === 'USD' ? item.priceUsd : item.priceArs;
          row[item.grain] = item.isEstimated ? null : val;
        });

        // Ordenar cronológicamente
        const sorted = Array.from(mapByDate.values()).sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        setData(sorted);
      }
    } catch (err: any) {
      console.error('Error al cargar histórico de BCR:', err);
      setError('No se pudo cargar el historial de cotizaciones.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [selectedGrain, days, currency]);

  const activeGrains = useMemo(() => {
    if (selectedGrain !== 'all') {
      return [selectedGrain];
    }
    return ['soja', 'maiz', 'trigo', 'girasol', 'sorgo'];
  }, [selectedGrain]);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg flex flex-col h-full">
      {/* Encabezado y Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-zinc-800">
        <div>
          <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
            <span className="text-emerald-500 font-mono">📈</span>
            Evolución Histórica Pizarra Rosario (BCR)
          </h3>
          <p className="text-[11px] text-zinc-400">
            Serie temporal oficial de la Cámara Arbitral de Cereales
          </p>
        </div>

        {/* Controles: Moneda y Período */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle Moneda */}
          <div className="inline-flex rounded-lg bg-zinc-800 p-0.5 border border-zinc-700">
            <button
              type="button"
              onClick={() => setCurrency('USD')}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors ${
                currency === 'USD'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              USD / tn
            </button>
            <button
              type="button"
              onClick={() => setCurrency('ARS')}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors ${
                currency === 'ARS'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              ARS / tn
            </button>
          </div>

          {/* Selector de Rango */}
          <div className="inline-flex rounded-lg bg-zinc-800 p-0.5 border border-zinc-700 text-xs">
            {[
              { label: '7D', value: 7 },
              { label: '30D', value: 30 },
              { label: '90D', value: 90 },
              { label: '6M', value: 180 },
              { label: '1A', value: 365 },
            ].map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setDays(r.value)}
                className={`px-2 py-1 font-mono font-medium rounded-md transition-colors ${
                  days === r.value
                    ? 'bg-zinc-700 text-white font-bold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Selector de Grano */}
      <p className="mb-2 text-[10px] text-zinc-400">
        Publicaciones oficiales guardadas desde la integración. Se excluyen valores estimativos.
        {currency === 'USD' ? ' USD es la conversión informativa de la Cámara.' : ''}
      </p>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span className="text-[11px] text-zinc-500 font-mono mr-1">Grano:</span>
        <button
          type="button"
          onClick={() => setSelectedGrain('all')}
          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
            selectedGrain === 'all'
              ? 'bg-white text-zinc-900 font-bold'
              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700'
          }`}
        >
          Todos
        </button>
        {Object.entries(GRAIN_NAMES).map(([code, name]) => (
          <button
            key={code}
            type="button"
            onClick={() => setSelectedGrain(code)}
            className={`px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
              selectedGrain === code
                ? 'bg-zinc-100 text-zinc-900 font-bold shadow'
                : 'bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-700 border border-zinc-800'
            }`}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: GRAIN_COLORS[code] }}
            />
            {name}
          </button>
        ))}
      </div>

      {/* Área del Gráfico */}
      <div className="flex-1 min-h-64 w-full relative">
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/80 z-10">
            <Loader2 className="w-6 h-6 text-emerald-500 animate-spin mb-2" />
            <span className="text-xs text-zinc-400">Cargando serie BCR...</span>
          </div>
        ) : null}

        {error ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-400">
            <p className="text-xs text-rose-400 mb-2">{error}</p>
            <button
              type="button"
              onClick={fetchHistory}
              className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-xs text-white rounded-lg border border-zinc-700 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3 h-3" /> Reintentar
            </button>
          </div>
        ) : data.length === 0 && !loading ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500 text-xs">
            No se encontraron registros de cotización en el período seleccionado.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 10, right: 15, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="formattedDate"
                stroke="#71717a"
                fontSize={10}
                tickLine={false}
              />
              <YAxis
                stroke="#71717a"
                fontSize={10}
                tickLine={false}
                domain={['auto', 'auto']}
                tickFormatter={(val) =>
                  currency === 'USD' ? `USD ${val}` : `$ ${(val / 1000).toFixed(0)}k`
                }
              />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  borderColor: '#27272a',
                  borderRadius: '10px',
                  fontSize: '11px',
                }}
                formatter={(val: any, name: any) => [
                  currency === 'USD'
                    ? `USD ${Number(val).toLocaleString('es-AR', { minimumFractionDigits: 2 })} / tn`
                    : `$ ${Number(val).toLocaleString('es-AR', { minimumFractionDigits: 0 })} / tn`,
                  GRAIN_NAMES[name] || name,
                ]}
                labelFormatter={(label, payload) => {
                  const item = payload?.[0]?.payload;
                  return item ? `Fecha: ${item.date}` : label;
                }}
              />
              <Legend
                verticalAlign="top"
                height={28}
                iconSize={8}
                iconType="circle"
                wrapperStyle={{ fontSize: '10px' }}
                formatter={(val) => GRAIN_NAMES[val] || val}
              />
              {activeGrains.map((grain) => (
                <Line
                  key={grain}
                  type="monotone"
                  dataKey={grain}
                  name={grain}
                  stroke={GRAIN_COLORS[grain] || '#a1a1aa'}
                  strokeWidth={selectedGrain === grain ? 2.5 : 1.8}
                  dot={{ r: data.length < 15 ? 3 : 1 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer Info */}
      <div className="mt-3 pt-2.5 border-t border-zinc-800 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
        <span>Fuente: API Oficial BCR (GIX)</span>
        <span>Cámara Arbitral de Cereales</span>
      </div>
    </div>
  );
};
