#!/usr/bin/env python3
"""
Build The Stacks' catalogue page (stacks/) from stacks/anime.json.

The shelf on /about/ shows the canon: a couple of dozen spines picked in
Claude Design. The catalogue is everything, and it lives outside the Claude
Design export so adding a title is one JSON entry, not a redesign:

    stacks/anime.json      hand-edited: title, MyAnimeList id, status, take…
    fetch_catalogue.py     this: asks AniList for the rest, fetches art,
                           writes the cards into stacks/index.html
    stacks/index.html      the page; everything between the [catalogue]
                           markers is generated, the rest is hand-written

AniList resolves every MyAnimeList id in a few GraphQL requests (no per-title
rate limit to crawl) and gives episodes, year, studio, genres, score, cover,
banner and trailer. Art is saved into covers/ with the same names the shelf
uses (mal-<id>.webp, banner-mal-<id>.webp), so titles already on the shelf
fetch nothing.

The cards are rendered into the HTML here, not in the browser: the page is
readable without JavaScript, indexable, and never flashes empty. Each card
carries its own hover panel (synopsis, rating, links); the page's script only
sorts and filters, and opens a card on tap where there is no hover.

USAGE
    python3 fetch_catalogue.py            # fetch what is missing, rebuild the page
    python3 fetch_catalogue.py --force    # re-fetch every cover and banner
"""

import argparse
import html
import json
import os
import re
import sys
import time
import urllib.request

from PIL import Image

from fetch_covers import TRAILER_OVERRIDES, UA, get, save_webp

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "stacks", "anime.json")
PAGE = os.path.join(HERE, "stacks", "index.html")
COVERS = os.path.join(HERE, "covers")
BATCH = 12                 # AniList media per request: ~25 complexity each, cap is 500

FIELDS = ("idMal id format episodes seasonYear status averageScore popularity genres siteUrl description(asHtml: false) "
          "title { romaji english } studios(isMain: true) { nodes { name } } "
          "coverImage { extraLarge large } bannerImage trailer { id site }")


def anilist(mal_ids):
    """{mal_id: media} for every id AniList knows, BATCH ids per request."""
    out = {}
    for n in range(0, len(mal_ids), BATCH):
        chunk = mal_ids[n:n + BATCH]
        query = "{ %s }" % " ".join("m%d: Media(idMal: %d, type: ANIME) { %s }" % (i, i, FIELDS) for i in chunk)
        req = urllib.request.Request(
            "https://graphql.anilist.co", data=json.dumps({"query": query}).encode(),
            headers=dict(UA, **{"Content-Type": "application/json", "Accept": "application/json"}))
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    data = json.loads(r.read()).get("data") or {}
                break
            except Exception as exc:
                if attempt == 2:
                    raise
                time.sleep(3 * (attempt + 1))
        for i in chunk:
            if data.get("m%d" % i):
                out[i] = data["m%d" % i]
        if n + BATCH < len(mal_ids):
            time.sleep(1)                      # well under AniList's 90 req/min
    return out


def fetch_art(media, mal_id, force):
    """Cover and banner into covers/; returns (cover_path, banner_path) relative to the site root."""
    cover = "covers/mal-%d.webp" % mal_id
    banner = "covers/banner-mal-%d.webp" % mal_id
    jobs = [(cover, ((media.get("coverImage") or {}).get("extraLarge") or (media.get("coverImage") or {}).get("large")), {}),
            (banner, media.get("bannerImage"), {"max_h": 600, "quality": 72})]
    have = []
    for rel, url, kw in jobs:
        dest = os.path.join(HERE, rel)
        if os.path.exists(dest) and not force:
            have.append(rel)
            continue
        if not url:
            have.append(None)
            continue
        try:
            raw = get(url)
            w, h = save_webp(raw, dest, **kw)
            print("ok    %-26s %dx%d  %5.1f KB" % (os.path.basename(rel), w, h, os.path.getsize(dest) / 1e3))
            have.append(rel)
        except Exception as exc:
            print("FAIL  %-26s %s" % (os.path.basename(rel), exc))
            have.append(None)
    return have[0], have[1]


