# Plan Review Panel — env-contract-integrity

**Plan**: `.claude/plans/env-contract-integrity-m2.plan.md` · **Plan version**: `sha256:307c9ba427707a7a342e7764d55fa60da1e879f4318346d8a334270a89f48a4a`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 9 blocking finding(s): architect/CRITICAL, architect/CRITICAL, architect/FAIL, test/HIGH — MCCP_REVIEW_SINGLE_PASS=deadline_pressure 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | CRITICAL | Plan cites pattern locations that do not match source code line numbers | Line 39 of plan cites 'vocabulary.js:249' for QUARANTINE pattern, but QUARANTINE definition is actually at vocabulary.js:264. Line 41 cites 'vocabulary.js:334' for resolveVocabulary pattern, but function definition is at vocabulary.js:344. These citations appear in the 'Patterns to Mirror' section which the plan uses as justification for design decisions (Task 1, Task 6). |
| architect | CRITICAL | Cite-and-verify contract violated for load-bearing pattern references | Plan states at line 39-41 'Patterns to Mirror' are from established sources, explicitly citing line numbers as evidence. The architect mandate requires 'Verify every citation you rely on. Open the file:line the plan cites and confirm it says what the plan claims.' The plan cites wrong line numbers for QUARANTINE (off by 15 lines) and resolveVocabulary (off by 10 lines). These are not typos in pattern description but the actual file:line citations used to anchor the design. |
| test | HIGH | Task 8 can implement L11 to validate '값별 결과 블록' (result-per-value blocks) in documentation | Plan Task 7 proposes to write these blocks in documentation, and Task 8 proposes to add L11 validation. However, the plan provides no specification of what these blocks should look like. Current documentation (docs/environment/gates.md, etc.) contains NO such blocks today. The plan shows no example format, no parsing logic, and no test fixtures that demonstrate what L11 should validate. Without a concrete block format specification, L11's parsing code cannot be falsifiably tested — the implementer must guess the format. |
| test | HIGH | Task 9 test fixtures will adequately test L11's '양방향 비교' (bidirectional comparison) | Plan Task 9 says: 'L11의 pass·누락·잉여·placeholder·앵커 부재 5케이스를 fixture로 넣는다' but provides zero actual test code or fixture examples. The test file lint.test.js exists (verified to line 534 in lint.js where L10 ends), but L11 tests do not exist. The plan provides no proof that 5 test cases are sufficient to validate 양방향 비교 for 27 enum values + 9 list members, especially given the risk noted in the plan: 'L11을 켜는 순간 36개 앵커가 전부 red가 된다' suggests testing might catch format mismatches only after all 36 anchors are already written. |
| test | MEDIUM | Validate line for Task 8 is testable: 'node plugins/mccp/scripts/lib/env-contract/lint.js → L1~L11 ok' | This Validate assumes L11 exists and runs, but L11 does not yet exist in lint.js (file ends at line 534 with L10 implementation). The validate command cannot pass until L11 implementation is actually written in Task 8. This is circular: the validate line references code that hasn't been written yet. Additionally, the validate assumes all 36 documentation anchors have already been written with correct block format (Task 7 prerequisite), meaning validation will only work AFTER Task 7 is complete — no incremental verification is possible. |
| test | MEDIUM | The plan's Grounding section G3 correctly identifies which 4 items can be safely promoted | Plan states: 'G3 — 승격 8건 중 2건은 승격이 틀린 처방이다'. The plan claims MCCP_SESSION_START_CONTEXT uses a 'disable 별칭 집합' but provides no test showing that promoting it to an enum constant will fail. The plan also claims MCCP_WORK_MERGE_STRATEGY has a split implementation (shell vs JS) but doesn't show tests proving that adding the constant to JS while shell comparison remains unchanged will cause divergent behavior. These are falsifiable claims but neither is backed by test code that proves the split exists. |
| test | MEDIUM | Task 1 Validate can confirm quarantine items are fixed: 'L10 ok이고 quarantined 배열이 비어 있는지' | The validate assumes that after Task 1 changes registry values and Task 1 deletes QUARANTINE entries, L10 will pass. However, L10's logic (lint.js lines 429-528) only validates EXISTING quarantine items — it does NOT validate that REMOVED items no longer cause mismatches. If a quarantine entry is deleted but the registry/code mismatch still exists, L10 will report the mismatch as a new problem (not 'quarantined'). The test will fail to distinguish between 'item was quarantined and is now removed (correct)' and 'item was quarantined, removed, but the mismatch still exists (incorrect removal)'. |
| test | MEDIUM | The plan proves MCCP_SESSION_LEDGER_SCOPE registry contains correct values after fix | Grounding G1 claims code has default 'global', but plan's registry (line 215) lists values=['repo', 'host', 'global']. However, the plan's own Grounding G3 and Open Question (PRD line 85) state: 'MCCP_SESSION_LEDGER_SCOPE의 정본은 hybrid이고 host는 코드에 없다'. Session-ledger.js:33 shows VALID_SCOPES = ['global', 'repo', 'hybrid']. This is a values mismatch (registry has 'host', code has 'hybrid') that the plan claims to fix in Task 1, but Task 1 description doesn't explicitly mention this mismatch — it only lists 8 items with no specific detail on SESSION_LEDGER_SCOPE's value fix. |
| invariant | CRITICAL | L11 markdown parsing specification is absent, creating fail-closed→degrade risk | Task 8 says L11 will 'find value result blocks in detail anchors and extract line key sets' but provides no specification of: (1) what markdown structure identifies a '값별 결과 블록', (2) the regex or parsing algorithm to extract '줄의 키' from lines, (3) what occurs if parsing returns empty. Task 8 mirrors 'lint.js:214 L2' which uses a fixed-format regex (ROW_RE) to parse index rows. No equivalent parser specification exists for L11. Plan says 'Task 7 puts backtick-quoted values with descriptions' (.claude/plans/env-contract-integrity-m2.plan.md:191) but does not specify markdown structure L11 expects (heading level? bullet list? raw lines?). If Task 7 format differs from L11 parser expectations, L11 could silently extract 0 values while docs are present, then either block gate (acceptable fail-closed) or pass vacuously (fail-open degrade). |
| invariant | HIGH | L11 lacks vacuous-pass detection, risking silent degrade when no block found | L2 pattern check explicitly includes: 'if (index.rows.size === 0) problems.push("...would pass vacuously")' (lint.js:236). Task 8 says L11 will do '양방향 집합 대조' (bilateral set comparison) with registry values but does not mention checking for vacuous pass (empty extracted set with empty registry values both passing as match). If L11 parser fails to find a '값별 결과 블록' but returns {} without reporting it as a problem, L11 would pass when it should halt. This is fail-closed→degrade erosion of the HALT-vs-degrade invariant. |
| invariant | MEDIUM | Acceptance criteria do not enforce Task 7→Task 8 execution order, risking intermediate red state that blocks reviewer approval | Plan Risk section (line 244): 'L11을 켜는 순간 36개 앵커가 전부 red가 되어 착지가 전면 차단된다 (높음)' with mitigation 'Task 7이 Task 8보다 먼저다'. But Acceptance section (.claude/plans/env-contract-integrity-m2.plan.md:260-269) lists '- [ ] Task 1~10 전부 완료' and '- [ ] Validation 1~7 전부 통과' without specifying that Task 7 MUST complete before Task 8 implementation begins. If developer implements L11 (Task 8) before Task 7 fills docs, lint blocks CI even though intermediate state will resolve to correct final state. This risks premature gate closure and false signal noise. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | Read both the plan and PRD. Verified plan's core claims: (1) M1 has 8 quarantined items matching QUARANTINE definition — confirmed at vocabulary.js:264, not line 249. (2) resolveVocabulary is the single vocabulary resolver — confirmed at line 344, not line 334. (3) L10 in lint.js calls resolveVocabulary — verified at lint.js:446. (4) doctor.js has LIST_MEMBER_POLICY — verified at doctor.js:48. (5) Registry has enum/list count of 27+9=36 items — confirmed by grep and direct inspection. (6) Both enum and list entries exist and plan's scope (Task 7, 8) is mathematically feasible. Attacked the "Patterns to Mirror" section as the foundation of the plan's architectural justification. Confirmed that lines cited in that section point to the wrong locations in source code. The plan uses these as evidence for established patterns to justify why Task 1, Task 6, and L11 should follow those patterns, but the citations fail verification. |
| security | pass | Attacked plan through M2-specific trust boundaries: (1) registry file poisoning via malicious vocabulary paths — blocked by lexical validation before fs access; (2) code accepting undeclared values — caught by L10 bidirectional comparison; (3) L11 parser tricked by documentation structure — yamage resolution reads committed files only, parser catches missing/extra keys bidirectionally, semantic correctness explicitly out of scope per plan; (4) settings.json harboring removed/invalid values — intentionally handled by doctor (M1) and corrected atomically in Task 9; (5) absolute path leak through evidence or vocabulary fields — lexical screening blocks POSIX root, drive letters, UNC, home-relative, URLs, env-expansion, and `..` before any file read per vocabulary.js:41-59 and lint.js:121-137; (6) partial-state trust on stale settings — not M2 scope (MVP boundary per PRD); (7) path normalization tricks like `./..` or `../` — fails safe to unreadable vocabulary → gap → L10 blocks. All paths fail-closed. |
| test | fail | Attempted to verify falsifiability of core claims: (1) Examined lint.js to confirm L11 does not exist yet (verified — file ends at line 534 with L10 implementation). (2) Checked registry.js for the 8 quarantine items and verified they exist and are listed in vocabulary.js QUARANTINE array. (3) Searched for existing "값별 결과 블록" format documentation in docs/environment/*.md — found NONE. No examples, no spec provided in plan or code. (4) Read lint.test.js structure and found no L11 test fixtures (tests exist for L1-L10 patterns but plan provides no concrete L11 fixture code). (5) Verified session-ledger.js:33 shows VALID_SCOPES=['global','repo','hybrid'] confirming code/registry mismatch on 'host' vs 'hybrid'. (6) Confirmed l lint.js L10 logic (line 429-528) validates only declared quarantines, not removal correctness. Checked Task 9 Validate references but found no test files that would prove L11 works as spec'd. |
| invariant | fail | Checked L2 pattern matching in lint.js to establish baseline fail-closed behavior and parsing approach; examined Task 7-8 descriptions for markdown format specification (found generic description but no concrete regex/algorithm); verified Task 8 Mirror references point to L2 but L11 has no equivalent parser defined; searched for 'vacuous\|pass vacuously' patterns in plan (found none for L11 despite L2 having explicit check); reviewed Acceptance criteria structure to identify order-enforcement mechanisms (found none beyond prose task list); traced risk mitigation statements for technical vs. discipline-based controls. No evidence found that L11 parser is defined elsewhere or that vacuous-pass checking is mentioned for L11 specifically." |

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
  "wall_clock_ms": 497073,
  "halt_stage": null,
  "backlog_appended": 9,
  "backlog_skipped_nonblocking": 5,
  "granted": 4,
  "reviewed_plan_hash": "sha256:307c9ba427707a7a342e7764d55fa60da1e879f4318346d8a334270a89f48a4a",
  "plan_path": ".claude/plans/env-contract-integrity-m2.plan.md",
  "recorded_at": "2026-08-25T04:24:32.957Z"
}
```
