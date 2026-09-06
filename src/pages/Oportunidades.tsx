import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle2, Circle, Info, Loader2, MessageSquare, Phone, ChevronDown, ChevronUp, LayoutGrid, List, TrendingUp, Scale, BarChart3 } from 'lucide-react';
import { WhatsappTemplateModal } from '../components/WhatsappTemplateModal';
import { ARGENTINE_REGIONS, PROVINCES } from '../data/regions';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useOpportunities } from '../hooks/useOpportunities';
import { useClients } from '../hooks/useClients';
import { useWhatsAppAlerts } from '../hooks/useWhatsAppAlerts';
import { useUI } from '../contexts/UIContext';
import { format } from 'date-fns';
import { WhatsappQRSetup } from '../components/WhatsappQRSetup';
import { OpportunityReviewModal } from '../components/OpportunityReviewModal';

const CROP_COLORS: Record<string, { bg: string; text: string; border: string; emoji: string }> = {
  soja:    { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/30',  emoji: '🌱' },
  maiz:    { bg: 'bg-yellow-500/10',  text: 'text-yellow-400',  border: 'border-yellow-500/30', emoji: '🌽' },
  trigo:   { bg: 'bg-orange-500/10',  text: 'text-orange-400',  border: 'border-orange-500/30', emoji: '🌾' },
  sorgo:   { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/30',    emoji: '🌿' },
  girasol: { bg: 'bg-lime-500/10',    text: 'text-lime-400',    border: 'border-lime-500/30',   emoji: '🌻' },
};
const getCropStyle = (crop: string) => CROP_COLORS[crop?.toLowerCase()] ?? { bg: 'bg-zinc-700/30', text: 'text-zinc-300', border: 'border-zinc-600', emoji: '🌾' };

const defaultExpiryDate = () => {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};

export function Oportunidades() {
  const { opportunities, loading: oppLoading } = useOpportunities();
  const { clients, loading: clientsLoading } = useClients();
  const { alerts, loading: alertsLoading } = useWhatsAppAlerts();
  const { user } = useAuth();
  const { searchQuery, addToast } = useUI();

  const [activeTab, setActiveTab] = useState<'ofertas' | 'demandas' | 'whatsapp' | 'matches'>('ofertas');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [draggedOverColumn, setDraggedOverColumn] = useState<string | null>(null);
  const [reviewAlert, setReviewAlert] = useState<any | null>(null);
  const [lostDialog, setLostDialog] = useState({ isOpen: false, id: '', reason: '' });

  const handleStatusChange = async (id: string, newStatus: string) => {
    if (newStatus === 'perdida') {
      setLostDialog({ isOpen: true, id, reason: '' });
      return;
    }
    try {
      await api.opportunities.update(id, { status: newStatus });
      addToast(`Oportunidad movida a ${newStatus.replace(/_/g, ' ')}`, 'success');
    } catch (error) {
      addToast('Error al mover oportunidad', 'error');
    }
  };

  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waModalPhone, setWaModalPhone] = useState('');
  const [waModalClientId, setWaModalClientId] = useState('');
  const [waModalClientName, setWaModalClientName] = useState('');
  const [waModalContextVars, setWaModalContextVars] = useState<any>(undefined);

  const handleOpenWaModal = (phone: string, id: string, name: string, context?: any) => {
    setWaModalPhone(phone);
    setWaModalClientId(id);
    setWaModalClientName(name);
    setWaModalContextVars(context);
    setWaModalOpen(true);
  };
  const [isMobileFormExpanded, setIsMobileFormExpanded] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });


  const [formData, setFormData] = useState({
    clientId: '',
    cropType: 'soja',
    quantity_tn: '',
    price_usd: '',
    location: '',
    priceMode: 'fijo' as 'fijo' | 'a_negociar',
    deliveryDate: '',
    expiresAt: defaultExpiryDate(),
    paymentTerms: '',
    grainQuality: '',
    nextAction: 'Contactar y validar condiciones',
  });

  const [oppProvincia, setOppProvincia] = useState('');
  const [oppLocalidad, setOppLocalidad] = useState('');
  const [oppCustomLocalidad, setOppCustomLocalidad] = useState('');

  React.useEffect(() => {
    const locStr = formData.location || '';
    
    let parsedProv = '';
    let parsedLoc = '';
    
    const splitComma = locStr.split(',');
    if (splitComma.length >= 2) {
      const potentialLoc = splitComma[0].trim();
      const potentialProv = splitComma[1].trim();
      
      const foundProv = Object.keys(ARGENTINE_REGIONS).find(
        p => p.toLowerCase() === potentialProv.toLowerCase()
      );
      if (foundProv) {
        parsedProv = foundProv;
        parsedLoc = potentialLoc;
      }
    }
    
    if (!parsedProv && locStr) {
      const cleanLoc = locStr.toLowerCase().trim();
      for (const [prov, localities] of Object.entries(ARGENTINE_REGIONS)) {
        const matchedLoc = localities.find(
          loc => loc.toLowerCase() === cleanLoc || cleanLoc.includes(loc.toLowerCase())
        );
        if (matchedLoc) {
          parsedProv = prov;
          parsedLoc = matchedLoc;
          break;
        }
      }
    }
    
    if (locStr && !parsedProv) {
      setOppProvincia('Otra');
      setOppLocalidad('Otro');
      setOppCustomLocalidad(locStr);
    } else if (parsedProv) {
      setOppProvincia(parsedProv);
      const exists = ARGENTINE_REGIONS[parsedProv]?.includes(parsedLoc);
      if (exists) {
        setOppLocalidad(parsedLoc);
        setOppCustomLocalidad('');
      } else {
        setOppLocalidad('Otro');
        setOppCustomLocalidad(parsedLoc);
      }
    } else {
      setOppProvincia('');
      setOppLocalidad('');
      setOppCustomLocalidad('');
    }
  }, [formData.location]);

  const syncOppLocationField = (prov: string, loc: string, custom: string) => {
    let finalLocation = '';
    if (prov === 'Otra') {
      finalLocation = custom.trim();
    } else if (prov) {
      if (loc === 'Otro') {
        finalLocation = custom.trim() ? `${custom.trim()}, ${prov}` : prov;
      } else if (loc) {
        finalLocation = `${loc}, ${prov}`;
      } else {
        finalLocation = prov;
      }
    }
    setFormData((prev: any) => ({
      ...prev,
      location: finalLocation
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    const client = clients.find(c => c.id === formData.clientId);
    if (!client) {
      addToast("Seleccione un cliente válido", "error");
      return;
    }
    if (Number(formData.quantity_tn) <= 0) {
      addToast('Ingrese una cantidad mayor a 0 TN', 'error');
      return;
    }
    if (formData.priceMode === 'fijo' && Number(formData.price_usd) <= 0) {
      addToast('Ingrese un precio o marque A negociar', 'error');
      return;
    }

    try {
      await api.opportunities.create({
        type: activeTab === 'ofertas' ? 'oferta' : 'demanda',
        clientId: formData.clientId,
        cropType: formData.cropType,
        quantity_tn: Number(formData.quantity_tn),
        price_usd: formData.priceMode === 'a_negociar' ? 0 : Number(formData.price_usd),
        location: formData.location || client.location?.address || 'A convenir',
        priceMode: formData.priceMode,
        deliveryDate: formData.deliveryDate || null,
        expiresAt: formData.expiresAt,
        paymentTerms: formData.paymentTerms || null,
        grainQuality: formData.grainQuality || null,
        nextAction: formData.nextAction || 'Contactar y validar condiciones',
      });
      setFormData({
        ...formData,
        quantity_tn: '',
        price_usd: '',
        location: '',
        deliveryDate: '',
        expiresAt: defaultExpiryDate(),
        paymentTerms: '',
        grainQuality: ''
      });
      addToast(`${activeTab === 'ofertas' ? 'Oferta' : 'Demanda'} creada con éxito`, 'success');
    } catch (error: any) {
      addToast(error.message || 'Error al crear el registro', 'error');
    }
  };

  const deleteOpp = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Eliminar Oportunidad',
      message: '¿Estás seguro de que deseas eliminar esta oportunidad del pipeline? Esta acción es irreversible.',
      onConfirm: async () => {
        try {
           await api.opportunities.delete(id);
           addToast('Oportunidad eliminada con éxito', 'success');
        } catch (error) {
           addToast('Error al eliminar', 'error');
        }
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      }
    });
  };
  
  const toggleStatus = async (opp: any) => {
    try {
      await api.opportunities.update(opp.id, {
        status: opp.status === 'abierta' ? 'negociacion' : 'abierta'
      });
      addToast(`Estado cambiado a ${opp.status === 'abierta' ? 'negociación' : 'abierta'}`, 'success');
    } catch (error) {
      addToast('Error al actualizar estado', 'error');
    }
  };

  const [matches, setMatches] = useState<any[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);

  const fetchMatches = async () => {
    setLoadingMatches(true);
    try {
      const data = await api.opportunities.matches();
      setMatches(data);
    } catch (err) {
      console.error('Error fetching matches:', err);
    } finally {
      setLoadingMatches(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, [opportunities]);

  const [notifyingMatchId, setNotifyingMatchId] = useState<string | null>(null);
  const [matchDrafts, setMatchDrafts] = useState<Record<string, { quantity: number; sellerPrice: number; buyerPrice: number; commissionPct: number }>>({});

  const getMatchDraft = (match: any) => matchDrafts[match.id] || {
    quantity: Number(match.negotiation?.quantity_tn || match.overlapQuantity),
    sellerPrice: Number(match.negotiation?.sellerPrice || match.offer.price_usd),
    buyerPrice: Number(match.negotiation?.buyerPrice || match.demand.price_usd),
    commissionPct: Number(match.negotiation?.commissionPct || 2)
  };

  const updateMatchDraft = (match: any, field: string, value: number) => {
    setMatchDrafts(prev => ({
      ...prev,
      [match.id]: {
        ...(prev[match.id] || {
          quantity: Number(match.negotiation?.quantity_tn || match.overlapQuantity),
          sellerPrice: Number(match.negotiation?.sellerPrice || match.offer.price_usd),
          buyerPrice: Number(match.negotiation?.buyerPrice || match.demand.price_usd),
          commissionPct: Number(match.negotiation?.commissionPct || 2)
        }),
        [field]: value
      }
    }));
  };

  const handleNotifyMatch = async (match: any) => {
    if (notifyingMatchId) return;
    const draft = getMatchDraft(match);
    setNotifyingMatchId(match.id);
    try {
      const res = await api.whatsapp.notifyMatch({
        sellerId: match.offer.clientId,
        buyerId: match.demand.clientId,
        offerId: match.offer.id,
        demandId: match.demand.id,
        cropType: match.cropType,
        overlapQuantity: draft.quantity,
        price: (draft.sellerPrice + draft.buyerPrice) / 2,
        sellerPrice: draft.sellerPrice,
        buyerPrice: draft.buyerPrice,
        commissionPct: draft.commissionPct,
      });
      if (res.success) {
        let msg = "Notificaciones de cruce enviadas con éxito. ";
        if (res.sellerNotified && res.buyerNotified) {
          msg += `Se notificó a ${res.sellerName} y ${res.buyerName} 📲`;
        } else if (res.sellerNotified) {
          msg += `Se notificó a ${res.sellerName}. ${res.buyerName} no tiene celular configurado.`;
        } else if (res.buyerNotified) {
          msg += `Se notificó a ${res.buyerName}. ${res.sellerName} no tiene celular configurado.`;
        } else {
          msg += "Ninguno de los clientes tiene celular configurado.";
        }
        addToast(msg, 'success');
      } else {
        addToast('Fallo al enviar notificaciones de cruce', 'error');
      }
    } catch (e: any) {
      addToast(e.message || 'Error al notificar cruce', 'error');
    } finally {
      setNotifyingMatchId(null);
    }
  };

  const handleCloseMatch = (match: any) => {
    const seller = clients.find(c => c.id === match.offer.clientId);
    const buyer = clients.find(c => c.id === match.demand.clientId);
    const draft = getMatchDraft(match);
    
    if (!seller || !buyer) {
      addToast('Error: No se pudieron encontrar los clientes del cruce', 'error');
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Liquidar Cruce Algorítmico',
      message: `¿Deseas liquidar este cruce?\nSe venderán ${formatNumber(draft.quantity)} TN de ${match.cropType.toUpperCase()} de ${seller.name} (${draft.sellerPrice} USD) a ${buyer.name} (${draft.buyerPrice} USD).\n\nComisión estimada: USD ${formatNumber(Math.round(draft.quantity * ((draft.sellerPrice + draft.buyerPrice) / 2) * (draft.commissionPct / 100)))} (${draft.commissionPct}%)${match.negotiation?.status !== 'confirmada' ? '\n\nAviso: todavía no figuran ambas confirmaciones por WhatsApp.' : ''}`,
      onConfirm: async () => {
        try {
          await api.deals.create({
            cropType: match.cropType,
            sellerId: match.offer.clientId,
            buyerId: match.demand.clientId,
            sellerName: seller.name,
            buyerName: buyer.name,
            quantity_tn: draft.quantity,
            price_seller: draft.sellerPrice,
            price_buyer: draft.buyerPrice,
            totalCommission: Math.round(draft.quantity * ((draft.sellerPrice + draft.buyerPrice) / 2) * (draft.commissionPct / 100)),
            location: match.demand.location || match.offer.location || 'A convenir',
          });

          const offerDiff = match.offer.quantity_tn - draft.quantity;
          const demandDiff = match.demand.quantity_tn - draft.quantity;

          if (offerDiff <= 0) {
            await api.opportunities.update(match.offer.id, { status: 'ganada' });
          } else {
            await api.opportunities.update(match.offer.id, { quantity_tn: offerDiff });
            addToast(`Oferta reducida a ${offerDiff} TN por saldo remanente`, 'info');
          }

          if (demandDiff <= 0) {
            await api.opportunities.update(match.demand.id, { status: 'ganada' });
          } else {
            await api.opportunities.update(match.demand.id, { quantity_tn: demandDiff });
            addToast(`Demanda reducida a ${demandDiff} TN por saldo remanente`, 'info');
          }

          addToast(`Boleto liquidado por ${formatNumber(draft.quantity)} TN con éxito`, 'success');
          setActiveTab('matches');
        } catch (error) {
          addToast('Error al procesar la liquidación', 'error');
        }
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      }
    });
  };


  const [filterCrop, setFilterCrop] = useState<string>('all');
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });

  const handleSort = (key: string) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const filteredOpps = opportunities
    .filter(o => o.type === (activeTab === 'ofertas' ? 'oferta' : 'demanda'))
    .filter(o => filterCrop === 'all' || o.cropType === filterCrop)
    .filter(o => {
      if (!searchQuery) return true;
      const clientName = clients.find(c => c.id === o.clientId)?.name || '';
      const q = searchQuery.toLowerCase();
      return clientName.toLowerCase().includes(q) || 
             o.cropType.toLowerCase().includes(q) ||
             o.status.toLowerCase().includes(q) ||
             (o.location && o.location.toLowerCase().includes(q));
    })
    .sort((a, b) => {
      let aVal = a[sortConfig.key as keyof typeof a];
      let bVal = b[sortConfig.key as keyof typeof b];

      if (sortConfig.key === 'client') {
        aVal = clients.find(c => c.id === a.clientId)?.name || '';
        bVal = clients.find(c => c.id === b.clientId)?.name || '';
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('es-AR').format(num);
  };

  const totalOfertas = opportunities.filter(o => o.type === 'oferta' && ['abierta','negociacion','esperando_confirmacion'].includes(o.status));
  const totalDemandas = opportunities.filter(o => o.type === 'demanda' && ['abierta','negociacion','esperando_confirmacion'].includes(o.status));
  const totalVolumenOfertas = totalOfertas.reduce((s, o) => s + Number(o.quantity_tn), 0);
  const totalValorOfertas = totalOfertas.reduce((s, o) => s + Number(o.quantity_tn) * Number(o.price_usd), 0);
  const totalVolumenDemandas = totalDemandas.reduce((s, o) => s + Number(o.quantity_tn), 0);

  return (
    <div className="w-full max-w-full min-w-0 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-tight">Pipeline de Operaciones</h1>
          <p className="text-xs text-zinc-500 mt-0.5 font-mono">Motor de oferta, demanda y cruces algorítmicos</p>
        </div>
        <div className="grid grid-cols-3 gap-2 w-full min-w-0 sm:flex sm:flex-wrap sm:w-auto sm:gap-3">
          <div className="min-w-0 flex items-center gap-2 bg-green-500/8 border border-green-500/20 rounded-xl px-2.5 sm:px-3 py-2 overflow-hidden">
            <TrendingUp className="hidden sm:block w-3.5 h-3.5 text-green-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[8px] sm:text-[9px] leading-tight text-green-500/70 font-bold uppercase truncate"><span className="sm:hidden">Ofertas</span><span className="hidden sm:inline">Oferta Activa</span></p>
              <p className="text-[11px] sm:text-sm font-black text-green-400 font-mono truncate">{formatNumber(totalVolumenOfertas)} <span className="text-[9px] sm:text-[10px] font-normal">TN</span></p>
            </div>
          </div>
          <div className="min-w-0 flex items-center gap-2 bg-blue-500/8 border border-blue-500/20 rounded-xl px-2.5 sm:px-3 py-2 overflow-hidden">
            <Scale className="hidden sm:block w-3.5 h-3.5 text-blue-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[8px] sm:text-[9px] leading-tight text-blue-500/70 font-bold uppercase truncate"><span className="sm:hidden">Demandas</span><span className="hidden sm:inline">Demanda Activa</span></p>
              <p className="text-[11px] sm:text-sm font-black text-blue-400 font-mono truncate">{formatNumber(totalVolumenDemandas)} <span className="text-[9px] sm:text-[10px] font-normal">TN</span></p>
            </div>
          </div>
          <div className="min-w-0 flex items-center gap-2 bg-amber-500/8 border border-amber-500/20 rounded-xl px-2.5 sm:px-3 py-2 overflow-hidden">
            <BarChart3 className="hidden sm:block w-3.5 h-3.5 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[8px] sm:text-[9px] leading-tight text-amber-500/70 font-bold uppercase truncate"><span className="sm:hidden">Negociado</span><span className="hidden sm:inline">Valor Negociado</span></p>
              <p className="text-[11px] sm:text-sm font-black text-amber-400 font-mono truncate">${formatNumber(Math.round(totalValorOfertas / 1000))}K</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-1.5 grid grid-cols-4 sm:flex gap-1 sm:overflow-x-auto scrollbar-none shadow-lg min-w-0">
        {([
          { key: 'ofertas',   label: 'Oferta / Venta',     mobileLabel: 'Ofertas',  emoji: '🌿', count: totalOfertas.length,   activeClass: 'bg-gradient-to-br from-[#1a2d20] to-[#162219] text-green-400 border border-green-500/25 shadow-green-500/10' },
          { key: 'demandas',  label: 'Demanda / Compra',   mobileLabel: 'Compras',  emoji: '🛍️', count: totalDemandas.length,  activeClass: 'bg-gradient-to-br from-[#162333] to-[#101c2a] text-blue-400 border border-blue-500/25 shadow-blue-500/10' },
          { key: 'whatsapp',  label: 'Alertas WhatsApp',   mobileLabel: 'WhatsApp', emoji: '📱', count: alerts.length,          activeClass: 'bg-gradient-to-br from-[#23182e] to-[#1a1123] text-purple-400 border border-purple-500/25 shadow-purple-500/10' },
          { key: 'matches',   label: 'Cruces',             mobileLabel: 'Cruces',   emoji: '🤝', count: matches.length,         activeClass: 'bg-gradient-to-br from-[#2d2010] to-[#221809] text-amber-400 border border-amber-500/25 shadow-amber-500/10' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 min-w-0 sm:min-w-[150px] py-2.5 px-1.5 sm:px-3 rounded-xl text-xs font-bold transition-all duration-200 whitespace-nowrap flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer shadow-sm ${
              activeTab === tab.key
                ? tab.activeClass
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            <span className="hidden sm:inline">{tab.emoji}</span>
            <span className="sm:hidden text-[9px]">{tab.mobileLabel}</span>
            <span className="hidden sm:inline">{tab.label}</span>
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
              activeTab === tab.key ? 'bg-white/10' : 'bg-zinc-800'
            }`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {activeTab === 'whatsapp' ? (
        <>
          <WhatsappQRSetup />
          <WhatsappAlertsView 
            clients={clients}
            opportunities={opportunities}
            setConfirmDialog={setConfirmDialog}
            onConvert={setReviewAlert}
          />
        </>
      ) : activeTab === 'matches' ? (
        <div className="space-y-6">
          <div className="bg-amber-950/20 border border-amber-500/25 rounded-xl p-5 text-gray-300">
            <div className="flex gap-3">
              <span className="text-xl">💡</span>
              <div>
                <h4 className="font-bold text-white mb-1">Cruce Inteligente de Oferta y Demanda (Matching Engine)</h4>
                <p className="text-sm text-gray-300 leading-relaxed">
                  Abajo listamos los negocios listos para concretarse. El sistema empareja de manera algorítmica a <strong>vendedores de grano (Ofertas)</strong> con sus respectivos <strong>compradores (Demandas)</strong>. Calcula el volumen máximo factible de transaccionar, el diferencial de precio y liquida las condiciones de corretaje del 2%. Al confirmar, el sistema liquida la operación de inmediato.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            {matches.length === 0 ? (
              <div className="p-12 text-center bg-[#1e1e1e] border border-[#333] rounded-xl">
                <div className="bg-[#252525] w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Info className="w-6 h-6 text-gray-400" />
                </div>
                <h4 className="text-sm font-bold text-white mb-1">No hay cruces de mercado listos</h4>
                <p className="text-gray-400 text-xs text-center max-w-sm mx-auto leading-relaxed">
                  Registra u obtén por WhatsApp ofertas de venta y demandas de compra sobre un mismo grano para que el motor inteligente AgroSys los empareje automáticamente aquí.
                </p>
              </div>
            ) : (
              matches.map((match) => {
                const seller = clients.find(c => c.id === match.offer.clientId);
                const buyer = clients.find(c => c.id === match.demand.clientId);
                const sellerName = seller?.name || 'Desconocido';
                const buyerName = buyer?.name || 'Desconocido';
                
                const profitable = match.priceSpread >= 0;
                const draft = getMatchDraft(match);
                const negotiation = match.negotiation;

                return (
                  <div key={match.id} className={`bg-[#1e1e1e] border rounded-2xl p-5 flex flex-col xl:flex-row items-stretch justify-between gap-6 transition-all shadow-md ${profitable ? 'border-green-500/25 hover:border-green-500/40' : 'border-[#333] hover:border-[#444]'}`}>
                    
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-1">
                      <div className="h-14 w-14 bg-gradient-to-br from-[#2a2a2a] to-[#202020] rounded-2xl flex flex-col items-center justify-center border border-[#3b3b3b] shadow-inner shrink-0">
                        <span className="text-xl">🌾</span>
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{match.cropType}</span>
                      </div>
                      
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-black text-white">Cruce de {match.cropType.toUpperCase()}</span>
                          <span className="bg-[#242424] text-[10px] text-gray-300 px-2 py-0.5 rounded-md font-mono border border-zinc-750">
                            Coinciden: {formatNumber(match.overlapQuantity)} TN
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1.5 text-xs text-zinc-400">
                          <div className="bg-[#222] p-2.5 rounded-xl border border-[#2d2d2d]">
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Vendedor (Oferta)</p>
                            <p className="font-bold text-green-400 truncate mt-0.5">{sellerName}</p>
                            <p className="font-mono text-[10.5px] mt-0.5">Total: {formatNumber(match.offer.quantity_tn)} TN @ <strong className="text-white">${formatNumber(match.offer.price_usd)}</strong></p>
                          </div>
                          <div className="bg-[#222] p-2.5 rounded-xl border border-[#2d2d2d]">
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Comprador (Demanda)</p>
                            <p className="font-bold text-blue-400 truncate mt-0.5">{buyerName}</p>
                            <p className="font-mono text-[10.5px] mt-0.5">Total: {formatNumber(match.demand.quantity_tn)} TN @ <strong className="text-white">${formatNumber(match.demand.price_usd)}</strong></p>
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
                        <label className="text-[9px] uppercase font-bold text-zinc-500">Volumen TN
                          <input type="number" min="1" max={match.overlapQuantity} value={draft.quantity} onChange={e => updateMatchDraft(match, 'quantity', Number(e.target.value))} className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white font-mono" />
                        </label>
                        <label className="text-[9px] uppercase font-bold text-zinc-500">Comisión %
                          <input type="number" min="0" step="0.1" value={draft.commissionPct} onChange={e => updateMatchDraft(match, 'commissionPct', Number(e.target.value))} className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white font-mono" />
                        </label>
                        <label className="text-[9px] uppercase font-bold text-zinc-500">Precio vendedor
                          <input type="number" min="1" step="0.5" value={draft.sellerPrice} onChange={e => updateMatchDraft(match, 'sellerPrice', Number(e.target.value))} className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-green-400 font-mono" />
                        </label>
                        <label className="text-[9px] uppercase font-bold text-zinc-500">Precio comprador
                          <input type="number" min="1" step="0.5" value={draft.buyerPrice} onChange={e => updateMatchDraft(match, 'buyerPrice', Number(e.target.value))} className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-blue-400 font-mono" />
                        </label>
                      </div>

                      {negotiation && (
                        <div className="flex items-center justify-between gap-2 text-[10px] border-y border-zinc-800 py-2">
                          <span className={negotiation.sellerResponse === 'aceptada' ? 'text-green-400' : negotiation.sellerResponse === 'rechazada' ? 'text-red-400' : 'text-amber-400'}>
                            Vendedor: {negotiation.sellerResponse}
                          </span>
                          <span className={negotiation.buyerResponse === 'aceptada' ? 'text-green-400' : negotiation.buyerResponse === 'rechazada' ? 'text-red-400' : 'text-amber-400'}>
                            Comprador: {negotiation.buyerResponse}
                          </span>
                        </div>
                      )}
                      
                      <div className="flex-1 flex flex-col justify-center text-right">
                        <div className="flex items-center gap-1.5 justify-end">
                          <span className="text-xs text-gray-400 font-medium">Margen Spread:</span>
                          <span className={`text-sm font-mono font-black ${draft.buyerPrice - draft.sellerPrice >= 0 ? 'text-green-400' : 'text-zinc-400'}`}>
                            {draft.buyerPrice - draft.sellerPrice >= 0 ? '+' : ''}${formatNumber(draft.buyerPrice - draft.sellerPrice)} USD
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-0.5 font-mono">Precio medio: ${formatNumber((draft.sellerPrice + draft.buyerPrice) / 2)} USD</p>
                        <div className="mt-1.5 flex items-center gap-1.5 justify-end">
                          <span className="text-[11px] text-gray-400">Honorarios ({draft.commissionPct}%):</span>
                          <span className="font-mono font-bold text-amber-400">${formatNumber(Math.round(draft.quantity * ((draft.sellerPrice + draft.buyerPrice) / 2) * (draft.commissionPct / 100)))} USD</span>
                        </div>
                      </div>

                      <div className="shrink-0 flex flex-col sm:flex-row xl:flex-col items-stretch xl:items-end justify-end gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => handleNotifyMatch(match)}
                          disabled={notifyingMatchId === match.id}
                          className="w-full sm:w-auto bg-green-600/10 hover:bg-green-600/20 text-green-400 font-bold text-xs px-5 py-3 rounded-xl transition-all border border-green-500/25 active:scale-95 duration-100 uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                        >
                          {notifyingMatchId === match.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>{negotiation ? 'Reenviar propuesta' : 'Enviar propuesta'}</span>}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCloseMatch(match)}
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
      ) : (
        <>
          <div className="border border-[#2c2c2c] rounded-2xl overflow-hidden shadow-2xl mb-6 bg-[#1a1a1a]">
            <div
              onClick={() => setIsMobileFormExpanded(!isMobileFormExpanded)}
              className={`p-4 sm:p-5 flex items-center justify-between cursor-pointer md:cursor-default transition-colors ${
                activeTab === 'ofertas'
                  ? 'bg-gradient-to-r from-[#1a2d1e] via-[#1c2920] to-[#1e2222]'
                  : 'bg-gradient-to-r from-[#18243a] via-[#1a2233] to-[#1c1f2e]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shadow-inner ${
                  activeTab === 'ofertas' ? 'bg-green-500/15 border border-green-500/20' : 'bg-blue-500/15 border border-blue-500/20'
                }`}>
                  {activeTab === 'ofertas' ? '🛒' : '🛍️'}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {activeTab === 'ofertas' ? 'Nueva Oferta de Venta' : 'Nueva Demanda de Compra'}
                  </h3>
                  <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                    {isMobileFormExpanded ? 'Toca para contraer' : 'Completar para ingresar al pipeline'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="md:hidden p-2 bg-zinc-800/70 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white transition-colors border border-zinc-700"
              >
                {isMobileFormExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            <div className={`${isMobileFormExpanded ? 'block' : 'hidden md:block'} p-4 sm:p-6 border-t border-[#333] bg-[#1d1d1d]`}>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 items-end">
                <div className="col-span-1 sm:col-span-2 md:col-span-1">
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Cliente</label>
                  <select required value={formData.clientId} onChange={e => setFormData({...formData, clientId: e.target.value})} className="w-full bg-[#252525] border border-[#444] rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-green-500">
                    <option value="">Seleccione cliente...</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Grano</label>
                  <select required value={formData.cropType} onChange={e => setFormData({...formData, cropType: e.target.value})} className="w-full bg-[#252525] border border-[#444] rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-green-500">
                    <option value="soja">Soja</option>
                    <option value="maiz">Maíz</option>
                    <option value="trigo">Trigo</option>
                    <option value="sorgo">Sorgo</option>
                    <option value="girasol">Girasol</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Toneladas</label>
                  <input required type="number" min="1" value={formData.quantity_tn} onChange={e => setFormData({...formData, quantity_tn: e.target.value})} placeholder="Tn" className="w-full bg-[#252525] border border-[#444] rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Modalidad de precio</label>
                  <select value={formData.priceMode} onChange={e => setFormData({...formData, priceMode: e.target.value as 'fijo' | 'a_negociar'})} className="w-full bg-[#252525] border border-[#444] rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-green-500">
                    <option value="fijo">Precio fijo</option>
                    <option value="a_negociar">A negociar</option>
                  </select>
                </div>
                {formData.priceMode === 'fijo' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Precio (USD/tn)</label>
                    <input required type="number" min="1" step="0.5" value={formData.price_usd} onChange={e => setFormData({...formData, price_usd: e.target.value})} placeholder="USD/tn" className="w-full bg-[#252525] border border-[#444] rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-green-500" />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Provincia (Destino)</label>
                  <select 
                    value={oppProvincia} 
                    onChange={(e) => {
                      const val = e.target.value;
                      setOppProvincia(val);
                      setOppLocalidad('');
                      setOppCustomLocalidad('');
                      syncOppLocationField(val, '', '');
                    }} 
                    className="w-full bg-[#252525] border border-[#444] rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-green-500"
                  >
                    <option value="">Seleccionar Prov...</option>
                    {PROVINCES.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                    <option value="Otra">Otra Provincia / Exterior...</option>
                  </select>
                </div>
                {oppProvincia && oppProvincia !== 'Otra' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Localidad (Destino)</label>
                    <select 
                      value={oppLocalidad} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setOppLocalidad(val);
                        if (val !== 'Otro') {
                          setOppCustomLocalidad('');
                        }
                        syncOppLocationField(oppProvincia, val, val === 'Otro' ? oppCustomLocalidad : '');
                      }} 
                      className="w-full bg-[#252525] border border-[#444] rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-green-500"
                    >
                      <option value="">Seleccionar Loc...</option>
                      {ARGENTINE_REGIONS[oppProvincia]?.map(loc => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                      <option value="Otro">Otro (Escribir)...</option>
                    </select>
                  </div>
                )}
                {(oppProvincia === 'Otra' || oppLocalidad === 'Otro') && (
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Destino personalizado</label>
                    <input 
                      type="text" 
                      required
                      value={oppCustomLocalidad} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setOppCustomLocalidad(val);
                        syncOppLocationField(oppProvincia, oppLocalidad, val);
                      }} 
                      placeholder="Ej: Rosario" 
                      className="w-full bg-[#252525] border border-[#444] rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-green-500" 
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Fecha de entrega</label>
                  <input type="date" value={formData.deliveryDate} onChange={e => setFormData({...formData, deliveryDate: e.target.value})} className="w-full bg-[#252525] border border-[#444] rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Vigente hasta</label>
                  <input required type="date" min={new Date().toISOString().slice(0, 10)} value={formData.expiresAt} onChange={e => setFormData({...formData, expiresAt: e.target.value})} className="w-full bg-[#252525] border border-[#444] rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Condición de pago</label>
                  <input value={formData.paymentTerms} onChange={e => setFormData({...formData, paymentTerms: e.target.value})} placeholder="Ej: 7 días" className="w-full bg-[#252525] border border-[#444] rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Calidad</label>
                  <input value={formData.grainQuality} onChange={e => setFormData({...formData, grainQuality: e.target.value})} placeholder="Ej: grado 2" className="w-full bg-[#252525] border border-[#444] rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-green-500" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Próxima acción</label>
                  <input value={formData.nextAction} onChange={e => setFormData({...formData, nextAction: e.target.value})} placeholder="Qué hay que hacer después" className="w-full bg-[#252525] border border-[#444] rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-green-500" />
                </div>
                <div className="pt-2 col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-4 xl:col-span-6 flex justify-end">
                  <button type="submit" disabled={clientsLoading} className={`w-full sm:w-auto px-6 py-2.5 rounded-lg text-xs font-bold text-white transition-colors shadow-lg flex items-center justify-center gap-2 active:scale-95 duration-100 cursor-pointer ${activeTab === 'ofertas' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                    <Plus className="w-4 h-4" /> Registrar {activeTab === 'ofertas' ? 'Oferta' : 'Demanda'}
                  </button>
                </div>
              </form>
            </div>
          </div>

      <div className="bg-[#191919] border border-[#2a2a2a] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-[#252525] flex flex-col sm:flex-row sm:items-center sm:justify-between bg-[#1e1e1e] gap-3">
          <div className="mobile-scroll-row flex whitespace-nowrap scrollbar-none gap-1.5 pb-1 sm:pb-0">
            {['all', 'soja', 'maiz', 'trigo', 'sorgo', 'girasol'].map(c => {
              const cs = getCropStyle(c);
              return (
                <button
                  key={c}
                  onClick={() => setFilterCrop(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all tracking-wide shrink-0 border ${
                    filterCrop === c
                      ? c === 'all' ? 'bg-white text-black border-transparent' : `${cs.bg} ${cs.text} ${cs.border}`
                      : 'bg-transparent text-zinc-500 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  {c === 'all' ? '✦ Todos' : `${cs.emoji} ${c}`}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end w-full sm:w-auto">
            <div className="flex bg-zinc-900 rounded-xl p-0.5 border border-zinc-800 shadow-inner shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1.5 text-xs font-bold ${viewMode === 'list' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-200'}`}
                title="Vista Lista"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Lista</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('kanban')}
                className={`px-3 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1.5 text-xs font-bold ${viewMode === 'kanban' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-200'}`}
                title="Vista Kanban"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Kanban</span>
              </button>
            </div>
            <span className="text-xs font-bold text-zinc-600 shrink-0 font-mono bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-lg">
              {filteredOpps.length} resultado{filteredOpps.length !== 1 && 's'}
            </span>
          </div>
        </div>

        {viewMode === 'kanban' ? (
          <KanbanBoardView
            filteredOpps={filteredOpps}
            clients={clients}
            deleteOpp={deleteOpp}
            toggleStatus={toggleStatus}
            handleStatusChange={handleStatusChange}
            formatNumber={formatNumber}
            draggedOverColumn={draggedOverColumn}
            setDraggedOverColumn={setDraggedOverColumn}
            handleOpenWaModal={handleOpenWaModal}
          />
        ) : (
          <div>
            {oppLoading ? (
              <div className="p-12 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-green-500 mx-auto mb-4" />
                <p className="text-zinc-500 font-medium text-sm">Cargando oportunidades...</p>
              </div>
            ) : filteredOpps.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4">
                  <Info className="w-7 h-7 text-zinc-600" />
                </div>
                <p className="font-bold text-zinc-400 mb-1">Sin resultados para este filtro</p>
                <p className="text-zinc-600 text-sm">Ajustá los filtros o creá un nuevo registro.</p>
              </div>
            ) : (
              <>
                {/* Mobile Cards View for List Mode */}
                <div className="md:hidden space-y-3 p-3">
                  {filteredOpps.map((opp) => {
                    const client = clients.find(c => c.id === opp.clientId);
                    const clientName = client?.name || 'Desconocido';
                    const clientPhone = client?.phone;
                    const cs = getCropStyle(opp.cropType);
                    const isOferta = opp.type === 'oferta';
                    const totalValor = Number(opp.quantity_tn) * Number(opp.price_usd);

                    return (
                      <div key={opp.id} className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-3.5 space-y-3 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg border ${cs.bg} ${cs.text} ${cs.border}`}>
                              {cs.emoji} {opp.cropType}
                            </span>
                            <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded-md border ${
                              isOferta
                                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            }`}>
                              {isOferta ? '↑ Oferta' : '↓ Demanda'}
                            </span>
                          </div>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {opp.createdAt ? format(new Date(opp.createdAt), 'dd/MM/yy') : '-'}
                          </span>
                        </div>

                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-bold text-white truncate">{clientName}</h4>
                            {opp.location && <p className="text-[11px] text-zinc-400 truncate mt-0.5">📍 {opp.location}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-sm font-black font-mono ${isOferta ? 'text-green-400' : 'text-blue-400'}`}>
                              {opp.priceMode === 'a_negociar' ? 'A negociar' : `$${formatNumber(opp.price_usd)}`}
                            </p>
                            <p className="text-[10px] text-zinc-400 font-mono font-bold">
                              {formatNumber(opp.quantity_tn)} TN
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-[#282828]">
                          <button
                            onClick={() => toggleStatus(opp)}
                            className={`flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-lg border uppercase tracking-wider transition-all cursor-pointer ${
                              opp.status === 'abierta'    ? 'bg-amber-500/8 text-amber-400 border-amber-500/20' :
                              opp.status === 'negociacion' ? 'bg-blue-500/8 text-blue-400 border-blue-500/20' :
                              opp.status === 'ganada'     ? 'bg-green-500/8 text-green-400 border-green-500/20' :
                              opp.status === 'perdida'    ? 'bg-red-500/8 text-red-400 border-red-500/20' :
                              'bg-zinc-800 text-zinc-400 border-zinc-700'
                            }`}
                          >
                            {opp.status === 'ganada' ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                            {opp.status || 'abierta'}
                          </button>

                          <div className="flex items-center gap-1.5">
                            {clientPhone && (
                              <button
                                onClick={() => handleOpenWaModal(clientPhone, opp.clientId, clientName, { cropType: opp.cropType, quantity_tn: opp.quantity_tn, price_usd: opp.price_usd, location: opp.location })}
                                className="p-2 text-green-400 bg-green-500/10 hover:bg-green-500/20 rounded-lg transition-colors cursor-pointer border border-green-500/20"
                                title="WhatsApp"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => deleteOpp(opp.id)}
                              className="p-2 text-zinc-400 hover:text-red-400 bg-zinc-800 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer border border-zinc-700 hover:border-red-500/20"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="border-b border-[#252525]">
                        {[
                          { label: 'Estado', key: 'status' },
                          { label: 'Fecha', key: 'createdAt' },
                          { label: 'Cliente', key: 'client' },
                          { label: 'Grano', key: 'cropType' },
                          { label: 'Volumen', key: 'quantity_tn' },
                          { label: 'Precio USD/tn', key: 'price_usd' },
                          { label: 'Destino', key: 'location' },
                        ].map(col => (
                          <th
                            key={col.key}
                            className="px-4 py-3 text-[10px] font-black text-zinc-600 uppercase tracking-widest cursor-pointer hover:text-zinc-300 transition-colors select-none"
                            onClick={() => handleSort(col.key)}
                          >
                            <span className="flex items-center gap-1">
                              {col.label}
                              {sortConfig.key === col.key && (
                                <span className="text-green-500">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </span>
                          </th>
                        ))}
                        <th className="px-4 py-3 text-[10px] font-black text-zinc-600 uppercase tracking-widest text-right">Acc.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOpps.map((opp, idx) => {
                        const client = clients.find(c => c.id === opp.clientId);
                        const clientName = client?.name || 'Desconocido';
                        const clientPhone = client?.phone;
                        const cs = getCropStyle(opp.cropType);
                        const isOferta = opp.type === 'oferta';
                        const totalValor = Number(opp.quantity_tn) * Number(opp.price_usd);
                        return (
                          <tr
                            key={opp.id}
                            className={`group border-b border-[#202020] transition-colors hover:bg-white/[0.02] ${idx % 2 === 0 ? '' : 'bg-white/[0.01]'}`}
                          >
                            <td className="px-4 py-3">
                              <button
                                onClick={() => toggleStatus(opp)}
                                className={`flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1.5 rounded-lg border uppercase tracking-wider transition-all cursor-pointer ${
                                  opp.status === 'abierta'    ? 'bg-amber-500/8 text-amber-400 border-amber-500/20 hover:bg-amber-500/15' :
                                  opp.status === 'negociacion' ? 'bg-blue-500/8 text-blue-400 border-blue-500/20 hover:bg-blue-500/15' :
                                  opp.status === 'ganada'     ? 'bg-green-500/8 text-green-400 border-green-500/20' :
                                  opp.status === 'perdida'    ? 'bg-red-500/8 text-red-400 border-red-500/20' :
                                  'bg-zinc-800 text-zinc-400 border-zinc-700'
                                }`}
                              >
                                {opp.status === 'ganada' ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                                {opp.status}
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs text-zinc-500 font-mono">
                                {opp.createdAt ? format(new Date(opp.createdAt), 'dd/MM/yy') : '-'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div>
                                <p className="text-sm font-bold text-zinc-200 truncate max-w-[180px]">{clientName}</p>
                                {opp.location && <p className="text-[10px] text-zinc-600 truncate max-w-[180px] mt-0.5">📍 {opp.location}</p>}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border ${cs.bg} ${cs.text} ${cs.border}`}>
                                {cs.emoji} {opp.cropType}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm font-bold font-mono text-zinc-200">{formatNumber(opp.quantity_tn)}</span>
                              <span className="text-[10px] text-zinc-600 ml-1">TN</span>
                            </td>
                            <td className="px-4 py-3">
                              <div>
                                <p className={`text-sm font-black font-mono ${isOferta ? 'text-green-400' : 'text-blue-400'}`}>
                                  {opp.priceMode === 'a_negociar' ? <span className="text-zinc-500 text-xs">A negociar</span> : `$${formatNumber(opp.price_usd)}`}
                                </p>
                                {opp.priceMode !== 'a_negociar' && <p className="text-[10px] text-zinc-600 font-mono">≈ ${formatNumber(Math.round(totalValor / 1000))}K total</p>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-zinc-500 truncate max-w-[140px]">{opp.location || <span className="text-zinc-700 italic">A convenir</span>}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                {clientPhone && (
                                  <button
                                    onClick={() => handleOpenWaModal(clientPhone, opp.clientId, clientName, { cropType: opp.cropType, quantity_tn: opp.quantity_tn, price_usd: opp.price_usd, location: opp.location })}
                                    className="p-1.5 text-green-400 hover:bg-green-500/10 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-green-500/20"
                                    title="WhatsApp"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => deleteOpp(opp.id)}
                                  className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-red-500/20"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      </>
      )}

      {reviewAlert && (
        <OpportunityReviewModal
          alert={reviewAlert}
          clients={clients}
          onClose={() => setReviewAlert(null)}
          onSuccess={(type) => {
            setReviewAlert(null);
            setActiveTab(type === 'oferta' ? 'ofertas' : 'demandas');
            addToast('Alerta revisada y oportunidad creada con éxito', 'success');
          }}
        />
      )}

      {lostDialog.isOpen && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1e1e1e] border border-zinc-700 rounded-lg max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div>
              <h3 className="text-lg font-black text-white">Marcar oportunidad como perdida</h3>
              <p className="text-xs text-zinc-400 mt-1">El motivo queda guardado para analizar por qué se pierden negocios.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Motivo obligatorio</label>
              <select
                value={lostDialog.reason}
                onChange={e => setLostDialog(prev => ({ ...prev, reason: e.target.value }))}
                className="w-full bg-[#252525] border border-[#444] rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-red-500"
              >
                <option value="">Seleccione un motivo...</option>
                <option value="Precio fuera de mercado">Precio fuera de mercado</option>
                <option value="El cliente desistió">El cliente desistió</option>
                <option value="Sin disponibilidad de volumen">Sin disponibilidad de volumen</option>
                <option value="Condiciones de pago">Condiciones de pago</option>
                <option value="Logística o ubicación">Logística o ubicación</option>
                <option value="Se concretó con otro corredor">Se concretó con otro corredor</option>
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setLostDialog({ isOpen: false, id: '', reason: '' })} className="px-4 py-2 text-xs font-bold rounded-lg bg-zinc-800 text-white">Cancelar</button>
              <button
                type="button"
                disabled={!lostDialog.reason}
                onClick={async () => {
                  try {
                    await api.opportunities.update(lostDialog.id, { status: 'perdida', lostReason: lostDialog.reason });
                    addToast('Oportunidad cerrada como perdida', 'success');
                    setLostDialog({ isOpen: false, id: '', reason: '' });
                  } catch (error: any) {
                    addToast(error.message || 'No se pudo actualizar la oportunidad', 'error');
                  }
                }}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white"
              >
                Confirmar pérdida
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#1e1e1e] border border-zinc-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl p-6 text-left space-y-4 animate-scale-up">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl shrink-0">
                <Trash2 className="w-6 h-6 border-none bg-transparent shadow-none" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-white tracking-tight">{confirmDialog.title}</h3>
                <p className="text-sm text-zinc-400 whitespace-pre-line leading-relaxed">{confirmDialog.message}</p>
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-sm font-bold rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-350 border border-zinc-700 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => confirmDialog.onConfirm()}
                className="px-5 py-2 text-sm font-bold rounded-xl bg-red-650 bg-red-600 hover:bg-red-700 text-white shadow-lg transition cursor-pointer"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <WhatsappTemplateModal
        isOpen={waModalOpen}
        onClose={() => setWaModalOpen(false)}
        phone={waModalPhone}
        clientId={waModalClientId}
        clientName={waModalClientName}
        contextVars={waModalContextVars}
      />
    </div>
  );
}

function ClientHectaresBadge({ client, cropType }: { client: any; cropType: string }) {
  const [dbHectares, setDbHectares] = useState<number | null>(null);
  
  useEffect(() => {
    if (!client || !client.id) return;
    let active = true;
    api.plantedAreas.list(client.id)
      .then(areas => {
        if (!active) return;
        const crop = cropType.toLowerCase().trim();
        const match = areas.find((a: any) => a.cropType?.toLowerCase().trim() === crop);
        if (match) {
          setDbHectares(Number(match.area_ha) || 0);
        }
      })
      .catch(err => {
        console.error('Error fetching planted areas for badge:', err);
      });
    return () => {
      active = false;
    };
  }, [client.id, cropType]);

  const crop = cropType.toLowerCase().trim();
  let metaHectares = 0;
  if (crop === 'soja') metaHectares = Number(client.hasSoja) || 0;
  else if (crop === 'maiz' || crop === 'maíz') metaHectares = Number(client.hasMaiz) || 0;
  else if (crop === 'trigo') metaHectares = Number(client.hasTrigo) || 0;
  else if (crop === 'sorgo') metaHectares = Number(client.hasSorgo) || 0;
  else if (crop === 'girasol') metaHectares = Number(client.hasGirasol) || 0;

  const totalHectares = dbHectares !== null ? dbHectares : metaHectares;

  if (totalHectares <= 0) return null;

  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950/30 text-amber-400 border border-amber-500/30 flex items-center gap-1">
      🌾 CRM: {totalHectares} ha sembradas
    </span>
  );
}

function WhatsappAlertsView({ clients, opportunities = [], onConvert, setConfirmDialog }: { clients: any[], opportunities?: any[], onConvert: (alert: any) => void, setConfirmDialog: React.Dispatch<React.SetStateAction<any>> }) {
  const { alerts, setAlerts, loading } = useWhatsAppAlerts();
  const { user } = useAuth();
  const { searchQuery, addToast } = useUI();
  const [simMessage, setSimMessage] = useState("");
  const [showConfig, setShowConfig] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isParsingAudio, setIsParsingAudio] = useState(false);

  const processAudioBase64 = async (base64Raw: string, mimeType: string) => {
    setIsParsingAudio(true);
    try {
      const parsed = await api.opportunities.parseAudio({ audio: base64Raw, mimeType });
      
      const type = parsed.type === 'oferta' || parsed.type === 'demanda' ? parsed.type : 'desconocido';
      const crop = ['soja', 'maiz', 'trigo', 'sorgo', 'girasol'].includes(parsed.crop) ? parsed.crop : 'desconocido';
      const quantity = Number(parsed.quantity) || 0;
      const price = Number(parsed.price) || 0;
      const location = parsed.location || 'A convenir';

      if (type === 'desconocido' || crop === 'desconocido') {
        addToast(`Audio transcripto: "${parsed.transcription || ''}". Descartado automáticamente por la IA: no se detectó oferta de venta ni demanda de compra de granos.`, 'info');
        return;
      }

      const senderPhone = '+549' + Math.floor(1100000000 + Math.random() * 8000000000).toString();

      await api.whatsappAlerts.create({
        rawMessage: `[Nota de Voz] ${parsed.transcription || 'Mensaje de voz'}`,
        sourceGroup: type === 'oferta' ? 'Audios Ventas Cba' : 'Audios Demandas Puerto',
        senderPhone,
        suggestedType: type,
        suggestedCropType: crop,
        suggestedQuantity: quantity,
        suggestedPrice: price || null,
        status: 'procesada',
      });

      const matchedClient = clients.find(c => 
        c.phone && 
        (c.phone.replace(/\D/g, '').includes(senderPhone.replace(/\D/g, '')) ||
         senderPhone.replace(/\D/g, '').includes(c.phone.replace(/\D/g, '')))
      );

      await api.opportunities.create({
        type: type,
        clientId: matchedClient?.id || clients[0]?.id || '',
        cropType: crop,
        quantity_tn: quantity,
        price_usd: price,
        location: matchedClient?.location?.address || location || 'A convenir',
      });

      addToast(`🎙️ Nota de voz procesada y cargada: "${parsed.transcription}". Registrado como ${type} de ${crop} (${quantity} tn) en Pipeline.`, 'success');
      
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('alerts-updated'));
      }
    } catch (error: any) {
      console.error(error);
      addToast('Error al transcribir y procesar nota de voz con Gemini.', 'error');
    } finally {
      setIsParsingAudio(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const chunks: Blob[] = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      
      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Data = reader.result as string;
          const base64Raw = base64Data.split(',')[1];
          await processAudioBase64(base64Raw, 'audio/webm');
        };
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      addToast('Grabando nota de voz... 🎙️ Hable ahora.', 'info');
    } catch (err) {
      console.error('Error starting audio recording:', err);
      addToast('No se pudo acceder al micrófono del navegador.', 'error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const simulateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !simMessage.trim()) return;

    try {
      const parsed = await api.opportunities.parseText(simMessage);
      
      const type = parsed.type === 'oferta' || parsed.type === 'demanda' ? parsed.type : 'desconocido';
      const crop = ['soja', 'maiz', 'trigo', 'sorgo', 'girasol'].includes(parsed.crop) ? parsed.crop : 'desconocido';
      const quantity = Number(parsed.quantity) || 0;
      const price = Number(parsed.price) || 0;
      const location = parsed.location || 'A convenir';

      if (type === 'desconocido' || crop === 'desconocido') {
        addToast('Mensaje descartado automáticamente por la IA: no se detectó oferta de venta ni demanda de compra de granos.', 'info');
        setSimMessage("");
        return;
      }

      const senderPhone = '+549' + Math.floor(1100000000 + Math.random() * 8000000000).toString();

      await api.whatsappAlerts.create({
        rawMessage: simMessage,
        sourceGroup: type === 'oferta' ? 'Ventas Granos Cba' : 'Demandas Exportadores',
        senderPhone,
        suggestedType: type,
        suggestedCropType: crop,
        suggestedQuantity: quantity,
        suggestedPrice: price || null,
        status: 'procesada',
      });

      const matchedClient = clients.find(c => 
        c.phone && 
        (c.phone.replace(/\D/g, '').includes(senderPhone.replace(/\D/g, '')) ||
         senderPhone.replace(/\D/g, '').includes(c.phone.replace(/\D/g, '')))
      );

      await api.opportunities.create({
        type: type,
        clientId: matchedClient?.id || clients[0]?.id || '',
        cropType: crop,
        quantity_tn: quantity,
        price_usd: price,
        location: matchedClient?.location?.address || location || 'A convenir',
      });
      addToast('Mensaje captado y cargado automáticamente como oportunidad en el Pipeline.', 'success');

      setSimMessage("");
    } catch (error) {
      addToast('Error al simular y procesar el mensaje.', 'error');
    }
  };

  const processAlert = async (alertId: string) => {
    try {
      await api.whatsappAlerts.updateStatus(alertId, 'procesada');
      addToast('Alerta procesada con éxito', 'success');
      setAlerts(prev => prev.map(x => x.id === alertId ? { ...x, status: 'procesada' } : x));
    } catch(err) {
      addToast('Error al procesar alerta', 'error');
    }
  }

  const deleteAlert = (alertId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Descartar Alerta de WhatsApp',
      message: '¿Estás seguro de que deseas descartar esta alerta? Se eliminará de forma permanente.',
      onConfirm: async () => {
        try {
          await api.whatsappAlerts.delete(alertId);
          addToast('Alerta descartada con éxito', 'success');
          setAlerts(prev => prev.filter(x => x.id !== alertId));
        } catch(err) {
          addToast('Error al descartar alerta', 'error');
        }
        setConfirmDialog((prev: any) => ({ ...prev, isOpen: false }));
      }
    });
  }

  const filteredAlerts = alerts.filter(alert => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return alert.rawMessage.toLowerCase().includes(q) ||
           alert.sourceGroup.toLowerCase().includes(q) ||
           (alert.suggestedCropType && alert.suggestedCropType.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-2">
        <div>
          <h3 className="text-lg font-bold text-white">Bandeja de Alertas Ingeridas</h3>
          <p className="text-xs text-zinc-400">Mensajes capturados en tiempo real de chats y grupos de WhatsApp</p>
        </div>
        <span 
          onDoubleClick={() => setShowConfig(!showConfig)}
          className="text-zinc-700 text-[9px] font-mono select-none cursor-default hover:text-zinc-650 transition-colors"
        >
          ● MÓDULO ACTIVO
        </span>
      </div>

      {showConfig && (
        <div className="bg-[#241b2f] border border-purple-900/40 p-5 rounded-xl space-y-4 shadow-lg">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-purple-200 text-sm flex items-center gap-1.5">
              <span>⚡</span> Carga Manual de Oportunidad
            </h4>
            <span className="text-xs text-purple-400 hidden sm:inline">Analiza texto o notas de voz reales con Gemini</span>
          </div>

          <form onSubmit={simulateWebhook} className="flex flex-col sm:flex-row gap-2">
            <input 
              type="text"
              required
              value={simMessage}
              onChange={e => setSimMessage(e.target.value)}
              placeholder="Ej: Salió venta: vendo 300 toneladas de maiz a 170 USD entrego en puerto San Lorenzo"
              className="flex-1 bg-[#1a1322] border border-purple-700/40 rounded-lg px-3 py-2 text-sm text-purple-100 placeholder-purple-400/60 focus:outline-none focus:border-purple-500"
            />
            <button 
              type="submit"
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 shrink-0"
            >
              Analizar Texto
            </button>
          </form>

          <div className="pt-3 border-t border-purple-900/30 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h5 className="text-xs font-bold text-purple-300 uppercase tracking-widest flex items-center gap-1.5">
                🎙️ Nota de Voz
              </h5>
              <p className="text-[11px] text-purple-400">
                Graba desde tu micrófono para transcribir y analizar con Gemini.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isRecording ? (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer animate-pulse"
                >
                  <span className="w-2 h-2 bg-white rounded-full animate-ping inline-block" />
                  Detener Grabación
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={isParsingAudio}
                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <span>🎙️ Grabar Audio</span>
                </button>
              )}

              {isParsingAudio && (
                <span className="text-xs text-purple-300 flex items-center gap-1.5 animate-pulse font-mono pl-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Procesando audio con Gemini...
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {loading ? (
             <div className="p-8 text-center text-gray-500">Cargando alertas...</div>
        ) : filteredAlerts.length === 0 ? (
             <div className="p-8 text-center text-gray-500 bg-[#1e1e1e] rounded-xl border border-[#333]">
               {searchQuery ? 'No se encontraron alertas que coincidan con la búsqueda.' : 'No se detectaron alertas nuevas.'}
             </div>
        ) : (
          filteredAlerts.map(alert => {
            const matchedClient = alert.clientId 
              ? clients.find(c => c.id === alert.clientId) 
              : clients.find(c => c.phone && alert.senderPhone && (c.phone.replace(/\D/g, '').includes(alert.senderPhone.replace(/\D/g, '')) || alert.senderPhone.replace(/\D/g, '').includes(c.phone.replace(/\D/g, ''))));

            const possibleMatches = opportunities.filter(opp => {
              if (!['abierta', 'negociacion', 'esperando_confirmacion'].includes(opp.status)) return false;
              if (opp.clientId && matchedClient && opp.clientId === matchedClient.id) return false;
              if (alert.suggestedType === 'oferta') {
                return opp.type === 'demanda' && opp.cropType === alert.suggestedCropType;
              } else if (alert.suggestedType === 'demanda') {
                return opp.type === 'oferta' && opp.cropType === alert.suggestedCropType;
              }
              return false;
            });

            return (
              <div 
                key={alert.id} 
                className={`bg-[#1e1e1e] border-l-4 rounded-xl p-4 sm:p-5 shadow-lg flex flex-col md:flex-row md:items-center gap-4 sm:gap-6 justify-between transition-all ${alert.status === 'procesada' ? 'opacity-55' : ''} ${
                  alert.suggestedType === 'oferta' 
                    ? 'border-green-500/50 hover:border-green-500/85' 
                    : alert.suggestedType === 'demanda' 
                      ? 'border-blue-500/50 hover:border-blue-500/85' 
                      : 'border-purple-500/50 hover:border-purple-500/85'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-900/20 text-purple-300 border border-purple-500/20 uppercase tracking-wider">{alert.sourceGroup}</span>
                    <span className="text-[11px] text-gray-400 font-mono font-medium">{alert.senderPhone}</span>
                    <span className="text-[11px] text-gray-500">• {alert.createdAt ? format(alert.createdAt, 'HH:mm dd/MM') : ''}</span>
                    
                    {matchedClient ? (
                      <>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/30 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          🏢 Cliente: {matchedClient.name} {matchedClient.type ? `(${matchedClient.type})` : ''}
                        </span>
                        {alert.suggestedCropType && alert.suggestedCropType !== 'desconocido' && (
                          <ClientHectaresBadge client={matchedClient} cropType={alert.suggestedCropType} />
                        )}
                      </>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                        👤 Prospecto de Negocio
                      </span>
                    )}

                    {possibleMatches.length > 0 && alert.status === 'nueva' && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/25 text-amber-400 border border-amber-500/35 flex items-center gap-1 animate-pulse shadow-sm shadow-amber-500/10">
                        ⚡ Cruce Compatible Detectado
                      </span>
                    )}
                  </div>

                <div className="relative max-w-2xl bg-[#0b141a] border border-[#232d36] rounded-2xl px-4 py-3 text-xs sm:text-sm text-zinc-100 font-sans leading-relaxed mb-4 shadow-sm break-words flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-4 border-b border-[#232d36]/50 pb-1.5 mb-0.5">
                    <span className="text-[10px] text-emerald-500 font-bold tracking-wide uppercase flex items-center gap-1.5 select-none">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block animate-pulse" />
                      Incoming WhatsApp Chat
                    </span>
                    <span className="text-[9.5px] text-zinc-500 font-mono select-none">{alert.createdAt ? format(alert.createdAt, 'HH:mm dd/MM') : ''}</span>
                  </div>
                  <p className="italic text-zinc-200">"{alert.rawMessage}"</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/40">
                  <div className="flex flex-col gap-0.5 px-1">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider select-none">Operación</span>
                    <span className={`text-xs font-black capitalize flex items-center gap-1.5 ${alert.suggestedType === 'oferta' ? 'text-green-400' : 'text-blue-400'}`}>
                      {alert.suggestedType === 'oferta' ? '🛒 Oferta (Venta)' : '🛍️ Demanda (Compra)'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 px-1 border-l border-zinc-800/80">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider select-none">Grano</span>
                    <span className="text-xs font-black text-white flex items-center gap-1.5 capitalize">
                      🌾 {alert.suggestedCropType}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 px-1 border-l border-zinc-800/80">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider select-none">Volumen</span>
                    <span className={`text-xs font-black flex items-center gap-1 ${Number(alert.suggestedQuantity) > 0 ? 'text-zinc-100 font-mono' : 'text-amber-400'}`}>
                      ⚖️ {Number(alert.suggestedQuantity) > 0 ? `${alert.suggestedQuantity} TN` : 'Cantidad pendiente'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 px-1 border-l border-zinc-800/80">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider select-none">Precio Sugerido</span>
                    <span className="text-xs font-black text-purple-400 flex items-center gap-1 font-mono">
                      💵 {alert.suggestedPrice ? `$${alert.suggestedPrice} USD` : 'A convenir'}
                    </span>
                  </div>
                </div>

                {(alert.location || alert.paymentTerms || alert.grainQuality) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 px-3 py-2 bg-zinc-950/20 rounded-lg border border-zinc-900/40 text-[11px] text-zinc-400">
                    {alert.location && (
                      <span className="flex items-center gap-1">
                        📍 <strong className="text-zinc-500 font-medium">Destino:</strong> <span className="capitalize text-zinc-300 font-bold">{alert.location}</span>
                      </span>
                    )}
                    {alert.paymentTerms && (
                      <span className="flex items-center gap-1 border-l border-zinc-850 pl-3">
                        💳 <strong className="text-zinc-500 font-medium">Pago:</strong> <span className="capitalize text-zinc-300 font-bold">{alert.paymentTerms}</span>
                      </span>
                    )}
                    {alert.grainQuality && (
                      <span className="flex items-center gap-1 border-l border-zinc-850 pl-3">
                        🛡️ <strong className="text-zinc-500 font-medium">Calidad:</strong> <span className="capitalize text-zinc-300 font-bold">{alert.grainQuality}</span>
                      </span>
                    )}
                  </div>
                )}

                {possibleMatches.length > 0 && alert.status === 'nueva' && (
                  <div className="mt-4 p-3 bg-[#231b15]/90 border border-amber-500/20 rounded-xl space-y-2 shadow-inner">
                    <p className="text-[10px] text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1">
                      <span>💡</span> Oportunidades de Cruce en CRM:
                    </p>
                    <div className="space-y-1.5">
                      {possibleMatches.map(opp => {
                        const client = clients.find(c => c.id === opp.clientId);
                        const clientName = client?.name || 'Cliente';
                        const overlapQty = Math.min(Number(alert.suggestedQuantity) || 0, Number(opp.quantity_tn) || 0);
                        const spread = Number(opp.price_usd) - (Number(alert.suggestedPrice) || 0);
                        const formattedSpread = spread >= 0 ? `+$${spread}` : `-$${Math.abs(spread)}`;

                        return (
                          <div key={opp.id} className="flex flex-col sm:flex-row justify-between sm:items-center text-xs text-zinc-300 bg-[#1e1712] px-3 py-2 rounded-lg border border-[#3e2e1e]/40 gap-2">
                            <div>
                              <span className="font-bold text-white">{clientName}</span>{' '}
                              <span className="text-zinc-500">busca</span>{' '}
                              <span className="font-bold text-amber-400">{opp.quantity_tn} TN</span>{' '}
                              <span className="text-zinc-500">a</span> <span className="font-bold text-white">${opp.price_usd} USD/tn</span>{' '}
                              <span className="text-zinc-500">en</span>{' '}
                              <span className="text-zinc-300 capitalize">{opp.location || 'A convenir'}</span>
                            </div>
                            <div className="flex items-center gap-3 self-end sm:self-auto">
                              <span className={`text-[10.5px] font-mono font-bold ${spread >= 0 ? 'text-green-400' : 'text-zinc-500'}`}>
                                Spread: {formattedSpread}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  onConvert({
                                    ...alert,
                                    clientId: alert.clientId || matchedClient?.id,
                                    suggestedPrice: alert.suggestedPrice || opp.price_usd,
                                    suggestedQuantity: overlapQty || alert.suggestedQuantity
                                  });
                                  addToast('Cruce rápido iniciado. ¡Complete los datos para confirmar!', 'info');
                                }}
                                className="bg-amber-500 hover:bg-amber-600 text-black font-black px-2.5 py-1 rounded text-[9.5px] uppercase tracking-wider transition active:scale-95 cursor-pointer shadow-sm shadow-amber-500/10"
                              >
                                Cruce Rápido 🤝
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row md:flex-col gap-2 w-full md:w-auto shrink-0 border-t border-[#2d2d2d] md:border-none pt-3 md:pt-0">
                {alert.status === 'nueva' && (
                  <>
                    <button 
                      onClick={() => onConvert(alert)} 
                      className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors active:scale-95 duration-100 flex-1 sm:flex-initial"
                    >
                      <Plus className="w-4 h-4" /> Convertir
                    </button>
                    <button 
                      onClick={() => processAlert(alert.id)} 
                      className="bg-zinc-800 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 hover:bg-[#333] transition-colors active:scale-95 duration-100 flex-1 sm:flex-initial border border-[#3e3e3e]"
                    >
                      <CheckCircle2 className="w-4 h-4 text-green-500" /> Listo
                    </button>
                  </>
                )}
                <button 
                  onClick={() => deleteAlert(alert.id)} 
                  className="text-gray-400 hover:text-red-500 font-bold text-xs px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 hover:bg-red-500/10 transition-colors active:scale-95 duration-100 flex-1 sm:flex-initial"
                >
                  <Trash2 className="w-4 h-4" /> Descartar
                </button>
              </div>
            </div>
            );
          })
        )}
      </div>
    </div>
  )
}

function KanbanBoardView({
  filteredOpps,
  clients,
  deleteOpp,
  toggleStatus,
  handleStatusChange,
  formatNumber,
  draggedOverColumn,
  setDraggedOverColumn,
  handleOpenWaModal
}: {
  filteredOpps: any[];
  clients: any[];
  deleteOpp: (id: string) => void;
  toggleStatus: (opp: any) => void;
  handleStatusChange: (id: string, newStatus: string) => Promise<void>;
  formatNumber: (num: number) => string;
  draggedOverColumn: string | null;
  setDraggedOverColumn: (col: string | null) => void;
  handleOpenWaModal: (phone: string, id: string, name: string, context?: any) => void;
}) {
  const [selectedMobileCol, setSelectedMobileCol] = useState<string>('abierta');

  const columns = [
    { id: 'abierta',                name: '📂 Abiertas',              shortName: '📂 Abiertas', borderClass: 'border-zinc-800 bg-zinc-800/10',       headerClass: 'text-zinc-300' },
    { id: 'negociacion',            name: '🤝 En Negociación',        shortName: '🤝 Negociac.', borderClass: 'border-amber-500/30 bg-amber-500/5',   headerClass: 'text-amber-300' },
    { id: 'esperando_confirmacion', name: '⏳ Esp. Confirmación',     shortName: '⏳ Confirm.',   borderClass: 'border-sky-500/30 bg-sky-500/5',       headerClass: 'text-sky-300' },
    { id: 'ganada',                 name: '🏆 Ganadas',               shortName: '🏆 Ganadas',  borderClass: 'border-green-500/30 bg-green-500/5',   headerClass: 'text-green-300' },
    { id: 'perdida',                name: '❌ Perdidas',              shortName: '❌ Perdidas', borderClass: 'border-red-500/30 bg-red-500/5',       headerClass: 'text-red-300' },
    { id: 'vencida',                name: '⌛ Vencidas',              shortName: '⌛ Vencidas', borderClass: 'border-zinc-700 bg-zinc-700/5',        headerClass: 'text-zinc-500' }
  ] as const;

  const getColumnItems = (statusId: string) => {
    return filteredOpps.filter(o => {
      if (statusId === 'abierta') {
        return o.status === 'abierta' || (!o.status);
      }
      if (statusId === 'negociacion') {
        return o.status === 'negociacion';
      }
      if (statusId === 'esperando_confirmacion') {
        return o.status === 'esperando_confirmacion';
      }
      if (statusId === 'ganada') {
        return o.status === 'ganada';
      }
      if (statusId === 'perdida') {
        return o.status === 'perdida';
      }
      if (statusId === 'vencida') {
        return o.status === 'vencida';
      }
      return false;
    });
  };

  return (
    <div className="w-full max-w-full min-w-0 space-y-3 p-2 sm:p-4">
      {/* Mobile Column Switcher Pills */}
      <div className="mobile-scroll-row sm:hidden flex gap-1.5 pb-1.5 scrollbar-none px-1">
        <button
          type="button"
          onClick={() => setSelectedMobileCol('all')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
            selectedMobileCol === 'all'
              ? 'bg-zinc-200 text-black font-black shadow'
              : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700/60'
          }`}
        >
          <span>Todos</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 font-mono">
            {filteredOpps.length}
          </span>
        </button>
        {columns.map(col => {
          const count = getColumnItems(col.id).length;
          const isSelected = selectedMobileCol === col.id;
          return (
            <button
              key={col.id}
              type="button"
              onClick={() => setSelectedMobileCol(col.id)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                isSelected
                  ? 'bg-green-500 text-black font-black shadow-lg shadow-green-500/20'
                  : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700/60'
              }`}
            >
              <span>{col.shortName}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                isSelected ? 'bg-black/30 text-black' : 'bg-zinc-900 text-zinc-400'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Kanban Columns Grid / Horizontal Slider */}
      <div className="mobile-scroll-row flex gap-4 min-h-[500px] scrollbar-none items-stretch select-none snap-x snap-mandatory pb-4">
        {columns.map(col => {
          const items = getColumnItems(col.id);
          const isOver = draggedOverColumn === col.id;
          const isHiddenOnMobile = selectedMobileCol !== 'all' && selectedMobileCol !== col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                if (draggedOverColumn !== col.id) {
                  setDraggedOverColumn(col.id);
                }
              }}
              onDragLeave={() => {
                setDraggedOverColumn(null);
              }}
              onDrop={async (e) => {
                e.preventDefault();
                setDraggedOverColumn(null);
                const id = e.dataTransfer.getData('text/plain');
                if (id) {
                  await handleStatusChange(id, col.id);
                }
              }}
              className={`w-[calc(100vw-3.75rem)] max-w-[22rem] sm:w-76 shrink-0 border rounded-2xl p-3.5 flex-col transition-all duration-200 snap-start ${isHiddenOnMobile ? 'hidden sm:flex' : 'flex'} ${col.borderClass} ${isOver ? 'ring-2 ring-green-500/60 scale-[1.01] border-green-500/50 shadow-lg shadow-green-500/5' : ''}`}
            >
              <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-zinc-800/60">
                <h4 className={`font-black text-xs uppercase tracking-widest ${(col as any).headerClass}`}>{col.name}</h4>
                <span className="bg-zinc-900 border border-zinc-800 text-zinc-400 text-[10px] px-1.5 py-0.5 rounded-md font-mono font-bold">
                  {items.length}
                </span>
              </div>

              <div className="flex-1 flex flex-col gap-3 overflow-y-auto max-h-[600px] pr-1.5 scrollbar-thin">
                {items.length === 0 ? (
                  <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 rounded-xl text-zinc-550 text-xs gap-1.5">
                    <span>📥</span>
                    <span>Sin operaciones aquí</span>
                  </div>
                ) : (
                  items.map(opp => {
                    const client = clients.find(c => c.id === opp.clientId);
                    const clientName = client?.name || 'Desconocido';
                    const clientPhone = client?.phone;
                    const cs = getCropStyle(opp.cropType);
                    const isOferta = opp.type === 'oferta';
                    
                    return (
                      <div
                        key={opp.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', opp.id);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        className="bg-[#1f1f1f] hover:bg-[#252525] border border-[#2e2e2e] hover:border-[#3a3a3a] rounded-xl p-3.5 transition-all duration-150 cursor-grab active:cursor-grabbing shadow-md relative group"
                      >
                        <div className="flex items-center justify-between mb-2.5">
                          <span className="text-[9px] text-zinc-600 font-mono">
                            {opp.createdAt ? format(new Date(opp.createdAt), 'dd/MM/yy') : '-'}
                          </span>
                          <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded-md border ${
                            isOferta
                              ? 'bg-green-500/10 text-green-400 border-green-500/20'
                              : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          }`}>
                            {isOferta ? '↑ Venta' : '↓ Compra'}
                          </span>
                        </div>

                        <h5 className="font-black text-xs text-white truncate mb-1.5">{clientName}</h5>

                        <div className="flex items-center gap-1.5 mb-2.5">
                          <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-md border ${cs.bg} ${cs.text} ${cs.border}`}>
                            {cs.emoji} {opp.cropType}
                          </span>
                          <span className="text-[9px] font-bold text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-md font-mono">
                            {formatNumber(opp.quantity_tn)} TN
                          </span>
                        </div>

                        <div className={`w-full rounded-lg px-3 py-2 ${
                          isOferta ? 'bg-green-500/8 border border-green-500/15' : 'bg-blue-500/8 border border-blue-500/15'
                        }`}>
                          <p className={`text-xs font-black font-mono ${isOferta ? 'text-green-400' : 'text-blue-400'}`}>
                            {opp.priceMode === 'a_negociar' ? 'A negociar' : `$${formatNumber(opp.price_usd)} USD/tn`}
                          </p>
                          {opp.location && (
                            <p className="text-[9px] text-zinc-600 mt-0.5 truncate">📍 {opp.location}</p>
                          )}
                        </div>

                        {(opp.nextAction || opp.expiresAt || opp.lostReason) && (
                          <div className="space-y-0.5 text-[9px] text-zinc-500 border-t border-zinc-800 mt-2.5 pt-2">
                            {opp.nextAction && <p className="truncate"><span className="text-zinc-600">▶</span> {opp.nextAction}</p>}
                            {opp.expiresAt && <p><span className="text-zinc-600">⏱</span> Vence {format(new Date(opp.expiresAt), 'dd/MM/yy')}</p>}
                            {opp.lostReason && <p className="text-red-400"><span className="text-zinc-600">✕</span> {opp.lostReason}</p>}
                          </div>
                        )}

                        {/* Mobile Status Mover & Quick Action Bar */}
                        <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                          <select
                            value={opp.status || 'abierta'}
                            onChange={(e) => handleStatusChange(opp.id, e.target.value)}
                            className="bg-zinc-900 border border-zinc-700/80 text-zinc-300 text-[10px] rounded-lg px-2 py-1 outline-none font-mono cursor-pointer flex-1 max-w-[140px]"
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenWaModal(clientPhone, opp.clientId, clientName, {
                                    cropType: opp.cropType, quantity_tn: opp.quantity_tn,
                                    price_usd: opp.price_usd, location: opp.location
                                  });
                                }}
                                className="p-1.5 text-green-400 bg-green-500/10 hover:bg-green-500/20 rounded-lg transition-colors cursor-pointer border border-green-500/20"
                                title="WhatsApp"
                              >
                                <Phone className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteOpp(opp.id); }}
                              className="p-1.5 text-zinc-400 bg-zinc-800 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer border border-zinc-700 hover:border-red-500/20"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3 h-3" />
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
        })}
      </div>
    </div>
  );
}
