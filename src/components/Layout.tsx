import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useUI } from '../contexts/UIContext';
import { cn } from '../lib/utils';

export function Layout() {
  const { sidebarHovered } = useUI();

  return (
    <div className="min-h-screen bg-[#121212] text-white flex">
      <Sidebar />
      <div 
        className={cn(
          "flex-1 flex flex-col min-h-screen transition-all duration-350 ease-in-out",
          sidebarHovered ? "lg:pl-64" : "lg:pl-20"
        )}
      >
        <Topbar />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
