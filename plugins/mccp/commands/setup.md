---
description: "Install mccp's required dependencies (codex plugin + impeccable skill) and run /codex:setup"
argument-hint: "[--dry-run | --skip-codex | --skip-impeccable | --skip-gitignore]"
allowed-tools: Bash(node:*), Bash(claude:*), Bash(npx impeccable:*), Bash(git:*), AskUserQuestion, Skill(codex:setup)
---

# /mccp:setup — install dependencies idempotently

This command brings a fresh checkout into a state where every `/mccp:*` gate
can run. It is **idempotent**: re-running on a fully-configured machine
performs zero installs and exits with a green status table.

**Forbidden behavior**: do not ask the user to "수동으로 ~을 실행하세요" for any
step this command can perform itself. Ask for permission, then run.

Flags (parse from `$ARGUMENTS`):
- `--dry-run` — detection only. Skip every install/AskUserQuestion. Report what
  each Phase *would* do and write nothing.
- `--skip-codex` — do not install or chain codex plugin (Phase 2 + 4 noop).
- `--skip-impeccable` — do not resolve or install the impeccable skill (Phase 3 noop).
- `--skip-gitignore` — do not touch the repository `.gitignore` (Phase 5 noop).

**Flag → shell binding (mandatory).** Phases whose bash reads a flag get it as an
explicitly assigned shell variable, never as a bare `${VAR}` the surrounding prose
merely implies. An unassigned `${DRY_RUN:+--dry-run}` expands to nothing, which
silently turns "detection only" into a real write — the failure direction is the
dangerous one, so the assignment is part of the Phase, not an assumption about it.
Emit this line first in any Phase whose block interpolates a flag, substituting the
values actually parsed from `$ARGUMENTS`:

```bash
DRY_RUN=          # set to 1 if and only if --dry-run was passed, else leave empty
```

---

## Phase 1 — Detect

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/dep-check.js" --json
```

Parse the JSON. Display a small table to the user:

```
mccp dep-check
  codex plugin    : installed (v1.0.4) | missing
  impeccable skill: available (project v3.5.0, impeccable) | ambiguous (2 sources) | missing
  impeccable CLI  : installed (/path)  | missing  [telemetry only — no gate reads this]
  codex disabled  : yes (MCCP_CODEX_DISABLED=1) | no
```

The two impeccable rows answer **different questions** and are expected to
disagree. `impeccable skill` is `checkImpeccable()` — does the name our command
bodies call (`Skill(impeccable, ...)`) resolve to a skill body, and through
which channel. `impeccable CLI` is a PATH probe for a binary named `impeccable`,
which only an npm-global install leaves behind. Only the first has decision
authority: no gate branch and no phase below reads the CLI row (v1.0.0-baseline
F-W1-2 prescribed two honest fields over one ambiguous one). `ambiguous` means
two bare-name bodies were found and the oracle refuses to guess which one opens.

If `--dry-run` was passed, print which Phases 2/3/4 *would* execute, then skip
Phases 2/3/4 and advance to Phase 5. Phase 5 has its own read-only dry-run path
(`--dry-run` on the provisioner writes nothing and reports `addedLines`), so
halting here would leave the most useful part of the plan — what would land in
`.gitignore` — unreported. Nothing in Phases 5/6 installs or writes under
`--dry-run`.

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

## Phase 3 — Resolve the impeccable skill

Skip entirely if `--skip-impeccable` was passed.

### 3.1 — Entry condition: already resolved means ask nothing

Read `checkImpeccable()` from the Phase 1 JSON (`result.impeccable`). **If
`available === true`, skip this entire Phase** — do not call `AskUserQuestion`,
do not install, do not offer to install. Report one line and move on:

```
impeccable skill: already resolved via <source> v<version> as `<invocation>` — nothing to install.
```

This gate reads the **skill resolution**, never the PATH probe. The version
before M2 branched on the CLI row instead, so every user who had installed
impeccable through the plugin, project, or user channel — leaving no
`impeccable` binary on PATH — was asked to install it again on every run.

When `shadowed === true` the answer is still `available`, so this Phase still
skips: two bodies resolving is not a missing dependency. Report the ambiguity in
the same line (`ambiguous (N sources)`); surfacing shadowing as an actionable
problem is M3's axis, not this one.

### 3.2 — Install branch (only when `available === false`)

Use `AskUserQuestion` **once**, with three options:

- Question: `impeccable's design-review skill does not resolve. Install it?`
- Options:
  - `Install impeccable plugin (Recommended)` — the official plugin channel
  - `Install via npx CLI` — the official CLI channel
  - `Skip` — leave it unresolved (consequences in 3.4)

