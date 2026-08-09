# Implementation Report: Red Test Suite Restore — M1 테스트 신호 복원

**Plan**: `.claude/plans/red-test-suite-restore-m1.plan.md`
**Source PRD**: `.claude/prds/red-test-suite-restore.prd.md`
**Branch**: `fix/v1.23.1-goal-detect-and-red-tests`
**구현 커밋**: `55badb5`
**리포트 작성**: 2026-08-08

## Summary

상시 red였던 pre-existing 테스트 2건을 각각의 실제 원인에 맞게 해소했다. 어느 테스트도 skip·삭제·약화되지 않았고, pass 수는 오히려 증가했다(무력화 탐지 지표 충족).

1. **audit-timeline이 주입 clock을 무시하던 결함** — `renderer/index.js`가 `renderAuditTimeline`의 `now` 인자에 `undefined`를 하드코딩해 함수 내부 `Date.now()` 폴백이 항상 발동했다. 7일 창 필터가 픽스처 타임스탬프(2026-07-01 고정)를 실제 벽시계와 비교하게 되어, 실시각이 2026-07-08을 지난 순간부터 픽스처가 창 밖으로 밀려나 drawer가 receipt 3건 대신 0건을 냈다. **낡은 기대가 아니라 시한폭탄**이었다. 수정은 `opts && opts.now` 전달 한 줄.
2. **gitignore된 경로의 커밋 산출물을 요구하던 테스트** — `design-critique-loop-e2e` 케이스 F가 `.claude/cache/test-fixture-status.html`의 repo 존재를 assert했으나 `.gitignore:82`가 `.claude/cache/`를 무시하므로 **구조적으로 충족 불가능**한 단언이었다. CLAUDE.md §3.9가 이미 해당 fixture를 "커밋물이 아닌 test-time 임시 합성 파일"로 규정하고 있다. 실제 계약(detector가 whitelist 경로를 인식하는가)을 검증하도록 교체했다.

**프로덕션 동작 delta 0** — 프로덕션 렌더 호출부는 `derive/cli.js:146`과 `renderer/trigger.js:298` **둘뿐이고 둘 다 `now`를 넘기지 않으므로**, 수정 후에도 `opts.now === undefined` → 기존 `Date.now()` 폴백이 동일하게 발동한다. 결정론은 테스트에서만 복원된다.

## 본 세션의 성격 (정직 고지)

이 리포트를 작성한 세션은 **구현을 수행하지 않았다**. `/mccp:prp-implement` 재진입 시점에 Task 1~4가 이미 `55badb5`로 커밋돼 있었다. 본 세션이 한 일은 (a) 완료 상태의 독립 검증, (b) plan Task 4가 요구한 전수 baseline 확정, (c) Phase 5 산출물(본 리포트) 작성이다.

재진입 시 hook이 도출한 decision slug는 `red-test-suite-restore-m1`으로, 실제 게이트가 돌아간 슬러그 `red-test-suite-restore`와 **다르다**(인자에 plan 경로가 포함된 탓). 그대로 진행하면 Phase 0.0이 실제로 수행된 적 없는 Plan-Codex receipt를 새 슬러그로 생성하고 Implement-Codex를 재호출해 **receipt chain이 두 슬러그로 분기**했을 것이다. 게이트 우회가 아니라 통과한 게이트의 위조 복제이므로 chain-of-custody가 훼손된다 — 그래서 재실행하지 않았다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small | Small — 프로덕션 변경 1줄 + 테스트 2파일 + version surface 5곳 |
| Files Changed | 8 | 8 (일치) |
| Codex 라운드 | R1 (cap=1) | Plan-Codex R1 · Implement-Codex R1 — 양쪽 `needs-attention` → 게이트 verdict `divergent` |
| renderer pass | ≥666 | **668** |
| 전수 fail | (미예측) | **8** — 전부 본 milestone 범위 밖 pre-existing |

## Tasks Completed

| # | Task | 상태 | 비고 |
|---|---|---|---|
| 1 | audit-timeline clock 주입 복원 | 완료 | `renderer/index.js:132` — `undefined` → `opts && opts.now` |
| 2 | 시한폭탄 재발 방지 회귀 가드 | 완료 (**deviation**) | 아래 「Deviations」 참조 |
| 3 | fixture 전제 교체 | 완료 | 케이스 F를 repo-존재 assert → test-time 합성 + detector 검증으로 교체. `test.skip` 미사용, 테스트 수 15건 유지 |
| 4 | 전수 baseline + 버전/CHANGELOG | 완료 | plugin.json `1.23.1→1.23.2`, html/markdown footer + i18n anchor 동기, CHANGELOG row. 전수 baseline은 본 세션에서 확정 |

