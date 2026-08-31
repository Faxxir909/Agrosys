import React, { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePlantedAreas } from '../hooks/usePlantedAreas';
import { api } from '../lib/api';

export function PlantedAreasModal({ clientId, clientName, onClose }: { clientId: string; clientName: string; onClose: () => void }) {
  const { areas, loading } = usePlantedAreas(clientId);
  const { user } = useAuth();
  
  const [formData, setFormData] = useState({
    cropType: 'soja',
    campaign: '24-25',
    area_ha: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await api.plantedAreas.create(clientId, {
        cropType: formData.cropType,
        campaign: formData.campaign,
        area_ha: Number(formData.area_ha),
      });
      setFormData(prev => ({ ...prev, area_ha: '' }));
    } catch (error) {
       console.error('Error registering hectares:', error);
    }
  };

  const deleteArea = async (id: string) => {
    try {
       await api.plantedAreas.delete(clientId, id);
    } catch (error) {
       console.error('Error deleting hectares:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in font-sans">
      <div className="bg-[#1e1e1e] border border-[#333] rounded-t-3xl sm:rounded-2xl w-full max-w-2xl max-h-[92vh] sm:max-h-[90vh] flex flex-col shadow-2xl animate-slide-up sm:animate-scale-up pb-safe sm:pb-0">
        {/* Mobile Grab Bar */}
        <div className="sm:hidden pt-3 pb-1 flex justify-center bg-[#1e1e1e]">
          <div className="w-12 h-1 bg-zinc-600 rounded-full" />
        </div>

        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-[#333]">
          <div className="min-w-0">
            <h2 className="text-base sm:text-xl font-bold text-white truncate">Registro de Hectáreas</h2>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5 truncate">{clientName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1.5 sm:p-2 rounded-lg hover:bg-white/5 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 sm:p-6 overflow-y-auto">
          <form onSubmit={handleSubmit} className="flex gap-4 items-end mb-8 bg-[#252525] p-5 rounded-2xl border border-[#444]">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Grano</label>
              <select value={formData.cropType} onChange={e => setFormData({...formData, cropType: e.target.value})} className="w-full bg-[#1e1e1e] border border-[#444] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-green-500 text-sm transition-colors">
                <option value="soja">Soja</option>
                <option value="maiz">Maíz</option>
                <option value="trigo">Trigo</option>
                <option value="sorgo">Sorgo</option>
                <option value="girasol">Girasol</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Campaña</label>
              <input value={formData.campaign} onChange={e => setFormData({...formData, campaign: e.target.value})} placeholder="Ej: 24-25" required className="w-full bg-[#1e1e1e] border border-[#444] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-green-500 text-sm transition-colors" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Hectáreas</label>
              <input type="number" min="1" value={formData.area_ha} onChange={e => setFormData({...formData, area_ha: e.target.value})} placeholder="0" required className="w-full bg-[#1e1e1e] border border-[#444] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-green-500 text-sm transition-colors" />
            </div>
            <button type="submit" className="bg-green-600 hover:bg-green-700 text-white p-3 rounded-xl transition-colors shadow-sm">
               <Plus className="w-5 h-5" />
            </button>
          </form>

          {loading ? (
            <div className="text-center text-sm text-gray-500 py-8 animate-pulse">Cargando...</div>
          ) : (
            <div className="space-y-3">
              {areas.length === 0 ? (
                <div className="text-center text-sm text-gray-400 py-8 border border-dashed border-[#444] rounded-2xl">No hay hectáreas registradas para este cliente.</div>
              ) : areas.map(area => (
                <div key={area.id} className="flex items-center justify-between p-5 bg-[#252525] rounded-xl border border-[#444]">
                  <div className="flex gap-8 text-sm">
                     <div>
                       <div className="text-xs text-gray-500 mb-1">Grano</div>
                       <div className="font-medium capitalize text-white">{area.cropType}</div>
                     </div>
                     <div>
                       <div className="text-xs text-gray-500 mb-1">Campaña</div>
                       <div className="font-medium text-white">{area.campaign}</div>
                     </div>
                     <div>
                       <div className="text-xs text-gray-500 mb-1">Superficie</div>
                       <div className="font-bold text-green-400">{area.area_ha} ha</div>
                     </div>
                  </div>
                  <button onClick={() => deleteArea(area.id)} className="text-gray-400 hover:text-red-500 p-2.5 rounded-xl hover:bg-red-500/10 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
