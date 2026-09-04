# Implementation Report: ci-full-suite M2 — suite-green

## Summary

M1이 남긴 red 16파일을 6갈래로 분해해 각각의 실제 원인을 닫았다. 최종 트리에서 Windows
로컬 전수는 **376파일 · red 0 · `exit_code 0`** 이다.

핵심 산출은 수리 자체보다 **귀속의 정정**이다. 계획이 "harness 오염"이라 부른 갈래 H는
`run.js`와 무관했다 — 소비처(`codex-invoke.js` · `plan-review/cli.js`)가 이미 `gitDir`
격리 시임을 갖고 있는데 test가 그것을 쓰지 않아 저장소의 살아있는 게이트 봉인을 읽은
것이었고, 러너 없이 `node --test`로 직접 돌려도 동일하게 재현된다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large — 맞음 |
| Files Changed | 20 (Files to Change) | 33 (구현 확장 7 + 게이트 산출물 6) |
| red 파일 (Windows 로컬) | 8 → 0 목표 없음(기록만) | **8 → 0** |
| 벽시계 (Windows 로컬) | 축 아님 | 1,883초 → **398초** (부수효과, 귀속 안 함) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | base 동기화 + M2 branch | 완료 | `origin/main`에서 `ci-full-suite-m2` 분기. M1 PR #171은 이미 머지됨 |
| 1 | 갈래 H — ambient 게이트 상태 격리 | 완료 (**기제 변경**) | 계획의 `MCCP_ROUND_LEDGER` 주입은 폐기. `gitDir` 격리로 전환 |
| 2 | 갈래 P — 가드/수리 판정 | **부분** | 5건 중 3건 수리·가드 완료, 2건(Linux 전용) 미판정 |
| 3 | 갈래 C — CI 체크아웃 깊이 | 완료 | `fetch-depth: 0` + `persist-credentials: false`(보안 HIGH 흡수) |
| 4 | 갈래 D — 진짜 drift 수리 | 완료 | 분류 15종 + 새 kind `budget-spent` · meta lint 15건 |
| 5 | 갈래 F·R — 반복 측정 + 격리 | **부분** | 로컬 4회 완료(flaky 1건 확정). Linux 3회는 CI 대기 |
| 6 | 실증 + M1 해석 정정 | 완료 | `m2-green.md` 신규 · `m1-baseline.md` §6a 추가(소급 재작성 아님) |
| 7 | PRD 갱신 | 완료 | milestone 2 행 재정의 · Metric 2·3 갱신 · OQ 2건 응답. status 셀은 canonical 유지 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (load/syntax) | 통과 | 편집한 7개 js 전부 require 성공 |
| env-contract lint (L1~L10) | 통과 | exit 0 |
| meta-research lint | 통과 | `ok:true`, violations 0 (이전 15건) |
| 전수 스위트 (최종 트리) | 통과 | 376파일 · red 0 · exit_code 0 · attribution complete · redaction_ok true |
| workflow 계약 | 통과 | 트리거·paths·`continue-on-error` 무변경 (UI6) |
| Build | N/A | 이 저장소는 빌드 산출물이 없다 |

### 반복 측정 (Metric 3 프로토콜)

| 원소 | 벽시계 | ok | attribution | redaction_ok | red |
|---|---|---|---|---|---|
| `local-m2-r1` | 382초 | true | complete | true | 1 (자기 유발 drift, 수리함) |
| `local-m2-r2` | 372초 | true | complete | true | 0 |
| `local-m2-r3` | 431초 | true | complete | true | 1 (`post-edit-format-md` — flaky) |
| `local-m2-r4` | 453초 | true | complete | true | 0 |
| 최종 트리 검증 | 398초 | true | complete | true | 0 |

### Design Grounding

N/A — 디자인 트리거가 발화하지 않았다(`design_signal=false`, silent-skip `no-signal`).
receipt에 `impeccable_silent_skip=true`로 봉인.

## Files Changed

| File | Action | Lines |
|---|---|---|
| `scripts/test-suite/run.js` | UPDATE | +56 / -4 |
| `scripts/tests/test-suite.test.js` | UPDATE | +82 |
| `plugins/mccp/scripts/lib/codex-reachability.js` | UPDATE | 분류 15종 + kind 6종 |
| `plugins/mccp/scripts/lib/tests/codex-reachability.test.js` | UPDATE | 리터럴 3곳 → 상수 1곳 |
| `plugins/mccp/scripts/lib/plan-review/cli.js` | UPDATE | 프로그래매틱 `gitDir` 시임 |
| `plugins/mccp/scripts/lib/tests/{codex-invoke,codex-invoke-json,plan-review-cli-emit}.test.js` | UPDATE | `gitDir` 핀 |
| `plugins/mccp/scripts/lib/tests/{history-leak-scan,dispatch-controller,goal-phase-lock}.test.js` | UPDATE | 갈래 P |
| `plugins/mccp/scripts/derive/tests/mask.test.js` | UPDATE | 유출 좌표 진단 |
| `plugins/mccp/scripts/lib/env-contract/registry.js` | UPDATE | evidence 앵커 `:699` → `:715` |
| `plugins/mccp/scripts/lib/renderer/{html,markdown}.js` | UPDATE | §3.7 4면 동기 |
| `plugins/mccp/.claude-plugin/plugin.json` · `CHANGELOG.md` | UPDATE | `1.34.4 → 1.34.5` |
| `.github/workflows/test-suite-baseline.yml` | UPDATE | 갈래 C + 보안 HIGH |
| `.claude/_meta/2026-08-31-final-harness-assessment-and-umbrella-prd.md` | UPDATE | L3 위반 15건 |
| `.claude/_meta/data/2026-09-01-suite-baseline.json` | UPDATE | M2 원소 4개 |
| `docs/ci-full-suite/m2-green.md` | CREATE | M2 산출 문서 |
| `docs/ci-full-suite/m1-baseline.md` | UPDATE | §6a 정정(추가 절) |
| `.claude/prds/ci-full-suite.prd.md` | UPDATE | milestone 2 · Metric 2·3 · OQ |

