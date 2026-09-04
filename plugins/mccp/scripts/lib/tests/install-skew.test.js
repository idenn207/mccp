'use strict';

// review-record-linkage M5 Task 1 — install-skew 오라클 단위 test.
//
// 고정하는 것:
//   - DD2 의 4상태가 **커밋 도달성**으로 결정된다 (version 문자열 비교가 아니다)
//   - DD4 의 fail-open: 어떤 입력에도 throw 하지 않고 `unknown` 으로 말한다
//   - 실패 사유가 **닫힌 enum** 이고 반환 어디에도 경로 형태가 없다 (M4 H1 선례)
//   - `-` 로 시작하는 sha 가 git 인자에 **도달하지 못한다** (argv 옵션 주입)
//   - UNC/상대 `CLAUDE_PLUGIN_ROOT` 가 **어떤 fs/git 접촉보다 먼저** 거부된다
//     (implement-gate security-reviewer #1 — SessionStart 는 무상호작용 자동 실행이라
//      접촉 자체가 SMB/NTLM 유출이다. 접촉 후 예외를 잡는 것으로는 늦다)
//
// 값이 아니라 **형태**로 단언한다 — 특정 머신의 경로에 묶이면 다른 머신에서 무의미해진다.

const test = require('node:test');
const assert = require('node:assert/strict');

const skew = require('../install-skew');

const HEAD = 'e0d05f704a519fe79d9595cc0600377ae96bc112';
const OLD = '647dfecba75eecd9287ee538ca5f7056c7ba71da';

