/* LOADING SCREEN.
 *
 * Covers the gap between first paint and the app actually being rendered.
 *
 * Measured on a throttled connection before writing this, because the gap has
 * two distinct wrong states rather than one:
 *
 *   ~470-750ms   the raw template is in the DOM with 204 unresolved {{ }}
 *                bindings — "DARYL ECHEAZU {{ t.label }}" is on screen
 *   ~1040-1620ms body is blank while Babel compiles and the app mounts
 *   ~1900ms      rendered
 *
 * So the cover has to go up immediately and stay up until bindings are
 * resolved, not merely until DOMContentLoaded or first paint.
 *
 * The hard part is that the bundler replaces documentElement wholesale, which
 * takes the <body> this overlay lives in with it. Rather than fight that, the
 * overlay re-attaches itself on every animation frame until it is done — cheap,
 * and immune to however the document is rebuilt underneath.
 *
 * It can never trap anyone: a hard timeout tears it down regardless of state.
 */
(function () {
  "use strict";

  var BG = "oklch(0.13 0.005 260)";
  var INK = "oklch(0.94 0.005 260)";
  var GOLD = "oklch(0.86 0.13 85)";   // the site's accent, as on the headline word
  var TIMEOUT = 9000;      // absolute ceiling, whatever happens
  var MIN_SHOW = 900;      // let the mark finish drawing; see README on the cost

  var start = Date.now();
  var el = null, styleEl = null, done = false;

  function make() {
    el = document.createElement("div");
    el.id = "boot";
    el.setAttribute("role", "status");
    el.setAttribute("aria-label", "Loading");
    // The mark is a simplified El Capitan — the same prow that carries The
    // Valley — rather than the ⛰️ emoji, which would read as clip art next to
    // this typography. pathLength="100" normalises the stroke so the draw-on
    // maths is exact without measuring the geometry.
    // Asymmetry is what makes it read as El Capitan rather than a bell curve:
    // a steep west face, a summit set left of centre, and a long shoulder
    // falling away east. A fainter ridge behind gives it a valley to stand in.
    // Straight segments throughout, not curves. Two earlier attempts used bezier
    // shoulders and both read as a bell curve however the summit was sharpened —
    // the roundness was the problem, not the apex. Faceted lines read as rock.
    // The summit is broad and set left of centre, with a long shoulder falling
    // east: El Capitan's proportions rather than a generic peak.
    // A dark mass with the summit edge catching light — El Capitan at dawn,
    // which is the same thing the hero photograph is doing. Straight segments,
    // not curves: bezier shoulders read as a bell curve at this size.
    //
    // The rim deliberately stops at the summit's east side rather than tracing
    // the whole outline, so the gold reads as light falling from the west
    // instead of as a border.
    el.innerHTML =
      '<svg class="boot-peak" viewBox="0 0 120 72" aria-hidden="true">' +
      '<defs><linearGradient id="bootRock" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="oklch(0.34 0.014 258)"/>' +
      '<stop offset="1" stop-color="oklch(0.18 0.007 260)"/>' +
      '</linearGradient></defs>' +
      '<path class="base" pathLength="100" d="M0,66.5 L120,66.5"/>' +
      '<polygon class="mass" fill="url(#bootRock)"' +
      ' points="4,66 20,61 31,26 42,14 52,12 60,20 70,40 86,55 116,66"/>' +
      // The gold traces the WHOLE silhouette, not just the lit face. Two
      // earlier versions lit only the west side on the theory that it would
      // read as light falling — at actual size it read as a stray tick beside
      // a smudge, because the shape never closes. Judged against alternatives
      // rendered full-size rather than in small comparison cells, which is
      // what hid the problem the first time.
      '<polyline class="rim" pathLength="100"' +
      ' points="4,66 20,61 31,26 42,14 52,12 60,20 70,40 86,55 116,66"/>' +
      '</svg>' +
      '<div class="boot-mark">DARYL ECHEAZU</div>';

    styleEl = document.createElement("style");
    styleEl.textContent = [
      "#boot{position:fixed;inset:0;z-index:2147483647;background:" + BG + ";",
      "display:flex;flex-direction:column;align-items:center;justify-content:center;",
      "gap:20px;transition:opacity .5s cubic-bezier(.4,0,.2,1),",
      "transform .5s cubic-bezier(.4,0,.2,1)}",
      // Lifting slightly as it goes makes the reveal feel like the cover
      // clearing rather than the page blinking.
      "#boot[data-off]{opacity:0;transform:translateY(-10px);pointer-events:none}",
      // No CSS keyframes for the mark. The overlay is detached and re-attached
      // when documentElement is swapped, and re-inserting an element RESTARTS
      // its CSS animations — the mark was visibly drawing, then starting over.
      // paint() below drives these from elapsed time instead, so the sequence is
      // continuous however many times the element is re-inserted.
      "#boot .boot-peak{width:176px;height:auto;overflow:visible}",
      "#boot .boot-peak .base,#boot .boot-peak .rim{fill:none;",
      "stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:100}",
      "#boot .boot-peak .base{stroke:oklch(0.32 0.005 260);stroke-width:1}",
      "#boot .boot-peak .rim{stroke:" + GOLD + ";stroke-width:2.2;",
      "filter:drop-shadow(0 0 9px oklch(0.86 0.13 85 / .45))}",
      // Geist has not loaded this early — it arrives with the bundle — so this
      // deliberately names a system mono fallback that degrades gracefully.
      "#boot .boot-mark{font-family:'Geist Mono',ui-monospace,SFMono-Regular,Menlo,monospace;",
      "font-size:11px;letter-spacing:.34em;color:" + INK + ";opacity:0}",
      // The bundler's own status text sits bottom-right; the cover is above it,
      // but hide it so it cannot flash during the fade.
      "#__bundler_loading{display:none !important}"
    ].join("");
  }

  // documentElement gets replaced out from under us, taking <body> with it, so
  // re-attach rather than assuming we are still in the tree.
  function attach() {
    if (!document.body) return;
    if (styleEl && !styleEl.isConnected) (document.head || document.body).appendChild(styleEl);
    if (el && !el.isConnected) document.body.appendChild(el);
  }

  // Re-attaching on the next animation frame is not fast enough: rAF is starved
  // while the app compiles and mounts, so the cover stayed detached for exactly
  // the window it exists to hide — measured disappearing 71ms into a fast load,
  // before anything had rendered. A MutationObserver on `document` fires as a
  // microtask the moment documentElement is swapped, closing the gap.
  var mo = null;
  if (window.MutationObserver) {
    mo = new MutationObserver(attach);
    mo.observe(document, { childList: true });
  }

  // Rendered means the app has resolved its bindings — not merely that the
  // template has been swapped in, which is the state that shows "{{ t.label }}".
  function rendered() {
    var h = document.querySelector("h1, h2");
    if (!h || h.textContent.indexOf("{{") !== -1) return false;
    if (document.querySelectorAll("a").length < 4) return false;   // nav present
    var img = document.querySelector('img[style*="object-fit: cover"]');
    if (img && !img.complete) return false;                        // hero decoded
    return true;
  }

  function finish() {
    if (done) return;
    done = true;
    if (mo) mo.disconnect();
    window.__bootDone = true;   // real completion, distinct from a transient detach
    if (!el) return;
    el.setAttribute("data-off", "");
    setTimeout(function () {
      if (el && el.parentNode) el.parentNode.removeChild(el);
      if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    }, 500);
  }

  // Drives the mark from elapsed time rather than CSS keyframes — see the note
  // in css(). Ground, then the rock rises, then the light lands on it.
  function ease(p) { return 1 - Math.pow(1 - p, 3); }
  function seg(t, delay, dur) {
    return ease(Math.max(0, Math.min(1, (t - delay) / dur)));
  }

  function paint(t) {
    if (!el) return;
    var base = el.querySelector(".base"),
        mass = el.querySelector(".mass"),
        rim = el.querySelector(".rim"),
        name = el.querySelector(".boot-mark");
    if (base) base.style.strokeDashoffset = (100 * (1 - seg(t, 0, 450))).toFixed(2);
    if (mass) {
      var m = seg(t, 100, 620);
      mass.style.opacity = m.toFixed(3);
      mass.style.transform = "translateY(" + (7 * (1 - m)).toFixed(2) + "px)";
    }
    if (rim) rim.style.strokeDashoffset = (100 * (1 - seg(t, 220, 720))).toFixed(2);
    if (name) {
      var n = seg(t, 420, 700);
      name.style.opacity = (0.9 * n).toFixed(3);
      name.style.transform = "translateY(" + (4 * (1 - n)).toFixed(2) + "px)";
    }
  }

  function tick() {
    attach();
    var waited = Date.now() - start;
    paint(waited);
    if (waited > TIMEOUT) { finish(); return; }
    if (rendered() && waited > MIN_SHOW) { finish(); return; }
    requestAnimationFrame(tick);
  }

  make();
  attach();
  requestAnimationFrame(tick);
})();
