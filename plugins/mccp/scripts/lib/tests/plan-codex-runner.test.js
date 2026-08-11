'use strict';

// codex-intent-context M1 Task 6b — the single-process runner.
//
// Codex F4 pushed back on a DI-only suite, and correctly: injected fakes prove
// the fake path and nothing else. So this file carries three kinds of test:
//   (a) DEFAULT WIRING — the runner's default dependencies really are the
//       production modules, not just whatever a test injects;
//   (b) BEHAVIOR under injection — the decision tree, fail-closed paths, the
//       lock, and the post-write plan_hash re-verification;
//   (c) a NEGATIVE test that tampering with the on-disk audit envelope cannot
//       change the stamped verdict. Without (c), DD3 ("nothing re-reads the
//       envelope") is an unfalsifiable claim.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const runner = require('../plan-codex-runner');
const ic = require('../intent-context');
const codexInvoke = require('../codex-invoke');
const receiptWrite = require('../../receipt/write');
const codexPayload = require('../codex-review-payload');

const PRD_PLAN = [
  '# Plan: r',
  '',
  '**Source PRD**: `.claude/prds/r.prd.md`',
  '',
  '## User Intent',
  '',
  '| ID | Constraint (user-stated) | Kind |',
  '|---|---|---|',
  '| UI1 | keep the milestone scope narrow | direction |',
  '| UI2 | do not replace the codex reviewer | exclusion |',
  '',
  '## Summary',
  '',
  'body',
  '',
].join('\n');

const FREE_FORM_PLAN = '# Plan: r\n\n## Summary\n\nbody\n';

function scratch(planBody) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-runner-'));
  const tmpDir = path.join(dir, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const planRel = 'plan.plan.md';
  fs.writeFileSync(path.join(dir, planRel), planBody);
  return { dir: dir, tmpDir: tmpDir, planRel: planRel, planAbs: path.join(dir, planRel) };
}

// M1.5 — the default mislabel mode is not `off`, so a finding with no `INTENT:`
// line makes the whole review `inconclusive` by design (DD5). These M1 fixtures
// are about the M1 axis, so give every finding a compliant `INTENT: none` unless
// the test wrote its own claim. Tests that want the non-compliant case say so
// explicitly rather than getting it by accident.
function withDefaultClaim(f) {
  const body = typeof f.body === 'string' ? f.body : '';
  const already = [f.title, body, f.recommendation].some(function (x) {
    return typeof x === 'string' && /^[ \t]*INTENT:/m.test(x);
  });
  return already ? f : Object.assign({}, f, { body: body + '\nINTENT: none' });
}

function envelopeWith(findings, opts) {
  const o = opts || {};
  const list = o.rawFindings === true ? findings : findings.map(withDefaultClaim);
  return {
    ok: true,
    classification: 'ok',
    blocking: false,
    stdout: JSON.stringify({
      result: { verdict: 'needs-attention', summary: 'No ship', findings: list },
    }),
    stderr: '',
    durationMs: 1,
  };
}

// Pre-stage an adjudication file that matches the payload the fake will return.
function stageAdjudication(s, nonce, envelope, mutate) {
  const payload = codexPayload.parseReviewPayload(envelope);
  const file = {
    plan_path: s.planRel,
    round: 1,
    review_payload_digest: ic.canonicalDigest(payload),
    adjudications: payload.findings.map(function (f, i) {
      return {
        finding_index: i,
        finding_digest: ic.canonicalDigest(f),
        intent_conflict: 'none',
        verdict: 'ACCEPT_NOW',
        rationale: 'in scope for this milestone',
        intent_override_reason: null,
      };
    }),
  };
  if (mutate) mutate(file);
  const p = runner.paths(s.tmpDir, 'r', nonce);
  fs.writeFileSync(p.adjudication, JSON.stringify(file, null, 2));
  return p;
}

function fakeWrite(captured) {
  return function (args) {
    captured.push(args);
    return {
      path: '/fake/receipt.json',
      receipt: {
        plan_hash: args.__planHashOverride || captured.planHash,
        receipt_hash: 'sha256:' + 'a'.repeat(64),
        meta: {},
      },
    };
  };
}

function runWith(s, opts, envelope, writeImpl) {
  const captured = [];
  captured.planHash = require('../../receipt/hash').planAwareMarkdownHash(s.planAbs);
  const res = runner.run(Object.assign({
    plan: s.planRel,
    decision: 'r',
    cwd: s.dir,
    tmpDir: s.tmpDir,
    env: {},
    adjudicationTimeoutMs: 3000,
  }, opts), {
    invokeAdversarialReview: function () { return envelope; },
    write: writeImpl || fakeWrite(captured),
  });
  return { res: res, captured: captured };
}

// ── (a) default wiring ───────────────────────────────────────────────────────

test('(a) default dependencies are the REAL modules, not test doubles', function () {
  assert.strictEqual(runner.defaultDeps.invokeAdversarialReview,
    codexInvoke.invokeAdversarialReview,
    'runner must default to the real codex-invoke');
  assert.strictEqual(runner.defaultDeps.write, receiptWrite.write,
    'runner must default to the real receipt writer');
});

