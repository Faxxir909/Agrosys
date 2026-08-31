import React, { useState, useRef, useEffect } from 'react';
import { Bell, Calendar, Clock, ChevronRight } from 'lucide-react';
import { useClients } from '../hooks/useClients';
import { isPast, isToday, addDays, isBefore, differenceInDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

export function NotificationsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { clients } = useClients();
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const notifications = clients
    .filter(c => c.nextContactDate)
    .map(client => {
      const date = client.nextContactDate!;
      const daysDiff = differenceInDays(date, new Date());
      let type: 'overdue' | 'today' | 'upcoming' | null = null;

      if (isPast(date) && !isToday(date)) {
        type = 'overdue';
      } else if (isToday(date)) {
        type = 'today';
      } else if (isBefore(date, addDays(new Date(), 7))) {
        type = 'upcoming';
      }

      return { client, date, daysDiff, type };
    })
    .filter(n => n.type !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const unreadCount = notifications.length;

  return (
    <div className="relative" ref={dropdownRef}>
      <div 
        className="relative cursor-pointer hover:bg-white/5 p-2 rounded-full transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Bell className="w-5 h-5 text-gray-400" />
        {unreadCount > 0 && (
          <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        )}
      </div>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] max-w-xs sm:w-80 bg-[#1e1e1e] border border-[#333] rounded-xl shadow-2xl z-50 overflow-hidden animate-scale-up">
          <div className="p-4 border-b border-[#333] flex justify-between items-center bg-[#252525]">
            <h3 className="font-medium text-white">Notificaciones</h3>
            <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-medium">
              {unreadCount}
            </span>
          </div>
          
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500 flex flex-col items-center">
                <Bell className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-sm">No hay notificaciones pendientes</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {notifications.map(({ client, date, type, daysDiff }, idx) => (
                  <div 
                    key={`${client.id}-${idx}`}
                    className="p-4 border-b border-[#333] hover:bg-[#2a2a2a] transition-colors cursor-pointer group flex items-start gap-3"
                    onClick={() => {
                      setIsOpen(false);
                      // Omit navigation to client details for now, just close. 
                      // Real app might navigate and select the client, but that needs state lifting.
                      navigate('/clientes');
                    }}
                  >
                    <div className={`p-2 rounded-full mt-1 shrink-0 ${
                      type === 'overdue' ? 'bg-red-500/10 text-red-500' :
                      type === 'today' ? 'bg-yellow-500/10 text-yellow-500' :
                      'bg-blue-500/10 text-blue-500'
                    }`}>
                      {type === 'overdue' ? <Clock className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 mb-1">
                        Contactar a <span className="font-medium text-white">{client.name}</span>
                      </p>
                      <p className={`text-xs ${
                        type === 'overdue' ? 'text-red-400 font-medium' :
                        type === 'today' ? 'text-yellow-400 font-medium' :
                        'text-blue-400'
                      }`}>
                        {type === 'overdue' ? `Atrasado (${Math.abs(daysDiff)} días)` :
                         type === 'today' ? 'Para hoy' :
                         `En ${daysDiff} días (${format(date, 'dd/MM', { locale: es })})`}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 mt-2 shrink-0 transition-colors" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
