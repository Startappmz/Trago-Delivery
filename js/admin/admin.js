/*
 * Ficheiro: js/admin/admin.js (REFATORADO)
 *
 * Este é o ficheiro "controlador" principal.
 * Ele apenas gere a navegação, os event listeners e os sockets.
 *
 * Depende de:
 * - adminApi.js (para chamadas fetch)
 * - adminModals.js (para abrir modais)
 * - adminMap.js (para lógica de mapas)
 * - adminCharts.js (para gráficos)
 */

// --- Variáveis de Estado Globais ---
let socket = null;
let clientCache = []; // O cache de clientes ainda é útil aqui

/* --- PONTO DE ENTRADA (Entry Point) --- */
document.addEventListener('DOMContentLoaded', () => {
    checkAuth('admin'); 
    initializeMapIcons(); // (Vem do adminMap.js)
    connectSocket(); 
    attachEventListeners();
    initAdminNotificationCenter();
    installResponsiveTableObserver();

    loadAdminProfile(); // 👈 ESTA LINHA
    
    // Carrega a página inicial
    showPage('visao-geral', 'nav-visao-geral', 'Visão Geral');
});

/**
 * Anexa todos os event listeners da aplicação.
 * As funções 'handle...' e 'open...' vêm dos ficheiros importados.
 */
