---
description: "Install mccp's required dependencies (codex plugin + impeccable CLI) and run /codex:setup"
argument-hint: "[--dry-run | --skip-codex | --skip-impeccable]"
allowed-tools: Bash(node:*), Bash(claude:*), Bash(npm:*), Bash(impeccable:*), AskUserQuestion, Skill(codex:setup)
---

# /mccp:setup — install dependencies idempotently

This command brings a fresh checkout into a state where every `/mccp:*` gate
can run. It is **idempotent**: re-running on a fully-configured machine
performs zero installs and exits with a green status table.

**Forbidden behavior**: do not ask the user to "수동으로 ~을 실행하세요" for any
step this command can perform itself. Ask for permission, then run.

Flags (parse from `$ARGUMENTS`):
- `--dry-run` — detection only. Skip every install/AskUserQuestion. Print the
  plan and exit.
- `--skip-codex` — do not install or chain codex plugin (Phase 2 + 4 noop).
- `--skip-impeccable` — do not install impeccable CLI (Phase 3 noop).

---

## Phase 1 — Detect

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/dep-check.js" --json
```

Parse the JSON. Display a small table to the user:

```
mccp dep-check
  codex plugin    : installed (v1.0.4) | missing
  impeccable CLI  : installed (/path)  | missing
  codex disabled  : yes (MCCP_CODEX_DISABLED=1) | no
```

If `--dry-run` was passed, also print which Phases 2/3/4 *would* execute and
stop here. Do not advance.

If everything is already installed (and `codex_disabled` is `no`), inform the
user that no action is needed and skip to Phase 5.

---

## Phase 2 — Install codex plugin

Skip entirely if `--skip-codex` was passed.

If `checkCodexPlugin().installed === false`, use `AskUserQuestion` **once**:

- Question: `mccp gates rely on the codex plugin for adversarial review. Install it now?`
- Options:
  - `Install codex plugin (Recommended)` — runs the install
  - `Skip` — leave it missing; gates will auto-fallback to `codex_skipped` receipts

On `Install`:

```bash
claude plugin marketplace add openai/codex-plugin-cc --scope user
claude plugin install codex@openai-codex
```

Then re-run `dep-check --json` and report the new status. If install reports
an interactive EULA / unknown prompt, surface the stderr verbatim and stop —
do not retry blindly.

---

## Phase 3 — Install impeccable CLI

Skip entirely if `--skip-impeccable` was passed.

If `checkImpeccableCli().installed === false`, use `AskUserQuestion` **once**:

- Question: `impeccable is a separate npm CLI (not a Claude plugin). Install globally with npm?`
- Options:
  - `Install impeccable (Recommended)` — runs both steps below
  - `Skip` — leave it missing; /mccp:impeccable will not work

On `Install`:

```bash
npm install -g impeccable
impeccable skills install
```

The second command deploys SKILL files into `~/.claude/skills/`. If
`npm install -g` fails with a permission error, surface the stderr and tell
the user that nvm or a user-local npm prefix is required — do not attempt
`sudo` automatically.

Then re-run `dep-check --json` and report.

---

## Phase 4 — Chain /codex:setup

Skip if `--skip-codex` was passed OR if codex plugin is still missing after
Phase 2 (no point in setup-ing an uninstalled plugin).

Invoke:

```
Skill(codex:setup)
```

If the codex setup output indicates `Codex installed but not authenticated`,
use `AskUserQuestion` **once**:

- Question: `codex needs login but \`codex login\` cannot run inside Claude. Pick one:`
- Options:
  - `Run \`!codex login\` in the next message (Recommended)` — exit so the user can paste the command
  - `Set MCCP_CODEX_DISABLED=1 in ~/.claude/settings.json now` — record a permanent disable
  - `Skip — gates will auto-fallback per call`

On the second option:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/settings-writer.js" set --key MCCP_CODEX_DISABLED --value 1
```

A `.bak` is created automatically. Tell the user where it landed.

---

## Phase 5 — Final report

Re-run `dep-check --json` once more and present the final table. Then tell the
user what state the gates are in:

- All green → `/mccp:plan`, `/mccp:prp-implement`, `/mccp:pr` run with full
  Codex review.
- `codex_disabled=yes` → gates run, Codex calls are skipped, receipts carry
  `codex_skipped: true` with `reason: 'codex_disabled'`.
- codex missing AND not disabled → gates run, Codex calls auto-fallback per
  call (slower, noisier — `/mccp:setup` again or set
  `MCCP_CODEX_DISABLED=1` to silence).
- impeccable missing → `/mccp:impeccable` will refuse; other gates unaffected.

End with a one-line `Next:` suggestion (e.g.
`Next: /mccp:plan <feature>` if all green; `Next: !codex login` if Phase 4
asked for it).
