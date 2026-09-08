import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { ARGENTINE_REGIONS, PROVINCES } from '../../data/regions';
import type { Client } from '../../hooks/useClients';

export type OpportunityFormValues = {
  clientId: string;
  cropType: string;
  quantity_tn: string;
  price_usd: string;
  location: string;
  priceMode: 'fijo' | 'a_negociar';
  deliveryDate: string;
  expiresAt: string;
  paymentTerms: string;
  grainQuality: string;
  nextAction: string;
};

type OpportunityFormModalProps = {
  isOpen: boolean;
  kind: 'oferta' | 'demanda';
  clients: Client[];
  clientsLoading: boolean;
  onClose: () => void;
  onSubmit: (values: OpportunityFormValues, kind: 'oferta' | 'demanda') => Promise<void>;
};

const fieldClass =
  'w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-green-500';

const defaultExpiryDate = () => {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};

const emptyForm = (): OpportunityFormValues => ({
  clientId: '',
  cropType: 'soja',
  quantity_tn: '',
  price_usd: '',
  location: '',
  priceMode: 'fijo',
  deliveryDate: '',
  expiresAt: defaultExpiryDate(),
  paymentTerms: '',
  grainQuality: '',
  nextAction: 'Contactar y validar condiciones',
});

function buildLocation(prov: string, loc: string, custom: string) {
  if (prov === 'Otra') return custom.trim();
  if (!prov) return '';
  if (loc === 'Otro') return custom.trim() ? `${custom.trim()}, ${prov}` : prov;
  if (loc) return `${loc}, ${prov}`;
  return prov;
}

