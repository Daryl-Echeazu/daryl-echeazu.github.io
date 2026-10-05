/* The Stacks: still -> clip.
 *
 * Hover a spine and the cover (already on screen, preloaded) gives way to a
 * slow pan across the show's official banner art; keep hovering and, once the
 * official trailer is genuinely playing behind it, the still crossfades into
 * the trailer. Books (no banner or trailer) get a slow zoom on their cover.
 *
 *   - Nothing loads until you hover: the banner on hover (neighbours' banners
 *     are fetched next), the trailer only after DWELL ms on the same spine.
 *   - One trailer at a time, rendered large so YouTube serves HD (desktop),
 *     muted, no controls. It stays hidden until it has played WARM seconds on
 *     its own clock — past YouTube's start-up controls and any ad — and is
 *     never paused, because a resume makes YouTube redraw its play/pause/skip
 *     overlay. Moving to another spine destroys it.
 *   - Phones: tapping a spine selects it; if it stays selected for DWELL ms the
 *     trailer loads the same way, rendered smaller so YouTube serves ~480p
 *     (about a third of the data).
 *
 * The layers live INSIDE the cover's own box (the app's position:relative
 * scene row), placed over the <img> by its offsets. So they scroll, stick and
 * get clipped exactly like the cover — an earlier position:fixed overlay
 * chased the cover frame by frame, lagged on phone scrolling and spilled over
 * the shelf and the nav. React leaves the extra child alone, and the scene
 * card is re-keyed on every new spine, which removes it along with the card.
 * Data: covers/scenes.json, written by fetch_covers.py. Loaded in the outer
 * head; everything hangs off document/window, which survive the bundler swap.
 */
