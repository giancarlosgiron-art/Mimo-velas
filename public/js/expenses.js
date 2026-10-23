// ── Expenses Module ──────────────────────────────────────────

const EXPENSE_CATEGORIES = {
  Materiales: { icon: '📦', color: '#3b82f6' },
  Empaque:    { icon: '🎁', color: '#8b5cf6' },
  Transporte: { icon: '🚚', color: '#f59e0b' },
  Otros:      { icon: '✨', color: '#6b7280' },
};

async function loadExpenses() {
  try {
    const { expenses, monthTotal, byCategory } = await API.expenses();
    renderExpenses(expenses, monthTotal, byCategory);
  } catch (err) {
    toast('Error cargando gastos: ' + err.message, 'error');
  }
}

function renderExpenses(expenses, monthTotal, byCategory) {
  const el = document.getElementById('expenses-content');
  const monthName = new Date().toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });

  // Stats row
  const totalAll = expenses.reduce((s, e) => s + e.amount, 0);

  el.innerHTML = `
    <!-- Stats -->
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr));margin-bottom:24px">
      <div class="stat-card danger">
        <span class="stat-icon">📅</span>
        <div class="stat-label">Gastos este mes</div>
        <div class="stat-value">${fmt(monthTotal)}</div>
        <div class="stat-change neutral" style="text-transform:capitalize">${monthName}</div>
      </div>
      ${byCategory.map(c => {
        const cat = EXPENSE_CATEGORIES[c.category] || EXPENSE_CATEGORIES.Otros;
        return `
          <div class="stat-card">
            <span class="stat-icon">${cat.icon}</span>
            <div class="stat-label">${c.category}</div>
            <div class="stat-value" style="font-size:1.3rem">${fmt(c.total)}</div>
            <div class="stat-change neutral">${c.count} registro${c.count !== 1 ? 's' : ''}</div>
          </div>`;
      }).join('')}
    </div>

    <!-- Expense List -->
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Todos los gastos</div>
          <div class="card-subtitle">${expenses.length} registros</div>
        </div>
        <div class="filters">
          <select class="form-control" style="width:150px" id="exp-filter-cat" onchange="filterExpenses()">
            <option value="">Todas las categorías</option>
            ${Object.entries(EXPENSE_CATEGORIES).map(([k, v]) =>
              `<option value="${k}">${v.icon} ${k}</option>`
            ).join('')}
          </select>
        </div>
      </div>

      <div id="expenses-table-body">
        ${renderExpenseRows(expenses)}
      </div>

      ${expenses.length ? `
        <div style="padding:14px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:24px;font-size:0.875rem">
          <span style="color:var(--text-muted)">Total mostrado</span>
          <span class="font-bold text-danger" style="color:var(--danger)">${fmt(totalAll)}</span>
        </div>` : ''}
    </div>
  `;
}

function renderExpenseRows(expenses) {
  if (!expenses.length) {
    return `
      <div class="empty-state">
        <div class="empty-icon">💸</div>
        <h3>Sin gastos registrados</h3>
        <p>Lleva un control claro de todos los egresos del negocio</p>
        <button class="btn btn-primary" onclick="openExpenseModal()">+ Registrar primer gasto</button>
      </div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Categoría</th>
            <th>Descripción</th>
            <th style="text-align:right">Monto</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${expenses.map(e => {
            const cat = EXPENSE_CATEGORIES[e.category] || EXPENSE_CATEGORIES.Otros;
            return `
              <tr>
                <td style="white-space:nowrap;color:var(--text-secondary);font-size:0.82rem">
                  ${fmtDate(e.date + 'T12:00:00')}
                </td>
                <td>
                  <span class="badge" style="background:${cat.color}22;color:${cat.color};border:1px solid ${cat.color}44">
                    ${cat.icon} ${e.category}
                  </span>
                </td>
                <td style="font-size:0.875rem">${e.description}</td>
                <td style="text-align:right;font-weight:700;color:var(--danger);white-space:nowrap">
                  -${fmt(e.amount)}
                </td>
                <td>
                  <button class="btn btn-ghost btn-sm btn-icon"
                          onclick="confirmDeleteExpense(${e.id}, '${e.description.replace(/'/g, "\\'")}')"
                          title="Eliminar">🗑️</button>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

async function filterExpenses() {
  const category = document.getElementById('exp-filter-cat')?.value || '';
  try {
    const { expenses } = await API.expenses(category ? { category } : {});
    document.getElementById('expenses-table-body').innerHTML = renderExpenseRows(expenses);
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ── Modal ─────────────────────────────────────────
function openExpenseModal() {
  // Default date to today
  document.getElementById('exp-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('exp-amount').value = '';
  document.getElementById('exp-description').value = '';
  document.getElementById('exp-category').value = 'Materiales';
  openModal('expense-modal');
  setTimeout(() => document.getElementById('exp-amount').focus(), 100);
}

async function saveExpense() {
  const date        = document.getElementById('exp-date').value;
  const amount      = document.getElementById('exp-amount').value;
  const description = document.getElementById('exp-description').value.trim();
  const category    = document.getElementById('exp-category').value;

  if (!date || !amount || !description) {
    toast('Completa todos los campos', 'warning');
    return;
  }
  if (parseFloat(amount) <= 0) {
    toast('El monto debe ser mayor a 0', 'warning');
    return;
  }

  try {
    await API.createExpense({ date, amount, description, category });
    toast('Gasto registrado ✓', 'success');
    closeModal('expense-modal');
    await loadExpenses();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function confirmDeleteExpense(id, description) {
  if (!confirm(`¿Eliminar el gasto "${description}"?`)) return;
  try {
    await API.deleteExpense(id);
    toast('Gasto eliminado', 'info');
    await loadExpenses();
  } catch (err) {
    toast(err.message, 'error');
  }
}
