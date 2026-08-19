# Wunvit Stamp Book — context

Working context for this project. Written before implementation so the build has a
single source of truth. Read this first before touching anything.

---

## 1. What this is

A phone-first web app for a science-week walk-rally. A kid walks between physical
bases (ฐาน), each base has a printed QR code. They scan it in the app; if the payload
matches a known base, that base gets stamped in their book. Goal: collect all bases.

Not a scoring system, not an account system. One device = one stamp book.

## 2. Hard requirements (from the brief)

1. Landing page title **"Stamp Book"** in the **Osiris** font. Rest is free.
2. Landing design follows `C:\Users\LENOVO\Desktop\Basic Python\MentoScope` —
   its `frontend/src/pages/Landing.jsx` + `frontend/src/styles.css`.
3. The provided 16:9 image is the landing background, with a **black overlay** over
   the whole page — transparent enough that the art still reads, opaque enough that
   the title and cards are unambiguously legible. Not visually noisy.
4. **Two** cards (the reference has three):
   - **"Scan QR code"** — scan, match id → advance progress; no match → ask to rescan.
     Needs camera **zoom** (kids stand near and far). Uses `image/scan qr code card.png`.
   - **"My Progress"** — how many stamps collected so far. Uses `image/stampbook.png`.
5. All seven ids must be collected, **no duplicates**. Progress **saved per device**
   so a dropped connection doesn't wipe anything.
6. A given QR belongs to exactly one base — it can never satisfy a different base.
7. Everything lives in `C:\Users\LENOVO\Desktop\Basic Python\Wunvit stampbook`.
8. Language: **Thai** everywhere except where English is explicitly asked for
   (the "Stamp Book" title, "Scan QR code", "My Progress"). Osiris is **latin-only** —
   it must never be applied to Thai text.
9. The post-card screens follow the reference's visual language too.

## 3. The bases

QR payloads verified by decoding `qr code/*.png` with OpenCV — the decoded string is
exactly the filename stem, e.g. `health_qrcode`.

| QR payload             | Thai base name             |
| ---------------------- | -------------------------- |
| `food_qrcode`          | ฐานอาหาร                    |
| `health_qrcode`        | ฐานสุขภาพการแพทย์            |
| `energy_qrcode`        | ฐานพลังงานและวัสดุ            |
| `environment_qrcode`   | ฐานสิ่งแวดล้อม               |
| `agriculture_qrcode`   | ฐานการเกษตร                 |
| `space_qrcode`         | ฐานเทคโนโลยีอวกาศ            |
| `travel_qrcode`        | ฐานการเดินทางและขนส่ง ⚠️     |

⚠️ **Open assumption.** The brief lists six Thai base names but seven QR codes exist;
`travel_qrcode` has no given Thai name, so it is filled in as *ฐานการเดินทางและขนส่ง*.
It is a one-line edit in the `BASES` array in `assets/js/app.js` — change `name` there
and nothing else moves.

Matching rule: payload → base is a **1:1 lookup**. A payload that isn't in the table is
rejected outright. A payload whose base is already stamped is reported as a duplicate
and changes nothing. There is no fuzzy matching and no shared credit between bases.

## 4. Stack decision

**Static site, no build step.** Plain HTML + CSS + JS, hash-routed, everything vendored.

Why not React/Vite like MentoScope: this has to run on a stranger's phone at a venue
whose wifi may be bad. No build, no CDN, no npm install → drop the folder on any static
host (or a laptop on the LAN) and it works. Offline-safe by construction.

Vendored, nothing loaded from a CDN at runtime:

- `assets/js/jsqr.js` — jsQR 1.4.0, the QR decode fallback.
- `assets/fonts/Osiris.woff2|otf` — copied from MentoScope, latin display face.
- `assets/fonts/IBMPlexSansThai-*.woff2` — Thai + latin UI/body face.
- `assets/fonts/IBMPlexMono-*.woff2` — latin only; kickers, counters, readouts.

## 5. Layout of the folder

