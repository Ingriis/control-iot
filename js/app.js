import { createApi } from './api.js';
import { loadConfig, saveConfig, validateConfig } from './config.js';
import { initJoystick, initVerticalJoystick } from './joystick.js';
import { VehicleSocket } from './websocket.js';

const $ = (id) => document.getElementById(id);
const names = {
  forward: 'AVANZAR', backward: 'RETROCEDER', left: 'GIRAR_IZQUIERDA', right: 'GIRAR_DERECHA', stop: 'DETENER',
  forkUp: 'SUBIR_HORQUILLAS', forkDown: 'BAJAR_HORQUILLAS',
};
let config = validateConfig(loadConfig());
let api = createApi(config);
let commands = [];
let demos = [];
let socket = null;
let apiReady = false;
let demoRunning = false;
let commandPending = false;
let actionSequence = 0;
let activeMovementController = null;
let lastDirection = 'neutral';
let apiGeneration = 0;
let holdGeneration = 0;
let heldDirection = null;
let joystick;
let forkJoystick;

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
  return ['AVANZAR', 'RETROCEDER', 'GIRAR_IZQUIERDA', 'GIRAR_DERECHA'].every((name) => activeCommandByName(name));
}

function renderCommands() {
  const host = $('commandButtons');
  host.replaceChildren();
  const special = new Set([...Object.values(names), 'LUCES', 'SONIDO', 'ENCENDER_AUTO', 'ENCENDER', 'APAGAR', 'APAGAR_AUTO', 'ENCENDER_APAGAR', 'POWER']);
  const available = commands.filter((item) => !special.has(item.nombre) && Number(item.activo) === 1);
  if (!available.length) {
    const note = document.createElement('p');
    note.className = 'muted-note';
    note.textContent = 'El catálogo no reporta otros comandos activos.';
    host.append(note);
    return;
  }
  for (const command of available) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'command-button';
    button.disabled = demoRunning || commandPending;
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
  const stopReady = Boolean(activeCommandByName('DETENER'));
  const powerCmd = getPowerCommand($('powerButton')?.getAttribute('aria-pressed') === 'true');
  const joystickDisabled = !apiReady || !directionsAvailable() || demoRunning || commandPending;
  const forkJoystickDisabled = !apiReady || !activeCommandByName(names.forkUp) || !activeCommandByName(names.forkDown) || demoRunning || commandPending;
  $('joystick').setAttribute('aria-disabled', String(joystickDisabled));
  $('joystick').classList.toggle('is-disabled', joystickDisabled);
  $('forkJoystick').setAttribute('aria-disabled', String(forkJoystickDisabled));
  $('forkJoystick').classList.toggle('is-disabled', forkJoystickDisabled);
  if (!apiReady || !activeCommandByName(names.forkUp) || !activeCommandByName(names.forkDown) || demoRunning) forkJoystick?.reset();
  $('powerButton').disabled = !apiReady || !powerCmd || demoRunning || commandPending;
  $('powerButton').title = powerCmd ? '' : 'El catálogo no contiene un comando de encendido/apagado activo.';
  $('stopButton').disabled = !apiReady || !stopReady;
  $('stopButton').title = stopReady ? '' : 'El catálogo no contiene un comando DETENER activo.';
  $('lightsButton').disabled = !apiReady || !activeCommandByName('LUCES') || demoRunning || commandPending;
  $('soundButton').disabled = !apiReady || !activeCommandByName('SONIDO') || demoRunning || commandPending;
  $('runDemoButton').disabled = !apiReady || !demos.length || ! $('demoSelect').value || demoRunning || commandPending;
  $('demoSelect').disabled = !apiReady || demoRunning || commandPending || demos.length === 0;
  for (const button of $('commandButtons').querySelectorAll('button')) button.disabled = demoRunning || commandPending || !apiReady;
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
    $('eventStatus').textContent = 'Estado inicial recibido';
    $('eventDetail').textContent = 'La conexión WSS del navegador recibió el estado inicial del servidor.';
    return;
  }
  if (message.type === 'movement') {
    const command = commands.find((item) => Number(item.codigo) === Number(message.codigo));
    const label = command?.nombre || `código ${message.codigo ?? 'desconocido'}`;
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
  const isCurrentlyOn = button.getAttribute('aria-pressed') === 'true';
  const command = getPowerCommand(isCurrentlyOn);
  if (!command) return;
  if (!await sendCommand(command)) return;
  const nextState = !isCurrentlyOn;
  button.setAttribute('aria-pressed', String(nextState));
  button.setAttribute('aria-label', `Interruptor encender o apagar; indicador visual ${nextState ? 'encendido' : 'apagado'}. El vehículo no informa el estado físico.`);
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

async function executeDemo() {
  const demoId = $('demoSelect').value;
  const demo = demos.find((item) => String(item.id_demo) === demoId);
  if (!demo || demoRunning || commandPending) return;
  demoRunning = true;
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
  $('apiUrl').value = config.apiBaseUrl;
  $('wsUrl').value = config.websocketUrl;
  $('vehicleId').value = config.vehicleId;
  joystick = initJoystick($('joystick'), $('joyKnob'), {
    onDirection: handleDirection,
    onRelease: requestStop,
    canMove: () => apiReady && directionsAvailable() && !demoRunning && !commandPending,
  });
  forkJoystick = initVerticalJoystick($('forkJoystick'), $('forkJoyKnob'), {
    onDirection: handleForkDirection,
    onNeutral: () => { $('forkJoystickStatus').textContent = 'Control centrado · no se envió DETENER.'; },
    canMove: () => apiReady && Boolean(activeCommandByName(names.forkUp)) && Boolean(activeCommandByName(names.forkDown)) && !demoRunning && !commandPending,
  });
  $('powerButton').addEventListener('click', togglePower);
  $('stopButton').addEventListener('click', requestStop);
  window.addEventListener('blur', requestStop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) requestStop(); });
  $('lightsButton').addEventListener('click', () => toggleUtility('LUCES', 'lightsButton'));
  $('soundButton').addEventListener('click', () => toggleUtility('SONIDO', 'soundButton'));
  $('demoSelect').addEventListener('change', () => { updateDemoDescription(); updateControls(); });
  $('runDemoButton').addEventListener('click', executeDemo);
  $('settingsButton').addEventListener('click', () => $('settingsDialog').showModal());
  $('settingsForm').addEventListener('submit', (event) => {
    if (event.submitter?.id !== 'saveButton') return;
    event.preventDefault();
    try {
      const next = validateConfig({
        apiBaseUrl: $('apiUrl').value.trim(),
        websocketUrl: $('wsUrl').value.trim(),
        vehicleId: $('vehicleId').value.trim(),
      });
      config = next;
      saveConfig(config);
      actionSequence += 1;
      activeMovementController?.abort();
      apiGeneration += 1;
      commands = [];
      demos = [];
      apiReady = false;
      demoRunning = false;
      commandPending = false;
      renderCommands();
      renderDemos();
      api = createApi(config);
      $('settingsDialog').close();
      showAlert('configAlert', '');
      refreshCommands();
      loadDemos();
      connectSocket();
      refreshDatabaseHealth();
    } catch (error) {
      showAlert('configAlert', error.message);
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