(function () {
  var START = 8;          // seconds into the trailer to start from
  var WARM = 4.2;         // seconds of real playback before the clip may show
  var DWELL = 500;        // ms on one spine before a trailer loads
  var ZOOM = 1.4;         // crops YouTube's title bar / logo out of the frame

  // YouTube picks the stream from the player's size: HD for mouse-driven
  // screens, ~480p on touch devices (sharp at a phone-sized card).
  var touch = !!(window.matchMedia && matchMedia("(hover: none), (pointer: coarse)").matches);
  var PW = touch ? 854 : 1280, PH = touch ? 480 : 720;

  var scenes = null, ov = null, coverEl = null, shownKey = null;
  var css = document.createElement("style");
  css.textContent =
    "@keyframes smPan{from{background-position:0% 50%;transform:scale(1.04)}to{background-position:100% 50%;transform:scale(1.12)}}" +
    "@keyframes smZoom{from{transform:scale(1)}to{transform:scale(1.12) translate(-2%,-2%)}}" +
    // !important: the app's phone CSS styles the row's last child (padding),
    // and this layer is appended last.
    ".sm-ov{position:absolute!important;overflow:hidden;pointer-events:none;z-index:1;padding:0!important;margin:0!important;box-sizing:border-box!important}" +
    ".sm-l{position:absolute;inset:0;opacity:0;transition:opacity .6s ease}" +
    ".sm-l.on{opacity:1}" +
    ".sm-pan{background-size:auto 100%;background-repeat:no-repeat;animation:smPan 14s ease-in-out infinite alternate}" +
    ".sm-zoom{background-size:cover;background-position:center;animation:smZoom 12s ease-in-out infinite alternate}" +
    ".sm-v{position:absolute;inset:0;overflow:hidden;opacity:0;transition:opacity 1s ease}" +
    ".sm-v>div{position:absolute;transform-origin:0 0}";

  var ro = window.ResizeObserver ? new ResizeObserver(function () { place(); }) : null;

  function loadScenes() {
    if (scenes) return;
    scenes = {};
    fetch("covers/scenes.json").then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) { scenes = d || {}; shownKey = null; }).catch(function () {});
  }

  function coverImg() {
    var imgs = document.querySelectorAll('img[draggable="false"][alt]');
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].offsetWidth > 100 && imgs[i].offsetHeight > 150) return imgs[i];
    }
    return null;
  }

  // Cover the <img> exactly, in its parent's own (zoomed) coordinates.
  function place() {
    if (!ov || !coverEl) return;
    ov.style.left = coverEl.offsetLeft + "px"; ov.style.top = coverEl.offsetTop + "px";
    ov.style.width = coverEl.offsetWidth + "px"; ov.style.height = coverEl.offsetHeight + "px";
    Clip.layout();
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
    var old = ov.querySelector(".sm-l");
    if (old) old.remove();
    ov.insertBefore(el, ov.firstChild);
    prefetchNeighbours(title);
    Clip.start(title, s.trailer);
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
        if (cur !== title || !ov) return;
        box = document.createElement("div");
        box.className = "sm-v";
        var inner = document.createElement("div"), slot = document.createElement("div");
        inner.style.width = PW + "px"; inner.style.height = PH + "px";
        inner.appendChild(slot); box.appendChild(inner); ov.appendChild(box);
        layout();
        loadYT(function (YT) {
          if (cur !== title || !box) return;
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
            if (!yt || !yt.getCurrentTime || cur !== title || !box) return;
            if (yt.getPlayerState() === 1 && yt.getCurrentTime() > START + WARM) {
              clearInterval(iv);
              box.style.opacity = "1";
            }
          }, 100);
        });
      }, DWELL);
    }
    // Fill the cover box with the 16:9 player (zoomed past YouTube's chrome).
    function layout() {
      if (!box || !ov) return;
      var cw = ov.offsetWidth, ch = ov.offsetHeight;
      var h = ch * ZOOM, w = h * 16 / 9, inner = box.firstChild;
      inner.style.transform = "scale(" + (w / PW) + ")";
      inner.style.left = (cw - w) / 2 + "px"; inner.style.top = (ch - h) / 2 + "px";
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

  function detach() {
    Clip.stop();
    if (ro && coverEl) ro.unobserve(coverEl);
    if (ov) ov.remove();
    ov = null; coverEl = null; shownKey = null;
  }

  // Watch for the cover changing (new spine, tab change). No per-frame work:
  // the layers ride along with the cover natively.
  function check() {
    var img = coverImg();
    if (!img) { if (ov) detach(); return; }
    if (!css.isConnected) document.head.appendChild(css);
    loadScenes();
    if (img !== coverEl || !ov || !ov.isConnected || ov.parentNode !== img.parentNode) {
      detach();
      coverEl = img;
      ov = document.createElement("div");
      ov.className = "sm-ov";
      img.parentNode.appendChild(ov);
      if (ro) ro.observe(img);
      img.addEventListener("load", place);
    }
    place();
    if (img.alt !== shownKey) { shownKey = img.alt; showStill(img.alt, img); }
  }

  setInterval(check, 120);

  // ── Spine tags ───────────────────────────────────────────────────────────
  // The little volume tags ("SHIPPUDEN", "LINK START") are clipped to 80% of
  // the spine, which is narrower on phones. Let each use the full spine and,
  // only if it still doesn't fit, step its text down until it does. Runs on
  // tags it hasn't seen (spines re-mount on a genre switch).
  var TAG = 'div[role="button"][title] span[style*="white-space: nowrap"][style*="background"]';
  function fitTags() {
    var tags = document.querySelectorAll(TAG + ":not([data-fit])");
    for (var i = 0; i < tags.length; i++) {
      var t = tags[i];
      if (!t.offsetWidth) continue;              // not laid out yet
      t.setAttribute("data-fit", "");
      if (t.scrollWidth <= t.clientWidth + 0.5) continue;
      t.style.setProperty("max-width", "100%", "important");
      var fs = parseFloat(getComputedStyle(t).fontSize);
      while (t.scrollWidth > t.clientWidth + 0.5 && fs > 4.2) {
        fs -= 0.2;
        t.style.setProperty("font-size", fs.toFixed(1) + "px", "important");
      }
      if (t.scrollWidth > t.clientWidth + 0.5) t.style.setProperty("padding-left", "1px", "important"), t.style.setProperty("padding-right", "1px", "important");
    }
  }
  setInterval(fitTags, 400);
})();
