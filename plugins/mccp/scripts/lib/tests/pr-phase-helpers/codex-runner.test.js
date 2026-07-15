'use strict';

// codex-runner integration tests. Uses real pr-phase-lock.js CLI + a stub
// codex-invoke.js to validate the orchestration: lock enter → outcome
// branching (skip / dedupe / invoke) → lock exit → mutations capture.
//
// F11 R3-F2 contract: token must NEVER appear in any child process's argv.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const RUNNER = path.resolve(__dirname, '..', '..', 'pr-phase-helpers', 'codex-runner.js');
const LOCK_CLI = path.resolve(__dirname, '..', '..', 'pr-phase-lock.js');
const NODE = process.execPath;

// v0.3.5 — strip ambient MCCP_CODEX_DISABLED so legacy dedupe/skipped/invoke
// tests behave hermetically regardless of the harness's permanent-bypass setting
// (skypark207's .claude/settings.local.json sets it for daily work). Tests that
// SPECIFICALLY want the disabled path opt-in by passing their own env. v0.3.4
// canonical pattern mirror (codex-bridge.test.js:143-152).
function envWithoutDisabled() {
  const e = { ...process.env };
  delete e.MCCP_CODEX_DISABLED;
  return e;
}

function mkTmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-runner-'));
  execFileSync('git', ['init', '--initial-branch=master', '--quiet'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir, stdio: 'ignore' });
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n');
  execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'initial', '--quiet'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

function writeStub(dir, name, body) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, body, 'utf8');
  return p;
}

// v1.22.3 M3 — the stub now emits the REAL codex-invoke envelope.
//
// This stub previously put `findings` / `summary` directly ON the envelope. The
// real codex-invoke.js never does that: its ok-path envelope is
// { ok, stdout, stderr, durationMs, classification, blocking, advisory } and the
// entire review lives inside `.stdout` as the companion's JSON text. So the stub
// encoded the runner's (wrong) assumption instead of the producer's actual
// contract, and the suite stayed green while codex_summary was always '' and
// codex_actionable_findings was always false in production — a needs-attention
// verdict was rubber-stamped. Stubs must mirror the real producer, or they only
// test the implementation against itself.
function stubCodexEnvelope(review) {
  return [
    '#!/usr/bin/env node',
    '"use strict";',
    'process.stdout.write(JSON.stringify({',
    '  ok: true,',
    '  classification: "ok",',
    '  blocking: false,',
    '  advisory: false,',
    '  durationMs: 1,',
    '  stderr: "",',
    // The companion wraps the model payload under `.result` (verbatim shape of a
    // real run). `.stdout` is TEXT, hence the nested stringify.
    '  stdout: ' + JSON.stringify(JSON.stringify({
      review: 'Adversarial Review',
      threadId: 'stub-thread',
      result: review,
    })),
    '}));',
    'process.exit(0);',
  ].join('\n');
}

// verdict vocabulary per codex/prompts/adversarial-review.md: approve | needs-attention
const STUB_CODEX_OK = stubCodexEnvelope({
  verdict: 'approve', summary: 'stub-codex-ok', findings: [],
});

const STUB_CODEX_FINDINGS = stubCodexEnvelope({
  verdict: 'approve', summary: 'stub-codex-ok',
  findings: [{ severity: 'MEDIUM', title: 'stub finding', body: 'stub finding' }],
});

// The case the old stub could not express: a blocking verdict with a finding.
const STUB_CODEX_NEEDS_ATTENTION = stubCodexEnvelope({
  verdict: 'needs-attention',
  summary: 'No ship: stub blocking risk',
  findings: [{ severity: 'high', title: 'stub high', body: 'stub high risk' }],
});

// verdict=needs-attention with NO findings — actionable must still be true.
const STUB_CODEX_NEEDS_ATTENTION_NO_FINDINGS = stubCodexEnvelope({
  verdict: 'needs-attention', summary: 'No ship: risk without an itemized finding', findings: [],
});

// class=ok but the review text is unparseable → fail-closed actionable.
const STUB_CODEX_UNREADABLE = [
  '#!/usr/bin/env node',
  '"use strict";',
  'process.stdout.write(JSON.stringify({',
  '  ok: true, classification: "ok", blocking: false, advisory: false,',
  '  durationMs: 1, stderr: "", stdout: "not-json-at-all"',
  '}));',
  'process.exit(0);',
].join('\n');

