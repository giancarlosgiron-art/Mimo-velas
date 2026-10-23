const multer = require('multer');
const pool = require('../db/database');

// Multer en memoria (no guarda en disco)
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Las fotos se guardan en PostgreSQL (tabla product_images): no hace falta Cloudinary.
// Devuelve la ruta pública de la imagen; el "?v=" evita que el navegador muestre una foto vieja.
async function saveProductImage(productId, file) {
  await pool.query(
    `INSERT INTO product_images (product_id, mime, data, updated_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)
     ON CONFLICT (product_id) DO UPDATE SET mime=EXCLUDED.mime, data=EXCLUDED.data, updated_at=CURRENT_TIMESTAMP`,
    [productId, file.mimetype || 'image/jpeg', file.buffer]
  );
  return `/api/products/${productId}/image?v=${Date.now()}`;
}

module.exports = { upload, saveProductImage };
