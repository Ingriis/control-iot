/**
 * Cliente HTTP Fetch para la plataforma IoT (4.1, 4.2 y 4.3).
 * Soporta autenticación con Bearer token, manejo de timeout y operaciones REST unificadas.
 */

const REQUEST_TIMEOUT_MS = 12000;
let currentAuthToken = sessionStorage.getItem('iot_token') || null;

export function setAuthToken(token) {
  currentAuthToken = token;
  if (token) {
    sessionStorage.setItem('iot_token', token);
  } else {
    sessionStorage.removeItem('iot_token');
  }
}

export function getAuthToken() {
  return currentAuthToken;
}

export function createApi(config) {
  const base = config.apiBaseUrl.replace(/\/$/, '');
  let activeVehicleId = String(config.vehicleId || '1');

  function setVehicleId(id) {
    if (id) activeVehicleId = String(id);
  }

  function getVehicleId() {
    return activeVehicleId;
  }

  async function request(path, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    const abortFromCaller = () => controller.abort();
    options.signal?.addEventListener('abort', abortFromCaller, { once: true });

    const headers = {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(currentAuthToken ? { Authorization: `Bearer ${currentAuthToken}` } : {}),
      ...options.headers,
    };

    try {
      const response = await fetch(`${base}${path}`, {
        ...options,
        signal: controller.signal,
        headers,
      });

      const text = await response.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error('La API devolvió una respuesta que no es JSON válido.');
        }
      }

      if (!response.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : `Error HTTP ${response.status}`;
        const error = new Error(detail);
        error.status = response.status;
        error.data = data;
        throw error;
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('La API no respondió a tiempo.');
      if (error instanceof TypeError && !error.status) throw new Error('No se pudo conectar con la API. Revisa la conexión y CORS.');
      throw error;
    } finally {
      window.clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  return {
    setVehicleId,
    getVehicleId,

    // Diagnóstico y salud
    getApiHealth: () => request('/health'),
    getDatabaseHealth: () => request('/health/database'),

    // Autenticación
    login: (username, password) => request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    getMe: () => request('/auth/me'),

    // Control y Monitoreo (4.1 y 4.2)
    getCommands: (vId = activeVehicleId) => request(`/vehicles/${encodeURIComponent(vId)}/commands`),
    getDemos: (vId = activeVehicleId) => request(`/vehicles/${encodeURIComponent(vId)}/demos`),
    getVehicleState: (signal, vId = activeVehicleId) => request(`/vehicles/${encodeURIComponent(vId)}/state`, { signal }),
    getMovementHistory: (signal, vId = activeVehicleId) => request(`/vehicles/${encodeURIComponent(vId)}/history`, { signal }),
    registerMovement: (commandId, signal, vId = activeVehicleId) => request(`/vehicles/${encodeURIComponent(vId)}/movements`, {
      method: 'POST',
      body: JSON.stringify({ command_id: commandId }),
      signal,
    }),
    runDemo: (demoId, signal, vId = activeVehicleId) => request(`/vehicles/${encodeURIComponent(vId)}/demos/${encodeURIComponent(demoId)}/run`, {
      method: 'POST',
      signal,
    }, 180000),

    // Administración comercial (4.3)
    getModels: () => request('/models'),
    getModelCapabilities: (mId) => request(`/models/${encodeURIComponent(mId)}/capabilities`),
    createModel: (payload) => request('/models', { method: 'POST', body: JSON.stringify(payload) }),
    updateModel: (mId, payload) => request(`/models/${encodeURIComponent(mId)}`, { method: 'PUT', body: JSON.stringify(payload) }),

    getUnits: () => request('/admin/units'),
    createUnit: (payload) => request('/admin/units', { method: 'POST', body: JSON.stringify(payload) }),
    assignUnit: (vId, payload) => request(`/admin/units/${encodeURIComponent(vId)}/assignment`, { method: 'PUT', body: JSON.stringify(payload) }),
    toggleSupport: (vId, payload) => request(`/admin/units/${encodeURIComponent(vId)}/support`, { method: 'PUT', body: JSON.stringify(payload) }),

    getClients: () => request('/admin/clients'),
    createClient: (payload) => request('/admin/clients', { method: 'POST', body: JSON.stringify(payload) }),

    getAuditLogs: (limit = 50) => request(`/admin/audit-logs?limit=${encodeURIComponent(limit)}`),

    // Módulo Usuario (Mis Vehículos y Demos Privadas)
    getMyVehicles: () => request('/user/vehicles'),
    createCustomDemo: (vId, payload) => request(`/vehicles/${encodeURIComponent(vId)}/demos`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
    addDemoMovement: (vId, demoId, payload) => request(`/vehicles/${encodeURIComponent(vId)}/demos/${encodeURIComponent(demoId)}/movements`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

    // Módulo Invitados
    getGuestCatalog: () => request('/guest/catalog'),
    requestGuestSession: (vId, alias, duracion = 180) => request('/guest/sessions', {
      method: 'POST',
      body: JSON.stringify({ vehicle_id: vId, alias, duracion_segundos: duracion }),
    }),
    getGuestSessionStatus: (token) => request(`/guest/sessions/${encodeURIComponent(token)}/status`),
    releaseGuestSession: (token) => request(`/guest/sessions/${encodeURIComponent(token)}/release`, {
      method: 'POST',
    }),
  };
}
