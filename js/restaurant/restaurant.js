/* Trago Delivery · Portal Restaurante */
(() => {
  const TOKEN_KEY = 'tragoRestaurantToken';
  const PROFILE_KEY = 'tragoRestaurantProfile';
  const currency = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });
  const state = { token: null, profile: null, menu: [], orders: [], editingId: null };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const money = (value) => currency.format(Number(value || 0));
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));

  function toast(message, type = 'success') {
    const el = $('#portal-toast');
    if (!el) return alert(message);
    el.textContent = message;
    el.className = `portal-toast ${type} show`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => el.classList.remove('show'), 3800);
  }

  function headers(json = true) {
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${state.token}`
    };
  }

  async function api(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, options);
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(PROFILE_KEY);
      window.location.replace('login-restaurante.html');
      return null;
    }
    if (!response.ok) throw new Error(data.message || 'Erro de comunicação com o servidor.');
    return data;
  }

  function initSession() {
    state.token = localStorage.getItem(TOKEN_KEY);
    try { state.profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch { state.profile = null; }
    if (!state.token) {
      window.location.replace('login-restaurante.html');
      return false;
    }
    updateProfileUI();
    return true;
  }

  function updateProfileUI() {
    const p = state.profile || {};
    $$('#restaurant-name-label').forEach((el) => { el.textContent = p.name || 'Restaurante'; });
    $('#profile-name') && ($('#profile-name').value = p.name || '');
    $('#profile-phone') && ($('#profile-phone').value = p.phone || '');
    $('#profile-address') && ($('#profile-address').value = p.address_text || '');
    $('#profile-logo') && ($('#profile-logo').value = p.logo_url || '');
    $('#profile-cover') && ($('#profile-cover').value = p.cover_url || '');
    const hero = $('.portal-hero');
    if (hero && p.cover_url) hero.style.backgroundImage = `linear-gradient(90deg, rgba(10,20,10,.86), rgba(10,20,10,.16)), url('${p.cover_url.replace(/'/g, '%27')}')`;
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROFILE_KEY);
    window.location.replace('login-restaurante.html');
  }

  function setPanel(panel) {
    $$('.portal-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.panel === panel));
    $$('.portal-panel').forEach((el) => el.classList.toggle('hidden', el.dataset.panel !== panel));
    $$('.mobile-bottom-nav button').forEach((btn) => btn.classList.toggle('active', btn.dataset.panel === panel));
    if (panel === 'orders') loadOrders();
  }

  async function loadProfile() {
    const data = await api('/api/restaurant/profile', { headers: headers(false) });
    if (!data) return;
    state.profile = data.restaurant;
    localStorage.setItem(PROFILE_KEY, JSON.stringify(state.profile));
    updateProfileUI();
  }

  async function updateProfile(event) {
    event.preventDefault();
    const btn = event.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> A guardar...';
    try {
      const data = await api('/api/restaurant/profile', {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({
          name: $('#profile-name')?.value,
          phone: $('#profile-phone')?.value,
          address_text: $('#profile-address')?.value,
          logo_url: $('#profile-logo')?.value,
          cover_url: $('#profile-cover')?.value
        })
      });
      state.profile = data.restaurant;
      localStorage.setItem(PROFILE_KEY, JSON.stringify(state.profile));
      updateProfileUI();
      toast('Perfil do restaurante actualizado.');
    } catch (error) { toast(error.message, 'error'); }
    finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Guardar perfil';
    }
  }

  async function loadMenu() {
    const list = $('#restaurant-menu-list');
    if (list) list.innerHTML = '<div class="empty-state">A carregar menu...</div>';
    try {
      const data = await api('/api/restaurant/menu', { headers: headers(false) });
      state.menu = data?.items || [];
      renderMenu();
    } catch (error) {
      if (list) list.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
  }

  function renderMenu() {
    const list = $('#restaurant-menu-list');
    const totalItems = $('#metric-menu-items');
    if (totalItems) totalItems.textContent = state.menu.length;
    if (!list) return;
    if (!state.menu.length) {
      list.innerHTML = '<div class="empty-state">Ainda não adicionou comidas. Use o formulário para publicar o primeiro item.</div>';
      return;
    }
    const groups = state.menu.reduce((acc, item) => {
      const key = item.category || 'Geral';
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
    list.innerHTML = Object.entries(groups).map(([category, items]) => `
      <div class="restaurant-group">
        <div class="category-strip"><span class="category-chip">${escapeHtml(category)}</span></div>
        <div class="menu-list">
          ${items.map((item) => `
            <article class="menu-admin-item">
              <img src="${escapeHtml(item.image_url || '')}" alt="" onerror="this.style.display='none'">
              <div>
                <h4>${escapeHtml(item.name)} ${item.available ? '' : '<span class="status-pill">Indisponível</span>'}</h4>
                <p>${money(item.price)} · ${escapeHtml(item.description || 'Sem descrição')}</p>
              </div>
              <div class="inline-actions">
                <button class="portal-btn secondary" type="button" data-edit-item="${escapeHtml(item.id)}"><i class="fas fa-edit"></i> Editar</button>
                <button class="portal-btn danger" type="button" data-delete-item="${escapeHtml(item.id)}"><i class="fas fa-trash"></i></button>
              </div>
            </article>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  function resetMenuForm() {
    state.editingId = null;
    $('#menu-form')?.reset();
    $('#menu-item-id').value = '';
    $('#menu-available').checked = true;
    $('#menu-submit-label').textContent = 'Adicionar comida';
    $('#btn-cancel-menu-edit')?.classList.add('hidden');
  }

  function editMenuItem(id) {
    const item = state.menu.find((entry) => entry.id === id || entry._id === id);
    if (!item) return;
    state.editingId = item.id;
    $('#menu-item-id').value = item.id;
    $('#menu-name').value = item.name || '';
    $('#menu-category').value = item.category || '';
    $('#menu-price').value = Number(item.price || 0);
    $('#menu-image').value = item.image_url || '';
    $('#menu-prep-time').value = item.prep_time_min || '';
    $('#menu-description').value = item.description || '';
    $('#menu-available').checked = item.available !== false;
    $('#menu-submit-label').textContent = 'Guardar alterações';
    $('#btn-cancel-menu-edit')?.classList.remove('hidden');
    window.scrollTo({ top: 180, behavior: 'smooth' });
  }

  async function saveMenuItem(event) {
    event.preventDefault();
    const btn = event.target.querySelector('button[type="submit"]');
    const payload = {
      name: $('#menu-name')?.value,
      category: $('#menu-category')?.value || 'Geral',
      price: Number($('#menu-price')?.value || 0),
      image_url: $('#menu-image')?.value || '',
      prep_time_min: Number($('#menu-prep-time')?.value || 0) || null,
      description: $('#menu-description')?.value || '',
      available: $('#menu-available')?.checked !== false
    };
    if (!payload.name || !payload.category || payload.price <= 0) {
      toast('Preencha nome, categoria e preço válido.', 'error');
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> A guardar...';
    try {
      const path = state.editingId ? `/api/restaurant/menu/${state.editingId}` : '/api/restaurant/menu';
      const method = state.editingId ? 'PUT' : 'POST';
      await api(path, { method, headers: headers(), body: JSON.stringify(payload) });
      toast(state.editingId ? 'Comida actualizada.' : 'Comida adicionada ao restaurante.');
      resetMenuForm();
      await loadMenu();
    } catch (error) { toast(error.message, 'error'); }
    finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-utensils"></i> <span id="menu-submit-label">${state.editingId ? 'Guardar alterações' : 'Adicionar comida'}</span>`;
    }
  }

  async function deleteMenuItem(id) {
    if (!confirm('Eliminar esta comida do menu?')) return;
    try {
      await api(`/api/restaurant/menu/${id}`, { method: 'DELETE', headers: headers(false) });
      toast('Comida eliminada.');
      await loadMenu();
    } catch (error) { toast(error.message, 'error'); }
  }

  async function loadOrders() {
    const list = $('#restaurant-orders-list');
    if (list) list.innerHTML = '<div class="empty-state">A carregar pedidos...</div>';
    try {
      const data = await api('/api/restaurant/orders', { headers: headers(false) });
      state.orders = data?.orders || [];
      renderOrders();
    } catch (error) {
      if (list) list.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
  }

  function renderOrders() {
    const list = $('#restaurant-orders-list');
    const metricOrders = $('#metric-orders');
    const metricRevenue = $('#metric-revenue');
    if (metricOrders) metricOrders.textContent = state.orders.length;
    if (metricRevenue) metricRevenue.textContent = money(state.orders.reduce((sum, order) => sum + Number(order.service_price || order.price || 0), 0));
    if (!list) return;
    if (!state.orders.length) {
      list.innerHTML = '<div class="empty-state">Ainda não existem pedidos de comida para este restaurante.</div>';
      return;
    }
    list.innerHTML = state.orders.map((order) => `
      <article class="order-card">
        <div class="order-card-head">
          <strong>#${escapeHtml(String(order.id || order._id).slice(-6).toUpperCase())} · ${escapeHtml(order.client_name || 'Cliente')}</strong>
          <span class="status-pill">${escapeHtml(order.status || 'pendente')}</span>
        </div>
        <div class="order-meta"><strong>Contacto:</strong> ${escapeHtml(order.client_phone1 || '—')} · <strong>Total:</strong> ${money(order.service_price || order.price)}</div>
        <div class="order-meta"><strong>Entrega:</strong> ${escapeHtml(order.address_text || '—')}</div>
        <div class="order-meta"><strong>Itens/Notas:</strong> ${escapeHtml(order.pickup_notes || '—')}</div>
        <div class="order-meta"><strong>Código:</strong> ${escapeHtml(order.verification_code || '—')} · ${order.createdAt ? new Date(order.createdAt).toLocaleString('pt-MZ') : ''}</div>
      </article>
    `).join('');
  }

  function bindEvents() {
    $('#btn-restaurant-logout')?.addEventListener('click', logout);
    $$('.portal-tab, .mobile-bottom-nav button').forEach((btn) => btn.addEventListener('click', () => setPanel(btn.dataset.panel)));
    $('#restaurant-profile-form')?.addEventListener('submit', updateProfile);
    $('#menu-form')?.addEventListener('submit', saveMenuItem);
    $('#btn-cancel-menu-edit')?.addEventListener('click', resetMenuForm);
    $('#btn-refresh-orders')?.addEventListener('click', loadOrders);
    document.addEventListener('click', (event) => {
      const editBtn = event.target.closest('[data-edit-item]');
      if (editBtn) editMenuItem(editBtn.dataset.editItem);
      const deleteBtn = event.target.closest('[data-delete-item]');
      if (deleteBtn) deleteMenuItem(deleteBtn.dataset.deleteItem);
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (!initSession()) return;
    bindEvents();
    setPanel('menu');
    await loadProfile().catch((error) => toast(error.message, 'error'));
    await loadMenu();
    await loadOrders();
    resetMenuForm();
  });
})();