## Validation Results

이 저장소는 `package.json`이 없는 순수 `node --test` 프로젝트다 — type-check/lint/build 레벨은 **해당 없음**(N/A)이며 존재하지 않는 단계를 통과했다고 적지 않는다.

| Level | 상태 | 근거 |
|---|---|---|
| Static Analysis | N/A | typecheck/lint 스크립트 부재 |
| Unit Tests (대상 2 스위트) | **Pass** | renderer 668/668 · design-critique 15/15 |
| Build | N/A | 빌드 단계 없음 |
| Integration | N/A | 서버 없음 |
| Edge Cases | **Pass** | Task 2 가드 비공허성 A/B (아래) |

### 대상 스위트 실측

```
node --test "plugins/mccp/scripts/lib/renderer/tests/*.test.js"
  → tests 668 / pass 668 / fail 0        (수정 전: 667 / 666 / 1)

node --test "plugins/mccp/scripts/lib/tests/design-critique*.test.js"
  → tests 15 / pass 15 / fail 0          (수정 전: 15 / 14 / 1)
```

pass 수가 666→668, 14→15로 **증가**했다. 무력화(skip/삭제)로 green을 만들었다면 pass 수가 감소하거나 정체했을 것이므로, PRD Success Metric "기존 통과 케이스 회귀 0건"이 지표 수준에서 충족된다.

### Task 2 가드 비공허성 — 독립 A/B 검증

커밋 메시지가 "가드는 index.js 수정을 되돌리면 실패한다"고 주장하지만, 본 프로젝트에는 **테스트가 버그를 정답으로 고정한 전례가 반복**되므로(메모리 4회 기록) 주장을 액면 수용하지 않고 직접 재현했다.

| 상태 | verdict-label.test.js 결과 |
|---|---|
| Task 1 적용 (HEAD) | tests 8 / **pass 8** / fail 0 |
| Task 1 되돌림 (`opts && opts.now` → `undefined`) | tests 8 / pass 6 / **fail 2** — F1·F2 모두 실패 |

되돌림 후 `git checkout --`로 복원했고 작업 트리가 세션 시작 시점과 byte-동일함을 `git status`로 확인했다. **가드는 공허하지 않다.**

### Design Grounding

**N/A** — Phase 2.5.5c capture 아티팩트가 없다(본 세션은 게이트를 재실행하지 않음). 원 cycle의 plan 본문 「Design Critique」는 verdict `CONVERGED`(findings 0)를 기록하며, 근거는 프로덕션 렌더 표면 delta가 0이라는 점이다.

## Deviations from Plan

**1건 — Task 2 가드의 형태.**

plan Task 2는 경계 쌍을 명시했다: 주입 `now = T + 6d23h` → 포함, `now = T + 7d1h` → 배제. 실제 구현은 `NOW`(3건 전부 창 내) / `NOW + 8d`(3건 전부 창 밖)의 **창-횡단(window-straddle)** 형태로, 정확한 기대값 `k1 === 3` · `k2 === 0`을 단언한다.

- **살아남는 것**: Codex R1 F2가 요구한 핵심 성질 — "깨진 구현이 반드시 실패한다". 깨진 구현은 `opts.now`를 무시하고 실시각(2026-08-06)을 쓰므로 픽스처(2026-07-01)가 35일 낡아 `k1`이 3이 아니라 0이 되어 실패한다. 위 A/B가 이를 실측 확인했다.
- **잃는 것**: 7일 경계 **자체**의 정밀도. 6d23h/7d1h 쌍은 창 폭이 7일임을 고정하지만, NOW/NOW+8d 쌍은 "창이 8일보다 좁다"까지만 고정한다. 창 폭이 예컨대 7일→10일로 바뀌는 회귀는 이 가드가 잡지 못한다.
- **판단**: 본 milestone의 목표(주입 clock이 필터를 지배하는가)는 충족되므로 재작업하지 않았다. 경계 정밀화는 별건 후보로 아래에 남긴다.

