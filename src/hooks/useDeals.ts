import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { socket } from '../lib/socket';

export interface Deal {
  id: string;
  cropType: string;
  sellerId: string;
  buyerId: string;
  sellerName: string;
  buyerName: string;
  quantity_tn: number;
  price_seller: number;
  price_buyer: number;
  totalCommission: number;
  location?: string;
  ownerId: string;
  createdAt: Date;
}

const parseDate = (d: any) => d ? new Date(d) : null;

export function useDeals() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    let active = true;

    const fetchDeals = async () => {
      try {
        const data = await api.deals.list();
        if (active) {
          setDeals(data.map((d: any) => ({
            ...d,
            createdAt: parseDate(d.createdAt) || new Date()
          })));
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching deals:', err);
      }
    };

    fetchDeals();
    socket.on('deals', fetchDeals);

    const interval = setInterval(() => {
      if (!socket.connected) {
        fetchDeals();
      }
    }, 20000);

    return () => {
      active = false;
      socket.off('deals', fetchDeals);
      clearInterval(interval);
    };
  }, [user]);

  return { deals, loading, setDeals };
}
