# Plan: v1.3.0 Milestone 0 — Schema Baseline Alignment

**Source PRD**: [.claude/prds/v1-3-0-observability-surface-ii.prd.md](../prds/v1-3-0-observability-surface-ii.prd.md)
**Selected Milestone**: 0 — Schema baseline alignment (gating for all M1~M6)
**Complexity**: Medium (docs-heavy, low code surface)

## Summary

Freeze the read-side schema surface that v1.3.0 dashboard derive engine will rely on. **Codex R1 absorption applied**: (a) PRD body amended in place to fix nonexistent-field references — reconciliation doc is supplement, not the only correction; (b) envelope `validate()` upgraded to strict (one validator contract, not two); (c) Task 3 test reframed as backward-compat *read tolerance*, NOT arbitrary writer contract — M2 must add explicit `schema.js` field for any new receipt meta; (d) noop migration marker dropped — `schema-surface.md` is the baseline record, no migration-infra noise. Net: less surface but stronger invariants.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `.claude/plans/v1-2-0-orchestrator-controller-m1.plan.md` | M-suffixed plan slug + PRD milestone-row Plan cell link |
| Errors | `plugins/mccp/scripts/lib/dispatch-envelope.js:83-147` | `validate()` returns `{ ok, errors[] }` — pure, no throw, no fs |
| Tests | `plugins/mccp/scripts/receipt/tests/schema.test.js` | Node native test runner + skeleton-based fixtures + targeted invariant cases |
| Migration | `plugins/mccp/scripts/migrations/v1.2.0-dispatch-fields.js` | Additive noop marker → `.claude/receipts/.migrations/<version>.json` with `noop: true + reason: ...` |
| Docs | `docs/v1.2.0-orchestrator/envelope-schema.md` | Field table + lifecycle diagram + "What is NOT in this milestone" footer |
| Receipt write | `plugins/mccp/scripts/receipt/write.js:55,177-188` | Env-driven optional field stamping (`MCCP_DISPATCH_CONTEXT=1`) — env names already MCCP_ namespaced (v1.0.1 axis P confirmed) |

## Files to Change

| File | Action | Why |
|---|---|---|
| `docs/v1.3.0-observability/schema-surface.md` | CREATE | Canonical inventory of *what v1.3 derive can safely read* across 4 schemas (receipt, envelope, STATE.md, frontmatter cross-doc). Includes "PRD assumption ↔ code reality" reconciliation table. |
| `docs/v1.3.0-observability/state-md-naming-reconciliation.md` | CREATE | Explicit map: PRD `handoff_dispatching`/`handoff_dispatched` → actual `dispatch_id`/`dispatch_id_completed`/`dispatch_attempt_count` (resume layer) + `controller_session_id`/`active_dispatch_count` (controller layer). Includes tri-state interpretation table (unset / in-flight / completed). |
| `plugins/mccp/scripts/lib/dispatch-envelope.js` | UPDATE | **Codex R1 F3 absorption** — make hand `validate()` strict: reject unknown top-level keys (matching exported `JSON_SCHEMA.additionalProperties: false`). Removes the two-validator gap where derive code calling `validate()` would silently accept envelope drift while JSON_SCHEMA consumers would reject. |
| `plugins/mccp/scripts/receipt/tests/v1-3-0-baseline.test.js` | CREATE | Regression test pinning current backward-compat behavior: (a) v0.2.x-era receipts (no v1.2.0-m1 attribution fields) still validate, (b) all v1.2.0-m1 4 attribution fields validate when present, (c) v1.0.1 `pr_phase_lock_stale_reclaimed_at_hook` validates, (d) 3-way codex skip mutex holds. **Does NOT** test arbitrary unknown-key acceptance — that is a compatibility gap, not a contract (Codex R1 F2 absorption). |
| `plugins/mccp/scripts/lib/tests/dispatch-envelope-forward-compat.test.js` | CREATE | Regression test pinning envelope's strict contract post-F3 fix: `validate()` rejects unknown top-level keys (was permissive pre-F3), schema_version=`v1` is invariant, JSON_SCHEMA + hand-validate agree on additionalProperties. Any future field requires v2 file. |
| `.gitignore` | UPDATE | Append `.claude/cache/` + `.claude/cache/snapshots/` so M1~M5 derive artifacts don't pollute `git status`. Pattern: mirror existing `.claude/state/*.lock` line. |
| `CLAUDE.md` | UPDATE | §1.4 table — add row for v1.3.0 schema baseline. §3 — link to `docs/v1.3.0-observability/schema-surface.md` as the canonical read-side schema reference (so future sessions know not to re-derive surface via grep). |
| `.claude/prds/v1-3-0-observability-surface-ii.prd.md` | UPDATE | **Codex R1 F1 absorption** — (1) Delivery Milestones table: flip Milestone 0 row Status `pending → in-progress` + Plan cell link (already applied during Phase 4); (2) **amend PRD body in place**: replace stale `handoff_dispatching` / `handoff_dispatched` identifiers in Open Questions (line ~115) and Risks (line ~129) with the actual `dispatch_id` / `dispatch_id_completed` (resume layer, v1.1.0) and reference VALID_EVENTS markers (`resume_dispatching` / `resume_dispatched`); (3) append "## Errata" section at end pointing to `docs/v1.3.0-observability/state-md-naming-reconciliation.md` as the authoritative mapping. Reconciliation doc is supplement; PRD body is corrected so future plan-generating sessions can't pick up the wrong source. |

