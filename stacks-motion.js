/* The Stacks: still -> clip.
 *
 * Hover a spine and the cover (already on screen, preloaded) gives way to a
 * slow pan across the show's official banner art; keep hovering and, once the
 * official trailer is genuinely playing behind it, the still crossfades into
 * the trailer. Books (no banner or trailer) get a slow zoom on their cover.
 *
 *   - Nothing loads until you hover: the banner on hover (neighbours' banners
 *     are fetched next), the trailer only after DWELL ms on the same spine.
 *   - One trailer at a time, rendered large so YouTube serves HD (desktop), muted, no
 *     controls. It stays hidden until it has played WARM seconds on its own
 *     clock — past YouTube's start-up controls and any ad — and is never
 *     paused, because a resume makes YouTube redraw its play/pause/skip
 *     overlay. Moving to another spine destroys it.
 *   - Phones: tapping a spine selects it; if it stays selected for DWELL ms the
 *     trailer loads the same way, rendered smaller so YouTube serves ~480p
 *     (about a third of the data). Data saver on: the still only.
 *
 * Drawn as a fixed overlay on top of the app's cover <img>, outside React's
 * tree (and outside the zoom wrapper, so getBoundingClientRect is exact).
 * Data: covers/scenes.json, written by fetch_covers.py. Loaded in the outer
 * head; everything hangs off document/window, which survive the bundler swap.
 */
