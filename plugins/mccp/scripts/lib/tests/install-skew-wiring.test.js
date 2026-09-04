'use strict';

// review-record-linkage M5 Task 3 — 배선 부재를 보는 정적 단언 (UI7).
//
// 이 test 가 존재하는 이유는 이 PRD 의 지배적 실패 모드 그 자체다: **통로는 만들었는데
// 부르지 않는다.** M1~M4 가 배선을 전부 구현하고도 라이브 지표가 0 이었던 것이 그
// 실패이고, 단위 test 는 그것을 잡지 못한다 — 오라클은 완벽히 동작하면서 아무도
// 호출하지 않을 수 있기 때문이다.
//
// 정적 스캔의 한계를 분명히 한다: 이 파일은 **호출 줄이 실재하는지**만 본다. 배너가
// 실제로 발화하는지는 `hooks/tests/session-start-dep-check.test.js` 가 덮는다
// (L2 test HIGH 흡수 — 정적 단언 하나로는 부족하다).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const LIB = path.join(__dirname, '..');
const HOOKS = path.join(LIB, '..', 'hooks');
const STATE = path.join(LIB, '..', 'state');
const COMMANDS = path.join(LIB, '..', '..', 'commands');

function read(p) { return fs.readFileSync(p, 'utf8'); }

// ── (i) 소비처가 실재한다 ────────────────────────────────────────────────────

test('dep-check exposes install_skew as a STRICT superset of the pre-existing keys', function () {
  const depCheck = require('../dep-check');
  const result = depCheck.checkAll({ repoRoot: path.join(LIB, '..', '..', '..', '..') });
  ['codex_plugin', 'impeccable_cli', 'impeccable', 'codex_disabled', 'checked_at'].forEach(function (k) {
    assert.ok(Object.prototype.hasOwnProperty.call(result, k),
      'M5 removed or renamed the pre-existing key ' + k + ' — this must be additive only');
  });
  assert.ok(Object.prototype.hasOwnProperty.call(result, 'install_skew'));
  ['state', 'installed_version', 'installed_sha', 'head_sha', 'commits_behind',
    'plugin_dir_override', 'reason'].forEach(function (k) {
    assert.ok(Object.prototype.hasOwnProperty.call(result.install_skew, k), 'install_skew.' + k);
  });
});

test('a broken oracle degrades to unknown, never to current', function () {
  // fail-open 은 "조용히 통과"가 아니다. 오라클을 못 읽었는데 `current` 를 보고하면
  // 진단이 고장난 바로 그 순간 스스로 꺼진다 (DD4).
  const depCheck = require('../dep-check');
  const sentinel = depCheck.checkInstallSkew({ repoRoot: null, runGit: function () { throw new Error('x'); } });
  assert.ok(sentinel && typeof sentinel === 'object');
  assert.notEqual(sentinel.state, 'current');
});

