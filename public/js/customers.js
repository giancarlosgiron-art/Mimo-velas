// ── Customers / CRM Module ───────────────────────────────────
let allCustomers = [];
let customerFilter = 'all';
let editingCustomerId = null;

const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const CUSTOMER_FILTERS = [
  { key: 'all',      label: 'Todos' },
  { key: 'vip',      label: '⭐ VIP' },
  { key: 'birthday', label: '🎂 Cumpleaños del mes' },
  { key: 'inactive', label: '💤 Sin comprar hace 60+ días' },
];

function escCust(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Link de WhatsApp desde el teléfono guardado (acepta 9 1234 5678, +56 9…, etc.)
function waCustomerLink(phone, text = '') {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 9 && d.startsWith('9')) d = '56' + d;
  else if (d.length === 8) d = '569' + d;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

function birthdayParts(c) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(c.birthday || '');
  return m ? { month: parseInt(m[2]) - 1, day: parseInt(m[3]) } : null;
}
const isBirthdayMonth = c => birthdayParts(c)?.month === new Date().getMonth();

// Última vez que compró o pidió algo
function lastActivity(c) {
  const dates = [c.last_purchase, c.last_order].filter(Boolean).map(d => new Date(d).getTime());
  return dates.length ? Math.max(...dates) : null;
}
const daysSinceActivity = c => { const t = lastActivity(c); return t ? Math.floor((Date.now() - t) / 86400000) : null; };

async function loadCustomers() {
  try {
    allCustomers = await API.customers();
    filterCustomers();
  } catch (err) {
    toast('Error cargando clientes: ' + err.message, 'error');
  }
}

function renderCustomerFilters() {
  const el = document.getElementById('cust-filters');
  if (!el) return;
  const count = { all: allCustomers.length, vip: allCustomers.filter(c => c.is_vip).length,
    birthday: allCustomers.filter(isBirthdayMonth).length,
    inactive: allCustomers.filter(c => (daysSinceActivity(c) ?? 0) > 60).length };
  el.innerHTML = CUSTOMER_FILTERS.map(f => `
    <button class="cust-chip ${customerFilter === f.key ? 'active' : ''}" onclick="setCustomerFilter('${f.key}')">
      ${f.label}<span>${count[f.key]}</span>
    </button>`).join('');
}

function setCustomerFilter(key) {
  customerFilter = key;
  filterCustomers();
}

function filterCustomers() {
  const q = (document.getElementById('cust-search')?.value || '').toLowerCase();
  let list = allCustomers.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.phone || '').includes(q) ||
    (c.instagram || '').toLowerCase().includes(q) ||
    (c.email || '').toLowerCase().includes(q)
  );
  if (customerFilter === 'vip') list = list.filter(c => c.is_vip);
  if (customerFilter === 'birthday') list = list.filter(isBirthdayMonth).sort((a, b) => birthdayParts(a).day - birthdayParts(b).day);
  if (customerFilter === 'inactive') list = list.filter(c => (daysSinceActivity(c) ?? 0) > 60).sort((a, b) => daysSinceActivity(b) - daysSinceActivity(a));
  renderCustomerFilters();
  renderCustomers(list);
}

