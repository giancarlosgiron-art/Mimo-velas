// ── Sales / POS Module ───────────────────────────────────────
let cart = [];
let posProducts = [];
let posCustomers = [];

async function initPOS() {
  try {
    [posProducts, posCustomers] = await Promise.all([API.products(), API.customers()]);
    renderPOS();
  } catch (err) {
    toast('Error cargando POS: ' + err.message, 'error');
  }
}

function renderPOS() {
  document.getElementById('sales-content').innerHTML = `
    <div class="pos-layout">
      <!-- Products Panel -->
      <div class="pos-products">
        <div class="card mb-4">
          <div class="card-body" style="padding:12px 14px">
            <div class="search-bar" style="width:100%">
              <span class="search-icon">🔍</span>
              <input type="text" placeholder="Buscar producto o SKU…" id="pos-search" oninput="filterPOSProducts()" />
            </div>
          </div>
        </div>
        <div class="product-grid" id="pos-product-grid">
          ${posProducts.map(p => posProductCard(p)).join('')}
        </div>
        <div style="margin-top:16px;padding:14px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg)">
          <div style="font-size:0.82rem;font-weight:600;color:var(--text-muted);margin-bottom:10px">➕ Producto libre (sin inventario)</div>
          <div class="form-row">
            <div class="form-group" style="margin:0">
              <input type="text" class="form-control" id="free-product-name" placeholder="Descripción del producto" />
            </div>
            <div class="form-group" style="margin:0">
              <input type="number" class="form-control" id="free-product-price" placeholder="Precio ($)" min="0" step="0.01" />
            </div>
            <button class="btn btn-secondary" onclick="addFreeProduct()">Agregar</button>
          </div>
        </div>
      </div>

      <!-- Checkout Panel -->
      <div class="pos-checkout">
        <div class="pos-checkout-header">
          <div style="font-weight:700;font-size:0.95rem">🛒 Carrito</div>
          <div style="font-size:0.78rem;color:var(--text-muted)" id="cart-count">0 productos</div>
        </div>

        <div class="cart-items" id="cart-items">
          <div style="padding:40px 20px;text-align:center;color:var(--text-muted)">
            <div style="font-size:2rem;margin-bottom:8px">🛒</div>
            <p style="font-size:0.85rem">Toca un producto para agregarlo</p>
          </div>
        </div>

        <div class="pos-totals">
          <div class="total-row">
            <span style="color:var(--text-secondary)">Subtotal</span>
            <span id="pos-subtotal">$0.00</span>
          </div>
          <div class="total-row">
            <span style="color:var(--text-secondary)">Descuento</span>
            <div style="display:flex;align-items:center;gap:6px">
              <input type="number" id="pos-discount" value="0" min="0" step="0.01"
                     style="width:70px;padding:4px 8px;border-radius:6px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-size:0.85rem;text-align:right"
                     oninput="updateCartTotals()" />
            </div>
          </div>
          <div class="total-row grand">
            <span>TOTAL</span>
            <span class="amount" id="pos-total">$0.00</span>
          </div>

          <div style="margin-top:14px">
            <div class="form-group" style="margin-bottom:10px">
              <label class="form-label">Cliente (opcional)</label>
              <div style="display:flex;gap:6px;align-items:center">
                <select class="form-control" id="pos-customer" style="font-size:0.82rem;flex:1">
                  <option value="">Cliente ocasional</option>
                  ${posCustomers.map(c => `<option value="${c.id}">${c.name}${c.is_vip ? ' ⭐' : ''}</option>`).join('')}
                </select>
                <button class="btn btn-secondary btn-sm" onclick="openCustomerModal()" title="Nuevo cliente" style="flex-shrink:0;padding:0 12px;font-size:1.1rem;line-height:1">+</button>
              </div>
            </div>

            <div class="form-group" style="margin-bottom:10px">
              <label class="form-label">Método de pago</label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                ${['cash','transfer','card','partial'].map(m => {
                  const icons = {cash:'💵',transfer:'📲',card:'💳',partial:'🤝'};
                  const labels = {cash:'Efectivo',transfer:'Transferencia',card:'Débito/Crédito',partial:'Abono'};
                  return `<button class="btn btn-secondary btn-sm pay-method-btn ${m==='cash'?'active':''}"
                    data-method="${m}" onclick="selectPayMethod('${m}')">
                    ${icons[m]} ${labels[m]}
                  </button>`;
                }).join('')}
              </div>
            </div>

            <div id="partial-amount-group" style="display:none" class="form-group">
              <label class="form-label">Monto abonado ($)</label>
              <input type="number" class="form-control" id="pos-amount-paid" placeholder="0.00" min="0" step="0.01" oninput="updateCartTotals()" />
            </div>

            <div class="form-group" style="margin-bottom:0">
              <textarea class="form-control" id="pos-notes" placeholder="Notas de la venta…" rows="2" style="font-size:0.82rem"></textarea>
            </div>
          </div>
        </div>

        <div class="pos-actions">
          <button class="btn btn-primary w-full btn-lg" onclick="processSale()" id="checkout-btn" disabled>
            Registrar Venta
          </button>
        </div>
      </div>
    </div>
  `;
}

