# Plan Review Panel — santa-adjudication-m3

**Plan**: `.claude/plans/santa-adjudication-m3.plan.md` · **Plan version**: `sha256:568876d1137a21cf9f2e7483db879656a6e20eea1767b012f104a36867a3c8a7`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 6 blocking finding(s): security/FAIL, test/CRITICAL, test/HIGH, test/HIGH

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| security | MEDIUM | The `normalizeLocations` function specification does not validate that file paths are repository-relative and safe. It allows absolute paths, path traversal sequences, and other untrusted path formats to be accepted and stored in git-tracked artifacts. | Plan line 431: normalizeLocations spec only validates 'file' string(1..300) length. Coverage items 62-63 test only type/length, not path safety. Plan line 189 shows expected 'repo/relative/path.js' format but no spec requirement to reject absolute or traversal paths. No mention of validation against '/', '../', drive letters, or path normalization. |
| test | CRITICAL | Acceptance (B) validates that the terminator fires end-to-end via a seed patch probe | Line 1019-1029 (mandatory, no-exceptions clause: '조건절이 없다 — 이 항목이 체크되지 않으면 milestone은 complete가 아니다'). Validate script line 961-975 checks for file `.claude/reviews/santa-review-santa-adjudication-m3-probe.md` existence, which does not currently exist (confirmed via Glob). |
| test | HIGH | Tests 61-87 will validate the terminator oracle, hunk parser, and wiring | Line 81: 'Coverage 61~87 추가'. Line 1014-1016: 'Validation의 구조 요구가 그 출처를 기계로 고정한다 — 존재+assert만 검사하면 합성 diff 문자열로 그 항목을 만족시킬 수 있다'. Actual test suite (santa-adjudication.test.js) only contains tests [1-60]; searching for tests [61+] yields no matches. |
| test | HIGH | The hunk parser (unified diff parser) is genuinely new code with no precedent | Line 65-68: '이 저장소에 unified diff hunk 파서가 없다... Task 3의 hunk 파서는 모방이 아니라 신규'. No patchRangesFrom function exists in codebase (grep yields no matches in cli.js). Validate section line 1014-1016 admits the limitation: structural validation alone cannot catch implementation bugs ('존재+assert만 검사하면 합성 diff 문자열로 그 항목을 만족시킬 수 있다'). |
| test | HIGH | The core module terminator.js will be created with all required exports | Plan Task 1 (line 74) lists functions: parseTerminator, normalizeLocations, classifyTarget, decideTermination, plus 4 constants. File does not exist (Glob search for `**/santa/terminator.js` returns no matches). File cannot be tested by existing test suite until created. |
| test | MEDIUM | Validate section ensures constellation coherence between ledger.js, seal.js, and schema.js | Line 904-906: '정적 문자열 검사의 한계를 함께 적는다: 이것은 세 자리가 같은 어휘를 참조한다만 보지 런타임 동치를 보지 않는다. 런타임 축은 여전히 항목 79·81이 소유'. The script performs regex matching on constant names but explicitly admits it does not verify runtime correctness—only that the same strings appear in multiple files. |
| test | MEDIUM | The plan provides mechanical validation that DD7's two kill-switch sites both call parseTerminator exactly once | Line 931-937: The validation counts parseTerminator calls via regex and asserts count===2 total and exactly 1 per function. But if parseTerminator is never actually defined in terminator.js, the function body extraction regex will fail silently or match false positives (same identifier name in comments). The test file line 851 tries to require terminator but that module doesn't exist yet. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | Attacked the plan across 7 dimensions: (1) module boundary/ownership (verified P0/P1 separation against ownership.md §소유권 표 — 9 paths, no overlap); (2) constant value consistency (verified TERMINATION_REASONS is referenced in both ledger read/write via constellation test); (3) input immutability (verified DD3 separation holds — classified output array is new, input effectiveBlocking unmodified per coverage item 72); (4) kill-switch architecture (verified exactly 2 parseTerminator call sites enforced by regex, distributed 1 each in cmdCheckTermination and assertNotTerminated); (5) git diff parser rules (verified hunk parsing handles deletion-only files, malformed headers skipped per-line not per-file); (6) feature completeness (verified all requirements have test coverage items 61-87); (7) future seam integrity (verified P3's delta-scope can attach via plan line 24, ownership.md shows no overlap). Found no abstraction violations, boundary leaks, or implicit coupling introduced by M3." |
| security | fail | I attacked three vectors: (1) Trust boundaries around reviewer-provided location paths — searched the plan for validation specs and found length/type checks only, no path normalization or traversal checks; (2) Data persistence — checked whether locations are stored in git-tracked receipts and found plan does not explicitly state this, creating ambiguity for downstream P2/P3 consumers; (3) Downstream usage risk — confirmed locations are only used in classifyTarget string matching in M3 (fail-closed), but noted P2/P3 might use them for other purposes without safe-path assumptions; (4) Existing path safety — verified that rev format validation (DD4) and git call protection (execFileSync with array args + --) are properly implemented, and prior slug-namespace issue was fixed. The medium-severity finding stands: the plan does not specify that normalizeLocations must reject absolute paths or path traversal, creating a trust boundary leak into git-tracked artifacts that P2/P3 should not inherit." |
| test | fail | Attacked the core falsifiability claims: (1) Searched for the Acceptance (B) proof file—doesn't exist and can only be created post-implementation. (2) Searched test suite for coverage items 61-87—only tests [1-60] exist; M3 test items are unwritten. (3) Searched codebase for terminator.js module and patchRangesFrom function—neither exist. (4) Verified that the Validate script's constellation check is structural-only (regex matching) and explicitly cannot validate runtime behavior. (5) Confirmed the plan acknowledges test 68 can be faked with synthetic diff strings. (6) Found the core terminator module, hunk parser function, and 27 test items (61-87) required by the plan's coverage table do not exist and therefore cannot be validated until after implementation." |
| invariant | pass | **Attacked the following gates:** 1. **Kill-switch (DD7) dual-location invariant**: Validated that the constellation check at lines 931-937 correctly enforces exactly 2 calls to `parseTerminator` — one per function (`cmdCheckTermination`, `assertNotTerminated`). The plan's counter-measure (checking total count THEN per-function count) catches shared helpers or duplicate calls. The risk I examined (nested braces in function bodies causing regex to extract wrong text) is acknowledged as a limitation of static checking (lines 904-906), with runtime tests (items 79, 81) providing fail-closed verification. Found no fail-open path: if regex extraction fails, validation fails (conservative). 2. **Read/write enum sync (DD2 one-commit invariant)**: Verified that the plan requires `TERMINATION_REASONS` constant (line 530-531) to be the union of `counter.REASONS.CAP_REACHED` and `terminator.EXIT_REASON.PATCH_CHASING`, with both read (`assertTerminationMarker`) and write (`terminate`) using the same set. Item 81 tests this: write `patch_chasing` marker, verify `ledger.read` doesn't throw. Failure path (forgetting to widen `assertTerminationMarker`) would cause `SANTA_LEDGER_CORRUPT` when reading newly-written marker — fail-closed. The validation script at lines 919-922 checks both reference `TERMINATION_REASONS`. 3. **Rollback safety (`MCCP_SANTA_TERMINATOR=off` path)**: Traced the reopen sequence: env off → `assertNotTerminated` early return → `ledger.beginRound` allowed branch → line 459 clears marker via `state.terminated = null`. Verified existing code at ledger.js:459 exists and is in the "allowed" branch. No fail-open gap: marker is cleared only when round is allowed to begin. Item 76 tests this round-trip. 4. **Hunk parser fail-closed design**: The git diff parser (lines 463-475) explicitly absorbs malformed input — unparseable hunks are skipped (not whole file discarded), empty output → empty patchRanges, so locations → `unknown` → terminator doesn't fire. Multiple bail paths all lead to `unknown` classification. Item 74 tests this. 5. **Locations field type safety**: Per DD3 and line 462, type violations to `locations` are NOT downgraded to blocking but fall through to null (via normalizeLocations). Null → empty array → empty locations → all targets `unknown` → no termination. Fail-closed by design. 6. **Acceptance (B) real-path verification**: The requirement at lines 1019-1028 that `.claude/reviews/santa-review-santa-adjudication-m3-probe.md` must exist with `exit reason: patch_chasing` is enforced by the validation script at lines 961-973. If probe doesn't run or terminator doesn't fire, file either absent or has wrong reason → script exits 1 → milestone incomplete. Not fail-open. **Did NOT find fail-open gaps or receipt anchoring erosion in:** - Default value of `MCCP_SANTA_TERMINATOR` (defaults to `enforce`, fail-open on typo per DD10, acknowledged) - Constellation validation regex limitations (acknowledged as static check only; runtime tested separately) - Marker clearance logic (binds to existing `beginRound` code with documented line number) - Schema version non-bump (DD2 justifies this fail-closed choice) |

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
  "wall_clock_ms": 300022,
  "halt_stage": "5.2e",
  "granted": 4,
  "reviewed_plan_hash": "sha256:568876d1137a21cf9f2e7483db879656a6e20eea1767b012f104a36867a3c8a7",
  "plan_path": ".claude/plans/santa-adjudication-m3.plan.md",
  "recorded_at": "2026-08-17T13:32:18.535Z"
}
```