export function OpportunityFormModal({
  isOpen,
  kind,
  clients,
  clientsLoading,
  onClose,
  onSubmit,
}: OpportunityFormModalProps) {
  const isOffer = kind === 'oferta';
  const [formData, setFormData] = useState<OpportunityFormValues>(emptyForm);
  const [provincia, setProvincia] = useState('');
  const [localidad, setLocalidad] = useState('');
  const [customLocalidad, setCustomLocalidad] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setFormData(emptyForm());
    setProvincia('');
    setLocalidad('');
    setCustomLocalidad('');
    setError('');
    setSubmitting(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const syncLocation = (prov: string, loc: string, custom: string) => {
    const location = buildLocation(prov, loc, custom);
    setFormData(prev => ({ ...prev, location }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (!formData.clientId) {
      setError('Seleccione un cliente válido');
      return;
    }
    if (Number(formData.quantity_tn) <= 0) {
      setError('Ingrese una cantidad mayor a 0 TN');
      return;
    }
    if (formData.priceMode === 'fijo' && Number(formData.price_usd) <= 0) {
      setError('Ingrese un precio o marque A negociar');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(formData, kind);
      onClose();
    } catch {
      // El toast de error lo dispara la página.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in font-sans"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="opportunity-form-title"
        className="bg-zinc-900 border border-zinc-700 rounded-t-3xl sm:rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl animate-slide-up sm:animate-scale-up"
        onClick={event => event.stopPropagation()}
      >
        <div className="sm:hidden pt-3 pb-1 flex justify-center">
          <div className="w-12 h-1 bg-zinc-600 rounded-full" />
        </div>

        <div className="flex items-start justify-between gap-4 px-4 py-4 sm:px-6 border-b border-zinc-800">
          <div className="min-w-0">
            <p className={`text-xs font-bold uppercase tracking-wider ${isOffer ? 'text-green-400' : 'text-blue-400'}`}>
              {isOffer ? 'Oferta de venta' : 'Demanda de compra'}
            </p>
            <h2 id="opportunity-form-title" className="text-lg font-black text-white mt-0.5">
              {isOffer ? 'Nueva oferta' : 'Nueva demanda'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg shrink-0"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form id="opportunity-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 space-y-4">
          {clients.length === 0 && !clientsLoading ? (
            <div className="rounded-xl bg-zinc-800/50 border border-zinc-700 px-4 py-6 text-center">
              <p className="text-sm font-semibold text-white">Todavía no hay clientes</p>
              <p className="text-xs text-zinc-400 mt-1">Cargá un cliente para poder registrar la oportunidad.</p>
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Cliente</label>
              <select
                required
                value={formData.clientId}
                onChange={e => setFormData({ ...formData, clientId: e.target.value })}
                className={fieldClass}
              >
                <option value="">Seleccione cliente...</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Grano</label>
              <select
                required
                value={formData.cropType}
                onChange={e => setFormData({ ...formData, cropType: e.target.value })}
                className={fieldClass}
              >
                <option value="soja">Soja</option>
                <option value="maiz">Maíz</option>
                <option value="trigo">Trigo</option>
                <option value="sorgo">Sorgo</option>
                <option value="girasol">Girasol</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Toneladas</label>
              <input
                required
                type="number"
                min="1"
                value={formData.quantity_tn}
                onChange={e => setFormData({ ...formData, quantity_tn: e.target.value })}
                placeholder="Tn"
                className={fieldClass}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Modalidad de precio</label>
              <select
                value={formData.priceMode}
                onChange={e => setFormData({ ...formData, priceMode: e.target.value as 'fijo' | 'a_negociar' })}
                className={fieldClass}
              >
                <option value="fijo">Precio fijo</option>
                <option value="a_negociar">A negociar</option>
              </select>
            </div>

            {formData.priceMode === 'fijo' && (
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Precio (USD/tn)</label>
                <input
                  required
                  type="number"
                  min="1"
                  step="0.5"
                  value={formData.price_usd}
                  onChange={e => setFormData({ ...formData, price_usd: e.target.value })}
                  placeholder="USD/tn"
                  className={fieldClass}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Provincia (destino)</label>
              <select
                value={provincia}
                onChange={e => {
                  const value = e.target.value;
                  setProvincia(value);
                  setLocalidad('');
                  setCustomLocalidad('');
                  syncLocation(value, '', '');
                }}
                className={fieldClass}
              >
                <option value="">Seleccionar Prov...</option>
                {PROVINCES.map(province => (
                  <option key={province} value={province}>{province}</option>
                ))}
                <option value="Otra">Otra Provincia / Exterior...</option>
              </select>
            </div>

            {provincia && provincia !== 'Otra' && (
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Localidad (destino)</label>
                <select
                  value={localidad}
                  onChange={e => {
                    const value = e.target.value;
                    setLocalidad(value);
                    if (value !== 'Otro') setCustomLocalidad('');
                    syncLocation(provincia, value, value === 'Otro' ? customLocalidad : '');
                  }}
                  className={fieldClass}
                >
                  <option value="">Seleccionar Loc...</option>
                  {ARGENTINE_REGIONS[provincia]?.map(place => (
                    <option key={place} value={place}>{place}</option>
                  ))}
                  <option value="Otro">Otro (Escribir)...</option>
                </select>
              </div>
            )}

            {(provincia === 'Otra' || localidad === 'Otro') && (
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Destino personalizado</label>
                <input
                  type="text"
                  required
                  value={customLocalidad}
                  onChange={e => {
                    const value = e.target.value;
                    setCustomLocalidad(value);
                    syncLocation(provincia, localidad, value);
                  }}
                  placeholder="Ej: Rosario"
                  className={fieldClass}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Fecha de entrega</label>
              <input
                type="date"
                value={formData.deliveryDate}
                onChange={e => setFormData({ ...formData, deliveryDate: e.target.value })}
                className={fieldClass}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Vigente hasta</label>
              <input
                required
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={formData.expiresAt}
                onChange={e => setFormData({ ...formData, expiresAt: e.target.value })}
                className={fieldClass}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Condición de pago</label>
              <input
                value={formData.paymentTerms}
                onChange={e => setFormData({ ...formData, paymentTerms: e.target.value })}
                placeholder="Ej: 7 días"
                className={fieldClass}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Calidad</label>
              <input
                value={formData.grainQuality}
                onChange={e => setFormData({ ...formData, grainQuality: e.target.value })}
                placeholder="Ej: grado 2"
                className={fieldClass}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Próxima acción</label>
              <input
                value={formData.nextAction}
                onChange={e => setFormData({ ...formData, nextAction: e.target.value })}
                placeholder="Qué hay que hacer después"
                className={fieldClass}
              />
            </div>
          </div>

          {error ? (
            <div className="rounded-lg bg-red-500/10 border border-red-500/25 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          ) : null}
        </form>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 px-4 py-4 sm:px-6 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-bold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="opportunity-form"
            disabled={clientsLoading || submitting || clients.length === 0}
            className={`px-5 py-2.5 rounded-lg text-xs font-bold text-white transition-colors flex items-center justify-center gap-2 disabled:bg-zinc-700 disabled:text-zinc-500 ${
              isOffer ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Registrar {isOffer ? 'oferta' : 'demanda'}
          </button>
        </div>
      </div>
    </div>
  );
}
