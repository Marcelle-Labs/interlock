"""Deterministic egress caller used as the traffic source for HAC-325 / S0.

An Agent Gateway has no callable hostname and governs MCP traffic only, so the
only way to exercise a CONTENT_AUTHZ extension is to have an agent on Agent
Runtime make an MCP call outbound through an AGENT_TO_ANYWHERE gateway. This is
that caller.

It is deliberately not an LLM agent. A model in the loop would add tool-choice
nondeterminism and a Gemini permission dependency to a measurement that is
supposed to be about network topology, so this subclasses BaseAgent and issues
the MCP request directly.

No Interlock logic lives here. The request body carries a marker the extension
tests for, so one invocation can be steered to ALLOW and another to DENY.
"""

import json
import os
import time
import urllib.request

import google.auth.transport.requests
import google.oauth2.id_token
from google.adk.agents import BaseAgent
from google.adk.events import Event
from google.genai import types

TARGET_URL = os.environ.get(
    "S0_TARGET_URL", "https://interlock-s0-target-708527487974.us-central1.run.app"
)


def _id_token(audience):
    """Cloud Run enforces invoker IAM; the org forbids allUsers, so the agent
    identity presents an ID token instead of the service being public."""
    request = google.auth.transport.requests.Request()
    return google.oauth2.id_token.fetch_id_token(request, audience)


def _mcp_call(value):
    body = json.dumps(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": "s0_probe", "arguments": {"value": value}},
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        TARGET_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {_id_token(TARGET_URL)}",
        },
        method="POST",
    )

    started = time.perf_counter_ns()
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = response.read().decode("utf-8", "replace")
            status = response.status
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8", "replace")
        status = exc.code
    except Exception as exc:  # surfaced, never swallowed -- this is the measurement
        payload = f"{type(exc).__name__}: {exc}"
        status = -1
    elapsed_ms = (time.perf_counter_ns() - started) / 1e6

    return {"status": status, "elapsed_ms": round(elapsed_ms, 3), "body": payload[:800]}


class S0EgressAgent(BaseAgent):
    async def _run_async_impl(self, ctx):
        # The invocation text selects the arm: anything containing the deny
        # marker should be refused by the extension before it reaches the target.
        value = "allow"
        content = getattr(ctx, "user_content", None)
        if content and getattr(content, "parts", None):
            for part in content.parts:
                if getattr(part, "text", None):
                    value = part.text.strip()
                    break

        outcome = _mcp_call(value)
        yield Event(
            author=self.name,
            content=types.Content(parts=[types.Part(text=json.dumps(outcome))]),
        )


root_agent = S0EgressAgent(
    name="interlock_s0_probe",
    description="S0 topology probe. Issues one MCP call outbound; no product behaviour.",
)
