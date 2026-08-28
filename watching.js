/* DarylOS watching.txt, fed by /watching.json — the same hand-edit-and-push
 * idea as tasks.json. The window's text is baked into the precompiled
 * template (no bindings to ride), so this rewrites the DOM instead: the
 * title div is identified by its 26px serif style plus the "ALL-TIME:"
 * sibling two below it, which separates it from the one other 26px serif
 * heading on the site. A re-render can restore the baked text, so the patch
 * re-applies on a slow interval; every write is guarded by a comparison, so
 * steady state does nothing. If the fetch fails, the baked text stands.
 *
 * watching.json: { "current": "...", "note": "...", "alltime": "..." }
 */
(function () {
  var data = null;
  fetch("watching.json", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { data = d; apply(); })
    .catch(function () {});

  function apply() {
    if (!data) return;
    var divs = document.querySelectorAll("div[style*='font-size: 26px']");
    for (var i = 0; i < divs.length; i++) {
      var title = divs[i];
      var note = title.nextElementSibling;
      var all = note && note.nextElementSibling;
      if (!all || (all.textContent || "").indexOf("ALL-TIME:") !== 0) continue;
      if (data.current && title.textContent !== data.current)
        title.textContent = data.current;
      if (data.note && note.textContent !== data.note)
        note.textContent = data.note;
      if (data.alltime) {
        var want = "ALL-TIME: " + String(data.alltime).toUpperCase();
        if (all.textContent !== want) all.textContent = want;
      }
    }
  }
  setInterval(apply, 1500);
})();
