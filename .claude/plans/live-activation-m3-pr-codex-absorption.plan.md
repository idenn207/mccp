# Plan: PR-Codex R1 흡수 (v1.22.3 M3 follow-up)

**Source**: `.claude/state/fix-task.md` (PR-Codex R1, `run_id=1203df1f-09c5-4dc4-8549-b5c72d94087c`, verdict `needs-attention`)
**Selected Milestone**: workflow-orchestration live-activation M3 — PR 전 잔여 HIGH 2건 흡수
**Complexity**: Medium

## Summary

M3(v1.22.3)가 자기 손으로 연 두 결함을 닫는다. **F1** — 고쳐진 PR-Codex runner가 verdict를 실제로 읽게 되면서, design/a11y-only non-approve가 `filteredFindings` 검사 **전에** short-circuit해 in-scope finding 0인데도 receipt가 `divergent`로 봉인되는 경로가 새로 활성화됐다. **F2** — M3가 agent-count cap을 primary structural backstop으로 승격시켰는데, `reserveWorkers`가 **결정 시점**에 슬롯을 영구 소진해 worker가 한 개도 안 뜬 경로(prepare 실패·route fallback·budget pre-guard skip)에서 유령 예약이 headroom을 갉는다 — cap이 신뢰 가능한 backstop이라는 M3 헤드라인 주장 자체의 정확성 결함.

두 건 모두 fix-task에서 **실제 코드로 확인**했으며(Codex 주장 액면 수용 아님), 아래 GROUND에 확인 근거를 인용한다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `plugins/mccp/scripts/lib/orchestration-runaway.js:68` | `Object.freeze` REASONS enum + `warn()` loud fail-open env parse |
| Errors | `plugins/mccp/scripts/lib/orchestration-runaway.js:274` | lock 고갈 = fail-**safe** degrade=1 (fail-open 금지), 단일 lock 임계구역 |
| Errors | `plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js:78` | `parseReviewPayload` → `null` = "읽을 수 없음" → caller가 fail-closed 처리 |
| Receipt meta | `plugins/mccp/scripts/receipt/schema.js:300` | present-only boolean meta (`codex_review_actionable_findings`) — 검증 + `schema.js:720` default |
| Tests | `plugins/mccp/scripts/lib/tests/pr-phase-helpers/codex-runner.test.js:60` | `stubCodexEnvelope(review)` — stub이 **실제 producer 계약**(envelope `.stdout` = companion JSON text)을 미러 |
| Tests | `plugins/mccp/scripts/lib/tests/orchestration-runaway.test.js` | 원자성 회귀 `[4,4,1,1,1]` 동시 예약 시퀀스 |
| CLI | `plugins/mccp/scripts/lib/orchestration-preview.js` (`require.main` 블록) | lib 모듈에 얇은 CLI를 붙여 command body가 Bash 한 줄로 호출 |
| Artifact 전달 | `plugins/mccp/commands/work.md:250-255` | Bash 호출 간 상태는 `$(git rev-parse --git-path mccp/tmp)` 하위 JSON 아티팩트로 전달 + stale `rm -f` |

## Ground (확인 근거)

### F1 — `isActionable` short-circuit (실측 확인)

`codex-runner.js:97-101` 현행:

```js
function isActionable(review, filteredFindings) {
  if (!review) return true;
  if (!APPROVING_VERDICTS.has(review.verdict.toLowerCase())) return true;  // ← filteredFindings 미검사
  return (filteredFindings || []).length > 0;
}
```

- `finalize-receipt.js:129` — `codexVerdict = raw === 'approve' ? 'converged' : 'divergent'`. 즉 raw `needs-attention`은 무조건 `divergent`.
- `codex-result-filter.js:88` — `impeccableAvailable !== true`면 필터는 **identity**(dropped=[]). 따라서 "전부 drop됨" 상태는 **impeccable 가용일 때만** 성립 — design-scope 계약의 전제와 정확히 일치한다. 이 사실이 수정 범위를 구조적으로 좁힌다.
- 차단 성격: `pr.md`에 `codex_actionable_findings` 기반 mechanical hard-stop은 **없다**(STATE.md "mechanical validate는 ok=true" 와 정합). 실제 피해는 **receipt가 `divergent`로 봉인 + PR body 합치 결론이 in-scope 근거 0인 채 non-approving** — 감사 기록의 정직성 결함이며, 사람/LLM의 차단 판단을 오도한다. 본 plan은 이 범위로 주장한다(“PR이 hard-block된다”로 과장하지 않음).

### F2 — 유령 예약 (실측 확인)

`orchestration-runaway.js:288` — `const launched = cur.launched + decision.n;` 를 결정 시점에 write. 주석(`:256`)도 "ALREADY counted — the caller must NOT call bumpCounter afterwards" 로 명시.

오라클 **내부**에서는 clamp가 run 경로에서만 호출된다(`implement-dispatch/budget.js:277`, `plan-fanout/budget.js:164`) — 즉 유령은 오라클 **바깥**, 예약과 실제 launch 사이에서 발생한다:

| 유령 경로 | 근거 |
|---|---|
| `prepare-fleet`/`emit-workflow-args` 실패 → `FLEET_N=1` 강등 | `work.md:232` |
| route가 `workflow-parallel` 아님(Workflow 미가용 → task) | `work.md:299-321` |
| fan-out in-sandbox budget pre-guard skip (0 agent spawn) | `plan.md:244` |
| Workflow 미가용/throw → 인라인 Pattern Grounding fallback | `plan.md:251` |

**Codex 권고 (b)(예약 지점을 최종 caller로 이동)는 구조적으로 불가**: clamp 결과가 `FLEET_N`을 1로 강등시키면 work.md는 partition 병렬이 아니라 **단일 worker가 plan 전체를 구현**하는 경로로 간다(`work.md:223-235`). 즉 clamp 결정이 `prepare-fleet`(파티션 준비)보다 **먼저** 필요하다. 예약을 launch 직전으로 옮기면 이미 4-partition으로 준비된 fleet에 grant=1이 내려와 3개 partition의 파일이 미구현으로 남는다(데이터 손실급 위험). → **(a) reserve/release 채택**.

(a)를 **2단계(pending → committed)** 로 구현한다. 초안은 lease 없는 "committed-by-default + 명시적 release"였으나 Plan-Codex R1이 3건의 실 결함을 짚어 폐기했다(아래 Codex Adversarial Review F1/F2/F3). 확정 설계:

