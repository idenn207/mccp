# Implementation Report: Gate Guard Integrity — 잔여 종료 (M3)

- **Plan**: `.claude/plans/gate-guard-integrity-m3.plan.md`
- **PRD**: `.claude/prds/gate-guard-integrity.prd.md` (Milestone 3)
- **Branch**: `feat/gate-guard-integrity-m3` (base `origin/main` @ `1.25.1`)
- **Version**: `1.25.1 → 1.25.2` (단일 milestone ship = patch)
- **Implement gate**: `mccp-implement-codex/gate-guard-integrity-m3.json` · `codex_verdict='skipped'` (`MCCP_CODEX_DISABLED=1`)
- **게이트 기록**: `.claude/notes/gate-guard-integrity-m3-implement-gate.md` (plan 본문이 **아님** — 아래 D5)

## Summary

M1·M2 ship 이후 저장소에 남은 이 PRD의 잔여물을 착수 시점에 재확인하고 닫았다. plan이 열거한 15행 중 **2행은 이미 해소돼 제거**했고, 나머지 13행을 처리했다. 코드 결함 4건(C1·C2·C3·C6)과 진단 계측 1건(C4), 문서 드리프트 4건(B1~B4), 증거 커밋 1건(A1)이 착지했다.

**닫지 않은 것을 먼저 적는다.** M3은 **OQ5의 근본 원인을 주장하지 않는다** — M2가 유입시킨 비결정 2건(각 ≈10%/run)의 메커니즘은 여전히 미규명이고, M3이 만든 것은 원인 지목이 아니라 관측 수단(C4)뿐이다. 그리고 C6은 `validate-cmd.js`의 **조건부 staleness는 닫지 않았다** — `--plan` 인자가 아예 없을 때 검사가 무음으로 skip되는 구조는 그대로이며, M3이 없앤 것은 "치환에 의존하는 callsite"까지다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 21 | 18 changed + 1 new note (plan 목록 대비 −3: A2 철회로 `fix-task*` 2건 제외, B5 해소로 `CLAUDE.md` §3.7 편집 제외) |
| 잔여 행 | 15 | 13 유효 · 2 제거 |
| Base | `origin/main`과 `1 0` | **`56 0`** — 브랜치는 0 ahead(완전 머지)이나 main이 56 커밋 전진 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | 잔여물 게이트 — 15행 재확인 | Complete | 13 유효 · **2행 제거**(A2·B5) |
| 1 | A1 증거 커밋 | Complete | 커밋 `chore(evidence): persist completion-ledger entry…`. **A2는 철회**(D3) |
| 2 | C1 fixture 이전 | Complete | 동시 3개 실행 9/9×3, 트리 오염 0 |
| 3 | C2 아카이브 위임 | Complete | `PRPs/plans/completed` 0건 · `[G2-OK]` |
| 4 | C6 validate callsite | Complete | callsite 3 · non-variable 0 · A/B 비공허 확인 |
| 5 | C3 parsePlanFiles | Complete | A/B 비공허 · 격리 15/15 |
| 6 | C4 per-run 이름 | Complete | CLI 실출력에 `failing` 존재 · 판정 불변 단언 |
| 7 | B1~B4 문서 드리프트 | Complete | **B5는 이미 해소돼 제거** |
| 8 | C5 · backlog 위생 | Complete | 98 → 102행, 소실 0 |
| 9 | version bump + 회귀 | Complete | `1.25.2`, 리터럴 3곳 + i18n test green |
| 10 | A3·A4 worktree/아카이브 | **미실행 (설계상 post-merge)** | 아래 §Next Steps |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (lint) | Pass | `validate-callsite-lint` 6/6 · `instruction-contract` C1~C4 pass |
| Unit Tests | Pass | 신규/변경 스위트 전건 green (아래 표) |
| Build | N/A | 순수 Node 저장소 — 빌드 단계 없음 |
| Integration | N/A | 서버 없음 |
| Edge Cases | Pass | A/B 비공허성 2쌍 · 동시 실행 · 격리 15회 |

### 블록별 실측

