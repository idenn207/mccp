# Implementation Report: ci-full-suite M3 — ci-enforcement

> Plan: `.claude/plans/ci-full-suite-m3w.plan.md` (2413행 · L2 패널 **24라운드** 후 수렴)
> 산출 문서: `docs/ci-full-suite/m3-enforcement.md` · `docs/ci-full-suite/branch-protection-runbook.md`
> 게이트 receipt: `.claude/receipts/mccp-implement-codex/ci-full-suite-m3w.json`

## Summary

전수 스위트를 **머지 차단 게이트로 승격**하는 배선이 전부 착지했다. 강제 workflow 하나 ·
5단계 판정(`gate.js`) · 커버리지 오라클 · 삭제 래칫 · 격리 검증기 · 절단 셋 · drift 진단 ·
컨테이너 검사가 각각 짝 test와 함께 들어왔다.

**그러나 라이브 완주는 0회다.** Acceptance가 요구하는 산출물 넷은 전부 CI에서만 얻을 수
있고, 브랜치가 아직 원격에 없어 CI가 한 번도 돌지 않았다. 이 보고서는 그것을 반올림하지
않는다(UI9) — 무엇이 착지했고 무엇이 남았는지를 §"미충족"이 열거한다.

구현 중 **보안 HIGH 1건을 그 자리에서 흡수**했다. fork PR이 통제하는 격리 파일에서
도달 가능한 ReDoS가 이 milestone이 만드는 **유일한 머지 차단 체크**를 60분 태울 수
있었고, 머지되면 이후 모든 PR이 같은 비용을 지불하는 형태였다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | High | High — 계획 자체가 24라운드를 소모했다 |
| Files Changed | 28 | 신규 15 · 수정 3 (계 18) + 문서 2 |
| 신규 test 파일 | 4 | 4 (`test-suite-coverage` · `wiring-cut` · `ci-required-checks` · `container-check`) |
| 단위 test 건수 | 미예측 | **150** (신규 88 + 기존 확장 47 + code-review 흡수 15) |
| version | 선언하지 않음 (우산 결정 1) | 선언 없음 — `version-declaration-guard.js` exit 0 |
| Codex 라운드 | 1 (캡) | 0 — `MCCP_CODEX_DISABLED=1` 정책으로 `classification=disabled` |
| 보안 finding | 미예측 | HIGH 1 흡수 · MEDIUM 1 이연 (`mccp:security-reviewer` 실행) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | Linux red 집합 재측정 | **CI 차단** | dispatch는 브랜치가 원격에 있어야 성립. 입력은 M2 종결의 실측 판정을 썼다 |
| 1 | red 갈래별 처리 | 완료(격리 6 · 수리 0) | 여섯 전부 Windows 로컬 green이라 재현 불가 — UI7과 Risks 행대로 격리 + 티켓 |
| 2 | 커버리지 오라클 | 완료 | `coverage.js`(순수) + `inputs.js`(IO) 분리. 분모는 게이트 소유 `git ls-files -z` |
| 3 | 격리 검증기 | 완료 | `exclusions.js` — `ticket` 필수 · 상한 6 · **복잡도 상한 셋**(보안 흡수) |
| 4 | 러너 재배선 + CI 가드 | 완료 | `run.js`가 `--exclude-from`을 `loadExclusions`로 지난다. `--allow-codex`는 CI에서 throw |
| 5 | 강제 workflow | 완료(배선) | `paths` 필터 없음 · SHA pin · job 이름 안정 리터럴 · `timeout-minutes` job 수준 60 |
| 6 | baseline OS 축 | 완료(배선) · **측정 없음** | 편집 5 전부 착지, dispatch 미수행 → **OQ3 미종결** |
| 7 | 축 D 절단 셋 | 완료(로컬) · **CI 미실증** | 로컬 왕복 3종 전부 통과. run URL 2건은 미충족 |
| 8 | branch protection | 완료(진단·런북) · **설정 미수행** | `ci-required-checks.js`가 현재 `protection_absent`를 정직하게 보고 |
| 9 | 컨테이너 병합 | **CI 차단** | 검사 스크립트와 test는 착지. 병합할 Linux 원소가 아직 없다 |
| 10 | 문서·PRD·backlog | 완료 | m3-enforcement.md · runbook · PRD 4곳 · backlog 10행 · CHANGELOG 3절 |

## Validation

계획의 `## Validation` 블록 13개 검사 전부 실행. 실행 순서는 번호 순이다(R23이 producer를
물리적으로 앞으로 옮겼다).

