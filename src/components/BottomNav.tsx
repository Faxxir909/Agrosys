import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Briefcase, Plus, X, ArrowUpRight, ArrowDownLeft, UserPlus, CalendarPlus, MessageSquare, ChevronRight } from 'lucide-react';
import { useWhatsAppAlerts } from '../hooks/useWhatsAppAlerts';
import { cn } from '../lib/utils';

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { alerts } = useWhatsAppAlerts();
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const newAlertsCount = alerts.filter(a => a.status === 'nueva').length;

  const handleAction = (route: string) => {
    setIsQuickActionsOpen(false);
    navigate(route);
  };

  return (
    <>
      {/* Native Quick Actions ActionSheet Modal for Mobile */}
      {isQuickActionsOpen && (
        <div 
          className="lg:hidden fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end justify-center animate-fade-in"
          onClick={() => setIsQuickActionsOpen(false)}
        >
          <div 
            className="w-full bg-[#1c1c1c] border-t border-[#333] rounded-t-3xl p-5 pb-safe max-h-[85vh] overflow-y-auto space-y-4 animate-slide-up shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grab handle indicator */}
            <div className="w-12 h-1.5 bg-zinc-700 rounded-full mx-auto mb-1" />

            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div>
                <h3 className="text-base font-extrabold text-white tracking-tight">Acciones Rápidas</h3>
                <p className="text-[11px] text-zinc-400">Crear y registrar operaciones en el CRM</p>
              </div>
              <button 
                onClick={() => setIsQuickActionsOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-full bg-zinc-800/60"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2.5 pt-1">
              {/* Nueva Oferta */}
              <button
                onClick={() => handleAction('/oportunidades')}
                className="w-full flex items-center justify-between p-3.5 bg-green-500/10 hover:bg-green-500/15 border border-green-500/20 rounded-2xl text-left transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-600/20 text-green-400 border border-green-500/30 flex items-center justify-center">
                    <ArrowUpRight className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-green-300">Publicar Oferta de Granos</p>
                    <p className="text-[10px] text-zinc-400">Cargar venta de productor al pipeline</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-green-500" />
              </button>

              {/* Nueva Demanda */}
              <button
                onClick={() => handleAction('/oportunidades')}
                className="w-full flex items-center justify-between p-3.5 bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/20 rounded-2xl text-left transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
                    <ArrowDownLeft className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-blue-300">Cargar Demanda de Granos</p>
                    <p className="text-[10px] text-zinc-400">Registrar compra de acopio o exportador</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-blue-500" />
              </button>

              {/* Nuevo Cliente */}
              <button
                onClick={() => handleAction('/clientes')}
                className="w-full flex items-center justify-between p-3.5 bg-zinc-850 hover:bg-zinc-800 border border-zinc-700/60 rounded-2xl text-left transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-200">Alta de Productor / Cliente</p>
                    <p className="text-[10px] text-zinc-400">Registrar nuevo socio en el CRM</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              </button>

              {/* Agendar Compromiso */}
              <button
                onClick={() => handleAction('/clientes')}
                className="w-full flex items-center justify-between p-3.5 bg-zinc-850 hover:bg-zinc-800 border border-zinc-700/60 rounded-2xl text-left transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-600/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                    <CalendarPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-200">Agendar Compromiso / Visita</p>
                    <p className="text-[10px] text-zinc-400">Planificar cobranza, siembra o visita de campo</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              </button>

              {/* Mensajes WhatsApp */}
              <button
                onClick={() => handleAction('/oportunidades')}
                className="w-full flex items-center justify-between p-3.5 bg-emerald-950/40 hover:bg-emerald-950/60 border border-emerald-500/25 rounded-2xl text-left transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-emerald-300">Alertas de WhatsApp</p>
                    <p className="text-[10px] text-zinc-400">Revisar mensajes de grupos recibidos</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-emerald-500" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Bottom Bar */}
      <nav 
        aria-label="Navegación Móvil"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#161616]/95 backdrop-blur-xl border-t border-[#2d2d2d] px-3 py-1.5 pb-safe shadow-2xl"
      >
        <div className="flex items-center justify-between max-w-md mx-auto">
          {/* Dashboard */}
          <Link
            to="/"
            className={cn(
              "flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all duration-200 relative active:scale-95",
              location.pathname === '/' ? "text-green-400 font-bold" : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            {location.pathname === '/' && (
              <span className="absolute inset-x-2 inset-y-0.5 bg-green-500/10 rounded-xl border border-green-500/20 -z-10 animate-scale-up" />
            )}
            <LayoutDashboard className={cn("w-5 h-5 transition-transform", location.pathname === '/' ? "scale-110 text-green-400" : "text-zinc-400")} />
            <span className="text-[10px] mt-1 tracking-tight">Terminal</span>
          </Link>

          {/* Oportunidades */}
          <Link
            to="/oportunidades"
            className={cn(
              "flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all duration-200 relative active:scale-95",
              location.pathname === '/oportunidades' ? "text-amber-400 font-bold" : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            {location.pathname === '/oportunidades' && (
              <span className="absolute inset-x-2 inset-y-0.5 bg-amber-500/10 rounded-xl border border-amber-500/20 -z-10 animate-scale-up" />
            )}
            <div className="relative">
              <Briefcase className={cn("w-5 h-5 transition-transform", location.pathname === '/oportunidades' ? "scale-110 text-amber-400" : "text-zinc-400")} />
              {newAlertsCount > 0 && (
                <span className="absolute -top-1.5 -right-2.5 bg-purple-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full ring-2 ring-[#161616] animate-pulse">
                  {newAlertsCount}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-1 tracking-tight">Negocios</span>
          </Link>

          {/* Central Quick Action Button (FAB) */}
          <div className="flex-1 flex justify-center items-center py-0.5">
            <button
              type="button"
              onClick={() => setIsQuickActionsOpen(true)}
              className="w-11 h-11 bg-gradient-to-tr from-green-600 via-emerald-500 to-green-400 text-black rounded-full flex items-center justify-center shadow-lg shadow-green-950/40 border border-green-300/40 active:scale-90 transition-transform cursor-pointer"
              title="Nueva Operación Rápida"
            >
              <Plus className="w-6 h-6 stroke-[2.5]" />
            </button>
          </div>

          {/* CRM Clientes */}
          <Link
            to="/clientes"
            className={cn(
              "flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all duration-200 relative active:scale-95",
              location.pathname === '/clientes' ? "text-blue-400 font-bold" : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            {location.pathname === '/clientes' && (
              <span className="absolute inset-x-2 inset-y-0.5 bg-blue-500/10 rounded-xl border border-blue-500/20 -z-10 animate-scale-up" />
            )}
            <Users className={cn("w-5 h-5 transition-transform", location.pathname === '/clientes' ? "scale-110 text-blue-400" : "text-zinc-400")} />
            <span className="text-[10px] mt-1 tracking-tight">Productores</span>
          </Link>
        </div>
      </nav>
    </>
  );
}
