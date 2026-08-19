'use strict';

// review-loop-bypass M2 — backlog 적재 오라클 + CLI 배선.
//
// 이 파일이 덮는 축은 셋이고, 각각이 나머지를 대신하지 못한다:
//
//   1. 순수 오라클 — 행 파생 · 이스케이프 · digest 멱등 · 경로 정규화.
//   2. **소비자 왕복** — 적재한 행을 `derive/sources/backlog.js`가 실제로
//      되읽는가. 그 파서는 셀 수가 모자란 행을 조용히 `continue`로 버리므로
//      (`backlog.js:36-40`), "append가 예외를 안 던졌다"는 그 행이 읽힌다는
//      증거가 아니다.
//   3. **CLI 계층을 실제로 spawn** — 순수 함수 단위 test는 배선의 정확성을
//      말해 주지 않는다. `decision.json`을 읽고 · 행을 파생하고 ·
//      `backlog.json`을 쓰고 · 정확한 종료코드를 내는지는 프로세스를 띄워야
//      확인된다. help 텍스트 grep은 명령이 존재한다는 것조차 증명하지 않는다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const backlogAppend = require('../plan-review/backlog-append');
const { buildReviewRecord } = require('../plan-review/record');
const { scanBacklog } = require('../../derive/sources/backlog');

const CLI = path.join(__dirname, '..', 'plan-review', 'cli.js');

const HEADER = [
  '# Codex Findings Backlog (defer-to-later)',
  '',
  'Append-only log.',
  '',
  '| Date | Severity | Source plan | Finding |',
  '|---|---|---|---|',
  '| 2026-01-01 | LOW | .claude/plans/seed.plan.md | seed row |',
  '',
].join('\n');

const REVIEWED_HASH = 'sha256:' + 'a'.repeat(64);

function makeDecision(findings, extra) {
  return Object.assign({
    review_verdict: 'divergent',
    review_source: 'multi-agent',
    review_proof: {
      layers: { l1: 'converged', l2: 'divergent', l3: null },
      reviewed_plan_hash: REVIEWED_HASH,
    },
    block: false,
    single_pass_reason: 'deadline_pressure',
    quorum: { passed: false, blockingFindings: findings },
  }, extra || {});
}

// 임시 저장소. `realpathSync`로 정규화하는 이유는 Windows tmp가 8.3 short
// name(`SKYPAR~1`)으로 오고, CLI가 realpath로 containment를 판정하기 때문이다.
function makeRepo(opts) {
  const o = opts || {};
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-backlog-')));
  fs.mkdirSync(path.join(root, '.claude', 'plans'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'state', 'plan-review'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'reviews'), { recursive: true });
  if (o.backlogBody !== null) {
    fs.writeFileSync(path.join(root, '.claude', 'plans', 'codex-findings-backlog.md'),
      o.backlogBody === undefined ? HEADER : o.backlogBody, 'utf8');
  }
  fs.writeFileSync(path.join(root, '.claude', 'plans', 'x.plan.md'), '# Plan\n', 'utf8');
  if (o.decision !== undefined && o.decision !== null) {
    fs.writeFileSync(path.join(root, '.claude', 'state', 'plan-review', 'decision.json'),
      JSON.stringify(o.decision, null, 2), 'utf8');
  }
  if (o.l2 !== undefined) {
    fs.writeFileSync(path.join(root, '.claude', 'state', 'plan-review', 'l2.json'),
      JSON.stringify(o.l2, null, 2), 'utf8');
  }
  return root;
}

function readBacklog(root) {
  return fs.readFileSync(path.join(root, '.claude', 'plans', 'codex-findings-backlog.md'), 'utf8');
}

function dataRowCount(body) {
  const lines = body.split(/\r?\n/);
  const h = lines.findIndex((l) => backlogAppend.HEADER_RE.test(l));
  if (h === -1) return 0;
  return lines.slice(h + 1).filter((l) => l.trim().startsWith('|') && !/^\|\s*-+\s*\|/.test(l)).length;
}

