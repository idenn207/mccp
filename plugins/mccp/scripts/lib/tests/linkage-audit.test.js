'use strict';

// review-record-linkage M1 — 집계 · state ladder · 경계 파티션 회귀 test.
//
// 합성 코퍼스를 임시 git 저장소에 세우고 도구를 실제로 돌린다. 픽스처는 **반드시
// `.claude/reviews/archive/` 하위 파일을 포함**한다 — 그 경로가 빠진 픽스처는
// 수집 범위 누락을 구조적으로 못 잡고, 실제로 그 누락이 이 계획의 acceptance
// 건수를 47과 51로 갈랐다.
//
// 특히 고정하는 것:
//   - `unresolved` 가 ok/exit 0 이 아니다 (미러 선례 corpus.js:670 의 fail-open 미상속)
//   - `--frozen-only` 바이트가 post_baseline 추가·undated 추가에 불변 (DD7)
//   - `pre_measurement` 가 round_structure 분모에 들어가지 않는다 (DD2)
//   - `undecidable` 이 0 으로 접히지 않는다
//   - `corpus.js#parseRecord` 와 소속 판정이 일치한다 (DD1a)

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const AUDIT = path.join(__dirname, '..', 'linkage-audit.js');
const corpus = require('../plan-review/corpus');

// ── 픽스처 저장소 ────────────────────────────────────────────────────────────

function git(cwd, args, env) {
  return execFileSync('git', args, {
    cwd: cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: env ? Object.assign({}, process.env, env) : process.env,
  });
}

// 커밋 시각을 **명시 고정**한다. `git log --format=%cI` 는 초 해상도이므로, 픽스처의
// 두 커밋이 같은 초에 만들어지면 `add_commit < baseline` 이 거짓이 되어 경계 이전
// 레코드가 post 로 떨어진다 — 구현이 아니라 픽스처의 비결정성이다(실측으로 재현됨).
function commitAt(root, iso, message) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message], { GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
}

function panelRecord(slug, measurement) {
  const L = ['# Plan Review Panel — ' + slug, ''];
  L.push('**Verdict**: `divergent` via `multi-agent`', '');
  L.push('## Findings', '', 'None.', '');
  if (measurement !== null) {
    L.push('## Measurement', '', '```json', JSON.stringify(measurement, null, 2), '```', '');
  }
  return L.join('\n');
}

function shipReceipt(createdAt, extraMeta) {
  return JSON.stringify({
    schema_version: 1,
    gate_id: 'mccp-pr-codex',
    decision_id: 'x',
    plan_hash: 'sha256:deadbeef',
    round: 1,
    resolution: { converged: true, rounds: 1 },
    meta: Object.assign({ created_at: createdAt, command: '/mccp-pr-codex' }, extraMeta || {}),
  }, null, 2);
}

// 픽스처 저장소를 만들고 baseline 커밋 SHA 를 돌려준다.
// - 경계 이전: ship 2 · 패널 record 1 · 패널 pre_measurement 1 · archive 패널 1 · 타 생산자 1
// - 경계 이후: 호출자가 추가한다
function mkRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-linkage-'));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);

  const rc = path.join(root, '.claude', 'receipts', 'mccp-pr-codex');
  const rv = path.join(root, '.claude', 'reviews');
  const ra = path.join(rv, 'archive');
  fs.mkdirSync(rc, { recursive: true });
  fs.mkdirSync(ra, { recursive: true });

  const BEFORE = '2020-01-01T00:00:00.000Z';
  fs.writeFileSync(path.join(rc, 'alpha.json'), shipReceipt(BEFORE));
  fs.writeFileSync(path.join(rc, 'beta.json'), shipReceipt(BEFORE));
  // measurement 있는 패널 레코드 (rounds 없음 → D1 미보유)
  fs.writeFileSync(path.join(rv, 'plan-review-alpha.md'),
    panelRecord('alpha', { verdict: 'divergent', recorded_at: BEFORE }));
  // Measurement 블록 자체가 없는 패널 레코드 → pre_measurement
  fs.writeFileSync(path.join(rv, 'plan-review-legacy.md'), panelRecord('legacy', null));
  // archive/ 하위 패널 레코드 — 이 파일이 없으면 수집 범위 누락을 못 잡는다
  fs.writeFileSync(path.join(ra, 'plan-review-archived.md'),
    panelRecord('archived', { verdict: 'converged', recorded_at: BEFORE }));
  // 다른 생산자 — 결손이 아니라 out_of_corpus
  fs.writeFileSync(path.join(rv, 'pr-99-review.md'), '# PR 99 review\n\nnot a panel record\n');

  commitAt(root, '2020-06-01T00:00:00+00:00', 'baseline corpus');
  // baseline 은 그 다음 커밋이고 **한 해 뒤**다 — 위 파일들이 전부 "경계 이전"이 되도록.
  fs.writeFileSync(path.join(root, 'MARKER'), 'baseline\n');
  commitAt(root, '2021-06-01T00:00:00+00:00', 'baseline marker');
  const baseline = git(root, ['rev-parse', 'HEAD']).trim();
  return { root: root, baseline: baseline };
}