def blurb(desc):
    """AniList's synopsis as plain text, without the '(Source: …)' credit, cut at ~320 chars."""
    s = re.sub(r"<br\s*/?>", "\n", desc or "")
    s = html.unescape(re.sub(r"<[^>]+>", "", s))
    s = re.sub(r"\(Source:.*?\)", "", s, flags=re.S)
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) > 320:
        s = s[:320].rsplit(" ", 1)[0].rstrip(",;:") + "\u2026"
    return s


def short(n):
    """553435 -> '553.4k', the way the app counts ratings."""
    if not n:
        return ""
    if n >= 1e6:
        return ("%.1fM" % (n / 1e6)).replace(".0M", "M")
    if n >= 1e3:
        return ("%.1fk" % (n / 1e3)).replace(".0k", "k")
    return str(n)


def slugify(title):
    s = re.sub(r"[^a-z0-9]+", "-", title.lower().replace("×", "x")).strip("-")
    return s or "title"


def entry(mine, media, cover, banner):
    """One catalogue entry: the hand-written fields plus what AniList knows."""
    trailer = (media.get("trailer") or {})
    status = {"RELEASING": "airing", "FINISHED": "finished", "NOT_YET_RELEASED": "upcoming"}.get(media.get("status"), "")
    studio = ((media.get("studios") or {}).get("nodes") or [{}])[0].get("name")
    fmt = {"TV": "TV", "TV_SHORT": "TV short", "MOVIE": "Film", "ONA": "ONA", "OVA": "OVA", "SPECIAL": "Special"}.get(media.get("format"), media.get("format"))
    return {
        "title": mine["title"], "slug": slugify(mine["title"]), "mal": mine["mal"], "anilist": media.get("id"),
        "english": (media.get("title") or {}).get("english"), "romaji": (media.get("title") or {}).get("romaji"),
        "year": media.get("seasonYear"), "episodes": media.get("episodes"), "format": fmt, "status": status,
        "score": media.get("averageScore"), "popularity": media.get("popularity"), "blurb": blurb(media.get("description")),
        "genres": media.get("genres") or [], "studio": studio,
        "url": media.get("siteUrl"), "cover": cover, "banner": banner,
        "trailer": TRAILER_OVERRIDES.get(mine["title"]) or ((trailer.get("id") or "").strip() or None if trailer.get("site") == "youtube" else None),
        "mine": mine.get("status"), "alltimer": bool(mine.get("alltimer")), "manga": bool(mine.get("manga")),
        "tag": mine.get("tag"), "take": mine.get("take"), "quote": mine.get("quote"), "ref": mine.get("ref"),
    }


PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>'
MARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>'
STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17.5l-6 3.3 1.3-6.7-5-4.6 6.8-.8z"/></svg>'