## Tasks

### Task 1: schema-surface.md — canonical read-side inventory

- **Action**: Create `docs/v1.3.0-observability/schema-surface.md` with 6 sections:
  1. **Scope** — this doc names the surface v1.3 derive engine reads; it does NOT introduce new fields. Schema bumps live in their own version-suffixed docs.
  2. **Receipt schema (v1)** — table of every `meta.*` field schema.js explicitly validates, grouped by introducing version (v0.2.4 security, v0.2.6 impeccable, v0.2.8 codex_dedupe_at_pr, v0.3.5 codex_disabled, v0.3.6 design-scope audit, v0.4.0 plan_conflict_escalated, v1.0.1 pr_phase_lock_stale_reclaimed_at_hook, v1.2.0-m1 controller_context_marker_present + 3 attribution fields). Each row: field, type, "introduced in", validator strictness (strict / present-only / optional), 1-line semantic.
  3. **Envelope schema (v1)** — field table from `docs/v1.2.0-orchestrator/envelope-schema.md` linked verbatim + explicit `additionalProperties: false` boundary statement. v1.3 derive MUST NOT write to envelopes.
  4. **STATE.md frontmatter (state_version=1)** — every field `state-writer.js`'s `emptyState()` returns + conditional-emit policy (which fields render only when set: `dispatch_id`, `controller_session_id`, `escalate_pending`, `dep_check_at`, `chain_progress`, `last_pr_url`). Includes `VALID_EVENTS` allowlist (the 10 events, including 3 dispatch_* + 2 resume_* + handoff_spawn).
  5. **PRD assumption ↔ code reality table** — reconciliation table of every term the PRD body uses vs the actual identifier in code. Minimum entries: (a) "unknown-field-permissive validator" → actual: "explicit allowlist + silently-ignored unknowns"; (b) `handoff_dispatching/handoff_dispatched` → actual: `dispatch_id/dispatch_id_completed/dispatch_attempt_count` (resume) + `controller_session_id/active_dispatch_count` (controller); (c) "envelope schema v1" assumed permissive → actual: strict additionalProperties:false; (d) `meta.briefing_summary` (PRD adds in M2) → not yet in schema.js, validates today via "silently ignored" path, formally accepted in M2.
  6. **Forward-compat policy** — explicit statement: receipt schema extensions land via additive field + schema.js update (no version bump if backward-compatible); envelope schema extensions land via new `envelope-schema-v2.md` file + migration (mirrors envelope-schema.md §"What is NOT in this milestone" pattern).
- **Mirror**: Field table layout from `docs/v1.2.0-orchestrator/envelope-schema.md` (column order: Field / Type / Required / Notes).
- **Validate**: `test -f docs/v1.3.0-observability/schema-surface.md && grep -q "PRD assumption ↔ code reality" docs/v1.3.0-observability/schema-surface.md`

### Task 2: state-md-naming-reconciliation.md — fix the PRD ↔ code drift

