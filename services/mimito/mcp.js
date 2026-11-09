#!/usr/bin/env node
// "Manos" de Mimito: servidor MCP (stdio, sin dependencias) que le permite escribir en el panel de mimo.
// Regla de seguridad: todo cambio se PROPONE en un turno y se CONFIRMA en otro turno, después de que
// la persona dijo que sí. Este proceso nace y muere con cada respuesta de Mimito, así que un cambio
// propuesto por este mismo proceso nunca se puede confirmar aquí mismo.
const fs = require('fs');
const path = require('path');

const { BASE, API } = require('./config');
const PEND = path.join(BASE, 'pendientes.json');
const SUCIO = path.join(BASE, 'datos', '.sucio');
const RUN = `${process.pid}-${Date.now()}`;
const EXPIRA_MS = 30 * 60 * 1000;

// ── API del panel ───────────────────────────────────────────────
// Token de la persona que habla con Mimito; lo pasa el panel al iniciar cada respuesta
const token = process.env.MIMO_TOKEN;
async function login() { if (!token) throw new Error('Mimito no recibió la sesión del panel.'); }
async function api(method, url, body) {
  await login();
  const r = await fetch(API + url, {
    method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `El panel respondió ${r.status}`), { data });
  return data;
}

// ── Buscar por nombre ───────────────────────────────────────────
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function resolver(lista, ref, que) {
  if (ref == null || ref === '') throw new Error(`Falta indicar ${que}.`);
  if (typeof ref === 'number' || /^\d+$/.test(String(ref))) {
    const x = lista.find(i => Number(i.id) === Number(ref)); if (x) return x;
  }
  const q = norm(ref);
  let c = lista.filter(i => norm(i.name) === q);
  if (!c.length) c = lista.filter(i => norm(i.name).includes(q) || q.includes(norm(i.name)));
  if (!c.length) {
    const words = q.split(' ').filter(w => w.length > 2);
    const score = (i) => words.filter(w => norm(i.name).includes(w)).length;
    const best = Math.max(0, ...lista.map(score));
    if (best) c = lista.filter(i => score(i) === best);
  }
  if (c.length === 1) return c[0];
  if (!c.length) throw new Error(`No encontré ${que} "${ref}". Opciones: ${lista.map(i => i.name).join(', ') || '(ninguna todavía)'}.`);
  throw new Error(`"${ref}" puede ser varios ${que}s: ${c.map(i => `${i.name} (id ${i.id})`).join(', ')}. Pregunta cuál.`);
}
const listas = {
  insumos: () => api('GET', '/taller/supplies').then(r => Array.isArray(r) ? r : r.supplies || []),
  productos: () => api('GET', '/products').then(r => Array.isArray(r) ? r : r.products || []),
  aromas: () => api('GET', '/aromas'),
  mezclas: () => api('GET', '/recetas/blends'),
  recetas: () => api('GET', '/recetas/sheets').then(r => Array.isArray(r) ? r : r.sheets || []),
};
const num = (v, d = 0) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : d; };
const clp = (n) => '$' + Math.round(num(n)).toLocaleString('es-CL');
const fmtQ = (q, u) => `${Math.round(num(q) * 100) / 100} ${u || ''}`.trim();

