import { createApi } from './api.js';
import { loadConfig, validateConfig } from './config.js';
import { initVerticalStick, initHorizontalStick, initJoystick } from './joystick.js?v=20261125-direction-disabled';
import { VehicleSocket } from './websocket.js';
import { renderLatestMovement, renderHistory, setMonitorVehicle } from './monitor.js';
import { AdminModule } from './admin.js?v=20261125-direction-disabled';
import {
  triggerHaptic,
  playBip,
  playPowerSound,
  playStopSound,
  playForkSound,
  startReverseBeep,
  stopReverseBeep,
} from './feedback.js';

const $ = (id) => document.getElementById(id);
const names = {
  forward: 'AVANZAR', backward: 'RETROCEDER', left: 'GIRAR_IZQUIERDA', right: 'GIRAR_DERECHA', stop: 'DETENER',
  forkUp: 'SUBIR_HORQUILLAS', forkDown: 'BAJAR_HORQUILLAS',
};
const canUseControl = () => activeUserRole !== 'INVITADO' || guestSessionActive;
const config = validateConfig(loadConfig());
let api = createApi(config);
let activeUserRole = 'INVITADO';
let guestSessionActive = false;
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
let heldDriveDirection = null;
let heldSteerDirection = null;
let controlStateQueue = Promise.resolve();
let driveJoystick;
let steerJoystick;
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
let wakeLockSentinel = null;

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    if (!wakeLockSentinel) {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
    }
  } catch {
    wakeLockSentinel = null;
  }
}

async function releaseWakeLock() {
  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch {
      // Ignorado si ya fue liberado por el sistema operativo
    } finally {
      wakeLockSentinel = null;
    }
  }
}

function updateNavMonitorDot() {
  const dot = $('monitorNavDot');
  if (!dot) return;
  const wsState = $('wsIndicator')?.dataset?.state;
  const dbState = $('dbIndicator')?.dataset?.state;
  const apiState = $('apiIndicator')?.dataset?.state;

  if (wsState === 'online' && (dbState === 'available' || !dbState)) {
    dot.className = 'nav-status-dot is-online is-pulse';
    dot.title = 'Monitoreo: Servicios operativos (WebSocket y RDS activos)';
  } else if (wsState === 'offline' || dbState === 'unavailable' || apiState === 'unavailable') {
    dot.className = 'nav-status-dot is-offline';
    dot.title = 'Monitoreo: Alerta en infraestructura (Revisa telemetría)';
  } else {
    dot.className = 'nav-status-dot is-warning is-pulse';
    dot.title = 'Monitoreo: Conectando / Verificando servicios…';
  }
}

function setIndicator(id, state, text) {
  const indicator = $(id);
  if (indicator) indicator.dataset.state = state;

  const targets = {
    wsIndicator: $('wsStatus'),
    apiIndicator: $('apiStatus'),
    dbIndicator: $('dbStatus'),
  };

  if (targets[id]) {
    targets[id].textContent = text;
  }
  updateNavMonitorDot();
}

function showAlert(id, message) {
  const element = $(id);
  if (element) element.textContent = message || '';
}

function setAction(status, detail) {
  const s = $('actionStatus');
  const d = $('actionDetail');
  if (s) s.textContent = status;
  if (d) d.textContent = detail;
}

function setEventStatus(status, detail) {
  const s = $('eventStatus');
  const d = $('eventDetail');
  if (s) s.textContent = status;
  if (d && detail !== undefined) d.textContent = detail;
}

function getDisabledCommandsForVehicle(vehicleId) {
  if (String(vehicleId) !== String(config.vehicleId)) return [];
  return commands.filter((command) => Number(command.activo) !== 1).map((command) => command.nombre);
}

