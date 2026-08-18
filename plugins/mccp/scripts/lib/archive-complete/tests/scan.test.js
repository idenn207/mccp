'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan, classifyMilestones, isArchivable, normalizeStatus } = require('../scan');

// --- fixtures ---------------------------------------------------------------

function mkRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-archive-scan-'));
  fs.mkdirSync(path.join(root, '.claude', 'prds'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'plans'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'PRPs', 'plans'), { recursive: true });
  return root;
}

function writePrd(root, name, rows, h1) {
  const table = [
    '## Delivery Milestones',
    '',
    '| # | Milestone | Outcome | Status | Plan |',
    '|---|---|---|---|---|',
    ...rows.map((r, i) => `| ${i + 1} | ${r.name} | ${r.outcome || 'o'} | ${r.status} | ${r.plan || '—'} |`),
    '',
    '## Open Questions',
    '',
    '- none',
    '',
  ].join('\n');
  const body = `# ${h1 || name}\n\n${table}`;
  fs.writeFileSync(path.join(root, '.claude', 'prds', name + '.prd.md'), body);
}

function writePlan(root, base, sourcePrd) {
  const body = [
    `# Plan: ${base}`, '',
    `**Source PRD**: \`.claude/prds/${sourcePrd}\``, '',
    '## Summary', 'x', '',
  ].join('\n');
  fs.writeFileSync(path.join(root, '.claude', 'plans', base + '.plan.md'), body);
}

// --- classifier unit --------------------------------------------------------

test('normalizeStatus — 정규 4토큰 + non-canonical', () => {
  assert.equal(normalizeStatus('complete'), 'complete');
  assert.equal(normalizeStatus('  Complete '), 'complete');
  assert.equal(normalizeStatus('pending'), 'pending');
  assert.equal(normalizeStatus('in-progress'), 'in-progress');
  assert.equal(normalizeStatus('dropped'), 'dropped');
  assert.equal(normalizeStatus('complete (verify) · gated'), 'non-canonical');
  assert.equal(normalizeStatus(''), 'non-canonical');
  assert.equal(normalizeStatus(null), 'non-canonical');
});

test('classifyMilestones — rawRowCount 를 분모로(F1), 비정규 행이 증발하지 않음', () => {
  const body = [
    '## Delivery Milestones', '',
    '| # | Milestone | Outcome | Status | Plan |',
    '|---|---|---|---|---|',
    '| 1 | A | o | complete | — |',
    '| 2 | B | o | complete (verify) · gated | — |',
    '| 3 | C | o | pending | — |',
    '',
  ].join('\n');
  const c = classifyMilestones(body);
  assert.equal(c.rawRowCount, 3);
  assert.equal(c.complete, 1);
  assert.equal(c.nonCanonical, 1);
  assert.equal(c.pending, 1);
  // 버킷 합 == rawRowCount (증발 0)
  assert.equal(c.complete + c.dropped + c.pending + c.inProgress + c.nonCanonical, c.rawRowCount);
});

test('isArchivable — 전 행 complete 이면 true', () => {
  const c = classifyMilestones([
    '## Delivery Milestones', '',
    '| # | Milestone | Outcome | Status | Plan |',
    '|---|---|---|---|---|',
    '| 1 | A | o | complete | — |',
    '| 2 | B | o | complete | — |', '',
  ].join('\n'));
  assert.equal(isArchivable(c).archivable, true);
});

test('isArchivable — 전 행 dropped 이면 true', () => {
  const c = classifyMilestones([
    '## Delivery Milestones', '',
    '| # | Milestone | Outcome | Status | Plan |',
    '|---|---|---|---|---|',
    '| 1 | A | o | dropped | — |',
    '| 2 | B | o | complete | — |', '',
  ].join('\n'));
  assert.equal(isArchivable(c).archivable, true);
});

test('isArchivable — pending 한 행이라도 있으면 false (C2)', () => {
  const c = classifyMilestones([
    '## Delivery Milestones', '',
    '| # | Milestone | Outcome | Status | Plan |',
    '|---|---|---|---|---|',
    '| 1 | A | o | complete | — |',
    '| 2 | B | o | pending | — |', '',
  ].join('\n'));
  const v = isArchivable(c);
  assert.equal(v.archivable, false);
  assert.match(v.reason, /pending=1/);
});

