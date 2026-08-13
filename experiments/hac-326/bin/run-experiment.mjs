#!/usr/bin/env node
/**
 * HAC-326 / S2 — the fallback enforcement experiment.
 *
 * Runs every arm of the gate against the real services over real sockets and
 * writes the evidence packet. Nothing here is a mock: the proxy and the target
 * are the same objects the Cloud Run images run, reached over loopback HTTP.
 *
 * The arms, in the order they run:
 *
 *   1. contract      — freeze the request envelope and the observed identity
 *   2. safe          — an independent pair is allowed and executes
 *   3. unsafe        — a coupled pair is denied before the second mutation
 *   4. target        — ten direct attacks on the protected target
 *   5. chaos         — outage, timeout, store loss, bad evidence, stale evidence
 *   6. correlation   — one identifier across caller, proxy, target, mutation
 *   7. observation   — acknowledgement is not observation
 *   8. latency       — a distribution, not one happy-path number
 *
 * Run with:  node experiments/hac-326/bin/run-experiment.mjs
 * Requires:  pnpm run build   (the services are compiled TypeScript)
 */
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const experimentDir = join(here, '..');
const repoRoot = join(experimentDir, '..', '..');
const evidenceDir = join(experimentDir, 'evidence');
const dist = join(repoRoot, 'dist');

const load = async (relative) => {
  try {
    return await import(join(dist, relative));
  } catch (error) {
    throw new Error(
      `cannot load ${relative} from dist/. Run "pnpm run build" first.\n  ${error.message}`,
    );
  }
};

const { intentDigest } = await load('authorization/intent.js');
const { RECEIPT_VERSION, signReceipt } = await load('authorization/receipt.js');
const { InMemoryReplayLedger, UnavailableReplayLedger } = await load('broker/idempotency/ledger.js');
const { InMemoryPendingIntentStore, UnavailablePendingIntentStore } = await load(
  'broker/pairing/store.js',
);
const { CORRELATION_HEADER, RECEIPT_HEADER } = await load('correlation.js');
const { createProxyServer } = await load('proxy/http.js');
const { InterlockProxy } = await load('proxy/service.js');
const { HttpTargetPort } = await load('proxy/target-port.js');
const { admit } = await load('broker/bypass/guard.js');
const { createTargetServer, encodeReceiptHeader } = await load('target/http.js');
const { ProtectedTarget } = await load('target/service.js');
const { INITIAL_STATE, reservationPath } = await load('target/state.js');
const { observe, record, LifecycleState } = await load('observation/events.js');

const TARGET_ID = 'interlock-s2-target';
const EVIDENCE_PATH = join(repoRoot, 'experiments', 'hac-330', 'evidence', 'baseline.evidence.json');
const EVIDENCE = JSON.parse(readFileSync(EVIDENCE_PATH, 'utf8'));
const SOURCE_REVISION = EVIDENCE.selection.scoringBasis.basisRevision;

const checks = [];
const check = (id, criterion, passed, detail) => {
  checks.push({ id, criterion, passed, detail });
  process.stdout.write(`${passed ? 'PASS' : 'FAIL'}  ${id}  ${criterion}\n`);
  if (!passed) process.stdout.write(`      ${detail}\n`);
};

const write = (name, value) => {
  writeFileSync(join(evidenceDir, name), `${JSON.stringify(value, null, 2)}\n`);
};

/** Redact anything that identifies a run rather than a contract. */
const sanitizeHeaders = (headers) => {
  const keep = {};
  for (const [name, value] of Object.entries(headers)) {
    keep[name] = ['authorization', 'cookie', 'x-goog-iap-jwt-assertion'].includes(name)
      ? '<redacted>'
      : value;
  }
  return keep;
};

const listen = (server) =>
  new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });

const close = (server) => new Promise((resolve) => server.close(resolve));

/** Build a complete, isolated topology. Each arm gets a fresh one. */
async function topology(options = {}) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const signingKey = { keyId: 'interlock-s2-run', privateKey };
  const keys = new Map([['interlock-s2-run', publicKey]]);

  const target = new ProtectedTarget({
    targetId: TARGET_ID,
    keys,
    ledger: options.ledger ?? new InMemoryReplayLedger(),
  });
  const targetServer = createTargetServer({ target });
  const targetUrl = await listen(targetServer);

  const envelopes = [];
  const proxy = new InterlockProxy({
    targetId: TARGET_ID,
    store: options.store ?? new InMemoryPendingIntentStore(),
    target: options.port?.(target, targetUrl) ?? new HttpTargetPort({ baseUrl: targetUrl }),
    signingKey,
    evidence: 'evidence' in options ? options.evidence : EVIDENCE,
    sourceRevision: options.sourceRevision ?? SOURCE_REVISION,
    ...(options.decisionTimeoutMs ? { decisionTimeoutMs: options.decisionTimeoutMs } : {}),
  });
  const proxyServer = createProxyServer({ proxy, onEnvelope: (e) => envelopes.push(e) });
  const proxyUrl = await listen(proxyServer);

  return {
    target,
    targetUrl,
    proxyUrl,
    signingKey,
    publicKey,
    envelopes,
    async stop() {
      await close(proxyServer);
      await close(targetServer);
    },
  };
}

