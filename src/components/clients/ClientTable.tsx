import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Mail, MapPin, MessageSquare, Phone, FileText } from 'lucide-react';

export type ClientListItem = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  cuit?: string;
  zona?: string;
  categoria?: string;
  tipoCliente?: string;
  relevado?: string;
  hectareasPropias?: number | string;
  hectareasAlquiladas?: number | string;
  potencialAgroq?: number | string;
  potencialFerti?: number | string;
  fechaUltimoContacto?: string;
  hasSoja?: number | string;
  hasMaiz?: number | string;
  hasTrigo?: number | string;
  hasGirasol?: number | string;
  hasSorgo?: number | string;
};

export type ClientTableProps = {
  clients: ClientListItem[];
  onSelect: (client: ClientListItem) => void;
  onOpenWhatsApp: (phone: string, id: string, name: string) => void;
  onCopyCuit: (cuit: string) => void;
  onResetFilters: () => void;
};

const PAGE_SIZE = 12;

function avatarClass(tipoCliente?: string) {
  if (tipoCliente === 'Ventas') return 'bg-emerald-950/40 text-emerald-400 border border-emerald-800';
  if (tipoCliente === 'Clave') return 'bg-indigo-950/40 text-indigo-400 border border-indigo-800';
  if (tipoCliente === 'Estratégico') return 'bg-purple-950/40 text-purple-400 border border-purple-800';
  if (tipoCliente === 'Prospecto') return 'bg-amber-950/40 text-amber-500 border border-amber-800';
  return 'bg-blue-950/40 text-blue-400 border border-blue-800';
}

function initials(name?: string) {
  return (name || 'CR')
    .split(' ')
    .slice(0, 2)
    .map(word => word[0])
    .join('')
    .toUpperCase();
}

function cropTags(client: ClientListItem) {
  const tags: { code: string; color: string }[] = [];
  if (Number(client.hasSoja) > 0) tags.push({ code: 'Sj', color: 'bg-green-950/60 text-green-400 border-green-900/30' });
  if (Number(client.hasMaiz) > 0) tags.push({ code: 'Mz', color: 'bg-yellow-950/60 text-yellow-400 border-yellow-900/30' });
  if (Number(client.hasTrigo) > 0) tags.push({ code: 'Tg', color: 'bg-orange-950/60 text-orange-400 border-orange-900/30' });
  if (Number(client.hasGirasol) > 0) tags.push({ code: 'Gs', color: 'bg-amber-950/60 text-amber-500 border-amber-900/30' });
  if (Number(client.hasSorgo) > 0) tags.push({ code: 'Sg', color: 'bg-red-950/60 text-red-400 border-red-900/30' });
  return tags;
}

