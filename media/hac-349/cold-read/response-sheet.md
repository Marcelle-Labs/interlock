# HAC-349 cold read — response sheet (assembled judge path)

One copy per reader. Write what they said, not what they meant.

```
Reader #: ______   Date: ____________   Moderator: ____________
Surface:  https://interlock.marcellelabs.io/     commit: ____________
Browser / OS: ____________________   Logged out / private window?  Y / N
Unfamiliar with Interlock (has not seen this site, README, Devpost or video)?  Y / N
```

---

## Pass 1 — default, mouse allowed

**Q1 · 5 s — "What problem is this page about?"**

```
verbatim:



```
Described two independent actions interfering through something shared?  **Y / N**

Failure noted (dashboard / cloud product / security tool / no idea): ____________

---

**Q2 · 15 s — "What's it saying about locks?"**

```
verbatim:



```
Understood the lock works *and* does not cover this case?  **Y / N**

Which beat were they looking at?  01 same target / 02 different targets / 03 the miss

Named failure — circle any that occurred:

- "locks are broken" / "locks don't work"
- "Interlock is a better lock" / "just another lock"
- thought the lock section was describing Interlock

---

**Q3 · 30 s — "What does the thing this page is selling actually add?"**

```
verbatim:



```
Conveyed *environment evidence changes the coordination decision*?  **Y / N**

---

**Q4 · 60 s — "What's the trade-off between the four approaches?"**

```
verbatim:



```
Described the trade-off?  **Y / N**

**Q4b · 60 s — "What happens in the evidence section?"**

```
verbatim:



```
Understood that removing the evidence changed the decision and returned the bad
outcomes?  **Y / N**

---

**Q5 · Deep proof — "Is everything here one experiment, or more than one?"**

```
verbatim:



```
Distinguished the local evaluation from the separate Cloud run, unprompted?  **Y / N**

---

## Falsification — zero readers may infer any of these

Circle any the reader stated or implied. **Any circle is a failure of the
surface.** Record the verbatim words beside it.

| inferred | ✓ | verbatim |
| --- | --- | --- |
| Agent Runtime participated | | |
| Agent Gateway participated | | |
| CONTENT_AUTHZ participated | | |
| the local experiment ran in Google Cloud | | |
| local and cloud are one combined experiment | | |
| production readiness / fleet scale | | |
| exactly-once or restart safety | | |
| general security or general safety coverage | | |
| the three controls prove the route is secure | | |
| something on the page ran / recomputed while watching | | |
| animation timing represents execution timing | | |

**Q6 · "Is the page claiming anything it hasn't shown you?"**

```
verbatim:



```

**Q7 · "Did anything look like it was running while you watched?"**

```
verbatim:



```

---

## Pass 2 — reduced motion

Reload with `?static=1`, then repeat separately with the OS reduced-motion
preference on.

| question | same semantic answer as pass 1? | notes |
| --- | --- | --- |
| Q1 · the problem | Y / N | |
| Q2 · the locks | Y / N | |
| Q3 · what it adds | Y / N | |

Anything the reader could no longer see or understand: ____________________

---

## Pass 3 — keyboard only

No mouse. Tab, Shift-Tab, Enter, Space.

| check | result |
| --- | --- |
| reached the continuation from the first frame | Y / N |
| reached a route into the cockpit | Y / N |
| opened the limitations disclosure | Y / N |
| always knew where focus was | Y / N |
| got stuck anywhere (where?) | |

---

## Pass 4 — mobile / 390px

| question | same semantic answer? | notes |
| --- | --- | --- |
| Q1 · the problem | Y / N | |
| Q2 · the locks | Y / N | |
| Q3 · what it adds | Y / N | |

Anything requiring horizontal scrolling: ____________________

Slower reading on mobile is expected and is not a failure. Losing a step of the
argument is.

---

## Moderator notes

Where the reader hesitated, re-read, or scrolled back:

```



```

What you would change first:

```



```