| 블록 | 결과 |
|---|---|
| `[T0]` | `scan.js` → `archivable:false` (`in-progress=1`) · `evidence-audit` → `state=incomplete hash_bound=16 comparable=16 unverifiable=19` |
| `[T1]` | 커밋 전후 모두 `state ≠ inconsistent` ∧ `hash_bound === comparable`. `unverifiable`은 **불변**(아래 D4) |
| `[C1]` | msw-events 9/9 · toggle-snapshot 16/16 · 동시 3개 각 9/9 · `check-ignore` IGNORED · `git status` 오염 0 |
| `[C2]` | `PRPs/plans/completed` **0** · `archive-complete` **7** · 부재 경로 → `stale` 2건 |
| `[G2]` | 변조 사본 → `plan file hash differs from receipt` **[G2-OK]** · 원본 대조군 `ok:true` (오탐 없음) |
| `[C6]` | validate callsite **3** · non-variable `--plan` **0** · `--plan "$` **3** · lint 6/6 |
| `[C6]` A/B | 수정 전 `pr.md`에서 **rule 1은 통과, rule 2만 `pr.md:879`에서 실패** — C6이 통과한 공백의 직접 재현 |
| `[C3]` | 계약 이름 2건 grep 확인 · dedupe 37/37 · A/B에서 신규 2건 모두 red · **격리 15/15** |
| `[C4]` | suite-determinism 11/11 · CLI 실출력 `per_run[].failing` 존재 · `stable/always/sometimes` 판정 불변 단언 |
| `[B]` | PRD 미해결 `- [ ]` **2건**(OQ5·OQ6) · env 2종 등재 **2** · CHANGELOG 1.23.x 대역 내림차순 복원 |
| `[V]` | i18n-surface 10/10 (리터럴 3곳 일치 자동 검증) · 전수 관측 결과는 §전수 실행 |

## Deviations from Plan

### D1 — 착수 base를 `origin/main`으로 재정합하고 새 브랜치를 만들었다

plan은 `git rev-list --left-right --count origin/main...HEAD` = `1 0`(2026-08-14~15 실측)을 전제한다. 착수 시점 재실측은 **`56 0`** 이었다 — 브랜치는 여전히 0 ahead라 고유 커밋이 없고, main이 56 커밋 전진했다. 56 커밋 stale base 위에서 만든 diff는 그 56 커밋을 되돌리는 것으로 읽히므로, `feat/gate-guard-integrity-m3`를 `origin/main`에서 새로 만들고 M3 산출물(PRD의 M3 행 · plan · reviews · ledger 엔트리)을 이월했다. 0-ahead이므로 fast-forward 등가이고 §3.5.1이 경고하는 양방향 divergence는 성립하지 않는다. 이전 브랜치 `docs/gate-guard-integrity-m2-completion`은 손실 없이 남는다.

### D2 — version 목표를 `1.23.12`에서 `1.25.2`로 상향했다

plan Task 9는 `1.23.11 → 1.23.12`를 지정하나 `origin/main`의 `plugin.json`은 이미 `1.25.1`이다. plan이 규정한 **forward-only 상향**(§3.7)의 직접 적용이며 `1.23.12`는 발행된 번호 아래라 선택지가 아니다. 병렬 worktree 확인: `santa-loop-materialize`·`session-process-reclaim`이 각각 `1.26.0`(minor)을 선점했으나 M3은 patch 축이라 충돌하지 않는다.

> **부수 관측(M3 표적 아님)**: 그 두 worktree가 **서로** `1.26.0`을 중복 주장한다 — §3.7이 문서화한 병렬 충돌 축의 7번째 사례로 보이나, 내 브랜치와 무관하므로 고치지 않고 기록만 한다.

### D3 — A2(Stop-loop 상태 파일 커밋)를 철회했다

main의 `fix-task-applied.md`가 `setup-gitignore-m1`(2026-08-14)로 워킹트리 로컬본(`multi-session-work-loop-m5`, 2026-08-13)보다 **최신**이고, `fix-task.md`는 main에서 이미 삭제됐다. 로컬 dirty를 커밋하면 main의 최신 레코드를 옛 레코드로 되돌리는 회귀다. Task 0의 "이미 해소된 행은 제거" 규칙에 해당하므로 표에서 제거했다. 폐기 전 사본을 scratchpad에 백업했다.

### D4 — Task 1의 세 번째 검증 기준이 반증됐다

