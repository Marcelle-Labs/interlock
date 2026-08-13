"""The one agent behaviour both HAC-316 agents share.

Deliberately not an LLM agent. A model in the loop would add tool-choice
nondeterminism to a measurement about composition, and would make "the decision
changed because the evidence changed" unfalsifiable — the decision could have
changed because the model picked different arguments. This subclasses
``BaseAgent`` and issues exactly one protected mutation with arguments fixed at
import time, so the intent digest is a constant of the agent rather than an
outcome of a sample.

One call, no retry. If the call fails, the failure is what the attempt reports;
a helper that quietly tried again would turn a failed trial into a successful
one and hide it (X-05).
"""

import json
import time
from typing import Any, AsyncGenerator

from google.adk.agents import BaseAgent
from google.adk.events import Event
from google.adk.tools.tool_context import ToolContext
from google.genai import types

from ._toolset import OPERATION, build_toolset


class MutationAgent(BaseAgent):
    """Issues one ``set_reservation`` call through Interlock's MCP surface.

    ``service`` and ``reserved`` are fixed per agent and never read from the
    environment: the two arms must send byte-identical bodies, and a value the
    harness could vary per arm would make the arms incomparable.
    """

    service: str
    reserved: int

    async def _run_async_impl(self, ctx) -> AsyncGenerator[Event, None]:
        outcome = await self._call(ctx)
        yield Event(
            author=self.name,
            content=types.Content(parts=[types.Part(text=json.dumps(outcome))]),
        )

    async def _call(self, ctx) -> dict[str, Any]:
        arguments = {"service": self.service, "reserved": self.reserved}
        toolset = build_toolset()
        started_ns = time.perf_counter_ns()
        try:
            tools = await toolset.get_tools()
            tool = next((candidate for candidate in tools if candidate.name == OPERATION), None)
            if tool is None:
                return self._failure(
                    started_ns,
                    arguments,
                    "TOOL_ABSENT",
                    f"the MCP surface exposes no {OPERATION} tool; "
                    f"it offered {[candidate.name for candidate in tools]}",
                )
            result = await tool.run_async(args=arguments, tool_context=ToolContext(ctx))
            return {
                "agent": self.name,
                "operation": OPERATION,
                "arguments": arguments,
                "outcome": "RESPONDED",
                "elapsed_ms": self._elapsed_ms(started_ns),
                # Verbatim. The agent does not interpret the answer: whether the
                # mutation actually happened is settled by an independent re-read
                # of the target, never by what came back down the wire.
                "response": result,
            }
        except Exception as exc:  # surfaced, never swallowed -- this is the measurement
            return self._failure(started_ns, arguments, type(exc).__name__, str(exc))
        finally:
            await toolset.close()

    def _failure(
        self, started_ns: int, arguments: dict[str, Any], code: str, detail: str
    ) -> dict[str, Any]:
        return {
            "agent": self.name,
            "operation": OPERATION,
            "arguments": arguments,
            "outcome": "FAILED",
            "elapsed_ms": self._elapsed_ms(started_ns),
            "reasonCode": code,
            "detail": detail,
        }

    @staticmethod
    def _elapsed_ms(started_ns: int) -> float:
        return round((time.perf_counter_ns() - started_ns) / 1e6, 3)
