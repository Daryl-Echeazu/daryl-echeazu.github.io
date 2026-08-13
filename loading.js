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
  var MUTED = "oklch(0.55 0.005 260)";
  var TIMEOUT = 9000;      // absolute ceiling, whatever happens
  var MIN_SHOW = 380;      // avoid a one-frame blink on a warm cache

  var start = Date.now();
  var el = null, styleEl = null, done = false;

  function make() {
    el = document.createElement("div");
    el.id = "boot";
    el.setAttribute("role", "status");
    el.setAttribute("aria-label", "Loading");
    el.innerHTML =
      '<div class="boot-mark">DARYL ECHEAZU</div>' +
      '<div class="boot-bar"><i></i></div>';

    styleEl = document.createElement("style");
    styleEl.textContent = [
      "#boot{position:fixed;inset:0;z-index:2147483647;background:" + BG + ";",
      "display:flex;flex-direction:column;align-items:center;justify-content:center;",
      "gap:18px;transition:opacity .45s cubic-bezier(.4,0,.2,1)}",
      "#boot[data-off]{opacity:0;pointer-events:none}",
      // Geist has not loaded this early — it arrives with the bundle — so this
      // deliberately names a system mono fallback that degrades gracefully.
      "#boot .boot-mark{font-family:'Geist Mono',ui-monospace,SFMono-Regular,Menlo,monospace;",
      "font-size:12px;letter-spacing:.32em;color:" + INK + ";opacity:.92;",
      "animation:bootPulse 1.8s ease-in-out infinite}",
      "#boot .boot-bar{width:132px;height:1px;background:oklch(0.28 0.005 260);",
      "overflow:hidden;position:relative}",
      "#boot .boot-bar i{position:absolute;inset:0;display:block;background:" + MUTED + ";",
      "transform:translateX(-100%);animation:bootSlide 1.25s cubic-bezier(.4,0,.2,1) infinite}",
      "@keyframes bootPulse{0%,100%{opacity:.92}50%{opacity:.45}}",
      "@keyframes bootSlide{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}",
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

  function tick() {
    attach();
    var waited = Date.now() - start;
    if (waited > TIMEOUT) { finish(); return; }
    if (rendered() && waited > MIN_SHOW) { finish(); return; }
    requestAnimationFrame(tick);
  }

  make();
  attach();
  requestAnimationFrame(tick);
})();