const postIntent = (proxyUrl, service, reserved, headers = {}) =>
  fetch(`${proxyUrl}/v1/intents`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ operation: 'set_reservation', arguments: { service, reserved } }),
  });

const callTool = (proxyUrl, service, reserved, headers = {}) =>
  fetch(`${proxyUrl}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'set_reservation', arguments: { service, reserved } },
    }),
  });

const readState = async (targetUrl) => (await (await fetch(`${targetUrl}/v1/state`)).json());

mkdirSync(evidenceDir, { recursive: true });

// ---------------------------------------------------------------------------
// 1. Freeze the request contract and the identity shape.
// ---------------------------------------------------------------------------
{
  const t = await topology();

  const mcpResponse = await callTool(t.proxyUrl, 'gamma', 21);
  const mcpBody = await mcpResponse.json();
  const httpResponse = await postIntent(t.proxyUrl, 'gamma', 22);
  await httpResponse.json();

  const [mcpEnvelope, httpEnvelope] = t.envelopes;

  write('request-envelope.json', {
    note:
      'The exact envelopes observed at the proxy, captured from a running service. ' +
      'Header values that identify a run are redacted; header NAMES are the contract.',
    mcp: {
      transport: mcpEnvelope.transport,
      headers: sanitizeHeaders(mcpEnvelope.headers),
      body: mcpEnvelope.body,
      responseShape: mcpBody,
    },
    http: {
      transport: httpEnvelope.transport,
      headers: sanitizeHeaders(httpEnvelope.headers),
      body: httpEnvelope.body,
    },
  });

  write('identity.json', {
    note:
      'Caller identity as ACTUALLY observed by the proxy. Nothing here is inferred from ' +
      'documentation. The loopback run carries no authenticated principal, which is recorded ' +
      'as a limitation rather than filled in.',
    observedLocally: {
      identity: mcpEnvelope.identity,
      identitySource: mcpEnvelope.identitySource,
    },
    sourcesTheProxyCanRead: [
      {
        source: 'x-goog-authenticated-user-email/platform-verified',
        precondition: 'IAP or Cloud Run forwards an end-user identity header',
      },
      {
        source: 'oidc-id-token/platform-verified:email',
        precondition:
          'Cloud Run deployed with --no-allow-unauthenticated; the platform verifies the ' +
          'Google-signed ID token before the container is invoked',
      },
      {
        source: 'oidc-id-token/platform-verified:sub',
        precondition: 'as above, for a token carrying no email claim',
      },
      {
        source: 'none/no-authenticated-principal-observed',
        precondition: 'anything else — recorded, never guessed',
      },
    ],
    limitation:
      'No Agent Runtime agent identity is bound. HAC-325 established that the Agent Gateway ' +
      'path does not deliver a request to an extension at all, so the agent-identity fields ' +
      'that path would have carried were never observed and are not claimed here.',
  });

  check(
    'CONTRACT-1',
    'the exact proxy request envelope is captured from a running service',
    mcpEnvelope !== undefined && httpEnvelope !== undefined,
    `mcp and http envelopes recorded`,
  );
  check(
    'CONTRACT-2',
    'caller identity is recorded as observed, and absence is recorded as absence',
    mcpEnvelope.identity === 'unavailable' &&
      mcpEnvelope.identitySource === 'none/no-authenticated-principal-observed',
    `observed ${mcpEnvelope.identity} via ${mcpEnvelope.identitySource}`,
  );

  await t.stop();
}

// ---------------------------------------------------------------------------
// 2. Safe independent pair.
// ---------------------------------------------------------------------------
{
  const t = await topology();

  const first = await (await postIntent(t.proxyUrl, 'alpha', 50)).json();
  const second = await (await postIntent(t.proxyUrl, 'gamma', 25)).json();
  const state = await readState(t.targetUrl);

  write('decision-allow.json', {
    note: 'A safe independent pair. alpha and gamma never co-changed in the mined history.',
    first,
    second,
    finalState: state,
  });

  check(
    'SAFE-1',
    'a safe independent request is allowed and the mutation executes',
    first.decision === 'ALLOW' && state.state.services.alpha === 50,
    `decision ${first.decision}, alpha=${state.state.services.alpha}`,
  );
  check(
    'SAFE-2',
    'a second, uncoupled request is also allowed',
    second.decision === 'ALLOW' && state.state.services.gamma === 25,
    `decision ${second.decision}, gamma=${state.state.services.gamma}`,
  );

  await t.stop();
}

// ---------------------------------------------------------------------------
// 3. Unsafe composed pair — denied before the second mutation.
// ---------------------------------------------------------------------------
{
  const t = await topology();

  const [alpha, beta] = await Promise.all([
    postIntent(t.proxyUrl, 'alpha', 60).then((r) => r.json()),
    postIntent(t.proxyUrl, 'beta', 60).then((r) => r.json()),
  ]);

  const state = await readState(t.targetUrl);
  const total = Object.values(state.state.services).reduce((sum, n) => sum + n, 0);
  const allowed = [alpha, beta].filter((a) => a.decision === 'ALLOW');
  const denied = [alpha, beta].filter((a) => a.decision === 'DENY');

  write('decision-deny.json', {
    note:
      'Two individually valid intents submitted concurrently. Real commit history shows ' +
      'alpha and beta co-changing at support 8, so the composition is refused. Exactly one ' +
      'proceeds — serialization, not mutual refusal.',
    alpha,
    beta,
    finalState: state,
    counterfactual: {
      claim: 'had both landed, the pool invariant would have been breached',
      totalIfBothApplied: 60 + 60 + 20,
      totalReservable: INITIAL_STATE.totalReservable,
      wouldBreach: 60 + 60 + 20 > INITIAL_STATE.totalReservable,
      actualTotal: total,
    },
  });

  check(
    'UNSAFE-1',
    'the unsafe composed pair is not composed — exactly one intent proceeds',
    allowed.length === 1 && denied.length === 1,
    `${allowed.length} allowed, ${denied.length} denied`,
  );
  check(
    'UNSAFE-2',
    'the denial reaches the caller with a machine-readable rationale and evidence refs',
    denied[0]?.reasonCode === 'COUPLING_OBSERVED' &&
      Array.isArray(denied[0]?.couplings) &&
      denied[0].couplings[0].support === 8 &&
      denied[0].evidenceRefs.some((ref) => ref.startsWith('basis:')),
    `reasonCode ${denied[0]?.reasonCode}, support ${denied[0]?.couplings?.[0]?.support}`,
  );
  check(
    'UNSAFE-3',
    'no receipt is issued on a denial, so there is nothing to replay later',
    denied[0]?.receiptId === undefined,
    `receiptId ${String(denied[0]?.receiptId)}`,
  );
  check(
    'UNSAFE-4',
    'the target invariant holds — the harm the composition would have caused did not occur',
    total <= INITIAL_STATE.totalReservable,
    `total ${total} <= ${INITIAL_STATE.totalReservable}`,
  );

  await t.stop();
}

// ---------------------------------------------------------------------------
// 4. Ten direct attacks on the protected target.
// ---------------------------------------------------------------------------
{
  const t = await topology();
  const rejections = [];

  const mint = (intent, overrides = {}) =>
    signReceipt(
      {
        receiptVersion: RECEIPT_VERSION,
        receiptId: `rcpt-attack-${rejections.length}`,
        correlationId: 'ilk-directattack',
        caller: { identity: 'attacker@example.test', identitySource: 'experiment' },
        operation: intent.operation,
        intentDigest: intentDigest(intent),
        target: { targetId: TARGET_ID, expectedRevision: t.target.revision },
        evidence: { basisRevision: SOURCE_REVISION, artifactSha256: 'x', producerSha: 'y' },
        decision: 'ALLOW',
        issuedAt: new Date(Date.now() - 1000).toISOString(),
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
        nonce: `nonce-attack-${rejections.length}`,
        ...overrides,
      },
      t.signingKey,
    );

  const attack = async (id, description, intent, headers) => {
    const before = await readState(t.targetUrl);
    const response = await fetch(`${t.targetUrl}/v1/mutate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(intent),
    });
    const body = await response.json();
    const after = await readState(t.targetUrl);

    rejections.push({
      id,
      description,
      status: response.status,
      reasonCode: body.reasonCode,
      detail: body.detail,
      stateUnchanged: JSON.stringify(before.state) === JSON.stringify(after.state),
      revisionUnchanged: before.revision === after.revision,
    });
    return rejections.at(-1);
  };

  const alpha41 = { operation: 'set_reservation', arguments: { service: 'alpha', reserved: 41 } };

  await attack('TGT-1', 'no receipt at all (bypass)', alpha41, {});
  await attack('TGT-2', 'malformed receipt header', alpha41, { [RECEIPT_HEADER]: 'not-base64url' });

  const edited = mint(alpha41);
  edited.claims.target.targetId = 'some-other-target';
  await attack('TGT-3', 'receipt edited after signing', alpha41, {
    [RECEIPT_HEADER]: encodeReceiptHeader(edited),
  });

  await attack('TGT-4', 'expired receipt', alpha41, {
    [RECEIPT_HEADER]: encodeReceiptHeader(
      mint(alpha41, {
        issuedAt: new Date(Date.now() - 120_000).toISOString(),
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    ),
  });

  await attack('TGT-6', 'receipt addressed to a different target', alpha41, {
    [RECEIPT_HEADER]: encodeReceiptHeader(
      mint(alpha41, { target: { targetId: 'other-service', expectedRevision: t.target.revision } }),
    ),
  });

  await attack('TGT-7', 'receipt lifted onto a different operation', alpha41, {
    [RECEIPT_HEADER]: encodeReceiptHeader(mint(alpha41, { operation: 'delete_everything' })),
  });

  await attack(
    'TGT-8',
    'receipt whose arguments were changed in transit',
    { operation: 'set_reservation', arguments: { service: 'alpha', reserved: 120 } },
    { [RECEIPT_HEADER]: encodeReceiptHeader(mint(alpha41)) },
  );

  const fabricated = generateKeyPairSync('ed25519');
  await attack('TGT-9', 'receipt fabricated with an untrusted key', alpha41, {
    [RECEIPT_HEADER]: encodeReceiptHeader(
      signReceipt(mint(alpha41).claims, { keyId: 'interlock-s2-run', privateKey: fabricated.privateKey }),
    ),
  });

  // Replay: execute once legitimately, then present identical bytes again.
  const replayIntent = { operation: 'set_reservation', arguments: { service: 'gamma', reserved: 21 } };
  const replayReceipt = encodeReceiptHeader(mint(replayIntent));
  const firstUse = await fetch(`${t.targetUrl}/v1/mutate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [RECEIPT_HEADER]: replayReceipt },
    body: JSON.stringify(replayIntent),
  });
  const replay = await attack('TGT-10', 'receipt replayed after a successful use', replayIntent, {
    [RECEIPT_HEADER]: replayReceipt,
  });

  // Stale revision, isolated: mint against the current revision, advance the
  // target, then present. The mutation itself would not breach the invariant,
  // so only the revision binding can refuse it.
  const staleIntent = { operation: 'set_reservation', arguments: { service: 'beta', reserved: 41 } };
  const staleReceipt = encodeReceiptHeader(mint(staleIntent));
  const advance = { operation: 'set_reservation', arguments: { service: 'alpha', reserved: 42 } };
  await fetch(`${t.targetUrl}/v1/mutate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [RECEIPT_HEADER]: encodeReceiptHeader(mint(advance)) },
    body: JSON.stringify(advance),
  });
  const stale = await attack('TGT-5', 'receipt bound to a superseded target revision', staleIntent, {
    [RECEIPT_HEADER]: staleReceipt,
  });

  // The nonce ledger, isolated.
  //
  // TGT-10 above is refused, but by the STALE_REVISION check rather than by the
  // ledger: executing the first use advanced the revision, so a replayed receipt
  // is necessarily also stale. That is worth recording rather than glossing —
  // with a hash-chained revision, revision binding subsumes replay for a
  // single-writer target. The ledger becomes load-bearing exactly when the
  // revision can repeat: a restored backup, a second target instance, or a
  // target whose revision is a counter rather than a chain.
  //
  // So the ledger is proven against the admission gate with the revision held
  // constant, which is the only condition under which the two checks can be told
  // apart.
  const ledgerIntent = { operation: 'set_reservation', arguments: { service: 'beta', reserved: 43 } };
  const ledger = new InMemoryReplayLedger();
  const ledgerReceipt = mint(ledgerIntent);
  const constantRevision = t.target.revision;
  const expectations = {
    targetId: TARGET_ID,
    currentRevision: constantRevision,
    operation: ledgerIntent.operation,
    intentDigest: intentDigest(ledgerIntent),
    now: new Date(),
    keys: new Map([[t.signingKey.keyId, t.publicKey]]),
  };
  const firstAdmission = admit({ presented: ledgerReceipt, ledger, expectations });
  const secondAdmission = admit({ presented: ledgerReceipt, ledger, expectations });

  rejections.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  write('target-rejections.json', {
    note:
      'Every attack is made DIRECTLY against the protected target, bypassing the proxy. ' +
      'stateUnchanged/revisionUnchanged prove the refusal happened before the side effect.',
    firstUseOfReplayedReceipt: firstUse.status,
    rejections,
    nonceLedgerIsolated: {
      note:
        'TGT-10 is refused by STALE_REVISION, not by the ledger: a successful first use advances ' +
        'the hash-chained revision, so a replayed receipt is necessarily stale too. The ledger is ' +
        'therefore exercised here with the revision held constant — the only condition that ' +
        'distinguishes the two checks.',
      constantRevision,
      firstAdmission: { admitted: firstAdmission.admitted },
      secondAdmission: {
        admitted: secondAdmission.admitted,
        reasonCode: secondAdmission.reasonCode,
        detail: secondAdmission.detail,
      },
    },
  });

  const allRefused = rejections.every((r) => r.status === 403);
  const noSideEffects = rejections.every((r) => r.stateUnchanged && r.revisionUnchanged);

  check(
    'TGT-ALL',
    'every unauthorized shape is refused by the target itself',
    allRefused,
    rejections.filter((r) => r.status !== 403).map((r) => `${r.id}:${r.status}`).join(', ') || 'all 403',
  );
  check(
    'TGT-NOSIDEEFFECT',
    'every refusal happens before the protected side effect',
    noSideEffects,
    rejections.filter((r) => !r.stateUnchanged).map((r) => r.id).join(', ') || 'state and revision unchanged',
  );
  check(
    'TGT-REPLAY',
    'a replayed receipt is refused on second presentation',
    firstUse.status === 200 && replay.status === 403,
    `first ${firstUse.status}, replay ${replay.status} (${replay.reasonCode})`,
  );
  check(
    'TGT-NONCE',
    'the nonce ledger independently refuses a second use at an unchanged revision',
    firstAdmission.admitted === true &&
      secondAdmission.admitted === false &&
      secondAdmission.reasonCode === 'RECEIPT_REPLAYED',
    `first admitted ${firstAdmission.admitted}, second ${secondAdmission.reasonCode}`,
  );
  check(
    'TGT-STALE',
    'a receipt bound to a superseded revision is refused',
    stale.status === 403 && stale.reasonCode === 'RECEIPT_STALE_REVISION',
    `${stale.status} ${stale.reasonCode}`,
  );

  await t.stop();
}

