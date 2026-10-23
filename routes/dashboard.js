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
    const { rows } = await pool.query(`SELECT s.id,s.total,s.payment_method,s.payment_status,s.created_at,c.name as customer_name,STRING_AGG(si.product_name::text,', ') as items FROM sales s LEFT JOIN customers c ON s.customer_id=c.id LEFT JOIN sale_items si ON s.id=si.sale_id GROUP BY s.id,c.name ORDER BY s.created_at DESC LIMIT 8`);
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

module.exports = router;