| 검사 | 결과 |
|---|---|
| 0 열거 sanity | 통과 |
| 1 단위 test 5면 | 통과 — 150건 · fail 0 (같은 사이클의 `/mccp:code-review` 흡수 뒤 재측정) |
| 2p 전수 measurement producer | 통과 — `ok=true` |
| 2 버킷 완전성 (`--assert-accounted`) | 통과 — `unexplained=[]` · `ok=true` |
| 3 격리 목록 + DD7 재배선 단언 | 통과 — ticket 없는 fixture가 비영점 |
| 3b CI 전용 회귀 (`GITHUB_ACTIONS=true`) | 통과 |
| 4 축 D 오라클 왕복 | 통과 — 절단 시 red(rc=1) · 복원 후 green · 바이트 동일 |
| 4a 절단 A 왕복 | 통과 — index 반영 · 격리 회피 · 흔적 0 |
| 4b 절단 B 왕복 | 통과 — `deleted_without_allowance`로 차단 |
| 5 required check drift 진단 | note — 보호 미설정이라 drift 정상(exit 0은 Task 8 이후 소유) |
| 6 컨테이너 무결성 | 통과 — 9원소 전부 3축 만족(실 필드 확인) |
| 7 100% 진단 (`--assert-full`) | note — 98.44%, 격리가 있으니 정상이며 차단 사유 아님(DD2) |
| 7b 게이트 등가 3축 | **통과 (exit 0)** — 계획이 열어 둔 "Windows 전용 red로 1단계 차단" 경로에 들어가지 않았다 |

전수 실측(격리 6건 적용, 2026-09-04): tracked **388** · 실행·귀속 **382** · **실패 0** ·
`attribution=complete` · `redaction_ok=true` · 벽시계 **650초** · `coverage_pct` **98.4536**.

측정을 **두 번** 돌렸다. 첫 회(378/384)는 이 milestone 자신의 test 4면이 아직 tracked가
아닐 때의 값이라, staging 후 재측정해 CI가 실제로 낼 숫자로 바꿨다. 검사 4b도 현재 트리에서
다시 돌려 `stage=2` · `reasons=["deleted_without_allowance"]` · `unexplained=0` ·
`coverage_pct=98.4496`(분모 387)을 확인했다 — **커버리지가 만족한 채로 차단**되는 것이
이 milestone의 핵심 실증이다.

## Deviations

**1. Phase 2.5.6/2.5.7의 순서 이탈 — 정직하게 기록한다.**
receipt write와 read-back validate를 Phase 3 EXECUTE **앞**에서 해야 했는데, 2.5.5에서
곧바로 구현으로 넘어갔다. 사후에 수행했고 `mccp-implement-codex` receipt는 작성·검증됐다
(`receipt_hash sha256:e9aa6a1a…`, `--codex-verdict skipped`). 게이트가 **건너뛰어진 것은
아니지만 순서가 어긋났고**, 그것을 보고하지 않고 지나가는 것이 이 계획이 반복해서
지적한 실패 모드다.

**2. 선행 `mccp-plan-codex` receipt가 구조적으로 stale.**
read-back validate가 `stale` 1건을 낸다 — 2.5.4의 **의무** 리뷰 섹션 주입이 plan 본문을
바꾸므로 `plan_hash`가 반드시 어긋난다. §3.12 no-rehash가 재봉인을 금지하므로 복구
경로가 없다. 이 저장소의 모든 shipped 사이클이 겪는 구조적 사안이고 이미 backlog에 있다.
`missing`·`blocking`·`open_critical`은 전부 비었다.

**3. 라운드 캡.** Codex는 `disabled` 정책으로 발화하지 않았다(`durationMs=1`). §3.16대로
1라운드 기본이며 L2 패널은 계획 단계에서 이미 24라운드를 소모했다.

## 미충족 — 반올림하지 않음

계획 Acceptance의 라이브 산출물 **넷 전부**가 미충족이며 원인은 하나다: 브랜치가 원격에
없어 CI가 한 번도 돌지 않았다.

1. PR에서 `test-suite` 체크가 발화하고 green — **미충족**
2. 커버리지 실값이 **CI에서** 산출 — **부분**(로컬 실값은 있음, CI producer 미실증)
3. 절단 A·B가 각각 CI에서 red를 만든 run URL 둘 — **미충족**(로컬 왕복만)
4. 운영자 branch protection 설정 후 진단 exit 0 — **미충족**(수동 1회 필요)

추가로: Task 0의 Linux 재측정 미수행 · **OQ3 미종결**(배선은 착지, 측정만 없음) ·
Task 9 컨테이너 병합 대기 · `fully_skipped` 축은 측정 공백으로 남긴다(합성 fixture로만
단언되는 필드를 스키마에 올리지 않는다 — DD2 철회).

닫지 **않은** 것도 명시한다: 게이트 위조는 막지 않는다(DD4a — 판정 입력과 판정 모듈이
모두 같은 PR의 tracked 트리에 있다). `redaction_ok` 차단이 artifact 발행을 막지 못한다
(업로드가 `if: always()`인데, 조건화하면 축 D의 red run 증거가 사라진다 — 증거를 택했다).

## Next

`/mccp:prp-commit` → `/mccp:pr`. **이 PR 자신이 Acceptance 1의 실증**이다 —
강제 workflow에 `paths` 필터가 없으므로 이 PR에서 체크가 발화한다. 머지 후 순서:
Task 0 dispatch → Task 6 OS 축 측정 → OQ3 판정 → 버리는 브랜치에서 축 D run URL 둘 →
운영자 branch protection → Task 9 컨테이너 병합.
