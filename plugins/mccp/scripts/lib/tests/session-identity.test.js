'use strict';

// multi-session-work-loop M8 (DD1 · DD2) — 세션 식별 단일 진실원의 gate.
//
// 무엇이 결함이었나: `CLAUDE_SESSION_ID`는 이 하네스의 CLI가 설정하지 않는데
// 런타임 12곳이 그 이름을 단독으로 읽었다. `observer-sessions.resolveSessionId`가
// 항상 빈 문자열을 반환했고, 그 falsy 값이 `session-start.js`/`session-end.js`의
// M2 계측 블록 전체를 실행되지 않게 만들어 A1·A2·B3 producer가 한 줄 때문에
// 전부 죽었다.
//
// 왜 이 파일이 gate인가: 체인을 한곳으로 모으는 것만으로는 **다음에 누가 그 이름을
// 다시 적는 것**을 막지 못한다. 아래 (a)~(c)는 전부 이 파일 안의 assert이고 사람
// 개입이 없다 — 작성 시점에 legacy read를 한 번 심어 red를 확인한 것은 단언이
// 실제로 무언가를 잡는지에 대한 저자 확인이지 gate가 아니다.
//
// 이 gate가 주장하지 않는 것:
//   - (a)의 범위는 `env-contract/scan.js#walkSurfaces`가 소유한다(L4·L9와 같은
//     계약). 그 walk는 `env-contract/` 디렉토리 전체와 test를 제외하므로 그 안의
//     read는 이 단언의 사거리 밖이다. 넓히는 것은 env-contract 축 소관이다.
//   - (b)는 **텍스트 검사이지 데이터 흐름 분석이 아니다.** 한 줄 안의 직접 도달과
//     sanitizer 부재를 잡을 뿐, 변수를 몇 단계 거쳐 파일명이 되는 경로는 못 본다.
//     DD1이 인정한 잔여(raw 반환 계약)를 구조가 아니라 test가 막고 있다는 뜻이고,
//     그 한계를 여기 적어 둔다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const scan = require('../env-contract/scan');
const { resolveRawSessionId, SESSION_ID_ENV_NAMES } = require('../session-identity');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

// 체인의 유일한 선언 지점. (a)가 이 파일만 면제한다.
const CHAIN_OWNER_REL = 'plugins/mccp/scripts/lib/session-identity.js';

// sanitizer로 인정하는 토큰. 파일명 성분을 안전하게 만드는 실제 수단들이다.
const SANITIZER_TOKENS = [
  'sanitizeSessionId',
  'sanitizeSessionKey',
  'SESSION_ID_RE',
  'replace(/[^a-zA-Z0-9_-]',
];

function readSurfaceJs() {
  const files = scan.walkSurfaces(REPO_ROOT).filter(function (rel) { return rel.endsWith('.js'); });
  assert.ok(files.length > 0,
    'walkSurfaces yielded no .js files — every absence check below would pass vacuously');
  return files.map(function (rel) {
    return { rel: rel, text: fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8') };
  });
}

test('M8-ROOT-SINGLE-SOURCE: (a) the legacy session variable is read nowhere on the runtime surface but the chain owner', function () {
  // 리터럴을 조립해서 쓴다 — `isExcluded`가 `.test.js`를 제외하므로 이 파일이
  // 자기 자신을 잡지는 않지만, 조립해 두는 편이 의도를 읽는 사람에게 분명하다.
  const NEEDLE = 'process.env.' + 'CLAUDE_SESSION_ID';

  const offenders = [];
  readSurfaceJs().forEach(function (entry) {
    if (entry.rel === CHAIN_OWNER_REL) return;
    entry.text.split(/\r?\n/).forEach(function (line, i) {
      if (line.indexOf(NEEDLE) !== -1) {
        offenders.push(entry.rel + ':' + (i + 1) + ' — ' + line.trim());
      }
    });
  });

  assert.deepEqual(offenders, [],
    'legacy single-variable reads must route through session-identity.resolveRawSessionId:\n  '
    + offenders.join('\n  '));
});

// raw 값이 묶인 식별자를 뽑는다. `const x = …resolveRawSessionId(…)` 와
// 기본값 파라미터 `f(a, x = resolveRawSessionId(env))` 두 형태를 모두 본다.
//
// **바인딩 지점에서 이미 sanitize된 것은 raw가 아니다.** `const sessionId =
// sanitizeSessionId(resolveRawSessionId(env))`는 그 이름에 안전한 값을 담으므로
// 추적 대상이 아니고, 추적하면 같은 이름을 쓰는 다른 스코프의 정상 경로 생산이
// 전부 오탐이 된다(실측: ecc-context-monitor). 파일 경계도 스코프 경계도 넘지
// 않는다는 한계는 헤더에 적혀 있다.
function boundRawIdentifiers(text) {
  const names = new Set();
  const declRe = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]*resolveRawSessionId\s*\([^;\n]*)/g;
  const paramRe = /([A-Za-z_$][\w$]*)\s*=\s*(resolveRawSessionId\s*\([^;\n)]*\))/g;
  let m;
  const consider = function (name, expr) {
    const sanitizedAtBinding = SANITIZER_TOKENS.some(function (tok) { return expr.indexOf(tok) !== -1; });
    if (!sanitizedAtBinding) names.add(name);
  };
  while ((m = declRe.exec(text)) !== null) consider(m[1], m[2]);
  while ((m = paramRe.exec(text)) !== null) consider(m[1], m[2]);
  return Array.from(names);
}

