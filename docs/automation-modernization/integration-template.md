# Integration template — Anthropic native automation features

> Status: **M1+M2-validated** — two-axis sample (axis A and axis B shipped). Cross-axis receipt schema invariants are still NOT defined until M3 (`/goal`) ships and validates the option (b) anchor (or chooses a different one) across all three layers. M3 may pick a different custody anchor option (see §5 matrix). Do not lock option (b) as a global rule. **M2-specific extension**: axis B introduces a 4th layer — **isolation lock** (`ultracode-phase-lock.js` + `ultracode-phase-guard.js`) — that the §9 audit checklist now requires for axes dispatching work to a user-mode native command that runs outside mccp's audit reach. The lock layer is axis-specific (M1 axis A does NOT use it); cross-axis lock-in is avoided.

## 1. Pattern name

**Cooperative native-feature guide pattern**

For each Anthropic native automation primitive (e.g. `/deep-research`, `ultracode` keyword, `/goal` loop) that mccp wants to leverage without re-implementing, this pattern wires three layers — **detection probe**, **cooperative guide turn**, **injection of the result back into the mccp artifact** — so the result is captured in the receipt chain without mccp invoking the native feature itself.

## 2. When to use

Apply this pattern when Anthropic ships a Claude Code native feature that mccp wants to weave into a `/mccp:*` chain (PRD → plan → implement → PR) while preserving:

- **mccp's invariant**: do not re-implement what Anthropic already ships (see `CLAUDE.md` §1.4 Principles).
- **Receipt chain custody**: the native result must produce mechanical audit trail in the mccp receipt chain or — at a minimum — be anchored by a hash that downstream gates can detect mutations against.
- **Phantom-prompt prevention**: never emit guide prompts based on optimistic defaults. Tristate availability + AND-gated signal is the floor.

Each axis must independently evaluate its custody surface; M1's anchor choice does **not** generalize.

## 3. Three-layer breakdown (axis A + axis B reference)

| # | Layer | Module (axis A) | Module (axis B) | Purpose |
|---|---|---|---|---|
| 1 | Detection probe | `plugins/mccp/scripts/lib/deep-research-detect.js` | `plugins/mccp/scripts/lib/ultracode-detect.js` | mode-aware probe — tristate availability + signal heuristic + path-traversal guard. Env override 1순위. Default availability=`unknown` so absence does not trigger phantom guidance. **axis B differs**: signal is an **exact-regex marker** (`- **Effort**: ultracode` on a single line) instead of an AND-gated keyword heuristic — appropriate for plan-body-driven flows where false-positive cost is high. |
| 2 | Cooperative guide turn | `plugins/mccp/commands/plan-prd.md` Phase 2.5 | `plugins/mccp/commands/prp-implement.md` Phase 3.5 | Emit guide prompt **only when** detection returns availability=available AND signal=true. WAIT for user reply on a dedicated response grammar. axis A grammar: `paste:` / `skip-research:` / `failed-research:`. axis B grammar: `ultracode-done:` / `ultracode-failed:` / `ultracode-skipped:`. Each axis grammar is disjoint from Phase 0 `skip` / `you decide` tokens AND from other axes' grammars. |
| 3 | Injection back into artifact | `plan-prd.md` Phase 4.0b + `plan.md` Phase 4 provenance hash | `prp-implement.md` Phase 3.5.9 PROVENANCE STAMP + Phase 5 report inject | Inject result into a dedicated section in the mccp artifact body. axis A: `## References` in the PRD body, then `## External Research Provenance` appended to plan body. axis B: `## Ultracode Delegation Provenance` appended to plan body + `## Ultracode Delegations` section in the implementation report. The plan body is hash-anchored by `plan-codex` receipt's `plan_hash`, so post-hoc mutation is mechanically detectable on next validate. |
| **4 (axis-specific)** | **Isolation lock (M2 only)** | (not applicable for axis A — single-session research is intrinsically isolated) | `ultracode-phase-lock.js` + `ultracode-phase-guard.js` PreToolUse hook | When the guide turn dispatches work to a user-mode native command that runs **outside mccp's audit reach** (e.g. workflow runtime, `/effort` mode-switch), the cooperative prompt is insufficient — the lock + PreToolUse default-deny guard provides mechanical isolation. F2 fail-CLOSED on malformed lock. F1 Scenario A: caller-identity (`session_id`) discriminator, Scenario B fallback to blanket-enforce when discriminator absent. axis A does NOT need this layer because `/deep-research` results return as text in the user's next turn (no out-of-band write). |

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

