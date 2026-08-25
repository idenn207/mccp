# Plan Review Panel — impeccable-detection-contract-m5

**Plan**: `.claude/plans/impeccable-detection-contract-m5.plan.md` · **Plan version**: `sha256:2e7c31745d1efc5e737f0a8de521a918872fd75524644e98b7cfe29d924cd870`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 6 blocking finding(s): test/HIGH, test/HIGH, test/FAIL, invariant/CRITICAL — MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| test | MEDIUM | Task 1 measures A/B/C evidence drift and produces reproducible output, with A=111, B=28, C=23 split verified | Plan lines 147-158 assert specific numeric values (111 A-class, 28 B-class, 23 C-class) without showing prior execution or baseline data. The Validation line 171 claims to validate against '노트에 적힌 A/B/C 수치' (numbers in notes), but Task 1 creates both the script AND the notes in the same task. This is circular: the script output cannot be independently verified against pre-existing baseline values. |
| test | HIGH | The ±2 line window for L10 evidence detection is appropriate and will not cause false positives on valid registry entries | Plan lines 219-221 specify ±2 line window for A-class detection. Plan lines 352 acknowledges this as a risk ('±2행 창이 너무 좁아 정상 항목이 붉어진다'). Risks mitigation (line 352) says 'before starting, measure window size for all items', but Task 1 does not explicitly include window-size measurement as a validation step. Plan describes what will be measured (A/B/C drift) but not whether ±2 window sufficiency will be tested. If a registry entry has the variable name at line X+3 (outside the ±2 window), L10 will incorrectly classify it as C-class. |
| test | MEDIUM | Task 5 test verifying EVIDENCE_DEBT contains zero impeccable items will reliably catch any misclassified items if measure-evidence.js algorithm is incorrect | Plan lines 239-247 describe Task 5 test assertions, including 'EVIDENCE_DEBT에 `^(MCCP_)?IMPECCABLE_` 에 매칭되는 이름이 **0건**이다'. However, this test only passes if measure-evidence.js correctly classifies all 23 impeccable items as not belonging in EVIDENCE_DEBT. The plan never specifies the classification algorithm or shows test cases validating it. If measure-evidence.js has a bug in B-class detection (distinguishing 'same file different line' from 'different file'), the test could pass with incorrect data. |
| test | HIGH | L7 (evidence examples check) will correctly include or exclude `not-consumed` status items after status is added | Plan lines 189-192 state a risk: 'status가 바뀌면 lint L7의 대상 집합이 달라질 수 있다' and say 'L7이 status로 분기하는지 먼저 읽고'. However, reviewing lint.js lines 326-377, L7 does NOT branch on status - it processes all non-retired toggles uniformly. This means adding `not-consumed` will automatically make 19 IMPECCABLE_* entries part of the L7 example-verification scope. The plan should explicitly state whether `not-consumed` items are exempt from L7 or need examples added. |
| test | LOW | Task 3 changes to MCCP_IMPECCABLE_SKILL kind from 'string' to 'enum' with values ['available','missing'] will not break existing code or tests | Plan line 201-204 specifies this change. Grep search confirms impeccable-detect.js:324 tests `forced !== 'available' && forced !== 'missing'`, confirming only these two values are valid. However, plan does not show that any existing tests checking the registry schema (e.g., kind validation) will handle the kind change. If schema validation tests have a hardcoded list of allowed kinds, they may fail after this change. |
| invariant | CRITICAL | Plan does not specify fail-closed behavior if `evidence-debt.js` fails to load. The ratchet mechanism depends on requiring this file (Task 4, action 3: 'evidence-debt.js가 export하는 이름 집합만 정방향 실패를 면제한다'), but plan has no error handling specified for require() failure. | .claude/plans/impeccable-detection-contract-m5.plan.md:225-226 (Task 4 describes ratchet exemption) and lines 349-357 (Risks section omits load failure scenario). Acceptance section (L368-378) has no test for evidence-debt.js load failure or validation. |
| invariant | HIGH | Plan does not specify whether L7 (usage example check) must exclude `not-consumed` status items. The plan acknowledges risk of silent unchecking but delegates resolution to code review without mechanical enforcement. | .claude/plans/impeccable-detection-contract-m5.plan.md:189-192 (Task 2 action 2): 'L7이 status로 분기하는지 먼저 읽고...조용히 대상에서 빠지면 19개 절의 사용 예시가 검사 밖으로 나간다.' Also Risks line 353: risk severity 'medium', mitigation is 'read code and decide'. |
| invariant | MEDIUM | Task 5 test plan does not include verification that `evidence-debt.js` can be loaded, has valid JavaScript syntax, or exports the expected Object.freeze structure. Test only validates semantic correctness of contents, not structural validity. | .claude/plans/impeccable-detection-contract-m5.plan.md:239-247 (Task 5): lists 4 assertions, none of which verify evidence-debt.js load success or structure (valid JS, exports freeze, keys match toggle names, non-empty set). |
| invariant | MEDIUM | Plan does not mandate that vacuous-pass guard for L10 (Task 4, action 4: 'L8·L9와 같은 형태의 가드를 둔다') must HALT on empty `evidence-debt.js` export. Vacuous-pass guards for L8/L9 are explicit in code (lines 382, 404 in lint.js check for empty entries), but plan doesn't specify equivalent for L10's debt list. | .claude/plans/impeccable-detection-contract-m5.plan.md:227-228 (Task 4, action 4) describes guard pattern but does not specify: must fail on empty debt export, must fail on debt load failure, or must validate debt set non-empty. |
| invariant | MEDIUM | Plan's reverse L10 check (line 222-224) only verifies `not-consumed` names do NOT appear in runtime surfaces, but does not verify that evidence points to valid documentation sections. This could allow `not-consumed` items with broken evidence pointers (wrong file path, non-existent heading) to pass the reverse check while failing the semantic intent. | .claude/plans/impeccable-detection-contract-m5.plan.md:222-224 and Task 2, action 3 (line 182): 'evidence는 각 변수의 `docs/environment/external.md:<그 절의 헤딩 행>`으로 교체한다'. L10 reverse check only validates absence in runtime (line 224), not documentation presence or correctness. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | Verified all load-bearing citations in the plan: (1) Confirmed 19 IMPECCABLE_* variables exist in registry.js lines 223-241, are never read by mccp code, but evidence currently points to impeccable-detect.js:135/:256 per the claim. (2) Verified MCCP_IMPECCABLE_SKILL is read at line 319 but registry points to 301 — confirmed B-class drift. (3) Confirmed IMPECCABLE_FORCE_OVERRIDE_REASON is read at prp-implement.md line 437 (decision table) and 702 (condition check), not line 224 — confirmed B-class drift. (4) Verified dep-check.js does NOT read IMPECCABLE_VERSION, confirming the documentation at external.md lines 306-307 is false as claimed. (5) Confirmed bare Skill(impeccable) calls are absent from all command bodies (grep found 0 in plugins/mccp/commands/), validating the CLAUDE.md §1.1 claim is outdated. (6) Verified pattern precedent at registry.js:251 showing MCCP_PLAN_REVIEW_L1 with 'absent-by-design' status + docs anchor. (7) Verified STATUSES list at lines 47-50 is extensible and Object.freeze'd per cited pattern. (8) Verified L1-L9 lint checks exist; L10 as extension is architecturally sound. (9) Confirmed MCCP_PLAN_REVIEW_TEST_INVOKE is read at plan-review/cli.js:538 and should be registered. (10) Verified schema union structure (evidence-debt ratchet + not-consumed status) prevents silent regression — the two-way check (new drifts catch, stale debt entries catch) is mechanically sound as described in Tasks 4-5. No contradiction found between plan structure and actual codebase state. |
| security | pass | Attacked path injection (L8 lexical screening pre-validated, L10 adds only string search on validated paths); environment variable expansion (blocked by existing regex, unchanged); absolute path leakage (NUL byte · POSIX/drive/UNC/home-relative/URL/env-expanded/traversal checks in place); evidence tampering (all sources committed, test guards EVIDENCE_DEBT ratchet, impeccable items structurally excluded); partial-state trust (not-consumed validated by reverse L10 check); override escape (MCCP_IMPECCABLE_SKILL already validates values); new bypass via status field (status is enum from committed registry, no attacker control). Found no defect. |
| test | fail | Attacked: (1) Whether the plan's numeric drift measurements (111/28/23 split, 19/4 impeccable subset) can be validated independently - found circular validation where script output checks against notes created by same task. (2) Whether ±2 line window for evidence detection is appropriate - found acknowledged risk in Risks section but no explicit validation in Task 1 despite mitigation claim. (3) Whether EVIDENCE_DEBT test can catch misclassifications - found no specification of measure-evidence.js algorithm, making the test unverifiable. (4) Whether adding `not-consumed` status breaks L7 - read lint.js and found no status-based branching in L7, meaning scope silently changes. (5) Whether MCCP_IMPECCABLE_SKILL kind change is safe - verified code accepts only 'available'/'missing' but didn't find schema regression tests. Read: plan lines 1-379, registry.js, lint.js, impeccable-detect.js (lines 1-400+), impeccable-routing.js (lines 1-150). |
| invariant | fail | Attacked the ratchet skip-predicate mechanism: checked whether lint.js would HALT if evidence-debt.js can't be loaded, is malformed, or exports empty set. Checked whether L7 usage-example check has status-based branching for `not-consumed` items. Verified whether Acceptance criteria include tests for evidence-debt.js load failure, syntax validation, or structure verification. Examined whether vacuous-pass guards for L10 match the explicit pattern in L8/L9 (empty-input check with fail message). Traced the reverse L10 check to verify that `not-consumed` evidence validation is complete (confirmed only runtime-absence verified, not doc-presence)." |

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
  "wall_clock_ms": 873036,
  "halt_stage": null,
  "backlog_appended": 6,
  "backlog_skipped_nonblocking": 6,
  "granted": 4,
  "reviewed_plan_hash": "sha256:2e7c31745d1efc5e737f0a8de521a918872fd75524644e98b7cfe29d924cd870",
  "plan_path": ".claude/plans/impeccable-detection-contract-m5.plan.md",
  "recorded_at": "2026-08-23T09:34:13.144Z"
}
```
