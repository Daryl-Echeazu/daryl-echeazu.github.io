/* Inbox demo E — fold & fly.
 *
 * A sheet of paper floating over a low-poly Yosemite. What you type appears on
 * the paper itself (drawn to a canvas and used as a texture). Sending folds it
 * into a paper plane and throws it out over the valley.
 *
 * three.js builds and renders the scene; anime.js drives the send timeline,
 * because a multi-stage sequence with different easings per property is exactly
 * what it is good at, and hand-rolling it in rAF is where these things rot.
 *
 * Loaded only when the E tab is opened — see inbox-demos.html.
 */
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js";
import anime from "https://cdn.jsdelivr.net/npm/animejs@3.2.2/lib/anime.es.js";

const canvas = document.getElementById("flyCanvas");
const stage = canvas.parentElement;
const section = document.getElementById("fly");
const note = stage.querySelector(".loadingnote");
const ta = section.querySelector("textarea");
const nameIn = section.querySelector(".row input");

note.remove();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x121319, 14, 46);

const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 120);
camera.position.set(0, 1.45, 7.2);
camera.lookAt(0, 0.95, 0);

scene.add(new THREE.AmbientLight(0xa9b6d0, 1.5));
const key = new THREE.DirectionalLight(0xffd9a0, 2.4);
key.position.set(-5, 5, 4);
scene.add(key);
const rim = new THREE.DirectionalLight(0x9fc4ff, 0.7);
rim.position.set(6, 2, -4);
scene.add(rim);

/* ── the valley ────────────────────────────────────────────────────────────
   Extruded from the same polyline as the site's loading mark, so the demo is
   standing in the same place the rest of the site is. */
const MARK = [[4,66],[20,61],[31,26],[42,14],[52,12],[60,20],[70,40],[86,55],[116,66]];
function ridge(z, scale, colour, jitter, shift) {
  // Base corners are derived from the profile's own extent. Hard-coding them
  // made the outline self-intersect once scale pushed the peaks wider than the
  // base, and ExtrudeGeometry silently produced a mangled solid — the range was
  // invisible rather than obviously broken, which is the worst kind of wrong.
  const pts = MARK.map(([x, y], i) => [
    (x - 60) * 0.085 * scale + shift,
    (66 - y) * 0.055 * scale + Math.sin(i * 2.7 + z) * jitter
  ]);
  const left = pts[0][0], right = pts[pts.length - 1][0];
  const shape = new THREE.Shape();
  shape.moveTo(left - 6, -4);
  pts.forEach(([px, py]) => shape.lineTo(px, py));
  shape.lineTo(right + 6, -4);
  shape.lineTo(left - 6, -4);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false });
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: colour }));
  mesh.position.set(0, -1.5, z);
  return mesh;
}
const range = new THREE.Group();
range.add(ridge(-19, 5.2, 0x232a3c, 0.30, -3.2));
range.add(ridge(-14, 3.9, 0x2a3346, 0.20,  3.0));
range.add(ridge(-9.5, 2.9, 0x323c52, 0.10, -0.6));
scene.add(range);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(90, 90),
  new THREE.MeshLambertMaterial({ color: 0x14161d })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.55;
scene.add(floor);

/* ── the paper ─────────────────────────────────────────────────────────────
   A canvas texture so the visitor's own words are on the object that flies. */
const tex = document.createElement("canvas");
tex.width = 1024; tex.height = 700;
const ctx = tex.getContext("2d");
const texture = new THREE.CanvasTexture(tex);
texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

function drawPaper() {
  const w = tex.width, h = tex.height;
  ctx.fillStyle = "#f4efe2"; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(120,150,200,.38)"; ctx.lineWidth = 2;
  for (let y = 150; y < h - 60; y += 62) {
    ctx.beginPath(); ctx.moveTo(70, y); ctx.lineTo(w - 70, y); ctx.stroke();
  }
  ctx.strokeStyle = "rgba(190,90,80,.4)";
  ctx.beginPath(); ctx.moveTo(110, 40); ctx.lineTo(110, h - 40); ctx.stroke();

  ctx.fillStyle = "#7d7364";
  ctx.font = "500 21px 'Geist Mono', ui-monospace, monospace";
  const d = new Date();
  const M = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  ctx.fillText("TO: DARYL ECHEAZU — HYDE PARK, CHICAGO", 132, 92);
  ctx.fillText(M[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear(), w - 300, 92);

  ctx.fillStyle = "#3a3229";
  ctx.font = "40px 'Instrument Serif', Georgia, serif";
  const body = (ta.value || "Dear Daryl,").split("\n");
  let line = 0;
  outer:
  for (const para of body) {
    let cur = "";
    for (const word of para.split(" ")) {
      const test = cur ? cur + " " + word : word;
      if (ctx.measureText(test).width > w - 260) {
        ctx.fillText(cur, 132, 196 + line * 62); cur = word;
        if (++line > 6) break outer;
      } else cur = test;
    }
    ctx.fillText(cur, 132, 196 + line * 62);
    if (++line > 6) break;
  }
  const who = (nameIn.value || "").trim();
  if (who) {
    ctx.font = "italic 34px 'Instrument Serif', Georgia, serif";
    ctx.fillStyle = "#6b6153";
    ctx.fillText("— " + who, w - 120 - ctx.measureText("— " + who).width, h - 70);
  }
  texture.needsUpdate = true;
}
drawPaper();
let redraw;
[ta, nameIn].forEach(el => el.addEventListener("input", () => {
  clearTimeout(redraw); redraw = setTimeout(drawPaper, 90);
}));

const paper = new THREE.Mesh(
  new THREE.PlaneGeometry(2.45, 1.68, 24, 18),
  new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide })
);
paper.position.set(0, 0.42, 2.9);
paper.rotation.set(-0.34, 0, 0);
scene.add(paper);