| Option | Pros | Cons | Axis A (M1) | Axis B (M2) | Axis C (M3) |
|---|---|---|---|---|---|
| (a) Body inject only — write result into artifact body without hash anchor | Receipt schema untouched. Lowest blast radius. | Artifact body is mutable — post-injection edits are silently lost from audit trail. | ✗ rejected as standalone | ✗ rejected — same reason as axis A | TBD |
| (b) Body inject + plan-body provenance hash | Receipt schema untouched + `plan_hash` (already mandatory for plan-codex/implement-codex receipt) provides mechanical anchor. PRD/plan-side mutation detected on next validate. | Detection lags by one validate invocation. Not real-time. | ✓ **adopted for M1** | ✓ **adopted for M2** — axis-independent evaluation reached the same conclusion (different mechanic, same custody anchor). axis B adds the isolation lock layer **in addition to** option (b) — the lock is runtime mechanical isolation, the hash is post-hoc mutation detection. Orthogonal axes. | TBD |
| (c) New receipt field — e.g. `meta.external_research_*` or `meta.ultracode_*` | Strict mechanical custody, real-time. | Requires schema bump + migration script + potentially cross-axis invariant lock-in. | ✗ deferred | ✗ deferred — same axis A rationale (cross-axis lock-in risk). M2 PRD Success Metric 2 (receipt chain custody) is preserved by option (b) alone | TBD |
| (d) Envelope extension (dispatch IPC) — emit via dispatch envelope IPC | Compatible with dispatch-controller (`v1.2.0-m1`) IPC surface. Cross-session anchor possible. | Only meaningful for axes that fan out work to dispatch workers. Heavyweight for single-session axes. | ✗ N/A — axis A is single-session | ✗ N/A — axis B is single-session per-task (prp-implement is a single mccp turn that loops; ultracode delegation is per-task, not a dispatch fanout). dispatch-controller IPC surface is available but axis B explicitly does not consume it | TBD |

**M1+M2 convergence on option (b)** does NOT generalize to option (b) as the cross-axis default. Each axis is evaluated independently. M3 (`/goal` loop completion) may have a different signature — particularly if `/goal` emits an evaluator-side event that the cooperative guide turn pattern does not directly capture, options (c) or (d) may apply.

## 6. Anti-patterns

| Anti-pattern | Why it's wrong |
|---|---|
| mccp re-implements the native feature inside a `/mccp:*` command | Violates the CLAUDE.md §1.4 Principle "mccp does not re-build what Anthropic ships". Forks the maintenance surface. |
| mccp auto-invokes the native command via shell (`bash`/`spawn`) | Native slash commands are not mechanically invocable from inside another slash command's body — even if it worked, it would bypass dual-review and break the receipt chain. |
| First axis's custody anchor is generalized to a cross-axis invariant | M1 is a single sample. axis B / axis C may need *different* anchors. Locking option (b) as the rule will block axes that genuinely need option (c) or (d). |
| Optimistic-default availability (e.g. `available` is the default) | Triggers phantom guide prompts when the feature is not actually installed. Tristate + `unknown` default is the floor. |
| Keyword-only signal heuristic (no AND-gate against evidence/state) | Produces a high false-positive rate on artifacts that mention a topic but do not need external work. The AND-gate (e.g. evidence-gap AND keyword) is the floor. |
| Reusing Phase 0 `skip` / `you decide` tokens for the guide turn | Overloads Phase 0 grammar; user can't tell which phase their `skip` applies to. Each cooperative guide turn must define its own dedicated grammar. |
| Relying on a single prompt-text instruction ("do not call mccp:* inside ultracode mode") for isolation, without a mechanical lock layer | If Claude or the workflow agent ignores the prompt for any reason, mccp state can be silently mutated mid-delegation. PRD Open Q §2 explicitly noted "둘 다 leakage 가능" — both cooperative AND mechanical layers are required when the native command dispatches out-of-band writes. M2 axis B's `ultracode-phase-lock.js` + PreToolUse hook is the mechanical layer. |
| Placing the isolation lock file alongside other atomic state files (e.g. `STATE.md`, `pr-phase.lock`) in the same directory with a generic name | Namespace collision — a different axis's lock can be misread or overwritten. The invariant is `.claude/state/<feature>-phase.lock` with a feature-distinct prefix (e.g. `ultracode-phase.lock`, `pr-phase.lock`). |

