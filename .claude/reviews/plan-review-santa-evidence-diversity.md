# Plan Review Panel — santa-evidence-diversity

**Plan**: `.claude/plans/santa-evidence-diversity-m1.plan.md` · **Plan version**: `sha256:17bd42eb23012bf5a3d4128dd832ea1ac74c192cb64318994cdee892f34e98b4`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 3 blocking finding(s): architect/HIGH, architect/FAIL, invariant/FAIL

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | Task 2.2's `cmdLanes` output contract is underspecified: the plan claims `blindId` is unique but does not explicitly require the code to detect and reject cases where 2+ ids are marked 'blind' | Plan Task 2.2 Step 2 states: '2개가 나오면 그것은 oracle 결함이라 `cmdLanes`가 exit 2로 거부한다' [2 blind ids means oracle defect and exit 2]. But the actual validation logic is never shown in the task actions. DD2 table permits only 1 blind id max (`a`: A blind 1개, `b`: B blind 1개, `off`: 0개), yet the plan does not require `cmdLanes` to validate this invariant when generating output. Without explicit code for the check, the boundary that should enforce DD2's '블라인드 ≤ 1' (Task 5.1 acceptance) is silent. |
| architect | MEDIUM | Task 5.1 acceptance criterion places stamp-0 responsibility on `santa-lanes.test.js` (an oracle module test) rather than `santa-seal.test.js` (the seal/stamp integration test) | Plan Task 5.1 says: '**stamp 0 보존**: `off` 모드 원장(라운드 ≥ 1, 블라인드 0건)에서 두 키가 값 `0`으로 실린다'. But `santa-lanes.test.js` is for testing `lanes.js` exports (`parseBlindLane`, `assignLanes`, `buildBlindPrompt`, `laneCoverageFrom`). The stamp-0 guarantee is a `seal.js` behavior, not a lanes.js behavior. Task 5.3 says 'seal.test.js' tests '투영·stamp·legacy envelope 무해성', which is the proper place. This creates ambiguity: which test actually owns the stamp-0 invariant? |
| architect | MEDIUM | Plan's `laneCoverageFrom` function is declared (Task 1) but its algorithm for handling rounds with 0 blind records is never specified | Task 1 export list: '`laneCoverageFrom(projection)` → `{ blindRecords, blindRounds, rounds }`. 순수 집계이고 어떤 입력에도 던지지 않는다'. Task 3.3 requires: 'if rounds >= 1, stamp both fields even if 0'. But the plan never defines the exact rule: when a round has 1+ records but 0 of them are blind, should that round increment `blindRounds`? The answer determines whether the metric `santa_blind_rounds === santa_rounds` correctly enforces DD2's 'every round had >=1 blind'. Without this specification, Task 5.1's acceptance test for `laneCoverageFrom` cannot verify the invariant. |
| test | LOW | Validation Step 5 (line 515) can run standalone without directory setup | Plan line 515: `printf '%s' '...' > .claude/state/santa-loop/tmp/smoke-paths.json` lacks `mkdir -p` before write. Current santa-loop.md line 210-211 creates the directory during implementation, but Validation section should be self-contained. |
| test | LOW | Unit test for buildBlindPrompt verifies function cannot read files from disk | Task 5.1 spec states '인자 키 집합 단언' (argument key assertion only) but does not explicitly require testing that function body lacks file I/O. Gap is mitigated by Task 7 live run which explicitly tests 'that prompt body contains no file contents' (line 469a). |
| invariant | MEDIUM | MAX_TARGET_PATHS constant is required but its value is not specified, making implementation ambiguous and untestable. | .claude/plans/santa-evidence-diversity-m1.plan.md Task 1 (lines 259-274): lists `MAX_TARGET_PATHS` as a required constant export; Task 1 (line 269-270) references it: '경로 목록은 `MAX_TARGET_PATHS`까지만 싣되'. No numeric value is given. Task 5.1 describes testing truncation but cannot verify correctness without knowing the limit. |
| invariant | MEDIUM | blindId contract value is specified indirectly in Task 2.2 but not explicitly in Validation, creating risk of implementation mismatch. Shell script Task 4.2 (line 400) assumes blindId equals reviewer ID string but Validation 5a (line 515) only logs value without asserting it. | .claude/plans/santa-evidence-diversity-m1.plan.md Task 2.2 (lines 286-289) specifies blindId indirectly as '값이 `'blind'`인 유일한 id' but provides no explicit contract mapping. Task 4.2 shell code assumes specific value but Validation shows only logging without assertion. Prior review panel (plan-review-santa-evidence-diversity.md line 21) flagged this as HIGH invariant gap. |
| invariant | MEDIUM | rounds field consistency between laneCoverageFrom output and ledger.aggregateFrom is not validated, allowing silent stamping of inconsistent coverage counts in violation of present-only field integrity per DD6. | .claude/plans/santa-evidence-diversity-m1.plan.md Task 3.3 (lines 321-328) calls 'lanes.laneCoverageFrom(projection)' and stamps writeArgs, but never specifies validation that coverage.rounds equals ledger.rounds. Task 1 (line 271-272) defines return signature but omits consistency check. Prior review panel (plan-review-santa-evidence-diversity.md line 22) noted this as MEDIUM invariant gap. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | Verified all pattern citations (terminator.js oracle, counter.js parser, seal.js project(), schema present-only fields, makeSkeleton exclusion). Checked DD2 table semantics, DD11 seam contracts, Task 2-4 boundary definitions. Confirmed receipt hash stability reasoning (present-only ≠ makeSkeleton). Examined Task 5 test allocation (lanes vs seal). Identified that cmdLanes output validation (rejecting 2+ blind ids) is claimed but not implemented in the plan text, and that laneCoverageFrom's algorithm—critical to the stamp-0 invariant—is declared but never defined. No defects in the present-only field pattern itself or in env parser reuse, but the HIGH finding is load-bearing for DD2." |
| security | pass | Examined env parsing for bypass paths (parseBlindLane fallback → verified fail-open design correct), lane spoofing via CLI flags (verified no new path-injection flags per S2 pattern), `--lane` validation skips (verified exit 2 on mismatch enforced at record time), path traversal in targetPaths (verified containment checks + git diff-rooted construction + prompt-only use prevents execution), receipt hash tampering via new fields (verified present-only means not in makeSkeleton), off-mode stamp omission (verified Task 3.3 explicitly preserves 0), TOCTOU between lanes/record calls (verified fail-closed to exit 2 acknowledged in DD11), durable artifact integrity (verified aggregate counts serve as ledger integrity check), and prompt injection via filenames (verified outside M1 scope, files treated as data not code in prompt context, codex invocation uses repo-rooted -C restriction). No hostile scenario reached consequence. |
| test | pass | Examined all 11 Design Decisions for falsifiability. Checked: (1) DD2 table 3 modes — found tests in Task 5.1 covering a/b/off explicit outputs; (2) buildBlindPrompt no-file-content claim — argument signature verified by unit test + output verified by integration; (3) stamp 0 preservation — tested across laneCoverageFrom isolation + seal end-to-end + schema validation; (4) `--lane` mismatch rejection — tested in Task 5.1 + smoke test; (5) receiver count invariant I5 — tested by output key count; (6) all Validation commands reference tests that exist in task list. Searched codebase for where $TMPDIR_SANTA initialized (found at santa-loop.md line 210, pre-existing). No assertions found without tests. Plan structure mirrors terminator.js/counter.js patterns correctly. All 6 Acceptance criteria reference existing tests or observables from Tasks 1-7. |
| invariant | fail | Attacked fail-closed gate invariants across all tasks: (1) Traced scope handoff from Step 1 JSON file to Step 3 cmdLanes call — found fail-closed on empty array or missing file (cmdLanes exits 2). (2) Examined lanes oracle (Task 1) — assignLanes correctly handles unknown IDs by defaulting to bundled (fail-closed), parseBlindLane defaults to 'a' (enforcement direction). (3) Verified shell error handling in Task 4.1 — `assignment` check precedes `blindId` extract, lanes exit code is caught and propagated, no partial JSON path. (4) Checked receipt anchoring: present-only fields distinguish absence (old receipts) from zero values (off mode) via conditional writeArgs (Task 3.3). (5) Examined rollback safety — `MCCP_SANTA_BLIND_LANE=off` disables blinding and stamps zero values, making it observable. (6) Verified P0 file boundaries in DD5 — seal.js and schema.js changes are additive-only, makeSkeleton untouched. Could not find structural defects in fail-closed logic itself, but identified three specification gaps that compromise completeness and testability: MAX_TARGET_PATHS has no value (breaks implementation contract), blindId value is implicit not explicit (insufficient for test assertion), rounds consistency is not validated (allows silent stamp of wrong values). |

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
  "wall_clock_ms": 579686,
  "halt_stage": "5.2e",
  "granted": 4,
  "reviewed_plan_hash": "sha256:17bd42eb23012bf5a3d4128dd832ea1ac74c192cb64318994cdee892f34e98b4",
  "plan_path": ".claude/plans/santa-evidence-diversity-m1.plan.md",
  "recorded_at": "2026-08-18T07:03:55.067Z"
}
```
