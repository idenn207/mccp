# Plan: Workflow Orchestration Live Activation — M2 (live 완주 검증)

**Source PRD**: `.claude/prds/workflow-orchestration-live-activation.prd.md`
**Selected Milestone**: M2 — live 완주 검증 (복수 cycle)
**Complexity**: Medium

## Summary

M1이 발화를 **구조적으로 배선**(oracle 3종 default 발화 반전 + cost fail-open + runaway 안전판 + route oracle + 합성 wiring harness)했지만, 실제 LLM-runtime에서 fan-out·병렬·verify가 발화하는 것을 **관찰한 적이 없다**. M2는 그 관찰을 획득하되, `/mccp:work` 완주는 재귀·고비용이라 두 축으로 나눈다: (1) **저비용 firing-preview 도구** — 현재 env·cost-state·runaway 카운터로 "지금 무엇이 발화할지"를 **LLM 소비 0으로** Step 3와 **동일 oracle**을 재사용해 미리 판정·출력(발화율 metric을 spend 없이 측정 + live 진입 전 배선 끊김 사전 제거). (2) **operator-executed live 완주** — scope-최소 target으로 실제 `/mccp:work`를 단일 vs 병렬 복수 회 완주하고 dual-review·receipt chain 무손상 + 발화 로그 + 중간수정 빈도를 **관찰 기록 아티팩트**에 정직히 남긴다. live 완주는 재귀 회피를 위해 **prp-implement 밖**(operator 직접)에서 실행하며 M2 acceptance evidence로 기록에 folding된다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Step 3 oracle 조합 (SoT) | `plugins/mccp/commands/work.md:188-208` | `resolveFleet({env, mergeStrategy, requestedN, costStateRead:cs.readState, tierFor, costFailOpen, runawayClamp, subscriptionMode, contextStateRead})` 조합. preview는 **동일 호출**을 read-only로 재현 |
| Pure oracle + injected reads | `plugins/mccp/scripts/lib/implement-dispatch/budget.js:141` · `plan-fanout/budget.js:117` | `resolveFleet`/`resolveFanout` — disk 미접근, cost-state는 `costStateRead`로 주입. preview도 disk read를 caller가 주입 |
| Read-only 카운터 (no mutation) | `plugins/mccp/scripts/lib/orchestration-runaway.js:92` `readCounter` (vs `:144` `bumpCounter`) | preview는 `readCounter`만 — **절대 `bumpCounter` 호출 안 함**(관측이 상태를 오염하면 안 됨) |
| require.main CLI (lib+thin CLI) | `plugins/mccp/scripts/lib/dep-check.js` · `dispatch-cli.js:1223` | 순수 함수 export + `if (require.main === module)` 얇은 CLI(`--json`/human) |
| Loud fail-open env parse | `plugins/mccp/scripts/lib/orchestration-runaway.js:46` `parseMaxAgents` | 비정상 값 → default + stderr warn. preview CLI 인자 파싱 동형 |
| merged-verify 모드 판정 | `plugins/mccp/scripts/lib/implement-dispatch/verify.js` `parseMergedVerifyMode` | verify 축(enforce/warn/off)도 preview에 포함 — 3축(fan-out·병렬·verify) 모두 한 스냅샷 |
| Oracle 결정 트리 unit test | `plugins/mccp/scripts/lib/implement-dispatch/tests/budget.test.js` (M1) | env 조합 case별 assert. preview test는 발화 스냅샷 정합 + read-only 불변식 |
| 구조화 관찰 doc | `docs/harness-cost-contract.md` · `.claude/notes/work-context-firewall.md` | 섹션·표 기반 markdown 계약 문서. 관찰 기록도 per-cycle 표 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/orchestration-preview.js` | CREATE | 순수 `previewFiring(opts)` + `require.main` CLI. Step 3와 **동일 oracle**(`resolveWorkRoute`/`resolveFleet`/`resolveFanout`/runaway `readCounter`/`parseMergedVerifyMode`)을 read-only로 조합해 fan-out·병렬·verify·route·runaway 발화 스냅샷을 LLM 소비 0으로 산출. fan-out(plan)·parallel(work) 양 축을 함께 다루므로 top-level lib에 배치 |
| `plugins/mccp/scripts/lib/tests/orchestration-preview.test.js` | CREATE | env matrix(cost-state 부재→COST_FAILOPEN 발화 / `off`/`0`→opt-out / runaway near-cap→degraded clamp 표면) + **read-only 불변식**(preview 실행이 `orchestration-runaway.json` 미변경) + preview 판정이 직접 `resolveFleet`/`resolveFanout` 호출과 byte-정합 |
| `docs/workflow-orchestration/live-activation-observations.md` | CREATE | per-cycle 관찰 기록(target·route·N·발화 reason·receipt chain verdict·중간수정·milestone 변경·품질) + **live-dogfood 프로토콜**(scope-최소 target·단일 vs 병렬 opt-out 토글·재귀 회피 경계·검증 절차) + baseline 신뢰도 caveat(단일 사용자 학습효과 오염) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version `1.22.1`→`1.22.2` (단일 milestone = patch, §3.7) — preview 도구 신규 cache 확보 |
| `CHANGELOG.md` | UPDATE | v1.22.2-m2 row(firing-preview 도구 + 관찰 기록/프로토콜 + live 검증 축) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | footer version `v1.22.1`→`v1.22.2` (L1417) — §3.7 surface drift 회피 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | footer derived 줄 `v1.22.1`→`v1.22.2` (L154) |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | footer version assert `v1.22.1`→`v1.22.2` (L88/L125) 동기 |
| `CLAUDE.md` | UPDATE | §1.4 자동 게이트 표에 v1.22.2-m2 row(firing-preview + 관찰 기록) + §4에 preview 도구 사용법·live 프로토콜 pointer 1줄 |
| `.claude/prds/workflow-orchestration-live-activation.prd.md` | UPDATE | (본 `/mccp:plan`이 이미 적용) M2 pending→in-progress + Plan cell + M1 stale in-progress→complete drift 정정 |

## Tasks

### Task 1: firing-preview oracle + CLI (`orchestration-preview.js` CREATE)
- **Action**:
  - 순수 함수 `previewFiring({ env, planText, prdMode, mergeStrategy, costStateRead, tierFor, runawayRead, subscriptionMode, contextStateRead })` → 구조화 report:
    - `env_summary`: `MCCP_PLAN_FANOUT`/`MCCP_WORK_IMPLEMENT_PARALLEL` 정규화 모드(on/off), `MCCP_WORK_MERGE_STRATEGY`, `MCCP_ORCHESTRATION_COST_FAIL_OPEN`, subscription, `MCCP_ORCHESTRATION_MAX_AGENTS`.
    - `cost_state`: `{present, tier, hard_ceiling}` 또는 null(부재).
    - `runaway`: `readCounter`로 `{session_id, launched, max_agents, headroom}` — **read-only**.
    - `fanout`: `resolveFanout({env, prdMode, costStateRead, tierFor, costFailOpen, runawayClamp:pure, subscriptionMode, contextStateRead})` → `{run, reason, fleetSize, tier, degraded, runawayReason}`. **component signal** — `run:true`는 필요조건이지 Step 3 실발화 보장이 아니다(아래 `effective_fire` 참조).
    - `fleet`: `planText` 있으면 `partitionFromPlanText`로 `requestedN` 도출 → `resolveFleet(...)` → `{run, n, requestedN, reason, tier, degraded, runawayReason}`; 없으면 `requestedN` N/A 표기. 역시 **component signal**.
    - `merged_verify`: `parseMergedVerifyMode(env)` → `{mode}`.
    - `caller_gates` (**Codex F1 흡수 — 순환 정합 방지**): Step 3가 oracle `run:true` 위에 얹는 **caller-side 전제**를 명시 표면화 → `{isolate:(MCCP_WORK_ISOLATE_IMPLEMENT!=0), workflow_mode:(MCCP_WORK_IMPLEMENT_WORKFLOW), partition_n:(fleet.n), prepare_assumed:true, fleet_args_assumed:true, workflow_available_assumed:true}`. `isolate`/`workflow_mode`/`partition_n`은 env·plan에서 **실도출**(가정 아님); `prepare_assumed`/`fleet_args_assumed`/`workflow_available_assumed`만 mid-run 아티팩트(dispatch-*-args.json) 부재로 **투영 가정**임을 honest 라벨로 구분.
    - `route`(**primary 발화 판정 — F1**): `resolveWorkRoute({env, isolate, hasFleetArgs, hasPrepare, hasWorkflowArgs, workflowAvailable})`를 SoT로 1회 호출 → `{route ∈ inline|task|workflow-single|workflow-parallel, assuming}`. Step 3 실발화 경로를 결정하는 건 fanout/fleet `run`이 아니라 **route**다 — `route.js`가 이미 isolate·hasFleetArgs·hasPrepare·hasWorkflowArgs·workflowAvailable caller-gate를 encode하고 work.md Step 3와 **동일 함수를 공유**하므로 재구현·drift가 구조적으로 불가(F1 권고의 "reusable JS caller-decision function"이 이미 M1에 존재).
    - `effective_fire` (**F1 핵심**): 축별 최종 발화 = oracle `run` **AND** route 판정. 예: `parallel_fires = (fleet.run && route==='workflow-parallel')`, `single_fires = (route==='workflow-single')`, `fanout_fires = fanout.run`(fan-out은 plan 게이트 GROUND라 route와 독립). `MCCP_WORK_ISOLATE_IMPLEMENT=0`이면 route=`inline` → `fleet.run:true`여도 `parallel_fires:false`. preview는 `oracle_run`(원자료)과 `effective_fire`(route 합성)를 **분리 출력**해 "oracle이 run이라 발화한다"는 false green-light를 구조적으로 차단한다.
  - `runawayClamp`는 preview에서 **순수 clamp**(`clampForRunaway({requestedN, launchedSoFar:launched, env})`)로 주입 — 발화 N이 절대 상한에 걸리면 preview도 degraded를 표면화(실 실행과 정합).
  - **read-only 불변식**: `bumpCounter` 미호출. cost-state·STATE.md 미변경. preview는 관측이지 실행이 아니다.
  - `require.main` CLI: `node orchestration-preview.js [--plan <path>] [--prd] [--json]`. default human-readable(축별 ✅발화/⛔skip + reason), `--json` machine. 인자 파싱은 loud fail-open.
- **Mirror**: `work.md:188-208` oracle 조합, `budget.js:141`/`plan-fanout/budget.js:117` injected-read 순수 oracle, `orchestration-runaway.js:92` read-only counter, `implement-dispatch/route.js:55` `resolveWorkRoute` caller-gate SoT(effective_fire의 primary 판정), `dep-check.js` require.main CLI.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/orchestration-preview.test.js` + `node plugins/mccp/scripts/lib/orchestration-preview.js --json`(현 env → cost-state 부재라 fan-out/fleet `COST_FAILOPEN` run 확인).

