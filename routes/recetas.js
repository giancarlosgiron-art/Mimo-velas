// Recetas: fichas de cada vela (frasco) o molde, y creación de aromas (mezclas con sus porcentajes).
const express = require('express');
const router = express.Router();
const pool = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const C = require('../services/costing');

const n = (v) => Number(v) || 0;
const num = (v, d = 0) => { const x = parseFloat(v); return Number.isFinite(x) ? x : d; };
const txt = (v) => (v == null ? null : String(v).trim() || null);
const fail = (res, e) => res.status(e.status || 500).json({ error: e.message });
const ROLES = ['cera', 'mecha', 'envase', 'pegatina', 'decoracion', 'pieza', 'colorante', 'otro'];

// Foto de la mezcla: pública (se usa en <img>), no tiene nada sensible
router.get('/blends/:id/image', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT image_mime, image_data FROM fragrance_blends WHERE id=$1', [req.params.id]);
    if (!rows[0]?.image_data) return res.status(404).end();
    res.set('Content-Type', rows[0].image_mime || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(rows[0].image_data);
  } catch (e) { fail(res, e); }
});

router.use(authMiddleware);

// ── Mezclas de aromas ────────────────────────────────────────────
const blendCols = 'id,name,description,parts,favorite,position,image_v,(image_data IS NOT NULL) AS has_image,updated_at';
router.get('/blends', async (req, res) => {
  try { res.json((await pool.query(`SELECT ${blendCols} FROM fragrance_blends ORDER BY favorite DESC, position, id`)).rows); }
  catch (e) { fail(res, e); }
});

function blendFields(b) {
  const parts = (Array.isArray(b.parts) ? b.parts : [])
    .map(p => ({ aroma: String(p.aroma || '').trim().slice(0, 60), pct: Math.max(0, Math.min(100, num(p.pct))) }))
    .filter(p => p.aroma && p.pct > 0);
  return { name: txt(b.name), description: txt(b.description), parts, favorite: b.favorite ? 1 : 0 };
}

router.post('/blends', async (req, res) => {
  try {
    const f = blendFields(req.body);
    if (!f.name) return res.status(400).json({ error: 'Ponle nombre a la mezcla' });
    const { rows } = await pool.query(
      `INSERT INTO fragrance_blends (name,description,parts,favorite,position) VALUES ($1,$2,$3,$4,(SELECT COALESCE(MAX(position),0)+1 FROM fragrance_blends)) RETURNING ${blendCols}`,
      [f.name, f.description, JSON.stringify(f.parts), f.favorite]);
    res.status(201).json(rows[0]);
  } catch (e) { fail(res, e); }
});

router.put('/blends/:id', async (req, res) => {
  try {
    const f = blendFields(req.body);
    if (!f.name) return res.status(400).json({ error: 'Ponle nombre a la mezcla' });
    const { rows } = await pool.query(
      `UPDATE fragrance_blends SET name=$1,description=$2,parts=$3,favorite=$4,updated_at=NOW() WHERE id=$5 RETURNING ${blendCols}`,
      [f.name, f.description, JSON.stringify(f.parts), f.favorite, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Mezcla no encontrada' });
    await syncSheetCosts();
    res.json(rows[0]);
  } catch (e) { fail(res, e); }
});

router.post('/blends/:id/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file || !/^image\//.test(req.file.mimetype)) return res.status(400).json({ error: 'Sube una imagen (JPG, PNG o WebP)' });
    await pool.query('UPDATE fragrance_blends SET image_mime=$1, image_data=$2, image_v=image_v+1, updated_at=NOW() WHERE id=$3',
      [req.file.mimetype, req.file.buffer, req.params.id]);
    res.json({ message: 'Foto guardada' });
  } catch (e) { fail(res, e); }
});

router.delete('/blends/:id', async (req, res) => {
  try {
    await pool.query('UPDATE recipe_sheets SET blend_id=NULL WHERE blend_id=$1', [req.params.id]);
    await pool.query('DELETE FROM fragrance_blends WHERE id=$1', [req.params.id]);
    res.json({ message: 'Mezcla eliminada' });
  } catch (e) { fail(res, e); }
});

// ── Fichas (recetas de velas y moldes) ───────────────────────────
const matchEssence = C.matchEssence;

