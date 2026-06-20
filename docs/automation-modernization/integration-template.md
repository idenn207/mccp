# Integration template — Anthropic native automation features

> Status: **M1+M2+M3-validated** — three-axis sample (axis A, axis B, axis C shipped). Three axes is still a sample, not a rule — cross-axis lock-in (receipt schema, custody anchor option) remains avoided. Each new axis re-evaluates §5 matrix from scratch. **M3-specific extension**: axis C generalizes the §3 layer 4 (isolation lock) to **two-axis isolation** — (i) PreToolUse guard (M2 introduced) AND (ii) Stop hook lock-aware short-circuit (M3 introduces). M3 needs both because `/goal` IS a session-scoped prompt-based Stop hook (per https://code.claude.com/docs/en/goal) — the evaluator fires every turn IN the same session_id, so mccp's own Stop hook (`stop-review-loop.js`) needs a lock-aware suppress path to avoid polluting `/goal` loop with quality-runner / loop-counter / fix-task pollution. M2 axis B did not need this because `/effort ultracode` is a per-turn switch, not a multi-turn evaluator loop.

## 1. Pattern name

**Cooperative native-feature guide pattern**

For each Anthropic native automation primitive (e.g. `/deep-research`, `ultracode` keyword, `/goal` loop) that mccp wants to leverage without re-implementing, this pattern wires three layers — **detection probe**, **cooperative guide turn**, **injection of the result back into the mccp artifact** — so the result is captured in the receipt chain without mccp invoking the native feature itself.

## 2. When to use

Apply this pattern when Anthropic ships a Claude Code native feature that mccp wants to weave into a `/mccp:*` chain (PRD → plan → implement → PR) while preserving:

- **mccp's invariant**: do not re-implement what Anthropic already ships (see `CLAUDE.md` §1.4 Principles).
- **Receipt chain custody**: the native result must produce mechanical audit trail in the mccp receipt chain or — at a minimum — be anchored by a hash that downstream gates can detect mutations against.
- **Phantom-prompt prevention**: never emit guide prompts based on optimistic defaults. Tristate availability + AND-gated signal is the floor.

Each axis must independently evaluate its custody surface; M1's anchor choice does **not** generalize.

## 3. Three-layer breakdown (axis A + axis B + axis C reference)

| # | Layer | Module (axis A) | Module (axis B) | Module (axis C) | Purpose |
|---|---|---|---|---|---|
| 1 | Detection probe | `plugins/mccp/scripts/lib/deep-research-detect.js` | `plugins/mccp/scripts/lib/ultracode-detect.js` | `plugins/mccp/scripts/lib/goal-detect.js` | mode-aware probe — tristate availability + signal heuristic + path-traversal guard. Env override 1순위. Default availability=`unknown` so absence does not trigger phantom guidance. **axis B differs**: signal is an **exact-regex marker** (`- **Effort**: ultracode` on a single line). **axis C differs**: signal is a **PRD `Delivery Milestones` table row heuristic** — row Status=in-progress AND Plan cell filled AND plan file exists. No marker regex (axis C is explicit user invocation, not plan-body-driven). |
| 2 | Cooperative guide turn | `plugins/mccp/commands/plan-prd.md` Phase 2.5 | `plugins/mccp/commands/prp-implement.md` Phase 3.5 | `plugins/mccp/commands/milestone-close.md` Phase 2 | Emit guide prompt **only when** detection returns availability=available AND signal=true. WAIT for user reply on a dedicated response grammar. axis A grammar: `paste:` / `skip-research:` / `failed-research:`. axis B grammar: `ultracode-done:` / `ultracode-failed:` / `ultracode-skipped:`. axis C grammar: `goal-done:` / `goal-failed:` / `goal-skipped:`. Each axis grammar is disjoint from Phase 0 `skip` / `you decide` tokens AND from other axes' grammars. |
| 3 | Injection back into artifact | `plan-prd.md` Phase 4.0b + `plan.md` Phase 4 provenance hash | `prp-implement.md` Phase 3.5.9 PROVENANCE STAMP + Phase 5 report inject | `milestone-close.md` Phase 4 closure-doc write + plan-body `## Milestone Closure Provenance` stamp | Inject result into a dedicated section in the mccp artifact body. axis A: `## References` in PRD + `## External Research Provenance` in plan body. axis B: `## Ultracode Delegation Provenance` in plan body + `## Ultracode Delegations` in report. axis C: `.claude/milestone-closures/<id>.md` (frontmatter-less plain markdown, 4 sections) + `## Milestone Closure Provenance` (sha256(closure-doc)) appended to plan body. Plan body is hash-anchored by `plan-codex` receipt's `plan_hash`, so post-hoc mutation is mechanically detectable on next validate. |
| **4 (axis-specific)** | **Isolation lock — 1 or 2 axes per native turn model** | (not applicable for axis A — single-session research is intrinsically isolated) | **1 axis**: `ultracode-phase-lock.js` + `ultracode-phase-guard.js` PreToolUse hook only. `/effort ultracode` is a per-turn switch, not a multi-turn evaluator. | **2 axes**: (i) `goal-phase-lock.js` + `goal-phase-guard.js` PreToolUse hook **AND** (ii) `stop-review-loop.js` lock-aware fresh-only short-circuit (M3-only). | When the guide turn dispatches work to a user-mode native command that runs **outside mccp's audit reach**, cooperative prompt alone is insufficient — mechanical isolation is required. F2 fail-CLOSED on malformed lock. F3 STRICT non-owner: read-only ALLOW for non-owner session, write tools DENY regardless of session_id (M3 absorption). **Stop-hook short-circuit (M3-only)** is needed when the native command IS a session-scoped Stop hook (e.g. `/goal`) — without it, mccp's Stop hook fires every native evaluator turn and pollutes quality-runner / loop-counter / fix-task state. Generalization: §3 layer 4 is "isolation lock (1 or 2 axes — axis count depends on native command's turn model)". |

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
| (a) Body inject only — write result into artifact body without hash anchor | Receipt schema untouched. Lowest blast radius. | Artifact body is mutable — post-injection edits are silently lost from audit trail. | ✗ rejected as standalone | ✗ rejected — same reason as axis A | ✗ rejected — closure-doc would be mutable without hash anchor on plan body |
| (b) Body inject + plan-body provenance hash | Receipt schema untouched + `plan_hash` (already mandatory for plan-codex/implement-codex receipt) provides mechanical anchor. PRD/plan-side mutation detected on next validate. | Detection lags by one validate invocation. Not real-time. | ✓ **adopted for M1** | ✓ **adopted for M2** — axis-independent evaluation reached the same conclusion. | ✓ **adopted for M3 (axis-independent)** — closure-doc body (`.claude/milestone-closures/<id>.md`) + plan-body `## Milestone Closure Provenance` sha256(closure-doc) stamp. The closure-doc is git-tracked but cannot be edited post-stamp without breaking the plan_hash chain on next `/mccp:pr` validate. Three-axis convergence does NOT promote option (b) to cross-axis rule — each future axis must re-evaluate. |
| (c) New receipt field — e.g. `meta.external_research_*` or `meta.ultracode_*` or `meta.milestone_close_*` | Strict mechanical custody, real-time. | Requires schema bump + migration script + potentially cross-axis invariant lock-in. | ✗ deferred | ✗ deferred — same axis A rationale (cross-axis lock-in risk) | ✗ deferred — Codex impl-codex R1 considered new `mccp-milestone-close-codex` gate (CIQ3), rejected first-cut. F3 STRICT non-owner policy preserves mutation custody at PreToolUse layer; closure-doc + plan_hash anchor suffices. Option A retained as revision path if dogfood incident requires root-cause anchored on receipt rather than artifact. |
| (d) Envelope extension (dispatch IPC) — emit via dispatch envelope IPC | Compatible with dispatch-controller (`v1.2.0-m1`) IPC surface. Cross-session anchor possible. | Only meaningful for axes that fan out work to dispatch workers. Heavyweight for single-session axes. | ✗ N/A — axis A is single-session | ✗ N/A — axis B is single-session per-task | ✗ N/A — `/goal` is session-scoped (no fanout). dispatch-controller surface available but axis C does not consume. |

**M1+M2+M3 convergence on option (b)** does NOT generalize to option (b) as the cross-axis default. Three axes is still a sample. Each future axis is evaluated independently — locking option (b) globally would close off (c)/(d) for axes that genuinely require receipt-field or envelope-extension anchors. M3 confirmed (b) is sufficient given closure-doc audit artifact + F3 STRICT non-owner mutation block; this confirmation is axis-specific evidence, not cross-axis.

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
| Placing the isolation lock file alongside other atomic state files (e.g. `STATE.md`, `pr-phase.lock`) in the same directory with a generic name | Namespace collision — a different axis's lock can be misread or overwritten. The invariant is `.claude/state/<feature>-phase.lock` with a feature-distinct prefix (e.g. `ultracode-phase.lock`, `pr-phase.lock`, `goal-phase.lock`). |
| Stop-hook side-effect leakage during multi-turn native loop (e.g. `/goal` evaluator) without Stop-hook side isolation | M3-discovered. If the native command IS a session-scoped Stop hook (per Anthropic spec) — like `/goal` is a wrapper around a session-scoped prompt-based Stop hook — then mccp's own Stop hook (`stop-review-loop.js`) ALSO fires every native turn (same session_id). Without a lock-aware short-circuit on the mccp Stop hook side, quality-runner / loop-counter / fix-task state will mutate every evaluator turn, polluting both audit trail AND the native loop's signal-to-noise. The §3 layer 4 "isolation lock" is therefore 2-axis for axes dispatching to multi-turn native loops (PreToolUse guard + Stop-hook short-circuit). |

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

## 9. M3 reference (axis C — `/goal` → `/mccp:milestone-close`) — SHIPPED

- **Plan**: `.claude/plans/v1-4-0-m3-goal-milestone-close.plan.md`
- **Detection probe**: `plugins/mccp/scripts/lib/goal-detect.js`
- **Probe tests**: `plugins/mccp/scripts/lib/tests/goal-detect.test.js`
- **Cooperative guide turn**: `plugins/mccp/commands/milestone-close.md` Phase 2
- **Injection step**: `milestone-close.md` Phase 4 — `.claude/milestone-closures/<milestone-id>.md` (frontmatter-less plain markdown, 4 sections: `## Milestone` / `## Acceptance Condition` / `## Goal Loop Result` / `## Provenance`) + `## Milestone Closure Provenance` (sha256(closure-doc)) appended to plan body. closure-doc body is masked through `derive/mask.js#applySecretMask` (5-regex catalogue) before write (S5 security absorption — evaluator output may contain credentials/PII).
- **Custody anchor option chosen**: (b) closure-doc body + plan-body provenance hash — axis-independent evaluation reached the same conclusion as M1 + M2 by different mechanic. Option (a) closure-doc-only rejected (mutability), (c) new receipt gate rejected first-cut (CIQ3 — F3 STRICT non-owner mutation block makes gate redundant; revision available if dogfood incident requires anchor-on-receipt), (d) envelope-extension N/A (single-session).
- **Isolation lock layer (M3 = 2-axis)**:
  - (i) `plugins/mccp/scripts/lib/goal-phase-lock.js` + `plugins/mccp/scripts/hooks/goal-phase-guard.js` PreToolUse hook (registered as `mccp:goal-phase-guard:pre`). Lock file `.claude/state/goal-phase.lock`. Sidecar token file `<gitdir>/mccp/tmp/goal-token-<run-id>.dat` (mode 0o600). Lease default 90s (multi-turn loop tolerance vs M2's 60s). F2 fail-CLOSED on malformed lock. F3 STRICT non-owner: read-only ALLOW for `event.session_id ≠ lock.owner_session_id`, write tools (Edit/Write/MultiEdit/NotebookEdit) + Skill mccp:* + Bash mutating remain DENY regardless of session_id (closure-doc anchor invariant). S3 Bash policy is fail-closed whitelist-only.
  - (ii) `plugins/mccp/scripts/hooks/stop-review-loop.js` lock-aware fresh-only short-circuit (~20-line inline addition after `modeFromEnv` + `repoRoot` resolve, before `gitDiffEmpty`). Freshness validation = host + pid + mtime < 90s lease (§3.6 host-aware tri-state mirror). suppress emits `[mccp:stop-review-loop] suppressed: goal-phase lock active` + pass-through. Loud fail-open on lock parse error (stop-hook crash MUST NOT block user).
- **Grammar (Phase 3)**: `goal-done:<≥3-word summary>` / `goal-failed:<reason>` / `goal-skipped:<reason>` — disjoint from Phase 0 tokens + M1 `paste:` + M2 `ultracode-*:`
- **Native spec re-confirmation marker**: plan body footer HTML comment `<!-- goal native spec confirmed at <ISO>: stop_hook_fires=<bool>, sub_session_id_exposed=<bool>, turn_bound_default=<N|none>, evaluator_event_exposed=<bool>, summary=<...> -->` — Task 1 plan-finalize gate. Confirmed via WebFetch from https://code.claude.com/docs/en/goal: stop_hook_fires=true, sub_session_id_exposed=false (same session_id), turn_bound_default=none (user includes "or stop after N turns" clause), evaluator_event_exposed=false (evaluator IS the Stop hook firing).

**PRD Open Question §3** (`integration template doc은 M4 별도 milestone으로 할 것인가, 아니면 M1/M2/M3 각 milestone의 부산물로 점진 누적할 것인가?`) — **Decision (2026-06-19)**: M1+M2+M3 누적 패턴으로 충족. M4 별도 milestone은 redundant — 본 doc이 axis A/B/C reference + §3/§5 매트릭스 + §6 anti-patterns + §10 audit checklist를 모두 담고 있어 별도 milestone에서 추가할 새로운 content가 없음. PRD M4 row → status `dropped` (M1+M2+M3 누적으로 충족, M4 별도 milestone 불필요).

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
- [ ] **Caller-identity discriminator (Scenario A) + fallback (Scenario B)**: when caller identity is exposed in the hook payload, the guard ALLOWS read-only calls from a different session (M3 STRICT — F3 absorption: writes DENY regardless of session). When discriminator is absent → blanket-enforce + stderr warn (loud fail-open, axis-independent failsafe).
- [ ] **Stop-hook isolation mechanism (if axis dispatches work to multi-turn native loop)**: `stop-review-loop.js` lock-aware short-circuit with freshness validation (host + pid + mtime < lease, §3.6 tri-state mirror). Tests for (a) lock active+fresh = suppress + pass-through, (b) lock stale = fall-through, (c) lock foreign-dead = fall-through, (d) lock parse-error = loud fail-open. Required when the native command IS a session-scoped Stop hook (e.g. `/goal`) so mccp's own Stop hook does not pollute the native loop. NOT required for per-turn native switches (e.g. `/effort ultracode` — M2 axis B doesn't need this).
- [ ] **Multi-turn lock lease sizing**: if `native loop turn count expected upper bound × per-turn duration > lease(default 90s)`, then heartbeat orchestration is required AND dogfood validation is required to measure actual turn duration. M3 axis C uses 90s lease vs M2's 60s precisely because multi-turn `/goal` loops can pause longer than single per-task `/effort` switches. Heartbeat is invoked from the slash command body (no background hook can heartbeat while waiting for user response).

---

*Drafted 2026-06-19 as part of v1.4.0 axis A ship; extended 2026-06-19 with axis B (M2) reference + isolation lock layer + cross-axis evaluation rule; extended 2026-06-19 with axis C (M3) reference + Stop-hook isolation layer (§3 row 4 becomes 2-axis for multi-turn native loops) + 3-axis sample status mark + PRD Open Question §3 decision (M4 dropped). M3 confirmed §3/§4 are stable; §5 matrix axis C cell filled by axis-independent evaluation; §6 anti-patterns extended with multi-turn Stop-hook leakage. Three axes is a sample, not a rule — cross-axis lock-in remains avoided. Future axes (axis D and beyond) must re-evaluate §5 matrix from scratch.*