function posProductCard(p) {
  const disabled = p.stock === 0;
  return `
    <div class="product-card ${disabled ? 'opacity-50' : ''}"
         onclick="${disabled ? '' : `addToCart(${p.id})`}"
         style="${disabled ? 'opacity:0.4;cursor:not-allowed' : 'cursor:pointer'}">
      <div class="product-image">
        ${p.image ? `<img src="${p.image}" alt="${p.name}" />` : `<span>${p.category_icon || '📦'}</span>`}
      </div>
      <div class="product-info">
        <div class="product-name">${p.name}</div>
        <div class="product-sku">${p.sku}</div>
        <div class="product-price">${fmt(p.sale_price)}</div>
        <div class="product-footer">
          ${stockBadge(p.status, p.stock)}
        </div>
      </div>
    </div>`;
}

function filterPOSProducts() {
  const q = document.getElementById('pos-search').value.toLowerCase();
  const filtered = posProducts.filter(p =>
    p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
  );
  document.getElementById('pos-product-grid').innerHTML = filtered.map(p => posProductCard(p)).join('');
}

function addToCart(productId) {
  const product = posProducts.find(p => p.id === productId);
  if (!product || product.stock === 0) return;

  const existing = cart.find(i => i.product_id === productId);
  if (existing) {
    if (existing.quantity >= product.stock) {
      toast(`Máximo disponible: ${product.stock}`, 'warning');
      return;
    }
    existing.quantity++;
  } else {
    cart.push({
      product_id: productId,
      product_name: product.name,
      unit_price: product.sale_price,
      cost_price: product.cost_price,
      quantity: 1,
      discount: 0,
    });
  }
  renderCart();
}

function addFreeProduct() {
  const name = document.getElementById('free-product-name').value.trim();
  const price = parseFloat(document.getElementById('free-product-price').value);
  if (!name || !price) { toast('Ingresa nombre y precio', 'warning'); return; }
  cart.push({ product_id: null, product_name: name, unit_price: price, cost_price: 0, quantity: 1, discount: 0 });
  document.getElementById('free-product-name').value = '';
  document.getElementById('free-product-price').value = '';
  renderCart();
  toast(`"${name}" agregado al carrito`, 'success');
}

function changeQty(index, delta) {
  cart[index].quantity += delta;
  if (cart[index].quantity <= 0) cart.splice(index, 1);
  renderCart();
}

function removeCartItem(index) {
  cart.splice(index, 1);
  renderCart();
}