## 7. M1 reference (axis A — `/deep-research` → `/mccp:plan-prd`)

- **Plan**: `.claude/plans/v1-4-0-m1-deep-research.plan.md`
- **Detection probe**: `plugins/mccp/scripts/lib/deep-research-detect.js`
- **Probe tests**: `plugins/mccp/scripts/lib/tests/deep-research-detect.test.js`
- **Cooperative guide turn**: `plugins/mccp/commands/plan-prd.md` Phase 2.5
- **Injection step**: `plugins/mccp/commands/plan-prd.md` Phase 4.0b (`## References`) + `plugins/mccp/commands/plan.md` Phase 4 provenance hash (`## External Research Provenance`)
- **Custody anchor option chosen**: (b) body inject + plan-body provenance hash
- **Grammar (Phase 2.5)**: `paste:<content>` / `skip-research:<reason>` / `failed-research:<reason>`

## 8. M2 reference (axis B — `ultracode` → `/mccp:prp-implement`) — SHIPPED

- **Plan**: `.claude/plans/v1-4-0-m2-ultracode.plan.md`
- **Detection probe**: `plugins/mccp/scripts/lib/ultracode-detect.js`
- **Probe tests**: `plugins/mccp/scripts/lib/tests/ultracode-detect.test.js`
- **Cooperative guide turn**: `plugins/mccp/commands/prp-implement.md` Phase 3.5
- **Injection step**: `prp-implement.md` Phase 3.5.9 PROVENANCE STAMP (`## Ultracode Delegation Provenance` plan body section) + Phase 5 REPORT (`## Ultracode Delegations` report section)
- **Custody anchor option chosen**: (b) body inject + plan-body provenance hash — same as axis A by independent evaluation
- **Isolation lock layer (M2-specific, 4th layer)**: `plugins/mccp/scripts/lib/ultracode-phase-lock.js` + `plugins/mccp/scripts/hooks/ultracode-phase-guard.js` PreToolUse hook (registered as `mccp:ultracode-phase-guard:pre` in `plugins/mccp/hooks/hooks.json`). Lock file `.claude/state/ultracode-phase.lock`. Sidecar token file `<gitdir>/mccp/tmp/ultracode-token-<run-id>.dat`. F2 fail-CLOSED on malformed lock. F1 Scenario A: `event.session_id` ≠ `lock.owner_session_id` → ALLOW (workflow-agent caller); Scenario B fallback to blanket-enforce when discriminator absent.
- **Grammar (Phase 3.5)**: `ultracode-done:<≥3-word summary>` / `ultracode-failed:<reason>` / `ultracode-skipped:<reason>`
- **F4 sidecar journal**: `<plan-path>.delegations.jsonl` (append-only NDJSON) — durable per-task ledger; idempotency key `(plan_hash, task_index, run_id)`; survives mid-loop crashes; gitignored
- **F5 strict whitelist**: `KNOWN_TIERS = { ultracode }` in `ultracode-detect.js`. Unknown tier (e.g. `ultraplan`) → `reason=unknown-effort-tier` + explicit stderr warn (no silent skip)
- **Native spec re-confirmation marker**: plan body footer HTML comment `<!-- ultracode native spec confirmed at <ISO>: hook_active_in_ultracode=<bool>, caller_session_id_exposed=<bool|unknown>, marker_collision=<state>, summary=<...> -->` — Task 1 plan-finalize gate per §A1 absorption