// 주석은 코드가 아니다 — 산문에 백틱이 들어가면 파일명 생산으로 오독된다.
function isCommentLine(line) {
  const t = line.trim();
  return t.indexOf('//') === 0 || t.indexOf('*') === 0 || t.indexOf('/*') === 0;
}

test('M8-ROOT-NO-PATH-REACH: (b) the raw resolved id never reaches path production directly', function () {
  const inlineReach = [];
  const boundReach = [];

  readSurfaceJs().forEach(function (entry) {
    if (entry.rel === CHAIN_OWNER_REL) return;
    if (entry.text.indexOf('resolveRawSessionId(') === -1) return;

    const lines = entry.text.split(/\r?\n/);

    // (b1) 한 줄 안에서 raw 값이 곧바로 경로가 되는 형태.
    lines.forEach(function (line, i) {
      if (line.indexOf('resolveRawSessionId(') !== -1 && line.indexOf('path.join(') !== -1) {
        inlineReach.push(entry.rel + ':' + (i + 1) + ' — ' + line.trim());
      }
    });

    // (b2) raw 값이 묶인 **그 식별자**가 경로 생산 표현식에 등장하는 형태.
    // 파일이 `path.join`을 쓴다는 사실만으로는 아무것도 말하지 않는다(대부분
    // 세션 id와 무관한 경로다) — 실측 결과 그 거친 판정은 오탐 6건을 냈고,
    // 그 6건 모두 값이 `session_id` 필드나 비교에만 쓰였다.
    boundRawIdentifiers(entry.text).forEach(function (name) {
      const usage = new RegExp('\\b' + name + '\\b');
      lines.forEach(function (line, i) {
        if (isCommentLine(line)) return;
        const buildsPath = line.indexOf('path.join(') !== -1 || line.indexOf('`') !== -1;
        if (!buildsPath || !usage.test(line)) return;
        if (line.indexOf('resolveRawSessionId') !== -1) return;   // 선언 줄 자신
        const sanitized = SANITIZER_TOKENS.some(function (tok) { return line.indexOf(tok) !== -1; });
        if (!sanitized) boundReach.push(entry.rel + ':' + (i + 1) + ' (' + name + ') — ' + line.trim());
      });
    });
  });

  assert.deepEqual(inlineReach, [],
    'raw session id must pass a sanitizer before becoming a path component:\n  '
    + inlineReach.join('\n  '));
  assert.deepEqual(boundReach, [],
    'an identifier bound to the raw chain reaches path/filename production unsanitized:\n  '
    + boundReach.join('\n  '));
});

test('M8-ROOT-CHOKE-POINTS: (b3) the two choke points that turn a session id into a filename actually reject traversal', function () {
  // 위의 (b1)·(b2)는 텍스트다. 이것은 동작이다 — 세션 id가 실제로 파일명이 되는
  // 두 지점을 호출해 탈출 입력이 거절되는지 본다. 보안 리뷰 R1이 지목한 축이다.
  const mswEvents = require('../../state/msw-events');
  const observer = require('../observer-sessions');

  assert.ok(mswEvents.SESSION_ID_RE instanceof RegExp, 'msw-events must expose its filename guard');
  assert.equal(mswEvents.SESSION_ID_RE.test('8ab2b06d-3371-410c-965e-0154e89021fb'), true,
    'a real session uuid must pass — narrowing this guard turns live producers into silent no-ops');
  ['../../evil', 'a/b', 'a\\b', 'a.b', '', '.'].forEach(function (bad) {
    assert.equal(mswEvents.SESSION_ID_RE.test(bad), false, 'must reject ' + JSON.stringify(bad));
    assert.throws(
      function () { mswEvents.appendEvent(bad, { kind: 'session_start' }, { repoRoot: REPO_ROOT }); },
      function (err) { return err && err.code === 'invalid_session_id'; },
      'appendEvent must refuse ' + JSON.stringify(bad) + ' before it becomes a filename');
  });

  // observer 쪽은 거절이 아니라 sanitize다 — 반환 계약이 빈 문자열이므로.
  assert.equal(observer.resolveSessionId('../../evil').indexOf('/'), -1,
    'observer must strip path separators out of the lease filename component');
  assert.equal(observer.resolveSessionId('../../evil').indexOf('.'), -1,
    'observer must strip dots so the component cannot traverse');
});

// ── (c) 정규화 계약은 불변, 죽어 있던 후보만 살아난다 ────────────────────────
//
// "변환 전후 동일"을 문자 그대로 4개 해소기 전부에 요구할 수는 없다 —
// `observer-sessions`와 `session-bridge`의 체인은 **깨져 있었고** 그것을 고치는
// 것이 이 milestone 자체다. 그래서 축을 둘로 나눈다: 이미 완전한 체인을 갖고
// 있던 둘은 8조합 전수 등가를, 깨져 있던 둘은 (정규화 불변 + 죽은 후보 부활)을
// 단언한다. 어느 쪽도 결함을 보존하라고 요구하지 않는다.

