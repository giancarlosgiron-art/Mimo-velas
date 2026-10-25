// ── Inventory Module ─────────────────────────────────────────
let invProducts = [];
let invView = 'grid';
let editingProductId = null;

async function loadInventory() {
  try {
    const [products, cats] = await Promise.all([API.products({admin: true}), API.categories()]);
    invProducts = products;

    // Populate category filter
    const catSel = document.getElementById('inv-cat');
    const existing = Array.from(catSel.options).map(o => o.value);
    cats.forEach(c => {
      if (!existing.includes(String(c.id))) {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.icon} ${c.name}`;
        catSel.appendChild(opt);
      }
    });

    renderInventoryStats(products);
    renderInventory(products);
  } catch (err) {
    toast('Error cargando inventario: ' + err.message, 'error');
  }
}

let invCurrency = 'clp';
function setInvCurrency(curr) {
  invCurrency = curr;
  document.getElementById('inv-currency-clp').style.opacity = curr === 'clp' ? '1' : '0.5';
  document.getElementById('inv-currency-eur').style.opacity = curr === 'eur' ? '1' : '0.5';
  if (typeof invProducts !== 'undefined') renderInventoryStats(invProducts);
}
function renderInventoryStats(products) {
  const total = products.length;
  const available = products.filter(p => p.status === 'available').length;
  const low = products.filter(p => p.status === 'low_stock').length;
  const out = products.filter(p => p.status === 'out_of_stock').length;
  const useEur = invCurrency === 'eur';
  const value = products.reduce((s, p) => {
    const price = useEur ? (p.price_eur || 0) : (p.sale_price || 0);
    return s + price * (p.stock || 0);
  }, 0);
  const symbol = useEur ? '€' : '$';
  const fmtVal = useEur
    ? value.toLocaleString('de-DE', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' €'
    : '$' + value.toLocaleString('es-CL');

  document.getElementById('inventory-stats').innerHTML = `
    <div class="stat-card">
      <span class="stat-icon">📦</span>
      <div class="stat-label">Total productos</div>
      <div class="stat-value">${total}</div>
    </div>
    <div class="stat-card success">
      <span class="stat-icon">✅</span>
      <div class="stat-label">Disponibles</div>
      <div class="stat-value">${available}</div>
    </div>
    <div class="stat-card warning">
      <span class="stat-icon">⚠️</span>
      <div class="stat-label">Stock bajo</div>
      <div class="stat-value">${low}</div>
    </div>
    <div class="stat-card info">
      <span class="stat-icon">💰</span>
      <div class="stat-label">Valor del inventario</div>
      <div class="stat-value">${fmtVal}</div>
    </div>
  `;
}

function renderInventory(products) {
  const el = document.getElementById('inventory-content');

  if (!products.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <h3>Sin productos</h3>
        <p>Agrega tu primer producto al inventario</p>
        <button class="btn btn-primary" onclick="openProductModal()">+ Agregar producto</button>
      </div>`;
    return;
  }

  if (invView === 'grid') {
    el.innerHTML = `
      <div class="product-grid">
        ${products.map(p => productCard(p)).join('')}
      </div>`;
  } else {
    el.innerHTML = `
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Costo</th>
                <th>Precio</th>
                <th>Margen</th>
                <th>Stock</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${products.map(p => productRow(p)).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }
}

function productCard(p) {
  const categoryIcon = p.category_icon || '📦';
  return `
    <div class="product-card" onclick="openProductDetail(${p.id})">
      <div class="product-image">
        ${p.image ? `<img src="${p.image}" alt="${p.name}" />` : `<span>${categoryIcon}</span>`}
      </div>
      <div class="product-info">
        <div class="product-name">${p.name}</div>
        <div class="product-sku">${p.sku}</div>
        <div class="product-price">${invCurrency==="eur" || (!p.sale_price && p.price_eur) ? (p.price_eur ? p.price_eur.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})+" €" : "Sin precio") : fmt(p.sale_price)}</div>
        <div class="product-footer">
          ${stockBadge(p.status, p.stock)}
          <div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm btn-icon" onclick="event.stopPropagation();openProductModal(${p.id})" title="Editar">✏️</button>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="event.stopPropagation();confirmDeleteProduct(${p.id},'${p.name}')" title="Eliminar">🗑️</button>
          </div>
        </div>
      </div>
    </div>`;
}

function productRow(p) {
  return `
    <tr onclick="openProductDetail(${p.id})" style="cursor:pointer">
      <td><span class="tag">${p.sku}</span></td>
      <td>
        <div style="font-weight:600;font-size:0.875rem">${p.name}</div>
        ${p.description ? `<div style="font-size:0.72rem;color:var(--text-muted)">${p.description.slice(0,40)}…</div>` : ''}
      </td>
      <td>${p.category_name ? `<span style="color:${p.category_color}">${p.category_icon} ${p.category_name}</span>` : '—'}</td>
      <td>${fmt(p.cost_price)}</td>
      <td class="text-accent font-bold">${invCurrency==="eur" || (!p.sale_price && p.price_eur) ? (p.price_eur ? p.price_eur.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})+" €" : "Sin precio") : fmt(p.sale_price)}</td>
      <td>
        <span style="color:${parseFloat(p.margin) >= 40 ? 'var(--success)' : parseFloat(p.margin) >= 20 ? 'var(--warning)' : 'var(--danger)'};font-weight:600">
          ${p.margin}%
        </span>
      </td>
      <td><strong>${p.stock}</strong> <span style="color:var(--text-muted);font-size:0.75rem">/ min ${p.min_stock}</span></td>
      <td>${stockBadge(p.status, p.stock)}</td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-sm" onclick="openProductModal(${p.id})">✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="confirmDeleteProduct(${p.id},'${p.name}')">🗑️</button>
        </div>
      </td>
    </tr>`;
}

function filterInventory() {
  const search = document.getElementById('inv-search').value.toLowerCase();
  const cat = document.getElementById('inv-cat').value;
  const status = document.getElementById('inv-status').value;

  const filtered = invProducts.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search) || p.sku.toLowerCase().includes(search);
    const matchCat = !cat || String(p.category_id) === cat;
    const matchStatus = !status || p.status === status;
    return matchSearch && matchCat && matchStatus;
  });

  renderInventory(filtered);
}

function setInventoryView(view) {
  invView = view;
  document.getElementById('view-grid').classList.toggle('btn-primary', view === 'grid');
  document.getElementById('view-grid').classList.toggle('btn-secondary', view !== 'grid');
  document.getElementById('view-list').classList.toggle('btn-primary', view === 'list');
  document.getElementById('view-list').classList.toggle('btn-secondary', view !== 'list');
  filterInventory();
}

// ── Opciones del producto (figuras de wax melt, aromas posibles) ──
function renderAllowedAromas(aromas, selected) {
  const sel = new Set(selected.map(a => a.toLowerCase()));
  // Aromas guardados que ya no están en la lista igual se muestran, para no perderlos
  const names = [...aromas.map(a => a.name), ...selected.filter(a => !aromas.some(x => x.name.toLowerCase() === a.toLowerCase()))];
  document.getElementById('pm-allowed-aromas').innerHTML = names.map(n => `
    <label class="pm-chip"><input type="checkbox" value="${escapeHtml(n)}" ${sel.has(n.toLowerCase()) ? 'checked' : ''} /><span>${escapeHtml(n)}</span></label>`).join('')
    || '<small class="site-hint">Aún no hay aromas. Agrégalos en "Aromas".</small>';
}
function readAllowedAromas() {
  return [...document.querySelectorAll('#pm-allowed-aromas input:checked')].map(i => i.value);
}
function renderProductFormats(list) {
  document.getElementById('pm-formats').innerHTML = list.map(f => productFormatRow(f.name, f.price)).join('');
}
function productFormatRow(name = '', price = '') {
  return `<div class="pm-format-row">
    <input class="form-control" placeholder="Ej: 4 figuras" maxlength="60" value="${escapeHtml(name)}" />
    <input class="form-control" type="number" min="0" step="10" placeholder="Precio CLP" value="${escapeHtml(price)}" />
    <button type="button" class="btn btn-ghost btn-sm btn-icon" title="Quitar" onclick="this.parentElement.remove()">🗑️</button>
  </div>`;
}
function addProductFormat() {
  document.getElementById('pm-formats').insertAdjacentHTML('beforeend', productFormatRow());
  document.querySelector('#pm-formats .pm-format-row:last-child input').focus();
}
function readProductFormats() {
  return [...document.querySelectorAll('#pm-formats .pm-format-row')].map(r => {
    const [n, p] = r.querySelectorAll('input');
    return { name: n.value.trim(), price: parseInt(p.value) || 0 };
  }).filter(f => f.name);
}
function readProductOptions() {
  return document.getElementById('pm-options').value.split('\n').map(s => s.trim()).filter(Boolean);
}

// ── Product Modal ─────────────────────────────────
async function openProductModal(id = null) {
  editingProductId = id;
  document.getElementById('product-modal-title').textContent = id ? 'Editar Producto' : 'Agregar Producto';

  // Load categories into modal
  const cats = await API.categories();
  const sel = document.getElementById('pm-category');
  sel.innerHTML = '<option value="">Sin categoría</option>' + cats.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');

  // Aromas sugeridos para el campo Aroma
  const aromas = await API.aromas().catch(() => []);
  document.getElementById('pm-aroma-list').innerHTML = aromas.map(a => `<option value="${escapeHtml(a.name)}"></option>`).join('');
  document.getElementById('pm-aroma').value = '';
  document.getElementById('pm-options-label').value = '';
  document.getElementById('pm-options').value = '';
  renderAllowedAromas(aromas, []);
  renderProductFormats([]);

  // Reset image field
  document.getElementById('pm-image').value = '';
  document.getElementById('pm-image-preview').style.display = 'none';

  if (id) {
    const p = await API.product(id);
    document.getElementById('pm-id').value = p.id;
    document.getElementById('pm-name').value = p.name;
		document.getElementById('pm-sku').value = p.sku || '';
    document.getElementById('pm-category').value = p.category_id || '';
    document.getElementById('pm-desc').value = p.description || '';
    document.getElementById('pm-aroma').value = p.aroma || '';
    document.getElementById('pm-options-label').value = p.options_label || '';
    document.getElementById('pm-options').value = (p.options || []).join('\n');
    renderAllowedAromas(aromas, p.allowed_aromas || []);
    renderProductFormats(p.formats || []);
    document.getElementById('pm-cost').value = p.cost_price;
    document.getElementById('pm-price').value = p.sale_price;
    document.getElementById('pm-price-eur').value = p.price_eur || '';
    document.getElementById('pm-stock').value = p.stock;
    document.getElementById('pm-minstock').value = p.min_stock;
    document.getElementById('pm-country').value = 'chile';
    // Offer / compare price
    const hasOffer = (p.compare_price > 0 || p.compare_price_eur > 0);
    document.getElementById('pm-has-offer').checked = hasOffer;
    document.getElementById('pm-compare-price').value = p.compare_price || '';
    document.getElementById('pm-compare-price-eur').value = p.compare_price_eur || '';
    document.getElementById('pm-offer-row').style.display = hasOffer ? '' : 'none';
    updatePriceFields();
    calcMargin();
    // Show existing image
    if (p.image) {
      document.getElementById('pm-image-current').src = p.image;
      document.getElementById('pm-image-preview').style.display = 'flex';
      document.getElementById('pm-image-preview').style.alignItems = 'center';
    }
  } else {
    ['pm-id','pm-name','pm-sku','pm-desc','pm-cost','pm-price','pm-price-eur',
     'pm-compare-price','pm-compare-price-eur','pm-stock','pm-minstock','pm-margin'].forEach(fid => {
      const el = document.getElementById(fid);
      if (el) el.value = '';
    });
    document.getElementById('pm-category').value = '';
    document.getElementById('pm-minstock').value = 5;
    document.getElementById('pm-country').value = 'chile';
    document.getElementById('pm-has-offer').checked = false;
    document.getElementById('pm-offer-row').style.display = 'none';
    updatePriceFields();
  }
  openModal('product-modal');
}

function toggleOfferFields() {
  const on = document.getElementById('pm-has-offer').checked;
  document.getElementById('pm-offer-row').style.display = on ? '' : 'none';
  if (!on) {
    document.getElementById('pm-compare-price').value = '';
    document.getElementById('pm-compare-price-eur').value = '';
  }
  updatePriceFields();
}

// mimo vende solo en Chile: el precio en CLP siempre visible, el de EUR siempre oculto.
// (Antes dependía de un selector de país heredado de BML; al crear una vela nueva quedaba vacío
//  y escondía el campo "Precio venta".)
function updatePriceFields() {
  document.getElementById('pm-clp-group').style.display = '';
  document.getElementById('pm-eur-group').style.display = 'none';
  const compareClp = document.getElementById('pm-compare-clp-group');
  const compareEur = document.getElementById('pm-compare-eur-group');
  if (compareClp) compareClp.style.display = '';
  if (compareEur) compareEur.style.display = 'none';
  calcMargin();
}

function calcMargin() {
  const cost = parseFloat(document.getElementById('pm-cost').value) || 0;
  const country = 'chile';
  // Use CLP price for margin if available, otherwise EUR
  const clpPrice = parseFloat(document.getElementById('pm-price').value) || 0;
  const eurPrice = parseFloat(document.getElementById('pm-price-eur').value) || 0;
  const price = (country === 'venezuela') ? eurPrice : clpPrice;
  const el = document.getElementById('pm-margin');
  if (price > 0 && cost > 0) {
    const margin = ((price - cost) / price * 100).toFixed(1);
    const currency = (country === 'venezuela') ? '€' : '$';
    el.value = `${margin}%  (+${currency}${(price - cost).toLocaleString('es-CL')})`;
    el.style.color = parseFloat(margin) >= 40 ? 'var(--success)' : parseFloat(margin) >= 20 ? 'var(--warning)' : 'var(--danger)';
  } else {
    el.value = '';
    el.style.color = '';
  }
}

function previewImage(input) {
  if (!input.files || !input.files[0]) return;
  const preview = document.getElementById('pm-image-preview');
  const img = document.getElementById('pm-image-current');
  img.src = URL.createObjectURL(input.files[0]);
  preview.style.display = 'flex';
  preview.style.alignItems = 'center';
}

// Achica la foto en el navegador (máx. 1600 px, JPEG) antes de subirla: las fotos se guardan en la base de datos
async function compressImage(file, maxSize = 1600, quality = 0.85) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
    return blob ? new File([blob], 'foto.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

async function saveProduct() {
  const name = document.getElementById('pm-name').value.trim();
  if (!name) { toast('El nombre es requerido', 'warning'); return; }

  const rawImage = document.getElementById('pm-image').files[0];
  const imageFile = rawImage ? await compressImage(rawImage) : null;

  // Use FormData when there's an image, plain object otherwise
  let data;
  const country = 'chile';
  const priceEur = document.getElementById('pm-price-eur').value || 0;
  const hasOffer = document.getElementById('pm-has-offer').checked;
  const comparePrice = hasOffer ? (document.getElementById('pm-compare-price').value || 0) : 0;
  const comparePriceEur = hasOffer ? (document.getElementById('pm-compare-price-eur').value || 0) : 0;

  if (imageFile) {
    data = new FormData();
    data.append('name', name);
		data.append('sku', document.getElementById('pm-sku').value.trim().toUpperCase() || '');
    data.append('description', document.getElementById('pm-desc').value || '');
    data.append('aroma', document.getElementById('pm-aroma').value.trim());
    data.append('options_label', document.getElementById('pm-options-label').value.trim());
    data.append('options', JSON.stringify(readProductOptions()));
    data.append('allowed_aromas', JSON.stringify(readAllowedAromas()));
    data.append('formats', JSON.stringify(readProductFormats()));
    data.append('category_id', document.getElementById('pm-category').value || '');
    data.append('cost_price', document.getElementById('pm-cost').value || 0);
    data.append('sale_price', document.getElementById('pm-price').value || 0);
    data.append('price_eur', priceEur);
    data.append('compare_price', comparePrice);
    data.append('compare_price_eur', comparePriceEur);
    data.append('stock', document.getElementById('pm-stock').value || 0);
    data.append('min_stock', document.getElementById('pm-minstock').value || 5);
    data.append('country', country);
    data.append('image', imageFile);
  } else {
    data = {
      name,
      description: document.getElementById('pm-desc').value,
      aroma: document.getElementById('pm-aroma').value.trim(),
      options_label: document.getElementById('pm-options-label').value.trim(),
      options: readProductOptions(),
      allowed_aromas: readAllowedAromas(),
      formats: readProductFormats(),
      category_id: document.getElementById('pm-category').value || null,
      cost_price: document.getElementById('pm-cost').value || 0,
      sale_price: document.getElementById('pm-price').value || 0,
      price_eur: priceEur,
      compare_price: comparePrice,
      compare_price_eur: comparePriceEur,
      stock: document.getElementById('pm-stock').value || 0,
      min_stock: document.getElementById('pm-minstock').value || 5,
      country,
      sku: document.getElementById('pm-sku').value.trim().toUpperCase() || undefined,
    };
  }

  try {
    if (editingProductId) {
      await API.updateProduct(editingProductId, data);
      toast('Producto actualizado ✓', 'success');
    } else {
      await API.createProduct(data);
      toast('Producto agregado ✓', 'success');
    }
    closeModal('product-modal');
    await loadInventory();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function confirmDeleteProduct(id, name) {
  if (!confirm(`¿Eliminar "${name}"? Esta acción no se puede deshacer.`)) return;
  try {
    await API.deleteProduct(id);
    toast('Producto eliminado', 'info');
    await loadInventory();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function openProductDetail(id) {
  openProductModal(id);
}

async function openCategoryModal() {
  await renderCategoryList();
  document.getElementById('cat-name').value = '';
  document.getElementById('cat-icon').value = '🕯️';
  document.getElementById('cat-color').value = '#62121D';
  document.getElementById('cat-editing-id').value = '';
  document.getElementById('cat-save-btn').textContent = '+ Agregar';
  document.getElementById('cat-cancel-btn').style.display = 'none';
  openModal('category-modal');
}

async function renderCategoryList() {
  const cats = await API.categories();
  const el = document.getElementById('cat-list');
  if (!cats.length) {
    el.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">Sin categorías. Agrega una arriba.</p>';
    return;
  }
  el.innerHTML = cats.map(c => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px">
      <span style="font-size:1.3rem">${c.icon}</span>
      <span style="flex:1;font-weight:600;color:${c.color}">${c.name}</span>
      <div style="width:18px;height:18px;border-radius:50%;background:${c.color};border:2px solid var(--border);flex-shrink:0"></div>
      <button class="btn btn-ghost btn-sm btn-icon" onclick="editCategory(${c.id},'${c.name.replace(/'/g,"\\'")}','${c.icon}','${c.color}')" title="Editar">✏️</button>
      <button class="btn btn-ghost btn-sm btn-icon" onclick="confirmDeleteCategory(${c.id},'${c.name.replace(/'/g,"\\'")}')" title="Eliminar">🗑️</button>
    </div>
  `).join('');
}

