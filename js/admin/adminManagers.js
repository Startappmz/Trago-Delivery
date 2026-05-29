/*
 * js/admin/adminManagers.js
 * Gestão de Gestores (Managers)
 *
 * Depende de:
 * - API_URL (global)
 * - getAuthHeaders() (retorna objecto header com Authorization)
 * - showCustomAlert(), handleLogout()
 */

async function loadManagers() {
  const tableBody = document.getElementById('managers-table-body');
  if (!tableBody) return;

  tableBody.innerHTML = '<tr><td colspan="4">A carregar gestores...</td></tr>';

  try {
    const response = await fetch(`${API_URL}/api/managers`, {
      headers: getAuthHeaders('admin')
    });

    if (response.status === 401) {
    handle401Safely('admin');
    return;
}

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Erro ao carregar gestores');

    const managers = data.managers || [];

    tableBody.innerHTML = '';

    if (managers.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="4">Nenhum gestor registado.</td></tr>';
      return;
    }

    managers.forEach((manager) => {
      tableBody.innerHTML += `
        <tr>
          <td>${manager.nome}</td>
          <td>${manager.telefone || 'N/A'}</td>
          <td>${manager.email}</td>
          <td>
            <button class="btn-action-small btn-primary" onclick="handleEditManager('${manager._id}')">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-action-small btn-danger" onclick="deleteManager('${manager._id}')">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    });
  } catch (error) {
    console.error('Erro ao carregar gestores:', error);
    tableBody.innerHTML = '<tr><td colspan="4">Erro ao carregar gestores.</td></tr>';
  }
}

async function handleAddManager(event) {
  event.preventDefault();

  const nome = document.getElementById('manager-name').value.trim();
  const telefone = document.getElementById('manager-phone').value.trim();
  const email = document.getElementById('manager-email').value.trim();
  const password = document.getElementById('manager-password').value;

  console.log('DEBUG MANAGER BODY ->', { nome, telefone, email, passwordPresent: !!password });

  try {
    const response = await fetch(`${API_URL}/api/managers`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders('admin'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ nome, telefone, email, password })
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.message || 'Erro ao criar gestor');

    showCustomAlert('Sucesso', 'Gestor registado com sucesso.', 'success');
    document.getElementById('form-add-manager').reset();
    showAddManagerForm(false);
    loadManagers();
  } catch (error) {
    console.error('Erro ao adicionar gestor:', error);
    showCustomAlert('Erro', error.message || 'Erro ao adicionar gestor.', 'error');
  }
}

async function deleteManager(managerId) {
  if (!confirm('Tem certeza que deseja apagar este gestor?')) return;

  try {
    const response = await fetch(`${API_URL}/api/managers/${managerId}`, {
      method: 'DELETE',
      headers: getAuthHeaders('admin')
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.message || 'Erro ao apagar gestor');

    showCustomAlert('Sucesso', 'Gestor apagado com sucesso.', 'success');
    loadManagers();
  } catch (error) {
    console.error('Erro ao apagar gestor:', error);
    showCustomAlert('Erro', error.message || 'Erro ao apagar gestor.', 'error');
  }
}

function showAddManagerForm(show) {
  const form = document.getElementById('form-add-manager');
  const btn = document.getElementById('btn-show-manager-form');

  if (!form || !btn) return;

  if (show) {
    form.classList.remove('hidden');
    btn.classList.add('hidden');
  } else {
    form.classList.add('hidden');
    btn.classList.remove('hidden');
  }
}

/* ---------------------------
   Edição de gestor (modal)
   --------------------------- */

function openEditManagerModal() {
  document.getElementById('edit-manager-modal').classList.remove('hidden');
}
function closeEditManagerModal() {
  document.getElementById('edit-manager-modal').classList.add('hidden');
  const f = document.getElementById('form-edit-manager');
  if (f) f.reset();
}

async function handleEditManager(managerId) {
  try {
    const res = await fetch(`${API_URL}/api/managers/${managerId}`, {
      headers: getAuthHeaders('admin')
    });
    if (res.status === 401) return handleLogout('admin');

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Erro ao carregar gestor.');

    const manager = data.manager;

    document.getElementById('edit-manager-id').value = manager._id;
    document.getElementById('edit-manager-name').value = manager.nome || '';
    document.getElementById('edit-manager-phone').value = manager.telefone || '';
    document.getElementById('edit-manager-email').value = manager.email || '';
    document.getElementById('edit-manager-password').value = '';

    openEditManagerModal();
  } catch (err) {
    console.error('Erro ao abrir edição de gestor:', err);
    showCustomAlert('Erro', err.message || 'Erro ao carregar gestor.', 'error');
  }
}

async function handleUpdateManager(event) {
  event.preventDefault();

  const id = document.getElementById('edit-manager-id').value;
  const nome = document.getElementById('edit-manager-name').value.trim();
  const telefone = document.getElementById('edit-manager-phone').value.trim();
  const email = document.getElementById('edit-manager-email').value.trim();
  const password = document.getElementById('edit-manager-password').value;

  console.log('DEBUG UPDATE MANAGER ->', { id, nome, telefone, email, passwordPresent: !!password });

  try {
    const payload = { nome, telefone, email };
    if (password && password.length >= 6) payload.password = password;
    

    const res = await fetch(`${API_URL}/api/managers/${id}`, {
      method: 'PUT',
      headers: {
        ...getAuthHeaders('admin'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Erro ao actualizar gestor.');

    showCustomAlert('Sucesso', 'Gestor actualizado com sucesso.', 'success');
    closeEditManagerModal();
    loadManagers();
  } catch (err) {
    console.error('Erro ao actualizar gestor:', err);
    showCustomAlert('Erro', err.message || 'Erro ao actualizar gestor.', 'error');
  }
}

/* Inicialização - liga listeners */
document.addEventListener('DOMContentLoaded', () => {
  const addForm = document.getElementById('form-add-manager');
  if (addForm) addForm.addEventListener('submit', handleAddManager);

  const editForm = document.getElementById('form-edit-manager');
  if (editForm) editForm.addEventListener('submit', handleUpdateManager);

  const btnShow = document.getElementById('btn-show-manager-form');
  if (btnShow) btnShow.addEventListener('click', () => showAddManagerForm(true));

  loadManagers();
});
