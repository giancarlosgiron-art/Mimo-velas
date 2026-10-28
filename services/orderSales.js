// Pedido entregado = venta registrada: así el dashboard muestra ingresos, costo de las velas y ganancia reales.
// Cada pedido entregado tiene a lo más una venta (sales.order_id). Si el pedido deja de estar entregado, la venta se anula.
const pool = require('../db/database');

function paymentKey(text) {
  const t = String(text || '').toLowerCase();
  if (/transfer/.test(t)) return 'transfer';
  if (/tarjeta|d[eé]bito|cr[eé]dito/.test(t)) return 'card';
  return 'cash';
}

async function adjustStock(client, productId, delta, saleId, note) {
  const { rows } = await client.query('SELECT stock, min_stock FROM products WHERE id=$1', [productId]);
  if (!rows[0]) return;
  const ns = Math.max(0, rows[0].stock + delta);
  const st = ns === 0 ? 'out_of_stock' : ns <= rows[0].min_stock ? 'low_stock' : 'available';
  await client.query('UPDATE products SET stock=$1, status=$2 WHERE id=$3', [ns, st, productId]);
  await client.query('INSERT INTO stock_movements (product_id,type,quantity,reference_id,notes) VALUES ($1,$2,$3,$4,$5)',
    [productId, delta < 0 ? 'sale' : 'adjustment', delta, saleId, note]);
}

/** Registra la venta de un pedido (si aún no la tiene). Devuelve el id de la venta. */
async function registerSale(client, orderId, userId = null) {
  const { rows: ex } = await client.query('SELECT id FROM sales WHERE order_id=$1', [orderId]);
  if (ex[0]) return ex[0].id;
  const { rows: or } = await client.query('SELECT * FROM orders WHERE id=$1', [orderId]);
  const order = or[0];
  if (!order) return null;
  const { rows: items } = await client.query('SELECT * FROM order_items WHERE order_id=$1', [orderId]);
  const total = Number(order.total) || items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const { rows: sr } = await client.query(
    `INSERT INTO sales (customer_id,user_id,subtotal,discount,total,payment_method,payment_status,amount_paid,balance,notes,order_id,created_at)
     VALUES ($1,$2,$3,0,$3,$4,'paid',$3,0,$5,$6,COALESCE($7, NOW())) RETURNING id`,
    [order.customer_id || null, userId, total, paymentKey(order.payment_method), `Pedido #${order.id}`, order.id, order.delivered_at || order.updated_at || null]);
  const saleId = sr[0].id;
  for (const it of items) {
    let cost = 0;
    if (it.product_id) {
      const { rows: pr } = await client.query('SELECT cost_price FROM products WHERE id=$1', [it.product_id]);
      cost = pr[0] ? Number(pr[0].cost_price) || 0 : 0;
    }
    await client.query('INSERT INTO sale_items (sale_id,product_id,product_name,quantity,unit_price,cost_price,discount) VALUES ($1,$2,$3,$4,$5,$6,0)',
      [saleId, it.product_id, it.product_name, it.quantity, it.unit_price, cost]);
    if (it.product_id) await adjustStock(client, it.product_id, -it.quantity, saleId, `Pedido #${order.id} entregado`);
  }
  if (order.customer_id) {
    await client.query('UPDATE customers SET total_spent=total_spent+$1, purchase_count=purchase_count+1, last_purchase=GREATEST(COALESCE(last_purchase, NOW()), NOW()) WHERE id=$2',
      [total, order.customer_id]);
  }
  return saleId;
}

/** Anula la venta de un pedido (devuelve el stock). */
async function removeSale(client, orderId) {
  const { rows: sr } = await client.query('SELECT * FROM sales WHERE order_id=$1', [orderId]);
  const sale = sr[0];
  if (!sale) return;
  const { rows: items } = await client.query('SELECT * FROM sale_items WHERE sale_id=$1', [sale.id]);
  for (const it of items) if (it.product_id) await adjustStock(client, it.product_id, it.quantity, sale.id, `Pedido #${orderId} ya no está entregado`);
  if (sale.customer_id) {
    await client.query('UPDATE customers SET total_spent=GREATEST(0,total_spent-$1), purchase_count=GREATEST(0,purchase_count-1) WHERE id=$2', [sale.total, sale.customer_id]);
  }
  await client.query('DELETE FROM sale_items WHERE sale_id=$1', [sale.id]);
  await client.query('DELETE FROM sales WHERE id=$1', [sale.id]);
}

/** Pedidos que ya estaban entregados antes de este cambio: se registran una sola vez */
async function backfill() {
  const { rows } = await pool.query(`SELECT o.id FROM orders o WHERE o.status='delivered' AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.order_id=o.id)`);
  for (const r of rows) {
    const client = await pool.connect();
    try { await client.query('BEGIN'); await registerSale(client, r.id); await client.query('COMMIT'); }
    catch (e) { await client.query('ROLLBACK'); console.error('backfill pedido', r.id, e.message); }
    finally { client.release(); }
  }
  if (rows.length) console.log(`Ventas registradas desde ${rows.length} pedido(s) entregado(s)`);
}

module.exports = { registerSale, removeSale, backfill };