// ---------------------------------------------------------------------------
// 5. Chaos — failure must not become bypass.
// ---------------------------------------------------------------------------
{
  const arms = [];

  // A. Proxy unavailable.
  {
    const t = await topology();
    const { proxyUrl, targetUrl } = t;
    await t.stop();

    let transportError;
    try {
      await postIntent(proxyUrl, 'alpha', 60);
    } catch (error) {
      transportError = error.message;
    }

    // The target is down too in this topology, so stand a fresh one up and
    // confirm that routing around a dead proxy still fails.
    const fresh = await topology();
    const direct = await fetch(`${fresh.targetUrl}/v1/mutate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'set_reservation', arguments: { service: 'alpha', reserved: 60 } }),
    });
    const directBody = await direct.json();
    const state = await readState(fresh.targetUrl);

    arms.push({
      arm: 'A',
      condition: 'proxy unavailable',
      callerReachedProxy: transportError === undefined,
      transportError,
      bypassAttemptStatus: direct.status,
      bypassAttemptReason: directBody.reasonCode,
      stateUnchanged: JSON.stringify(state.state) === JSON.stringify({
        totalReservable: INITIAL_STATE.totalReservable,
        services: INITIAL_STATE.services,
      }),
      deadProxyUrl: proxyUrl,
      deadTargetUrl: targetUrl,
    });
    await fresh.stop();
  }

  // B. Decision timeout.
  {
    const t = await topology({
      decisionTimeoutMs: 25,
      port: (target) => ({
        revision: () =>
          new Promise((resolve) => setTimeout(() => resolve(target.revision), 5_000).unref()),
        execute: () => Promise.reject(new Error('never reached')),
      }),
    });

    const answer = await (await postIntent(t.proxyUrl, 'alpha', 60)).json();
    const state = await readState(t.targetUrl);

    arms.push({
      arm: 'B',
      condition: 'decision exceeds its deadline',
      decision: answer.decision,
      reasonCode: answer.reasonCode,
      receiptIssued: answer.receiptId !== undefined,
      stateUnchanged: state.state.services.alpha === INITIAL_STATE.services.alpha,
    });
    await t.stop();
  }

  // C. Pending-intent store unavailable.
  {
    const t = await topology({ store: new UnavailablePendingIntentStore() });
    const answer = await (await postIntent(t.proxyUrl, 'alpha', 60)).json();
    const state = await readState(t.targetUrl);

    arms.push({
      arm: 'C',
      condition: 'pending-intent store unavailable',
      decision: answer.decision,
      reasonCode: answer.reasonCode,
      receiptIssued: answer.receiptId !== undefined,
      stateUnchanged: state.state.services.alpha === INITIAL_STATE.services.alpha,
    });
    await t.stop();
  }

  // C2. Replay ledger unavailable at the target.
  {
    const t = await topology({ ledger: new UnavailableReplayLedger() });
    const answer = await (await postIntent(t.proxyUrl, 'alpha', 60)).json();
    const state = await readState(t.targetUrl);

    arms.push({
      arm: 'C2',
      condition: 'replay ledger unavailable at the target',
      decision: answer.decision,
      reasonCode: answer.reasonCode,
      targetReason: answer.execution?.reasonCode,
      stateUnchanged: state.state.services.alpha === INITIAL_STATE.services.alpha,
    });
    await t.stop();
  }

  // D. Malformed evidence.
  {
    const t = await topology({ evidence: { selection: { pairs: [] } } });
    const answer = await (await postIntent(t.proxyUrl, 'alpha', 60)).json();
    const state = await readState(t.targetUrl);

    arms.push({
      arm: 'D',
      condition: 'malformed evidence',
      decision: answer.decision,
      reasonCode: answer.reasonCode,
      receiptIssued: answer.receiptId !== undefined,
      stateUnchanged: state.state.services.alpha === INITIAL_STATE.services.alpha,
    });
    await t.stop();
  }

  // D2. Absent evidence.
  {
    const t = await topology({ evidence: null });
    const answer = await (await postIntent(t.proxyUrl, 'alpha', 60)).json();
    const state = await readState(t.targetUrl);
    arms.push({
      arm: 'D2',
      condition: 'evidence absent entirely',
      decision: answer.decision,
      reasonCode: answer.reasonCode,
      receiptIssued: answer.receiptId !== undefined,
      stateUnchanged: state.state.services.alpha === INITIAL_STATE.services.alpha,
    });
    await t.stop();
  }

  // E. Stale evidence.
  {
    const t = await topology({ sourceRevision: '0000000000000000000000000000000000000000' });
    const answer = await (await postIntent(t.proxyUrl, 'alpha', 60)).json();
    const state = await readState(t.targetUrl);

    arms.push({
      arm: 'E',
      condition: 'evidence pinned to a revision other than the one being mutated',
      decision: answer.decision,
      reasonCode: answer.reasonCode,
      receiptIssued: answer.receiptId !== undefined,
      stateUnchanged: state.state.services.alpha === INITIAL_STATE.services.alpha,
    });
    await t.stop();
  }

  write('chaos.json', {
    note:
      'Every arm asserts the same thing in different words: an Interlock that cannot answer ' +
      'does not become an Interlock that permits.',
    arms,
  });

  const failClosed = arms.every(
    (arm) => arm.decision === undefined || (arm.decision === 'DENY' && arm.receiptIssued !== true),
  );
  // Strictly true, not merely "not false": an arm that forgot to record its
  // state would otherwise pass this check by omission.
  const noMutations = arms.every((arm) => arm.stateUnchanged === true);

  check('CHAOS-1', 'no failure mode produces an allow', failClosed,
    arms.filter((a) => a.decision === 'ALLOW').map((a) => a.arm).join(', ') || 'all denied');
  check('CHAOS-2', 'no failure mode produces a mutation', noMutations,
    arms.filter((a) => a.stateUnchanged === false).map((a) => a.arm).join(', ') || 'no state moved');
  check('CHAOS-3', 'a dead proxy cannot be routed around', arms[0].bypassAttemptReason === 'RECEIPT_ABSENT',
    `direct call rejected with ${arms[0].bypassAttemptReason}`);
}

// ---------------------------------------------------------------------------
// 6. Correlation across the whole path.
// ---------------------------------------------------------------------------
{
  const t = await topology();
  const correlationId = 'ilk-s2correlation';

  const answer = await (
    await postIntent(t.proxyUrl, 'alpha', 50, { [CORRELATION_HEADER]: correlationId })
  ).json();

  const trace = {
    caller: correlationId,
    proxyRequest: t.envelopes[0]?.correlationId,
    proxyResponse: answer.correlationId,
    targetExecution: answer.execution?.correlationId,
    receiptId: answer.receiptId,
  };
  write('correlation-trace.json', {
    note:
      'One identifier, propagated by the application rather than by any platform field. ' +
      'HAC-325 established that no Agent Gateway trace field can be assumed, and the verifier ' +
      'must not depend on one.',
    header: CORRELATION_HEADER,
    trace,
  });

  const survived = new Set(Object.values(trace).filter((v) => typeof v === 'string' && v.startsWith('ilk-')));
  check(
    'CORR-1',
    'one correlation id survives caller -> proxy -> target -> mutation record',
    survived.size === 1 && survived.has(correlationId),
    `distinct ids seen: ${[...survived].join(', ')}`,
  );

  await t.stop();
}

// ---------------------------------------------------------------------------
// 7. Acknowledgement is not observation.
// ---------------------------------------------------------------------------
{
  const t = await topology();
  const answer = await (await postIntent(t.proxyUrl, 'alpha', 50)).json();

  const acknowledgementTrace = [
    record({
      correlationId: answer.correlationId,
      state: LifecycleState.RECEIPT_ISSUED,
      at: new Date().toISOString(),
      detail: `receipt ${answer.receiptId}`,
      recordedBy: 'proxy',
    }),
    record({
      correlationId: answer.correlationId,
      state: LifecycleState.MUTATION_EXECUTED,
      at: new Date().toISOString(),
      detail: 'target reports it applied the change',
      recordedBy: 'target',
    }),
    record({
      correlationId: answer.correlationId,
      state: LifecycleState.CALLER_ACKNOWLEDGED,
      at: new Date().toISOString(),
      detail: 'HTTP 200 reached the caller',
      recordedBy: 'caller',
    }),
  ];

  // The independent read. Performed by re-reading the target, not by believing
  // the response that was just received.
  const read = await readState(t.targetUrl);
  const observation = observe({
    correlationId: answer.correlationId,
    readState: read.state,
    expectedState: { totalReservable: 130, services: { alpha: 50, beta: 40, gamma: 20 } },
    at: new Date().toISOString(),
    recordedBy: 'verifier',
  });

  let selfAssertionRefused = false;
  try {
    record({
      correlationId: answer.correlationId,
      state: LifecycleState.OBSERVED,
      at: new Date().toISOString(),
      detail: 'attempting to certify my own write',
      recordedBy: 'target',
    });
  } catch (error) {
    selfAssertionRefused = error.name === 'UnassertableStateError';
  }

  write('observation.json', {
    note:
      'Four different claims, kept apart. A 200 establishes MUTATION_EXECUTED at most; only a ' +
      're-read of the state produces OBSERVED, and no participant can assert it about itself.',
    acknowledgementTrace,
    independentObservation: observation,
    selfAssertionOfObservedRefused: selfAssertionRefused,
  });

  check(
    'OBS-1',
    'no participant can assert OBSERVED about its own work',
    selfAssertionRefused,
    `UnassertableStateError raised: ${selfAssertionRefused}`,
  );
  check(
    'OBS-2',
    'OBSERVED comes only from an independent re-read of the state',
    observation.state === 'OBSERVED' && observation.recordedBy === 'verifier',
    `${observation.state} by ${observation.recordedBy}`,
  );
  check(
    'OBS-3',
    'a trace of acknowledgements alone does not establish observation',
    !acknowledgementTrace.some((e) => e.state === 'OBSERVED'),
    'acknowledgement trace carries no OBSERVED event',
  );

  await t.stop();
}

// ---------------------------------------------------------------------------
// 8. Latency.
// ---------------------------------------------------------------------------
{
  const SAMPLES = Number(process.env.HAC326_LATENCY_SAMPLES ?? 200);
  const WARMUP = 20;
  const t = await topology();

  const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
  const summarize = (samples) => {
    const sorted = [...samples].sort((a, b) => a - b);
    const round = (n) => Math.round(n * 1000) / 1000;
    return {
      count: sorted.length,
      medianMs: round(percentile(sorted, 50)),
      p95Ms: round(percentile(sorted, 95)),
      p99Ms: round(percentile(sorted, 99)),
      maxMs: round(sorted.at(-1)),
      minMs: round(sorted[0]),
    };
  };

  // Warm up: the first requests pay JIT and connection setup that a steady-state
  // budget should not be derived from.
  for (let i = 0; i < WARMUP; i += 1) await postIntent(t.proxyUrl, 'gamma', 20 + (i % 3));

  const authorized = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    const started = performance.now();
    await postIntent(t.proxyUrl, 'gamma', 20 + (i % 5));
    authorized.push(performance.now() - started);
  }

  // The denied path, which is the one an agent hits during contention.
  const denied = [];
  const store = new InMemoryPendingIntentStore();
  const contended = await topology({ store });
  for (let i = 0; i < SAMPLES; i += 1) {
    store.record({
      correlationId: `ilk-blocker${i}`,
      agent: 'blocker@example.test',
      operation: 'set_reservation',
      targets: [reservationPath('alpha')],
      intentDigest: 'sha256:blocker',
      recordedAt: new Date(Date.now() - 10_000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const started = performance.now();
    await postIntent(contended.proxyUrl, 'beta', 41);
    denied.push(performance.now() - started);
    store.settle(`ilk-blocker${i}`);
  }

  // Two concurrent requests, which is the case the pending-intent read exists for.
  const concurrent = [];
  for (let i = 0; i < Math.min(50, SAMPLES); i += 1) {
    const started = performance.now();
    await Promise.all([postIntent(t.proxyUrl, 'gamma', 21), postIntent(t.proxyUrl, 'gamma', 22)]);
    concurrent.push(performance.now() - started);
  }

  // Receipt cost in isolation: sign + verify, no transport.
  const cryptoSamples = [];
  const sampleIntent = { operation: 'set_reservation', arguments: { service: 'alpha', reserved: 41 } };
  for (let i = 0; i < 500; i += 1) {
    const started = performance.now();
    signReceipt(
      {
        receiptVersion: RECEIPT_VERSION,
        receiptId: `rcpt-${i}`,
        correlationId: 'ilk-latency',
        caller: { identity: 'a@b.test', identitySource: 'experiment' },
        operation: sampleIntent.operation,
        intentDigest: intentDigest(sampleIntent),
        target: { targetId: TARGET_ID, expectedRevision: 'sha256:x' },
        evidence: { basisRevision: SOURCE_REVISION, artifactSha256: 'x', producerSha: 'y' },
        decision: 'ALLOW',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
        nonce: `nonce-${i}`,
      },
      t.signingKey,
    );
    cryptoSamples.push(performance.now() - started);
  }

  const report = {
    note:
      'Loopback, single process, one machine. These numbers isolate the enforcement path, not ' +
      'the network. A Cloud Run deployment adds the round trips recorded in cloud-run.json.',
    environment: {
      runtime: process.version,
      platform: `${process.platform}-${process.arch}`,
      transport: 'HTTP over loopback, proxy and target in one process',
      warmupRequests: WARMUP,
    },
    authorizedPath: summarize(authorized),
    deniedPath: summarize(denied),
    twoConcurrentRequests: summarize(concurrent),
    receiptSigningOnly: summarize(cryptoSamples),
  };
  write('latency.json', report);

  check(
    'LAT-1',
    'latency is reported as a distribution over repeated requests, not one happy-path number',
    report.authorizedPath.count >= 100 && report.authorizedPath.p95Ms > 0,
    `n=${report.authorizedPath.count}, median ${report.authorizedPath.medianMs}ms, p95 ${report.authorizedPath.p95Ms}ms, max ${report.authorizedPath.maxMs}ms`,
  );
  check(
    'LAT-2',
    'the concurrent two-request case is measured',
    report.twoConcurrentRequests.count > 0,
    `median ${report.twoConcurrentRequests.medianMs}ms, p95 ${report.twoConcurrentRequests.p95Ms}ms`,
  );

  await contended.stop();
  await t.stop();
}

// ---------------------------------------------------------------------------
// Results.
// ---------------------------------------------------------------------------
const passed = checks.every((c) => c.passed);
write('results.json', {
  experiment: 'HAC-326',
  title: 'S2 fallback architecture gate: bounded MCP/API proxy enforcement',
  result: passed ? 'PASS' : 'FAIL',
  runtime: process.version,
  evidenceSource: {
    artifact: 'experiments/hac-330/evidence/baseline.evidence.json',
    basisRevision: SOURCE_REVISION,
    producer: EVIDENCE.producer.package,
    producerSha: EVIDENCE.producer.observedSha,
    note: 'Real co-change evidence from the pinned upstream miner. Not synthesized here.',
  },
  checks,
});

process.stdout.write(`\n${passed ? 'PASS' : 'FAIL'} — ${checks.filter((c) => c.passed).length}/${checks.length} checks\n`);
process.exitCode = passed ? 0 : 1;
