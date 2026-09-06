import React, { useMemo, useState } from 'react';
import { AlertCircle, CalendarDays, Check, Loader2, UserPlus, X } from 'lucide-react';
import { api } from '../lib/api';

type Props = {
  alert: any | null;
  clients: any[];
  onClose: () => void;
  onSuccess: (type: 'oferta' | 'demanda') => void;
};

const inputClass = 'w-full bg-[#252525] border border-[#444] rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-green-500';

function toInputDate(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function phonesMatch(left?: string, right?: string) {
  const a = String(left || '').replace(/\D/g, '');
  const b = String(right || '').replace(/\D/g, '');
  if (!a || !b) return false;
  const length = Math.min(8, a.length, b.length);
  return a.slice(-length) === b.slice(-length);
}

export function OpportunityReviewModal({ alert, clients, onClose, onSuccess }: Props) {
  const matchedClient = useMemo(() => {
    if (!alert) return null;
    return clients.find(client => client.id === alert.clientId) ||
      clients.find(client => phonesMatch(client.phone, alert.senderPhone)) || null;
  }, [alert, clients]);

  const [type, setType] = useState<'oferta' | 'demanda'>(alert?.suggestedType === 'demanda' ? 'demanda' : 'oferta');
  const [clientId, setClientId] = useState(matchedClient?.id || '');
  const [prospectName, setProspectName] = useState('');
  const [cropType, setCropType] = useState(alert?.suggestedCropType && alert.suggestedCropType !== 'desconocido' ? alert.suggestedCropType : 'soja');
  const [quantity, setQuantity] = useState(Number(alert?.suggestedQuantity) > 0 ? String(alert.suggestedQuantity) : '');
  const [priceMode, setPriceMode] = useState<'fijo' | 'a_negociar'>(Number(alert?.suggestedPrice) > 0 ? 'fijo' : 'a_negociar');
  const [price, setPrice] = useState(Number(alert?.suggestedPrice) > 0 ? String(alert.suggestedPrice) : '');
  const [location, setLocation] = useState(alert?.location || '');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [expiresAt, setExpiresAt] = useState(toInputDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));
  const [paymentTerms, setPaymentTerms] = useState(alert?.paymentTerms || '');
  const [grainQuality, setGrainQuality] = useState(alert?.grainQuality || '');
  const [nextAction, setNextAction] = useState('Contactar y validar condiciones');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!alert) return null;

  const hasClient = Boolean(clientId || prospectName.trim());
  const validQuantity = Number(quantity) > 0;
  const validPrice = priceMode === 'a_negociar' || Number(price) > 0;
  const canSave = hasClient && validQuantity && validPrice && Boolean(expiresAt) && !saving;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave) return;

    setSaving(true);
    setError('');
    try {
      let resolvedClientId = clientId;
      if (!resolvedClientId) {
        const createdClient = await api.clients.create({
          name: prospectName.trim(),
          type: type === 'oferta' ? 'productor' : 'comprador',
          phone: alert.senderPhone || '',
          status: 'prospecto',
          notes: `Prospecto creado desde alerta de WhatsApp: ${alert.sourceGroup || 'sin grupo'}`
        });
        resolvedClientId = createdClient.id;
      }

      await api.opportunities.create({
        type,
        clientId: resolvedClientId,
        cropType,
        quantity_tn: Number(quantity),
        price_usd: priceMode === 'a_negociar' ? 0 : Number(price),
        priceMode,
        location: location.trim() || 'A convenir',
        deliveryDate: deliveryDate || null,
        expiresAt,
        paymentTerms: paymentTerms.trim() || null,
        grainQuality: grainQuality.trim() || null,
        nextAction: nextAction.trim() || 'Contactar y validar condiciones',
        sourceAlertId: alert.id
      });
      onSuccess(type);
    } catch (err: any) {
      setError(err.message || 'No se pudo crear la oportunidad.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-0 sm:p-5 bg-black/80 backdrop-blur-sm animate-fade-in font-sans">
      <div className="w-full max-w-4xl max-h-[94dvh] sm:max-h-[92dvh] overflow-y-auto bg-[#1d1d1d] border border-zinc-700 rounded-t-3xl sm:rounded-2xl shadow-2xl animate-slide-up sm:animate-scale-up pb-safe sm:pb-0">
        
        {/* Mobile Grab Bar */}
        <div className="sm:hidden pt-3 pb-1 flex justify-center bg-[#1d1d1d]">
          <div className="w-12 h-1 bg-zinc-600 rounded-full" />
        </div>

        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 p-4 sm:p-5 border-b border-zinc-800 bg-[#1d1d1d]">
          <div className="min-w-0">
            <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-purple-400">Revisión obligatoria</p>
            <h2 className="text-base sm:text-lg font-black text-white mt-0.5 truncate">Convertir alerta en oportunidad</h2>
            <p className="text-[10px] sm:text-xs text-zinc-400 mt-0.5">Se marcará como procesada al guardar.</p>
          </div>
          <button type="button" onClick={onClose} className="w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg shrink-0" title="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 sm:space-y-5">
          <div className="bg-[#0b141a] border border-[#26333d] rounded-lg p-4 text-sm text-zinc-200">
            <p className="text-[10px] uppercase font-bold text-emerald-500 mb-2">Mensaje original</p>
            <p className="italic">“{alert.rawMessage}”</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Operación</label>
              <select value={type} onChange={e => setType(e.target.value as 'oferta' | 'demanda')} className={inputClass}>
                <option value="oferta">Oferta de venta</option>
                <option value="demanda">Demanda de compra</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Grano</label>
              <select value={cropType} onChange={e => setCropType(e.target.value)} className={inputClass}>
                <option value="soja">Soja</option>
                <option value="maiz">Maíz</option>
                <option value="trigo">Trigo</option>
                <option value="sorgo">Sorgo</option>
                <option value="girasol">Girasol</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Cantidad obligatoria (TN)</label>
              <input type="number" min="1" step="0.01" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="Cantidad pendiente" className={inputClass} />
              {!validQuantity && <p className="text-[10px] text-amber-400 mt-1">Completá la cantidad detectada o confirmada.</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Modalidad de precio</label>
              <select value={priceMode} onChange={e => setPriceMode(e.target.value as 'fijo' | 'a_negociar')} className={inputClass}>
                <option value="fijo">Precio fijo</option>
                <option value="a_negociar">A negociar</option>
              </select>
            </div>
            {priceMode === 'fijo' && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Precio (USD/TN)</label>
                <input type="number" min="0.01" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="USD/TN" className={inputClass} />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Cliente</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)} className={inputClass}>
                <option value="">Crear prospecto nuevo</option>
                {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </div>
            {!clientId && (
              <div className="sm:col-span-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-1.5"><UserPlus className="w-3.5 h-3.5" /> Nombre del prospecto</label>
                <input value={prospectName} onChange={e => setProspectName(e.target.value)} placeholder="Nombre o empresa" className={inputClass} />
                <p className="text-[10px] text-zinc-500 mt-1">Se vinculará al teléfono {alert.senderPhone || 'sin identificar'}.</p>
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Ubicación / destino</label>
              <input value={location} onChange={e => setLocation(e.target.value)} placeholder="A convenir" className={inputClass} />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-1.5"><CalendarDays className="w-3.5 h-3.5" /> Entrega</label>
              <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-1.5"><CalendarDays className="w-3.5 h-3.5" /> Vigente hasta</label>
              <input required type="date" min={toInputDate(new Date())} value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Condición de pago</label>
              <input value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="Ej: 7 días" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Calidad</label>
              <input value={grainQuality} onChange={e => setGrainQuality(e.target.value)} placeholder="Ej: grado 2" className={inputClass} />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Próxima acción</label>
              <input value={nextAction} onChange={e => setNextAction(e.target.value)} className={inputClass} />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2 border-t border-zinc-800">
            <button type="button" onClick={onClose} className="min-h-11 px-4 py-2.5 text-xs font-bold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white">Cancelar</button>
            <button type="submit" disabled={!canSave} className="min-h-11 px-5 py-2.5 text-xs font-black rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Guardar oportunidad
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