function envCombos() {
  const out = [];
  [null, 'A'].forEach(function (a) {
    [null, 'B'].forEach(function (b) {
      [null, 'C'].forEach(function (c) {
        const env = {};
        if (a) env.MCCP_SESSION_ID = a;
        if (b) env.CLAUDE_CODE_SESSION_ID = b;
        if (c) env.CLAUDE_SESSION_ID = c;
        out.push(env);
      });
    });
  });
  return out;
}

test('M8-ROOT-CONTRACT-PRESERVED: (c1) resolvers that already had the full chain are byte-equivalent across all 8 combos', function () {
  const evidenceLock = require('../../receipt/evidence-lock');
  const runaway = require('../orchestration-runaway');

  const combos = envCombos();
  assert.equal(combos.length, 8, 'the contract is three variables, so exactly 8 combinations');

  combos.forEach(function (env) {
    // 변환 이전 체인을 리터럴로 재현한다 — 새 모듈을 호출하면 자기 자신과
    // 비교하게 되어 아무것도 증명하지 못한다.
    const legacyRaw = env.MCCP_SESSION_ID || env.CLAUDE_CODE_SESSION_ID || env.CLAUDE_SESSION_ID || '';
    const trimmed = String(legacyRaw).trim();
    const legacyEvidence = trimmed && trimmed !== 'unknown' ? trimmed : null;
    const legacyRunaway = env.MCCP_SESSION_ID || env.CLAUDE_CODE_SESSION_ID || env.CLAUDE_SESSION_ID || 'unknown';

    assert.equal(evidenceLock.resolveSessionId(env), legacyEvidence,
      'evidence-lock normalization changed for ' + JSON.stringify(env));
    assert.equal(runaway.resolveSessionKey(env), legacyRunaway,
      'orchestration-runaway normalization changed for ' + JSON.stringify(env));
  });
});

test('M8-ROOT-DEAD-CANDIDATE-REVIVED: (c2) resolvers whose chain was broken keep their return contract and gain the dead candidate', function () {
  const observer = require('../observer-sessions');
  const bridge = require('../session-bridge');
  const utils = require('../utils');

  const saved = {};
  SESSION_ID_ENV_NAMES.forEach(function (n) { saved[n] = process.env[n]; });
  const restore = function () {
    SESSION_ID_ENV_NAMES.forEach(function (n) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    });
  };

  try {
    envCombos().forEach(function (env) {
      SESSION_ID_ENV_NAMES.forEach(function (n) {
        if (env[n] === undefined) delete process.env[n];
        else process.env[n] = env[n];
      });

      const raw = resolveRawSessionId(process.env);

      // 반환 계약 불변: observer는 빈 문자열을, bridge는 null을 유지한다.
      assert.equal(observer.resolveSessionId(), utils.sanitizeSessionId(raw || '') || '',
        'observer-sessions must keep its empty-string contract for ' + JSON.stringify(env));
      assert.equal(bridge.resolveSessionId(), utils.sanitizeSessionId(raw),
        'session-bridge must keep its null contract for ' + JSON.stringify(env));
    });

    // 죽어 있던 후보가 실제로 살아났는가 — 이 단언이 red이면 milestone의 뿌리가
    // 고쳐지지 않은 것이다. 변환 이전 두 해소기는 여기서 빈 값을 냈다.
    SESSION_ID_ENV_NAMES.forEach(function (n) { delete process.env[n]; });
    process.env.CLAUDE_CODE_SESSION_ID = 'runtime-injected-id';

    assert.equal(observer.resolveSessionId(), 'runtime-injected-id',
      'observer-sessions must now see CLAUDE_CODE_SESSION_ID — this is the blocker M8 removes');
    assert.equal(bridge.resolveSessionId(), 'runtime-injected-id',
      'session-bridge must now see CLAUDE_CODE_SESSION_ID');
  } finally {
    restore();
  }
});

test('(c3) the chain order is declared once and matches the resolver', function () {
  assert.deepEqual(SESSION_ID_ENV_NAMES,
    ['MCCP_SESSION_ID', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_SESSION_ID'],
    'priority: explicit override, then the name the runtime actually injects, then legacy');

  assert.equal(resolveRawSessionId({ MCCP_SESSION_ID: 'a', CLAUDE_CODE_SESSION_ID: 'b', CLAUDE_SESSION_ID: 'c' }), 'a');
  assert.equal(resolveRawSessionId({ CLAUDE_CODE_SESSION_ID: 'b', CLAUDE_SESSION_ID: 'c' }), 'b');
  assert.equal(resolveRawSessionId({ CLAUDE_SESSION_ID: 'c' }), 'c');
  assert.equal(resolveRawSessionId({}), '', 'absence is the empty string — every consumer branches on falsy');
  assert.equal(resolveRawSessionId({ MCCP_SESSION_ID: '  spaced  ' }), 'spaced', 'trimmed');
});
