# Plan Review Panel — impeccable-detection-contract

**Plan**: `.claude/plans/impeccable-detection-contract-m2.plan.md` · **Plan version**: `sha256:e9775b74edd3c51fc16fd7ba0e6cfef441af872241f0c247ed7a9bb1fc1142a5`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 6 blocking finding(s): test/HIGH, test/HIGH, test/FAIL, invariant/HIGH — MCCP_REVIEW_SINGLE_PASS=deadline_pressure 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| test | HIGH | New test files will be created to verify the circular dependency fix and command body constraints | Plan Task 7 describes creation of `setup-command-body.test.js` and `session-start-dep-check.test.js` but provides only DESCRIPTIONS of what these tests should verify, not the actual test code. Plan lines 265-272 state test intent but no test implementation is provided. Validation section (line 315-342) lists these files in validation commands but they do not exist and plan contains no test code. |
| test | HIGH | The circular dependency between dep-check.js and impeccable-detect.js will be properly fixed by using deferred require inside checkImpeccable() | Plan Task 1 claims deferred require inside checkImpeccable() prevents circular dependency (lines 104-107). Validation command on line 325-326 states: `node -e "require('./plugins/mccp/scripts/lib/dep-check').checkImpeccable({})"` and reverse order. However, these commands do NOT test what WOULD break if require were top-level instead of deferred. No negative test case validates that top-level require WOULD fail. This tests success path only, not failure detection. |
| test | MEDIUM | Test coverage for checkImpeccable() function will include verification that both load orders work correctly | Plan Task 7 line 257-261 describes test matrix: (a) two load orders, (b-f) additional cases. But the plan provides only descriptions, not code. dep-check.test.js currently has no tests for checkImpeccable() (file read: lines 1-99 show tests for checkCodexPlugin, checkImpeccableCli, checkAll only). Without actual test code provided in plan, falsifiability of this claim cannot be verified - implementer must invent tests. |
| test | MEDIUM | Test patterns from existing files (plan-review-command-body.test.js and impeccable-resolve.test.js) will be mirrored in new test files | Plan Task 7 line 273-274 cites: 'Mirror: `plan-review-command-body.test.js`(정적 리터럴 단언) · `impeccable-resolve.test.js`(채널 매트릭스 · `withTempDir`/`withEnv` 헬퍼).' However, the plan does not provide the actual test code that uses these patterns. The implementer must read existing tests and invent the new test code themselves, which creates risk of incorrect pattern application. |
| test | MEDIUM | setupcommand-body.test.js will verify that forbidden literals are absent and required literals are present in setup.md | Plan Task 7 line 265-268 describes: forbidden literals (`npm install -g impeccable`, `impeccable skills install`, `/mccp:impeccable`) should be absent; required literals (`npx impeccable install`, `pbakaus/impeccable`, `checkImpeccable`) should be present. Plan provides test specification but zero test code implementation. No test code exists to actually scan setup.md and verify these conditions. Validation line 320 lists test but file does not exist. |
| invariant | HIGH | Plan Task 4 fails to explicitly require re-dep-check in Phase 3 despite Mirror pattern showing it as required. Validation grep does not include 'dep-check' as a required literal, allowing implementer to omit re-check without test failure. | Plan L209 Mirror pattern: 'Phase 2(codex) — AskUserQuestion 1회 + 설치 후 재-dep-check + stderr verbatim 보고' vs Plan L179-207 Task 4 Items 1-6 which describe Phase 3 without explicit re-dep-check mandate. Current setup.md L111 shows Phase 3 includes re-check, but plan's Task 4 Item 4 (L189-197) describes only install + warning without mentioning re-check. Task 7 validation L267-268 lists required literals but excludes 'dep-check'. |
| invariant | HIGH | Plan Task 9 Acceptance criteria only validates the skip-when-available path (impeccable already installed), not the critical install-when-missing path. All three required observations (a) SessionStart with available, (b) setup --dry-run with available, (c) gitignore) test the skip case, leaving the actual install flow untested. | Plan L292-301 Task 9 actions: (a) 'impeccable부재' in banner check assumes already available case; (b) 'Phase 3이 "이미 해소됨"으로 skip' explicitly tests skip logic not install logic; (c) gitignore only. Current setup.md Phase 3 (L88-112) has complex install handling with two CLI paths (npm or npx) that isn't covered by any Task 9 observation. Acceptance L358-367 requires these three observations but none cover install-when-missing. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | Attacked plan structure through five distinct angles: (1) **Circular dependency claim**: Verified that `impeccable-detect.js:52` already requires `dep-check.js`, creating a circular dependency. Confirmed plan's lazy-require solution (Task 1, line 105-107: "본문 **안에서** `require()`") matches established pattern (`auto-chain.js:109`). Lazy require is at function call time (after module cache exists), not top-level, breaking the cycle. Both load orders (dep-check first, then impeccable-detect) execute without error per validation L325-326. (2) **Consumer propagation**: Verified SessionStart is the only location that reads the deprecated `impeccable_cli.installed` field (session-start.js:1070). Confirmed `checkAll()` becomes strict superset per Task 1 (returns both old `impeccable_cli` + new `impeccable` keys). Task 2's change from `!result.impeccable_cli.installed` to `!result.impeccable.available` is isolated to one site (L132). No other active code consumers outside tests need modification. (3) **Field shape contract**: Verified `resolveImpeccable()` (impeccable-detect.js:299-439, M1 complete) returns object with `available` boolean field. Return object structure matches all three code paths (bare length==1 at L394, plugin present at L417, none at L429). M2 Task 1's direct pass-through (`return resolveImpeccable(...)`) preserves this contract. (4) **Files-to-Change completeness**: Cross-referenced plan's list (L54-75) against grep results for `impeccable_cli` references — found in: dep-check.js (source, no change needed), session-start.js (updated via Task 2), tests (updated via Tasks 7). state-writer.test.js fixture includes old missing-list value but requires no update (test validates round-trip behavior, not key names). CLAUDE.md §3.17 cited for consumer documentation (Task 6, L243-247 point to gate-design section). (5) **User Intent coverage**: All UI1-UI9 constraints are addressed: (UI1) no env override for default installs—fixed by oracle (Task 0-1); (UI2) CLI 3.x backward compat—plan preserves it via multi-source enum (Task 0b); (UI3) official commands only—Task 0 measures this pre-ship (L86-92); (UI4) no install pressure if available—Phase 3 skip (Task 4.3, L186-188); (UI5) gitignore matches official—Task 3 canonical block (L152-160); (UI6) plugin recommended—Task 4 first option (L189-195); (UI7) tracked design.json preserved—Task 3 line 168; (UI8) backend-only workloads unaffected—handled by skip-if-available + no pressure design; (UI9) gate lenient/strict out-of-scope—explicitly deferred (L376). No structural coupling violations, missing invariant cases, or boundary leaks found. Pattern mirrors properly cited (auto-chain lazy require, dep-check sentinel, impeccable-detect superset). Validation commands (L325-337) test both load orders and actual binary outputs. |
| security | pass | Tested for: (1) circular dependency partial-export via both load orders — delayed require + bidirectional test validates (2) path traversal via skill directory name — whitelisted by SKILL_DIR_NAME_PATTERN before path.join (3) invocation string injection — built from validated registry key prefix + whitelisted directory name, never passed to shell (4) symlink attack via TOCTOU — isPlainDirectory() guards before read (5) absolute path leak via normalizeSourcePath — checks for traversal, falls back to home-relative with ~ prefix (6) .gitignore rule correctness — verified against official impeccable documentation in evidence doc (7) repoRoot handling — correctly threaded with undefined fallback (8) registry key pattern bypass — requires impeccable@ prefix, robust prefix matching. No HIGH/CRITICAL findings identified after systematic attack on trust boundaries, data handling, and attack surface. |
| test | fail | Searched for test code implementations referenced in plan Task 7: checked whether setup-command-body.test.js (to be created) and session-start-dep-check.test.js (to be created) exist (they do not); verified existing test files (dep-check.test.js, impeccable-resolve.test.js, gitignore-provision.test.js) to see if they contain the test cases described; confirmed plan cites test patterns from other files but provides no new test code; verified that plan describes what tests SHOULD check (circular dependency, command literals, banner behavior) but does not provide test implementations; examined current dep-check.js and impeccable-detect.js to confirm checkImpeccable() function does not yet exist and current tests don't cover it; verified that validation commands assume these test files will exist and pass but provides no implementation for them. |
| invariant | fail | Attacked three core invariant axes: (1) **Skip predicates** — traced whether later gates can be silently skipped if this gate doesn't record correctly. Found Task 9 leaves install path unvalidated. (2) **Fail-closed gates** — checked if gates can degrade to warnings instead of blocking. Found Phase 3 re-check requirement is underdocumented, allowing silent omission. (3) **Anchoring** — verified whether receipt/notes bind to the artifact state at review time. Found Acceptance checklist relies on manual human validation (Task 9) without mechanical enforcement of the critical install path. Examined circular require handling (mitigated by delayed require + bidirectional load tests), gitignore drift (mitigated by existing bidirectional lint), session-start integration (mitigated by hook spawn test), and setup command body literals (mitigated by static test) — these have adequate gatekeeping. But Task 9 acceptance criteria and Task 4 re-check specification are underspecified, creating fail-open paths." |

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
  "wall_clock_ms": 692824,
  "halt_stage": null,
  "backlog_appended": 6,
  "backlog_skipped_nonblocking": 3,
  "granted": 4,
  "reviewed_plan_hash": "sha256:e9775b74edd3c51fc16fd7ba0e6cfef441af872241f0c247ed7a9bb1fc1142a5",
  "plan_path": ".claude/plans/impeccable-detection-contract-m2.plan.md",
  "recorded_at": "2026-08-22T11:55:01.330Z"
}
```
