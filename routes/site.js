const express = require('express');
const router = express.Router();
const pool = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

// Contenido editable de la página pública (catálogo): textos, cinta superior, colores y tipografías.
// Se edita en el panel → "Mi página". Cada bloque se guarda por separado en site_content (key → JSON).
// Los valores por defecto son los textos actuales del catálogo: si un bloque nunca se editó, se usan estos.

const FONTS_DISPLAY = ['fraunces', 'playfair', 'dmserif', 'cormorant', 'lora'];
const FONTS_BODY = ['mulish', 'nunito', 'dmsans', 'worksans', 'quicksand'];
const HEX = /^#[0-9a-fA-F]{6}$/;

const DEFAULTS = {
  diseno: {
    primary: '#62121D',     // Borgoña: titulares, botones, bloques principales
    secondary: '#6E734D',   // Verde: segunda colección, detalles
    background: '#F0EEE9',  // Crema: fondo de la página
    ink: '#2B1D1F',         // Tinta: texto
    soft1: '#D9CBC8',       // Rosa polvo: fondos suaves
    soft2: '#D6D5CA',       // Pistacho: fondos suaves
    font_display: 'fraunces',
    font_body: 'mulish',
    motion: true,           // animaciones y efectos en movimiento
  },
  general: {
    site_title: 'mimo — Velas aromáticas hechas a mano',
    site_description: 'Velas aromáticas de soja hechas a mano en Santiago. Elige el diseño y el aroma. Hecho con mimo.',
    whatsapp: '56976720121',
    whatsapp_label: '+56 9 7672 0121',
    instagram: '',          // usuario de Instagram, sin @ (ej: mimo.velas)
  },
  cinta: {
    enabled: true,
    items: ['Hecho a mano en Santiago', 'Pedidos por WhatsApp', 'El aroma lo eliges tú', 'Cera de soja', 'Tandas chicas', 'Un detalle que huele y se ve bien'],
  },
  portada: {
    eyebrow: 'Velas aromáticas · Hechas a mano en Santiago',
    title: 'Un detalle que huele y se ve bien.',
    text: 'Velas de soja hechas a mano, en tandas chicas. Algunas parecen postres o tragos, otras son simples y elegantes. Tú eliges el diseño y el aroma.',
    cta_label: 'Ver las velas',
    link_label: 'Cómo pedir',
    // Lo que rota en la burbuja: fotos propias + velas elegidas. Si no hay nada, las más vendidas/nuevas.
    slides: [],
    product_ids: [],
    sticker_label: '',      // texto chico de la etiqueta flotante. Vacío = la categoría de cada vela
    verde: false,           // fondo con el verde de la marca en vez del borgoña
    vitrina: false,         // estilo "Vitrina": velas sin fondo sobre una ola de cera (en vez de la burbuja)
  },
  catalogo: {
    home_eyebrow: 'El catálogo',
    home_title: 'Un aroma para cada espacio.',
    page_eyebrow: 'Catálogo · Velas aromáticas',
    page_title: 'Detalles para regalarte.',
    footnote: 'Precios en pesos chilenos · Velas decorativas, no comestibles.',
  },
  frases: {
    items: [
      { eyebrow: 'Para regalar', text: 'Detalles para regalarte.' },
      { eyebrow: '', text: 'El diseño enamora. El aroma lo eliges tú.' },
      { eyebrow: 'Hecho con mimo', text: 'Un mimo para alguien que se lo merece.' },
      { eyebrow: 'Cera de soja', text: 'Hechas a mano, en tandas chicas.' },
    ],
  },
  tu_gusto: {
    title: 'Tu vela,\na tu gusto.',
    text: 'Elige el diseño que más te guste. Podemos hacerlo con cualquiera de nuestros aromas disponibles.',
    list_title: 'Aromas disponibles',
    band_title: 'El diseño enamora.\nEl aroma lo eliges tú.',
    band_text: 'Pedidos personalizados por encargo.',
    cta_label: 'Encargar por WhatsApp',
    // Reemplaza la lista de aromas: invitación a pedir algo personalizado
    message: '¿Quieres una vela personalizada o tienes un evento y buscas un detalle especial? Escríbenos por WhatsApp y lo creamos para ti.',
    button_label: 'Escríbenos por WhatsApp',
    whatsapp_text: '¡Hola mimo! Quiero una vela personalizada 🕯️',
    verde: false,           // franja y botón con el verde de la marca
  },
  como_pedir: {
    eyebrow: 'Cómo pedir',
    title: 'Tres pasos y es tuya',
    steps: [
      { title: 'Elige tu vela', text: 'Mira el catálogo, elige el diseño y el aroma, y súmala a tu pedido con el botón +.' },
      { title: 'Envíalo por WhatsApp', text: 'Tu pedido llega armado a nuestro WhatsApp, con velas, aromas, cantidades y total.' },
      { title: 'Te confirmamos', text: 'Te respondemos con la disponibilidad y coordinamos juntos el pago y la entrega.' },
    ],
  },
  cuidado: {
    eyebrow: 'Cuidado',
    title: 'Cómo cuidar tu vela',
    text: 'Algunas parecen postres o tragos, pero todas son velas decorativas: ninguna se come.',
    steps: [
      { title: 'El primer encendido es el más importante', text: 'Déjala encendida hasta que la cera se derrita de borde a borde. Así no se hace un túnel y la disfrutas entera.' },
      { title: 'Corta la mecha a 5 mm', text: 'Antes de cada uso. La llama queda estable, no humea y el aroma se siente mejor.' },
      { title: 'Siempre a la vista', text: 'No la dejes encendida sin supervisión. Mantenla lejos de niños, mascotas y cortinas.' },
    ],
    card_title: 'Para que dure más',
    card_text: 'Corta la mecha a 5 mm antes de cada uso y no la dejes encendida sin supervisión. Mantenla lejos de niños y mascotas.',
    card_note: 'Vela decorativa. No comestible.',
    product_note: 'El diseño enamora, el aroma lo eliges tú. Pedidos personalizados por encargo.',
  },
  banners: {
    // Banners de ocasiones especiales: arriba del inicio, solo los activos. Este de ejemplo viene apagado.
    items: [
      { active: false, eyebrow: 'Edición limitada', title: 'Navidad con mimo', text: 'Velas de temporada para regalar y regalarte.', cta_label: 'Ver colección', link: '', image: '', product_ids: [] },
    ],
  },
  destacados: {
    eyebrow: 'Favoritos',
    title: 'Los más vendidos',
    product_ids: [],        // elegidos y ordenados en el panel
    auto: true,             // si faltan, completar con los más vendidos reales
  },
  arma_tu_vela: {
    enabled: false,         // se muestra en la página cuando esté listo
    eyebrow: 'Nuevo',
    title: 'Arma tu vela',
    text: 'Elige el aroma y decórala con tus toppings favoritos. La hacemos a mano para ti.',
    base_name: 'Lata dorada',
    base_price: '17990',    // precio de la lata con su aroma (en pesos, sin puntos)
    base_image: '',         // foto de la lata para el carrito (en la página la lata es un dibujo)
    max_toppings: '5',
    note: 'Los toppings son decorativos y no tienen aroma. Vela decorativa, no comestible.',
  },
  pagos: {
    // Medios de pago que el cliente elige en el carrito (llegan al WhatsApp y al panel)
    enabled: true,
    methods: ['Transferencia', 'Efectivo al retirar'],
    transfer_info: '',      // datos de transferencia: se muestran después de enviar el pedido
  },
  etiquetas: {
    // Etiquetas sobre las fotos de las velas en el catálogo
    nueva: true,
    nueva_dias: '14',       // cuántos días una vela cuenta como "Nueva"
    mas_pedida: true,
    poco_stock: true,
    oferta: true,
  },
  pie: {
    tagline: 'Un detalle que huele y se ve bien.',
    location: 'Hecho a mano en Santiago, Chile',
    note: 'Vela decorativa. No comestible.',
  },
};

