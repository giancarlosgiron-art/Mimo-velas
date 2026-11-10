// ── Recetas: fichas de velas y moldes, y creación de aromas ───────────────────
// Usa los ayudantes del Taller (escT, numT, fmtQty, UNIT_LABEL, SUPPLY_KINDS, openTallerModal).

const RC_ROLES = {
  cera:       { icon: '🕯️', label: 'Cera',        unit: 'g',    kinds: ['cera'] },
  mecha:      { icon: '🧵', label: 'Mecha',       unit: 'unid', kinds: ['mecha'] },
  envase:     { icon: '🫙', label: 'Envase',      unit: 'unid', kinds: ['frasco'] },
  pegatina:   { icon: '🏷️', label: 'Pegatina',    unit: 'unid', kinds: ['mecha', 'empaque', 'otro'] },
  decoracion: { icon: '🍓', label: 'Decoración',  unit: 'unid', kinds: ['decoracion', 'cera', 'colorante', 'otro'] },
  pieza:      { icon: '🧩', label: 'Pieza de molde', unit: 'unid', kinds: [], velaOnly: true },
  colorante:  { icon: '🎨', label: 'Colorante',   unit: 'g',    kinds: ['colorante'] },
  otro:       { icon: '✨', label: 'Otro',        unit: 'unid', kinds: null },
};
const RC_DEFAULT_LINES = {
  vela: [{ role: 'cera', qty: 150 }, { role: 'mecha', qty: 1 }, { role: 'envase', qty: 1 }, { role: 'pegatina', qty: 1 }, { role: 'decoracion', qty: '', weight_g: '' }],
  molde: [{ role: 'cera', qty: 100 }, { role: 'colorante', qty: '' }, { role: 'decoracion', qty: '', weight_g: '' }],
};

const Rc = { tab: 'vela', sheets: [], blends: [], products: [], aromas: [], calcBlend: null };

async function loadRecetas() {
  try {
    const [sheets, blends, supplies, settings, prods, aromas] = await Promise.all([
      API.sheets(), API.blends(), API.supplies(), API.tallerSettings(), API.products({ limit: 500 }), API.aromas()]);
    Object.assign(Rc, { sheets, blends, products: Array.isArray(prods) ? prods : (prods.products || []), aromas });
    Taller.supplies = supplies; Taller.settings = settings;
    recetasTab(Rc.tab);
  } catch (err) { toast('Error cargando recetas: ' + err.message, 'error'); }
}

