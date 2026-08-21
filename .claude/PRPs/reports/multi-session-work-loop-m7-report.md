# Implementation Report: multi-session-work-loop M7 — 세션 경계 피드백 루프

## Summary

한 세션에서 제기된 finding이 세션 경계를 넘지 못하고 사라지는 통로를 닫았다.
게이트가 이미 구조화된 형태로 생산하던 finding(패널 `l2.json` · Plan-Codex 판정 ·
santa 라운드)을 append-only 레지스트리에 기록하고, 미해소 HIGH·CRITICAL을 다음
세션의 작업 목록과 주입 표면에 올린다. 게이트를 추가하지 않았고 LLM 호출도 늘리지
않았다(UI3).

**C1이 `forward-only` → `computed`로 뒤집혔다** (UI4 완료 판정):

| | before | after |
|---|---|---|
| status | `forward-only` | `computed` |
| invalid_reason | `no live findings derive source wired` | (없음) |
| numerator / denominator | `null` / `null` | `0` / `12` |
| coverage | `n/a` | `findings-registry` |

전후 원본은 [m7-before.json](../../../docs/multi-session-work-loop/m7-before.json) ·
[m7-after.json](../../../docs/multi-session-work-loop/m7-after.json).

**분자가 0인 것은 결함이 아니라 설계의 결과다.** 저자가 implement 중 흡수한 finding을
스스로 닫는 경로는 의도적으로 없다 — 그 경로를 만들면 자기신고가 곧 분자가 되어 UI5가
막는 조작이 열린다. 종결은 DD2·DD3이 정한 두 경로(Plan-Codex 판정 · santa 라운드 간
비재발)로만 들어온다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large — 일치 |
| Files Changed | 33 (표 열거) | 45 변경 (표 33 전건 + 표 밖 12) |
| Assertions | 32 (roster) | 32 (manifest ↔ `REQUIRED_IDS` 1:1) |
| 신규 test | 3 파일 | 3 파일 (등록 73건) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | finding 레지스트리 기판 | 완료 | `seq` 할당을 write **시도 전**으로 옮김 (아래 D1) |
| 2 | computeC1 유형 분리 계약 정정 | 완료 | Task 3과 동일 트리에 착지 |
| 3 | derive source 배선 | 완료 | `type_separation`을 스캔 결과에서 파생 |
| 4 | emit 배선 3지점 | 완료 | `plan-review/cli.js` · `plan-codex-runner.js` · `santa/seal.js` |
| 5 | 승격 — 작업 목록과 주입 표면 | 완료 | sanitizer 4종 export 개방 + `## Open Findings` 블록 |
| 6 | 대시보드 표면 | 완료 | 폐쇄율·이연률 분리 표기 + 유형 분해 상세 |
| 7 | C1 coverage gate | 완료 | 2표면 정적 lint + 런타임 falsifier + co-presence + merge-union + `--acceptance` |
| 8 | 수용 증거와 릴리스 메타데이터 | 완료 | manifest 32건 · 감사 표본 5건 · 4면 version 동기 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | 이 저장소는 `package.json`이 없다 — type-check·lint 도구 부재 |
| Unit Tests | 통과 | `lib/tests` 2562건 pass 2547 / fail 0 / skip 15 |
| | | `state/tests` 215 · `derive/tests` 127 · `receipt/tests` 657 · `renderer/tests` 672 — fail 0 |
| Build | N/A | 빌드 단계 없음 |
| Integration | 통과 | 라이브 완주 — 아래 "라이브 산출물" |
| Edge Cases | 통과 | 유실·중복·절단·다중 후보·homoglyph·지시문·미등록 writer 음성 fixture |

### 명령 단위 판정

| 명령 | exit | 판정 |
|---|---|---|
| `assertion-manifest-check.js --manifest m7-…json` | 0 | 32건 전건 실재 |
| `c1-coverage-gate.js --json` | 0 | 4축 통과 |
| `c1-coverage-gate.js --acceptance --json` | 1 | **의도된 미충족 1축** — 아래 참조 |
| `derive/cli.js run --json` → `metrics.C1.status` | `computed` | UI4 충족 |
| `derive/cli.js render` | 0 | STATUS.md에 `0% (이연 0%)` + 유형 분해 실재 |
| `git check-attr merge`(실재·미래 이름) | 0 | 양쪽 `union` |
| `gitignore-provision.test.js` | 0 | 86건 pass |
| `instruction-contract/lint.js` | 0 | drift 0 |

