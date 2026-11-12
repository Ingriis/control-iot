import { createApi } from './api.js';
import { loadConfig, validateConfig } from './config.js';
import { initJoystick, initVerticalJoystick } from './joystick.js';
import { VehicleSocket } from './websocket.js';
import { renderLatestMovement, renderHistory, setMonitorVehicle } from './monitor.js';

const $ = (id) => document.getElementById(id);
const names = {
  forward: 'AVANZAR', backward: 'RETROCEDER', left: 'GIRAR_IZQUIERDA', right: 'GIRAR_DERECHA', stop: 'DETENER',
  forkUp: 'SUBIR_HORQUILLAS', forkDown: 'BAJAR_HORQUILLAS',
};
const config = validateConfig(loadConfig());
let api = createApi(config);
let commands = [];
let demos = [];
let socket = null;
let apiReady = false;
let demoRunning = false;
let demoEventsVisible = false;
let demoEventsTimer = null;
let commandPending = false;
let actionSequence = 0;
let activeMovementController = null;
let lastDirection = 'neutral';
let apiGeneration = 0;
let holdGeneration = 0;
let heldDirection = null;
let joystick;
let forkJoystick;
let monitorVisible = false;
let monitorStateEpoch = 0;
let monitorFetchSequence = 0;
let monitorController = null;
let monitorHistoryController = null;
let monitorHistoryTimer = null;
let monitorHistorySequence = 0;
let socketWasOnline = false;
let latestWssTimestamp = 0;
let hasWssState = false;

function setIndicator(id, state, text) {
  const indicator = $(id);
  indicator.dataset.state = state;

  const targets = {
    wsIndicator: $('wsStatus'),
    apiIndicator: $('apiStatus'),
    dbIndicator: $('dbStatus'),
  };

  targets[id].textContent = text;
}

function showAlert(id, message) {
  const element = $(id);
  element.textContent = message;
  element.classList.toggle('d-none', !message);
}

function setAction(status, detail) {
  $('actionStatus').textContent = status;
  $('actionDetail').textContent = detail;
}

function activeCommandByName(name) {
  return commands.find((command) => command.nombre === name && Number(command.activo) === 1);
}

function isPoweredOn() {
  return $('powerButton')?.getAttribute('aria-pressed') === 'true';
}

function getPowerCommand(isCurrentlyOn = false) {
  if (isCurrentlyOn) {
    const offCmd = activeCommandByName('APAGAR_AUTO') || activeCommandByName('APAGAR');
    if (offCmd) return offCmd;
  } else {
    const onCmd = activeCommandByName('ENCENDER_AUTO') || activeCommandByName('ENCENDER');
    if (onCmd) return onCmd;
  }
  return activeCommandByName('ENCENDER_AUTO')
    || activeCommandByName('ENCENDER')
    || activeCommandByName('ENCENDER_APAGAR')
    || activeCommandByName('POWER')
    || activeCommandByName('APAGAR_AUTO')
    || activeCommandByName('APAGAR');
}

let currentSpeedState = 1; // 1: Verde (normal), 2: Verde y Rojo (medio), 3: Rojo (rápido)

function updateSpeedVisual(state) {
  const btn = $('speedButton');
  if (!btn) return;
  btn.dataset.speed = String(state);
  const info = {
    1: { name: 'Normal', lamps: 'Verde', next: 'Media (Verde y Rojo)' },
    2: { name: 'Media', lamps: 'Verde y Rojo', next: 'Rápida (Rojo)' },
    3: { name: 'Rápida', lamps: 'Rojo', next: 'Normal (Verde)' },
  };
  const current = info[state] || info[1];
  btn.setAttribute('aria-label', `Velocidad: ${current.name} (${current.lamps}). Clic para cambiar a ${current.next}.`);
  btn.title = `Velocidad ${current.name} (${current.lamps}) · Haz clic para cambiar a ${current.next}`;
}

function getSpeedCommand() {
  return activeCommandByName('CAMBIAR_VELOCIDAD') || commands.find((c) => c.nombre?.includes('VELOCIDAD') && Number(c.activo) === 1);
}