test('isArchivable — 비정규 1행 + 나머지 complete 도 false (Codex F1 fail-closed)', () => {
  const c = classifyMilestones([
    '## Delivery Milestones', '',
    '| # | Milestone | Outcome | Status | Plan |',
    '|---|---|---|---|---|',
    '| 1 | A | o | complete | — |',
    '| 2 | B | o | complete (verify) · gated | — |',
    '| 3 | C | o | complete | — |', '',
  ].join('\n'));
  const v = isArchivable(c);
  assert.equal(v.archivable, false);
  assert.match(v.reason, /non-canonical=1/);
});

test('isArchivable — 표 없으면 false', () => {
  const c = classifyMilestones('# PRD\n\n## Summary\nx\n');
  assert.equal(c.hasTable, false);
  assert.equal(isArchivable(c).archivable, false);
});

// --- scan() integration -----------------------------------------------------

test('scan — workflow-orchestration 유사 PRD(M4 pending·M3 비정규) → archivable=false', () => {
  const root = mkRepo();
  writePrd(root, 'wo', [
    { name: 'M1', status: 'complete', plan: '`.claude/plans/wo-m1.plan.md`' },
    { name: 'M2', status: 'complete', plan: '`.claude/plans/wo-m2.plan.md`' },
    { name: 'M3', status: 'complete (verify) · gated', plan: '`.claude/plans/wo-m3.plan.md`' },
    { name: 'M4', status: 'pending' },
  ]);
  writePlan(root, 'wo-m1', 'wo.prd.md');
  writePlan(root, 'wo-m2', 'wo.prd.md');
  const out = scan({ repoRoot: root });
  assert.equal(out.scanned, 1);
  const p = out.prds[0];
  assert.equal(p.archivable, false);
  assert.equal(p.counts.rawRowCount, 4);
  assert.equal(p.counts.complete, 2);
  assert.equal(p.counts.pending, 1);
  assert.equal(p.counts.nonCanonical, 1);
  // plan↔PRD 인덱스
  assert.deepEqual(p.plans.map((x) => x.split('/').pop()).sort(), ['wo-m1.plan.md', 'wo-m2.plan.md']);
});

test('scan — all-complete PRD → archivable=true', () => {
  const root = mkRepo();
  writePrd(root, 'done', [
    { name: 'M1', status: 'complete' },
    { name: 'M2', status: 'complete' },
  ]);
  const out = scan({ repoRoot: root });
  assert.equal(out.prds[0].archivable, true);
});

test('scan — archived/ 하위는 스캔하지 않음(비재귀)', () => {
  const root = mkRepo();
  fs.mkdirSync(path.join(root, '.claude', 'prds', 'archived'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'prds', 'archived', 'old.prd.md'), '# old\n');
  writePrd(root, 'active', [{ name: 'M1', status: 'pending' }]);
  const out = scan({ repoRoot: root });
  assert.equal(out.scanned, 1);
  assert.equal(out.prds[0].name, 'active');
});

// --- M6: ledger 강등 + 공유 오라클 -------------------------------------------

function writeLedgerEntry(root, decision) {
  const ledgerDir = path.join(root, '.claude', 'state', 'completion-ledger');
  fs.mkdirSync(ledgerDir, { recursive: true });
  fs.writeFileSync(path.join(ledgerDir, decision + '__abc123.json'), JSON.stringify({
    schema_version: 'v1',
    entry: {
      decision_id: decision, gate: 'mccp-pr-codex', verdict: 'converged',
      version: '1.0.0', completed_at: '2026-06-01T00:00:00.000Z', commit_sha: null,
      plan_basename: decision + '.plan.md', plan_file_hash: null,
      risks_closed: [], oq_closed: [], receipt_hash: 'abc123',
    },
  }));
}

