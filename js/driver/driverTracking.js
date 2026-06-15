/*
 * Trago Delivery · Tracking do motorista
 * Fluxo corrigido:
 * - A permissão de localização é pedida de forma clara e controlada.
 * - O motorista só fica online depois da primeira coordenada válida.
 * - Logout/descarregamento da página força estado offline no Supabase.
 * - Cada actualização de GPS alimenta o Realtime do admin e o mapa interno do motorista.
 */
let socket = null;
let locationWatchId = null;
let heartbeatTimer = null;
let locationPermissionDenied = false;
let locationRetryCount = 0;
let driverRealtimeSubscription = null;
let driverOnlineConfirmed = false;
let offlineInProgress = false;

const MAX_RETRIES = 3;
const HEARTBEAT_INTERVAL_MS = 30000;

const notificationSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
notificationSound.volume = 0.45;
let audioUnblocked = false;

function getDriverTokenSafe() {
    return typeof getAuthToken === 'function' ? getAuthToken('driver') : localStorage.getItem('driverToken');
}

function playNotificationSound() {
    const playPromise = notificationSound.play();
    if (playPromise !== undefined) {
        playPromise.then(() => {
            audioUnblocked = true;
        }).catch(() => {
            audioUnblocked = false;
        });
    }
}

function unlockAudio() {
    if (audioUnblocked) return;
    notificationSound.muted = true;
    notificationSound.play().then(() => {
        notificationSound.muted = false;
        audioUnblocked = true;
    }).catch(() => {
        notificationSound.muted = false;
    });
}

function emitDriverPosition(position) {
    document.dispatchEvent(new CustomEvent('driver_location_updated', {
        detail: position
    }));
}

function updateLocationNote(html, color = 'var(--danger)') {
    const note = document.getElementById('location-permission-note');
    if (!note) return;
    note.style.display = 'block';
    note.style.color = color;
    note.innerHTML = html;
}

function hideLocationModal() {
    document.getElementById('location-permission-modal')?.classList.add('hidden');
}

function showLocationPermissionModal() {
    const modal = document.getElementById('location-permission-modal');
    if (!modal) {
        requestLocationPermission();
        return;
    }

    modal.classList.remove('hidden');
    const note = document.getElementById('location-permission-note');
    if (note) note.style.display = 'none';

    const closeBtn = document.getElementById('close-location-modal');
    if (closeBtn) closeBtn.style.display = 'none';

    const allowBtn = document.getElementById('allow-location-btn');
    const denyBtn = document.getElementById('deny-location-btn');
    if (!allowBtn || !denyBtn) return;

    const newAllowBtn = allowBtn.cloneNode(true);
    const newDenyBtn = denyBtn.cloneNode(true);
    allowBtn.parentNode.replaceChild(newAllowBtn, allowBtn);
    denyBtn.parentNode.replaceChild(newDenyBtn, denyBtn);

    newAllowBtn.addEventListener('click', () => {
        requestLocationPermission();
    });

    newDenyBtn.addEventListener('click', () => {
        updateLocationNote('<i class="fas fa-exclamation-triangle"></i> A localização é obrigatória para receber entregas. Clique em “Permitir Localização” e aceite a autorização do navegador.');
        if (typeof showCustomAlert === 'function') {
            showCustomAlert('Localização obrigatória', 'Sem GPS activo o motorista fica offline e não pode receber entregas.', 'error');
        }
    });
}

async function ensureDriverOnline() {
    const token = getDriverTokenSafe();
    if (!token || !window.TragoRealtime?.setDriverOnline) return;
    try {
        await window.TragoRealtime.setDriverOnline(token);
        driverOnlineConfirmed = true;
    } catch (error) {
        console.warn('Não foi possível marcar motorista como online:', error);
    }
}

function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
        if (!driverOnlineConfirmed) return;
        const token = getDriverTokenSafe();
        if (!token) return;
        window.TragoRealtime?.setDriverOnline?.(token).catch((error) => {
            console.warn('Heartbeat online falhou:', error);
        });
    }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}