/** Costo y cantidades de una ficha (por tanda y por vela/pieza) */
function computeSheet(sh, map, settings, blend, molds = {}) {
  const pieces = Math.max(1, n(sh.pieces) || 1);
  const essences = Object.values(map).filter(s => s.kind === 'esencia');
  const avgG = (() => { const e = essences.filter(s => n(s.unit_cost) > 0); return e.length ? e.reduce((a, s) => a + C.costPerGram(s, settings.density), 0) / e.length : 0; })();
  let wax = 0, decoWeight = 0, cost = 0, missingCost = false, moldWeight = 0, moldCount = 0;
  for (const l of sh.lines || []) {
    // Pieza de molde: usa la receta del molde (su cera, esencia y demás) por cada pieza
    if (l.role === 'pieza') {
      const m = molds[l.sheet_id];
      const q = n(l.qty);
      if (!m) { if (q > 0) missingCost = true; continue; }
      moldCount += q;
      moldWeight += q * m.calc.total_weight / m.calc.pieces;
      cost += q * m.calc.cost_per_piece;
      continue;
    }
    const s = l.supply_id ? map[l.supply_id] : null;
    const qty = n(l.qty);
    if (l.role === 'cera') wax += qty;
    if (l.role === 'decoracion') decoWeight += qty * n(l.weight_g);
    if (!s) { if (qty > 0 && l.role !== 'otro') missingCost = true; continue; }
    const amount = l.role === 'decoracion' && s.unit === 'g' ? qty * n(l.weight_g) : qty;
    cost += amount * n(s.unit_cost);
  }
  const essG = wax * n(sh.fragrance_pct) / 100;
  const parts = (blend?.parts || []).map(p => {
    const s = matchEssence(p.aroma, essences);
    const g = essG * n(p.pct) / 100;
    return { aroma: p.aroma, pct: p.pct, grams: g, ml: g / (settings.density || 0.95), supply_id: s?.id || null,
      stock: s ? n(s.stock) : null, unit: s?.unit || null, cost: g * (s && n(s.unit_cost) ? C.costPerGram(s, settings.density) : avgG) };
  });
  const essCost = parts.length ? parts.reduce((a, p) => a + p.cost, 0) : essG * avgG;
  cost += essCost;
  return { pieces, wax, ess_g: essG, ess_ml: essG / (settings.density || 0.95), parts, deco_weight: decoWeight,
    mold_weight: moldWeight, mold_count: moldCount,
    total_weight: wax + essG + decoWeight + moldWeight, cost, cost_per_piece: cost / pieces, ess_cost: essCost, missing_cost: missingCost };
}

async function sheetsData() {
  const [settings, map, { rows: sheets }, { rows: blends }] = await Promise.all([
    C.getSettings(), C.suppliesMap(),
    pool.query(`SELECT r.*, p.name AS product_name, p.sale_price FROM recipe_sheets r LEFT JOIN products p ON p.id=r.product_id ORDER BY r.type, lower(r.name)`),
    pool.query('SELECT id,name,parts FROM fragrance_blends'),
  ]);
  const byId = Object.fromEntries(blends.map(b => [b.id, b]));
  // Primero los moldes (las velas pueden llevar piezas de molde)
  const molds = {};
  for (const sh of sheets.filter(x => x.type === 'molde')) molds[sh.id] = { ...sh, calc: computeSheet(sh, map, settings, byId[sh.blend_id]) };
  return sheets.map(sh => ({ ...sh, blend_name: byId[sh.blend_id]?.name || null,
    calc: sh.type === 'molde' ? molds[sh.id].calc : computeSheet(sh, map, settings, byId[sh.blend_id], molds) }));
}

// La ficha también manda el costo del producto (Taller → Costos por vela), para no cargar la receta dos veces.
// Las piezas de molde se convierten en sus insumos (cera, colorante, esencias de su mezcla…), así al producir se descuentan.
async function syncSheetToProduct(sh) {
  if (!sh.sync_cost || !sh.product_id) return;
  const pieces = Math.max(1, n(sh.pieces) || 1);
  const [map, settings] = await Promise.all([C.suppliesMap(), C.getSettings()]);
  const essences = Object.values(map).filter(s => s.kind === 'esencia');
  const avgG = (() => { const e = essences.filter(s => n(s.unit_cost) > 0); return e.length ? e.reduce((a, s) => a + C.costPerGram(s, settings.density), 0) / e.length : 0; })();
  const items = [];
  let extra = 0; // lo que no se puede descontar de un insumo (esencia "a elección" de una pieza de molde)
  const addLines = (lines, factor, asMold) => {
    for (const l of lines || []) {
      if (l.role === 'pieza') continue;
      const s = l.supply_id ? map[l.supply_id] : null;
      if (!s || n(l.qty) <= 0) continue;
      const amount = l.role === 'decoracion' && s.unit === 'g' ? n(l.qty) * n(l.weight_g) : n(l.qty);
      // La cera de la vela lleva la esencia de la vela; la de las piezas de molde no (ya tienen la suya)
      const scent = !asMold && l.role === 'cera' ? {} : s.kind === 'cera' ? { scent: false } : {};
      items.push({ supply_id: s.id, qty: amount * factor, ...scent });
    }
  };
  addLines(sh.lines, 1 / pieces, false);
  const moldLines = (sh.lines || []).filter(l => l.role === 'pieza' && l.sheet_id && n(l.qty) > 0);
  if (moldLines.length) {
    const { rows: molds } = await pool.query("SELECT * FROM recipe_sheets WHERE type='molde' AND id = ANY($1)", [moldLines.map(l => Number(l.sheet_id))]);
    const { rows: blends } = await pool.query('SELECT id, parts FROM fragrance_blends');
    for (const l of moldLines) {
      const m = molds.find(x => x.id === Number(l.sheet_id));
      if (!m) continue;
      const per = n(l.qty) / Math.max(1, n(m.pieces) || 1) / pieces; // parte de la tanda del molde que va en una vela
      addLines(m.lines, per, true);
      const moldWax = (m.lines || []).filter(x => x.role === 'cera').reduce((a, x) => a + n(x.qty), 0);
      const essG = moldWax * n(m.fragrance_pct) / 100 * per;
      if (essG <= 0) continue;
      const blend = blends.find(b => b.id === m.blend_id);
      if (blend?.parts?.length) {
        for (const pt of blend.parts) {
          const s = C.matchEssence(pt.aroma, essences);
          const g = essG * n(pt.pct) / 100;
          if (s) items.push({ supply_id: s.id, qty: C.gramsToUnit(s, g, settings.density) });
          else extra += g * avgG;
        }
      } else extra += essG * avgG;
    }
  }
  // Esencia de la vela: promedio de tus esencias (el mismo costo que muestra la ficha cuando el aroma es a elección)
  await pool.query(`
    INSERT INTO product_recipes (product_id,items,fragrance_pct,fragrance_supply_id,extra_cost,auto_cost,updated_at) VALUES ($1,$2,$3,NULL,$4,1,NOW())
    ON CONFLICT (product_id) DO UPDATE SET items=$2, fragrance_pct=$3, fragrance_supply_id=NULL, extra_cost=$4, auto_cost=1, updated_at=NOW()`,
    [sh.product_id, JSON.stringify(items), n(sh.fragrance_pct), extra]);
}
async function syncSheetCosts() {
  const { rows } = await pool.query('SELECT * FROM recipe_sheets WHERE sync_cost=1 AND product_id IS NOT NULL');
  for (const sh of rows) await syncSheetToProduct(sh);
  if (rows.length) await C.syncProductCosts();
}