**핵심 불변식 — reserve→route 창은 구조적으로 launch가 0이다.** `work.md:290`이 Step 3.route를 이미 "**worker를 spawn하기 전**" 경계로 명시하고(M2a Codex F1), 예약은 그보다 앞선 Step 3.prep-parallel에서 일어난다. 따라서:

| 상태 | 정의 | 만료 |
|---|---|---|
| **pending** | reserve 완료, route 미도달 | **만료 시 drop 안전** — 이 창에서는 worker가 뜬 적이 **없음**이 경계로 보장됨 |
| **committed** | route에서 실제 launch 수로 reconcile 완료 | **영구** — 실제 launch는 절대 미카운트되지 않음 |

이 분리가 초안의 lease 거부 논거("launch 후 commit 누락 → over-permissive")를 무력화한다 — 만료는 **launch가 불가능한 창에만** 적용되므로 over-permissive 실패가 구조적으로 생길 수 없다. 동시에 R1 F3("crash 시 세션이 N=1로 영구 자기중독")도 해소된다. 만료 pruning은 write-side lock 안에서 수행하며, `cost-state.js#decayIfStale`(v1.22.0 M3 — "튄 상태가 자동화를 영구 잠금"을 시간축으로 푼 검증된 선례)의 미러다.

**reconcile은 release가 아니라 실제 launch 수로의 정정이다** (R1 F2 흡수). route별:

| route | actualN | 근거 |
|---|---|---|
| `workflow-parallel` | granted 그대로 commit | N-worker 실제 발화 |
| `workflow-single` / `task` | **1** | prepare-fleet/emit 실패 강등이어도 **실제 단일 worker가 뜬다**(`work.md:232` → Step 3.prep) — 전량 release는 실 launch를 미카운트(over-permissive) |
| `inline` | **0** (전량 release) | worker 0 |
| fan-out `skipped:true` / Workflow 미가용 | **0** | agent 0 spawn이 계약상 보장 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js` | UPDATE | F1 — `isActionable` → `deriveEffectiveReview` 순수 오라클, `codex_scope_excluded_verdict` emit |
| `plugins/mccp/scripts/lib/tests/pr-phase-helpers/codex-runner.test.js` | UPDATE | F1 회귀 — 기존 `stubCodexEnvelope` 재사용(실 producer 계약) |
| `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js` | UPDATE | F1 — scope-excluded 시 verdict 매핑 + flag forward |
| `plugins/mccp/scripts/lib/tests/pr-phase-helpers/finalize-receipt.test.js` | UPDATE | F1 회귀 |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | F1 — `--codex-scope-excluded-verdict` → `meta` |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | F1 — present-only boolean meta 검증 + default |
| `plugins/mccp/scripts/lib/codex-review-payload.js` | CREATE | F5 — `codex-runner.js#parseReviewPayload` 승격: 구조화 `.result.verdict` 단일 파서 (plan/implement/pr 3게이트 공용 SoT) |
| `plugins/mccp/scripts/lib/tests/codex-review-payload.test.js` | CREATE | F5 — 산문에 `converged` 포함된 `needs-attention` → `divergent` 실측 fixture 회귀 |
| `plugins/mccp/scripts/lib/codex-bridge.js` | UPDATE | F5 — `parseVerdict`를 free-text fallback 전용으로 축소 + 구조화 우선 순서 명시 |
| `plugins/mccp/scripts/lib/orchestration-runaway.js` | UPDATE | F2 — `reservationId` + `reconcileReservation` + lease pruning + `reconcile` CLI |
| `plugins/mccp/scripts/lib/tests/orchestration-runaway.test.js` | UPDATE | F2 회귀 + 원자성 `[4,4,1,1,1]` 유지 |
| `plugins/mccp/scripts/lib/tests/orchestration-preview.test.js` | UPDATE | F2 — read-only 정적 불변식 denylist에 신규 mutating 심볼 추가 |
| `plugins/mccp/commands/work.md` | UPDATE | F2 — reservationId 아티팩트 + route 기반 단일 release 지점 |
| `plugins/mccp/commands/plan.md` | UPDATE | F2 — reservationId 아티팩트 + 2.5.3 skip release |
| `plugins/mccp/commands/pr.md` | UPDATE | F1 — scope-excluded 시 PR body 정직 표면 |
| `CLAUDE.md` | UPDATE | 두 축 문서화 (§1.4 M3 행 + §4 토글) |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | implement-codex MEDIUM(scope-excluded 불투명 차단) → F1로 해소 표기 |

> `plugins/mccp/.claude-plugin/plugin.json`은 **의도적 미변경** — Risks 표 참조.

## Tasks

### Task 1: F1 — `deriveEffectiveReview` 순수 오라클
- **Action**: `codex-runner.js`의 `isActionable`을 `deriveEffectiveReview(review, filtered)` → `{ actionable, scopeExcluded }` 로 대체(export). 판정 순서:
  1. `!review` → `{actionable:true, scopeExcluded:false}` — 읽을 수 없는 review는 승인 증명 불가(**fail-closed 유지, 절대 완화 금지**)
  2. approving verdict → `{actionable: survivors.length > 0, scopeExcluded:false}` — 기존 경로 **무변경**
  3. non-approve + `survivors.length > 0` → `{actionable:true}` — 일부만 drop된 경우 여전히 차단
  4. non-approve + itemized finding **0개** → `{actionable:true}` — 근거 없는 non-approve는 신뢰 불가
  5. non-approve + survivors 0 + dropped > 0 → `{actionable:false, scopeExcluded:true}`
- **Mirror**: `parseReviewPayload` (null = 읽기 실패 → caller fail-closed)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/pr-phase-helpers/codex-runner.test.js`

### Task 2: F1 — runner 출력에 `codex_scope_excluded_verdict` 추가
- **Action**: `runMain`이 `deriveEffectiveReview` 결과로 `codexActionableFindings` 를 채우고, 신규 `codex_scope_excluded_verdict: <bool>` 를 emit JSON에 추가. `codex_verdict` 는 **raw 그대로 유지**(정직성 — 모델이 실제로 뭐라 했는지 보존).
- **Mirror**: `codex-runner.js:347` 의 `codex_design_scope_excluded` 등 scope audit 필드 4종과 같은 자리
- **Validate**: 위와 동일

### Task 3: F1 — receipt forward (finalize-receipt + write + schema)
- **Action**:
  - `finalize-receipt.js#deriveCodexFlags`: `codex_outcome==='invoked'` && raw non-approve && `codex_scope_excluded_verdict===true` → `codexVerdict='converged'` + `--codex-scope-excluded-verdict` + **`--codex-raw-verdict "<raw>"`** push. 그 외 매핑 무변경.
  - `write.js`: `meta.codex_scope_excluded_verdict` (boolean) + **`meta.codex_raw_verdict`** (present-only string) 추가 (`codex_review_actionable_findings:203` 미러).
  - `schema.js`: 두 필드 present-only 검증(`:300` 미러) + default 블록(`:720`) 추가.
