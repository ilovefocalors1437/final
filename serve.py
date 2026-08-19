#!/usr/bin/env python3
"""Serve the Stamp Book locally, for testing before you deploy.

Browsers only hand out the camera on a "secure context". `http://localhost`
already counts as one, so testing on this computer needs no certificate and
shows no warning — that is the default here.

A bare LAN address like http://192.168.1.20:8000 does NOT count. So to test on
a real phone over wifi you need `--lan`, which switches to HTTPS with a
self-signed certificate; the phone warns once and you tap through.

    python serve.py              # http://localhost:8000  — no warnings
    python serve.py --lan        # https on 8443, for phones on the same wifi
    python serve.py --port 9000

None of this matters in production: deploy to any static host with real HTTPS
(see README) and the camera just works.
"""

import argparse
import datetime
import http.server
import os
import socket
import ssl
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
CERT = os.path.join(ROOT, ".devcert.pem")
KEY = os.path.join(ROOT, ".devkey.pem")


def lan_ip():
    """Best-effort local address — no packets are actually sent."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def make_cert():
    """Create a self-signed cert for this machine, once. Returns True on success."""
    if os.path.exists(CERT) and os.path.exists(KEY):
        return True

    ip = lan_ip()
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        import ipaddress

        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "stampbook.local")])
        now = datetime.datetime.now(datetime.timezone.utc)
        cert = (
            x509.CertificateBuilder()
            .subject_name(name)
            .issuer_name(name)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=365))
            .add_extension(
                x509.SubjectAlternativeName(
                    [
                        x509.DNSName("localhost"),
                        x509.IPAddress(ipaddress.ip_address("127.0.0.1")),
                        x509.IPAddress(ipaddress.ip_address(ip)),
                    ]
                ),
                critical=False,
            )
            .sign(key, hashes.SHA256())
        )
        with open(KEY, "wb") as f:
            f.write(
                key.private_bytes(
                    serialization.Encoding.PEM,
                    serialization.PrivateFormat.TraditionalOpenSSL,
                    serialization.NoEncryption(),
                )
            )
        with open(CERT, "wb") as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))
        return True
    except ImportError:
        pass

    try:
        subprocess.run(
            [
                "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
                "-keyout", KEY, "-out", CERT, "-days", "365",
                "-subj", "/CN=stampbook.local",
                "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:%s" % ip,
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except (OSError, subprocess.CalledProcessError):
        return False


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        # Always serve fresh files — nobody wants a stale app cached on a phone
        # halfway through the event.
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))


def main():
    ap = argparse.ArgumentParser(description="Serve the Stamp Book for local testing.")
    ap.add_argument("--port", type=int, default=0, help="port (default 8000 http / 8443 https)")
    ap.add_argument("--lan", action="store_true",
                    help="serve HTTPS so phones on the same wifi can use the camera")
    ap.add_argument("--https", dest="lan", action="store_true", help=argparse.SUPPRESS)
    args = ap.parse_args()

    use_https = args.lan
    if use_https and not make_cert():
        print("!  Could not create a certificate (no `cryptography`, no `openssl`).")
        print("!  Falling back to http — the camera will only work on localhost.\n")
        use_https = False

    port = args.port or (8443 if use_https else 8000)
    scheme = "https" if use_https else "http"

    server = http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler)
    if use_https:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(CERT, KEY)
        server.socket = context.wrap_socket(server.socket, server_side=True)

    ip = lan_ip()
    print("\n  Stamp Book")
    print("  ----------")
    print("  this computer : %s://localhost:%d/" % (scheme, port))
    if use_https:
        print("  phones on wifi: %s://%s:%d/" % (scheme, ip, port))
        print("\n  The certificate is self-signed, so each device warns once:")
        print("  Advanced -> Proceed anyway. After that the camera works normally.")
        print("  (Testing on this computer needs none of it: just `python serve.py`.)")
    else:
        print("\n  The camera works here because localhost is a secure context.")
        print("  To test on a phone over wifi instead:  python serve.py --lan")
    print("\n  Ctrl+C to stop.\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  stopped.")


if __name__ == "__main__":
    main()
