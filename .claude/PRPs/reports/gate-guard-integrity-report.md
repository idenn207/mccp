# Implementation Report: Gate Guard Integrity — 가드 복원 (M1)

**Plan**: `.claude/plans/gate-guard-integrity.plan.md`
**Source PRD**: `.claude/prds/gate-guard-integrity.prd.md` (Milestone 1)
**Branch**: `fix/gate-guard-integrity`
**Date**: 2026-08-09

## Summary

세 가드가 각각 다른 파일·다른 원인으로 무력화돼 있었고, 셋 다 "fail-closed여야 할 자리가 fail-open"이라는 같은 형태였다. 세 가드를 **부정 케이스에서 실제로 발화하도록** 복원했다. 어떤 테스트도 skip/삭제/완화하지 않았고, 신규·수정 테스트가 **수정 전 코드에서 실제로 red**임을 전부 A/B로 확인했다(비공허성).

가장 중요한 발견은 세 가드 모두 **테스트가 green이었다는 사실이 검사가 일어났다는 증거가 아니었다**는 것이다 — G1은 fixture가 결함 모듈을 복사해 넣어 우회했고, G2는 lint가 플래그 존재만 봐서 가드가 완전히 죽은 채로도 통과했으며, G3은 결함을 정답으로 고정한 단언을 갖고 있었다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 설계 판정은 plan이 이미 끝냈고 구현은 국소적 |
| 전수 fail | 8 → 2 | **7 → 1** (baseline이 8이 아니라 7이었음, 아래 참조) |
| pass 비감소 | 감소 0 | **3444 → 3470 (+26)** |
| Files Changed | 13 | 16 (+3: renderer footer 2 + i18n test 1 — §3.7 version sync) |

**plan의 baseline 수치 정정**: plan은 "fail 8"을 기준으로 삼았으나 이 worktree의 실측 baseline은 **7**이었다(G1 3 + G2 1 + G3 2 + flaky 1). 목표치 "잔여 2"도 실제로는 **1**이다 — 잔여는 실행마다 흔들리는 파일이라 회차에 따라 1~2로 변한다(PRD가 Milestone 2로 배정한 바로 그 성질). 지표를 미달이 아니라 **초과 달성**으로 읽되, 분모가 plan 기재와 달랐다는 사실을 남긴다.

## Task 0 — 3-sweep 소비처 열거 (gate 판정: **PASS**)

plan이 요구한 3축 sweep(스크립트 · 명령 본문 · **테스트**)을 전부 수행했다. 초안의 `grep -v tests/`가 R1에서 구조적 맹점으로 지목된 지점이므로 테스트를 포함한 것이 핵심이다.

| 소비처/생산자 | 성격 | 실측 결과 |
|---|---|---|
| `lib/pr-ship-gate.js:55-60` | **판정 키** (`SKIP_PROOF_META_KEYS`) | 수정 A의 표적. **`codex_disabled`를 판정 키로 읽는 유일한 곳** |
| `lib/pr-phase-helpers/codex-runner.js:243-245` | 생산자 (env=1 → `outcome='disabled'`) | 무변경. 수정 C의 입력 — 실존 확인 |
| `lib/pr-phase-helpers/finalize-receipt.js:103-108` | 생산자 — `'disabled'` 분기 **부재** | 수정 C의 표적 |
| `receipt/write.js:215-220` | env가 명시 reason을 덮음 | 수정 B의 표적 |
| `receipt/write.js:236` | env → `codex_disabled` 주석 | **무변경** |
| `receipt/schema.js:365-402` | 타입 검증 + 3-way mutex(`_at_pr` 변종만) + **`disabled_at_pr` → canonical reason 강제** | 무변경. 아래 "구현 시점 발견" 참조 |
| `receipt/tests/pr-codex-dedupe.test.js:96-119` | **계약 테스트** — 두 축 구분 단언 | **무변경(diff 0)**. 이 테스트가 옳다 |
| `derive/sources/receipts.js:63-66` | passthrough (`pick`) | 무변경. `renderer/sections/`의 `codex_*` 소비 **0건** 재확인 |
| `lib/snapshot/index.js:136` | passthrough | 무변경 |
| `lib/dep-check.js:75` · `lib/codex-bridge.js:153` | env 직접 조회 / 문자열 상수 | 영향 없음 |
| `commands/{plan,pr,prp-implement,setup}.md` | 문서 서술 | pr.md만 수정(G2), 나머지 무변경 |

