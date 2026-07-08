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

test('scan — drift 증거: pending milestone 이 ledger 에 shipped 이면 driftSuspect', () => {
  const root = mkRepo();
  writePrd(root, 'drift', [
    { name: 'M1', status: 'complete' },
    { name: 'M2', status: 'pending', plan: '`.claude/plans/drift-m2.plan.md`' },
  ]);
  writePlan(root, 'drift-m2', 'drift.prd.md');
  // ledger entry 로 M2 가 실제 shipped 됐다는 강증거 주입
  const ledgerDir = path.join(root, '.claude', 'state', 'completion-ledger');
  fs.mkdirSync(ledgerDir, { recursive: true });
  const entry = {
    schema_version: 'v1',
    entry: {
      decision_id: 'drift-m2', gate: 'mccp-pr-codex', verdict: 'converged',
      version: '1.0.0', completed_at: '2026-06-01T00:00:00.000Z', commit_sha: null,
      plan_basename: 'drift-m2.plan.md', plan_file_hash: null,
      risks_closed: [], oq_closed: [], receipt_hash: 'abc123',
    },
  };
  fs.writeFileSync(path.join(ledgerDir, 'drift-m2__abc123.json'), JSON.stringify(entry));
  const out = scan({ repoRoot: root });
  const m2 = out.prds[0].milestones.find((m) => m.name === 'M2');
  assert.equal(m2.status, 'pending');
  assert.equal(m2.driftSuspect, true);
  assert.match(m2.evidence, /ledger: decision=drift-m2/);
  // 그래도 PRD 자체는 pending 이 있으니 non-archivable (drift 는 advisory)
  assert.equal(out.prds[0].archivable, false);
});
