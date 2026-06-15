# Spike: Claude Code 2.x upstream primitives — evaluation for v1.2.0 orchestrator

> Plan Task 0 evidence. Written 2026-06-16 by `/mccp:prp-implement` Phase 3 EXECUTE Task 0.

## Environment pin (mandatory per plan §Risks line 155)

| Field | Value |
|---|---|
| Claude Code surface | In-IDE session (system-reminder confirms `claude --version` probe failed with ENOENT — `claude` binary not on PATH in this session) |
| Model | Claude Opus 4.7 (`claude-opus-4-7`) |
| Knowledge cutoff | January 2026 |
| OS | Windows 11 Pro 10.0.26200 |
| Shell | PowerShell + Bash tool available |
| IDE harness | Claude Code (this session) — primitive surface inspected via available-tools and available-skills system reminders |
| Plugin context | mccp 0.4.0 cached at `C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.4.0/` |

**Caveat**: The plan's Task 0 enumerates `/fork`, `/batch`, `/tasks`, `/background` as Claude Code 2.x slash commands. In this session, **none of those slash commands appear** in the available-skills list. The closest analogs surface as **tools** (`Agent`, `EnterWorktree` / `ExitWorktree`, `Monitor`, `RemoteTrigger`, `CronCreate`, `TaskCreate/Update/...`). This spike evaluates the *capabilities* the plan asks about against the *tool surface that exists* — which may differ from a CLI-launched session.

## Primitive mapping (this session)

| Plan reference | Actual surface | Notes |
|---|---|---|
| `/fork` | `Agent` tool (with `subagent_type`) | 70+ subagent types. Default: same CWD as parent. Optional `isolation: "worktree"` creates temporary git worktree. |
| `/batch` | No batch primitive surfaces. `Agent` tool can be called multiple times in one message for parallel runs. | No native batch-of-N pattern; multiple `Agent` calls in one tool-use turn execute in parallel per CLAUDE.md. |
| `/tasks` | `TaskCreate` / `TaskUpdate` / `TaskList` / `TaskGet` / `TaskOutput` / `TaskStop` | In-conversation task tracking surface — different paradigm from /tasks job runner. |
| `/background` | `Monitor` (stdout stream) + `Bash run_in_background` (one-shot completion) | Two distinct patterns: streaming watch vs one-shot background task. |
| (adjacent) `EnterWorktree` / `ExitWorktree` | Worktree management tool — `.claude/worktrees/<name>` under repo, isolated branch. | Closest match for worktree-batch idiom. |
| (adjacent) `RemoteTrigger` / `CronCreate` | Remote-trigger API (claude.ai routines) + in-session cron | Remote agents on claude.ai schedule. |

## The 4 spike questions (verifiable Y/N + evidence)

### Q1. Can a forked subagent read/write the parent's `.claude/receipts/*/`?

**Answer**: **PARTIAL / UNKNOWN** — depends on isolation mode. Default mode YES, worktree-isolated mode NO.

**Evidence**:

- The `Agent` tool description (loaded via ToolSearch deferred-tool fetch) states: *"With `isolation: \"worktree\"`, the worktree is automatically cleaned up if the agent makes no changes; otherwise the path and branch are returned in the result."* — confirming two distinct modes.
- general-purpose subagent type carries `tools: *` (per available-agents listing) — includes `Read`, `Write`, `Edit`, `Bash`. So file IO is unblocked at the tool-permission layer.
- **Default mode (no isolation)**: subagent CWD = parent CWD. Read/write of `.claude/receipts/*/<file>.json` lands on parent's filesystem path. YES, parent receipts are reachable.
- **Worktree-isolated mode**: subagent CWD = `<repo>/.claude/worktrees/<name>` — a separate git worktree. Read/write goes to the *worktree's* `.claude/receipts/`, not parent. If receipts are gitignored (mccp v0.2.8 working-tree-only convention per CLAUDE.md §4 "schema migrations" comment), they don't propagate back on worktree-clean-exit. **Effectively NO for parent receipts in worktree-isolated mode.**

