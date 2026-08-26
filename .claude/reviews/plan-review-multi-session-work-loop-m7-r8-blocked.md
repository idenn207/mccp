# Plan Review Panel — multi-session-work-loop

**Plan**: `.claude/plans/multi-session-work-loop-m7.plan.md` · **Plan version**: `sha256:a4b83762c2f385511e105fd34369ec7d20a3842480737aa8c3d5a12ca26e225f`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 5 blocking finding(s): architect/CRITICAL, architect/FAIL, security/CRITICAL, security/CRITICAL

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | CRITICAL | Codex-findings-backlog.md currently contains 7 lines per plan line 21; plan uses this false claim to argue C1 producer wiring is M7 responsibility (not scope creep) | codex-findings-backlog.md verified grep count: 281 table rows, not 7. File is 267.5KB. Plan cites this as evidence that 'backlog alone can never be numerator' at line 21, then claims at line 23 'C1 producer 구축은 M7의 범위이고 scope creep이 아니다' |
| security | CRITICAL | When a PRD is moved to archived/, subsequent sessions will use a different work_unit and findings will become orphaned (DD4) | Plan claims: 'slug은 PRD 경로에서 파생되므로 PRD가 `archived/`로 이동하면...이후 세션은 다른 slug을 낸다' (DD4). However, the actual work_unit derivation in `plugins/mccp/scripts/receipt/decision.js:69-75` (which the plan references as authoritative) only extracts basename via `planPath.split(/[\\\\/]/).pop()`, not the full path. Both `.claude/prds/multi-session-work-loop.prd.md` and `.claude/prds/archived/multi-session-work-loop.prd.md` extract to the same basename and produce identical slug `multi-session-work-loop`. Therefore, archived PRDs do NOT produce different work_units, contradicting DD4's core assumption about orphaned findings. |
| security | CRITICAL | The plan depends on this (incorrect) work_unit change for C1 metric stability, claiming old findings would be in different shards and thus C1 measurement would be safe (DD4, final paragraph) | Plan states: 'slug 이동은 C1을 부풀리지 않는다. 그럼에도 이 성질은 명시 계약이다 — derive source가 언제가 "현재 slug만 읽기"로 바뀌면 그 순간 분모가 조용히 줄어 부풀리는 방향이 열리므로...이 성질은 명시 계약이다'. This entire argument rests on work_unit changing on archive, which does not happen per decision.js logic. The consequence is that finding shards are NOT orphaned, and metrics computation is directly affected. |
| security | MEDIUM | Plan specifies normalizedClaim normalization as 'lowercase + whitespace compression + punctuation removal + truncation' but references existing santa code (`santa/gate.js:213-214`) that does NOT truncate | Plan Task 1: '`normalizedClaim`은 소문자화 + 공백 축약 + 구두점 제거 후 절단이다'. Actual mirror code at `plugins/mccp/scripts/lib/santa/gate.js:213-214` shows: `return (typeof claim === 'string' ? claim : '').toLowerCase().replace(/\\s+/g, ' ').trim();` - no truncation, no punctuation removal regex specified. Plan does not clarify whether 절단 means length-truncation or just trim(), creating ambiguity about collision risk. |
| security | MEDIUM | Plan does not specify how unmapped verdict values in CLOSURE_FROM_ADJUDICATION should be handled at runtime, though assertion claims completeness is checked | Task 4 describes behavior: 'map.get(verdict)가 null이 아니면 finding_closed를, null이면 finding_adjudicated를 emit한다' but does not explicitly specify what happens if verdict is not in the map (returns undefined, which is neither null nor a valid closure_type). Assertion C1-EMIT-PLAN-CODEX requires mapping exhaustiveness ('전건을 덮는다') but the plan does not spell out the test implementation (e.g., 'iterate through all ADJUDICATION_VERDICTS values and verify each in the map'). |
| security | MEDIUM | Finding registry normalization of cited_path to repo-relative is described as a single chokepoint, but plan does not prevent direct writes to registry files that bypass the appendFinding function | Plan DD4: '호출자 책임으로 두면 emit 지점 3곳 중 하나만 빠져도 절대경로가 새고...초크 포인트를 우회하는 유일한 방법은 레지스트리 경로에 직접 write하는 것'. Mitigation is Task 7's coverage gate lint, which the plan states must check both finding표면 and registry경로 writes. However, Task 7's lint implementation is not specified in sufficient detail - plan does not explain HOW the static lint identifies unapproved writers (AST analysis? Grep? Whitelist validation?). |
| test | LOW | DD5: The current computeC1 typeIntegrity check requires at least one deferred/downgraded/rejected finding to exist, which incorrectly marks all-closed work units as invalid | plugins/mccp/scripts/lib/msw-metrics/index.js:632-633 shows `const typeIntegrity = (deferredFindings + downgradedFindings + rejectedFindings) > 0 && ...`. When all findings are closed (0 deferred + 0 downgraded + 0 rejected), the first condition fails, making typeIntegrity false and marking C1 as invalid. The existing test at msw-metrics.test.js:416 passes because it has non-zero deferred/downgraded/rejected counts (4+2+2), masking the bug. The plan correctly identifies this as a defect. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | Verified three of four Producer Preflight evidence claims: (1) C1 derive source not in SOURCE_SCANNERS at line 28 — confirmed absent, code returns 'forward-only' at line 619 of index.js; (2) receipt --findings-file flag exists but callers are 0 — pattern confirmed in grep across commands/; (3) backlog line count — grep verified 281 ≠ 7. Checked DD5 bug claim: computeC1 line 632 does use the flawed `(defer+downgrade+reject)>0` logic DD5 targets, so diagnosis is correct. Verified no prior findings-registry.js or findings derive source exists. Checked .gitignore: .claude/state/findings/ has no exception (not yet protected, normal for a plan). The plan's scope boundary argument rests on false empirical claim about backlog size. |
| security | fail | Examined trust boundaries and data handling throughout the plan: (1) work_unit derivation from PRD paths - found that slug uses basename-only extraction per decision.js, making the plan's claim about work_unit changes on archival false; (2) normalizedClaim transformation - found existing reference code does not truncate, creating ambiguity in plan spec; (3) verdict mapping completeness - found assertion claims exhaustiveness but implementation details are sparse; (4) cited_path normalization chokepoint - found coverage gate is described but not specified sufficiently; (5) merge=union safety - verified this is properly specified with reader sorting by seq; (6) seq-based loss detection - found this is correctly designed with batch_expected validation; (7) path traversal via work_unit - confirmed basename-only extraction prevents this; (8) finding_id hash length - confirmed 16-char (or 12-char reference) is collision-safe. The critical issue is the fundamental misalignment between the plan's assumptions about work_unit behavior (changes on archive) and the actual code's behavior (basename-only, so does not change). |
| test | pass | Attacked the plan's core claims about type_separation contract, registry path derivation, test coordination, and acceptance criteria. Verified: (1) DD5's diagnosis is correct - the current typeIntegrity logic is buggy (requires non-closed findings to exist); (2) existing C1 test (msw-metrics.test.js:416) lacks type_separation field which Task 2 correctly identifies for addition; (3) findings derive source is not currently wired in SOURCE_SCANNERS (expected for a plan); (4) all Validate commands reference real, executable CLI paths; (5) acceptance criteria are mechanically verifiable via runnable commands; (6) no untestable claims about LLM behavior or observation-only assertions found. The plan's claim about the decision slug being derived from PRD path (not plan file) is testable via the acceptance criterion that checks the file exists at `.claude/state/findings/multi-session-work-loop.jsonl`. The test coordination mechanism (Task 2's test failing if Task 3 not done) is sound in principle, though implementation details about how to access SOURCE_SCANNERS are not specified. |
| invariant | pass | Attacked six axes: (1) fail-open drift in computeC1 logic—plan correctly identifies current defect (requires non-closure to be valid) and fixes via type_separation contract in Task 2, with atomicity enforced by Task 2's test assertions; (2) skip predicates—M7 introduces no new skip paths, only new data source; (3) receipt anchoring—plan correctly specifies git-tracked registry with work_unit sharding, no hash-based anchoring changes; (4) .gitattributes merge=union requirement—assigned to Task 1 with explicit Acceptance validation (lines 355-356), opt-in but mandatory for milestone acceptance; (5) Task 2+3 co-landing atomicity—enforced by pre-commit test assertions (line 230-232, `C1-SOURCE-REGISTERED-COPRESENT`), test fails if Task 3 missing, acknowledged as discipline-based control with marked HIGH risk absorption (line 331); (6) rollback safety—batch atomic append + seq-based loss detection (DD8) with acknowledged residual tail-loss scenarios, compensated by Task 7 falsifier for inflated-direction loss. Verified: current typeIntegrity logic at line 632 matches plan's defect identification; no pre-existing findings-registry code; coverage gate Task 7 implements co-presence check (line 262); accept-now findings stay open until round N+1 (DD3), promoting to next session if unresolved (Task 5). Found no fail-closed gate erosion, no receipt anchoring break, no skip predicates that bypass mandatory checks. |

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
  "wall_clock_ms": 449737,
  "halt_stage": "5.2e",
  "granted": 4,
  "reviewed_plan_hash": "sha256:a4b83762c2f385511e105fd34369ec7d20a3842480737aa8c3d5a12ca26e225f",
  "plan_path": ".claude/plans/multi-session-work-loop-m7.plan.md",
  "recorded_at": "2026-08-17T15:34:49.238Z"
}
```
