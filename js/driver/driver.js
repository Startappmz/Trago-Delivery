/*
 * Ficheiro: js/driver/driver.js
 * (CORREÇÃO 7: Link do Google Maps - http://googleusercontent.com/maps)
 */

/* --- PONTO DE ENTRADA (Entry Point) --- */
document.addEventListener('DOMContentLoaded', () => {
    checkAuth('driver');
    connectDriverSocket();
    attachDriverEventListeners();
    loadDriverProfileVisibility();
    setInterval(() => checkDriverPaymentPendingAlerts(false), 120000);
    
    // Carrega a página inicial
    showDriverPage('lista-entregas');
});

/**
 * Anexa todos os event listeners do painel do motorista.
 */
function attachDriverEventListeners() {
    
    // --- Lógica do Menu Mobile ---
    const menuToggle = document.getElementById('mobile-driver-menu-toggle');
    const mobileMenu = document.getElementById('driver-mobile-nav');
    const mainContent = document.querySelector('.motorista-main');

    if (menuToggle && mobileMenu) {
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation(); 
            mobileMenu.classList.toggle('open');
        });
        mainContent.addEventListener('click', () => {
            if (mobileMenu.classList.contains('open')) {
                mobileMenu.classList.remove('open');
            }
        });
    }
    
    // Links do menu mobile
    document.getElementById('mobile-nav-ganhos')?.addEventListener('click', (e) => {
        e.preventDefault();
        showDriverPage('meus-ganhos');
        mobileMenu.classList.remove('open');
    });
    document.getElementById('mobile-nav-config')?.addEventListener('click', (e) => {
        e.preventDefault();
        showDriverPage('configuracoes-motorista');
        mobileMenu.classList.remove('open');
    });
    document.getElementById('mobile-nav-logout')?.addEventListener('click', (e) => {
        e.preventDefault();
        handleLogout('driver');
    });

    // Botão de Logout (Desktop)
    document.getElementById('driver-logout')?.addEventListener('click', (e) => {
        e.preventDefault();
        handleLogout('driver');
    });
    
    // Botão de Configurações (Desktop)
    document.getElementById('driver-settings')?.addEventListener('click', () => {
        showDriverPage('configuracoes-motorista');
    });
    
    // Botão de Ganhos (Desktop)
    document.getElementById('driver-earnings')?.addEventListener('click', () => {
        showDriverPage('meus-ganhos');
    });
    
    // Botões "Voltar"
    document.getElementById('btn-voltar-lista')?.addEventListener('click', () => {
        showDriverPage('lista-entregas');
    });
    document.getElementById('btn-voltar-lista-config')?.addEventListener('click', () => {
        showDriverPage('lista-entregas');
    });
    document.getElementById('btn-voltar-lista-ganhos')?.addEventListener('click', () => {
        showDriverPage('lista-entregas');
    });

    // Botões do Modal de Alerta
    document.getElementById('btn-close-alert')?.addEventListener('click', closeCustomAlert);
    document.getElementById('btn-ok-alert')?.addEventListener('click', closeCustomAlert);
    
    // Listener de Notificação (socket -> driver.js recarrega lista)
    document.addEventListener('nova_entrega', () => {
        console.log('Evento "nova_entrega" recebido. A recarregar a lista...');
        const listaSection = document.getElementById('lista-entregas');
        if (listaSection && !listaSection.classList.contains('hidden')) {
            loadMyDeliveries();
        }
    });

    // Modal de confirmação de pagamento
    document.getElementById('btn-close-payment-confirmation')?.addEventListener('click', closePaymentConfirmationModal);
    document.getElementById('btn-cancel-payment-confirmation')?.addEventListener('click', closePaymentConfirmationModal);
    document.getElementById('btn-confirm-payment-finalize')?.addEventListener('click', submitPaymentConfirmation);

    // Listener do formulário de senha
    document.getElementById('form-change-password-driver')?.addEventListener('submit', handleChangePasswordDriver);
}


/* --- Lógica de Navegação do Motorista --- */

