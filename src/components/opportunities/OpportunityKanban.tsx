import { useState } from 'react';
import { Phone, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import type { Client } from '../../hooks/useClients';
import type { Opportunity } from '../../hooks/useOpportunities';

export type OpportunityKanbanProps = {
  opportunities: Opportunity[];
  clients: Client[];
  onStatusChange: (id: string, newStatus: string) => void | Promise<void>;
  onDelete: (id: string) => void;
  onOpenWhatsApp: (
    phone: string,
    clientId: string,
    clientName: string,
    context?: {
      cropType: string;
      quantity_tn: number;
      price_usd: number;
      location?: string;
    }
  ) => void;
};

type ColumnId = Opportunity['status'];

const CROP_COLORS: Record<string, { bg: string; text: string; border: string; emoji: string }> = {
  soja:    { bg: 'bg-amber-500/10',  text: 'text-amber-400',  border: 'border-amber-500/30', emoji: '🌱' },
  maiz:    { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30', emoji: '🌽' },
  trigo:   { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30', emoji: '🌾' },
  sorgo:   { bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-500/30',    emoji: '🌿' },
  girasol: { bg: 'bg-lime-500/10',   text: 'text-lime-400',   border: 'border-lime-500/30',   emoji: '🌻' },
};

const getCropStyle = (crop: string) =>
  CROP_COLORS[crop?.toLowerCase()] ?? { bg: 'bg-zinc-700/30', text: 'text-zinc-300', border: 'border-zinc-600', emoji: '🌾' };

const formatNumber = (num: number) => new Intl.NumberFormat('es-AR').format(num);

const COLUMNS: {
  id: ColumnId;
  name: string;
  shortName: string;
  headerClass: string;
  borderClass: string;
  emptyClass: string;
}[] = [
  { id: 'abierta',                name: '📂 Abiertas',          shortName: '📂 Abiertas',  headerClass: 'text-zinc-300',  borderClass: 'border-zinc-800',     emptyClass: 'bg-zinc-800/20' },
  { id: 'negociacion',            name: '🤝 En Negociación',    shortName: '🤝 Negociac.', headerClass: 'text-amber-300', borderClass: 'border-amber-500/30', emptyClass: 'bg-amber-500/10' },
  { id: 'esperando_confirmacion', name: '⏳ Esp. Confirmación', shortName: '⏳ Confirm.',   headerClass: 'text-sky-300',   borderClass: 'border-sky-500/30',   emptyClass: 'bg-sky-500/10' },
  { id: 'ganada',                 name: '🏆 Ganadas',           shortName: '🏆 Ganadas',   headerClass: 'text-green-300', borderClass: 'border-green-500/30', emptyClass: 'bg-green-500/10' },
  { id: 'perdida',                name: '❌ Perdidas',          shortName: '❌ Perdidas',  headerClass: 'text-red-300',   borderClass: 'border-red-500/30',   emptyClass: 'bg-red-500/10' },
  { id: 'vencida',                name: '⌛ Vencidas',          shortName: '⌛ Vencidas',  headerClass: 'text-zinc-500',  borderClass: 'border-zinc-700',     emptyClass: 'bg-zinc-800/30' },
];

function getColumnItems(opportunities: Opportunity[], statusId: ColumnId) {
  return opportunities.filter(opportunity => {
    if (statusId === 'abierta') {
      return opportunity.status === 'abierta' || !opportunity.status;
    }
    return opportunity.status === statusId;
  });
}

export function OpportunityKanban({
  opportunities,
  clients,
  onStatusChange,
  onDelete,
  onOpenWhatsApp,
}: OpportunityKanbanProps) {
  const [selectedMobileCol, setSelectedMobileCol] = useState<ColumnId | 'all'>('abierta');
  const [draggedOverColumn, setDraggedOverColumn] = useState<ColumnId | null>(null);

  return (
    <div className="w-full max-w-full min-w-0 space-y-3 p-2 sm:p-4">
      <div className="mobile-scroll-row sm:hidden flex gap-1.5 pb-1.5 scrollbar-none px-1">
        <button
          type="button"
          onClick={() => setSelectedMobileCol('all')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
            selectedMobileCol === 'all'
              ? 'bg-zinc-200 text-black shadow'
              : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700/60'
          }`}
        >
          <span>Todos</span>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-black/20 font-mono">
            {opportunities.length}
          </span>
        </button>
        {COLUMNS.map(column => {
          const count = getColumnItems(opportunities, column.id).length;
          const isSelected = selectedMobileCol === column.id;
          return (
            <button
              key={column.id}
              type="button"
              onClick={() => setSelectedMobileCol(column.id)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                isSelected
                  ? 'bg-green-500 text-black shadow-lg shadow-green-500/20'
                  : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700/60'
              }`}
            >
              <span>{column.shortName}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-mono font-bold ${
                isSelected ? 'bg-black/30 text-black' : 'bg-zinc-900 text-zinc-400'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mobile-scroll-row flex gap-4 min-h-125 scrollbar-none items-stretch select-none snap-x snap-mandatory pb-4">
        {COLUMNS.map(column => {
          const items = getColumnItems(opportunities, column.id);
          const isOver = draggedOverColumn === column.id;
          const isEmpty = items.length === 0;
          const isHiddenOnMobile = selectedMobileCol !== 'all' && selectedMobileCol !== column.id;

          return (
            <div
              key={column.id}
              onDragOver={event => {
                event.preventDefault();
                if (draggedOverColumn !== column.id) {
                  setDraggedOverColumn(column.id);
                }
              }}
              onDragLeave={() => {
                setDraggedOverColumn(null);
              }}
              onDrop={async event => {
                event.preventDefault();
                setDraggedOverColumn(null);
                const id = event.dataTransfer.getData('text/plain');
                if (id) {
                  await onStatusChange(id, column.id);
                }
              }}
              className={`w-72 min-w-72 min-h-125 shrink-0 border rounded-2xl p-3.5 flex flex-col transition-all duration-200 snap-start ${
                isHiddenOnMobile ? 'hidden sm:flex' : 'flex'
              } ${column.borderClass} ${isEmpty ? column.emptyClass : 'bg-zinc-900/40'} ${
                isOver ? 'ring-2 ring-green-500/60 scale-[1.01] border-green-500/50 shadow-lg shadow-green-500/5' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-zinc-800/60">
                <h4 className={`font-black text-xs uppercase tracking-widest ${column.headerClass}`}>{column.name}</h4>
                <span className="bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs px-1.5 py-0.5 rounded-md font-mono font-bold">
                  {items.length}
                </span>
              </div>

              <div className="flex-1 flex flex-col gap-3 overflow-y-auto min-h-0 pr-1.5 scrollbar-thin">
                {items.map(opportunity => {
                  const client = clients.find(item => item.id === opportunity.clientId);
                  const clientName = client?.name || 'Desconocido';
                  const clientPhone = client?.phone;
                  const cropStyle = getCropStyle(opportunity.cropType);
                  const isOffer = opportunity.type === 'oferta';

                  return (
                    <div
                      key={opportunity.id}
                      draggable
                      onDragStart={event => {
                        event.dataTransfer.setData('text/plain', opportunity.id);
                        event.dataTransfer.effectAllowed = 'move';
                      }}
                      className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 rounded-xl p-3.5 transition-all duration-150 cursor-grab active:cursor-grabbing shadow-md relative group"
                    >
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-xs text-zinc-600 font-mono">
                          {opportunity.createdAt ? format(new Date(opportunity.createdAt), 'dd/MM/yy') : '-'}
                        </span>
                        <span className={`text-xs uppercase font-black px-2 py-0.5 rounded-md border ${
                          isOffer
                            ? 'bg-green-500/10 text-green-400 border-green-500/20'
                            : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        }`}>
                          {isOffer ? '↑ Venta' : '↓ Compra'}
                        </span>
                      </div>

                      <h5 className="font-black text-xs text-white truncate mb-1.5">{clientName}</h5>

                      <div className="flex items-center gap-1.5 mb-2.5">
                        <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md border ${cropStyle.bg} ${cropStyle.text} ${cropStyle.border}`}>
                          {cropStyle.emoji} {opportunity.cropType}
                        </span>
                        <span className="text-xs font-bold text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-md font-mono">
                          {formatNumber(opportunity.quantity_tn)} TN
                        </span>
                      </div>

                      <div className={`w-full rounded-lg px-3 py-2 ${
                        isOffer ? 'bg-green-500/8 border border-green-500/15' : 'bg-blue-500/8 border border-blue-500/15'
                      }`}>
                        <p className={`text-xs font-black font-mono ${isOffer ? 'text-green-400' : 'text-blue-400'}`}>
                          {opportunity.priceMode === 'a_negociar' ? 'A negociar' : `$${formatNumber(opportunity.price_usd)} USD/tn`}
                        </p>
                        {opportunity.location && (
                          <p className="text-xs text-zinc-600 mt-0.5 truncate">📍 {opportunity.location}</p>
                        )}
                      </div>

                      {(opportunity.nextAction || opportunity.expiresAt || opportunity.lostReason) && (
                        <div className="space-y-0.5 text-xs text-zinc-500 border-t border-zinc-800 mt-2.5 pt-2">
                          {opportunity.nextAction && <p className="truncate"><span className="text-zinc-600">▶</span> {opportunity.nextAction}</p>}
                          {opportunity.expiresAt && <p><span className="text-zinc-600">⏱</span> Vence {format(new Date(opportunity.expiresAt), 'dd/MM/yy')}</p>}
                          {opportunity.lostReason && <p className="text-red-400"><span className="text-zinc-600">✕</span> {opportunity.lostReason}</p>}
                        </div>
                      )}

                      <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                        <select
                          value={opportunity.status || 'abierta'}
                          onChange={event => onStatusChange(opportunity.id, event.target.value)}
                          className="bg-zinc-900 border border-zinc-700/80 text-zinc-300 text-xs rounded-lg px-2 py-1 outline-none font-mono cursor-pointer flex-1 max-w-35"
                        >
                          <option value="abierta">📂 Abierta</option>
                          <option value="negociacion">🤝 Negociación</option>
                          <option value="esperando_confirmacion">⏳ Confirmación</option>
                          <option value="ganada">🏆 Ganada</option>
                          <option value="perdida">❌ Perdida</option>
                          <option value="vencida">⌛ Vencida</option>
                        </select>

                        <div className="flex items-center gap-1">
                          {clientPhone && (
                            <button
                              type="button"
                              onClick={event => {
                                event.stopPropagation();
                                onOpenWhatsApp(clientPhone, opportunity.clientId, clientName, {
                                  cropType: opportunity.cropType,
                                  quantity_tn: opportunity.quantity_tn,
                                  price_usd: opportunity.price_usd,
                                  location: opportunity.location,
                                });
                              }}
                              className="p-1.5 text-green-400 bg-green-500/10 hover:bg-green-500/20 rounded-lg transition-colors cursor-pointer border border-green-500/20"
                              title="WhatsApp"
                            >
                              <Phone className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={event => { event.stopPropagation(); onDelete(opportunity.id); }}
                            className="p-1.5 text-zinc-400 bg-zinc-800 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer border border-zinc-700 hover:border-red-500/20"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
