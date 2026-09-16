import React from 'react';
import { Info, Loader2 } from 'lucide-react';
import type { Client } from '../../hooks/useClients';
import { OpportunitySpreadBadge } from '../market/OpportunitySpreadBadge';

export type MatchDraft = {
  quantity: number;
  commissionPct: number;
  sellerPrice: number;
  buyerPrice: number;
};

export type OpportunityMatchesViewProps = {
  matches: any[];
  clients: Client[];
  getMatchDraft: (match: any) => MatchDraft;
  updateMatchDraft: (match: any, field: string, value: number) => void;
  onNotifyMatch: (match: any) => Promise<void> | void;
  onCloseMatch: (match: any) => Promise<void> | void;
  notifyingMatchId: string | null;
};

const formatNumber = (num: number) => new Intl.NumberFormat('es-AR').format(num);

export function OpportunityMatchesView({
  matches,
  clients,
  getMatchDraft,
  updateMatchDraft,
  onNotifyMatch,
  onCloseMatch,
  notifyingMatchId,
}: OpportunityMatchesViewProps) {
  return (
    <div className="space-y-6">
      <div className="bg-amber-950/20 border border-amber-500/25 rounded-2xl p-5 text-gray-300 shadow-sm">
        <div className="flex gap-3">
          <span className="text-2xl">💡</span>
          <div>
            <h4 className="font-bold text-white mb-1">Cruce Inteligente de Oferta y Demanda (Matching Engine)</h4>
            <p className="text-xs text-zinc-300 leading-relaxed">
              El sistema empareja automáticamente a <strong>vendedores de grano (Ofertas)</strong> con sus respectivos{' '}
              <strong>compradores (Demandas)</strong>. Calcula el volumen máximo factible de transaccionar, el diferencial de
              precio y liquida las condiciones de corretaje del 2%.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {matches.length === 0 ? (
          <div className="p-16 text-center bg-zinc-900/60 border border-zinc-800 rounded-2xl">
            <div className="bg-zinc-800 w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Info className="w-6 h-6 text-zinc-500" />
            </div>
            <h4 className="text-sm font-bold text-white mb-1">No hay cruces de mercado listos</h4>
            <p className="text-zinc-500 text-xs text-center max-w-sm mx-auto leading-relaxed">
              Registra ofertas de venta y demandas de compra sobre un mismo grano para que el motor inteligente AgroSys los
              empareje automáticamente aquí.
            </p>
          </div>
        ) : (
          matches.map(match => {
            const seller = clients.find(c => c.id === match.offer.clientId);
            const buyer = clients.find(c => c.id === match.demand.clientId);
            const sellerName = seller?.name || 'Desconocido';
            const buyerName = buyer?.name || 'Desconocido';

            const profitable = match.priceSpread >= 0;
            const draft = getMatchDraft(match);
            const negotiation = match.negotiation;

            return (
              <div
                key={match.id}
                className={`bg-zinc-900/90 border rounded-2xl p-5 flex flex-col xl:flex-row items-stretch justify-between gap-6 transition-all shadow-md ${
                  profitable ? 'border-green-500/25 hover:border-green-500/40' : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-1">
                  <div className="h-14 w-14 bg-zinc-800 rounded-2xl flex flex-col items-center justify-center border border-zinc-700 shadow-inner shrink-0">
                    <span className="text-xl">🌾</span>
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">{match.cropType}</span>
                  </div>

                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-white">Cruce de {match.cropType.toUpperCase()}</span>
                      <span className="bg-zinc-800 text-[10px] text-zinc-300 px-2 py-0.5 rounded-md font-mono border border-zinc-700 tabular-nums">
                        Coinciden: {formatNumber(match.overlapQuantity)} TN
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1.5 text-xs text-zinc-400">
                      <div className="bg-zinc-950/50 p-2.5 rounded-xl border border-zinc-800">
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Vendedor (Oferta)</p>
                        <p className="font-bold text-green-400 truncate mt-0.5">{sellerName}</p>
                        <p className="font-mono text-xs mt-0.5 tabular-nums">
                          Total: {formatNumber(match.offer.quantity_tn)} TN @{' '}
                          <strong className="text-white">${formatNumber(match.offer.price_usd)}</strong>
                        </p>
                        {Number(match.offer.price_usd) > 0 && (
                          <div className="mt-1.5">
                            <OpportunitySpreadBadge
                              grain={match.cropType || match.offer.crop_type}
                              offeredPrice={Number(match.offer.price_usd)}
                              type="oferta"
                              compact
                            />
                          </div>
                        )}
                      </div>
                      <div className="bg-zinc-950/50 p-2.5 rounded-xl border border-zinc-800">
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Comprador (Demanda)</p>
                        <p className="font-bold text-blue-400 truncate mt-0.5">{buyerName}</p>
                        <p className="font-mono text-xs mt-0.5 tabular-nums">
                          Total: {formatNumber(match.demand.quantity_tn)} TN @{' '}
                          <strong className="text-white">${formatNumber(match.demand.price_usd)}</strong>
                        </p>
                        {Number(match.demand.price_usd) > 0 && (
                          <div className="mt-1.5">
                            <OpportunitySpreadBadge
                              grain={match.cropType || match.demand.crop_type}
                              offeredPrice={Number(match.demand.price_usd)}
                              type="demanda"
                              compact
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {(match.explanations || []).map((reason: string) => (
                        <span key={reason} className="text-[10px] text-zinc-300 bg-zinc-800/70 border border-zinc-700 px-2 py-1 rounded">
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col justify-between items-stretch gap-3 min-w-0 xl:min-w-[290px] border-t xl:border-t-0 xl:border-l border-zinc-800 pt-4 xl:pt-0 xl:pl-6">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[9px] uppercase font-bold text-zinc-500">
                      Volumen TN
                      <input
                        type="number"
                        min="1"
                        max={match.overlapQuantity}
                        value={draft.quantity}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateMatchDraft(match, 'quantity', Number(e.target.value))}
                        className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white font-mono"
                      />
                    </label>
                    <label className="text-[9px] uppercase font-bold text-zinc-500">
                      Comisión %
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={draft.commissionPct}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateMatchDraft(match, 'commissionPct', Number(e.target.value))}
                        className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white font-mono"
                      />
                    </label>
                    <label className="text-[9px] uppercase font-bold text-zinc-500">
                      Precio vendedor
                      <input
                        type="number"
                        min="1"
                        step="0.5"
                        value={draft.sellerPrice}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateMatchDraft(match, 'sellerPrice', Number(e.target.value))}
                        className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-green-400 font-mono"
                      />
                    </label>
                    <label className="text-[9px] uppercase font-bold text-zinc-500">
                      Precio comprador
                      <input
                        type="number"
                        min="1"
                        step="0.5"
                        value={draft.buyerPrice}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateMatchDraft(match, 'buyerPrice', Number(e.target.value))}
                        className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-blue-400 font-mono"
                      />
                    </label>
                  </div>

                  {negotiation && (
                    <div className="flex items-center justify-between gap-2 text-xs border-y border-zinc-800 py-2">
                      <span
                        className={
                          negotiation.sellerResponse === 'aceptada'
                            ? 'text-green-400'
                            : negotiation.sellerResponse === 'rechazada'
                              ? 'text-red-400'
                              : 'text-amber-400'
                        }
                      >
                        Vendedor: {negotiation.sellerResponse}
                      </span>
                      <span
                        className={
                          negotiation.buyerResponse === 'aceptada'
                            ? 'text-green-400'
                            : negotiation.buyerResponse === 'rechazada'
                              ? 'text-red-400'
                              : 'text-amber-400'
                        }
                      >
                        Comprador: {negotiation.buyerResponse}
                      </span>
                    </div>
                  )}

                  <div className="flex-1 flex flex-col justify-center text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      <span className="text-xs text-zinc-400 font-medium">Margen Spread:</span>
                      <span
                        className={`text-sm font-mono font-black tabular-nums ${
                          draft.buyerPrice - draft.sellerPrice >= 0 ? 'text-green-400' : 'text-zinc-400'
                        }`}
                      >
                        {draft.buyerPrice - draft.sellerPrice >= 0 ? '+' : ''}$
                        {formatNumber(draft.buyerPrice - draft.sellerPrice)} USD
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-0.5 font-mono tabular-nums">
                      Precio medio: ${formatNumber((draft.sellerPrice + draft.buyerPrice) / 2)} USD
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5 justify-end">
                      <span className="text-xs text-zinc-400">Honorarios ({draft.commissionPct}%):</span>
                      <span className="font-mono font-bold text-amber-400 tabular-nums">
                        $
                        {formatNumber(
                          Math.round(
                            draft.quantity *
                              ((draft.sellerPrice + draft.buyerPrice) / 2) *
                              (draft.commissionPct / 100)
                          )
                        )}{' '}
                        USD
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col sm:flex-row xl:flex-col items-stretch xl:items-end justify-end gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => onNotifyMatch(match)}
                      disabled={notifyingMatchId === match.id}
                      className="w-full sm:w-auto bg-green-600/10 hover:bg-green-600/20 text-green-400 font-bold text-xs px-5 py-3 rounded-xl transition-all border border-green-500/25 active:scale-95 duration-100 uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      {notifyingMatchId === match.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <span>{negotiation ? 'Reenviar propuesta' : 'Enviar propuesta'}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onCloseMatch(match)}
                      className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-black text-xs px-5 py-3 rounded-xl transition-all shadow-md active:scale-95 duration-100 uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      {negotiation?.status === 'confirmada' ? 'Concretar confirmado' : 'Concretar manualmente'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
