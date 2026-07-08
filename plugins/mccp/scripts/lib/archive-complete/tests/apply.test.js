'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { apply, flipStatusInBody, replaceStatusCell, planMove, expectedPlansForPrd } = require('../apply');

const NOW = '2026-07-09T12:00:00.000Z';

// --- git tmp repo fixture ----------------------------------------------------

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function mkGitRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-archive-apply-'));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  fs.mkdirSync(path.join(root, '.claude', 'prds', 'archived'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'PRPs', 'plans', 'archived'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'plans'), { recursive: true });
  return root;
}

function prdBody(name, rows) {
  return [
    `# ${name}`, '',
    '## Delivery Milestones', '',
    '| # | Milestone | Outcome | Status | Plan |',
    '|---|---|---|---|---|',
    ...rows.map((r, i) => `| ${i + 1} | ${r.name} | o | ${r.status} | ${r.plan || '—'} |`),
    '',
  ].join('\n');
}

function planBody(base, sourcePrd) {
  return [`# Plan: ${base}`, '', `**Source PRD**: \`.claude/prds/${sourcePrd}\``, '', '## Summary', 'x', ''].join('\n');
}

function commit(root, msg) { git(root, ['add', '-A']); git(root, ['commit', '-q', '-m', msg]); }
function exists(root, rel) { return fs.existsSync(path.join(root, rel)); }

// --- unit: status flip -------------------------------------------------------

test('replaceStatusCell — status 셀만 surgical replace(다른 셀 보존)', () => {
  const line = '| 4 | 병렬 활성화 | outcome text | pending | — |';
  const out = replaceStatusCell(line, 'complete');
  assert.match(out, /\| complete \|/);
  assert.match(out, /병렬 활성화/);
  assert.match(out, /outcome text/);
  assert.doesNotMatch(out, /pending/);
});

test('flipStatusInBody — escaped-pipe 셀 보존', () => {
  const body = prdBody('P', [{ name: 'M1', status: 'pending' }]);
  const withPipe = body.replace('| M1 | o |', '| M1 | a \\| b |');
  const res = flipStatusInBody(withPipe, 'M1', 'complete');
  assert.equal(res.ok, true);
  assert.match(res.body, /a \\\| b/); // escaped pipe intact
  assert.match(res.body, /\| complete \|/);
});

test('flipStatusInBody — 없는 milestone 은 fail', () => {
  const res = flipStatusInBody(prdBody('P', [{ name: 'M1', status: 'pending' }]), 'NOPE', 'complete');
  assert.equal(res.ok, false);
});

// --- apply: successful archive ----------------------------------------------

test('apply — all-complete PRD + plans 아카이브(이동 + journal + git history 보존)', () => {
  const root = mkGitRepo();
  fs.writeFileSync(path.join(root, '.claude', 'prds', 'done.prd.md'),
    prdBody('done', [{ name: 'M1', status: 'complete', plan: '`.claude/plans/done-m1.plan.md`' }]));
  fs.writeFileSync(path.join(root, '.claude', 'plans', 'done-m1.plan.md'), planBody('done-m1', 'done.prd.md'));
  commit(root, 'seed');

  const res = apply({
    repoRoot: root, now: NOW,
    archives: [{ prdPath: '.claude/prds/done.prd.md', planPaths: ['.claude/plans/done-m1.plan.md'] }],
  });

  assert.equal(res.aborted, false);
  assert.equal(res.moved.length, 2);
  // active 위치 비었고 archived 위치에 존재
  assert.equal(exists(root, '.claude/prds/done.prd.md'), false);
  assert.equal(exists(root, '.claude/prds/archived/done.prd.md'), true);
  assert.equal(exists(root, '.claude/plans/done-m1.plan.md'), false);
  assert.equal(exists(root, '.claude/PRPs/plans/archived/done-m1.plan.md'), true);
  // journal 기록
  assert.ok(res.journalPath);
  assert.equal(exists(root, res.journalPath), true);
  const journal = JSON.parse(fs.readFileSync(path.join(root, res.journalPath), 'utf8'));
  assert.equal(journal.schema_version, 'v1');
  assert.equal(journal.archives.length, 1);
  // git mv history 보존 — --follow 가 seed 커밋을 추적
  commit(root, 'archive');
  const log = git(root, ['log', '--oneline', '--follow', '--', '.claude/prds/archived/done.prd.md']);
  assert.match(log, /seed/);
});

