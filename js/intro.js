// Velkomst: baller drysser ned på skjermen, sett ovenfra, som om noen tømte en ballsekk over den.
// Vises én gang per økt, kan hoppes over med klikk eller tast, og vises ikke for den som har
// bedt om mindre bevegelse.
(function () {
  const KEY = 'aktivitetsdag.intro';
  try {
    if (sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, '1');
  } catch (e) { /* lagring blokkert: vis likevel */ }
  if (!window.matchMedia || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!Element.prototype.animate) return;

  const INK = '#2F4858', WHITE = '#FBF8F2';
  const svg = (vb, body) => 'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`);
  const clip = '<defs><clipPath id="c"><circle cx="50" cy="50" r="47"/></clipPath></defs>';
  const rim = (c) => `<circle cx="50" cy="50" r="47" fill="none" stroke="${c}" stroke-width="2.5"/>`;
  const poly = (cx, cy, r, rot) => Array.from({ length: 5 }, (_, i) => {
    const a = (rot + i * 72) * Math.PI / 180;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

  // Fotball: midtfemkant med fem halve femkanter rundt.
  const outer = [-90, -18, 54, 126, 198].map((d) => {
    const a = d * Math.PI / 180;
    return { x: 50 + 46 * Math.cos(a), y: 50 + 46 * Math.sin(a), ix: 50 + 15 * Math.cos(a), iy: 50 + 15 * Math.sin(a), d };
  });
  const football = svg('0 0 100 100', clip +
    `<circle cx="50" cy="50" r="47" fill="${WHITE}"/><g clip-path="url(#c)">` +
    outer.map((o) => `<line x1="${o.ix.toFixed(1)}" y1="${o.iy.toFixed(1)}" x2="${o.x.toFixed(1)}" y2="${o.y.toFixed(1)}" stroke="${INK}" stroke-width="2.5"/>` +
      `<polygon points="${poly(o.x, o.y, 15, o.d + 180)}" fill="${INK}"/>`).join('') +
    `<polygon points="${poly(50, 50, 16, -90)}" fill="${INK}"/></g>` + rim(INK));

  const tennis = svg('0 0 100 100', clip +
    `<circle cx="50" cy="50" r="47" fill="#D6CF63"/><g clip-path="url(#c)" fill="none" stroke="${WHITE}" stroke-width="5">` +
    '<path d="M18,8 C44,32 44,68 18,92"/><path d="M82,8 C56,32 56,68 82,92"/></g>');

  const basketball = svg('0 0 100 100', clip +
    `<circle cx="50" cy="50" r="47" fill="#C9785A"/><g clip-path="url(#c)" fill="none" stroke="${INK}" stroke-width="2.5">` +
    '<path d="M50,0 V100 M0,50 H100 M20,8 C40,32 40,68 20,92 M80,8 C60,32 60,68 80,92"/></g>' + rim(INK));

  const handball = svg('0 0 100 100', clip +
    `<circle cx="50" cy="50" r="47" fill="#5B8BA0"/><g clip-path="url(#c)" fill="none" stroke="${WHITE}" stroke-width="5">` +
    '<path d="M2,38 C30,26 70,26 98,38 M2,62 C30,74 70,74 98,62 M50,30 C40,44 40,56 50,70"/></g>' + rim('#3F6A7D'));

  const holes = [[50, 50]].concat(
    Array.from({ length: 6 }, (_, i) => [50 + 21 * Math.cos(i * Math.PI / 3), 50 + 21 * Math.sin(i * Math.PI / 3)]),
    Array.from({ length: 12 }, (_, i) => [50 + 40 * Math.cos((i + 0.5) * Math.PI / 6), 50 + 40 * Math.sin((i + 0.5) * Math.PI / 6)]));
  const floorball = svg('0 0 100 100', clip +
    `<circle cx="50" cy="50" r="47" fill="${WHITE}"/><g clip-path="url(#c)" fill="#B9AE9C">` +
    holes.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6"/>`).join('') + '</g>' + rim('#B9AE9C'));

  const puck = svg('0 0 100 100',
    '<circle cx="50" cy="50" r="47" fill="#1E2A31"/><circle cx="50" cy="50" r="38" fill="none" stroke="#33444F" stroke-width="3"/>' +
    '<path d="M24,30 A32,32 0 0 1 44,18" fill="none" stroke="#4A5E6B" stroke-width="4" stroke-linecap="round"/>');

  const amfootball = svg('0 0 140 90',
    `<path d="M6,45 C30,4 110,4 134,45 C110,86 30,86 6,45 Z" fill="#8C5A3C" stroke="#5E3B27" stroke-width="2.5"/>` +
    `<g stroke="${WHITE}" stroke-width="4" stroke-linecap="round"><path d="M28,24 C26,36 26,54 28,66 M112,24 C114,36 114,54 112,66"/>` +
    '<path d="M48,45 H92 M54,38 V52 M62,38 V52 M70,38 V52 M78,38 V52 M86,38 V52" stroke-width="3.5"/></g>');

  const kinds = [
    { src: football, w: 50 }, { src: tennis, w: 28 }, { src: basketball, w: 56 }, { src: handball, w: 44 },
    { src: floorball, w: 32 }, { src: puck, w: 34, flat: true }, { src: amfootball, w: 62, h: 40 }
  ];

  function run() {
    const vw = innerWidth, vh = innerHeight;
    const small = vw < 600;
    const count = small ? 14 : 22;
    const layer = document.createElement('div');
    layer.className = 'ball-drop';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);

    for (let i = 0; i < count; i++) {
      const k = kinds[i % kinds.length];
      const s = small ? 0.8 : 1;
      const w = k.w * s, h = (k.h || k.w) * s;
      const img = document.createElement('img');
      img.src = k.src; img.alt = ''; img.width = w; img.height = h;
      img.style.left = (Math.random() * (vw - w)) + 'px';
      img.style.top = (Math.random() * (vh - h)) + 'px';
      layer.appendChild(img);

      // Ballen kommer mot skjermen ovenfra (stor og uskarp skygge), spretter ett lite hopp og ruller litt.
      const r0 = Math.random() * 360, spin = (Math.random() - 0.5) * (k.flat ? 120 : 260);
      const dx = (Math.random() - 0.5) * 70, dy = (Math.random() - 0.5) * 70;
      const fall = 'drop-shadow(16px 22px 10px rgba(20,30,40,.12))';
      const land = 'drop-shadow(2px 3px 2px rgba(20,30,40,.32))';
      img.animate([
        { transform: `translate(0,0) scale(2.6) rotate(${r0}deg)`, opacity: 0, filter: fall },
        { opacity: 1, offset: 0.15 },
        { transform: `translate(0,0) scale(1) rotate(${r0 + spin * 0.2}deg)`, filter: land, offset: 0.45, easing: 'ease-out' },
        { transform: `translate(${dx * 0.3}px,${dy * 0.3}px) scale(${k.flat ? 1.03 : 1.14}) rotate(${r0 + spin * 0.45}deg)`, filter: fall, offset: 0.58, easing: 'ease-in' },
        { transform: `translate(${dx * 0.5}px,${dy * 0.5}px) scale(1) rotate(${r0 + spin * 0.6}deg)`, filter: land, offset: 0.7, easing: 'ease-out' },
        { transform: `translate(${dx}px,${dy}px) scale(1) rotate(${r0 + spin}deg)`, opacity: 1, filter: land }
      ], { duration: 1500, delay: i * (900 / count) + Math.random() * 120, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'both' });
    }

    let done = false;
    const finish = (fast) => {
      if (done) return;
      done = true;
      removeEventListener('pointerdown', skip, true);
      removeEventListener('keydown', skip, true);
      layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: fast ? 250 : 600, fill: 'forwards' })
        .finished.then(() => layer.remove(), () => layer.remove());
    };
    const skip = () => finish(true);
    addEventListener('pointerdown', skip, true);
    addEventListener('keydown', skip, true);
    setTimeout(() => finish(false), 2900);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