**Implication for v1.2.0**: If the orchestrator wants workers to write receipts back to the controller, it must either (a) avoid worktree isolation and accept shared-filesystem race risk, or (b) define an explicit IPC schema for worker→controller receipt handoff. Q3=B (receipt schema extension) confirmed in user alignment becomes load-bearing.

### Q2. Does `/batch`'s worktree spawn bypass the `claude` PATH dependency?

**Answer**: **YES** — both `EnterWorktree` and `Agent(isolation: "worktree")` operate in-process. No `claude` binary spawn occurs.

**Evidence**:

- The session-spawner ENOENT issue (CLAUDE.md §1.4 row "Auto-handoff") arises because `child_process.spawn('claude', ...)` requires `claude` on PATH, and IDE-launched sessions don't have it.
- `EnterWorktree` description: *"creates a new git worktree inside `.claude/worktrees/` on a new branch"*  + *"Switches the session's working directory to the new worktree"* — no subprocess spawn. Same in-process Claude session continues in the new CWD.
- `Agent` tool with isolation: per CLAUDE.md and the tool description, the subagent runs as a tool-call within the same harness process. No fork-exec of `claude` binary.
- System-reminder evidence: this very session has `claude --version` probe failing with ENOENT (claude not on PATH), yet `Agent` and `EnterWorktree` tools are operable. This is *positive evidence by absence* — the primitives are functional despite the missing binary.

**Implication for v1.2.0**: The current `spawn`-mode auto-handoff problem is **upstream-solved** for the worker-spawn case. Stage 2 controller can use `Agent` tool (or `EnterWorktree`) to spawn workers without the PATH dependency that plagues `session-spawner.js`.

### Q3. Inside fork/batch, can cross-vendor (Codex) calls work? (= dual-review philosophy preserved?)

**Answer**: **YES, with caveats** — Bash tool inside a general-purpose subagent can invoke `codex-invoke.js`, but environment variable propagation and plugin-cache path discovery must be explicitly passed in the subagent prompt.

**Evidence**:

- general-purpose subagent type has `tools: *` including `Bash`. The mccp Codex wrapper is invoked as `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js`, which is a Bash invocation.
- Subagent prompt isolation (per Agent tool description: *"Each spawn starts cold and re-derives context you already have"*) implies env vars and the plugin cache path must be re-supplied in the prompt body. Not inherited from parent's `CLAUDE_PLUGIN_ROOT`.
- The codex companion (`codex-companion.mjs`) is a separate plugin (`@openai-codex`) cached under `~/.claude/plugins/cache/codex/`. As long as the subagent's Bash can resolve absolute paths to both the plugin caches, the invocation works.
- **Caveat 1**: subagent must not lose the `MCCP_RECEIPT_GATE_MODE` / `MCCP_ALLOW_CODEX_UNAVAILABLE` / `MCCP_CODEX_DISABLED` env-var policy. If subagent inherits a clean env, the default fail-closed posture applies — controller must propagate explicitly.
- **Caveat 2**: the codex receipt write goes to `.claude/receipts/mccp-*-codex/<slug>.json` at subagent CWD. Cross-references Q1 — in isolation=worktree mode, the receipt lands in the worktree copy, not the parent.

**Implication for v1.2.0**: Codex review inside a worker is mechanically possible. The dual-review philosophy survives. But the **receipt handoff problem** (Q1 worktree case) becomes the dominant integration challenge — Q3=B (receipt schema extension for cross-session attribution) is the right user choice.

### Q4. What's the return format from fork/batch to the parent conversation?

**Answer**: **NO — text-only**, not natively structured-and-receipt-compatible. Can be coerced to JSON via prompt convention but the harness does not enforce or parse structure.

**Evidence**:

