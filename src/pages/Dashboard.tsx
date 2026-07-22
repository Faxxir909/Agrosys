import React, { useEffect, useState } from 'react';
import { Users, ArrowUpRight, ArrowDownRight, Activity, DollarSign, RefreshCw, CheckCircle, TrendingUp, Award, Briefcase, Calendar, Clock, CheckCircle2, Circle, Info, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useClients } from '../hooks/useClients';
import { useOpportunities } from '../hooks/useOpportunities';
import { useDeals } from '../hooks/useDeals';
import { format } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts';
import { InteractiveMap } from '../components/InteractiveMap';
import { socket } from '../lib/socket';
import { useUI } from '../contexts/UIContext';

export function Dashboard() {
  const { clients } = useClients();
  const { opportunities } = useOpportunities();
  const { deals } = useDeals();
  const [tasks, setTasks] = useState<any[]>([]);
  
  const { addToast } = useUI();
  const [matches, setMatches] = useState<any[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [notifyingMatchId, setNotifyingMatchId] = useState<string | null>(null);
  
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

  const [sendingWa, setSendingWa] = useState(false);
  const [cotizadorModal, setCotizadorModal] = useState<{
    isOpen: boolean;
    match: any;
    seller: any;
    buyer: any;
    estimatedFreight: string;
    paymentTerms: string;
    grainQuality: string;
  }>({
    isOpen: false,
    match: null,
    seller: null,
    buyer: null,
    estimatedFreight: '0',
    paymentTerms: '72 hs',
    grainQuality: 'Cámara',
  });

  const fetchMatches = async () => {
    setLoadingMatches(true);
    try {
      const data = await api.opportunities.matches();
      setMatches(data);
    } catch (err) {
      console.error('Error fetching matches on Dashboard:', err);
    } finally {
      setLoadingMatches(false);
    }
  };

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

  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleCloseMatch = (match: any) => {
    const seller = clients.find(c => c.id === match.offer.clientId);
    const buyer = clients.find(c => c.id === match.demand.clientId);
    
    if (!seller || !buyer) {
      addToast('Error: No se pudieron encontrar los clientes del cruce', 'error');
      return;
    }

    setCotizadorModal({
      isOpen: true,
      match,
      seller,
      buyer,
      estimatedFreight: '0',
      paymentTerms: '72 hs',
      grainQuality: 'Cámara',
    });
  };

  const handleSendWaQuote = async () => {
    const { seller, match, estimatedFreight, paymentTerms, grainQuality } = cotizadorModal;
    if (!seller || !match) return;

    if (!seller.phone) {
      addToast('El productor no tiene un teléfono configurado', 'error');
      return;
    }

    setSendingWa(true);
    try {
      const netPrice = match.offer.price_usd - Number(estimatedFreight);
      const msg = `Hola ${seller.name}, te cotizo un cruce para la venta de ${formatNumber(match.overlapQuantity)} TN de ${match.cropType.toUpperCase()} a USD ${netPrice}/tn Netos (Flete estimado: USD ${estimatedFreight}/tn, Plazo: ${paymentTerms}, Calidad: ${grainQuality}). Confirma si te sirve. Mesa de AgroSys.`;
      
      await api.whatsapp.sendMessage({
        phone: seller.phone,
        message: msg,
        clientId: seller.id
      });
      addToast(`Cotización enviada con éxito al WhatsApp de ${seller.name} 📲`, 'success');
    } catch (err: any) {
      addToast(`Error al enviar cotización: ${err.message}`, 'error');
    } finally {
      setSendingWa(false);
    }
  };

  const handleConcretarBoleto = async () => {
    const { match, seller, buyer, estimatedFreight, paymentTerms, grainQuality } = cotizadorModal;
    if (!match || !seller || !buyer) return;

    setUpdatingId(match.id);
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
        payment_terms: paymentTerms,
        grain_quality: grainQuality,
        estimated_freight: Number(estimatedFreight)
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

      addToast(`🏆 Boleto liquidado por ${formatNumber(match.overlapQuantity)} TN con éxito! Pasó a la Mesa Operativa.`, 'success');
      setCotizadorModal(prev => ({ ...prev, isOpen: false }));
    } catch (error) {
      addToast('Error al procesar la liquidación', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  useEffect(() => {
    fetchMatches();
    socket.on('opportunities', fetchMatches);
    socket.on('deals', fetchMatches);
    return () => {
      socket.off('opportunities', fetchMatches);
      socket.off('deals', fetchMatches);
    };
  }, []);
  
  // Real-time prices states
  const [prices, setPrices] = useState({
    soja: 315.0, maiz: 165.0, trigo: 210.0, sorgo: 155.0, girasol: 290.0
  });
  const [pricesMetadata, setPricesMetadata] = useState({
    source: 'Obteniendo cotizaciones oficiales de Rosario...',
    date: ''
  });
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'chart'>('grid');

  const fetchPriceHistory = async () => {
    try {
      const history = await api.pizarraHistory();
      const formatted = history.map((item: any) => ({
        ...item,
        formattedDate: item.createdAt ? format(new Date(item.createdAt), 'dd/MM') : ''
      }));
      setPriceHistory(formatted);
    } catch (err) {
      console.error('Error fetching price history:', err);
    }
  };

  const fetchRealPrices = async () => {
    setLoadingPrices(true);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const response = await fetch(`${origin}/api/real-pizarra-prices`);
      if (!response.ok) throw new Error('Fallo al recuperar los precios');
      
      const text = await response.text();
      if (!text || !text.trim().startsWith('{')) {
        throw new Error('La respuesta de precios no es un JSON válido');
      }
      
      const data = JSON.parse(text);
      if (data && typeof data === 'object') {
        setPrices({
          soja: Number(data.soja) || 315.0,
          maiz: Number(data.maiz) || 165.0,
          trigo: Number(data.trigo) || 210.0,
          sorgo: Number(data.sorgo) || 155.0,
          girasol: Number(data.girasol) || 290.0
        });
        setPricesMetadata({
          source: data.source || 'Cámara Arbitral de Rosario',
          date: data.date || format(new Date(), 'yyyy-MM-dd')
        });
        fetchPriceHistory();
      }
    } catch (err) {
      console.warn('Real prices fetch offline or skipped, using reference values:', err);
      setPricesMetadata({
        source: 'Cámara Arbitral de Rosario (Precios de referencia)',
        date: format(new Date(), 'yyyy-MM-dd')
      });
    } finally {
      setLoadingPrices(false);
    }
  };

  useEffect(() => {
    fetchRealPrices();
    fetchPriceHistory();
  }, []);

  const averageTargets = React.useMemo(() => {
    const grains = ['soja', 'maiz', 'trigo', 'sorgo', 'girasol'];
    const sums: Record<string, number> = { soja: 0, maiz: 0, trigo: 0, sorgo: 0, girasol: 0 };
    const counts: Record<string, number> = { soja: 0, maiz: 0, trigo: 0, sorgo: 0, girasol: 0 };

    clients.forEach(c => {
      grains.forEach(g => {
        const key = `precio_objetivo_${g}`;
        const val = c[key] || (c.metadata && c.metadata[key]);
        if (val) {
          const num = Number(val);
          if (num > 0) {
            sums[g] += num;
            counts[g]++;
          }
        }
      });
    });

    const avgs: Record<string, number | null> = {};
    grains.forEach(g => {
      avgs[g] = counts[g] > 0 ? Math.round(sums[g] / counts[g]) : null;
    });
    return avgs;
  }, [clients]);

  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const fetchAuditLogs = async () => {
    try {
      const logs = await api.auth.getAuditLogs();
      setAuditLogs(logs);
    } catch (e) {
      console.error('Error fetching audit logs:', e);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
    socket.on('audit-logs', fetchAuditLogs);
    return () => {
      socket.off('audit-logs', fetchAuditLogs);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const fetchTasks = async () => {
      try {
        const fetched = await api.tasks.list();
        if (active) {
          fetched.sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
          setTasks(fetched);
        }
      } catch (err) {
        console.error('Error fetching dashboard tasks:', err);
      }
    };
    fetchTasks();
    socket.on('tasks', fetchTasks);
    return () => {
      active = false;
      socket.off('tasks', fetchTasks);
    };
  }, []);

  const totalClients = clients.length;
  const ofertasAbiertas = opportunities.filter(o => o.type === 'oferta' && o.status === 'abierta');
  const demandasAbiertas = opportunities.filter(o => o.type === 'demanda' && o.status === 'abierta');
  
  const volOfertas = ofertasAbiertas.reduce((acc, curr) => acc + curr.quantity_tn, 0);
  const volDemandas = demandasAbiertas.reduce((acc, curr) => acc + curr.quantity_tn, 0);

  // Calculate stats from successfully brokered deals
  const totalClosedDeals = deals.length;
  const volCerrado = deals.reduce((acc, curr) => acc + curr.quantity_tn, 0);
  const honorariosTotales = deals.reduce((acc, curr) => acc + curr.totalCommission, 0);

  const chartData = [
    { name: 'Ofertas Abiertas (tn)', value: volOfertas },
    { name: 'Demandas Abiertas (tn)', value: volDemandas }
  ];
  const chartColors = ['#10b981', '#3b82f6'];

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('es-AR').format(num);
  };

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(num);
  };

  return (
    <div className="space-y-6">
      {/* Header con indicadores de estado de Mercado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-zinc-900 to-[#1e1e1e] border border-[#333] p-5 rounded-2xl shadow-lg">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <span>🌾</span> AgroSys Terminal <span className="text-xs bg-green-500/10 border border-green-500/25 px-2 py-0.5 rounded text-green-400 font-mono">EN VIVO</span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">Sala de intermediación, operaciones confirmadas y cotizaciones arbitrales</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400 font-mono bg-zinc-800/50 border border-zinc-700/55 px-3.5 py-2 rounded-xl">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-ping inline-block mr-1"></span>
          <span>Broker: Mesa de Granos Activa</span>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {[
          { 
            label: 'Volumen Ofertado (tn)', 
            val: formatNumber(volOfertas), 
            sub: `${ofertasAbiertas.length} pedidos activos`,
            icon: ArrowUpRight, 
            color: 'text-green-400', 
            bg: 'bg-green-500/10',
            border: 'border-green-500/10'
          },
          { 
            label: 'Volumen Demandado (tn)', 
            val: formatNumber(volDemandas), 
            sub: `${demandasAbiertas.length} solicitudes activas`,
            icon: ArrowDownRight, 
            color: 'text-blue-400', 
            bg: 'bg-blue-500/10',
            border: 'border-blue-500/10'
          },
          { 
            label: 'Negocios Cerrados', 
            val: `${totalClosedDeals} deals`, 
            sub: `${formatNumber(volCerrado)} TN intermediadas 🤝`,
            icon: Award, 
            color: 'text-purple-400', 
            bg: 'bg-purple-500/10',
            border: 'border-purple-500/10'
          },
          { 
            label: 'Honorarios Estimados', 
            val: formatCurrency(honorariosTotales), 
            sub: 'Comisiones acumuladas',
            icon: DollarSign, 
            color: 'text-amber-400', 
            bg: 'bg-amber-500/10',
            border: 'border-amber-500/10'
          }
        ].map((kpi, i) => (
          <div key={i} className={`bg-[#1e1e1e] border ${kpi.border} p-5 rounded-2xl shadow-md transition-all hover:scale-[1.01]`}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">{kpi.label}</p>
                <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">{kpi.val}</div>
                <p className="text-xs text-gray-400 mt-1 font-mono">{kpi.sub}</p>
              </div>
              <div className={`p-3 rounded-xl ${kpi.bg}`}>
                <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Mapa Interactivo Leaflet */}
      <InteractiveMap />

      {/* Secciones de Gráficos, Pizarra de Precios, Agenda de Campo y Auditoría */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Col 1: Precios de Pizarra */}
        <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                  Pizarra de Rosario En Vivo
                </h2>
                <p className="text-xs text-gray-400 mt-1 font-sans">Cotizaciones oficiales procesadas por IA</p>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setViewMode(prev => prev === 'grid' ? 'chart' : 'grid')}
                  className="p-2.5 bg-[#2d2d2d] hover:bg-[#3d3d3d] rounded-xl text-gray-300 hover:text-white transition-all duration-200 border border-[#3c3c3c] cursor-pointer flex items-center justify-center"
                  title={viewMode === 'grid' ? 'Ver Gráfico de Tendencias' : 'Ver Precios de Hoy'}
                >
                  <TrendingUp className={`w-4 h-4 ${viewMode === 'chart' ? 'text-green-400' : 'text-gray-400'}`} />
                </button>
                <button
                  type="button"
                  onClick={fetchRealPrices}
                  disabled={loadingPrices}
                  className="p-2.5 bg-[#2d2d2d] hover:bg-[#3d3d3d] rounded-xl text-gray-300 hover:text-white transition-all duration-200 border border-[#3c3c3c] disabled:opacity-50 cursor-pointer"
                  title="Actualizar Cotizaciones Reales"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingPrices ? 'animate-spin text-purple-400' : ''}`} />
                </button>
              </div>
            </div>

            {viewMode === 'grid' ? (
              <div className="space-y-2.5">
                {Object.entries(prices).map(([grano, price]) => (
                  <div key={grano} className="flex justify-between items-center p-3 bg-[#252525] rounded-xl border border-[#353535] transition-all hover:bg-[#2c2c2c] group">
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">🌾</span>
                      <span className="font-bold text-gray-200 capitalize text-xs sm:text-sm">{grano}</span>
                    </div>
                    <div className="text-sm sm:text-base font-black text-green-400 font-mono group-hover:scale-105 transition-transform">
                      USD {Number(price).toFixed(1)} <span className="text-[9px] text-gray-500 font-normal">/tn</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[210px] w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={priceHistory} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                    <XAxis dataKey="formattedDate" stroke="#888888" fontSize={9} tickLine={false} />
                    <YAxis stroke="#888888" fontSize={9} tickLine={false} domain={['auto', 'auto']} />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: '#1e1e1e', borderColor: '#333', borderRadius: '12px', fontSize: '10px' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Legend verticalAlign="top" height={24} iconSize={6} iconType="circle" wrapperStyle={{ fontSize: '9px' }} />
                    <Line type="monotone" dataKey="soja" name="Soja" stroke="#10b981" strokeWidth={2} dot={{ r: 1 }} activeDot={{ r: 3 }} />
                    <Line type="monotone" dataKey="maiz" name="Maíz" stroke="#3b82f6" strokeWidth={1.5} dot={{ r: 1 }} />
                    <Line type="monotone" dataKey="trigo" name="Trigo" stroke="#f59e0b" strokeWidth={1.5} dot={{ r: 1 }} />
                    
                    {averageTargets.soja && (
                      <ReferenceLine y={averageTargets.soja} stroke="#10b981" strokeDasharray="4 4" strokeWidth={1}
                        label={{ value: `Obj Soja ($${averageTargets.soja})`, fill: '#10b981', fontSize: 7, position: 'insideTopLeft' }} />
                    )}
                    {averageTargets.maiz && (
                      <ReferenceLine y={averageTargets.maiz} stroke="#3b82f6" strokeDasharray="4 4" strokeWidth={1}
                        label={{ value: `Obj Maíz ($${averageTargets.maiz})`, fill: '#3b82f6', fontSize: 7, position: 'insideTopLeft' }} />
                    )}
                    {averageTargets.trigo && (
                      <ReferenceLine y={averageTargets.trigo} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1}
                        label={{ value: `Obj Trigo ($${averageTargets.trigo})`, fill: '#f59e0b', fontSize: 7, position: 'insideTopLeft' }} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="mt-5 pt-4 border-t border-[#333] flex flex-col justify-between text-[10px] text-gray-400 gap-1 sm:gap-2">
            <div>
              <span className="text-gray-500">Origen:</span> <span className="font-semibold text-gray-300">{pricesMetadata.source}</span>
            </div>
            {pricesMetadata.date && (
              <div>
                <span className="text-gray-500">Actualizado:</span> <span className="font-mono text-gray-300">{pricesMetadata.date}</span>
              </div>
            )}
          </div>
        </div>

        {/* Col 2: Balance de volumen */}
        <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-black text-white mb-1.5">Balance de Mesa Activa</h2>
            <p className="text-xs text-gray-400">Distribución física de volumen de granos en juego (TN)</p>
          </div>
          <div className="h-[210px] w-full flex items-center justify-center py-2">
            {volOfertas === 0 && volDemandas === 0 ? (
               <div className="text-xs text-gray-500 font-medium text-center">
                 <p className="mb-2">📊 No hay ofertas ni demandas activas</p>
                 <span className="text-[10px]">Crea o simula alertas para ver el gráfico</span>
               </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={6}
                    dataKey="value"
                    stroke="none"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#1e1e1e', borderColor: '#333', borderRadius: '12px', fontSize: '11px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconSize={10} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="bg-[#212121] border border-[#2d2d2d] rounded-xl p-3 text-[10px] sm:text-[11px] text-zinc-400">
             {volOfertas > volDemandas ? (
               <p>🟢 El mercado tiende a la <strong>Sobre-Oferta</strong>. Buen momento para presionar a compradores activos.</p>
             ) : volDemandas > volOfertas ? (
               <p>🔵 Elevada <strong>Demanda Insatisfecha</strong>. Los productores tienen mayor poder de negociación.</p>
             ) : (
               <p>⚖️ Mercado equilibrado. Las ofertas y demandas coinciden en tonelaje.</p>
             )}
          </div>
        </div>

        {/* Col 3: Agenda General Express */}
        <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <Calendar className="w-4.5 h-4.5 text-green-500" />
                Agenda y Hojas de Campo
              </h2>
              <span className="text-[9px] font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">
                {tasks.filter(t => t.status === 'pendiente').length} Pendientes
              </span>
            </div>
            <p className="text-xs text-gray-400 mb-4">Compromisos de logística, visitas y cobranzas programadas</p>

            <div className="space-y-2.5 max-h-[210px] overflow-y-auto pr-1">
              {tasks.filter(t => t.status === 'pendiente').length > 0 ? (
                tasks.filter(t => t.status === 'pendiente').slice(0, 3).map((t) => {
                  let badge = 'border-zinc-700 bg-zinc-800 text-zinc-300';
                  if (t.category === 'siembra') badge = 'border-emerald-800 bg-emerald-950/40 text-emerald-400';
                  if (t.category === 'cosecha') badge = 'border-yellow-800 bg-yellow-950/40 text-yellow-400';
                  if (t.category === 'cobro') badge = 'border-amber-800 bg-amber-950/40 text-amber-500';
                  if (t.category === 'documentacion') badge = 'border-blue-800 bg-blue-950/40 text-blue-400';
                  if (t.category === 'seguimiento') badge = 'border-indigo-800 bg-indigo-950/40 text-indigo-400';

                  const isOverdue = new Date(t.dueDate).getTime() < new Date().setHours(0,0,0,0);

                  return (
                    <div key={t.id} className="p-3 bg-[#222] border border-[#2d2d2d] rounded-xl flex items-start gap-2.5 transition-all hover:border-[#3d3d3d]">
                      <div className="mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-gray-200 truncate">{t.taskTitle}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <span className={`text-[8px] uppercase font-bold px-1 py-0.2 rounded border ${badge}`}>
                            {t.category}
                          </span>
                          <span className={`text-[9px] font-mono flex items-center gap-1 ${isOverdue ? 'text-red-400 font-bold' : 'text-gray-400'}`}>
                            <Clock className="w-2.5 h-2.5" /> {new Date(t.dueDate + 'T12:00:00').toLocaleDateString('es-ES', {month: 'numeric', day: 'numeric'})}
                          </span>
                        </div>
                        {t.clientName && (
                          <p className="text-[10px] text-gray-400 mt-1 truncate">
                            Productor: <strong className="text-green-500 font-medium">{t.clientName}</strong>
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-6 text-center text-xs text-gray-500 flex flex-col items-center justify-center border border-dashed border-[#2d2d2d] rounded-2xl">
                  <Calendar className="w-6 h-6 text-gray-600 mb-2" />
                  <p>Sin visitas ni alertas de cobranza pendientes.</p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-[#333]">
            <Link
              to="/clientes"
              className="w-full py-2 bg-green-600 hover:bg-green-700 text-black font-black text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all"
            >
              <Calendar className="w-3.5 h-3.5 text-black" />
              <span>Ver Agenda del CRM Completa</span>
            </Link>
          </div>
        </div>

        {/* Col 4: Auditoría de Operaciones */}
        <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <Activity className="w-4.5 h-4.5 text-purple-500 animate-pulse" />
                Auditoría CRM
              </h2>
              <span className="text-[9px] font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                Historial
              </span>
            </div>
            <p className="text-xs text-gray-400 mb-4">Registro de operaciones y mutations en vivo</p>

            <div className="space-y-2.5 max-h-[210px] overflow-y-auto pr-1 scrollbar-thin">
              {auditLogs.length > 0 ? (
                auditLogs.slice(0, 5).map((log) => {
                  return (
                    <div key={log.id} className="p-3 bg-[#222] border border-[#2d2d2d] rounded-xl flex flex-col gap-1 transition-all hover:border-[#3d3d3d]">
                      <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono">
                        <span className="font-bold text-green-400 uppercase tracking-wide">
                          {log.action}
                        </span>
                        <span className="text-zinc-550">
                          {log.createdAt ? format(new Date(log.createdAt), 'HH:mm') : ''}
                        </span>
                      </div>
                      <p className="text-xs text-gray-300 font-medium truncate">{log.details || '-'}</p>
                    </div>
                  );
                })
              ) : (
                <div className="p-6 text-center text-xs text-gray-500 flex flex-col items-center justify-center border border-dashed border-[#2d2d2d] rounded-2xl">
                  <Activity className="w-6 h-6 text-gray-600 mb-2" />
                  <p>Sin operaciones registradas en esta sesión.</p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-[#333] text-[9.5px] text-zinc-500 font-mono text-center">
            SISTEMA AUDITABLE ACTIVO
          </div>
        </div>
      </div>

      {/* Cruces Compatibles (Match Engine) Panel */}
      <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl overflow-hidden shadow-lg">
        <div className="p-5 bg-gradient-to-r from-[#212121] to-[#252525] border-b border-[#333] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
              <span>🤝</span> Cruces Inteligentes Compatibles (Match Engine)
            </h3>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">Coincidencias algorítmicas de oferta y demanda listas para liquidar</p>
          </div>
          <div className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5 self-start">
            {matches.length} cruces activos
          </div>
        </div>

        <div className="p-5">
          {matches.length === 0 ? (
            <div className="p-8 text-center max-w-xl mx-auto border border-dashed border-[#2d2d2d] rounded-2xl">
              <div className="bg-[#252525] w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                <Info className="w-5 h-5 text-gray-400" />
              </div>
              <h4 className="text-xs font-bold text-white mb-1">Sin cruces automatizados detectados</h4>
              <p className="text-zinc-555 text-[11px] leading-relaxed">
                Cuando una oferta y demanda coincidan en grano y sus precios estén dentro del margen de tolerancia configurado, aparecerán listadas aquí para liquidar.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {matches.slice(0, 4).map((match) => {
                const seller = clients.find(c => c.id === match.offer.clientId);
                const buyer = clients.find(c => c.id === match.demand.clientId);
                const sellerName = seller?.name || 'Vendedor';
                const buyerName = buyer?.name || 'Comprador';
                const profitable = match.priceSpread >= 0;

                return (
                  <div key={match.id} className={`bg-[#222] border rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-stretch gap-4 transition-all hover:border-zinc-700 ${profitable ? 'border-green-500/15' : 'border-[#333]'}`}>
                    
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🌾</span>
                        <span className="text-xs font-black text-white capitalize">{match.cropType}</span>
                        <span className="bg-[#2c2c2c] text-[9px] text-zinc-350 px-2 py-0.5 rounded font-mono font-semibold">
                          {formatNumber(match.overlapQuantity)} TN
                        </span>
                      </div>
                      
                      <div className="flex flex-col gap-1 text-[11px] text-zinc-400">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                          <span className="font-bold text-green-400 truncate">{sellerName}</span>
                          <span className="text-zinc-650">(${formatNumber(match.offer.price_usd)})</span>
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                          <span className="font-bold text-blue-400 truncate">{buyerName}</span>
                          <span className="text-zinc-650">(${formatNumber(match.demand.price_usd)})</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-row sm:flex-col justify-between items-center sm:items-end gap-2 border-t sm:border-t-0 sm:border-l border-zinc-800 pt-3 sm:pt-0 sm:pl-4 min-w-[150px]">
                      <div className="text-left sm:text-right font-mono">
                        <div className="text-[10px] text-zinc-500">Spread / Comisión</div>
                        <div className={`text-xs font-black ${profitable ? 'text-green-400' : 'text-zinc-400'}`}>
                          ${formatNumber(match.priceSpread)} USD
                        </div>
                        <div className="text-[11px] font-bold text-amber-400">
                          ${formatNumber(Math.round(match.totalCommission))}
                        </div>
                      </div>

                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleNotifyMatch(match)}
                          disabled={notifyingMatchId === match.id}
                          className="bg-green-600/10 hover:bg-green-600/20 text-green-400 p-2 rounded-lg border border-green-500/20 active:scale-95 duration-100 transition-colors disabled:opacity-50 flex items-center justify-center cursor-pointer"
                          title="Notificar Cruce por WhatsApp"
                        >
                          {notifyingMatchId === match.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>📢</span>}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCloseMatch(match)}
                          className="bg-amber-550 hover:bg-amber-600 text-black font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg active:scale-95 duration-100 transition-all cursor-pointer uppercase tracking-wider"
                          title="Concretar Boleto"
                        >
                          Concretar 🤝
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
          {matches.length > 4 && (
            <div className="mt-4 text-center">
              <Link to="/oportunidades" className="text-xs text-purple-400 hover:text-purple-300 font-bold tracking-wider hover:underline transition">
                Ver los {matches.length} cruces completos en Oportunidades &rarr;
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Deal Pipeline Terminal - HISTORICO DE NEGOCIOS CERRADOS */}
      <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl overflow-hidden shadow-lg">
        <div className="p-5 bg-gradient-to-r from-[#212121] to-[#252525] border-b border-[#333] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
              <span>🤝</span> Registro de Negocios Cerrados (Boletos Generados)
            </h3>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">Contratos cerrados en la mesa de AgroSys</p>
          </div>
          <div className="text-xs font-bold text-gray-400 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 self-start">
            Total: {totalClosedDeals} boletos emitidos
          </div>
        </div>

        <div className="overflow-x-auto">
          {deals.length === 0 ? (
            <div className="p-10 text-center max-w-xl mx-auto">
              <div className="bg-zinc-800/60 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3.5 border border-zinc-700">
                <CheckCircle className="w-6 h-6 text-gray-500" />
              </div>
              <h4 className="text-sm font-bold text-white mb-1.5">Sin contratos liquidados aún</h4>
              <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                Cuando una Oferta y Demanda coinciden, puedes emparejarlas desde el módulo de <strong>Cruces Inteligentes</strong> en la pestaña Oportunidades para liquidar la operación al instante.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-[#1a1a1a] border-b border-[#2d2d2d] text-zinc-400 text-[11px] uppercase tracking-wider font-semibold">
                  <th className="p-4">Boleto ID</th>
                  <th className="p-4">Fecha</th>
                  <th className="p-4">Grano</th>
                  <th className="p-4">Volumen</th>
                  <th className="p-4">Intervinientes (Vendedor → Comprador)</th>
                  <th className="p-4">Precios Operación</th>
                  <th className="p-4 text-center">Estado Operación</th>
                  <th className="p-4 text-right">Comisión Cobrada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2d2d2d] text-xs">
                {deals.map((deal) => {
                  const hasLpg = (deal as any).liq_status === 'liquidado';
                  const opStatus = (deal as any).operation_status || 'abierta';
                  const logStatus = (deal as any).logistics_status || 'pendiente';
                  const delStatus = (deal as any).delivery_status || 'pendiente';

                  return (
                    <tr key={deal.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="p-4 font-mono font-bold text-purple-400 uppercase">
                        #{deal.id.substring(0, 6)}
                      </td>
                      <td className="p-4 text-zinc-400 font-mono">
                        {deal.createdAt ? format(deal.createdAt, 'dd/MM/yyyy HH:mm') : '-'}
                      </td>
                      <td className="p-4 font-bold capitalize text-white">
                        🌾 {deal.cropType}
                      </td>
                      <td className="p-4 font-mono font-bold text-zinc-200">
                        {formatNumber(deal.quantity_tn)} tn
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="text-green-400 font-semibold">{deal.sellerName}</span>
                          <span className="text-zinc-500">→</span>
                          <span className="text-blue-400 font-semibold">{deal.buyerName}</span>
                        </div>
                      </td>
                      <td className="p-4 font-mono">
                        <div className="flex flex-col">
                          <span>Vta: <strong className="text-green-500">${deal.price_seller}/tn</strong></span>
                          <span>Cpa: <strong className="text-blue-500">${deal.price_buyer}/tn</strong></span>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider font-mono border ${
                          opStatus === 'cerrada' ? 'bg-zinc-800 text-zinc-500 border-zinc-700' :
                          hasLpg ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                          delStatus === 'entregado' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                          logStatus === 'en_transito' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                          logStatus === 'cupo_asignado' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                          'bg-red-500/10 text-red-400 border-red-500/20'
                        }`}>
                          {opStatus === 'cerrada' ? 'Archivado 📁' :
                           hasLpg ? 'Liquidado 💵' :
                           delStatus === 'entregado' ? 'Entregado ⚖️' :
                           logStatus === 'en_transito' ? 'En Tránsito 🚚' :
                           logStatus === 'cupo_asignado' ? 'Cupo Listo 📦' :
                           'Pendiente ⏳'}
                        </span>
                      </td>
                      <td className="p-4 text-right font-mono font-extrabold text-amber-400 text-sm">
                        {formatCurrency(deal.totalCommission)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Cotizador de Cruces Modal */}
      {cotizadorModal.isOpen && cotizadorModal.match && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#1e1e1e] border border-zinc-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl p-6 text-left space-y-4 animate-scale-up font-sans">
            
            {/* Modal Title */}
            <div className="border-b border-[#2d2d2d] pb-3 flex justify-between items-center">
              <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>🌾</span> Cotizador de Cruce Algorítmico
              </h3>
              <span className="text-[10px] bg-green-500/15 text-green-400 border border-green-500/20 px-2.5 py-0.5 rounded font-bold uppercase tracking-wider">
                {cotizadorModal.match.cropType}
              </span>
            </div>

            {/* Match info summary */}
            <div className="bg-[#181818] p-3 rounded-xl border border-[#2c2c2c] text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-zinc-500">Vendedor (Productor):</span>
                <span className="text-white font-bold">{cotizadorModal.seller.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Comprador (Destino):</span>
                <span className="text-white font-bold">{cotizadorModal.buyer.name}</span>
              </div>
              <div className="flex justify-between border-t border-zinc-800/60 pt-1.5 mt-1">
                <span className="text-zinc-500">Volumen del Cruce:</span>
                <span className="text-zinc-200 font-mono font-bold">{formatNumber(cotizadorModal.match.overlapQuantity)} TN</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Precio Base Pautado:</span>
                <span className="text-zinc-200 font-mono font-bold">USD {cotizadorModal.match.offer.price_usd} /tn</span>
              </div>
            </div>

            {/* Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Flete Estimado (USD/tn)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={cotizadorModal.estimatedFreight}
                  onChange={e => setCotizadorModal(prev => ({ ...prev, estimatedFreight: e.target.value }))}
                  className="w-full bg-[#252525] border border-[#3b3b3b] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-green-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Plazo de Pago</label>
                <select
                  value={cotizadorModal.paymentTerms}
                  onChange={e => setCotizadorModal(prev => ({ ...prev, paymentTerms: e.target.value }))}
                  className="w-full bg-[#252525] border border-[#3b3b3b] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-green-500 cursor-pointer"
                >
                  <option value="Contado">Contado</option>
                  <option value="72 hs">72 hs</option>
                  <option value="30 días">30 días</option>
                  <option value="A fijar">A fijar</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Calidad Pactada</label>
                <select
                  value={cotizadorModal.grainQuality}
                  onChange={e => setCotizadorModal(prev => ({ ...prev, grainQuality: e.target.value }))}
                  className="w-full bg-[#252525] border border-[#3b3b3b] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-green-500 cursor-pointer"
                >
                  <option value="Cámara">Cámara</option>
                  <option value="Grado 2">Grado 2</option>
                  <option value="Fuera de estándar">Fuera de estándar</option>
                </select>
              </div>
            </div>

            {/* Net Payout Estimation Summary */}
            <div className="bg-[#1c231c]/50 border border-green-500/10 p-4 rounded-xl space-y-2 text-xs font-mono">
              <div className="flex justify-between text-zinc-400">
                <span>Monto Bruto Total:</span>
                <span>${formatNumber(cotizadorModal.match.overlapQuantity * cotizadorModal.match.offer.price_usd)} USD</span>
              </div>
              <div className="flex justify-between text-red-400/80">
                <span>Descuento de Flete:</span>
                <span>-${formatNumber(cotizadorModal.match.overlapQuantity * Number(cotizadorModal.estimatedFreight || 0))} USD</span>
              </div>
              <div className="flex justify-between text-base font-black text-green-400 border-t border-zinc-800 pt-1.5 mt-1.5">
                <span>Precio Neto Productor:</span>
                <span>USD {cotizadorModal.match.offer.price_usd - Number(cotizadorModal.estimatedFreight || 0)} /tn</span>
              </div>
              <div className="flex justify-between text-[11px] font-bold text-amber-400">
                <span>Comisión Mesa (2%):</span>
                <span>USD {formatNumber(Math.round(cotizadorModal.match.totalCommission))}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleSendWaQuote}
                disabled={sendingWa}
                className="px-4 py-2 text-xs font-black rounded-xl bg-green-600/10 hover:bg-green-600/20 text-green-400 border border-green-500/20 transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {sendingWa ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>📢</span>}
                <span>Enviar Cotización (WhatsApp)</span>
              </button>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setCotizadorModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-350 border border-zinc-700 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConcretarBoleto}
                  disabled={updatingId === cotizadorModal.match.id}
                  className="px-5 py-2 text-xs font-black rounded-xl bg-amber-500 hover:bg-amber-600 text-black shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider"
                >
                  {updatingId === cotizadorModal.match.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-black" /> : 'Concretar Boleto 🤝'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
