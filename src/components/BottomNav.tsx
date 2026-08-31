import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Briefcase } from 'lucide-react';
import { useWhatsAppAlerts } from '../hooks/useWhatsAppAlerts';
import { cn } from '../lib/utils';

export function BottomNav() {
  const location = useLocation();
  const { alerts } = useWhatsAppAlerts();
  const newAlertsCount = alerts.filter(a => a.status === 'nueva').length;

  const navItems = [
    { 
      name: 'Dashboard', 
      path: '/', 
      icon: LayoutDashboard,
      activeColor: 'text-green-400' 
    },
    { 
      name: 'Oportunidades', 
      path: '/oportunidades', 
      icon: Briefcase,
      badge: newAlertsCount > 0 ? newAlertsCount : undefined,
      activeColor: 'text-amber-400' 
    },
    { 
      name: 'CRM Clientes', 
      path: '/clientes', 
      icon: Users,
      activeColor: 'text-blue-400' 
    },
  ];

  return (
    <nav 
      aria-label="Navegación Móvil"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#181818]/95 backdrop-blur-xl border-t border-[#333] px-3 py-2 pb-safe shadow-2xl"
    >
      <div className="flex items-center justify-around max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center flex-1 py-1.5 px-2 rounded-xl transition-all duration-200 relative group active:scale-95",
                isActive 
                  ? "text-white font-bold" 
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              {/* Active pill background */}
              {isActive && (
                <span className="absolute inset-x-3 inset-y-0.5 bg-white/5 rounded-xl border border-white/10 -z-10 animate-scale-up" />
              )}

              <div className="relative">
                <Icon className={cn(
                  "w-5 h-5 transition-transform duration-200", 
                  isActive ? cn(item.activeColor, "scale-110") : "text-zinc-400"
                )} />
                {item.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2.5 bg-purple-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full ring-2 ring-[#181818] animate-pulse">
                    {item.badge}
                  </span>
                )}
              </div>

              <span className={cn(
                "text-[10px] mt-1 tracking-tight transition-colors whitespace-nowrap",
                isActive ? item.activeColor : "text-zinc-400"
              )}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