// git 조회가 아무 것도 못 찾는 stub — receipt 미도달 + plan 미도달.
// 실제 git 동작을 모델링한다: `cat-file -e` 는 객체가 없으면 **비영점 exit** 이고,
// `rev-parse --verify` 는 ref 가 있으면 sha 를 낸다(ref 가 안 풀리면 gitReachable 이
// null 이 되어 not-shipped 가 아니라 undetermined 가 된다 — 두 상태는 다르다).
function emptyGitQuery(args) {
  if (args[0] === 'cat-file') return { ok: false, stdout: '', status: 1 };
  if (args[0] === 'rev-parse' && args.indexOf('--git-dir') !== -1) {
    return { ok: true, stdout: '.git\n', status: 0 };
  }
  if (args[0] === 'rev-parse') return { ok: true, stdout: 'deadbeef\n', status: 0 };
  return { ok: true, stdout: '', status: 0 };
}

test('scan — ledger 단독 증거는 driftSuspect 를 올리지 않는다 (UI3 판정 소스 배제)', () => {
  const root = mkRepo();
  writePrd(root, 'drift', [
    { name: 'M1', status: 'complete' },
    { name: 'M2', status: 'pending', plan: '`.claude/plans/drift-m2.plan.md`' },
  ]);
  writePlan(root, 'drift-m2', 'drift.prd.md');
  writeLedgerEntry(root, 'drift-m2');

  // receipt 도 plan 도 도달 불가 → 오라클은 not-shipped. 문서도 pending 이므로 일치다.
  const out = scan({ repoRoot: root, gitQuery: emptyGitQuery });
  const m2 = out.prds[0].milestones.find((m) => m.name === 'M2');
  assert.equal(m2.status, 'pending');
  // 이전 구현은 ledger 를 강증거로 보고 여기서 true 를 냈다. 계약이 ledger 를 판정
  // 소스에서 배제했으므로 false 가 정답이다.
  assert.equal(m2.driftSuspect, false);
  assert.equal(m2.evidence_verdict, 'not-shipped');
  // ledger 는 사라지지 않고 **참고 인용**으로 병기된다.
  assert.match(m2.evidence, /ledger\(ref only\): decision=drift-m2/);
  assert.equal(out.prds[0].archivable, false);
});

test('scan — 오라클이 shipped 를 내면 driftSuspect (판정 축은 오라클이 소유)', () => {
  const root = mkRepo();
  writePrd(root, 'drift', [
    { name: 'M2', status: 'pending', plan: '`.claude/plans/drift-m2.plan.md`' },
  ]);
  writePlan(root, 'drift-m2', 'drift.prd.md');

  // receipt 커밋 도달성만 성공시키는 stub.
  const gitQuery = (args) => {
    if (args[0] === 'cat-file' && args[1] === '-e') return { ok: true, stdout: '', status: 0 };
    if (args[0] === 'cat-file' && args[1] === '-p') {
      return { ok: true, stdout: JSON.stringify({ resolution: { codex_verdict: 'divergent' } }), status: 0 };
    }
    return { ok: true, stdout: '', status: 0 };
  };
  const out = scan({ repoRoot: root, gitQuery: gitQuery });
  const m2 = out.prds[0].milestones.find((m) => m.name === 'M2');
  assert.equal(m2.driftSuspect, true);
  assert.equal(m2.evidence_verdict, 'shipped');
  // divergent 인 채 ship 된 작업 단위도 shipped 다 — codex_verdict 는 병기만 된다.
  assert.match(m2.evidence, /codex_verdict=divergent/);
});

test('B1-ARCHIVE-DEGRADED: 오라클 throw → degraded:true + warnings ≥1 (fail-closed)', () => {
  const root = mkRepo();
  writePrd(root, 'drift', [
    { name: 'M2', status: 'pending', plan: '`.claude/plans/drift-m2.plan.md`' },
  ]);
  writePlan(root, 'drift-m2', 'drift.prd.md');

  const out = scan({
    repoRoot: root,
    gitQuery: emptyGitQuery,
    adjudicate: () => { throw new Error('boom'); },
  });
  const m2 = out.prds[0].milestones.find((m) => m.name === 'M2');
  // 이전 구현은 catch 에서 driftSuspect:false 를 돌려 예외가 "drift 없음" 으로 읽혔다.
  assert.equal(m2.evidence_verdict, 'undetermined');
  assert.match(m2.evidence, /oracle failed: boom/);
  assert.equal(out.degraded, true);
  assert.ok(out.warnings.length >= 1);
  assert.ok(out.warnings.some((w) => /drift oracle failed/.test(w)));
});

