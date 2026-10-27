const express = require('express');
const router = express.Router();
const pool = require('../db/database').pool || require('../db/database');
const { authMiddleware } = require('../middleware/auth');
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { search, vip, sort = 'total_spent', order = 'DESC' } = req.query;
    const params = []; let i = 0;
    // Además de las ventas, cuenta los pedidos (web y del panel) vinculados a cada cliente
    let q = `SELECT c.*, COALESCE(o.cnt,0)::int AS order_count, COALESCE(o.sum,0)::float AS order_total, o.last AS last_order
      FROM customers c LEFT JOIN (
        SELECT customer_id, COUNT(*) cnt, SUM(total) sum, MAX(created_at) last FROM orders
        WHERE status != 'cancelled' AND customer_id IS NOT NULL GROUP BY customer_id
      ) o ON o.customer_id = c.id WHERE 1=1`;
    if (search) { q += ` AND (c.name ILIKE $${++i} OR c.phone ILIKE $${i} OR c.instagram ILIKE $${i} OR c.email ILIKE $${i})`; params.push('%'+search+'%'); }
    if (vip !== undefined) { q += ` AND c.is_vip = $${++i}`; params.push(parseInt(vip)); }
    const cols = { name:'c.name', spent:'c.total_spent', purchases:'c.purchase_count', last:'c.last_purchase', created:'c.created_at' };
    q += ` ORDER BY ${cols[sort]||'c.total_spent'} ${order==='ASC'?'ASC':'DESC'}, c.created_at DESC`;
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
    const c = rows[0];
    const { rows: purchases } = await pool.query(`
      SELECT s.id,s.total,s.payment_method,s.payment_status,s.created_at,
             STRING_AGG(si.product_name::text,', ') as items
      FROM sales s LEFT JOIN sale_items si ON s.id=si.sale_id
      WHERE s.customer_id=$1 GROUP BY s.id ORDER BY s.created_at DESC LIMIT 20`, [c.id]);
    const { rows: orders } = await pool.query('SELECT * FROM orders WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 10', [c.id]);
    c.purchases = purchases; c.orders = orders;
    res.json(c);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, phone, instagram, email, birthday, preferences, notes, is_vip } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    if (phone) {
      const { rows: ex } = await pool.query("SELECT id FROM customers WHERE phone=$1 AND phone IS NOT NULL AND phone!=''", [phone]);
      if (ex[0]) return res.status(400).json({ error: 'Ya existe un cliente con ese teléfono' });
    }
    const { rows } = await pool.query(
      'INSERT INTO customers (name,phone,instagram,email,birthday,preferences,notes,is_vip) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [name, phone||null, instagram||null, email||null, birthday||null, preferences||null, notes||null, is_vip?1:0]);
    res.status(201).json({ id: rows[0].id, message: 'Cliente creado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Pedido web → cliente: vincula el pedido a un cliente existente o crea uno nuevo.
// body: { name, phone, customer_id, force_new }
router.post('/from-order/:orderId', async (req, res) => {
  try {
    const { rows: or } = await pool.query('SELECT * FROM orders WHERE id=$1', [req.params.orderId]);
    const order = or[0];
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    const link = async (id, created) => {
      await pool.query('UPDATE orders SET customer_id=$1 WHERE id=$2', [id, order.id]);
      const { rows } = await pool.query('SELECT id,name,phone FROM customers WHERE id=$1', [id]);
      res.json({ customer: rows[0], created });
    };
    if (order.customer_id && !req.body.customer_id) {
      const { rows } = await pool.query('SELECT id,name,phone FROM customers WHERE id=$1', [order.customer_id]);
      if (rows[0]) return res.json({ customer: rows[0], created: false });
    }
    if (req.body.customer_id) {
      const { rows } = await pool.query('SELECT id FROM customers WHERE id=$1', [req.body.customer_id]);
      if (!rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
      return link(rows[0].id, false);
    }
    const name = String(req.body.name || order.contact_name || '').trim().slice(0, 120);
    const phone = String(req.body.phone || order.contact_phone || '').trim().slice(0, 40);
    const digits = phone.replace(/\D/g, '');
    if (!name) return res.status(400).json({ error: 'Escribe el nombre del cliente' });
    // Mismo número de WhatsApp = misma persona
    if (digits.length >= 8) {
      const { rows } = await pool.query("SELECT id FROM customers WHERE RIGHT(regexp_replace(COALESCE(phone,''),'\\D','','g'), 8) = RIGHT($1, 8) LIMIT 1", [digits]);
      if (rows[0]) return link(rows[0].id, false);
    }
    // Mismo nombre: preguntar antes de juntar (puede ser otra persona)
    if (!req.body.force_new) {
      const { rows } = await pool.query('SELECT id,name,phone,instagram FROM customers WHERE LOWER(TRIM(name)) = LOWER($1) LIMIT 1', [name]);
      if (rows[0]) return res.status(409).json({ candidate: rows[0] });
    }
    const { rows } = await pool.query('INSERT INTO customers (name,phone,notes) VALUES ($1,$2,$3) RETURNING id',
      [name, phone || null, `Llegó por la página (pedido web #${order.id})`]);
    return link(rows[0].id, true);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM customers WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
    const c = rows[0];
    const { name, phone, instagram, email, birthday, preferences, notes, is_vip } = req.body;
    await pool.query('UPDATE customers SET name=$1,phone=$2,instagram=$3,email=$4,birthday=$5,preferences=$6,notes=$7,is_vip=$8 WHERE id=$9',
      [name||c.name, phone??c.phone, instagram??c.instagram, email??c.email, birthday??c.birthday,
       preferences??c.preferences, notes??c.notes, is_vip!==undefined?(is_vip?1:0):c.is_vip, req.params.id]);
    res.json({ message: 'Cliente actualizado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM customers WHERE id=$1', [req.params.id]);
    res.json({ message: 'Cliente eliminado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/vip', async (req, res) => {
  try {
    const { is_vip } = req.body;
    await pool.query('UPDATE customers SET is_vip=$1 WHERE id=$2', [is_vip?1:0, req.params.id]);
    res.json({ message: 'VIP actualizado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
