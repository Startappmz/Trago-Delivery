/* Trago Delivery · Portal do Cliente */
(() => {
  const SESSION_KEY = 'tragoClientSession';
  const ORDER_HISTORY_KEY = 'tragoClientOrderHistory';
  const currency = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });
  const state = {
    session: null,
    activePanel: 'delivery',
    map: null,
    mode: 'pickup',
    pickupMarker: null,
    deliveryMarker: null,
    pickupCoords: null,
    deliveryCoords: null,
    restaurants: [],
    cart: []
  };

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

  function readSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }

  function writeHistory(order) {
    let history = [];
    try { history = JSON.parse(localStorage.getItem(ORDER_HISTORY_KEY) || '[]'); } catch { history = []; }
    history.unshift({
      id: order?._id || order?.id || `local_${Date.now()}`,
      code: order?.verification_code || '',
      service_type: order?.service_type || '',
      price: Number(order?.price || 0),
      createdAt: order?.createdAt || new Date().toISOString(),
      status: order?.status || 'pendente'
    });
    localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(history.slice(0, 30)));
    renderHistory();
  }

  function renderHistory() {
    const list = $('#client-history-list');
    if (!list) return;
    let history = [];
    try { history = JSON.parse(localStorage.getItem(ORDER_HISTORY_KEY) || '[]'); } catch { history = []; }
    if (!history.length) {
      list.innerHTML = '<div class="empty-state">Ainda não existem pedidos feitos neste dispositivo.</div>';
      return;
    }
    list.innerHTML = history.map((item) => `
      <div class="order-card">
        <div class="order-card-head">
          <strong>#${escapeHtml(String(item.id).slice(-6).toUpperCase())}</strong>
          <span class="status-pill">${escapeHtml(item.status || 'pendente')}</span>
        </div>
        <div class="order-meta">${escapeHtml(item.service_type || 'Serviço')} · ${money(item.price)} · ${new Date(item.createdAt).toLocaleString('pt-MZ')}</div>
        ${item.code ? `<div class="order-meta"><strong>Código para entrega:</strong> ${escapeHtml(item.code)}</div>` : ''}
      </div>
    `).join('');
  }

  function initSessionUI() {
    state.session = readSession();
    if (!state.session) {
      window.location.replace('login-cliente.html');
      return false;
    }
    $$('#client-name-label').forEach((el) => { el.textContent = state.session.name || 'Cliente'; });
    const nameInput = $('#order-client-name');
    const phoneInput = $('#order-client-phone');
    if (nameInput) nameInput.value = state.session.name || '';
    if (phoneInput) phoneInput.value = state.session.phone || '';
    const foodName = $('#food-client-name');
    const foodPhone = $('#food-client-phone');
    if (foodName) foodName.value = state.session.name || '';
    if (foodPhone) foodPhone.value = state.session.phone || '';
    return true;
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    window.location.replace('login-cliente.html');
  }

  function setPanel(panel) {
    state.activePanel = panel;
    $$('.portal-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.panel === panel));
    $$('.portal-panel').forEach((el) => el.classList.toggle('hidden', el.dataset.panel !== panel));
    $$('.mobile-bottom-nav button').forEach((btn) => btn.classList.toggle('active', btn.dataset.panel === panel));
    if (panel === 'delivery') setTimeout(() => state.map?.invalidateSize?.(), 120);
    if (panel === 'food') loadRestaurants();
  }

  function setMapMode(mode) {
    state.mode = mode;
    $$('.map-mode').forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === mode));
    const hint = $('#map-mode-hint');
    if (hint) hint.textContent = mode === 'pickup' ? 'Toque no mapa para marcar o ponto de recolha.' : 'Toque no mapa para marcar o ponto de entrega.';
  }

  function initMap() {
    const mapEl = $('#client-map');
    if (!mapEl || typeof L === 'undefined') return;
    state.map = L.map(mapEl, { zoomControl: true }).setView([-25.9655, 32.5832], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(state.map);
    state.map.on('click', (event) => {
      const coords = { lat: event.latlng.lat, lng: event.latlng.lng };
      if (state.mode === 'pickup') {
        state.pickupCoords = coords;
        $('#pickup-lat').value = coords.lat.toFixed(6);
        $('#pickup-lng').value = coords.lng.toFixed(6);
        if (!state.pickupMarker) state.pickupMarker = L.marker(coords, { title: 'Recolha' }).addTo(state.map);
        state.pickupMarker.setLatLng(coords).bindPopup('Ponto de recolha').openPopup();
        setMapMode('delivery');
      } else {
        state.deliveryCoords = coords;
        $('#delivery-lat').value = coords.lat.toFixed(6);
        $('#delivery-lng').value = coords.lng.toFixed(6);
        if (!state.deliveryMarker) state.deliveryMarker = L.marker(coords, { title: 'Entrega' }).addTo(state.map);
        state.deliveryMarker.setLatLng(coords).bindPopup('Ponto de entrega').openPopup();
      }
    });
  }

  function useMyLocation(target = 'delivery') {
    if (!navigator.geolocation) {
      toast('Este navegador não disponibiliza localização.', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      state.map?.setView(coords, 15);
      if (target === 'pickup') setMapMode('pickup');
      else setMapMode('delivery');
      state.map?.fire('click', { latlng: coords });
      toast(target === 'pickup' ? 'Recolha marcada com a tua localização.' : 'Entrega marcada com a tua localização.');
    }, () => toast('Não foi possível obter a localização.', 'error'), { enableHighAccuracy: true, timeout: 10000 });
  }

  async function createPublicOrder(payload) {
    const response = await fetch(`${API_URL}/api/public/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Não foi possível criar o pedido.');
    return data.order;
  }

  async function handleDeliverySubmit(event) {
    event.preventDefault();
    const form = event.target;
    const btn = form.querySelector('button[type="submit"]');
    const servicePrice = Number($('#order-price')?.value || 0);
    const payload = {
      public_source: 'client',
      service_type: $('#order-service-type')?.value || 'rapido',
      client_name: $('#order-client-name')?.value || state.session.name,
      client_phone1: $('#order-client-phone')?.value || state.session.phone,
      client_phone2: $('#order-client-phone2')?.value || '',
      pickup_address_text: $('#order-pickup-address')?.value || '',
      pickup_contact_name: $('#order-pickup-contact-name')?.value || state.session.name,
      pickup_contact_phone: $('#order-pickup-contact-phone')?.value || state.session.phone,
      pickup_notes: $('#order-notes')?.value || '',
      address_text: $('#order-delivery-address')?.value || '',
      service_price: servicePrice,
      price: servicePrice,
      payment_method: $('#order-payment-method')?.value || 'cash',
      pickup_lat: $('#pickup-lat')?.value || undefined,
      pickup_lng: $('#pickup-lng')?.value || undefined,
      lat: $('#delivery-lat')?.value || undefined,
      lng: $('#delivery-lng')?.value || undefined,
      customer_session_id: state.session.id
    };

    if (!payload.pickup_address_text || !payload.address_text) {
      toast('Preencha o ponto de recolha e o ponto de entrega.', 'error');
      return;
    }
    if (!payload.client_name || !payload.client_phone1) {
      toast('Dados do cliente em falta.', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> A criar pedido...';
    try {
      const order = await createPublicOrder(payload);
      writeHistory(order);
      toast(`Pedido criado. Código do destinatário: ${order.verification_code || '—'}`);
      form.reset();
      initSessionUI();
      state.pickupCoords = null;
      state.deliveryCoords = null;
      if (state.pickupMarker) { state.map.removeLayer(state.pickupMarker); state.pickupMarker = null; }
      if (state.deliveryMarker) { state.map.removeLayer(state.deliveryMarker); state.deliveryMarker = null; }
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> Criar pedido';
    }
  }

  async function loadRestaurants(force = false) {
    const container = $('#restaurants-container');
    if (!container) return;
    if (state.restaurants.length && !force) return renderRestaurants();
    container.innerHTML = '<div class="empty-state">A carregar restaurantes e comidas...</div>';
    try {
      const response = await fetch(`${API_URL}/api/public/restaurants`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Falha ao carregar restaurantes.');
      state.restaurants = Array.isArray(data.restaurants) ? data.restaurants : [];
      renderRestaurants();
    } catch (error) {
      container.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}<br>Confirme se a migração dos restaurantes foi executada no Supabase.</div>`;
    }
  }

  function getFilteredRestaurants() {
    const term = String($('#food-search')?.value || '').toLowerCase().trim();
    if (!term) return state.restaurants;
    return state.restaurants.map((restaurant) => ({
      ...restaurant,
      menuItems: (restaurant.menuItems || []).filter((item) =>
        [restaurant.name, item.name, item.category, item.description].some((value) => String(value || '').toLowerCase().includes(term))
      )
    })).filter((restaurant) => (restaurant.menuItems || []).length);
  }

  function renderRestaurants() {
    const container = $('#restaurants-container');
    if (!container) return;
    const restaurants = getFilteredRestaurants();
    if (!restaurants.length) {
      container.innerHTML = '<div class="empty-state">Nenhum prato disponível neste momento.</div>';
      return;
    }
    container.innerHTML = restaurants.map((restaurant) => {
      const categories = [...new Set((restaurant.menuItems || []).map((item) => item.category || 'Geral'))];
      const cards = categories.map((category) => {
        const items = (restaurant.menuItems || []).filter((item) => (item.category || 'Geral') === category);
        return `
          <div class="category-strip"><span class="category-chip">${escapeHtml(category)}</span></div>
          <div class="food-grid">
            ${items.map((item) => `
              <article class="food-card">
                <div class="food-image">
                  ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}">` : ''}
                  <span class="food-category-badge">${escapeHtml(item.category || 'Geral')}</span>
                </div>
                <div class="food-body">
                  <h4>${escapeHtml(item.name)}</h4>
                  <p>${escapeHtml(item.description || 'Prato disponível para entrega.')}</p>
                  <div class="food-bottom">
                    <span class="food-price">${money(item.price)}</span>
                    <button class="btn-plus" type="button" data-add-food="${escapeHtml(item.id)}" aria-label="Adicionar ${escapeHtml(item.name)}"><i class="fas fa-plus"></i></button>
                  </div>
                </div>
              </article>
            `).join('')}
          </div>
        `;
      }).join('');
      return `
        <section class="restaurant-group" data-restaurant-id="${escapeHtml(restaurant.id)}">
          <div class="restaurant-head">
            <div class="restaurant-id">
              <div class="restaurant-logo">${restaurant.logo_url ? `<img src="${escapeHtml(restaurant.logo_url)}" alt="${escapeHtml(restaurant.name)}">` : escapeHtml(String(restaurant.name || 'R').slice(0,2).toUpperCase())}</div>
              <div><h3>${escapeHtml(restaurant.name)}</h3><p>${escapeHtml(restaurant.address_text || 'Restaurante parceiro Trago')}</p></div>
            </div>
            <span class="status-pill"><i class="fas fa-store"></i> ${categories.length} categoria(s)</span>
          </div>
          ${cards}
        </section>
      `;
    }).join('');
  }

  function findFoodItem(itemId) {
    for (const restaurant of state.restaurants) {
      const item = (restaurant.menuItems || []).find((entry) => entry.id === itemId || entry._id === itemId);
      if (item) return { item, restaurant };
    }
    return null;
  }

  function addToCart(itemId) {
    const found = findFoodItem(itemId);
    if (!found) return;
    const { item, restaurant } = found;
    if (state.cart.length && state.cart[0].restaurant.id !== restaurant.id) {
      toast('Por agora, cada pedido de comida deve ser feito num restaurante de cada vez.', 'error');
      return;
    }
    const existing = state.cart.find((entry) => entry.item.id === item.id);
    if (existing) existing.qty += 1;
    else state.cart.push({ item, restaurant, qty: 1 });
    renderCart();
    toast(`${item.name} adicionado ao carrinho.`);
  }

  function updateCart(itemId, delta) {
    const entry = state.cart.find((cartItem) => cartItem.item.id === itemId);
    if (!entry) return;
    entry.qty += delta;
    if (entry.qty <= 0) state.cart = state.cart.filter((cartItem) => cartItem.item.id !== itemId);
    renderCart();
  }

  function cartSubtotal() {
    return state.cart.reduce((sum, entry) => sum + Number(entry.item.price || 0) * entry.qty, 0);
  }

  function renderCart() {
    const list = $('#cart-list');
    const total = $('#cart-total');
    const restaurantLabel = $('#cart-restaurant-label');
    if (!list || !total) return;
    if (!state.cart.length) {
      list.innerHTML = '<div class="empty-state">Carrinho vazio.</div>';
      total.textContent = money(0);
      if (restaurantLabel) restaurantLabel.textContent = 'Selecione pratos de um restaurante.';
      return;
    }
    if (restaurantLabel) restaurantLabel.textContent = `Restaurante: ${state.cart[0].restaurant.name}`;
    list.innerHTML = state.cart.map((entry) => `
      <div class="cart-item">
        <div><strong>${escapeHtml(entry.item.name)}</strong><small>${money(entry.item.price)} · ${entry.qty} un.</small></div>
        <div class="qty-row">
          <button class="qty-btn" type="button" data-cart-dec="${escapeHtml(entry.item.id)}">−</button>
          <strong>${entry.qty}</strong>
          <button class="qty-btn" type="button" data-cart-inc="${escapeHtml(entry.item.id)}">+</button>
        </div>
      </div>
    `).join('');
    total.textContent = money(cartSubtotal());
  }

  async function checkoutFood(event) {
    event.preventDefault();
    if (!state.cart.length) {
      toast('Adicione pelo menos um prato ao carrinho.', 'error');
      return;
    }
    const form = event.target;
    const btn = form.querySelector('button[type="submit"]');
    const restaurant = state.cart[0].restaurant;
    const subtotal = cartSubtotal();
    const itemsSummary = state.cart.map((entry) => `${entry.qty}x ${entry.item.name} (${money(entry.item.price)})`).join('; ');
    const payload = {
      public_source: 'client_food',
      service_type: 'restaurante_comida',
      client_name: $('#food-client-name')?.value || state.session.name,
      client_phone1: $('#food-client-phone')?.value || state.session.phone,
      client_phone2: $('#food-client-phone2')?.value || '',
      pickup_address_text: restaurant.address_text || restaurant.name,
      pickup_contact_name: restaurant.name,
      pickup_contact_phone: restaurant.phone || '',
      pickup_lat: restaurant.address_coords?.lat,
      pickup_lng: restaurant.address_coords?.lng,
      address_text: $('#food-delivery-address')?.value || '',
      lat: $('#food-delivery-lat')?.value || undefined,
      lng: $('#food-delivery-lng')?.value || undefined,
      service_price: subtotal,
      price: subtotal,
      payment_method: $('#food-payment-method')?.value || 'cash',
      pickup_notes: `Pedido de comida · Restaurante: ${restaurant.name}. Itens: ${itemsSummary}. Observações do cliente: ${$('#food-notes')?.value || '—'}`,
      restaurant_id: restaurant.id,
      food_items: state.cart.map((entry) => ({ id: entry.item.id, name: entry.item.name, qty: entry.qty, price: Number(entry.item.price || 0), category: entry.item.category || 'Geral' })),
      customer_session_id: state.session.id
    };
    if (!payload.address_text) {
      toast('Indique o endereço de entrega da comida.', 'error');
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> A enviar pedido...';
    try {
      const order = await createPublicOrder(payload);
      writeHistory(order);
      toast(`Pedido de comida enviado. Código: ${order.verification_code || '—'}`);
      state.cart = [];
      renderCart();
      form.reset();
      initSessionUI();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-bag-shopping"></i> Finalizar pedido de comida';
    }
  }

  function bindEvents() {
    $$('.portal-tab, .mobile-bottom-nav button').forEach((btn) => btn.addEventListener('click', () => setPanel(btn.dataset.panel)));
    $$('.map-mode').forEach((btn) => btn.addEventListener('click', () => setMapMode(btn.dataset.mode)));
    $('#btn-client-logout')?.addEventListener('click', logout);
    $('#btn-use-location-delivery')?.addEventListener('click', () => useMyLocation('delivery'));
    $('#btn-use-location-pickup')?.addEventListener('click', () => useMyLocation('pickup'));
    $('#client-delivery-form')?.addEventListener('submit', handleDeliverySubmit);
    $('#food-checkout-form')?.addEventListener('submit', checkoutFood);
    $('#food-search')?.addEventListener('input', renderRestaurants);
    $('#btn-refresh-food')?.addEventListener('click', () => loadRestaurants(true));
    document.addEventListener('click', (event) => {
      const addBtn = event.target.closest('[data-add-food]');
      if (addBtn) addToCart(addBtn.dataset.addFood);
      const incBtn = event.target.closest('[data-cart-inc]');
      if (incBtn) updateCart(incBtn.dataset.cartInc, 1);
      const decBtn = event.target.closest('[data-cart-dec]');
      if (decBtn) updateCart(decBtn.dataset.cartDec, -1);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!initSessionUI()) return;
    bindEvents();
    initMap();
    setMapMode('pickup');
    setPanel('delivery');
    renderCart();
    renderHistory();
  });
})();
