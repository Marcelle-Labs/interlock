# HAC-341 cold read — moderator kit

**Status: READY_FOR_HUMAN_TEST. Not run. No result is claimed.**

Three unfamiliar readers, tested one at a time, no narration. This kit is the
whole protocol: the URLs, what you say, and where the answers go. Budget 15
minutes per reader.

A reader is *unfamiliar* if they have not seen the cockpit, the README, the
Devpost copy or the video, and have not had Interlock explained to them. A
colleague who has heard the pitch is not a cold reader.

## Before you start

Open [`response-sheet.md`](./response-sheet.md), one copy per reader.

Check the surface is live and public — in a **logged-out / private window**:

```
https://interlock.marcellelabs.io/cockpit?run=hac330-local&proof=local&state=run.local.treatment
```

If that redirects to a login page, stop: you are on a protected URL. The
`*.vercel.app` deployment URLs are SSO-protected and **must not be used for the
cold read**. Only the custom domain is public.

## The URLs

| Purpose | URL |
| --- | --- |
| L1 default (start here) | `https://interlock.marcellelabs.io/cockpit?run=hac330-local&proof=local&state=run.local.treatment` |
| Baseline arm | `…/cockpit?run=hac330-local&proof=local&state=run.local.baseline` |
| Perturbed arm | `…/cockpit?run=hac330-local&proof=local&state=run.local.perturbed` |
| Cloud overview | `…/cockpit?run=hac340-cloud&proof=cloud&state=run.cloud.overview` |
| Reduced motion / static | append `&static=1` to any of the above |
| Missing run (must show unavailable, never substitute) | `…/cockpit?run=nope&proof=local&state=run.local.treatment` |

## What you say

Read these aloud verbatim. **Do not explain anything, do not answer questions,
do not point at the screen.** If a reader asks what something means, say: *"Tell
me what you think it means."*

> I'm going to show you a web page. I'm not going to tell you what it is. I'll
> ask you a few questions as you look at it. There are no wrong answers — I'm
> testing the page, not you. Please think out loud.

Open the L1 default URL. Start the timer.

1. **At 5 seconds** — cover the screen. *"What problem is this page about?"*
2. **At 30 seconds** — *"What changed, and why did it change?"*
3. **At 60 seconds** — *"If you didn't believe this, how would you check it
   yourself?"*
4. **Switch to the cloud overview URL. At 120 seconds** — *"Is what you're
   looking at now the same experiment as before, or a different one?"*
5. **Open-ended** — *"Is there anything here you think the page is claiming that
   it hasn't actually shown you?"*

Then repeat steps 1–4 with `&static=1` and **keyboard only** (no mouse). The
semantic answers must match; presentation may differ.

## Targets

| # | Question | Target |
| --- | --- | --- |
| 1 | Identifies the core problem at 5 s | **3/3** |
| 2 | Explains the causal delta at 30 s | **3/3** |
| 3 | Finds verifiable evidence by 60 s | **≥2/3** |
| 4 | Distinguishes local proof from Google Cloud participation by 120 s | **≥2/3** |

## Automatic failures

These override every score above. If any occurs, the cold read **fails**
regardless of questions 1–4:

- a reader infers that **Agent Runtime** or **Agent Gateway** participated;
- a reader believes the local experiment and the cloud run are **one combined
  experiment**, or that the cloud run reproduced the 140/120 counterfactual;
- a reader reads `ALLOW` as *verified*, *authorized* or *safe*, or reads
  `EXECUTED` as `OBSERVED`;
- a reader concludes Interlock is **universally** safe, production-ready, or
  that it prevents collisions in general;
- the keyboard/reduced-motion pass yields a **different semantic answer**.

## Recording the result

Write **verbatim answers** on the response sheet. Do not summarise into a score
without them — the wording is the finding. A reader who says "it stops two
robots fighting over the same file" has understood something different from one
who says "it decides whether two jobs can run at once", and only the verbatim
text preserves that.

Only comprehension failures demonstrated by this protocol justify further UX
change. A reader being slow is data; a moderator's hunch is not.

## After the run

Record the outcome on HAC-341 with the verbatim sheets attached. Until three
real readers have completed this, HAC-341 stays open and every surface that
mentions the cold read must continue to say it has not been run.
