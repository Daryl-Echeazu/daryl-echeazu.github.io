"""
Template patches applied by build.py: copy, Experience, routing,
The Stacks covers, accessibility and loading fixes (Oct 2026).

Unlike the older patches in build.py, which match the JSON-escaped template
inside index.html, these run on the DECODED template text, so each one reads
as the plain HTML/JS it is. build.py decodes the template, calls apply(), and
re-encodes it.

Every patch is checked: it must match exactly the expected number of times, or
already be applied (so re-running on a built index.html is a no-op). Anything
else is reported, and `build.py --strict` turns reports into a failed build —
a Claude Design edit that moves one of these strings should stop the build,
not ship a half-patched site.
"""

import json
import os
import re

SITE_URL = "https://darylecheazu.me"
GITHUB_URL = "https://github.com/Daryl-Echeazu"
LINKEDIN_URL = "https://www.linkedin.com/in/daryl-echeazu/"
INSTAGRAM_URL = "https://www.instagram.com/daryl_echeazu/"
EMAIL = "darecheazu@uchicago.edu"

DESCRIPTION = ("Mostly building, occasionally touching grass. CS + Math at UChicago. "
               "Building Gemini Enterprise Agents at Google Cloud; previously ML at Apple.")


def person_jsonld():
    """schema.org Person: lets search engines connect the site to the profiles."""
    return json.dumps({
        "@context": "https://schema.org",
        "@type": "Person",
        "name": "Daryl Echeazu",
        "url": SITE_URL + "/",
        "image": SITE_URL + "/social-preview.jpg",
        "jobTitle": "Software Engineering Intern, Gemini Enterprise Agents",
        "worksFor": {"@type": "Organization", "name": "Google Cloud"},
        "alumniOf": {"@type": "CollegeOrUniversity", "name": "University of Chicago"},
        "knowsAbout": ["Machine learning", "AI agents", "Quantitative finance"],
        "sameAs": [LINKEDIN_URL, GITHUB_URL, INSTAGRAM_URL],
    }, ensure_ascii=False)


def decode(template_json):
    return json.loads(template_json)


def encode(text):
    # "</" would close the <script> the template lives in; the export writes
    # it as </, so match that.
    return json.dumps(text, ensure_ascii=False).replace("</", "<\\u002F")


class Patcher:
    def __init__(self, text):
        self.text = text
        self.applied = []
        self.already = []
        self.problems = []

    def sub(self, label, frm, to, count=1):
        """Replace `frm` (expected `count` times) with `to`. Already applied
        if `to` is present and `frm` is not."""
        n = self.text.count(frm)
        if to in self.text and (n == 0 or frm in to):
            self.already.append(label)
        elif n == count:
            self.text = self.text.replace(frm, to)
            self.applied.append(label)
        else:
            self.problems.append("%s: matched %d time(s), want %d" % (label, n, count))

    def resub(self, label, pattern, repl, done_marker, flags=re.S):
        """Regex replacement for spans too long to quote (method bodies).
        `done_marker` is a string only the patched text contains."""
        if done_marker in self.text:
            self.already.append(label)
            return
        new, n = re.subn(pattern, repl, self.text, count=1, flags=flags)
        if n:
            self.text = new
            self.applied.append(label)
        else:
            self.problems.append("%s: pattern not found" % label)

    def subs(self, label, pairs):
        for i, (frm, to) in enumerate(pairs):
            self.sub("%s[%d]" % (label, i), frm, to)


