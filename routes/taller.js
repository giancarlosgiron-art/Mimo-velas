// Taller: inventario de insumos, recetas (costo por vela) y producción de lotes.
const express = require('express');
const router = express.Router();
const pool = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const C = require('../services/costing');
const { trackStock, statusFor } = require('../services/stockMode');
router.use(authMiddleware);

const KINDS = ['cera', 'esencia', 'frasco', 'mecha', 'colorante', 'decoracion', 'empaque', 'otro'];
const UNITS = ['g', 'ml', 'unid'];
const n = (v) => Number(v) || 0;
const num = (v, d = 0) => { const x = parseFloat(v); return Number.isFinite(x) ? x : d; };
const txt = (v) => (v == null ? null : String(v).trim() || null);
const uid = (req) => req.user?.id || null;

async function tx(fn) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const r = await fn(client); await client.query('COMMIT'); return r; }
  catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}
const fail = (res, err) => res.status(err.status || 500).json({ error: err.message, ...(err.extra || {}) });

// ── Ajustes del costeo ────────────────────────────────────────────
router.get('/settings', async (req, res) => {
  try { res.json(await C.getSettings()); } catch (e) { fail(res, e); }
});
router.put('/settings', async (req, res) => {
  try {
    const cur = await C.getSettings();
    const next = {};
    for (const k of Object.keys(C.DEFAULT_SETTINGS)) {
      if (!(k in req.body)) { next[k] = cur[k]; continue; }
      next[k] = typeof C.DEFAULT_SETTINGS[k] === 'boolean' ? !!req.body[k] : Math.max(0, num(req.body[k], cur[k]));
    }
    if (!next.density) next.density = 0.95;
    await pool.query(`INSERT INTO app_settings (key,value) VALUES ('taller',$1) ON CONFLICT (key) DO UPDATE SET value=$1`, [JSON.stringify(next)]);
    await C.syncProductCosts();
    res.json(next);
  } catch (e) { fail(res, e); }
});

// ── Insumos ───────────────────────────────────────────────────────
router.get('/supplies', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.*, (SELECT MAX(created_at) FROM supply_movements m WHERE m.supply_id=s.id AND m.type='compra') AS last_purchase
      FROM supplies s ORDER BY s.kind, lower(s.name)`);
    res.json(rows);
  } catch (e) { fail(res, e); }
});

function supplyFields(b, cur = {}) {
  const kind = KINDS.includes(b.kind) ? b.kind : (cur.kind || 'otro');
  const unit = UNITS.includes(b.unit) ? b.unit : (cur.unit || (kind === 'cera' ? 'g' : kind === 'esencia' ? 'ml' : 'unid'));
  return {
    name: txt(b.name) ?? cur.name, kind, unit,
    min_stock: Math.max(0, num(b.min_stock, cur.min_stock || 0)),
    supplier: 'supplier' in b ? txt(b.supplier) : cur.supplier ?? null,
    notes: 'notes' in b ? txt(b.notes) : cur.notes ?? null,
    max_pct: kind === 'esencia' && b.max_pct !== '' && b.max_pct != null ? num(b.max_pct, null) : (kind === 'esencia' ? cur.max_pct ?? null : null),
  };
}

router.post('/supplies', async (req, res) => {
  try {
    const f = supplyFields(req.body);
    if (!f.name) return res.status(400).json({ error: 'Ponle un nombre al insumo' });
    // Lo que tienes hoy y lo que pagaste por eso (opcional): así parte con su costo
    const qty = Math.max(0, num(req.body.stock));
    const paid = Math.max(0, num(req.body.paid));
    const unitCost = qty > 0 && paid > 0 ? paid / qty : Math.max(0, num(req.body.unit_cost));
    const row = await tx(async (db) => {
      const { rows } = await db.query(
        `INSERT INTO supplies (name,kind,unit,stock,min_stock,unit_cost,supplier,notes,max_pct) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [f.name, f.kind, f.unit, qty, f.min_stock, unitCost, f.supplier, f.notes, f.max_pct]);
      if (qty > 0) await db.query(`INSERT INTO supply_movements (supply_id,type,quantity,unit_cost,total,notes,user_id) VALUES ($1,'inicial',$2,$3,$4,'Stock inicial',$5)`,
        [rows[0].id, qty, unitCost, qty * unitCost, uid(req)]);
      return rows[0];
    });
    res.status(201).json(row);
  } catch (e) { fail(res, e); }
});

