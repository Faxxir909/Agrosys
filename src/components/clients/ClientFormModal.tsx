import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';
import { ARGENTINE_REGIONS, PROVINCES } from '../../data/regions';

export type ClientFormValues = {
  name: string;
  anoFiscal: string;
  relevado: string;
  tipoCliente: string;
  zona: string;
  categoria: string;
  hectareasPropias: string | number;
  hectareasAlquiladas: string | number;
  hasGanaderia: string | number;
  hasSoja: string | number;
  rtoSjHa: string | number;
  porcEntregaCosechaSoja: string | number;
  precioObjetivoSoja: string | number;
  hasMaiz: string | number;
  rtoMzHa: string | number;
  porcEntregaCosechaMaiz: string | number;
  precioObjetivoMaiz: string | number;
  hasSorgo: string | number;
  rtoSgHa: string | number;
  porcEntregaCosechaSorgo: string | number;
  precioObjetivoSorgo: string | number;
  hasGirasol: string | number;
  rtoGsHa: string | number;
  porcEntregaCosechaGirasol: string | number;
  precioObjetivoGirasol: string | number;
  hasTrigo: string | number;
  rtoTgHa: string | number;
  porcEntregaCosechaTrigo: string | number;
  precioObjetivoTrigo: string | number;
  comprasPreCampana: boolean;
  productosPremium: boolean;
  potencialAgroq: string | number;
  budgetAgroq: string | number;
  potencialFerti: string | number;
  budgetFerti: string | number;
  fechaUltimoContacto: string;
  proximaAccion: string;
  fechaProximosPasos: string;
  observaciones: string;
  type: string;
  phone: string;
  email: string;
  cuit: string;
  status: string;
  id?: string;
};

export type ClientFormModalProps = {
  isOpen: boolean;
  initialData?: Partial<ClientFormValues> | null;
  onClose: () => void;
  onSubmit: (values: ClientFormValues) => Promise<void>;
};

const fieldClass =
  'w-full bg-zinc-800 border border-zinc-600 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-green-500';
const compactFieldClass =
  'w-full bg-zinc-800 rounded px-3 py-1.5 text-white text-sm outline-none border border-zinc-700 focus:border-green-500';

function emptyForm(): ClientFormValues {
  return {
    name: '',
    anoFiscal: 'FY2425',
    relevado: 'No',
    tipoCliente: 'Prospecto',
    zona: '',
    categoria: 'Productor',
    hectareasPropias: '',
    hectareasAlquiladas: '',
    hasGanaderia: '',
    hasSoja: '',
    rtoSjHa: '',
    porcEntregaCosechaSoja: '',
    precioObjetivoSoja: '',
    hasMaiz: '',
    rtoMzHa: '',
    porcEntregaCosechaMaiz: '',
    precioObjetivoMaiz: '',
    hasSorgo: '',
    rtoSgHa: '',
    porcEntregaCosechaSorgo: '',
    precioObjetivoSorgo: '',
    hasGirasol: '',
    rtoGsHa: '',
    porcEntregaCosechaGirasol: '',
    precioObjetivoGirasol: '',
    hasTrigo: '',
    rtoTgHa: '',
    porcEntregaCosechaTrigo: '',
    precioObjetivoTrigo: '',
    comprasPreCampana: false,
    productosPremium: false,
    potencialAgroq: '',
    budgetAgroq: '',
    potencialFerti: '',
    budgetFerti: '',
    fechaUltimoContacto: '',
    proximaAccion: '',
    fechaProximosPasos: '',
    observaciones: '',
    type: 'productor',
    phone: '',
    email: '',
    cuit: '',
    status: 'activo',
  };
}

function toDateInput(value: unknown) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function mergeInitialData(data?: Partial<ClientFormValues> | null): ClientFormValues {
  const base = emptyForm();
  if (!data) return base;
  return {
    ...base,
    ...data,
    fechaUltimoContacto: toDateInput(data.fechaUltimoContacto),
    fechaProximosPasos: toDateInput(data.fechaProximosPasos),
    comprasPreCampana: Boolean(data.comprasPreCampana),
    productosPremium: Boolean(data.productosPremium),
  };
}