function activeCommandByName(name) {
  const vId = config.vehicleId || '1';
  const disabled = getDisabledCommandsForVehicle(vId);
  if (disabled.includes(name)) return null;
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



function directionsAvailable() {
  return ['AVANZAR', 'RETROCEDER', 'GIRAR_IZQUIERDA', 'GIRAR_DERECHA'].some((name) => activeCommandByName(name));
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
  const vId = config.vehicleId || '1';
  const disabledList = getDisabledCommandsForVehicle(vId);

  const guestCanControl = activeUserRole !== 'INVITADO' || guestSessionActive;
  const powered = isPoweredOn();
  const stopReady = Boolean(activeCommandByName('DETENER'));
  const powerCmd = getPowerCommand(powered);

  // Cada dirección se bloquea y se marca por separado dentro de cada palanca.
  const controlsUnavailable = !guestCanControl || !powered || !apiReady || demoRunning;
  const forwardDisabledByAdmin = disabledList.includes(names.forward);
  const backwardDisabledByAdmin = disabledList.includes(names.backward);
  const leftDisabledByAdmin = disabledList.includes(names.left);
  const rightDisabledByAdmin = disabledList.includes(names.right);
  const forwardDisabled = controlsUnavailable || !activeCommandByName(names.forward);
  const backwardDisabled = controlsUnavailable || !activeCommandByName(names.backward);
  const leftDisabled = controlsUnavailable || !activeCommandByName(names.left);
  const rightDisabled = controlsUnavailable || !activeCommandByName(names.right);
  const driveDisabled = forwardDisabled && backwardDisabled;
  const steerDisabled = leftDisabled && rightDisabled;

  const driveEl = $('driveJoystick');
  if (driveEl) {
    driveEl.setAttribute('aria-disabled', String(driveDisabled));
    driveEl.classList.toggle('is-disabled', driveDisabled);
    const wrap = driveEl.closest('.joystick-wrap');
    const north = wrap?.querySelector('.direction-label.north');
    const south = wrap?.querySelector('.direction-label.south');
    north?.classList.toggle('is-disabled', forwardDisabledByAdmin);
    south?.classList.toggle('is-disabled', backwardDisabledByAdmin);
    if (north) north.title = forwardDisabledByAdmin ? 'Avanzar desactivado por el administrador' : 'Avanzar';
    if (south) south.title = backwardDisabledByAdmin ? 'Retroceder desactivado por el administrador' : 'Retroceder';
    // Mantén la palanca visualmente en la dirección elegida mientras se confirma
    // cada renovación del movimiento sostenido.
    if (driveDisabled && !commandPending) driveJoystick?.reset();
  }

  const steerEl = $('steerJoystick');
  if (steerEl) {
    steerEl.setAttribute('aria-disabled', String(steerDisabled));
    steerEl.classList.toggle('is-disabled', steerDisabled);
    const wrap = steerEl.closest('.joystick-wrap');
    const west = wrap?.querySelector('.direction-label.west');
    const east = wrap?.querySelector('.direction-label.east');
    west?.classList.toggle('is-disabled', leftDisabledByAdmin);
    east?.classList.toggle('is-disabled', rightDisabledByAdmin);
    if (west) west.title = leftDisabledByAdmin ? 'Girar a la izquierda desactivado por el administrador' : 'Girar a la izquierda';
    if (east) east.title = rightDisabledByAdmin ? 'Girar a la derecha desactivado por el administrador' : 'Girar a la derecha';
    // Una solicitud pendiente no significa que el usuario haya soltado la palanca.
    if (steerDisabled && !commandPending) steerJoystick?.reset();
  }

  // Compatibilidad con elemento antiguo si existiera
  const legacyJoy = $('joystick');
  if (legacyJoy) {
    const joyDis = !guestCanControl || !powered || !apiReady || !directionsAvailable() || demoRunning || commandPending;
    legacyJoy.setAttribute('aria-disabled', String(joyDis));
    legacyJoy.classList.toggle('is-disabled', joyDis);
  }

  // Botones dedicados de Horquillas
  const forkUpDisabled = !guestCanControl || !powered || !apiReady || !activeCommandByName(names.forkUp) || demoRunning || commandPending;
  const forkDownDisabled = !guestCanControl || !powered || !apiReady || !activeCommandByName(names.forkDown) || demoRunning || commandPending;
  const forkUpBtn = $('forkUpBtn');
  const forkDownBtn = $('forkDownBtn');
  if (forkUpBtn) {
    forkUpBtn.disabled = forkUpDisabled;
    forkUpBtn.classList.toggle('is-disabled', forkUpDisabled);
    forkUpBtn.setAttribute('aria-disabled', String(forkUpDisabled));
    forkUpBtn.title = disabledList.includes(names.forkUp)
      ? 'SUBIR HORQUILLAS deshabilitado por el Administrador.'
      : (!powered ? 'Presiona ENCENDER/APAGAR para habilitar horquillas.' : 'Mantén presionado para subir horquillas [Q]');
  }
  if (forkDownBtn) {
    forkDownBtn.disabled = forkDownDisabled;
    forkDownBtn.classList.toggle('is-disabled', forkDownDisabled);
    forkDownBtn.setAttribute('aria-disabled', String(forkDownDisabled));
    forkDownBtn.title = disabledList.includes(names.forkDown)
      ? 'BAJAR HORQUILLAS deshabilitado por el Administrador.'
      : (!powered ? 'Presiona ENCENDER/APAGAR para habilitar horquillas.' : 'Mantén presionado para bajar horquillas [E]');
  }

  if (disabledList.includes(names.forkUp) || disabledList.includes(names.forkDown)) {
    if ($('forkJoystickStatus')) $('forkJoystickStatus').textContent = 'Horquillas deshabilitadas por Administrador';
  }

  $('powerButton').disabled = !guestCanControl || !apiReady || !powerCmd || demoRunning || commandPending;
  $('powerButton').title = powerCmd ? '' : 'El catálogo no contiene un comando de encendido/apagado activo.';

  $('stopButton').disabled = !guestCanControl || !powered || !apiReady || !stopReady;
  $('stopButton').title = !powered ? 'Presiona ENCENDER/APAGAR para habilitar el vehículo.' : (stopReady ? '' : 'El catálogo no contiene un comando DETENER activo.');

  const lightsDisabledByAdmin = disabledList.includes('LUCES');
  $('lightsButton').disabled = !guestCanControl || !powered || !apiReady || !activeCommandByName('LUCES') || demoRunning || commandPending;
  $('lightsButton').title = lightsDisabledByAdmin
    ? 'LUCES deshabilitadas para esta unidad por el Administrador.'
    : (!powered ? 'Presiona ENCENDER/APAGAR para habilitar las luces.' : '');

  const soundDisabledByAdmin = disabledList.includes('SONIDO');
  $('soundButton').disabled = !guestCanControl || !powered || !apiReady || !activeCommandByName('SONIDO') || demoRunning || commandPending;
  $('soundButton').title = soundDisabledByAdmin
    ? 'SONIDO deshabilitado para esta unidad por el Administrador.'
    : (!powered ? 'Presiona ENCENDER/APAGAR para habilitar el sonido.' : '');

  $('runDemoButton').disabled = !guestCanControl || !powered || !apiReady || !demos.length || ! $('demoSelect').value || demoRunning || commandPending;
  $('runDemoButton').title = !powered ? 'Presiona ENCENDER/APAGAR para ejecutar una DEMO.' : '';
  $('demoSelect').disabled = !guestCanControl || !powered || !apiReady || demoRunning || commandPending || demos.length === 0;
  for (const button of $('commandButtons').querySelectorAll('button')) button.disabled = !guestCanControl || !powered || demoRunning || commandPending || !apiReady;
  updateDemoDisplay();
}

function updateRoleNavigation() {
  const isGuest = activeUserRole === 'INVITADO';
  const controlTab = $('controlTab');
  const monitorTab = $('monitorTab');
  if (controlTab) {
    controlTab.disabled = isGuest && !guestSessionActive;
    controlTab.title = isGuest && !guestSessionActive
      ? 'Inicia sesión o solicita una prueba para habilitar el control.'
      : '';
  }
  if (monitorTab) {
    monitorTab.classList.toggle('d-none', isGuest);
    monitorTab.hidden = isGuest;
    if (isGuest) monitorTab.setAttribute('aria-hidden', 'true');
    else monitorTab.removeAttribute('aria-hidden');
  }
}

function updateDemoDisplay() {
  const select = $('demoSelect');
  const display = $('demoDisplayBox');
  const prevBtn = $('demoPrevBtn');
  const nextBtn = $('demoNextBtn');
  if (!display || !select) return;
  const activeOption = select.options[select.selectedIndex];
  const fullText = activeOption?.text ? activeOption.text.replaceAll('_', ' ') : 'No hay DEMO';
  display.textContent = fullText;
  display.title = fullText;
  const powered = isPoweredOn();
  const canCycle = powered && apiReady && !demoRunning && !commandPending && select.options.length > 1;
  if (prevBtn) prevBtn.disabled = !canCycle;
  if (nextBtn) nextBtn.disabled = !canCycle;
}

function cycleDemo(direction = 1) {
  const select = $('demoSelect');
  if (!select || select.options.length <= 1) return;
  const powered = isPoweredOn();
  if (!powered || !apiReady || demoRunning || commandPending) return;
  triggerHaptic('tap');
  playBip(480, 0.035);
  let nextIdx = select.selectedIndex + direction;
  if (nextIdx >= select.options.length) nextIdx = 1;
  if (nextIdx < 1) nextIdx = select.options.length - 1;
  select.selectedIndex = nextIdx;
  select.dispatchEvent(new Event('change'));
  updateDemoDescription();
  updateControls();
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
  updateDemoDisplay();
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
    if (heldDriveDirection || heldSteerDirection) applyHeldMovement();
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

    const isConnected = result?.status === 'available' && (
      result?.database === 'connected' ||
      (typeof result?.database === 'string' && result.database.toLowerCase().includes('rds'))
    );

    if (isConnected) {
      const ms = Number.isFinite(result.latency_ms) ? ` (${result.latency_ms} ms)` : '';
      setIndicator('dbIndicator', 'available', `Conectado · RDS responde${ms}`);
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

function showView(view, { skipSafetyStop = false } = {}) {
  if (activeUserRole === 'INVITADO' && (view === 'monitor' || (view === 'control' && !guestSessionActive))) {
    window.adminModule?.notify(
      view === 'monitor'
        ? 'El monitoreo está disponible al iniciar sesión.'
        : 'Solicita una prueba o inicia sesión para usar el control.',
      'info'
    );
    view = 'admin';
  }

  triggerHaptic('tap');
  playBip(580, 0.035);
  const isControl = view === 'control';
  const isMonitor = view === 'monitor';
  const isAdmin = view === 'admin';

  // Enclavamiento de Seguridad (Safety Interlock):
  // Si el operador sale de la vista CONTROL mientras el vehículo estaba en marcha,
  // detener el movimiento automáticamente para evitar operación desatendida.
  if (!skipSafetyStop && !isControl && isPoweredOn() && !demoRunning) {
    requestStop();
  }

  monitorVisible = isMonitor;

  const controlEl = $('controlView');
  const monitorEl = $('monitorView');
  const adminEl = $('adminView');

  if (controlEl) {
    controlEl.classList.toggle('d-none', !isControl);
    controlEl.hidden = !isControl;
    if (isControl) {
      controlEl.style.removeProperty('display');
    } else {
      controlEl.style.setProperty('display', 'none', 'important');
    }
  }

  if (monitorEl) {
    monitorEl.classList.toggle('d-none', !isMonitor);
    monitorEl.hidden = !isMonitor;
    if (isMonitor) {
      monitorEl.style.removeProperty('display');
    } else {
      monitorEl.style.setProperty('display', 'none', 'important');
    }
  }

  if (adminEl) {
    adminEl.classList.toggle('d-none', !isAdmin);
    adminEl.hidden = !isAdmin;
    if (isAdmin) {
      adminEl.style.removeProperty('display');
    } else {
      adminEl.style.setProperty('display', 'none', 'important');
    }
  }

  $('controlTab').classList.toggle('is-active', isControl);
  $('monitorTab').classList.toggle('is-active', isMonitor);
  const adminTabEl = $('adminTab');
  if (adminTabEl) adminTabEl.classList.toggle('is-active', isAdmin);

  if (isControl) {
    $('controlTab').setAttribute('aria-current', 'page');
    $('monitorTab').removeAttribute('aria-current');
    if (adminTabEl) adminTabEl.removeAttribute('aria-current');
  } else if (isMonitor) {
    $('monitorTab').setAttribute('aria-current', 'page');
    $('controlTab').removeAttribute('aria-current');
    if (adminTabEl) adminTabEl.removeAttribute('aria-current');
    loadMonitorData();
  } else if (isAdmin) {
    if (adminTabEl) adminTabEl.setAttribute('aria-current', 'page');
    $('controlTab').removeAttribute('aria-current');
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
  catch { setEventStatus('Mensaje recibido', 'El servidor envió un mensaje no JSON.'); return; }
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    setEventStatus('Mensaje recibido', 'El mensaje del servidor no tiene el formato de evento esperado.');
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
    setEventStatus('Estado inicial recibido', 'La conexión WSS del navegador recibió el estado inicial del servidor.');
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
    // La lista de ejecución representa exclusivamente los eventos emitidos por
    // la DEMO activa; los movimientos manuales solo actualizan el monitor.
    if (demoEventsVisible && isDemoEvent) {
      const host = $('demoMovementList');
      host.querySelector('.demo-progress-empty')?.remove();
      const item = document.createElement('li');
      item.textContent = label;
      host.append(item);
      window.clearTimeout(demoEventsTimer);
      demoEventsTimer = window.setTimeout(() => { demoEventsVisible = false; }, 30000);
    }
    const parts = [`vehículo ${message.id_vehiculo ?? config.vehicleId}`];
    if (message.codigo !== undefined) parts.push(`código ${message.codigo}`);
    if (message.timestamp) parts.push(`marca ${message.timestamp}`);
    setEventStatus(`Evento recibido · ${label}`, `${parts.join(' · ')}. Evento del backend; no confirma ejecución física.`);
    return;
  }
  setEventStatus(String(message.type || 'Mensaje recibido'), 'Evento recibido por el navegador desde el servidor WSS.');
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
  if (!command || !apiReady || (!canUseControl() && !priorityStop)) return false;
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
  const isEmergency = document.querySelector('.stop-bezel')?.classList.contains('is-latched');
  $('driveText').textContent = isEmergency ? '¡PARO DE EMERGENCIA!' : command.nombre.replaceAll('_', ' ');
  $('driveIndicator').classList.toggle('active', command.nombre !== 'DETENER');
  try {
    await api.registerMovement(command.id_comando, controller.signal);
    if (sequence !== actionSequence) return false;
    setAction(`Aceptado por API · ${command.nombre}`, 'Respuesta HTTP exitosa. Esto no confirma movimiento físico.');
    showAlert('errorAlert', '');
    if (priorityStop && demoRunning) showAlert('configAlert', 'DETENER fue enviado durante la DEMO; revisa el estado del vehículo.');
    return true;
  } catch (error) {
    if (error.name === 'AbortError' || sequence !== actionSequence) return false;
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

async function shutdownGuestVehicle() {
  const wasPoweredOn = isPoweredOn();
  holdGeneration += 1;
  heldDirection = null;
  heldDriveDirection = null;
  heldSteerDirection = null;
  lastDirection = 'neutral';
  driveJoystick?.reset();
  steerJoystick?.reset();
  joystick?.reset();

  await publishControlState({ forward: false, backward: false, left: false, right: false });

  const stopCommand = activeCommandByName('DETENER');
  if (stopCommand) {
    await sendCommand(stopCommand, { priorityStop: true });
  }

  if (!wasPoweredOn) return;

  const powerOffCommand = getPowerCommand(true);
  if (!powerOffCommand) {
    setAction('No se pudo apagar', 'No hay un comando de apagado activo para esta unidad.');
    showAlert('errorAlert', 'No hay un comando de apagado activo para esta unidad.');
    return;
  }

  const sent = await sendCommand(powerOffCommand, { priorityStop: true });
  if (!sent) {
    setAction('No se pudo apagar', 'La API no confirmó el pulso de apagado.');
    showAlert('errorAlert', 'La API no confirmó el pulso de apagado.');
    return;
  }

  const button = $('powerButton');
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-label', 'Interruptor encender o apagar; indicador visual apagado. El vehículo no informa el estado físico.');
  releaseWakeLock();
  playPowerSound(false);
  $('driveText').textContent = 'Apagado';
  $('driveIndicator').classList.remove('active', 'is-emergency');
  updateControls();
}

async function toggleUtility(name, buttonId) {
  triggerHaptic('tap');
  const command = activeCommandByName(name);
  if (!command) return;
  if (!await sendCommand(command)) return;
  const button = $(buttonId);
  const isOn = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(isOn));
  button.setAttribute('aria-label', `Interruptor de ${name === 'LUCES' ? 'luces' : 'sonido'}; indicador visual ${isOn ? 'encendido' : 'apagado'}. El vehículo no informa el estado físico.`);
  playBip(isOn ? 620 : 420, 0.04);
}

async function togglePower() {
  triggerHaptic('tap');
  const button = $('powerButton');
  const isCurrentlyOn = isPoweredOn();
  const command = getPowerCommand(isCurrentlyOn);
  if (!command) return;
  if (!await sendCommand(command)) return;
  const nextState = !isCurrentlyOn;
  button.setAttribute('aria-pressed', String(nextState));
  button.setAttribute('aria-label', `Interruptor encender o apagar; indicador visual ${nextState ? 'encendido' : 'apagado'}. El vehículo no informa el estado físico.`);
  triggerHaptic('click');
  playPowerSound(nextState);
  if (!nextState) {
    releaseWakeLock();
    requestStop();
    forkJoystick?.reset();

    $('driveText').textContent = 'Apagado';
    $('driveIndicator').classList.remove('active', 'is-emergency');
  } else {
    requestWakeLock();
    document.querySelector('.stop-bezel')?.classList.remove('is-latched');
    $('driveIndicator')?.classList.remove('is-emergency');
  }
  updateControls();
}

function buildControlState() {
  let state = {
    forward: heldDriveDirection === 'forward',
    backward: heldDriveDirection === 'backward',
    left: Boolean(heldDriveDirection && heldSteerDirection === 'left'),
    right: Boolean(heldDriveDirection && heldSteerDirection === 'right'),
  };
  let reason = heldSteerDirection && !heldDriveDirection
    ? 'Mantén también la palanca de tracción para girar.'
    : '';

  const commandBySignal = {
    forward: names.forward,
    backward: names.backward,
    left: names.left,
    right: names.right,
  };
  for (const signal of Object.keys(state)) {
    if (state[signal] && !activeCommandByName(commandBySignal[signal])) {
      state[signal] = false;
      reason = `${commandBySignal[signal]} está deshabilitado o no disponible.`;
    }
  }

  // Sin tracción activa, nunca dejamos una salida de dirección encendida sola.
  if (!state.forward && !state.backward) {
    state.left = false;
    state.right = false;
  }
  return { state, reason };
}

function controlStateKey(state) {
  return `${Number(state.forward)}${Number(state.backward)}${Number(state.left)}${Number(state.right)}`;
}

function publishControlState(state) {
  const payload = { ...state, lease_ms: 1600 };
  const request = controlStateQueue
    .catch(() => false)
    .then(async () => {
      try {
        await api.setControlState(payload);
        return true;
      } catch (error) {
        setAction('Error al actualizar señales', error.message);
        showAlert('errorAlert', error.message);
        return false;
      }
    });
  controlStateQueue = request;
  return request;
}

function applyHeldMovement() {
  const previous = heldDirection;
  const { state, reason } = buildControlState();
  const next = controlStateKey(state);
  const hasSignals = Object.values(state).some(Boolean);
  if (next === previous) {
    if (reason) {
      setAction('Movimiento combinado no disponible', reason);
      $('driveText').textContent = reason;
      $('driveIndicator')?.classList.remove('active');
    } else if (!hasSignals && !heldDriveDirection && !heldSteerDirection) {
      $('driveText').textContent = 'En espera';
    }
    return;
  }

  heldDirection = hasSignals ? next : null;
  lastDirection = state.backward ? 'backward' : (state.forward ? 'forward' : 'neutral');
  const generation = ++holdGeneration;

  if (hasSignals) {
    triggerHaptic('direction');
    document.querySelector('.stop-bezel')?.classList.remove('is-latched');
    $('driveIndicator')?.classList.remove('is-emergency');
    if (state.backward) startReverseBeep();
    else stopReverseBeep();
    $('driveText').textContent = [
      state.forward && 'AVANZAR',
      state.backward && 'RETROCEDER',
      state.left && 'IZQUIERDA',
      state.right && 'DERECHA',
    ].filter(Boolean).join(' + ');
    $('driveIndicator')?.classList.add('active');
    void publishControlState(state);
    renewControlStateWhileHeld(generation);
    return;
  }

  stopReverseBeep();
  if (previous) void publishControlState({ forward: false, backward: false, left: false, right: false });
  if (reason) {
    setAction('Movimiento combinado no disponible', reason);
    $('driveText').textContent = reason;
    $('driveIndicator')?.classList.remove('active');
  } else if (!heldDriveDirection && !heldSteerDirection) {
    $('driveText').textContent = 'En espera';
    $('driveIndicator')?.classList.remove('active');
  }
}

function handleAxisDirection(axis, direction) {
  if (axis === 'drive') {
    if (heldDriveDirection === direction) return;
    heldDriveDirection = direction;
  } else {
    if (heldSteerDirection === direction) return;
    heldSteerDirection = direction;
  }
  applyHeldMovement();
}

function releaseAxis(axis) {
  if (axis === 'drive') heldDriveDirection = null;
  else heldSteerDirection = null;
  applyHeldMovement();
}

function handleDirection(name) {
  handleAxisDirection(name === 'forward' || name === 'backward' ? 'drive' : 'steer', name);
}

const HOLD_RENEWAL_MS = 600;
const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function renewControlStateWhileHeld(generation) {
  while (generation === holdGeneration && heldDirection && apiReady && !demoRunning) {
    await wait(HOLD_RENEWAL_MS);
    if (generation !== holdGeneration || !heldDirection) break;
    const { state } = buildControlState();
    if (!Object.values(state).some(Boolean)) break;
    await publishControlState(state);
  }
}

function handleForkDirection(direction) {
  if (direction === 'up' || direction === 'down') {
    triggerHaptic('direction');
    playForkSound(direction === 'up');
    document.querySelector('.stop-bezel')?.classList.remove('is-latched');
    $('driveIndicator')?.classList.remove('is-emergency');
  }
  const commandName = direction === 'up' ? names.forkUp : names.forkDown;
  const command = activeCommandByName(commandName);
  if (!command) {
    const vId = config.vehicleId || '1';
    const disabled = getDisabledCommandsForVehicle(vId);
    if (disabled.includes(commandName)) {
      setAction('Movimiento bloqueado', `Las horquillas están deshabilitadas para la unidad #${vId} por el Administrador.`);
      $('forkJoystickStatus').textContent = 'Horquillas deshabilitadas por Administrador';
    } else {
      setAction('Comando no disponible', `El catálogo no contiene ${commandName} activo.`);
      $('forkJoystickStatus').textContent = 'Comando de horquillas no disponible';
    }
    return;
  }
  $('forkJoystickStatus').textContent = direction === 'up' ? 'Subiendo horquillas…' : 'Bajando horquillas…';
  sendCommand(command).then((sent) => {
    if (sent) $('forkJoystickStatus').textContent = `${direction === 'up' ? 'Subir' : 'Bajar'} solicitado`;
    else $('forkJoystickStatus').textContent = 'Comando no enviado';
  });
}

function requestStop(isEmergencyButton = false) {
  stopReverseBeep();
  if (isEmergencyButton) {
    triggerHaptic('stop');
    playStopSound();
    const bezel = document.querySelector('.stop-bezel');
    if (bezel) bezel.classList.add('is-latched');
    $('driveText').textContent = '¡PARO DE EMERGENCIA!';
    $('driveIndicator').className = 'status-indicator is-emergency';
  }
  if (lastDirection === 'neutral' && !heldDirection && !heldDriveDirection && !heldSteerDirection && !demoRunning && !commandPending && !isEmergencyButton) return;
  holdGeneration += 1;
  heldDirection = null;
  heldDriveDirection = null;
  heldSteerDirection = null;
  lastDirection = 'neutral';
  driveJoystick?.reset();
  steerJoystick?.reset();
  joystick?.reset();
  const command = activeCommandByName('DETENER');
  const shouldSendStopCommand = Boolean(command && (isEmergencyButton || demoRunning));
  void publishControlState({ forward: false, backward: false, left: false, right: false }).then((sent) => {
    if (shouldSendStopCommand || !sent) {
      if (command) sendCommand(command, { priorityStop: true });
      else if (!sent) setAction('No se pudo detener', 'No hay respuesta del control de señales ni un comando DETENER activo.');
    }
  });
}

function enableFloatingSwitcherDrag() {
  // Switcher anclado de forma fija e inamovible en el dock inferior (estándar industrial).
  // Se remueven coordenadas residuales en localStorage e inline styles para que el anclaje CSS gobierne siempre.
  try {
    localStorage.removeItem('controlIoT.switcherPosition');
    const bubble = document.querySelector('.floating-view-switcher');
    if (bubble) {
      bubble.style.removeProperty('left');
      bubble.style.removeProperty('top');
      bubble.style.removeProperty('right');
      bubble.style.removeProperty('bottom');
    }
  } catch { /* Ignorar si no está disponible */ }
}

async function executeDemo() {
  if (!canUseControl()) return;
  triggerHaptic('tap');
  playBip(720, 0.05);
  const demoId = $('demoSelect').value;
  const demo = demos.find((item) => String(item.id_demo) === demoId);
  if (!demo || demoRunning || commandPending) return;
  demoRunning = true;
  demoEventsVisible = true;
  window.clearTimeout(demoEventsTimer);
  $('demoMovementList').replaceChildren();
  const demoSequence = actionSequence;
  setAction(`Solicitada · DEMO ${demo.nombre}`, 'La API ejecuta la secuencia y controla el orden y los tiempos.');
  setEventStatus('Esperando eventos de DEMO', 'La sesión WSS del navegador escucha los eventos publicados por el backend.');
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
  showView('control');
  enableFloatingSwitcherDrag();
  $('controlTab').addEventListener('click', () => showView('control'));
  $('monitorTab').addEventListener('click', () => showView('monitor'));
  $('adminTab')?.addEventListener('click', () => showView('admin'));
  $('monitorRefresh').addEventListener('click', loadMonitorData);
  // Palanca vertical de tracción (Adelante / Atrás)
  const driveEl = $('driveJoystick');
  if (driveEl) {
    driveJoystick = initVerticalStick(driveEl, $('driveJoyKnob'), {
      onDirection: (direction) => handleAxisDirection('drive', direction),
      onRelease: () => releaseAxis('drive'),
      canMove: (direction) => canUseControl() && isPoweredOn() && apiReady
        && Boolean(activeCommandByName(direction === 'forward' ? names.forward : names.backward))
        && !demoRunning,
    });
  }

  // Palanca horizontal de dirección (Izquierda / Derecha)
  const steerEl = $('steerJoystick');
  if (steerEl) {
    steerJoystick = initHorizontalStick(steerEl, $('steerJoyKnob'), {
      onDirection: (direction) => handleAxisDirection('steer', direction),
      onRelease: () => releaseAxis('steer'),
      canMove: (direction) => canUseControl() && isPoweredOn() && apiReady
        && Boolean(activeCommandByName(direction === 'left' ? names.left : names.right))
        && !demoRunning,
    });
  }

  // Compatibilidad si existiera joystick legacy
  const legacyJoy = $('joystick');
  if (legacyJoy) {
    joystick = initJoystick(legacyJoy, $('joyKnob'), {
      onDirection: handleDirection,
      onRelease: requestStop,
      canMove: () => isPoweredOn() && apiReady && directionsAvailable() && !demoRunning && !commandPending,
    });
  }

  // Configuración de botones táctiles dedicados para Horquillas
  const setupForkButton = (btnId, direction) => {
    const btn = $(btnId);
    if (!btn) return;
    let timer = null;
    let active = false;

    const start = (e) => {
      e?.preventDefault();
      if (!isPoweredOn()) {
        playBip(260, 0.08);
        triggerHaptic('tap');
        setAction('Vehículo apagado', 'Presiona ENCENDER / APAGAR para habilitar las horquillas.');
        const pwr = $('powerButton');
        if (pwr) {
          pwr.classList.add('pulse-hint');
          setTimeout(() => pwr.classList.remove('pulse-hint'), 1200);
        }
        if ($('forkJoystickStatus')) $('forkJoystickStatus').textContent = 'Enciende el vehículo para usar las horquillas';
        return;
      }
      const vId = config.vehicleId || '1';
      const disabled = getDisabledCommandsForVehicle(vId);
      const cmdName = direction === 'up' ? names.forkUp : names.forkDown;
      if (disabled.includes(cmdName)) {
        playBip(220, 0.1);
        triggerHaptic('stop');
        setAction('Movimiento bloqueado', `${cmdName.replace('_', ' ')} deshabilitado para Unidad #${vId} por el Administrador.`);
        return;
      }
      if (!apiReady || demoRunning || commandPending) return;
      if (!activeCommandByName(cmdName)) {
        handleForkDirection(direction);
        return;
      }
      active = true;
      btn.classList.add('is-active');
      handleForkDirection(direction);
      timer = window.setInterval(() => {
        if (!active || !isPoweredOn() || demoRunning) {
          stop();
          return;
        }
        handleForkDirection(direction);
      }, 650);
    };

    const stop = (e) => {
      e?.preventDefault();
      if (!active) return;
      active = false;
      btn.classList.remove('is-active');
      if (timer) {
        window.clearInterval(timer);
        timer = null;
      }
      if ($('forkJoystickStatus')) $('forkJoystickStatus').textContent = 'Horquillas detenidas';
    };

    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('pointerleave', stop);
  };

  setupForkButton('forkUpBtn', 'up');
  setupForkButton('forkDownBtn', 'down');
  $('powerButton').addEventListener('click', togglePower);
  $('stopButton').addEventListener('click', () => {
    const bezel = document.querySelector('.stop-bezel');
    if (bezel?.classList.contains('is-latched')) {
      bezel.classList.remove('is-latched');
      $('driveIndicator')?.classList.remove('is-emergency');
      $('driveText').textContent = 'Listo (Detenido)';
      triggerHaptic('click');
      playBip(520, 0.04);
      return;
    }
    requestStop(true);
  });
  window.addEventListener('blur', () => requestStop(false));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      requestStop(false);
      releaseWakeLock();
    } else if (isPoweredOn()) {
      requestWakeLock();
    }
  });
  window.addEventListener('pagehide', () => {
    requestStop(false);
    releaseWakeLock();
  });
  window.addEventListener('freeze', () => {
    requestStop(false);
    releaseWakeLock();
  });
  $('lightsButton').addEventListener('click', () => toggleUtility('LUCES', 'lightsButton'));
  $('soundButton').addEventListener('click', () => toggleUtility('SONIDO', 'soundButton'));
  $('demoSelect').addEventListener('change', () => { updateDemoDescription(); updateControls(); });
  $('demoPrevBtn')?.addEventListener('click', () => cycleDemo(-1));
  $('demoNextBtn')?.addEventListener('click', () => cycleDemo(1));
  $('demoDisplayBox')?.addEventListener('click', () => cycleDemo(1));
  $('runDemoButton').addEventListener('click', executeDemo);
  window.addEventListener('keydown', (event) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (event.key === ' ' || event.key === 'Escape') {
      event.preventDefault();
      requestStop(true);
    } else if (event.key === 'l' || event.key === 'L') {
      event.preventDefault();
      toggleUtility('LUCES', 'lightsButton');
    } else if (event.key === 'k' || event.key === 'K') {
      event.preventDefault();
      toggleUtility('SONIDO', 'soundButton');
    } else if (event.key === 'q' || event.key === 'Q') {
      event.preventDefault();
      $('forkUpBtn')?.classList.add('is-active');
      handleForkDirection('up');
    } else if (event.key === 'e' || event.key === 'E') {
      event.preventDefault();
      $('forkDownBtn')?.classList.add('is-active');
      handleForkDirection('down');
    }
  });
  window.addEventListener('keyup', (event) => {
    if (event.key === 'q' || event.key === 'Q') {
      $('forkUpBtn')?.classList.remove('is-active');
    } else if (event.key === 'e' || event.key === 'E') {
      $('forkDownBtn')?.classList.remove('is-active');
    }
  });
  connectSocket();

  const adminModule = new AdminModule(api, {
    onVehicleChange: (newVehicleId) => {
      config.vehicleId = String(newVehicleId);
      api.setVehicleId(newVehicleId);
      setMonitorVehicle(`Vehículo ${newVehicleId}`);
      if (socket) {
        socket.stop();
        const baseWs = config.websocketUrl.replace(/\/ws\/vehicles\/\d+.*$/, '');
        socket.url = `${baseWs}/ws/vehicles/${newVehicleId}`;
        socket.start();
      }
      refreshCommands({ quiet: false });
      loadDemos();
      if (monitorVisible) loadMonitorData();
    },
    onRoleChange: (role) => {
      activeUserRole = String(role || 'INVITADO').toUpperCase();
      updateRoleNavigation();
      updateControls();
      if (activeUserRole === 'INVITADO') showView('admin');
    },
    onGuestSessionChange: async (active) => {
      guestSessionActive = Boolean(active);
      updateRoleNavigation();
      updateControls();
      if (!guestSessionActive) {
        const shutdownPromise = shutdownGuestVehicle();
        if (activeUserRole === 'INVITADO' && !$('controlView').classList.contains('d-none')) {
          showView('admin', { skipSafetyStop: true });
        }
        await shutdownPromise;
      }
    },
  });
  window.adminModule = adminModule;
  window.requestStop = requestStop;
  adminModule.init();

  window.addEventListener('vehicle-commands-updated', () => {
    refreshCommands({ quiet: true });
  });

  try {
    const me = await api.getMe();
    if (me && me.id_usuario) {
      adminModule.setCurrentUser(me);
    } else {
      adminModule.setCurrentUser(null);
    }
  } catch (e) {
    adminModule.setCurrentUser(null);
  }

  await Promise.all([
    refreshCommands(),
    loadDemos(),
    refreshDatabaseHealth(),
  ]);

  window.setInterval(() => refreshCommands({ quiet: true }), 5000);
  window.setInterval(refreshDatabaseHealth, 30000);
}

boot();
