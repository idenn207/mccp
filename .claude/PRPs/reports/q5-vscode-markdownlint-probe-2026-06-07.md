# Q5 — VSCode `markdownlint.fixAll` Empirical Probe

**Date**: 2026-06-07
**Plan**: [v0-2-8-pr-workflow-hardening.plan.md](../../plans/v0-2-8-pr-workflow-hardening.plan.md) Task 2.6.2 Action #0 (BLOCKING — F2 + R2-F2 absorption)
**Status**: ❌ **α_status = silent_failure** — implementation must NOT trust `r.status === 0` alone

---

## Environment

| Component | Version |
|---|---|
| OS | Windows 11 Pro 10.0.26200 |
| Shell | Git Bash (MSYS2 / mintty) under PowerShell harness |
| VSCode `code` CLI | 1.123.0 (commit `6a44c352bd24569c417e530095901b649960f9f8`) |
| `markdownlint-cli` (post-state checker) | 0.48.0 via `npx --yes markdownlint-cli` |
| `markdownlint-cli2` (extension internal) | 0.22.1 (markdownlint v0.40.0) |
| davidanson.vscode-markdownlint extension | (assumed active — extension list not enumerated in this probe) |

---

## Fixture

`.claude/PRPs/reports/q5-fixture/probe.md` — 5 known violations:

| Line | Rule | Detail |
|---|---|---|
| 3 | MD009 / no-trailing-spaces | 3 trailing spaces |
| 6 | MD012 / no-multiple-blanks | 2 consecutive blanks |
| 7 | MD012 / no-multiple-blanks | 3 consecutive blanks |
| 10 | MD032 / blanks-around-lists | list paragraph adjacency |
| 14 | MD034 / no-bare-urls | bare https URL |

---

## Pre-state baseline

- **sha256**: `ff17bca9391e8b71c6f4ff5def66e15844784f9f402105cd1241ad63ac8b20c3`
- **Lint exit**: 1
- **Violations**: 5 (matches fixture intent)

---

## α invocation

```bash
code --reuse-window --command markdownlint.fixAll .claude/PRPs/reports/q5-fixture/probe.md
```

- **Exit code**: 0
- **stderr**: `Warning: 'command' is not in the list of known options, but still passed to Electron/Chromium.`
- **Elapsed (CLI exit)**: ~1.4s
- **Wait after exit before post-check**: 5s (give VSCode async command queue time)

---

## Post-state verification

- **sha256**: `ff17bca9391e8b71c6f4ff5def66e15844784f9f402105cd1241ad63ac8b20c3` (**IDENTICAL** to pre-state)
- **Lint exit**: 1
- **Violations**: 5 (**UNCHANGED**)
- **fileChanged**: false
- **sha256Changed**: false
- **lintClean (R4-F3)**: false (`postCount = 5 ≠ 0`)
- **lintStrictlyReduced (R4-F3)**: false (`postCount = 5 not < preCount = 5`)

---

## Classification

**`α_status = silent_failure`** per plan §Task 2.6.2 Action #0 (R2-F2 trap):

> α FAIL (silent — R2-F2 trap): exit 0 + post-state 여전히 5 violations → `α_status=silent_failure`. **이 경우 α path는 production에서 사용 금지** — implement 단계에서 β-only 또는 alternative commandId 모색.

### Root cause

VSCode `code` CLI 1.123.0 emits the stderr warning `'command' is not in the list of known options` — the `--command` flag is not recognized by the CLI's option parser. Electron passthrough accepts the value but the VSCode renderer never receives a `command-from-cli` event, so no `markdownlint.fixAll` is queued in the active window. Exit 0 reflects the CLI process terminating cleanly, NOT the command executing.

### Why this matters

The naive form of the α success check —

```js
if (r.status === 0 && !stderrBad) return /* success */;
```

— passes this dead-α path silently. The plan body's R4-F3 absorption (strict count-based gate) is what catches it:

```js
const lintClean = postLint && postLint.count === 0;
const lintStrictlyReduced = preLint && postLint &&
  preLint.count > 0 && postLint.count < preLint.count;
if (r.status === 0 && !stderrBad && (lintClean || lintStrictlyReduced || noLintBin)) {
  // success
}
// else fall through to β
```

With `lintClean = false` AND `lintStrictlyReduced = false`, the empirical probe is filtered into the fall-through path → β runs.

---

## Implementation decision

α path is retained per Decision 2 (α+β APPROVED 2026-06-06) — it stays as **forward compatibility** for a future VSCode version that wires `--command` correctly. In the current Win11 + VSCode 1.123.0 environment:

- α will always classify as `markdownlint_alpha_failed` with `reason: "lint-not-reduced"` (or `"commandid-not-found"` if the `'command' is not in the list of known options` warning is detected as `stderrBad`).
- β (`npx markdownlint-cli --fix`) is the path that actually fixes the file.
- Silent noop only if both α and β CLIs are missing → telemetry `markdownlint_skipped: { reason: 'no-cli' }`.

### stderr classification refinement

The `stderrBad` regex in the plan body —

```js
const stderrBad = /Command .* not found|Unknown command/i.test(r.stderr || '');
```

— does NOT match the actual VSCode 1.123.0 warning text (`'command' is not in the list of known options`). Implementation should extend the regex:

```js
const stderrBad = /Command .* not found|Unknown command|'command' is not in the list/i.test(r.stderr || '');
```

This lets `markdownlint_alpha_failed.reason = "commandid-not-found"` fire on the first invocation rather than waiting for the count comparison — slightly faster classification, same outcome (fall-through to β).

---

## Acceptance vs plan

| Plan acceptance item | Status |
|---|---|
| `α_status=pass` (lint-clean + sha256 changed) | ❌ NOT achieved (silent_failure) |
| `α_status=silent_failure` (exit 0 + no work) | ✅ Observed — R2-F2 trap empirically reproduced |
| `α_status=explicit_failure` (non-0 OR commandId-not-found stderr) | ⚠ Partial — stderr Warning text not in plan's regex; implementation will extend regex |
| Implementation gate: dead α path forbidden in production | ✅ R4-F3 strict count-based success ensures dead α falls through to β |

**Per plan**: "dead α path로 ship 금지" — interpreted as "α can be present in code, but MUST NOT be relied upon for success in this VSCode version". Implementation respects this by making β the actual fixer; α is best-effort and instrumented.

---

## Next step

Proceed to Task 2.6.2 implementation (`post-edit-format.js` `.md` branch) with:

1. α path retained per plan body (forward compatibility)
2. `stderrBad` regex extended to match VSCode 1.123.0 warning
3. β path is the production lint fixer in current environment
4. Telemetry surfaces α dead-letter status for future debugging
