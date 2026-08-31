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
    <header className="h-14 sm:h-16 bg-[#1e1e1e] border-b border-[#333] flex items-center justify-between px-3 sm:px-6 lg:px-8 sticky top-0 z-30 w-full transition-all duration-350">
      {/* Mobile Search Overlay */}
      {mobileSearchOpen ? (
        <div className="flex items-center gap-2 w-full animate-fade-in md:hidden">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="search" 
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar productores, granos..." 
              className="w-full bg-[#252525] border border-green-500/50 rounded-full py-1.5 pl-9 pr-4 text-xs text-white focus:outline-none"
            />
          </div>
          <button
            onClick={() => {
              setMobileSearchOpen(false);
              setSearchQuery('');
            }}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg"
            title="Cerrar búsqueda"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Toggle Menú Mobile */}
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors shrink-0"
              title="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="text-gray-300 font-bold text-xs sm:text-sm truncate">
              <span className="hidden sm:inline text-zinc-500 font-normal">AgroSys / </span>
              {getBreadcrumbs()}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Mobile Search Trigger Button */}
            <button
              onClick={() => setMobileSearchOpen(true)}
              className="md:hidden p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-colors"
              title="Buscar"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Desktop Search Input */}
            <div className="relative hidden md:block">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="search" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar..." 
                className="bg-[#252525] border border-[#444] rounded-full py-1.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-green-500 transition-colors w-44 lg:w-60"
              />
            </div>

            <NotificationsDropdown />

            <div className="flex items-center gap-2 pl-2 sm:pl-4 border-l border-[#333]">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-green-600 flex items-center justify-center text-xs sm:text-sm font-bold text-white shadow-lg">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
