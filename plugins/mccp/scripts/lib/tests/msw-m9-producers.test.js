'use strict';

// multi-session-work-loop M9 — producer wiring regression.
//
// Created by Task 2 and extended in place by Tasks 3 and 4 (see the plan's
// `## Tasks` banner). Each task's Validate runs only the assertions that exist
// at that point; the file is not created by Task 6, which builds the coverage
// gate and nothing else.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const registry = require('../../state/findings-registry');
const CLI = path.join(__dirname, '..', 'plan-review', 'cli.js');

const HEADER = [
  '# Codex findings backlog',
  '',
  '| Date | Severity | Source plan | Finding |',
  '|---|---|---|---|',
  '',
].join('\n');

const PLAN_HASH = 'sha256:' + 'a'.repeat(64);

// Windows tmp hands back 8.3 short names and the CLI judges containment by
// realpath, so the root must be normalised the same way the sibling suite does.
function makeRepo(opts) {
  const o = opts || {};
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-m9-')));
  fs.mkdirSync(path.join(root, '.claude', 'plans'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'state', 'plan-review'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'reviews'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'plans', 'codex-findings-backlog.md'),
    o.backlogBody === undefined ? HEADER : o.backlogBody, 'utf8');
  fs.writeFileSync(path.join(root, '.claude', 'plans', 'x.plan.md'), '# Plan\n', 'utf8');
  fs.writeFileSync(path.join(root, '.claude', 'state', 'plan-review', 'decision.json'),
    JSON.stringify(o.decision, null, 2), 'utf8');
  return root;
}

function decisionWith(blockingFindings) {
  return {
    review_verdict: 'divergent',
    review_source: 'multi-agent',
    single_pass_reason: 'deferred_to_prd_completion',
    review_proof: { reviewed_plan_hash: PLAN_HASH },
    quorum: { passed: false, blockingFindings: blockingFindings },
  };
}

// Open a finding through the real producer path so the id is derived exactly as
// `emitPanelFindings` derives it. Hand-writing the JSONL would let the test
// agree with a formula the shipping code does not use.
function openFinding(root, slug, f) {
  const r = registry.appendFindings(slug, [{
    kind: 'finding_opened',
    gate_id: 'mccp-plan-codex',
    perspective: f.perspective,
    severity: f.severity,
    claim: f.claim,
    claim_digest: registry.claimDigestOf(f.claim),
  }], { repoRoot: root });
  assert.ok(r.ok, 'fixture setup: finding_opened must append');
  return registry.deriveFindingId({
    work_unit: slug,
    gate_id: 'mccp-plan-codex',
    perspective: f.perspective,
    severity: f.severity,
    claim: f.claim,
  });
}

function runBacklogAppend(root, slug) {
  return spawnSync(process.execPath, [CLI, 'backlog-append',
    '--review-dir', path.join(root, '.claude', 'state', 'plan-review'),
    '--plan', path.join(root, '.claude', 'plans', 'x.plan.md'),
    '--slug', slug,
  ], { encoding: 'utf8', cwd: root });
}

function shardOf(root, slug) {
  return registry.readShard(slug, { repoRoot: root });
}

// ---- Task 2 - the panel path closes what it defers -------------------------

test('M9 Task 2: a backlogged finding is closed as deferred, and the closure rate does not move', () => {
  const slug = 'm9-close';
  const real = { perspective: 'security', severity: 'CRITICAL', claim: 'a real reviewer finding' };
  const root = makeRepo({ decision: decisionWith([real]) });

  const id = openFinding(root, slug, real);
  assert.strictEqual(shardOf(root, slug).counts.open, 1, 'precondition: exactly one open finding');

  const run = runBacklogAppend(root, slug);
  assert.strictEqual(run.status, 0, 'backlog-append must succeed:\n' + run.stderr);

  const shard = shardOf(root, slug);
  const rec = shard.findings.find((f) => f.finding_id === id);
  assert.ok(rec, 'the closure must join to the finding the panel opened, not create a new one');
  assert.strictEqual(rec.state, 'closed');
  assert.strictEqual(rec.closure_type, 'deferred');

  // The whole safety argument for this producer: `deferred` is not a resolving
  // closure type, so a producer that runs on every relaxed round cannot inflate
  // C1. If this ever fails, the producer started claiming work it did not do.
  assert.strictEqual(registry.RESOLVING_CLOSURE_TYPES.indexOf('deferred'), -1,
    'deferred must never become a resolving closure type');
  assert.strictEqual(shard.counts.resolved, 0, 'the numerator must not move');
  assert.strictEqual(shard.counts.deferred, 1);
  assert.strictEqual(shard.counts.open, 0);
  assert.strictEqual(shard.counts.total, 1, 'the denominator must not grow either');

  fs.rmSync(root, { recursive: true, force: true });
});

