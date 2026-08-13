"""Trivial protected target behind the gateway for the HAC-325 / S0 gate.

Stands in for the protected tool so the gateway has something to route to. It
holds no Interlock logic and makes no decision -- it only echoes, so that a
200 proves the request survived the CONTENT_AUTHZ extension and a 403 proves it
did not.
"""

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _respond(self, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._respond({"target": "interlock-s0-target", "path": self.path})

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        self._respond(
            {
                "target": "interlock-s0-target",
                "path": self.path,
                "received_bytes": len(raw),
                "echo": raw.decode("utf-8", "replace"),
            }
        )

    def log_message(self, fmt, *args):
        print(json.dumps({"severity": "INFO", "msg": fmt % args}), flush=True)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