plan Task 1은 `unverifiable`이 착수 대비 **1 감소**할 것을 요구한다. 실측은 커밋 전후 모두 **19로 불변**이었다. 원인은 `evidence-audit`이 git 인덱스가 아니라 **파일시스템**을 읽기 때문이다 — untracked 상태에서도 그 ledger 엔트리는 이미 계수되고 있었다. 나머지 두 기준(`state ≠ inconsistent` ∧ `hash_bound === comparable` = 16===16)은 커밋 전후 모두 성립한다.

이 커밋의 실효는 감사 수치가 아니라 **§3.12 증거 내구성**이다 — worktree 삭제 후에도 ledger↔receipt 대조가 성립한다. 기준 자체가 측정 대상을 잘못 지목했고, 그 사실을 완화 없이 적는다.

### D5 — 게이트 기록을 plan 본문이 아니라 노트에 뒀다

`prp-implement.md` Phase 2.5.4는 `## Codex Implementation Review`를 **plan 본문에 주입**하라고 지시한다. 실행하면 plan hash가 바뀌어 상위 `mccp-plan-codex` receipt가 **즉시 stale**이 된다(실측: `e65be5b8… → 6a8af227…`, `validate` `ok:true → ok:false`). 그 stale은 PR 시점까지 남는다 — M1 receipt 쌍(`1bc24ac…` vs `98429b0…`)이 같은 불일치를 갖고 있고 `validate --command mccp:pr --decision gate-guard-integrity`가 **지금도** 그것을 낸다.

이 PRD가 복원한 가드를 명령 본문이 스스로 무력화하는 형태이므로, plan hash를 보존하는 경로를 택했다. **신규 발견이 아니다** — backlog `2026-08-09 | MEDIUM | multi-session-work-loop-m4.plan.md` 행이 같은 것을 같은 근거로 이미 적어 뒀고 "매 사이클 반복되는 수동 우회"라고 부른다. 채택한 것은 그 행이 나열한 후보 중 **(b) 주입 대상을 `.claude/notes/<topic>.md`로 이전**이며, 2.5.6 Step A가 `<plan or notes path>`를 허용하므로 명령 본문 안이다. **결함은 닫히지 않았다** — 2.5.4 자체 수정은 M3의 Files to Change 밖이고, (a)/(b)/(c) 중 무엇이 옳은지는 설계 판단이라 M3이 내리지 않는다.

### D6 — `[C6]` Validation의 `PRPs/plans/completed` 0건 요구가 서술을 제약했다

C2 수정의 근거를 쓰면서 "이전에는 `.claude/PRPs/plans/completed`로 옮겼다"는 **역사적 인용**을 넣었더니 `grep -c` 가 1이 됐다. Acceptance가 0을 요구하므로 리터럴을 피해 같은 사실을 서술하도록 바꿨다(`completed/` 디렉토리 + `.claude/PRPs/plans/` 를 분리 표기). 결함은 아니고 기준과 서술의 충돌이며, 기준 쪽을 존중했다.

### D7 — backlog의 `-` 0건 기준을 실제 속성 측정으로 대체했다

plan Task 8은 (a) "행을 지우지 않고 해소 표기를 **덧붙인다**"와 (b) "`git diff`에 `-` 시작 줄 **0건**"을 함께 요구한다. 이 저장소의 확립된 관례는 **행 내부 마커**(`2026-08-13 | ~~HIGH~~ **RESOLVED (…)** | …`)이고, 행 내부 편집은 정의상 diff에 `-`를 남기므로 두 요구는 동시에 만족될 수 없다.

관례(감사 이력 보존)를 따르고, 측정은 **실제로 의미 있는 속성**으로 바꿨다 — 기존 행이 하나도 소실되지 않았는지를 날짜+대상 키로 대조했다: **98행 → 102행, 소실 0**. `-` 0건은 "행이 삭제되지 않았다"의 프록시였고, 그 프록시가 관례와 충돌할 때는 원 속성을 직접 재는 것이 맞다.

### D8 — CHANGELOG 단조성은 M3 표적 범위에서만 달성됐다

