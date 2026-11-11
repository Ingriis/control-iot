const byId = (id) => document.getElementById(id);
let lastHistoryRecords = null;

function visibleHistoryLimit() {
  return 10;
}

function dateParts(value) {
  if (typeof value !== 'string' || !value) return { date: '—', time: '—' };
  const [day, clock = ''] = value.split('T');
  const [year, month, date] = day.split('-');
  return {
    date: year && month && date ? `${date}/${month}/${year}` : day,
    time: clock || '—',
  };
}

export function renderLatestMovement(movement, { source = 'REST', origin = '' } = {}) {
  if (!movement || typeof movement !== 'object') {
    byId('monitorCommand').textContent = 'Sin movimientos';
    byId('monitorTimestamp').textContent = 'El servidor no reporta un estado actual.';
    byId('monitorOrigin').textContent = '';
    return;
  }

  const command = movement.comando;
  byId('monitorCommand').textContent = typeof command === 'string'
    ? command.replaceAll('_', ' ')
    : 'Estado reportado';
  const timestamp = movement.timestamp || movement.fecha_actualizacion || movement.fecha_hora;
  const parts = dateParts(timestamp);
  byId('monitorTimestamp').textContent = timestamp
    ? `Fecha ${parts.date} · Hora ${parts.time}`
    : 'Sin fecha y hora en el dato recibido';
  byId('monitorOrigin').textContent = origin ? `Origen ${origin}` : '';
  byId('monitorNote').textContent = source === 'WSS'
    ? 'Evento recibido del backend por WSS; no confirma ejecución física.'
    : 'Último estado devuelto por la API; no confirma ejecución física.';
}

export function renderHistory(records, { loading = false, error = '' } = {}) {
  byId('historyHeading').textContent = 'Últimos 10 movimientos';
  const host = byId('historyRows');
  const tableWrap = byId('historyTableWrap');
  const message = byId('historyMessage');
  const count = byId('historyCount');
  host.replaceChildren();
  tableWrap.hidden = true;

  if (loading) {
    lastHistoryRecords = null;
    message.hidden = false;
    message.textContent = 'Cargando historial…';
    count.textContent = 'Cargando…';
    return;
  }
  if (error) {
    lastHistoryRecords = null;
    message.hidden = false;
    message.textContent = `No se pudo cargar el historial: ${error}`;
    count.textContent = 'Error';
    return;
  }
  if (!Array.isArray(records)) {
    lastHistoryRecords = null;
    message.hidden = false;
    message.textContent = 'La API devolvió un formato de historial no reconocido.';
    count.textContent = 'Sin datos';
    return;
  }
  if (!records.length) {
    lastHistoryRecords = [];
    message.hidden = false;
    message.textContent = 'Sin movimientos registrados.';
    count.textContent = '0 movimientos';
    return;
  }

  message.hidden = true;
  tableWrap.hidden = false;
  lastHistoryRecords = records;
  const shown = Math.min(records.length, visibleHistoryLimit(), 10);
  byId('historyHeading').textContent = `Últimos ${shown} movimientos`;
  count.textContent = `${shown} visibles · ${records.length} recibidos`;
  records.slice(0, shown).forEach((record, index) => {
    const row = document.createElement('tr');
    const parts = dateParts(record.fecha_hora);
    const cells = [String(index + 1), record.comando || '—', parts.date, parts.time];
    for (const [cellIndex, value] of cells.entries()) {
      const cell = document.createElement(cellIndex === 0 ? 'th' : 'td');
      if (cellIndex === 0) cell.scope = 'row';
      cell.textContent = String(value);
      row.append(cell);
    }
    host.append(row);
  });
}

window.addEventListener('resize', () => {
  if (lastHistoryRecords?.length) renderHistory(lastHistoryRecords);
});

export function setMonitorVehicle(name, id) {
  byId('monitorVehicle').textContent = name ? `${name} · vehículo ${id}` : `Vehículo ${id}`;
}
