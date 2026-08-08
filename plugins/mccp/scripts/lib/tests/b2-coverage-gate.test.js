'use strict';

// multi-session-work-loop M3 — B2 coverage gate 회귀.
//
// 이 gate의 존재 이유는 B2 flip이 **반증 가능**해야 한다는 것이다. 그러므로 가장
// 중요한 test는 "통과한다"가 아니라 **"우회하면 통과하지 못한다"**이다:
//   부정 fixture (i) 이벤트 없는 우회 write
//   부정 fixture (ii) 위조 이벤트를 동반한 우회 write   ← santa R1 I4
//   Implement-Codex R1 F4  런타임 관측 없이는 ok를 반환하지 않음

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const gate = require('../msw-metrics/b2-coverage-gate');

const TARGET = '.claude/receipts/mccp-plan-codex/demo.json';
const T0 = Date.parse('2026-01-01T00:00:00.000Z');

function snap(hash, mtime, size) {
  return { [TARGET]: { receipt_hash: hash, mtime: mtime || 1000, size: size || 100 } };
}

function guardEvent(pre, post, tsMs) {
  return {
    kind: 'evidence_guard_active',
    target: TARGET,
    pre_hash: pre,
    post_hash: post,
    ts: new Date(tsMs === undefined ? T0 : tsMs).toISOString(),
    event_id: 'evt-' + Math.random(),
  };
}

const WINDOW = { windowStart: T0 - 1000, windowEnd: T0 + 1000 };

test('Implement-Codex F4: no runtime observation → gate is INDETERMINATE, never ok', () => {
  const repo = process.cwd();
  const r = gate.evaluateGate({ repoRoot: repo });
  assert.equal(r.ok, false, 'static axes alone must never establish coverage');
  const reasons = r.failures.map((f) => f.reason);
  assert.ok(reasons.includes('runtime-observation-not-supplied'),
    'the missing PRIMARY axis must be named explicitly, got ' + JSON.stringify(reasons));
  assert.equal(r.axes.runtime.supplied, false);
});

test('a mutation with a matching guard event is covered', () => {
  const r = gate.correlateMutations(
    snap('sha256:a'), snap('sha256:b', 2000),
    [guardEvent('sha256:a', 'sha256:b')], WINDOW);
  assert.equal(r.ok, true);
  assert.equal(r.hash_changes, 1);
  assert.equal(r.covered, 1);
  assert.deepEqual(r.uncovered, []);
});

test('negative fixture (i): bypass write with NO guard event is detected', () => {
  const r = gate.correlateMutations(
    snap('sha256:a'), snap('sha256:b', 2000), [], WINDOW);
  assert.equal(r.ok, false, 'an unguarded mutation must fail the gate');
  assert.equal(r.uncovered.length, 1);
  assert.equal(r.uncovered[0].target, TARGET);
});

test('negative fixture (ii): a FORGED guard event cannot self-certify (santa I4)', () => {
  // The bypass writer emits an event whose post_hash matches the observed final
  // state but whose pre_hash does not match the observed prior state. Requiring
  // BOTH ends is what makes after-the-fact fabrication insufficient.
  const r = gate.correlateMutations(
    snap('sha256:a'), snap('sha256:b', 2000),
    [guardEvent('sha256:WRONG', 'sha256:b')], WINDOW);
  assert.equal(r.ok, false, 'post-hash-only forgery must not pass');
  assert.equal(r.uncovered.length, 1);
});

test('an event for a DIFFERENT target does not cover this mutation', () => {
  const ev = guardEvent('sha256:a', 'sha256:b');
  ev.target = '.claude/receipts/mccp-pr-codex/other.json';
  const r = gate.correlateMutations(snap('sha256:a'), snap('sha256:b', 2000), [ev], WINDOW);
  assert.equal(r.ok, false);
});

test('events outside the observation window (±30s) do not count', () => {
  const stale = guardEvent('sha256:a', 'sha256:b', T0 - 10 * 60 * 1000);
  const r = gate.correlateMutations(snap('sha256:a'), snap('sha256:b', 2000), [stale], WINDOW);
  assert.equal(r.ok, false, 'a long-past event must not certify a fresh mutation');

  const withinTolerance = guardEvent('sha256:a', 'sha256:b', T0 + 1000 + 20 * 1000);
  const r2 = gate.correlateMutations(snap('sha256:a'), snap('sha256:b', 2000), [withinTolerance], WINDOW);
  assert.equal(r2.ok, true, '±30s clock tolerance is honored');
});