router.put('/supplies/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM supplies WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Insumo no encontrado' });
    const f = supplyFields(req.body, rows[0]);
    const unitCost = 'unit_cost' in req.body ? Math.max(0, num(req.body.unit_cost, rows[0].unit_cost)) : rows[0].unit_cost;
    const { rows: up } = await pool.query(
      `UPDATE supplies SET name=$1,kind=$2,unit=$3,min_stock=$4,supplier=$5,notes=$6,max_pct=$7,unit_cost=$8,updated_at=NOW() WHERE id=$9 RETURNING *`,
      [f.name, f.kind, f.unit, f.min_stock, f.supplier, f.notes, f.max_pct, unitCost, req.params.id]);
    await C.syncProductCosts();
    res.json(up[0]);
  } catch (e) { fail(res, e); }
});

router.delete('/supplies/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await tx(async (db) => {
      // Se saca de las recetas que lo usaban
      const { rows } = await db.query('SELECT product_id, items, fragrance_supply_id FROM product_recipes');
      for (const r of rows) {
        const items = (r.items || []).filter(i => Number(i.supply_id) !== id);
        const fid = Number(r.fragrance_supply_id) === id ? null : r.fragrance_supply_id;
        if (items.length !== (r.items || []).length || fid !== r.fragrance_supply_id)
          await db.query('UPDATE product_recipes SET items=$1, fragrance_supply_id=$2 WHERE product_id=$3', [JSON.stringify(items), fid, r.product_id]);
      }
      await db.query('DELETE FROM supplies WHERE id=$1', [id]);
      await C.syncProductCosts(db);
    });
    res.json({ message: 'Insumo eliminado' });
  } catch (e) { fail(res, e); }
});

