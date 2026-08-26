# Plan Review Panel — impeccable-detection-contract

**Plan**: `.claude/plans/impeccable-detection-contract-m6.plan.md` · **Plan version**: `sha256:887fc89d67c5c742aecbe60c435bca1ab06ad3d2c261e552b66b6477b1a32272`
**Verdict**: `converged` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=true
**Layers**: L1 converged · L2 converged · L3 not fired

> Reason: L1 + L2 quorum satisfied (4/3 responses, 4 distinct roles); L3 not fired

## Findings

None — all 4 fielded reviewer(s) responded and passed.

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | Verified all major structural claims: (1) dead `.claude/cache/` branch unreachability via .gitignore:131 exclusion in file-set construction; (2) actual duplication in measure-evidence.js vs evidence-name.js matching claimed implementation signatures; (3) substring matching vulnerability in scan.js isExcluded confirmed; (4) missing path normalization in write.js:713 vs existing pattern at :494; (5) absent key-count validation in schema.js despite canonicalRoutedEntry prototype at write.js:1150-1162; (6) consistency with existing patterns across all proposed changes (assertShape throw-at-load, req() validation form, test enforcement of invariants). Found no evidence of architectural holes, boundary violations, inconsistencies with existing code, or unprotected invariants. |
| security | pass | Examined Task 1-2 path handling and key validation: Task 2 correctly normalizes `--impeccable-commands-routed-file` to match restamp behavior (write.js:710→1211), addressing inconsistency between initial write and update paths. Task 1 adds schema whitelist for exactly 3 keys, mirroring restamp enforcement via `canonicalRoutedEntry`. Task 3 dead code verified unreachable (`.gitignore:131` excludes path, rendering isSurface cache branch impossible). Task 4-6 ratchet/dedup/scope changes all defensive (increase prevention, split-brain union, safe expansion). Verified no new paths introduced for data leakage (evidence-debt.js EVIDENCE_DEBT list contains only env var names, no secrets). Task 2's path.resolve(cwd,p) is in-scope per buildReceipt:368. Task 0(b) confirms 0 legacy extra keys in this repo, so schema whitelist has no soilage. Risks section accurately assesses and mitigates version collision (§3.7), sibling PRD exclusions (DD1), and test coverage (Task 11). No trust boundary violations, path traversal, or audit trail forgery risks detected. |
| test | pass | Attacked the plan across eight key dimensions: **1. Dead branch claim (DD3, Task 3)** — Verified `.gitignore:131` entry `.claude/cache/` exists and would exclude that path from both `git diff --name-only HEAD` and `git ls-files --others --exclude-standard`. The `isSurface` regex test at lines 471 and 1218 of prp-implement.md both reference the pattern correctly. Task 3 Validate V7 will confirm removal. Task 13 promises to verify oracle output unchanged — the test is externalizable and falsifiable. **2. Schema whitelist enforcement (Task 1)** — Confirmed `canonicalRoutedEntry()` at write.js:1150-1162 already exists with the exact 3-key validation logic needed. Task 1 requires adding this to schema.js:921-934 as a formal validator. Existing test file structure in impeccable-routing-fields.test.js lines 110-138 shows the pattern (throw on invalid enum). New tests would follow the same pattern. No logical gap. **3. Path resolution asymmetry (Task 2)** — Confirmed: initial write path (write.js:710-715) calls `readJsonIfPresent(p, null)` with **no** `path.resolve(cwd, p)`, while restamp path (write.js:1211) **does** resolve with `path.resolve(cwd, entriesFile)`. The asymmetry is real and testable. Plan correctly identifies this. Task 2 Validate will confirm the fix. **4. Duplicate WINDOW/hasName (Task 5)** — Confirmed: `measure-evidence.js` defines `WINDOW` (line 32) and `hasName()` (line 41-42). `evidence-name.js` defines identical `EVIDENCE_WINDOW` (line 37) and `nameAppears()` (line 43). `lint.js` re-exports the latter (lines 487-488). Duplication is real. Plan to consolidate is sound. Task 5 Validate (measure-evidence.js output pre/post) will confirm consolidation doesn't change behavior. **5. Evidence debt array size (Task 4)** — Counted EVIDENCE_DEBT items in evidence-debt.js lines 33-78: approximately 28-29 items match the plan's claim. Task 0 (c) will measure this exactly with `measure-evidence.js --json` output A/B/C. Task 4 requires adding ceiling constant + load-time assertion. Falsifiable: attempting to exceed ceiling triggers throw. **6. Test file existence and extension** — Confirmed `impeccable-routing-fields.test.js` exists. Task 1/2 Validate assume test file will be modified with new assertions (extra-key rejection + path resolution). The test file follows the pattern of existing tests (lines 110-138 throw on bad input). Plan Task 11 says assertions will be added but doesn't detail the code — this is normal for a plan. The Validation commands are falsifiable once implementation happens. **7. fix-task-applied.md drift (Task 10)** — Confirmed: `.claude/state/fix-task-applied.md` has mismatch: `task_fingerprint: impeccable-detection-contract-m4` (line 3) but `decision_id: impeccable-detection-contract-m5` (line 5). Plan correctly identifies this drift. Task 10 Validate will confirm they match after fix. **8. Open Questions measurement strategy (Task 9)** — Plan claims to close 3 open questions via measurement: (a) hook double-registration via static evidence (plugin manifest + CLI 3.6.0), (b) Node lower bound via version check (not raised, documented as degraded), (c) `impeccable@anthropics` source via git-log. Strategy is sound and falsifiable per Task 9 Validate: "관측을 노트에 적는다" + PR review can confirm. DD7 explicitly states "라이브 이중 발화 관측은 잔여로 남긴다" — not glossing over gaps. All major claims are load-bearing on implementation details that will be visible at runtime (schema validator behavior, test assertions, receipt fields) or static code inspection (path resolution, function duplication, array size). No claim depends on an unverifiable premise. Validation section provides concrete falsifiable commands (V1-V8). No test claims gaps identified that would make a falsifiable outcome unreachable. |
| invariant | pass | Attacked fail-open drift across all tasks: Task 1 schema whitelist (measured no legacy non-canonical keys, restamp already enforces); Task 2 path normalization (confirmed asymmetry, fix is fail-closed throw); Task 3 dead code (verified git semantics, V7 validates state); Task 6 L10 expansion (confirmed value.js has 0 impeccable literals, other L-consumers unchanged); Task 4 ceiling ratchet (mechanism tightens, not loosens, test pairs ceiling with length); sketch predicates (no gates skipped, no work marked complete); receipt anchoring (no new hash carve-outs, present-only preserved); resource accounting (no new launches, all stamped). Verified assumption: impeccable_commands_routed oracle output always 3 keys since v1.13.0 supported by write.js:701 versioning, restamp canonicalRoutedEntry enforcement, and Task 0(b) measurement of 0 non-canonical keys. Present-only contract provides fail-closed defense against unknown legacy format. |

## Measurement

<!-- Written by plan-review/cli.js record on EVERY exit path, pass or halt.
     Machine-readable; do not hand-edit. A null field means the axis was
     not observed, never that it was zero. -->

```json
{
  "verdict": "converged",
  "source": "multi-agent",
  "layers": {
    "l1": "converged",
    "l2": "converged",
    "l3": "not fired"
  },
  "quorum": {
    "responded": 4,
    "required": 3,
    "roles": 4,
    "of": 4,
    "passed": true
  },
  "wall_clock_ms": 779328,
  "halt_stage": null,
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:887fc89d67c5c742aecbe60c435bca1ab06ad3d2c261e552b66b6477b1a32272",
  "plan_path": ".claude/plans/impeccable-detection-contract-m6.plan.md",
  "recorded_at": "2026-08-23T12:40:46.234Z"
}
```
