# Implementation Report: Workflow Orchestration Live-Activation — M3

**Plan**: `.claude/plans/workflow-orchestration-live-activation-m3.plan.md`
**PRD**: `.claude/prds/workflow-orchestration-live-activation.prd.md` (Milestone 3 — 발견 gap 보완)
**Branch**: `v1.22.3-live-activation-m3` (branched from `origin/main`)
**Version**: `1.22.2` → `1.22.3` (single milestone = patch, §3.7)

## Summary

M2's firing-preview, run against the real environment, surfaced why the live observation rows were
still empty: a **present** sticky-critical cost-state (`$186.92` + `hard_ceiling_reached`) skipped
every fan-out and parallel dispatch. M1's fail-open only assumed green when cost-state was **absent**,
so ordinary operational spend still blocked everything — the PRD's root problem survived M1+M2.

M3 retires the **operational** USD firing block across every surface that could stall a run, and
replaces it with a layered backstop rather than removing the safety net:

1. **Operational USD retired** — `hard_ceiling_reached` skips only under `usdBomb`;
   `AUTODISABLE_TIERS_DEFAULT` drops `{critical}` → **empty**.
2. **Catastrophic-USD ceiling** (Codex F1) — `MCCP_ORCHESTRATION_CATASTROPHIC_USD` (default $500),
   deliberately separate from the $100 operational ceiling: $186 fires, a real runaway does not.
3. **Atomic `reserveWorkers`** (Codex F2) — single-lock check-and-bump replaces read-then-bump, and
   the clamp now applies to **every** run path (the cap is the primary structural backstop now).
4. **auto-chain aligned** (Codex F3) — the commit→pr USD abort follows the same principle; firing is
   upstream of auto-chain, so unblocking only the oracles would have moved the stall, not removed it.
5. **`MCCP_ORCHESTRATION_USD_BOMB`** (Codex F4) — back-compat kill switch restoring M1 exactly.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large — matched. The 4 Codex absorptions were the bulk of the work, not the retirement itself. |
| Confidence | — | High on the oracle/auto-chain change (unit-covered); **medium** on live behavior (see Deviations). |
| Files Changed | 18 | 18 — no implement-time expansion. |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `resolveFleet` — USD retire + catastrophic gate + clamp all-paths | Complete | |
| 2 | `resolveFanout` — isomorphic mirror | Complete | `run()` helper's now-unused `failOpen` param dropped rather than left dead. |
| 3 | `orchestration-runaway.js` — `parseUsdBomb` / `parseCatastrophicUsd` / atomic `reserveWorkers` | Complete | `clampForRunaway` preserved as the pure no-bump oracle for the preview. |
| 4 | Command body forward + atomic reserve delegation | Complete | `bumpCounter` call sites removed (reserve already counts). Also corrected stale pre-M1/M3 firing claims found in `work.md:129`. |
| 5 | auto-chain hard_ceiling → catastrophic-USD alignment | Complete | Telemetry-integrity triggers left untouched — deliberately. |
| 6 | firing-preview forward | Complete | Read-only invariant extended: `reserveWorkers` now statically forbidden in the preview. |
| 7 | Mechanical firing-open verification + observation doc | Complete — **method deviated** | See Deviations. |
| 8 | Version bump + footer sync + CHANGELOG | Complete | 4 sites synced; the i18n test caught a real sed miss (see Issues). |
| 9 | CLAUDE.md + PRD Open Question decisions | Complete | OQ1 / OQ2 / OQ6 recorded; stale toggle docs corrected. |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Unit — changed oracles | Pass | fleet 48/48, fanout 37/37, runaway 24/24, auto-chain 21/21, preview 16/16 |
| Regression — importers of changed modules | Pass | 243/243 across 9 suites (incl. `dispatch-cli`, `cost-state`, `work-orchestrator`) |
| Regression — renderer surface | **666/667 — 1 pre-existing failure** | `verdict-label.test.js` fails identically (6 pass / 1 fail) on pristine `origin/main`. Not caused by this change; **not fixed here** (out of scope). |
| Version/footer drift | Pass | `i18n-surface.test.js` 10/10; `plugin.json` = 1.22.3 |
| Consumer isolation | Pass | `briefing/cost-guard.js` has its **own local** `AUTODISABLE_TIERS_DEFAULT` — verified unaffected. |

**Not run**: the full `plugins/mccp/scripts` sweep timed out at 10min (one node process per file). Scope
was narrowed to suites that actually import the changed modules, plus the full renderer surface.

**Note on `node --test <dir>/`**: the directory form reports `tests=1 fail=1` — reproduced identically on
pristine `origin/main` (Node v24 runner behavior here), so the plan's directory-form validation commands
were executed per-file instead. All 10 files pass individually.

## Mechanical firing-open verification (Task 7)

Controlled A/B through the **real CLI**, one seeded sticky state, LLM spend 0:

