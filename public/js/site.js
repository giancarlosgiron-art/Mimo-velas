// ── Mi página: editor del catálogo público ──────────────────
// Textos, cinta superior, colores y tipografías de la página que ven los clientes.
// Cada bloque se guarda por separado en /api/site/:key; el catálogo los lee al cargar.

const CATALOG_URL = 'https://mimo-catalog-production.up.railway.app';

const DISPLAY_FONTS = [
  { key: 'fraunces',  label: 'Fraunces',          family: "'Fraunces', serif",           hint: 'Serif suave y redonda (la del manual)' },
  { key: 'playfair',  label: 'Playfair Display',  family: "'Playfair Display', serif",   hint: 'Elegante, de alto contraste' },
  { key: 'dmserif',   label: 'DM Serif Display',  family: "'DM Serif Display', serif",   hint: 'Gruesa y editorial' },
  { key: 'cormorant', label: 'Cormorant',         family: "'Cormorant Garamond', serif", hint: 'Fina y clásica' },
  { key: 'lora',      label: 'Lora',              family: "'Lora', serif",               hint: 'Cálida y legible' },
];
const BODY_FONTS = [
  { key: 'mulish',    label: 'Mulish',     family: "'Mulish', sans-serif",    hint: 'Limpia (la del manual)' },
  { key: 'nunito',    label: 'Nunito',     family: "'Nunito', sans-serif",    hint: 'Redondeada y amable' },
  { key: 'dmsans',    label: 'DM Sans',    family: "'DM Sans', sans-serif",   hint: 'Moderna y geométrica' },
  { key: 'worksans',  label: 'Work Sans',  family: "'Work Sans', sans-serif", hint: 'Neutra' },
  { key: 'quicksand', label: 'Quicksand',  family: "'Quicksand', sans-serif", hint: 'Liviana y redonda' },
];

