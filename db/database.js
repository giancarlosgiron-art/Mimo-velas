const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && /railway\.internal|localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)
    ? false : { rejectUnauthorized: false }
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL, role TEXT DEFAULT 'user', avatar TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, icon TEXT DEFAULT 'sparkles',
      color TEXT DEFAULT '#62121D', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT,
      notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY, sku TEXT UNIQUE, name TEXT NOT NULL, description TEXT,
      category_id INTEGER, supplier_id INTEGER, cost_price REAL DEFAULT 0,
      sale_price REAL DEFAULT 0, price_eur REAL DEFAULT 0,
      compare_price REAL DEFAULT 0, compare_price_eur REAL DEFAULT 0,
      stock INTEGER DEFAULT 0, min_stock INTEGER DEFAULT 5,
      status TEXT DEFAULT 'available', image TEXT, country TEXT DEFAULT 'chile',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS product_variants (
      id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL,
      size TEXT, color TEXT, material TEXT, stock INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, phone TEXT, instagram TEXT,
      email TEXT, birthday TEXT, preferences TEXT, notes TEXT,
      is_vip INTEGER DEFAULT 0, total_spent REAL DEFAULT 0,
      purchase_count INTEGER DEFAULT 0, last_purchase TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY, customer_id INTEGER, user_id INTEGER,
      subtotal REAL DEFAULT 0, discount REAL DEFAULT 0, total REAL NOT NULL,
      payment_method TEXT DEFAULT 'cash', payment_status TEXT DEFAULT 'paid',
      amount_paid REAL DEFAULT 0, balance REAL DEFAULT 0, notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sale_items (
      id SERIAL PRIMARY KEY, sale_id INTEGER NOT NULL, product_id INTEGER,
      product_name TEXT, quantity INTEGER DEFAULT 1, unit_price REAL NOT NULL,
      cost_price REAL DEFAULT 0, discount REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY, customer_id INTEGER, type TEXT DEFAULT 'reservation',
      status TEXT DEFAULT 'pending', subtotal REAL DEFAULT 0, deposit REAL DEFAULT 0,
      total REAL DEFAULT 0, description TEXT, notes TEXT, due_date TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL, product_id INTEGER,
      product_name TEXT, quantity INTEGER DEFAULT 1, unit_price REAL DEFAULT 0, notes TEXT
    );
    CREATE TABLE IF NOT EXISTS stock_movements (
      id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL, type TEXT NOT NULL,
      quantity INTEGER NOT NULL, reference_id INTEGER, notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY, type TEXT DEFAULT 'info', title TEXT NOT NULL,
      message TEXT, link TEXT, is_read INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS product_images (
      product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
      mime TEXT NOT NULL, data BYTEA NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS aromas (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, position INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE products ADD COLUMN IF NOT EXISTS aroma TEXT;
    CREATE TABLE IF NOT EXISTS site_content (
      key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_by TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS site_images (
      id SERIAL PRIMARY KEY, mime TEXT NOT NULL, data BYTEA NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    -- Categorías como colecciones del catálogo: banner, descripción, orden y si salen en el inicio
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS image TEXT;
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS show_home INTEGER DEFAULT 1;
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY, date TEXT NOT NULL, amount REAL NOT NULL,
      description TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Otros',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Aromas disponibles (catálogo "Tu vela, a tu gusto"); se editan desde Inventario → Aromas
  const { rows: ar } = await pool.query('SELECT COUNT(*) as c FROM aromas');
  if (parseInt(ar[0].c) === 0) {
    const aromas = ['Vainilla','Galleta','Cherry','Frutilla','Chocolate','Maracuyá','Mango','Sweet Coffee',
      'Café','Limón','100 aromas','Manzana canela','Mandarina','Toque navideño','Sandía','Jengibre','Cítrico'];
    for (let i = 0; i < aromas.length; i++) {
      await pool.query('INSERT INTO aromas (name, position) VALUES ($1,$2)', [aromas[i], i + 1]);
    }
  }

  const { rows } = await pool.query('SELECT COUNT(*) as c FROM users');
  if (parseInt(rows[0].c) === 0) {
    // Contraseñas iniciales desde variables de entorno (en Railway: GIAN_PASSWORD y LUIS_PASSWORD).
    // Sin variable: en local se usa 'mimo2026'; en producción se genera una al azar y se muestra en los logs
    // (el código es público, así que nunca hay una contraseña fija en producción).
    const isLocal = !process.env.DATABASE_URL || /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
    const initialPassword = (envValue, name) => {
      if (envValue) return envValue;
      if (isLocal) return 'mimo2026';
      const generated = crypto.randomBytes(9).toString('base64url');
      console.log(`⚠️  ${name}: sin variable de contraseña, se generó esta contraseña inicial: ${generated}`);
      return generated;
    };
    const users = [
      ['Gian', process.env.GIAN_EMAIL || 'gian@mimovelas.cl', initialPassword(process.env.GIAN_PASSWORD, 'Gian'), 'admin'],
      ['Luis', process.env.LUIS_EMAIL || 'luis@mimovelas.cl', initialPassword(process.env.LUIS_PASSWORD, 'Luis'), 'admin'],
    ];
    for (const [name, email, pass, role] of users) {
      const hash = await bcrypt.hash(pass, 10);
      await pool.query('INSERT INTO users (name,email,password,role) VALUES ($1,$2,$3,$4)', [name, email, hash, role]);
    }
    const cats = [{name:'Postres',icon:'🍰',color:'#62121D'},{name:'Bebidas',icon:'🍸',color:'#6E734D'},{name:'Aromáticas',icon:'🕯️',color:'#2B1D1F'}];
    for (const c of cats) {
      await pool.query('INSERT INTO categories (name,icon,color) VALUES ($1,$2,$3)', [c.name, c.icon, c.color]);
    }
    console.log('PostgreSQL inicializado correctamente');
  }
}

initSchema().catch(err => console.error('Error DB:', err.message));

pool.pool = pool;
module.exports = pool;