# ── Copy: Google is now, Apple is past ───────────────────────────────────────
COPY = [
    ('{ year: "FALL 2026", org: "Google", role: "Software Engineering — Cloud", '
     'desc: "Enterprise agents.", tags: ["AGENTS", "GCP"], status: "INCOMING",',
     '{ year: "FALL 2026 — NOW", org: "Google", role: "Software Engineering — Google Cloud", '
     'desc: "Building Gemini Enterprise Agents.", '
     'tags: ["GEMINI", "AGENTS", "GCP"], status: "NOW",'),
    ('tags: ["ML INFRASTRUCTURE", "INTERNAL TOOLS"], status: "NOW",',
     'tags: ["ML INFRASTRUCTURE", "INTERNAL TOOLS"], status: "",'),
    ('{ org: "Google", role: "Incoming Software Engineer Intern — Google Cloud, Applied AI '
     'Enterprise Agents", where: "Sunnyvale, CA", when: "FALL 2026", bullets: [] },',
     '{ org: "Google", role: "Software Engineer Intern — Google Cloud, Gemini Enterprise Agents", '
     'where: "Sunnyvale, CA", when: "FALL 2026", bullets: [] },'),
    ('Right now that means Apple this summer, and learning what I can in between.',
     'Right now that means building Gemini Enterprise Agents at Google Cloud, '
     'and learning what I can in between.'),
    ('{ date: "FALL 2026", what: "Joining Google Cloud — enterprise agents, Sunnyvale." },',
     '{ date: "FALL 2026", what: React.createElement("span", { style: this.goldTextStyle }, '
     '"Started at Google Cloud, building Gemini Enterprise Agents.") },'),
    ('work: "apple (now) → google cloud (fall). prev: scale ai. see EXPERIENCE tab.",',
     'work: "google cloud (now): gemini enterprise agents. prev: apple, scale ai. '
     'see EXPERIENCE tab.",'),
]

# Six sharp words land better than twenty-eight; shorter words also stop the
# phone headline from being sized down for "grinding LeetCode".
ROT_WORDS = ["touching grass", "hooping", "lifting heavy", "zetamaccing",
             "watching anime", "going hiking"]

# ── Hero: say who this is, and add GitHub ────────────────────────────────────
HERO = [
    ('{{ rotWord }}{{ rotPeriod }}</span></h1>',
     '{{ rotWord }}{{ rotPeriod }}</span></h1>\n'
     '        <p style="margin: 14px 0 0; font-family: \'Newsreader\', Georgia, serif; '
     'font-size: {{ heroSubFont }}; letter-spacing: 0.01em; line-height: 1.5; '
     'color: oklch(0.94 0.005 260 / 0.88); text-shadow: 0 1px 3px oklch(0 0 0 / 0.55);">'
     '{{ heroSub }}</p>'),
    ('<a href="https://www.linkedin.com/in/daryl-echeazu/" target="_blank" rel="noreferrer">LINKEDIN</a>\n'
     '          <a href="mailto:darecheazu@uchicago.edu">EMAIL</a>',
     '<a href="https://www.linkedin.com/in/daryl-echeazu/" target="_blank" rel="noreferrer">LinkedIn</a>\n'
     '          <a href="' + GITHUB_URL + '" target="_blank" rel="noreferrer">GitHub</a>\n'
     '          <a href="mailto:darecheazu@uchicago.edu">Email</a>'),
    ('{ label: "Email", href: "mailto:darecheazu@uchicago.edu", target: "", slug: "gmail" },',
     '{ label: "Email", href: "mailto:darecheazu@uchicago.edu", target: "", slug: "gmail" },\n'
     '        { label: "GitHub", href: "' + GITHUB_URL + '", target: "_blank", slug: "github" },'),
]

# ── Experience: detail panel aligned to the list, readable names ──────────
EXPERIENCE = [
    # The panel was centred against the whole list, so the selected company
    # and its details never lined up. Pin it to the top instead.
    ('padding-left: 38px; min-height: 260px; display: flex; flex-direction: column; justify-content: center;',
     'padding-left: 38px; min-height: 260px; display: flex; flex-direction: column; '
     'justify-content: flex-start; align-self: start; padding-top: 14px;'),
    # Unselected companies were 1.85:1 against the background — they read as
    # disabled. 0.56 is ~4.6:1 and still clearly secondary to the selection.
    ('color: s.activeWork === i ? "oklch(0.94 0.005 260)" : "oklch(0.36 0.005 260)",',
     'color: s.activeWork === i ? "oklch(0.94 0.005 260)" : "oklch(0.56 0.005 260)",'),
]