function parseZona(zonaStr: string) {
  let parsedProv = '';
  let parsedLoc = '';
  const splitComma = zonaStr.split(',');
  if (splitComma.length >= 2) {
    const potentialLoc = splitComma[0].trim();
    const potentialProv = splitComma[1].trim();
    const foundProv = Object.keys(ARGENTINE_REGIONS).find(
      province => province.toLowerCase() === potentialProv.toLowerCase()
    );
    if (foundProv) {
      parsedProv = foundProv;
      parsedLoc = potentialLoc;
    }
  }
  if (!parsedProv && zonaStr) {
    const cleanZona = zonaStr.toLowerCase().trim();
    for (const [prov, localities] of Object.entries(ARGENTINE_REGIONS)) {
      const matchedLoc = localities.find(
        loc => loc.toLowerCase() === cleanZona || cleanZona.includes(loc.toLowerCase())
      );
      if (matchedLoc) {
        parsedProv = prov;
        parsedLoc = matchedLoc;
        break;
      }
    }
  }
  if (zonaStr && !parsedProv) return { provincia: 'Otra', localidad: 'Otro', custom: zonaStr };
  if (parsedProv) {
    const exists = ARGENTINE_REGIONS[parsedProv]?.includes(parsedLoc);
    return exists
      ? { provincia: parsedProv, localidad: parsedLoc, custom: '' }
      : { provincia: parsedProv, localidad: 'Otro', custom: parsedLoc };
  }
  return { provincia: '', localidad: '', custom: '' };
}

function buildZona(prov: string, loc: string, custom: string) {
  if (prov === 'Otra') return custom.trim();
  if (!prov) return '';
  if (loc === 'Otro') return custom.trim() ? `${custom.trim()}, ${prov}` : prov;
  if (loc) return `${loc}, ${prov}`;
  return prov;
}