// Qué se puede editar en cada bloque. Tipos: text, textarea, color, font, toggle, list (textos), group (lista de fichas)
const SITE_SECTIONS = [
  { key: 'diseno', title: 'Diseño', icon: '🎨', desc: 'Colores, tipografías y movimiento de toda la página.', preview: true, fields: [
    { name: 'primary',    type: 'color', label: 'Color principal',  hint: 'Titulares, botones y bloque de portada' },
    { name: 'secondary',  type: 'color', label: 'Color secundario', hint: 'Segunda colección y detalles' },
    { name: 'background', type: 'color', label: 'Fondo',            hint: 'Fondo de toda la página' },
    { name: 'ink',        type: 'color', label: 'Texto',            hint: 'Color de los textos' },
    { name: 'soft1',      type: 'color', label: 'Fondo suave 1',    hint: 'Detrás de las fotos y la sección Cuidado' },
    { name: 'soft2',      type: 'color', label: 'Fondo suave 2',    hint: 'Sección Cómo pedir' },
    { name: 'font_display', type: 'font', label: 'Tipografía de títulos', options: DISPLAY_FONTS },
    { name: 'font_body',    type: 'font', label: 'Tipografía de textos',  options: BODY_FONTS },
    { name: 'motion', type: 'toggle', label: 'Animaciones y efectos en movimiento', hint: 'Cinta en movimiento, burbujas flotando, velas que rotan…' },
  ]},
  { key: 'banners', title: 'Banners especiales', icon: '🎄', desc: 'Franja debajo de la portada para ocasiones especiales (Navidad, Día de la Madre…). Solo se muestran los activos.', fields: [
    { name: 'items', type: 'group', label: 'Banners', addLabel: '+ Agregar banner', itemLabel: 'Banner', subfields: [
      { name: 'active', type: 'toggle', label: 'Activo (se muestra en la página)' },
      { name: 'image', type: 'image', label: 'Imagen', hint: 'Bien horizontal (es una franja), idealmente 1800 × 500 px. Se achica sola al subirla.' },
      { name: 'eyebrow', type: 'text', label: 'Texto pequeño (opcional)' },
      { name: 'title', type: 'text', label: 'Título' },
      { name: 'text', type: 'textarea', label: 'Texto', rows: 2 },
      { name: 'cta_label', type: 'text', label: 'Botón (opcional)' },
      { name: 'product_ids', type: 'products', label: 'Velas de esta colección especial', hint: 'Si eliges velas, el botón lleva a una página solo con ellas (con este banner arriba).' },
      { name: 'link', type: 'text', label: 'Otro destino para el botón (opcional)', hint: 'Solo si no eliges velas arriba. Ej: /catalogo?coleccion=postres o un link completo' },
    ]},
  ]},
  { key: 'categorias', title: 'Categorías', icon: '🗂️', desc: 'Las categorías del catálogo: banner, descripción, orden y si aparecen en "Compra por categoría" del inicio.', custom: true },
  { key: 'arma_tu_vela', title: 'Arma tu vela', icon: '🧁', desc: 'La página donde el cliente arma su vela: lata dorada + aroma + toppings. Aquí la activas y administras los toppings.', custom: true },
  { key: 'destacados', title: 'Más vendidos', icon: '⭐', desc: 'Elige y ordena las velas que aparecen en "Los más vendidos" del inicio.', custom: true },
  { key: 'etiquetas', title: 'Etiquetas de las velas', icon: '🏷️', desc: 'Las etiquetas que aparecen sobre las fotos de las velas en el catálogo. Actívalas o apágalas cuando quieras.', fields: [
    { name: 'nueva', type: 'toggle', label: '"Nueva"', hint: 'En las velas agregadas hace pocos días' },
    { name: 'nueva_dias', type: 'text', label: 'Días que una vela cuenta como "Nueva"', hint: 'Ej: 14' },
    { name: 'mas_pedida', type: 'toggle', label: '"La más pedida"', hint: 'En las velas de "Los más vendidos"' },
    { name: 'poco_stock', type: 'toggle', label: '"Quedan pocas"', hint: 'Cuando el stock llega al mínimo que pusiste en Inventario' },
    { name: 'oferta', type: 'toggle', label: '"Oferta"', hint: 'Cuando la vela tiene precio normal tachado' },
  ]},
  { key: 'cinta', title: 'Cinta superior', icon: '🎞️', desc: 'Los mensajes que pasan en movimiento arriba de la página.', fields: [
    { name: 'enabled', type: 'toggle', label: 'Mostrar la cinta' },
    { name: 'items', type: 'list', label: 'Mensajes', placeholder: 'Ej: Envíos a todo Santiago', addLabel: '+ Agregar mensaje' },
  ]},
  { key: 'portada', title: 'Portada', icon: '🏠', desc: 'El bloque grande del inicio.', fields: [
    { name: 'eyebrow',    type: 'text',     label: 'Texto pequeño de arriba' },
    { name: 'title',      type: 'textarea', label: 'Título', rows: 2 },
    { name: 'text',       type: 'textarea', label: 'Descripción', rows: 3 },
    { name: 'cta_label',  type: 'text',     label: 'Botón principal' },
    { name: 'link_label', type: 'text',     label: 'Enlace secundario' },
    { name: 'slides', type: 'group', label: 'Fotos de la portada', addLabel: '+ Agregar foto', itemLabel: 'Foto', subfields: [
      { name: 'image', type: 'image', label: 'Foto', hint: 'Vertical (4:5), idealmente 1000 × 1250 px. Si no subes ninguna, rotan las velas más vendidas.' },
      { name: 'title', type: 'text', label: 'Etiqueta · título', hint: 'Ej: Mandarín Martini' },
      { name: 'subtitle', type: 'text', label: 'Etiqueta · texto pequeño', hint: 'Ej: Aroma a mandarina' },
      { name: 'link', type: 'text', label: 'Al tocar la etiqueta lleva a', hint: 'Ej: /producto/12 o /catalogo?coleccion=bebidas (opcional)' },
    ]},
  ]},
  { key: 'catalogo', title: 'Catálogo', icon: '🕯️', desc: 'Títulos del catálogo en el inicio y en la página del catálogo.', fields: [
    { name: 'home_eyebrow', type: 'text', label: 'Inicio · texto pequeño' },
    { name: 'home_title',   type: 'text', label: 'Inicio · título' },
    { name: 'page_eyebrow', type: 'text', label: 'Página del catálogo · texto pequeño' },
    { name: 'page_title',   type: 'text', label: 'Página del catálogo · título' },
    { name: 'footnote',     type: 'text', label: 'Nota al final del catálogo' },
  ]},
  { key: 'frases', title: 'Frases de la vitrina', icon: '💬', desc: 'Los bloques de color que aparecen entre las velas.', fields: [
    { name: 'items', type: 'group', label: 'Frases', addLabel: '+ Agregar frase', itemLabel: 'Frase', subfields: [
      { name: 'eyebrow', type: 'text', label: 'Texto pequeño (opcional)' },
      { name: 'text', type: 'textarea', label: 'Frase', rows: 2 },
    ]},
  ]},
  { key: 'tu_gusto', title: 'Tu vela, a tu gusto', icon: '🌸', desc: 'La sección de aromas (la lista de aromas se edita en Inventario → Aromas).', fields: [
    { name: 'title',      type: 'textarea', label: 'Título', rows: 2 },
    { name: 'text',       type: 'textarea', label: 'Descripción', rows: 2 },
    { name: 'list_title', type: 'text',     label: 'Título de la lista' },
    { name: 'band_title', type: 'textarea', label: 'Franja de color · título', rows: 2 },
    { name: 'band_text',  type: 'text',     label: 'Franja de color · texto' },
    { name: 'cta_label',  type: 'text',     label: 'Botón de la franja' },
  ]},
  { key: 'como_pedir', title: 'Cómo pedir', icon: '🛍️', desc: 'Los pasos numerados para hacer un pedido.', fields: [
    { name: 'eyebrow', type: 'text', label: 'Texto pequeño' },
    { name: 'title',   type: 'text', label: 'Título' },
    { name: 'steps', type: 'group', label: 'Pasos', addLabel: '+ Agregar paso', itemLabel: 'Paso', numbered: true, subfields: [
      { name: 'title', type: 'text', label: 'Título del paso' },
      { name: 'text', type: 'textarea', label: 'Explicación', rows: 2 },
    ]},
  ]},
  { key: 'cuidado', title: 'Cuidado', icon: '🔥', desc: 'Consejos de cuidado y la tarjeta de cada vela.', fields: [
    { name: 'eyebrow', type: 'text', label: 'Texto pequeño' },
    { name: 'title',   type: 'text', label: 'Título' },
    { name: 'text',    type: 'textarea', label: 'Descripción', rows: 2 },
    { name: 'steps', type: 'group', label: 'Consejos', addLabel: '+ Agregar consejo', itemLabel: 'Consejo', numbered: true, subfields: [
      { name: 'title', type: 'text', label: 'Título' },
      { name: 'text', type: 'textarea', label: 'Explicación', rows: 2 },
    ]},
    { name: 'card_title', type: 'text',     label: 'Tarjeta en cada vela · título' },
    { name: 'card_text',  type: 'textarea', label: 'Tarjeta en cada vela · texto', rows: 2 },
    { name: 'card_note',  type: 'text',     label: 'Tarjeta en cada vela · aviso' },
  ]},
  { key: 'pie', title: 'Pie de página', icon: '📍', desc: 'El bloque final de la página.', fields: [
    { name: 'tagline',  type: 'textarea', label: 'Frase', rows: 2 },
    { name: 'location', type: 'text', label: 'Ubicación' },
    { name: 'note',     type: 'text', label: 'Aviso' },
  ]},
  { key: 'general', title: 'Contacto y Google', icon: '📱', desc: 'WhatsApp de pedidos, Instagram y cómo aparece la página en Google y al compartirla.', fields: [
    { name: 'whatsapp',       type: 'text', label: 'WhatsApp de pedidos', hint: 'Formato internacional sin + ni espacios. Ej: 56976720121' },
    { name: 'whatsapp_label', type: 'text', label: 'Cómo se muestra el número', hint: 'Ej: +56 9 7672 0121' },
    { name: 'instagram', type: 'text', label: 'Usuario de Instagram', hint: 'Sin @. Ej: mimo.velas — se muestra en el pie de página y en el menú. Vacío = no se muestra' },
    { name: 'site_title',       type: 'text',     label: 'Título de la página (pestaña del navegador y Google)' },
    { name: 'site_description', type: 'textarea', label: 'Descripción (Google y al compartir el link)', rows: 2 },
  ]},
];

