# M3 Friction Metric — measurement protocol

> v1.4.0-m3 — single-purpose explainer.
> Companion to [`state-md-narrowing.md`](./state-md-narrowing.md) and
> [`session-ledger-schema.md`](./session-ledger-schema.md).

This document defines how the M3 metric (PRD §Success Metrics) is measured
and what counts as a friction event. PRD wording: *"한 cycle 내 2~5 worktree
병렬 작업의 reconciliation friction 0회"*.

## 1. Sidecar schema

Producer side. Append-only JSONL file at:

```text
<repo>/.claude/state/m3-friction-events.jsonl
```

Each line is a single minified JSON object:

```json
{"ts":"2026-06-20T01:23:45.000Z","event":"banner-injected","session_id":"<id>","project_branch":"<branch>"}
```

| Field | Type | Notes |
|---|---|---|
| `ts` | ISO8601 | when SessionStart hook emitted the event |
| `event` | string | `banner-injected` is the only event in v1.4.0-m3 |
| `session_id` | string\|null | observer session id of the current worktree |
| `project_branch` | string\|null | best-effort `git rev-parse --abbrev-ref HEAD` |

Write path: `plugins/mccp/scripts/lib/friction-telemetry.js#recordBannerInjected`.
Single `fs.appendFileSync` with `'a'` flag. POSIX/Win32 single write
<PIPE_BUF (4KB) is atomic per-line, so concurrent SessionStart processes
can each append without losing events (Codex Implement R1 F1 absorption —
no in-band read-modify-write cap).

`.gitignore` covers the sidecar (worktree-local, never committed).

## 2. Reconciliation friction taxonomy (user side)

A friction event is **any** user-visible question or manual probe in the
Claude transcript that matches one of:

1. **Cold disambiguation** — "어떤 작업을 진행할까요?" / "지금 무엇을
   하실 건가요?" / "이전에 하던 작업이 X인가요 Y인가요?"
2. **STATE drift question** — "STATE.md와 실제 상태가 다른데 어떤 게
   맞나요?" / "git log와 STATE.md 사이에 차이가 있어요".
3. **Manual cross-worktree probe** — "다른 worktree에서 뭘 하고 있나요?" /
   "B는 지금 어느 PR에 작업 중인가요?" If the banner is present and the
   user still has to ask, that counts as friction.
4. **Resume reconciliation** — within 5 turns of `/mccp:resume`, of a PR
   merge, or of `fix-task` application, any (1)/(2)/(3)-class question.

`banner-injected` events do not themselves count as friction; the metric
is whether they prevented friction.

## 3. Cycle-end aggregation

At the end of a multi-worktree dogfood cycle:

```bash
# Producer-side count — banner injections that happened
cat <wtA>/.claude/state/m3-friction-events.jsonl <wtB>/.claude/state/m3-friction-events.jsonl | wc -l

# User-side count — friction events in transcripts (qualitative grep)
# Reviewer reads each worktree's transcript and tallies taxonomy hits.
```

A cycle ships M3 metric == 0 when the user-side aggregate count is 0
across all participating worktrees and all 3 phases of coverage:

- SessionStart + first 5 turns of each worktree
- ≥1 resume / PR merge / fix-task application phase
- pre-cleanup teardown phase

## 4. Dogfood protocol

Minimum: 2 worktrees (PRD lower bound). The active cycle runs in
worktree A, a second Claude session is opened in worktree B, both
sessions remain active during the cycle.

Pass criteria (all five must hold):

1. **Both worktrees banner present** — A + B SessionStart system-reminder
   shows the "Other active mccp sessions" block with the other row.
2. **Aggregate friction count == 0** — taxonomy §2 across all sessions in
   cycle.
3. **Self marker correctness** — `STATUS.md ## Active Sessions` shows the
   `**this worktree**` marker on the row of the local session only.
4. **Phase coverage** — friction taxonomy 0 in: (a) SessionStart + first
   5 turns, (b) one resume / PR merge / fix-task event, (c) cleanup
   phase.
5. **`self_resolution` happy path** — `node plugins/mccp/scripts/derive/cli.js run --json | jq .state.self_resolution`
   returns `resolved` or `resolved-by-cwd`. `env-missing` / `unresolved`
   indicates degraded path (Codex Implement R1 F3 absorption check).

Failure → root cause to `.claude/state/fix-task.md`, amend PR, re-run.

## 5. Retention

v1.4.0-m3 sidecar has **no in-band cap** (Codex Implement R1 F1
absorption — caps caused telemetry loss under concurrent writes). Per-
cycle file size estimate: SessionStart freq × cycle duration × ~150B
per line ≈ <5KB/day. Long-term retention is deferred to a v1.5.x
backlog axis ([codex-findings-backlog.md](../../.claude/plans/codex-findings-backlog.md)
row 3) — an offline `cleanupOldEvents({maxAgeMs})` tool.
