"""The ADK callback contract, exercised the way ADK exercises it.

## What this is for

`agents/_proposals.py` named its third parameter `context`. ADK 2.6.3 passes
`tool_context=`, so every tool call raised

    TypeError: record_proposed_tool_call() got an unexpected keyword argument 'tool_context'

at Step 2 of `_run_with_trace` — before the tool ran at Step 3, and outside the
`except` that wraps the tool call. `set_reservation` never reached the wire in
either arm, and nothing in the repository could have noticed, because there were
no Python tests at all: the module imported, had a plausible signature, and was
referenced from the packet.

Three things are checked here, in the order they can fail:

1. **The contract** — what ADK's own source actually passes, read out of the
   installed package with `ast` rather than quoted from documentation. If a
   future ADK renames a keyword, this fails first and says so.
2. **The wiring** — the callbacks are fetched from
   `root_agent.canonical_before_tool_callbacks`, which is the exact list ADK
   iterates, and invoked with the exact keywords from (1) against a real
   `ToolContext` over a real `Session`. Not a stand-in that resembles one.
3. **The shape** — one successful tool call is one logical proposal. Two records
   are written (proposed, responded) because that is what happened; `proposals()`
   returns one, because one call was proposed. When it returned both, every valid
   trial classified `MULTIPLE_TOOL_CALLS`.

## Running it

No pytest, no new dependency, no entry in `package.json`:

    /private/tmp/.../adkenv/bin/python -m unittest discover \\
        -s experiments/hac-316/test -p 'test_*.py' -v

`HAC316_INGRESS_URL` and `HAC316_MODEL` are set below to values that are
obviously not real. They exist because the agents refuse to guess either one,
and building the real `root_agent` is the point of this file — but nothing here
opens a connection or calls a model, and the MCP toolset is constructed lazily.

Zero cloud spend. No network call is made by any test in this file.
"""

from __future__ import annotations

import ast
import inspect
import os
import sys
import unittest
from pathlib import Path

EXPERIMENT_DIR = Path(__file__).resolve().parents[1]
if str(EXPERIMENT_DIR) not in sys.path:
    sys.path.insert(0, str(EXPERIMENT_DIR))

# Set before the agent package is imported. Deliberately unusable values: the
# agents require both and guess neither, and a test that supplied something
# plausible could hide a real endpoint being reached.
os.environ.setdefault("HAC316_INGRESS_URL", "http://127.0.0.1:1/hac316-test-never-connected")
os.environ.setdefault("HAC316_MODEL", "hac316-test-model-not-a-real-model")

from google.adk.agents.invocation_context import InvocationContext  # noqa: E402
from google.adk.flows.llm_flows import functions as adk_functions  # noqa: E402
from google.adk.sessions.in_memory_session_service import InMemorySessionService  # noqa: E402
from google.adk.sessions.session import Session  # noqa: E402
from google.adk.tools.base_tool import BaseTool  # noqa: E402
from google.adk.tools.tool_context import ToolContext  # noqa: E402

from agents._proposals import (  # noqa: E402
    AFTER_TOOL_CALLBACK_KEYWORDS,
    BEFORE_TOOL_CALLBACK_KEYWORDS,
    PHASE_PROPOSED,
    PHASE_RESPONDED,
    PROPOSED_TOOL_CALLS_KEY,
    invocation_record,
    proposals,
    records,
    responses,
)
from agents.interlock_a.agent import root_agent as agent_a  # noqa: E402
from agents.interlock_b.agent import root_agent as agent_b  # noqa: E402

CANONICAL_LISTS = {
    "canonical_before_tool_callbacks": BEFORE_TOOL_CALLBACK_KEYWORDS,
    "canonical_after_tool_callbacks": AFTER_TOOL_CALLBACK_KEYWORDS,
}


