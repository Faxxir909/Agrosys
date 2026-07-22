import { auth } from './firebase';

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
  let tokenFound = false;
  if (typeof window !== 'undefined') {
    const token = window.localStorage.getItem('agro_jwt_token');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
      tokenFound = true;
    }
  }

  // Fallback to Firebase authentication if local token is not available
  if (!tokenFound) {
    const currentUser = auth.currentUser;
    if (currentUser) {
      headers.set('X-User-Id', currentUser.uid);
      try {
        const token = await currentUser.getIdToken();
        headers.set('Authorization', `Bearer ${token}`);
      } catch (e) {
        console.warn('[API] Could not get ID token, falling back to User ID header:', e);
      }
    }
  }

  const response = await fetch(url, { ...options, headers });
  
  if (!response.ok) {
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
    sendMessage: (data: { phone: string; message: string; clientId?: string }) => 
      request('/api/whatsapp/send-message', { method: 'POST', body: JSON.stringify(data) }),
    notifyMatch: (data: { sellerId: string; buyerId: string; cropType: string; overlapQuantity: number; price: number }) =>
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