function getCruiseCommand() {
  return activeCommandByName('ACTIVAR_CRUCERO') || commands.find((c) => c.nombre?.includes('CRUCERO') && Number(c.activo) === 1);
}

async function handleSpeedCycle() {
  if (!isPoweredOn()) return;
  const cmd = getSpeedCommand();
  if (!cmd) return;
  if (!await sendCommand(cmd)) return;
  currentSpeedState = (currentSpeedState % 3) + 1;
  updateSpeedVisual(currentSpeedState);
  const labels = { 1: 'NORMAL', 2: 'MEDIA', 3: 'RÁPIDA' };
  $('driveText').textContent = `VELOCIDAD ${labels[currentSpeedState]}`;
}

async function handleCruiseToggle() {
  if (!isPoweredOn()) return;
  const cmd = getCruiseCommand();
  if (!cmd) return;
  if (!await sendCommand(cmd)) return;
  const btn = $('cruiseButton');
  const isCurrentlyOn = btn.getAttribute('aria-pressed') === 'true';
  const nextState = !isCurrentlyOn;
  btn.setAttribute('aria-pressed', String(nextState));
  btn.setAttribute('aria-label', `Modo crucero ${nextState ? 'activado' : 'desactivado'}.`);
}

function directionsAvailable() {
  return ['AVANZAR', 'RETROCEDER', 'GIRAR_IZQUIERDA', 'GIRAR_DERECHA'].every((name) => activeCommandByName(name));
}

function renderCommands() {
  const host = $('commandButtons');
  host.replaceChildren();
  const special = new Set([
    ...Object.values(names),
    'LUCES', 'SONIDO',
    'ENCENDER_AUTO', 'ENCENDER', 'APAGAR', 'APAGAR_AUTO', 'ENCENDER_APAGAR', 'POWER',
    'CAMBIAR_VELOCIDAD', 'ACTIVAR_CRUCERO'
  ]);
  const available = commands.filter((item) => !special.has(item.nombre) && Number(item.activo) === 1);
  if (!available.length) {
    return;
  }
  const powered = isPoweredOn();
  for (const command of available) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'command-button';
    button.disabled = !powered || demoRunning || commandPending || !apiReady;
    const title = document.createElement('strong');
    title.textContent = String(command.nombre).replaceAll('_', ' ');
    const description = document.createElement('small');
    description.textContent = command.descripcion || `Comando ${command.codigo}`;
    button.append(title, description);
    button.addEventListener('click', () => sendCommand(command));
    host.append(button);
  }
}