그 외 Task 1·3·4는 plan대로 구현됐다.

## Files Changed (커밋 `55badb5`)

| File | Action | 변경 |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/index.js` | UPDATED | +1 / -1 |
| `plugins/mccp/scripts/lib/renderer/tests/verdict-label.test.js` | UPDATED | +48 |
| `plugins/mccp/scripts/lib/tests/design-critique-loop-e2e.test.js` | UPDATED | +40 / -12 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | +1 / -1 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | +1 / -1 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | +1 / -1 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATED | +4 / -4 |
| `CHANGELOG.md` | UPDATED | +11 / -1 |

부수 산출물: `.claude/plans/red-test-suite-restore-m1.plan.md`(신규 198줄), `.claude/prds/red-test-suite-restore.prd.md`(신규 97줄), `codex-findings-backlog.md`(+1), STATE/fix-task-applied.

## 전수 baseline (plan Task 4 — PRD Open Question 3의 답)

```
node --test "plugins/mccp/scripts/**/*.test.js"
  → tests 3366 / pass 3352 / fail 8 / skipped 6 / duration 367.8s
```

**잔존 red 8건.** plan Task 4의 계약("잔존 red가 있으면 고치지 말고 목록만 남긴다 — 별건 판단은 사용자 몫")대로 **기록만** 한다.

| # | 위치 | 테스트 | 단언 |
|---|---|---|---|
| 1 | `hooks/tests/g1-patch.test.js:42` | receipt-prompt: module-load error emits systemMessage + allows (G1) | `must allow (exit 0) on internal error` |
| 2 | `hooks/tests/g1-patch.test.js:79` | receipt-skill: module-load error emits systemMessage + allows (G1) | `must allow (exit 0) on internal error` |
| 3 | `hooks/tests/g1-patch.test.js:117` | receipt-prompt: no session_id → G1 allows + systemMessage without trace path | `Expected values to be strictly equal` |
| 4 | `lib/tests/hook-caps.test.js:206` | probeBinary: records binary_resolved_path + binary_mtime_ms | `resolved path must differ from the literal command name` |
| 5 | `lib/tests/pr-phase-helpers/finalize-receipt.test.js:245` | M3 finalize: skipped WITH audited reason → exit 0 | `receipt schema validation failed` |
| 6 | `lib/tests/pr-phase-helpers/finalize-receipt.test.js:263` | M3 finalize: skipped WITHOUT reason → exit 12 [F2] | exit 0 ≠ 12 (fail-closed 미발화) |
| 7 | `lint/tests/validate-callsite-lint.test.js:104` | validate 호출부가 `--decision` AND `--plan`을 전달 | `pr.md:202`, `pr.md:856` 2곳 `--plan` 누락 |
| 8 | `receipt/tests/dedupe.test.js:306` | computeResidual: glob entries in plan match actual diff files | `Expected values to be strictly equal` |

### 귀속 판정

본 브랜치는 위 **5개 파일을 하나도 건드리지 않았다** — `git log origin/main..HEAD -- <file>`이 5개 전부 `0 commits`. 즉 8건 모두 `origin/main` 기준 pre-existing이며 본 milestone이 유발한 회귀가 아니다.

### 근본원인 진단 (후속 세션 실측 — 2026-08-08)

plan Task 4는 "기록만"을 요구하므로 **수정은 하지 않았다.** 다만 목록만으로는 "무엇을 별건으로 낼 것인가"를 판단할 수 없어, **읽기 전용 재현**으로 원인만 규명했다. 결과적으로 **8건은 성격이 셋으로 갈리며, 실제 코드/문서 결함은 4건(근본원인 2개)뿐이다.**

판별 절차: (1) 각 파일 **개별 실행**, (2) 앰비언트 `MCCP_CODEX_DISABLED` 제거 후 전수 재실행, (3) 의심 2파일 **동시 실행**.

| 실행 조건 | 결과 |
|---|---|
| 전수 (기본 환경) | tests 3366 / pass 3352 / **fail 8** / skipped 6 |
| 전수 (`MCCP_CODEX_DISABLED` 제거) | tests 3366 / pass 3356 / **fail 5** / skipped 5 |
| `hook-caps` + `dedupe` 동시 (기본 환경) | tests 38 / **pass 38** / fail 0 |

#### A. 실제 코드 결함 — G1 fail-open 불변식 파손 (3건: #1 #2 #3)

`receipt-prompt.js:70`과 `receipt-skill.js:105`의

```js
const { extractPlanPath } = require(path.join(LIB_DIR, 'extract-plan-path'));
```

가 **최상위·무방비 require**다. 모듈이 없으면 G1 fail-open try/catch가 설치되기 **전에** 던져 프로세스가 `exit 1` + stdout 공백으로 죽는다. 재현 시 실제 스택:

```
Error: Cannot find module '<broken-root>/scripts/lib/extract-plan-path'
    at Object.<anonymous> (.../scripts/hooks/receipt-prompt.js:70:29)
