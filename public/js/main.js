// ── Main App — Router, Auth, Shell ──────────────────────────

// Las notificaciones pueden traer texto escrito por clientes (pedidos web): se escapa siempre
function escNotif(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const App = {
  currentPage: 'dashboard',
  user: null,
  theme: localStorage.getItem('mimo_theme') || 'light',
};

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  inventory: 'Inventario',
  sales: 'Nueva Venta',
  customers: 'Clientes',
  orders: 'Pedidos y Reservas',
  reports: 'Reportes',
  expenses: 'Gastos',
  site: 'Mi página',
};

const HEADER_ACTIONS = {
  dashboard: { text: '+ Nueva venta', page: 'sales' },
  inventory: { text: '+ Producto', action: 'openProductModal' },
  sales:     { text: '🧹 Limpiar', action: 'resetPOS' },
  customers: { text: '+ Cliente', action: 'openCustomerModal' },
  orders:    { text: '+ Pedido', action: 'openOrderModal' },
  reports:   { text: '📊 Generar', action: 'loadReports' },
  expenses:  { text: '+ Registrar gasto', action: 'openExpenseModal' },
  site:      { text: 'Ver página ↗', action: 'openCatalogSite' },
};

// ── Init ──────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  applyTheme();

  const token = localStorage.getItem('mimo_token');
  if (!token) {
    showAuthScreen();
    return;
  }

  try {
    App.user = await API.me();
    await showApp();
  } catch {
    localStorage.removeItem('mimo_token');
    showAuthScreen();
  }
});

// ── Auth ──────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const errEl = document.getElementById('auth-error');
  const email = document.getElementById('login-email').value;
  const pass = document.getElementById('login-pass').value;

  btn.textContent = 'Cargando…';
  btn.disabled = true;
  errEl.style.display = 'none';

  try {
    const res = await API.login(email, pass);
    localStorage.setItem('mimo_token', res.token);
    App.user = res.user;
    await showApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
    btn.textContent = 'Iniciar sesión →';
    btn.disabled = false;
  }
});

function showAuthScreen() {
  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app-layout').style.display = 'none';
}

async function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-layout').style.display = 'flex';

  // Populate user info
  const initials = App.user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  document.getElementById('user-avatar').textContent = initials;
  document.getElementById('user-name').textContent = App.user.name;
  document.getElementById('user-role').textContent = App.user.role === 'admin' ? 'Administrador' : 'Colaborador';

  // Show menu btn on mobile
  if (window.innerWidth <= 768) {
    document.getElementById('menu-btn').style.display = 'flex';
  }

  // Load initial page & notifications
  await Promise.all([navigate('dashboard'), loadNotifications()]);

  // Hide loading
  document.getElementById('loading-screen').style.display = 'none';

  // Auto-refresh notifications every 2 min
  setInterval(loadNotifications, 120000);
}

function logout() {
  localStorage.removeItem('mimo_token');
  App.user = null;
  showAuthScreen();
  toast('Sesión cerrada', 'info');
}

// ── Navigation ────────────────────────────────────
async function navigate(page) {
  if (!PAGE_TITLES[page]) return;
  App.currentPage = page;

  // Update sidebar
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  document.querySelectorAll('.mobile-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Update header
  document.getElementById('header-title').textContent = PAGE_TITLES[page];
  const action = HEADER_ACTIONS[page];
  const btn = document.getElementById('header-action-btn');
  if (action) { btn.textContent = action.text; btn.style.display = ''; }
  else btn.style.display = 'none';

  // Show page
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');

  // Load page data
  closeSidebar();
  switch (page) {
    case 'dashboard': await loadDashboard(); break;
    case 'inventory': await loadInventory(); break;
    case 'sales':     await initPOS(); break;
    case 'customers': await loadCustomers(); break;
    case 'orders':    await loadOrders(); break;
    case 'reports':   await loadReports(); break;
    case 'expenses':  await loadExpenses(); break;
    case 'site':      await loadSite(); break;
  }
}

function handleHeaderAction() {
  const action = HEADER_ACTIONS[App.currentPage];
  if (!action) return;
  if (action.page) navigate(action.page);
  else if (action.action && window[action.action]) window[action.action]();
}

// Wire up nav clicks
document.querySelectorAll('[data-page]').forEach(el => {
  el.addEventListener('click', () => navigate(el.dataset.page));
});

// ── Modals ────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

// ── Toast ─────────────────────────────────────────
function toast(message, type = 'success', duration = 3500) {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || '•'}</span><span style="flex:1">${message}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'none';
    el.style.opacity = '0';
    el.style.transform = 'translateX(100%)';
    el.style.transition = 'all 0.3s ease';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ── Theme ─────────────────────────────────────────
function applyTheme() {
  document.documentElement.setAttribute('data-theme', App.theme);
  // Solo el ícono cambia (antes se reemplazaba todo el contenido, borrando el nombre del usuario)
  document.querySelectorAll('.theme-icon').forEach(el => {
    el.textContent = App.theme === 'dark' ? '☀️' : '🌙';
  });
}
function toggleTheme() {
  App.theme = App.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('mimo_theme', App.theme);
  applyTheme();
}

// ── Sidebar (mobile) ──────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('active');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('active');
}

