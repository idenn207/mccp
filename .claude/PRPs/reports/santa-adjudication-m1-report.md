# Implementation Report: santa 판정 계약 M1 — severity contract + 게이트 재배선

**Plan**: `.claude/plans/santa-adjudication-m1.plan.md` (`plan_hash=sha256:1f77424e…`, 본문 무편집)
**Branch**: `santa-adjudication` · **Version**: 1.26.0 → 1.26.1
**Date**: 2026-08-17

## Summary

`/mccp:santa-loop`의 판정 입력을 리뷰어의 `verdict` 문자열에서 **병합·중복제거된 blocking 건수**로 옮기고, blocking의 자격을 `severity ∈ {CRITICAL, HIGH}` ∧ 실질 `failure_scenario`에 못박았다. 같은 milestone에서 `{A,B}` 완전성(distinct reviewer id ≥ 2)을 함께 닫아 `record --id A` 2회 우회를 제거했다. 동결 함수 `gate.decideVerdict`는 시그니처·반환 3필드·동작 모두 무변경이고, 판정은 신규 export `decideAdjudicatedVerdict`가 하며 완화 자격을 얻지 못하면 동결 함수에 **위임**한다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 10 | 14 (+1 미계획 `santa-loop-cap.test.js`, +3 version 동기면) |
| 신규 모듈 | 0 | 0 |
| 신규 export | 4 | 4 |
| 회귀 test 항목 | 25 | 25 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | severity oracle 3종 (`gate.js`) | 완료 | `classifyFinding` 포함 실제 4종. `validateReason`은 import(재구현 아님) |
| 2 | `decideAdjudicatedVerdict` | 완료 | 의사코드 그대로 — 불리언화 후 AND, 완화는 `allPass` 한 항만 면제 |
| 3 | `cli.js` envelope 확장 | 완료 | `deriveFinding`이 DD4 파생 표를 원소 단위로 구현. `cmdVerdict` 재배선 |
| 4 | `santa-loop.md` severity contract | 완료 | Step 3/4/5. FAIL-first 문장 무변경 |
| 5 | 기존 test 주석 갱신 | 완료 | `santa-gate.test.js` 단언 코드 diff 0 |
| 6 | 문서·버전·PRD | 완료 | ENVIRONMENT.md · ownership.md · 1.26.1 4면 동기 · CHANGELOG |
| 7 | 실 경로 1회 완주 | **부분** | 3라운드 완주·봉인은 성공, (b) 불일치 재현 실패 — 아래 참조 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | repo에 root `package.json`·lint config 없음 (Node native runner만) |
| Unit + CLI Tests | Pass | santa-adjudication 25 · santa-gate 10 · santa-loop-cap 47 · santa-seal 13 · santa-review-gate 12 — **fail 0** |
| 커버리지 계약 | Pass | 25/25, 각 항목 assert ≥ 1 (Validation 스크립트 기계 대조) |
| 동결 함수 무변경 | Pass | `decideVerdict` 반환 키 정확히 `["exitReason","failing","verdict"]` · 신규 export 3종 존재 |
| Build | N/A | 빌드 스텝 없음 |
| CI 게이트 | Pass | gitignore-provision 86 · instruction-contract 28 · i18n-surface 10 |
| §3.5.1 삭제 검증 | Pass | `git diff --diff-filter=D origin/main...HEAD` 0건 |

### Design Grounding (v1.18.22)

N/A — design trigger 미발화 (`impeccable-detect`: `design_signal=false`, `silent_skip=true`, reason `no-signal`). 이 milestone은 CLI·JSON 표면만 만들고 렌더 표면을 만들지 않는다. Phase 2.5.5c capture 미수행 → Phase 3.6·3.7 완전 no-op.

## Task 7 실경로 결과 (Acceptance 4번째 항목)

| 검사 | 결과 |
|---|---|
| (a) 원장이 라운드를 기록했다 | **PASS** — `rounds=3` |
| (b) verdict NICE ∧ mismatch ≥ 1 | **FAIL** — 3라운드 모두 mismatch 0 |
| (c) 집계 리포트 산출 | **PASS** — `.claude/reviews/santa-review-santa-adjudication.md` |
| (d) receipt 집계가 원장과 일치 | **PASS** — `santa_rounds=3` 일치, seal verdict `converged` |

3라운드 실측(리뷰어 6명, 전원 opus, Codex는 쿼터 소진으로 Claude Agent fallback):

| round | verdict | contract | blocking | mismatches |
|---|---|---|---|---|
| 0 | NICE | full | 0 | 0 |
| 1 | NICE | full | 0 | 0 |
| 2 | NICE | full | 0 | 0 |

라운드 1에서 리뷰어 B가 실질 `failure_scenario`를 갖춘 MEDIUM 1건을 냈고 `structured:1 / blocking:0`으로 계수됐다 — **severity 게이팅 자체는 실경로에서 작동**했다. 재현되지 않은 것은 불일치 표면이며, 그것은 리뷰어가 `FAIL`을 내면서 blocking을 못 내야 성립하는데 6명 전원이 `PASS`를 냈다. 원인 분석과 처방은 PRD Open Questions에 실측으로 남겼다(상류 프롬프트가 하류 게이트의 완화 대상을 이미 제거하는 구조적 억제로 판단).

