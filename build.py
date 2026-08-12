#!/usr/bin/env python3
"""
Turn a Claude Design single-file export into a fast, deployable GitHub Pages site.

Claude Design exports one self-contained index.html with every image, font and
script inlined as base64 inside a __bundler/manifest blob. That is convenient to
download and terrible to serve: ~8.7 MB must arrive before anything renders, and
none of it can be cached, lazy-loaded or fetched in parallel.

This script applies two changes to an export:

  1. WIDE-VIEWPORT ZOOM
     Claude Design lays the site out for a 1280px preview, so above ~1500px the
     whole design shrinks into the frame. We scale the root wrapper back up.

  2. ASSET EXTRACTION
     Every manifest asset is decoded (and gunzipped) to a real file under
     assets/, and the manifest is rewritten to hold URLs instead of base64.
     JPEGs are recompressed. index.html drops from ~8.7 MB to ~120 KB.

Both changes are idempotent, so re-running on an already-built file is safe.

USAGE
    python build.py "path/to/claude-design-export.html"
    python build.py "export.html" --out . --quality 85

After a new Claude Design export, run this on the download, then commit.
"""

import argparse
import base64
import gzip
import io
import json
import os
import re
import shutil
import sys

# ── 1. Wide-viewport zoom ────────────────────────────────────────────────────
# The root wrapper is laid out for Claude Design's 1280px preview. `zoom` scales
# everything (text, photos, spacing) uniformly, which is what we want.
#
# The height must be divided by the same factor: zoom scales viewport units, so
# a bare `height: 100vh` under zoom:1.35 renders 1.35 viewports tall, and the
# body's `overflow: hidden` then clips the bottom ~26% with no way to scroll to
# it. Verified in Chrome: with the division, the box measures exactly
# innerHeight at every width.
#
# clamp() floors the factor at 1 so viewports at or below 1280px are untouched
# (never shrunk), then scales linearly and caps at 1.35 so ultrawide displays
# don't get comically large text.
ZOOM_FROM = ("font-size: 16px; line-height: 1.6; "
             "height: 100vh; overflow: hidden; position: relative;")
ZOOM_TO = ("font-size: 16px; line-height: 1.6; "
           "--z: clamp(1, calc(100vw / 1280px), 1.35); zoom: var(--z); "
           "height: calc(100vh / var(--z)); overflow: hidden; position: relative;")

# ── 2. Asset externalization ─────────────────────────────────────────────────
# The runtime decodes each manifest entry to a Blob and substitutes the literal
# uuid throughout the template. We give entries a `url` instead and short-circuit
# the decode, so the same substitution emits relative paths the browser fetches,
# caches and lazy-loads normally. The decode path below stays intact as a
# fallback for any entry that still carries base64.
RUNTIME_FROM = "      const entry = manifest[uuid];\n      try {"
RUNTIME_TO = (
    "      const entry = manifest[uuid];\n"
    "      // [build.py] Externalized asset: use the real file URL and skip the\n"
    "      // base64 decode. Relative paths are safe because the runtime swaps\n"
    "      // documentElement in place, so the document URL is the site's own.\n"
    "      if (entry.url) { blobUrls[uuid] = entry.url; return; }\n"
    "      try {"
)

# ── 3. No nav blur on the home screen ────────────────────────────────────────
# The nav already dims its own background less on home (navBg alpha 0.18 vs
# 0.55) but still applied backdrop-filter: blur(12px) everywhere, which smeared
# a frosted band across the top of the hero photo. Drop it on home and keep it
# on the other tabs, where content genuinely scrolls under the bar and the blur
# is doing legibility work. Text stays readable on home via navBg plus the
# nav's existing text-shadow.
#
# This edits the value of an EXISTING binding rather than adding a new one:
# the template is precompiled (data-dc-tpl indices), so a brand new {{ token }}
# would not resolve.
BLUR_FROM = 'navBlur: \\"blur(12px)\\",'
BLUR_TO = 'navBlur: s.tab === \\"home\\" ? \\"none\\" : \\"blur(12px)\\",'

