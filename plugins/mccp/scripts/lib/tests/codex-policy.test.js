'use strict';

// codex-policy — 봉인 오라클의 경계 test.
//
// 이 파일이 지키는 명제는 하나다: **한 게이트 실행 안에서 env 를 지워도 정책이 살아남는다.**
// 그것을 반증 가능하게 만드는 단언이 `resolveCodexDisabled: 봉인 후 env 를 0 으로 지워도
// true` 이고, 나머지는 그 명제가 잘못된 방향으로 새지 않는지를 가둔다 — 특히 봉인이
// **없는** 사용자의 Codex 가 조용히 꺼지지 않는다는 반대 방향.
//
// mirror: review-single-pass.test.js:1-40 (node:test + 캡처 헬퍼 관례)

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const policy = require('../codex-policy');
const {
  resolveGitDir, sealPolicy, readPolicy, resolveCodexDisabled, clearPolicy,
  sealPathFor, MAX_SEAL_AGE_MS, ENV_CODEX_DISABLED,
} = policy;

const CLI = path.join(__dirname, '..', 'codex-policy.js');

function tmpGitDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-codex-policy-'));
  fs.mkdirSync(path.join(d, 'mccp', 'tmp'), { recursive: true });
  return d;
}

// ── the constant is a contract, not a comment ────────────────────────────────

test('MAX_SEAL_AGE_MS is exported and is exactly six hours', () => {
  // plan-review R1 invariant HIGH: a bound stated only in prose has nothing to
  // verify. The value is derived from the longest a single gate execution can
  // run (codex timeout 900s, gate deadlines 1200-2400s), so a change to it is a
  // change to that claim and must be deliberate.
  assert.equal(typeof MAX_SEAL_AGE_MS, 'number');
  assert.equal(MAX_SEAL_AGE_MS, 6 * 60 * 60 * 1000);
});

// ── seal / read round trip ───────────────────────────────────────────────────

test('sealPolicy round-trips the env policy and readPolicy reports reason=ok', () => {
  const gitDir = tmpGitDir();
  const body = sealPolicy({ gitDir: gitDir, env: { [ENV_CODEX_DISABLED]: '1' } });
  assert.equal(body.codex_disabled, true);

  const r = readPolicy({ gitDir: gitDir });
  assert.equal(r.found, true);
  assert.equal(r.codexDisabled, true);
  assert.equal(r.reason, 'ok');
  assert.ok(r.ageMs >= 0);
});

test('sealPolicy records a FALSE policy just as faithfully as a true one', () => {
  // A seal that only ever records "disabled" would make "re-enable Codex and
  // re-run the gate" (DD4) impossible to express on disk.
  const gitDir = tmpGitDir();
  sealPolicy({ gitDir: gitDir, env: {} });
  const r = readPolicy({ gitDir: gitDir });
  assert.equal(r.found, true);
  assert.equal(r.codexDisabled, false);
});

test('sealPolicy overwrites a prior seal rather than appending beside it', () => {
  const gitDir = tmpGitDir();
  sealPolicy({ gitDir: gitDir, env: { [ENV_CODEX_DISABLED]: '1' } });
  sealPolicy({ gitDir: gitDir, env: {} });
  assert.equal(readPolicy({ gitDir: gitDir }).codexDisabled, false);
});

test('sealPolicy without a gitDir throws rather than writing somewhere arbitrary', () => {
  assert.throws(function () { sealPolicy({ env: {} }); }, /gitDir is required/);
});

// ── the three read failures are NOT the same failure ─────────────────────────

test('an absent seal reports reason=absent', () => {
  const r = readPolicy({ gitDir: tmpGitDir() });
  assert.equal(r.found, false);
  assert.equal(r.reason, 'absent');
  assert.equal(r.codexDisabled, null);
});

test('a seal older than MAX_SEAL_AGE_MS reports reason=expired', () => {
  const gitDir = tmpGitDir();
  sealPolicy({ gitDir: gitDir, env: { [ENV_CODEX_DISABLED]: '1' } });
  const r = readPolicy({ gitDir: gitDir, now: Date.now() + MAX_SEAL_AGE_MS + 1000 });
  assert.equal(r.found, false);
  assert.equal(r.reason, 'expired');
  // The recorded value survives for diagnosis even though it no longer decides.
  assert.equal(r.codexDisabled, true);
});

test('a seal exactly at the boundary is still valid — the bound is exclusive', () => {
  const gitDir = tmpGitDir();
  const now = Date.now();
  sealPolicy({ gitDir: gitDir, env: { [ENV_CODEX_DISABLED]: '1' }, now: now });
  assert.equal(readPolicy({ gitDir: gitDir, now: now + MAX_SEAL_AGE_MS }).reason, 'ok');
});

