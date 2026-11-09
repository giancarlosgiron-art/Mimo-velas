// Trae los datos en vivo de mimo (la propia API del panel) y los deja en <carpeta de Mimito>/datos/
// para que Mimito los lea. Solo lectura: nunca modifica nada en el panel.
const fs = require('fs');
const path = require('path');
const { BASE, API } = require('./config');

const DIR = path.join(BASE, 'datos');
const MAX_AGE_MS = 2 * 60 * 1000; // refresca como máximo cada 2 minutos
fs.mkdirSync(DIR, { recursive: true });

let token = null, tokenAt = 0, lastRefresh = 0, inflight = null, resumen = '', estado = { conSesion: false, error: null };

const clp = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');

async function get(url, auth) {
  const res = await fetch(API + url, { headers: auth && token ? { Authorization: 'Bearer ' + token } : {}, signal: AbortSignal.timeout(15000) });
  if (res.status === 401 && auth) { token = null; throw new Error('sesión expirada'); }
  if (!res.ok) throw new Error(`${url} respondió ${res.status}`);
  return res.json();
}

// El panel le entrega a Mimito un token de la persona que le está hablando (ver routes/mimito.js)
function login() { return !!token; }
function setToken(t) { if (t !== token) { token = t; tokenAt = Date.now(); } }

function save(name, data) { fs.writeFileSync(path.join(DIR, name), JSON.stringify(data, null, 1)); }

async function refresh() {
  const d = {};
  const publicas = { productos: '/products', aromas: '/aromas', toppings: '/toppings', categorias: '/products/categories', sitio: '/site' };
  let conSesion = false, error = null;
  try { conSesion = login(); } catch (e) { error = e.message; }

  const hoy = new Date();
  const hace90 = new Date(hoy - 90 * 86400000).toISOString().slice(0, 10);
  const privadas = conSesion ? {
    dashboard: '/dashboard/stats', finanzas: '/dashboard/finance', top_productos: '/dashboard/top-products',
    top_clientes: '/dashboard/top-customers', stock_bajo: '/dashboard/low-stock',
    ventas: '/sales?limit=200', pedidos: '/orders', clientes: '/customers', gastos: '/expenses',
    reporte_30_dias: '/reports/summary', reporte_90_dias: `/reports/summary?from=${hace90}`,
    ventas_por_categoria_90_dias: `/reports/by-category?from=${hace90}`, ventas_por_producto_90_dias: `/reports/by-product?from=${hace90}&limit=30`,
    productos_estancados: '/reports/stagnant-products', clientes_inactivos: '/reports/inactive-customers',
    insumos: '/taller/supplies', taller_resumen: '/taller/summary', recetas_y_costos: '/taller/recipes', produccion: '/taller/production',
    fichas_recetas: '/recetas/sheets', mezclas_aromas: '/recetas/blends',
  } : {};

  const jobs = [
    ...Object.entries(publicas).map(([k, u]) => [k, u, conSesion]), // con token, productos trae costo y margen
    ...Object.entries(privadas).map(([k, u]) => [k, u, true]),
  ];
  await Promise.all(jobs.map(async ([k, u, auth]) => {
    try { d[k] = await get(u, auth); save(k + '.json', d[k]); }
    catch (e) { error = error || e.message; }
  }));

  resumen = armarResumen(d, conSesion);
  fs.writeFileSync(path.join(DIR, 'resumen.md'), resumen);
  estado = { conSesion, error, actualizado: new Date().toISOString() };
  lastRefresh = Date.now();
}

