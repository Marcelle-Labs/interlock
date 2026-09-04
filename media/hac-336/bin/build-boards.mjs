#!/usr/bin/env node
/**
 * Renders the six masters the edit needs and the static suite does not have.
 *
 * HAC-334 froze the still boards a README and a Devpost page need. Four things a
 * cut needs are not among them: a problem that *builds* rather than arriving
 * complete, the HAC-343 four-arm comparison with its ablation control attached,
 * an architecture board bound to the **filmed** run rather than the frozen
 * reference run, and the two typographic cards that open and close an act.
 *
 * The binding rule is the same one HAC-334 works under: nothing here types a
 * number. Every count, status and identifier arrives by reading a frozen
 * evidence file, so a board can be wrong about layout but cannot be wrong about
 * a fact unless the evidence is wrong first.
 *
 * That rule is enforced downstream rather than asserted here.
 * `media/hac-336/bin/verify-film.mjs` re-runs this script into a scratch
 * directory and diffs the result against the committed masters, so a master
 * edited by hand — or a value that stopped matching the evidence it came from —
 * fails the gate. It is the same "derived, not hand-edited" check CI already
 * applies to the HAC-334 masters and the HAC-343 judge export.
 *
 * The architecture board is deliberately bound to the filmed run and to nothing
 * else. IL-DIAG-011 and IL-DIAG-012 already explain this topology, but they name
 * `interlock-hac340-proxy-00002-wzf` and correlation `...1786730369123`, which
 * belong to the frozen reference run. Putting either on screen next to filmed
 * footage would place two run identities in one act and invite exactly the
 * collapse HAC-324 exists to prevent.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExportName, validateExportName } from '../../../scripts/export-naming.mjs';
import {
  text, paragraph, rect, line, arrow, chip, stateColor,
} from '../../hac-334/bin/lib/draw.mjs';
import { composeBoard, panel, W, M, RAIL_Y } from './lib/film-board.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const read = (p) => JSON.parse(readFileSync(join(repoRoot, p), 'utf8'));

/* -- frozen inputs -------------------------------------------------------- */

const arms = read('experiments/hac-330/evidence/arms.json');
const results = read('experiments/hac-330/evidence/results.json');
const judge = read('experiments/hac-343/evidence/judge-export.json');
/*
 * The filmed run is overridable, and the defaults are the frozen first run.
 *
 * RC1 replaced its Proof of Action with a continuous live recording of a SECOND
 * run, in a different project. These two boards name the run they describe, so
 * left on the defaults they would put two run identities in one act - the exact
 * collapse HAC-324 exists to prevent. Overriding lets RC1 render its own copies
 * from its own evidence WITHOUT touching the masters the silent cut is gated on.
 */
const filmed = read(process.env.HAC336_FILMED_RUN ?? 'experiments/hac-324/evidence/filmed-run.json');
const capture = read(process.env.HAC336_CAPTURE_PACKAGE ?? 'experiments/hac-324/evidence/capture-package.json');

const checks = { passed: results.checks.filter((c) => c.passed).length, total: results.checks.length };
const bound = arms.baseline.invariant.report.totalReservable;
const baselineTotal = arms.baseline.invariant.report.total;
const treatmentTotal = arms.treatment.invariant.report.total;
const perturbedTotal = arms.perturbedControl.invariant.report.total;
const constraint = `sum(services[].reserved) <= ${bound}`;
const expr = (total) => `${total} ${total <= bound ? '<=' : '>'} ${bound}`;

/* -- boards --------------------------------------------------------------- */

const boards = [];