| condition | fleet | fanout | effective_fire |
|---|---|---|---|
| `usd_bomb` off (M3 default) | `run=true reason=ok-run n=4` | `run=true reason=ok-run` | `parallel_fires=true` |
| `MCCP_ORCHESTRATION_USD_BOMB=1` (M1-equivalent) | `run=false reason=hard-ceiling` | `run=false reason=hard-ceiling` | `parallel_fires=false` |
| `MCCP_ORCHESTRATION_CATASTROPHIC_USD=100` | `run=false reason=catastrophic-usd` | — | replacement bomb still bites |

The preview wrote no state (read-only invariant holds — no `.claude/state/` created in the temp HOME).

## Deviations from Plan

**Task 7's premise was falsified — verification method changed (evidence, not architecture).**

The plan specifies verifying against "실 dogfood 환경(sticky $186 그대로)". By build time the ambient
cost-state had **already reset to green** (`cost_usd:0`, `tier:green`, `hard_ceiling:false`). A preview
against that state does show `fleet.run=true` — but it proves nothing, because green fires under M1 too.
Recording it as "firing-open verified in the dogfood environment" would have been false.

Substituted: a **seeded** sticky state in a temp `HOME`, run through the same CLI, as an A/B against the
M1-equivalent (`usd_bomb=1`). This isolates the M3 delta on identical input and is strictly stronger than
the ambient check the plan assumed. Both the substitution and the ambient reset are recorded in
`live-activation-observations.md`.

This does **not** weaken M3's rationale: `MCCP_COST_STATE_DECAY_HOURS` (v1.22.0) is a 6h *time-based*
mitigation — the sticky block recurs whenever spend crosses the ceiling inside an active session. M3
removes it structurally.

**Scope additions (stale-doc corrections, in-scope by consequence).** `work.md:129`, `plan.md:150/235`
and CLAUDE.md §4 asserted firing conditions M3 makes false (e.g. "cost-state green 요구", "critical-only
tier"). Left alone they would have documented behavior that no longer exists.

## Issues Encountered

1. **`sed` missed the regex literals in the i18n test.** `s/v1\.22\.2/…/` matched the plain test *names*
   but not the assertion regexes (`/v1\.22\.2/` — backslash-escaped). The footer test then failed, which
   is exactly the drift it exists to catch. Fixed via targeted edits; the test is now the proof.
2. **Directory-mode test runner** — see Validation note. Pre-existing, worked around, not papered over.
3. **`verdict-label.test.js`** — pre-existing failure, confirmed against pristine `origin/main`, left as-is.

## Tests Written

| Test File | Added | Coverage |
|---|---|---|
| `implement-dispatch/tests/budget.test.js` | +11 | default fire @ hard_ceiling/critical/$186; catastrophic skip + boundary + independence from usdBomb + un-injected ceiling; usdBomb restore ×2; explicit override precedence; metered clamp applied + far-from-cap no-op |
| `plan-fanout/tests/budget.test.js` | +11 | isomorphic mirror |
| `tests/orchestration-runaway.test.js` | +11 | `parseUsdBomb` (truthy/falsy/typo+loud warn); `parseCatastrophicUsd` (default/override/invalid); `reserveWorkers` grant+count, **sequential cap regression `[4,4,1,1,1]`**, re-entrant no-stale-read, never-0 floor, lock-exhaustion fail-safe, session reset |
| `tests/auto-chain.test.js` | +4 | $186 no-abort; catastrophic abort; ceiling override; usdBomb restore |
| `tests/orchestration-preview.test.js` | +4 | sticky-$186 run; catastrophic skip; usdBomb restore; env_summary defaults; **`reserveWorkers` statically forbidden** |

Four M1-contract assertions were deliberately **inverted** (hard_ceiling → fires, critical → fires, clamp
metered-path, tierFor-recompute), with the M1 behavior preserved under `usdBomb` so back-compat stays
tested rather than deleted.

## Gate / Invariant Status

- **Implement-Codex**: cross-gate dedupe applied — the plan pre-committed the full decision set (file
  layout, helper boundaries, concurrency model, error shape) and Codex R1's 4 findings were absorbed into
  it. The receipt records **no** `codex_verdict`, so PR-Codex fail-closes and reviews the real diff.
- **Design gate**: `SKILL_AVAIL=1 / SIGNAL=0` at gate time → silent-skip. The final diff does trip the
  detector (renderer files present), but the change is the footer string `v1.22.2`→`v1.22.3` only — the
  plan's pre-adjudicated false-positive, confirmed by the diff. All 4 Output Constraints N/A.
- **Phase 3.6 / 3.7**: skipped / no-op (trigger did not fire; no capture artifact).
- **dual-review · receipt chain**: unaffected — firing oracles and auto-chain are gate-value changes only.

## Next Steps

- [ ] `/mccp:pr` — PR-Codex will fire (dedupe fail-closed) against the real diff
- [ ] **Operator, separate session**: M2 rows (A) default + (B) opt-out live `/mccp:work` 완주 — now
      unblocked while spend stays under the catastrophic ceiling (§4.1 of the observations doc)
- [ ] PRD closes (→ minor bump) once M2's rows land
