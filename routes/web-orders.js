const express = require('express');
const router = express.Router();
const pool = require('../db/database');

// Pedidos que llegan desde el catálogo al tocar "Pedir por WhatsApp".
// Quedan en el panel (Pedidos) como "Pedido web", con su número, para cruzarlos con el WhatsApp.
// Los precios de las velas se recalculan aquí con los del inventario (no se confía en el navegador).

// Límite simple contra abusos: 10 pedidos por hora por IP
const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 3600_000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 10;
}

const clip = (v, n) => String(v ?? '').trim().slice(0, n);

router.post('/', async (req, res) => {
  try {
    if (tooMany(req.ip || 'x')) return res.status(429).json({ error: 'Demasiados pedidos seguidos. Intenta en un rato.' });
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 30) : [];
    if (!items.length) return res.status(400).json({ error: 'El pedido está vacío' });

    const ids = items.map(i => parseInt(i.id)).filter(id => id > 0);
    const { rows: products } = ids.length
      ? await pool.query('SELECT id, name, sale_price, formats FROM products WHERE id = ANY($1)', [ids])
      : { rows: [] };

    const lines = [];
    for (const it of items) {
      const qty = Math.min(50, Math.max(1, parseInt(it.quantity) || 1));
      const id = parseInt(it.id);
      const product = products.find(p => p.id === id);
      // Velas del inventario: precio del sistema. "Arma tu vela" (id -1): precio calculado en la página, acotado.
      // Si tiene formatos (ej. 4 o 6 figuras), vale el precio del formato elegido
      const format = product && Array.isArray(product.formats) ? product.formats.find(f => f.name === it.format) : null;
      const price = format ? Number(format.price)
        : product ? Number(product.sale_price) : Math.min(500000, Math.max(0, parseInt(it.price) || 0));
      const name = product ? product.name : clip(it.name, 120) || 'Vela';
      const details = clip(it.details, 300);
      // Paquetes donde el cliente eligió varios aromas: ya vienen en el detalle
      const aromaNote = it.aroma ? `Aroma: ${clip(it.aroma, 60)}` : /Aromas:/.test(details) ? '' : 'Aroma a elección';
      const notes = [aromaNote, details].filter(Boolean).join(' · ');
      lines.push({ product_id: product ? product.id : null, name, qty, price, notes });
    }

    const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const description = lines.map(l => `${l.qty} × ${l.name} (${l.notes})`).join('\n');
    const contact = clip(req.body.name, 80);
    // WhatsApp del cliente (por si su mensaje no llega) y cómo quiere pagar
    const phone = clip(req.body.phone, 40).replace(/[^\d+ ()-]/g, '');
    const payment = clip(req.body.payment, 60);
    const { rows } = await pool.query(
      `INSERT INTO orders (type, status, subtotal, total, deposit, description, notes, contact_name, source, contact_phone, payment_method)
       VALUES ('web','pending',$1,$1,0,$2,$3,$4,'catalogo',$5,$6) RETURNING id`,
      [total, description, clip(req.body.note, 500), contact || null, phone || null, payment || null]);
    const orderId = rows[0].id;
    for (const l of lines) {
      await pool.query('INSERT INTO order_items (order_id,product_id,product_name,quantity,unit_price,notes) VALUES ($1,$2,$3,$4,$5,$6)',
        [orderId, l.product_id, l.name, l.qty, l.price, l.notes]);
    }
    await pool.query('INSERT INTO notifications (type,title,message,link) VALUES ($1,$2,$3,$4)',
      ['info', `🛍️ Pedido web #${orderId}`, `${contact || 'Cliente del catálogo'} · ${lines.length} ${lines.length === 1 ? 'vela' : 'velas'}`, '/orders']);
    res.status(201).json({ id: orderId, total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