test('carved-only mutation is classified separately, not counted as a hash change', () => {
  // briefing_* / ledger_write_skipped are canonicalized OUT of receipt_hash, so a
  // stamp changes bytes and mtime but not the seal. That is metadata loss, not
  // evidence loss (§6.4), so it must not enter hash-change coverage.
  const before = snap('sha256:same', 1000, 100);
  const after = snap('sha256:same', 2000, 140);
  const r = gate.correlateMutations(before, after, [], WINDOW);
  assert.equal(r.hash_changes, 0, 'no seal changed');
  assert.equal(r.carved_only, 1, 'but the mtime axis still SEES it');
  assert.equal(r.ok, true, 'carved-only churn does not fail the gate');
});

test('a brand-new receipt (absent → present) is a hash change and needs an event', () => {
  const r = gate.correlateMutations({}, snap('sha256:new', 2000), [], WINDOW);
  assert.equal(r.hash_changes, 1);
  assert.equal(r.ok, false, 'creation is a mutation too');

  const r2 = gate.correlateMutations({}, snap('sha256:new', 2000),
    [guardEvent(null, 'sha256:new')], WINDOW);
  assert.equal(r2.ok, true, 'pre_hash null matches "no prior receipt"');
});

test('static lint passes on the real repo (approved writers only)', () => {
  const r = gate.staticLint(process.cwd());
  assert.equal(r.ok, true,
    'unapproved receipt writers found: ' + JSON.stringify(r.violations, null, 2));
});

test('static lint FAILS when an unapproved writer is introduced', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-lint-'));
  const dir = path.join(repo, 'plugins', 'mccp', 'scripts', 'lib');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'rogue.js'),
    "fs.writeFileSync(path.join(root, '.claude/receipts/x/y.json'), body);\n", 'utf8');
  const r = gate.staticLint(repo);
  assert.equal(r.ok, false, 'a new direct receipt writer must be caught');
  assert.equal(r.violations[0].file, 'plugins/mccp/scripts/lib/rogue.js');
});

// 회귀 고정: lint가 "실제로 존재했던" writer 형태를 잡는지.
//
// 이전 판본의 정규식은 리터럴 `receipts`(복수)만 봤고, 위 test는 하필 그 형태
// 하나로만 검증해서 **통과했다**. 그래서 lint는 저장소 전체에서 위반 0을
// 보고하면서도 이 milestone이 방금 제거한 두 writer를 못 잡는 상태였다.
// 아래 fixture는 전부 이 저장소에 실재했던 코드에서 그대로 가져온 것이다 —
// 하나라도 통과하면 guardrail이 다시 비어 있다는 뜻이다.
const HISTORICAL_WRITER_SHAPES = [
  { name: 'briefing stamper (pre-M3)', src: "  fs.writeFileSync(receiptPath, json, 'utf8');\n" },
  { name: 'store.writeReceipt (pre-M3)', src: "  fs.writeFileSync(p, JSON.stringify(receipt, null, 2) + '\\n', 'utf8');\n" },
  { name: 'ledger skip stamper (pre-M3)', src: "  fs.writeFileSync(receiptPath, JSON.stringify(fresh, null, 2) + '\\n', 'utf8');\n" },
  {
    name: 'path via store helper, no token on the write line',
    src: "const p = receiptPath(repoRoot, gateId, decisionId);\nfs.writeFileSync(p, body, 'utf8');\n",
  },
];