// ── Notifications ─────────────────────────────────
async function loadNotifications() {
  try {
    const { notifications, unread } = await API.notifications();
    const dot = document.getElementById('notif-dot');
    dot.classList.toggle('hidden', unread === 0);

    // Update badges
    const lowStockCount = notifications.filter(n => n.type === 'warning' && n.link === '/inventory').length;
    const ordersCount = notifications.filter(n => n.link === '/orders' && !n.is_read).length;
    updateBadge('badge-stock', lowStockCount);
    updateBadge('badge-orders', ordersCount);

    const list = document.getElementById('notif-list');
    if (!notifications.length) {
      list.innerHTML = '<div class="empty-state" style="padding:30px"><p>Sin notificaciones</p></div>';
      return;
    }
    const typeColors = { warning: '#f59e0b', danger: '#ef4444', success: '#22c55e', info: '#3b82f6' };
    list.innerHTML = notifications.map(n => `
      <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="navigate('${(n.link||'/dashboard').replace('/','')}'||'dashboard');toggleNotifs()">
        <div class="notif-dot-indicator" style="background:${typeColors[n.type]||'var(--accent)'}"></div>
        <div class="notif-content">
          <div class="notif-title">${escNotif(n.title)}</div>
          ${n.message ? `<div class="notif-msg">${escNotif(n.message)}</div>` : ''}
          <div class="notif-time">${timeAgo(n.created_at)}</div>
        </div>
      </div>
    `).join('');
  } catch {}
}

function updateBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = count;
  el.classList.toggle('hidden', count === 0);
}

function toggleNotifs() {
  document.getElementById('notif-panel').classList.toggle('open');
}

async function markNotifsRead() {
  await API.markNotifsRead();
  document.getElementById('notif-dot').classList.add('hidden');
  document.querySelectorAll('.notif-item').forEach(el => el.classList.remove('unread'));
}

document.addEventListener('click', e => {
  const panel = document.getElementById('notif-panel');
  const btn = document.getElementById('notif-btn');
  if (panel.classList.contains('open') && !panel.contains(e.target) && !btn.contains(e.target)) {
    panel.classList.remove('open');
  }
});

// ── Helpers ───────────────────────────────────────
function fmt(n) {
  const num = n || 0;
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(num);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function timeAgo(date) {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins}m`;
  if (hrs < 24) return `Hace ${hrs}h`;
  return `Hace ${days}d`;
}

function getInitials(name) {
  return (name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function stockBadge(status, stock) {
  if (status === 'out_of_stock' || stock === 0) return `<span class="badge badge-danger">Agotado</span>`;
  if (status === 'low_stock' || stock <= 5) return `<span class="badge badge-warning">⚠️ Stock bajo (${stock})</span>`;
  return `<span class="badge badge-success">${stock} disponibles</span>`;
}

function paymentBadge(status) {
  const map = {
    paid: '<span class="badge badge-success">Pagado</span>',
    partial: '<span class="badge badge-warning">Abono</span>',
    pending: '<span class="badge badge-danger">Pendiente</span>',
    cancelled: '<span class="badge badge-muted">Cancelado</span>',
  };
  return map[status] || `<span class="badge badge-muted">${status}</span>`;
}

function orderStatusBadge(status) {
  const map = {
    pending: '<span class="badge badge-warning">Pendiente</span>',
    confirmed: '<span class="badge badge-info">Confirmado</span>',
    paid: '<span class="badge badge-success">Pagado</span>',
    shipped: '<span class="badge badge-accent">Enviado</span>',
    delivered: '<span class="badge badge-success">✓ Entregado</span>',
    cancelled: '<span class="badge badge-danger">Cancelado</span>',
  };
  return map[status] || `<span class="badge badge-muted">${status}</span>`;
}

function orderProgressDots(status) {
  const steps = ['pending', 'confirmed', 'paid', 'shipped', 'delivered'];
  const idx = steps.indexOf(status);
  return steps.map((s, i) =>
    `<div class="progress-dot ${i < idx ? 'done' : i === idx ? 'active' : ''}"></div>`
  ).join('');
}

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => closeModal(m.id));
    document.getElementById('notif-panel').classList.remove('open');
    closeSidebar();
  }
});

// Responsive
window.addEventListener('resize', () => {
  const btn = document.getElementById('menu-btn');
  if (btn) btn.style.display = window.innerWidth <= 768 ? 'flex' : 'none';
});
