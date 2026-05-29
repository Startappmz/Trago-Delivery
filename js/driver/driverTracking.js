/*
 * Ficheiro: js/driver/driverTracking.js
 * VERSÃO OBRIGATÓRIA - Localização necessária para uso do sistema
 */

let socket = null;
let locationWatchId = null;
let locationPermissionDenied = false;
let locationRetryCount = 0;
const MAX_RETRIES = 3;

// Criamos o objeto de Áudio uma vez
const notificationSound = new Audio('https://www.myinstants.com/en/instant/oplata-27021/?utm_source=copy&utm_medium=share');
notificationSound.volume = 0.5;

// Esta variável controla se o browser nos deu permissão de áudio
let audioUnblocked = false;

/**
 * Função dedicada para tocar o som.
 */
function playNotificationSound() {
    const playPromise = notificationSound.play();
    
    if (playPromise !== undefined) {
        playPromise.then(() => {
            audioUnblocked = true;
        }).catch(error => {
            console.warn("Áudio bloqueado pelo browser. Esperando interação do utilizador.");
            audioUnblocked = false;
        });
    }
}

/**
 * Esta função é chamada no PRIMEIRO clique do utilizador
 * em qualquer sítio, para "acordar" o áudio.
 */
function unlockAudio() {
    if (!audioUnblocked) {
        console.log("Tentativa de desbloquear o áudio com interação...");
        notificationSound.muted = true;
        notificationSound.play().then(() => {
            notificationSound.muted = false;
            audioUnblocked = true;
            console.log("Áudio desbloqueado com sucesso.");
        }).catch(e => console.error("Desbloqueio de áudio falhou:", e));
    }
}

/**
 * Mostra o modal de permissão de localização - VERSÃO OBRIGATÓRIA
 */
function showLocationPermissionModal() {
    const modal = document.getElementById('location-permission-modal');
    if (!modal) {
        console.error('Modal de permissão de localização não encontrado');
        // Fallback para o prompt nativo do browser
        requestLocationPermission();
        return;
    }

    modal.classList.remove('hidden');
    
    // Esconder a nota de "mais tarde" inicialmente
    const note = document.getElementById('location-permission-note');
    if (note) note.style.display = 'none';

    // Remover botão de fechar se existir (não queremos que feche)
    const closeBtn = document.getElementById('close-location-modal');
    if (closeBtn) {
        closeBtn.style.display = 'none';
    }

    // Configurar eventos (remover listeners antigos para evitar duplicação)
    const allowBtn = document.getElementById('allow-location-btn');
    const denyBtn = document.getElementById('deny-location-btn');

    const newAllowBtn = allowBtn.cloneNode(true);
    const newDenyBtn = denyBtn.cloneNode(true);

    allowBtn.parentNode.replaceChild(newAllowBtn, allowBtn);
    denyBtn.parentNode.replaceChild(newDenyBtn, denyBtn);

    newAllowBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
        requestLocationPermission();
    });

    newDenyBtn.addEventListener('click', () => {
        // Não permite negar - mostra aviso e mantém modal
        if (typeof showCustomAlert === 'function') {
            showCustomAlert(
                'Localização Obrigatória',
                'A localização é necessária para utilizar o sistema de entregas. Por favor, permita o acesso à sua localização.',
                'error'
            );
        }
        
        // Mostrar nota no modal
        const note = document.getElementById('location-permission-note');
        if (note) {
            note.style.display = 'block';
            note.style.color = 'var(--danger)';
            note.innerHTML = '<i class="fas fa-exclamation-triangle"></i> A localização é obrigatória para continuar.';
        }
    });
}

/**
 * Solicita permissão de localização ao utilizador - VERSÃO OBRIGATÓRIA
 */
