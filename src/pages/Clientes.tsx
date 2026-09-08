import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Plus, X, Search, FileDown, FileUp, Building2, MapPin, Target, Activity, Calendar, FileText, Settings2, Trash2, CheckCircle2, Circle, Clock, Tag, MessageSquare, Phone, Mail, Award, Check, HelpCircle, Briefcase, PlusCircle, User, Users, ArrowUpDown, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { ARGENTINE_REGIONS, PROVINCES } from '../data/regions';
import { useAuth } from '../contexts/AuthContext';
import { useClients } from '../hooks/useClients';
import { useUI } from '../contexts/UIContext';
import { useDeals } from '../hooks/useDeals';
import { useOpportunities } from '../hooks/useOpportunities';
import { useTasks } from '../hooks/useTasks';
import { api } from '../lib/api';
import { WhatsappTemplateModal } from '../components/WhatsappTemplateModal';
import { CSVMappingModal } from '../components/CSVMappingModal';
import { ClientTable, type ClientListItem } from '../components/clients/ClientTable';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';

const PIE_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF1942'];

export function Clientes() {
  const { clients, loading } = useClients();
  const { user } = useAuth();
  const { addToast } = useUI();
  const { deals } = useDeals();
  const { opportunities } = useOpportunities();

  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [viewingCustomerDetails, setViewingCustomerDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<'ficha' | 'granos' | 'bitacora' | 'tareas'>('ficha');
  const [isAddingNewCustomer, setIsAddingNewCustomer] = useState(false);
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // WhatsApp Template Modal State
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waModalPhone, setWaModalPhone] = useState('');
  const [waModalClientId, setWaModalClientId] = useState('');
  const [waModalClientName, setWaModalClientName] = useState('');

  const handleOpenWaModal = (phone: string, id: string, name: string) => {
    setWaModalPhone(phone);
    setWaModalClientId(id);
    setWaModalClientName(name);
    setWaModalOpen(true);
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [filterProvincia, setFilterProvincia] = useState('');
  const [filterLocalidad, setFilterLocalidad] = useState('');
  const [filterTipoCliente, setFilterTipoCliente] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('');
  const [filterAnoFiscal, setFilterAnoFiscal] = useState('');
  const [filterRelevado, setFilterRelevado] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  const filteredAndSortedCustomers = useMemo(() => {
    let filtered = [...clients];
    if (searchTerm) {
      filtered = filtered.filter(customer =>
        (customer.name && customer.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (customer.zona && customer.zona.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (customer.categoria && customer.categoria.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    if (filterAnoFiscal) filtered = filtered.filter(c => c.anoFiscal === filterAnoFiscal);
    if (filterRelevado) filtered = filtered.filter(c => c.relevado === filterRelevado);
    if (filterTipoCliente) filtered = filtered.filter(c => c.tipoCliente === filterTipoCliente);
    if (filterStatus) filtered = filtered.filter(c => (c.status || 'activo') === filterStatus);
    if (filterProvincia) {
      filtered = filtered.filter(c => {
        const z = (c.zona || '').toLowerCase();
        const p = filterProvincia.toLowerCase();
        return z === p || z.endsWith(`, ${p}`);
      });
    }
    if (filterLocalidad) {
      filtered = filtered.filter(c => {
        const z = (c.zona || '').toLowerCase();
        const l = filterLocalidad.toLowerCase();
        return z === l || z.startsWith(`${l},`);
      });
    }
    if (filterCategoria) filtered = filtered.filter(c => c.categoria === filterCategoria);

    filtered.sort((a, b) => {
      let valA: any = a[sortBy];
      let valB: any = b[sortBy];

      if (sortBy === 'name') {
        valA = a.name || '';
        valB = b.name || '';
      } else if (sortBy === 'hectareasTotales') {
        valA = (a.hectareasPropias || 0) + (a.hectareasAlquiladas || 0);
        valB = (b.hectareasPropias || 0) + (b.hectareasAlquiladas || 0);
      } else if (sortBy === 'potencialTotal') {
        valA = (a.potencialAgroq || 0) + (a.potencialFerti || 0);
        valB = (b.potencialAgroq || 0) + (b.potencialFerti || 0);
      } else if (sortBy === 'fechaUltimoContacto') {
        valA = a.fechaUltimoContacto || '0000-00-00';
        valB = b.fechaUltimoContacto || '0000-00-00';
      } else {
        valA = valA || '';
        valB = valB || '';
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });
    return filtered;
  }, [clients, searchTerm, filterAnoFiscal, filterRelevado, filterTipoCliente, filterStatus, filterProvincia, filterLocalidad, filterCategoria, sortBy, sortOrder]);

  // Interaction logs states
  const [interactions, setInteractions] = useState<any[]>([]);
  const [newInteractionType, setNewInteractionType] = useState('Llamada');
  const [newInteractionText, setNewInteractionText] = useState('');
  const [newInteractionDate, setNewInteractionDate] = useState(new Date().toISOString().split('T')[0]);

  // Tasks sub-states
  const [newClientTaskTitle, setNewClientTaskTitle] = useState('');
  const [newClientTaskDueDate, setNewClientTaskDueDate] = useState('');
  const [newClientTaskCategory, setNewClientTaskCategory] = useState<'siembra' | 'cosecha' | 'cobro' | 'documentacion' | 'seguimiento'>('seguimiento');

  // Agenda global y calendar states
  const [mainView, setMainView] = useState<'clientes' | 'agenda'>('clientes');
  const { tasks: allTasks, setTasks: setAllTasks } = useTasks();
  const [agendaSearchTerm, setAgendaSearchTerm] = useState('');
  const [agendaCategoryFilter, setAgendaCategoryFilter] = useState('');
  const [agendaStatusFilter, setAgendaStatusFilter] = useState('pendiente');
  const [agendaClientFilter, setAgendaClientFilter] = useState('');
  
  // State for creating tasks from general agenda
  const [generalTaskTitle, setGeneralTaskTitle] = useState('');
  const [generalTaskDueDate, setGeneralTaskDueDate] = useState('');
  const [generalTaskClientId, setGeneralTaskClientId] = useState('');
  const [generalTaskCategory, setGeneralTaskCategory] = useState<'siembra' | 'cosecha' | 'cobro' | 'documentacion' | 'seguimiento'>('seguimiento');
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  // Calendar Grid Year & Month states
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth());
  const [showFilters, setShowFilters] = useState(false);

  // Load interactions for the selected customer
  useEffect(() => {
    if (!selectedCustomer || !user) {
      setInteractions([]);
      return;
    }
    
    let active = true;
    const fetchInteractions = async () => {
      try {
        const data = await api.clients.listInteractions(selectedCustomer.id);
        if (active) {
          const sorted = [...data].sort((a: any, b: any) => {
            const timeA = new Date(a.createdAt || a.date || 0).getTime();
            const timeB = new Date(b.createdAt || b.date || 0).getTime();
            return timeB - timeA;
          });
          setInteractions(sorted);
        }
      } catch (err) {
        console.error('Error fetching interactions:', err);
      }
    };

    fetchInteractions();
    const interval = setInterval(fetchInteractions, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedCustomer, user]);

  const clientTasks = useMemo(() => {
    if (!selectedCustomer) return [];
    return allTasks.filter((t: any) => t.clientId === selectedCustomer.id);
  }, [allTasks, selectedCustomer]);

  const defaultFormData = {
    name: '', anoFiscal: 'FY2425', relevado: 'No', tipoCliente: 'Prospecto', zona: '', categoria: 'Productor',
    hectareasPropias: '', hectareasAlquiladas: '', hasGanaderia: '',
    hasSoja: '', rtoSjHa: '', porcEntregaCosechaSoja: '', precioObjetivoSoja: '',
    hasMaiz: '', rtoMzHa: '', porcEntregaCosechaMaiz: '', precioObjetivoMaiz: '',
    hasSorgo: '', rtoSgHa: '', porcEntregaCosechaSorgo: '', precioObjetivoSorgo: '',
    hasGirasol: '', rtoGsHa: '', porcEntregaCosechaGirasol: '', precioObjetivoGirasol: '',
    hasTrigo: '', rtoTgHa: '', porcEntregaCosechaTrigo: '', precioObjetivoTrigo: '',
    porcDisponible: '', porcFwd: '', porcA_Fijar: '',
    porcSoloDirectoPuerto: '', porcAcopio: '', porcSiloBolsa: '',
    distanciaPlantaKm: '', camiones: '', atributoCompetenciaGrano: '', atributoNuestroGrano: '',
    comprasPreCampana: false, productosPremium: false,
    atributoCompetenciaInsumos: '', atributoNuestroInsumos: '',
    potencialAgroq: '', budgetAgroq: '', potencialFerti: '', budgetFerti: '',
    fechaUltimoContacto: '', proximaAccion: '', fechaProximosPasos: '',
    observaciones: '', type: 'productor', phone: '', email: '', cuit: '', status: 'activo'
  };

  const [formData, setFormData] = useState<any>(defaultFormData);

  const [formProvincia, setFormProvincia] = useState('');
  const [formLocalidad, setFormLocalidad] = useState('');
  const [customLocalidad, setCustomLocalidad] = useState('');

  // Synchronize dropdown structures when the form is opened or loaded
  React.useEffect(() => {
    if (isAddingNewCustomer || isEditingCustomer) {
      const zonaStr = formData.zona || '';
      
      // Try to parse "Locality, Province" or "Locality (Province)"
      let parsedProv = '';
      let parsedLoc = '';
      
      const splitComma = zonaStr.split(',');
      if (splitComma.length >= 2) {
        const potentialLoc = splitComma[0].trim();
        const potentialProv = splitComma[1].trim();
        
        // Check if potentialProv is a valid province
        const foundProv = Object.keys(ARGENTINE_REGIONS).find(
          p => p.toLowerCase() === potentialProv.toLowerCase()
        );
        if (foundProv) {
          parsedProv = foundProv;
          parsedLoc = potentialLoc;
        }
      }
      
      // If we didn't match via comma, let's scan all regions to find the locality
      if (!parsedProv && zonaStr) {
        const cleanZona = zonaStr.toLowerCase().trim();
        for (const [prov, localities] of Object.entries(ARGENTINE_REGIONS)) {
          const matchedLoc = localities.find(
            loc => loc.toLowerCase() === cleanZona || cleanZona.includes(loc.toLowerCase())
          );
          if (matchedLoc) {
            parsedProv = prov;
            parsedLoc = matchedLoc;
            break;
          }
        }
      }

      // If we STILL couldn't find a matching province but have a string, support custom
      if (zonaStr && !parsedProv) {
        setFormProvincia('Otra');
        setFormLocalidad('Otro');
        setCustomLocalidad(zonaStr);
      } else if (parsedProv) {
        setFormProvincia(parsedProv);
        // Check if the parsed locality is indeed in the predefined list
        const exists = ARGENTINE_REGIONS[parsedProv]?.includes(parsedLoc);
        if (exists) {
          setFormLocalidad(parsedLoc);
          setCustomLocalidad('');
        } else {
          setFormLocalidad('Otro');
          setCustomLocalidad(parsedLoc);
        }
      } else {
        // Reset
        setFormProvincia('');
        setFormLocalidad('');
        setCustomLocalidad('');
      }
    }
  }, [isAddingNewCustomer, isEditingCustomer, formData.zona]);

  const updateZonaField = (prov: string, loc: string, custom: string) => {
    let finalZona = '';
    if (prov === 'Otra') {
      finalZona = custom.trim();
    } else if (prov) {
      if (loc === 'Otro') {
        finalZona = custom.trim() ? `${custom.trim()}, ${prov}` : prov;
      } else if (loc) {
        finalZona = `${loc}, ${prov}`;
      } else {
        finalZona = prov;
      }
    }
    
    setFormData((prev: any) => ({
      ...prev,
      zona: finalZona
    }));
  };

  const handleBackToList = () => {
    setViewingCustomerDetails(false);
    setSelectedCustomer(null);
    setIsAddingNewCustomer(false);
    setIsEditingCustomer(false);
    setFormData(defaultFormData);
    setActiveTab('ficha');
  };

  // Export filtered customers list to CSV download
  const handleExportCSV = useCallback(() => {
    if (clients.length === 0) {
      addToast('No hay clientes nacionales cargados para exportar', 'error');
      return;
    }
    
    const headers = ['Nombre/Razon Social', 'Categoria', 'Tipo Cliente', 'Zona', 'CUIT', 'Telefono', 'Email', 'Hectareas Propias', 'Hectareas Alquiladas', 'Estado', 'Socio Relevado'];
    const rows = filteredAndSortedCustomers.map(c => [
      c.name || '',
      c.categoria || 'Productor',
      c.tipoCliente || 'Prospecto',
      c.zona || '',
      c.cuit || '',
      c.phone || '',
      c.email || '',
      c.hectareasPropias || 0,
      c.hectareasAlquiladas || 0,
      c.status || 'activo',
      c.relevado || 'No'
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Clientes_CRM_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast('Directorio de clientes exportado correctamente a CSV Excel 📄', 'success');
  }, [filteredAndSortedCustomers, clients, addToast]);

  // Import batch of clients from a CSV template
  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;

      try {
        const lines = text.split('\n');
        let addedCount = 0;

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const fields = line.split(',');
          if (fields.length < 1 || !fields[0]) continue;

          const name = fields[0].replace(/^"|"$/g, '').trim();
          const categoria = (fields[1] || 'Productor').replace(/^"|"$/g, '').trim();
          const tipoCliente = (fields[2] || 'Prospecto').replace(/^"|"$/g, '').trim();
          const zona = (fields[3] || '').replace(/^"|"$/g, '').trim();
          const cuit = (fields[4] || '').replace(/^"|"$/g, '').trim();
          const phone = (fields[5] || '').replace(/^"|"$/g, '').trim();
          const email = (fields[6] || '').replace(/^"|"$/g, '').trim();
          const hectareasPropias = parseFloat(fields[7]) || 0;
          const hectareasAlquiladas = parseFloat(fields[8]) || 0;
          const status = (fields[9] || 'activo').replace(/^"|"$/g, '').trim();
          const relevado = (fields[10] || 'No').replace(/^"|"$/g, '').trim();

          await api.clients.create({
            name,
            categoria,
            tipoCliente,
            zona,
            cuit,
            phone,
            email,
            hectareasPropias,
            hectareasAlquiladas,
            status,
            relevado,
            anoFiscal: 'FY2425'
          });
          addedCount++;
        }

        addToast(`Sincronización existosa! Se importaron ${addedCount} nuevos clientes en lote. 🎉`, 'success');
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (err) {
        console.error(err);
        addToast('Error al parsear el CSV. Asegúrese de usar comas para separar los campos.', 'error');
      }
    };
    reader.readAsText(file);
  };

  // Interaction logs CRUD
  const handleAddInteraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !user || !newInteractionText.trim()) return;

    try {
      await api.clients.createInteraction(selectedCustomer.id, {
        clientName: selectedCustomer.name,
        type: newInteractionType,
        note: newInteractionText.trim(),
        date: newInteractionDate
      });
      setNewInteractionText('');
      addToast('Nota registrada y agendada en la bitácora 📝', 'success');

      // Immediately refetch interactions for local responsiveness
      const updated = await api.clients.listInteractions(selectedCustomer.id);
      const sorted = [...updated].sort((a: any, b: any) => {
        const timeA = new Date(a.createdAt || a.date || 0).getTime();
        const timeB = new Date(b.createdAt || b.date || 0).getTime();
        return timeB - timeA;
      });
      setInteractions(sorted);
    } catch (err) {
      console.error(err);
      addToast('Error al registrar la bitácora', 'error');
    }
  };

  const handleDeleteInteraction = async (id: string) => {
    if (!confirm('¿Seguro quieres eliminar esta nota de la bitácora?')) return;
    try {
      await api.clients.deleteInteraction(selectedCustomer.id, id);
      addToast('Nota eliminada', 'success');
      // Update state locally
      setInteractions(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      addToast('Error al borrar nota', 'error');
    }
  };

  // Client connected tasks
  const handleCreateClientTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !user || !newClientTaskTitle.trim() || !newClientTaskDueDate) {
      addToast('Completa el título y la fecha límite para la alerta', 'error');
      return;
    }

    try {
      const newTask = await api.tasks.create({
        taskTitle: newClientTaskTitle.trim(),
        clientId: selectedCustomer.id,
        clientName: selectedCustomer.name,
        dueDate: newClientTaskDueDate,
        cropType: 'soja',
        category: newClientTaskCategory,
        status: 'pendiente'
      });
      setNewClientTaskTitle('');
      setNewClientTaskDueDate('');
      addToast('Tarea vinculada creada correctamente 📅', 'success');

      // Instantly add to allTasks list so it is shown on page without waiting 5 seconds
      setAllTasks(prev => [...prev, newTask].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()));
    } catch (err) {
      console.error(err);
      addToast('Error al crear la tarea vinculada', 'error');
    }
  };

  const handleToggleClientTask = async (taskId: string, currentStatus: string) => {
    try {
      const nextStatus = currentStatus === 'completada' ? 'pendiente' : 'completada';
      await api.tasks.update(taskId, {
        status: nextStatus
      });
      addToast(nextStatus === 'completada' ? 'Tarea marcada como completada 🎉' : 'Tarea reabierta', 'success');

      // Instantly update in allTasks
      setAllTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: nextStatus } : t));
    } catch (err) {
      console.error(err);
      addToast('Error al actualizar la tarea', 'error');
    }
  };

  const handleDeleteClientTask = async (taskId: string) => {
    try {
      await api.tasks.delete(taskId);
      addToast('Tarea removida de la agenda', 'success');

      // Instantly remove from allTasks
      setAllTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err) {
      console.error(err);
      addToast('Error al eliminar la tarea', 'error');
    }
  };

  const handleCreateGeneralTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !generalTaskTitle.trim() || !generalTaskDueDate || !generalTaskClientId) {
      addToast('Por favor completa todos los campos para registrar el compromiso en agenda', 'error');
      return;
    }

    const clientObj = clients.find(c => c.id === generalTaskClientId);
    if (!clientObj) {
      addToast('Productor de la lista no válido o desconocido', 'error');
      return;
    }

    try {
      const newTask = await api.tasks.create({
        taskTitle: generalTaskTitle.trim(),
        clientId: generalTaskClientId,
        clientName: clientObj.name,
        dueDate: generalTaskDueDate,
        cropType: 'soja',
        category: generalTaskCategory,
        status: 'pendiente'
      });
      setGeneralTaskTitle('');
      addToast('Compromiso agendado correctamente en toda la Cooperativa 📅', 'success');

      // Instantly update allTasks
      setAllTasks(prev => [...prev, newTask].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()));
    } catch (err) {
      console.error(err);
      addToast('Error al crear el compromiso', 'error');
    }
  };

  const parseNumericFields = (data: any) => {
    const numericFields = [
      'hectareasPropias', 'hectareasAlquiladas', 'hasGanaderia',
      'hasSoja', 'rtoSjHa', 'porcEntregaCosechaSoja', 'precioObjetivoSoja',
      'hasMaiz', 'rtoMzHa', 'porcEntregaCosechaMaiz', 'precioObjetivoMaiz',
      'hasSorgo', 'rtoSgHa', 'porcEntregaCosechaSorgo', 'precioObjetivoSorgo',
      'hasGirasol', 'rtoGsHa', 'porcEntregaCosechaGirasol', 'precioObjetivoGirasol',
      'hasTrigo', 'rtoTgHa', 'porcEntregaCosechaTrigo', 'precioObjetivoTrigo',
      'porcDisponible', 'porcFwd', 'porcA_Fijar',
      'porcSoloDirectoPuerto', 'porcAcopio', 'porcSiloBolsa',
      'distanciaPlantaKm', 'camiones', 'potencialAgroq', 'budgetAgroq',
      'potencialFerti', 'budgetFerti'
    ];
    const parsedData = { ...data };
    numericFields.forEach(field => {
      parsedData[field] = parsedData[field] === '' ? 0 : parseFloat(parsedData[field]) || 0;
    });
    // Remove undefined fields
    Object.keys(parsedData).forEach(key => {
      if (parsedData[key] === undefined) {
        delete parsedData[key];
      }
    });
    return parsedData;
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      addToast('El nombre es obligatorio.', 'error');
      return;
    }
    try {
      const customerToAdd = parseNumericFields(formData);
      await api.clients.create(customerToAdd);
      addToast('Cliente añadido correctamente!', 'success');
      handleBackToList();
    } catch (err) {
      console.error(err);
      addToast('Error al agregar cliente.', 'error');
    }
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const customerToUpdate = parseNumericFields(formData);
      // Remove fields that should not be updated
      delete customerToUpdate.id;
      delete customerToUpdate.createdAt;
      delete customerToUpdate.ownerId;

      const updated = await api.clients.update(selectedCustomer.id, customerToUpdate);
      addToast('Cliente actualizado correctamente!', 'success');
      setSelectedCustomer(updated);
      setIsEditingCustomer(false);
      setViewingCustomerDetails(true);
    } catch (err) {
      console.error(err);
      addToast('Error al actualizar el cliente.', 'error');
    }
  };

  const handleDeleteCustomer = async () => {
    if (!selectedCustomer || !confirm('¿Estás seguro de que quieres eliminar a este cliente? Esta acción es irreversible.')) return;
    try {
      await api.clients.delete(selectedCustomer.id);
      addToast('Cliente eliminado correctamente!', 'success');
      handleBackToList();
    } catch (err) {
      console.error(err);
      addToast('Error al eliminar cliente.', 'error');
    }
  };

  const handleFormChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev: any) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const chartData = useMemo(() => {
    const hectaresByZone = clients.reduce((acc: any, client: any) => {
      const totalHectares = (client.hectareasPropias || 0) + (client.hectareasAlquiladas || 0);
      const zoneKey = client.zona || 'Desconocida';
      acc[zoneKey] = (acc[zoneKey] || 0) + totalHectares;
      return acc;
    }, {});
    const hectaresByZoneData = Object.keys(hectaresByZone).map(zone => ({ name: zone, hectareas: hectaresByZone[zone] }));

    const clientsByType = clients.reduce((acc: any, client: any) => {
      const typeKey = client.tipoCliente || 'Desconocido';
      acc[typeKey] = (acc[typeKey] || 0) + 1;
      return acc;
    }, {});
    const clientsByTypeData = Object.keys(clientsByType).map(type => ({ name: type, value: clientsByType[type] }));

    const sojaProdByYear = clients.reduce((acc: any, client: any) => {
        const prodSoja = (client.hasSoja || 0) * (client.rtoSjHa || 0);
        const yearKey = client.anoFiscal || 'Desconocido';
        acc[yearKey] = (acc[yearKey] || 0) + prodSoja;
        return acc;
    }, {});
    const sojaProdByYearData = Object.keys(sojaProdByYear).sort().map(year => ({ year: year, produccion: sojaProdByYear[year] }));

    return { hectaresByZoneData, clientsByTypeData, sojaProdByYearData };
  }, [clients]);

  const computedStats = useMemo(() => {
    let totHectares = 0;
    let totPotential = 0;
    let relevadoQty = 0;
    let activeQty = 0;

    filteredAndSortedCustomers.forEach(c => {
      totHectares += (Number(c.hectareasPropias) || 0) + (Number(c.hectareasAlquiladas) || 0);
      totPotential += (Number(c.potencialAgroq) || 0) + (Number(c.potencialFerti) || 0);
      // support both formats
      if (c.relevado === 'Sí' || c.relevado === 'Socio Relevado') relevadoQty++;
      if ((c.status || 'activo') === 'activo') activeQty++;
    });

    const total = filteredAndSortedCustomers.length;
    const relevamientoPct = total > 0 ? Math.round((relevadoQty / total) * 100) : 0;

    return {
      total,
      activeQty,
      totHectares,
      totPotential,
      relevadoQty,
      relevamientoPct
    };
  }, [filteredAndSortedCustomers]);

  // Calendar translation & calculation helpers
  const MONTHS_SPANISH = useMemo(() => [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ], []);

  const daysInMonth = useMemo(() => {
    return new Date(currentYear, currentMonth + 1, 0).getDate();
  }, [currentYear, currentMonth]);

  const startDayOfWeek = useMemo(() => {
    // getDay returns 0 for Sunday. Adjust to index 0 for Monday
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    return firstDay === 0 ? 6 : firstDay - 1; 
  }, [currentYear, currentMonth]);

  const prevMonthDays = useMemo(() => {
    return new Date(currentYear, currentMonth, 0).getDate();
  }, [currentYear, currentMonth]);

  // Calendar cells generation (calculates offsets for previous/next months padding)
  const calendarCells = useMemo(() => {
    const cells = [];
    // Previous month padding cells
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const targetMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const targetYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dateStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      cells.push({ day: dayNum, isPadding: true, dateString: dateStr, monthOffset: -1 });
    }
    // Current month cells
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, isPadding: false, dateString: dateStr, monthOffset: 0 });
    }
    // Next month padding cells
    const totalCellsSoFar = cells.length;
    const remaining = totalCellsSoFar % 7 === 0 ? 0 : 7 - (totalCellsSoFar % 7);
    for (let n = 1; n <= remaining; n++) {
      const targetMonth = currentMonth === 11 ? 0 : currentMonth + 1;
      const targetYear = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dateStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
      cells.push({ day: n, isPadding: true, dateString: dateStr, monthOffset: 1 });
    }
    return cells;
  }, [currentYear, currentMonth, daysInMonth, startDayOfWeek, prevMonthDays]);

  // Handle month navigation
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  // Maps tasks by their due date for fast rendering on calendar cells
  const tasksByDateMap = useMemo(() => {
    const map: Record<string, any[]> = {};
    allTasks.forEach(task => {
      const date = task.dueDate;
      if (!map[date]) {
        map[date] = [];
      }
      map[date].push(task);
    });
    return map;
  }, [allTasks]);

  // Filter tasks specifically for the list feed inside the general agenda tab
  const filteredAllTasks = useMemo(() => {
    return allTasks.filter(t => {
      const matchesSearch = !agendaSearchTerm || 
        t.taskTitle.toLowerCase().includes(agendaSearchTerm.toLowerCase()) ||
        (t.clientName && t.clientName.toLowerCase().includes(agendaSearchTerm.toLowerCase()));

      const matchesCategory = !agendaCategoryFilter || t.category === agendaCategoryFilter;
      const matchesStatus = agendaStatusFilter === 'todos' || t.status === agendaStatusFilter;
      const matchesClient = !agendaClientFilter || t.clientId === agendaClientFilter;

      return matchesSearch && matchesCategory && matchesStatus && matchesClient;
    });
  }, [allTasks, agendaSearchTerm, agendaCategoryFilter, agendaStatusFilter, agendaClientFilter]);

  const handleClearFilters = () => {
    setSearchTerm('');
    setFilterProvincia('');
    setFilterLocalidad('');
    setFilterTipoCliente('');
    setFilterCategoria('');
    setFilterAnoFiscal('');
    setFilterRelevado('');
    setFilterStatus('');
    setSortBy('name');
    setSortOrder('asc');
    addToast('Filtros de búsqueda restablecidos', 'success');
  };

  const isAnyFilterActive = useMemo(() => {
    return !!(
      searchTerm ||
      filterProvincia ||
      filterLocalidad ||
      filterTipoCliente ||
      filterCategoria ||
      filterAnoFiscal ||
      filterRelevado ||
      filterStatus ||
      sortBy !== 'name' ||
      sortOrder !== 'asc'
    );
  }, [searchTerm, filterProvincia, filterLocalidad, filterTipoCliente, filterCategoria, filterAnoFiscal, filterRelevado, filterStatus, sortBy, sortOrder]);

  const advancedFilterCount = [
    filterProvincia,
    filterLocalidad,
    filterTipoCliente,
    filterCategoria,
    filterAnoFiscal,
    filterRelevado,
    filterStatus,
  ].filter(Boolean).length;

  if (loading) return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="font-mono text-xs text-gray-500 animate-pulse uppercase tracking-widest">Cargando Clientes...</div>
    </div>
  );

  return (
    <div className="w-full max-w-7xl min-w-0 mx-auto pb-12 space-y-4 sm:space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-tight">
              {mainView === 'clientes' ? 'Directorio de Clientes' : 'Agenda de la Cooperativa'}
            </h1>
            
            {/* View toggle tabs */}
            <div className="flex w-full sm:w-auto bg-[#2c2c2c]/40 border border-[#3c3c3c] p-0.5 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => { setMainView('clientes'); handleBackToList(); }}
                className={`flex-1 sm:flex-none min-h-10 px-3 py-1.5 rounded-md transition-all ${mainView === 'clientes' ? 'bg-[#22c55e] text-black font-extrabold shadow-sm' : 'text-gray-400 hover:text-white'}`}
              >
                📋 Productores
              </button>
              <button
                type="button"
                onClick={() => { setMainView('agenda'); handleBackToList(); }}
                className={`flex-1 sm:flex-none min-h-10 px-3 py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${mainView === 'agenda' ? 'bg-[#22c55e] text-black font-extrabold shadow-sm' : 'text-gray-400 hover:text-white'}`}
              >
                📅 Agenda General
                {allTasks.filter(t => t.status === 'pendiente').length > 0 && (
                  <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-extrabold ${mainView === 'agenda' ? 'bg-black text-[#22c55e]' : 'bg-green-600 text-white'}`}>
                    {allTasks.filter(t => t.status === 'pendiente').length}
                  </span>
                )}
              </button>
            </div>
          </div>
          <p className="text-gray-400 mt-1">
            {mainView === 'clientes' ? 'Gestión avanzada de Productores y Acopios' : 'Planificador logístico, visitas de campo, cobros y siembras'}
          </p>
        </div>
        
        {!viewingCustomerDetails && !isAddingNewCustomer && !isEditingCustomer && mainView === 'clientes' && (
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto">
            {/* Importar CSV */}
            <button 
              onClick={() => setIsCsvModalOpen(true)}
              className="w-full min-h-11 bg-[#222] border border-[#333] hover:border-[#444] text-gray-300 hover:text-white px-3.5 py-2 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold transition-all cursor-pointer"
            >
              <FileUp className="w-4 h-4 text-green-500" />
              <span>Importar CSV</span>
            </button>

            {/* Exportar CSV */}
            <button 
              onClick={handleExportCSV}
              className="w-full min-h-11 bg-[#222] border border-[#333] hover:border-[#444] text-gray-300 hover:text-white px-3.5 py-2 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold transition-all"
            >
              <FileDown className="w-4 h-4 text-green-500" />
              <span>Exportar CSV</span>
            </button>

            <button 
              onClick={() => {
                setFormData(defaultFormData);
                setIsAddingNewCustomer(true);
              }}
              className="col-span-2 sm:col-span-1 w-full min-h-11 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 font-medium text-xs transition-colors shadow-sm"
            >
              <Plus className="w-4.5 h-4.5" />
              <span>Nuevo Cliente</span>
            </button>
          </div>
        )}
      </div>

      {(viewingCustomerDetails || isAddingNewCustomer || isEditingCustomer) ? (
        <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-4 sm:p-6 shadow-sm overflow-hidden relative min-w-0">
          <button 
            onClick={handleBackToList}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
          
          {viewingCustomerDetails && !isEditingCustomer && selectedCustomer && (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
              
              {/* Header con Perfil */}
              <div className="flex flex-col md:flex-row md:items-start justify-between border-b border-[#333] pb-6 gap-4">
                <div className="min-w-0 pr-10 md:pr-0">
                  <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 flex flex-wrap items-center gap-2.5 break-words">
                    {selectedCustomer.name}
                    {selectedCustomer.status === 'activo' && (
                      <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse" title="Estado: Activo"></span>
                    )}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
                    <span className="flex items-center gap-1.5 bg-[#252525] px-3 py-1 rounded-full text-xs font-semibold uppercase text-green-400 border border-[#333]"><Building2 className="w-3.5 h-3.5" /> {selectedCustomer.categoria || 'Productor'}</span>
                    <span className="flex items-center gap-1.5 bg-[#252525] px-3 py-1 rounded-full text-xs font-semibold uppercase text-yellow-500 border border-[#333]"><Target className="w-3.5 h-3.5" /> {selectedCustomer.tipoCliente || 'Prospecto'}</span>
                    <span className="flex items-center gap-1.5 bg-[#252525] px-3 py-1 rounded-full text-xs font-medium text-gray-300 border border-[#333]"><MapPin className="w-3.5 h-3.5" /> {selectedCustomer.zona || 'Sin zona'}</span>
                    <span className="flex items-center gap-1.5 bg-[#252525] px-3 py-1 rounded-full text-xs font-mono text-gray-400 border border-[#333]"><Calendar className="w-3.5 h-3.5" /> {selectedCustomer.anoFiscal}</span>
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  {selectedCustomer.phone && (
                    <button
                      onClick={() => handleOpenWaModal(selectedCustomer.phone, selectedCustomer.id, selectedCustomer.name)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-2 font-medium text-xs transition-colors shadow-lg shadow-emerald-950/20 cursor-pointer text-left"
                      title="Enviar WhatsApp con Plantilla"
                    >
                      <MessageSquare className="w-4 h-4" /> WhatsApp
                    </button>
                  )}
                  <button onClick={() => {
                    setFormData({ ...defaultFormData, ...selectedCustomer });
                    setIsEditingCustomer(true);
                    setViewingCustomerDetails(false);
                  }} className="px-4 py-2 bg-[#2a2a2a] hover:bg-[#333] border border-[#444] text-white rounded-lg flex items-center gap-2 font-medium text-xs transition-colors">
                    <Settings2 className="w-4 h-4 text-gray-400" /> Editar Ficha
                  </button>
                  <button onClick={handleDeleteCustomer} className="p-2 bg-red-950/20 hover:bg-red-900/35 border border-red-900/25 text-red-400 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Botones de Navegación de Solapas (Tabs) */}
              <div className="mobile-scroll-row flex scrollbar-none border-b border-[#333] gap-1.5 p-1 bg-[#161616] rounded-xl max-w-xl">
                <button 
                  onClick={() => setActiveTab('ficha')}
                  className={`flex-1 min-w-[100px] py-2 px-2.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${activeTab === 'ficha' ? 'bg-[#2a2a2a] text-white font-bold shadow' : 'text-gray-400 hover:text-white'}`}
                >
                  <User className="w-3.5 h-3.5" /> Ficha General
                </button>
                <button 
                  onClick={() => setActiveTab('granos')}
                  className={`flex-1 min-w-[90px] py-2 px-2.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${activeTab === 'granos' ? 'bg-[#2a2a2a] text-white font-bold shadow' : 'text-gray-400 hover:text-white'}`}
                >
                  <Activity className="w-3.5 h-3.5" /> Negocios
                </button>
                <button 
                  onClick={() => setActiveTab('bitacora')}
                  className={`flex-1 min-w-[90px] py-2 px-2.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${activeTab === 'bitacora' ? 'bg-[#2a2a2a] text-white font-bold shadow' : 'text-gray-400 hover:text-white'}`}
                >
                  <FileText className="w-3.5 h-3.5" /> Bitácora
                  {interactions.length > 0 && (
                    <span className="bg-green-600 text-white font-bold rounded-full w-4 h-4 text-[9px] flex items-center justify-center select-none">{interactions.length}</span>
                  )}
                </button>
                <button 
                  onClick={() => setActiveTab('tareas')}
                  className={`flex-1 min-w-[90px] py-2 px-2.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${activeTab === 'tareas' ? 'bg-[#2a2a2a] text-white font-bold shadow' : 'text-gray-400 hover:text-white'}`}
                >
                  <Check className="w-3.5 h-3.5" /> Agenda
                  {clientTasks.filter(t => t.status === 'pendiente').length > 0 && (
                    <span className="bg-amber-600 text-white font-bold rounded-full w-4 h-4 text-[9px] flex items-center justify-center select-none">
                      {clientTasks.filter(t => t.status === 'pendiente').length}
                    </span>
                  )}
                </button>
              </div>

              {/* Sub-Secciones según Tab */}
              
              {/* Solapa 1: Ficha General */}
              {activeTab === 'ficha' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
                  
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2"><User className="w-4 h-4 text-green-500" /> Datos de Contacto</h3>
                    <div className="bg-[#181818] border border-[#333] p-4 sm:p-5 rounded-xl space-y-3 text-sm min-w-0">
                      <div className="flex justify-between items-center gap-3"><span className="text-gray-500 shrink-0">Teléfono:</span> <span className="text-white font-medium select-all text-right break-all">{selectedCustomer.phone || 'No registrado'}</span></div>
                      <div className="flex justify-between items-center gap-3 min-w-0"><span className="text-gray-500 shrink-0">Email:</span> <span className="text-white font-medium select-all text-xs text-right break-all">{selectedCustomer.email || 'No registrado'}</span></div>
                      <div className="flex justify-between items-center gap-3"><span className="text-gray-500 shrink-0">CUIT:</span> <span className="text-white font-mono select-all text-xs text-right break-all">{selectedCustomer.cuit || 'N/A'}</span></div>
                      <div className="flex justify-between items-center"><span className="text-gray-500">Estado CRM:</span> <span className="text-white font-medium capitalize bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-md text-xs">{selectedCustomer.status || 'Activo'}</span></div>
                      <div className="flex justify-between items-center pt-2.5 border-t border-[#2a2a2a]"><span className="text-gray-500">Relevado por Agente:</span> <span className="text-white font-semibold">{selectedCustomer.relevado || 'No'}</span></div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2"><MapPin className="w-4 h-4 text-green-500" /> Superficies del Establecimiento</h3>
                    <div className="bg-[#181818] border border-[#333] p-5 rounded-xl space-y-3 text-sm">
                      <div className="flex justify-between"><span className="text-gray-500">Hectáreas Propias:</span> <span className="text-white font-medium">{selectedCustomer.hectareasPropias?.toLocaleString() || 0} ha</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Hectáreas Alquiladas:</span> <span className="text-white font-medium">{selectedCustomer.hectareasAlquiladas?.toLocaleString() || 0} ha</span></div>
                      {selectedCustomer.hasGanaderia > 0 && <div className="flex justify-between"><span className="text-gray-500">Has. de Ganadería/Pasturas:</span> <span className="text-white font-medium">{selectedCustomer.hasGanaderia?.toLocaleString()} ha</span></div>}
                      
                      <div className="flex justify-between pt-3 border-t border-[#2a2a2a] items-baseline">
                        <span className="text-gray-400 font-semibold">Superficie Total Operada:</span>
                        <span className="text-green-400 text-lg font-bold">
                          {((selectedCustomer.hectareasPropias || 0) + (selectedCustomer.hectareasAlquiladas || 0)).toLocaleString()} ha
                        </span>
                      </div>
                      
                      <div className="w-full bg-[#252525] rounded-full h-1.5 overflow-hidden mt-2">
                        <div 
                          className="bg-green-500 h-full rounded-full transition-all duration-300" 
                          style={{
                            width: `${Math.min(
                              100, 
                              (((selectedCustomer.hectareasPropias || 0) + (selectedCustomer.hectareasAlquiladas || 0)) / 1000) * 100
                            )}%`
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2"><Target className="w-4 h-4 text-green-500" /> Presupuesto Estimado de Insumos</h3>
                    <div className="bg-[#181818] border border-[#333] p-5 rounded-xl space-y-3 text-sm">
                      <div>
                        <div className="flex justify-between mb-1"><span className="text-gray-400">Agroquímicos</span> <span className="text-white font-semibold">USD {selectedCustomer.budgetAgroq?.toLocaleString() || 0}</span></div>
                        <div className="w-full bg-[#252525] h-1 rounded-full overflow-hidden">
                          <div 
                            className="bg-indigo-500 h-full rounded-full" 
                            style={{ width: `${Math.min(100, ((selectedCustomer.budgetAgroq || 0) / (selectedCustomer.potencialAgroq || 1)) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="pt-2 border-t border-[#2a2a2a]">
                        <div className="flex justify-between mb-1"><span className="text-gray-400">Fertilizantes</span> <span className="text-white font-semibold">USD {selectedCustomer.budgetFerti?.toLocaleString() || 0}</span></div>
                        <div className="w-full bg-[#252525] h-1 rounded-full overflow-hidden">
                          <div 
                            className="bg-amber-500 h-full rounded-full" 
                            style={{ width: `${Math.min(100, ((selectedCustomer.budgetFerti || 0) / (selectedCustomer.potencialFerti || 1)) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-2 lg:col-span-3 space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2"><FileText className="w-4 h-4 text-green-500" /> Plan de Campaña y Observaciones</h3>
                    <div className="bg-[#181818] border border-[#333] p-5 rounded-xl text-sm">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                        <div><span className="block text-gray-500 mb-1">Última Visita / Contacto:</span> <span className="text-white font-medium flex items-center gap-2"><Calendar className="w-4 h-4 text-gray-400" /> {selectedCustomer.fechaUltimoContacto || 'Pendiente registrar'}</span></div>
                        <div><span className="block text-gray-500 mb-1">Próxima Acción planificada:</span> <span className="text-amber-400 font-medium flex items-center gap-2"><Clock className="w-4 h-4" /> {selectedCustomer.fechaProximosPasos || 'Sin fecha de agenda'}</span></div>
                        <div><span className="block text-gray-500 mb-1">Detalle del Siguiente Paso:</span> <span className="text-white font-medium px-2 py-1 bg-[#222] border border-[#333] rounded text-xs select-all flex items-center gap-1.5"><Tag className="w-3.5 h-3.5 text-green-500" /> {selectedCustomer.proximaAccion || 'No planificado'}</span></div>
                      </div>
                      <div className="border-t border-[#2a2a2a] pt-4">
                        <span className="block text-gray-400 font-bold mb-2 uppercase text-[11px] tracking-wider">Notas de Inteligencia de Mercado:</span>
                        <p className="text-gray-300 leading-relaxed whitespace-pre-wrap bg-[#131313] p-4 rounded-lg border border-[#2a2a2a] text-sm">
                          {selectedCustomer.observaciones || 'Sin comentarios adicionales. Entra en "Editar Ficha" para agregar información detallada sobre logística, atributos valorados y competidores.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Solapa 2: Negocio de Granos y Operativa de Canjes */}
              {activeTab === 'granos' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  
                  {/* Cultivos bento */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Bento de Estimaciones de Cosecha</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      
                      {/* Soja */}
                      <div className="bg-[#181818] border border-[#333] p-4 rounded-xl relative overflow-hidden">
                        <div className="absolute right-3 top-3 text-[10px] uppercase font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full select-none">Sj</div>
                        <h4 className="text-xs text-gray-400 uppercase font-semibold tracking-wider mb-2">Soja</h4>
                        {selectedCustomer.hasSoja > 0 ? (
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between"><span>Sembramos:</span> <span className="text-white font-medium">{selectedCustomer.hasSoja} ha</span></div>
                            <div className="flex justify-between"><span>Rendimiento:</span> <span className="text-white font-medium">{selectedCustomer.rtoSjHa} kg/ha</span></div>
                            <div className="flex justify-between"><span>Precio Obj:</span> <span className="text-white font-medium">USD {selectedCustomer.precioObjetivoSoja}</span></div>
                            <div className="border-t border-[#2a2a2a] pt-1.5 flex justify-between font-bold text-green-400">
                              <span>Prod. Estimada:</span>
                              <span>{((selectedCustomer.hasSoja * selectedCustomer.rtoSjHa) / 1000).toLocaleString(undefined, {maximumFractionDigits:1})} Tn</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 italic mt-3">Sin siembra planificada</p>
                        )}
                      </div>

                      {/* Maíz */}
                      <div className="bg-[#181818] border border-[#333] p-4 rounded-xl relative overflow-hidden">
                        <div className="absolute right-3 top-3 text-[10px] uppercase font-bold text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full select-none">Mz</div>
                        <h4 className="text-xs text-gray-400 uppercase font-semibold tracking-wider mb-2">Maíz</h4>
                        {selectedCustomer.hasMaiz > 0 ? (
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between"><span>Sembramos:</span> <span className="text-white font-medium">{selectedCustomer.hasMaiz} ha</span></div>
                            <div className="flex justify-between"><span>Rendimiento:</span> <span className="text-white font-medium">{selectedCustomer.rtoMzHa} kg/ha</span></div>
                            <div className="flex justify-between"><span>Precio Obj:</span> <span className="text-white font-medium">USD {selectedCustomer.precioObjetivoMaiz}</span></div>
                            <div className="border-t border-[#2a2a2a] pt-1.5 flex justify-between font-bold text-yellow-500">
                              <span>Prod. Estimada:</span>
                              <span>{((selectedCustomer.hasMaiz * selectedCustomer.rtoMzHa) / 1000).toLocaleString(undefined, {maximumFractionDigits:1})} Tn</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 italic mt-3">Sin siembra planificada</p>
                        )}
                      </div>

                      {/* Trigo */}
                      <div className="bg-[#181818] border border-[#333] p-4 rounded-xl relative overflow-hidden">
                        <div className="absolute right-3 top-3 text-[10px] uppercase font-bold text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded-full select-none">Tg</div>
                        <h4 className="text-xs text-gray-400 uppercase font-semibold tracking-wider mb-2">Trigo</h4>
                        {selectedCustomer.hasTrigo > 0 ? (
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between"><span>Sembramos:</span> <span className="text-white font-medium">{selectedCustomer.hasTrigo} ha</span></div>
                            <div className="flex justify-between"><span>Rendimiento:</span> <span className="text-white font-medium">{selectedCustomer.rtoTgHa} kg/ha</span></div>
                            <div className="flex justify-between"><span>Precio Obj:</span> <span className="text-white font-medium">USD {selectedCustomer.precioObjetivoTrigo}</span></div>
                            <div className="border-t border-[#2a2a2a] pt-1.5 flex justify-between font-bold text-orange-400">
                              <span>Prod. Estimada:</span>
                              <span>{((selectedCustomer.hasTrigo * selectedCustomer.rtoTgHa) / 1000).toLocaleString(undefined, {maximumFractionDigits:1})} Tn</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 italic mt-3">Sin siembra planificada</p>
                        )}
                      </div>

                      {/* Girasol */}
                      <div className="bg-[#181818] border border-[#333] p-4 rounded-xl relative overflow-hidden">
                        <div className="absolute right-3 top-3 text-[10px] uppercase font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full select-none">Gs</div>
                        <h4 className="text-xs text-gray-400 uppercase font-semibold tracking-wider mb-2">Girasol</h4>
                        {selectedCustomer.hasGirasol > 0 ? (
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between"><span>Sembramos:</span> <span className="text-white font-medium">{selectedCustomer.hasGirasol} ha</span></div>
                            <div className="flex justify-between"><span>Rendimiento:</span> <span className="text-white font-medium">{selectedCustomer.rtoGsHa} kg/ha</span></div>
                            <div className="flex justify-between"><span>Precio Obj:</span> <span className="text-white font-medium">USD {selectedCustomer.precioObjetivoGirasol}</span></div>
                            <div className="border-t border-[#2a2a2a] pt-1.5 flex justify-between font-bold text-amber-500">
                              <span>Prod. Estimada:</span>
                              <span>{((selectedCustomer.hasGirasol * selectedCustomer.rtoGsHa) / 1000).toLocaleString(undefined, {maximumFractionDigits:1})} Tn</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 italic mt-3">Sin siembra planificada</p>
                        )}
                      </div>

                    </div>
                  </div>

                  {/* Negociaciones Cruzadas de la API de Mesa */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-1">
                    
                    {/* Ofertas / Demandas */}
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
                        <span>Órdenes / Volúmenes Ofrecidos en Mesa</span>
                        <span className="text-[10px] bg-green-500/15 text-green-400 px-2 py-0.5 rounded-full">Pipeline Activo</span>
                      </h3>
                      
                      <div className="bg-[#181818] border border-[#333] rounded-xl p-4 space-y-3 max-h-[250px] overflow-y-auto">
                        {opportunities.filter(o => o.clientId === selectedCustomer.id).length > 0 ? (
                          opportunities.filter(o => o.clientId === selectedCustomer.id).map((opp) => (
                            <div key={opp.id} className="bg-[#222] border border-[#333] p-3 rounded-lg flex items-center justify-between text-xs hover:border-green-500/25 transition-all">
                              <div className="flex items-center gap-2">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${opp.type === 'oferta' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                                  {opp.type}
                                </span>
                                <div>
                                  <p className="text-white font-bold capitalize">{opp.cropType}</p>
                                  <p className="text-[10px] text-gray-500">{opp.location || 'Retira en campo'}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-white font-semibold">{opp.quantity_tn} Tn</p>
                                <p className="text-xs text-green-500 font-medium">USD {opp.price_usd} / Tn</p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="h-28 flex flex-col items-center justify-center text-center py-4">
                            <Briefcase className="w-5 h-5 text-gray-600 mb-2" />
                            <p className="text-[11px] text-gray-500">Ninguna solicitud o lote en mesa en este momento.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Matched Deals */}
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
                        <span>Historial de Operaciones Cerradas (Matches)</span>
                        <span className="text-[10px] bg-indigo-500/15 text-indigo-400 px-2 py-0.5 rounded-full">Comisión Registrada</span>
                      </h3>

                      <div className="bg-[#181818] border border-[#333] rounded-xl p-4 space-y-3 max-h-[250px] overflow-y-auto">
                        {deals.filter(d => d.sellerId === selectedCustomer.id || d.buyerId === selectedCustomer.id).length > 0 ? (
                          deals.filter(d => d.sellerId === selectedCustomer.id || d.buyerId === selectedCustomer.id).map((d) => {
                            const isSeller = d.sellerId === selectedCustomer.id;
                            return (
                              <div key={d.id} className="bg-[#222] border border-[#333] p-3 rounded-lg text-xs flex flex-col gap-2">
                                <div className="flex justify-between items-center">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${isSeller ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
                                      {isSeller ? 'Vendedor' : 'Comprador'}
                                    </span>
                                    <span className="text-white font-bold capitalize">{d.cropType}</span>
                                  </div>
                                  <span className="text-[9px] font-mono text-gray-500">{d.createdAt ? new Date(d.createdAt).toLocaleDateString() : 'N/A'}</span>
                                </div>
                                
                                <div className="grid grid-cols-3 gap-1.5 py-1.5 border-t border-b border-[#2a2a2a] text-[11px]">
                                  <div>
                                    <p className="text-gray-500">Volumen</p>
                                    <p className="text-white font-semibold">{d.quantity_tn} Tn</p>
                                  </div>
                                  <div>
                                    <p className="text-gray-500">Valor Ton</p>
                                    <p className="text-white font-semibold">USD {isSeller ? d.price_seller : d.price_buyer}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-gray-500">Retorno Neto</p>
                                    <p className="text-green-400 font-bold">USD {d.totalCommission?.toLocaleString() || 0}</p>
                                  </div>
                                </div>

                                <div className="flex justify-between items-center text-[10px]">
                                  <span className="text-gray-500">Contraparte:</span>
                                  <span className="text-white font-medium select-all">{isSeller ? d.buyerName : d.sellerName}</span>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="h-28 flex flex-col items-center justify-center text-center py-4">
                            <Award className="w-5 h-5 text-gray-600 mb-2" />
                            <p className="text-[11px] text-gray-500">No hay transacciones liquidadas con este cliente.</p>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>

                </div>
              )}

              {/* Solapa 3: Bitácora de Conversaciones (Interacciones) */}
              {activeTab === 'bitacora' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  
                  {/* Form de Interacción */}
                  <form onSubmit={handleAddInteraction} className="bg-[#181818] border border-[#333] p-5 rounded-xl space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-green-500 flex items-center gap-1.5"><MessageSquare className="w-4 h-4" /> Registrar Nota, Llamada o Avance de Campo</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Medio de Contacto</label>
                        <select 
                          value={newInteractionType} 
                          onChange={(e) => setNewInteractionType(e.target.value)}
                          className="w-full bg-[#222] border border-[#444] rounded-lg px-3 py-2 text-xs text-white focus:border-green-500 outline-none"
                        >
                          <option value="Llamada">📞 Llamada Telefónica</option>
                          <option value="WhatsApp">💬 Mensaje de WhatsApp</option>
                          <option value="Email">✉️ Correo Electrónico</option>
                          <option value="Reunión">🤝 Visita al Campo / Agro-almuerzo</option>
                          <option value="Negocio">📈 Acuerdo / Cierre de Campaña</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Fecha</label>
                        <input 
                          type="date"
                          value={newInteractionDate}
                          onChange={(e) => setNewInteractionDate(e.target.value)}
                          className="w-full bg-[#222] border border-[#444] rounded-lg px-3 py-2 text-xs text-white focus:border-green-500 outline-none"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-400 mb-1">Escribe la minuta detallada de la conversación</label>
                        <textarea 
                          required
                          value={newInteractionText}
                          onChange={(e) => setNewInteractionText(e.target.value)}
                          rows={3}
                          placeholder="Ej: Nos reunimos para ver la trilla. Rinde excelente. Ofrece canjear 120 Tn de soja por urea para la pre-campaña de trigo. Interesados en fletes directos a puerto puerto..."
                          className="w-full bg-[#222] border border-[#444] rounded-lg px-3 py-2 text-xs text-white focus:border-green-500 outline-none resize-none"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button 
                        type="submit" 
                        className="bg-green-600 hover:bg-green-700 text-white font-medium text-xs px-5 py-2 rounded-lg flex items-center gap-1.5 transition-colors shadow"
                      >
                        <PlusCircle className="w-4 h-4" /> Guardar Nota Histórica
                      </button>
                    </div>
                  </form>

                  {/* Cronología */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Historial Reciente de Contactos</h3>
                    
                    <div className="relative border-l border-[#333] pl-4 ml-2 space-y-4">
                      {interactions.length > 0 ? (
                        interactions.map((item) => {
                          let badgeStyle = 'bg-[#333] text-gray-300';
                          if (item.type === 'Llamada') badgeStyle = 'bg-blue-950/40 text-blue-400 border border-blue-900/30';
                          if (item.type === 'WhatsApp') badgeStyle = 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/30';
                          if (item.type === 'Email') badgeStyle = 'bg-indigo-950/40 text-indigo-400 border border-indigo-900/30';
                          if (item.type === 'Reunión') badgeStyle = 'bg-amber-950/40 text-amber-500 border border-amber-900/30';
                          if (item.type === 'Negocio') badgeStyle = 'bg-pink-950/40 text-pink-400 border border-pink-900/30';

                          return (
                            <div key={item.id} className="relative group animate-in slide-in-from-left-2 duration-150">
                              <div className="absolute -left-[21px] top-1.5 w-2 h-2 bg-green-500 rounded-full border-2 border-[#1e1e1e]" />
                              <div className="bg-[#181818] border border-[#333] hover:border-[#444] p-4 rounded-xl space-y-2 transition-all">
                                <div className="flex justify-between items-center">
                                  <div className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${badgeStyle}`}>
                                      {item.type}
                                    </span>
                                    <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                      <Calendar className="w-3 h-3" /> {item.date}
                                    </span>
                                  </div>
                                  <button 
                                    onClick={() => handleDeleteInteraction(item.id)}
                                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-500 p-1 rounded hover:bg-[#222] transition-all"
                                    title="Borrar entrada de la bitácora"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <p className="text-gray-300 leading-normal text-xs whitespace-pre-wrap">{item.note}</p>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="bg-[#161616] rounded-xl border border-[#2a2a2a] p-6 text-center text-xs text-gray-500">
                          <p>Todavía no se registraron llamadas o notas para este productor. Ingrese una arriba para mantener la bitácora activa.</p>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              )}

              {/* Solapa 4: Agenda y Cronograma del Productor (Tareas) */}
              {activeTab === 'tareas' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  
                  {/* Creación de Alertas */}
                  <form onSubmit={handleCreateClientTask} className="bg-[#181818] border border-[#333] p-5 rounded-xl space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-green-500 flex items-center gap-1.5"><Calendar className="w-4 h-4" /> Registrar Alerta / Compromiso de Agenda</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-400 mb-1">Título de la Alerta / Compromiso</label>
                        <input 
                          type="text" 
                          required
                          value={newClientTaskTitle}
                          onChange={(e) => setNewClientTaskTitle(e.target.value)}
                          placeholder="Ej: Llamar antes del vencimiento del fijar de soja..."
                          className="w-full bg-[#222] border border-[#444] rounded-lg px-3 py-2 text-xs text-white focus:border-green-500 outline-none"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Fecha Límite</label>
                        <input 
                          type="date"
                          required
                          value={newClientTaskDueDate}
                          onChange={(e) => setNewClientTaskDueDate(e.target.value)}
                          className="w-full bg-[#222] border border-[#444] rounded-lg px-3 py-2 text-xs text-white focus:border-green-500 outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Categoría</label>
                        <select 
                          value={newClientTaskCategory} 
                          onChange={(e: any) => setNewClientTaskCategory(e.target.value)}
                          className="w-full bg-[#222] border border-[#444] rounded-lg px-3 py-2 text-xs text-white focus:border-green-500 outline-none"
                        >
                          <option value="seguimiento">Seguimiento Comercial</option>
                          <option value="siembra">Control de Pre-Siembra</option>
                          <option value="cosecha">Coordinar Trilla / Logística</option>
                          <option value="cobro">Cierre / Facturación / Cobro</option>
                          <option value="documentacion">Papeleo / Firmas Canje</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button 
                        type="submit" 
                        className="bg-green-600 hover:bg-green-700 text-white font-medium text-xs px-5 py-2 rounded-lg flex items-center gap-1.5 transition-colors shadow"
                      >
                        <PlusCircle className="w-4 h-4" /> Vincular a Agenda de Cooperativa
                      </button>
                    </div>
                  </form>

                  {/* Listado de Tareas */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Compromisos Vinculados a este Productor</h3>
                    
                    <div className="bg-[#181818] border border-[#333] rounded-xl overflow-hidden divide-y divide-[#2a2a2a]">
                      {clientTasks.length > 0 ? (
                        clientTasks.map((t) => {
                          const isCompleted = t.status === 'completada';
                          return (
                            <div key={t.id} className={`p-4 flex items-center justify-between gap-4 transition-all ${isCompleted ? 'bg-[#151515]/40 opacity-55' : 'hover:bg-[#202020]'}`}>
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <button 
                                  type="button"
                                  onClick={() => handleToggleClientTask(t.id, t.status)} 
                                  className="text-gray-400 hover:text-green-400 p-1 rounded-md hover:bg-[#222] transition-colors flex-shrink-0"
                                >
                                  {isCompleted ? (
                                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                                  ) : (
                                    <Circle className="w-5 h-5 text-gray-500" />
                                  )}
                                </button>
                                
                                <div className="min-w-0">
                                  <p className={`text-xs font-semibold ${isCompleted ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                                    {t.taskTitle}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-2 mt-1">
                                    <span className="text-[9px] uppercase font-bold text-gray-400 bg-[#252525] px-2 py-0.5 rounded border border-[#333]">
                                      {t.category}
                                    </span>
                                    <span className={`text-[9px] font-mono flex items-center gap-1 ${new Date(t.dueDate).getTime() < new Date().getTime() && !isCompleted ? 'text-red-400 font-bold' : 'text-gray-500'}`}>
                                      <Clock className="w-3 h-3" /> Vence: {new Date(t.dueDate + 'T12:00:00').toLocaleDateString()}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <button 
                                onClick={() => handleDeleteClientTask(t.id)} 
                                className="text-gray-500 hover:text-red-400 p-1.5 rounded hover:bg-[#252525] transition-colors"
                                title="Remover de la agenda"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-8 text-center text-xs text-gray-500">
                          <p>No se registran alertas inmediatas para este productor en el planificador.</p>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              )}

            </div>
          )}

          {(isAddingNewCustomer || isEditingCustomer) && (
            <div className="animate-in fade-in zoom-in-95 duration-200">
              <div className="border-b border-[#333] pb-6 mb-6">
                <h2 className="text-2xl font-bold text-white">{isEditingCustomer ? 'Editar Cliente' : 'Nuevo Cliente Agropecuario'}</h2>
                <p className="text-gray-400 mt-1">Completa o actualiza la ficha del cliente.</p>
              </div>

              <form onSubmit={isEditingCustomer ? handleUpdateCustomer : handleAddCustomer} className="space-y-8">
                
                {/* 1. Datos del Cliente */}
                <div className="bg-[#252525] p-6 rounded-xl border border-[#333]">
                  <h3 className="text-lg font-bold text-white mb-4 border-b border-[#333] pb-2">1. Datos Básicos y Contacto</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2">
                       <label className="block text-sm font-medium text-gray-400 mb-1">Nombre / Razón Social <span className="text-red-500">*</span></label>
                       <input required type="text" name="name" value={formData.name} onChange={handleFormChange} className="w-full bg-[#1e1e1e] border border-[#444] rounded-lg px-4 py-2.5 text-white focus:border-green-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">CUIT</label>
                      <input type="text" name="cuit" value={formData.cuit || ''} onChange={handleFormChange} className="w-full bg-[#1e1e1e] border border-[#444] rounded-lg px-4 py-2.5 text-white focus:border-green-500 outline-none" placeholder="Ej: 20-12345678-9" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Teléfono</label>
                      <input type="tel" name="phone" value={formData.phone || ''} onChange={handleFormChange} className="w-full bg-[#1e1e1e] border border-[#444] rounded-lg px-4 py-2.5 text-white focus:border-green-500 outline-none" placeholder="Ej: +54 9 11..." />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
                      <input type="email" name="email" value={formData.email || ''} onChange={handleFormChange} className="w-full bg-[#1e1e1e] border border-[#444] rounded-lg px-4 py-2.5 text-white focus:border-green-500 outline-none" placeholder="correo@ejemplo.com" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Estado</label>
                      <select name="status" value={formData.status || 'activo'} onChange={handleFormChange} className="w-full bg-[#1e1e1e] border border-[#444] rounded-lg px-4 py-2.5 text-white focus:border-green-500 outline-none">
                        <option value="activo">Activo</option>
                        <option value="inactivo">Inactivo</option>
                        <option value="suspendido">Suspendido</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Año Fiscal</label>
                      <select name="anoFiscal" value={formData.anoFiscal} onChange={handleFormChange} className="w-full bg-[#1e1e1e] border border-[#444] rounded-lg px-4 py-2.5 text-white focus:border-green-500 outline-none">
                        <option value="FY2324">FY2324</option><option value="FY2425">FY2425</option><option value="FY2526">FY2526</option><option value="FY2627">FY2627</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Tipo de Cliente</label>
                      <select name="tipoCliente" value={formData.tipoCliente} onChange={handleFormChange} className="w-full bg-[#1e1e1e] border border-[#444] rounded-lg px-4 py-2.5 text-white focus:border-green-500 outline-none">
                        <option value="Prospecto">Prospecto</option><option value="Ventas">Ventas</option><option value="Clave">Clave</option><option value="Estratégico">Estratégico</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Categoría</label>
                      <select name="categoria" value={formData.categoria} onChange={handleFormChange} className="w-full bg-[#1e1e1e] border border-[#444] rounded-lg px-4 py-2.5 text-white focus:border-green-500 outline-none">
                        <option value="Productor">Productor</option><option value="Acopiador">Acopiador</option><option value="Canjeador">Canjeador</option><option value="Otro">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Provincia</label>
                      <select
                        value={formProvincia}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormProvincia(val);
                          setFormLocalidad('');
                          setCustomLocalidad('');
                          updateZonaField(val, '', '');
                        }}
                        className="w-full bg-[#1e1e1e] border border-[#444] rounded-lg px-4 py-2.5 text-white focus:border-green-500 outline-none"
                      >
                        <option value="">-- Seleccionar Provincia --</option>
                        {PROVINCES.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                        <option value="Otra">Otra Provincia / Exterior...</option>
                      </select>
                    </div>
                    {formProvincia && formProvincia !== 'Otra' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Localidad / Zona</label>
                        <select
                          value={formLocalidad}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormLocalidad(val);
                            if (val !== 'Otro') {
                              setCustomLocalidad('');
                            }
                            updateZonaField(formProvincia, val, val === 'Otro' ? customLocalidad : '');
                          }}
                          className="w-full bg-[#1e1e1e] border border-[#444] rounded-lg px-4 py-2.5 text-white focus:border-green-500 outline-none"
                        >
                          <option value="">-- Seleccionar Localidad --</option>
                          {ARGENTINE_REGIONS[formProvincia]?.map(loc => (
                            <option key={loc} value={loc}>{loc}</option>
                          ))}
                          <option value="Otro">Otro (Ingresar manualmente)...</option>
                        </select>
                      </div>
                    )}
                    {(formProvincia === 'Otra' || formLocalidad === 'Otro') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Escribir Localidad / Zona Manualmente</label>
                        <input
                          type="text"
                          required
                          value={customLocalidad}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomLocalidad(val);
                            updateZonaField(formProvincia, formLocalidad, val);
                          }}
                          className="w-full bg-[#1e1e1e] border border-[#444] rounded-lg px-4 py-2.5 text-white focus:border-green-500 outline-none"
                          placeholder="Ej: Marcos Juárez"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Hectáreas Propias</label>
                       <input type="number" name="hectareasPropias" value={formData.hectareasPropias} onChange={handleFormChange} className="w-full bg-[#1e1e1e] border border-[#444] rounded-lg px-4 py-2.5 text-white focus:border-green-500 outline-none" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Hectáreas Alquiladas</label>
                       <input type="number" name="hectareasAlquiladas" value={formData.hectareasAlquiladas} onChange={handleFormChange} className="w-full bg-[#1e1e1e] border border-[#444] rounded-lg px-4 py-2.5 text-white focus:border-green-500 outline-none" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Has. Ganadería</label>
                       <input type="number" name="hasGanaderia" value={formData.hasGanaderia} onChange={handleFormChange} className="w-full bg-[#1e1e1e] border border-[#444] rounded-lg px-4 py-2.5 text-white focus:border-green-500 outline-none" placeholder="0" />
                    </div>
                  </div>
                </div>

                {/* 2. Granos */}
                <div className="bg-[#252525] p-6 rounded-xl border border-[#333]">
                  <h3 className="text-lg font-bold text-white mb-4 border-b border-[#333] pb-2">2. Negocio Agrícola (Granos)</h3>
                  
                  <div className="space-y-6">
                    {/* Cultivos Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                       <div className="bg-[#1e1e1e] p-4 rounded-lg border border-[#444]">
                         <h4 className="font-bold text-green-400 mb-3 uppercase text-xs tracking-wider">Soja</h4>
                         <div className="space-y-3">
                           <div><label className="text-xs text-gray-400 mb-1 block">Has Sembradas</label><input type="number" name="hasSoja" value={formData.hasSoja} onChange={handleFormChange} className="w-full bg-[#252525] rounded px-3 py-1.5 text-white text-sm outline-none" /></div>
                           <div><label className="text-xs text-gray-400 mb-1 block">Rto Estimado (kg/ha)</label><input type="number" name="rtoSjHa" value={formData.rtoSjHa} onChange={handleFormChange} className="w-full bg-[#252525] rounded px-3 py-1.5 text-white text-sm outline-none" /></div>
                           <div><label className="text-xs text-gray-400 mb-1 block">Precio Obj. (USD)</label><input type="number" name="precioObjetivoSoja" value={formData.precioObjetivoSoja} onChange={handleFormChange} className="w-full bg-[#252525] rounded px-3 py-1.5 text-white text-sm outline-none" /></div>
                           <div><label className="text-xs text-gray-400 mb-1 block">% Entrega Cosecha</label><input type="number" name="porcEntregaCosechaSoja" value={formData.porcEntregaCosechaSoja} onChange={handleFormChange} className="w-full bg-[#252525] rounded px-3 py-1.5 text-white text-sm outline-none" /></div>
                         </div>
                       </div>
                       <div className="bg-[#1e1e1e] p-4 rounded-lg border border-[#444]">
                         <h4 className="font-bold text-yellow-400 mb-3 uppercase text-xs tracking-wider">Maíz</h4>
                         <div className="space-y-3">
                           <div><label className="text-xs text-gray-400 mb-1 block">Has Sembradas</label><input type="number" name="hasMaiz" value={formData.hasMaiz} onChange={handleFormChange} className="w-full bg-[#252525] rounded px-3 py-1.5 text-white text-sm outline-none" /></div>
                           <div><label className="text-xs text-gray-400 mb-1 block">Rto Estimado (kg/ha)</label><input type="number" name="rtoMzHa" value={formData.rtoMzHa} onChange={handleFormChange} className="w-full bg-[#252525] rounded px-3 py-1.5 text-white text-sm outline-none" /></div>
                           <div><label className="text-xs text-gray-400 mb-1 block">Precio Obj. (USD)</label><input type="number" name="precioObjetivoMaiz" value={formData.precioObjetivoMaiz} onChange={handleFormChange} className="w-full bg-[#252525] rounded px-3 py-1.5 text-white text-sm outline-none" /></div>
                           <div><label className="text-xs text-gray-400 mb-1 block">% Entrega Cosecha</label><input type="number" name="porcEntregaCosechaMaiz" value={formData.porcEntregaCosechaMaiz} onChange={handleFormChange} className="w-full bg-[#252525] rounded px-3 py-1.5 text-white text-sm outline-none" /></div>
                         </div>
                       </div>
                       <div className="bg-[#1e1e1e] p-4 rounded-lg border border-[#444]">
                         <h4 className="font-bold text-orange-400 mb-3 uppercase text-xs tracking-wider">Trigo</h4>
                         <div className="space-y-3">
                           <div><label className="text-xs text-gray-400 mb-1 block">Has Sembradas</label><input type="number" name="hasTrigo" value={formData.hasTrigo} onChange={handleFormChange} className="w-full bg-[#252525] rounded px-3 py-1.5 text-white text-sm outline-none" /></div>
                           <div><label className="text-xs text-gray-400 mb-1 block">Rto Estimado (kg/ha)</label><input type="number" name="rtoTgHa" value={formData.rtoTgHa} onChange={handleFormChange} className="w-full bg-[#252525] rounded px-3 py-1.5 text-white text-sm outline-none" /></div>
                           <div><label className="text-xs text-gray-400 mb-1 block">Precio Obj. (USD)</label><input type="number" name="precioObjetivoTrigo" value={formData.precioObjetivoTrigo} onChange={handleFormChange} className="w-full bg-[#252525] rounded px-3 py-1.5 text-white text-sm outline-none" /></div>
                           <div><label className="text-xs text-gray-400 mb-1 block">% Entrega Cosecha</label><input type="number" name="porcEntregaCosechaTrigo" value={formData.porcEntregaCosechaTrigo} onChange={handleFormChange} className="w-full bg-[#252525] rounded px-3 py-1.5 text-white text-sm outline-none" /></div>
                         </div>
                       </div>
                       <div className="bg-[#1e1e1e] p-4 rounded-lg border border-[#444]">
                         <h4 className="font-bold text-amber-500 mb-3 uppercase text-xs tracking-wider">Girasol</h4>
                         <div className="space-y-3">
                           <div><label className="text-xs text-gray-400 mb-1 block">Has Sembradas</label><input type="number" name="hasGirasol" value={formData.hasGirasol} onChange={handleFormChange} className="w-full bg-[#252525] rounded px-3 py-1.5 text-white text-sm outline-none" /></div>
                           <div><label className="text-xs text-gray-400 mb-1 block">Rto Estimado (kg/ha)</label><input type="number" name="rtoGsHa" value={formData.rtoGsHa} onChange={handleFormChange} className="w-full bg-[#252525] rounded px-3 py-1.5 text-white text-sm outline-none" /></div>
                           <div><label className="text-xs text-gray-400 mb-1 block">Precio Obj. (USD)</label><input type="number" name="precioObjetivoGirasol" value={formData.precioObjetivoGirasol} onChange={handleFormChange} className="w-full bg-[#252525] rounded px-3 py-1.5 text-white text-sm outline-none" /></div>
                           <div><label className="text-xs text-gray-400 mb-1 block">% Entrega Cosecha</label><input type="number" name="porcEntregaCosechaGirasol" value={formData.porcEntregaCosechaGirasol} onChange={handleFormChange} className="w-full bg-[#252525] rounded px-3 py-1.5 text-white text-sm outline-none" /></div>
                         </div>
                       </div>
                    </div>
                  </div>
                </div>

                {/* 3. Insumos */}
                <div className="bg-[#252525] p-6 rounded-xl border border-[#333]">
                  <h3 className="text-lg font-bold text-white mb-4 border-b border-[#333] pb-2">3. Negocio de Insumos</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Potencial Agroq. (USD)</label>
                      <input type="number" name="potencialAgroq" value={formData.potencialAgroq} onChange={handleFormChange} className="w-full bg-[#1e1e1e] border border-[#444] rounded-lg px-4 py-2.5 text-white focus:border-green-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">PPTO Agroq. (USD)</label>
                      <input type="number" name="budgetAgroq" value={formData.budgetAgroq} onChange={handleFormChange} className="w-full bg-[#1e1e1e] border border-[#444] rounded-lg px-4 py-2.5 text-white focus:border-green-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Potencial Ferti. (USD)</label>
                      <input type="number" name="potencialFerti" value={formData.potencialFerti} onChange={handleFormChange} className="w-full bg-[#1e1e1e] border border-[#444] rounded-lg px-4 py-2.5 text-white focus:border-green-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">PPTO Ferti. (USD)</label>
                      <input type="number" name="budgetFerti" value={formData.budgetFerti} onChange={handleFormChange} className="w-full bg-[#1e1e1e] border border-[#444] rounded-lg px-4 py-2.5 text-white focus:border-green-500 outline-none" />
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <input type="checkbox" name="comprasPreCampana" checked={formData.comprasPreCampana} onChange={handleFormChange} className="w-5 h-5 accent-green-500 bg-[#1e1e1e] rounded" />
                      <label className="text-gray-300">¿Compra Pre-Campaña?</label>
                    </div>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" name="productosPremium" checked={formData.productosPremium} onChange={handleFormChange} className="w-5 h-5 accent-green-500 bg-[#1e1e1e] rounded" />
                      <label className="text-gray-300">¿Busca Prod. Premium?</label>
                    </div>
                  </div>
                </div>

                {/* 4. Seguimiento */}
                <div className="bg-[#252525] p-6 rounded-xl border border-[#333]">
                  <h3 className="text-lg font-bold text-white mb-4 border-b border-[#333] pb-2">4. Gestión y Seguimiento</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                       <label className="block text-sm font-medium text-gray-400 mb-1">Fecha Último Contacto</label>
                       <input type="date" name="fechaUltimoContacto" value={formData.fechaUltimoContacto} onChange={handleFormChange} className="w-full bg-[#1e1e1e] border border-[#444] rounded-lg px-4 py-2.5 text-gray-300 focus:border-green-500 outline-none" />
                    </div>
                    <div>
                       <label className="block text-sm font-medium text-gray-400 mb-1">Fecha Próximos Pasos</label>
                       <input type="date" name="fechaProximosPasos" value={formData.fechaProximosPasos} onChange={handleFormChange} className="w-full bg-[#1e1e1e] border border-[#444] rounded-lg px-4 py-2.5 text-gray-300 focus:border-green-500 outline-none" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-400 mb-1">Próxima Acción (To-Do)</label>
                      <input type="text" name="proximaAccion" value={formData.proximaAccion} onChange={handleFormChange} className="w-full bg-[#1e1e1e] border border-[#444] rounded-lg px-4 py-2.5 text-white focus:border-green-500 outline-none" placeholder="Ej: Llamar por cotización semilla" />
                    </div>
                    <div className="md:col-span-2">
                       <label className="block text-sm font-medium text-gray-400 mb-1">Observaciones</label>
                       <textarea name="observaciones" value={formData.observaciones} onChange={handleFormChange} rows={3} className="w-full bg-[#1e1e1e] border border-[#444] rounded-lg px-4 py-2.5 text-white focus:border-green-500 outline-none resize-none" placeholder="Contexto general..." />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-4 border-t border-[#333] pt-6">
                  <button type="button" onClick={handleBackToList} className="px-6 py-2.5 text-gray-400 hover:text-white font-medium transition-colors">
                    Cancelar
                  </button>
                  <button type="submit" className="bg-green-600 hover:bg-green-700 text-white font-bold px-8 py-2.5 rounded-lg shadow-sm transition-colors">
                    {isEditingCustomer ? 'Guardar Cambios' : 'Registrar Cliente'}
                  </button>
                </div>

              </form>
            </div>
          )}
        </div>
      ) : mainView === 'agenda' ? (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* HEADER con Filtros Rápidos de la Agenda */}
          <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Calendar className="w-5 h-5 text-green-500 animate-pulse" />
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-white">Cronograma y Hojas de Campo</h2>
                <p className="text-xs text-gray-400">Planifica visitas, fletes de cosecha, cobros y cierres comerciales de los productores</p>
              </div>
            </div>
            
            {/* Quick search and filters inside Agenda */}
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              {/* Search input */}
              <div className="relative flex-1 sm:flex-initial min-w-[200px]">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Buscar tarea o productor..."
                  value={agendaSearchTerm}
                  onChange={(e) => setAgendaSearchTerm(e.target.value)}
                  className="w-full bg-[#121212] border border-[#333] hover:border-[#444] rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:border-green-500 outline-none transition-colors"
                />
              </div>

              {/* Category Filter */}
              <select
                value={agendaCategoryFilter}
                onChange={(e) => setAgendaCategoryFilter(e.target.value)}
                className="bg-[#121212] border border-[#333] hover:border-[#444] rounded-lg px-3 py-2 text-xs text-gray-300 focus:border-green-500 outline-none transition-colors"
              >
                <option value="">-- Todas las Categorías --</option>
                <option value="seguimiento">Seguimiento Comercial</option>
                <option value="siembra">Pre-Siembra</option>
                <option value="cosecha">Trilla / Logística</option>
                <option value="cobro">Cierre / Cobro</option>
                <option value="documentacion">Papeleo / Canjes</option>
              </select>

              {/* Status Filter */}
              <select
                value={agendaStatusFilter}
                onChange={(e) => setAgendaStatusFilter(e.target.value)}
                className="bg-[#121212] border border-[#333] hover:border-[#444] rounded-lg px-3 py-2 text-xs text-gray-300 focus:border-green-500 outline-none transition-colors"
              >
                <option value="pendiente">Pendientes</option>
                <option value="completada">Completadas</option>
                <option value="todos">Todas las Alertas</option>
              </select>

              {/* Client Filter */}
              <select
                value={agendaClientFilter}
                onChange={(e) => setAgendaClientFilter(e.target.value)}
                className="bg-[#121212] border border-[#333] hover:border-[#444] rounded-lg px-3 py-2 text-xs text-gray-300 focus:border-green-500 outline-none transition-colors max-w-[200px]"
              >
                <option value="">-- Todos los Productores --</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              {/* Reset button if filters active */}
              {(agendaSearchTerm || agendaCategoryFilter || agendaStatusFilter !== 'pendiente' || agendaClientFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setAgendaSearchTerm('');
                    setAgendaCategoryFilter('');
                    setAgendaStatusFilter('pendiente');
                    setAgendaClientFilter('');
                  }}
                  className="px-3 py-2 bg-red-950/20 text-red-400 hover:text-red-300 border border-red-900/30 rounded-lg text-xs font-semibold transition-colors"
                >
                  Limpiar Filtros
                </button>
              )}
            </div>
          </div>

          {/* SPLIT LAYOUT: LEFT SIDE FOR MONTHLY CALENDAR GRID & DAILY VIEW, RIGHT SIDE FOR FEED & NEW TASK */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* MONTHLY CALENDAR (Span 7) */}
            <div className="lg:col-span-7 space-y-6">
              
              <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-5 shadow-sm">
                
                {/* CALENDAR MONTH NAVIGATOR */}
                <div className="flex items-center justify-between pb-4 border-b border-[#2b2b2b] mb-4">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-extrabold text-white tracking-tight">
                      {MONTHS_SPANISH[currentMonth]}
                    </span>
                    <span className="text-base font-mono text-gray-500">{currentYear}</span>
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handlePrevMonth}
                      className="p-1.5 bg-[#222] border border-[#333] hover:border-[#444] text-gray-400 hover:text-white rounded-lg transition-colors"
                      title="Mes Anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentMonth(new Date().getMonth());
                        setCurrentYear(new Date().getFullYear());
                        setSelectedCalendarDate(new Date().toISOString().split('T')[0]);
                      }}
                      className="px-2.5 py-1.5 bg-[#222] border border-[#333] hover:border-[#444] text-xs text-gray-300 hover:text-white rounded-lg transition-colors font-medium"
                    >
                      Hoy
                    </button>
                    <button
                      type="button"
                      onClick={handleNextMonth}
                      className="p-1.5 bg-[#222] border border-[#333] hover:border-[#444] text-gray-400 hover:text-white rounded-lg transition-colors"
                      title="Siguiente Mes"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* WEEKDAYS HEADERS */}
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                  <span>Lun</span>
                  <span>Mar</span>
                  <span>Mié</span>
                  <span>Jue</span>
                  <span>Vie</span>
                  <span>Sáb</span>
                  <span>Dom</span>
                </div>

                {/* CALENDAR CELLS GRID */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarCells.map((cell, idx) => {
                    const cellTasks = tasksByDateMap[cell.dateString] || [];
                    const pendingCellTasks = cellTasks.filter(t => t.status === 'pendiente');
                    const hasPending = pendingCellTasks.length > 0;
                    const isSelected = selectedCalendarDate === cell.dateString;
                    const isToday = new Date().toISOString().split('T')[0] === cell.dateString;

                    return (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => setSelectedCalendarDate(cell.dateString)}
                        className={`min-h-[50px] sm:min-h-[75px] p-1 sm:p-1.5 rounded-xl border flex flex-col justify-between text-left transition-all relative ${
                          cell.isPadding 
                            ? 'bg-[#151515]/30 border-[#222] text-gray-700' 
                            : 'bg-[#181818] hover:bg-[#202020] text-gray-300'
                        } ${
                          isSelected 
                            ? 'border-green-500 shadow-lg ring-1 ring-green-500/50 bg-green-500/5' 
                            : isToday 
                              ? 'border-indigo-500 border-dashed bg-[#1c1d29]/40' 
                              : 'border-[#2a2a2a]'
                        }`}
                      >
                        {/* Day Number and Alert Badge */}
                        <div className="flex items-center justify-between w-full">
                          <span className={`text-[10px] sm:text-[11px] font-bold ${isToday ? 'text-indigo-400 bg-indigo-500/10 px-1 sm:px-1.5 py-0.5 rounded-md' : 'text-gray-400'}`}>
                            {cell.day}
                          </span>
                          {hasPending && (
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                          )}
                        </div>

                        {/* Mobile Dot Indicators */}
                        <div className="sm:hidden flex gap-0.5 justify-center flex-wrap mt-1">
                          {cellTasks.slice(0, 3).map(task => {
                            let bulletColor = 'bg-gray-500';
                            if (task.category === 'siembra') bulletColor = 'bg-emerald-500';
                            if (task.category === 'cosecha') bulletColor = 'bg-yellow-500';
                            if (task.category === 'cobro') bulletColor = 'bg-amber-600';
                            if (task.category === 'documentacion') bulletColor = 'bg-blue-500';
                            if (task.category === 'seguimiento') bulletColor = 'bg-indigo-500';
                            return <span key={task.id} className={`w-1.5 h-1.5 rounded-full ${bulletColor}`} />;
                          })}
                        </div>

                        {/* Desktop Task Previews */}
                        <div className="hidden sm:block mt-2 space-y-1 w-full overflow-hidden">
                          {cellTasks.slice(0, 2).map(task => {
                            let bulletColor = 'bg-gray-500';
                            if (task.category === 'siembra') bulletColor = 'bg-emerald-500';
                            if (task.category === 'cosecha') bulletColor = 'bg-yellow-500';
                            if (task.category === 'cobro') bulletColor = 'bg-amber-600';
                            if (task.category === 'documentacion') bulletColor = 'bg-blue-500';
                            if (task.category === 'seguimiento') bulletColor = 'bg-indigo-500';

                            return (
                              <div
                                key={task.id}
                                className={`text-[9px] truncate max-w-full leading-tight font-medium rounded-sm px-1 py-0.2 flex items-center gap-1 ${
                                  task.status === 'completada' 
                                    ? 'bg-gray-950/40 text-gray-600 line-through decoration-gray-700' 
                                    : 'bg-white/5 text-gray-200'
                                }`}
                              >
                                <span className={`w-1 h-1 rounded-full ${bulletColor} flex-shrink-0`} />
                                <span className="truncate">{task.taskTitle}</span>
                              </div>
                            );
                          })}
                          
                          {cellTasks.length > 2 && (
                            <div className="text-[8px] text-gray-500 text-center font-bold">
                              + {cellTasks.length - 2} más
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SELECTED DATE TASK LIST */}
              <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-[#2b2b2b] mb-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-green-500" />
                    <span>Compromisos el: {new Date(selectedCalendarDate + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  </h3>
                  <span className="text-[10px] text-gray-500 font-bold bg-[#222] px-2 py-0.5 rounded border border-[#333]">
                    {(tasksByDateMap[selectedCalendarDate] || []).length} Tareas agendadas
                  </span>
                </div>

                <div className="divide-y divide-[#2a2a2a] bg-[#121212] border border-[#2a2a2a] rounded-xl overflow-hidden">
                  {(tasksByDateMap[selectedCalendarDate] || []).length > 0 ? (
                    (tasksByDateMap[selectedCalendarDate] || []).map((t) => {
                      const isCompleted = t.status === 'completada';
                      let catBadge = 'bg-[#222] text-gray-400';
                      if (t.category === 'siembra') catBadge = 'bg-emerald-950/40 text-emerald-400 border border-emerald-920/30';
                      if (t.category === 'cosecha') catBadge = 'bg-yellow-950/40 text-yellow-400 border border-yellow-920/30';
                      if (t.category === 'cobro') catBadge = 'bg-amber-950/40 text-amber-500 border border-amber-920/30';
                      if (t.category === 'documentacion') catBadge = 'bg-blue-950/40 text-blue-400 border border-blue-920/30';
                      if (t.category === 'seguimiento') catBadge = 'bg-indigo-950/40 text-indigo-400 border border-indigo-920/30';

                      return (
                        <div key={t.id} className={`p-4 flex items-center justify-between gap-4 transition-all ${isCompleted ? 'bg-[#151515]/25 opacity-55' : 'hover:bg-white/5'}`}>
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <button
                              type="button"
                              onClick={() => handleToggleClientTask(t.id, t.status)}
                              className="text-gray-400 hover:text-green-400 p-1 rounded-md hover:bg-[#222] transition-colors flex-shrink-0"
                            >
                              {isCompleted ? (
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                              ) : (
                                <Circle className="w-5 h-5 text-gray-600" />
                              )}
                            </button>
                            
                            <div className="min-w-0">
                              <p className={`text-xs font-semibold ${isCompleted ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                                {t.taskTitle}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded border ${catBadge}`}>
                                  {t.category}
                                </span>
                                {t.clientName && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const clObj = clients.find(c => c.id === t.clientId);
                                      if (clObj) {
                                        setSelectedCustomer(clObj);
                                        setViewingCustomerDetails(true);
                                      }
                                    }}
                                    className="text-[10px] text-green-400 hover:underline font-semibold flex items-center gap-1"
                                  >
                                    <User className="w-3 h-3" /> {t.clientName}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteClientTask(t.id)}
                            className="text-gray-600 hover:text-red-400 p-1.5 rounded hover:bg-[#252525] transition-colors"
                            title="Remover de la agenda"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center text-xs text-gray-500 flex flex-col items-center justify-center">
                      <Calendar className="w-6 h-6 text-gray-700 mb-2" />
                      <p>No hay alertas ni compromisos agendados para este día.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setGeneralTaskDueDate(selectedCalendarDate);
                          const formEl = document.getElementById('new-general-task-title');
                          if (formEl) formEl.focus();
                        }}
                        className="text-green-500 hover:underline text-[11px] font-bold mt-1"
                      >
                        Crear una tarea para el {new Date(selectedCalendarDate + 'T12:00:00').toLocaleDateString()}
                      </button>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* AGENDA FEED & CREATION PANEL (Span 5) */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* FORM: AGENDAR NUEVO COMPROMISO */}
              <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-5 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-green-500 flex items-center gap-1.5 pb-3 border-b border-[#2b2b2b] mb-4">
                  <PlusCircle className="w-4.5 h-4.5" />
                  <span>Programar Compromiso del CRM</span>
                </h3>

                <form onSubmit={handleCreateGeneralTask} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">Elegir Productor Agropecuario</label>
                    <select
                      required
                      value={generalTaskClientId}
                      onChange={(e) => setGeneralTaskClientId(e.target.value)}
                      className="w-full bg-[#121212] border border-[#333] rounded-lg px-3 py-2 text-xs text-white focus:border-green-500 outline-none"
                    >
                      <option value="">-- Seleccionar de la Base CRM --</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.zona || 'Sin Zona'})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">Título del Compromiso / Alerta</label>
                    <input
                      type="text"
                      required
                      id="new-general-task-title"
                      value={generalTaskTitle}
                      onChange={(e) => setGeneralTaskTitle(e.target.value)}
                      placeholder="Ej: Reunirse para la firma del canje de semilla de trigo..."
                      className="w-full bg-[#121212] border border-[#333] rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-green-500 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-1">Fecha de la Alerta</label>
                      <input
                        type="date"
                        required
                        value={generalTaskDueDate}
                        onChange={(e) => setGeneralTaskDueDate(e.target.value)}
                        className="w-full bg-[#121212] border border-[#333] rounded-lg px-3 py-2 text-xs text-white focus:border-green-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-1">Vínculo Logístico / Operativo</label>
                      <select
                        value={generalTaskCategory}
                        onChange={(e: any) => setGeneralTaskCategory(e.target.value)}
                        className="w-full bg-[#121212] border border-[#333] rounded-lg px-3 py-2 text-xs text-white focus:border-green-500 outline-none"
                      >
                        <option value="seguimiento">Seguimiento Comercial</option>
                        <option value="siembra">Pre-Siembra</option>
                        <option value="cosecha">Trilla / Logística</option>
                        <option value="cobro">Cierre / Cobro</option>
                        <option value="documentacion">Papeleo / Canjes</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-2 transition-all shadow-sm shadow-green-950/20"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>Inscribir en la Agenda General</span>
                  </button>
                </form>
              </div>

              {/* LIST FEED: COMPROMISOS CRONOLÓGICOS (Futuros / Próximos) */}
              <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-[#2b2b2b] mb-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                    <Filter className="w-4 h-4 text-green-500 animate-pulse" />
                    <span>Compromisos Próximos de la Cooperativa</span>
                  </h3>
                  <span className="text-[10px] text-gray-500 font-extrabold bg-[#222] px-2 py-0.5 rounded border border-[#333]">
                    {filteredAllTasks.length} Resultados
                  </span>
                </div>

                <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                  {filteredAllTasks.length > 0 ? (
                    filteredAllTasks.map((t) => {
                      const isCompleted = t.status === 'completada';
                      let catBadgeColor = 'bg-gray-500/10 text-gray-400 border border-gray-500/20';
                      if (t.category === 'siembra') catBadgeColor = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                      if (t.category === 'cosecha') catBadgeColor = 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
                      if (t.category === 'cobro') catBadgeColor = 'bg-amber-600/10 text-amber-500 border border-amber-600/20';
                      if (t.category === 'documentacion') catBadgeColor = 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
                      if (t.category === 'seguimiento') catBadgeColor = 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20';

                      const isOverdue = new Date(t.dueDate).getTime() < new Date().setHours(0,0,0,0) && !isCompleted;

                      return (
                        <div
                          key={t.id}
                          className={`bg-[#121212] border p-3 rounded-xl flex items-start justify-between gap-3 transition-colors ${
                            isCompleted 
                              ? 'border-[#222] opacity-50' 
                              : isOverdue 
                                ? 'border-red-900/40 hover:border-red-900/65 bg-red-950/5' 
                                : 'border-[#333] hover:border-[#444]'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <button
                              type="button"
                              onClick={() => handleToggleClientTask(t.id, t.status)}
                              className="text-gray-500 hover:text-green-400 p-0.5 mt-0.5 rounded hover:bg-[#202020] transition-colors"
                            >
                              {isCompleted ? (
                                <CheckCircle2 className="w-4.5 h-4.5 text-green-500" />
                              ) : (
                                <Circle className="w-4.5 h-4.5 text-gray-600" />
                              )}
                            </button>

                            <div className="min-w-0">
                              <p className={`text-xs font-bold leading-normal ${isCompleted ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                                {t.taskTitle}
                              </p>
                              
                              <div className="flex flex-wrap items-center gap-2 mt-2">
                                <span className={`text-[8.5px] uppercase font-bold px-1.5 py-0.2 rounded ${catBadgeColor}`}>
                                  {t.category}
                                </span>
                                
                                <span className={`text-[9.5px] font-mono flex items-center gap-1 ${isOverdue ? 'text-red-400 font-bold' : 'text-gray-400'}`}>
                                  <Clock className="w-3 h-3" /> Vence: {new Date(t.dueDate + 'T12:00:00').toLocaleDateString()}
                                </span>
                              </div>

                              {t.clientName && (
                                <div className="mt-2 text-[10px] text-gray-500 flex items-center gap-1">
                                  <span>Productor:</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const clObj = clients.find(c => c.id === t.clientId);
                                      if (clObj) {
                                        setSelectedCustomer(clObj);
                                        setViewingCustomerDetails(true);
                                      }
                                    }}
                                    className="text-green-500 hover:underline font-bold"
                                  >
                                    {t.clientName}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteClientTask(t.id)}
                            className="text-gray-600 hover:text-red-500 p-1 rounded hover:bg-[#202020] transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="bg-[#121212] border border-[#2a2a2a] text-center p-8 rounded-xl text-xs text-gray-500">
                      <Calendar className="w-6 h-6 text-gray-700 mx-auto mb-2" />
                      <p>No se encontraron resultados con los filtros actuales.</p>
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>

        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
          
          {/* 1. SECCIÓN: KPI DASHBOARD INTERACTIVO */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            
            {/* KPI 1: Clientes Activos / Totales */}
            <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-3.5 sm:p-5 flex items-center justify-between shadow-sm relative overflow-hidden group hover:border-green-500/20 transition-all duration-300">
              <div className="space-y-0.5 sm:space-y-1 min-w-0">
                <p className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-500 truncate">Clientes Total</p>
                <p className="text-xl sm:text-3xl font-extrabold text-white tracking-tight">{computedStats.total}</p>
                <p className="text-[9px] sm:text-[10px] text-gray-400 font-medium truncate">
                  <span className="text-green-500 font-bold">{computedStats.activeQty}</span> activos
                </p>
              </div>
              <div className="p-2 sm:p-3 bg-green-500/10 rounded-xl group-hover:scale-110 transition-transform shrink-0">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />
              </div>
              <div className="absolute bottom-0 left-0 h-1 bg-green-600/30 w-full" />
            </div>

            {/* KPI 2: Superficie Administrada */}
            <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-3.5 sm:p-5 flex items-center justify-between shadow-sm relative overflow-hidden group hover:border-[#10b981]/20 transition-all duration-300">
              <div className="space-y-0.5 sm:space-y-1 min-w-0">
                <p className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-500 truncate">Superficie Total</p>
                <p className="text-xl sm:text-3xl font-extrabold text-emerald-400 tracking-tight truncate">
                  {computedStats.totHectares.toLocaleString()} <span className="text-xs sm:text-base font-normal text-gray-400">ha</span>
                </p>
                <p className="text-[9px] sm:text-[10px] text-gray-400 font-medium truncate">Propias y Alquiladas</p>
              </div>
              <div className="p-2 sm:p-3 bg-emerald-500/10 rounded-xl group-hover:scale-110 transition-transform shrink-0">
                <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
              </div>
              <div className="absolute bottom-0 left-0 h-1 bg-emerald-600/30 w-full" />
            </div>

            {/* KPI 3: Estimación de Consumo Insumos */}
            <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-3.5 sm:p-5 flex items-center justify-between shadow-sm relative overflow-hidden group hover:border-yellow-500/20 transition-all duration-300">
              <div className="space-y-0.5 sm:space-y-1 min-w-0">
                <p className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-500 truncate">Potencial Insumos</p>
                <p className="text-lg sm:text-3xl font-extrabold text-yellow-500 tracking-tight truncate">
                  USD {computedStats.totPotential.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
                <p className="text-[9px] sm:text-[10px] text-gray-400 font-medium truncate">Agroquímicos</p>
              </div>
              <div className="p-2 sm:p-3 bg-yellow-500/10 rounded-xl group-hover:scale-110 transition-transform shrink-0">
                <Award className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" />
              </div>
              <div className="absolute bottom-0 left-0 h-1 bg-yellow-600/30 w-full" />
            </div>

            {/* KPI 4: Tasa de Relevamiento */}
            <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-3.5 sm:p-5 flex items-center justify-between shadow-sm relative overflow-hidden group hover:border-indigo-500/20 transition-all duration-300">
              <div className="space-y-0.5 sm:space-y-1 min-w-0">
                <p className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-500 truncate">Socio Relevado</p>
                <p className="text-xl sm:text-3xl font-extrabold text-indigo-400 tracking-tight">{computedStats.relevamientoPct}%</p>
                <p className="text-[9px] sm:text-[10px] text-gray-400 font-medium truncate">
                  <span className="text-indigo-400 font-bold">{computedStats.relevadoQty}</span> socios
                </p>
              </div>
              <div className="p-2 sm:p-3 bg-indigo-500/10 rounded-xl group-hover:scale-110 transition-transform shrink-0">
                <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />
              </div>
              <div className="absolute bottom-0 left-0 h-1 bg-indigo-600/30 w-full" />
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5 space-y-4 min-w-0">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar productor, zona o tag..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 hover:border-zinc-600 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-green-500 transition-all font-medium"
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isAnyFilterActive && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="text-xs font-semibold text-amber-400 hover:text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 rounded-xl"
                  >
                    Restablecer
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowFilters(open => !open)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
                    showFilters || advancedFilterCount > 0
                      ? 'bg-green-600 text-white border-green-500'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:text-white'
                  }`}
                >
                  <Filter className="w-4 h-4" />
                  Filtros Avanzados
                  {advancedFilterCount > 0 && (
                    <span className="min-w-5 h-5 px-1 rounded-full bg-black/20 flex items-center justify-center font-mono">
                      {advancedFilterCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {showFilters && (
              <div className="space-y-4 pt-2 border-t border-zinc-800">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <select
                    value={filterProvincia}
                    onChange={e => {
                      setFilterProvincia(e.target.value);
                      setFilterLocalidad('');
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 hover:border-zinc-600 rounded-xl px-3 py-2.5 text-xs text-zinc-300 focus:outline-none focus:border-green-500"
                  >
                    <option value="">Todas las Provincias</option>
                    {PROVINCES.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                    <option value="Otra">Otra Provincia / Exterior</option>
                  </select>

                  <select
                    value={filterLocalidad}
                    onChange={e => setFilterLocalidad(e.target.value)}
                    disabled={!filterProvincia || filterProvincia === 'Otra'}
                    className="w-full bg-zinc-800 border border-zinc-700 hover:border-zinc-600 rounded-xl px-3 py-2.5 text-xs text-zinc-300 focus:outline-none focus:border-green-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <option value="">Todas las Localidades</option>
                    {filterProvincia && ARGENTINE_REGIONS[filterProvincia]?.map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>

                  <select
                    value={filterTipoCliente}
                    onChange={e => setFilterTipoCliente(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 hover:border-zinc-600 rounded-xl px-3 py-2.5 text-xs text-zinc-300 focus:outline-none focus:border-green-500"
                  >
                    <option value="">Todos los Tipos de Cuenta</option>
                    <option value="Prospecto">Prospecto</option>
                    <option value="Ventas">Ventas</option>
                    <option value="Clave">Clave</option>
                    <option value="Estratégico">Estratégico</option>
                  </select>

                  <select
                    value={filterCategoria}
                    onChange={e => setFilterCategoria(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 hover:border-zinc-600 rounded-xl px-3 py-2.5 text-xs text-zinc-300 focus:outline-none focus:border-green-500"
                  >
                    <option value="">Todas las Categorías</option>
                    <option value="Productor">Productor</option>
                    <option value="Acopiador">Acopiador</option>
                    <option value="Canjeador">Canjeador</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <select
                    value={filterAnoFiscal}
                    onChange={e => setFilterAnoFiscal(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 hover:border-zinc-600 rounded-xl px-3 py-2.5 text-xs text-zinc-300 focus:outline-none focus:border-green-500"
                  >
                    <option value="">Todos los Años Fiscales</option>
                    <option value="FY2324">FY2324</option>
                    <option value="FY2425">FY2425</option>
                    <option value="FY2526">FY2526</option>
                    <option value="FY2627">FY2627</option>
                  </select>

                  <select
                    value={filterRelevado}
                    onChange={e => setFilterRelevado(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 hover:border-zinc-600 rounded-xl px-3 py-2.5 text-xs text-zinc-300 focus:outline-none focus:border-green-500"
                  >
                    <option value="">Estado de Relevamiento</option>
                    <option value="Sí">Socio Relevado</option>
                    <option value="No">No Relevado</option>
                  </select>

                  <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 hover:border-zinc-600 rounded-xl px-3 py-2.5 text-xs text-zinc-300 focus:outline-none focus:border-green-500"
                  >
                    <option value="">Todos los Estados</option>
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                    <option value="suspendido">Suspendido</option>
                  </select>

                  <div className="flex gap-1.5">
                    <select
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value)}
                      className="flex-1 bg-zinc-800 border border-zinc-700 hover:border-zinc-600 rounded-xl px-2.5 py-2.5 text-xs text-zinc-300 focus:outline-none focus:border-green-500"
                    >
                      <option value="name">Ordenar por: Nombre</option>
                      <option value="hectareasTotales">Hectáreas Operadas</option>
                      <option value="potencialTotal">PPTO / Potencial USD</option>
                      <option value="fechaUltimoContacto">Último Contacto</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                      className="bg-green-500/10 border border-zinc-700 hover:border-zinc-600 text-green-400 p-2 rounded-xl flex items-center justify-center"
                      title={sortOrder === 'asc' ? 'Orden Ascendente' : 'Orden Descendente'}
                    >
                      <ArrowUpDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <ClientTable
            clients={filteredAndSortedCustomers as ClientListItem[]}
            onSelect={customer => {
              setSelectedCustomer(customer);
              setViewingCustomerDetails(true);
            }}
            onOpenWhatsApp={handleOpenWaModal}
            onCopyCuit={cuit => {
              navigator.clipboard.writeText(cuit);
              addToast('CUIT copiado al portapapeles 📋', 'success');
            }}
            onResetFilters={handleClearFilters}
          />

          {/* 4. SECCIÓN: ANALÍTICAS GRÁFICAS INTEGRALES */}
          {filteredAndSortedCustomers.length > 0 && (
            <>
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mt-12 mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-green-500 animate-pulse" />
                <span>Analítica Integral del Portfolio Filtrado</span>
              </h2>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Gráfico de Hectáreas */}
                <div className="bg-[#1a1a1a] p-6 rounded-2xl border border-[#333] hover:border-[#444] transition-colors shadow">
                  <h3 className="font-semibold text-gray-300 text-sm mb-6 flex justify-between">
                    <span>Distribución de Hectáreas por Región</span>
                    <span className="text-xs text-green-500 font-mono">Consolidadas (Propias + Renta)</span>
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData.hectaresByZoneData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#252525" vertical={false} />
                        <XAxis dataKey="name" stroke="#666" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis stroke="#666" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v.toLocaleString()}`} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#181818', border: '1px solid #333', borderRadius: '12px', color: '#fff', fontSize: '12px' }} 
                          labelClassName="font-bold text-white mb-1"
                        />
                        <Bar dataKey="hectareas" fill="#22c55e" radius={[4, 4, 0, 0]} name="Has Totales" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Composición de Portfolio */}
                <div className="bg-[#1a1a1a] p-6 rounded-2xl border border-[#333] hover:border-[#444] transition-colors shadow">
                  <h3 className="font-semibold text-gray-300 text-sm mb-6 flex justify-between">
                    <span>Composición de Clientes por Estrategia</span>
                    <span className="text-xs text-yellow-500 font-mono">Segmentos CRM</span>
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData.clientsByTypeData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {chartData.clientsByTypeData.map((_: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} stroke="rgba(0,0,0,0)" />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#181818', border: '1px solid #333', borderRadius: '12px' }} 
                          itemStyle={{ color: '#fff', fontSize: '11px' }} 
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>
            </>
          )}

        </div>
      )}

      {/* WhatsApp Template Modal */}
      <WhatsappTemplateModal
        isOpen={waModalOpen}
        onClose={() => setWaModalOpen(false)}
        phone={waModalPhone}
        clientId={waModalClientId}
        clientName={waModalClientName}
      />

      {/* CSV Column Mapping Importer Modal */}
      <CSVMappingModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        onImportComplete={() => {
          setIsCsvModalOpen(false);
        }}
      />
    </div>
  );
}