test('M9 Task 2: a blocking entry the panel never opened is skipped, not fabricated', () => {
  // `quorum.js` synthesises a row for `verdict=fail` that carries no reviewer
  // claim, and normalises an unreadable severity to 'UNKNOWN' while the opener
  // writes null. Neither can join to an opened finding. Closing them anyway
  // would mint records with `opened_at: null` - a denominator made of findings
  // nobody ever reported.
  const slug = 'm9-phantom';
  const real = { perspective: 'test', severity: 'HIGH', claim: 'a real reviewer finding' };
  const synthetic = { perspective: 'test', severity: 'FAIL', claim: 'reviewer returned verdict=fail' };
  const root = makeRepo({ decision: decisionWith([real, synthetic]) });

  openFinding(root, slug, real);
  const before = shardOf(root, slug);
  assert.strictEqual(before.counts.total, 1);

  const run = runBacklogAppend(root, slug);
  assert.strictEqual(run.status, 0, run.stderr);

  const artifact = JSON.parse(fs.readFileSync(
    path.join(root, '.claude', 'state', 'plan-review', 'backlog.json'), 'utf8'));
  assert.strictEqual(artifact.closures_emitted, 1);
  assert.strictEqual(artifact.closures_skipped_unmatched, 1,
    'the synthesised verdict=fail row has no opened counterpart and must be counted as skipped');

  const after = shardOf(root, slug);
  assert.strictEqual(after.counts.total, 1, 'no phantom record may enter the denominator');
  assert.strictEqual(after.counts.deferred, 1);

  fs.rmSync(root, { recursive: true, force: true });
});

test('M9 Task 2: when the backlog append fails, nothing is closed', () => {
  // Order is the contract. A finding closed as `deferred` with no deferral
  // record behind it is a closure pointing at nothing, so the failure path must
  // return before the producer runs.
  const slug = 'm9-noheader';
  const real = { perspective: 'invariant', severity: 'CRITICAL', claim: 'a real reviewer finding' };
  // A backlog with no header row: appendRows refuses rather than inventing one.
  const root = makeRepo({ decision: decisionWith([real]), backlogBody: '# Codex findings backlog\n' });

  openFinding(root, slug, real);

  const run = runBacklogAppend(root, slug);
  assert.notStrictEqual(run.status, 0, 'a load it could not record must not report success');

  const shard = shardOf(root, slug);
  assert.strictEqual(shard.counts.open, 1, 'the finding must still be open');
  assert.strictEqual(shard.counts.deferred, 0, 'nothing may be deferred without a backlog row');

  fs.rmSync(root, { recursive: true, force: true });
});

// ---- Task 3 - adjudication separates disposition from resolution ------------

