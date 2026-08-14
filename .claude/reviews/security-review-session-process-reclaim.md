# Security Review — session-process-reclaim (v1.24.0)

- **Date**: 2026-08-14
- **Reviewer**: `mccp:security-reviewer` subagent (Claude family)
- **Scope**: `git diff 3eabab2...HEAD`, source files only
- **Base**: `3eabab20227117618c8686a962c52903b4c14a69`
- **Head**: `52a5f8b` (`test: stop guessing ports in the session-process dashboard tests`)
- **Verdict**: **PASS** — 0 CRITICAL, 0 HIGH, 0 MEDIUM. Residuals LOW and already documented.

## Why this review exists

The `mccp-implement-codex` receipt for this decision carried
`meta.security_skipped=true` with this skip reason:

> session harness instruction forbids Agent/Task invocation without an explicit
> user request; fail-closed fallback taken per gate contract

That was the *only* reason for the skip. The operator supplied an explicit
request on 2026-08-14, which removes it. This file is the resulting attestation.

## Files reviewed

| File | Role |
|---|---|
| `plugins/mccp/scripts/lib/session-processes.js` | registry, ownership adjudication, identity probe, reclaim |
| `plugins/mccp/scripts/hooks/session-end-marker.js` | the only site that calls process kill |
| `plugins/mccp/scripts/hooks/session-start-trace-injector.js` | orphan reporting (must not kill) |
| `plugins/mccp/scripts/state/session-spawner.js` | win32 handoff |
| `plugins/mccp/scripts/lib/dashboard-server.js` | self-registration + reuse |
| `plugins/mccp/scripts/lib/plan-codex-runner.js` | lock integration |

## Axis results

### 1. PID ownership / mis-kill — PASS

No mis-kill path found. Both axes close:

- **Process identity (§D15)**: full absolute path via `isExecutedScript()`, not
  `basename`; win32/POSIX separator normalization; node-interpreter token
  required before the script token; platform-specific time tolerance (500ms
  win32 / 1500ms POSIX) with **upward-only** env override.
- **Session identity**: cross-host blocks with a fail-closed "live" assumption;
  cross-session exact match; cross-repo via `canonicalPath()` realpath
  resolution; sibling reuse guarded by `in_use_by_live_session`.

### 2. Path traversal / registry-root escape — PASS

The escape found in an earlier round is sealed, and the fix is complete rather
than point-patched. Registry root is checked **both** pre-mkdir and post-mkdir
(`realpathNearest`). Containment is re-checked at every mutating site:
`register`, `reclaim`, `unregister`, the orphan scan, and the sibling sweep.
All four unlink sites are guarded. Verified on win32 with directory junctions.

### 3. Command injection in the identity probe — PASS

- **win32 PowerShell**: PID is validated `Number.isInteger(pid) && pid > 0`
  before interpolation, so the interpolated value can only be decimal digits.
- **POSIX `ps`**: PID passed in an argument array, never through a shell.
- Probe output is parsed conservatively; the tokenizer is quote-aware.

### 4. File permissions / TOCTOU — PASS with documented residual

`0o700` / `0o600` are applied at creation only; existing directories are not
re-`chmod`ed. TOCTOU windows are narrowed by per-record `dirStillContained()`
re-checks before every write and unlink, and the failure direction is
"touch nothing". The residual synchronized-swap window remains, as §D11 states.

### 5. Error handling — PASS

Every failure path is fail-closed or fail-loud, never fail-open:
`record_invalid`, `identity_unverifiable`, `sibling_evidence_unreadable`
(with `incomplete:true`), path escape → `complete:false`, budget exceeded →
`incomplete:true`. The hook consumes the return value and surfaces
`complete:false` / `unreclaimed` / `writeFailures` on stderr.

### 6. Environment controls — PASS

`MCCP_RECLAIM_BUDGET_MS` clamped to max; `MCCP_RECLAIM_IDENTITY_TOLERANCE_MS`
upward-only; `MCCP_RECLAIM_OUTLIVES` boolean, default false.

## Residuals (documented, not exploitable)

1. win32 file-permission tightening applies at creation only.
2. PID start-time tolerance window (500-1500ms platform-specific).
3. Millisecond TOCTOU between the path check and the syscall (§D11).

These match the residuals the plan and report already declare. This review adds
no new open item.

## Limits of this attestation — read before relying on it

- The reviewer is **Claude-family**, the same model family that wrote the code.
  This is a security attestation, **not** cross-model corroboration. It does not
  substitute for the Codex axis.
- It reviewed the **diff**, not the runtime. §D11 and §D15's bounded mis-kill
  windows are not unit-testable and were not empirically exercised here.
- It does **not** speak to santa-loop convergence. At the time of this review
  santa-loop stood at round 6 with Reviewer B FAILing on 2 criticals, and the
  three fixes applied after that round (17, 18, 19) had not been reviewed by
  anyone. That gap is a separate axis and remains open.