- **Action**: Create `docs/v1.3.0-observability/state-md-naming-reconciliation.md`. Single-purpose doc — *no other content*. Three sections:
  1. **The mismatch** — quote PRD's "STATE.md `handoff_dispatching` ↔ `handoff_dispatched` 2-phase atomic marker" line verbatim. State that the actual schema has no such fields.
  2. **Mapping table** — 4 columns: PRD term / actual STATE.md frontmatter field / introducing version / layer (resume vs controller). Cover the full picture: `dispatch_id` (resume, v1.1.0), `dispatch_id_completed` (resume, v1.1.0), `dispatch_attempt_count` (resume, v1.1.0, capped at 3), `controller_session_id` (controller, v1.2.0-m1), `active_dispatch_count` (controller, v1.2.0-m1).
  3. **Tri-state interpretation policy** — explicit table of (controller_session_id, active_dispatch_count, dispatch_id, dispatch_id_completed) tuple → derive interpretation. Five rows: all unset (no controller, no resume in flight), controller_session_id+active_dispatch_count>0 (controller has in-flight dispatches), dispatch_id set + dispatch_id_completed null (resume phase 1 marker, phase 2 pending), dispatch_id_completed set (resume cycle finished cleanly), dispatch_attempt_count >= 3 (resume giveup — manual recovery).
- **Mirror**: Pure-text "explainer doc" style of `docs/v1.2.0-orchestrator/operator-runbook.md` (no code blocks except identifier tables; reader-first prose).
- **Validate**: `grep -q "dispatch_attempt_count" docs/v1.3.0-observability/state-md-naming-reconciliation.md && grep -q "handoff_dispatching" docs/v1.3.0-observability/state-md-naming-reconciliation.md`

### Task 3: v1-3-0-baseline.test.js — pin current receipt-schema invariants (Codex R1 F2 absorbed)

- **Action**: Create `plugins/mccp/scripts/receipt/tests/v1-3-0-baseline.test.js`. Use Node native test runner. Use `makeSkeleton()` + `validate()` from `schema.js`. Tests:
  1. **"v0.2.x-era receipts (no v1.2.0-m1 attribution fields) validate"** — backward-compat read tolerance. Build a skeleton, delete `meta.controller_context_marker_present` + the 3 attribution fields (mimic an old receipt that pre-dates v1.2.0-m1) → assert `ok: true`. This is what derive must keep tolerating to read historical receipts.
  2. **"v1.2.0-m1 controller attribution all-or-nothing invariant holds"** — skeleton with marker=true + 2-of-3 attribution fields → error mentions "marker_present=true requires all 3". Skeleton with marker=false + 1 attribution → error mentions "all-or-nothing invariant". Pass case: marker=true + all 3 valid UUIDs + valid envelope path.
  3. **"v0.3.5 3-way codex skip mutex holds"** — skeleton with `codex_disabled_at_pr=true + codex_skipped_at_pr=true` → mutually-exclusive error.
  4. **"v1.0.1 pr_phase_lock_stale_reclaimed_at_hook is optional boolean"** — skeleton + field absent → ok. Skeleton + field=true → ok. Skeleton + field="string" → error.