- **근거**: `resolution.codex_verdict` = 게이트의 **실효 결과**, `meta.*` = raw provenance.
- **`meta.codex_raw_verdict`는 R1 MEDIUM 흡수** — Codex 지적대로 `write.js:131`이 `codex_verdict`를 "the real Codex adversarial-review verdict"로 **계약**하므로, raw `needs-attention`을 `converged`로 덮으면 **봉인된 receipt에서 기계 판독 가능한 raw verdict가 소실**되고 설명이 PR body/tmp 같은 out-of-band에만 남는다. raw를 meta에 병기하면 실효 verdict와 원자료가 **한 receipt 안에서 둘 다 기계 판독 가능**해진다(Codex의 명시 대안 "If `resolution.codex_verdict` remains effective, persist `meta.codex_raw_verdict`"를 그대로 채택). 기존 `dropped_findings_digest` / `design_findings_dropped` / `a11y_routed_to_impeccable`가 무엇이 drop됐는지 재현하므로 감사 체인이 완결된다. `CODEX_VERDICT_VALUES` enum은 **미변경**(같은 vocabulary를 쓰는 `meta.merged_verify_verdict` 파급 회피 + 마이그레이션 불필요).
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/pr-phase-helpers/finalize-receipt.test.js` + `node --test plugins/mccp/scripts/receipt/tests/`

### Task 4: F1 — 회귀 test (stub 충실도 필수)
- **Action**: 기존 `stubCodexEnvelope`로 신규 케이스 추가. `MCCP_IMPECCABLE_SKILL=available` (`impeccable-detect.js:135`)로 필터를 강제 활성:
  - `needs-attention` + findings 전부 design/a11y → `actionable=false`, `scope_excluded=true`
  - `needs-attention` + design 1 + security 1 (부분 drop) → `actionable=true`, `scope_excluded=false` ← **회귀 가드**
  - `needs-attention` + findings 0 → `actionable=true` (기존 `STUB_CODEX_NEEDS_ATTENTION_NO_FINDINGS` 유지)
  - unreadable → `actionable=true` (기존 `STUB_CODEX_UNREADABLE` 유지)
  - `MCCP_IMPECCABLE_SKILL=missing` + `needs-attention` + design finding → 필터 identity → `actionable=true` ← **차단 완화 없음 증명**
- **Mirror**: `codex-runner.test.js:50-59` 주석 계약 — stub은 구현이 아니라 **producer**를 미러
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/pr-phase-helpers/codex-runner.test.js`

### Task 5: F2 — 2단계 예약 lifecycle (`reserveWorkers` + `reconcileReservation`)
- **Action**: counter body에 `open: [{id, n, at}]` 추가(back-compat: 부재 → `[]`). `launched` = committed + pending 합(cap이 보는 값, 보수적).
  - `reserveWorkers` → 반환에 `reservationId` 추가. **단일 lock 임계구역 안에서** stale pruning + clamp 결정 + `launched += granted` + `open.push({id,n,at})` 를 함께 write(**원자성 불변식 유지 — M3 Codex F2가 봉인한 TOCTOU 되살리지 말 것**).
  - 신규 `reconcileReservation({sessionId, reservationId, actualN, statePath?})` → `{reconciled, delta, launched}`. 같은 lock 패턴. `open`에서 id 탐색 → 있으면 `launched += (actualN - n)` + `open`에서 제거(= **commit**, 이후 만료 대상 아님). 없으면 **멱등 no-op**. `actualN=0`이 전량 release.
  - **stale pruning** (R1 F3 흡수): write-side lock 안에서 `at`이 `MCCP_ORCHESTRATION_RESERVATION_LEASE_MS`(default 600000 = 10분)보다 오래된 **pending** 항목을 `launched`에서 차감 후 제거. committed는 `open`에 없으므로 절대 만료 안 됨. **건전성 근거**: pending 창(reserve→route)은 `work.md:290`의 pre-invocation 경계상 launch가 0이므로 drop이 over-permissive를 만들 수 없다.
  - lock 고갈 시 `reserveWorkers`는 `reservationId:null` (fail-safe degrade=1 유지 — 예약 기록이 없으니 reconcile 대상도 없음). `reconcileReservation`은 `reconciled:false` + loud warn(보수적 — 계속 카운트되고 lease가 자기치유).
- **Mirror**: `bumpCounter:218` / `reserveWorkers:263` lock + 원자 tmp+rename · `cost-state.js#decayIfStale` (시간축 자기치유) · `parseMaxAgents:83` loud fail-open env parse
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/orchestration-runaway.test.js`

### Task 6: F2 — `reconcile` CLI
- **Action**: `orchestration-runaway.js`에 `require.main` CLI 추가: `reconcile --reservation <id> --actual <n> [--session <id>]` → JSON `{reconciled, delta, launched}`. exit 0 고정(**reconcile 실패가 pipeline을 막으면 안 됨** — 실패는 보수적 over-count이고 lease가 자기치유).
- **Mirror**: `orchestration-preview.js` 의 `require.main` CLI 블록
- **Validate**: 임시 statePath로 reserve → reconcile → `readCounter().launched` 확인

### Task 7: F2 — 회귀 test
- **Action**:
  - 기존 원자성 `[4,4,1,1,1]` 시퀀스 **green 유지**(반환에 `reservationId`만 추가되므로 무변경이어야 함)
  - reserve(4) → reconcile(actualN=0) → `launched` 0 복귀
  - reserve(4) → reconcile(actualN=1) → `launched` 1 ← **R1 F2 회귀 가드**(실 단일 worker 카운트 보존)
  - reserve(4) → reconcile(actualN=4) → `launched` 4 무변경 (parallel commit)
  - 이중 reconcile → 멱등(두 번째 `reconciled:false`)
  - 알 수 없는/`null` id → no-op
  - reserve(4) → reconcile(0) → reserve(4) 성공 (headroom 실제 회수)
  - **lease 만료**: pending을 과거 `at`으로 seed → 다음 reserve가 prune → headroom 복귀 ← **R1 F3 회귀 가드**
  - **commit은 만료 안 됨**: reconcile(1) 후 lease 경과 → `launched` 1 유지 ← **over-permissive 방지 가드**
  - lease=0/비정상 → default + loud warn
  - legacy counter(`open` 필드 없음) + reconcile → no-op, `launched` 무변경
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/orchestration-runaway.test.js`