function run(root, args) {
  const res = { stdout: '', code: 0 };
  try {
    res.stdout = execFileSync(process.execPath, [AUDIT].concat(args),
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    res.stdout = (err.stdout || '').toString();
    res.code = typeof err.status === 'number' ? err.status : 1;
  }
  return res;
}

function runJson(root, args) {
  const r = run(root, args);
  let parsed = null;
  try { parsed = JSON.parse(r.stdout); } catch (_e) { /* leave null */ }
  return { code: r.code, json: parsed, raw: r.stdout };
}

// ── state ladder ─────────────────────────────────────────────────────────────

test('ok: a clean corpus exits 0', function () {
  const { root, baseline } = mkRepo();
  const r = runJson(root, ['--json', '--baseline-ref', baseline]);
  assert.equal(r.json.state, 'ok');
  assert.equal(r.code, 0);
});

test('unresolved: an unresolvable baseline ref is NOT ok and NOT exit 0', function () {
  // 미러 선례(corpus.js:670)는 unresolved 여도 exit 0 을 낸다. 그 fail-open 을
  // 물려받지 않았음을 여기서 고정한다 — 동결의 유일한 기계 장치가 무너진 상태에서
  // 도구가 성공을 보고하면 안 된다.
  const { root } = mkRepo();
  const r = runJson(root, ['--json', '--baseline-ref', 'deadbeefdeadbeefdeadbeef']);
  assert.equal(r.json.state, 'unresolved');
  assert.equal(r.json.baseline.state, 'unresolved');
  assert.equal(r.code, 3);
  assert.equal('pre_baseline' in r.json, false, 'no partition may be reported without a boundary');
});

test('blind: zero records is its own state, and reports no ratio', function () {
  const { root } = mkRepo();
  // 작업 트리에서 지우는 것만으로는 부족하다 — 멤버십은 경계 트리가 정하므로
  // **트리에서** 사라져야 blind 다. 이 test 가 커밋 없이 통과하던 것이 정확히
  // santa-loop R0 이 닫은 결함의 반대편이다(구현이 작업 트리만 봤다).
  fs.rmSync(path.join(root, '.claude', 'receipts'), { recursive: true, force: true });
  fs.rmSync(path.join(root, '.claude', 'reviews'), { recursive: true, force: true });
  commitAt(root, '2022-06-01T00:00:00+00:00', 'drop the corpus');
  const baseline = git(root, ['rev-parse', 'HEAD']).trim();

  const r = runJson(root, ['--json', '--baseline-ref', baseline]);
  assert.equal(r.json.state, 'blind');
  assert.equal(r.code, 2);

  // 동결 뷰도 성공을 보고하지 않는다. 초판은 여기서 `state:"ok"` + exit 0 + 전
  // 필드 0 을 냈고, 잘못된 cwd 에서 블록을 재생성하면 그 0 들이 문서에 커밋됐다.
  const f = runJson(root, ['--frozen-only', '--baseline-ref', baseline]);
  assert.equal(f.json.baseline.state, 'blind');
  assert.ok(typeof f.json.baseline.reason === 'string' && f.json.baseline.reason.length > 0,
    'a blind frozen view must say why, not just report zeros');
  assert.equal(f.code, 2);
});

test('degraded: an unparsable ship receipt is a failure, not a silent skip', function () {
  const { root } = mkRepo();
  fs.writeFileSync(path.join(root, '.claude', 'receipts', 'mccp-pr-codex', 'broken.json'), '{ not json');
  commitAt(root, '2022-06-01T00:00:00+00:00', 'land a broken receipt');
  const baseline = git(root, ['rev-parse', 'HEAD']).trim();

  const r = runJson(root, ['--json', '--baseline-ref', baseline]);
  assert.equal(r.json.state, 'degraded');
  assert.equal(r.code, 1);
  assert.ok(r.json.parse_failures >= 1);
});

test('unknown state maps to a nonzero exit (fail-closed)', function () {
  const mod = require('../linkage-audit');
  assert.equal(mod.exitCodeForState('ok'), 0);
  assert.equal(mod.exitCodeForState('unresolved'), 3);
  assert.notEqual(mod.exitCodeForState('a-state-the-ladder-never-produces'), 0);
});

// ── 코퍼스 경계 (DD1a · DD2) ────────────────────────────────────────────────

test('corpus boundary is inherited from corpus.js#parseRecord, archive/ included', function () {
  const { root, baseline } = mkRepo();
  const r = runJson(root, ['--json', '--baseline-ref', baseline]);
  const cb = r.json.corpus_boundary;
  assert.equal(cb.record, 2, 'plan-review-alpha + archive/plan-review-archived');
  assert.equal(cb.pre_measurement, 1, 'plan-review-legacy');
  assert.equal(cb.out_of_corpus, 1, 'pr-99-review is another producer, not a defect');
  assert.equal(cb.parse_failure, 0);
});

test('DD1a — the two tools agree on membership over the same corpus', function () {
  const { root, baseline } = mkRepo();
  const r = runJson(root, ['--json', '--baseline-ref', baseline]);
  // 같은 파일 집합을 corpus.js 로 직접 세어 대조한다. 갈리면 정의가 두 벌이라는 뜻이다.
  const dirs = [path.join(root, '.claude', 'reviews'), path.join(root, '.claude', 'reviews', 'archive')];
  const tally = { record: 0, pre_measurement: 0, out_of_corpus: 0, parse_failure: 0 };
  dirs.forEach(function (d) {
    fs.readdirSync(d).forEach(function (n) {
      if (!n.endsWith('.md')) return;
      const abs = path.join(d, n);
      if (!fs.statSync(abs).isFile()) return;
      tally[corpus.parseRecord(fs.readFileSync(abs, 'utf8')).kind] += 1;
    });
  });
  assert.deepEqual(r.json.corpus_boundary, tally);
});

test('DD2 — pre_measurement is excluded from the D1 denominator and surfaced as a lower bound', function () {
  const { root, baseline } = mkRepo();
  const r = runJson(root, ['--json', '--baseline-ref', baseline]);
  const rs = r.json.pre_baseline.round_structure;
  assert.equal(rs.denominator, 2, 'only kind=record counts');
  assert.equal(rs.coverage.pre_measurement, 1);
  assert.equal(rs.coverage.counts_are_lower_bound, true,
    'an absent Measurement block is a time boundary, not a zero');
});

test('D1 fires when a record actually carries rounds', function () {
  const { root, baseline } = mkRepo();
  const r0 = runJson(root, ['--json', '--baseline-ref', baseline]);
  assert.equal(r0.json.pre_baseline.round_structure.selected, 0);

  // 긍정 경로 — 상수 0 을 반환하는 구현이 통과하지 못하게 한다. 내용은 트리에서
  // 읽으므로 커밋해야 보인다(작업 트리 편집은 동결값을 움직이지 못한다 — 그것이
  // 이제 이 도구의 계약이다).
  fs.writeFileSync(path.join(root, '.claude', 'reviews', 'plan-review-alpha.md'),
    panelRecord('alpha', { verdict: 'divergent', recorded_at: '2020-01-01T00:00:00.000Z', rounds: 3 }));
  commitAt(root, '2022-06-01T00:00:00+00:00', 'alpha now carries rounds');
  const later = git(root, ['rev-parse', 'HEAD']).trim();
  const r1 = runJson(root, ['--json', '--baseline-ref', later]);
  assert.equal(r1.json.pre_baseline.round_structure.selected, 1);
});

// ── D2 / D3 ─────────────────────────────────────────────────────────────────

test('undecidable is reported as its own count with reasons, never folded to 0', function () {
  const { root, baseline } = mkRepo();
  const r = runJson(root, ['--json', '--baseline-ref', baseline]);
  const e = r.json.pre_baseline.ship_eligibility;
  assert.equal(e.counts.undecidable, 2);
  assert.equal(e.counts.eligible, 0);
  assert.equal(e.counts.not_eligible, 0);
  assert.ok(Object.keys(e.by_reason).length > 0, 'undecidable always carries a reason');
});

test('linkage counts both directions, and the filename convention stays a LABEL', function () {
  const { root, baseline } = mkRepo();
  const r0 = runJson(root, ['--json', '--baseline-ref', baseline]);
  assert.equal(r0.json.pre_baseline.linkage.bidirectional, 0);
  // 파일명 일치(plan-review-alpha ↔ alpha.json)는 세지만 링크가 아니다.
  assert.equal(r0.json.pre_baseline.filename_convention.match, 1);
  assert.equal(r0.json.pre_baseline.linkage.receipt_to_review, 0,
    'a filename match is not a link');
});

// ── DD7 — 동결 파티션 ───────────────────────────────────────────────────────

test('--frozen-only omits the mutable partition entirely', function () {
  const { root, baseline } = mkRepo();
  const r = runJson(root, ['--frozen-only', '--baseline-ref', baseline]);
  assert.deepEqual(Object.keys(r.json).sort(),
    ['baseline', 'pre_baseline', 'schema_version', 'unreadable_at_baseline']);
  assert.equal('post_baseline' in r.json, false);
  assert.equal('undated' in r.json, false, 'the corpus-global undated count is gone entirely');
});

test('DD7 — frozen bytes survive a post-baseline addition', function () {
  const { root, baseline } = mkRepo();
  const before = run(root, ['--frozen-only', '--baseline-ref', baseline]).stdout;

  fs.writeFileSync(path.join(root, '.claude', 'receipts', 'mccp-pr-codex', 'later.json'),
    shipReceipt('2099-01-01T00:00:00.000Z'));
  fs.writeFileSync(path.join(root, '.claude', 'reviews', 'plan-review-later.md'),
    panelRecord('later', { verdict: 'converged', recorded_at: '2099-01-01T00:00:00.000Z' }));

  const after = run(root, ['--frozen-only', '--baseline-ref', baseline]);
  assert.equal(after.stdout, before, 'a post-baseline landing must not move the frozen bytes');
  assert.equal(after.code, 0, 'nor the frozen exit code');
  // 전역 뷰는 그것을 본다.
  const full = runJson(root, ['--json', '--baseline-ref', baseline]);
  assert.equal(full.json.post_baseline.ships, 1);
  assert.equal(full.json.post_baseline.records, 1);
});

test('R0 CRITICAL — the frozen bytes do not move when a COMMIT lands off the boundary', function () {
  // santa-loop R0 의 CRITICAL 회귀 가드. 초판은 작업 트리를 자기신고 타임스탬프로
  // 갈랐으므로, 경계보다 **앞선** 날짜를 단 파일이 나중에 착지하면(= origin/main
  // 머지가 하는 일이 정확히 그것이다) 동결 바이트가 움직였다. 트리 멤버십에서는
  // 경계 커밋에 없는 파일은 어떤 날짜를 달아도 코퍼스가 아니다.
  const { root, baseline } = mkRepo();
  const before = run(root, ['--frozen-only', '--baseline-ref', baseline]).stdout;

  fs.writeFileSync(path.join(root, '.claude', 'receipts', 'mccp-pr-codex', 'backdated.json'),
    shipReceipt('1999-01-01T00:00:00.000Z'));
  fs.writeFileSync(path.join(root, '.claude', 'reviews', 'plan-review-backdated.md'),
    panelRecord('backdated', { verdict: 'converged', recorded_at: '1999-01-01T00:00:00.000Z' }));
  commitAt(root, '2024-06-01T00:00:00+00:00', 'a later commit carrying pre-boundary dates');

  const after = run(root, ['--frozen-only', '--baseline-ref', baseline]);
  assert.equal(after.stdout, before,
    'a commit that is not in the boundary tree must not move the frozen bytes, whatever date it claims');
  assert.equal(after.code, 0, 'nor the frozen exit code');

  // 진단 뷰는 그것을 본다 — 은폐가 아니라 분리다.
  const full = runJson(root, ['--json', '--baseline-ref', baseline]);
  assert.equal(full.json.post_baseline.ships, 1);
  assert.equal(full.json.post_baseline.records, 1);
});

test('R0 HIGH — a record REWRITTEN in place cannot move the frozen partition', function () {
  // `measurement.recorded_at` 은 불변이 아니다: 리뷰 레코드는 PRD slug 당 1파일이라
  // 같은 결정의 재실행이 덮어쓴다. 초판은 그 값으로 멤버십을 정했으므로 재실행 한
  // 번이 분모를 내렸다. 이제 경계 트리의 내용이 정본이라 작업 트리 재작성은 무해하다.
  const { root, baseline } = mkRepo();
  const before = run(root, ['--frozen-only', '--baseline-ref', baseline]).stdout;

  fs.writeFileSync(path.join(root, '.claude', 'reviews', 'plan-review-alpha.md'),
    panelRecord('alpha', { verdict: 'converged', recorded_at: '2099-01-01T00:00:00.000Z' }));

  const after = run(root, ['--frozen-only', '--baseline-ref', baseline]);
  assert.equal(after.stdout, before,
    'rewriting a corpus record in the working tree must not move a frozen number');
  assert.equal(after.code, 0);
});

test('unreadable_at_baseline names what the boundary tree holds but the tool could not parse', function () {
  const { root } = mkRepo();
  fs.writeFileSync(path.join(root, '.claude', 'receipts', 'mccp-pr-codex', 'broken.json'), '{ not json');
  commitAt(root, '2022-06-01T00:00:00+00:00', 'land a broken receipt');
  const baseline = git(root, ['rev-parse', 'HEAD']).trim();

  const r = runJson(root, ['--frozen-only', '--baseline-ref', baseline]);
  assert.equal(r.json.unreadable_at_baseline.ships, 1);
  assert.ok(r.json.unreadable_at_baseline.files
    .indexOf('.claude/receipts/mccp-pr-codex/broken.json') !== -1,
    'the gap is NAMED, not just counted');
  assert.equal(r.json.baseline.state, 'degraded', 'a coverage gap inside the frozen partition is not ok');
  assert.equal(r.code, 1);
});

test('D3 surfaces the join it actually uses', function () {
  // M1 조인은 ship slug <-> plan-review-<slug>.md 였고, 그래서 그 방향의 구조적
  // 천장이 `filename_convention.match`(27/75)였다. **M3 가 그 천장을 없앴다** —
  // 조인은 이제 receipt 가 봉인한 `meta.review_record_path` 다.
  //
  // 그러므로 이 test 의 상한 단언도 함께 은퇴한다. 계약이 바뀌었는데 옛 단언이
  // 남아 있으면 그것은 회귀 가드가 아니라 새 동작을 금지하는 화석이 된다. 대신
  // 고정하는 것은 **출력이 자기가 쓰는 조인을 스스로 말한다**는 성질이고, 그것이
  // 애초에 이 test 의 목적이었다 — 소비자가 수치의 성격을 알 수 있어야 한다.
  const { root, baseline } = mkRepo();
  const r = runJson(root, ['--frozen-only', '--baseline-ref', baseline]);
  assert.equal(r.json.pre_baseline.linkage.join, 'explicit_field');
  assert.ok(String(r.json.pre_baseline.linkage.join_note).indexOf('review_record_path') !== -1,
    'the note must name the field the join actually reads');
  // 라벨은 남는다 — 세되 판정에 쓰지 않는다.
  assert.equal(typeof r.json.pre_baseline.filename_convention.match, 'number');
  assert.ok(String(r.json.pre_baseline.filename_convention.note).indexOf('label only') !== -1);
});

// ── PR-Codex R1 흡수 ────────────────────────────────────────────────────────

test('PR-Codex R1 HIGH — the linkage denominator is the ELIGIBLE set, never every ship', function () {
  // 초판은 자격을 판정해 놓고 분모로 `pre.ships.length` 를 썼다. 그 조합은 UI2 의
  // 후반부("그 판별을 M1 이 파서로 정의한다")를 위반하고, 전건 undecidable 인
  // 코퍼스에서 `0/75` 를 발행한다 — 읽는 사람이 유효 링크율로 오독할 수밖에 없는
  // 수다. **어느 test 도 그 분모를 고정하지 않아 조용히 통과했다**(실측: 이 파일에
  // denominator 단언 0건). 이 test 가 그 자리다.
  const { root, baseline } = mkRepo();
  const r = runJson(root, ['--frozen-only', '--baseline-ref', baseline]);

  const lk = r.json.pre_baseline.linkage;
  const el = r.json.pre_baseline.ship_eligibility.counts;

  assert.equal(el.eligible, 0, 'fixture seeds no explicit proof field');
  assert.equal(el.undecidable, r.json.pre_baseline.ships, 'every fixture ship is undecidable');

  assert.equal(lk.denominator, null,
    '0 asserts "no ship is review-eligible"; null observes "nothing decides it" — the same ' +
    'distinction that keeps undecidable from folding to 0 (DD2)');
  assert.equal(lk.coverage.rate_computable, false);
  assert.equal(lk.scope, 'review_eligible_ships');
  assert.notEqual(lk.denominator, r.json.pre_baseline.ships,
    'the whole point: the denominator must not track the full ship count');

  // 그리고 사람이 읽는 표면도 비율을 인쇄하지 않아야 한다 — JSON 만 고치고 human
  // render 가 `0 / null` 을 찍으면 오독은 그대로 남는다.
  const human = run(root, ['--baseline-ref', baseline]);
  assert.ok(human.stdout.indexOf('RATE NOT COMPUTABLE') !== -1,
    'the human surface must refuse to print a rate it cannot compute');
});

test('PR-Codex R1 HIGH — an eligible ship restores a real denominator, and links count over it', function () {
  // 반대편. 분모가 영원히 null 이면 그것은 고장이지 판정이 아니다 — 명시 proof
  // 필드가 서는 순간 분모가 자격 집합 크기가 되고 분자도 그 위에서만 세어져야 한다.
  const { root } = mkRepo();
  const rc = path.join(root, '.claude', 'receipts', 'mccp-pr-codex');
  const rv = path.join(root, '.claude', 'reviews');
  const BEFORE = '2020-01-01T00:00:00.000Z';

  // 자격 있는 ship 2건 — 하나는 레코드로 되짚는 링크를 싣고, 하나는 안 싣는다.
  fs.writeFileSync(path.join(rc, 'linked.json'), shipReceipt(BEFORE, {
    plan_review_expected: true,
    review_record_path: '.claude/reviews/plan-review-linked.md',
  }));
  fs.writeFileSync(path.join(rc, 'bare.json'), shipReceipt(BEFORE, { plan_review_expected: true }));
  fs.writeFileSync(path.join(rv, 'plan-review-linked.md'),
    panelRecord('linked', { verdict: 'converged', recorded_at: BEFORE }));
  commitAt(root, '2022-06-01T00:00:00+00:00', 'land two review-eligible ships');
  const baseline = git(root, ['rev-parse', 'HEAD']).trim();

  const r = runJson(root, ['--frozen-only', '--baseline-ref', baseline]);
  const lk = r.json.pre_baseline.linkage;

  assert.equal(r.json.pre_baseline.ship_eligibility.counts.eligible, 2);
  assert.equal(lk.denominator, 2, 'the denominator is the eligible set size, not r.ships');
  assert.ok(lk.denominator < r.json.pre_baseline.ships,
    'the fixture also carries undecidable ships, so a full-ship denominator would be larger');
  assert.equal(lk.coverage.rate_computable, true);
  assert.equal(lk.coverage.undecidable, r.json.pre_baseline.ships - 2);

  assert.equal(lk.receipt_to_review, 1, 'only the ship that carries the path links back');
  assert.ok(lk.receipt_to_review <= lk.denominator,
    'a numerator counted over the eligible set can never exceed its own denominator');
});

// ── DD8 ─────────────────────────────────────────────────────────────────────

test('DD8 — the default baseline ref is a full, unambiguous SHA', function () {
  const mod = require('../linkage-audit');
  assert.match(mod.DEFAULT_BASELINE_REF, /^[0-9a-f]{40}$/,
    'an abbreviated SHA can go ambiguous or be shadowed by a same-named ref, and that failure ' +
    'surfaces as unresolved (exit 3), turning the committed frozen test permanently red');
  assert.equal(mod.DEFAULT_BASELINE_REF, '647dfecba75eecd9287ee538ca5f7056c7ba71da',
    'the boundary that defines the historical corpus must not drift silently');
});

// ── santa-loop R1 흡수 ──────────────────────────────────────────────────────

test('R1 HIGH — the pinned boundary is reachable from HEAD, not just from origin/main', function () {
  // 라운드 1 리뷰어가 브랜치를 단독 클론해 재현했다: 경계 객체가 없으면 도구는
  // exit 3 으로 죽고, 동결 test 는 execFileSync 가 먼저 throw 해서 줄 단위 안내
  // 없이 'Command failed' 만 남긴다. 초판의 도달성 확인은 **origin/main 기준**이라
  // 이 조건을 보지 못했다 — 동결 바이트를 커밋하는 것은 이 브랜치다.
  const mod = require('../linkage-audit');
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'],
    { cwd: __dirname, encoding: 'utf8' }).trim();
  let reachable = true;
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', mod.DEFAULT_BASELINE_REF, 'HEAD'],
      { cwd: repoRoot, stdio: ['ignore', 'ignore', 'ignore'] });
  } catch (_err) { reachable = false; }
  assert.equal(reachable, true,
    'DEFAULT_BASELINE_REF must be an ancestor of HEAD, or a fresh single-branch clone of ' +
    'this branch cannot regenerate the frozen block and the byte test fails opaquely');
});

