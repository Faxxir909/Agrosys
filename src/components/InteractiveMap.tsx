import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { useClients } from '../hooks/useClients';
import { useOpportunities } from '../hooks/useOpportunities';
import { MapPin, Filter, Layers, Compass, Focus } from 'lucide-react';

// Coordinates lookup for major Argentine grain/farming hub zones
const ZONAS_COORDINATES: Record<string, [number, number]> = {
  rosario: [-32.9468, -60.6393],
  'san lorenzo': [-32.7481, -60.7328],
  pergamino: [-33.8914, -60.5735],
  casilda: [-33.0442, -61.1681],
  'venado tuerto': [-33.7458, -61.9688],
  rojas: [-34.1950, -60.7340],
  balcarce: [-37.8475, -58.2616],
  tandil: [-37.3217, -59.1332],
  junin: [-34.5850, -60.9489],
  chivilcoy: [-34.8981, -60.0183],
  pehuajo: [-35.8118, -61.8967],
  'tres arroyos': [-38.3739, -60.2798],
  'bahia blanca': [-38.7183, -62.2664],
  'general pico': [-35.6566, -63.7568],
  'rio cuarto': [-33.1232, -64.3492],
  'marcos juarez': [-32.6976, -61.8302],
  necochea: [-38.5545, -58.7397],
  buenosaires: [-34.5997, -58.3704],
  quequen: [-38.5411, -58.7139],
  dover: [51.1279, 1.3134] // template safe fallback
};

// LocalStorage caching helpers for high-precision geocoding
const COORDS_CACHE_KEY = 'agrosys_coordinates_cache_v2';