test('(a2) the runner requires the receipt writer directly — no CLI shell-out', function () {
  const src = fs.readFileSync(require.resolve('../plan-codex-runner'), 'utf8');
  assert.ok(/require\('\.\.\/receipt\/write'\)/.test(src),
    'the intent decision must travel in-process, not through cli.js flags');
  // Behavioral, not textual: parseArgs must not RECOGNIZE any --intent-* flag.
  // (A textual scan would trip on the comment in the source that says exactly
  // that no such flag exists.)
  const parsed = runner.parseArgs(['--intent-gate-verdict', 'preserved',
    '--intent-decision', 'preserved', '--intent-plan-digest', 'sha256:x']);
  Object.keys(parsed).forEach(function (k) {
    assert.ok(k.indexOf('intent') === -1, 'runner must not accept an intent CLI flag: ' + k);
  });
});

// ── (b) behavior ─────────────────────────────────────────────────────────────

test('L1 — the reviewer receives the User Intent items and nothing else', function () {
  const s = scratch(PRD_PLAN);
  let seenOpts = null;
  const env = envelopeWith([]);
  runner.run({
    plan: s.planRel, decision: 'r', runNonce: 'n1', cwd: s.dir, tmpDir: s.tmpDir, env: {},
  }, {
    invokeAdversarialReview: function (focus, opts) { seenOpts = opts; return env; },
    write: fakeWrite([]),
  });
  assert.ok(seenOpts.intentReference.indexOf('UI1') !== -1);
  assert.ok(seenOpts.intentReference.indexOf('UI2') !== -1);
  // author rationale from ## Summary / Design Decisions must be unreachable
  assert.ok(seenOpts.intentReference.indexOf('body') === -1);
});

test('zero findings → a PROVEN skip, no adjudication required', function () {
  const s = scratch(PRD_PLAN);
  const out = runWith(s, { runNonce: 'n2' }, envelopeWith([]));
  assert.strictEqual(out.res.exitCode, runner.EX_OK);
  assert.strictEqual(out.res.verdict, 'skipped');
  const d = out.captured[0].intentDecision;
  assert.strictEqual(d.skip_proof, 'no_codex_findings');
  assert.strictEqual(d.section_present, true);
});

test('a free-form plan is a proven skip even when findings exist', function () {
  const s = scratch(FREE_FORM_PLAN);
  const out = runWith(s, { runNonce: 'n3' }, envelopeWith([{ title: 'F', severity: 'high' }]));
  assert.strictEqual(out.res.exitCode, runner.EX_OK);
  assert.strictEqual(out.captured[0].intentDecision.skip_proof, 'free_form_plan');
});

test('DD3 — an unreadable review payload is incomplete, NOT "zero findings"', function () {
  const s = scratch(PRD_PLAN);
  const broken = { ok: true, classification: 'ok', blocking: false, stdout: 'NOT JSON' };
  const out = runWith(s, { runNonce: 'n4' }, broken);
  assert.strictEqual(out.res.exitCode, runner.EX_BLOCKED);
  assert.strictEqual(out.res.verdict, 'incomplete');
  assert.strictEqual(out.captured.length, 0, 'no receipt may be written');
});

test('a fully adjudicated review is preserved and the receipt is written once', function () {
  const s = scratch(PRD_PLAN);
  const env = envelopeWith([{ title: 'F1', severity: 'high', body: 'b1' }]);
  stageAdjudication(s, 'n5', env);
  const out = runWith(s, { runNonce: 'n5' }, env);
  assert.strictEqual(out.res.exitCode, runner.EX_OK, out.res.reason);
  assert.strictEqual(out.res.verdict, 'preserved');
  assert.strictEqual(out.captured.length, 1);
  const d = out.captured[0].intentDecision;
  assert.strictEqual(d.verdict, 'preserved');
  assert.strictEqual(d.run_nonce, 'n5');
  assert.strictEqual(d.counts.total, 1);
});

test('a missing adjudication blocks and writes NO receipt', function () {
  const s = scratch(PRD_PLAN);
  const env = envelopeWith([{ title: 'F1', severity: 'high' }, { title: 'F2', severity: 'low' }]);
  stageAdjudication(s, 'n6', env, function (f) { f.adjudications.pop(); });
  const out = runWith(s, { runNonce: 'n6' }, env);
  assert.strictEqual(out.res.exitCode, runner.EX_BLOCKED);
  assert.strictEqual(out.res.verdict, 'incomplete');
  assert.strictEqual(out.captured.length, 0);
});

test('the adjudication wait is bounded — it does not hang forever', function () {
  const s = scratch(PRD_PLAN);
  const env = envelopeWith([{ title: 'F1', severity: 'high' }]);
  const started = Date.now();
  const out = runWith(s, { runNonce: 'n7', adjudicationTimeoutMs: 1200 }, env);
  assert.strictEqual(out.res.exitCode, runner.EX_BLOCKED);
  assert.match(out.res.reason, /timed out/);
  assert.ok(Date.now() - started < 20000, 'must not block indefinitely');
});

