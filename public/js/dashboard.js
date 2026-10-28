// ── Dashboard: finanzas del mes ──────────────────────────────
// Ventas (pedidos entregados + ventas en tienda), costo de las velas, ganancia, rentabilidad,
// gastos, meta mensual, rentabilidad por vela y pedidos por seguir.
let financeChart = null;
let dashMonth = null;     // 'YYYY-MM' (null = mes actual)

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function escDash(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function monthLabel(ym) { const [y, m] = ym.split('-').map(Number); return `${MESES[m - 1]} ${y}`; }
function shiftMonth(ym, d) { const [y, m] = ym.split('-').map(Number); const dt = new Date(y, m - 1 + d, 1); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`; }
function pct(n) { return `${(Math.round(n * 10) / 10).toLocaleString('es-CL')}%`; }
function delta(cur, prev) {
  if (!prev) return cur > 0 ? '<span class="dash-delta up">nuevo</span>' : '';
  const d = (cur - prev) / Math.abs(prev) * 100;
  return `<span class="dash-delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '↑' : '↓'} ${pct(Math.abs(d))}</span>`;
}

async function loadDashboard() {
  try {
    const [f, lowStock, recent] = await Promise.all([API.dashFinance(dashMonth), API.dashLowStock(), API.dashRecentSales()]);
    dashMonth = f.month;
    renderDashboard(f, lowStock, recent);
  } catch (err) {
    toast('Error cargando dashboard: ' + err.message, 'error');
  }
}

function changeDashMonth(d) { dashMonth = shiftMonth(dashMonth, d); loadDashboard(); }

function renderDashboard(f, lowStock, recent) {
  const c = f.current, p = f.previous;
  const goalPct = f.goal > 0 ? Math.min(100, c.revenue / f.goal * 100) : 0;
  const projPct = f.goal > 0 ? Math.min(100, f.projection / f.goal * 100) : 0;
  document.getElementById('dash-root').innerHTML = `
    <div class="dash-head">
      <div class="dash-month">
        <button class="btn btn-ghost btn-sm btn-icon" onclick="changeDashMonth(-1)" title="Mes anterior">‹</button>
        <strong>${monthLabel(f.month)}</strong>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="changeDashMonth(1)" ${f.isCurrent ? 'disabled' : ''} title="Mes siguiente">›</button>
      </div>
      <small class="text-muted">Cuenta los pedidos entregados y las ventas en tienda.</small>
    </div>

    <div class="dash-hero">
      <div>
        <div class="dash-hero-label">Ganancia del mes</div>
        <div class="dash-hero-value">${fmt(c.profit)}</div>
        <div class="dash-hero-sub">Rentabilidad <strong>${pct(c.margin)}</strong> · ${delta(c.profit, p.profit)} vs mes anterior</div>
      </div>
      <div class="dash-hero-split">
        <div><span>Ventas</span><strong>${fmt(c.revenue)}</strong></div>
        <div><span>− Costo de las velas</span><strong>${fmt(c.cost)}</strong></div>
        <div class="dash-hero-line"><span>= Ganancia</span><strong>${fmt(c.profit)}</strong></div>
        <div><span>− Gastos del mes</span><strong>${fmt(c.expenses)}</strong></div>
        <div class="dash-hero-line total"><span>= Ganancia final</span><strong>${fmt(c.net)}</strong></div>
      </div>
    </div>

    <div class="stats-grid dash-kpis">
      <div class="stat-card"><div class="stat-label">Ventas</div><div class="stat-value">${fmt(c.revenue)}</div><div class="stat-change neutral">${delta(c.revenue, p.revenue)} vs mes anterior</div></div>
      <div class="stat-card"><div class="stat-label">Pedidos vendidos</div><div class="stat-value">${c.sales}</div><div class="stat-change neutral">${c.units} ${c.units === 1 ? 'vela' : 'velas'}</div></div>
      <div class="stat-card"><div class="stat-label">Ticket promedio</div><div class="stat-value">${fmt(c.ticket)}</div><div class="stat-change neutral">${delta(c.ticket, p.ticket)} vs mes anterior</div></div>
      <div class="stat-card"><div class="stat-label">Ganancia por vela</div><div class="stat-value">${fmt(c.units ? c.profit / c.units : 0)}</div><div class="stat-change neutral">promedio</div></div>
    </div>

    <div class="dash-grid">
      <div class="card">
        <div class="card-header"><div><div class="card-title">🎯 Meta del mes</div><div class="card-subtitle">${f.goal ? `Meta: ${fmt(f.goal)} en ventas` : 'Ponte una meta de ventas para el mes'}</div></div>
          <button class="btn btn-ghost btn-sm" onclick="editGoal(${f.goal})">${f.goal ? 'Cambiar' : 'Definir meta'}</button></div>
        <div class="card-body">
          ${f.goal ? `
            <div class="dash-goal-bar"><div class="dash-goal-proj" style="width:${projPct}%"></div><div class="dash-goal-fill" style="width:${goalPct}%"></div></div>
            <div class="dash-goal-legend"><strong>${pct(c.revenue / f.goal * 100)}</strong> logrado · faltan ${fmt(Math.max(0, f.goal - c.revenue))}</div>
            ${f.isCurrent ? `<p class="dash-note">A este ritmo cerrarías el mes en <strong>${fmt(f.projection)}</strong>${f.projection >= f.goal ? ' — ¡llegas a la meta! 🎉' : ` (${fmt(f.goal - f.projection)} bajo la meta)`}. Quedan ${f.daysLeft} días.</p>` : ''}
          ` : '<p class="dash-note">Con una meta verás cuánto llevas y si al ritmo actual llegas a fin de mes.</p>'}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">⏳ Pedidos por seguir</div><a href="#" onclick="navigate('orders')" class="btn btn-ghost btn-sm">Pedidos</a></div>
        <div>
          ${f.followUp.length ? f.followUp.map(o => {
            const wa = typeof waCustomerLink === 'function' ? waCustomerLink(o.phone, `¡Hola${o.name ? ' ' + o.name.split(' ')[0] : ''}! Te escribimos de mimo por tu pedido 🕯️`) : '';
            const days = Math.floor((Date.now() - new Date(o.created_at)) / 86400000);
            return `<div class="dash-row">
              <div><strong>#${o.id} ${escDash(o.name || 'Sin nombre')}</strong><br><small>Pendiente hace ${days} días · ${fmt(o.total)}</small></div>
              ${wa ? `<a class="btn btn-secondary btn-sm" href="${wa}" target="_blank" rel="noopener">💬 Escribir</a>` : `<button class="btn btn-ghost btn-sm" onclick="navigate('orders');setTimeout(()=>openOrderDetail(${o.id}),400)">Ver</button>`}
            </div>`;
          }).join('') : '<p class="dash-note" style="padding:0 18px 16px">✅ Ningún pedido pendiente hace más de 2 días.</p>'}
        </div>
      </div>
    </div>

    <div class="card mt-4">
      <div class="card-header"><div><div class="card-title">Ventas y ganancia por día</div><div class="card-subtitle">${monthLabel(f.month)}</div></div></div>
      <div class="card-body"><div class="chart-container"><canvas id="financeChart"></canvas></div></div>
    </div>

    <div class="card mt-4">
      <div class="card-header"><div><div class="card-title">🕯️ Rentabilidad por vela</div><div class="card-subtitle">Lo que te dejó cada vela este mes</div></div></div>
      ${f.products.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>Vela</th><th>Vendidas</th><th>Ventas</th><th>Costo</th><th>Ganancia</th><th>Rentabilidad</th></tr></thead>
        <tbody>${f.products.map(r => {
          const m = r.revenue > 0 ? r.profit / r.revenue * 100 : 0;
          return `<tr>
            <td><strong>${escDash(r.name)}</strong>${r.missing_cost ? ' <span class="badge badge-warning" title="Sin costo cargado: la ganancia sale inflada">sin costo</span>' : ''}</td>
            <td>${r.units}</td><td>${fmt(r.revenue)}</td><td>${fmt(r.cost)}</td><td class="font-bold">${fmt(r.profit)}</td>
            <td><div class="dash-margin"><div style="width:${Math.max(0, Math.min(100, m))}%"></div></div><small>${pct(m)}</small></td>
          </tr>`; }).join('')}</tbody>
      </table></div>` : '<div class="empty-state" style="padding:30px"><p>Aún no hay ventas este mes. Cuando marques un pedido como <strong>Entregado</strong>, aparece aquí.</p></div>'}
    </div>

    ${f.noCost.length ? `
    <div class="alert alert-warning mt-4" style="display:block">
      <strong>⚠️ ${f.noCost.length} ${f.noCost.length === 1 ? 'vela no tiene' : 'velas no tienen'} costo cargado</strong> — su ganancia sale inflada. Ponle el costo en Inventario:
      <div class="dash-chips">${f.noCost.map(pr => `<button class="cust-chip" onclick="navigate('inventory');setTimeout(()=>openProductModal(${pr.id}),400)">${escDash(pr.name)}</button>`).join('')}</div>
    </div>` : ''}

    <div class="grid-2 mt-4">
      <div class="card">
        <div class="card-header"><div class="card-title">⚠️ Stock bajo</div><a href="#" onclick="navigate('inventory')" class="btn btn-ghost btn-sm">Inventario</a></div>
        <div id="low-stock-list"></div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">🕐 Últimas ventas</div><a href="#" onclick="navigate('sales')" class="btn btn-ghost btn-sm">Ver todo</a></div>
        <div id="recent-sales-list"></div>
      </div>
    </div>
  `;
  renderFinanceChart(f);
  renderLowStock(lowStock);
  renderRecentSales(recent);
}

async function editGoal(current) {
  const v = prompt('Meta de ventas para el mes (en pesos, sin puntos):', current || '');
  if (v === null) return;
  try {
    await API.dashGoal(parseInt(String(v).replace(/\D/g, '')) || 0);
    toast('Meta guardada ✓', 'success');
    loadDashboard();
  } catch (err) { toast(err.message, 'error'); }
}

function renderFinanceChart(f) {
  const ctx = document.getElementById('financeChart');
  if (!ctx) return;
  if (financeChart) financeChart.destroy();
  const [y, m] = f.month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const byDay = Object.fromEntries(f.daily.map(d => [Number(String(d.date).slice(8, 10)), d]));
  const labels = Array.from({ length: days }, (_, i) => i + 1);
  const css = getComputedStyle(document.documentElement);
  const muted = css.getPropertyValue('--text-muted').trim() || '#8a7f80';
  financeChart = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        { type: 'bar', label: 'Ventas', data: labels.map(d => byDay[d]?.revenue || 0), backgroundColor: 'rgba(98,18,29,0.75)', borderRadius: 6, maxBarThickness: 18 },
        { type: 'line', label: 'Ganancia', data: labels.map(d => byDay[d]?.profit || 0), borderColor: '#6E734D', backgroundColor: 'rgba(110,115,77,0.15)', tension: 0.35, pointRadius: 0, fill: true },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: muted, usePointStyle: true } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.parsed.y)}` } } },
      scales: { x: { grid: { display: false }, ticks: { color: muted, maxTicksLimit: 10 } }, y: { ticks: { color: muted, callback: v => fmt(v) }, grid: { color: 'rgba(43,29,31,0.06)' } } },
    },
  });
}

function renderRecentSales(sales) {
  const el = document.getElementById('recent-sales-list');
  if (!el) return;
  if (!sales.length) { el.innerHTML = '<div class="empty-state" style="padding:30px"><p>Sin ventas registradas</p></div>'; return; }
  el.innerHTML = sales.map(s => `
    <div class="dash-row">
      <div style="min-width:0"><strong>${escDash(s.customer_name || 'Cliente')}</strong><br>
        <small style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escDash(s.items || '—')} · ${timeAgo(s.created_at)}</small></div>
      <strong class="text-accent">${fmt(s.total)}</strong>
    </div>`).join('');
}

function renderLowStock(products) {
  const el = document.getElementById('low-stock-list');
  if (!el) return;
  if (!products.length) { el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.82rem">✅ Todo el stock está bien</div>'; return; }
  el.innerHTML = products.map(p => `
    <div class="dash-row">
      <div style="min-width:0"><strong>${escDash(p.name)}</strong><br><small>${escDash(p.category || 'Sin categoría')}</small></div>
      ${stockBadge(p.status, p.stock)}
    </div>`).join('');
}