# ── Component logic: new methods and bindings ────────────────────────────────
METHODS_ANCHOR = "  componentWillUnmount() {"
METHODS = '''  // [build.py] Helpers for URL routing,
  // lazy gallery photos and the locally served shelf covers.
  tabHash = { home: "", meanwhile: "about", work: "experience", live: "os", inbox: "inbox" };
  touchUI = typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(hover: none)").matches;

  // Gallery photos load only once the About tab is open, and only the one on
  // screen plus its neighbours; each stays loaded after that.
  photoSrc(i) {
    const s = this.state, n = this.photos.length, c = s.photoIdx || 0;
    this.photoArmed = this.photoArmed || {};
    if (s.tab === "meanwhile" && (i === c || i === (c + 1) % n || i === (c + n - 1) % n)) this.photoArmed[i] = true;
    return this.photoArmed[i] ? this.photos[i].src : undefined;
  }

  // Warm a whole shelf's covers so hovering a spine shows its cover at once.
  coverUrl(b) { return (this.shelfCovers || {})[b.title] || b.img; }
  preloadCovers(genre) {
    this.coversWarm = this.coversWarm || {};
    if (this.coversWarm[genre]) return;
    this.coversWarm[genre] = true;
    this.coverImgs = this.coverImgs || [];
    (this.shelves[genre] || []).forEach(b => {
      const u = this.coverUrl(b);
      if (u) { const im = new Image(); im.decoding = "async"; im.src = u; this.coverImgs.push(im); }
    });
  }
  warmShelves() {
    this.preloadCovers(this.state.genre);
    const rest = () => Object.keys(this.shelves).forEach(g => this.preloadCovers(g));
    if (window.requestIdleCallback) window.requestIdleCallback(rest, { timeout: 5000 }); else setTimeout(rest, 3000);
  }

  // Each tab has a URL (#about, #experience, #os): shareable, and Back works.
  syncHash(tab) {
    try {
      const h = this.tabHash[tab] ? "#" + this.tabHash[tab] : "";
      if (h !== location.hash) history.pushState(null, "", h || location.pathname + location.search);
    } catch (err) {}
  }
  onHash = () => {
    const h = location.hash.slice(1).toLowerCase();
    const tab = Object.keys(this.tabHash).find(k => h && this.tabHash[k] === h) || "home";
    if (tab !== "home" && (this.navIds || []).indexOf(tab) < 0) return;
    if (tab !== this.state.tab) this.setState({ tab });
    if (tab === "meanwhile") this.warmShelves();
  };

'''