# ── 4. Mobile nav layout ─────────────────────────────────────────────────────
# The nav is grid-template-columns: 1fr auto 1fr — an empty third column so the
# tabs sit optically centred. That splits the leftover space evenly, so on a
# 390px phone the name column gets ~57px and "DARYL ECHEAZU" breaks mid-name
# onto two lines, making the bar tall and lopsided. On desktop there is enough
# slack that it never shows.
#
# Below 760px (the app's own `mob` breakpoint) give the name its natural width
# and let the tabs take the remainder. Done in CSS rather than a new binding,
# for the precompiled-template reason above; !important because the grid is set
# in an inline style attribute. The selector keys off the nav's z-index, which
# is the only stable thing about an inline-styled element.
NAV_CSS_ANCHOR = "\\n<\\u002Fstyle>\\n<\\u002Fhelmet>"
NAV_CSS = (
    "\\n  /* [build.py] Phone nav: keep the name on one line. */\\n"
    "  @media (max-width: 760px) {\\n"
    "    div[style*='z-index: 20'] { grid-template-columns: auto 1fr !important; }\\n"
    "    div[style*='z-index: 20'] > a { white-space: nowrap !important; }\\n"
    "  }\\n"
    "  /* [build.py] Narrow phones (<=400px): the name plus four tabs no longer\\n"
    "     fit on one line, so tighten the tab metrics rather than let the row\\n"
    "     wrap to two lines. */\\n"
    "  @media (max-width: 400px) {\\n"
    "    div[style*='z-index: 20'] { font-size: 9.6px !important; }\\n"
    "    div[style*='z-index: 20'] > span { gap: 9px !important; }\\n"
    "  }\\n"
)

EXT_BY_MIME = {
    "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif",
    "image/webp": ".webp", "image/svg+xml": ".svg", "image/avif": ".avif",
    "font/woff2": ".woff2", "font/woff": ".woff", "font/ttf": ".ttf",
    "font/otf": ".otf", "text/javascript": ".js", "application/javascript": ".js",
    "text/css": ".css", "application/json": ".json",
}


def section(html, kind):
    """Extract the JSON text of a <script type="__bundler/KIND"> block."""
    m = re.search(r'<script type="__bundler/%s">(.*?)</script>' % kind, html, re.S)
    if not m:
        sys.exit("ERROR: missing __bundler/%s block — is this a Claude Design export?" % kind)
    return m


def safe_name(name):
    """Keep filenames tame: no directory traversal, no surprises."""
    name = os.path.basename(name.strip().replace("\\", "/"))
    return re.sub(r"[^A-Za-z0-9._-]", "_", name) or "asset"