test('R1 HIGH — a ref shape git could read as an option is refused, and nothing is written', function () {
  const { root, baseline } = mkRepo();
  const target = path.join(root, 'injected.txt');
  // `git show --output=<file>` writes to disk, so a leading dash turns a tool
  // whose headline claim is "writes nothing" into a file creator. Demonstrated,
  // not theorised — hence a test rather than a backlog line.
  const r = run(root, ['--frozen-only', '--baseline-ref', '--output=' + target]);
  assert.notEqual(r.code, 0, 'an unsafe ref must fail closed');
  assert.equal(fs.existsSync(target), false, 'the read-only tool must not have created a file');
  // 그리고 정상 ref 는 여전히 통과한다 — 가드가 도구를 못 쓰게 만들면 안 된다.
  assert.equal(run(root, ['--frozen-only', '--baseline-ref', baseline]).code, 0);
});

test('R1 HIGH — a record whose Measurement fence is malformed is NAMED, not dropped', function () {
  const { root } = mkRepo();
  // 패널 서명은 있고 Measurement JSON 만 깨진 레코드. 초판은 이것을 카운터만 올리고
  // 분모에서 조용히 빼면서 unreadable_at_baseline 은 files: [] 로 유지했다 —
  // "부재 ≠ 0" 을 담당하는 그 필드가 잃어버린 코퍼스에 대해 결손 0 을 인증한 것이다.
  const broken = [
    '# Plan Review Panel — brokenmeas', '',
    '**Verdict**: `divergent` via `multi-agent`', '',
    '## Measurement', '', '```json', '{ "verdict": "divergent", ', '```', '',
  ].join('\n');
  fs.writeFileSync(path.join(root, '.claude', 'reviews', 'plan-review-brokenmeas.md'), broken);
  commitAt(root, '2022-06-01T00:00:00+00:00', 'land a record with a malformed fence');
  const baseline = git(root, ['rev-parse', 'HEAD']).trim();

  const r = runJson(root, ['--frozen-only', '--baseline-ref', baseline]);
  assert.equal(r.json.unreadable_at_baseline.records, 1);
  assert.ok(r.json.unreadable_at_baseline.files
    .indexOf('.claude/reviews/plan-review-brokenmeas.md') !== -1,
    'the record must be named in the coverage gap, not merely counted somewhere else');
  assert.equal(r.json.baseline.state, 'degraded');
  assert.ok(typeof r.json.baseline.reason === 'string' && r.json.baseline.reason.length > 0,
    'a degraded frozen view must say why, exactly as the blind one does');
  assert.equal(r.code, 1);
});