function recetasTab(tab) {
  Rc.tab = tab;
  document.querySelectorAll('#rc-tabs .tl-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'aromas') renderBlends(); else renderSheets();
}

function recetasNew() {
  if (Rc.tab === 'aromas') openBlendModal(); else openSheetModal(null, Rc.tab);
}

const blendImg = (b) => b.has_image ? `/api/recetas/blends/${b.id}/image?v=${b.image_v}` : '';
const partsText = (parts) => (parts || []).map(p => `${escT(p.aroma)} ${p.pct}%`).join(' · ');
const normT = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
function essenceFor(aroma) {
  const ess = Taller.supplies.filter(s => s.kind === 'esencia');
  const a = normT(aroma);
  return ess.find(s => normT(s.name).replace(/^esencia\s+/, '') === a) || ess.find(s => normT(s.name).includes(a)) || null;
}
const g1 = (x) => (Math.round(x * 10) / 10).toLocaleString('es-CL');

// ═══ FICHAS (velas y moldes) ══════════════════════════════════════════
function renderSheets() {
  const type = Rc.tab;
  const list = Rc.sheets.filter(s => s.type === type);
  const el = document.getElementById('recetas-content');
  const noun = type === 'molde' ? 'molde' : 'vela';
  el.innerHTML = `
    <div class="rc-head">
      <p class="text-muted text-sm">${type === 'molde'
        ? 'Para wax melts y piezas de molde: cuánta cera lleva la tanda, cuántas piezas salen y con qué aroma.'
        : 'La ficha de cada vela: cera, mecha, envase, pegatina, decoraciones y esencia.'}</p>
      <button class="btn btn-primary" onclick="openSheetModal(null,'${type}')">+ Nueva receta de ${noun}</button>
    </div>
    ${list.length ? `<div class="rc-grid">${list.map(sheetCard).join('')}</div>` : `
      <div class="card"><div class="empty-state">
        <div class="empty-icon">${type === 'molde' ? '🧩' : '🕯️'}</div>
        <h3>Aún no tienes recetas de ${noun}s</h3>
        <p>${type === 'molde' ? 'Ej: Wax melt corazones · 6 piezas · 90 g de cera · mezcla Pink Cloud.' : 'Ej: Red Velvet Cake · 150 g de cera · 1 mecha · frasco 220 ml · 3 frambuesas de 4 g.'}</p>
        <button class="btn btn-primary" onclick="openSheetModal(null,'${type}')">+ Crear la primera</button>
      </div></div>`}`;
}

function sheetCard(s) {
  const c = s.calc;
  const deco = (s.lines || []).filter(l => (l.role === 'decoracion' || l.role === 'pieza') && numT(l.qty) > 0);
  const per = s.type === 'molde' && c.pieces > 1;
  return `
    <div class="card rc-card" onclick="openSheetModal(${s.id})">
      <div class="rc-card-top">
        <div><strong>${escT(s.name)}</strong>
          <small>${s.product_name ? '🛍️ ' + escT(s.product_name) : 'Sin producto del catálogo'}${s.type === 'molde' && s.mold_name ? ' · ' + escT(s.mold_name) : ''}</small></div>
        ${s.sync_cost ? '<span class="badge badge-success" title="Esta receta manda el costo del producto">costo</span>' : ''}
      </div>
      <div class="rc-facts">
        <div><span>Cera</span><strong>${g1(c.wax)} g</strong></div>
        <div><span>Esencia</span><strong>${g1(c.ess_g)} g</strong><small>${s.fragrance_pct}%</small></div>
        ${per ? `<div><span>Piezas</span><strong>${c.pieces}</strong></div>` : `<div><span>Decoración</span><strong>${deco.reduce((a, l) => a + numT(l.qty), 0)}</strong><small>${g1(c.deco_weight + (c.mold_weight || 0))} g</small></div>`}
      </div>
      <div class="rc-card-foot">
        <span>${s.blend_name ? '🌸 ' + escT(s.blend_name) : '🌸 Aroma a elección'}</span>
        <strong>${c.cost > 0 ? fmt(c.cost_per_piece) + (per ? ' c/pieza' : '') : ''}</strong>
      </div>
    </div>`;
}

let SheetDraft = null;
function openSheetModal(id, type, copyFrom) {
  const src = copyFrom || (id ? Rc.sheets.find(s => s.id === id) : null);
  type = src?.type || type || 'vela';
  SheetDraft = src ? {
    id: copyFrom ? null : src.id, type, name: copyFrom ? `${src.name} (copia)` : src.name, product_id: src.product_id || '', blend_id: src.blend_id || '',
    fragrance_pct: src.fragrance_pct, pieces: src.pieces || 1, mold_name: src.mold_name || '', notes: src.notes || '', sync_cost: !!src.sync_cost,
    lines: (src.lines || []).map(l => ({ ...l })),
  } : {
    id: null, type, name: '', product_id: '', blend_id: '', fragrance_pct: Taller.settings.ref_pct || 7, pieces: type === 'molde' ? 6 : 1,
    mold_name: '', notes: '', sync_cost: false, lines: RC_DEFAULT_LINES[type].map(l => ({ ...l, supply_id: autoSupply(l.role) })),
  };
  const d = SheetDraft;
  const prodOpts = Rc.products.map(p => `<option value="${p.id}" ${String(p.id) === String(d.product_id) ? 'selected' : ''}>${escT(p.name)}</option>`).join('');
  const blendOpts = Rc.blends.map(b => `<option value="${b.id}" ${String(b.id) === String(d.blend_id) ? 'selected' : ''}>${b.favorite ? '★ ' : ''}${escT(b.name)}</option>`).join('');
  openTallerModal(d.id ? `Receta · ${d.name}` : copyFrom ? 'Copia de receta' : `Nueva receta de ${type === 'molde' ? 'molde' : 'vela'}`, `
    <div class="tl-recipe-editor">
      <div>
        <div class="tl-fields">
          <div class="form-group"><label class="form-label">Nombre *</label>
            <input class="form-control" value="${escT(d.name)}" placeholder="${type === 'molde' ? 'Ej: Wax melt corazones' : 'Ej: Red Velvet Cake'}" oninput="SheetDraft.name=this.value" /></div>
          <div class="form-group"><label class="form-label">Producto del catálogo</label>
            <select class="form-control" onchange="SheetDraft.product_id=this.value;rcSyncRow()"><option value="">— Ninguno —</option>${prodOpts}</select></div>
        </div>
        ${type === 'molde' ? `<div class="tl-fields">
          <div class="form-group"><label class="form-label">Molde</label><input class="form-control" value="${escT(d.mold_name)}" placeholder="Ej: corazones de silicona" oninput="SheetDraft.mold_name=this.value" /></div>
          <div class="form-group"><label class="form-label">Piezas que salen</label><input class="form-control" type="number" min="1" value="${d.pieces}" oninput="SheetDraft.pieces=this.value;rcSummary()" /></div>
        </div>` : ''}
        <div class="form-label" style="margin-top:4px">Lo que lleva ${type === 'molde' ? 'la tanda' : 'una vela'}</div>
        <div id="sh-lines"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" onclick="SheetDraft.lines.push({role:'decoracion',qty:'',weight_g:''});rcLines()">+ Agregar</button>
          ${type === 'vela' ? `<button class="btn btn-secondary btn-sm" onclick="SheetDraft.lines.push({role:'pieza',sheet_id:'',qty:1});rcLines()">🧩 + Pieza de molde</button>` : ''}
        </div>
        <div class="tl-fields" style="margin-top:16px">
          <div class="form-group"><label class="form-label">Mezcla de aroma</label>
            <select class="form-control" onchange="SheetDraft.blend_id=this.value;rcSummary()"><option value="">A elección (un solo aroma)</option>${blendOpts}</select></div>
          <div class="form-group"><label class="form-label">% de esencia sobre la cera</label>
            <input class="form-control" type="number" step="any" min="0" value="${d.fragrance_pct}" oninput="SheetDraft.fragrance_pct=this.value;rcSummary()" /></div>
        </div>
        <div class="form-group"><label class="form-label">Pasos y notas</label>
          <textarea class="form-control" rows="3" placeholder="Ej: verter a 60 °C, crema batida con cera 62, decorar antes de que enfríe" oninput="SheetDraft.notes=this.value">${escT(d.notes)}</textarea></div>
        <div id="sh-sync"></div>
      </div>
      <div class="tl-result" id="sh-summary"></div>
    </div>`, `
    ${d.id ? `<button class="btn btn-ghost" style="margin-right:auto;color:var(--danger)" onclick="deleteSheet(${d.id})">Eliminar</button>
      <button class="btn btn-secondary" onclick="openSheetModal(null,null,Rc.sheets.find(s=>s.id===${d.id}))">Duplicar</button>` : ''}
    <button class="btn btn-secondary" onclick="closeModal('taller-modal')">Cancelar</button>
    <button class="btn btn-primary" onclick="saveSheet()">Guardar receta</button>`, true);
  rcLines(); rcSyncRow();
}

// Si hay un solo insumo de ese tipo en el taller, se elige solo
function autoSupply(role) {
  const kinds = RC_ROLES[role].kinds;
  if (!kinds || role === 'decoracion') return '';
  const list = Taller.supplies.filter(s => s.kind === kinds[0]);
  return list.length === 1 ? list[0].id : '';
}

function rcLines() {
  document.getElementById('sh-lines').innerHTML = SheetDraft.lines.map((l, i) => {
    const r = RC_ROLES[l.role] || RC_ROLES.otro;
    const opts = Taller.supplies.filter(s => !r.kinds || r.kinds.includes(s.kind));
    const s = Taller.supplies.find(x => x.id === Number(l.supply_id));
    const unit = s ? UNIT_LABEL[s.unit] : UNIT_LABEL[r.unit];
    const deco = l.role === 'decoracion';
    if (l.role === 'pieza') return rcMoldLine(l, i);
    return `
      <div class="rc-line ${deco ? 'deco' : ''}">
        <select class="form-control rc-role" onchange="SheetDraft.lines[${i}].role=this.value;rcLines()">
          ${Object.entries(RC_ROLES).filter(([k, v]) => !v.velaOnly || SheetDraft.type === 'vela' || k === l.role).map(([k, v]) => `<option value="${k}" ${k === l.role ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}
        </select>
        <div class="rc-what">
          <select class="form-control" onchange="SheetDraft.lines[${i}].supply_id=this.value;rcLines()">
            <option value="">${opts.length ? 'Escribir nombre…' : 'Sin insumos de este tipo'}</option>
            ${opts.map(o => `<option value="${o.id}" ${o.id === Number(l.supply_id) ? 'selected' : ''}>${escT(o.name)}</option>`).join('')}
          </select>
          ${!s ? `<input class="form-control" value="${escT(l.name || '')}" placeholder="${deco ? 'Ej: frambuesa de cera' : 'Nombre'}" oninput="SheetDraft.lines[${i}].name=this.value" />` : ''}
        </div>
        <div class="rc-qty rc-q">
          <input class="form-control" type="number" step="any" min="0" value="${l.qty ?? ''}" placeholder="${deco ? 'Cuántas' : 'Cant.'}" oninput="SheetDraft.lines[${i}].qty=this.value;rcSummary()" />
          <span>${deco ? 'unid.' : unit}</span>
        </div>
        ${deco ? `<div class="rc-qty rc-w"><input class="form-control" type="number" step="any" min="0" value="${l.weight_g ?? ''}" placeholder="Peso c/u" oninput="SheetDraft.lines[${i}].weight_g=this.value;rcSummary()" /><span>g c/u</span></div>` : ''}
        <button class="btn btn-ghost btn-sm rc-x" title="Quitar" onclick="SheetDraft.lines.splice(${i},1);rcLines()">✕</button>
      </div>`;
  }).join('');
  rcSummary();
}

// Línea "Pieza de molde": una de tus recetas de molde + cuántas piezas lleva la vela
function rcMoldLine(l, i) {
  const molds = Rc.sheets.filter(x => x.type === 'molde');
  const m = molds.find(x => x.id === Number(l.sheet_id));
  return `
      <div class="rc-line deco">
        <select class="form-control rc-role" onchange="SheetDraft.lines[${i}].role=this.value;rcLines()">
          ${Object.entries(RC_ROLES).map(([k, v]) => `<option value="${k}" ${k === l.role ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}
        </select>
        <div class="rc-what">
          <select class="form-control" onchange="SheetDraft.lines[${i}].sheet_id=this.value;rcLines()">
            <option value="">${molds.length ? 'Elige el molde…' : 'Aún no tienes recetas de molde'}</option>
            ${molds.map(o => `<option value="${o.id}" ${o.id === Number(l.sheet_id) ? 'selected' : ''}>${escT(o.name)}${o.mold_name ? ' · ' + escT(o.mold_name) : ''}</option>`).join('')}
          </select>
        </div>
        <div class="rc-qty rc-q">
          <input class="form-control" type="number" step="any" min="0" value="${l.qty ?? ''}" placeholder="Cuántas" oninput="SheetDraft.lines[${i}].qty=this.value;rcSummary()" />
          <span>piezas</span>
        </div>
        <div class="rc-qty rc-w"><small class="site-hint" style="margin:0">${m ? `${g1(m.calc.total_weight / m.calc.pieces)} g · ${m.calc.cost > 0 ? fmt(m.calc.cost_per_piece) : '—'} c/u` : ''}</small></div>
        <button class="btn btn-ghost btn-sm rc-x" title="Quitar" onclick="SheetDraft.lines.splice(${i},1);rcLines()">✕</button>
      </div>`;
}

function rcSyncRow() {
  const p = Rc.products.find(x => String(x.id) === String(SheetDraft.product_id));
  document.getElementById('sh-sync').innerHTML = p ? `
    <label class="tl-check"><input type="checkbox" ${SheetDraft.sync_cost ? 'checked' : ''} onchange="SheetDraft.sync_cost=this.checked" /> Usar esta receta para el costo de ${escT(p.name)}
      <small class="site-hint">Así no la cargas dos veces: el costo en Taller → Costos por vela sale de aquí y se actualiza solo.</small></label>` : '';
}

// Mismo cálculo que el servidor (routes/recetas.js)
function rcCalc(d) {
  const st = Taller.settings, density = st.density || 0.95;
  const pieces = Math.max(1, Math.floor(numT(d.pieces)) || 1);
  const perG = (s) => s.unit === 'ml' ? s.unit_cost / density : s.unit_cost;
  const ess = Taller.supplies.filter(s => s.kind === 'esencia' && s.unit_cost > 0);
  const avgG = ess.length ? ess.reduce((a, s) => a + perG(s), 0) / ess.length : 0;
  let wax = 0, deco = 0, decoCount = 0, cost = 0, missing = false, mold = 0, moldCount = 0;
  for (const l of d.lines) {
    if (l.role === 'pieza') {
      const m = Rc.sheets.find(x => x.type === 'molde' && x.id === Number(l.sheet_id));
      const q = numT(l.qty);
      if (!m) { if (q > 0) missing = true; continue; }
      moldCount += q; mold += q * m.calc.total_weight / m.calc.pieces; cost += q * m.calc.cost_per_piece;
      continue;
    }
    const s = Taller.supplies.find(x => x.id === Number(l.supply_id));
    const qty = numT(l.qty);
    if (l.role === 'cera') wax += qty;
    if (l.role === 'decoracion') { deco += qty * numT(l.weight_g); decoCount += qty; }
    if (!s) { if (qty > 0 && l.role !== 'otro') missing = true; continue; }
    cost += (l.role === 'decoracion' && s.unit === 'g' ? qty * numT(l.weight_g) : qty) * s.unit_cost;
  }
  const essG = wax * numT(d.fragrance_pct) / 100;
  const blend = Rc.blends.find(b => String(b.id) === String(d.blend_id));
  const sum = blend ? blend.parts.reduce((a, p) => a + p.pct, 0) || 100 : 100;
  const parts = blend ? blend.parts.map(p => {
    const s = essenceFor(p.aroma); const g = essG * p.pct / sum;
    return { ...p, grams: g, s, cost: g * (s && s.unit_cost ? perG(s) : avgG) };
  }) : [];
  cost += parts.length ? parts.reduce((a, p) => a + p.cost, 0) : essG * avgG;
  return { pieces, wax, essG, essMl: essG / density, parts, deco, decoCount, mold, moldCount, total: wax + essG + deco + mold, cost, perPiece: cost / pieces, missing };
}

function rcSummary() {
  const d = SheetDraft, c = rcCalc(d);
  const row = (a, b, cls = '') => `<div class="tl-res-row ${cls}"><span>${a}</span><strong>${b}</strong></div>`;
  const molde = d.type === 'molde' && c.pieces > 1;
  document.getElementById('sh-summary').innerHTML = `
    <div class="tl-res-title">Ficha ${molde ? `de la tanda (${c.pieces} piezas)` : 'de una vela'}</div>
    ${row('Cera', `${g1(c.wax)} g`)}
    ${row(`Esencia <small>${numT(d.fragrance_pct)}%</small>`, `${g1(c.essG)} g <small>≈ ${g1(c.essMl)} ml</small>`)}
    ${c.parts.length ? `<div class="rc-parts">${c.parts.map(p => `<div><span>${escT(p.aroma)} <small>${p.pct}%</small></span><strong>${g1(p.grams)} g</strong></div>`).join('')}</div>` : ''}
    ${c.decoCount ? row(`Decoración <small>${c.decoCount} unid.</small>`, `${g1(c.deco)} g`) : ''}
    ${c.moldCount ? row(`🧩 Piezas de molde <small>${g1(c.moldCount)} unid.</small>`, `${g1(c.mold)} g`) : ''}
    ${row('Peso total aprox.', `${g1(c.total)} g`, 'sum')}
    ${molde ? row('Por pieza', `${g1(c.total / c.pieces)} g · ${g1(c.wax / c.pieces)} g de cera`) : ''}
    <div class="tl-res-title" style="margin-top:14px">Costo estimado</div>
    ${row(molde ? 'Por pieza' : 'Por vela', c.cost > 0 ? fmt(c.perPiece) : '—', 'sum')}
    ${molde ? row('La tanda completa', fmt(c.cost)) : ''}
    <small class="site-hint">${c.missing ? 'Hay líneas sin insumo del Taller: no suman al costo. ' : ''}Sale de lo que pagaste por cada insumo en Taller.${c.moldCount ? ' Las piezas de molde suman lo de su receta (cera, esencia, colorante…) y se descuentan al registrar la producción.' : ''}</small>`;
}

async function saveSheet() {
  const d = SheetDraft;
  if (!d.name.trim()) return toast('Ponle nombre a la receta', 'warning');
  if (d.lines.some(l => l.role === 'pieza' && !l.sheet_id && numT(l.qty) > 0)) return toast('Elige qué molde es cada pieza', 'warning');
  const data = { ...d, lines: d.lines.map(l => ({ ...l, qty: numT(l.qty), weight_g: numT(l.weight_g) })) };
  try {
    if (d.id) await API.updateSheet(d.id, data); else await API.createSheet(data);
    closeModal('taller-modal');
    toast(d.sync_cost && d.product_id ? 'Receta guardada y costo del producto actualizado' : 'Receta guardada');
    Rc.sheets = await API.sheets(); renderSheets();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteSheet(id) {
  if (!confirm('¿Eliminar esta receta?')) return;
  try { await API.deleteSheet(id); closeModal('taller-modal'); toast('Receta eliminada'); Rc.sheets = await API.sheets(); renderSheets(); }
  catch (err) { toast(err.message, 'error'); }
}

// ═══ CREACIÓN DE AROMAS ══════════════════════════════════════════════
function renderBlends() {
  if (!Rc.calcBlend && Rc.blends.length) Rc.calcBlend = Rc.blends[0].id;
  const el = document.getElementById('recetas-content');
  el.innerHTML = `
    <div class="card rc-calc">
      <div class="card-body">
        <div class="tl-calc-title">Calculadora de mezcla</div>
        <p class="tl-calc-sub">Elige una mezcla, pon cuántos gramos de esencia vas a usar y te digo cuánto va de cada aroma.</p>
        <div class="rc-calc-in">
          <div class="form-group"><label class="form-label">Mezcla</label>
            <select class="form-control" id="bc-blend" onchange="Rc.calcBlend=Number(this.value);blendCalc()">
              ${Rc.blends.map(b => `<option value="${b.id}" ${b.id === Rc.calcBlend ? 'selected' : ''}>${b.favorite ? '★ ' : ''}${escT(b.name)}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Gramos de esencia</label>
            <input class="form-control" id="bc-grams" type="number" step="any" min="0" value="${Rc.calcGrams ?? 50}" oninput="Rc.calcGrams=this.value;blendCalc()" /></div>
          <div class="form-group rc-from-wax"><label class="form-label">…o desde la cera</label>
            <div class="rc-inline"><input class="form-control" id="bc-wax" type="number" min="0" placeholder="g cera" />
              <span>al</span><input class="form-control" id="bc-pct" type="number" step="any" value="${Taller.settings.ref_pct || 7}" /><span>%</span>
              <button class="btn btn-secondary btn-sm" onclick="blendFromWax()">Usar</button></div></div>
        </div>
        <div id="bc-out"></div>
      </div>
    </div>

    <div class="rc-head" style="margin-top:20px">
      <div class="tl-section-title" style="margin:0">Tus mezclas <small class="text-muted">(${Rc.blends.length})</small></div>
      <button class="btn btn-primary" onclick="openBlendModal()">+ Nueva mezcla</button>
    </div>
    <div class="rc-blends">${Rc.blends.map(b => `
      <div class="card rc-blend ${b.id === Rc.calcBlend ? 'active' : ''}">
        <div class="rc-blend-img" onclick="pickBlend(${b.id})">${b.has_image ? `<img src="${blendImg(b)}" alt="" loading="lazy" />` : '<span>🌸</span>'}</div>
        <div class="rc-blend-body" onclick="pickBlend(${b.id})">
          <div class="rc-blend-name">${escT(b.name)} ${b.favorite ? '<span class="rc-fav">Mi favorita</span>' : ''}</div>
          <div class="rc-blend-parts">${partsText(b.parts)}</div>
          ${b.description ? `<p>${escT(b.description)}</p>` : ''}
        </div>
        <button class="btn btn-ghost btn-sm rc-blend-edit" title="Editar" onclick="openBlendModal(${b.id})">✏️</button>
      </div>`).join('') || '<div class="empty-state"><p>Aún no tienes mezclas.</p></div>'}
    </div>`;
  blendCalc();
}

function pickBlend(id) {
  Rc.calcBlend = id;
  renderBlends();
  document.querySelector('.rc-calc')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function blendFromWax() {
  const wax = numT(document.getElementById('bc-wax').value), pct = numT(document.getElementById('bc-pct').value);
  if (!(wax > 0)) return toast('Pon los gramos de cera', 'warning');
  Rc.calcGrams = Math.round(wax * pct / 100 * 10) / 10;
  document.getElementById('bc-grams').value = Rc.calcGrams;
  blendCalc();
}

function blendCalc() {
  const out = document.getElementById('bc-out');
  const b = Rc.blends.find(x => x.id === Rc.calcBlend);
  if (!b) { out.innerHTML = ''; return; }
  const total = numT(document.getElementById('bc-grams').value);
  const sum = b.parts.reduce((a, p) => a + p.pct, 0);
  const density = Taller.settings.density || 0.95;
  out.innerHTML = `
    <div class="rc-calc-out">
      ${b.has_image ? `<img src="${blendImg(b)}" alt="" />` : ''}
      <div style="flex:1">
        <div class="rc-calc-name">${escT(b.name)}</div>
        <table class="rc-table">
          <thead><tr><th>Aroma</th><th>%</th><th>Gramos</th><th>≈ ml</th><th>En tu taller</th></tr></thead>
          <tbody>${b.parts.map(p => {
            const g = sum ? total * p.pct / sum : 0;
            const s = essenceFor(p.aroma);
            const need = s ? (s.unit === 'ml' ? g / density : g) : 0;
            return `<tr><td><strong>${escT(p.aroma)}</strong></td><td>${p.pct}%</td><td><strong>${g1(g)} g</strong></td><td>${g1(g / density)}</td>
              <td>${s ? `<span class="${s.stock >= need ? 'tl-good' : 'tl-bad'}">${s.stock >= need ? '✓' : '✗'} ${fmtQty(s.stock, s.unit)}</span>` : '<span class="text-muted">no está en Insumos</span>'}</td></tr>`;
          }).join('')}</tbody>
          <tfoot><tr><td>Total</td><td>${sum}%</td><td><strong>${g1(total)} g</strong></td><td>${g1(total / density)}</td><td></td></tr></tfoot>
        </table>
        ${sum !== 100 ? `<div class="tl-tone tl-ok">Los porcentajes suman ${sum}%, no 100%: repartí en proporción.</div>` : ''}
        <small class="site-hint">Pesa cada esencia en la balanza y mézclalas antes de agregarlas a la cera.</small>
      </div>
    </div>`;
}

let BlendDraft = null;
function openBlendModal(id) {
  const b = id ? Rc.blends.find(x => x.id === id) : null;
  BlendDraft = { id: b?.id || null, name: b?.name || '', description: b?.description || '', favorite: !!b?.favorite,
    parts: b ? b.parts.map(p => ({ ...p })) : [{ aroma: '', pct: '' }, { aroma: '', pct: '' }, { aroma: '', pct: '' }], file: null };
  const names = [...new Set([...Rc.aromas.map(a => a.name), ...Taller.supplies.filter(s => s.kind === 'esencia').map(s => s.name.replace(/^esencia\s+/i, ''))])];
  openTallerModal(b ? `Mezcla · ${b.name}` : 'Nueva mezcla de aromas', `
    <datalist id="bl-aromas">${names.map(nm => `<option value="${escT(nm)}">`).join('')}</datalist>
    <div class="rc-blend-form">
      <label class="rc-blend-photo" title="Cambiar foto">
        ${b?.has_image ? `<img id="bl-img" src="${blendImg(b)}" alt="" />` : '<img id="bl-img" alt="" style="display:none" /><span id="bl-img-empty">📷<br>Foto</span>'}
        <input type="file" accept="image/*" hidden onchange="blendPhoto(this)" />
      </label>
      <div style="flex:1">
        <div class="form-group"><label class="form-label">Nombre *</label>
          <input class="form-control" value="${escT(BlendDraft.name)}" placeholder="Ej: Cherry Almond Kiss" oninput="BlendDraft.name=this.value" /></div>
        <label class="tl-check"><input type="checkbox" ${BlendDraft.favorite ? 'checked' : ''} onchange="BlendDraft.favorite=this.checked" /> Mi favorita</label>
      </div>
    </div>
    <div class="form-label" style="margin-top:12px">Aromas y porcentajes</div>
    <div id="bl-parts"></div>
    <button class="btn btn-secondary btn-sm" onclick="BlendDraft.parts.push({aroma:'',pct:''});blendParts()">+ Agregar aroma</button>
    <div class="form-group" style="margin-top:14px"><label class="form-label">Descripción</label>
      <textarea class="form-control" rows="3" placeholder="Cómo huele y para qué vela la imaginas" oninput="BlendDraft.description=this.value">${escT(BlendDraft.description)}</textarea></div>`, `
    ${b ? `<button class="btn btn-ghost" style="margin-right:auto;color:var(--danger)" onclick="deleteBlend(${b.id})">Eliminar</button>` : ''}
    <button class="btn btn-secondary" onclick="closeModal('taller-modal')">Cancelar</button>
    <button class="btn btn-primary" onclick="saveBlend()">Guardar mezcla</button>`);
  blendParts();
}

function blendParts() {
  document.getElementById('bl-parts').innerHTML = BlendDraft.parts.map((p, i) => `
    <div class="rc-part">
      <input class="form-control" list="bl-aromas" value="${escT(p.aroma)}" placeholder="Aroma" oninput="BlendDraft.parts[${i}].aroma=this.value" />
      <div class="rc-qty"><input class="form-control" type="number" step="any" min="0" max="100" value="${p.pct}" placeholder="%" oninput="BlendDraft.parts[${i}].pct=this.value;blendSum()" /><span>%</span></div>
      <button class="btn btn-ghost btn-sm" onclick="BlendDraft.parts.splice(${i},1);blendParts()">✕</button>
    </div>`).join('') + '<div id="bl-sum" class="tl-tone"></div>';
  blendSum();
}
function blendSum() {
  const sum = BlendDraft.parts.reduce((a, p) => a + numT(p.pct), 0);
  const el = document.getElementById('bl-sum');
  el.className = 'tl-tone ' + (Math.abs(sum - 100) < 0.01 ? 'tl-good' : 'tl-bad');
  el.textContent = Math.abs(sum - 100) < 0.01 ? 'Suma 100% ✓' : `Suma ${Math.round(sum * 10) / 10}% (debería ser 100%)`;
}
async function blendPhoto(input) {
  const f = input.files[0];
  if (!f) return;
  BlendDraft.file = await compressImage(f, 900, 0.85);
  const img = document.getElementById('bl-img');
  img.src = URL.createObjectURL(BlendDraft.file); img.style.display = '';
  document.getElementById('bl-img-empty')?.remove();
}

async function saveBlend() {
  const d = BlendDraft;
  if (!d.name.trim()) return toast('Ponle nombre a la mezcla', 'warning');
  const parts = d.parts.filter(p => p.aroma.trim() && numT(p.pct) > 0).map(p => ({ aroma: p.aroma.trim(), pct: numT(p.pct) }));
  if (!parts.length) return toast('Agrega al menos un aroma con su %', 'warning');
  const sum = parts.reduce((a, p) => a + p.pct, 0);
  if (Math.abs(sum - 100) > 0.01 && !confirm(`Los porcentajes suman ${sum}%. ¿Guardar igual?`)) return;
  try {
    const saved = d.id ? await API.updateBlend(d.id, { ...d, parts }) : await API.createBlend({ ...d, parts });
    if (d.file) await API.blendImage(saved.id, d.file);
    closeModal('taller-modal');
    toast('Mezcla guardada');
    Rc.blends = await API.blends(); Rc.calcBlend = saved.id; renderBlends();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteBlend(id) {
  if (!confirm('¿Eliminar esta mezcla? Las recetas que la usaban quedan con aroma a elección.')) return;
  try {
    await API.deleteBlend(id); closeModal('taller-modal'); toast('Mezcla eliminada');
    Rc.blends = await API.blends(); if (Rc.calcBlend === id) Rc.calcBlend = null; renderBlends();
  } catch (err) { toast(err.message, 'error'); }
}