**Gate 판정**: `codex_disabled`(ambient)를 **완료·승인 판정 키**로 읽는 소비처는 `pr-ship-gate.js` **하나뿐**이다. plan의 사전 조사 표가 정확했다 → 수정 A 진행 승인.

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | 소비처 3-sweep | 완료 | gate PASS. 표는 위 참조 |
| 1 | G1 무방비 require 4곳 방어화 | 완료 | 2곳이 아니라 4곳 — plan의 정정이 옳았음 |
| 2 | G1 부정 케이스 정직화 | 완료 | fixture 우회 복사 제거 + **positive control** 추가 |
| 3 | G2 validate callsite 2곳 | 완료 | 효력 비대칭대로 다르게 처리 + lint와 **별개**의 A/B 재현 |
| 4 | G3 수정 A — proof 집합 정화 | 완료 | Task 5와 단일 커밋 |
| 4b | G3 수정 B — reason precedence | 완료 | 독립 착지 가능 |
| 5 | G3 수정 C — 명시 증거 주장 | 완료 | Task 4와 단일 커밋 |
| 6 | G3 표준 설치 부정 케이스 | 완료 | env를 **명시적으로 켠 채** 단언 |
| 7 | 회귀 대조 + 버전·문서 | 완료 | 버전은 forward-only로 **1.23.5**(아래 참조) |

## 비공허성 검증 (신규 테스트가 실제로 red였는가)

가장 중요한 증거. plan이 "green을 만드는 것이 목적이 아니라 신호를 복원하는 것"이라 못박았으므로, 각 가드마다 **수정 전 코드 + 수정 후 테스트**를 실행했다.

| 가드 | 수정 전 코드 | 수정 후 코드 |
|---|---|---|
| G1 (`g1-patch.test.js`) | **7 fail** / 1 pass | 8 pass |
| G2 (A/B 재현) | `--plan` 없음 → `ok=true`, `stale=0` (가드 완전 사망) | `--plan` 있음 → `ok=false`, `stale=2` |
| G3 (`finalize-receipt.test.js`) | **7 fail** / 24 pass | 31 pass |
| G3 (`pr-ship-gate.test.js`) | **1 fail** / 22 pass | 23 pass |
| G3 (`codex-disabled-precedence.test.js`) | **2 fail** / 4 pass | 6 pass |

G1의 positive control은 **수정 전후 모두 pass**한다 — control이 해야 할 정확한 동작이다(control이 red면 부재 케이스가 우연한 다른 실패로 통과했다는 뜻).

**단일 커밋 불변식도 기계적으로 검증했다**: 수정 A만 적용하고 수정 C를 되돌리면 `outcome='disabled'` 관련 **3건이 red**가 된다. plan Risk #1("Task 4가 Task 5 없이 착지해 운영자 ship 경로가 조용히 끊긴다")이 이제 회귀 테스트로 잡힌다.

## 구현 시점 발견 (plan이 예상하지 못한 것)

### 1. 수정 C는 flag 1개가 아니라 2개를 forward해야 한다

plan Task 5는 `--codex-disabled-at-pr`만 지정했다. 그러나 `schema.js:397-402`가 `codex_disabled_at_pr=true → codex_skip_reason === 'codex_disabled'`를 **강제**한다. finalize가 reason을 forward하지 않으면 write 시점의 ambient env에 의존하게 되고, `codex-result.json`이 사실을 담고 있는데 write 프로세스에 env가 없는 경우 **schema invalid로 write 자체가 실패**한다. `--codex-skip-reason codex_disabled`를 함께 forward한다(기존 `'skipped'` 분기의 2-flag forward와 동형). 회귀 테스트 `outcome=disabled ships even when the WRITE process has no env`가 이 경로를 고정한다.