- **Codex R1 F2 absorption note**: Test 1 does NOT assert that arbitrary writer-injected unknown fields (e.g. `meta.briefing_summary`, `meta.totally_made_up_field`) pass validation as an intentional contract. That would freeze a compatibility gap as a writer contract. **M2 must add explicit `meta.briefing_summary` (+ `meta.briefing_token_count`, `meta.briefing_invocation_count`) field declarations to `schema.js` BEFORE any write path stamps them** — per the plan's own "Forward-compat policy" (schema-surface.md §6). Today's hand-`validate()` silently ignores unknown `meta` keys because the validator iterates the known list rather than scanning all keys; this is a *backward-compat* property (old receipts pass after schema bumps add new fields), not a *forward-compat writer contract*.
- **Mirror**: `plugins/mccp/scripts/receipt/tests/schema.test.js` test structure + Node `node:test` describe/it pattern.
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/v1-3-0-baseline.test.js`

### Task 4: dispatch-envelope strict-validate + forward-compat test (Codex R1 F3 absorbed)

- **Action**: Two coupled changes in one task:
  - **4a. Code change** — `plugins/mccp/scripts/lib/dispatch-envelope.js` `validate()`: after the existing required/format checks, add an **unknown-key rejection** loop:
    ```js
    const KNOWN_KEYS = new Set([
      'schema_version', 'dispatch_id', 'worker_subagent_type',
      'worker_started_at', 'worker_ended_at', 'worker_exit_status',
      'receipts_added', 'findings', 'next_action',
      'controller_session_id', 'parent_cwd',
    ]);
    for (const k of Object.keys(envelope)) {
      if (!KNOWN_KEYS.has(k)) {
        err('unknown top-level key "' + k + '" (envelope schema is strict; ' +
          'extensions require a new envelope-schema-v2.md + schema_version bump)');
      }
    }
    ```
    Place after the parent_cwd check, before the final return. This collapses the two-validator gap: hand `validate()` and exported `JSON_SCHEMA.additionalProperties: false` now agree.
  - **4b. Test** — `plugins/mccp/scripts/lib/tests/dispatch-envelope-forward-compat.test.js`:
    1. **"unknown top-level keys are rejected"** — `validate({...valid, my_unknown: 1})` → `ok: false` + error mentions `"unknown top-level key"`. Mirrors what `JSON_SCHEMA.additionalProperties:false` would say. Also asserts `validate({...valid, fake_status: 'x'}).ok === false`.
    2. **"schema_version invariant"** — `validate({...valid, schema_version: 'v2'}).ok === false` with explicit error about constant.
    3. **"JSON_SCHEMA + hand-validate agree on additionalProperties"** — assert `JSON_SCHEMA.additionalProperties === false`. Comment block: any future contributor adding fields must update BOTH `KNOWN_KEYS` and `JSON_SCHEMA.properties` AND bump to v2 envelope-schema doc.
  - **4c. Regression check** — run existing `dispatch-envelope.test.js` (and any caller test like `validate-cmd-envelope.test.js`) — ensure no fixture passes unknown keys today. If a test breaks, that's the gap surfacing.
- **Codex R1 F3 absorption note**: Prior plan version asserted today's permissive hand-`validate()` behavior as the test contract. That left v1.3 derive engine reading from a different validator than write paths, and any envelope drift from M2/M3 workers would silently pass `validate()` while failing JSON-Schema consumers. Single validator contract now.
- **Mirror**: `plugins/mccp/scripts/lib/dispatch-envelope.js` existing `req()/err()` helper pattern; add the loop adjacent to existing checks.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/dispatch-envelope-forward-compat.test.js && node --test plugins/mccp/scripts/lib/tests/dispatch-envelope.test.js`

### Task 5 — DROPPED (Codex R1 F4 absorbed)

Migration marker under `.claude/receipts/.migrations/v1.3.0-schema-baseline.json` is removed from scope. Rationale: the marker would have written a noop entry to receipt-migration infrastructure for a milestone that adds zero receipt fields. Future operators glancing at `.migrations/*.json` would have to distinguish "this changed receipts" from "this just recorded baseline freeze". Schema baseline is now recorded by:
- `docs/v1.3.0-observability/schema-surface.md` (canonical inventory, git history = baseline timestamp)
- `docs/v1.3.0-observability/state-md-naming-reconciliation.md` (PRD↔code drift correction)
- `CLAUDE.md` §1.4 row (v1.3.0 schema baseline reference)

No migration-runbook noise. Task numbering preserved (Tasks 6-9 keep their numbers) so reviewers can cross-reference Codex absorption against the original plan.

### Task 6: .gitignore — pre-declare cache directory convention

- **Action**: Append to `.gitignore`:
  ```
  # v1.3.0 Observability Surface II — derive cache (M1+, never committed)
  .claude/cache/
  ```
- **Mirror**: Existing `.claude/state/*.lock` line — same comment-style header.
- **Validate**: `grep -q "^.claude/cache/$" .gitignore`

### Task 7: CLAUDE.md — add v1.3.0 schema baseline reference

- **Action**: Update `CLAUDE.md` in two minimal places:
  1. §1.4 table — append row: `| **v1.3.0 schema baseline** | docs/v1.3.0-observability/schema-surface.md 본문화 — receipt + envelope + STATE.md frontmatter의 read-side schema surface freeze. derive engine 가정 표준. | v1.3.0-m0 ship |`
  2. §5 (모르거나 막힐 때) — append item: `5. docs/v1.3.0-observability/schema-surface.md — derive 가정에 의문 생기면 여기부터.`