const STUB_CODEX_BLOCKING = [
  '#!/usr/bin/env node',
  '"use strict";',
  'process.stdout.write(JSON.stringify({',
  '  classification: "stdout-empty",',
  '  blocking: true,',
  '}));',
  'process.exit(12);',
].join('\n');

test('codex-runner dedupe path: short-circuits Codex, lock enter+exit clean', () => {
  const repo = mkTmpRepo();
  const stub = writeStub(repo, 'fake-codex.js', STUB_CODEX_OK);
  const bodyFile = path.join(repo, '.git', 'mccp', 'tmp', 'body.md');
  fs.mkdirSync(path.dirname(bodyFile), { recursive: true });
  const r = spawnSync(NODE, [RUNNER,
    '--base', 'master',
    '--decision', 'demo',
    '--body-file', bodyFile,
    '--dedupe',
    '--codex-invoke', stub,
    '--lock-cli', LOCK_CLI,
    '--cwd', repo,
  ], { encoding: 'utf8', env: envWithoutDisabled() });
  assert.strictEqual(r.status, 0, 'dedupe + clean exit returns 0: ' + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.codex_outcome, 'deduped');
  assert.strictEqual(out.codex_rounds, 0);
  assert.strictEqual(out.lock_exit_ok, true);
  assert.strictEqual(out.mutations.length, 0);
  assert.match(out.codex_summary, /cross-gate dedupe/);
});

test('codex-runner skip path: --skip-reason sets outcome=skipped, no codex call', () => {
  const repo = mkTmpRepo();
  const stub = writeStub(repo, 'fake-codex.js', STUB_CODEX_OK);
  const bodyFile = path.join(repo, '.git', 'mccp', 'tmp', 'body.md');
  fs.mkdirSync(path.dirname(bodyFile), { recursive: true });
  const r = spawnSync(NODE, [RUNNER,
    '--base', 'master',
    '--decision', 'demo',
    '--body-file', bodyFile,
    '--skip-reason', 'codex registry stale; out-of-band verification done',
    '--codex-invoke', stub,
    '--lock-cli', LOCK_CLI,
    '--cwd', repo,
  ], { encoding: 'utf8', env: envWithoutDisabled() });
  assert.strictEqual(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.codex_outcome, 'skipped');
  assert.match(out.codex_skip_reason, /codex registry stale/);
});

// v0.3.5 — MCCP_CODEX_DISABLED env-level disabled outcome (Plan §Task 3).
// Canonical env snapshot/restore inline so the test is hermetic regardless of
// the harness's ambient MCCP_CODEX_DISABLED setting (mirror of
// codex-bridge.test.js:143-152).
test('codex-runner disabled path: MCCP_CODEX_DISABLED=1 sets outcome=disabled, no codex call', () => {
  const prev = process.env.MCCP_CODEX_DISABLED;
  process.env.MCCP_CODEX_DISABLED = '1';
  try {
    const repo = mkTmpRepo();
    const stub = writeStub(repo, 'fake-codex.js', STUB_CODEX_OK);
    const bodyFile = path.join(repo, '.git', 'mccp', 'tmp', 'body.md');
    fs.mkdirSync(path.dirname(bodyFile), { recursive: true });
    const r = spawnSync(NODE, [RUNNER,
      '--base', 'master',
      '--decision', 'demo',
      '--body-file', bodyFile,
      // Note: NO --skip-reason — env policy should take effect by itself.
      '--codex-invoke', stub,
      '--lock-cli', LOCK_CLI,
      '--cwd', repo,
    ], { encoding: 'utf8', env: { ...process.env, MCCP_CODEX_DISABLED: '1' } });
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.codex_outcome, 'disabled');
    assert.strictEqual(out.codex_skip_reason, 'codex_disabled');
    assert.strictEqual(out.codex_rounds, 0);
    assert.match(out.codex_summary, /env-level policy/);
  } finally {
    if (prev === undefined) delete process.env.MCCP_CODEX_DISABLED;
    else process.env.MCCP_CODEX_DISABLED = prev;
  }
});

