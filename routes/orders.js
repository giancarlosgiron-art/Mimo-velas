const express = require('express');
const router = express.Router();
const pool = require('../db/database').pool || require('../db/database');
const { authMiddleware } = require('../middleware/auth');
router.use(authMiddleware);

const SL = { pending:'Pendiente', confirmed:'Confirmado', paid:'Pagado', delivered:'Entregado', cancelled:'Cancelado' };

router.get('/', async (req, res) => {
  try {
    const { status, type } = req.query;
    const params = []; let i = 0;
    let q = `SELECT o.*,c.name as customer_name,c.phone as customer_phone,c.instagram as customer_ig
             FROM orders o LEFT JOIN customers c ON o.customer_id=c.id WHERE 1=1`;
    if (status) { q += ` AND o.status=$${++i}`; params.push(status); }
    if (type)   { q += ` AND o.type=$${++i}`;   params.push(type); }
    q += ' ORDER BY o.created_at DESC';
    const { rows } = await pool.query(q, params);
    rows.forEach(o => { o.status_label = SL[o.status]||o.status; });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT o.*,c.name as customer_name,c.phone as customer_phone,c.instagram as customer_ig
      FROM orders o LEFT JOIN customers c ON o.customer_id=c.id WHERE o.id=$1`,[req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    const o = rows[0];
    const { rows: items } = await pool.query('SELECT * FROM order_items WHERE order_id=$1',[o.id]);
    o.items = items; o.status_label = SL[o.status]||o.status;
    res.json(o);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { customer_id, type, items, total, deposit, description, notes, due_date } = req.body;
    if (!customer_id) return res.status(400).json({ error: 'Cliente requerida' });
    const subtotal = items?.reduce((s,i)=>s+(i.unit_price*i.quantity),0)||parseFloat(total)||0;
    const { rows } = await pool.query(
      `INSERT INTO orders (customer_id,type,status,subtotal,total,deposit,description,notes,due_date)
       VALUES ($1,$2,'pending',$3,$4,$5,$6,$7,$8) RETURNING id`,
      [customer_id, type||'reservation', subtotal, subtotal, parseFloat(deposit)||0, description||'', notes||'', due_date||null]);
    const orderId = rows[0].id;
    if (items?.length>0) {
      for (const it of items) {
        await pool.query('INSERT INTO order_items (order_id,product_id,product_name,quantity,unit_price,notes) VALUES ($1,$2,$3,$4,$5,$6)',
          [orderId, it.product_id||null, it.product_name||'', it.quantity||1, it.unit_price||0, it.notes||'']);
      }
    }
    await pool.query('INSERT INTO notifications (type,title,message,link) VALUES ($1,$2,$3,$4)',
      ['info',`Nuevo pedido #${orderId}`, description||'Nuevo pedido registrado','/orders']);
    res.status(201).json({ id: orderId, message: 'Pedido creado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM orders WHERE id=$1',[req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    const o = rows[0];
    const { status, deposit, notes, due_date } = req.body;
    await pool.query('UPDATE orders SET status=$1,deposit=$2,notes=$3,due_date=$4,updated_at=NOW() WHERE id=$5',
      [status||o.status, deposit!==undefined?parseFloat(deposit):o.deposit, notes??o.notes, due_date??o.due_date, req.params.id]);
    if (status&&status!==o.status) {
      const { rows: cr } = await pool.query('SELECT name FROM customers WHERE id=$1',[o.customer_id]);
      await pool.query('INSERT INTO notifications (type,title,message,link) VALUES ($1,$2,$3,$4)',
        ['info',`Pedido #${o.id} actualizado`,`Estado: ${SL[status]} - ${cr[0]?.name}`,'/orders']);
    }
    res.json({ message: 'Pedido actualizado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM orders WHERE id=$1',[req.params.id]);
    res.json({ message: 'Pedido eliminado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
