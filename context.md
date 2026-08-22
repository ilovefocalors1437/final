# Wunvit PASSPORT — context

Working context for this project. Written before implementation so the build has a
single source of truth. Read this first before touching anything.

---

## 1. What this is

A phone-first web app for a science-week walk-rally at SPSM. A student walks between
physical stations (ฐาน); each station has a printed QR code. They scan it in the app and
that station gets a stamp. Collect enough stamps in **both** groups and a teacher at the
central desk hands over a prize.

It replaces a paper passport, so it is not a scoring system and not an account system.
One device = one passport.

## 2. Hard requirements (from the brief)

1. Landing page title **"PASSPORT"** in the **Osiris** font. Rest is free.
2. Landing design follows `C:\Users\LENOVO\Desktop\Basic Python\MentoScope` —
   its `frontend/src/pages/Landing.jsx` + `frontend/src/styles.css`.
3. The provided 16:9 image is the landing background, with a **black overlay** over
   the whole page — transparent enough that the art still reads, opaque enough that
   the title and cards are unambiguously legible. Not visually noisy.
4. **Three** cards:
   - **"Scan QR code"** — scan, match id -> stamp it; no match -> ask to rescan.
     Needs camera **zoom** (students stand near and far). Art: `scan qr code card.png`.
   - **"My Progress"** — what's collected so far. Art: `stampbook.png`.
   - **"กติกาการรับรางวัล"** — the rules, plus the card a teacher inspects. Art: the
     treasure chest.
5. Stamps must be collected **without duplicates**, and progress **saved per device**
   so a dropped connection doesn't wipe anything.
6. A given QR belongs to exactly one station — it can never satisfy a different one.
   Both thresholds must be met independently before a prize is claimable.
7. A teacher must be able to see quickly that a claim is genuine (section 14).
8. No reset control in the app; "ครบถ้วน!" marks a complete passport instead.
9. Everything lives in `C:\Users\LENOVO\Desktop\Basic Python\Wunvit stampbook`.
10. Language: **Thai** everywhere except where English is explicitly asked for
   (the "PASSPORT" title and the card kickers). Osiris is **latin-only** — it must
   never be applied to Thai text.
11. The post-card screens follow the reference's visual language too.

## 3. The stations

Two groups, each with its own threshold, taken from the passport artwork:

| group | Thai label | stations | need |
| --- | --- | --- | --- |
| `major` | ฐานกิจกรรมวิชาเอก | 11 | **5** |
| `innovation` | ฐานนวัตกรรมและนิทรรศการแสดงผลงาน | 8 | **3** |

A student is eligible only when **both** thresholds are met. Every counter, meter,
rule sentence and the teacher card derive from the `GROUPS` array in
`assets/js/app.js` — change a `need` there and the whole app follows.

### ฐานกิจกรรมวิชาเอก (11)

`gh_qrcode` `gi_qrcode` `sg_qrcode` `sa_qrcode` `ht_qrcode` `hs_qrcode` `hp_qrcode`
`ha_qrcode` `da_qrcode` `hdci_qrcode` `spb_qrcode` — displayed as
*ฐานกิจกรรมวิชาเอก GH* and so on, with the code as a mono badge so eleven similar
rows stay scannable.

The passport prints this one across two lines ("HD / CI"); it is read here as a
single station **HDCI**. If it is really two, add a row and a QR — nothing else moves.

### ฐานนวัตกรรมและนิทรรศการแสดงผลงาน (8)

| QR payload | station |
| --- | --- |
| `space_qrcode` | ฐานนวัตกรรมด้านเทคโนโลยีและอวกาศ |
| `environment_qrcode` | ฐานนวัตกรรมด้านสิ่งแวดล้อม |
| `agriculture_qrcode` | ฐานนวัตกรรมด้านการเกษตร |
| `energy_qrcode` | ฐานนวัตกรรมด้านพลังงานและวัสดุ |
| `health_qrcode` | ฐานนวัตกรรมด้านสุขภาพและการแพทย์ |
| `travel_qrcode` | ฐานการท่องเที่ยว |
| `food_qrcode` | ฐานนวัตกรรมด้านอาหาร |
| `exhibition_qrcode` | นิทรรศการแสดงผลงาน |

