---
description: "Generate a lean, problem-first PRD WITH THE USER and hand off to /mccp:plan for implementation planning."
argument-hint: "[product/feature idea] (blank = start with questions)"
---

# PRD Command (mccp)

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
