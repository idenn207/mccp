'use strict';

// B1 status drift — 독립 증거 판정 오라클 (PURE).
//
//   adjudicateMilestone({ planBasename, planPath, evidence })
//     → { verdict, source, evidence_ref, codex_verdict, reason }
//
// 이 모듈은 **자체 I/O를 하지 않는다**. receipt 판독·git 조회는 전부 호출자가
// `evidence` 객체로 주입한다. 그래서 "문서를 몰래 다시 읽는" 구현이 애초에 존재할 수
// 없고(독립성의 1차 통제 = 타입 경계), b1-independence-lint.js 가 그 경계를 정적으로
// 지킨다(2차 통제). 함수 시그니처가 문서 status 를 **받지 않는** 것이 핵심이다 —
// 받을 수 없는 값에는 반응할 수 없다.
//
// I/O 는 두 계층이 담당한다:
//   - 증거 구성(유일 지점): b1-evidence-builder.js
//   - 관측/열거:            derive/sources/milestone-evidence.js · archive-complete/scan.js
//
// 판정 질문은 **"이 작업 단위가 ship 됐는가"** 이지 "Codex 가 승인했는가"가 아니다.
// mccp 는 MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE audited override 로 divergent 인 채
// ship 하는 경로를 정식으로 가지며(직전 M5 가 그 경로로 ship 됐다), terminal /mccp:pr 의
// ship gate 는 no-ship 시 finalize 에서 exit 12 로 멈춰 receipt 를 **쓰지 않는다**.
// 따라서 git-tracked ship receipt 의 **존재 자체**가 ship 증거이고, receipt 의 verdict 는
// `codex_verdict` 로 **병기**될 뿐 분자에 영향을 주지 않는다(B3 coReport 병기 패턴).

const VERDICT_SHIPPED = 'shipped';
const VERDICT_NOT_SHIPPED = 'not-shipped';
const VERDICT_UNDETERMINED = 'undetermined';

const RECEIPT_DIR = '.claude/receipts/mccp-pr-codex';

// `evidence` 는 **정확히** 이 5필드다. 여분 키도 누락도 모두 거부한다 — 한쪽만 막으면
// 4필드짜리 evidence 의 `undefined` 가 `false` 로 접혀 **부재가 판정으로 바뀐다**
// (`receiptPresent: undefined` → not-shipped). 그것이 evidence-audit.js E1
// "부재는 결함 부재가 아니다" 의 정확한 위반이다.
const EVIDENCE_FIELDS = [
  'receiptPresent',   // boolean — receipt 가 커밋에 도달 가능(git cat-file -e HEAD:<path>)
  'receiptVerdict',   // string|null — resolution.codex_verdict 원문. 병기 전용, 판정 미사용
  'gitReachable',     // boolean|null — plan 파일이 default branch 에서 도달 가능. null = 조회 실패
  'readError',        // string|null — 조회 중 오류. non-null 이면 undetermined
  'duplicateKey',     // boolean — decision_id 가 다른 행과 충돌
];

