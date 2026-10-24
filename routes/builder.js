const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const pool = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

// "Arma tu vela" con IA: genera una foto referencial de la lata dorada con los toppings elegidos,
// usando el modelo de imágenes de Google Gemini. La clave va en Railway: GEMINI_API_KEY.
// Las combinaciones ya generadas se reutilizan (no cuestan de nuevo) y hay límites diarios.

const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
// Solo para pruebas locales (un simulador); en producción se usa la API de Google
const API_BASE = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com';
const DEFAULT_BASE = path.join(__dirname, '..', 'public', 'builder', 'lata-dorada.jpg');

async function siteConfig() {
  const { rows } = await pool.query("SELECT data FROM site_content WHERE key='arma_tu_vela'");
  return rows[0]?.data || {};
}

// Lee una imagen guardada en la base (/api/site/images/:id) o la foto de la lata incluida
async function loadImage(url) {
  const m = /^\/api\/site\/images\/(\d+)$/.exec(url || '');
  if (m) {
    const { rows } = await pool.query('SELECT mime, data FROM site_images WHERE id=$1', [m[1]]);
    if (rows[0]) return { mime: rows[0].mime, data: rows[0].data.toString('base64') };
  }
  return null;
}

async function todayCount(ip) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE ip=$1)::int AS mine
     FROM ai_renders WHERE generated = 1 AND created_at > NOW() - INTERVAL '1 day'`, [ip]);
  return rows[0];
}

function buildPrompt(items) {
  const list = items.map((it, i) => `- ${it.qty} × "${it.name}" (reference image ${i + 2})`).join('\n');
  return [
    'You are creating a realistic product photo for a handmade soy candle brand.',
    'Image 1 is the real candle: a gold metal tin filled with cream-white soy wax and three wicks, seen from above.',
    'Place decorative wax toppings resting on the wax surface of THIS candle:',
    list,
    'Each reference image shows the topping inside a bowl, sometimes with a paper label: use ONLY the topping piece itself, never the bowl, label or text.',
    'Arrange the pieces naturally around the wicks without covering them, at a realistic scale for the tin, with soft natural shadows.',
    'Keep the tin, the wicks, the wax texture, the camera angle, the lighting and the background exactly as in image 1.',
    'Do not add any text, logos, people, food, flames or extra objects. Square photo.',
  ].join('\n');
}

async function callGemini(parts) {
  const key = process.env.GEMINI_API_KEY;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const res = await fetch(`${API_BASE}/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
      }),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      // El detalle técnico (en inglés) queda en los registros; al cliente, un mensaje amable
      console.error(`Gemini ${res.status}:`, json.error?.message);
      throw new Error(res.status === 429
        ? 'La vista con IA no está disponible en este momento. Igual puedes agregar tu vela al pedido.'
        : 'No pudimos crear la imagen ahora. Intenta en un rato o agrega tu vela al pedido.');
    }
    const out = (json.candidates?.[0]?.content?.parts || []).find(p => p.inlineData || p.inline_data);
    const img = out && (out.inlineData || out.inline_data);
    if (!img?.data) throw new Error('La IA no devolvió una imagen. Intenta con otra combinación.');
    return { mime: img.mimeType || img.mime_type || 'image/png', buffer: Buffer.from(img.data, 'base64') };
  } finally {
    clearTimeout(timer);
  }
}

