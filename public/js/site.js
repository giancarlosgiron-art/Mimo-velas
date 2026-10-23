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
  SiteEditor.draft = JSON.parse(JSON.stringify(SiteEditor.data[key]));
  SiteEditor.dirty = false;
  renderSiteEditor();
}

function renderSiteEditor() {
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
            <span id="site-dirty" class="site-dirty" style="display:none">Cambios sin guardar</span>
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
    case 'list':
      return `<div class="form-group site-full"><label class="form-label">${siteEsc(f.label)}</label>
        <div class="site-list">${(value || []).map((v, i) => `
          <div class="site-list-row">
            <input class="form-control" value="${siteEsc(v)}" placeholder="${siteEsc(f.placeholder || '')}" oninput="setSiteValue('${path}.${i}', this.value)" />
            ${siteMoveButtons(path, i, value.length)}
          </div>`).join('')}</div>
        <button type="button" class="btn btn-secondary btn-sm" onclick="addSiteItem('${path}', '')">${siteEsc(f.addLabel || '+ Agregar')}</button></div>`;
    case 'group': {
      const blank = Object.fromEntries(f.subfields.map(s => [s.name, '']));
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
  document.getElementById('site-dirty').style.display = '';
}

function removeSiteItem(path, i) {
  const [obj, key] = siteRef(path);
  obj[key].splice(i, 1);
  markSiteDirty();
  renderSiteEditor();
  document.getElementById('site-dirty').style.display = '';
}

function moveSiteItem(path, i, dir) {
  const [obj, key] = siteRef(path);
  const list = obj[key];
  [list[i], list[i + dir]] = [list[i + dir], list[i]];
  markSiteDirty();
  renderSiteEditor();
  document.getElementById('site-dirty').style.display = '';
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