test('R1 MEDIUM — when the boundary tree cannot be listed, no partition is emitted', function () {
  // 트리를 못 읽으면 "코퍼스가 0" 이 아니라 "코퍼스를 못 봤다" 이다. 초판은 그 경우에도
  // pre_baseline 전 필드 0 + 빈 결손 목록을 방출했고, 그것은 내부적으로 정합해서
  // 재생성 시 문서에 그대로 커밋될 수 있었다.
  const mod = require('../linkage-audit');
  const r = mod.aggregate({
    repoRoot: '.',
    baselineRef: 'deadbeef',
    baseline: { ms: Date.parse('2020-01-01T00:00:00Z'), iso: '2020-01-01T00:00:00Z', reason: null },
    baselineTree: null,
    ships: { receipts: [], read_error: true, parse_failures: 0, parse_errors: [], unreadable: [] },
    reviews: { records: [], read_error: true, sources: [], unreadable: [] },
  });
  assert.equal(r.baseline.state, 'degraded');
  assert.equal(r.baseline.scope_unknown, true);
  const frozen = mod.frozenOnly(r);
  assert.equal('pre_baseline' in frozen, false, 'scope unknown must not publish a corpus of zeros');
  assert.equal('unreadable_at_baseline' in frozen, false,
    'nor an empty gap list, which would certify full coverage over a corpus never read');
});

