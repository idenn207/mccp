# Plan Review Panel — multi-session-work-loop-m9

**Plan**: `.claude/plans/multi-session-work-loop-m9.plan.md` · **Plan version**: `sha256:bc41d0011125a86633a9548b3c5adf5f4324ef18750bccbd08e4eff079e2aaf4`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 10 blocking finding(s): security/CRITICAL, security/CRITICAL, security/HIGH, security/FAIL — MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| security | CRITICAL | Field name mismatch between CLI producer and registry allowlist: cli.js sets event.pr_number but ALLOWED_FIELDS expects remediation_pr, causing silent data loss | plugins/mccp/scripts/state/cli.js:395 sets event.pr_number; plugins/mccp/scripts/state/findings-registry.js:102-103 has remediation_pr in ALLOWED_FIELDS; eventToJsonLine (lines 254-256) filters to ALLOWED_FIELDS only, so pr_number is silently dropped |
| security | CRITICAL | Plan's Task 4 acceptance criteria cannot be met due to remediation_pr field never being populated in registry records | Plan line 195-196: acceptance requires 'with_remediation_pr이 0 → 2로 오르는지' but fields-registry.js validateAttributionFields (line 115) checks event.remediation_pr which cli.js never populates |
| security | HIGH | Validation creates false trust: CLI successfully validates and passes --pr-number flag, creating false confidence that data is being recorded when it is silently discarded | cli.js lines 388-396 validate pr_number as unsigned integer with no error, passing validation to caller. But findings-registry eventToJsonLine will drop this field. Validation occurs but data is lost. |
| test | MEDIUM | Files to Change table lists all modifications to test files | Line 91 lists CREATE for `msw-m9-producers.test.js`, but plan text at lines 169-171 (Task 2), 184 (Task 3), and 197 (Task 4) describes this file being modified by all three tasks. Table shows only CREATE; should also list UPDATE for Tasks 3 and 4. By contrast, line 92 correctly lists UPDATE for `msw-metrics.test.js`. |
| test | MEDIUM | Validate section specifies how to run negative test for Task 6 coverage gate | Line 229 and lines 291-293 describe that the gate must exit non-zero when predicates are false. However, the Validate section (lines 307-334) shows only positive test: `node plugins/mccp/scripts/lib/msw-metrics/m9-coverage-gate.js --json` (line 318) with no second invocation showing negative case (false fixtures). Plan text requires gate assertion that falsified predicates block flip, but Validate section doesn't show how to verify this. |
| test | MEDIUM | Validate section clarifies ordering dependency for shared test file across Tasks 2-4 | Lines 106-113 explain that test file is created by Task 2 and incremented by Tasks 3-4: 'Task 2에서 생성되고 Task 3·4에서 증분 확장된다'. Lines 168-171, 184, 197 describe per-task assertions in same file. But Validate section at line 314 just says `node --test plugins/mccp/scripts/lib/tests/msw-m9-producers.test.js` without clarifying this must run **after all three tasks complete**, not incrementally. Readers cannot tell if validation happens after each task or after all tasks. |
| test | LOW | Validate section runs Task 7a predicate test with both passing and failing cases | Plan text at lines 249-251 defines three rows with boolean predicates that must ALL be true before flip is allowed. Lines 291-295 require testing both: '(1) flip된 행의 술어가 전부 true' AND '(2) 술어를 거짓으로 만든 fixture에서 gate가 비영점으로 끝나 flip이 거부되는 negative test'. But consolidated Validate section (lines 307-334) shows only `scan.js` positive case at line 324; no negative fixture where one row's predicate is false is shown. |
| invariant | CRITICAL | M9 milestone will remain in-progress after plan execution, blocking archive-complete gate per CLAUDE.md §3.11 C3 invariant | .claude/plans/multi-session-work-loop-m9.plan.md:249-251 specifies predicates for M5, M8, M4 flip only; no predicate for M9. M9 row in PRD:160 shows status will remain 'in-progress'. CLAUDE.md §3.11 C3 requires `rawRowCount === complete + dropped` for archivability. With 9 milestone rows total (M1-M9), only 8 will be complete after Task 7a, leaving 1 in-progress. This fails the C3 equation: 9 !== 8+0. |
| invariant | CRITICAL | Plan Acceptance (line 379) requires archive-complete to move 'PRD + plan 9건' but this violates CLAUDE.md §3.11 C2 invariant | .claude/plans/multi-session-work-loop-m9.plan.md:379 acceptance checkpoint states '/mccp:archive-complete를 실제로 1회 완주해 PRD + plan 9건이 이동'. CLAUDE.md §3.11 C2 states '완료 plan archive는 PRD 전체 완료 시에만' — only when PRD is fully complete (all rows either complete or dropped) can plans be archived. If M9 remains in-progress, C2 blocks archiving the entire PRD and its plans. The 9-plan move assertion cannot be satisfied under C2. |
| invariant | CRITICAL | Circular gate dependency: M9 Acceptance criterion depends on archive-complete succeeding, but archive-complete requires M9 to be complete | .claude/prds/multi-session-work-loop.prd.md:160 defines M9's Outcome as '완료 판정은 `/mccp:archive-complete`가 이 PRD를 `archivable:true`로 판정하고 실제 이동을 1회 완주하는 것' — completion is defined by archive-complete success. But per C2/C3, archive-complete only succeeds if M9 is complete. This creates a logical deadlock: M9 completes when archive-complete succeeds; archive-complete succeeds only when M9 is complete. |
| invariant | HIGH | A3 baseline measured_at stale check may fail silently after Task 1c | .claude/plans/multi-session-work-loop-m9.plan.md:251 M4 predicate requires 'after.measured_at이 현재 CLAUDE.md digest와 일치'. Line 131-134 states only `after` is updated by Task 1c, not `measured_at`: '`after`만 갱신된다'. Current CLAUDE.md is 119,295B per line 51. If `measured_at` is a digest and is not updated when CLAUDE.md grows, the predicate's first condition (equality check) will fail. The OR clause provides fallback (documented non-measurement), but this means M4 flip will gate on whether A3 non-measurement is properly documented in the PRD amendment, not on actual measurement freshness. |
| invariant | MEDIUM | Test validation phase may not enforce actual test output assertions for A3 graceful-degrade claim | .claude/plans/multi-session-work-loop-m9.plan.md:310-311 Validation shows manual CLI invocation with only exit code check. Line 141-145 states acceptance requires 'tiktoken 부재를 강제한 환경에서 `a3 --print`의 stdout JSON이 `status === 'error'` ∧ `not_delivered_reason`이 `tiktoken`을 포함'. Plan cites this assertion must be added to msw-metrics.test.js (line 145) in same commit as Task 1a. However, Validation block (line 310) only eyeballs exit code, not test pass/fail. If the actual test assertion is missing or fails, Validation passes anyway. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | Verified: (1) A3 stdin error handler gap + crash diagnosis accurate; (2) C1 finding_closed producer absent in plan-review path; (3) C2/C3 hardcoded empty FINDING_ID literals never auto-derive; (4) A2 producer exists but disabled (not user-installed statusline); (5) all pattern citations to existing code (m8-gate, closure-mapping, resolving-types) confirmed accurate; (6) task dependencies acyclic (T2 creates test, T3/T4 extend, T6 validates, no back-edge); (7) acceptance criteria all achievable—conditional tests don't block contingent paths; (8) predicate anchor reference exists in PRD; (9) binary Task 5 outcome forces one of two legitimate branches. Found no structure that hollows claimed invariants, no unverifiable assumptions, no self-blocking gates, no audit-trail erasure. Honest scope limitations on threat model + mechanism (post-check gate, not preventive)." |
| security | fail | Traced the remediation_pr attribution field through the complete data path: (1) CLI flag parsing and validation in state/cli.js, (2) event object construction, (3) findings-registry allowlist definition and eventToJsonLine filtering, (4) validateAttributionFields contract, (5) acceptance test requirements in plan. Confirmed field name mismatch prevents the critical C2/C3 attribution triangle from ever being established. The plan explicitly requires this metric to increase from 0→2 in acceptance tests, but the schema prevents the required field from being written to disk. Checked for field name mapping or runtime conversion - none exists. Verified ALLOWED_FIELDS allowlist filtering is the sole write path for findings registry events. |
| test | fail | Checked (1) whether referenced files exist: cli.js, archive-complete/scan.js, derive/cli.js all exist; msw-m9-producers.test.js and m9-coverage-gate.js correctly do not exist yet (created by tasks). (2) Whether Files to Change table lists all modifications: line 91-102 identifies CREATE for m9-producers but not subsequent UPDATE entries for Tasks 3 and 4; contrast with line 92 which correctly lists UPDATE for msw-metrics.test.js. (3) Whether Validate section shows all test cases: line 314 shows only positive test for shared file; line 318 shows only positive gate case without negative fixture. (4) Whether ordering dependencies are explicit: lines 106-113 explain strategy but Validate section doesn't clarify "run this after Task N completes" for shared test file. (5) Plan text claims falsifiability (lines 140-145, 230, 293) but Validate section incompletely specifies those tests. |
| invariant | fail | Attacked the plan's fail-closed gate invariants via three vectors: (1) status table completeness for archive-complete gate (CLAUDE.md §3.11 C2/C3) — confirmed M9 stays in-progress while only M4/M5/M8 flip to complete, failing C3 arithmetic; (2) circular dependency between M9 Acceptance criterion and archive-complete success; (3) Task 1c baseline freshness check predicate logic where only `after` value is updated but `measured_at` field is not, potentially failing the non-stale predicate; (4) Validation block adequacy for strong A3 assertions. Found that plan accepts conditions its own execution prevents from being satisfied (HALT vs degrade erosion). |

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
  "wall_clock_ms": 457806,
  "halt_stage": null,
  "backlog_appended": 10,
  "backlog_skipped_nonblocking": 5,
  "granted": 4,
  "reviewed_plan_hash": "sha256:bc41d0011125a86633a9548b3c5adf5f4324ef18750bccbd08e4eff079e2aaf4",
  "plan_path": ".claude/plans/multi-session-work-loop-m9.plan.md",
  "recorded_at": "2026-08-27T07:47:19.193Z"
}
```
