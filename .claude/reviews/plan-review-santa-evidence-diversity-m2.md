# Plan Review Panel — santa-evidence-diversity-m2

**Plan**: `.claude/plans/santa-evidence-diversity-m2.plan.md` · **Plan version**: `sha256:f1bc85930291667225838816b22b57d1a3cdaf5a5162dc5968f50248beeebb4f`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 2 blocking finding(s): invariant/CRITICAL, invariant/FAIL — MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| test | LOW | Task 1 will export exactly 6 kinds of values | .claude/plans/santa-evidence-diversity-m2.plan.md line 194: 'export 6종' but lines 195-208 describe 7 exports (ENV_ALWAYS_SCOPE, ALWAYS_SCOPE_DEFAULT, ALWAYS_SCOPE_VALUES, parseAlwaysScope, sourcePrdFrom, mergeScope, CONSISTENCY_RUBRIC) |
| test | LOW | The #125 regression fixture test will verify plan·PRD scope inclusion when both are outside diff | .claude/plans/santa-evidence-diversity-m2.plan.md lines 290-293: test description says to create a plan declaring 4 milestones and PRD with 7 milestones, but doesn't explicitly require the plan to include a 'Source PRD' declaration. Without this link, `sourcePrdFrom` cannot find the PRD. |
| invariant | CRITICAL | Task 3 JSON extraction and validation code is unspecified in santa-loop.md; the plan describes desired fail-closed behavior but does not show implementation | Plan L264 says 'then extract `paths` and replace SCOPE_PATHS_JSON' and L267-269 says 'distinguish `paths` absence from exit 0 — if paths isn't an array, stop even at exit 0', but the actual shell code implementing this validation is NOT shown in the plan snippet (L248-261). The plan references M1's HAS_ASSIGNMENT pattern (L267) which validates JSON field presence, but does not replicate that pattern for paths. Without seeing the extraction code, the gate's fail-closed validation cannot be verified. This differs from other tasks where code snippets are shown — Task 3's code is incomplete. |
| invariant | MEDIUM | sourcePrdFrom behavior is underspecified when plan text contains multiple Source PRD declarations | Plan Task 1 L197-199 specifies 'link form first, then plain text form' but does not specify behavior if both regex patterns match the same input (e.g., a plan with multiple Source PRD lines). Current spec says 'first match wins' implicitly, but this is not explicitly stated and the test spec (Task 4 L282-283) does not include this edge case. |
| invariant | MEDIUM | Receipt does not capture whether scope-always ran or was silent; audit trail is unanchored to the mechanism | Plan DD7 (L163-179) explicitly acknowledges that scope additions are not stamped in receipt because doing so would require changing the P0 frozen schema. This creates an anchoring gap: you cannot audit past runs to prove whether scope-always was applied. The plan offers test evidence as compensation (Task 6) but durable proof via receipt is missing — a key invariant erosion pattern. |
| invariant | MEDIUM | Unresolved plan PRD references cause silent scope reduction with no gate blocking; the fallback is non-fatal | Plan DD4 (L140-147) states that if a plan's Source PRD file doesn't exist, it is 'dropped and logged' but does not block the round. A plan pointing to a typo'd PRD path will simply have zero always-scope coverage for that plan, yet Step 1 will proceed normally. This is by design (free-form plans are valid) but represents a silent degradation pathway where coverage loss is logged but non-blocking. |
| invariant | MEDIUM | Plan does not show scope-always subcommand invocation from cli.js; subcommand dispatch not visible | Plan Task 2 L217-238 specifies that cmdScopeAlways should be added and that 'usage()' and 'runCli' switch should include 'scope-always', but does not show the actual switch statement addition. The cli.js file (inspected) has no cmdScopeAlways yet. Without seeing the routing code, the integration point between santa-loop.md and cli.js is implicit. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | Verified citation of patterns: lanes.js module structure and env parsing (✓ lines 26-99), parseBlindLane pattern (✓ lines 87-99), CLI single-output contract (✓ cited in cli.js comments lines 20-24). Examined boundary between oracle and CLI: scope-always exports 6 items (parser + 3 functions + constant), CLI orchestrates them into 7-key JSON; mirroring `cmdLanes` structure but flow is asymmetric. Verified closure definition (DD1): three-step source-based narrowing is tighter than PRD glob scope; 70 KB actual vs 7 MB claimed is reasonable trade-off with acknowledged risk. Checked mergeScope logic: diff-first, always-on append, dedup, truncation—correct but plan doesn't show exact code. Confirmed Step 1 remains sole source of SCOPE_PATHS_JSON (DD2 boundary intact). Verified defensive paths-existence check pattern from lanes' HAS_ASSIGNMENT (mentioned in plan, structured test validates). Examined TMPDIR_SANTA movement: logical move from Step 3 lane-block to Step 1 before always-scope call; comment update needed per plan. No circular deps between scope-always→cli→santa-loop. Tested scope-always for pure-function invariant: only `path` builtin, env via one parser, I/O in CLI only—pattern followed correctly. Checked mergeScope deduplication by posix-normalized path: defensible. Examined coupling of always-scope toggle to rubric visibility (DD5): intentional single-axis, documented; acceptable seam for future. Verified test coverage: Task 4 regression tests 7 keys + normal/error cases; Task 6 functional execution; existing santa tests not deleted. The four unspecified output keys (pairs, unresolved, rubricRow, mode) are inferable from context: mode from parseAlwaysScope, rubricRow from CONSISTENCY_RUBRIC constant, pairs and unresolved from CLI's plan-reading loop. While explicit mapping would be clearer, the design does not leak boundaries or break abstraction. |
| security | pass | Attacked the plan across these threat vectors: (1) **Path traversal in sourcePrdFrom** - traced the relative path normalization flow; found specification gap in handling absolute paths and out-of-bounds escapes, but `assertContained(fs.realpathSync())` provides fail-closed containment. (2) **Trust boundary for Source PRD links** - verified that returned paths are validated via `ledger.canonicalPath + assertContained` before use, with realpath() providing symlink resolution. (3) **File disclosure via unresolved paths** - confirmed DD4 explicitly drops non-existent files and reports them to stderr as `unresolved`, not silently including them in scope. (4) **Deduplication bypass** - checked that posix normalization (line 201) is applied to all paths in `mergeScope` before they reach containment checks. (5) **Windows path handling** - verified plan specifies "posix 정규화" normalization for cross-platform consistency. (6) **TOCTOU in path extraction** - confirmed that path resolution happens in a single `sourcePrdFrom` call without re-reading files; no TOCTOU window. (7) **Containment check adequacy** - reviewed `path-containment.js:31-49` which uses `fs.realpathSync()` on both target and parent with `+ path.sep` prefix check to prevent false-positive matches on sibling directories. Specification gap remains (sourcePrdFrom should explicitly document null return for escapes), but execution flow is secure due to downstream validation. |
| test | pass | Attacked the testability of M2 claims: (1) verified M2 test suite doesn't exist yet (expected for a plan) (2) confirmed M1 foundations (lanes.js, cli.js) already support `--rubric-file` (3) checked all critical claims are testable via Task 4 unit tests or Task 6 empirical test (4) verified export count and test descriptions (5) examined whether rubricRow value is tested at unit vs integration level - found it's verified by Task 6 empirical test, not unit test, but this is consistent with plan's stated philosophy of not over-claiming. All test fixtures (santa-lanes.test.js, santa-loop.md, existing CLI) confirmed to exist. No untested load-bearing claims found that would cause feature failure." |
| invariant | fail | Attacked fail-open drift by examining: (1) scope-always exit code path and JSON validation in Task 3 — found unspecified extraction code; (2) skip predicates in DD4 — found unresolved PRDs are logged but non-blocking, allowing silent scope reduction; (3) receipt anchoring per DD7 — found scope additions are not stamped because P0 schema is frozen, creating audit gap; (4) sourcePrdFrom multiple-match edge case — found behavior is not explicit when both regex patterns match; (5) cli.js integration point — found subcommand routing is described but not shown. All findings cluster around specification gaps where plan commits to behavior in prose but omits implementation code, violating mechanical clarity invariant. |

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
  "wall_clock_ms": 673432,
  "halt_stage": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:f1bc85930291667225838816b22b57d1a3cdaf5a5162dc5968f50248beeebb4f",
  "plan_path": ".claude/plans/santa-evidence-diversity-m2.plan.md",
  "recorded_at": "2026-08-19T01:56:27.468Z"
}
```