test('DD4-2 — a post-write plan_hash mismatch fails loudly instead of reporting success', function () {
  const s = scratch(PRD_PLAN);
  const env = envelopeWith([{ title: 'F1', severity: 'high' }]);
  stageAdjudication(s, 'n8', env);
  const out = runWith(s, { runNonce: 'n8' }, env, function () {
    // Emulate write.js re-reading a plan that changed under us.
    return { path: '/fake/r.json', receipt: { plan_hash: 'sha256:' + '9'.repeat(64), receipt_hash: 'x' } };
  });
  assert.strictEqual(out.res.exitCode, runner.EX_BLOCKED);
  assert.match(out.res.reason, /plan_hash mismatch/);
});

// Phase 5.6's markerless recovery reads "a receipt seals our run_nonce" as success.
// That inference is only sound while a receipt the runner refuses to stand behind
// never stays readable — otherwise the conjunction of a failed marker write and
// this blocked path reports a blocked run as a pass. Pin the rename, not the prose.
test('DD4-2 — the mis-sealed receipt is quarantined, so markerless recovery cannot read it as success', function () {
  const s = scratch(PRD_PLAN);
  const env = envelopeWith([{ title: 'F1', severity: 'high' }]);
  stageAdjudication(s, 'n8q', env);

  // A real file on disk: the invariant under test is a rename, not a return value.
  const receiptPath = path.join(s.dir, 'plan-codex-receipt.json');
  fs.writeFileSync(receiptPath, JSON.stringify({ meta: { intent_run_nonce: 'n8q' } }));

  const out = runWith(s, { runNonce: 'n8q' }, env, function () {
    return { path: receiptPath, receipt: { plan_hash: 'sha256:' + '9'.repeat(64), receipt_hash: 'x' } };
  });

  assert.strictEqual(out.res.exitCode, runner.EX_BLOCKED);
  assert.strictEqual(fs.existsSync(receiptPath), false,
    'a receipt the runner refuses to stand behind must leave the consumable path');
  assert.strictEqual(fs.existsSync(receiptPath + '.invalid-n8q'), true,
    'quarantine must preserve the artifact for diagnosis rather than delete it');
  assert.strictEqual(out.res.receiptPath, null,
    'the marker must not advertise a receipt_path that was just quarantined');
});

// The runner is launched detached, so its stderr and exit code never reach the
// caller — the marker is the whole channel. Assert on what an operator can
// actually observe, because "the run still exited 0" is true with or without the
// retry and would pin nothing.
test('an unwritable marker is retried, then downgraded, then reported as FATAL', function () {
  const s = scratch(PRD_PLAN);
  const p = runner.paths(s.tmpDir, 'r', 'n8m');
  // Occupy the marker path with a NON-EMPTY directory: rename() onto it fails on
  // every platform this runs on, so both the full and the degraded write fail.
  fs.mkdirSync(p.marker, { recursive: true });
  fs.writeFileSync(path.join(p.marker, 'occupied'), 'x');

  const seen = [];
  const realWrite = process.stderr.write;
  process.stderr.write = function (chunk) { seen.push(String(chunk)); return true; };
  let out;
  try { out = runWith(s, { runNonce: 'n8m' }, envelopeWith([])); }
  finally { process.stderr.write = realWrite; }
  const log = seen.join('');

  assert.match(log, /marker write failed after 3 attempts/,
    'a single attempt is not enough — transient locks are the common case on Windows');
  assert.match(log, /FATAL: no marker could be written/,
    'losing the only channel to the caller must be reported as fatal, not as a stray warning');
  assert.strictEqual(out.res.markerWritten, false,
    'the result must say the marker never landed — a silent success here is the ' +
    'lost signal this gate exists to prevent (the caller then recovers via the ' +
    'nonce sealed in the receipt, per plan.md 5.2/5.6)');
  // The verdict itself must be unaffected by the channel failing.
  assert.strictEqual(out.res.exitCode, runner.EX_OK);
});

// ── (c) the DD3 negative test ────────────────────────────────────────────────

test('(c) tampering with the audit envelope on disk does NOT change the verdict', function () {
  const s = scratch(PRD_PLAN);
  const env = envelopeWith([{ title: 'F1', severity: 'high', body: 'real finding' }]);
  const p = stageAdjudication(s, 'n9', env);

  // Corrupt the audit copy the moment it is written, before the decision is
  // reached. If anything downstream re-read it, the digests would stop matching
  // and the verdict would flip to incomplete.
  const out = runWith(s, { runNonce: 'n9' }, env, function (args) {
    return { path: '/fake/r.json',
      receipt: { plan_hash: args.__x || require('../../receipt/hash').planAwareMarkdownHash(s.planAbs),
        receipt_hash: 'sha256:' + 'a'.repeat(64) } };
  });
  assert.strictEqual(out.res.verdict, 'preserved');

  // The audit copy exists and is now tampered — and the decision already stood.
  assert.ok(fs.existsSync(p.envelope), 'audit copy must be kept for forensics');
  fs.writeFileSync(p.envelope, JSON.stringify({ ok: true, stdout: '{"result":{"verdict":"approve","findings":[]}}' }));
  const reread = JSON.parse(fs.readFileSync(p.envelope, 'utf8'));
  assert.strictEqual(JSON.parse(reread.stdout).result.verdict, 'approve');
  // ...and the verdict the runner returned is unchanged, because nothing reads it.
  assert.strictEqual(out.res.verdict, 'preserved');
});

