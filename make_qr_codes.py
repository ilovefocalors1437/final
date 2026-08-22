#!/usr/bin/env python3
"""Generate every QR code the passport needs, into `qr code/`.

Payloads match the `id` field of the BASES array in assets/js/app.js exactly.
The app matches case-insensitively, but these are written lowercase to match the
spec ("gh_qrcode").

    pip install qrcode[pil]
    python make_qr_codes.py            # only makes codes that don't exist yet
    python make_qr_codes.py --force    # regenerate everything
"""

import argparse
import glob
import os
import re
from datetime import datetime

import qrcode

SAVE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "qr code")

# ฐานกิจกรรมวิชาเอก — the eleven subject-major stations from the passport.
MAJOR_CODES = ["GH", "GI", "SG", "SA", "HT", "HS", "HP", "HA", "DA", "HDCI", "SPB"]

# ฐานนวัตกรรมและนิทรรศการแสดงผลงาน — eight stations.
INNOVATION_IDS = [
    "space_qrcode",
    "environment_qrcode",
    "agriculture_qrcode",
    "energy_qrcode",
    "health_qrcode",
    "travel_qrcode",
    "food_qrcode",
    "exhibition_qrcode",
]


# The organiser's master code. Not a station: scanning it fills every stamp at
# once (and clears them if scanned again on a complete passport). Keep this
# string in step with ADMIN_CODE in assets/js/app.js.
ADMIN_ID = "all_qrcode"


def wanted_payloads():
    return [c.lower() + "_qrcode" for c in MAJOR_CODES] + INNOVATION_IDS + [ADMIN_ID]


def existing_payloads(save_dir):
    """Payloads already on disk, read by decoding each image.

    Reading the filename instead would be faster but wrong: the codes have been
    renamed to short names (gh.png rather than gh_qrcode_<date>.png), and a file
    named anything at all still carries whatever payload it was generated with.
    Decoding is the only answer that survives a rename.

    Falls back to the filename stem if OpenCV isn't installed.
    """
    try:
        import cv2
    except ImportError:
        cv2 = None

    found = {}
    for path in glob.glob(os.path.join(save_dir, "*.png")):
        payload = None
        if cv2 is not None:
            try:
                text, _, _ = cv2.QRCodeDetector().detectAndDecode(cv2.imread(path))
                payload = text.strip() or None
            except Exception:
                payload = None
        if payload is None:
            stem = os.path.splitext(os.path.basename(path))[0]
            payload = re.sub(r"_\d{8}_\d{6}$", "", stem)
        found[payload.lower()] = path
    return found


def make_qr(text, save_dir):
    os.makedirs(save_dir, exist_ok=True)
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(text)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    safe = "".join(c for c in text if c.isalnum() or c in (" ", "-", "_")).strip()[:40] or "qr"
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(save_dir, "%s_%s.png" % (safe, stamp))
    img.save(path)
    return path


def main():
    ap = argparse.ArgumentParser(description="Generate the passport's QR codes.")
    ap.add_argument("--force", action="store_true", help="regenerate codes that already exist")
    args = ap.parse_args()

    have = existing_payloads(SAVE_DIR)
    made = skipped = 0
    for payload in wanted_payloads():
        if payload in have and not args.force:
            print("  skip   %-22s (already at %s)" % (payload, os.path.basename(have[payload])))
            skipped += 1
            continue
        path = make_qr(payload, SAVE_DIR)
        print("  made   %-22s -> %s" % (payload, os.path.basename(path)))
        made += 1

    print("\n%d made, %d already there, %d total expected" % (made, skipped, len(wanted_payloads())))


if __name__ == "__main__":
    main()
