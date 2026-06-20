---
description: "Generate a lean, problem-first PRD WITH THE USER and hand off to /mccp:plan for implementation planning."
argument-hint: "[product/feature idea] (blank = start with questions)"
---

# PRD Command (mccp)

> If I disappear silently, run `/mccp:trace` or check `.claude/state/hook-trace/<session_id>/`

Produces a **Product Requirements Document** — the requirements-phase artifact of the SDLC. Captures *what* must be true for success and *why*, and stops before *how*. Implementation decomposition is delegated to `/mccp:plan`.

**Input**: `$ARGUMENTS`

---

## Phase 0 — CO-CREATION REQUIRED (Autonomy Contract Exception)

This is the **only mccp command where the user MUST answer questions before the artifact is written**. PRDs cannot be produced by the assistant alone — they encode shared understanding of the problem, user, and success criteria. A PRD written without the user is a hallucination wearing PRD costume.

**Mandatory rules during this command — these override the global "no inter-step confirmation" rule:**

1. **Each phase below ends with a question set.** WAIT for the user's answer before continuing. Do NOT auto-answer on the user's behalf.
2. **If the user is silent**, do not invent answers. End the response with the question still open.
3. **If the user types "skip"** for a specific question, record `Assumption — needs validation via {method}` for that field. "skip" applies to one question, not to the whole PRD.
4. **If the user types "you decide"** or similar, push back once: "PRDs need your input on at least Problem, Users, and Hypothesis. Could you give a one-line answer for each?" Only after a second refusal, write the PRD with `Assumption` markers on those fields and clearly flag the PRD status as `DRAFT — USER INPUT MISSING`.
5. **Never write the `.prd.md` file** if Problem, Users, and Hypothesis are all `Assumption`. That's not a PRD.

The Codex auto-invocation, receipt-write automation, and forbidden-confirmation rules from `${CLAUDE_PLUGIN_ROOT}/docs/gate-design.md` §0 **do NOT apply** to this command, because no Codex review and no receipt are written at the PRD stage. Receipts begin at `/mccp:plan`.

---

## Scope of this command

| This command does | This command does NOT do |
|---|---|
| Frame the problem and users (with the user) | Design the architecture |
| Capture success criteria and scope (with the user) | Pick files or write patterns |
| List open questions and risks | Enumerate implementation tasks |
| Write `.claude/prds/{name}.prd.md` | Produce an implementation plan — that's `/mccp:plan` |

If you find yourself writing implementation detail, stop and cut it. It belongs in `/mccp:plan`.

**Anti-fluff rule**: When information is missing, write `TBD — needs validation via {method}`. Never invent plausible-sounding requirements.

## Phase Map

| # | Phase | Purpose |
|---|---|---|
| 0 | CO-CREATION CONTRACT | Enforce user-in-the-loop rules (above) |
| 1 | FRAME | Restate the idea + ask who/what/why questions |
| 2 | GROUND | Ask for evidence — the most load-bearing input |
| 2.5 | EXTERNAL_RESEARCH | (v1.4.0 axis A, M1-experimental) Detect evidence gaps + cooperatively guide `/deep-research` |
| 3 | DECIDE | Hypothesis, MVP, out-of-scope, open questions |
| 4 | GENERATE & HAND OFF | Write the PRD, report, hand off to `/mccp:plan` |

---

## Phase 1 — FRAME

If `$ARGUMENTS` is empty, ask:

> What do you want to build? One or two sentences.

If provided, restate in one sentence and ask:

> I understand: *{restated}*. Correct, or should I adjust?

Then ask the framing questions in a single set:

> 1. **Who** has this problem? (specific role or segment)
> 2. **What** is the observable pain? (describe behavior, not assumed needs)
> 3. **Why** can't they solve it with what exists today?
> 4. **Why now?** — what changed that makes this worth doing?

**WAIT for the user.** Do not proceed without answers (or explicit "skip").

## Phase 2 — GROUND

Ask for evidence. This is the shortest phase and the most load-bearing:

> What evidence do you have that this problem is real and worth solving? (user quotes, support tickets, metrics, observed behavior, failed workarounds — anything concrete)

