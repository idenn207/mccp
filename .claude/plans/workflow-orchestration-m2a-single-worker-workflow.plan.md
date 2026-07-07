# Plan: Multi-Agent Workflow Orchestration — M2a single-worker Workflow 이전

**Source PRD**: `.claude/prds/workflow-orchestration.prd.md`
**Selected Milestone**: M2 — implement 병렬화 (first sub-milestone **M2a**: 단일 worker Workflow 등가 이전, 병렬화 전)
**Complexity**: Medium

## Summary

v1.20.2의 단일 worker implement dispatch(`/mccp:work` Step 3의 `Task` 수동호출 + envelope IPC 회수)를 `Workflow` primitive의 `agent()` 호출로 **등가 이전**한다. 병렬화는 하지 않고 **회수 채널만** envelope `merge`에서 `agent()` schema 반환값으로 전환해, M2의 척추 결정 두 개(**자체 IPC 운명** + **receipt attribution**)를 단일 worker 저위험 맥락에서 먼저 실증한다. `dispatch-cli.js prepare-single`(placeholder envelope + self-contained worker prompt)은 그대로 재사용하고 — Workflow 샌드박스는 fs/`require`가 없어 placeholder를 못 쓰므로 필수 — **dispatch 단계(Task)만** Workflow `agent()`로 교체한다. dual-review는 게이트 (b) workflow-외곽 유지로 무손상, envelope은 병존(attribution anchor + dashboard/감사), `MCCP_WORK_IMPLEMENT_WORKFLOW` default-off kill switch로 기존 Task 경로를 fallback으로 보존한다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Workflow 스크립트 | `plugins/mccp/scripts/workflows/plan-fanout.js:1-30,167-221` | `export const meta`(순수 리터럴) + self-contained 포트(샌드박스 `require` 부재) + `agent(prompt,{agentType,schema})` + budget 사전 가드 + `Date.now` 미사용 |
| Workflow 호출 wiring | `plugins/mccp/commands/plan.md:186-202` | resolve(Bash oracle) → `Workflow({scriptPath,args})` → 반환값 회수/주입 or fail-open fallback |
| verdict aggregator | `plugins/mccp/scripts/lib/dispatch-controller.js:216-266` | `mergeEnvelopes` pure — receiptsAdded/findings/failedWorkers, non-ok → failedWorkers |
| F1 invariant | `plugins/mccp/scripts/lib/dispatch-cli.js:58,247-263` | `FORBIDDEN_RECEIPT_RE` = worker가 mccp-pr-codex leak 시 `invariant-violation` verdict → HALT |
| worker prompt | `plugins/mccp/scripts/lib/dispatch-cli.js:105-149` | `buildImplementWorkerBasePrompt` — 명시 guardrail + 3-플래그 attribution forward + return contract |
| attribution stamp | `plugins/mccp/scripts/receipt/write.js:42-88` | `detectDispatchContext` — marker(env\|file\|anyFlag) → 3-플래그 all-or-nothing fail-closed |
| oracle + 토글 | `plugins/mccp/scripts/lib/plan-fanout/budget.js:*` · `cost-thresholds.js:29` | `parseXxx(env)` loud fail-open + `Object.freeze` 상수 + default 반환 |
| Tests | `plugins/mccp/scripts/lib/tests/dispatch-cli.test.js` · `plan-fanout/tests/*` | Node native runner, oracle 단위 테스트 분리 |
| Doc gate row | `CLAUDE.md` §1.4 표 · §4 운영 토글 | 새 축은 표 1행 + 토글 env 문서화 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/implement-dispatch/result-schema.js` | CREATE | `IMPLEMENT_RESULT_SCHEMA`(agent StructuredOutput) + `deriveVerdict(result)` pure oracle(`mergeEnvelopes`/`cmdMerge` 미러, F1 invariant) |
| `plugins/mccp/scripts/lib/implement-dispatch/tests/result-schema.test.js` | CREATE | schema 무결성 + verdict(ok/failed/invariant-violation/unreadable) + F1 leak 검출 |
| `plugins/mccp/scripts/lib/dispatch-cli.js` | UPDATE | `buildImplementWorkerBasePrompt`에 **schema 반환 계약** 추가(envelope mark + StructuredOutput 이중 — 병존). 신규 `emit-workflow-args` 서브커맨드(prepare 결과를 Workflow `args` 형태로 재-emit, shell-state 독립) |
| `plugins/mccp/scripts/workflows/implement-dispatch.js` | CREATE | 얇은 Workflow 스크립트 — `agent(workerPrompt,{agentType,schema})` 1개 호출 → 반환값 반환. plan-fanout.js 구조 미러(M2b에서 `parallel`로 확장할 seam) |
| `plugins/mccp/commands/work.md` | UPDATE | Step 3.I에 `MCCP_WORK_IMPLEMENT_WORKFLOW` 축 추가 — on이면 Workflow 경로(prepare 재사용 → Workflow → 반환값 verdict), off/throw/미가용이면 기존 Task dispatch fallback |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.20.4 → 1.20.5` patch bump (§3.7 단일 sub-milestone) |
| `CLAUDE.md` | UPDATE | §1.4 표 1행 + §4 `MCCP_WORK_IMPLEMENT_WORKFLOW` 토글 문서화 |
| `CHANGELOG.md` | UPDATE | 새 row |
| `.claude/prds/workflow-orchestration.prd.md` | UPDATE | M1 `in-progress→complete`(stale 정정, PR #87 머지됨) + M2 `pending→in-progress` + Plan cell = 이 파일 |

## Design Decisions (이 plan이 확정하는 것)

> M2의 PRD Open Question 6개 중 **자체 IPC 운명**·**receipt attribution**·**결정론/재개**를 M2a가 단일 worker 맥락에서 실증적으로 답한다. **병렬 파일 쓰기 안전**·**게이트 합성(c)**은 N-worker가 없는 M2a에서 발생하지 않아 M2b로 이연.

1. **verdict 판정 = 반환값 ∧ envelope ∧ receipt-store 3자 reconciliation** (IPC 운명 1차 답 · **Codex F2 흡수**). Workflow `agent(prompt,{schema})`가 검증된 객체를 반환하지만 이를 **단독 SSoT로 쓰지 않는다** — self-reported 반환 객체가 실제 dispatch record와 어긋날 수 있다(반환 `status:'ok'`인데 envelope는 `pending`/`failure`이거나, receiptsAdded에서 forbidden receipt를 누락). `deriveVerdict({result, envelope, receiptStore})` pure oracle이 3자를 reconcile해, terminal status·receipt slug 집합·forbidden receipt·invariant 중 **하나라도 불일치하면 non-ok → HALT**. 기존 `mergeEnvelopes`의 pending/non-ok=failed 규칙을 계승하고 반환값을 그 위에 교차한다 — 반환값은 '회수 트리거 채널'이지 '판정의 유일 근거'가 아니다.

2. **envelope는 병존 + reconciliation anchor** (제거 아님). 이유 3가지: (a) receipt attribution의 `ipc_envelope_path`는 canonical 경로 형식(`ENVELOPE_PATH_RE`)을 요구 → placeholder가 그 경로를 실체화하고 `detectDispatchContext`의 `markerByFile` 안전망을 켠다. (b) worker가 envelope를 terminal mark → Design Decision 1의 reconciliation 대상이자 derive `sources/envelopes.js`의 dashboard 정합원(terminal mark 없이 `pending`으로 남으면 reconciliation이 non-ok로 HALT — stale "진행중" 오표시를 gate가 잡는다). (c) 완전 단일화(envelope 폐기)는 N-worker crash-recovery/reclaim 재평가가 필요 → **M2b로 이연**. Codex F2 흡수로 이중 회수는 'loud-log 교차검증'이 아니라 **hard reconciliation gate**로 승격된다.

3. **`prepare-single` 재사용, dispatch만 교체** (최소 변경 등가). Workflow 샌드박스는 fs/`require`가 없어(플러그인 tool 계약 "No filesystem or Node.js API access") placeholder envelope를 스크립트가 못 쓴다. 따라서 work.md Bash가 기존 `dispatch-cli.js prepare-single`로 dispatchId 생성 + placeholder write + worker prompt build를 **그대로** 하고(`skipHeartbeat:true` 유지 — 동기 단일 worker는 Codex F2대로 stale-reclaim 대상 아님), Workflow에는 만들어진 worker prompt + dispatchId + ipcEnvelopePath를 `args`로 넘긴다. Workflow 스크립트는 얇게 `agent()` 1개만 — M2b가 이 seam을 `parallel(list.map(...))`으로 확장한다.

4. **worker 3중 계약 + post-hoc attribution 검증 gate** (**Codex F3 흡수**). worker(agent)는 prp-implement Phase 2.5~4를 자기 컨텍스트에서 구동(Implement-Codex 게이트 포함 — dual-review가 worker 안에서 실측됨) 후 (i) 모든 receipt write에 3 attribution 플래그 forward, (ii) `dispatch-cli.js mark`로 envelope terminal 전이, (iii) `IMPLEMENT_RESULT_SCHEMA` 반환. **cooperative forward만으로는 부족하다**(Codex F3: fresh-context agent가 플래그를 누락하면 un-anchored receipt가 조용히 dual-review·PR cross-gate dedupe를 무력화). 따라서 Step 3 종료 전 **anchor 검증 gate**를 hard로 추가: reconcile된 각 implement-codex receipt가 실제 store에서 `controller_context_marker_present=true` + `dispatched_by_controller_session_id`/`worker_dispatch_id`/`ipc_envelope_path`가 **prepare-single이 bind한 expected 값과 일치**하는지 검증 — 불일치/부재 시 non-ok → HALT. attribution을 prompt obedience에서 **structural input**으로 승격(prp-implement/receipt-write plumbing)하는 더 깊은 재설계는 M2b 후보로 명시하되, M2a는 검증 gate로 anchor 무결성을 mechanical하게 보장한다.

5. **게이트 합성 = (b) workflow-외곽 유지** (dual-review 무손상). Workflow는 실행 컨테이너일 뿐 게이트 로직 불변 — Implement-Codex는 worker 컨텍스트, receipt는 3-플래그로 controller-session anchor, PR cross-gate dedupe(v1.20.3 codex_verdict 기반)가 plan-codex + implement-codex를 정상 대조. 게이트를 pipeline 스테이지로 내리는 (c)는 verify 네이티브화(M3)와 N-worker(M2b) 사안 → M2a는 건드리지 않는다.

6. **점진 kill switch + Workflow lifecycle 경계** (**Codex F1 흡수**). `MCCP_WORK_IMPLEMENT_WORKFLOW` default off — 현행 v1.20.2 Task dispatch가 default, `=1` 명시 opt-in일 때만 Workflow 경로. **Task fallback은 Workflow invocation이 시작되기 *전*에만 허용**한다(Codex F1: Workflow가 mutating worker를 이미 spawn한 뒤 tool이 throw/timeout/결과상실하면, fallback이 같은 worktree/envelope에 **두 번째 경쟁 worker**를 launch해 edit/receipt/gate state를 중복시킨다). 경계 규칙: (i) `=0`/미설정/오타 또는 **호출 전** Workflow tool 부재 감지 → Task dispatch fallback(안전, pre-invocation). (ii) Workflow 호출을 개시하면 `started` 표식(run id 아티팩트)을 남기고, 이후 결과 회수 실패는 **Task fallback을 금지**하고 fail-closed HALT + cleanup 지시(envelope 상태 점검, `resumeFromRunId` 재개)로 처리 — 단일 worker 불변식을 절대 깨지 않는다. `MCCP_WORK_ISOLATE_IMPLEMENT=0`은 상위 축(인라인) — 3-state: 인라인 / Task-isolated(현행) / Workflow-isolated(M2a).

7. **결정론/재개는 M2a에선 1-shot** (부분 답). 단일 `agent()` 1회라 `resumeFromRunId` 캐시 replay의 이득이 얇다 — Workflow는 background task ID를 반환하고 완료 시 반환값을 회수(plan-fanout이 검증한 흐름). STATE.md handoff/resume 통합은 N-worker 장기 파이프라인이 생기는 M2b/M3 사안 → 이연. M2a는 `Date.now`/`Math.random` 미사용(샌드박스 계약)만 준수.

## Tasks

### Task 0: result-schema + 3자 reconciliation oracle (Codex F2/F3 흡수)
- **Action**: `implement-dispatch/result-schema.js` 작성. `IMPLEMENT_RESULT_SCHEMA` = `{ status:'ok'|'failure'|'timeout'|'crashed', receiptsAdded:[string], changedFiles:[string], testResult:string, nextAction:string|null, findings:[object] }` (JSON Schema, `additionalProperties:false`). `deriveVerdict({result, envelope, receiptStore, expectedAnchor}) → { verdict, receiptsAdded, invariantViolations, mismatches, unanchored, failedReason }`, verdict ∈ `ok|failed|invariant-violation|reconcile-mismatch|unanchored|result-unreadable`. 판정 순서(first match, **fail-closed**): (1) result null/비객체 → `result-unreadable`. (2) **envelope 부재/`pending`/non-terminal → `reconcile-mismatch`**(Codex F2 — `mergeEnvelopes` pending=failed 계승). (3) `result.status` ≠ `envelope.worker_exit_status` → `reconcile-mismatch`. (4) `result.receiptsAdded` 집합 ≠ `envelope.receipts_added` 집합 → `reconcile-mismatch`. (5) **어느 한쪽이라도** `FORBIDDEN_RECEIPT_RE`(`/(^|\/)mccp-pr-codex\//`) 매칭 → `invariant-violation`(F1). (6) `status` ≠ 'ok' → `failed`. (7) **reconcile된 각 implement-codex receipt의 store 레코드가 `controller_context_marker_present=true` + 3-플래그 == `expectedAnchor`가 아니면 → `unanchored`**(Codex F3). (8) else `ok`. frozen 상수 + `module.exports`.
- **Mirror**: `dispatch-controller.js:216-266` `mergeEnvelopes`(pending/non-ok=failed) + `dispatch-cli.js:247-263` `cmdMerge` invariant + `receipt/store.js` receipt read. **차이**: 단일 반환값을 envelope·receipt-store와 **3자 reconcile**(회수 채널 전환 + Codex F2/F3 hard gate). 순수 함수 — fs read는 caller가 주입(`envelope`/`receiptStore`는 이미 읽힌 객체).
- **Validate**: `node --test .../tests/result-schema.test.js` — ok / failed / result-unreadable / mccp-pr-codex leak 양쪽 → invariant-violation / status·receipt mismatch → reconcile-mismatch / envelope pending → reconcile-mismatch / marker=false·anchor 불일치 → unanchored.

### Task 1: worker prompt schema 반환 계약
- **Action**: `dispatch-cli.js buildImplementWorkerBasePrompt`에 **schema 반환 계약**을 추가(기존 envelope mark 지시는 유지 — 병존). return contract를 "compact summary ≤10 lines" → "envelope도 `mark`하고, 최종적으로 `IMPLEMENT_RESULT_SCHEMA` 객체를 반환(status/receiptsAdded/changedFiles/testResult/nextAction)"으로 확장. 3-플래그 attribution forward 문구는 그대로. 신규 `emit-workflow-args` 서브커맨드: `prepare-single` 결과 JSON을 읽어 Workflow `args`(`{workerPrompt, dispatchId, ipcEnvelopePath, controllerSessionId, expectedAnchor:{sessionId, dispatchId, ipcPath}}`) 형태로 재-emit(work.md shell-state 독립 아티팩트 + Task 0 anchor 검증 입력 — Codex F3).
- **Mirror**: `dispatch-cli.js:105-149` 기존 prompt + `plan-fanout.js` SCHEMA export 관행.
- **Validate**: `node --test .../tests/dispatch-cli.test.js`(회귀 그린) + 신규 케이스 — prompt에 schema 필드명 + envelope mark + 3-플래그 동시 존재, `emit-workflow-args`가 4-키 args 방출.

### Task 2: Workflow 스크립트 (얇게)
- **Action**: `scripts/workflows/implement-dispatch.js` 작성. `export const meta = {name:'mccp-implement-dispatch', description, phases:[{title:'Implement'}]}`(순수 리터럴). 본문: `args`에서 `{workerPrompt, agentType, schema}` 수신. `IMPLEMENT_RESULT_SCHEMA`는 self-contained 포트(plan-fanout.js가 CATALOG/SCHEMA를 포팅한 것과 동일 사유 — 샌드박스 `require` 부재). `phase('Implement')` → `const result = await agent(args.workerPrompt, {agentType: args.agentType || 'general-purpose', label:'implement:'+ (args.dispatchId||'worker'), phase:'Implement', schema: IMPLEMENT_RESULT_SCHEMA})` → `return { result, dispatchId: args.dispatchId || null }`. `agent()`가 null 반환(worker 사망) 시 `{ result:null, dispatchId }` — caller가 `result-unreadable`로 판정. `parallel`/`isolation` 미사용(M2a 단일·병렬화 전). `Date.now` 미사용.
- **Mirror**: `plan-fanout.js:1-30`(self-contained 포트 주석) + `167-221`(Workflow body 형태). **차이**: `parallel` 대신 단일 `agent()`(M2b seam).
- **Validate**: `node -c plugins/mccp/scripts/workflows/implement-dispatch.js`(구문). 실행 통합은 Task 5 dogfood(샌드박스 실행은 단위 테스트 불가 — plan-fanout과 동일 한계, oracle이 로직 커버).

### Task 3: work.md Step 3 wiring (lifecycle 경계 + reconcile/anchor gate)
- **Action**: Step 3.I에 `MCCP_WORK_IMPLEMENT_WORKFLOW` 축 추가. 모든 tmp는 worktree-safe `git rev-parse --git-path mccp/tmp`(§3.9 — `.git/` hardcode 0, 본 Phase 5에서 실측된 함정).
  - **(a) prepare**: 기존 `prepare-single` 그대로(재사용) + `emit-workflow-args`로 `dispatch-workflow-args.json`(worker prompt + dispatchId + ipcEnvelopePath + `expectedAnchor`{sessionId,dispatchId,ipcPath}) 방출.
  - **(b) pre-invocation 분기**(Codex F1): `WF="${MCCP_WORK_IMPLEMENT_WORKFLOW:-0}"` — `=1` AND prepare 아티팩트 존재 AND Workflow tool 가용이면 Workflow 경로, 아니면 **여기서** Task dispatch fallback(아직 worker 미spawn — 안전한 유일 fallback 지점).
  - **(c) Workflow invoke**: `Workflow({...})` 호출 **직전** `dispatch-workflow-started`(run id) 표식 기록 → 반환 `{result, dispatchId}`을 tmp 기록. **표식 존재 후 결과 회수 실패 시 Task fallback 금지** — fail-closed HALT + cleanup 지시(envelope 상태 점검 · `resumeFromRunId` 재개, Codex F1). 두 번째 경쟁 worker를 절대 안 만든다.
  - **(d) reconcile+anchor gate**: `deriveVerdict({result, envelope:read(ipcEnvelopePath), receiptStore:read(receiptsAdded), expectedAnchor})`(Task 0) — verdict ≠ `ok`면 fix-task.md HALT(`invariant-violation`/`unanchored`는 HARD). `ok`만 Step 4 진행.
  - **(e) fallback 수렴**: `=0`/미설정/pre-invocation 미가용 → 기존 Task dispatch(v1.20.2 3.I). **Task 경로도 동일 (d) reconcile+anchor gate로 수렴** — Codex F2/F3는 회수 채널 불문 적용이라 기존 `merge`를 `deriveVerdict`로 통일(기존 envelope-only 회수보다 강화).
- **Mirror**: `plan.md:186-202` Workflow wiring 3단 + `work.md:141-195` shell-state 독립 아티팩트 + `git rev-parse --git-path` worktree-safe(§3.9).
- **Validate**: `=0` → Task 경로 + reconcile gate 동작. `=1` + green → Workflow 경로 관찰(Task 5). Workflow **호출 전** 미가용 → Task fallback. Workflow **호출 후** 회수 실패 → HALT(두 번째 worker 미생성 확인). envelope↔result mismatch 합성 → reconcile-mismatch HALT.

### Task 4: 버전·문서·PRD milestone
- **Action**: `plugin.json` `1.20.4→1.20.5`. `CLAUDE.md` §1.4 표 1행("single-worker Workflow 이전 (v1.20.5 M2a)") + §4 `MCCP_WORK_IMPLEMENT_WORKFLOW` 토글 문서화(default off, 3-state 설명, fail-open fallback). `CHANGELOG.md` row. PRD Delivery Milestones: M1 `in-progress→complete`(stale 정정 — PR #87 머지), M2 `pending→in-progress` + Plan cell = 이 파일 경로. renderer footer version 동기(§3.7).
- **Mirror**: §3.7 milestone PR 의무 체크리스트 + §3.9/§3.10 표 행 관행.
- **Validate**: `grep 1.20.5 plugin.json`; PRD 표 diff 2행; footer version 일치.

### Task 5: dogfood e2e
- **Action**: `MCCP_WORK_IMPLEMENT_WORKFLOW=1`로 합성 소형 plan(또는 이 PRD의 후속 trivial 조각)에 `/mccp:work --full`을 1회 구동 — Workflow `agent()` → worker implement → 3자 reconcile(result ∧ envelope ∧ store) verdict `ok` → Step 4 진행을 관찰. `=0` 대조가 기존 Task 경로 + 동일 reconcile gate로 동작하는지, receipt가 3-플래그 anchored(`controller_context_marker_present=true`)인지 확인. **Codex 흡수 재현 4종**: (F1) Workflow 호출 후 결과 상실 mock → 두 번째 worker 미생성 + fail-closed HALT; (F2) envelope status ≠ result.status 합성 → `reconcile-mismatch` HALT; (F3) marker=false receipt 합성 → `unanchored` HALT; (invariant) mccp-pr-codex leak 합성 → `invariant-violation` HARD HALT.
- **Mirror**: dashboard cycle의 pre-ship dogfood + work.md merge verdict 게이트.
- **Validate**: on/off 양 경로 동작 + `node --test`(전체 회귀 그린) + implement-codex receipt attribution 3-플래그 present + F1 HALT 재현.

## Validation

```bash
# oracle 단위 테스트
node --test plugins/mccp/scripts/lib/implement-dispatch/tests/

# Workflow 스크립트 구문 + 기존 dispatch 회귀
node -c plugins/mccp/scripts/workflows/implement-dispatch.js
node --test plugins/mccp/scripts/lib/tests/dispatch-cli.test.js

# verdict oracle 스모크 — F1 invariant
node -e "const {deriveVerdict}=require('./plugins/mccp/scripts/lib/implement-dispatch/result-schema'); console.log(deriveVerdict({status:'ok',receiptsAdded:['mccp-pr-codex/foo.json']}))"  # → invariant-violation

# 전체 회귀 (기존 게이트·envelope substrate 무손상)
node --test

# 버전 bump 확인
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"  # → 1.20.5
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Workflow 호출 후 실패 시 fallback이 경쟁 worker 생성 (**Codex F1**) | 중간→낮음 | pre-invocation 경계에서만 Task fallback. `started` 표식 후 회수 실패는 fail-closed HALT + cleanup(두 번째 worker 미생성, `resumeFromRunId` 재개). Task 5 F1 재현 |
| 반환값-envelope 불일치가 조용히 통과 (**Codex F2**) | 중간→낮음 | 3자 reconciliation hard gate — status·receipt slug·forbidden·invariant 불일치 시 non-ok HALT. envelope `pending`도 fail-closed. loud-log 강등 폐기 |
| attribution de-anchor로 dual-review 무력화 (**Codex F3**) | 중간→낮음 | post-hoc anchor 검증 gate — marker=true + 3-플래그 == expectedAnchor 아니면 `unanchored` HALT. structural input 승격은 M2b |
| Workflow 미가용 환경(plugin-only install) | 중간 | default off + `=1`이어도 throw/미가용 시 기존 Task dispatch 자동 fallback(fail-open) |
| F1 invariant 우회(worker가 commit/PR 실행) | 높음→낮음 | belt-and-suspenders: (i) worker prompt guardrail + `MCCP_AUTO_CHAIN_DISABLE=1` env, (ii) `deriveVerdict`가 반환값 receiptsAdded에서 mccp-pr-codex leak 검출 → HARD HALT |
| Workflow 결정성(`Date.now`/`Math.random` throw) | 낮음 | 스크립트 시간·난수 미사용, dispatchId는 prepare-single(work.md Bash)이 생성해 args 주입 |
| dual-review 손상 | 낮음 | 구조적: Implement-Codex는 worker 컨텍스트 불변, 게이트 (b) 외곽 유지, receipt 3-플래그 anchor, cross-gate dedupe 무변경 |

## Open Questions — M2 PRD 매핑

| PRD Open Question | M2a 처리 |
|---|---|
| 게이트 합성 방식 | **유지** — (b) workflow-외곽(M1과 동일). (c) pipeline-스테이지는 M2b/M3 |
| receipt attribution | **답(강화, Codex F3)** — cooperative forward + **post-hoc anchor 검증 gate**(marker+3-플래그 store 검증). structural input 승격은 M2b |
| 자체 IPC 운명 | **1차 답(Codex F2)** — 회수 판정은 반환값 ∧ envelope ∧ store **3자 reconciliation**. 완전 폐기 M2b 재평가 |
| 비용 정책(budget↔cost-tier) | **N/A M2a** — 단일 worker(fan-out 아님). N-worker budget은 M2b |
| 병렬 파일 쓰기 안전 | **N/A M2a** — 단일 worker라 race 구조적 부재. `isolation:'worktree'`는 M2b |
| 결정론/재개(resumeFromRunId·STATE.md) | **부분** — M2a는 1-shot(resume 이득 얇음). STATE.md 통합 M2b |

## Acceptance

- [ ] `result-schema` oracle 단위 테스트 통과(ok/failed/unreadable/invariant-violation/**reconcile-mismatch/unanchored**)
- [ ] Workflow 스크립트 `node -c` 구문 통과 + 기존 `dispatch-cli.test.js` 회귀 그린
- [ ] `MCCP_WORK_IMPLEMENT_WORKFLOW` 미설정(default off) → 현행 Task dispatch와 동등(무변화)
- [ ] `=1` + Workflow 가용 → `agent()` 단일 worker → **3자 reconcile** verdict `ok` → Step 4 진행
- [ ] Workflow **호출 전** 미가용 → Task fallback; **호출 후** 회수 실패 → fail-closed HALT(두 번째 worker 미생성, Codex F1)
- [ ] result↔envelope 불일치 → `reconcile-mismatch` HALT (Codex F2)
- [ ] marker=false/anchor 불일치 receipt → `unanchored` HALT (Codex F3)
- [ ] implement-codex receipt가 3-플래그 controller-anchored(`controller_context_marker_present=true`)
- [ ] worker mccp-pr-codex leak(양쪽) → `invariant-violation` HARD HALT
- [ ] dual-review 무손상 — implement-codex receipt chain + PR cross-gate dedupe 정상
- [ ] `plugin.json` 1.20.5 + CLAUDE.md(§1.4 표 + §4 토글)/CHANGELOG/PRD milestone(M1 complete, M2 in-progress) 갱신
- [ ] Patterns mirrored, not reinvented (prepare-single 재사용, mergeEnvelopes/cmdMerge invariant 미러)

## Design Critique

> impeccable detector가 `design_signal=true`를 반환했으나 `signal_files:["<keyword:design>"]` — plan body의 "Design Decisions" 제목 키워드 오탐(M1 plan 동일 false-positive). 본 plan은 순수 백엔드 orchestration(`Workflow` 스크립트 + pure oracle lib + work.md wiring)으로 rendered design surface가 없다(Files to Change에 UI 확장자·renderer/HTML 출력 0). SKILL first-step(`frontend-design-direction` Output Constraints) Read 후 확인: impeccable skill scope("Not for backend-only or non-UI tasks") 밖 → 0 failing findings → **CONVERGED** (rounds=1).

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, worktree-safe tmp via `git rev-parse --git-path`)
- 라운드 수: 1 (R1, `MCCP_GATE_ROUND_CAP=1` default)
- 합치 결론: verdict=`needs-attention`("No-ship: fail-open + self-reported paths for a mutating implement stage") → **R1 absorption으로 3 findings 전부 흡수**. fail-open fallback·반환값 단독 SSoT·cooperative anchor를 lifecycle 경계·3자 reconciliation·anchor 검증 gate로 교체.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 Workflow 호출 후 fallback이 경쟁 worker 생성 | HIGH | ACCEPT_NOW | pre-invocation 경계 + `started` 표식 후 fail-closed HALT(두 번째 worker 미생성) — Design Decision 6 · Task 3 |
  | F2 반환값 단독 SSoT가 envelope 불일치 통과 | HIGH | ACCEPT_NOW | 반환값 ∧ envelope ∧ store 3자 reconciliation hard gate — Design Decision 1/2 · Task 0/3 |
  | F3 attribution de-anchor로 dual-review 무력화 | HIGH | ACCEPT_NOW | post-hoc anchor 검증 gate(marker+3-플래그 store 검증) — Design Decision 4 · Task 0/3 |
- Deferred to backlog: 0
- Self-attest (R1 충분성): 3 findings 모두 **plan 설계 레벨 안전 결함**이라 fail-closed gate 재설계로 흡수 완결. Codex의 "lifecycle contract/hard reconciliation/anchor gate를 추가하라"는 요구를 Task 0/3 acceptance에 mechanical하게 편입 → 실제 검증은 `/mccp:prp-implement` + Implement-Codex 게이트에서 수행. R2 escalate 불필요(cap=1 존중, ACCEPT_NOW HIGH는 설계로 해소).
- Open Questions: 없음 (auto-CRITICAL 0 — secret/data-loss/auth-bypass/irreversible migration 해당 없음. commit/PR은 여전히 controller 전용, F1 invariant + `deriveVerdict` invariant-violation이 worker의 irreversible external state를 차단)
- Codex session 참조: threadId `019f3a93-55fc-7d42-9f93-22aca2fe86c0`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.

- plan-codex R1이 3 HIGH(F1 fallback race · F2 반환값 SSoT · F3 attribution de-anchor)를 전부 설계 요구사항으로 흡수(lifecycle 경계 · 3자 reconciliation hard gate · post-hoc anchor 검증 gate).
- Tasks가 파일 레이아웃(`result-schema.js`/`implement-dispatch.js`) · `deriveVerdict` 판정 순서(8-step) · `IMPLEMENT_RESULT_SCHEMA` shape · `FORBIDDEN_RECEIPT_RE`를 규범적으로 pre-commit → 새 아키텍처 결정 부재.
- 외부 의존성 무추가(Workflow primitive만), concurrency model = 단일 `agent()`(병렬화 M2b 이연).
- 실측 검증은 Phase 4 VALIDATE(oracle 단위 테스트 8-step 판정) + Task 5 dogfood(F1/F2/F3/invariant 4종 재현)로 mechanical 수행.