function attachEventListeners() {
    // --- Formulários ---
    document.getElementById('delivery-form').addEventListener('submit', handleNewDelivery);
    document.getElementById('form-add-motorista').addEventListener('submit', handleAddDriver);
    document.getElementById('form-edit-motorista').addEventListener('submit', handleUpdateDriver);
    document.getElementById('form-add-cliente').addEventListener('submit', handleAddClient);
    document.getElementById('form-edit-cliente').addEventListener('submit', handleUpdateClient);
    document.getElementById('form-change-password').addEventListener('submit', handleChangePassword);

    // --- Navegação Principal (Sidebar) ---
    document.getElementById('nav-visao-geral').addEventListener('click', (e) => {
        e.preventDefault();
        showPage('visao-geral', 'nav-visao-geral', 'Visão Geral');
    });
    document.getElementById('nav-entregas').addEventListener('click', (e) => {
        e.preventDefault();
        showPage('entregas-activas', 'nav-entregas', 'Entregas Activas');
    });
    document.getElementById('nav-motoristas').addEventListener('click', (e) => {
        e.preventDefault();
        showPage('gestao-motoristas', 'nav-motoristas', 'Gestão de Motoristas');
    });
    document.getElementById('nav-clientes').addEventListener('click', (e) => {
        e.preventDefault();
        showPage('gestao-clientes', 'nav-clientes', 'Gestão de Clientes');
    });

    // NOVO: custos
    document.getElementById('nav-custos').addEventListener('click', (e) => {
        e.preventDefault();
        showPage('custos', 'nav-custos', 'Custos');
    });

    // NOVO: cargos
    document.getElementById('nav-cargos').addEventListener('click', (e) => {
        e.preventDefault();
        showPage('cargos', 'nav-cargos', 'Cargos');
    });

    document.getElementById('nav-historico').addEventListener('click', (e) => {
        e.preventDefault();
        showPage('historico', 'nav-historico', 'Histórico');
    });
    document.getElementById('nav-mapa').addEventListener('click', (e) => {
        e.preventDefault();
        showPage('mapa-tempo-real', 'nav-mapa', 'Mapa em Tempo Real');
    });
    document.getElementById('nav-config').addEventListener('click', (e) => {
        e.preventDefault();
        showPage('configuracoes', 'nav-config', 'Configurações');
    });

    // Submenu de Formulários
    document.getElementById('nav-form-doc').addEventListener('click', (e) => { 
        e.preventDefault(); 
        showServiceForm('doc'); 
    });
    document.getElementById('nav-form-farma').addEventListener('click', (e) => { 
        e.preventDefault(); 
        showServiceForm('farma'); 
    });
    document.getElementById('nav-form-carga').addEventListener('click', (e) => { 
        e.preventDefault(); 
        showServiceForm('carga'); 
    });
    document.getElementById('nav-form-rapido').addEventListener('click', (e) => { 
        e.preventDefault(); 
        showServiceForm('rapido'); 
    });
    document.getElementById('nav-form-restaurante-comida')?.addEventListener('click', (e) => {
        e.preventDefault();
        showServiceForm('restaurante_comida');
    });
    document.getElementById('nav-form-mercadoria-cp')?.addEventListener('click', (e) => {
        e.preventDefault();
        showServiceForm('mercadoria_cp');
    });
    document.getElementById('nav-form-refeicao-restaurante-p')?.addEventListener('click', (e) => {
        e.preventDefault();
        showServiceForm('refeicao_restaurante_p');
    });
    document.getElementById('nav-form-outros').addEventListener('click', (e) => { 
        e.preventDefault(); 
        showServiceForm('outros'); 
    });

    // --- Autenticação ---
    document.getElementById('admin-logout').addEventListener('click', (e) => { 
        e.preventDefault(); 
        handleLogout('admin'); 
    });

    // --- Modais e Botões (Listeners) ---
    const resetBtn = document.getElementById('btn-reset-chart');
    if (resetBtn) {
        resetBtn.addEventListener('click', openChartResetModal);
    }
    document.getElementById('btn-confirm-chart-reset').addEventListener('click', handleChartReset);
    document.getElementById('btn-close-chart-reset').addEventListener('click', closeChartResetModal);
    document.getElementById('btn-cancel-chart-reset').addEventListener('click', closeChartResetModal);
    
    document.getElementById('history-search-input').addEventListener('input', filterHistoryTable);
    document.getElementById('delivery-image').addEventListener('change', handleImageUpload);
    document.getElementById('delivery-client-select').addEventListener('change', handleClientSelect);

    // Listeners do Modal de Extrato (Statement)
    document.getElementById('btn-generate-statement').addEventListener('click', handleGenerateStatement);
    document.getElementById('btn-download-pdf').addEventListener('click', handleDownloadPDF);
    document.querySelectorAll('.btn-set-date').forEach(btn => {
        btn.addEventListener('click', () => setStatementDates(btn.dataset.range));
    });

    // Zona de Perigo
    document.getElementById('btn-delete-old-history').addEventListener('click', handleDeleteOldHistoryClick);
    document.getElementById('btn-close-confirmation-modal').addEventListener('click', closeConfirmationModal);
    document.getElementById('btn-cancel-confirmation-modal').addEventListener('click', closeConfirmationModal);
    
    const financialPeriodSelect = document.getElementById('financial-period-select');
    if (financialPeriodSelect) {
        financialPeriodSelect.addEventListener('change', () => loadFinancialStats(financialPeriodSelect.value));
    }

    const vehicleForms = [document.getElementById('form-add-veiculo'), document.getElementById('form-add-veiculo-motoristas')].filter(Boolean);
    vehicleForms.forEach((vehicleForm) => {
        vehicleForm.addEventListener('submit', handleAddVehicle);
    });

    const driverTypeSelect = document.getElementById('driver-type');
    if (driverTypeSelect) {
        driverTypeSelect.addEventListener('change', () => applyDriverTypeCommissionLock('driver-type', 'driver-commission'));
    }
    const editDriverTypeSelect = document.getElementById('edit-driver-type');
    if (editDriverTypeSelect) {
        editDriverTypeSelect.addEventListener('change', () => applyDriverTypeCommissionLock('edit-driver-type', 'edit-driver-commission'));
    }

    // NOVO: formulário de custos (pode não existir em versões antigas)
    const costForm = document.getElementById('form-add-cost');
    if (costForm) {
        costForm.addEventListener('submit', handleAddCost);
    }

    // Botão exportar Excel
    const exportCostsBtn = document.getElementById('btn-export-costs-excel');
    if (exportCostsBtn) {
        exportCostsBtn.addEventListener('click', handleExportCostsExcel);
    }

    // --- Lógica do Menu Mobile ---
    const menuToggle = document.getElementById('mobile-menu-toggle');
    const mainContent = document.querySelector('.main-content');
    const sidebar = document.getElementById('sidebar');
    if (menuToggle) {
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            document.body.classList.toggle('mobile-menu-open');
        });
    }

    // Mobile: o menu nunca deve bloquear o scroll da página.
    // Qualquer toque fora da sidebar fecha o menu e devolve a navegação normal.
    document.addEventListener('click', (e) => {
        if (!document.body.classList.contains('mobile-menu-open')) return;
        const clickedInsideSidebar = sidebar && sidebar.contains(e.target);
        const clickedMenuButton = menuToggle && menuToggle.contains(e.target);
        if (!clickedInsideSidebar && !clickedMenuButton) {
            document.body.classList.remove('mobile-menu-open');
        }
    });

    if (mainContent) {
        mainContent.addEventListener('touchmove', () => {
            // Mantém o scroll vertical natural no mobile, mesmo se a classe do menu ficar activa por algum estado antigo.
            document.body.style.overflowY = 'auto';
        }, { passive: true });
    }
    // Fecha o menu mobile ao clicar num item (em ecrãs pequenos)
    document.querySelectorAll('.sidebar-menu .menu-item a').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth < 992 && !item.parentElement.classList.contains('has-submenu')) {
                document.body.classList.remove('mobile-menu-open');
            }
        });
    });
}