### 2. 수정 B의 "명시값" 판정은 `|| null`이면 안 된다

`--codex-skip-reason`을 값 없이 주면 boolean `true`로 파싱된다. 관용구 `args[...] || null`을 그대로 쓰면 `true`가 통과해 schema의 `string|null` 타입 검사에 걸린다. `typeof === 'string' && length > 0`으로 좁혔다. 회귀 테스트 1건 추가.

### 3. G2 복원이 이 command의 Phase 5(plan 아카이브)와 충돌한다 — **아카이브 미수행**

`/mccp:prp-implement` Phase 5는 plan을 `.claude/PRPs/plans/completed/`로 `mv`하라고 지시한다. 그런데 **가드 2를 복원한 결과** `/mccp:pr` 2.5.9가 이제 `--plan <plan-path>`를 넘기고, 그 경로가 읽히지 않으면 validator가 `stale`("cannot read plan to re-hash")을 내며 aggregate `ok=false` → **PR이 차단된다**. 실측으로 확인한 동작이다(부재 경로 → `stale` 2건).

따라서 plan을 **아카이브하지 않았다**. 두 가지 독립적 근거:

- **CLAUDE.md §3.11 C2** — 완료 plan archive는 **PRD 전체 완료 시에만**. 본 PRD는 Milestone 2가 남아 있다.
- **위 충돌** — 아카이브하면 이번 cycle의 `/mccp:pr`이 자기가 방금 복원한 가드에 막힌다.

이것은 plan이 예상하지 못한 상호작용이며, command 본문 Phase 5의 아카이브 지시가 §3.11·가드 2와 정합하지 않는다는 **별도 축**이다(backlog 후보).

### 4. plugin.json 목표 버전을 병렬 브랜치가 선점 (4번째 재발)

plan은 `1.23.3 → 1.23.4`를 지정했으나, 구현 중 `origin/main`을 재확인한 결과 PR #118(codex-intent-context M1)이 이미 **1.23.4**를 사용해 머지돼 있었다. §3.7 forward-only 규칙대로 **1.23.5**로 상향했다. CHANGELOG 헤딩 중복도 회피(main의 `[1.23.4]` 유지, 신규 `[1.23.5]` 추가).

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | JS(Node 20+) 프로젝트 — 별도 lint/typecheck 스크립트 없음 (`package.json` 부재) |
| Unit Tests | **Pass** | 신규 6 + 추가 14 = 20 케이스 증가 |
| Build | N/A | 빌드 단계 없음 |
| Integration | **Pass** | `finalize-receipt.test.js`가 실제 receipt CLI를 spawn하는 e2e |
| Edge Cases | **Pass** | env 유/무 양쪽, 값 없는 flag, write 프로세스 env 부재, mutex 위반 여부 |

### 전수 회귀 대조 (동일 조건)

```
BEFORE (milestone 착수 전) : # tests 3457  # pass 3444  # fail 7
AFTER  (M1만, main 머지 전) : # tests 3477  # pass 3470  # fail 1
FINAL  (santa 3R + main 머지): # tests 3584  # pass 3575  # fail 3
```

- **본 milestone이 표적한 6건은 전부 해소** (G1 3 + G2 1 + G3 2).
- **pass 3444 → 3575 (+131)** — 비감소 조건 충족(증가분에는 main 머지가 가져온 테스트가 포함).
- FINAL의 잔여 3건 내역:

| 잔여 | 원인 | 소관 |
|---|---|---|
| `b2-coverage-gate` 2건 | **main 승계** — `origin/main` clean checkout에서 동일 violation 1건(`plan-codex-runner.js:248`) 실측 확인. PR #116의 lint × PR #118의 직접 rename 충돌 | #118 (backlog 기록) |
| timing-flaky 1건 | 전수 병렬 실행에서만 실패, 단독 실행은 통과 | PRD **Milestone 2** |

