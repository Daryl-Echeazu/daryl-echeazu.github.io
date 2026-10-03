#!/usr/bin/env python3
"""
Download The Stacks' cover art into covers/ so the site serves it itself.

The shelf used to hot-link Open Library for books and look anime covers up on
the Jikan API one at a time (1.5s apart, to stay under its rate limit), so a
first-time visitor hovering a spine waited on a third-party round trip — up to
~36s for the last anime cover, or forever when Jikan is down (it was, with
504s, the day this was written). Anime art now comes from AniList, which
resolves all the MyAnimeList ids in one GraphQL request. With the files local, build.py points the shelf
at covers/ and preloads them, and hovering is instant.

Reads the ISBNs and MyAnimeList ids from the built index.html (or an export),
so new books added in Claude Design are picked up by re-running this.

USAGE
    python fetch_covers.py            # fetch anything missing
    python fetch_covers.py --force    # re-fetch everything
"""

import argparse
import io
import json
import os
import re
import sys
import time
import urllib.request

from PIL import Image

MAX_H = 560          # the cover renders 300 CSS px tall: ~2x on Retina
QUALITY = 74
UA = {"User-Agent": "darylecheazu.me cover fetcher (+https://darylecheazu.me)"}


def template_text(path):
    html = open(path, encoding="utf-8").read()
    m = re.search(r'<script type="__bundler/template">(.*?)</script>', html, re.S)
    if not m:
        sys.exit("ERROR: no __bundler/template block in %s" % path)
    return json.loads(m.group(1))


def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read()
        except Exception as exc:
            if i == tries - 1:
                raise
            time.sleep(2 + 2 * i)
    return None


def anilist_covers(mal_ids):
    """{mal_id: cover url} for every id AniList knows, in one request."""
    fields = " ".join("m%d: Media(idMal: %d, type: ANIME) { coverImage { extraLarge large } }" % (i, i)
                      for i in mal_ids)
    req = urllib.request.Request(
        "https://graphql.anilist.co",
        data=json.dumps({"query": "{ %s }" % fields}).encode(),
        headers=dict(UA, **{"Content-Type": "application/json", "Accept": "application/json"}))
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read())["data"]
    out = {}
    for i in mal_ids:
        media = data.get("m%d" % i)
        if media and media.get("coverImage"):
            out[i] = media["coverImage"].get("extraLarge") or media["coverImage"].get("large")
    return out


def save_webp(raw, dest):
    im = Image.open(io.BytesIO(raw))
    im.load()
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGB")
    if im.height > MAX_H:
        im = im.resize((round(im.width * MAX_H / im.height), MAX_H), Image.LANCZOS)
    im.save(dest, "WEBP", quality=QUALITY, method=6)
    return im.size


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", nargs="?", default="index.html")
    ap.add_argument("--out", default="covers")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    t = template_text(args.source)
    isbns = sorted(set(re.findall(r'covers\.openlibrary\.org/b/isbn/(\d+)-L\.jpg', t)))
    mal = re.search(r'shelfMalIds = (\{.*?\});', t)
    mal_ids = sorted(set(int(v) for v in re.findall(r':\s*(\d+)', mal.group(1)))) if mal else []
    os.makedirs(args.out, exist_ok=True)

    jobs = [("isbn-%s.webp" % i, "https://covers.openlibrary.org/b/isbn/%s-L.jpg" % i, None)
            for i in isbns]
    jobs += [("mal-%d.webp" % i, None, i) for i in mal_ids]

    want = [i for name, url, i in jobs
            if i is not None and (args.force or not os.path.exists(os.path.join(args.out, name)))]
    anime = anilist_covers(want) if want else {}

    ok = failed = skipped = 0
    for name, url, mal_id in jobs:
        dest = os.path.join(args.out, name)
        if os.path.exists(dest) and not args.force:
            skipped += 1
            continue
        try:
            if mal_id is not None:
                url = anime.get(mal_id)
                if not url:
                    raise ValueError("AniList has no cover for MAL id %d" % mal_id)
            raw = get(url)
            if len(raw) < 1000:                    # Open Library's 1x1 "no cover" gif
                raise ValueError("no cover (%d bytes)" % len(raw))
            w, h = save_webp(raw, dest)
            print("ok    %-22s %dx%d  %5.1f KB" % (name, w, h, os.path.getsize(dest) / 1e3))
            ok += 1
        except Exception as exc:
            print("FAIL  %-22s %s" % (name, exc))
            failed += 1

    print("\n%d fetched, %d already present, %d failed -> %s/" % (ok, skipped, failed, args.out))
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