function updateControls() {
  const powered = isPoweredOn();
  const stopReady = Boolean(activeCommandByName('DETENER'));
  const powerCmd = getPowerCommand(powered);
  const speedCmd = getSpeedCommand();
  const cruiseCmd = getCruiseCommand();
  const joystickDisabled = !powered || !apiReady || !directionsAvailable() || demoRunning || commandPending;
  const forkJoystickDisabled = !powered || !apiReady || !activeCommandByName(names.forkUp) || !activeCommandByName(names.forkDown) || demoRunning || commandPending;
  $('joystick').setAttribute('aria-disabled', String(joystickDisabled));
  $('joystick').classList.toggle('is-disabled', joystickDisabled);
  $('forkJoystick').setAttribute('aria-disabled', String(forkJoystickDisabled));
  $('forkJoystick').classList.toggle('is-disabled', forkJoystickDisabled);
  if (!powered || !apiReady || !activeCommandByName(names.forkUp) || !activeCommandByName(names.forkDown) || demoRunning) forkJoystick?.reset();

  $('speedButton').disabled = !powered || !apiReady || !speedCmd || demoRunning || commandPending;
  $('speedButton').title = !powered ? 'Presiona ENCENDER/APAGAR para habilitar el vehículo.' : (speedCmd ? `Velocidad actual: ${currentSpeedState === 1 ? 'Normal (Verde)' : currentSpeedState === 2 ? 'Media (Verde y Rojo)' : 'Rápida (Rojo)'}` : 'Comando de velocidad no disponible');

  $('powerButton').disabled = !apiReady || !powerCmd || demoRunning || commandPending;
  $('powerButton').title = powerCmd ? '' : 'El catálogo no contiene un comando de encendido/apagado activo.';

  $('cruiseButton').disabled = !powered || !apiReady || !cruiseCmd || demoRunning || commandPending;
  $('cruiseButton').title = !powered ? 'Presiona ENCENDER/APAGAR para habilitar el vehículo.' : (cruiseCmd ? 'Activar/desactivar crucero' : 'Comando crucero no disponible');

  $('stopButton').disabled = !powered || !apiReady || !stopReady;
  $('stopButton').title = !powered ? 'Presiona ENCENDER/APAGAR para habilitar el vehículo.' : (stopReady ? '' : 'El catálogo no contiene un comando DETENER activo.');
  $('lightsButton').disabled = !powered || !apiReady || !activeCommandByName('LUCES') || demoRunning || commandPending;
  $('lightsButton').title = !powered ? 'Presiona ENCENDER/APAGAR para habilitar las luces.' : '';
  $('soundButton').disabled = !powered || !apiReady || !activeCommandByName('SONIDO') || demoRunning || commandPending;
  $('soundButton').title = !powered ? 'Presiona ENCENDER/APAGAR para habilitar el sonido.' : '';
  $('runDemoButton').disabled = !powered || !apiReady || !demos.length || ! $('demoSelect').value || demoRunning || commandPending;
  $('runDemoButton').title = !powered ? 'Presiona ENCENDER/APAGAR para ejecutar una DEMO.' : '';
  $('demoSelect').disabled = !powered || !apiReady || demoRunning || commandPending || demos.length === 0;
  for (const button of $('commandButtons').querySelectorAll('button')) button.disabled = !powered || demoRunning || commandPending || !apiReady;
}

function renderDemos(selectedId = '') {
  const select = $('demoSelect');
  const activeDemos = demos.filter((item) => Number(item.activo) === 1);
  select.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = activeDemos.length ? 'Elige una DEMO…' : 'No hay DEMO activas';
  select.append(placeholder);
  for (const demo of activeDemos) {
    const option = document.createElement('option');
    option.value = String(demo.id_demo);
    option.textContent = demo.nombre;
    option.dataset.description = demo.descripcion || '';
    select.append(option);
  }
  if (selectedId && [...select.options].some((option) => option.value === String(selectedId))) select.value = String(selectedId);
  select.disabled = !apiReady || demoRunning || select.options.length <= 1;
  updateDemoDescription();
  updateControls();
}

function updateDemoDescription() {
  const option = $('demoSelect').selectedOptions[0];
  $('demoDescription').textContent = option?.value
    ? option.dataset.description || 'DEMO guardada en el servidor.'
    : [...$('demoSelect').options].some((item) => item.value) ? 'Selecciona una DEMO existente para consultar su descripción.' : 'No se encontraron DEMO activas para este vehículo.';
}

async function refreshCommands({ quiet = false } = {}) {
  const generation = apiGeneration;
  const currentApi = api;
  if (!quiet) setIndicator('apiIndicator', 'checking', 'Comprobando catálogo…');
  try {
    const result = await currentApi.getCommands();
    if (generation !== apiGeneration) return false;
    if (!Array.isArray(result)) throw new Error('La respuesta del catálogo no tiene el formato esperado.');
    commands = result;
    apiReady = true;
    setIndicator('apiIndicator', 'available', 'Disponible · catálogo responde');
    renderCommands();
    updateControls();
    showAlert('configAlert', activeCommandByName('DETENER') ? '' : 'El catálogo no reporta DETENER activo. El panel no enviará una parada inventada.');
    return true;
  } catch (error) {
    if (generation !== apiGeneration) return false;
    apiReady = false;
    setIndicator('apiIndicator', 'unavailable', 'No disponible · consulta fallida');
    if (!quiet) showAlert('errorAlert', error.message);
    updateControls();
    return false;
  }
}