`exhibition_qrcode` was **added** — the passport lists นิทรรศการแสดงผลงาน inside this
group, so it counts toward the 3, and no QR existed for it. Its code was generated
alongside the eleven major ones by `make_qr_codes.py`.

Matching rule: payload -> station is a **1:1 lookup**, case-insensitive. A payload
that isn't in the table is rejected outright. A payload whose station is already
stamped is reported as a duplicate and changes nothing. No fuzzy matching, no shared
credit between stations or groups.

## 4. Stack decision

**Static site, no build step.** Plain HTML + CSS + JS, hash-routed, everything vendored.

Why not React/Vite like MentoScope: this has to run on a stranger's phone at a venue
whose wifi may be bad. No build, no CDN, no npm install → drop the folder on any static
host (or a laptop on the LAN) and it works. Offline-safe by construction.

Vendored, nothing loaded from a CDN at runtime:

- `assets/js/jsqr.js` — jsQR 1.4.0, the QR decode fallback.
- `assets/fonts/Osiris.woff2|otf` — copied from MentoScope, latin display face.
- `assets/fonts/Archivo-*.woff2` — latin, everything that isn't the wordmark.
- `assets/fonts/Prompt-*.woff2` — Thai.

## 5. Layout of the folder

```
Wunvit stampbook/
  context.md          <- this file
  README.md           <- how to run it at the event
  serve.py            <- LAN dev server (HTTPS, so phones get camera access)
  index.html          <- the whole app: 4 views, hash-routed
  make_qr_codes.py    <- regenerates every station's printable QR
  build_standalone.py <- bundles everything into standalone/index.html
  assets/
    css/fonts.css     <- generated @font-face blocks, local urls
    css/app.css       <- design system + all four views
    js/app.js         <- stations, groups, storage, router, scanner, reward card
    js/jsqr.js        <- vendored
    fonts/…
    img/bg-landing.webp, card-scan.webp, card-progress.webp, card-reward.webp
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
- Type: **Osiris** display (latin only, the wordmark), **Archivo** for all other
  latin, **Prompt** for Thai.

  The user asked for Public Sans or Archivo. Both are **latin-only**, and this app is
  mostly Thai, so a wholesale swap would have dumped every Thai string onto a system
  fallback. The stacks therefore read `Archivo, "Prompt", …` — latin resolves
  to Archivo, Thai glyphs fall through to Prompt. Archivo over Public Sans because it
  has more character next to the geometric Osiris wordmark. Prompt was then picked from
  a shortlist the user supplied (Sarabun / IBM Plex Sans Thai / Prompt, with Chonburi
  struck out): it is loopless and geometric, which is the closest Thai analogue to what
  Osiris and Archivo are doing, where Sarabun's government-document neutrality would
  have read as a form rather than an event app. It is also the lightest of the three —
  ~13 KB per weight against Noto Sans Thai's ~27 KB.

  `--font-mono` survives as a token name for the readout role (kickers, counters,
  code badges) but no longer resolves to a monospace. Alignment now comes from
  `font-variant-numeric: tabular-nums` plus the fixed-width badge boxes.
- Motion: 150–440ms, ease-out only, no bounce; full `prefers-reduced-motion` fallbacks.

### Landing

The reference's orbital hero, ported to vanilla JS: a 3D ring of panels rotating around
the centered wordmark, drag / wheel to spin, momentum, slow auto-drift, mouse parallax
tilt, drag-vs-click threshold so a spin doesn't navigate.

Three card types across **six panels, each type twice**, which is exactly the trick the
reference uses (it shows 3 destinations across 6 panels) and keeps the ring reading full.
The reward card wears a green badge the moment both thresholds are met.

The background image sits fixed behind everything under a black overlay
(`~0.62` alpha plus a slight vignette). Cards keep their own scrim so their captions
stay readable regardless of what's behind them.

### Scan view

Card art frames the live camera: a viewport with the reticle brackets from the
reference, camera underneath, dashed target box, status line under it. Controls are a
zoom slider and a torch toggle where the device exposes one.

### Progress view

Two sections, one per group, each with its own `got/need` chip. Every row is a badge
(the mono subject code for วิชาเอก, an emoji for the innovation stations), the Thai name,
and a **check mark right after the name when stamped** — literally what the brief asked
for ("ขึ้นติ๊กถูกหลังคำว่า ฐานสุขภาพ"). The per-row `id` line was removed as noise.

Beside it: a ring for the overall `n / 19`, plus one criteria meter per group that fills
toward that group's *threshold* rather than its station count — what a student needs to
know is how far they are from the prize, not from 100%.

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
{ "v": 2, "stamps": { "gh_qrcode": "2026-08-19T12:00:00.000Z" } }
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
- Landing bottom tag: `เลือกการ์ดของคุณ` -> **`#วันวิทย์69`** (was `วันวิทย์68`). It stopped being an
  instruction and became a brand mark, and the orbiting cards sweep through that
  corner, so it now carries its own pill background instead of relying on the
  scrim behind it.
