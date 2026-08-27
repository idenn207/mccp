# Plan Review Panel — multi-session-work-loop

**Plan**: `.claude/plans/multi-session-work-loop-m9.plan.md` · **Plan version**: `sha256:1dd5b4506be52088ce88508aa28f9021e13e8aa7f6238d4c580cceee936f9861`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 10 blocking finding(s): architect/HIGH, architect/FAIL, test/CRITICAL, test/HIGH

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | The plan claims C1 current status is 'computed 0/12' with 12 open findings (line 54), but code shows computeC1 returns 'forward-only' status when findings derive source has no data or errors | plugins/mccp/scripts/lib/msw-metrics/index.js:673-688 shows computeC1 returns status='forward-only' when findings is null/falsy or findings.ok is false, with reason 'no live findings derive source wired'. However, the findings source IS registered at plugins/mccp/scripts/derive/index.js:56. The claim creates a boundary ambiguity: will Task 2's finding_closed events alone make C1 computed, or does the plan also need to ensure scanFindings(root) returns ok:true with actual findings data? |
| architect | MEDIUM | Task 2 describes emitting finding_closed events for blockingFindings but does not specify where in cmdBacklogAppend this emission happens or how it integrates with existing appendRows logic | plugins/mccp/scripts/lib/plan-review/cli.js cmdBacklogAppend (lines 1027-1146) has no call to emit findings_closed events. Task 2 action states findings should emit 'same batch' but does not bind to a concrete code boundary—the plan delegates implementation without clarifying whether emission happens before/after appendRows, whether it reuses blockingFindings array identity, or how it handles failed appendRows scenarios |
| test | CRITICAL | Task 2 and Task 4 changes emit finding_closed and remediation_pr events correctly | Plan lines 218-219 validate these tasks by running msw-m9-producers.test.js, but that file is created in Task 6 (line 83). Tasks 2/4 execute before the test exists, making their outputs unmeasurable until the final task. No intermediate validation checkpoint. |
| test | HIGH | Validate line 215 tests that A3 gracefully handles tiktoken absence | Plan lines 100-104 claim Task 1a produces {status:'error'} for tiktoken absence. Validate line 215 only runs 'a3 --print' and checks exit code. This passes for status:'baseline-unavailable' (existing behavior) OR status:'error' (new behavior) OR status:'computed' (if tiktoken exists). The test does not falsify the specific claim. |
| test | MEDIUM | Task 2 implementation is complete and locatable | Plan lines 122-132 describe emitting finding_closed when 'backlog_appended' succeeds, but do not cite the exact function/line in plan-review/cli.js where backlog append is detected or where the emit must integrate. Line 78 references only the file, not the implementation anchor. |
| test | MEDIUM | Task 7 PRD status update moves comments without loss | Plan lines 181-184 describe moving bracket comments to ## 순서의 근거 bullets. Acceptance criterion (line 273) is 'grep finds the original text in the new location.' This is falsifiable only post-hoc on the final PRD state; no before-snapshot pins the claim that data was moved vs. duplicated vs. reworded. |
| test | MEDIUM | Validate line 222 tests m9-coverage-gate.js | Line 222 runs 'node plugins/mccp/scripts/lib/msw-metrics/m9-coverage-gate.js --json'. This file does not exist per glob search; it is created in Task 6. The command will exit ENOENT before any gate logic runs. |
| invariant | CRITICAL | Plan Task 7 implements gate-silencing via status marker removal without mechanical verification that conditions are met | Plan line 182-184: 'Action' states status will be changed to canonical `complete` with notes moved to `## 순서의 근거` section. scan.js line 106 uses strict equality: `normalizeStatus` returns 'non-canonical' for `complete (인정 조건 미충족: ...)` but 'complete' for bare `complete`. When plan removes the parenthetical, gate classification flips from non-archivable to archivable without checking whether underlying conditions (A2 producer, A3 measurement, C1 closure, C2/C3 attribution) are actually proven or only documented as impossible. Gate relies on marker presence; marker is removed by the plan's action. |
| invariant | HIGH | Plan migrates receipt anchoring without explicit bidirectional binding - violates CLAUDE.md §3.12 anchoring contract | Plan line 182-184 moves parenthetical conditions from status table cells to separate `## 순서의 근거` section. Acceptance criterion line 273 requires only grep verification that text 'exists somewhere': '세 행의 미충족 원문이 `## 순서의 근거`에서 grep으로 발견된다'. This satisfies 'text not lost' but not 'binding maintained'. Original binding was 'status row = complete (reasons)', new binding is 'status row = complete' + 'reasons in other section'. CLAUDE.md §3.12 requires: 'does the record bind to the thing it claims to describe?' A reader examining only the table after plan applies will see `complete` status anchored to different evidence context than the record it came from. |
| invariant | HIGH | Plan Task 7 treats un-verifiable historical condition (M4 B1/C1 regression check) as completable through forward-only evidence, eroding baseline contract | Plan line 193-196: M4's original condition 'after-reduction B1/C1 regression check' is declared '구조적으로 재현 불가' (structurally impossible to re-measure) because producer didn't exist at reduction time. Plan proposes replacing with 'current state shows drift=0'. But original contract was 'proof reduction maintained metrics before and after'. Forward-only evidence ('current B1 drift 0 builds') cannot prove the backward claim ('past reduction maintained quality'). This reverses the burden - from 'producer output proves conditions held' to 'absence of observed regression proves conditions held'. Plan line 197 says to add measurement to bullet if lower than 45.2%, but doesn't explain how forward measurement validates historical claim. |
| invariant | HIGH | A3 unhandled error path still exists despite plan claim of fix | Plan line 51 claims 'tiktoken 부재 시 graceful degrade 없이 **크래시**'. File `a3-instruction-cost.js` line 431-434 has try-catch around `proc.stdin.write()`, but line 429 `proc.stdin.write()` throws async errors on stream, not sync throws. No handler registered for `proc.stdin.on('error')`. When child process dies immediately (tiktoken import fails), write to broken pipe emits 'error' event with no listener - unhandled exception kills process. Try-catch only catches synchronous throws, not stream 'error' events. |
| invariant | MEDIUM | Plan Task 7 acceptance criterion doesn't verify status changes are conditional on actual work completion | Acceptance criterion line 275: '`scan.js`가 이 PRD를 `archivable:true` ∧ `nonCanonical:0`으로 판정'. This only verifies the gate returns true, not that the gate is reached because conditions are met. Scan.js cannot distinguish between (a) conditions actually verified by Tasks 1-6, and (b) someone removing the parenthetical markers without doing the work. The gate has become an on/off switch on the marker rather than a check of actual completeness. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | Verified Task 1a claim about unhandled writes (code has .catch() handler); checked RESOLVING_CLOSURE_TYPES definition (correct: only 'fixed','invalidated'); verified C1 calculation uses c.resolved not all closed (correct); confirmed emitting 'deferred' won't affect C1 numerator (sound). Checked findings derive source registration (present at derive/index.js:56); traced computeC1 logic and found code path mismatch with preflight claim; verified cmdBacklogAppend has no finding_closed emit and Task 2 implementation boundary is under-specified." |
| security | pass | Attacked trust boundaries via: (1) finding_id injection paths — appended values come from deriveFindingId (deterministic hash) or pre-supplied (validated at append-time), query returns pre-validated records, emit re-validates against FINDING_ID_RE. (2) gate_decision_id spoofing — validated against SLUG_RE at append-time and re-validated at emit-time. (3) closure_type enum escape — no validation in write path, but read-path filters invalid types so they contribute 0 to C1 metrics. (4) remediation_pr linking — requires both finding_id and gate_decision_id; join keys are nullable and independently validated. (5) Traversal via findings registry paths — resolveFindingsDir uses discoverRepoRoot + git-safe path.join, SESSION_ID_RE prevents escape. (6) Temp file races in plan-review CLI — uses crypto.randomBytes + 'wx' flag + 0o600. (7) Credential leakage — no PII/secrets in attributed data. (8) Stale/corrupted state through append-only invariants — git-tracked files mean tampering is auditable. Found no exploitable path from input to consequence." |
| test | fail | I attacked the plan's testability by: (1) checking whether Validate commands reference files that exist (m9-coverage-gate.js, msw-m9-producers.test.js) — found both missing, created in Task 6 but validated earlier; (2) verifying whether intermediate validation lines actually test what the tasks claim (A3 graceful degrade claim vs. exit-code-only check); (3) confirming that Task 2 specifies a location in code (plan-review/cli.js) but does not cite the exact function or detection logic for "backlog_appended succeeds"; (4) checking whether Task 7 acceptance has a pre-state anchor to prove data moved vs. was edited/lost. Read source files a3-instruction-cost.js, cli.js, m8-coverage-gate.js, msw-metrics.test.js to verify pattern mirroring and existing error handling. Confirmed error handling in cli.js exists (lines 293-297), so A3 crash claim may be outdated, but lack of test validation for the specific behavior remains a gap. |
| invariant | fail | 1. **Fail-open drift in archiving gate** — Traced scan.js line 106 `normalizeStatus()` strict equality check. Currently blocks M4/M5/M8 because status contains parenthetical qualifier (non-canonical). Plan removes qualifier. Gate still mechanically checks for non-canonical, but after plan, gate sees canonical status and approves. No mechanical verification that the conditions were actually resolved, only that the marker was removed. 2. **Receipt anchoring erosion** — Examined plan Task 7 (lines 182-197) which moves parenthetical notes from status table to separate section. Checked acceptance criterion line 273 which requires only grep existence check. This verifies text persistence but not binding integrity per CLAUDE.md §3.12. 3. **Condition equivalence violation** — Reviewed M4 handling (lines 193-197). Original condition was retrospective (before/after regression test). Plan replaces with forward-only check (current drift=0). These are not equivalent - cannot prove past behavior from present absence. 4. **A3 async error handling** — Read a3-instruction-cost.js lines 428-435. Try-catch wraps sync throws from `stdin.write()`, but doesn't register error handler for stream 'error' events. Async error from broken pipe to dead child process is unhandled. 5. **Gate validity test** — Confirmed scan.js line 159 condition: `if (c.rawRowCount === c.complete + c.dropped)` passes if status values equal canonical strings. No mechanism to verify whether conditions supporting those canonical judgments actually hold. |

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
  "wall_clock_ms": 586296,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:1dd5b4506be52088ce88508aa28f9021e13e8aa7f6238d4c580cceee936f9861",
  "plan_path": ".claude/plans/multi-session-work-loop-m9.plan.md",
  "recorded_at": "2026-08-27T06:01:13.021Z"
}
```