async function refreshDatabaseHealth() {
  const generation = apiGeneration;
  const currentApi = api;
  setIndicator('dbIndicator', 'checking', 'Verificando conexión…');

  try {
    const result = await currentApi.getDatabaseHealth();
    if (generation !== apiGeneration || currentApi !== api) return false;

    if (result.status === 'available' && result.database === 'connected') {
      setIndicator('dbIndicator', 'available', 'Conectado · RDS responde');
    } else {
      setIndicator('dbIndicator', 'unavailable', 'No disponible · RDS sin conexión');
    }
    return true;
  } catch {
    if (generation !== apiGeneration || currentApi !== api) return false;
    setIndicator('dbIndicator', 'unavailable', 'No disponible · verificación fallida');
    return false;
  }
}

function showView(view) {
  const monitoring = view === 'monitor';
  monitorVisible = monitoring;
  $('controlView').classList.toggle('d-none', monitoring);
  $('monitorView').classList.toggle('d-none', !monitoring);
  $('controlTab').classList.toggle('is-active', !monitoring);
  $('monitorTab').classList.toggle('is-active', monitoring);
  if (monitoring) {
    $('monitorTab').setAttribute('aria-current', 'page');
    $('controlTab').removeAttribute('aria-current');
    loadMonitorData();
  } else {
    $('controlTab').setAttribute('aria-current', 'page');
    $('monitorTab').removeAttribute('aria-current');
  }
}

function normalizeHistory(records) {
  if (!Array.isArray(records)) throw new Error('La API devolvió un formato de historial no reconocido.');
  if (records.some((item) => !item || Number(item.id_vehiculo) !== Number(config.vehicleId))) {
    throw new Error('La respuesta contiene registros de otro vehículo o sin identificar.');
  }
  const byId = new Map();
  for (const item of records) {
    const id = Number(item.id_historial);
    if (!Number.isInteger(id) || id < 1) throw new Error('Un registro no contiene un id_historial válido.');
    if (!byId.has(id)) byId.set(id, item);
  }
  return [...byId.values()].sort((a, b) => Number(b.id_historial) - Number(a.id_historial)).slice(0, 10);
}

async function loadMonitorData() {
  monitorController?.abort();
  const controller = new AbortController();
  monitorController = controller;
  const sequence = ++monitorFetchSequence;
  const stateEpoch = monitorStateEpoch;
  const currentApi = api;
  renderHistory(null, { loading: true });

  const [stateResult, historyResult] = await Promise.allSettled([
    currentApi.getVehicleState(controller.signal),
    currentApi.getMovementHistory(controller.signal),
  ]);
  if (controller.signal.aborted || sequence !== monitorFetchSequence || currentApi !== api) return;

  if (stateResult.status === 'fulfilled') {
    const state = stateResult.value;
    const isOtherVehicle = state?.id_vehiculo !== undefined && Number(state.id_vehiculo) !== Number(config.vehicleId);
    if (isOtherVehicle) {
      $('monitorCommand').textContent = 'Respuesta de otro vehículo';
    } else {
      if (!hasWssState && stateEpoch === monitorStateEpoch) renderLatestMovement(state, { source: 'REST' });
      setMonitorVehicle(state?.vehiculo, config.vehicleId);
    }
  } else if (stateResult.reason?.name !== 'AbortError' && stateEpoch === monitorStateEpoch) {
    $('monitorCommand').textContent = 'Sin datos actualizados';
    $('monitorTimestamp').textContent = 'No se pudo consultar el estado del vehículo.';
    setMonitorVehicle('', config.vehicleId);
  }

  if (historyResult.status === 'fulfilled') {
    try { renderHistory(normalizeHistory(historyResult.value)); }
    catch (error) { renderHistory(null, { error: error.message }); }
  } else if (historyResult.reason?.name !== 'AbortError') {
    renderHistory(null, { error: historyResult.reason?.message || 'Error de conexión.' });
  }
}