// --- local review H2·M1·M2 — 두 표면의 입력 정규화 일치 ------------------------

test('B1-ARCHIVE-JOINKEY: plan 셀이 .plan.md 가 아니면 not-shipped 가 아니라 undetermined', () => {
  // 실측 결함: `review-loop-trust.prd.md` 의 네 행이 자식 **PRD** 링크를 물고 들어와
  // scan.js 에서 `not-shipped` 로 오판됐다(derive source 는 같은 행을 undetermined 로
  // 냈다). 확정 불가를 적극적 주장으로 접는 것이 E1 위반이며, 그것이 두 표면을 갈랐다.
  const root = mkRepo();
  writePrd(root, 'joinkey', [
    { name: 'M1', status: 'pending', plan: '[child](../prds/archived/other.prd.md)' },
  ]);

  const out = scan({ repoRoot: root, gitQuery: emptyGitQuery });
  const m1 = out.prds[0].milestones.find((m) => m.name === 'M1');
  assert.equal(m1.evidence_verdict, 'undetermined');
  assert.equal(m1.driftSuspect, false);
  assert.match(m1.evidence, /does not reference a \.plan\.md file/);
  // 데이터 조건이지 오라클 고장이 아니다 — degraded 를 올리지 않는다.
  assert.equal(out.degraded, false);
});

test('B1-ARCHIVE-JOINKEY-REL: PRD 기준 상대 링크도 repo-root 로 정규화해 판정한다', () => {
  // 정규화가 없으면 `../plans/x.plan.md` 가 그대로 git pathspec 이 되어 조회가 깨진다
  // (실측: gitReachable=null → undetermined). 정규화 후에는 정상 판정에 도달한다.
  const root = mkRepo();
  writePrd(root, 'rel', [
    { name: 'M1', status: 'pending', plan: '[plan](../plans/rel-m1.plan.md)' },
  ]);
  writePlan(root, 'rel-m1', 'rel.prd.md');

  const seen = [];
  const gitQuery = (args) => {
    seen.push(args.join(' '));
    if (args[0] === 'cat-file' && args[1] === '-e') return { ok: true, stdout: '', status: 0 };
    if (args[0] === 'cat-file' && args[1] === '-p') {
      return { ok: true, stdout: JSON.stringify({ resolution: { codex_verdict: 'converged' } }), status: 0 };
    }
    return { ok: true, stdout: '', status: 0 };
  };
  const out = scan({ repoRoot: root, gitQuery });
  const m1 = out.prds[0].milestones.find((m) => m.name === 'M1');
  assert.equal(m1.evidence_verdict, 'shipped');
  assert.equal(m1.driftSuspect, true);
  // receipt 경로가 해석된 basename 에서 파생됐음을 호출 인자로 확인한다.
  assert.ok(seen.some((s) => s.indexOf('HEAD:.claude/receipts/mccp-pr-codex/rel-m1.json') !== -1),
    'calls=' + JSON.stringify(seen));
});

test('B1-ARCHIVE-DUPKEY: 서로 다른 PRD 가 같은 decision_id 를 선언하면 양쪽 다 강등된다', () => {
  // decision_id 에는 PRD 성분이 없다. 이전 구현은 `duplicateKey:false` 를 하드코딩해
  // 충돌한 두 행 **모두** 에 shipped 를 내고 drift 를 오탐했다. 임의 채택 금지 규칙
  // (b1-status-drift.js)이 이 경로에서도 성립해야 한다.
  const root = mkRepo();
  writePrd(root, 'alpha', [
    { name: 'A1', status: 'pending', plan: '`.claude/plans/shared.plan.md`' },
  ]);
  writePrd(root, 'beta', [
    { name: 'B1', status: 'pending', plan: '`.claude/plans/shared.plan.md`' },
  ]);
  writePlan(root, 'shared', 'alpha.prd.md');

  // receipt 가 도달 가능해도 충돌이 먼저 판정되므로 shipped 가 나오면 안 된다.
  const gitQuery = (args) => {
    if (args[0] === 'cat-file' && args[1] === '-e') return { ok: true, stdout: '', status: 0 };
    return { ok: true, stdout: '', status: 0 };
  };
  const out = scan({ repoRoot: root, gitQuery });
  const rows = out.prds.flatMap((p) => p.milestones);
  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.equal(r.evidence_verdict, 'undetermined', r.name + ' must be demoted');
    assert.equal(r.driftSuspect, false);
    assert.match(r.evidence, /duplicate-decision-id/);
  }
});