/*
 * IL-PROOF-020 -- the problem, built in three holds.
 *
 * The first twenty seconds have to work muted, so the build is the argument:
 * two valid things, then one shared thing, then the joint failure. Arriving at
 * `140 > 130` complete would show the answer before the reader has the question.
 */
{
  const CHIP_Y = 300;
  const laneW = 560;
  const envX = M + laneW + 120;
  const envW = W - M - envX;

  const setup = (t, coupled) => {
    const o = [];
    ['Intent A', 'Intent B'].forEach((label, i) => {
      const y = CHIP_Y + i * 190;
      o.push(rect(M, y, laneW, 132, { stroke: t.hair, width: 1 }));
      o.push(text(M + 28, y + 52, label, { size: 27, fill: t.fg, weight: 500 }));
      o.push(chip(M + 28, y + 74, 'LOCALLY VALID', 'local', { dark: t.dark, size: 18 }).nodes);
      if (coupled) {
        o.push(arrow(M + laneW, y + 66, envX - 8, CHIP_Y + 161, 'coupling', stateColor('coupled', t.dark)));
      }
    });
    if (coupled) {
      o.push(rect(envX, CHIP_Y, envW, 322, { stroke: stateColor('coupled', t.dark), width: 2 }));
      o.push(text(envX + 28, CHIP_Y + 56, 'Shared environment', { size: 27, fill: t.fg, weight: 500 }));
      o.push(chip(envX + 28, CHIP_Y + 82, 'COUPLED', 'coupled', { dark: t.dark, size: 18 }).nodes);
      o.push(text(envX + 28, CHIP_Y + 200, 'JOINT BOUND', { size: 16, mono: true, fill: t.muted, tracking: 2.2 }));
      o.push(text(envX + 28, CHIP_Y + 244, constraint, { size: 25, mono: true, fill: t.fg }));
      o.push(paragraph(envX + 28, CHIP_Y + 290, 'Revision-bound, and derived from the commit history rather than declared.', envW - 56, { size: 17, fill: t.muted }).nodes);
    }
    return o;
  };

  const caption = (t, s) => paragraph(M, 706, s, W - M * 2, { size: 30, fill: t.muted, lineHeight: 1.35 }).nodes;

  const rail = (nonClaim) => [
    `Frozen evidence: ${constraint}  checks ${checks.passed}/${checks.total}`,
    `Non-claim: ${nonClaim}`,
  ];
  const NC = 'this experiment ran locally, not on Google Cloud; no cloud runtime, receipt, protected target or observer exists in it';

  boards.push({
    id: 'IL-PROOF-020',
    slug: 'composition-hazard',
    state: 'intents',
    proofClass: 'A',
    classLabel: 'CONTROLLED LOCAL EXPERIMENT',
    title: 'Two changes, each valid on its own',
    rail: rail(NC),
    render: (t) => [
      setup(t, false),
      caption(t, 'Each intent is checked in its own scope and passes. Nothing is coordinated yet.'),
    ],
  });

  boards.push({
    id: 'IL-PROOF-020',
    slug: 'composition-hazard',
    state: 'coupled',
    proofClass: 'A',
    classLabel: 'CONTROLLED LOCAL EXPERIMENT',
    title: 'One shared environment, one joint bound',
    rail: rail(NC),
    render: (t) => [
      setup(t, true),
      caption(t, 'They write into the same environment, so the constraint applies to their joint outcome, not to either change alone.'),
    ],
  });

  boards.push({
    id: 'IL-PROOF-020',
    slug: 'composition-hazard',
    state: 'baseline',
    proofClass: 'A',
    classLabel: 'CONTROLLED LOCAL EXPERIMENT',
    title: 'Applied together, with no coordination',
    rail: [
      `Frozen evidence: baseline ${expr(baselineTotal)}  ${constraint}`,
      `Non-claim: ${NC}`,
    ],
    render: (t) => {
      const col = stateColor('failed', t.dark);
      return [
        text(M, 300, 'BASELINE ARM - INTERLOCK DISABLED', { size: 17, mono: true, fill: t.muted, tracking: 2.2 }),
        text(M, 460, expr(baselineTotal), { size: 150, mono: true, fill: col, weight: 600, tracking: -4 }),
        chip(M, 508, 'INVALID JOINT STATE', 'failed', { dark: t.dark, size: 20 }).nodes,
        text(W - M, 300, 'JOINT BOUND', { size: 17, mono: true, fill: t.muted, tracking: 2.2, anchor: 'end' }),
        text(W - M, 344, constraint, { size: 25, mono: true, fill: t.fg, anchor: 'end' }),
        paragraph(M, 706, 'Neither change is wrong. The composition is.', W - M * 2, { size: 40, fill: t.fg, weight: 600 }).nodes,
        paragraph(M, 766, 'Both intents passed their own precondition at the base revision. The failure only exists jointly.', W - M * 2, { size: 26, fill: t.muted }).nodes,
      ];
    },
  });
}

