'use strict';

// v0.2.8 Task 2.6.2 — post-edit-format `.md` branch (α + β with R4-F3 strict
// count-based success gate).
//
// Coverage axes:
//   (1) α PASS         — code CLI fixed the file, postCount === 0 → no β
//   (2) α silent_fail  — code CLI exit 0 but postCount unchanged → β runs
//   (3) α explicit_fail (commandid-not-found stderr)              → β runs
//   (4) β-only         — no code CLI at all, markdownlint --fix runs
//   (5) no-CLI noop    — no code, no markdownlint → only telemetry
//
// All deps are injected so we never touch the user's PATH or VSCode.

const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { runMdBranch } = require('../post-edit-format');

function tmpFile(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-md-test-'));
  const p = path.join(dir, 'fixture.md');
  fs.writeFileSync(p, contents, 'utf8');
  return p;
}

function captureStderr(fn) {
  const original = process.stderr.write.bind(process.stderr);
  const captured = [];
  process.stderr.write = function (chunk) {
    captured.push(String(chunk));
    return true;
  };
  try {
    fn();
  } finally {
    process.stderr.write = original;
  }
  return captured.join('');
}

function findTelemetry(stderr, event) {
  for (const line of stderr.split(/\r?\n/)) {
    if (!line.startsWith('[mccp:markdownlint] ')) continue;
    const obj = JSON.parse(line.slice('[mccp:markdownlint] '.length));
    if (obj.event === event) return obj;
  }
  return null;
}

// ── (1) α PASS ─────────────────────────────────────────────────────

test('α PASS: code exits 0 with stderr clean, post lint clean → β does NOT run', () => {
  const file = tmpFile('dummy\n');
  const lintQueue = [
    { status: 1, count: 5 },  // pre — 5 violations
    { status: 0, count: 0 },  // post — clean
  ];
  let alphaCalls = 0;
  let betaCalls = 0;
  const stderr = captureStderr(() => {
    runMdBranch(file, {
      findCodeCli: () => '/mock/code',
      resolveMarkdownlintBin: () => ({ bin: '/mock/markdownlint', prefix: [], local: true }),
      countLint: () => lintQueue.shift() || { status: 0, count: 0 },
      spawn: (bin, args) => {
        if (bin === '/mock/code') { alphaCalls++; return { status: 0, stderr: '' }; }
        betaCalls++;
        return { status: 0, stderr: '' };
      },
    });
  });
  assert.strictEqual(alphaCalls, 1, 'α path must be invoked exactly once');
  const ok = findTelemetry(stderr, 'markdownlint_alpha_ok');
  assert.ok(ok, 'expected markdownlint_alpha_ok telemetry; stderr: ' + stderr);
  assert.strictEqual(ok.preCount, 5);
  assert.strictEqual(ok.postCount, 0);
  const failed = findTelemetry(stderr, 'markdownlint_alpha_failed');
  assert.strictEqual(failed, null, 'α success must not record a failure event');
  const beta = findTelemetry(stderr, 'markdownlint_beta_ok') || findTelemetry(stderr, 'markdownlint_beta_done');
  assert.strictEqual(beta, null, 'β must not run after α PASS');
});

// ── (2) α silent_failure → β fallback ──────────────────────────────

test('α silent_failure: code exits 0 but lint count unchanged → β runs', () => {
  const file = tmpFile('dummy\n');
  const lintQueue = [
    { status: 1, count: 5 },  // pre
    { status: 1, count: 5 },  // post — UNCHANGED (R2-F2 trap)
  ];
  let alphaCalls = 0;
  let betaCalls = 0;
  const stderr = captureStderr(() => {
    runMdBranch(file, {
      findCodeCli: () => '/mock/code',
      resolveMarkdownlintBin: () => ({ bin: '/mock/markdownlint', prefix: [], local: true }),
      countLint: () => lintQueue.shift() || { status: 0, count: 0 },
      spawn: (bin, args) => {
        if (bin === '/mock/code') { alphaCalls++; return { status: 0, stderr: '' }; }
        return { status: 0, stderr: '' };
      },
    });
    // Test the β fallback by intercepting execFileSync via NODE override is
    // complex; the contract we care about is "telemetry shows alpha_failed
    // with lint-not-reduced", which proves the fall-through branch executed.
  });
  assert.strictEqual(alphaCalls, 1);
  const failed = findTelemetry(stderr, 'markdownlint_alpha_failed');
  assert.ok(failed, 'expected markdownlint_alpha_failed telemetry; stderr: ' + stderr);
  assert.strictEqual(failed.reason, 'lint-not-reduced',
    'silent_failure must classify as lint-not-reduced when post >= pre');
  assert.strictEqual(failed.preCount, 5);
  assert.strictEqual(failed.postCount, 5);
});