// ── (F5) lock ────────────────────────────────────────────────────────────────

test('F5 — a second runner refuses to write while a live run owns the decision', function () {
  const s = scratch(PRD_PLAN);
  const p = runner.paths(s.tmpDir, 'r', 'held');
  // A live holder: this very process.
  fs.writeFileSync(p.lock, JSON.stringify({
    run_nonce: 'other', pid: process.pid, host: require('os').hostname(),
    started_at: new Date().toISOString(),
  }));
  const out = runWith(s, { runNonce: 'n10' }, envelopeWith([]));
  assert.strictEqual(out.res.exitCode, runner.EX_LOCK_HELD,
    'a concurrent run must not become a second writer for the same receipt');
  assert.strictEqual(out.captured.length, 0);
  fs.unlinkSync(p.lock);
});

test('F5 — a lock left by a dead process is reclaimed', function () {
  const s = scratch(PRD_PLAN);
  const p = runner.paths(s.tmpDir, 'r', 'stale');
  fs.writeFileSync(p.lock, JSON.stringify({
    run_nonce: 'dead', pid: 999999999, host: require('os').hostname(),
    started_at: new Date(0).toISOString(),
  }));
  const out = runWith(s, { runNonce: 'n11' }, envelopeWith([]));
  assert.strictEqual(out.res.exitCode, runner.EX_OK, out.res.reason || '');
});

test('F5 — the lock is released on the way out', function () {
  const s = scratch(PRD_PLAN);
  const out = runWith(s, { runNonce: 'n12' }, envelopeWith([]));
  assert.strictEqual(out.res.exitCode, runner.EX_OK);
  const p = runner.paths(s.tmpDir, 'r', 'n12');
  assert.strictEqual(fs.existsSync(p.lock), false, 'a finished run must not hold the lock');
});

test('F5 — the completion marker binds the run nonce and the receipt hash', function () {
  const s = scratch(PRD_PLAN);
  const out = runWith(s, { runNonce: 'n13' }, envelopeWith([]));
  const p = runner.paths(s.tmpDir, 'r', 'n13');
  const marker = JSON.parse(fs.readFileSync(p.marker, 'utf8'));
  assert.strictEqual(marker.run_nonce, 'n13');
  assert.strictEqual(marker.decision_id, 'r');
  assert.strictEqual(marker.exit_code, 0);
  assert.ok(marker.receipt_hash, 'the marker must carry the hash the caller binds validate to');
});

test('usage — plan, decision and run-nonce are all required', function () {
  const r = runner.run({}, { invokeAdversarialReview: function () {}, write: function () {} });
  assert.strictEqual(r.exitCode, runner.EX_USAGE);
});

test('parseArgs maps the documented flags', function () {
  const o = runner.parseArgs(['--plan', 'p.md', '--decision', 'd', '--run-nonce', 'n',
    '--impeccable-available', '--adjudication-timeout-ms', '5000']);
  assert.strictEqual(o.plan, 'p.md');
  assert.strictEqual(o.decision, 'd');
  assert.strictEqual(o.runNonce, 'n');
  assert.strictEqual(o.impeccableAvailable, true);
  assert.strictEqual(o.adjudicationTimeoutMs, 5000);
});

// ── (d) santa-loop R1 — the review→write binding, bounds, and path safety ────
//
// These four cover the gaps the round-1 external reviewer found: DD4-1 was
// downgraded to a warning (so nothing enforced the binding), the adjudication
// byte cap was applied only after the file was already read, and the temp-path
// components were unvalidated.

// The seam: the injected invoke runs AFTER the plan has been read for review and
// BEFORE the receipt is written, which is exactly the window a mid-review edit
// lands in.
function runMutatingPlanDuringReview(s, nonce, envelope, mutatePlan) {
  const captured = [];
  captured.planHash = require('../../receipt/hash').planAwareMarkdownHash(s.planAbs);
  const res = runner.run({
    plan: s.planRel, decision: 'r', runNonce: nonce, cwd: s.dir, tmpDir: s.tmpDir,
    env: {}, adjudicationTimeoutMs: 3000,
  }, {
    invokeAdversarialReview: function () {
      mutatePlan();
      captured.planHash = require('../../receipt/hash').planAwareMarkdownHash(s.planAbs);
      return envelope;
    },
    write: fakeWrite(captured),
  });
  return { res: res, captured: captured };
}

