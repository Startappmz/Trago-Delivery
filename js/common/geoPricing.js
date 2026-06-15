/*
 * Trago Delivery - Geolocalização e preço por distância
 *
 * - Captura ponto de recolha e ponto de entrega.
 * - Usa pesquisa OpenStreetMap/Nominatim para sugestões sem chave Google.
 * - Calcula a rota no backend via OpenRouteService quando TRAGO_ORS_API_KEY estiver configurada.
 * - Calcula preço por distância com a política operacional da Trago Delivery.
 */
(function () {
  'use strict';

  const MAPUTO_BIAS = {
    lat: -25.9640,
    lng: 32.5707,
    radiusMeters: 45000
  };

  const PRICING_POLICY = Object.freeze({
    baseDistanceKm: 11.6,
    baseFeeMzn: 200,
    extraKmFeeMzn: 15
  });

  const state = {
    pickup: null,
    delivery: null,
    form: null,
    debounceTimers: {}
  };

  const $ = (id) => document.getElementById(id);
  const toNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  function isValidCoord(coord) {
    return coord && Number.isFinite(Number(coord.lat)) && Number.isFinite(Number(coord.lng));
  }

  function formatMzn(value) {
    return `${Number(value || 0).toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MZN`;
  }

  function formatKm(value) {
    if (!Number.isFinite(Number(value))) return '—';
    return `${Number(value).toFixed(2)} km`;
  }

  function calculateDeliveryFee(distanceKm) {
    const distance = Math.max(0, Number(distanceKm) || 0);
    if (distance <= PRICING_POLICY.baseDistanceKm) return PRICING_POLICY.baseFeeMzn;
    const extraKm = Math.ceil(distance - PRICING_POLICY.baseDistanceKm);
    return PRICING_POLICY.baseFeeMzn + (extraKm * PRICING_POLICY.extraKmFeeMzn);
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

  function setInputValue(id, value) {
    const el = $(id);
    if (el) el.value = value ?? '';
  }

  function updateOutput({ distanceKm = null, durationMin = null, deliveryFee = 0, total = 0, source = '' } = {}) {
    const form = state.form || {};
    setInputValue(form.distanceInputId, Number.isFinite(Number(distanceKm)) ? Number(distanceKm).toFixed(2) : '');
    setInputValue(form.durationInputId, Number.isFinite(Number(durationMin)) ? Math.round(Number(durationMin)) : '');
    setInputValue(form.deliveryFeeInputId, Number(deliveryFee || 0).toFixed(2));
    setInputValue(form.totalPriceInputId, Number(total || 0).toFixed(2));

    const distanceLabel = $(form.distanceLabelId);
    const feeLabel = $(form.deliveryFeeLabelId);
    const totalLabel = $(form.totalPriceLabelId);
    const sourceLabel = $(form.sourceLabelId);

    if (distanceLabel) distanceLabel.textContent = distanceKm ? formatKm(distanceKm) : '—';
    if (feeLabel) feeLabel.textContent = formatMzn(deliveryFee);
    if (totalLabel) totalLabel.textContent = formatMzn(total);
    if (sourceLabel) sourceLabel.textContent = source || 'Aguardando moradas';
  }

  async function fetchRouteQuote(origin, destination) {
    const response = await fetch(`${API_URL}/api/geo/quote`, {
      method: 'POST',
      headers: { ...getAuthHeaders('admin'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Falha ao calcular distância.');
    return data;
  }

  async function updateQuote() {
    const form = state.form || {};
    const servicePrice = toNumber($(form.servicePriceInputId)?.value, 0);

    if (!isValidCoord(state.pickup) || !isValidCoord(state.delivery)) {
      updateOutput({ deliveryFee: 0, total: servicePrice, source: 'Seleccione recolha e entrega' });
      return;
    }

    try {
      const quote = await fetchRouteQuote(state.pickup, state.delivery);
      const total = servicePrice + toNumber(quote.delivery_fee, 0);
      updateOutput({
        distanceKm: quote.distance_km,
        durationMin: quote.duration_min,
        deliveryFee: quote.delivery_fee,
        total,
        source: quote.source === 'openrouteservice' ? 'OpenRouteService' : 'Cálculo estimado'
      });
    } catch (error) {
      console.warn('[TragoGeoPricing] Fallback local:', error.message || error);
      const distanceKm = haversineKm(state.pickup, state.delivery);
      const deliveryFee = calculateDeliveryFee(distanceKm);
      updateOutput({
        distanceKm,
        durationMin: Math.max(1, Math.round((distanceKm / 35) * 60)),
        deliveryFee,
        total: servicePrice + deliveryFee,
        source: 'Estimativa local'
      });
    }
  }

  function setCoords(kind, coords, label = '') {
    if (!['pickup', 'delivery'].includes(kind) || !isValidCoord(coords)) return;
    state[kind] = { lat: Number(coords.lat), lng: Number(coords.lng), label };

    const form = state.form || {};
    if (kind === 'pickup') {
      setInputValue(form.pickupLatInputId, state[kind].lat);
      setInputValue(form.pickupLngInputId, state[kind].lng);
      if (label && $(form.pickupInputId)) $(form.pickupInputId).value = label;
    } else {
      setInputValue(form.deliveryLatInputId, state[kind].lat);
      setInputValue(form.deliveryLngInputId, state[kind].lng);
      if (label && $(form.deliveryInputId)) $(form.deliveryInputId).value = label;
      if (typeof window.setFormMapDeliveryPosition === 'function') {
        window.setFormMapDeliveryPosition(state[kind].lat, state[kind].lng);
      }
    }

    updateQuote();
  }

  function makeSuggestionsPanel(input) {
    let panel = input.parentElement.querySelector('.geo-suggestions-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'geo-suggestions-panel hidden';
      input.parentElement.appendChild(panel);
    }
    return panel;
  }

  function hideSuggestions(input) {
    const panel = input?.parentElement?.querySelector('.geo-suggestions-panel');
    if (panel) panel.classList.add('hidden');
  }

  function attachNominatimFallback(input, kind) {
    const panel = makeSuggestionsPanel(input);

    input.addEventListener('input', () => {
      const query = input.value.trim();
      state[kind] = null;
      updateQuote();

      clearTimeout(state.debounceTimers[kind]);
      if (query.length < 3) {
        panel.classList.add('hidden');
        return;
      }

      state.debounceTimers[kind] = setTimeout(async () => {
        try {
          panel.innerHTML = '<div class="geo-suggestion-muted">A procurar locais...</div>';
          panel.classList.remove('hidden');
          const url = new URL('https://nominatim.openstreetmap.org/search');
          url.searchParams.set('format', 'jsonv2');
          url.searchParams.set('q', `${query}, Maputo, Moçambique`);
          url.searchParams.set('countrycodes', 'mz');
          url.searchParams.set('limit', '6');
          url.searchParams.set('addressdetails', '1');
          url.searchParams.set('bounded', '0');
          url.searchParams.set('viewbox', '32.25,-25.70,32.85,-26.15');

          const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
          const results = await response.json();
          panel.innerHTML = '';

          if (!Array.isArray(results) || !results.length) {
            panel.innerHTML = '<div class="geo-suggestion-muted">Nenhuma sugestão encontrada.</div>';
            return;
          }

          results.forEach((place) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'geo-suggestion-item';
            item.innerHTML = `<strong>${place.name || place.display_name.split(',')[0]}</strong><small>${place.display_name}</small>`;
            item.addEventListener('click', () => {
              setCoords(kind, { lat: Number(place.lat), lng: Number(place.lon) }, place.display_name);
              panel.classList.add('hidden');
            });
            panel.appendChild(item);
          });
        } catch (error) {
          console.warn('[TragoGeoPricing] Sugestões indisponíveis:', error.message || error);
          panel.innerHTML = '<div class="geo-suggestion-muted">Sugestões indisponíveis. Use o pin do mapa.</div>';
        }
      }, 350);
    });

    document.addEventListener('click', (event) => {
      if (!input.parentElement.contains(event.target)) hideSuggestions(input);
    });
  }


  function initDeliveryPricingForm(options = {}) {
    state.form = {
      pickupInputId: 'pickup-address',
      deliveryInputId: 'delivery-address',
      servicePriceInputId: 'delivery-price',
      pickupLatInputId: 'pickup-lat',
      pickupLngInputId: 'pickup-lng',
      deliveryLatInputId: 'delivery-lat',
      deliveryLngInputId: 'delivery-lng',
      distanceInputId: 'route-distance-km',
      durationInputId: 'route-duration-min',
      deliveryFeeInputId: 'delivery-fee',
      totalPriceInputId: 'final-order-price',
      distanceLabelId: 'route-distance-label',
      deliveryFeeLabelId: 'delivery-fee-label',
      totalPriceLabelId: 'total-price-label',
      sourceLabelId: 'route-source-label',
      ...options
    };

    const pickupInput = $(state.form.pickupInputId);
    const deliveryInput = $(state.form.deliveryInputId);
    const servicePriceInput = $(state.form.servicePriceInputId);
    if (!pickupInput || !deliveryInput || !servicePriceInput) return;

    [pickupInput, deliveryInput].forEach((input) => {
      if (getComputedStyle(input.parentElement).position === 'static') {
        input.parentElement.style.position = 'relative';
      }
    });

    attachNominatimFallback(pickupInput, 'pickup');
    attachNominatimFallback(deliveryInput, 'delivery');

    servicePriceInput.addEventListener('input', updateQuote);
    updateQuote();
  }

  function resetDeliveryPricing() {
    state.pickup = null;
    state.delivery = null;
    updateOutput({ deliveryFee: 0, total: toNumber($(state.form?.servicePriceInputId)?.value, 0), source: 'Seleccione recolha e entrega' });
  }

  window.TragoGeoPricing = {
    PRICING_POLICY,
    initDeliveryPricingForm,
    resetDeliveryPricing,
    setCoords,
    updateQuote,
    calculateDeliveryFee,
    haversineKm
  };
})();
