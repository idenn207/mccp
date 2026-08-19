# Plan Review Panel — review-loop-bypass

**Plan**: `.claude/plans/review-loop-bypass-m2.plan.md` · **Plan version**: `sha256:6848f0fd9b1b02fb1179b0500509091310f0ac61218ad89e07b0f9bf179644f7`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 7 blocking finding(s): architect/CRITICAL, architect/HIGH, architect/FAIL, test/HIGH — MCCP_REVIEW_SINGLE_PASS=deadline_pressure 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | CRITICAL | M2 plan cites `plugins/mccp/scripts/lib/review-single-pass.js:151` (assertSingleRound) and `review-single-pass.js:121` (dispatch log append-only) as patterns to mirror in the Patterns to Mirror table, but this file does not exist in the codebase. | Glob and grep searches confirm no file matching `review-single-pass.js` exists in C:/_project/mccp/plugins/mccp/scripts/lib/ or any worktree. M1 plan (status: complete, v1.28.1) lists `plugins/mccp/scripts/lib/review-single-pass.js` as a CREATE task, implying it was supposed to be created by M1, but it is not present. Plan lines 34-46 cite this file as an existing pattern three times in the Patterns to Mirror section. |
| architect | HIGH | The plan's reliance on M1 deliverables being merged into main is unstated. The plan's boundary and dependencies on M1 completion are not explicitly confirmed. | The M1 STATE.md claims 'M1 구현·병합 완료' (implementation and merge complete) as of 2026-08-18, but the cited files do not appear in main branch. No receipt or merge validation is shown in M2 plan to confirm M1 shipped. The Patterns to Mirror section assumes M1 code is part of the codebase without stating this dependency or verifying it exists. |
| test | HIGH | DD1 — 적재가 실패하면 완화하지 않는다(HALT). This is claimed as a core precondition invariant to prevent data loss. | Plan line 72 explicitly states the core principle; lines 74-75 justify it. However, the Acceptance criteria (lines 217-220) specify four test cases: (a) toggle on succeeds + appends rows, (b) idempotence, (c) toggle off + no appending, (d) receipt fields correct. None of these acceptance criteria test the failure path: 'If backlog-append fails (e.g., header missing), the gate HALTs and does NOT relax.' Task 1 promises a unit test but does not explicitly require coverage of the failure case where header is missing and appendRows must fail. |
| test | MEDIUM | The Validation section (lines 156-157) tests the consumer roundtrip by calling scanBacklog and verifying it succeeds. This validates the happy path but not the error path. | Line 157 command: `node -e "const s=require('./plugins/mccp/scripts/derive/sources/backlog').scanBacklog(process.cwd()); if(!s.ok){throw new Error(s.error)};..."` only runs on a valid backlog. However, backlog.js (lines 25-30) returns `ok: true` with a warning if the header is missing, so this validation would not catch a malformed backlog. Meanwhile, the new backlog-append writer (Task 1) should fail if header is missing per line 110. The asymmetry—reader graceful, writer strict—is the intended enforcement, but it is not tested. |
| invariant | HIGH | Task 1 function signature accepts both `decision` and `l2` parameters (L110), but blockingFindings exist only in decision.quorum, not in l2. Missing explicit mandate that blockingFindings must source from decision.quorum creates risk of implementing helper that reads blockingFindings from wrong source. | M2 plan L110: 'deriveBacklogRows({decision, l2, planPath, slug, today})...quorum.blockingFindings에서 행 배열을 만든다'. Quorum.js:207 shows blockingFindings is a field of the quorum object returned by decideQuorum. CLI.js:546 outputs 'Object.assign({}, decision, {quorum: quorum})' to decision.json, but l2.json is the raw workflow return containing only results, not computed blockingFindings. Task 1's dual parameter design does not specify that blockingFindings MUST come from decision.quorum, not from a reconstructed/recomputed source. |
| invariant | MEDIUM | Step 5.2g2's execution order creates a gap: backlog-append reads decision.json (written by 5.2e), but decision.json is only populated IF the decide command exits 0. If 5.2e halts due to decision.block=true before line 546 executes, decision.json may be partially written or have stale quorum.blockingFindings from a prior run. | Plan.md 5.2e shows 'cli.js decide ... > decision.json' with DECIDE_EXIT check at L1431. If decide returns exit 12 (block=true), line 546 never executes, but the file may still exist from a prior invocation. Task 4 (L128) specifies 'decision.json의 single_pass_reason이 비어 있으면 no-op으로 통과' but does not mandate flushing stale decision.json when single_pass_reason is absent. The toggle relies on single_pass_reason existing (line 540-543 of cli.js), but if the toggle is active and quorum failed but decide still blocked for another reason (e.g. L1 divergent), decision.json may carry stale blockingFindings from an earlier round. |
| invariant | MEDIUM | DD1 claims '적재 실패하면 완화하지 않는다 (HALT)' but does not enumerate all failure modes. If backlog-append fails silently (returns EX_BLOCK) and the shell script at 5.2g2 misses that exit code, the gate could pass without appending. The plan states Task 4's failure branch must 'exit' explicitly, but does not mandate that success-path continuation past 5.2g2 only happens when append succeeded. | Task 4 L128: 'backlog-append를 호출한다. 비영점이면 recorder를... exit' — but specifies ONLY the failure branch. Success path is silent: no explicit 'exit 0' or status check mandated after backlog-append succeeds. If backlog-append exits 0 silently and the script continues to 5.2h/5.6, the findings would be recorded as appended (via Measurement) even if the actual append to the markdown file was skipped. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | Verified all citations in Patterns to Mirror table (lines 34-46) against actual codebase. Searched for review-single-pass.js by exact name and by pattern matching (single-pass, review.*single, assertSingleRound). Checked both main branch and all worktrees. Examined M1 plan to understand what was supposed to be created. Confirmed M1 plan line 59 lists review-single-pass.js as CREATE task but file does not exist. Verified backlog.js line 7 is a regex definition, not line reference as plan claims for parser contract pattern (minor citation accuracy issue but load-bearing logic is the phantom review-single-pass.js). |
| security | pass | Attacked: (1) Can findings be silently lost after M1 relaxation? Traced gate flow — append-failure HALTs before receipt write, findings preserved in l2.json + review record. (2) Does pipe escaping prevent parser breakage? Checked backlog.js split logic — HTML entity won't match `\\s*\\\|\\s*/` regex, safe. (3) Can the backlog file be poisoned or traversal-attacked? Path is hardcoded relative, no user control, git-tracked. (4) Can the digest collision be exploited? Only if identical {plan_hash, perspective, severity, claim} — append-only semantics make duplicate-append harmless. (5) Are there race conditions in append? Plan calls for atomic rename, not verified in code-not-yet-written but standard pattern. (6) Can the gate be bypassed if backlog-append succeeds but isn't recorded? Explicit exit required; Task 3 reads backlog.json and records result. (7) Do findings leak into unexpected files? Already in durable review markdown at `.claude/reviews/`; backlog is just append-only index. |
| test | fail | I read the plan and PRD; traced through the referenced code paths (quorum.js, backlog.js, review-single-pass-command-body.test.js); verified that the test file `plan-review-backlog-append.test.js` does not yet exist; checked the Acceptance criteria against the Design Decisions; examined the Validation section command-by-command; and searched for any explicit acceptance test of the failure case where backlog-append fails. I found that DD1 is a core invariant ('if appending fails, gate HALTs') but no explicit acceptance criterion requires testing that behavior. Task 1 will create a unit test, but the plan does not name what test cases it must contain. The static assertions in Task 5 verify plan.md has HALT code, but no integration test verifies it actually fires when appending fails. The Validation section line 157 tests successful reads but not malformed backlog files." |
| invariant | fail | Traced M1 single-pass implementation: verify toggle activates at quorum failure (decide.js:328-340 ✓); confirm blockingFindings computed in quorum.js:159-207 ✓; verify quorum output includes blockingFindings (quorum.js:207, cli.js:546 ✓). Checked backlog-append function signature in Task 1 and found it accepts both `decision` and `l2` without explicit mandate that blockingFindings source is decision.quorum. Examined 5.2g2 execution order for stale-JSON risk and found no fresh-start guarantee. Verified DD1's HALT claim does not specify what happens when backlog-append returns exit 0 (success) but the append actually failed silently. |

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
  "wall_clock_ms": 675158,
  "halt_stage": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:6848f0fd9b1b02fb1179b0500509091310f0ac61218ad89e07b0f9bf179644f7",
  "plan_path": ".claude/plans/review-loop-bypass-m2.plan.md",
  "recorded_at": "2026-08-18T08:57:02.107Z"
}
```
