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
    // `water` lights the matching feature in the drawing while the place is
    // selected, so the map answers back rather than only the photograph.
    { id: "res3", name: "Merced River",  x: 400, y: 332, lab: "below", water: "river", note: "Runs the length of the valley floor." },
    { id: "res8", name: "Glacier Point", x: 612, y: 210, lab: "above", note: "The south rim, looking straight across at Half Dome." },
    { id: "res1", name: "Mirror Lake",   x: 690, y: 306, lab: "below", water: "lake", note: "East end, under Half Dome." },
    { id: "res5", name: "Mist Trail",    x: 772, y: 262, lab: "below", water: "mist", note: "The spray, and what it does to the light." },
    // Labelled above: below, the text ran straight through the falls drawn at
    // this same x.
    { id: "res2", name: "Vernal Fall",   x: 858, y: 250, lab: "above", water: "fall", note: "Top of the Mist Trail's first pitch." },
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
      "animation:valleyIn .34s cubic-bezier(.4,0,.2,1)}",
      "#valley[data-open]{display:block}",
      // Closing mirrors opening — it kept the fade on the way in and cut hard on
      // the way out, which read as a bug rather than a transition.
      "#valley[data-closing]{animation:valleyOut .26s cubic-bezier(.4,0,.2,1) forwards}",
      "@keyframes valleyIn{from{opacity:0;transform:scale(.985)}",
      "to{opacity:1;transform:none}}",
      "@keyframes valleyOut{from{opacity:1;transform:none}",
      "to{opacity:0;transform:scale(.99)}}",
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
      // Overshooting easing so the dot springs rather than eases — at 0.18s
      // linear it barely registered as a transition at all.
      "#valley .pin circle.dot{fill:" + MUTED + ";",
      "transition:r .34s cubic-bezier(.2,1.5,.4,1),fill .28s ease,filter .28s ease}",
      "#valley .pin text{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.1em;",
      "fill:" + MUTED + ";transition:fill .28s ease,letter-spacing .34s ease}",
      "#valley .pin:hover circle.dot{fill:" + GOLD + ";r:6.5}",
      "#valley .pin[data-on] circle.dot{fill:" + GOLD + ";r:7;",
      "filter:drop-shadow(0 0 7px oklch(0.86 0.13 85 / .65))}",
      "#valley .pin:hover text{fill:" + INK + "}",
      "#valley .pin[data-on] text{fill:" + INK + ";letter-spacing:.16em}",
      // A slow sonar ping on the selected point, so the eye can find it again
      // after looking away at the photograph.
      "#valley .pin circle.ring{fill:none;stroke:" + GOLD + ";stroke-width:1.4;opacity:0}",
      "#valley .pin[data-on] circle.ring{animation:vping 2.1s cubic-bezier(.2,.7,.3,1) infinite}",
      "@keyframes vping{0%{r:7;opacity:.55}70%{opacity:0}100%{r:22;opacity:0}}",
      "#valley .pin:focus{outline:none}",
      "#valley .pin:focus-visible circle.dot{fill:" + GOLD + ";r:7.5}",
      // Water answers back: selecting a river, lake or falls lights that feature
      // in the drawing, so the map confirms what you picked rather than leaving
      // all the feedback to the photograph. Cool blue against the pin's gold.
      "#valley .w-river,#valley .w-lake,#valley .w-fall,#valley .w-mist{",
      "transition:filter .45s ease,opacity .45s ease,stroke .45s ease}",
      "#valley[data-water='river'] .w-river{stroke:oklch(0.88 0.10 235);opacity:1;",
      "filter:drop-shadow(0 0 7px oklch(0.80 0.14 235 / .85))}",
      "#valley[data-water='lake'] .w-lake{opacity:.95;",
      "filter:drop-shadow(0 0 9px oklch(0.80 0.14 235 / .8))}",
      "#valley[data-water='fall'] .w-fall{opacity:1;",
      "filter:drop-shadow(0 0 8px oklch(0.86 0.12 235 / .9))}",
      "#valley[data-water='fall'] .w-mist{opacity:.4}",
      "#valley[data-water='mist'] .w-mist{opacity:.55;",
      "filter:drop-shadow(0 0 10px oklch(0.86 0.10 235 / .8))}",
      "#valley[data-water='mist'] .w-fall{opacity:.9}",
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
  // Height of the valley floor at x — must track the floor path drawn below.
  function floorY(x) {
    var pts = [[0, 338], [340, 340], [560, 338], [700, 336],
               [790, 318], [880, 286], [1000, 266]];
    for (var i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) {
        var a = pts[i - 1], b = pts[i];
        return a[1] + (b[1] - a[1]) * ((x - a[0]) / (b[0] - a[0]));
      }
    }
    return pts[pts.length - 1][1];
  }

  function terrain() {
    var out = [
      // Atmospheric perspective: distance reads as lighter and bluer, so the
      // ridges separate without any outlines.
      '<defs>',
      '<linearGradient id="vsky" x1="0" y1="0" x2="0" y2="1">',
      '<stop offset="0" stop-color="oklch(0.20 0.022 250)"/>',
      '<stop offset="1" stop-color="oklch(0.135 0.006 260)"/></linearGradient>',
      '<linearGradient id="vfar" x1="0" y1="0" x2="0" y2="1">',
      '<stop offset="0" stop-color="oklch(0.205 0.020 252)"/>',
      '<stop offset="1" stop-color="oklch(0.160 0.010 258)"/></linearGradient>',
      '<linearGradient id="vnear" x1="0" y1="0" x2="0" y2="1">',
      '<stop offset="0" stop-color="oklch(0.255 0.010 258)"/>',
      '<stop offset="1" stop-color="oklch(0.185 0.006 260)"/></linearGradient>',
      '<linearGradient id="vfall" x1="0" y1="0" x2="0" y2="1">',
      '<stop offset="0" stop-color="oklch(0.86 0.03 235)" stop-opacity=".85"/>',
      '<stop offset="1" stop-color="oklch(0.70 0.03 235)" stop-opacity=".15"/></linearGradient>',
      '</defs>',
      '<rect x="0" y="96" width="1000" height="292" fill="url(#vsky)"/>',
      // far ridge
      '<path d="M0,258 C120,238 210,224 300,242 C420,266 520,226 640,220',
      ' C764,214 862,190 1000,208 L1000,388 L0,388 Z" fill="url(#vfar)"/>',
      // the valley itself — the silhouette the pins are placed against
      '<path d="M0,306 L118,302 L146,158 C150,134 166,124 196,124 L246,124',
      ' C274,124 286,140 292,168 L330,258 C372,300 434,308 500,306 L558,302',
      ' C584,266 598,232 614,214 C632,234 650,270 670,296 L700,308',
      ' C722,302 738,284 752,246 C762,182 786,152 814,152 C842,152 856,180 858,222',
      ' L874,264 C886,238 898,208 910,196 C926,208 942,242 962,270 L1000,288',
      ' L1000,388 L0,388 Z" fill="url(#vnear)"/>'
    ];
    // El Capitan's face is read by its vertical striations more than its outline.
    for (var i = 0; i < 7; i++) {
      var x = 158 + i * 19;
      out.push('<path d="M' + x + ',' + (132 + i % 3 * 5) + ' L' + (x + 5) + ',292"',
               ' stroke="oklch(0.34 0.008 260)" stroke-width="1.2" fill="none"',
               ' opacity="' + (0.30 + (i % 3) * 0.12).toFixed(2) + '"/>');
    }
    out.push(
      // Vernal Fall, dropping from the lip the pin sits on, with spray at its foot
      '<path class="w-fall" d="M856,252 L862,252 L865,302 L853,302 Z" fill="url(#vfall)"/>',
      '<ellipse class="w-mist" cx="859" cy="303" rx="17" ry="5" fill="oklch(0.78 0.02 235)" opacity=".16"/>',
      '<ellipse class="w-mist" cx="859" cy="300" rx="10" ry="3.4" fill="oklch(0.86 0.02 235)" opacity=".14"/>',
      // valley floor and the Merced running through it
      '<path d="M0,338 L340,340 L560,338 L700,336 L790,318 L880,286 L1000,266',
      ' L1000,388 L0,388 Z" fill="oklch(0.238 0.008 260)"/>',
      // Mirror Lake — named on the map but never drawn until now, which left its
      // pin sitting on bare ground.
      '<ellipse class="w-lake" cx="690" cy="336" rx="30" ry="5"',
      ' fill="oklch(0.46 0.045 238)" opacity=".55"/>',
      '<ellipse class="w-lake" cx="690" cy="335" rx="18" ry="2.2"',
      ' fill="oklch(0.72 0.05 238)" opacity=".35"/>',
      '<path class="w-river" d="M40,344 C240,350 420,342 600,340 C690,338 748,326 812,300"',
      ' fill="none" stroke="oklch(0.52 0.045 238)" stroke-width="2.6" opacity=".75"/>'
    );
    // A sparse conifer line for scale against the walls. Each tree is planted on
    // the floor path rather than a flat baseline, or the eastern ones float as
    // the canyon climbs.
    for (var t = 0; t < 26; t++) {
      var tx = 26 + t * 37 + (t % 3) * 6;
      var th = 9 + (t % 4) * 3;
      var base = floorY(tx);
      out.push('<path d="M' + tx + ',' + (base - th).toFixed(1) +
               ' l' + (th / 2.6).toFixed(1) + ',' + th +
               ' l' + (-th / 1.3).toFixed(1) + ',0 Z" fill="oklch(0.20 0.02 155)" opacity=".55"/>');
    }
    return out.join("");
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
        '<circle class="ring" cx="' + p.x + '" cy="' + p.y + '" r="7"/>',
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
    if (p.water) root.setAttribute("data-water", p.water);
    else root.removeAttribute("data-water");
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

  var closeTimer = null;
  function close() {
    if (!root || !root.hasAttribute("data-open") || root.hasAttribute("data-closing")) return;
    root.setAttribute("data-closing", "");
    clearTimeout(closeTimer);
    closeTimer = setTimeout(function () {          // matches valleyOut's .26s
      root.removeAttribute("data-open");
      root.removeAttribute("data-closing");
      document.body.style.overflow = "";
    }, 260);
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
