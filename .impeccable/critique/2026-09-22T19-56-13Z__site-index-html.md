---
target: critique (homepage)
total_score: 19
max_score: 32
na_heuristics: 7,10
p0_count: 1
p1_count: 2
timestamp: 2026-09-22T19-56-13Z
slug: site-index-html
---
# Critique: site/index.html (Bluebird Bakery)
Method: dual-agent (A: design review · B: detector/browser)

## Heuristics (19/32, n/a: 7, 10) — Acceptable
1 Status 3 · 2 Real world 3 · 3 Control 2 · 4 Consistency 2 · 5 Error prevention 1 · 6 Recognition 3 · 7 n/a · 8 Minimalism 3 · 9 Recovery 2 · 10 n/a

## Specificity
Content is Bluebird-specific; visual system is generic (l-objet-derived monochrome, Barlow Condensed caps, Jost labels). Badge colours confined to footer/seal. Detector: CLI clean; browser overlay 6 hits (3 low-contrast over scrimmed photos, 3 all-caps labels), all false positives.

## Priority issues
- [P0] Contact form renders despite `hidden` (styles.css:175 `form{display:grid}` beats [hidden]); no handler attached with empty endpoint (today.js:41); submits GET to page, putting name/email/message in URL. Fix: `[hidden]{display:none!important}`; drop form until endpoint exists.
- [P1] Bread schedule breaks: mobile names run together (`.week br{display:none}` styles.css:217); at 1024px WEDNESDAY overflows its column. Fix: per-bread spans / stack below ~1200px.
- [P1] Hours/directions buried at page end (~11k of 13.9k px on mobile); top-bar address not a link; no persistent Call/Directions. Fix: link address, sticky mobile action bar or move Visit up.
- [P2] Generic visual system; H1 "Baked every morning" interchangeable. Fix: bring badge blue into Today cell/CTAs; use the "bluebird day" origin.
- [P2] Menu density (11 pastry, 11 kitchen, 9 teas, 12 partners, all expanded). Fix: split kitchen, <details> for teas/add-ons, partners as a sentence/strip.

## Persona red flags
Jordan: hero never says you can eat in; will use the dead form. Riley: dead form incl. no-JS; no holiday override; bird imports from ../../sandbox. Casey: directions at ~11k px; social links 24px tall; H1 at ~570px on mobile; two fetchpriority=high images.

## Minor
Bird perches cover "Baguette $5" and "3" in "8 TO 3"; rack-loaves photo soft on retina; 20+ perches may over-animate; duplicate badge alt; price format inconsistent ($10 vs 2.50); phone styled 3 ways; "Add .75" cryptic; 11px caps utility bar.

## Questions
Why is the bird the only colour when the badge has a palette? What does "Baked every morning" say that Safeway can't? Is the page for deciders or people on the way? Should the form exist before an endpoint does?
