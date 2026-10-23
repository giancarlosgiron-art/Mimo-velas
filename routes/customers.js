const express = require('express');
const router = express.Router();
const pool = require('../db/database').pool || require('../db/database');
const { authMiddleware } = require('../middleware/auth');
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { search, vip, sort = 'total_spent', order = 'DESC' } = req.query;
    const params = []; let i = 0;
    let q = 'SELECT * FROM customers WHERE 1=1';
    if (search) { q += ` AND (name ILIKE $${++i} OR phone ILIKE $${i} OR instagram ILIKE $${i} OR email ILIKE $${i})`; params.push('%'+search+'%'); }
    if (vip !== undefined) { q += ` AND is_vip = $${++i}`; params.push(parseInt(vip)); }
    const cols = { name:'name', spent:'total_spent', purchases:'purchase_count', last:'last_purchase', created:'created_at' };
    q += ` ORDER BY ${cols[sort]||'total_spent'} ${order==='ASC'?'ASC':'DESC'}`;
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Cliente no encontrada' });
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
      if (ex[0]) return res.status(400).json({ error: 'Ya existe una cliente con ese telefono' });
    }
    const { rows } = await pool.query(
      'INSERT INTO customers (name,phone,instagram,email,birthday,preferences,notes,is_vip) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [name, phone||null, instagram||null, email||null, birthday||null, preferences||null, notes||null, is_vip?1:0]);
    res.status(201).json({ id: rows[0].id, message: 'Cliente creada' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM customers WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Cliente no encontrada' });
    const c = rows[0];
    const { name, phone, instagram, email, birthday, preferences, notes, is_vip } = req.body;
    await pool.query('UPDATE customers SET name=$1,phone=$2,instagram=$3,email=$4,birthday=$5,preferences=$6,notes=$7,is_vip=$8 WHERE id=$9',
      [name||c.name, phone??c.phone, instagram??c.instagram, email??c.email, birthday??c.birthday,
       preferences??c.preferences, notes??c.notes, is_vip!==undefined?(is_vip?1:0):c.is_vip, req.params.id]);
    res.json({ message: 'Cliente actualizada' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM customers WHERE id=$1', [req.params.id]);
    res.json({ message: 'Cliente eliminada' });
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