**plan Task 7 step 4대로 이 항목은 fail-closed 미완료다.** milestone status는 `in-progress`를 유지한다.

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/santa/gate.js` | UPDATED | +303 / -3 |
| `plugins/mccp/scripts/lib/santa/cli.js` | UPDATED | +125 / -5 |
| `plugins/mccp/commands/santa-loop.md` | UPDATED | +72 / -7 |
| `plugins/mccp/scripts/lib/tests/santa-adjudication.test.js` | CREATED | +547 |
| `plugins/mccp/scripts/lib/tests/santa-gate.test.js` | UPDATED | +19 / -8 |
| `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` | UPDATED | +44 / -11 |
| `docs/ENVIRONMENT.md` · `docs/santa-loop/ownership.md` | UPDATED | +18 |
| `plugins/mccp/.claude-plugin/plugin.json` · `renderer/html.js` · `renderer/markdown.js` | UPDATED | version 동기 |
| `CHANGELOG.md` | UPDATED | `## [1.26.1]` |
| `.claude/prds/santa-adjudication.prd.md` · `.claude/plans/codex-findings-backlog.md` | UPDATED | Open Question + backlog 2건 |

## Deviations from Plan

1. **`santa-loop-cap.test.js` (미계획 파일 1건)** — plan `Files to Change`에 없으나 세 단언이 M1의 변경에 기계적으로 종속된다. (i) envelope deepEqual에 `findings` 추가, (ii) `verdict` stdout deepEqual에 계측 3필드 추가, (iii) `record --id A` 2회 라운드의 기대 verdict NICE → NAUGHTY. 셋 다 그 단언 자신이 "P1이 이 규칙을 넣으면 함께 갱신하라" / "새 의존이 들어와야 한다면 여기 한 줄이 승인 기록" 이라고 **명시한 자리**다. 의존 allowlist에 `force-override-reason` 1줄 추가(Task 1이 import를 의무화).

2. **plan-conflict detector의 `conflict:true`는 오탐으로 판정하고 escalate하지 않았다** — `normalizePath`가 백틱을 벗기지 않아 plan 표의 10개 경로가 전부 `` `path` `` 로 파싱되고 어떤 실제 경로와도 매칭되지 않는다(오탐 목록 상위 3건이 plan 61·62·63행에 리터럴로 있는 경로였다). 백틱만 벗겨 같은 oracle을 재실행하면 `conflict:false`이고 실제 미계획 파일은 위 1건(임계 2 미만)이다. detector 결함은 HIGH로 backlog 등재.

3. **plan 본문을 편집하지 않았고 `## Codex Implementation Review` 섹션도 plan에 넣지 않았다** — `mccp-plan-codex` receipt가 `plan_hash`로 봉인했으므로 한 글자만 바꿔도 downstream이 stale로 차단한다(실측: 섹션 주입 시 해시가 `1f77424e…` → `7a0e0061…`). 게이트 기록은 `.claude/notes/santa-adjudication-m1-gate.md`가 소유한다.

4. **plan을 `completed/`로 아카이브하지 않았다** — 이 저장소는 `.claude/PRPs/plans/completed/`를 쓰지 않는다(`origin/main`에 0건). §3.11대로 PRD 전 milestone 완료 시 `/mccp:archive-complete`가 `archived/`로 옮긴다.

5. **PRD Open Question 1(`failure_scenario` 판정 주체)을 해소 표시했다** — DD5가 그 답이라고 plan이 명시하므로 답과 남는 한계를 함께 기록.

6. **게이트 순서 위반 (제 실행 오류) — Phase 2.5.6 receipt write가 Phase 3 EXECUTE보다 뒤에 실행됐다.** 커맨드 본문은 receipt write → read-back validate 뒤에 Phase 3에 진입하도록 규정하는데, 2.5.5(security-reviewer)에서 바로 구현으로 넘어가 Task 1~7을 마친 뒤에야 이를 발견하고 보정했다. **완화 요인이 아니라 사실**: 이 순서가 막으려는 것은 "미작성 receipt 위에서 EXECUTE가 시작되는 것"이고, 그 상태가 실제로 존재했다. 보정 후 `validate --command mccp:prp-implement` exit 0 · `--command mccp:pr` chain도 exit 0(informational warning 1건: `impeccable_silent_skip`, CLI-only 변경이라 예상된 값)이므로 산출물 자체는 정합하다. receipt는 `--codex-verdict skipped`(env 정책 disabled) + `--impeccable-silent-skip`로 봉인했다.

## Issues Encountered

- **Codex CLI 쿼터 소진(2026-08-20 복구)** — Reviewer B가 `santa-loop.md`의 Claude Agent fallback으로 내려갔다. 이번 라운드는 모델 다양성이 아니라 컨텍스트 격리만 강제됐다.
- **라운드 0의 리뷰어 프롬프트 결함(제 실행 오류)** — "blocking 이슈가 있을 때만 verdict를 FAIL로" 라는 `santa-loop.md`에 없는 지시를 넣어 관측 대상인 `fail-without-blocking`을 구조적으로 억제했다. 라운드 1·2는 커맨드 본문에 충실한 프롬프트로 재실행했으나 결과는 동일했다.
- **coverage 23의 초안 단언이 receipt 자신의 `findings` 필드와 충돌** — receipt skeleton에 동명 필드가 있어 `'findings'` 부분 문자열 부재 단언이 거짓 red를 냈다. 리뷰어 축(`"raw"`·`"envelope"`·`criticalIssues`·`failureScenario`·canary)의 부재 + `receipt.findings === []`로 정밀화.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/lib/tests/santa-adjudication.test.js` | 25 | 커버리지 계약 1~25 전량 (oracle · CLI 왕복 · 커맨드 본문 · receipt 경계 · 두 층 정합) |

## Next Steps

- [ ] Task 7 (b) 처방 결정 — PRD Open Questions의 3안 중 선택 (지표 재정의 / 대조군 측정 / 설계 축소)
- [ ] backlog 2건 — `plan-conflict-detector` 백틱 오탐(HIGH) · `distinctIds` 정규화 불일치(MEDIUM)
- [ ] 위 결정 후 `/mccp:prp-commit` → `/mccp:pr`
