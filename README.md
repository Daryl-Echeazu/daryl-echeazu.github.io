# daryl-echeazu.github.io

Daryl's personal website.

Built in **Claude Design** and deployed to GitHub Pages. `index.html` is
generated output: never edit it by hand, because the next build overwrites it.
Change the design in Claude Design, and change copy, fixes and behaviour in
`build.py` / `content_patches.py`.

## Requirements

Python 3 with Pillow (`python3 -m pip install --user pillow`) for the image
step: WebP conversion and the responsive hero sizes.

## Rebuilding

From a new Claude Design export:

```sh
# main — the public site
python3 build.py ~/Downloads/"index (1).html" --out . --hide live,inbox --strict

# development — everything, including work in progress
python3 build.py ~/Downloads/"index (1).html" --out . --strict
```

Or, to apply a change to `build.py` / `content_patches.py` without a new
export, rebuild the built file in place (it only applies what is missing):

```sh
python3 build.py index.html --out . --hide live,inbox --strict
```

`--strict` stops the build and writes nothing if any patch can't find its
target. That happens when an edit in Claude Design moves a string a patch
depends on. Fix the patch rather than dropping `--strict`.

Commit and push; Pages redeploys in under a minute.

## Adding an anime to the catalogue

The catalogue at `/stacks/` is separate from the shelf, so adding a title is
one entry, not a Claude Design round trip. Append to `stacks/anime.json`:

```json
{ "title": "Mob Psycho 100", "mal": 32182, "take": "One line, yours." }
```

`mal` is the number in the MyAnimeList URL (`myanimelist.net/anime/32182/...`).
Optional: `status` (`"watching"` or `"caught up"`), `alltimer`, `manga`,
`tag`, `quote` and `ref`. Order in the file is the page's default order. Then:

```sh
python3 fetch_catalogue.py
```

It asks AniList for the rest, saves the art into `covers/`, and rewrites the
cards in `stacks/index.html`. Commit all three.

## Files

| File | What it is |
|---|---|
| `build.py` | Turns the export into the site: extracts assets, converts images, adds preloads/SEO, applies display fixes |
| `content_patches.py` | Copy (current role, headline words), URL routing, cover preloading, accessibility and contrast fixes |
| `fetch_covers.py` | Downloads The Stacks' cover art into `covers/`; rerun after adding books or anime in Claude Design |
| `stacks/anime.json` | **The full anime catalogue, hand-edited.** The shelf on /about/ is the canon; this is everything |
| `fetch_catalogue.py` | Builds `/stacks/` from `stacks/anime.json`: pulls episodes, year, studio, genres, score, cover, banner and trailer from AniList, writes the cards into `stacks/index.html` |
| `stacks/index.html` | The catalogue page. Hand-written apart from the generated block between the `[catalogue]` markers |
| `covers/` | Self-hosted cover art, so hovering a spine never waits on a third-party API |
| `*.js` (root) | Loose scripts injected into the page: loading cover, the Valley map, parallax, snap, nav frost, keyboard support, watching.txt |
| `tasks.json`, `watching.json` | Hand-edited data for DarylOS (public) |

## Notes

`main` is what the public sees. `development` is the working branch and is not
served. **`--hide live,inbox` is the only thing keeping DarylOS and the Inbox
off the live site** (hidden Oct 2026). If `main` is rebuilt without it, they go
public. Without a
`formEndpoint` set in Claude Design, the Inbox now opens the visitor's mail
app instead of pretending to send.

The build refuses to run if a Claude Design prop whose name contains
token/secret/apiKey has a non-empty default, because every prop ships in the
public `index.html`.

The demo page `inbox-demos.html` and its scripts live on `development` only.
