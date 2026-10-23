// ── Customers / CRM Module ───────────────────────────────────
let allCustomers = [];
let showVIPOnly = false;
let editingCustomerId = null;

async function loadCustomers() {
  try {
    allCustomers = await API.customers();
    renderCustomers(allCustomers);
  } catch (err) {
    toast('Error cargando clientes: ' + err.message, 'error');
  }
}

function renderCustomers(customers) {
  const el = document.getElementById('customers-content');

  if (!customers.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🤍</div>
        <h3>Sin clientes registrados</h3>
        <p>Empieza a construir tu base de clientes</p>
        <button class="btn btn-primary" onclick="openCustomerModal()">+ Agregar cliente</button>
      </div>`;
    return;
  }

  // Stats bar
  const vipCount = customers.filter(c => c.is_vip).length;
  const totalSpent = customers.reduce((s, c) => s + c.total_spent, 0);
  const avgTicket = customers.filter(c => c.purchase_count > 0).length > 0
    ? totalSpent / customers.filter(c => c.purchase_count > 0).reduce((s, c) => s + c.purchase_count, 0)
    : 0;

  el.innerHTML = `
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
      <div class="stat-card">
        <span class="stat-icon">🤍</span>
        <div class="stat-label">Total clientes</div>
        <div class="stat-value">${customers.length}</div>
      </div>
      <div class="stat-card warning">
        <span class="stat-icon">⭐</span>
        <div class="stat-label">Clientes VIP</div>
        <div class="stat-value">${vipCount}</div>
      </div>
      <div class="stat-card success">
        <span class="stat-icon">💰</span>
        <div class="stat-label">Total facturado</div>
        <div class="stat-value">${fmt(totalSpent)}</div>
      </div>
      <div class="stat-card info">
        <span class="stat-icon">🧾</span>
        <div class="stat-label">Ticket promedio</div>
        <div class="stat-value">${fmt(avgTicket)}</div>
      </div>
    </div>

    <div class="customer-list">
      ${customers.map(c => customerItem(c)).join('')}
    </div>
  `;
}

function customerItem(c) {
  const initials = getInitials(c.name);
  const daysSince = c.last_purchase
    ? Math.floor((Date.now() - new Date(c.last_purchase).getTime()) / 86400000)
    : null;
  const inactiveAlert = daysSince && daysSince > 30;

  return `
    <div class="customer-item ${c.is_vip ? 'vip' : ''}" onclick="openCustomerDetail(${c.id})">
      <div class="customer-avatar">${initials}</div>
      <div style="flex:1;min-width:0">
        <div class="customer-name">
          ${c.name} ${c.is_vip ? '<span class="vip-star">⭐</span>' : ''}
        </div>
        <div class="customer-meta">
          ${c.instagram ? `<span>📸 ${c.instagram}</span>` : ''}
          ${c.phone ? `<span>📱 ${c.phone}</span>` : ''}
          ${inactiveAlert ? `<span style="color:var(--warning)">⚠️ Sin comprar hace ${daysSince}d</span>` : ''}
        </div>
      </div>
      <div class="customer-stats">
        <div class="customer-spent">${fmt(c.total_spent)}</div>
        <div class="customer-count">${c.purchase_count} compras</div>
        ${c.last_purchase ? `<div style="font-size:0.7rem;color:var(--text-muted)">${fmtDate(c.last_purchase)}</div>` : ''}
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0" onclick="event.stopPropagation()">
        <button class="btn btn-ghost btn-sm btn-icon" onclick="openCustomerModal(${c.id})" title="Editar">✏️</button>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="confirmDeleteCustomer(${c.id},'${c.name}')" title="Eliminar">🗑️</button>
      </div>
    </div>`;
}

function filterCustomers() {
  const q = document.getElementById('cust-search').value.toLowerCase();
  let filtered = allCustomers.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.phone || '').includes(q) ||
    (c.instagram || '').toLowerCase().includes(q) ||
    (c.email || '').toLowerCase().includes(q)
  );
  if (showVIPOnly) filtered = filtered.filter(c => c.is_vip);
  renderCustomers(filtered);
}

function toggleVIPFilter() {
  showVIPOnly = !showVIPOnly;
  const btn = document.getElementById('vip-filter-btn');
  btn.classList.toggle('btn-primary', showVIPOnly);
  btn.classList.toggle('btn-secondary', !showVIPOnly);
  filterCustomers();
}

// ── Customer Modal ────────────────────────────────
async function openCustomerModal(id = null) {
  editingCustomerId = id;
  document.getElementById('customer-modal-title').textContent = id ? 'Editar Cliente' : 'Nueva Cliente';

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
      toast('Cliente actualizada ✓', 'success');
      closeModal('customer-modal');
      await loadCustomers();
      if (typeof refreshPOSCustomers === 'function') await refreshPOSCustomers();
    } else {
      const res = await API.createCustomer(data);
      toast('Cliente registrada ✓', 'success');
      closeModal('customer-modal');
      // Refresh POS dropdown and auto-select the new customer
      if (typeof refreshPOSCustomers === 'function') await refreshPOSCustomers(res.id);
      await loadCustomers();
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function confirmDeleteCustomer(id, name) {
  if (!confirm(`¿Eliminar a "${name}"?`)) return;
  try {
    await API.deleteCustomer(id);
    toast('Cliente eliminada', 'info');
    await loadCustomers();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function openCustomerDetail(id) {
  try {
    const c = await API.customer(id);
    document.getElementById('cd-title').textContent = c.name + (c.is_vip ? ' ⭐' : '');

    const daysSince = c.last_purchase
      ? Math.floor((Date.now() - new Date(c.last_purchase).getTime()) / 86400000)
      : null;

    document.getElementById('cd-body').innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
        <div class="user-avatar" style="width:56px;height:56px;font-size:1.2rem;${c.is_vip ? 'background:rgba(245,158,11,0.15);border-color:var(--warning);color:var(--warning)' : ''}">
          ${getInitials(c.name)}
        </div>
        <div>
          <h3 style="font-size:1.1rem;font-weight:700">${c.name}</h3>
          ${c.instagram ? `<div style="color:var(--text-muted);font-size:0.85rem">📸 ${c.instagram}</div>` : ''}
          ${c.phone ? `<div style="color:var(--text-muted);font-size:0.85rem">📱 ${c.phone}</div>` : ''}
        </div>
        <div style="margin-left:auto;text-align:right">
          <div style="font-size:1.4rem;font-weight:700;color:var(--accent-light)">${fmt(c.total_spent)}</div>
          <div style="color:var(--text-muted);font-size:0.8rem">${c.purchase_count} compras</div>
        </div>
      </div>

      <div class="grid-2 mb-4">
        ${c.birthday ? `<div class="report-card"><div class="stat-label">🎂 Cumpleaños</div><div style="margin-top:4px;font-weight:600">${fmtDate(c.birthday + 'T12:00:00')}</div></div>` : ''}
        ${daysSince !== null ? `<div class="report-card ${daysSince > 30 ? 'border-warning' : ''}">
          <div class="stat-label">🕐 Última compra</div>
          <div style="margin-top:4px;font-weight:600;color:${daysSince > 30 ? 'var(--warning)' : 'var(--text-primary)'}">
            Hace ${daysSince} días
          </div>
        </div>` : ''}
        ${c.preferences ? `<div class="report-card" style="grid-column:1/-1"><div class="stat-label">💫 Preferencias</div><div style="margin-top:4px">${c.preferences}</div></div>` : ''}
        ${c.notes ? `<div class="report-card" style="grid-column:1/-1;background:rgba(245,158,11,0.05);border-color:rgba(245,158,11,0.2)"><div class="stat-label">📝 Notas privadas</div><div style="margin-top:4px">${c.notes}</div></div>` : ''}
      </div>

      ${c.purchases?.length ? `
        <h4 style="font-weight:700;margin-bottom:10px">Historial de compras</h4>
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Productos</th><th>Total</th><th>Estado</th><th>Fecha</th></tr></thead>
            <tbody>
              ${c.purchases.map(p => `
                <tr>
                  <td><span class="tag">#${p.id}</span></td>
                  <td style="font-size:0.78rem;color:var(--text-muted)">${p.items || '—'}</td>
                  <td class="text-accent font-bold">${fmt(p.total)}</td>
                  <td>${paymentBadge(p.payment_status)}</td>
                  <td style="font-size:0.78rem;white-space:nowrap">${fmtDate(p.created_at)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      ` : '<div class="empty-state" style="padding:30px"><p>Sin compras registradas</p></div>'}
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