// Público: ¿está disponible la vista con IA?
router.get('/status', async (req, res) => {
  try {
    const cfg = await siteConfig();
    res.json({ ai: !!process.env.GEMINI_API_KEY && cfg.ai_enabled !== false });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Panel: estado de la conexión y uso de hoy
router.get('/admin-status', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE generated = 1)::int AS generated, COUNT(*) FILTER (WHERE generated = 0)::int AS reused
       FROM ai_renders WHERE created_at > NOW() - INTERVAL '1 day'`);
    res.json({ key: !!process.env.GEMINI_API_KEY, model: MODEL, today: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Público: genera (o reutiliza) la foto referencial de una combinación
router.post('/render', async (req, res) => {
  try {
    const cfg = await siteConfig();
    if (!process.env.GEMINI_API_KEY || cfg.ai_enabled === false) {
      return res.status(503).json({ error: 'La vista con IA no está disponible por ahora.' });
    }
    // { toppings: { "3": 2, "5": 1 } } → ids y cantidades
    const wanted = Object.entries(req.body?.toppings || {})
      .map(([id, qty]) => [parseInt(id), Math.min(8, Math.max(0, parseInt(qty) || 0))])
      .filter(([id, qty]) => id > 0 && qty > 0);
    if (!wanted.length) return res.status(400).json({ error: 'Elige al menos un topping.' });

    const { rows: tops } = await pool.query('SELECT id, name, image FROM toppings WHERE active = 1 AND id = ANY($1)', [wanted.map(w => w[0])]);
    const items = wanted.map(([id, qty]) => ({ ...tops.find(t => t.id === id), qty })).filter(it => it.id && it.image);
    if (!items.length) return res.status(400).json({ error: 'Esos toppings no tienen foto.' });

    const baseUrl = cfg.base_image || '';
    const combo = crypto.createHash('sha1')
      .update(JSON.stringify({ model: MODEL, base: baseUrl, items: items.map(it => [it.id, it.qty, it.image]).sort() }))
      .digest('hex');
    const ip = req.ip || 'desconocida';

    // Combinación ya generada → gratis
    if (!req.body?.fresh) {
      const { rows: cached } = await pool.query('SELECT image_id FROM ai_renders WHERE combo_hash=$1 AND generated = 1 ORDER BY id DESC LIMIT 1', [combo]);
      if (cached[0]) {
        await pool.query('INSERT INTO ai_renders (combo_hash, image_id, ip, generated) VALUES ($1,$2,$3,0)', [combo, cached[0].image_id, ip]);
        return res.json({ url: `/api/site/images/${cached[0].image_id}`, cached: true });
      }
    }

    // Límites diarios (por persona y total)
    const perVisitor = Math.max(1, parseInt(cfg.ai_per_visitor) || 5);
    const daily = Math.max(1, parseInt(cfg.ai_daily_limit) || 60);
    const count = await todayCount(ip);
    if (count.mine >= perVisitor) return res.status(429).json({ error: `Llegaste al máximo de ${perVisitor} vistas con IA por hoy. Igual puedes agregar tu vela al pedido.` });
    if (count.total >= daily) return res.status(429).json({ error: 'Hoy ya se usaron todas las vistas con IA. Igual puedes agregar tu vela al pedido.' });

    const base = (await loadImage(baseUrl)) || { mime: 'image/jpeg', data: fs.readFileSync(DEFAULT_BASE).toString('base64') };
    const refs = [];
    for (const it of items) {
      const img = await loadImage(it.image);
      if (img) refs.push({ it, img });
    }
    const parts = [
      { text: buildPrompt(refs.map(r => r.it)) },
      { inline_data: { mime_type: base.mime, data: base.data } },
      ...refs.map(r => ({ inline_data: { mime_type: r.img.mime, data: r.img.data } })),
    ];

    const out = await callGemini(parts);
    const { rows: saved } = await pool.query('INSERT INTO site_images (mime, data) VALUES ($1,$2) RETURNING id', [out.mime, out.buffer]);
    await pool.query('INSERT INTO ai_renders (combo_hash, image_id, ip, generated) VALUES ($1,$2,$3,1)', [combo, saved[0].id, ip]);
    res.json({ url: `/api/site/images/${saved[0].id}`, cached: false });
  } catch (err) {
    console.error('Arma tu vela IA:', err.message);
    res.status(502).json({ error: err.name === 'AbortError' ? 'La IA tardó demasiado. Intenta de nuevo.' : err.message });
  }
});

module.exports = router;