function runCli(root, args) {
  return spawnSync(process.execPath, [CLI].concat(args), {
    encoding: 'utf8',
    cwd: root,
    env: Object.assign({}, process.env, { MCCP_REVIEW_SINGLE_PASS: '' }),
  });
}

// ── Task 1: 순수 오라클 ───────────────────────────────────────────────────────

test('토글이 적용되지 않은 decision은 행을 0개 낸다', () => {
  const decision = makeDecision([{ perspective: 'test', claim: 'x', severity: 'HIGH' }]);
  delete decision.single_pass_reason;
  const rows = backlogAppend.deriveBacklogRows({
    decision: decision, planPath: '.claude/plans/x.plan.md', slug: 'x', today: '2026-08-19', repoRoot: '/repo',
  });
  assert.equal(rows.length, 0,
    '토글이 꺼진 실행의 지적은 원래의 비수렴 HALT로 저자가 흡수한다 — 적재 대상이 아니다');
});

test('reviewed_plan_hash 부재는 throw다 (추론하지 않는다 — DD3)', () => {
  const decision = makeDecision([{ perspective: 'test', claim: 'x', severity: 'HIGH' }]);
  decision.review_proof = { layers: {} };
  assert.throws(() => backlogAppend.deriveBacklogRows({
    decision: decision, planPath: 'p', slug: 'x', today: '2026-08-19', repoRoot: '/repo',
  }), /reviewed_plan_hash is absent/);
});

test('blockingFindings가 배열이 아니면 throw다', () => {
  const decision = makeDecision(null);
  assert.throws(() => backlogAppend.deriveBacklogRows({
    decision: decision, planPath: 'p', slug: 'x', today: '2026-08-19', repoRoot: '/repo',
  }), /blockingFindings is not an array/);
});

test('UNKNOWN·FAIL severity도 적재한다 — 적재는 판정이 아니다 (DD2)', () => {
  const rows = backlogAppend.deriveBacklogRows({
    decision: makeDecision([
      { perspective: 'security', claim: 'a', severity: 'UNKNOWN' },
      { perspective: 'test', claim: 'reviewer returned verdict=fail', severity: 'FAIL' },
      { perspective: 'invariant', claim: 'c', severity: 'CRITICAL' },
    ]),
    planPath: '.claude/plans/x.plan.md', slug: 'x', today: '2026-08-19', repoRoot: '/repo',
  });
  assert.deepEqual(rows.map((r) => r.severity), ['UNKNOWN', 'FAIL', 'CRITICAL']);
});

test('claim이 문자열이 아니어도 행을 만든다 (판독 불가는 기록할 사실이다)', () => {
  const rows = backlogAppend.deriveBacklogRows({
    decision: makeDecision([{ perspective: 'test', claim: null, severity: 'HIGH' }]),
    planPath: '.claude/plans/x.plan.md', slug: 'x', today: '2026-08-19', repoRoot: '/repo',
  });
  assert.equal(rows.length, 1);
  assert.match(rows[0].finding_cell, /판독 불가/);
});

test('절대경로 planPath는 repo-relative로 정규화된다 (E7 — security R5 F2)', () => {
  const root = process.platform === 'win32' ? 'C:\\repo' : '/repo';
  const abs = path.join(root, '.claude', 'plans', 'x.plan.md');
  const rows = backlogAppend.deriveBacklogRows({
    decision: makeDecision([{ perspective: 'test', claim: 'a', severity: 'HIGH' }]),
    planPath: abs, slug: 'x', today: '2026-08-19', repoRoot: root,
  });
  assert.equal(rows[0].plan_path, '.claude/plans/x.plan.md',
    '절대경로를 그대로 실으면 작업트리 경로가 git-tracked 원장에 커밋된다');
  assert.equal(rows[0].plan_path.indexOf(path.sep === '\\' ? '\\' : '\u0000'), -1,
    '구분자는 항상 / 로 통일된다 (Windows 백슬래시가 커밋되면 안 된다)');
});

test('repo 밖 경로는 절대경로 대신 자리표시자로 떨어진다', () => {
  const root = process.platform === 'win32' ? 'C:\\repo' : '/repo';
  assert.equal(backlogAppend.normalizeRepoPath(path.join(root, '..', 'elsewhere', 'x.md'), root),
    backlogAppend.OUTSIDE_REPO);
  assert.equal(backlogAppend.normalizeRepoPath('../../etc/passwd', root),
    backlogAppend.OUTSIDE_REPO);
});

