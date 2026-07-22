import React, { useState, useEffect, useMemo } from 'react';
import { useDeals, Deal } from '../hooks/useDeals';
import { useClients } from '../hooks/useClients';
import { api } from '../lib/api';
import { useUI } from '../contexts/UIContext';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { 
  Truck, Scale, DollarSign, Archive, FileText, CheckCircle2, AlertTriangle, 
  ChevronRight, ArrowRight, Loader2, Sparkles, Send, ShieldAlert, Award
} from 'lucide-react';

export function MesaOperativa() {
  const { deals, loading: loadingDeals, setDeals } = useDeals();
  const { clients } = useClients();
  const { addToast } = useUI();
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'logistica' | 'calidad' | 'lpg' | 'archivo' | 'reportes'>('logistica');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Form states
  const [logisticsForm, setLogisticsForm] = useState<Record<string, { driver: string; plate: string }>>({});
  const [qualityForm, setQualityForm] = useState<Record<string, { moisture: string; bruto: string; tara: string }>>({});
  const [lpgForm, setLpgForm] = useState<Record<string, { drying: string; cleaning: string; freight: string; tax: string }>>({});

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('es-AR').format(num);
  };

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(num);
  };

  // ----------------------------------------------------
  // Stage Handlers
  // ----------------------------------------------------
  
  // LOGISTICS
  const handleRequestCupo = async (dealId: string) => {
    setUpdatingId(dealId);
    try {
      const randomCupo = `CUP-${Math.floor(1000 + Math.random() * 9000)}`;
      const updated = await api.deals.update(dealId, {
        logistics_status: 'cupo_asignado',
        logistics_cupo: randomCupo
      });
      setDeals(prev => prev.map(d => d.id === dealId ? { ...d, ...updated } : d));
      addToast(`Cupo asignado con éxito: ${randomCupo} 🚚`, 'success');
    } catch (err) {
      addToast('Error al solicitar cupo', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleEmitCPE = async (dealId: string) => {
    const data = logisticsForm[dealId] || { driver: '', plate: '' };
    if (!data.driver.trim() || !data.plate.trim()) {
      addToast('Por favor complete chofer y patente para emitir CPE', 'warning');
      return;
    }
    setUpdatingId(dealId);
    try {
      const randomCPE = `CPE-${Math.floor(10000000 + Math.random() * 90000000)}`;
      const updated = await api.deals.update(dealId, {
        logistics_status: 'en_transito',
        logistics_cpe: randomCPE,
        logistics_driver: data.driver,
        logistics_plate: data.plate
      });
      setDeals(prev => prev.map(d => d.id === dealId ? { ...d, ...updated } : d));
      addToast(`Carta de Porte Electrónica emitida: ${randomCPE} 📄`, 'success');
    } catch (err) {
      addToast('Error al emitir la CPE', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleConfirmArribo = async (dealId: string) => {
    setUpdatingId(dealId);
    try {
      const updated = await api.deals.update(dealId, {
        logistics_status: 'arribado'
      });
      setDeals(prev => prev.map(d => d.id === dealId ? { ...d, ...updated } : d));
      addToast('Viaje marcado como ARRIBADO a destino. Listo para control de descarga. ⚖️', 'success');
    } catch (err) {
      addToast('Error al confirmar arribo', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  // QUALITY CONTROL
  const handleSaveQuality = async (dealId: string, quantity_tn: number) => {
    const data = qualityForm[dealId] || { moisture: '14.0', bruto: '', tara: '' };
    const brutoKg = Number(data.bruto);
    const taraKg = Number(data.tara);
    const moisture = Number(data.moisture);

    if (!brutoKg || !taraKg || brutoKg <= taraKg) {
      addToast('Ingrese valores de balanza válidos (Bruto > Tara)', 'warning');
      return;
    }

    setUpdatingId(dealId);
    try {
      const netTn = Number(((brutoKg - taraKg) / 1000).toFixed(2));
      const randomTicket = `BAL-${Math.floor(10000 + Math.random() * 90000)}`;
      const randomCert = `DEP-${Math.floor(10000 + Math.random() * 90000)}`;

      const updated = await api.deals.update(dealId, {
        delivery_status: 'entregado',
        delivery_moisture: moisture,
        delivery_weight_net: netTn,
        delivery_ticket: randomTicket,
        delivery_certificate: randomCert
      });

      setDeals(prev => prev.map(d => d.id === dealId ? { ...d, ...updated } : d));
      addToast(`Calidad registrada. Peso Neto: ${netTn} tn. Ticket: ${randomTicket} ⚖️`, 'success');
    } catch (err) {
      addToast('Error al registrar control de calidad', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  // LIQUIDATION
  const handleLiquidate = async (dealId: string, basePrice: number, netWeight: number) => {
    const data = lpgForm[dealId] || { drying: '2', cleaning: '1', freight: '10', tax: '5' };
    const drying = Number(data.drying) || 0;
    const cleaning = Number(data.cleaning) || 0;
    const freight = Number(data.freight) || 0;
    const taxPercent = Number(data.tax) || 0;

    const totalBruto = basePrice * netWeight;
    const dryingCost = drying * netWeight;
    const cleaningCost = cleaning * netWeight;
    const freightCost = freight * netWeight;
    const taxWithheld = totalBruto * (taxPercent / 100);

    const netPayout = totalBruto - (dryingCost + cleaningCost + freightCost + taxWithheld);

    setUpdatingId(dealId);
    try {
      const randomLPG = `LPG-0048-${Math.floor(10000000 + Math.random() * 90000000)}`;
      const randomInvoice = `FAC-B-0002-${Math.floor(100000 + Math.random() * 900000)}`;

      const updated = await api.deals.update(dealId, {
        liq_status: 'liquidado',
        liq_lpg_number: randomLPG,
        liq_drying_cost: dryingCost,
        liq_cleaning_cost: cleaningCost,
        liq_freight_cost: freightCost,
        liq_tax_withheld: taxWithheld,
        liq_net_payout: Math.round(netPayout),
        liq_invoice_number: randomInvoice
      });

      setDeals(prev => prev.map(d => d.id === dealId ? { ...d, ...updated } : d));
      addToast(`LPG emitida con éxito: ${randomLPG} 💵`, 'success');
    } catch (err) {
      addToast('Error al liquidar operación', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  // ARCHIVE & CLOSE
  const handleCloseOperation = async (dealId: string) => {
    setUpdatingId(dealId);
    try {
      const updated = await api.deals.update(dealId, {
        operation_status: 'cerrada'
      });
      setDeals(prev => prev.map(d => d.id === dealId ? { ...d, ...updated } : d));
      addToast('Legajo de operación cerrado y archivado legalmente con éxito 📁', 'success');
    } catch (err) {
      addToast('Error al archivar la operación', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  // ----------------------------------------------------
  // Tab Filters
  // ----------------------------------------------------
  const filteredDeals = useMemo(() => {
    const openDeals = deals.filter(d => (d as any).operation_status !== 'cerrada');
    if (activeTab === 'logistica') {
      return openDeals.filter(d => !(d as any).logistics_status || (d as any).logistics_status !== 'arribado');
    }
    if (activeTab === 'calidad') {
      return openDeals.filter(d => (d as any).logistics_status === 'arribado' && (d as any).delivery_status !== 'entregado');
    }
    if (activeTab === 'lpg') {
      return openDeals.filter(d => (d as any).delivery_status === 'entregado' && (d as any).liq_status !== 'liquidado');
    }
    if (activeTab === 'archivo') {
      return deals.filter(d => (d as any).liq_status === 'liquidado');
    }
    return deals; // reportes
  }, [deals, activeTab]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-zinc-900 to-[#1e1e1e] border border-[#333] p-5 rounded-2xl shadow-lg">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <span>⚙️</span> Mesa Operativa AgroSys
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">Control logístico, control de balanza, liquidación de granos (LPG) y auditoría final</p>
        </div>
        <div className="text-xs text-gray-400 font-mono bg-zinc-800/50 border border-zinc-700/55 px-3 py-2 rounded-xl">
          🎯 Operaciones Abiertas: {deals.filter(d => (d as any).operation_status !== 'cerrada').length}
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#333] pb-3">
        {[
          { id: 'logistica', label: '🚚 Logística y CPE', desc: 'Cupos y cartas de porte' },
          { id: 'calidad', label: '⚖️ Descarga y Calidad', desc: 'Balanza y humedad' },
          { id: 'lpg', label: '💵 Liquidación (LPG)', desc: 'Liquidación y Factura' },
          { id: 'archivo', label: '📁 Cierre y Archivo', desc: 'Auditoría de Legajos' },
          { id: 'reportes', label: '📊 Reportes de Cierre', desc: 'Métricas de la mesa' }
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2.5 rounded-xl text-left transition-all duration-200 cursor-pointer border ${
              activeTab === tab.id 
                ? 'bg-green-600/10 border-green-500/30 text-green-400 font-black shadow-md' 
                : 'bg-[#181818] border-[#2a2a2a] text-gray-400 hover:text-gray-200'
            }`}
          >
            <div className="text-xs sm:text-sm font-extrabold">{tab.label}</div>
            <div className="text-[10px] opacity-70 font-normal mt-0.5 hidden sm:block">{tab.desc}</div>
          </button>
        ))}
      </div>

      {/* Main Panel */}
      {loadingDeals ? (
        <div className="flex flex-col items-center justify-center p-20 bg-[#1e1e1e] border border-[#333] rounded-3xl">
          <Loader2 className="w-8 h-8 animate-spin text-green-500 mb-3" />
          <p className="text-sm text-gray-400">Obteniendo operaciones en juego...</p>
        </div>
      ) : filteredDeals.length === 0 && activeTab !== 'reportes' ? (
        <div className="p-12 text-center bg-[#1e1e1e] border border-dashed border-[#333] rounded-3xl max-w-2xl mx-auto">
          <div className="bg-[#262626] w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 border border-[#363636]">
            <CheckCircle2 className="w-5 h-5 text-zinc-400" />
          </div>
          <h3 className="text-sm sm:text-base font-black text-white mb-2">Sin operaciones pendientes</h3>
          <p className="text-xs text-zinc-555 leading-relaxed">
            No hay boletos en esta etapa operativa por el momento. Concreta cruces de oferta/demanda en la mesa de granos para verlos aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* TAB: LOGISTICA */}
          {activeTab === 'logistica' && (
            <div className="grid grid-cols-1 gap-6">
              {filteredDeals.map(deal => {
                const status = (deal as any).logistics_status || 'pendiente';
                const hasCupo = !!(deal as any).logistics_cupo;
                const hasCpe = !!(deal as any).logistics_cpe;

                return (
                  <div key={deal.id} className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-5 shadow-md space-y-4 hover:border-zinc-700 transition-colors">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#2a2a2a] pb-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base">🌾</span>
                          <span className="text-xs font-black text-white uppercase tracking-wider">{deal.cropType}</span>
                          <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono font-bold">
                            {formatNumber(deal.quantity_tn)} TN
                          </span>
                          <span className="text-[10px] bg-purple-950/40 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded font-mono font-semibold">
                            Boleto #{deal.id.substring(0, 6).toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1.5">
                          Intermediación: <strong className="text-green-400">{deal.sellerName}</strong> → <strong className="text-blue-400">{deal.buyerName}</strong>
                        </p>
                      </div>
                      
                      {/* State badge */}
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider self-start ${
                        status === 'pendiente' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                        status === 'cupo_asignado' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                        'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}>
                        {status === 'pendiente' ? 'Pendiente Cupo' :
                         status === 'cupo_asignado' ? 'Cupo Asignado' : 'En Tránsito 🚚'}
                      </span>
                    </div>

                    {/* Step Timeline */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                      
                      {/* Step 1: Cupo */}
                      <div className={`p-4 rounded-xl border ${hasCupo ? 'bg-[#212521] border-green-500/20 text-green-300' : 'bg-[#212121] border-[#2d2d2d]'}`}>
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-xs font-black uppercase tracking-wide">1. Cupo de Entrega</h4>
                          {hasCupo && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                        </div>
                        {hasCupo ? (
                          <div className="text-xs space-y-1 font-mono">
                            <p className="text-zinc-400">Terminal: <span className="text-zinc-200 font-sans">{deal.location}</span></p>
                            <p className="text-green-400 font-bold text-sm">Código: {(deal as any).logistics_cupo}</p>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRequestCupo(deal.id)}
                            disabled={updatingId === deal.id}
                            className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-zinc-700"
                          >
                            {updatingId === deal.id ? <Loader2 className="w-3 animate-spin" /> : 'Solicitar Cupo'}
                          </button>
                        )}
                      </div>

                      {/* Step 2: CPE */}
                      <div className={`p-4 rounded-xl border ${hasCpe ? 'bg-[#212521] border-green-500/20 text-green-300' : 'bg-[#212121] border-[#2d2d2d]'} ${!hasCupo ? 'opacity-50 pointer-events-none' : ''}`}>
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-xs font-black uppercase tracking-wide">2. Chofer y CPE</h4>
                          {hasCpe && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                        </div>
                        
                        {hasCpe ? (
                          <div className="text-xs space-y-1 font-mono">
                            <p className="text-zinc-400">CPE: <span className="text-zinc-200">{(deal as any).logistics_cpe}</span></p>
                            <p className="text-zinc-400">Chofer: <span className="text-zinc-200 font-sans">{(deal as any).logistics_driver}</span></p>
                            <p className="text-zinc-400">Patente: <span className="text-zinc-200">{(deal as any).logistics_plate}</span></p>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                placeholder="Chofer"
                                value={logisticsForm[deal.id]?.driver || ''}
                                onChange={e => setLogisticsForm(prev => ({
                                  ...prev,
                                  [deal.id]: { ...prev[deal.id], driver: e.target.value }
                                }))}
                                className="bg-[#282828] border border-[#3d3d3d] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-green-500"
                              />
                              <input
                                type="text"
                                placeholder="Patente"
                                value={logisticsForm[deal.id]?.plate || ''}
                                onChange={e => setLogisticsForm(prev => ({
                                  ...prev,
                                  [deal.id]: { ...prev[deal.id], plate: e.target.value }
                                }))}
                                className="bg-[#282828] border border-[#3d3d3d] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-green-500"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleEmitCPE(deal.id)}
                              disabled={updatingId === deal.id}
                              className="w-full py-2 bg-green-650 hover:bg-green-700 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            >
                              Emitir CPE y Despachar 📄
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Step 3: Arribo */}
                      <div className={`p-4 rounded-xl border bg-[#212121] border-[#2d2d2d] flex flex-col justify-between ${!hasCpe ? 'opacity-50 pointer-events-none' : ''}`}>
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wide mb-2 text-zinc-400">3. Control Arribo</h4>
                          <p className="text-[10px] text-zinc-500 leading-relaxed mb-4">Confirma la llegada física del camión al puerto/acopio antes de habilitar calado.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleConfirmArribo(deal.id)}
                          disabled={updatingId === deal.id}
                          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          Confirmar Arribo 🏁
                        </button>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB: CALIDAD */}
          {activeTab === 'calidad' && (
            <div className="grid grid-cols-1 gap-6">
              {filteredDeals.map(deal => {
                const defaultMoisture = '14.0';
                return (
                  <div key={deal.id} className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-5 shadow-md space-y-4 hover:border-zinc-700 transition-colors">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#2a2a2a] pb-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base">🌾</span>
                          <span className="text-xs font-black text-white uppercase tracking-wider">{deal.cropType}</span>
                          <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono font-bold">
                            Pactado: {formatNumber(deal.quantity_tn)} TN
                          </span>
                          <span className="text-[10px] bg-blue-950/40 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded font-mono font-semibold">
                            CPE: {(deal as any).logistics_cpe}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1.5">
                          Chofer: <strong className="text-zinc-300">{(deal as any).logistics_driver}</strong> | Patente: <strong className="text-zinc-300">{(deal as any).logistics_plate}</strong> | Cupo: <strong className="text-green-500">{(deal as any).logistics_cupo}</strong>
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-purple-500/10 text-purple-400 border border-purple-500/20 self-start">
                        Balanza y Calado
                      </span>
                    </div>

                    {/* Weight and Calado Form */}
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-end">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Peso Bruto (kg)</label>
                        <input
                          type="number"
                          placeholder="e.g. 45000"
                          value={qualityForm[deal.id]?.bruto || ''}
                          onChange={e => setQualityForm(prev => ({
                            ...prev,
                            [deal.id]: { ...prev[deal.id], bruto: e.target.value }
                          }))}
                          className="w-full bg-[#252525] border border-[#3a3a3a] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-green-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Tara (kg)</label>
                        <input
                          type="number"
                          placeholder="e.g. 15000"
                          value={qualityForm[deal.id]?.tara || ''}
                          onChange={e => setQualityForm(prev => ({
                            ...prev,
                            [deal.id]: { ...prev[deal.id], tara: e.target.value }
                          }))}
                          className="w-full bg-[#252525] border border-[#3a3a3a] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-green-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Humedad (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="e.g. 14.0"
                          value={qualityForm[deal.id]?.moisture !== undefined ? qualityForm[deal.id]?.moisture : defaultMoisture}
                          onChange={e => setQualityForm(prev => ({
                            ...prev,
                            [deal.id]: { ...prev[deal.id], moisture: e.target.value }
                          }))}
                          className="w-full bg-[#252525] border border-[#3a3a3a] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-green-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSaveQuality(deal.id, deal.quantity_tn)}
                        disabled={updatingId === deal.id}
                        className="py-2.5 bg-green-550 hover:bg-green-600 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer uppercase tracking-wider"
                      >
                        {updatingId === deal.id ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : 'Registrar Descarga ⚖️'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB: LPG */}
          {activeTab === 'lpg' && (
            <div className="grid grid-cols-1 gap-6">
              {filteredDeals.map(deal => {
                const priceBase = deal.price_seller; // producer selling price
                const netWeight = (deal as any).delivery_weight_net || deal.quantity_tn;
                const estimatedFreight = (deal as any).estimated_freight || 0;

                const defaultDrying = '2.0';
                const defaultCleaning = '1.0';
                const defaultFreight = estimatedFreight.toString();
                const defaultTax = '5.0';

                // Real-time calculation helpers for UI display
                const drying = Number(lpgForm[deal.id]?.drying !== undefined ? lpgForm[deal.id]?.drying : defaultDrying) || 0;
                const cleaning = Number(lpgForm[deal.id]?.cleaning !== undefined ? lpgForm[deal.id]?.cleaning : defaultCleaning) || 0;
                const freight = Number(lpgForm[deal.id]?.freight !== undefined ? lpgForm[deal.id]?.freight : defaultFreight) || 0;
                const tax = Number(lpgForm[deal.id]?.tax !== undefined ? lpgForm[deal.id]?.tax : defaultTax) || 0;

                const subtotalBruto = priceBase * netWeight;
                const dryingCost = drying * netWeight;
                const cleaningCost = cleaning * netWeight;
                const freightCost = freight * netWeight;
                const taxWithheld = subtotalBruto * (tax / 100);
                const totalNetoToPay = subtotalBruto - (dryingCost + cleaningCost + freightCost + taxWithheld);

                return (
                  <div key={deal.id} className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-5 shadow-md space-y-4 hover:border-zinc-700 transition-colors">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#2a2a2a] pb-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base">🌾</span>
                          <span className="text-xs font-black text-white uppercase tracking-wider">{deal.cropType}</span>
                          <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono font-bold">
                            Descargado: {formatNumber(netWeight)} TN
                          </span>
                          <span className="text-[10px] bg-green-950/40 text-green-400 border border-green-500/20 px-2 py-0.5 rounded font-mono font-semibold">
                            Precio Pactado: USD {priceBase}/tn
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1.5">
                          Productor: <strong className="text-green-400">{deal.sellerName}</strong> | Ticket Balanza: <strong className="text-zinc-300">{(deal as any).delivery_ticket}</strong> | Humedad: <strong className="text-zinc-300">{(deal as any).delivery_moisture}%</strong>
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 self-start">
                        Liquidador LPG
                      </span>
                    </div>

                    {/* Form and Calculations Split */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      
                      {/* Inputs Column */}
                      <div className="space-y-3 bg-[#181818] p-4 rounded-xl border border-[#2a2a2a]">
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2 border-b border-zinc-800 pb-1.5">Descuentos & Gastos</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Secado (USD/tn)</label>
                            <input
                              type="number"
                              step="0.5"
                              value={lpgForm[deal.id]?.drying !== undefined ? lpgForm[deal.id]?.drying : defaultDrying}
                              onChange={e => setLpgForm(prev => ({
                                ...prev,
                                [deal.id]: { ...prev[deal.id], drying: e.target.value }
                              }))}
                              className="w-full bg-[#252525] border border-[#3b3b3b] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Zarandeo (USD/tn)</label>
                            <input
                              type="number"
                              step="0.5"
                              value={lpgForm[deal.id]?.cleaning !== undefined ? lpgForm[deal.id]?.cleaning : defaultCleaning}
                              onChange={e => setLpgForm(prev => ({
                                ...prev,
                                [deal.id]: { ...prev[deal.id], cleaning: e.target.value }
                              }))}
                              className="w-full bg-[#252525] border border-[#3b3b3b] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Flete Interno (USD/tn)</label>
                            <input
                              type="number"
                              value={lpgForm[deal.id]?.freight !== undefined ? lpgForm[deal.id]?.freight : defaultFreight}
                              onChange={e => setLpgForm(prev => ({
                                ...prev,
                                [deal.id]: { ...prev[deal.id], freight: e.target.value }
                              }))}
                              className="w-full bg-[#252525] border border-[#3b3b3b] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Retenciones (%)</label>
                            <input
                              type="number"
                              step="0.5"
                              value={lpgForm[deal.id]?.tax !== undefined ? lpgForm[deal.id]?.tax : defaultTax}
                              onChange={e => setLpgForm(prev => ({
                                ...prev,
                                [deal.id]: { ...prev[deal.id], tax: e.target.value }
                              }))}
                              className="w-full bg-[#252525] border border-[#3b3b3b] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Math Summary Column */}
                      <div className="lg:col-span-2 flex flex-col justify-between bg-[#192219]/30 border border-green-500/10 p-5 rounded-xl text-xs space-y-3.5">
                        <div className="space-y-2 font-mono">
                          <div className="flex justify-between items-center text-zinc-400 border-b border-zinc-800/60 pb-1.5">
                            <span>Subtotal Bruto:</span>
                            <span className="text-zinc-200">${formatNumber(subtotalBruto)} USD</span>
                          </div>
                          <div className="flex justify-between items-center text-red-400/80">
                            <span>Desc. Secado y Zarandeo:</span>
                            <span>-${formatNumber(dryingCost + cleaningCost)} USD</span>
                          </div>
                          <div className="flex justify-between items-center text-red-400/80">
                            <span>Desc. Flete Interno Real:</span>
                            <span>-${formatNumber(freightCost)} USD</span>
                          </div>
                          <div className="flex justify-between items-center text-red-400/80 border-b border-zinc-800/60 pb-1.5">
                            <span>Retención Impositiva ({tax}%):</span>
                            <span>-${formatNumber(taxWithheld)} USD</span>
                          </div>
                          <div className="flex justify-between items-center text-base font-black text-green-400 pt-1">
                            <span>Liquidación Neta Productor:</span>
                            <span>${formatNumber(Math.round(totalNetoToPay))} USD</span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] text-amber-500/90 font-bold border-t border-dashed border-zinc-800 pt-1.5">
                            <span>Honorarios Corredor Facturados (2%):</span>
                            <span>${formatNumber(deal.totalCommission)} USD</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleLiquidate(deal.id, priceBase, netWeight)}
                          disabled={updatingId === deal.id}
                          className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer uppercase tracking-wider"
                        >
                          {updatingId === deal.id ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : 'Emitir LPG y Facturar Honorarios 🤝'}
                        </button>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB: ARCHIVO */}
          {activeTab === 'archivo' && (
            <div className="grid grid-cols-1 gap-6">
              {filteredDeals.map(deal => {
                const status = (deal as any).operation_status || 'abierta';
                const isClosed = status === 'cerrada';

                return (
                  <div key={deal.id} className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-5 shadow-md space-y-4 hover:border-zinc-700 transition-colors">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#2a2a2a] pb-3">
                      <div>
                        <h3 className="text-sm font-black text-white flex items-center gap-2">
                          <span>📁</span> Legajo Digital: Boleto #{deal.id.substring(0, 6).toUpperCase()}
                        </h3>
                        <p className="text-[11px] text-zinc-400 mt-1">
                          Operación: <strong className="text-zinc-200">{deal.cropType.toUpperCase()}</strong> | Intervinientes: <strong className="text-green-400">{deal.sellerName}</strong> → <strong className="text-blue-400">{deal.buyerName}</strong>
                        </p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                        isClosed ? 'bg-zinc-800 text-zinc-500 border border-zinc-700' : 'bg-green-500/10 text-green-400 border border-green-500/20'
                      }`}>
                        {isClosed ? 'Archivado (10 años)' : 'Listo para Archivo'}
                      </span>
                    </div>

                    {/* Checklist */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                      <div className="space-y-2 bg-[#171717] p-4 rounded-xl border border-[#2a2a2a] text-xs font-mono text-zinc-400">
                        <h4 className="font-bold text-white uppercase tracking-wider mb-2 text-[10px] border-b border-zinc-800 pb-1">Checklist de Documentación Legal</h4>
                        <div className="flex items-center gap-2 text-green-400">
                          <CheckCircle2 className="w-4 h-4" /> <span>Boleto de Compraventa Registrado</span>
                        </div>
                        <div className="flex items-center gap-2 text-green-400">
                          <CheckCircle2 className="w-4 h-4" /> <span>Carta de Porte Electrónica ({(deal as any).logistics_cpe})</span>
                        </div>
                        <div className="flex items-center gap-2 text-green-400">
                          <CheckCircle2 className="w-4 h-4" /> <span>Ticket Balanza ({(deal as any).delivery_ticket}) y Certificado ({(deal as any).delivery_certificate})</span>
                        </div>
                        <div className="flex items-center gap-2 text-green-400">
                          <CheckCircle2 className="w-4 h-4" /> <span>Liquidación Primaria de Granos ({(deal as any).liq_lpg_number})</span>
                        </div>
                        <div className="flex items-center gap-2 text-green-400">
                          <CheckCircle2 className="w-4 h-4" /> <span>Factura Comisión Broker ({(deal as any).liq_invoice_number})</span>
                        </div>
                      </div>

                      <div className="p-5 bg-[#222] border border-[#2d2d2d] rounded-xl flex flex-col justify-between h-full space-y-4">
                        <div className="space-y-1 text-xs">
                          <p className="text-zinc-500">Volumen Entregado: <span className="font-mono text-white font-bold">{(deal as any).delivery_weight_net} tn</span></p>
                          <p className="text-zinc-500">Monto Liquidado: <span className="font-mono text-white font-bold">${formatNumber((deal as any).liq_net_payout)} USD</span></p>
                          <div className="flex items-center gap-1.5 text-green-400 text-[10px] font-mono mt-3">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Control final completado: Saldos de granos y dinero conciliados.</span>
                          </div>
                        </div>

                        {isClosed ? (
                          <div className="py-2.5 bg-zinc-800 text-zinc-500 font-extrabold text-xs rounded-xl text-center border border-zinc-700 cursor-not-allowed uppercase font-mono">
                            📂 OPERACIÓN CERRADA Y ARCHIVADA
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleCloseOperation(deal.id)}
                            disabled={updatingId === deal.id}
                            className="w-full py-2.5 bg-green-650 hover:bg-green-700 text-black font-black text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer uppercase tracking-wider"
                          >
                            {updatingId === deal.id ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : 'Cerrar Legajo de Operación 📁'}
                          </button>
                        )}
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}

          {/* TAB: REPORTES */}
          {activeTab === 'reportes' && (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  {
                    title: 'Volumen Total Descargado',
                    value: `${formatNumber(deals.reduce((acc, curr) => acc + Number((curr as any).delivery_weight_net || 0), 0))} TN`,
                    sub: 'Cargas pesadas en balanza',
                    color: 'text-green-400'
                  },
                  {
                    title: 'Payout Neto Productores',
                    value: formatCurrency(deals.reduce((acc, curr) => acc + Number((curr as any).liq_net_payout || 0), 0)),
                    sub: 'Monto real distribuido',
                    color: 'text-blue-400'
                  },
                  {
                    title: 'Flete Interno Total',
                    value: formatCurrency(deals.reduce((acc, curr) => acc + (Number((curr as any).liq_freight_cost || 0)), 0)),
                    sub: 'Costo logístico liquidado',
                    color: 'text-amber-500'
                  },
                  {
                    title: 'Impuestos Retenidos',
                    value: formatCurrency(deals.reduce((acc, curr) => acc + Number((curr as any).liq_tax_withheld || 0), 0)),
                    sub: 'Retenciones fiscales totales',
                    color: 'text-purple-400'
                  }
                ].map((stat, i) => (
                  <div key={i} className="bg-[#1e1e1e] border border-[#333] p-5 rounded-2xl shadow-sm">
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{stat.title}</h4>
                    <div className={`text-xl sm:text-2xl font-black ${stat.color} font-mono`}>{stat.value}</div>
                    <p className="text-[10px] text-zinc-500 mt-1">{stat.sub}</p>
                  </div>
                ))}
              </div>

              {/* Detailed Operational Table */}
              <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl overflow-hidden shadow-lg">
                <div className="p-5 bg-gradient-to-r from-[#212121] to-[#252525] border-b border-[#333]">
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">Historial Operativo y LPG</h3>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">Listado total de operaciones liquidadas o cerradas</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="bg-[#1a1a1a] border-b border-[#2d2d2d] text-zinc-400 text-[10px] uppercase tracking-wider font-semibold">
                        <th className="p-4">Operación</th>
                        <th className="p-4">Productor</th>
                        <th className="p-4">CPE / Balanza</th>
                        <th className="p-4 text-right">Bruto Pactado</th>
                        <th className="p-4 text-right">Logística y Descuentos</th>
                        <th className="p-4 text-right">Impuestos</th>
                        <th className="p-4 text-right">Payout Neto</th>
                        <th className="p-4 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2d2d2d] text-xs font-mono">
                      {deals.map(deal => {
                        const hasLpg = (deal as any).liq_status === 'liquidado';
                        const netWeight = (deal as any).delivery_weight_net || deal.quantity_tn;
                        const subtotalBruto = deal.price_seller * netWeight;
                        const totalDescuentos = Number((deal as any).liq_drying_cost || 0) + Number((deal as any).liq_cleaning_cost || 0) + Number((deal as any).liq_freight_cost || 0);

                        return (
                          <tr key={deal.id} className="hover:bg-zinc-800/35 transition-colors">
                            <td className="p-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-white font-sans">🌾 {deal.cropType.toUpperCase()}</span>
                                <span className="text-[10px] text-zinc-500 font-mono font-normal">#{deal.id.substring(0, 6)}</span>
                              </div>
                            </td>
                            <td className="p-4 font-semibold text-green-400 font-sans">{deal.sellerName}</td>
                            <td className="p-4 text-zinc-300">
                              <div className="flex flex-col gap-0.5">
                                <span>CPE: {(deal as any).logistics_cpe || 'N/A'}</span>
                                <span className="text-[10px] text-zinc-500">Ticket: {(deal as any).delivery_ticket || 'N/A'}</span>
                              </div>
                            </td>
                            <td className="p-4 text-right text-zinc-200">
                              <div className="flex flex-col">
                                <span>${formatNumber(subtotalBruto)}</span>
                                <span className="text-[9px] text-zinc-500">{formatNumber(netWeight)} tn</span>
                              </div>
                            </td>
                            <td className="p-4 text-right text-red-400">
                              {hasLpg ? `-$${formatNumber(totalDescuentos)}` : '-'}
                            </td>
                            <td className="p-4 text-right text-red-400">
                              {hasLpg ? `-$${formatNumber((deal as any).liq_tax_withheld || 0)}` : '-'}
                            </td>
                            <td className="p-4 text-right text-green-400 font-black text-sm">
                              {hasLpg ? `$${formatNumber((deal as any).liq_net_payout || 0)}` : '-'}
                            </td>
                            <td className="p-4 text-center">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                (deal as any).operation_status === 'cerrada' ? 'bg-zinc-800 text-zinc-500 border border-zinc-700' :
                                hasLpg ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                                'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              }`}>
                                {(deal as any).operation_status === 'cerrada' ? 'Cerrada' :
                                 hasLpg ? 'Liquidada' : 'En Tránsito'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
