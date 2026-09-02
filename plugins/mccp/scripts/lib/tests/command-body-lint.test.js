'use strict';

// diverse-agent-review M5 Tasks 4·5 — 실코퍼스 실행 + 부채 래칫 양방향.
//
// 래칫의 두 방향은 강제 수단이 다르다(`env-contract/evidence-debt.js` 선례와 같은 형태):
// *축소*는 기계다 — 고쳐졌는데 목록에 남은 항목을 화석으로 보고하므로 화석이 남지 못한다.
// *증가*는 기계가 아니다 — 상한을 올리는 별도 편집이 필요하고 그 숫자가 diff 에 남는다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const lint = require('../command-body/lint');
const debt = require('../command-body/debt');

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..', '..');

// ── 실코퍼스 ─────────────────────────────────────────────────────────────────

test('the live corpus passes with exactly three checks and a full read', function () {
  const r = lint.run(REPO_ROOT);
  assert.deepEqual(Object.keys(r.checks).sort(), ['S1', 'S2', 'S3']);
  assert.ok(r.filesExpected > 0, 'filesExpected must come from a live glob, not a constant');
  assert.equal(r.filesRead, r.filesExpected, 'a partial read is drift, not a pass');
  assert.equal(r.ok, true, JSON.stringify(r.checks, null, 2));
});

test('every enumerated debt row is actually matched by a live violation', function () {
  const r = lint.run(REPO_ROOT);
  // 모수 비공허 — debt 가 비면 아래 등식이 공허하게 성립한다.
  assert.ok(r.debt.length > 0, 'debt must be non-empty for this guard to mean anything');
  assert.equal(r.debt.length, debt.SEAM_DEBT.length,
    'a debt row that matches nothing is a fossil and must be removed');
});

test('debt is reported separately, not hidden', function () {
  const r = lint.run(REPO_ROOT);
  const byRule = {};
  r.debt.forEach(function (d) { byRule[d.rule] = (byRule[d.rule] || 0) + 1; });
  assert.deepEqual(byRule, { S1: 5, S2: 8, S3: 5 }, 'measured 2026-08-31; S2 rose 5 -> 8 when the terminator set became the full semantic class (code-review H1)');
  r.debt.forEach(function (d) {
    assert.ok(d.file && d.line && d.why, 'each debt row carries its own evidence');
  });
});

// ── 래칫 ────────────────────────────────────────────────────────────────────

test('ceiling and list length are asserted as a pair', function () {
  assert.equal(debt.SEAM_DEBT_CEILING, debt.SEAM_DEBT.length,
    'raising the ceiling must be its own edit, visible in the diff');
});

test('assertShape throws when the list exceeds the ceiling', function () {
  const tooMany = [];
  for (let i = 0; i < debt.SEAM_DEBT_CEILING + 1; i++) {
    tooMany.push({ file: 'plugins/mccp/commands/plan.md', line: i + 1, rule: 'S1', textDigest: '0123456789ab', why: 'a b c' });
  }
  assert.throws(function () { debt.assertShape(tooMany); }, /exceed SEAM_DEBT_CEILING/);
});

test('assertShape rejects malformed rows (failing open would exempt everything)', function () {
  const base = { file: 'plugins/mccp/commands/plan.md', line: 1, rule: 'S1', textDigest: '0123456789ab', why: 'a b c' };
  assert.throws(function () { debt.assertShape([Object.assign({}, base, { rule: 'S9' })]); }, /unknown rule/);
  assert.throws(function () { debt.assertShape([Object.assign({}, base, { textDigest: 'zz' })]); }, /bad textDigest/);
  assert.throws(function () { debt.assertShape([Object.assign({}, base, { file: 'elsewhere.md' })]); }, /bad file/);
  assert.throws(function () { debt.assertShape([Object.assign({}, base, { why: 'no' })]); }, /substantive/);
  assert.throws(function () { debt.assertShape([Object.assign({}, base, { extra: 1 })]); }, /keys must be/);
});

test('a fossil debt row (fixed seam, stale entry) is reported', function () {
  const withFossil = debt.SEAM_DEBT.concat([{
    file: 'plugins/mccp/commands/plan.md',
    line: 99999,
    rule: 'S1',
    textDigest: 'ffffffffffff',
    why: 'this seam does not exist',
  }]);
  const r = lint.run(REPO_ROOT, { debt: withFossil });
  assert.equal(r.ok, false, 'a fossil must fail the ratchet, not be ignored');
  assert.ok(r.checks.S1.problems.some(function (p) { return /fossil/.test(p); }),
    'the fossil must be named: ' + JSON.stringify(r.checks.S1.problems));
});

test('a live violation missing from the debt list is reported', function () {
  const shortened = debt.SEAM_DEBT.filter(function (d) { return d.rule !== 'S2'; });
  const r = lint.run(REPO_ROOT, { debt: shortened });
  assert.equal(r.ok, false);
  assert.equal(r.checks.S2.ok, false, 'the un-enumerated S2 violations must surface');
  assert.ok(r.checks.S1.ok, 'other rules stay green — the report is per-rule');
});

