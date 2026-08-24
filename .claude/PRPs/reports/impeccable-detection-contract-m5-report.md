# Implementation Report: impeccable 탐지 계약 — M5 문서·계약 드리프트 정리

## Summary

M1~M4가 탐지·판정·이름·발화를 고쳤다면 M5는 **그 사실들을 적어 둔 곳**을 고치고, 같은
드리프트가 다시 조용히 생길 수 없게 그 질문을 lint에 넣는다. impeccable 축 23건을 실제
지점으로 옮기고, 표현할 수 없던 사실(`not-consumed`)에 자리를 주고, lint **L10**과 열거된
`EVIDENCE_DEBT` 래칫을 신설했다. 남는 비-impeccable 29건은 지우지 않고 이름과 소유 축째로
남겼다. PRD 전체가 여기서 종료되므로 version은 minor(`1.31.4 → 1.32.0`)다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 판정 로직은 작고, 비용은 fixture 정합(기존 lint.test.js가 L10을 몰랐다)에 들었다 |
| Confidence | — | 높음. 게이트 2건(plan L2 패널 · Implement-Codex)이 **독립적으로** 같은 축(래칫 로더 fail-closed)을 지목했고 그 축을 실행으로 확인했다 |
| Files Changed | 17 | **26** (수정 18 + 신규 4 + 게이트 산출물 3 + 이 보고서) |
| 잔여 debt | 28 | **29** — 측정 방식 차이(아래 Deviations 1) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 착수 전 실측 기록 | 완료 | `measure-evidence.js` 신설. 162개 → A 110 · B 28 · C 24. impeccable 축 23 = C 19 + B 4 |
| 2 | `not-consumed` status | 완료 | STATUSES + 헤더 주석 1:1. **L7 분기 여부를 먼저 읽고 결정을 주석에 남김** — L7은 status로 분기하지 않으므로 19종은 검사 안에 남는다 |
| 3 | impeccable 축 23건 evidence 이동 | 완료 | B 4건 행 교체 · `MCCP_IMPECCABLE_SKILL` `string`→`enum` · `MCCP_PLAN_REVIEW_TEST_INVOKE` 등재 |
| 4 | lint L10 + `evidence-debt.js` | 완료 | 판정 코어를 `evidence-name.js`로 분리(주입 가능). 로더 fail-closed 2겹 |
| 5 | 래칫 test | 완료 | 신규 12 test + 기존 suite에 L10 음성 fixture 2건 |
| 6 | 문서 세 면 정합 | 완료 | external.md 19개 절 · review.md · ENVIRONMENT.md |
| 7 | CLAUDE.md §1.1 근거 정정 | 완료 | 실측 확인 후 정정(`Skill(impeccable` 7건 전부 주석·test, 명령 본문 0건) |
| 8 | 릴리스 표면 동기 + 이연 기록 | 완료 | 4면 `1.32.0` · CHANGELOG · PRD milestone 5 complete · backlog 5건 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| V1 env-contract lint | 통과 | **L1~L10 전부 `ok`**, exit 0 (착수 시점은 L1 `FAIL` + L8 `ok`) |
| V2 env-contract tests | 통과 | 56/56 |
| V3 재측정 | 통과 | impeccable 축 23건이 전부 A(4) 또는 `not-consumed`(19) |
| V4 탐지 오라클 회귀 | 통과 | 121/121 (M1~M4 계약 무손상) |
| V5 instruction-contract | 통과 | C1~C4 pass, rows=32 resident=17 |
| V6 4면 version 동기 | 통과 | 10/10 |
| V7 진단 명령 | 통과 | `resolve --json` · `dep-check` 모두 exit 0 |
| 추가 회귀 | 통과 | plan-review-l3 34/34 · registry 의존 4개 suite 110/110 |

### Design Grounding