test('escapeCell — 파이프·개행·bare CR이 셀을 찢지 못한다', () => {
  const out = backlogAppend.escapeCell('a | b\nc\rd\r\ne');
  assert.equal(out.indexOf('|'), -1, '리터럴 파이프가 남으면 소비자 split이 셀을 늘린다');
  assert.match(out, /&#124;/);
  assert.equal(/[\r\n]/.test(out), false, 'bare CR도 접혀야 한다');
});

test('escapeCell — & 를 먼저 이스케이프해 자기 엔티티를 이중 처리하지 않는다', () => {
  const out = backlogAppend.escapeCell('x & y | z');
  assert.match(out, /x &amp; y &#124; z/,
    '입력의 &는 &amp;가 되고, 생성한 &#124;의 &는 그대로여야 한다');
});

test('escapeCell — claim 안의 id= 는 무력화된다 (멱등 스캔 오염 방지)', () => {
  const out = backlogAppend.escapeCell('see id=deadbeef for context');
  assert.equal(out.indexOf('id='), -1);
  assert.match(out, /id&#61;deadbeef/);
});

// 고아 서로게이트는 JS 문자열 안에서는 U+FFFD가 **아니다** — utf8로 인코딩될 때
// 비로소 치환된다. 그래서 왕복으로 잰다: 파일에 쓰이는 바이트가 원래 문자열로
// 되돌아오지 않으면 그 출력은 원장에 U+FFFD를 남긴다.
function hasLoneSurrogate(str) {
  return Buffer.from(str, 'utf8').toString('utf8') !== str;
}

test('escapeCell — 절단이 서로게이트 쌍을 깨지 않는다 (절단면 전 구간)', () => {
  const emoji = '\u{1F600}';
  // 쌍의 위치를 절단면 앞뒤로 쓸어 본다. 한 정렬만 재면 가드가 한 칸 어긋나도
  // 통과한다 — CELL_MAX-1은 가드가 불필요하게 발화하는 무해한 정렬이고, 실제
  // 파손은 쌍이 CELL_MAX-2/CELL_MAX-1에 걸칠 때 일어난다.
  for (let pad = backlogAppend.CELL_MAX - 4; pad <= backlogAppend.CELL_MAX + 1; pad++) {
    const out = backlogAppend.escapeCell('x'.repeat(pad) + emoji + 'tail');
    assert.equal(hasLoneSurrogate(out), false,
      'pad=' + pad + ' 에서 고아 서로게이트가 남았다 — 원장에 U+FFFD로 기록된다');
    assert.ok(out.length <= backlogAppend.CELL_MAX, 'pad=' + pad + ' 길이 상한');
  }
});

test('escapeCell — id= 무력화가 원문 대소문자를 바꾸지 않는다', () => {
  const out = backlogAppend.escapeCell('session ID=abc and Id=def and id=ghi');
  assert.match(out, /ID&#61;abc/, '대문자 원문이 소문자로 기록되면 증거가 원문과 달라진다');
  assert.match(out, /Id&#61;def/);
  assert.match(out, /id&#61;ghi/);
  assert.equal(/id=/i.test(out), false, '무력화 자체는 유지돼야 한다');
});

test('renderRow — severity·date·경로 셀도 이스케이프된다 (4열 불변)', () => {
  // severity는 리뷰어 산출물에서 오는 값이다. 현재는 quorum.js의 normalizeSeverity가
  // enum을 닫아 파이프가 도달하지 못하지만, 그 닫힘은 이 모듈 밖의 사정이므로
  // 여기서 계약으로 삼지 않는다 — 한 셀만 지키는 방어는 네 칸을 지키지 못한다.
  const rows = backlogAppend.deriveBacklogRows({
    decision: makeDecision([{
      perspective: 'security',
      claim: 'benign',
      severity: 'HIGH | injected\n| 2026-01-01 | LOW | forged.md | forged row',
    }]),
    planPath: '.claude/plans/x.plan.md', slug: 'x', today: '2026-08-19', repoRoot: '/repo',
  });
  const line = backlogAppend.renderRow(rows[0]);
  assert.equal(line.split('\n').length, 1, '개행이 셀을 빠져나가면 위조 행이 원장에 들어간다');
  assert.equal(line.split('|').length - 1, 5, '4열 = 파이프 5개');
  assert.match(line, /&#124;/, '리터럴 파이프는 수치 참조로 치환돼야 한다');
});

test('왕복 — severity에 실린 파이프·개행도 소비자가 4열로 되읽는다', () => {
  const root = makeRepo({ backlogBody: undefined });
  backlogAppend.appendRows({
    repoRoot: root,
    rows: backlogAppend.deriveBacklogRows({
      decision: makeDecision([{
        perspective: 'test',
        claim: 'c',
        severity: 'HIGH | x\n| 2026-01-01 | LOW | f.md | forged',
      }]),
      planPath: '.claude/plans/x.plan.md', slug: 'x', today: '2026-08-19', repoRoot: root,
    }),
  });
  const scan = scanBacklog(root);
  assert.equal(scan.count, 2, 'seed 1행 + 신규 1행 — 위조 행이 늘어나면 안 된다');
  assert.equal(dataRowCount(readBacklog(root)), 2);
  fs.rmSync(root, { recursive: true, force: true });
});

test('빈 today는 throw다 — 소비자가 버리는 행은 적재가 아니다', () => {
  // derive/sources/backlog.js:43이 date가 빈 행을 조용히 버리므로, 허용하면
  // 파일에는 있으나 어느 소비자도 읽지 못하는 행이 된다.
  assert.throws(() => backlogAppend.deriveBacklogRows({
    decision: makeDecision([{ perspective: 'test', claim: 'a', severity: 'HIGH' }]),
    planPath: 'p', slug: 'x', repoRoot: '/repo',
  }), /today is absent/);
});

test('빈 today라도 토글이 꺼진 실행은 throw하지 않는다 (적재 대상이 없다)', () => {
  const decision = makeDecision([{ perspective: 'test', claim: 'a', severity: 'HIGH' }]);
  delete decision.single_pass_reason;
  assert.deepEqual(backlogAppend.deriveBacklogRows({
    decision: decision, planPath: 'p', slug: 'x', repoRoot: '/repo',
  }), []);
});

test('자리표시자는 꺾쇠를 쓰지 않는다 (GFM이 태그로 삼켜 셀이 빈 칸이 된다)', () => {
  assert.equal(/[<>]/.test(backlogAppend.OUTSIDE_REPO), false, backlogAppend.OUTSIDE_REPO);
});

test('한 실행 안의 동일 digest는 한 번만 적재된다', () => {
  const root = makeRepo({ backlogBody: undefined });
  const dup = { perspective: 'test', claim: 'same finding twice', severity: 'HIGH' };
  const rows = backlogAppend.deriveBacklogRows({
    decision: makeDecision([dup, Object.assign({}, dup)]),
    planPath: '.claude/plans/x.plan.md', slug: 'x', today: '2026-08-19', repoRoot: root,
  });
  assert.equal(rows[0].digest, rows[1].digest, '전제: 두 항목의 digest가 같다');
  const res = backlogAppend.appendRows({ repoRoot: root, rows: rows });
  assert.equal(res.appended, 1);
  assert.equal(res.skipped_duplicate, 1);
  assert.equal(dataRowCount(readBacklog(root)), 2, 'seed 1행 + 신규 1행');
  fs.rmSync(root, { recursive: true, force: true });
});

test('escapeCell — 절단은 이스케이프 이전에 일어나 미완성 엔티티를 남기지 않다', () => {
  const claim = 'y'.repeat(backlogAppend.CELL_MAX - 2) + '|zzzz';
  const out = backlogAppend.escapeCell(claim);
  assert.equal(/&#?\w*$/.test(out.replace(/&#124;/g, '')), false,
    '잘린 꼬리에 미완성 수치 참조가 남으면 안 된다');
});

test('rowDigest — reviewed_plan_hash가 바뀌면 다른 digest다 (본문이 바뀌면 새 그룹)', () => {
  const base = { perspective: 'test', severity: 'HIGH', claim: 'same claim' };
  const a = backlogAppend.rowDigest(Object.assign({ reviewedPlanHash: 'sha256:aaa' }, base));
  const b = backlogAppend.rowDigest(Object.assign({ reviewedPlanHash: 'sha256:bbb' }, base));
  assert.notEqual(a, b);
  assert.equal(a, backlogAppend.rowDigest(Object.assign({ reviewedPlanHash: 'sha256:aaa' }, base)));
});

test('rowDigest — 필드 경계가 모호하지 않다', () => {
  const a = backlogAppend.rowDigest({ reviewedPlanHash: 'h', perspective: 'ab', severity: 'c', claim: '' });
  const b = backlogAppend.rowDigest({ reviewedPlanHash: 'h', perspective: 'a', severity: 'bc', claim: '' });
  assert.notEqual(a, b, '구분자 없이 이으면 ("ab","c")와 ("a","bc")가 충돌한다');
});

// ── Task 1: 소비자 왕복 ───────────────────────────────────────────────────────

test('왕복 — 파이프와 개행을 담은 claim이 4열을 유지한 채 파서에 읽힌다', () => {
  const root = makeRepo({});
  const rows = backlogAppend.deriveBacklogRows({
    decision: makeDecision([
      { perspective: 'security', claim: 'cell | splitter\nand a newline', severity: 'HIGH' },
    ]),
    planPath: '.claude/plans/x.plan.md', slug: 'x', today: '2026-08-19', repoRoot: root,
  });
  const before = scanBacklog(root).count;
  const res = backlogAppend.appendRows({ repoRoot: root, rows: rows });
  assert.equal(res.appended, 1);

  const body = readBacklog(root);
  // `s.ok`나 `s.count`만 보는 검사는 깨진 행을 통과로 읽는다 — 파서가 셀 수
  // 미달 행을 조용히 버리기 때문이다. 원시 데이터 행 수와 파싱 수를 맞춘다.
  const scan = scanBacklog(root);
  assert.equal(scan.count, before + 1, '적재한 행이 파서에 잡혀야 한다');
  assert.equal(dataRowCount(body), scan.count, '파서가 버린 행이 0건이어야 한다');

  const item = scan.items[scan.items.length - 1];
  assert.equal(item.severity, 'HIGH');
  assert.equal(item.source_plan, '.claude/plans/x.plan.md');
  assert.match(item.finding, /cell &#124; splitter and a newline/,
    '원문이 셀 하나 안에 보존돼야 한다');
  assert.match(item.finding, /원문 \.claude\/reviews\/plan-review-x\.md/);
  assert.match(item.finding, /id=[0-9a-f]{8}$/);
});

test('멱등 — 같은 decision을 두 번 적재해도 행 수가 변하지 않는다', () => {
  const root = makeRepo({});
  const mk = () => backlogAppend.deriveBacklogRows({
    decision: makeDecision([
      { perspective: 'test', claim: 'first', severity: 'HIGH' },
      { perspective: 'invariant', claim: 'second', severity: 'CRITICAL' },
    ]),
    planPath: '.claude/plans/x.plan.md', slug: 'x', today: '2026-08-19', repoRoot: root,
  });
  const r1 = backlogAppend.appendRows({ repoRoot: root, rows: mk() });
  const after1 = dataRowCount(readBacklog(root));
  const r2 = backlogAppend.appendRows({ repoRoot: root, rows: mk() });
  assert.equal(r1.appended, 2);
  assert.equal(r2.appended, 0);
  assert.equal(r2.skipped_duplicate, 2);
  assert.equal(dataRowCount(readBacklog(root)), after1);
});

test('헤더가 없는 원장에는 append하지 않고 실패한다', () => {
  const root = makeRepo({ backlogBody: '# no table here\n\njust prose\n' });
  const before = readBacklog(root);
  assert.throws(() => backlogAppend.appendRows({
    repoRoot: root,
    rows: backlogAppend.deriveBacklogRows({
      decision: makeDecision([{ perspective: 'test', claim: 'a', severity: 'HIGH' }]),
      planPath: '.claude/plans/x.plan.md', slug: 'x', today: '2026-08-19', repoRoot: root,
    }),
  }), /has no .*header row/);
  assert.equal(readBacklog(root), before, '실패 경로가 본문을 건드리면 안 된다');
});

test('마지막 개행이 없는 원장에도 행이 별도 줄로 붙는다', () => {
  const root = makeRepo({ backlogBody: HEADER.replace(/\n$/, '') });
  const rows = backlogAppend.deriveBacklogRows({
    decision: makeDecision([{ perspective: 'test', claim: 'tail-safe', severity: 'HIGH' }]),
    planPath: '.claude/plans/x.plan.md', slug: 'x', today: '2026-08-19', repoRoot: root,
  });
  backlogAppend.appendRows({ repoRoot: root, rows: rows });
  const scan = scanBacklog(root);
  assert.equal(dataRowCount(readBacklog(root)), scan.count);
  assert.match(scan.items[scan.items.length - 1].finding, /tail-safe/);
});

test('원장이 아예 없으면 실패한다 (적재할 원장이 없으면 완화하지 않는다)', () => {
  const root = makeRepo({ backlogBody: null });
  assert.throws(() => backlogAppend.appendRows({ repoRoot: root, rows: [] }),
    /cannot read the backlog/);
});

// ── Task 2: CLI 계층 (실제 spawn) ─────────────────────────────────────────────

test('CLI backlog-append — blockingFindings 2건이 exit 0으로 적재된다', () => {
  const root = makeRepo({
    decision: makeDecision([
      { perspective: 'security', claim: 'cli one', severity: 'HIGH' },
      { perspective: 'test', claim: 'cli two', severity: 'CRITICAL' },
    ]),
    l2: {
      results: [
        { perspective: 'security', verdict: 'fail', findings: [{ severity: 'HIGH', claim: 'cli one' }, { severity: 'MEDIUM', claim: 'noise' }] },
        { perspective: 'test', verdict: 'fail', findings: [{ severity: 'CRITICAL', claim: 'cli two' }, { severity: 'LOW', claim: 'nit' }] },
      ],
    },
  });
  const before = dataRowCount(readBacklog(root));
  const r = runCli(root, ['backlog-append', '--repo-root', root,
    '--plan', '.claude/plans/x.plan.md', '--slug', 'x']);
  assert.equal(r.status, 0, r.stderr);
  const artifact = JSON.parse(fs.readFileSync(
    path.join(root, '.claude', 'state', 'plan-review', 'backlog.json'), 'utf8'));
  assert.equal(artifact.appended, 2);
  assert.equal(artifact.skipped_duplicate, 0);
  assert.equal(artifact.skipped_nonblocking, 2, 'MEDIUM·LOW는 적재하지 않되 센다 (DD2)');
  assert.equal(dataRowCount(readBacklog(root)), before + 2);
});

test('CLI backlog-append — 재실행은 멱등이다', () => {
  const root = makeRepo({
    decision: makeDecision([{ perspective: 'test', claim: 'once', severity: 'HIGH' }]),
  });
  const args = ['backlog-append', '--repo-root', root, '--plan', '.claude/plans/x.plan.md', '--slug', 'x'];
  assert.equal(runCli(root, args).status, 0);
  const after1 = dataRowCount(readBacklog(root));
  const r2 = runCli(root, args);
  assert.equal(r2.status, 0, r2.stderr);
  const artifact = JSON.parse(fs.readFileSync(
    path.join(root, '.claude', 'state', 'plan-review', 'backlog.json'), 'utf8'));
  assert.equal(artifact.appended, 0);
  assert.equal(artifact.skipped_duplicate, 1);
  assert.equal(dataRowCount(readBacklog(root)), after1);
});

test('CLI backlog-append — 헤더를 지운 원장은 exit 12이고 본문은 무변경이다', () => {
  const root = makeRepo({
    backlogBody: '# Backlog\n\nheader deliberately removed\n',
    decision: makeDecision([{ perspective: 'test', claim: 'blocked', severity: 'HIGH' }]),
  });
  const before = readBacklog(root);
  const r = runCli(root, ['backlog-append', '--repo-root', root,
    '--plan', '.claude/plans/x.plan.md', '--slug', 'x']);
  assert.equal(r.status, 12, '적재 불가는 EX_BLOCK이다 — 완화가 진행되면 안 된다');
  assert.equal(readBacklog(root), before);
  assert.equal(fs.existsSync(path.join(root, '.claude', 'state', 'plan-review', 'backlog.json')), false,
    '실패한 실행이 parity 앵커를 남기면 통과로 읽힌다');
});

test('CLI backlog-append — decision.json 부재는 exit 12다', () => {
  const root = makeRepo({});
  const r = runCli(root, ['backlog-append', '--repo-root', root,
    '--plan', '.claude/plans/x.plan.md', '--slug', 'x']);
  assert.equal(r.status, 12);
});

test('CLI backlog-append — single_pass_reason 없는 decision은 exit 0 · appended=0이다', () => {
  const decision = makeDecision([{ perspective: 'test', claim: 'a', severity: 'HIGH' }]);
  delete decision.single_pass_reason;
  const root = makeRepo({ decision: decision });
  const before = dataRowCount(readBacklog(root));
  const r = runCli(root, ['backlog-append', '--repo-root', root,
    '--plan', '.claude/plans/x.plan.md', '--slug', 'x']);
  assert.equal(r.status, 0, r.stderr);
  const artifact = JSON.parse(fs.readFileSync(
    path.join(root, '.claude', 'state', 'plan-review', 'backlog.json'), 'utf8'));
  assert.equal(artifact.appended, 0);
  assert.equal(dataRowCount(readBacklog(root)), before, '토글 OFF 경로는 원장을 건드리지 않는다');
});

test('CLI backlog-append — repo 밖 --plan 은 exit 12다', () => {
  const root = makeRepo({
    decision: makeDecision([{ perspective: 'test', claim: 'a', severity: 'HIGH' }]),
  });
  const r = runCli(root, ['backlog-append', '--repo-root', root,
    '--plan', path.join(root, '..', 'outside.md'), '--slug', 'x']);
  assert.equal(r.status, 12, '저장소 밖 경로가 git-tracked 원장에 실리면 E7 재현이다');
});

// ── Task 2 + 3: parity 단언 ───────────────────────────────────────────────────

function writeRecord(root, measurementPatch) {
  const built = buildReviewRecord({
    slug: 'x',
    planPath: '.claude/plans/x.plan.md',
    mode: 'multi-agent',
    l1: { verdict: 'converged' },
    l2: null,
    decision: makeDecision([]),
    nowMs: 1755000000000,
    backlog: measurementPatch === undefined ? null : measurementPatch,
  });
  const p = path.join(root, '.claude', 'reviews', 'plan-review-x.md');
  fs.writeFileSync(p, built.markdown, 'utf8');
  return { path: p, measurement: built.measurement };
}

test('record.js — backlog.json 부재는 0이 아니라 null이다 (Task 3)', () => {
  const root = makeRepo({});
  const r = writeRecord(root);
  assert.equal(r.measurement.backlog_appended, null);
  assert.equal(r.measurement.backlog_skipped_nonblocking, null);
  const md = fs.readFileSync(r.path, 'utf8');
  assert.match(md, /### Recording degradations/);
  assert.match(md, /backlog\.json absent or unreadable/);
});

test('record.js — backlog.json이 있으면 두 축이 실린다 (Task 3)', () => {
  const root = makeRepo({});
  const r = writeRecord(root, { appended: 3, skipped_duplicate: 0, skipped_nonblocking: 5, rows: [] });
  assert.equal(r.measurement.backlog_appended, 3);
  assert.equal(r.measurement.backlog_skipped_nonblocking, 5);
});

test('assert-backlog-parity — 적재와 기록이 일치하면 exit 0이다', () => {
  const root = makeRepo({
    decision: makeDecision([{ perspective: 'test', claim: 'parity', severity: 'HIGH' }]),
  });
  assert.equal(runCli(root, ['backlog-append', '--repo-root', root,
    '--plan', '.claude/plans/x.plan.md', '--slug', 'x']).status, 0);
  const artifact = JSON.parse(fs.readFileSync(
    path.join(root, '.claude', 'state', 'plan-review', 'backlog.json'), 'utf8'));
  const rec = writeRecord(root, artifact);
  const r = runCli(root, ['assert-backlog-parity', '--record', rec.path]);
  assert.equal(r.status, 0, r.stderr);
});

test('assert-backlog-parity — 건수가 어긋나면 비영점이다', () => {
  const root = makeRepo({
    decision: makeDecision([{ perspective: 'test', claim: 'parity', severity: 'HIGH' }]),
  });
  runCli(root, ['backlog-append', '--repo-root', root, '--plan', '.claude/plans/x.plan.md', '--slug', 'x']);
  const rec = writeRecord(root, { appended: 9, skipped_duplicate: 0, skipped_nonblocking: 0, rows: [] });
  const r = runCli(root, ['assert-backlog-parity', '--record', rec.path]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /backlog_appended mismatch/);
});

test('assert-backlog-parity — 기록이 null인데 아티팩트가 있으면 비영점이다', () => {
  const root = makeRepo({
    decision: makeDecision([{ perspective: 'test', claim: 'parity', severity: 'HIGH' }]),
  });
  runCli(root, ['backlog-append', '--repo-root', root, '--plan', '.claude/plans/x.plan.md', '--slug', 'x']);
  const rec = writeRecord(root);
  const r = runCli(root, ['assert-backlog-parity', '--record', rec.path]);
  assert.notEqual(r.status, 0);
});

test('assert-backlog-parity — 적재를 주장하나 원장에 행이 없으면 비영점이다', () => {
  const root = makeRepo({});
  const rec = writeRecord(root, {
    appended: 1, skipped_duplicate: 0, skipped_nonblocking: 0,
    rows: [{ digest: 'deadbeef', severity: 'HIGH', perspective: 'test' }],
  });
  fs.writeFileSync(path.join(root, '.claude', 'state', 'plan-review', 'backlog.json'),
    JSON.stringify({ appended: 1, skipped_duplicate: 0, skipped_nonblocking: 0,
      rows: [{ digest: 'deadbeef', severity: 'HIGH', perspective: 'test' }] }), 'utf8');
  const r = runCli(root, ['assert-backlog-parity', '--record', rec.path]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /absent from/);
});

test('assert-backlog-parity — 기록이 읽히지 않으면 fail-open하지 않는다', () => {
  const root = makeRepo({});
  const r = runCli(root, ['assert-backlog-parity', '--record',
    path.join(root, '.claude', 'reviews', 'nope.md')]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /cannot read the review record/);
});

test('record.js — 완화된 실행에서 backlog.json 부재는 결손이다 (반대는 아니다)', () => {
  // 부재가 결손인지는 완화 여부가 정한다. 조건 없이 결손으로 적으면 토글이 꺼진
  // 모든 실행이 degraded로 읽혀, 진짜 결손이 그 노이즈에 묻힌다.
  const relaxed = buildReviewRecord({
    slug: 'x', mode: 'multi-agent', l1: { verdict: 'converged' },
    decision: makeDecision([]), nowMs: 1755000000000, backlog: null,
  });
  assert.ok(relaxed.degradations.some((d) => /backlog\.json absent/.test(d)),
    '5.2g2가 돌았어야 하는 실행에서 산출물이 없으면 그 사실이 기록돼야 한다');

  const offDecision = makeDecision([]);
  delete offDecision.single_pass_reason;
  const off = buildReviewRecord({
    slug: 'x', mode: 'multi-agent', l1: { verdict: 'converged' },
    decision: offDecision, nowMs: 1755000000000, backlog: null,
  });
  assert.equal(off.degradations.some((d) => /backlog\.json absent/.test(d)), false,
    '토글이 꺼진 실행에서 5.2g2는 no-op이므로 부재가 정상이다');
  assert.equal(off.measurement.backlog_appended, null,
    '그래도 값은 0이 아니라 null이다 — 적재가 돌지 않았다는 관측이다');
});
