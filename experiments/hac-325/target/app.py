"""Minimal MCP server standing in for the protected tool, for HAC-325 / S0.

Agent Gateway governs MCP traffic only (`protocols` accepts MCP alone), so the
thing the gateway can intercept is an MCP tool call. This server implements just
enough of MCP -- initialize, tools/list, tools/call -- for an agent to make one
real call through the gateway.

It holds no Interlock logic and enforces nothing. It exists so a CONTENT_AUTHZ
decision has a request body to inspect and a 200 to contrast against a 403.
"""

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PROTOCOL_VERSION = "2025-06-18"

TOOLS = [
    {
        "name": "s0_probe",
        "description": "Echoes a value. Exists only to carry a body through the gateway.",
        "inputSchema": {
            "type": "object",
            "properties": {"value": {"type": "string"}},
            "required": ["value"],
        },
    }
]


def result(request_id, payload):
    return {"jsonrpc": "2.0", "id": request_id, "result": payload}


def dispatch(request):
    method = request.get("method")
    request_id = request.get("id")

    if method == "initialize":
        return result(
            request_id,
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "interlock-s0-target", "version": "0"},
            },
        )
    if method == "tools/list":
        return result(request_id, {"tools": TOOLS})
    if method == "tools/call":
        params = request.get("params") or {}
        value = (params.get("arguments") or {}).get("value", "")
        return result(
            request_id,
            {"content": [{"type": "text", "text": f"s0_probe received: {value}"}]},
        )
    if method and method.startswith("notifications/"):
        return None
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": -32601, "message": f"method not found: {method}"},
    }


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, payload, status=200):
        body = b"" if payload is None else json.dumps(payload).encode("utf-8")
        self.send_response(202 if payload is None else status)
        if body:
            self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_GET(self):
        self._send({"server": "interlock-s0-target", "protocolVersion": PROTOCOL_VERSION})

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        print(json.dumps({"severity": "INFO", "event": "mcp.request", "bytes": len(raw),
                          "body": raw.decode("utf-8", "replace")}), flush=True)
        try:
            request = json.loads(raw)
        except json.JSONDecodeError:
            self._send({"jsonrpc": "2.0", "id": None,
                        "error": {"code": -32700, "message": "parse error"}}, 400)
            return
        if isinstance(request, list):
            self._send([r for r in (dispatch(x) for x in request) if r is not None])
            return
        self._send(dispatch(request))

    def log_message(self, fmt, *args):
        print(json.dumps({"severity": "INFO", "msg": fmt % args}), flush=True)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
