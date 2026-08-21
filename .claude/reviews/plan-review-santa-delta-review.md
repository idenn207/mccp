# Plan Review Panel — santa-delta-review

**Plan**: `.claude/plans/santa-delta-review-m1.plan.md` · **Plan version**: `sha256:523d272c8efdddd551fffc07945d8dcad74188166472a22524a622e28fd22a86`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 7 blocking finding(s): test/HIGH, test/HIGH, test/FAIL, invariant/HIGH — MCCP_REVIEW_SINGLE_PASS=deadline_pressure 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| test | HIGH | Task 4 `santa-delta-instrumentation.test.js` validation will catch missing or incorrect receipt field implementations | Plan line 253 specifies validation as `node --test plugins/mccp/scripts/lib/tests/santa-delta-instrumentation.test.js` and line 121 names the test's scope as 'ledger storage, projection, aggregation, stamp, absence discrimination'. However, the plan never specifies what assertions the test should make about receipt.meta.santa_delta_rounds or receipt.meta.santa_delta_paths_dropped. The test description focuses on oracle function testing (ledger/seal), not integration testing of write.js SANTA_INT_FIELDS additions or schema.js validation. Existing pattern (santa-review-gate.test.js lines 86-102, 120-132) shows such tests DO check receipt field round-tripping and presence/absence behavior, but the plan does not specify equivalent assertions for delta fields. Without explicit unit tests for write.js and schema.js changes, the test could pass even if those modifications are missing entirely. |
| test | MEDIUM | DD12 requirement — delta fields are stamped even when mode=off — will be caught by automated tests | Plan line 91-94 (DD12) explicitly requires that when delta is off, `santa_delta_rounds=0` and `santa_delta_paths_dropped=0` are stamped (not absent). Line 386 of Acceptance lists this as a checkbox criterion. However, no unit test is specified that would verify this behavior. The only validation specified (line 253, 340) is the single call to santa-delta-instrumentation.test.js, whose scope (line 121) makes no mention of testing the conditional stamping logic based on mode. Task 10 manual testing (line 323-332) includes this as an observation requirement, but observations cannot fail-closed if the code path is wrong. |
| test | HIGH | Plan's Task 4 validation is complete with only `santa-delta-instrumentation.test.js` | Task 4 (line 210-253) describes 4 implementation layers: (1) ledger, (2) CLI, (3) seal/aggregation, (4) receipt write/schema. Line 253 specifies only one test: `santa-delta-instrumentation.test.js`. The plan does not specify validation for layer 4 (receipt write/schema), which involves modifications to write.js SANTA_INT_FIELDS (line 248) and schema.js (line 248). While line 252 lists mirror patterns for schema.js:1041-1047, no test is specified to verify those mirror locations are actually modified or that the modifications are correct. The Validation section (line 336-349) mentions running existing tests (adjudication, seal, santa-review-gate) but does not add any new test for delta-specific receipt field validation. |
| invariant | HIGH | Task 5 promises critical shell code extraction (APPLIED/REASON/BEFORE/AFTER from delta.json → begin-round flags) but provides no actual code or precise specification | Plan Task 5, lines 273-274: '`APPLIED`/`REASON`/`BEFORE`/`AFTER`를 `delta.json`에서 뽑아 Step 3의 `begin-round` 스칼라 4종(Task 4)으로 넘긴다.' The plan refers to this as a contract ('순서와 변수가 계약이다') but shows no shell code or detailed step-by-step instructions for the extraction. Test (santa-delta-command-body.test.js) can only verify scope-delta call order, not value extraction logic. |
| invariant | HIGH | State assertion blocking mechanism lacks specified exit code and error boundary | Plan Task 3, line 205: 'assertNoStatusAssertion(prompt, PRIOR_ROUND_PATTERNS)`를 걸고 위반 시 던진다' (throw on violation). However, the plan does not specify: (1) what exit code the throw produces, (2) whether it's caught by the CLI or becomes an unhandled Node exception, (3) how santa-loop.md Step 3 should handle this failure. The pattern check gate relies on implicit behavior rather than explicit specification. |
| invariant | HIGH | Task 5 integration specification references 'same form as scope-always' but omits exact insertion point and complete error handling | Plan Task 5, line 257: 'always-on과 같은 형태로' (in the same form as always-on) but does not provide: (1) the exact lines from santa-loop.md where this block should be inserted, (2) complete error handling for scope-delta failure, (3) what happens if scope-delta times out or crashes. Validation test line 281 references 'PATHS_STATE 3상태 검사' (three-state check) parallel to always-on, but this is described not shown. |
| invariant | MEDIUM | Pattern lists are specified by example, but actual validation is delegated to test without showing test code or pattern set concordance | Plan Task 1, lines 159-163 shows example patterns (SCOPE_ASSERTION_PATTERNS, PRIOR_ROUND_PATTERNS) and says 'test가 그 **원소 집합 자체를 pin**한다' (test pins the set itself). But the plan reader cannot verify: (1) whether the test will use these exact examples, (2) whether test and code will agree, (3) if test and code both diverge from plan examples, who catches it. Line 159 says patterns are 'closed literal set' but doesn't show the actual code constants. |
| invariant | MEDIUM | Receipt stamping for non-applied delta cases is ambiguous regarding present-only field semantics | Plan Task 4, lines 240-247 describes seal layer stamping 'santa-delta-rounds' and 'santa-delta-paths-dropped' with DD12: '**kill switch와 무관하게 stamp한다**' (stamp regardless of kill switch). However, when delta.applied=false, the plan says 'scope`를 투영하되 형태가 어긋나면 `null`로 접는다' (fold to null if shape is wrong) but doesn't explicitly state whether null → stamp(0) or null → omit key. Line 250 says these are 'present-only 비음 정수' (present-only non-negative integers), but doesn't show the code contract for when they're present vs absent. |
| invariant | MEDIUM | No explicit fail-closed gate for scope-delta CLI invocation in santa-loop.md Step 1 | Plan Task 5 describes calling scope-delta (line 263: '`scope-delta --paths-file "$TMPDIR_SANTA/scope-diff.json"` 호출. 출력을 `$TMPDIR_SANTA/delta.json`에 보존한다') but Task 5 references 'always-on과 같은 형태로' without showing the exit code check. Santa-loop.md's existing scope-always block (lines 87-96) shows explicit `ALWAYS_EXIT` check and 'NOT launching reviewers' on failure. Task 5 must provide equivalent code but does not. |
| invariant | MEDIUM | Durable receipt fields are present-only but no explicit recovery path if delta.json is lost between Step 1 and Step 3 | Plan Task 5 writes delta.json to tmp directory in Step 1, then Step 3 must read values from it to pass to begin-round (lines 273-274). If delta.json is lost (disk error, tmpdir cleanup, process restart), Step 3 has no way to recover those values. The plan doesn't specify error handling for missing delta.json, and acceptance gate only verifies receipt has fields, not that extraction succeeded. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | Verified 6 cited code patterns exist and match claims. Confirmed anchor discovery in Task 2 naturally enforces UI3 (round 1 has 0 priors, triggers passthrough) by checking existing santa-loop.md round numbering. Verified UI4 exemption works via order: Task 2-5 flow shows delta narrows scope, then scope-always discovers and re-adds plan/PRD from filesystem (cmdScopeAlways:1249-1250 calls discoverSlugPlans independently of diff scope). Verified 4-layer durability (ledger/CLI/seal/receipt) follows existing additive pattern (ledger.js:298 terminated field). Confirmed architect HIGH defect is resolved: original --round input requirement had circular dependency (needed in Step 1, computed in Step 3), new design avoids this by anchor discovery via readdirSync. Checked dispatch↔usage sync test feasibility: both exist in cli.js (usage:1338, runCli:1363) and can be pinned. Found no invariant violations, boundary leaks, or abstraction breaks. |
| security | pass | Checked prototype pollution boundary (CLI JSON input eliminated by scalar flag design); traced data flow from untrusted diff through shell extraction to CLI validation and ledger storage; verified trust boundaries for scope metadata (write-time validation enforced); checked for path traversal in anchor discovery (literal filename matching used); checked for leakage into durable artifacts (no absolute paths or secrets); verified pattern-matching ceiling documented with residual risk accepted; checked for bypass paths via override escapes or unvalidated intermediate steps — found none. |
| test | fail | 1. Attacked: Plan's claim that validation via `santa-delta-instrumentation.test.js` will catch all implementation defects. Read Task 4 (4 layers) and found only 1 test specified, with scope description that does not mention receipt schema testing. Examined existing test pattern (santa-review-gate.test.js) to understand what receipt field tests look like, then verified the plan does not require equivalent tests for new delta fields. 2. Attacked: DD12's falsifiability (delta fields stamped even when off). Found that Acceptance line 386 makes this a checkbox criterion, but no automated test path is specified that would execute the conditional stamping logic and assert the field presence/values. Only manual Task 10 testing checks this. 3. Attacked: Task 4 layer 4 (receipt modifications) specification completeness. Read write.js lines 758-776 (existing SANTA_INT_FIELDS pattern) to understand the required change, then verified the plan specifies the change (line 248-250) but does not specify a test for it. Checked schema.js validation patterns to understand what test form should exist (lines 1023-1047), then found no test specified for delta fields. 4. Did NOT find evidence that Task 10 manual testing would be prevented by failed automated tests. The manual testing is post-facto observation, not falsifiable validation of the implementation before submission. |
| invariant | fail | Attacked through invariant erosion lens: (1) fail-closed gates — checked if state assertion blocking has explicit error boundaries and exit codes; (2) receipt anchoring — verified durable record specification for delta rounds/paths-dropped fields and whether they're properly stamped in all cases; (3) rollback safety — examined scope-delta invocation error handling in santa-loop.md Step 1 and recovery if delta.json is lost. Found three HIGH-severity gaps where plan promises code/behavior but omits specifications: (a) Task 5 describes extracting 4 values from delta.json to pass to begin-round but shows no shell code or error handling, (b) state assertion blocking throws but plan omits exit code and error boundary specification, (c) Task 5 integration references 'same form as always-on' without showing exact insertion and error handling. Also found 4 MEDIUM gaps around pattern list concordance, receipt stamping ambiguity for non-applied cases, missing begin-round exit code check in Step 1, and no recovery path if delta.json is lost mid-round. |

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
  "wall_clock_ms": 1061977,
  "halt_stage": null,
  "backlog_appended": 7,
  "backlog_skipped_nonblocking": 5,
  "granted": 4,
  "reviewed_plan_hash": "sha256:523d272c8efdddd551fffc07945d8dcad74188166472a22524a622e28fd22a86",
  "plan_path": ".claude/plans/santa-delta-review-m1.plan.md",
  "recorded_at": "2026-08-20T07:06:39.751Z"
}
```
