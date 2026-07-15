# Workflow Orchestration — Live-Activation Observations (M2 · M3)

> Companion to `.claude/prds/workflow-orchestration-live-activation.prd.md` (M2 — live 완주 검증,
> M3 — 발견 gap 보완). This file is the **honest observation ledger** for the live-activation
> milestone. It records what actually fired when `/mccp:work` ran end-to-end, plus the protocol that
> produced those rows.
>
> **M3 (v1.22.3) update** — running M2's preview against the real environment surfaced the reason
> rows (A)/(B) were still empty: a *present* sticky critical cost-state ($186.92 + `hard_ceiling`)
> skipped every axis. M1's fail-open only assumed green when cost-state was **absent**, so ordinary
> operational spend still blocked everything. M3 retires the operational-USD firing block (and the
> matching `auto-chain` abort), replacing it with a catastrophic-USD ceiling + an atomic agent-count
> cap. See §4.1 for exactly what that licenses.

M1 wired default firing (fan-out / parallel / route oracles default-ON + cost fail-open + a
cost-state-independent runaway backstop) but the real LLM-runtime firing was **never observed**.
M2 splits observation into two axes so the observation itself is neither recursive nor blind:

- **Axis 1 — firing-preview (LLM 소비 0)**: `plugins/mccp/scripts/lib/orchestration-preview.js`
  reuses the exact Step 3 oracles read-only to answer "what WOULD fire right now?" without spend.
- **Axis 2 — operator-executed live 완주**: the operator runs `/mccp:work` on a scope-minimal
  target **outside** `/mccp:prp-implement` (recursion avoidance) and folds the firing log + receipt
  chain into the table below.

---

## 1. Firing-preview tool (run this BEFORE any live 완주)

```bash
node plugins/mccp/scripts/lib/orchestration-preview.js --plan <plan-path> --prd --json
# human-readable (no --json): per-axis ✅발화 / ⛔skip + reason
```

What it shows, and why the distinction matters:

- `oracle_run.{fanout,fleet}` — the **component signal** (`resolveFanout` / `resolveFleet` `run`).
  A `run:true` is a *necessary* condition, **not** proof of firing.
- `route` — the **primary firing decision** (`resolveWorkRoute`: `inline` / `task` /
  `workflow-single` / `workflow-parallel`). This is what actually fires.
- `effective_fire` — `oracle_run` **AND** `route`. `parallel_fires` is true only when
  `fleet.run` **and** `route === workflow-parallel`. So `ISOLATE=0`, a single-partition plan, or a
  runaway-degraded `n=1` all yield `run:true` but `parallel_fires:false` — a false green-light is
  structurally impossible.
- `caller_gates.*_assumed` — honest projections of mid-run artifacts (`dispatch-*-args.json`) that
  do not exist at preview time. `isolate` / `workflow_mode` / `partition_n` are real derivations.

The tool is strictly **read-only** — it never bumps the runaway counter, never writes cost-state or
STATE.md (mechanically asserted in `plugins/mccp/scripts/lib/tests/orchestration-preview.test.js`).
Use it to (a) measure the default firing rate with zero spend and (b) pre-clear broken wiring before
a live run, recording the expected `effective_fire` route in the row **before** you spend.

---

## 2. Per-cycle observation ledger

Each live `/mccp:work` completion is one row. Fill `route(fired)` from the actual
`[mccp:work] … route=…` stderr log, not from the preview projection.

