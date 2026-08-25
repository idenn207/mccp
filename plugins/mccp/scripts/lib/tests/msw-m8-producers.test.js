'use strict';

// multi-session-work-loop M8 — producer 회귀.
//
// 이 파일이 지키는 것: emit 지점 · A1 분모 키 · A2 바인딩 거부 경로 · B3 집합 등식 ·
// 귀속 필드 형태. 전부 순수 함수 또는 파일시스템 fixture 위에서 돌고 LLM 호출이 없다.
//
// **주장하지 않는 것**: 여기 green이라고 해서 라이브에서 지표가 산출된다는 뜻은
// 아니다. producer가 실제로 발화하는지는 `m8-coverage-gate.js --acceptance`와
// note의 라이브 완주 기록이 따로 답한다(DD10 — 설치 캐시 지연).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const mswEvents = require('../../state/msw-events');
const { scanFindings } = require('../../derive/sources/findings');
const findingsRegistry = require('../../state/findings-registry');
const contextState = require('../context-state');
const toggleSnapshot = require('../../state/toggle-snapshot');
const gate = require('../msw-metrics/m8-coverage-gate');
const { scanSessionActivity } = require('../../derive/sources/session-activity');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

function mkRepo(tag) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-m8-' + tag + '-'));
  fs.mkdirSync(path.join(repo, '.claude', 'state'), { recursive: true });
  return repo;
}

// ── A1 분모 (DD3) ───────────────────────────────────────────────────────────

test('M8-A1-WORK-UNIT-DENOMINATOR: A1 denominator counts distinct work units, not sessions', () => {
  const repo = mkRepo('a1den');
  // 한 작업 단위가 세 세션에 걸친 형태. PRD가 없애려는 문제 자체가 이것이므로,
  // 세션을 세면 분모가 3이 되어 완주율이 1/3로 눌린다.
  ['s1', 's2', 's3'].forEach((sid) => {
    mswEvents.appendEvent(sid, { kind: 'session_start', created_at: '2026-01-01T00:00:00.000Z' }, { repoRoot: repo });
    mswEvents.appendEvent(sid, { kind: 'task_started', work_unit: 'one-unit' }, { repoRoot: repo });
  });

  const r = scanSessionActivity(repo);
  assert.equal(r.task_startups_count, 1, 'three sessions on one work unit is ONE startup');
  assert.equal(r.sessions.length, 3, 'the session axis is untouched');
  assert.equal(r.startups_producer_present, true);
});

test('A1 denominator dedupes a repeated startup for the same work unit', () => {
  const repo = mkRepo('a1dup');
  mswEvents.appendEvent('s1', { kind: 'task_started', work_unit: 'wu' }, { repoRoot: repo });
  mswEvents.appendEvent('s1', { kind: 'task_started', work_unit: 'wu' }, { repoRoot: repo });
  mswEvents.appendEvent('s1', { kind: 'task_started', work_unit: 'other' }, { repoRoot: repo });

  const r = scanSessionActivity(repo);
  assert.equal(r.task_startups_count, 2, 'a re-issued command must not inflate the denominator');
});

test('M8-A1-SEALED-COREPORT: A1 co-reports sealed-without-completion without folding it into the ratio (DD5)', () => {
  const repo = mkRepo('a1sealed');
  ['a', 'b'].forEach((wu) => mswEvents.appendEvent('s1', { kind: 'task_started', work_unit: wu }, { repoRoot: repo }));
  mswEvents.appendEvent('s1', { kind: 'task_completed', work_unit: 'a' }, { repoRoot: repo });
  // b는 봉인만 되고 완주 기록이 없다 — 산문 누락(DD4)이 남긴 간극.
  mswEvents.appendEvent('s1', { kind: 'task_ship_sealed', work_unit: 'b' }, { repoRoot: repo });
  // a는 봉인도 완주도 있으므로 간극이 아니다.
  mswEvents.appendEvent('s1', { kind: 'task_ship_sealed', work_unit: 'a' }, { repoRoot: repo });

  const r = scanSessionActivity(repo);
  assert.equal(r.task_startups_count, 2);
  assert.equal(r.task_completions_count, 1);
  assert.equal(r.sealed_without_completion, 1, 'only the sealed-but-uncompleted unit counts');
});