B2의 표적(`1.23.9`가 `1.23.5` 아래)은 닫혔고 1.23.x 대역은 정상 내림차순이다. 그러나 파일 전체를 훑으면 `origin/main` 기준 **역전 2건 + 중복 1건**이 남는다(`Unreleased → 1.9.0`, `1.4.0 → 1.4.1`, `1.9.0` 중복 — 전부 2026-06대 이력). Acceptance의 "CHANGELOG 헤딩 내림차순 단조"는 **파일 전체로는 미달**이며 그 사실을 그대로 적는다. 고치지 않은 이유: 전부 main 선재이고 plan의 Files to Change가 CHANGELOG를 "B2 재배치 + 신규 항목"으로만 올렸으며, 특히 `1.9.0` 중복은 단순 이동으로 해소 불가(어느 블록이 실제 1.9.0인지는 당시 이력을 아는 사람의 판단)다. backlog로 이관했다.

## Issues Encountered

- **전수 1회차에서 fail 1 — 원인은 내 변경이었고, 저장소 자신의 가드가 잡았다.** C1의 안전망으로 추가한 `.gitignore` 항목 `plugins/mccp/scripts/.test-*/`가 `gitignore-provision.test.js`의 `drift lint: every repo entry is classified as canonical or REPO_ONLY`에 걸렸다. main의 setup-gitignore M1(v1.25.0)이 **모든 `.gitignore` 항목은 canonical(타 저장소로 provision되는 정본) 또는 `REPO_ONLY`(이 저장소만의 것) 중 하나로 분류돼야 한다**는 lint를 세워 뒀고, 새 항목이 미분류였다. 이 항목은 이 저장소의 `plugins/mccp/scripts/` 하위 test fixture 경로라 타 저장소에는 존재하지 않으므로 `gitignore-provision.js`의 `REPO_ONLY`에 사유와 함께 등재해 해소했다. **56 커밋 stale base에서 작업했다면 이 lint 자체가 없어 조용히 통과했을 것**이라는 점에서 D1(base 재정합)의 값을 보여주는 사례다.
- **`b2-coverage-gate`의 사전 존재 red 2건이 재현되지 않았다.** 이전 세션 STATE.md는 `plan-codex-runner.js` 관련 red 2건을 미해결로 기록했으나, `origin/main`(1.25.1) 기반에서 `staticLint(process.cwd())` → `ok:true, violations:0`, `lib/tests/b2-coverage-gate.test.js` **23/23 pass**다. main에서 닫힌 것으로 보이며, 그 실측이 C5 해소 표기의 근거다.
- **`b2-coverage-gate.staticLint`의 시그니처**가 옵션 객체가 아니라 문자열 repoRoot를 받는다(첫 호출이 `ERR_INVALID_ARG_TYPE`로 실패). 진단 중 발견했을 뿐 변경 대상은 아니다.

## Files Changed

| File | Action | 축 |
|---|---|---|
| `.claude/state/completion-ledger/gate-guard-integrity-m2__1559548cadb7.json` | CREATED (committed) | A1 |
| `plugins/mccp/commands/pr.md` | UPDATED | C6 |
| `plugins/mccp/scripts/lint/tests/validate-callsite-lint.test.js` | UPDATED | C6 회귀 (rule 2) |
| `plugins/mccp/commands/prp-implement.md` | UPDATED | C2 |
| `CLAUDE.md` | UPDATED | C2 (§3.11 소유권) |
| `plugins/mccp/scripts/receipt/dedupe.js` | UPDATED | C3 |
| `plugins/mccp/scripts/receipt/tests/dedupe.test.js` | UPDATED | C3 신규 2케이스 |
| `plugins/mccp/scripts/lib/suite-determinism.js` | UPDATED | C4 (`toPerRun` 분리) |
| `plugins/mccp/scripts/lib/tests/suite-determinism.test.js` | UPDATED | C4 신규 4케이스 |
| `plugins/mccp/scripts/lib/tests/msw-events.test.js` | UPDATED | C1 |
| `plugins/mccp/scripts/lib/tests/toggle-snapshot.test.js` | UPDATED | C1 |
| `.gitignore` | UPDATED | C1 안전망 |
| `plugins/mccp/scripts/lib/gitignore-provision.js` | UPDATED | C1 안전망의 `REPO_ONLY` 분류 (drift lint 요구 — 계획 밖, §Issues 참조) |
| `.claude/prds/gate-guard-integrity.prd.md` | UPDATED | M3 행 · B1 · B4 |
| `docs/ENVIRONMENT.md` | UPDATED | B3 |
| `CHANGELOG.md` | UPDATED | B2 + 1.25.2 항목 |
| `plugins/mccp/.claude-plugin/plugin.json` · `renderer/html.js` · `renderer/markdown.js` | UPDATED | §3.7 리터럴 3곳 |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | C5 · 흡수 표기 · 신규 4행 |
| `.claude/notes/gate-guard-integrity-m3-implement-gate.md` | CREATED | D5 게이트 기록 |