### Task 2: preview 정합 + read-only 불변식 test (`orchestration-preview.test.js` CREATE)
- **Action**:
  - env matrix: (a) cost-state 부재 + costFailOpen default → fanout/fleet `run:true` reason `cost-failopen`. (b) `MCCP_PLAN_FANOUT=off`/`MCCP_WORK_IMPLEMENT_PARALLEL=0` → 각 축 `env-off` skip. (c) `MCCP_ORCHESTRATION_COST_FAIL_OPEN=0` + cost-state 부재 → `cost-state-unknown` skip(fail-closed 복원). (d) launched near `MCCP_ORCHESTRATION_MAX_AGENTS` → fleet/fanout `degraded:true` + `runaway-clamp` reason 표면.
  - **caller-gate/effective_fire matrix (Codex F1 흡수 — oracle run ≠ 실발화)**: (e) `MCCP_WORK_ISOLATE_IMPLEMENT=0` → route=`inline` → `fleet.run:true`여도 `effective_fire.parallel_fires:false`. (f) partition N=1(단일 partition plan, 또는 fleet_args 투영 off) → route≠`workflow-parallel` → `parallel_fires:false`(fleet run 무관). (g) `MCCP_WORK_IMPLEMENT_PARALLEL=off` + isolate on + hasWorkflowArgs 가정 → route=`workflow-single` → `parallel_fires:false`·`single_fires:true`. (h) `caller_gates.prepare_assumed`/`fleet_args_assumed`/`workflow_available_assumed`가 실 아티팩트가 아니라 **투영 라벨**로 출력되는지 + `oracle_run`과 `effective_fire`가 **분리 필드**로 나오는지 assert(false green-light 방지의 핵심).
  - **정합 test**: preview의 `fanout`/`fleet`/`route` 서브객체가 동일 입력으로 직접 호출한 `resolveFanout`/`resolveFleet`/`resolveWorkRoute` 반환과 **byte-정합**(preview가 oracle을 우회·재구현하지 않음 = false-confidence 방지). route까지 포함해 caller-gate 판정도 SoT 공유로 증명.
  - **read-only 불변식 (Codex F3 흡수 — 전체 mutable state 커버)**: temp `HOME`/state 루트에 `orchestration-runaway.json` + cost-state(`cost-current.json`) + `STATE.md` write-sentinel을 시드하고, preview CLI 실행 후 **세 파일 모두** mtime·내용 **불변** assert(runaway 카운터만이 아니라 cost-state·STATE.md도 무변경 — bumpCounter/cost write/state write 미발생 증명). 추가로 preview 모듈 소스에 `bumpCounter` import·호출 경로가 **정적으로 부재**함을 assert(주입된 `runawayRead`/`readCounter`만 사용).