function scheduleMonitorHistorySync() {
  if (!monitorVisible) return;
  window.clearTimeout(monitorHistoryTimer);
  monitorHistoryTimer = window.setTimeout(async () => {
    monitorHistoryController?.abort();
    const controller = new AbortController();
    monitorHistoryController = controller;
    const sequence = ++monitorHistorySequence;
    const currentApi = api;
    try {
      const records = await currentApi.getMovementHistory(controller.signal);
      if (controller.signal.aborted || sequence !== monitorHistorySequence || currentApi !== api) return;
      renderHistory(normalizeHistory(records));
    } catch (error) {
      if (controller.signal.aborted || sequence !== monitorHistorySequence || error.name === 'AbortError') return;
      renderHistory(null, { error: error.message || 'Error de conexión.' });
    }
  }, 250);
}

async function loadDemos() {
  const generation = apiGeneration;
  const currentApi = api;
  try {
    const result = await currentApi.getDemos();
    if (generation !== apiGeneration) return;
    if (!Array.isArray(result)) throw new Error('La respuesta de DEMO no tiene el formato esperado.');
    demos = result;
    renderDemos();
  } catch (error) {
    if (generation !== apiGeneration) return;
    demos = [];
    $('demoSelect').replaceChildren(new Option('No se pudieron cargar las DEMO', ''));
    $('demoSelect').disabled = true;
    $('demoDescription').textContent = error.message;
    updateControls();
  }
}

function parseSocketMessage(raw) {
  let message;
  try { message = JSON.parse(raw); }
  catch { $('eventStatus').textContent = 'Mensaje recibido'; $('eventDetail').textContent = 'El servidor envió un mensaje no JSON.'; return; }
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    $('eventStatus').textContent = 'Mensaje recibido';
    $('eventDetail').textContent = 'El mensaje del servidor no tiene el formato de evento esperado.';
    return;
  }
  if (message.id_vehiculo !== undefined && Number(message.id_vehiculo) !== Number(config.vehicleId)) return;
  if (message.type === 'initial_state') {
    const state = message.state;
    if (state && (state.id_vehiculo === undefined || Number(state.id_vehiculo) === Number(config.vehicleId))) {
      monitorStateEpoch += 1;
      hasWssState = true;
      renderLatestMovement(state, { source: 'WSS' });
      setMonitorVehicle(state.vehiculo, config.vehicleId);
    }
    $('eventStatus').textContent = 'Estado inicial recibido';
    $('eventDetail').textContent = 'La conexión WSS del navegador recibió el estado inicial del servidor.';
    return;
  }
  if (message.type === 'movement') {
    if (message.id_vehiculo === undefined || Number(message.id_vehiculo) !== Number(config.vehicleId)) return;
    const eventTimestamp = Date.parse(message.timestamp || '');
    if (Number.isFinite(eventTimestamp) && eventTimestamp < latestWssTimestamp) return;
    if (Number.isFinite(eventTimestamp)) latestWssTimestamp = eventTimestamp;
    monitorStateEpoch += 1;
    hasWssState = true;
    const eventOrigin = String(message.origin || '').trim().toUpperCase();
    const isDemoEvent = eventOrigin === 'DEMO';
    renderLatestMovement(message, { source: 'WSS', origin: message.origin });
    if (!isDemoEvent) scheduleMonitorHistorySync();
    const command = commands.find((item) => Number(item.codigo) === Number(message.codigo));
    const label = command?.nombre || `código ${message.codigo ?? 'desconocido'}`;
    if (demoEventsVisible && isDemoEvent) {
      const host = $('demoMovementList');
      host.querySelector('.demo-progress-empty')?.remove();
      const item = document.createElement('li');
      item.textContent = label;
      host.append(item);
      window.clearTimeout(demoEventsTimer);
      demoEventsTimer = window.setTimeout(() => { demoEventsVisible = false; }, 15000);
    }
    $('eventStatus').textContent = `Evento recibido · ${label}`;
    const parts = [`vehículo ${message.id_vehiculo ?? config.vehicleId}`];
    if (message.codigo !== undefined) parts.push(`código ${message.codigo}`);
    if (message.timestamp) parts.push(`marca ${message.timestamp}`);
    $('eventDetail').textContent = `${parts.join(' · ')}. Evento del backend; no confirma ejecución física.`;
    return;
  }
  $('eventStatus').textContent = String(message.type || 'Mensaje recibido');
  $('eventDetail').textContent = 'Evento recibido por el navegador desde el servidor WSS.';
}