function requestLocationPermission() {
    if (!navigator.geolocation) {
        updateLocationNote('<i class="fas fa-times-circle"></i> Este dispositivo/navegador não suporta geolocalização.');
        if (typeof showCustomAlert === 'function') {
            showCustomAlert('GPS indisponível', 'O dispositivo não suporta geolocalização. Não é possível iniciar turno.', 'error');
        }
        markDriverOffline({ keepalive: false });
        return;
    }

    if (navigator.permissions?.query) {
        navigator.permissions.query({ name: 'geolocation' }).then((permissionStatus) => {
            if (permissionStatus.state === 'granted') {
                startLocationTracking();
                return;
            }

            if (permissionStatus.state === 'denied') {
                locationPermissionDenied = true;
                markDriverOffline({ keepalive: false });
                updateLocationNote('<i class="fas fa-ban"></i> A localização está bloqueada. Abra as permissões do navegador para este site e active “Localização”.');
                if (typeof showCustomAlert === 'function') {
                    showCustomAlert('Localização bloqueada', 'Active a localização nas permissões do navegador e clique em “Reativar Partilha de Localização”.', 'error', 8000);
                }
                return;
            }

            navigator.geolocation.getCurrentPosition(
                () => startLocationTracking(),
                (error) => handleLocationError(error, true),
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );

            permissionStatus.onchange = () => {
                if (permissionStatus.state === 'granted') {
                    locationPermissionDenied = false;
                    startLocationTracking();
                    hideLocationModal();
                }
            };
        }).catch(() => {
            navigator.geolocation.getCurrentPosition(
                () => startLocationTracking(),
                (error) => handleLocationError(error, true),
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        });
        return;
    }

    navigator.geolocation.getCurrentPosition(
        () => startLocationTracking(),
        (error) => handleLocationError(error, true),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

function handleLocationError(error, isRequired = false) {
    console.error('Erro ao obter localização:', error?.message || error);
    let errorMessage = 'Erro desconhecido ao obter localização.';

    if (error?.code === error.PERMISSION_DENIED) {
        locationPermissionDenied = true;
        errorMessage = 'Permissão de localização negada. Active a localização no navegador para iniciar o turno.';
        markDriverOffline({ keepalive: false });
        showLocationPermissionModal();
        updateLocationNote('<i class="fas fa-exclamation-triangle"></i> Permissão negada. O motorista permanece offline até a localização ser permitida.');
    } else if (error?.code === error.POSITION_UNAVAILABLE) {
        errorMessage = 'GPS indisponível. Verifique se a localização do dispositivo está ligada.';
        locationRetryCount += 1;
    } else if (error?.code === error.TIMEOUT) {
        errorMessage = 'Tempo limite excedido ao obter localização. A tentar novamente...';
        locationRetryCount += 1;
    }

    if (isRequired && error?.code !== error.PERMISSION_DENIED && locationRetryCount < MAX_RETRIES) {
        setTimeout(() => requestLocationPermission(), 3000);
    }

    if (typeof showCustomAlert === 'function') {
        showCustomAlert('Localização', errorMessage, 'error', 6500);
    }
}

function connectDriverSocket() {
    const token = getDriverTokenSafe();
    if (!token) {
        console.error('Token do motorista não encontrado. Realtime não iniciado.');
        return;
    }

    function handleDriverRealtimeEvent(event, data = {}) {
        if (event === 'nova_entrega_atribuida') {
            playNotificationSound();
            if (typeof showCustomAlert === 'function') {
                showCustomAlert('Nova Entrega!', `Novo pedido de ${data.clientName || 'cliente'}.`, 'success');
            }
            document.dispatchEvent(new Event('nova_entrega'));
            return;
        }

        if (event === 'entrega_cancelada') {
            if (typeof showCustomAlert === 'function') {
                showCustomAlert('Entrega Reatribuída', `O pedido #${data.orderId ? data.orderId.slice(-6) : ''} foi reatribuído/cancelado.`, 'info');
            }
            document.dispatchEvent(new Event('nova_entrega'));
            return;
        }
    }

    driverRealtimeSubscription = window.TragoRealtime?.connectDriverRealtime({
        token,
        onEvent: handleDriverRealtimeEvent,
        onReady: () => {
            console.log('Motorista ligado ao canal Realtime. Aguardando GPS para ficar online.');
            showLocationPermissionModal();
            document.body.addEventListener('click', unlockAudio, { once: true });
            document.body.addEventListener('touchstart', unlockAudio, { once: true });
        }
    });

    socket = {
        connected: Boolean(driverRealtimeSubscription),
        emit(event, payload) {
            if (event !== 'driver_location_update') return undefined;
            return window.TragoRealtime?.sendDriverLocation(token, payload).catch((error) => {
                console.warn('Falha ao enviar localização:', error);
            });
        },
        disconnect() {
            driverRealtimeSubscription?.unsubscribe?.();
            driverRealtimeSubscription = null;
            socket.connected = false;
        }
    };
}

function startLocationTracking() {
    stopLocationTracking();

    if (!navigator.geolocation) {
        handleLocationError({ code: 0, message: 'Geolocalização não suportada.' }, true);
        return;
    }

    hideLocationModal();
    locationPermissionDenied = false;
    locationRetryCount = 0;

    locationWatchId = navigator.geolocation.watchPosition(
        async (position) => {
            const { latitude, longitude, accuracy, speed } = position.coords;
            const payload = {
                lat: latitude,
                lng: longitude,
                accuracy,
                speed,
                timestamp: new Date().toISOString()
            };

            emitDriverPosition(payload);

            if (!driverOnlineConfirmed) {
                await ensureDriverOnline();
                startHeartbeat();
            }

            if (socket?.connected) {
                socket.emit('driver_location_update', payload);
            }

            locationRetryCount = 0;
        },
        (error) => handleLocationError(error, true),
        {
            enableHighAccuracy: true,
            timeout: 25000,
            maximumAge: 8000
        }
    );
}

function stopLocationTracking() {
    if (locationWatchId !== null) {
        navigator.geolocation.clearWatch(locationWatchId);
        locationWatchId = null;
    }
}

async function markDriverOffline(options = {}) {
    const token = getDriverTokenSafe();
    if (!token || offlineInProgress) return;

    offlineInProgress = true;
    driverOnlineConfirmed = false;
    stopHeartbeat();

    try {
        await window.TragoRealtime?.setDriverOffline?.(token, { keepalive: Boolean(options.keepalive) });
    } catch (error) {
        console.warn('Falha ao marcar motorista offline:', error);
    } finally {
        offlineInProgress = false;
    }
}

async function shutdownDriverTracking(options = {}) {
    stopLocationTracking();
    stopHeartbeat();
    await markDriverOffline(options);
    if (driverRealtimeSubscription?.unsubscribe) {
        try { driverRealtimeSubscription.unsubscribe(); } catch (_) {}
    }
    driverRealtimeSubscription = null;
    if (socket) socket.connected = false;
}

function restartLocationTracking() {
    locationPermissionDenied = false;
    locationRetryCount = 0;
    showLocationPermissionModal();
}

window.addEventListener('pagehide', () => {
    shutdownDriverTracking({ keepalive: true });
});

window.addEventListener('beforeunload', () => {
    shutdownDriverTracking({ keepalive: true });
});

window.restartLocationTracking = restartLocationTracking;
window.startLocationTracking = startLocationTracking;
window.stopLocationTracking = stopLocationTracking;
window.showLocationPermissionModal = showLocationPermissionModal;
window.requestLocationPermission = requestLocationPermission;
window.TragoDriverTracking = {
    shutdown: shutdownDriverTracking,
    markOffline: markDriverOffline,
    restart: restartLocationTracking,
    isOnline: () => driverOnlineConfirmed,
    isTracking: () => locationWatchId !== null
};
