import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { socket } from '../lib/socket';

export interface Client {
  id: string;
  name: string;
  type: string;
  phone?: string;
  email?: string;
  cuit?: string;
  status?: string;
  notes?: string;
  location?: { lat: number; lng: number; address: string };
  nextContactDate?: Date | null;
  lastContactDate?: Date | null;
  ownerId: string;
  createdAt: Date;
}

const parseDate = (d: any) => d ? new Date(d) : null;

export function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    let active = true;

    const fetchClients = async () => {
      try {
        const data = await api.clients.list();
        if (active) {
          setClients(data.map((c: any) => ({
            ...c,
            createdAt: parseDate(c.createdAt) || new Date(),
            nextContactDate: parseDate(c.nextContactDate),
            lastContactDate: parseDate(c.lastContactDate)
          })));
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching clients:', err);
      }
    };

    fetchClients();
    socket.on('clients', fetchClients);

    const interval = setInterval(() => {
      if (!socket.connected) {
        fetchClients();
      }
    }, 20000);

    return () => {
      active = false;
      socket.off('clients', fetchClients);
      clearInterval(interval);
    };
  }, [user]);

  return { clients, loading, setClients };
}
