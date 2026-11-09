// Dónde vive Mimito dentro del servidor del panel
const os = require('os');
const path = require('path');
const fs = require('fs');

const dir = process.env.MIMITO_DIR || path.join(os.tmpdir(), 'mimito', 'conocimiento');
fs.mkdirSync(path.join(dir, 'datos'), { recursive: true });
const BASE = fs.realpathSync(dir); // Claude guarda las conversaciones según la ruta real (sin enlaces)
// Mimito le habla al panel desde adentro (mismo servidor)
const API = (process.env.MIMITO_PANEL_API || `http://127.0.0.1:${process.env.PORT || 3001}`).replace(/\/$/, '') + '/api';

module.exports = { BASE, API };
