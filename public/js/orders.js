// ── Orders Module ────────────────────────────────────────────
let currentOrderFilter = '';

async function loadOrders(status = currentOrderFilter) {
  currentOrderFilter = status;
  try {
    const orders = await API.orders(status ? { status } : {});
    renderOrders(orders);
  } catch (err) {
    toast('Error cargando pedidos: ' + err.message, 'error');
  }
}

function renderOrders(orders) {
  const el = document.getElementById('orders-content');

  if (!orders.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h3>Sin pedidos</h3>
        <p>Los apartados y pedidos personalizados aparecerán aquí</p>
        <button class="btn btn-primary" onclick="openOrderModal()">+ Nuevo pedido</button>
      </div>`;
    return;
  }

  const pending = orders.filter(o => o.status === 'pending').length;
  const totalValue = orders.reduce((s, o) => s + (o.total || 0), 0);

  el.innerHTML = `
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
      <div class="stat-card"><span class="stat-icon">📋</span><div class="stat-label">Total</div><div class="stat-value">${orders.length}</div></div>
      <div class="stat-card warning"><span class="stat-icon">⏳</span><div class="stat-label">Pendientes</div><div class="stat-value">${pending}</div></div>
      <div class="stat-card success"><span class="stat-icon">💰</span><div class="stat-label">Valor total</div><div class="stat-value">${fmt(totalValue)}</div></div>
      <div class="stat-card info"><span class="stat-icon">💎</span><div class="stat-label">Abonos recibidos</div>
        <div class="stat-value">${fmt(orders.reduce((s, o) => s + (o.deposit || 0), 0))}</div></div>
    </div>
    <div>${orders.map(o => orderItem(o)).join('')}</div>
  `;
}

function orderItem(o) {
  const typeLabels = { reservation: '📌 Reserva', layaway: '🏷️ Apartado', custom_order: '✂️ Pedido personalizado' };
  const balance = (o.total || 0) - (o.deposit || 0);

  return `
    <div class="order-item" onclick="openOrderDetail(${o.id})">
      <div class="order-header">
        <div>
          <div class="order-id">Pedido #${o.id} — ${o.customer_name || 'Sin cliente'}</div>
          <div class="order-type">${typeLabels[o.type] || o.type}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          ${orderStatusBadge(o.status)}
          <div style="text-align:right">
            <div class="text-accent font-bold">${fmt(o.total)}</div>
            ${o.deposit > 0 ? `<div style="font-size:0.72rem;color:var(--text-muted)">Abono: ${fmt(o.deposit)}</div>` : ''}
          </div>
        </div>
      </div>
      ${o.description ? `<div style="font-size:0.82rem;color:var(--text-muted);margin-top:6px">${o.description}</div>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
        <div style="font-size:0.75rem;color:var(--text-muted)">
          📅 ${o.due_date ? `Entrega: ${fmtDate(o.due_date)}` : `Creado: ${fmtDate(o.created_at)}`}
          ${balance > 0 ? ` • <span style="color:var(--warning)">Balance: ${fmt(balance)}</span>` : ''}
        </div>
        <div class="order-progress" style="width:120px">${orderProgressDots(o.status)}</div>
      </div>
    </div>`;
}

// Filter buttons
document.querySelectorAll('.order-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.order-filter').forEach(b => b.classList.remove('active', 'btn-primary'));
    document.querySelectorAll('.order-filter').forEach(b => b.classList.add('btn-secondary'));
    btn.classList.add('active', 'btn-primary');
    btn.classList.remove('btn-secondary');
    loadOrders(btn.dataset.status);
  });
});