def card(i, a):
    e = html.escape
    size = ""
    if a["cover"]:
        try:
            w, h = Image.open(os.path.join(HERE, a["cover"])).size
            size = ' width="%d" height="%d"' % (w, h)
        except Exception:
            pass
    img = ('<img src="/%s" alt=""%s loading="%s" decoding="async">' % (e(a["cover"]), size, "eager" if i < 12 else "lazy")
           if a["cover"] else "")
    tag = ""
    if a["mine"] == "watching":
        tag = '<span class="tag">Watching</span>'
    elif a["alltimer"]:
        tag = '<span class="tag">All-timer</span>'
    elif a["status"] == "airing":
        tag = '<span class="tag dim">Airing</span>'
    eps = ("%d Episodes" % a["episodes"]) if a["episodes"] else ("Airing" if a["status"] == "airing" else "")
    sub = " · ".join(str(x) for x in (a["year"], eps) if x)
    rating = ('<div class="%s">' + STAR + ' %.1f <span class="n">(%s)</span></div>') if a["score"] else None
    meta = " · ".join(x for x in ({"airing": "Airing", "finished": "Finished", "upcoming": "Upcoming"}.get(a["status"], ""), eps if a["status"] != "airing" else "", a["studio"]) if x)
    actions = ""
    if a["trailer"]:
        actions += '<a class="ico" href="https://www.youtube.com/watch?v=%s" target="_blank" rel="noreferrer" aria-label="Trailer" title="Trailer">%s</a>' % (e(a["trailer"]), PLAY)
    if a["url"]:
        actions += '<a class="ico" href="%s" target="_blank" rel="noreferrer" aria-label="On AniList" title="On AniList">%s</a>' % (e(a["url"]), MARK)
    search = " ".join(filter(None, [a["title"], a["english"], a["romaji"], a["studio"], a["take"]] + a["genres"]))
    return (
        '<article class="card" id="%s" tabindex="0" data-i="%d" data-title="%s" data-year="%s" data-eps="%s" data-pop="%s" '
        'data-genres="%s" data-search="%s">\n'
        '  <div class="poster">%s%s</div>\n'
        '  <div class="below"><div class="title">%s</div><div class="sub">%s</div>%s</div>\n'
        '  <div class="hover">\n'
        '    <div class="h-title">%s</div>\n'
        '    %s\n'
        '    <div class="h-meta">%s</div>\n'
        '    <p class="h-desc">%s</p>\n'
        '    %s\n'
        '    <div class="h-actions">%s</div>\n'
        '  </div>\n'
        '</article>'
        % (e(a["slug"]), i, e(a["title"]), a["year"] or "", a["episodes"] or "", a["popularity"] or "",
           e("|".join(a["genres"])), e(search),
           img, tag,
           e(a["title"]), e(sub), (rating % ("stars", a["score"] / 20, short(a["popularity"]))) if rating else "",
           e(a["title"]),
           (rating % ("h-rating", a["score"] / 20, short(a["popularity"]))) if rating else "",
           e(meta), e(a["blurb"]),
           ('<p class="h-take">\u201C%s\u201D</p>' % e(a["take"])) if a["take"] else "",
           actions))


def stats(entries):
    """The one number on the page; the rest is in the data."""
    return "%d titles" % len(entries)


def replace_between(text, start, end, body, label):
    i, j = text.find(start), text.find(end)
    if i < 0 or j < 0 or j < i:
        sys.exit("ERROR: stacks/index.html has no %s markers; restore them from git" % label)
    return text[:i + len(start)] + body + text[j:]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true", help="re-fetch covers and banners that already exist")
    args = ap.parse_args()

    mine = json.load(open(SOURCE, encoding="utf-8"))["anime"]
    for a in mine:
        if not a.get("title") or not isinstance(a.get("mal"), int):
            sys.exit("ERROR: every entry needs a title and an integer mal id: %r" % a)
    dupes = [m for m in set(a["mal"] for a in mine) if sum(1 for a in mine if a["mal"] == m) > 1]
    if dupes:
        sys.exit("ERROR: MyAnimeList id(s) listed twice: %s" % dupes)

    ids = [a["mal"] for a in mine]
    print("AniList: %d titles…" % len(ids))
    media = anilist(ids)
    os.makedirs(COVERS, exist_ok=True)

    entries, missing = [], []
    for a in mine:
        m = media.get(a["mal"])
        if not m:
            missing.append("%s (mal %d)" % (a["title"], a["mal"]))
            m = {}
        cover, banner = fetch_art(m, a["mal"], args.force) if m else (None, None)
        entries.append(entry(a, m, cover, banner))

    page = open(PAGE, encoding="utf-8").read()
    page = replace_between(page, "<!-- [catalogue] -->\n", "<!-- [/catalogue] -->",
                           "\n".join(card(i, a) for i, a in enumerate(entries)) + "\n", "[catalogue]")
    page = replace_between(page, "<!-- [catalogue stats] -->", "<!-- [/catalogue stats] -->", stats(entries), "[catalogue stats]")
    with open(PAGE, "w", encoding="utf-8", newline="") as fh:
        fh.write(page)

    print("stacks/index.html: %d titles, %d with banners, %d with trailers" % (
        len(entries), sum(1 for a in entries if a["banner"]), sum(1 for a in entries if a["trailer"])))
    if missing:
        print("\nAniList does not know these ids (check the number in the MyAnimeList URL):\n  " + "\n  ".join(missing))
        sys.exit(1)


if __name__ == "__main__":
    main()
