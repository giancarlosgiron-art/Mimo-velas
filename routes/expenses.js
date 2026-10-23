const express = require('express');
const router = express.Router();
const pool = require('../db/database').pool || require('../db/database');
const { authMiddleware } = require('../middleware/auth');
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { from, to, category } = req.query;
    const params = []; let i = 0;
    let q = 'SELECT * FROM expenses WHERE 1=1';
    if (from) { q += ` AND date>=$${++i}`; params.push(from); }
    if (to) { q += ` AND date<=$${++i}`; params.push(to); }
    if (category) { q += ` AND category=$${++i}`; params.push(category); }
    q += ' ORDER BY date DESC, created_at DESC';
    const { rows: expenses } = await pool.query(q, params);
    const ms = new Date().toISOString().slice(0,7)+'-01';
    const { rows:[{total:monthTotal}] } = await pool.query('SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE date>=$1',[ms]);
    const { rows: byCategory } = await pool.query('SELECT category,COALESCE(SUM(amount),0) as total,COUNT(*) as count FROM expenses WHERE date>=$1 GROUP BY category ORDER BY total DESC',[ms]);
    res.json({ expenses, monthTotal: parseFloat(monthTotal), byCategory });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { date, amount, description, category } = req.body;
    if (!date||!amount||!description) return res.status(400).json({ error: 'Fecha, monto y descripcion requeridos' });
    const cat = ['Materiales','Empaque','Transporte','Otros'].includes(category)?category:'Otros';
    const { rows } = await pool.query('INSERT INTO expenses (date,amount,description,category) VALUES ($1,$2,$3,$4) RETURNING id',
      [date, parseFloat(amount), description.trim(), cat]);
    res.status(201).json({ id: rows[0].id, message: 'Gasto registrado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM expenses WHERE id=$1',[req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Gasto no encontrado' });
    await pool.query('DELETE FROM expenses WHERE id=$1',[req.params.id]);
    res.json({ message: 'Gasto eliminado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
