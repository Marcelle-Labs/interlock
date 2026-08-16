#!/usr/bin/env node
/**
 * Produces the judge-safe public derivative of the frozen HAC-340 cloud packet.
 *
 * The source packet is evidence and is never mutated. This tool reads it,
 * removes the identifiers that publication would expose, and writes two new
 * files: the public packet, and a manifest that records what was removed and
 * why without restating a single removed value.
 *
 * Three digests, three distinct referents:
 *
 *   sourcePacketSha256     the original frozen packet, byte-exact
 *   publicPacketSha256     the bytes actually published here
 *   evidencePublicationSha the commit that publishes them (bound after commit)
 *
 * They are never equal and the public packet says so about itself. A redacted
 * derivative that claimed the source digest would be a false digest.
 *
 * Deterministic: same input, same output bytes, so CI and a laptop agree.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REDACTION_POLICY_VERSION = '2.0.0';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const sourcePath = join(repoRoot, 'experiments', 'hac-340', 'evidence', 'cloud-run.json');
const outDir = join(repoRoot, 'experiments', 'hac-342', 'evidence');

/**
 * `full` removes the whole value.
 *
 * `principal` removes the identifier but keeps what the claims actually rest
 * on: the principal *kind* (`user:` versus `serviceAccount:`), and identity
 * *relations*. Each distinct principal maps to a stable ordinal token, so the
 * log entry's caller still compares equal to the agent's service account and
 * still compares unequal to the observer — the transport-provenance and
 * independence claims survive without publishing anyone's local part. The
 * mapping is assigned by order of first appearance and is not reversible.
 */
export const REDACTION_RULES = [
  ['resources.projectId', 'full', 'cloud-project-identifier'],
  ['resources.agentUrl', 'full', 'deployment-endpoint'],
  ['resources.proxyUrl', 'full', 'deployment-endpoint'],
  ['resources.targetUrl', 'full', 'deployment-endpoint'],
  ['resources.agentServiceAccount', 'principal', 'cloud-project-identifier'],
  ['resources.proxyServiceAccount', 'principal', 'cloud-project-identifier'],
  ['resources.targetServiceAccount', 'principal', 'cloud-project-identifier'],
  ['resources.observerPrincipal', 'principal', 'personal-identifier'],
  ['resources.nodeImage', 'full', 'registry-path'],
  ['resources.agentImage', 'full', 'registry-path'],
  ['expectedConfiguration.projectId', 'full', 'cloud-project-identifier'],
  ['expectedConfiguration.agentUrl', 'full', 'deployment-endpoint'],
  ['expectedConfiguration.proxyUrl', 'full', 'deployment-endpoint'],
  ['expectedConfiguration.targetUrl', 'full', 'deployment-endpoint'],
  ['expectedConfiguration.agentServiceAccount', 'principal', 'cloud-project-identifier'],
  ['expectedConfiguration.proxyServiceAccount', 'principal', 'cloud-project-identifier'],
  ['expectedConfiguration.targetServiceAccount', 'principal', 'cloud-project-identifier'],
  ['expectedConfiguration.observerPrincipal', 'principal', 'personal-identifier'],
  ['expectedConfiguration.nodeImage', 'full', 'registry-path'],
  ['expectedConfiguration.agentImage', 'full', 'registry-path'],
  ['observedConfiguration.agentRevision', 'full', 'deployment-endpoint'],
  ['observedConfiguration.proxyRevision', 'full', 'deployment-endpoint'],
  ['observedConfiguration.targetRevision', 'full', 'deployment-endpoint'],
  ['runtimeProof.proxyLogEntries[].logName', 'full', 'cloud-project-identifier'],
  ['runtimeProof.proxyLogEntries[].labels.instanceId', 'full', 'runtime-instance-identifier'],
  ['runtimeProof.proxyLogEntries[].resource.labels.project_id', 'full', 'cloud-project-identifier'],
  ['runtimeProof.proxyLogEntries[].jsonPayload.identity', 'principal', 'cloud-project-identifier'],
];

const CATEGORY_REASON = {
  'cloud-project-identifier': 'Names the Google Cloud project that hosted the torn-down deployment.',
  'deployment-endpoint': 'Resolvable endpoint of a deployment that no longer exists.',
  'personal-identifier': 'Identifies a natural person.',
  'registry-path': 'Artifact Registry path embedding the project identifier.',
  'runtime-instance-identifier': 'Ephemeral Cloud Run instance identifier with no evidentiary value.',
};

/**
 * Material fields the publication must keep for its claims to stand. Asserted,
 * not assumed: `verify-public-packet.mjs` fails if any is missing or redacted.
 */
export const MATERIAL_FIELDS = [
  'commitSha',
  'model',
  'adkPath',
  'correlationId',
  'decision',
  'receiptId',
  'receiptDigest',
  'protectedMutation.status',
  'protectedMutation.revisionBefore',
  'protectedMutation.revisionAfter',
  'protectedMutation.invariant.holds',
  'observation.revision',
  'observation.state.services.alpha',
  'controls.forgedHeaderStatus',
  'controls.wrongAudienceStatus',
  'controls.directBypassStatus',
  'resources.region',
  'resources.vertexLocation',
  'runtimeProof.proxyLogEntries[].resource.labels.revision_name',
  'runtimeProof.proxyLogEntries[].jsonPayload.correlationId',
  'runtimeProof.proxyLogEntries[].jsonPayload.identitySource',
];

const marker = (category) => `[REDACTED:${category}]`;

