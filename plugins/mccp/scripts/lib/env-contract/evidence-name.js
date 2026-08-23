'use strict';

// env-contract/evidence-name.js — L10의 순수 판정 코어 (v1.32.0).
//
// **L8과 다른 질문을 한다.** L8은 evidence가 repo-relative이고 파일이 있고 행이 범위
// 안인지만 본다 — 그 셋을 전부 통과하면서 무관한 줄을 가리킬 수 있다. 실측(M5,
// 2026-08-23): `impeccable-detect.js:135`를 19번 적은 항목들이 L8을 `ok`로 통과했고,
// 그 줄은 `isDesignSurfacePath()` 내부였다. 여기서는 한 질문만 더한다 —
// **그 행 근처에 그 이름이 있는가.**
//
// 세 갈래다:
//   정방향  status != 'not-consumed': evidence 행 ±2 창 안에 이름이 있어야 한다.
//           창을 두는 이유는 명령 본문(markdown)에서 이름이 코드 펜스 바로 위 산문에
//           있는 정상 사례가 있기 때문이다. 창 없이 정확 일치를 요구하면 정상 항목이
//           붉어지고, 그러면 «창을 넓히자»는 압력이 생긴다 — 넓히지 말고 evidence를
//           고치는 쪽이 기본이다.
//   역방향  status == 'not-consumed': evidence는 `docs/environment/*.md`의 그 변수
//           자신의 절을 가리켜야 하고, 런타임 표면에 그 이름이 **없어야** 한다.
//           주장이 «mccp는 읽지 않는다»이므로 읽기 시작하면 붉어야 한다. 두 방향이
//           함께 있어야 status가 도피처가 되지 않는다.
//   래칫    `evidence-debt.js`의 **열거된** 이름만 정방향 실패를 면제한다. 목록에
//           있는데 실제로는 통과하는 이름도 실패다 — 래칫은 줄어들기만 한다.
//
// **역방향의 범위는 `walkSurfaces`이고 그것은 주장보다 좁다.** `scan.js`의 `isExcluded`가
// `env-contract`를 경로 substring으로 **디렉토리째** 제외하므로(registry 선언 행이 자기
// 자신을 트리거하는 것을 막으려면 필요하다), 그 디렉토리 안의 미래 코드가 실제로
// `process.env.IMPECCABLE_*`를 읽어도 이 검사는 부재를 계속 인증한다. 즉 이 검사가
// 증명하는 것은 «어디에도 없다»가 아니라 **«walkSurfaces 범위에 없다»** 이다. 좁히는
// 방법은 그 디렉토리에 한해 *읽기 형태*만 따로 스캔하는 2차 검사이며 backlog에 있다
// (Implement-Codex R1 F2, 2026-08-23).
//
// **주입 가능한 순수 함수인 것이 요점이다.** `lint.run()`에는 주입 지점이 없어서,
// 일부러 틀린 evidence를 심은 fixture registry로 래칫 양방향을 단위 test할 수 없다.
// `evidenceLexicalProblem`·`rawComparisonHits`가 이미 같은 이유로 export돼 있다.
// 임시 repo 트리를 만드는 대안은 이 판정이 fs에 의존하지 않는데도 fs를 test에 끌어들인다.

const EVIDENCE_WINDOW = 2;
const NOT_CONSUMED = 'not-consumed';
const DOC_EVIDENCE_PREFIX = 'docs/environment/';

// 경계 일치. 이름은 `[A-Z][A-Z0-9_]*`라 부분 문자열 일치를 쓰면 `MCCP_PLAN_REVIEW_L3`가
// 적힌 행이 `MCCP_PLAN_REVIEW`를 인증한다 — 접두사 충돌이 드리프트를 감춘다.
function nameAppears(text, name) {
  return new RegExp('(?<![A-Za-z0-9_])' + name + '(?![A-Za-z0-9_])').test(text);
}

function evidenceParts(evidence) {
  const m = /^(.*):(\d+)$/.exec(String(evidence == null ? '' : evidence).trim());
  if (!m) return null;
  return { rel: m[1], line: Number.parseInt(m[2], 10) };
}

function windowText(lines, lineNo) {
  const from = Math.max(0, lineNo - 1 - EVIDENCE_WINDOW);
  return lines.slice(from, lineNo + EVIDENCE_WINDOW).join('\n');
}

/**
 * @param {object}   input
 * @param {Array}    input.entries    registry 항목 배열
 * @param {Array}    input.debt       `[{name, axis, klass}]` — 면제 목록. 로드 실패면 null
 * @param {string}   input.debtError  로드 실패 사유 (성공이면 null)
 * @param {Function} input.readLines  (relPath) => string[] | null
 * @param {Array}    input.surfaces   `[{rel, text}]` — 역방향 부재 검사 대상
 * @param {Function} input.lexicalProblem  (evidence) => string|null — L8의 어휘 스크린
 * @returns {string[]} problems
 */
