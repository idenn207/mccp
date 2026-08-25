'use strict';

// plan-review/l3 — the record oracle and the dedicated subcommand around it.
//
// Two halves, tested differently for a reason. buildL3Record is pure, so it is
// walked ROW BY ROW over the codex-invoke classification table: every row of that
// table is a way for Codex not to have spoken, and the milestone's claim is that
// each of them lands on `invoked:false` rather than on a fabricated verdict (DD4).
//
// The subcommand half is exercised through the real CLI process with the
// codex-invoke module SUBSTITUTED (`--invoke-module`). No network, no codex
// installation, and — the point — the substitution proves the seam is a test seam
// and not a policy seam: whatever the double returns is still put through the same
// enum check, so a double cannot approve anything the real wrapper could not.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const l3 = require('../plan-review/l3');
const { REVIEW_VERDICT_VALUES } = require('../review-verdict');

const CLI = path.join(__dirname, '..', 'plan-review', 'cli.js');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

// The review dir must be INSIDE the repository — containment is the thing under
// test, so the fixture cannot sit in the OS temp dir. `.claude/cache/` is
// gitignored, which keeps a crashed run from offering test scratch as a commit.
function mkFixtureDir() {
  const dir = path.join(REPO_ROOT, '.claude', 'cache',
    'l3-test-' + process.pid + '-' + crypto.randomBytes(4).toString('hex'));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function rmFixtureDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* best effort */ }
}

// A stand-in for scripts/lib/codex-invoke that returns a fixed envelope.
function writeInvokeDouble(dir, envelope) {
  const file = path.join(dir, 'invoke-double.js');
  fs.writeFileSync(file,
    'module.exports = { invokeAdversarialReview: function () { return ' +
    JSON.stringify(envelope) + '; } };\n');
  return file;
}