/* --- Lógica de Navegação (Router) --- */

/**
 * Mostra uma página de conteúdo e esconde as outras.
 * Chama as funções de carregamento de dados necessárias.
 * @param {string} pageId - ID do elemento da página (ex: 'visao-geral')
 * @param {string} navId - ID do link da sidebar (ex: 'nav-visao-geral')
 * @param {string} title - O título a mostrar no header
 */
function showPage(pageId, navId, title) {
    // Limpa recursos de outras páginas
    destroyFormMap(); // (adminMap.js)
    destroyLiveMap(); // (adminMap.js)
    destroyCharts();  // (adminCharts.js)     
    
    // Esconde todas as páginas e desativa todos os links
    document.querySelectorAll('.content-page').forEach(page => page.classList.add('hidden'));
    document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => item.classList.remove('active'));
    
    // Mostra a página e ativa o link corretos
    const pageToShow = document.getElementById(pageId);
    if (pageToShow) pageToShow.classList.remove('hidden');
    
    const navLink = document.getElementById(navId);
    if (navLink) navLink.classList.add('active');
    
    document.getElementById('main-title').innerText = title;
    
    // Carrega os dados específicos da página
    switch (pageId) {
        case 'visao-geral':
            loadOverviewStats();
            loadFinancialStats(document.getElementById('financial-period-select')?.value || 'month');
            initServicesChart(false);
            break;
        case 'custos':
            loadCostsDashboardSummary();
            loadCostAssignmentOptions();
            break;
        case 'gestao-motoristas':
            loadDrivers();
            loadVehicles();
            loadVehiclesIntoSelects();
            break;
        case 'entregas-activas':
            loadActiveDeliveries();
            break;
        case 'historico':
            loadHistory();
            break;
        case 'gestao-clientes':
            loadClients();
            break;
        case 'mapa-tempo-real':
            initializeLiveMap();
            break;
        case 'cargos':
            loadDrivers();
            loadClients();
            loadVehicles();
            loadVehiclesIntoSelects();
            break;
        case 'configuracoes':
            document.getElementById('form-change-password').reset();
            break;
    }
}

/**
 * Controlador para mostrar o formulário de nova entrega.
 * @param {string} serviceType - O tipo de serviço (ex: 'doc', 'farma')
 */
function showServiceForm(serviceType) {
    const titles = {
        'doc': 'Nova Tramitação de Documentos',
        'farma': 'Novo Pedido Farmacêutico',
        'carga': 'Novo Transporte de Carga',
        'rapido': 'Novo Delivery Rápido',
        'restaurante_comida': 'Nova Entrega — Comida de Restaurante',
        'mercadoria_cp': 'Nova Entrega — Mercadoria C/P',
        'refeicao_restaurante_p': 'Nova Entrega — Refeição Restaurante P',
        'outros': 'Outros Serviços'
    };
    showPage('form-nova-entrega', null, titles[serviceType] || 'Nova Entrega');
    
    // Prepara o formulário
    removeImage(); // (ui.js)
    resetDeliveryForm();
    document.getElementById('service-type').value = serviceType;
    loadClientsIntoDropdown(); // (adminApi.js)
    
    // Atraso para garantir que o elemento #map está visível antes de inicializar
    setTimeout(() => {
        initializeFormMap(); // (adminMap.js)
        if (window.TragoGeoPricing) {
            window.TragoGeoPricing.initDeliveryPricingForm();
        }
    }, 100);
}

