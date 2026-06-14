/*
 * Ficheiro: js/admin/adminMap.js
 *
 * (Dependência #5) - Precisa de 'api.js', 'auth.js', 'supabaseRealtime.js'
 *
 * Contém toda a lógica de gestão dos mapas Leaflet.js:
 * - O mapa do formulário de nova entrega.
 * - O mapa em tempo real de motoristas.
 */

// --- Variáveis de Estado para os Mapas ---

// 1. Mapa do Formulário
let map = null;
let mapMarker = null;

// 2. Mapa em Tempo Real
let liveMap = null;
let driverMarkers = {}; // Objeto para guardar os marcadores por ID de motorista/perfil
let liveMapRefreshTimer = null;
let freeIcon = null;
let busyIcon = null;

const BUSY_DRIVER_STATUSES = new Set(['online_ocupado', 'em_recolha', 'em_entrega']);

function normalizeDriverMarkerId(data) {
    return data?.driverId || data?.driverUserId || data?.userId || data?._id;
}

function isValidMapCoordinate(value) {
    return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function getDriverStatusLabel(status = '') {
    const labels = {
        online_livre: 'Online livre',
        online_ocupado: 'Online ocupado',
        em_recolha: 'Em recolha',
        em_entrega: 'Em entrega',
        offline: 'Offline'
    };
    return labels[status] || String(status || 'Online').replace(/_/g, ' ');
}

/**
 * Inicializa os ícones customizados para o mapa em tempo real.
 * Esta função é chamada uma vez quando a página de admin é carregada.
 */
function initializeMapIcons() {
    const iconShadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

    // Ícone para motorista livre
    freeIcon = L.icon({
        iconUrl: 'https://i.postimg.cc/MK8ty3PJ/car-pin-point.png',
        shadowUrl: iconShadowUrl,
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });

    // Ícone para motorista ocupado / em recolha / em entrega
    busyIcon = L.icon({
        iconUrl: 'https://i.postimg.cc/J0bJ0fJj/marker-busy.png',
        shadowUrl: iconShadowUrl,
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });
}

/**
 * Inicializa o mapa do formulário de "Nova Entrega".
 * É chamado pela função showServiceForm() em 'admin.js'.
 */
function initializeFormMap() {
    const maputoCoords = [-25.965, 32.589];

    // Destrói qualquer mapa anterior para evitar duplicação
    if (map) {
        destroyFormMap();
    }

    try {
        map = L.map('map').setView(maputoCoords, 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        // Marcador arrastável
        mapMarker = L.marker(maputoCoords, {
            draggable: true
        }).addTo(map);

        // Atualiza os inputs hidden quando o marcador é arrastado
        mapMarker.on('dragend', (event) => {
            const position = event.target.getLatLng();
            document.getElementById('delivery-lng').value = position.lng;
            document.getElementById('delivery-lat').value = position.lat;
            if (window.TragoGeoPricing) {
                window.TragoGeoPricing.setCoords('delivery', { lat: position.lat, lng: position.lng }, document.getElementById('delivery-address')?.value || 'Pin no mapa');
            }
        });

        map.on('click', (event) => {
            const position = event.latlng;
            mapMarker.setLatLng(position);
            document.getElementById('delivery-lng').value = position.lng;
            document.getElementById('delivery-lat').value = position.lat;
            if (window.TragoGeoPricing) {
                window.TragoGeoPricing.setCoords('delivery', { lat: position.lat, lng: position.lng }, document.getElementById('delivery-address')?.value || 'Pin no mapa');
            }
        });

        // Não define valores iniciais automaticamente para evitar cálculo com coordenadas assumidas.
        document.getElementById('delivery-lng').value = '';
        document.getElementById('delivery-lat').value = '';

    } catch (error) {
        console.error('Erro ao inicializar o mapa do formulário:', error);
        document.getElementById('map').innerHTML = '<p class="map-error-state">Erro ao carregar o mapa.</p>';
    }
}

/**
 * Destrói a instância do mapa do formulário.
 * É chamado pela função showPage() sempre que se sai do formulário.
 */
function destroyFormMap() {
    if (map) {
        map.remove();
        map = null;
        mapMarker = null;
        console.log('Mapa do formulário destruído.');
    }
}



/**
 * Move o pin do formulário para a coordenada escolhida por autocomplete.
 */
function setFormMapDeliveryPosition(lat, lng) {
    if (!map || !mapMarker || !isValidMapCoordinate(lat) || !isValidMapCoordinate(lng)) return;
    const nextLatLng = [Number(lat), Number(lng)];
    mapMarker.setLatLng(nextLatLng);
    map.setView(nextLatLng, Math.max(map.getZoom(), 15));
    const latEl = document.getElementById('delivery-lat');
    const lngEl = document.getElementById('delivery-lng');
    if (latEl) latEl.value = Number(lat);
    if (lngEl) lngEl.value = Number(lng);
}
window.setFormMapDeliveryPosition = setFormMapDeliveryPosition;

/**
 * Inicializa o mapa em tempo real.
 * É chamado pela função showPage() quando se entra na página do mapa.
 */
function initializeLiveMap() {
    if (liveMap) return; // Não inicializa se já estiver ativo

    try {
        const maputoCoords = [-25.965, 32.589];
        liveMap = L.map('live-map-container').setView(maputoCoords, 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(liveMap);

        console.log('Mapa em tempo real inicializado.');

        // Pede ao socket as localizações atuais.
        if (socket && typeof socket.emit === 'function') {
            socket.emit('admin_request_all_locations');
            console.log('A pedir as localizações ativas via Supabase Realtime/API...');
        }

        // Fallback profissional: mesmo que um evento Realtime falhe, o mapa
        // consulta periodicamente as últimas localizações persistidas no backend.
        fetchLiveDriverLocations();
        liveMapRefreshTimer = setInterval(fetchLiveDriverLocations, 20000);

        setTimeout(() => liveMap?.invalidateSize(), 150);

    } catch (error) {
        console.error('Erro ao inicializar o mapa em tempo real:', error);
        document.getElementById('live-map-container').innerHTML = '<p>Erro ao carregar o mapa.</p>';
    }
}

/**
 * Destrói a instância do mapa em tempo real.
 * É chamado pela função showPage() sempre que se sai da página do mapa.
 */
function destroyLiveMap() {
    if (liveMapRefreshTimer) {
        clearInterval(liveMapRefreshTimer);
        liveMapRefreshTimer = null;
    }

    if (liveMap) {
        liveMap.remove();
        liveMap = null;
        driverMarkers = {}; // Limpa o registo de marcadores
        console.log('Mapa em tempo real destruído.');
    }
}

async function fetchLiveDriverLocations() {
    if (!liveMap) return;

    try {
        const response = await fetch(`${API_URL}/api/drivers/live-locations`, {
            headers: getAuthHeaders('admin')
        });

        if (response.status === 401) {
            return handleLogout('admin');
        }

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Erro ao carregar localizações.');

        (data.drivers || []).forEach(updateDriverMarker);
    } catch (error) {
        console.warn('Falha ao carregar fallback de localizações do mapa:', error.message || error);
    }
}

/* --- Funções de Atualização do Mapa em Tempo Real (Chamadas pelo Socket) --- */

/**
 * Atualiza ou cria o marcador de um motorista no mapa em tempo real.
 * @param {object} data - Dados do motorista (driverId, driverName, status, lat, lng).
 */
function updateDriverMarker(data) {
    if (!liveMap || !data) return; // Não faz nada se o mapa não estiver visível

    const driverId = normalizeDriverMarkerId(data);
    const driverName = data.driverName || data.nome || 'Motorista';
    const status = data.status || 'online_livre';
    const lat = Number(data.lat);
    const lng = Number(data.lng);

    if (!driverId || !isValidMapCoordinate(lat) || !isValidMapCoordinate(lng)) {
        return;
    }

    const newLatLng = [lat, lng];
    const statusLabel = getDriverStatusLabel(status);
    const updatedAt = data.updatedAt ? new Date(data.updatedAt) : null;
    const updatedAtLabel = updatedAt && !Number.isNaN(updatedAt.getTime())
        ? `<br><small>Última atualização: ${updatedAt.toLocaleTimeString('pt-MZ', { hour: '2-digit', minute: '2-digit' })}</small>`
        : '';

    const popupContent = `<strong>${driverName}</strong><br>Status: ${statusLabel}${updatedAtLabel}`;
    const iconToUse = BUSY_DRIVER_STATUSES.has(status) ? busyIcon : freeIcon;

    if (driverMarkers[driverId]) {
        // Se o marcador já existe, atualiza a posição, ícone e popup
        driverMarkers[driverId].setLatLng(newLatLng);
        driverMarkers[driverId].setPopupContent(popupContent);
        driverMarkers[driverId].setIcon(iconToUse);
    } else {
        // Se é um novo motorista, cria o marcador
        driverMarkers[driverId] = L.marker(newLatLng, { icon: iconToUse }).addTo(liveMap);
        driverMarkers[driverId].bindPopup(popupContent);
        console.log(`Adicionando novo marcador para ${driverName}`);
    }
}


function updateDriverMarkerStatus(data) {
    const driverId = normalizeDriverMarkerId(data);
    const status = data?.newStatus || data?.status;

    if (!liveMap || !driverId || !status || !driverMarkers[driverId]) return;

    const marker = driverMarkers[driverId];
    const currentLatLng = marker.getLatLng();

    updateDriverMarker({
        driverId,
        driverName: data.driverName || 'Motorista',
        status,
        lat: currentLatLng.lat,
        lng: currentLatLng.lng,
        updatedAt: data.updatedAt || new Date().toISOString()
    });
}

/**
 * Remove o marcador de um motorista que se desconectou.
 * @param {object} data - Dados do motorista (driverId, driverName).
 */
function removeDriverMarker(data) {
    const driverId = normalizeDriverMarkerId(data);
    if (!liveMap || !driverId) return;

    if (driverMarkers[driverId]) {
        liveMap.removeLayer(driverMarkers[driverId]); // Remove do mapa
        delete driverMarkers[driverId]; // Remove do nosso registo
        console.log(`Removido marcador para ${data.driverName || 'motorista'} (desconectado)`);
    }
}
