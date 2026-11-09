// Mimito — el asesor de negocio de mimo, viviendo dentro del panel.
// El cerebro es el CLI de Claude Code (la suscripción de Gian, vía CLAUDE_CODE_OAUTH_TOKEN en Railway).
const express = require('express');
const router = express.Router();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
const pool = require('../db/database');
const JWT_SECRET = require('../middleware/secret');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { BASE } = require('../services/mimito/config');
const datos = require('../services/mimito/datos');

const MODEL = process.env.MIMITO_MODEL || 'sonnet';
const ARCHIVOS = ['MIMO.md', 'manual_de_marca.txt', 'costos_y_precios.txt']; // conocimiento fijo (se guarda en la base: el repo es público)

function claudeBin() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  try { return path.join(path.dirname(require.resolve('@anthropic-ai/claude-code/package.json')), 'bin', 'claude.exe'); }
  catch { return 'claude'; }
}

// ── Conocimiento: de la base a la carpeta donde trabaja Mimito ──
let conocimientoCache = null;
async function cargarConocimiento() {
  const { rows } = await pool.query("SELECT value FROM app_settings WHERE key='mimito_conocimiento'");
  const files = rows[0]?.value?.files || {};
  const json = JSON.stringify(files);
  if (json !== conocimientoCache) {
    for (const n of ARCHIVOS) {
      const f = path.join(BASE, n);
      if (files[n]) fs.writeFileSync(f, files[n]); else if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    conocimientoCache = json;
  }
  return files;
}

function systemPrompt(ficha) {
  const hoy = new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Santiago' });
  return `Eres Mimito, el asesor de negocio de mimo (velas de soja artesanales de Gian y Luis, Santiago de Chile). Vives dentro del panel administrativo de mimo.
Eres su asesor de marketing, asesor comercial y encargado de inventario: conoces el negocio entero y lo cuidas como si fuera tuyo.
Personalidad: cálido, cercano, un poquito juguetón, pero directo y práctico. Hablas español de Chile neutro, de tú.

CÓMO RESPONDES (te escuchan por voz):
- Lo que escribes fuera de <pantalla> se lee EN VOZ ALTA: corto (1 a 4 frases), natural, sin markdown, viñetas, emojis, URLs ni símbolos raros. Di los montos como se dicen ("catorce mil novecientos noventa pesos").
- Cuando entregues algo para leer o copiar (un caption, un guion de reel, un plan, una tabla, un mensaje de WhatsApp para clientes, una lista de compras), ponlo entre <pantalla> y </pantalla>. Eso se muestra en pantalla y NO se lee. Antes, di en voz una frase que lo presente ("Te dejé tres captions en pantalla").
- Da recomendaciones concretas con números reales de mimo, no consejos genéricos. Si algo es una suposición, dilo.
- Si te falta un dato, búscalo en tus archivos antes de decir que no sabes. Si de verdad no está, pregúntalo.
- Nunca inventes ventas, stock ni precios: salen de los datos en vivo.
- Escribe para mimo con la voz de la marca: cálida, golosa, cuidada; sin texto de relleno ni frases que suenen a IA genérica.

TUS ARCHIVOS (usa Read/Grep/Glob):
- Carpeta actual: MIMO.md (ficha), manual_de_marca.txt, costos_y_precios.txt, datos/*.json (datos en vivo del panel; datos/resumen.md es el resumen).
- Para tendencias, fechas comerciales o competencia usa la búsqueda web.
TIENES AUTORIDAD SOBRE EL PANEL (herramientas mimo-panel):
- Puedes anotar en el panel: compras, usos y conteos de insumos (cera, esencias, frascos…), crear insumos, registrar producción de velas (descuenta insumos y suma stock), ajustar stock de velas, crear mezclas de aromas, agregar aromas al catálogo web, guardar recetas (cuánto lleva cada vela) y anotar gastos.
- SIEMPRE en dos pasos: 1) usa proponer_cambio y di en voz los datos clave del resumen (qué, cuánto, porcentajes, stock antes y después), terminando con "¿Lo anoto?"; 2) solo cuando la persona responda que sí en su siguiente mensaje, usa confirmar_cambio con ese id y di en una frase que quedó hecho. Si dice que no, llama cancelar_cambio con ese id. Si corrige algo, propón el cambio de nuevo con la corrección. Un cambio propuesto solo vale para la respuesta siguiente. Nunca digas que algo quedó anotado sin haber recibido "✔ Hecho".
- Si te dicen varias cosas a la vez, propón cada una y léelas todas juntas; con un "sí" confirmas con id "todos".
- Si no está claro qué insumo o vela es, o la cantidad o la unidad, pregunta antes de proponer. Usa buscar_en_panel para ver qué existe y con qué nombre.
- Para "usé X de cera en una vela": si es una vela que hizo hoy, registra un uso del insumo (o la producción, si la vela tiene receta). Si te está contando cuánto lleva cada vela de ese modelo, eso es una receta: pregunta cuál de las dos quiere si no queda claro.
- Si inventas una combinación de aromas, usa aromas que existan en el taller o en el catálogo, con porcentajes que sumen 100, y dale un nombre con el estilo de las mezclas que ya hay.
- No puedes borrar nada, ni cambiar precios, ventas o pedidos: para eso, di exactamente qué cambiar y dónde en el panel.
- La conexión al panel se revisa de nuevo en CADA mensaje. Aunque antes en esta conversación hayas dicho que no tenías conexión, no lo des por hecho: si tienes las herramientas mimo-panel, úsalas. Solo di que no hay conexión si en ESTE mensaje no tienes esas herramientas o una de ellas te devolvió un error.

Hoy es ${hoy}.

=== FICHA DEL NEGOCIO ===
${ficha || '(Todavía no se cargó la ficha del negocio.)'}

=== DATOS EN VIVO (recién actualizados) ===
${datos.getResumen() || 'Aún no se cargaron los datos en vivo.'}`;
}

// La conversación se guarda en el disco del servidor; tras un deploy se pierde y empieza una nueva
function existeSesion(id) {
  const dir = path.join(os.homedir(), '.claude', 'projects', BASE.replace(/[^a-zA-Z0-9]/g, '-'));
  return fs.existsSync(path.join(dir, id + '.jsonl'));
}

const tokenPara = (u) => jwt.sign({ id: u.id, name: u.name, email: u.email, role: u.role }, JWT_SECRET, { expiresIn: '2h' });

router.post('/chat', authMiddleware, adminOnly, async (req, res) => {
  const message = String(req.body?.message || '').trim().slice(0, 4000);
  if (!message) return res.status(400).json({ error: 'Mensaje vacío' });

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('status', { text: 'Revisando cómo va mimo…' });

  const token = tokenPara(req.user);
  let files = {};
  try {
    files = await cargarConocimiento();
    datos.setToken(token);
    await datos.ensureFresh();
  } catch (e) { console.error('Mimito datos:', e.message); }

  const args = [
    '-p', message,
    '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--model', MODEL,
    '--system-prompt', systemPrompt(files['MIMO.md']),
    '--tools', 'Read,Glob,Grep,WebSearch,WebFetch',
    '--allowedTools', 'Read,Glob,Grep,WebSearch,WebFetch,mcp__mimo-panel__buscar_en_panel,mcp__mimo-panel__proponer_cambio,mcp__mimo-panel__confirmar_cambio,mcp__mimo-panel__cancelar_cambio',
    '--mcp-config', JSON.stringify({ mcpServers: { 'mimo-panel': { command: process.execPath, args: [path.join(__dirname, '..', 'services', 'mimito', 'mcp.js')], env: { MIMO_TOKEN: token, MIMITO_DIR: BASE, PORT: String(process.env.PORT || 3001), MIMITO_PANEL_API: process.env.MIMITO_PANEL_API || '' } } } }),
    '--strict-mcp-config',
    '--setting-sources', '',
  ];
  const sid = req.body?.sessionId;
  if (sid && /^[0-9a-f-]{36}$/i.test(sid) && existeSesion(sid)) args.push('--resume', sid);
  else if (sid) send('status', { text: 'Empiezo una conversación nueva…' });

  // MCP_CONNECTION_NONBLOCKING=false: Claude espera a que el conector del panel esté listo antes de responder
  const child = spawn(claudeBin(), args, { cwd: BASE, env: { ...process.env, MCP_CONNECTION_NONBLOCKING: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let buf = '', stderr = '', gotText = false;

  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      if (msg.type === 'system' && Array.isArray(msg.mcp_servers)) {
        const panel = msg.mcp_servers.find(m => m.name === 'mimo-panel');
        if (panel && panel.status !== 'connected') {
          console.error('Mimito: conector del panel no conectado:', JSON.stringify(panel));
          send('status', { text: 'Ojo: hoy no pude conectarme al panel para anotar' });
        }
      }
      if (msg.type === 'stream_event') {
        const ev = msg.event;
        if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta') { gotText = true; send('delta', { text: ev.delta.text }); }
        if (ev?.type === 'content_block_start' && ev.content_block?.type === 'server_tool_use') send('status', { text: 'Buscando en internet…' });
        if (ev?.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
          const n = ev.content_block.name;
          send('status', { text: n === 'WebFetch' ? 'Leyendo una página…'
            : n.endsWith('confirmar_cambio') ? 'Anotando en el panel…'
            : n.endsWith('proponer_cambio') ? 'Preparando el cambio…'
            : n.endsWith('buscar_en_panel') ? 'Buscando en el panel…'
            : 'Revisando los datos de mimo…' });
          if (n.endsWith('confirmar_cambio')) send('panel', {});
        }
        if (ev?.type === 'message_start' && gotText) send('delta', { text: ' ' });
      } else if (msg.type === 'result') {
        if (msg.is_error) {
          const r = String(msg.result || 'Error');
          send('error', { text: /log ?in|oauth|token|auth/i.test(r) ? 'Mimito no tiene sesión de Claude en el servidor (falta o venció CLAUDE_CODE_OAUTH_TOKEN en Railway).' : r });
        }
        send('done', { sessionId: msg.session_id });
      }
    }
  });
  child.stderr.on('data', (c) => { stderr += c; });
  child.on('error', (e) => { send('error', { text: 'No pude encender el cerebro de Mimito: ' + e.message }); res.end(); });
  child.on('close', (code) => {
    if (code !== 0 && stderr) { console.error('Mimito:', stderr.slice(0, 500)); send('error', { text: stderr.slice(0, 300) }); }
    res.end();
  });
  res.on('close', () => { if (child.exitCode === null) child.kill(); });
});

// Estado: ¿hay cerebro y ficha?
router.get('/estado', authMiddleware, async (req, res) => {
  try {
    const files = await cargarConocimiento();
    res.json({ ficha: !!files['MIMO.md'], archivos: Object.keys(files), cerebro: !!process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.NODE_ENV !== 'production' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Conocimiento fijo (ficha del negocio, manual de marca, costos): se sube una vez y se edita cuando cambie el negocio
router.get('/conocimiento', authMiddleware, adminOnly, async (req, res) => {
  try { res.json(await cargarConocimiento()); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/conocimiento', authMiddleware, adminOnly, express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const files = {};
    for (const n of ARCHIVOS) if (typeof req.body?.[n] === 'string' && req.body[n].trim()) files[n] = req.body[n];
    await pool.query(`INSERT INTO app_settings (key,value) VALUES ('mimito_conocimiento',$1)
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [{ files }]);
    conocimientoCache = null;
    res.json({ ok: true, archivos: Object.keys(files) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