function requestLocationPermission() {
    if (!navigator.geolocation) {
        console.error('Geolocalização não é suportada neste browser.');
        if (typeof showCustomAlert === 'function') {
            showCustomAlert(
                'Erro de GPS',
                'O seu dispositivo não suporta geolocalização. Não é possível utilizar o sistema de entregas.',
                'error'
            );
        }
        
        // Redirecionar para logout após 3 segundos
        setTimeout(() => {
            if (typeof handleLogout === 'function') {
                handleLogout('driver');
            }
        }, 3000);
        return;
    }

    console.log('Solicitando permissão de localização...');

    // Primeiro, verificamos se já temos permissão
    if (navigator.permissions) {
        navigator.permissions.query({ name: 'geolocation' }).then((permissionStatus) => {
            console.log('Estado da permissão de geolocalização:', permissionStatus.state);

            if (permissionStatus.state === 'granted') {
                // Já tem permissão, iniciar tracking
                startLocationTracking();
            } else if (permissionStatus.state === 'prompt') {
                // Nunca perguntou, vamos pedir
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        // Permissão concedida
                        console.log('Permissão de localização concedida');
                        startLocationTracking();
                        
                        if (typeof showCustomAlert === 'function') {
                            showCustomAlert(
                                'Localização Ativada',
                                'A sua localização está a ser partilhada com o administrador. Obrigado!',
                                'success'
                            );
                        }
                    },
                    (error) => {
                        // Permissão negada ou erro
                        handleLocationError(error, true);
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 15000,
                        maximumAge: 0
                    }
                );
            } else if (permissionStatus.state === 'denied') {
                // Permissão negada anteriormente
                locationPermissionDenied = true;
                
                if (typeof showCustomAlert === 'function') {
                    showCustomAlert(
                        'Localização Bloqueada',
                        'A localização está bloqueada no seu dispositivo. Para utilizar o sistema, ative nas configurações.',
                        'error',
                        8000
                    );
                }
                
                // Mostrar modal novamente com instruções
                const modal = document.getElementById('location-permission-modal');
                if (modal) {
                    modal.classList.remove('hidden');
                    const note = document.getElementById('location-permission-note');
                    if (note) {
                        note.style.display = 'block';
                        note.style.color = 'var(--danger)';
                        note.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Aceda às configurações do seu dispositivo para ativar a localização.';
                    }
                }
            }

            // Listener para mudanças no estado da permissão
            permissionStatus.addEventListener('change', () => {
                console.log('Estado da permissão de localização alterado para:', permissionStatus.state);
                if (permissionStatus.state === 'granted' && locationPermissionDenied) {
                    // Se o utilizador ativou manualmente, reiniciar tracking
                    locationPermissionDenied = false;
                    startLocationTracking();
                    
                    // Fechar modal se estiver aberto
                    const modal = document.getElementById('location-permission-modal');
                    if (modal) {
                        modal.classList.add('hidden');
                    }
                }
            });
        }).catch((error) => {
            console.warn('API permissions não suportada, a usar método tradicional');
            // Fallback para browsers que não suportam Permissions API
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    console.log('Permissão de localização concedida');
                    startLocationTracking();
                },
                (error) => handleLocationError(error, true),
                {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 0
                }
            );
        });
    } else {
        // Browser não suporta Permissions API
        navigator.geolocation.getCurrentPosition(
            (position) => {
                console.log('Permissão de localização concedida');
                startLocationTracking();
            },
            (error) => handleLocationError(error, true),
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            }
        );
    }
}

/**
 * Trata erros de localização - VERSÃO OBRIGATÓRIA
 */
function handleLocationError(error, isRequired = false) {
    console.error("Erro ao obter localização:", error.message);
    
    let errorMessage = '';
    let alertType = 'error';
    
    switch(error.code) {
        case error.PERMISSION_DENIED:
            errorMessage = 'Permissão de localização negada. A localização é OBRIGATÓRIA para utilizar o sistema. Ative nas configurações do seu dispositivo.';
            locationPermissionDenied = true;
            break;
        case error.POSITION_UNAVAILABLE:
            errorMessage = 'Informação de localização indisponível. Verifique o sinal GPS e tente novamente.';
            locationRetryCount++;
            break;
        case error.TIMEOUT:
            errorMessage = 'Tempo limite excedido ao obter localização. A tentar novamente...';
            locationRetryCount++;
            break;
        default:
            errorMessage = 'Erro desconhecido ao obter localização.';
            locationRetryCount++;
    }

    // Tentar novamente se não for permissão negada e não excedeu tentativas
    if (error.code !== error.PERMISSION_DENIED && locationRetryCount < MAX_RETRIES) {
        console.log(`Tentativa ${locationRetryCount} de ${MAX_RETRIES}...`);
        setTimeout(() => {
            requestLocationPermission();
        }, 3000);
    } else if (error.code === error.PERMISSION_DENIED) {
        // Mostrar modal novamente com mensagem de obrigatoriedade
        const modal = document.getElementById('location-permission-modal');
        if (modal) {
            modal.classList.remove('hidden');
            const note = document.getElementById('location-permission-note');
            if (note) {
                note.style.display = 'block';
                note.style.color = 'var(--danger)';
                note.innerHTML = '<i class="fas fa-exclamation-triangle"></i> PERMISSÃO NEGADA. A localização é OBRIGATÓRIA. Ative nas configurações.';
            }
        }
        
        // Se atingiu o máximo de tentativas e ainda sem permissão, fazer logout após aviso
        if (locationRetryCount >= MAX_RETRIES) {
            setTimeout(() => {
                if (typeof handleLogout === 'function') {
                    handleLogout('driver');
                }
            }, 5000);
        }
    }

    if (typeof showCustomAlert === 'function') {
        showCustomAlert('Erro de Localização - OBRIGATÓRIA', errorMessage, alertType, 6000);
    }
}

