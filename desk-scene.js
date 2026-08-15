/* Desk scene — materials.
 *
 * The first version built wood from repeating-linear-gradient and paper from a
 * flat fill. Periodic stripes read as corduroy and flat cream reads as a box;
 * that is what made it look cheap, not the layout.
 *
 * These are generated procedurally into canvases and handed to CSS as data
 * URLs, which buys three things gradients cannot:
 *
 *   - non-periodic grain, with wander and density variation along each line
 *   - per-pixel fibre noise on the paper, so it holds light like a surface
 *   - knots and blotches, i.e. the irregularity that makes a material read
 *
 * One light direction throughout: upper-left. Every shadow in the CSS points
 * down-right, and the highlights sit up-left. Mixed lighting is the other
 * thing that makes CSS scenes look like stickers.
 */

/* Cheap value noise — enough for grain and fibre, and no dependency. */
function noise2(x, y, seed) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function smoothNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = noise2(xi, yi, seed), b = noise2(xi + 1, yi, seed);
  const c = noise2(xi, yi + 1, seed), d = noise2(xi + 1, yi + 1, seed);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

export function woodTexture(w = 1000, h = 620) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d");

  const base = x.createLinearGradient(0, 0, w * 0.35, h);
  base.addColorStop(0, "#4a3320");
  base.addColorStop(0.55, "#3a2617");
  base.addColorStop(1, "#2a1b10");
  x.fillStyle = base; x.fillRect(0, 0, w, h);

  // Grain: long near-horizontal lines that wander and vary in weight, never
  // repeating. Two knots pull the lines around them, which is what actually
  // reads as timber rather than stripes.
  const knots = [{ x: w * 0.19, y: h * 0.30, r: 62 }, { x: w * 0.74, y: h * 0.68, r: 44 }];
  for (let i = 0; i < 460; i++) {
    const y0 = (i / 460) * h + (Math.random() - 0.5) * 3;
    const light = Math.random() < 0.42;
    x.strokeStyle = light
      ? `rgba(196,150,96,${0.02 + Math.random() * 0.05})`
      : `rgba(18,10,4,${0.03 + Math.random() * 0.09})`;
    x.lineWidth = 0.6 + Math.random() * 1.9;
    x.beginPath();
    for (let px = 0; px <= w; px += 12) {
      let py = y0 + Math.sin(px * 0.006 + i * 0.7) * 5 + smoothNoise(px * 0.01, i * 0.4, 3) * 8 - 4;
      for (const k of knots) {                       // grain bends around knots
        const dx = px - k.x, dy = py - k.y;
        const d = Math.hypot(dx, dy);
        if (d < k.r * 3.4) py += (dy / (d || 1)) * (k.r * 3.4 - d) * 0.34;
      }
      px === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
    }
    x.stroke();
  }
  for (const k of knots) {
    for (let r = k.r; r > 2; r -= 2.6) {
      x.strokeStyle = `rgba(20,11,5,${0.05 + (1 - r / k.r) * 0.20})`;
      x.lineWidth = 1.1;
      x.beginPath();
      x.ellipse(k.x, k.y, r * 0.62, r, 0.5, 0, Math.PI * 2);
      x.stroke();
    }
  }

  // fine dust/tooth so large areas are never flat
  const img = x.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 13;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  x.putImageData(img, 0, 0);
  return c.toDataURL("image/jpeg", 0.86);
}

