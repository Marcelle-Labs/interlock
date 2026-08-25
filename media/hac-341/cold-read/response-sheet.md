# HAC-341 cold read — response sheet

One copy per reader. Write what they said, not what they meant.

```
Reader #: ______   Date: ____________   Moderator: ____________
Surface:  https://interlock.marcellelabs.io/cockpit   commit: ____________
Browser / OS: ____________________   Logged out / private window?  Y / N
Unfamiliar with Interlock (has not seen cockpit, README, Devpost or video)?  Y / N
```

---

## Pass 1 — default, mouse allowed

**Q1 · 5 s — "What problem is this page about?"**

```
verbatim:



```
Identified the core problem?  **Y / N**

---

**Q2 · 30 s — "What changed, and why did it change?"**

```
verbatim:



```
Explained the causal delta?  **Y / N**

---

**Q3 · 60 s — "How would you check it yourself?"**

```
verbatim:



```
Located verifiable evidence?  **Y / N**

---

**Q4 · 120 s, after switching to the cloud URL — "Same experiment, or different?"**

```
verbatim:



```
Distinguished the two proof classes?  **Y / N**

---

**Q5 · open — "Anything the page claims but hasn't shown you?"**

```
verbatim:



```

---

## Pass 2 — `&static=1`, keyboard only

```
Q1 verbatim:

Q2 verbatim:

Q3 verbatim:

Q4 verbatim:
```

Semantic answers match pass 1?  **Y / N**
If N, which diverged and how:

```

```

---

## Pass 3 — what the HAC-345/346/347 polish added

Asked after pass 2, on the default URL, mouse allowed. These are diagnostic,
not scored: they exist to catch a treatment that reads well to its author.

**Q6 — "Walk me through it: evidence, then the threshold, then the decision,
then what was permitted or refused."** Do not prompt. Do not name the stages.

```
verbatim:



```
Reached decision/permission without narration?  **Y / N**
Reread any region more than once?  which:

```

```

**Q7 — pointing at the mark beside the decision: "What is that showing you?"**

```
verbatim:



```
Understood it as the state of an evidence-bound gate?  **Y / N**
Read it as a logo, a status light, or decoration?  **Y / N**

**Q8 — "Was there anything on the page that moved? Did it help or distract?"**

```
verbatim:



```

**Q9 — for each icon the reader used to find something, ask what it meant.**
Record any that were read as something other than the concept below.

```
route         proof path / walkthrough      read as: ______________________
scan-search   inspect evidence              read as: ______________________
git-compare   controlled comparison         read as: ______________________
gauge         the bound / threshold         read as: ______________________
git-branch    the revision evidence is bound to
                                            read as: ______________________
circle-check  outcome holds                 read as: ______________________
circle-x      outcome breaches its bound    read as: ______________________
triangle      qualified / unavailable       read as: ______________________
ban           refused / outside the claim   read as: ______________________
rotate-ccw    replay a recorded arm         read as: ______________________
file-check    the frozen raw artifact       read as: ______________________
external      leaves for published evidence read as: ______________________
```

Any icon read as a *different concept* is an ambiguity finding. Remove or
revise that icon — do not explain it to the next reader.

---

## Automatic failures — tick any that occurred

```
[ ] inferred Agent Runtime participated
[ ] inferred Agent Gateway participated
[ ] believed local + cloud are one combined experiment
[ ] believed the cloud run reproduced the 140/120 counterfactual
[ ] read ALLOW as verified / authorized / safe
[ ] read EXECUTED as OBSERVED
[ ] concluded Interlock is universally safe / production-ready
[ ] concluded Interlock prevents collisions in general
[ ] keyboard or reduced-motion pass gave a different semantic answer
[ ] believed the animation timing showed how long anything took to execute
[ ] believed the animation produced or caused the Interlock decision
[ ] read the gate as a padlock, a security badge, or a general safety claim
[ ] read the open gate as the good/safe outcome
[ ] took an icon as the only evidence for a proof or status meaning
```

Any tick = this reader is a **FAIL**, whatever the Y/N answers above.

---

## Moderator notes

Where did they look first? Where did they get stuck? What did they scroll past?

```



```

Did the moderator explain, prompt, or point at any stage?  **Y / N**
(If Y, this reader's result is void — the read was not cold.)