```
Wunvit stampbook/
  context.md          <- this file
  README.md           <- how to run it at the event
  serve.py            <- LAN dev server (HTTPS, so phones get camera access)
  index.html          <- the whole app: 3 views, hash-routed
  assets/
    css/fonts.css     <- generated @font-face blocks, local urls
    css/app.css       <- design system + all three views
    js/app.js         <- state, router, scanner, progress
    js/jsqr.js        <- vendored
    fonts/…
    img/bg-landing.webp, card-scan.webp, card-progress.webp
  image/              <- the originals the brief provided (untouched)
  qr code/            <- the printable QR codes (untouched)
```

## 6. Design system

Taken from MentoScope's tokens, hue-shifted to sit on the provided artwork (which is a
deep navy-teal, not MentoScope's graphite). Same structure: surfaces → ink ramp →
one reserved accent → tokens for space/radius/easing.

- Surfaces: deep navy-teal, never pure black.
- Ink: warm off-white ramp, never pure white.
- Accent: the cyan already present in the artwork's "SCAN ME" frame and the book's
  check mark. Reserved for interactive elements and the stamped state. Not decorative.
- One success tone (stamped) and one warning tone (wrong / duplicate code).
- Type: **Osiris** display (latin only, the wordmark), **IBM Plex Sans Thai** for
  everything readable, **IBM Plex Mono** for kickers, counters and status readouts.
- Motion: 150–440ms, ease-out only, no bounce; full `prefers-reduced-motion` fallbacks.

### Landing

The reference's orbital hero, ported to vanilla JS: a 3D ring of panels rotating around
the centered wordmark, drag / wheel to spin, momentum, slow auto-drift, mouse parallax
tilt, drag-vs-click threshold so a spin doesn't navigate.

Two card types, but a 2-panel ring reads sparse — so **six panels, alternating the two
types three times each**, exactly the trick the reference uses (it shows 3 destinations
across 6 panels).

The background image sits fixed behind everything under a black overlay
(`~0.62` alpha plus a slight vignette). Cards keep their own scrim so their captions
stay readable regardless of what's behind them.

### Scan view

Card art frames the live camera: a viewport with the reticle brackets from the
reference, camera underneath, dashed target box, status line under it. Controls are a
zoom slider and a torch toggle where the device exposes one.

### Progress view

A vertical list of the seven bases. Each row: index, Thai name, and a **check mark that
appears on the right of the name when stamped** — literally what the brief asked for
("ขึ้นติ๊กถูกหลังคำว่า ฐานสุขภาพ"). A ring counter at the top shows `n / 7`.
Completing all seven promotes the header to a done state.

## 7. Scanning

Two decoders, picked at runtime:

1. `BarcodeDetector` when the browser has it (Android Chrome) — native, fast, handles
   tilt and low light better.
2. `jsQR` on a canvas otherwise (iOS Safari, desktop Firefox).

Zoom, two paths:

1. **Optical/native** — if the camera track reports a `zoom` capability, drive it with
   `applyConstraints`. The slider follows the track's real min/max/step.
2. **Digital fallback** — CSS-scale the video for display *and* decode from the matching
   centre crop, so zooming genuinely enlarges the QR the decoder sees rather than just
   the picture the kid sees. This is the part that makes a far-away code readable.

Scan loop is throttled with `requestAnimationFrame`; the camera is stopped whenever the
view is left so the phone doesn't cook in a pocket.

Outcomes, each with its own state, colour and message:

- **new** → stamp it, save, show which base, success tone.
- **duplicate** → already stamped, say so, change nothing.
- **unknown** → not one of our codes, ask to scan again.

After a decode the loop pauses briefly so one code can't fire twice in a frame burst.

## 8. Persistence

`localStorage`, key `wunvit_stampbook_v1`:

```json
{ "v": 1, "stamps": { "health_qrcode": "2026-08-19T12:00:00.000Z" } }
```

Keyed by QR payload, value is the collection timestamp. Per device, survives reloads
and offline. Writes are wrapped — a private-mode browser that throws on `setItem` must
degrade to in-memory rather than break the app. A reset lives on the progress screen
behind a confirm, so a booth volunteer can hand the phone to the next kid.

## 9. Camera & serving