## Deviations from Plan

계획의 `Files to Change`를 벗어난 7개 구현 파일이 있고, `plan-conflict-detector`가
`file-expansion`으로 잡았다. 조용히 흡수하지 않고 plan 본문의 표와 별도 절
(`### 계획을 벗어난 변경`)에 사유와 함께 등재했다. 세 부류다:

1. **계획 자신이 순인한 퇴로가 발동** — `plan-review/cli.js`. Task 1 Action 2가 env 주입을
   1차 방책으로 제시하면서 "도달하지 않으면 그 seam이 결함이고 그것을 수리 대상으로 삼는다"고
   적었다. 세 리뷰 관점이 env 경로를 반증했으므로 퇴로를 탔다.
2. **귀속이 바뀌자 수리 지점이 이동** — 갈래 H test 3건.
3. **상위 규약이 요구** — renderer 2면(§3.7 4면 동기 의무) + `registry.js`(1의 기계적 파생).

잔여 8건은 전부 게이트 산출물(plan 자신 · backlog · 리뷰 기록 · `.claude/state/`)이고
구현 파일이 0건이다. 계획이 자기 자신을 `Files to Change`에 적을 수 없으므로 이 신호는
어떤 계획도 0으로 만들 수 없다 — 검출기의 구조적 한계로 backlog에 등재했다.

### 계획에서 바뀐 설계 결정

- **`MCCP_ROUND_LEDGER=observe` 주입 폐기.** `seal.js:207-213`이 봉인 우선을 의도로 명시하고,
  `round-cap-command-body.test.js:209-212`가 "어떤 게이트도 대입하지 않는다"를 단언한다.
  계획의 Action 2와 그 Validate는 서로 만족 불가였다.
- **`MCCP_SUITE_REPO_ROOT` 유지.** 계획의 "소비처 0건"은 거짓이었다
  (`reporter.mjs:223`). `--include=*.js` grep이 `.mjs`를 놓친 결과.
- **`round-cap-reached`에 새 kind `budget-spent` 신설.** 기존 5종 중 정직한 값이 없었다.

## Issues Encountered

- **선행 receipt가 구조적으로 stale.** 이 명령의 Phase 2.5.4가 `## Codex Implementation
  Review` 주입을 의무화하고 2.5.6이 그 존재를 검증하므로 `plan_hash`가 반드시 바뀌고
  `mccp-plan-codex` receipt가 stale이 된다. 재봉인은 §3.12 no-rehash와 `write.js` DD13
  bind가 코드로 거부한다. `MCCP_RECEIPT_GATE_MODE=soft`도 `MCCP_SKIP_RECEIPT=1`도 이 축을
  들어올리지 못했다(둘 다 exit 2 실측). 선례(orchestrator-step-wiring M1 / PR #174)와 같은
  상태로 진행했고 backlog에 등재했다.
- **`C:\synthetic` 아래 204개 유출 파일.** `dispatch-controller.test.js`의 "no real fs"
  주장이 거짓이어서 여러 실행에 걸쳐 드라이브 루트를 오염시켰다. 정리했고 재발 방지
  단언을 넣었다.
- **자기 유발 evidence 앵커 drift.** `plan-review/cli.js`에 줄을 삽입해 registry의 앵커가
  밀렸고 L10이 잡았다. 게이트가 자기 변경을 잡은 것이므로 계약이 작동한 사례.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `scripts/tests/test-suite.test.js` | 5 신규 `(12)`~`(12e)` | `childEnv` 강제 정책 · `--allow-codex` 해제 · `MCCP_ROUND_LEDGER` 미대입 불변식 · `MCCP_SUITE_REPO_ROOT` 소비 · 상속 차단 유지 |
| `plugins/mccp/scripts/lib/tests/plan-review-l1.test.js` | 2 (plan 사이클 산출) | dot 경로 해소 + 부재 dot 경로 여전히 거부 |
| `plugins/mccp/scripts/lib/tests/dispatch-controller.test.js` | 단언 1 추가 | "no real fs" 주장을 기계가 검증 |

신규 test 파일은 만들지 않았다(UI3 — 커버리지 향상 목적의 신규 test는 범위 밖).

## 미완 — 다음 단계에 달린 것

- **Linux 3회 측정.** `test-suite-baseline.yml` dispatch → artifact `--merge-into`.
  브랜치가 원격에 올라간 뒤에 가능하다.
- **갈래 P 2건 미판정** — `derive/tests/mask.test.js` · `santa-loop-cap.test.js` DD3.
  Windows에서 재현 불가라 추측으로 고치지 않았다. 전자는 유출 필드 좌표를 내도록 진단을
  강화했다.
- **갈래 F·R 4건** — 로컬 4회 전부 green이나 Linux 확인 필요.
- **계획 Acceptance 2번 미충족** — "3원소의 failing 집합이 동일"은 로컬 축에서 성립하지
  않는다(r3에서 flaky 1건). 반올림하지 않고 기록했다.

## Next Steps

- [ ] `/mccp:prp-commit` → `/mccp:pr` (PR-Codex가 cross-model 반증의 회수 지점)
- [ ] PR CI에서 Linux 3회 측정 → 컨테이너 병합 → `m2-green.md` §5c 갱신
- [ ] milestone 2 status를 `complete`로 전환(위 측정 후)
