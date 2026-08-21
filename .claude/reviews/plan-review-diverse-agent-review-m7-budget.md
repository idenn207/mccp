# Plan Review Panel — diverse-agent-review (M7 budget 관측 turn · 게이트 미발화)

<!--
  고정 사유 (O3) — 이 레코드의 slug는 PRD 경로 파생이라 이 PRD의 모든 실행이
  `.claude/reviews/plan-review-diverse-agent-review.md` 한 파일을 공유하며 무조건
  덮어써진다. M7 Task 2의 budget 관측 turn이 남긴 판을 그 덮어쓰기에서 분리해 고정한다.

  plan_sha256_before: 8bdd6510a8f8806c462a77894eba7dcecaca4de2a28bfe855610c52e44c9634e
  observed_after: 2026-08-21T01:30:23.108Z

  관측 조건 (축자):
    - 예산 목표: turn 프롬프트 본문에 `+200k`를 실었다 (DN9가 규정한 전달 경로).
    - MCCP_PLAN_REVIEW_BUDGET: **설정하지 않았다** — 기본값 150000 그대로 두었다 (DN6).
      게이트 자신의 임계를 건드리지 않고 turn 쪽 조건만 만족시키는 편이 관측으로서 강하다.
    - MCCP_PLAN_REVIEW=multi-agent · MCCP_REVIEW_SINGLE_PASS=deadline_pressure ·
      MCCP_CODEX_DISABLED=1 · MCCP_GATE_ROUND_CAP=3 (전부 기존 환경, 이번에 바꾸지 않았다).
    - emit-workflow-args가 emit한 minRemaining = 600000 (기본 150000 x granted fleet 4).

  관측 결과: **budget 게이트는 발화하지 않았다.**
    - l2.json: skipped=false · coverage=4 · budget-skip 반환에만 실리는
      remaining/minRemaining 키 부재. 패널이 agent 4개를 실제로 spawn했다(412,349 tokens).
    - 0-agent 프로브 직접 실측: budget.total = null (typeof object · truthy false) ·
      spent() = 102789 · remaining() = Infinity → plan-review.js:161 표현식 false.
    - 즉 turn 프롬프트의 `+200k`가 harness의 토큰 목표로 등록되지 않았다. DN9가
      "harness 계약"으로 단언한 전달 경로가 이 invocation 형태에서 성립하지 않는다.

  아래 측정 블록은 record.js가 쓴 그대로 **바이트 무변경**이다 (M6 D3).
  recorded_at 이 observed_after 보다 뒤인 것이 이 레코드가 이번 관측의 산물이라는 근거다.
-->