router.get('/supplies/:id/movements', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT m.*, u.name AS user_name FROM supply_movements m LEFT JOIN users u ON u.id=m.user_id
       WHERE m.supply_id=$1 ORDER BY m.created_at DESC, m.id DESC LIMIT 60`, [req.params.id]);
    res.json(rows);
  } catch (e) { fail(res, e); }
});

// Compra (suma stock y promedia el costo), uso/merma (resta) o conteo (dejas el stock real)
router.post('/supplies/:id/movement', async (req, res) => {
  try {
    const type = req.body.type;
    if (!['compra', 'uso', 'conteo'].includes(type)) return res.status(400).json({ error: 'Movimiento no válido' });
    const qty = num(req.body.quantity);
    const notes = txt(req.body.notes);
    const out = await tx(async (db) => {
      const { rows } = await db.query('SELECT * FROM supplies WHERE id=$1 FOR UPDATE', [req.params.id]);
      const s = rows[0];
      if (!s) throw Object.assign(new Error('Insumo no encontrado'), { status: 404 });
      if (type === 'compra') {
        if (qty <= 0) throw Object.assign(new Error('Indica cuánto compraste'), { status: 400 });
        const total = Math.max(0, num(req.body.total));
        const stockBefore = Math.max(0, n(s.stock));
        // Costo promedio: lo que tenías a su costo + lo nuevo a lo que pagaste
        const newCost = total > 0 ? (stockBefore * n(s.unit_cost) + total) / (stockBefore + qty) : n(s.unit_cost);
        await db.query('UPDATE supplies SET stock=stock+$1, unit_cost=$2, updated_at=NOW() WHERE id=$3', [qty, newCost, s.id]);
        await db.query(`INSERT INTO supply_movements (supply_id,type,quantity,unit_cost,total,notes,user_id) VALUES ($1,'compra',$2,$3,$4,$5,$6)`,
          [s.id, qty, qty ? total / qty : 0, total, notes, uid(req)]);
        if (req.body.as_expense && total > 0) {
          await db.query('INSERT INTO expenses (date,amount,description,category) VALUES ($1,$2,$3,$4)',
            [new Date().toISOString().slice(0, 10), total, `Compra de insumo: ${s.name}${notes ? ' · ' + notes : ''}`, s.kind === 'empaque' ? 'Empaque' : 'Materiales']);
        }
      } else if (type === 'uso') {
        if (qty <= 0) throw Object.assign(new Error('Indica cuánto usaste'), { status: 400 });
        await db.query('UPDATE supplies SET stock=stock-$1, updated_at=NOW() WHERE id=$2', [qty, s.id]);
        await db.query(`INSERT INTO supply_movements (supply_id,type,quantity,unit_cost,total,notes,user_id) VALUES ($1,'uso',$2,$3,$4,$5,$6)`,
          [s.id, -qty, s.unit_cost, qty * n(s.unit_cost), notes, uid(req)]);
      } else {
        if (qty < 0) throw Object.assign(new Error('El conteo no puede ser negativo'), { status: 400 });
        await db.query('UPDATE supplies SET stock=$1, updated_at=NOW() WHERE id=$2', [qty, s.id]);
        await db.query(`INSERT INTO supply_movements (supply_id,type,quantity,unit_cost,total,notes,user_id) VALUES ($1,'conteo',$2,$3,0,$4,$5)`,
          [s.id, qty - n(s.stock), s.unit_cost, notes || `Conteo: quedan ${qty}`, uid(req)]);
      }
      if (type === 'compra') await C.syncProductCosts(db);
      const { rows: r2 } = await db.query('SELECT * FROM supplies WHERE id=$1', [s.id]);
      return r2[0];
    });
    res.json(out);
  } catch (e) { fail(res, e); }
});

// ── Recetas (costo por vela) ─────────────────────────────────────
async function recipesList(db = pool) {
  const [settings, map] = await Promise.all([C.getSettings(db), C.suppliesMap(db)]);
  const { rows } = await db.query(`
    SELECT p.id, p.name, p.sale_price, p.cost_price, p.stock, c.name AS category_name, COALESCE(c.active,1) AS category_active,
           r.items, r.fragrance_pct, r.fragrance_supply_id, r.extra_cost, r.labor_minutes, r.auto_cost, r.updated_at AS recipe_updated
    FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN product_recipes r ON r.product_id=p.id
    ORDER BY (r.product_id IS NULL), c.position NULLS LAST, lower(p.name)`);
  return {
    settings,
    products: rows.map(p => {
      const has = p.items !== null && p.items !== undefined;
      const recipe = has ? { items: p.items || [], fragrance_pct: p.fragrance_pct, fragrance_supply_id: p.fragrance_supply_id,
        extra_cost: p.extra_cost, labor_minutes: p.labor_minutes, auto_cost: p.auto_cost } : null;
      return {
        id: p.id, name: p.name, category_name: p.category_name, sale_price: p.sale_price, cost_price: p.cost_price, stock: p.stock,
        recipe, cost: recipe ? C.computeRecipe(recipe, map, settings, p.sale_price) : null,
      };
    }),
  };
}

router.get('/recipes', async (req, res) => {
  try { res.json(await recipesList()); } catch (e) { fail(res, e); }
});

router.put('/recipes/:productId', async (req, res) => {
  try {
    const pid = Number(req.params.productId);
    const { rows: pr } = await pool.query('SELECT id FROM products WHERE id=$1', [pid]);
    if (!pr[0]) return res.status(404).json({ error: 'Producto no encontrado' });
    const items = (Array.isArray(req.body.items) ? req.body.items : [])
      .map(i => ({ supply_id: Number(i.supply_id), qty: Math.max(0, num(i.qty)), ...(i.scent === false ? { scent: false } : {}) }))
      .filter(i => i.supply_id && i.qty > 0);
    const fid = Number(req.body.fragrance_supply_id) || null;
    await pool.query(`
      INSERT INTO product_recipes (product_id,items,fragrance_pct,fragrance_supply_id,extra_cost,labor_minutes,auto_cost,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
      ON CONFLICT (product_id) DO UPDATE SET items=$2,fragrance_pct=$3,fragrance_supply_id=$4,extra_cost=$5,labor_minutes=$6,auto_cost=$7,updated_at=NOW()`,
      [pid, JSON.stringify(items), Math.min(100, Math.max(0, num(req.body.fragrance_pct))), fid,
        Math.max(0, num(req.body.extra_cost)), Math.max(0, num(req.body.labor_minutes)), req.body.auto_cost === false ? 0 : 1]);
    await C.syncProductCosts();
    const list = await recipesList();
    res.json(list.products.find(p => p.id === pid));
  } catch (e) { fail(res, e); }
});

router.delete('/recipes/:productId', async (req, res) => {
  try {
    await pool.query('DELETE FROM product_recipes WHERE product_id=$1', [req.params.productId]);
    res.json({ message: 'Receta eliminada (el costo del producto queda como estaba)' });
  } catch (e) { fail(res, e); }
});

// ── Producción: fabricar un lote descuenta insumos y suma velas al stock ──
async function planProduction(db, b) {
  const pid = Number(b.product_id);
  const qty = Math.max(0, Math.floor(num(b.quantity)));
  if (!pid || qty <= 0) throw Object.assign(new Error('Elige la vela y cuántas hiciste'), { status: 400 });
  const { rows } = await db.query(`SELECT p.id,p.name,p.sale_price,p.stock,p.min_stock,r.* FROM products p
    LEFT JOIN product_recipes r ON r.product_id=p.id WHERE p.id=$1`, [pid]);
  const p = rows[0];
  if (!p) throw Object.assign(new Error('Producto no encontrado'), { status: 404 });
  if (p.items == null) throw Object.assign(new Error(`"${p.name}" no tiene receta todavía. Créala en Taller → Costos por vela`), { status: 400 });
  const [settings, map] = await Promise.all([C.getSettings(db), C.suppliesMap(db)]);
  const fid = Number(b.fragrance_supply_id) || p.fragrance_supply_id || null;
  const cost = C.computeRecipe(p, map, settings, p.sale_price, fid);
  const needs = cost.lines.map(l => ({ supply_id: l.supply_id, name: l.name, unit: l.unit, qty: l.qty * qty }));
  if (cost.fragrance) {
    if (!cost.fragrance.supply_id) throw Object.assign(new Error('Elige qué esencia usaste'), { status: 400 });
    const s = map[cost.fragrance.supply_id];
    needs.push({ supply_id: s.id, name: s.name, unit: s.unit, qty: C.gramsToUnit(s, cost.fragrance.grams * qty, settings.density) });
  }
  // Si una esencia o insumo se repite, se junta
  const merged = {};
  for (const nd of needs) merged[nd.supply_id] = merged[nd.supply_id] ? { ...nd, qty: merged[nd.supply_id].qty + nd.qty } : nd;
  const list = Object.values(merged).map(nd => ({ ...nd, stock: n(map[nd.supply_id].stock), missing: Math.max(0, nd.qty - n(map[nd.supply_id].stock)) }));
  return { product: p, qty, cost, needs: list, shortages: list.filter(x => x.missing > 0), cost_total: cost.direct * qty, fid };
}

router.post('/production', async (req, res) => {
  try {
    if (req.body.dry_run) {
      const plan = await planProduction(pool, req.body);
      return res.json({ needs: plan.needs, shortages: plan.shortages, cost_total: plan.cost_total, unit_cost: plan.cost.direct, fragrance: plan.cost.fragrance });
    }
    const out = await tx(async (db) => {
      const plan = await planProduction(db, req.body);
      if (plan.shortages.length && !req.body.force)
        throw Object.assign(new Error('No alcanzan algunos insumos'), { status: 409, extra: { shortages: plan.shortages } });
      const addStock = req.body.add_to_stock !== false;
      const fname = plan.cost.fragrance ? plan.cost.fragrance.name : null;
      const { rows } = await db.query(
        `INSERT INTO productions (product_id,product_name,quantity,fragrance_supply_id,fragrance_name,cost_total,added_to_stock,notes,user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [plan.product.id, plan.product.name, plan.qty, plan.cost.fragrance?.supply_id || null, fname, plan.cost_total, addStock ? 1 : 0, txt(req.body.notes), uid(req)]);
      const prod = rows[0];
      for (const nd of plan.needs) {
        await db.query('UPDATE supplies SET stock=stock-$1, updated_at=NOW() WHERE id=$2', [nd.qty, nd.supply_id]);
        await db.query(`INSERT INTO supply_movements (supply_id,type,quantity,notes,production_id,user_id) VALUES ($1,'produccion',$2,$3,$4,$5)`,
          [nd.supply_id, -nd.qty, `${plan.qty} × ${plan.product.name}`, prod.id, uid(req)]);
      }
      if (addStock) await moveProductStock(db, plan.product.id, plan.qty, `Producción de ${plan.qty}${fname ? ' · ' + fname : ''}`, prod.id);
      return prod;
    });
    res.status(201).json(out);
  } catch (e) { fail(res, e); }
});