// ── Acciones: cada una arma el cambio (resumen + petición) sin ejecutarlo ──
const ACCIONES = {
  async movimiento_insumo(d) {
    const s = resolver(await listas.insumos(), d.insumo, 'el insumo');
    const tipo = d.tipo;
    if (!['compra', 'uso', 'conteo'].includes(tipo)) throw new Error('tipo debe ser compra, uso o conteo.');
    const qty = num(d.cantidad);
    if (!(qty > 0) && !(tipo === 'conteo' && qty === 0)) throw new Error('Indica una cantidad válida.');
    const despues = tipo === 'compra' ? num(s.stock) + qty : tipo === 'uso' ? num(s.stock) - qty : qty;
    const verbo = { compra: 'Sumar compra de', uso: 'Descontar uso de', conteo: 'Dejar el stock contado en' }[tipo];
    let resumen = `${verbo} ${fmtQ(qty, s.unit)} de ${s.name}${d.nota ? ` (${d.nota})` : ''}. Stock: ${fmtQ(s.stock, s.unit)} → ${fmtQ(despues, s.unit)}.`;
    if (tipo === 'compra' && num(d.total) > 0) resumen += ` Pagado ${clp(d.total)}${d.como_gasto ? ', y se anota como gasto' : ''}.`;
    if (despues < 0) resumen += ' OJO: quedaría negativo.';
    return { resumen, req: ['POST', `/taller/supplies/${s.id}/movement`, { type: tipo, quantity: qty, total: num(d.total), notes: d.nota || '', as_expense: !!d.como_gasto }] };
  },
  async crear_insumo(d) {
    const kinds = ['cera', 'esencia', 'frasco', 'mecha', 'colorante', 'decoracion', 'empaque', 'otro'];
    const kind = kinds.includes(d.tipo) ? d.tipo : 'otro';
    const unit = ['g', 'ml', 'unid'].includes(d.unidad) ? d.unidad : kind === 'cera' ? 'g' : kind === 'esencia' ? 'ml' : 'unid';
    if (!d.nombre) throw new Error('Falta el nombre del insumo.');
    const ya = (await listas.insumos()).find(s => norm(s.name) === norm(d.nombre));
    if (ya) throw new Error(`Ya existe el insumo "${ya.name}" (stock ${fmtQ(ya.stock, ya.unit)}). Usa movimiento_insumo para sumarle.`);
    const resumen = `Crear insumo "${d.nombre}" (${kind}, en ${unit}) con ${fmtQ(num(d.stock), unit)} en stock` +
      (num(d.pagado) > 0 ? `, pagado ${clp(d.pagado)}` : '') + (num(d.stock_minimo) > 0 ? `, mínimo ${fmtQ(d.stock_minimo, unit)}` : '') + '.';
    return { resumen, req: ['POST', '/taller/supplies', { name: d.nombre, kind, unit, stock: num(d.stock), paid: num(d.pagado), min_stock: num(d.stock_minimo), supplier: d.proveedor || '', notes: d.nota || '', max_pct: d.max_pct ?? '' }] };
  },
  async registrar_produccion(d) {
    const p = resolver(await listas.productos(), d.producto, 'la vela');
    let fid = null;
    if (d.esencia) fid = resolver((await listas.insumos()).filter(s => s.kind === 'esencia'), d.esencia, 'la esencia').id;
    const body = { product_id: p.id, quantity: Math.floor(num(d.cantidad)), fragrance_supply_id: fid, notes: d.nota || '', add_to_stock: d.sumar_al_stock !== false };
    const plan = await api('POST', '/taller/production', { ...body, dry_run: true });
    const usa = (plan.needs || []).map(n => `${fmtQ(n.qty, n.unit)} de ${n.name}`).join(', ');
    let resumen = `Registrar producción de ${body.quantity} × ${p.name}. Descuenta: ${usa || 'nada'}. Costo ${clp(plan.cost_total)}.` +
      (body.add_to_stock ? ` La vela pasa de ${p.stock} a ${num(p.stock) + body.quantity} en stock.` : '');
    if (plan.shortages?.length) { resumen += ` OJO, no alcanza: ${plan.shortages.map(s => `${s.name} (faltan ${fmtQ(s.missing, s.unit)})`).join(', ')}.`; body.force = true; }
    return { resumen, req: ['POST', '/taller/production', body] };
  },
  async ajustar_stock_producto(d) {
    const p = resolver(await listas.productos(), d.producto, 'el producto');
    const nuevo = d.stock != null ? Math.floor(num(d.stock)) : Math.max(0, num(p.stock) + Math.floor(num(d.sumar)));
    if (!(nuevo >= 0)) throw new Error('Stock no válido.');
    return { resumen: `Cambiar el stock de ${p.name}: ${p.stock} → ${nuevo} unidades.`, req: ['PUT', `/products/${p.id}`, { stock: nuevo }] };
  },
  async crear_mezcla_aroma(d) {
    if (!d.nombre) throw new Error('Falta el nombre de la mezcla.');
    const partes = (d.partes || []).map(x => ({ aroma: String(x.aroma || '').trim(), pct: num(x.pct) })).filter(x => x.aroma && x.pct > 0);
    if (!partes.length) throw new Error('La mezcla necesita al menos un aroma con su porcentaje.');
    const total = partes.reduce((a, x) => a + x.pct, 0);
    let resumen = `Crear la mezcla "${d.nombre}": ${partes.map(x => `${x.aroma} ${x.pct}%`).join(' + ')}${d.descripcion ? `. ${String(d.descripcion).replace(/[.\s]+$/, '')}` : ''}.`;
    if (Math.round(total) !== 100) resumen += ` OJO: suma ${total}%, no 100%.`;
    return { resumen, req: ['POST', '/recetas/blends', { name: d.nombre, description: d.descripcion || '', parts: partes, favorite: !!d.favorita }] };
  },
  async crear_aroma_catalogo(d) {
    if (!d.nombre) throw new Error('Falta el nombre del aroma.');
    const ya = (await listas.aromas()).find(a => norm(a.name) === norm(d.nombre));
    if (ya) throw new Error(`El aroma "${ya.name}" ya está en el catálogo.`);
    return { resumen: `Agregar "${d.nombre}" a la lista pública de aromas del catálogo web (los clientes lo verán).`, req: ['POST', '/aromas', { name: d.nombre }] };
  },
  async guardar_receta(d) {
    if (!d.nombre) throw new Error('Falta el nombre de la receta.');
    const ins = await listas.insumos();
    const roles = ['cera', 'mecha', 'envase', 'pegatina', 'decoracion', 'colorante', 'otro'];
    const lines = (d.lineas || []).map(l => {
      const s = l.insumo ? resolver(ins, l.insumo, 'el insumo') : null;
      return { role: roles.includes(l.rol) ? l.rol : 'otro', name: s ? s.name : String(l.nombre || ''), supply_id: s ? s.id : null, qty: num(l.cantidad), _u: s?.unit };
    });
    const prod = d.producto ? resolver(await listas.productos(), d.producto, 'la vela') : null;
    const mezcla = d.mezcla ? resolver(await listas.mezclas(), d.mezcla, 'la mezcla') : null;
    const existente = d.reemplazar ? resolver(await listas.recetas(), d.reemplazar, 'la receta') : null;
    const body = { name: d.nombre, type: d.tipo === 'molde' ? 'molde' : 'vela', product_id: prod?.id || null, blend_id: mezcla?.id || null,
      fragrance_pct: num(d.fragancia_pct, 7), pieces: Math.max(1, Math.floor(num(d.piezas, 1))), mold_name: d.molde || '',
      lines: lines.map(({ _u, ...l }) => l), notes: d.nota || '', sync_cost: !!(d.usar_para_costo && prod) };
    const resumen = `${existente ? 'Actualizar' : 'Crear'} la receta "${d.nombre}"${prod ? ` para ${prod.name}` : ''}: ` +
      lines.map(l => `${fmtQ(l.qty, l._u)} de ${l.name} (${l.role})`).join(', ') +
      `; esencia al ${body.fragrance_pct}%${mezcla ? ` con la mezcla ${mezcla.name}` : ''}${body.sync_cost ? '; y se usa para calcular el costo de la vela' : ''}.`;
    return { resumen, req: existente ? ['PUT', `/recetas/sheets/${existente.id}`, body] : ['POST', '/recetas/sheets', body] };
  },
  async registrar_gasto(d) {
    const monto = num(d.monto);
    if (!(monto > 0) || !d.descripcion) throw new Error('Falta el monto o la descripción del gasto.');
    const cat = ['Materiales', 'Empaque', 'Transporte', 'Otros'].includes(d.categoria) ? d.categoria : 'Otros';
    const fecha = d.fecha || new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' });
    return { resumen: `Anotar gasto de ${clp(monto)}: ${d.descripcion} (${cat}, ${fecha}).`, req: ['POST', '/expenses', { date: fecha, amount: monto, description: d.descripcion, category: cat }] };
  },
};