function connectSocket() {
  socket?.stop();
  socket = new VehicleSocket(config.websocketUrl, (state) => {
    const labels = { connecting: 'Conectando…', reconnecting: 'Reconectando…', online: 'En línea · navegador conectado', offline: 'Desconectado' };
    setIndicator('wsIndicator', state === 'online' ? 'online' : state === 'offline' ? 'offline' : state, labels[state] || 'Conectando…');
    if (state === 'online') {
      if (socketWasOnline && monitorVisible) loadMonitorData();
      socketWasOnline = true;
    } else if (state === 'offline') {
      socketWasOnline = false;
    }
    if (state !== 'online' && hasWssState) {
      $('monitorNote').textContent = 'Mostrando el último valor conocido; el WebSocket del navegador está reconectando o desconectado.';
    }
  }, parseSocketMessage);
  socket.start();
}

async function sendCommand(command, { priorityStop = false } = {}) {
  if (!command || !apiReady) return false;
  if (demoRunning && !priorityStop) {
    setAction('No enviado', 'Espera a que termine la DEMO para enviar otro comando.');
    return false;
  }
  if (commandPending && !priorityStop) {
    setAction('No enviado', 'Hay una solicitud pendiente. Espera la respuesta o utiliza DETENER.');
    return false;
  }
  if (priorityStop) {
    actionSequence += 1;
    activeMovementController?.abort();
    commandPending = false;
  }
  const sequence = ++actionSequence;
  const controller = new AbortController();
  activeMovementController = controller;
  commandPending = true;
  setAction(`Solicitado · ${command.nombre}`, `Enviando command_id ${command.id_comando} a la API.`);
  updateControls();
  $('driveText').textContent = command.nombre.replaceAll('_', ' ');
  $('driveIndicator').classList.toggle('active', command.nombre !== 'DETENER');
  try {
    await api.registerMovement(command.id_comando, controller.signal);
    if (sequence !== actionSequence) return false;
    setAction(`Aceptado por API · ${command.nombre}`, 'Respuesta HTTP exitosa. Esto no confirma movimiento físico.');
    showAlert('errorAlert', '');
    if (priorityStop && demoRunning) showAlert('configAlert', 'DETENER fue enviado durante la DEMO; revisa el estado del vehículo.');
    return true;
  } catch (error) {
    if (sequence !== actionSequence) return false;
    setAction(`Error · ${command.nombre}`, error.message);
    showAlert('errorAlert', error.message);
    return false;
  } finally {
    if (sequence === actionSequence) {
      commandPending = false;
      activeMovementController = null;
      updateControls();
    }
  }
}

async function toggleUtility(name, buttonId) {
  const command = activeCommandByName(name);
  if (!command) return;
  if (!await sendCommand(command)) return;
  const button = $(buttonId);
  const isOn = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(isOn));
  button.setAttribute('aria-label', `Interruptor de ${name === 'LUCES' ? 'luces' : 'sonido'}; indicador visual ${isOn ? 'encendido' : 'apagado'}. El vehículo no informa el estado físico.`);
}

async function togglePower() {
  const button = $('powerButton');
  const isCurrentlyOn = isPoweredOn();
  const command = getPowerCommand(isCurrentlyOn);
  if (!command) return;
  if (!await sendCommand(command)) return;
  const nextState = !isCurrentlyOn;
  button.setAttribute('aria-pressed', String(nextState));
  button.setAttribute('aria-label', `Interruptor encender o apagar; indicador visual ${nextState ? 'encendido' : 'apagado'}. El vehículo no informa el estado físico.`);
  if (!nextState) {
    requestStop();
    forkJoystick?.reset();
    $('cruiseButton')?.setAttribute('aria-pressed', 'false');
    currentSpeedState = 1;
    updateSpeedVisual(currentSpeedState);
    $('driveText').textContent = 'Apagado';
    $('driveIndicator').classList.remove('active');
  }
  updateControls();
}