- **Mirror**: Existing v1.2.0-m1 row in §1.4 table.
- **Validate**: `grep -q "v1.3.0 schema baseline" CLAUDE.md && grep -q "docs/v1.3.0-observability/schema-surface.md" CLAUDE.md`

### Task 8: PRD update — body amend + Milestone row flip (Codex R1 F1 absorbed)

- **Action**: Edit `.claude/prds/v1-3-0-observability-surface-ii.prd.md` in three parts:
  1. **Delivery Milestones table row 0** — already applied during Phase 4: Status `pending → in-progress` + Plan cell link.
  2. **Body amendments in place** — two locations carry the stale identifiers:
     - **Open Questions section** (around line 115): replace
       > `STATE.md` `handoff_dispatching` ↔ `handoff_dispatched` 2-phase atomic marker의 tri-state(미설정/dispatching/dispatched) 해석 표시 톤
       
       with
       > STATE.md 2-phase resume dispatch tracking (frontmatter `dispatch_id` / `dispatch_id_completed` / `dispatch_attempt_count` + VALID_EVENTS markers `resume_dispatching` / `resume_dispatched`) 의 tri-state(미설정/in-flight/completed) 해석 표시 톤. controller layer (`controller_session_id` / `active_dispatch_count`, v1.2.0-m1)도 같은 surface에 합쳐 표시. 자세한 매핑: docs/v1.3.0-observability/state-md-naming-reconciliation.md.
     - **Risks section** (around line 129): replace
       > **STATE.md handoff signal 오해석** — 2-phase atomic dispatch(`handoff_dispatching` → `handoff_dispatched`) 중간 crash 상태를 'dispatched'로 잘못 표시
       
       with
       > **STATE.md dispatch signal 오해석** — resume 2-phase atomic tracking(`dispatch_id` set + `dispatch_id_completed` null = phase-2 pending; v1.1.0 layer) 또는 controller 2-phase tracking(`controller_session_id` + `active_dispatch_count>0` = in-flight; v1.2.0-m1 layer) 중간 crash 상태를 'completed'로 잘못 표시
       
       (Mitigation column text is preserved with `dispatch_id` / `dispatch_id_completed` / `dispatch_attempt_count` substituted for the stale names; cross-reference to reconciliation doc added.)
  3. **Errata section** — append at end of PRD (after the `*Status: DRAFT...*` line, before EOF):
     ```markdown
     ---

     ## Errata (v1.3.0-m0 schema baseline)

     - 2026-06-17: STATE.md handoff field references corrected. Original PRD body referenced `handoff_dispatching` / `handoff_dispatched` which do not exist in `state-writer.js`. Authoritative mapping: [docs/v1.3.0-observability/state-md-naming-reconciliation.md](../../docs/v1.3.0-observability/state-md-naming-reconciliation.md). Body has been amended in place; this errata records the change for audit.
     ```
- **Codex R1 F1 absorption note**: Original Task 8 only flipped the milestone row status, leaving the PRD body's stale `handoff_dispatching/handoff_dispatched` references intact for derive consumers. A reconciliation doc as the *only* correction left two sources of truth in disagreement. Body amend + errata + reconciliation-doc is the three-layer fix: corrected source, audit trail, structured mapping.
- **Mirror**: Existing PRD body markup. Use Edit tool with full-quote string for uniqueness.
- **Validate**: `grep -q "in-progress | \[v1-3-0-observability-m0" .claude/prds/v1-3-0-observability-surface-ii.prd.md && grep -q "Errata (v1.3.0-m0" .claude/prds/v1-3-0-observability-surface-ii.prd.md && ! grep -q "handoff_dispatching" .claude/prds/v1-3-0-observability-surface-ii.prd.md`

### Task 9: validation pass

- **Action**: Run the full receipt + state + envelope test suites + new tests + receipt status:
  ```bash
  node --test plugins/mccp/scripts/receipt/tests/v1-3-0-baseline.test.js
  node --test plugins/mccp/scripts/lib/tests/dispatch-envelope-forward-compat.test.js
  node --test plugins/mccp/scripts/lib/tests/dispatch-envelope.test.js
  node --test plugins/mccp/scripts/receipt/tests/schema.test.js
  node --test plugins/mccp/scripts/state/tests/state-writer.test.js
  node plugins/mccp/scripts/receipt/cli.js status
  ```
