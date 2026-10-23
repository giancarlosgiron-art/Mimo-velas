// ── Dashboard Module ─────────────────────────────────────────
let salesChart = null;

async function loadDashboard() {
  try {
    const [stats, chart, topProducts, recentSales, lowStock, topCustomers, expenses] = await Promise.all([
      API.dashStats(),
      API.dashChart(30),
      API.dashTopProducts(),
      API.dashRecentSales(),
      API.dashLowStock(),
      API.dashTopCustomers(),
      API.expenses(),
    ]);

    renderStats(stats);
    renderSalesChart(chart, 30);
    renderTopProducts(topProducts);
    renderRecentSales(recentSales);
    renderLowStock(lowStock);
    renderTopCustomers(topCustomers);
    renderExpensesSummary(expenses, stats);
  } catch (err) {
    toast('Error cargando dashboard: ' + err.message, 'error');
  }
}

function renderStats(s) {
  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card">
      <span class="stat-icon">💰</span>
      <div class="stat-label">Ventas hoy</div>
      <div class="stat-value">${fmt(s.today.total)}</div>
      <div class="stat-change neutral">${s.today.count} transacciones</div>
    </div>
    <div class="stat-card success">
      <span class="stat-icon">📈</span>
      <div class="stat-label">Ventas del mes</div>
      <div class="stat-value">${fmt(s.month.total)}</div>
      <div class="stat-change ${s.month.growth >= 0 ? 'up' : 'down'}">
        ${s.month.growth >= 0 ? '↑' : '↓'} ${Math.abs(s.month.growth)}% vs mes anterior
      </div>
    </div>
    <div class="stat-card info">
      <span class="stat-icon">💎</span>
      <div class="stat-label">Ganancia del mes</div>
      <div class="stat-value">${fmt(s.profit)}</div>
      <div class="stat-change neutral">${s.month.count} ventas totales</div>
    </div>
    <div class="stat-card warning">
      <span class="stat-icon">📋</span>
      <div class="stat-label">Pedidos pendientes</div>
      <div class="stat-value">${s.pendingOrders}</div>
      <div class="stat-change neutral">
        ${s.lowStock} con stock bajo • ${s.outOfStock} agotados
      </div>
    </div>
    <div class="stat-card">
      <span class="stat-icon">🤍</span>
      <div class="stat-label">Total clientes</div>
      <div class="stat-value">${s.totalCustomers}</div>
      <div class="stat-change neutral">⭐ ${s.vipCustomers} VIP</div>
    </div>
    <div class="stat-card">
      <span class="stat-icon">📦</span>
      <div class="stat-label">Productos activos</div>
      <div class="stat-value">${s.totalProducts}</div>
      <div class="stat-change ${s.outOfStock > 0 ? 'down' : 'neutral'}">
        ${s.outOfStock > 0 ? `⚠️ ${s.outOfStock} agotados` : 'Todo disponible ✓'}
      </div>
    </div>
  `;
}

function renderSalesChart(data, days) {
  const ctx = document.getElementById('salesChart');
  if (!ctx) return;

  // Fill missing days with 0
  const allDates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    allDates.push(d.toISOString().split('T')[0]);
  }
  const dataMap = {};
  data.forEach(d => { dataMap[d.date] = d.total; });
  const labels = allDates.map(d => {
    const dt = new Date(d + 'T12:00:00');
    return dt.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' });
  });
  const values = allDates.map(d => dataMap[d] || 0);

  if (salesChart) salesChart.destroy();

  const isDark = App.theme !== 'light';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const textColor = isDark ? '#8f8fa3' : '#5c5c70';

  salesChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: '#62121D',
        backgroundColor: 'rgba(98,18,29,0.08)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#62121D',
        fill: true,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? '#1a1a20' : '#fff',
          borderColor: '#62121D',
          borderWidth: 1,
          titleColor: textColor,
          bodyColor: isDark ? '#f2f2f5' : '#111',
          padding: 10,
          callbacks: {
            title: items => items[0].label,
            label: item => ` ${fmt(item.raw)}`,
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: textColor, maxTicksLimit: 8, font: { size: 11 } },
          border: { display: false }
        },
        y: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: 11 }, callback: v => '$' + v },
          border: { display: false }
        }
      }
    }
  });
}

// Chart period buttons
document.querySelectorAll('.chart-period-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.chart-period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const days = parseInt(btn.dataset.days);
    const data = await API.dashChart(days);
    renderSalesChart(data, days);
  });
});

function renderTopProducts(products) {
  const el = document.getElementById('top-products-list');
  if (!products.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>Sin ventas registradas aún</p></div>';
    return;
  }
  const max = products[0]?.revenue || 1;
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px">
      ${products.map((p, i) => `
        <div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:0.82rem">
            <span><strong>${i + 1}.</strong> ${p.name}</span>
            <span class="text-accent font-bold">${fmt(p.revenue)}</span>
          </div>
          <div style="background:var(--bg-hover);border-radius:4px;height:6px;overflow:hidden">
            <div style="background:var(--accent);height:100%;width:${(p.revenue/max*100).toFixed(1)}%;border-radius:4px;transition:width 1s ease"></div>
          </div>
          <div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px">${p.units_sold} unidades • Ganancia: ${fmt(p.profit)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderRecentSales(sales) {
  const el = document.getElementById('recent-sales-list');
  if (!sales.length) {
    el.innerHTML = '<div class="empty-state" style="padding:40px"><div class="empty-icon">💳</div><p>Sin ventas registradas</p></div>';
    return;
  }
  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Productos</th>
            <th>Total</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${sales.map(s => `
            <tr>
              <td>
                <div style="font-weight:600;font-size:0.82rem">${s.customer_name || 'Cliente ocasional'}</div>
                <div style="font-size:0.72rem;color:var(--text-muted)">${timeAgo(s.created_at)}</div>
              </td>
              <td style="font-size:0.78rem;color:var(--text-muted);max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.items || '—'}</td>
              <td class="text-accent font-bold">${fmt(s.total)}</td>
              <td>${paymentBadge(s.payment_status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderLowStock(products) {
  const el = document.getElementById('low-stock-list');
  if (!products.length) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.82rem">✅ Todo el stock está bien</div>';
    return;
  }
  el.innerHTML = products.map(p => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border);gap:10px">
      <div style="min-width:0">
        <div style="font-size:0.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
        <div style="font-size:0.72rem;color:var(--text-muted)">${p.category || 'Sin categoría'}</div>
      </div>
      ${stockBadge(p.status, p.stock)}
    </div>
  `).join('');
}

function renderTopCustomers(customers) {
  const el = document.getElementById('top-customers-list');
  if (!customers.length) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.82rem">Sin clientes registrados</div>';
    return;
  }
  el.innerHTML = customers.map((c, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border);cursor:pointer"
         onclick="openCustomerDetail(${c.id})">
      <div style="font-weight:700;color:var(--text-muted);font-size:0.78rem;width:16px">${i + 1}</div>
      <div class="user-avatar" style="width:32px;height:32px;font-size:0.75rem;${c.is_vip ? 'background:rgba(245,158,11,0.15);border-color:var(--warning);color:var(--warning)' : ''}">
        ${getInitials(c.name)}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:0.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${c.name} ${c.is_vip ? '<span class="vip-star">⭐</span>' : ''}
        </div>
        <div style="font-size:0.72rem;color:var(--text-muted)">${c.purchase_count} compras</div>
      </div>
      <div class="text-accent font-bold" style="font-size:0.88rem">${fmt(c.total_spent)}</div>
    </div>
  `).join('');
}

function renderExpensesSummary(expenses, stats) {
  const monthTotal = expenses?.monthTotal || 0;
  const ventas = stats?.month?.total || 0;
  const utilidad = ventas - monthTotal;
  const byCategory = expenses?.byCategory || [];

  // Tarjeta de gastos en stats-grid
  const statsGrid = document.getElementById('stats-grid');
  if (statsGrid && !document.getElementById('expense-stat-card')) {
    const card = document.createElement('div');
    card.id = 'expense-stat-card';
    card.className = 'stat-card danger';
    card.innerHTML = `
      <span class="stat-icon">💸</span>
      <div class="stat-label">Gastos del mes</div>
      <div class="stat-value">${fmt(monthTotal)}</div>
      <div class="stat-change ${utilidad >= 0 ? 'up' : 'down'}">
        Utilidad neta: ${utilidad >= 0 ? '+' : ''}${fmt(utilidad)}
      </div>
    `;
    statsGrid.appendChild(card);
  }

  // Sección Ventas vs Gastos
  const container = document.getElementById('expense-summary-section');
  if (!container) return;
  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">💰 Ventas vs 💸 Gastos — Este mes</div>
        </div>
      </div>
      <div class="card-body">
        <div class="grid-2 mb-4">
          <div class="report-card">
            <div class="stat-label">Ventas del mes</div>
            <div class="stat-value" style="color:var(--accent-light)">${fmt(ventas)}</div>
          </div>
          <div class="report-card">
            <div class="stat-label">Gastos del mes</div>
            <div class="stat-value" style="color:var(--danger)">${fmt(monthTotal)}</div>
          </div>
        </div>
        <div class="report-card ${utilidad >= 0 ? 'success' : 'danger'}" style="margin-bottom:16px">
          <div class="stat-label">Utilidad neta estimada</div>
          <div class="stat-value">${utilidad >= 0 ? '+' : ''}${fmt(utilidad)}</div>
        </div>
        ${byCategory.length ? `
        <div class="stat-label" style="margin-bottom:8px">Gastos por categoría</div>
        ${byCategory.map(g => `
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
            <span>${g.category||'Sin categoría'}</span>
            <span style="font-weight:600;color:var(--danger)">${fmt(g.total)}</span>
          </div>
        `).join('')}
        ` : '<p style="color:var(--text-muted)">No hay gastos registrados este mes.</p>'}
      </div>
    </div>
  `;
}