test('M9 Task 3: deferring a finding never counts as resolving it', () => {
  // Task 3 closed 12 M7-era findings: 4 fixed, 1 invalidated, 7 deferred. That
  // is the first non-zero C1 this PRD has produced, so the separation has to
  // hold mechanically -- otherwise "we filed it" reads as "we fixed it" and the
  // metric measures paperwork.
  const slug = 'm9-separation';
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-m9sep-')));

  const cases = [
    { perspective: 'security', severity: 'HIGH', claim: 'was fixed in shipped code', closure: 'fixed' },
    { perspective: 'invariant', severity: 'CRITICAL', claim: 'its premise no longer holds', closure: 'invalidated' },
    { perspective: 'security', severity: 'MEDIUM', claim: 'was moved to the backlog', closure: 'deferred' },
    { perspective: 'invariant', severity: 'LOW', claim: 'was also moved to the backlog', closure: 'deferred' },
  ];

  cases.forEach((c) => {
    const id = openFinding(root, slug, c);
    const r = registry.appendFindings(slug, [{
      kind: 'finding_closed',
      finding_id: id,
      closure_type: c.closure,
      gate_id: 'mccp-plan-codex',
      perspective: c.perspective,
      severity: c.severity,
    }], { repoRoot: root });
    assert.ok(r.ok, 'closure append must succeed');
  });

  const counts = shardOf(root, slug).counts;
  assert.strictEqual(counts.total, 4);
  assert.strictEqual(counts.open, 0, 'every adjudicated finding leaves the open pool');
  assert.strictEqual(counts.fixed, 1);
  assert.strictEqual(counts.invalidated, 1);
  assert.strictEqual(counts.deferred, 2);

  // The load-bearing line: two of the four left the open pool without entering
  // the numerator. An adjudication pass that closed everything as `fixed` would
  // report 4/4 while nothing was actually repaired.
  assert.strictEqual(counts.resolved, 2, 'only fixed + invalidated may resolve');
  assert.strictEqual(counts.closed_untyped, 0, 'an untyped closure is an unreadable disposition');
  assert.strictEqual(counts.closed_unknown_type, 0);

  fs.rmSync(root, { recursive: true, force: true });
});

// ---- Task 4 - C2/C3 attribution is derived, never typed ---------------------

function openWithGate(root, slug, f) {
  const r = registry.appendFindings(slug, [{
    kind: 'finding_opened',
    gate_id: 'mccp-plan-codex',
    gate_decision_id: f.gate,
    perspective: f.perspective,
    severity: f.severity,
    claim: f.claim,
    claim_digest: registry.claimDigestOf(f.claim),
  }], { repoRoot: root });
  assert.ok(r.ok, 'fixture setup: finding_opened must append');
  const id = registry.deriveFindingId({
    work_unit: slug,
    gate_id: 'mccp-plan-codex',
    perspective: f.perspective,
    severity: f.severity,
    claim: f.claim,
  });
  const c = registry.appendFindings(slug, [{
    kind: 'finding_closed',
    finding_id: id,
    closure_type: f.closure,
    gate_id: 'mccp-plan-codex',
    perspective: f.perspective,
    severity: f.severity,
  }], { repoRoot: root });
  assert.ok(c.ok, 'fixture setup: finding_closed must append');
  return id;
}

function runQuery(root, slug) {
  const stateCli = path.join(__dirname, '..', '..', 'state', 'cli.js');
  const run = spawnSync(process.execPath,
    [stateCli, 'findings-unattributed', '--work-unit', slug, '--cwd', root, '--json'],
    { encoding: 'utf8', cwd: root });
  assert.strictEqual(run.status, 0, 'query must exit 0 even with nothing to report:\n' + run.stderr);
  return JSON.parse(run.stdout);
}

test('M9 Task 4: resolved findings are enumerated for attribution, deferred ones are not', () => {
  const slug = 'm9-attrib';
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-m9at-')));

  const fixedId = openWithGate(root, slug, {
    perspective: 'security', severity: 'HIGH', claim: 'this one was actually repaired',
    gate: 'some-earlier-gate', closure: 'fixed',
  });
  const invalidatedId = openWithGate(root, slug, {
    perspective: 'test', severity: 'HIGH', claim: 'this premise stopped holding',
    gate: 'some-earlier-gate', closure: 'invalidated',
  });
  openWithGate(root, slug, {
    perspective: 'invariant', severity: 'MEDIUM', claim: 'this one was only filed away',
    gate: 'some-earlier-gate', closure: 'deferred',
  });

  const q = runQuery(root, slug);
  const ids = q.findings.map((r) => r.finding_id).sort();
  assert.deepStrictEqual(ids, [fixedId, invalidatedId].sort(),
    'only RESOLVING closures may be attributed to a PR');
  assert.strictEqual(q.count, 2);
  // A PR that merely deferred a finding did not remediate it. Attributing a
  // deferral would make the attribution rate measure paperwork.
  q.findings.forEach((r) => {
    assert.notStrictEqual(r.closure_type, 'deferred');
    assert.ok(r.gate_decision_id, 'every row must carry the join key');
  });

  fs.rmSync(root, { recursive: true, force: true });
});