**flaky는 고정 집합이 아니다** — M1 완료 시점 실행에서는 `a3-instruction-cost.test.js`(단독 5/5 pass), 최종 실행에서는 `perf-budget.test.js`(단독 1/1 pass)가 흔들렸다. PRD가 Milestone 2("신호 신뢰도")에 "실행마다 다른 파일이 흔들린다"고 적은 성질이 그대로 재현됐다. 본 milestone 범위 밖.

**plan의 합격 기준 대비**: plan은 "fail 8 → 2"를 적었으나 실측 baseline은 7이었고(G1 3 + G2 1 + G3 2 + flaky 1), 표적 6건은 전부 닫혔다. 최종 3건 중 본 milestone에 귀속되는 것은 **0건**이다.

### 가드별 독립 실행

| 명령 | 결과 |
|---|---|
| `g1-patch.test.js` | 8/8 |
| `validate-callsite-lint.test.js` | 4/4 (violations 0) |
| `finalize-receipt.test.js` (env=1) | 31/31 |
| `pr-ship-gate.test.js` (env=1) | 23/23 |
| `codex-disabled-precedence.test.js` | 6/6 |
| `pr-codex-dedupe.test.js` (**보존 대상**) | 무변경 통과 |
| env **OFF** 5개 파일 합산 | 78/78 |
| env **ON** 계약 3개 파일 합산 | 74/74 |

### Design Grounding

**N/A** — implement 게이트 시점(Phase 2.5, EXECUTE 이전)에 worktree가 clean이라 `impeccable-detect`가 `design_signal=false`를 반환했고 Phase 2.5.5c capture가 발생하지 않아 Phase 3.7은 no-op이다. 다만 이는 "디자인 표면 없음"이 아니라 **"게이트 시점에 아직 diff가 없음"**이다 — EXECUTE 후 `receipt/write.js`(= `DESIGN_SURFACE_PATHS` 원소)가 diff에 들어가므로 같은 detector가 `design_signal=true`를 냈을 것이다. plan 단계 critique이 같은 축을 R0 CONVERGED(findings 0)로 이미 닫았고 `renderer/sections/`의 `codex_*` 소비 0건을 실측했으므로 렌더 surface 영향은 구조적으로 없다.

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/hooks/receipt-prompt.js` | UPDATED | +52 / -4 |
| `plugins/mccp/scripts/hooks/receipt-skill.js` | UPDATED | +48 / -4 |
| `plugins/mccp/scripts/hooks/tests/g1-patch.test.js` | UPDATED | +172 / -4 |
| `plugins/mccp/commands/pr.md` | UPDATED | +22 / -2 |
| `plugins/mccp/scripts/lib/pr-ship-gate.js` | UPDATED | +20 / -3 |
| `plugins/mccp/scripts/receipt/write.js` | UPDATED | +21 / -3 |
| `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js` | UPDATED | +17 |
| `plugins/mccp/scripts/lib/tests/pr-phase-helpers/finalize-receipt.test.js` | UPDATED | +91 |
| `plugins/mccp/scripts/lib/tests/pr-ship-gate.test.js` | UPDATED | +22 / -3 |
| `plugins/mccp/scripts/receipt/tests/codex-disabled-precedence.test.js` | **CREATED** | +113 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | +1 / -1 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | +1 / -1 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | +1 / -1 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATED | +4 / -4 |
| `CHANGELOG.md` | UPDATED | +26 / -1 |
| `CLAUDE.md` | UPDATED | +5 / -1 |
| `.claude/plans/gate-guard-integrity.plan.md` | UPDATED | +45 (게이트 주입 섹션) |

**삭제 검증 (§3.5.1)**: `git diff --diff-filter=D --name-only origin/main...HEAD` → **0건**.

## Deviations from Plan

1. **수정 C가 flag 2개를 forward** — schema 제약(`disabled_at_pr` → canonical reason) 때문. 위 "구현 시점 발견 1".
2. **버전 1.23.4 → 1.23.5** — `origin/main`이 선점. §3.7 forward-only. 위 "발견 4".
3. **Files to Change 3개 추가** — renderer footer 2 + i18n test 1. §3.7이 요구하는 version sync surface인데 plan의 표에서 누락돼 있었다.
4. **plan 아카이브 미수행** — §3.11 C2 + 가드 2와의 충돌. 위 "발견 3".
5. **`mccp-plan-codex` receipt 재anchor** — 게이트 2.5.4가 plan에 `## Codex Implementation Review`를 주입하면 plan_hash가 바뀌어 plan receipt가 stale이 된다(구조적 성질: 주입 전 receipt는 HEAD와 정확히 일치했음을 해시 대조로 확인). verdict(`skipped`)·critique 필드를 그대로 보존해 재작성했다. `stale`은 tamper가 아니므로 regenerate가 sanctioned 복구 경로다.

