# Positioning paragraph — proposed

Source: reviewer feedback, offered as stronger than the section 4
"not another agent" framing. Adopted, with one substantive correction.

## Adopted text

> Two autonomous agents can each be right and still be wrong together.
> Interlock isn't another agent — it's the deterministic coordination boundary
> a multi-agent fleet passes through before shared state changes. It reads
> revision-bound environment evidence, decides whether independently valid
> actions may execute concurrently, and the protected target requires the
> resulting receipt. In a frozen sixteen-scenario evaluation it withheld both
> demonstrated cross-target hazards while keeping both independent
> opportunities parallel. Remove the coupling evidence and the decision
> reverses: both failures return.

## What changed from the submitted version, and why

**"is the deterministic coordination agent" → "isn't another agent — it's the
deterministic coordination boundary".** This is the correction that matters.
Section 4 of the RC1 brief fixes it: *"Interlock is NOT another reasoning agent.
Interlock is the deterministic composition boundary between independently
proposed actions and shared-state mutation."*

It is not a style preference. If a judge reads Interlock as an agent, the
determinism claim muddies — agents are stochastic, boundaries are not — and the
obvious question becomes "so it's another model deciding?", which the entire
evidence package exists to refute. Stating the contrast outright is also
stronger than the original, which only implied it.

**"enforces that decision with a receipt" → "the protected target requires the
resulting receipt".** "Enforces" casts Interlock as the actor at the target.
What the recorded run shows is the target refusing a call that carries no
receipt — enforcement lives at the target, and that distinction is the reason
the direct-bypass control returns 403.

**"blocked" → "withheld".** The canonical verb for the measured result. "Blocked"
edges toward the general prevention claim the claim fences refuse.

**"preserving both known-safe parallel opportunities" → "keeping both independent
opportunities parallel".** "Safe parallel opportunities retained" is the retired
phrase; `INDEPENDENT OPPORTUNITIES KEPT PARALLEL` is the canonical metric label
and is what the frozen board prints.

Kept unchanged: the opening line, "autonomous agents", "independently valid
actions", "execute concurrently", the sixteen-scenario framing, and the ablation
sentence. All are accurate to the frozen evidence.

## What went into the film

The paragraph is ~90 words — roughly 38 seconds narrated — so it is copy, not
narration. Two lines of it were taken into the cut:

| Line | Was | Now |
| --- | --- | --- |
| `N01` (0:01) | "Two agent actions. Each one valid on its own." | "Two autonomous agents can each be right, and still be wrong together." |
| `N05` (0:29) | "Interlock separates proposing an action from deciding whether it may compose." | "Interlock isn't another agent. It's the deterministic boundary those actions pass through before shared state changes." |

The rest of the paragraph is already the film's spine: R03 carries the
sixteen-scenario result, R04 the ablation.
