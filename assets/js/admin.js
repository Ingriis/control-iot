/**
 * Módulo de Administración, Gestión Comercial, Roles, Editor de Demos y Sesiones de Invitado.
 * Práctica 4.3 IoT Pachuca.
 */

import { setAuthToken } from './api.js';
import { playBip, triggerHaptic } from './feedback.js';

/**
 * Notificación flotante estilo Arcade Cyberpunk no bloqueante
 */
export function showArcadeToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('arcadeToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'arcadeToastContainer';
    container.className = 'arcade-toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `arcade-toast toast-${type}`;

  const iconMap = {
    success: '✅',
    error: '⚠️',
    warning: '⏳',
    info: 'ℹ️',
  };
  const icon = iconMap[type] || 'ℹ️';

  toast.innerHTML = `
    <span class="arcade-toast-icon">${icon}</span>
    <span class="arcade-toast-msg">${message}</span>
    <button type="button" class="arcade-toast-close" aria-label="Cerrar">&times;</button>
  `;

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    toast.classList.add('toast-fadeOut');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 220);
  };

  const closeBtn = toast.querySelector('.arcade-toast-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', dismiss);
  }

  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }
}
window.showArcadeToast = showArcadeToast;

export class AdminModule {
  constructor(api, options = {}) {
    this.api = api;
    this.currentUser = null;
    this.guestSession = null;
    this.guestTimer = null;
    this.onVehicleChange = options.onVehicleChange || (() => {});
    this.onRoleChange = options.onRoleChange || (() => {});
    this.activeSubtab = 'dashboard';
    this.demoEditorStage = 1;
  }

