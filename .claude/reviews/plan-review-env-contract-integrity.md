# Plan Review Panel — env-contract-integrity

**Plan**: `.claude/plans/env-contract-integrity-m1.plan.md` · **Plan version**: `sha256:1e4806b94f046698958fe1ed071285ba88ad6e08be11303bc9fbbf1f635373da`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 7 blocking finding(s): security/FAIL, test/HIGH, test/FAIL, invariant/HIGH — MCCP_REVIEW_SINGLE_PASS=deadline_pressure 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | MEDIUM | Plan's quarantine table structure does not explicitly enforce the 'file evidence on each entry' requirement of the cited TOGGLE_EXCLUSIONS pattern | Plan line 38 cites toggle-snapshot.js:13 TOGGLE_EXCLUSIONS as mirror pattern ('실파일 근거가 붙는다'), but Task 1 line 133 specifies quarantine as `{ name, expected, actual, reason, owner }` without requiring file:line in reason field. Acceptance test line 244 verifies stale detection but not evidence presence. Actual TOGGLE_EXCLUSIONS (toggle-snapshot.js:51-90) shows each entry has `evidence: 'path:line — explanation'` structure. |
| architect | MEDIUM | Plan does not explicitly specify whether vocabularyGap requires a separate RAW column or nested field structure | Task 2 line 108 says 'vocabulary 열 추가' (singular column) but lines 139-140 require `vocabularyGap` reason field with 'build()가 throw' validation when null without reason. Current registry.js:266-290 build() maps row[0-8] to object fields; adding vocabulary at row[9] requires clarifying where vocabularyGap maps (row[10]? nested? derived?). Plan does not state new RAW column count after update. |
| architect | MEDIUM | DERIVERS table interface and invocation mechanism not specified in plan | Task 1 line 132 describes DERIVERS as a table containing named derivers (M1 has 'hook-ids' one) and what it does ('합집합하고' — merge two sources) but does not specify data structure (is entry a function? callable? object with properties?). Task 3 L10 must resolve `{ derive: 'hook-ids' }` references but plan provides no algorithm for invoking or reading deriver results. No signature specified for what `extractConstant()` returns when calling a deriver. |
| security | MEDIUM | Vocabulary path references lack directory traversal validation. The plan introduces paths like `'path/to/file.js#CONST'` in Task 1 extractConstant() but does not specify validation to prevent parent directory traversal (`..`), absolute paths, or other escape patterns. | Plan §Task 1 line 131 describes extractConstant signature and behavior but makes no mention of path validation. Compare with existing lint.js:119-135 evidenceLexicalProblem() which validates the `evidence` field and explicitly rejects paths containing `..` (line 133), absolute paths (lines 127-131), home-relative paths (line 130). Registry.js lines 35-36 document that evidence must be 'repo-root 상대 경로' to avoid leaking absolute paths. The vocabulary field introduction in Task 2 line 139 specifies 3 forms (path reference, deriver, gap reason) but does not reference or require path validation. |
| security | MEDIUM | Plan does not specify that vocabulary path validation errors should occur before filesystem operations. If extractConstant reads files before validating paths, directory traversal attempts could leak file contents to tool output or test failures, replicating the absolute-path leak that CLAUDE.md §3.12 was designed to prevent. | CLAUDE.md §3.12 states there was 'a real precedent (an absolute `cwd` leak forcing a sanctioned re-seal)' and instructs reviewers to 'check that the plan does not reopen it on a new field.' Lint.js lines 19-21 explicitly document that the order is load-bearing: 'L8의 순서는 load-bearing이다. 실재를 먼저 보면 디스크에 존재하는 절대경로가 통과해 CLAUDE.md §3.12가 닫은 누출 경로가 다시 열린다' — vocabulary lexical screening must occur before filesystem reads. Plan Task 1 makes no mention of this ordering constraint. |
| test | HIGH | Task 7 will extend lint.test.js with L10 test fixtures (pass/fail/stale-quarantine) and existing assertions are not deleted. | Plan Task 7 line 185 states 'lint.test.js 확장(L10 pass/fail/stale-quarantine). 기존 단언 삭제 0건' (expand lint.test.js with L10 pass/fail/stale-quarantine. existing assertions: delete 0). However, plugins/mccp/scripts/lib/env-contract/tests/lint.test.js line 297 contains 'assert.equal(negativeFixtures, 9, 'L1..L9 각각에 붉어지는 fixture가 하나씩 있어야 한다')' which will immediately fail when L10 failing fixtures are added and negativeFixtures increments to ≥10. The Plan's own Validation step #2 ('node --test plugins/mccp/scripts/lib/env-contract/tests/') will fail to pass. |
| test | MEDIUM | Task 7 specifies all test file updates needed: vocabulary.test.js, doctor.test.js, cli.test.js, lint.test.js. | Plan Task 7 line 185 lists 'vocabulary.test.js · doctor.test.js · cli.test.js · lint.test.js' (4 files) but omits registry.test.js. However, Plan Files to Change line 117 explicitly requires: 'plugins/mccp/scripts/lib/env-contract/tests/registry.test.js \| UPDATE \| 36개 enum/list가 전부 3형태 중 하나를 갖는다는 단언' (assert all 36 enum/list have one of 3 vocabulary forms). This update is load-bearing for the plan's core claim (DD9: vocabulary field is mandatory for enum/list). The test specification gap creates risk that implementer skips this test update. |
| test | MEDIUM | L10 test will validate the bidirectional quarantine drain rule via 'stale-quarantine' fixture. | Plan Task 7 line 185 specifies 'L10 pass/fail/stale-quarantine' fixtures but does not define what 'stale-quarantine' means or how to construct the fixture. Plan Acceptance line 244 states the criterion: '격리 항목 하나의 expected를 코드와 일치시키면 L10이 "격리를 지우라"로 red가 되는지 1회 확인' (when a quarantine item's expected value matches code, L10 should fail saying 'remove quarantine'). However, Task 7 does not map this criterion to a specific test implementation. Without defining the fixture structure, the test may not actually validate the bidirectional check that DD3-ii depends on. |
| invariant | HIGH | L10 lint check for vocabulary drift is never automatically invoked; no gate or hook runs lint.js, creating fail-open gap where new toggles bypass vocabulary verification | Plan line 198-199: '# 1. 계약 lint — L1~L10 전부 통과 / node plugins/mccp/scripts/lib/env-contract/lint.js' shows manual invocation only. DD6 (line 98) explicitly states 'hook 등록 0건, receipt 0건' for doctor. No Files to Change entry shows registering lint as a hook/gate. Acceptance criterion (line 243) is '1회 확인' (1-time manual check) that L10 catches D1 drift, not automated enforcement. |
| invariant | HIGH | Grounding G1 (refutation of shallow-merge hypothesis) is based on single platform-specific observation that cannot robustly predict future behavior; plan does not create fail-closed verification of this assumption | Plan line 69-70: 'G1의 관측은 *설명 문구*에만 쓰이고 그 문구는 측정 근거 표시를 달고 나간다.' But line 59 states this is '1회 관측' (1 observation). Line 69-70 admits 'Windows · 이 worktree · 사용자+프로젝트 2계층 조건이다' (narrow scope). Line 86 says this grounding is critical: '**M1의 진단 설계가 이 답에 의존한다**'. Acceptance criterion (line 246): '게이트와 경로를 실제로 1회 완주' — one-time manual verification, not ongoing automated check. |
| invariant | HIGH | Quarantine stale-check enforcement (DD3-ii) is manual-only; no automated test verifies that fixed items have quarantine entries removed before M2 completion | Plan line 95 (DD3-ii): '격리 항목이 더 이상 불일치하지 않아도 실패한다'. But Acceptance (line 244): '격리 항목 하나의 `expected`를 코드와 일치시키면 L10이 "격리를 지우라"로 red가 되는지 1회 확인' — this is stated as a one-time manual check, not an automated invariant. No test file entry shows automated detection of stale quarantine entries. |
| invariant | MEDIUM | Vocabulary extraction can silently mark items as unreadable (vocabularyGap), preventing L10 from catching drift in those items; coverage is intentionally incomplete and plan accepts this without automated fallback | Plan line 94 (DD2 form c): 'null + vocabularyGap' — items can be marked unreadable. Line 145 Task 3: '어휘 해석 실패는 `vocabularyGap`이 있으면 정보, 없으면 problem'. Line 225 Risks: '정적 추출이 표현식으로 만든 집합을 못 읽어 커버리지가 조용히 낮아진다'. Acceptance (line 245): '0이라고 주장하지 않는다' (no coverage guarantee). If a known drift item is marked with vocabularyGap, L10 won't catch it. |
| invariant | MEDIUM | Doctor diagnostic tool creates observation without enforcement; no gate blocks deployment if doctor reports 'not-received' or 'value-diverged' errors | Plan DD6 (line 98): '`doctor`는 게이트가 아니다. hook 등록 0건, receipt 0건, 어떤 게이트도 이 exit code를 읽지 않는다'. Table at line 157-167 shows 8 finding types but line 98 explicitly says '종료코드(0/1/2)는 사람과 스크립트를 위한 것이지 자동 차단을 위한 것이 아니다'. This violates HALT vs degrade principle: diagnostic errors are reported but cannot halt. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | Verified plan's core claims against source code: (1) MODES constant in decide.js:50 actually is ['codex','multi-agent','hybrid'] and registry entry has ['off','multi-agent','codex','hybrid'] — mismatch confirmed, L10 example is sound. (2) Verified bash-hook-dispatcher.js contains 'id:' literals and hooks.json contains hook IDs — two-source deriver claim is accurate. (3) Verified registry.js exists and current build() structure to confirm Task 2 update requirements. (4) Checked TOGGLE_EXCLUSIONS pattern in toggle-snapshot.js:13/40-90 to confirm the cited 'file evidence' rule exists in source. (5) Analyzed L10 stale-quarantine logic (DD3-ii) — design is sound even if quarantine entry structure isn't fully specified, because stale check re-calculates current state. (6) Checked all 9 Design Decisions for logical contradiction — none found. (7) Verified Acceptance criteria are testable and cover core functionality. No CRITICAL logical defects or boundary violations found; all findings are specification/clarity gaps that would not prevent correct implementation in project context." |
| security | fail | Attacked path handling in vocabulary extraction (Task 1): verified that extractConstant does not specify path validation against `..`, absolute paths, or other traversal patterns. Checked existing codebase patterns (evidenceLexicalProblem in lint.js) and confirmed the evidence field already validates these; vocabulary field introduction does not specify equivalent validation. Examined registry.js to confirm the evidence field documentation requires repo-relative paths; the planned vocabulary column does not mention this requirement. Checked that no part of Task 2 (registry changes) specifies path validation. Verified that lint.js explicitly orders lexical screening before filesystem operations to prevent absolute-path leakage; plan does not document this ordering for vocabulary paths. Searched plan for any mention of vocabulary path validation, validation reuse from existing patterns, or traversal rejection — none found. This is a genuine gap in the specification, not a limitation or acceptable design choice. |
| test | fail | I read the plan and PRD, then examined the existing test files (lint.test.js, registry.test.js) and the registry.js and lint.js implementation files to verify whether the plan's test specifications would actually validate the claims. I checked: (1) whether the lint.test.js fixture count assertion is falsifiable when L10 is added—found stale assertion at line 297; (2) whether all required test file updates are called out in Task 7—found registry.test.js omitted from Task 7 despite appearing in Files to Change; (3) whether the 'stale-quarantine' L10 fixture structure is specified—found no definition in Task 7 of what triggers this fixture or what it tests; (4) whether Validation commands would catch these gaps—confirmed Validation step #2 runs all tests but test code itself has the defects. |
| invariant | fail | - Checked whether L10 enforcement is automatic: Confirmed it only runs via manual `node plugins/mccp/scripts/lib/env-contract/lint.js` invocation with no gate/hook registration. - Traced grounding G1 dependency: Verified plan claims M1 diagnosis depends on G1's answer but G1 is based on one narrow-scope observation with no ongoing verification mechanism. - Analyzed quarantine stale-check: Confirmed DD3-ii stale-check is stated as one-time manual acceptance criterion, not automated invariant. - Examined vocabulary coverage: Confirmed plan explicitly accepts gaps marked with vocabularyGap and these gaps bypass L10 detection. - Reviewed doctor enforcement: Confirmed doctor creates no gate or receipt; exit codes are advisory-only with no blocking downstream gate. |

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
  "wall_clock_ms": 486821,
  "halt_stage": null,
  "backlog_appended": 7,
  "backlog_skipped_nonblocking": 9,
  "granted": 4,
  "reviewed_plan_hash": "sha256:1e4806b94f046698958fe1ed071285ba88ad6e08be11303bc9fbbf1f635373da",
  "plan_path": ".claude/plans/env-contract-integrity-m1.plan.md",
  "recorded_at": "2026-08-21T01:16:04.256Z"
}
```
