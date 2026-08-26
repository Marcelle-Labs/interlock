# HAC-349 cold read — the assembled judge path

**Status: READY_FOR_HUMAN_TEST. Not run. No comprehension result is claimed.**

```
HUMAN COLD READ: NOT RUN.
```

This kit replaces the cockpit-only protocol as the primary comprehension test.
HAC-348 asks for the remaining human cold read to be run against the *assembled*
judge path once HAC-349 lands, not against an isolated surface. That path now
starts at `/`.

`media/hac-341/cold-read/README.md` remains valid and unrun for the cockpit
treated on its own. Run this one first; run that one only if a reader's failure
looks specific to the verification layer.

Three unfamiliar readers, one at a time, no narration. Budget 20 minutes each.

A reader is *unfamiliar* if they have not seen this site, the README, the Devpost
copy or the video, and have not had Interlock explained to them. A colleague who
has heard the pitch is not a cold reader.

## Before you start

Open [`response-sheet.md`](./response-sheet.md), one copy per reader.

Check the surface is live and public, in a **logged-out / private window**. The
`*.vercel.app` deployment URLs are SSO-protected and must not be used.

| Purpose | URL |
| --- | --- |
| **Start here** — the judge path | `https://interlock.marcellelabs.io/` |
| Verification layer | `…/cockpit` |
| Reduced-motion / capture render | append `?static=1` |
| Cloud proof, entered directly | `…/cockpit?run=hac340-cloud&proof=cloud&state=run.cloud.overview` |

Do not open `/storyboard` during the cold read. It is a production artifact and
is deliberately not on the judge path; a reader who lands there is measuring
something this test is not about.

## What you say

Read aloud verbatim. **Do not explain anything, do not answer questions, do not
point at the screen.** If a reader asks what something means, say: *"Tell me what
you think it means."*

> I'm going to show you a web page. I'm not going to tell you what it is. I'll
> ask you a few questions as you look at it. There are no wrong answers — I'm
> testing the page, not you. Please think out loud. You can scroll whenever you
> want.

Open `/`. Start the timer. Let the reader scroll at their own pace; the timings
are when you interrupt, not when you advance the page.

### 1 · At 5 seconds — cover the screen

> *"What problem is this page about?"*

**Pass (3/3 required):** the reader describes, in their own words, two things
happening independently that interfere through something they share — a shared
budget, a shared limit, a shared environment, "they don't know about each other".

**Fail:** "a monitoring dashboard", "a cloud product", "some kind of security
tool", "I have no idea".

Record the exact words. Do not accept a paraphrase you supplied.

### 2 · At 15 seconds — after they have reached the lock section

> *"There's a section about locking. What's it saying about locks?"*

**Pass (3/3 required):** the lock is described as working, and as not covering
this particular case — "it locks the file, but the problem isn't in one file",
"two different locks so it let both through", "the lock can't see the thing they
share".

**Fail — and these are the important failures:**

- "locks are broken" / "locks don't work";
- "Interlock is a better lock" / "Interlock is just another lock";
- the reader thinks the lock section is describing Interlock.

If a reader fails this, note *which* of the three beats they were looking at.
The section is designed so the two lock keys are the visible argument; a failure
here means the keys are not carrying it.

### 3 · At 30 seconds

> *"What does the thing this page is selling actually add?"*

**Pass (3/3 required):** something that means *evidence about the environment
changes the coordination decision* — "it looks at the history", "it knows those
two files change together", "it uses the repository to decide".

Internal vocabulary is not required and not expected. Accept any wording that
carries the mechanism.

**Fail:** "it locks better", "it's a safety layer", "it approves things", "it
uses AI to decide".

### 4 · At 60 seconds

> *"There's a comparison of four approaches. What's the trade-off?"*

> *"There's a section after it about evidence. What happens in it?"*

**Pass (2/3 required, both questions):**

- the four-arm trade-off: at least that one approach is safe by being slow, one
  is fast but wrong, and one keeps both — *in this test*;
- the ablation: taking the evidence away changes the decision and the bad
  outcomes come back.

**Fail:** the reader reads the comparison as a general benchmark, or reads the
ablation as something the page just ran.

### 5 · Deep proof

Let the reader continue to the end of the page, then:

> *"Is everything on this page one experiment, or more than one?"*

**Pass (2/3 required):** the reader distinguishes the controlled local
evaluation from the separate recorded Google Cloud run, without being prompted
that there are two.

### 6 · Open-ended — the falsification pass

> *"Is there anything here you think the page is claiming that it hasn't
> actually shown you?"*

> *"Did anything on this page look like it was running while you watched?"*

**Zero readers may infer any of:**

- Agent Runtime, Agent Gateway or CONTENT_AUTHZ participation;
- that the local experiment ran in Google Cloud, or that it is one combined run;
- production readiness, fleet scale, exactly-once or restart safety;
- general security or general safety coverage;
- that the three cloud controls prove the route is secure;
- that anything on the page executed, recomputed or simulated in the browser;
- that animation timing represents execution timing.

Any one of these is a **failure of the surface**, not of the reader. Record it
verbatim and remove the treatment that produced it. Do not explain it to the
next reader, and do not keep it because a later reader got it right.

### 7 · Repeat under constraint

Repeat steps 1–3 with:

- `?static=1`, and separately with the OS reduced-motion preference on;
- **keyboard only**, no mouse;
- a phone, or a 390px-wide window.

The semantic answers must match. Presentation may differ. On mobile the argument
unfolds vertically and the reader will scroll more — that is intended, and slower
reading is not a failure there.

## What is already mechanically established

Do not re-test these by asking a human. They are measured, and asking a reader
to confirm them wastes the reader.

| property | where it is measured |
| --- | --- |
| the complete L1 proposition is in the first frame at 1440×900 and 1280×800 | `check:landing:visual`, 48px headroom contract |
| no HAC id, decision enum, digest or arm id is needed to read the first frame | `check:landing:visual`, rendered-text walk above the fold |
| reduced motion and `?static=1` render identical text | `check:landing:visual`, character-for-character comparison |
| every keyboard stop has a name, a focus ring and a 44px target | `check:landing:visual` |
| no off-origin request, no console error | `check:landing:visual` |
| no forbidden claim is asserted | `check:landing`, 17 patterns |
| the exact tokens keep their glosses | `check:landing`, `test/hac-349-landing-gates.test.mjs` |
| the two proof classes share no value | `check:landing`, `check:landing:visual` |
| every figure is bound to frozen HAC-343 evidence | `check:landing`, CI rebuild diff |

What no gate can establish is whether a person who has never seen this
understands it. That is the only thing this kit measures, and it has not been
run.

## Reporting

Preserve anonymised responses and timings. Report at sample strength — three
readers is three readers. Do not convert a mechanical check into a comprehension
result, and do not report this kit as passed until three unfamiliar humans have
actually sat in front of the page.