function renderCart() {
  const el = document.getElementById('cart-items');
  const countEl = document.getElementById('cart-count');
  const btn = document.getElementById('checkout-btn');

  if (!cart.length) {
    el.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--text-muted)">
      <div style="font-size:2rem;margin-bottom:8px">🛒</div>
      <p style="font-size:0.85rem">Carrito vacío</p></div>`;
    countEl.textContent = '0 productos';
    btn.disabled = true;
    updateCartTotals();
    return;
  }

  countEl.textContent = `${cart.reduce((s, i) => s + i.quantity, 0)} productos`;
  btn.disabled = false;

  el.innerHTML = cart.map((item, i) => `
    <div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.product_name}</div>
        <div class="cart-item-price">${fmt(item.unit_price)} c/u</div>
      </div>
      <div class="cart-qty-controls">
        <button class="qty-btn" onclick="changeQty(${i}, -1)">−</button>
        <span class="qty-display">${item.quantity}</span>
        <button class="qty-btn" onclick="changeQty(${i}, 1)">+</button>
      </div>
      <div class="cart-item-total">${fmt(item.unit_price * item.quantity)}</div>
      <button class="btn btn-ghost btn-sm" onclick="removeCartItem(${i})" style="padding:4px">✕</button>
    </div>
  `).join('');

  updateCartTotals();
}

function updateCartTotals() {
  const subtotal = cart.reduce((s, i) => s + (i.unit_price * i.quantity), 0);
  const discount = parseFloat(document.getElementById('pos-discount')?.value) || 0;
  const total = Math.max(0, subtotal - discount);
  document.getElementById('pos-subtotal').textContent = fmt(subtotal);
  document.getElementById('pos-total').textContent = fmt(total);
}

function selectPayMethod(method) {
  document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('active', 'btn-primary'));
  document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.add('btn-secondary'));
  document.querySelector(`[data-method="${method}"]`)?.classList.replace('btn-secondary', 'btn-primary');
  document.getElementById('partial-amount-group').style.display = method === 'partial' ? 'block' : 'none';
}

async function processSale() {
  if (!cart.length) { toast('El carrito está vacío', 'warning'); return; }

  const btn = document.getElementById('checkout-btn');
  btn.disabled = true;
  btn.textContent = 'Procesando…';

  const subtotal = cart.reduce((s, i) => s + (i.unit_price * i.quantity), 0);
  const discount = parseFloat(document.getElementById('pos-discount').value) || 0;
  const total = Math.max(0, subtotal - discount);
  const method = document.querySelector('.pay-method-btn.btn-primary')?.dataset.method || 'cash';
  const amountPaid = method === 'partial'
    ? parseFloat(document.getElementById('pos-amount-paid')?.value) || 0
    : total;
  const customerId = document.getElementById('pos-customer').value || null;
  const notes = document.getElementById('pos-notes').value;

  try {
    const res = await API.createSale({
      customer_id: customerId,
      items: cart,
      discount,
      payment_method: method,
      amount_paid: amountPaid,
      notes,
    });

    showReceipt(res.id, { cart, total, discount, method, amountPaid, customerId });
    openModal('receipt-modal');
    await loadNotifications();
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Registrar Venta';
  }
}

function showReceipt(saleId, data) {
  const customer = posCustomers.find(c => String(c.id) === String(data.customerId));
  const balance = Math.max(0, data.total - data.amountPaid);
  document.getElementById('receipt-body').innerHTML = `
    <div style="font-family:monospace;background:var(--bg-base);border-radius:12px;padding:20px;font-size:0.82rem">
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-size:1.2rem;font-weight:700">mimo</div>
        <div style="color:var(--text-muted)">${new Date().toLocaleString('es-VE')}</div>
        <div style="margin-top:4px">Venta #${saleId}</div>
      </div>
      <div style="border-top:1px dashed var(--border);padding-top:12px;margin-bottom:12px">
        <div><strong>Cliente:</strong> ${customer?.name || 'Ocasional'}</div>
      </div>
      ${data.cart.map(i => `
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span>${i.product_name} x${i.quantity}</span>
          <span>${fmt(i.unit_price * i.quantity)}</span>
        </div>`).join('')}
      <div style="border-top:1px dashed var(--border);margin:12px 0;padding-top:10px">
        ${data.discount > 0 ? `<div style="display:flex;justify-content:space-between"><span>Descuento:</span><span>-${fmt(data.discount)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;font-size:1rem;font-weight:700;color:var(--accent-light)">
          <span>TOTAL</span><span>${fmt(data.total)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:4px">
          <span>Pagado:</span><span>${fmt(data.amountPaid)}</span>
        </div>
        ${balance > 0 ? `<div style="display:flex;justify-content:space-between;color:var(--warning)"><span>Balance:</span><span>${fmt(balance)}</span></div>` : ''}
      </div>
      <div style="text-align:center;color:var(--text-muted);margin-top:8px">¡Gracias por tu compra! 💕</div>
    </div>
  `;
}