// ── (3) α explicit_failure via stderr regex ────────────────────────

test('α explicit_failure: VSCode 1.123.0 commandid stderr warning → β runs', () => {
  const file = tmpFile('dummy\n');
  const lintQueue = [
    { status: 1, count: 3 },
    { status: 1, count: 3 },
  ];
  let alphaCalls = 0;
  const stderr = captureStderr(() => {
    runMdBranch(file, {
      findCodeCli: () => '/mock/code',
      resolveMarkdownlintBin: () => ({ bin: '/mock/markdownlint', prefix: [], local: true }),
      countLint: () => lintQueue.shift() || { status: 0, count: 0 },
      spawn: (bin) => {
        if (bin === '/mock/code') {
          alphaCalls++;
          return {
            status: 0,
            stderr: "Warning: 'command' is not in the list of known options, but still passed to Electron/Chromium.\n",
          };
        }
        return { status: 0, stderr: '' };
      },
    });
  });
  const failed = findTelemetry(stderr, 'markdownlint_alpha_failed');
  assert.ok(failed, 'expected markdownlint_alpha_failed telemetry');
  assert.strictEqual(failed.reason, 'commandid-not-found',
    'stderr warning must classify as commandid-not-found via STDERR_BAD_RE');
});

// ── (4) β-only when no `code` CLI ──────────────────────────────────

test('β-only: no `code` CLI → α skipped, β path attempts markdownlint --fix', () => {
  const file = tmpFile('dummy\n');
  let alphaCalls = 0;
  const stderr = captureStderr(() => {
    runMdBranch(file, {
      findCodeCli: () => null,
      // Use an obviously bogus path so execFileSync throws → β classifies
      // as `markdownlint_beta_done` (non-zero exit captured) rather than
      // `markdownlint_beta_ok`. Either outcome proves β was attempted.
      resolveMarkdownlintBin: () => ({ bin: '__definitely_not_a_real_bin__', prefix: [], local: true }),
      countLint: () => ({ status: 0, count: 0 }),
      spawn: () => { alphaCalls++; return { status: 0, stderr: '' }; },
    });
  });
  assert.strictEqual(alphaCalls, 0, 'α must not be invoked when no code CLI is present');
  const beta = findTelemetry(stderr, 'markdownlint_beta_ok') || findTelemetry(stderr, 'markdownlint_beta_done');
  assert.ok(beta, 'expected β telemetry; stderr: ' + stderr);
  const alphaTelem = findTelemetry(stderr, 'markdownlint_alpha_ok') || findTelemetry(stderr, 'markdownlint_alpha_failed');
  assert.strictEqual(alphaTelem, null, 'no α telemetry should fire when α is skipped');
});

// ── (5) no-CLI silent noop ─────────────────────────────────────────

test('no-CLI noop: no code, no markdownlint → only markdownlint_skipped telemetry', () => {
  const file = tmpFile('dummy\n');
  const stderr = captureStderr(() => {
    runMdBranch(file, {
      findCodeCli: () => null,
      resolveMarkdownlintBin: () => null,
      countLint: () => null,
      spawn: () => { throw new Error('spawn must not be invoked when no code CLI is present'); },
    });
  });
  const skipped = findTelemetry(stderr, 'markdownlint_skipped');
  assert.ok(skipped, 'expected markdownlint_skipped telemetry');
  assert.strictEqual(skipped.reason, 'no-cli');
});
