#!/usr/bin/env python3
"""
Turn a Claude Design single-file export into a fast, deployable GitHub Pages site.

Claude Design exports one self-contained index.html with every image, font and
script inlined as base64 inside a __bundler/manifest blob. That is convenient to
download and terrible to serve: ~8.7 MB must arrive before anything renders, and
none of it can be cached, lazy-loaded or fetched in parallel.

This script applies a set of display fixes to an export, then extracts its
assets. See README.md for the full list and the measurements behind each one.

  1. WIDE-VIEWPORT ZOOM
     Claude Design lays the site out for a 1280px preview, so above ~1500px the
     whole design shrinks into the frame. We scale the root wrapper back up.

  2. ASSET EXTRACTION
     Every manifest asset is decoded (and gunzipped) to a real file under
     assets/, and the manifest is rewritten to hold URLs instead of base64.
     JPEGs are recompressed. index.html drops from ~8.7 MB to ~120 KB.

All changes are idempotent, so re-running on an already-built file is safe.

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
           "height: calc(100vh / var(--z)); height: calc(100dvh / var(--z)); "
           "overflow: hidden; position: relative;")
# The dvh line is not a nicety. On iOS Safari 100vh is the LARGE viewport — it
# includes the strip behind the bottom toolbar — while the page is only ever
# painted in the smaller visible area. With body { overflow: hidden } and a
# 100vh wrapper, the last ~80px of every scrolling page sits behind the toolbar
# and cannot be reached: the Recently timeline stopped at "Oracle P&L" with the
# Yosemite row unreachable, and the hero headline was sheared by the toolbar.
# dvh tracks the *visible* viewport. The plain vh line stays first as a fallback
# for browsers without dvh; the later declaration wins where it is supported.

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

# Without the blur, the flat translucent navBg left a hard horizontal edge
# across the hero photo where the bar ended. Fade it out instead: full strength
# behind the nav text, transparent by the bottom edge, so there is nothing to
# see the seam of. Only home needs this — the other tabs sit over a flat dark
# page where the band is invisible anyway.
NAVBG_FROM = 'navBg: s.tab === \\"home\\" ? \\"oklch(0.13 0.005 260 / 0.18)\\"'
NAVBG_TO = ('navBg: s.tab === \\"home\\" ? \\"linear-gradient(to bottom, '
            'oklch(0.13 0.005 260 / 0.5) 0%, oklch(0.13 0.005 260 / 0.38) 45%, '
            'oklch(0.13 0.005 260 / 0) 100%)\\"')

# ── 5. Book spines: fit the title to the spine ───────────────────────────────
# Spine titles are vertical text in a fixed-height box with overflow: hidden, so
# anything too long is hard-clipped mid-word. Book height scales by 0.82 on
# mobile while the font only drops 13px -> 12px, so the text shrinks far less
# than its container: 19 of 24 spines clipped at 390px (worst, "Classroom of
# the Elite", by 45px) and 6 of 24 even at 1600px.
#
# Give mobile spines more height (0.82 -> 0.95) and size each title to the space
# it actually has, with a readable floor. Both are values of existing bindings
# (b.h / b.fs), computed where b.title is in scope.
SPINE_FROM = ('title: b.title, mark: b.mark, fs: mob ? \\"12px\\" : \\"13px\\",\\n'
              '        h: Math.round(b.h * (mob ? 0.82 : 1.08)) + \\"px\\",')
SPINE_TO = (
    'title: b.title, mark: b.mark,\\n'
    '        fs: (function (bh, n) {\\n'
    '          // ~0.66em per character vertically, plus ~32px of cap, padding\\n'
    '          // and the volume mark at the foot of the spine. Calibrated by\\n'
    '          // measuring scrollHeight vs clientHeight on every spine.\\n'
    '          var fit = (bh - 32) / (n * 0.66);\\n'
    '          var max = mob ? 12 : 13;\\n'
    '          return Math.max(8.5, Math.min(max, Math.floor(fit * 10) / 10)) + \\"px\\";\\n'
    '        })(Math.round(b.h * (mob ? 0.95 : 1.08)), b.title.length),\\n'
    '        h: Math.round(b.h * (mob ? 0.95 : 1.08)) + \\"px\\",')

# ── 9. Rotating headline word: quicker cycle ─────────────────────────────────
# The word changed every 7s with a 0.7s crossfade. Down to 4.5s with a 0.5s
# crossfade — noticeably livelier, still long enough to read a two-word phrase
# like "grinding LeetCode".
#
# The three values are coupled and must move together: the swap is scheduled
# with a timeout that has to outlast the CSS transition, otherwise the word
# changes while still partly visible and you see it pop mid-fade. Keeping the
# delay just above the transition (530ms vs 500ms) preserves that, matching the
# original's 730/700 relationship.
ROTATION = [
    # Cycle period only. The crossfade stays at the original 0.7s (and its
    # 730ms swap delay) — shortening it to 0.5s read as harried. The word
    # changes more often; each change is as gentle as it was.
    ("Date.now() / 7000", "Date.now() / 4500"),
]

# ── 8. Link previews (Open Graph / Twitter cards) ────────────────────────────
# Discord, iMessage, Slack, WhatsApp and Twitter fetch the URL and read meta
# tags WITHOUT running JavaScript. The bundler replaces documentElement at
# runtime, so anything in the template's <head> is invisible to them — these
# have to go in the raw outer <head> that ships in the file.
#
# og:image must be an absolute URL. social-preview.jpg lives at the repo root
# rather than under assets/, because the build wipes and rebuilds assets/.
SITE_URL = "https://daryl-echeazu.github.io"
SOCIAL_IMAGE = "social-preview.jpg"
SOCIAL_MARK = "<!-- [build.py] link preview -->"
SOCIAL_TITLE = "Daryl Echeazu"
SOCIAL_DESC = ("Computer Science and Math student at the University of Chicago. "
               "Projects, experience, and what I'm reading.")
SOCIAL_ALT = "Daryl Echeazu's site: El Capitan, Yosemite, with the site title over it."


def social_block(version):
    """Meta tags for link unfurling. `version` cache-busts the image: Discord
    and iMessage cache preview images hard, so a changed card needs a new URL."""
    img = "%s/%s?v=%d" % (SITE_URL, SOCIAL_IMAGE, version)
    return "\n".join([
        "  " + SOCIAL_MARK,
        '  <meta name="description" content="%s">' % SOCIAL_DESC,
        '  <link rel="canonical" href="%s/">' % SITE_URL,
        '  <meta property="og:type" content="website">',
        '  <meta property="og:site_name" content="%s">' % SOCIAL_TITLE,
        '  <meta property="og:title" content="%s">' % SOCIAL_TITLE,
        '  <meta property="og:description" content="%s">' % SOCIAL_DESC,
        '  <meta property="og:url" content="%s/">' % SITE_URL,
        '  <meta property="og:image" content="%s">' % img,
        '  <meta property="og:image:type" content="image/jpeg">',
        '  <meta property="og:image:width" content="1200">',
        '  <meta property="og:image:height" content="630">',
        '  <meta property="og:image:alt" content="%s">' % SOCIAL_ALT,
        '  <meta name="twitter:card" content="summary_large_image">',
        '  <meta name="twitter:title" content="%s">' % SOCIAL_TITLE,
        '  <meta name="twitter:description" content="%s">' % SOCIAL_DESC,
        '  <meta name="twitter:image" content="%s">' % img,
        '  <meta name="theme-color" content="#17181c">',
        '  <link rel="icon" type="image/png" href="favicon.png">',
        '  <link rel="apple-touch-icon" href="favicon.png">',
    ])


# ── 7. Descenders on gradient text ───────────────────────────────────────────
# The rotating hero word and the scene quote are painted with a gradient via
# -webkit-background-clip: text, which paints only inside the PADDING box. Both
# set a bottom padding shallower than the italic serif's descenders, so the
# tails of g/j/p/q/y got no paint and rendered sheared flat. Verified by forcing
# "gjpqy" into the hero word: clipped at 0.18em, fully painted at 0.32em.
#
# Each fix keeps layout identical by pairing the extra padding with an equal
# negative margin (the hero word already does this; the quote gets one added,
# sized to preserve its current 0.15em of real spacing).
DESCENDERS = [
    ('padding: 0.05em 0.12em 0.18em 0.05em; margin: -0.05em -0.12em -0.18em -0.05em;',
     'padding: 0.05em 0.12em 0.34em 0.05em; margin: -0.05em -0.12em -0.34em -0.05em;'),
    ('padding: 0.05em 0.1em 0.15em 0.1em;',
     'padding: 0.05em 0.1em 0.34em 0.1em; margin-bottom: -0.19em;'),
]

# ── 6. Trailing space at the bottom of scrolling pages ───────────────────────
# Each scrolling section carries a large bottom padding (70/60/80px). Under the
# wide-viewport zoom that is multiplied too, so scrolled fully to the bottom the
# last line of real content stopped 110-119px above the bottom edge on desktop
# (78-82px on phones) — the page visibly stops short of where it ends. Trim the
# bottom value only; the top and side padding are untouched.
PADS = [
    ('aboutPad: mob ? \\"104px 20px 60px\\" : \\"130px 40px 70px\\"',
     'aboutPad: mob ? \\"104px 20px 22px\\" : \\"130px 40px 18px\\"'),
    ('workPad: mob ? \\"104px 20px 60px\\" : \\"130px 48px 60px\\"',
     'workPad: mob ? \\"104px 20px 22px\\" : \\"130px 48px 18px\\"'),
    ('inboxPad: mob ? \\"104px 20px 60px\\" : \\"150px 40px 80px\\"',
     'inboxPad: mob ? \\"104px 20px 22px\\" : \\"150px 40px 24px\\"'),
]

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
    "\\n  /* [build.py] Scale the whole phone view up. The wrapper's zoom and\\n"
    "     height both resolve through --z, so overriding that one property\\n"
    "     scales everything uniformly — text, photos, shelf — exactly as the\\n"
    "     desktop zoom does. !important because --z is set in the inline style.\\n"
    "     The cost is layout width: at 393px an effective 351px is left, which\\n"
    "     is why the nav metrics below are tuned down to compensate (they still\\n"
    "     render larger than before, since the zoom scales them back up). */\\n"
    "  @media (max-width: 760px) {\\n"
    "    div[data-theme] { --z: 1.12 !important; }\\n"
    "  }\\n"
    "  /* [build.py] Hold the headline still as the rotating word changes.\\n"
    "     The word sits inline after \\\"occasionally\\\", so a long one wraps and the\\n"
    "     headline goes from two lines to three. The block is bottom-anchored,\\n"
    "     so the last line stays put but everything above it jumps a full line.\\n"
    "     Measured on a 393px phone: 2 lines for \\\"cooking\\\", 3 for \\\"touching\\n"
    "     grass\\\" and \\\"grinding LeetCode\\\".\\n"
    "\\n"
    "     Fixed by sizing the headline so even the longest word stays on line\\n"
    "     two, making it always two lines. Binary-searched per width: the\\n"
    "     largest size that keeps \\\"grinding LeetCode...\\\" inline is a steady\\n"
    "     7.49vw from 320px to 430px, so 7.3vw leaves a margin. The 44px cap is\\n"
    "     the original's and still clears at 600-759px.\\n"
    "\\n"
    "     The cost is a smaller headline on phones — about 19% down at 393px\\n"
    "     (35.4 -> 28.7 CSS px). It is set by the longest entry in rotWords, so\\n"
    "     shortening those in Claude Design would buy the size back. Phones\\n"
    "     only: desktop already measures two lines for every word. */\\n"
    "  @media (max-width: 760px) {\\n"
    "    h1 { font-size: clamp(22px, 7.3vw, 44px) !important; }\\n"
    "  }\\n"
    "  /* [build.py] Phone nav: keep the name on one line. */\\n"
    "  @media (max-width: 760px) {\\n"
    "    div[style*='z-index: 20'] { grid-template-columns: auto 1fr !important; }\\n"
    "    div[style*='z-index: 20'] > a { white-space: nowrap !important; }\\n"
    "  }\\n"
    "  /* [build.py] Narrow phones (<=400px): the name plus four tabs no longer\\n"
    "     fit on one line, so tighten the tab metrics rather than let the row\\n"
    "     wrap to two lines. */\\n"
    "  @media (max-width: 400px) {\\n"
    "    div[style*='z-index: 20'] {\\n"
    "      font-size: 10.4px !important;\\n"
    "      letter-spacing: 0.03em !important;\\n"
    "    }\\n"
    "    div[style*='z-index: 20'] > a { font-size: 12px !important; }\\n"
    "    div[style*='z-index: 20'] > span { gap: 6px !important; }\\n"
    "    /* The phone zoom leaves less layout width, so buy the nav's row back\\n"
    "       from the gutters instead of shrinking the type any further. */\\n"
    "    div[style*='z-index: 20'] {\\n"
    "      padding-left: 12px !important;\\n"
    "      padding-right: 12px !important;\\n"
    "    }\\n"
    "  }\\n"
    "  /* [build.py] Any title still too long for its spine gets an ellipsis\\n"
    "     rather than a hard mid-word cut, so it reads as deliberate. */\\n"
    "  span[style*='vertical-rl'] { text-overflow: ellipsis; }\\n"
    "  /* [build.py] The sticky panel sits directly under the nav so their bands\\n"
    "     read as one surface, with no strip of sharp scrolling content between\\n"
    "     them. The value is in the ZOOMED coordinate space, not screen pixels:\\n"
    "     the nav measures 56-57 physical px, which under the 1.12 phone zoom is\\n"
    "     50 CSS px here. Setting the screen figure leaves a 6px seam. Re-measure\\n"
    "     (and divide by the zoom) if the nav's type or padding changes. Same\\n"
    "     blur as the nav. */\\n"
    "  /* [build.py] Phone shelf: the scene panel is a flex item that wraps\\n"
    "     BELOW the three-row bookshelf, landing ~1030px down — off screen, so\\n"
    "     you cannot see the stack and the scene you just tapped at the same\\n"
    "     time. Spines carry a click handler, so pin the panel above the shelf\\n"
    "     and let it stick while you scroll and tap. The inline top: 200px is a\\n"
    "     desktop offset and is pure harm here. */\\n"
    "  @media (max-width: 760px) {\\n"
    "    div[style*='top: 200px'] {\\n"
    "      order: -1 !important;\\n"
    "      position: sticky !important;\\n"
    "      top: 50px !important;\\n"
    "      /* Full-bleed across the section's 20px side padding, with the\\n"
    "         padding added back inside, so the band is a clean opaque strip\\n"
    "         that fully contains the panel. Otherwise shelf text scrolling\\n"
    "         past peeks down the sides and just under the tile. */\\n"
    "      margin: 0 -20px 22px !important;\\n"
    "      /* 26px, not 16: the cover carries an 18px offset drop-shadow that\\n"
    "         is not part of its box, so at 16px the grey backing poked 1px\\n"
    "         past the band's bottom edge and read as misaligned. */\\n"
    "      padding: 0 20px 26px !important;\\n"
    "      box-sizing: border-box !important;\\n"
    "      width: calc(100% + 40px) !important;\\n"
    "      z-index: 5 !important;\\n"
    "      /* Fully opaque: at 0.94 the shelf caption ghosted through the band\\n"
    "         as it scrolled under, which reads as text overlapping the image.\\n"
    "         Same colour as the page, so at rest the band is invisible. */\\n"
    "      background: oklch(0.13 0.005 260) !important;\\n"
    "      backdrop-filter: blur(12px) !important;\\n"
    "      -webkit-backdrop-filter: blur(12px) !important;\\n"
    "    }\\n"
    "    /* The panel's inner row is sized for the desktop column: a 200px tile\\n"
    "       plus a 26px indent leaves the quote only 96px of a 350px panel, so\\n"
    "       it gets cut off. Shrink the tile and drop the indent. */\\n"
    "    div[style*='height: 330px'] {\\n"
    "      height: auto !important;\\n"
    "      padding-left: 0 !important;\\n"
    "      gap: 16px !important;\\n"
    "    }\\n"
    "    /* Two shapes appear here: a real cover <img> (225x350 natural, sized\\n"
    "       300px tall for the desktop column) and, before a spine is picked,\\n"
    "       a placeholder <div> tile. An earlier rule only matched the div, so\\n"
    "       the cover kept its full 300px and squeezed the quote into 144px.\\n"
    "       Size both: height only for the img, so its own aspect ratio is\\n"
    "       preserved and the art is never squashed or cropped. */\\n"
    "    div[style*='height: 330px'] > img {\\n"
    "      height: 235px !important;\\n"
    "      width: auto !important;\\n"
    "      max-width: 46% !important;\\n"
    "      flex: 0 0 auto !important;\\n"
    "    }\\n"
    "    div[style*='height: 330px'] > div:first-child {\\n"
    "      width: 151px !important;\\n"
    "      height: 235px !important;\\n"
    "      flex: 0 0 auto !important;\\n"
    "    }\\n"
    "    /* The mono caps labels are 9-11px, which is fine on a desktop column\\n"
    "       and too small to read on a phone. Lift them a step. Keyed off their\\n"
    "       letter-spacing so book spines — whose size is computed to fit the\\n"
    "       spine and would re-clip if enlarged — are not matched. */\\n"
    "    [style*='font-size: 9px'][style*='letter-spacing: 0.22em'] { font-size: 11px !important; }\\n"
    "    [style*='font-size: 10px'][style*='letter-spacing: 0.08em'] { font-size: 11.5px !important; }\\n"
    "    [style*='font-size: 11px'][style*='letter-spacing: 0.08em'] { font-size: 12.5px !important; }\\n"
    "    div[style*='height: 330px'] > div:last-child { padding: 0 4px !important; }\\n"
    "    /* The card is released by the bottom of its containing block — the\\n"
    "       shelf row — which ends right above the shelf's caption. That is\\n"
    "       where it should stop: the caption stays clear and the card is\\n"
    "       never caught half-scrolled with its cover art sheared by the nav.\\n"
    "       An earlier revision extended that range by 120px; on a real phone\\n"
    "       it rode up over the caption and the Recently heading, so it is\\n"
    "       gone and the natural release point stands. */\\n"
    "    /* The credit line is nowrap at 0.22em tracking — ~222px of text in a\\n"
    "       210px column, so it runs off the edge. Let it wrap and tighten. */\\n"
    "    div[style*='height: 330px'] div[style*='nowrap'] {\\n"
    "      white-space: normal !important;\\n"
    "      font-size: 10px !important;\\n"
    "      letter-spacing: 0.06em !important;\\n"
    "    }\\n"
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
    ap.add_argument("--card-version", type=int, default=1,
                    help="bump when social-preview.jpg changes; busts Discord/iMessage caches")
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

    # ── Nav background gradient ──────────────────────────────────────────────
    if NAVBG_TO in html:
        print("nav gradient : already present")
    elif NAVBG_FROM in html:
        html = html.replace(NAVBG_FROM, NAVBG_TO)
        print("nav gradient : applied")
    else:
        print("nav gradient : SKIPPED — navBg binding not found")

    # ── Book spine fitting ───────────────────────────────────────────────────
    if SPINE_TO in html:
        print("spine fit    : already present")
    elif SPINE_FROM in html:
        html = html.replace(SPINE_FROM, SPINE_TO)
        print("spine fit    : applied")
    else:
        print("spine fit    : SKIPPED — shelfBooks map not found")

    # ── Link preview meta ────────────────────────────────────────────────────
    if SOCIAL_MARK in html:
        print("link preview : already present")
    else:
        m = re.search(r"</title>", html)
        if not m:
            print("link preview : SKIPPED — no <title> in the outer head")
        elif not os.path.isfile(os.path.join(os.path.abspath(args.out), SOCIAL_IMAGE)):
            print("link preview : SKIPPED — %s missing at the site root" % SOCIAL_IMAGE)
        else:
            html = html[:m.end()] + "\n" + social_block(args.card_version) + html[m.end():]
            print("link preview : meta added (card v%d)" % args.card_version)

    # ── Rotating headline word ───────────────────────────────────────────────
    rn = 0
    for frm, to in ROTATION:
        if to in html:
            rn += 1
        elif frm in html:
            if html.count(frm) != 1:
                sys.exit("ERROR: rotation string %r appears %d times" % (frm[:30], html.count(frm)))
            html = html.replace(frm, to)
            rn += 1
        else:
            print("word cycle   : SKIPPED — %r not found" % frm[:30])
    print("word cycle   : %d of %d values retimed" % (rn, len(ROTATION)))

    # ── Gradient-text descenders ─────────────────────────────────────────────
    dn = 0
    for frm, to in DESCENDERS:
        if to in html:
            dn += 1
        elif frm in html:
            html = html.replace(frm, to)
            dn += 1
        else:
            print("descenders   : SKIPPED — a gradient-text padding not found")
    print("descenders   : %d of %d gradient texts un-clipped" % (dn, len(DESCENDERS)))

    # ── Bottom padding of scrolling pages ────────────────────────────────────
    done = sum(1 for _, to in PADS if to in html)
    for frm, to in PADS:
        if to in html:
            continue
        if frm in html:
            html = html.replace(frm, to)
            done += 1
        else:
            print("bottom pad   : SKIPPED — %s not found" % frm.split(":")[0])
    print("bottom pad   : %d of %d sections trimmed" % (done, len(PADS)))

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

    # ── Sanity gate ──────────────────────────────────────────────────────────
    # The template is a JSON string inside a <script> tag. A patch that injects
    # a raw newline, an unescaped quote, or a literal "</" silently produces a
    # file that parses as HTML but explodes at JSON.parse, leaving a blank page.
    # Cheap to check, so never ship without checking.
    for kind in ("template", "manifest", "ext_resources", "page_order"):
        text = section(html, kind).group(1)
        try:
            json.loads(text)
        except ValueError as exc:
            sys.exit("ERROR: %s block is not valid JSON after patching (%s).\n"
                     "       A patch probably injected a raw newline or quote."
                     % (kind, exc))
    if "</" in section(html, "template").group(1):
        sys.exit("ERROR: template contains a literal '</' — it would terminate "
                 "its own <script> tag. Escape it as '<\\\\u002F'.")

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
