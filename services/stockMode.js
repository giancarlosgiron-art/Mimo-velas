// Modo de stock: mimo parte trabajando A PEDIDO (se hace la vela cuando la piden), así que el stock
// es solo referencia: nada sale como agotado ni urgente. Se cambia en Inventario (site_content 'inventario').
const pool = require('../db/database');

let cache = { v: null, at: 0 };
async function trackStock(db = pool) {
  if (cache.v !== null && Date.now() - cache.at < 10000) return cache.v;
  const { rows } = await db.query("SELECT data FROM site_content WHERE key='inventario'");
  cache = { v: !!rows[0]?.data?.track_stock, at: Date.now() };
  return cache.v;
}

function statusFor(track, stock, min) {
  if (!track) return 'available';
  return stock <= 0 ? 'out_of_stock' : stock <= min ? 'low_stock' : 'available';
}

/** Recalcula el estado de todos los productos según el modo (y limpia avisos de stock si es a pedido) */
async function refreshStatuses() {
  cache.at = 0;
  const track = await trackStock();
  if (track) {
    await pool.query(`UPDATE products SET status = CASE WHEN stock<=0 THEN 'out_of_stock' WHEN stock<=min_stock THEN 'low_stock' ELSE 'available' END`);
  } else {
    await pool.query(`UPDATE products SET status='available' WHERE status<>'available'`);
    await pool.query(`DELETE FROM notifications WHERE link='/inventory' AND (title LIKE 'Stock bajo:%' OR title LIKE 'Agotado:%')`);
  }
  return track;
}

module.exports = { trackStock, statusFor, refreshStatuses };