// --- apply: atomic rollback (Codex F2) ---------------------------------------

test('apply — git mv 중간 실패 주입 → 전량 rollback(부분 상태 0)', () => {
  const root = mkGitRepo();
  fs.writeFileSync(path.join(root, '.claude', 'prds', 'wo.prd.md'),
    prdBody('wo', [
      { name: 'M1', status: 'complete', plan: '`.claude/plans/wo-m1.plan.md`' },
      { name: 'M2', status: 'complete', plan: '`.claude/plans/wo-m2.plan.md`' },
    ]));
  fs.writeFileSync(path.join(root, '.claude', 'plans', 'wo-m1.plan.md'), planBody('wo-m1', 'wo.prd.md'));
  fs.writeFileSync(path.join(root, '.claude', 'plans', 'wo-m2.plan.md'), planBody('wo-m2', 'wo.prd.md'));
  commit(root, 'seed');

  const realMv = (src, dest) => git(root, ['mv', src, dest]);
  // 첫 plan(wo-m1) 이동에서 실패 주입 — 그 앞의 PRD 이동은 성공해 rollback 대상이 됨.
  const injected = (src, dest, r) => {
    if (String(src).endsWith('wo-m1.plan.md')) throw new Error('injected git mv failure');
    return realMv(src, dest, r);
  };

  const res = apply({
    repoRoot: root, now: NOW, gitMv: injected,
    archives: [{ prdPath: '.claude/prds/wo.prd.md', planPaths: ['.claude/plans/wo-m1.plan.md', '.claude/plans/wo-m2.plan.md'] }],
  });

  assert.equal(res.aborted, true);
  assert.equal(res.rolledBack, true);
  assert.equal(res.moved.length, 0);
  // 부분 상태 0 — PRD 는 active 로 원복, plan 들 active 유지, archived 비어있음
  assert.equal(exists(root, '.claude/prds/wo.prd.md'), true, 'PRD rolled back to active');
  assert.equal(exists(root, '.claude/prds/archived/wo.prd.md'), false, 'no archived PRD leftover');
  assert.equal(exists(root, '.claude/plans/wo-m1.plan.md'), true);
  assert.equal(exists(root, '.claude/plans/wo-m2.plan.md'), true);
  assert.equal(exists(root, '.claude/PRPs/plans/archived/wo-m1.plan.md'), false);
  assert.equal(exists(root, '.claude/PRPs/plans/archived/wo-m2.plan.md'), false);
});

// --- apply: C2 solo-move rejection -------------------------------------------

test('apply — 활성 plan 누락 시 C2 위반으로 preflight abort(mutation 0)', () => {
  const root = mkGitRepo();
  fs.writeFileSync(path.join(root, '.claude', 'prds', 'wo.prd.md'),
    prdBody('wo', [{ name: 'M1', status: 'complete', plan: '`.claude/plans/wo-m1.plan.md`' }]));
  fs.writeFileSync(path.join(root, '.claude', 'plans', 'wo-m1.plan.md'), planBody('wo-m1', 'wo.prd.md'));
  fs.writeFileSync(path.join(root, '.claude', 'plans', 'wo-m2.plan.md'), planBody('wo-m2', 'wo.prd.md'));
  commit(root, 'seed');

  // wo-m2 는 wo.prd.md 를 가리키는 활성 plan 인데 planPaths 에서 누락 → C2 위반.
  const res = apply({
    repoRoot: root, now: NOW,
    archives: [{ prdPath: '.claude/prds/wo.prd.md', planPaths: ['.claude/plans/wo-m1.plan.md'] }],
  });
  assert.equal(res.aborted, true);
  assert.equal(res.moved.length, 0);
  assert.match(JSON.stringify(res.errors), /C2 violation/);
  // 아무것도 안 옮겨짐
  assert.equal(exists(root, '.claude/prds/wo.prd.md'), true);
  assert.equal(exists(root, '.claude/plans/wo-m1.plan.md'), true);
});

