// ── Mimito: el asesor de voz de mimo, dentro del panel ──────────
(() => {
  const FLAME = `<svg viewBox="0 0 80 125" aria-hidden="true"><g transform="translate(-726 -130)">
    <path d="M745.65,248.63 C734.55,242.30 728.01,230.84 728.00,217.71 C728.00,203.48 732.10,194.13 747.10,174.27 C760.09,157.05 765.27,143.88 763.50,132.52 C763.05,129.60 763.32,129.450 765.34,131.52 C771.63,137.97 777.66,152.72 778.73,164.25 C780.47,183.03 775.55,196.11 762.06,208.56 C752.66,217.24 748.32,222.74 746.55,228.25 C744.26,235.32 744.69,241.46 747.88,247.48 C749.32,250.18 748.81,250.43 745.65,248.63 Z"/>
    <path d="M770.62,253.24 C770.44,252.96 770.65,252.65 772.00,251.12 C776.15,246.47 775.62,238.10 770.79,232.29 C764.64,224.88 765.65,215.80 774.09,202.62 C780.56,192.53 783.65,182.56 784.07,170.38 C784.16,167.84 784.79,168.13 787.82,172.11 C792.13,177.74 796.74,187.06 799.60,195.95 C806.92,218.65 800.05,241.73 783.51,250.00 C779.49,252.01 771.15,254.11 770.62,253.24 Z"/></g></svg>`;

  const host = document.getElementById('app-layout') || document.body;
  host.insertAdjacentHTML('beforeend', `
    <button id="mm-fab" type="button" aria-label="Abrir Mimito" title="Mimito · tu asesor">${FLAME}</button>
    <aside id="mm-panel" aria-label="Mimito" hidden>
      <header class="mm-head">
        <div class="mm-flame">${FLAME}</div>
        <div class="mm-title"><b>mimito</b><span id="mm-status">Toca el micrófono o escríbeme</span></div>
        <button type="button" id="mm-wake" class="mm-chip" aria-pressed="false" title="Di «mimito activo» y te escucho sin tocar nada">Escucha siempre</button>
        <button type="button" id="mm-reset" class="mm-icon" title="Conversación nueva">↺</button>
        <button type="button" id="mm-close" class="mm-icon" aria-label="Cerrar">✕</button>
      </header>
      <div id="mm-log">
        <div class="mm-hello">Hola, soy Mimito. Pregúntame cómo va mimo, pídeme ideas para Instagram, o cuéntame lo que compraste y lo anoto en el panel.
          <div class="mm-chips">
            <button type="button">¿Qué hay para hacer hoy?</button>
            <button type="button">¿Cómo van las ventas este mes?</button>
            <button type="button">¿Qué insumos tengo que reponer?</button>
            <button type="button">Dame 3 ideas de reels</button>
          </div>
        </div>
      </div>
      <div id="mm-interim"></div>
      <form id="mm-form" autocomplete="off">
        <button type="button" id="mm-mic" aria-label="Hablar">🎙️</button>
        <input id="mm-text" placeholder="Escríbele a Mimito…" />
        <button type="submit" id="mm-send" aria-label="Enviar">➤</button>
      </form>
    </aside>`);

  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  let state = 'idle', controller = null, speakQueue = 0, streamDone = true;
  let sessionId = store.get('mimito.session');

  const open = () => { $('mm-panel').hidden = false; document.body.classList.add('mm-open'); store.set('mimito.open', '1'); setTimeout(() => $('mm-text').focus(), 50); };
  const close = () => { $('mm-panel').hidden = true; document.body.classList.remove('mm-open'); store.set('mimito.open', '0'); };
  $('mm-fab').onclick = () => ($('mm-panel').hidden ? open() : close());
  $('mm-close').onclick = close;
  if (store.get('mimito.open') === '1' && window.innerWidth > 768) open();

  function setState(s, text) {
    state = s; $('mm-panel').dataset.state = s; $('mm-fab').dataset.state = s;
    const labels = { idle: wakeOn ? 'Di «mimito activo» o toca el micrófono' : 'Toca el micrófono o escríbeme', listening: 'Te escucho…', thinking: 'Mimito está pensando…', speaking: 'Hablando · toca el micrófono para callarlo' };
    $('mm-status').textContent = text || labels[s];
    if (s === 'idle') scheduleWake(); else stopWake();
  }

  function addMsg(cls, text) {
    const el = document.createElement('div');
    el.className = 'mm-msg mm-' + cls; el.textContent = text;
    $('mm-log').appendChild(el); $('mm-log').scrollTop = $('mm-log').scrollHeight;
    return el;
  }
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  function fmt(t) {
    return t.split(/((?:^\|.*\|[ \t]*(?:\n|$))+)/m).map((blk) => {
      if (!/^\|/.test(blk)) return inline(blk).replace(/^#{1,4} (.+)$/gm, '<b>$1</b>');
      const rows = blk.trim().split('\n').filter((r) => !/^\|[\s:|-]+\|$/.test(r.trim()));
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
      const [head, ...body] = rows;
      return '<div class="mm-table"><table><thead><tr>' + cells(head).map((c) => `<th>${c}</th>`).join('') + '</tr></thead><tbody>' +
        body.map((r) => '<tr>' + cells(r).map((c) => `<td>${c}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>';
    }).join('');
  }
  function render(el, text) {
    const parts = text.split(/(<pantalla>[\s\S]*?(?:<\/pantalla>|$))/);
    el.innerHTML = parts.map((p) => {
      if (!p.startsWith('<pantalla>')) return fmt(p.replace(/<\/?p(a(n(t(a(l(la?)?)?)?)?)?)?$/, '')).trim();
      const body = p.replace(/^<pantalla>\s*/, '').replace(/\s*<\/pantalla>$/, '');
      return `<div class="mm-screen"><button class="mm-copy" type="button">Copiar</button>${fmt(body)}</div>`;
    }).filter(Boolean).join('');
    $('mm-log').scrollTop = $('mm-log').scrollHeight;
  }
  $('mm-log').addEventListener('click', (e) => {
    const c = e.target.closest('.mm-copy');
    if (c) {
      const txt = c.parentElement.innerText.replace(/^(Copiar|¡Copiado!)\s*/, '');
      navigator.clipboard?.writeText(txt).then(() => { c.textContent = '¡Copiado!'; setTimeout(() => (c.textContent = 'Copiar'), 1500); });
    }
    const chip = e.target.closest('.mm-chips button');
    if (chip) { stopAll(); ask(chip.textContent); }
  });

  // ── Voz (síntesis del navegador) ──
  const synth = window.speechSynthesis;
  let voice = null;
  function pickVoice() {
    const vs = (synth?.getVoices() || []).filter(v => v.lang.toLowerCase().startsWith('es'));
    const pref = ['Paulina', 'Mónica', 'Google español de Estados Unidos', 'Google español', 'Marisol'];
    voice = pref.map(p => vs.find(v => v.name.includes(p))).find(Boolean) || vs[0] || null;
  }
  if (synth) { pickVoice(); synth.onvoiceschanged = pickVoice; }
  function speak(text) {
    if (!synth) return;
    text = text.replace(/[*_#`>\[\]]/g, '').replace(/https?:\/\/\S+/g, '').trim();
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'es-MX';
    u.rate = 1.05; u.pitch = 1.25;
    speakQueue++; setState('speaking');
    u.onend = u.onerror = () => { speakQueue--; maybeFinished(); };
    synth.speak(u);
  }
  function maybeFinished() { if (speakQueue > 0 || !streamDone) return; setState('idle'); }
  function stopAll() {
    if (controller) controller.abort();
    synth?.cancel(); speakQueue = 0; streamDone = true;
    if (recog) try { recog.abort(); } catch {}
    setState('idle');
  }

  // ── Oído (Chrome) ──
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recog = null;
  async function listen() {
    if (!SR) { setState('idle', 'Este navegador no reconoce voz: usa Chrome o escríbeme.'); return; }
    synth?.cancel(); await stopWake();
    recog = new SR(); recog.lang = 'es-MX'; recog.interimResults = true; recog.continuous = false;
    let finalText = '';
    recog.onstart = () => setState('listening');
    recog.onresult = (e) => {
      let interim = '';
      for (const r of e.results) (r.isFinal ? (finalText = r[0].transcript) : (interim += r[0].transcript));
      $('mm-interim').textContent = finalText || interim;
    };
    recog.onerror = (e) => {
      if (e.error === 'not-allowed') setState('idle', 'Necesito permiso del micrófono 🎙️');
      else if (e.error === 'no-speech') setState('idle', 'No te escuché… toca el micrófono otra vez.');
    };
    recog.onend = () => {
      $('mm-interim').textContent = '';
      if (finalText.trim()) ask(finalText.trim()); else if (state === 'listening') setState('idle');
    };
    try { recog.start(); } catch {}
  }

  // ── «mimito activo» ──
  let wakeOn = store.get('mimito.wake') === '1', wakeRec = null, wakeTimer = null, wakeEnded = null;
  const WAKE_RE = /\b(mi ?mito|mimitos?|bonito)[ ,.]*(activ[oa]|actívate|activate)\b/i;
  function chime() {
    try {
      const ctx = chime.ctx || (chime.ctx = new (window.AudioContext || window.webkitAudioContext)());
      [[660, 0], [990, .12]].forEach(([f, t]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f; o.type = 'sine';
        g.gain.setValueAtTime(0, ctx.currentTime + t); g.gain.linearRampToValueAtTime(.18, ctx.currentTime + t + .02);
        g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + t + .25);
        o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + .3);
      });
    } catch {}
  }
  function scheduleWake() { clearTimeout(wakeTimer); if (wakeOn) wakeTimer = setTimeout(startWake, 500); }
  function startWake() {
    if (!SR || !wakeOn || wakeRec || state !== 'idle' || !App?.user) return;
    const r = new SR(); r.lang = 'es-MX'; r.continuous = true; r.interimResults = true;
    let fired = false;
    r.onresult = (e) => {
      if (fired) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript, m = WAKE_RE.exec(t);
        if (!m) continue;
        const resto = t.slice(m.index + m[0].length).replace(/^[\s,.]+/, '');
        if (!e.results[i].isFinal && resto.length < 4) return;
        fired = true; chime(); open();
        stopWake().then(() => (resto.length >= 4 ? ask(resto) : listen()));
        return;
      }
    };
    r.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { setWake(false); setState('idle', 'Necesito permiso del micrófono 🎙️ para escuchar «mimito activo».'); } };
    r.onend = () => { wakeRec = null; if (wakeEnded) { wakeEnded(); wakeEnded = null; } else if (!fired) scheduleWake(); };
    try { r.start(); wakeRec = r; } catch { wakeRec = null; }
  }
  function stopWake() {
    clearTimeout(wakeTimer);
    if (!wakeRec) return Promise.resolve();
    return new Promise((res) => { wakeEnded = res; try { wakeRec.abort(); } catch { wakeRec = null; res(); } setTimeout(res, 800); });
  }
  function setWake(on) {
    wakeOn = on; store.set('mimito.wake', on ? '1' : '0');
    $('mm-wake').setAttribute('aria-pressed', on); $('mm-fab').classList.toggle('mm-awake', on);
    if (!on) stopWake();
    if (state === 'idle') setState('idle');
  }
  $('mm-wake').onclick = () => { chime(); setWake(!wakeOn); };

  // ── Cerebro ──
  async function ask(text) {
    open();
    $('mm-log').querySelector('.mm-hello')?.remove();
    addMsg('you', text);
    setState('thinking'); streamDone = false;
    const bubble = addMsg('mimi', '');
    let full = '', pos = 0, inScreen = false, cambio = false;
    controller = new AbortController();
    const speakSentences = (seg, force) => {
      const re = /[^.!?¡¿…\n]*[.!?…\n]+["')»]?\s*/g; let m, last = 0;
      while ((m = re.exec(seg))) { if (m[0].trim().length > 1) speak(m[0]); last = re.lastIndex; }
      if (force && seg.slice(last).trim()) { speak(seg.slice(last)); last = seg.length; }
      return last;
    };
    const flush = (force) => {
      while (pos < full.length) {
        if (inScreen) { const end = full.indexOf('</pantalla>', pos); if (end < 0) return; inScreen = false; pos = end + 11; continue; }
        const start = full.indexOf('<pantalla>', pos);
        if (start >= 0) { speakSentences(full.slice(pos, start), true); inScreen = true; pos = start + 10; continue; }
        let seg = full.slice(pos); const lt = seg.lastIndexOf('<');
        if (!force && lt >= 0 && seg.length - lt < 11) seg = seg.slice(0, lt);
        pos += speakSentences(seg, force); return;
      }
    };
    try {
      const res = await fetch('/api/mimito/chat', {
        method: 'POST', headers: API.headers(),
        body: JSON.stringify({ message: text, sessionId }), signal: controller.signal,
      });
      if (!res.ok || !res.body) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Error ' + res.status); }
      const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = /event: (\w+)/.exec(chunk)?.[1]; const data = JSON.parse(/data: (.*)/s.exec(chunk)?.[1] || '{}');
          if (ev === 'delta') { full += data.text; render(bubble, full); flush(false); }
          else if (ev === 'status') $('mm-status').textContent = data.text;
          else if (ev === 'error') addMsg('err', data.text);
          else if (ev === 'panel') cambio = true;
          else if (ev === 'done' && data.sessionId) { sessionId = data.sessionId; store.set('mimito.session', sessionId); }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') addMsg('err', 'No pude hablar con Mimito: ' + e.message);
    }
    flush(true);
    if (!full.trim()) bubble.remove();
    streamDone = true; controller = null;
    // Si anotó algo, refresca la sección que estás viendo
    if (cambio && typeof navigate === 'function' && App?.currentPage) try { navigate(App.currentPage); } catch {}
    maybeFinished();
  }

  $('mm-mic').onclick = () => {
    if (state === 'idle') listen();
    else if (state === 'listening') { try { recog.stop(); } catch {} }
    else stopAll();
  };
  $('mm-form').onsubmit = (e) => {
    e.preventDefault(); const t = $('mm-text').value.trim(); if (!t) return;
    $('mm-text').value = ''; stopAll(); ask(t);
  };
  $('mm-reset').onclick = () => { stopAll(); sessionId = null; store.set('mimito.session', ''); $('mm-log').innerHTML = ''; setState('idle', 'Conversación nueva ✨'); };
  document.addEventListener('keydown', (e) => { if (e.code === 'Escape' && !$('mm-panel').hidden && state !== 'idle') stopAll(); });

  $('mm-wake').setAttribute('aria-pressed', wakeOn); $('mm-fab').classList.toggle('mm-awake', wakeOn);
  setState('idle');
})();
