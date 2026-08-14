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

export function applyMaterials(root) {
  root.style.setProperty("--wood", `url("${woodTexture()}")`);
  root.style.setProperty("--paper", `url("${paperTexture()}")`);
}
