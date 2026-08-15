/* Desk demo — the send.
 *
 * The note goes into the inbox tray. An earlier version folded it into a paper
 * dart and threw it across the desk, which looked fine in isolation and made no
 * sense at all in context: you do not launch a note across your own desk, and
 * the page is called Inbox. There is a tray. It goes in the tray.
 *
 * The motion is a real hand-off rather than a slide: the note lifts off the
 * surface (its shadow grows and softens as it rises), travels over to the tray,
 * tips to match the tray's angle, then drops and settles with a small
 * overshoot. anime.js drives it because each leg wants its own easing —
 * easeOut on the lift, linear on the travel, a spring on the landing.
 */
import anime from "https://cdn.jsdelivr.net/npm/animejs@3.2.2/lib/anime.es.js";

const section = document.getElementById("desk");
const surface = section.querySelector(".surface");
const sheet = section.querySelector(".sheet");
const tray = section.querySelector(".tray");
const sendBtn = section.querySelector(".send");

let ghost = null, running = false;

/* A cloned <textarea> renders empty, so the flying copy has to be frozen into
   static markup or the note arrives blank — the one thing the animation must
   not lose is the words being sent. */
function freeze(node) {
  const c = node.cloneNode(true);
  const liveText = node.querySelector("textarea");
  const liveName = node.querySelector(".sig input");
  c.querySelectorAll("textarea").forEach(t => {
    const d = document.createElement("div");
    d.textContent = (liveText && liveText.value) || liveText.placeholder || "";
    d.style.cssText = getComputedStyle(liveText).cssText;
    d.style.whiteSpace = "pre-wrap";
    d.style.height = liveText.offsetHeight + "px";
    t.replaceWith(d);
  });
  c.querySelectorAll("input").forEach(i => {
    const s = document.createElement("span");
    s.textContent = (liveName && liveName.value) || "";
    s.style.cssText = "font-family:'Instrument Serif',serif;font-size:17px";
    i.replaceWith(s);
  });
  return c;
}

function send() {
  if (running) return;
  running = true;
  sendBtn.disabled = true;
  sendBtn.style.opacity = 0.4;

  const s = sheet.getBoundingClientRect();
  const f = surface.getBoundingClientRect();
  const t = tray.getBoundingClientRect();

  ghost = freeze(sheet);
  ghost.classList.add("ghost");
  // Seed the transform with the component order we need. anime.js orders
  // transform functions by which property it animates first, and if translate
  // lands AFTER scale the translation is applied in the scaled space — the note
  // travelled 371px * 0.376 and stopped well short of the tray. Declaring the
  // order up front makes the translate absolute regardless of animation order.
  ghost.style.cssText += `position:absolute;margin:0;z-index:9;
    left:${s.left - f.left}px; top:${s.top - f.top}px; width:${s.width}px;
    transform:translateX(0px) translateY(0px) scale(1) rotateX(0deg) rotate(-1.8deg);`;
  surface.appendChild(ghost);
  sheet.style.visibility = "hidden";

  // Aim the surface's vanishing point at the tray, so the note's foreshortening
  // agrees with the perspective the tray is drawn in.
  surface.style.perspectiveOrigin =
    `${t.left + t.width / 2 - f.left}px ${t.top - f.top}px`;

  // Where it has to end up. The tray's interior sheet occupies about 72% of its
  // width and sits a little past half its height (see traySVG's geometry), and
  // TILT lays the note down into that footprint — a note that arrives still
  // facing the camera reads as propped against the tray rather than dropped in.
  const TILT = 64;
  const dx = (t.left + t.width / 2) - (s.left + s.width / 2);
  const dy = (t.top + t.height * 0.54) - (s.top + s.height / 2);
  const scale = (t.width * 0.66) / s.width;   // 0.72 put the near corners on the rails

  anime.timeline()
    // 1. lift — it comes off the desk before it goes anywhere
    .add({
      targets: ghost,
      translateY: -26, scale: 1.045, rotate: -3.4,
      boxShadow: ["1px 2px 2px rgba(0,0,0,.42), 10px 26px 44px rgba(0,0,0,.5)",
                  "2px 6px 8px rgba(0,0,0,.3), 22px 54px 70px rgba(0,0,0,.55)"],
      duration: 340, easing: "easeOutQuad"
    })
    // 2. carry — across to above the tray, laying down flat as it travels
    .add({
      targets: ghost,
      translateX: dx, translateY: dy - 38, scale: scale * 1.06,
      rotateX: TILT, rotate: 2,
      duration: 620, easing: "easeInOutQuad"
    })
    // 3. drop in and settle. The tray's front lip is stacked above the note, so
    //    from here the near wall crosses it and it is visibly inside.
    .add({
      targets: ghost,
      translateY: dy, scale: scale,
      boxShadow: ["2px 6px 8px rgba(0,0,0,.3), 22px 54px 70px rgba(0,0,0,.55)",
                  "0 2px 3px rgba(0,0,0,.5), 2px 6px 10px rgba(0,0,0,.4)"],
      duration: 300, easing: "cubicBezier(.2,1.5,.4,1)"
    })
    .add({
      targets: ghost,
      rotate: 1.2, translateY: dy + 2,
      duration: 180, easing: "easeOutQuad",
      complete: () => { section.classList.add("sent"); running = false; }
    });
}

sendBtn.addEventListener("click", send);

window.__deskReset = function () {
  if (ghost) { ghost.remove(); ghost = null; }
  sheet.style.visibility = "";
  sendBtn.disabled = false;
  sendBtn.style.opacity = 1;
  running = false;
};
