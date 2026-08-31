# Implementation Report: santa-delta-review M1 — 델타 스코프 계산 + 상태 단언 금지 가드

## Summary

santa-loop의 라운드 2 이후 리뷰 스코프를 직전 라운드들이 커밋한 fix hunk 범위로 좁히되,
리뷰어에게 가는 것은 **범위 지정뿐**이고 "이전은 통과했다"류 상태 단언은 실을 자리가
구조적으로 없게 만들었다(UI2 / DD3). 축소는 신규 순수 oracle `santa/scope-delta.js`와
CLI 하위명령 `scope-delta`가 계산하고, 상시 스코프(plan/PRD)는 축소 **뒤에** 합류하므로
UI4의 면제가 조건 분기가 아니라 **호출 순서**로 성립한다(DD2).

기본값은 `off`이며 발화는 명시 opt-in이다 — 형제 santa 토글 4종과 **반대 방향**이고,
그 비대칭의 근거(발화가 더 느슨한 쪽이고 그 대가를 아직 아무도 재지 않았다)를
`docs/environment/review.md`에 적었다. 그 대신 "조용한 영구 비활성"은 receipt 계측
2종이 관측 가능하게 만든다(DD12).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 20 | 21 (+1 — 아래 D1) |
| Tasks | 10 | 10 완료 |
| 신규 test | 3 파일 | 3 파일 + 기존 1 파일 확장, 신규 단언 77건 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `scope-delta.js` 순수 oracle | 완료 | export 14종. 외부 의존 0건 |
| 2 | `cli.js` `scope-delta` + anchor 열거 | 완료 | `--round` 0건, `--ranges-file` 안전 로더 추가 |
| 3 | `lanes.js` 범위 렌더 + 단언 차단 | 완료 | 인자 1개(`ranges`) 추가, 서술 인자 0건 |
| 4 | durable 계측 4층 | 완료 | 원장 · CLI 스칼라 4종 · 집계 · receipt 2필드 |
| 5 | `santa-loop.md` 배선 | 완료 | 델타가 상시 스코프 **앞**, 번들 레인 지시, Notes 5항목 |
| 6 | 회귀 test | 완료 | 신규 3파일 + `santa-lanes.test.js` 확장 |
| 7 | env 3면 등재 | 완료 | `env-contract/lint.js` L1~L9 전량 통과 |
| 8 | PRD 갱신 | 완료 | OQ 1·2·3·5 해소, 4는 M2 소유로 명시 |
| 9 | version 4면 동기 | 완료 | `1.30.1 → 1.30.2` (patch — main이 1.30.1을 선점해 M2 사이클에서 forward-only 상향) |
| 10 | 라이브 완주 | 완료(범위 명시) | 아래 "Acceptance" 참조 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | 이 저장소는 type-check/lint 스크립트가 없다(`package.json` 부재) |
| Unit + Integration Tests | 통과 | **363 tests · 360 pass · 0 fail · 3 skipped** |
| env-contract lint | 통과 | L1~L9 전량 |
| instruction-contract lint | 통과 | |
| i18n-surface (version 4면) | 통과 | 10/10 |
| Build | N/A | 빌드 단계 없음 |

