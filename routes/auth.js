const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/database').pool || require('../db/database');
const { authMiddleware } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contrasena requeridos' });
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'mimo_dev_secret',
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id,name,email,role,created_at FROM users WHERE id = $1', [req.user.id]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const { rows: notifs } = await pool.query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 20');
    const { rows: u } = await pool.query('SELECT COUNT(*) as c FROM notifications WHERE is_read = 0');
    res.json({ notifications: notifs, unread: parseInt(u[0].c) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/notifications/read', authMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read = 1');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
