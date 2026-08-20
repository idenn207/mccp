# Plan Review Panel — environment-uniformity

**Plan**: `.claude/plans/environment-doc-uniformity.plan.md` · **Plan version**: `sha256:3188f08aa7efc1eb4914c7c8bfdbed2e60307ff37addb999cd223a6b0b9d1272`
**Verdict**: `unknown` via `multi-agent`
**Quorum**: 4/? responses · 4 distinct roles (of ? fielded) · passed=unknown
**Layers**: L1 converged · L2 ran (quorum not evaluated) · L3 not fired
**Halted at**: `5.2b`

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | CRITICAL | Validation 1 will pass with 'undocumented=0', but the plan lists 22 real runtime toggles (MCCP_A3_READ_USER_MEMORY, MCCP_CODE_CLI, etc. line 46) that have no registry entries | Plan line 437-445 shows Validation 1 checking `missing=r.toggles.filter(function(n){return !known.has(n);})` with `if(missing.length){...process.exit(1);}`. Plan line 34-38 states 'Runtime: 127, Excluded: 10, Real: 117, Registered: 95, Unregistered: 22'. Grep confirms these toggles exist in code (`MCCP_A3_READ_USER_MEMORY`, `MCCP_CODE_CLI`, `MCCP_DASHBOARD_STALE_DAYS` found in runtime). Yet Validation 1 line 443 says 'if(missing.length){console.error("undocumented toggles: "+missing.join(", "));process.exit(1);}' This cannot pass with 22 undocumented toggles unless they are in TOGGLE_EXCLUSIONS, which the plan does not document. This is a logical contradiction. |
| architect | HIGH | Schema encodes singular `evidence:"path:line"` per toggle, but toggles have multiple read sites (4, 9, 3 respectively per line 258-262); the plan verifies only one read site per toggle, leaving others unverified | Task 2 line 280 specifies `evidence` is `path:line` form (singular). Audit table line 258-262 shows MCCP_CODEX_DISABLED has 9 read sites. Acceptance criterion line 662 requires 'evidence가 실재하는 path:line을 가리킴' (singular). Schema is `{name, kind, values, default, status, domain, doc, evidence}` with no array field for multiple sites. Validation 0b (line 363-400) only verifies read site **count** matches task 0 table, not that all 9 sites use identical parsing. Only one `path:line` goes into registry per toggle. This creates a boundary leak: if the 9 read sites later diverge in parsing logic (e.g., one adds `!== '1'` logic), only the single recorded site would be auditable. |
| architect | MEDIUM | Task 0 produces no code output—only a manual table in the plan document—but is marked as a prerequisite for all tasks; when Validation 0b detects drift (table is stale), there is no recovery path defined | Task 0 line 251-271 describes action as 'read site를 열거해 각 지점의 비교 형태를 기록하고' but does not specify a file or code module to record into. The output is lines 258-263 (a markdown table in the plan). Validation 0b checks '표가 낡으면 실패한다' (line 270-271). Acceptance criterion line 657 requires the table to match Validation 0b output. But if a code change adds a 10th read site to MCCP_CODEX_DISABLED, Validation 0b fails with no documented recovery. The plan says Task 0 is a '선행 조건' but doesn't say what to do if it fails or how to update the table. This creates an unsustainable invariant: a manual table in prose that must track runtime code drift forever. |
| architect | MEDIUM | The plan claims document is a 'projection' of the registry (line 12: '문서는 그 레지스트리의 투영이 되게 한다'), but descriptions in detail documents are prose, not derived; no owner or update contract is defined for when registry values change | Plan line 12 claims '레지스트리의 투영'. DD4 line 216-217 says lint 'lint는 값을 **생성**하지 않고 **대조**만 한다'. Task 7 line 317 shows template `변수 \| 종류 \| 값 \| Default \| 한 줄 설명 \| 상세`. Acceptance line 652 requires 'registry와 양방향 동일'. But `한 줄 설명` (one-sentence description) is prose written manually, not derived. When a toggle's `values` change (e.g., new enum option added to registry), who updates the example descriptions in `docs/environment/*.md`? The plan does not specify. This is a seam defect: the abstraction promises "single source of truth + projection" but leaves derived content as manual prose without governance. |
| architect | MEDIUM | Validation 0c (Files to Change completeness) is hand-maintained but dynamically scanned; if they diverge, Validation fails with no defined recovery; the plan creates a sequence defect where Validation output can expose unlisted Tasks | Validation 0c line 410-435 dynamically scans plugins/mccp/scripts/ for boolean toggles with raw comparisons. Files to Change lines 108-137 is a hand-written list of 30 files. R4 feedback (line 733-735) discovered 4 files missing from the hand list. The fix was to add Validation 0c, not to automate the list. But now Validation 0c can discover new files any time code is added. If Validation 0c finds `new-file.js` using `process.env.MCCP_X === '1'`, but that file is not in Files to Change, Validation fails. Task 4 line 300-303 says 'Validation 0c의 스캔 출력에서 도출한다' but Validation 0c is Part of the Gate (line 437-435), not a Task output. This creates unsustainable coupling: Tasks must be listed in prose, but validation proves they're incomplete via dynamic scan. |
| architect | MEDIUM | Plan claims evidence field will block absolute-path leaks (§3.12 security), but L8 order (lexical check before fs check) is load-bearing and only proven by a single fixture; no structural enforcement exists for the order | Task 2 line 288-291 cites §3.12 `meta.cwd` absolute-path leak. Task 5 L8 line 306 describes order: 'repo-root 기준 실재를 확인한다. 순서가 load-bearing이다: 실재를 먼저 보면... 누출 경로가 다시 열린다'. Acceptance line 659 requires lexical check before fs check. Validation 0c L8 check is described in code outline (line 306) but cannot be verified in the plan. The plan says (line 735-736 R4): 'L8이 "어휘 검사 먼저"를 보지 않았다' and adds fixture proof. But **the plan itself doesn't show the lint.js L8 implementation**, so I cannot verify the order is actually implemented. This is a seam defect: a load-bearing implementation detail asserted in prose but unprovable without seeing code. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | Verified citation of 22 undocumented toggles against Validation 1 success criterion; examined evidence field schema against audit table showing multi-site toggles; traced Task 0 output as manual prose table with no recovery mechanism; analyzed 'projection' claim against manual prose descriptions; checked Validation 0c scanning vs. hand-written Files to Change divergence; examined load-bearing L8 order claim against provability. |
| security | pass | Examined trust boundaries (registry mutability, git integrity); data leakage (evidence path absolute-path screening order, home directory exposure via evidence fields); escalation paths (bypass-flag expansion via set equality check, gate-weakening direction via DD3 mechanical prevention); code coverage (L9 raw-comparison detection, Validation 0c automated file scanning); bypass paths (parseBool throw on unknown toggles, registry centralization). Verified bypass-flag acceptance sets currently uniform (Task 0 audit confirms all 3 items use === '1' only). Checked Validation 0c known limitations (module-constant wrapping) explicitly documented with compensation. All HIGH/CRITICAL findings from R0-R4 incorporated (evidence lexical-before-FS order, bypass-flag set immutability, DD3 mechanical prevention over observation). Found no path from input to consequence bypassing identified controls. |
| test | pass | Tested: (1) whether diagnostic claims (22 undocumented, 8 parsing conventions) are re-verified at gate time rather than assumed - YES by Validation 1/0b/0c scans. (2) Whether bypass-flag "exactly 3" is enforced by count-only check vs set equality - SET EQUALITY checked line 353. (3) Whether L8 order requirement has proof - fixture-based proof required by acceptance. (4) Whether 30+ file migration is validated beyond "list says so" - Validation 0c scans codebase, Validation 2 lint L9 checks finals state. (5) Whether test files can be vacuous - Validation 7c requires markers with specific counts, mitigated by marker algebra. (6) Whether tests of only 2 consumers leave gaps - full suite 7b + lint cover most, regression risk small. (7) Whether Validation 0b re-audit could be circular against stale Task 0 table - verified via R4 review cycle, hardcoded WANT forces agreement. No falsifiability gap found across 8 validation tiers. |
| invariant | pass | Checked fail-closed gate preservation: bypass-flag sete exactness (Validation 0 set-equality check), fail-open drift potential (DD3 mechanical blocking vs observation), and T-BYPASS test corpus coverage. Examined receipt anchoring: evidence path lexical screening order (absolute path rejection before fs check per line 308), Validation L8 file existence checks, and line-number drift risk (acknowledged residual, mitigated by Validation 0b count verification, not fail-open). Verified rollback safety: task ordering dependencies (all export modules required before validation 0), validation non-vacuity (Validation 7c marker-and-count checks prevent zero-assertion passes), and circular dependencies (Validation 0 correctly runs after Task 1-2, not before). Audited four reviewer rounds: R0-R2 addressed DD3 gate-weakening axis and test vacuity; R3-R4 fixed evidence-reading scope and bypass-flag set identity checks. Confirmed lint L9 reaches all 107 MCCP_* access points or explicit Files to Change with module-constant caveat documented. No evidence of gate erosion, unanchored approvals, or fail-open regression paths. |

## Measurement

<!-- Written by plan-review/cli.js record on EVERY exit path, pass or halt.
     Machine-readable; do not hand-edit. A null field means the axis was
     not observed, never that it was zero. -->

```json
{
  "verdict": "unknown",
  "source": "multi-agent",
  "layers": {
    "l1": "converged",
    "l2": "ran (quorum not evaluated)",
    "l3": "not fired"
  },
  "quorum": {
    "responded": 4,
    "required": null,
    "roles": 4,
    "of": null,
    "passed": null
  },
  "wall_clock_ms": 79246,
  "halt_stage": "5.2b",
  "granted": 0,
  "reviewed_plan_hash": "sha256:3188f08aa7efc1eb4914c7c8bfdbed2e60307ff37addb999cd223a6b0b9d1272",
  "plan_path": ".claude/plans/environment-doc-uniformity.plan.md",
  "recorded_at": "2026-08-19T03:35:23.125Z"
}
```

### Recording degradations

- decision.json absent or unreadable — verdict recorded as unknown
