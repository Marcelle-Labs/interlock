#!/usr/bin/env node
/**
 * Refuses a HAC-342 publication that misstates what it publishes.
 *
 * The acceptance rule is that every digest matches the exact bytes it labels.
 * That cuts both ways here: the public packet must hash to publicPacketSha256,
 * and it must NOT hash to sourcePacketSha256 — a redacted derivative carrying
 * the source digest would be a false claim of byte identity.
 *
 * It also refuses a publication that redacted its way out of its own evidence:
 * every material field must survive, unredacted. Removing an identifier is
 * protection; removing the receipt digest would be deletion of proof.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MATERIAL_FIELDS, REDACTION_POLICY_VERSION, REDACTION_RULES } from './redact-packet.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const publicPath = join(repoRoot, 'experiments', 'hac-342', 'evidence', 'cloud-run.public.json');
const manifestPath = join(repoRoot, 'experiments', 'hac-342', 'evidence', 'redaction-manifest.json');
const sourcePath = join(repoRoot, 'experiments', 'hac-340', 'evidence', 'cloud-run.json');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const fail = (msg) => { throw new Error(msg); };

const publicText = readFileSync(publicPath, 'utf8');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const packet = JSON.parse(publicText);

/* --- digest contract ------------------------------------------------- */

const actual = sha256(publicText);
if (actual !== manifest.publicPacketSha256) {
  fail(`publicPacketSha256 does not match the published bytes: manifest ${manifest.publicPacketSha256}, actual ${actual}`);
}
if (packet.sourcePacketSha256 !== manifest.sourcePacketSha256) {
  fail('public packet and manifest disagree about sourcePacketSha256');
}
if (manifest.publicPacketSha256 === manifest.sourcePacketSha256) {
  fail('publicPacketSha256 equals sourcePacketSha256; a redacted derivative cannot be byte-identical to its source');
}
if (manifest.redactionPolicyVersion !== REDACTION_POLICY_VERSION) {
  fail(`redaction manifest policy ${manifest.redactionPolicyVersion} != tool policy ${REDACTION_POLICY_VERSION}`);
}

// The source packet is evidence. It is private by design; when a local
// checkout does hold it, it must still be the packet the frozen digest names.
let sourceReVerified = true;
try {
  const sourceText = readFileSync(sourcePath, 'utf8');
  const sourceActual = sha256(sourceText);
  if (sourceActual !== manifest.sourcePacketSha256) {
    fail(`source packet has been mutated: expected ${manifest.sourcePacketSha256}, found ${sourceActual}`);
  }
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
  // Expected in a public checkout. The source packet is deliberately private,
  // so sourcePacketSha256 stands as a commitment to bytes this reader does not
  // hold. Publication must never imply a logged-out reader recomputed it.
  sourceReVerified = false;
}

/* --- the derivative must announce itself ------------------------------ */

if (!/redacted derivative/i.test(packet.packetKind ?? '')) fail('public packet does not declare itself a redacted derivative');
if (!/NOT byte-identical/i.test(packet.notice ?? '')) fail('public packet does not state that it is not byte-identical to the source');
if (manifest.removedValuesPublished !== false) fail('redaction manifest must not publish removed values');

/* --- material evidence survived --------------------------------------- */

const read = (path) => path.split('.').reduce((node, seg) => {
  if (node === undefined || node === null) return undefined;
  if (seg.endsWith('[]')) {
    const arr = node[seg.slice(0, -2)];
    return Array.isArray(arr) ? arr[0] : undefined;
  }
  return node[seg];
}, packet);

for (const path of MATERIAL_FIELDS) {
  const value = read(path);
  if (value === undefined || value === null || value === '') fail(`material field missing from public packet: ${path}`);
  if (typeof value === 'string' && value.includes('[REDACTED:')) fail(`material field was redacted: ${path}`);
}

/* --- the claims the packet is published to support -------------------- */

