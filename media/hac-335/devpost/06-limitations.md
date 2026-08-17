# Devpost — limitations and what is not claimed

> Submission field: "Challenges" / "What's next" / limitations.
> Frozen under HAC-335. This section exists so that no reader has to infer a
> boundary that the rest of the submission did not state.

## Two proof classes, kept apart

**Controlled local experiment (HAC-330)** is the only causal counterfactual in
this submission. It is bounded: two intents, one shared environment, one
constraint, three frozen arms. It ran locally.

**Google Cloud participation (HAC-340)** is one recorded traversal. It proves
that a real Gemini agent on Google Cloud went through Interlock to touch
protected state and that a separately authenticated principal read the result
back. It is not a counterfactual — there is no cloud arm in which Interlock was
absent.

**Neither is evidence for the other.** No single run produced both, and no
timeline links their events.

## Not claimed

- HAC-330 did not run on Google Cloud.
- HAC-340 does not reproduce the 140/120 counterfactual in Google Cloud.
- Agent Runtime did not participate.
- Agent Gateway did not participate.
- `CONTENT_AUTHZ` is not on the HAC-340 path.
- Wrong-audience token rejection is controlled local parity evidence, not a
  HAC-340 cloud result.
- `WITHHOLD_SERIALIZE` is not human approval, joint authorization or
  certification.
- `ALLOW` plus a receipt is not an `AUTHORIZED` lifecycle state.
- `ALLOW` is not `VERIFIED`. `OBSERVED` is not `SAFE`. A receipt is not
  exactly-once.
- Three cloud negative controls are three controls, not comprehensive attack
  coverage.
- Internal Interlock roles are not Google-managed identities.
- No safety, security, verification or production-readiness guarantee.
- No exactly-once execution, restart-safety or recovery guarantee.
- No fleet-scale readiness.
- No universal collision prevention.
- No complete co-change coupling recall.

## Not yet bound

**Evaluation (HAC-319)** has no frozen packet. There is no SPR, precision,
recall, false-block rate or useful-concurrency number in this submission, and
none is shown — not as a value, not as a bar, not as proportional geometry. The
surface is reserved and labelled `EVALUATION NOT YET BOUND`; it is deliberately
kept out of the judge-facing sequence so that an unavailable evaluation cannot
read as a pending result.

## Scale of the evidence

One controlled experiment with three frozen arms, and one recorded cloud
traversal with three negative controls. That is the size of the claim. It
demonstrates a mechanism; it does not establish how the mechanism behaves across
many agents, long-running sessions, or adversarial load.

Claims used: `CL-009`, `CL-014`, `CL-020`, `CL-021`, `CL-022`, `CL-023`,
`CL-024`, `CL-025`.
