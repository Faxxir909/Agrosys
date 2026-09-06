import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomNav } from './BottomNav';
import { useUI } from '../contexts/UIContext';
import { cn } from '../lib/utils';

export function Layout() {
  const { sidebarHovered } = useUI();

  return (
    <div className="min-h-[100dvh] w-full max-w-full min-w-0 overflow-x-hidden bg-[#121212] text-white flex">
      <Sidebar />
      <div 
        className={cn(
          "flex-1 flex flex-col min-h-[100dvh] w-full max-w-full min-w-0 overflow-x-hidden transition-all duration-350 ease-in-out",
          sidebarHovered ? "lg:pl-64" : "lg:pl-20"
        )}
      >
        <Topbar />
        <main className="mobile-content-safe flex-1 p-3.5 sm:p-6 lg:p-8 overflow-x-hidden overflow-y-auto w-full max-w-full min-w-0">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}