```

같은 파일 77-80행의 `receiptContext`는 **정확히 방어 패턴**(IIFE + try/catch)을 쓰며 *"Module-scope require so a failed load in main() can't itself throw"* 라고 이유까지 주석에 적어 둔다. 패턴은 이미 확립돼 있고 70행만 따르지 않는다.

**회귀 시점이 특정된다**: 테스트는 `9ea48b1`(v0.2.7, 2026-06-05)에 생성돼 당시 통과했고, `extract-plan-path` require는 `8cc9ac5`(v0.2.8 Task 2.6.5)로 **그 이후** 추가됐다. 즉 v0.2.8이 G1 불변식을 깨뜨렸고, 스위트가 상시 red라 **약 2개월간 신호가 묻혔다** — 본 PRD의 논지("red가 상수면 정보량이 0")를 그대로 입증하는 사례다.

영향 범위는 좁다: 정상 설치에서는 모듈이 존재하므로 발화하지 않고, plugin 설치가 불완전·손상된 경우에만 터진다. 그러나 그 상황이 바로 G1이 존재하는 이유다.

#### B. 실제 계약 위반 — `pr.md`가 자체 lint를 어긴다 (1건: #7)

`pr.md:202`(Phase 1.6 preflight)와 `pr.md:856`(Phase 2.5.9 ship-gate read-back)의 validate 호출부가 `--decision`은 넘기지만 **`--plan`을 누락**한다. 최종 변경은 `24675ff`(2026-07-30, integrity-unification M3).

결과가 구체적이다 — [validate-cmd.js:296](plugins/mccp/scripts/receipt/validate-cmd.js)의 staleness 검사가 **`--plan` 존재에 조건부**다:

```js
if (opts.planPath) {
  const currentHash = planAwareMarkdownHash(path.resolve(cwd, opts.planPath));
  if (currentHash !== receipt.plan_hash) { result.stale.push({...}); continue; }
}
```

즉 `/mccp:pr`의 두 지점에서 **plan이 게이트 이후 변경돼도 stale로 잡히지 않는다**. receipt chain이 강제하려는 staleness 축에 난 구멍이며, 하필 terminal 게이트다.

#### C. 테스트 hermeticity 결함 — 앰비언트 env 누출 (2건: #5 #6)

`MCCP_CODEX_DISABLED=1`이 이 환경에 설정돼 있고(프로젝트 `settings.json`이 아닌 상위 환경 — CLAUDE.md §4에 따르면 `/mccp:setup` Phase 4가 자동 write한다), `runFinalize` 헬퍼는 `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE`만 중화하고 이 변수는 놓친다. 이 변수 하나만 제거하면 **26/26 통과**로 실측 확인했다.

메커니즘 2개:

- **#5** — [write.js:219](plugins/mccp/scripts/receipt/write.js)가 env 감지 시 `codex_skip_reason`을 `'codex_disabled'`(**15자**)로 덮어쓴다. `codex_skipped_at_pr=true`면 schema가 strict validator(≥30자)를 적용하므로 정확히 `reason-too-short`. 공용 `validateReason(REASON,{strict:true})`는 같은 문자열에 `ok:true`를 주므로, 실패는 **검증기 불일치가 아니라 값이 교체된 것**이다.
- **#6** — [write.js:236](plugins/mccp/scripts/receipt/write.js)이 env 감지 시 `codex_disabled=true`를 자동 stamp하는데, 이것이 `pr-ship-gate.js`의 sanctioned proof marker 중 하나다. 그래서 proof 없는 skip이 **proof를 얻어** ship된다.

**결과가 뼈아프다**: `/mccp:setup`이 `MCCP_CODEX_DISABLED=1`을 써 둔 기계에서는, *"증거 없는 skip은 ship되면 안 된다"*를 지키는 바로 그 테스트(#6)가 **조용히 반전**돼 자기 임무를 수행하지 못한다. 프로덕션 코드의 결함은 아니지만, 가드가 무력화되는 조건이 **기본 설치 절차와 일치**한다는 점에서 우선순위가 높다.

#### D. Flaky — 전수 병렬 실행에서만 (2건: #4 #8)

`hook-caps.test.js:206`과 `dedupe.test.js:306`은 **개별 실행 통과**(14/14, 24/24), **둘만 동시 실행도 통과**(38/38, env 유지), **env 제거 전수에서도 통과**했고, env를 켠 전수 실행 2회에서만 실패했다. env 결합이 아니라(동시 실행이 이를 배제) 전수 규모의 병렬 간섭이다. 재현 조건이 비결정적이므로 원인 지목은 보류한다.

> 초기 기록에서 #4를 "`claude` 바이너리 PATH 부재"로 추정했으나 **오답**이다 — 개별 실행에서 통과하므로 PATH 전제는 충족돼 있다.

#### E. env 제거 시 새로 드러난 1건 (기본 환경에서는 skip)

`lib/tests/codex-companion-smoke.test.js` — "skip-on-unavailable" 계약의 실제 Codex 스모크다. `MCCP_CODEX_DISABLED=1`이면 skip되어 보이지 않고, 제거하면 실행돼 `real codex must succeed when reachable`로 실패한다(Codex 사용량 한도 소진 상태). 도달 가능성 판정이 실제 도달성과 어긋나는 것으로, 이 역시 환경축이다.

### 요약 — 실제 조치가 필요한 것은 4건 / 근본원인 2개

| 축 | 건수 | 성격 | 조치 필요성 |
|---|---|---|---|
| A. G1 무방비 require | 3 | **실제 코드 결함**(v0.2.8 회귀) | 높음 — 방어 패턴 2줄 |
| B. `pr.md` `--plan` 누락 | 1 | **실제 계약 위반**(staleness 미검출) | 높음 — terminal 게이트 |
| C. 테스트 env 누출 | 2 | 테스트 결함(가드 무력화) | 중 — 기본 설치와 조건 일치 |
| D. 병렬 flaky | 2 | 비결정적 | 낮음 — 재현 조건 미확정 |
| E. codex 스모크 | (1) | 환경(한도 소진) | 낮음 |

## PRD 반영 — Milestone은 `complete`로 전환하지 않았다

PRD Milestone 1의 **Outcome**은 *"`node --test` 전체 실행이 fail 0으로 통과해, 이후 red가 곧 신규 회귀를 의미하게 된다"* 이다. 전수 결과가 **fail 8**이므로 이 outcome은 **미충족**이다.

동시에 **plan M1의 자체 acceptance는 충족**된다 — plan은 Task 4에서 잔존 red를 명시적으로 범위 밖(“기록만”)으로 규정했기 때문이다. 즉 plan 범위와 PRD milestone outcome 사이에 간극이 있으며, 이 간극은 plan 작성 시점에 만들어졌다.

따라서 milestone status를 `complete`로 뒤집지 않았다. 뒤집으면 PRD의 Success Metric("전체 스위트 fail 수 0")이 달성됐다는 거짓 신호가 대시보드와 milestone-history에 남는다. 해소 경로는 둘 중 하나이며 **사용자 결정 사항**이다:

- (a) 잔존 8건을 다루는 **M2를 추가**해 PRD를 원래 outcome대로 종료한다.
- (b) PRD Milestone 1의 outcome을 "지목된 2건 해소 + 잔존 목록 확정"으로 **축소 개정**하고, 잔존 8건은 별도 PRD로 분리한다.

## Plan 아카이브 — 수행하지 않았다

`/mccp:prp-implement` Phase 5 템플릿은 plan을 `completed/`로 옮기라고 하지만, **CLAUDE.md §3.11 C2가 이를 금지한다**: *"완료 plan archive는 PRD 전체 완료 시에만. 미완료 PRD의 plan을 옮기면 어느 스캔에도 안 잡혀 PRD가 소실된다."* PRD가 위 사유로 미완료이므로 아카이브하면 데이터 손실 위험이 있다. 프로젝트 instruction이 명령 템플릿을 override한다.

## Plan 본문 — 편집하지 않았다 (acceptance 체크박스 포함)

plan의 `## Acceptance` 체크박스를 채우려면 plan 본문을 편집해야 하는데, `mccp-implement-codex` receipt가 `plan_hash: sha256:448934124…`로 plan을 봉인하고 있다(현재 파일 hash와 **정확히 일치** 확인).