N/A — 디자인 트리거 미발화(`design_signal=false`, `silent_skip_reason="no-signal"`). 이
milestone은 lint·registry·문서 축이라 렌더 표면이 없다. Phase 2.5.5c 캡처가 없으므로
Phase 3.6·3.7은 구조적 no-op.

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/env-contract/evidence-name.js` | CREATED | +170 |
| `plugins/mccp/scripts/lib/env-contract/evidence-debt.js` | CREATED | +125 |
| `plugins/mccp/scripts/lib/env-contract/measure-evidence.js` | CREATED | +130 |
| `plugins/mccp/scripts/lib/env-contract/tests/evidence-debt.test.js` | CREATED | +215 |
| `plugins/mccp/scripts/lib/env-contract/lint.js` | UPDATED | +69 / -8 |
| `plugins/mccp/scripts/lib/env-contract/registry.js` | UPDATED | +74 / -20 |
| `plugins/mccp/scripts/lib/env-contract/tests/lint.test.js` | UPDATED | +109 / -19 |
| `plugins/mccp/scripts/lib/env-contract/tests/registry.test.js` | UPDATED | +15 / -3 |
| `plugins/mccp/scripts/lib/plan-review/cli.js` | UPDATED | +6 / -2 |
| `docs/environment/external.md` | UPDATED | +274 / -137 |
| `docs/environment/review.md` | UPDATED | +51 / -8 |
| `docs/ENVIRONMENT.md` | UPDATED | +3 / -1 |
| `docs/gate-design.md` | UPDATED | +91 |
| `CLAUDE.md` | UPDATED | +16 / -6 |
| `CHANGELOG.md` | UPDATED | +73 |
| `plugins/mccp/.claude-plugin/plugin.json` · `renderer/html.js` · `renderer/markdown.js` | UPDATED | 각 1행 (version 4면) |
| `.claude/prds/impeccable-detection-contract.prd.md` | UPDATED | milestone 5 → complete |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | +5행 이연 |
| `.claude/notes/impeccable-detection-contract-m5.md` | CREATED | 게이트 산출물 + 실측 + acceptance |

## Deviations from Plan

1. **잔여 debt가 28이 아니라 29다.** plan의 A 111/C 23은 부분 문자열 일치로 잰 값이고,
   `measure-evidence.js`는 **경계 일치**를 쓴다. 차이는 정확히 `MCCP_PLAN_REVIEW_`
   (status `scan-artifact`, 끝이 밑줄인 접두사 오탐) 한 항목이다. 경계 일치가 옳다 —
   부분 문자열 일치는 `MCCP_PLAN_REVIEW_L3`가 적힌 행이 `MCCP_PLAN_REVIEW`를 인증하게 해서
   드리프트를 감춘다. 숫자를 plan에 맞추지 않고 실측을 적었다.

2. **B-class 2건의 목적지가 plan의 값과 다르다.** plan은 `MCCP_IMPECCABLE_INTENT_COMMANDS`
   170 · `IMPECCABLE_FORCE_OVERRIDE_REASON` 437을 적었는데, 그 둘은 **이름을 언급하는
   산문/표 행**이고 실제로 값을 읽는 줄은 173 · 702다. registry 필드 계약이 "실제로 읽는
   지점"이라 못 박으므로 후자를 썼다. 둘 다 ±2 창은 통과하므로 통과 여부가 아니라 정확성의
   문제다.

3. **`MCCP_PLAN_REVIEW_TEST_INVOKE` 등재가 "1행·런타임 무변경"이 아니었다.** 등재가 그
   이름을 L9의 boolean 집합에 넣으므로 `plan-review/cli.js:538`의 raw 비교가 붉어졌다
   (L1 red를 L9 red로 옮긴 셈). `parseBool`로 옮겼고 bypass-flag 분기가 `raw === '1'`이라
   **바이트 단위로 동일**하다(모듈 주석이 그렇게 선언하고, plan-review-l3 34/34가 확인).
   `registry.test.js`의 bypass-flag 이름 집합 pin도 3 → 4로 갱신했다 — 그 test의 메시지가
   "이 집합을 바꾸려면 이 test를 함께 고쳐야 한다"고 요구하는 사양된 경로다.

4. **기존 `lint.test.js` fixture를 확장해야 했다.** plan은 신규 test만 예상했으나, L10이
   생기면서 fixture repo가 «evidence 줄이 존재하는가»만 만족시켜서는 baseline이 붉어진다.
   materializer가 evidence 줄에 이름을 **주석으로** 심도록 확장했고(L9는 주석을 건너뛰고,
   status `retired` 7종은 전부 docs 경로라 L4가 오염되지 않는다 — 그 전제를 단언으로 고정),
   면제 목록에 오른 이름은 일부러 심지 않아 fixture가 실제 트리의 모양을 따르게 했다.

5. **`docs/environment/external.md`의 기본값 표기를 "벤더 관측"으로 명시했다.** plan은
   "원문을 따른다"고 했는데, 원문 값을 registry `default`에 그대로 옮기면 mccp가 읽지도 않는
   변수에 대해 mccp가 기본값을 주장하게 된다. registry는 `null`로 두고 문서 헤더가 "mccp
   기본값 없음 · impeccable 3.5.0 관측 `<값>`"이라 적는다 — 자기모순은 사라지고 거짓 주장은
   생기지 않는다.

## Issues Encountered

- **Bash 도구의 heredoc 백슬래시 붕괴.** `new RegExp('...\\s...')`를 heredoc으로 쓰면 `\\s`가
  `\s`로 접혀 JS 문자열에서 `s`가 된다(`[[bash-tool-backslash-collapse]]`). 세 번 걸렸고,
  patch 스크립트가 write 전에 throw하도록 짜 둔 덕에 파일 손상은 0건이었다. 회피: 정규식
  리터럴을 쓰거나(`\s` 단일 백슬래시는 안전) 문자 클래스(`[ ]*`)로 대체, 복잡한 파일은
  Write 도구.
- **Codex R1 HIGH가 plan 게이트 L2 CRITICAL과 같은 축이었다.** 두 리뷰어가 독립적으로
  `evidence-debt.js`의 fail-closed 로더 계약 부재를 지목했다. 흡수 후 실행으로 확인했다
  (로더를 망가뜨리면 면제가 0이 되는 것을 노트에 산출물로 기록).

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `env-contract/tests/evidence-debt.test.js` | 12 | 축 밀어넣기 차단(로드 throw 포함) · 신규 드리프트 red · 래칫 양방향 · 화석 감지 · `not-consumed` 역방향 3종 · 로더 fail-closed · `assertShape` 7가지 오형식 · vacuous 가드 3종 · 접두사 충돌 · 실저장소 L10 green |
| `env-contract/tests/lint.test.js` (확장) | +2 | **L8이 통과하는 상태에서 L10만 붉어지는** 음성 fixture(두 검사의 차이를 고정) · 로더 실패 시 면제 소멸 |

## Next Steps

- [ ] `/mccp:prp-commit`
- [ ] `/mccp:pr` — **진입 직전 §3.7 version 재계산 필수**(현재 target `1.32.0`, origin/main `1.31.0`)
- [ ] 머지 후 `claude plugin update` (설치 cache가 1.31.0 = pre-M1)
- [ ] PRD 전체 완료 → `/mccp:archive-complete` 대상(§3.11 — 사람이 별도로 수행)
