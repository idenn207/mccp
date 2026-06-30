# Plan: 대시보드 위험 lifecycle-scope 수정 (Dashboard Truthfulness M8 — ② risk lifecycle scoping)

**Source PRD**: `.claude/prds/dashboard-truthfulness.prd.md`
**Selected Milestone**: M8 — 위험 lifecycle-scope (deferred axis · backlog F4 · m5-semantics Codex F4)
**Complexity**: Medium

## Summary

`sections/risks.js`와 `status-grid.js`의 위험 active 필터가 `!r.resolved`만 보고 출처 plan의 lifecycle을 무시해, 이미 ship된(완료) plan의 historical 위험이 live count로 집계된다. 실측: total 302개 중 active 59개로 surface되지만 그중 36개가 `complete` plan 출처(미마커)다. 각 위험에 출처 plan lifecycle(`sourceClosed`)을 parse-time에 부여(M1 ledger / M5 completion-auto-detect의 `isMilestoneClosed` 재사용)해, 완료 plan의 미마커 위험을 active에서 제외하고 `이력` 버킷으로 분리한다. resolved-first 우선순위로 기존 `완화됨` 탭(명시 해결 마커) 의미는 불변 유지하고, rail 카운트·md 위젯이 위험 섹션 active와 정합(reconcile)하도록 동일 필터를 공유한다.

## Problem (현재 동작 · 실측)

```
total risks: 302   active(!resolved): 59   resolved: 243
active 59개의 출처 plan lifecycle 분포:
  planStatuses:complete  36   ← 버그: 완료 plan인데 live로 집계
  unknown                16   ← PRD/ledger 미매칭 (fail-open 유지가 안전)
  open:in-progress        7   ← 정상 live
```

`status-grid.js:194` 주석이 이미 이 부채를 인정: *"(위험 섹션 자체의 historical-risk lifecycle scope 는 M6 backlog 이월 — Codex F4.)"* 본 plan이 그 축을 닫는다.

근본 원인 — 두 소비처가 동일하게 lifecycle을 무시:
- `sections/risks.js:23` — `allRisks.filter((r) => !r.resolved)`
- `sections/status-grid.js:196` — `allRisks.filter(r => r && !r.resolved)`

각 위험 객체는 이미 `source: p.path`(출처 plan 경로)를 parse-time에 갖고 있고(`plan-body.js:441`), `planStatuses`(basename→lifecycle, M5 completion-auto-detect override 포함)와 `isMilestoneClosed`(ledger + terminal-receipt 종료 추적)가 같은 함수 스코프에 이미 존재한다. 즉 신호는 다 있고 **연결만 안 됐다**.

## 설계 결정 — 3-버킷 (resolved-first 우선순위)

두 직교 축: (1) 명시 해결 마커 `r.resolved`, (2) 출처 plan lifecycle `r.sourceClosed`.

상호배타 3-버킷, **우선순위 resolved → sourceClosed**:

| 버킷 | 조건 | 실측 | 의미 |
|---|---|---|---|
| **미해결 (active)** | `!resolved && !sourceClosed` | 59→**23** | 진짜 live (마커 없음 + 출처 plan 미종료/미상) |
| **완화됨 (mitigated)** | `resolved` | **243** (불변) | 명시 해결 마커 (`/mccp:dashboard-audit` agent가 단 것) |
| **이력 (historical)** | `!resolved && sourceClosed` | **36** (신규) | 완료/은퇴 plan 출처 미마커 위험 = 버그 대상 |

`23 + 243 + 36 = 302` ✓

**왜 resolved-first인가**: resolved=243 중 161개가 sourceClosed이기도 하다. sourceClosed-first면 `완화됨`이 82로 줄고 `이력`이 197로 부풀어 명시-마커 의미가 흐려진다. resolved-first는 (a) 명시 해결 마커의 강한 신호를 보존하고 (b) `이력`을 정확히 "수정 대상(unmarked + shipped)"으로 한정한다. 사용자의 negative-test 프레이밍("완료 plan **unmarked** risk가 live count 부풀리지 않는")과 1:1 매칭.

