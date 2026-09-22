'use strict';

// review-record-linkage M5 Task 3 — 배선 부재를 보는 정적 단언 (UI7).
//
// 이 test 가 존재하는 이유는 이 PRD 의 지배적 실패 모드 그 자체다: **통로는 만들었는데
// 부르지 않는다.** M1~M4 가 배선을 전부 구현하고도 라이브 지표가 0 이었던 것이 그
// 실패이고, 단위 test 는 그것을 잡지 못한다 — 오라클은 완벽히 동작하면서 아무도
// 호출하지 않을 수 있기 때문이다.
//
// 정적 스캔의 한계를 분명히 한다: 정적 단언은 **호출 줄이 실재하는지**만 본다.
//
// 이 자리에는 "배너가 실제로 발화하는지는 `hooks/tests/session-start-dep-check.test.js`
// 가 덮는다" 고 적혀 있었고 그것은 **거짓이었다** — 그 파일에 skew 단언은 0 건이다
// (실측). 그 거짓말이 실제로 대가를 치렀다: throttle 이 이틀째부터 매 부팅 발화하는
// 결함(local code-review HIGH-1)이 이 파일의 정규식 단언을 **전부 통과**했다. 소스에
// `install_skew_at` 이라는 문자열이 있는지 물었을 뿐 그 값이 전진하는지는 묻지 않았기
// 때문이다.
//
// 그래서 아래 "── (iii) 동작" 절이 생겼다. throttle 은 이제 실제 state-writer 를 상대로
// 부팅 시퀀스를 재생해 발화/침묵 패턴을 단언한다. 정적 단언은 배선 배치(가드 블록 밖에
// 있는가)처럼 실행해서는 관측하기 어려운 축에만 남긴다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
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
  // 자기 필드를 읽는가. (이 단언만으로는 부족하다는 것이 HIGH-1 이 증명한 바이고,
  // 실제 throttle 동작은 아래 (iii) 절이 잰다.)
  assert.ok(/install_skew_state/.test(src), 'the axis must read its own state key');
  // 시계 기반 분기는 이 축에서 은퇴했다. 되살아나면 HIGH-1 이 그대로 재발한다:
  // 그 분기가 읽는 타임스탬프는 state-writer 의 write-skip 이 얼려 버린다.
  assert.ok(!/skewWithin24h|skewAgeMs/.test(src),
    'a rolling-age branch is back on the skew axis. The timestamp it reads is in ' +
    'HASH_EXCLUDE_FRONTMATTER_KEYS, so a session that moves only that value leaves the ' +
    'content hash unchanged and state-writer skips the write — the stamp freezes at its ' +
    'first value and the banner fires on every boot from day two. See installSkewKey.');
});

// ── (iii) 동작 — throttle 은 정규식이 아니라 부팅 시퀀스로 잰다 ────────────────

// session-start.js 의 skew 블록을 **실제 state-writer 를 상대로** 재생한다. 한 부팅이
// 배너를 띄웠는지를 돌려주므로, 기대 패턴은 사람이 읽고 검산할 수 있다.
function replayBoots(root, skew, isoTimes) {
  const depCheck = require('../dep-check');
  const sw = require('../../state/state-writer');
  return isoTimes.map(function (nowIso) {
    let prior = null;
    try { prior = sw.readState(root).frontmatter.install_skew_state || null; } catch (_e) { /* none */ }
    const notice = depCheck.installSkewNotice(skew);
    const key = depCheck.installSkewKey(skew, nowIso);
    const fired = Boolean(notice) && key !== prior;
    sw.update(root, { installSkew: { checkedAt: nowIso, state: key } });
    return fired;
  });
}

function tmpRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-skew-'));
  fs.mkdirSync(path.join(root, '.claude', 'state'), { recursive: true });
  return root;
}

const BEHIND = Object.freeze({
  state: 'behind', commits_behind: 7, installed_version: '1.33.6',
  installed_sha: 'a'.repeat(40), head_sha: 'b'.repeat(40),
  plugin_dir_override: false, reason: null,
});

