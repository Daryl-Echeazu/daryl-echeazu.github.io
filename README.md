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
python3 build.py ~/Downloads/"index (1).html" --out . --hide inbox --strict

# development — everything, including work in progress
python3 build.py ~/Downloads/"index (1).html" --out . --strict
```

Or, to apply a change to `build.py` / `content_patches.py` without a new
export, rebuild the built file in place (it only applies what is missing):

```sh
python3 build.py index.html --out . --hide inbox --strict
```

`--strict` stops the build and writes nothing if any patch can't find its
target. That happens when an edit in Claude Design moves a string a patch
depends on. Fix the patch rather than dropping `--strict`.

Commit and push; Pages redeploys in under a minute.

## Files

| File | What it is |
|---|---|
| `build.py` | Turns the export into the site: extracts assets, converts images, adds preloads/SEO, applies display fixes |
| `content_patches.py` | Copy (current role, headline words), URL routing, cover preloading, accessibility and contrast fixes |
| `fetch_covers.py` | Downloads The Stacks' cover art into `covers/`; rerun after adding books or anime in Claude Design |
| `covers/` | Self-hosted cover art, so hovering a spine never waits on a third-party API |
| `*.js` (root) | Loose scripts injected into the page: loading cover, the Valley map, parallax, snap, nav frost, keyboard support, watching.txt |
| `tasks.json`, `watching.json` | Hand-edited data for DarylOS (public) |

## Notes

`main` is what the public sees. `development` is the working branch and is not
served. **`--hide inbox` is the only thing keeping the Inbox off the live
site.** If `main` is rebuilt without it, the Inbox goes public. Without a
`formEndpoint` set in Claude Design, the Inbox now opens the visitor's mail
app instead of pretending to send.

The build refuses to run if a Claude Design prop whose name contains
token/secret/apiKey has a non-empty default, because every prop ships in the
public `index.html`.

The demo page `inbox-demos.html` and its scripts live on `development` only.
