import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Briefcase, LogOut, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useWhatsAppAlerts } from '../hooks/useWhatsAppAlerts';
import { useUI } from '../contexts/UIContext';

export function Sidebar() {
  const location = useLocation();
  const { logout } = useAuth();
  const { alerts } = useWhatsAppAlerts();
  const { sidebarOpen, setSidebarOpen, sidebarHovered, setSidebarHovered } = useUI();

  const newAlertsCount = alerts.filter(a => a.status === 'nueva').length;

  const isExpanded = sidebarHovered || sidebarOpen;

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Oportunidades', path: '/oportunidades', icon: Briefcase, badge: newAlertsCount > 0 ? newAlertsCount : undefined },
    { name: 'CRM y Clientes', path: '/clientes', icon: Users },
  ];

  return (
    <>
      {/* Backdrop for Mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside 
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
        className={cn(
          "bg-[#161616]/95 backdrop-blur-xl border-r border-[#2d2d2d] flex flex-col h-[100dvh] max-w-[85vw] fixed left-0 top-0 z-50 transition-all duration-300 ease-out pb-safe pt-[env(safe-area-inset-top)] lg:pt-0",
          sidebarOpen ? "translate-x-0 w-64 shadow-2xl shadow-black/80" : "-translate-x-full lg:translate-x-0",
          isExpanded ? "w-64 shadow-2xl shadow-black/90 border-r border-green-500/25" : "lg:w-20 shadow-none"
        )}
      >
        <div className={cn("flex flex-col h-full transition-all duration-300", isExpanded ? "p-5" : "px-2.5 py-6")}>
          <div className="flex items-center justify-between mb-7">
            <div className={cn("flex items-center gap-3 w-full", isExpanded ? "justify-start" : "justify-center")}>
              <div className="w-9 h-9 bg-gradient-to-tr from-green-700 via-emerald-600 to-green-500 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-green-950/40 border border-green-400/30">
                <Briefcase className="w-5 h-5 text-white stroke-[2.2]" />
              </div>
              {isExpanded && (
                <div className="flex flex-col min-w-0">
                  <span className="text-lg font-black text-white tracking-tight leading-tight whitespace-nowrap">AgroSys</span>
                  <span className="text-[10px] font-mono font-medium text-emerald-400/90 uppercase tracking-wider">Trading Desk</span>
                </div>
              )}
            </div>
            
            {/* Close Mobile Button */}
            <button 
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-white rounded-xl hover:bg-white/5 active:scale-95 transition-all"
              title="Cerrar menú"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="space-y-2 flex-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  title={!isExpanded ? item.name : undefined}
                  className={cn(
                    'flex items-center rounded-xl transition-all duration-200 text-xs sm:text-sm font-bold relative group select-none',
                    isExpanded ? 'min-h-[46px] px-3.5 py-2.5 gap-3 justify-start' : 'min-h-[46px] p-2.5 justify-center',
                    isActive
                      ? 'bg-gradient-to-r from-green-500/15 to-emerald-500/5 text-green-400 border border-green-500/25 shadow-sm'
                      : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200 border border-transparent'
                  )}
                >
                  <item.icon className={cn("w-5 h-5 shrink-0 transition-transform duration-200", isActive ? "scale-110 text-green-400" : "group-hover:scale-105")} />
                  {isExpanded && <span className="whitespace-nowrap tracking-tight">{item.name}</span>}
                  {item.badge !== undefined && (
                    <span className={cn(
                      "bg-purple-600 text-white font-mono text-[10px] font-black rounded-full animate-pulse ring-2 ring-[#161616]",
                      isExpanded ? "ml-auto px-2 py-0.5" : "absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center text-[9px]"
                    )}>
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          
          <div className="mt-auto pt-4 border-t border-[#2d2d2d]">
             <button
              onClick={logout}
              title={!isExpanded ? "Cerrar Sesión" : undefined}
              className={cn(
                'flex items-center rounded-xl text-xs sm:text-sm font-semibold text-zinc-400 hover:bg-red-500/10 hover:text-red-400 transition-colors w-full cursor-pointer',
                isExpanded ? 'min-h-[44px] px-3.5 py-2.5 gap-3 justify-start' : 'min-h-[44px] p-2.5 justify-center'
              )}
            >
              <LogOut className="w-5 h-5 shrink-0" />
              {isExpanded && <span className="whitespace-nowrap">Cerrar Sesión</span>}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