- **Validate**: Exit 0 on all. No new receipts produced. Receipt schema (`schema.js`) untouched. STATE-writer (`state-writer.js`) untouched. `dispatch-envelope.js` modified (Task 4a only — add strict unknown-key check) with regression test green.

## Validation

```bash
# Full test suite — must remain green (Task 4a code change covered)
node --test plugins/mccp/scripts/receipt/tests/
node --test plugins/mccp/scripts/state/tests/
node --test plugins/mccp/scripts/lib/tests/

# New regression tests
node --test plugins/mccp/scripts/receipt/tests/v1-3-0-baseline.test.js
node --test plugins/mccp/scripts/lib/tests/dispatch-envelope-forward-compat.test.js

# Receipt chain still resolves
node plugins/mccp/scripts/receipt/cli.js status

# Doc files exist + reconciliation table renders
test -f docs/v1.3.0-observability/schema-surface.md
test -f docs/v1.3.0-observability/state-md-naming-reconciliation.md
grep -q "PRD assumption ↔ code reality" docs/v1.3.0-observability/schema-surface.md
grep -q "dispatch_attempt_count" docs/v1.3.0-observability/state-md-naming-reconciliation.md

# PRD body amend verified
grep -q "Errata (v1.3.0-m0" .claude/prds/v1-3-0-observability-surface-ii.prd.md
! grep -q "handoff_dispatching" .claude/prds/v1-3-0-observability-surface-ii.prd.md
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Doc-heavy milestone gets perceived as "no code value" → reviewer pushes to merge with M1 | Medium | Plan now carries a real code change (Task 4a — envelope strict-validate) and PRD body amendment. Concrete cost of skipping: M1 derive would still grep schema surface live, envelope drift from M2/M3 workers would silently pass `validate()`, M2 briefing prompts would inherit wrong frontmatter field names. Prerequisite invariants, not docs. |
| Task 4a strict envelope check breaks an existing test/fixture that smuggled an unknown key | Medium | Task 4c explicitly runs `dispatch-envelope.test.js` + `validate-cmd-envelope.test.js`. If a fixture breaks, that *is* the gap surfacing — fix the fixture (don't relax the check). Validation block surfaces this in Task 9. |
| Naming-reconciliation doc disagrees with how M3 dashboard renders tri-state — PM gets wrong picture | Medium | Tri-state table in Task 2 is the source of truth M3 must mirror. PRD body amendment (Task 8) makes the reconciliation table the *only* correct identifier set in the project. M3 mismatch becomes a unit-test failure, not a doc-divergence audit. |
| ECC fork tree at `/ECC/` still exists; PRD's "v1.0.1 MCCP_ env namespace 영향" task could surface ECC_* references that derive engine accidentally reads | Low | Grep pass during grounding: 0 ECC_* hits in `plugins/mccp/scripts/`. schema-surface.md §5 explicitly notes `/ECC/` is **out of derive scope** — frozen reference fork, never read by v1.3 derive. |
| Cache directory `.gitignore` rule conflicts with existing pattern; pattern bleeds into wanted files | Low | Single-line `.claude/cache/` (trailing slash forces directory-only match). Validated by Task 6's grep. |
| PRD body amendment causes merge conflict with concurrent work | Very Low | PRD just shipped (2026-06-17); no other in-flight edits expected. Errata section appended at end, body edits use full-quote strings for uniqueness. |
| M2 (briefing stamp) ships before adding explicit `meta.briefing_summary` schema.js field, hitting the gap Task 3 absorption note flagged | Medium | schema-surface.md §6 carries this as an explicit ship-blocking precondition for M2. Plan for M2 must include a schema.js update task as Task 1. v1.3.0-m0 acceptance gate verifies the surface doc says so. |

## Acceptance

- [ ] `docs/v1.3.0-observability/schema-surface.md` exists with 6 named sections + PRD-reconciliation table + M2 prerequisite note
- [ ] `docs/v1.3.0-observability/state-md-naming-reconciliation.md` exists with mapping table + tri-state table
- [ ] `plugins/mccp/scripts/lib/dispatch-envelope.js` `validate()` rejects unknown top-level keys (Task 4a code change)
- [ ] `plugins/mccp/scripts/receipt/tests/v1-3-0-baseline.test.js` green (4 tests, none asserting arbitrary writer-injected unknown-key acceptance)
- [ ] `plugins/mccp/scripts/lib/tests/dispatch-envelope-forward-compat.test.js` green (3 tests, including unknown-key rejection)
- [ ] Existing receipt + state-writer + dispatch-envelope test suites remain green (no regressions; if a fixture breaks, fix the fixture not the check)
- [ ] `.gitignore` carries `.claude/cache/` entry
- [ ] `CLAUDE.md` §1.4 table has v1.3.0 schema baseline row; §5 references schema-surface.md
- [ ] PRD Milestone 0 row Status = `in-progress` and Plan cell links to this plan
- [ ] PRD body free of `handoff_dispatching` / `handoff_dispatched` references; Errata section appended
- [ ] No migration marker created under `.claude/receipts/.migrations/` (Task 5 dropped)
- [ ] No mutations to `schema.js`, `state-writer.js`, or any existing receipt JSON

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.2.0/scripts/lib/codex-invoke.js adversarial-review --impeccable-available` (fail-closed Bash wrapper, v0.2.2; design-scope preamble active since impeccable Skill is available — v0.3.6 축 1)
- 라운드 수: 1 (R2 escalation 조건 미충족 — 모든 ACCEPT_NOW HIGH 발견은 R1에서 plan amendment로 흡수됨)
- 합치 결론: needs-attention 4 finding 모두 plan-level 흡수 완료. 흡수 후 plan은 (a) 두 validator 간극을 단일 strict 계약으로 통합, (b) PRD body 자체를 corrected source로 amend, (c) 잘못된 writer 계약 freezing 제거, (d) migration-infra noise 제거.
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1: Frozen PRD still names nonexistent STATE fields | HIGH (0.91) | **ACCEPT_NOW** | Reconciliation doc as the only correction leaves derive consumers free to read the wrong source. Plan Task 8 expanded to amend PRD body in place (Open Questions + Risks) + append Errata section pointing to reconciliation doc. Three-layer fix: corrected source, audit trail, structured mapping. |
  | F2: Plan turns unvalidated receipt meta into a writer contract | HIGH (0.93) | **ACCEPT_NOW** | Task 3 test 1 originally asserted arbitrary `meta.totally_made_up_field` should pass as the "M2 will rely on this" contract. Self-contradiction with plan's own "extensions land via additive field + schema.js update" policy. Test 1 reframed as backward-compat read tolerance (v0.2.x-era receipts validate after schema bumps) — NOT writer contract for arbitrary keys. M2 prerequisite added to schema-surface.md §6: explicit `meta.briefing_summary` schema.js field MUST land before any write path stamps it. |
  | F3: Envelope strictness is documented but not enforced | HIGH (0.89) | **ACCEPT_NOW** | Two validators (hand `validate()` permissive + `JSON_SCHEMA.additionalProperties:false` strict) on same v1 wire format = silent envelope drift in any code path using `validate()`. Task 4 split into 4a (code change: add `KNOWN_KEYS` rejection loop to `dispatch-envelope.js`) + 4b (test asserts unknown keys are rejected, not accepted) + 4c (regression check on existing fixtures). Single validator contract restored. |
  | F4: Noop migration marker has no enforceable invariant | MEDIUM (0.76) | **ACCEPT_NOW** | Task 5 (migration marker creation) dropped entirely. v1.2.0-dispatch-fields.js precedent was justified there by additive-attribution-fields surface; v1.3.0-m0 adds zero receipt fields, so a marker would create runbook noise without enforceable invariant. Baseline freeze is now recorded by schema-surface.md + CLAUDE.md §1.4 row + git history. |

- Deferred to backlog: 0 → no append to `.claude/plans/codex-findings-backlog.md`
- Open Questions: none — all 4 findings resolved in-plan via R1 absorption
- Codex session 참조: threadId `019ed32a-c23b-7822-8f93-2101953b55e8` (Codex stdout above, durationMs 228966)