// ── M3 — the live partition (Task 8 axis 1) ──────────────────────────────────
//
// M1's `post_baseline` was a working-tree COUNT and this file's own header calls it
// diagnostic-only. M3 puts metric 2 on top of it, which forces two things the M1
// shape could not carry: the read source must be the HEAD TREE (a working-tree read
// would let `MCCP_PR_SKIP_LINK_EVIDENCE` or a failed evidence commit still score a
// perfect link), and it needs the same blind/degraded ladder the frozen partition
// already earned.

function liveReceipt(extraMeta, rHash) {
  return JSON.stringify({
    schema_version: 1,
    gate_id: 'mccp-pr-codex',
    decision_id: 'live',
    plan_hash: 'sha256:deadbeef',
    round: 1,
    resolution: { converged: true, rounds: 1 },
    receipt_hash: rHash || null,
    meta: Object.assign({ created_at: '2024-01-01T00:00:00.000Z', command: '/mccp-pr-codex' }, extraMeta || {}),
  }, null, 2);
}

test('M3 — the live partition exists, reads HEAD, and keeps the working-tree count separate', function () {
  const { root, baseline } = mkRepo();
  const r = runJson(root, ['--json', '--baseline-ref', baseline]);
  const p = r.json.post_baseline;
  assert.equal(p.ref, 'HEAD');
  assert.equal(p.state, 'ok');
  assert.ok(p.linkage, 'the live partition must carry a linkage block');
  assert.equal(p.linkage.join, 'explicit_field');
  // The M1 keys keep their M1 meaning — this is additive, not a reinterpretation.
  assert.equal(typeof p.ships, 'number');
  assert.equal(typeof p.records, 'number');
  assert.ok(typeof p.head_ships === 'number' && typeof p.head_records === 'number',
    'HEAD counts must be reported ALONGSIDE the working-tree counts, not instead of them');
});

