const REQUEST_TIMEOUT_MS = 12000;

export function createApi(config) {
  const base = config.apiBaseUrl.replace(/\/$/, '');
  const vehicle = encodeURIComponent(config.vehicleId);

  async function request(path, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    const abortFromCaller = () => controller.abort();
    options.signal?.addEventListener('abort', abortFromCaller, { once: true });
    try {
      const response = await fetch(`${base}${path}`, {
        ...options,
        signal: controller.signal,
        headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
        credentials: 'omit',
      });
      const text = await response.text();
      let data = null;
      if (text) {
        try { data = JSON.parse(text); }
        catch { throw new Error('La API devolvió una respuesta que no es JSON válido.'); }
      }
      if (!response.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : `Error HTTP ${response.status}`;
        throw new Error(detail);
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('La API no respondió a tiempo.');
      if (error instanceof TypeError) throw new Error('No se pudo conectar con la API. Revisa la conexión y CORS.');
      throw error;
    } finally {
      window.clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  return {
    getCommands: () => request(`/vehicles/${vehicle}/commands`),
    getDemos: () => request(`/vehicles/${vehicle}/demos`),
    getVehicleState: (signal) => request(`/vehicles/${vehicle}/state`, { signal }),
    getMovementHistory: (signal) => request(`/vehicles/${vehicle}/history`, { signal }),

    getDatabaseHealth: () => request('/health/database'),

    registerMovement: (commandId, signal) => request(`/vehicles/${vehicle}/movements`, {
      method: 'POST',
      body: JSON.stringify({ command_id: commandId }),
      signal,
    }),

    runDemo: (demoId, signal) => request(`/vehicles/${vehicle}/demos/${encodeURIComponent(demoId)}/run`, {
      method: 'POST',
      signal,
    }, 180000),
  };
}