## 9. M3 placeholder (axis C — `/goal` → `/mccp:milestone-close`) — pending

- pending design + plan + PRD Section 4 row
- When entering M3 plan, **re-run §5 matrix from scratch** — `/goal` evaluator-side completion-condition events may not fit the cooperative guide turn pattern as-is. Options (c) new receipt field or (d) envelope extension may apply.
- PRD risk #4 (`/goal` evaluator may collide with mccp Stop hook chain) is the dominant unknown. Investigate before committing to the integration shape.
- §9 audit checklist will need re-evaluation for any axis-D-specific layer (parallel to M2's isolation lock layer).

**PRD Open Question §3** (`integration template doc은 M4 별도 milestone으로 할 것인가, 아니면 M1/M2/M3 각 milestone의 부산물로 점진 누적할 것인가?`) — M1 + M2 have so far been the **incremental accumulation** path (this doc is the receipt). Final decision still belongs at M3 cycle close. Two axes is a sample, not a rule.

## 10. Audit checklist when adding a new axis

Before merging an axis that follows this template:

- [ ] Probe shape matches §3 (tristate availability + signal heuristic + reason enum). Default availability is `unknown` if filesystem probe cannot conclusively prove `available`.
- [ ] Guide prompt fires only on `available` + `signal=true` (§4 matrix).
- [ ] Dedicated response grammar exists and is documented inline in the prompt text. Phase 0 tokens (`skip` / `you decide`) and other axes' grammars are NOT re-used.
- [ ] Custody anchor option (§5) is explicitly chosen, with rationale logged in the axis's plan body. **Axis-independent evaluation** — do not adopt option (b) by default because M1+M2 did; re-evaluate.
- [ ] CLAUDE.md §1.4 Principle "mccp does not re-build what Anthropic ships" is preserved — no shell-spawn of the native command, no in-prompt re-implementation.
- [ ] Path-traversal guard on `--plan` (mirror `validatePlanPathSafety` from `impeccable-detect.js`).
- [ ] Tests cover the false-positive case using a real evidence-rich artifact from the repo as fixture.
- [ ] **Isolation lock mechanism (if axis dispatches work to a user-mode native command that runs outside mccp's audit reach)**: `pr-phase-lock` / `ultracode-phase-lock` pattern mirror — token authority split (sha256 hash in lock body, raw token via durable out-of-band channel — sidecar file or stdin pipe), host-aware tri-state reclaim policy (same-host+pid-alive=NEVER reclaim, same-host+pid-dead=reclaim, cross-host=mtime-only, 0-byte/unparseable=mtime-only), F8 symlink containment.
- [ ] **Allow/deny matrix for lock-active state**: documented inline in the axis's plan + tested with a PreToolUse hook contract test fixture (cover Write tools, Bash deny + allow patterns, Skill `mccp:*` deny, F2 fail-CLOSED on malformed lock).
- [ ] **Lock crash recovery**: `detect-stale` subcommand verified to reclaim via host-aware tri-state policy. Test fixture includes same-host+pid-dead, cross-host, and 0-byte/unparseable scenarios.
- [ ] **Caller-identity discriminator (Scenario A) + fallback (Scenario B)**: when caller identity is exposed in the hook payload, the guard ALLOWS calls from a different session (e.g. workflow subagent) while DENYing calls from the mccp session that holds the lock. When discriminator is absent → blanket-enforce + stderr warn (loud fail-open, axis-independent failsafe).

---

*Drafted 2026-06-19 as part of v1.4.0 axis A ship; extended 2026-06-19 with axis B (M2) reference + isolation lock layer + cross-axis evaluation rule. M3 may invalidate non-essential parts; the probe shape (§3) and 2-axis prompt matrix (§4) are the most stable claims. Custody anchor options (§5) are deliberately open. Anti-patterns (§6) are the most invariant set — those derive from architectural axioms, not axis-specific contingencies. Isolation lock layer (§3 row 4) is axis-conditional, not universal — only required when the dispatched native command runs outside mccp's audit reach.*