> `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`는 **의도적으로 편집하지 않았다** — 기대 버전을 `plugin.json`에서 파생하므로 고칠 리터럴이 없고, 그것이 B5의 내용이다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `receipt/tests/dedupe.test.js` | +2 | 프로즈줄 내성(긍정) · 표 부재 fail-closed(부정). 이름은 plan이 계약으로 고정 |
| `lib/tests/suite-determinism.test.js` | +4 | per-run 이름 보존 · 부재 시 `[]` · 복사 격리 · **판정 불변** |
| `lint/tests/validate-callsite-lint.test.js` | +2 | `pr.md` 한정 `--plan` 값 규칙 · placeholder 거부(비공허) |

## 전수 실행 (관측 — 판정 기준 아님)

전수 결과는 **관측**이며 판정 기준이 아니다. OQ5의 비결정 2건이 각 ≈10%/run이라 1회 전수의 red 하나로는 "내 변경"과 "flake 발화"를 가를 수 없다. 판정은 `[C3]`의 격리 15회 대조(15/15)가 맡고, 전수에 요구하는 것은 **알려진 비결정 2건 밖의 신규 red 0** 하나뿐이다.

| 회차 | tests | pass | fail | skipped | 비고 |
|---|---|---|---|---|---|
| 1 | 4322 | 4309 | **1** | 12 | `drift lint: every repo entry is classified as canonical or REPO_ONLY` — **내 변경 귀속**(§Issues). flake 아님 |
| 2 | 4322 | 4310 | **0** | 12 | `REPO_ONLY` 등재 후 |

요구 조건 충족: 알려진 비결정 2건(`parsePlanFiles fails closed when table separator is missing` · `scanWorktrees: truncation retains the self worktree`) **밖의 신규 red 0**. 1회차의 유일한 red는 flake가 아니라 결정적 실패였고 원인이 내 변경으로 정확히 귀속돼 닫혔다 — 즉 이 관측에서 flake 귀속 모호성은 발생하지 않았다.

두 회차 모두 그 2건은 **발화하지 않았다**. 이는 flake가 사라졌다는 증거가 아니다 — p≈0.10에서 2회 관측의 미포착 확률은 각 약 81%다.

## 주장하지 않는 것

- **OQ5의 근본 원인을 주장하지 않는다.** M2가 유입시킨 비결정 2건의 메커니즘은 미규명이며, 재현 시도 3종은 전부 실패했다. M3이 만든 것은 관측 수단(C4 — per-run 실패 이름 보존)이고, UI5가 M3의 범위를 계측 확보까지로 제한했다.
- **조건부 staleness는 닫지 않았다.** `validate-cmd.js`가 staleness 전체를 `if (opts.planPath)` 안에 두므로 호출자가 `--plan` 줄을 통째로 빠뜨리면 error도 warning도 없이 skip된다. C6이 없앤 것은 "치환에 의존하는 callsite"까지이고, 인자 필수화는 다른 callsite의 의도된 선택적 사용을 깨뜨리므로 범위 밖으로 뒀다(backlog 이관).
- **cross-model 확증을 획득하지 않았다.** plan·implement 두 게이트 모두 `codex_verdict='skipped'`다(`MCCP_CODEX_DISABLED=1`은 사용자 전역 설정). M1·M2와 동일한 공백을 승계하며 모델 다양성을 얻었다고 주장하지 않는다 — 다만 plan 단계에서 L2 반증 패널 4인이 실발화해 C6·B5를 찾았고, 그것은 컨텍스트 격리이지 모델 다양성이 아니다.
- **Task 10을 강제할 수단이 없다.** 머지 후 사람이 worktree 정리와 아카이브를 실행하도록 **강제하는 게이트는 없다.** 있는 척하지 않는다. 완화는 탐지 3중화(PRD M3 행이 `complete`가 되는 순간 `scan.js`가 `archivable:true`를 내는 상시 오라클 · backlog 1행 · 아래 미체크 항목)이고, 미실행의 결과가 데이터 손실이 아니라 **아카이브 지연**이라는 비대칭이 이 순서의 근거다.
- **M2 유입 flake가 사라졌다고 주장하지 않는다.** C3이 건드린 함수의 테스트가 그 flake 당사자 중 하나이나, 격리 15/15는 격리에서의 결정성만 보인다(착수 전 baseline도 15/15였다).

