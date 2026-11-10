// ── Taller: insumos, costos por vela, calculadora de aroma y producción ──────────
// Todo vive en una sola sección para no trabajar con dos planillas: lo que cargas en Insumos
// (con lo que pagaste) alimenta el costo de cada vela, y producir un lote descuenta los insumos.

const SUPPLY_KINDS = {
  cera:       { icon: '🕯️', label: 'Cera',        unit: 'g' },
  esencia:    { icon: '🌸', label: 'Esencia',     unit: 'ml' },
  frasco:     { icon: '🫙', label: 'Frasco',      unit: 'unid' },
  mecha:      { icon: '🧵', label: 'Mecha',       unit: 'unid' },
  colorante:  { icon: '🎨', label: 'Colorante',   unit: 'ml' },
  decoracion: { icon: '🍓', label: 'Decoración',  unit: 'unid' },
  empaque:    { icon: '🎁', label: 'Empaque',     unit: 'unid' },
  otro:       { icon: '✨', label: 'Otro',        unit: 'unid' },
};
const UNIT_LABEL = { g: 'g', ml: 'ml', unid: 'unid.' };

const Taller = { tab: 'insumos', supplies: [], settings: null, recipes: null, productions: [], kind: '', q: '' };

function escT(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const numT = (v) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };
function fmtQty(q, unit) {
  const v = Number(q) || 0;
  const s = v.toLocaleString('es-CL', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 1 });
  return `${s} ${UNIT_LABEL[unit] || unit || ''}`.trim();
}
// Costos chicos (por gramo o ml) con decimales: $5,99
function fmtUnitCost(c) {
  const v = Number(c) || 0;
  if (v > 0 && v < 100) return '$' + v.toLocaleString('es-CL', { maximumFractionDigits: 2 });
  return fmt(v);
}
const pctT = (x) => `${Math.round((Number(x) || 0) * 1000) / 10}%`;
const isLowSupply = (s) => s.stock <= 0 || (s.min_stock > 0 && s.stock <= s.min_stock);

async function loadTaller() {
  try {
    const [supplies, settings] = await Promise.all([API.supplies(), API.tallerSettings()]);
    Taller.supplies = supplies; Taller.settings = settings;
    updateBadge('badge-taller', supplies.filter(isLowSupply).length);
    await tallerTab(Taller.tab);
  } catch (err) { toast('Error cargando el taller: ' + err.message, 'error'); }
}