- `travel_qrcode`'s name resolved to **ฐานการท่องเที่ยว** (section 3).
- The progress list's per-row meta line (`01 · food_qrcode`, etc.) was removed —
  the user found it visual noise. Just icon + Thai name + check now.

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

## 14. The reward card

The ask was for something that lets a teacher at the prize desk see quickly that a
claim is genuine, with no server to check against. It was first built with four
signals — a ticking clock, a per-minute rotating verification code, the scan log, and
a redeem lock. On review the user cut it back to **the scan log alone**, so the card
now shows:

- the per-group counts against their thresholds, each with a tick;
- the span from first scan to last;
- the full log of stations with real times, behind a disclosure.

That still answers the question a teacher actually asks — did this happen across the
event, or in one burst thirty seconds ago — since nineteen stamps sharing one minute
is obvious at a glance.

What went with the cut, stated plainly: **nothing now prevents a second claim on the
same device**, and a screenshot of a friend's card is no longer detectable. Both were
what the clock, the code and the lock existed for. Preventing double claims is now an
off-app problem (a name list at the prize desk). The code for it is in git history if
it should come back.

The reset button on the progress screen went too, so a shared device is cleared through
browser site-data rather than in the app.

## 15. The single-file build

First real deploy came back as unstyled HTML: `index.html` served, everything under
`assets/` 404'd. The repo is private so it could not be inspected from here, but the
signature is the familiar one — uploading a folder through the GitHub web UI drops
the folder.

`build_standalone.py` removes the failure mode rather than diagnosing it: CSS, JS,
fonts and images all inline (data URIs), producing `standalone/index.html` at 832 KB
with **zero sub-requests**. If the page loads, it is complete. Verified by serving it
under a subpath and running the fake-camera E2E against it — decodes, stamps, no
console errors.

The multi-file layout stays the source of truth; the bundle is a build artefact and
must be regenerated after any edit under `assets/`.

## 16. Typography change

IBM Plex Sans Thai and IBM Plex Mono were removed entirely, replaced first by
Archivo + Noto Sans Thai, then Noto swapped for Prompt off the user's shortlist.
Verified in-browser that all nine faces load (Archivo 400/500/600/700, Prompt
400/500/600/700, Osiris 400) and that no rule still references the old families.

## 17. Event view

A fourth card, `#/event`, added from artwork and posters the user supplied. It carries:

- **The schedule as text**, not just the poster. The poster is a 1587x2245 image; on a
  phone a kid would have to pinch-zoom to read a time. The typed timeline marks
  *กิจกรรมมอบรางวัล* as the one entry that matters to this app.