// decision_id 파생 규칙. archive-complete/scan.js#decisionFromBasename 과 **동일 규칙**
// 이지만 그 모듈을 import 하지 **않는다** — scan.js 는 fs·child_process 를 직접 require
// 하므로 import 하면 이 모듈의 순수성 주장이 전이 의존으로 깨진다. 두 구현의 동치는
// lint 가 아니라 test(B1-EQ-BASENAME)가 지킨다.
function decisionFromBasename(planBasename) {
  return String(planBasename || '').replace(/\.plan\.md$/i, '');
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// 스키마 검증 책임은 **오라클에 있다**(주입 측이 아니라). 주입 측에 두면 "잘못된
// evidence 를 만든 source" 와 "그것을 믿은 오라클" 의 책임이 섞이고, 오라클 단위 test 가
// malformed 입력을 직접 먹여볼 수 없게 된다.
function validateEvidence(evidence) {
  if (!isPlainObject(evidence)) return 'evidence must be an object';

  const keys = Object.keys(evidence);
  const extra = keys.filter((k) => EVIDENCE_FIELDS.indexOf(k) === -1);
  if (extra.length) return 'unexpected evidence key(s): ' + extra.sort().join(', ');

  const missing = EVIDENCE_FIELDS.filter((k) => keys.indexOf(k) === -1);
  if (missing.length) return 'missing evidence key(s): ' + missing.join(', ');

  if (typeof evidence.receiptPresent !== 'boolean') return 'receiptPresent must be a boolean';
  if (typeof evidence.duplicateKey !== 'boolean') return 'duplicateKey must be a boolean';
  if (evidence.receiptVerdict !== null && typeof evidence.receiptVerdict !== 'string') {
    return 'receiptVerdict must be a string or null';
  }
  if (evidence.readError !== null && typeof evidence.readError !== 'string') {
    return 'readError must be a string or null';
  }
  if (evidence.gitReachable !== null && typeof evidence.gitReachable !== 'boolean') {
    return 'gitReachable must be a boolean or null';
  }
  return null;
}

function undetermined(reason, codexVerdict) {
  return {
    verdict: VERDICT_UNDETERMINED,
    source: null,
    evidence_ref: null,
    codex_verdict: codexVerdict === undefined ? null : codexVerdict,
    reason: reason,
  };
}

function adjudicateMilestone(input) {
  const args = isPlainObject(input) ? input : {};
  const evidence = args.evidence;

  const schemaError = validateEvidence(evidence);
  if (schemaError) return undetermined('evidence-schema-invalid: ' + schemaError, null);

  // 병기 전용. 판정 사다리의 어느 분기도 이 값을 읽지 않는다.
  const codexVerdict = evidence.receiptVerdict;

  const planBasename = typeof args.planBasename === 'string' ? args.planBasename.trim() : '';
  if (!planBasename) return undetermined('no-plan-link: milestone row declares no plan basename', codexVerdict);

  const decisionId = decisionFromBasename(planBasename);
  if (!decisionId) return undetermined('no-plan-link: plan basename yields an empty decision_id', codexVerdict);

  // 충돌 검출은 증거 조회보다 **먼저** 판정한다. 서로 다른 두 행이 같은 basename 을
  // 선언하면 같은 receipt 를 가리켜 verdict 가 조용히 복제되므로, 충돌한 행 **전부**를
  // 강등한다. 첫 행/마지막 행 채택은 금지 — 어느 쪽이 옳은지 증거가 말해주지 않으므로
  // 임의 선택은 오판을 확정하는 것이다.
  if (evidence.duplicateKey) {
    return undetermined('duplicate-decision-id: "' + decisionId + '" is claimed by more than one milestone row', codexVerdict);
  }

  if (evidence.readError !== null) {
    return undetermined('evidence-read-error: ' + evidence.readError, codexVerdict);
  }

  if (evidence.receiptPresent) {
    return {
      verdict: VERDICT_SHIPPED,
      source: 'receipt',
      evidence_ref: RECEIPT_DIR + '/' + decisionId + '.json',
      codex_verdict: codexVerdict,
      reason: 'git-tracked ship receipt is reachable from HEAD',
    };
  }

  // receipt 부재 — 여기서부터는 plan 파일의 default-branch 도달성이 가른다.
  if (evidence.gitReachable === null) {
    return undetermined('git-query-failed: default-branch reachability of the plan file could not be resolved', codexVerdict);
  }

  if (evidence.gitReachable === true) {
    // plan 은 default branch 에 있는데 ship receipt 가 없다 = **증거 공백**이다.
    // §3.12 이전 작업 단위는 receipt 가 git-tracked 가 아니었으므로 이 구간이 정상적으로
    // 존재한다. `not-shipped` 로 단정하면 과거를 drift 로 오계상한다 —
    // evidence-audit.js E1("부재는 결함 부재가 아니다")의 동형이다.
    return undetermined('evidence-gap: plan reached the default branch but no git-tracked ship receipt exists', codexVerdict);
  }

  return {
    verdict: VERDICT_NOT_SHIPPED,
    source: 'git',
    evidence_ref: typeof args.planPath === 'string' && args.planPath
      ? String(args.planPath).split('\\').join('/')
      : null,
    codex_verdict: codexVerdict,
    reason: 'no ship receipt and the plan file is not reachable on the default branch',
  };
}

// drift 판정식. 문서 status ↔ 증거 verdict 의 대조이며, 이 함수만 문서 status 를 본다.
// **오라클 모듈이 아니라 판정 결합부**이므로 여기서 status 를 읽는 것이 계약에 맞다 —
// 다만 lint 축 (iii) 가 오라클 모듈 전체에 status 리터럴 0 을 요구하므로, 비교는
// 리터럴이 아니라 호출자가 넘기는 집합으로 한다(아래 SHIPPED_SIDE/UNSHIPPED_SIDE 는
// derive source 가 소유하고 주입한다).
function isDrift(docSideExpectsShipped, evidenceVerdict) {
  if (evidenceVerdict === VERDICT_UNDETERMINED) return false;
  if (docSideExpectsShipped === null || docSideExpectsShipped === undefined) return false;
  return docSideExpectsShipped !== (evidenceVerdict === VERDICT_SHIPPED);
}

module.exports = {
  adjudicateMilestone,
  decisionFromBasename,
  isDrift,
  EVIDENCE_FIELDS,
  RECEIPT_DIR,
  VERDICT_SHIPPED,
  VERDICT_NOT_SHIPPED,
  VERDICT_UNDETERMINED,
};