test('DD4-1 — editing the plan OUTSIDE the gate-injected section blocks the write', function () {
  const s = scratch(PRD_PLAN);
  const env = envelopeWith([{ title: 'F1', severity: 'high', body: 'b1' }]);
  stageAdjudication(s, 'n14', env);
  const out = runMutatingPlanDuringReview(s, 'n14', env, function () {
    // Add a User Intent row the reviewer never saw — the reference that was
    // injected into Codex no longer describes this plan.
    fs.writeFileSync(s.planAbs, PRD_PLAN.replace(
      '| UI2 | do not replace the codex reviewer | exclusion |',
      '| UI2 | do not replace the codex reviewer | exclusion |\n' +
      '| UI3 | smuggled in after the review ran | direction |'));
  });
  assert.strictEqual(out.res.exitCode, runner.EX_BLOCKED);
  assert.strictEqual(out.res.verdict, 'incomplete');
  assert.strictEqual(out.captured.length, 0,
    'DD4-1: no receipt may be written for a body that was never reviewed');
});

test('DD4-1 — the gate injecting its OWN review record does not block the write', function () {
  const s = scratch(PRD_PLAN + '\n## Codex Adversarial Review\n\n<!-- placeholder -->\n');
  const env = envelopeWith([{ title: 'F1', severity: 'high', body: 'b1' }]);
  stageAdjudication(s, 'n15', env);
  const out = runMutatingPlanDuringReview(s, 'n15', env, function () {
    // Exactly what plan.md Phase 5.3 does: replace the placeholder with triage.
    fs.writeFileSync(s.planAbs, PRD_PLAN +
      '\n## Codex Adversarial Review\n\n| F1 | HIGH | ACCEPT_NOW | absorbed |\n');
  });
  assert.strictEqual(out.res.exitCode, runner.EX_OK, out.res.reason);
  assert.strictEqual(out.res.verdict, 'preserved');
  assert.strictEqual(out.captured.length, 1, 'the gate must not abort on its own injection');
});

test('security S4 — an oversized adjudication is refused BEFORE it is read', function () {
  const s = scratch(PRD_PLAN);
  const env = envelopeWith([{ title: 'F1', severity: 'high', body: 'b1' }]);
  const p = runner.paths(s.tmpDir, 'r', 'n16');
  // One byte over the cap, written cheaply as a sparse-ish buffer.
  const over = ic.ADJUDICATION_LIMITS.FILE_BYTES + 1;
  const fd = fs.openSync(p.adjudication, 'w');
  fs.ftruncateSync(fd, over);
  fs.closeSync(fd);
  assert.strictEqual(fs.statSync(p.adjudication).size, over);

  const out = runWith(s, { runNonce: 'n16' }, env);
  assert.strictEqual(out.res.exitCode, runner.EX_BLOCKED);
  assert.strictEqual(out.res.verdict, 'incomplete');
  assert.match(String(out.res.reason), /too large/);
  assert.match(String(out.res.reason), /before reading/,
    'the bound must be enforced at the read boundary, not after the file is in memory');
  assert.strictEqual(out.captured.length, 0);
});

test('security S5b — decision/run-nonce cannot escape the tmp dir', function () {
  const s = scratch(PRD_PLAN);
  const outside = path.join(s.dir, 'victim.lock');
  fs.writeFileSync(outside, 'do not delete me');

  ['../victim', 'x/../../victim', 'a/b', '..'].forEach(function (evil) {
    const r1 = runner.run({
      plan: s.planRel, decision: evil, runNonce: 'n17', cwd: s.dir, tmpDir: s.tmpDir, env: {},
    }, { invokeAdversarialReview: function () { throw new Error('must not reach codex'); },
      write: function () { throw new Error('must not reach write'); } });
    assert.strictEqual(r1.exitCode, runner.EX_USAGE, 'decision "' + evil + '" must be refused');

    const r2 = runner.run({
      plan: s.planRel, decision: 'r', runNonce: evil, cwd: s.dir, tmpDir: s.tmpDir, env: {},
    }, { invokeAdversarialReview: function () { throw new Error('must not reach codex'); },
      write: function () { throw new Error('must not reach write'); } });
    assert.strictEqual(r2.exitCode, runner.EX_USAGE, 'run-nonce "' + evil + '" must be refused');
  });

  assert.strictEqual(fs.readFileSync(outside, 'utf8'), 'do not delete me',
    'the lock reclaim path must never be able to unlink a file outside the tmp dir');
});

// ── M1.5 — mislabel axis wiring (Task 6) ─────────────────────────────────────

const iclaims = require('../intent-claims');

function claimFinding(claim, i) {
  return {
    title: 'F' + (i || 0),
    severity: 'high',
    body: 'the finding body\nINTENT: ' + claim,
  };
}

// Build the adjudication object WITHOUT writing it, so a concurrent helper can
// drop it in later.
function adjudicationFor(s, envelope, mutate) {
  const payload = codexPayload.parseReviewPayload(envelope);
  const file = {
    plan_path: s.planRel,
    round: 1,
    review_payload_digest: ic.canonicalDigest(payload),
    adjudications: payload.findings.map(function (f, i) {
      return {
        finding_index: i,
        finding_digest: ic.canonicalDigest(f),
        intent_conflict: 'none',
        verdict: 'REJECT_YAGNI',
        rationale: 'not needed for this milestone',
        intent_override_reason: null,
      };
    }),
  };
  if (mutate) mutate(file);
  return file;
}