/** Walks one `a.b[].c` path, applying `fn` to every leaf it reaches. */
function applyPath(node, segments, fn) {
  const [head, ...rest] = segments;
  if (node === undefined || node === null) return 0;
  if (head.endsWith('[]')) {
    const arr = node[head.slice(0, -2)];
    if (!Array.isArray(arr)) return 0;
    return arr.reduce((n, item) => n + applyPath(item, rest, fn), 0);
  }
  if (rest.length === 0) {
    if (!(head in node)) return 0;
    node[head] = fn(node[head]);
    return 1;
  }
  return applyPath(node[head], rest, fn);
}

/** Stable ordinal per distinct principal, assigned by order of first appearance. */
function principalToken(registry, value) {
  const prefixMatch = /^(user:|serviceAccount:)/.exec(value ?? '');
  const prefix = prefixMatch ? prefixMatch[0] : '';
  const bare = prefix ? value.slice(prefix.length) : value;
  if (!registry.has(bare)) registry.set(bare, `principal-${registry.size + 1}`);
  return `${prefix}${marker(registry.get(bare))}`;
}

function redactValue(mode, category, value, registry) {
  if (mode === 'principal') {
    return typeof value === 'string' ? principalToken(registry, value) : marker(category);
  }
  return marker(category);
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export function redact(sourceText) {
  const packet = JSON.parse(sourceText);
  const applied = [];
  const principals = new Map();
  for (const [path, mode, category] of REDACTION_RULES) {
    const count = applyPath(packet, path.split('.'), (v) => redactValue(mode, category, v, principals));
    if (count > 0) applied.push({ path, mode, category, occurrences: count });
  }
  return { packet, applied };
}

function main() {
  const sourceText = readFileSync(sourcePath, 'utf8');
  const sourcePacketSha256 = sha256(sourceText);
  const { packet, applied } = redact(sourceText);

  // The derivative must announce itself. A judge who fetches only this file
  // still learns that it is not the packet the source digest names.
  const publicPacket = {
    packetKind: 'judge-safe redacted derivative',
    notice:
      'Redacted derivative of the frozen HAC-340 cloud packet. NOT byte-identical to the source packet. '
      + 'sourcePacketSha256 is a cryptographic commitment to the frozen source bytes, which are deliberately '
      + 'not published; a logged-out reader cannot and is not expected to recompute it. publicPacketSha256 '
      + 'verifies these bytes and is the digest a reader can check. The two are never equal.',
    sourcePacketPath: 'experiments/hac-340/evidence/cloud-run.json',
    sourcePacketSha256,
    redactionPolicyVersion: REDACTION_POLICY_VERSION,
    redactionManifest: 'experiments/hac-342/evidence/redaction-manifest.json',
    ...packet,
  };

  const publicText = JSON.stringify(publicPacket, null, 2) + '\n';
  const publicPacketSha256 = sha256(publicText);

  const manifest = {
    issue: 'HAC-342',
    redactionPolicyVersion: REDACTION_POLICY_VERSION,
    sourcePacketPath: 'experiments/hac-340/evidence/cloud-run.json',
    sourcePacketSha256,
    publicPacketPath: 'experiments/hac-342/evidence/cloud-run.public.json',
    publicPacketSha256,
    evidencePublicationSha: '[BIND: evidencePublicationSha]',
    sourcePacketPublished: false,
    digestSemantics: {
      sourcePacketSha256:
        'Commitment to the frozen source packet, byte-exact. The source bytes are deliberately not published, '
        + 'so this digest is not independently recomputable by a logged-out reader.',
      publicPacketSha256: 'Verifies the published judge-safe packet, byte-exact.',
      evidencePublicationSha: 'Identifies the immutable commit publishing this package.',
      rule: 'Every digest matches the exact bytes it labels. publicPacketSha256 never equals sourcePacketSha256.',
    },
    redactedPaths: applied.map(({ path, mode, category, occurrences }) => ({
      path,
      mode,
      category,
      occurrences,
      reason: CATEGORY_REASON[category],
    })),
    removedValuesPublished: false,
    preservedMaterialFields: MATERIAL_FIELDS,
    sourceDiscrepancies: [
      {
        field: 'agentRevision / targetRevision',
        designValue: 'recorded in the HAC-342 design bindings',
        frozenEvidence:
          'absent — bin/20-cloud-run.mjs records observedConfiguration as service URLs, not revision names, '
          + 'so only the proxy revision survives via the Cloud Logging resource label',
        disposition:
          'Both values preserved in the design handoff per its section 6; removed from judge-facing factual surfaces. '
          + 'Only interlock-hac340-proxy-00002-wzf is evidenced.',
      },
      {
        field: 'controls.wrongAudienceStatus',
        designValue: 'named wrong-audience',
        frozenEvidence:
          'bin/20-cloud-run.mjs:34 sends Bearer invalid.wrong.token to the real Cloud Run proxy — an invalid-token '
          + 'control. The signed wrong-audience token is exercised only by the local parity run.',
        disposition:
          'Field name preserved unmutated in the packet; presented as "invalid bearer token" on judge-facing surfaces. '
          + 'Genuine wrong-audience rejection remains CONTROLLED LOCAL PARITY, not a cloud result.',
      },
      {
        field: 'teardown',
        designValue: 'completed',
        frozenEvidence: 'runtime packet records teardown: "pending"',
        disposition:
          'Runtime packet not mutated. The completed claim sources to experiments/hac-340/evidence/teardown.json.',
      },
    ],
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'cloud-run.public.json'), publicText);
  writeFileSync(join(outDir, 'redaction-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  process.stdout.write(
    `sourcePacketSha256 ${sourcePacketSha256}\npublicPacketSha256 ${publicPacketSha256}\nredacted ${applied.length} path rules\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