test('M8-A1-SEAL-IS-NOT-COMPLETION: task_ship_sealed is NOT a completion (DD5) — it never moves the numerator', () => {
  const repo = mkRepo('a1notnum');
  mswEvents.appendEvent('s1', { kind: 'task_started', work_unit: 'wu' }, { repoRoot: repo });
  mswEvents.appendEvent('s1', { kind: 'task_ship_sealed', work_unit: 'wu' }, { repoRoot: repo });

  const r = scanSessionActivity(repo);
  assert.equal(r.task_completions_count, 0,
    'sealing a ship receipt is not completing the work — gh pr create can still fail');
  assert.equal(r.completions_producer_present, false);
  assert.equal(r.sealed_without_completion, 1);
});

// ── A2 세션 바인딩 (DD6 · security review R1 F5) ────────────────────────────

test('M8-A2-SESSION-BINDING: A2 binding: a value is stamped ONLY on session match AND freshness', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-m8-ctx-'));
  const now = 1700000000000;
  contextState.writeState({ contextRemainingPct: 42, toolCount: 7, sessionId: 'sid-A' }, { dir, now });

  assert.equal(contextState.resolveSessionBoundPct('sid-A', { dir, now: now + 1000 }), 42,
    '(a) match + fresh → stamp');
  assert.equal(contextState.resolveSessionBoundPct('sid-B', { dir, now: now + 1000 }), null,
    '(b) cross-session sample must NOT be attributed');
  assert.equal(
    contextState.resolveSessionBoundPct('sid-A', { dir, now: now + contextState.CONTEXT_SAMPLE_MAX_AGE_MS + 1 }),
    null, '(c) stale sample must NOT be attributed');
});

test('M8-A2-TYPE-CONFUSION: A2 binding: strict string comparison resists type confusion (R1 F5)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-m8-ctx2-'));
  const now = 1700000000000;
  contextState.writeState({ contextRemainingPct: 42, toolCount: 7, sessionId: 'sid-A' }, { dir, now });

  // toString()이 일치해도 문자열이 아니면 거절돼야 한다.
  assert.equal(contextState.resolveSessionBoundPct({ toString: () => 'sid-A' }, { dir, now: now + 1 }), null);
  assert.equal(contextState.resolveSessionBoundPct(null, { dir, now: now + 1 }), null);
});

test('A2 binding: a legacy snapshot with no session_id is never attributed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-m8-ctx3-'));
  const now = 1700000000000;
  fs.writeFileSync(path.join(dir, contextState.CONTEXT_STATE_FILENAME),
    JSON.stringify({ context_remaining_pct: 55, tool_count: 9, context_ts: now }));
  assert.equal(contextState.resolveSessionBoundPct('sid-A', { dir, now: now + 1 }), null,
    'pre-M8 snapshots carry no owner, so they are unattributable by construction');
});

// ── 파일명 성분 방어 (security review R1 F1/F2) ─────────────────────────────

test('msw-events refuses a session id that would escape the events directory', () => {
  ['../../evil', 'a/b', 'a\\b', 'a.b', '.'].forEach((bad) => {
    assert.throws(
      () => mswEvents.appendEvent(bad, { kind: 'session_start' }, { repoRoot: REPO_ROOT }),
      (err) => err && err.code === 'invalid_session_id',
      'must refuse ' + JSON.stringify(bad));
  });
});

test('M8-PATH-GUARD-FINDINGS: findings-registry refuses a work unit that would escape the registry directory', () => {
  const repo = mkRepo('fr');
  const r = findingsRegistry.appendFindings('../../etc/passwd',
    [{ kind: 'finding_opened', finding_id: 'f1' }], { repoRoot: repo });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid_work_unit');
  assert.equal(findingsRegistry.writeDegradedMarker(repo, '../../evil', { reason: 'x' }), false,
    'the exported marker writer must apply the same guard');
});

// ── 귀속 필드 형태 (Task 7 · security review R1 F6) ─────────────────────────

test('M8-C2C3-ATTRIBUTION-FORM: attribution fields are rejected before any seq number is spent', () => {
  const repo = mkRepo('attr');
  const bad = [
    { field: 'gate_decision_id', value: '../../x' },
    { field: 'remediation_pr', value: '12x' },
    { field: 'remediation_pr', value: '-3' },
  ];
  bad.forEach((c) => {
    const ev = { kind: 'finding_opened', finding_id: 'f1' };
    ev[c.field] = c.value;
    const r = findingsRegistry.appendFindings('wu', [ev], { repoRoot: repo });
    assert.equal(r.ok, false, c.field + '=' + c.value + ' must be refused');
    assert.equal(r.written, 0, 'a refused batch must not consume seq numbers');
  });

  const good = findingsRegistry.appendFindings('wu', [{
    kind: 'finding_opened', finding_id: 'f1',
    gate_decision_id: 'multi-session-work-loop-m8', remediation_pr: '42',
  }], { repoRoot: repo });
  assert.equal(good.ok, true);
  assert.equal(good.seq_start, 1, 'the refused batches above spent nothing');
});