test('B1-ARCHIVE-PLUMBING: default ref 와 plan index 는 스캔당 한 번만 세운다', () => {
  // 이전 구현은 행마다 rev-parse + 전체 ls-tree 를 재실행해 실측 862ms → 3,201ms 였다.
  const root = mkRepo();
  const rows = [];
  for (let i = 1; i <= 5; i++) {
    rows.push({ name: 'M' + i, status: 'pending', plan: '`.claude/plans/many-m' + i + '.plan.md`' });
    writePlan(root, 'many-m' + i, 'many.prd.md');
  }
  writePrd(root, 'many', rows);

  const calls = [];
  const gitQuery = (args) => { calls.push(args); return emptyGitQuery(args); };
  const out = scan({ repoRoot: root, gitQuery });
  assert.equal(out.prds[0].milestones.length, 5);

  const revParse = calls.filter((a) => a[0] === 'rev-parse').length;
  // plan index 재구축 = 경로 인자가 없는 ls-tree.
  const indexBuilds = calls.filter((a) => a[0] === 'ls-tree' && a.indexOf('--') === a.length - 3).length;
  assert.equal(revParse, 1, 'default ref must resolve once; calls=' + JSON.stringify(calls));
  assert.equal(indexBuilds, 1, 'plan index must build once; calls=' + JSON.stringify(calls));
});

test('B1-ARCHIVE-NOGIT: 판정할 행이 없으면 git 을 아예 부르지 않는다 (lazy 배관)', () => {
  const root = mkRepo();
  writePrd(root, 'done', [{ name: 'M1', status: 'complete' }]);
  const calls = [];
  scan({ repoRoot: root, gitQuery: (args) => { calls.push(args); return emptyGitQuery(args); } });
  assert.deepEqual(calls, []);
});

test('B1-ARCHIVE-INVARIANT: ledger 강등 후에도 archivable 판정(C2·C3·C4)이 불변', () => {
  const root = mkRepo();
  // C2 — 전 행 complete/dropped 면 archivable
  writePrd(root, 'alldone', [
    { name: 'M1', status: 'complete', plan: '`.claude/plans/alldone-m1.plan.md`' },
    { name: 'M2', status: 'dropped' },
  ]);
  // C2 — pending 이 하나라도 있으면 non-archivable
  writePrd(root, 'haspending', [
    { name: 'M1', status: 'complete' },
    { name: 'M2', status: 'pending', plan: '`.claude/plans/haspending-m2.plan.md`' },
  ]);
  // C4 — 비정규 status 는 complete 도 lifecycle 도 아니다 → non-archivable
  writePrd(root, 'noncanon', [
    { name: 'M1', status: 'complete' },
    { name: 'M2', status: 'complete (verify) · gated' },
  ]);
  writePlan(root, 'alldone-m1', 'alldone.prd.md');
  writePlan(root, 'haspending-m2', 'haspending.prd.md');
  // ledger 를 전부 심어도 판정은 흔들리지 않아야 한다.
  writeLedgerEntry(root, 'alldone-m1');
  writeLedgerEntry(root, 'haspending-m2');

  const out = scan({ repoRoot: root, gitQuery: emptyGitQuery });
  const byName = Object.fromEntries(out.prds.map((p) => [p.path.split('/').pop(), p]));

  assert.equal(byName['alldone.prd.md'].archivable, true);
  assert.equal(byName['haspending.prd.md'].archivable, false);
  assert.match(byName['haspending.prd.md'].reason, /pending=1/);
  assert.equal(byName['noncanon.prd.md'].archivable, false);
  assert.match(byName['noncanon.prd.md'].reason, /non-canonical=1/);

  // C3 — rawRowCount 등식은 그대로.
  out.prds.forEach((p) => {
    const c = p.counts;
    assert.equal(c.complete + c.dropped + c.pending + c.inProgress + c.nonCanonical, c.rawRowCount);
  });
});