`getUserMedia` needs a secure context. `http://localhost` counts; a bare LAN IP does
not. So for phones on the venue LAN, `serve.py` serves over HTTPS with a self-signed
cert (kids tap through the warning once), or the folder gets deployed to any static
host with real TLS. This is written up in `README.md` — it is the single most likely
thing to go wrong on the day.

## 10. Copy the user changed mid-build

- Landing eyebrow: `WUNVIT · WALK RALLY` -> **`spsm ● 2026`** (kept lowercase as given).
- Landing bottom tag: `เลือกการ์ดของคุณ` -> **`วันวิทย์68`**. It stopped being an
  instruction and became a brand mark, and the orbiting cards sweep through that
  corner, so it now carries its own pill background instead of relying on the
  scrim behind it.

## 11. What was verified, and how

Chrome's fake capture device (`--use-file-for-fake-video-capture`) was fed y4m
clips built from the **actual printed QR files** in `qr code/`, and the app was
driven over CDP. That exercises the real path — getUserMedia, the decode loop,
the crop, the matcher, localStorage — not a re-implementation of it.

- A real `health_qrcode` clip stamps ฐานสุขภาพการแพทย์ and moves the meter to 1/7.
- Re-showing the same code reports a duplicate and does not increment.
- A foreign QR (a line.me URL) is rejected and writes nothing to storage.
- Relaunching the browser against the same profile keeps the stamp — this is the
  "เน็ตหลุดแล้ว progress ไม่หาย" requirement, and it never touches a server.
- Size sweep on a 1280x720 stream: 70px QR fails, 100px and up reads. So the code
  needs to fill roughly 8% of frame width, about 4px per module.

Two findings that changed the code:

1. **Digital zoom cannot invent detail.** A 62px QR failed at both 1x and 3x. What
   digital zoom actually buys is aiming, plus avoiding the decode canvas downscale.
   Native track zoom is the path that genuinely extends reach, so it is preferred
   whenever the camera reports the capability.
2. The decode canvas was capped at 640px, which threw away real detail on a 1080p
   stream at 1x. Raised to 900 and the capture request to 1920x1080 ideal, with the
   decode rate eased to ~9/s so the jsQR fallback still keeps up.

Headless Chrome clamps its viewport to a 512px minimum, so CLI screenshots of
"390px mobile" actually render at 512 and crop. Phone-width layout was checked by
measuring geometry in a real browser instead.

## 12. Payload

The three provided PNGs were 4.1 MB, which is a slow first paint for a kid on
mobile data at a venue. Re-encoded to WebP at q86 they come to 129 KB with no
visible loss (they are flat vector-ish illustrations). Whole site is ~676 KB.
The untouched originals stay in `image/`.

## 13. Deployability

Target is GitHub Pages, so the checks that matter are the ones Windows hides:

- Every `src`/`href`/`url()` is **relative** — 22 references, 0 absolute. The app
  therefore runs at a domain root *and* under a project subpath.
- Filename case was compared against a real directory listing, not `os.path.exists`
  (Windows is case-insensitive, Pages runs on Linux). 0 mismatches. No served
  filename contains a space.
- `.nojekyll` added: Pages runs Jekyll by default and silently drops paths that
  begin with `_` or `.`.
- `.gitignore` keeps `.devcert.pem` / `.devkey.pem` out — `serve.py` writes a private
  key next to the source, and that must never reach a public repo. Verified by
  planting fake key files and confirming `git add .` skipped them.
- The exact tree `git` would publish was served under `/wunvit-stampbook/` and driven
  end to end with the fake camera: it decodes a real printed QR and stamps the right
  base with no console errors.

`serve.py` now defaults to plain **http on localhost**, which is already a secure
context, so local testing has no certificate warning at all. HTTPS is opt-in via
`--lan` and only needed to reach a phone over the wifi.

## 14. Done means

- Landing: Osiris "Stamp Book", background under a black overlay, ring of two card
  types, both navigate.
- Scanning any of the seven printed codes stamps exactly its own base; rescanning says
  duplicate; anything else says try again; zoom works near and far.
- Progress shows `n / 7` and a tick after each stamped base's Thai name.
- Reload / airplane mode does not lose progress.
- No Osiris on Thai glyphs anywhere.
