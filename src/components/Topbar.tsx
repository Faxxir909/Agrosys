import { useState } from 'react';
import { Search, Menu, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useUI } from '../contexts/UIContext';
import { useAuth } from '../contexts/AuthContext';
import { NotificationsDropdown } from './NotificationsDropdown';

export function Topbar() {
  const location = useLocation();
  const { searchQuery, setSearchQuery, sidebarOpen, setSidebarOpen } = useUI();
  const { user } = useAuth();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const getBreadcrumbs = () => {
    switch (location.pathname) {
      case '/': return 'Dashboard';
      case '/clientes': return 'CRM Clientes';
      case '/oportunidades': return 'Oportunidades';
      case '/logistica': return 'Logística';
      case '/documentos': return 'Documentos';
      case '/inteligencia': return 'Reportes';
      default: return 'Terminal';
    }
  };

  return (
    <header className="min-h-14 sm:h-16 bg-[#181818]/90 backdrop-blur-md border-b border-[#2d2d2d] flex items-center justify-between px-3.5 sm:px-6 lg:px-8 sticky top-0 z-30 w-full min-w-0 pt-[env(safe-area-inset-top)] sm:pt-0 transition-all duration-300">
      {/* Mobile Search Overlay */}
      {mobileSearchOpen ? (
        <div className="flex items-center gap-2 w-full animate-fade-in md:hidden py-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input 
              type="search" 
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar productores, granos, localidades..." 
              className="w-full bg-[#242424] border border-green-500/60 rounded-full py-2 pl-10 pr-8 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-green-500/50 shadow-inner"
            />
            {searchQuery && (
              <button 
                type="button" 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-1 text-xs"
              >
                ✕
              </button>
            )}
          </div>
          <button
            onClick={() => {
              setMobileSearchOpen(false);
              setSearchQuery('');
            }}
            className="w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-white bg-zinc-800/80 hover:bg-zinc-800 rounded-full shrink-0 transition-colors"
            title="Cerrar búsqueda"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
            {/* Toggle Menú Mobile */}
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/5 active:scale-95 rounded-xl transition-all shrink-0 border border-transparent hover:border-zinc-800"
              title="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumb con badge */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="text-gray-200 font-bold text-xs sm:text-sm truncate flex items-center gap-1.5">
                <span className="hidden sm:inline text-zinc-500 font-normal">AgroSys / </span>
                <span className="text-white tracking-tight">{getBreadcrumbs()}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Live Indicator Pill on Desktop */}
            <div className="hidden xl:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/30 border border-emerald-500/20 text-[11px] text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Mercado En Línea</span>
            </div>

            {/* Mobile Search Trigger Button */}
            <button
              onClick={() => setMobileSearchOpen(true)}
              className="md:hidden w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/5 active:scale-95 rounded-full transition-all"
              title="Buscar"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Desktop Search Input with Shortcut Hint */}
            <div className="relative hidden md:block group">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-green-400 transition-colors" />
              <input 
                type="search" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar productores o granos..." 
                className="bg-[#222222] border border-[#383838] focus:border-green-500/60 rounded-full py-1.5 pl-10 pr-12 text-xs text-white placeholder-zinc-500 focus:outline-none transition-all w-48 lg:w-64 focus:w-72 shadow-inner"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-mono font-bold text-zinc-400 bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-700/60 pointer-events-none">
                /
              </span>
            </div>

            <NotificationsDropdown />

            {/* User Profile Pill */}
            <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-[#333]">
              <div 
                className="w-8 h-8 rounded-full bg-gradient-to-tr from-green-700 to-emerald-500 flex items-center justify-center text-xs font-black text-white shadow-md ring-2 ring-zinc-800 select-none cursor-pointer"
                title={user?.email || 'Usuario'}
              >
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
