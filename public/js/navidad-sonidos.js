// Sonidos del reno navideño (Mi página → Navidad), generados con Web Audio: no usan grabaciones ni melodías
// de nadie, así que no tienen derechos de autor. Este mismo archivo lo usan el panel (para "Probar") y el catálogo
// (mimo-catalog/public/navidad-sonidos.js es una copia: si cambias uno, copia el otro).
(function (root) {
  const SOUNDS = [
    { key: 'magia',    label: 'Polvo mágico',     hint: 'Destellos de campanitas que suben, como magia de Navidad' },
    { key: 'cascabel', label: 'Cascabel suave',   hint: 'Un cascabelito dorado que se agita despacio' },
    { key: 'cajita',   label: 'Cajita musical',   hint: 'Una melodía corta y tierna de caja de música (creada para mimo)' },
    { key: 'campanas', label: 'Campanas lejanas', hint: 'Dos campanadas cálidas, “ding-dong”, con eco' },
  ];

  let ctx = null;
  let busyUntil = 0;

  function audio() {
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = ctx || new AC();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** Salida con un poco de eco suave (sala) */
  function output(ac, vol) {
    const master = ac.createGain();
    master.gain.value = vol;
    const delay = ac.createDelay();
    delay.delayTime.value = 0.21;
    const fb = ac.createGain();
    fb.gain.value = 0.28;
    const wet = ac.createGain();
    wet.gain.value = 0.35;
    delay.connect(fb).connect(delay);
    master.connect(ac.destination);
    master.connect(delay).connect(wet).connect(ac.destination);
    return master;
  }

  /** Tono de campana: suma de parciales que se apagan solos */
  function tone(ac, out, freq, t, { decay = 1, partials = [[1, 1]], vol = 1, pan = 0, attack = 0.004 } = {}) {
    const bus = ac.createGain();
    bus.gain.value = vol;
    if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; bus.connect(p).connect(out); }
    else bus.connect(out);
    for (const [mult, g0, dMult = 1] of partials) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sine';
      o.frequency.value = freq * mult;
      const d = decay * dMult;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(g0, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + d + 0.05);
    }
  }

  const GLOCK = [[1, 1, 1], [2.76, 0.3, 0.35], [5.4, 0.12, 0.18]];       // campanita metálica
  const TINE = [[1, 1, 1], [3.01, 0.22, 0.25], [6.2, 0.05, 0.1]];        // lengüeta de caja de música
  const CHURCH = [[0.5, 0.5, 1.3], [1, 1, 1], [1.19, 0.4, 0.7], [1.5, 0.3, 0.6], [2, 0.35, 0.5], [2.74, 0.15, 0.3]]; // campana grande
  const note = (n) => 440 * Math.pow(2, (n - 69) / 12); // número MIDI → Hz

  const PLAY = {
    // Destellos que suben (escala pentatónica) + un brillo final
    magia(ac, out, t) {
      const steps = [84, 86, 88, 91, 93, 96, 98, 100, 103];
      steps.forEach((n, i) => tone(ac, out, note(n), t + i * 0.055, { decay: 0.9, partials: GLOCK, vol: 0.32 + i * 0.02, pan: -0.6 + i * 0.15 }));
      [103, 108].forEach((n, i) => tone(ac, out, note(n), t + 0.55 + i * 0.09, { decay: 1.4, partials: GLOCK, vol: 0.22, pan: i ? 0.4 : -0.3 }));
      return 1.9;
    },
    // Un cascabel dorado, más grave y redondo, agitado tres veces con calma
    cascabel(ac, out, t) {
      const shake = (at, s) => {
        for (let i = 0; i < 4; i++) {
          const f = 1850 * (0.96 + Math.random() * 0.08);
          tone(ac, out, f, at + i * 0.018 + Math.random() * 0.01, {
            decay: 0.45 + Math.random() * 0.2, vol: (0.28 + Math.random() * 0.12) * s, pan: Math.random() * 0.6 - 0.3,
            partials: [[1, 1, 1], [1.48, 0.5, 0.6], [2.31, 0.3, 0.4], [3.1, 0.12, 0.25]],
          });
        }
      };
      shake(t, 0.9); shake(t + 0.32, 0.75); shake(t + 0.62, 1);
      return 1.5;
    },
    // Melodía original corta (Sol-Mi-Do-Re-Mi… y cierre arriba), timbre de caja de música
    cajita(ac, out, t) {
      const mel = [[79, 0], [76, 0.2], [72, 0.4], [74, 0.6], [76, 0.8], [84, 1.05]];
      mel.forEach(([n, at], i) => tone(ac, out, note(n), t + at, { decay: i === mel.length - 1 ? 1.6 : 0.9, partials: TINE, vol: 0.42 }));
      // Acompañamiento suave abajo
      tone(ac, out, note(60), t, { decay: 1.2, partials: TINE, vol: 0.18 });
      tone(ac, out, note(67), t + 0.8, { decay: 1.4, partials: TINE, vol: 0.16 });
      return 2.6;
    },
    // Ding-dong de campana grande
    campanas(ac, out, t) {
      tone(ac, out, note(76), t, { decay: 2.2, partials: CHURCH, vol: 0.32, pan: -0.2, attack: 0.006 });
      tone(ac, out, note(72), t + 0.55, { decay: 2.6, partials: CHURCH, vol: 0.32, pan: 0.2, attack: 0.006 });
      return 3;
    },
  };

  /** Toca el sonido elegido (solo desde un toque/clic: los navegadores no dejan sonar sin eso) */
  function play(key) {
    try {
      const ac = audio();
      if (!ac || ac.currentTime < busyUntil) return;
      const fn = PLAY[key] || PLAY.magia;
      const out = output(ac, 0.5);
      const len = fn(ac, out, ac.currentTime + 0.03);
      busyUntil = ac.currentTime + Math.min(len, 1.2);
    } catch (e) { /* sin sonido: no pasa nada */ }
  }

  root.NavidadSonidos = { SOUNDS, play };
})(typeof window !== 'undefined' ? window : globalThis);