- **Mirror**: `implement-dispatch/tests/budget.test.js`(M1) case별 assert, `orchestration-runaway.test.js`(M1) temp-dir counter 패턴, `implement-dispatch/tests/route.test.js`(M1) env×artifact route 전수 case.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/orchestration-preview.test.js`.

### Task 3: 관찰 기록 + live-dogfood 프로토콜 doc (`live-activation-observations.md` CREATE)
- **Action**:
  - `docs/workflow-orchestration/` 생성. per-cycle 관찰 표: `| cycle | date | target | route(fired) | N | fanout(run/reason) | verify(mode/verdict) | receipt chain | 중간수정 수 | milestone 변경 | 품질 노트 |`.
  - **live-dogfood 프로토콜** 섹션: (1) scope-최소 target 선정 기준(단일 파일·저위험·실제 필요 gap — 예: M3 후보 1건), (2) **2개 named row 필수**(Codex F2) — row A=default 발화(미설정, parallel/fan-out) ↔ row B=`MCCP_WORK_IMPLEMENT_PARALLEL=off` opt-out single. 각 row 캡처 필드: route log·fanout/fleet reason·merged-verify verdict·`/mccp:receipt-status` chain. (3) **재귀 회피 경계**: live `/mccp:work`는 operator가 별도 세션에서 직접 실행(prp-implement 안에서 재귀 금지), (4) 검증 절차: 완주 후 `/mccp:receipt-status`로 plan/implement/verify/pr receipt chain 무손상 확인 + 발화 로그(`[mccp:work] parallel fleet 발화 (N=..)`·route=..) 캡처. **live 진입 전** `node ... orchestration-preview.js --plan <plan>`로 `effective_fire`(oracle_run 아님)를 사전 확인해 발화 예상 route를 row에 미리 기록.
  - baseline 신뢰도 caveat: 단일 사용자 dogfood는 학습효과 오염으로 엄밀 A/B 불가 → 관찰은 **정성적·정직**하게, assumption 마커로 표시(PRD Success Metrics 주석 계승).
  - preview 도구 사용법 1줄: live 진입 전 `node ... orchestration-preview.js --plan <plan>`으로 발화 판정 사전 확인.
- **Mirror**: `docs/harness-cost-contract.md` 계약 문서 톤, PRD Success Metrics의 honest-assumption 주석.
- **Validate**: 육안 + `node -e`로 표 헤더·프로토콜 섹션 존재 grep.

### Task 4: version bump + footer sync + CHANGELOG + CLAUDE.md
- **Action**:
  - `plugin.json` `1.22.1`→`1.22.2`. footer version `html.js:1417`·`markdown.js:154` + `i18n-surface.test.js:88/125` assert 동기(§3.7 surface drift 회피).
  - `CHANGELOG.md` top에 `## [1.22.2]` row(firing-preview 도구 + 관찰 기록/프로토콜 + live 검증 M2).
  - `CLAUDE.md` §1.4 표에 v1.22.2-m2 row + §4에 preview 도구·live 프로토콜 pointer.
