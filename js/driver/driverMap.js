/*
 * Trago Delivery · Mapa interno do motorista
 * - Usa Leaflet + OpenStreetMap dentro do painel.
 * - Mostra ponto de recolha, ponto de entrega, rota e posição actual do motorista.
 * - Não expõe a chave da OpenRouteService no front-end; a rota vem da Edge Function.
 */
(function () {
    let map = null;
    let pickupMarker = null;
    let deliveryMarker = null;
    let driverMarker = null;
    let routeLayer = null;
    let currentOrder = null;
    let lastDriverPosition = null;

    const DEFAULT_CENTER = [-25.9655, 32.5832]; // Maputo
    const DEFAULT_ZOOM = 13;

    function isValidCoord(coord) {
        return Boolean(
            coord &&
            Number.isFinite(Number(coord.lat)) &&
            Number.isFinite(Number(coord.lng))
        );
    }

    function toLatLng(coord) {
        return [Number(coord.lat), Number(coord.lng)];
    }

    function setMapStatus(message) {
        const el = document.getElementById('driver-map-status');
        if (el) el.textContent = message;
    }

    function setLocationState(message, mode = 'idle') {
        const el = document.getElementById('driver-location-state');
        if (!el) return;
        el.textContent = message;
        el.dataset.state = mode;
    }

    function createDivIcon(type, label, icon) {
        return L.divIcon({
            className: `trago-map-pin trago-map-pin-${type}`,
            html: `<span><i class="fas ${icon}"></i></span><small>${label}</small>`,
            iconSize: [74, 42],
            iconAnchor: [22, 38],
            popupAnchor: [0, -36]
        });
    }

    function ensureMap() {
        const mapEl = document.getElementById('driver-route-map');
        if (!mapEl || !window.L) return null;

        if (map) {
            setTimeout(() => map.invalidateSize(), 80);
            return map;
        }

        map = L.map(mapEl, {
            zoomControl: true,
            attributionControl: true,
            scrollWheelZoom: true
        }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
        }).addTo(map);

        setTimeout(() => map.invalidateSize(), 120);
        return map;
    }

    function clearRoute() {
        if (!map) return;
        [pickupMarker, deliveryMarker, routeLayer].forEach((layer) => {
            if (layer) map.removeLayer(layer);
        });
        pickupMarker = null;
        deliveryMarker = null;
        routeLayer = null;
    }

    function drawFallbackLine(origin, destination) {
        if (!map || !isValidCoord(origin) || !isValidCoord(destination)) return;
        routeLayer = L.polyline([toLatLng(origin), toLatLng(destination)], {
            weight: 5,
            opacity: 0.85,
            dashArray: '8, 8'
        }).addTo(map);
        fitRoute();
    }

    function geoJsonToLatLngs(geometry) {
        if (!geometry || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) return [];
        return geometry.coordinates
            .filter((point) => Array.isArray(point) && point.length >= 2)
            .map((point) => [Number(point[1]), Number(point[0])])
            .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    }

    async function fetchRoute(origin, destination) {
        const response = await fetch(`${API_URL}/api/geo/route`, {
            method: 'POST',
            headers: { ...getAuthHeaders('driver'), 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin, destination })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Não foi possível carregar a rota.');
        return data;
    }

    async function renderOrderRoute(order) {
        currentOrder = order;
        const activeMap = ensureMap();
        if (!activeMap) return;

        setTimeout(() => activeMap.invalidateSize(), 100);
        clearRoute();

        const pickup = order?.pickup_address_coords;
        const delivery = order?.address_coords;

        if (!isValidCoord(pickup) || !isValidCoord(delivery)) {
            setMapStatus('Este pedido ainda não tem coordenadas completas de recolha e entrega.');
            activeMap.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
            return;
        }

        pickupMarker = L.marker(toLatLng(pickup), {
            icon: createDivIcon('pickup', 'Recolha', 'fa-store')
        }).addTo(activeMap).bindPopup(`<strong>Ponto de Recolha</strong><br>${order.pickup_address_text || 'Morada não informada'}`);

        deliveryMarker = L.marker(toLatLng(delivery), {
            icon: createDivIcon('delivery', 'Entrega', 'fa-flag-checkered')
        }).addTo(activeMap).bindPopup(`<strong>Ponto de Entrega</strong><br>${order.address_text || 'Morada não informada'}`);

        setMapStatus('A calcular rota interna...');

        try {
            const route = await fetchRoute(pickup, delivery);
            const latLngs = geoJsonToLatLngs(route.geometry);
            if (latLngs.length >= 2) {
                routeLayer = L.polyline(latLngs, {
                    weight: 6,
                    opacity: 0.9
                }).addTo(activeMap);
                const distance = Number(route.distance_km || 0).toFixed(2);
                const duration = route.duration_min ? ` · ${route.duration_min} min` : '';
                setMapStatus(`Rota carregada: ${distance} km${duration}.`);
                fitRoute();
            } else {
                drawFallbackLine(pickup, delivery);
                setMapStatus('Rota estimada carregada.');
            }
        } catch (error) {
            console.warn('[DriverMap] Falha ao carregar rota ORS:', error);
            drawFallbackLine(pickup, delivery);
            setMapStatus('Rota estimada carregada; serviço externo indisponível.');
        }

        updateDriverMarker(lastDriverPosition);
    }

    function fitRoute() {
        if (!map) return;
        const layers = [pickupMarker, deliveryMarker, routeLayer, driverMarker].filter(Boolean);
        if (!layers.length) return;
        const group = L.featureGroup(layers);
        map.fitBounds(group.getBounds().pad(0.18), { animate: true, maxZoom: 16 });
    }

    function updateDriverMarker(position) {
        lastDriverPosition = position;
        if (!map || !isValidCoord(position)) {
            setLocationState('GPS inativo', 'idle');
            return;
        }

        const latLng = toLatLng(position);
        if (!driverMarker) {
            driverMarker = L.marker(latLng, {
                icon: createDivIcon('driver', 'Motorista', 'fa-motorcycle')
            }).addTo(map).bindPopup('A sua posição actual');
        } else {
            driverMarker.setLatLng(latLng);
        }

        const accuracy = Number(position.accuracy);
        setLocationState(Number.isFinite(accuracy) ? `GPS activo · ±${Math.round(accuracy)}m` : 'GPS activo', 'active');
    }

    function centerOnDriver() {
        if (!map || !driverMarker) {
            setMapStatus('A posição actual ainda não foi recebida. Confirme a permissão de localização.');
            return;
        }
        map.setView(driverMarker.getLatLng(), 17, { animate: true });
    }

    document.addEventListener('driver_location_updated', (event) => {
        updateDriverMarker(event.detail || null);
    });

    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('btn-centralizar-rota')?.addEventListener('click', fitRoute);
        document.getElementById('btn-minha-posicao')?.addEventListener('click', centerOnDriver);
    });

    window.TragoDriverMap = {
        renderOrderRoute,
        updateDriverMarker,
        fitRoute,
        centerOnDriver,
        invalidate: () => map && setTimeout(() => map.invalidateSize(), 80)
    };
})();