function armarResumen(d, conSesion) {
  const L = [`# Datos en vivo de mimo — ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}`, ''];
  const prods = Array.isArray(d.productos) ? d.productos : (d.productos?.products || []);
  if (prods.length) {
    const sin = prods.filter(p => Number(p.stock) <= 0);
    const bajo = prods.filter(p => Number(p.stock) > 0 && Number(p.stock) <= Number(p.min_stock || 0));
    const unidades = prods.reduce((a, p) => a + Math.max(0, Number(p.stock) || 0), 0);
    const valor = prods.reduce((a, p) => a + Math.max(0, Number(p.stock) || 0) * (Number(p.sale_price) || 0), 0);
    L.push('## Inventario', `${prods.length} productos · ${unidades} unidades en stock · valor a precio de venta ${clp(valor)}`);
    if (d.sitio?.inventario?.track_stock) {
      L.push(`Sin stock: ${sin.map(p => p.name).join(', ') || 'ninguno'}`);
      L.push(`Stock bajo (≤ mínimo): ${bajo.map(p => `${p.name} (${p.stock}/${p.min_stock})`).join(', ') || 'ninguno'}`, '');
    } else {
      L.push('MODO A PEDIDO: mimo hace cada vela cuando la piden. El stock de velas es solo referencia; NO hables de velas agotadas, stock bajo ni de reponer velas como algo urgente. (Los insumos del Taller sí importan.)', '');
    }
    L.push('| Producto | Categoría | Precio | Stock | Aroma' + (conSesion ? ' | Costo' : '') + ' |', '|---|---|---|---|---' + (conSesion ? '|---' : '') + '|');
    for (const p of prods) L.push(`| ${p.name} | ${p.category_name || ''} | ${clp(p.sale_price)}${Number(p.compare_price) > 0 ? ` (antes ${clp(p.compare_price)})` : ''} | ${p.stock} | ${p.aroma || '—'}${conSesion ? ' | ' + (Number(p.cost_price) ? clp(p.cost_price) : 'sin costo') : ''} |`);
    L.push('');
  }
  if (Array.isArray(d.aromas)) L.push('## Aromas disponibles', d.aromas.map(a => a.name).join(', '), '');

  if (!conSesion) {
    L.push('## Ventas, pedidos y clientes', 'NO DISPONIBLES: Mimito no tiene la sesión del panel (falta MIMO_EMAIL / MIMO_PASSWORD en mimito/.env). Si te preguntan por ventas, dilo con cariño y explica cómo activarlo.');
    return L.join('\n');
  }
  const s = d.dashboard;
  if (s) L.push('## Ventas', `Hoy: ${clp(s.today?.total)} (${s.today?.count} ventas) · Este mes: ${clp(s.month?.total)} (${s.month?.count} ventas, ${s.month?.growth}% vs mes anterior) · Utilidad del mes: ${clp(s.profit)}`,
    `Pedidos pendientes o confirmados: ${s.pendingOrders} · Clientes: ${s.totalCustomers} (${s.vipCustomers} VIP)`);
  const f = d.finanzas;
  if (f) {
    L.push(`Mes ${f.month}: ingresos ${clp(f.current?.revenue)}, utilidad ${clp(f.current?.profit)}. Mes anterior: ${clp(f.previous?.revenue)}.` +
      (f.goal ? ` Meta mensual ${clp(f.goal)}, proyección ${clp(f.projection)}, quedan ${f.daysLeft} días.` : ' Sin meta mensual definida.'));
    if (f.followUp?.length) L.push('Pedidos pendientes hace más de 2 días (seguimiento): ' + f.followUp.map(o => `${o.name || 'sin nombre'} ${clp(o.total)}`).join('; '));
    if (f.noCost?.length) L.push('Productos sin costo cargado (la utilidad sale inflada): ' + f.noCost.map(p => p.name).join(', '));
  }
  for (const [k, t] of [['reporte_30_dias', 'Últimos 30 días'], ['reporte_90_dias', 'Últimos 90 días']]) {
    const r = d[k]; if (r) L.push(`${t}: ${r.sales} ventas, ${clp(r.revenue)}, utilidad ${clp(r.profit)} (${r.margin}%), ticket promedio ${clp(r.avg_ticket)}`);
  }
  if (Array.isArray(d.ventas_por_producto_90_dias) && d.ventas_por_producto_90_dias.length)
    L.push('Más vendidos (90 días): ' + d.ventas_por_producto_90_dias.slice(0, 8).map(p => `${p.name} ${p.units_sold}u`).join(', '));
  if (Array.isArray(d.productos_estancados) && d.productos_estancados.length)
    L.push('Productos sin ventas hace +14 días: ' + d.productos_estancados.map(p => `${p.name} (${p.stock} en stock)`).join(', '));
  if (Array.isArray(d.pedidos)) {
    const act = d.pedidos.filter(o => !['delivered', 'cancelled'].includes(o.status));
    L.push(`Pedidos activos: ${act.length}` + (act.length ? ' → ' + act.slice(0, 8).map(o => `${o.customer_name || o.contact_name || 'cliente'} (${o.status_label || o.status}, ${clp(o.total)})`).join('; ') : ''));
  }
  const gastos = Array.isArray(d.gastos) ? d.gastos : d.gastos?.expenses;
  if (Array.isArray(gastos)) L.push(`Gastos registrados: ${gastos.length}, total ${clp(gastos.reduce((a, g) => a + (Number(g.amount) || 0), 0))}` + (d.gastos?.monthTotal != null ? ` · este mes ${clp(d.gastos.monthTotal)}` : ''));
  armarTaller(L, d);
  L.push('', 'Detalle completo en los .json de esta carpeta.');
  return L.join('\n');
}