### Task 8: F2 — preview read-only 불변식 확장
- **Action**: `orchestration-preview.test.js` 의 정적 mutating-심볼 denylist에 `reconcileReservation` 추가(기존 `reserveWorkers`/`bumpCounter`와 동일 취급). preview는 계속 pure `clampForRunaway`만 사용 — **관측이 headroom을 소비하면 안 된다**. `readCounter`는 read-side라 계속 허용하되, lease pruning은 **write-side에서만** 수행하므로 preview가 counter를 변형하지 않음을 확인(readCounter는 만료된 pending을 뷰에서 제외해 계산만 할 뿐 write 안 함).
- **Mirror**: `orchestration-preview.js:26-38` read-only 불변식 주석
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/orchestration-preview.test.js`

### Task 9: F2 — `work.md` 예약 아티팩트 + route reconcile 지점
- **Action**:
  - Step 3.prep-parallel: inline `node -e` 의 `runawayClamp` 클로저가 `res.reservationId` 를 캡처해 emit JSON에 합류(`Object.assign({}, r, {reservationId})`) — **오라클 시그니처 불변**(pure/injected 유지). `$GITDIR/dispatch-fleet-reservation.json` 으로 영속.
  - **stale clear는 Step 3.prep-parallel 진입부**(= 새 예약 생성 **직전**)에서만 수행한다. **Step 3.prep(`work.md:253`)의 `rm -f` 목록에는 절대 넣지 않는다** ← **R1 F1 흡수**: prep-parallel(L147) → prep(L246) → route(L288) 순서상, prep에서 지우면 방금 만든 예약 토큰이 유일한 reconcile 지점(route)에 닿기 전에 사라져 reconcile이 no-op이 되고 유령이 그대로 남는다.
  - Step 3.route: 예약이 존재하면 `$ROUTE`별 `reconcile --actual N` 호출 후 아티팩트 제거 — `workflow-parallel`→granted, `workflow-single`/`task`→**1**, `inline`→**0**. **이 한 지점이 prepare 실패·route fallback 두 유령을 모두 덮는다**(route가 launch 직전 마지막 결정이므로).
- **Validate**: 합성 harness (LLM 0회) — (1) reserve → prepare 실패 시뮬 → route=`task` → reconcile(1) → `launched==1` (**R1 F1+F2 동시 회귀 가드**), (2) reserve → route=`workflow-parallel` → reconcile(4) → `launched==4`

### Task 10: F2 — `plan.md` 예약 아티팩트 + 2.5.3 reconcile
- **Action**:
  - 2.5.1: 동일 클로저 캡처 → `<gitdir>/mccp/tmp/fanout-reservation.json` (stale clear는 이 지점에서만).
  - 2.5.3: **`skipped:true`**(in-sandbox budget pre-guard — 0 agent spawn이 계약상 보장) 또는 **Workflow 미가용**(호출 자체가 없었음) → `reconcile --actual 0`. **throw는 reconcile 안 함**(agent가 이미 spawn됐을 수 있음 → 보수적 유지, lease는 commit 안 된 pending에만 적용되나 이 경우는 launch 가능성이 있으므로 `--actual <granted>`로 명시 commit). `coverage===0`도 `--actual <granted>` commit(agent가 돌고 실패했을 수 있음).
  - **주의**: fan-out은 work.md와 달리 route 경계가 없다 — Workflow 호출 자체가 launch 지점이므로, 호출 **후** 경로는 전부 명시 commit이 필요하다(pending 만료에 맡기면 실제 spawn된 agent가 미카운트되어 over-permissive).
- **Validate**: 합성 harness — reserve → `skipped:true` → reconcile(0) → `launched` 0 복귀 · reserve → throw → reconcile(granted) → `launched` 유지

### Task 11: F1 — `pr.md` 정직 표면 (review-only 유지)
- **Action**: 2.5.4 `## Codex Adversarial Review` 구성 시, `codex_scope_excluded_verdict=true` 이면 raw verdict + scope-excluded 사유를 **명시**한다(예: `- 합치 결론: Codex raw verdict=needs-attention이나 itemized finding <N>건이 전부 design/a11y로 scope-excluded → in-scope 이의 0건`). 은폐 금지 — 사람이 감사 시 무엇이 drop됐는지 `dropped_findings_digest`로 재현 가능해야 한다.
- **Mirror**: `pr.md:504` 의 auto-fallback 정직 표면(`> Codex unavailable, skipped`) 패턴
- **불변식**: `/mccp:pr`는 review-only — Edit/Write 호출 금지(§3.9 / `pr-phase-guard.js`). 본 변경은 body 텍스트 구성만.
- **Validate**: `grep -n "scope_excluded" plugins/mccp/commands/pr.md`