router.get('/sheets', async (req, res) => {
  try { res.json(await sheetsData()); } catch (e) { fail(res, e); }
});

function sheetFields(b) {
  const lines = (Array.isArray(b.lines) ? b.lines : []).map(l => ({
    role: ROLES.includes(l.role) ? l.role : 'otro',
    name: String(l.name || '').trim().slice(0, 80),
    supply_id: l.role === 'pieza' ? null : Number(l.supply_id) || null,
    ...(l.role === 'pieza' ? { sheet_id: Number(l.sheet_id) || null } : {}),
    qty: Math.max(0, num(l.qty)),
    ...(l.role === 'decoracion' ? { weight_g: Math.max(0, num(l.weight_g)) } : {}),
  })).filter(l => l.name || l.supply_id || l.sheet_id);
  return {
    name: txt(b.name), type: b.type === 'molde' ? 'molde' : 'vela',
    product_id: Number(b.product_id) || null, blend_id: Number(b.blend_id) || null,
    fragrance_pct: Math.max(0, Math.min(100, num(b.fragrance_pct, 7))), pieces: Math.max(1, Math.floor(num(b.pieces, 1))),
    mold_name: txt(b.mold_name), lines, notes: txt(b.notes), sync_cost: b.sync_cost && b.product_id ? 1 : 0,
  };
}

async function saveSheet(id, b) {
  const f = sheetFields(b);
  if (!f.name) throw Object.assign(new Error('Ponle nombre a la receta'), { status: 400 });
  const vals = [f.name, f.type, f.product_id, f.blend_id, f.fragrance_pct, f.pieces, f.mold_name, JSON.stringify(f.lines), f.notes, f.sync_cost];
  const { rows } = id
    ? await pool.query(`UPDATE recipe_sheets SET name=$1,type=$2,product_id=$3,blend_id=$4,fragrance_pct=$5,pieces=$6,mold_name=$7,lines=$8,notes=$9,sync_cost=$10,updated_at=NOW() WHERE id=$11 RETURNING *`, [...vals, id])
    : await pool.query(`INSERT INTO recipe_sheets (name,type,product_id,blend_id,fragrance_pct,pieces,mold_name,lines,notes,sync_cost) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, vals);
  if (!rows[0]) throw Object.assign(new Error('Receta no encontrada'), { status: 404 });
  if (rows[0].type === 'molde') await syncSheetCosts(); // las velas que usan este molde cambian de costo
  else if (rows[0].sync_cost) { await syncSheetToProduct(rows[0]); await C.syncProductCosts(); }
  return rows[0];
}

router.post('/sheets', async (req, res) => {
  try { res.status(201).json(await saveSheet(null, req.body)); } catch (e) { fail(res, e); }
});
router.put('/sheets/:id', async (req, res) => {
  try { res.json(await saveSheet(req.params.id, req.body)); } catch (e) { fail(res, e); }
});
router.delete('/sheets/:id', async (req, res) => {
  try { await pool.query('DELETE FROM recipe_sheets WHERE id=$1', [req.params.id]); res.json({ message: 'Receta eliminada' }); }
  catch (e) { fail(res, e); }
});

module.exports = router;
module.exports.syncSheetCosts = syncSheetCosts;