function handleDirection(name) {
  if (name === lastDirection && heldDirection === name) return;
  lastDirection = name;
  heldDirection = name;
  const generation = ++holdGeneration;
  // A direction change cancels the old pulse; the next request waits for it to settle.
  activeMovementController?.abort();
  const command = activeCommandByName(names[name]);
  if (!command) {
    setAction('Comando no disponible', `El catálogo no contiene ${names[name]} activo.`);
    return;
  }
  if (command) renewWhileHeld(generation, name);
}

const HOLD_RENEWAL_MS = 600;
const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function renewWhileHeld(generation, direction) {
  while (generation === holdGeneration && heldDirection === direction) {
    while (commandPending && generation === holdGeneration) await wait(50);
    if (generation !== holdGeneration || heldDirection !== direction) break;
    const command = activeCommandByName(names[direction]);
    if (!command || !apiReady || demoRunning) break;
    // Await each request before starting the next so renewals cannot overlap.
    await sendCommand(command);
    if (generation !== holdGeneration || heldDirection !== direction) break;
    await wait(HOLD_RENEWAL_MS);
  }
}

function handleForkDirection(direction) {
  const commandName = direction === 'up' ? names.forkUp : names.forkDown;
  const command = activeCommandByName(commandName);
  if (!command) {
    setAction('Comando no disponible', `El catálogo no contiene ${commandName} activo.`);
    $('forkJoystickStatus').textContent = 'Comando de horquillas no disponible';
    return;
  }
  $('forkJoystickStatus').textContent = direction === 'up' ? 'Subiendo horquillas…' : 'Bajando horquillas…';
  sendCommand(command).then((sent) => {
    if ($('forkJoystick').querySelector('.fork-joy-base')?.dataset.direction === 'neutral') return;
    if (sent) $('forkJoystickStatus').textContent = `${direction === 'up' ? 'Subir' : 'Bajar'} solicitado`;
    else $('forkJoystickStatus').textContent = 'Comando no enviado';
  });
}

function requestStop() {
  if (lastDirection === 'neutral' && !heldDirection && !demoRunning && !commandPending) return;
  holdGeneration += 1;
  heldDirection = null;
  lastDirection = 'neutral';
  joystick?.reset();
  const command = activeCommandByName('DETENER');
  if (!command) {
    setAction('DETENER no disponible', 'No se encontró un comando DETENER activo en el catálogo.');
    return;
  }
  sendCommand(command, { priorityStop: true });
}

function enableFloatingSwitcherDrag() {
  const bubble = document.querySelector('.floating-view-switcher');
  if (!bubble) return;
  try {
    const saved = JSON.parse(localStorage.getItem('controlIoT.switcherPosition') || 'null');
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) {
      bubble.style.left = `${Math.max(0, Math.min(innerWidth - bubble.offsetWidth, saved.x))}px`;
      bubble.style.top = `${Math.max(0, Math.min(innerHeight - bubble.offsetHeight, saved.y))}px`;
      bubble.style.right = 'auto';
      bubble.style.bottom = 'auto';
    }
  } catch { /* Posición guardada no disponible. */ }

  let drag = null;
  let suppressClick = false;
  bubble.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const rect = bubble.getBoundingClientRect();
    drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, moved: false };
  });
  window.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    if (!drag.moved) return;
    const x = Math.max(0, Math.min(innerWidth - bubble.offsetWidth, drag.left + dx));
    const y = Math.max(0, Math.min(innerHeight - bubble.offsetHeight, drag.top + dy));
    bubble.style.left = `${x}px`;
    bubble.style.top = `${y}px`;
    bubble.style.right = 'auto';
    bubble.style.bottom = 'auto';
  });
  window.addEventListener('pointerup', (event) => {
    if (!drag) return;
    if (drag.id !== event.pointerId) return;
    suppressClick = drag.moved;
    if (drag.moved) {
      const rect = bubble.getBoundingClientRect();
      try { localStorage.setItem('controlIoT.switcherPosition', JSON.stringify({ x: rect.left, y: rect.top })); } catch { /* Preferencias no disponibles. */ }
    }
    drag = null;
  });
  bubble.addEventListener('click', (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
  }, true);
  window.addEventListener('resize', () => {
    if (!bubble.style.left) return;
    const rect = bubble.getBoundingClientRect();
    bubble.style.left = `${Math.max(0, Math.min(innerWidth - bubble.offsetWidth, rect.left))}px`;
    bubble.style.top = `${Math.max(0, Math.min(innerHeight - bubble.offsetHeight, rect.top))}px`;
  });
}

