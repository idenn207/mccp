# Plan Review Panel — environment-doc-uniformity

**Plan**: `.claude/plans/environment-doc-uniformity.plan.md` · **Plan version**: `sha256:a3c83fa31213edd201115ba9d192dbfd105d467fa18bcc25da099b84ece562a5`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 2 blocking finding(s): architect/HIGH, architect/FAIL — MCCP_REVIEW_SINGLE_PASS=deadline_pressure 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | Lint.js integration into normal CI/test flow is not guaranteed. The plan creates a three-source harmony system (index ↔ registry ↔ runtime) whose correctness depends entirely on lint.js running. However, lint.js is only explicitly invoked in Validation 2, which is part of plan acceptance, not part of the normal test suite or CI pipeline that runs on every commit. After this plan ships, future PRs could silently break the three-source invariants without mechanical detection. | Plan line 12 establishes the core architecture: '색인 ↔ 레지스트리 ↔ 런타임 스캔의 삼각 정합은 `env-contract/lint.js`가 fail-closed로 검사'. Validation 2 (line 545) invokes lint.js explicitly: `node plugins/mccp/scripts/lib/env-contract/lint.js --json`. However, no subsequent text indicates lint.js is added to .claude/settings.json hooks, CI configuration, or the standard test suite that runs via `node --test`. Validation 7b (line 666-674) runs test files but not the lint.js CLI itself—it tests lint.test.js (the unit test module), not the actual lint enforcement. Files to Change does not list any CI configuration or hook registration for lint.js. The Acceptance criteria (line 777) requires 'Validation 0·0b·0c·0d·1~8 전부 통과', but these are one-time acceptance checks, not ongoing enforcement. Without lint.js in the standard test flow, the invariants it protects could drift in future commits without detection. |
| architect | MEDIUM | The plan cites R6 CRITICAL scope gap (L9 must scan both .js and .md surfaces) but Validation 0c's scope check is incomplete. While Validation 0 checks that walkSurfaces includes both surfaces (line 401-402), Validation 0c (line 454-495) only filters walkSurfaces output to .js files before scanning, so it doesn't actually verify .md files are covered by 0c's own analysis. | Plan line 459-462 states: 'R6 invariant CRITICAL 흡수: 스캔은 이제 `plugins/mccp/scripts/**/*.js` 와 `plugins/mccp/commands/*.md` **두 surface**를 모두 걷는다.' However, Validation 0c (line 421) explicitly filters: `const files=walkSurfaces(process.cwd()).filter(function(p){return p.endsWith(".js");});`. This means 0c's audit only checks .js files, not .md files. The plan's concern (line 466) that 'command body안의 `node -e` 스니펫도 실행되는 production 코드이고, 실제로 등록 boolean 토글을 raw로 비교하는 지점이 4건' would only be verified if 0c scanned .md surfaces. Without that verification, the claim that .md surface is 'covered' by 0c is not falsifiable—0c would pass even if .md files were accidentally excluded from walkSurfaces. |
| test | MEDIUM | Validation 0b verifies bypass-flag read-site counts against Task 0 audit table with automatic detection of staleness | Line 446 hardcodes WANT={MCCP_SKIP_RECEIPT:4,MCCP_CODEX_DISABLED:9,MCCP_ALLOW_CODEX_UNAVAILABLE:3}; lines 262-266 specify same values in Task 0 table. Error message (line 448) says 'Task 0 audit table says <WANT[n]>' but WANT is the single source of comparison—no mechanical verification that these remain synchronized. If Task 0 table is updated without updating WANT constant, validation will report misleading error messages. Acceptance (line 784) handles this as human checklist ('재산출되어 일치'), not automated test. |
| invariant | LOW | Validation 0c checks if files appear anywhere in plan with backticks, not specifically in Files to Change table, allowing incomplete Files to Change lists to pass validation while Task 4 skips those files | .claude/plans/environment-doc-uniformity.plan.md:491 uses `plan.indexOf("`"+f+"`")!==-1` to check entire markdown; label at line 454 claims 'Files to Change 가 스캔 출력을 **덮는지**' but implementation is weaker. Mitigated by lint L9 (Validation 7b, lines 318-327) which provides fail-closed verification requiring zero raw comparisons post-migration |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | Attacked: (1) Integration boundary—whether lint.js will execute automatically to maintain three-source sync after plan ships. Plan establishes lint.js as fail-closed enforcer of the architecture but does not commit to running it in CI or normal test flow. (2) Validation scope—whether 0c actually verifies both surfaces it claims to check (the R6 CRITICAL gap). Found 0c filters to .js only despite plan saying 0c audits both surfaces. (3) Registry as single source—checked if parseBool dispatch prevents two definitions of same toggle's default (DD2). Found it's protected by registry lookup. (4) Bypass-flag set immutability (DD3)—checked if new bypass-flags could silently be added. Found Validation 0 enforces set equality, not just count. (5) Evidence path security—checked if absolute paths could leak into registry. Found lint L8 checks lexically before fs, preventing leak. (6) Task dependencies—checked if implementation errors in earlier tasks cascade. Found Validation 0c catches scope gaps. (7) Seams for next milestone—checked enum/numeric deferral (DD6). Found it's explicitly scoped and backlogged." |
| security | pass | Attacked plan via six axes: (1) absolute path leakage into git-tracked registry via L8 ordering — lexical check precedes FS check per Task 5 & Validation spec; (2) bypass-flag set scope — constrained to exactly 3 via set equality test in Validation 0; (3) uniform parsing of bypass-flags across 16 total read sites — Task 0 audit table verified against actual code (codex-bridge.js, codex-invoke.js:212, codex-reachability.js, cost-guard.js, write.js ×2, dep-check.js, session-start.js, codex-runner.js, plus 3 for SKIP_RECEIPT, 3 for ALLOW_CODEX_UNAVAILABLE); (4) stderr suppression hiding DD1 warnings — Validation 0d newly checks command body files for `2> /dev/null` around migrated parseBool calls; (5) walkSurfaces scope creep via L9 (raw boolean checks outside env-contract module) — R6/R10 extended scope to both .js and .md surfaces with negative fixtures for both; (6) evidence path validation (lexical before FS check, runtime path resolution in fixture) — stated in Task 5 & R8 absorption. All CRITICAL/HIGH findings from R0-R10 absorbed or mechanical tests added. No undefended trust boundaries found. |
| test | pass | Checked all major claims for test coverage: (1) uniform 2-kind boolean values — validated by Validations 0b, 7c (T-BYPASS markers), 8a/8b (real consumers). (2) no bypass-flag widening — validated by T-BYPASS corpus tests + Validation 8b actual execution. (3) all runtime toggles documented — Validation 1 re-scans at runtime and checks registry coverage. (4) registry-document projection — Validation 2 (lint L2) checks bidirectional equality. (5) scan.js walkSurfaces used by 0b/0c/L9 — Validation 0 interface contract + lint L9 spy marker. (6) path realism — all files either exist or created in Tasks, with Validation 7a gate. (7) test non-vacuity — Validation 7c checks explicit markers (T-BYPASS checked=N, REGISTRY entries=N bypass=N boolnull=0, LINT negative-fixtures=N with js/md distribution, walk-spy count). Found hardcoded WANT constant at line 446 lacks automated synchronization with Task 0 table (line 262-266), but Acceptance requires human verification. No untestable claims; all user intents and design decisions have tests. No claims tested only via fixtures without integration validation. |
| invariant | pass | Attacked: (1) vacuous passing via count guards - all present and fail-closed; (2) module dependencies - Validations correctly sequenced after Tasks; (3) skip predicates - no conditional bypasses in validation blocks, all process.exit() use code 1; (4) Validation 0c specificity - weaker than label but fail-closed via lint L9; (5) hard-coded audit numbers in Validation 0b - fail if diverge from Task 0; (6) walkSurfaces shared function - spy checks verify actual usage. Three-layer chain (0c → Task 4 → L9) all fail-closed. No fail-open paths found." |

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
  "wall_clock_ms": 650958,
  "halt_stage": null,
  "backlog_appended": 2,
  "backlog_skipped_nonblocking": 3,
  "granted": 4,
  "reviewed_plan_hash": "sha256:a3c83fa31213edd201115ba9d192dbfd105d467fa18bcc25da099b84ece562a5",
  "plan_path": ".claude/plans/environment-doc-uniformity.plan.md",
  "recorded_at": "2026-08-19T05:44:37.152Z"
}
```