## Issues Encountered

- **`sed`가 정규식 이스케이프를 훼손** — `v1\.23\.3` → `v1.23.5` 치환 시 백슬래시가 소실돼 anchor가 와일드카드로 약화됐다. 테스트는 통과했지만 정밀도 회귀이므로 `Edit`으로 정확한 리터럴 매칭을 복원했다. (경로/정규식 백슬래시는 `sed` 대신 `Edit` — 기존 교훈 재확인.)
- **plan-codex receipt staleness** — 위 Deviation 5.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `hooks/tests/g1-patch.test.js` | 3 → **8** | 모듈별 격리 부재(4 케이스) + positive control |
| `lib/tests/pr-phase-helpers/finalize-receipt.test.js` | 26 → **31** | env 명시 ON 부정 케이스, `outcome='disabled'` ship, write-프로세스 env 부재 |
| `lib/tests/pr-ship-gate.test.js` | 21 → **23** | ambient-only → no-ship(반전), ambient+명시 동시 |
| `receipt/tests/codex-disabled-precedence.test.js` | **NEW 6** | precedence 반전 + fallback 보존 + boolean flag 방어 |

## 운영자 위임 판단 4건 (2026-08-09, 구현 후)

사용자가 아래 4건을 위임했다. 각 판정과 근거.

### #4 auto-chain cost abort — **실제 폭주 아님, 커밋 진행**

`auto-chain check --next-step commit`이 exit 13 (`cost-catastrophic: cost_usd=611.9215 >= 500`). 그러나 같은 cost-state의 `threshold_tier`는 **`notice`**이고 `hard_ceiling_reached`는 **`false`**다. 사용자가 `MCCP_HANDOFF_THRESHOLDS_USD="500,800,1000"`으로 기본값의 10배를 설정해 뒀기 때문인데, `MCCP_ORCHESTRATION_CATASTROPHIC_USD`는 튜닝되지 않은 기본값 **500**에 머물러 있다. 즉 **catastrophic 상한이 운영자 본인의 최하 경고 밴드(500)보다 낮은 역전 상태**다. 폭주 신호가 아니라 두 축의 스케일 불일치이므로 커밋을 진행했다. 권고: `MCCP_ORCHESTRATION_CATASTROPHIC_USD`를 handoff 임계에 맞춰 상향(예: 5000).

### #3 origin/main reconcile — **수행 완료 (커밋 `fafa6e0`)**

26커밋 머지. 충돌 7건을 `--ours` 일괄이 아니라 **파일별**로 해소했다(§3.5.1 + STATE.md `--ours` 사고 선례).

