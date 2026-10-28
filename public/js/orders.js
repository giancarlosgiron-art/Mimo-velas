// Texto escrito por clientes (pedidos web): siempre escapado antes de mostrarlo como HTML
function escOrder(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Orders Module ────────────────────────────────────────────
let currentOrderFilter = '';
// Modo "Seleccionar" para eliminar varios pedidos (ej. pruebas) de una vez
let orderSelectMode = false;
const selectedOrders = new Set();
let lastOrders = [];

// Activos: lo que hay que atender. "history": entregados (ya son venta) y cancelados.
async function loadOrders(status = currentOrderFilter) {
  currentOrderFilter = status;
  try {
    const orders = await API.orders(status === 'history' ? { view: 'history' } : status ? { status, view: 'active' } : { view: 'active' });
    renderOrders(orders);
  } catch (err) {
    toast('Error cargando pedidos: ' + err.message, 'error');
  }
}

function renderOrders(orders) {
  const el = document.getElementById('orders-content');
  lastOrders = orders;

  const history = currentOrderFilter === 'history';
  if (!orders.length) {
    el.innerHTML = history ? `
      <div class="empty-state"><div class="empty-icon">📚</div><h3>Historial vacío</h3>
        <p>Cuando marques un pedido como <strong>Entregado</strong>, pasa aquí y se registra como venta.</p></div>` : `
      <div class="empty-state">
        <div class="empty-icon">✨</div>
        <h3>Todo al día</h3>
        <p>No hay pedidos por atender. Los entregados están en 📚 Historial.</p>
      </div>`;
    return;
  }
  if (history) {
    const delivered = orders.filter(o => o.status === 'delivered');
    const total = delivered.reduce((s, o) => s + (o.total || 0), 0);
    el.innerHTML = `
      <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
        <div class="stat-card success"><span class="stat-icon">🎁</span><div class="stat-label">Entregados</div><div class="stat-value">${delivered.length}</div></div>
        <div class="stat-card"><span class="stat-icon">💰</span><div class="stat-label">Vendido</div><div class="stat-value">${fmt(total)}</div></div>
        <div class="stat-card"><span class="stat-icon">❌</span><div class="stat-label">Cancelados</div><div class="stat-value">${orders.length - delivered.length}</div></div>
      </div>
      <div>${orders.map(o => orderItem(o)).join('')}</div>`;
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
    <div class="order-select-bar">
      ${orderSelectMode ? `
        <label class="order-select-all"><input type="checkbox" ${orders.length && orders.every(o => selectedOrders.has(o.id)) ? 'checked' : ''} onchange="toggleAllOrders(this.checked)" /> Todos</label>
        <span class="order-select-count">${selectedOrders.size} seleccionado${selectedOrders.size === 1 ? '' : 's'}</span>
        <button class="btn btn-danger btn-sm" ${selectedOrders.size ? '' : 'disabled'} onclick="deleteSelectedOrders()">🗑️ Eliminar seleccionados</button>
        <button class="btn btn-ghost btn-sm" onclick="setOrderSelectMode(false)">Cancelar</button>
      ` : `<button class="btn btn-secondary btn-sm" onclick="setOrderSelectMode(true)">☑️ Seleccionar varios</button>`}
    </div>
    <div>${orders.map(o => orderItem(o)).join('')}</div>
  `;
}

function setOrderSelectMode(on) {
  orderSelectMode = on;
  selectedOrders.clear();
  renderOrders(lastOrders);
}

function toggleOrderSelected(id, on) {
  if (on) selectedOrders.add(id); else selectedOrders.delete(id);
  renderOrders(lastOrders);
}

function toggleAllOrders(on) {
  lastOrders.forEach(o => on ? selectedOrders.add(o.id) : selectedOrders.delete(o.id));
  renderOrders(lastOrders);
}

async function deleteSelectedOrders() {
  const ids = [...selectedOrders];
  if (!ids.length) return;
  const list = lastOrders.filter(o => selectedOrders.has(o.id)).map(o => `#${o.id} ${o.customer_name || o.contact_name || ''}`.trim());
  if (!confirm(`¿Eliminar ${ids.length} pedido${ids.length === 1 ? '' : 's'}? No se puede deshacer.\n\n${list.slice(0, 15).join('\n')}${list.length > 15 ? '\n…' : ''}`)) return;
  try {
    const res = await API.deleteOrders(ids);
    toast(res.message + ' ✓', 'success');
    orderSelectMode = false;
    selectedOrders.clear();
    await loadOrders();
    if (typeof loadNotifications === 'function') await loadNotifications();
  } catch (err) { toast(err.message, 'error'); }
}

function orderItem(o) {
  const typeLabels = { reservation: '📌 Reserva', layaway: '🏷️ Apartado', custom_order: '✂️ Pedido personalizado', web: '🛍️ Pedido web (catálogo)' };
  const balance = o.status === 'delivered' ? 0 : (o.total || 0) - (o.deposit || 0);   // entregado = venta pagada

  return `
    <div class="order-item ${orderSelectMode && selectedOrders.has(o.id) ? 'selected' : ''}" onclick="${orderSelectMode ? `toggleOrderSelected(${o.id}, ${!selectedOrders.has(o.id)})` : `openOrderDetail(${o.id})`}">
      <div class="order-header">
        ${orderSelectMode ? `<input type="checkbox" class="order-check" ${selectedOrders.has(o.id) ? 'checked' : ''} onclick="event.stopPropagation()" onchange="toggleOrderSelected(${o.id}, this.checked)" />` : ''}
        <div style="flex:1;min-width:0">
          <div class="order-id">Pedido #${o.id} — ${escOrder(o.customer_name || o.contact_name || 'Sin cliente')}</div>
          <div class="order-type">${o.sale_id ? `<span class="badge badge-success" style="margin-right:6px">✓ Venta #${o.sale_id}</span>` : ''}${typeLabels[o.type] || o.type}${o.payment_method ? ` · 💳 ${escOrder(o.payment_method)}` : ''}${!o.customer_id && o.contact_phone ? ` · 📱 ${escOrder(o.contact_phone)}` : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          ${orderStatusBadge(o.status)}
          <div style="text-align:right">
            <div class="text-accent font-bold">${fmt(o.total)}</div>
            ${o.deposit > 0 ? `<div style="font-size:0.72rem;color:var(--text-muted)">Abono: ${fmt(o.deposit)}</div>` : ''}
          </div>
        </div>
      </div>
      ${o.description ? `<div style="font-size:0.82rem;color:var(--text-muted);margin-top:6px;white-space:pre-line">${escOrder(o.description)}</div>` : ''}
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
    const typeLabels = { reservation: '📌 Reserva', layaway: '🏷️ Apartado', custom_order: '✂️ Pedido personalizado', web: '🛍️ Pedido web (catálogo)' };
    const balance = o.status === 'delivered' ? 0 : (o.total || 0) - (o.deposit || 0);   // entregado = venta pagada

    document.getElementById('od-title').textContent = `Pedido #${o.id}`;
    document.getElementById('od-body').innerHTML = `
      <div class="grid-2 mb-4">
        <div><div class="stat-label">Cliente</div><div style="font-weight:600;margin-top:4px">${escOrder(o.customer_name || o.contact_name || '—')}</div>
          ${(o.customer_phone || o.contact_phone) ? `<div style="font-size:0.78rem;color:var(--text-muted)">📱 ${escOrder(o.customer_phone || o.contact_phone)}
            ${typeof waCustomerLink === 'function' && waCustomerLink(o.customer_phone || o.contact_phone) ? `<a class="btn btn-ghost btn-sm" href="${waCustomerLink(o.customer_phone || o.contact_phone, `¡Hola${o.contact_name ? ' ' + o.contact_name.split(' ')[0] : ''}! Te escribimos de mimo por tu pedido 🕯️`)}" target="_blank" rel="noopener">💬 Escribirle</a>` : ''}</div>` : ''}
          ${o.payment_method ? `<div style="font-size:0.78rem;color:var(--text-muted)">💳 Pago: ${escOrder(o.payment_method)}</div>` : ''}
          ${o.customer_ig ? `<div style="font-size:0.78rem;color:var(--text-muted)">📸 ${escOrder(o.customer_ig)}</div>` : ''}
          ${o.customer_id
            ? `<button class="btn btn-ghost btn-sm" style="margin-top:6px;padding-left:0" onclick="closeModal('order-detail-modal');openCustomerDetail(${o.customer_id})">👤 Ver ficha del cliente</button>`
            : `<div id="od-link-customer" style="margin-top:8px">
                <button class="btn btn-secondary btn-sm" onclick="showOrderCustomerForm(${o.id}, ${escOrder(JSON.stringify(o.contact_name || ''))}, ${escOrder(JSON.stringify(o.contact_phone || ''))})">👤 Guardar como cliente</button>
              </div>`}
        </div>
        <div><div class="stat-label">Estado</div><div style="margin-top:4px">${orderStatusBadge(o.status)}</div></div>
      </div>

      <div class="report-card mb-4">
        <div style="font-weight:600;margin-bottom:10px">${typeLabels[o.type] || o.type}</div>
        ${o.items && o.items.length ? `
          <div class="order-lines">
            ${o.items.map(it => `
              <div class="order-line">
                <div><strong>${it.quantity} × ${escOrder(it.product_name)}</strong>${it.notes ? `<br><small>${escOrder(it.notes)}</small>` : ''}</div>
                <div>${fmt(it.unit_price * it.quantity)}</div>
              </div>`).join('')}
          </div>`
          : (o.description ? `<p style="color:var(--text-secondary);font-size:0.875rem;white-space:pre-line">${escOrder(o.description)}</p>` : '')}
        ${o.notes ? `<p style="color:var(--text-muted);font-size:0.82rem;margin-top:6px;font-style:italic">💬 ${escOrder(o.notes)}</p>` : ''}
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

// ── Pedido web → cliente ─────────────────────────
function showOrderCustomerForm(orderId, name, phone = '') {
  document.getElementById('od-link-customer').innerHTML = `
    <div class="od-customer-form">
      <input class="form-control" id="od-c-name" placeholder="Nombre" value="${escOrder(name)}" />
      <input class="form-control" id="od-c-phone" placeholder="WhatsApp (opcional) · +56 9…" value="${escOrder(phone || '')}" />
      <small class="site-hint">Con el WhatsApp, si ya es cliente se vincula sola.</small>
      <button class="btn btn-primary btn-sm" onclick="saveOrderAsCustomer(${orderId})">Guardar cliente</button>
    </div>`;
  document.getElementById('od-c-phone').focus();
}

async function saveOrderAsCustomer(orderId, extra = {}) {
  const body = {
    name: document.getElementById('od-c-name')?.value.trim(),
    phone: document.getElementById('od-c-phone')?.value.trim(),
    ...extra,
  };
  try {
    const res = await fetch(`${API.base}/customers/from-order/${orderId}`, { method: 'POST', headers: API.headers(), body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.candidate) {
      // Ya hay un cliente con ese nombre: ¿es la misma persona?
      const c = data.candidate;
      const same = confirm(`Ya tienes un cliente llamado "${c.name}"${c.phone ? ` (${c.phone})` : ''}.\n\n¿Es la misma persona?\nAceptar = vincular a ese cliente · Cancelar = crear uno nuevo`);
      return saveOrderAsCustomer(orderId, same ? { customer_id: c.id } : { force_new: true });
    }
    if (!res.ok) throw new Error(data.error || 'No se pudo guardar');
    toast(data.created ? `Cliente "${data.customer.name}" registrado ✓` : `Pedido vinculado a "${data.customer.name}" ✓`, 'success');
    await openOrderDetail(orderId);
    await loadOrders();
  } catch (err) { toast(err.message, 'error'); }
}

async function updateOrderStatus(id) {
  const status = document.getElementById('od-status-update').value;
  try {
    const res = await API.updateOrder(id, { status });
    const labels = { pending: 'Pendiente', confirmed: 'Confirmado', paid: 'Pagado', shipped: 'Enviado', delivered: 'Entregado', cancelled: 'Cancelado' };
    if (status === 'delivered') {
      toast(`🎁 Entregado · venta${res.sale_id ? ` #${res.sale_id}` : ''} registrada. Pasó al historial.`, 'success');
      closeModal('order-detail-modal');
    } else toast(`Estado: ${labels[status] || status}`, 'success');
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
    if (typeof loadNotifications === 'function') await loadNotifications();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function editOrder(id) {
  try {
    const o = await API.order(id);
    document.getElementById('od-body').innerHTML = `
      <div class="form-group"><label class="form-label">Cliente</label>
        <input class="form-control" id="ed-customer" value="${escOrder(o.customer_name || o.contact_name || '')}" placeholder="Nombre cliente"></div>
      <div class="form-group"><label class="form-label">Descripción / Productos</label>
        <textarea class="form-control" id="ed-items" rows="3" placeholder="Ej: Frambuesa cheesecake MIMO-001">${escOrder(o.description || '')}</textarea></div>
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