function evidenceNameProblems(input) {
  const opts = input || {};
  const entries = opts.entries || [];
  const readLines = opts.readLines || function () { return null; };
  const surfaces = opts.surfaces || [];
  const lexical = opts.lexicalProblem || function () { return null; };
  const problems = [];

  // 래칫 로더는 fail-closed다: 실패하면 면제 집합이 **빈 집합**이 되고 정방향 검사가
  // 전부 그대로 판정된다. 관대한 방향으로 실패하면 목록이 조용히 전체 면제가 된다
  // (Implement-Codex R1 F1 · plan 게이트 L2 invariant `9c636dcb`).
  if (opts.debtError) {
    problems.push('evidence-debt is unusable, so no exemption applies: ' + opts.debtError);
  }
  const debtRows = Array.isArray(opts.debt) ? opts.debt : [];
  const debt = new Set(debtRows.map(function (r) { return r && r.name; }));
  const debtUnmatched = new Set(debt);

  if (entries.length === 0) {
    problems.push('registry is empty — the evidence-name check would pass vacuously');
  }

  let forwardChecked = 0;
  let reverseChecked = 0;

  entries.forEach(function (e) {
    // 어휘 스크린이 소유하는 실패는 L8이 이미 보고한다. 여기서 다시 세면 같은 결함이
    // 두 줄로 보이고 어느 검사를 고쳐야 하는지가 흐려진다.
    if (lexical(e.evidence)) return;
    const parts = evidenceParts(e.evidence);
    if (!parts) return;

    if (e.status === NOT_CONSUMED) {
      reverseChecked++;
      if (parts.rel.indexOf(DOC_EVIDENCE_PREFIX) !== 0 || !/\.md$/.test(parts.rel)) {
        problems.push(e.name + ': status=' + NOT_CONSUMED + ' requires a ' + DOC_EVIDENCE_PREFIX
          + '*.md anchor as evidence (no read site exists for it), got ' + parts.rel);
      }
      const lines = readLines(parts.rel);
      if (lines && !nameAppears(windowText(lines, parts.line), e.name)) {
        problems.push(e.name + ': evidence anchor ' + e.evidence + ' does not name it — '
          + 'point at that variable\'s own section heading');
      }
      surfaces.forEach(function (s) {
        if (nameAppears(s.text, e.name)) {
          problems.push(e.name + ': declared ' + NOT_CONSUMED + ' but it appears on the runtime '
            + 'surface (' + s.rel + ') — mccp reads it now, so the status is false');
        }
      });
      return;
    }

    const lines = readLines(parts.rel);
    if (!lines) return;   // 읽기 실패는 L8이 «evidence path does not exist»로 보고한다.
    forwardChecked++;
    if (nameAppears(windowText(lines, parts.line), e.name)) {
      if (debt.has(e.name)) {
        problems.push(e.name + ': listed in EVIDENCE_DEBT but its evidence now names it — '
          + 'delete the row (the ratchet only shrinks)');
      }
      debtUnmatched.delete(e.name);
      return;
    }
    if (debt.has(e.name)) { debtUnmatched.delete(e.name); return; }
    problems.push(e.name + ': evidence ' + e.evidence + ' does not name it within +/-'
      + EVIDENCE_WINDOW + ' lines — move it to the real read site');
  });

  // 목록에 남았는데 어느 항목과도 대조되지 않은 이름 = registry에서 사라졌거나 검사에
  // 도달하지 못한 이름. 어느 쪽이든 목록이 화석이 되고 있다는 신호다.
  debtUnmatched.forEach(function (n) {
    problems.push('EVIDENCE_DEBT lists ' + n + ' but no registry entry reached the forward check '
      + 'for it — delete the row or fix the entry');
  });

  // 정방향 대상이 실재하는데 하나도 검사되지 않았다면(예: 모든 evidence가 읽히지 않았다)
  // 그것은 통과가 아니라 드리프트다. 전부 `not-consumed`인 registry는 정방향 대상이
  // 애초에 0이므로 이 가드가 걸리지 않아야 한다 — 없는 대상을 못 셌다고 붉히면 안 된다.
  const forwardEligible = entries.filter(function (e) { return e.status !== NOT_CONSUMED; }).length;
  if (forwardEligible > 0 && forwardChecked === 0) {
    problems.push('no entry reached the forward name check — the check would pass vacuously');
  }
  if (reverseChecked > 0 && surfaces.length === 0) {
    problems.push('not-consumed entries exist but no runtime surface was read — absence cannot be certified');
  }
  return problems;
}

module.exports = {
  evidenceNameProblems: evidenceNameProblems,
  nameAppears: nameAppears,
  EVIDENCE_WINDOW: EVIDENCE_WINDOW,
  NOT_CONSUMED: NOT_CONSUMED,
  DOC_EVIDENCE_PREFIX: DOC_EVIDENCE_PREFIX,
};