// ── Pendientes ──────────────────────────────────────────────────
const leer = () => { try { return JSON.parse(fs.readFileSync(PEND, 'utf8')); } catch { return []; } };
const guardar = (l) => fs.writeFileSync(PEND, JSON.stringify(l.filter(p => Date.now() - p.creado < EXPIRA_MS), null, 1));

async function proponer({ accion, datos }) {
  if (!ACCIONES[accion]) throw new Error('Acción desconocida: ' + accion);
  const { resumen, req } = await ACCIONES[accion](datos || {});
  // Lo que se propuso en respuestas anteriores y no se confirmó, se descarta: un "sí" solo vale para lo último
  const lista = leer().filter(p => p.run === RUN);
  const id = 'c' + Math.random().toString(36).slice(2, 7);
  lista.push({ id, accion, resumen, req, run: RUN, creado: Date.now() });
  guardar(lista);
  return `Cambio propuesto (id ${id}), TODAVÍA NO APLICADO: ${resumen}\nLéeselo a la persona y pregúntale si lo aplicas. Solo cuando responda que sí (en su próximo mensaje) llama a confirmar_cambio con id ${id}.`;
}

async function confirmar({ id }) {
  let lista = leer();
  // Solo vale lo propuesto en la respuesta inmediatamente anterior
  const ultimo = lista.filter(p => p.run !== RUN).sort((a, b) => b.creado - a.creado)[0];
  if (ultimo) lista = lista.filter(p => p.run === ultimo.run || p.run === RUN);
  const ids = id === 'todos' ? lista.filter(p => p.run !== RUN).map(p => p.id) : [id];
  if (!ids.length) throw new Error('No hay cambios pendientes de un mensaje anterior.');
  const out = [];
  for (const cid of ids) {
    const p = lista.find(x => x.id === cid);
    if (!p) { out.push(`${cid}: no existe o ya expiró (duran 30 minutos). Propónlo de nuevo.`); continue; }
    if (p.run === RUN) throw new Error('Ese cambio lo acabas de proponer en esta misma respuesta: primero pregúntale a la persona y espera su sí.');
    try {
      await api(...p.req);
      out.push(`✔ Hecho: ${p.resumen}`);
      lista.splice(lista.indexOf(p), 1);
    } catch (e) { out.push(`✘ No se pudo (${p.resumen}): ${e.message}`); }
  }
  guardar(lista);
  try { fs.writeFileSync(SUCIO, String(Date.now())); } catch {}
  return out.join('\n');
}

