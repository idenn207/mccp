# Plan Review Panel — santa-loop-materialize-m2

**Plan**: `.claude/plans/santa-loop-materialize-m2.plan.md` · **Plan version**: `sha256:c0a43a59b174720a4e8d3b718e5985749f76788c52d3baaab51672e103ce4cb5`
**Verdict**: `converged` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=true
**Layers**: L1 `converged` · L2 `converged` · L3 not fired (mode=multi-agent, fires.l3=false)
**Wall clock**: 426.6s · **Reason**: L1 + L2 quorum satisfied (4/3 responses, 4 distinct roles); L3 not fired

이 라운드(R9)는 5라운드 흡수(R4~R8) 뒤 4인 전원이 pass한 승인 라운드다. 라운드별 실결함과 흡수·기각 근거는 `.claude/reviews/plan-review-santa-loop-materialize.md`가 소유한다.

## Findings

승인 라운드의 잔여 지적이다 — 전부 MEDIUM이고 blocking 아님(`blockingFindings: []`). 구현 단계에서 다룬다.

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| security | MEDIUM | Plan's Validation 2d does not mechanically enforce that test item [5] contains all 4 required sub-cases, risking incomplete test coverage of the critical gate-id review_source enforcement | .claude/plans/santa-loop-materialize-m2.plan.md lines 384-402 (Validation 2d script) only checks that test name pattern '[N]' exists via regex /\b(?:test|it)\(\s*[\x22\x27\x60]\s*\[(\d+)\]/g, extracting the digit to a Set. It verifies all numbers 1-16 appear, but does NOT verify the content or count of sub-cases within each test. Task 6 item [5] explicitly requires 4 distinct sub-cases: codex · hybrid · review_source-only-absent · review-triple-entirely-absent (lines 326-329). An implementer could create test('[5]') with only 1 sub-case (e.g., codex case) and Validation 2d passes. Critically, the 4th sub-case (triple entirely absent) is the only test that catches if the schema check is accidentally placed inside the `if (reviewPresent.length > 0)` guard (line 329: 'Task 2의 위치 계약을 강제하는 유일한 test다'). The incomplete test would pass validation, but the enforcement gap would remain. |
| test | MEDIUM | Task 5 bash integration is validated by Validate lines, specifically the structural check in Validation 2c (lines 404-443) | Validation 2c parses bash structure but does not execute the script or validate bash syntax. It uses regex/token counting (lines 419-428) not bash execution. Validation 4 (lines 465-467) runs seal CLI directly, not the santa-loop.md wrapper. No test item (1-16) explicitly invokes the full /mccp:santa-loop command end-to-end. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | Systematically verified: (1) GATE_ID registration claim vs schema.js — accurate. (2) Pattern citations (code-review.md, review-verdict.js, ledger.readReviewers) — all confirmed. (3) Present-only fields and hash stability via makeSkeleton check — no santa_* fields found, DD4 sound. (4) Proof structure validation for both converged and divergent paths — schema.js 208-224 matches plan DD3. (5) review_source='multi-agent' exclusion from CROSS_MODEL_SOURCES — line 42 review-verdict.js confirmed. (6) Seal read-only on ledger — readReviewers returns envelope only, no raw access. (7) Task dependency ordering — Task 1→2→3→6 sequencing with test file creation ownership clear. (8) Boundary between proj |
| security | pass | Attacked: (1) DD3 claim that review_source='multi-agent' is structurally enforced — confirmed CROSS_MODEL_SOURCES=['codex','hybrid'] excludes multi-agent at review-verdict.js:42, blocking cross-model dedupe for santa receipts; (2) DD2 claim that seal.js won't leak raw reviewer data — found test item 10 uses canary-string verification and plan specifies ledger.readReviewers() returns envelope-only; (3) DD5 claim that seal.js is read-only — plan has test item 11c that spies on ledger.mutate calls; (4) cap-from-state claim (DD3 layer 16) — plan requires explicit `cap: state.cap` argument and has fixture test with mismatched env/state; (5) schema placement requirement — plan documents that gate- |
| test | pass | Checked schema position contract (test item 5 case 4 catches wrongly-nested gate-id check), present-only field stability (test item 3 verifies absent keys), cap source validation (test item 16 forces env vs state.cap observation), divergent layer mapping (item 15), non-invasive gate registration (item 4 tests ALIAS_MATRIX), and bash integration coverage. Validated that test specifications are concrete and would catch implementation defects. One gap found: task 5 bash validation uses structural parsing only, not execution." |
| invariant | pass | Examined receipt anchoring (subject binding via markdown hash), fail-closed guarantee (seal before push with exit code blocking), skip predicates (multi-agent excluded from cross-model sources), digest coverage (present-only fields absent from makeSkeleton), and HALT vs degrade (gate check outside reviewPresent guard). Verified planAwareMarkdownHash distinguishes plan vs non-plan paths. Confirmed gitignore coverage for ledger vs tracked report. Checked proof structure against isReviewProofStructurallyValid validator. Traced seal failure paths (slug rejection, lock contention, ledger corruption) - all exit non-zero. Verified resolution.converged semantics (process completion, not verdict agre |
