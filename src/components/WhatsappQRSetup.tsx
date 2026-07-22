import React, { useState, useEffect } from 'react';
import { Loader2, Zap, CheckCircle2, QrCode, Sliders } from 'lucide-react';
import { socket } from '../lib/socket';

export function WhatsappQRSetup() {
    const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // WhatsApp dynamic settings states
    const [bypassHeuristic, setBypassHeuristic] = useState(false);
    const [matchTolerance, setMatchTolerance] = useState(0.15);
    const [savingSettings, setSavingSettings] = useState(false);

    const fetchSettings = async () => {
        try {
            const origin = typeof window !== 'undefined' ? window.location.origin : '';
            const res = await fetch(`${origin}/api/whatsapp/settings`);
            if (res.ok) {
                const data = await res.json();
                setBypassHeuristic(data.bypassHeuristic);
                setMatchTolerance(data.matchTolerance);
            }
        } catch (err) {
            console.warn('Error fetching WhatsApp settings', err);
        }
    };

    const updateSettings = async (newBypass: boolean, newTolerance: number) => {
        setSavingSettings(true);
        try {
            const origin = typeof window !== 'undefined' ? window.location.origin : '';
            const res = await fetch(`${origin}/api/whatsapp/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bypassHeuristic: newBypass, matchTolerance: newTolerance })
            });
            if (res.ok) {
                const data = await res.json();
                setBypassHeuristic(data.settings.bypassHeuristic);
                setMatchTolerance(data.settings.matchTolerance);
            }
        } catch (err) {
            console.error('Error saving WhatsApp settings', err);
        } finally {
            setSavingSettings(false);
        }
    };

    const fetchStatus = async () => {
        try {
            const origin = typeof window !== 'undefined' ? window.location.origin : '';
            const res = await fetch(`${origin}/api/whatsapp/status`);
            if (!res.ok) return;
            
            const text = await res.text();
            if (!text || !text.trim().startsWith('{')) {
                return; // Non-JSON response, ignore silently
            }
            
            const data = JSON.parse(text);
            setStatus(data.status);
            setQrCode(data.qr);
        } catch (err) {
            console.warn('Error fetching WA status', err);
        }
    };

    useEffect(() => {
        fetchStatus();
        fetchSettings();
        const interval = setInterval(fetchStatus, 3000);

        const handleSettingsUpdate = (data: any) => {
            if (data) {
                setBypassHeuristic(data.bypassHeuristic);
                setMatchTolerance(data.matchTolerance);
            }
        };

        socket.on('whatsapp-settings', handleSettingsUpdate);

        return () => {
            clearInterval(interval);
            socket.off('whatsapp-settings', handleSettingsUpdate);
        };
    }, []);

    const startConnection = async () => {
        setLoading(true);
        setError(null);
        try {
            const origin = typeof window !== 'undefined' ? window.location.origin : '';
            await fetch(`${origin}/api/whatsapp/start`, { method: 'POST' });
            fetchStatus();
        } catch (err) {
            setError('Error al iniciar la conexión.');
        } finally {
            setLoading(false);
        }
    };

    const resetConnection = async () => {
        if (!confirm('¿Estás seguro de que deseas desvincular y reiniciar la sesión de WhatsApp? Deberás escanear un nuevo código QR.')) {
            return;
        }
        setResetting(true);
        setError(null);
        try {
            const origin = typeof window !== 'undefined' ? window.location.origin : '';
            await fetch(`${origin}/api/whatsapp/reset`, { method: 'POST' });
            setStatus('disconnected');
            setQrCode(null);
        } catch (err) {
            setError('Error al desvincular la sesión.');
        } finally {
            setResetting(false);
        }
    };

    return (
        <div className="bg-[#252525] border border-[#444] rounded-xl p-6 shadow-xl mb-6">
            <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="flex-1 space-y-4">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <Zap className="w-5 h-5 text-purple-400" /> WhatsApp Personal (Web)
                    </h3>
                    <p className="text-gray-400 text-sm">
                        Vincula tu WhatsApp personal escaneando el código QR. Los mensajes que recibas en los grupos serán leídos por el bot automáticamente y aparecerán en la lista de alertas (sin usar WhatsApp Business).
                    </p>
                    
                    {status === 'disconnected' && (
                        <button 
                            onClick={startConnection}
                            disabled={loading || resetting}
                            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-5 h-5" />}
                            Iniciar Vinculación
                        </button>
                    )}

                    {status === 'connecting' && (
                        <div className="flex flex-wrap gap-3 items-center">
                            <div className="inline-flex items-center gap-2 bg-[#d97706]/10 text-amber-500 px-4 py-2 rounded-lg font-medium border border-amber-500/20 text-sm">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Conectando / Esperando QR...
                            </div>
                            <button 
                                onClick={resetConnection}
                                disabled={resetting || loading}
                                className="bg-[#3f3f46]/50 hover:bg-[#3f3f46] text-gray-300 px-3 py-2 rounded-lg text-sm font-semibold transition-colors border border-gray-600"
                            >
                                {resetting ? 'Reiniciando...' : 'Reiniciar Sesión'}
                            </button>
                        </div>
                    )}
                    
                    {status === 'connected' && (
                        <div className="flex flex-wrap gap-3 items-center">
                            <div className="inline-flex items-center gap-2 bg-green-500/20 text-green-400 px-4 py-2 rounded-lg font-medium border border-green-500/30 text-sm">
                                <CheckCircle2 className="w-5 h-5" />
                                WhatsApp Vinculado y Activo
                            </div>
                            <button 
                                onClick={resetConnection}
                                disabled={resetting || loading}
                                className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-2 rounded-lg text-sm font-semibold transition-colors border border-red-500/20"
                            >
                                {resetting ? 'Desvinculando...' : 'Desvincular'}
                            </button>
                        </div>
                    )}
                    
                    {error && <p className="text-red-400 text-sm">{error}</p>}
                </div>
                
                <div className="shrink-0 w-48 h-48 bg-[#1e1e1e] border-2 border-dashed border-[#444] rounded-xl flex flex-col items-center justify-center p-2 text-center text-sm text-gray-500 overflow-hidden">
                    {status === 'connecting' && !qrCode && (
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                            <p>Generando QR...</p>
                        </div>
                    )}
                    {qrCode && status === 'connecting' && (
                        <img src={qrCode} alt="WhatsApp QR Code" className="w-full h-full object-contain bg-white rounded-lg p-2" />
                    )}
                    {status === 'connected' && (
                        <div className="flex flex-col items-center gap-2 text-green-500">
                            <CheckCircle2 className="w-10 h-10" />
                            <p className="font-medium">¡Listo!</p>
                        </div>
                    )}
                    {status === 'disconnected' && (
                        <p>Haz clic en "Iniciar Vinculación" para ver el código QR</p>
                    )}
                </div>
            </div>

            <hr className="border-[#333] my-6" />
            
            <div className="space-y-4">
                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-purple-400" /> Parámetros y Filtros de Inteligencia
                </h4>
                <p className="text-gray-400 text-xs">
                    Configura la sensibilidad del motor de cruce y la tolerancia del procesamiento heurístico de mensajes de WhatsApp.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    {/* Bypass Heuristico Control */}
                    <div className="bg-[#1e1e1e] border border-[#333] p-4 rounded-xl flex flex-col justify-between space-y-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-sm font-bold text-gray-200">Omitir Filtro Heurístico (Capa 1)</p>
                                <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                                    Si se activa, el bot ignorará las expresiones regulares locales de filtrado y enviará <strong>todos</strong> los mensajes recibidos directamente a la IA de Gemini para su clasificación. Útil para chats grupales más informales.
                                </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                                <input 
                                    type="checkbox" 
                                    className="sr-only peer"
                                    checked={bypassHeuristic}
                                    onChange={(e) => updateSettings(e.target.checked, matchTolerance)}
                                    disabled={savingSettings}
                                />
                                <div className="w-11 h-6 bg-[#333] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                            </label>
                        </div>
                        <div className="text-[10px] font-mono text-zinc-550">
                            {bypassHeuristic ? '🟢 ESTADO: Gemini clasifica el 100% de los mensajes' : '🔴 ESTADO: Se filtran mensajes sin intención comercial rígida'}
                        </div>
                    </div>

                    {/* Margen de Tolerancia Control */}
                    <div className="bg-[#1e1e1e] border border-[#333] p-4 rounded-xl flex flex-col justify-between space-y-3">
                        <div>
                            <div className="flex justify-between items-center">
                                <p className="text-sm font-bold text-gray-200">Tolerancia de Coincidencia de Precios (Spread)</p>
                                <span className="text-xs font-mono font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                                    {(matchTolerance * 100).toFixed(0)}%
                                </span>
                            </div>
                            <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed font-sans">
                                Controla la diferencia de precio permitida para sugerir un cruce automático. Al 0%, solo se emparejan ofertas y demandas rentables (precio comprador &ge; precio vendedor). Al 15% o más, permite cruces más flexibles que requieran negociación.
                              </p>
                        </div>
                        <div className="space-y-1.5 font-sans">
                            <input 
                                type="range" 
                                min="0" 
                                max="0.3" 
                                step="0.05"
                                value={matchTolerance}
                                onChange={(e) => updateSettings(bypassHeuristic, Number(e.target.value))}
                                disabled={savingSettings}
                                className="w-full h-1.5 bg-[#333] rounded-lg appearance-none cursor-pointer accent-purple-600 focus:outline-none"
                            />
                            <div className="flex justify-between text-[9px] text-gray-550 font-mono">
                                <span>0% (Solo Rentables)</span>
                                <span>15% (Por Defecto)</span>
                                <span>30% (Flexibilidad Alta)</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
