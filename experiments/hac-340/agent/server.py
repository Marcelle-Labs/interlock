"""The intentionally small HAC-340 ADK/Cloud Run judge-path adapter.

It has two named ADK roles.  Their identifiers are application provenance, not
Google platform identities.  Each role has one bounded tool, which invokes the
real Interlock MCP endpoint using the agent service account's Cloud Run token.
"""
import asyncio
import base64
import hashlib
import hmac
import json
import os
import urllib.request
from uuid import uuid4
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import google.auth.transport.requests
import google.oauth2.id_token
from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types


MODEL = os.environ["INTERLOCK_GEMINI_MODEL"]
PROXY_URL = os.environ["INTERLOCK_PROXY_URL"].rstrip("/")
PROXY_AUDIENCE = os.environ["INTERLOCK_PROXY_AUDIENCE"]


def _token() -> str:
    """Fetches a Google-issued Cloud Run token; no caller token is forwarded."""
    if os.environ.get("INTERLOCK_IDENTITY_MODE") == "local-test":
        header = base64.urlsafe_b64encode(b'{"alg":"HS256"}').decode().rstrip("=")
        claims = json.dumps(
            {"iss": "interlock-local-test", "aud": PROXY_AUDIENCE, "email": "adk-agent@local.test"},
            separators=(",", ":"),
        ).encode()
        payload = base64.urlsafe_b64encode(claims).decode().rstrip("=")
        signature = hmac.new(
            os.environ["INTERLOCK_TEST_IDENTITY_SECRET"].encode(), f"{header}.{payload}".encode(), hashlib.sha256
        ).digest()
        return f"{header}.{payload}.{base64.urlsafe_b64encode(signature).decode().rstrip('=')}"
    request = google.auth.transport.requests.Request()
    return google.oauth2.id_token.fetch_id_token(request, PROXY_AUDIENCE)


def call_interlock(service: str, reserved: int, role: str, correlation_id: str) -> dict:
    """Call the submitted Interlock MCP tool and return its structured result."""
    body = json.dumps(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "set_reservation",
                "arguments": {"service": service, "reserved": reserved},
                "_meta": {"agentRole": role, "correlationId": correlation_id},
            },
        }
    ).encode()
    request = urllib.request.Request(
        f"{PROXY_URL}/mcp",
        data=body,
        headers={"content-type": "application/json", "authorization": f"Bearer {_token()}"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        answer = json.loads(response.read())
    return answer["result"]["structuredContent"]


def build_agent(role: str, correlation_id: str, outcomes: list[dict]) -> Agent:
    def interlock_action(service: str, reserved: int) -> dict:
        """Invoke the receipt-bound Interlock reservation tool exactly once."""
        outcome = call_interlock(service, reserved, role, correlation_id)
        outcomes.append(outcome)
        return outcome

    return Agent(
        name=f"interlock_{role}",
        model=MODEL,
        instruction=(
            "You are the Interlock " + role +
            " role. You must invoke interlock_action exactly once with the service and "
            "reservation from the request. Do not claim the mutation succeeded: report its "
            "structured decision only."
        ),
        tools=[interlock_action],
    )


async def run_agent(message: str, role: str, correlation_id: str) -> dict:
    sessions = InMemorySessionService()
    session = await sessions.create_session(app_name="interlock_hac340", user_id="judge", session_id="one")
    outcomes: list[dict] = []
    runner = Runner(agent=build_agent(role, correlation_id, outcomes), app_name="interlock_hac340", session_service=sessions)
    events = []
    async for event in runner.run_async(
        user_id=session.user_id,
        session_id=session.id,
        new_message=types.Content(role="user", parts=[types.Part(text=message)]),
    ):
        events.append(event.model_dump(mode="json", exclude_none=True))
    return {"events": events, "toolResults": outcomes}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/healthz":
            self._send(200, {"status": "ok", "adk": "google-adk", "model": MODEL, "roles": ["proposer", "reviewer"]})
            return
        self._send(404, {"status": "not_found"})

    def do_POST(self):
        if self.path != "/v1/run":
            self._send(404, {"status": "not_found"})
            return
        try:
            size = int(self.headers.get("content-length", "0"))
            request = json.loads(self.rfile.read(size))
            role = str(request.get("role", ""))
            if role not in {"proposer", "reviewer"}:
                raise ValueError("role must be proposer or reviewer")
            correlation_id = str(request.get("correlationId") or f"ilk-hac340-{uuid4().hex}")
            outcome = asyncio.run(run_agent(str(request["message"]), role, correlation_id))
            self._send(200, {"role": role, "model": MODEL, "correlationId": correlation_id, **outcome})
        except Exception as error:  # surfaced as a structured failed traversal, never success
            print(json.dumps({"event": "adk.run.failed", "error": str(error)}), flush=True)
            self._send(500, {"status": "failed", "error": str(error)})

    def _send(self, status, body):
        encoded = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, _format, *_args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8080"))), Handler).serve_forever()