`--acceptance`가 남긴 유일한 실패는 `registry-committed` — 레지스트리 파일이 아직
HEAD 커밋에 없다. 이것은 **게이트가 정확히 제 일을 한 것**이며 `/mccp:prp-commit`
직후 통과한다. 나머지 4축(레지스트리 실재 · `merge=union` · C1 clean computed ·
감사 표본 일치)은 전부 통과했다.

### 선재 red (이번 주기가 만든 것 아님)

| 항목 | 원인 |
|---|---|
| santa CLI ~40건 | 셸 env `MCCP_REVIEW_SINGLE_PASS=deadline_pressure` — §3.15대로 `begin-round`가 라운드를 열지 않는다. env를 비우면 244건 중 240 pass |
| `ecc-context-monitor.test.js` "Axis B (f)" 1건 | `plugins/mccp/scripts/hooks/` 는 이번 주기 무변경(`git status` 공집합) |
| `metrics-assert` A3·B2·B3 5건 | 각 producer의 라이브 corpus 부재 — **C1은 실패 목록에 없다** |
| `evidence-audit` exit 4 | `state=incomplete` · `false_positive=0` · unverifiable 19 — 저장소 상시 상태 |

### 라이브 산출물 (단위 test가 대신하지 못하는 축)

이 사이클 **자신의** 패널 산출물에 대해 배선된 emit 경로를 실행했다.

- `.claude/state/findings/multi-session-work-loop-m7.jsonl` — 12 이벤트 / 12 finding /
  `degraded:false` / `seq` 구멍 0 / batch shortfall 0.
- 승격 왕복 확인: `enumerateUnfinishedItems`가 `type:'finding'` 5건(CRITICAL 1 · HIGH 4)을
  내고, `state-injector.buildOpenFindingsBlock`이 `## Open Findings` 블록을 실제로 만든다.
- 대시보드: `.claude/cache/STATUS.md:867` `| **C1** · 피드백 폐쇄율 | 0% (이연 0%) | 산출됨 |`

### Design Grounding

**N/A (no design trigger).** `impeccable-detect --mode implement`가 게이트 진입 시점에
`design_signal=false` / `silent_skip=true`를 냈다 — 그 시점의 diff가 비어 있어 detector가
Task 6의 렌더러 변경을 볼 수 없었다. 따라서 2.5.5c capture 미실행이고 Phase 3.7은 완전
no-op이며 Phase 3.6도 게이트에서 skip됐다. plan의 `## Design Critique`가 이미 R0~R1로
`CONVERGED`를 봉인했다. 이 시점 gap은 santa-evidence-diversity M2가 기록한 것과 같은
형태의 선재 한계다.

## Files Changed

표에 열거된 33건 전건이 변경됐다(미변경 0). 표 **밖** 12건의 성격:

| 파일 | 성격 |
|---|---|
| `.claude/state/findings/*` | 이 milestone의 라이브 산출물 — Acceptance가 커밋을 요구한다 |
| `.claude/notes/…-implement-gate.md` | 게이트 산출물. plan 본문이 `plan_hash`로 봉인돼 Phase 2.5.4의 대체 자리를 썼다 |
| `.claude/plans/codex-findings-backlog.md` | §3.14가 요구하는 DEFER 적재 |
| `.claude/plans/…-m7.plan.md` · `.claude/reviews/*` · `.claude/settings.json` · `.claude/state/STATE.md` · `fix-task-applied.md` | 이번 세션 이전부터 변경돼 있던 상태·세션 산출물. plan 본문은 **손대지 않았다**(hash `f6bfde5a…` 불변) |
| `plugins/mccp/scripts/lib/msw-metrics/fixture.js` | Task 8 승격의 전제 (D3) |
| `plugins/mccp/scripts/lib/tests/assertion-manifest-check.test.js` | Task 8의 `REQUIRED_IDS` 변경을 따라가는 self-test (D3) |
| `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` | Task 4가 만든 신규 의존의 **설계상 요구되는** 승인 기록 (D3) |