/* The dart. Built by hand rather than loaded: a model file for six triangles
   would be more bytes and one more thing to 404. */
function dart() {
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([
     0, 0,-1.5,  -1.05, 0.02, 1.1,  0, 0.13, 0.72,
     0, 0,-1.5,   0, 0.13, 0.72,   1.05, 0.02, 1.1,
     0, 0,-1.5,   0, 0.13, 0.72,   0,-0.16, 0.86,
  ]);
  g.setAttribute("position", new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}
const plane = new THREE.Mesh(
  dart(),
  new THREE.MeshLambertMaterial({ color: 0xf2ecdf, side: THREE.DoubleSide })
);
plane.scale.setScalar(0.62);
plane.visible = false;
scene.add(plane);

/* ── motion ───────────────────────────────────────────────────────────────*/
let pointer = { x: 0, y: 0 }, flying = false, t0 = performance.now();
stage.addEventListener("pointermove", e => {
  const r = stage.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1;
});

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

renderer.setAnimationLoop(() => {
  const t = (performance.now() - t0) / 1000;
  if (!flying) {
    paper.position.y = 0.42 + Math.sin(t * 1.1) * 0.045;
    paper.rotation.z = Math.sin(t * 0.8) * 0.02;
    paper.rotation.y += ((pointer.x * 0.32) - paper.rotation.y) * 0.05;
    paper.rotation.x += ((-0.34 + pointer.y * 0.14) - paper.rotation.x) * 0.05;
  }
  range.rotation.y += ((pointer.x * 0.045) - range.rotation.y) * 0.03;
  renderer.render(scene, camera);
});

/* ── send ─────────────────────────────────────────────────────────────────*/
const sendBtn = section.querySelector(".send");
sendBtn.addEventListener("click", () => {
  if (flying) return;
  flying = true;
  drawPaper();

  const tl = anime.timeline({ easing: "easeInOutQuad" });

  // 1. the sheet squares up and creases — scaling X to nothing reads as a fold
  tl.add({
    targets: paper.rotation, x: 0, y: 0, z: 0, duration: 420,
    easing: "easeOutQuad"
  })
  .add({
    targets: paper.scale, x: 0.06, duration: 330, easing: "easeInQuad",
    complete: () => {
      paper.visible = false;
      plane.visible = true;
      plane.position.copy(paper.position);
      plane.rotation.set(0.1, Math.PI, 0);
    }
  }, "-=60")
  // 2. the throw — out over the valley, banking as it goes
  .add({
    targets: plane.position,
    x: [{ value: 0.6, duration: 900 }, { value: 2.6, duration: 1500 }],
    y: [{ value: 1.9, duration: 900, easing: "easeOutQuad" },
        { value: 1.2, duration: 1500, easing: "easeInQuad" }],
    z: [{ value: -3.5, duration: 900 }, { value: -22, duration: 1500 }],
  })
  .add({
    targets: plane.rotation,
    z: [{ value: -0.5, duration: 900 }, { value: 0.25, duration: 1500 }],
    x: [{ value: -0.18, duration: 900 }, { value: 0.1, duration: 1500 }],
    duration: 2400
  }, "-=2400")
  .add({
    targets: plane.scale, x: 0.18, y: 0.18, z: 0.18, duration: 1400,
    easing: "easeInQuad",
    complete: () => { section.classList.add("sent"); }
  }, "-=1400");
});

window.__flyReset = function () {
  flying = false;
  plane.visible = false;
  plane.scale.setScalar(0.62);
  paper.visible = true;
  paper.scale.set(1, 1, 1);
  paper.position.set(0, 0.42, 2.9);
  paper.rotation.set(-0.34, 0, 0);
  drawPaper();
};
