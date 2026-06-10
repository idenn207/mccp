# Plan: v0.4.0 Axis H — Plan-Implement Verify Layer

**Source PRD**: [.claude/prds/v0-4-0-orchestrator.prd.md](../prds/v0-4-0-orchestrator.prd.md)
**Selected Milestone**: M1 — H plan-implement verify
**Complexity**: Medium

## Summary

`/mccp:prp-implement`가 Phase 3 EXECUTE 도중 test/validation에서 plan과 충돌하는 결과를 발견했을 때 silent하게 "corrected approach로 계속"하는 path를 봉쇄한다. 충돌 감지 시 (A) `fix-task.md`에 `plan_conflict` verdict로 사용자 escalation을 적재하고 (B) `STATE.md.chain_aborted=true`로 auto-chain 진행을 정지하며 (C) implement receipt meta에 `plan_conflict_escalated=true`를 audit-stamp한 뒤 implement command를 exit 1로 종료한다. 다음 세션에서 사용자가 `/mccp:plan` revision 또는 명시적 deviation override로 진입한다.

PRD Open Question §1 ("axis H의 정확한 escalation surface")에 대한 본 plan의 답: **fix-task.md + STATE.md chain_aborted 하이브리드** (askUserQuestion 사용 안 함 — 비동기성이 implementer flow를 깨뜨리고 minimum-spec mode와도 incompatible).

## Implementation Dependencies — Plan-Stage Verification

PRD §"Implementation Dependencies" 8개 가정 중 axis H에 직접 적용되는 항목은 **없음**. axis H는 fully self-contained하며 prototype gate를 필요로 하지 않는다. 단 다음 1개 가정은 본 plan에서 신규로 명시:

