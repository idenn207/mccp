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
BEFORE: # tests 3457  # pass 3444  # fail 7
AFTER : # tests 3477  # pass 3470  # fail 1
```

- **fail 7 → 1** (G1 3 + G2 1 + G3 2 해소)
- **pass 3444 → 3470 (+26)** — 비감소 조건 충족
- 잔여 1건: `a3-instruction-cost.test.js` — **단독 실행 시 5/5 pass**, 전수 병렬 실행에서만 파일 단위 실패. PRD가 Milestone 2("신호 신뢰도")로 배정한 비결정적 간섭이며 본 milestone 범위 밖이다.

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