On `Install impeccable plugin`, run the marketplace + install pair. **This form
is measured, not assumed**: `.claude/notes/impeccable-detection-contract-m2.md`
Task 0 (b) confirmed `claude plugin marketplace add` and `claude plugin install`
are real subcommands of the installed `claude` CLI, and confirmed the chain
`pbakaus/impeccable` → marketplace `impeccable` → key `impeccable@impeccable`
from `known_marketplaces.json` + `installed_plugins.json`.

```bash
claude plugin marketplace add pbakaus/impeccable
claude plugin install impeccable@impeccable
```

If the `claude` binary is unavailable in this environment, do **not** invent a
CLI form. Fall back to having the user run the official slash commands
themselves — that is outside what this command can perform, so the "no manual
steps" rule does not apply (README uses the same shape for codex):

```
/plugin marketplace add pbakaus/impeccable
/plugin install impeccable@impeccable
```

On `Install via npx CLI`, run the official CLI installer from the repo root:

```bash
npx impeccable install
```

### 3.3 — After any install, re-check and re-report (mandatory)

Whichever branch ran, re-run the detector and reprint the Phase 1 table so the
user sees the state that now exists rather than the one from before the install:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/dep-check.js" --json
```

Report the refreshed `impeccable skill` row verbatim. Skipping this step leaves
the command reporting stale Phase 1 state as if it were the outcome. If an
install reports an interactive prompt or a permission error, surface the stderr
verbatim and stop — do not retry blindly and do not attempt `sudo`.

### 3.4 — Say what the chosen channel actually buys (both branches)

The plugin channel registers the skill under `<pluginName>:<skillDirName>`, so a
plugin-only install resolves as `impeccable:impeccable`. Every mccp command body
calls the **bare** name — measured at 16 `Skill(impeccable` occurrences across 7
command bodies, with 0 namespaced call sites, and
`plugins/mccp/scripts/lib/tests/impeccable-guard.test.js` asserts the bare form
in every canonical command. So print this, once, after the install:

```
Note: the plugin channel registers this skill as `impeccable:impeccable`, but mccp's
gates call the bare name `Skill(impeccable, ...)`. Until the call sites are rewired,
a plugin-only install still leaves the design gate at unknown_skill → impeccable_skipped.
To make the gate fire today, use the bare-name channel: `npx impeccable install`.
```

Do not soften this into a recommendation to skip the plugin channel — the
operator chose plugin-first deliberately. State the consequence and let the
`impeccable skill` row from 3.3 confirm it. Rewiring the call sites is M3's
work, paired with removing this repo's project-local copy in a single commit.

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

## Phase 5 — Provision .gitignore

Skip if `--skip-gitignore` was passed.

Merge mccp's runtime ignore rules into the target repository's `.gitignore`.
The rules live inside a marker-delimited managed block; every line outside those
markers is left untouched, index and all.

Contract:

- Run `gitignore-provision.js provision --json`. **If it exits non-zero, show the
  stderr as-is and halt setup** — never report `{ok:false}` as success.
- `action:'skip'` (`not-a-git-repo`) is not a failure: report one line and move on
  to Phase 6.
- `noop` → already current. `create` / `append` → report how many lines were added
  (no `.bak` — these paths never rewrite the file). `update` → the canonical block
  moved on and was replaced in place; report the line count and the `.bak` path.
  The managed block is tool-owned and only its marker span is replaced, so every
  line outside it is carried over byte-for-byte and no consent flag gates it —
  otherwise a plugin version bump alone (the version is embedded in the block)
  would leave every existing install on stale rules while setup reported success.
- With `--dry-run`, print `addedLines` and write nothing.
- If already-tracked files are now ignored, list them and **do not untrack them**.
  The provisioner runs that scan itself, against the repository root it resolved,
  and reports it as `pollution` in the JSON. Detection failing is a warning, not a
  halt — it is extra information, not a precondition for provisioning, so
  `pollution.ok === false` never turns a completed write into an error.
- Deleting the managed block by hand is fine; it comes back on the next run.

```bash
# /mccp:setup Phase 5 — provision .gitignore (mccp gitignore-provision)
#
# DRY_RUN is ASSIGNED here, not assumed. Left to an ambient variable it expands
# to empty and `--dry-run` never reaches the provisioner, so a run the user asked
# to be detection-only would write to .gitignore.
DRY_RUN=          # set to 1 if and only if --dry-run was passed
#
# stderr is deliberately NOT redirected. Command stderr already reaches the
# user, so "show the stderr" is satisfied without a temp file — and with no
# temp file there is no undefined path for the error output to vanish into.
PROVISION_JSON=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/gitignore-provision.js" provision --json ${DRY_RUN:+--dry-run})
PROVISION_EXIT=$?
if [ "$PROVISION_EXIT" -ne 0 ]; then
  echo "[MCCP-SETUP-STOP] gitignore provisioning failed (exit=$PROVISION_EXIT). 위 stderr 참조." 1>&2
  exit "$PROVISION_EXIT"
fi
PROVISION_ACTION=$(printf '%s' "$PROVISION_JSON" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).action||"")}catch{process.stdout.write("")}')
if [ -z "$PROVISION_ACTION" ]; then
  echo "[MCCP-SETUP-STOP] provision exited 0 but emitted no parsable action — refusing to report success." 1>&2
  exit 1