export function paperTexture(w = 720, h = 520) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d");

  x.fillStyle = "#efe9dc"; x.fillRect(0, 0, w, h);

  // Stock variation. This has to be *barely* there: at the first attempt's
  // opacity the sheet read as stained and water-damaged rather than as paper.
  // Small, faint, and biased light — the eye should register a surface, not a
  // pattern.
  for (let i = 0; i < 3400; i++) {
    const px = Math.random() * w, py = Math.random() * h;
    const n = smoothNoise(px * 0.014, py * 0.014, 7);
    x.fillStyle = n > 0.42
      ? `rgba(255,253,247,${0.012 + Math.random() * 0.022})`
      : `rgba(206,197,180,${0.008 + Math.random() * 0.014})`;
    x.beginPath();
    x.ellipse(px, py, 4 + Math.random() * 11, 3 + Math.random() * 7, Math.random() * 3, 0, 6.3);
    x.fill();
  }
  // fibres
  for (let i = 0; i < 1500; i++) {
    const px = Math.random() * w, py = Math.random() * h, a = Math.random() * Math.PI;
    x.strokeStyle = `rgba(158,146,126,${0.018 + Math.random() * 0.035})`;
    x.lineWidth = 0.7;
    x.beginPath(); x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * (3 + Math.random() * 9), py + Math.sin(a) * (3 + Math.random() * 9));
    x.stroke();
  }
  // light falls from upper-left, so the sheet darkens toward lower-right
  const sh = x.createLinearGradient(0, 0, w, h);
  sh.addColorStop(0, "rgba(255,255,255,.10)");
  sh.addColorStop(0.6, "rgba(0,0,0,0)");
  sh.addColorStop(1, "rgba(60,44,24,.09)");
  x.fillStyle = sh; x.fillRect(0, 0, w, h);

  const img = x.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 6;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  x.putImageData(img, 0, 0);
  return c.toDataURL("image/jpeg", 0.9);
}

/* ── objects ───────────────────────────────────────────────────────────────
   Drawn as SVG rather than div primitives. Two circles read as an icon of a
   mug; shading, seams and a consistent upper-left light read as an object.
   Every highlight below sits up-left and every shadow falls down-right. */

/* Rainy75 — 75% layout, CNC aluminium case, cream and grey caps. The key grid
   is generated because hand-writing 82 rects is how typos get shipped. */