### Task 12: F5 — plan/implement 게이트의 verdict blindness (본 게이트에서 실측 발견)
- **현상**: `plan.md` Phase 5.2 / `prp-implement.md`가 `$CODEX_VERDICT`를 `codex-bridge.parseVerdict`(free-text 키워드 스캔)로 파생한다. `parseVerdict`(`codex-bridge.js:98-109`)에는 **`needs-attention` 키워드가 없고**, L101 `/\bconverged\b/i`가 응답 **산문 어디에나** 있는 단어 `converged`를 잡는다. 구조화된 verdict(`.result.verdict`)는 **읽지 않는다**.
- **실측**: 본 plan의 R1(verdict=`needs-attention`, summary=`"No ship: ..."`, findings 4)에 대해 `parseVerdict` → **`converged`**. 원인은 Codex의 MEDIUM finding 본문에 포함된 문장 *"finalize-receipt.js explicitly calls stamping `converged` for a \"No ship\" review an integrity bug"* — **"converged로 찍으면 무결성 버그"라는 경고문을 읽고 converged로 찍었다.**
- **왜 HIGH인가**: F1(PR 게이트 blindness)과 **동일 계열이나 파급이 더 크다**. plan/implement receipt의 `resolution.codex_verdict`는 cross-gate dedupe(`dedupe.js:374` `=== 'converged'`)의 입력이므로, 거짓 `converged` 2개면 `/mccp:pr`이 PR-Codex를 **통째로 skip** → **dual-review 완전 우회**. v1.20.3이 `resolution.converged` always-true 결함을 닫으며 세운 fail-closed 계약을 free-text 스캔이 우회시킨다.
- **`codex-runner.js:70-72` 주석 자기모순 확인**: "plan.md / prp-implement.md already parse `.stdout` correctly (via codex-bridge.parseVerdict)" 라고 적어놓고 두 줄 뒤 "parseVerdict is a free-TEXT keyword scan and does NOT recognize the STRUCTURED verdict vocabulary, so it cannot be reused here" 라고 부정한다. 후자가 맞다 — M3가 PR 게이트만 고치고 plan/implement은 blind인 채 "correct"로 오기했다.
- **Action**: `codex-runner.js#parseReviewPayload`를 공용 모듈로 승격(예: `scripts/lib/codex-review-payload.js`)해 `plan.md` / `prp-implement.md`가 **동일 구조화 파서**로 `.result.verdict`를 읽게 한다. 매핑은 `finalize-receipt.js:129` 규칙 재사용(`approve`→`converged`, 그 외→`divergent`, 파싱 실패→`unavailable` fail-closed). `parseVerdict`는 구조화 verdict가 없는 legacy/free-text 경로 전용으로 축소하고, 우선순위를 **구조화 우선 → free-text fallback**으로 명시.
- **Mirror**: `codex-runner.js:78` `parseReviewPayload` (null = 읽기 실패 → fail-closed) · `finalize-receipt.js:118-131` OUTCOME_TO_VERDICT 매핑
- **회귀 가드**: 산문에 `converged`/`approve`가 포함된 `needs-attention` 응답 → `divergent` (본 실측 케이스를 fixture로 고정) · `approve` + 산문에 `divergent` 포함 → `converged` · stdout 파싱 실패 → `unavailable`
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/` (신규 payload 파서 test + 기존 codex-bridge test green 유지)

### Task 13: 문서 + backlog
- **Action**: `CLAUDE.md` §1.4 M3 행에 두 흡수 추가, §4 `MCCP_ORCHESTRATION_MAX_AGENTS` 설명에 reserve/release 계약 반영. backlog의 implement-codex MEDIUM("scope-excluded finding만으로 non-approve 시 불투명 차단")을 F1 해소로 표기.
- **Validate**: `grep -n "reservationId\|scope_excluded" CLAUDE.md`

## Validation

```bash
# 오라클 + 헬퍼 회귀 (LLM 0회)
node --test plugins/mccp/scripts/lib/tests/orchestration-runaway.test.js
node --test plugins/mccp/scripts/lib/tests/orchestration-preview.test.js
node --test plugins/mccp/scripts/lib/tests/pr-phase-helpers/
node --test plugins/mccp/scripts/receipt/tests/

# M3 기존 회귀 (fleet 48 / fanout 37 / auto-chain 21) — 본 변경은 이 축을 안 건드림
node --test plugins/mccp/scripts/lib/tests/

# 변경 모듈 import 스모크
node -e "require('./plugins/mccp/scripts/lib/orchestration-runaway'); \
         require('./plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner'); \
         require('./plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt'); \
         require('./plugins/mccp/scripts/receipt/schema'); console.log('ok')"

# F2 end-to-end (합성, 임시 statePath — 실제 세션 카운터 미오염)
node plugins/mccp/scripts/lib/orchestration-runaway.js release --reservation <id> --session <sid>
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| F1이 실제 차단을 완화해 dual-review invariant를 침해 | Medium | 완화 경로는 4중 AND(impeccable 가용 ∧ review 파싱 성공 ∧ itemized finding > 0 ∧ survivors == 0)에서만. unreadable/근거없는 non-approve/부분-drop 3종 fail-closed는 test로 고정(Task 4) |
| `codex_verdict='converged'` 매핑이 raw `needs-attention`을 은폐 | Medium | **R1 F4 흡수** — `meta.codex_raw_verdict`가 봉인 receipt에 raw를 기계 판독 가능하게 병기 + `meta.codex_scope_excluded_verdict`가 사유 + 기존 `dropped_findings_digest`가 증거. runner 출력·PR body에도 정직 표면(Task 2/11) |
| reconcile 호출 누락 → 유령 잔존 | Medium | **R1 F3 흡수** — pending lease(10분)가 자기치유. 만료가 안전한 이유는 pending 창이 route 경계상 launch-free이기 때문(Ground 참조). route 기반 **단일** reconcile 지점이라 누락 표면이 최소 |
| lease 만료가 실제 launch를 미카운트(over-permissive) | Medium | 구조적 차단 — 만료는 **pending에만** 적용되고 pending 창(reserve→route)은 `work.md:290` 경계상 launch 0. route 도달 시 즉시 commit되어 만료 대상에서 제외. fan-out은 route 경계가 없어 호출 후 전 경로를 명시 commit(Task 10). Task 7에 "commit은 만료 안 됨" 회귀 가드 |
| markdown command body는 test 불가 → reconcile 미발화 | Medium | reconcile 로직 자체는 CLI(Task 6) + 오라클(Task 5) test로 고정. body는 route 오라클 출력에만 의존하는 1줄 조건. 미발화해도 lease가 자기치유(보수적 → 자동 복구) |
| lease 창(10분)이 실제 reserve→route 지연보다 짧음 | Low | 정상 창은 Bash 3회 + LLM 턴(수초~수십초) — 10분은 관대. 초과 시에도 방향은 under-count(M3 이전 status quo)이고 `MCCP_ORCHESTRATION_RESERVATION_LEASE_MS`로 조정 가능 |
| `plugin.json` 미bump | Low | **의도**: 본 사이클은 미머지 M3 PR의 흡수 커밋이며 별도 ship이 아님. 1.22.3이 흡수 포함 M3 내용을 계속 정확히 라벨링(§3.7 "이 변경이 PRD의 마지막 milestone인가" → 이미 1.22.3으로 카운트됨). 선례: 같은 브랜치 `ca48678` follow-up도 미bump |
| `open[]` 무한 증가 | Low | 구조적 유계 — `launched ≤ maxAgents(24)` 이고 예약당 `n ≥ 1` 이므로 open ≤ 24. release 시 즉시 제거 |

## Acceptance