/*
 * IL-PROOF-021 -- the bounded four-arm comparison, and its ablation control.
 *
 * The HAC-343 media guardrail requires Panel 1 and Panel 2 to be one contiguous
 * visual unit, so the `0/2` cannot stand alone as a broader safety claim. The
 * two states satisfy that literally: `ablation` is `comparison` with the control
 * panel added, on the same board, so the flattering figure is never on screen
 * without the finding that bounds it.
 */
{
  const rows = judge.panel1.rows;
  const cred = judge.panel1.perTargetLockCredibility;
  const abl = judge.panel2.rows;

  const colX = [M, 900, 1420];
  const headY = 300;
  const rowH = 62;

  const comparison = (t) => {
    const o = [
      text(colX[0], headY, 'STRATEGY', { size: 16, mono: true, fill: t.muted, tracking: 2.2 }),
      paragraph(colX[1], headY, 'Cross-target hazards unsafe', 420, { size: 16, mono: true, fill: t.muted, tracking: 1.4 }).nodes,
      paragraph(colX[2], headY, 'Independent opportunities kept parallel', 420, { size: 16, mono: true, fill: t.muted, tracking: 1.4 }).nodes,
      line(M, headY + 44, W - M, headY + 44, { stroke: t.hair, width: 1 }),
    ];
    rows.forEach((r, i) => {
      const y = headY + 96 + i * rowH;
      const isIL = r.arm === 'A4_interlock';
      const unsafeCol = stateColor(r.coupledUnsafe.numerator === 0 ? 'observed' : 'failed', t.dark);
      const parCol = stateColor(r.safeParallelism.numerator > 0 ? 'observed' : 'blocked', t.dark);
      if (isIL) o.push(rect(M - 16, y - 40, W - M * 2 + 32, rowH, { stroke: t.fg, width: 2 }));
      o.push(text(colX[0], y, r.label, { size: 28, fill: t.fg, weight: isIL ? 600 : 400 }));
      o.push(text(colX[1], y, r.coupledUnsafe.display, { size: 34, mono: true, fill: unsafeCol, weight: 600 }));
      o.push(text(colX[2], y, r.safeParallelism.display, { size: 34, mono: true, fill: parCol, weight: 600 }));
    });
    return o;
  };

  const credibility = (t, y) => [
    panel(M, y, W - M * 2, 138, 'IS THE PER-TARGET LOCK A REAL LOCK?', t, { stroke: t.hair }),
    [
      [`same-target contention serialized ${cred.serializedSameTargetContention.display}`, M + 24],
      [`cross-target pairs parallelized ${cred.parallelisedCrossTarget.display}`, M + 620],
      [`cross-target hazards missed ${cred.missedCrossTargetHazards.display}`, M + 1180],
    ].map(([s, x]) => text(x, y + 82, s, { size: 21, mono: true, fill: t.fg })),
    paragraph(M + 24, y + 118, cred.note, W - M * 2 - 48, { size: 19, fill: t.muted }).nodes,
  ];

  const railFor = (nonClaim) => [
    'Frozen evidence: '
      + rows.map((r) => `${r.label.replace(/ /g, '-')} ${r.coupledUnsafe.display}/${r.safeParallelism.display}`).join('  '),
    `Non-claim: ${nonClaim}`,
  ];
  const NC1 = 'bounded to this sixteen-scenario corpus; Interlock is not universally safe and not safer than locking; no interval or significance is claimed';

  boards.push({
    id: 'IL-PROOF-021',
    slug: 'bounded-four-arm-comparison',
    state: 'comparison',
    proofClass: 'A',
    classLabel: 'CONTROLLED LOCAL EVALUATION',
    title: 'Four coordination strategies, one frozen corpus',
    rail: railFor(NC1),
    render: (t) => [
      comparison(t),
      credibility(t, 636),
      paragraph(M, 828, judge.panel1.reading, W - M * 2, { size: 24, fill: t.muted, lineHeight: 1.4 }).nodes,
    ],
  });

  boards.push({
    id: 'IL-PROOF-021',
    slug: 'bounded-four-arm-comparison',
    state: 'ablation',
    proofClass: 'A',
    classLabel: 'CONTROLLED LOCAL EVALUATION',
    title: 'The same result, with its evidence removed',
    rail: [
      `Frozen evidence: interlock ${rows[3].coupledUnsafe.display}/${rows[3].safeParallelism.display}  `
        + `evidence present ${abl[0].invalidOutcomes.display} invalid  evidence removed ${abl[1].invalidOutcomes.display} invalid`,
      `Non-claim: ${NC1}`,
    ],
    render: (t) => {
      const o = [comparison(t)];
      // The A3 credibility strip stays on screen with the table it qualifies.
      // The guardrail asks for it beside Panel 1, and Panel 1 is on this state
      // too: dropping it here would leave the per-target lock's 2/2 looking
      // like a straw man for the eighteen seconds this board holds.
      o.push(text(M, 626,
        `per-target lock: same-target serialized ${cred.serializedSameTargetContention.display}`
        + `   cross-target parallelized ${cred.parallelisedCrossTarget.display}`
        + `   cross-target hazards missed ${cred.missedCrossTargetHazards.display}`,
        { size: 19, mono: true, fill: t.muted }));
      const y = 660;
      o.push(panel(M, y, W - M * 2, 196, 'EVIDENCE ABLATION - SAME INTENTS, SAME DECISION CORE', t,
        { stroke: t.fg, width: 2 }));
      abl.forEach((r, i) => {
        const ry = y + 88 + i * 62;
        const col = stateColor(r.invalidOutcomes.numerator === 0 ? 'observed' : 'failed', t.dark);
        o.push(text(M + 24, ry, r.condition, { size: 25, fill: t.fg }));
        o.push(text(M + 900, ry, `${r.invalidOutcomes.display} invalid`, { size: 30, mono: true, fill: col, weight: 600 }));
        o.push(text(M + 1240, ry, r.decision.join(' / '), { size: 21, mono: true, fill: t.muted }));
      });
      o.push(paragraph(M, 896, judge.panel2.reading, W - M * 2, { size: 24, fill: t.fg, lineHeight: 1.35 }).nodes);
      return o;
    },
  });
}

