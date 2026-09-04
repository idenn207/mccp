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
  install skew    : current (running v1.34.4) | BEHIND by N commit(s) (running v1.33.6) | DIVERGED (…) | unknown (<reason>)
```

The two impeccable rows answer **different questions** and are expected to
disagree. `impeccable skill` is `checkImpeccable()` — does the name our command
bodies call resolve to a skill body, and through which channel. Since v1.31.3
that name is not hardcoded: each design gate reads the resolved invocation from
this same oracle, so the channel reported here is the channel the gates use. `impeccable CLI` is a PATH probe for a binary named `impeccable`,
which only an npm-global install leaves behind. Only the first has decision
authority: no gate branch and no phase below reads the CLI row (v1.0.0-baseline
F-W1-2 prescribed two honest fields over one ambiguous one). `ambiguous` means
two bare-name bodies were found and the oracle refuses to guess which one opens.

The `install skew` row (review-record-linkage M5) answers a different question
from every row above it: **which mccp build is actually executing**. It is
commit *reachability* — is the installed build's `gitCommitSha` an ancestor of
this worktree's HEAD — not a version-string compare, because since CLAUDE.md
§3.7 stopped branches from declaring `plugin.json` versions, two equal numbers
over different content is the normal state and the number cannot answer it.

`BEHIND`/`DIVERGED` is **not an error and blocks nothing** — since
`marketplace.json` pinned the plugin source to `ref: release`, a user cache that
trails main is the permanent default, not an accident. It matters when you are
developing mccp itself: the command bodies your gates execute come from the
installed build, so an in-flight branch's changes are not the ones running. The
`[plugin-dir override]` suffix means `CLAUDE_PLUGIN_ROOT` points outside the
plugin cache, so the row judges that directory's HEAD instead — see
[docs/dogfood-install.md](../../../docs/dogfood-install.md). `unknown (<reason>)`
carries a closed reason enum (`git_failed`, `not_a_repo`, `registry_unreadable`,
`sha_absent`, `sha_malformed`, `override_unjudged`, `oracle_unavailable`); it
never folds to `current`, because a diagnostic that reports "fine" when it could
not judge switches itself off exactly when it stops working.

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
the same line (`ambiguous (N sources)`). Phase 3.5 below owns what to do about
it -- and its answer for the shadowed case is to show the paths and stop, because
`impeccable-cleanup` refuses every source when no winner is established.

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
plugin-only install resolves as `impeccable:impeccable`. **Since v1.31.3 the mccp
command bodies no longer hardcode a call form**: each design gate reads the
resolved invocation out of `impeccable-detect.js` and prints it as one
`[mccp:impeccable] call-form:` line, which is what the gate then invokes. Every
official channel therefore fires the design gate, and no channel needs an env
override to do it (UI1).

So print this, once, after the install:

```
Note: the plugin channel registers this skill as `impeccable:impeccable` rather than
the bare `impeccable`. mccp's gates read the resolved name at run time, so both forms
fire the design gate — the `impeccable skill` row above shows which body opens.
```

Do not turn this into a recommendation for one channel over another. All four
channels are supported and none is deprecated (UI2); the `impeccable skill` row
from 3.3 is what tells the operator which body their install actually opens.


### 3.5 — Report the other copies, and offer cleanup only when it is real

Runs on every invocation, install branch or not. It reads the SAME dep-check
result Phase 1 already produced -- no second probe.

Ask the oracle what may be removed. This command never decides that itself:
the rejection rules are code, and a command body that reasoned about paths
would be a second, weaker copy of them.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/impeccable-cleanup.js" plan --json
```

Branch on the JSON, not on impressions:

| State | What to show |
|---|---|
| `shadowed === true` | Print every row in `skipped` with its path. Say plainly that two bodies answer the same name and mccp does not know which one opens. **Show no removal option.** Leave the choice with the user. |
| `removable.length > 0` | Print all sources, mark which one opens, then `AskUserQuestion` **once** (below). |
| `removable.length === 0` and `skipped.length > 0` | Print the rows and say why nothing is offered -- see the note below. **Show no removal option.** |
| neither | Say nothing. One resolved copy is not a finding. |

The `shadowed` row shows no removal option because `impeccable-cleanup` rule (6)
would refuse it anyway: with no winner, "never delete the winner" cannot be
evaluated, so every source is refused. Offering the action here would be
proposing something the oracle is built to reject.

**Why `removable` is always empty today, and what to say instead.** A bare
source always wins, so a bare copy is either the winner (rule 1 protects it) or
one of two bare copies (rule 6 refuses both). What is left eclipsed is a
`plugin` row, and rule 2 keeps those out: plugin removal is
`claude plugin uninstall`'s job, and deleting a cache directory behind the
registry leaves `installed_plugins.json` pointing at nothing. The one
configuration that used to escape all three -- `MCCP_IMPECCABLE_SKILL=available`,
under which every real copy is eclipsed because the winner is the override
itself -- is refused by rule 7: that winner names no body on disk, so "never
delete the winner" cannot be evaluated against it. So this Phase reports and
does not act, in every configuration. Say that, with the reason and the
paths -- do not soften it into "nothing to do", and do not offer a removal the
next command would refuse:

```
impeccable resolves via <source> v<version> as `<invocation>`.
<N> other cop(y|ies) are installed and are NOT opened:
  - <source> v<version>  <path>
mccp will not remove these: a plugin copy is removed with `claude plugin uninstall`,
and the copy that opens is never deleted. Remove one by hand if you want only one left.
```

When `removable.length > 0`, use `AskUserQuestion` **once**:

- Question: `<N> eclipsed impeccable cop(y|ies) found. Remove?`
- Options:
  - `Keep both (Recommended)` -- change nothing
  - `Remove the eclipsed copy` -- run the apply command below
  - `Show paths only` -- print the paths and stop

On `Remove the eclipsed copy`, for the chosen row's `source`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/impeccable-cleanup.js" apply \
  --source <project|user> --confirm --json
```

Under `--dry-run` (the flag this command was invoked with), call `plan` only and
never `apply` -- in either branch.

The apply step re-derives every check from a fresh resolution; it does not trust
the plan output above. If it exits non-zero, surface `reason` and `message`
verbatim and stop. Do not retry, do not fall back to `rm`, and do not commit --
a tracked copy is left staged on purpose so the user can review and revert it.

Then re-run the detector and reprint the `impeccable skill` row, exactly as 3.3
requires after an install:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/dep-check.js"
```

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
- `install_skew.state` is `behind`/`diverged` → everything above still holds,
  but the command bodies being executed are the **installed** build's, not this
  checkout's. Nothing is blocked. If you are developing mccp and need an
  in-flight branch to actually run, use `claude --plugin-dir <worktree>/plugins/mccp`
  ([docs/dogfood-install.md](../../../docs/dogfood-install.md)) — never overwrite
  the version-keyed cache directory, which would make the registry's `version`
  and `gitCommitSha` disagree with what is on disk.
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
