#!/usr/bin/env node
/**
 * HAC-335 — Vertex AI preflight for the Veo hero sequence.
 *
 * Every check here is free. Nothing in this file starts a billable generation,
 * and `generate-veo.mjs` refuses to run until this passes, so the failure mode
 * "spent money discovering the API was disabled" cannot happen.
 *
 * It inspects credential PRESENCE and configuration only. No token, key, secret
 * or credential-shaped value is printed, returned, logged or written to any
 * manifest — the identity is reported as an account and a project, which are
 * names rather than secrets.
 *
 *     node media/hac-335/veo-hero/bin/preflight.mjs
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const MODEL = 'veo-3.1-generate-001';
export const FAST_MODEL = 'veo-3.1-fast-generate-001';
export const LOCATION = 'us-central1';

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const quiet = (cmd, args) => {
  try {
    return { ok: true, out: sh(cmd, args) };
  } catch (e) {
    return { ok: false, out: '', err: String(e.stderr ?? e.message ?? '').trim() };
  }
};

/**
 * Obtain an ADC access token.
 *
 * Returned to the caller in memory only. It is never printed and never stored;
 * callers must not place it in a manifest, a log line or an error message.
 */
export function accessToken() {
  const r = quiet('gcloud', ['auth', 'application-default', 'print-access-token']);
  if (!r.ok) {
    const e = new Error('Application Default Credentials could not produce an access token.');
    e.remedy = r.err.includes('Reauthentication')
      ? 'The stored ADC refresh token has expired and gcloud cannot prompt non-interactively. '
        + 'Run `gcloud auth application-default login` in a terminal, then re-run this command.'
      : 'Run `gcloud auth application-default login`.';
    throw e;
  }
  return r.out;
}

export function preflight({ verbose = true } = {}) {
  const checks = [];
  const add = (name, ok, detail, remedy) => {
    checks.push({ name, ok, detail, remedy: ok ? null : remedy });
    if (verbose) {
      const mark = ok ? 'PASS' : 'FAIL';
      console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
      if (!ok && remedy) console.log(`         ${remedy}`);
    }
  };

  /* 1. gcloud on PATH ----------------------------------------------------- */
  const gcloud = quiet('gcloud', ['--version']);
  add('gcloud CLI available', gcloud.ok, gcloud.ok ? gcloud.out.split('\n')[0] : null,
    'Install the Google Cloud CLI.');
  if (!gcloud.ok) return { ok: false, checks };

  /* 2. the intended backend ------------------------------------------------
     If a Gemini Developer API key is also present, say so rather than guessing:
     two configured backends is a decision a human makes, not this script. */
  const devKeys = ['GOOGLE_API_KEY', 'GEMINI_API_KEY'].filter((k) => process.env[k]);
  const adcPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ?? join(homedir(), '.config', 'gcloud', 'application_default_credentials.json');
  const adcPresent = existsSync(adcPath);
  add('Application Default Credentials file present', adcPresent,
    adcPresent ? 'found (contents not read beyond quota_project_id)' : null,
    'Run `gcloud auth application-default login`.');
  if (devKeys.length) {
    add('exactly one backend configured', false,
      `Vertex ADC and ${devKeys.join(' + ')} are both set`,
      'Two backends are configured. Decide which one is intentional and unset the other, '
      + 'or pass --backend explicitly. This script will not guess, and will not print either value.');
  }

  /* 3. project ------------------------------------------------------------- */
  let project = process.env.GOOGLE_CLOUD_PROJECT ?? '';
  if (!project) {
    const p = quiet('gcloud', ['config', 'get-value', 'project']);
    project = p.ok && p.out && p.out !== '(unset)' ? p.out : '';
  }
  if (!project && adcPresent) {
    try {
      project = JSON.parse(readFileSync(adcPath, 'utf8')).quota_project_id ?? '';
    } catch { /* the file may be a service account; the gcloud config above covers that */ }
  }
  add('Google Cloud project resolvable', Boolean(project), project || null,
    'Run `gcloud config set project <PROJECT_ID>` or set GOOGLE_CLOUD_PROJECT.');
  if (!project) return { ok: false, checks, project: null };

  /* 4. a usable access token ----------------------------------------------- */
  let token = null;
  try {
    token = accessToken();
    add('ADC access token obtainable', true, 'obtained (value not printed)');
  } catch (e) {
    add('ADC access token obtainable', false, e.message, e.remedy);
    return { ok: false, checks, project };
  }

  const api = async (url) => {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };

  return { ok: null, checks, project, token, api, add, finish: () => ({ ok: checks.every((c) => c.ok), checks, project }) };
}

/**
 * The half of preflight that needs the network. Split out so the synchronous
 * part above can be reused by callers that already hold a token.
 */
