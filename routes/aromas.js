const express = require('express');
const router = express.Router();
const pool = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

// Público: el catálogo muestra la lista "Aromas disponibles"
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id,name,position FROM aromas ORDER BY position, id');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const { rows } = await pool.query(
      'INSERT INTO aromas (name, position) VALUES ($1, (SELECT COALESCE(MAX(position),0)+1 FROM aromas)) RETURNING *', [name]);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    await pool.query('UPDATE aromas SET name=$1 WHERE id=$2', [name, req.params.id]);
    res.json({ message: 'Aroma actualizado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM aromas WHERE id=$1', [req.params.id]);
    res.json({ message: 'Aroma eliminado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