(function () {
  var START = 8;          // seconds into the trailer to start from
  var WARM = 4.2;         // seconds of real playback before the clip may show
  var DWELL = 500;        // ms on one spine before a trailer loads
  var ZOOM = 1.4;         // crops YouTube's title bar / logo out of the frame

  var canClip = !(navigator.connection && navigator.connection.saveData);
  // YouTube picks the stream from the player's size: HD for mouse-driven
  // screens, ~480p on touch devices (sharp at a phone-sized card).
  var touch = !!(window.matchMedia && matchMedia("(hover: none), (pointer: coarse)").matches);
  var PW = touch ? 854 : 1280, PH = touch ? 480 : 720;

  var scenes = null, ov = null, still = null, shownKey = null, active = false;
  var css = document.createElement("style");
  css.textContent =
    "@keyframes smPan{from{background-position:0% 50%;transform:scale(1.04)}to{background-position:100% 50%;transform:scale(1.12)}}" +
    "@keyframes smZoom{from{transform:scale(1)}to{transform:scale(1.12) translate(-2%,-2%)}}" +
    ".sm-ov{position:fixed;z-index:18;overflow:hidden;pointer-events:none}" +
    ".sm-l{position:absolute;inset:0;opacity:0;transition:opacity .6s ease}" +
    ".sm-l.on{opacity:1}" +
    ".sm-pan{background-size:auto 100%;background-repeat:no-repeat;animation:smPan 14s ease-in-out infinite alternate}" +
    ".sm-zoom{background-size:cover;background-position:center;animation:smZoom 12s ease-in-out infinite alternate}" +
    ".sm-v{position:fixed;z-index:18;overflow:hidden;pointer-events:none;opacity:0;transition:opacity 1s ease}" +
    ".sm-v>div{position:absolute;transform-origin:0 0}";

  function loadScenes() {
    if (scenes) return;
    scenes = {};
    fetch("covers/scenes.json").then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) { scenes = d || {}; shownKey = null; }).catch(function () {});
  }

  function coverImg() {
    var imgs = document.querySelectorAll('img[draggable="false"][alt]');
    for (var i = 0; i < imgs.length; i++) {
      var r = imgs[i].getBoundingClientRect();
      if (r.width > 100 && r.height > 150) return imgs[i];
    }
    return null;
  }

  function prefetchNeighbours(title) {
    var spines = Array.prototype.map.call(document.querySelectorAll('div[role="button"][title]'), function (d) { return d.title; });
    var i = spines.indexOf(title);
    [i - 1, i + 1].forEach(function (j) {
      var s = scenes[spines[j]];
      if (s && s.banner) { var im = new Image(); im.src = s.banner; }
    });
  }

  // ── The still ───────────────────────────────────────────────────────────
  function showStill(title, img) {
    var s = scenes[title] || {};
    var el = document.createElement("div");
    var src = s.banner || img.currentSrc;
    el.className = "sm-l " + (s.banner ? "sm-pan" : "sm-zoom");
    // Fade in once the image is decoded; until then the cover underneath shows.
    var pre = new Image();
    pre.onload = function () { el.style.backgroundImage = "url('" + src + "')"; requestAnimationFrame(function () { el.classList.add("on"); }); };
    pre.src = src;
    if (still) still.remove();
    still = el;
    ov.appendChild(el);
    prefetchNeighbours(title);
    if (canClip) Clip.start(title, s.trailer);
  }

  // ── The clip ────────────────────────────────────────────────────────────
  var Clip = (function () {
    var cur = null, curId = null, timer = null, box = null, yt = null, iv = null;
    function stop() {
      clearTimeout(timer); clearInterval(iv); cur = null; curId = null;
      try { yt && yt.destroy(); } catch (e) {}
      yt = null;
      if (box) { box.remove(); box = null; }
    }
    function start(title, id) {
      // same spine, same trailer: already going (scenes.json may arrive mid-hover)
      if (cur === title && curId === (id || null)) return;
      stop();
      cur = title; curId = id || null;
      if (!id) return;
      timer = setTimeout(function () {
        if (cur !== title) return;
        box = document.createElement("div");
        box.className = "sm-v";
        var inner = document.createElement("div"), slot = document.createElement("div");
        inner.style.width = PW + "px"; inner.style.height = PH + "px";
        inner.appendChild(slot); box.appendChild(inner); document.body.appendChild(box);
        layout();
        loadYT(function (YT) {
          if (cur !== title) return;
          yt = new YT.Player(slot, {
            videoId: id, width: "100%", height: "100%",
            playerVars: { autoplay: 1, mute: 1, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, modestbranding: 1,
                          playsinline: 1, rel: 0, start: START, loop: 1, playlist: id, origin: location.origin },
            events: {
              onReady: function () { yt.mute(); yt.playVideo(); },
              // embedding blocked / removed: stay on the still from now on
              onError: function () { if (scenes[title]) scenes[title].trailer = null; stop(); }
            }
          });
          iv = setInterval(function () {
            if (!yt || !yt.getCurrentTime || cur !== title) return;
            if (yt.getPlayerState() === 1 && yt.getCurrentTime() > START + WARM) {
              clearInterval(iv);
              box.style.opacity = "1";
            }
          }, 100);
        });
      }, DWELL);
    }
    function layout() {
      if (!box || !ov) return;
      var r = ov.getBoundingClientRect();
      box.style.left = r.left + "px"; box.style.top = r.top + "px";
      box.style.width = r.width + "px"; box.style.height = r.height + "px";
      var h = r.height * ZOOM, w = h * 16 / 9, inner = box.firstChild;
      inner.style.transform = "scale(" + (w / PW) + ")";
      inner.style.left = (r.width - w) / 2 + "px"; inner.style.top = (r.height - h) / 2 + "px";
    }
    return { start: start, stop: stop, layout: layout };
  })();

  function loadYT(cb) {
    if (window.YT && window.YT.Player) return cb(window.YT);
    if (!window.__smYT) {
      window.__smYT = [];
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (prev) prev();
        window.__smYT.forEach(function (f) { f(window.YT); });
      };
      var tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
    window.__smYT.push(cb);
  }

  // ── Loop: rAF while a scene card is on screen, a slow poll otherwise ──
  function teardown() {
    Clip.stop();
    if (ov) { ov.remove(); ov = null; }
    still = null; shownKey = null;
  }

  function frame() {
    var img = coverImg();
    if (!img) { teardown(); active = false; return; }
    if (!css.isConnected) document.head.appendChild(css);
    loadScenes();
    if (!ov || !ov.isConnected) { ov = document.createElement("div"); ov.className = "sm-ov"; document.body.appendChild(ov); shownKey = null; }
    var r = img.getBoundingClientRect();
    ov.style.left = r.left + "px"; ov.style.top = r.top + "px";
    ov.style.width = r.width + "px"; ov.style.height = r.height + "px";
    if (img.alt !== shownKey && scenes) { shownKey = img.alt; showStill(img.alt, img); }
    Clip.layout();
    requestAnimationFrame(frame);
  }

  setInterval(function () {
    if (!active && coverImg()) { active = true; requestAnimationFrame(frame); }
  }, 300);
})();