- **Mirror**: §3.7 patch bump + footer 동기 계약, 기존 CHANGELOG/§1.4 row 포맷.
- **Validate**: `node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"`→`1.22.2` + `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` green.

### Task 5 (operator-executed, prp-implement 밖 — 재귀 회피): live 완주 관찰
- **Action**: Task 1-4가 merge된 뒤 operator가 별도 세션에서 scope-최소 target으로 `/mccp:work`를 (a) default(병렬/fan-out 발화) (b) `MCCP_WORK_IMPLEMENT_PARALLEL=off`(단일 opt-out) 각 최소 1회 완주. 발화 로그·receipt chain·중간수정 빈도를 Task 3 관찰 기록에 folding. M2 **acceptance evidence**.
- **경계(중요)**: 이 Task는 **prp-implement 스코프 밖**이다 — `/mccp:prp-implement`가 `/mccp:work`를 재귀 호출하면 PRD Open Question("live 검증의 재귀/비용")이 그대로 발생. prp-implement은 Task 1-4(도구·test·doc·version)만 빌드하고, Task 5는 operator가 수동 실행 후 관찰 기록 커밋으로 M2를 마감한다.
- **Validate (Codex F2 흡수 — default ∧ opt-out 양 row 필수)**: 관찰 기록에 **명시 2개 named row** — (row A) **default 발화**(parallel/fan-out): route log(`route=workflow-parallel` 등)·fanout/fleet reason·merged-verify verdict·`/mccp:receipt-status` chain 무손상, (row B) **`MCCP_WORK_IMPLEMENT_PARALLEL=off` opt-out single**: route log(`route=workflow-single`/`task`)·fleet `env-off`·merged-verify verdict·receipt chain. 두 row **모두** 기록돼야 M2 종료 — happy-path 1회로 닫히지 않는다.