// ── Order Modal ───────────────────────────────────
async function openOrderModal() {
  const customers = await API.customers();
  const sel = document.getElementById('om-customer');
  sel.innerHTML = '<option value="">Seleccionar cliente…</option>' +
    customers.map(c => `<option value="${c.id}">${c.name}${c.is_vip ? ' ⭐' : ''}</option>`).join('');

  ['om-desc','om-notes'].forEach(id => document.getElementById(id).value = '');
  ['om-total','om-deposit'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('om-due').value = '';
  document.getElementById('om-type').value = 'reservation';
  openModal('order-modal');
}

async function saveOrder() {
  const customerId = document.getElementById('om-customer').value;
  if (!customerId) { toast('Selecciona una cliente', 'warning'); return; }

  const data = {
    customer_id: customerId,
    type: document.getElementById('om-type').value,
    description: document.getElementById('om-desc').value,
    total: document.getElementById('om-total').value || 0,
    deposit: document.getElementById('om-deposit').value || 0,
    due_date: document.getElementById('om-due').value || null,
    notes: document.getElementById('om-notes').value,
  };

  try {
    await API.createOrder(data);
    toast('Pedido creado ✓', 'success');
    closeModal('order-modal');
    await loadOrders();
    await loadNotifications();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function openOrderDetail(id) {
  try {
    const o = await API.order(id);
    const typeLabels = { reservation: '📌 Reserva', layaway: '🏷️ Apartado', custom_order: '✂️ Pedido personalizado' };
    const balance = (o.total || 0) - (o.deposit || 0);

    document.getElementById('od-title').textContent = `Pedido #${o.id}`;
    document.getElementById('od-body').innerHTML = `
      <div class="grid-2 mb-4">
        <div><div class="stat-label">Cliente</div><div style="font-weight:600;margin-top:4px">${o.customer_name || '—'}</div>
          ${o.customer_phone ? `<div style="font-size:0.78rem;color:var(--text-muted)">📱 ${o.customer_phone}</div>` : ''}
          ${o.customer_ig ? `<div style="font-size:0.78rem;color:var(--text-muted)">📸 ${o.customer_ig}</div>` : ''}
        </div>
        <div><div class="stat-label">Estado</div><div style="margin-top:4px">${orderStatusBadge(o.status)}</div></div>
      </div>

      <div class="report-card mb-4">
        <div style="font-weight:600;margin-bottom:10px">${typeLabels[o.type] || o.type}</div>
        ${o.description ? `<p style="color:var(--text-secondary);font-size:0.875rem">${o.description}</p>` : ''}
        ${o.notes ? `<p style="color:var(--text-muted);font-size:0.82rem;margin-top:6px;font-style:italic">${o.notes}</p>` : ''}
      </div>

      <div class="grid-2 mb-4">
        <div class="report-card"><div class="stat-label">Total</div><div class="stat-value" style="font-size:1.4rem;color:var(--accent-light)">${fmt(o.total)}</div></div>
        <div class="report-card"><div class="stat-label">Abono recibido</div><div class="stat-value" style="font-size:1.4rem;color:var(--success)">${fmt(o.deposit)}</div>
          ${balance > 0 ? `<div class="text-warning text-sm">Balance: ${fmt(balance)}</div>` : '<div class="text-success text-sm">✓ Pagado completo</div>'}
        </div>
      </div>

      ${o.due_date ? `<div class="alert alert-info">📅 Fecha de entrega: <strong>${fmtDate(o.due_date)}</strong></div>` : ''}

      <div class="divider"></div>
      <div style="margin-bottom:12px">
        <label class="form-label">Actualizar estado</label>
        <select class="form-control" id="od-status-update" onchange="updateOrderStatus(${o.id})">
          ${['pending','confirmed','paid','shipped','delivered','cancelled'].map(s =>
            `<option value="${s}" ${s === o.status ? 'selected' : ''}>${['⏳ Pendiente','✅ Confirmado','💰 Pagado','📦 Enviado','🎁 Entregado','❌ Cancelado'][['pending','confirmed','paid','shipped','delivered','cancelled'].indexOf(s)]}</option>`
          ).join('')}
        </select>
      </div>
    `;

    document.getElementById('od-footer').innerHTML = `
      <button class="btn btn-primary btn-sm" onclick="editOrder(${o.id})">✏️ Editar</button>
      <button class="btn btn-danger btn-sm" onclick="confirmDeleteOrder(${o.id})">🗑️ Eliminar</button>
      <button class="btn btn-secondary" onclick="closeModal('order-detail-modal')">Cerrar</button>
    `;

    openModal('order-detail-modal');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function updateOrderStatus(id) {
  const status = document.getElementById('od-status-update').value;
  try {
    await API.updateOrder(id, { status });
    toast(`Estado actualizado: ${status}`, 'success');
    await loadOrders();
    await loadNotifications();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function confirmDeleteOrder(id) {
  if (!confirm('¿Eliminar este pedido?')) return;
  try {
    await API.deleteOrder(id);
    toast('Pedido eliminado', 'info');
    closeModal('order-detail-modal');
    await loadOrders();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function editOrder(id) {
  try {
    const o = await API.order(id);
    document.getElementById('od-body').innerHTML = `
      <div class="form-group"><label class="form-label">Cliente</label>
        <input class="form-control" id="ed-customer" value="${o.customer_name||''}" placeholder="Nombre cliente"></div>
      <div class="form-group"><label class="form-label">Descripción / Productos</label>
        <textarea class="form-control" id="ed-items" rows="3" placeholder="Ej: Frambuesa cheesecake MIMO-001">${o.items||o.description||''}</textarea></div>
      <div class="grid-2 mb-4">
        <div class="form-group"><label class="form-label">Total</label>
          <input class="form-control" id="ed-total" type="number" value="${o.total||0}"></div>
        <div class="form-group"><label class="form-label">Abono recibido</label>
          <input class="form-control" id="ed-deposit" type="number" value="${o.deposit||0}"></div>
      </div>
      <div class="grid-2 mb-4">
        <div class="form-group"><label class="form-label">Fecha de entrega</label>
          <input class="form-control" id="ed-due" type="date" value="${o.due_date?o.due_date.slice(0,10):''}"></div>
        <div class="form-group"><label class="form-label">Estado</label>
          <select class="form-control" id="ed-status">
            ${['pending','confirmed','paid','shipped','delivered','cancelled'].map(s =>
              `<option value="${s}" ${s===o.status?'selected':''}>${['⏳ Pendiente','✅ Confirmado','💰 Pagado','📦 Enviado','🎁 Entregado','❌ Cancelado'][['pending','confirmed','paid','shipped','delivered','cancelled'].indexOf(s)]}</option>`
            ).join('')}
          </select></div>
      </div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-control" id="ed-notes" rows="2">${o.notes||''}</textarea></div>
    `;
    document.getElementById('od-footer').innerHTML = `
      <button class="btn btn-primary btn-sm" onclick="saveOrderEdit(${o.id})">💾 Guardar cambios</button>
      <button class="btn btn-secondary" onclick="openOrderDetail(${o.id})">Cancelar</button>
    `;
  } catch(err) { toast(err.message, 'error'); }
}

async function saveOrderEdit(id) {
  const data = {
    status:     document.getElementById('ed-status')?.value,
    deposit:    document.getElementById('ed-deposit')?.value,
    notes:      document.getElementById('ed-notes')?.value,
    due_date:   document.getElementById('ed-due')?.value || null,
    total:      document.getElementById('ed-total')?.value,
    items:      document.getElementById('ed-items')?.value,
  };
  try {
    await API.updateOrder(id, data);
    toast('Pedido actualizado', 'success');
    await loadOrders();
    openOrderDetail(id);
  } catch(err) { toast(err.message, 'error'); }
}