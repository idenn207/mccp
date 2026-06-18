# Integration template — Anthropic native automation features

> Status: **M1-experimental** — single-axis sample (axis A only). Cross-axis receipt schema invariants are intentionally NOT defined until M2 (`ultracode`) and M3 (`/goal`) ship and their custody surfaces are independently reviewed. M2/M3 may pick *different* custody anchor options (see §3 matrix). Do not lock the M1 anchor as a global rule.

## 1. Pattern name

**Cooperative native-feature guide pattern**

For each Anthropic native automation primitive (e.g. `/deep-research`, `ultracode` keyword, `/goal` loop) that mccp wants to leverage without re-implementing, this pattern wires three layers — **detection probe**, **cooperative guide turn**, **injection of the result back into the mccp artifact** — so the result is captured in the receipt chain without mccp invoking the native feature itself.

## 2. When to use

Apply this pattern when Anthropic ships a Claude Code native feature that mccp wants to weave into a `/mccp:*` chain (PRD → plan → implement → PR) while preserving:

- **mccp's invariant**: do not re-implement what Anthropic already ships (see `CLAUDE.md` §1.4 Principles).
- **Receipt chain custody**: the native result must produce mechanical audit trail in the mccp receipt chain or — at a minimum — be anchored by a hash that downstream gates can detect mutations against.
- **Phantom-prompt prevention**: never emit guide prompts based on optimistic defaults. Tristate availability + AND-gated signal is the floor.

Each axis must independently evaluate its custody surface; M1's anchor choice does **not** generalize.

## 3. Three-layer breakdown (axis A실증 reference)

| # | Layer | Module (axis A) | Purpose |
|---|---|---|---|
| 1 | Detection probe | `plugins/mccp/scripts/lib/deep-research-detect.js` | mode-aware probe — tristate availability + AND-gated research-signal + path-traversal guard. Env override 1순위. Default availability=`unknown` so absence does not trigger phantom guidance. |
| 2 | Cooperative guide turn | `plugins/mccp/commands/plan-prd.md` Phase 2.5 | Emit guide prompt **only when** detection returns availability=available AND signal=true. WAIT for user reply on a dedicated response grammar (`paste:` / `skip-research:` / `failed-research:`) that is explicitly separated from Phase 0 `skip` / `you decide` tokens. |
| 3 | Injection back into artifact | `plan-prd.md` Phase 4.0b + `plan.md` Phase 4 provenance hash | Inject result into a dedicated section in the mccp artifact body. For axis A: `## References` in the PRD body, then `## External Research Provenance` (sha256 of References content + ISO timestamp + source path) appended to plan body. The plan body is already hash-anchored by `plan-codex` receipt's `plan_hash`, so PRD body mutation downstream is mechanically detectable on next `/mccp:plan` validate. |

### Probe shape (per-axis stability)

The probe is the most reusable surface. All axes should mirror the shape:

```json
{
  "availability": "available" | "missing" | "unknown",
  "<feature>_signal": bool,
  "signal_files": [string],
  "mode": "<phase>" | null,
  "reason": "ok" | "no-signal" | "<feature>-missing" | "unknown-default" | "path-traversal" | "mode-mismatch"
}
```

The `availability` axis is *separate* from the signal axis so the guide gate is a 2-axis matrix (see §4). The signal must be **AND-gated**: presence of a trigger keyword alone is insufficient — there must be evidence that the keyword is actionable in the current artifact state (e.g. evidence-gap for `/deep-research`, missing test directive for `/goal`, etc.).

## 4. 2-axis prompt matrix

| `availability` | `<feature>_signal` | Action |
|---|---|---|
| `available` | `true` | Emit guide prompt, WAIT for user response on axis-specific grammar |
| `available` | `false` | Silent skip — no actionable trigger in artifact |
| `missing` | * | Silent skip — feature confirmed unavailable |
| `unknown` | * | Silent skip — default state; **phantom 안내 금지** |

`unknown` exists because Anthropic native features are shipped as built-in slash commands and have no plugin manifest entry — `available` cannot be *proven* by filesystem probe alone, so the default is `unknown` (cannot promise the user a feature that may not be there).

## 5. Custody anchor option matrix (axis-specific)

The chain-of-custody question — *how does this integration produce mechanical audit trail in the receipt chain?* — is **deliberately not unified across axes**. Each axis evaluates these options on its own merits:

| Option | Pros | Cons | Axis A (M1) | Future axes |
|---|---|---|---|---|
| (a) Body inject only — write result into artifact body without hash anchor | Receipt schema untouched. Lowest blast radius. | Artifact body is mutable — post-injection edits are silently lost from audit trail. | ✗ rejected as standalone | TBD |
| (b) Body inject + plan-body provenance hash | Receipt schema untouched + `plan_hash` (already mandatory for plan-codex receipt) provides mechanical anchor. PRD-side mutation detected on next `/mccp:plan` validate. | Detection lags by one `/mccp:plan` invocation. Not real-time. | ✓ **adopted for M1** | TBD |
| (c) New receipt field — e.g. `meta.external_research_*` | Strict mechanical custody, real-time. | Requires schema bump + migration script + potentially cross-axis invariant lock-in. | ✗ deferred — re-evaluate at M2/M3 cycle close | TBD |
| (d) Envelope extension (dispatch IPC) — emit via dispatch envelope IPC | Compatible with dispatch-controller (`v1.2.0-m1`) IPC surface. Cross-session anchor possible. | Only meaningful for axes that fan out work to dispatch workers. Heavyweight for single-session axes. | ✗ N/A — axis A is single-session | Possibly axis B (`ultracode`) if it dispatches to worker |

