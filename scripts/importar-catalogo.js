#!/usr/bin/env node
// Carga las 12 velas del catálogo impreso (con foto) en un sistema mimo ya publicado.
// Uso:  node scripts/importar-catalogo.js https://tu-app-mimo-velas.up.railway.app
// Pide correo y contraseña de Gian o Luis. Las velas que ya existan (mismo nombre) se saltan.
// El costo queda en 0 para que lo completen en Inventario.

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const VELAS = [
  // nombre, colección, aroma ('' = a elección), precio, foto, descripción
  ['Lata dorada',        'Aromáticas', '',          17990, 'lata_dorada',   'Vela aromática en lata dorada con tapa.'],
  ['Vaso negro',         'Aromáticas', '',          12990, 'vaso_negro',    'Vela aromática en vaso negro.'],
  ['Raspberry Cream',    'Postres',    'Frutilla',  13990, 'raspberry',     ''],
  ['Red Velvet Cake',    'Postres',    'Frutilla',  13990, 'red_velvet',    ''],
  ['Abundancia Cítrica', 'Aromáticas', 'Cítrico',    9990, 'abundancia',    ''],
  ['White Romance',      'Aromáticas', 'Cítrico',    9990, 'white_romance', ''],
  ['Matcha Cloud',       'Postres',    'Vainilla',  11990, 'matcha_cloud',  ''],
  ['Matcha Cake',        'Postres',    'Vainilla',  11990, 'matcha_cake',   ''],
  ['Iced Matcha-Mango',  'Bebidas',    'Mango',     12990, 'matcha_mango',  ''],
  ['Blueberry Cloud',    'Postres',    'Galleta',   11990, 'blueberry',     ''],
  ['Watermelon Sugar',   'Postres',    'Sandía',    11990, 'watermelon',    ''],
  ['Mandarín Martini',   'Bebidas',    'Mandarina', 16990, 'martini',       ''],
];

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer.trim()); }));
}

async function main() {
  const base = (process.argv[2] || '').replace(/\/$/, '');
  if (!/^https?:\/\//.test(base)) {
    console.log('Uso: node scripts/importar-catalogo.js https://tu-app-mimo-velas.up.railway.app');
    process.exit(1);
  }

  const email = await ask('Correo (Gian o Luis): ');
  const password = await ask('Contraseña: ');
  const stockAnswer = await ask('¿Cuántas unidades de cada vela tienen hoy? (Enter = 3): ');
  const stock = parseInt(stockAnswer) >= 0 && stockAnswer !== '' ? parseInt(stockAnswer) : 3;

  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  if (!login.ok) { console.log('✗ Correo o contraseña incorrectos'); process.exit(1); }
  const { token } = await login.json();
  const auth = { Authorization: `Bearer ${token}` };

  // Colecciones: usa las existentes o las crea
  const categories = await (await fetch(`${base}/api/products/categories`)).json();
  const colors = { 'Postres': ['🍰', '#62121D'], 'Bebidas': ['🍸', '#6E734D'], 'Aromáticas': ['🕯️', '#2B1D1F'] };
  async function categoryId(name) {
    let cat = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (!cat) {
      const [icon, color] = colors[name];
      const res = await fetch(`${base}/api/products/categories`, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, icon, color }),
      });
      cat = await res.json();
      categories.push(cat);
    }
    return cat.id;
  }

  const existing = await (await fetch(`${base}/api/products?admin=1`, { headers: auth })).json();
  for (const [name, coleccion, aroma, price, foto, description] of VELAS) {
    if (existing.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      console.log(`· ${name}: ya existe, se salta`);
      continue;
    }
    const form = new FormData();
    const fields = { name, aroma, description, category_id: await categoryId(coleccion), sale_price: price, cost_price: 0, stock, min_stock: 2 };
    Object.entries(fields).forEach(([k, v]) => form.append(k, String(v)));
    const file = fs.readFileSync(path.join(__dirname, 'catalogo-inicial', `${foto}.jpg`));
    form.append('image', new Blob([file], { type: 'image/jpeg' }), `${foto}.jpg`);
    const res = await fetch(`${base}/api/products`, { method: 'POST', headers: auth, body: form });
    console.log(res.ok ? `✓ ${name}` : `✗ ${name}: ${(await res.json()).error}`);
  }
  console.log('\nListo. Revisen costos y stock en Inventario.');
}

main().catch(err => { console.error(err); process.exit(1); });