test('M3 — a committed link is counted; the same link uncommitted is NOT', function () {
  // The bypass-degradation check. If this partition read the working tree, an
  // evidence commit that never happened would still score a perfect link.
  const { root, baseline } = mkRepo();
  const rc = path.join(root, '.claude', 'receipts', 'mccp-pr-codex');
  const rv = path.join(root, '.claude', 'reviews');

  const HASH = 'sha256:' + 'e'.repeat(64);
  fs.writeFileSync(path.join(rc, 'live.json'), liveReceipt({
    plan_review_expected: true,
    review_record_path: '.claude/reviews/plan-review-live.md',
  }, HASH));
  fs.writeFileSync(path.join(rv, 'plan-review-live.md'),
    panelRecord('live', { verdict: 'converged', receipt_hash: HASH }));

  // Working tree only — must NOT count.
  const uncommitted = runJson(root, ['--json', '--baseline-ref', baseline]);
  assert.equal(uncommitted.json.post_baseline.linkage.bidirectional, 0,
    'an uncommitted link must not be counted — otherwise a skipped evidence commit ' +
    'is indistinguishable from a successful one');

  // Now commit it — must count.
  commitAt(root, '2024-06-01T00:00:00+00:00', 'land a real link');
  const committed = runJson(root, ['--json', '--baseline-ref', baseline]);
  const link = committed.json.post_baseline.linkage;
  assert.equal(link.bidirectional, 1, 'a committed link must be counted');
  assert.equal(link.receipt_to_review, 1);
  assert.equal(link.review_to_receipt, 1);
  assert.equal(link.denominator, 1, 'the eligible ship is the denominator');
});