async function moveProductStock(db, productId, delta, note, refId) {
  const { rows } = await db.query('SELECT stock, min_stock FROM products WHERE id=$1', [productId]);
  if (!rows[0]) return;
  const ns = Math.max(0, n(rows[0].stock) + delta);
  const st = statusFor(await trackStock(db), ns, n(rows[0].min_stock));
  await db.query('UPDATE products SET stock=$1, status=$2 WHERE id=$3', [ns, st, productId]);
  await db.query('INSERT INTO stock_movements (product_id,type,quantity,reference_id,notes) VALUES ($1,$2,$3,$4,$5)',
    [productId, delta > 0 ? 'production' : 'adjustment', delta, refId, note]);
}

router.get('/production', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT pr.*, u.name AS user_name FROM productions pr LEFT JOIN users u ON u.id=pr.user_id
      ORDER BY pr.created_at DESC LIMIT 50`);
    res.json(rows);
  } catch (e) { fail(res, e); }
});

// Deshacer una producción (si te equivocaste): devuelve los insumos y saca las velas del stock
router.delete('/production/:id', async (req, res) => {
  try {
    await tx(async (db) => {
      const { rows } = await db.query('SELECT * FROM productions WHERE id=$1', [req.params.id]);
      const pr = rows[0];
      if (!pr) throw Object.assign(new Error('Producción no encontrada'), { status: 404 });
      const { rows: mv } = await db.query(`SELECT * FROM supply_movements WHERE production_id=$1`, [pr.id]);
      for (const m of mv) await db.query('UPDATE supplies SET stock=stock-$1 WHERE id=$2', [m.quantity, m.supply_id]);
      await db.query('DELETE FROM supply_movements WHERE production_id=$1', [pr.id]);
      if (pr.added_to_stock && pr.product_id) await moveProductStock(db, pr.product_id, -pr.quantity, `Se deshizo la producción de ${pr.quantity}`, pr.id);
      await db.query('DELETE FROM productions WHERE id=$1', [pr.id]);
    });
    res.json({ message: 'Producción deshecha' });
  } catch (e) { fail(res, e); }
});

// Resumen para Mimito y el panel: valor del inventario de insumos, lo que falta y para cuántas velas alcanzan las esencias
router.get('/summary', async (req, res) => {
  try {
    const [settings, { rows: supplies }] = await Promise.all([C.getSettings(), pool.query('SELECT * FROM supplies ORDER BY kind, lower(name)')]);
    const refGrams = n(settings.ref_wax_g) * n(settings.ref_pct) / 100;
    const value = supplies.reduce((a, s) => a + Math.max(0, n(s.stock)) * n(s.unit_cost), 0);
    const low = supplies.filter(s => n(s.stock) <= 0 || (n(s.min_stock) > 0 && n(s.stock) <= n(s.min_stock)));
    const essences = supplies.filter(s => s.kind === 'esencia').map(s => {
      const per = C.gramsToUnit(s, refGrams, settings.density);
      return { id: s.id, name: s.name, stock: n(s.stock), unit: s.unit, candles: per > 0 ? Math.floor(Math.max(0, n(s.stock)) / per) : null };
    });
    const { rows: prods } = await pool.query(`SELECT * FROM productions WHERE created_at >= date_trunc('month', NOW()) ORDER BY created_at DESC`);
    res.json({ settings, value, count: supplies.length, low, essences, month_production: prods });
  } catch (e) { fail(res, e); }
});

module.exports = router;