/*
 * IL-SCAF-020 -- the proof-class reset.
 *
 * HAC-333's SB-06. The field inverts completely and the board carries no
 * caption, because the split itself is the proposition. It is the only frame in
 * the cut that draws both classes at once, and it draws them as two halves that
 * do not touch.
 */
boards.push({
  id: 'IL-SCAF-020',
  slug: 'proof-class-reset',
  state: 'reset',
  proofClass: 'A',
  classLabel: 'PROOF-CLASS RESET',
  title: 'Different run. Different evidence.',
  rail: [
    'Frozen evidence: two proof classes, recorded separately',
    'Non-claim: no claim crosses between the two runs; the Google Cloud run does not reproduce the controlled local counterfactual',
  ],
  render: (t) => {
    const half = (W - M * 2 - 64) / 2;
    const top = 300;
    const h = 540;
    const right = M + half + 64;
    return [
      rect(right, top, half, h, { fill: '#0b0d0e' }),
      text(M, top + 48, 'WHAT YOU HAVE SEEN', { size: 17, mono: true, fill: t.muted, tracking: 2.2 }),
      text(M, top + 120, 'Controlled local', { size: 46, fill: t.fg, weight: 600 }),
      text(M, top + 176, 'experiment', { size: 46, fill: t.fg, weight: 600 }),
      paragraph(M, top + 250, 'Deterministic and local. No cloud runtime, no receipt, no protected target, no independent observer.', half - 24, { size: 24, fill: t.muted, lineHeight: 1.4 }).nodes,
      text(right + 32, top + 48, 'WHAT COMES NEXT', { size: 17, mono: true, fill: '#9ba2a2', tracking: 2.2 }),
      text(right + 32, top + 120, 'Google Cloud', { size: 46, fill: '#f2f3f2', weight: 600 }),
      text(right + 32, top + 176, 'participation', { size: 46, fill: '#f2f3f2', weight: 600 }),
      paragraph(right + 32, top + 250, 'One recorded traversal on real Google Cloud infrastructure, filmed while it ran. A different run, with its own evidence.', half - 64, { size: 24, fill: '#9ba2a2', lineHeight: 1.4 }).nodes,
      text(M, top + h + 80, 'Nothing crosses.', { size: 44, fill: t.fg, weight: 600 }),
    ];
  },
});