// --- apply: non-archivable rejection -----------------------------------------

test('apply — pending 남은 PRD 는 archivable=false 로 abort(C2, 0 mutation)', () => {
  const root = mkGitRepo();
  fs.writeFileSync(path.join(root, '.claude', 'prds', 'wo.prd.md'),
    prdBody('wo', [{ name: 'M1', status: 'complete' }, { name: 'M2', status: 'pending' }]));
  commit(root, 'seed');
  const res = apply({
    repoRoot: root, now: NOW,
    archives: [{ prdPath: '.claude/prds/wo.prd.md', planPaths: [] }],
  });
  assert.equal(res.aborted, true);
  assert.match(JSON.stringify(res.errors), /not archivable/);
  assert.equal(exists(root, '.claude/prds/wo.prd.md'), true);
});

// --- apply: CAS mismatch -----------------------------------------------------

test('apply — status flip CAS 불일치(외부 편집) → abort, 정정 미적용', () => {
  const root = mkGitRepo();
  const prdRel = '.claude/prds/active.prd.md';
  const abs = path.join(root, prdRel);
  fs.writeFileSync(abs, prdBody('active', [{ name: 'M1', status: 'pending' }]));
  commit(root, 'seed');

  const res = apply({
    repoRoot: root, now: NOW,
    statusCorrections: [{ prdPath: prdRel, milestoneName: 'M1', newStatus: 'complete', reason: 'shipped' }],
    archives: [],
    // preflight 이후·write 이전 파일을 외부 편집해 CAS 를 깬다.
    onBeforeApply: () => { fs.appendFileSync(abs, '\n<!--external edit-->\n'); },
  });
  assert.equal(res.aborted, true);
  assert.match(JSON.stringify(res.errors), /CAS mismatch/);
  // 정정이 적용되지 않아 M1 은 여전히 pending
  const after = fs.readFileSync(abs, 'utf8');
  assert.match(after, /\| M1 \| o \| pending \|/);
});

// --- apply: idempotent re-run ------------------------------------------------

test('apply — 이미 아카이브된 PRD(source 부재·dest 존재) 재실행은 already-archived skip', () => {
  const root = mkGitRepo();
  fs.writeFileSync(path.join(root, '.claude', 'prds', 'archived', 'done.prd.md'),
    prdBody('done', [{ name: 'M1', status: 'complete' }]));
  commit(root, 'seed');
  const res = apply({
    repoRoot: root, now: NOW,
    archives: [{ prdPath: '.claude/prds/done.prd.md', planPaths: [] }],
  });
  assert.equal(res.aborted, false);
  assert.equal(res.moved.length, 0);
  assert.equal(res.skipped.length, 1);
  assert.equal(res.skipped[0].reason, 'already-archived');
});

// --- apply: collision → legacy -----------------------------------------------

test('apply — dest 충돌(내용 상이) 시 <name>.legacy.md 로 보존(데이터 손실 0)', () => {
  const root = mkGitRepo();
  // archived 에 같은 basename 이지만 다른 내용이 이미 존재
  fs.writeFileSync(path.join(root, '.claude', 'prds', 'archived', 'dup.prd.md'), '# OLD archived content\n');
  fs.writeFileSync(path.join(root, '.claude', 'prds', 'dup.prd.md'),
    prdBody('dup', [{ name: 'M1', status: 'complete' }]));
  commit(root, 'seed');
  const res = apply({
    repoRoot: root, now: NOW,
    archives: [{ prdPath: '.claude/prds/dup.prd.md', planPaths: [] }],
  });
  assert.equal(res.aborted, false);
  // 기존 archived 내용 보존 + 신규는 .legacy 로
  assert.equal(fs.readFileSync(path.join(root, '.claude/prds/archived/dup.prd.md'), 'utf8'), '# OLD archived content\n');
  assert.equal(exists(root, '.claude/prds/archived/dup.legacy.prd.md'), true);
  assert.equal(exists(root, '.claude/prds/dup.prd.md'), false);
});