If the user has none, record the PRD's Evidence section as `Assumption — needs validation via {user research | analytics | prototype}`. This keeps the PRD honest.

**WAIT for the user.**

## Phase 2.5 — EXTERNAL_RESEARCH (v1.4.0 axis A, M1-experimental)

> Cooperative guide for Anthropic native `/deep-research`. Triggered only when (a) the PRD body has an evidence gap AND (b) research-trigger keywords are present AND (c) `/deep-research` availability is env-confirmed. Otherwise: silent skip — phantom 안내 금지.

After the user's Phase 2 evidence response, capture the in-memory PRD body draft (the bullets/markers you've collected so far for the `## Evidence` and `## Problem` sections) into a tempfile, then pipe it to `deep-research-detect.js`. If the PRD has not yet been written to disk, `--stdin` is the first-class entry; `--plan` is the disk-backed fallback.

```bash
# In-memory PRD body draft → tempfile → stdin pipe
BODY_TMP=$(mktemp)
cat > "$BODY_TMP" <<'BODYEOF'
<assembled PRD body draft — Problem + Evidence sections at minimum>
BODYEOF
DETECT=$(cat "$BODY_TMP" | node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/deep-research-detect.js" detect \
  --mode prd --stdin --json)
rm -f "$BODY_TMP"

AVAIL=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.availability||"unknown")}catch{process.stdout.write("unknown")}')
RSIG=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.research_signal?"1":"0")}catch{process.stdout.write("0")}')
```

### Branch matrix (2-axis)

| `AVAIL` | `RSIG` | Action |
|---|---|---|
| `available` | `1` | Emit guide prompt (below). WAIT for user response. |
| `available` | `0` | Silent skip — keyword absent or evidence is rich. No section written. |
| `missing` | * | Silent skip — `/deep-research` confirmed unavailable. |
| `unknown` | * | Silent skip — default state; phantom 안내 금지. |

### Guide prompt (`available` + `1` only)

Emit verbatim:

```
외부 조사가 도움될 수 있어 보입니다. 다음 turn에서 '/deep-research <조사 질문>'을 실행해 주세요. 결과가 준비되면 다음 응답 grammar 중 하나로 답해 주세요 — 다른 토큰은 무시되고 prompt가 다시 출력됩니다.

  paste:<조사 결과 본문 전체>            — PRD `## References` 섹션에 inject
  skip-research:<사유>                   — 섹션 미생성 + 보고에 skip 신호
  failed-research:<사유>                 — `## References`에 attempted-but-failed audit 본문 + 보고에 신호

(Phase 0의 'skip' / 'you decide' 토큰과 다릅니다. 본 grammar는 Phase 2.5 전용입니다.)
```

**WAIT for the user.** If the response token does not start with `paste:`, `skip-research:`, or `failed-research:`, re-emit the prompt — do not auto-answer.

### Response handling (relayed to Phase 4 GENERATE)

Stash the response shape + payload for Phase 4 inject:

- `paste:<content>` → set `RESEARCH_DECISION=paste` + `RESEARCH_CONTENT="<content>"`.
- `skip-research:<reason>` → set `RESEARCH_DECISION=skip` + `RESEARCH_REASON="<reason>"`.
- `failed-research:<reason>` → set `RESEARCH_DECISION=failed` + `RESEARCH_REASON="<reason>"`.

Phase 4 GENERATE will inject `## References` according to the decision (see §4.0b below).

---

## Phase 3 — DECIDE

Scope and hypothesis in a single set:

> 1. **Hypothesis** — Complete: *We believe **{capability}** will **{solve problem}** for **{users}**. We'll know we're right when **{measurable outcome}**.*
> 2. **MVP** — The minimum needed to test the hypothesis?
> 3. **Out of scope** — What are you explicitly **not** building (even if users ask)?
> 4. **Open questions** — Uncertainties that could change the approach?

**WAIT for responses.**

## Phase 4 — GENERATE & HAND OFF

Only after Phases 1-3 produced concrete (non-`Assumption`) answers for Problem, Users, and Hypothesis: create the directory, write the PRD, and report.

```bash
mkdir -p .claude/prds
```

