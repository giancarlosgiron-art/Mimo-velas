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
const ROLES = ['cera', 'mecha', 'envase', 'pegatina', 'decoracion', 'colorante', 'otro'];

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
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
/** Esencia del taller que corresponde a un aroma de la mezcla ("Vainilla" → "Esencia Vainilla 50 ml") */
function matchEssence(aroma, essences) {
  const a = norm(aroma);
  return essences.find(s => norm(s.name).replace(/^esencia\s+/, '') === a) || essences.find(s => norm(s.name).includes(a)) || null;
}

/** Costo y cantidades de una ficha (por tanda y por vela/pieza) */
function computeSheet(sh, map, settings, blend) {
  const pieces = Math.max(1, n(sh.pieces) || 1);
  const essences = Object.values(map).filter(s => s.kind === 'esencia');
  const avgG = (() => { const e = essences.filter(s => n(s.unit_cost) > 0); return e.length ? e.reduce((a, s) => a + C.costPerGram(s, settings.density), 0) / e.length : 0; })();
  let wax = 0, decoWeight = 0, cost = 0, missingCost = false;
  for (const l of sh.lines || []) {
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
    total_weight: wax + essG + decoWeight, cost, cost_per_piece: cost / pieces, ess_cost: essCost, missing_cost: missingCost };
}

async function sheetsData() {
  const [settings, map, { rows: sheets }, { rows: blends }] = await Promise.all([
    C.getSettings(), C.suppliesMap(),
    pool.query(`SELECT r.*, p.name AS product_name, p.sale_price FROM recipe_sheets r LEFT JOIN products p ON p.id=r.product_id ORDER BY r.type, lower(r.name)`),
    pool.query('SELECT id,name,parts FROM fragrance_blends'),
  ]);
  const byId = Object.fromEntries(blends.map(b => [b.id, b]));
  return sheets.map(sh => ({ ...sh, blend_name: byId[sh.blend_id]?.name || null, calc: computeSheet(sh, map, settings, byId[sh.blend_id]) }));
}

// La ficha también manda el costo del producto (Taller → Costos por vela), para no cargar la receta dos veces
async function syncSheetToProduct(sh) {
  if (!sh.sync_cost || !sh.product_id) return;
  const pieces = Math.max(1, n(sh.pieces) || 1);
  const map = await C.suppliesMap();
  const items = (sh.lines || []).filter(l => l.supply_id && map[l.supply_id] && n(l.qty) > 0).map(l => {
    const s = map[l.supply_id];
    const amount = l.role === 'decoracion' && s.unit === 'g' ? n(l.qty) * n(l.weight_g) : n(l.qty);
    return { supply_id: s.id, qty: amount / pieces, ...(l.role === 'cera' ? {} : s.kind === 'cera' ? { scent: false } : {}) };
  });
  // Esencia: promedio de tus esencias (el mismo costo que muestra la ficha cuando el aroma es a elección)
  await pool.query(`
    INSERT INTO product_recipes (product_id,items,fragrance_pct,fragrance_supply_id,extra_cost,auto_cost,updated_at) VALUES ($1,$2,$3,NULL,0,1,NOW())
    ON CONFLICT (product_id) DO UPDATE SET items=$2, fragrance_pct=$3, fragrance_supply_id=NULL, extra_cost=0, auto_cost=1, updated_at=NOW()`,
    [sh.product_id, JSON.stringify(items), n(sh.fragrance_pct)]);
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
    supply_id: Number(l.supply_id) || null,
    qty: Math.max(0, num(l.qty)),
    ...(l.role === 'decoracion' ? { weight_g: Math.max(0, num(l.weight_g)) } : {}),
  })).filter(l => l.name || l.supply_id);
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
  if (rows[0].sync_cost) { await syncSheetToProduct(rows[0]); await C.syncProductCosts(); }
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
