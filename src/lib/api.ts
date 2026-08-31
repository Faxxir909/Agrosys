const getBaseUrl = () => {
  return typeof window !== 'undefined' ? window.location.origin : '';
};

// Centralized request wrapper with headers
async function request(path: string, options: RequestInit = {}): Promise<any> {
  const url = `${getBaseUrl()}${path}`;
  const headers = new Headers(options.headers || {});
  
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Inject local JWT authentication header if available
  if (typeof window !== 'undefined') {
    const token = window.localStorage.getItem('agro_jwt_token');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const response = await fetch(url, { ...options, headers });
  
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined' && !path.startsWith('/api/auth/login')) {
      window.localStorage.removeItem('agro_jwt_token');
      window.localStorage.removeItem('agro_user_data');
    }
    const errorText = await response.text();
    let errorMessage = errorText;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed && parsed.error) {
        errorMessage = parsed.error;
      }
    } catch (e) {}
    throw new Error(errorMessage || `HTTP error! Status: ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Auth
  auth: {
    login: (data: any) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    register: (data: any) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    getAuditLogs: () => request('/api/audit-logs')
  },

  // WhatsApp Templates & Manual Message
  whatsappTemplates: {
    list: () => request('/api/whatsapp-templates'),
    create: (data: { name: string; content: string }) => 
      request('/api/whatsapp-templates', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/api/whatsapp-templates/${id}`, { method: 'DELETE' })
  },
  // Whatsapp Message Send / Match notification
  whatsapp: {
    status: () => request('/api/whatsapp/status'),
    start: () => request('/api/whatsapp/start', { method: 'POST' }),
    reset: () => request('/api/whatsapp/reset', { method: 'POST' }),
    getSettings: () => request('/api/whatsapp/settings'),
    updateSettings: (data: { bypassHeuristic: boolean; matchTolerance: number }) =>
      request('/api/whatsapp/settings', { method: 'POST', body: JSON.stringify(data) }),
    sendMessage: (data: { phone: string; message: string; clientId?: string }) => 
      request('/api/whatsapp/send-message', { method: 'POST', body: JSON.stringify(data) }),
    notifyMatch: (data: {
      sellerId: string;
      buyerId: string;
      offerId: string;
      demandId: string;
      cropType: string;
      overlapQuantity: number;
      price: number;
      sellerPrice?: number;
      buyerPrice?: number;
      commissionPct?: number;
    }) =>
      request('/api/whatsapp/notify-match', { method: 'POST', body: JSON.stringify(data) })
  },

  // Users
  users: {
    me: () => request('/api/users/me'),
    updateMe: (data: { name?: string; role?: string }) => 
      request('/api/users/me', { method: 'PATCH', body: JSON.stringify(data) })
  },

  // Clients
  clients: {
    list: () => request('/api/clients'),
    create: (data: any) => request('/api/clients', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/api/clients/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/api/clients/${id}`, { method: 'DELETE' }),
    listInteractions: (clientId: string) => request(`/api/clients/${clientId}/interactions`),
    createInteraction: (clientId: string, data: any) => 
      request(`/api/clients/${clientId}/interactions`, { method: 'POST', body: JSON.stringify(data) }),
    deleteInteraction: (clientId: string, id: string) => 
      request(`/api/clients/${clientId}/interactions/${id}`, { method: 'DELETE' })
  },

  // Planted Areas
  plantedAreas: {
    list: (clientId: string) => request(`/api/clients/${clientId}/planted-areas`),
    create: (clientId: string, data: any) => 
      request(`/api/clients/${clientId}/planted-areas`, { method: 'POST', body: JSON.stringify(data) }),
    delete: (clientId: string, areaId: string) => 
      request(`/api/clients/${clientId}/planted-areas/${areaId}`, { method: 'DELETE' })
  },

  // Opportunities
  opportunities: {
    list: () => request('/api/opportunities'),
    matches: () => request('/api/opportunities/matches'),
    parseText: (text: string) => request('/api/parse-opportunity-text', {
      method: 'POST',
      body: JSON.stringify({ text })
    }),
    create: (data: any) => request('/api/opportunities', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/api/opportunities/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/api/opportunities/${id}`, { method: 'DELETE' }),
    parseAudio: (data: { audio: string; mimeType: string }) =>
      request('/api/parse-audio', { method: 'POST', body: JSON.stringify(data) })
  },

  // WhatsApp Alerts
  whatsappAlerts: {
    list: () => request('/api/whatsapp-alerts'),
    create: (data: any) => request('/api/whatsapp-alerts', { method: 'POST', body: JSON.stringify(data) }),
    updateStatus: (id: string, status: string) => 
      request(`/api/whatsapp-alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    delete: (id: string) => request(`/api/whatsapp-alerts/${id}`, { method: 'DELETE' })
  },

  // Deals
  deals: {
    list: () => request('/api/deals'),
    create: (data: any) => request('/api/deals', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/api/deals/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },

  // Tasks
  tasks: {
    list: () => request('/api/tasks'),
    create: (data: any) => request('/api/tasks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/api/tasks/${id}`, { method: 'DELETE' })
  },

  // Historical Pizarra History
  pizarraHistory: () => request('/api/pizarra-history')
};