export function ClientTable({
  clients,
  onSelect,
  onOpenWhatsApp,
  onCopyCuit,
  onResetFilters,
}: ClientTableProps) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [clients]);

  const totalPages = Math.max(1, Math.ceil(clients.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return clients.slice(start, start + PAGE_SIZE);
  }, [clients, currentPage]);

  if (clients.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm font-semibold text-white">Nada coincide con esta búsqueda</p>
        <button
          type="button"
          onClick={onResetFilters}
          className="mt-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg"
        >
          Restablecer Filtros
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {pageItems.map(customer => {
          const totalHas = (Number(customer.hectareasPropias) || 0) + (Number(customer.hectareasAlquiladas) || 0);
          const potentialUSD = (Number(customer.potencialAgroq) || 0) + (Number(customer.potencialFerti) || 0);
          const contactDate = customer.fechaUltimoContacto || '';
          const tags = cropTags(customer);

          return (
            <div
              key={customer.id}
              onClick={() => onSelect(customer)}
              className="bg-zinc-900 border border-zinc-800 hover:border-green-500/50 rounded-2xl p-4 sm:p-5 cursor-pointer transition-all lg:hover:-translate-y-1.5 duration-300 hover:shadow-xl relative group overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-green-500/10 to-transparent group-hover:via-green-500/40 transition-all duration-300" />

              <div className="flex items-start gap-3.5">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-xs select-none shadow-inner shrink-0 ${avatarClass(customer.tipoCliente)}`}>
                  {initials(customer.name)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-bold text-base text-zinc-100 group-hover:text-white transition-colors truncate" title={customer.name}>
                      {customer.name}
                    </h3>
                    {customer.relevado === 'Sí' && (
                      <span className="shrink-0 text-xs text-green-400 flex items-center bg-zinc-950 p-0.5 rounded-full border border-green-950" title="Productor Relevado Directamente">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                      {customer.categoria || 'Productor'}
                    </span>
                    <span className="text-xs font-medium text-zinc-400 truncate flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-red-500/60" /> {customer.zona || 'Sin Zona'}
                    </span>
                  </div>
                </div>
              </div>

              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3.5 border-t border-zinc-800 pt-3">
                  <span className="text-xs uppercase font-bold text-zinc-500 mr-1 flex items-center">Siembras:</span>
                  {tags.map((tag, idx) => (
                    <span key={idx} className={`text-xs font-bold px-1.5 py-0.5 rounded-md border ${tag.color}`}>
                      {tag.code}
                    </span>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3.5 mt-4 border-t border-zinc-800 pt-3.5 text-xs">
                <div>
                  <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider mb-0.5">Hectáreas Operadas</p>
                  <p className="text-zinc-200 font-extrabold flex items-baseline gap-1">
                    {totalHas.toLocaleString()} <span className="text-xs text-zinc-500 font-normal">ha</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider mb-0.5">Potencial Insumos</p>
                  <p className="text-green-400 font-extrabold">
                    ${potentialUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3.5 border-t border-zinc-800 flex justify-between items-center text-xs">
                <div className="font-mono text-zinc-500 flex items-center">
                  <span className="bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700 select-all">
                    {customer.cuit || 'Sin CUIT'}
                  </span>
                  {customer.cuit && (
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        onCopyCuit(customer.cuit as string);
                      }}
                      className="ml-1.5 p-1 text-zinc-500 hover:text-green-400 transition-colors"
                      title="Copiar CUIT"
                    >
                      <FileText className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="text-zinc-400 font-medium">
                  {contactDate ? (
                    <span>Visita: {contactDate}</span>
                  ) : (
                    <span className="text-amber-500/70">Sin Contacto</span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-end gap-1.5 lg:absolute lg:right-4 lg:top-4 lg:mt-0 lg:opacity-0 lg:group-hover:opacity-100 transition-all duration-300" onClick={event => event.stopPropagation()}>
                {customer.phone && (
                  <>
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        onOpenWhatsApp(customer.phone as string, customer.id, customer.name);
                      }}
                      className="w-9 h-9 flex items-center justify-center bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-lg border border-emerald-500/15 transition-all duration-150 cursor-pointer"
                      title="Enviar WhatsApp con Plantilla"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href={`tel:${customer.phone}`}
                      onClick={event => event.stopPropagation()}
                      className="w-9 h-9 flex items-center justify-center bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white rounded-lg border border-blue-500/15 transition-all duration-150"
                      title={`Llamar: ${customer.phone}`}
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                  </>
                )}
                {customer.email && (
                  <a
                    href={`mailto:${customer.email}`}
                    onClick={event => event.stopPropagation()}
                    className="w-9 h-9 flex items-center justify-center bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-lg border border-indigo-500/15 transition-all duration-150"
                    title={`Escribir a: ${customer.email}`}
                  >
                    <Mail className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-zinc-500 font-mono">
            {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, clients.length)} de {clients.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage(current => Math.max(1, current - 1))}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-zinc-400 font-mono min-w-12 text-center">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(current => Math.min(totalPages, current + 1))}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