plan 경로는 `planAwareMarkdownHash` → `markdownHashStructural` 경로를 타고 그 canonicalize 파이프라인에 `normalizeCheckboxes`가 포함돼 있어, **체크박스 상태는 해시에서 정규화될 것처럼 보인다**. 코드 독해만으로 그렇게 판단하지 않고 실측했다 — 체크박스 1개(`- [ ] Task 1-4 완료` → `- [x]`)만 바꾼 뒤 재해시:

```
before = sha256:448934124210dfef5fbdc3a116b66e3e59d076f40b3aebe48b11c4d0d25d4297
after  = sha256:3aa99a3912fa9f9289e11a7f19e4b46cce7bb0bd549b205ec64f5fc39d74ace2   ← 변경됨
```

**해시가 바뀐다.** `normalizeCheckboxes`는 체크 *상태*를 지우지 않는다. 따라서 체크박스 하나만 건드려도 receipt chain이 `stale`로 떨어지고, 이미 `divergent`로 막혀 있는 PR 게이트에 staleness 차단이 하나 더 얹힌다. 시험 편집은 `git checkout --`로 즉시 원복했다.

acceptance 검증 결과를 대신 여기 기록한다:

| plan Acceptance 항목 | 판정 | 근거 |
|---|---|---|
| Task 1-4 완료 | 충족 | 커밋 `55badb5` |
| 두 스위트 fail 0 | 충족 | 668/668 · 15/15 |
| renderer pass ≥ 666 | 충족 | 668 |
| Task 2 가드가 Task 1 되돌림 시 실패 | 충족 | 본 세션 A/B 재현 (fail 2) |
| 전수 baseline 결과 기록 | 충족 | 위 표 8건 |
| plugin.json 1.23.2 + CHANGELOG row | 충족 | 실측 확인 |
| footer drift 0 | 충족 | `grep -rn "v1.23.1" .../renderer/` 공집합 |
| Task 2 가드가 **경계 단언** 형태 | **부분 충족** | 창-횡단 형태 — 「Deviations」 참조 |
| skip·삭제·주석 처리 0 | 충족 | 케이스 F는 교체(테스트 수 15 유지), `test.skip` 미사용 |

