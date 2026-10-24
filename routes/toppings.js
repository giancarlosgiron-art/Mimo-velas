const express = require('express');
const router = express.Router();
const pool = require('../db/database');
const jwt = require('jsonwebtoken');
const JWT_SECRET = require('../middleware/secret');
const { authMiddleware } = require('../middleware/auth');

function isStaff(req) {
  const token = (req.headers.authorization || '').split(' ')[1];
  try { return !!token && !!jwt.verify(token, JWT_SECRET); } catch { return false; }
}

// Decoraciones ("toppings") para "Arma tu vela". Se administran en el panel → Mi página → Arma tu vela.
// No tienen aroma: solo foto, nombre y un precio extra opcional.

function clean(body, current = {}) {
  return {
    name: body.name !== undefined ? String(body.name).trim().slice(0, 60) : current.name,
    image: body.image !== undefined ? (String(body.image || '').slice(0, 300) || null) : current.image,
    cutout: body.cutout !== undefined ? (String(body.cutout || '').slice(0, 300) || null) : (current.cutout ?? null),
    price: body.price !== undefined ? Math.max(0, parseInt(body.price) || 0) : (current.price ?? 0),
    active: body.active !== undefined ? (body.active ? 1 : 0) : (current.active ?? 1),
    position: body.position !== undefined ? parseInt(body.position) || 0 : (current.position ?? 0),
  };
}

// Público: solo las activas (con ?all=1 y sesión iniciada, todas)
router.get('/', async (req, res) => {
  try {
    const all = req.query.all === '1' && isStaff(req);
    const { rows } = await pool.query(
      `SELECT id, name, image, cutout, price, active, position FROM toppings ${all ? '' : 'WHERE active = 1'} ORDER BY position, id`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const t = clean(req.body);
    if (!t.name) return res.status(400).json({ error: 'Ponle nombre al topping' });
    const { rows } = await pool.query(
      `INSERT INTO toppings (name, image, cutout, price, active, position)
       VALUES ($1,$2,$3,$4,$5,(SELECT COALESCE(MAX(position),0)+1 FROM toppings)) RETURNING *`,
      [t.name, t.image, t.cutout, t.price, t.active]);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM toppings WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Topping no encontrado' });
    const t = clean(req.body, rows[0]);
    if (!t.name) return res.status(400).json({ error: 'Ponle nombre al topping' });
    const { rows: out } = await pool.query(
      'UPDATE toppings SET name=$1, image=$2, cutout=$3, price=$4, active=$5, position=$6 WHERE id=$7 RETURNING *',
      [t.name, t.image, t.cutout, t.price, t.active, t.position, req.params.id]);
    res.json(out[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM toppings WHERE id=$1', [req.params.id]);
    res.json({ message: 'Topping eliminado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