test('M3 axis 3 — a STALE receipt_hash does not count as bidirectional', function () {
  // The over-permissive direction. `linkage-defs.js:186` only asks whether
  // review_to_receipt is a non-empty string, and back-patch failure is warn-and-
  // proceed, so a record left carrying a PREVIOUS ship's hash pairs with the new
  // receipt and scores. Without this test, deleting the hash comparison entirely
  // leaves the suite green.
  const { root, baseline } = mkRepo();
  const rc = path.join(root, '.claude', 'receipts', 'mccp-pr-codex');
  const rv = path.join(root, '.claude', 'reviews');

  const REAL = 'sha256:' + 'e'.repeat(64);
  const STALE = 'sha256:' + 'f'.repeat(64);
  fs.writeFileSync(path.join(rc, 'live.json'), liveReceipt({
    plan_review_expected: true,
    review_record_path: '.claude/reviews/plan-review-live.md',
  }, REAL));
  fs.writeFileSync(path.join(rv, 'plan-review-live.md'),
    panelRecord('live', { verdict: 'converged', receipt_hash: STALE }));
  commitAt(root, '2024-06-01T00:00:00+00:00', 'land a STALE link');

  const stale = runJson(root, ['--json', '--baseline-ref', baseline]).json.post_baseline.linkage;
  assert.equal(stale.review_to_receipt, 1, 'the record does carry a hash — that is the trap');
  assert.equal(stale.bidirectional, 0, 'but a WRONG hash is not a link');
  assert.equal(stale.stale_receipt_hash, 1, 'and the audit says so out loud');

  // Positive control: fix ONLY the hash and it counts. Without this the axis could
  // be over-blocking and still look correct.
  fs.writeFileSync(path.join(rv, 'plan-review-live.md'),
    panelRecord('live', { verdict: 'converged', receipt_hash: REAL }));
  commitAt(root, '2024-07-01T00:00:00+00:00', 'correct the hash');
  const fixed = runJson(root, ['--json', '--baseline-ref', baseline]).json.post_baseline.linkage;
  assert.equal(fixed.bidirectional, 1);
  assert.equal(fixed.stale_receipt_hash, 0);
});