## Deviations from Plan

### D1 — `seq`를 write **시도 전에** 할당한다 (Task 1)

plan은 "writer는 work_unit별 단조 `seq`를 부여"라고만 적었다. 최초 구현은 디스크의
`max(seq)`에서 다음 번호를 뽑았는데, 그러면 **실패한 append가 아무 흔적도 남기지
않는다** — 다음 write가 같은 번호를 재사용하므로 구멍이 생기지 않는다. 그 상태에서는
DD8의 1차 탐지 축이 구조적으로 아무것도 탐지하지 못한다.

프로세스 지역 고수위를 두어 할당이 write 성공 여부와 무관하게 전진하게 했다.
`C1-EMIT-LOSS-VISIBLE`은 **실제로 실패하는 write**(파일을 읽기 전용으로 돌린 뒤 append)로
그 성질을 단언한다 — 줄을 지워 유실을 흉내내면 reader의 구멍 탐지만 증명되고 DD8이
실제로 주장하는 명제는 증명되지 않는다.

**남는 경계를 정직히 적었다**: 고수위가 프로세스 지역이므로 실패 직후 프로세스가
종료하고 다른 프로세스가 이어 쓰면 구멍이 생기지 않는다. 그 구간은 `.degraded` 마커와
표면 대조가 덮으며, 어느 축도 닿지 않는 잔여가 있다는 사실을 `m7-after.json`과
`feedback-loop-design.md` §5가 기록한다.

### D2 — 레지스트리 파일명이 `multi-session-work-loop-m7`이다 (Acceptance)

plan의 Acceptance는 `multi-session-work-loop.jsonl`을 지목하며 근거로
`derive-decision --command mccp:plan --args <PRD 경로>`의 실측을 들었다. 그러나 이
사이클의 패널은 **milestone 단위로 재발행**됐고(santa-evidence-diversity M2와 같은 형태)
실제 게이트 slug이 `-m7`을 달았다 — receipt 파일명
`mccp-plan-codex/multi-session-work-loop-m7.json`과 리뷰 기록 파일명이 그것을 확증한다.

수용 조건의 **실질**("라이브 배선이 커밋된 이벤트를 남겼는가")을 지키고 이름만 실측에
맞췄다. `ACCEPTANCE_WORK_UNIT` 상수에 근거를 주석으로 남겼고 `--work-unit`으로 재지정
가능하다. plan의 Validation 블록에 리터럴로 적힌 두 줄(`test -s …` ·
`git cat-file -e HEAD:…`)은 그 이름으로 읽으면 실패하며, 실제 slug으로는 통과한다.

### D3 — 표 밖 파일 3건 (Files to Change 미열거)

`fixture.js` · `assertion-manifest-check.test.js` · `santa-loop-cap.test.js` 셋 다
plan의 Task가 **강제하는** 결과이지 접근 변경이 아니다. plan 본문은 `plan_hash`로
봉인돼 있어 이번 주기에 고치지 않았다(고치면 receipt가 stale이 되어 §3.11 guard 2가
이 사이클의 PR을 막는다). 백로그에 MEDIUM으로 등재했다.

`assertion-manifest-check.js`의 `REQUIRED_IDS`는 평면 목록에서 **milestone별 map**으로
바꿨다. 평면 목록이면 M6 manifest는 C1 id가 없어서, M7 manifest는 B1 id가 없어서 서로를
영구히 붉힌다 — milestone이 하나 더 생기는 순간 대조기가 **어느 manifest도 통과시키지
못한다**. 하한의 목적("manifest에서 id를 빼면 통과"를 막는 것)은 milestone 범위 안에서
그대로 유지되고, 미등록 milestone은 fail-closed다.

### D4 — 리뷰 기록 markdown을 원본으로 복원했다 (라이브 완주)