| cycle | date | target | route(fired) | N | fanout(run/reason) | verify(mode/verdict) | receipt chain | 중간수정 수 | milestone 변경 | 품질 노트 |
|---|---|---|---|---|---|---|---|---|---|---|
| _preview-ref_ | 2026-07-14 | this M2 plan (build-time preview, **not** a live 완주) | task (projected) | fleet requestedN=4 | run=false / hard-ceiling | enforce / n/a | n/a (preview only) | n/a | n/a | **superseded by M3** — under M2 the build-time sticky-critical cost-state (`hard_ceiling=true`) made every axis ⛔skip. That block was the M2 live-row blocker and is what M3 retired; see the M3 row below. |
| _preview-ref (M3)_ | 2026-07-15 | M3 plan, seeded sticky $186.92 (`critical` + `hard_ceiling`) via temp `HOME` — build-time preview, **not** a live 완주 | workflow-parallel (projected) | fleet n=4 | run=true / ok-run | enforce / n/a | n/a (preview only) | n/a | n/a | **firing-open acquired.** Controlled A/B through the real CLI on ONE seeded state: `usd_bomb` off (M3 default) → `fleet.run=true reason=ok-run`, `effective_fire.parallel_fires=true`; `MCCP_ORCHESTRATION_USD_BOMB=1` (M1-equivalent) → `run=false reason=hard-ceiling`, nothing fires. `MCCP_ORCHESTRATION_CATASTROPHIC_USD=100` → `catastrophic-usd` skip, so the replacement bomb still bites. Preview wrote no state (read-only holds). |
| _(A) default_ | | | | | | | | | | operator-filled — see §3 row A |
| _(B) opt-out_ | | | | | | | | | | operator-filled — see §3 row B |

> **Honest scope of the M3 preview-ref row.** The ambient cost-state at M3 build time had *already
> reset to green* (`cost_usd:0`, `tier:green`) — the sticky $186.92 the M3 plan was written against
> was no longer present. A preview against that ambient state shows `run=true`, but that proves
> nothing: green fires under M1 too. The row above therefore uses a **seeded** sticky state in a temp
> `HOME` so the M3 delta is isolated as an A/B against the M1-equivalent (`usd_bomb=1`) on identical
> input. This is a mechanical demonstration of the oracle change, **not** evidence about any
> particular live spend, and it is **not** a live `/mccp:work` completion — it does not satisfy M2
> acceptance. Rows (A) and (B) remain the acceptance evidence and must be produced by the operator
> per §3.
>
> The ambient reset also does **not** retire the problem M3 solves. `MCCP_COST_STATE_DECAY_HOURS`
> (v1.22.0) is a *time-based* mitigation with a 6h window: the sticky block recurs the moment spend
> crosses the operational ceiling inside an active session, and M2's live rows are empty precisely
> because it did. M3 removes the block structurally rather than making the operator wait it out.

---

## 3. Live-dogfood protocol (operator, outside `/mccp:prp-implement`)

### 3.1 Scope-minimal target selection

Pick a target that is: **single-file or few-file**, **low-risk**, and a **real needed gap** (not
make-work) — e.g. one M3 candidate follow-up. The point is to observe firing on a genuine change
while keeping blast radius and spend small. Run the preview tool first and record the projected
`effective_fire` route.

### 3.2 Two named rows are REQUIRED (Codex F2 — happy-path 1회로 닫히지 않음)

M2 does **not** close on a single completion. Both rows must be captured:

- **Row A — default firing** (nothing set): expect `parallel`/`fan-out` to fire when cost-state is
  green and the plan yields N>1 disjoint partitions. Capture:
  - `route=…` log (expect `route=workflow-parallel`, or `workflow-single`/`task` if N=1),
  - `fanout`/`fleet` reason from the preview + the `[mccp:work] parallel fleet 발화 (N=…)` log,
  - merged-verify verdict (`mccp-implement-verify` receipt `meta.merged_verify_verdict`),
  - `/mccp:receipt-status` chain intact (plan → implement → verify → commit → pr).
- **Row B — `MCCP_WORK_IMPLEMENT_PARALLEL=off` opt-out single**: expect the single-worker path.
  Capture:
  - `route=…` log (expect `route=workflow-single` or `task`),
  - `fleet` reason `env-off`,
  - merged-verify verdict,
  - `/mccp:receipt-status` chain intact.