**sourceClosed 판정** (보수적 — **fresh evidence만 숨김**, Codex F1 흡수):
```
sourceClosed =
     planStatuses.get(basename) ∈ {complete, dropped}            # (1) PRD lifecycle SSoT
  OR isMilestoneClosed(...).via === 'terminal-receipt'           # (2) terminal-receipt: plan_hash-fresh 내장
  OR ledgerCloseFresh({decisionId, planBasename, currentPlanHash, receipts, ledgerItems})  # (3) STRICT ledger
```
- (1) `planStatuses` complete/dropped → PRD 표 complete + M5 completion-auto-detect 승격 커버(대시보드 lifecycle SSoT).
- (2) terminal-receipt 경로는 `isMilestoneClosed` 내부에서 이미 `plan_hash === currentPlanHash` freshness-guard(decision-state.js:227) → 그대로 신뢰.
- (3) ledger 경로는 **bare `isMilestoneClosed`(decision_id OR basename, hash 무관)이 아니라 `ledgerCloseFresh`(decision_id AND basename AND `plan_file_hash === currentPlanHash`, decision-state.js:255)** 사용. `buildDecisionState`(M7)가 reopened same-slug over-claim을 막으려 쓰는 동일 strict 가드를 위험-숨김에도 적용. **위험을 숨기는 행위는 fresh 증거를 요구**한다 — Codex F1.
- **reopened/edited plan**(hash 변경) 또는 `currentPlanHash=null`(archived/unreadable)은 ledgerCloseFresh가 false → **active 유지**(under-claim 안전). 신규 미해결 위험이 stale ledger close로 사라지지 않는다.
- `unknown`(어느 신호도 없음)은 **active 유지** — 확신 없는 plan의 위험을 숨기지 않는다(under-claim 안전 default, M5 철학 계승). (단 unknown을 "진짜 live"로 over-claim하지 않음 — Codex F2, Open Questions 참조.)

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Parse-time flag 전파 | `plan-body.js:440-442` (`resolved`/`source`/`ordinal` 스탬프) | 위험 객체에 `sourceClosed` boolean을 동일 push 지점에서 추가(additive) |
| Lifecycle 종료 판정 재사용 | `plan-body.js:404-409` (M5 override가 이미 `isMilestoneClosed` 호출) | 동일 `isMilestoneClosed`·`planAwareMarkdownHash`·`receiptItems`/`ledgerItems`(이미 import/스코프 내) 재사용 |
| 정규화 seam | `resolution-classify.js:15-19` (`r.resolved = !!r.resolved`) | `r.sourceClosed = !!r.sourceClosed` 동일 패턴 추가(방어적, dedupe 후 보존) |
| 3+ 버킷 탭 | `risks.js:110-121` (`buildTabs` 미해결/완화됨) | `이력` 탭 추가(gate: `historical.length > 0`), label 카운트 neutral 뱃지 |
| rail==섹션 reconcile | `dashboard-overview.test.js:74` + `status-grid.js:191-203` | 동일 필터 공유로 자동 정합 + 명시 reconcile 테스트 |
| Errors | `index.js:19-29` `safeSection` | 모든 변경 fail-open 경로 안 — section throw 시 graceful degrade 유지 |
| Tests | `sections.test.js:254-296`, `dashboard-overview.test.js:74` | `node --test`, planBody fixture에 `sourceClosed`/`planStatuses` 주입 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` | UPDATE | 위험 push 시 `sourceClosed` 스탬프 — per-plan 캐시 헬퍼(planStatuses + isMilestoneClosed/ledger). 신규 import 0(둘 다 이미 import). |
| `plugins/mccp/scripts/lib/renderer/parsers/resolution-classify.js` | UPDATE | `r.sourceClosed = !!r.sourceClosed` 정규화 seam(resolved 미러, dedupe 후 보존 보장). |
| `plugins/mccp/scripts/lib/renderer/sections/risks.js` | UPDATE | 3-버킷 split + `이력` 탭 + md `<details>` 동등본. `activeCount`=미해결만. |
| `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` | UPDATE | `activeRisks` 필터에 `&& !r.sourceClosed` 추가 → rail 위험 셀·md 위젯 정합. |
| `plugins/mccp/scripts/lib/renderer/tests/plan-body-parser.test.js` | UPDATE | parse-level `sourceClosed` 스탬프 단위 테스트(complete/dropped/ledger/unknown). |
| `plugins/mccp/scripts/lib/renderer/tests/sections.test.js` | UPDATE | risks 3-버킷 + `이력` 탭 + **negative test**(완료 plan 미마커 위험 active 제외). |
| `plugins/mccp/scripts/lib/renderer/tests/dashboard-overview.test.js` | UPDATE | rail 위험 셀 lifecycle-aware + sourceClosed 제외. |
| `plugins/mccp/scripts/lib/renderer/tests/render-integration.test.js` | UPDATE | full-render **reconcile invariant**(rail 셀 == renderRisks activeCount == md 위젯) + verdict 불변. |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.18.11 → 1.18.12` patch bump(§3.7). |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | footer `v1.18.11 → v1.18.12`(L1017). |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | footer `v1.18.11 → v1.18.12`(L117). |
| `.claude/prds/dashboard-truthfulness.prd.md` | UPDATE | Delivery Milestones 행 #8(위험 lifecycle-scope, status in-progress, Plan 셀=본 plan) 추가 — dogfood 추적. |

