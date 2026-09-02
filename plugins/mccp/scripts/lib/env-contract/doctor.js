'use strict';

// env-contract/doctor.js — 설정 진단의 순수 판정 오라클 (M1).
//
// **env도 fs도 만지지 않는다.** 계층 읽기(`settings-layers.js`)와 어휘 해석
// (`vocabulary.js`)은 CLI가 수행해 인자로 넘긴다 — 판정 함수가 자기 입력을 직접
// 수집하면 판정 경계를 단위 test로 고정할 수 없다.
// mirror: plan-review/decide.js — 인자만 받는 판정 함수.
//
// **게이트가 아니다(DD6·UI13).** hook 등록 0건, receipt 0건이며 어떤 게이트도 이
// 결과를 읽지 않는다. 종료코드는 사람과 스크립트를 위한 것이지 자동 차단을 위한 것이
// 아니다.
//
// **소유하지 않는 이름에는 등급이 없다(DD5·UI6).** `MCCP_*`가 아닌 이름은 기본
// 미표시이고 `--all`에서도 **값 없이 이름만** 나간다 — 이 도구는 프로세스 전체 env를
// 볼 수 있으므로, 소유하지 않는 이름의 값까지 출력하면 진단이 유출 경로가 된다.

const MCCP_NAME_RE = /^MCCP_/;

// ── 하네스 표지 ─────────────────────────────────────────────────────────────
// `settings.json` 의 `env` 블록은 Claude Code 가 spawn 한 프로세스에만 주입된다.
// 따라서 평범한 셸에서 이 도구를 돌리면 선언된 토글 **전부**가 «도달하지 않았다»로
// 보인다 — 참이지만 쓸모없는 참이고, error 21건 + exit 1 은 정상 저장소를 고장난
// 것처럼 보고한다(실측). 그 오탐을 한 번 겪은 사람은 진짜 drift 신호도 함께 무시한다.
//
// 표지가 없을 때 **판정을 낮추는 쪽**을 고른 이유: 이 도구는 «선언이 도달했는가»를
// 묻는데, 하네스 밖에서는 그 질문 자체가 성립하지 않는다(주입하는 주체가 없다).
// 모르는 것을 error 로 부르지 않는다는 것은 이 모듈의 어휘 판정
// (`v.ok` 가 아니면 판정하지 않는다)이 이미 지키는 규약이고, 여기서도 같다.
const HARNESS_MARKERS = Object.freeze(['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT']);

function detectHarness(processEnv) {
  const e = processEnv || {};
  return HARNESS_MARKERS.some(function (k) {
    return Object.prototype.hasOwnProperty.call(e, k) && String(e[k]).trim() !== '';
  });
}

const SEVERITY = Object.freeze({
  error: 'error',
  warning: 'warning',
  info: 'info',
  silent: 'silent',
});

// DD6 (M2) — 미상 멤버의 처리 방향은 파서마다 다르고 이 계약은 그것을 **바꾸지 않고
// 보고한다**(UI12). 표 본문은 `vocabulary.js`가 소유한다 — L12도 같은 사실을 읽어야
// 하므로, 두 소비처가 같은 표를 본다는 것이 import 그래프에 남아야 한다. 재-export하지
// 않는다: 여기서 다시 내보내면 소비처가 어느 쪽을 정본으로 삼는지가 다시 흐려진다.
const { LIST_MEMBER_POLICY } = require('./vocabulary');