async function executeDemo() {
  const demoId = $('demoSelect').value;
  const demo = demos.find((item) => String(item.id_demo) === demoId);
  if (!demo || demoRunning || commandPending) return;
  demoRunning = true;
  demoEventsVisible = true;
  window.clearTimeout(demoEventsTimer);
  $('demoMovementList').replaceChildren();
  const demoSequence = actionSequence;
  setAction(`Solicitada · DEMO ${demo.nombre}`, 'La API ejecuta la secuencia y controla el orden y los tiempos.');
  $('eventStatus').textContent = 'Esperando eventos de DEMO';
  $('eventDetail').textContent = 'La sesión WSS del navegador escucha los eventos publicados por el backend.';
  updateControls();
  try {
    const result = await api.runDemo(demo.id_demo);
    const sent = result?.movements_transmitted;
    if (demoSequence === actionSequence) {
      setAction(`Respuesta DEMO · ${result?.status || 'recibida'}`, `${Number.isInteger(sent) ? `${sent} movimientos transmitidos. ` : ''}${result?.detail || 'El backend respondió.'}`);
    }
  } catch (error) {
    demoEventsVisible = false;
    window.clearTimeout(demoEventsTimer);
    if (demoSequence === actionSequence) {
      setAction('Error al ejecutar DEMO', error.message);
      showAlert('errorAlert', error.message);
    }
  } finally {
    demoRunning = false;
    updateControls();
  }
}

async function boot() {
  enableFloatingSwitcherDrag();
  $('controlTab').addEventListener('click', () => showView('control'));
  $('monitorTab').addEventListener('click', () => showView('monitor'));
  $('monitorRefresh').addEventListener('click', loadMonitorData);
  joystick = initJoystick($('joystick'), $('joyKnob'), {
    onDirection: handleDirection,
    onRelease: requestStop,
    canMove: () => isPoweredOn() && apiReady && directionsAvailable() && !demoRunning && !commandPending,
  });
  forkJoystick = initVerticalJoystick($('forkJoystick'), $('forkJoyKnob'), {
    onDirection: handleForkDirection,
    onNeutral: () => { $('forkJoystickStatus').textContent = 'Control centrado · no se envió DETENER.'; },
    canMove: () => isPoweredOn() && apiReady && Boolean(activeCommandByName(names.forkUp)) && Boolean(activeCommandByName(names.forkDown)) && !demoRunning && !commandPending,
  });
  $('speedButton').addEventListener('click', handleSpeedCycle);
  $('cruiseButton').addEventListener('click', handleCruiseToggle);
  $('powerButton').addEventListener('click', togglePower);
  updateSpeedVisual(currentSpeedState);
  $('stopButton').addEventListener('click', requestStop);
  window.addEventListener('blur', requestStop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) requestStop(); });
  $('lightsButton').addEventListener('click', () => toggleUtility('LUCES', 'lightsButton'));
  $('soundButton').addEventListener('click', () => toggleUtility('SONIDO', 'soundButton'));
  $('demoSelect').addEventListener('change', () => { updateDemoDescription(); updateControls(); });
  $('runDemoButton').addEventListener('click', executeDemo);
  window.addEventListener('keydown', (event) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (event.key === 'v' || event.key === 'V') {
      event.preventDefault();
      handleSpeedCycle();
    } else if (event.key === 'c' || event.key === 'C') {
      event.preventDefault();
      handleCruiseToggle();
    }
  });
  connectSocket();

  await Promise.all([
    refreshCommands(),
    loadDemos(),
    refreshDatabaseHealth(),
  ]);

  window.setInterval(() => refreshCommands({ quiet: true }), 60000);
  window.setInterval(refreshDatabaseHealth, 30000);
}

boot();