// Taller (Gian lo carga en el panel → Taller): insumos, costo por vela según receta y producción
function armarTaller(L, d) {
  const ins = Array.isArray(d.insumos) ? d.insumos : null;
  if (!ins) return;
  const num = (x, u) => `${(Math.round((Number(x) || 0) * 10) / 10).toLocaleString('es-CL')} ${u === 'unid' ? 'unid.' : u}`;
  const cu = (c) => (Number(c) > 0 && Number(c) < 100 ? '$' + (Math.round(c * 100) / 100).toLocaleString('es-CL') : clp(c));
  L.push('', '## Taller: insumos (cera, esencias, frascos…)');
  if (!ins.length) { L.push('Todavía no hay insumos cargados (Gian los está cargando de cero en el panel → Taller).'); }
  else {
    const t = d.taller_resumen;
    if (t) L.push(`Valor de los insumos: ${clp(t.value)} · por reponer: ${t.low.map(s => `${s.name} (${num(s.stock, s.unit)})`).join(', ') || 'nada'}`);
    L.push('| Insumo | Tipo | Stock | Mínimo | Costo por unidad | Proveedor |', '|---|---|---|---|---|---|');
    for (const s of ins) L.push(`| ${s.name} | ${s.kind} | ${num(s.stock, s.unit)} | ${Number(s.min_stock) ? num(s.min_stock, s.unit) : '—'} | ${cu(s.unit_cost)}/${s.unit} | ${s.supplier || '—'} |`);
    if (t?.essences?.length) L.push(`Esencias alcanzan para (velas de ${t.settings.ref_wax_g} g de cera al ${t.settings.ref_pct}%): ` + t.essences.map(e => `${e.name} ${e.candles ?? '?'}`).join(', '));
  }
  const rec = d.recetas_y_costos;
  const conR = rec?.products?.filter(p => p.recipe) || [];
  if (rec) {
    const st = rec.settings;
    L.push('', `## Costo por vela (recetas) — hora ${clp(st.hourly)}, comisión ${st.commission_pct}%, margen objetivo ${st.target_margin_pct}%`);
    if (!conR.length) L.push('Ninguna vela tiene receta todavía.');
    else {
      L.push('| Vela | Precio | Materiales | Con su tiempo | Ganancia (sin tiempo) | Margen | Precio para margen objetivo |', '|---|---|---|---|---|---|---|');
      for (const p of conR) { const c = p.cost; L.push(`| ${p.name} | ${clp(c.price)} | ${clp(c.direct)} | ${clp(c.total)} | ${clp(c.profit_direct)} | ${Math.round(c.margin_direct * 100)}% | ${c.target_price ? clp(c.target_price) : '—'} |`); }
    }
    const sin = rec.products.filter(p => !p.recipe).map(p => p.name);
    if (sin.length) L.push('Sin receta: ' + sin.join(', '));
  }
  if (Array.isArray(d.mezclas_aromas) && d.mezclas_aromas.length) {
    L.push('', '## Mezclas de aromas (creación de aromas)');
    for (const b of d.mezclas_aromas) L.push(`- ${b.name}${b.favorite ? ' (favorita de Gian)' : ''}: ${(b.parts || []).map(p => `${p.aroma} ${p.pct}%`).join(' · ')}${b.description ? ' — ' + b.description : ''}`);
  }
  if (Array.isArray(d.fichas_recetas) && d.fichas_recetas.length) {
    L.push('', '## Fichas de recetas (velas y moldes)');
    for (const f of d.fichas_recetas) {
      const c = f.calc || {};
      const lineas = (f.lines || []).map(l => `${l.role}${l.name ? ' ' + l.name : ''} ${l.qty}${l.role === 'decoracion' && l.weight_g ? ` × ${l.weight_g} g` : ''}`).join(', ');
      L.push(`- ${f.name} (${f.type}${f.type === 'molde' ? `, ${c.pieces} piezas` : ''}${f.product_name ? ', producto ' + f.product_name : ''}): ${lineas}; esencia ${f.fragrance_pct}% = ${Math.round((c.ess_g || 0) * 10) / 10} g${f.blend_name ? ' de ' + f.blend_name : ''}; costo ≈ ${clp(c.cost_per_piece)}${f.type === 'molde' ? ' por pieza' : ''}`);
    }
  }
  if (Array.isArray(d.produccion) && d.produccion.length)
    L.push('', 'Producción reciente: ' + d.produccion.slice(0, 10).map(p => `${new Date(p.created_at).toLocaleDateString('es-CL')} ${p.quantity}× ${p.product_name}${p.fragrance_name ? ' (' + p.fragrance_name + ')' : ''}`).join('; '));
}

const SUCIO = path.join(DIR, '.sucio'); // lo deja mimo-mcp.js cuando Mimito cambia algo en el panel
async function ensureFresh() {
  if (fs.existsSync(SUCIO)) { try { fs.unlinkSync(SUCIO); } catch {} lastRefresh = 0; }
  if (Date.now() - lastRefresh < MAX_AGE_MS && resumen) return;
  if (!inflight) inflight = refresh().catch(e => { estado.error = e.message; }).finally(() => { inflight = null; });
  await inflight;
}

module.exports = { setToken, ensureFresh, getResumen: () => resumen, getEstado: () => estado };