/*
 * IL-DIAG-020 -- the architecture, bound to the filmed run.
 *
 * Two states. `path` answers where Interlock sits and what it gates; `boundary`
 * adds what the deployment does and does not establish. Splitting them keeps one
 * diagram on screen at a time, which is the whole point of preferring one clear
 * diagram over two dense ones.
 */
{
  const proxyRevision = filmed.runtimeProof.proxyLogEntries[0].resource.labels.revision_name;
  const nodes = [
    ['01', 'Gemini', filmed.model],
    ['02', 'Agent framework', filmed.adkPath],
    ['03', 'Cloud Run agent', `${capture.region} / ${capture.revisions.agent}`],
    ['04', 'Interlock MCP proxy', capture.revisions.proxy],
    ['05', 'Decision + receipt', `${filmed.decision} / ${filmed.receiptId.slice(0, 18)}...`],
    ['06', 'Protected target', capture.revisions.target],
    ['07', 'Independent observer', 'keyless observer service account'],
    ['08', 'Cloud Logging', `correlated by ${filmed.correlationId}`],
  ];

  const grid = (t) => {
    const o = [];
    const cols = 4;
    const gw = (W - M * 2 - 3 * 28) / cols;
    const gh = 150;
    nodes.forEach(([n, label, value], i) => {
      const x = M + (i % cols) * (gw + 28);
      const y = 300 + Math.floor(i / cols) * (gh + 40);
      const gated = i === 3 || i === 4;
      o.push(rect(x, y, gw, gh, { stroke: gated ? t.fg : t.hair, width: gated ? 2 : 1 }));
      o.push(text(x + 20, y + 34, n, { size: 15, mono: true, fill: t.muted, tracking: 2 }));
      o.push(text(x + 20, y + 74, label, { size: 23, fill: t.fg, weight: gated ? 600 : 500 }));
      o.push(paragraph(x + 20, y + 106, value, gw - 40, { size: 16, mono: true, fill: t.muted }).nodes);
      if (i % cols !== cols - 1) {
        o.push(arrow(x + gw + 2, y + gh / 2, x + gw + 24, y + gh / 2, 'mutation', t.muted));
      }
    });
    return o;
  };

  const rail = [
    `Frozen evidence: ${filmed.correlationId}  ${proxyRevision}  runtime source ${filmed.commitSha.slice(0, 12)}`,
    'Non-claim: Cloud Run IAM establishes transport provenance only; internal Interlock roles are not Google-managed identities',
  ];

  boards.push({
    id: 'IL-DIAG-020',
    slug: 'filmed-run-path',
    state: 'path',
    proofClass: 'B',
    classLabel: 'GOOGLE CLOUD PARTICIPATION - AUTHORITATIVE FILMED RUN',
    title: 'Where Interlock sits on the recorded path',
    rail,
    render: (t) => [
      grid(t),
      paragraph(M, 706, 'Interlock reads revision-bound composition evidence before the mutation and gates it with a decision and a receipt. The protected target refused a direct call that carried no receipt.', W - M * 2, { size: 27, fill: t.fg, lineHeight: 1.4 }).nodes,
      text(M, 806, `A direct target call with no receipt returned ${filmed.controls.directBypassStatus}.`, { size: 23, mono: true, fill: t.muted }),
    ],
  });

  boards.push({
    id: 'IL-DIAG-020',
    slug: 'filmed-run-path',
    state: 'boundary',
    proofClass: 'B',
    classLabel: 'GOOGLE CLOUD PARTICIPATION - AUTHORITATIVE FILMED RUN',
    title: 'What the deployment does and does not establish',
    rail,
    render: (t) => {
      const half = (W - M * 2 - 48) / 2;
      const top = 300;
      const idSrc = filmed.runtimeProof.proxyLogEntries[0].jsonPayload.identitySource;
      return [
        panel(M, top, half, 250, 'TRANSPORT PROVENANCE', t, { dash: '2 4' }),
        text(M + 24, top + 96, idSrc, { size: 24, mono: true, fill: t.fg }),
        paragraph(M + 24, top + 140, 'Cloud Run IAM establishes which platform-verified identity made the call.', half - 48, { size: 21, fill: t.muted }).nodes,
        panel(M + half + 48, top, half, 250, 'APPLICATION / RECEIPT PROVENANCE', t, { stroke: t.fg, width: 2 }),
        text(M + half + 72, top + 96, `${filmed.receiptDigest.slice(0, 30)}...`, { size: 22, mono: true, fill: t.fg }),
        paragraph(M + half + 72, top + 140, 'The Interlock decision and its receipt. Distinct from transport provenance, and not derived from it.', half - 48, { size: 21, fill: t.muted }).nodes,
        text(M, top + 330, 'THESE DO NOT COLLAPSE', { size: 17, mono: true, fill: t.muted, tracking: 2.2 }),
        paragraph(M, top + 380, 'Cloud Run IAM does not establish Google-managed proposer, reviewer or authorizer roles inside Interlock.', W - M * 2, { size: 27, fill: t.fg, lineHeight: 1.4 }).nodes,
        panel(M, top + 430, W - M * 2, 128, 'ABSENT FROM THIS DEPLOYMENT', t, { dash: '2 4' }),
        text(M + 24, top + 512, 'Agent Runtime    Agent Gateway    CONTENT_AUTHZ', { size: 26, mono: true, fill: t.fg }),
      ];
    },
  });
}

