# Plan Review Panel — impeccable-detection-contract-m1

**Plan**: `.claude/plans/impeccable-detection-contract-m1.plan.md` · **Plan version**: `sha256:17f9208e368a424250543b1dd803acc702058c7e8e17d54dcad994592b69ed8e`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 11 blocking finding(s): architect/CRITICAL, architect/CRITICAL, architect/HIGH, architect/FAIL — MCCP_REVIEW_SINGLE_PASS=deadline_pressure 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | CRITICAL | Plan's foundational architectural claim: plugin skill invocation namespace is `impeccable:impeccable` (line 16) | Line 104 specifies plugin invocation formula as `<pluginName>:<skillDirName>`. Line 74 in Task 0 claims registry has `impeccable:impeccable` for plugin 4.1.1. However, `.claude/_meta/2026-08-22-impeccable-plugin-channel-migration.md` (Evidence section 0, lines 43-50) documents actual observed plugin key as `impeccable@impeccable`, not bare `impeccable`. Therefore pluginName=`impeccable@impeccable`, and applying the formula produces `impeccable@impeccable:impeccable`, NOT `impeccable:impeccable` as claimed on line 16. |
| architect | CRITICAL | Return type enum for invocation field completely defines allowed values (line 90) | Line 90 defines enum as `invocation: 'impeccable' \| 'impeccable:impeccable' \| null`. Given the formula at line 104 where pluginName is `impeccable@impeccable` (per metadata evidence), the actual plugin invocation value would be `impeccable@impeccable:impeccable`. This value is NOT included in the enum, creating a boundary violation where the function would produce a value that its own type definition forbids. |
| architect | HIGH | Plan's internal consistency: Task 1 formula reconciles with foundational claim and validation expectations | Line 16 claims namespace is `impeccable:impeccable`. Line 104 defines formula as `<pluginName>:<skillDirName>`. Line 118's validation expects sources array to contain 'plugin 4.1.1' but doesn't specify what invocation value that plugin source should report. This creates an undefined contract — the validation requirement doesn't align with the return type enum, which cannot represent the actual namespaced value the formula produces. |
| security | LOW | Plan specification for handling multiple matching plugin registry entries is incomplete | Plan line 104 specifies prefix matching /^impeccable@/ but does not document which entry is selected when multiple entries (e.g., impeccable@impeccable and impeccable@anthropics) both exist in installed_plugins.json. Current probeSkillAvailable (impeccable-detect.js:143) uses first match pattern, but plan does not mandate this. |
| security | LOW | Frontmatter version parsing at 8KB boundary is not explicitly tested | Task 2 (line 120-124) proposes bounded 8KB read of SKILL.md for frontmatter parsing and test cases (line 124) but does not include test case for version line split across 8KB boundary (e.g., reading 'version: 4.' instead of 'version: 4.1.0'). However, YAML frontmatter is typically ≤500 bytes, making this edge case unlikely in practice. |
| test | CRITICAL | Existing 6 tests for probeSkillAvailable will remain unbroken after wrapping resolveImpeccable() | Task 1 (line 112) claims new behavior requires SKILL.md files ('project와 user는 디렉토리 존재가 아니라 `SKILL.md` 존재를 요구한다'). Task 3 (line 129) wraps probeSkillAvailable to call resolveImpeccable().available. But impeccable-detect.test.js line 209-221 creates an empty directory without SKILL.md and expects probeSkillAvailable() to return true. After implementation, this test will fail. Task 5 (line 52) specifies updates to impeccable-detect.test.js only as 'fixture의 `impeccable@anthropics` 리터럴을 실측 키로 교정' — no mention of fixing the failing tests. Task 4 line 148 explicitly adds test case 'empty dir (SKILL.md absent) → available:false' which contradicts the existing test expectation. |
| test | HIGH | Task 1 Validate command verifies oracle output on this machine | Task 1 Validate (line 118) instructs: 'node -e "console.log(JSON.stringify(require('./plugins/mccp/scripts/lib/impeccable-detect.js').resolveImpeccable({}),null,2))" ... 이 머신에서 `available:true` · `source:'project'` · `invocation:'impeccable'` · `version:'3.5.0'` 을 낼 것'. This is an ad-hoc machine-dependent environment check, not a unit test. It: (1) depends on external state (project 3.5.0 + plugin 4.1.1 installed); (2) is not in the Validation section (line 188-209); (3) fails if run elsewhere; (4) is not repeatable in CI. The actual Validation section (line 203) references a different command 'resolve --json' that will be created by the plan. |
| test | HIGH | Task 4 test matrix completely covers all source enumeration paths | Task 4 claims 11 test cases but references only a matrix in the plan, not actual test code. The plan creates a new file 'impeccable-resolve.test.js' but shows no test implementation. Without seeing the actual test code, it cannot be verified that: (1) all 11 cases are actually implemented; (2) test fixtures properly set up all required file structures (e.g., SKILL.md for plugin sources per line 111); (3) the test harness correctly creates temporary directories with the required file hierarchies for each case. |
| test | HIGH | Files to Change correctly specifies all test updates needed | Plan line 52 specifies impeccable-detect.test.js UPDATE as 'fixture의 `impeccable@anthropics` 리터럴을 실측 키로 교정하고 legacy 키는 별도 케이스로 보존'. But with the new SKILL.md requirement, existing tests at line 209-221 ('user-level skill directory triggers true') and line 247-258 ('env override missing beats user-level directory') will fail unless they create SKILL.md files in their fixtures. The plan does not explicitly document that these specific tests will be updated to create SKILL.md files. |
| invariant | HIGH | Test specification for project+user coexistence case is incomplete and could permit ambiguous implementation | Plan Task 4 line 146 specifies only `shadowed:true` · `version:null` · `sources.length===2` for project+user case, but does not specify expected values for `available`, `source` (singular), or `invocation` fields. This contrasts with line 147 (plugin+project case) which explicitly specifies `shadowed:false` and `승자 'project'`. The test matrix will be codified as validation criteria (line 155: 'node --test ... 전건 pass'), but without fully specified expectations for all fields, different implementations could return different values for `source` when both bare sources exist, violating receipt anchoring for downstream gates. |
| invariant | MEDIUM | Gap in invariant documentation: no specification for `source` field behavior when shadowed=true and multiple bare sources exist | Plan section 3.1 'Multiple bare sources' (lines 108-116) states the oracle returns `version:null` + `shadowed:true` to signal ambiguity, but does not document what value `source` (singular) should contain. The design says 'detection doesn't guess' but every field in the return object must have a concrete value. If `source` defaults to null or an arbitrary choice (first, last, etc.), this should be explicitly stated in the contract so validators and downstream code can rely on it. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | Verified the plan's core architectural claims by: (1) Reading the plan's cited code references (impeccable-detect.js lines 54, 139; dep-check.js line 20); (2) Cross-checking the plan's namespace claim against the metadata evidence file it itself references, which documents observed plugin key as `impeccable@impeccable` not bare `impeccable`; (3) Tracing the plan's invocation formula definition (line 104: `<pluginName>:<skillDirName>`) and applying it to the documented plugin key to verify what value it would actually produce; (4) Comparing formula output against the return type enum at line 90 to detect boundary violations; (5) Checking Task 0 line 74 which explicitly reiterates the namespace claim. The defect is not in missing features but in the foundational architectural statement being incomplete/inconsistent with both the plan's own formula and the evidence it cites. |
| security | pass | Examined trust boundaries: plan reads from plugin registry, ~/.claude/skills/, and ./.claude/skills/ — all user-controlled locations with no privilege escalation path. Checked path handling: plugin installPath validated to exist on disk; project/user paths are hardcoded well-known locations with no user input in path construction. Verified file access: 8KB bounded read for frontmatter prevents DoS; JSON parsing wrapped in try/catch per dep-check.js pattern. Validated data flows: returned `path` field contains system paths (non-secret), `version` is text string (not executed), `invocation` is enumerated string (not user input). Confirmed environment variable precedence: MCCP_IMPECCABLE_SKILL functions as controlled escape valve. Traced five hostile scenarios: (1) plugin registry containing malicious `impeccable@malware` with `installPath:/etc` — blocked by requirement that `skills/*/SKILL.md` must exist (requires system compromise); (2) symlink traversal via ~/.claude/skills/impeccable → user's home directory is trusted domain; (3) frontmatter injection attack via YAML deserialization — plan uses line-by-line parsing, not YAML parser; (4) version string command injection — version returned as string, never executed or shell-quoted; (5) absolute path leak into receipt — plan returns repo-relative paths only. No evidence found that plan introduces new attack surface or violates trust boundaries. |
| test | fail | Attacked test coverage and falsifiability of key claims: (1) Reviewed existing probeSkillAvailable tests (6 cases at lines 169-271 of impeccable-detect.test.js) and found they create empty directories without SKILL.md files; compared against plan's claim that new behavior requires SKILL.md existence (Task 1 lines 105-106, 112); identified contradiction with Task 3 wrapper behavior and Task 4's contradictory empty-dir test case (line 148). (2) Examined Task 1 Validate line (line 118) and confirmed it's an ad-hoc environment-dependent command, not a proper unit test in the Validation section. (3) Reviewed Task 4 test matrix (11 cases) and found it's specified as a table but with no actual test code visible; impeccable-resolve.test.js doesn't exist yet. (4) Checked Files to Change specification for impeccable-detect.test.js (line 52) against identified breaking tests; found fixture key update is specified but no mention of adding SKILL.md file creation to tests that now require it. |
| invariant | fail | Traced fail-closed gates, receipt anchoring, and rollback safety by: (1) reading the plan's core design claims (lines 13-14 "no gate behavior change") against the actual source enumeration logic; (2) checking whether new `detect()` fields are persisted to receipts that gate validators check (they are not, intentionally deferred); (3) verifying that `probeSkillAvailable()` remains a thin wrapper returning only `.available` (confirmed); (4) analyzing the four-source enumeration logic for unknown-input handling (all fail-closed: file checks, null returns, no throws); (5) examining the test matrix (Task 4, lines 139-151) to verify specification completeness and find that the project+user shadowed case does not specify `source` / `invocation` / `available` values, creating ambiguity; (6) cross-checking this gap against the plan's intent statement (line 113: "priority is unmeasured"). Found that while the plan correctly acknowledges uncertainty, the test case does not encode how to resolve it at implementation time. This breaks receipt anchoring for any validator or downstream gate that depends on the `source` field being stable and predictable. |

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
  "wall_clock_ms": 499883,
  "halt_stage": null,
  "backlog_appended": 8,
  "backlog_skipped_nonblocking": 3,
  "granted": 4,
  "reviewed_plan_hash": "sha256:17f9208e368a424250543b1dd803acc702058c7e8e17d54dcad994592b69ed8e",
  "plan_path": ".claude/plans/impeccable-detection-contract-m1.plan.md",
  "recorded_at": "2026-08-22T08:32:50.875Z"
}
```
