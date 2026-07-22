import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle2, Circle, Settings, ExternalLink, Info, Loader2, MessageSquare, Phone, ChevronDown, ChevronUp, Handshake, LayoutGrid, List } from 'lucide-react';
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

export function Oportunidades() {
  const { opportunities, loading: oppLoading } = useOpportunities();
  const { clients, loading: clientsLoading } = useClients();
  const { alerts, loading: alertsLoading } = useWhatsAppAlerts();
  const { user } = useAuth();
  const { searchQuery, addToast } = useUI();

  const [activeTab, setActiveTab] = useState<'ofertas' | 'demandas' | 'whatsapp' | 'matches'>('ofertas');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [draggedOverColumn, setDraggedOverColumn] = useState<string | null>(null);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await api.opportunities.update(id, { status: newStatus });
      addToast(`Oportunidad movida a ${newStatus} ✨`, 'success');
    } catch (error) {
      addToast('Error al mover oportunidad', 'error');
    }
  };

  // WhatsApp Template Modal State
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
  });

  const [oppProvincia, setOppProvincia] = useState('');
  const [oppLocalidad, setOppLocalidad] = useState('');
  const [oppCustomLocalidad, setOppCustomLocalidad] = useState('');

  // Synchronize dynamic location selects when formData.location changes (manually, via AI, or alert load)
  React.useEffect(() => {
    const locStr = formData.location || '';
    
    let parsedProv = '';
    let parsedLoc = '';
    
    // Split by comma
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
    
    // Substring fallback
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
    
    // Simulate lookup of client name to cache it slightly
    const client = clients.find(c => c.id === formData.clientId);
    if (!client) {
      addToast("Seleccione un cliente válido", "error");
      return;
    }

    try {
      await api.opportunities.create({
        type: activeTab === 'ofertas' ? 'oferta' : 'demanda',
        clientId: formData.clientId,
        cropType: formData.cropType,
        quantity_tn: Number(formData.quantity_tn),
        price_usd: Number(formData.price_usd),
        location: formData.location || client.location?.address || 'A convenir',
      });
      setFormData({ ...formData, quantity_tn: '', price_usd: '', location: '' });
      addToast(`${activeTab === 'ofertas' ? 'Oferta' : 'Demanda'} creada con éxito`, 'success');
    } catch (error) {
      addToast('Error al crear el registro', 'error');
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
        status: opp.status === 'abierta' ? 'cerrada' : 'abierta'
      });
      addToast(`Estado cambiado a ${opp.status === 'abierta' ? 'cerrada' : 'abierta'}`, 'success');
    } catch (error) {
      addToast('Error al actualizar estado', 'error');
    }
  };

  // Load matches from the backend matching engine
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

  const handleNotifyMatch = async (match: any) => {
    if (notifyingMatchId) return;
    setNotifyingMatchId(match.id);
    try {
      const res = await api.whatsapp.notifyMatch({
        sellerId: match.offer.clientId,
        buyerId: match.demand.clientId,
        cropType: match.cropType,
        overlapQuantity: match.overlapQuantity,
        price: match.midpointPrice,
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
    
    if (!seller || !buyer) {
      addToast('Error: No se pudieron encontrar los clientes del cruce', 'error');
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Liquidar Cruce Algorítmico',
      message: `¿Deseas liquidar este cruce?\nSe venderán ${formatNumber(match.overlapQuantity)} TN de ${match.cropType.toUpperCase()} de ${seller.name} (${match.offer.price_usd} USD) a ${buyer.name} (${match.demand.price_usd} USD).\n\nComisión estimada: USD ${formatNumber(Math.round(match.totalCommission))} (2%)`,
      onConfirm: async () => {
        try {
          // 1. Guardar Deal
          await api.deals.create({
            cropType: match.cropType,
            sellerId: match.offer.clientId,
            buyerId: match.demand.clientId,
            sellerName: seller.name,
            buyerName: buyer.name,
            quantity_tn: match.overlapQuantity,
            price_seller: match.offer.price_usd,
            price_buyer: match.demand.price_usd,
            totalCommission: Math.round(match.totalCommission),
            location: match.demand.location || match.offer.location || 'A convenir',
          });

          // 2. Liquidar cantidades parciales
          const offerDiff = match.offer.quantity_tn - match.overlapQuantity;
          const demandDiff = match.demand.quantity_tn - match.overlapQuantity;

          if (offerDiff <= 0) {
            await api.opportunities.update(match.offer.id, { status: 'cerrada' });
          } else {
            await api.opportunities.update(match.offer.id, { quantity_tn: offerDiff });
            addToast(`Oferta reducida a ${offerDiff} TN por saldo remanente`, 'info');
          }

          if (demandDiff <= 0) {
            await api.opportunities.update(match.demand.id, { status: 'cerrada' });
          } else {
            await api.opportunities.update(match.demand.id, { quantity_tn: demandDiff });
            addToast(`Demanda reducida a ${demandDiff} TN por saldo remanente`, 'info');
          }

          addToast(`🏆 Boleto liquidado por ${formatNumber(match.overlapQuantity)} TN con éxito!`, 'success');
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

      // Handle nested values or special cases
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Gestión de Oportunidades</h1>

      <div className="bg-[#1b1b1b] border border-[#2d2d2d] rounded-xl p-1.5 flex gap-1.5 mb-6 overflow-x-auto scrollbar-none shadow-md">
        <button 
          onClick={() => setActiveTab('ofertas')}
          className={`flex-1 min-w-[125px] py-2.5 rounded-lg text-xs sm:text-sm font-bold uppercase tracking-wider transition-all duration-150 whitespace-nowrap flex items-center justify-center gap-2 cursor-pointer ${activeTab === 'ofertas' ? 'bg-[#212f27] text-green-400 border border-green-500/20 shadow-sm shadow-green-500/5' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}
        >
          🌾 Ofertas (Venta)
        </button>
        <button 
          onClick={() => setActiveTab('demandas')}
          className={`flex-1 min-w-[125px] py-2.5 rounded-lg text-xs sm:text-sm font-bold uppercase tracking-wider transition-all duration-150 whitespace-nowrap flex items-center justify-center gap-2 cursor-pointer ${activeTab === 'demandas' ? 'bg-[#182635] text-blue-400 border border-blue-500/20 shadow-sm shadow-blue-500/5' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}
        >
          🛍️ Demandas (Compra)
        </button>
        <button 
          onClick={() => setActiveTab('whatsapp')}
          className={`flex-1 min-w-[160px] py-2.5 rounded-lg text-xs sm:text-sm font-bold uppercase tracking-wider transition-all duration-150 whitespace-nowrap flex items-center justify-center gap-2 cursor-pointer ${activeTab === 'whatsapp' ? 'bg-[#291b35] text-purple-400 border border-purple-500/20 shadow-sm shadow-purple-500/5' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}
        >
          📱 Alertas WhatsApp
        </button>
        <button 
          onClick={() => setActiveTab('matches')}
          className={`flex-1 min-w-[160px] py-2.5 rounded-lg text-xs sm:text-sm font-bold uppercase tracking-wider transition-all duration-150 whitespace-nowrap flex items-center justify-center gap-2 cursor-pointer ${activeTab === 'matches' ? 'bg-[#2e2318] text-amber-400 border border-amber-500/20 shadow-sm shadow-amber-500/5' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}
        >
          🤝 Cruces ({matches.length})
        </button>
      </div>

      {activeTab === 'whatsapp' ? (
        <>
          <WhatsappQRSetup />
          <WhatsappAlertsView 
            clients={clients}
            opportunities={opportunities}
            setConfirmDialog={setConfirmDialog}
            onConvert={async (alert) => {
              const type = alert.suggestedType === 'demanda' ? 'demandas' : 'ofertas';
              setActiveTab(type);
              setIsMobileFormExpanded(true);
              
              // Try to find client by prematched clientId or phone
              const matchedClient = alert.clientId
                ? clients.find(c => c.id === alert.clientId)
                : clients.find(c => 
                    c.phone && alert.senderPhone && 
                    (c.phone.replace(/\D/g, '').includes(alert.senderPhone.replace(/\D/g, '')) ||
                     alert.senderPhone.replace(/\D/g, '').includes(c.phone.replace(/\D/g, '')))
                  );

              setFormData({
                clientId: matchedClient?.id || '',
                cropType: (['soja', 'maiz', 'trigo', 'sorgo', 'girasol'].includes(alert.suggestedCropType || '') ? alert.suggestedCropType : 'soja') as any,
                quantity_tn: alert.suggestedQuantity?.toString() || '',
                price_usd: alert.suggestedPrice?.toString() || '', 
                location: alert.location || '',
              });
              
              if (alert.suggestedPrice) {
                addToast('Datos cargados de IA con precio pre-completado ✨', 'success');
              } else {
                addToast('Datos del mensaje precargados. ¡Complete la información restante!', 'success');
              }
              
              try {
                await api.whatsappAlerts.updateStatus(alert.id, 'procesada');
              } catch (error) {
                console.error("Error updating alert status:", error);
              }
            }} 
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
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row xl:flex-col justify-between items-stretch xl:items-end gap-3 min-w-[245px] border-t xl:border-t-0 xl:border-l border-zinc-800 pt-4 sm:pt-0 sm:pl-4 xl:pl-6">
                      
                      <div className="flex-1 flex flex-col justify-center sm:text-right xl:text-right">
                        <div className="flex items-center gap-1.5 sm:justify-end xl:justify-end">
                          <span className="text-xs text-gray-400 font-medium">Margen Spread:</span>
                          <span className={`text-sm font-mono font-black ${profitable ? 'text-green-400' : 'text-zinc-400'}`}>
                            {profitable ? '+' : ''}${formatNumber(match.priceSpread)} USD
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-0.5 font-mono">Arbitraje medio: ${formatNumber(match.midpointPrice)} USD</p>
                        <div className="mt-1.5 flex items-center gap-1.5 sm:justify-end xl:justify-end">
                          <span className="text-[11px] text-gray-400">Honorarios (2%):</span>
                          <span className="font-mono font-bold text-amber-400">${formatNumber(Math.round(match.totalCommission))} USD</span>
                        </div>
                      </div>

                      <div className="shrink-0 flex flex-col sm:flex-row xl:flex-col items-stretch xl:items-end justify-end gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => handleNotifyMatch(match)}
                          disabled={notifyingMatchId === match.id}
                          className="w-full sm:w-auto bg-green-600/10 hover:bg-green-600/20 text-green-400 font-bold text-xs px-5 py-3 rounded-xl transition-all border border-green-500/25 active:scale-95 duration-100 uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                        >
                          {notifyingMatchId === match.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Notificar Cruce 📢</span>}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCloseMatch(match)}
                          className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-black text-xs px-5 py-3 rounded-xl transition-all shadow-md active:scale-95 duration-100 uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                        >
                          Concretar Cruce 🤝
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
          {/* Formulario de Carga: Colapsable en Móviles para Maximizar Espacio */}
          <div className="bg-[#1e1e1e] border border-[#333] rounded-xl overflow-hidden shadow-xl mb-6">
            {/* Header del Formulario */}
            <div 
              onClick={() => setIsMobileFormExpanded(!isMobileFormExpanded)}
              className="p-4 sm:p-5 bg-gradient-to-r from-[#212121] to-[#282828] flex items-center justify-between cursor-pointer md:cursor-default"
            >
              <div className="flex flex-col gap-0.5 sm:gap-1">
                <h3 className="text-sm sm:text-base font-bold flex items-center gap-2 text-white">
                  <span>{activeTab === 'ofertas' ? '🛒' : '🛍️'}</span>
                  {activeTab === 'ofertas' ? 'Registrar Nueva Oferta de Venta' : 'Registrar Nueva Demanda de Compra'}
                </h3>
                <p className="text-[10px] sm:text-xs text-gray-400 font-mono">
                  {isMobileFormExpanded ? 'Toca para contraer' : 'Toca para expandir el formulario rápido'}
                </p>
              </div>

              {/* Botón de control de expansión móvil */}
              <div className="flex items-center gap-2">
                <button 
                  type="button"
                  className="md:hidden p-1.5 bg-[#333] hover:bg-[#444] rounded-lg text-gray-300 hover:text-white transition-colors"
                  title={isMobileFormExpanded ? "Ocultar" : "Mostrar"}
                >
                  {isMobileFormExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Contenido (Visible siempre en pantallas medianas+, colapsado en mobile por defecto) */}
            <div className={`${isMobileFormExpanded ? 'block' : 'hidden md:block'} p-4 sm:p-6 border-t border-[#333] bg-[#1d1d1d]`}>


              {/* Formulario HTML clasico robusto */}
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
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Precio (USD/tn)</label>
                  <input required type="number" min="1" step="0.5" value={formData.price_usd} onChange={e => setFormData({...formData, price_usd: e.target.value})} placeholder="USD/tn" className="w-full bg-[#252525] border border-[#444] rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-green-500" />
                </div>
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
                <div className="pt-2 col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-4 xl:col-span-6 flex justify-end">
                  <button type="submit" disabled={clientsLoading} className={`w-full sm:w-auto px-6 py-2.5 rounded-lg text-xs font-bold text-white transition-colors shadow-lg flex items-center justify-center gap-2 active:scale-95 duration-100 cursor-pointer ${activeTab === 'ofertas' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                    <Plus className="w-4 h-4" /> Registrar {activeTab === 'ofertas' ? 'Oferta' : 'Demanda'}
                  </button>
                </div>
              </form>
            </div>
          </div>

      <div className="bg-[#1e1e1e] border border-[#333] rounded-xl shadow-xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-[#333] flex flex-col sm:flex-row sm:items-center sm:justify-between bg-[#252525] gap-3">
          <div className="flex overflow-x-auto whitespace-nowrap scrollbar-none gap-2 pb-1 sm:pb-0">
            {['all', 'soja', 'maiz', 'trigo', 'sorgo', 'girasol'].map(c => (
              <button 
                key={c}
                onClick={() => setFilterCrop(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold capitalize transition-colors tracking-wide shrink-0 ${filterCrop === c ? 'bg-white text-black' : 'bg-[#333] text-gray-400 hover:text-white'}`}
              >
                {c === 'all' ? 'Todos' : c}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 shrink-0 justify-between sm:justify-end w-full sm:w-auto">
            {/* View Mode Toggle */}
            <div className="flex bg-[#333] rounded-lg p-0.5 border border-[#444] shadow-inner shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1.5 rounded-md transition-all duration-200 flex items-center gap-1.5 text-xs font-bold ${viewMode === 'list' ? 'bg-green-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                title="Vista Lista"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Lista</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('kanban')}
                className={`px-2.5 py-1.5 rounded-md transition-all duration-200 flex items-center gap-1.5 text-xs font-bold ${viewMode === 'kanban' ? 'bg-green-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                title="Vista Kanban"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Kanban</span>
              </button>
            </div>
            <span className="text-xs sm:text-sm font-medium text-gray-500 shrink-0 font-mono">
              {filteredOpps.length} {filteredOpps.length === 1 ? 'resultado' : 'resultados'}
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
          <>
            {/* Vista Mobile: Lista de tarjetas interactivas ultra-pulida */}
            <div className="md:hidden divide-y divide-[#2e2e2e] overflow-hidden">
              {oppLoading ? (
                <div className="p-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-green-500 mx-auto mb-4" />
                  <p className="text-gray-500 font-medium text-xs">Cargando oportunidades...</p>
                </div>
              ) : filteredOpps.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="bg-[#252525] w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Info className="w-6 h-6 text-gray-500" />
                  </div>
                  <p className="text-sm font-bold mb-1">No hay {activeTab}</p>
                  <p className="text-gray-500 text-xs">Modifica los filtros de grano o crea una {activeTab === 'ofertas' ? 'oferta' : 'demanda'} nueva.</p>
                </div>
              ) : (
                filteredOpps.map(opp => {
                  const client = clients.find(c => c.id === opp.clientId);
                  const clientName = client?.name || 'Desconocido';
                  const clientPhone = client?.phone;
                  return (
                    <div 
                      key={opp.id} 
                      className={`p-4 bg-[#1e1e1e] hover:bg-[#252525]/35 transition-all flex flex-col gap-3.5 border-l-4 ${opp.type === 'oferta' ? 'border-green-600' : 'border-blue-600'}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
                          <span>📅</span>
                          {opp.createdAt ? format(new Date(opp.createdAt), 'dd/MM/yyyy') : '-'}
                        </span>
                        <button 
                          onClick={() => toggleStatus(opp)} 
                          className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider transition-all cursor-pointer ${opp.status === 'abierta' ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20' : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'}`}
                        >
                          {opp.status === 'abierta' ? <Circle className="w-3 h-3 text-amber-500" /> : <CheckCircle2 className="w-3 h-3 text-green-400" />}
                          <span>{opp.status}</span>
                        </button>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-1.5 truncate">
                          {clientName}
                        </h4>
                        <div className="flex items-center gap-1 text-[11px] text-gray-400 mt-1">
                          <span className="text-gray-500 font-medium">📍 Destino:</span>
                          <span className="truncate">{opp.location || 'A convenir'}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-[#2d2d2d] mt-1 gap-2 flex-wrap">
                        <div className="flex gap-1.5 shrink-0">
                          <span className="bg-[#272727] border border-[#3b3b3b] px-2 py-1 rounded text-[11px] font-semibold text-gray-200 capitalize">
                            🌱 {opp.cropType}
                          </span>
                          <span className="bg-[#272727] border border-[#3b3b3b] px-2 py-1 rounded text-[11px] font-mono text-gray-200 font-medium">
                            {formatNumber(opp.quantity_tn)} TN
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`text-base font-black font-mono tracking-tight ${opp.type === 'oferta' ? 'text-green-400' : 'text-blue-400'}`}>
                            ${formatNumber(opp.price_usd)}
                          </span>
                          
                          {/* WhatsApp trigger button if a phone exists */}
                          {clientPhone && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenWaModal(clientPhone, opp.clientId, clientName, {
                                  cropType: opp.cropType,
                                  quantity_tn: opp.quantity_tn,
                                  price_usd: opp.price_usd,
                                  location: opp.location
                                });
                              }}
                              className="p-1.5 bg-green-600/15 hover:bg-green-600/30 text-green-400 hover:text-green-300 rounded-lg transition-colors border border-green-500/20 flex items-center justify-center active:scale-95 cursor-pointer"
                              title="Contactar por WhatsApp (Plantilla)"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>
                          )}

                          <button 
                            onClick={() => deleteOpp(opp.id)} 
                            className="text-gray-400 hover:text-red-500 p-1.5 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                            title="Eliminar oportunidad"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Vista Escritorio: Tabla clásica robusta */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-[#252525] border-b border-[#333]">
                    <th className="p-4 text-gray-400 font-semibold text-sm cursor-pointer hover:text-white" onClick={() => handleSort('status')}>Estado {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                    <th className="p-4 text-gray-400 font-semibold text-sm cursor-pointer hover:text-white" onClick={() => handleSort('createdAt')}>Fecha {sortConfig.key === 'createdAt' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                    <th className="p-4 text-gray-400 font-semibold text-sm cursor-pointer hover:text-white" onClick={() => handleSort('client')}>Cliente {sortConfig.key === 'client' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                    <th className="p-4 text-gray-400 font-semibold text-sm cursor-pointer hover:text-white" onClick={() => handleSort('cropType')}>Grano {sortConfig.key === 'cropType' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                    <th className="p-4 text-gray-400 font-semibold text-sm cursor-pointer hover:text-white" onClick={() => handleSort('quantity_tn')}>Volumen (tn) {sortConfig.key === 'quantity_tn' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                    <th className="p-4 text-gray-400 font-semibold text-sm cursor-pointer hover:text-white" onClick={() => handleSort('price_usd')}>Precio (USD) {sortConfig.key === 'price_usd' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                    <th className="p-4 text-gray-400 font-semibold text-sm cursor-pointer hover:text-white" onClick={() => handleSort('location')}>Destino {sortConfig.key === 'location' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                    <th className="p-4 text-gray-400 font-semibold text-sm text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#333]">
                  {oppLoading ? (
                     <tr>
                       <td colSpan={8} className="p-12 text-center">
                         <Loader2 className="w-8 h-8 animate-spin text-green-500 mx-auto mb-4" />
                         <p className="text-gray-500 font-medium">Cargando...</p>
                       </td>
                     </tr>
                  ) : filteredOpps.length === 0 ? (
                     <tr>
                       <td colSpan={8} className="p-12 text-center">
                         <div className="bg-[#252525] w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                           <Info className="w-10 h-10 text-gray-500" />
                         </div>
                         <p className="text-lg font-bold mb-1">No hay {activeTab}</p>
                         <p className="text-gray-500 text-sm">Prueba ajustando los filtros o creando un registro nuevo.</p>
                       </td>
                     </tr>
                  ) : filteredOpps.map(opp => (
                    <tr key={opp.id} className="hover:bg-white/5 transition-colors group">
                      <td className="p-4">
                         <button onClick={() => toggleStatus(opp)} className={`flex items-center gap-2 text-sm font-medium px-3 py-1 rounded-full w-fit transition-all ${opp.status === 'abierta' ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20' : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'}`}>
                            {opp.status === 'abierta' ? <Circle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                            {opp.status}
                         </button>
                      </td>
                      <td className="p-4 text-gray-300">{opp.createdAt ? format(new Date(opp.createdAt), 'dd/MM/yyyy') : '-'}</td>
                      <td className="p-4 font-medium">{clients.find(c => c.id === opp.clientId)?.name || 'Desconocido'}</td>
                      <td className="p-4 capitalize">
                        <span className="bg-[#333] px-2 py-1 rounded-md text-sm">{opp.cropType}</span>
                      </td>
                      <td className="p-4 text-gray-300 font-mono">{formatNumber(opp.quantity_tn)}</td>
                      <td className={`p-4 font-bold font-mono ${activeTab === 'ofertas' ? 'text-green-400' : 'text-blue-400'}`}>${formatNumber(opp.price_usd)}</td>
                      <td className="p-4 text-gray-300">{opp.location || '-'}</td>
                      <td className="p-4 text-right">
                        <button onClick={() => deleteOpp(opp.id)} className="text-gray-500 hover:text-red-500 p-2 rounded-lg hover:bg-red-500/10 transition-colors md:opacity-0 group-hover:opacity-100 focus:opacity-100">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      </>
      )}

      {/* Premium Dark Theme React-based Confirmation Modal */}
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

      {/* WhatsApp Template Modal */}
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

      // 1. Guardar el registro de webhook, ya marcado como "procesada"
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

      // 2. CREACIÓN AUTOMÁTICA DE LA OPORTUNIDAD EN PIPELINE
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
      
      // Dispatch custom event to tell React to refetch alerts list
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

  const runMockAudio = async (mockType: 'soja' | 'maiz') => {
    const audioKey = mockType === 'soja' ? 'MOCK_AUDIO_1' : 'MOCK_AUDIO_2';
    addToast(`Cargando audio de prueba (${mockType === 'soja' ? 'Venta Soja' : 'Compra Maíz'})...`, 'info');
    await processAudioBase64(audioKey, 'audio/webm');
  };

  const simulateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !simMessage.trim()) return;

    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await fetch(`${origin}/api/parse-opportunity-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: simMessage })
      });
      if (!res.ok) throw new Error('Error al parsear');
      
      const parsed = await res.json();
      
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

      // 1. Guardar el registro de webhook, ya marcado como "procesada"
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

      // 2. CREACIÓN AUTOMÁTICA DE LA OPORTUNIDAD EN PIPELINE
      const matchedClient = clients.find(c => 
        c.phone && 
        (c.phone.replace(/\D/g, '').includes(senderPhone.replace(/\D/g, '')) ||
         senderPhone.replace(/\D/g, '').includes(c.phone.replace(/\D/g, '')))
      );

      await api.opportunities.create({
        type: type,
        clientId: matchedClient?.id || clients[0]?.id || '', // Auto-asigna el primer cliente por defecto si no match (solo como simulacion)
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
          title="Doble clic para opciones avanzadas"
        >
          ● MÓDULO ACTIVO
        </span>
      </div>

      {showConfig && (
        <div className="bg-[#241b2f] border border-purple-900/40 p-5 rounded-xl space-y-4 shadow-lg">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-purple-200 text-sm flex items-center gap-1.5">
              <span>⚡</span> Simulador de Mensaje Recibido
            </h4>
            <span className="text-xs text-purple-400 hidden sm:inline">Simula texto o notas de voz recibidos por WhatsApp</span>
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
              Simular Texto
            </button>
          </form>

          {/* Audio Simulator Section */}
          <div className="pt-3 border-t border-purple-900/30 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h5 className="text-xs font-bold text-purple-300 uppercase tracking-widest flex items-center gap-1.5">
                🎙️ Simulador de Nota de Voz
              </h5>
              <p className="text-[11px] text-purple-400">
                Graba desde tu micrófono o selecciona un audio de prueba para transcribir y parsear con Gemini.
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

              <div className="relative inline-block text-left">
                <select
                  disabled={isParsingAudio || isRecording}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      runMockAudio(val as any);
                      e.target.value = ''; // reset select
                    }
                  }}
                  className="bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-300 rounded-lg px-3 py-2.5 focus:outline-none cursor-pointer hover:bg-zinc-750 transition disabled:opacity-50"
                >
                  <option value="">📁 Audios de Prueba...</option>
                  <option value="soja">Audio 1: Venta Soja (150 TN @ $295)</option>
                  <option value="maiz">Audio 2: Compra Maíz (300 TN @ $160)</option>
                </select>
              </div>

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

            // Find matching opportunities in the CRM of the opposite type
            const possibleMatches = opportunities.filter(opp => {
              if (opp.status !== 'abierta') return false;
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
                    
                    {/* Client / Prospect Badge */}
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

                    {/* Possible Matches Badge */}
                    {possibleMatches.length > 0 && alert.status === 'nueva' && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/25 text-amber-400 border border-amber-500/35 flex items-center gap-1 animate-pulse shadow-sm shadow-amber-500/10">
                        ⚡ Cruce Compatible Detectado
                      </span>
                    )}
                  </div>

                {/* WhatsApp Chat Bubble Emulator Box */}
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
                    <span className="text-xs font-black text-zinc-100 flex items-center gap-1 font-mono">
                      ⚖️ {alert.suggestedQuantity} TN
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

                {/* Possible Crossovers Detail Cards */}
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

              {/* Botones de acción móviles responsive */}
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
  const columns = [
    { id: 'abierta', name: 'Abiertas 📂', borderClass: 'border-zinc-700 bg-zinc-800/10' },
    { id: 'negociacion', name: 'En Negociación 🤝', borderClass: 'border-amber-500/30 bg-amber-500/5' },
    { id: 'ganada', name: 'Ganadas 🏆', borderClass: 'border-green-500/30 bg-green-500/5' },
    { id: 'perdida', name: 'Perdidas ❌', borderClass: 'border-red-500/30 bg-red-500/5' }
  ];

  const getColumnItems = (statusId: string) => {
    return filteredOpps.filter(o => {
      if (statusId === 'abierta') {
        return o.status === 'abierta' || (!o.status);
      }
      if (statusId === 'negociacion') {
        return o.status === 'negociacion';
      }
      if (statusId === 'ganada') {
        return o.status === 'ganada';
      }
      if (statusId === 'perdida') {
        return o.status === 'perdida' || o.status === 'cerrada';
      }
      return false;
    });
  };

  return (
    <div className="flex gap-4 p-4 overflow-x-auto min-h-[500px] scrollbar-none items-stretch select-none">
      {columns.map(col => {
        const items = getColumnItems(col.id);
        const isOver = draggedOverColumn === col.id;

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
            className={`w-72 sm:w-80 shrink-0 border rounded-2xl p-4 flex flex-col transition-all duration-200 ${col.borderClass} ${isOver ? 'ring-2 ring-green-500 scale-[1.01] border-green-500/50 bg-green-500/5' : ''}`}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-800">
              <h4 className="font-bold text-sm text-zinc-150 uppercase tracking-wider">{col.name}</h4>
              <span className="bg-zinc-850 border border-zinc-800 text-zinc-400 text-xs px-2 py-0.5 rounded-full font-mono font-bold">
                {items.length}
              </span>
            </div>

            {/* List */}
            <div className="flex-1 flex flex-col gap-3 overflow-y-auto max-h-[600px] pr-1.5 scrollbar-thin">
              {items.length === 0 ? (
                <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 rounded-xl text-zinc-550 text-xs gap-1.5">
                  <span>📥</span>
                  <span>Arrastrar aquí</span>
                </div>
              ) : (
                items.map(opp => {
                  const client = clients.find(c => c.id === opp.clientId);
                  const clientName = client?.name || 'Desconocido';
                  const clientPhone = client?.phone;

                  return (
                    <div
                      key={opp.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', opp.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      className="bg-[#222] hover:bg-[#282828] border border-[#333] hover:border-[#444] rounded-xl p-4 transition-all duration-200 cursor-grab active:cursor-grabbing space-y-3 shadow-md relative group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {opp.createdAt ? format(new Date(opp.createdAt), 'dd/MM/yyyy') : '-'}
                        </span>
                        <span className={`text-[9px] uppercase font-black px-1.5 py-0.5 rounded ${opp.type === 'oferta' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                          {opp.type === 'oferta' ? 'Venta' : 'Compra'}
                        </span>
                      </div>
                      <div>
                        <h5 className="font-bold text-xs text-white truncate max-w-[90%]">{clientName}</h5>
                        <div className="flex items-center gap-1 text-[10px] text-zinc-400 mt-1">
                          <span>📍</span>
                          <span className="truncate">{opp.location || 'A convenir'}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2.5 border-t border-zinc-800/80">
                        <div className="flex items-center gap-1">
                          <span className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px] px-1.5 py-0.5 rounded font-bold capitalize">
                            🌱 {opp.cropType}
                          </span>
                          <span className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px] px-1.5 py-0.5 rounded font-mono font-medium">
                            {formatNumber(opp.quantity_tn)} TN
                          </span>
                        </div>
                        <span className={`font-mono font-black text-xs ${opp.type === 'oferta' ? 'text-green-400' : 'text-blue-400'}`}>
                          ${formatNumber(opp.price_usd)}
                        </span>
                      </div>

                      {/* Hover action menu overlay */}
                      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-[#282828] pl-1.5 py-0.5 rounded-l-md border-l border-zinc-800">
                        {clientPhone && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenWaModal(clientPhone, opp.clientId, clientName, {
                                cropType: opp.cropType,
                                quantity_tn: opp.quantity_tn,
                                price_usd: opp.price_usd,
                                location: opp.location
                              });
                            }}
                            className="p-1 text-green-400 hover:bg-green-500/10 rounded transition-colors cursor-pointer"
                            title="Contactar WhatsApp (Plantilla)"
                          >
                            <Phone className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteOpp(opp.id); }}
                          className="p-1 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
                          title="Eliminar Oportunidad"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
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
  );
}
