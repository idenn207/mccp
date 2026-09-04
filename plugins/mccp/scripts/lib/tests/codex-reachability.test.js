'use strict';

// gate-guard-integrity M2 축 B — 도달 가능성 오라클의 부정 케이스.
//
// 이 파일의 단언은 **주입된 `env` 객체**만 읽는다. `process.env` 를 보지 않으므로
// 전역 설정(사용자마다 다른 `MCCP_CODEX_DISABLED`)과 무관하게 같은 것을 잰다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { classify, CLASSIFICATION_KIND, KNOWN_CLASSIFICATIONS } = require('../codex-reachability');

test('(a) precedence — env policy beats classification, even for a combination that cannot occur', () => {
  // `MCCP_CODEX_DISABLED=1` 인데 classification 이 'ok' 인 조합은 실재하지 않는다.
  // 일부러 넣는 것이 precedence 규칙 자체를 단언하는 유일한 방법이다 — 실재하는
  // 입력만 쓰면 "env 를 봤다"와 "classification 이 disabled 였다"를 구별할 수 없다.
  const r = classify({ env: { MCCP_CODEX_DISABLED: '1' }, invokeResult: { ok: true, classification: 'ok' } });
  assert.strictEqual(r.reachable, false);
  assert.strictEqual(r.kind, 'env-policy');
  assert.match(r.reason, /env-policy/);
});

test('(b) no env policy + classification ok → reached', () => {
  const r = classify({ env: {}, invokeResult: { ok: true, classification: 'ok' } });
  assert.strictEqual(r.reachable, true);
  assert.strictEqual(r.kind, 'reached');
});

test('(c) an unknown classification is never read as reachable (fail-closed)', () => {
  const r = classify({ env: {}, invokeResult: { ok: true, classification: 'totally-new-enum' } });
  assert.strictEqual(r.reachable, false);
  assert.strictEqual(r.kind, 'transport');
  assert.match(r.reason, /fail-closed/);
});

// ci-full-suite M2 갈래 D — 이 수는 이제 **한 군데에만** 산다. 이전에는 `14`가 세 군데
// (EXPECTED.length · KNOWN_CLASSIFICATIONS.length · 주석 헤더 declared.length)에 각각 박혀
// 있어, enum이 하나 늘 때 고칠 자리가 셋이었고 실제로 하나가 누락됐다. 값은 여전히
// 리터럴로 핀된다(그것이 drift 탐지의 요점이다) — 단지 한 번만 쓴다.
const EXPECTED_CLASSIFICATION_COUNT = 15;

test('(d) every codex-invoke classification is mapped, and only "ok" is reachable', () => {
  // 열거는 `codex-invoke.js` 의 주석 헤더와 1:1이어야 한다. enum 이 늘어났는데
  // 오라클이 모르는 상태를 이 단언이 잡는다.
  const EXPECTED = [
    ['ok', 'reached'],
    ['disabled', 'env-policy'],
    // 예산 소진은 env 정책도 전송 장애도 아니다 — 자기 kind를 갖는다.
    ['round-cap-reached', 'budget-spent'],
    ['registry-missing', 'not-installed'],
    ['registry-malformed', 'not-installed'],
    ['plugin-not-installed', 'not-installed'],
    ['install-path-stale', 'not-installed'],
    ['companion-not-found', 'not-installed'],
    ['companion-version-mismatch', 'not-installed'],
    ['not-authenticated', 'unauthenticated'],
    ['timeout', 'transport'],
    ['exit-nonzero', 'transport'],
    ['stdout-empty', 'transport'],
    ['spawn-enoent', 'transport'],
    ['parse-error', 'transport'],
  ];

  assert.strictEqual(EXPECTED.length, EXPECTED_CLASSIFICATION_COUNT,
    'the enum is documented as exactly ' + EXPECTED_CLASSIFICATION_COUNT + ' values');
  assert.strictEqual(KNOWN_CLASSIFICATIONS.length, EXPECTED_CLASSIFICATION_COUNT,
    'the oracle knows ' + KNOWN_CLASSIFICATIONS.length + ' classifications, not 14');

  let reachableCount = 0;
  for (const [classification, kind] of EXPECTED) {
    const r = classify({ env: {}, invokeResult: { ok: classification === 'ok', classification } });
    assert.strictEqual(r.kind, kind, classification + ' should map to kind=' + kind + ', got ' + r.kind);
    assert.strictEqual(CLASSIFICATION_KIND[classification], kind,
      classification + ' is missing or mis-mapped in the exported table');
    if (r.reachable) reachableCount++;
  }
  assert.strictEqual(reachableCount, 1, 'exactly one classification ("ok") may read as reachable');
});

test('(d2) the enumerated list matches the codex-invoke comment header verbatim', () => {
  // 표가 주석과 어긋나면 이 test 가 먼저 실패한다 — 문서와 코드가 조용히 갈라지는
  // 것이 이 milestone 이 다루는 결함군이다.
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'codex-invoke.js'), 'utf8');
  const header = /Classification enum:([\s\S]*?)\n\/\/\s*\n/.exec(src);
  assert.ok(header, 'codex-invoke.js must keep its "Classification enum:" comment header');
  const declared = header[1]
    .split('\n')
    .map((l) => l.replace(/^\s*\/\/\s*/, ''))
    .join(' ')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
  assert.strictEqual(declared.length, EXPECTED_CLASSIFICATION_COUNT,
    'the comment header declares ' + declared.length + ' values: ' + JSON.stringify(declared));
  for (const c of declared) {
    assert.ok(Object.prototype.hasOwnProperty.call(CLASSIFICATION_KIND, c),
      'codex-invoke declares "' + c + '" but the reachability oracle does not know it');
  }
});

test('registryProbe is optional — its presence gives the same answer sooner, never a different one', () => {
  const invokeResult = { ok: false, classification: 'plugin-not-installed' };
  const without = classify({ env: {}, invokeResult });
  const with_ = classify({
    env: {},
    invokeResult,
    registryProbe: { installed: false, reason: 'codex@openai-codex not in installed_plugins.json' },
  });

  assert.strictEqual(without.reachable, with_.reachable, 'reachable must not depend on the probe');
  assert.strictEqual(without.kind, with_.kind, 'kind must not depend on the probe');
  assert.strictEqual(with_.kind, 'not-installed');

  // 그리고 probe 가 installed:true 여도 호출 결과를 덮어쓰지 않는다.
  const installedProbe = classify({
    env: {},
    invokeResult: { ok: false, classification: 'not-authenticated' },
    registryProbe: { installed: true },
  });
  assert.strictEqual(installedProbe.kind, 'unauthenticated',
    'a positive probe must not upgrade an unauthenticated call to reached');
});

test('a missing invoke result is transport-unreachable, not silently reached', () => {
  for (const bad of [undefined, null, 'nope', 42]) {
    const r = classify({ env: {}, invokeResult: bad });
    assert.strictEqual(r.reachable, false, 'invokeResult=' + JSON.stringify(bad) + ' must not read as reached');
    assert.strictEqual(r.kind, 'transport');
  }
  // 인자 자체가 없어도 마찬가지.
  assert.strictEqual(classify().reachable, false);
  assert.strictEqual(classify({}).reachable, false);
});
