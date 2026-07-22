import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Briefcase, LogOut, X, Layers } from 'lucide-react';
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
    { name: 'Mesa Operativa', path: '/operaciones', icon: Layers },
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
          "bg-[#1e1e1e] border-r border-[#333] flex flex-col h-screen fixed left-0 top-0 z-50 transition-all duration-350 ease-in-out pb-safe",
          sidebarOpen ? "translate-x-0 w-64" : "-translate-x-full lg:translate-x-0",
          isExpanded ? "w-64 shadow-2xl shadow-black/90 border-r border-green-500/20" : "lg:w-20 shadow-none"
        )}
      >
        <div className={cn("flex flex-col h-full transition-all duration-350", isExpanded ? "p-6" : "px-3 py-6")}>
          <div className="flex items-center justify-between mb-8">
            <div className={cn("flex items-center gap-3 w-full", isExpanded ? "justify-start" : "justify-center")}>
              <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center shrink-0">
                <Briefcase className="w-5 h-5 text-white" />
              </div>
              {isExpanded && <span className="text-xl font-bold text-white tracking-tight whitespace-nowrap">AgroSys</span>}
            </div>
            
            {/* Close Mobile Button */}
            <button 
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              title="Cerrar menú"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <nav className="space-y-1.5 flex-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center rounded-lg transition-colors text-sm font-medium',
                  isExpanded ? 'px-3 py-2.5 gap-3 justify-start' : 'p-2.5 justify-center',
                  location.pathname === item.path
                    ? 'bg-green-600/10 text-green-500'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                )}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {isExpanded && <span className="whitespace-nowrap">{item.name}</span>}
                {item.badge !== undefined && isExpanded && (
                  <span className="ml-auto bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>
          
          <div className="mt-auto pt-6 border-t border-[#333]">
             <button
              onClick={logout}
              className={cn(
                'flex items-center rounded-lg text-sm font-medium text-gray-400 hover:bg-red-500/10 hover:text-red-500 transition-colors w-full',
                isExpanded ? 'px-3 py-2.5 gap-3 justify-start' : 'p-2.5 justify-center'
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
