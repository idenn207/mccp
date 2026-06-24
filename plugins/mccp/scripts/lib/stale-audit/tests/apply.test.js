'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { apply, verifyIntact, flipMilestoneStatus } = require('../apply');
const { parseRisks, parseOpenQuestions } = require('../../renderer/parsers/plan-body');
const { isResolved } = require('../../renderer/parsers/resolution-marker');

const NOW = '2026-06-25T12:00:00.000Z';

function mkPlan(body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-stale-apply-'));
  fs.mkdirSync(path.join(root, '.claude', 'plans'), { recursive: true });
  const rel = '.claude/plans/a.plan.md';
  fs.writeFileSync(path.join(root, rel), body);
  return { root, rel, abs: path.join(root, rel) };
}

const PLAN = [
  '# Plan',
  '',
  '## Open Questions',
  '',
  '- [ ] live-q: 미해결 질문',
  '',
  '## Risks',
  '',
  '| Risk | Likelihood | Impact | Mitigation |',
  '| --- | --- | --- | --- |',
  '| risk-one | High | High | mit1 |',
  '| risk-two | Low | Low | mit2 |',
  '',
].join('\n');

test('apply — OQ 체크 + 행끝 마커 + 표 재-parse 무손상', () => {
  const { root, rel, abs } = mkPlan(PLAN);
  const lines = PLAN.split('\n');
  const oqLine = lines.findIndex((l) => l.includes('live-q')) + 1;
  const res = apply({
    repoRoot: root, now: NOW,
    refs: [{ kind: 'oq', source: rel, lineNumber: oqLine, text: 'live-q: 미해결 질문', reason: '구조가 바뀌어 더 이상 필요 없음' }],
  });
  assert.equal(res.applied.length, 1);
  const after = fs.readFileSync(abs, 'utf8');
  const afterLines = after.split('\n');
  assert.match(afterLines[oqLine - 1], /- \[x\] live-q/);
  assert.match(afterLines[oqLine - 1], /<!--mccp:resolved reason="구조가 바뀌어 더 이상 필요 없음" at="2026-06-25T12:00:00.000Z"-->\s*$/);
  // 재-parse: OQ 가 resolved 로 인식 + 표 무손상.
  const oq = parseOpenQuestions(after);
  assert.equal(oq[0].resolved, true);
  assert.equal(parseRisks(after).rows.length, 2);
});

test('apply — risk 행끝 마커(최종 | 뒤) + 셀 무손상', () => {
  const { root, rel, abs } = mkPlan(PLAN);
  const res = apply({
    repoRoot: root, now: NOW,
    refs: [{ kind: 'risk', source: rel, ordinal: 0, text: 'risk-one', reason: '완화책이 이미 구현되어 위험 해소됨' }],
  });
  assert.equal(res.applied.length, 1);
  const after = fs.readFileSync(abs, 'utf8');
  const { rows } = parseRisks(after);
  assert.equal(rows.length, 2, '표 행 수 무손상');
  const one = rows.find((r) => r.risk === 'risk-one');
  assert.equal(one.resolved, true);
  assert.equal(one.mitigation, 'mit1', 'mitigation 셀 무손상(phantom 셀 0)');
  const two = rows.find((r) => r.risk === 'risk-two');
  assert.equal(two.resolved, false, '다른 행 미변경');
});

test('apply — idempotent: 재실행 시 no-op(이미 마커)', () => {
  const { root, rel, abs } = mkPlan(PLAN);
  const ref = { kind: 'risk', source: rel, ordinal: 0, text: 'risk-one', reason: '완화책이 이미 구현되어 위험 해소됨' };
  apply({ repoRoot: root, now: NOW, refs: [ref] });
  const firstPass = fs.readFileSync(abs, 'utf8');
  const res2 = apply({ repoRoot: root, now: NOW, refs: [ref] });
  assert.equal(res2.applied.length, 0, '두 번째는 적용 0');
  assert.equal(res2.skipped.length, 1);
  assert.match(res2.skipped[0].reason, /idempotent/);
  assert.equal(fs.readFileSync(abs, 'utf8'), firstPass, '파일 무변경');
});

test('apply — 오매칭(text mismatch) 시 skip + 편집 안 함', () => {
  const { root, rel, abs } = mkPlan(PLAN);
  const before = fs.readFileSync(abs, 'utf8');
  const res = apply({
    repoRoot: root, now: NOW,
    refs: [{ kind: 'risk', source: rel, ordinal: 0, text: 'WRONG TEXT drift', reason: '근거 충분한 사유 텍스트' }],
  });
  assert.equal(res.applied.length, 0);
  assert.match(res.skipped[0].reason, /text mismatch/);
  assert.equal(fs.readFileSync(abs, 'utf8'), before, '오매칭 시 파일 무변경');
});

