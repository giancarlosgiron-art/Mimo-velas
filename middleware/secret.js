const crypto = require('crypto');

// Clave para firmar las sesiones (JWT). En Railway debe estar JWT_SECRET.
// Sin ella: en local se usa una fija de desarrollo; en producción se genera una al azar al arrancar
// (el código es público, nunca debe haber una clave conocida). Las sesiones se cierran si el servidor se reinicia.
const isLocal = !process.env.DATABASE_URL || /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
let secret = process.env.JWT_SECRET;
if (!secret) {
  secret = isLocal ? 'mimo_dev_secret' : crypto.randomBytes(32).toString('hex');
  if (!isLocal) console.log('⚠️  Falta JWT_SECRET: se usará una clave temporal (las sesiones se cerrarán al reiniciar).');
}

module.exports = secret;