test('exemptions are consumed by COUNT, not by key existence', function () {
  // 실측에서 세 쌍이 digest 를 공유한다. 한 쪽만 남기면 나머지 위반이 살아나야 한다.
  const half = [];
  const seen = new Set();
  debt.SEAM_DEBT.forEach(function (d) {
    const k = debt.debtKey(d);
    if (seen.has(k)) return;      // 중복 키의 두 번째 항목을 버린다
    seen.add(k);
    half.push(d);
  });
  assert.ok(half.length < debt.SEAM_DEBT.length, 'the corpus must contain duplicate keys for this to test anything');
  const r = lint.run(REPO_ROOT, { debt: half });
  assert.equal(r.ok, false, 'dropping one of a duplicate pair must expose the other violation');
});

// ── 코퍼스 무결성 ────────────────────────────────────────────────────────────

test('a partial corpus fails every check, not just one', function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-cb-'));
  const dir = path.join(tmp, 'plugins', 'mccp', 'commands');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.md'), '```bash\necho ok\n```\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'b.md'), '```bash\necho ok\n```\n', 'utf8');

  const full = lint.run(tmp, { debt: [] });
  assert.equal(full.filesRead, 2);
  assert.equal(full.filesExpected, 2);
  assert.equal(full.ok, true);

  // 읽기 실패를 흉내낸다 — 파일을 디렉토리로 바꿔 readFileSync 가 던지게 한다.
  fs.unlinkSync(path.join(dir, 'b.md'));
  fs.mkdirSync(path.join(dir, 'b.md'));
  const partial = lint.run(tmp, { debt: [] });
  assert.equal(partial.ok, false, 'a partial read is drift, not a pass');
  Object.keys(partial.checks).forEach(function (k) {
    assert.equal(partial.checks[k].ok, false,
      k + ' must also fail — a per-check green would falsely claim that rule saw the whole corpus');
  });

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('an empty corpus fails rather than passing vacuously', function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-cb-'));
  fs.mkdirSync(path.join(tmp, 'plugins', 'mccp', 'commands'), { recursive: true });
  const r = lint.run(tmp, { debt: [] });
  assert.equal(r.ok, false);
  assert.ok(r.checks.S1.problems.some(function (p) { return /vacuously/.test(p); }));
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ── ASSERT_BASELINE ─────────────────────────────────────────────────────────

test('ASSERT_BASELINE covers exactly the two migrated files and carries its source rev', function () {
  assert.deepEqual(Object.keys(debt.ASSERT_BASELINE).sort(),
    ['plan-review-command-body.test.js', 'review-single-pass-command-body.test.js']);
  Object.keys(debt.ASSERT_BASELINE).forEach(function (f) {
    assert.ok(Number.isInteger(debt.ASSERT_BASELINE[f]) && debt.ASSERT_BASELINE[f] > 0, f);
  });
  assert.match(debt.ASSERT_BASELINE_SOURCE_REV, /^[0-9a-f]{7,40}$/,
    'the baseline must name the commit it was derived from so it can be refuted');
});

// ── baseline 을 실제로 소비한다 (code-review M2) ──────────────────────────────
// 위 단언은 baseline 의 **모양**만 본다. 그것만 있으면 `SEAM_DEBT_CEILING` 은 짝 단언으로
// 기계 강제되는데 바로 옆의 `ASSERT_BASELINE` 은 강제가 전혀 없는 상태가 된다 — 출하된
// test 가 baseline 을 지키는 것처럼 보이면서 지키지 않는다. 유일한 실제 대조가 plan 본문의
// 셸 스니펫뿐이었고, 그 plan 은 §3.11 대로 언젠가 archived/ 로 옮겨진다.
//
// 이것이 L2 패널 지적의 완전한 해소는 아니다. 여기서 세는 것은 **현재 파일**이고 baseline 은
// 여전히 저자가 커밋한 값이라, 이 단언이 막는 것은 "이전 후 단언이 사라지는 것"이지
// "baseline 자체가 틀리게 정해지는 것"이 아니다. 후자의 반증 수단은 여전히
// `git show <ASSERT_BASELINE_SOURCE_REV>:<path>` 이고, 자동 대조는 backlog 에 남아 있다.
test('the migrated files still carry at least their baseline assertion count', function () {
  const dir = __dirname;
  Object.keys(debt.ASSERT_BASELINE).forEach(function (name) {
    const src = fs.readFileSync(path.join(dir, name), 'utf8');
    const actual = (src.match(/assert\./g) || []).length;
    assert.ok(actual >= debt.ASSERT_BASELINE[name],
      name + ': ' + actual + ' assertions, baseline ' + debt.ASSERT_BASELINE[name]
      + ' (derived from ' + debt.ASSERT_BASELINE_SOURCE_REV + '). Migrating to the canonical '
      + 'extractor must not shed assertions; if one was genuinely obsoleted, lower the baseline '
      + 'in its own edit so the diff records it.');
  });
});

// ── digest 정규화 (Implement-Codex R1 F5) ────────────────────────────────────

test('textDigest folds whitespace-only reflow but not semantic change', function () {
  const a = debt.textDigest('node x.js 2>/dev/null || true');
  const b = debt.textDigest('  node   x.js 2>/dev/null || true  ');
  assert.equal(a, b, 'incidental whitespace must not void an exemption');

  const c = debt.textDigest('node x.js 2>/dev/null || false');
  assert.notEqual(a, c, 'a real change to the offending line must void the exemption');
  const d = debt.textDigest('node x.js || true');
  assert.notEqual(a, d, 'removing the redirection must void the exemption');
});