## Tasks

### Task 1: parse-time `sourceClosed` 스탬프 (plan-body.js) — fresh-evidence only
- **Action**: import에 `ledgerCloseFresh` 추가(`const { isMilestoneClosed, ledgerCloseFresh } = require('./decision-state')` — `isMilestoneClosed`는 이미 import). M5 completion-override 루프(L394-410) 직후, 위험 push 루프(L412-449) 진입 전에 per-plan 캐시 헬퍼 `sourcePlanClosed(planRelPath)` 정의:
  1. `planStatuses.get(basename) ∈ {complete,dropped}` → true (해시 미계산 short-circuit).
  2. 아니면 `currentPlanHash` = `planAbsByBasename` + `planAwareMarkdownHash` lazy(실패 시 null).
  3. `isMilestoneClosed(...).via === 'terminal-receipt'` → true (내부 plan_hash-fresh guard 신뢰).
  4. `ledgerCloseFresh({decisionId, planBasename: basename, currentPlanHash, receipts: receiptItems, ledgerItems})` → true (STRICT id+basename+hash). bare `isMilestoneClosed` ledger path는 **쓰지 않음**(Codex F1).
  5. 그 외 false (reopened/hash-mismatch/null-hash/unknown → active 유지).
  `Map` 캐시로 plan당 1회. 위험 push를 `Object.assign({}, row, { source: p.path, ordinal: idx, sourceClosed: sourcePlanClosed(p.path) })`로 확장.