export async function preflightRemote(ctx) {
  const { project, token, add } = ctx;
  const bearer = { Authorization: `Bearer ${token}` };
  const json = async (url) => {
    const r = await fetch(url, { headers: bearer });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };

  /* 5. billing ------------------------------------------------------------- */
  const bill = await json(`https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`);
  if (bill.status === 200) {
    add('billing enabled on the project', Boolean(bill.body.billingEnabled),
      bill.body.billingEnabled ? `billing account linked` : 'no billing account linked',
      'Link a billing account. Veo generation is a paid API.');
  } else if (bill.status === 403) {
    add('billing enabled on the project', false,
      'the Cloud Billing API is disabled or the identity cannot read billing info',
      'Either enable cloudbilling.googleapis.com, or confirm billing manually in the console. '
      + 'This check is advisory: generation will fail with a clear billing error if it is not linked.');
  } else {
    add('billing enabled on the project', false, `billing API returned ${bill.status}`,
      'Confirm billing manually in the console.');
  }

  /* 6. Vertex AI API enabled ----------------------------------------------- */
  const svc = await json(`https://serviceusage.googleapis.com/v1/projects/${project}/services/aiplatform.googleapis.com`);
  if (svc.status === 200) {
    add('aiplatform.googleapis.com enabled', svc.body.state === 'ENABLED', svc.body.state ?? null,
      `Run \`gcloud services enable aiplatform.googleapis.com --project=${project}\`.`);
  } else {
    add('aiplatform.googleapis.com enabled', false, `Service Usage API returned ${svc.status}`,
      'Enable serviceusage.googleapis.com, or confirm the Vertex AI API manually.');
  }

  /* 7. the model is actually offered in this region ------------------------
     An earlier pass probed `GET publishers/google/models/{model}` per model and
     read a 404 as "no access". That probe was worthless: a model that certainly
     exists (`gemini-2.0-flash`) and a model that certainly does not
     (`veo-99-does-not-exist`) both answered 404, so the check could not tell
     them apart and reported a false FAIL against a project that had access all
     along. A POST probe with a malformed body was no better — payload
     validation runs before model resolution, so a fictional model also answered
     400.

     The publisher-model LIST does discriminate, and it is a free read. A model
     is available here if and only if this region lists it. */
  const listUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1beta1/publishers/google/models?pageSize=200`;
  const list = await fetch(listUrl, { headers: { ...bearer, 'x-goog-user-project': project } });
  const listBody = await list.json().catch(() => ({}));
  if (list.status !== 200) {
    add(`Veo models offered in ${LOCATION}`, false,
      `the publisher-model list returned ${list.status} ${listBody?.error?.message ?? ''}`.trim(),
      'Without this list, model availability cannot be established without a billable call.');
  } else {
    const offered = new Set((listBody.publisherModels ?? []).map((m) => m.name.split('/').pop()));
    for (const model of [FAST_MODEL, MODEL]) {
      add(`${model} offered in ${LOCATION}`, offered.has(model),
        offered.has(model) ? 'listed by Model Garden' : 'not listed in this region',
        `Model Garden does not offer ${model} in ${LOCATION} for this project. Request access, `
        + 'or choose a region that offers it.');
    }
  }

  /* 8. prediction permission ----------------------------------------------
     `aiplatform.endpoints.predict` cannot be proven for free: testIamPermissions
     needs the Cloud Resource Manager API, which this project has disabled, and
     enabling an API is a configuration change rather than a check. The
     authenticated 200 above does establish that this identity can read Vertex
     resources in this project. The predict permission itself is exercised by
     the generation call, which fails closed with a 403 if it is missing. This
     is recorded as a known limit rather than asserted as a pass. */
  ctx.unprovable = ctx.unprovable ?? [];
  ctx.unprovable.push('aiplatform.endpoints.predict — not provable without a billable call; '
    + 'the generation request fails closed with 403 if the identity lacks it');

  return ctx.finish();
}

/* -- CLI ------------------------------------------------------------------ */

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  console.log(`\nVertex AI preflight — project scope only, no billable call\n`);
  const ctx = preflight();
  let result = ctx.ok === false ? ctx : await preflightRemote(ctx);
  const failed = result.checks.filter((c) => !c.ok);
  console.log('');
  if (failed.length) {
    console.log(`  ${failed.length} prerequisite(s) unmet. No generation was attempted.\n`);
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail ?? 'failed'}\n    ${f.remedy ?? ''}`);
    console.log('');
    process.exit(1);
  }
  for (const u of ctx.unprovable ?? []) console.log(`  [NOTE] ${u}`);
  console.log('\n  all determinable prerequisites met; generation may proceed\n');
}