def _keywords_adk_passes() -> dict[str, list[list[str]]]:
    """Every `callback(...)` ADK makes over its canonical tool-callback lists.

    Read out of the installed `google.adk` source with `ast`, so the answer is
    what the package does rather than what a comment says it does.
    """
    tree = ast.parse(inspect.getsource(adk_functions))
    found: dict[str, list[list[str]]] = {name: [] for name in CANONICAL_LISTS}
    for node in ast.walk(tree):
        if not isinstance(node, ast.For):
            continue
        if not isinstance(node.iter, ast.Attribute) or node.iter.attr not in found:
            continue
        if not isinstance(node.target, ast.Name):
            continue
        variable = node.target.id
        for inner in ast.walk(node):
            if not isinstance(inner, ast.Call):
                continue
            if not isinstance(inner.func, ast.Name) or inner.func.id != variable:
                continue
            if inner.args:
                raise AssertionError(
                    f"ADK passes {len(inner.args)} positional argument(s) to a tool callback; "
                    "the recorded contract is keyword-only"
                )
            found[node.iter.attr].append([keyword.arg for keyword in inner.keywords])
    return found


def _tool_context(agent) -> tuple[ToolContext, Session]:
    """A real `ToolContext` over a real `Session`. Nothing stands in for either."""
    session = Session(id="hac316-test", app_name="hac316", user_id="test-user", state={})
    invocation = InvocationContext(
        session_service=InMemorySessionService(),
        invocation_id="inv-hac316-test",
        agent=agent,
        session=session,
    )
    return ToolContext(invocation), session


class AdkCallbackContract(unittest.TestCase):
    """What ADK actually passes, taken from ADK."""

    def test_adk_invokes_tool_callbacks_with_the_recorded_keywords(self) -> None:
        passed = _keywords_adk_passes()
        for attribute, expected in CANONICAL_LISTS.items():
            calls = passed[attribute]
            self.assertTrue(
                calls,
                f"no call over agent.{attribute} found in the installed ADK; the contract this "
                "module is written against could not be located",
            )
            for keywords in calls:
                self.assertEqual(
                    tuple(keywords),
                    expected,
                    f"ADK invokes agent.{attribute} with {keywords}; "
                    f"agents/_proposals.py records {list(expected)}",
                )

    def test_the_callbacks_bind_exactly_those_keywords(self) -> None:
        """The signature check, isolated from the call.

        This is the assertion the live `TypeError` was: `context` cannot bind
        `tool_context=`, so `bind` raises exactly where ADK raised.
        """
        for callback, keywords in (
            (agent_a.canonical_before_tool_callbacks[0], BEFORE_TOOL_CALLBACK_KEYWORDS),
            (agent_a.canonical_after_tool_callbacks[0], AFTER_TOOL_CALLBACK_KEYWORDS),
        ):
            signature = inspect.signature(callback)
            signature.bind(**{name: None for name in keywords})
            self.assertEqual(
                tuple(signature.parameters),
                keywords,
                f"{callback.__name__} does not take ADK's parameters in ADK's spelling",
            )
            for parameter in signature.parameters.values():
                self.assertIs(
                    parameter.kind,
                    inspect.Parameter.KEYWORD_ONLY,
                    f"{callback.__name__}({parameter.name}) is positional; ADK only ever passes "
                    "these by keyword, and a positional parameter lets a rename go unnoticed",
                )


