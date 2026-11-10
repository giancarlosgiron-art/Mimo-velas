// Costeo del taller: con lo que cuesta cada insumo (Taller → Insumos) y la receta de cada vela
// se calcula el costo por vela. Si la receta tiene "costo automático", el costo del producto se mantiene al día solo.
const pool = require('../db/database');

const DEFAULT_SETTINGS = {
  hourly: 3000,            // valor de la hora de trabajo (CLP)
  commission_pct: 5,       // comisión de cobro / marketplace (% sobre el precio con IVA)
  target_margin_pct: 50,   // margen objetivo
  iva_pct: 19,
  density: 0.95,           // densidad de la fragancia (g/ml)
  include_labor: false,    // ¿el costo del producto incluye tu tiempo?
  ref_wax_g: 150,          // vela de referencia para "¿para cuántas velas me alcanza?"
  ref_pct: 7,
  jar_ml: 220, fill_pct: 85, wax_density: 0.9, // calculadora de frasco
};

async function getSettings(db = pool) {
  const { rows } = await db.query("SELECT value FROM app_settings WHERE key='taller'");
  return { ...DEFAULT_SETTINGS, ...(rows[0]?.value || {}) };
}

const n = (v) => Number(v) || 0;

/** Costo de un gramo de esencia de un insumo (las esencias pueden estar en ml o en g) */
function costPerGram(s, density) {
  return s.unit === 'ml' ? n(s.unit_cost) / (density || 0.95) : n(s.unit_cost);
}

/** Pasa gramos de esencia a la unidad en que se guarda ese insumo */
function gramsToUnit(s, grams, density) {
  return s.unit === 'ml' ? grams / (density || 0.95) : grams;
}

/**
 * Desglose del costo de una vela según su receta.
 * fragranceId: esencia concreta (al producir); si no hay, la de la receta; si tampoco, el promedio de tus esencias.
 */
function computeRecipe(recipe, suppliesById, settings, salePrice, fragranceId, molds = {}) {
  const lines = [];
  const pieces = [];
  let materials = 0, waxScented = 0;
  for (const it of recipe?.items || []) {
    // Pieza de molde (ej. una bola de helado): suma los insumos de su receta de molde, sin la esencia de la vela
    if (it.sheet_id) {
      const m = molds[it.sheet_id];
      const q = n(it.qty);
      if (!m || q <= 0) continue;
      let pc = m.extra * q;
      for (const mi of m.items) {
        const s = suppliesById[mi.supply_id];
        if (!s) continue;
        const qty = mi.qty * q, cost = qty * n(s.unit_cost);
        pc += cost;
        materials += cost;
        lines.push({ supply_id: s.id, name: `${s.name} (${m.name})`, kind: s.kind, unit: s.unit, qty, unit_cost: n(s.unit_cost), cost, scent: false, mold: m.name });
      }
      materials += m.extra * q;
      pieces.push({ sheet_id: m.id, name: m.name, qty: q, cost: pc });
      continue;
    }
    const s = suppliesById[it.supply_id];
    const qty = n(it.qty);
    if (!s || qty <= 0) continue;
    const cost = qty * n(s.unit_cost);
    materials += cost;
    if (s.kind === 'cera' && it.scent !== false) waxScented += qty;
    lines.push({ supply_id: s.id, name: s.name, kind: s.kind, unit: s.unit, qty, unit_cost: n(s.unit_cost), cost, scent: it.scent !== false });
  }
  const pct = n(recipe?.fragrance_pct);
  const fragGrams = waxScented * pct / 100;
  let fragrance = null;
  if (fragGrams > 0) {
    const fid = fragranceId || recipe?.fragrance_supply_id;
    const chosen = fid ? suppliesById[fid] : null;
    const essences = Object.values(suppliesById).filter(s => s.kind === 'esencia' && n(s.unit_cost) > 0);
    const perGram = chosen ? costPerGram(chosen, settings.density)
      : essences.length ? essences.reduce((a, s) => a + costPerGram(s, settings.density), 0) / essences.length : 0;
    fragrance = {
      grams: fragGrams, ml: fragGrams / (settings.density || 0.95), pct,
      supply_id: chosen?.id || null, name: chosen ? chosen.name : 'Esencia (promedio de tus esencias)',
      cost: fragGrams * perGram, missingPrice: perGram === 0,
    };
    materials += fragrance.cost;
  }
  const extra = n(recipe?.extra_cost);
  const direct = materials + extra;
  const labor = n(recipe?.labor_minutes) / 60 * n(settings.hourly);
  const total = direct + labor;
  const com = n(settings.commission_pct) / 100;
  const target = n(settings.target_margin_pct) / 100;
  const price = n(salePrice);
  const commission = price * com;
  const profitDirect = price - commission - direct;
  const profitTotal = price - commission - total;
  return {
    lines, pieces, fragrance, extra, materials, direct, labor, total, wax_grams: waxScented,
    product_cost: settings.include_labor ? total : direct,
    price, commission,
    profit_direct: profitDirect, margin_direct: price ? profitDirect / price : 0,
    profit_total: profitTotal, margin_total: price ? profitTotal / price : 0,
    min_price: total / (1 - com || 1),
    target_price: 1 - com - target > 0 ? total / (1 - com - target) : null,
  };
}

const normName = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
/** Esencia de tus insumos que corresponde a un aroma de una mezcla ("Vainilla" → "Esencia Vainilla 50 ml") */
function matchEssence(aroma, essences) {
  const a = normName(aroma);
  return essences.find(s => normName(s.name).replace(/^esencia\s+/, '') === a) || essences.find(s => normName(s.name).includes(a)) || null;
}

async function suppliesMap(db = pool) {
  const { rows } = await db.query('SELECT * FROM supplies');
  return Object.fromEntries(rows.map(s => [s.id, s]));
}

/** Recalcula el costo de todos los productos con receta en "costo automático" */
async function syncProductCosts(db = pool) {
  const [settings, map] = await Promise.all([getSettings(db), suppliesMap(db)]);
  const { rows } = await db.query(
    'SELECT r.*, p.sale_price FROM product_recipes r JOIN products p ON p.id=r.product_id WHERE r.auto_cost=1');
  const molds = await require('./molds').moldPieces(map, settings, db);
  for (const r of rows) {
    const c = computeRecipe(r, map, settings, r.sale_price, null, molds);
    await db.query('UPDATE products SET cost_price=$1 WHERE id=$2', [Math.round(c.product_cost), r.product_id]);
  }
}

module.exports = {
  matchEssence, DEFAULT_SETTINGS, getSettings, computeRecipe, suppliesMap, syncProductCosts, gramsToUnit, costPerGram };
