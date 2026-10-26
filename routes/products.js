const express = require('express');
const router = express.Router();
const path = require('path');
const pool = require('../db/database').pool || require('../db/database');
const { upload, saveProductImage } = require('../middleware/upload');
const jwt = require('jsonwebtoken');
const JWT_SECRET = require('../middleware/secret');
const { authMiddleware } = require('../middleware/auth');

// El catálogo público consulta sin token: no debe ver costos, márgenes ni proveedores
function isStaff(req) {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return false;
  try { jwt.verify(token, JWT_SECRET); return true; } catch { return false; }
}
const PRIVATE_FIELDS = ['cost_price', 'margin', 'profit', 'supplier_id', 'supplier_name', 'movements'];
// Listas que llegan como JSON (formulario con foto) o arreglo: figuras del wax melt, aromas posibles
function parseList(v) {
  if (v === undefined) return undefined;
  let arr = v;
  if (typeof v === 'string') { try { arr = JSON.parse(v); } catch { arr = v.split(/\n|,/); } }
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  return arr.map(x => String(x || '').trim().slice(0, 80)).filter(x => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())).slice(0, 40);
}
// En una edición, un número que no llega se mantiene (parseFloat(undefined) daría NaN → precio vacío)
// Formatos con precio propio, ej. [{ name: '4 figuras', price: 10990 }, { name: '6 figuras', price: 13990 }]
function parseFormats(v) {
  if (v === undefined) return undefined;
  let arr = v;
  if (typeof v === 'string') { try { arr = JSON.parse(v); } catch { return []; } }
  if (!Array.isArray(arr)) return [];
  return arr.map(f => {
    const name = String(f?.name || '').trim().slice(0, 60);
    // Cuántas figuras elige el cliente en este formato (si no viene, el número del nombre: "6 figuras" → 6)
    const count = Math.min(24, Math.max(0, parseInt(f?.count) || parseInt((name.match(/\d+/) || [])[0]) || 0));
    return { name, price: Math.max(0, Math.round(parseFloat(f?.price) || 0)), count };
  })
    .filter(f => f.name).slice(0, 10);
}
function numOr(v, fallback) { const n = parseFloat(v); return Number.isFinite(n) ? n : (v === undefined ? fallback : 0); }
function publicView(p) { const o = { ...p }; PRIVATE_FIELDS.forEach(f => delete o[f]); return o; }



router.get('/', async (req, res) => {
  try {
    const { search, category, status, country, admin, sort='name', order='ASC' } = req.query;
    const params=[]; let i=0;
    let q=`SELECT p.*,c.name as category_name,c.icon as category_icon,c.color as category_color,s.name as supplier_name FROM products p LEFT JOIN categories c ON p.category_id=c.id LEFT JOIN suppliers s ON p.supplier_id=s.id WHERE 1=1`;
    if (search) { q+=` AND (p.name ILIKE $${++i} OR p.sku ILIKE $${i} OR p.description ILIKE $${i})`; params.push('%'+search+'%'); }
    if (category) { q+=` AND p.category_id=$${++i}`; params.push(category); }
    if (status)   { q+=` AND p.status=$${++i}`;      params.push(status); }
    else if (!admin) { q+=` AND p.status != 'out_of_stock'`; }
    if (country)  { q+=` AND (LOWER(p.country)=LOWER($${++i}) OR p.country='both')`; params.push(country); }
    // Categorías apagadas (Mi página → Categorías): sus productos no se ven en la página pública
    const staff = isStaff(req);
    if (!staff) q+=` AND (c.id IS NULL OR COALESCE(c.active,1)=1)`;
    const sc={name:'p.name',price:'p.sale_price',stock:'p.stock',created:'p.created_at'};
    q+=` ORDER BY ${sc[sort]||'p.name'} ${order==='DESC'?'DESC':'ASC'}`;
    const { rows } = await pool.query(q, params);
    rows.forEach(p=>{ p.margin=p.cost_price>0?(((p.sale_price-p.cost_price)/p.sale_price)*100).toFixed(1):0; p.profit=(p.sale_price-p.cost_price).toFixed(2); });
    res.json(staff ? rows : rows.map(publicView));
  } catch (err) { const msg = err.message.includes('products_sku_key') ? 'El SKU ingresado ya existe. Por favor usa un SKU diferente.' : err.message; res.status(500).json({ error: msg }); }
});

router.get('/categories', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM categories ORDER BY position, id');
    res.json(isStaff(req) ? rows : rows.filter(c => c.active !== 0));
  } catch (err) { const msg = err.message.includes('products_sku_key') ? 'El SKU ingresado ya existe. Por favor usa un SKU diferente.' : err.message; res.status(500).json({ error: msg }); }
});