class CallbacksAsAdkCallsThem(unittest.TestCase):
    """The callbacks, fetched and invoked the way `_run_with_trace` does."""

    def setUp(self) -> None:
        self.tool = BaseTool(name="set_reservation", description="the protected operation")
        self.args = {"service": "alpha", "reserved": 60}

    def _run_one_tool_call(self, agent, args=None, response=None):
        """Steps 2, 3 and 5 of ADK's `_run_with_trace`, in that order."""
        args = self.args if args is None else args
        response = {"status": "EXECUTED"} if response is None else response
        context, session = _tool_context(agent)

        # Step 2 — the canonical before-tool callbacks.
        for callback in agent.canonical_before_tool_callbacks:
            self.assertIsNone(
                callback(tool=self.tool, args=args, tool_context=context),
                "a before-tool callback that returns a value short-circuits the tool and makes "
                "model context the authorization",
            )
        # Step 3 — the tool itself would run here. It is not called: this file
        # opens no connection.
        # Step 5 — the canonical after-tool callbacks.
        for callback in agent.canonical_after_tool_callbacks:
            self.assertIsNone(
                callback(
                    tool=self.tool,
                    args=args,
                    tool_context=context,
                    tool_response=response,
                ),
                "an after-tool callback that returns a value replaces the tool's result",
            )
        return session.state

    def test_both_agents_record_a_proposal_through_their_own_callback_lists(self) -> None:
        for agent, service in ((agent_a, "alpha"), (agent_b, "beta")):
            with self.subTest(agent=agent.name):
                args = {"service": service, "reserved": 60}
                state = self._run_one_tool_call(agent, args=args)

                self.assertIn(PROPOSED_TOOL_CALLS_KEY, state)
                proposed = proposals(state)
                self.assertEqual(len(proposed), 1)
                self.assertEqual(proposed[0]["tool"], "set_reservation")
                self.assertEqual(proposed[0]["arguments"], args)
                self.assertEqual(proposed[0]["agent"], agent.name)
                self.assertEqual(proposed[0]["invocation"], "inv-hac316-test")

    def test_one_tool_call_is_one_proposal(self) -> None:
        """The A3 regression.

        Two records are written because two things happened. One proposal was
        made. When `proposals()` returned both, `classifyInvocation` saw two
        entries and every valid trial came out `MULTIPLE_TOOL_CALLS`.
        """
        state = self._run_one_tool_call(agent_a)

        self.assertEqual(len(records(state)), 2, "the full trail keeps both phases")
        self.assertEqual([record["phase"] for record in records(state)], [PHASE_PROPOSED, PHASE_RESPONDED])
        self.assertEqual(len(proposals(state)), 1, "one tool call is one logical proposal")
        self.assertEqual(len(responses(state)), 1)
        self.assertEqual(responses(state)[0]["response"], {"status": "EXECUTED"})
        self.assertEqual(len(invocation_record(state)["proposals"]), 1)

    def test_two_tool_calls_are_two_proposals(self) -> None:
        """The counterpart. Filtering by phase must not hide a real second call."""
        context, session = _tool_context(agent_a)
        for reserved in (60, 70):
            for callback in agent_a.canonical_before_tool_callbacks:
                callback(
                    tool=self.tool,
                    args={"service": "alpha", "reserved": reserved},
                    tool_context=context,
                )
            for callback in agent_a.canonical_after_tool_callbacks:
                callback(
                    tool=self.tool,
                    args={"service": "alpha", "reserved": reserved},
                    tool_context=context,
                    tool_response={"status": "EXECUTED"},
                )

        self.assertEqual(len(proposals(session.state)), 2)
        self.assertEqual([entry["arguments"]["reserved"] for entry in proposals(session.state)], [60, 70])

    def test_the_proposal_is_recorded_verbatim(self) -> None:
        """Drift is evidence. Nothing here may repair it."""
        drifted = {"service": "alpha", "reserved": "60", "urgency": "high"}
        state = self._run_one_tool_call(agent_a, args=drifted)

        self.assertEqual(proposals(state)[0]["arguments"], drifted)

    def test_the_write_registers_a_session_delta(self) -> None:
        """A record that never leaves the process is a record the harness cannot read."""
        context, session = _tool_context(agent_a)
        for callback in agent_a.canonical_before_tool_callbacks:
            callback(tool=self.tool, args=self.args, tool_context=context)

        self.assertTrue(
            context.state.has_delta(),
            "the proposal was written in place and produced no state delta; a committed session "
            "would carry no proposal at all",
        )
        self.assertEqual(session.state[PROPOSED_TOOL_CALLS_KEY], proposals(session.state))


class InvocationRecordShape(unittest.TestCase):
    """The bridge to `classifyTrial`, which reads `{proposals, error?}`."""

    def test_an_empty_session_is_no_tool_call_rather_than_an_error(self) -> None:
        self.assertEqual(invocation_record({}), {"proposals": []})

    def test_an_error_is_carried_when_one_is_supplied(self) -> None:
        self.assertEqual(
            invocation_record({}, error="the model raised"),
            {"proposals": [], "error": "the model raised"},
        )


if __name__ == "__main__":
    unittest.main()
