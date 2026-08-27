/* The frosted nav band, drawn OUTSIDE the zoom wrapper.
 *
 * The nav's own backdrop-filter hit a Chromium compositor bug: under the
 * wrapper's zoom (--z) the backdrop is missampled, so content scrolling
 * beneath the bar smeared and jittered. The nav element now keeps
 * backdrop-filter: none, and this script drives a body::before overlay
 * (styled by build.py's injected CSS) that lives in unzoomed screen space,
 * where sampling is correct: same 12px frost, no glitch.
 *
 * The script measures the nav's on-screen height (getBoundingClientRect is
 * post-zoom, exactly what a position: fixed overlay needs) into --frost-h,
 * and toggles .nav-frost on <html> for every tab except home, where the
 * design keeps the hero photo clean. Tab changes rewrite the nav's inline
 * background (a gradient on home, a flat tint elsewhere), so watching that
 * one style attribute is enough.
 *
 * Loaded in the outer head, pre-swap: document.documentElement is resolved
 * at call time, never captured, because the bundler replaces it at boot.
 */
(function () {
  var nav = null;
  var obs = new MutationObserver(function () { sync(); });

  function sync() {
    var root = document.documentElement;
    if (!nav || !document.contains(nav)) {
      nav = document.querySelector("div[style*='z-index: 20']");
      if (!nav) { root.classList.remove("nav-frost"); return; }
      obs.observe(nav, { attributes: true, attributeFilter: ["style"] });
    }
    var home = (nav.getAttribute("style") || "").indexOf("linear-gradient") !== -1;
    root.classList.toggle("nav-frost", !home);
    if (!home) {
      root.style.setProperty("--frost-h",
        nav.getBoundingClientRect().height + "px");
    }
  }

  window.addEventListener("resize", sync);
  // Safety net: re-find the nav if a re-render ever replaces the node.
  setInterval(sync, 900);
  sync();
})();
