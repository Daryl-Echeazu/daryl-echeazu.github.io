/* Desk demo — fold & fly send.
 *
 * The note folds itself in half, tips up, becomes a paper dart and is thrown
 * out across the desk. Done in CSS 3D rather than WebGL: the desk is already
 * DOM, so folding the actual note element keeps the visitor's own handwriting
 * on the thing that flies, and costs 42KB of anime.js instead of 670KB of
 * three.js.
 *
 * The fold is real, not a scaleY cheat. The note is cloned into two clipped
 * halves stacked over the original; the top half rotates about the shared
 * hinge on X, so you see the paper turn over with a crease shadow deepening
 * across it. A collapse in scaleY looks like a window blind; this looks like
 * paper.
 */
import anime from "https://cdn.jsdelivr.net/npm/animejs@3.2.2/lib/anime.es.js";

const section = document.getElementById("desk");
const surface = section.querySelector(".surface");
const sheet = section.querySelector(".sheet");
const sendBtn = section.querySelector(".send");

const DART = `
<svg viewBox="0 0 120 74" aria-hidden="true">
  <polygon points="60,2 4,70 60,50" fill="#efe8da"/>
  <polygon points="60,2 116,70 60,50" fill="#d9d1c1"/>
  <polygon points="60,2 60,50 76,62" fill="#c9c0ae"/>
</svg>`;

let rig = null, dart = null, running = false;

/* Freeze the live note into static markup: a cloned <textarea> renders empty,
   so the fold would throw away exactly the words being sent. */
function freeze(node) {
  const c = node.cloneNode(true);
  c.querySelectorAll("textarea").forEach(t => {
    const d = document.createElement("div");
    const live = node.querySelector("textarea");
    d.textContent = (live && live.value) || live.placeholder || "";
    d.style.cssText = getComputedStyle(live).cssText;
    d.style.whiteSpace = "pre-wrap";
    d.style.height = live.offsetHeight + "px";
    t.replaceWith(d);
  });
  c.querySelectorAll("input").forEach(i => {
    const live = node.querySelector(".sig input");
    const s = document.createElement("span");
    s.textContent = (live && live.value) || "";
    s.style.cssText = "font-family:'Instrument Serif',serif;font-size:17px";
    i.replaceWith(s);
  });
  c.style.transform = "none";
  c.style.boxShadow = "none";
  c.style.margin = "0";
  c.style.width = node.offsetWidth + "px";
  return c;
}

function send() {
  if (running) return;
  running = true;
  sendBtn.disabled = true;
  sendBtn.style.opacity = 0.4;

  const s = sheet.getBoundingClientRect();
  const f = surface.getBoundingClientRect();
  const left = s.left - f.left, top = s.top - f.top;

  rig = document.createElement("div");
  rig.className = "foldrig";
  rig.style.left = left + "px";
  rig.style.top = top + "px";
  rig.style.width = s.width + "px";
  rig.style.height = s.height + "px";
  rig.style.transform = getComputedStyle(sheet).transform;   // keep its tilt

  const half = (cls) => {
    const d = document.createElement("div");
    d.className = "fh " + cls;
    d.appendChild(freeze(sheet));
    if (cls === "top") {
      const cr = document.createElement("div");
      cr.className = "crease";
      d.appendChild(cr);
    }
    return d;
  };
  const bot = half("bot"), topHalf = half("top");
  rig.append(bot, topHalf);
  surface.appendChild(rig);
  sheet.style.visibility = "hidden";

  dart = document.createElement("div");
  dart.className = "dart";
  dart.innerHTML = DART;
  dart.style.left = (left + s.width / 2 - 60) + "px";
  dart.style.top = (top + s.height / 2 - 37) + "px";
  surface.appendChild(dart);

  const crease = topHalf.querySelector(".crease");

  anime.timeline({ easing: "easeInOutQuad" })
    // 1. the fold — top half turns over onto the bottom
    .add({ targets: topHalf, rotateX: [0, -180], duration: 620,
           easing: "easeInOutCubic" })
    .add({ targets: crease, opacity: [0, 1], duration: 400, easing: "easeInQuad" }, 60)
    // 2. the folded packet tips up and shrinks away as the dart takes over
    .add({ targets: rig, scale: [1, 0.42], rotate: "+=6", opacity: [1, 0],
           duration: 420, easing: "easeInQuad" }, "-=90")
    .add({ targets: dart, opacity: [0, 1], scale: [0.5, 1], duration: 260,
           easing: "easeOutQuad" }, "-=340")
    // 3. thrown: up and away across the desk, banking as it goes
    .add({
      targets: dart,
      translateX: [{ value: 90, duration: 420 }, { value: 620, duration: 900 }],
      translateY: [{ value: -70, duration: 420, easing: "easeOutQuad" },
                   { value: -190, duration: 900, easing: "easeInQuad" }],
      rotate: [{ value: -14, duration: 420 }, { value: 16, duration: 900 }],
      scale: [{ value: 1.05, duration: 420 }, { value: 0.32, duration: 900 }],
      opacity: [{ value: 1, duration: 900 }, { value: 0, duration: 260 }],
      easing: "linear",
      complete: () => { section.classList.add("sent"); running = false; }
    }, "-=120");
}

sendBtn.addEventListener("click", send);

window.__deskReset = function () {
  if (rig) { rig.remove(); rig = null; }
  if (dart) { dart.remove(); dart = null; }
  sheet.style.visibility = "";
  sendBtn.disabled = false;
  sendBtn.style.opacity = 1;
  running = false;
};
