/*
 * Trago Delivery · Mapa interno do motorista
 * Intervenção de raiz:
 * - Leaflet isolado dentro do painel, sem abrir mapa externo.
 * - Aguarda o container estar visível antes de inicializar o mapa.
 * - Corrige tiles quebrados causados por renderização em secção oculta.
 * - Mostra recolha, entrega, rota e posição do motorista.
 */
(function () {
    let map = null;
    let tileLayer = null;
    let pickupMarker = null;
    let deliveryMarker = null;
    let driverMarker = null;
    let driverAccuracyCircle = null;
    let routeLayer = null;
    let currentOrder = null;
    let lastDriverPosition = null;
    let resizeObserver = null;
    let renderSequence = 0;

    const DEFAULT_CENTER = [-25.9655, 32.5832];
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

    function getMapElement() {
        return document.getElementById('driver-route-map');
    }

    function isMapElementReady(mapEl) {
        if (!mapEl) return false;
        const rect = mapEl.getBoundingClientRect();
        return rect.width >= 240 && rect.height >= 260 && mapEl.offsetParent !== null;
    }

    function waitForVisibleMap(maxAttempts = 20) {
        return new Promise((resolve) => {
            let attempts = 0;
            const check = () => {
                const mapEl = getMapElement();
                if (isMapElementReady(mapEl)) {
                    resolve(mapEl);
                    return;
                }
                attempts += 1;
                if (attempts >= maxAttempts) {
                    resolve(mapEl || null);
                    return;
                }
                setTimeout(check, 90);
            };
            requestAnimationFrame(check);
        });
    }

    function createDivIcon(type, label, icon) {
        return L.divIcon({
            className: `trago-map-pin trago-map-pin-${type}`,
            html: `<span><i class="fas ${icon}"></i></span><small>${label}</small>`,
            iconSize: [78, 48],
            iconAnchor: [23, 38],
            popupAnchor: [0, -36]
        });
    }

    function createDriverPositionIcon() {
        return L.divIcon({
            className: 'trago-driver-position-icon',
            html: `
                <span class="trago-driver-position-pulse"></span>
                <span class="trago-driver-position-dot"></span>
                <small>Você</small>
            `,
            iconSize: [72, 72],
            iconAnchor: [36, 36],
            popupAnchor: [0, -34]
        });
    }

    function invalidateMapLayout(times = 6) {
        if (!map) return;
        const delays = [0, 60, 150, 320, 650, 1000].slice(0, Math.max(1, times));
        delays.forEach((delay) => setTimeout(() => {
            try {
                map.invalidateSize({ animate: false, pan: false });
            } catch (_) {}
        }, delay));
    }

    function ensureMap(mapEl) {
        if (!mapEl || !window.L) return null;

        if (map) {
            invalidateMapLayout(6);
            return map;
        }

        map = L.map(mapEl, {
            zoomControl: true,
            attributionControl: true,
            scrollWheelZoom: true,
            preferCanvas: true,
            fadeAnimation: false,
            zoomAnimation: true,
            markerZoomAnimation: true
        }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

        tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            minZoom: 5,
            detectRetina: false,
            updateWhenIdle: false,
            updateWhenZooming: false,
            keepBuffer: 4,
            attribution: '&copy; OpenStreetMap'
        }).addTo(map);

        map.whenReady(() => {
            invalidateMapLayout(6);
            setTimeout(() => {
                try { map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: false }); } catch (_) {}
            }, 120);
        });

        if ('ResizeObserver' in window && !resizeObserver) {
            resizeObserver = new ResizeObserver(() => invalidateMapLayout(4));
            resizeObserver.observe(mapEl);
        }

        window.addEventListener('resize', () => invalidateMapLayout(4));
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

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function compactPlaceName(value, fallback = 'Morada não informada') {
        const raw = String(value || '').replace(/\s+/g, ' ').trim();
        if (!raw) return fallback;
        const ignored = [/^moçambique$/i, /^mozambique$/i, /^cidade de maputo$/i, /^zona sul$/i, /^zona norte$/i, /^zona centro$/i, /^distrito municipal/i, /^\d{3,}[-–]?\d*$/i];
        const parts = raw.split(',')
            .map(part => part.replace(/[“”"']/g, '').replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .filter(part => !ignored.some(rx => rx.test(part)))
            .map(part => part.replace(/^Avenida\s+/i, 'Av. '));
        let selected = parts.slice(0, 3);
        if (!selected.length) selected = raw.split(',').map(p => p.trim()).filter(Boolean).slice(0, 2);
        let short = selected.join(' · ');
        if (short.length > 72 && selected.length > 2) short = selected.slice(0, 2).join(' · ');
        if (short.length > 72) short = `${short.slice(0, 69).trim()}…`;
        return short || fallback;
    }

    function drawFallbackLine(origin, destination) {
        if (!map || !isValidCoord(origin) || !isValidCoord(destination)) return;
        routeLayer = L.polyline([toLatLng(origin), toLatLng(destination)], {
            color: '#2f7a3c',
            weight: 5,
            opacity: 0.9,
            dashArray: '8, 8',
            lineCap: 'round',
            lineJoin: 'round'
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
        const sequence = ++renderSequence;
        const mapEl = await waitForVisibleMap();
        if (sequence !== renderSequence) return;

        const activeMap = ensureMap(mapEl);
        if (!activeMap) {
            setMapStatus('Não foi possível carregar o mapa interno.');
            return;
        }

        invalidateMapLayout(6);
        clearRoute();

        const pickup = order?.pickup_address_coords;
        const delivery = order?.address_coords;

        if (!isValidCoord(pickup) || !isValidCoord(delivery)) {
            setMapStatus('Este pedido ainda não tem coordenadas completas de recolha e entrega.');
            activeMap.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: false });
            return;
        }

        pickupMarker = L.marker(toLatLng(pickup), {
            icon: createDivIcon('pickup', 'Recolha', 'fa-box-open'),
            keyboard: false
        }).addTo(activeMap).bindPopup(`<strong>Ponto de Recolha</strong><br>${escapeHtml(compactPlaceName(order.pickup_address_text, 'Morada não informada'))}`);

        deliveryMarker = L.marker(toLatLng(delivery), {
            icon: createDivIcon('delivery', 'Entrega', 'fa-flag-checkered'),
            keyboard: false
        }).addTo(activeMap).bindPopup(`<strong>Ponto de Entrega</strong><br>${escapeHtml(compactPlaceName(order.address_text, 'Morada não informada'))}`);

        setMapStatus('A calcular rota interna...');

        try {
            const route = await fetchRoute(pickup, delivery);
            if (sequence !== renderSequence) return;
            const latLngs = geoJsonToLatLngs(route.geometry);
            if (latLngs.length >= 2) {
                routeLayer = L.polyline(latLngs, {
                    color: '#2f7a3c',
                    weight: 6,
                    opacity: 0.94,
                    lineCap: 'round',
                    lineJoin: 'round'
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
            setMapStatus('Rota estimada carregada; serviço de rota indisponível.');
        }

        updateDriverMarker(lastDriverPosition);
        invalidateMapLayout(6);
    }

    function fitRoute() {
        if (!map) return;
        const layers = [pickupMarker, deliveryMarker, routeLayer, driverMarker, driverAccuracyCircle].filter(Boolean);
        if (!layers.length) return;

        invalidateMapLayout(3);
        setTimeout(() => {
            try {
                const group = L.featureGroup(layers);
                map.fitBounds(group.getBounds().pad(0.18), {
                    animate: false,
                    maxZoom: 16,
                    paddingTopLeft: [24, 24],
                    paddingBottomRight: [24, 24]
                });
                invalidateMapLayout(4);
            } catch (error) {
                console.warn('[DriverMap] Não foi possível centralizar rota:', error);
            }
        }, 160);
    }

    function updateDriverMarker(position) {
        lastDriverPosition = position;
        if (!map || !isValidCoord(position)) {
            setLocationState('GPS inativo', 'idle');
            return;
        }

        const latLng = toLatLng(position);
        const accuracy = Number(position.accuracy);
        const radius = Number.isFinite(accuracy) ? Math.max(18, Math.min(accuracy, 120)) : 24;

        if (!driverAccuracyCircle) {
            driverAccuracyCircle = L.circle(latLng, {
                radius,
                stroke: true,
                color: '#2563eb',
                weight: 1.5,
                opacity: 0.35,
                fillColor: '#2563eb',
                fillOpacity: 0.10,
                interactive: false
            }).addTo(map);
        } else {
            driverAccuracyCircle.setLatLng(latLng);
            driverAccuracyCircle.setRadius(radius);
        }

        if (!driverMarker) {
            driverMarker = L.marker(latLng, {
                icon: createDriverPositionIcon(),
                keyboard: false,
                zIndexOffset: 1200
            }).addTo(map).bindPopup('A sua posição actual');
        } else {
            driverMarker.setLatLng(latLng);
        }

        try {
            driverAccuracyCircle.bringToFront();
            driverMarker.setZIndexOffset(1200);
        } catch (_) {}

        setLocationState(Number.isFinite(accuracy) ? `GPS activo · ±${Math.round(accuracy)}m` : 'GPS activo', 'active');
    }

    function centerOnDriver() {
        if (!map) {
            setMapStatus('O mapa ainda não terminou de carregar.');
            return;
        }

        let latLng = null;
        if (driverMarker) {
            latLng = driverMarker.getLatLng();
        } else if (isValidCoord(lastDriverPosition)) {
            latLng = L.latLng(Number(lastDriverPosition.lat), Number(lastDriverPosition.lng));
            updateDriverMarker(lastDriverPosition);
        }

        if (!latLng) {
            setMapStatus('A posição actual ainda não foi recebida. Confirme a permissão de localização.');
            return;
        }

        invalidateMapLayout(3);
        map.setView(latLng, 17, { animate: true });
        setMapStatus('Mapa centrado na sua posição actual.');
        try {
            driverMarker?.openPopup();
        } catch (_) {}
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
        invalidate: () => invalidateMapLayout(6),
        destroy: () => {
            if (resizeObserver) resizeObserver.disconnect();
            resizeObserver = null;
            if (map) map.remove();
            map = null;
            tileLayer = null;
            pickupMarker = null;
            deliveryMarker = null;
            driverMarker = null;
            driverAccuracyCircle = null;
            routeLayer = null;
        }
    };
})();