// Forma de cada elemento en las listas que por defecto vienen vacías
const ITEM_MODELS = {
  'portada.slides': { image: '', eyebrow: '', title: '', subtitle: '', link: '' },
};

// Limpia lo que llega usando el valor por defecto como "molde":
// solo se guardan los campos conocidos, con el tipo correcto y largo razonable.
function sanitize(value, model, path) {
  if (typeof model === 'boolean') return value === undefined ? model : !!value;
  if (typeof model === 'string') {
    if (value === undefined || value === null) return model;
    const s = String(value).replace(/\r\n/g, '\n').trim().slice(0, 2000);
    if (HEX.test(model)) {
      if (!HEX.test(s)) throw new Error(`Color inválido en "${path}"`);
      return s.toUpperCase();
    }
    if (path === 'diseno.font_display' && !FONTS_DISPLAY.includes(s)) throw new Error('Tipografía de títulos inválida');
    if (path === 'diseno.font_body' && !FONTS_BODY.includes(s)) throw new Error('Tipografía de texto inválida');
    return s;
  }
  if (Array.isArray(model)) {
    if (!Array.isArray(value)) return model;
    const item = model.length ? model[0] : (ITEM_MODELS[path] ?? '');
    return value.slice(0, /product_ids$/.test(path) ? 80 : 20).map((v, i) => sanitize(v, item, `${path}[${i}]`))
      .filter(v => typeof v === 'string' ? v !== '' : true);
  }
  if (model && typeof model === 'object') {
    const src = value && typeof value === 'object' ? value : {};
    const out = {};
    for (const k of Object.keys(model)) out[k] = sanitize(src[k], model[k], `${path}.${k}`);
    return out;
  }
  return model;
}

// Imágenes de banners (inicio y categorías), guardadas en la base como las fotos de productos
router.post('/images', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    if (!req.file || !/^image\//.test(req.file.mimetype)) return res.status(400).json({ error: 'Sube una imagen (JPG, PNG o WebP)' });
    const { rows } = await pool.query('INSERT INTO site_images (mime, data) VALUES ($1,$2) RETURNING id', [req.file.mimetype, req.file.buffer]);
    res.status(201).json({ url: `/api/site/images/${rows[0].id}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/images/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT mime, data FROM site_images WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).end();
    res.set('Content-Type', rows[0].mime);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(rows[0].data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Público: todo el contenido, con los valores por defecto donde no haya nada guardado
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, data FROM site_content');
    const saved = Object.fromEntries(rows.map(r => [r.key, r.data]));
    const out = {};
    for (const key of Object.keys(DEFAULTS)) {
      try { out[key] = sanitize(saved[key], DEFAULTS[key], key); } catch { out[key] = DEFAULTS[key]; }
    }
    res.set('Cache-Control', 'no-store');
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Los valores originales, para el botón "Restaurar" del panel
router.get('/defaults', authMiddleware, (req, res) => res.json(DEFAULTS));

router.put('/:key', authMiddleware, async (req, res) => {
  const key = req.params.key;
  if (!DEFAULTS[key]) return res.status(404).json({ error: 'Sección no encontrada' });
  let data;
  try { data = sanitize(req.body, DEFAULTS[key], key); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  try {
    await pool.query(
      `INSERT INTO site_content (key, data, updated_by, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`,
      [key, JSON.stringify(data), req.user.name]
    );
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