/*
 * IL-PROOF-022 -- what the evaluation is bounded by.
 *
 * Including the negative finding. Two of eight refusal reasons disagreed with
 * the frozen corpus; the corpus is frozen and stays wrong on the record. A
 * limitations board that only lists comfortable limitations is marketing.
 */
{
  const lim = judge.limitations;
  const inad = lim.inadmissibleEvidence;
  boards.push({
    id: 'IL-PROOF-022',
    slug: 'evaluation-bounds',
    state: 'bounds',
    proofClass: 'A',
    classLabel: 'CONTROLLED LOCAL EVALUATION - BOUNDS',
    title: 'What this evaluation is bounded by',
    rail: [
      `Frozen evidence: matrix ${judge.provenance.matrix.display}  families ${judge.provenance.families.join('+')}  `
        + `failed closed ${inad.failedClosed.display}  reason agreement ${inad.exactReasonAgreement.display}`,
      'Non-claim: no population estimate, no interval, no significance; exactly-once, restart safety, target-side atomicity and production readiness were not tested',
    ],
    render: (t) => {
      const half = (W - M * 2 - 48) / 2;
      const top = 290;
      const outside = lim.outsideScope;
      return [
        panel(M, top, half, 300, 'THE CORPUS', t),
        paragraph(M + 24, top + 84, lim.corpusBound, half - 48, { size: 22, fill: t.fg, lineHeight: 1.45 }).nodes,
        panel(M + half + 48, top, half, 300, 'NOT TESTED, AND NOT CLAIMED', t),
        // Each item carries its own negator rather than relying on the panel
        // label five lines above it. A reader who scans one line has to get the
        // same answer as one who reads the heading.
        outside.map((s, i) => text(M + half + 72, top + 90 + i * 40, `no ${s}`, { size: 21, fill: t.fg })),
        panel(M, top + 348, W - M * 2, 260, 'NEGATIVE FINDING, RETAINED', t, { stroke: t.fg, width: 2 }),
        text(M + 24, top + 428, `inadmissible evidence failed closed ${inad.failedClosed.display}`,
          { size: 26, mono: true, fill: stateColor('observed', t.dark), weight: 600 }),
        text(M + 24, top + 476, `exact refusal-reason agreement ${inad.exactReasonAgreement.display}`,
          { size: 26, mono: true, fill: stateColor('blocked', t.dark), weight: 600 }),
        paragraph(M + 24, top + 522, inad.statement, W - M * 2 - 48, { size: 21, fill: t.muted, lineHeight: 1.4 }).nodes,
      ];
    },
  });
}