  notify(message, type = 'info', duration = 3500) {
    try {
      if (type === 'success') {
        playBip(650, 0.08);
        triggerHaptic('tap');
      } else if (type === 'error') {
        playBip(220, 0.12);
        triggerHaptic('warning');
      } else if (type === 'warning') {
        playBip(440, 0.09);
        triggerHaptic('click');
      }
    } catch (_) {}
    showArcadeToast(message, type, duration);
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
    this.adaptViewForRole();
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

    const editModelForm = document.getElementById('editModelForm');
    if (editModelForm) {
      editModelForm.addEventListener('submit', (e) => this.handleEditModel(e));
    }

    const newUnitForm = document.getElementById('newUnitForm');
    if (newUnitForm) {
      newUnitForm.addEventListener('submit', (e) => this.handleCreateUnit(e));
    }

    const newClientForm = document.getElementById('newClientForm');
    if (newClientForm) {
      newClientForm.addEventListener('submit', (e) => this.handleCreateClient(e));
    }

    const editClientForm = document.getElementById('editClientForm');
    if (editClientForm) {
      editClientForm.addEventListener('submit', (e) => this.handleEditClient(e));
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
      addStepBtn.addEventListener('click', () => this.addDemoStepRow({ isNew: true }));
    }

    const demoVehicleSelect = document.getElementById('demoVehicleSelect');
    if (demoVehicleSelect) {
      demoVehicleSelect.addEventListener('change', () => {
        this.updateDemoWizardVehicleNext();
        this.loadDemosForSelectedVehicle();
      });
    }

    document.getElementById('demoWizardNextDetails')?.addEventListener('click', () => this.continueDemoWizardToSteps());
    document.getElementById('demoWizardBackDetails')?.addEventListener('click', () => this.showDemoEditorStage(1));

    const demoDescriptionModalEl = document.getElementById('demoDescriptionModal');
    const demoDescriptionEditor = document.getElementById('demoDescriptionModalInput');
    const demoTextEditorLabel = document.getElementById('demoTextEditorLabel');
    const demoTextEditorTitle = document.getElementById('demoDescriptionModalTitle');
    const rotatePromptEl = document.getElementById('demoRotatePromptModal');
    if (demoDescriptionModalEl && demoDescriptionEditor && rotatePromptEl) {
      const demoDescriptionModal = window.bootstrap.Modal.getOrCreateInstance(demoDescriptionModalEl);
      const rotatePrompt = window.bootstrap.Modal.getOrCreateInstance(rotatePromptEl);
      let waitingForPortrait = false;
      let activeDemoTextField = null;
      let parentModalToResume = null;
      let keyboardBaselineHeight = 0;
      let mobileKeyboardVisible = false;
      const isSmallLandscape = () => window.matchMedia('(orientation: landscape) and (max-height: 600px) and (pointer: coarse)').matches;
      const textFieldSelector = 'input[type="text"], input[type="email"], input[type="search"], input[type="tel"], input[type="url"], textarea';
      const resumeParentModal = () => {
        if (!parentModalToResume) return;
        const parent = parentModalToResume;
        parentModalToResume = null;
        window.bootstrap.Modal.getOrCreateInstance(parent).show();
      };
      const showEditorForActiveField = () => {
        if (!activeDemoTextField) return;
        demoDescriptionEditor.value = activeDemoTextField.value;
        demoDescriptionEditor.placeholder = activeDemoTextField.placeholder || 'Escribe aquí';
        const nearbyLabel = activeDemoTextField.closest('.mb-2, .mb-3, .demo-wizard-field, .form-group')?.querySelector('label')?.textContent;
        const label = (activeDemoTextField.labels?.[0]?.textContent
          || nearbyLabel
          || activeDemoTextField.getAttribute('aria-label')
          || activeDemoTextField.name
          || activeDemoTextField.placeholder
          || 'Texto').trim().replace(/[:：]\s*$/, '');
        if (demoTextEditorLabel) demoTextEditorLabel.textContent = label;
        if (demoTextEditorTitle) demoTextEditorTitle.textContent = label;
        demoDescriptionEditor.rows = activeDemoTextField.tagName === 'TEXTAREA' ? 5 : 2;
        demoDescriptionModal.show();
      };
      const openTextEditor = (field) => {
        activeDemoTextField = field;
        const parentModal = field.closest('.modal.show');
        if (parentModal && parentModal !== demoDescriptionModalEl && parentModal !== rotatePromptEl) {
          parentModalToResume = parentModal;
          parentModal.addEventListener('hidden.bs.modal', () => {
            if (isSmallLandscape()) {
              waitingForPortrait = true;
              rotatePrompt.show();
            } else {
              showEditorForActiveField();
            }
          }, { once: true });
          window.bootstrap.Modal.getOrCreateInstance(parentModal).hide();
          return;
        }
        if (isSmallLandscape()) {
          waitingForPortrait = true;
          rotatePrompt.show();
          return;
        }
        showEditorForActiveField();
      };
      const openDescriptionWhenPortrait = () => {
        if (waitingForPortrait && !isSmallLandscape()) rotatePrompt.hide();
      };
      rotatePromptEl.addEventListener('hidden.bs.modal', () => {
        if (waitingForPortrait && !isSmallLandscape()) {
          waitingForPortrait = false;
          showEditorForActiveField();
        } else resumeParentModal();
      });
      window.addEventListener('orientationchange', openDescriptionWhenPortrait);
      window.addEventListener('resize', openDescriptionWhenPortrait);
      const visualViewport = window.visualViewport;
      const handleKeyboardViewportChange = () => {
        if (!demoDescriptionModalEl.classList.contains('show') || !visualViewport || !keyboardBaselineHeight) return;
        const currentHeight = visualViewport.height;
        if (currentHeight < keyboardBaselineHeight * 0.72) {
          mobileKeyboardVisible = true;
        } else if (mobileKeyboardVisible && currentHeight > keyboardBaselineHeight * 0.84) {
          mobileKeyboardVisible = false;
          finishTextEntry();
        }
      };
      visualViewport?.addEventListener('resize', handleKeyboardViewportChange);
      const finishTextEntry = () => {
        if (!activeDemoTextField) return;
        activeDemoTextField.value = demoDescriptionEditor.value;
        activeDemoTextField.dispatchEvent(new Event('input', { bubbles: true }));
        demoDescriptionEditor.blur();
        demoDescriptionModal.hide();
      };
      document.getElementById('demoRotatePromptCancel')?.addEventListener('click', () => {
        waitingForPortrait = false;
      });
      document.addEventListener('pointerdown', (event) => {
        const field = event.target.closest?.(textFieldSelector);
        if (!field || field === demoDescriptionEditor || field.disabled) return;
        event.preventDefault();
        event.stopPropagation();
        openTextEditor(field);
      }, true);
      document.addEventListener('focusin', (event) => {
        const field = event.target.closest?.(textFieldSelector);
        if (!field || field === demoDescriptionEditor || field.disabled || field === activeDemoTextField) return;
        field.blur();
        openTextEditor(field);
      }, true);
      demoDescriptionModalEl.addEventListener('shown.bs.modal', () => {
        keyboardBaselineHeight = window.visualViewport?.height || window.innerHeight;
        mobileKeyboardVisible = false;
        demoDescriptionEditor.focus();
      });
      demoDescriptionEditor.addEventListener('input', () => {
        if (!activeDemoTextField) return;
        activeDemoTextField.value = demoDescriptionEditor.value;
        activeDemoTextField.dispatchEvent(new Event('input', { bubbles: true }));
      });
      demoDescriptionEditor.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.isComposing && activeDemoTextField?.tagName !== 'TEXTAREA') {
          event.preventDefault();
          finishTextEntry();
        }
      });
      demoDescriptionModalEl.addEventListener('hidden.bs.modal', resumeParentModal);
      document.getElementById('demoDescriptionModalApply')?.addEventListener('click', finishTextEntry);
    }

    const demoTargetSelect = document.getElementById('demoTargetSelect');
    if (demoTargetSelect) {
      demoTargetSelect.addEventListener('change', () => this.handleDemoTargetChange());
    }

    const saveDemoForm = document.getElementById('saveDemoForm');
    if (saveDemoForm) {
      saveDemoForm.addEventListener('submit', (e) => this.handleSaveCustomDemo(e));
    }

    const deleteDemoBtn = document.getElementById('deleteDemoBtn');
    if (deleteDemoBtn) {
      deleteDemoBtn.addEventListener('click', () => this.handleDeleteDemo());
    }

    // Invitados
    const guestBookingForm = document.getElementById('guestBookingForm');
    if (guestBookingForm) {
      guestBookingForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleRequestGuestSession();
      });
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
    const userAndAdminTabs = document.querySelectorAll('.role-user-and-admin');
    const guestSections = document.querySelectorAll('.role-guest-only');

    if (role === 'ADMINISTRADOR') {
      adminTabs.forEach((el) => {
        el.classList.remove('d-none');
        el.removeAttribute('hidden');
      });
      userAndAdminTabs.forEach((el) => {
        el.classList.remove('d-none');
        el.removeAttribute('hidden');
      });
      userTabs.forEach((el) => {
        el.classList.add('d-none');
        el.setAttribute('hidden', '');
      });
      guestSections.forEach((el) => {
        el.classList.add('d-none');
        el.setAttribute('hidden', '');
      });
      this.switchSubtab('dashboard');
    } else if (role === 'USUARIO') {
      adminTabs.forEach((el) => {
        el.classList.add('d-none');
        el.setAttribute('hidden', '');
      });
      userTabs.forEach((el) => {
        el.classList.remove('d-none');
        el.removeAttribute('hidden');
      });
      userAndAdminTabs.forEach((el) => {
        el.classList.remove('d-none');
        el.removeAttribute('hidden');
      });
      guestSections.forEach((el) => {
        el.classList.add('d-none');
        el.setAttribute('hidden', '');
      });
      this.switchSubtab('myVehicles');
      this.loadMyVehicles();
    } else {
      // INVITADO
      adminTabs.forEach((el) => {
        el.classList.add('d-none');
        el.setAttribute('hidden', '');
      });
      userTabs.forEach((el) => {
        el.classList.add('d-none');
        el.setAttribute('hidden', '');
      });
      userAndAdminTabs.forEach((el) => {
        el.classList.add('d-none');
        el.setAttribute('hidden', '');
      });
      guestSections.forEach((el) => {
        el.classList.remove('d-none');
        el.removeAttribute('hidden');
        if (el.dataset && el.dataset.adminSubtab === 'guestDemo') {
          el.textContent = '🎯 Catálogo Demo (1 Unidad)';
        }
      });
      this.switchSubtab('guestDemo');
      this.loadGuestCatalog();
    }
    this.onRoleChange(role);
  }

  switchSubtab(subtabId) {
    const role = (this.currentUser?.rol || 'INVITADO').toUpperCase();
    if (role === 'INVITADO' && subtabId !== 'guestDemo') {
      subtabId = 'guestDemo';
    } else if (role === 'USUARIO' && (subtabId !== 'myVehicles' && subtabId !== 'demoEditor')) {
      subtabId = 'myVehicles';
    }

    this.activeSubtab = subtabId;
    document.querySelectorAll('[data-admin-subtab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.adminSubtab === subtabId);
    });

    document.querySelectorAll('.admin-subtab-pane').forEach((pane) => {
      pane.classList.add('d-none');
      pane.setAttribute('hidden', '');
    });

    const activePane = document.getElementById(`subtab-${subtabId}`);
    if (activePane) {
      activePane.classList.remove('d-none');
      activePane.removeAttribute('hidden');
    }

    // Cargar datos según la sección
    if (subtabId === 'dashboard') this.loadDashboardMetrics();
    else if (subtabId === 'models') this.loadModels();
    else if (subtabId === 'units') {
      this.loadModels();
      this.loadUnits();
    }
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
      if (!res?.access_token || !res?.user) {
        const error = new Error('Usuario o contraseña incorrectos. Revisa tus datos e inténtalo de nuevo.');
        error.status = 401;
        throw error;
      }
      setAuthToken(res.access_token);
      sessionStorage.setItem('iot_token', res.access_token);
      localStorage.setItem('iot_token', res.access_token);
      this.setCurrentUser(res.user);

      // Cerrar modal bootstrap si existe
      const modalEl = document.getElementById('loginModal');
      if (modalEl && window.bootstrap) {
        const modal = window.bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }
    } catch (err) {
      const authRejected = [400, 401, 403, 422].includes(err.status);
      const message = authRejected
        ? 'Usuario o contraseña incorrectos. Revisa tus datos e inténtalo de nuevo.'
        : (err.message || 'No se pudo iniciar sesión. Inténtalo de nuevo.');
      if (alertBox) {
        alertBox.textContent = message;
        alertBox.classList.remove('d-none');
      }
      const modalEl = document.getElementById('loginModal');
      if (modalEl && !modalEl.classList.contains('show') && window.bootstrap) {
        window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
      }
      if (alertBox) window.setTimeout(() => alertBox.focus({ preventScroll: true }), 120);
      this.notify(message, 'error', 6500);
    }
  }

  async handleLogout() {
    try {
      await this.api.logout();
    } catch (e) {
      // Ignorar si ya expiró
    }
    setAuthToken(null);
    sessionStorage.removeItem('iot_token');
    localStorage.removeItem('iot_token');
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
      document.getElementById('kpiClients').textContent = clientsData.filter((client) => client.activo).length;
    } catch (err) {
      console.error('Error cargando KPIs:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Catálogo de Modelos
  // ---------------------------------------------------------------------------
  updateUnitModelOptions(models) {
    const select = document.getElementById('unitModelSelect');
    if (!select) return;

    const previousValue = select.value;
    const activeModels = (models || []).filter((model) => model.activo);
    select.replaceChildren();

    if (!activeModels.length) {
      const option = new Option('Primero registra un modelo activo', '');
      option.disabled = true;
      option.selected = true;
      select.add(option);
      select.disabled = true;
      return;
    }

    select.disabled = false;
    activeModels.forEach((model) => {
      select.add(new Option(`${model.nombre} (#${model.id_modelo})`, model.id_modelo));
    });
    if (activeModels.some((model) => String(model.id_modelo) === previousValue)) {
      select.value = previousValue;
    }
  }

  async loadModels() {
    const tableBody = document.getElementById('modelsTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-3">Cargando catálogo...</td></tr>';

    try {
      const models = await this.api.getModels();
      this.modelsById = new Map((models || []).map((model) => [String(model.id_modelo), model]));
      this.updateUnitModelOptions(models);
      if (!models.length) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-3 text-muted">Sin modelos registrados.</td></tr>';
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
          <td class="text-nowrap">
            <button type="button" class="btn btn-sm btn-outline-info me-1" data-model-edit="${m.id_modelo}">Editar</button>
          </td>
        </tr>
      `).join('');
      tableBody.querySelectorAll('[data-model-edit]').forEach((button) => {
        button.addEventListener('click', () => this.openEditModel(button.dataset.modelEdit));
      });
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-3">Error: ${err.message}</td></tr>`;
    }
  }

  openEditModel(modelId) {
    const model = this.modelsById?.get(String(modelId));
    if (!model) return;
    document.getElementById('editModelId').value = model.id_modelo;
    document.getElementById('editModelName').value = model.nombre || '';
    document.getElementById('editModelCode').textContent = model.codigo_modelo || '—';
    document.getElementById('editModelCategory').value = model.categoria || 'Montacargas';
    document.getElementById('editModelDesc').value = model.descripcion || '';
    document.getElementById('editModelActive').checked = Boolean(model.activo);
    window.bootstrap.Modal.getOrCreateInstance(document.getElementById('editModelModal')).show();
  }

  async handleEditModel(e) {
    e.preventDefault();
    const modelId = document.getElementById('editModelId').value;
    const model = this.modelsById?.get(String(modelId));
    if (!model) return;
    try {
      await this.api.updateModel(modelId, {
        nombre: document.getElementById('editModelName').value.trim(),
        descripcion: document.getElementById('editModelDesc').value.trim(),
        categoria: document.getElementById('editModelCategory').value,
        activo: document.getElementById('editModelActive').checked,
      });
      window.bootstrap.Modal.getInstance(document.getElementById('editModelModal'))?.hide();
      this.notify(`Modelo “${model.nombre}” actualizado.`, 'success');
      await this.loadModels();
      this.loadDashboardMetrics();
    } catch (err) {
      this.notify(`No se pudo actualizar el modelo: ${err.message}`, 'error', 5000);
    }
  }

  async handleCreateModel(e) {
    e.preventDefault();
    const submitButton = e.submitter || e.target.querySelector('[type="submit"]');
    if (submitButton?.disabled) return;
    const nameInput = document.getElementById('modelName');
    const categoryInput = document.getElementById('modelCategory');
    const descriptionInput = document.getElementById('modelDesc');
    if (!nameInput || !categoryInput || !descriptionInput) {
      this.notify('No se pudo cargar el formulario del modelo. Recarga la página e inténtalo de nuevo.', 'error', 5000);
      return;
    }
    if (submitButton) submitButton.disabled = true;
    const nombre = nameInput.value.trim();
    const categoria = categoryInput.value;
    const descripcion = descriptionInput.value.trim();

    try {
      const existingModels = await this.api.getModels();
      const usedCodes = new Set((existingModels || []).map((model) => String(model.codigo_modelo || '').toUpperCase()));
      const slug = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 43) || 'MODELO';
      const baseCode = `MOD_${slug}`;
      let codigo_modelo = baseCode;
      let suffix = 2;
      while (usedCodes.has(codigo_modelo.toUpperCase())) {
        const suffixText = `_${suffix++}`;
        codigo_modelo = `${baseCode.slice(0, 50 - suffixText.length)}${suffixText}`;
      }
      await this.api.createModel({ nombre, codigo_modelo, categoria, descripcion });
      e.target.reset();
      window.bootstrap.Modal.getInstance(document.getElementById('newModelModal'))?.hide();
      await this.loadModels();
      this.loadDashboardMetrics();
      this.notify(`Modelo “${nombre}” guardado correctamente.`, 'success', 5000);
    } catch (err) {
      this.notify(`Error al crear modelo: ${err.message}`, 'error', 4500);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Inventario de Unidades Físicas
  // ---------------------------------------------------------------------------
  async loadUnits() {
    const tableBody = document.getElementById('unitsTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-3 text-muted">Cargando unidades...</td></tr>';

    try {
      const units = await this.api.getUnits();
      this.currentUnits = units;
      if (!units.length) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-3 text-muted">Sin unidades registradas. Pulsa [+ Nueva Unidad Física] para dar de alta una.</td></tr>';
        return;
      }

      tableBody.innerHTML = units.map((u) => {
        const stateColor = u.estado_comercial === 'vendido' ? 'primary' :
          u.estado_comercial === 'exhibicion' ? 'warning' :
          u.estado_comercial === 'disponible' ? 'success' : 'secondary';

        const safeName = (u.nombre || '').replace(/'/g, "\\'");

        return `
          <tr>
            <td><span class="badge bg-dark border">#${u.id_vehiculo}</span></td>
            <td><strong>${u.nombre}</strong><br><small class="text-muted">${u.nombre_modelo || 'Sin modelo'}</small></td>
            <td><code>${u.numero_serie || 'S/N'}</code></td>
            <td><span class="badge bg-${stateColor} text-uppercase">${u.estado_comercial}</span></td>
            <td>${u.nombre_propietario ? `<b>${u.nombre_propietario}</b>` : '<span class="text-muted">Empresa</span>'}</td>
            <td>
              <div class="d-flex gap-1 flex-wrap">
                <button class="btn btn-sm btn-outline-cyan" onclick="window.adminModule.openAssignModal(${u.id_vehiculo}, '${safeName}', ${u.propietario_id || 'null'}, '${u.estado_comercial}')" title="Editar nombre y asignación">
                  ✏️ Editar
                </button>
                <button class="btn btn-sm btn-outline-warning" onclick="window.adminModule.openVehicleCommandsModal(${u.id_vehiculo}, '${safeName}')" title="Configurar o quitar movimientos y comandos">
                  🎮 Comandos
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-3">Error: ${err.message}</td></tr>`;
    }
  }

  async openAssignModal(vehicleId, unitName, currentOwnerId, currentStatus) {
    document.getElementById('assignUnitId').value = vehicleId;
    const nameInput = document.getElementById('assignUnitNameInput');
    if (nameInput) nameInput.value = unitName;
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
    const nameInput = document.getElementById('assignUnitNameInput');
    const newName = nameInput ? nameInput.value.trim() : '';
    const clientVal = document.getElementById('assignClientSelect').value;
    const statusVal = document.getElementById('assignStatus').value;
    const propietario_id = clientVal ? Number(clientVal) : null;
    const unit = this.currentUnits?.find((u) => String(u.id_vehiculo) === String(vId));

    try {
      if (newName && unit && newName !== unit.nombre) {
        await this.api.updateVehicle(vId, {
          nombre: newName,
          modelo: unit.nombre_modelo || unit.modelo || 'Montacargas IoT',
          descripcion: unit.descripcion || 'Unidad física',
          microcontrolador: unit.microcontrolador || 'ESP8266',
          activo: true,
        }).catch((err) => console.warn('Error al actualizar nombre del vehículo:', err));
      }
      await this.api.assignUnit(vId, { propietario_id, estado_comercial: statusVal });
      this.notify('¡Unidad comercial actualizada y asignada con éxito!', 'success');
      this.loadUnits();
      this.loadDashboardMetrics();
      if (window.bootstrap) {
        const modal = window.bootstrap.Modal.getInstance(document.getElementById('assignModal'));
        if (modal) modal.hide();
      }
    } catch (err) {
      this.notify(`Error al guardar cambios: ${err.message}`, 'error', 4500);
    }
  }

  // ---------------------------------------------------------------------------
  // Gestión de Movimientos y Comandos por Unidad (Administrador)
  // ---------------------------------------------------------------------------
  getDisabledCommandsForVehicle(vehicleId) {
    try {
      const raw = localStorage.getItem(`vehicle_disabled_commands_${vehicleId}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  openVehicleCommandsModal(vehicleId, unitName) {
    const unitIdInput = document.getElementById('vehicleCommandsUnitId');
    const subtitle = document.getElementById('vehicleCommandsSubtitle');
    const listContainer = document.getElementById('vehicleCommandsList');
    if (!unitIdInput || !listContainer) return;

    unitIdInput.value = vehicleId;
    if (subtitle) subtitle.textContent = `Unidad #${vehicleId} · ${unitName || 'Vehículo'}`;

    const disabled = this.getDisabledCommandsForVehicle(vehicleId);

    const commandsDef = [
      { id: 1, name: 'AVANZAR', icon: '⬆️', desc: 'Tracción frontal', category: 'Tracción' },
      { id: 2, name: 'RETROCEDER', icon: '⬇️', desc: 'Tracción reversa', category: 'Tracción' },
      { id: 3, name: 'GIRAR_IZQUIERDA', icon: '⬅️', desc: 'Dirección izquierda', category: 'Dirección' },
      { id: 4, name: 'GIRAR_DERECHA', icon: '➡️', desc: 'Dirección derecha', category: 'Dirección' },
      { id: 5, name: 'SUBIR_HORQUILLAS', icon: '🏗️', desc: 'Elevación del mástil', category: 'Horquillas' },
      { id: 6, name: 'BAJAR_HORQUILLAS', icon: '📦', desc: 'Descenso de horquillas', category: 'Horquillas' },
      { id: 8, name: 'LUCES', icon: '💡', desc: 'Faros delanteros LED', category: 'Accesorios' },
      { id: 11, name: 'SONIDO', icon: '🔊', desc: 'Alarma sonora / claxon', category: 'Accesorios' },
      { id: 7, name: 'CAMBIAR_VELOCIDAD', icon: '⚡', desc: 'Potencia y torque', category: 'Ajuste' },
      { id: 12, name: 'ACTIVAR_CRUCERO', icon: '⏱️', desc: 'Control de crucero automático', category: 'Ajuste' },
    ];

    listContainer.innerHTML = commandsDef.map((cmd) => {
      const isEnabled = !disabled.includes(cmd.name);
      return `
        <div class="d-flex justify-content-between align-items-center py-2 px-2 border-bottom border-secondary command-toggle-row">
          <div>
            <span class="me-2">${cmd.icon}</span>
            <strong class="text-white">${cmd.name.replace(/_/g, ' ')}</strong>
            <span class="badge bg-secondary ms-1 small">${cmd.category}</span>
            <div class="small text-muted ps-4">${cmd.desc}</div>
          </div>
          <div class="form-check form-switch ms-3">
            <input class="form-check-input cmd-switch" type="checkbox" role="switch"
              id="cmd_switch_${cmd.name}" data-cmd="${cmd.name}" ${isEnabled ? 'checked' : ''}>
            <label class="form-check-label small" for="cmd_switch_${cmd.name}">
              ${isEnabled ? '<span class="text-success fw-bold">Habilitado</span>' : '<span class="text-danger fw-bold">Quitado</span>'}
            </label>
          </div>
        </div>
      `;
    }).join('');

    listContainer.querySelectorAll('.cmd-switch').forEach((sw) => {
      sw.addEventListener('change', (e) => {
        const label = e.target.nextElementSibling;
        if (label) {
          label.innerHTML = e.target.checked
            ? '<span class="text-success fw-bold">Habilitado</span>'
            : '<span class="text-danger fw-bold">Quitado</span>';
        }
      });
    });

    if (window.bootstrap) {
      const modalEl = document.getElementById('vehicleCommandsModal');
      const modal = new window.bootstrap.Modal(modalEl);
      modal.show();
    }
  }

  toggleAllCommands(enable) {
    const listContainer = document.getElementById('vehicleCommandsList');
    if (!listContainer) return;
    listContainer.querySelectorAll('.cmd-switch').forEach((sw) => {
      sw.checked = enable;
      const label = sw.nextElementSibling;
      if (label) {
        label.innerHTML = enable
          ? '<span class="text-success fw-bold">Habilitado</span>'
          : '<span class="text-danger fw-bold">Quitado</span>';
      }
    });
  }

  saveVehicleCommands() {
    const unitId = document.getElementById('vehicleCommandsUnitId')?.value;
    if (!unitId) return;

    const listContainer = document.getElementById('vehicleCommandsList');
    const switches = listContainer ? listContainer.querySelectorAll('.cmd-switch') : [];
    const disabledList = [];
    const enabledList = [];

    switches.forEach((sw) => {
      const cmdName = sw.dataset.cmd;
      if (sw.checked) {
        enabledList.push(cmdName);
      } else {
        disabledList.push(cmdName);
      }
    });

    localStorage.setItem(`vehicle_disabled_commands_${unitId}`, JSON.stringify(disabledList));

    const detalle = disabledList.length
      ? `Comandos deshabilitados en control: ${disabledList.join(', ')}`
      : 'Todos los movimientos habilitados en control';
    this.addAuditEntry('CONFIGURAR_MOVIMIENTOS', `vehiculos/${unitId}`, detalle);

    this.notify(`¡Permisos de movimientos actualizados para el Vehículo #${unitId}!`, 'success');

    window.dispatchEvent(new CustomEvent('vehicle-commands-updated', {
      detail: { vehicleId: unitId, disabled: disabledList }
    }));

    if (window.bootstrap) {
      const modalEl = document.getElementById('vehicleCommandsModal');
      const modal = window.bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    }
  }

  addAuditEntry(accion, recurso, detalle) {
    try {
      const raw = localStorage.getItem('local_audit_entries') || '[]';
      const list = JSON.parse(raw);
      list.unshift({
        id_auditoria: Date.now(),
        fecha_hora: new Date().toISOString(),
        username_actor: this.currentUser?.username || 'admin',
        rol_actor: this.currentUser?.rol || 'ADMINISTRADOR',
        accion,
        recurso,
        resultado: 'EXITO',
        detalle,
      });
      localStorage.setItem('local_audit_entries', JSON.stringify(list.slice(0, 50)));
    } catch {}
  }

  getLocalAuditEntries() {
    try {
      const raw = localStorage.getItem('local_audit_entries') || '[]';
      return JSON.parse(raw);
    } catch {
      return [];
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
      this.notify('Unidad física registrada con éxito en Amazon RDS.', 'success');
      this.loadUnits();
      this.loadDashboardMetrics();
      e.target.reset();
    } catch (err) {
      this.notify(`Error al crear unidad: ${err.message}`, 'error', 4500);
    }
  }

  // ---------------------------------------------------------------------------
  // Clientes
  // ---------------------------------------------------------------------------
  async loadClients() {
    const tableBody = document.getElementById('clientsTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-3 text-muted">Cargando clientes...</td></tr>';

    try {
      const clients = await this.api.getClients();
      this.clientsById = new Map((clients || []).map((client) => [String(client.id_usuario), client]));
      if (!clients.length) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-3 text-muted">Sin clientes registrados.</td></tr>';
        return;
      }
      tableBody.innerHTML = clients.map((c) => `
        <tr>
          <td><span class="badge bg-secondary">#${c.id_usuario}</span></td>
          <td><strong>${c.nombre_completo}</strong></td>
          <td><code>@${c.username}</code></td>
          <td>${c.email}</td>
          <td><span class="badge bg-info text-dark">${c.total_unidades} vehículo(s)</span></td>
          <td><span class="badge ${c.activo ? 'bg-success' : 'bg-danger'}">${c.activo ? 'ACTIVO' : 'INACTIVO'}</span></td>
          <td class="text-nowrap">
            <button type="button" class="btn btn-sm btn-outline-info me-1" data-client-edit="${c.id_usuario}">Editar</button>
            <button type="button" class="btn btn-sm ${c.activo ? 'btn-outline-warning' : 'btn-outline-success'}" data-client-toggle="${c.id_usuario}">${c.activo ? 'Retirar' : 'Reactivar'}</button>
          </td>
        </tr>
      `).join('');
      tableBody.querySelectorAll('[data-client-edit]').forEach((button) => {
        button.addEventListener('click', () => this.openEditClient(button.dataset.clientEdit));
      });
      tableBody.querySelectorAll('[data-client-toggle]').forEach((button) => {
        button.addEventListener('click', () => this.toggleClientActive(button.dataset.clientToggle));
      });
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-3">Error: ${err.message}</td></tr>`;
    }
  }

  openEditClient(clientId) {
    const client = this.clientsById?.get(String(clientId));
    if (!client) return;
    document.getElementById('editClientId').value = client.id_usuario;
    document.getElementById('editClientName').value = client.nombre_completo || '';
    document.getElementById('editClientUsername').textContent = `@${client.username || ''}`;
    document.getElementById('editClientEmail').value = client.email || '';
    document.getElementById('editClientActive').checked = Boolean(client.activo);
    window.bootstrap.Modal.getOrCreateInstance(document.getElementById('editClientModal')).show();
  }

  async handleEditClient(e) {
    e.preventDefault();
    const clientId = document.getElementById('editClientId').value;
    const client = this.clientsById?.get(String(clientId));
    if (!client) return;
    try {
      await this.api.updateClient(clientId, {
        nombre_completo: document.getElementById('editClientName').value.trim(),
        email: document.getElementById('editClientEmail').value.trim(),
        activo: document.getElementById('editClientActive').checked,
      });
      window.bootstrap.Modal.getInstance(document.getElementById('editClientModal'))?.hide();
      this.notify(`Cliente “${client.username}” actualizado.`, 'success');
      await this.loadClients();
      this.loadDashboardMetrics();
    } catch (err) {
      this.notify(`No se pudo actualizar el cliente: ${err.message}`, 'error', 5000);
    }
  }

  async toggleClientActive(clientId) {
    const client = this.clientsById?.get(String(clientId));
    if (!client) return;
    const nextActive = !client.activo;
    const action = nextActive ? 'reactivar' : 'retirar';
    const unitCount = Number(client.total_unidades || 0);
    const linkedUnits = unitCount ? ` Sus ${unitCount} unidad(es) vinculada(s) y registros se conservarán.` : '';
    if (!window.confirm(`¿Quieres ${action} la cuenta de “${client.username}”?${linkedUnits}`)) return;

    try {
      await this.api.updateClient(clientId, {
        nombre_completo: client.nombre_completo,
        email: client.email,
        activo: nextActive,
      });
      this.notify(nextActive ? 'Cuenta de cliente reactivada.' : 'Cuenta retirada; se conservaron sus unidades y registros.', 'success');
      await this.loadClients();
      this.loadDashboardMetrics();
    } catch (err) {
      this.notify(`No se pudo ${action} la cuenta: ${err.message}`, 'error', 5000);
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
      this.notify('Cliente comprador registrado con éxito.', 'success');
      this.loadClients();
      this.loadDashboardMetrics();
      e.target.reset();
    } catch (err) {
      this.notify(`Error al registrar cliente: ${err.message}`, 'error', 4500);
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
      const serverLogs = await this.api.getAuditLogs(50).catch(() => []);
      const localLogs = this.getLocalAuditEntries();
      const logs = [...localLogs, ...(Array.isArray(serverLogs) ? serverLogs : [])];
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
    this.notify(`Vehículo #${vId} seleccionado para operar.`, 'info');

    // Cambiar a pestaña Control
    const controlTab = document.getElementById('controlTab');
    if (controlTab) controlTab.click();
  }

  // ---------------------------------------------------------------------------
  // Editor de DEMOS (Creación y Modificación de Secuencias de Movimientos)
  // ---------------------------------------------------------------------------
  async loadDemoEditor() {
    this.showDemoEditorStage(1);
    this.demoSteps = [];
    this.pendingDeletedMovementIds = [];
    const container = document.getElementById('demoStepsContainer');
    if (container) container.innerHTML = '';
    this.addDemoStepRow({ isNew: true }); // Paso inicial

    // Llenar selector de unidades de destino según el rol
    const vehicleSelect = document.getElementById('demoVehicleSelect');
    if (vehicleSelect) {
      vehicleSelect.innerHTML = '<option value="">Cargando unidades disponibles...</option>';
      const role = (this.currentUser?.rol || 'INVITADO').toUpperCase();
      try {
        let vehicles = [];
        if (role === 'ADMINISTRADOR') {
          // El Administrador tiene acceso a todas las unidades de la empresa
          vehicles = await this.api.getUnits();
        } else {
          // El Usuario tiene acceso a sus unidades propias asignadas
          vehicles = await this.api.getMyVehicles();
        }

        if (!vehicles || !vehicles.length) {
          vehicleSelect.innerHTML = '<option value="">Sin unidades asignadas o disponibles</option>';
        } else {
          const currentVId = String(this.api.getVehicleId() || vehicles[0].id_vehiculo);
          vehicleSelect.innerHTML = vehicles.map((v) => {
            const id = v.id_vehiculo;
            const name = v.nombre || `Vehículo #${id}`;
            const model = v.nombre_modelo || v.modelo || 'IoT';
            const owner = v.nombre_propietario ? ` [Propietario: ${v.nombre_propietario}]` : (role === 'ADMINISTRADOR' ? ' [Empresa]' : '');
            const selected = String(id) === currentVId ? 'selected' : '';
            return `<option value="${id}" ${selected}>#${id} - ${name} (${model})${owner}</option>`;
          }).join('');
        }
      } catch (err) {
        console.error('Error cargando vehículos para demo:', err);
        const fallbackId = this.api.getVehicleId() || '1';
        vehicleSelect.innerHTML = `<option value="${fallbackId}">#${fallbackId} - Vehículo Activo</option>`;
      }
    }

    this.updateDemoWizardVehicleNext();

    // Cargar demos asociadas al vehículo activo
    await this.loadDemosForSelectedVehicle();
  }

  updateDemoWizardVehicleNext() {
    const vehicleSelect = document.getElementById('demoVehicleSelect');
    const nextButton = document.getElementById('demoWizardNextDetails');
    if (nextButton) nextButton.disabled = !vehicleSelect?.value;
  }

  showDemoEditorStage(stage) {
    const nextStage = Math.max(1, Math.min(3, Number(stage) || 1));
    this.demoEditorStage = nextStage;
    document.querySelectorAll('[data-demo-wizard-stage]').forEach((panel) => {
      const active = Number(panel.dataset.demoWizardStage) === nextStage;
      panel.classList.toggle('d-none', !active);
      panel.setAttribute('aria-hidden', String(!active));
      panel.querySelectorAll('[required]').forEach((field) => {
        field.dataset.wizardRequired = 'true';
      });
      panel.querySelectorAll('[data-wizard-required="true"]').forEach((field) => {
        field.required = active;
      });
    });
    document.querySelectorAll('[data-demo-wizard-progress]').forEach((item) => {
      const itemStage = Number(item.dataset.demoWizardProgress);
      item.classList.toggle('is-current', itemStage === nextStage);
      item.classList.toggle('is-complete', itemStage < nextStage);
    });
    this.updateDemoWizardVehicleNext();
  }

  continueDemoWizardToDetails() {
    const vehicleSelect = document.getElementById('demoVehicleSelect');
    if (!vehicleSelect?.value) {
      vehicleSelect?.reportValidity();
      return;
    }
    this.showDemoEditorStage(2);
  }

  continueDemoWizardToSteps() {
    const vehicleSelect = document.getElementById('demoVehicleSelect');
    const targetSelect = document.getElementById('demoTargetSelect');
    const nameInput = document.getElementById('demoCustomName');
    if (!vehicleSelect?.value) {
      vehicleSelect?.reportValidity();
      return;
    }
    if (!targetSelect?.value) {
      targetSelect?.reportValidity();
      return;
    }
    if (!nameInput?.value.trim()) {
      this.notify('Escribe el nombre de la demo para continuar.', 'warning');
      nameInput?.click();
      return;
    }
    this.showDemoEditorStage(3);
  }

  async loadDemosForSelectedVehicle() {
    const vSelect = document.getElementById('demoVehicleSelect');
    const targetSelect = document.getElementById('demoTargetSelect');
    if (!vSelect || !targetSelect) return;

    const vId = vSelect.value || this.api.getVehicleId();
    targetSelect.innerHTML = '<option value="new">➕ [Crear Nueva DEMO]</option><option disabled>Cargando demos existentes...</option>';

    try {
      const demos = await this.api.getDemos(vId);
      this.vehicleDemosMap = this.vehicleDemosMap || {};
      this.vehicleDemosMap[vId] = demos || [];

      targetSelect.innerHTML = '<option value="new">➕ [Crear Nueva DEMO]</option>';
      if (demos && demos.length) {
        demos.forEach((d) => {
          const opt = document.createElement('option');
          opt.value = d.id_demo || d.id;
          opt.textContent = `📋 #${d.id_demo || d.id} - ${d.nombre}`;
          targetSelect.appendChild(opt);
        });
      }
    } catch (err) {
      console.warn('Error al consultar demos existentes del vehículo:', err);
      targetSelect.innerHTML = '<option value="new">➕ [Crear Nueva DEMO]</option>';
    }

    await this.handleDemoTargetChange();
  }

  async handleDemoTargetChange() {
    const targetSelect = document.getElementById('demoTargetSelect');
    const vSelect = document.getElementById('demoVehicleSelect');
    const nameInput = document.getElementById('demoCustomName');
    const descInput = document.getElementById('demoCustomDesc');
    const submitBtn = document.querySelector('#saveDemoForm button[type="submit"]');
    const deleteBtn = document.getElementById('deleteDemoBtn');
    const container = document.getElementById('demoStepsContainer');

    if (!targetSelect || !container) return;
    const mode = targetSelect.value;
    const vId = vSelect ? vSelect.value : this.api.getVehicleId();

    this.pendingDeletedMovementIds = [];
    const modeBadge = document.getElementById('demoModeBadge');

    if (mode === 'new') {
      if (modeBadge) {
        modeBadge.textContent = 'NUEVA DEMO';
        modeBadge.className = 'badge bg-success text-dark fw-bold demo-mode-badge';
      }
      if (deleteBtn) deleteBtn.classList.add('d-none');
      if (nameInput) {
        nameInput.value = '';
      }
      if (descInput) {
        descInput.value = '';
      }
      if (submitBtn) submitBtn.innerHTML = '💾 Guardar DEMO';
      container.innerHTML = '';
      this.addDemoStepRow({ isNew: true });
    } else {
      // Modo: Demo existente para renombrar, agregar/quitar movimientos o eliminar
      const demoId = Number(mode);
      if (modeBadge) {
        modeBadge.textContent = `EDITANDO DEMO #${demoId}`;
        modeBadge.className = 'badge bg-info text-dark fw-bold demo-mode-badge';
      }
      if (deleteBtn) deleteBtn.classList.remove('d-none');
      const demos = (this.vehicleDemosMap && this.vehicleDemosMap[vId]) || [];
      const currentDemo = demos.find((d) => (d.id_demo || d.id) === demoId);

      if (currentDemo) {
        if (nameInput) nameInput.value = currentDemo.nombre;
        if (descInput) descInput.value = currentDemo.descripcion || '';
      }
      if (submitBtn) submitBtn.innerHTML = `💾 Guardar Cambios en DEMO #${demoId}`;

      container.innerHTML = '<div class="text-center py-2 text-muted small"><span class="spinner-border spinner-border-sm me-1"></span>Cargando movimientos de la DEMO...</div>';

      try {
        const movements = await this.api.getDemoMovements(vId, demoId);
        container.innerHTML = '';
        if (movements && movements.length) {
          movements.forEach((m) => {
            this.addDemoStepRow({
              movementId: m.id_demo_movimiento,
              commandId: m.id_comando,
              duration: m.duracion_ms,
              pause: m.pausa_ms,
              isNew: false,
            });
          });
        } else {
          this.addDemoStepRow({ isNew: true });
        }
      } catch (err) {
        container.innerHTML = '';
        this.addDemoStepRow({ isNew: true });
        console.warn('Error cargando movimientos de demo:', err);
      }
    }
  }

  async handleDeleteDemo() {
    const vSelect = document.getElementById('demoVehicleSelect');
    const targetSelect = document.getElementById('demoTargetSelect');
    const vId = (vSelect && vSelect.value) ? vSelect.value : this.api.getVehicleId();
    const demoId = targetSelect ? targetSelect.value : null;

    if (!demoId || demoId === 'new') {
      this.notify('Por favor selecciona una DEMO existente para eliminar.', 'warning');
      return;
    }

    const confirmDelete = window.confirm(`¿Estás segura de eliminar la DEMO #${demoId} por completo de Amazon RDS?\n\nEsta operación ejecutará el procedimiento sp_eliminar_demo y removerá la rutina del catálogo.`);
    if (!confirmDelete) return;

    try {
      await this.api.deleteDemo(vId, demoId);
      this.notify(`¡DEMO #${demoId} eliminada exitosamente de Amazon RDS!`, 'success');
      await this.loadDemoEditor();
    } catch (err) {
      this.notify(`Error al eliminar la DEMO: ${err.message}`, 'error', 4500);
    }
  }

  addDemoStepRow(options = {}) {
    const container = document.getElementById('demoStepsContainer');
    if (!container) return;

    // Quitar estado vacío si existe
    const emptyState = container.querySelector('.demo-empty-state');
    if (emptyState) emptyState.remove();

    const stepIndex = container.querySelectorAll('.demo-step-row').length + 1;
    const movementId = options.movementId || '';
    const commandId = options.commandId || 1;
    const duration = options.duration !== undefined ? options.duration : 1500;
    const pause = options.pause !== undefined ? options.pause : 300;
    const isNew = options.isNew !== undefined ? options.isNew : !movementId;

    const commandsList = [
      { id: 1, name: '⬆ AVANZAR', group: 'drive' },
      { id: 2, name: '⬇ RETROCEDER', group: 'drive' },
      { id: 3, name: '⬅ GIRAR IZQUIERDA', group: 'steer' },
      { id: 4, name: '➡ GIRAR DERECHA', group: 'steer' },
      { id: 5, name: '▲ SUBIR HORQUILLAS', group: 'forks' },
      { id: 6, name: '▼ BAJAR HORQUILLAS', group: 'forks' },
      { id: 8, name: '💡 LUCES', group: 'signal' },
      { id: 11, name: '🔊 SONIDO', group: 'signal' },
      { id: 9, name: '🛑 DETENER', group: 'stop' },
    ];

    const currentCmd = commandsList.find((c) => Number(c.id) === Number(commandId)) || commandsList[0];

    const row = document.createElement('div');
    row.className = 'demo-step-row d-flex gap-2 align-items-center mb-2 p-2 bg-dark rounded border border-secondary';
    row.dataset.commandGroup = currentCmd.group;
    if (movementId) row.dataset.movementId = movementId;
    row.dataset.isNew = isNew ? 'true' : 'false';

    const optionsHtml = commandsList.map((c) =>
      `<option value="${c.id}" ${Number(c.id) === Number(commandId) ? 'selected' : ''}>${c.name}</option>`
    ).join('');

    const durSec = (duration / 1000).toFixed(1);
    const pauseSec = (pause / 1000).toFixed(1);

    row.innerHTML = `
      <span class="badge ${isNew ? 'bg-primary' : 'bg-secondary'} demo-step-badge">#${stepIndex}</span>
      <div class="btn-group btn-group-sm demo-step-reorder" role="group" aria-label="Reordenar">
        <button type="button" class="btn btn-outline-secondary demo-step-up-btn py-0 px-1" title="Subir orden">▲</button>
        <button type="button" class="btn btn-outline-secondary demo-step-down-btn py-0 px-1" title="Bajar orden">▼</button>
      </div>
      <select class="form-select form-select-sm step-command" required>
        ${optionsHtml}
      </select>
      <div class="input-group input-group-sm demo-input-duration" title="Duración del movimiento">
        <input type="number" class="form-control step-duration" value="${duration}" min="200" max="10000" step="100">
        <span class="input-group-text step-dur-label">ms <small class="text-cyan ms-1 step-dur-sec">(${durSec}s)</small></span>
      </div>
      <div class="input-group input-group-sm demo-input-pause" title="Pausa después del movimiento">
        <input type="number" class="form-control step-pause" value="${pause}" min="0" max="5000" step="100">
        <span class="input-group-text step-pause-label">pausa <small class="text-muted ms-1 step-pause-sec">(${pauseSec}s)</small></span>
      </div>
      <button type="button" class="btn btn-sm btn-outline-danger demo-step-remove-btn" title="Quitar movimiento">✕</button>
    `;

    const select = row.querySelector('.step-command');
    if (select) {
      select.addEventListener('change', (e) => {
        const chosen = commandsList.find((c) => Number(c.id) === Number(e.target.value));
        if (chosen) row.dataset.commandGroup = chosen.group;
        this.updateDemoStepsSummary();
      });
    }

    const upBtn = row.querySelector('.demo-step-up-btn');
    if (upBtn) {
      upBtn.addEventListener('click', () => {
        const prev = row.previousElementSibling;
        if (prev && prev.classList.contains('demo-step-row')) {
          container.insertBefore(row, prev);
          this.updateDemoStepsSummary();
        }
      });
    }

    const downBtn = row.querySelector('.demo-step-down-btn');
    if (downBtn) {
      downBtn.addEventListener('click', () => {
        const next = row.nextElementSibling;
        if (next && next.classList.contains('demo-step-row')) {
          container.insertBefore(next, row);
          this.updateDemoStepsSummary();
        }
      });
    }

    const removeBtn = row.querySelector('.demo-step-remove-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        if (movementId) {
          this.pendingDeletedMovementIds = this.pendingDeletedMovementIds || [];
          this.pendingDeletedMovementIds.push(movementId);
        }
        row.remove();
        this.updateDemoStepsSummary();
      });
    }

    row.querySelectorAll('.step-duration, .step-pause').forEach((input) => {
      input.addEventListener('input', () => this.updateDemoStepsSummary());
    });

    container.appendChild(row);
    this.updateDemoStepsSummary();
  }

  updateDemoStepsSummary() {
    const container = document.getElementById('demoStepsContainer');
    if (!container) return;
    const rows = container.querySelectorAll('.demo-step-row');

    if (!rows.length) {
      let emptyState = container.querySelector('.demo-empty-state');
      if (!emptyState) {
        container.innerHTML = `
          <div class="demo-empty-state text-center p-3 border border-secondary border-dashed rounded text-muted">
            <div class="small mb-2">⚠️ No hay movimientos en esta secuencia.</div>
            <button type="button" class="btn btn-sm btn-outline-cyan py-0 px-2" id="demoEmptyAddStepBtn">+ Agregar Primer Movimiento</button>
          </div>
        `;
        const addBtn = container.querySelector('#demoEmptyAddStepBtn');
        if (addBtn) addBtn.addEventListener('click', () => this.addDemoStepRow({ isNew: true }));
      }
      const totalBadge = document.getElementById('demoTotalTimeBadge');
      if (totalBadge) totalBadge.textContent = '⏱️ 0 pasos · 0.0s';
      const timelineBar = document.getElementById('demoTimelineBar');
      if (timelineBar) timelineBar.innerHTML = '';
      return;
    }

    let totalMs = 0;
    rows.forEach((r, idx) => {
      const badge = r.querySelector('.demo-step-badge');
      if (badge) badge.textContent = `#${idx + 1}`;
      const dur = Number(r.querySelector('.step-duration')?.value || 0);
      const pause = Number(r.querySelector('.step-pause')?.value || 0);
      totalMs += (dur + pause);

      const durSec = (dur / 1000).toFixed(1);
      const pauseSec = (pause / 1000).toFixed(1);
      const durSecEl = r.querySelector('.step-dur-sec');
      if (durSecEl) durSecEl.textContent = `(${durSec}s)`;
      const pauseSecEl = r.querySelector('.step-pause-sec');
      if (pauseSecEl) pauseSecEl.textContent = `(${pauseSec}s)`;

      const up = r.querySelector('.demo-step-up-btn');
      const down = r.querySelector('.demo-step-down-btn');
      if (up) up.disabled = (idx === 0);
      if (down) down.disabled = (idx === rows.length - 1);
    });

    const totalBadge = document.getElementById('demoTotalTimeBadge');
    if (totalBadge) {
      const sec = (totalMs / 1000).toFixed(1);
      totalBadge.textContent = `⏱️ ${rows.length} paso${rows.length === 1 ? '' : 's'} · ${sec}s`;
    }

    // Actualizar timeline visual proporcional
    const timelineBar = document.getElementById('demoTimelineBar');
    if (timelineBar) {
      timelineBar.innerHTML = '';
      if (totalMs > 0) {
        const groupColors = {
          drive: '#22e3ed',
          steer: '#00d2d3',
          forks: '#ff9f43',
          signal: '#feca57',
          stop: '#ff4757',
        };
        rows.forEach((r, idx) => {
          const dur = Number(r.querySelector('.step-duration')?.value || 0);
          const pause = Number(r.querySelector('.step-pause')?.value || 0);
          const stepTotal = dur + pause;
          const pct = Math.max(3, (stepTotal / totalMs) * 100);
          const grp = r.dataset.commandGroup || 'drive';
          const color = groupColors[grp] || '#22e3ed';

          const seg = document.createElement('div');
          seg.className = 'demo-timeline-segment';
          seg.style.width = `${pct}%`;
          seg.style.backgroundColor = color;
          seg.style.height = '100%';
          const cmdName = r.querySelector('.step-command option:checked')?.textContent || '';
          seg.title = `Paso #${idx + 1}: ${cmdName} (${(stepTotal / 1000).toFixed(1)}s)`;
          timelineBar.appendChild(seg);
        });
      }
    }
  }

  async handleSaveCustomDemo(e) {
    e.preventDefault();
    const nombre = document.getElementById('demoCustomName').value.trim();
    const descripcion = document.getElementById('demoCustomDesc').value.trim();
    const vSelect = document.getElementById('demoVehicleSelect');
    const vId = (vSelect && vSelect.value) ? vSelect.value : this.api.getVehicleId();
    const targetSelect = document.getElementById('demoTargetSelect');
    const targetMode = targetSelect ? targetSelect.value : 'new';

    if (!vId) {
      this.notify('Por favor selecciona la unidad física de destino para la DEMO.', 'warning');
      return;
    }

    const container = document.getElementById('demoStepsContainer');
    const rows = container ? container.querySelectorAll('.demo-step-row') : [];
    if (!rows.length) {
      this.notify('Debe agregar al menos un paso a la secuencia DEMO.', 'warning');
      return;
    }

    const submitBtn = document.querySelector('#saveDemoForm button[type="submit"]');
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span> Guardando en RDS...';
    }

    try {
      if (targetMode === 'new') {
        // 1. Crear demo vinculada al vehículo seleccionado
        const demoRes = await this.api.createCustomDemo(vId, { nombre, descripcion });
        const demoId = demoRes.id_demo || demoRes.id;

        // 2. Agregar pasos ordenados a la demo
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

        this.notify(`¡DEMO #${demoId} creada exitosamente con sus movimientos para el vehículo #${vId}!`, 'success');
      } else {
        // Modo: Renombrar demo y/o agregar/quitar movimientos de una demo existente
        const demoId = Number(targetMode);
        const demos = (this.vehicleDemosMap && this.vehicleDemosMap[vId]) || [];
        const currentDemo = demos.find((d) => (d.id_demo || d.id) === demoId);

        // 1. Actualizar Nombre y Descripción de la DEMO si cambiaron en Amazon RDS
        let nombreActualizado = false;
        if (currentDemo && (nombre !== currentDemo.nombre || descripcion !== (currentDemo.descripcion || ''))) {
          await this.api.updateDemo(vId, demoId, {
            nombre,
            descripcion: descripcion || '',
            activo: currentDemo.activo !== undefined ? currentDemo.activo : true,
          }).catch((err) => console.warn('Error al actualizar cabecera de la demo:', err));
          nombreActualizado = true;
        }

        // 2. Eliminar movimientos quitados en backend si existen
        let movimientosEliminados = 0;
        if (this.pendingDeletedMovementIds && this.pendingDeletedMovementIds.length) {
          for (const movId of this.pendingDeletedMovementIds) {
            await this.api.deleteDemoMovement(vId, demoId, movId).catch((err) =>
              console.warn('Eliminación de movimiento omitida o no soportada:', err)
            );
            movimientosEliminados++;
          }
          this.pendingDeletedMovementIds = [];
        }

        // 3. Agregar las filas de movimientos nuevos agregados por el usuario
        let orden = 1;
        let movimientosAgregados = 0;
        for (const r of rows) {
          const id_comando = Number(r.querySelector('.step-command').value);
          const duracion_ms = Number(r.querySelector('.step-duration').value);
          const pausa_ms = Number(r.querySelector('.step-pause').value);
          const isNew = r.dataset.isNew === 'true';

          if (isNew) {
            await this.api.addDemoMovement(vId, demoId, {
              id_comando,
              orden: orden,
              duracion_ms,
              pausa_ms,
            });
            movimientosAgregados++;
          }
          orden++;
        }

        const detalles = [];
        if (nombreActualizado) detalles.push(`Nombre cambiado a "${nombre}"`);
        if (movimientosAgregados > 0) detalles.push(`${movimientosAgregados} paso(s) agregado(s)`);
        if (movimientosEliminados > 0) detalles.push(`${movimientosEliminados} paso(s) eliminado(s)`);
        const resumen = detalles.length ? detalles.join(', ') : 'Secuencia sincronizada';

        this.notify(`¡DEMO #${demoId} actualizada en Amazon RDS! (${resumen})`, 'success');
      }

      if (submitBtn) {
        submitBtn.innerHTML = '✅ ¡Guardado con éxito!';
        await new Promise((r) => setTimeout(r, 600));
      }

      e.target.reset();
      await this.loadDemoEditor();
    } catch (err) {
      this.notify(`Error al guardar en la DEMO: ${err.message}`, 'error', 4500);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Invitados y Demostración Comercial
  // ---------------------------------------------------------------------------
  async loadGuestCatalog() {
    const container = document.getElementById('guestCatalogCards');
    if (!container) return;
    container.innerHTML = '<div class="col-12 text-center py-4 text-muted"><span class="spinner-border spinner-border-sm text-cyan me-2"></span>Cargando vehículos disponibles para prueba...</div>';

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
              <div>
                <div class="d-flex align-items-center justify-content-between mb-1">
                  <h5 class="text-cyan mb-0 guest-vehicle-title">${u.nombre_modelo}</h5>
                  <span class="badge ${isOccupied ? 'bg-warning text-dark' : 'bg-success'}">${u.estado_reserva}</span>
                </div>
                <p class="guest-unit-meta mb-1">Unidad #${u.id_vehiculo} · Microcontrolador ${u.microcontrolador}</p>
                <p class="guest-unit-desc mb-2">${u.descripcion || 'Carretilla elevadora de control remoto mediante microcontrolador ESP8266'}</p>
                <div class="d-flex flex-wrap gap-1 mb-2 guest-specs-chips">
                  <span class="badge bg-dark border border-secondary text-info">📡 AWS WebSockets</span>
                  <span class="badge bg-dark border border-secondary text-cyan">🕹️ Mandos Duales</span>
                  <span class="badge bg-dark border border-secondary text-warning">⚡ Tracción Diferencial</span>
                </div>
              </div>
              <div class="mt-auto d-flex justify-content-end align-items-center pt-2 border-top border-secondary">
                <button class="btn btn-sm ${isOccupied ? 'btn-secondary' : 'btn-cyan'} w-100 guest-book-btn" 
                  ${isOccupied ? 'disabled' : ''} 
                  onclick="window.adminModule.startGuestBooking(${u.id_vehiculo}, '${u.nombre_modelo}')">
                  ${isOccupied ? '⏳ Unidad en Uso por Otro Invitado' : '🎮 Solicitar Prueba de Conducción (3 min)'}
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
      const modalEl = document.getElementById('guestBookingModal');
      const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }
  }

  async handleRequestGuestSession() {
    const vId = Number(document.getElementById('guestBookVehicleId').value);
    const alias = document.getElementById('guestAliasInput').value.trim() || 'Invitado';
    const btn = document.getElementById('requestGuestSessionBtn');

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Reservando...';
    }

    try {
      const res = await this.api.requestGuestSession(vId, alias, 180);
      this.guestSession = res;
      this.notify(`¡Sesión concedida para la unidad #${vId}! Tienes 3 minutos de prueba exclusiva.`, 'success', 5000);

      if (window.bootstrap) {
        const modalEl = document.getElementById('guestBookingModal');
        const modal = window.bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }

      // Activar cronómetro y panel de prueba HUD global
      this.startGuestCountdown(res.duracion_segundos || 180);
      this.api.setVehicleId(vId);
      this.onVehicleChange(vId);

      // Ir a Control
      const controlTab = document.getElementById('controlTab');
      if (controlTab) controlTab.click();
    } catch (err) {
      this.notify(`No se pudo reservar la unidad: ${err.message}`, 'error', 4500);
      this.loadGuestCatalog();
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = 'Comenzar Prueba';
      }
    }
  }

  startGuestCountdown(seconds) {
    window.clearInterval(this.guestTimer);
    let remaining = seconds;
    const banner = document.getElementById('guestSessionBanner');
    const timerText = document.getElementById('guestSessionTimer');

    if (banner) {
      banner.classList.remove('d-none');
      banner.classList.remove('is-urgent');
    }

    const tick = () => {
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      if (timerText) {
        timerText.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
      if (remaining <= 30 && banner) {
        banner.classList.add('is-urgent');
      }
      if (remaining <= 0) {
        window.clearInterval(this.guestTimer);
        // Parada física obligatoria al expirar
        if (typeof window.requestStop === 'function') {
          window.requestStop(true);
        }
        this.notify('Tu tiempo de prueba ha finalizado. La unidad se ha detenido de forma segura.', 'warning', 6000);
        this.handleReleaseGuestSession();
        // Redirigir a vista de administración
        const adminTab = document.getElementById('adminTab');
        if (adminTab) adminTab.click();
      }
      remaining--;
    };

    tick();
    this.guestTimer = window.setInterval(tick, 1000);
  }

  async handleReleaseGuestSession() {
    window.clearInterval(this.guestTimer);
    // Parada física obligatoria inmediata
    if (typeof window.requestStop === 'function') {
      window.requestStop(true);
    }
    if (this.guestSession?.token_sesion) {
      try {
        await this.api.releaseGuestSession(this.guestSession.token_sesion);
      } catch (e) {
        // Ignorar si expiró en backend
      }
    }
    this.guestSession = null;
    const banner = document.getElementById('guestSessionBanner');
    if (banner) {
      banner.classList.add('d-none');
      banner.classList.remove('is-urgent');
    }
    this.loadGuestCatalog();
  }
}