router.post('/categories', authMiddleware, async (req, res) => {
  try {
    const { name, icon, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const { rows } = await pool.query('INSERT INTO categories (name,icon,color,position) VALUES ($1,$2,$3,(SELECT COALESCE(MAX(position),0)+1 FROM categories)) RETURNING *',[name.trim(),icon||'🕯️',color||'#62121D']);
    res.status(201).json(rows[0]);
  } catch (err) { const msg = err.message.includes('products_sku_key') ? 'El SKU ingresado ya existe. Por favor usa un SKU diferente.' : err.message; res.status(500).json({ error: msg }); }
});

router.put('/categories/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM categories WHERE id=$1',[req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Categoria no encontrada' });
    const c = rows[0];
    const { name, icon, color, description, image, position, show_home, active, care_mode, care_title, care_text, care_note, product_note } = req.body;
    const txt = (v, old, max) => v !== undefined ? String(v || '').trim().slice(0, max) : (old || '');
    await pool.query('UPDATE categories SET name=$1,icon=$2,color=$3,description=$4,image=$5,position=$6,show_home=$7,care_mode=$9,care_title=$10,care_text=$11,care_note=$12,product_note=$13,active=$14 WHERE id=$8',[
      (name||'').trim()||c.name, icon||c.icon, color||c.color,
      description!==undefined ? String(description).trim().slice(0,600) : c.description,
      image!==undefined ? (image||null) : c.image,
      position!==undefined ? parseInt(position)||0 : c.position,
      show_home!==undefined ? (show_home ? 1 : 0) : c.show_home,
      req.params.id,
      // Tarjeta de cuidado en la ficha: 'general' (la de Mi página → Cuidado), 'custom' (propia) o 'hidden'
      ['general', 'custom', 'hidden'].includes(care_mode) ? care_mode : (c.care_mode || 'general'),
      txt(care_title, c.care_title, 80), txt(care_text, c.care_text, 600), txt(care_note, c.care_note, 160),
      txt(product_note, c.product_note, 300),
      active!==undefined ? (active ? 1 : 0) : (c.active ?? 1)]);
    res.json({ message: 'Categoria actualizada' });
  } catch (err) { const msg = err.message.includes('products_sku_key') ? 'El SKU ingresado ya existe. Por favor usa un SKU diferente.' : err.message; res.status(500).json({ error: msg }); }
});

router.delete('/categories/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE products SET category_id=NULL WHERE category_id=$1',[req.params.id]);
    await pool.query('DELETE FROM categories WHERE id=$1',[req.params.id]);
    res.json({ message: 'Categoria eliminada' });
  } catch (err) { const msg = err.message.includes('products_sku_key') ? 'El SKU ingresado ya existe. Por favor usa un SKU diferente.' : err.message; res.status(500).json({ error: msg }); }
});

router.get('/top', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT p.id,p.name,p.image,p.sku,p.sale_price,c.name as category_name,SUM(si.quantity)::int as quantity
      FROM sale_items si JOIN products p ON p.id=si.product_id LEFT JOIN categories c ON p.category_id=c.id
      WHERE p.status != 'out_of_stock' AND (c.id IS NULL OR COALESCE(c.active,1)=1) GROUP BY p.id,c.name ORDER BY quantity DESC LIMIT 8`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/image', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT mime,data FROM product_images WHERE product_id=$1',[req.params.id]);
    if (!rows[0]) return res.status(404).end();
    res.set('Content-Type', rows[0].mime);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(rows[0].data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT p.*,c.name as category_name,c.care_mode as category_care_mode,c.care_title as category_care_title,c.care_text as category_care_text,c.care_note as category_care_note,c.product_note as category_product_note,c.active as category_active,s.name as supplier_name FROM products p LEFT JOIN categories c ON p.category_id=c.id LEFT JOIN suppliers s ON p.supplier_id=s.id WHERE p.id=$1`,[req.params.id]);
    if (!rows[0] || (rows[0].category_active === 0 && !isStaff(req))) return res.status(404).json({ error: 'Producto no encontrado' });
    const { rows: v } = await pool.query('SELECT * FROM product_variants WHERE product_id=$1',[rows[0].id]);
    const { rows: m } = await pool.query('SELECT * FROM stock_movements WHERE product_id=$1 ORDER BY created_at DESC LIMIT 10',[rows[0].id]);
    rows[0].variants=v; rows[0].movements=m;
    res.json(isStaff(req) ? rows[0] : publicView(rows[0]));
  } catch (err) { const msg = err.message.includes('products_sku_key') ? 'El SKU ingresado ya existe. Por favor usa un SKU diferente.' : err.message; res.status(500).json({ error: msg }); }
});

