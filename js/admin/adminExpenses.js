/*
 * Ficheiro: js/admin/adminExpenses.js
 * Gestão de Custos (Expenses)
 */

async function loadExpenses() {
  const tableBody = document.getElementById('expenses-table-body');
  tableBody.innerHTML = '<tr><td colspan="6">A carregar custos...</td></tr>';

  try {
    const response = await fetch(`${API_URL}/api/expenses`, {
      headers: getAuthHeaders('admin')
    });

    if (response.status === 401) {
    handle401Safely('admin');
    return;
}

    const data = await response.json();
    if (!response.ok) throw new Error(data.message);

    const expenses = data.expenses || [];

    tableBody.innerHTML = '';

    if (expenses.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6">Nenhum custo registado.</td></tr>';
      return;
    }

    expenses.forEach((expense) => {
      const employeeName = expense.employee ? expense.employee.nome : 'N/A';
      const categoryName = EXPENSE_CATEGORIES[expense.category] || expense.category;

      tableBody.innerHTML += `
        <tr>
          <td>${new Date(expense.date).toLocaleDateString('pt-MZ')}</td>
          <td>${categoryName}</td>
          <td>${expense.description}</td>
          <td>${employeeName}</td>
          <td>${expense.amount.toFixed(2)} MZN</td>
          <td>
            <div class="actions-menu">
              <button type="button" class="action-menu-toggle" aria-label="Mais opções"><i class="fas fa-ellipsis-v"></i></button>
              <div class="action-menu-panel" role="menu">
                <button type="button" class="action-menu-item danger" onclick="deleteExpense('${expense._id}')" role="menuitem">
                  <i class="fas fa-trash"></i><span>Eliminar</span>
                </button>
              </div>
            </div>
          </td>
        </tr>
      `;
    });
  } catch (error) {
    console.error('Erro ao carregar custos:', error);
    tableBody.innerHTML = '<tr><td colspan="6">Erro ao carregar custos.</td></tr>';
  }
}

async function handleAddExpense(event) {
  event.preventDefault();

  const category = document.getElementById('expense-category').value;
  const description = document.getElementById('expense-description').value;
  const amount = parseFloat(document.getElementById('expense-amount').value);
  const date = document.getElementById('expense-date').value;
  const employee = document.getElementById('expense-employee').value || null;

  // DEBUG para vermos o que está a ser enviado
  console.log('DEBUG EXPENSE BODY ->', { category, description, amount, date, employee });

  try {
    const response = await fetch(`${API_URL}/api/expenses`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders('admin'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ category, description, amount, date, employee })
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.message);

    showCustomAlert('Sucesso', 'Custo registado com sucesso.', 'success');
    document.getElementById('form-add-expense').reset();
    showAddExpenseForm(false);
    loadExpenses();
  } catch (error) {
    console.error('Erro ao adicionar custo:', error);
    showCustomAlert('Erro', error.message || 'Erro ao adicionar custo.', 'error');
  }
}

async function deleteExpense(expenseId) {
  if (!confirm('Tem certeza que deseja apagar este custo?')) return;

  try {
    const response = await fetch(`${API_URL}/api/expenses/${expenseId}`, {
      method: 'DELETE',
      headers: getAuthHeaders('admin')
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.message);

    showCustomAlert('Sucesso', 'Custo apagado com sucesso.', 'success');
    loadExpenses();
  } catch (error) {
    console.error('Erro ao apagar custo:', error);
    showCustomAlert('Erro', error.message || 'Erro ao apagar custo.', 'error');
  }
}

function showAddExpenseForm(show) {
  const form = document.getElementById('form-add-expense');
  const btn = document.getElementById('btn-show-expense-form');

  if (show) {
    form.classList.remove('hidden');
    btn.classList.add('hidden');
  } else {
    form.classList.add('hidden');
    btn.classList.remove('hidden');
  }
}

async function loadEmployeesForExpense() {
  const select = document.getElementById('expense-employee');
  select.innerHTML = '<option value="">-- Nenhum (geral) --</option>';

  try {
    const [driversRes, managersRes] = await Promise.all([
      fetch(`${API_URL}/api/drivers`, { headers: getAuthHeaders('admin') }),
      fetch(`${API_URL}/api/managers`, { headers: getAuthHeaders('admin') })
    ]);

    const driversData = await driversRes.json();
    const managersData = await managersRes.json();

    const drivers = driversData.drivers || [];
    const managers = managersData.managers || [];

    drivers.forEach((driver) => {
      select.innerHTML += `<option value="${driver._id}">${driver.nome} (Motorista)</option>`;
    });

    managers.forEach((manager) => {
      select.innerHTML += `<option value="${manager._id}">${manager.nome} (Gestor)</option>`;
    });
  } catch (error) {
    console.error('Erro ao carregar funcionários:', error);
  }
}

async function exportFinancialReport() {
  const startDate = document.getElementById('export-start-date').value;
  const endDate = document.getElementById('export-end-date').value;

  if (!startDate || !endDate) {
    showCustomAlert('Atenção', 'Por favor, selecione o período.', 'warning');
    return;
  }

  try {
    const response = await fetch(
      `${API_URL}/api/admin/export-financial?startDate=${startDate}&endDate=${endDate}`,
      {
        headers: getAuthHeaders('admin')
      }
    );

    if (!response.ok) throw new Error('Erro ao gerar relatório.');

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Relatorio_Financeiro_${startDate}_${endDate}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    showCustomAlert('Sucesso', 'Relatório exportado com sucesso.', 'success');
  } catch (error) {
    console.error('Erro ao exportar relatório:', error);
    showCustomAlert('Erro', 'Erro ao exportar relatório.', 'error');
  }
}

const EXPENSE_CATEGORIES = {
  manutencao: 'Manutenção',
  combustivel: 'Combustível',
  emprestimo: 'Empréstimo',
  credito: 'Crédito',
  taxa_trans_levant: 'Taxa Trans/Levant',
  consumiveis: 'Consumíveis',
  despesas_aplicativo: 'Despesas aplicativo',
  diversos: 'Diversos'
};