| 충돌 | 해소 |
|---|---|
| version 6건 (plugin.json · renderer html/markdown · i18n 단언 3) | raw OURS/THEIRS 덤프로 **version-only임을 먼저 입증**한 뒤 HEAD(1.23.5) 유지. 마커만 편집해 main이 auto-merge한 다른 변경 보존 |
| CHANGELOG · backlog | **양쪽 보존**. 각자 다른 내용을 추가했고 한쪽을 버리는 것이 §3.5.1이 막으려는 손실 |
| STATE.md | state-writer API로 병합 + 양쪽 Open Questions 합집합 |

검증: 삭제 **0건**, main 신규 13파일 전부 존재, 마커 0, write.js 양쪽 변경 공존. 부수로 내 코드 주석의 `v1.23.4`를 `v1.23.5`로 정정(23곳) — #118 소유 참조는 미변경.

**머지가 표면화한 것 — main이 이미 red다.** 머지 트리에서 `b2-coverage-gate.test.js` 2건이 새로 실패했으나, `origin/main` clean checkout에서 동일 lint를 돌려 **main 단독으로도 `ok:false`, 동일 violation 1건**임을 실측했다: `plan-codex-runner.js:248`의 `fs.renameSync(receiptPath, dest)`. PR #116(MSW M3)이 "receipt 변형은 승인 writer 경유" static lint를 추가했고 PR #118이 그 직접 rename을 추가했으며 두 PR이 서로를 못 봤다. **본 milestone이 고치지 않았다** — 올바른 해소가 (a) guarded writer 경유 vs (b) lint 예외 등록 중 무엇인지는 "mis-sealed receipt 격리가 receipt 작성인가"라는 #118의 설계 판단에 달렸다. backlog 기록.

### #2 plan 아카이브 — **미수행 (실측 재현으로 확정)**

추론이 아니라 재현으로 확정했다. plan을 `completed/`로 옮긴 뒤 `/mccp:pr` 2.5.9와 동일한 validate를 실행:

```
ok=false  stale=2
   mccp-plan-codex:      cannot read plan to re-hash: ENOENT ...
   mccp-implement-codex: cannot read plan to re-hash: ENOENT ...
```

2.5.9는 aggregate `ok`로 gate하므로 **PR이 HALT된다**. command Phase 5를 문자 그대로 따르면 chain이 방금 자기가 복원한 가드에 스스로 막힌다. §3.11 C2(PRD 전체 완료 시에만)와도 어긋난다. backlog에 수정 방향(`/mccp:archive-complete` 위임)과 함께 기록.

### #1 cross-model 검토 — santa-loop 3라운드, **NICE 미달성 (cap 도달)**

Reviewer A(Opus `code-reviewer`) + Reviewer B(`codex exec -m gpt-5.4`) 병렬. **Reviewer B는 `codex exec` 직접 호출이라 `MCCP_CODEX_DISABLED=1` wrapper 정책과 무관하게 동작한다** — 게이트가 env로 막힌 상태에서 cross-model 검증을 얻는 유일한 경로.

| 라운드 | A (Opus) | B (Codex) | 결과 |
|---|---|---|---|
| R1 | PASS | **FAIL** ×2 | NAUGHTY → `7ee8867` |
| R2 | PASS | **FAIL** ×2 | NAUGHTY → `3824d6d` |
| R3 | **FAIL** ×1 | **FAIL** ×2 | cap 도달 → `6f11736` |

**정직한 착지**: 세 라운드 중 **양쪽 PASS로 끝난 라운드가 없다.** santa-loop 계약상 이것은 NICE가 아니다. 지적은 전부 흡수했지만(아래), R3 수정분은 새 리뷰어의 검증을 받지 못했다 — cap이 3이기 때문이다. 이 저장소의 이전 두 cycle과 같은 착지 형태다.

#### 흡수 내역 (5건 흡수 · 1건 반증 · 1건 이관)