test('codex-runner disabled precedence: env=1 beats explicit --skip-reason (env is canonical)', () => {
  const prev = process.env.MCCP_CODEX_DISABLED;
  process.env.MCCP_CODEX_DISABLED = '1';
  try {
    const repo = mkTmpRepo();
    const stub = writeStub(repo, 'fake-codex.js', STUB_CODEX_OK);
    const bodyFile = path.join(repo, '.git', 'mccp', 'tmp', 'body.md');
    fs.mkdirSync(path.dirname(bodyFile), { recursive: true });
    const r = spawnSync(NODE, [RUNNER,
      '--base', 'master',
      '--decision', 'demo',
      '--body-file', bodyFile,
      '--skip-reason', 'manual escape — should be overridden by env policy',
      '--codex-invoke', stub,
      '--lock-cli', LOCK_CLI,
      '--cwd', repo,
    ], { encoding: 'utf8', env: { ...process.env, MCCP_CODEX_DISABLED: '1' } });
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.codex_outcome, 'disabled');
    assert.strictEqual(out.codex_skip_reason, 'codex_disabled');
  } finally {
    if (prev === undefined) delete process.env.MCCP_CODEX_DISABLED;
    else process.env.MCCP_CODEX_DISABLED = prev;
  }
});

test('codex-runner invoke path: stub codex-ok → lock_exit_ok=true, no mutations', () => {
  const repo = mkTmpRepo();
  const stub = writeStub(repo, 'fake-codex.js', STUB_CODEX_OK);
  const bodyFile = path.join(repo, '.git', 'mccp', 'tmp', 'body.md');
  fs.mkdirSync(path.dirname(bodyFile), { recursive: true });
  const r = spawnSync(NODE, [RUNNER,
    '--base', 'master',
    '--decision', 'demo',
    '--body-file', bodyFile,
    '--codex-invoke', stub,
    '--lock-cli', LOCK_CLI,
    '--heartbeat-ms', '60000',  // suppress real heartbeats during fast test
    '--cwd', repo,
  ], { encoding: 'utf8', timeout: 30000, env: envWithoutDisabled() });
  assert.strictEqual(r.status, 0, 'invoke + clean exit returns 0: ' + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.codex_outcome, 'invoked');
  assert.strictEqual(out.lock_exit_ok, true);
  assert.strictEqual(out.codex_actionable_findings, false);
  assert.strictEqual(out.mutations.length, 0);
  // v1.22.3 M3 — the review must actually be READ out of the envelope's .stdout,
  // not looked for on the envelope itself (where it never exists).
  assert.strictEqual(out.codex_verdict, 'approve');
  assert.strictEqual(out.codex_summary, 'stub-codex-ok',
    'summary comes from the parsed review payload; the old envelope read yielded ""');
  // Lock unlinked
  assert.ok(!fs.existsSync(path.join(repo, '.claude', 'state', 'pr-phase.lock')));
});

// ── v1.22.3 M3 — PR-Codex gate blindness regression (the rubber-stamp hole) ────
//
// Measured live on the v1.22.3 M3 branch: codex-runner reported
// actionable=false while the same diff's review carried verdict="needs-attention"
// + a HIGH finding. The gate verified only THAT Codex ran, never WHAT it
// concluded, so a "No ship" verdict created the PR anyway.