def recompress_jpeg(raw, quality):
    """Re-encode a JPEG smaller without resizing. Returns raw unchanged if it
    fails or if the result is not actually smaller."""
    try:
        from PIL import Image
    except ImportError:
        return raw, "Pillow not installed"
    try:
        im = Image.open(io.BytesIO(raw))
        im.load()
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        out = io.BytesIO()
        # progressive renders top-down on slow links; optimize runs a better
        # Huffman pass; EXIF/thumbnails are dropped by not passing them through.
        im.save(out, "JPEG", quality=quality, optimize=True, progressive=True)
        new = out.getvalue()
        if len(new) < len(raw):
            return new, None
        return raw, "already smaller"
    except Exception as exc:
        return raw, "recompress failed: %s" % exc


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("export", help="Claude Design .html export to build from")
    ap.add_argument("--out", default=".", help="output directory (default: cwd)")
    ap.add_argument("--assets", default="assets", help="asset subdirectory name")
    ap.add_argument("--quality", type=int, default=85, help="JPEG quality (default: 85)")
    ap.add_argument("--no-recompress", action="store_true", help="extract byte-identical images")
    args = ap.parse_args()

    with open(args.export, encoding="utf-8") as fh:
        html = fh.read()
    original_size = len(html.encode("utf-8"))

    # ── Zoom patch ───────────────────────────────────────────────────────────
    if ZOOM_TO in html:
        print("zoom patch  : already present")
    elif ZOOM_FROM in html:
        if html.count(ZOOM_FROM) != 1:
            sys.exit("ERROR: expected 1 root wrapper, found %d" % html.count(ZOOM_FROM))
        html = html.replace(ZOOM_FROM, ZOOM_TO)
        print("zoom patch  : applied")
    else:
        print("zoom patch  : SKIPPED — wrapper style not found (Claude Design markup changed?)")

    # ── Nav blur ─────────────────────────────────────────────────────────────
    if BLUR_TO in html:
        print("home nav blur: already removed")
    elif BLUR_FROM in html:
        if html.count(BLUR_FROM) != 1:
            sys.exit("ERROR: expected 1 navBlur binding, found %d" % html.count(BLUR_FROM))
        html = html.replace(BLUR_FROM, BLUR_TO)
        print("home nav blur: removed")
    else:
        print("home nav blur: SKIPPED — navBlur binding not found")

    # ── Phone nav layout ─────────────────────────────────────────────────────
    if NAV_CSS in html:
        print("phone nav   : already patched")
    elif NAV_CSS_ANCHOR in html:
        if html.count(NAV_CSS_ANCHOR) != 1:
            sys.exit("ERROR: expected 1 stylesheet anchor, found %d" % html.count(NAV_CSS_ANCHOR))
        html = html.replace(NAV_CSS_ANCHOR, NAV_CSS + NAV_CSS_ANCHOR)
        print("phone nav   : patched")
    else:
        print("phone nav   : SKIPPED — stylesheet anchor not found")

    # ── Parse bundle sections ────────────────────────────────────────────────
    man_m = section(html, "manifest")
    manifest = json.loads(man_m.group(1))
    ext_m = section(html, "ext_resources")
    id2uuid = {e["id"]: e["uuid"] for e in json.loads(ext_m.group(1))}
    tmpl_m = section(html, "template")
    template = tmpl_m.group(1)

    pages = json.loads(section(html, "page_order").group(1))
    if pages:
        sys.exit("ERROR: nested page bundles present (%d); extraction not supported." % len(pages))

    # The app already falls back to "assets/<name>" when window.__resources is
    # missing, so reusing those names keeps the fallbacks valid.
    fallback = dict(re.findall(
        r'\(window\.__resources\|\|\{\}\)\.(res\d+)\|\|\\"assets/([^"\\]+)', template))
    uuid2name = {id2uuid[rid]: nm for rid, nm in fallback.items() if rid in id2uuid}

    outdir = os.path.abspath(args.out)
    assetdir = os.path.join(outdir, args.assets)
    if os.path.isdir(assetdir):
        shutil.rmtree(assetdir)          # stale assets from a previous export
    os.makedirs(assetdir, exist_ok=True)

    slim, used, saved_bytes, notes = {}, set(), 0, []
    total_raw = 0

    for uuid, entry in sorted(manifest.items()):
        if "data" not in entry:
            slim[uuid] = entry           # already externalized
            continue
        raw = base64.b64decode(entry["data"])
        if entry.get("compressed"):
            raw = gzip.decompress(raw)
        before = len(raw)

        if entry["mime"] == "image/jpeg" and not args.no_recompress:
            raw, why = recompress_jpeg(raw, args.quality)
            if why:
                notes.append("%s: %s" % (uuid[:8], why))
        saved_bytes += before - len(raw)
        total_raw += len(raw)

        name = uuid2name.get(uuid) or (uuid + EXT_BY_MIME.get(entry["mime"], ".bin"))
        name = safe_name(name)
        stem, ext = os.path.splitext(name)
        n = 2
        while name in used:              # never silently overwrite
            name = "%s-%d%s" % (stem, n, ext)
            n += 1
        used.add(name)

        with open(os.path.join(assetdir, name), "wb") as fh:
            fh.write(raw)
        slim[uuid] = {"mime": entry["mime"], "url": "%s/%s" % (args.assets, name)}

    # ── Rewrite manifest + runtime ───────────────────────────────────────────
    slim_json = json.dumps(slim, indent=None, sort_keys=True)
    if "</script>" in slim_json:
        sys.exit("ERROR: manifest JSON would break out of its script tag")
    html = html[:man_m.start(1)] + "\n" + slim_json + "\n" + html[man_m.end(1):]

    if RUNTIME_TO in html:
        print("runtime     : already patched")
    elif RUNTIME_FROM in html:
        if html.count(RUNTIME_FROM) != 1:
            sys.exit("ERROR: expected 1 decode site, found %d" % html.count(RUNTIME_FROM))
        html = html.replace(RUNTIME_FROM, RUNTIME_TO)
        print("runtime     : patched")
    else:
        sys.exit("ERROR: could not find the asset decode loop to patch")

    index = os.path.join(outdir, "index.html")
    with open(index, "w", encoding="utf-8", newline="") as fh:
        fh.write(html)

    new_size = len(html.encode("utf-8"))
    print("\nassets      : %d files, %.2f MB in %s/" % (len(slim), total_raw / 1e6, args.assets))
    if saved_bytes:
        print("recompressed: saved %.2f MB" % (saved_bytes / 1e6))
    for n in notes:
        print("              note: %s" % n)
    print("index.html  : %.2f MB -> %.1f KB  (%.1fx smaller)"
          % (original_size / 1e6, new_size / 1e3, original_size / max(new_size, 1)))
    print("initial load: %.2f MB -> %.1f KB before first paint"
          % (original_size / 1e6, new_size / 1e3))


if __name__ == "__main__":
    main()