test('unparsable, wrong-shaped, and future-dated seals all report reason=unreadable', () => {
  const cases = [
    ['not json at all', '{ this is not json'],
    ['missing codex_disabled', JSON.stringify({ sealed_at: new Date().toISOString() })],
    ['non-boolean codex_disabled', JSON.stringify({ codex_disabled: 'yes', sealed_at: new Date().toISOString() })],
    ['unparsable sealed_at', JSON.stringify({ codex_disabled: true, sealed_at: 'whenever' })],
    // A future stamp means the age cannot be trusted, so it is an anomaly rather
    // than a fresh seal — folding it to `ok` would let a clock skew mint an
    // immortal seal.
    ['future sealed_at', JSON.stringify({ codex_disabled: true, sealed_at: new Date(Date.now() + 60000).toISOString() })],
  ];
  cases.forEach(function (c) {
    const gitDir = tmpGitDir();
    fs.writeFileSync(sealPathFor(gitDir), c[1]);
    const r = readPolicy({ gitDir: gitDir });
    assert.equal(r.found, false, c[0]);
    assert.equal(r.reason, 'unreadable', c[0]);
  });
});

// ── the decision: OR, with unreadable folding toward disabled ────────────────

test('resolveCodexDisabled: the four env x seal combinations', () => {
  const on = { [ENV_CODEX_DISABLED]: '1' };
  const off = {};

  const sealedTrue = tmpGitDir();
  sealPolicy({ gitDir: sealedTrue, env: on });
  const sealedFalse = tmpGitDir();
  sealPolicy({ gitDir: sealedFalse, env: off });

  assert.equal(resolveCodexDisabled({ gitDir: sealedTrue, env: on }), true);
  assert.equal(resolveCodexDisabled({ gitDir: sealedTrue, env: off }), true, 'seal must survive a cleared env');
  assert.equal(resolveCodexDisabled({ gitDir: sealedFalse, env: on }), true, 'env must still be able to turn it ON mid-run');
  assert.equal(resolveCodexDisabled({ gitDir: sealedFalse, env: off }), false);
});

test('THE REGRESSION: a sealed policy survives the env being cleared to "0"', () => {
  // This is the measured bug (2026-08-25): the gate honoured MCCP_CODEX_DISABLED
  // in R1, then the run decided the flag was a spent one-shot, set it to 0, and
  // called Codex for R2. If this assertion ever goes red, that window is back.
  const gitDir = tmpGitDir();
  sealPolicy({ gitDir: gitDir, env: { [ENV_CODEX_DISABLED]: '1' } });
  assert.equal(resolveCodexDisabled({ gitDir: gitDir, env: { [ENV_CODEX_DISABLED]: '0' } }), true);
});

test('an absent or expired seal falls back to env — NOT to disabled', () => {
  // The opposite direction matters more than it looks: most users never seal, so
  // a fail-closed default here would silently switch Codex off for all of them.
  const empty = tmpGitDir();
  assert.equal(resolveCodexDisabled({ gitDir: empty, env: {} }), false);
  assert.equal(resolveCodexDisabled({ gitDir: empty, env: { [ENV_CODEX_DISABLED]: '1' } }), true);

  const stale = tmpGitDir();
  sealPolicy({ gitDir: stale, env: { [ENV_CODEX_DISABLED]: '1' } });
  const later = Date.now() + MAX_SEAL_AGE_MS + 1000;
  assert.equal(resolveCodexDisabled({ gitDir: stale, env: {}, now: later }), false);
});

test('an UNREADABLE seal folds toward disabled — it is an anomaly, not an absence', () => {
  // plan-review R2 invariant HIGH. A seal that exists but cannot be read is not
  // the normal "never sealed" state; trusting env there reopens the window this
  // module exists to close. The cost direction is safe (one skipped review).
  const gitDir = tmpGitDir();
  fs.writeFileSync(sealPathFor(gitDir), '{ corrupt');
  assert.equal(resolveCodexDisabled({ gitDir: gitDir, env: {} }), true);
});

test('a null gitDir degrades to env alone without throwing', () => {
  assert.equal(resolveCodexDisabled({ gitDir: null, env: {} }), false);
  assert.equal(resolveCodexDisabled({ gitDir: null, env: { [ENV_CODEX_DISABLED]: '1' } }), true);
});

