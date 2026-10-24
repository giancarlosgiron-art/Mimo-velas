require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

const app = express();
// Railway está detrás de un proxy: así req.ip es la IP real del visitante (límites de la IA)
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database
require('./db/database');

// API Routes
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/products',  require('./routes/products'));
app.use('/api/sales',     require('./routes/sales'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/orders',    require('./routes/orders'));
app.use('/api/reports',   require('./routes/reports'));
app.use('/api/expenses',  require('./routes/expenses'));
app.use('/api/aromas',    require('./routes/aromas'));
app.use('/api/site',      require('./routes/site'));
app.use('/api/toppings',  require('./routes/toppings'));
app.use('/api/builder',   require('./routes/builder'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor', detail: err.message });
});

app.listen(PORT, () => {
  console.log('\n🕯️  mimo - Sistema de Gestión');
  console.log(`🚀 Servidor corriendo en: http://localhost:${PORT}`);
  console.log(`📊 Panel de control: http://localhost:${PORT}\n`);
});