> **정정 (Implement-Codex R1 F4 흡수)**: 아래 첫 항목의 원안은 **철회**됐다. `codex_actionable_findings=false` + `codex_verdict='converged'`(= scope-excluded PASS)는 producer에 scope 필드가 없어 근거가 불건전하다는 것이 게이트에서 실측 반증됐다. 기준을 실제 채택안으로 대체하고, 원안은 취소선으로 남겨 감사 추적을 보존한다.

- [x] ~~F1: non-approve + 전부 scope-excluded → `codex_actionable_findings=false` + receipt `codex_verdict='converged'`~~ **철회 (R1 F4)** → 대체 기준: non-approve + 전부 scope-excluded → `codex_actionable_findings=**true**`(non-approving 유지) + receipt `codex_verdict='**divergent**'`(정직 봉인, dedupe fail-closed) + `meta.codex_scope_excluded_verdict=true` + `meta.codex_raw_verdict='needs-attention'`(R1 F4 provenance) + PR body가 raw verdict·drop 건수·라우팅 소유자 명시
- [x] F1: 부분 drop / findings 0 / unreadable / impeccable 미가용 4종 모두 `actionable=true` 유지 (회귀 가드)
- [x] F1: stub이 실제 codex-invoke envelope 형태(`stubCodexEnvelope`) 사용 — 구현 가정 인코딩 0
- [x] **F1 전제 복구 (계획 외, 승인)**: 필터가 실 producer finding(`{severity,title,body,…}`)을 매칭 — 없었다면 `dropped>0`이 불가해 F1 전체가 죽은 코드
- [x] **in-scope veto (자체 발견 → R1 F4가 한계 지적)**: design 제목의 보안 finding이 drop되지 않음. 단 veto만으로는 불충분함이 반증돼 PASS 자체를 철회
- [x] F2: 원자성 회귀 `[4,4,1,1,1]` green 유지 (TOCTOU 재발 없음)
- [x] F2: reserve → reconcile(0) → 동일 headroom 재예약 성공
- [x] F2: reserve(4) → reconcile(**1**) → `launched==1` — 실 단일 worker 카운트 보존 (R1 F2)
- [x] F2: prepare 실패 → route=`task` 경로에서 예약 토큰이 **살아남아** reconcile 성립 (R1 F1)
- [x] F2: pending lease 만료 → headroom 자동 복구 / **committed는 만료 안 됨** (R1 F3 + over-permissive 방지)
- [x] F2: lock 고갈 → degrade=1 fail-safe 유지 (fail-open 아님)
- [x] F2: preview read-only 정적 불변식 green (`reconcileReservation` 등 mutating 심볼 denylist 포함)
- [x] **F2 추가 (Implement-Codex R1 F1)**: reconcile 미commit + `actualN>0` → CLI exit 11 + caller가 재시도 후 fail-closed HALT (실 worker 미카운트 방지)
- [x] **F2 추가 (Implement-Codex R1 F2)**: lease 경과 후에도 명시 reconcile이 자기 id를 raw에서 찾아 commit — 명시 증거가 lease 추측을 이김
- [x] F5: 산문에 `converged`가 포함된 `needs-attention` 응답 → `divergent` (본 사이클 실측 fixture) — **4게이트**(plan/implement/pr/**merged-verify**)가 동일 구조화 파서 사용
- [x] F5: `plan.md` / `prp-implement.md` 의 `$CODEX_VERDICT` 파생이 `.result.verdict` 기반 (free-text 스캔은 fallback 전용)
- [x] **F5 추가 (Implement-Codex R1 F3)**: free-text fallback은 `divergent`만 발급 — **`converged` 발급 불가**(schema drift 시 F5 부활 차단)
- [x] **F5 확장 (계획 외, 승인)**: `implement-dispatch/verify.js`(merged-verify, default enforce)도 동일 blindness → 실측 R1을 `converged`로 통과시키던 것을 `divergent`+HALT로
- [x] 전체 회귀 green — **1125 중 1120 pass / 1 fail** (`design-critique-loop-e2e` F) fixture 부재; 변경 24개 파일 stash 상태에서 동일 실패로 **pre-existing 증명**. plan이 예측한 `verdict-label.test.js`는 `lib/renderer/tests/`라 이 회귀 범위 밖 — 별도 pre-existing 1건)
- [x] Patterns mirrored, not reinvented

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review --impeccable-available` (fail-closed Bash wrapper, v0.2.2) · class=`ok` · exit=0 · blocking=0
- 라운드 수: 1 (R1) — cap `MCCP_GATE_ROUND_CAP=1`. R2 미escalate: 5.4 (b) 조건 불충족(4건 모두 R1에서 완전 해소, 아래 자기증명 참조)
- 합치 결론: R1 verdict `needs-attention` — "No ship: the plan still has concrete F2 accounting holes and overloads the sealed Codex verdict field in a way that weakens audit integrity." **4건 전부 실제 코드로 재확인 후 흡수** → 흡수 후 DIVERGENT_UNRESOLVED 없음
- Codex session 참조: threadId `019f64d7-4a3b-7413-88ef-7704263c14de`

- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — Step 3.prep cleanup이 route 전에 예약 토큰 삭제 (0.91) | HIGH | ACCEPT_NOW | **실재**. `work.md` 순서 prep-parallel(L147) → prep(L246 `rm -f`) → route(L288). 초안 Task 9가 문자 그대로 "prep의 stale 목록에 추가"라 예약이 유일 reconcile 지점 전에 소멸 → 유령 잔존. 자초한 버그 |
  | F2 — 전량 release가 실 단일 worker launch를 미카운트 (0.86) | HIGH | ACCEPT_NOW | **실재**. `work.md:232` RUN=1 + prepare-fleet 실패 → `FLEET_N=1` → Step 3.prep가 **실제 단일 worker를 띄운다**. 초안의 "단일 경로는 원래도 미카운트" 논거는 run:**false** 케이스에만 참 → 전량 release는 over-permissive. 초안이 스스로 천명한 보수적 방향과 자기모순 |
  | F3 — release 누락 시 복구 경로 없음, 세션 N=1 자기중독 (0.88) | HIGH | ACCEPT_NOW | **실재**. `readCounter:176`은 missing/corrupt/다른 session에서만 리셋 — 세션 내 만료 없음. cap이 primary backstop인데 자기중독은 M3 주장을 반대 방향으로 훼손 |
  | F4 — scope-excluded 매핑이 봉인된 raw verdict 훼손 (0.84) | MEDIUM | ACCEPT_NOW | **실재**. `write.js:131`이 `codex_verdict`를 "the real Codex adversarial-review verdict"로 계약 → `converged` 덮어쓰기는 계약 위반 + 봉인 receipt에서 raw의 기계 판독성 소실. 흡수가 저렴(present-only meta 1개)이라 backlog 이연 불필요 |

- Deferred to backlog: 0 → `.claude/plans/codex-findings-backlog.md` (해당 없음)
- Open Questions: 없음 (DIVERGENT_UNRESOLVED 아님)

- **F5 — 본 게이트 실행 중 자체 발견 (Codex 지적 아님, provenance 정직 표기)**:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F5 — plan/implement 게이트가 free-text 스캔으로 verdict 파생 → dual-review 우회 | HIGH | ACCEPT_NOW | Phase 5.2의 `$CODEX_VERDICT` 파생 단계에서 **실측 발현**. `parseVerdict`가 본 R1(`needs-attention`/"No ship"/findings 4)에 **`converged`** 를 반환 — Codex의 MEDIUM finding 본문에 있던 단어 `converged`("converged로 찍는 건 무결성 버그"라는 **경고문**)를 키워드로 오인. F1과 동일 계열이나 dedupe 입력이라 파급이 더 큼. Task 12 참조 |

  이 발견 때문에 본 receipt의 `codex_verdict`는 `parseVerdict` 출력(`converged`)을 **쓰지 않고** 구조화 verdict(`.result.verdict='needs-attention'`)에 `finalize-receipt.js:129` 규칙을 적용한 **`divergent`** 로 기록한다. 결과적으로 `/mccp:pr`에서 cross-gate dedupe가 fail-closed → PR-Codex가 실제 diff를 리뷰한다(안전 방향, STATE.md의 직전 사이클과 동일 패턴).

**R1 자기증명 (5.4 (b) — "R1 흡수로 완전 해소됐는가")**:

- **F1** → stale clear를 Step 3.prep-parallel **진입부**(새 예약 생성 직전)로 한정하고 Step 3.prep `rm -f` 목록에서 **명시적으로 배제**. Task 9 Validate에 "prepare 실패 → route에서 reconcile 성립" 합성 harness 회귀를 고정.
- **F2** → 전량 release를 폐기하고 `reconcileReservation(id, actualN)`으로 대체. route별 actualN 표(`workflow-single`/`task`→**1**)를 Ground에 명문화 + Task 7에 `reconcile(actualN=1) → launched==1` 회귀 가드.
- **F3** → Codex의 1안(two-phase: pending은 launch/commit 마커 전까지만 만료, committed는 불멸)을 채택. **건전성 근거는 초안에 없던 것**: `work.md:290`이 route를 이미 "worker를 spawn하기 전" 경계로 명시하므로 pending 창(reserve→route)은 **구조적으로 launch가 0** → 만료-drop이 over-permissive를 만들 수 없다. 초안의 lease 거부 논거가 이 경계 앞에서 무효화됨을 확인. `cost-state.js#decayIfStale` 선례 미러.
- **F4** → Codex가 명시한 대안("If `resolution.codex_verdict` remains effective, persist `meta.codex_raw_verdict`")을 그대로 채택. enum 확장(`merge_verify_verdict` 파급) 대신 present-only meta 2개.

## Design Critique

- 트리거: detector `design_signal=true` (`signal_files: ["plugins/mccp/scripts/receipt/write.js"]` — **브랜치 diff**의 `DESIGN_SURFACE_PATHS` whitelist hit이며, 본 plan이 도입하는 표면이 아님). SKILL first-step Read 이행: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints`.
- routing mode: `auto` · retry cap: 2
- 라운드 수: 1 (R0)
- verdict: **CONVERGED** (`decideCritique({findings: [], round: 0, cap: 2})`)
- 근거: `Files to Change` 14개 항목이 전부 control-plane (`.js` 오라클 · `.test.js` · slash-command `.md` body · `CLAUDE.md` · backlog). SKILL.md가 정의한 rendered surface(`.css/.scss` · `.tsx/.jsx/.vue/.svelte/.astro` · `.html` · `.claude/cache/*.md`)에 해당하는 파일 0개 → 4개 Output Constraints의 적용 대상이 없어 findings empty. plan body 자체는 generic `.md`(prp-implement 소비용)라 rendered surface 아님 — `list-of-N` collapse 제약 비적용.
- 기계적 self-check: heading depth ≤ 3 (H15) 위반 0 · raw markdown marker(MD0xx) 0.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더 UI가 없어 **어떤 impeccable 명령도 invoke하지 않는다** — 아래는 구현자를 위한 체크리스트다. 본 사이클은 rendered surface를 도입하지 않으므로 implement 단계에서도 `renderingSurface=0`으로 refine/discovery는 recommend로 강등될 것으로 예상된다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Open Questions

R1에서 CRITICAL/DIVERGENT_UNRESOLVED 없음. 아래는 구현 중 확인할 잔여 항목이며 게이트 차단 사유가 아니다.

- **`resolution.codex_verdict='converged'` 소비처 (LOW)**: cross-gate dedupe는 plan-codex + implement-codex만 읽으므로(`dedupe.js:420-431`) pr-codex receipt의 converged는 dedupe에 무영향 — Codex R1도 독립 조사에서 같은 결론("I found no current dedupe consumer for `mccp-pr-codex` beyond plan/implement receipts"). 구현 시 validate-cmd 등 다른 소비처 부재를 grep으로 재확인.
- **lease 기본값 10분 (LOW)**: 실측 reserve→route 지연 데이터가 없어 보수적 추정치. 운영 중 조정 가능(`MCCP_ORCHESTRATION_RESERVATION_LEASE_MS`). 초과 시 방향은 under-count(M3 이전 status quo)라 안전.

## Codex Implementation Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review --impeccable-available` (fail-closed Bash wrapper, v0.2.2) · class=`ok` · exit=0 · blocking=0
- 라운드 수: 1 (R1) — cap `MCCP_GATE_ROUND_CAP=1`. R2 미escalate: 4건 전부 R1에서 완전 해소(아래 자기증명)
- 합치 결론: R1 verdict `needs-attention` — "No ship: the change still has concrete paths that silently weaken the runaway cap and can still stamp false Codex convergence." **4건 전부 실제 코드로 재현 후 흡수**
- Codex session 참조: threadId `019f6526-3523-7c81-bcf9-d006d11bd9b1`
- 순서 이탈(정직 기록): 본 게이트는 Phase 2.5가 아니라 **Phase 3 EXECUTE 이후** 실행됐다. F1 전제 붕괴 발견 → 사용자 승인 우회로를 타면서 2.5를 건너뛴 누락이며, 커밋 전이라 흡수 비용은 동일했다.

- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — reconcile 실패가 launch 전에 성공으로 보고됨 | HIGH | ACCEPT_NOW | **실측 재현**. lock 고갈 시 `reconciled:false`인데 CLI exit 0 → work.md가 토큰을 `rm -f`하고 4 worker 발화 → lease 만료가 **실제 worker를 미카운트**(over-permissive). 내 "reconcile 실패는 무해" 전제가 actualN>0에서 거짓 |
  | F2 — lease 경과 후 명시 reconcile이 자기 id를 못 찾음 | HIGH | ACCEPT_NOW | **실측 재현**. `reconcileReservation`이 lease-applied view를 먼저 읽어 자기 예약이 pruned → no-op. fan-out이 10분 초과 시 실제 spawn된 agent가 미카운트 |
  | F3 — free-text fallback이 malformed review를 converged로 승인 | HIGH | ACCEPT_NOW | **실측 재현**. schema drift 시 산문의 `converged`가 승인 발급 → dedupe가 PR-Codex skip. F5가 죽이려던 버그를 fallback이 그대로 살려둠 |
  | F4 — title 키워드 drop이 여전히 in-scope finding을 제거 | HIGH | ACCEPT_NOW | **실측 재현**. `"Brand asset loader reads arbitrary local files"` → veto 미매칭 + `\bbrand\b` → drop → survivors 0 → PASS. 유한 veto로 부정을 증명하려던 설계 자체가 불건전 |

- Deferred to backlog: 0
- Open Questions: 없음 (DIVERGENT_UNRESOLVED 아님)

**R1 자기증명 (5.4 (b) — "R1 흡수로 완전 해소됐는가")**:

- **F1** → CLI exit을 actualN에 따라 분기(`actualN>0` ∧ `reconciled:false` → exit 11). work.md는 3회 재시도 후 **fail-closed HALT**(토큰 보존 — 지우면 launch 추적 불가), plan.md는 launch 이후라 halt 무의미 → 토큰 보존 + loud warn(fan-out은 plan을 막지 않는다). 회귀: exit 11/0 양방향 + actualN=0은 여전히 무해.
- **F2** → `readCounterRaw`(lease 미적용) 분리. reconcile은 **자기 id를 raw에서 먼저 찾고** 나머지에만 expiry 적용 — 명시 증거가 lease의 추측을 이긴다. 회귀: lease 경과 후 `reconcile(4)` → `launched==4` 유지 + 타 예약은 여전히 prune.
- **F3** → fallback은 `divergent`/`critical`만 발급, **`converged` 발급 불가**(그 외 전부 `unavailable`). "스캔은 의심을 제기할 수는 있어도 승인을 증명할 수는 없다". 이전에 이 동작을 고정하던 내 test를 새 계약으로 교체.
- **F4** → **PASS 매핑 자체를 철회**. `deriveEffectiveReview` 규칙 5가 `actionable:true`(non-approving 유지) + `scopeExcluded:true`(설명 신호)를 반환하고, `finalize-receipt`는 verdict를 덮지 않는다(raw `divergent` 봉인 — dedupe 키이므로 거짓 converged 금지). 원래 backlog 불만이 **"불투명 차단"**이었으므로 상태는 두고 불투명함만 제거 — pr.md가 raw verdict·drop 건수·라우팅 소유자를 명시.
  - **효력 범위 (Ground의 "과장 금지" 준수)**: `codex_actionable_findings`에는 mechanical hard-stop이 **없다**(pr.md:438은 파싱만, validate-cmd 미차단 — Ground가 이미 확인한 사실). 이 수정이 보장하는 것은 (1) receipt가 `divergent`로 정직 봉인 → cross-gate dedupe fail-closed → 후속 `/mccp:pr`이 PR-Codex를 실제 발화, (2) PR body가 이의를 명시. 즉 **감사 정직성 + 표면 투명성**이며 "PR hard-block"이 아니다. 초안의 `converged` 매핑이 위험했던 이유도 (1)의 무력화다.
  - PR-Codex R1 F1의 요구(actionable=false)를 의도적으로 **부분 반려**했으며, 근거는 producer에 scope 필드 부재(유한 veto로 부정 증명 불가) + false-pass(보안 우회, 조용함) vs false-keep(사람이 읽음, fail-closed)의 비대칭이다. 사용자 승인 후 채택.

### F5 확장 — 4번째 게이트 (본 게이트 실행 중 추가 발견, 사용자 승인 후 흡수)

Task 12는 F5를 "plan/implement/pr 3게이트"로 범위 잡았으나, 흡수 검증 중 **`implement-dispatch/verify.js#deriveVerdictFromCodex`(aggregate merged-verify, `MCCP_WORK_MERGED_VERIFY` default `enforce`)** 도 `codex-bridge.parseVerdict(stdout)`를 쓰는 것을 발견했다.

- **실측**: 본 사이클 실제 R1 payload(`needs-attention` / "No ship" / findings 4) → `parseVerdict` → **`converged`**. 즉 `/mccp:work`의 통합 verify가 **commit 직전에 "No ship" 리뷰를 통과**시키고 있었다. M3가 PR 게이트에 대해 고쳤다고 주장한 결함이 4번째 게이트에 그대로 잔존.
- **수정**: `codex-review-payload.deriveGateVerdict` 소비로 전환(구조화 우선 → fallback은 `divergent`만). auto-CRITICAL 탐지는 raw text 우선 순서 유지(escalate 방향이라 무해).
- **test fixture 교체**: `stdout:'Verdict: converged. Ship-safe.'` 같은 bare prose는 **producer가 emit하지 않는 형태**였다 — 존재하지 않는 입력으로 스캔이 동작함을 증명하던 fixture. 실 producer envelope로 교체 + 실측 R1을 회귀로 고정.
- **회귀**: `implement-dispatch/tests/` 153/153 green. 실측 R1 → `divergent` + `block=true`(commit 전 HALT).

이로써 본 사이클이 닫은 **동일 실패 양식은 5건**이다: M3 원래 `.stdout` blindness(기흡수) · F1 필터 identity · F5 plan/implement free-text · Implement-R1 F3 fallback 승인 · 4번째 게이트 merged-verify. 공통 원인은 **test fixture/stub이 producer 계약이 아니라 구현의 가정을 인코딩**한 것이다.
