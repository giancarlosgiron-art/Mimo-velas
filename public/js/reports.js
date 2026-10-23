// ── Reports Module ───────────────────────────────────────────
let reportsChart = null;

async function loadReports() {
  const fromEl = document.getElementById('report-from');
  const toEl = document.getElementById('report-to');

  // Default: last 30 days
  if (!fromEl.value) {
    const d = new Date(); d.setDate(d.getDate() - 30);
    fromEl.value = d.toISOString().split('T')[0];
  }
  if (!toEl.value) {
    toEl.value = new Date().toISOString().split('T')[0];
  }

  const from = fromEl.value;
  const to = toEl.value;

  try {
    const [summary, byCategory, byProduct, daily, inactive, stagnant] = await Promise.all([
      API.reportSummary(from, to),
      API.reportByCategory(from, to),
      API.reportByProduct(from, to),
      API.reportDaily(30),
      API.reportInactive(),
      API.reportStagnant(),
    ]);

    renderReports(summary, byCategory, byProduct, daily, inactive, stagnant, from, to);
  } catch (err) {
    toast('Error generando reportes: ' + err.message, 'error');
  }
}

function renderReports(summary, byCategory, byProduct, daily, inactive, stagnant, from, to) {
  const el = document.getElementById('reports-content');

  el.innerHTML = `
    <!-- Summary Metrics -->
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr));margin-bottom:24px">
      <div class="stat-card">
        <span class="stat-icon">💰</span>
        <div class="stat-label">Ingresos totales</div>
        <div class="stat-value">${fmt(summary.revenue)}</div>
        <div class="stat-change neutral">${summary.sales} ventas</div>
      </div>
      <div class="stat-card success">
        <span class="stat-icon">📈</span>
        <div class="stat-label">Ganancia neta</div>
        <div class="stat-value">${fmt(summary.profit)}</div>
        <div class="stat-change ${parseFloat(summary.margin) >= 40 ? 'up' : 'neutral'}">Margen: ${summary.margin}%</div>
      </div>
      <div class="stat-card info">
        <span class="stat-icon">🧾</span>
        <div class="stat-label">Ticket promedio</div>
        <div class="stat-value">${fmt(summary.avg_ticket)}</div>
      </div>
      <div class="stat-card warning">
        <span class="stat-icon">🏷️</span>
        <div class="stat-label">Total descuentos</div>
        <div class="stat-value">${fmt(summary.total_discounts)}</div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">💸</span>
        <div class="stat-label">Costo de mercancía</div>
        <div class="stat-value">${fmt(summary.cost)}</div>
      </div>
    </div>

    <!-- Daily Chart -->
    <div class="grid-2 mb-4">
      <div class="card">
        <div class="card-header">
          <div class="card-title">📊 Ventas diarias (30 días)</div>
        </div>
        <div class="card-body">
          <div class="chart-container" style="height:200px"><canvas id="report-chart"></canvas></div>
        </div>
      </div>

      <!-- Payment Methods -->
      <div class="card">
        <div class="card-header"><div class="card-title">💳 Métodos de pago</div></div>
        <div class="card-body">
          ${summary.by_payment?.length ? `
            ${summary.by_payment.map(m => {
              const icons = {cash:'💵', transfer:'📲', card:'💳', partial:'🤝'};
              const labels = {cash:'Efectivo', transfer:'Transferencia', card:'Débito/Crédito', partial:'Abono'};
              const pct = summary.revenue > 0 ? (m.total / summary.revenue * 100).toFixed(1) : 0;
              return `
                <div style="margin-bottom:14px">
                  <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:0.82rem">
                    <span>${icons[m.payment_method] || '💰'} ${labels[m.payment_method] || m.payment_method}</span>
                    <span class="font-bold">${fmt(m.total)} <span class="text-muted">(${pct}%)</span></span>
                  </div>
                  <div style="background:var(--bg-hover);border-radius:4px;height:8px;overflow:hidden">
                    <div style="background:var(--accent);height:100%;width:${pct}%;border-radius:4px"></div>
                  </div>
                  <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px">${m.count} transacciones</div>
                </div>`;
            }).join('')}
          ` : '<p class="text-muted text-sm">Sin datos</p>'}
        </div>
      </div>
    </div>

    <!-- By Category & Product -->
    <div class="grid-2 mb-4">
      <div class="card">
        <div class="card-header"><div class="card-title">📂 Ventas por categoría</div></div>
        <div class="card-body">
          ${byCategory.length ? byCategory.map(c => `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:10px">
              <div style="min-width:0">
                <div style="font-weight:600;font-size:0.85rem">${c.icon} ${c.category}</div>
                <div style="font-size:0.72rem;color:var(--text-muted)">${c.units} unidades vendidas</div>
              </div>
              <div style="text-align:right;flex-shrink:0">
                <div class="text-accent font-bold">${fmt(c.revenue)}</div>
                <div style="font-size:0.72rem;color:var(--success)">+${fmt(c.profit)} ganancia</div>
              </div>
            </div>`).join('') : '<p class="text-muted text-sm">Sin ventas en este período</p>'}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">🏆 Top productos</div></div>
        <div class="card-body">
          ${byProduct.length ? byProduct.map((p, i) => `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
              <div style="font-weight:700;color:var(--text-muted);font-size:0.85rem;width:18px">${i+1}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:0.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
                <div style="font-size:0.72rem;color:var(--text-muted)">${p.units_sold} uds</div>
              </div>
              <div class="text-accent font-bold" style="font-size:0.85rem">${fmt(p.revenue)}</div>
            </div>`).join('') : '<p class="text-muted text-sm">Sin ventas en este período</p>'}
        </div>
      </div>
    </div>

    <!-- Alerts & Insights -->
    <div class="grid-2">
      <div class="card">
        <div class="card-header">
          <div class="card-title">⚠️ Clientes inactivos (30+ días)</div>
          <span class="badge badge-warning">${inactive.length}</span>
        </div>
        <div class="card-body" style="padding:0">
          ${inactive.length ? inactive.map(c => `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border)">
              <div class="user-avatar" style="width:32px;height:32px;font-size:0.75rem">${getInitials(c.name)}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:0.82rem;font-weight:600">${c.name}</div>
                <div style="font-size:0.72rem;color:var(--text-muted)">${c.phone || c.instagram || '—'}</div>
              </div>
              <div style="text-align:right;flex-shrink:0">
                <div style="font-size:0.78rem;color:var(--warning)">
                  ${Math.floor((Date.now()-new Date(c.last_purchase).getTime())/86400000)}d sin comprar
                </div>
                <div style="font-size:0.72rem;color:var(--text-muted)">${fmt(c.total_spent)} total</div>
              </div>
            </div>`).join('') :
          '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.82rem">✅ Todos tus clientes están activos</div>'}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">📦 Productos estancados</div>
          <span class="badge badge-warning">${stagnant.length}</span>
        </div>
        <div class="card-body" style="padding:0">
          ${stagnant.length ? stagnant.map(p => `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border)">
              <div style="flex:1;min-width:0">
                <div style="font-size:0.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
                <div style="font-size:0.72rem;color:var(--text-muted)">${p.sku}</div>
              </div>
              <div style="text-align:right;flex-shrink:0">
                <div style="font-size:0.82rem;font-weight:600">${p.stock} en stock</div>
                <div style="font-size:0.72rem;color:var(--danger)">Sin movimiento</div>
              </div>
            </div>`).join('') :
          '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.82rem">✅ No hay productos estancados</div>'}
        </div>
      </div>
    </div>
  `;

  // Render daily chart
  const ctx = document.getElementById('report-chart');
  if (ctx && daily.length) {
    if (reportsChart) reportsChart.destroy();
    const isDark = App.theme !== 'light';
    const textColor = isDark ? '#8f8fa3' : '#5c5c70';
    reportsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: daily.map(d => { const dt = new Date(d.date+'T12:00:00'); return dt.toLocaleDateString('es-VE',{day:'numeric',month:'short'}); }),
        datasets: [{
          data: daily.map(d => d.revenue),
          backgroundColor: 'rgba(98,18,29,0.6)',
          borderColor: '#62121D',
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: {
          callbacks: { label: i => ` ${fmt(i.raw)}` }
        }},
        scales: {
          x: { grid: { display: false }, ticks: { color: textColor, maxTicksLimit: 8, font: { size: 10 } }, border: { display: false } },
          y: { grid: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }, ticks: { color: textColor, font: { size: 10 }, callback: v => '$'+v }, border: { display: false } }
        }
      }
    });
  }
}