function runInvoke(stubBody) {
  const repo = mkTmpRepo();
  const stub = writeStub(repo, 'fake-codex.js', stubBody);
  const bodyFile = path.join(repo, '.git', 'mccp', 'tmp', 'body.md');
  fs.mkdirSync(path.dirname(bodyFile), { recursive: true });
  const r = spawnSync(NODE, [RUNNER,
    '--base', 'master', '--decision', 'demo', '--body-file', bodyFile,
    '--codex-invoke', stub, '--lock-cli', LOCK_CLI,
    '--heartbeat-ms', '60000', '--cwd', repo,
  ], { encoding: 'utf8', timeout: 30000, env: envWithoutDisabled() });
  assert.strictEqual(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test('M3: verdict=needs-attention + HIGH finding → actionable=true (was rubber-stamped)', () => {
  const out = runInvoke(STUB_CODEX_NEEDS_ATTENTION);
  assert.strictEqual(out.codex_verdict, 'needs-attention');
  assert.strictEqual(out.codex_actionable_findings, true,
    'a blocking verdict must make the receipt non-approving');
  assert.match(out.codex_summary, /No ship/);
  assert.strictEqual(out.codex_findings.length, 1);
  assert.strictEqual(out.codex_findings[0].severity, 'high');
});

test('M3: verdict=needs-attention with NO findings → still actionable (verdict alone blocks)', () => {
  const out = runInvoke(STUB_CODEX_NEEDS_ATTENTION_NO_FINDINGS);
  assert.strictEqual(out.codex_verdict, 'needs-attention');
  assert.strictEqual(out.codex_actionable_findings, true,
    'actionable must not depend on an itemized findings array');
});

test('M3: approve + a surviving finding → actionable=true', () => {
  const out = runInvoke(STUB_CODEX_FINDINGS);
  assert.strictEqual(out.codex_verdict, 'approve');
  assert.strictEqual(out.codex_actionable_findings, true);
});

test('M3: unreadable review payload → fail-closed actionable, verdict null', () => {
  const out = runInvoke(STUB_CODEX_UNREADABLE);
  assert.strictEqual(out.codex_verdict, null);
  assert.strictEqual(out.codex_actionable_findings, true,
    'an unreadable review cannot certify approval — fail closed');
});

test('codex-runner invoke path: stub findings → codex_actionable_findings=true', () => {
  const repo = mkTmpRepo();
  const stub = writeStub(repo, 'fake-codex.js', STUB_CODEX_FINDINGS);
  const bodyFile = path.join(repo, '.git', 'mccp', 'tmp', 'body.md');
  fs.mkdirSync(path.dirname(bodyFile), { recursive: true });
  const r = spawnSync(NODE, [RUNNER,
    '--base', 'master',
    '--decision', 'demo',
    '--body-file', bodyFile,
    '--codex-invoke', stub,
    '--lock-cli', LOCK_CLI,
    '--heartbeat-ms', '60000',
    '--cwd', repo,
  ], { encoding: 'utf8', timeout: 30000, env: envWithoutDisabled() });
  assert.strictEqual(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.codex_actionable_findings, true);
});

test('codex-runner invoke path: stub blocking → fail-stop with cleanup', () => {
  const repo = mkTmpRepo();
  const stub = writeStub(repo, 'fake-codex.js', STUB_CODEX_BLOCKING);
  const bodyFile = path.join(repo, '.git', 'mccp', 'tmp', 'body.md');
  fs.mkdirSync(path.dirname(bodyFile), { recursive: true });
  const r = spawnSync(NODE, [RUNNER,
    '--base', 'master',
    '--decision', 'demo',
    '--body-file', bodyFile,
    '--codex-invoke', stub,
    '--lock-cli', LOCK_CLI,
    '--heartbeat-ms', '60000',
    '--cwd', repo,
  ], { encoding: 'utf8', timeout: 30000, env: envWithoutDisabled() });
  assert.notStrictEqual(r.status, 0, 'blocking response → non-zero exit');
  assert.match(r.stderr, /codex review failed/);
  // Lock must be released even on fail-stop
  assert.ok(!fs.existsSync(path.join(repo, '.claude', 'state', 'pr-phase.lock')),
    'cleanup released the lock');
});

test('codex-runner: missing required args fail with clear stderr', () => {
  const r = spawnSync(NODE, [RUNNER, '--base', 'main'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /--decision/);
});

test('codex-runner emits helper_manifest in output (F10 R2-F1 propagation)', () => {
  const repo = mkTmpRepo();
  const bodyFile = path.join(repo, '.git', 'mccp', 'tmp', 'body.md');
  fs.mkdirSync(path.dirname(bodyFile), { recursive: true });
  const r = spawnSync(NODE, [RUNNER,
    '--base', 'master',
    '--decision', 'demo',
    '--body-file', bodyFile,
    '--dedupe',
    '--lock-cli', LOCK_CLI,
    '--cwd', repo,
  ], { encoding: 'utf8', env: envWithoutDisabled() });
  assert.strictEqual(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(typeof out.helper_manifest, 'object');
  // Manifest should at minimum contain stdout-pipe-ipc and codex-runner itself
  const hasStdoutPipe = Object.keys(out.helper_manifest).some(function (k) {
    return /stdout-pipe-ipc\.js$/.test(k);
  });
  assert.ok(hasStdoutPipe, 'helper_manifest contains stdout-pipe-ipc.js');
});

// ── v1.22.3 M3 follow-up — PR-Codex R1 F1: scope-excluded effective verdict ────
//
// M3's verdict-read fix ACTIVATED a path that was previously unreachable: a
// non-approving verdict short-circuited before the surviving findings were
// examined, so a review that said needs-attention purely because of design/a11y
// findings sealed the receipt as `divergent` even after the design-scope filter
// dropped every one of them — zero in-scope objections, opaque block.
//
// Findings below use the REAL producer shape ({severity,title,body,file,...} per
// codex-companion render.mjs#normalizeReviewFinding). The {category,text} shape
// this suite's sibling filter fixtures use does not exist on any real payload.
function runInvokeEnv(stubBody, extraEnv) {
  const repo = mkTmpRepo();
  const stub = writeStub(repo, 'fake-codex.js', stubBody);
  const bodyFile = path.join(repo, '.git', 'mccp', 'tmp', 'body.md');
  fs.mkdirSync(path.dirname(bodyFile), { recursive: true });
  const r = spawnSync(NODE, [RUNNER,
    '--base', 'master', '--decision', 'demo', '--body-file', bodyFile,
    '--codex-invoke', stub, '--lock-cli', LOCK_CLI,
    '--heartbeat-ms', '60000', '--cwd', repo,
  ], { encoding: 'utf8', timeout: 30000,
       env: { ...envWithoutDisabled(), ...(extraEnv || {}) } });
  assert.strictEqual(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

function producerFinding(title, body, severity) {
  return {
    severity: severity || 'high', title: title, body: body,
    file: 'src/app.tsx', line_start: 1, line_end: 2, recommendation: 'fix it',
  };
}

const IMPECCABLE_ON = { MCCP_IMPECCABLE_SKILL: 'available' };
const IMPECCABLE_OFF = { MCCP_IMPECCABLE_SKILL: 'missing' };

const STUB_ALL_DESIGN = stubCodexEnvelope({
  verdict: 'needs-attention',
  summary: 'No ship: visual issues',
  findings: [
    producerFinding('Insufficient color contrast', 'Accent fails AA.'),
    producerFinding('Missing aria-label on icon button', 'Screen readers announce nothing.'),
  ],
});

const STUB_PARTIAL_DESIGN = stubCodexEnvelope({
  verdict: 'needs-attention',
  summary: 'No ship: contrast + injection',
  findings: [
    producerFinding('Insufficient color contrast', 'Accent fails AA.'),
    producerFinding('SQL injection in query builder', 'User input concatenated into SQL.'),
  ],
});

test('R1-F4: needs-attention + ALL findings scope-routed → STILL blocks, but explains itself', () => {
  const out = runInvokeEnv(STUB_ALL_DESIGN, IMPECCABLE_ON);
  // Keyword-matched drops cannot authorize a pass (no producer scope field to
  // verify against). The block stays; the opacity is what we removed.
  assert.strictEqual(out.codex_actionable_findings, true,
    'scope-exclusion explains a block, it does not make a pass');
  assert.strictEqual(out.codex_scope_excluded_verdict, true);
  assert.strictEqual(out.codex_verdict, 'needs-attention',
    'raw verdict stays RAW — honesty about what the model actually said');
  assert.strictEqual(out.codex_findings.length, 0);
  assert.ok(typeof out.dropped_findings_digest === 'string',
    'what was dropped must stay reproducible for audit');
});

test('F1 GUARD: partial drop (design + security) → still actionable, NOT scope_excluded', () => {
  const out = runInvokeEnv(STUB_PARTIAL_DESIGN, IMPECCABLE_ON);
  assert.strictEqual(out.codex_actionable_findings, true, 'a surviving security finding must still block');
  assert.strictEqual(out.codex_scope_excluded_verdict, false);
  assert.strictEqual(out.codex_findings.length, 1);
});

test('F1 GUARD: needs-attention + ZERO itemized findings → actionable (no evidence, no dissolve)', () => {
  const out = runInvokeEnv(STUB_CODEX_NEEDS_ATTENTION_NO_FINDINGS, IMPECCABLE_ON);
  assert.strictEqual(out.codex_actionable_findings, true);
  assert.strictEqual(out.codex_scope_excluded_verdict, false);
});

test('F1 GUARD: unreadable review → actionable (fail-closed, never relaxed)', () => {
  const out = runInvokeEnv(STUB_CODEX_UNREADABLE, IMPECCABLE_ON);
  assert.strictEqual(out.codex_actionable_findings, true);
  assert.strictEqual(out.codex_scope_excluded_verdict, false);
  assert.strictEqual(out.codex_verdict, null);
});

test('F1 GUARD: impeccable MISSING → filter is identity → design findings still block', () => {
  const out = runInvokeEnv(STUB_ALL_DESIGN, IMPECCABLE_OFF);
  assert.strictEqual(out.codex_actionable_findings, true,
    'without impeccable there is nowhere to route design findings — no relaxation');
  assert.strictEqual(out.codex_scope_excluded_verdict, false);
  assert.strictEqual(out.codex_findings.length, 2, 'identity filter keeps every finding');
});

test('F1: approving verdict path is unchanged (survivors>0 → actionable)', () => {
  const out = runInvokeEnv(STUB_CODEX_FINDINGS, IMPECCABLE_ON);
  assert.strictEqual(out.codex_verdict, 'approve');
  assert.strictEqual(out.codex_actionable_findings, true);
  assert.strictEqual(out.codex_scope_excluded_verdict, false);
});

// ── deriveEffectiveReview — direct unit tests of the rule table (no spawn) ────
//
// The integration tests above prove the wiring end-to-end through a real
// codex-invoke envelope; these pin the ORACLE's rule order itself, so a future
// edit that reorders the rows fails here loudly and cheaply.

const { deriveEffectiveReview } = require('../../pr-phase-helpers/codex-runner');

const f = (title) => ({ severity: 'high', title: title, body: 'b', file: 'x' });
const filt = (survivors, dropped) => ({ filteredFindings: survivors, droppedFindings: dropped });

test('oracle row 1: unreadable review → actionable, never scope-excluded', () => {
  assert.deepStrictEqual(deriveEffectiveReview(null, filt([], [f('color')])),
    { actionable: true, scopeExcluded: false });
});

test('oracle row 2: approve + survivors>0 → actionable (pre-existing path)', () => {
  assert.deepStrictEqual(deriveEffectiveReview({ verdict: 'approve' }, filt([f('sql')], [])),
    { actionable: true, scopeExcluded: false });
});

test('oracle row 2: approve + no survivors → not actionable', () => {
  assert.deepStrictEqual(deriveEffectiveReview({ verdict: 'approve' }, filt([], [])),
    { actionable: false, scopeExcluded: false });
});

test('oracle row 3: non-approve + survivors>0 → actionable (partial drop still blocks)', () => {
  assert.deepStrictEqual(deriveEffectiveReview({ verdict: 'needs-attention' }, filt([f('sql')], [f('color')])),
    { actionable: true, scopeExcluded: false });
});

test('oracle row 4: non-approve + zero itemized findings → actionable (no evidence, no dissolve)', () => {
  assert.deepStrictEqual(deriveEffectiveReview({ verdict: 'needs-attention' }, filt([], [])),
    { actionable: true, scopeExcluded: false });
});

test('oracle row 5: non-approve + all dropped → STILL actionable, flagged scope-excluded', () => {
  // There is no relaxation row: every non-approving verdict stays actionable.
  assert.deepStrictEqual(deriveEffectiveReview({ verdict: 'needs-attention' }, filt([], [f('color'), f('aria')])),
    { actionable: true, scopeExcluded: true });
});

test('oracle: verdict casing is normalized', () => {
  assert.strictEqual(deriveEffectiveReview({ verdict: 'APPROVE' }, filt([], [])).actionable, false);
});

test('oracle: an unknown verdict is treated as non-approving (fail-closed)', () => {
  assert.deepStrictEqual(deriveEffectiveReview({ verdict: 'some-future-verdict' }, filt([f('sql')], [])),
    { actionable: true, scopeExcluded: false });
});

test('oracle: missing filter result → actionable, not scope-excluded', () => {
  assert.deepStrictEqual(deriveEffectiveReview({ verdict: 'needs-attention' }, null),
    { actionable: true, scopeExcluded: false });
});
