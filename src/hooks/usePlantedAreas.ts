import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

export interface PlantedArea {
  id: string;
  clientId: string;
  cropType: string;
  campaign: string;
  area_ha: number;
  ownerId: string;
}

export function usePlantedAreas(clientId?: string) {
  const [areas, setAreas] = useState<PlantedArea[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user || !clientId) {
      setAreas([]);
      setLoading(false);
      return;
    }

    let active = true;

    const fetchAreas = async () => {
      try {
        const data = await api.plantedAreas.list(clientId);
        if (active) {
          setAreas(data);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching planted areas:', err);
      }
    };

    fetchAreas();
    const interval = setInterval(fetchAreas, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [user, clientId]);

  return { areas, loading, setAreas };
}