| 라운드 | 포착 | 지적 | 판정 |
|---|---|---|---|
| R1 | **B만** | broken-root fixture가 `validate-cmd` 로드 실패 경로에 더 이상 도달 안 함 | **흡수** — 코어 가드 도입으로 G1 **원래 경로 커버리지가 0**이 돼 있었다. 전용 fixture로 복원 |
| R1 | **B만** | 격리 fixture가 "모든 모듈 resolve" 주장하나 `migrations` 누락 | **흡수** — 확인 중 `state` 트리도 누락 발견(B 지적보다 넓음) |
| R1 | **B만** | Phase 1.6 `--plan`이 divergent 오차단 유발 | **반증** — `planPath`는 `:213`·`:301-303`에서만 소비, divergent 블록은 receipt만 참조. 실측: 잘못된 plan → `blocking=0 stale=2` / `--plan` 없음 → `blocking=0 stale=0`. 단 주석 과잉 주장은 정정 |
| R2 | **B만** | Phase 1.6이 `set -e`에서 `CHAIN_BLOCKED` 파싱 전 셸 중단 | **흡수** — 실측 확인(기본 셸 무해, `set -e` 재현). `\|\| PRECHECK_EXIT=$?`로 무조건 성립 |
| R2 | B | free-form `mccp-plan-codex` write 경로 ↔ 문서 불일치 | **이관** — PR #118 코드(DD1 근거 주석 실재). backlog 기록, 본 milestone 미수정 |
| R3 | **A만** | 2.5.9의 `--plan <plan-path>`가 리터럴 placeholder | **흡수** — 미치환 시 인자 오류가 아니라 **bash 문법 오류**(`<`=리다이렉션). 기계적 게이트가 모델 치환에 의존하면 안 됨 → `SHIP_PLAN_PATH` self-derive |
| R3 | **B만** | 2.5.9도 `set -e` 미가드(R2가 1.6만 고침) | **흡수** — 누락이었음. 여기선 abort도 HALT라 오ship 불가하나 진단·override 경로 소실 |

**메타 관찰 — 이것이 cross-model을 유지하는 이유다.** 세 라운드 모두 최소 1건의 실질 결함이 나왔고 **매 라운드 잡은 쪽이 달랐다**(R1·R2는 B 단독, R3는 A가 placeholder를, B가 `set -e`를 각각 단독). 한 모델만 돌렸다면 어느 조합으로도 5건을 다 얻지 못한다. 이 저장소에서 비대칭 포착이 7~9회째 재현됐다.

**자기 적용 실패 1건 (기록)**: R1의 과잉 주장을 고치겠다며 `cannot load` 진단 부재 단언을 추가했는데, 두 fixture에 실제로 돌려보니 **양쪽 다 통과**했다 — 실패할 수 없는 단언, 즉 본 PRD가 제거하려는 결함 그 자체를 내가 재생산한 것이다. 제거하고 control이 관측으로 증명하는 것만 주장하도록 좁혔다. *"통과 신호의 존재가 검사가 일어났음을 의미하지 않는다"*가 리뷰 과정에서 두 번째로 재현됐다(plan R2의 `"verdict": "PASS"` 반향 사건에 이어).

**Reviewer B 제약**: R3의 B는 sandbox에서 명령 실행이 막혀 정적 검토만 수행했다(`Test honesty` PASS는 inspection-only). R1·R2는 실행 가능했다.

Reviewer A(Opus `code-reviewer`) + Reviewer B(`codex exec -m gpt-5.4`) 병렬. **Reviewer B는 `codex exec` 직접 호출이라 `MCCP_CODEX_DISABLED=1` wrapper 정책과 무관하게 동작한다** — 게이트가 env로 막힌 상태에서도 cross-model 검증을 얻는 경로. 결과는 아래 별도 섹션.

머지 후 가드 3개 재확인: 6개 파일 80/80 pass.

## 최종 상태 · 남은 판단

커밋 10개, 미push. 브랜치 `fix/gate-guard-integrity`, v1.23.5.