test('M9 Task 4: a finding with no gate_decision_id is dropped, not attributed on a guess', () => {
  // The M7 cohort predates the gate_decision_id stamp, so its records carry no
  // left-hand side of the triangle. A row without the join key is one no
  // consumer can read; inventing one would be worse than reporting zero.
  const slug = 'm9-nogate';
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-m9ng-')));

  const id = openFinding(root, slug, {
    perspective: 'security', severity: 'HIGH', claim: 'repaired but never stamped',
  });
  const c = registry.appendFindings(slug, [{
    kind: 'finding_closed', finding_id: id, closure_type: 'fixed',
    gate_id: 'mccp-plan-codex', perspective: 'security', severity: 'HIGH',
  }], { repoRoot: root });
  assert.ok(c.ok);
  assert.strictEqual(shardOf(root, slug).counts.resolved, 1, 'precondition: it IS resolved');

  const q = runQuery(root, slug);
  assert.strictEqual(q.count, 0, 'no join key means no attribution row');

  fs.rmSync(root, { recursive: true, force: true });
});

// ---- Task 6 - the gate blocks a flip whose predicate is false --------------

const m9gate = require('../msw-metrics/m9-coverage-gate');

function makePrdRepo(statusCell) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-m9gate-')));
  fs.mkdirSync(path.join(root, '.claude', 'prds'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'prds', 'multi-session-work-loop.prd.md'), [
    '# PRD',
    '',
    '## Delivery Milestones',
    '',
    '| # | Milestone | Outcome | Status | Plan |',
    '|---|---|---|---|---|',
    '| 5 | Fifth | something | ' + statusCell + ' | [p](p.md) |',
    '',
  ].join('\n'), 'utf8');
  return root;
}

test('M9 Task 6: a row flipped to canonical complete with a false predicate fails the gate', () => {
  // This is the whole reason axis 3 exists. Evaluating predicates and printing
  // them would produce a report; it would not stop a row whose parentheses were
  // deleted while its condition stayed false. scan.js:106 treats bare
  // `complete` as canonical, so that one edit flips archivability on its own.
  const root = makePrdRepo('complete');

  // No metrics corpus in the fixture, so M5's predicate (A4 === computed)
  // cannot hold. The row IS flipped, so the gate must check it and refuse.
  const cross = m9gate.predicateCrossCheck(root);
  const m5 = (cross.rows || []).find((r) => r.milestone === 'M5');
  assert.ok(m5, 'M5 must appear in the cross-check');
  assert.strictEqual(m5.flipped, true, 'a bare `complete` cell is a flip');
  assert.strictEqual(m5.checked, true, 'a flipped row must be checked, not reported');
  assert.strictEqual(m5.ok, false, 'the predicate is false, so the flip is not permitted');
  assert.strictEqual(cross.ok, false);

  const gate = m9gate.evaluateGate({ repoRoot: root });
  assert.strictEqual(gate.ok, false, 'the gate as a whole must refuse');

  fs.rmSync(root, { recursive: true, force: true });
});

test('M9 Task 6: a row still carrying its condition marker is not checked, and does not fail', () => {
  // "Predicate false" and "row not flipped" are different states. A row that
  // still says `complete (인정 조건 미충족: ...)` is non-canonical, which means
  // M9 has not touched it -- honest incompleteness, not a violation. Failing it
  // would push an author to flip rows just to quiet the gate.
  const root = makePrdRepo('complete (인정 조건 미충족: 무언가)');

  const cross = m9gate.predicateCrossCheck(root);
  const m5 = (cross.rows || []).find((r) => r.milestone === 'M5');
  assert.ok(m5);
  assert.strictEqual(m5.flipped, false);
  assert.strictEqual(m5.checked, false);
  assert.strictEqual(cross.ok, true, 'an untouched row is not a gate failure');

  fs.rmSync(root, { recursive: true, force: true });
});