- **Mirror**: `buildDecisionState`(decision-state.js:137-151)가 reopened over-claim 막으려 쓰는 `ledgerCloseFresh` 가드 그대로.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/plan-body-parser.test.js`

### Task 2: 정규화 seam (resolution-classify.js)
- **Action**: `annotateResolution`의 risks 루프에 `r.sourceClosed = !!r.sourceClosed` 추가(resolved 정규화 옆). dedupe(`dedupOQAndRisks` Object.assign)가 필드를 보존하나, 방어적 정규화로 undefined→false 보장.
- **Mirror**: `resolution-classify.js:17`.
- **Validate**: 단위 테스트 + dedupe 후 boolean 확인.

### Task 3: 3-버킷 + `이력` 탭 (risks.js)
- **Action**:
  - `active = allRisks.filter(r => !r.resolved && !r.sourceClosed).sort(bySev)`
  - `resolved = allRisks.filter(r => r.resolved).sort(bySev)` (불변 — 완화됨)
  - `historical = allRisks.filter(r => !r.resolved && r.sourceClosed).sort(bySev)` (신규)
  - `historical` 항목도 `renderItem` 경유(drawer detail 적재 — H18 trigger==detail 불변 유지).
  - 탭 구성: `미해결`(active, checked) + `완화됨`(resolved, count>0일 때) + `이력`(historical, count>0일 때). 비탭 분기: resolved=0 && historical=0이면 직접 패널.
  - md 동등본: active 본문 + `<details>완화됨 N건</details>` + `<details>이력 N건</details>`.
  - 반환 `activeCount: active.length` 유지(이미 존재).
- **Mirror**: `risks.js:110-121` buildTabs 구조, `risks.js:136-140` md details.
- **Validate**: `node --test .../tests/sections.test.js` + `.../tests/design-invariants.test.js`(H17/H18)

### Task 4: rail 필터 정합 (status-grid.js)
- **Action**: `activeRisks` 필터(L196)를 `r && !r.resolved && !r.sourceClosed`로. `risksOpen`/`riskItems`/md 위젯/summaryLine 자동 정합. 주석 L191-194의 "M6 backlog 이월" 부채 노트를 "M8 lifecycle-scoped" 종료로 갱신.
- **Mirror**: `risks.js`의 동일 active 정의(SSoT 일치).
- **Validate**: `node --test .../tests/dashboard-overview.test.js`

### Task 5: negative test + reconcile invariant
- **Action**:
  - **negative test**(sections.test.js): `planStatuses=[['shipped.plan.md','complete']]`, risks=[완료-plan-미마커, 미종료-plan-미마커] 주입(파서 우회 시 `sourceClosed` 직접 세팅) → `renderRisks().activeCount === 1`, `이력` 패널에 완료-plan 위험 존재, md 본문 미노출.
  - **parse-level negative**(plan-body-parser.test.js): 합성 PRD(complete 행) + plan fixture → 파서가 해당 위험에 `sourceClosed:true` 스탬프, in-progress plan 위험은 `false`, unknown plan 위험은 `false`(fail-open).
  - **reopened-plan negative**(plan-body-parser.test.js, Codex F1 regression): 동일 basename에 (a) 오래된 ledger close 엔트리(`plan_file_hash`=구버전) + (b) 현재 plan body는 수정돼 hash 불일치 + 신규 미해결 위험 → `sourcePlanClosed`가 **false**(`ledgerCloseFresh` hash-mismatch 거부) → 신규 위험은 active 유지(historical로 사라지지 않음). terminal-receipt 경로도 stale hash면 미종료 확인.
  - **reconcile invariant**(render-integration.test.js): full `renderStatus(model)` → status-grid 위험 셀 value === renderRisks activeCount === md '위험' 위젯 카운트. verdict tone/text가 historical 위험에 영향 안 받음(불변) 확인.
- **Validate**: 위 3 파일 + `node --test .../tests/render-integration.test.js`

### Task 6: version bump + footer 동기 + PRD 행
- **Action**: plugin.json `1.18.12` / html.js L1017 footer / markdown.js L117 footer 동시 갱신(§3.7 surface drift 방지). dashboard-truthfulness.prd.md Delivery Milestones에 행 #8 추가(Milestone="위험 lifecycle-scope", Status=in-progress, Plan=본 plan 경로).
- **Validate**: `grep -rn "1.18.12" plugins/mccp/.claude-plugin/plugin.json plugins/mccp/scripts/lib/renderer/{html,markdown}.js` 3-hit.

## Validation

```bash
# 전체 renderer 스위트 (0 회귀)
node --test plugins/mccp/scripts/lib/renderer/tests/

# derive 스위트 (plan-body 소비처)
node --test plugins/mccp/scripts/derive/tests/