function runMislabel(s, nonce, envelope, mode, mutate) {
  const p = runner.paths(s.tmpDir, 'r', nonce);
  fs.writeFileSync(p.adjudication,
    JSON.stringify(adjudicationFor(s, envelope, mutate), null, 2));
  return runWith(s, { runNonce: nonce, env: { MCCP_INTENT_MISLABEL: mode } }, envelope);
}

test('M1.5 — reviewer-only with no dispute blocks the write under enforce', function () {
  const s = scratch(PRD_PLAN);
  const env = envelopeWith([claimFinding('UI1', 1)], { rawFindings: true });
  const out = runMislabel(s, 'm1', env, 'enforce');
  assert.strictEqual(out.res.verdict, 'mislabel_unresolved');
  assert.strictEqual(out.res.exitCode, runner.EX_BLOCKED);
  assert.strictEqual(out.captured.length, 0, 'enforce must not write a receipt');
});

test('M1.5 — warn seals the blocking verdict instead of suppressing it', function () {
  const s = scratch(PRD_PLAN);
  const env = envelopeWith([claimFinding('UI1', 1)], { rawFindings: true });
  const out = runMislabel(s, 'm2', env, 'warn');
  assert.strictEqual(out.res.exitCode, runner.EX_OK);
  assert.strictEqual(out.captured.length, 1, 'warn writes a receipt');
  const d = out.captured[0].intentDecision;
  assert.strictEqual(d.verdict, 'mislabel_unresolved', 'the real verdict stays sealed');
  assert.strictEqual(d.mislabel_mode, 'warn');
  assert.strictEqual(d.force_override, false,
    'warn passed it, so no override was ever applied (DD12)');
  assert.strictEqual(d.reviewer_contract, 'full');
  assert.strictEqual(d.claim_counts.reviewer_only, 1);
  assert.strictEqual(d.mislabel_disputes, 0);
});

test('M1.5 — a substantive dispute resolves the case and is sealed with its digest', function () {
  const s = scratch(PRD_PLAN);
  const env = envelopeWith([claimFinding('UI1', 1)], { rawFindings: true });
  const out = runMislabel(s, 'm3', env, 'enforce', function (file) {
    file.adjudications[0].intent_dispute_reason =
      'the reviewer misread the boundary and this finding never touches that constraint';
  });
  assert.strictEqual(out.res.verdict, 'preserved');
  const d = out.captured[0].intentDecision;
  assert.strictEqual(d.mislabel_disputes, 1);
  assert.strictEqual(d.mislabel_audit.length, 1);
  const entry = d.mislabel_audit[0];
  assert.strictEqual(entry.classification, 'reviewer-only');
  assert.strictEqual(entry.resolution, 'disputed');
  assert.strictEqual(entry.reviewer_claim, 'UI1');
  assert.strictEqual(entry.author_conflict, 'none');
  // DD11 — the entry must bind to THIS payload, not merely to a same-shaped one.
  const payload = codexPayload.parseReviewPayload(env);
  assert.strictEqual(entry.finding_digest, ic.canonicalDigest(payload.findings[0]));
  assert.ok(typeof d.claims_digest === 'string' && d.claims_digest.indexOf('sha256:') === 0);
});

test('M1.5 — a rejected dispute is recorded, not silently dropped', function () {
  const s = scratch(PRD_PLAN);
  const env = envelopeWith([claimFinding('UI1', 1)], { rawFindings: true });
  const out = runMislabel(s, 'm4', env, 'warn', function (file) {
    file.adjudications[0].intent_dispute_reason = 'no';
  });
  const d = out.captured[0].intentDecision;
  assert.strictEqual(d.verdict, 'mislabel_unresolved');
  assert.strictEqual(d.mislabel_disputes, 0, 'a one-token dispute does not count');
  assert.strictEqual(d.mislabel_audit[0].resolution, 'unresolved');
  assert.strictEqual(d.mislabel_audit[0].dispute_reason, 'no',
    'the rejected text is still auditable — what was rejected and why is the point');
});

