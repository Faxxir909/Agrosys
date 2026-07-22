import { Search, Bell, Menu } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useUI } from '../contexts/UIContext';
import { useAuth } from '../contexts/AuthContext';
import { NotificationsDropdown } from './NotificationsDropdown';

export function Topbar() {
  const location = useLocation();
  const { searchQuery, setSearchQuery, sidebarOpen, setSidebarOpen } = useUI();
  const { user } = useAuth();

  const getBreadcrumbs = () => {
    switch (location.pathname) {
      case '/': return 'Terminal / Dashboard';
      case '/operaciones': return 'Operaciones / Pipeline';
      case '/clientes': return 'CRM / Directorio';
      case '/oportunidades': return 'Inteligencia / Oportunidades';
      case '/logistica': return 'Operaciones / Logística';
      case '/documentos': return 'Administración / Documentos';
      case '/inteligencia': return 'Análisis / Reportes';
      default: return 'Terminal';
    }
  };

  return (
    <header className="h-16 bg-[#1e1e1e] border-b border-[#333] flex items-center justify-between px-4 sm:px-6 lg:px-8 sticky top-0 z-30 w-full transition-all duration-350">
      <div className="flex items-center gap-3">
        {/* Toggle Menú Mobile */}
        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="lg:hidden p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          title="Abrir menú"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="text-gray-400 font-medium text-xs sm:text-sm truncate">
          {getBreadcrumbs()}
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-6">
        <div className="relative hidden md:block">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="search" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar..." 
            className="bg-[#252525] border border-[#444] rounded-full py-1.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-green-500 transition-colors w-48 lg:w-64"
          />
        </div>
        <NotificationsDropdown />
        <div className="flex items-center gap-3 pl-3 sm:pl-6 border-l border-[#333]">
           <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-sm font-bold text-white shadow-lg">
             {user?.email?.charAt(0).toUpperCase() || 'U'}
           </div>
        </div>
      </div>
    </header>
  );
}