function showDriverPage(pageId) {
    // Esconde todas as secções
    document.getElementById('lista-entregas')?.classList.add('hidden');
    document.getElementById('detalhe-entrega')?.classList.add('hidden');
    document.getElementById('configuracoes-motorista')?.classList.add('hidden');
    document.getElementById('meus-ganhos')?.classList.add('hidden'); 

    // Mostra a secção pedida
    const pageToShow = document.getElementById(pageId);
    if (pageToShow) {
        pageToShow.classList.remove('hidden');
    }

    // Carrega os dados necessários para a página
    if (pageId === 'lista-entregas') {
        loadMyDeliveries();
    }
    if (pageId === 'configuracoes-motorista') {
        document.getElementById('form-change-password-driver')?.reset();
    }
    if (pageId === 'meus-ganhos') {
        loadMyEarnings(); 
    }
    if (pageId === 'detalhe-entrega') {
        requestAnimationFrame(() => window.TragoDriverMap?.invalidate?.());
        setTimeout(() => window.TragoDriverMap?.invalidate?.(), 180);
        setTimeout(() => window.TragoDriverMap?.invalidate?.(), 520);
    }
}


/* --- Lógica de API (GET) --- */

async function loadMyDeliveries() {
    const entregasContainer = document.getElementById('entregas-container');
    if (!entregasContainer) return;

    entregasContainer.innerHTML = '<div class="loading-state">A carregar entregas...</div>';
    try {
        const response = await fetch(`${API_URL}/api/orders/my-deliveries`, {
            method: 'GET',
            headers: getAuthHeaders('driver')
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        entregasContainer.innerHTML = '';
        if (data.orders.length === 0) {
            entregasContainer.innerHTML = '<div class="empty-state">Nenhuma entrega pendente.</div>';
            return;
        }
        data.orders.forEach(order => {
            const card = document.createElement('div');
            card.className = 'entrega-card';
            card.dataset.order = JSON.stringify(order);
            const paymentMap = {
                cash: 'Dinheiro',
                mpesa: 'M-Pesa',
                emola: 'e-Mola',
                mkesh: 'mKesh',
                bank_transfer: 'Transferência bancária',
                pos: 'POS',
                postpaid_credit: 'Cliente Pós-pago / Crédito'
            };
            card.innerHTML = `
                <div class="entrega-card-header">
                    <strong>Pedido #${order._id.slice(-6)}</strong>
                    <span><i class="fas fa-map-marker-alt"></i> ${order.address_text ? order.address_text.split(',')[0] || 'Entrega' : 'Entrega'}</span>
                </div>
                <p><strong>Cliente:</strong> ${order.client_name}</p>
                <p><strong>Serviço:</strong> ${SERVICE_NAMES[order.service_type] || order.service_type}</p>
                <p><strong>Pagamento:</strong> ${paymentMap[order.payment_method] || order.payment_method || '—'}</p>
                <span class="ver-detalhes-btn">${order.status === 'atribuido' ? 'Ver Detalhes' : 'Continuar Entrega'}</span>
            `;
            card.addEventListener('click', () => { 
                showDriverPage('detalhe-entrega');
                fillDetalheEntrega(order); 
            });
            entregasContainer.appendChild(card);
        });
    } catch (error) { 
        console.error('Falha ao carregar entregas:', error); 
        entregasContainer.innerHTML = '<div class="error-state">Erro ao carregar entregas.</div>';
    }

}

async function loadMyEarnings() {
    const formatMZN = (value) => new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' }).format(value);

    const totalGanhosEl = document.getElementById('driver-total-ganhos');
    const totalOrdersEl = document.getElementById('driver-total-entregas');
    const commissionEl = document.getElementById('driver-commission-rate');
    const tableBody = document.getElementById('driver-earnings-table-body');
    
    if (!totalGanhosEl || !totalOrdersEl || !commissionEl || !tableBody) return;

    totalGanhosEl.innerText = '...';
    totalOrdersEl.innerText = '...';
    commissionEl.innerText = '... %';
    tableBody.innerHTML = '<tr><td colspan="4">A carregar...</td></tr>';

    try {
        const response = await fetch(`${API_URL}/api/drivers/my-earnings`, {
            method: 'GET',
            headers: getAuthHeaders('driver')
        });

        if (response.status === 401) {
            return handleLogout('driver');
        }
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        if (data.canViewEarnings === false) {
            totalGanhosEl.innerText = 'Restrito';
            totalOrdersEl.innerText = data.totalOrders || 0;
            commissionEl.innerText = '0 %';
            tableBody.innerHTML = `<tr><td colspan="4">${data.message || 'Motorista oficial não tem acesso a comissões.'}</td></tr>`;
            return;
        }
        
        totalGanhosEl.innerText = formatMZN(data.totalGanhos);
        totalOrdersEl.innerText = data.totalOrders;
        commissionEl.innerText = `${data.commissionRate} %`;
        
        tableBody.innerHTML = ''; 
        if (data.ordersList.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4">Nenhuma entrega concluída este mês.</td></tr>';
            return;
        }
        
        data.ordersList.forEach(order => {
            tableBody.innerHTML += `
                <tr>
                    <td>${new Date(order.timestamp_completed).toLocaleDateString('pt-MZ')}</td>
                    <td>#${order._id.slice(-6)}</td>
                    <td>${formatMZN(order.price)}</td>
                    <td class="value-success">${formatMZN(order.valor_motorista)}</td>
                </tr>
            `;
        });
        
    } catch (error) { 
        console.error('Falha ao carregar ganhos:', error);
        tableBody.innerHTML = '<tr><td colspan="4" class="table-error">Erro ao carregar extrato. Tente novamente.</td></tr>';
    }
}

/* --- Lógica de UI (Mostrar/Esconder Secções) --- */

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatCoord(coord) {
    if (!coord || !Number.isFinite(Number(coord.lat)) || !Number.isFinite(Number(coord.lng))) return '';
    return `${Number(coord.lat).toFixed(5)}, ${Number(coord.lng).toFixed(5)}`;
}

function compactPlaceName(value, fallback = 'Morada não informada') {
    const raw = String(value || '').replace(/\s+/g, ' ').trim();
    if (!raw) return fallback;

    const ignored = [
        /^moçambique$/i, /^mozambique$/i, /^cidade de maputo$/i, /^maputo cidade$/i,
        /^zona sul$/i, /^zona norte$/i, /^zona centro$/i, /^região sul$/i,
        /^distrito municipal/i, /^município/i, /^municipal/i, /^província/i,
        /^\d{3,}[-–]?\d*$/i
    ];

    const cleaned = raw
        .split(',')
        .map(part => part.replace(/[“”"']/g, '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .filter(part => !ignored.some(rx => rx.test(part)))
        .map(part => part.replace(/^Avenida\s+/i, 'Av. '));

    const unique = [];
    for (const part of cleaned) {
        const normalized = part.toLowerCase();
        if (!unique.some(item => item.toLowerCase() === normalized)) unique.push(part);
    }

    let selected = unique.slice(0, 3);
    if (!selected.length) selected = raw.split(',').map(p => p.trim()).filter(Boolean).slice(0, 2);

    let short = selected.join(' · ');
    if (short.length > 72 && selected.length > 2) short = selected.slice(0, 2).join(' · ');
    if (short.length > 72) short = `${short.slice(0, 69).trim()}…`;
    return short || fallback;
}

function buildAddressTitle(fullAddress, fallback) {
    const full = String(fullAddress || '').trim();
    const compact = compactPlaceName(full, fallback);
    const title = full ? ` title="${escapeHtml(full)}"` : '';
    return `<strong class="route-address-title"${title}>${escapeHtml(compact)}</strong>`;
}

function buildDriverRouteSummary(order) {
    const pickupRaw = order.pickup_address_text || order.pickup_address || '';
    const deliveryRaw = order.address_text || order.delivery_address || '';
    const pickupText = buildAddressTitle(pickupRaw, 'Ponto de recolha');
    const deliveryText = buildAddressTitle(deliveryRaw, 'Ponto de entrega');
    const distance = Number(order.route_distance_km || order.distance_km || 0);
    const distanceHtml = Number.isFinite(distance) && distance > 0
        ? `<div class="route-metric-pill"><span>Distância da rota</span><strong>${distance.toFixed(2)} km</strong></div>`
        : '';

    return `
        <div class="route-point-card route-point-pickup">
            <span class="route-marker-dot"><i class="fas fa-box-open"></i></span>
            <div>
                <small>Ponto de recolha</small>
                ${pickupText}
            </div>
        </div>
        <div class="route-connector-line" aria-hidden="true"></div>
        <div class="route-point-card route-point-delivery">
            <span class="route-marker-dot"><i class="fas fa-flag-checkered"></i></span>
            <div>
                <small>Ponto de entrega</small>
                ${deliveryText}
            </div>
        </div>
        ${distanceHtml}
    `;
}

function fillDetalheEntrega(order) {
    const detalheSection = document.getElementById('detalhe-entrega');
    if (!detalheSection) return;

    detalheSection.querySelector('#detalhe-entrega-title').innerText = `Detalhes do Pedido #${order._id.slice(-6)}`;
    
    const img = detalheSection.querySelector('#encomenda-imagem');
    const noImg = detalheSection.querySelector('#no-image-placeholder');
    if (order.image_url) {
        img.src = /^https?:\/\//i.test(order.image_url) ? order.image_url : `${API_URL}${order.image_url}`;
        img.classList.remove('hidden');
        noImg.classList.add('hidden');
    } else {
        img.classList.add('hidden');
        noImg.classList.remove('hidden');
    }

    document.getElementById('detalhe-cliente-nome').innerHTML = `<strong>Nome:</strong> ${escapeHtml(order.client_name || '—')}`;
    document.getElementById('detalhe-cliente-telefone').innerHTML = `<strong>Telefone:</strong> ${escapeHtml(order.client_phone1 || '—')}`;
    document.getElementById('detalhe-pickup-contact').innerHTML = `<strong>Responsável:</strong> ${escapeHtml(order.pickup_contact_name || '—')}`;
    document.getElementById('detalhe-pickup-phone').innerHTML = `<strong>Contacto:</strong> ${escapeHtml(order.pickup_contact_phone || '—')}`;
    document.getElementById('detalhe-pickup-notes').innerHTML = `<strong>Notas:</strong> ${escapeHtml(order.pickup_notes || 'Sem orientações adicionais')}`;
    document.getElementById('detalhe-cliente-endereco').innerHTML = buildDriverRouteSummary(order);
    
    const paymentMap = {
        cash: 'Dinheiro',
        mpesa: 'M-Pesa',
        emola: 'e-Mola',
        mkesh: 'mKesh',
        bank_transfer: 'Transferência bancária',
        pos: 'POS',
        postpaid_credit: 'Cliente Pós-pago / Crédito'
    };

    const paymentEl = document
        .getElementById('detalhe-payment-method')
        ?.querySelector('span');
    if (paymentEl) {
        paymentEl.textContent = paymentMap[order.payment_method] || order.payment_method || '—';
    }

    const coordsP = document.getElementById('detalhe-cliente-coords');
    const pickupCoords = order.pickup_address_coords;
    const deliveryCoords = order.address_coords;
    if (coordsP?.querySelector('span') && pickupCoords?.lat && deliveryCoords?.lat) {
        coordsP.querySelector('span').innerHTML = `<span>Recolha: ${formatCoord(pickupCoords)}</span><span>Entrega: ${formatCoord(deliveryCoords)}</span>`;
        coordsP.classList.remove('hidden');
    } else if (coordsP?.querySelector('span') && deliveryCoords?.lat) {
        coordsP.querySelector('span').innerHTML = `<span>Entrega: ${formatCoord(deliveryCoords)}</span>`;
        coordsP.classList.remove('hidden');
    } else if (coordsP) {
        coordsP.classList.add('hidden');
    }

    requestAnimationFrame(() => {
        window.TragoDriverMap?.renderOrderRoute?.(order);
    });


    // --- Controlo dos botões consoante o ESTADO da encomenda ---
    const btnIniciar = detalheSection.querySelector('#btn-iniciar-entrega');
    const formFinalizacao = detalheSection.querySelector('#form-finalizacao');

    btnIniciar.onclick = null;
    formFinalizacao.onsubmit = null;

    const status = order.status; // valores tipo: 'pendente', 'atribuido', 'recolha_em_progresso', 'recolha_concluida', 'entrega_em_progresso', 'concluido', 'cancelado'

    // 1) Estados iniciais: ainda não começou recolha
    if (status === 'pendente' || status === 'atribuido') {
        btnIniciar.classList.remove('hidden');
        btnIniciar.innerHTML = '<i class="fas fa-play-circle"></i> Iniciar Recolha';
        formFinalizacao.classList.add('hidden');
        btnIniciar.onclick = () => handleStartPickup(order._id);
        return;
    }

    // 2) Recolha em progresso (ou estado legacy 'em_progresso')
    if (status === 'recolha_em_progresso' || status === 'em_progresso') {
        btnIniciar.classList.remove('hidden');
        btnIniciar.innerHTML = '<i class="fas fa-flag-checkered"></i> Concluir Recolha';
        formFinalizacao.classList.add('hidden');
        btnIniciar.onclick = () => handleCompletePickup(order._id);
        return;
    }

    // 3) Recolha concluída -> pronto para iniciar entrega
    if (status === 'recolha_concluida') {
        btnIniciar.classList.remove('hidden');
        btnIniciar.innerHTML = '<i class="fas fa-route"></i> Iniciar Entrega';
        formFinalizacao.classList.add('hidden');
        btnIniciar.onclick = () => handleStartDeliveryPhase(order._id);
        return;
    }

    // 4) Entrega em progresso -> mostra formulário de finalização com código
    if (status === 'entrega_em_progresso') {
        btnIniciar.classList.add('hidden');
        formFinalizacao.classList.remove('hidden');
        formFinalizacao.reset();
        formFinalizacao.onsubmit = (event) => handlePaymentPreview(event, order._id);
        return;
    }

    // 5) Concluído ou cancelado -> nada para fazer
    if (status === 'concluido' || status === 'cancelado') {
        btnIniciar.classList.add('hidden');
        formFinalizacao.classList.add('hidden');
        return;
    }

    // Qualquer outro estado desconhecido -> não mostrar acções
    btnIniciar.classList.add('hidden');
    formFinalizacao.classList.add('hidden');

    
}

function showListaEntregas() {
    showDriverPage('lista-entregas');
}


/* --- Lógica de API (POST/PUT) --- */

async function handleChangePasswordDriver(e) {
    e.preventDefault();
    const form = e.target;
    const submitButton = form.querySelector('button[type="submit"]');

    const senhaAntiga = document.getElementById('driver-pass-antiga').value;
    const senhaNova = document.getElementById('driver-pass-nova').value;
    const senhaConfirmar = document.getElementById('driver-pass-confirmar').value;
    if (senhaNova !== senhaConfirmar) {
        showCustomAlert('Erro', 'As novas senhas não coincidem.', 'error');
        return;
    }

    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> A atualizar...';

    try {
        const response = await fetch(`${API_URL}/api/auth/change-password`, {
            method: 'PUT',
            headers: { ...getAuthHeaders('driver'), 'Content-Type': 'application/json' },
            body: JSON.stringify({ senhaAntiga, senhaNova })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message);
        }
        showCustomAlert('Sucesso!', 'A sua senha foi alterada. Por favor, faça login novamente.', 'success');
        setTimeout(() => {
            handleLogout('driver');
        }, 2500);
    } catch (error) {
        console.error('Falha ao mudar a senha:', error);
        showCustomAlert('Erro', error.message, 'error');
        submitButton.disabled = false;
        submitButton.innerHTML = 'Atualizar Senha';
    }
}

/**
 * 1) Iniciar RECOLHA (central -> cliente)
 */
async function handleStartPickup(orderId) {
    const button = document.getElementById('btn-iniciar-entrega');
    if (!button) return;

    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> A iniciar recolha...';

    try {
        const response = await fetch(`${API_URL}/api/orders/${orderId}/pickup-start`, {
            method: 'POST',
            headers: getAuthHeaders('driver')
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Falha ao iniciar recolha.');
        
        showCustomAlert('Sucesso', 'Recolha iniciada. Dirija-se ao ponto de recolha.', 'success');
        showListaEntregas();
    } catch (error) {
        console.error('Falha ao iniciar recolha:', error);
        showCustomAlert('Erro', error.message, 'error');
    } finally {
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-play-circle"></i> Iniciar Recolha';
    }
}

/**
 * 2) Concluir RECOLHA (chegou ao cliente / recolheu)
 */
async function handleCompletePickup(orderId) {
    const button = document.getElementById('btn-iniciar-entrega');
    if (!button) return;

    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> A concluir recolha...';

    try {
        const response = await fetch(`${API_URL}/api/orders/${orderId}/pickup-complete`, {
            method: 'POST',
            headers: getAuthHeaders('driver')
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Falha ao concluir recolha.');
        
        showCustomAlert('Sucesso', 'Recolha concluída. Pode iniciar a entrega.', 'success');
        showListaEntregas();
    } catch (error) {
        console.error('Falha ao concluir recolha:', error);
        showCustomAlert('Erro', error.message, 'error');
    } finally {
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-flag-checkered"></i> Concluir Recolha';
    }
}

/**
 * 3) Iniciar ENTREGA (cliente -> destino)
 */
async function handleStartDeliveryPhase(orderId) {
    const button = document.getElementById('btn-iniciar-entrega');
    if (!button) return;

    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> A iniciar entrega...';

    try {
        const response = await fetch(`${API_URL}/api/orders/${orderId}/delivery-start`, {
            method: 'POST',
            headers: getAuthHeaders('driver')
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Falha ao iniciar entrega.');
        
        showCustomAlert('Sucesso', 'Entrega iniciada. Siga a rota até ao ponto de entrega.', 'success');
        showListaEntregas();
    } catch (error) {
        console.error('Falha ao iniciar entrega:', error);
        showCustomAlert('Erro', error.message, 'error');
    } finally {
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-route"></i> Iniciar Entrega';
    }
}

/**
 * 4) Concluir ENTREGA (entrega final com código)
 */
let pendingPaymentConfirmation = null;

function closePaymentConfirmationModal() {
    const modal = document.getElementById('payment-confirmation-modal');
    if (modal) modal.classList.add('hidden');
    pendingPaymentConfirmation = null;
}

function openPaymentConfirmationModal({ orderId, verificationCode, preview, notes }) {
    pendingPaymentConfirmation = { orderId, verificationCode, preview, notes };
    const modal = document.getElementById('payment-confirmation-modal');
    const totalEl = document.getElementById('payment-confirmation-total');
    const messageEl = document.getElementById('payment-confirmation-message');
    const methodEl = document.getElementById('payment-confirmation-method');
    const amountGroup = document.getElementById('payment-confirmation-amount-group');
    const amountInput = document.getElementById('payment-confirmed-amount');
    const button = document.getElementById('btn-confirm-payment-finalize');

    const amount = Number(preview.totalToPay || 0).toFixed(2);
    totalEl.textContent = `${amount} MZN`;
    messageEl.textContent = preview.message || 'Código validado. Confirme o pagamento para finalizar.';
    methodEl.textContent = `Método: ${preview.paymentMethodLabel || preview.paymentMethod || '—'}`;
    amountInput.value = preview.requiresImmediatePayment ? '' : amount;
    amountGroup.classList.toggle('hidden', !preview.requiresImmediatePayment);
    button.innerHTML = preview.requiresImmediatePayment
        ? '<i class="fas fa-check-circle"></i> Finalizar e Marcar como Pago'
        : '<i class="fas fa-check-circle"></i> Finalizar Pós-pago';
    modal.classList.remove('hidden');
}

async function handlePaymentPreview(event, orderId) {
    event.preventDefault();
    const form = event.target;
    const submitButton = form.querySelector('button[type="submit"]');
    const verification_code = form.querySelector('#codigo-finalizacao').value.toUpperCase();
    const notes = form.querySelector('#driver-delivery-notes')?.value || '';

    if (verification_code.length < 5) {
        showCustomAlert('Erro', 'O código deve ter 5 caracteres.', 'error');
        return;
    }

    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> A validar código...';

    try {
        const response = await fetch(`${API_URL}/api/orders/${orderId}/payment-preview`, {
            method: 'POST',
            headers: { ...getAuthHeaders('driver'), 'Content-Type': 'application/json' },
            body: JSON.stringify({ verification_code })
        });
        const preview = await response.json();
        if (!response.ok) throw new Error(preview.message || 'Falha ao validar código.');
        openPaymentConfirmationModal({ orderId, verificationCode: verification_code, preview, notes });
    } catch (error) {
        console.error('Falha ao validar pagamento:', error);
        showCustomAlert('Erro', error.message, 'error');
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-check-circle"></i> Finalizar Entrega';
    }
}

async function submitPaymentConfirmation() {
    if (!pendingPaymentConfirmation) return;
    const { orderId, verificationCode, preview, notes } = pendingPaymentConfirmation;
    const button = document.getElementById('btn-confirm-payment-finalize');
    const amountInput = document.getElementById('payment-confirmed-amount');
    const amount = preview.requiresImmediatePayment ? amountInput.value : preview.totalToPay;

    if (preview.requiresImmediatePayment && amount === '') {
        showCustomAlert('Erro', 'Introduza o valor recebido para confirmar.', 'error');
        return;
    }

    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> A finalizar...';

    try {
        const response = await fetch(`${API_URL}/api/orders/${orderId}/complete`, {
            method: 'POST',
            headers: { ...getAuthHeaders('driver'), 'Content-Type': 'application/json' },
            body: JSON.stringify({
                verification_code: verificationCode,
                payment_amount_confirmed: amount,
                driver_delivery_notes: notes
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Falha ao finalizar entrega.');
        closePaymentConfirmationModal();
        showCustomAlert('Sucesso', data.message || 'Entrega finalizada e pagamento confirmado!', 'success');
        showListaEntregas();
    } catch (error) {
        console.error('Falha ao confirmar pagamento:', error);
        showCustomAlert('Erro', error.message, 'error');
    } finally {
        button.disabled = false;
        button.innerHTML = preview.requiresImmediatePayment
            ? '<i class="fas fa-check-circle"></i> Finalizar e Marcar como Pago'
            : '<i class="fas fa-check-circle"></i> Finalizar Pós-pago';
    }
}


async function loadDriverProfileVisibility() {
    try {
        const response = await fetch(`${API_URL}/api/auth/me`, { headers: getAuthHeaders('driver') });
        if (!response.ok) return;
        const data = await response.json();
        const type = data.profile?.driverType || data.profile?.driver_type;
        if (type === 'official') {
            document.getElementById('driver-earnings')?.classList.add('hidden');
            document.getElementById('mobile-nav-ganhos')?.classList.add('hidden');
        }
        const nameEl = document.getElementById('driver-name-header');
        if (nameEl && data.nome) nameEl.textContent = data.nome;
    } catch (error) {
        console.warn('Falha ao carregar perfil do motorista:', error);
    }
}

let lastDriverPaymentAlertAt = 0;
async function checkDriverPaymentPendingAlerts(force = false) {
    try {
        const response = await fetch(`${API_URL}/api/orders/payment-pending`, { headers: getAuthHeaders('driver') });
        if (!response.ok) return;
        const data = await response.json();
        const total = Number(data.total || 0);
        const now = Date.now();
        if (total > 0 && (force || now - lastDriverPaymentAlertAt > 120000)) {
            lastDriverPaymentAlertAt = now;
            showCustomAlert('Pagamento pendente', `${total} entrega(s) aguardam confirmação de pagamento/finalização.`, 'info');
        }
    } catch (error) {
        console.warn('Falha ao verificar pagamentos pendentes:', error);
    }
}

/**
 * Compatibilidade: se algum código antigo chamar handleStartDelivery,
 * encaminhamos para o início da recolha.
 */
async function handleStartDelivery(orderId) {
    return handleStartPickup(orderId);
}