test('M1.5 — off does not call the claims parser AND does not change the prompt', function () {
  const s = scratch(PRD_PLAN);
  const env = envelopeWith([claimFinding('UI1', 1)], { rawFindings: true });
  const p = runner.paths(s.tmpDir, 'r', 'm5');
  fs.writeFileSync(p.adjudication, JSON.stringify(adjudicationFor(s, env), null, 2));

  const original = iclaims.parseReviewerClaims;
  let called = 0;
  iclaims.parseReviewerClaims = function () { called += 1; return original.apply(null, arguments); };
  const seenOpts = [];
  const captured = [];
  captured.planHash = require('../../receipt/hash').planAwareMarkdownHash(s.planAbs);
  try {
    const res = runner.run({
      plan: s.planRel, decision: 'r', cwd: s.dir, tmpDir: s.tmpDir,
      runNonce: 'm5', adjudicationTimeoutMs: 3000,
      env: { MCCP_INTENT_MISLABEL: 'off' },
    }, {
      invokeAdversarialReview: function (focus, opts) { seenOpts.push(opts); return env; },
      write: fakeWrite(captured),
    });
    // (1) the oracle path is not entered at all — this is DD5's "경로 미진입",
    //     not a suppressed verdict.
    assert.strictEqual(called, 0, 'off must not even parse reviewer claims');
    // (2) the reviewer prompt is unchanged — without this, `off` is not
    //     end-to-end M1 equivalent even though the oracle was untouched.
    assert.strictEqual(seenOpts[0].mislabelContract, false);
    // (3) and the verdict is the M1 one.
    assert.strictEqual(res.verdict, 'preserved');
    assert.strictEqual(captured[0].intentDecision.mislabel_mode, 'off');
    assert.strictEqual(captured[0].intentDecision.reviewer_contract, null);
    assert.strictEqual(captured[0].intentDecision.mislabel_audit, null);
  } finally {
    iclaims.parseReviewerClaims = original;
  }
});

test('M1.5 — non-off modes DO ask for the contract paragraph', function () {
  const s = scratch(PRD_PLAN);
  const env = envelopeWith([claimFinding('none', 1)], { rawFindings: true });
  const p = runner.paths(s.tmpDir, 'r', 'm6');
  fs.writeFileSync(p.adjudication, JSON.stringify(adjudicationFor(s, env), null, 2));
  const seenOpts = [];
  const captured = [];
  captured.planHash = require('../../receipt/hash').planAwareMarkdownHash(s.planAbs);
  runner.run({
    plan: s.planRel, decision: 'r', cwd: s.dir, tmpDir: s.tmpDir,
    runNonce: 'm6', adjudicationTimeoutMs: 3000,
    env: { MCCP_INTENT_MISLABEL: 'enforce' },
  }, {
    invokeAdversarialReview: function (focus, opts) { seenOpts.push(opts); return env; },
    write: fakeWrite(captured),
  });
  assert.strictEqual(seenOpts[0].mislabelContract, true);
});

// ── DD2 — the claims come from MEMORY, and a concurrent tamper proves it ─────

test('DD2 — tampering with the awaiting artifact WHILE the runner waits changes nothing', function () {
  const s = scratch(PRD_PLAN);
  const env = envelopeWith([claimFinding('UI1', 1)], { rawFindings: true });
  const p = runner.paths(s.tmpDir, 'r', 'm7');

  // The adjudication is staged in a sidecar; the helper moves it into place only
  // AFTER rewriting every reviewer_claim in the awaiting file to `none`. If the
  // runner re-read that file, the comparison would become agree-none and the
  // verdict would flip to `preserved` — which is exactly the forgery DD2 forbids.
  const pending = p.adjudication + '.pending';
  fs.writeFileSync(pending, JSON.stringify(adjudicationFor(s, env), null, 2));

  // The runner's `finally` unlinks the awaiting file, so the helper also keeps a
  // copy of what it wrote — otherwise "the tamper landed" is unverifiable after
  // the run and this test could pass while doing nothing.
  const proof = p.awaiting + '.tampered';
  const helper = [
    'const fs=require("fs");',
    'const [awaiting,pending,target,proof]=process.argv.slice(1);',
    'const deadline=Date.now()+8000;',
    '(function loop(){',
    '  if(fs.existsSync(awaiting)){',
    '    try{',
    '      const o=JSON.parse(fs.readFileSync(awaiting,"utf8"));',
    '      (o.findings||[]).forEach(function(f){f.reviewer_claim="none";f.reviewer_claim_status="claimed";});',
    '      o.claims_digest="sha256:"+"0".repeat(64);',
    '      const s=JSON.stringify(o);',
    '      fs.writeFileSync(awaiting,s);',
    '      fs.writeFileSync(proof,s);',
    '    }catch(e){fs.writeFileSync(proof,JSON.stringify({error:String(e)}));}',
    '    fs.renameSync(pending,target);',
    '    return;',
    '  }',
    '  if(Date.now()<deadline) setTimeout(loop,15);',
    '})();',
  ].join('');

  const child = require('child_process').spawn(
    process.execPath, ['-e', helper, p.awaiting, pending, p.adjudication, proof],
    { stdio: 'ignore' });

  try {
    const out = runWith(s, {
      runNonce: 'm7', env: { MCCP_INTENT_MISLABEL: 'warn' }, adjudicationTimeoutMs: 9000,
    }, env);

    // The awaiting file really was rewritten to say `none` everywhere...
    const tampered = JSON.parse(fs.readFileSync(proof, 'utf8'));
    assert.strictEqual(tampered.findings[0].reviewer_claim, 'none',
      'the tamper must have actually landed, or this test proves nothing');

    // ...and the decision is unchanged, because the comparison read the local
    // variable the parser produced, never this file.
    const d = out.captured[0].intentDecision;
    assert.strictEqual(d.verdict, 'mislabel_unresolved');
    assert.strictEqual(d.claim_counts.reviewer_only, 1);
    assert.strictEqual(d.claim_counts.agree_none, 0);
    assert.notStrictEqual(d.claims_digest, 'sha256:' + '0'.repeat(64),
      'the sealed digest is the in-memory one, not the tampered file');
  } finally {
    try { child.kill(); } catch (_) { /* already exited */ }
  }
});

