const express = require('express');
const router = express.Router();
const pool = require('../db/database').pool || require('../db/database');
const { authMiddleware } = require('../middleware/auth');
router.use(authMiddleware);

const d30 = () => new Date(Date.now()-30*86400000).toISOString().split('T')[0];
const dToday = () => new Date().toISOString().split('T')[0];

router.get('/summary', async (req, res) => {
  try {
    const from = req.query.from||d30(), to = req.query.to||dToday();
    const { rows:[s] } = await pool.query(`SELECT COUNT(*) as total_sales,COALESCE(SUM(total),0) as revenue,COALESCE(SUM(discount),0) as total_discounts,COALESCE(AVG(total),0) as avg_ticket FROM sales WHERE DATE(created_at) BETWEEN $1 AND $2 AND payment_status!='cancelled'`,[from,to]);
    const { rows:[p] } = await pool.query(`SELECT COALESCE(SUM((si.unit_price-si.cost_price)*si.quantity),0) as profit,COALESCE(SUM(si.cost_price*si.quantity),0) as cost FROM sale_items si JOIN sales s ON si.sale_id=s.id WHERE DATE(s.created_at) BETWEEN $1 AND $2 AND s.payment_status!='cancelled'`,[from,to]);
    const { rows: bm } = await pool.query(`SELECT payment_method,COUNT(*) as count,SUM(total) as total FROM sales WHERE DATE(created_at) BETWEEN $1 AND $2 AND payment_status!='cancelled' GROUP BY payment_method`,[from,to]);
    res.json({ period:{from,to}, sales:parseInt(s.total_sales), revenue:parseFloat(s.revenue), profit:parseFloat(p.profit), cost:parseFloat(p.cost), margin:s.revenue>0?((p.profit/s.revenue)*100).toFixed(1):0, avg_ticket:parseFloat(s.avg_ticket), total_discounts:parseFloat(s.total_discounts), by_payment:bm });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/by-category', async (req, res) => {
  try {
    const from = req.query.from||d30(), to = req.query.to||dToday();
    const { rows } = await pool.query(`SELECT c.name as category,c.icon,c.color,COUNT(DISTINCT si.id) as items_sold,SUM(si.quantity) as units,SUM(si.quantity*si.unit_price) as revenue,SUM(si.quantity*(si.unit_price-si.cost_price)) as profit FROM sale_items si JOIN sales s ON si.sale_id=s.id JOIN products p ON si.product_id=p.id JOIN categories c ON p.category_id=c.id WHERE DATE(s.created_at) BETWEEN $1 AND $2 AND s.payment_status!='cancelled' GROUP BY c.id,c.name,c.icon,c.color ORDER BY revenue DESC`,[from,to]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/by-product', async (req, res) => {
  try {
    const from = req.query.from||d30(), to = req.query.to||dToday(), lim = parseInt(req.query.limit)||10;
    const { rows } = await pool.query(`SELECT p.id,p.name,p.sku,SUM(si.quantity) as units_sold,SUM(si.quantity*si.unit_price) as revenue,SUM(si.quantity*(si.unit_price-si.cost_price)) as profit FROM sale_items si JOIN sales s ON si.sale_id=s.id JOIN products p ON si.product_id=p.id WHERE DATE(s.created_at) BETWEEN $1 AND $2 AND s.payment_status!='cancelled' GROUP BY p.id,p.name,p.sku ORDER BY revenue DESC LIMIT $3`,[from,to,lim]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/daily', async (req, res) => {
  try {
    const days = parseInt(req.query.days)||30;
    const { rows } = await pool.query(`SELECT DATE(created_at) as date,COUNT(*) as sales,SUM(total) as revenue FROM sales WHERE DATE(created_at)>=CURRENT_DATE-($1*INTERVAL '1 day') AND payment_status!='cancelled' GROUP BY DATE(created_at) ORDER BY date`,[days]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/inactive-customers', async (req, res) => {
  try {
    const days = parseInt(req.query.days)||30;
    const { rows } = await pool.query(`SELECT id,name,phone,instagram,last_purchase,total_spent,purchase_count FROM customers WHERE last_purchase IS NOT NULL AND EXTRACT(EPOCH FROM (NOW()-last_purchase))/86400>$1 ORDER BY last_purchase ASC LIMIT 20`,[days]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stagnant-products', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT p.id,p.name,p.sku,p.stock,p.sale_price,p.created_at,MAX(sm.created_at) as last_sale FROM products p LEFT JOIN stock_movements sm ON p.id=sm.product_id AND sm.type='sale' WHERE p.stock>0 GROUP BY p.id HAVING MAX(sm.created_at) IS NULL OR EXTRACT(EPOCH FROM (NOW()-MAX(sm.created_at)))/86400>14 ORDER BY p.stock DESC LIMIT 10`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