test('static lint catches every writer shape that actually existed here', () => {
  for (const shape of HISTORICAL_WRITER_SHAPES) {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-lint-shape-'));
    const dir = path.join(repo, 'plugins', 'mccp', 'scripts', 'lib');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'rogue.js'), shape.src, 'utf8');
    const r = gate.staticLint(repo);
    assert.equal(r.ok, false, 'MISSED writer shape: ' + shape.name + ' — ' + shape.src.trim());
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('static lint does not fire on non-receipt writes in the same tree', () => {
  // The guardrail must stay usable: a file that writes something else entirely
  // (PR body staging, cache artifacts) is not a receipt writer.
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-lint-fp-'));
  const dir = path.join(repo, 'plugins', 'mccp', 'scripts', 'lib');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'innocent.js'),
    "fs.writeFileSync(staging, String(content == null ? '' : content), 'utf8');\n"
    + "fs.writeFileSync(path.join(repoRoot, '.claude/cache/STATUS.md'), md, 'utf8');\n", 'utf8');
  const r = gate.staticLint(repo);
  assert.equal(r.ok, true, 'false positives: ' + JSON.stringify(r.violations, null, 2));
  fs.rmSync(repo, { recursive: true, force: true });
});

test('the auditor exempts itself, and that exemption stays honest', () => {
  // The gate file holds the detection patterns as DATA, so it matches itself and
  // has to be exempt. An exemption is only acceptable while the claim behind it
  // holds: this file must never write to a receipt path. Pin that directly
  // rather than trusting the comment.
  const src = fs.readFileSync(path.join(process.cwd(), gate.SELF_EXEMPT), 'utf8');
  const writeTargets = src.split(/\r?\n/)
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .filter((l) => /(writeFileSync|appendFileSync|createWriteStream)\s*\(/.test(l));
  assert.ok(writeTargets.length > 0, 'the file does write something; if not, drop the exemption');
  for (const l of writeTargets) {
    assert.ok(!/receipts/.test(l),
      'the exempt auditor must not write into .claude/receipts: ' + l.trim());
  }
  assert.ok(src.includes("'.claude', 'cache', 'b2-coverage-gate.json'"),
    'its only artifact target is the cache verdict file');
});

test('static lint ignores tests and sanctioned migrations', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-lint2-'));
  const testsDir = path.join(repo, 'plugins', 'mccp', 'scripts', 'lib', 'tests');
  const migDir = path.join(repo, 'plugins', 'mccp', 'scripts', 'migrations');
  fs.mkdirSync(testsDir, { recursive: true });
  fs.mkdirSync(migDir, { recursive: true });
  const line = "fs.writeFileSync('.claude/receipts/a/b.json', x);\n";
  fs.writeFileSync(path.join(testsDir, 'fixture.js'), line, 'utf8');
  fs.writeFileSync(path.join(migDir, 'v9.9.9-thing.js'), line, 'utf8');
  assert.equal(gate.staticLint(repo).ok, true);
});

test('entrypoint registry passes on the real repo', () => {
  const r = gate.entrypointRegistry(process.cwd());
  assert.equal(r.ok, true, 'missing entrypoints: ' + JSON.stringify(r.missing));
});

test('entrypoint registry FAILS when a declared entrypoint disappears', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-reg-'));
  const r = gate.entrypointRegistry(repo);
  assert.equal(r.ok, false);
  assert.equal(r.missing.length, gate.MUTATION_ENTRYPOINTS.length);
});

test('gate artifact round-trips and is what derive consumes', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-art-'));
  assert.equal(gate.readGateArtifact(repo), null, 'absent artifact reads as null (fail-closed)');
  gate.writeGateArtifact(repo, { ok: true, failures: [], axes: {} });
  const back = gate.readGateArtifact(repo);
  assert.equal(back.ok, true);
  assert.ok(back.generated_at, 'the artifact records when it was produced');
});

test('full gate: supplied runtime observation with an uncovered write stays NOT ok', () => {
  const r = gate.evaluateGate({
    repoRoot: process.cwd(),
    runtimeObservation: Object.assign({
      before: snap('sha256:a'),
      after: snap('sha256:b', 2000),
    }, WINDOW),
    events: [],
  });
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => f.reason === 'uncovered-mutation'));
});

test('full gate: covered observation on the real repo passes every axis', () => {
  const r = gate.evaluateGate({
    repoRoot: process.cwd(),
    runtimeObservation: Object.assign({
      before: snap('sha256:a'),
      after: snap('sha256:b', 2000),
    }, WINDOW),
    events: [guardEvent('sha256:a', 'sha256:b')],
  });
  assert.equal(r.ok, true, 'failures: ' + JSON.stringify(r.failures, null, 2));
  assert.equal(r.axes.runtime.covered, 1);
});
