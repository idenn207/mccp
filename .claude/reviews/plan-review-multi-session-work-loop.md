# Plan Review Panel — multi-session-work-loop

**Plan**: `.claude/plans/multi-session-work-loop-m8.plan.md` · **Plan version**: `sha256:3b5b0470a301aa84564076557e40c4a20b397cbeb4322670344088ff81bc1ad6`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 9 blocking finding(s): test/HIGH, test/HIGH, test/FAIL, invariant/CRITICAL — MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| test | HIGH | Plan absorbs HIGH R1-2 finding by claiming to 'fix the set equality of the two [claimed-computable] lists with a test' and move lockstep constraint 'from prose to mechanics' | Plan Review Triage line 382: '두 목록의 집합 동일성을 test로 고정' (fix set equality with test). Task 9 line 225 repeats this claim. However, Files to Change line 153 specifies msw-metrics-acceptance.test.js UPDATE action as only 'A1·A2·B3을 claimed-computable로 승격' (promote A1/A2/B3) with NO mention of adding a test that compares the two lists (test file CLAIMED_COMPUTABLE vs cli.js claimedComputable). The Validation section (lines 233-289) includes no explicit test command for this lockstep constraint. |
| test | HIGH | Validation commands will test that claimed-computable lists are kept in lockstep | Task 9 line 225 claims 'lockstep을 산문에서 기계로 옮긴다' (move lockstep from prose to mechanics). The Validation section references 'node --test plugins/mccp/scripts/lib/tests/' which runs msw-metrics-acceptance.test.js, but a search of that file (lines 1-265) shows no test checking whether test file CLAIMED_COMPUTABLE set equals cli.js claimedComputable set. Line 39 mentions 'it must stay in lockstep with derive/cli.js' as prose comment, but no mechanical assertion exists. |
| test | MEDIUM | Test files referenced in Validation section already exist and are ready to run | Validation line 249 references 'node --test plugins/mccp/scripts/lib/tests/session-identity.test.js' but this file does not exist (Glob search returns no match). Line 242 references 'docs/multi-session-work-loop/m8-assertion-manifest.json' but this file does not exist. Lines 161-164 list these as CREATE tasks, not existing files. The plan's Validation section assumes these will exist but cannot be executed pre-implementation. |
| test | MEDIUM | Exactly 5 emit points will be in the coverage gate registry with explicit file:line pins | Task 9 line 226 claims '승인 emit 지점 집합은 **정확히 5개**이고 각각 file:line으로 고정한다' (exactly 5 approved emit points, each pinned by file:line). However, m8-coverage-gate.js does not exist yet (Glob search returns no match). The plan references this file as CREATE but provides no way to verify before implementation whether the 5 points and their exact locations are correct. A counter-example: session-start.js is listed with TWO events (session_start · env-snapshot), so whether file count = event count is ambiguous. |
| test | MEDIUM | Validation will verify A1·A2·B3 transition to computed status | Validation line 254 comment states 'A1·A2·B3 이 computed 여야 한다'. However, the actual validation command 'node plugins/mccp/scripts/derive/cli.js metrics-assert' (line 257) checks the claimed-computable list in cli.js code, which currently contains only [A3_INSTRUCTION_COST, B2_CONCURRENT_CONFLICTS, B3_TOGGLE_AXES] (cli.js:246-250). This test will FAIL on current code. The test cannot pass until cli.js is updated, creating circular dependency: Validation assumes changes are done but cannot verify they will work. |
| invariant | CRITICAL | Plan claims to move claimed-computable lockstep from prose to mechanical test assertion, but no test validates that the two lists (msw-metrics-acceptance.test.js:87 vs derive/cli.js:246) remain synchronized | Plan line 154 states 'R1-2 test HIGH 흡수 — ... 두 목록의 집합 동일성을 test로 단언해 lockstep을 산문에서 기계로 옮긴다'. Current state: test file has C1_FEEDBACK_CLOSURE in CLAIMED_COMPUTABLE (line 87-92), CLI file omits it from claimedComputable (line 246-250). No grep search across plugins/mccp/scripts finds any test asserting these sets must be equal. Existing metrics-assert command (cli.js:290-340) only validates items in claimedComputable, not the set equality. Validation section line 257 lists 'metrics-assert' but this command does not enforce lockstep. |
| invariant | CRITICAL | A1 numerator validation has circular temporal dependency: plan claims A1 is 'computed' upon completion, but A1 numerator depends on task_completed events that only exist after this plan's own PR is created | Plan Validation lines 269-276 mark a PRE/POST split: 'A1 완주 emit이 산문이라 불이행된다' and notes that task_completed is '이 milestone 자신의 `/mccp:pr`이 처음 발화시키므로'. Acceptance checkboxes line 319-320 require checking that A1 status is 'computed', but the receipt will be stamped with plan_hash before the events exist. Validation PRE phase line 271 tries to assert session_start/session_end/task_started exist, but at plan review time (before any M8 code runs), there are 0 task_started events in production (as stated in Producer Preflight line 19). |
| invariant | HIGH | Plan's Validation section claims to test derived lists must be identical, but the actual test command does not implement this check | Plan Task 9 line 225 states '두 목록의 집합 동일성을 test로 단언' as acceptance criteria. Validation line 257 lists 'node plugins/mccp/scripts/derive/cli.js metrics-assert' as the validation method. Examining cli.js:290-340 (cmdMetricsAssert function), it only iterates over `claimedComputable` and checks for non-null numerator/denominator, never comparing against CLAIMED_COMPUTABLE from test file. No assertion like `assert(set1.equals(set2))` exists. |
| invariant | HIGH | Session-identity module (Task 1) creates a new import dependency, but validation (Task 2) assumes the module exports resolveRawSessionId without a gate that catches missing exports | Plan Task 1 line 177 creates session-identity.js exporting 'resolveRawSessionId'. Task 2 Validation line 249 defines assertions within a test file. If session-identity.js is created but does not export resolveRawSessionId, the entire test file import fails (line 180: 'const { resolveRawSessionId } = require(...)'). The test harness fails at require time before any assertions run, so the gate doesn't block — it crashes. Plan Risks line 296 acknowledges 'Task 1을 단독 커밋으로 두고, 켜진 직후 한 세션을 완주시켜' but this is procedural, not mechanical; no automated test verifies the module structure. |
| invariant | HIGH | Producer preflight identifies A1 분모 의미 as contract violation (sessions counted instead of work units), but Validation does not mechanically block production of invalid metric | Plan line 21-22: 'measurement-design.md §A1(FROZEN)은 분모를 ... **작업 단위 전수**로 고정했는데, derive/sources/session-activity.js:186-190은 ... **세션 수**를 센다'. Plan claims this is fixed by Task 5 redefining `task_startups_count` to use distinct work_unit. However, Validation section does not show a test that (a) injects multiple sessions with same work_unit, (b) verifies denominator equals work_unit count not session count. Acceptance line 319 only checks that A1 is non-null/computed, not that the contract is satisfied. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | Verified claims about DD1 transformation pattern (default parameter evaluation timing ✓), session ID chain precedent at orchestration-runaway.js:558 ✓, single-source-of-truth pattern mirror at toggle-snapshot.js ✓, claimed-computable list drift at test file line 91 vs cli.js 246 (already identified and addressed in R1-2) ✓, A1 denominator contract in measurement-design.md line 27 matches plan claim ✓, Producer Preflight empirical claims (no env-snapshot files) ✓, session-start.js already has session_start emit code (line 774) and env-snapshot write (line 800), which Task 1 will unblock via session-identity fix ✓. Verified L10 reverse pattern in env-contract/lint.js for DD2 test assertion ✓. Checked boundary—formatValue early return for forward-only status (line 165) correctly prevents C2/C3 value-cell placement per DD11 ✓. Validated Files to Change alignment with Tasks. Checked residual path injection risk (DD1 final para): plan correctly limits export to resolveRawSessionId only and Task 2 asserts path.join non-reach ✓. Pattern mirrors (orchestration-runaway, toggle-snapshot, c1-coverage-gate) all present and analogous. Validation split into PRE/POST for task_completed circularity already documented in Risks/Acceptance ✓. No unhandled cases found: session-start.js producers already in-code but blocked; Task 1 unblocks them; env-snapshot files checked in PRE validation as achievable after session ID fix. |
| security | pass | Examined: (1) Session ID resolution chain—confirmed existing code sanitizes before file path use, new resolver maintains sanitization at call sites, Task 2's static scan for direct path.join usage has incomplete data-flow coverage but is documented as acknowledged residual risk in DD1 with explicit notation "구조적 보장이 아니라 test 보장"; (2) Event allowlist expansion—pr_number and gate_decision_id additions don't introduce new trust boundaries (GitHub API and receipt registry are authoritative); (3) PR number sourcing—gh pr view --json number is authoritative external source; (4) Emit point coordination—task_started restricted to ALLOW/INFORMATIONAL paths (DD4 correct), task_completed and task_ship_sealed at explicit checkpoints; (5) MSW events and findings append patterns—O_APPEND with per-session sharding, field allowlist drops unknown keys silently (safe); (6) Multiple independent session resolver sites—verified all documented consumers sanitize before file operations. Plan explicitly acknowledges residual test-based (not structural) guarantee in DD1 and documents this as acceptable trade-off given code review and test coverage. No structural defect found that bypasses documented mitigations. |
| test | fail | Attacked claimed-computable list lockstep enforcement (R1-2 HIGH absorption claim): Verified the two lists exist (test file lines 87-92, cli.js lines 246-250), confirmed they are currently drifting (C1 missing from cli.js), searched for mechanical test comparing them across both files and Validation section—found none. Examined msw-metrics-acceptance.test.js entire test suite for any lockstep assertion—not present. Checked Files to Change for test addition specifying the assertion—not listed beyond promotion action. Attempted to run referenced test files (session-identity.test.js, m8-coverage-gate.js, m8-audit-sample.json, m8-assertion-manifest.json)—all CREATE tasks, none pre-exist. Verified emit points claim by checking c1-coverage-gate.js pattern and estimating the 5 locations—structure defensible but m8-coverage-gate.js does not exist to validate. Traced Validation section commands: all reference files the plan will create, none are currently executable. Cross-checked plan claims against code state using Grep and Glob for concrete references. |
| invariant | fail | Attacked receipt anchoring (circularly-stamped metrics), fail-open gates (lockstep validation missing), skip predicates (no mechanical test for claimed-computable set equality), accounting/launches (session-identity module export unvalidated), and HALT vs degrade (metrics-assert doesn't enforce lockstep). I read the plan, PRD, existing code at the cited lines (msw-metrics-acceptance.test.js, derive/cli.js, index.js), ran grep searches for test assertions comparing the two lists, examined the Validation section command by command, and traced the Acceptance criteria against what they actually test. The core defect: plan claims to fix a known drift (acknowledged at line 154) by mechanical enforcement, cites a validation command that doesn't actually enforce it, and has no fallback test that would catch the drift if code drifts again post-merge. |

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
  "wall_clock_ms": 1162476,
  "halt_stage": null,
  "backlog_appended": 9,
  "backlog_skipped_nonblocking": 3,
  "granted": 4,
  "reviewed_plan_hash": "sha256:3b5b0470a301aa84564076557e40c4a20b397cbeb4322670344088ff81bc1ad6",
  "plan_path": ".claude/plans/multi-session-work-loop-m8.plan.md",
  "recorded_at": "2026-08-25T01:25:49.542Z"
}
```