function editCategory(id, name, icon, color) {
  document.getElementById('cat-editing-id').value = id;
  document.getElementById('cat-name').value = name;
  document.getElementById('cat-icon').value = icon;
  document.getElementById('cat-color').value = color;
  document.getElementById('cat-save-btn').textContent = 'Guardar cambios';
  document.getElementById('cat-cancel-btn').style.display = '';
  document.getElementById('cat-name').focus();
}

function cancelCategoryEdit() {
  document.getElementById('cat-editing-id').value = '';
  document.getElementById('cat-name').value = '';
  document.getElementById('cat-icon').value = '🕯️';
  document.getElementById('cat-color').value = '#62121D';
  document.getElementById('cat-save-btn').textContent = '+ Agregar';
  document.getElementById('cat-cancel-btn').style.display = 'none';
}

async function saveCategory() {
  const name = document.getElementById('cat-name').value.trim();
  if (!name) { toast('El nombre es requerido', 'warning'); return; }
  const icon = document.getElementById('cat-icon').value.trim() || '📦';
  const color = document.getElementById('cat-color').value;
  const editId = document.getElementById('cat-editing-id').value;

  try {
    if (editId) {
      await API.updateCategory(editId, { name, icon, color });
      toast('Categoría actualizada ✓', 'success');
    } else {
      await API.createCategory({ name, icon, color });
      toast(`Categoría "${name}" creada ✓`, 'success');
    }
    cancelCategoryEdit();
    await renderCategoryList();
    // Refresh dropdowns in product modal
    const sel = document.getElementById('pm-category');
    if (sel) {
      const cats = await API.categories();
      const currentVal = sel.value;
      sel.innerHTML = '<option value="">Sin categoría</option>' + cats.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
      sel.value = currentVal;
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function confirmDeleteCategory(id, name) {
  if (!confirm(`¿Eliminar la categoría "${name}"?\nLos productos de esta categoría quedarán sin categoría.`)) return;
  try {
    await API.deleteCategory(id);
    toast(`Categoría "${name}" eliminada`, 'info');
    await renderCategoryList();
    await loadInventory(); // refresh product list
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ── Aromas ────────────────────────────────────────
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

async function openAromaModal() {
  resetAromaForm();
  await renderAromaList();
  openModal('aroma-modal');
}

async function renderAromaList() {
  const aromas = await API.aromas();
  const el = document.getElementById('aroma-list');
  if (!aromas.length) {
    el.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">Sin aromas. Agrega el primero arriba.</p>';
    return;
  }
  el.innerHTML = aromas.map((a, i) => `
    <div style="display:flex;align-items:center;gap:12px;padding:8px 8px 8px 14px;border-bottom:1px solid var(--border)">
      <span style="font-size:0.7rem;font-weight:800;color:var(--text-muted);width:20px">${String(i + 1).padStart(2, '0')}</span>
      <span style="flex:1;font-family:var(--font-display);font-weight:600;font-size:1.05rem">${escapeHtml(a.name)}</span>
      <button class="btn btn-ghost btn-sm btn-icon" data-id="${a.id}" data-name="${escapeHtml(a.name)}" onclick="editAroma(this.dataset.id, this.dataset.name)" title="Editar">✏️</button>
      <button class="btn btn-ghost btn-sm btn-icon" data-id="${a.id}" data-name="${escapeHtml(a.name)}" onclick="deleteAroma(this.dataset.id, this.dataset.name)" title="Eliminar">🗑️</button>
    </div>
  `).join('');
}

function editAroma(id, name) {
  document.getElementById('aroma-editing-id').value = id;
  document.getElementById('aroma-name').value = name;
  document.getElementById('aroma-save-btn').textContent = 'Guardar';
  document.getElementById('aroma-cancel-btn').style.display = '';
  document.getElementById('aroma-name').focus();
}

function resetAromaForm() {
  document.getElementById('aroma-editing-id').value = '';
  document.getElementById('aroma-name').value = '';
  document.getElementById('aroma-save-btn').textContent = '+ Agregar';
  document.getElementById('aroma-cancel-btn').style.display = 'none';
}

async function saveAroma() {
  const name = document.getElementById('aroma-name').value.trim();
  if (!name) { toast('Escribe el nombre del aroma', 'warning'); return; }
  const editId = document.getElementById('aroma-editing-id').value;
  try {
    if (editId) await API.updateAroma(editId, { name });
    else await API.createAroma({ name });
    toast(editId ? 'Aroma actualizado ✓' : `Aroma "${name}" agregado ✓`, 'success');
    resetAromaForm();
    await renderAromaList();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteAroma(id, name) {
  if (!confirm(`¿Quitar el aroma "${name}" de la lista?`)) return;
  try {
    await API.deleteAroma(id);
    toast('Aroma eliminado', 'info');
    await renderAromaList();
  } catch (err) { toast(err.message, 'error'); }
}
