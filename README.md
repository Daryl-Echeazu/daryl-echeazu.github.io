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

The build applies these changes:

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

The height is also set in `dvh`, which matters on iOS. Safari's `100vh` is the
*large* viewport — it includes the strip behind the bottom toolbar — while the
page is only painted in the visible area. With `overflow: hidden` and a `100vh`
wrapper, the last ~80px of every scrolling page sat behind the toolbar and could
not be reached: the Recently timeline stopped at "Oracle P&L" with the Yosemite
row unreachable, and the hero headline was sheared. `dvh` tracks the visible
viewport; the plain `vh` line stays first as a fallback.

**2. Removes the nav blur on the home screen.** The nav applied
`backdrop-filter: blur(12px)` on every tab, which smeared a frosted band across
the top of the hero photo. It is now dropped on home and kept on the other
tabs, where content actually scrolls under the bar and the blur earns its keep.

**3. Scales the whole phone view up.** Below 760px the wrapper's `--z` is
overridden to `1.12`, so `zoom` and the `dvh` height both scale uniformly —
the same mechanism as the desktop zoom, driven by one property. The cost is
layout width: at 393px an effective 351px remains, so the nav metrics are tuned
down to compensate (they still render larger than before, since the zoom scales
them back up). Anything positioned against the nav must use the **zoomed**
coordinate space: the nav measures 56-57 screen px, which is 50 CSS px here.

**4. Fixes the nav on phones.** The nav is `grid-template-columns: 1fr auto 1fr`
(an empty third column, so the tabs sit optically centred). That splits the
leftover space evenly, so on a 390px phone the name column gets ~57px and
"DARYL ECHEAZU" breaks mid-name onto two lines. Below 760px the name now takes
its natural width and the tabs take the remainder; below 400px the tab metrics
tighten so the row still fits on one line. Desktop layout is untouched.

**5. Fits book spine titles.** Spine titles are vertical text in a fixed-height
box with `overflow: hidden`. Book height scales by 0.82 on phones while the font
only drops 13px to 12px, so titles overflowed and were hard-clipped mid-word —
19 of 24 spines at 390px (worst short by 45px) and 6 of 24 even at 1600px. Each
title is now sized to the space it actually has, phone spines are a little
taller, and anything still too long gets an ellipsis instead of a hard cut.
Worst-case overflow is down from 45px to 12px.

**6. Makes the shelf usable on a phone.** The scene panel is a flex item that
wrapped *below* the three-row bookshelf, landing ~1030px down — off screen, so
you could never see the stack and the scene you just tapped at the same time.
Spines carry a click handler, so the panel is now pinned above the shelf and
sticks while you scroll and tap. Its inner row is also sized for the desktop
column (a 200px tile left the quote just 96px of a 350px panel), so the tile
shrinks and the credit line wraps on phones.

The card also stays pinned further down the section. A sticky item is released
by the bottom of its *containing block* — here the shelf row, which ends before
the caption below it, so the card let go just as that text arrived. The range is
the container's **content** box (padding on it does nothing for a sticky flex
item), so the build grows the sibling books column and cancels it with an equal
negative margin on the row, leaving everything below unmoved. 120px is the
ceiling: measured, the card releases at scrollTop 2410 against a maxScroll of
2443. At 160px+ it never releases and would still cover the Recently heading at
the bottom of the page — going further would need trailing scroll space, which
re-opens the bottom gap closed above.

**7. Lets pages reach the bottom.** Each scrolling section carried a large
bottom padding (70/60/80px), multiplied again by the wide-viewport zoom, so
scrolled fully down the last line of content stopped 110-119px above the bottom
edge on desktop (78-82px on phones) — the page visibly stopped short. Trimmed to
land 45-54px / 40-44px, keeping a normal margin without the dead strip.

**8. Un-clips descenders on gradient text.** The rotating hero word and the
scene quote are painted with a gradient via `-webkit-background-clip: text`,
which paints only inside the *padding* box. Both set a bottom padding shallower
than the italic serif's descenders, so the tails of g/j/p/q/y got no paint and
rendered sheared flat. Verified by forcing "gjpqy" into the hero word: clipped
at `0.18em`, fully painted at `0.32em`. Each fix pairs the extra padding with an
equal negative margin, so layout is unchanged.

**9. Speeds up the rotating headline word, and holds the headline still.**
The cycle goes from 7s to 4.5s per word. The crossfade stays at its original
0.7s — the word changes more often, each change is as gentle as it was. (If you
retime the fade, note it is coupled to a swap timeout that must outlast it, or
the word changes while still visible and pops mid-fade.)

