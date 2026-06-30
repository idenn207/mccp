'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { enumerate } = require('../enumerate');

function mkRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-stale-enum-'));
  fs.mkdirSync(path.join(root, '.claude', 'plans'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'prds'), { recursive: true });
  return root;
}

const PLAN = [
  '# Plan',
  '',
  '## Open Questions',
  '',
  '- [ ] live-q: 미해결',
  '- resolved-q: 해결됨 <!--mccp:resolved reason="구조 소멸" at="2026-06-25T00:00:00Z"-->',
  '',
  '## Risks',
  '',
  '| Risk | Likelihood | Impact | Mitigation |',
  '| --- | --- | --- | --- |',
  '| live-risk | High | High | m1 |',
  '| done-risk | Low | Low | m2 |<!--mccp:resolved reason="완화 구현" at="2026-06-25T00:00:00Z"-->',
  '',
].join('\n');

const PRD = [
  '# PRD',
  '',
  '## Delivery Milestones',
  '',
  '| # | Milestone | Outcome | Status | Plan |',
  '| --- | --- | --- | --- | --- |',
  '| 1 | Active MS | o | in-progress | — |',
  '| 2 | Done MS | o | complete | [x.plan.md](../plans/x.plan.md) |',
  '',
].join('\n');

test('enumerate — active(미마커) 위험/OQ 만, 마커 항목 제외', () => {
  const root = mkRepo();
  fs.writeFileSync(path.join(root, '.claude/plans/a.plan.md'), PLAN);
  const out = enumerate({ repoRoot: root });
  const risks = out.items.filter((i) => i.kind === 'risk');
  const oqs = out.items.filter((i) => i.kind === 'oq');
  assert.equal(risks.length, 1, 'resolved risk 제외');
  assert.equal(risks[0].text, 'live-risk');
  assert.equal(oqs.length, 1, 'resolved oq 제외');
  assert.equal(oqs[0].text, 'live-q: 미해결');
});

test('enumerate — source ref(lineNumber) 안정성: apply locate 와 정합', () => {
  const root = mkRepo();
  fs.writeFileSync(path.join(root, '.claude/plans/a.plan.md'), PLAN);
  const out = enumerate({ repoRoot: root });
  const risk = out.items.find((i) => i.kind === 'risk');
  // live-risk 는 표 첫 데이터 행 — PLAN 배열에서 11번째(1-indexed) 라인.
  const lines = PLAN.split('\n');
  assert.equal(lines[risk.lineNumber - 1].includes('live-risk'), true);
  const oq = out.items.find((i) => i.kind === 'oq');
  assert.equal(lines[oq.lineNumber - 1].includes('live-q'), true);
  assert.equal(risk.source, '.claude/plans/a.plan.md');
});

test('enumerate — in-progress 마일스톤 후보 수집(link 무요구)', () => {
  const root = mkRepo();
  fs.writeFileSync(path.join(root, '.claude/prds/p.prd.md'), PRD);
  const out = enumerate({ repoRoot: root });
  const ms = out.items.filter((i) => i.kind === 'milestone');
  assert.equal(ms.length, 1, 'in-progress 만 후보(complete 제외)');
  assert.equal(ms[0].name, 'Active MS');
  assert.equal(ms[0].status, 'in-progress');
});

test('enumerate — top-level 레거시 plan(.claude/PRPs/plans) 스캔 (LOW#1: enumerate ⊇ derive)', () => {
  // derive sources/plans.js 가 .claude/PRPs/plans top-level 을 *표시*하므로 서버
  // re-enumerate 도 같은 집합을 봐야 한다(item-id 계약). 과거엔 enumerate 가
  // completed/ 만 봐서 top-level 레거시 plan 의 "제외" 버튼이 항상 409 였다.
  const root = mkRepo();
  fs.mkdirSync(path.join(root, '.claude', 'PRPs', 'plans'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude/PRPs/plans/legacy.plan.md'), PLAN);
  const out = enumerate({ repoRoot: root });
  const risks = out.items.filter(
    (i) => i.kind === 'risk' && i.source === '.claude/PRPs/plans/legacy.plan.md');
  assert.equal(risks.length, 1, 'top-level 레거시 plan 의 active risk 가 surface');
  assert.equal(risks[0].text, 'live-risk');
  const oqs = out.items.filter(
    (i) => i.kind === 'oq' && i.source === '.claude/PRPs/plans/legacy.plan.md');
  assert.equal(oqs.length, 1, 'top-level 레거시 plan 의 active OQ 가 surface');
});

test('enumerate — --limit cap + truncated 신호', () => {
  const root = mkRepo();
  fs.writeFileSync(path.join(root, '.claude/plans/a.plan.md'), PLAN);
  fs.writeFileSync(path.join(root, '.claude/prds/p.prd.md'), PRD);
  const out = enumerate({ repoRoot: root, limit: 1 });
  assert.equal(out.items.length, 1);
  assert.equal(out.truncated, true);
  assert.ok(out.total > 1);
});

test('enumerate — fail-open: 디렉토리 부재 시 빈 결과', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-stale-empty-'));
  const out = enumerate({ repoRoot: root });
  assert.deepEqual(out.items, []);
  assert.equal(out.scanned, 0);
});

test('enumerate — loud fail-open: read 실패가 degraded + warnings 신호 채움', () => {
  const root = mkRepo();
  fs.writeFileSync(path.join(root, '.claude/plans/a.plan.md'), PLAN);
  // fsRead 가 plan 파일에서 throw → stderr 뿐 아니라 구조적 degraded 신호도 떠야 한다.
  const fsRead = (p) => { if (p.endsWith('a.plan.md')) throw new Error('boom'); return fs.readFileSync(p, 'utf8'); };
  const out = enumerate({ repoRoot: root, fsRead });
  assert.equal(out.degraded, true, 'read 실패 시 degraded=true');
  assert.equal(out.warnings.length >= 1, true, 'warnings 배열에 사유 누적');
  assert.match(out.warnings[0], /plan read failed/);
});