async function tallerTab(tab) {
  Taller.tab = tab;
  document.querySelectorAll('#tl-tabs .tl-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const el = document.getElementById('taller-content');
  try {
    if (tab === 'insumos') renderSupplies();
    if (tab === 'costos') { Taller.recipes = await API.recipes(); renderRecipes(); }
    if (tab === 'aroma') renderAromaCalc();
    if (tab === 'produccion') {
      const [recipes, productions, blends, sheets] = await Promise.all([API.recipes(), API.productions(), API.blends(), API.sheets()]);
      Object.assign(Taller, { recipes, productions, blends, sheets });
      renderProduction();
    }
  } catch (err) { el.innerHTML = `<div class="alert alert-danger">${escT(err.message)}</div>`; }
}

function openTallerModal(title, body, footer, wide) {
  document.getElementById('taller-modal-title').textContent = title;
  document.getElementById('taller-modal-body').innerHTML = body;
  document.getElementById('taller-modal-footer').innerHTML = footer;
  document.getElementById('taller-modal-box').classList.toggle('tl-modal-wide', !!wide);
  openModal('taller-modal');
}

// Rendimiento de una esencia: para cuántas velas de referencia alcanza
function essenceCandles(s) {
  const st = Taller.settings;
  const grams = numT(st.ref_wax_g) * numT(st.ref_pct) / 100;
  const per = s.unit === 'ml' ? grams / (st.density || 0.95) : grams;
  return per > 0 ? Math.floor(Math.max(0, s.stock) / per) : null;
}

// ═══ 1. INSUMOS ═══════════════════════════════════════════════════════
function renderSupplies() {
  const el = document.getElementById('taller-content');
  const all = Taller.supplies;
  const value = all.reduce((a, s) => a + Math.max(0, s.stock) * s.unit_cost, 0);
  const low = all.filter(isLowSupply);
  const essences = all.filter(s => s.kind === 'esencia');
  const essenceCandlesTotal = essences.reduce((a, s) => a + (essenceCandles(s) || 0), 0);
  const q = Taller.q.toLowerCase();
  const list = all.filter(s => (!Taller.kind || s.kind === Taller.kind) && (!q || s.name.toLowerCase().includes(q) || (s.supplier || '').toLowerCase().includes(q)));
  const kinds = Object.entries(SUPPLY_KINDS).filter(([k]) => all.some(s => s.kind === k));

  if (!all.length) {
    el.innerHTML = `
      <div class="card"><div class="empty-state">
        <div class="empty-icon">📦</div>
        <h3>Tu inventario de insumos está vacío</h3>
        <p>Parte por lo que más usas: tu cera (en gramos), tus esencias (en ml) y tus frascos. Pon lo que tienes hoy y lo que pagaste, y el costo de cada vela se calcula solo.</p>
        <button class="btn btn-primary" onclick="openSupplyModal()">+ Agregar mi primer insumo</button>
      </div></div>`;
    return;
  }

  el.innerHTML = `
    <div class="stats-grid tl-stats">
      <div class="stat-card"><span class="stat-icon">💰</span><div class="stat-label">Valor de tus insumos</div>
        <div class="stat-value">${fmt(value)}</div><div class="stat-change neutral">${all.length} insumo${all.length !== 1 ? 's' : ''}</div></div>
      <div class="stat-card ${low.length ? 'danger' : ''}"><span class="stat-icon">⚠️</span><div class="stat-label">Por reponer</div>
        <div class="stat-value">${low.length}</div><div class="stat-change neutral">${low.length ? escT(low.slice(0, 3).map(s => s.name).join(', ')) + (low.length > 3 ? '…' : '') : 'Todo en orden'}</div></div>
      <div class="stat-card"><span class="stat-icon">🌸</span><div class="stat-label">Tus esencias alcanzan para</div>
        <div class="stat-value">${essenceCandlesTotal} velas</div><div class="stat-change neutral">de ${Taller.settings.ref_wax_g} g de cera al ${Taller.settings.ref_pct}%</div></div>
    </div>

    <div class="card">
      <div class="card-header tl-toolbar">
        <div class="tl-chips">
          <button class="tl-chip ${!Taller.kind ? 'active' : ''}" onclick="Taller.kind='';renderSupplies()">Todos</button>
          ${kinds.map(([k, v]) => `<button class="tl-chip ${Taller.kind === k ? 'active' : ''}" onclick="Taller.kind='${k}';renderSupplies()">${v.icon} ${v.label}</button>`).join('')}
        </div>
        <input class="form-control tl-search" placeholder="Buscar insumo o proveedor…" value="${escT(Taller.q)}" oninput="Taller.q=this.value;renderSuppliesList()" />
      </div>
      <div id="tl-supplies-list">${suppliesTable(list)}</div>
    </div>`;
}

function renderSuppliesList() {
  const q = Taller.q.toLowerCase();
  const list = Taller.supplies.filter(s => (!Taller.kind || s.kind === Taller.kind) && (!q || s.name.toLowerCase().includes(q) || (s.supplier || '').toLowerCase().includes(q)));
  document.getElementById('tl-supplies-list').innerHTML = suppliesTable(list);
}

function suppliesTable(list) {
  if (!list.length) return '<div class="empty-state" style="padding:30px"><p>No hay insumos con ese filtro</p></div>';
  return `<div class="tl-supply-list">${list.map(s => {
    const k = SUPPLY_KINDS[s.kind] || SUPPLY_KINDS.otro;
    const low = isLowSupply(s);
    const candles = s.kind === 'esencia' ? essenceCandles(s) : null;
    return `
      <div class="tl-supply ${low ? 'low' : ''}">
        <div class="tl-supply-main" onclick="openSupplyHistory(${s.id})" title="Ver movimientos">
          <span class="tl-supply-icon">${k.icon}</span>
          <div>
            <div class="tl-supply-name">${escT(s.name)}</div>
            <div class="tl-supply-meta">${k.label}${s.supplier ? ' · ' + escT(s.supplier) : ''}${s.max_pct ? ` · máx. ${s.max_pct}%` : ''}</div>
          </div>
        </div>
        <div class="tl-supply-stock">
          <strong class="${low ? 'text-danger' : ''}">${fmtQty(s.stock, s.unit)}</strong>
          <small>${s.min_stock > 0 ? `mínimo ${fmtQty(s.min_stock, s.unit)}` : (s.stock <= 0 ? 'agotado' : '')}${candles !== null ? `${s.min_stock > 0 || s.stock <= 0 ? ' · ' : ''}≈ ${candles} vela${candles !== 1 ? 's' : ''}` : ''}</small>
        </div>
        <div class="tl-supply-cost">
          <strong>${s.unit_cost > 0 ? fmtUnitCost(s.unit_cost) : '<span class="text-warning">sin costo</span>'}</strong>
          <small>por ${UNIT_LABEL[s.unit]}${s.unit_cost > 0 && s.stock > 0 ? ' · vale ' + fmt(s.stock * s.unit_cost) : ''}</small>
        </div>
        <div class="tl-supply-actions">
          <button class="btn btn-primary btn-sm" onclick="openSupplyMove(${s.id},'compra')" title="Registrar una compra">🛒 Compré</button>
          <button class="btn btn-secondary btn-sm" onclick="openSupplyMove(${s.id},'uso')" title="Descontar lo que usaste o se perdió">➖ Usé</button>
          <button class="btn btn-secondary btn-sm" onclick="openSupplyMove(${s.id},'conteo')" title="Dejar el stock que contaste">🔢 Conté</button>
          <button class="btn btn-ghost btn-sm" onclick="openSupplyModal(${s.id})" title="Editar">✏️</button>
        </div>
      </div>`;
  }).join('')}</div>`;
}

function openSupplyModal(id) {
  const s = id ? Taller.supplies.find(x => x.id === id) : null;
  const kind = s?.kind || (Taller.kind || 'cera');
  const unit = s?.unit || SUPPLY_KINDS[kind].unit;
  openTallerModal(s ? 'Editar insumo' : 'Nuevo insumo', `
    <input type="hidden" id="sp-id" value="${s ? s.id : ''}" />
    <div class="form-group">
      <label class="form-label">Nombre *</label>
      <input class="form-control" id="sp-name" value="${escT(s?.name || '')}" placeholder="Ej: Cera de soja 44-46, Esencia Vainilla, Frasco 220 ml" />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Tipo</label>
        <select class="form-control" id="sp-kind" onchange="supplyKindChanged()">
          ${Object.entries(SUPPLY_KINDS).map(([k, v]) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Se mide en</label>
        <select class="form-control" id="sp-unit" onchange="supplyCostPreview()">
          <option value="g" ${unit === 'g' ? 'selected' : ''}>gramos (g)</option>
          <option value="ml" ${unit === 'ml' ? 'selected' : ''}>mililitros (ml)</option>
          <option value="unid" ${unit === 'unid' ? 'selected' : ''}>unidades</option>
        </select>
      </div>
    </div>
    <small class="site-hint" style="margin:-6px 0 12px">Cera en gramos (1 kg = 1000 g) y esencias en ml, tal como las compras.</small>
    ${s ? `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Costo por <span class="sp-unit-txt">${UNIT_LABEL[unit]}</span></label>
          <input class="form-control" id="sp-cost" type="number" step="any" min="0" value="${Math.round(s.unit_cost * 100) / 100}" />
          <small class="site-hint">Se actualiza solo al registrar compras. Cámbialo solo para corregir.</small>
        </div>
        <div class="form-group">
          <label class="form-label">Stock actual</label>
          <div class="form-control tl-readonly">${fmtQty(s.stock, s.unit)}</div>
          <small class="site-hint">Para cambiarlo usa 🛒 Compré, ➖ Usé o 🔢 Conté.</small>
        </div>
      </div>` : `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">¿Cuánto tienes hoy? (<span class="sp-unit-txt">${UNIT_LABEL[unit]}</span>)</label>
          <input class="form-control" id="sp-stock" type="number" step="any" min="0" placeholder="Ej: 5000" oninput="supplyCostPreview()" />
        </div>
        <div class="form-group">
          <label class="form-label">¿Cuánto pagaste por eso?</label>
          <input class="form-control" id="sp-paid" type="number" step="any" min="0" placeholder="Ej: 29950" oninput="supplyCostPreview()" />
        </div>
      </div>
      <div class="tl-preview" id="sp-preview">Pon cantidad y precio y te digo cuánto cuesta cada <span class="sp-unit-txt">${UNIT_LABEL[unit]}</span>.</div>`}
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Avisarme cuando quede menos de</label>
        <input class="form-control" id="sp-min" type="number" step="any" min="0" value="${s?.min_stock || ''}" placeholder="Ej: 1000" />
      </div>
      <div class="form-group">
        <label class="form-label">Proveedor</label>
        <input class="form-control" id="sp-supplier" value="${escT(s?.supplier || '')}" placeholder="Opcional" />
      </div>
    </div>
    <div class="form-group" id="sp-maxpct-wrap" style="${kind === 'esencia' ? '' : 'display:none'}">
      <label class="form-label">% máximo que recomienda el proveedor</label>
      <input class="form-control" id="sp-maxpct" type="number" step="any" min="0" max="100" value="${s?.max_pct ?? ''}" placeholder="Ej: 10" />
      <small class="site-hint">La calculadora de aroma te avisa si te pasas.</small>
    </div>
    <div class="form-group">
      <label class="form-label">Notas</label>
      <input class="form-control" id="sp-notes" value="${escT(s?.notes || '')}" placeholder="Ej: etiquetada para soja, probar antes de usar" />
    </div>`, `
    ${s ? `<button class="btn btn-ghost" style="margin-right:auto;color:var(--danger)" onclick="deleteSupply(${s.id})">Eliminar</button>` : ''}
    <button class="btn btn-secondary" onclick="closeModal('taller-modal')">Cancelar</button>
    <button class="btn btn-primary" onclick="saveSupply()">${s ? 'Guardar' : 'Agregar insumo'}</button>`);
  setTimeout(() => document.getElementById('sp-name')?.focus(), 50);
}

function supplyKindChanged() {
  const kind = document.getElementById('sp-kind').value;
  if (!document.getElementById('sp-id').value) document.getElementById('sp-unit').value = SUPPLY_KINDS[kind].unit;
  document.getElementById('sp-maxpct-wrap').style.display = kind === 'esencia' ? '' : 'none';
  supplyCostPreview();
}

function supplyCostPreview() {
  const unit = document.getElementById('sp-unit').value;
  document.querySelectorAll('.sp-unit-txt').forEach(e => e.textContent = UNIT_LABEL[unit]);
  const box = document.getElementById('sp-preview');
  if (!box) return;
  const qty = numT(document.getElementById('sp-stock').value), paid = numT(document.getElementById('sp-paid').value);
  box.innerHTML = qty > 0 && paid > 0
    ? `Cada ${UNIT_LABEL[unit]} te cuesta <strong>${fmtUnitCost(paid / qty)}</strong>${unit === 'g' ? ` (${fmt(paid / qty * 1000)} el kilo)` : ''}`
    : `Pon cantidad y precio y te digo cuánto cuesta cada ${UNIT_LABEL[unit]}.`;
}

async function saveSupply() {
  const id = document.getElementById('sp-id').value;
  const data = {
    name: document.getElementById('sp-name').value.trim(),
    kind: document.getElementById('sp-kind').value,
    unit: document.getElementById('sp-unit').value,
    min_stock: numT(document.getElementById('sp-min').value),
    supplier: document.getElementById('sp-supplier').value,
    notes: document.getElementById('sp-notes').value,
    max_pct: document.getElementById('sp-maxpct').value,
  };
  if (!data.name) return toast('Ponle un nombre al insumo', 'warning');
  try {
    if (id) { data.unit_cost = numT(document.getElementById('sp-cost').value); await API.updateSupply(id, data); toast('Insumo actualizado'); }
    else {
      data.stock = numT(document.getElementById('sp-stock').value);
      data.paid = numT(document.getElementById('sp-paid').value);
      await API.createSupply(data); toast('Insumo agregado');
    }
    closeModal('taller-modal');
    await loadTaller();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteSupply(id) {
  const s = Taller.supplies.find(x => x.id === id);
  if (!confirm(`¿Eliminar "${s?.name}"? También se saca de las recetas que lo usan.`)) return;
  try { await API.deleteSupply(id); closeModal('taller-modal'); toast('Insumo eliminado'); await loadTaller(); }
  catch (err) { toast(err.message, 'error'); }
}

function openSupplyMove(id, type) {
  const s = Taller.supplies.find(x => x.id === id);
  const u = UNIT_LABEL[s.unit];
  const titles = { compra: `🛒 Compré ${s.name}`, uso: `➖ Usé ${s.name}`, conteo: `🔢 Conté ${s.name}` };
  const body = type === 'compra' ? `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">¿Cuánto compraste? (${u})</label>
          <input class="form-control" id="mv-qty" type="number" step="any" min="0" placeholder="${s.unit === 'g' ? 'Ej: 2 bolsas de 1 kg = 2000' : 'Ej: 50'}" oninput="moveCostPreview(${id})" />
        </div>
        <div class="form-group">
          <label class="form-label">¿Cuánto pagaste en total?</label>
          <input class="form-control" id="mv-total" type="number" step="any" min="0" placeholder="Puedes sumar el envío" oninput="moveCostPreview(${id})" />
        </div>
      </div>
      <div class="tl-preview" id="mv-preview">Hoy tienes ${fmtQty(s.stock, s.unit)} a ${fmtUnitCost(s.unit_cost)} por ${u}.</div>
      <div class="form-group">
        <label class="form-label">Nota</label>
        <input class="form-control" id="mv-notes" placeholder="Ej: proveedor, n° de pedido" />
      </div>
      <label class="tl-check"><input type="checkbox" id="mv-expense" /> Registrar también en Gastos
        <small class="site-hint">Ojo: el costo de las velas ya se descuenta en cada venta. Márcalo solo si quieres ver la plata que salió de la caja.</small></label>`
    : type === 'uso' ? `
      <div class="form-group">
        <label class="form-label">¿Cuánto usaste o se perdió? (${u})</label>
        <input class="form-control" id="mv-qty" type="number" step="any" min="0" />
        <small class="site-hint">Al registrar una producción los insumos se descuentan solos; esto es para pruebas, mermas o regalos.</small>
      </div>
      <div class="form-group"><label class="form-label">Motivo</label>
        <input class="form-control" id="mv-notes" placeholder="Ej: prueba de aroma, se quebró un frasco" /></div>`
    : `
      <div class="form-group">
        <label class="form-label">¿Cuánto hay realmente? (${u})</label>
        <input class="form-control" id="mv-qty" type="number" step="any" min="0" value="${Math.max(0, Math.round(s.stock * 10) / 10)}" />
        <small class="site-hint">El sistema dice ${fmtQty(s.stock, s.unit)}. Pon lo que pesaste o contaste y queda así.</small>
      </div>
      <div class="form-group"><label class="form-label">Nota</label><input class="form-control" id="mv-notes" placeholder="Opcional" /></div>`;
  openTallerModal(titles[type], body, `
    <button class="btn btn-secondary" onclick="closeModal('taller-modal')">Cancelar</button>
    <button class="btn btn-primary" onclick="saveSupplyMove(${id},'${type}')">Guardar</button>`);
  setTimeout(() => document.getElementById('mv-qty')?.focus(), 50);
}

function moveCostPreview(id) {
  const s = Taller.supplies.find(x => x.id === id);
  const qty = numT(document.getElementById('mv-qty').value), total = numT(document.getElementById('mv-total').value);
  const u = UNIT_LABEL[s.unit];
  const box = document.getElementById('mv-preview');
  if (!(qty > 0 && total > 0)) { box.innerHTML = `Hoy tienes ${fmtQty(s.stock, s.unit)} a ${fmtUnitCost(s.unit_cost)} por ${u}.`; return; }
  const before = Math.max(0, s.stock);
  const avg = (before * s.unit_cost + total) / (before + qty);
  box.innerHTML = `Esta compra sale a <strong>${fmtUnitCost(total / qty)}</strong> por ${u}${s.unit === 'g' ? ` (${fmt(total / qty * 1000)} el kilo)` : ''}.<br>
    Quedarás con ${fmtQty(before + qty, s.unit)} a un costo promedio de <strong>${fmtUnitCost(avg)}</strong> por ${u}.`;
}

async function saveSupplyMove(id, type) {
  const data = { type, quantity: numT(document.getElementById('mv-qty').value), notes: document.getElementById('mv-notes')?.value || '' };
  if (type === 'compra') { data.total = numT(document.getElementById('mv-total').value); data.as_expense = document.getElementById('mv-expense').checked; }
  if (type !== 'conteo' && !(data.quantity > 0)) return toast('Indica la cantidad', 'warning');
  try {
    await API.supplyMovement(id, data);
    closeModal('taller-modal');
    toast(type === 'compra' ? 'Compra registrada' + (data.as_expense ? ' y anotada en Gastos' : '') : 'Stock actualizado');
    await loadTaller();
  } catch (err) { toast(err.message, 'error'); }
}

async function openSupplyHistory(id) {
  const s = Taller.supplies.find(x => x.id === id);
  const labels = { inicial: 'Stock inicial', compra: '🛒 Compra', uso: '➖ Uso', conteo: '🔢 Conteo', produccion: '🕯️ Producción' };
  try {
    const mv = await API.supplyMovements(id);
    openTallerModal(`Movimientos · ${s.name}`, mv.length ? `<div class="tl-moves">${mv.map(m => `
      <div class="dash-row">
        <div><strong>${labels[m.type] || m.type}</strong><br><small>${fmtDate(m.created_at)}${m.user_name ? ' · ' + escT(m.user_name) : ''}${m.notes ? ' · ' + escT(m.notes) : ''}</small></div>
        <div style="text-align:right"><strong class="${m.quantity < 0 ? 'text-danger' : 'text-success'}">${m.quantity > 0 ? '+' : ''}${fmtQty(m.quantity, s.unit)}</strong>
          ${m.type === 'compra' && m.total ? `<br><small>${fmt(m.total)} · ${fmtUnitCost(m.unit_cost)}/${UNIT_LABEL[s.unit]}</small>` : ''}</div>
      </div>`).join('')}</div>` : '<div class="empty-state" style="padding:30px"><p>Sin movimientos todavía</p></div>',
      `<button class="btn btn-secondary" onclick="closeModal('taller-modal')">Cerrar</button>`);
  } catch (err) { toast(err.message, 'error'); }
}

// ═══ 2. COSTOS POR VELA ══════════════════════════════════════════════
// Mismo cálculo que el servidor (services/costing.js), para ver el costo en vivo mientras editas la receta
function computeRecipeT(recipe, salePrice) {
  const st = Taller.settings;
  const byId = Object.fromEntries(Taller.supplies.map(s => [s.id, s]));
  const density = st.density || 0.95;
  const perGram = (s) => s.unit === 'ml' ? s.unit_cost / density : s.unit_cost;
  let materials = 0, wax = 0;
  const lines = [];
  for (const it of recipe.items) {
    const s = byId[it.supply_id]; const qty = numT(it.qty);
    if (!s || qty <= 0) continue;
    const cost = qty * s.unit_cost; materials += cost;
    if (s.kind === 'cera' && it.scent !== false) wax += qty;
    lines.push({ ...it, s, cost });
  }
  const fragGrams = wax * numT(recipe.fragrance_pct) / 100;
  let frag = null;
  if (fragGrams > 0) {
    const chosen = recipe.fragrance_supply_id ? byId[recipe.fragrance_supply_id] : null;
    const ess = Taller.supplies.filter(s => s.kind === 'esencia' && s.unit_cost > 0);
    const pg = chosen ? perGram(chosen) : ess.length ? ess.reduce((a, s) => a + perGram(s), 0) / ess.length : 0;
    frag = { grams: fragGrams, ml: fragGrams / density, cost: fragGrams * pg, missing: pg === 0 };
    materials += frag.cost;
  }
  const direct = materials + numT(recipe.extra_cost);
  const labor = numT(recipe.labor_minutes) / 60 * numT(st.hourly);
  const total = direct + labor;
  const com = numT(st.commission_pct) / 100, target = numT(st.target_margin_pct) / 100;
  const price = numT(salePrice), commission = price * com;
  return {
    lines, frag, wax, direct, labor, total, price, commission,
    profit_direct: price - commission - direct, margin_direct: price ? (price - commission - direct) / price : 0,
    profit_total: price - commission - total, margin_total: price ? (price - commission - total) / price : 0,
    min_price: total / (1 - com || 1), target_price: 1 - com - target > 0 ? total / (1 - com - target) : null,
    product_cost: st.include_labor ? total : direct,
  };
}

function renderRecipes() {
  const el = document.getElementById('taller-content');
  const st = Taller.settings;
  const prods = Taller.recipes.products;
  const withR = prods.filter(p => p.recipe), without = prods.filter(p => !p.recipe);
  el.innerHTML = `
    <details class="card tl-settings" ${withR.length ? '' : 'open'}>
      <summary class="card-header"><div><div class="card-title">⚙️ Datos para calcular</div>
        <div class="card-subtitle">Valor de tu hora ${fmt(st.hourly)} · comisión ${st.commission_pct}% · margen objetivo ${st.target_margin_pct}%</div></div></summary>
      <div class="card-body">
        <div class="tl-fields">
          <div class="form-group"><label class="form-label">Valor de tu hora (CLP)</label><input class="form-control" id="st-hourly" type="number" min="0" value="${st.hourly}" /><small class="site-hint">Pon 0 si quieres ver solo materiales.</small></div>
          <div class="form-group"><label class="form-label">Comisión de cobro (%)</label><input class="form-control" id="st-commission" type="number" step="any" min="0" value="${st.commission_pct}" /><small class="site-hint">Lo que cobra la máquina o el marketplace.</small></div>
          <div class="form-group"><label class="form-label">Margen objetivo (%)</label><input class="form-control" id="st-target" type="number" step="any" min="0" value="${st.target_margin_pct}" /></div>
          <div class="form-group"><label class="form-label">Densidad de la fragancia (g/ml)</label><input class="form-control" id="st-density" type="number" step="any" min="0" value="${st.density}" /><small class="site-hint">Normalmente 0,95.</small></div>
        </div>
        <label class="tl-check"><input type="checkbox" id="st-labor" ${st.include_labor ? 'checked' : ''} /> El costo del producto incluye mi tiempo
          <small class="site-hint">Apagado (recomendado): el dashboard muestra la ganancia en plata después de materiales. Encendido: también descuenta tus horas.</small></label>
        <div style="text-align:right;margin-top:10px"><button class="btn btn-primary btn-sm" onclick="saveTallerSettings()">Guardar datos</button></div>
      </div>
    </details>

    ${!Taller.supplies.length ? `<div class="alert alert-warning">Primero agrega tus insumos (pestaña 📦 Insumos) con lo que pagaste: de ahí salen los costos.</div>` : ''}

    ${withR.length ? `<div class="tl-section-title">Velas con receta</div>
    <div class="tl-recipe-grid">${withR.map(recipeCard).join('')}</div>` : ''}

    <div class="tl-section-title">${withR.length ? 'Sin receta todavía' : 'Crea la receta de cada vela'}</div>
    ${without.length ? `<div class="card"><div class="tl-norecipe">${without.map(p => `
      <div class="dash-row">
        <div><strong>${escT(p.name)}</strong><br><small>${escT(p.category_name || 'Sin categoría')} · precio ${fmt(p.sale_price)} · costo ${p.cost_price ? fmt(p.cost_price) + ' (a mano)' : 'sin cargar'}</small></div>
        <button class="btn btn-secondary btn-sm" onclick="openRecipeModal(${p.id})">+ Crear receta</button>
      </div>`).join('')}</div></div>` : '<p class="text-muted text-sm">Todas tus velas tienen receta ✨</p>'}`;
}

function recipeCard(p) {
  const c = p.cost;
  const m = c.margin_direct;
  const tone = m >= 0.5 ? 'good' : m >= 0.35 ? 'ok' : 'bad';
  return `
    <div class="card tl-recipe-card" onclick="openRecipeModal(${p.id})">
      <div class="tl-recipe-head">
        <div><strong>${escT(p.name)}</strong><small>${escT(p.category_name || '')}</small></div>
        ${p.recipe.auto_cost ? '<span class="badge badge-success" title="El costo del producto se actualiza solo">auto</span>' : '<span class="badge badge-muted">manual</span>'}
      </div>
      <div class="tl-recipe-nums">
        <div><span>Precio</span><strong>${fmt(c.price)}</strong></div>
        <div><span>Materiales</span><strong>${fmt(c.direct)}</strong></div>
        <div><span>Ganas</span><strong class="tl-${tone}">${fmt(c.profit_direct)}</strong></div>
      </div>
      <div class="tl-margin-bar"><div class="tl-${tone}-bg" style="width:${Math.max(0, Math.min(100, m * 100))}%"></div></div>
      <small class="text-muted">Margen ${pctT(m)} sin tu tiempo${c.labor ? ` · ${pctT(c.margin_total)} con tu tiempo` : ''}${c.fragrance?.missingPrice ? ' · ⚠️ esencias sin costo' : ''}</small>
    </div>`;
}

async function saveTallerSettings() {
  const data = {
    hourly: numT(document.getElementById('st-hourly').value),
    commission_pct: numT(document.getElementById('st-commission').value),
    target_margin_pct: numT(document.getElementById('st-target').value),
    density: numT(document.getElementById('st-density').value) || 0.95,
    include_labor: document.getElementById('st-labor').checked,
  };
  try { Taller.settings = await API.saveTallerSettings(data); toast('Datos guardados, costos recalculados'); await tallerTab('costos'); }
  catch (err) { toast(err.message, 'error'); }
}

let RecipeDraft = null;
function openRecipeModal(pid, draft) {
  const p = Taller.recipes.products.find(x => x.id === pid);
  const r = p.recipe;
  RecipeDraft = draft || {
    pid, price: p.sale_price,
    items: r ? r.items.map(i => ({ ...i })) : defaultRecipeItems(),
    fragrance_pct: r ? r.fragrance_pct : Taller.settings.ref_pct,
    fragrance_supply_id: r?.fragrance_supply_id || '',
    extra_cost: r ? r.extra_cost : 0, labor_minutes: r ? r.labor_minutes : 0,
    auto_cost: r ? !!r.auto_cost : true, existing: !!r,
  };
  const others = Taller.recipes.products.filter(x => x.recipe && x.id !== pid);
  openTallerModal(`Receta · ${p.name}`, `
    <div class="tl-recipe-editor">
      <div>
        ${others.length ? `<div class="form-group"><label class="form-label">Copiar receta de otra vela</label>
          <select class="form-control" onchange="copyRecipeFrom(this.value)"><option value="">—</option>${others.map(o => `<option value="${o.id}">${escT(o.name)}</option>`).join('')}</select></div>` : ''}
        <div class="form-label">Insumos de una vela</div>
        <div id="rc-lines"></div>
        <button class="btn btn-secondary btn-sm" onclick="RecipeDraft.items.push({supply_id:'',qty:''});renderRecipeLines()">+ Agregar insumo</button>
        ${!Taller.supplies.length ? '<p class="site-hint">Todavía no tienes insumos: agrégalos en la pestaña 📦 Insumos.</p>' : ''}
        <div class="tl-fields" style="margin-top:16px">
          <div class="form-group"><label class="form-label">% de esencia sobre la cera</label>
            <input class="form-control" type="number" step="any" min="0" max="100" value="${RecipeDraft.fragrance_pct}" oninput="RecipeDraft.fragrance_pct=this.value;renderRecipeResult()" /></div>
          <div class="form-group"><label class="form-label">Esencia</label>
            <select class="form-control" onchange="RecipeDraft.fragrance_supply_id=this.value;renderRecipeResult()">
              <option value="">La que elija el cliente (promedio)</option>
              ${Taller.supplies.filter(s => s.kind === 'esencia').map(s => `<option value="${s.id}" ${String(s.id) === String(RecipeDraft.fragrance_supply_id) ? 'selected' : ''}>${escT(s.name)}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Otros por vela (CLP)</label>
            <input class="form-control" type="number" min="0" value="${RecipeDraft.extra_cost || ''}" placeholder="Colorante, toppings, imprevistos" oninput="RecipeDraft.extra_cost=this.value;renderRecipeResult()" /></div>
          <div class="form-group"><label class="form-label">Minutos de trabajo</label>
            <input class="form-control" type="number" min="0" value="${RecipeDraft.labor_minutes || ''}" placeholder="Ej: 45" oninput="RecipeDraft.labor_minutes=this.value;renderRecipeResult()" /></div>
        </div>
        <label class="tl-check"><input type="checkbox" ${RecipeDraft.auto_cost ? 'checked' : ''} onchange="RecipeDraft.auto_cost=this.checked" /> Usar este costo en el producto
          <small class="site-hint">Se actualiza solo cuando cambia lo que pagas por tus insumos, y así el dashboard muestra la ganancia real.</small></label>
      </div>
      <div class="tl-result" id="rc-result"></div>
    </div>`, `
    ${RecipeDraft.existing ? `<button class="btn btn-ghost" style="margin-right:auto;color:var(--danger)" onclick="deleteRecipe(${pid})">Quitar receta</button>` : ''}
    <button class="btn btn-secondary" onclick="closeModal('taller-modal')">Cancelar</button>
    <button class="btn btn-primary" onclick="saveRecipe()">Guardar receta</button>`, true);
  renderRecipeLines();
}

// Para partir rápido: una línea por cada cera, frasco y mecha que tengas
function defaultRecipeItems() {
  const pick = (k) => Taller.supplies.find(s => s.kind === k);
  const out = [];
  const wax = pick('cera'); if (wax) out.push({ supply_id: wax.id, qty: Taller.settings.ref_wax_g });
  for (const k of ['frasco', 'mecha']) { const s = pick(k); if (s) out.push({ supply_id: s.id, qty: 1 }); }
  return out.length ? out : [{ supply_id: '', qty: '' }];
}

function copyRecipeFrom(id) {
  const o = Taller.recipes.products.find(x => x.id === Number(id));
  if (!o) return;
  openRecipeModal(RecipeDraft.pid, { ...RecipeDraft, items: o.recipe.items.map(i => ({ ...i })), fragrance_pct: o.recipe.fragrance_pct,
    fragrance_supply_id: o.recipe.fragrance_supply_id || '', extra_cost: o.recipe.extra_cost, labor_minutes: o.recipe.labor_minutes });
  toast(`Receta copiada de ${o.name}. Ajusta lo que cambie y guarda.`, 'info');
}

function renderRecipeLines() {
  const byKind = Object.entries(SUPPLY_KINDS).map(([k, v]) => {
    const list = Taller.supplies.filter(s => s.kind === k);
    return list.length ? `<optgroup label="${v.icon} ${v.label}">${list.map(s => `<option value="${s.id}">${escT(s.name)}</option>`).join('')}</optgroup>` : '';
  }).join('');
  document.getElementById('rc-lines').innerHTML = RecipeDraft.items.map((it, i) => {
    const s = Taller.supplies.find(x => x.id === Number(it.supply_id));
    return `
      <div class="tl-line">
        <select class="form-control" onchange="RecipeDraft.items[${i}].supply_id=Number(this.value);renderRecipeLines()">
          <option value="">Elige un insumo…</option>${byKind.replace(`value="${it.supply_id}"`, `value="${it.supply_id}" selected`)}
        </select>
        <div class="tl-line-qty">
          <input class="form-control" type="number" step="any" min="0" value="${it.qty}" placeholder="Cant." oninput="RecipeDraft.items[${i}].qty=this.value;renderRecipeResult()" />
          <span>${s ? UNIT_LABEL[s.unit] : ''}</span>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="RecipeDraft.items.splice(${i},1);renderRecipeLines()" title="Quitar">✕</button>
        ${s?.kind === 'cera' ? `<label class="tl-line-scent"><input type="checkbox" ${it.scent !== false ? 'checked' : ''} onchange="RecipeDraft.items[${i}].scent=this.checked;renderRecipeResult()" /> lleva esencia</label>` : ''}
      </div>`;
  }).join('');
  renderRecipeResult();
}

function renderRecipeResult() {
  const c = computeRecipeT({ ...RecipeDraft, fragrance_supply_id: Number(RecipeDraft.fragrance_supply_id) || null }, RecipeDraft.price);
  const row = (a, b, cls = '') => `<div class="tl-res-row ${cls}"><span>${a}</span><strong>${b}</strong></div>`;
  document.getElementById('rc-result').innerHTML = `
    <div class="tl-res-title">Costo de una vela</div>
    ${c.lines.map(l => row(`${escT(l.s.name)} <small>${fmtQty(l.qty, l.s.unit)}</small>`, fmt(l.cost))).join('') || '<p class="text-muted text-sm">Agrega insumos para ver el costo.</p>'}
    ${c.frag ? row(`Esencia <small>${Math.round(c.frag.grams * 10) / 10} g ≈ ${Math.round(c.frag.ml * 10) / 10} ml</small>`, c.frag.missing ? '<span class="text-warning">sin costo</span>' : fmt(c.frag.cost)) : ''}
    ${numT(RecipeDraft.extra_cost) ? row('Otros', fmt(numT(RecipeDraft.extra_cost))) : ''}
    ${row('Costo materiales', fmt(c.direct), 'sum')}
    ${c.labor ? row(`Tu tiempo <small>${numT(RecipeDraft.labor_minutes)} min</small>`, fmt(c.labor)) : ''}
    ${c.labor ? row('Costo total', fmt(c.total), 'sum') : ''}
    <div class="tl-res-title" style="margin-top:14px">Vendiéndola a ${fmt(c.price)}</div>
    ${c.commission ? row('Comisión de cobro', '−' + fmt(c.commission)) : ''}
    ${row('Ganas (sin tu tiempo)', `${fmt(c.profit_direct)} · ${pctT(c.margin_direct)}`, c.margin_direct >= 0.5 ? 'good' : c.margin_direct >= 0.35 ? '' : 'bad')}
    ${c.labor ? row('Ganas (con tu tiempo)', `${fmt(c.profit_total)} · ${pctT(c.margin_total)}`) : ''}
    ${row('Precio mínimo para no perder', fmt(c.min_price))}
    ${c.target_price ? row(`Precio para ${Taller.settings.target_margin_pct}% de margen`, fmt(c.target_price)) : ''}
    <small class="site-hint">El precio de venta se cambia en Inventario.</small>`;
}

async function saveRecipe() {
  const d = RecipeDraft;
  const items = d.items.filter(i => i.supply_id && numT(i.qty) > 0).map(i => ({ supply_id: Number(i.supply_id), qty: numT(i.qty), ...(i.scent === false ? { scent: false } : {}) }));
  if (!items.length) return toast('Agrega al menos un insumo con su cantidad', 'warning');
  try {
    await API.saveRecipe(d.pid, { items, fragrance_pct: numT(d.fragrance_pct), fragrance_supply_id: Number(d.fragrance_supply_id) || null,
      extra_cost: numT(d.extra_cost), labor_minutes: numT(d.labor_minutes), auto_cost: d.auto_cost });
    closeModal('taller-modal');
    toast(d.auto_cost ? 'Receta guardada y costo del producto actualizado' : 'Receta guardada');
    await tallerTab(Taller.tab);
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteRecipe(pid) {
  if (!confirm('¿Quitar la receta? El costo del producto queda como está.')) return;
  try { await API.deleteRecipe(pid); closeModal('taller-modal'); toast('Receta quitada'); await tallerTab('costos'); }
  catch (err) { toast(err.message, 'error'); }
}

// ═══ 3. CALCULADORA DE AROMA ═════════════════════════════════════════
function renderAromaCalc() {
  const st = Taller.settings;
  const essences = Taller.supplies.filter(s => s.kind === 'esencia');
  const waxes = Taller.supplies.filter(s => s.kind === 'cera');
  const essOpts = `<option value="">— Sin elegir —</option>` + essences.map(s => `<option value="${s.id}">${escT(s.name)}</option>`).join('');
  document.getElementById('taller-content').innerHTML = `
    <div class="tl-calc-grid">
      <div class="card"><div class="card-body">
        <div class="tl-calc-title">A · ¿Cuánta esencia pongo?</div>
        <p class="tl-calc-sub">Tengo la cera pesada y quiero un % de esencia.</p>
        <div class="tl-fields">
          <div class="form-group"><label class="form-label">Cera (g)</label><input class="form-control" id="ca-wax" type="number" step="any" value="${st.ref_wax_g}" oninput="calcA()" /></div>
          <div class="form-group"><label class="form-label">% de esencia</label><input class="form-control" id="ca-pct" type="number" step="any" value="${st.ref_pct}" oninput="calcA()" /></div>
        </div>
        <div class="form-group"><label class="form-label">Esencia (para revisar su máximo)</label><select class="form-control" id="ca-ess" onchange="calcA()">${essOpts}</select></div>
        <div class="tl-big" id="ca-out"></div>
      </div></div>

      <div class="card"><div class="card-body">
        <div class="tl-calc-title">B · ¿Qué % me quedó?</div>
        <p class="tl-calc-sub">Ya pesé la esencia y quiero saber el porcentaje.</p>
        <div class="tl-fields">
          <div class="form-group"><label class="form-label">Cera (g)</label><input class="form-control" id="cb-wax" type="number" step="any" value="${st.ref_wax_g}" oninput="calcB()" /></div>
          <div class="form-group"><label class="form-label">Esencia (g)</label><input class="form-control" id="cb-ess" type="number" step="any" value="10" oninput="calcB()" /></div>
        </div>
        <div class="tl-big" id="cb-out"></div>
      </div></div>

      <div class="card"><div class="card-body">
        <div class="tl-calc-title">C · ¿Cuánta cera cabe en el frasco?</div>
        <p class="tl-calc-sub">Para un frasco nuevo: cuánta cera y esencia lleva.</p>
        <div class="tl-fields tl-fields-3">
          <div class="form-group"><label class="form-label">Frasco (ml)</label><input class="form-control" id="cc-ml" type="number" step="any" value="${st.jar_ml}" oninput="calcC()" /></div>
          <div class="form-group"><label class="form-label">Llenado (%)</label><input class="form-control" id="cc-fill" type="number" step="any" value="${st.fill_pct}" oninput="calcC()" /></div>
          <div class="form-group"><label class="form-label">Densidad cera</label><input class="form-control" id="cc-dens" type="number" step="any" value="${st.wax_density}" oninput="calcC()" /></div>
        </div>
        <div class="tl-big" id="cc-out"></div>
        <small class="site-hint">Es el máximo: resta lo que ocupen toppings, gel o decoración.</small>
      </div></div>

      <div class="card"><div class="card-body">
        <div class="tl-calc-title">D · Lote: ¿me alcanza?</div>
        <p class="tl-calc-sub">Cuánto necesito para varias velas y si lo tengo en el taller.</p>
        <div class="tl-fields tl-fields-3">
          <div class="form-group"><label class="form-label">Velas</label><input class="form-control" id="cd-n" type="number" min="1" value="10" oninput="calcD()" /></div>
          <div class="form-group"><label class="form-label">Cera por vela (g)</label><input class="form-control" id="cd-wax" type="number" step="any" value="${st.ref_wax_g}" oninput="calcD()" /></div>
          <div class="form-group"><label class="form-label">% esencia</label><input class="form-control" id="cd-pct" type="number" step="any" value="${st.ref_pct}" oninput="calcD()" /></div>
        </div>
        <div class="tl-fields">
          <div class="form-group"><label class="form-label">Cera</label><select class="form-control" id="cd-waxs" onchange="calcD()"><option value="">— Sin elegir —</option>${waxes.map(s => `<option value="${s.id}">${escT(s.name)}</option>`).join('')}</select></div>
          <div class="form-group"><label class="form-label">Esencia</label><select class="form-control" id="cd-ess" onchange="calcD()">${essOpts}</select></div>
        </div>
        <div id="cd-out"></div>
      </div></div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-header"><div>
        <div class="card-title">🌸 ¿Para cuántas velas me alcanza cada esencia?</div>
        <div class="card-subtitle">Con velas de
          <input class="tl-inline" id="ref-wax" type="number" value="${st.ref_wax_g}" onchange="saveRefCandle()" /> g de cera al
          <input class="tl-inline" id="ref-pct" type="number" step="any" value="${st.ref_pct}" onchange="saveRefCandle()" /> %</div>
      </div></div>
      ${essences.length ? essences.map(s => {
        const c = essenceCandles(s);
        return `<div class="dash-row"><div><strong>${escT(s.name)}</strong><br><small>${fmtQty(s.stock, s.unit)}${s.max_pct ? ` · máx. ${s.max_pct}%` : ''}</small></div>
          <strong class="${c <= 2 ? 'text-danger' : ''}">${c ?? '—'} vela${c !== 1 ? 's' : ''}</strong></div>`;
      }).join('') : '<div class="empty-state" style="padding:24px"><p>Agrega tus esencias en 📦 Insumos (tipo Esencia, en ml) y aquí verás para cuántas velas te alcanza cada una.</p></div>'}
    </div>`;
  calcA(); calcB(); calcC(); calcD();
}

const r1 = (x) => Math.round(x * 10) / 10;
function pctTone(p, max) {
  if (max && p > max) return { cls: 'bad', txt: `Te pasas del ${max}% que recomienda el proveedor` };
  if (p > 10) return { cls: 'bad', txt: 'Sobre 10%: la cera de soja puede soltar la esencia (sudar)' };
  if (p >= 6 && p <= 8) return { cls: 'good', txt: 'Rango típico para soja (6–8%)' };
  return { cls: 'ok', txt: p < 6 ? 'Bajo el rango típico: el aroma puede quedar suave' : 'Algo alto: revisa que la cera lo acepte' };
}

function calcA() {
  const wax = numT(document.getElementById('ca-wax').value), pct = numT(document.getElementById('ca-pct').value);
  const s = Taller.supplies.find(x => x.id === Number(document.getElementById('ca-ess').value));
  const g = wax * pct / 100, ml = g / (Taller.settings.density || 0.95);
  const t = pctTone(pct, s?.max_pct);
  document.getElementById('ca-out').innerHTML = `<strong>${r1(g)} g</strong> de esencia <small>(≈ ${r1(ml)} ml)</small>
    <div class="tl-tone tl-${t.cls}">${t.txt}</div><small class="site-hint">Pésala en la balanza, no la midas por gotas.</small>`;
}
function calcB() {
  const wax = numT(document.getElementById('cb-wax').value), ess = numT(document.getElementById('cb-ess').value);
  const p = wax > 0 ? ess / wax * 100 : 0;
  const t = pctTone(p);
  document.getElementById('cb-out').innerHTML = `<strong>${r1(p)}%</strong> de esencia<div class="tl-tone tl-${t.cls}">${t.txt}</div>`;
}
function calcC() {
  const ml = numT(document.getElementById('cc-ml').value), fill = numT(document.getElementById('cc-fill').value), d = numT(document.getElementById('cc-dens').value);
  const wax = ml * fill / 100 * d, ess = wax * numT(Taller.settings.ref_pct) / 100;
  document.getElementById('cc-out').innerHTML = `<strong>${Math.round(wax)} g</strong> de cera máx.<small> · ${r1(ess)} g de esencia al ${Taller.settings.ref_pct}%</small>`;
}
function calcD() {
  const n = Math.max(0, numT(document.getElementById('cd-n').value)), waxPer = numT(document.getElementById('cd-wax').value), pct = numT(document.getElementById('cd-pct').value);
  const density = Taller.settings.density || 0.95;
  const wax = n * waxPer, essG = wax * pct / 100, essMl = essG / density;
  const w = Taller.supplies.find(x => x.id === Number(document.getElementById('cd-waxs').value));
  const e = Taller.supplies.find(x => x.id === Number(document.getElementById('cd-ess').value));
  const have = (s, need) => {
    if (!s) return '';
    const left = s.stock - need;
    return left >= 0 ? `<span class="tl-good">✓ tienes ${fmtQty(s.stock, s.unit)}, te sobran ${fmtQty(left, s.unit)}</span>`
      : `<span class="tl-bad">✗ tienes ${fmtQty(s.stock, s.unit)}, te faltan ${fmtQty(-left, s.unit)}</span>`;
  };
  document.getElementById('cd-out').innerHTML = `
    <div class="tl-res-row"><span>Cera</span><strong>${fmtQty(wax, 'g')}${wax >= 1000 ? ` (${r1(wax / 1000)} kg)` : ''}</strong></div>
    ${w ? `<div class="tl-have">${have(w, wax)}</div>` : ''}
    <div class="tl-res-row"><span>Esencia</span><strong>${r1(essG)} g ≈ ${r1(essMl)} ml</strong></div>
    ${e ? `<div class="tl-have">${have(e, e.unit === 'ml' ? essMl : essG)}</div>` : ''}
    ${e && e.max_pct && pct > e.max_pct ? `<div class="tl-tone tl-bad">Te pasas del ${e.max_pct}% máximo de esta esencia</div>` : ''}`;
}
async function saveRefCandle() {
  try {
    Taller.settings = await API.saveTallerSettings({ ref_wax_g: numT(document.getElementById('ref-wax').value), ref_pct: numT(document.getElementById('ref-pct').value) });
    renderAromaCalc();
  } catch (err) { toast(err.message, 'error'); }
}

// ═══ 4. PRODUCCIÓN ═══════════════════════════════════════════════════
function renderProduction() {
  const withR = Taller.recipes.products.filter(p => p.recipe);
  const essences = Taller.supplies.filter(s => s.kind === 'esencia');
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = Taller.productions.filter(p => String(p.created_at).slice(0, 7) === month);
  const unitsMonth = thisMonth.reduce((a, p) => a + p.quantity, 0);
  document.getElementById('taller-content').innerHTML = `
    <div class="tl-prod-layout">
      <div class="card"><div class="card-body">
        <div class="tl-calc-title">Registrar un lote</div>
        <p class="tl-calc-sub">Al guardar se descuentan los insumos de la receta y las velas se suman al stock de la tienda.</p>
        ${withR.length ? `
        <div class="form-group"><label class="form-label">Vela</label>
          <select class="form-control" id="pr-product" onchange="prodChanged()">${withR.map(p => `<option value="${p.id}">${escT(p.name)}</option>`).join('')}</select></div>
        <div class="tl-fields">
          <div class="form-group"><label class="form-label">¿Cuántas hiciste?</label><input class="form-control" id="pr-qty" type="number" min="1" value="1" oninput="prodPreview()" /></div>
          <div class="form-group" id="pr-ess-wrap"><label class="form-label">Aroma que usaste</label>
            <select class="form-control" id="pr-ess" onchange="prodPreview()"><option value="">Elige…</option>
              ${essences.length ? `<optgroup label="Una esencia">${essences.map(s => `<option value="s:${s.id}">${escT(s.name)}</option>`).join('')}</optgroup>` : ''}
              ${(Taller.blends || []).length ? `<optgroup label="Una combinación (Recetas → Aromas)">${Taller.blends.map(b => `<option value="b:${b.id}">${b.favorite ? '★ ' : ''}${escT(b.name)} · ${(b.parts || []).map(pt => `${escT(pt.aroma)} ${pt.pct}%`).join(' + ')}</option>`).join('')}</optgroup>` : ''}
            </select></div>
        </div>
        <label class="tl-check"><input type="checkbox" id="pr-stock" checked /> Sumar estas velas al stock de la tienda</label>
        <div class="form-group" style="margin-top:10px"><label class="form-label">Nota</label><input class="form-control" id="pr-notes" placeholder="Opcional: lote, pedido, color…" /></div>
        <div id="pr-preview"></div>
        <button class="btn btn-primary w-full" id="pr-btn" onclick="saveProduction()">Registrar producción</button>`
        : `<div class="empty-state" style="padding:24px"><p>Para registrar producción, primero crea la receta de la vela en 🧮 Costos por vela.</p>
            <button class="btn btn-secondary btn-sm" onclick="tallerTab('costos')">Ir a Costos por vela</button></div>`}
      </div></div>

      <div class="card">
        <div class="card-header"><div><div class="card-title">Producción reciente</div>
          <div class="card-subtitle">Este mes: ${unitsMonth} vela${unitsMonth !== 1 ? 's' : ''} · ${fmt(thisMonth.reduce((a, p) => a + p.cost_total, 0))} en materiales</div></div></div>
        ${Taller.productions.length ? Taller.productions.map(p => `
          <div class="dash-row">
            <div><strong>${p.quantity} × ${escT(p.product_name)}</strong><br>
              <small>${fmtDate(p.created_at)}${p.blend_name ? ' · 🧪 ' + escT(p.blend_name) : p.fragrance_name ? ' · ' + escT(p.fragrance_name) : ''}${p.user_name ? ' · ' + escT(p.user_name) : ''}${p.notes ? ' · ' + escT(p.notes) : ''}${p.added_to_stock ? '' : ' · no sumó stock'}</small></div>
            <div style="display:flex;align-items:center;gap:8px"><small>${fmt(p.cost_total)}</small>
              <button class="btn btn-ghost btn-sm" title="Deshacer" onclick="undoProduction(${p.id})">↩︎</button></div>
          </div>`).join('') : '<div class="empty-state" style="padding:24px"><p>Aún no registras producción</p></div>'}
      </div>
    </div>`;
  if (withR.length) prodChanged();
}

function prodChanged() {
  const p = Taller.recipes.products.find(x => x.id === Number(document.getElementById('pr-product').value));
  const needsEss = p && p.cost?.fragrance;
  document.getElementById('pr-ess-wrap').style.display = needsEss ? '' : 'none';
  // Propone lo de su receta: la combinación de su ficha (Recetas) o la esencia de su costo
  const sheet = (Taller.sheets || []).find(sh => sh.product_id === p?.id && sh.blend_id);
  if (needsEss) document.getElementById('pr-ess').value = sheet ? `b:${sheet.blend_id}` : p.recipe.fragrance_supply_id ? `s:${p.recipe.fragrance_supply_id}` : '';
  prodPreview();
}

let prodTimer = null, prodPlan = null;
function prodPreview() {
  clearTimeout(prodTimer);
  prodTimer = setTimeout(async () => {
    const box = document.getElementById('pr-preview');
    if (!box) return;
    const data = prodData();
    prodPlan = null;
    if (document.getElementById('pr-ess-wrap').style.display !== 'none' && !data.fragrance_supply_id && !data.blend_id) {
      box.innerHTML = '<div class="tl-preview">Elige la esencia o la combinación para ver lo que se descuenta.</div>'; return;
    }
    try {
      prodPlan = await API.produce({ ...data, dry_run: true });
      box.innerHTML = `<div class="tl-preview">
        ${prodPlan.needs.map(nd => `<div class="tl-res-row"><span>${escT(nd.name)}</span>
          <strong class="${nd.missing > 0 ? 'text-danger' : ''}">−${fmtQty(nd.qty, nd.unit)}${nd.missing > 0 ? ` <small>(faltan ${fmtQty(nd.missing, nd.unit)})</small>` : ''}</strong></div>`).join('')}
        <div class="tl-res-row sum"><span>Materiales del lote</span><strong>${fmt(prodPlan.cost_total)} <small>(${fmt(prodPlan.unit_cost)} c/u)</small></strong></div>
        ${prodPlan.blend?.unmatched?.length ? `<div class="tl-tone tl-bad" style="margin-top:8px">No encontré en tus insumos: ${prodPlan.blend.unmatched.map(escT).join(', ')}. Esas no se descuentan (agrégalas en 📦 Insumos como “Esencia …”).</div>` : ''}
      </div>`;
      document.getElementById('pr-btn').textContent = prodPlan.shortages.length ? 'Registrar igual (falta stock)' : 'Registrar producción';
    } catch (err) { box.innerHTML = `<div class="alert alert-warning">${escT(err.message)}</div>`; }
  }, 250);
}

function prodData() {
  return {
    product_id: Number(document.getElementById('pr-product').value),
    quantity: Math.floor(numT(document.getElementById('pr-qty').value)),
    ...(() => {
      const [kind, id] = String(document.getElementById('pr-ess').value || '').split(':');
      return { fragrance_supply_id: kind === 's' ? Number(id) : null, blend_id: kind === 'b' ? Number(id) : null };
    })(),
    add_to_stock: document.getElementById('pr-stock').checked,
    notes: document.getElementById('pr-notes').value,
  };
}

async function saveProduction() {
  const data = prodData();
  if (!(data.quantity > 0)) return toast('Indica cuántas velas hiciste', 'warning');
  if (prodPlan?.shortages?.length && !confirm('En el sistema no alcanzan algunos insumos (quedarán en negativo). ¿Registrar igual? Después corrige con 🔢 Conté.')) return;
  try {
    await API.produce({ ...data, force: !!prodPlan?.shortages?.length });
    toast(`Producción registrada${data.add_to_stock ? ': velas sumadas al stock' : ''}`);
    Taller.supplies = await API.supplies();
    await tallerTab('produccion');
  } catch (err) { toast(err.message, 'error'); }
}

async function undoProduction(id) {
  if (!confirm('¿Deshacer esta producción? Se devuelven los insumos y se restan las velas del stock.')) return;
  try { await API.undoProduction(id); toast('Producción deshecha'); Taller.supplies = await API.supplies(); await tallerTab('produccion'); }
  catch (err) { toast(err.message, 'error'); }
}
