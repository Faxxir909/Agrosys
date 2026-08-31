import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomNav } from './BottomNav';
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
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 pb-24 lg:pb-8 overflow-x-hidden overflow-y-auto w-full max-w-full">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}

