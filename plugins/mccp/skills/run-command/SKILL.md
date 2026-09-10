---
name: run-command
description: Run an mccp gate-pipeline command by name on a harness that has no mccp slash commands. Resolves the command body through a verifying CLI and follows it verbatim. Use when the user asks for an mccp workflow step and no /mccp: command is available in this session.
---

# Run an mccp command

This harness has no `/mccp:` slash commands, so the command bodies are reached by
path instead. Follow the four steps in order. Do not skip step 1.

## 1. Do not judge the harness yourself

It is tempting to check whether `CLAUDE_PLUGIN_ROOT` is set and stop if it is.
**Do not.** That predicate is wrong whenever an operator has designated this
session explicitly — both names can be populated at once, and the shared oracle
resolves that combination in favour of the explicit designation. A second,
simpler predicate here would disagree with it and end every run early.

The resolver in step 2 already makes this call, and step 3 tells you what to do
with its answer. Go there.

## 2. Ask the resolver where the command body is

The harness told you the directory this file is in. The resolver sits at a fixed
offset from it:

```
<directory of this SKILL.md>/../../scripts/lib/command-reach.js
```

Run it with the name the user asked for:

```bash
node "<that path>" resolve <name> --json
```

**Do not build the command path yourself, and do not guess either path.** If the
harness did not tell you this file's directory, stop and say so — a guessed root
is the failure mode this whole step exists to remove.

## 3. Obey the exit code

- **exit 0** — the resolver verified everything: the name is a real installed
  command, the body is a regular file, and it resolves inside the plugin root.
  Its `commandPath` is the only path you may open.
- **non-zero** — stop and report the `reason` verbatim. Do not retry with a
  different spelling, do not search the filesystem, do not open anything.

The reasons are distinct on purpose:

- a harness reason means this session has the real slash commands — tell the user
  to run the `/mccp:` command it names, and stop;
- `unknown-command` means that name is not installed;
- an ambiguity reason means more than one copy is installed and the resolver
  refuses to choose — that is for the operator to settle, not for you.

## 4. Read the body and carry it out

Read the file at `commandPath` and follow its instructions exactly as written, as
if the user had invoked it directly. Where the body refers to `$ARGUMENTS`, use
the arguments the user gave after the command name.

Two things that body will assume, which are not true here:

- It may call tools this harness does not have. When you reach one, say which
  tool is missing and stop at that step rather than improvising a substitute.
- It may reference `${CLAUDE_PLUGIN_ROOT}`. Use the `root` the resolver returned.

Report which command you ran and where its body came from, so the user can tell a
real run from a failed resolution.