test('M9 Task 6: an unreadable PRD fails closed rather than reporting nothing to check', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-m9noprd-')));
  const cross = m9gate.predicateCrossCheck(root);
  assert.strictEqual(cross.ok, false, 'not being able to tell what was flipped is not a pass');
  assert.match(String(cross.reason || ''), /PRD unreadable/);
  fs.rmSync(root, { recursive: true, force: true });
});

// ── PR-Codex R1 F2 — A3 미산출 분류 ──────────────────────────────────────────
//
// 옛 술어는 정책 파일의 존재만 보았다. 그 파일은 커밋된 정적 파일이라 영구히 참이므로,
// A3 가 무엇 때문에 미산출인지와 무관하게 M4 행이 통과했다. 아래 test 들이 고정하는
// 명제는 하나다: **정책이 설명한 상태만 통과하고, 설명된 적 없는 고장은 막힌다.**

test('M9 F2: the two non-delivery states the policy describes are classified, and named', () => {
  const tokenizer = m9gate.classifyA3({
    metrics: {
      A3: { status: 'error', not_delivered_reason: "tiktoken unavailable: No module named 'tiktoken'" },
    },
  });
  assert.equal(tokenizer.ok, true);
  assert.equal(tokenizer.key, 'tokenizer-unavailable');

  const stale = m9gate.classifyA3({
    metrics: {
      A3: { status: 'insufficient', invalid_reason: 'CLAUDE.md changed since the A3 measurement (re-run: ...)' },
    },
  });
  assert.equal(stale.ok, true);
  assert.equal(stale.key, 'sealed-pair-stale');

  // 이름이 붙어 있어야 감사에서 두 상태를 구분할 수 있다. 옛 detail 은
  // `a3Policy=true` 하나였고 그것은 두 상태 모두에 대해 같은 문자열이었다.
  assert.notEqual(tokenizer.detail, stale.detail);
});

test('M9 F2: an UNRELATED failure in the same status is rejected, not waved through', () => {
  // 이것이 F2 그 자체다. status 만 보면 아래 둘은 위 두 sanctioned 상태와 구분되지
  // 않는데, 정책은 이들에 대해 아무 말도 한 적이 없다.
  const unrelatedError = m9gate.classifyA3({
    metrics: { A3: { status: 'error', not_delivered_reason: 'numerator components corrupt: unexpected token' } },
  });
  assert.equal(unrelatedError.ok, false, 'an error the policy never described must not pass');
  assert.equal(unrelatedError.key, 'unclassified');

  const unrelatedInsufficient = m9gate.classifyA3({
    metrics: { A3: { status: 'insufficient', invalid_reason: 'baseline artifact missing' } },
  });
  assert.equal(unrelatedInsufficient.ok, false, 'an unrelated insufficient must not pass');

  // 사유가 아예 없으면 대조할 것이 없다 → 분류되지 않는다.
  const silent = m9gate.classifyA3({ metrics: { A3: { status: 'error' } } });
  assert.equal(silent.ok, false, 'a silent non-delivery is the case the gate exists to catch');

  // 레코드 자체의 부재도 통과가 아니다.
  assert.equal(m9gate.classifyA3({ metrics: {} }).ok, false);
  assert.equal(m9gate.classifyA3(null).ok, false);
});

test('M9 F2: the policy file is now a NECESSARY condition, not a sufficient one', () => {
  // 파일이 디스크에 실재하는 진짜 저장소에서, A3 를 분류 불가 상태로 만들면 M4 행이
  // 막혀야 한다. 옛 술어에서는 같은 입력이 통과했다 — 파일이 있었기 때문이다.
  const table = m9gate.A3_SANCTIONED_NON_DELIVERY;
  assert.equal(table.length, 2, 'exactly the two states the policy documents');
  table.forEach(function (c) {
    assert.ok(c.status && c.re instanceof RegExp && c.why,
      'each sanctioned row must name its status, its reason pattern, and the policy clause');
  });

  // 표에 없는 status 는 어떤 사유로도 통과하지 못한다.
  const bogus = m9gate.classifyA3({
    metrics: { A3: { status: 'baseline-unavailable', not_delivered_reason: 'tiktoken unavailable' } },
  });
  assert.equal(bogus.ok, false,
    'a tiktoken-shaped reason under a status the table does not list is still unclassified');
});