1. **`fix-task.md` overwrite-on-same-turn 안전성** — 기존 stop-loop가 fix-task를 write할 때와 prp-implement Phase 3 escalation이 fix-task를 write할 때가 같은 turn에서 충돌하지 않음. 근거: Phase 3 EXECUTE는 stop hook 직전에 종료 (exit 1)하며, stop-loop의 fix-task write는 *Stop event* 이후 발화. 시간 순서가 분리됨. plan 단계 verify 완료 — 추가 prototype 불요.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Verdict-typed escalation | [plugins/mccp/scripts/state/fix-task.js:62-85](../../plugins/mccp/scripts/state/fix-task.js#L62-L85) | `deriveTitle` + `deriveWhy` switch on verdict — 새 verdict 추가는 4-line patch |
| Stop-loop fix-task generation | [plugins/mccp/scripts/hooks/stop-review-loop.js:1-40](../../plugins/mccp/scripts/hooks/stop-review-loop.js#L1-L40) | input shape (`{verdict, counter, escalate, failures, originatingReceipts}`) — implement-side caller도 같은 shape 사용 |
| STATE.md flag set | [plugins/mccp/scripts/state/state-writer.js:332-356](../../plugins/mccp/scripts/state/state-writer.js#L332-L356) | `chain_aborted`/`escalate_pending` 이미 존재 — schema 확장 불필요, patch만 |
| Receipt meta audit | [plugins/mccp/scripts/receipt/schema.js:1-30](../../plugins/mccp/scripts/receipt/schema.js#L1-L30) | impeccable/security_skipped 같은 advisory meta field 패턴 — `plan_conflict_escalated`도 동일 (non-blocking, audit-only) |
| Phase command escalation exit | [plugins/mccp/commands/prp-implement.md:155-160](../../plugins/mccp/commands/prp-implement.md#L155-L160) | `[MCCP-GATE-STOP]` block + exit 1 + 다음 response 차단 |
| Unit-test convention | (없음 — fix-task verdict 분기 테스트가 plugins/mccp/tests/state/ 하위에 부재) | Node native test runner (`node --test`). 본 plan에서 신규 작성하며 패턴 자체를 정착 |

## Files to Change

| File | Action | Why |
|---|---|---|
| [plugins/mccp/scripts/lib/plan-conflict-detector.js](../../plugins/mccp/scripts/lib/plan-conflict-detector.js) | CREATE | Phase 3 test 실패 시 "plan과 충돌"을 결정하는 conservative detector. false-positive를 최소화하기 위한 strict signal만 반환 |
| [plugins/mccp/scripts/state/fix-task.js](../../plugins/mccp/scripts/state/fix-task.js) | UPDATE | `deriveTitle`/`deriveWhy`/`deriveNextActions`에 `plan_conflict` verdict 분기 추가. 4-line patch x 3 곳 |
| [plugins/mccp/scripts/state/state-writer.js](../../plugins/mccp/scripts/state/state-writer.js) | UPDATE | `VALID_EVENTS`에 `plan_conflict_escalated` 추가 (line 27-36). schema 본문 확장 없음 — 기존 `chain_aborted`/`escalate_pending` flags 재사용 |
| [plugins/mccp/scripts/receipt/schema.js](../../plugins/mccp/scripts/receipt/schema.js) | UPDATE | implement receipt meta에 `plan_conflict_escalated` (boolean, optional, default=false) advisory field 추가. validate에서 type만 체크, blocking 효과 없음 |
| [plugins/mccp/scripts/receipt/cli.js](../../plugins/mccp/scripts/receipt/cli.js) | UPDATE | `write --plan-conflict-escalated` CLI flag 추가 (impeccable-skipped와 동일 패턴) |
| [plugins/mccp/commands/prp-implement.md](../../plugins/mccp/commands/prp-implement.md) | UPDATE | Phase 3 "Handling Deviations" 섹션을 plan-conflict-detector 기반 escalation block으로 재작성. legacy "minor deviation" path는 보존 |
| [plugins/mccp/tests/lib/plan-conflict-detector.test.js](../../plugins/mccp/tests/lib/plan-conflict-detector.test.js) | CREATE | detector unit tests — true positive (signature drift) + true negative (style-only change) + edge cases |
| [plugins/mccp/tests/state/fix-task-plan-conflict.test.js](../../plugins/mccp/tests/state/fix-task-plan-conflict.test.js) | CREATE | `plan_conflict` verdict로 fix-task가 정확한 title/why/nextActions 생성하는지 검증 |
| [plugins/mccp/tests/state/state-writer-plan-conflict-event.test.js](../../plugins/mccp/tests/state/state-writer-plan-conflict-event.test.js) | CREATE | `plan_conflict_escalated` event가 valid event로 수락되고 `chain_aborted=true` patch와 함께 STATE.md에 정확히 기록되는지 검증 |
| [plugins/mccp/tests/receipt/schema-plan-conflict.test.js](../../plugins/mccp/tests/receipt/schema-plan-conflict.test.js) | CREATE | receipt validate가 `plan_conflict_escalated=true` 있는 implement receipt를 통과하고 type 위반 시 reject 검증 |
| [.claude/prds/v0-4-0-orchestrator.prd.md](../prds/v0-4-0-orchestrator.prd.md) | UPDATE | Delivery Milestones 표의 M1 행: status `pending` → `in-progress`, Plan cell에 본 plan path |
| [.claude/plans/codex-findings-backlog.md](codex-findings-backlog.md) | APPEND (if any DEFER) | Phase 5 Codex review의 DEFER_TO_BACKLOG 항목 누적 |

## Tasks

### Task 1: `plan-conflict-detector.js` 모듈 작성

- **Action**: 새 파일 [plugins/mccp/scripts/lib/plan-conflict-detector.js](../../plugins/mccp/scripts/lib/plan-conflict-detector.js) 작성. 두 함수 export:
  - `detectFromValidationFailure({planText, failureOutput, filesChanged})` — Phase 4 validation 실패 출력을 받아 `{conflict: boolean, signal: string|null, reason: string|null}` 반환
  - `detectFromFileExpansion({planFilesToChange, actualFilesChanged})` — git diff 결과가 plan의 "Files to Change" 표를 벗어나는지 검사
- **Conservative signals only** (false-positive 차단):
  1. Test 실패 output에 "function does not exist" / "is not a function" / "TypeError" 같은 signature-level 에러가 plan의 Files to Change에 명시되지 않은 파일에서 발생
  2. Phase 3 첫 5 task 안에서 새 파일 생성 (plan에 없는) ≥ 2개
  3. Plan에 명시된 validation command가 zero-exit이지만 actual output에 "skipped" / "0 tests run" — Phase 4 가짜 통과
- **Mirror**: 새 파일이므로 patterns 자체가 patterns. 명명/모듈 boundary는 [scripts/lib/codex-bridge.js](../../plugins/mccp/scripts/lib/codex-bridge.js)와 일관 (single-purpose lib module, `'use strict'`, named exports, JSDoc 미사용)
- **Validate**:
  ```bash
  node --test plugins/mccp/tests/lib/plan-conflict-detector.test.js
  ```

### Task 2: `plan-conflict-detector.test.js` 작성

- **Action**: 3 시나리오:
  1. **true positive — signature drift**: plan에 `Files to Change: utils.js`만 있는데 test output이 `TypeError: helpers.parse is not a function` 포함 → `conflict: true`
  2. **true negative — style-only**: plan에 명시된 파일에서만 lint 실패 → `conflict: false`
  3. **edge — empty plan**: planText 빈 문자열 → `conflict: false` (detector는 plan 부재 시 conservative하게 no-escalation)
  4. **true positive — file expansion**: plan에 3개 파일, actual diff 5개 파일 (plan에 없는 2개 추가) → `conflict: true`
  5. **fake validation pass**: test command exit 0이지만 stdout `"0 tests run"` → `conflict: true`
- **Mirror**: Node native test runner (`node:test` + `node:assert/strict`), CommonJS require, fixture는 inline string (별도 fixtures 디렉토리 안 만듦)
- **Validate**: 동일 명령. 5 시나리오 모두 PASS

### Task 3: `fix-task.js` verdict 분기 추가

- **Action**: 세 함수 patch:
  - `deriveTitle(failures, verdict)` 65행: `if (verdict === 'plan_conflict') return 'plan-implement conflict — review and revise plan';`
  - `deriveWhy(verdict)` 71행 switch 추가: `case 'plan_conflict': return 'Implement phase detected a conflict between the plan and actual test/validation results. The deviation cannot be silently absorbed — review the plan, decide whether to revise it or accept the implementation drift, then re-enter /mccp:prp-implement.';`
  - `deriveNextActions(verdict, failures)` (참조: 같은 파일 line ~101): `plan_conflict` 분기 추가 — 3 액션:
    1. `Read .claude/state/fix-task.md and the source plan to understand the conflict`
    2. `Run /mccp:plan <plan-path> if the plan needs revision, OR write a deviation rationale into the plan body if the implementation is correct`
    3. `Re-enter /mccp:prp-implement <plan-path> after deciding`
- **Mirror**: 기존 case 분기 4행 패턴 그대로
- **Validate**:
  ```bash
  node --test plugins/mccp/tests/state/fix-task-plan-conflict.test.js
  ```

### Task 4: `fix-task-plan-conflict.test.js` 작성

- **Action**: 1 시나리오: `fixTask.write({repoRoot: tmp, verdict: 'plan_conflict', failures: [...]})` 호출 후 생성된 `fix-task.md` 본문에서 `title`/`why`/`nextActions` 3개를 substring assert
- **Mirror**: tmp 디렉토리는 `node:fs/promises.mkdtemp` + `os.tmpdir()`. 끝나면 `fs.rm({recursive: true})`. 기존 mccp 테스트가 따르는 패턴
- **Validate**: 동일 명령. 1 케이스 PASS

### Task 5: `state-writer.js` `VALID_EVENTS` 확장

- **Action**: line 27-36 `VALID_EVENTS` Set에 `'plan_conflict_escalated'` 한 줄 추가. 주석으로 "v0.4.0 axis H — emitted by /mccp:prp-implement Phase 3 when plan-conflict-detector signals" 명시 (왜를 적는다, 무엇을 안 적는다)
- **Mirror**: 기존 `'handoff_spawn'` v0.3.0 추가 패턴 그대로
- **Validate**:
  ```bash
  node --test plugins/mccp/tests/state/state-writer-plan-conflict-event.test.js
  ```

### Task 6: `state-writer-plan-conflict-event.test.js` 작성

- **Action**: 2 케이스:
  1. `update(tmp, {event: 'plan_conflict_escalated', chainAborted: true})` 호출 → STATE.md frontmatter에 `last_event: plan_conflict_escalated` + `chain_aborted: true` 정확히 기록. content-hash skip이 *적용되지 않음* (event 변화는 semantic, hash 포함됨) — disk write 실제 발생
  2. unknown event 폴백: `update(tmp, {event: 'plan_conflict'})` (오타 시뮬레이션) → stderr warning + `last_event: precompact` 폴백
- **Mirror**: 기존 state-writer 테스트가 있다면 그 패턴, 없으면 fix-task test와 같은 tmpdir 구조
- **Validate**: 동일 명령. 2 케이스 PASS

### Task 7: `receipt/schema.js` `plan_conflict_escalated` advisory field 추가

- **Action**: schema.js `validate` 함수에서 `receipt.meta` 객체 validation 블록을 찾아 (impeccable_skipped/security_skipped 옆) `plan_conflict_escalated`를 optional boolean으로 허용. 명시 시 `typeof === 'boolean'` 체크만, 부재 시 OK. **blocking 효과 없음** — audit 전용
- **Mirror**: impeccable_skipped meta field 처리 패턴 그대로. blocking이 아니므로 `validate-cmd` 로직에는 손대지 않음 (advisory만 stamp)
- **Validate**:
  ```bash
  node --test plugins/mccp/tests/receipt/schema-plan-conflict.test.js
  ```

### Task 8: `schema-plan-conflict.test.js` + `receipt/cli.js` 작성

- **Action**:
  - schema test: 3 케이스 — (1) `meta.plan_conflict_escalated=true` 통과, (2) 부재 시 통과, (3) `meta.plan_conflict_escalated="yes"` (string) reject
  - cli.js: `--plan-conflict-escalated` flag 파싱, parsed args에서 `meta.plan_conflict_escalated`를 receipt body에 합쳐 write
- **Mirror**: cli.js 의 기존 `--impeccable-skipped` / `--security-skipped` flag handling 패턴
- **Validate**: 동일 명령

### Task 9: `prp-implement.md` Phase 3 "Handling Deviations" 재작성

- **Action**: Phase 3 "Handling Deviations" 섹션 (line ~334-342)을 다음 구조로 교체:

  ````markdown
  ### Handling Deviations

  During task execution OR after Phase 4 validation, run plan-conflict detection:

  ```bash
  CONFLICT_JSON=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-conflict-detector.js" detect \
    --plan "$ARGUMENTS" \
    --failure-output "$LAST_VALIDATION_OUTPUT" \
    --files-changed "$(git diff --name-only origin/main..HEAD)" \
    --json)
  CONFLICT=$(echo "$CONFLICT_JSON" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.conflict?"1":"0")}catch{process.stdout.write("0")}')
  ```

  - **CONFLICT=0 (minor deviation, plan에 명시되지 않은 사소한 차이)**: 기존 패턴 — Note WHAT/WHY, continue. Phase 5 report에서 deviation 누적.
  - **CONFLICT=1 (plan-implement gap detected)**: 
    1. Write `fix-task.md`:
       ```bash
       node -e "
       const fixTask = require('${CLAUDE_PLUGIN_ROOT}/scripts/state/fix-task');
       fixTask.write({
         repoRoot: process.cwd(),
         verdict: 'plan_conflict',
         counter: 1,
         escalate: true,
         failures: [{stage: 'plan-conflict-detector', exitCode: 1, excerpt: '${CONFLICT_REASON}'}],
         originatingReceipts: ['mccp-implement-codex/${DECISION_SLUG}.json']
       });"
       ```
    2. Set `STATE.md.chain_aborted=true` + emit event:
       ```bash
       node -e "
       const sw = require('${CLAUDE_PLUGIN_ROOT}/scripts/state/state-writer');
       sw.update(process.cwd(), {
         event: 'plan_conflict_escalated',
         chainAborted: true,
         openQuestions: ['plan-implement conflict — see .claude/state/fix-task.md']
       });"
       ```
    3. Receipt meta stamp (if receipt already written in Phase 2.5): 
       ```bash
       node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js write \
         --gate mccp-implement-codex \
         --decision ${DECISION_SLUG} \
         --plan "$ARGUMENTS" \
         --plan-conflict-escalated \
         --quiet
       ```
    4. Print escalation block + exit 1:
       ```
       [MCCP-PLAN-CONFLICT-STOP] Implementation diverged from plan.
       Reason: <CONFLICT_REASON>
       Next action queued in .claude/state/fix-task.md.
       Run /mccp:plan <plan-path> to revise, OR add deviation rationale to plan body, then re-enter /mccp:prp-implement.
       ```
  ````

  Phase 7 AUTO-CHAIN은 `STATE.md.chain_aborted=true`를 이미 감지 [auto-chain.js shouldAbort](../../plugins/mccp/scripts/lib/auto-chain.js) (기존 8 triggers 중 하나) — commit/PR 자동 진행이 자연스럽게 정지.

- **Mirror**: `[MCCP-GATE-STOP]` exit-1 block은 Phase 2.5의 same pattern. `[MCCP-PLAN-CONFLICT-STOP]`라는 새 prefix로 distinguish
- **Validate**: integration test는 axis 자체가 prompt-body markdown 변경이라 unit-runnable 부재. Manual smoke test로 dummy plan + 의도적 conflict 시나리오를 worktree에서 1회 실행 (Phase 5 read-back 단계에서 사용자 confirm 요청)

### Task 10: PRD Delivery Milestones 표 업데이트

- **Action**: [.claude/prds/v0-4-0-orchestrator.prd.md](../prds/v0-4-0-orchestrator.prd.md) `Delivery Milestones` 표 M1 행만:
  - `Status`: `pending` → `in-progress`
  - `Plan`: `—` → `[.claude/plans/v0-4-0-axis-h-plan-implement-verify.plan.md](../plans/v0-4-0-axis-h-plan-implement-verify.plan.md)`
- 다른 milestone 행은 손대지 않음
- **Mirror**: PRD 명세 ("update only the selected row from pending to in-progress")
- **Validate**: `grep -n "H — plan-implement verify" .claude/prds/v0-4-0-orchestrator.prd.md` 결과의 status/plan cell 확인

## Validation

```bash
# Unit tests for new + modified modules
node --test plugins/mccp/tests/lib/plan-conflict-detector.test.js
node --test plugins/mccp/tests/state/fix-task-plan-conflict.test.js
node --test plugins/mccp/tests/state/state-writer-plan-conflict-event.test.js
node --test plugins/mccp/tests/receipt/schema-plan-conflict.test.js

# Full test suite — ensure no regression in stop-loop/state-writer/receipt
node --test plugins/mccp/tests/

# Receipt validate sanity (no regression)
node plugins/mccp/scripts/receipt/cli.js status

# Manual smoke (Phase 5 confirm required) — dummy plan with intentional drift
# Skipped for now; will be done as part of /mccp:prp-implement Phase 4 manual check
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `plan-conflict-detector`가 false-positive로 정상 작업 차단 | Medium | Conservative signals only (Task 1 정의 3종). 신호가 약하면 항상 `conflict: false` 반환. dogfood 첫 cycle에 false-positive rate 측정 — sometime <5%면 OK |
| `fix-task.md` overwrite race — stop-loop의 fix-task write와 본 escalation의 fix-task write가 같은 turn 겹침 | Low | 본 escalation은 Phase 3 EXECUTE 중 exit 1로 즉시 종료. Stop hook은 그 다음 fire — 시간 분리됨. 만약 race 시 latest writer wins (fix-task.js 기존 design) |
| 기존 deviation logging 흐름 (Phase 5 report에 WHAT/WHY) backward-compat 우려 | Low | CONFLICT=0 path는 기존 동작 그대로 보존. CONFLICT=1만 신규 escalation. Phase 5 report 형식 변경 없음 |
| `chain_aborted=true` 가 사용자가 다음 세션에서 `/mccp:prp-implement` 재진입 시 다시 trigger | Medium | 사용자가 plan을 revise하면 plan content hash 변경 → 새 implement receipt → `chain_aborted`은 새 receipt write 시 자동으로 false로 reset (state-writer 기존 동작 검증 필요 — Task 6 test에서 확인) |
| `plan_conflict_escalated` receipt meta가 downstream `/mccp:pr` validator에서 blocking으로 오해 | Low | Advisory-only field로 명시. Task 7 schema validate에서 `validate-cmd`에는 손대지 않음. PR-Codex가 이 meta를 읽고 차단하려면 별도 patch 필요 — 본 plan 범위 밖 (axis H는 implement-time escalation만, PR은 자유) |
| `plan-conflict-detector` heuristic이 너무 약해서 PRD가 지적한 실제 incident 못 잡음 | Medium | Task 2 시나리오 5가 "fake validation pass" (test command exit 0 + 0 tests run)를 cover. PRD Evidence §3의 실제 incident가 이 패턴 — primary capture target |
| Plan revision cycle이 PRD의 다른 milestone (axis I/B/C) 결과를 기다림 | Low | axis H는 fully self-contained. 의존성 없음. 단독 ship 가능 |

## Acceptance

- [ ] 모든 9 task의 unit test가 PASS (검증 명령 4종 모두 zero-exit)
- [ ] 전체 `node --test plugins/mccp/tests/` regression PASS (기존 테스트 회귀 없음)
- [ ] `plan-conflict-detector`의 5 conservative signal 시나리오 모두 cover됨
- [ ] `fix-task.md` `plan_conflict` verdict가 title/why/nextActions에서 명확히 escalation을 안내
- [ ] `STATE.md.chain_aborted=true` set 시 [auto-chain.js shouldAbort](../../plugins/mccp/scripts/lib/auto-chain.js)가 commit/PR step을 자동 정지 (수동 verify)
- [ ] receipt schema가 `plan_conflict_escalated` meta를 advisory-only로 수락 (blocking 효과 없음)
- [ ] `prp-implement.md` Phase 3 변경이 markdown lint 통과 + 기존 phase 흐름과 정합 (PR review에서 확인)
- [ ] PRD Delivery Milestones 표 M1 행이 정확히 `in-progress` + plan path로 업데이트
- [ ] 패턴이 재사용 가능 — 향후 axis I/J/G 등 다른 milestone이 새 verdict (예: `multi_session_drift`)를 추가하려 할 때 본 patch와 같은 4-line touch로 가능

## Design Critique

> impeccable unavailable, skipped (auto-fallback): skill-missing
>
> impeccable-detect (mode=plan) 결과: `skill_available=false, design_signal=false`. 본 plan은 backend lib + state-writer + receipt schema 변경이며 UI/visual surface 없음. plan-codex는 lenient gate이므로 `meta.impeccable_skipped=true`는 warning으로만 surface.

## Codex Implementation Review

> Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy, first-class skip). No new implement-time decisions detected beyond plan-stage decision-set; plan was self-converged via [memory: project_v0_4_0_orchestrator] + santa-loop dual-review. Receipt meta: `codex_disabled=true`, `codex_skip_reason='codex_disabled'`.

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.3.5+)
- 라운드 수: 0 (spawn 직전 short-circuit, durationMs=0)
- Classification: `disabled` — wrapper가 `MCCP_CODEX_DISABLED=1` 감지 후 즉시 반환 (`blocking=false, advisory=false`)
- 합치 결론: n/a — env-level skip, no implement-time Codex invocation
- YAGNI Triage: n/a
- Open Questions: 없음 (Codex review 미수행)

## Codex Adversarial Review

> Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy, first-class skip)

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.3.5+)
- 라운드 수: 0 (spawn 직전 short-circuit, durationMs=0)
- Classification: `disabled` — wrapper가 `MCCP_CODEX_DISABLED=1` 감지 후 즉시 반환 (`blocking=false, advisory=false`)
- 합치 결론: n/a — Codex 호출 자체가 발생하지 않음. [memory: feedback-codex-permanent-bypass] 영구 합의에 따른 환경 정책.
- YAGNI Triage: n/a
- Deferred to backlog: 0
- Open Questions: 없음 (Codex review 미수행)
- Codex session 참조: n/a
- Receipt meta: `codex_disabled=true` + `codex_skip_reason='codex_disabled'` 자동 stamp 예정 (Phase 5.6)
- Audit notes:
  - cache wrapper (v0.3.4)는 disabled honor 미지원 → exit-nonzero (`classification=exit-nonzero`)로 떨어졌음. 본 repo wrapper (v0.3.5+ M8)로 재호출하여 정상 disabled 처리.
  - plan.md Phase 5.2 body가 cache 버전(v0.3.4)이라 disabled 분기 (`elif [ "$CODEX_CLASS" = "disabled" ]`)가 부재. prp-implement.md Phase 2.5.3에는 존재. 본 plan은 disabled path를 manual하게 처리 — 향후 plan.md 자체 v0.3.5+ sync 시 자동 분기로 대체될 것.
