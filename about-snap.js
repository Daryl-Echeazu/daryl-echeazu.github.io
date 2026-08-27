/* Gentle section snap for the About page.
 *
 * The page shipped with native CSS scroll-snap (y proximity), but the whole
 * app sits in a wrapper scaled with zoom (--z), and Chromium computes snap
 * offsets in pre-zoom units: the snap lands off-target and re-corrects,
 * fighting the scroll mid-gesture — it read as jagged. build.py now sets
 * scroll-snap-type: none in the template (the attribute string stays, and
 * doubles as the marker this script keys on) and this reimplements the snap
 * by hand: when a scroll gesture has fully settled within reach of a section
 * top, glide to it. offsetTop and scrollTop share the container's own
 * pre-zoom units, so the zoom never enters the math.
 *
 * Loaded in the outer head; the listener lives on `document`, which survives
 * the bundler's documentElement swap (same pattern as valley.js).
 */
(function () {
  var REACH = 160; // start pulling within this many page-px of a section top
  var NAV = 90;    // room for the fixed nav above a snapped section
  var timer = null;

  function settle(c) {
    var max = c.scrollHeight - c.clientHeight;
    var here = c.scrollTop;
    if (here < 1 || here > max - 1) return; // let the ends rest
    var best = null, bestD = REACH;
    var ts = c.querySelectorAll("[style*='scroll-snap-align']");
    for (var i = 0; i < ts.length; i++) {
      var want = Math.min(max, Math.max(0, ts[i].offsetTop - NAV));
      var d = Math.abs(want - here);
      if (d < bestD) { bestD = d; best = want; }
    }
    // The glide itself fires scroll events, which re-arm the timer and land
    // back here at distance ~0; the guard makes that a no-op, not a loop.
    if (best !== null && bestD > 1) c.scrollTo({ top: best, behavior: "smooth" });
  }

  document.addEventListener("scroll", function (e) {
    var t = e.target;
    if (!t || t.nodeType !== 1 || !t.getAttribute) return;
    if ((t.getAttribute("style") || "").indexOf("scroll-snap-type") === -1) return;
    clearTimeout(timer);
    timer = setTimeout(function () { settle(t); }, 150);
  }, true);
})();