if (packet.decision !== 'ALLOW' || packet.protectedMutation?.status !== 'EXECUTED') fail('public packet no longer shows the executed protected mutation');
if (packet.observation?.state?.services?.alpha !== 45) fail('public packet no longer shows the independently observed result');
if (!packet.receiptDigest?.startsWith('sha256:')) fail('receipt digest is not frozen in the public packet');
if (packet.controls?.forgedHeaderStatus !== 403 || packet.controls?.directBypassStatus !== 403 || packet.controls?.wrongAudienceStatus !== 401) {
  fail('negative controls in the public packet do not match the frozen results');
}
if (!Array.isArray(packet.runtimeProof?.proxyLogEntries) || packet.runtimeProof.proxyLogEntries.length === 0) {
  fail('Cloud Logging correlation proof is absent from the public packet');
}

/* --- principal relations, which are the claims themselves -------------- */

// Redaction removed every principal identifier, so these assertions are what is
// left to carry transport provenance and observer independence. If redaction
// ever collapses distinct principals onto one token, or lets the caller drift
// away from the agent's account, the claims stop being supported and this fails.
const bare = (value) => String(value ?? '').replace(/^(user:|serviceAccount:)/, '');
const { agentServiceAccount, proxyServiceAccount, targetServiceAccount, observerPrincipal } = packet.resources ?? {};
const callerIdentity = packet.runtimeProof?.proxyLogEntries?.[0]?.jsonPayload?.identity;

for (const [label, value] of [['agent', agentServiceAccount], ['proxy', proxyServiceAccount], ['target', targetServiceAccount]]) {
  if (!String(value ?? '').startsWith('serviceAccount:')) fail(`${label} principal lost its serviceAccount: kind`);
}
if (!String(observerPrincipal ?? '').startsWith('user:')) {
  fail('observer principal lost its user: kind; the independence claim rests on it not being a service account');
}
if (bare(callerIdentity) !== bare(agentServiceAccount)) {
  fail('the logged caller is no longer the agent service account; transport provenance is unsupported');
}
if (bare(observerPrincipal) === bare(agentServiceAccount)) {
  fail('observer and agent resolve to the same principal; the read-back is not independent');
}
const serviceAccounts = new Set([agentServiceAccount, proxyServiceAccount, targetServiceAccount].map(bare));
if (serviceAccounts.size !== 3) fail('the three service accounts are no longer distinct after redaction');

/* --- nothing the redaction was for came back -------------------------- */

// Positive assertion beats a blocklist: every path the policy redacts must
// actually carry a marker. A blocklist would have to name the very identifiers
// this file is published to keep secret — the detector would become the leak.
for (const [path] of REDACTION_RULES) {
  const value = read(path);
  if (value === undefined) continue;
  if (typeof value !== 'string' || !value.includes('[REDACTED:')) {
    fail(`policy redacts ${path} but the published value is not redacted`);
  }
}

const FORBIDDEN = [
  [/[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com/, 'service account email'],
  [/projects\/[a-z0-9_-]+\/logs/, 'project-scoped log name'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(?:io|com|net|org)\b/, 'personal email address'],
  [/https:\/\/[a-z0-9-]+-[a-z0-9]{10}-uc\.a\.run\.app/, 'Cloud Run deployment endpoint'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key block'],
  [/\bya29\.[A-Za-z0-9_-]{20,}/, 'Google OAuth access token'],
  [/\bAIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
  [/interlock-hac340-(?:agent|proxy|target)@/, 'service account local part'],
];
for (const [pattern, label] of FORBIDDEN) {
  if (pattern.test(publicText)) fail(`public packet contains a ${label}`);
}

process.stdout.write(
  'HAC-342 public packet verified\n'
  + `  publicPacketSha256   ${manifest.publicPacketSha256} (recomputed over the published bytes)\n`
  + `  sourcePacketSha256   ${manifest.sourcePacketSha256} `
  + `(${sourceReVerified ? 'private source present, digest re-verified' : 'commitment only; private source not in this checkout'})\n`
  + `  material fields intact ${MATERIAL_FIELDS.length}\n`
  + '  principal relations  caller = agent SA, observer distinct and user-kind, 3 service accounts distinct\n',
);