function connectDriverSocket() {
    const token = getAuthToken('driver');
    if (!token) {
        console.error('Não foi possível conectar o Realtime: Token do motorista não encontrado.');
        return;
    }

    function handleDriverRealtimeEvent(event, data = {}) {
        if (event === 'nova_entrega_atribuida') {
            console.log('Nova entrega recebida:', data);

            playNotificationSound();

            if (typeof showCustomAlert === 'function') {
                showCustomAlert(
                    'Nova Entrega!',
                    `Novo pedido de ${data.clientName} (${window.SERVICE_NAMES ? window.SERVICE_NAMES[data.serviceType] : data.serviceType || 'Serviço'}).`,
                    'success'
                );
            }

            document.dispatchEvent(new Event('nova_entrega'));
            return;
        }

        if (event === 'entrega_cancelada') {
            console.log('Entrega foi reatribuída/cancelada:', data);

            if (typeof showCustomAlert === 'function') {
                showCustomAlert(
                    'Entrega Reatribuída',
                    `O pedido #${data.orderId ? data.orderId.slice(-6) : ''} foi reatribuído a outro motorista.`,
                    'info'
                );
            }

            document.dispatchEvent(new Event('nova_entrega'));
            return;
        }

        console.log('[TragoRealtime] Evento motorista recebido:', event, data);
    }

    const subscription = window.TragoRealtime?.connectDriverRealtime({
        token,
        onEvent: handleDriverRealtimeEvent,
        onReady: () => {
            console.log('Motorista conectado ao Supabase Realtime.');
            window.TragoRealtime?.setDriverOnline(token).catch((error) => {
                console.warn('Não foi possível marcar motorista como online:', error);
            });

            setTimeout(() => {
                showLocationPermissionModal();
            }, 1000);

            document.body.addEventListener('click', unlockAudio, { once: true });
            document.body.addEventListener('touchstart', unlockAudio, { once: true });
        }
    });

    // Interface mínima para manter compatibilidade com o código antigo que fazia socket.emit().
    socket = {
        connected: Boolean(subscription),
        emit(event, payload) {
            if (event === 'driver_location_update') {
                return window.TragoRealtime?.sendDriverLocation(token, payload).catch((error) => {
                    console.warn('Falha ao enviar localização via Supabase Realtime:', error);
                });
            }
        },
        disconnect() {
            subscription?.unsubscribe?.();
            window.TragoRealtime?.setDriverOffline(token).catch(() => {});
        }
    };

    window.addEventListener('beforeunload', () => {
        window.TragoRealtime?.setDriverOffline(token).catch(() => {});
    });
}

function startLocationTracking() {
    // Parar tracking anterior se existir
    stopLocationTracking();

    if (!navigator.geolocation) {
        console.error('Geolocalização não é suportada neste browser.');
        return;
    }

    console.log('Iniciando rastreamento de localização do motorista...');

    locationWatchId = navigator.geolocation.watchPosition(
        (position) => {
            const { latitude, longitude, accuracy, speed } = position.coords;
            
            // Log para debug
            console.log(`Posição atualizada: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (precisão: ${accuracy}m)`);
            
            if (socket && socket.connected) {
                socket.emit('driver_location_update', { 
                    lat: latitude, 
                    lng: longitude,
                    accuracy: accuracy,
                    speed: speed,
                    timestamp: new Date().toISOString()
                });
            } else {
                console.warn('Socket não está conectado. Posição não enviada.');
            }

            // Reset contador de tentativas quando consegue posição
            locationRetryCount = 0;
            
            // Se o modal estiver aberto, fechar
            const modal = document.getElementById('location-permission-modal');
            if (modal && !modal.classList.contains('hidden')) {
                modal.classList.add('hidden');
            }
        },
        (error) => {
            handleLocationError(error, true);
        },
        {
            enableHighAccuracy: true,
            timeout: 30000,
            maximumAge: 10000,
            distanceFilter: 10
        }
    );
}

function stopLocationTracking() {
    if (locationWatchId !== null) {
        navigator.geolocation.clearWatch(locationWatchId);
        locationWatchId = null;
        console.log('Rastreamento de localização parado.');
    }
}

// Função para reiniciar tracking manualmente
function restartLocationTracking() {
    locationPermissionDenied = false;
    locationRetryCount = 0;
    stopLocationTracking();
    showLocationPermissionModal();
}

// Exportar funções para uso global
window.restartLocationTracking = restartLocationTracking;