test('only the canonical activating literal counts — this is a bypass-flag', () => {
  // registry.js declares MCCP_CODEX_DISABLED as kind bypass-flag, whose accepting
  // set is exactly "1". Reading it with a looser comparison here would widen the
  // toggle's vocabulary in one module only.
  ['true', 'yes', 'on', '2', ''].forEach(function (v) {
    assert.equal(resolveCodexDisabled({ gitDir: null, env: { [ENV_CODEX_DISABLED]: v } }), false, v);
  });
});

// ── clear ────────────────────────────────────────────────────────────────────

test('clearPolicy removes the seal and is a no-op when there is none', () => {
  const gitDir = tmpGitDir();
  sealPolicy({ gitDir: gitDir, env: { [ENV_CODEX_DISABLED]: '1' } });
  assert.equal(clearPolicy({ gitDir: gitDir }), true);
  assert.equal(readPolicy({ gitDir: gitDir }).reason, 'absent');
  assert.equal(clearPolicy({ gitDir: gitDir }), false);
  assert.equal(clearPolicy({}), false);
});

// ── git-dir resolution: the worktree case is the one that breaks ─────────────

test('resolveGitDir reads the gitdir pointer out of a worktree .git FILE', () => {
  // In a linked worktree `.git` is a file containing `gitdir: <path>`. Treating
  // it as a directory puts the seal somewhere nothing will read it (CLAUDE.md 3.8).
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-wt-'));
  const realGitDir = path.join(root, 'real-git-dir');
  fs.mkdirSync(realGitDir, { recursive: true });
  const wt = path.join(root, 'worktree');
  fs.mkdirSync(path.join(wt, 'nested', 'deeper'), { recursive: true });
  fs.writeFileSync(path.join(wt, '.git'), 'gitdir: ' + realGitDir + '\n');

  assert.equal(resolveGitDir(path.join(wt, 'nested', 'deeper')), path.normalize(realGitDir));
});

test('resolveGitDir accepts a relative gitdir pointer', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-wt-rel-'));
  const wt = path.join(root, 'worktree');
  fs.mkdirSync(path.join(root, 'gd'), { recursive: true });
  fs.mkdirSync(wt, { recursive: true });
  fs.writeFileSync(path.join(wt, '.git'), 'gitdir: ../gd\n');
  assert.equal(resolveGitDir(wt), path.resolve(root, 'gd'));
});

test('resolveGitDir returns the .git DIRECTORY for an ordinary clone', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-clone-'));
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  assert.equal(resolveGitDir(path.join(root, 'src')), path.join(root, '.git'));
});

test('resolveGitDir returns null outside any repository instead of guessing', () => {
  // os.tmpdir() itself is not inside a repo on any supported platform. A guess
  // here would seal into a path no gate ever reads.
  const orphan = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-orphan-'));
  assert.equal(resolveGitDir(orphan), null);
});

// ── CLI: seal must never be the thing that stops a gate ──────────────────────

test('CLI seal exits 0 even when it cannot seal, and says so with a stable prefix', () => {
  // The failure mode this guards is a SILENT degradation: if seal died loudly with
  // a non-zero exit the gate would stop, and if it died quietly the operator would
  // believe a policy was protecting them when none was written.
  const orphan = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-cli-orphan-'));
  const res = spawnSync(process.execPath, [CLI, 'seal'], {
    cwd: orphan, encoding: 'utf8', env: Object.assign({}, process.env, { [ENV_CODEX_DISABLED]: '1' }),
  });
  assert.equal(res.status, 0);
  assert.match(res.stderr, /\[mccp:codex-policy\] SEAL FAILED:/);
});

test('CLI read emits parsable JSON and clear is idempotent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-cli-repo-'));
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  const run = function (sub, env) {
    return spawnSync(process.execPath, [CLI, sub], {
      cwd: root, encoding: 'utf8', env: Object.assign({}, process.env, env || {}),
    });
  };
  assert.equal(run('seal', { [ENV_CODEX_DISABLED]: '1' }).status, 0);
  const read = run('read');
  assert.equal(read.status, 0);
  const parsed = JSON.parse(read.stdout);
  assert.equal(parsed.found, true);
  assert.equal(parsed.codexDisabled, true);

  assert.equal(run('clear').status, 0);
  assert.equal(JSON.parse(run('read').stdout).reason, 'absent');
  assert.equal(run('clear').status, 0, 'clearing twice must not fail');
});

test('CLI rejects an unknown subcommand with usage rather than doing something', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-cli-bad-'));
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  const res = spawnSync(process.execPath, [CLI, 'enable'], {
    cwd: root, encoding: 'utf8',
  });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /usage: codex-policy\.js <seal\|read\|clear>/);
});