**Plan**: `.claude/plans/diverse-agent-review-m7.plan.md` · **Plan version**: `sha256:bce85ab6ad9faf5719edd759f67b79773e8e1a6f9c457ea3ec79be5c9492fcae`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 5 blocking finding(s): test/HIGH, test/FAIL, invariant/CRITICAL, invariant/HIGH — MCCP_REVIEW_SINGLE_PASS=deadline_pressure 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | MEDIUM | Task 2 Validate checks that the budget gate fired but does not verify the budget goal was set to +200k as documented in DN9, creating risk of false-positive observation | plan.md Task 2 Validate (lines 164-175): checks `l2.json` verdict and `remaining < minRemaining` but no verification of budget.total value. DN9 (lines 82-85) documents budget goal as ONLY input: '+200k' in prompt text, but Task 2 Validate doesn't enforce this. Risk: operator omits +200k, actual tokens are low, gate fires anyway, Validate passes incorrectly (line 172-175 checks numbers satisfy inequality but not how they were set). |
| architect | MEDIUM | Preconditions section documents that code is already installed (1.30.0) but Validation section includes no commands to verify preconditions before Task 2 begins | plan.md Preconditions (lines 34-45): claims 'installed plugin 1.30.0' equals worktree version, verified only by text claim '바이트 동일 (`diff -q` 5건 무출력)'. Validation section (lines 301-324) includes 7 bash/node Validate blocks for Tasks 1-5 and global invariants but no precondition check. If operator hasn't run `claude plugin update`, Task 2 will fail cryptically with missing budget.js. This is a verification gap: documented precondition but no enforcement. |
| architect | LOW | Task 4 Validate checks that report mentions MCCP_PLAN_REVIEW_BUDGET but does not verify the report explicitly states this variable was NOT changed, as required by DN6 | plan.md Task 4 Validate (line 268): `if(!/MCCP_PLAN_REVIEW_BUDGET/.test(cond)) throw new Error(...)` only checks textual presence. DN6 (lines 80-81) states '`MCCP_PLAN_REVIEW_BUDGET`은 기본값 그대로 둔다' (don't change it). Report should explicitly state 'was not changed' but Validate only requires the text appears, allowing false positives (e.g., 'MCCP_PLAN_REVIEW_BUDGET=150000 was set' would pass). |
| test | HIGH | Operator can specify budget goal by including '+200k' in the `/mccp:plan` prompt body, and the Workflow harness will set `budget.total` accordingly | Plan M7 DN9: '`budget.total`은 **그 turn의 사용자 프롬프트에 실린 `+Nk` 형태의 토큰 목표**다 — 목표가 없으면 `null`이다(harness 계약, `plan-review.js:160`이 `budget.remaining()`을 호출하는 지점의 입력)'. Task 2 Action step 2 assumes this: '운영자가 새 turn의 **프롬프트 본문에 `+200k`를 포함**시킨 채'. However, there is no test in this repository that verifies the Workflow harness actually extracts `+200k` from the prompt and sets `budget.total`. The only place `budget.total` is set in code is in the unit test mock (plan-review-workflow-port.test.js:165), which bypasses the harness entirely. The mechanism by which '+200k' in the prompt becomes `budget.total = 200000` in the workflow is not tested. |
| test | MEDIUM | The plan body will be modified by Phase 4 of the workflow, making the restoration validation meaningful | Plan DN3 states: '/mccp:plan은 PRD 모드에서 Phase 4가 plan 아티팩트를 다시 쓴다... 따라서 `observed_after`가 시간 앵커다'. Task 2 Step 4: '되돌림 — 1단계 사본으로 plan 본문을 복원하고 sha256이 일치하는지 확인한다'. The Validate for Task 2(c) only checks that final sha256 matches the before-sha256: `if(got!==want) throw new Error('plan body not restored: '+got+' != '+want);` This test passes equally if (1) plan was modified and perfectly restored, or (2) plan was never modified. Without a test that verifies Phase 4 actually modifies the plan (e.g., checking that an intermediate state differs from the before state), the restoration claim cannot be falsified. The test would pass if Phase 4 stops writing the plan entirely. |
| test | MEDIUM | The observed `remaining` and `minRemaining` values in the recorded JSON correspond to the `+200k` budget goal actually being provided by the operator | Task 4 Validate checks that report `## 관측 조건` section exists and mentions MCCP_PLAN_REVIEW_BUDGET: `if(!/MCCP_PLAN_REVIEW_BUDGET/.test(cond)) throw new Error('관측 조건 must state what the panel threshold was set to');` However, this only verifies the **reported** budget goal is documented, not that it matches the **observed** minRemaining value. If the operator provided `+300k` instead of `+200k`, the test would still pass (recorded `minRemaining` would be ≥ 600000 still, within the expected set). Without cross-checking the reported budget goal against the observed threshold, the test cannot falsify whether the operator actually provided `+200k`. |
| invariant | CRITICAL | Task execution order (Task 1 → Task 2) is required by DN4 but not enforced by Acceptance criteria, allowing provenance anchoring to be broken without detection | Plan DN4 (line 76): 'Task 순서상 맨 앞이어야 한다' + 'L1이 CREATE 행을 실존으로 검사'. Task 1 Action (line 112) copies gate-review record before Task 2 overwrites it. But Acceptance line 343 only lists '- [ ] All tasks complete' with no ordering constraint. Acceptance line 355 says 'Task 1이 캡처한 이 게이트 자신의 레코드이며' — assumes Task 1 captured the correct record, but doesn't verify Task 1 ran first. If Task 1 runs after Task 2, it captures Task 2's observation record instead. Acceptance line 348 check (recorded_at > observed_after) would still pass because both timestamps come from Task 2's run. |
| invariant | HIGH | The pinned record's `recorded_at` timestamp cannot distinguish between 'gate-review verdict' and 'wrong-task verdict' when both are budget halts, because the timestamp comparison (line 195-198 Validate) is agnostic to which turn produced the data | Plan Task 2 Validate (d) at lines 195-198 compares recorded_at > observed_after, but both values come from the same run's measurement JSON. If Task 1 mistakenly captures Task 2's observation record instead of the gate-review record, both timestamps are from Task 2, and the check passes. The acceptance goal (line 348) was to detect 'previous run records are stale', but the check only detects timestamp inversion, not record-source confusion. |
| invariant | MEDIUM | The plan assumes `observed_after` is set before observation runs, but Task 2 Action doesn't document the mechanism or provide code to set it, creating opportunity for honest timing mistakes | Plan line 149 says 'UTC ISO 시각(`observed_after`)을 기록하고' but doesn't show how. Task 2 Action is prose-only ('기록하고'='record it') with no code snippet. The Validate block (lines 195-198) reads it from provenance comments in the pinned file, implying manual editing. If operator sets `observed_after` after running observation (honest mistake, e.g., due to low timestamp precision), the check fails even though observation succeeded: `recorded_at <= observed_after` throws 'this record predates the observation'. The invariant is fail-closed, but the precondition is fragile. |
| invariant | MEDIUM | The plan does not verify the operator actually provides the `+200k` budget goal in the prompt, creating a gap between documented procedure (DN9: 'turn 프롬프트 본문의 `+200k` 토큰') and what the machine can check | Plan line 85 (DN9) specifies: 'turn 프롬프트 본문에 `+200k`를 포함시킨 채'. Line 150 Task 2 Action: 'operator runs `/mccp:plan` with the budget goal'. But there is no check that the operator actually included it. If they don't, `budget.total` is null, the gate doesn't fire, `halt_stage !== '5.2e'`, and Task 2 Validate throws. The failure is HALT (good), but the error message won't clarify 'you forgot to supply +200k' — it will just say stage mismatch. DN9 acknowledges this is an external-input procedure, not code, but the task doesn't verify it ran correctly. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | Verified DN1 (budget.total from harness contract): code at workflows/plan-review.js:161 checks `budget.total`, which is external Workflow primitive per harness spec in DN9 — not env var or code-generated. Verified DN3 (plan restoration by sha256): plan.md Task 2 step 4 captures baseline sha256 and restores after observation turn; Validate (line 189-190) enforces restoration. Verified DN4 (task ordering): l1-check.js:333-335 checks CREATE targets for absence; if files exist, C3_CREATE_EXISTS blocks. Task 2 must run before Tasks 3-5. Verified DN5b (budget precedes panel): workflows/plan-review.js:161 budget early return, line 182 phase('Refute'), line 185 agent() — indices confirm ordering. Verified L1 checking: l1-check.js:68-69 ACTIONS_REQUIRING_ABSENCE=['CREATE'] confirms CREATE targets must not exist. Architecture is sound — only verification/documentation gaps found, no structural invariant leaks. |
| security | pass | Examined plan's observation procedure focusing on: (1) trust boundaries for before-state capture and restoration — traced Task 2 flow from hash computation through provenance comment writing to validate block; found operator writes plan_sha256_before post-observation which theoretically allows matching a modified restored state, but this is mitigated by single-operator context and peer review so not a finding; (2) concurrency/TOCTOU risks between plan copy and restoration — git-path/tmp is operator-controlled but not attacked path in single-session context; (3) budget goal transmission (DN9) — traced plan-review.js to confirm budget.total cannot be forged; (4) timestamp spoofing — both observed_after and recorded_at are operator-writable but checking inequality is best-effort audit, acceptable given peer review; (5) absolute path leaks — plan includes history-leak-scan validation (line 318), checked scanner coverage for repo-root patterns and old-repo-name paths; (6) credential/secret exposure through task validation blocks — no credentials passed or logged. Attacked all major claim paths in plan: budget gate precedes agent call (verified workflow line 161 fires before line 182), plan restoration fidelity (hash comparison logic sound despite source-validation gap), receipt staleness prevention (restoration needed to preserve planAwareMarkdownHash). Found no evidence that plan introduces new attack surface or violates existing integrity contracts." |
| test | fail | Searched for test coverage of: (1) Workflow harness budget goal extraction mechanism — found only mock budget objects in unit tests, no test of real harness parsing `+200k` from prompt; (2) Verification that Phase 4 modifies plan body — found only sha256 restoration check, which can't distinguish between modification+restoration vs no-modification; (3) Validation blocks for all Tasks 1-5 — found they test observable effects (gate fires, numbers recorded, timestamps match) but don't test the input assumption (harness correctly extracts budget goal); (4) Existing plan-review test suite (plan-review-budget.test.js, plan-review-workflow-port.test.js) — verified they test budget calculation and workflow branching with mocks, but not the harness input chain; (5) Code search for where `budget.total` is assigned — found only test mocks, no code in this repo that converts prompt `+200k` to `budget.total`; (6) Plan's stated preconditions vs test guarantees — Plan acknowledges "harness contract" in DN9 but makes no test assertion about it. |
| invariant | fail | Attacked the receipt anchoring invariant by tracing the record-capture sequence (Task 1 → Task 2 data overwrite flow) and testing whether Acceptance criteria enforce the required order. Found that out-of-order execution (Task 1 after Task 2) would pass all timestamp and content checks while capturing the wrong record's provenance. Tested the `observed_after` timestamp mechanism for clock-skew vulnerabilities and documentation gaps. Verified that the workflow source code has budget-return before phase/agent (lines 161 < 182 < 185 in plan-review.js, confirmed by Grep). Examined the human-input procedure (DN9: operator supplies +200k in prompt) and found no automated guard that the input actually happened." |

## Measurement

<!-- Written by plan-review/cli.js record on EVERY exit path, pass or halt.
     Machine-readable; do not hand-edit. A null field means the axis was
     not observed, never that it was zero. -->

```json
{
  "verdict": "divergent",
  "source": "multi-agent",
  "layers": {
    "l1": "converged",
    "l2": "divergent",
    "l3": "not fired"
  },
  "quorum": {
    "responded": 4,
    "required": 3,
    "roles": 4,
    "of": 4,
    "passed": false
  },
  "wall_clock_ms": 482116,
  "halt_stage": null,
  "backlog_appended": 3,
  "backlog_skipped_nonblocking": 7,
  "granted": 4,
  "reviewed_plan_hash": "sha256:bce85ab6ad9faf5719edd759f67b79773e8e1a6f9c457ea3ec79be5c9492fcae",
  "plan_path": ".claude/plans/diverse-agent-review-m7.plan.md",
  "recorded_at": "2026-08-21T03:42:10.877Z"
}
```