function openCatalogSite() { window.open(CATALOG_URL, '_blank', 'noopener'); }

const SiteEditor = { data: null, defaults: null, current: 'diseno', draft: null, dirty: false };

function siteEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Las tipografías de Google para la vista previa (una sola vez)
function loadSiteFonts() {
  if (document.getElementById('site-fonts')) return;
  const link = document.createElement('link');
  link.id = 'site-fonts';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=DM+Serif+Display&family=Cormorant+Garamond:wght@600&family=Lora:wght@600&family=Nunito:wght@400;700&family=DM+Sans:wght@400;700&family=Work+Sans:wght@400;700&family=Quicksand:wght@400;700&display=swap';
  document.head.appendChild(link);
}

async function loadSite() {
  loadSiteFonts();
  const el = document.getElementById('site-editor');
  try {
    const [data, defaults] = await Promise.all([API.site(), API.siteDefaults()]);
    SiteEditor.data = data;
    SiteEditor.defaults = defaults;
    selectSiteSection(SiteEditor.current, true);
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><h3>No se pudo cargar</h3><p>${siteEsc(err.message)}</p></div>`;
  }
}

function selectSiteSection(key, force = false) {
  if (!force && SiteEditor.dirty && !confirm('Tienes cambios sin guardar en esta sección. ¿Descartarlos?')) return;
  SiteEditor.current = key;
  if (key === 'categorias') { SiteEditor.dirty = false; return renderCategoriesEditor(); }
  if (key === 'arma_tu_vela') { SiteEditor.draft = JSON.parse(JSON.stringify(SiteEditor.data.arma_tu_vela)); SiteEditor.dirty = false; return renderBuilderEditor(); }
  if (key === 'banners' && !SiteEditor.products) {
    // El selector de velas de cada banner necesita la lista de productos
    return API.request('GET', '/products?admin=1').then(list => { SiteEditor.products = list; selectSiteSection(key, true); })
      .catch(err => toast(err.message, 'error'));
  }
  if (key === 'destacados') { SiteEditor.draft = JSON.parse(JSON.stringify(SiteEditor.data.destacados)); SiteEditor.dirty = false; return renderFeaturedEditor(); }
  SiteEditor.draft = JSON.parse(JSON.stringify(SiteEditor.data[key]));
  SiteEditor.dirty = false;
  renderSiteEditor();
}

function renderSiteEditor() {
  if (SiteEditor.current === 'destacados') return renderFeaturedEditor();
  if (SiteEditor.current === 'arma_tu_vela') return renderBuilderEditor();
  if (SiteEditor.current === 'categorias') return renderCategoriesEditor();
  const section = SITE_SECTIONS.find(s => s.key === SiteEditor.current);
  const el = document.getElementById('site-editor');
  el.innerHTML = `
    <div class="site-layout">
      <nav class="site-tabs">
        ${SITE_SECTIONS.map(s => `
          <button class="site-tab ${s.key === section.key ? 'active' : ''}" onclick="selectSiteSection('${s.key}')">
            <span>${s.icon}</span>${siteEsc(s.title)}
          </button>`).join('')}
      </nav>
      <div class="site-main">
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">${section.icon} ${siteEsc(section.title)}</div>
              <div class="site-desc">${siteEsc(section.desc)}</div>
            </div>
            <a class="btn btn-secondary btn-sm" href="${CATALOG_URL}" target="_blank" rel="noopener">Ver página ↗</a>
          </div>
          <div class="card-body">
            ${section.preview ? '<div id="site-preview"></div>' : ''}
            <div class="site-fields">${section.fields.map(f => renderSiteField(f, SiteEditor.draft[f.name], f.name)).join('')}</div>
          </div>
          <div class="card-footer site-footer">
            <button class="btn btn-ghost btn-sm" onclick="restoreSiteSection()">Restaurar valores originales</button>
            <span id="site-dirty" class="site-dirty" style="display:${SiteEditor.dirty ? '' : 'none'}">Cambios sin guardar</span>
            <button class="btn btn-primary" id="site-save-btn" onclick="saveSiteSection()">Guardar cambios</button>
          </div>
        </div>
      </div>
    </div>`;
  if (section.preview) renderSitePreview();
}

function renderSiteField(f, value, path) {
  const id = 'sf-' + path.replace(/[^a-z0-9]/gi, '-');
  const hint = f.hint ? `<small class="site-hint">${siteEsc(f.hint)}</small>` : '';
  switch (f.type) {
    case 'text':
      return `<div class="form-group"><label class="form-label" for="${id}">${siteEsc(f.label)}</label>
        <input id="${id}" class="form-control" value="${siteEsc(value)}" oninput="setSiteValue('${path}', this.value)" />${hint}</div>`;
    case 'textarea':
      return `<div class="form-group"><label class="form-label" for="${id}">${siteEsc(f.label)}</label>
        <textarea id="${id}" class="form-control" rows="${f.rows || 3}" oninput="setSiteValue('${path}', this.value)">${siteEsc(value)}</textarea>${hint}</div>`;
    case 'color':
      return `<div class="form-group site-color"><label class="form-label" for="${id}">${siteEsc(f.label)}</label>
        <div class="site-color-row">
          <input type="color" id="${id}" value="${siteEsc(value)}" oninput="setSiteValue('${path}', this.value.toUpperCase()); this.nextElementSibling.value=this.value.toUpperCase()" />
          <input class="form-control" value="${siteEsc(value)}" maxlength="7" oninput="if(/^#[0-9a-fA-F]{6}$/.test(this.value)){setSiteValue('${path}', this.value.toUpperCase()); this.previousElementSibling.value=this.value}" />
        </div>${hint}</div>`;
    case 'toggle':
      return `<div class="form-group"><label class="site-toggle">
        <input type="checkbox" ${value ? 'checked' : ''} onchange="setSiteValue('${path}', this.checked)" />
        <span class="site-switch"></span><span><strong>${siteEsc(f.label)}</strong>${f.hint ? `<br><small class="site-hint">${siteEsc(f.hint)}</small>` : ''}</span>
      </label></div>`;
    case 'font':
      return `<div class="form-group site-full"><label class="form-label">${siteEsc(f.label)}</label>
        <div class="site-fonts">${f.options.map(o => `
          <button type="button" class="site-font ${o.key === value ? 'active' : ''}" onclick="setSiteValue('${path}', '${o.key}'); renderSiteEditor()">
            <span class="site-font-sample" style="font-family:${o.family}">Aa</span>
            <span><strong>${siteEsc(o.label)}</strong><br><small>${siteEsc(o.hint)}</small></span>
          </button>`).join('')}</div></div>`;
    case 'image':
      return `<div class="form-group site-full"><label class="form-label">${siteEsc(f.label)}</label>
        <div class="site-image">
          ${value ? `<img src="${siteEsc(value)}" alt="" />` : '<div class="site-image-empty">Sin imagen</div>'}
          <div class="site-image-actions">
            <label class="btn btn-secondary btn-sm">${value ? 'Cambiar imagen' : 'Subir imagen'}
              <input type="file" accept="image/*" hidden onchange="uploadSiteImageField('${path}', this)" />
            </label>
            ${value ? `<button type="button" class="btn btn-ghost btn-sm" onclick="setSiteValue('${path}', ''); renderSiteEditor(); markSiteDirty()">Quitar</button>` : ''}
          </div>
        </div>${hint}</div>`;
    case 'list':
      return `<div class="form-group site-full"><label class="form-label">${siteEsc(f.label)}</label>
        <div class="site-list">${(value || []).map((v, i) => `
          <div class="site-list-row">
            <input class="form-control" value="${siteEsc(v)}" placeholder="${siteEsc(f.placeholder || '')}" oninput="setSiteValue('${path}.${i}', this.value)" />
            ${siteMoveButtons(path, i, value.length)}
          </div>`).join('')}</div>
        <button type="button" class="btn btn-secondary btn-sm" onclick="addSiteItem('${path}', '')">${siteEsc(f.addLabel || '+ Agregar')}</button></div>`;
    case 'products': {
      const all = SiteEditor.products || [];
      const byId = Object.fromEntries(all.map(p => [String(p.id), p]));
      const chosen = (value || []).filter(id => byId[id]);
      const selId = id + '-add';
      return `<div class="form-group site-full"><label class="form-label">${siteEsc(f.label)}</label>
        <div class="site-group">${chosen.length ? chosen.map((pid, i) => {
          const p = byId[pid];
          return `<div class="site-feat">
            ${p.image ? `<img src="${siteEsc(p.image)}" alt="" />` : '<span class="site-feat-ph">🕯️</span>'}
            <div><strong>${siteEsc(p.name)}</strong><br><small>${siteEsc(p.category_name || '')} · $${Number(p.sale_price).toLocaleString('es-CL')}</small></div>
            ${siteMoveButtons(path, (value || []).indexOf(pid), (value || []).length)}
          </div>`;
        }).join('') : '<p class="site-hint">Sin velas elegidas.</p>'}</div>
        <div class="site-list-row" style="margin-top:8px">
          <select class="form-control" id="${selId}">
            <option value="">Elige una vela para agregar…</option>
            ${all.filter(p => !chosen.includes(String(p.id))).map(p => `<option value="${p.id}">${siteEsc(p.name)}</option>`).join('')}
          </select>
          <button type="button" class="btn btn-secondary btn-sm" onclick="addSiteProduct('${path}', '${selId}')">+ Agregar</button>
        </div>${hint}</div>`;
    }
    case 'group': {
      const blank = Object.fromEntries(f.subfields.map(s => [s.name, s.type === 'products' || s.type === 'list' ? [] : s.type === 'toggle' ? false : '']));
      return `<div class="form-group site-full"><label class="form-label">${siteEsc(f.label)}</label>
        <div class="site-group">${(value || []).map((item, i) => `
          <div class="site-group-item">
            <div class="site-group-head"><strong>${f.numbered ? String(i + 1).padStart(2, '0') : siteEsc(f.itemLabel) + ' ' + (i + 1)}</strong>${siteMoveButtons(path, i, value.length)}</div>
            ${f.subfields.map(sf => renderSiteField(sf, item[sf.name], `${path}.${i}.${sf.name}`)).join('')}
          </div>`).join('')}</div>
        <button type="button" class="btn btn-secondary btn-sm" onclick='addSiteItem("${path}", ${JSON.stringify(blank)})'>${siteEsc(f.addLabel || '+ Agregar')}</button></div>`;
    }
  }
  return '';
}

function addSiteProduct(path, selId) {
  const id = document.getElementById(selId).value;
  if (!id) return;
  const [obj, key] = siteRef(path);
  const valid = (obj[key] || []).filter(x => (SiteEditor.products || []).some(p => String(p.id) === x));
  obj[key] = [...valid, id];
  markSiteDirty();
  renderSiteEditor();
}

function siteMoveButtons(path, i, total) {
  return `<span class="site-move">
    <button type="button" class="btn btn-ghost btn-sm btn-icon" title="Subir" ${i === 0 ? 'disabled' : ''} onclick="moveSiteItem('${path}', ${i}, -1)">↑</button>
    <button type="button" class="btn btn-ghost btn-sm btn-icon" title="Bajar" ${i === total - 1 ? 'disabled' : ''} onclick="moveSiteItem('${path}', ${i}, 1)">↓</button>
    <button type="button" class="btn btn-ghost btn-sm btn-icon" title="Quitar" onclick="removeSiteItem('${path}', ${i})">🗑️</button>
  </span>`;
}

// path tipo "steps.1.title" sobre el borrador de la sección actual
function siteRef(path) {
  const parts = path.split('.');
  const last = parts.pop();
  let obj = SiteEditor.draft;
  for (const p of parts) obj = obj[p];
  return [obj, last];
}

function markSiteDirty() {
  SiteEditor.dirty = true;
  const d = document.getElementById('site-dirty');
  if (d) d.style.display = '';
}

function setSiteValue(path, value) {
  const [obj, key] = siteRef(path);
  obj[key] = value;
  markSiteDirty();
  if (SiteEditor.current === 'diseno') renderSitePreview();
}

function addSiteItem(path, blank) {
  const [obj, key] = siteRef(path);
  obj[key] = [...(obj[key] || []), JSON.parse(JSON.stringify(blank))];
  markSiteDirty();
  renderSiteEditor();
}

function removeSiteItem(path, i) {
  const [obj, key] = siteRef(path);
  obj[key].splice(i, 1);
  markSiteDirty();
  renderSiteEditor();
}

function moveSiteItem(path, i, dir) {
  const [obj, key] = siteRef(path);
  const list = obj[key];
  [list[i], list[i + dir]] = [list[i + dir], list[i]];
  markSiteDirty();
  renderSiteEditor();
}

function restoreSiteSection() {
  if (!confirm('¿Volver a los valores originales de esta sección? Tendrás que guardar para aplicarlos.')) return;
  SiteEditor.draft = JSON.parse(JSON.stringify(SiteEditor.defaults[SiteEditor.current]));
  renderSiteEditor();
  markSiteDirty();
}

async function saveSiteSection() {
  const btn = document.getElementById('site-save-btn');
  btn.disabled = true;
  btn.textContent = 'Guardando…';
  try {
    const saved = await API.saveSite(SiteEditor.current, SiteEditor.draft);
    SiteEditor.data[SiteEditor.current] = saved;
    SiteEditor.draft = JSON.parse(JSON.stringify(saved));
    SiteEditor.dirty = false;
    renderSiteEditor();
    toast('Guardado ✓ Ya se ve en la página', 'success');
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Guardar cambios';
  }
}

// Vista previa en vivo de colores y tipografías
function renderSitePreview() {
  const el = document.getElementById('site-preview');
  if (!el) return;
  const d = SiteEditor.draft;
  const display = (DISPLAY_FONTS.find(f => f.key === d.font_display) || DISPLAY_FONTS[0]).family;
  const body = (BODY_FONTS.find(f => f.key === d.font_body) || BODY_FONTS[0]).family;
  el.innerHTML = `
    <div class="site-preview" style="background:${d.background};color:${d.ink};font-family:${body}">
      <div class="site-preview-hero" style="background:${d.primary}">
        <small style="font-family:${body}">VELAS AROMÁTICAS</small>
        <div style="font-family:${display}">Un detalle que huele y se ve bien.</div>
        <span class="site-preview-btn" style="background:${d.background};color:${d.primary};font-family:${body}">VER LAS VELAS →</span>
      </div>
      <div class="site-preview-cards">
        <div class="site-preview-card" style="background:${d.soft1}"><span style="background:${d.primary}">+</span></div>
        <div class="site-preview-card" style="background:${d.soft2}"><span style="background:${d.secondary}">+</span></div>
        <div class="site-preview-text">
          <div style="font-family:${display};color:${d.primary};font-size:1.15rem;font-weight:600">Mandarín Martini</div>
          <div style="font-size:.78rem;opacity:.7">Aroma a mandarina</div>
          <div style="font-family:${display};font-weight:600;margin-top:4px">$16.990</div>
        </div>
      </div>
    </div>`;
}

// ── Imágenes de banners ───────────────────────────
async function uploadSiteImage(file) {
  // Los PNG se mantienen PNG (pueden traer fondo transparente); el resto se achica a JPG
  const small = file.type === 'image/png' ? await shrinkPng(file, 1200)
    : typeof compressImage === 'function' ? await compressImage(file, 2000, 0.85) : file;
  const { url } = await API.uploadSiteImage(small);
  return url;
}

async function uploadSiteImageField(path, input) {
  const file = input.files && input.files[0];
  if (!file) return;
  try {
    toast('Subiendo imagen…', 'info');
    setSiteValue(path, await uploadSiteImage(file));
    renderSiteEditor();
    markSiteDirty();
  } catch (err) { toast(err.message, 'error'); }
}

function siteCard(section, body, footer) {
  return `
    <div class="site-layout">
      <nav class="site-tabs">
        ${SITE_SECTIONS.map(s => `
          <button class="site-tab ${s.key === section.key ? 'active' : ''}" onclick="selectSiteSection('${s.key}')">
            <span>${s.icon}</span>${siteEsc(s.title)}
          </button>`).join('')}
      </nav>
      <div class="site-main">
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">${section.icon} ${siteEsc(section.title)}</div>
              <div class="site-desc">${siteEsc(section.desc)}</div>
            </div>
            <a class="btn btn-secondary btn-sm" href="${CATALOG_URL}" target="_blank" rel="noopener">Ver página ↗</a>
          </div>
          <div class="card-body">${body}</div>
          ${footer ? `<div class="card-footer site-footer">${footer}</div>` : ''}
        </div>
      </div>
    </div>`;
}

// ── Categorías: banner, descripción, orden y visibilidad en el inicio ──
async function renderCategoriesEditor() {
  const section = SITE_SECTIONS.find(s => s.key === 'categorias');
  const el = document.getElementById('site-editor');
  const cats = await API.categories();
  SiteEditor.categories = cats;
  el.innerHTML = siteCard(section, `
    <div class="site-group">
      ${cats.map((c, i) => `
        <div class="site-group-item site-cat">
          <div class="site-group-head">
            <strong>${siteEsc(c.icon || '')} ${siteEsc(c.name)}</strong>
            <span class="site-move">
              <button type="button" class="btn btn-ghost btn-sm btn-icon" title="Subir" ${i === 0 ? 'disabled' : ''} onclick="moveCategory(${i}, -1)">↑</button>
              <button type="button" class="btn btn-ghost btn-sm btn-icon" title="Bajar" ${i === cats.length - 1 ? 'disabled' : ''} onclick="moveCategory(${i}, 1)">↓</button>
            </span>
          </div>
          <div class="site-cat-body">
            <div class="site-image">
              ${c.image ? `<img src="${siteEsc(c.image)}" alt="" />` : '<div class="site-image-empty">Sin banner<br><small>se usa su color</small></div>'}
              <div class="site-image-actions">
                <label class="btn btn-secondary btn-sm">${c.image ? 'Cambiar banner' : 'Subir banner'}
                  <input type="file" accept="image/*" hidden onchange="uploadCategoryBanner(${c.id}, this)" />
                </label>
                ${c.image ? `<button type="button" class="btn btn-ghost btn-sm" onclick="saveCategoryField(${c.id}, { image: '' })">Quitar</button>` : ''}
              </div>
            </div>
            <div>
              <div class="form-group">
                <label class="form-label">Nombre</label>
                <input class="form-control" value="${siteEsc(c.name)}" onchange="saveCategoryField(${c.id}, { name: this.value })" />
              </div>
              <div class="form-group">
                <label class="form-label">Descripción (se ve en su banner)</label>
                <textarea class="form-control" rows="2" placeholder="Ej: Todo lo que se come con cuchara." onchange="saveCategoryField(${c.id}, { description: this.value })">${siteEsc(c.description || '')}</textarea>
              </div>
              <label class="site-toggle">
                <input type="checkbox" ${c.show_home ? 'checked' : ''} onchange="saveCategoryField(${c.id}, { show_home: this.checked })" />
                <span class="site-switch"></span><span><strong>Mostrar en "Compra por categoría" del inicio</strong></span>
              </label>
            </div>
          </div>
        </div>`).join('')}
    </div>
    <div class="site-list-row" style="margin-top:14px">
      <input class="form-control" id="new-cat-name" placeholder="Nueva categoría (ej: Wax melts, Arma tu vela)" onkeydown="if(event.key==='Enter')createCategoryFromSite()" />
      <button class="btn btn-primary btn-sm" onclick="createCategoryFromSite()">+ Crear categoría</button>
    </div>
    <small class="site-hint">Los cambios se guardan al momento. Para borrar una categoría: Inventario → Categorías.</small>
  `);
}

async function saveCategoryField(id, patch) {
  try {
    await API.updateCategory(id, patch);
    toast('Guardado ✓', 'success');
    if ('image' in patch || 'name' in patch) await renderCategoriesEditor();
  } catch (err) { toast(err.message, 'error'); }
}

async function uploadCategoryBanner(id, input) {
  const file = input.files && input.files[0];
  if (!file) return;
  try {
    toast('Subiendo banner…', 'info');
    await saveCategoryField(id, { image: await uploadSiteImage(file) });
  } catch (err) { toast(err.message, 'error'); }
}

async function moveCategory(i, dir) {
  const cats = SiteEditor.categories.slice();
  [cats[i], cats[i + dir]] = [cats[i + dir], cats[i]];
  try {
    await Promise.all(cats.map((c, pos) => API.updateCategory(c.id, { position: pos + 1 })));
    await renderCategoriesEditor();
  } catch (err) { toast(err.message, 'error'); }
}

async function createCategoryFromSite() {
  const input = document.getElementById('new-cat-name');
  const name = input.value.trim();
  if (!name) return toast('Escribe el nombre de la categoría', 'warning');
  try {
    await API.createCategory({ name, icon: '🕯️', color: '#62121D' });
    toast(`Categoría "${name}" creada ✓`, 'success');
    await renderCategoriesEditor();
  } catch (err) { toast(err.message, 'error'); }
}

// ── Más vendidos: elegir y ordenar velas ───────────
async function renderFeaturedEditor() {
  const section = SITE_SECTIONS.find(s => s.key === 'destacados');
  const el = document.getElementById('site-editor');
  if (!SiteEditor.products) SiteEditor.products = await API.request('GET', '/products?admin=1');
  const d = SiteEditor.draft;
  const byId = Object.fromEntries(SiteEditor.products.map(p => [String(p.id), p]));
  const chosen = d.product_ids.filter(id => byId[id]);
  const available = SiteEditor.products.filter(p => !chosen.includes(String(p.id)));
  el.innerHTML = siteCard(section, `
    <div class="site-fields">
      ${renderSiteField({ name: 'eyebrow', type: 'text', label: 'Texto pequeño' }, d.eyebrow, 'eyebrow')}
      ${renderSiteField({ name: 'title', type: 'text', label: 'Título' }, d.title, 'title')}
    </div>
    <label class="form-label" style="margin-top:6px">Velas elegidas (en este orden)</label>
    <div class="site-group">
      ${chosen.length ? chosen.map((id, i) => {
        const p = byId[id];
        return `<div class="site-feat">
          ${p.image ? `<img src="${siteEsc(p.image)}" alt="" />` : '<span class="site-feat-ph">🕯️</span>'}
          <div><strong>${siteEsc(p.name)}</strong><br><small>${siteEsc(p.category_name || '')} · $${Number(p.sale_price).toLocaleString('es-CL')}</small></div>
          ${siteMoveButtons('product_ids', i, chosen.length)}
        </div>`;
      }).join('') : '<p class="site-hint">Todavía no eliges ninguna. Agrega velas abajo.</p>'}
    </div>
    <div class="site-list-row" style="margin-top:10px">
      <select class="form-control" id="feat-add">
        <option value="">Elige una vela para agregar…</option>
        ${available.map(p => `<option value="${p.id}">${siteEsc(p.name)}</option>`).join('')}
      </select>
      <button class="btn btn-secondary btn-sm" onclick="addFeatured()">+ Agregar</button>
    </div>
    <div class="form-group" style="margin-top:16px">
      ${renderSiteField({ name: 'auto', type: 'toggle', label: 'Completar con las más vendidas reales', hint: 'Si eliges menos de 4, se completan con las velas que más se venden en el sistema.' }, d.auto, 'auto')}
    </div>
  `, `<span id="site-dirty" class="site-dirty" style="display:${SiteEditor.dirty ? '' : 'none'}">Cambios sin guardar</span>
      <button class="btn btn-primary" id="site-save-btn" onclick="saveSiteSection()">Guardar cambios</button>`);
}

function addFeatured() {
  const id = document.getElementById('feat-add').value;
  if (!id) return;
  SiteEditor.draft.product_ids = [...SiteEditor.draft.product_ids.filter(x => SiteEditor.products.some(p => String(p.id) === x)), id];
  markSiteDirty();
  renderFeaturedEditor();
}

// ── Arma tu vela: ajustes + toppings ──────────────
const BUILDER_FIELDS = [
  { name: 'enabled', type: 'toggle', label: 'Mostrar "Arma tu vela" en la página', hint: 'Aparece en el menú, en el inicio y en /arma-tu-vela' },
  { name: 'eyebrow', type: 'text', label: 'Texto pequeño' },
  { name: 'title', type: 'text', label: 'Título' },
  { name: 'text', type: 'textarea', label: 'Descripción', rows: 2 },
  { name: 'base_name', type: 'text', label: 'Nombre de la base', hint: 'Ej: Lata dorada' },
  { name: 'base_price', type: 'text', label: 'Precio de la base (con su aroma)', hint: 'En pesos, sin puntos. Ej: 17990' },
  { name: 'max_toppings', type: 'text', label: 'Máximo de toppings por vela', hint: 'Ej: 5' },
  { name: 'base_image', type: 'image', label: 'Foto de la lata (opcional)', hint: 'Se muestra en el carrito. En la página, la lata es un dibujo con los toppings cayendo.' },
  { name: 'note', type: 'textarea', label: 'Nota al final', rows: 2 },
];

async function renderBuilderEditor(refetch = true) {
  const section = SITE_SECTIONS.find(s => s.key === 'arma_tu_vela');
  const el = document.getElementById('site-editor');
  // Al calibrar (deslizadores, mechas) no hace falta volver a pedir los toppings
  const toppings = refetch || !SiteEditor.toppings ? await API.toppings() : SiteEditor.toppings;
  SiteEditor.toppings = toppings;
  const d = SiteEditor.draft;
  el.innerHTML = siteCard(section, `
    <div class="site-fields">${BUILDER_FIELDS.map(f => renderSiteField(f, d[f.name], f.name)).join('')}</div>
    <div class="site-builder-save">
      <span id="site-dirty" class="site-dirty" style="display:${SiteEditor.dirty ? '' : 'none'}">Cambios sin guardar</span>
      <button class="btn btn-primary btn-sm" id="site-save-btn" onclick="saveSiteSection()">Guardar ajustes</button>
    </div>

    <div class="site-section-sep">
      <div class="card-title">Toppings</div>
      <div class="site-desc">Las decoraciones que el cliente puede poner sobre su vela. Se guardan al momento.
        La foto se ve en una burbuja redonda: mientras más centrada esté la pieza, mejor se ve sobre la lata.</div>
    </div>
    <div class="site-toppings">
      ${toppings.map((t, i) => `
        <div class="site-topping ${t.active ? '' : 'is-off'}">
          <label class="site-topping-img" title="Cambiar foto">
            ${t.image ? `<img src="${siteEsc(t.image)}" alt="" />` : '<span>+ foto</span>'}
            <input type="file" accept="image/*" hidden onchange="uploadToppingImage(${t.id}, this)" />
          </label>
          <div class="site-topping-fields">
            <input class="form-control" value="${siteEsc(t.name)}" onchange="saveTopping(${t.id}, { name: this.value })" />
            <div class="site-topping-price">
              <span>+ $</span>
              <input class="form-control" type="number" min="0" step="100" value="${t.price}" onchange="saveTopping(${t.id}, { price: this.value })" />
            </div>
          </div>
          <div class="site-topping-actions">
            <label class="site-toggle" title="Activo">
              <input type="checkbox" ${t.active ? 'checked' : ''} onchange="saveTopping(${t.id}, { active: this.checked }, true)" />
              <span class="site-switch"></span>
            </label>
            <span class="site-move">
              <button type="button" class="btn btn-ghost btn-sm btn-icon" title="Subir" ${i === 0 ? 'disabled' : ''} onclick="moveTopping(${i}, -1)">↑</button>
              <button type="button" class="btn btn-ghost btn-sm btn-icon" title="Bajar" ${i === toppings.length - 1 ? 'disabled' : ''} onclick="moveTopping(${i}, 1)">↓</button>
              <button type="button" class="btn btn-ghost btn-sm btn-icon" title="Eliminar" onclick="deleteTopping(${t.id}, this.dataset.name)" data-name="${siteEsc(t.name)}">🗑️</button>
            </span>
          </div>
        </div>`).join('')}
      <label class="site-topping site-topping-new">
        <span class="site-topping-img"><span>+</span></span>
        <div><strong>Agregar topping</strong><br><small class="site-hint">Elige una foto; después le pones nombre y precio</small></div>
        <input type="file" accept="image/*" hidden onchange="createToppingFromPhoto(this)" />
      </label>
    </div>
  `);
}

async function saveTopping(id, patch, rerender = false) {
  try {
    await API.updateTopping(id, patch);
    toast('Guardado ✓', 'success');
    if (rerender || 'image' in patch) await renderBuilderEditor();
  } catch (err) { toast(err.message, 'error'); }
}

async function uploadToppingImage(id, input) {
  const file = input.files && input.files[0];
  if (!file) return;
  try {
    toast('Subiendo foto…', 'info');
    await saveTopping(id, { image: await uploadSiteImage(file) });
  } catch (err) { toast(err.message, 'error'); }
}

async function createToppingFromPhoto(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  try {
    toast('Subiendo foto…', 'info');
    const image = await uploadSiteImage(file);
    const base = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
    await API.createTopping({ name: base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Nuevo topping', image, price: 0 });
    toast('Topping agregado ✓ Cámbiale el nombre si quieres', 'success');
    await renderBuilderEditor();
  } catch (err) { toast(err.message, 'error'); }
}

async function moveTopping(i, dir) {
  const list = SiteEditor.toppings.slice();
  [list[i], list[i + dir]] = [list[i + dir], list[i]];
  try {
    await Promise.all(list.map((t, pos) => API.updateTopping(t.id, { position: pos + 1 })));
    await renderBuilderEditor();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteTopping(id, name) {
  if (!confirm(`¿Eliminar el topping "${name}"?`)) return;
  try {
    await API.deleteTopping(id);
    toast('Topping eliminado', 'info');
    await renderBuilderEditor();
  } catch (err) { toast(err.message, 'error'); }
}

// Achica un PNG grande manteniendo la transparencia
async function shrinkPng(file, maxSize) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 3 * 1024 * 1024) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    return blob ? new File([blob], 'pieza.png', { type: 'image/png' }) : file;
  } catch { return file; }
}
