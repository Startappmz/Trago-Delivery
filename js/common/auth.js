/*
 * Ficheiro: js/common/auth.js
 *
 * Versão CORRIGIDA E BLINDADA
 * - Protecção contra múltiplos logins
 * - Tratamento de erro 429 (rate limit)
 * - Evita loops e estados inconsistentes
 * - CORREÇÃO: Apenas UMA função getAuthHeaders, sempre com role explícito
 */

let loginInProgress = false;

/**
 * Verifica se um utilizador (admin ou motorista) está autenticado.
 */
function checkAuth(role) {
    console.log('checkAuth iniciado para role:', role);

    let token = null;
    let loginPage = 'login.html';

    if (role === 'admin') {
        token = localStorage.getItem('adminToken');
        loginPage = 'login.html';
    } else if (role === 'driver') {
        token = localStorage.getItem('driverToken');
        loginPage = 'login-motorista.html';
    } else {
        console.error('checkAuth: role inválido:', role);
        return false;
    }

    console.log('Token encontrado:', token);

    const tokenInvalid =
        !token ||
        token === 'undefined' ||
        token === 'null' ||
        token.trim() === '';

    if (tokenInvalid) {
        console.warn('Token inválido → redirecionando');

        setTimeout(() => {
            if (!window.location.pathname.includes(loginPage)) {
                window.location.replace(loginPage);
            }
        }, 50);

        return false;
    }

    console.log('checkAuth: acesso permitido');
    return true;
}

/**
 * Obtém o token correto baseado no role passado como parâmetro.
 * @param {string} role - 'admin' ou 'driver'
 * @returns {string|null} O token ou null
 */
function getAuthToken(role) {
    if (role === 'admin') {
        return localStorage.getItem('adminToken');
    } else if (role === 'driver') {
        return localStorage.getItem('driverToken');
    }
    return null;
}

/**
 * Headers de autenticação seguros.
 * @param {string} role - 'admin' ou 'driver' (obrigatório)
 * @returns {Object} Headers com Authorization
 */
function getAuthHeaders(role) {
    const token = getAuthToken(role);
    if (!token) return {};
    return {
        'Authorization': `Bearer ${token}`
    };
}

/**
 * Processa login (admin ou motorista).
 */
async function handleLogin(e, role) {
    e.preventDefault();

    if (loginInProgress) return;
    loginInProgress = true;

    const form = e.target;
    const submitButton = form.querySelector('button[type="submit"]');

    const email = form.querySelector('#email').value.trim();
    const password = form.querySelector('#password').value;

    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> A entrar...';

    try {
        const response = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, role })
        });

        // RATE LIMIT → parar tudo
        if (response.status === 429) {
            throw new Error(
                'Demasiadas tentativas a partir deste IP. Aguarde alguns minutos antes de tentar novamente.'
            );
        }

        const data = await response.json();

        // 🔥 LOG CRÍTICO (NOVO)
        console.log('LOGIN RESPONSE:', data);

        if (!response.ok) {
            throw new Error(data.message || 'Erro no login');
        }

        // Guardar token conforme o role
        if (role === 'admin') {
            const token =
    data.token ||
    data.accessToken ||
    data.jwt ||
    data?.data?.token ||
    data?.user?.token;

if (!token) {
    console.error('TOKEN NÃO ENCONTRADO NA RESPONSE:', data);
    throw new Error('Falha de autenticação: token não recebido do servidor.');
}

localStorage.setItem('adminToken', token);
            localStorage.setItem('adminName', data.user?.nome || 'Admin');
            window.location.replace('index.html');
        } else {
            const token =
    data.token ||
    data.accessToken ||
    data.jwt ||
    data?.data?.token ||
    data?.user?.token;

if (!token) {
    console.error('TOKEN NÃO ENCONTRADO NA RESPONSE:', data);
    throw new Error('Falha de autenticação: token não recebido do servidor.');
}

localStorage.setItem('driverToken', token);
            localStorage.setItem('driverName', data.user?.nome || 'Motorista');
            window.location.replace('painel-de-entrega.html');
        }

    } catch (error) {
        console.error('Falha no login:', error);

        if (typeof showCustomAlert === 'function') {
            showCustomAlert('Erro de Login', error.message, 'error');
        } else {
            alert(error.message);
        }

    } finally {
        loginInProgress = false;
        submitButton.disabled = false;
        submitButton.innerHTML = role === 'admin' ? 'Entrar' : 'Iniciar Turno';
    }
}

function handle401Safely(role) {
    console.warn('⚠️ 401 recebido — verificação segura');

    const tokenKey = role === 'admin' ? 'adminToken' : 'driverToken';
    const token = localStorage.getItem(tokenKey);

    // 🔒 só faz logout se realmente não houver token
    if (!token) {
        console.warn('🔴 Sem token — logout forçado');
        handleLogout(role);
    } else {
        console.warn('🟡 Token existe — NÃO fazer logout automático');
    }
}

/**
 * Logout seguro.
 * Para motorista, força offline no backend antes de limpar o token.
 */
let logoutInProgress = false;
async function handleLogout(role) {
    if (logoutInProgress) return;
    logoutInProgress = true;

    const token = getAuthToken(role);
    const loginPage = role === 'admin' ? 'login.html' : 'login-motorista.html';

    try {
        if (role === 'driver') {
            await Promise.race([
                window.TragoDriverTracking?.shutdown?.({ keepalive: false }) || Promise.resolve(),
                new Promise((resolve) => setTimeout(resolve, 1800))
            ]);
        }

        if (token) {
            await Promise.race([
                fetch(`${API_URL}/api/auth/logout`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    keepalive: true
                }).catch(() => null),
                new Promise((resolve) => setTimeout(resolve, 1500))
            ]);
        }
    } finally {
        if (role === 'admin') {
            localStorage.removeItem('adminToken');
            localStorage.removeItem('adminName');
        } else {
            localStorage.removeItem('driverToken');
            localStorage.removeItem('driverName');
        }
        window.location.replace(loginPage);
    }
}
