import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { socket } from '../lib/socket';

export interface WhatsAppAlert {
  id: string;
  rawMessage: string;
  sourceGroup: string;
  senderPhone: string;
  suggestedType?: 'oferta' | 'demanda' | 'desconocido';
  suggestedCropType?: string;
  suggestedQuantity?: number;
  suggestedPrice?: number | null;
  suggestedQuantityUnit?: string;
  suggestedPriceUnit?: string;
  originalQuantity?: number | null;
  originalPrice?: number | null;
  location?: string | null;
  status: 'nueva' | 'procesada' | 'descartada';
  ownerId: string;
  createdAt: Date;
  clientId?: string | null;
  esProspecto?: boolean;
  paymentTerms?: string | null;
  grainQuality?: string | null;
}

const parseDate = (d: any) => d ? new Date(d) : null;

export function useWhatsAppAlerts() {
  const [alerts, setAlerts] = useState<WhatsAppAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    let active = true;

    const fetchAlerts = async () => {
      try {
        const data = await api.whatsappAlerts.list();
        if (active) {
          const parsed = data.map((a: any) => ({
            ...a,
            createdAt: parseDate(a.createdAt) || new Date()
          }));
          parsed.sort((x: any, y: any) => y.createdAt.getTime() - x.createdAt.getTime());
          setAlerts(parsed);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching whatsapp alerts:', err);
      }
    };

    fetchAlerts();
    socket.on('whatsapp-alerts', fetchAlerts);
    socket.on('connect', fetchAlerts);

    const interval = setInterval(() => {
      if (!socket.connected) {
        fetchAlerts();
      }
    }, 20000);

    return () => {
      active = false;
      socket.off('whatsapp-alerts', fetchAlerts);
      socket.off('connect', fetchAlerts);
      clearInterval(interval);
    };
  }, [user]);

  return { alerts, setAlerts, loading };
}