LOGIC = [
    ('  setTab(tab, e) { if (e) e.preventDefault(); this.setState({ tab }); }',
     '  setTab(tab, e) { if (e) e.preventDefault(); this.setState({ tab }); '
     'if (tab === "meanwhile") this.warmShelves(); this.syncHash(tab); }'),
    ('  componentDidMount() {\n    this.loadTasks();',
     '  componentDidMount() {\n'
     '    window.addEventListener("popstate", this.onHash);\n'
     '    setTimeout(this.onHash, 0);\n'
     '    requestAnimationFrame(() => this.setState({ heroReady: true }));\n'
     '    this.loadTasks();'),
    ('window.removeEventListener("resize", this.onResize); }',
     'window.removeEventListener("resize", this.onResize); '
     'window.removeEventListener("popstate", this.onHash); }'),
    ('    const mob = s.vw < 760;\n',
     '    const mob = s.vw < 760;\n    this.navIds = tabDefs.map(t => t[0]);\n'),
    ('      works: this.worksList.map((w, i) => ({',
     '      heroSub: "CS + Math at UChicago. Building Gemini Enterprise Agents at Google.",\n'
     '      heroSubFont: mob ? "15px" : "17px",\n'
     '      works: this.worksList.map((w, i) => ({'),
    # Genre switch: warm that shelf immediately.
    ('pick: () => { if (s.genre !== id) this.setState({ genre: id, shelfHov: -1, shelfLast: undefined }); },',
     'pick: () => { if (s.genre !== id) { this.preloadCovers(id); '
     'this.setState({ genre: id, shelfHov: -1, shelfLast: undefined }); } },'),
    # Gallery photos: see photoSrc().
    ('React.createElement("img", { key: p.src, src: p.src, alt: p.cap, loading: "eager",',
     'React.createElement("img", { key: p.src, src: this.photoSrc(i), alt: p.cap, loading: "eager",'),
    # "Hover" means nothing on a phone, and the empty placeholder tile took a
    # screenful above the shelf there.
    ('shelfHint: s.shelfLast === undefined ? "HOVER A SPINE" : "",',
     'shelfHint: s.shelfLast === undefined ? (this.touchUI ? "TAP" : "HOVER") + " A SPINE" : "",'),
    ('if (s.shelfLast === undefined) return React.createElement("div", { style: Object.assign({}, base,',
     'if (s.shelfLast === undefined) return mob ? null : React.createElement("div", { style: Object.assign({}, base,'),
    ('"HOVER A SPINE"));',
     '(this.touchUI ? "TAP" : "HOVER") + " A SPINE"));'),
    # Never claim a message was sent when it went nowhere.
    ('    if (endpoint) fetch(endpoint, { method: "POST", body: data, headers: { Accept: "application/json" } })'
     '.catch(() => {});\n    this.setState({ sent: true });',
     '    // [build.py] With no endpoint, or if the POST fails, hand the note to the\n'
     '    // visitor’s mail app instead of silently dropping it.\n'
     '    const mail = () => { location.href = "mailto:' + EMAIL + '?subject=" + '
     'encodeURIComponent("Note from darylecheazu.me") + "&body=" + '
     'encodeURIComponent(String(data.get("message") || "")); this.setState({ sent: true }); };\n'
     '    if (!endpoint) { mail(); return; }\n'
     '    fetch(endpoint, { method: "POST", body: data, headers: { Accept: "application/json" } })\n'
     '      .then(r => { if (!r.ok) throw new Error("http " + r.status); this.setState({ sent: true }); })\n'
     '      .catch(mail);'),
    # Computed for a label that is never shown; the TickTick token it keyed on
    # must never be filled in (it would ship in the public bundle).
    ('      tasksSource: this.props.ticktickToken ? "TICKTICK · LIVE" : "TICKTICK · SAMPLE",\n', ''),
]