export function ClientFormModal({ isOpen, initialData, onClose, onSubmit }: ClientFormModalProps) {
  const isEditing = Boolean(initialData?.id);
  const [formData, setFormData] = useState<ClientFormValues>(emptyForm);
  const [provincia, setProvincia] = useState('');
  const [localidad, setLocalidad] = useState('');
  const [customLocalidad, setCustomLocalidad] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const next = mergeInitialData(initialData);
    setFormData(next);
    const zona = parseZona(next.zona || '');
    setProvincia(zona.provincia);
    setLocalidad(zona.localidad);
    setCustomLocalidad(zona.custom);
    setError('');
    setSubmitting(false);
  }, [isOpen, initialData]);

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

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const target = event.target;
    const { name, value } = target;
    const checked = (target as HTMLInputElement).checked;
    const type = (target as HTMLInputElement).type;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const syncZona = (prov: string, loc: string, custom: string) => {
    setFormData(prev => ({ ...prev, zona: buildZona(prov, loc, custom) }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!formData.name.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(formData);
      onClose();
    } catch {
      setError('No se pudo guardar el cliente.');
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
        aria-labelledby="client-form-title"
        className="bg-zinc-900 border border-zinc-700 rounded-t-3xl sm:rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="sm:hidden pt-3 pb-1 flex justify-center">
          <div className="w-12 h-1 bg-zinc-600 rounded-full" />
        </div>

        <div className="flex items-start justify-between gap-4 px-4 py-4 sm:px-6 border-b border-zinc-800">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-green-400">
              {isEditing ? 'Edición' : 'Alta'}
            </p>
            <h2 id="client-form-title" className="text-lg font-black text-white mt-0.5">
              {isEditing ? 'Editar cliente' : 'Nuevo cliente agropecuario'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form id="client-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-6">
          <section className="bg-zinc-800/50 p-4 sm:p-6 rounded-xl border border-zinc-800">
            <h3 className="text-sm font-bold text-white mb-4 border-b border-zinc-800 pb-2">1. Datos básicos y contacto</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Nombre / Razón Social *</label>
                <input required type="text" name="name" value={formData.name} onChange={handleChange} className={fieldClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">CUIT</label>
                <input type="text" name="cuit" value={formData.cuit || ''} onChange={handleChange} className={fieldClass} placeholder="Ej: 20-12345678-9" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Teléfono</label>
                <input type="tel" name="phone" value={formData.phone || ''} onChange={handleChange} className={fieldClass} placeholder="Ej: +54 9 11..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Email</label>
                <input type="email" name="email" value={formData.email || ''} onChange={handleChange} className={fieldClass} placeholder="correo@ejemplo.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Estado</label>
                <select name="status" value={formData.status || 'activo'} onChange={handleChange} className={fieldClass}>
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                  <option value="suspendido">Suspendido</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Año Fiscal</label>
                <select name="anoFiscal" value={formData.anoFiscal} onChange={handleChange} className={fieldClass}>
                  <option value="FY2324">FY2324</option>
                  <option value="FY2425">FY2425</option>
                  <option value="FY2526">FY2526</option>
                  <option value="FY2627">FY2627</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Tipo de Cliente</label>
                <select name="tipoCliente" value={formData.tipoCliente} onChange={handleChange} className={fieldClass}>
                  <option value="Prospecto">Prospecto</option>
                  <option value="Ventas">Ventas</option>
                  <option value="Clave">Clave</option>
                  <option value="Estratégico">Estratégico</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Categoría</label>
                <select name="categoria" value={formData.categoria} onChange={handleChange} className={fieldClass}>
                  <option value="Productor">Productor</option>
                  <option value="Acopiador">Acopiador</option>
                  <option value="Canjeador">Canjeador</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Provincia</label>
                <select
                  value={provincia}
                  onChange={event => {
                    const value = event.target.value;
                    setProvincia(value);
                    setLocalidad('');
                    setCustomLocalidad('');
                    syncZona(value, '', '');
                  }}
                  className={fieldClass}
                >
                  <option value="">-- Seleccionar Provincia --</option>
                  {PROVINCES.map(province => (
                    <option key={province} value={province}>{province}</option>
                  ))}
                  <option value="Otra">Otra Provincia / Exterior...</option>
                </select>
              </div>
              {provincia && provincia !== 'Otra' && (
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Localidad / Zona</label>
                  <select
                    value={localidad}
                    onChange={event => {
                      const value = event.target.value;
                      setLocalidad(value);
                      if (value !== 'Otro') setCustomLocalidad('');
                      syncZona(provincia, value, value === 'Otro' ? customLocalidad : '');
                    }}
                    className={fieldClass}
                  >
                    <option value="">-- Seleccionar Localidad --</option>
                    {ARGENTINE_REGIONS[provincia]?.map(place => (
                      <option key={place} value={place}>{place}</option>
                    ))}
                    <option value="Otro">Otro (Ingresar manualmente)...</option>
                  </select>
                </div>
              )}
              {(provincia === 'Otra' || localidad === 'Otro') && (
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Localidad / Zona manual</label>
                  <input
                    type="text"
                    required
                    value={customLocalidad}
                    onChange={event => {
                      const value = event.target.value;
                      setCustomLocalidad(value);
                      syncZona(provincia, localidad, value);
                    }}
                    className={fieldClass}
                    placeholder="Ej: Marcos Juárez"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Hectáreas propias</label>
                <input type="number" name="hectareasPropias" value={formData.hectareasPropias} onChange={handleChange} className={fieldClass} placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Hectáreas alquiladas</label>
                <input type="number" name="hectareasAlquiladas" value={formData.hectareasAlquiladas} onChange={handleChange} className={fieldClass} placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Has. ganadería</label>
                <input type="number" name="hasGanaderia" value={formData.hasGanaderia} onChange={handleChange} className={fieldClass} placeholder="0" />
              </div>
            </div>
          </section>

          <section className="bg-zinc-800/50 p-4 sm:p-6 rounded-xl border border-zinc-800">
            <h3 className="text-sm font-bold text-white mb-4 border-b border-zinc-800 pb-2">2. Negocio agrícola (granos)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-zinc-900 p-4 rounded-lg border border-zinc-700">
                <h4 className="font-bold text-green-400 mb-3 uppercase text-xs tracking-wider">Soja</h4>
                <div className="space-y-3">
                  <div><label className="text-xs text-zinc-400 mb-1 block">Has sembradas</label><input type="number" name="hasSoja" value={formData.hasSoja} onChange={handleChange} className={compactFieldClass} /></div>
                  <div><label className="text-xs text-zinc-400 mb-1 block">Rto estimado (kg/ha)</label><input type="number" name="rtoSjHa" value={formData.rtoSjHa} onChange={handleChange} className={compactFieldClass} /></div>
                  <div><label className="text-xs text-zinc-400 mb-1 block">Precio obj. (USD)</label><input type="number" name="precioObjetivoSoja" value={formData.precioObjetivoSoja} onChange={handleChange} className={compactFieldClass} /></div>
                  <div><label className="text-xs text-zinc-400 mb-1 block">% Entrega cosecha</label><input type="number" name="porcEntregaCosechaSoja" value={formData.porcEntregaCosechaSoja} onChange={handleChange} className={compactFieldClass} /></div>
                </div>
              </div>
              <div className="bg-zinc-900 p-4 rounded-lg border border-zinc-700">
                <h4 className="font-bold text-yellow-400 mb-3 uppercase text-xs tracking-wider">Maíz</h4>
                <div className="space-y-3">
                  <div><label className="text-xs text-zinc-400 mb-1 block">Has sembradas</label><input type="number" name="hasMaiz" value={formData.hasMaiz} onChange={handleChange} className={compactFieldClass} /></div>
                  <div><label className="text-xs text-zinc-400 mb-1 block">Rto estimado (kg/ha)</label><input type="number" name="rtoMzHa" value={formData.rtoMzHa} onChange={handleChange} className={compactFieldClass} /></div>
                  <div><label className="text-xs text-zinc-400 mb-1 block">Precio obj. (USD)</label><input type="number" name="precioObjetivoMaiz" value={formData.precioObjetivoMaiz} onChange={handleChange} className={compactFieldClass} /></div>
                  <div><label className="text-xs text-zinc-400 mb-1 block">% Entrega cosecha</label><input type="number" name="porcEntregaCosechaMaiz" value={formData.porcEntregaCosechaMaiz} onChange={handleChange} className={compactFieldClass} /></div>
                </div>
              </div>
              <div className="bg-zinc-900 p-4 rounded-lg border border-zinc-700">
                <h4 className="font-bold text-orange-400 mb-3 uppercase text-xs tracking-wider">Trigo</h4>
                <div className="space-y-3">
                  <div><label className="text-xs text-zinc-400 mb-1 block">Has sembradas</label><input type="number" name="hasTrigo" value={formData.hasTrigo} onChange={handleChange} className={compactFieldClass} /></div>
                  <div><label className="text-xs text-zinc-400 mb-1 block">Rto estimado (kg/ha)</label><input type="number" name="rtoTgHa" value={formData.rtoTgHa} onChange={handleChange} className={compactFieldClass} /></div>
                  <div><label className="text-xs text-zinc-400 mb-1 block">Precio obj. (USD)</label><input type="number" name="precioObjetivoTrigo" value={formData.precioObjetivoTrigo} onChange={handleChange} className={compactFieldClass} /></div>
                  <div><label className="text-xs text-zinc-400 mb-1 block">% Entrega cosecha</label><input type="number" name="porcEntregaCosechaTrigo" value={formData.porcEntregaCosechaTrigo} onChange={handleChange} className={compactFieldClass} /></div>
                </div>
              </div>
              <div className="bg-zinc-900 p-4 rounded-lg border border-zinc-700">
                <h4 className="font-bold text-amber-500 mb-3 uppercase text-xs tracking-wider">Girasol</h4>
                <div className="space-y-3">
                  <div><label className="text-xs text-zinc-400 mb-1 block">Has sembradas</label><input type="number" name="hasGirasol" value={formData.hasGirasol} onChange={handleChange} className={compactFieldClass} /></div>
                  <div><label className="text-xs text-zinc-400 mb-1 block">Rto estimado (kg/ha)</label><input type="number" name="rtoGsHa" value={formData.rtoGsHa} onChange={handleChange} className={compactFieldClass} /></div>
                  <div><label className="text-xs text-zinc-400 mb-1 block">Precio obj. (USD)</label><input type="number" name="precioObjetivoGirasol" value={formData.precioObjetivoGirasol} onChange={handleChange} className={compactFieldClass} /></div>
                  <div><label className="text-xs text-zinc-400 mb-1 block">% Entrega cosecha</label><input type="number" name="porcEntregaCosechaGirasol" value={formData.porcEntregaCosechaGirasol} onChange={handleChange} className={compactFieldClass} /></div>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-zinc-800/50 p-4 sm:p-6 rounded-xl border border-zinc-800">
            <h3 className="text-sm font-bold text-white mb-4 border-b border-zinc-800 pb-2">3. Negocio de insumos</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Potencial Agroq. (USD)</label>
                <input type="number" name="potencialAgroq" value={formData.potencialAgroq} onChange={handleChange} className={fieldClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">PPTO Agroq. (USD)</label>
                <input type="number" name="budgetAgroq" value={formData.budgetAgroq} onChange={handleChange} className={fieldClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Potencial Ferti. (USD)</label>
                <input type="number" name="potencialFerti" value={formData.potencialFerti} onChange={handleChange} className={fieldClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">PPTO Ferti. (USD)</label>
                <input type="number" name="budgetFerti" value={formData.budgetFerti} onChange={handleChange} className={fieldClass} />
              </div>
              <label className="flex items-center gap-3 text-sm text-zinc-300">
                <input type="checkbox" name="comprasPreCampana" checked={formData.comprasPreCampana} onChange={handleChange} className="w-5 h-5 accent-green-500 rounded" />
                ¿Compra pre-campaña?
              </label>
              <label className="flex items-center gap-3 text-sm text-zinc-300">
                <input type="checkbox" name="productosPremium" checked={formData.productosPremium} onChange={handleChange} className="w-5 h-5 accent-green-500 rounded" />
                ¿Busca prod. premium?
              </label>
            </div>
          </section>

          <section className="bg-zinc-800/50 p-4 sm:p-6 rounded-xl border border-zinc-800">
            <h3 className="text-sm font-bold text-white mb-4 border-b border-zinc-800 pb-2">4. Gestión y seguimiento</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Fecha último contacto</label>
                <input type="date" name="fechaUltimoContacto" value={formData.fechaUltimoContacto} onChange={handleChange} className={fieldClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Fecha próximos pasos</label>
                <input type="date" name="fechaProximosPasos" value={formData.fechaProximosPasos} onChange={handleChange} className={fieldClass} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Próxima acción</label>
                <input type="text" name="proximaAccion" value={formData.proximaAccion} onChange={handleChange} className={fieldClass} placeholder="Ej: Llamar por cotización semilla" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Observaciones</label>
                <textarea name="observaciones" value={formData.observaciones} onChange={handleChange} rows={3} className={`${fieldClass} resize-none`} placeholder="Contexto general..." />
              </div>
            </div>
          </section>

          {error ? (
            <div className="rounded-lg bg-red-500/10 border border-red-500/25 px-3 py-2 text-xs text-red-300">{error}</div>
          ) : null}
        </form>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 px-4 py-4 sm:px-6 border-t border-zinc-800">
          <button type="button" onClick={onClose} className="px-4 py-2.5 text-xs font-bold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white">
            Cancelar
          </button>
          <button
            type="submit"
            form="client-form"
            disabled={submitting}
            className="px-5 py-2.5 rounded-lg text-xs font-bold text-white bg-green-600 hover:bg-green-700 disabled:bg-zinc-700 disabled:text-zinc-500 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isEditing ? 'Guardar cambios' : 'Registrar cliente'}
          </button>
        </div>
      </div>
    </div>
  );
}