test('apply — reason 특수문자 escape (|/"/-->) + 마커 well-formed', () => {
  const { root, rel, abs } = mkPlan(PLAN);
  apply({
    repoRoot: root, now: NOW,
    refs: [{ kind: 'risk', source: rel, ordinal: 1, text: 'risk-two', reason: 'pipe | quote " close --> 모두 포함된 사유' }],
  });
  const after = fs.readFileSync(abs, 'utf8');
  const { rows } = parseRisks(after);
  // 표 무손상 + resolved + reason 에 위험 문자 없음.
  assert.equal(rows.length, 2);
  const two = rows.find((r) => r.risk === 'risk-two');
  assert.equal(two.resolved, true);
  assert.equal(two.resolvedMeta.reason.indexOf('|'), -1);
  assert.equal(two.resolvedMeta.reason.indexOf('"'), -1);
  assert.equal(two.resolvedMeta.reason.indexOf('-->'), -1);
});

test('apply — 파일당 batch: 같은 파일 여러 ref 1 트랜잭션', () => {
  const { root, rel, abs } = mkPlan(PLAN);
  const lines = PLAN.split('\n');
  const oqLine = lines.findIndex((l) => l.includes('live-q')) + 1;
  const res = apply({
    repoRoot: root, now: NOW,
    refs: [
      { kind: 'oq', source: rel, lineNumber: oqLine, text: 'live-q: 미해결 질문', reason: '구조 변경으로 해소된 질문' },
      { kind: 'risk', source: rel, ordinal: 0, text: 'risk-one', reason: '완화책 구현 완료로 해소' },
      { kind: 'risk', source: rel, ordinal: 1, text: 'risk-two', reason: '더 이상 해당 경로 없음' },
    ],
  });
  assert.equal(res.applied.length, 3);
  assert.equal(res.files.length, 1, '단일 파일 트랜잭션');
  const after = fs.readFileSync(abs, 'utf8');
  const { rows } = parseRisks(after);
  assert.equal(rows.filter((r) => r.resolved).length, 2);
  assert.equal(parseOpenQuestions(after)[0].resolved, true);
});

test('apply — content-hash mismatch 시 abort (lost-update 방지, Codex F3)', () => {
  const { root, rel } = mkPlan(PLAN);
  let call = 0;
  // 1st read(초기) → PLAN, 2nd read(CAS) → 변경된 내용 → hash mismatch → abort.
  const fsRead = () => { call += 1; return call === 1 ? PLAN : PLAN + '\n외부 동시 편집\n'; };
  const res = apply({
    repoRoot: root, now: NOW, fsRead,
    refs: [{ kind: 'risk', source: rel, ordinal: 0, text: 'risk-one', reason: '근거 충분한 사유 텍스트입니다' }],
  });
  assert.equal(res.applied.length, 0, 'abort 시 applied 0');
  assert.equal(res.aborted.includes(rel), true);
  assert.ok(res.errors.some((e) => /content-hash mismatch/.test(e.error)));
});

test('apply — lock 선점 시 fail-closed: write 0 + aborted (Codex M3-b F4)', () => {
  const { root, rel, abs } = mkPlan(PLAN);
  const before = fs.readFileSync(abs, 'utf8');
  // 다른 holder 가 lock 점유 중인 상태를 모사 — apply 가 획득 실패해야 한다.
  fs.writeFileSync(abs + '.audit-lock', String(process.pid + 1) + '\n' + NOW);
  const res = apply({
    repoRoot: root, now: NOW, lockMaxRetries: 0,
    refs: [{ kind: 'risk', source: rel, ordinal: 0, text: 'risk-one', reason: '근거 충분한 사유 텍스트입니다' }],
  });
  assert.equal(res.applied.length, 0, 'lock 미획득 → applied 0');
  assert.equal(res.aborted.includes(rel), true, 'aborted 로 surface');
  assert.ok(res.errors.some((e) => /lock acquire failed/.test(e.error)), 'fail-closed 사유');
  assert.equal(fs.readFileSync(abs, 'utf8'), before, '파일 무변경(write 0)');
  fs.unlinkSync(abs + '.audit-lock');
});

