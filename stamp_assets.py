#!/usr/bin/env python3
"""Stamp a content hash onto the CSS/JS links in index.html.

GitHub Pages serves assets with a short cache header, but browsers hold onto
them longer than that — a phone that opened the site yesterday can keep running
yesterday's app.js even though the server has a newer one. That was observed
live: fetching the URL returned the new file while the page kept executing the
old one.

Adding `?v=<hash of the file>` changes the URL whenever the file changes, so a
returning visitor is guaranteed to pull the new copy, while an unchanged file
still hits the cache normally.

    python stamp_assets.py      # run after editing anything under assets/

Safe to run repeatedly; it rewrites the existing stamp rather than stacking.
"""

import hashlib
import io
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(ROOT, "index.html")

# only the files the browser executes — images are content-addressed enough by
# their own names, and restamping them would bloat the diff on every build
TARGETS = ("assets/css/fonts.css", "assets/css/app.css",
           "assets/js/jsqr.js", "assets/js/app.js")


def short_hash(rel):
    with open(os.path.join(ROOT, rel), "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()[:8]


def main():
    html = io.open(INDEX, encoding="utf-8").read()
    changed = []

    for rel in TARGETS:
        h = short_hash(rel)
        # match the path with or without an existing ?v=
        pattern = re.compile(r'(["\'])' + re.escape(rel) + r'(?:\?v=[0-9a-f]+)?\1')
        new = r'\g<1>' + rel + "?v=" + h + r'\g<1>'
        html, n = pattern.subn(new, html)
        if n:
            changed.append("%-22s v=%s  (%d ref%s)" % (rel, h, n, "" if n == 1 else "s"))
        else:
            print("  !! not referenced in index.html: %s" % rel)

    io.open(INDEX, "w", encoding="utf-8").write(html)
    for line in changed:
        print("  " + line)
    print("stamped %d files" % len(changed))


if __name__ == "__main__":
    main()