### 4.0 — impeccable design direction (자동, /mccp:plan-prd 진입 시 MANDATORY, v0.2.6 Milestone 1)

After the PRD is written (path captured as `$PRD_PATH`), pre-flight detection in `prd` mode reads the PRD artifact body for design surface keywords + `## Files to Change` UI extensions + `.claude/design/*.design.plan.md` references:

```bash
DETECT=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/impeccable-detect.js" detect \
  --mode prd \
  --plan "$PRD_PATH" \
  --json)
SKILL_AVAIL=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.skill_available?"1":"0")}catch{process.stdout.write("0")}')
SIGNAL=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.design_signal?"1":"0")}catch{process.stdout.write("0")}')
DETECT_REASON=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.reason||"unknown")}catch{process.stdout.write("parse-error")}')
# v1.3.0 M1 — silent-skip surface. plan-prd writes no receipt, but the loud
# stderr warn makes the SKILL_AVAIL=1 + SIGNAL=0 path observable in PRD-stage
# logs. Downstream /mccp:plan will re-run detection on the PRD-derived plan
# and its receipt forwards the silent-skip flags.
SILENT_SKIP=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.silent_skip?"1":"0")}catch{process.stdout.write("0")}')
SILENT_SKIP_REASON=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.silent_skip_reason||"")}catch{process.stdout.write("")}')
```

Decision tree (v1.3.0 M1 — silent-skip is no longer silent):

| SKILL_AVAIL | SIGNAL | Action |
|---|---|---|
| 0 | * | Append `> impeccable unavailable, skipped (auto-fallback): $DETECT_REASON` under a `## Design Direction` section in the PRD. No receipt is written at PRD stage (plan-prd has no codex gate). |
| 1 | 0 | Emit a loud stderr warn (`[mccp:impeccable] silent-skip reason=$SILENT_SKIP_REASON · PRD declares no design surface (whitelist hit 0)`). plan-prd writes no receipt so no flag is forwarded here; downstream /mccp:plan re-detects on the derived plan and forwards silent-skip flags into its mccp-plan-codex receipt. M1 surfaces silent_skip as informational warning at every gate; M2 will promote to blocking on strict gates after SKILL first-step + critique loop are wired. |
| 1 | 1 | Invoke `Skill(impeccable, "shape <PRD title>")`. Append result under `## Design Direction` in the PRD body. If Skill returns `unknown_skill` / `not found`, fall back to skipped path. |

Loud stderr warn for the SKILL_AVAIL=1 SIGNAL=0 row (M1 Task 3):

```bash
if [ "$SKILL_AVAIL" = "1" ] && [ "$SIGNAL" = "0" ]; then
  echo "[mccp:impeccable] silent-skip reason=$SILENT_SKIP_REASON · PRD declares no design surface (whitelist hit 0)" 1>&2
fi
```

This sub-step writes design direction into the PRD itself — downstream `/mccp:plan` will inherit it via `## Files to Change` and explicit `## Design Direction` section detection (see plan.md Phase 5.0).

### 4.0b — external research inject (v1.4.0 axis A, M1-experimental)

If Phase 2.5 stashed a `RESEARCH_DECISION`, inject the `## References` section into the PRD body. Idempotent — if a `## References` section already exists, replace it in place (mirrors plan.md Phase 4.5 provenance replace pattern).

```bash
case "$RESEARCH_DECISION" in
  paste|failed)
    node -e '
      const fs = require("fs");
      const prdPath = process.argv[1];
      const decision = process.argv[2];
      const payload = process.argv[3];
      const iso = new Date().toISOString();
      let section;
      if (decision === "paste") {
        section = [
          "## References",
          "",
          "<!-- Auto-injected from /deep-research at " + iso + " -->",
          "",
          payload,
          "",
        ].join("\n");
      } else {
        section = [
          "## References",
          "",
          "<!-- /deep-research attempted at " + iso + " -->",
          "",
          "> deep-research attempted but failed: " + payload,
          "",
        ].join("\n");
      }
      let prd = fs.readFileSync(prdPath, "utf8");
      const pat = /(?:^|\n)## References[\s\S]*?(?=\n## |\n?$)/;
      if (pat.test(prd)) {
        prd = prd.replace(pat, "\n" + section);
      } else {
        if (!prd.endsWith("\n")) prd += "\n";
        prd += "\n" + section;
      }
      fs.writeFileSync(prdPath, prd, "utf8");
    ' "$PRD_PATH" "$RESEARCH_DECISION" "${RESEARCH_CONTENT:-$RESEARCH_REASON}"
    ;;
  skip)
    # No section written. Reason carried only in report (§Report to user).
    ;;
esac
```