function cancelar({ id }) {
  const lista = leer();
  const quedan = id === 'todos' ? [] : lista.filter(p => p.id !== id);
  guardar(quedan);
  return lista.length === quedan.length ? 'No había nada con ese id.' : 'Cancelado, no se cambió nada.';
}

async function buscar({ que, texto }) {
  const f = listas[que]; if (!f) throw new Error('que debe ser: ' + Object.keys(listas).join(', '));
  let l = await f();
  if (texto) l = l.filter(i => norm(i.name).includes(norm(texto)) || norm(texto).split(' ').some(w => w.length > 2 && norm(i.name).includes(w)));
  return l.slice(0, 60).map(i => {
    if (que === 'insumos') return `${i.id} · ${i.name} · ${i.kind} · stock ${fmtQ(i.stock, i.unit)} · mínimo ${fmtQ(i.min_stock, i.unit)} · costo ${clp(i.unit_cost)}/${i.unit}`;
    if (que === 'productos') return `${i.id} · ${i.name} · stock ${i.stock} · ${clp(i.sale_price)}`;
    if (que === 'mezclas') return `${i.id} · ${i.name} · ${(i.parts || []).map(p => `${p.aroma} ${p.pct}%`).join(' + ')}`;
    if (que === 'recetas') return `${i.id} · ${i.name} · ${i.type} · ${(i.lines || []).map(x => `${x.qty} ${x.name}`).join(', ')}`;
    return `${i.id} · ${i.name}`;
  }).join('\n') || 'Nada encontrado.';
}

