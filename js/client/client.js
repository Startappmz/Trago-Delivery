/* Trago Delivery · Portal do Cliente */
(() => {
  const SESSION_KEY = 'tragoClientSession';
  const ORDER_HISTORY_KEY = 'tragoClientOrderHistory';
  const LOCAL_RATINGS_KEY = 'tragoClientFoodRatings';
  const currency = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });
  const PRICING_POLICY = Object.freeze({ baseDistanceKm: 11.6, baseFeeMzn: 200, extraKmFeeMzn: 15 });

  const state = {
    session: null,
    activePanel: 'home',
    selectedCategory: 'all',
    selectedRatings: {},
    map: null,
    routeLine: null,
    mode: 'pickup',
    pickupMarker: null,
    deliveryMarker: null,
    pickupCoords: null,
    deliveryCoords: null,
    deliveryQuote: null,
    foodQuote: null,
    restaurants: [],
    cart: []
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const money = (value) => currency.format(Number(value || 0));
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const isValidCoord = (coord) => coord && Number.isFinite(Number(coord.lat)) && Number.isFinite(Number(coord.lng));

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

  function readLocalRatings() {
    try { return JSON.parse(localStorage.getItem(LOCAL_RATINGS_KEY) || '{}'); } catch { return {}; }
  }

  function saveLocalRating(key, rating) {
    state.selectedRatings[key] = Number(rating);
    localStorage.setItem(LOCAL_RATINGS_KEY, JSON.stringify(state.selectedRatings));
  }

  function writeHistory(order) {
    let history = [];
    try { history = JSON.parse(localStorage.getItem(ORDER_HISTORY_KEY) || '[]'); } catch { history = []; }
    history.unshift({
      id: order?._id || order?.id || `local_${Date.now()}`,
      code: order?.verification_code || '',
      service_type: order?.service_type || '',
      price: Number(order?.price || 0),
      delivery_fee: Number(order?.delivery_fee || 0),
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
        ${item.delivery_fee ? `<div class="order-meta"><strong>Taxa de entrega:</strong> ${money(item.delivery_fee)}</div>` : ''}
        ${item.code ? `<div class="order-meta"><strong>Código para entrega:</strong> ${escapeHtml(item.code)}</div>` : ''}
      </div>
    `).join('');
  }

  function initSessionUI() {
    state.session = readSession();
    state.selectedRatings = readLocalRatings();
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
    if (!panel) return;
    state.activePanel = panel;
    $$('.portal-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.panel === panel));
    $$('.portal-panel').forEach((el) => el.classList.toggle('hidden', el.dataset.panel !== panel));
    $$('.mobile-bottom-nav button[data-panel]').forEach((btn) => btn.classList.toggle('active', btn.dataset.panel === panel));
    if (panel === 'map') setTimeout(() => state.map?.invalidateSize?.(), 160);
    if (['food', 'home'].includes(panel)) loadRestaurants();
    closeCartModal(false);
  }

  function setMapMode(mode) {
    state.mode = mode;
    $$('.map-mode').forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === mode));
    const hint = $('#map-mode-hint');
    if (hint) hint.textContent = mode === 'pickup' ? 'Toque no mapa para marcar o ponto de recolha.' : 'Toque no mapa para marcar o ponto de entrega.';
  }

  function setInputValue(selector, value) {
    const el = $(selector);
    if (el) el.value = value ?? '';
  }

  function fitMapRoute() {
    if (!state.map || !isValidCoord(state.pickupCoords) || !isValidCoord(state.deliveryCoords)) return;
    const bounds = L.latLngBounds([state.pickupCoords, state.deliveryCoords]);
    state.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }

  function drawRouteLine() {
    if (!state.map) return;
    if (state.routeLine) {
      state.map.removeLayer(state.routeLine);
      state.routeLine = null;
    }
    if (isValidCoord(state.pickupCoords) && isValidCoord(state.deliveryCoords)) {
      state.routeLine = L.polyline([state.pickupCoords, state.deliveryCoords], { weight: 4, opacity: 0.7 }).addTo(state.map);
      fitMapRoute();
    }
  }

  function placeMarker(kind, coords, label = '') {
    if (!isValidCoord(coords)) return;
    const cleanCoords = { lat: Number(coords.lat), lng: Number(coords.lng) };
    if (kind === 'pickup') {
      state.pickupCoords = cleanCoords;
      setInputValue('#pickup-lat', cleanCoords.lat.toFixed(6));
      setInputValue('#pickup-lng', cleanCoords.lng.toFixed(6));
      if (!state.pickupMarker && state.map) state.pickupMarker = L.marker(cleanCoords, { title: 'Recolha' }).addTo(state.map);
      state.pickupMarker?.setLatLng(cleanCoords).bindPopup(label || 'Ponto de recolha').openPopup();
      setMapMode('delivery');
    } else {
      state.deliveryCoords = cleanCoords;
      setInputValue('#delivery-lat', cleanCoords.lat.toFixed(6));
      setInputValue('#delivery-lng', cleanCoords.lng.toFixed(6));
      setInputValue('#food-delivery-lat', cleanCoords.lat.toFixed(6));
      setInputValue('#food-delivery-lng', cleanCoords.lng.toFixed(6));
      if (!state.deliveryMarker && state.map) state.deliveryMarker = L.marker(cleanCoords, { title: 'Entrega' }).addTo(state.map);
      state.deliveryMarker?.setLatLng(cleanCoords).bindPopup(label || 'Ponto de entrega').openPopup();
    }
    state.map?.setView(cleanCoords, Math.max(state.map.getZoom?.() || 14, 14));
    drawRouteLine();
    refreshDeliveryQuote();
    calculateCartDistance(false);
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
      placeMarker(state.mode, { lat: event.latlng.lat, lng: event.latlng.lng });
    });
  }

  function useMyLocation(target = 'delivery') {
    if (!navigator.geolocation) {
      toast('Este navegador não disponibiliza localização.', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (target === 'pickup') setMapMode('pickup');
      else setMapMode('delivery');
      placeMarker(target, coords, target === 'pickup' ? 'Minha localização como recolha' : 'Minha localização como entrega');
      toast(target === 'pickup' ? 'Recolha marcada com a tua localização.' : 'Entrega marcada com a tua localização.');
    }, () => toast('Não foi possível obter a localização.', 'error'), { enableHighAccuracy: true, timeout: 10000 });
  }

  function haversineKm(origin, destination) {
    const R = 6371;
    const dLat = (Number(destination.lat) - Number(origin.lat)) * Math.PI / 180;
    const dLng = (Number(destination.lng) - Number(origin.lng)) * Math.PI / 180;
    const lat1 = Number(origin.lat) * Math.PI / 180;
    const lat2 = Number(destination.lat) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function calculateDeliveryFee(distanceKm) {
    const distance = Math.max(0, Number(distanceKm) || 0);
    if (distance <= PRICING_POLICY.baseDistanceKm) return PRICING_POLICY.baseFeeMzn;
    const extraKm = Math.ceil(distance - PRICING_POLICY.baseDistanceKm);
    return PRICING_POLICY.baseFeeMzn + (extraKm * PRICING_POLICY.extraKmFeeMzn);
  }

  async function quotePublicRoute(origin, destination) {
    if (!isValidCoord(origin) || !isValidCoord(destination)) throw new Error('Coordenadas de recolha e entrega são obrigatórias.');
    try {
      const response = await fetch(`${API_URL}/api/public/geo/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin, destination })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Falha ao calcular rota.');
      return data;
    } catch (error) {
      const distanceKm = haversineKm(origin, destination);
      return {
        distance_km: Number(distanceKm.toFixed(2)),
        duration_min: Math.max(1, Math.round((distanceKm / 35) * 60)),
        delivery_fee: calculateDeliveryFee(distanceKm),
        source: 'frontend_haversine'
      };
    }
  }

  function updateDeliveryQuoteLabels(quote = null) {
    const servicePrice = Number($('#order-price')?.value || 0);
    const distance = quote?.distance_km ? `${Number(quote.distance_km).toFixed(2)} km` : '—';
    const fee = quote?.delivery_fee ? money(quote.delivery_fee) : '—';
    const total = quote ? money(servicePrice + Number(quote.delivery_fee || 0)) : '—';
    $$('#delivery-distance-label, #map-distance-label').forEach((el) => { el.textContent = distance; });
    $$('#delivery-fee-label, #map-fee-label').forEach((el) => { el.textContent = fee; });
    const totalEl = $('#delivery-total-label');
    if (totalEl) totalEl.textContent = total;
  }

  async function refreshDeliveryQuote() {
    if (!isValidCoord(state.pickupCoords) || !isValidCoord(state.deliveryCoords)) {
      state.deliveryQuote = null;
      updateDeliveryQuoteLabels(null);
      return null;
    }
    try {
      state.deliveryQuote = await quotePublicRoute(state.pickupCoords, state.deliveryCoords);
      updateDeliveryQuoteLabels(state.deliveryQuote);
      return state.deliveryQuote;
    } catch (_error) {
      state.deliveryQuote = null;
      updateDeliveryQuoteLabels(null);
      return null;
    }
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
    if (isValidCoord(state.pickupCoords) && isValidCoord(state.deliveryCoords) && !state.deliveryQuote) {
      await refreshDeliveryQuote();
    }
    const quote = state.deliveryQuote || {};
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
      delivery_fee: quote.delivery_fee || 0,
      route_distance_km: quote.distance_km || 0,
      route_duration_min: quote.duration_min || 0,
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
      resetMapState();
      updateDeliveryQuoteLabels(null);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> Criar pedido';
    }
  }

  function resetMapState() {
    state.pickupCoords = null;
    state.deliveryCoords = null;
    state.deliveryQuote = null;
    if (state.pickupMarker) { state.map?.removeLayer(state.pickupMarker); state.pickupMarker = null; }
    if (state.deliveryMarker) { state.map?.removeLayer(state.deliveryMarker); state.deliveryMarker = null; }
    if (state.routeLine) { state.map?.removeLayer(state.routeLine); state.routeLine = null; }
    ['#pickup-lat', '#pickup-lng', '#delivery-lat', '#delivery-lng', '#food-delivery-lat', '#food-delivery-lng'].forEach((selector) => setInputValue(selector, ''));
  }

  async function loadRestaurants(force = false) {
    const container = $('#restaurants-container');
    if (state.restaurants.length && !force) {
      renderAllFoodViews();
      return;
    }
    if (container) container.innerHTML = '<div class="empty-state">A carregar restaurantes e comidas...</div>';
    try {
      const response = await fetch(`${API_URL}/api/public/restaurants`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Falha ao carregar restaurantes.');
      state.restaurants = Array.isArray(data.restaurants) ? data.restaurants : [];
      renderAllFoodViews();
    } catch (error) {
      if (container) container.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}<br>Confirme se as migrações dos restaurantes/avaliações foram executadas no Supabase.</div>`;
      renderHomeHighlights();
    }
  }

  function getAllMenuItems() {
    return state.restaurants.flatMap((restaurant) => (restaurant.menuItems || []).map((item) => ({ ...item, restaurant })));
  }

  function getCategories() {
    const categories = new Set();
    getAllMenuItems().forEach((entry) => categories.add(entry.category || 'Geral'));
    return Array.from(categories).sort((a, b) => a.localeCompare(b, 'pt'));
  }

  function renderCategoryBar() {
    const wrap = $('#food-category-scroll');
    if (!wrap) return;
    const categories = getCategories();
    wrap.innerHTML = [
      `<button type="button" class="category-filter ${state.selectedCategory === 'all' ? 'active' : ''}" data-category-filter="all">Todos</button>`,
      ...categories.map((category) => `<button type="button" class="category-filter ${state.selectedCategory === category ? 'active' : ''}" data-category-filter="${escapeHtml(category)}">${escapeHtml(category)}</button>`)
    ].join('');
  }

  function getFilteredRestaurants() {
    const term = String($('#food-search')?.value || '').toLowerCase().trim();
    const selected = state.selectedCategory;
    return state.restaurants.map((restaurant) => ({
      ...restaurant,
      menuItems: (restaurant.menuItems || []).filter((item) => {
        const matchesTerm = !term || [restaurant.name, item.name, item.category, item.description].some((value) => String(value || '').toLowerCase().includes(term));
        const matchesCategory = selected === 'all' || String(item.category || 'Geral') === selected;
        return matchesTerm && matchesCategory;
      })
    })).filter((restaurant) => (restaurant.menuItems || []).length);
  }

  function ratingAverage(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function renderStars({ type, id, restaurantId, average = 0, count = 0 }) {
    const key = type === 'food' ? `food:${id}` : `restaurant:${id}`;
    const selected = Number(state.selectedRatings[key] || 0);
    const displayRating = selected || Math.round(ratingAverage(average));
    const buttons = [1, 2, 3, 4, 5].map((rating) => `
      <button type="button" class="star-btn ${rating <= displayRating ? 'filled' : ''}" data-rate-${type}="${escapeHtml(id)}" data-restaurant-id="${escapeHtml(restaurantId || id)}" data-rating="${rating}" aria-label="Avaliar com ${rating} estrela(s)">★</button>
    `).join('');
    return `
      <div class="rating-row" title="${count ? `${Number(average || 0).toFixed(1)} em ${count} avaliação(ões)` : 'Ainda sem avaliações'}">
        <div class="stars">${buttons}</div>
        <small>${count ? `${Number(average || 0).toFixed(1)} (${count})` : 'Avaliar'}</small>
      </div>
    `;
  }

  function renderFoodCard(item, restaurant, highlight = false) {
    return `
      <article class="food-card ${highlight ? 'highlight-food-card' : ''}">
        <div class="food-image">
          ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}">` : ''}
          <span class="food-category-badge">${escapeHtml(item.category || 'Geral')}</span>
        </div>
        <div class="food-body">
          <div>
            <h4>${escapeHtml(item.name)}</h4>
            <p class="food-restaurant-name"><i class="fas fa-store"></i> ${escapeHtml(restaurant.name || 'Restaurante')}</p>
          </div>
          <p>${escapeHtml(item.description || 'Prato disponível para entrega.')}</p>
          ${renderStars({ type: 'food', id: item.id, restaurantId: restaurant.id, average: item.average_rating, count: item.rating_count })}
          <div class="food-bottom">
            <span class="food-price">${money(item.price)}</span>
            <button class="btn-plus" type="button" data-add-food="${escapeHtml(item.id)}" aria-label="Adicionar ${escapeHtml(item.name)}"><i class="fas fa-plus"></i></button>
          </div>
        </div>
      </article>
    `;
  }

  function renderHomeHighlights() {
    const newestWrap = $('#new-dishes-grid');
    const favoritesWrap = $('#favorite-dishes-grid');
    if (!newestWrap && !favoritesWrap) return;
    const allItems = getAllMenuItems();
    const newest = [...allItems].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 8);
    const favorites = [...allItems]
      .sort((a, b) => (Number(b.average_rating || 0) - Number(a.average_rating || 0)) || (Number(b.rating_count || 0) - Number(a.rating_count || 0)) || (Number(b.price || 0) - Number(a.price || 0)))
      .slice(0, 8);

    if (newestWrap) newestWrap.innerHTML = newest.length ? newest.map(({ restaurant, ...item }) => renderFoodCard(item, restaurant, true)).join('') : '<div class="empty-state">Ainda não há pratos novos disponíveis.</div>';
    if (favoritesWrap) favoritesWrap.innerHTML = favorites.length ? favorites.map(({ restaurant, ...item }) => renderFoodCard(item, restaurant, true)).join('') : '<div class="empty-state">Ainda não há favoritos suficientes. As avaliações aparecerão aqui.</div>';
  }

  function renderRestaurants() {
    const container = $('#restaurants-container');
    if (!container) return;
    const restaurants = getFilteredRestaurants();
    if (!restaurants.length) {
      container.innerHTML = '<div class="empty-state">Nenhum prato disponível neste filtro.</div>';
      return;
    }
    container.innerHTML = restaurants.map((restaurant) => {
      const categories = [...new Set((restaurant.menuItems || []).map((item) => item.category || 'Geral'))];
      const cards = categories.map((category) => {
        const items = (restaurant.menuItems || []).filter((item) => (item.category || 'Geral') === category);
        return `
          <div class="category-strip"><span class="category-chip">${escapeHtml(category)}</span></div>
          <div class="food-grid">
            ${items.map((item) => renderFoodCard(item, restaurant)).join('')}
          </div>
        `;
      }).join('');
      return `
        <section class="restaurant-group" data-restaurant-id="${escapeHtml(restaurant.id)}">
          <div class="restaurant-head">
            <div class="restaurant-id">
              <div class="restaurant-logo">${restaurant.logo_url ? `<img src="${escapeHtml(restaurant.logo_url)}" alt="${escapeHtml(restaurant.name)}">` : escapeHtml(String(restaurant.name || 'R').slice(0,2).toUpperCase())}</div>
              <div>
                <h3>${escapeHtml(restaurant.name)}</h3>
                <p>${escapeHtml(restaurant.address_text || 'Restaurante parceiro Trago')}</p>
                ${renderStars({ type: 'restaurant', id: restaurant.id, restaurantId: restaurant.id, average: restaurant.average_rating, count: restaurant.rating_count })}
              </div>
            </div>
            <span class="status-pill"><i class="fas fa-store"></i> ${categories.length} categoria(s)</span>
          </div>
          ${cards}
        </section>
      `;
    }).join('');
  }

  function renderAllFoodViews() {
    renderCategoryBar();
    renderRestaurants();
    renderHomeHighlights();
  }

  function findFoodItem(itemId) {
    for (const restaurant of state.restaurants) {
      const item = (restaurant.menuItems || []).find((entry) => String(entry.id || entry._id) === String(itemId));
      if (item) return { item, restaurant };
    }
    return null;
  }

  function addToCart(itemId) {
    const found = findFoodItem(itemId);
    if (!found) return;
    const { item, restaurant } = found;
    if (state.cart.length && String(state.cart[0].restaurant.id) !== String(restaurant.id)) {
      toast('Por agora, cada pedido de comida deve ser feito num restaurante de cada vez.', 'error');
      return;
    }
    const existing = state.cart.find((entry) => String(entry.item.id) === String(item.id));
    if (existing) existing.qty += 1;
    else state.cart.push({ item, restaurant, qty: 1 });
    state.foodQuote = null;
    renderCart();
    toast(`${item.name} adicionado ao carrinho.`);
  }

  function updateCart(itemId, delta) {
    const entry = state.cart.find((cartItem) => String(cartItem.item.id) === String(itemId));
    if (!entry) return;
    entry.qty += delta;
    if (entry.qty <= 0) state.cart = state.cart.filter((cartItem) => String(cartItem.item.id) !== String(itemId));
    state.foodQuote = null;
    renderCart();
  }

  function removeCartItem(itemId) {
    state.cart = state.cart.filter((cartItem) => String(cartItem.item.id) !== String(itemId));
    state.foodQuote = null;
    renderCart();
  }

  function clearCart() {
    if (!state.cart.length) return;
    state.cart = [];
    state.foodQuote = null;
    renderCart();
    toast('Carrinho limpo.');
  }

  function cartSubtotal() {
    return state.cart.reduce((sum, entry) => sum + Number(entry.item.price || 0) * entry.qty, 0);
  }

  function cartCount() {
    return state.cart.reduce((sum, entry) => sum + entry.qty, 0);
  }

  function updateCartBadges() {
    const count = cartCount();
    $$('#cart-count-mobile, #cart-count-desktop').forEach((el) => { el.textContent = String(count); });
  }

  function getRestaurantCoords(restaurant) {
    const coords = restaurant?.address_coords;
    if (isValidCoord(coords)) return { lat: Number(coords.lat), lng: Number(coords.lng) };
    return null;
  }

  function getFoodDeliveryCoords() {
    const lat = $('#food-delivery-lat')?.value || $('#delivery-lat')?.value;
    const lng = $('#food-delivery-lng')?.value || $('#delivery-lng')?.value;
    const coords = { lat: Number(lat), lng: Number(lng) };
    return isValidCoord(coords) ? coords : (isValidCoord(state.deliveryCoords) ? state.deliveryCoords : null);
  }

  function renderCartQuote() {
    const subtotal = cartSubtotal();
    const quote = state.foodQuote;
    $('#cart-total') && ($('#cart-total').textContent = money(subtotal));
    $('#cart-distance-label') && ($('#cart-distance-label').textContent = quote?.distance_km ? `${Number(quote.distance_km).toFixed(2)} km` : '—');
    $('#cart-delivery-fee-label') && ($('#cart-delivery-fee-label').textContent = quote?.delivery_fee ? money(quote.delivery_fee) : '—');
    $('#cart-grand-total') && ($('#cart-grand-total').textContent = money(subtotal + Number(quote?.delivery_fee || 0)));
    const help = $('#cart-distance-help');
    if (help) {
      if (!state.cart.length) help.textContent = 'Adicione pratos para iniciar um pedido.';
      else if (quote?.source) help.textContent = quote.source === 'openrouteservice' ? 'Distância calculada pela rota.' : 'Distância estimada localmente.';
      else help.textContent = 'Para calcular a distância, o restaurante precisa ter coordenadas e a entrega deve estar marcada no mapa.';
    }
  }

  function renderCart() {
    const list = $('#cart-list');
    const restaurantLabel = $('#cart-restaurant-label');
    const clearBtn = $('#btn-clear-cart');
    updateCartBadges();
    if (!list) return;
    if (!state.cart.length) {
      list.innerHTML = '<div class="empty-state">Carrinho vazio.</div>';
      if (restaurantLabel) restaurantLabel.textContent = 'Selecione pratos de um restaurante.';
      if (clearBtn) clearBtn.disabled = true;
      renderCartQuote();
      return;
    }
    if (clearBtn) clearBtn.disabled = false;
    if (restaurantLabel) restaurantLabel.textContent = `Restaurante: ${state.cart[0].restaurant.name}`;
    list.innerHTML = state.cart.map((entry) => `
      <div class="cart-item">
        <div>
          <strong>${escapeHtml(entry.item.name)}</strong>
          <small>${money(entry.item.price)} · ${entry.qty} un.</small>
        </div>
        <div class="qty-row">
          <button class="qty-btn" type="button" data-cart-dec="${escapeHtml(entry.item.id)}" aria-label="Reduzir quantidade">−</button>
          <strong>${entry.qty}</strong>
          <button class="qty-btn" type="button" data-cart-inc="${escapeHtml(entry.item.id)}" aria-label="Aumentar quantidade">+</button>
          <button class="qty-btn remove" type="button" data-cart-remove="${escapeHtml(entry.item.id)}" aria-label="Remover item"><i class="fas fa-xmark"></i></button>
        </div>
      </div>
    `).join('');
    renderCartQuote();
  }

  async function calculateCartDistance(showFeedback = true) {
    if (!state.cart.length) {
      state.foodQuote = null;
      renderCartQuote();
      return null;
    }
    const restaurant = state.cart[0].restaurant;
    const origin = getRestaurantCoords(restaurant);
    const destination = getFoodDeliveryCoords();
    if (!origin) {
      state.foodQuote = null;
      renderCartQuote();
      if (showFeedback) toast('Este restaurante ainda não tem coordenadas no perfil. Peça ao restaurante para actualizar o endereço no portal.', 'error');
      return null;
    }
    if (!destination) {
      state.foodQuote = null;
      renderCartQuote();
      if (showFeedback) toast('Marque o ponto de entrega no mapa ou use a sua localização.', 'error');
      return null;
    }
    state.foodQuote = await quotePublicRoute(origin, destination);
    renderCartQuote();
    if (showFeedback) toast(`Distância calculada: ${Number(state.foodQuote.distance_km || 0).toFixed(2)} km.`);
    return state.foodQuote;
  }

  function openCartModal() {
    const modal = $('#cart-modal');
    if (!modal) return;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('cart-modal-open');
    renderCart();
  }

  function closeCartModal(silent = true) {
    const modal = $('#cart-modal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('cart-modal-open');
    if (!silent) return;
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
    if (!state.foodQuote) await calculateCartDistance(false);
    const quote = state.foodQuote || {};
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
      lat: $('#food-delivery-lat')?.value || $('#delivery-lat')?.value || undefined,
      lng: $('#food-delivery-lng')?.value || $('#delivery-lng')?.value || undefined,
      service_price: subtotal,
      price: subtotal,
      delivery_fee: quote.delivery_fee || 0,
      route_distance_km: quote.distance_km || 0,
      route_duration_min: quote.duration_min || 0,
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
      state.foodQuote = null;
      renderCart();
      form.reset();
      initSessionUI();
      closeCartModal();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-bag-shopping"></i> Finalizar pedido de comida';
    }
  }

  async function submitRating({ type, id, restaurantId, rating }) {
    const parsedRating = Math.max(1, Math.min(5, Number(rating) || 0));
    if (!parsedRating) return;
    const key = type === 'food' ? `food:${id}` : `restaurant:${id}`;
    saveLocalRating(key, parsedRating);
    renderAllFoodViews();
    try {
      const payload = {
        restaurant_id: restaurantId || id,
        menu_item_id: type === 'food' ? id : '',
        rating: parsedRating,
        customer_session_id: state.session?.id || state.session?.phone || 'anonymous'
      };
      const response = await fetch(`${API_URL}/api/public/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Não foi possível guardar a avaliação.');
      toast('Avaliação guardada.');
      await loadRestaurants(true);
    } catch (error) {
      toast(`${error.message} A avaliação ficou guardada neste dispositivo.`, 'error');
    }
  }

  function bindEvents() {
    $$('.portal-tab, .mobile-bottom-nav button[data-panel]').forEach((btn) => btn.addEventListener('click', () => setPanel(btn.dataset.panel)));
    $$('[data-jump-panel]').forEach((btn) => btn.addEventListener('click', () => setPanel(btn.dataset.jumpPanel)));
    $$('.map-mode').forEach((btn) => btn.addEventListener('click', () => setMapMode(btn.dataset.mode)));
    $('#btn-client-logout')?.addEventListener('click', logout);
    $('#btn-use-location-delivery')?.addEventListener('click', () => useMyLocation('delivery'));
    $('#btn-use-location-pickup')?.addEventListener('click', () => useMyLocation('pickup'));
    $('#btn-food-use-my-location')?.addEventListener('click', () => { setPanel('map'); useMyLocation('delivery'); });
    $('#client-delivery-form')?.addEventListener('submit', handleDeliverySubmit);
    $('#food-checkout-form')?.addEventListener('submit', checkoutFood);
    $('#food-search')?.addEventListener('input', renderRestaurants);
    $('#order-price')?.addEventListener('input', () => updateDeliveryQuoteLabels(state.deliveryQuote));
    $('#btn-refresh-food')?.addEventListener('click', () => loadRestaurants(true));
    $('#btn-refresh-home')?.addEventListener('click', () => loadRestaurants(true));
    $('#btn-clear-food-filter')?.addEventListener('click', () => { state.selectedCategory = 'all'; const search = $('#food-search'); if (search) search.value = ''; renderAllFoodViews(); });
    $('#btn-open-cart-mobile')?.addEventListener('click', openCartModal);
    $('#btn-open-cart-desktop')?.addEventListener('click', openCartModal);
    $('#btn-clear-cart')?.addEventListener('click', clearCart);
    $('#btn-calc-cart-distance')?.addEventListener('click', () => calculateCartDistance(true));
    document.addEventListener('click', (event) => {
      const closeBtn = event.target.closest('[data-close-cart]');
      if (closeBtn) closeCartModal();
      const categoryBtn = event.target.closest('[data-category-filter]');
      if (categoryBtn) {
        state.selectedCategory = categoryBtn.dataset.categoryFilter || 'all';
        renderAllFoodViews();
      }
      const addBtn = event.target.closest('[data-add-food]');
      if (addBtn) addToCart(addBtn.dataset.addFood);
      const incBtn = event.target.closest('[data-cart-inc]');
      if (incBtn) updateCart(incBtn.dataset.cartInc, 1);
      const decBtn = event.target.closest('[data-cart-dec]');
      if (decBtn) updateCart(decBtn.dataset.cartDec, -1);
      const removeBtn = event.target.closest('[data-cart-remove]');
      if (removeBtn) removeCartItem(removeBtn.dataset.cartRemove);
      const rateFoodBtn = event.target.closest('[data-rate-food]');
      if (rateFoodBtn) submitRating({ type: 'food', id: rateFoodBtn.dataset.rateFood, restaurantId: rateFoodBtn.dataset.restaurantId, rating: rateFoodBtn.dataset.rating });
      const rateRestaurantBtn = event.target.closest('[data-rate-restaurant]');
      if (rateRestaurantBtn) submitRating({ type: 'restaurant', id: rateRestaurantBtn.dataset.rateRestaurant, restaurantId: rateRestaurantBtn.dataset.restaurantId, rating: rateRestaurantBtn.dataset.rating });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeCartModal();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!initSessionUI()) return;
    bindEvents();
    initMap();
    setMapMode('pickup');
    setPanel('home');
    renderCart();
    renderHistory();
    loadRestaurants();
  });
})();
