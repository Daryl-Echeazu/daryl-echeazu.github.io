/* THE ROUTE — a climbing topo up the hero photograph.
 *
 * El Capitan gets described in pitches, so the career does too: a gold route
 * line drawn up the wall, belay anchors at the milestones. Solid line for
 * pitches already climbed (UChicago -> Scale AI -> Apple), a dashed pitch to
 * the one racked up next (Google Cloud, fall), and a faint dotted line
 * wandering on toward the summit, which is not written yet.
 *
 * Points live in NATURAL photo pixels (2600x1734) and are mapped through the
 * hero's object-fit: cover transform at runtime, so they stay pinned to the
 * rock at every viewport and crop. The SVG mirrors the hero <img>'s inline
 * parallax transform (hero-parallax.js) via a MutationObserver, so the line
 * rides the photograph, not the frame.
 *
 * Anchors are hoverable (labels are SVG text, so they travel with the wall)
 * and clicking one opens the EXPERIENCE tab via the real nav link.
 *
 * Survival rules as valley.js: outer-head script, listeners on document,
 * everything re-acquired when the app re-renders. To remove: delete this
 * file and its line in build.py.
 */
(function () {
  "use strict";

  var NAT_W = 2600, NAT_H = 1734;

  // The prow between sunlit southwest face and shadowed southeast face.
  var PTS = {
    base:   [1310, 1330],
    p1:     [1222, 1060],
    p2:     [1160, 730],
    p3:     [1105, 495],
    p4:     [1130, 290],
    summit: [1240, 120]
  };
  var MILESTONES = [
    { at: "base", label: "UCHICAGO",     sub: "CS+MATH '28" },
    { at: "p1",   label: "SCALE AI",     sub: "PREV" },
    { at: "p2",   label: "APPLE",        sub: "NOW" },
    { at: "p3",   label: "GOOGLE CLOUD", sub: "FALL" }
  ];
  var GOLD = "oklch(0.82 0.13 85)";
  var GOLD_SOFT = "oklch(0.82 0.13 85 / 0.55)";

  function hero() {
    var imgs = document.querySelectorAll('img[style*="object-fit: cover"]');
    for (var i = 0; i < imgs.length; i++) {
      var b = imgs[i].getBoundingClientRect();
      if (b.width >= window.innerWidth * 0.9 &&
          b.height >= window.innerHeight * 0.7) return imgs[i];
    }
    return null;
  }

  // natural photo px -> box px under object-fit: cover, center position
  function mapper(w, h) {
    var s = Math.max(w / NAT_W, h / NAT_H);
    var ox = (w - NAT_W * s) / 2, oy = (h - NAT_H * s) / 2;
    return function (p) { return [p[0] * s + ox, p[1] * s + oy]; };
  }

  function seg(m, keys, style) {
    var d = keys.map(function (k, i) {
      var q = m(PTS[k]);
      return (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1);
    }).join(" ");
    var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", style.stroke);
    p.setAttribute("stroke-width", style.width);
    p.setAttribute("stroke-linejoin", "round");
    p.setAttribute("stroke-linecap", "round");
    if (style.dash) p.setAttribute("stroke-dasharray", style.dash);
    return p;
  }

  function goExperience() {
    var links = document.querySelectorAll("a");
    for (var i = 0; i < links.length; i++) {
      if ((links[i].textContent || "").trim() === "EXPERIENCE") {
        links[i].click();
        return;
      }
    }
  }

  var svg = null, watched = null, obs = null;

  function build(img) {
    var parent = img.parentElement;
    if (!parent) return;
    var b = img.getBoundingClientRect();
    if (b.width < 10 || b.height < 10) return;
    var w = b.width, h = b.height;
    var m = mapper(w, h);

    if (svg && svg.parentElement) svg.parentElement.removeChild(svg);
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.setAttribute("aria-hidden", "true");
    svg.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;" +
      "pointer-events:none;z-index:2;overflow:visible;";

    var drawn = false;
    try { drawn = !!sessionStorage.getItem("__route_drawn"); } catch (e) {}

    // pitches
    var climbed = seg(m, ["base", "p1", "p2"],
      { stroke: GOLD, width: 2 });
    var next = seg(m, ["p2", "p3"],
      { stroke: GOLD_SOFT, width: 2, dash: "7 7" });
    var future = seg(m, ["p3", "p4", "summit"],
      { stroke: "oklch(0.9 0.08 90 / 0.3)", width: 1.5, dash: "2 8" });
    [climbed, next, future].forEach(function (p, i) {
      p.style.filter = "drop-shadow(0 1px 3px oklch(0 0 0 / 0.5))";
      if (!drawn) {
        var len = 1;
        svg.appendChild(p);              // must be attached to measure
        try { len = p.getTotalLength(); } catch (e) {}
        p.style.strokeDasharray = p.getAttribute("stroke-dasharray")
          ? p.style.strokeDasharray : "";
        p.style.transition = "none";
        p.dataset.len = len;
      } else {
        svg.appendChild(p);
      }
    });

    // belay anchors + labels
    MILESTONES.forEach(function (ms, i) {
      var q = m(PTS[ms.at]);
      var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.style.cssText = "pointer-events:auto;cursor:pointer;";

      var hit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      hit.setAttribute("cx", q[0]); hit.setAttribute("cy", q[1]);
      hit.setAttribute("r", 16);
      hit.setAttribute("fill", "transparent");
      g.appendChild(hit);

      var d = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      var s = 4.6;
      d.setAttribute("x", q[0] - s); d.setAttribute("y", q[1] - s);
      d.setAttribute("width", s * 2); d.setAttribute("height", s * 2);
      d.setAttribute("transform", "rotate(45 " + q[0] + " " + q[1] + ")");
      d.setAttribute("fill", ms.sub === "FALL" ? "oklch(0.16 0.005 260)" : GOLD);
      d.setAttribute("stroke", GOLD);
      d.setAttribute("stroke-width", "1.4");
      d.style.filter = "drop-shadow(0 1px 4px oklch(0 0 0 / 0.6))";
      g.appendChild(d);

      var lab = document.createElementNS("http://www.w3.org/2000/svg", "g");
      lab.style.cssText = "opacity:0;transition:opacity 0.25s ease;";
      var t1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t1.setAttribute("x", q[0] - 16); t1.setAttribute("y", q[1] + 1);
      t1.setAttribute("text-anchor", "end");
      t1.setAttribute("fill", "oklch(0.97 0.003 260)");
      t1.style.cssText =
        "font-family:'Geist Mono',monospace;font-size:11px;" +
        "letter-spacing:0.1em;paint-order:stroke;" +
        "stroke:oklch(0.13 0.005 260 / 0.85);stroke-width:3px;";
      t1.textContent = ms.label;
      var t2 = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t2.setAttribute("x", q[0] - 16); t2.setAttribute("y", q[1] + 14);
      t2.setAttribute("text-anchor", "end");
      t2.setAttribute("fill", GOLD);
      t2.style.cssText = t1.style.cssText + "font-size:9px;";
      t2.textContent = ms.sub;
      lab.appendChild(t1); lab.appendChild(t2);
      g.appendChild(lab);

      g.addEventListener("mouseenter", function () { lab.style.opacity = "1"; });
      g.addEventListener("mouseleave", function () { lab.style.opacity = "0"; });
      g.addEventListener("click", goExperience);
      var tt = document.createElementNS("http://www.w3.org/2000/svg", "title");
      tt.textContent = ms.label + " — " + ms.sub;
      g.appendChild(tt);
      svg.appendChild(g);
    });

    parent.appendChild(svg);
    mirror(img);

    // First view: draw the line bottom-to-top, one pitch after the other.
    if (!drawn) {
      var paths = [climbed, next, future];
      paths.forEach(function (p) {
        var len = parseFloat(p.dataset.len || "1");
        var base = p.getAttribute("stroke-dasharray");
        // draw-in via a long dash overlaying any pattern; pattern returns after
        p.setAttribute("stroke-dasharray", len + " " + len);
        p.style.strokeDashoffset = len;
      });
      setTimeout(function () {
        var delay = 0;
        paths.forEach(function (p) {
          var len = parseFloat(p.dataset.len || "1");
          p.style.transition = "stroke-dashoffset 1.1s ease " + delay + "s";
          p.style.strokeDashoffset = 0;
          delay += 0.55;
        });
        setTimeout(function () {
          paths.forEach(function (p, i) {
            p.style.transition = "none";
            p.setAttribute("stroke-dasharray",
              i === 1 ? "7 7" : i === 2 ? "2 8" : "");
            if (i === 0) p.removeAttribute("stroke-dasharray");
            p.style.strokeDashoffset = "";
          });
        }, delay * 1000 + 1300);
        try { sessionStorage.setItem("__route_drawn", "1"); } catch (e) {}
      }, 1450); // let the boot cover lift first
    }
  }

  function mirror(img) {
    if (obs) obs.disconnect();
    watched = img;
    var sync = function () {
      if (svg) svg.style.transform = img.style.transform || "";
    };
    obs = new MutationObserver(sync);
    obs.observe(img, { attributes: true, attributeFilter: ["style"] });
    sync();
  }

  var lastW = 0;
  setInterval(function () {
    var img = hero();
    if (!img) {
      if (svg && svg.parentElement) { svg.parentElement.removeChild(svg); }
      svg = null;
      return;
    }
    var b = img.getBoundingClientRect();
    var alive = svg && svg.parentElement === img.parentElement;
    if (!alive || img !== watched || Math.abs(b.width - lastW) > 1) {
      lastW = b.width;
      build(img);
    }
  }, 600);
})();