### 3.3 Recursion-avoidance boundary (중요)

The live `/mccp:work` completion is run by the **operator in a separate session**. Do **not** invoke
`/mccp:work` from inside `/mccp:prp-implement` — that reintroduces the PRD Open Question (live
verification recursion / cost). `prp-implement` builds the tool + tests + this doc (Tasks 1–4);
Task 5 is the operator's manual run whose observations are committed back into §2.

### 3.4 Verification procedure

1. Before the run: `orchestration-preview.js --plan <plan> --json` → record projected
   `effective_fire` route in the row.
2. Run `/mccp:work <target>` to completion.
3. Capture the `[mccp:work] … route=…` and `parallel fleet 발화` / `단일 worker` stderr logs.
4. `/mccp:receipt-status` → confirm the plan → implement → verify → commit → pr chain is intact
   (dual-review + receipt anchoring not degraded by the fan-out/parallel path).
5. Record 중간수정 수 (how many mid-run fixes) and any milestone change qualitatively.

---

## 4. Baseline reliability caveat (honest-assumption, inherited from PRD Success Metrics)

Single-user dogfood cannot be a rigorous A/B: the same operator runs both rows, so learning-effect
contaminates any "middle-fix count went down" claim. Therefore:

- Observations here are **qualitative and honest**, marked with an `assumption:` prefix where a
  causal claim is inferred rather than measured.
- Any "reduction" claim is stated **only** with the cited row it rests on — never as a quantitative
  A/B result.
- ~~If cost-state is sticky-critical at run time, the operator must wait for the time-decay window
  or run with a genuinely green cost-state.~~ **Retired by M3 (v1.22.3)** — see §4.1. Waiting out a
  6h decay window was the M2 workaround for a block that M3 removes structurally. The
  "do **not** fabricate a green state" rule still stands: record the real condition, always.

### 4.1 Live-완주 경로 after M3 (Codex F3 — stated precisely, not over-claimed)

M3 retires the **operational** USD block on both surfaces that could stall a run: the firing oracles
(`resolveFanout` / `resolveFleet`) and `auto-chain`'s commit→pr gate. Aligning both matters — firing
happens upstream of auto-chain, so unblocking firing alone would just move the stall later.

What this does and does not license:

| condition | firing | auto-chain (commit→pr) | operator action |
|---|---|---|---|
| operational spend below `MCCP_ORCHESTRATION_CATASTROPHIC_USD` (default $500), incl. sticky `critical` / `hard_ceiling` at $186 | fires | proceeds | run normally — this is the M3 default |
| `cost_usd` ≥ catastrophic ceiling | `catastrophic-usd` skip | `cost-catastrophic` abort | **record the real over-catastrophic condition honestly**; use `MCCP_AUTO_CHAIN_DISABLE=1` only if you consciously accept completing at that spend |
| `MCCP_ORCHESTRATION_USD_BOMB=1` | `hard-ceiling` skip | `cost-hard-ceiling` abort | expected — this is the M1 rollback switch |
| cost-state missing / unreadable / stale (>1h) | fires (fail-open) | **aborts** (telemetry integrity) | unchanged by M3: an untrustworthy signal is orthogonal to spend, so auto-chain stays conservative |

The accurate claim is therefore: **firing is open, and a live 완주 is possible while spend stays
under the catastrophic ceiling.** M3 does not claim a live 완주 was observed — that is still rows
(A)/(B), operator-produced per §3.

---

## 5. Related

- `docs/harness-cost-contract.md` — harness real-cost cache contract (tone mirror for this doc).
- `.claude/notes/work-context-firewall.md` — work-context isolation notes.
- `plugins/mccp/scripts/lib/orchestration-preview.js` — the firing-preview tool.
- `plugins/mccp/scripts/lib/implement-dispatch/route.js` — `resolveWorkRoute` (route SoT).