test('HIGH-1 regression — the throttle still throttles on day two and after', function () {
  const root = tmpRepo();
  const fired = replayBoots(root, BEHIND, [
    '2026-09-01T00:00:00.000Z',   // 최초 — 발화
    '2026-09-01T06:00:00.000Z',   // 같은 날 — 침묵
    '2026-09-01T23:59:00.000Z',   // 같은 날 늦게 — 침묵
    '2026-09-02T09:00:00.000Z',   // 다음 날 — 발화
    '2026-09-02T18:00:00.000Z',   // 같은 날 — 침묵  ← 옛 코드가 여기서 발화했다
    '2026-09-09T09:00:00.000Z',   // 일주일 뒤 — 발화
  ]);
  assert.deepEqual(fired, [true, false, false, true, false, true],
    'the skew banner must fire at most once a day while the state is unchanged. The ' +
    'measured pre-fix behaviour was [true,false,false,true,TRUE,true]: install_skew_at ' +
    'is hash-excluded, so once the state settled the write was skipped, the stamp froze ' +
    'at its first value, and the 24h age check was false forever after day one.');
});

test('HIGH-1 mechanism — a bare-state key is frozen by the write-skip; a day-bucketed one is not', function () {
  const sw = require('../../state/state-writer');

  // 옛 형태: 키가 상태 이름뿐이면 해시가 안 움직여 write 가 skip 되고, 해시에서 빠진
  // install_skew_at 은 첫 값에 얼어붙는다. 이것이 HIGH-1 의 기계장치 그 자체다.
  const frozen = tmpRepo();
  sw.update(frozen, { installSkew: { checkedAt: '2026-09-01T00:00:00.000Z', state: 'behind' } });
  sw.update(frozen, { installSkew: { checkedAt: '2026-09-05T00:00:00.000Z', state: 'behind' } });
  assert.equal(sw.readState(frozen).frontmatter.install_skew_at, '2026-09-01T00:00:00.000Z',
    'if this ever advances, the write-skip changed and installSkewKey\'s rationale needs re-deriving');

  // 새 형태: 날짜가 키에 있으므로 해시가 움직이고, write 가 실제로 일어난다.
  const moving = tmpRepo();
  sw.update(moving, { installSkew: { checkedAt: '2026-09-01T00:00:00.000Z', state: 'behind:2026-09-01' } });
  sw.update(moving, { installSkew: { checkedAt: '2026-09-05T00:00:00.000Z', state: 'behind:2026-09-05' } });
  assert.equal(sw.readState(moving).frontmatter.install_skew_at, '2026-09-05T00:00:00.000Z');
  assert.equal(sw.readState(moving).frontmatter.install_skew_state, 'behind:2026-09-05');
});

test('installSkewKey — day-bucketed for reportable states, null otherwise, never a bare state', function () {
  const depCheck = require('../dep-check');
  assert.equal(depCheck.installSkewKey(BEHIND, '2026-09-01T12:00:00.000Z'), 'behind:2026-09-01');
  assert.equal(depCheck.installSkewKey({ state: 'diverged' }, '2026-09-01T00:00:00.000Z'), 'diverged:2026-09-01');
  // 침묵하는 상태는 키를 갖지 않는다 — 배너가 없으므로 dedupe 할 것도 없다.
  assert.equal(depCheck.installSkewKey({ state: 'current' }, '2026-09-01T00:00:00.000Z'), null);
  assert.equal(depCheck.installSkewKey({ state: 'unknown' }, '2026-09-01T00:00:00.000Z'), null);
  assert.equal(depCheck.installSkewKey(null, '2026-09-01T00:00:00.000Z'), null);
  // 판독 불가한 시각도 bare state 로 떨어지지 않는다. 떨어지면 그 분기에서만
  // HIGH-1 이 조용히 되살아난다.
  ['not-a-date', undefined, null, {}].forEach(function (bad) {
    assert.match(depCheck.installSkewKey(BEHIND, bad), /^behind:\d{4}-\d{2}-\d{2}$/,
      'an unparsable clock must still produce a dated key, not a bare state');
  });
});

// 상태가 바뀌면 같은 날이어도 즉시 말한다 — throttle 은 침묵 장치가 아니라 중복 제거다.
test('a state change speaks up within the same day', function () {
  const root = tmpRepo();
  const sw = require('../../state/state-writer');
  const depCheck = require('../dep-check');
  const day = '2026-09-01T08:00:00.000Z';
  sw.update(root, { installSkew: { checkedAt: day, state: depCheck.installSkewKey(BEHIND, day) } });
  const prior = sw.readState(root).frontmatter.install_skew_state;
  const diverged = depCheck.installSkewKey({ state: 'diverged' }, '2026-09-01T20:00:00.000Z');
  assert.notEqual(diverged, prior, 'behind → diverged on the same day must re-fire');
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