# ── Markup: headings, landmarks, keyboard access, contrast ───────────────────
MARKUP = [
    # Plain wording in the nav: shouted caps were half of the template look.
    ('["meanwhile", "ABOUT"], ["work", "EXPERIENCE"]', '["meanwhile", "About"], ["work", "Experience"]'),
    ('font-size: {{ navNameFont }};">DARYL ECHEAZU</a>', 'font-size: {{ navNameFont }};">Daryl Echeazu</a>'),
    ('fontFamily: "\'Geist Mono\', monospace", fontSize: "9px", letterSpacing: "0.22em"',
     'fontFamily: "\'Newsreader\', Georgia, serif", fontSize: "12px", letterSpacing: "0.04em"'),
    ('<span style="font-family: \'Instrument Serif\', Georgia, serif; font-size: clamp(34px, 4vw, 48px);">'
     'Selected Work</span>',
     '<h2 style="font-family: \'Instrument Serif\', Georgia, serif; font-weight: 400; '
     'font-size: clamp(34px, 4vw, 48px); margin: 0; line-height: inherit;">Selected Work</h2>'),
    ('<div style="font-family: \'Instrument Serif\', Georgia, serif; font-size: clamp(34px, 4vw, 48px);">'
     'The Stacks</div>',
     '<h2 style="font-family: \'Instrument Serif\', Georgia, serif; font-weight: 400; '
     'font-size: clamp(34px, 4vw, 48px); margin: 0; line-height: inherit;">The Stacks</h2>'),
    ('<div style="font-family: \'Instrument Serif\', Georgia, serif; font-size: clamp(34px, 4vw, 48px);">'
     'Recently</div>',
     '<h2 style="font-family: \'Instrument Serif\', Georgia, serif; font-weight: 400; '
     'font-size: clamp(34px, 4vw, 48px); margin: 0; line-height: inherit;">Recently</h2>'),
    ('<div style="position: absolute; top: 0; left: 0; right: 0; z-index: 20;',
     '<div role="navigation" aria-label="Primary" style="position: absolute; top: 0; left: 0; right: 0; z-index: 20;'),
    # Spines, desktop icons and dock items were mouse-only.
    ('<div sc-camel-on-mouse-enter="{{ b.enter }}" sc-camel-on-mouse-leave="{{ b.leave }}" '
     'sc-camel-on-click="{{ b.enter }}" title="{{ b.title }}"',
     '<div tabindex="0" role="button" sc-camel-on-mouse-enter="{{ b.enter }}" '
     'sc-camel-on-mouse-leave="{{ b.leave }}" sc-camel-on-click="{{ b.enter }}" '
     'sc-camel-on-focus="{{ b.enter }}" sc-camel-on-blur="{{ b.leave }}" title="{{ b.title }}"'),
    ('<div sc-camel-on-click="{{ ic.open }}" title="{{ ic.label }}"',
     '<div tabindex="0" role="button" sc-camel-on-click="{{ ic.open }}" title="{{ ic.label }}"'),
    ('<div sc-camel-on-click="{{ d.open }}" title="{{ d.label }}"',
     '<div tabindex="0" role="button" sc-camel-on-click="{{ d.open }}" title="{{ d.label }}"'),
    # Small grey labels below 4.5:1 at 9-11px.
    ('<span style="color: oklch(0.40 0.005 260);">{{ photoCount }}</span>',
     '<span style="color: oklch(0.62 0.005 260);">{{ photoCount }}</span>'),
    ('color: oklch(0.50 0.005 260);">{{ shelfHint }}</span>',
     'color: oklch(0.64 0.005 260);">{{ shelfHint }}</span>'),
    # DarylOS menu bar: the tagline ran straight into the clock on phones.
    ('<span style="font-variant-numeric: tabular-nums; white-space: nowrap; flex-shrink: 0;">CHI — {{ liveClock }}</span>',
     '<span style="font-variant-numeric: tabular-nums; white-space: nowrap; flex-shrink: 0; padding-left: 14px;">'
     'CHI — {{ liveClock }}</span>'),
    # The Spotify iframe's literal src="{{ spotifySrc }}" was fetched as a URL
    # (a 404) before the runtime bound it. sc-camel-src binds the same prop
    # without giving the browser anything to fetch first.
    ('<iframe title="Now playing" src="{{ spotifySrc }}"',
     '<iframe title="Now playing" sc-camel-src="{{ spotifySrc }}"'),
    # Phone nav labels at 10.5px were below the 12px legibility floor (with
    # the 1.12 phone zoom, 11.5px renders ~12.9px).
    ('navFont: mob ? "10.5px" : "14px",', 'navFont: mob ? "11.5px" : "14px",'),
    # Fonts are self-hosted; nothing is fetched from Google.
    ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
     '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">\n', ''),
]

LABEL_FROM = "font-family: 'Geist Mono', monospace"
LABEL_TO = "font-family: 'Newsreader', Georgia, serif"
LABEL_SCALE = 1.35

# Added to markup that build.py's DARYLOS "titlebar contents" patch writes;
# build.py strips it before checking whether that patch is already applied.
CLOSE_ATTRS = 'role="button" tabindex="0" aria-label="Close window" '
CLOSE_ATTRS_ESCAPED = CLOSE_ATTRS.replace('"', '\\"')