- **A four-step how-to for the app itself**, since the passport replaces a paper one and
  nobody has used it before.
- **The three posters**, lazy-loaded, opening in an in-page lightbox.
- **The venue map**, in its own full-width section above the poster grid. It is
  landscape where the posters are portrait, and the pink subject-station labels
  (SPB, GI, SG, GH, DA, SA, HA, HS, HP, HD CI, HT) only read at full width. Kept at
  1500px so those labels survive a zoom. The map also settled the HDCI question from
  section 3: it prints as one box, so one station is right.

The lightbox is deliberately not `target="_blank"`: in the single-file build the images
are `data:` URIs and Chrome blocks top-level navigation to those, so a new tab would
simply do nothing. The overlay reuses the `<img>` already on the page, so nothing is
fetched twice.

Poster files were re-encoded to 900px WebP (238 KB for all three). Their source names
contained Thai characters and spaces, which would have become `%E0%B8%...` in the URL,
so they are renamed to ASCII on the way into `assets/img/`.

Eight panels no longer fit the six-panel ring: the arc per panel (~196px at r=250) was
narrower than a panel (172px), so they overlapped. Radius went to 325/200 and the panels
were trimmed to 158x209 so the front card still clears the bottom badge.

## 18. Notifications

The bottom toast was replaced by a LINE/Discord-style stack at the top: icon, title,
body, dismiss button, and a bar that drains for the notification's life. Up to three
stack; the oldest is dropped so a burst can never bury the page.

Two things that only showed up under test:

- Holding the camera on an already-scanned code re-fired every time the 1.5s cooldown
  lapsed, stacking three identical cards. Identical messages are now swallowed within a
  6-second window, the way a messaging app would.
- The decoded payload of an unknown QR goes into the notification body. That is
  untrusted input, so the body is set with `textContent`, never `innerHTML`.

## 19. Admin master code

`all_qrcode` (printed as `qr code/all.png`) is the organiser's own code. It is
checked *before* the station lookup so a station id can never shadow it, and it is
deliberately not a member of `BASES` — `TOTAL` stays 19 and it never appears in any
list or counter.

It **toggles**: on an incomplete passport it stamps all 19; on a complete one it
clears the device. That second half exists because the visible reset button was
removed, leaving the organiser no way to undo a test run.

Two things the toggle forced:

- A 5-second cooldown after an admin action, not the usual 1.5. At 1.5s, holding the
  camera on the code after it filled would silently clear it again, and the organiser
  could walk away from a wiped device believing it was complete.
- The result panel and notification say "สแกนซ้ำอีกครั้งเพื่อล้างทั้งหมด" so the
  toggle is stated rather than discovered.

**The payload is the entire secret, and `all_qrcode` is guessable.** A student who
thinks to generate a QR containing that string wins a prize without visiting a
station. This was raised with the user, who chose the readable name; the constant
sits at the top of `app.js` with the swap documented, so hardening it later is a
one-line change plus `make_qr_codes.py --force`.

`existing_payloads()` in `make_qr_codes.py` now identifies codes by **decoding** them
rather than by filename. The codes had been renamed to short names (`gh.png`), so the
filename check silently stopped matching and a rerun regenerated all nineteen as
duplicates.

## 20. Done means

- Landing: Osiris **PASSPORT**, background under a black overlay, ring of three card
  types (scan / progress / reward), all three navigate.
- Scanning any of the nineteen printed codes stamps exactly its own station in the
  right group; rescanning says duplicate; anything else says try again; zoom works
  near and far.
- Progress shows `n / 19`, a per-group counter against each threshold, and a tick
  after each stamped station's Thai name.
- Reward page states the two rules, and unlocks the teacher card only when both are met.
- Reload / airplane mode does not lose progress.
- No Osiris on Thai glyphs anywhere.