/*
 * IL-SCAF-021 -- the close.
 *
 * One proposition and the mechanism that earns it. No new claim arrives in the
 * last ten seconds of a submission video.
 */
boards.push({
  id: 'IL-SCAF-021',
  slug: 'closing-thesis',
  state: 'thesis',
  proofClass: 'A',
  classLabel: 'CLOSE',
  title: 'Valid alone does not mean safe together.',
  rail: [
    `Frozen evidence: ${expr(baselineTotal)}  ${expr(treatmentTotal)}  ${expr(perturbedTotal)}`,
    'Non-claim: no safety, security, verification or production-readiness guarantee is claimed',
  ],
  render: (t) => [
    paragraph(M, 360, 'Interlock reads revision-bound evidence about the composition before the mutation.', W - M * 2, { size: 54, fill: t.fg, weight: 600, lineHeight: 1.25 }).nodes,
    line(M, 540, W - M, 540, { stroke: t.hair, width: 1 }),
    text(M, 620, 'Parallel', { size: 40, fill: stateColor('observed', t.dark), weight: 600 }),
    paragraph(M, 668, 'when the evidence supports the composition.', 700, { size: 26, fill: t.muted }).nodes,
    text(M + 940, 620, 'Serialized', { size: 40, fill: stateColor('blocked', t.dark), weight: 600 }),
    paragraph(M + 940, 668, 'when it does not.', 700, { size: 26, fill: t.muted }).nodes,
    text(M, 830, 'The evidence is load-bearing: remove it and the decision reverses.', { size: 27, fill: t.fg }),
  ],
});

/* -- emit ----------------------------------------------------------------- */

const mastersDir = process.env.HAC336_BOARDS_OUT
  ? join(repoRoot, process.env.HAC336_BOARDS_OUT)
  : join(repoRoot, 'media', 'hac-336', 'masters');
mkdirSync(mastersDir, { recursive: true });
for (const f of readdirSync(mastersDir)) if (f.endsWith('.svg')) rmSync(join(mastersDir, f));

let n = 0;
for (const b of boards) {
  const name = buildExportName({ id: b.id, slug: `${b.slug}-${b.state}`, ext: 'svg' });
  const check = validateExportName(name);
  if (!check.valid) throw new Error(`built an unparseable export name ${name}: ${check.error}`);
  writeFileSync(join(mastersDir, name), composeBoard(b));
  n += 1;
}

process.stdout.write(`HAC-336 film boards rendered\n  ${n} SVG masters in media/hac-336/masters\n`);