// ── Protocolo MCP (JSON-RPC por stdin/stdout) ──────────────────
const TOOLS = [
  { name: 'buscar_en_panel', description: 'Busca en el panel de mimo, en vivo y con sus id: insumos (con stock), productos, aromas del catálogo, mezclas de aromas o recetas.',
    inputSchema: { type: 'object', properties: { que: { type: 'string', enum: Object.keys(listas) }, texto: { type: 'string', description: 'Filtro opcional por nombre' } }, required: ['que'] } },
  { name: 'proponer_cambio', description: `Prepara un cambio en el panel de mimo SIN aplicarlo. Devuelve un resumen para leerle a la persona. Acciones y sus datos:
- movimiento_insumo: {insumo, tipo: "compra"|"uso"|"conteo", cantidad, total? (CLP pagado, solo compra), como_gasto? (bool), nota?}. "uso" descuenta lo que se gastó (ej. cera usada en una vela); "conteo" deja el stock exacto que la persona contó; "compra" suma.
- crear_insumo: {nombre, tipo: cera|esencia|frasco|mecha|colorante|decoracion|empaque|otro, unidad: g|ml|unid, stock, pagado?, stock_minimo?, proveedor?, max_pct? (esencias), nota?}
- registrar_produccion: {producto, cantidad, esencia?, nota?, sumar_al_stock? (default true)}. Usa la receta de la vela, descuenta los insumos solos y suma las velas al stock.
- ajustar_stock_producto: {producto, stock} o {producto, sumar}. Velas terminadas.
- crear_mezcla_aroma: {nombre, partes: [{aroma, pct}], descripcion?, favorita?}. Combinación de aromas para el taller (los % suman 100).
- crear_aroma_catalogo: {nombre}. OJO: agrega el aroma a la lista PÚBLICA de la web.
- guardar_receta: {nombre, tipo: vela|molde, producto?, mezcla?, fragancia_pct?, piezas?, molde?, lineas: [{rol: cera|mecha|envase|pegatina|decoracion|colorante|otro, insumo, cantidad}], usar_para_costo?, reemplazar? (nombre o id de una receta existente), nota?}. Cuánto lleva cada vela.
- registrar_gasto: {monto, descripcion, categoria: Materiales|Empaque|Transporte|Otros, fecha? (YYYY-MM-DD)}`,
    inputSchema: { type: 'object', properties: { accion: { type: 'string', enum: Object.keys(ACCIONES) }, datos: { type: 'object' } }, required: ['accion', 'datos'] } },
  { name: 'confirmar_cambio', description: 'Aplica en el panel un cambio propuesto en un mensaje ANTERIOR, solo después de que la persona dijo que sí. id: el id del cambio, o "todos" para aplicar todos los pendientes.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'cancelar_cambio', description: 'Descarta un cambio propuesto (o "todos") si la persona dijo que no.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
];
const HANDLERS = { buscar_en_panel: buscar, proponer_cambio: proponer, confirmar_cambio: confirmar, cancelar_cambio: cancelar };

const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return; // notificación
  try {
    if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'mimo-panel', version: '1.0.0' } } });
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
    if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    if (method === 'tools/call') {
      const h = HANDLERS[params?.name];
      if (!h) throw new Error('Herramienta desconocida');
      try { const text = await h(params.arguments || {}); send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } }); }
      catch (e) { send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true } }); }
      return;
    }
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Método no soportado: ' + method } });
  } catch (e) { send({ jsonrpc: '2.0', id, error: { code: -32603, message: e.message } }); }
}
let buf = '';
process.stdin.on('data', (c) => {
  buf += c; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (line) { try { handle(JSON.parse(line)); } catch {} }
  }
});