**ship 가능 여부에 대한 정직한 진술**: 세 가드는 복원됐고 부정 케이스에서 실제로 발화함이 A/B 재현으로 입증됐다. 그러나 **santa-loop이 수렴하지 않았다**(cap 3라운드, 양쪽 PASS 라운드 0). R3에서 흡수한 3건은 새 리뷰어의 검증을 받지 못한 상태다. "3라운드 돌렸으니 검증됐다"고 쓰지 않는다 — 그 문장이 이 PRD가 제거하려는 형태의 주장이다.

운영자 판단이 필요한 항목:

1. **push / PR 생성** — 미수행. 외부로 나가는 동작이고 loop 미수렴 상태다. 진행 시 §3.12대로 **merge-commit**(squash 금지 — evidence-commit SHA 도달성).
2. **`MCCP_ORCHESTRATION_CATASTROPHIC_USD`** — 기본 500이 사용자 handoff 임계(500/800/1000)와 역전. 전역 설정이라 임의 수정하지 않았다. 상향 권장(예: 5000).
3. **main의 `b2-coverage-gate` red 2건** — #118 소관. PR 본문에 "제 회귀 아님 + 실측 근거" 명시 필요.
4. **main CHANGELOG `[1.23.4]` 헤딩 중복**(7행·94행, 본문 상이) — #118의 기존 결함. 남의 릴리스 노트라 임의 병합하지 않고 양쪽 보존했다.
5. **PRD Milestone 1 status** — 여전히 `in-progress`. 지표는 충족(표적 6건 전부 해소, 잔여 3건 중 본 milestone 귀속 0).

## Next Steps

- [ ] `/mccp:code-review` 또는 `/mccp:santa-loop` — **권장**. 아래 "미획득 항목" 참조
- [ ] `/mccp:prp-commit` — 단, **Task 4(pr-ship-gate.js) + Task 5(finalize-receipt.js)는 반드시 같은 커밋**
- [ ] `origin/main` 26커밋 reconcile (PR #118 포함) — PR **전**에 수행 권장. 접점 실측: `write.js`는 main도 변경했으나 hunk가 `codex_skip_reason` 영역과 겹치지 않고, `pr.md`는 main 변경이 :455라 본 수정(:203/:857)과 무관
- [ ] `/mccp:pr`
- [ ] PRD Milestone 1 status를 `in-progress` → `complete`로 (plan이 "이미 갱신됨"이라 했으나 실제로는 `in-progress`로 남아 있음 — 아래 참조)

### 미획득 항목 (정직 기록)

**cross-model adversarial review를 이 cycle에서도 받지 못했다.** `MCCP_CODEX_DISABLED=1`이 사용자 전역 `~/.claude/settings.json`에 있고 Codex 한도가 2026-08-13까지 소진돼, plan 게이트와 implement 게이트가 **모두** `classification=disabled`로 skip됐다. plan이 명시한 잔여 공백("재설계된 plan을 Codex가 검토한 적 없다 — 구현 단계 Implement-Codex 게이트가 이 공백을 메울 1차 기회")은 **메워지지 않았다**.

특히 단일 모델 판단으로 남은 것: OQ2의 3부 수정(A/B/C) 설계, OQ3의 callsite 비대칭 판정, 그리고 위 "구현 시점 발견" 4건. plan R1에서 5건 중 4건을 Codex만 잡은 선례가 있으므로 `/mccp:santa-loop`(Opus + `codex exec` 직접 호출 — wrapper env policy와 무관한 경로) 실행이 권장된다.

### PRD status drift

plan은 "PRD Milestone 1 행 갱신은 plan 작성 시점에 **이미 적용됨** — Task 7에서 제외"라고 적었으나, 실측상 PRD `:71`의 Status는 여전히 **`in-progress`**다. plan의 그 서술이 부정확했다. Task 7이 "재편집 금지"를 명시했으므로 이 구현에서는 손대지 않았고, 사실만 남긴다 — commit/PR 단계에서 `complete`로 갱신할지는 운영자 판단이다(성공 지표 "fail 8 → 2"는 실측 "7 → 1"로 충족).
