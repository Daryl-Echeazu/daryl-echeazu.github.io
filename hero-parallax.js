/* HERO PARALLAX — PROTOTYPE.
 *
 * Gives the home screen some air: the photograph and the type over it move by
 * different amounts as you move the pointer, so the frame reads as a space
 * rather than a flat image.
 *
 * An honest limitation up front: this is ONE flat photograph, so there are no
 * true depth planes to separate. What is available is parallax between the
 * photo and the elements sitting on it — the headline, the caption, the links.
 * Moving those against the image, with the image drifting slightly the other
 * way, is what sells depth here. A real multi-plane effect would need the
 * subject cut out from the background, which is a different job.
 *
 * Same survival rules as valley.js: loaded from the outer head (already
 * executed by the time it is replaced), listeners on `document`, and element
 * references re-acquired whenever the app re-renders and detaches them.
 *
 * To remove: delete the file and its line in build.py. Nothing else refers to it.
 */
(function () {
  "use strict";

  // How far each layer travels, in px at full deflection. The photo moves least
  // and opposite the type — that opposition is what the eye reads as depth.
  var LAYERS = [
    { pick: heroImage,   x: -14, y: -9,  scale: 1.05 },
    { pick: heroHeading, x: 24,  y: 14 },
    { pick: heroCaption, x: 13,  y: 8 },
    { pick: heroLinks,   x: 17,  y: 10 }
  ];

  var tx = 0, ty = 0, cx = 0, cy = 0;   // target and current, normalised -1..1
  var running = false, active = false;

  // Must be the HOME hero, not just any covered image: the About page's photo
  // carousel also uses object-fit: cover, and an earlier version of this
  // selector grabbed it and jiggled the carousel. The hero is the one that
  // fills the viewport.
  function heroImage() {
    var imgs = document.querySelectorAll('img[style*="object-fit: cover"]');
    for (var i = 0; i < imgs.length; i++) {
      var b = imgs[i].getBoundingClientRect();
      if (b.width >= window.innerWidth * 0.9 &&
          b.height >= window.innerHeight * 0.7) return imgs[i];
    }
    return null;
  }
  function heroHeading() {
    var h = document.querySelector("h1");
    return h ? h.parentElement : null;      // the block holding headline + links
  }
  function heroCaption() {
    return Array.prototype.filter.call(document.querySelectorAll("div"), function (d) {
      return !d.children.length && /YOSEMITE\s*$/.test((d.textContent || "").trim());
    })[0] || null;
  }
  function heroLinks() {
    var a = document.querySelector('a[href^="mailto:"]');
    return a ? a.parentElement : null;
  }

  function onHome() { return !!heroImage(); }

  function frame() {
    // Ease toward the target so the motion has weight instead of tracking the
    // cursor rigidly.
    cx += (tx - cx) * 0.075;
    cy += (ty - cy) * 0.075;

    for (var i = 0; i < LAYERS.length; i++) {
      var L = LAYERS[i];
      var el = L.pick();
      if (!el) continue;
      var t = "translate3d(" + (cx * L.x).toFixed(2) + "px," +
              (cy * L.y).toFixed(2) + "px,0)";
      if (L.scale) t += " scale(" + L.scale + ")";   // hides the photo's edges
      el.style.transform = t;
      el.style.willChange = "transform";
    }

    if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) {
      requestAnimationFrame(frame);
    } else {
      running = false;
    }
  }

  function kick() {
    if (!running) { running = true; requestAnimationFrame(frame); }
  }

  function clear() {
    for (var i = 0; i < LAYERS.length; i++) {
      var el = LAYERS[i].pick();
      if (el) { el.style.transform = ""; el.style.willChange = ""; }
    }
  }

  // Off for anyone who has asked their system for less motion. The whole effect
  // IS motion, so there is nothing to keep. Checked live rather than once at
  // load, so toggling the OS setting takes effect without a reload — and
  // because reading it once at startup silently missed the case entirely.
  var reduceMQ = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  function motionOK() { return !(reduceMQ && reduceMQ.matches); }
  if (reduceMQ && reduceMQ.addEventListener) {
    reduceMQ.addEventListener("change", function () {
      if (!motionOK()) { tx = ty = 0; cx = cy = 0; clear(); }
    });
  }

  document.addEventListener("mousemove", function (e) {
    if (!motionOK()) return;
    if (!onHome()) {
      if (active) { active = false; tx = ty = 0; kick(); }
      return;
    }
    active = true;
    tx = (e.clientX / window.innerWidth) * 2 - 1;    // -1 .. 1
    ty = (e.clientY / window.innerHeight) * 2 - 1;
    kick();
  }, { passive: true });

  // Settle back when the pointer leaves the window entirely.
  document.addEventListener("mouseleave", function () {
    tx = ty = 0; kick();
  });

  // Phones: tilt, where the browser will give it without a permission prompt.
  // iOS 13+ requires DeviceOrientationEvent.requestPermission() from inside a
  // user gesture, which is not worth a modal on a prototype — so this is a
  // no-op there, and the hero simply sits still.
  if (window.DeviceOrientationEvent &&
      typeof window.DeviceOrientationEvent.requestPermission !== "function") {
    window.addEventListener("deviceorientation", function (e) {
      if (!motionOK() || !onHome() || e.gamma === null) return;
      tx = Math.max(-1, Math.min(1, e.gamma / 28));   // left/right tilt
      ty = Math.max(-1, Math.min(1, (e.beta - 45) / 32));
      kick();
    }, { passive: true });
  }

  window.__heroParallax = { clear: clear, motionOK: motionOK };
})();
