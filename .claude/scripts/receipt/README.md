# mccp-receipt

Structured JSON receipts + SHA-256 hash validator for mccp `/mccp:*` command gates.
Provides the mechanical-enforcement layer that backs the autonomous gate workflow
defined in each command body and described in
`${CLAUDE_PLUGIN_ROOT}/docs/gate-design.md`.

## What it does

1. **Before** a `/mccp:*` command runs, a plugin hook checks that prior-phase receipts
   exist with matching subject hashes. If not: **blocked**.
2. **When** a gate completes, the command body auto-writes a receipt via
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js write …`. The receipt captures the
   plan/design markdown hash, git base/head SHAs, findings, resolution, and a signed
   `subject_hash` + `receipt_hash`.
3. **Between** gates, if the plan file body changes, the next `/mccp:*` notices the hash
   mismatch and refuses to proceed — the prior receipt is stale. Operational edits
   (`status:` frontmatter, `- [ ]` → `- [x]` checkboxes, table status cells) are
   normalized away and do not invalidate prior receipts. The structural-hash
   normalization applies to files matching `.claude/plans/*.plan.md`.

## File layout

```
plugins/mccp/scripts/receipt/
├── cli.js                ← entry point, dispatches subcommands
├── aliases.js            ← /mccp:* → required preceding gates (mccp alias matrix)
├── schema.js             ← receipt JSON schema + validator
├── hash.js               ← plan-aware markdown hash + git utilities
├── jcs.js                ← RFC 8785 JSON Canonicalization (subject_hash input)
├── store.js              ← read/write receipt files under <repo>/.claude/receipts/
├── write.js              ← `write` subcommand: build, sign, persist a receipt
├── validate-cmd.js       ← `validate` subcommand + hook helper
├── preflight.js          ← `preflight` subcommand (used by hooks for block decisions)
├── status.js             ← `status` subcommand: list all receipts in the repo
├── package.json          ← node `--test` runner config (mccp-receipt package)
└── tests/                ← 76 unit tests (run with `node --test tests/`)

plugins/mccp/scripts/hooks/
├── receipt-prompt.js     ← UserPromptExpansion gate (^mccp:.*)
└── receipt-skill.js      ← PreToolUse Skill gate (mccp:* skill name)

plugins/mccp/commands/
├── receipt-write.md      ← /mccp:receipt-write
├── receipt-validate.md   ← /mccp:receipt-validate
└── receipt-status.md     ← /mccp:receipt-status
```

## Storage

Receipts live in the working tree at:

```
<repo>/.claude/receipts/<gate_id>/<decision_id>.json
```

`<gate_id>` is one of `mccp-plan-codex` / `mccp-implement-codex` / `mccp-pr-codex` /
`code-reviewer` / `security-reviewer`, plus the impeccable-side IDs (`plan-impeccable`,
`implement-impeccable`, `pr-impeccable`) for users who install impeccable separately.

`<decision_id>` is the kebab-case slug shared across the plan → implement → pr chain
for a given feature.

The receipt directory should be gitignored by default (or committed if you want the
gate history reviewable in PRs — your call).

## Receipt fields

| Field | Purpose |
|---|---|
| `schema_version` | Always `v1` for this release |
| `gate_id`, `phase`, `decision_id` | Identity of the gate run |
| `task_id`, `round` | Codex session reference + round counter (1-10) |
| `plan_hash` | SHA-256 of canonicalized plan markdown — staleness detection |
| `design_doc_hash[]` | Per-file SHA-256 for `--design-doc` inputs |
| `base_sha`, `head_sha` | Git refs at write time |
| `findings[]` | `{severity, area, description}` triples |
| `resolution` | `{converged, rounds, accepted[], rejected[], open_questions[]}` |
| `subject_hash` | RFC 8785 JCS canonical hash of the dedupe key (what hooks check) |
| `receipt_hash` | Full-receipt hash — tamper detection |
| `meta` | `created_at`, `command`, `cwd`, `git_branch`, `skipped`, `skip_reason`, `codex_skipped` |

## CLI

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js <subcommand>
```

Or via the bundled `mccp-receipt` bin if the package is installed:

```bash
mccp-receipt <subcommand>
```

| Subcommand | Purpose |
|---|---|
| `version` / `schema-version` | Print version info |
| `hash-markdown <file>` | Print SHA-256 of canonicalized markdown (debug) |
| `canonicalize-markdown <file>` | Print canonical form (debug) |
| `canonicalize-json [<file>]` | Print RFC 8785 JCS canonical form (debug) |
| `git-refs [<base-ref>]` | Print `{baseSha, headSha, baseRef}` as JSON |
| `write` | Persist a receipt (see `/mccp:receipt-write` command for full flag list) |
| `validate` | Validate the receipt chain for a `/mccp:*` command |
| `preflight` | Used by hooks; same semantics as `validate` with stderr output |
| `status` | List every receipt in the current repo |

## Hooks

The plugin registers two hooks via `plugins/mccp/hooks/hooks.json`:

```jsonc
{
  "hooks": {
    "UserPromptExpansion": [
      { "matcher": "^mccp:.*", "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/hooks/receipt-prompt.js\"" }] }
    ],
    "PreToolUse": [
      { "matcher": "Skill", "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/hooks/receipt-skill.js\"" }] }
    ]
  }
}
```

| Hook | Trigger | Block protocol |
|---|---|---|
| `UserPromptExpansion` (`^mccp:.*`) | User types `/mccp:plan feature-x` directly | stdout JSON `{"decision":"block","reason":"…"}` + exit 0 |
| `PreToolUse(Skill)` filter on `mccp:*` | Claude invokes a `/mccp:*` skill via the Skill tool | exit code 2 + stderr |

Per the Claude Code hooks documentation, typing `/skillname` directly bypasses
`PreToolUse(Skill)`, so `UserPromptExpansion` is required to cover that path. Conversely,
when Claude invokes a `/mccp:*` skill internally, `UserPromptExpansion` does not fire —
`PreToolUse(Skill)` covers that path. Both hooks therefore exist to give complete
coverage of `/mccp:*` invocations regardless of ingress.

## Bypass

`MCCP_SKIP_RECEIPT=1` in the environment bypasses the gate once:

- `write`: receipt is still written but `meta.skipped: true` and
  `meta.skip_reason: "MCCP_SKIP_RECEIPT=1"` are set.
- `validate` / `preflight`: returns ok with `bypassed: true` and logs the bypass.
- Hooks: emit a `[MCCP-RECEIPT-GATE] BYPASS` message and let the command through.

`MCCP_RECEIPT_DEBUG=1` enables verbose debug logging to stderr (hook decisions, validate
results) without changing block behavior.

## Typical flow

```bash
# 1. /mccp:plan feature-x   (hook lets it through — no prior gate required)
#    plan body is written, Codex review injected, receipt auto-written.
#    Equivalent to:
node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js write \
  --gate mccp-plan-codex \
  --decision feature-x \
  --plan .claude/plans/feature-x.plan.md

# 2. /mccp:prp-implement feature-x  (hook validates mccp-plan-codex receipt; passes)
#    Phase 2.5 runs implement-codex gate, writes receipt for that decision.

# 3. /mccp:pr feature-x  (hook requires both mccp-plan-codex AND mccp-implement-codex)
#    PR body written, PR-codex review injected, receipt auto-written.

# 4. /mccp:code-review  (hook requires mccp-pr-codex)
```

## Failure modes

- **Forgot to write a receipt?** The next `/mccp:*` blocks at preflight and tells you
  exactly which gate is missing.
- **Edited the plan after the receipt was written?** The next `/mccp:*` reports
  `STALE mccp-plan-codex: plan file hash differs from receipt`. Either revert, or re-run
  that gate (Codex review again) and write a fresh receipt (use `--auto-round` to bump
  the round counter).
- **Tampered receipt JSON?** The `subject_hash` mismatch is detected and the chain is
  marked stale.

## Design notes

1. **No auto-write from transcript.** Operators write receipts explicitly via the CLI
   or the `/mccp:receipt-write` slash command. Command bodies handle this autonomously
   for the plan / implement gates.
2. **Hook is not a security boundary.** Anyone with shell access can disable the hooks
   via plugin settings or set `MCCP_SKIP_RECEIPT=1`. The goal is **enforcement
   reliability for the cooperating operator**, not anti-tamper.
3. **`command_name` matcher regex syntax** assumes JavaScript regex semantics per the
   docs. Sanity-check after first install by typing any `/mccp:status` and seeing
   whether the hook fires (`MCCP_RECEIPT_DEBUG=1` logs to stderr).
4. **Cross-gate dedupe.** The implement gate skips Codex review if the same decisions
   already converged in the plan gate's review. See
   `${CLAUDE_PLUGIN_ROOT}/docs/gate-design.md` for the rationale.

## Tests

```bash
node --test tests/aliases.test.js tests/schema.test.js \
            tests/hash.test.js tests/jcs.test.js \
            tests/write.test.js tests/preflight.test.js \
            tests/validate-cmd.test.js
```

76 tests cover the alias matrix, schema validation, JCS canonicalization, structural
plan hashing, receipt persistence, preflight block/allow decisions, and the
`MCCP_SKIP_RECEIPT` bypass path.