## Validation

```bash
# preview oracle 정합 + read-only 불변식
node --test plugins/mccp/scripts/lib/tests/orchestration-preview.test.js

# preview 실행 — 현 env(cost-state 부재)에서 발화 판정 (LLM 소비 0)
node plugins/mccp/scripts/lib/orchestration-preview.js --plan .claude/plans/workflow-orchestration-live-activation-m2.plan.md --json

# 회귀 — M1이 깐 발화 표면 무손상
node --test plugins/mccp/scripts/lib/implement-dispatch/tests/
node --test plugins/mccp/scripts/lib/plan-fanout/tests/
node --test plugins/mccp/scripts/lib/tests/orchestration-runaway.test.js
node --test plugins/mccp/scripts/lib/implement-dispatch/tests/route.test.js

# footer/version drift 회피
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"  # 1.22.2
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| preview가 Step 3 실 발화 조합과 drift → false green-light (Codex F1) | 높음 | preview는 oracle을 **재구현하지 않고 동일 함수 호출**(single SoT: fanout/fleet **및 route=`resolveWorkRoute`**). oracle `run`은 component signal일 뿐 실발화는 **route+caller-gate 합성 `effective_fire`**로 판정(isolate=0/partition N=1/opt-out에서 run:true여도 미발화 표면). Task 2 정합 test가 preview 서브객체 == 직접 `resolveFleet`/`resolveFanout`/`resolveWorkRoute` byte-정합 + caller-gate matrix(e~h)로 false green-light 차단 |
| preview가 관측 상태 오염(runaway bump·cost-state·STATE.md write) | 낮음 | `readCounter`만·`bumpCounter` 미호출을 불변식으로 명문화 + Task 2 read-only test가 runaway·**cost-state·STATE.md 3파일 전부** mtime/내용 불변 + 모듈 `bumpCounter` 경로 정적 부재를 mechanical 검증(Codex F3) |
| live 완주가 prp-implement 안 재귀로 고비용 폭주 | 중간 | Task 5를 **prp-implement 밖**으로 명시 분리. scope-최소 target. preview로 사전 발화 확인 → blind spend 회피. runaway hard cap(M1)이 최후 안전판 |
| 단일 사용자 baseline 약함 → 중간수정 감소 주장 편향 | 높음 | 관찰은 정성적·정직(assumption 마커). "감소" 주장은 관찰 기록에 근거 인용으로만, 정량 A/B 아님(PRD 주석 계승) |
| dual-review·receipt chain 무손상 실패 관측 | 낮음 | preview·관찰 도구는 read-only(발화 경로 미변경). Task 5 검증이 `/mccp:receipt-status`로 chain anchor 실측. 무손상 실패 발견 시 M3 gap 항목으로 이연 |
| footer/version drift(§3.7 상습 누락) | 중간 | Task 4가 footer×2 + i18n test까지 동기 + i18n-surface.test.js가 mechanical 검증 |

## Acceptance

- [ ] `previewFiring`가 Step 3와 **동일 oracle**을 read-only 조합해 fan-out·병렬·verify·route·runaway 발화 스냅샷 산출(LLM 소비 0)
- [ ] preview가 `oracle_run`(fanout/fleet `run`)과 `effective_fire`(route·caller-gate 합성)를 **분리 출력** — `MCCP_WORK_ISOLATE_IMPLEMENT=0`/partition N=1에서 `run:true`여도 `parallel_fires:false` (Codex F1 — false green-light 차단)
- [ ] 현 env(cost-state 부재)에서 preview가 fan-out/fleet `run:true` reason `cost-failopen` 표면 — default 발화율 metric을 spend 없이 관측
- [ ] preview `--json` 서브객체 == 동일 입력 직접 `resolveFanout`/`resolveFleet`/`resolveWorkRoute` byte-정합 (정합 test green)
- [ ] preview 실행이 `orchestration-runaway.json`·cost-state·STATE.md **전부** 미변경 + 모듈에 `bumpCounter` 경로 정적 부재 (read-only 불변식 test green — Codex F3)
- [ ] env matrix: off/0 opt-out · `COST_FAIL_OPEN=0` fail-closed 복원 · near-cap degraded clamp 표면 · caller-gate matrix(isolate=0/N=1/opt-out) — 각 case test green
- [ ] `live-activation-observations.md`: per-cycle 표 + live-dogfood 프로토콜(재귀 회피 경계) + baseline caveat
- [ ] (operator, prp-implement 밖) live `/mccp:work` **2개 named row 완주 관찰**(Codex F2): (A) default 발화(parallel/fan-out) + (B) `MCCP_WORK_IMPLEMENT_PARALLEL=off` opt-out single — 각 row에 route log·fanout/fleet reason·merged-verify verdict·`/mccp:receipt-status` chain 무손상 evidence. **양 row 모두** 없으면 M2 미종료
- [ ] `plugin.json` 1.22.2 + footer×2 + i18n test + CHANGELOG + CLAUDE.md §1.4/§4 동기
- [ ] M1이 깐 발화 표면(implement-dispatch/plan-fanout/route/runaway test) 회귀 green
- [ ] dual-review·receipt chain 무손상(preview·관찰 도구 read-only, 발화 경로 미변경)
- [ ] Patterns mirrored, not reinvented

## Design Critique

- 검출: `impeccable-detect --mode plan` → `SKILL_AVAIL=1 SIGNAL=1` (signal_files = `renderer/html.js`·`markdown.js`·`i18n-surface.test.js`).
- 판정: **false-positive** — 이 파일들의 변경은 footer version 문자열(`v1.22.1`→`v1.22.2`) 동기뿐이며 새 rendered design surface(정보 위계·강조색·raw marker·list-of-N)를 만들거나 바꾸지 않는다. SKILL `## Output Constraints` 4축 모두 N/A(rendered dashboard/status.html 출력 무변경).
- 라운드 수: 1
- verdict: **converged** (design 위반 0건 — 순수 CLI 도구 + markdown 문서 + 버전 문자열).

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.22.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2; class=ok, durationMs≈272977)
- 라운드 수: 1 (findings 3건 모두 R1에서 흡수 — 미해소 없음, R2 escalate 불필요)
- 합치 결론: Codex `needs-attention`(No-ship) 3 findings(HIGH 2 + MEDIUM 1)을 R1에서 전부 ACCEPT_NOW 흡수(plan 편집) → 미해소 divergence 없음 → converged. 핵심은 F1 — "oracle run == 발화"라는 순환 정합을 **route-primary `effective_fire`**로 교체해 false green-light를 구조 차단.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 preview 정합이 순환적 — oracle run ≠ Step 3 실발화(isolate=0/prepare 실패 시 run:true여도 미발화) | HIGH | ACCEPT_NOW | M2의 존재 이유(발화 preview)를 무력화하는 correctness gap. Task 1에 `route=resolveWorkRoute` primary 판정 + `caller_gates` + `oracle_run`/`effective_fire` 분리, Task 2에 caller-gate matrix(e~h) 흡수. route.js가 이미 SoT라 재구현 아님 |
  | F2 Acceptance가 `≥1 cycle`만 요구 → Task 5의 default∧opt-out 요구보다 약함 → happy-path 1회로 종료 | HIGH | ACCEPT_NOW | Acceptance·Task 5 Validate·Task 3 프로토콜을 **2개 named row(default + opt-out) 필수**로 강화. 각 row route log·reason·verdict·receipt-status evidence 요구 |
  | F3 read-only 불변식 test가 runaway 카운터만 검증 — cost-state·STATE.md 무방비 | MEDIUM | ACCEPT_NOW | Task 2 read-only test를 temp HOME/state 루트의 **runaway+cost-state+STATE.md 3파일 전부** mtime/내용 불변 + 모듈 `bumpCounter` 경로 정적 부재 assert로 확장 |
- Deferred to backlog: 0
- Open Questions: none (findings 3건 전부 R1 흡수, auto-CRITICAL 카탈로그 해당 없음 — secret/data-loss/auth/crypto/migration 무관)
- Codex session 참조: threadId `019f60d7-de1a-7603-9fa7-1de5f90b0e02`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.