// ── 귀속 삼각의 우변 (local review H3) ──────────────────────────────────────

test('M8-C2C3-ATTRIBUTION-JOINED: a remediation record is readable back as attribution coverage', () => {
  const repo = mkRepo('attrjoin');
  const fid = 'a1b2c3d4e5f60718';

  // 좌변: finding은 레지스트리에 살고 gate_decision_id를 갖는다.
  const opened = findingsRegistry.appendFindings('gate-slug', [{
    kind: 'finding_opened', finding_id: fid, gate_decision_id: 'gate-slug',
  }], { repoRoot: repo });
  assert.equal(opened.ok, true);

  const before = scanFindings(repo);
  assert.equal(before.with_gate_decision, 1, 'left side is registry-resident');
  assert.equal(before.with_remediation_pr, 0, 'no remediation recorded yet');

  // 우변: PR 시점의 귀속은 msw-events에 산다 — 레지스트리에 append하려면
  // `finding_closed`를 써야 하고 그러면 closure enum이 C1 해소 계상을 오염시킨다.
  mswEvents.appendEvent('sid-pr', {
    kind: 'remediation_pr', work_unit: 'ship-slug', pr_number: '42',
    finding_id: fid, gate_decision_id: 'gate-slug',
  }, { repoRoot: repo });

  const after = scanFindings(repo);
  assert.equal(after.with_remediation_pr, 1,
    'the record must be readable back — a writer with no reader is the debt this milestone repays');

  // 조인 키가 없는 레코드는 분자를 만들지 못한다. 그래서 CLI가 그것을 애초에 거부한다.
  mswEvents.appendEvent('sid-pr', {
    kind: 'remediation_pr', work_unit: 'ship-slug', pr_number: '43',
  }, { repoRoot: repo });
  assert.equal(scanFindings(repo).with_remediation_pr, 1,
    'a record with no finding_id joins to nothing and must not inflate coverage');

  // 손으로 편집된 임의 문자열도 분자를 오염시키지 못한다(형태 검증은 reader에도 있다).
  mswEvents.appendEvent('sid-pr', {
    kind: 'remediation_pr', work_unit: 'ship-slug', pr_number: '44', finding_id: 'not-hex',
  }, { repoRoot: repo });
  assert.equal(scanFindings(repo).with_remediation_pr, 1, 'malformed finding_id is ignored');
});

test('M8-C2C3-REMEDIATION-JOIN-KEY: the CLI refuses a remediation record that could never be read back', () => {
  const repo = mkRepo('attrcli');
  const run = (args) => spawnSync(process.execPath,
    [path.join(REPO_ROOT, 'plugins', 'mccp', 'scripts', 'state', 'cli.js'),
      'msw-event', 'emit', '--session', 'clisid', '--cwd', repo].concat(args),
    { encoding: 'utf8' });

  const noFinding = run(['--kind', 'remediation_pr', '--work-unit', 'wu', '--pr-number', '7']);
  assert.notEqual(noFinding.status, 0, 'remediation_pr without --finding-id must be refused');
  assert.match(noFinding.stderr, /requires --finding-id/);

  const badFinding = run(['--kind', 'remediation_pr', '--work-unit', 'wu', '--pr-number', '7',
    '--finding-id', 'nothex']);
  assert.notEqual(badFinding.status, 0, 'a malformed finding id must be refused, not truncated');

  const ok = run(['--kind', 'remediation_pr', '--work-unit', 'wu', '--pr-number', '7',
    '--finding-id', 'a1b2c3d4e5f60718', '--gate-decision-id', 'gate-slug']);
  assert.equal(ok.status, 0, ok.stderr);

  // `task_completed`는 조인 키를 요구하지 않는다 — A1 분자는 work_unit으로 센다.
  const completed = run(['--kind', 'task_completed', '--work-unit', 'wu', '--pr-number', '7']);
  assert.equal(completed.status, 0, completed.stderr);
});