// 경로 형태 4종. 좁은 목록(Windows 드라이브 + /home/ 만)은 macOS 와 UNC 유출을
// green 인 채로 통과시킨다 (L2 security LOW 흡수).
const PATH_SHAPES = [
  { name: 'windows drive', re: /[A-Za-z]:[\\/]/ },
  { name: 'linux home', re: /\/home\// },
  { name: 'macos home', re: /\/Users\// },
  { name: 'UNC', re: /\\\\/ },
];

function assertNoPathShape(value, where) {
  const s = JSON.stringify(value);
  PATH_SHAPES.forEach(function (p) {
    assert.ok(!p.re.test(s), where + ' leaked a ' + p.name + '-shaped string: ' + s);
  });
}

// runGit 스텁. 호출을 기록하므로 "접촉하지 않았다"를 단언할 수 있다.
function gitStub(plan) {
  const calls = [];
  const fn = function (args, cwd) {
    calls.push({ args: args.slice(), cwd: cwd });
    const key = args.join(' ');
    if (Object.prototype.hasOwnProperty.call(plan, key)) return plan[key];
    return { status: 128, stdout: '' };
  };
  fn.calls = calls;
  return fn;
}

function repoGit(extra) {
  const base = {
    'rev-parse --is-inside-work-tree': { status: 0, stdout: 'true\n' },
    'rev-parse HEAD': { status: 0, stdout: HEAD + '\n' },
  };
  Object.keys(extra || {}).forEach(function (k) { base[k] = extra[k]; });
  return gitStub(base);
}

function entry(over) {
  const e = { version: '1.33.6', gitCommitSha: OLD };
  Object.keys(over || {}).forEach(function (k) { e[k] = over[k]; });
  return e;
}

// ── DD2 — 4상태 ──────────────────────────────────────────────────────────────

test('current: installed sha is an ancestor AND zero commits behind', function () {
  const runGit = repoGit({
    ['merge-base --is-ancestor ' + OLD + ' ' + HEAD]: { status: 0, stdout: '' },
    ['rev-list --count --end-of-options ' + OLD + '..' + HEAD]: { status: 0, stdout: '0\n' },
  });
  const r = skew.resolveInstallSkew({
    env: {}, repoRoot: '/repo', runGit: runGit, readInstalled: function () { return entry(); },
  });
  assert.equal(r.state, 'current');
  assert.equal(r.commits_behind, 0);
  assert.equal(r.reason, null);
});

test('behind: ancestor with a non-zero commit gap', function () {
  const runGit = repoGit({
    ['merge-base --is-ancestor ' + OLD + ' ' + HEAD]: { status: 0, stdout: '' },
    ['rev-list --count --end-of-options ' + OLD + '..' + HEAD]: { status: 0, stdout: '179\n' },
  });
  const r = skew.resolveInstallSkew({
    env: {}, repoRoot: '/repo', runGit: runGit, readInstalled: function () { return entry(); },
  });
  assert.equal(r.state, 'behind');
  assert.equal(r.commits_behind, 179);
  assert.equal(r.installed_version, '1.33.6');
  assert.equal(r.head_sha, HEAD);
});

test('diverged: merge-base exits 1 (not an ancestor)', function () {
  const runGit = repoGit({
    ['merge-base --is-ancestor ' + OLD + ' ' + HEAD]: { status: 1, stdout: '' },
  });
  const r = skew.resolveInstallSkew({
    env: {}, repoRoot: '/repo', runGit: runGit, readInstalled: function () { return entry(); },
  });
  assert.equal(r.state, 'diverged');
  assert.equal(r.commits_behind, null);
});

test('exit 128 (unknown object) is git_failed, NOT diverged', function () {
  // "조상이 아니다"(1)와 "그 커밋을 모른다"(128)는 다른 관측이다. 후자를 diverged 로
  // 접으면 판정 불가를 판정으로 위장하게 된다.
  const runGit = repoGit({
    ['merge-base --is-ancestor ' + OLD + ' ' + HEAD]: { status: 128, stdout: '' },
  });
  const r = skew.resolveInstallSkew({
    env: {}, repoRoot: '/repo', runGit: runGit, readInstalled: function () { return entry(); },
  });
  assert.equal(r.state, 'unknown');
  assert.equal(r.reason, skew.REASONS.gitFailed);
});

test('unknown never folds to current — every failure keeps state=unknown', function () {
  const cases = [
    { name: 'registry absent', readInstalled: function () { return null; }, reason: 'registry_unreadable' },
    { name: 'truncated JSON (reader returns null)', readInstalled: function () { return null; }, reason: 'registry_unreadable' },
    { name: 'reader throws', readInstalled: function () { throw new Error('C:\\Users\\victim\\boom'); }, reason: 'registry_unreadable' },
    { name: 'sha absent', readInstalled: function () { return entry({ gitCommitSha: undefined }); }, reason: 'sha_absent' },
    { name: 'sha empty', readInstalled: function () { return entry({ gitCommitSha: '' }); }, reason: 'sha_absent' },
    { name: 'sha non-string', readInstalled: function () { return entry({ gitCommitSha: 12345 }); }, reason: 'sha_absent' },
    { name: 'sha malformed', readInstalled: function () { return entry({ gitCommitSha: 'not-a-sha' }); }, reason: 'sha_malformed' },
    { name: 'sha too short', readInstalled: function () { return entry({ gitCommitSha: 'abc' }); }, reason: 'sha_malformed' },
  ];
  cases.forEach(function (c) {
    const r = skew.resolveInstallSkew({
      env: {}, repoRoot: '/repo', runGit: repoGit({}), readInstalled: c.readInstalled,
    });
    assert.equal(r.state, 'unknown', c.name + ' must stay unknown');
    assert.equal(r.reason, c.reason, c.name);
    assertNoPathShape(r, c.name);
  });
});

test('not_a_repo when the worktree probe fails; git_failed when HEAD does not resolve', function () {
  const notRepo = skew.resolveInstallSkew({
    env: {}, repoRoot: '/nope',
    runGit: gitStub({ 'rev-parse --is-inside-work-tree': { status: 128, stdout: '' } }),
    readInstalled: function () { return entry(); },
  });
  assert.equal(notRepo.reason, skew.REASONS.notARepo);

  const badHead = skew.resolveInstallSkew({
    env: {}, repoRoot: '/repo',
    runGit: gitStub({
      'rev-parse --is-inside-work-tree': { status: 0, stdout: 'true\n' },
      'rev-parse HEAD': { status: 0, stdout: 'not-a-sha\n' },
    }),
    readInstalled: function () { return entry(); },
  });
  assert.equal(badHead.reason, skew.REASONS.gitFailed);
});

test('git binary missing (status null) is git_failed, not a throw', function () {
  const r = skew.resolveInstallSkew({
    env: {}, repoRoot: '/repo',
    runGit: function () { return { status: null, stdout: '' }; },
    readInstalled: function () { return entry(); },
  });
  assert.equal(r.state, 'unknown');
  assert.equal(r.reason, skew.REASONS.notARepo);
});

// ── argv 주입 ────────────────────────────────────────────────────────────────

test('a sha starting with `-` never reaches git', function () {
  // `--upload-pack=...` 류가 rev 자리에 들어가면 옵션으로 해석된다. 정규식이
  // 그 앞에서 막는지를, git 호출 기록으로 확인한다 — "검증했다"가 아니라
  // "도달하지 않았다"가 단언 대상이다.
  const runGit = repoGit({});
  const r = skew.resolveInstallSkew({
    env: {}, repoRoot: '/repo', runGit: runGit,
    readInstalled: function () { return entry({ gitCommitSha: '--upload-pack=calc' }); },
  });
  assert.equal(r.reason, skew.REASONS.shaMalformed);
  const reached = runGit.calls.some(function (c) {
    return c.args.some(function (a) { return String(a).indexOf('--upload-pack') !== -1; });
  });
  assert.equal(reached, false, 'the malformed sha reached a git argv position');
});

test('SHA_RE admits only lowercase hex, 7..40', function () {
  ['abcdef1', OLD].forEach(function (ok) { assert.ok(skew.SHA_RE.test(ok), ok); });
  ['abcdef', OLD + '0', 'ABCDEF1', 'abcdef-', '-abcdef1', 'abcdef 1', 'abc.def'].forEach(function (bad) {
    assert.ok(!skew.SHA_RE.test(bad), 'must reject ' + bad);
  });
});

// ── security-reviewer #1 — override 는 접촉 전에 판정된다 ─────────────────────

test('classifyPluginRoot rejects UNC and relative roots WITHOUT producing a touchable dir', function () {
  const rejected = ['\\\\attacker.example\\share\\x', '//attacker.example/share/x', 'relative/dir', '..\\up'];
  rejected.forEach(function (v) {
    const c = skew.classifyPluginRoot(v, '/home/u');
    assert.equal(c.override, true, v + ' must count as an override');
    assert.equal(c.safe, false, v + ' must be unjudgeable');
    assert.equal(c.dir, null, v + ' must not yield a directory anything can touch');
  });
});

test('an unsafe override folds to override_unjudged and never touches it', function () {
  const runGit = repoGit({});
  let readerCalls = 0;
  const r = skew.resolveInstallSkew({
    env: { CLAUDE_PLUGIN_ROOT: '\\\\attacker.example\\share\\x' },
    repoRoot: '/repo', runGit: runGit,
    readInstalled: function () { readerCalls += 1; return entry(); },
  });
  assert.equal(r.state, 'unknown');
  assert.equal(r.reason, skew.REASONS.overrideUnjudged);
  assert.equal(r.plugin_dir_override, true);
  // 어떤 git 호출도 그 디렉토리를 cwd 로 삼지 않았다.
  const touched = runGit.calls.some(function (c) {
    return typeof c.cwd === 'string' && /attacker\.example/.test(c.cwd);
  });
  assert.equal(touched, false, 'git was invoked against the UNC path');
  assert.equal(readerCalls, 0, 'the registry read should not run for an override');
  assertNoPathShape(r, 'unsafe override');
});

test('a SAFE override is re-judged, not silenced', function () {
  // 무판정 침묵이 금지인 이유: override 디렉토리가 M3·M4 이전의 오래된 sibling
  // 워크트리일 수 있고, 그 경우가 바로 탐지 대상이다.
  const OVERRIDE_HEAD = 'aaaaaaabbbbbbbcccccccdddddddeeeeeeefffffff'.slice(0, 40);
  // 오라클은 override 경로를 `path.resolve` 한 뒤 넘긴다(그 정규화가 #3 방어의
  // 일부다). 스텁도 같은 형태로 비교해야 win32 에서 리터럴이 어긋나지 않는다.
  const OVERRIDE_DIR = require('path').resolve('/elsewhere/plugins/mccp');
  const runGit = function (args, cwd) {
    const key = args.join(' ');
    if (cwd === OVERRIDE_DIR) {
      if (key === 'rev-parse --is-inside-work-tree') return { status: 0, stdout: 'true\n' };
      if (key === 'rev-parse HEAD') return { status: 0, stdout: OVERRIDE_HEAD + '\n' };
      return { status: 128, stdout: '' };
    }
    if (key === 'rev-parse --is-inside-work-tree') return { status: 0, stdout: 'true\n' };
    if (key === 'rev-parse HEAD') return { status: 0, stdout: HEAD + '\n' };
    if (key === 'merge-base --is-ancestor ' + OVERRIDE_HEAD + ' ' + HEAD) return { status: 1, stdout: '' };
    return { status: 128, stdout: '' };
  };
  const r = skew.resolveInstallSkew({
    env: { CLAUDE_PLUGIN_ROOT: '/elsewhere/plugins/mccp' },
    repoRoot: '/repo', homeDir: '/home/u', runGit: runGit,
    readInstalled: function () { throw new Error('registry must not be read under override'); },
  });
  assert.equal(r.plugin_dir_override, true);
  assert.equal(r.state, 'diverged', 'a stale sibling worktree must be judged, not passed over');
  assert.equal(r.installed_sha, OVERRIDE_HEAD);
});

test('an override that cannot be judged reports override_unjudged, not current', function () {
  const r = skew.resolveInstallSkew({
    env: { CLAUDE_PLUGIN_ROOT: '/elsewhere/plugins/mccp' },
    repoRoot: '/repo', homeDir: '/home/u',
    runGit: function (args, cwd) {
      const key = args.join(' ');
      if (cwd === '/repo' && key === 'rev-parse --is-inside-work-tree') return { status: 0, stdout: 'true\n' };
      if (cwd === '/repo' && key === 'rev-parse HEAD') return { status: 0, stdout: HEAD + '\n' };
      return { status: 128, stdout: '' };   // override dir is not a repo
    },
    readInstalled: function () { return entry(); },
  });
  assert.equal(r.state, 'unknown');
  assert.equal(r.reason, skew.REASONS.overrideUnjudged);
});

// ── security-reviewer #3 — containment 은 substring 이 아니다 ─────────────────

test('isInsideCache is not fooled by traversal, suffix, or (win32) case', function () {
  const home = process.platform === 'win32' ? 'C:\\Users\\u' : '/home/u';
  const j = require('path').join;
  const cache = j(home, '.claude', 'plugins', 'cache');

  assert.equal(skew.isInsideCache(j(cache, 'mccp', 'mccp', '1.33.6'), home), true);
  assert.equal(skew.isInsideCache(cache, home), true);

  // `..` 로 캐시를 빠져나가면서 문자열로는 캐시를 포함하는 경로.
  assert.equal(skew.isInsideCache(j(cache, '..', '..', 'evil'), home), false);
  // 접미 경계 — `cacheXYZ` 는 `cache` 안이 아니다.
  assert.equal(skew.isInsideCache(cache + 'XYZ', home), false);
  // 완전히 다른 트리.
  assert.equal(skew.isInsideCache(j(home, 'elsewhere'), home), false);

  if (process.platform === 'win32') {
    // win32 는 대소문자를 구분하지 않는다. 구분하면 변조 사본이 override 로 잡히지
    // 않고 `current` 로 보고된다.
    assert.equal(skew.isInsideCache(cache.toUpperCase() + '\\mccp', home), true);
  }
});

// ── DD4 — 총함수 ─────────────────────────────────────────────────────────────

test('resolveInstallSkew is total: no input throws, and the shape is stable', function () {
  const KEYS = ['state', 'installed_version', 'installed_sha', 'head_sha',
    'commits_behind', 'plugin_dir_override', 'reason'];
  const hostile = [
    undefined, null, {}, { env: null }, { env: { CLAUDE_PLUGIN_ROOT: 12345 } },
    { runGit: function () { throw new Error('C:\\Users\\victim\\git'); } },
    { runGit: function () { return 'not an object'; } },
    { runGit: function () { return { status: 'zero' }; } },
    { readInstalled: function () { return 'not an object'; } },
    { env: { CLAUDE_PLUGIN_ROOT: '\u0000\u0000' } },
  ];
  hostile.forEach(function (input, i) {
    let r;
    assert.doesNotThrow(function () { r = skew.resolveInstallSkew(input); }, 'input #' + i);
    assert.deepEqual(Object.keys(r).sort(), KEYS.slice().sort(), 'input #' + i + ' changed the shape');
    assert.ok(['current', 'behind', 'diverged', 'unknown'].indexOf(r.state) !== -1, 'input #' + i);
    if (r.reason !== null) {
      const enumValues = Object.keys(skew.REASONS).map(function (k) { return skew.REASONS[k]; });
      assert.ok(enumValues.indexOf(r.reason) !== -1,
        'input #' + i + ' produced a reason outside the closed enum: ' + r.reason);
    }
    assertNoPathShape(r, 'hostile input #' + i);
  });
});

test('an injected effect that throws is contained, and its message never surfaces', function () {
  const r = skew.resolveInstallSkew({
    env: {}, repoRoot: '/repo',
    runGit: repoGit({
      ['merge-base --is-ancestor ' + OLD + ' ' + HEAD]: { status: 0, stdout: '' },
      ['rev-list --count --end-of-options ' + OLD + '..' + HEAD]: { status: 0, stdout: 'not-a-number\n' },
    }),
    readInstalled: function () { return entry(); },
  });
  assert.equal(r.state, 'unknown');
  assert.equal(r.reason, skew.REASONS.gitFailed);
});

test('the module header records DD4 verbatim so a later cycle cannot quietly invert it', function () {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'install-skew.js'), 'utf8');
  assert.ok(/DD4 — 진단은 fail-open이고 어떤 경로도 차단하지 않는다/.test(src));
  assert.ok(/DD4a — 소비처 배너는 `MCCP_CODEX_DISABLED` 가드 밖에 산다/.test(src));
  assert.ok(/게이트가 죽는다/.test(src), 'the reason fail-closed is wrong must stay next to the code');
});