test('M3 axis 2 — a sealed path pointing at no record is dangling, not a link', function () {
  const { root, baseline } = mkRepo();
  fs.writeFileSync(path.join(root, '.claude', 'receipts', 'mccp-pr-codex', 'live.json'),
    liveReceipt({
      plan_review_expected: true,
      review_record_path: '.claude/reviews/plan-review-nowhere.md',
    }, 'sha256:' + 'e'.repeat(64)));
  commitAt(root, '2024-06-01T00:00:00+00:00', 'seal a dangling path');
  const link = runJson(root, ['--json', '--baseline-ref', baseline]).json.post_baseline.linkage;
  assert.equal(link.receipt_to_review, 1, 'the receipt does declare a path');
  assert.equal(link.bidirectional, 0);
  assert.equal(link.dangling_record_path, 1,
    'a sealed path that resolves to nothing must be reported, not silently counted');
});

test('M3 — an ineligible ship is out of the denominator, and 0 eligible means null', function () {
  const { root, baseline } = mkRepo();
  const rc = path.join(root, '.claude', 'receipts', 'mccp-pr-codex');
  // D2 says an unexplained `false` is not a decision, so give the exclusion a reason.
  fs.writeFileSync(path.join(rc, 'nope.json'), liveReceipt({
    plan_review_expected: false,
    no_plan_review_reason: 'plan gate ran in codex mode; the record is the plan body Codex section',
  }, 'sha256:' + 'a'.repeat(64)));
  commitAt(root, '2024-06-01T00:00:00+00:00', 'land an ineligible ship');
  const p = runJson(root, ['--json', '--baseline-ref', baseline]).json.post_baseline;
  assert.equal(p.ship_eligibility.counts.not_eligible, 1);
  assert.equal(p.linkage.denominator, null,
    'no eligible ship means the RATE is not computable — null, never 0');
  assert.equal(p.linkage.coverage.rate_computable, false);
});

test('M3 — an unreadable HEAD tree is degraded + scope_unknown, and emits NO linkage', function () {
  // R4 invariant HIGH: without this ladder a total read failure is indistinguishable
  // from "honestly zero links", and every acceptance item above would still be true.
  const { root, baseline } = mkRepo();
  const lib = require('../linkage-audit');
  const agg = lib.aggregate({
    repoRoot: root,
    baselineRef: baseline,
    ships: { receipts: [], read_error: false, parse_failures: 0, parse_errors: [], unreadable: [] },
    reviews: { records: [], read_error: false, sources: [], unreadable: [] },
    baseline: { ms: Date.parse('2021-06-01T00:00:00Z'), iso: '2021-06-01T00:00:00Z', reason: null },
    baselineTree: new Set(['MARKER']),
    liveNotInTree: { ships: 0, records: 0 },
    live: { tree: null, ships: null, reviews: null },
  });
  assert.equal(agg.post_baseline.state, 'degraded');
  assert.equal(agg.post_baseline.scope_unknown, true);
  assert.ok(typeof agg.post_baseline.reason === 'string' && agg.post_baseline.reason.length > 0,
    'a degraded partition must say why — a state with no reason is a gap the reader cannot act on');
  assert.equal('linkage' in agg.post_baseline, false,
    'scope unknown must NOT publish a linkage block: absence is not a finding of zero');
});

test('M3 — the live partition never leaks into the frozen bytes', function () {
  // DD7, restated for the new fields. The frozen block is a BASELINE; a new key
  // inside pre_baseline.linkage would move committed bytes, and frozenOnly's
  // whitelist only guards the top level.
  const { root, baseline } = mkRepo();
  const before = run(root, ['--frozen-only', '--baseline-ref', baseline]).stdout;
  fs.writeFileSync(path.join(root, '.claude', 'receipts', 'mccp-pr-codex', 'live.json'),
    liveReceipt({ plan_review_expected: true }, 'sha256:' + 'e'.repeat(64)));
  commitAt(root, '2024-06-01T00:00:00+00:00', 'land a live ship');
  const after = run(root, ['--frozen-only', '--baseline-ref', baseline]);
  assert.equal(after.stdout, before, 'a live landing must not move the frozen bytes');

  const frozen = JSON.parse(before);
  assert.equal('dangling_record_path' in frozen.pre_baseline.linkage, false,
    'the live-only diagnostics must stay out of the frozen block');
  assert.equal('stale_receipt_hash' in frozen.pre_baseline.linkage, false);
  assert.equal(frozen.pre_baseline.linkage.join, 'explicit_field',
    'the join label DOES change — that is the one intended frozen-byte movement');
});
