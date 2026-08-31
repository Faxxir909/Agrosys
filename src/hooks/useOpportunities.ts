import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { socket } from '../lib/socket';

export interface Opportunity {
  id: string;
  type: 'oferta' | 'demanda';
  clientId: string;
  cropType: string;
  quantity_tn: number;
  price_usd: number;
  location?: string;
  status: 'abierta' | 'negociacion' | 'esperando_confirmacion' | 'ganada' | 'perdida' | 'vencida';
  deliveryDate?: Date | null;
  expiresAt?: Date | null;
  paymentTerms?: string;
  grainQuality?: string;
  priceMode?: 'fijo' | 'a_negociar';
  nextAction?: string;
  lostReason?: string;
  sourceAlertId?: string;
  ownerId: string;
  createdAt: Date;
  updatedAt?: Date | null;
}

const parseDate = (d: any) => d ? new Date(d) : null;

export function useOpportunities() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    let active = true;

    const fetchOpportunities = async () => {
      try {
        const data = await api.opportunities.list();
        if (active) {
          setOpportunities(data.map((o: any) => ({
            ...o,
            createdAt: parseDate(o.createdAt) || new Date(),
            updatedAt: parseDate(o.updatedAt),
            deliveryDate: parseDate(o.deliveryDate),
            expiresAt: parseDate(o.expiresAt)
          })));
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching opportunities:', err);
      }
    };

    fetchOpportunities();
    socket.on('opportunities', fetchOpportunities);

    const interval = setInterval(() => {
      if (!socket.connected) {
        fetchOpportunities();
      }
    }, 20000);

    return () => {
      active = false;
      socket.off('opportunities', fetchOpportunities);
      clearInterval(interval);
    };
  }, [user]);

  return { opportunities, loading, setOpportunities };
}