EXTRA_CSS_ANCHOR = "\n</style>\n</helmet>"
EXTRA_CSS = '''
  /* [build.py] content_patches: phones get 44px tap targets on the icon row
     and DarylOS window controls without moving anything (padding offset by
     an equal negative margin). */
  @media (max-width: 760px) {
    a[title="LinkedIn"], a[title="Email"], a[title="GitHub"], a[title="Instagram"], a[title="Spotify"] {
      padding: 12px !important; margin: -12px !important;
    }
    span[aria-label="Close window"] { padding: 12px !important; margin: -12px !important; }
  }
  /* With GITHUB added, the hero's link row reaches the photo caption on
     narrow phones; the caption repeats in the About gallery, so drop it. */
  @media (max-width: 480px) {
    div[style*='left: 40px; bottom: 44px'] { display: none !important; }
  }
  /* Three tabs fit on a narrow phone at a readable size; build.py's phone-nav
     rule was tuned to squeeze four. Overrides it by coming later. */
  @media (max-width: 400px) {
    div[style*='z-index: 20'] { font-size: 11.5px !important; }
  }
  /* build.py's Experience gold marks every name NOT at oklch(0.36 as the
     selected one; the unselected colour is now 0.56, so keep those plain. */
  [style*='clamp(38px, 4.6vw, 58px)'][style*='oklch(0.56'] { -webkit-text-fill-color: currentColor; }
  /* Spines are focusable now; show where focus is. */
  div[role="button"][title]:focus-visible { outline: 2px solid oklch(0.78 0.14 78); outline-offset: 3px; }'''


# Wide-viewport zoom, only where calc() can divide by a length (see ZOOM_TO
# in build.py). Elsewhere --z stays 1: the 1280px layout, unscaled.
ZOOM_CSS = """
  /* [build.py] content_patches: wide-screen zoom, where supported. */
  @supports (width: calc(100vw / 1280px * 1px)) {
    [style*='--z: 1; zoom: var(--z)'] { --z: clamp(1, calc(100vw / 1280px), 1.35) !important; }
  }"""


