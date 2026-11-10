// Piezas de molde dentro de una receta de vela (Recetas → Velas → "🧩 Pieza de molde").
// Convierte cada pieza en los insumos que usó su receta de molde (cera, colorante, esencias de su mezcla…),
// por vela. Lo usan la sincronización del costo (routes/recetas.js) y la producción (routes/taller.js).
const pool = require('../db/database');
const C = require('./costing');

const n = (v) => Number(v) || 0;

/**
 * @returns {{ items: {supply_id:number, qty:number, scent?:false, mold:string}[], extra: number }}
 *   items: insumos por UNA vela; extra: costo que no se puede descontar (esencia "a elección" o sin insumo)
 */
async function moldItemsForSheet(sh, map, settings, db = pool) {
  const pieces = Math.max(1, n(sh.pieces) || 1);
  const moldLines = (sh.lines || []).filter(l => l.role === 'pieza' && l.sheet_id && n(l.qty) > 0);
  const items = [];
  let extra = 0;
  if (!moldLines.length) return { items, extra };
  const essences = Object.values(map).filter(s => s.kind === 'esencia');
  const avgG = (() => { const e = essences.filter(s => n(s.unit_cost) > 0); return e.length ? e.reduce((a, s) => a + C.costPerGram(s, settings.density), 0) / e.length : 0; })();
  const { rows: molds } = await db.query("SELECT * FROM recipe_sheets WHERE type='molde' AND id = ANY($1)", [moldLines.map(l => Number(l.sheet_id))]);
  const { rows: blends } = await db.query('SELECT id, parts FROM fragrance_blends');
  for (const l of moldLines) {
    const m = molds.find(x => x.id === Number(l.sheet_id));
    if (!m) continue;
    const per = n(l.qty) / Math.max(1, n(m.pieces) || 1) / pieces; // parte de la tanda del molde que va en una vela
    for (const ml of m.lines || []) {
      if (ml.role === 'pieza') continue;
      const s = ml.supply_id ? map[ml.supply_id] : null;
      if (!s || n(ml.qty) <= 0) continue;
      const amount = ml.role === 'decoracion' && s.unit === 'g' ? n(ml.qty) * n(ml.weight_g) : n(ml.qty);
      // La cera de la pieza no lleva la esencia de la vela (ya tiene la suya)
      items.push({ supply_id: s.id, qty: amount * per, mold: m.name, ...(s.kind === 'cera' ? { scent: false } : {}) });
    }
    const moldWax = (m.lines || []).filter(x => x.role === 'cera').reduce((a, x) => a + n(x.qty), 0);
    const essG = moldWax * n(m.fragrance_pct) / 100 * per;
    if (essG <= 0) continue;
    const blend = blends.find(b => b.id === m.blend_id);
    if (blend?.parts?.length) {
      for (const pt of blend.parts) {
        const s = C.matchEssence(pt.aroma, essences);
        const g = essG * n(pt.pct) / 100;
        if (s) items.push({ supply_id: s.id, qty: C.gramsToUnit(s, g, settings.density), mold: m.name });
        else extra += g * avgG;
      }
    } else extra += essG * avgG;
  }
  return { items, extra };
}

/** Todas tus recetas de molde, convertidas a lo que usa UNA pieza: { [id]: { id, name, mold_name, items, extra, cost } } */
async function moldPieces(map, settings, db = pool) {
  const { rows } = await db.query("SELECT id, name, mold_name FROM recipe_sheets WHERE type='molde' ORDER BY lower(name)");
  const out = {};
  for (const m of rows) {
    const { items, extra } = await moldItemsForSheet({ pieces: 1, lines: [{ role: 'pieza', sheet_id: m.id, qty: 1 }] }, map, settings, db);
    const cost = items.reduce((a, it) => a + it.qty * n(map[it.supply_id]?.unit_cost), 0) + extra;
    out[m.id] = { id: m.id, name: m.name, mold_name: m.mold_name, items: items.map(({ mold, ...it }) => it), extra, cost };
  }
  return out;
}

module.exports = { moldItemsForSheet, moldPieces };