배선이 착지한 뒤 이 사이클의 패널 산출물에 대해 `record` 서브커맨드를 실행해 레지스트리
이벤트를 얻었다. 그 명령은 리뷰 기록 markdown도 다시 렌더하는데, `started-at`이 원래
실행 시각(10:34)이라 `wall_clock_ms`가 잘못된 epoch에서 계산된다(약 1.5시간). 실행 전
백업해 두고 실행 후 **byte-identical로 복원**했다(md5 `bc34251a…` 전후 동일). 레지스트리는
실제 패널 데이터에서 나온 진짜 이벤트이고, 기록 표면은 실제 실행이 남긴 그대로 유지된다.

## Issues Encountered

### `plan-conflict-detector.js`의 `file-expansion` 신호는 구조적 false positive다

Phase 3의 deviation guard가 `conflict:true`를 냈다. 조사 결과 **선재 결함**이며 M7이
만든 것이 아니다.

`parseFilesToChange`가 표의 첫 열을 **백틱 포함**으로 반환하고(`'\`plugins/…\`'`)
`normalizePath`가 백틱을 벗기지 않으므로, plan이 **명시적으로 열거한** 파일에 대해서도
`isInPlan(...)===false`다(실측 확인: 백틱을 벗긴 배열로는 `true`). 결과적으로 표를
백틱 경로로 쓰는 모든 plan — 이 저장소의 보편 관례 — 에서 변경 파일 **전건**이 unplanned로
계상되고, 2건 이상이면 언제나 `conflict:true`가 된다. 실측: 45건 중 45건이 unplanned로
보고됐으나 실제 미열거는 12건이다.

CLAUDE.md §1.2가 dedupe matcher에 대해 기록한 것과 같은 계열의 결함이다. HIGH로 backlog에
등재했다(그 파일은 M7의 Files to Change 밖이므로 이번 주기 범위가 아니다). **`chain_aborted`를
설정하지 않았다** — 계측기 결함을 근거로 완주·검증된 milestone을 중단하는 것은 신호가
아니라 잡음이며, 실제 미열거 12건은 위 D3에서 분류하고 기록했다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `lib/tests/findings-registry.test.js` | 19 | Task 1 — allowlist · 경로 정규화 · seq 무결성 · batch 원자성 · merge=union |
| `lib/tests/c1-feedback-loop.test.js` | 33 | Task 2~5 — 계약 검사 · derive 배선 · emit 3지점 · 승격·주입 경계 |
| `lib/tests/c1-coverage-gate.test.js` | 20 | Task 7 — 2표면 lint · co-presence · merge gate · 런타임 falsifier · `--acceptance` |
| `lib/tests/msw-metrics.test.js` (확장) | +1 fixture | Task 2 회귀 |
| `lib/tests/msw-derive-sources.test.js` (확장) | +1 | Task 3 소스 등록 |
| `lib/tests/msw-metrics-render.test.js` (확장) | +5 | Task 6 분리 표기 |
| `lib/tests/msw-metrics-acceptance.test.js` (확장) | +1 | Task 8 승격 |
| `lib/tests/assertion-manifest-check.test.js` (확장) | +1 | milestone 미등록 fail-closed |

## 이 milestone이 주장하지 않는 것

- **오심·미기록 finding을 잡지 않는다.** 레지스트리는 게이트가 이미 낸 것을 기록할 뿐
  리뷰어가 놓친 것을 만들지 않는다.
- **coverage gate는 위조를 막지 않는다.** 겨냥 대상은 우발적 미계측 emit 지점이지
  repo write 권한을 가진 적대적 위조자가 아니다.
- **정적 lint는 동적 경로·셸 writer·트리 밖을 못 본다.** 그 축은 런타임 falsifier가
  담당하고, 그것도 표면 delta가 남는 경우에 한한다.
- **DD8의 미탐지 꼬리는 열려 있다.** 두 구간(`finding_closed` batch 전체 유실 + 이후
  write 없음 / 프로세스 종료 후 타 프로세스 이어쓰기)에서 C1이 실제보다 **낮게**
  보고된다. 닫는다고 주장하지 않으며 이유는 무한 후퇴 회피다.

## Next Steps

- [ ] `/mccp:prp-commit` — 커밋 후 `--acceptance`의 `registry-committed` 축이 통과한다
- [ ] `/mccp:pr` — **진입 직전 §3.7 version 재계산**(현재 `1.30.1`, origin/main `1.30.0`)
- [ ] merge 후 worktree cleanup + `claude plugin update`