export function keyboardSVG() {
  const U = 21, GAP = 2.4, PAD = 13;          // 1u, gap, case padding
  const rows = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],                       // fn row + del
    [1,1,1,1,1,1,1,1,1,1,1,1,1,2,1],                       // numbers + bksp
    [1.5,1,1,1,1,1,1,1,1,1,1,1,1,1.5,1],                   // tab
    [1.75,1,1,1,1,1,1,1,1,1,1,1,2.25,1],                   // caps
    [2.25,1,1,1,1,1,1,1,1,1,1,1.75,1,1],                   // shift + up
    [1.25,1.25,1.25,6.25,1.25,1.25,1,1,1]                  // bottom + arrows
  ];
  const accents = { 0: [0], 1: [13], 5: [3] };             // esc, bksp, space
  let keys = "", y = PAD;
  rows.forEach((row, ri) => {
    let x = PAD;
    row.forEach((u, ki) => {
      const w = u * U - GAP, h = U - GAP;
      const accent = (accents[ri] || []).includes(ki);
      keys += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}"
        height="${h.toFixed(1)}" rx="2.6" fill="${accent ? "#c9c3b6" : "#efeadd"}"/>
        <rect x="${x.toFixed(1)}" y="${(y + h - 3).toFixed(1)}" width="${w.toFixed(1)}"
        height="3" rx="1.4" fill="rgba(90,84,72,.30)"/>`;
      x += u * U;
    });
    y += U;
  });
  const w = PAD * 2 + 16 * U, h = PAD * 2 + rows.length * U;
  return `<svg viewBox="0 0 ${w} ${h}" class="kbsvg">
    <defs><linearGradient id="kbcase" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="#cfd3d8"/><stop offset="0.5" stop-color="#9aa1a9"/>
      <stop offset="1" stop-color="#6d747c"/></linearGradient></defs>
    <rect x="0" y="0" width="${w}" height="${h}" rx="9" fill="url(#kbcase)"/>
    <rect x="4" y="4" width="${w - 8}" height="${h - 8}" rx="6" fill="#2b2f35"/>
    <rect x="4" y="4" width="${w - 8}" height="2" rx="1" fill="rgba(255,255,255,.28)"/>
    ${keys}
  </svg>`;
}

/* G Pro X Superlight — small, symmetric, matte white, seam between the main
   buttons and a shallow wheel slot. */
export function mouseSVG() {
  return `<svg viewBox="0 0 84 128" class="msvg">
    <defs>
      <linearGradient id="msh" x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0" stop-color="#fbfaf7"/><stop offset="0.55" stop-color="#e7e3dc"/>
        <stop offset="1" stop-color="#c2bdb4"/></linearGradient>
    </defs>
    <path d="M42,2 C64,2 78,22 78,52 C78,92 66,126 42,126 C18,126 6,92 6,52
             C6,22 20,2 42,2 Z" fill="url(#msh)"/>
    <path d="M42,3 C42,3 42,46 42,46" stroke="rgba(120,114,104,.55)" stroke-width="1.4" fill="none"/>
    <rect x="37" y="14" width="10" height="20" rx="5" fill="#3f3c37"/>
    <rect x="38.5" y="16" width="7" height="16" rx="3.5" fill="#57534c"/>
    <path d="M12,40 C12,26 22,10 42,8" stroke="rgba(255,255,255,.6)" stroke-width="2.4"
      fill="none" stroke-linecap="round"/>
  </svg>`;
}

/* An energy can, seen slightly from above: ellipse lid, short body, brand band. */
export function canSVG() {
  // Taller and narrower than the first pass, which was short enough to read as
  // a battery. Tapered claw marks rather than blunt bars.
  return `<svg viewBox="0 0 84 176" class="cansvg">
    <defs>
      <linearGradient id="canbody" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#0a0c0a"/><stop offset="0.18" stop-color="#31362f"/>
        <stop offset="0.42" stop-color="#1a1e1a"/><stop offset="0.78" stop-color="#0b0d0b"/>
        <stop offset="1" stop-color="#040504"/></linearGradient>
      <linearGradient id="canlid" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#dde1e6"/><stop offset="0.5" stop-color="#a4aab2"/>
        <stop offset="1" stop-color="#6b717a"/></linearGradient>
    </defs>
    <path d="M14,28 C14,22 70,22 70,28 L70,150 C70,166 14,166 14,150 Z" fill="url(#canbody)"/>
    <ellipse cx="42" cy="27" rx="28" ry="9.5" fill="url(#canlid)"/>
    <ellipse cx="42" cy="27" rx="22" ry="6.8" fill="#8d939b"/>
    <ellipse cx="42" cy="28" rx="17" ry="4.8" fill="#737981"/>
    <rect x="35" y="24" width="14" height="6" rx="3" fill="#b2b8bf"/>
    <g fill="#7ee04a">
      <path d="M28,62 L35,62 L31,120 L25,116 Z"/>
      <path d="M38,57 L46,57 L44,124 L36,120 Z"/>
      <path d="M49,62 L56,62 L59,116 L53,120 Z"/>
    </g>
    <text x="42" y="146" text-anchor="middle" font-family="Geist Mono, monospace"
      font-size="8" letter-spacing="1.6" fill="#cfd6cc">ENERGY</text>
    <path d="M19,34 C17,72 17,116 21,150" stroke="rgba(255,255,255,.22)" stroke-width="4.5"
      fill="none" stroke-linecap="round"/>
    <path d="M64,34 C66,72 66,116 63,150" stroke="rgba(255,255,255,.07)" stroke-width="3"
      fill="none" stroke-linecap="round"/>
  </svg>`;
}

/* A cube, isometric, mid-scramble. */
export function cubeSVG() {
  const C = { W: "#f2f0ea", Y: "#f2c53d", R: "#c6392f", O: "#e07a26", B: "#2f5fbf", G: "#2f9e51" };
  const top = ["W","R","G","Y","W","B","R","W","O"];
  const left = ["G","G","O","R","B","Y","W","O","G"];
  const right = ["B","Y","R","O","G","W","Y","B","R"];
  const face = (cells, ox, oy, m) => cells.map((c, i) => {
    const r = Math.floor(i / 3), q = i % 3;
    const p = m(q, r);
    return `<polygon points="${p}" fill="${C[c]}" stroke="#15171a" stroke-width="1.6"
      stroke-linejoin="round"/>`;
  }).join("");
  const S = 26, H = S * 0.5;
  const pTop = (q, r) => {
    const x = 48 + (q - r) * S * 0.86, y = 30 + (q + r) * H;
    return `${x},${y} ${x + S * 0.86},${y + H} ${x},${y + S} ${x - S * 0.86},${y + H}`;
  };
  const pLeft = (q, r) => {
    const x = 48 - S * 0.86 * 3 + q * S * 0.86, y = 30 + 3 * H + q * H + r * S;
    return `${x},${y} ${x + S * 0.86},${y + H} ${x + S * 0.86},${y + H + S} ${x},${y + S}`;
  };
  const pRight = (q, r) => {
    const x = 48 + S * 0.86 * 3 - q * S * 0.86, y = 30 + 3 * H + q * H + r * S;
    return `${x},${y} ${x - S * 0.86},${y + H} ${x - S * 0.86},${y + H + S} ${x},${y + S}`;
  };
  return `<svg viewBox="0 0 96 132" class="cubesvg">
    ${face(left, 0, 0, pLeft)}${face(right, 0, 0, pRight)}${face(top, 0, 0, pTop)}
  </svg>`;
}

/* The inbox tray the note actually goes into. Wire mesh, seen from slightly
   above so there is a visible mouth to drop into. */
export function traySVG() {
  // Drawn as an open box in perspective — floor, back panel, side rails, front
  // lip — with a sheet already sitting in it. The first attempt was wire mesh
  // rendered as vertical strokes over black, which read unmistakably as a
  // hairbrush. A tray has to show its MOUTH or it is not a tray.
  return `<svg viewBox="0 0 200 132" class="traysvg">
    <defs>
      <linearGradient id="trayIn" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0" stop-color="#23262b"/><stop offset="1" stop-color="#111316"/></linearGradient>
      <linearGradient id="trayRail" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stop-color="#9aa1aa"/><stop offset="0.55" stop-color="#646b74"/>
        <stop offset="1" stop-color="#3b4047"/></linearGradient>
      <linearGradient id="trayLip" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#aab1ba"/><stop offset="1" stop-color="#5c636b"/></linearGradient>
    </defs>
    <!-- interior floor -->
    <path d="M30,30 L170,30 L192,104 L8,104 Z" fill="url(#trayIn)"/>
    <!-- a sheet already in the tray, so the purpose is legible at rest -->
    <path d="M46,44 L156,44 L172,94 L28,94 Z" fill="#e8e2d4"/>
    <path d="M46,44 L156,44 L158,50 L44,50 Z" fill="#d3ccbc"/>
    <!-- Rule endpoints ride the sheet's own tapered edges (left 46->28, right
         156->172 over y 44->94), inset two units. Squaring them off instead let
         the lines poke past the right edge as blue nubs on the dark floor. -->
    <g stroke="rgba(120,150,196,.5)" stroke-width="1.4">
      <line x1="42.2" y1="60" x2="159.1" y2="60"/>
      <line x1="37.9" y1="72" x2="163.0" y2="72"/>
      <line x1="33.6" y1="84" x2="166.8" y2="84"/>
    </g>
    <!-- back panel and side rails -->
    <path d="M30,30 L170,30 L170,20 L30,20 Z" fill="url(#trayRail)"/>
    <path d="M30,30 L8,104 L0,100 L24,26 Z" fill="url(#trayRail)"/>
    <path d="M170,30 L192,104 L200,100 L176,26 Z" fill="url(#trayRail)"/>
    <!-- front lip, the part nearest the viewer -->
    <path d="M8,104 L192,104 L196,120 L4,120 Z" fill="url(#trayLip)"/>
    <text x="100" y="116" text-anchor="middle" font-family="Geist Mono, monospace"
      font-size="9" letter-spacing="4" fill="#22262b">IN</text>
    <path d="M4,120 L196,120 L192,124 L8,124 Z" fill="#2f343a"/>
  </svg>`;
}

/* The tray's front lip again, on its own, to be stacked ABOVE the note.
 *
 * Without this the sent note lands on top of the whole tray and reads as a note
 * propped against a stand. Paper in a tray is paper you can only partly see —
 * the near wall crosses in front of it. Painting the lip twice (once in the
 * tray, once here) costs nothing and is what makes the note read as inside
 * rather than on top. Same viewBox as traySVG so it registers exactly. */
export function trayFrontSVG() {
  return `<svg viewBox="0 0 200 132" class="trayfrontsvg">
    <defs>
      <linearGradient id="trayLip2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#aab1ba"/><stop offset="1" stop-color="#5c636b"/></linearGradient>
    </defs>
    <path d="M8,104 L192,104 L196,120 L4,120 Z" fill="url(#trayLip2)"/>
    <text x="100" y="116" text-anchor="middle" font-family="Geist Mono, monospace"
      font-size="9" letter-spacing="4" fill="#22262b">IN</text>
    <path d="M4,120 L196,120 L192,124 L8,124 Z" fill="#2f343a"/>
  </svg>`;
}

/* Over-ear headphones, resting on one cup. */
export function headphonesSVG() {
  return `<svg viewBox="0 0 150 112" class="hpsvg">
    <defs><linearGradient id="hpc" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#3d4249"/><stop offset="0.55" stop-color="#23272c"/>
      <stop offset="1" stop-color="#141619"/></linearGradient></defs>
    <path d="M28,72 C22,26 128,26 122,72" stroke="#2a2e34" stroke-width="11"
      fill="none" stroke-linecap="round"/>
    <path d="M28,68 C24,30 126,30 122,68" stroke="rgba(255,255,255,.13)" stroke-width="3"
      fill="none" stroke-linecap="round"/>
    <ellipse cx="28" cy="80" rx="25" ry="27" fill="url(#hpc)"/>
    <ellipse cx="28" cy="80" rx="15" ry="17" fill="#0d0f11"/>
    <ellipse cx="122" cy="80" rx="25" ry="27" fill="url(#hpc)"/>
    <ellipse cx="122" cy="80" rx="15" ry="17" fill="#0d0f11"/>
    <ellipse cx="22" cy="70" rx="8" ry="6" fill="rgba(255,255,255,.10)"/>
  </svg>`;
}

/* A short stack of chips. */
export function chipsSVG() {
  const chip = (y, c1, c2) => `
    <ellipse cx="46" cy="${y + 7}" rx="40" ry="14" fill="#0e1013" opacity=".5"/>
    <path d="M6,${y} L6,${y + 7} A40,14 0 0 0 86,${y + 7} L86,${y} Z" fill="${c2}"/>
    <ellipse cx="46" cy="${y}" rx="40" ry="14" fill="${c1}"/>
    <ellipse cx="46" cy="${y}" rx="27" ry="9" fill="none" stroke="${c2}" stroke-width="3"/>`;
  return `<svg viewBox="0 0 92 92" class="chipsvg">
    ${chip(66, "#2f3a52", "#1d2435")}
    ${chip(52, "#8d2f34", "#5e1f23")}
    ${chip(38, "#e9e5dc", "#b9b3a6")}
  </svg>`;
}

/* A carabiner — the one thing on the desk that is not indoors. */
export function binerSVG() {
  return `<svg viewBox="0 0 64 116" class="bnsvg">
    <defs><linearGradient id="bn" x1="0" y1="0" x2="1" y2="0.6">
      <stop offset="0" stop-color="#e0b25a"/><stop offset="0.45" stop-color="#b3822f"/>
      <stop offset="1" stop-color="#6f4f18"/></linearGradient></defs>
    <path d="M32,6 C50,6 58,22 58,52 C58,84 48,110 32,110 C16,110 6,84 6,52
             C6,22 14,6 32,6 Z" fill="none" stroke="url(#bn)" stroke-width="9"
             stroke-linecap="round"/>
    <path d="M32,6 C22,14 18,32 18,52" stroke="#3a3f46" stroke-width="6"
      fill="none" stroke-linecap="round"/>
  </svg>`;
}

export function applyMaterials(root) {
  root.style.setProperty("--wood", `url("${woodTexture()}")`);
  root.style.setProperty("--paper", `url("${paperTexture()}")`);
}