On phones the headline is also sized to stay two lines. The word sits inline
after "occasionally", so a long one wrapped to a third line; since the block is
bottom-anchored, everything above the last line jumped a full line each time the
word changed. The size that keeps even the longest entry inline was
binary-searched per width and is a steady 7.49vw from 320 to 430px, so the build
sets `clamp(22px, 7.3vw, 44px)`. Verified across seven words at 320/393/430px:
one distinct geometry each, two lines, no overflow.

The cost is a smaller headline on phones — about 19% down at 393px (35.4 to 28.7
CSS px). It is dictated by the longest entry in `rotWords`, so shortening those
in Claude Design would buy the size back. Desktop already measures two lines for
every word, so it is left alone.

**10. Adds link previews.** Pasting the URL into Discord, iMessage, Slack or
Twitter now unfurls a card. Those crawlers do **not** run JavaScript, and the
bundler replaces `documentElement` at runtime, so the meta tags have to live in
the raw outer `<head>` — which is what the build injects. `social-preview.jpg`
(1200x630, rendered from the hero) and `favicon.png` live at the repo root, not
under `assets/`, because the build wipes and rebuilds `assets/`.

If you change the card image, bump the cache-buster — Discord and iMessage cache
preview images hard:

```sh
python build.py export.html --card-version 2
```

**11. Adds a `lang` attribute.** Neither `<html>` carried one, so screen readers
had no pronunciation dictionary to pick — added to both (the outer tag is what
crawlers parse; the template's is what actually becomes `documentElement`).

The build deliberately does **not** honour `prefers-reduced-motion`: the
animation is the point of the site, and it should play for everyone. Note this
means visitors who have asked their OS for less motion still get the full
headline cross-fade, the fade-ups and the window pops.

**12. Extracts the inlined assets to real files.** All 35 assets are decoded
(and gunzipped) into `assets/`, and the manifest is rewritten to reference URLs
instead of base64. Images keep their original JPEG/PNG encoding.

| | before | after |
|---|---|---|
| `index.html` | 8.67 MB | **134 KB** |
| bytes before first paint | 8.67 MB | **134 KB** |
| assets | inlined, re-downloaded every visit | cached, parallel, lazy-loaded |

Only the ~11 assets the first screen actually needs are fetched on load; the
rest arrive when you navigate to them.

All changes are idempotent — re-running the build on an already-built file is
safe.

Useful flags:

```sh
python build.py export.html --no-recompress   # extract images byte-identical
python build.py export.html --quality 90      # higher JPEG quality
```

## The Valley

`valley.js` adds an interactive west-to-east section of Yosemite. The About page
already carried eight captioned photographs of named places in the valley, shown
in a next/prev carousel; this pins each one where it was taken, so the set reads
as one place rather than nine unrelated frames. Open it by clicking the photo
caption on About, or call `window.__openValley()`.

It is deliberately built to survive the bundler:

- Loaded from the **outer** `<head>`, which is replaced wholesale at startup —
  fine, because the file has already executed and its listeners live on
  `document`.
- The overlay mounts on `document.body`, **outside** the app's root, so the
  app's re-render on every tab change cannot remove it.
- The trigger is a **delegated** listener, not an injected button, for the same
  reason.
- Photographs resolve through `window.__resources`, so no filenames are
  hardcoded and a re-export that renames assets does not break it.

On phones the map holds a legible fixed width and is swiped west to east —
scaled to fit, the whole valley became a decorative strip with unreadable labels
and 18px tap targets. Only the map scrolls sideways; the page does not.

To add or move a place, edit `PLACES` — but the pins sit *on* the silhouette in
`terrain()`, and the conifers are planted on `floorY()`, so those move together.
Label side is per-place (`lab: "above" | "below"`): Vernal Fall is labelled above
because below, the text runs straight through the falls drawn at the same x.

## Known issues (pre-existing, fix in Claude Design)

**The contact form discards every message.** `formEndpoint` is an unset prop, so
`if (endpoint)` is false and no request is ever made — but `setState({ sent:
true })` runs unconditionally, so the visitor still sees a success
confirmation. Even once an endpoint is set, `.catch(() => {})` swallows failures
and reports success anyway. Set `formEndpoint` (Formspree, Basin, etc.) and show
the confirmation only after a resolved response.

**No `lang` on `<html>`, and no `prefers-reduced-motion` support.** Both are
accessibility gaps; the site animates a good deal (rotating headline word,
fade-ups, blur transitions).

**Book spines are click-only.** They carry a click handler but are not
focusable, so the shelf cannot be operated by keyboard.

Not an issue: the Spotify embed resolves correctly to
`open.spotify.com/embed/track/...`. A single 404 for the literal
`{{ spotifySrc }}` appears in server logs because the browser fetches the
pre-render markup once before the app resolves its bindings — console noise
only.