// `--invoke-module` is gated behind MCCP_PLAN_REVIEW_TEST_INVOKE=1 because it can
// mint verdict=converged without Codex (see the CLI's comment, and the two tests
// at the bottom of this file that pin both halves of that). The suite is the thing
// the gate exists to let through, so it sets the variable here, in ONE place.
function runL3(dir, envelope, extra, env) {
  const doubleFile = writeInvokeDouble(dir, envelope);
  const args = [CLI, 'l3',
    '--review-dir', dir,
    '--plan', path.join('plugins', 'mccp', 'commands', 'plan.md'),
    '--focus', 'test focus',
    '--run-nonce', 'nonce-abc-123',
    '--invoke-module', doubleFile];
  const r = spawnSync(process.execPath, args.concat(extra || []),
    { cwd: REPO_ROOT,
      encoding: 'utf8',
      env: Object.assign({}, process.env, { MCCP_PLAN_REVIEW_TEST_INVOKE: '1' }, env || {}) });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function envelopeWithVerdict(v) {
  return {
    ok: true, stdout: JSON.stringify({ result: { verdict: v } }), stderr: '',
    classification: 'ok', blocking: false, advisory: false,
  };
}

// ── the oracle ───────────────────────────────────────────────────────────────

// Every row of codex-invoke.js's classification enum that is NOT `ok`. Each one
// means Codex did not deliver a review, so each one must fold the same way.
const NON_OK_CLASSIFICATIONS = [
  'disabled', 'registry-missing', 'registry-malformed', 'plugin-not-installed',
  'install-path-stale', 'companion-not-found', 'companion-version-mismatch',
  'not-authenticated', 'timeout', 'exit-nonzero', 'stdout-empty',
  'spawn-enoent', 'parse-error',
];

for (const cls of NON_OK_CLASSIFICATIONS) {
  test('oracle: classification=' + cls + ' folds to invoked:false with no verdict key', () => {
    const rec = l3.buildL3Record({
      classification: cls, exitCode: 1, blocking: true, runNonce: 'n1',
    });
    assert.equal(rec.invoked, false);
    assert.ok(!('verdict' in rec),
      'a non-answer must not carry a verdict key at all — `unavailable` there would ' +
      'claim Codex answered and said so (DD4)');
    assert.match(rec.reason, new RegExp(cls.replace(/[-]/g, '[-]')),
      'the reason must name the classification, otherwise the receipt records ' +
      'that L3 did not run without recording why');
    assert.equal(rec.run_nonce, 'n1');
  });
}

test('oracle: disabled gets a reason an operator can act on', () => {
  const rec = l3.buildL3Record({
    classification: 'disabled', exitCode: 0, blocking: false, runNonce: 'n1',
  });
  assert.match(rec.reason, /MCCP_CODEX_DISABLED/,
    'disabled is a policy decision, not a failure; the reason must say so rather ' +
    'than leaving the operator to decode a classification token');
});

test('oracle: approve → converged, needs-attention → divergent', () => {
  const yes = l3.buildL3Record({
    classification: 'ok', exitCode: 0, blocking: false, runNonce: 'n1',
    envelope: envelopeWithVerdict('approve'),
  });
  assert.deepEqual(
    { invoked: yes.invoked, verdict: yes.verdict },
    { invoked: true, verdict: 'converged' });

  const no = l3.buildL3Record({
    classification: 'ok', exitCode: 0, blocking: false, runNonce: 'n1',
    envelope: envelopeWithVerdict('needs-attention'),
  });
  assert.deepEqual(
    { invoked: no.invoked, verdict: no.verdict },
    { invoked: true, verdict: 'divergent' });
});

test('oracle: classification ok but blocking/exit still folds', () => {
  // Any one of the three conditions alone has a hole. `ok` + blocking is the
  // advisory-mode fallback: the wrapper reports a classification it could read
  // while telling the caller not to trust it.
  const blocked = l3.buildL3Record({
    classification: 'ok', exitCode: 0, blocking: true, runNonce: 'n1',
    envelope: envelopeWithVerdict('approve'),
  });
  assert.equal(blocked.invoked, false, 'blocking=true must not yield an approval');
  assert.match(blocked.reason, /blocking=true/);

  const exited = l3.buildL3Record({
    classification: 'ok', exitCode: 3, blocking: false, runNonce: 'n1',
    envelope: envelopeWithVerdict('approve'),
  });
  assert.equal(exited.invoked, false, 'a non-zero exit beside ok is a wrapper defect');
});

test('oracle: free text can never manufacture converged', () => {
  // The exact string that produced a false `converged` from codex-bridge's
  // keyword scan in v1.22.3 M3 — prose warning AGAINST stamping converged.
  const rec = l3.buildL3Record({
    classification: 'ok', exitCode: 0, blocking: false, runNonce: 'n1',
    envelope: { stdout: 'MALFORMED', classification: 'ok' },
    freeText: 'the reviewer notes we converged on the approach',
  });
  assert.notEqual(rec.verdict, 'converged');
  assert.equal(rec.invoked, false);
  assert.match(rec.reason, /unreadable/,
    'an unreadable payload is Codex-did-not-speak, not Codex-said-unavailable');
});

test('oracle: a verdict outside REVIEW_VERDICT_VALUES folds instead of sealing', () => {
  // The enum is the vocabulary review_proof.layers.l3 is validated against. A
  // value outside it would reach a receipt whose own schema rejects it, surfacing
  // at write time as an opaque error rather than here as a named one.
  const rec = l3.buildL3Record({
    classification: 'ok', exitCode: 0, blocking: false, runNonce: 'n1',
    deriveVerdict: function () { return { verdict: 'looks-fine', source: 'structured' }; },
  });
  assert.equal(rec.invoked, false);
  assert.ok(!('verdict' in rec));
  assert.match(rec.reason, /not a member/);
});

test('oracle: an empty verdict — the printf hazard — cannot be constructed', () => {
  // The shell version emitted `"verdict":""` whenever its variable was empty,
  // which is exactly what a variable is after a fenced-block boundary.
  const rec = l3.buildL3Record({
    classification: 'ok', exitCode: 0, blocking: false, runNonce: 'n1',
    deriveVerdict: function () { return { verdict: '', source: 'structured' }; },
  });
  assert.equal(rec.invoked, false);
  assert.ok(!('verdict' in rec));
});

test('oracle: every emitted verdict is a member of the sealed vocabulary', () => {
  for (const v of ['approve', 'needs-attention', 'anything-else']) {
    const rec = l3.buildL3Record({
      classification: 'ok', exitCode: 0, blocking: false, runNonce: 'n1',
      envelope: envelopeWithVerdict(v),
    });
    if (rec.invoked) {
      assert.ok(REVIEW_VERDICT_VALUES.indexOf(rec.verdict) !== -1,
        'emitted ' + JSON.stringify(rec.verdict) + ', which the schema forbids');
    }
  }
});

test('oracle: run_nonce round-trips, and a missing one is null not undefined', () => {
  assert.equal(l3.buildL3Record({ classification: 'ok', exitCode: 0, blocking: false,
    runNonce: 'abc-123', envelope: envelopeWithVerdict('approve') }).run_nonce, 'abc-123');
  assert.equal(l3.buildL3Record({ classification: 'disabled' }).run_nonce, null,
    'null serialises into the record; undefined would vanish from the JSON and the ' +
    'poll could not tell a nonce-less record from a nonce-mismatched one');
});

test('oracle: bridge artifacts never disagree with the record', () => {
  const spoke = l3.buildL3Record({ classification: 'ok', exitCode: 0, blocking: false,
    runNonce: 'n1', envelope: envelopeWithVerdict('approve') });
  assert.equal(l3.bridgeArtifacts(spoke)['codex-verdict'], 'converged');

  const silent = l3.buildL3Record({ classification: 'timeout', exitCode: 1, blocking: true,
    runNonce: 'n1' });
  assert.equal(l3.bridgeArtifacts(silent)['codex-verdict'], '',
    'an empty bridge artifact is what makes 5.6b omit --codex-verdict; a placeholder ' +
    'token there would be forwarded as a real verdict');
  assert.ok(l3.bridgeArtifacts(silent)['codex-class'].length > 0);
});

// ── the findings body ────────────────────────────────────────────────────────
//
// Found by the M3 live run, not by review: the first real hybrid call came back
// `divergent` and there was no artifact anywhere carrying WHAT Codex objected to.
// The verdict record holds a verdict and a reason, `record.js#readL3` reads those
// two, and 5.2h therefore printed one word. The findings were parsed and dropped.

test('findings: a real review body survives beside the verdict', () => {
  const envelope = {
    ok: true, classification: 'ok', blocking: false,
    stdout: JSON.stringify({
      rounds: 2,
      result: {
        verdict: 'needs-attention',
        summary: 'two problems',
        findings: [{ severity: 'HIGH', title: 'a' }, { severity: 'LOW', title: 'b' }],
      },
    }),
  };
  const rec = l3.buildL3Record({ classification: 'ok', exitCode: 0, blocking: false,
    runNonce: 'n1', envelope: envelope });
  const body = l3.buildFindingsRecord({ record: rec, envelope: envelope });

  assert.equal(body.invoked, true);
  assert.equal(body.verdict, 'divergent', 'the gate verdict travels with the body');
  assert.equal(body.raw_verdict, 'needs-attention',
    'what the model literally said is kept too — the gate mapping is lossy by design');
  assert.equal(body.findings.length, 2);
  assert.equal(body.summary, 'two problems');
  assert.equal(body.rounds, 2);
});

test('findings: a silent run says so instead of reporting zero findings', () => {
  // An empty `findings: []` beside invoked:false would read as "Codex looked and
  // found nothing", which is the opposite of what happened.
  const rec = l3.buildL3Record({ classification: 'timeout', exitCode: 1,
    blocking: true, runNonce: 'n1' });
  const body = l3.buildFindingsRecord({ record: rec, envelope: {} });
  assert.equal(body.invoked, false);
  assert.ok(!('findings' in body), 'no findings array on a run that never spoke');
  assert.match(body.reason, /timeout/);
});

test('findings: an unparseable body is reported, not emptied', () => {
  const body = l3.buildFindingsRecord({
    record: { invoked: true, verdict: 'converged' },
    envelope: { stdout: 'MALFORMED' },
  });
  assert.equal(body.parsed, false);
  assert.ok(!Array.isArray(body.findings));
});

// ── the subcommand ───────────────────────────────────────────────────────────

test('cli: no arguments is CLI misuse (exit 2), not a block', () => {
  const r = spawnSync(process.execPath, [CLI, 'l3'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /l3 requires --review-dir/);
});

test('cli: writes all four artifacts, l3.json last', () => {
  const dir = mkFixtureDir();
  try {
    const r = runL3(dir, envelopeWithVerdict('approve'));
    assert.equal(r.status, 0, r.stderr);

    for (const name of l3.L3_ARTIFACTS) {
      assert.ok(fs.existsSync(path.join(dir, name)), name + ' was not written');
    }
    const rec = JSON.parse(fs.readFileSync(path.join(dir, 'l3.json'), 'utf8'));
    assert.deepEqual(
      { invoked: rec.invoked, verdict: rec.verdict, run_nonce: rec.run_nonce },
      { invoked: true, verdict: 'converged', run_nonce: 'nonce-abc-123' });
    assert.equal(fs.readFileSync(path.join(dir, 'codex-verdict'), 'utf8'), 'converged');

    // The ORDER is the contract, and mtime is the only observable of it here.
    // l3.json last is what lets 5.2f poll for one file and conclude all three
    // landed (ARTIFACT_ORDER_RATIONALE).
    const mtime = (f) => fs.statSync(path.join(dir, f)).mtimeMs;
    for (const peer of ['codex-verdict', 'codex-class', 'l3-findings.json']) {
      assert.ok(mtime('l3.json') >= mtime(peer),
        'l3.json must not predate ' + peer);
    }

    // The body is on disk, not just in the process that produced it.
    const body = JSON.parse(fs.readFileSync(path.join(dir, 'l3-findings.json'), 'utf8'));
    assert.equal(body.invoked, true);
    assert.equal(body.raw_verdict, 'approve');
  } finally {
    rmFixtureDir(dir);
  }
});

test('cli: a bridge-artifact failure blocks and leaves no l3.json behind', () => {
  // This is the ordering guarantee stated as a failure, which is the only way to
  // observe it: three tmp+renames are three atomic operations, not one, so the
  // property that has to hold is that a partial write can never look complete.
  // A directory at codex-class makes its rename fail.
  const dir = mkFixtureDir();
  try {
    fs.mkdirSync(path.join(dir, 'codex-class'));
    const r = runL3(dir, envelopeWithVerdict('approve'));
    assert.equal(r.status, 12, 'an unwritable artifact must BLOCK: `decide` would ' +
      'otherwise report "L3 did not run" when L3 ran and could not be recorded');
    assert.ok(!fs.existsSync(path.join(dir, 'l3.json')),
      'l3.json must not exist when a bridge artifact failed — its presence is what ' +
      'the poll treats as proof the other two landed');
    assert.match(r.stderr, /L3 artifacts must land/);

    const strays = fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));
    assert.deepEqual(strays, [],
      'a failed rename must not leave its temp file; the Phase 5.2 purge is a ' +
      'filename list, not a glob, so orphans accumulate forever');
  } finally {
    rmFixtureDir(dir);
  }
});