# 핵심 신규/변경 테스트
node --test plugins/mccp/scripts/lib/renderer/tests/plan-body-parser.test.js \
            plugins/mccp/scripts/lib/renderer/tests/sections.test.js \
            plugins/mccp/scripts/lib/renderer/tests/dashboard-overview.test.js \
            plugins/mccp/scripts/lib/renderer/tests/render-integration.test.js \
            plugins/mccp/scripts/lib/renderer/tests/design-invariants.test.js \
            plugins/mccp/scripts/lib/renderer/tests/perf-budget.test.js

# 실물 렌더 후 육안 검증 (사용자) — 위험 미해결 23 / 이력 36 / 완화됨 243
node plugins/mccp/scripts/derive/cli.js render && echo "→ .claude/cache/status.html 확인"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `이력` 탭 추가로 기존 2-탭 구조 단정 테스트 깨짐 | High | 탭은 additive(`historical.length>0` gate). sections.test.js 2-탭 케이스는 sourceClosed 부재(falsy)로 그대로 통과. 3-탭 케이스만 신규. |
| `sourceClosed` false-positive(live 위험을 잘못 숨김) — reopened same-slug plan | Med→Low | **Codex F1 흡수**: ledger 종료는 `ledgerCloseFresh`(id+basename+hash) 만 인정, terminal-receipt도 plan_hash-fresh. hash 불일치/null → active 유지. reopened-plan negative test로 가드. |
| 해시 계산 perf 부담(plan별 `planAwareMarkdownHash`) | Low | planStatuses complete/dropped short-circuit으로 해시 회피; per-plan 캐시; ledger path-b는 해시 불요. `perf-budget.test.js`로 회귀 감시. |
| `완화됨` 243이 여전히 큼(미해소) | — | 의도된 범위 밖 — 243은 **명시 해결 마커**라 접힘 탭 노출이 truthful. 버그는 unmarked-shipped inflation에 국한. |
| `stale-audit/enumerate.js`가 shipped-plan 위험을 audit agent에 계속 노출 | Low | 별도 surface(audit 도구, dashboard render 아님) + human-gated → 무해. 본 milestone 범위 밖(Open Questions 참조). |

## Open Questions

- [x] **(Codex F2, DEFER_TO_BACKLOG, MEDIUM)** active 23 중 ~16이 unknown-lifecycle(PRD/ledger mismatch)이라 confirmed-open과 섞임. 본 milestone은 confirmed-complete 36 제외(core bug)에 집중하고, unknown을 "진짜 live"로 over-claim하지 않도록 copy/주석만 정정. `activeKnown`/`lifecycleUnknown` rail breakdown(degraded provenance 분리)은 status-grid rail 디자인 변경이라 **별도 truthfulness 축으로 backlog**. `.claude/plans/codex-findings-backlog.md`에 기록. <!--mccp:resolved reason="M8 결정 = defer to backlog(별도 truthfulness 축). activeKnown/lifecycleUnknown rail breakdown은 codex-findings-backlog.md:16 (2026-06-25 MEDIUM)에 기록됨 — defer 결정 actioned. M8 본체는 confirmed-complete 36 제외 core bug에 집중" at="2026-06-30T08:33:21Z"-->
- `stale-audit/enumerate.js:61`(`if (r.resolved) return;`)도 lifecycle-aware로 만들어 audit agent가 완료 plan 위험을 스킵하게 할지 — 일관성 이득 vs 범위 확대. 본 plan은 dashboard render 표면에 국한, enumerate는 backlog 후보. (severity LOW)
- [x] `이력` 버킷을 별도 탭으로 노출 vs 렌더에서 완전 제외 — truthfulness 테마상 접힘 탭(present-but-collapsed)을 채택했으나, 사용자가 "완전 제외"를 원하면 탭 생략 + 카운트만 footnote로 강등 가능. (severity LOW) <!--mccp:resolved reason="M8 결정 = 접힘 탭(present-but-collapsed) 채택 + ship. sections/risks.js:54-66 보관됨 버킷(!resolved && sourceClosed) buildTabs 렌더. 완전 제외는 미채택 — truthfulness 테마상 present-but-collapsed 우선" at="2026-06-30T08:33:21Z"-->
- [x] M8 행 #8을 truthfulness PRD에 추가하는 게 맞는지(M7 still in-progress) vs 독립 추적 — dogfood 일관성 위해 추가 권장. (severity LOW) <!--mccp:resolved reason="M8 결정 = PRD 추가(dogfood 일관성). dashboard-truthfulness.prd.md:64 Delivery Milestones row #8 추가 완료, status=complete" at="2026-06-30T08:33:21Z"-->

