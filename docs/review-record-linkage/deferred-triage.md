# review-record-linkage — backlog 분류 (M5 Task 7)

> **이 문서의 목적은 이연을 유실과 구분하는 것이다.** DD8은 backlog·Open Questions의
> 종결을 M6에 맡기지만, 분류 없이 "다음 마일스톤"이라고 적는 것은 이연이 아니라 유실이다.
> 그래서 M5는 **닫지 않되 남김없이 센다**.
>
> 생성: 2026-09-04 · 원본: [`.claude/plans/codex-findings-backlog.md`](../../.claude/plans/codex-findings-backlog.md)

## 세는 규칙 (먼저 못박는다)

행 하나를 이 PRD의 것으로 세는 기준은 **`Source plan` 열이 `review-record-linkage`를
포함하는가**다. 본문 어디든의 문자열 등장이 아니다 — 다른 PRD의 finding이 이 PRD를
*언급*하는 경우가 실제로 3건 있고, 그것을 세면 남의 축을 이 PRD의 부채로 옮기게 된다.

| 규칙 | 값 |
|---|---|
| backlog 전체 행 | 1461 |
| `Source plan` 열 기준 이 PRD | **103** |
| 그중 M5 자신의 사이클이 낳은 행 | 16 |
| M5 이전 누적 | **87** |

### plan F10의 숫자를 정정한다

plan의 관측표 F10은 "이 PRD의 backlog 잔량은 **79행**"이라 적고 그 아래에 내역을
열거했다. **두 값이 서로 다르고 둘 다 틀렸다** — 열거를 더하면 90이고 산문은 79다.

| 출처 | 값 | 왜 |
|---|---|---|
| F10 산문 | 79 | 근거 불명. 열거 합계와도 어긋난다 |
| F10 열거 합계 | 90 | 줄 전체 grep 기준(다른 PRD의 언급 3건 포함) + PRD-level MEDIUM을 9로 셈 |
| 본 문서 (측정) | **87** | `Source plan` 열 기준, M5 자신의 16행 제외 |

차이의 대부분은 세는 규칙이다(줄 grep 90 대 열 기준 87 = 언급 3건). 산문의 79는 어느
규칙으로도 재현되지 않는다. **이 정정 자체가 M5가 닫으려는 종류의 결함**이므로 —
근거 없는 수치를 관측표에 적는 것 — 지우지 않고 남긴다.

## 분류 결과

| 버킷 | 뜻 | 건수 |
|---|---|---|
| (a) 이미 해소 | 행에 해소 마커가 있거나 이 사이클이 코드로 확인함 | **6** |
| (b) M5가 이 사이클에 흡수 | plan 본문·구현·Validation에 반영 완료 | **10** |
| (c) M6 이연 | 판정 대상이나 M5 범위 밖 | **73** |
| (d) `FAIL` 버킷 | §3.14 해제 조건에 걸린 합성 행 — 개별 판정하지 않음 | **14** |
| **합계** | | **103** |

누락 0. 마일스톤별:

| 출처 | (a) | (b) | (c) | (d) | 계 |
|---|---|---|---|---|---|
| M1 | 0 | 0 | 27 | 2 | 29 |
| M3 | 1 | 0 | 20 | 4 | 25 |
| M4 | 0 | 0 | 8 | 4 | 12 |
| M5 | 0 | 10 | 2 | 4 | 16 |
| PRD-level | 5 | 0 | 16 | 0 | 21 |

(c) 73행의 심각도 분포: HIGH 17 · MEDIUM 32 · LOW 22 · INFO 2.

## (a) 이미 해소 — 6행, 각각 근거

| 행 | 출처 | 해소 근거 |
|---|---|---|
| L1278 | PRD HIGH | 행 자체가 `[ABSORBED → v1.34.2, 2026-09-02]` 마커를 보유 — 분자를 자격 집합 위에서만 세고 분모를 그 크기로 바꿨다 |
| L1279 | PRD HIGH | 행 자체가 `[RESOLVED → 2026-09-02]` 마커를 보유 |
| L1382 | PRD HIGH | 행 자체가 "기각, 증거 첨부"로 §3.14의 증거 의무를 이미 이행 |
| L1475 | PRD LOW | 행 자체가 `기각(REJECT_YAGNI) — 증거 첨부` |
| L1379 | M3 MEDIUM | **이 사이클이 코드로 확인.** `plan-review-cli-emit.test.js` 12 pass / 0 fail (2026-09-04 실측). 해소자는 [`plan-review/cli.js:290-302`](../../plugins/mccp/scripts/lib/plan-review/cli.js)의 `opts.gitDir` 프로그래매틱 시임(ci-full-suite M2 갈래 H) — 셸 호출자가 닿을 수 없는 자리라 캡 우회가 구조적으로 닫혀 있다 |
| L1467 | PRD MEDIUM | 같은 결함의 PRD-level 중복 기재. 같은 근거로 해소 (plan F9) |

## (b) M5가 흡수 — 10행

L2 패널 blocking 8건(HIGH)은 plan 본문에 반영됐고, 이 구현이 그 반영을 코드로
실현했다. 각 행의 **반증 수단**을 함께 적는다 — "흡수했다"는 주장은 그것을 붉게 만들
수 있는 test가 있어야 검증 가능하다.

