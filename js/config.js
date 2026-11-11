const DEFAULTS = {
  apiBaseUrl: 'https://vehiculo-iot-ingrid.duckdns.org',
  websocketUrl: 'wss://vehiculo-iot-ingrid.duckdns.org/ws/vehicles/1',
  vehicleId: '1',
};

export function loadConfig() {
  return { ...DEFAULTS };
}

export function validateConfig(config) {
  const apiUrl = new URL(config.apiBaseUrl);
  const wsUrl = new URL(config.websocketUrl);
  if (!['https:', 'http:'].includes(apiUrl.protocol)) throw new Error('La API debe usar HTTPS. HTTP solo se permite en desarrollo local.');
  if (!['wss:', 'ws:'].includes(wsUrl.protocol)) throw new Error('El WebSocket debe usar WSS. WS solo se permite en desarrollo local.');
  if (apiUrl.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(apiUrl.hostname)) throw new Error('Para publicar, configura la API con HTTPS.');
  if (wsUrl.protocol === 'ws:' && !['localhost', '127.0.0.1'].includes(wsUrl.hostname)) throw new Error('Para publicar, configura el WebSocket con WSS.');
  if (!/^\d+$/.test(String(config.vehicleId)) || Number(config.vehicleId) < 1) throw new Error('El identificador del vehículo debe ser un entero positivo.');
  return { ...config, apiBaseUrl: apiUrl.origin, websocketUrl: wsUrl.toString(), vehicleId: String(Number(config.vehicleId)) };
}

export { DEFAULTS };
