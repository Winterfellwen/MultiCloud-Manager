const API_BASE = '/api';

class APIError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = 'APIError';
  }
}

class APIClient {
  constructor() {
    this.token = localStorage.getItem('token');
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('token');
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(this.token && { 'Authorization': `Bearer ${this.token}` }),
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new APIError(response.status, error.message || `HTTP ${response.status}`);
      }

      return response.json();
    } catch (err) {
      if (err.name === 'APIError') throw err;
      throw new APIError(0, err.message || 'Network error');
    }
  }

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
}

const api = new APIClient();

export const authAPI = {
  login: (username, password) => api.post('/auth/login', { username, password }),
};

export const accountsAPI = {
  list: () => api.get('/accounts'),
  create: (data) => api.post('/accounts', data),
  update: (id, data) => api.post(`/accounts/${id}`, data),
  delete: (id) => api.delete(`/accounts/${id}`),
  sync: (id) => api.post(`/accounts/${id}/sync`),
  syncAll: () => api.post('/resources/sync'),
};

export const resourcesAPI = {
  list: () => api.get('/resources'),
  action: (id, action) => api.post(`/resources/${id}/${action}`),
  batchAction: (ids, action) => api.post(`/resources/batch/${action}`, { ids }),
};

export const syncAPI = {
  status: () => api.get('/resources/sync/status'),
  logs: () => api.get('/resources/sync_logs'),
};

export const costAPI = {
  overview: () => api.get('/cost/overview'),
  trend: () => api.get('/cost/trend'),
  breakdown: () => api.get('/cost/breakdown'),
  suggestions: () => api.get('/cost/optimization/suggestions'),
};

export const chatAPI = {
  sessions: () => api.get('/agent/sessions'),
  createSession: (data) => api.post('/agent/sessions', data),
  getSession: (id) => api.get(`/agent/sessions/${id}`),
  deleteSession: (id) => api.delete(`/agent/sessions/${id}`),
  stream: (sessionId, message) => {
    return new EventSource(`${API_BASE}/agent/sessions/${sessionId}/stream?message=${encodeURIComponent(message)}`);
  },
};

export const skillsAPI = {
  list: () => api.get('/skills'),
  get: (name) => api.get(`/skills/${name}`),
  enable: (name) => api.post(`/skills/${name}/enable`),
  disable: (name) => api.post(`/skills/${name}/disable`),
  updateConfig: (name, config) => api.put(`/skills/${name}/config`, { config }),
};

export { api, APIError };