function resetPOS() {
  cart = [];
  initPOS();
}

function printReceipt() {
  window.print();
}

async function showSalesHistory() {
  try {
    const sales = await API.sales({ limit: 30 });
    const el = document.getElementById('sales-content');
    el.innerHTML = `
      <div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
        <h3 style="font-weight:700">Historial de Ventas</h3>
        <button class="btn btn-secondary" onclick="initPOS()">← Volver al POS</button>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Cliente</th><th>Productos</th><th>Total</th><th>Método</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
            <tbody>
              ${sales.map(s => `
                <tr>
                  <td><span class="tag">#${s.id}</span></td>
                  <td>${s.customer_name || 'Ocasional'}</td>
                  <td style="font-size:0.78rem;color:var(--text-muted);max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                    ${s.items?.map(i => i.product_name).join(', ') || '—'}
                  </td>
                  <td class="text-accent font-bold">${fmt(s.total)}</td>
                  <td>${s.payment_method}</td>
                  <td>${paymentBadge(s.payment_status)}</td>
                  <td style="white-space:nowrap;font-size:0.78rem">${fmtDate(s.created_at)}</td>
                  <td>
                    <button class="btn btn-ghost btn-sm" style="color:var(--danger);font-size:0.75rem"
                      onclick="confirmDeleteSale(${s.id}, '${(s.customer_name || 'Ocasional').replace(/'/g, "\\'")}', '${fmt(s.total)}')">
                      🗑️ Anular
                    </button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function confirmDeleteSale(id, customer, total) {
  // Modal de confirmación
  const confirmed = confirm(
    `⚠️ ¿Anular venta #${id}?\n\n` +
    `Cliente: ${customer}\n` +
    `Total: ${total}\n\n` +
    `Se devolverá el stock al inventario.\n` +
    `Esta acción no se puede deshacer.`
  );
  if (!confirmed) return;

  try {
    await API.deleteSale(id);
    toast(`Venta #${id} anulada — stock restaurado ✓`, 'success');
    await showSalesHistory();
    await loadNotifications();
  } catch (err) {
    toast('Error al anular: ' + err.message, 'error');
  }
}

// Refresh customer dropdown in POS after adding a new one
async function refreshPOSCustomers(selectId = null) {
  try {
    posCustomers = await API.customers();
    const sel = document.getElementById('pos-customer');
    if (!sel) return;
    sel.innerHTML = '<option value="">Cliente ocasional</option>' +
      posCustomers.map(c => `<option value="${c.id}">${c.name}${c.is_vip ? ' ⭐' : ''}</option>`).join('');
    if (selectId) sel.value = String(selectId);
  } catch {}
}

// Style active payment method button
document.addEventListener('click', e => {
  if (e.target.classList.contains('pay-method-btn')) {
    document.querySelectorAll('.pay-method-btn').forEach(b => {
      b.classList.remove('btn-primary');
      b.classList.add('btn-secondary');
    });
    e.target.classList.remove('btn-secondary');
    e.target.classList.add('btn-primary');
  }
});
