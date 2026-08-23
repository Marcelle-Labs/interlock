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
```

Any tick = this reader is a **FAIL**, whatever the Y/N answers above.

---

## Moderator notes

Where did they look first? Where did they get stuck? What did they scroll past?

```



```

Did the moderator explain, prompt, or point at any stage?  **Y / N**
(If Y, this reader's result is void — the read was not cold.)