// ── Task 8 — end-to-end through the REAL receipt writer ─────────────────────

test('e2e — reviewer-only blocks the real write, then a dispute lets it through', function () {
  const { mkTmpRepo, writeFileSync } = require('../../receipt/tests/helpers');
  const { validate } = require('../../receipt/schema');

  const repo = mkTmpRepo();
  writeFileSync(repo, '.claude/plans/e2e.plan.md', PRD_PLAN);
  const planRel = '.claude/plans/e2e.plan.md';
  const tmpDir = path.join(repo, '.mccp-tmp');
  fs.mkdirSync(tmpDir, { recursive: true });

  const env = envelopeWith([claimFinding('UI1', 1)], { rawFindings: true });
  const payload = codexPayload.parseReviewPayload(env);
  const baseFile = {
    plan_path: planRel,
    round: 1,
    review_payload_digest: ic.canonicalDigest(payload),
    adjudications: [{
      finding_index: 0,
      finding_digest: ic.canonicalDigest(payload.findings[0]),
      intent_conflict: 'none',            // the reviewer said UI1 — this is the mislabel
      verdict: 'REJECT_YAGNI',
      rationale: 'out of scope for this milestone',
      intent_override_reason: null,
    }],
  };

  const runOnce = function (nonce, file) {
    fs.writeFileSync(runner.paths(tmpDir, 'e2e', nonce).adjudication,
      JSON.stringify(file, null, 2));
    return runner.run({
      plan: planRel, decision: 'e2e', cwd: repo, tmpDir: tmpDir,
      runNonce: nonce, adjudicationTimeoutMs: 3000,
      env: { MCCP_INTENT_MISLABEL: 'enforce' },
    }, { invokeAdversarialReview: function () { return env; } });
  };

  // The receipt schema requires a UUID for meta.intent_run_nonce, so the e2e
  // must use the same nonce shape production does.
  const NONCE_BLOCKED = '11111111-2222-4333-8444-555555555551';
  const NONCE_PASSED = '11111111-2222-4333-8444-555555555552';

  // 1. No answer to the reviewer's claim → the real writer refuses.
  const blocked = runOnce(NONCE_BLOCKED, baseFile);
  assert.strictEqual(blocked.exitCode, runner.EX_BLOCKED);
  assert.strictEqual(blocked.verdict, 'mislabel_unresolved');
  assert.strictEqual(
    fs.existsSync(path.join(repo, '.claude/receipts/mccp-plan-codex/e2e.json')), false,
    'enforce must leave no receipt behind');

  // 2. Same payload, now disputed → the receipt lands and validates.
  const disputed = JSON.parse(JSON.stringify(baseFile));
  disputed.adjudications[0].intent_dispute_reason =
    'the reviewer misread the module boundary and this finding never touches that constraint';
  const passed = runOnce(NONCE_PASSED, disputed);
  assert.strictEqual(passed.exitCode, runner.EX_OK, passed.reason);
  assert.strictEqual(passed.verdict, 'preserved');

  const receipt = JSON.parse(fs.readFileSync(passed.receiptPath, 'utf8'));
  const v = validate(receipt);
  assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
  assert.strictEqual(receipt.meta.intent_gate_verdict, 'preserved');
  assert.strictEqual(receipt.meta.intent_mislabel_mode, 'enforce');
  assert.strictEqual(receipt.meta.intent_reviewer_contract, 'full');
  assert.strictEqual(receipt.meta.intent_mislabel_disputes, 1);
  assert.strictEqual(receipt.meta.intent_claim_counts.reviewer_only, 1);
  assert.strictEqual(receipt.meta.intent_mislabel_audit.length, 1);
  assert.strictEqual(receipt.meta.intent_mislabel_audit[0].resolution, 'disputed');
  // The audit entry binds to the payload that was actually reviewed.
  assert.strictEqual(receipt.meta.intent_mislabel_audit[0].finding_digest,
    ic.canonicalDigest(payload.findings[0]));
  // And a disputed pass is a real pass — dedupe may rely on it.
  assert.strictEqual(ic.isIntentApproved(receipt), true);
});

test('DD2 — the runner never reads the awaiting artifact back', function () {
  const src = fs.readFileSync(require.resolve('../plan-codex-runner'), 'utf8');
  const readsAwaiting = /readFileSync\(\s*p\.awaiting/.test(src);
  assert.strictEqual(readsAwaiting, false,
    'a read of p.awaiting would make that file the gate — anything able to write ' +
    'it could forge a passing verdict');
});
