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
import { MATERIAL_FIELDS, REDACTION_POLICY_VERSION } from './redact-packet.mjs';

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

// The source packet is evidence. If it is present it must still be the packet
// the frozen digest names, byte for byte.
try {
  const sourceText = readFileSync(sourcePath, 'utf8');
  const sourceActual = sha256(sourceText);
  if (sourceActual !== manifest.sourcePacketSha256) {
    fail(`source packet has been mutated: expected ${manifest.sourcePacketSha256}, found ${sourceActual}`);
  }
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
  process.stdout.write('note: source packet not present in this checkout; source digest not re-verified\n');
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

/* --- nothing the redaction was for came back -------------------------- */

const FORBIDDEN = [
  [/nimble-octagon-505403-n3/, 'cloud project identifier'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(?:io|com|net|org)\b/, 'personal email address'],
  [/https:\/\/[a-z0-9-]+-[a-z0-9]{10}-uc\.a\.run\.app/, 'Cloud Run deployment endpoint'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key block'],
  [/\bya29\.[A-Za-z0-9_-]{20,}/, 'Google OAuth access token'],
  [/\bAIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
];
for (const [pattern, label] of FORBIDDEN) {
  if (pattern.test(publicText)) fail(`public packet contains a ${label}`);
}

process.stdout.write(
  `HAC-342 public packet verified\n  sourcePacketSha256 ${manifest.sourcePacketSha256}\n  publicPacketSha256 ${manifest.publicPacketSha256}\n  material fields intact ${MATERIAL_FIELDS.length}\n`,
);