router.post('/', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { name, description, category_id, supplier_id, cost_price, sale_price, price_eur, compare_price, compare_price_eur, stock, min_stock, country, aroma, options_label, options, allowed_aromas, formats, pick_mode } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const { rows: ls } = await pool.query("SELECT sku FROM products WHERE sku ~ '^MIMO-[0-9]+$'");
    const nums = ls.map(r => { const m=r.sku.match(/MIMO-(\d+)/); return m?parseInt(m[1]):0; });
    const n = nums.length ? Math.max(...nums)+1 : 1;
    const sku='MIMO-'+String(n).padStart(3,'0');
    const si=parseInt(stock)||0, mi=parseInt(min_stock)||5;
    const st=si===0?'out_of_stock':si<=mi?'low_stock':'available';
    const { rows } = await pool.query(`INSERT INTO products (sku,name,description,category_id,supplier_id,cost_price,sale_price,price_eur,compare_price,compare_price_eur,stock,min_stock,status,image,country,aroma,options_label,options,allowed_aromas,formats,pick_mode) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
      [sku,name,description||'',category_id||null,supplier_id||null,parseFloat(cost_price)||0,parseFloat(sale_price)||0,parseFloat(price_eur)||0,parseFloat(compare_price)||0,parseFloat(compare_price_eur)||0,si,mi,st,null,country||'chile',(aroma||'').trim()||null,(options_label||'').trim().slice(0,40)||null,parseList(options)||[],parseList(allowed_aromas)||[],JSON.stringify(parseFormats(formats)||[]),pick_mode==='options'?'options':'aromas']);
    const pid=rows[0].id;
    if (req.file) await pool.query('UPDATE products SET image=$1 WHERE id=$2',[await saveProductImage(pid, req.file), pid]);
    if (si>0) await pool.query('INSERT INTO stock_movements (product_id,type,quantity,notes) VALUES ($1,$2,$3,$4)',[pid,'purchase',si,'Stock inicial']);
    res.status(201).json({ id:pid, sku, message:'Producto creado' });
  } catch (err) { const msg = err.message.includes('products_sku_key') ? 'El SKU ingresado ya existe. Por favor usa un SKU diferente.' : err.message; res.status(500).json({ error: msg }); }
});

router.put('/:id', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE id=$1',[req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });
    const p=rows[0];
    const { name, description, category_id, supplier_id, cost_price, sale_price, price_eur, compare_price, compare_price_eur, stock, min_stock, country, aroma, options_label, options, allowed_aromas, formats, pick_mode, sku: skuInput } = req.body;
    const ns=stock!==undefined?parseInt(stock):p.stock, nm=min_stock!==undefined?parseInt(min_stock):p.min_stock;
    const st=ns===0?'out_of_stock':ns<=nm?'low_stock':'available';
    const img=req.file ? await saveProductImage(p.id, req.file) : p.image;
    await pool.query(`UPDATE products SET name=$1,description=$2,category_id=$3,supplier_id=$4,cost_price=$5,sale_price=$6,price_eur=$7,compare_price=$8,compare_price_eur=$9,stock=$10,min_stock=$11,status=$12,image=$13,country=$14,sku=$16,aroma=$17,options_label=$18,options=$19,allowed_aromas=$20,formats=$21,pick_mode=$22 WHERE id=$15`,
      [name||p.name,description??p.description,category_id??p.category_id,supplier_id??p.supplier_id,numOr(cost_price,p.cost_price),numOr(sale_price,p.sale_price),numOr(price_eur,p.price_eur),numOr(compare_price,p.compare_price),numOr(compare_price_eur,p.compare_price_eur),ns,nm,st,img,country||p.country,req.params.id,skuInput!==undefined&&skuInput!==''?skuInput:p.sku,aroma!==undefined?((aroma||'').trim()||null):p.aroma,options_label!==undefined?((options_label||'').trim().slice(0,40)||null):p.options_label,parseList(options)??p.options,parseList(allowed_aromas)??p.allowed_aromas,JSON.stringify(parseFormats(formats)??p.formats??[]),pick_mode!==undefined?(pick_mode==='options'?'options':'aromas'):(p.pick_mode||'aromas')]);
    if (stock!==undefined&&parseInt(stock)!==p.stock) {
      const diff=parseInt(stock)-p.stock;
      await pool.query('INSERT INTO stock_movements (product_id,type,quantity,notes) VALUES ($1,$2,$3,$4)',[p.id,diff>0?'adjustment_in':'adjustment_out',Math.abs(diff),'Ajuste manual']);
    }
    res.json({ message:'Producto actualizado' });
  } catch (err) { const msg = err.message.includes('products_sku_key') ? 'El SKU ingresado ya existe. Por favor usa un SKU diferente.' : err.message; res.status(500).json({ error: msg }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE id=$1',[req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });
    await pool.query('DELETE FROM products WHERE id=$1',[req.params.id]);
    res.json({ message:'Producto eliminado' });
  } catch (err) { const msg = err.message.includes('products_sku_key') ? 'El SKU ingresado ya existe. Por favor usa un SKU diferente.' : err.message; res.status(500).json({ error: msg }); }
});

module.exports = router;