- Direct quote from the `Agent` tool description: *"When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user."*
- The result is delivered as a single tool-result text string. No type discriminant. No envelope schema. No machine-readable status field.
- Compare to `RemoteTrigger`: returns raw JSON from the claude.ai API (structured). But that's a *remote* trigger paradigm, not fork/batch.
- Compare to `Monitor`: each stdout line is a notification (event stream), not a return value. Multiple text notifications, no structured terminal payload.
- **Coercion path**: parent can ask subagent in the prompt to emit a JSON envelope (e.g., `"finish your response with a single ```json ... ``` block containing {status, receipts, findings}"`). But parent then has to extract + parse + validate. The harness offers no guarantee — a hallucinated or malformed JSON block will surface as a parse error at the parent. This is **not** receipt-compatible in the chain-of-custody sense.

**Implication for v1.2.0**: Stage 2 controller cannot rely on native structured return. It must (a) write its own JSON-envelope prompt convention (brittle), (b) use the filesystem as the IPC channel (worker writes `.claude/state/<dispatch-id>.handoff.json`, controller reads it post-Agent), or (c) accept text-only handoff with controller-side parsing. **Option (b) is the only path that survives `isolation: "worktree"` correctly** — but requires either avoiding worktree isolation (Q1 race) or shipping a worktree → parent file-sync protocol.

## 4-AND predicate evaluation (Acceptance line 163)

| Q | Answer | 4-AND pass? |
|---|---|---|
| Q1: subagent reads/writes parent receipts | PARTIAL (isolation-dependent) | ❌ |
| Q2: spawn bypasses claude PATH | YES | ✅ |
| Q3: cross-vendor Codex in subagent | YES (with env propagation caveat) | ✅ (passes — caveat is operational, not architectural) |
| Q4: return format structured-and-receipt-compatible | NO (text-only) | ❌ |

**4-AND result**: **FAIL** (Q1 partial + Q4 fail).

**Per Acceptance line 163**: "어느 한 답이라도 fail/unknown이면 Tasks 1.5/2/3은 stage 1에서 local impl 진행 (stage 1 PR은 docs + spawn-quarantine + state-writer schema + resume 모두 ship)." → **Tasks 1.5, 2, 3 must ship in this stage 1 PR.** No deferral.

## Decision implications for Stage 2

1. **Q2 (PATH bypass)**: ✅ — Stage 2 controller can use `Agent` or `EnterWorktree` to spawn workers. The `session-spawner.spawn()` codepath becomes redundant (and is now quarantined behind `MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN=1` per Task 1 this PR).
2. **Q1 + Q4 (receipt + IPC)**: Stage 2 must define an **explicit filesystem-IPC schema** for worker → controller receipt handoff. The user alignment Q3=B (receipt schema extension) is now load-bearing: receipt schema must carry an attribution surface (controller_session_id, worker_dispatch_id, ipc_envelope_path) so the controller can re-anchor worker output into the chain-of-custody.
3. **Q3 (Codex in workers)**: ✅ — dual-review philosophy survives. Worker can run its own mccp-*-codex gate, write receipt to its CWD, then the IPC schema (per #2) handles the receipt-merge back to controller.
4. **Worker isolation mode**: For Stage 2, **default to worktree isolation** (clean rollback, no parent CWD pollution) AND ship the file-sync protocol (#2). Default-without-isolation is the trap — it creates filesystem races between concurrent workers.

## Open questions deferred to Stage 2 backlog

(Logged in `.claude/plans/v1-2-0-orchestrator-stage2-backlog.md` per Task 5.)

- Filesystem IPC schema definition (envelope path, worker → controller publish/subscribe semantics, atomic write protocol).
- Pilot workflow for multi-axis review (user choice Q4=i — first vertical to dogfood).
- Worker lifecycle: 6 cases (graceful exit / explicit failure / timeout / crash / orphan-on-controller-crash / garbage cleanup).
- Controller polling vs event-driven (Monitor tool may collapse this dichotomy if file-write triggers Monitor's stdout-emitter, but the protocol must be specified).
