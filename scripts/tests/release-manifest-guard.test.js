'use strict';

// scripts/release-manifest-guard.js 의 판별력 test.
//
// 통과만 확인하는 test 는 무의미하다 — 아무것도 안 하는 스크립트도 통과한다.
// 그래서 축마다 **흔들면 붉어지고 되돌리면 통과하는지**를 확인한다
// (scripts/tests/version-declaration-guard.test.js 가 세운 형태).
//
// (b) 가 이 파일의 핵심이다: `source` 가 상대경로 문자열인 M1 이전 형태는 **변경
// 전 트리에서 실제로 존재했던 상태**다. 그 케이스가 붉지 않으면 이 가드는
// 아무것도 재지 않는다.
//
// (g) 는 L2 security HIGH 가 연 축이다 — `url` 을 존재가 아니라 값으로 재지
// 않으면 이 케이스가 통과하고, 통과하는 순간 가드의 url 단언은 있으나 마나가 된다.
//
// (h) 는 security-reviewer LOW(S5) 가 연 축이다 — 준수하는 미끼 엔트리 옆의
// 비준수 그림자 엔트리. 가드의 "엔트리 탐색 실패는 HALT" 계약이 덮는 모호성이다.

const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const path = require('path');

const GUARD = path.join(__dirname, '..', 'release-manifest-guard.js');
const guard = require('../release-manifest-guard.js');

// 현행 형태. 각 fixture 는 이것을 깊은 복사한 뒤 한 축만 흔든다.
function currentManifest() {
  return {
    name: 'mccp',
    owner: { name: 'skypark207' },
    plugins: [
      {
        name: 'mccp',
        source: {
          source: 'git-subdir',
          url: 'https://github.com/idenn207/mccp.git',
          path: 'plugins/mccp',
          ref: 'release',
        },
        description: 'My Claude Code Plugin',
      },
    ],
  };
}

function rules(result) {
  return result.violations.map((v) => v.rule);
}

test('(a) the current shape passes', () => {
  const r = guard.evaluateManifest(currentManifest());
  assert.strictEqual(r.ok, true, 'violations: ' + JSON.stringify(r.violations));
  assert.deepStrictEqual(r.violations, []);
  assert.strictEqual(r.entry.name, 'mccp');
});

test('(b) a bare-string source (the pre-M1 relative path) is caught', () => {
  const m = currentManifest();
  m.plugins[0].source = './plugins/mccp';
  const r = guard.evaluateManifest(m);
  assert.strictEqual(r.ok, false);
  assert.ok(rules(r).includes('source-not-object'), 'got ' + rules(r));
});

test('(c) ref pointing at main is caught', () => {
  const m = currentManifest();
  m.plugins[0].source.ref = 'main';
  const r = guard.evaluateManifest(m);
  assert.strictEqual(r.ok, false);
  assert.ok(rules(r).includes('source-ref'), 'got ' + rules(r));
});

test('(d) a sha pin is caught — the red IS the timer', () => {
  const m = currentManifest();
  m.plugins[0].source.sha = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
  const r = guard.evaluateManifest(m);
  assert.strictEqual(r.ok, false);
  assert.ok(rules(r).includes('source-sha-pinned'), 'got ' + rules(r));
});

test('(e) a path typo is caught', () => {
  const m = currentManifest();
  m.plugins[0].source.path = 'plugin/mccp';
  const r = guard.evaluateManifest(m);
  assert.strictEqual(r.ok, false);
  assert.ok(rules(r).includes('source-path'), 'got ' + rules(r));
});

test('(f) a missing entry is caught, not read as clean', () => {
  const m = currentManifest();
  m.plugins = [];
  const r = guard.evaluateManifest(m);
  assert.strictEqual(r.ok, false);
  assert.ok(rules(r).includes('entry-missing'), 'got ' + rules(r));
  assert.strictEqual(r.entry, null);
});

// L2 security HIGH. 값이 아니라 존재만 재면 이 케이스가 통과한다 — 그리고
// 그때 다른 저장소의 plugin 본문이 fetch 되는 경로는 어떤 검사에도 걸리지 않는다
// (version-declaration-guard 는 이 파일을 아예 보지 않는다).
test('(g) a url pointing at a DIFFERENT repository is caught', () => {
  const m = currentManifest();
  m.plugins[0].source.url = 'https://github.com/attacker/mccp.git';
  const r = guard.evaluateManifest(m);
  assert.strictEqual(r.ok, false);
  assert.ok(rules(r).includes('source-url'), 'got ' + rules(r));
});

// security-reviewer S5. 첫 매치인지 마지막 매치인지 이 저장소는 측정한 바 없으므로
// 모호성 자체를 거절한다.
test('(h) a duplicate mccp entry is ambiguous, not certifiable', () => {
  const m = currentManifest();
  m.plugins.push({
    name: 'mccp',
    source: { source: 'git-subdir', url: 'https://github.com/attacker/mccp.git', path: 'x', ref: 'main' },
  });
  const r = guard.evaluateManifest(m);
  assert.strictEqual(r.ok, false);
  assert.ok(rules(r).includes('entry-ambiguous'), 'got ' + rules(r));
  assert.strictEqual(r.entry, null, 'no entry is certified when two claim the name');
});

test('a malformed top-level object does not throw — it reports entry-missing', () => {
  [null, undefined, {}, { plugins: 'nope' }, { plugins: [null] }].forEach(function (bad) {
    const r = guard.evaluateManifest(bad);
    assert.strictEqual(r.ok, false, 'input ' + JSON.stringify(bad));
    assert.ok(rules(r).includes('entry-missing'), 'input ' + JSON.stringify(bad) + ' got ' + rules(r));
  });
});

test('evaluateManifest never calls process.exit (the caller decides)', () => {
  // 헬퍼에서 exit 하면 이 test 프로세스가 통째로 죽어 위반 경로가 검증
  // 불가능해진다. 위 케이스들이 전부 반환값으로 끝났다는 사실 자체가 그 증거이며,
  // 여기서는 그것을 명시적으로 못박는다.
  const r = guard.evaluateManifest({ plugins: [] });
  assert.strictEqual(typeof r.ok, 'boolean');
  assert.ok(Array.isArray(r.violations));
});

// end-to-end 축. 모듈 함수만 부르면 repo-root 해소·파일 읽기·종료 코드가 전부
// 검증 밖으로 빠지는데, 그 셋이 이 가드가 CI 에서 하는 일의 전부다.
test('this repository itself has intact release coordinates (end-to-end, real process)', () => {
  const repoRoot = path.join(__dirname, '..', '..');
  const r = spawnSync(process.execPath, [GUARD, '--json'], { cwd: repoRoot, encoding: 'utf8' });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_e) { /* non-json failure path */ }
  assert.strictEqual(r.status, 0,
    'release coordinates drifted:\n' + (json ? JSON.stringify(json.violations, null, 2) : r.stderr));
  assert.strictEqual(json.ok, true);
  assert.deepStrictEqual(json.violations, []);
});
