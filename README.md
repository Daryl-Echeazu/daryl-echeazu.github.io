# daryl-echeazu.github.io

Personal site, built in **Claude Design** and deployed to GitHub Pages.

## How to update the site

Claude Design is the source of truth. Never hand-edit `index.html` — it is
generated output, and the next export will overwrite whatever you changed.

1. Make your edits in Claude Design.
2. Download the export (a single self-contained `.html`).
3. Run the build against that download:

   ```sh
   python build.py "~/Downloads/index (1).html" --out .
   ```

4. Commit and push. GitHub Pages redeploys in under a minute.

## What `build.py` does

The raw Claude Design export is one 8.7 MB HTML file with every image, font and
script inlined as base64. It works, but the whole 8.7 MB has to arrive before
anything renders, and none of it can be cached or lazy-loaded.

The build applies two changes:

**1. Scales the site up on wide viewports.** Claude Design lays out against a
1280px preview, so above ~1500px the design shrinks into the frame. The build
adds a `zoom` on the root wrapper that scales everything uniformly — text,
photos, bookshelf — reproducing the 1280px look at larger sizes. It is capped at
1.35 so ultrawide monitors don't get comically large type, and floored at 1 so
narrow viewports are never shrunk.

The height is divided by the same factor, which is load-bearing: `zoom` scales
viewport units, so a bare `height: 100vh` under `zoom: 1.35` renders 1.35
viewports tall and the body's `overflow: hidden` clips the bottom ~26% of the
site with no way to scroll to it.

**2. Removes the nav blur on the home screen.** The nav applied
`backdrop-filter: blur(12px)` on every tab, which smeared a frosted band across
the top of the hero photo. It is now dropped on home and kept on the other
tabs, where content actually scrolls under the bar and the blur earns its keep.

**3. Fixes the nav on phones.** The nav is `grid-template-columns: 1fr auto 1fr`
(an empty third column, so the tabs sit optically centred). That splits the
leftover space evenly, so on a 390px phone the name column gets ~57px and
"DARYL ECHEAZU" breaks mid-name onto two lines. Below 760px the name now takes
its natural width and the tabs take the remainder; below 400px the tab metrics
tighten so the row still fits on one line. Desktop layout is untouched.

**4. Extracts the inlined assets to real files.** All 35 assets are decoded
(and gunzipped) into `assets/`, and the manifest is rewritten to reference URLs
instead of base64.

| | before | after |
|---|---|---|
| `index.html` | 8.67 MB | **124 KB** |
| bytes before first paint | 8.67 MB | **124 KB** |
| assets | inlined, re-downloaded every visit | cached, parallel, lazy-loaded |

Only the ~11 assets the first screen actually needs are fetched on load; the
rest arrive when you navigate to them.

Both changes are idempotent — re-running the build on an already-built file is
safe.

Useful flags:

```sh
python build.py export.html --no-recompress   # extract images byte-identical
python build.py export.html --quality 90      # higher JPEG quality
```

## Known issue (pre-existing, from the export)

The "Now playing" Spotify embed ships with an unresolved `{{ spotifySrc }}`
binding, so that iframe 404s. This is present in the raw Claude Design export
and is not introduced by the build — it needs fixing in Claude Design.
