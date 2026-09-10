'use strict';

// plugin-version.js 의 판별력 test.
//
// 이 모듈의 계약은 두 줄이다: **파생한다** 와 **절대 throw 하지 않는다**. 후자가
// 없으면 manifest 하나가 대시보드 전체를 못 그리게 만들 수 있고, 그것이 버전
// 문자열이 가져서는 안 되는 권한이다. 그래서 강등 경로를 축마다 흔들어 본다.

const test = require('node:test');
const assert = require('node:assert/strict');

const pv = require('../plugin-version');

// 실제 manifest. 이 test 는 stub 이 아니라 디스크의 값과 대조한다 — 상대 require
// 가 실제로 해소되는지가 이 모듈의 load-bearing 주장이기 때문이다.
const MANIFEST_VERSION = require('../../../../.claude-plugin/plugin.json').version;

function silent() {
  const seen = [];
  return { warn: (m) => seen.push(m), seen: seen };
}

test('reads the real manifest and agrees with it (relative require resolves)', () => {
  const r = pv.readPluginVersion();
  assert.equal(r.degraded, false, 'reason: ' + r.reason);
  assert.equal(r.reason, 'ok');
  assert.equal(r.version, MANIFEST_VERSION);
});

test('footerVersionLabel prefixes v and matches the manifest', () => {
  assert.equal(pv.footerVersionLabel(), 'v' + MANIFEST_VERSION);
});

test('an unreadable manifest degrades to a sentinel — it does NOT throw', () => {
  const w = silent();
  let r;
  assert.doesNotThrow(() => {
    r = pv.readPluginVersion({
      load: () => { throw new Error("Cannot find module '../../../.claude-plugin/plugin.json'"); },
      warn: w.warn,
    });
  });
  assert.equal(r.degraded, true);
  assert.equal(r.reason, 'manifest-unreadable');
  assert.equal(r.version, null);
  assert.equal(w.seen.length, 1, 'degradation is loud, not silent');
  assert.match(w.seen[0], /plugin version degraded/);
});

test('a missing version field degrades', () => {
  const w = silent();
  [{}, { version: null }, { version: 42 }, { version: '   ' }].forEach(function (m) {
    const r = pv.readPluginVersion({ load: () => m, warn: w.warn });
    assert.equal(r.degraded, true, JSON.stringify(m));
    assert.equal(r.reason, 'version-missing', JSON.stringify(m));
  });
});

// S4 (security-reviewer LOW). 앵커되지 않은 매치는 manifest 의 임의 문자열이
// footer 로 흘러가는 경로를 남긴다 — html.js 의 footer 는 escapeHtml 을 거치지
// 않는 몇 안 되는 문자열 중 하나다.
test('a non-semver version degrades — the match is anchored, not substring', () => {
  const w = silent();
  const hostile = [
    '1.2.3<script>alert(1)</script>',
    'x1.2.3',
    '1.2',
    '1.2.3.4',
    '1.2.3-beta',
    '</footer><script>',
  ];
  hostile.forEach(function (v) {
    const r = pv.readPluginVersion({ load: () => ({ version: v }), warn: w.warn });
    assert.equal(r.degraded, true, 'must reject ' + JSON.stringify(v));
    assert.equal(r.reason, 'version-not-semver', JSON.stringify(v));
    assert.equal(r.version, null);
  });
});

test('a degraded read produces the honest 미상 label, never a guess', () => {
  const w = silent();
  const label = pv.footerVersionLabel({ load: () => { throw new Error('nope'); }, warn: w.warn });
  assert.equal(label, pv.UNKNOWN_LABEL);
  assert.equal(label, 'v미상');
  assert.doesNotMatch(label, /\d/, 'a degraded label carries no digits to be mistaken for a version');
});

test('the manifest path is the fixed literal the security review verified', () => {
  // 변수·env·사용자 입력이 섞이지 않는 고정 리터럴이라는 것이 path-traversal
  // 부재의 근거다. 이 단언은 그 성질이 조용히 바뀌는 것을 막는다.
  assert.equal(pv.MANIFEST_REL, '../../../.claude-plugin/plugin.json');
});

test('SEMVER_RE is anchored at both ends', () => {
  assert.equal(pv.SEMVER_RE.source, '^\\d+\\.\\d+\\.\\d+$');
});