fi

case "$PROVISION_ACTION" in
  skip)   echo "[mccp:setup] git 저장소가 아님 — .gitignore 프로비저닝을 건너뜁니다." ;;
  noop)   echo "[mccp:setup] .gitignore 무시 규칙이 이미 최신입니다." ;;
  create|append|update)
    # A dry run reaches this branch with the SAME action a real run would report
    # — that is what makes it a preview — so the action alone cannot tell the two
    # apart. Branch on `dryRun` or this line claims a write that never happened,
    # which is the defect an unassigned ${DRY_RUN:+--dry-run} produced from the
    # other direction.
    PROVISION_DRYRUN=$(printf '%s' "$PROVISION_JSON" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).dryRun?"1":"0")}catch{process.stdout.write("0")}')
    ADDED_LINES=$(printf '%s' "$PROVISION_JSON" | node -e 'try{const a=JSON.parse(require("fs").readFileSync(0,"utf8")).addedLines;process.stdout.write(String(Array.isArray(a)?a.length:0))}catch{process.stdout.write("0")}')
    if [ "$PROVISION_DRYRUN" = "1" ]; then
      # `addedLines` is the whole generated block, which for `update` is a
      # REPLACEMENT — most of those lines already exist and the current block is
      # discarded. Calling that "N lines will be added" overstates the addition
      # and hides the removal, so the two actions get different wording.
      if [ "$PROVISION_ACTION" = "update" ]; then
        echo "[mccp:setup] --dry-run: 기존 managed 블록을 아래 ${ADDED_LINES}줄로 **교체**할 예정입니다. 블록 바깥 줄은 그대로 유지되고, 교체 전 파일은 .bak에 남습니다. 아무것도 쓰지 않았습니다."
      else
        echo "[mccp:setup] --dry-run: .gitignore에 ${ADDED_LINES}줄을 추가할 예정입니다 (action=$PROVISION_ACTION). 아무것도 쓰지 않았습니다."
      fi
      # Print the lines themselves, not just how many. `update` now applies on a
      # normal run, so --dry-run is the only way to see what a run would change
      # before it changes it — a preview that withholds the content is not a
      # preview. Verbose by design and opt-in: the user asked for it.
      printf '%s' "$PROVISION_JSON" | node -e 'try{const a=JSON.parse(require("fs").readFileSync(0,"utf8")).addedLines;if(Array.isArray(a))process.stdout.write(a.map(l=>"    "+l).join("\n")+"\n")}catch{}'
      # No pollution report on a dry run. Nothing became newly ignored, so the
      # provisioner deliberately leaves `pollution` null — reporting that as
      # "could not check" would warn about a scan that was never meant to run.
    else
      # backupPath is non-null only for the `update` block-replace path.
      # create/append are append-only, so there is nothing to back up and the
      # value itself distinguishes the paths — one branch cannot misreport.
      echo "[mccp:setup] .gitignore 갱신됨 (action=$PROVISION_ACTION, ${ADDED_LINES}줄 추가). 백업: $(printf '%s' "$PROVISION_JSON" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).backupPath||"(none — 전체 교체 없음)")}catch{process.stdout.write("(none)")}')"
      # Advise about already-tracked files; never untrack them (UI7).
      #
      # The scan is `git ls-files -i -c --exclude-standard` run BY THE PROVISIONER,
      # against the repository root it resolved. Re-running it here would scope it
      # to the caller's cwd instead: invoked from a subdirectory it lists only that
      # subtree and reports the partial result in the same shape as a clean one.
      # POLLUTED_OK distinguishes "checked, clean" from "could not check" — a failed
      # check must not collapse into "no pollution".
      POLLUTED_OK=$(printf '%s' "$PROVISION_JSON" | node -e 'try{const p=JSON.parse(require("fs").readFileSync(0,"utf8")).pollution;process.stdout.write(p&&p.ok?"1":"0")}catch{process.stdout.write("0")}')
      POLLUTED=$(printf '%s' "$PROVISION_JSON" | node -e 'try{const p=JSON.parse(require("fs").readFileSync(0,"utf8")).pollution;process.stdout.write(p&&p.ok?(p.files||[]).join("\n"):"")}catch{process.stdout.write("")}')
      if [ "$POLLUTED_OK" != "1" ]; then
        echo "[mccp:setup] WARNING: 오염 파일 검사를 수행하지 못했습니다 (pollution.ok=false). 이미 추적 중인 런타임 파일이 있는지는 확인되지 않았습니다 — 프로비저닝 자체는 완료됐습니다." 1>&2
      elif [ -n "$POLLUTED" ]; then
        echo "[mccp:setup] 이미 추적 중인데 이제 무시 대상이 된 파일이 있습니다. 자동으로 untrack하지 않습니다:"
        printf '%s\n' "$POLLUTED"
        echo "  제거하려면 직접: git rm --cached <path>"
      fi
    fi
    ;;
  *)
    # An action outside the closed set is a protocol break, not a quiet success:
    # falling through silently would report a run we cannot describe as done.
    echo "[MCCP-SETUP-STOP] provision reported an unrecognized action '$PROVISION_ACTION'." 1>&2
    exit 1
    ;;