/* --- Lógica de Supabase Realtime --- */
function connectSocket() {
    const token = getAuthToken('admin');
    if (!token) return;

    // Função auxiliar para saber qual página está ativa
    const activePage = () => {
        const page = document.querySelector('.content-page:not(.hidden)');
        return page ? page.id : null;
    };

    function refreshOperationalViews({ includeHistory = false, includeFinancials = false } = {}) {
        const page = activePage();
        if (page === 'entregas-activas') loadActiveDeliveries();
        if (page === 'gestao-motoristas') loadDrivers();
        if (page === 'historico' && includeHistory) loadHistory();
        if (page === 'visao-geral') {
            loadOverviewStats();
            if (includeFinancials) loadFinancialStats(document.getElementById('financial-period-select')?.value || 'month');
            initServicesChart(false);
        }
    }

    function handleRealtimeEvent(event, data = {}) {
        switch (event) {
            case 'order_pending':
                addAdminNotification({
                    id: `order_pending_${data.orderId || data.id || Date.now()}`,
                    type: 'order',
                    title: 'Novo pedido recebido',
                    message: data.clientName ? `Pedido de ${data.clientName} aguardando atribuição.` : 'Há um novo pedido aguardando controlo operacional.',
                    createdAt: new Date().toISOString()
                });
                refreshOperationalViews();
                break;

            case 'orders_changed':
            case 'pickup_started':
            case 'pickup_completed':
            case 'delivery_started':
                refreshOperationalViews();
                break;

            case 'payment_confirmation_pending':
                addAdminNotification({
                    id: `payment_pending_${data.id || data.orderId || Date.now()}`,
                    type: 'payment',
                    title: 'Pagamento por confirmar',
                    message: data.amount ? `Entrega aguardando confirmação de pagamento: ${Number(data.amount).toFixed(2)} MZN.` : 'Uma entrega aguarda confirmação de pagamento/finalização.',
                    createdAt: new Date().toISOString()
                });
                checkAdminPaymentPendingAlerts(true);
                refreshOperationalViews();
                break;

            case 'order_canceled':
                refreshOperationalViews({ includeHistory: true });
                break;

            case 'delivery_completed':
                addAdminNotification({
                    id: `delivery_completed_${data.orderId || data.id || Date.now()}`,
                    type: 'success',
                    title: 'Entrega finalizada',
                    message: 'Uma entrega foi finalizada e enviada para o histórico.',
                    createdAt: new Date().toISOString()
                });
                refreshOperationalViews({ includeHistory: true, includeFinancials: true });
                break;

            case 'driver_status_changed':
                refreshOperationalViews();
                if (activePage() === 'mapa-tempo-real') {
                    if (typeof updateDriverMarkerStatus === 'function') updateDriverMarkerStatus(data);
                    if (typeof fetchLiveDriverLocations === 'function') fetchLiveDriverLocations();
                }
                break;

            case 'driver_location_broadcast':
                if (typeof updateDriverMarker === 'function') updateDriverMarker(data);
                break;

            case 'driver_disconnected_broadcast':
                if (typeof removeDriverMarker === 'function') removeDriverMarker(data);
                break;

            default:
                console.log('[TragoRealtime] Evento admin recebido:', event, data);
        }
    }

    const subscription = window.TragoRealtime?.connectAdminRealtime({
        onEvent: handleRealtimeEvent
    });

    // Mantém uma interface mínima compatível com código antigo que ainda chama socket.emit().
    socket = {
        connected: Boolean(subscription),
        emit(event) {
            if (event === 'admin_request_all_locations' && typeof fetchLiveDriverLocations === 'function') {
                fetchLiveDriverLocations();
            }
        },
        disconnect() {
            subscription?.unsubscribe?.();
        }
    };
}