function getCachedCoords(): Record<string, [number, number]> {
  try {
    const cached = localStorage.getItem(COORDS_CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch (e) {
    return {};
  }
}

function saveCachedCoords(cache: Record<string, [number, number]>) {
  try {
    localStorage.setItem(COORDS_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {}
}

// Returns latitude and longitude dynamically by reading named zone/location strings or generating realistic determinist offsets
function getCoordinates(locationName?: string, seedString?: string): [number, number] {
  if (!locationName) {
    // Return a random-looking but deterministic offset centered around the Rosario hub core zone
    const hash = seedString ? seedString.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : Math.random() * 100;
    const latOffset = ((hash % 15) - 7.5) * 0.09;
    const lngOffset = ((hash % 23) - 11.5) * 0.09;
    return [-32.9468 + latOffset, -60.6393 + lngOffset];
  }

  const cleanName = locationName.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  // 1. Try our high-precision geocoding cache first
  const cache = getCachedCoords();
  if (cache[cleanName]) {
    return cache[cleanName];
  }

  // 2. Try direct matches or substring searches in our coordinates lookup
  for (const [key, coords] of Object.entries(ZONAS_COORDINATES)) {
    if (cleanName.includes(key) || key.includes(cleanName)) {
      return coords;
    }
  }

  // 3. Generate deterministic coordinates if specific zone is not in lookup or cache yet
  const hash = cleanName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const latOffset = ((hash % 20) - 10) * 0.07;
  const lngOffset = ((hash % 30) - 15) * 0.07;
  return [-33.5 + latOffset, -61.0 + lngOffset];
}

// Gorgeous raw SVG marker templates encoded directly
const CLIENT_SVG = `
  <svg class="w-8 h-8 filter drop-shadow" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 21C16 16.8 19 13.1 19 9.5C19 5.4 15.9 2.2 12 2.2C8.1 2.2 5 5.4 5 9.5C5 13.1 8 16.8 12 21Z" fill="#3b82f6" stroke="#ffffff" stroke-width="1.5"/>
    <circle cx="12" cy="9.5" r="3.5" fill="#1e1e1e"/>
    <circle cx="12" cy="9.5" r="1.8" fill="#3b82f6"/>
  </svg>
`;

const OFERTA_SVG = `
  <svg class="w-8 h-8 filter drop-shadow animate-pulse" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 21C16 16.8 19 13.1 19 9.5C19 5.4 15.9 2.2 12 2.2C8.1 2.2 5 5.4 5 9.5C5 13.1 8 16.8 12 21Z" fill="#10b981" stroke="#ffffff" stroke-width="1.5"/>
    <circle cx="12" cy="9.5" r="4" fill="#1e1e1e"/>
    <path d="M10.5 7.5L13.5 10.5M13.5 7.5L10.5 10.5" stroke="#10b981" stroke-width="1.5" stroke-linecap="round"/>
  </svg>
`;

const DEMANDA_SVG = `
  <svg class="w-8 h-8 filter drop-shadow" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 21C16 16.8 19 13.1 19 9.5C19 5.4 15.9 2.2 12 2.2C8.1 2.2 5 5.4 5 9.5C5 13.1 8 16.8 12 21Z" fill="#ec4899" stroke="#ffffff" stroke-width="1.5"/>
    <circle cx="12" cy="9.5" r="4" fill="#1e1e1e"/>
    <circle cx="12" cy="9.5" r="2.2" fill="#ec4899"/>
  </svg>
`;

export function InteractiveMap() {
  const { clients } = useClients();
  const { opportunities } = useOpportunities();
  
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  const [activeFilter, setActiveFilter] = useState<'all' | 'clients' | 'offers' | 'demands'>('all');
  const [mapCenter, setMapCenter] = useState<[number, number]>([-33.8914, -60.5735]); // Pergamino center default
  const [cacheVersion, setCacheVersion] = useState(0);

  // Dynamic geocoding of new zones/cities in the background using OSM Nominatim to obtain highest precision
  useEffect(() => {
    if (clients.length === 0 && opportunities.length === 0) return;

    const rawLocations = [
      ...clients.map(c => c.zona).filter(Boolean),
      ...opportunities.map(o => o.location).filter(Boolean)
    ];

    const uniqueCleanNames = Array.from(new Set(
      rawLocations.map(name => name.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
    ));

    const cache = getCachedCoords();
    const namesToFetch = uniqueCleanNames.filter(name => {
      if (!name) return false;
      if (cache[name]) return false;
      
      // Also check if matches any ZONAS_COORDINATES key directly
      for (const key of Object.keys(ZONAS_COORDINATES)) {
        if (name.includes(key) || key.includes(name)) {
          return false;
        }
      }
      return true;
    });

    if (namesToFetch.length === 0) return;

    let isMounted = true;
    const fetchAll = async () => {
      const newCoords: Record<string, [number, number]> = {};
      const currentCache = getCachedCoords();

      for (const name of namesToFetch) {
        if (!isMounted) break;
        try {
          // Force search in Argentina to get precise local coordinates for agricultural hubs
          const query = name.includes('argentina') ? name : `${name}, argentina`;
          const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
          
          const response = await fetch(url, {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'AgroSysMapGeocoder/2.0'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data && data.length > 0) {
              const lat = parseFloat(data[0].lat);
              const lon = parseFloat(data[0].lon);
              newCoords[name] = [lat, lon];
              console.log(`Geocoded region successfully: "${name}" ->`, [lat, lon]);
            }
          }
          // Simple delay of 600ms to be extremely polite to OSM Nominatim API
          await new Promise(resolve => setTimeout(resolve, 600));
        } catch (err) {
          console.error(`Error during geocoding for "${name}":`, err);
        }
      }

      if (Object.keys(newCoords).length > 0 && isMounted) {
        const updatedCache = { ...currentCache, ...newCoords };
        saveCachedCoords(updatedCache);
        setCacheVersion(v => v + 1);
      }
    };

    fetchAll();

    return () => {
      isMounted = false;
    };
  }, [clients, opportunities]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Create the Leaflet map instance centered near agricultural nucleus
    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false
    }).setView([-33.5, -60.8], 7);

    mapRef.current = map;

    // Dark-themed OpenStreetMap tiles (no API key required, no watermarks)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      minZoom: 4,
      className: 'dark-map-tiles'
    }).addTo(map);

    // Dynamic scale control styled cleanly
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
    
    // Add dynamic layer groups for flexible updates
    const markersGroup = L.layerGroup().addTo(map);
    markersRef.current = markersGroup;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update makers content whenever filter status, clients, or opportunities modify
  useEffect(() => {
    const map = mapRef.current;
    const markersGroup = markersRef.current;
    if (!map || !markersGroup) return;

    // Clear previous marker elements cleanly
    markersGroup.clearLayers();

    // Map and configure Clients
    if (activeFilter === 'all' || activeFilter === 'clients') {
      clients.forEach(client => {
        // Find zone coordinates or generate standard offset
        const coords = getCoordinates(client.zona, client.id);
        
        // Define Custom Divisional CSS-div icon to render pure SVG cleanly
        const clientIcon = L.divIcon({
          html: CLIENT_SVG,
          className: 'custom-leaflet-icon-wrapper',
          iconSize: [32, 32],
          iconAnchor: [16, 32],
          popupAnchor: [0, -32]
        });

        const latestContact = client.fechaUltimoContacto 
          ? `Último Contacto: ${client.fechaUltimoContacto}` 
          : 'Sin contacto formal registrado';

        const rawPopup = `
          <div class="p-2 space-y-2">
            <div class="flex items-center gap-1.5 border-b border-zinc-800 pb-1.5">
              <span class="text-sm">👤</span>
              <strong class="text-white font-black text-sm">${client.name}</strong>
            </div>
            <div class="space-y-1 text-xs text-zinc-300">
              <p class="capitalize">🔸 <span class="text-zinc-500 font-bold">Categoría:</span> ${client.categoria || 'Productor'}</p>
              <p>📍 <span class="text-zinc-500 font-bold">Zona:</span> ${client.zona || 'Sin especificar'}</p>
              <p class="font-mono text-[11px] text-[#ef4444] font-medium">📞 ${client.phone || 'Sin télefono'}</p>
              <p class="text-[10px] text-zinc-500 mt-1 italic">${latestContact}</p>
            </div>
            <div class="flex gap-1 pt-1">
              <span class="text-[10px] bg-zinc-800 border border-zinc-700 font-mono font-bold px-2 py-0.5 rounded-md text-zinc-400">
                ${client.tipoCliente || 'Prospecto'}
              </span>
              ${client.hectareasPropias ? `
                <span class="text-[10px] bg-indigo-950/40 border border-indigo-500/20 font-mono px-2 py-0.5 rounded-md text-indigo-400 font-semibold">
                  ${client.hectareasPropias} Has
                </span>
              ` : ''}
            </div>
          </div>
        `;

        L.marker(coords, { icon: clientIcon })
          .bindPopup(rawPopup)
          .addTo(markersGroup);
      });
    }

    // Map and configure Opportunities
    opportunities.forEach(opp => {
      const isOffer = opp.type === 'oferta';
      
      // Filter constraints
      if (activeFilter === 'offers' && !isOffer) return;
      if (activeFilter === 'demands' && isOffer) return;
      if (activeFilter === 'clients') return; // skip if clients only is selected

      const ownerClient = clients.find(c => c.id === opp.clientId);
      const clientName = ownerClient ? ownerClient.name : 'Productor Asociado';

      const coords = getCoordinates(opp.location, opp.id);

      const markerIcon = L.divIcon({
        html: isOffer ? OFERTA_SVG : DEMANDA_SVG,
        className: 'custom-leaflet-icon-wrapper',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
      });

      const formattedPrice = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' }).format(opp.price_usd);
      const totalEstimated = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(opp.price_usd * opp.quantity_tn);

      const rawPopup = `
        <div class="p-2 space-y-2">
          <div class="flex items-center justify-between border-b border-zinc-800 pb-1.5">
            <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${isOffer ? 'bg-green-500/15 text-green-400 border border-green-500/20' : 'bg-pink-500/15 text-pink-400 border border-pink-500/20'}">
              ${isOffer ? 'OFERTA (Venta)' : 'DEMANDA (Compra)'}
            </span>
            <span class="text-xs text-zinc-400 font-mono">🌾 ${opp.cropType.toUpperCase()}</span>
          </div>
          <div class="space-y-1 text-xs text-zinc-300">
            <p>👤 <span class="text-zinc-500 font-bold">Cliente:</span> <strong class="text-white">${clientName}</strong></p>
            <p>📍 <span class="text-zinc-500 font-bold">Origen/Planta:</span> ${opp.location || 'A convenir'}</p>
            <p>📊 <span class="text-zinc-500 font-bold">Cant:</span> <strong class="text-zinc-100 font-mono">${new Intl.NumberFormat('es-AR').format(opp.quantity_tn)} TN</strong></p>
            <p>💰 <span class="text-zinc-500 font-bold">Precio:</span> <strong class="text-amber-400 font-mono">${formattedPrice}/tn</strong></p>
          </div>
          <div class="bg-zinc-900/40 p-1.5 rounded-lg border border-zinc-800 text-center font-mono text-[11px] text-zinc-400">
            Valuada en <strong class="text-white">${totalEstimated}</strong>
          </div>
        </div>
      `;

      L.marker(coords, { icon: markerIcon })
        .bindPopup(rawPopup)
        .addTo(markersGroup);
    });

  }, [clients, opportunities, activeFilter, cacheVersion]);

  // Center focal zoom to Pergamino / Rosario
  const focusMainZone = () => {
    const map = mapRef.current;
    if (map) {
      map.flyTo([-33.5, -60.8], 7, { duration: 1.2 });
    }
  };

  return (
    <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl flex flex-col h-[360px] sm:h-[480px]">
      
      {/* Map Control Bar Panel */}
      <div className="bg-gradient-to-r from-[#212121] to-[#252525] border-b border-[#333] px-3.5 py-2.5 sm:px-5 sm:py-3.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <div className="p-1.5 sm:p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl shrink-0">
            <Compass className="w-4 h-4 text-blue-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-black text-white tracking-tight truncate flex items-center gap-1.5">
              Geolocalización Termal AgroSys
            </h3>
            <p className="text-[9px] sm:text-[10px] text-zinc-500 font-mono truncate">{clients.length} clientes · {opportunities.length} operaciones</p>
          </div>
        </div>

        {/* Filter Badges Control Row */}
        <div className="flex overflow-x-auto scrollbar-none items-center gap-1.5 pb-0.5 sm:pb-0">
          {[
            { id: 'all', label: 'Todo', color: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300' },
            { id: 'clients', label: 'Clientes', color: 'bg-blue-900/20 hover:bg-blue-900/35 border border-blue-500/20 text-blue-400' },
            { id: 'offers', label: 'Ventas', color: 'bg-green-900/20 hover:bg-green-900/35 border border-green-500/20 text-green-400' },
            { id: 'demands', label: 'Compras', color: 'bg-pink-900/20 hover:bg-pink-900/35 border border-pink-500/20 text-pink-400' }
          ].map(btn => (
            <button
              key={btn.id}
              onClick={() => setActiveFilter(btn.id as any)}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                activeFilter === btn.id
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-md border-none'
                  : btn.color
              }`}
            >
              {btn.label}
            </button>
          ))}
          
          <button
            onClick={focusMainZone}
            className="p-1 sm:p-1.5 bg-[#2a2a2a] hover:bg-[#343434] border border-zinc-700/60 rounded-xl text-zinc-400 hover:text-white transition-all cursor-pointer shrink-0"
            title="Centrar en Zona Núcleo"
          >
            <Focus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>

      </div>

      {/* Actual Map Node Container */}
      <div className="relative flex-1">
        <div ref={mapContainerRef} className="absolute inset-0 z-0 h-full w-full" />
        
        {/* Floating Mini Compass Legend Indicator (Desktop & Tablet) */}
        <div className="hidden sm:block absolute top-4 right-4 z-[400] bg-[#1a1a1a]/95 border border-[#333] p-3 rounded-2xl shadow-xl space-y-2 pointer-events-none backdrop-blur text-xs">
          <p className="font-bold text-white mb-1.5 flex items-center gap-1 border-b border-zinc-800 pb-1">
            <span>🗺️</span> Leyenda de Alertas
          </p>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 border border-white" />
            <span className="text-zinc-300">Cliente / Productor</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 border border-white animate-pulse" />
            <span className="text-zinc-300">Oferta Activa (Grano en Venta)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-pink-500 border border-white" />
            <span className="text-zinc-300">Demanda Activa (Comprador)</span>
          </div>
        </div>

        {/* Mobile Mini Legend Bar */}
        <div className="sm:hidden absolute bottom-2 left-2 right-2 z-[400] bg-[#1a1a1a]/90 backdrop-blur border border-[#333] px-2.5 py-1 rounded-xl shadow-lg flex items-center justify-around pointer-events-none text-[9px]">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-zinc-300 font-medium">Clientes</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-zinc-300 font-medium">Ventas</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-pink-500" />
            <span className="text-zinc-300 font-medium">Compras</span>
          </div>
        </div>
      </div>

    </div>
  );
}