## 커밋 전 로컬 리뷰 흡수 (2026-08-16)

`/mccp:code-review` Local Review Mode를 커밋 전에 돌려 **HIGH 1 · MEDIUM 3 · LOW 4를 전건 흡수**했다(§3.14의 HIGH-이상 임계를 넘겨 전건 수용한 것은 사용자 지시). 세 건은 M3 자신의 수정이 새로 연 축이라 여기 기록한다.

| # | 심각도 | 축 | 무엇이 틀렸나 | A/B 증거 |
|---|---|---|---|---|
| 1 | HIGH | `prp-implement.md` C2 대체 지시 | `node plugins/mccp/scripts/…`가 repo-relative — 이 본문은 사용자 저장소에서 돌므로 설치된 전 사용자에게 `Cannot find module`. 같은 파일 나머지 24건은 전부 `${CLAUDE_PLUGIN_ROOT}` | 관례 대조 24 vs 1 |
| 2 | MEDIUM | C3 fence | 섹션 안 ``` fence의 **예시 표**를 진짜 표로 채택. glob 예시면 실제 diff를 삼켜 `skip_safe=true` → dual-review 우회 | 수정 전 `files=['docs/**']`, 후 `['src/real.ts']` |
| 3 | MEDIUM | C6 슬러그 상속 | 게이팅 블록이 `DECISION_SLUG`를 상속 — fence마다 별도 셸이면 빈 값 → `.claude/plans/.plan.md` → stale → **정상 ship 차단**. C6이 이 블록에 staleness를 처음 도달시켰으므로 의존 파생도 도달해야 한다 | HEAD 3블록 중 **2개 상속**, 수정 후 0 |
| 4 | MEDIUM | `PR_PLAN_PATH` | "Phase 2 DISCOVER가 설정한다"고 적혀 있으나 plugin 전체 **할당 0건** — 실제로는 운영자 export용 선택적 override | grep 0 hits |
| 5 | MEDIUM | 라벨 오기 | 신규 주석 3곳이 Phase 1.6을 "2.5.7 precheck"으로 지칭. 2.5.7은 리터럴 placeholder를 가진 곳이라 반례를 가리킨다 | 섹션 헤더 `:192` vs `:791` |
| 6~9 | LOW | fixture 회수 · `toPerRun` 원소 deref · rule 2 한계 미기재 · Artifacts 경로 하드코딩 | — | — |

같은 축의 회귀 가드를 함께 넣었다: `dedupe.test.js` fence 3케이스(사전 A/B 3/3 red) · `suite-determinism.test.js` 원소 구멍 1케이스 · `validate-callsite-lint` **rule 3**(게이팅 블록은 슬러그를 자체 파생 — 주석 할당 불인정, 합성 회귀 동반).

**이 흡수가 주장하지 않는 것**: 2번의 우회 경로는 *구조적으로* 닫혔을 뿐 실제 plan에서 발생한 적이 있다는 증거는 없다. 3번은 실측 재현이 아니라 **정적 분석 + 실패 시 결과**로 판정했다 — 2.5.9가 v1.23.5부터 같은 상속 구조로 ship돼 왔다는 사실이 반대 방향 증거이며, 그래서 HIGH가 아니라 MEDIUM이다.

## Next Steps

- [x] `/mccp:code-review` (Local Review Mode, 커밋 전) — 위 절
- [ ] `/mccp:pr`
- [ ] **(post-merge, 강제 수단 없음)** `git worktree remove .worktrees/gate-guard-integrity` + `git worktree prune` — §3.8
- [ ] **(post-merge, 강제 수단 없음)** PRD M3 행을 `complete`로 전환 → `scan.js`가 `archivable:true`를 내는지 확인 → `/mccp:archive-complete`로 PRD 1 + plan 3을 `archived/`로 이동
- [ ] backlog 신규 4행의 후속 판단(OQ5 관측 · 조건부 staleness · CHANGELOG 선재 붕괴 · Task 10)