test('session-start.js actually consumes the oracle', function () {
  const src = read(path.join(HOOKS, 'session-start.js'));
  assert.ok(/checkInstallSkew\s*\(/.test(src),
    'session-start.js does not call checkInstallSkew — the banner cannot fire');
  assert.ok(/installSkewNotice\s*\(/.test(src), 'the notice builder is never called');
  assert.ok(/installSkew:\s*\{/.test(src), 'the state-writer patch key is never written');
});

test('setup.md carries the install skew row', function () {
  const src = read(path.join(COMMANDS, 'setup.md'));
  assert.ok(/install skew\s+:/.test(src), 'the /mccp:setup table has no install skew row');
  assert.ok(/dogfood-install\.md/.test(src),
    'the row must point at the only legitimate live-firing path (DD3)');
});

test('state-writer serializes the axis own present-only fields', function () {
  const src = read(path.join(STATE, 'state-writer.js'));
  assert.ok(/install_skew_at:\s*null/.test(src), 'default missing');
  assert.ok(/install_skew_state:\s*null/.test(src), 'default missing');
  assert.ok(/out\.push\('install_skew_at: '/.test(src), 'not serialized');
  assert.ok(/out\.push\('install_skew_state: '/.test(src), 'not serialized');
  assert.ok(/patch\.installSkew/.test(src), 'no patch channel');
  // 타임스탬프는 매 세션 self-bump 이므로 content hash 에서 빠져야 한다
  // (dep_check_at 와 같은 이유). 상태 문자열은 의미 payload 이므로 빠지면 안 된다.
  const sw = require('../../state/state-writer');
  assert.ok(sw.HASH_EXCLUDE_FRONTMATTER_KEYS.has('install_skew_at'));
  assert.ok(!sw.HASH_EXCLUDE_FRONTMATTER_KEYS.has('install_skew_state'));
});

// ── (ii) DD4a 회귀 가드 — 가드 블록 **밖** 이어야 한다 ────────────────────────

// 문자열 근접이 아니라 **중괄호 정합**으로 블록 범위를 구한다. 근접 검사는
// 블록이 커지거나 코드가 재배치되면 조용히 무의미해지고, 그때 이 test 는 green 인
// 채로 아무것도 지키지 않는다.
function guardBlockRange(src, needle) {
  const idx = src.indexOf(needle);
  if (idx === -1) return null;
  const open = src.indexOf('{', idx);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { start: open, end: i };
    }
  }
  return null;
}

test('DD4a — the skew banner lives OUTSIDE the MCCP_CODEX_DISABLED guard', function () {
  const src = read(path.join(HOOKS, 'session-start.js'));
  const range = guardBlockRange(src, "parseBool(process.env, 'MCCP_CODEX_DISABLED')");
  assert.ok(range, 'could not locate the MCCP_CODEX_DISABLED guard block — the shape of ' +
    'session-start.js changed and this guard needs re-deriving, not deleting');

  const call = src.indexOf('checkInstallSkew(');
  assert.notEqual(call, -1, 'checkInstallSkew is not called at all');

  assert.ok(call < range.start || call > range.end,
    'the install-skew banner sits INSIDE the MCCP_CODEX_DISABLED guard. CLAUDE.md §3.12 ' +
    'calls MCCP_CODEX_DISABLED=1 a standard install, so this diagnostic would never fire ' +
    'on a standard machine — the exact failure (a path built and never called) that ' +
    'review-record-linkage M5 exists to close. See DD4a.');
});

test('DD4a — the skew throttle does not share the dep-check clock', function () {
  const src = read(path.join(HOOKS, 'session-start.js'));
  // dep_check_at 은 dep-check 가 도는 매 세션 재스탬프되므로, 그 시계만으로는
  // rate-limit 이 아니다 — 배너가 한 번 뜨고 다시는 뜨지 않는다.
  assert.ok(/install_skew_at/.test(src), 'the axis must read its own timestamp field');
  assert.ok(/install_skew_state/.test(src), 'the axis must read its own state key');
});

// ── 오라클이 부르는 쪽에 실제로 얹혀 있다 ─────────────────────────────────────

test('the reason enum stays closed at every surface that prints it', function () {
  const skew = require('../install-skew');
  const declared = Object.keys(skew.REASONS).map(function (k) { return skew.REASONS[k]; });
  assert.deepEqual(declared.slice().sort(), [
    'git_failed', 'not_a_repo', 'oracle_unavailable', 'override_unjudged',
    'registry_unreadable', 'sha_absent', 'sha_malformed',
  ]);
  // dep-check 의 sentinel 은 그 enum 안의 값을 써야 한다 — 밖의 값을 쓰면
  // 소비처가 분기할 수 없는 상태가 생긴다.
  const depCheck = require('../dep-check');
  const sentinel = depCheck.checkInstallSkew({ repoRoot: 12345 });
  assert.ok(sentinel.reason === null || declared.indexOf(sentinel.reason) !== -1,
    'dep-check produced a reason outside install-skew REASONS: ' + sentinel.reason);
});