test('cli: invoked:false is exit 0 — declining to speak is not an error', () => {
  const dir = mkFixtureDir();
  try {
    const r = runL3(dir, {
      ok: false, stdout: '', stderr: 'nope', classification: 'not-authenticated',
      blocking: true, advisory: false,
    });
    assert.equal(r.status, 0,
      'blocking authority belongs to `decide` alone (DD2); this subcommand reports');
    const rec = JSON.parse(fs.readFileSync(path.join(dir, 'l3.json'), 'utf8'));
    assert.equal(rec.invoked, false);
    assert.match(rec.reason, /not-authenticated/);
  } finally {
    rmFixtureDir(dir);
  }
});

test('cli: a review-dir outside the repository is refused', () => {
  const outside = path.join(path.parse(REPO_ROOT).root, 'l3-escape-' + process.pid);
  const r = spawnSync(process.execPath, [CLI, 'l3',
    '--review-dir', outside,
    '--plan', path.join('plugins', 'mccp', 'commands', 'plan.md'),
    '--focus', 'x', '--run-nonce', 'n1'],
  { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(r.status, 12);
  assert.match(r.stderr, /outside the repository/);
  assert.ok(!fs.existsSync(outside), 'the refused directory must not be created');
});

test('cli: a malformed run-nonce is refused before Codex is called', () => {
  const dir = mkFixtureDir();
  try {
    const r = runL3(dir, envelopeWithVerdict('approve'), ['--run-nonce', 'a b;c']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--run-nonce must match/);
    assert.ok(!fs.existsSync(path.join(dir, 'l3.json')));
  } finally {
    rmFixtureDir(dir);
  }
});

test('cli: a missing plan is refused before spending a Codex call', () => {
  const dir = mkFixtureDir();
  try {
    const r = runL3(dir, envelopeWithVerdict('approve'),
      ['--plan', path.join('.claude', 'cache', 'no-such-plan-' + process.pid + '.md')]);
    assert.equal(r.status, 12);
    assert.match(r.stderr, /plan does not exist/);
  } finally {
    rmFixtureDir(dir);
  }
});

test('cli: artifacts are owner-only', { skip: process.platform === 'win32'
  ? 'POSIX mode bits are not reproduced on Windows' : false }, () => {
  // Security review F3. The 0o600 is inherited from writePrivate's `mode`, which
  // is easy to drop in a refactor and invisible until something reads the review
  // dir. Skipped rather than weakened on Windows: asserting a mode the platform
  // does not implement would pin a false fact.
  const dir = mkFixtureDir();
  try {
    assert.equal(runL3(dir, envelopeWithVerdict('approve')).status, 0);
    for (const name of l3.L3_ARTIFACTS) {
      const mode = fs.statSync(path.join(dir, name)).mode & 0o777;
      assert.equal(mode, 0o600, name + ' is mode ' + mode.toString(8) + ', not 600');
    }
  } finally {
    rmFixtureDir(dir);
  }
});

test('cli: the injected module constrains VOCABULARY only, never provenance', () => {
  // This test used to be named "the injected module cannot approve what the real
  // one could not" and only ever fed it an out-of-enum verdict — so it proved the
  // enum check and was read as proving something much larger. Both halves are
  // asserted here now, because the second half is the reason the seam is gated.
  const dir = mkFixtureDir();
  try {
    const outOfEnum = runL3(dir, {
      ok: true, stdout: JSON.stringify({ result: { verdict: 'TOTALLY-APPROVED' } }),
      stderr: '', classification: 'ok', blocking: false, advisory: false,
    });
    assert.equal(outOfEnum.status, 0);
    const rec = JSON.parse(fs.readFileSync(path.join(dir, 'l3.json'), 'utf8'));
    // 'TOTALLY-APPROVED' is not `approve`, so verdictToGate maps it to divergent —
    // in-vocabulary and NON-approving. That is the whole of what the enum buys.
    assert.notEqual(rec.verdict, 'converged');
    assert.ok(rec.verdict === undefined || REVIEW_VERDICT_VALUES.indexOf(rec.verdict) !== -1);
  } finally {
    rmFixtureDir(dir);
  }

  // …and the half the old name denied: a well-formed double DOES mint a real
  // approval, byte-identical to one Codex uttered. Nothing downstream can tell.
  // Pinning it means a future reader cannot re-derive the comfortable belief.
  const dir2 = mkFixtureDir();
  try {
    assert.equal(runL3(dir2, envelopeWithVerdict('approve')).status, 0);
    const rec = JSON.parse(fs.readFileSync(path.join(dir2, 'l3.json'), 'utf8'));
    assert.equal(rec.verdict, 'converged',
      'the seam mints a cross-model approval — this is why it needs a gate, not a comment');
    assert.match(rec.reason, /verdict-source=structured/,
      'and it is indistinguishable from a genuine structured Codex approval');
  } finally {
    rmFixtureDir(dir2);
  }
});

test('cli: --invoke-module is refused without MCCP_PLAN_REVIEW_TEST_INVOKE=1', () => {
  // The gate itself. Without it the flag sits on the production gate binary and
  // mints `converged` for anyone who passes a path — see the test above for what
  // that buys. `''` rather than delete, because the helper merges over process.env
  // and the CLI compares against the exact string '1'.
  const dir = mkFixtureDir();
  try {
    const r = runL3(dir, envelopeWithVerdict('approve'), [],
      { MCCP_PLAN_REVIEW_TEST_INVOKE: '' });
    assert.equal(r.status, 12, 'an ungated injection is a BLOCK');
    assert.match(r.stderr, /MCCP_PLAN_REVIEW_TEST_INVOKE=1/);
    assert.ok(!fs.existsSync(path.join(dir, 'l3.json')),
      'a refused injection must not leave a record behind');
  } finally {
    rmFixtureDir(dir);
  }
});