// ── B3 집합 등식 (DD7) ──────────────────────────────────────────────────────

test('M8-B3-SET-EQUALITY: B3: denominator and numerator universes are the same set, both directions', () => {
  const s = toggleSnapshot.scanSurfaceDetailed(REPO_ROOT);
  const cov = s.numerator_coverage;
  assert.ok(cov, 'scanSurfaceDetailed must report numerator coverage');
  assert.deepEqual(cov.denominator_only, [],
    'a denominator-only name can never become a numerator — B3 could not reach 100%');
  assert.deepEqual(cov.numerator_only, [],
    'a numerator-only name counts outside the denominator — the ratio could exceed 1');
  assert.equal(cov.equal, true);
  assert.equal(cov.denominator, cov.numerator_universe);
});

test('B3: the equality is judged by difference sets, not by size', () => {
  // 크기 비교로는 서로 다른 이름이 한 개씩 어긋난 상태를 통과시킨다.
  const s = toggleSnapshot.scanSurfaceDetailed(REPO_ROOT);
  assert.ok(Array.isArray(s.numerator_coverage.denominator_only));
  assert.ok(Array.isArray(s.numerator_coverage.numerator_only));
});

test('M8-B3-NO-RETIREMENT: B3: exclusions are named, triple-reported, and retire nothing', () => {
  const s = toggleSnapshot.scanSurfaceDetailed(REPO_ROOT);
  assert.ok(s.raw_surface_count > s.toggle_count, 'raw and post-exclusion denominators are both reported');
  assert.equal(s.raw_surface_count - s.excluded.length, s.toggle_count,
    'the three numbers must be arithmetically consistent');
  assert.equal(s.retired_count, 0, 'M8 retires zero axes (UI6 · UI14)');
  assert.equal(s.exclusion_doc.ok, true,
    'every exclusion must also be named in the normative document (measurement-design.md §B3)');
  assert.deepEqual(s.defaults_conflicts, [],
    'no excluded name may still sit in the numerator table');
});

// ── coverage gate (Task 9) ──────────────────────────────────────────────────

test('M8-GATE-REGISTRY: m8-coverage-gate: every approved emit site still exists and nothing else emits', () => {
  const r = gate.evaluateGate({ repoRoot: REPO_ROOT });
  assert.deepEqual(r.registry.missing, [],
    'an approved emit site that vanished means a producer was silently removed');
  assert.deepEqual(r.static_lint.violations, [],
    'an unapproved caller emits with a vocabulary nothing audits');
  assert.equal(r.ok, true);
});

test('M8-GATE-MEASURED-SET: m8-coverage-gate: the approved set is the MEASURED set, and self/writer are exempt', () => {
  const files = gate.APPROVED_EMIT_SITES.map((s) => s.file);
  assert.equal(new Set(files).size, files.length, 'no duplicate sites');
  assert.ok(files.indexOf(gate.SELF_EXEMPT) === -1, 'the auditor is not an emit site');
  assert.ok(files.indexOf(gate.WRITER_MODULE) === -1, 'the writer module defines appendEvent, it does not call it');
  // plan Task 9는 "정확히 5개"라 적었으나 실측 호출자는 7이다. 선재하는 정당한
  // 두 지점(evidence-lock · handoff-items)을 빼면 gate가 착지 즉시 붉어진다.
  assert.equal(files.length, 7,
    'the registry is the measured set of legitimate emit sites, not the plan\'s partial enumeration');
  ['plugins/mccp/scripts/receipt/evidence-lock.js',
    'plugins/mccp/scripts/state/handoff-items.js'].forEach((pre) => {
    assert.ok(files.indexOf(pre) !== -1, pre + ' predates M8 and is legitimate');
  });
});

test('m8-coverage-gate: acceptance separates PRE from POST and never fails on the circularity', () => {
  const acc = gate.evaluateAcceptance(REPO_ROOT);
  // POST kinds는 이 milestone 자신의 /mccp:pr에서 처음 발화한다(plan Risks).
  // gate가 그것을 실패로 세면 커밋 전 실행이 구조적으로 통과 불가가 된다.
  assert.ok(Array.isArray(acc.post_missing));
  assert.ok(Array.isArray(acc.pre_missing));
  if (acc.post_missing.length > 0) {
    assert.ok(acc.post_note, 'a missing POST kind must be explained, not silently ignored');
  }
});