esac
```

The second branch — exit 0 with unparsable stdout — is part of the same
fail-closed rule: success is not "did not exit non-zero", it is "success was
confirmed".

---

## Phase 6 — Final report

Re-run `dep-check --json` once more and present the final table. Then tell the
user what state the gates are in:

- All green → `/mccp:plan`, `/mccp:prp-implement`, `/mccp:pr` run with full
  Codex review.
- `codex_disabled=yes` → gates run, Codex calls are skipped, receipts carry
  `codex_skipped: true` with `reason: 'codex_disabled'`.
- codex missing AND not disabled → gates run, Codex calls auto-fallback per
  call (slower, noisier — `/mccp:setup` again or set
  `MCCP_CODEX_DISABLED=1` to silence).
- impeccable skill unresolved → the design gate records `impeccable_skipped`, and the
  gates then diverge: `/mccp:plan` is **lenient** and passes with a warning, while
  `/mccp:prp-implement` and `/mccp:pr` are **strict** and block on that field
  (`scripts/receipt/validate-cmd.js`). The audited escape is
  `MCCP_FORCE_PR_WITHOUT_IMPECCABLE="<substantive reason>"` (`pr.md` Phase 0.1).
  This plugin ships 22 commands and an `impeccable` command is not among them, so the
  wording that stood here described a refusal by a command that does not exist — and
  in doing so hid the two blocks that really happen.

End with a one-line `Next:` suggestion (e.g.
`Next: /mccp:plan <feature>` if all green; `Next: !codex login` if Phase 4
asked for it).