def apply(text, hero_uuid=None, hero_srcset=None, covers_dir=None, social_image=None):
    """Patch the decoded template. Returns (text, Patcher) for reporting."""
    p = Patcher(text)
    p.subs("copy", COPY)
    p.resub("headline words", r'rotWords = \[[^\]]*\];',
            "rotWords = %s;" % json.dumps(ROT_WORDS, ensure_ascii=False),
            "rotWords = %s;" % json.dumps(ROT_WORDS, ensure_ascii=False))
    p.subs("hero", HERO)
    p.subs("experience", EXPERIENCE)
    p.sub("methods", METHODS_ANCHOR, METHODS + METHODS_ANCHOR)
    p.subs("logic", LOGIC)
    p.subs("markup", MARKUP)
    # The window close control is a <span>; give it a role, focus and a name.
    p.resub("close buttons", r'<span (sc-camel-on-click="\{\{ w\.close \}\}")',
            r'<span ' + CLOSE_ATTRS + r'\1', CLOSE_ATTRS + 'sc-camel-on-click')
    if ZOOM_CSS in p.text:
        p.already.append("zoom css")
    else:
        p.sub("zoom css", EXTRA_CSS_ANCHOR, ZOOM_CSS + EXTRA_CSS_ANCHOR)
    # build.py's own CSS goes in at the same anchor, so check for the block
    # itself rather than block-plus-anchor.
    if EXTRA_CSS in p.text:
        p.already.append("extra css")
    else:
        p.sub("extra css", EXTRA_CSS_ANCHOR, EXTRA_CSS + EXTRA_CSS_ANCHOR)

    # Labels: the tracked-out Geist Mono caps (nav, dates, tags, captions)
    # read as an AI template. On the main pages they become upright
    # Newsreader — the body face — 35% larger, with near-normal spacing.
    # DarylOS (from its sc-if on) keeps its mono: it is meant to look like a
    # computer. Picked in the font lab, Oct 2026.
    end = p.text.find('<sc-if value="{{ isLive }}"')
    if end < 0:
        p.problems.append("labels: DarylOS section not found")
    else:
        changed = [0]

        def to_serif(m):
            st = m.group(1)
            if LABEL_FROM not in st:
                return m.group(0)
            st = st.replace(LABEL_FROM, LABEL_TO)
            # Labels clipped to a fixed box (the spine volume tags) don't grow:
            # they get slightly smaller with no tracking so "SHIPPUDEN" fits.
            fitted = "overflow: hidden" in st and "white-space: nowrap" in st
            st = st if fitted else re.sub(r'font-size: ([\d.]+)px', lambda f: "font-size: %spx" % (
                ("%.2f" % (float(f.group(1)) * LABEL_SCALE)).rstrip("0").rstrip(".")), st)
            st = re.sub(r'letter-spacing: [^;"]+', "letter-spacing: %s" % ("0" if fitted else "0.015em"), st)
            if fitted:
                st = re.sub(r'font-size: ([\d.]+)px', lambda f: "font-size: %spx" % (
                    ("%.2f" % (float(f.group(1)) * 0.84)).rstrip("0").rstrip(".")), st)
            changed[0] += 1
            return 'style="%s"' % st
        head = re.sub(r'style="([^"]*)"', to_serif, p.text[:end])
        p.text = head + p.text[end:]
        (p.applied if changed[0] else p.already).append(
            "serif labels" + (" (%d)" % changed[0] if changed[0] else ""))

    # Mono labels (dates, tags, captions) at 0.55 were 4.15:1 — under 4.5 at
    # 10-11px. Every use is a small label, so lift them all.
    n = p.text.count("oklch(0.55 0.005 260)")
    if n:
        p.text = p.text.replace("oklch(0.55 0.005 260)", "oklch(0.63 0.005 260)")
        p.applied.append("label contrast (%d)" % n)
    elif "oklch(0.63 0.005 260)" in p.text:
        p.already.append("label contrast")
    else:
        p.problems.append("label contrast: colour not found")

    # Search engines index the rendered page, whose <head> is this template's:
    # give it the description, canonical, an absolute og:image and JSON-LD.
    if social_image:
        seo = ('<meta property="og:image" content="%s">\n'
               '<meta name="description" content="%s">\n'
               '<link rel="canonical" href="%s/">\n'
               '<meta property="og:url" content="%s/">\n'
               '<script type="application/ld+json">%s</script>'
               % (social_image, DESCRIPTION, SITE_URL, SITE_URL, person_jsonld()))
        if '<script type="application/ld+json">' in p.text:
            # Rebuild: refresh the block in case the copy changed.
            p.text, k = re.subn(r'<meta property="og:image" content="%s">.*?</script>' % re.escape(social_image),
                                lambda m: seo, p.text, count=1, flags=re.S)
            p.already.append("template seo")
        else:
            p.resub("template seo", r'<meta property="og:image" content="[^"]*">', lambda m: seo,
                    '<script type="application/ld+json">')

    # Images in the template markup load the moment the bundle is swapped
    # into the page, on every tab: the DarylOS wallpaper (the full hero JPEG)
    # and its Mirror Lake photo downloaded on every visit to the home page.
    # sc-camel-src hands the URL to React instead, so an image loads only
    # when its tab actually renders.
    p.text, k = re.subn(r'<img src="([0-9a-f-]{36})"', r'<img sc-camel-src="\1"', p.text)
    (p.applied if k else p.already).append("lazy template images" + (" (%d)" % k if k else ""))

    # Hero: serve a size that fits the screen (WebP, 828/1280/1920) instead of
    # the full JPEG to every device. The runtime paints a static preview of
    # the home view while it swaps the page in — when there is briefly no
    # viewport meta — and applies literal attributes right then, so phones
    # chose from srcset as if 980px wide and fetched the 1920px file. Bound
    # values ({{ heroSrc }}) can't resolve in that preview; React fills them
    # in after mount (heroReady), against the real viewport. The outer-head
    # preload, with the same imagesrcset, still starts the download early.
    if hero_uuid and hero_srcset:
        attrs = (' sc-camel-src-set="{{ heroSrcset }}" sizes="100vw" fetchpriority="high" aria-hidden="true"')
        want = '<img sc-camel-src="{{ heroSrc }}"%s' % attrs
        p.sub("hero bindings", "      heroSub: ",
              '      heroSrc: s.heroReady ? "%s" : undefined,\n'
              '      heroSrcset: s.heroReady ? "%s" : undefined,\n'
              '      heroSub: ' % (hero_uuid, hero_srcset))
        if want in p.text:
            p.already.append("hero srcset")
        else:
            p.text, k = re.subn(
                r'<img sc-camel-src="%s"(?: (?:sc-camel-src-set|srcset)="[^"]*" sizes="100vw" '
                r'fetchpriority="high" aria-hidden="true")?(?= alt="" style="position: absolute; inset: 0;)'
                % re.escape(hero_uuid), lambda m: want, p.text, count=1)
            (p.applied if k else p.problems).append("hero srcset" if k else "hero srcset: hero <img> not found")
        # DarylOS wallpaper: same photo; reuse the 1920px WebP the hero cached.
        big = hero_srcset.split(", ")[-1].split(" ")[0]
        wall = '<img sc-camel-src="%s" alt="" style="display: {{ wallDisplay }};' % big
        if wall in p.text:
            p.already.append("wallpaper webp")
        else:
            p.sub("wallpaper webp", '<img sc-camel-src="%s" alt="" style="display: {{ wallDisplay }};' % hero_uuid, wall)

    # The Stacks: point every cover at covers/ (fetched by fetch_covers.py) and
    # replace the one-at-a-time Jikan lookups with a static map.
    if covers_dir and os.path.isdir(covers_dir):
        have = set(os.listdir(covers_dir))

        def local_isbn(m):
            name = "isbn-%s.webp" % m.group(1)
            return "covers/" + name if name in have else m.group(0)
        p.text, k = re.subn(r'https://covers\.openlibrary\.org/b/isbn/(\d+)-L\.jpg', local_isbn, p.text)
        if k:
            p.applied.append("book covers local (%d)" % k)

        mal = re.search(r'shelfMalIds = (\{.*?\});', p.text)
        if mal:
            pairs = re.findall(r'"((?:[^"\\]|\\.)*)":\s*(\d+)', mal.group(1))
            cover_map = {t: "covers/mal-%s.webp" % i for t, i in pairs if "mal-%s.webp" % i in have}
            missing = [t for t, i in pairs if "mal-%s.webp" % i not in have]
            if missing:
                p.problems.append("anime covers missing locally (run fetch_covers.py): %s" % ", ".join(missing))
            block = "  shelfCovers = %s;\n\n" % json.dumps(cover_map, ensure_ascii=False)
            new_load = (
                "  loadCovers() {\n"
                "    // [build.py] Covers are served from covers/ (see fetch_covers.py):\n"
                "    // nothing to look up. warmShelves() preloads them when About opens.\n"
                "    this.setState({ covers: this.shelfCovers });\n"
                "  }\n\n")
            if "  shelfCovers = " in p.text:
                p.text = re.sub(r'  shelfCovers = \{.*?\};\n\n', lambda m: block, p.text, count=1, flags=re.S)
                p.already.append("anime covers map")
            else:
                p.resub("anime covers map", r'  loadCovers\(\) \{.*?\n  \}\n\n(?=  rotWords)',
                        lambda m: block + new_load, "  shelfCovers = ")
        else:
            p.problems.append("anime covers: shelfMalIds not found")

    return p.text, p
