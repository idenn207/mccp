# Plan Review Panel — review-loop-bypass-m2

**Plan**: `.claude/plans/review-loop-bypass-m2.plan.md` · **Plan version**: `sha256:de85a8cbe5e8843280fb5b71e925ecd291ab7bdb59abbd1bd7f0b0a017b62718`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 10 blocking finding(s): security/HIGH, security/HIGH, security/HIGH, security/FAIL — MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| security | HIGH | Path normalization enforcement (DD4, E7 prevention) is incompletely specified; deriveBacklogRows lacks repoRoot parameter required to normalize absolute paths to repo-relative, but plan requires 'oracle must enforce' this normalization | Plan line 102: '셀에 들어가는 두 경로(`planPath` · `reviewPath`)는 repo-relative로 정규화한 뒤에만 싣는다' + '오라클이 강제해야 한다'. Task 1 function signature line 118: `deriveBacklogRows({decision, planPath, slug, today})` omits `repoRoot`. By contrast, `appendRows({repoRoot, rows})` line 118 includes it. Without repoRoot parameter, a pure function cannot normalize absolute paths to repo-relative. Precedent from write.js normalizeReceiptCwd (line 102-103 cites it) requires repoRoot to compute relative path. |
| security | HIGH | Required test case for absolute path normalization (DD4 E7 prevention) is mentioned in narrative but absent from test section specifications | Plan line 102-103: 'Task 1의 필수 test에 절대경로 입력이 repo-relative로 정규화되는 케이스를 포함한다' (required test must include absolute path normalization case). Test cases section lines 119-127 lists: (1) escape roundtrip, (2) idempotent, (3) missing header, (4) missing decision.json, (5) no toggle set. None test absolute path → repo-relative conversion. This is a concrete gap: stated requirement vs. stated implementation. |
| security | HIGH | CLI design does not specify how planPath argument (from shell) is validated or normalized before reaching deriveBacklogRows, creating path injection surface | Task 2 line 125-126: CLI takes `--plan <p>` but does not specify validation of <p>. If <p> is absolute (likely from plan.md shell context), and deriveBacklogRows cannot normalize (no repoRoot), the absolute path flows to escapeCell() output and into git-tracked backlog file. Plan states line 102 the risk is real: '이것은 가정이 아니라 이 저장소가 이미 겪은 사고다' (this is not theory; this repo already suffered this incident). Yet Task 2 does not address it. |
| test | HIGH | Static assertions in Task 5 (review-single-pass-command-body.test.js) are sufficient to verify that plan.md 5.2g2 block correctly halts when backlog-append fails | Plan Task 5 explicitly states: 셸 인용 실수, 종료코드 미검사, 호출은 하되 결과를 무시하는 블록은 **전부 통과한다** (Shell quoting mistakes, unchecked exit codes, call-but-ignore blocks all pass). The Validation section lists only unit tests and static assertions—no end-to-end test that runs plan.md 5.2g2 with a failing backlog-append to verify the gate actually halts. Acceptance tests that would catch this (item '실패 경로를 실제로 발화시킨다') are manual and not mechanically enforced by the gate. |
| test | HIGH | Validation section will catch all runtime defects in the 5.2g2 block implementation | Validation section lists: unit tests for backlog-append (Task 1-3) and static assertions on plan.md (Task 5). Neither can catch code like: `node cli.js backlog-append ... \|\| true` (suppresses exit code), `RESULT=$(cli.js backlog-append ...)` (captures stdout, loses exit code), or `if [ -z "$SINGLE_PASS_REASON" ]; then return; fi` (block never executes). All three would pass Validation but fail DD1's core requirement: 'if append fails, HALT'. Task 5 itself admits this gap but resolves it via manual Acceptance tests, which are not part of Validation. |
| test | MEDIUM | Task 5's static assertions verify that the 5.2g2 block is positioned correctly between 5.2g and 5.2h phases | Task 5 specifies three assertions: (1) block calling backlog-append exists in plan.md, (2) it gates on single_pass_reason, (3) failure branch has --halt-stage 5.2g2 and exit. None of these verify the block's position in the command flow. A block could be in the wrong phase (e.g., before 5.2g or after 5.2h) and still pass all three assertions if it contains the required tokens. Task 4 requirements state placement: '5.2g와 5.2h 사이에', but this is narrative-only verification, not mechanically tested. |
| test | LOW | The Validation commands in the plan can be executed as written to verify the implementation | Task 2 Validate line points to `plugins/mccp/scripts/lib/tests/plan-review-backlog-append.test.js` which does not exist yet. The plan is prescriptive (describing what should be tested) rather than descriptive (defining a test that exists now). While this is acceptable for a plan, it means the Validate lines cannot be run until after implementation. However, the plan presents Validation as something already checkable against the design. |
| invariant | CRITICAL | Plan violates UI3 constraint (zero loss of findings) via unconstrained verify-proof failure before backlog-append runs | Plan places backlog-append at 5.2g2 AFTER verify-proof (5.2g) per DD6 (line 112). When verify-proof fails at 5.2g (plan.md:1536-1543 exits code 12), execution halts immediately with `exit 12` before reaching 5.2g2. blockingFindings are present in decision.json (line 546 of cli.js: `Object.assign({}, decision, { quorum: quorum })`), but backlog-append never runs (Task 2:125 `--review-dir` read of decision.json → appendRows never executes). decision.json is `.claude/state/plan-review/` (worktree-only, not git-tracked), so blockingFindings disappear when worktree is cleaned or session ends. This directly violates UI3 (line 19): '미흡수 지적의 유실은 0건이다' and the Acceptance criterion (line 242-243): 'N은 그 실행의 blockingFindings 길이와 같다'. |
| invariant | HIGH | Failure mode design (DD6) creates no path to recover lost blockingFindings in verify-proof failure scenario | DD6 (line 112) justifies backlog-append placement AFTER verify-proof with reasoning: 'proof가 무효인 실행의 finding을 원장에 남기면 검증되지 않은 리뷰가 감사 기록이 된다'. But this assumes verify-proof succeeds when decision.json was validly written. DD1 (line 76) proposes recovery: '퇴로는 새 env가 아니라 토글을 끄는 것이다' (way out is turn off toggle). However: (a) this does not recover findings from the CURRENT run (they're already in worktree-only decision.json); (b) next run with toggle off will re-run L2 and re-produce the same findings, creating audit duplication; (c) the plan does not document this behavior or its cost. |
| invariant | MEDIUM | Decision object guaranteed to contain reviewed_plan_hash at 5.2g2 time makes hidden assumption about earlier path verification | Plan DD3 (line 90) claims reviewed_plan_hash is guaranteed present: '그 필드는 적재 시점에 **존재가 보장**된다'. This is true IF we reach 5.2g2, because all earlier blocks check it (decide.js:288-301 DD13 bind returns early if absent). However: the plan conflates 'field exists if we reach 5.2g2' with 'we will reach 5.2g2'. No guard prevents reaching 5.2g2 if verify-proof blocked us earlier. Task 2 (line 125) says backlog-append CLI reads decision.json, but does not specify what happens if decision.json was never written (e.g., 5.2e failed in a different gate). If 5.2e failed and 5.2g2 somehow still runs, decision.json is absent → EX_BLOCK → gate halts → receipt halt_stage conflicts. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | Verified core architectural claims: (1) Single-pass relaxation is the exclusive path where `block:false` occurs with `verdict !== 'converged'` (decide.js:322-350 exhaustive branch check). (2) Blocking findings originate from quorum.js:159 only (no other source). (3) `reviewed_plan_hash` binding is guaranteed when `single_pass_reason` exists (sealed into audit proof by mkSinglePass→buildAuditProof chain). (4) Consumer parser (backlog.js) enforces exactly 4-column header; deviations fail the entire parse. (5) Digest keying on sealed hash prevents idempotent duplication without purging. (6) 5.2g2 placement between 5.2g (verify-proof) and 5.2h (record) respects proof verification boundary before attestation. (7) Validation protocol correctly detects escaping defects via raw-vs-parsed line count comparison. (8) Plan honestly acknowledges FAIL synthesis defect as out-of-scope (UI5) and accepts it into backlog rather than filtering. No boundary leaks, no invariant erosion, no citation misquotes found. Design exhibits seam-readiness for M1 to feed M2 and M2 to feed downstream backlog consumers. |
| security | fail | Attacked: (1) Path normalization sufficiency — examined where repoRoot is available (appendRows, CLI context) versus where paths are rendered (deriveBacklogRows). Confirmed signature gap. (2) Test completeness against narrative — read line 102-103 requirement and compared to lines 119-127 test cases; confirmed absence. (3) Historical precedent — verified write.js normalizeReceiptCwd uses repoRoot as required parameter (write.js:39-59) to establish that the pattern exists and this plan breaks it. (4) E7 incident handling — read CLAUDE.md §3.12 evidence-durability-contract confirming prior cwd leak into tracked receipts, and confirmed plan cites this exact precedent (line 102-103) but does not implement equivalent safeguards. Could not find: any code in backlog-append.js (does not exist yet) that would mitigate these gaps; any test fixture or test specification that covers absolute path normalization. The specification contradicts itself: requires repo-relative enforcement but provides no mechanism to the function that must enforce it. |
| test | fail | I attacked: (1) whether Task 2's CLI unit tests (spawnSync) actually prove the full 5.2g2 block in plan.md works correctly — they test the CLI in isolation but not how plan.md calls it or checks its exit code; (2) whether Task 5's static assertions catch the bugs Task 5 itself admits can slip through (shell quoting, exit-code unchecked) — they do not, per the plan's own admission; (3) whether Validation includes any end-to-end test running plan.md 5.2g2 with failing backlog-append — it does not; (4) whether the Acceptance tests are mechanically enforced before merge — they are manual checklists with no gate enforcement; (5) whether Task 5 assertions verify correct block positioning — they verify existence and content but not position in the command flow. I reviewed plan.md commands, plan-review-command-body.test.js, review-single-pass-command-body.test.js, the backlog parser (derive/sources/backlog.js), and existing test patterns. No end-to-end test file exists for the plan command itself. |
| invariant | fail | Traced complete flow from plan.md 5.2e (decide) through 5.2g (verify-proof) to proposed 5.2g2 (backlog-append). Examined decision/quorum object construction in decide.js and how blockingFindings are preserved. Verified that decision.json is written in step 5.2e:1430 and contains quorum.blockingFindings. Checked verify-proof exit path (plan.md:1536-1543): if VERIFY_EXIT ≠ 0, gate records halt_stage:5.2g and exits before 5.2g2. Confirmed decision.json is worktree-local (.claude/state/plan-review/, not git-tracked). Searched for recovery path when verify-proof fails: found none — backlog-append block never executes. Checked Claims (UI3: "zero loss"), (DD6: append after verify-proof), (DD1: turn off toggle to recover) — all three statements exist but are mutually incompatible under verify-proof failure. No mechanism documented to prevent findings loss or to recover from it without re-running L2." |

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
  "wall_clock_ms": 25642300,
  "halt_stage": null,
  "backlog_appended": 10,
  "backlog_skipped_nonblocking": 3,
  "granted": 4,
  "reviewed_plan_hash": "sha256:de85a8cbe5e8843280fb5b71e925ecd291ab7bdb59abbd1bd7f0b0a017b62718",
  "plan_path": ".claude/plans/review-loop-bypass-m2.plan.md",
  "recorded_at": "2026-08-19T00:34:10.249Z"
}
```
