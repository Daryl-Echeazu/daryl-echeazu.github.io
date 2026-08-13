/* THE VALLEY — an interactive section of Yosemite Valley.
 *
 * The About page already carries eight captioned photographs of named places in
 * the valley, shown in a next/prev carousel. This turns that slideshow into a
 * map: a west-to-east profile of the valley with each photograph pinned where it
 * was taken, so the set reads as one place instead of nine unrelated frames.
 *
 * Architecture notes, because this lives alongside generated output:
 *
 *  - Loaded from the OUTER document, which the bundler replaces wholesale at
 *    startup. That is fine: this file executes during the initial parse, and its
 *    listeners are bound to `document` and `window`, which survive the swap. It
 *    must therefore never hold references to elements across that boundary.
 *  - The overlay mounts on document.body, OUTSIDE the app's root, so the app's
 *    re-renders (every tab change) cannot remove it.
 *  - The trigger is a delegated listener rather than an injected button, for the
 *    same reason: anything injected into the app's subtree is wiped on re-render.
 *  - Photographs are resolved through window.__resources, the map the bundler
 *    runtime publishes. No filenames are hardcoded, so a re-export that renames
 *    assets does not break this.
 */
(function () {
  "use strict";

  // A stylised west-to-east section, not a survey: El Capitan on the west wall,
  // the floor running through, and the Merced canyon climbing away east where
  // the Mist Trail is. res* keys match the app's own photo list.
  //
  // Each pin sits ON the silhouette drawn in terrain(), so these coordinates and
  // that path have to be edited together.
  var PLACES = [
    { id: "res6", name: "Tunnel View",   x: 74,  y: 298, lab: "below", note: "The first look — the whole valley in one frame." },
    { id: "res0", name: "El Capitan",    x: 218, y: 122, lab: "above", note: "The west gate. Granite, straight up." },
    { id: "res3", name: "Merced River",  x: 400, y: 332, lab: "below", note: "Runs the length of the valley floor." },
    { id: "res8", name: "Glacier Point", x: 612, y: 210, lab: "above", note: "The south rim, looking straight across at Half Dome." },
    { id: "res1", name: "Mirror Lake",   x: 690, y: 306, lab: "below", note: "East end, under Half Dome." },
    { id: "res5", name: "Mist Trail",    x: 772, y: 262, lab: "above", note: "The spray, and what it does to the light." },
    { id: "res2", name: "Vernal Fall",   x: 858, y: 250, lab: "below", note: "Top of the Mist Trail's first pitch." },
    { id: "res4", name: "Liberty Cap",   x: 910, y: 192, lab: "above", note: "The dome standing over Nevada Fall." }
  ];

  var BG = "oklch(0.13 0.005 260)";
  var INK = "oklch(0.94 0.005 260)";
  var MUTED = "oklch(0.58 0.005 260)";
  var GOLD = "oklch(0.86 0.13 85)";

  var root = null;      // overlay element, built once
  var current = -1;

  function css() {
    return [
      "#valley{position:fixed;inset:0;z-index:99999;display:none;",
      "background:" + BG + ";color:" + INK + ";",
      "font-family:'Geist',Helvetica,sans-serif;overflow-y:auto;",
      "animation:valleyIn .28s cubic-bezier(.4,0,.2,1)}",
      "#valley[data-open]{display:block}",
      "@keyframes valleyIn{from{opacity:0}to{opacity:1}}",
      "#valley .vwrap{max-width:1180px;margin:0 auto;padding:26px 22px 56px;box-sizing:border-box}",
      "#valley .vhead{display:flex;align-items:baseline;justify-content:space-between;gap:16px}",
      "#valley .vtitle{font-family:'Instrument Serif',Georgia,serif;font-size:clamp(30px,5vw,52px);",
      "line-height:1;margin:0}",
      "#valley .vsub{font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:.18em;",
      "color:" + MUTED + "}",
      "#valley .vclose{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.14em;",
      "color:" + MUTED + ";background:none;border:1px solid oklch(0.30 0.005 260);border-radius:999px;",
      "padding:7px 14px;cursor:pointer}",
      "#valley .vclose:hover,#valley .vclose:focus-visible{color:" + INK + ";border-color:" + MUTED + "}",
      "#valley svg{width:100%;height:auto;max-height:38vh;display:block;margin-top:18px;touch-action:manipulation}",
      "#valley .pin{cursor:pointer}",
      "#valley .pin circle.hit{fill:transparent}",
      "#valley .pin circle.dot{fill:" + MUTED + ";transition:r .18s ease,fill .18s ease}",
      "#valley .pin text{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.1em;",
      "fill:" + MUTED + ";transition:fill .18s ease}",
      "#valley .pin:hover circle.dot,#valley .pin[data-on] circle.dot{fill:" + GOLD + ";r:6}",
      "#valley .pin:hover text,#valley .pin[data-on] text{fill:" + INK + "}",
      "#valley .pin:focus{outline:none}",
      "#valley .pin:focus-visible circle.dot{fill:" + GOLD + ";r:7}",
      "#valley .vcard{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:26px;",
      "align-items:center;margin-top:26px;min-height:230px}",
      "#valley .vphoto{width:100%;aspect-ratio:3/2;object-fit:cover;background:oklch(0.18 0.005 260);",
      "display:block}",
      "#valley .vname{font-family:'Instrument Serif',Georgia,serif;font-size:clamp(24px,3.4vw,38px);",
      "margin:0 0 10px;line-height:1.05}",
      "#valley .vnote{font-size:16px;line-height:1.55;color:oklch(0.74 0.005 260);margin:0;max-width:42ch}",
      "#valley .vhint{font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:.18em;",
      "color:" + MUTED + ";margin-top:16px}",
      "#valley .vmap{margin-top:18px}",
      "@media (max-width:720px){",
      // Scaled to a phone the whole valley becomes a decorative strip with
      // unreadable labels and ~18px tap targets. Hold it at a legible width and
      // let the valley be swiped west to east instead — which is how you would
      // walk it anyway.
      "#valley .vmap{overflow-x:auto;-webkit-overflow-scrolling:touch;",
      "margin:18px -22px 0;padding:0 22px}",
      "#valley svg{width:760px;max-height:none}",
      "#valley .pin text{font-size:13px}",
      "#valley .vcard{grid-template-columns:1fr;gap:16px;min-height:0}",
      "#valley .vhint::after{content:' · SWIPE THE VALLEY'}",
      "}"
    ].join("");
  }

  // A longitudinal section of the valley, west on the left. Curves rather than
  // straight segments, or it reads as a line chart: El Capitan is a squared-off
  // monolith, Half Dome a round shoulder with a sheer west face, and the floor
  // stays flat until the Merced canyon climbs away east past the falls. Kept
  // deliberately flat and line-art — it has to sit next to photographs without
  // competing with them.
  function terrain() {
    return [
      // far ridge, for depth
      '<path d="M0,258 C120,238 210,224 300,242 C420,266 520,226 640,220',
      ' C764,214 862,190 1000,208 L1000,380 L0,380 Z" fill="oklch(0.168 0.006 260)"/>',
      // the valley itself
      '<path d="M0,306 L118,302 L146,158 C150,134 166,124 196,124 L246,124',
      ' C274,124 286,140 292,168 L330,258 C372,300 434,308 500,306 L558,302',
      ' C584,266 598,232 614,214 C632,234 650,270 670,296 L700,308',
      ' C722,302 738,284 752,246 C762,182 786,152 814,152 C842,152 856,180 858,222',
      ' L874,264 C886,238 898,208 910,196 C926,208 942,242 962,270 L1000,288',
      ' L1000,380 L0,380 Z" fill="oklch(0.213 0.007 260)"/>',
      // Vernal Fall, dropping from the lip the pin sits on
      '<path d="M857,252 L861,252 L863,300 L855,300 Z" fill="oklch(0.62 0.02 240)" opacity=".55"/>',
      // valley floor and the Merced running through it
      '<path d="M0,338 L340,340 L560,338 L700,336 L790,318 L880,286 L1000,266 L1000,380 L0,380 Z"',
      ' fill="oklch(0.252 0.008 260)"/>',
      '<path d="M40,344 C240,350 420,342 600,340 C690,338 748,326 812,300"',
      ' fill="none" stroke="oklch(0.46 0.035 240)" stroke-width="2.5" opacity=".8"/>'
    ].join("");
  }

  function build() {
    var style = document.createElement("style");
    style.id = "valley-style";
    style.textContent = css();
    document.head.appendChild(style);

    var el = document.createElement("div");
    el.id = "valley";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "The Valley — a map of Yosemite photographs");

    var pins = PLACES.map(function (p, i) {
      var anchor = p.x > 850 ? "end" : (p.x < 110 ? "start" : "middle");
      var ty = p.lab === "above" ? p.y - 17 : p.y + 25;
      return [
        '<g class="pin" tabindex="0" role="button" data-i="' + i + '"',
        ' aria-label="' + p.name + '">',
        '<circle class="hit" cx="' + p.x + '" cy="' + p.y + '" r="30"/>',
        '<circle class="dot" cx="' + p.x + '" cy="' + p.y + '" r="4.5"/>',
        '<text x="' + p.x + '" y="' + ty + '" text-anchor="' + anchor + '">',
        p.name.toUpperCase(), '</text></g>'
      ].join("");
    }).join("");

    el.innerHTML = [
      '<div class="vwrap">',
      '<div class="vhead"><div>',
      '<h2 class="vtitle">The Valley</h2>',
      '<div class="vsub">YOSEMITE &middot; WEST TO EAST</div>',
      '</div><button class="vclose" type="button">CLOSE &nbsp;ESC</button></div>',
      // Cropped to the terrain: the top 96 units are empty sky, and leaving them
      // in pushes the photograph below the fold on a laptop.
      '<div class="vmap"><svg viewBox="0 96 1000 292" preserveAspectRatio="xMidYMid meet"',
      ' aria-hidden="true">', terrain(), pins, '</svg></div>',
      '<div class="vcard">',
      '<img class="vphoto" alt="" decoding="async">',
      '<div><h3 class="vname"></h3><p class="vnote"></p>',
      '<div class="vhint">HOVER OR TAP A POINT &middot; &larr; &rarr; TO MOVE</div></div>',
      '</div></div>'
    ].join("");

    document.body.appendChild(el);

    el.querySelector(".vclose").addEventListener("click", close);
    el.addEventListener("click", function (e) { if (e.target === el) close(); });

    Array.prototype.forEach.call(el.querySelectorAll(".pin"), function (g) {
      var i = +g.getAttribute("data-i");
      g.addEventListener("mouseenter", function () { select(i); });
      g.addEventListener("focus", function () { select(i); });
      g.addEventListener("click", function () { select(i); });
      g.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(i); }
      });
    });

    return el;
  }

  function select(i) {
    if (!root || i === current) return;
    current = i;
    var p = PLACES[i];
    var src = (window.__resources || {})[p.id];
    var img = root.querySelector(".vphoto");
    if (src) { img.src = src; img.style.visibility = "visible"; }
    else { img.removeAttribute("src"); img.style.visibility = "hidden"; }
    img.alt = p.name + ", Yosemite";
    root.querySelector(".vname").textContent = p.name;
    root.querySelector(".vnote").textContent = p.note;
    Array.prototype.forEach.call(root.querySelectorAll(".pin"), function (g) {
      if (+g.getAttribute("data-i") === i) g.setAttribute("data-on", "");
      else g.removeAttribute("data-on");
    });
  }

  function step(d) {
    select((current + d + PLACES.length) % PLACES.length);
    var g = root.querySelector('.pin[data-i="' + current + '"]');
    if (g) g.focus();
  }

  function open() {
    if (!root) root = build();
    root.setAttribute("data-open", "");
    document.body.style.overflow = "hidden";
    current = -1;
    select(1);                                   // open on El Capitan, the hero
    root.querySelector(".vclose").focus();
  }

  function close() {
    if (!root) return;
    root.removeAttribute("data-open");
    document.body.style.overflow = "";
  }

  document.addEventListener("keydown", function (e) {
    if (!root || !root.hasAttribute("data-open")) return;
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
  });

  // Delegated so it survives the app's re-renders. The photo caption is the
  // natural doorway: it already names the place you are looking at.
  document.addEventListener("click", function (e) {
    var n = e.target;
    for (var i = 0; n && i < 4; i++, n = n.parentElement) {
      var s = n.getAttribute && n.getAttribute("style");
      if (s && s.indexOf("margin-top: 9px") !== -1 &&
          /YOSEMITE|APPLE PARK/.test(n.textContent || "")) {
        e.preventDefault();
        open();
        return;
      }
    }
  });

  window.__openValley = open;   // also reachable from the DarylOS terminal
})();
