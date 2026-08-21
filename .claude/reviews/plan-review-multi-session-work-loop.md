# Plan Review Panel — multi-session-work-loop

**Plan**: `.claude/plans/multi-session-work-loop-m7.plan.md` · **Plan version**: `sha256:f6bfde5a006196cbfc6034459a4e9c40f714e7f85c94679a9a65687f167441a8`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 6 blocking finding(s): architect/FAIL, test/FAIL, invariant/HIGH, invariant/HIGH — MCCP_REVIEW_SINGLE_PASS=deadline_pressure 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | MEDIUM | Closure type enum is fully specified with 5 types and sources documented | Plan line 237 lists 5 closure types: `fixed` · `invalidated` · `deferred` · `downgraded` · `rejected`. DD2 (lines 74-79) provides mapping table covering REJECTED_BY_DESIGN → invalidated, DEFER_TO_BACKLOG → deferred, REJECT_YAGNI → rejected, ACCEPT_NOW → null. DD3 explains `fixed` comes from non-recurrence detection. However, `downgraded` source is never documented anywhere in plan, Tasks, DDs, or cited code. The mapping covers 4 adjudication verdicts, DD3 specifies 1 (fixed), DD8 discusses another (find_closed). Total: 4 sources for 5 types. When Task 1 implements the enum, where does `downgraded` populate from? |
| architect | MEDIUM | Batch append atomicity is guaranteed without size limits | Plan line 138: 'N줄을 한 번의 write로 붙인다'. Line 237: 'N줄을 한 번의 `fs.writeSync`로 붙인다'. However, no maximum batch size is specified, and no assumption is documented about platform write atomicity. POSIX systems guarantee atomicity only up to PIPE_BUF (typically 4KB). For batches larger than this limit, `fs.writeSync` is not atomic. Since the plan enforces per-line 8KB cap (line 237) but no batch-size cap, a single batch could exceed atomicity boundaries. DD8's `seq` loss detection assumes all-or-nothing writes, which may not hold for large batches. |
| test | MEDIUM | Task 2 and Task 3 co-presence is enforced by failing pre-commit test in c1-feedback-loop.test.js | Plan line 244-245: `c1-feedback-loop.test.js`가 `SOURCE_SCANNERS`에 `findings` 키가 실재하는지를 직접 단언하므로 Task 2-only 트리에서는 `Task 2 자신의 test가 붉어진다`. However, the plan provides no explicit test showing Task 2-only validation fails; it only describes this as the mechanism. Line 246 Validate command specifies running both test files without conditionally skipping missing SOURCE_SCANNERS checks. |
| test | MEDIUM | Existing fixture at msw-metrics.test.js:416 will be updated to include type_separation: true and this prevents regression | Line 185, 244: Plan notes fixture needs update but provides no failing test that validates the current fixture without type_separation would cause C1-TYPE-SEPARATION-CONTRACT to fail. Test C1-TYPE-SEPARATION-CONTRACT is described at line 246 but its validation statement doesn't explicitly verify that fixtures without type_separation are rejected. |
| test | MEDIUM | Four functions from intent-context.js (escapeReferenceText, trimDanglingEscape, anyTokenMixedScript, looksDirective) will be added to module.exports | Line 264: Plan requires Task 5 to add these to exports. Current code (intent-context.js lines 892-926) shows only decodeBoundedEntities exported from this group. Plan's C1-PROMOTE-SANITIZED test (line 265) would indirectly fail if imports don't work, but there is no explicit test of 'are these 4 functions exported' in Task 5's Validate section. |
| test | LOW | Findings registry producer will not emit events until all Tasks 1-4 are complete | Producer Preflight section (line 13-25) claims findings producer is absent in production. However, no Validate command checks that .claude/state/findings/ remains empty or that appendFindings() is unreachable until Task 1 completes. This is verified only through code inspection, not through test. |
| test | LOW | merge=union glob pattern works for future work_unit filenames | Task 1's Validate line 238 describes 'レジスタリ경로의 merge attribute가 union으로 해석됨' without explicitly testing glob pattern matching. Validation section lines 324-326 tests glob with 'zzz-future-work-unit.jsonl' but this is Task 7's gate, not Task 1's assertion. Ownership table line 221 assigns C1-MERGE-UNION to Task 1, but test description doesn't confirm glob coverage. |
| invariant | HIGH | Degraded metric blocks ship but gate implementation doesn't check degradation flag | Plan §DD8 & Task 2 line 243 claim 'degraded는 배송 증거로는 쓰지 않는다 — Task 7 `--acceptance`가 degraded를 거부하므로'. But Acceptance criteria (line 374) only checks 'metrics.C1.status === computed' + non-null numerators. No verification that C1.coverage !== 'degraded'. Plan creates Task 7 code to enforce this but never shows the actual check exists in that module. |
| invariant | HIGH | Runtime falsifier for finding surface delta has unspecified implementation gap | Plan §DD8 line 281 describes falsifier as checking '.claude/reviews/ 사전·사후 스냅샷 delta가 전부 대응 `finding_opened` 이벤트를 갖는지' but all findings per decision are stored in single file plan-review-<slug>.md (record.js:76). Plan doesn't specify how delta detects NEW findings appended to existing file vs detecting new files entirely. Multi-round accumulation in one file makes finding-level detection requirement infeasible without parsing file content, which plan's 'file system결과로만 판정' (line 281) explicitly avoids. Implementation path unspecified. |
| invariant | MEDIUM | Task 2-3 co-presence gate is enforced only post-merge, not in review | Plan §DD10 line 244-245 claims Task 2-only tree is caught because 'Task 2 자신의 test가 붉어진다'. But this test file c1-feedback-loop.test.js is created AS PART OF TASK 2 itself (line 182). The test asserts SOURCE_SCANNERS includes 'findings', but this assertion exists in the code being reviewed. While Task 2's own validation would catch it, once Task 2 is merged and someone later cherry-picks just that commit, the test would fail at runtime for any subsequent user. This is post-merge failure, not in-review gate failure. |
| invariant | HIGH | Acceptance criteria line 374 omits degradation check while plan claims gate enforces it | Acceptance #4 (line 374): 'C1이 `computed`로 뒤집힌다 — `node plugins/mccp/scripts/derive/cli.js run --json`의 `metrics.C1.status === 'computed'` 이고 `numerator`/`denominator`가 non-null.' Task 2 plan (line 243) says degraded metrics don't ship, but the check statement has no mention of examining degradation. Metrics with status='computed' + non-null numerators but coverage='degraded' would pass this criterion despite plan stating they should not. |
| invariant | MEDIUM | Registry file proof of commit existence relies on git state outside receipt model | Acceptance criteria line 321 checks 'git cat-file -e HEAD:.claude/state/findings/multi-session-work-loop.jsonl' but standard receipt anchoring in mccp uses digital signatures + commit SHA within receipt JSON (§3.12). This plan unbundles the proof: git commit existence is checked separately from receipt content. If git history is rewritten, the criterion would falsely pass/fail independent of receipt integrity. Cross-system anchoring creates drift window between 'file in git' and 'receipt metadata'. |
| invariant | MEDIUM | Plan cites non-existent `intent-context.js` exports without verifying current state | Plan line 264 says Task 5 Mirror 'notebooks 호출해 승계한다' four functions: escapeReferenceText · trimDanglingEscape · anyTokenMixedScript · looksDirective. But plan line 265 immediately notes 'export 없이는 이 Mirror가 실행 불가능한 문장으로 남는다'. Yet Task 5 action (line 261) doesn't explicitly list adding these to module.exports as a requirement — it only says 'intent-context.js의 함수를 **재사용**한다'. Implementation of export addition is delegated but not mandated in action list. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | Verified plan citations: checked that findings-registry module doesn't exist (correct—it's Task 1 output) · verified SOURCE_SCANNERS lacks `findings` key (correct) · confirmed computeC1 currently returns `forward-only` with no findings source (correct) · confirmed typeIntegrity bug (line 632 in msw-metrics/index.js) that fails if all findings are closed (plan's DD5 diagnosis is accurate) · verified ADJUDICATION_VERDICTS enum has exactly 4 values (correct) · verified .gitattributes currently lacks merge=union directive (correct). Searched for `downgraded` in schema and code—found only in review-single-pass context, never in findings closure context, never sourced from ADJUDICATION_VERDICTS mapping. Examined DD2, DD3, DD8, and Task descriptions for closure type sources—none explain `downgraded`. Examined batch atomicity assumptions in line 138 and 237—no platform limitations documented, no batch size cap specified. Both defects are structural gaps in plan specification, not implementation errors. |
| security | pass | Attack surface scan: (1) Path leakage — verified chokepoint normalization and test coverage, mirrors existing `normalizeReceiptCwd` pattern; (2) Injection via `## Open Findings` — verified sanitization function availability (currently unexported but explicitly scoped to Task 5) and test coverage; (3) Registry bypass — verified coverage gate static lint + runtime falsifier, threat model properly limited; (4) Concurrent write corruption — verified `seq` duplicate and gap detection; (5) Partial-state trust — `cited_path` normalization is mandatory per design, not optional per caller; (6) Secrets leakage into durable artifacts — absolute paths → placeholder or repo-relative, validated by test; (7) Tamper surface — registry chokepoint is `appendFindings()` only, non-approved writers caught by static gate; (8) Override/bypass env toggles — no new toggles added (UI7); escalation boundary is constant (UI7). No HIGH/CRITICAL findings identified. |
| test | fail | Attacked: (1) Task 2 co-presence barrier — read plan DD10 description and code references; verified that ADJUDICATION_VERDICTS exists with 4 entries; checked whether test file exists and found it doesn't (planned creation); (2) fixture update necessity — read current msw-metrics.test.js fixture at line 416 and confirmed type_separation field absent; searched for tests of type_separation contract; (3) intent-context.js exports — read module.exports block (lines 892-926) and confirmed 4 functions present in code but not exported; searched for their definitions; (4) findings producer absence — read Producer Preflight section and searched for existing appendFindings calls in codebase; (5) merge=union glob — read Task 1 Validate description and Validation section glob test; examined .gitattributes for existing rules. Found no existing implementations of Task files (as expected for a plan), but identified test coverage gaps in plan documentation. |
| invariant | fail | Attacked plan's fail-closed assertions: (1) Degradation blocking via Acceptance gate — found acceptance criteria omits degradation check despite plan requiring it. (2) Runtime falsifier completeness for finding surface — identified unspecified implementation for detecting findings appended to existing .claude/reviews/ files. (3) Task 2-3 mutual enforcement — shown gate is post-merge, not pre-merge, and cherry-pick scenarios bypass it. (4) Receipt anchoring — found cross-system proof (git state + receipt) creates drift window. (5) Sanitizer export chain — found delegated but unmandat export addition in Task 5. Tested: whether degraded flag actually blocks metrics (no check in criteria), whether falsifier can detect mid-file finding additions (spec unclear), whether test enforcement blocks pre-merge (no, only runtime). |

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
  "wall_clock_ms": 307345,
  "halt_stage": null,
  "backlog_appended": 6,
  "backlog_skipped_nonblocking": 10,
  "granted": 4,
  "reviewed_plan_hash": "sha256:f6bfde5a006196cbfc6034459a4e9c40f714e7f85c94679a9a65687f167441a8",
  "plan_path": ".claude/plans/multi-session-work-loop-m7.plan.md",
  "recorded_at": "2026-08-21T01:23:55.347Z"
}
```
