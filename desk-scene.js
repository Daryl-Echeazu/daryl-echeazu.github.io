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

export function applyMaterials(root) {
  root.style.setProperty("--wood", `url("${woodTexture()}")`);
  root.style.setProperty("--paper", `url("${paperTexture()}")`);
}
