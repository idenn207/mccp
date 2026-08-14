---
description: "Install mccp's required dependencies (codex plugin + impeccable CLI) and run /codex:setup"
argument-hint: "[--dry-run | --skip-codex | --skip-impeccable | --skip-gitignore]"
allowed-tools: Bash(node:*), Bash(claude:*), Bash(npm:*), Bash(impeccable:*), Bash(git:*), AskUserQuestion, Skill(codex:setup)
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
- `--skip-impeccable` — do not install impeccable CLI (Phase 3 noop).
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
  impeccable CLI  : installed (/path)  | missing
  codex disabled  : yes (MCCP_CODEX_DISABLED=1) | no
```

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
      echo "[mccp:setup] --dry-run: .gitignore에 ${ADDED_LINES}줄을 추가할 예정입니다 (action=$PROVISION_ACTION). 아무것도 쓰지 않았습니다."
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
- impeccable missing → `/mccp:impeccable` will refuse; other gates unaffected.

End with a one-line `Next:` suggestion (e.g.
`Next: /mccp:plan <feature>` if all green; `Next: !codex login` if Phase 4
asked for it).
