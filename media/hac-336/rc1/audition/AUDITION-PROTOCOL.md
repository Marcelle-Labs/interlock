# RC1 Take 0.2 — cold-view audition protocol

**A human runs this. It was not run by the model, and no result below may be
filled in by one.** Take 0.1 was a human cold read; this is its successor and
has to be comparable.

Master under audition: `exports/IL-MOT-022-interlock-rc1-1920x1080.mp4`
— 3:39.5, sha256 recorded in `evidence/render-manifest.json`.

| Mode | Play | Reader sees | Reader hears |
| --- | --- | --- | --- |
| **A · normal** | the master, captions ON | picture + captions | narration |
| **B · muted** | `audition/RC1-muted.mp4`, captions ON | picture + captions | nothing |
| **C · audio-only** | `audition/RC1-audio-only.m4a` | nothing | narration |

Mode C ships as an audio file rather than "mute the window and look away", so
the picture cannot leak into the result.

Recruit one reader who has **not** seen Take 0.1 or any Interlock material.
Run A, then B, then C, with a break between. Do not explain anything first, and
do not answer questions during a mode — note the question instead; a question
asked is a finding.

## Mode A — normal

Take 0.1's failure was reading load: the reader could not survey the visuals
while reading fast-changing subtitles, and lost the argument at the
four-strategy section. That section is now 0:43–1:24.

1. Did you ever feel you had to choose between reading and looking? Where?
2. At the four-strategy table (0:43) and the ablation (1:03) — did you have
   enough time to look at the table, or did text keep moving?
3. Was there any point where you lost the thread? Timestamp it.
4. Did anything on screen change while you were still reading something else?

## Mode B — muted (the survivability check)

The claim is that every canonical result stays recoverable with no sound.

5. Without sound, what is the problem this film is about?
6. What do the four rows at 0:43 compare, and which one behaves differently?
7. At 1:03, what was held constant and what was changed?
8. Did the Google Cloud section (from 1:24) look like a different run from what
   came before, or a continuation of it?
9. Name any number you could read clearly. (Expected available on screen:
   `105`, `130`, `45`, `140`, `120`, `24`, `16`, `403`, `401`, `2/2`, `0/2`, `4/4`.)

## Mode C — audio-only (the new criterion)

**Pass condition: the listener recovers the qualitative causal chain. The proof
numbers may stay screen-bound; the argument may not.**

10. In your own words, what goes wrong when two agents act at once?
11. What does the ordinary lock get right, and what does it miss?
12. What does Interlock use to make its decision?
13. What happened when that evidence was taken away?
14. Was there any moment where the narration referred to something you could
    not see, and that therefore meant nothing?
15. Was any word mispronounced, or any term you could not make out?
    (Listen specifically for: *gemini 3.5 flash*, *ADK*, *MCP*, *AI*,
    *ALLOW_PARALLEL* spoken as "allow parallel", *EXECUTED*, *OBSERVED*.)

Questions 11, 12 and 13 are the three links. A pass needs all three, in
substance, without prompting — not verbatim.

## Known open finding, to confirm or refute in Mode C

`check:rc1` currently fails one check, deliberately left open for this audition:

> **N03 at 0:12** — *"Watch the lock. It sees one key, and it is right about
> that key."*
>
> "Watch the lock" is an instruction to a viewer. To a listener it points at
> nothing. Question 14 exists to find out whether a real listener actually
> trips on it, or parses it as "consider the lock" and moves on.

If Mode C trips on it, the prepared fix is one line and changes no timing
materially:

> *"The lock is right about the key it holds. It serializes the contention it
> can see."*

If Mode C does not trip on it, waive N03 in `cut-rc1.json`
`audioOnlyDeicticWaivers` with the audition as the reason, and the gate goes
green.

## Recording the result

Write answers verbatim — especially hesitations and wrong answers, which are
the signal. Then one line per mode: **pass**, or **fail + the timestamp**.

Do **not** lower caption turnover, and do **not** shorten the R03, R04, R09 or
R11 settles to improve a metric. Those numbers were bought with the Take 0.1
finding and are only revisited if a human trips on them.

| Mode | Verdict | Timestamp of first failure | Notes |
| --- | --- | --- | --- |
| A · normal | | | |
| B · muted | | | |
| C · audio-only | | | |

Freeze RC1 only if all three pass.