## Acceptance

- [ ] 각 위험이 parse-time에 `sourceClosed` 스탬프(planStatuses + isMilestoneClosed/ledger 재사용, 신규 dep 0)
- [ ] risks.js active가 sourceClosed 제외 → 미해결 23 · 이력 탭 36 · 완화됨 243 불변
- [ ] status-grid 위험 셀 value === risks.js activeCount (rail==섹션 reconcile)
- [ ] negative test: 완료 plan 미마커 위험이 active/rail에서 제외(이력으로)
- [ ] full-render reconcile invariant test(rail==section==md, verdict 불변)
- [ ] 기존 renderer/derive 테스트 0 회귀
- [ ] plugin.json + footer 2곳 → 1.18.12 동기
- [ ] PRD Delivery Milestones 행 #8 추가
- [ ] 패턴 재사용(isMilestoneClosed/buildTabs/annotate seam), 재발명 아님

## Design Critique

- 트리거: impeccable-detect `design_signal=true` (renderer section/HTML 변경) · SKILL first-step Read 완료(`## Output Constraints` 4종)
- 라운드: R0 1회 · verdict **CONVERGED** (cap 2)
- 4 제약 대조:
  1. 정보 위계 3단계 — `이력`은 collapsed secondary, 미해결이 primary. heading depth 증가 0. ✓
  2. 강조색 화면당 1개 — `buildTabs` count는 neutral 뱃지(강조색 0). 신규 accent 0. ✓
  3. raw markdown marker 금지 — historical 항목도 `renderItem`→`renderProseHtml`/`stripMarker` 동일 경로(마커 누출 0). ✓
  4. 한 화면 항목 수 상한 — 본 plan이 이 제약을 *구현*: 36 historical을 active→collapsed 탭으로 이동(59→23, quiet-by-default). ✓
- HIGH/CRITICAL/UNKNOWN finding 0건 → 즉시 CONVERGED.

## Design Routing Guide

routing mode: auto (effective at implement stage). At implement the design gate routes these stage-appropriate impeccable commands; here they are a checklist only (plan stage는 렌더 UI 부재 → invoke 안 함).

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.18.11/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2 · `--impeccable-available` design-scope)
- 라운드 수: 1 (R1; F1 R1 흡수 완료 → ACCEPT_NOW HIGH 미잔존 → R2 미escalate)
- 합치 결론: review verdict=`needs-attention` 2건. F1(HIGH) R1 흡수, F2(MEDIUM) backlog defer. core fix(confirmed-complete 36 제외) 유지.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 stale ledger close가 reopened live 위험 억제 | HIGH | ACCEPT_NOW | 위험-숨김에 `ledgerCloseFresh`(id+basename+hash) + terminal-receipt-fresh만 사용하도록 설계 변경 + reopened-plan negative test. R1 내 완전 해소. |
  | F2 unknown-lifecycle를 "진짜 live"로 집계 | MEDIUM | DEFER_TO_BACKLOG | core bug(complete 36 제외)는 유효. unknown 별도 분리(activeKnown/lifecycleUnknown rail breakdown)는 rail 디자인 변경 = 별도 truthfulness 축. over-claim copy만 R1 정정. |
- Deferred to backlog: 1 → `.claude/plans/codex-findings-backlog.md`
- Open Questions: F2 unknown-lifecycle provenance 분리 (severity MEDIUM — non-blocking)
- Codex session 참조: threadId `019efe35-814c-7502-9be9-61675f86a4f6`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.