**Axis A's choice (option b)** is documented above. Future axes must run the same matrix; do not assume option (b) is the default.

## 6. Anti-patterns

| Anti-pattern | Why it's wrong |
|---|---|
| mccp re-implements the native feature inside a `/mccp:*` command | Violates the CLAUDE.md §1.4 Principle "mccp does not re-build what Anthropic ships". Forks the maintenance surface. |
| mccp auto-invokes the native command via shell (`bash`/`spawn`) | Native slash commands are not mechanically invocable from inside another slash command's body — even if it worked, it would bypass dual-review and break the receipt chain. |
| First axis's custody anchor is generalized to a cross-axis invariant | M1 is a single sample. axis B / axis C may need *different* anchors. Locking option (b) as the rule will block axes that genuinely need option (c) or (d). |
| Optimistic-default availability (e.g. `available` is the default) | Triggers phantom guide prompts when the feature is not actually installed. Tristate + `unknown` default is the floor. |
| Keyword-only signal heuristic (no AND-gate against evidence/state) | Produces a high false-positive rate on artifacts that mention a topic but do not need external work. The AND-gate (e.g. evidence-gap AND keyword) is the floor. |
| Reusing Phase 0 `skip` / `you decide` tokens for the guide turn | Overloads Phase 0 grammar; user can't tell which phase their `skip` applies to. Each cooperative guide turn must define its own dedicated grammar. |

## 7. M1 reference (axis A — `/deep-research` → `/mccp:plan-prd`)

- **Plan**: `.claude/plans/v1-4-0-m1-deep-research.plan.md`
- **Detection probe**: `plugins/mccp/scripts/lib/deep-research-detect.js`
- **Probe tests**: `plugins/mccp/scripts/lib/tests/deep-research-detect.test.js`
- **Cooperative guide turn**: `plugins/mccp/commands/plan-prd.md` Phase 2.5
- **Injection step**: `plugins/mccp/commands/plan-prd.md` Phase 4.0b (`## References`) + `plugins/mccp/commands/plan.md` Phase 4 provenance hash (`## External Research Provenance`)
- **Custody anchor option chosen**: (b) body inject + plan-body provenance hash
- **Grammar (Phase 2.5)**: `paste:<content>` / `skip-research:<reason>` / `failed-research:<reason>`

## 8. M2 / M3 placeholder

- **M2 (axis B — `ultracode` → `/mccp:prp-implement`)**: pending. When ship, add §9 reference with its own custody anchor evaluation (matrix §5). Do **not** assume option (b) carries over.
- **M3 (axis C — `/goal` → `/mccp:milestone-close`)**: pending. Similarly, re-run §5 matrix; `/goal` may emit completion-condition events that warrant envelope extension (option d) or a new receipt field (option c) — that decision belongs in the M3 plan, not here.

**PRD Open Question §3** (`integration template doc은 M4 별도 milestone으로 할 것인가, 아니면 M1/M2/M3 각 milestone의 부산물로 점진 누적할 것인가?`) is intentionally **not decided in this document**. The decision belongs at cycle close, after M2/M3 have shipped and the custody anchor options for each axis are known. Re-evaluate then.

## 9. Audit checklist when adding a new axis

Before merging an axis that follows this template:

- [ ] Probe shape matches §3 (tristate availability + AND-gated signal + reason enum). Default availability is `unknown` if filesystem probe cannot conclusively prove `available`.
- [ ] Guide prompt fires only on `available` + `signal=true` (§4 matrix).
- [ ] Dedicated response grammar exists and is documented inline in the prompt text. Phase 0 tokens (`skip` / `you decide`) are not re-used.
- [ ] Custody anchor option (§5) is explicitly chosen, with rationale logged in the axis's plan body.
- [ ] CLAUDE.md §1.4 Principle "mccp does not re-build what Anthropic ships" is preserved — no shell-spawn of the native command, no in-prompt re-implementation.
- [ ] Path-traversal guard on `--plan` (mirror `validatePlanPathSafety` from `impeccable-detect.js`).
- [ ] Tests cover the false-positive case using a real evidence-rich artifact from the repo as fixture.

---

*Drafted 2026-06-19 as part of v1.4.0 axis A ship. M2/M3 may invalidate non-essential parts; the probe shape (§3) and 2-axis prompt matrix (§4) are the most stable claims. Custody anchor options (§5) are deliberately open. Anti-patterns (§6) are the most invariant set — those derive from architectural axioms, not axis-specific contingencies.*
