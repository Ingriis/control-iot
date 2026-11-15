/**
 * Módulo de Administración, Gestión Comercial, Roles, Editor de Demos y Sesiones de Invitado.
 * Práctica 4.3 IoT Pachuca.
 */

export class AdminModule {
  constructor(api, options = {}) {
    this.api = api;
    this.currentUser = null;
    this.guestSession = null;
    this.guestTimer = null;
    this.onVehicleChange = options.onVehicleChange || (() => {});
    this.onRoleChange = options.onRoleChange || (() => {});
    this.activeSubtab = 'dashboard';
  }

  setCurrentUser(user) {
    this.currentUser = user;
    this.renderRoleBar();
    this.adaptViewForRole();
  }

  getCurrentUser() {
    return this.currentUser;
  }

  init() {
    this.bindEvents();
    this.renderRoleBar();
  }

  bindEvents() {
    // Botones de cambio de subpestaña administrativa
    document.querySelectorAll('[data-admin-subtab]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.adminSubtab;
        this.switchSubtab(tab);
      });
    });

    // Formulario de Login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }

    // Botones de acceso rápido para pruebas (Admin, Comprador, Invitado)
    const quickAdmin = document.getElementById('quickLoginAdmin');
    if (quickAdmin) {
      quickAdmin.addEventListener('click', () => {
        document.getElementById('loginUsername').value = 'admin';
        document.getElementById('loginPassword').value = 'Pass1234!';
      });
    }

    const quickUser = document.getElementById('quickLoginUser');
    if (quickUser) {
      quickUser.addEventListener('click', () => {
        document.getElementById('loginUsername').value = 'comprador1';
        document.getElementById('loginPassword').value = 'Pass1234!';
      });
    }

    // Botón Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.handleLogout());
    }

    // Modal forms
    const newModelForm = document.getElementById('newModelForm');
    if (newModelForm) {
      newModelForm.addEventListener('submit', (e) => this.handleCreateModel(e));
    }

    const newUnitForm = document.getElementById('newUnitForm');
    if (newUnitForm) {
      newUnitForm.addEventListener('submit', (e) => this.handleCreateUnit(e));
    }

    const newClientForm = document.getElementById('newClientForm');
    if (newClientForm) {
      newClientForm.addEventListener('submit', (e) => this.handleCreateClient(e));
    }

    // Selector Mis Vehículos
    const myVehiclesSelect = document.getElementById('myVehiclesSelect');
    if (myVehiclesSelect) {
      myVehiclesSelect.addEventListener('change', (e) => {
        const vId = e.target.value;
        if (vId) {
          this.api.setVehicleId(vId);
          this.onVehicleChange(vId);
        }
      });
    }

    // Editor de Demos
    const addStepBtn = document.getElementById('addDemoStepBtn');
    if (addStepBtn) {
      addStepBtn.addEventListener('click', () => this.addDemoStepRow());
    }

    const saveDemoForm = document.getElementById('saveDemoForm');
    if (saveDemoForm) {
      saveDemoForm.addEventListener('submit', (e) => this.handleSaveCustomDemo(e));
    }

    // Invitados
    const requestGuestBtn = document.getElementById('requestGuestSessionBtn');
    if (requestGuestBtn) {
      requestGuestBtn.addEventListener('click', () => this.handleRequestGuestSession());
    }

    const releaseGuestBtn = document.getElementById('releaseGuestSessionBtn');
    if (releaseGuestBtn) {
      releaseGuestBtn.addEventListener('click', () => this.handleReleaseGuestSession());
    }
  }

  renderRoleBar() {
    const roleBadge = document.getElementById('currentRoleBadge');
    const userGreeting = document.getElementById('currentUserGreeting');
    const authActionBtn = document.getElementById('authActionBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (this.currentUser) {
      const role = (this.currentUser.rol || 'USUARIO').toUpperCase();
      if (roleBadge) {
        roleBadge.textContent = role;
        roleBadge.className = `badge bg-${role === 'ADMINISTRADOR' ? 'danger' : role === 'USUARIO' ? 'primary' : 'warning'} text-uppercase`;
      }
      if (userGreeting) {
        userGreeting.textContent = `${this.currentUser.nombre_completo || this.currentUser.username}`;
      }
      if (authActionBtn) authActionBtn.classList.add('d-none');
      if (logoutBtn) logoutBtn.classList.remove('d-none');
    } else {
      if (roleBadge) {
        roleBadge.textContent = 'INVITADO (PÚBLICO)';
        roleBadge.className = 'badge bg-secondary text-uppercase';
      }
      if (userGreeting) userGreeting.textContent = 'Sesión anónima';
      if (authActionBtn) authActionBtn.classList.remove('d-none');
      if (logoutBtn) logoutBtn.classList.add('d-none');
    }
  }

  adaptViewForRole() {
    const role = (this.currentUser?.rol || 'INVITADO').toUpperCase();
    const adminTabs = document.querySelectorAll('.role-admin-only');
    const userTabs = document.querySelectorAll('.role-user-only');
    const guestSections = document.querySelectorAll('.role-guest-only');

    if (role === 'ADMINISTRADOR') {
      adminTabs.forEach((el) => el.classList.remove('d-none'));
      userTabs.forEach((el) => el.classList.add('d-none'));
      guestSections.forEach((el) => el.classList.add('d-none'));
      this.switchSubtab('dashboard');
    } else if (role === 'USUARIO') {
      adminTabs.forEach((el) => el.classList.add('d-none'));
      userTabs.forEach((el) => el.classList.remove('d-none'));
      guestSections.forEach((el) => el.classList.add('d-none'));
      this.switchSubtab('myVehicles');
      this.loadMyVehicles();
    } else {
      // INVITADO
      adminTabs.forEach((el) => el.classList.add('d-none'));
      userTabs.forEach((el) => el.classList.add('d-none'));
      guestSections.forEach((el) => el.classList.remove('d-none'));
      this.switchSubtab('guestDemo');
      this.loadGuestCatalog();
    }
    this.onRoleChange(role);
  }

  switchSubtab(subtabId) {
    this.activeSubtab = subtabId;
    document.querySelectorAll('[data-admin-subtab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.adminSubtab === subtabId);
    });

    document.querySelectorAll('.admin-subtab-pane').forEach((pane) => {
      pane.classList.add('d-none');
    });

    const activePane = document.getElementById(`subtab-${subtabId}`);
    if (activePane) {
      activePane.classList.remove('d-none');
    }

    // Cargar datos según la sección
    if (subtabId === 'dashboard') this.loadDashboardMetrics();
    else if (subtabId === 'models') this.loadModels();
    else if (subtabId === 'units') this.loadUnits();
    else if (subtabId === 'clients') this.loadClients();
    else if (subtabId === 'audit') this.loadAuditLogs();
    else if (subtabId === 'myVehicles') this.loadMyVehicles();
    else if (subtabId === 'demoEditor') this.loadDemoEditor();
    else if (subtabId === 'guestDemo') this.loadGuestCatalog();
  }

  async handleLogin(e) {
    e.preventDefault();
    const userField = document.getElementById('loginUsername');
    const passField = document.getElementById('loginPassword');
    const alertBox = document.getElementById('loginAlert');

    if (alertBox) alertBox.classList.add('d-none');

    try {
      const res = await this.api.login(userField.value.trim(), passField.value);
      sessionStorage.setItem('iot_token', res.access_token);
      this.setCurrentUser(res.user);

      // Cerrar modal bootstrap si existe
      const modalEl = document.getElementById('loginModal');
      if (modalEl && window.bootstrap) {
        const modal = window.bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al iniciar sesión.';
        alertBox.classList.remove('d-none');
      }
    }
  }

  async handleLogout() {
    try {
      await this.api.logout();
    } catch (e) {
      // Ignorar si ya expiró
    }
    sessionStorage.removeItem('iot_token');
    this.setCurrentUser(null);
  }

  // ---------------------------------------------------------------------------
  // Dashboard & Métricas
  // ---------------------------------------------------------------------------
  async loadDashboardMetrics() {
    try {
      const [models, units, clients, logs] = await Promise.allSettled([
        this.api.getModels(),
        this.api.getUnits(),
        this.api.getClients(),
        this.api.getAuditLogs(10),
      ]);

      const modelsData = models.status === 'fulfilled' ? models.value : [];
      const unitsData = units.status === 'fulfilled' ? units.value : [];
      const clientsData = clients.status === 'fulfilled' ? clients.value : [];

      const soldCount = unitsData.filter((u) => u.estado_comercial === 'vendido').length;
      const exhibCount = unitsData.filter((u) => u.estado_comercial === 'exhibicion').length;
      const availCount = unitsData.filter((u) => u.estado_comercial === 'disponible').length;

      document.getElementById('kpiModels').textContent = modelsData.length;
      document.getElementById('kpiUnitsTotal').textContent = unitsData.length;
      document.getElementById('kpiUnitsSold').textContent = soldCount;
      document.getElementById('kpiUnitsExhib').textContent = exhibCount;
      document.getElementById('kpiUnitsAvail').textContent = availCount;
      document.getElementById('kpiClients').textContent = clientsData.length;
    } catch (err) {
      console.error('Error cargando KPIs:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Catálogo de Modelos
  // ---------------------------------------------------------------------------
  async loadModels() {
    const tableBody = document.getElementById('modelsTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-3">Cargando catálogo...</td></tr>';

    try {
      const models = await this.api.getModels();
      if (!models.length) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-3 text-muted">Sin modelos registrados.</td></tr>';
        return;
      }
      tableBody.innerHTML = models.map((m) => `
        <tr>
          <td><span class="badge bg-secondary">#${m.id_modelo}</span></td>
          <td><strong>${m.nombre}</strong></td>
          <td><code>${m.codigo_modelo}</code></td>
          <td>${m.categoria}</td>
          <td>${m.descripcion}</td>
          <td><span class="badge ${m.activo ? 'bg-success' : 'bg-danger'}">${m.activo ? 'ACTIVO' : 'INACTIVO'}</span></td>
        </tr>
      `).join('');
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-3">Error: ${err.message}</td></tr>`;
    }
  }

  async handleCreateModel(e) {
    e.preventDefault();
    const nombre = document.getElementById('modelName').value.trim();
    const codigo_modelo = document.getElementById('modelCode').value.trim();
    const categoria = document.getElementById('modelCategory').value;
    const descripcion = document.getElementById('modelDesc').value.trim();

    try {
      await this.api.createModel({ nombre, codigo_modelo, categoria, descripcion });
      alert('Modelo creado con éxito.');
      this.loadModels();
      this.loadDashboardMetrics();
      e.target.reset();
    } catch (err) {
      alert(`Error al crear modelo: ${err.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Inventario de Unidades Físicas
  // ---------------------------------------------------------------------------
  async loadUnits() {
    const tableBody = document.getElementById('unitsTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-3">Cargando unidades...</td></tr>';

    try {
      const units = await this.api.getUnits();
      if (!units.length) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-3 text-muted">Sin unidades registradas.</td></tr>';
        return;
      }

      tableBody.innerHTML = units.map((u) => {
        const stateColor = u.estado_comercial === 'vendido' ? 'primary' :
          u.estado_comercial === 'exhibicion' ? 'warning' :
          u.estado_comercial === 'disponible' ? 'success' : 'secondary';

        return `
          <tr>
            <td><span class="badge bg-dark border">#${u.id_vehiculo}</span></td>
            <td><strong>${u.nombre}</strong><br><small class="text-muted">${u.nombre_modelo || 'Sin modelo'}</small></td>
            <td><code>${u.numero_serie || 'S/N'}</code></td>
            <td><span class="badge bg-${stateColor} text-uppercase">${u.estado_comercial}</span></td>
            <td>${u.nombre_propietario ? `<b>${u.nombre_propietario}</b>` : '<span class="text-muted">Empresa</span>'}</td>
            <td>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="sup_${u.id_vehiculo}" ${u.soporte_autorizado ? 'checked' : ''} onchange="window.adminModule.toggleUnitSupport(${u.id_vehiculo}, this.checked)">
                <label class="form-check-label small" for="sup_${u.id_vehiculo}">${u.soporte_autorizado ? 'Autorizado' : 'Sin permiso'}</label>
              </div>
            </td>
            <td>
              <button class="btn btn-sm btn-outline-info" onclick="window.adminModule.openAssignModal(${u.id_vehiculo}, '${u.nombre}', ${u.propietario_id || 'null'}, '${u.estado_comercial}')">
                Asignar
              </button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-3">Error: ${err.message}</td></tr>`;
    }
  }

  async toggleUnitSupport(vehicleId, authorized) {
    try {
      await this.api.toggleSupport(vehicleId, { soporte_autorizado: authorized });
      this.loadUnits();
    } catch (err) {
      alert(`No se pudo actualizar soporte: ${err.message}`);
      this.loadUnits();
    }
  }

  async openAssignModal(vehicleId, unitName, currentOwnerId, currentStatus) {
    document.getElementById('assignUnitId').value = vehicleId;
    document.getElementById('assignUnitName').textContent = unitName;
    document.getElementById('assignStatus').value = currentStatus;

    // Llenar select de clientes
    const clientSelect = document.getElementById('assignClientSelect');
    clientSelect.innerHTML = '<option value="">Sin propietario (Empresa)</option>';
    try {
      const clients = await this.api.getClients();
      clients.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.id_usuario;
        opt.textContent = `${c.nombre_completo} (@${c.username})`;
        if (c.id_usuario === currentOwnerId) opt.selected = true;
        clientSelect.appendChild(opt);
      });
    } catch (e) {
      console.error(e);
    }

    if (window.bootstrap) {
      const modal = new window.bootstrap.Modal(document.getElementById('assignModal'));
      modal.show();
    }
  }

  async handleSaveAssignment() {
    const vId = document.getElementById('assignUnitId').value;
    const clientVal = document.getElementById('assignClientSelect').value;
    const statusVal = document.getElementById('assignStatus').value;
    const propietario_id = clientVal ? Number(clientVal) : null;

    try {
      await this.api.assignUnit(vId, { propietario_id, estado_comercial: statusVal });
      alert('Asignación guardada con éxito.');
      this.loadUnits();
      this.loadDashboardMetrics();
      if (window.bootstrap) {
        const modal = window.bootstrap.Modal.getInstance(document.getElementById('assignModal'));
        if (modal) modal.hide();
      }
    } catch (err) {
      alert(`Error al guardar asignación: ${err.message}`);
    }
  }

  async handleCreateUnit(e) {
    e.preventDefault();
    const nombre = document.getElementById('unitName').value.trim();
    const id_modelo = Number(document.getElementById('unitModelSelect').value);
    const numero_serie = document.getElementById('unitSerial').value.trim();
    const estado_comercial = document.getElementById('unitCommercialStatus').value;
    const microcontrolador = document.getElementById('unitMcu').value.trim() || 'ESP8266';

    try {
      await this.api.createUnit({
        nombre, id_modelo, numero_serie, estado_comercial, microcontrolador, descripcion: 'Unidad física de prueba'
      });
      alert('Unidad registrada con éxito.');
      this.loadUnits();
      this.loadDashboardMetrics();
      e.target.reset();
    } catch (err) {
      alert(`Error al crear unidad: ${err.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Clientes
  // ---------------------------------------------------------------------------
  async loadClients() {
    const tableBody = document.getElementById('clientsTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-3">Cargando clientes...</td></tr>';

    try {
      const clients = await this.api.getClients();
      if (!clients.length) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-3 text-muted">Sin clientes registrados.</td></tr>';
        return;
      }
      tableBody.innerHTML = clients.map((c) => `
        <tr>
          <td><span class="badge bg-secondary">#${c.id_usuario}</span></td>
          <td><strong>${c.nombre_completo}</strong></td>
          <td><code>@${c.username}</code></td>
          <td>${c.email}</td>
          <td><span class="badge bg-info text-dark">${c.total_unidades} vehículo(s)</span></td>
        </tr>
      `).join('');
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-3">Error: ${err.message}</td></tr>`;
    }
  }

  async handleCreateClient(e) {
    e.preventDefault();
    const username = document.getElementById('clientUsername').value.trim();
    const nombre_completo = document.getElementById('clientFullName').value.trim();
    const email = document.getElementById('clientEmail').value.trim();
    const password = document.getElementById('clientPassword').value;

    try {
      await this.api.createClient({ username, nombre_completo, email, password });
      alert('Cliente comprador registrado con éxito.');
      this.loadClients();
      this.loadDashboardMetrics();
      e.target.reset();
    } catch (err) {
      alert(`Error al registrar cliente: ${err.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Auditoría
  // ---------------------------------------------------------------------------
  async loadAuditLogs() {
    const tableBody = document.getElementById('auditTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-3">Cargando bitácora...</td></tr>';

    try {
      const logs = await this.api.getAuditLogs(50);
      if (!logs.length) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-3 text-muted">Sin registros de auditoría.</td></tr>';
        return;
      }
      tableBody.innerHTML = logs.map((l) => `
        <tr>
          <td class="small text-muted">${l.fecha_hora ? new Date(l.fecha_hora).toLocaleString() : '—'}</td>
          <td><strong>${l.username_actor}</strong> <small class="text-muted">(${l.rol_actor})</small></td>
          <td><span class="badge bg-dark">${l.accion}</span></td>
          <td><code>${l.recurso}</code></td>
          <td><span class="badge ${l.resultado === 'EXITO' ? 'bg-success' : 'bg-danger'}">${l.resultado}</span></td>
          <td class="small">${l.detalle || '—'}</td>
        </tr>
      `).join('');
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-3">Error: ${err.message}</td></tr>`;
    }
  }

  // ---------------------------------------------------------------------------
  // Módulo Mis Vehículos (Comprador)
  // ---------------------------------------------------------------------------
  async loadMyVehicles() {
    const select = document.getElementById('myVehiclesSelect');
    const container = document.getElementById('myVehiclesList');
    if (!select || !container) return;

    try {
      const vehicles = await this.api.getMyVehicles();
      if (!vehicles.length) {
        select.innerHTML = '<option value="">No tienes vehículos asignados</option>';
        container.innerHTML = '<div class="alert alert-warning">Aún no cuentas con vehículos asignados a tu cuenta. Contacta a la empresa comercializadora.</div>';
        return;
      }

      select.innerHTML = vehicles.map((v) => `<option value="${v.id_vehiculo}">${v.nombre} (${v.nombre_modelo || 'Modelo IoT'})</option>`).join('');

      container.innerHTML = vehicles.map((v) => `
        <div class="col-md-6 col-lg-4">
          <div class="card bg-dark border-secondary h-100 p-3">
            <h5 class="text-cyan mb-1">${v.nombre}</h5>
            <p class="small text-muted mb-2">Modelo: ${v.nombre_modelo || 'Estándar'} | S/N: ${v.numero_serie || '—'}</p>
            <p class="small">${v.descripcion || 'Sin descripción'}</p>
            <div class="d-flex justify-content-between align-items-center mt-auto">
              <span class="badge ${v.conectado ? 'bg-success' : 'bg-secondary'}">${v.conectado ? 'EN LÍNEA' : 'DESCONECTADO'}</span>
              <button class="btn btn-sm btn-outline-info" onclick="window.adminModule.selectVehicleToOperate(${v.id_vehiculo})">Operar en Control</button>
            </div>
          </div>
        </div>
      `).join('');

      // Auto-seleccionar primer vehículo si no está seleccionado
      const currentActive = this.api.getVehicleId();
      if (!vehicles.some((v) => String(v.id_vehiculo) === String(currentActive))) {
        this.selectVehicleToOperate(vehicles[0].id_vehiculo);
      }
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`;
    }
  }

  selectVehicleToOperate(vId) {
    this.api.setVehicleId(vId);
    const select = document.getElementById('myVehiclesSelect');
    if (select) select.value = String(vId);
    this.onVehicleChange(vId);

    // Cambiar a pestaña Control
    const controlTab = document.getElementById('controlTab');
    if (controlTab) controlTab.click();
  }

  // ---------------------------------------------------------------------------
  // Editor de DEMOS
  // ---------------------------------------------------------------------------
  async loadDemoEditor() {
    this.demoSteps = [];
    const container = document.getElementById('demoStepsContainer');
    if (container) container.innerHTML = '';
    this.addDemoStepRow(); // Paso inicial
  }

  addDemoStepRow() {
    const container = document.getElementById('demoStepsContainer');
    if (!container) return;
    const stepIndex = container.children.length + 1;

    const row = document.createElement('div');
    row.className = 'demo-step-row d-flex gap-2 align-items-center mb-2 p-2 bg-dark rounded border border-secondary';
    row.innerHTML = `
      <span class="badge bg-secondary">#${stepIndex}</span>
      <select class="form-select form-select-sm step-command" required>
        <option value="1">AVANZAR</option>
        <option value="2">RETROCEDER</option>
        <option value="3">GIRAR IZQUIERDA</option>
        <option value="4">GIRAR DERECHA</option>
        <option value="5">SUBIR HORQUILLAS</option>
        <option value="6">BAJAR HORQUILLAS</option>
        <option value="8">LUCES</option>
        <option value="11">SONIDO</option>
        <option value="9">DETENER</option>
      </select>
      <div class="input-group input-group-sm" style="width: 140px;">
        <input type="number" class="form-control step-duration" value="1500" min="200" max="10000" step="100" title="Duración (ms)">
        <span class="input-group-text">ms</span>
      </div>
      <div class="input-group input-group-sm" style="width: 130px;">
        <input type="number" class="form-control step-pause" value="300" min="0" max="5000" step="100" title="Pausa (ms)">
        <span class="input-group-text">pausa</span>
      </div>
      <button type="button" class="btn btn-sm btn-outline-danger" onclick="this.parentElement.remove()">✕</button>
    `;
    container.appendChild(row);
  }

  async handleSaveCustomDemo(e) {
    e.preventDefault();
    const nombre = document.getElementById('demoCustomName').value.trim();
    const descripcion = document.getElementById('demoCustomDesc').value.trim();
    const vId = this.api.getVehicleId();

    const container = document.getElementById('demoStepsContainer');
    const rows = container ? container.querySelectorAll('.demo-step-row') : [];
    if (!rows.length) {
      alert('Debe agregar al menos un paso a la DEMO.');
      return;
    }

    try {
      // 1. Crear demo
      const demoRes = await this.api.createCustomDemo(vId, { nombre, descripcion });
      const demoId = demoRes.id_demo || demoRes.id;

      // 2. Agregar pasos ordenados
      let orden = 1;
      for (const r of rows) {
        const id_comando = Number(r.querySelector('.step-command').value);
        const duracion_ms = Number(r.querySelector('.step-duration').value);
        const pausa_ms = Number(r.querySelector('.step-pause').value);

        await this.api.addDemoMovement(vId, demoId, {
          id_comando,
          orden: orden++,
          duracion_ms,
          pausa_ms,
        });
      }

      alert('¡DEMO privada guardada exitosamente en Amazon RDS!');
      e.target.reset();
      this.loadDemoEditor();
    } catch (err) {
      alert(`Error al guardar la DEMO: ${err.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Invitados y Demostración Comercial
  // ---------------------------------------------------------------------------
  async loadGuestCatalog() {
    const container = document.getElementById('guestCatalogCards');
    if (!container) return;
    container.innerHTML = '<div class="col-12 text-center py-3">Cargando vehículos disponibles para prueba...</div>';

    try {
      const units = await this.api.getGuestCatalog();
      if (!units.length) {
        container.innerHTML = '<div class="col-12 alert alert-info">En este momento no hay unidades de exhibición disponibles.</div>';
        return;
      }

      container.innerHTML = units.map((u) => {
        const isOccupied = u.estado_reserva === 'OCUPADO';
        return `
          <div class="col-12 col-md-6 col-lg-4 guest-catalog-col">
            <div class="card bg-dark border-${isOccupied ? 'warning' : 'info'} h-100 p-3 guest-vehicle-card">
              <div class="d-flex align-items-center justify-content-between mb-1">
                <h5 class="text-cyan mb-0 guest-vehicle-title">${u.nombre_modelo}</h5>
                <span class="badge ${isOccupied ? 'bg-warning text-dark' : 'bg-success'}">${u.estado_reserva}</span>
              </div>
              <p class="guest-unit-meta mb-1">Unidad #${u.id_vehiculo} · Microcontrolador ${u.microcontrolador}</p>
              <p class="guest-unit-desc mb-2">${u.descripcion || 'Vehículo de prueba en exhibición.'}</p>
              <div class="mt-auto d-flex justify-content-end align-items-center pt-2">
                <button class="btn btn-sm ${isOccupied ? 'btn-secondary' : 'btn-cyan'} px-3 guest-book-btn" 
                  ${isOccupied ? 'disabled' : ''} 
                  onclick="window.adminModule.startGuestBooking(${u.id_vehiculo}, '${u.nombre_modelo}')">
                  ${isOccupied ? 'En Uso' : 'Probar Unidad'}
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      container.innerHTML = `<div class="col-12 alert alert-danger">Error: ${err.message}</div>`;
    }
  }

  startGuestBooking(vId, modelName) {
    document.getElementById('guestBookVehicleId').value = vId;
    document.getElementById('guestBookVehicleName').textContent = modelName;
    if (window.bootstrap) {
      const modal = new window.bootstrap.Modal(document.getElementById('guestBookingModal'));
      modal.show();
    }
  }

  async handleRequestGuestSession() {
    const vId = Number(document.getElementById('guestBookVehicleId').value);
    const alias = document.getElementById('guestAliasInput').value.trim() || 'Invitado';

    try {
      const res = await this.api.requestGuestSession(vId, alias, 180);
      this.guestSession = res;
      alert(`¡Sesión concedida para la unidad ${vId}! Tienes 3 minutos de prueba exclusiva.`);

      if (window.bootstrap) {
        const modal = window.bootstrap.Modal.getInstance(document.getElementById('guestBookingModal'));
        if (modal) modal.hide();
      }

      // Activar cronómetro y panel de prueba
      this.startGuestCountdown(res.duracion_segundos || 180);
      this.api.setVehicleId(vId);
      this.onVehicleChange(vId);

      // Ir a Control
      const controlTab = document.getElementById('controlTab');
      if (controlTab) controlTab.click();
    } catch (err) {
      alert(`No se pudo reservar la unidad: ${err.message}`);
    }
  }

  startGuestCountdown(seconds) {
    window.clearInterval(this.guestTimer);
    let remaining = seconds;
    const banner = document.getElementById('guestSessionBanner');
    const timerText = document.getElementById('guestSessionTimer');

    if (banner) banner.classList.remove('d-none');

    const tick = () => {
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      if (timerText) {
        timerText.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
      if (remaining <= 0) {
        window.clearInterval(this.guestTimer);
        alert('Tu tiempo de prueba ha finalizado. La unidad se ha detenido de forma segura.');
        this.handleReleaseGuestSession();
      }
      remaining--;
    };

    tick();
    this.guestTimer = window.setInterval(tick, 1000);
  }

  async handleReleaseGuestSession() {
    window.clearInterval(this.guestTimer);
    if (this.guestSession?.token_sesion) {
      try {
        await this.api.releaseGuestSession(this.guestSession.token_sesion);
      } catch (e) {
        // Ignorar
      }
    }
    this.guestSession = null;
    const banner = document.getElementById('guestSessionBanner');
    if (banner) banner.classList.add('d-none');
    this.loadGuestCatalog();
  }
}