3 skipped는 **선재**다(STATE.md에 기록된 baseline "santa 269건 중 266 pass · 0 fail ·
3 skipped"와 일치). 본 변경으로 인한 신규 skip 0건, 회귀 0건.

### 환경 상호작용 (선재, 본 변경과 무관)

이 저장소 자신의 `.claude/settings.json`이 `MCCP_REVIEW_SINGLE_PASS=deadline_pressure`를
켜 두는데, `begin-round`는 단일통과 구간에서 라운드를 열지 않으므로(review-loop-bypass
M1 DD5) 그 변수가 살아 있으면 `santa-loop-cap.test.js`의 CLI-레벨 test 20건이 붉어진다.
변수를 제거하면 전부 통과한다(실측 확인). 신규 test는 `withoutSinglePass` 헬퍼로 이
축을 스스로 격리한다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `santa-scope-delta.test.js` (신규) | 33 | env 파서 · passthrough 4갈래 · 축소 · 확장/병합/clamp · 렌더 · 두 패턴 목록 · 집계 |
| `santa-delta-instrumentation.test.js` (신규) | 29 | 계측 4층 + 이음매 · CLI anchor 열거 · 실제 git hunk · DD9 삭제/rename · `--ranges-file` 보안 4건 |
| `santa-delta-command-body.test.js` (신규) | 15 | dispatch↔usage 양방향 동기 · 본문 배선/순서 · 소유권 경계 |
| `santa-lanes.test.js` (확장) | +8 | 범위 렌더 · 조립 프롬프트 단언 0건 · DD4 오탐 경계 · DD5 반경 한정 |

## Acceptance

라운드 2개짜리 루프를 **실제 CLI 경로로 완주**했다(실제 git repo · 실제 fix 커밋 ·
실제 `git show` hunk · 실제 seal · 실제 receipt). 상세 실측은
[`.claude/notes/santa-delta-review-m1.md`](../../notes/santa-delta-review-m1.md).

| 항목 | 실측 |
|---|---|
| (a) 델타 발화 | 라운드 2 `applied=true`, `revs=[fix rev]`. 라운드 1은 `no-anchor` passthrough |
| (b) `before` > `after` | **5 → 1**. 확장 범위 `[80,120]`(변경 라인 100 ± `CONTEXT_LINES`) |
| (c) 범위 + 단언 0건 | `- src/a.js:80-120` · `PRIOR_ROUND_PATTERNS` 매치 **0건** · 정상 rubric 통과 |
| (d) 봉인된 receipt | `santa_delta_rounds=1` · `santa_delta_paths_dropped=4` · schema 통과 |
| `off` 구별 | 원장 라운드 0에 `{applied:false, reason:"no-anchor", 5→5}` durable 기록 |

**이 실행이 덮지 않은 것**: LLM 리뷰어 발화는 fixture JSON으로 대체했다. 따라서 이것은
`/mccp:santa-loop` 커맨드 본문 **산문**의 완주가 아니라 그 본문이 부르는 **CLI 경로**의
완주다. 본문 셸 블록은 `santa-delta-command-body.test.js`의 정적 단언이 배선을 고정하며
그 천장은 "배선 누락과 위치 drift"이지 산문 불이행이 아니다 — 두 축이 나눠 덮고 어느
쪽도 다른 쪽을 대신하지 않는다. **탐지율 보존은 재지 않았고 주장하지도 않는다**(M2 소유).

### Design Grounding

N/A — design trigger 미발화(`impeccable-detect` `design_signal=false`, `silent_skip`).
이 milestone은 렌더 표면에 항목·색·위계를 추가하지 않는다(plan의 Design Critique 절이
이미 `CONVERGED`로 판정).

## Deviations from Plan

### D1 — `renderScopeLines`의 denylist 적용 대상을 원시 출력 → 스캐폴딩으로 좁혔다

- **WHAT**: plan Task 1은 "`renderScopeLines`는 자기 출력에 `SCOPE_ASSERTION_PATTERNS`를
  스스로 걸어 위반 시 던진다"고 적었다. 구현은 그 검사를 **줄에서 경로를 뺀 나머지**
  (= 이 함수가 스스로 만든 텍스트)에만 걸고, 데이터인 경로에는 걸지 않는다. 대신 더 강한
  **구조 검사**를 추가했다: 범위 표기는 `^:\d+-\d+(?:, \d+-\d+)*$` 고정 형태여야 하고,
  경로에 개행/CR/NUL이 있으면 거부한다.
- **WHY**: 문언대로 하면 **평범한 저장소 경로가 라운드를 죽인다**. 실측:
  `.claude/plans/review-loop-bypass-m1.plan.md`가 `/pass(ed)?/i`("by**pass**")에,
  `.claude/agents/refactor-cleaner.md`가 `/clean/i`("**clean**er")에 걸리며 전자는 상시
  스코프가 `<slug>*.plan.md`로 끌어오는 부류다. 데이터에 denylist를 거는 것은
  fail-closed가 아니라 **정상 입력에 대한 오작동**이고, DD3이 막으려는 것(미래 편집이
  서술을 끼워 넣는 것)과 무관하다. 스캐폴딩 검사는 같은 동결을 제공하면서 오탐이 0이다 —
  서술이 추가되면 그것이 스캐폴딩에 들어가기 때문이다. 회귀 test가 이 이탈을 고정한다
  (검사를 원시 출력으로 되돌리면 그 test가 붉어진다).

### D2 — `--scope-file` JSON을 스칼라 4종으로 대체했다 (plan이 이미 지시한 방향)

plan Task 4가 L2 security HIGH 흡수로 이미 스칼라를 명세했으므로 이탈이 아니다. 다만
plan이 "넷이 다 있으면"이라 적은 것을 구현은 **더 엄격하게** 했다: `applied=false`면
`reason` 필수, `applied=true`면 `reason` **금지**. 반쪽/자기모순 레코드가 원장에 앉으면
집계가 무엇을 세는지 흔들리기 때문이다.

### D3 — `santa-loop-cap.test.js`가 Files to Change에 없다

신규 santa 모듈을 더하면 그 파일의 **승인 게이트 2종**(모듈 목록 pin + require allowlist)이
설계대로 붉어진다. 형제 milestone 3회(evidence-diversity M1/M2/M3)가 모두 같은 자리를
지났고, test 자신의 주석이 "목록에 한 줄 더하는 것이 그 승인 기록"이라고 규정한다.
plan이 이 파일을 열거하지 않은 것은 작은 누락이며, 흡수 방식은 선례 그대로다.

### D4 — `deltaCoverageFrom`/`projectScope`/원장 쓰기의 형태 규칙을 공유 술어로 통일했다

초안대로 세 자리에 각자 검증을 적었더니 `deltaCoverageFrom`이 `applied===true`만 보고
형태 불량 레코드를 세는 반면 `projectScope`는 그것을 `null`로 접어, "리포트에는 없는데
집계에는 있다"가 됐다(신규 test가 그 자리에서 잡았다). `scope-delta.isValidScopeRecord`
하나로 통일해 갈릴 자리를 없앴다.

## Issues Encountered

### 게이트 진입 — receipt slug 불일치 (해소, 위조 없음)

`/mccp:prp-implement` 진입 시 `mccp-plan-codex` receipt가 "누락"으로 보고됐다. 실제로는
**slug 불일치**였다: `/mccp:plan`이 PRD/브랜치 축(`santa-delta-review`)으로 receipt를
썼고 `/mccp:prp-implement`는 plan basename 축(`santa-delta-review-m1`)으로 조회했다.
receipt의 `plan_hash`·`reviewed_plan_hash`가 이 plan 본문의 해시
(`sha256:523d272c…`)와 **정확히 일치**하므로 리뷰는 실제로 이 plan에 대해 일어났다.

§3.16의 금지 사항(파일명 변경 = receipt 위조)을 피하고, `decision.js`의 precedence 1위인
명시 `--decision santa-delta-review`로 해소했다 — `cli.js write` blind write는 하지
않았다(Phase 0.0의 in-scope 분기 준수). 이후 chain 전체가 그 slug로 정렬되며,
`/mccp:pr`이 브랜치에서 파생할 slug와도 같다. 재검증 결과 `ok:true` (missing 0 · stale 0 ·
blocking 0 · open_critical 0).

### plan-conflict 검출기 false positive (backlog 등재, HIGH)

Handling Deviations의 `plan-conflict-detector`가 `conflict:true` (`file-expansion`,
"26 unplanned")를 냈으나 **검출기 결함**이다: `parseFilesToChange`는 마크다운 링크만
벗기고(`:76-77`) `normalizePath`(`:42-44`)는 백틱을 벗기지 않아, 이 저장소처럼 경로를
백틱으로 감싸는 plan에서 `isInPlan`이 **항상 false**다(실측:
`isInPlan("CHANGELOG.md", ["`CHANGELOG.md`"]) === false`, 백틱 제거 시 `true`).

같은 함수로 백틱만 벗겨 재대조하면 unplanned는 **6건**이고 planned 20건은 **전부** 변경
됐다(missing 0). 6건 중 5건은 게이트/세션 산출물(backlog append — §3.14·§3.15 의무 ·
STATE.md · fix-task-applied · plan 본문 · plan-review 노트)이고, 실제 구현 확장은 D3의
`santa-loop-cap.test.js` 1건뿐이다. 따라서 **진짜 plan↔implementation gap은 없다**고
판단해 escalate하지 않고 D1~D4로 문서화했다. 검출기 수정은 이 milestone의 Files to
Change 밖이고 그 자체로 plan 확장이므로 backlog에 HIGH로 이연했다.

### 보안 리뷰 triage (§3.14 — CRITICAL/HIGH만 흡수)

| Finding | Severity | Verdict | 근거 |
|---|---|---|---|
| CRITICAL-1 `--ranges-file` prototype pollution | CRITICAL | ACCEPT_NOW | `readRangesFile`가 `assertSafeGraph`를 파싱 직후, 값 읽기 **전에** 건다 |
| CRITICAL-2 `renderScopeLines` throw = DoS | CRITICAL | 부분 ACCEPT_NOW | 오탐 절반은 D1이 이미 닫았다. 나머지(키 사전 검증)는 `toRepoRelative`로 흡수 |
| HIGH-1 두 패턴 목록 ReDoS | HIGH | **REJECT (증거)** | 중첩 수량자·겹치는 교대 없음. 1.2M자 적대적 입력 20회 = 43.9ms, 실측 프롬프트 1회 = 6µs. 제안된 atomic group은 JS 미지원 |
| HIGH-2 `patchRanges` 키 미검증 → 프롬프트 주입 | HIGH | ACCEPT_NOW | 키를 `scopeAlways.toRepoRelative`로 접고 드롭을 loud 보고 |
| HIGH-3 크기/깊이 상한 부재 | HIGH | ACCEPT_NOW | `MAX_REVIEWER_BYTES` · `assertSafeGraph` 깊이 32 · 키 1000 상한 |
| MEDIUM-1 정수 경계 | MEDIUM | DEFER | 부분 흡수(`isSafeInteger`·`/^\d+$/`). 도메인 상한은 근거 부재 |
| MEDIUM-2 `--scope-reason` 자유 문자열 | MEDIUM | DEFER (설계로 이미 닫힘) | `NO_NARROW` 닫힌 4원소 enum |
| MEDIUM-3 tmp 디렉토리 containment | MEDIUM | DEFER | `SLUG_RE`가 이미 접고, `assertContained`는 라운드 1 정상 부재를 exit 2로 만든다 |

CRITICAL 2 · HIGH 3 흡수, HIGH 1 증거 기각, MEDIUM 3 이연. 전건
[`codex-findings-backlog.md`](../../plans/codex-findings-backlog.md)에 등재.

## Next Steps

- [ ] `/mccp:prp-commit` → `/mccp:pr`. **PR 진입 직전 §3.7 version 재계산**(두 번째 시점)
- [ ] M2 — 탐지율 fixture 비교. 하락 없음이면 `MCCP_SANTA_DELTA_SCOPE` default를 뒤집는다