The node invocation passes the user-pasted body via `process.argv` (no shell expansion of any kind) — safe regardless of `$(...)`, backticks, or quoting characters in the deep-research output. The regex match-and-replace is identical to plan.md Phase 4.5's provenance pattern, so re-running `/mccp:plan-prd` on the same PRD replaces the prior `## References` block in place rather than duplicating it.

When the report block prints, include one line summarizing the external-research outcome:

- `paste` → `External research: pasted into ## References (<N> chars)`
- `skip` → `External research: skipped — <reason>`
- `failed` → `External research: attempted but failed — <reason>`

Downstream `/mccp:plan` will detect the `## References` section, sha256-digest its content, and stamp the result into the plan body as `## External Research Provenance` (see plan.md Phase 4 provenance step) — that is the mechanical chain-of-custody anchor for the external research, riding on the existing `plan_hash` mechanism.

**Output path**: `.claude/prds/{kebab-case-name}.prd.md`

### PRD Template

```markdown
# {Product / Feature Name}

## Problem
{2–3 sentences: who has what problem, and what's the cost of leaving it unsolved?}

## Evidence
- {User quote, data point, or observation}
- {OR: "Assumption — needs validation via {method}"}

## Users
- **Primary**: {role, context, what triggers the need}
- **Not for**: {who this explicitly excludes}

## Hypothesis
We believe **{capability}** will **{solve problem}** for **{users}**.
We'll know we're right when **{measurable outcome}**.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| {primary} | {number} | {method} |

## Scope
**MVP** — {the minimum to test the hypothesis}

**Out of scope**
- {item} — {why deferred}

## Delivery Milestones
<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | {name} | {user-visible change} | pending | — |
| 2 | {name} | {user-visible change} | pending | — |

## Open Questions
- [ ] {question that could change scope or approach}

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on {ISO date}.*
```

### Report to user

```
PRD created: .claude/prds/{name}.prd.md

Problem:    {one line}
Hypothesis: {one line}
MVP:        {one line}

Validation status:
  Problem  {validated | assumption}
  Users    {concrete | generic — refine}
  Metrics  {defined | TBD}

Open questions: {count}

Next step: /mccp:plan .claude/prds/{name}.prd.md
  → /mccp:plan will pick the next pending milestone and produce an implementation plan with the Phase 5 Plan-Codex gate.
```

---

## Integration

- `/mccp:plan <prd-path>` — consume the PRD and produce an implementation plan for the next pending milestone (with mandatory Plan-Codex gate).
- `/mccp:prp-implement <plan-path>` — execute the plan with the Implement-Codex gate.
- `/mccp:pr` — open a PR with the PR-Codex gate, referencing the PRD and plan.

## Success criteria

- **CO_CREATED**: every Phase 1-3 question received a user answer (or explicit `skip` per question). PRDs written entirely from `$ARGUMENTS` without user dialogue are forbidden.
- **PROBLEM_CLEAR**: problem is specific and evidenced (or flagged as assumption).
- **USER_CONCRETE**: primary user is a specific role, not "users".
- **HYPOTHESIS_TESTABLE**: measurable outcome included.
- **SCOPE_BOUNDED**: explicit MVP and explicit out-of-scope.
- **NO_IMPLEMENTATION_DETAIL**: file paths, libraries, or task breakdowns are absent — if they appeared, move them to the `/mccp:plan` step.

## Forbidden in this command

- Writing the `.prd.md` artifact before the user has answered Phase 1-3 questions.
- Auto-filling Problem/Users/Hypothesis with assistant-generated content while the user is silent.
- Invoking Codex / Skill(impeccable) / any review skill — those start at `/mccp:plan`.
- Writing a receipt JSON — PRD stage has no gate.
