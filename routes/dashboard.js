const express = require('express');
const router = express.Router();
const pool = require('../db/database').pool || require('../db/database');
const { authMiddleware } = require('../middleware/auth');
router.use(authMiddleware);

router.get('/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const ms = today.slice(0,7)+'-01';
    const pm = new Date(); pm.setMonth(pm.getMonth()-1);
    const pms = pm.toISOString().slice(0,7)+'-01';
    const { rows:[ts] } = await pool.query(`SELECT COALESCE(SUM(total),0) as total,COUNT(*) as count FROM sales WHERE DATE(created_at)=$1 AND payment_status!='cancelled'`,[today]);
    const { rows:[mo] } = await pool.query(`SELECT COALESCE(SUM(total),0) as total,COUNT(*) as count FROM sales WHERE DATE(created_at)>=$1 AND payment_status!='cancelled'`,[ms]);
    const { rows:[pm2] } = await pool.query(`SELECT COALESCE(SUM(total),0) as total FROM sales WHERE DATE(created_at)>=$1 AND DATE(created_at)<$2`,[pms,ms]);
    const growth = pm2.total>0?(((mo.total-pm2.total)/pm2.total)*100).toFixed(1):100;
    const { rows:[pr] } = await pool.query(`SELECT COALESCE(SUM((si.unit_price-si.cost_price)*si.quantity),0) as profit FROM sale_items si JOIN sales s ON si.sale_id=s.id WHERE DATE(s.created_at)>=$1 AND s.payment_status!='cancelled'`,[ms]);
    const { rows:[{c:po}] } = await pool.query(`SELECT COUNT(*) as c FROM orders WHERE status IN ('pending','confirmed')`);
    const { rows:[{c:ls}] } = await pool.query(`SELECT COUNT(*) as c FROM products WHERE stock<=min_stock AND stock>0`);
    const { rows:[{c:os}] } = await pool.query(`SELECT COUNT(*) as c FROM products WHERE stock=0`);
    const { rows:[{c:tp}] } = await pool.query(`SELECT COUNT(*) as c FROM products`);
    const { rows:[{c:tc}] } = await pool.query(`SELECT COUNT(*) as c FROM customers`);
    const { rows:[{c:vc}] } = await pool.query(`SELECT COUNT(*) as c FROM customers WHERE is_vip=1`);
    res.json({
      today:{total:parseFloat(ts.total),count:parseInt(ts.count)},
      month:{total:parseFloat(mo.total),count:parseInt(mo.count),growth:parseFloat(growth)},
      profit:parseFloat(pr.profit), pendingOrders:parseInt(po), lowStock:parseInt(ls),
      outOfStock:parseInt(os), totalProducts:parseInt(tp), totalCustomers:parseInt(tc), vipCustomers:parseInt(vc)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/chart', async (req, res) => {
  try {
    const days = parseInt(req.query.days)||30;
    const { rows } = await pool.query(`SELECT DATE(created_at) as date,SUM(total) as total,COUNT(*) as count FROM sales WHERE DATE(created_at)>=CURRENT_DATE-($1*INTERVAL '1 day') AND payment_status!='cancelled' GROUP BY DATE(created_at) ORDER BY date`,[days]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/top-products', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT p.id,p.name,p.sku,SUM(si.quantity) as units_sold,SUM(si.quantity*si.unit_price) as revenue,SUM(si.quantity*(si.unit_price-si.cost_price)) as profit FROM sale_items si JOIN products p ON si.product_id=p.id JOIN sales s ON si.sale_id=s.id WHERE DATE(s.created_at)>=CURRENT_DATE-INTERVAL '30 days' GROUP BY p.id ORDER BY revenue DESC LIMIT 5`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/recent-sales', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT s.id,s.total,s.payment_method,s.payment_status,s.created_at,COALESCE(c.name,o.contact_name) as customer_name,STRING_AGG(si.product_name::text,', ') as items FROM sales s LEFT JOIN customers c ON s.customer_id=c.id LEFT JOIN orders o ON o.id=s.order_id LEFT JOIN sale_items si ON s.id=si.sale_id GROUP BY s.id,c.name,o.contact_name ORDER BY s.created_at DESC LIMIT 8`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/low-stock', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT p.id,p.name,p.sku,p.stock,p.min_stock,p.status,c.name as category FROM products p LEFT JOIN categories c ON p.category_id=c.id WHERE p.stock<=p.min_stock ORDER BY p.stock ASC LIMIT 8`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/top-customers', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id,name,instagram,is_vip,total_spent,purchase_count,last_purchase FROM customers ORDER BY total_spent DESC LIMIT 5`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Finanzas del mes: ventas, costo de las velas, ganancia, rentabilidad, gastos y meta ──
// ?month=YYYY-MM (por defecto el mes actual, hora de Chile)
function monthRange(month) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
  const [y, m] = /^\d{4}-\d{2}$/.test(month || '') ? month.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const prev = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
  const daysInMonth = new Date(y, m, 0).getDate();
  const isCurrent = y === now.getFullYear() && m === now.getMonth() + 1;
  return { start, next, prev, daysInMonth, dayOfMonth: isCurrent ? now.getDate() : daysInMonth, isCurrent, label: `${y}-${String(m).padStart(2, '0')}` };
}
const TZ = "AT TIME ZONE 'America/Santiago'";

async function totals(from, to) {
  const { rows: [a] } = await pool.query(`
    SELECT COALESCE(SUM(si.quantity*si.unit_price),0)::float AS revenue,
           COALESCE(SUM(si.quantity*si.cost_price),0)::float AS cost,
           COALESCE(SUM(si.quantity),0)::int AS units,
           COUNT(DISTINCT s.id)::int AS sales
    FROM sales s JOIN sale_items si ON si.sale_id=s.id
    WHERE s.payment_status!='cancelled' AND (s.created_at ${TZ})::date >= $1 AND (s.created_at ${TZ})::date < $2`, [from, to]);
  const { rows: [e] } = await pool.query(`SELECT COALESCE(SUM(amount),0)::float AS expenses FROM expenses WHERE date >= $1 AND date < $2`, [from, to]);
  const profit = a.revenue - a.cost;
  return { ...a, profit, margin: a.revenue > 0 ? profit / a.revenue * 100 : 0, expenses: e.expenses, net: profit - e.expenses,
           ticket: a.sales > 0 ? a.revenue / a.sales : 0 };
}

router.get('/finance', async (req, res) => {
  try {
    const r = monthRange(req.query.month);
    const cur = await totals(r.start, r.next);
    const prev = await totals(r.prev, r.start);
    // Por día (para el gráfico)
    const { rows: daily } = await pool.query(`
      SELECT (s.created_at ${TZ})::date AS date, SUM(si.quantity*si.unit_price)::float AS revenue, SUM(si.quantity*(si.unit_price-si.cost_price))::float AS profit
      FROM sales s JOIN sale_items si ON si.sale_id=s.id
      WHERE s.payment_status!='cancelled' AND (s.created_at ${TZ})::date >= $1 AND (s.created_at ${TZ})::date < $2
      GROUP BY 1 ORDER BY 1`, [r.start, r.next]);
    // Rentabilidad por vela en el mes
    const { rows: products } = await pool.query(`
      SELECT COALESCE(si.product_name,'Otro') AS name, si.product_id, SUM(si.quantity)::int AS units,
             SUM(si.quantity*si.unit_price)::float AS revenue, SUM(si.quantity*si.cost_price)::float AS cost,
             SUM(si.quantity*(si.unit_price-si.cost_price))::float AS profit, BOOL_OR(si.cost_price=0) AS missing_cost
      FROM sales s JOIN sale_items si ON si.sale_id=s.id
      WHERE s.payment_status!='cancelled' AND (s.created_at ${TZ})::date >= $1 AND (s.created_at ${TZ})::date < $2
      GROUP BY si.product_name, si.product_id ORDER BY profit DESC LIMIT 12`, [r.start, r.next]);
    // Velas activas sin costo cargado (la ganancia saldría inflada)
    const { rows: noCost } = await pool.query(`SELECT id,name FROM products WHERE COALESCE(cost_price,0)=0 AND status!='out_of_stock' ORDER BY name LIMIT 20`);
    // Pedidos por seguir: pendientes hace más de 2 días
    const { rows: followUp } = await pool.query(`
      SELECT o.id, o.total, o.created_at, COALESCE(c.name,o.contact_name) AS name, COALESCE(c.phone,o.contact_phone) AS phone
      FROM orders o LEFT JOIN customers c ON c.id=o.customer_id
      WHERE o.status='pending' AND o.created_at < NOW() - INTERVAL '2 days' ORDER BY o.created_at LIMIT 10`);
    const { rows: [g] } = await pool.query(`SELECT value FROM app_settings WHERE key='meta_mensual'`);
    const goal = g ? Number(g.value) || 0 : 0;
    const projection = r.isCurrent && r.dayOfMonth > 0 ? cur.revenue / r.dayOfMonth * r.daysInMonth : cur.revenue;
    res.json({ month: r.label, isCurrent: r.isCurrent, current: cur, previous: prev, daily, products, noCost, followUp, goal, projection,
               daysLeft: r.isCurrent ? r.daysInMonth - r.dayOfMonth : 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/goal', async (req, res) => {
  try {
    const value = Math.max(0, Math.round(Number(req.body.goal) || 0));
    await pool.query(`INSERT INTO app_settings (key,value) VALUES ('meta_mensual',$1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [JSON.stringify(value)]);
    res.json({ goal: value });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