## 게이트 상태

| Gate | Receipt | codex_verdict |
|---|---|---|
| `mccp-plan-codex` | `red-test-suite-restore.json` | `divergent` |
| `mccp-implement-codex` | `red-test-suite-restore.json` | `divergent` |
| `mccp-pr-codex` | `red-test-suite-restore.json` (untracked) | `divergent` |

세 receipt 모두 `divergent` 봉인이 **의도된 정상 동작**이다. plan 본문의 「receipt verdict 봉인 주의」가 명시하듯, 흡수 여부와 무관하게 Codex가 실제로 말한 값을 봉인해야 cross-gate dedupe가 fail-closed로 유지되고 PR-Codex가 실제로 발화한다. `converged`로 세탁하면 dual-review가 조용히 우회된다.

## Next Steps

- [ ] **PR 단계 결정** — v1.23.0 M3 ship gate가 `pr_codex_nonconverged`(prior_verdict=`divergent`)로 차단 중. 해소는 (i) fresh diff로 PR-Codex 재발화 또는 (ii) `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE="<substantive reason>"` audited override(봉인 verdict는 재작성하지 않음).
- [ ] **PRD 처리 결정** — 위 (a) M2 추가 / (b) outcome 축소 개정 중 택일.
- [ ] **잔존 red 8건 처리 결정** — 특히 #6(ship-gate fail-closed 미발화)과 #7(`pr.md` lint 자체 위반)은 게이트 무결성 축.
- [ ] `mccp-pr-codex` receipt가 untracked 상태 — §3.12 durable-evidence 계약상 ship receipt는 git-tracked여야 하므로 PR 확정 시 커밋 대상.
- [ ] (선택) Task 2 가드를 7일 **정밀 경계** 쌍으로 강화.
