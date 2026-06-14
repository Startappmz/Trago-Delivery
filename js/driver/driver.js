/*
 * Ficheiro: js/driver/driver.js
 * (CORREÇÃO 7: Link do Google Maps - http://googleusercontent.com/maps)
 */

/* --- PONTO DE ENTRADA (Entry Point) --- */
document.addEventListener('DOMContentLoaded', () => {
    checkAuth('driver');
    connectDriverSocket();
    startLocationTracking();
    attachDriverEventListeners();
    
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
                bank_transfer: 'Transferencia bancaria'
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

    document.getElementById('detalhe-cliente-nome').innerHTML = `<strong>Nome:</strong> ${order.client_name}`;
    document.getElementById('detalhe-cliente-telefone').innerHTML = `<strong>Telefone:</strong> ${order.client_phone1}`;
    document.getElementById('detalhe-cliente-endereco').innerHTML = `<strong>Recolha:</strong> ${order.pickup_address_text || 'N/D'}<br><strong>Entrega:</strong> ${order.address_text || 'N/D'}${order.route_distance_km ? `<br><strong>Distância:</strong> ${Number(order.route_distance_km).toFixed(2)} km` : ''}`;
    
    // ===== PAYMENT METHOD (EXECUTA SEMPRE) =====
    const paymentMap = {
        cash: 'Dinheiro',
        mpesa: 'M-Pesa',
        emola: 'e-Mola',
        mkesh: 'mKesh',
        bank_transfer: 'Transferencia bancaria'
    };

    const paymentEl = document
        .getElementById('detalhe-payment-method')
        ?.querySelector('span');
    if (paymentEl) {
        paymentEl.textContent = paymentMap[order.payment_method] || order.payment_method || '—';
    }

    const coordsP = document.getElementById('detalhe-cliente-coords');
    const mapButton = document.getElementById('btn-google-maps');
    if (order.address_coords && order.address_coords.lat) {
        coordsP.querySelector('span').innerText = `${order.address_coords.lat.toFixed(5)}, ${order.address_coords.lng.toFixed(5)}`;
        coordsP.classList.remove('hidden');
        mapButton.href = `https://www.google.com/maps?q=${order.address_coords.lat},${order.address_coords.lng}`;
        mapButton.classList.remove('hidden');
    } else {
        coordsP.classList.add('hidden');
        mapButton.classList.add('hidden');
    }


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
        formFinalizacao.onsubmit = (event) => handleCompleteDelivery(event, order._id);
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
        
        showCustomAlert('Sucesso', 'Recolha iniciada. Dirija-se ao ponto do cliente.', 'success');
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
        
        showCustomAlert('Sucesso', 'Entrega iniciada. Dirija-se ao ponto de entrega.', 'success');
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
async function handleCompleteDelivery(event, orderId) {
    event.preventDefault();
    const form = event.target;
    const submitButton = form.querySelector('button[type="submit"]');

    const verification_code = form.querySelector('#codigo-finalizacao').value.toUpperCase();
    if (verification_code.length < 5) {
        showCustomAlert('Erro', 'O código deve ter 5 caracteres.', 'error');
        return;
    }

    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> A finalizar...';

    try {
        const response = await fetch(`${API_URL}/api/orders/${orderId}/complete`, {
            method: 'POST',
            headers: { ...getAuthHeaders('driver'), 'Content-Type': 'application/json' },
            body: JSON.stringify({ verification_code })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        showCustomAlert('Sucesso', 'Entrega finalizada com sucesso!', 'success');
        showListaEntregas();
    } catch (error) {
        console.error('Falha ao finalizar entrega:', error);
        showCustomAlert('Erro', error.message, 'error');
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-check-circle"></i> Finalizar Entrega';
    }
}

/**
 * Compatibilidade: se algum código antigo chamar handleStartDelivery,
 * encaminhamos para o início da recolha.
 */
async function handleStartDelivery(orderId) {
    return handleStartPickup(orderId);
}