function renderCustomers(customers) {
  const el = document.getElementById('customers-content');

  if (!allCustomers.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🤍</div>
        <h3>Sin clientes registrados</h3>
        <p>Agrégalos aquí o desde un pedido de la página ("Guardar como cliente").</p>
        <button class="btn btn-primary" onclick="openCustomerModal()">+ Agregar cliente</button>
      </div>`;
    return;
  }

  const spent = c => (c.total_spent || 0) + (c.order_total || 0);
  const totalSpent = allCustomers.reduce((s, c) => s + spent(c), 0);
  const buyers = allCustomers.filter(c => c.purchase_count + c.order_count > 0);
  const tickets = buyers.reduce((s, c) => s + c.purchase_count + c.order_count, 0);

  // Cumpleaños de este mes, con botón para saludar
  const month = new Date().getMonth();
  const bdays = allCustomers.filter(isBirthdayMonth).sort((a, b) => birthdayParts(a).day - birthdayParts(b).day);
  const today = new Date().getDate();

  el.innerHTML = `
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
      <div class="stat-card"><span class="stat-icon">🤍</span><div class="stat-label">Clientes</div><div class="stat-value">${allCustomers.length}</div></div>
      <div class="stat-card warning"><span class="stat-icon">⭐</span><div class="stat-label">VIP</div><div class="stat-value">${allCustomers.filter(c => c.is_vip).length}</div></div>
      <div class="stat-card success"><span class="stat-icon">💰</span><div class="stat-label">Total comprado</div><div class="stat-value">${fmt(totalSpent)}</div></div>
      <div class="stat-card info"><span class="stat-icon">🧾</span><div class="stat-label">Ticket promedio</div><div class="stat-value">${fmt(tickets ? totalSpent / tickets : 0)}</div></div>
    </div>

    ${bdays.length && customerFilter !== 'birthday' ? `
      <div class="cust-bdays">
        <div class="cust-bdays-title">🎂 Cumpleaños de ${MONTHS[month]}</div>
        <div class="cust-bdays-list">
          ${bdays.map(c => {
            const d = birthdayParts(c).day;
            const wa = waCustomerLink(c.phone, `¡Feliz cumpleaños, ${c.name.split(' ')[0]}! 🎂 Te saludamos con mucho cariño desde mimo 🕯️`);
            return `<div class="cust-bday ${d === today ? 'today' : d < today ? 'past' : ''}">
              <strong>${d}</strong> ${escCust(c.name)}${d === today ? ' · ¡hoy!' : ''}
              ${wa ? `<a class="btn btn-ghost btn-sm" href="${wa}" target="_blank" rel="noopener">Saludar 💬</a>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}

    ${customers.length ? `<div class="customer-list">${customers.map(c => customerItem(c)).join('')}</div>`
      : '<div class="empty-state" style="padding:30px"><p>Ningún cliente con este filtro.</p></div>'}
  `;
}

function customerItem(c) {
  const days = daysSinceActivity(c);
  const total = (c.total_spent || 0) + (c.order_total || 0);
  const count = (c.purchase_count || 0) + (c.order_count || 0);
  const bd = birthdayParts(c);
  const wa = waCustomerLink(c.phone);

  return `
    <div class="customer-item ${c.is_vip ? 'vip' : ''}" onclick="openCustomerDetail(${c.id})">
      <div class="customer-avatar">${escCust(getInitials(c.name))}</div>
      <div style="flex:1;min-width:0">
        <div class="customer-name">
          ${escCust(c.name)} ${c.is_vip ? '<span class="vip-star">⭐</span>' : ''}
        </div>
        <div class="customer-meta">
          ${c.instagram ? `<span>📸 ${escCust(c.instagram)}</span>` : ''}
          ${c.phone ? `<span>📱 ${escCust(c.phone)}</span>` : ''}
          ${bd && isBirthdayMonth(c) ? `<span>🎂 ${bd.day} de ${MONTHS[bd.month]}</span>` : ''}
          ${days !== null && days > 60 ? `<span style="color:var(--warning)">💤 Sin comprar hace ${days} días</span>` : ''}
        </div>
        ${c.preferences ? `<div class="customer-prefs">${escCust(c.preferences)}</div>` : ''}
      </div>
      <div class="customer-stats">
        <div class="customer-spent">${fmt(total)}</div>
        <div class="customer-count">${count} ${count === 1 ? 'compra' : 'compras'}</div>
        ${lastActivity(c) ? `<div style="font-size:0.7rem;color:var(--text-muted)">${fmtDate(new Date(lastActivity(c)).toISOString())}</div>` : ''}
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0" onclick="event.stopPropagation()">
        ${wa ? `<a class="btn btn-ghost btn-sm btn-icon cust-wa" href="${wa}" target="_blank" rel="noopener" title="Escribir por WhatsApp">💬</a>` : ''}
        <button class="btn btn-ghost btn-sm btn-icon" onclick="openCustomerModal(${c.id})" title="Editar">✏️</button>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="confirmDeleteCustomer(${c.id})" title="Eliminar">🗑️</button>
      </div>
    </div>`;
}

// ── Customer Modal ────────────────────────────────
async function openCustomerModal(id = null) {
  editingCustomerId = id;
  document.getElementById('customer-modal-title').textContent = id ? 'Editar cliente' : 'Nuevo cliente';

  if (id) {
    const c = await API.customer(id);
    document.getElementById('cm-id').value = c.id;
    document.getElementById('cm-name').value = c.name;
    document.getElementById('cm-phone').value = c.phone || '';
    document.getElementById('cm-ig').value = c.instagram || '';
    document.getElementById('cm-email').value = c.email || '';
    document.getElementById('cm-birthday').value = c.birthday || '';
    document.getElementById('cm-prefs').value = c.preferences || '';
    document.getElementById('cm-notes').value = c.notes || '';
    document.getElementById('cm-vip').checked = !!c.is_vip;
  } else {
    ['cm-id','cm-name','cm-phone','cm-ig','cm-email','cm-birthday','cm-prefs','cm-notes'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('cm-vip').checked = false;
  }
  openModal('customer-modal');
}

async function saveCustomer() {
  const name = document.getElementById('cm-name').value.trim();
  if (!name) { toast('El nombre es requerido', 'warning'); return; }

  const data = {
    name,
    phone: document.getElementById('cm-phone').value || null,
    instagram: document.getElementById('cm-ig').value || null,
    email: document.getElementById('cm-email').value || null,
    birthday: document.getElementById('cm-birthday').value || null,
    preferences: document.getElementById('cm-prefs').value || null,
    notes: document.getElementById('cm-notes').value || null,
    is_vip: document.getElementById('cm-vip').checked,
  };

  try {
    if (editingCustomerId) {
      await API.updateCustomer(editingCustomerId, data);
      toast('Cliente actualizado ✓', 'success');
      closeModal('customer-modal');
      await loadCustomers();
      if (typeof refreshPOSCustomers === 'function') await refreshPOSCustomers();
    } else {
      const res = await API.createCustomer(data);
      toast('Cliente registrado ✓', 'success');
      closeModal('customer-modal');
      // Refresh POS dropdown and auto-select the new customer
      if (typeof refreshPOSCustomers === 'function') await refreshPOSCustomers(res.id);
      await loadCustomers();
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function confirmDeleteCustomer(id) {
  const name = allCustomers.find(c => c.id === id)?.name || 'este cliente';
  if (!confirm(`¿Eliminar a "${name}"? Sus pedidos se mantienen.`)) return;
  try {
    await API.deleteCustomer(id);
    toast('Cliente eliminado', 'info');
    await loadCustomers();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function openCustomerDetail(id) {
  try {
    const c = await API.customer(id);
    document.getElementById('cd-title').textContent = c.name + (c.is_vip ? ' ⭐' : '');
    const lastOrder = c.orders?.find(o => o.status !== 'cancelled')?.created_at;
    const daysSince = daysSinceActivity({ last_purchase: c.last_purchase, last_order: lastOrder });
    const wa = waCustomerLink(c.phone, `¡Hola ${c.name.split(' ')[0]}! Te escribimos desde mimo 🕯️`);
    const orderLabel = { pending:'⏳ Pendiente', confirmed:'✅ Confirmado', paid:'💰 Pagado', shipped:'📦 Enviado', delivered:'🎁 Entregado', cancelled:'❌ Cancelado' };

    document.getElementById('cd-body').innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
        <div class="user-avatar" style="width:56px;height:56px;font-size:1.2rem;${c.is_vip ? 'background:rgba(245,158,11,0.15);border-color:var(--warning);color:var(--warning)' : ''}">
          ${escCust(getInitials(c.name))}
        </div>
        <div>
          <h3 style="font-size:1.1rem;font-weight:700">${escCust(c.name)}</h3>
          ${c.instagram ? `<div style="color:var(--text-muted);font-size:0.85rem">📸 ${escCust(c.instagram)}</div>` : ''}
          ${c.phone ? `<div style="color:var(--text-muted);font-size:0.85rem">📱 ${escCust(c.phone)}</div>` : ''}
          ${wa ? `<a class="btn btn-secondary btn-sm cust-wa" style="margin-top:6px" href="${wa}" target="_blank" rel="noopener">💬 Escribir por WhatsApp</a>` : ''}
        </div>
        <div style="margin-left:auto;text-align:right">
          <div style="font-size:1.4rem;font-weight:700;color:var(--accent-light)">${fmt(c.total_spent)}</div>
          <div style="color:var(--text-muted);font-size:0.8rem">${c.purchase_count} ventas · ${(c.orders || []).length} pedidos</div>
        </div>
      </div>

      <div class="grid-2 mb-4">
        ${c.birthday ? `<div class="report-card"><div class="stat-label">🎂 Cumpleaños</div><div style="margin-top:4px;font-weight:600">${fmtDate(c.birthday + 'T12:00:00')}</div></div>` : ''}
        ${daysSince !== null ? `<div class="report-card ${daysSince > 30 ? 'border-warning' : ''}">
          <div class="stat-label">🕐 Última compra o pedido</div>
          <div style="margin-top:4px;font-weight:600;color:${daysSince > 30 ? 'var(--warning)' : 'var(--text-primary)'}">
            Hace ${daysSince} días
          </div>
        </div>` : ''}
        ${c.preferences ? `<div class="report-card" style="grid-column:1/-1"><div class="stat-label">💫 Gustos</div><div style="margin-top:4px">${escCust(c.preferences)}</div></div>` : ''}
        ${c.notes ? `<div class="report-card" style="grid-column:1/-1;background:rgba(245,158,11,0.05);border-color:rgba(245,158,11,0.2)"><div class="stat-label">📝 Notas privadas</div><div style="margin-top:4px;white-space:pre-line">${escCust(c.notes)}</div></div>` : ''}
      </div>

      ${c.orders?.length ? `
        <h4 style="font-weight:700;margin-bottom:10px">Pedidos</h4>
        <div class="order-lines mb-4">
          ${c.orders.map(o => `
            <div class="order-line" style="cursor:pointer" onclick="closeModal('customer-detail-modal');openOrderDetail(${o.id})">
              <div><strong>#${o.id}</strong> ${o.type === 'web' ? '🛍️ web' : ''} · ${orderLabel[o.status] || escCust(o.status)}
                <br><small>${escCust((o.description || '').split('\n').slice(0, 2).join(' · '))}</small></div>
              <div style="text-align:right">${fmt(o.total)}<br><small>${fmtDate(o.created_at)}</small></div>
            </div>`).join('')}
        </div>` : ''}

      ${c.purchases?.length ? `
        <h4 style="font-weight:700;margin-bottom:10px">Historial de ventas</h4>
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Productos</th><th>Total</th><th>Estado</th><th>Fecha</th></tr></thead>
            <tbody>
              ${c.purchases.map(p => `
                <tr>
                  <td><span class="tag">#${p.id}</span></td>
                  <td style="font-size:0.78rem;color:var(--text-muted)">${escCust(p.items || '—')}</td>
                  <td class="text-accent font-bold">${fmt(p.total)}</td>
                  <td>${paymentBadge(p.payment_status)}</td>
                  <td style="font-size:0.78rem;white-space:nowrap">${fmtDate(p.created_at)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      ` : (c.orders?.length ? '' : '<div class="empty-state" style="padding:30px"><p>Sin compras ni pedidos todavía</p></div>')}
    `;

    document.getElementById('cd-footer').innerHTML = `
      <button class="btn btn-secondary" onclick="closeModal('customer-detail-modal')">Cerrar</button>
      <button class="btn btn-secondary" onclick="closeModal('customer-detail-modal');openCustomerModal(${c.id})">✏️ Editar</button>
      <button class="btn btn-primary" onclick="closeModal('customer-detail-modal');navigate('sales');setTimeout(()=>{const sel=document.getElementById('pos-customer');if(sel)sel.value='${c.id}'},500)">
        💳 Nueva venta
      </button>
    `;

    openModal('customer-detail-modal');
  } catch (err) {
    toast(err.message, 'error');
  }
}