/* --- Lógica Auxiliar (UI Helpers) --- */

/**
 * Preenche o formulário de entrega quando um cliente registado é selecionado.
 */
function handleClientSelect(e) {
    const selectedClientId = e.target.value;
    const client = clientCache.find(c => c._id === selectedClientId);
    
    if (client) {
        document.getElementById('client-name').value = client.nome;
        document.getElementById('client-phone1').value = client.telefone;
        document.getElementById('client-phone2').value = ''; // Limpa o tel. alternativo
        document.getElementById('delivery-client-id').value = client._id;
        const paymentMethodEl = document.getElementById('payment-method');
        if (paymentMethodEl) {
            if (client.billing_type === 'postpaid') {
                paymentMethodEl.value = 'postpaid_credit';
                showCustomAlert('Cliente pós-pago', `Este cliente usa crédito mensal. Saldo disponível: ${Number(client.credit_balance || 0).toFixed(2)} MZN.`, 'info');
            } else if (paymentMethodEl.value === 'postpaid_credit') {
                paymentMethodEl.value = 'cash';
            }
        }
        
        // Torna os campos read-only
        document.getElementById('client-name').readOnly = true;
        document.getElementById('client-phone1').readOnly = true;
        
    } else {
        // Se selecionar "-- Selecione --", limpa e reativa os campos
        resetDeliveryForm();
    }
}

/**
 * Limpa o formulário de entrega e reativa os campos.
 */
function resetDeliveryForm() {
    document.getElementById('delivery-form').reset();
    document.getElementById('delivery-client-id').value = ''; 
    
    document.getElementById('client-name').readOnly = false;
    document.getElementById('client-phone1').readOnly = false;

    ['pickup-lat', 'pickup-lng', 'delivery-lat', 'delivery-lng', 'route-distance-km', 'route-duration-min', 'delivery-fee', 'final-order-price'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    if (window.TragoGeoPricing) window.TragoGeoPricing.resetDeliveryPricing();
}

/**
 * Callback para a zona de perigo (Apagar Histórico).
 */
function handleDeleteOldHistoryClick() {
    const confirmWord = 'APAGAR';
    
    openConfirmationModal({ // (adminModals.js)
        title: "Apagar Histórico Antigo?",
        message: `Esta ação é irreversível. Todas as encomendas concluídas com mais de 30 dias serão permanentemente apagadas.\n\nPara confirmar, digite <b>${confirmWord}</b> no campo abaixo.`,
        confirmText: confirmWord,
        onConfirm: handleDeleteOldHistory // (adminApi.js)
    });
}

function applyDriverTypeCommissionLock(typeSelectId, commissionInputId) {
    const typeEl = document.getElementById(typeSelectId);
    const commissionEl = document.getElementById(commissionInputId);
    if (!typeEl || !commissionEl) return;
    if (typeEl.value === 'official') {
        commissionEl.value = '0';
        commissionEl.disabled = true;
    } else {
        commissionEl.disabled = false;
        if (!commissionEl.value || Number(commissionEl.value) === 0) commissionEl.value = '20';
    }
}

let lastAdminPaymentAlertAt = 0;
async function checkAdminPaymentPendingAlerts(force = false) {
    try {
        const response = await fetch(`${API_URL}/api/orders/payment-pending`, { headers: getAuthHeaders('admin') });
        if (!response.ok) return;
        const data = await response.json();
        const total = Number(data.total || 0);
        const now = Date.now();
        if (total > 0 && (force || now - lastAdminPaymentAlertAt > 120000)) {
            lastAdminPaymentAlertAt = now;
            showCustomAlert('Pagamentos por confirmar', `${total} entrega(s) aguardam confirmação de pagamento/finalização.`, 'info');
        }
    } catch (error) {
        console.warn('Falha ao verificar pagamentos pendentes:', error);
    }
}
setInterval(() => checkAdminPaymentPendingAlerts(false), 120000);


const ADMIN_NOTIFICATIONS_STORAGE_KEY = 'trago_admin_notifications_v1';
const ADMIN_NOTIFICATIONS_READ_STORAGE_KEY = 'trago_admin_notifications_read_v1';
let adminNotifications = [];
let readAdminNotificationIds = new Set();
let adminNotificationsPanelOpen = false;

function initAdminNotificationCenter() {
    loadStoredAdminNotifications();
    renderAdminNotifications();

    const toggle = document.getElementById('notifications-toggle');
    const panel = document.getElementById('notifications-panel');
    const markAllBtn = document.getElementById('mark-all-notifications-read');

    if (toggle && panel) {
        toggle.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            adminNotificationsPanelOpen = !adminNotificationsPanelOpen;
            panel.classList.toggle('hidden', !adminNotificationsPanelOpen);
            toggle.setAttribute('aria-expanded', adminNotificationsPanelOpen ? 'true' : 'false');
        });
    }

    if (markAllBtn) {
        markAllBtn.addEventListener('click', (event) => {
            event.preventDefault();
            markAllAdminNotificationsAsRead();
        });
    }

    document.addEventListener('click', (event) => {
        if (!adminNotificationsPanelOpen) return;
        const shell = document.querySelector('.notifications-shell');
        if (shell && shell.contains(event.target)) return;
        adminNotificationsPanelOpen = false;
        panel?.classList.add('hidden');
        toggle?.setAttribute('aria-expanded', 'false');
    });

    refreshAdminNotificationSources();
    setInterval(refreshAdminNotificationSources, 60000);
}