function splitList(value) {
  return String(value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

/**
 * @param {object} input
 * @param {object} input.declared      settings-layers.readLayers().declared
 * @param {object} input.processEnv    프로세스 env의 스냅샷 (읽기만 한다)
 * @param {Array}  input.entries       registry.ENTRIES
 * @param {object} input.vocabularies  name → resolveVocabulary 결과
 * @param {Map}    input.quarantine    vocabulary.quarantineByName()
 * @param {boolean} [input.all]        소유하지 않는 이름까지 (이름만) 표면화
 * @param {boolean} [input.harness]    이 프로세스가 하네스에서 태어났는가 (기본 true).
 *                                     false 면 `not-received` 를 error 로 세지 않는다.
 * @returns {{findings:Array, counts:object, ok:boolean}}
 */
function diagnose(input) {
  const o = input || {};
  const declared = o.declared || {};
  const processEnv = o.processEnv || {};
  const entries = o.entries || [];
  const vocabularies = o.vocabularies || {};
  const quarantine = o.quarantine || new Map();
  const all = o.all === true;
  // 미지정은 «하네스 안»으로 본다 — 호출자가 표지를 넘기지 않았다면 판정을 낮출
  // 근거가 없고, 낮추는 쪽이 기본이 되면 진짜 미도달이 조용히 info 로 접힌다.
  const harness = o.harness === undefined ? true : o.harness === true;

  const byName = new Map();
  entries.forEach(function (e) { byName.set(e.name, e); });

  const findings = [];
  const undelivered = [];
  const push = function (code, severity, name, message, extra) {
    const f = { code: code, severity: severity, name: name, message: message };
    if (extra) Object.keys(extra).forEach(function (k) { f[k] = extra[k]; });
    findings.push(f);
  };

  // ── 층 D — 선언한 값이 프로세스에 도달했는가 ──────────────────────────────
  Object.keys(declared).sort().forEach(function (name) {
    const d = declared[name];
    const owned = MCCP_NAME_RE.test(name);
    const present = Object.prototype.hasOwnProperty.call(processEnv, name);

    if (!owned) {
      // 소유하지 않는 이름은 선언돼 있어도 등급을 주지 않는다. 값은 절대 싣지 않는다.
      if (all) push('foreign-name', SEVERITY.info, name, '이 계약이 소유하지 않는 이름 (값 미표시)', { layer: d.layer });
      return;
    }
    if (!present) {
      undelivered.push({ name: name, layer: d.layer, declared: d.value });
      return;
    }
    const actual = String(processEnv[name]);
    if (actual !== d.value) {
      push('value-diverged', SEVERITY.error, name,
        d.layer + ' 계층 선언값과 프로세스 값이 다르다',
        { layer: d.layer, declared: d.value, actual: actual });
    }
  });

  if (undelivered.length && harness) {
    undelivered.forEach(function (u) {
      push('not-received', SEVERITY.error, u.name,
        u.layer + ' 계층이 선언했으나 프로세스 env에 없다', { layer: u.layer, declared: u.declared });
    });
  } else if (undelivered.length) {
    // 이름별로 쪼개지 않고 한 건으로 묶는다. 하네스 밖에서는 21건이 21개의 서로 다른
    // 사실이 아니라 **한 가지 사실**(주입하는 주체가 없었다)의 21개 사본이다.
    push('env-delivery-unverifiable', SEVERITY.info, '*',
      '하네스 밖에서 실행돼 선언값 도달 여부를 인증할 수 없다 — `settings.json` 의 `env` 는 '
        + 'Claude Code 가 spawn 한 프로세스에만 주입된다. 미도달 ' + undelivered.length + '건은 '
        + '설정 결함이 아니라 이 실행 맥락의 결과다. 실제 도달 여부를 보려면 Claude Code 세션 '
        + '안에서(예: Bash 도구로) 다시 돌려라.',
      { count: undelivered.length, names: undelivered.map(function (u) { return u.name; }) });
  }

  // ── 프로세스에만 있는 이름 ────────────────────────────────────────────────
  Object.keys(processEnv).sort().forEach(function (name) {
    if (Object.prototype.hasOwnProperty.call(declared, name)) return;
    if (!MCCP_NAME_RE.test(name)) {
      if (all) push('foreign-name', SEVERITY.info, name, '이 계약이 소유하지 않는 이름 (값 미표시)');
      return;
    }
    if (!byName.has(name)) {
      push('unregistered-mccp', SEVERITY.error, name,
        'MCCP_* 이름인데 레지스트리에 없다 — 등재하거나 은퇴시켜야 한다',
        { actual: String(processEnv[name]) });
      return;
    }
    push('ambient', SEVERITY.info, name,
      '프로세스에는 있으나 어느 계층도 선언하지 않았다 (셸·부모 프로세스 유래)',
      { actual: String(processEnv[name]) });
  });

  // ── 값의 어휘 정합 ────────────────────────────────────────────────────────
  entries.forEach(function (e) {
    if (!Object.prototype.hasOwnProperty.call(processEnv, e.name)) return;
    const actual = String(processEnv[e.name]);
    if (actual === '') return;

    // DD4 — 격리된 토글에는 절대 `ok`를 주지 않는다. 순진한 doctor는 오늘의 `values`를
    // 믿고 "정상"을 보고하는데, 격리 항목은 바로 그 `values`가 코드와 어긋난 것들이다.
    const q = quarantine.get(e.name);
    if (q) {
      push('contract-drift', SEVERITY.warning, e.name,
        '이 토글은 계약 격리 대상이라 값 판정을 신뢰할 수 없다 — ' + q.reason,
        { actual: actual, expected: q.expected, codeVocabulary: q.actual, owner: q.owner });
      return;
    }

    const v = vocabularies[e.name];
    if (!v || !v.ok) return; // 어휘를 모르면 판정하지 않는다. 모름은 위반이 아니다.

    if (e.kind === 'list') {
      const unknown = splitList(actual).filter(function (m) { return v.values.indexOf(m) === -1; });
      if (unknown.length) {
        push('list-member-unknown', SEVERITY.warning, e.name,
          '열거 밖 멤버: ' + unknown.join(', ') + ' — '
            + (LIST_MEMBER_POLICY[e.name] || '이 파서의 처리 방향은 문서화되지 않았다'),
          { actual: actual, unknown: unknown });
      }
      return;
    }
    if (v.values.indexOf(actual) === -1) {
      push('value-outside-vocabulary', SEVERITY.warning, e.name,
        '코드 어휘 밖의 값이다 — 별칭으로 우연히 동작할 수는 있으나 계약상 보장되지 않는다',
        { actual: actual, vocabulary: v.values, source: v.source });
    }
  });

  const counts = { error: 0, warning: 0, info: 0, silent: 0 };
  findings.forEach(function (f) { counts[f.severity] = (counts[f.severity] || 0) + 1; });

  return { findings: findings, counts: counts, ok: counts.error === 0 };
}

module.exports = {
  diagnose: diagnose,
  detectHarness: detectHarness,
  HARNESS_MARKERS: HARNESS_MARKERS,
  SEVERITY: SEVERITY,
  MCCP_NAME_RE: MCCP_NAME_RE,
};