| 행 | 지적 | 이 사이클의 처리 | 반증 수단 |
|---|---|---|---|
| L1481 · L1486 · L1490 | DD5 사유 이분화가 동결 baseline 바이트를 확정적으로 깬다 | 이분화를 `post_baseline`에만 적용. `pre_baseline`은 봉인 문자열 그대로 | `linkage-frozen-baseline.test.js` (바이트 동일) + `linkage-audit.test.js` "the FROZEN partition keeps its sealed reason string verbatim" |
| L1483 | 유일한 탐지 채널이 `MCCP_CODEX_DISABLED` 하나로 조용히 꺼진다 | DD4a — 배너를 가드 **밖** 자기 블록으로. throttle도 자기 필드(`install_skew_at`·`install_skew_state`) | `install-skew-wiring.test.js` "DD4a — the skew banner lives OUTSIDE the MCCP_CODEX_DISABLED guard" (중괄호 정합으로 블록 범위를 실제로 계산) |
| L1485 | UI6의 유일한 falsifier가 Validation에 없다 | Validation 2에 `linkage-frozen-baseline.test.js` 편입 | plan `## Validation` 검사 2 |
| L1487 | `dep-check.js` 계약을 단언하는 기존 suite를 안 돌린다 | Validation 2에 `dep-check.test.js` 편입 | 같음 |
| L1488 | `session-start.js` dep-check 블록 전용 suite를 안 돌린다 | Validation 2에 `session-start-dep-check.test.js` 편입 | 같음 |
| L1491 | DD7이 선언한 감사 우회 경로가 실재하지 않는다 | DD7 재작성 — 실제로 한 일(마일스톤 슬러그 원장 키잉)을 적고 재봉인이 이탈임을 명시 | `describeRoundCapRecovery` (`plan-review/cli.js:387-405`)가 직접 반박 |
| L1493 | `CLAUDE_PLUGIN_ROOT` UNC → SMB/NTLM 유출 | shape 검증을 모든 fs/git 접촉 **앞**에 배치 | `install-skew.test.js` "an unsafe override folds to override_unjudged and never touches it" (git 호출 기록으로 미접촉을 단언) |
| L1494 | 출력 sanitization · containment · timeout · argv 방어층 | 신규 코드에 결함을 심지 않는 선에서 함께 흡수 | `install-skew.test.js` 경로-형태 4종 단언 + `isInsideCache` traversal/suffix/case 단언 |

## (c) M6 이연 — 73행

M5는 이 73행을 **판정하지 않는다.** DD8의 근거가 그것이다: 79(측정 87)행을 M5의
acceptance에 넣으면 이 마일스톤의 완료 기준이 "판정 N건"이 되어 라이브 실값 축이 그
안에 묻힌다. UI4(동작하지 않은 기능)를 M5가 닫고, UI1~UI3(원장 종결)을 M6가 닫는다.

이연 중 **사유를 명시해야 하는 것 하나**를 여기 적는다 (plan Task 5(b)가 철회한 항목):

- **backlog L1454 — `--check-round-structure`의 강제 범위 문구.** 초안은 M5가 "문구로
  닫는다"고 했으나 그 문구는 [`linkage-audit.js:687-689`](../../plugins/mccp/scripts/lib/linkage-audit.js)에
  **이미 있다**(`REPORT only — the enforced denominator is the M4 landing boundary…`).
  실질 변경 0인 작업을 HIGH 항목의 종결로 기록하는 것은 이 마일스톤이 닫으려는 종류의
  거짓 완료다. **이연 사유**: 범위를 지표 범위로 넓히려면 M4 착지 경계 **이전** 레코드를
  강제 대상에 넣어야 하는데 그것은 UI6(소급 금지) 위반이다. 즉 이 항목은 문구 수정이
  아니라 **지표 정의 자체**를 다시 여는 작업이고 M5 범위 밖이다.

나머지 72행은 원본 backlog에 그대로 있고 행 번호로 추적 가능하다. M6가 그 위에서
작업한다.

## (d) `FAIL` 버킷 — 14행, 개별 판정하지 않는다

`Severity=FAIL` 14행(M1 2 · M3 4 · M4 4 · M5 4)은 리뷰어가 낸 실질 지적이 아니라
`quorum.js:175-181`이 bare `verdict='fail'`을 `severity:'FAIL'` blocking finding으로
**합성**한 것이다. CLAUDE.md §3.14가 그 결함을 명시하고 해제 조건까지 적어 두었다 —
`quorum.js`가 자기 findings의 최고 severity로 재계산하거나 계약 위반을 `malformed`로
분류하게 되면 §3.14와 이 행들을 함께 정리한다.

따라서 이 14행을 개별 판정하는 것은 **같은 지적을 두 번 세는 것**이다. 각 리뷰어의
실질 지적은 이미 같은 리뷰의 HIGH/MEDIUM 행으로 따로 적재돼 있다. 이 버킷은 §3.14의
해제 조건이 충족될 때 일괄 정리한다.