function loadStoredAdminNotifications() {
    try {
        const raw = localStorage.getItem(ADMIN_NOTIFICATIONS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        adminNotifications = Array.isArray(parsed) ? parsed.filter((item) => !item.read) : [];
        const readRaw = localStorage.getItem(ADMIN_NOTIFICATIONS_READ_STORAGE_KEY);
        const readParsed = readRaw ? JSON.parse(readRaw) : [];
        readAdminNotificationIds = new Set(Array.isArray(readParsed) ? readParsed : []);
    } catch (_) {
        adminNotifications = [];
        readAdminNotificationIds = new Set();
    }
}

function persistAdminNotifications() {
    const cleanList = adminNotifications
        .filter((item) => !item.read)
        .slice(0, 80);
    localStorage.setItem(ADMIN_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(cleanList));
    localStorage.setItem(ADMIN_NOTIFICATIONS_READ_STORAGE_KEY, JSON.stringify(Array.from(readAdminNotificationIds).slice(-200)));
}

function addAdminNotification(notification) {
    if (!notification || !notification.id) return;
    if (readAdminNotificationIds.has(notification.id)) return;
    const exists = adminNotifications.some((item) => item.id === notification.id && !item.read);
    if (exists) return;
    adminNotifications.unshift({
        id: notification.id,
        type: notification.type || 'info',
        title: notification.title || 'Notificação',
        message: notification.message || '',
        createdAt: notification.createdAt || new Date().toISOString(),
        read: false
    });
    persistAdminNotifications();
    renderAdminNotifications();
}

function markAdminNotificationAsRead(id) {
    readAdminNotificationIds.add(id);
    adminNotifications = adminNotifications.map((item) => item.id === id ? { ...item, read: true } : item).filter((item) => !item.read);
    persistAdminNotifications();
    renderAdminNotifications();
}

function markAllAdminNotificationsAsRead() {
    adminNotifications.forEach((item) => readAdminNotificationIds.add(item.id));
    adminNotifications = [];
    persistAdminNotifications();
    renderAdminNotifications();
}

function renderAdminNotifications() {
    const list = document.getElementById('notifications-list');
    const badge = document.getElementById('notifications-count');
    if (!list || !badge) return;

    const unread = adminNotifications.filter((item) => !item.read);
    badge.textContent = String(unread.length);
    badge.classList.toggle('hidden', unread.length === 0);

    if (!unread.length) {
        list.innerHTML = '<div class="notification-empty">Sem notificações por ler.</div>';
        return;
    }

    list.innerHTML = unread.map((item) => {
        const date = new Date(item.createdAt);
        const time = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-MZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const icon = item.type === 'payment' ? 'fa-money-check-alt' : item.type === 'order' ? 'fa-box' : item.type === 'success' ? 'fa-check-circle' : 'fa-bell';
        return `
            <div class="notification-item notification-${item.type}">
                <div class="notification-icon"><i class="fas ${icon}"></i></div>
                <div class="notification-content">
                    <strong>${item.title}</strong>
                    <p>${item.message}</p>
                    <small>${time}</small>
                </div>
                <button type="button" class="btn-link-small notification-read-btn" onclick="markAdminNotificationAsRead('${String(item.id).replace(/[^a-zA-Z0-9_:-]/g, '')}')">Marcar como lida</button>
            </div>
        `;
    }).join('');
}

async function refreshAdminNotificationSources() {
    const token = getAuthToken('admin');
    if (!token) return;

    try {
        const [activeResp, paymentResp] = await Promise.all([
            fetch(`${API_URL}/api/orders/active`, { headers: getAuthHeaders('admin') }),
            fetch(`${API_URL}/api/orders/payment-pending`, { headers: getAuthHeaders('admin') })
        ]);

        if (activeResp.ok) {
            const activeData = await activeResp.json();
            (activeData.orders || []).forEach((order) => {
                if (order.status === 'pendente') {
                    addAdminNotification({
                        id: `order_pending_${order._id || order.id}`,
                        type: 'order',
                        title: 'Pedido pendente',
                        message: `#${String(order._id || order.id).slice(-6)} · ${order.client_name || 'Cliente'} aguarda atribuição.`,
                        createdAt: order.createdAt || order.created_at || new Date().toISOString()
                    });
                }
            });
        }

        if (paymentResp.ok) {
            const paymentData = await paymentResp.json();
            (paymentData.orders || []).forEach((order) => {
                addAdminNotification({
                    id: `payment_pending_${order._id || order.id}`,
                    type: 'payment',
                    title: 'Pagamento pendente',
                    message: `#${String(order._id || order.id).slice(-6)} · confirmar ${Number(order.price || 0).toFixed(2)} MZN recebido pelo motorista.`,
                    createdAt: order.payment_confirmation_requested_at || order.updatedAt || order.updated_at || new Date().toISOString()
                });
            });
        }
    } catch (error) {
        console.warn('Falha ao atualizar notificações:', error.message || error);
    }
}

/**
 * Carrega o perfil do administrador logado.
 */
async function loadAdminProfile() {
    try {
        const response = await fetch(`${API_URL}/api/auth/me`, {
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders('admin')
            }
        });

        if (!response.ok) {
            throw new Error('Sessão inválida');
        }

        const data = await response.json();

        const adminNameEl = document.getElementById('admin-name');
        if (adminNameEl) {
            adminNameEl.textContent = data.nome;
        }
        const adminNameHeaderEl = document.getElementById('admin-name-header');
        if (adminNameHeaderEl) {
            adminNameHeaderEl.textContent = data.nome;
        }

    } catch (error) {
        console.error('Erro ao carregar perfil do admin:', error);
        handleLogout('admin');
    }
}

/**
 * Converte tabelas tradicionais em cartões legíveis no mobile.
 * A função mantém o layout desktop intacto e apenas injeta data-label nos TDs,
 * permitindo ao CSS mostrar cada linha como um cartão em ecrãs pequenos.
 */
function enhanceResponsiveTable(table) {
    if (!table) return;

    const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
    if (!headers.length) return;

    table.querySelectorAll('tbody tr').forEach(row => {
        Array.from(row.children).forEach((cell, index) => {
            if (cell.tagName !== 'TD') return;
            if (cell.hasAttribute('colspan')) return;
            cell.setAttribute('data-label', headers[index] || '');
        });
    });
}

function enhanceAllResponsiveTables(root = document) {
    root.querySelectorAll('table').forEach(enhanceResponsiveTable);
}

function installResponsiveTableObserver() {
    enhanceAllResponsiveTables();

    const target = document.querySelector('.content-area') || document.body;
    let scheduled = false;

    const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            enhanceAllResponsiveTables(target);
            scheduled = false;
        });
    });

    observer.observe(target, {
        childList: true,
        subtree: true
    });
}
