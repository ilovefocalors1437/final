#!/usr/bin/env python3
"""Bundle the whole app into one self-contained index.html.

The multi-file version is nicer to edit, but it only works if every file under
assets/ actually reaches the host — and uploading a folder through the GitHub web
UI quietly drops things. This build inlines the CSS, the JS, the fonts and the
images as data URIs, so the result is a single file with **zero sub-requests**:
if the page loads at all, it is complete.

    python build_standalone.py

Writes standalone/index.html. Upload that one file and nothing else.
Re-run it after editing anything under assets/.
"""

import base64
import io
import os
import re
import shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(ROOT, "standalone")

MIME = {
    ".woff2": "font/woff2",
    ".otf": "font/otf",
    ".webp": "image/webp",
    ".png": "image/png",
}


def read(rel):
    with io.open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()


def data_uri(rel):
    path = os.path.join(ROOT, rel)
    ext = os.path.splitext(path)[1].lower()
    with open(path, "rb") as f:
        blob = base64.b64encode(f.read()).decode("ascii")
    return "data:%s;base64,%s" % (MIME.get(ext, "application/octet-stream"), blob)


def inline_css_urls(css, base_rel):
    """Replace every url(...) in a stylesheet with a data: URI."""
    def sub(m):
        ref = m.group(1).strip("'\"")
        if ref.startswith(("data:", "http")):
            return m.group(0)
        rel = os.path.normpath(os.path.join(base_rel, ref)).replace(os.sep, "/")
        return 'url("%s")' % data_uri(rel)
    return re.sub(r'url\(([^)]+)\)', sub, css)


def main():
    html = read("index.html")

    # Drop the .otf fallback: every browser that can run this app reads woff2,
    # and the otf would only bloat the bundle.
    app_css = read("assets/css/app.css")
    app_css = re.sub(r',\s*\n\s*url\("\.\./fonts/Osiris\.otf"\) format\("opentype"\)', '', app_css)

    css = inline_css_urls(read("assets/css/fonts.css"), "assets/css") + "\n" \
        + inline_css_urls(app_css, "assets/css")

    js = read("assets/js/jsqr.js") + "\n;\n" + read("assets/js/app.js")
    # The card images are referenced from JS as plain paths.
    for rel in ("assets/img/card-scan.webp", "assets/img/card-progress.webp"):
        js = js.replace("'%s'" % rel, "'%s'" % data_uri(rel))

    # Swap the external references for inline blocks. The links carry a
    # ?v=<hash> cache stamp from stamp_assets.py, so match them loosely.
    html = re.sub(
        r'<link rel="stylesheet" href="assets/css/fonts\.css[^"]*"\s*/>\s*'
        r'<link rel="stylesheet" href="assets/css/app\.css[^"]*"\s*/>',
        lambda _m: "<style>\n%s\n</style>" % css, html, count=1)
    html = re.sub(
        r'<script src="assets/js/jsqr\.js[^"]*"></script>\s*'
        r'<script src="assets/js/app\.js[^"]*"></script>',
        lambda _m: "<script>\n%s\n</script>" % js, html, count=1)
    html = html.replace('<link rel="icon" href="assets/img/card-progress.webp" />',
                        '<link rel="icon" href="%s" />' % data_uri("assets/img/card-progress.webp"))

    # posters sit in the markup as <img src="assets/img/...">; inline them too
    for rel in re.findall(r'<img src="(assets/img/[^"]+)"', html):
        html = html.replace('"%s"' % rel, '"%s"' % data_uri(rel))
    for rel in re.findall(r'data-poster="(assets/img/[^"]+)"', html):
        # the button attribute is now redundant — the <img> carries the source
        html = html.replace(' data-poster="%s"' % rel, '')

    leftover = re.findall(r'(?:src|href)="(assets/[^"]+)"', html)
    if leftover:
        raise SystemExit("still referencing external files: %s" % leftover)

    if os.path.isdir(OUT_DIR):
        shutil.rmtree(OUT_DIR)
    os.makedirs(OUT_DIR)
    with io.open(os.path.join(OUT_DIR, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)
    # GitHub Pages runs Jekyll unless told not to.
    open(os.path.join(OUT_DIR, ".nojekyll"), "wb").close()

    size = os.path.getsize(os.path.join(OUT_DIR, "index.html"))
    print("standalone/index.html  %.0f KB  (0 sub-requests)" % (size / 1024))


if __name__ == "__main__":
    main()