test('apply — milestone status flip (in-progress → complete) + 표 무손상', () => {
  const PRD = [
    '# PRD',
    '',
    '## Delivery Milestones',
    '',
    '| # | Milestone | Outcome | Status | Plan |',
    '| --- | --- | --- | --- | --- |',
    '| 1 | Stale MS | o | in-progress | — |',
    '',
  ].join('\n');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-stale-ms-'));
  fs.mkdirSync(path.join(root, '.claude', 'prds'), { recursive: true });
  const rel = '.claude/prds/p.prd.md';
  fs.writeFileSync(path.join(root, rel), PRD);
  const res = apply({
    repoRoot: root, now: NOW,
    refs: [{ kind: 'milestone', source: rel, name: 'Stale MS', newStatus: 'complete', reason: '이미 ship 되어 완료 처리' }],
  });
  assert.equal(res.applied.length, 1);
  const after = fs.readFileSync(path.join(root, rel), 'utf8');
  const { parseDeliveryMilestonesLifecycle } = require('../../renderer/parsers/plan-body');
  // in-progress → complete: lifecycle(pending/dropped) 에 안 잡힘 + 표 무손상.
  assert.match(after, /\| Stale MS \| o \| complete \|/);
  assert.equal(parseDeliveryMilestonesLifecycle(after).length, 0);
});

test('verifyIntact — 행 수 drift 시 rollback 신호', () => {
  const before = { risks: { rows: [1, 2], malformedCount: 0 }, oq: [1], ms: new Map([['a', 'x']]) };
  const afterOk = { risks: { rows: [1, 2], malformedCount: 0 }, oq: [1], ms: new Map([['a', 'y']]) };
  assert.equal(verifyIntact(before, afterOk).ok, true, '상태만 바뀌면 ok');
  const afterBad = { risks: { rows: [1], malformedCount: 0 }, oq: [1], ms: new Map([['a', 'x']]) };
  assert.equal(verifyIntact(before, afterBad).ok, false, 'risk 행 수 drift → rollback');
  const afterMalformed = { risks: { rows: [1, 2], malformedCount: 1 }, oq: [1], ms: new Map([['a', 'x']]) };
  assert.equal(verifyIntact(before, afterMalformed).ok, false, 'malformed 증가 → rollback');
});

test('flipMilestoneStatus — status 셀만 교체', () => {
  const line = '| 1 | Name | out | in-progress | — |';
  assert.equal(flipMilestoneStatus(line, 'complete'), '| 1 | Name | out | complete | — |');
});

test('apply — malformed(>4셀) 행 있어도 ordinal 정합 (locate↔parseRisks parity)', () => {
  // 두 번째 행이 embedded |로 5셀 → parseRisks malformed skip. ordinal 1(post-filter)
  // = "ord1-real". locate가 raw 행을 세면 off-by-one 으로 malformed 행을 가리켜 mismatch.
  const PLAN = [
    '# Plan', '', '## Risks', '',
    '| Risk | Likelihood | Impact | Mitigation |',
    '| --- | --- | --- | --- |',
    '| ord0-real | High | High | m0 |',
    '| malformed | a | b | c | extra-pipe |',
    '| ord1-real | Low | Low | m1 |',
    '',
  ].join('\n');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-stale-drift-'));
  fs.mkdirSync(path.join(root, '.claude', 'plans'), { recursive: true });
  const rel = '.claude/plans/d.plan.md';
  const abs = path.join(root, rel);
  fs.writeFileSync(abs, PLAN);
  const { rows } = parseRisks(PLAN);
  assert.equal(rows.length, 2, 'malformed 행 제외');
  assert.equal(rows[1].risk, 'ord1-real');
  // ordinal 1 마킹 → ord1-real 행에 정확히 적용(malformed 행 아님).
  const res = apply({
    repoRoot: root, now: NOW,
    refs: [{ kind: 'risk', source: rel, ordinal: 1, text: 'ord1-real', reason: '근거 충분한 사유 텍스트입니다' }],
  });
  assert.equal(res.applied.length, 1, 'ordinal 정합으로 적용 성공(off-by-one 0)');
  const after = fs.readFileSync(abs, 'utf8').split('\n');
  const ord1Line = after.find((l) => l.includes('ord1-real'));
  assert.match(ord1Line, /<!--mccp:resolved/, 'ord1-real 행이 마킹됨');
  assert.equal(/<!--mccp:resolved/.test(after.find((l) => l.includes('malformed'))), false, 'malformed 행 미변경');
});
