# Implement-Codex Review — environment-doc-uniformity

> Written here, not into the plan body, on purpose. The sealed `mccp-plan-codex`
> receipt pins `plan_hash=sha256:a3c83fa3…`; injecting a section into
> `.claude/plans/environment-doc-uniformity.plan.md` would change that hash, make the
> plan receipt `stale`, and block this cycle's own `/mccp:pr` (CLAUDE.md §3.11 guard 2).

## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (cap pinned to 1 by `MCCP_REVIEW_SINGLE_PASS=deadline_pressure`)
- 결과: classification `disabled`, exit 0, blocking=false
- 합치 결론: > Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy, first-class skip — v0.3.5).
  Codex never ran, so there is no cross-model verdict to record. `resolution.codex_verdict='skipped'`
  is stamped honestly and cross-gate dedupe at `/mccp:pr` stays fail-closed.
- YAGNI Triage: n/a — Codex produced no findings (never invoked).
- Deferred to backlog: 0
- Open Questions: none
- Codex session 참조: n/a (short-circuited before spawn, durationMs=0)

### Implement-time decisions (2.5.2)

Enumerated for the record; none were adjudicated by Codex because it did not run.
The plan pre-commits every one of these, so no NEW implement-time decision is
introduced:

1. Module layout `env-contract/{value,registry,lint,scan}.js` + `tests/` — plan Files to Change.
2. Export surfaces — fixed verbatim by Validation 0's module contract.
3. `walkSurfaces` as the single file-enumeration owner shared by Validation 0b, 0c and lint L9 — plan Task 5.
4. No new external dependency; `node:test` only, mirroring `plugins/mccp/scripts/lib/tests/toggle-snapshot.test.js`.
5. No concurrency primitive introduced.

### Security Reviewer

Invoked via `Task(subagent_type: security-reviewer)` against the proposed
implementation (read-only; the plan body, not produced code — Phase 3 had not run).
9 findings: CRITICAL 1 / HIGH 2 / MEDIUM 4 / LOW 2.

Per CLAUDE.md §3.14 only CRITICAL and HIGH are absorbed in this cycle; the rest are
appended to `.claude/plans/codex-findings-backlog.md` with the evidence for each
downgrade or rejection. No finding is left unadjudicated, so no `[MCCP-GATE-STOP]`.

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| F1 bypass-flag set lives in a mutable registry, so a 4th member could be added or a member silently downgraded to `bool` | CRITICAL | ACCEPT_NOW (partial) | The reviewer's own remedy — derive the set from `byKind('bypass-flag')` and compare it to a hardcoded 3-name array — is what Validation 0 already specifies, and it is symmetric (4 members fails, 2 members fails). Absorbed the parts that were NOT yet mechanical: the same set-equality assertion in `registry.test.js`, and `Object.freeze` on `ENTRIES` and every entry so no consumer can mutate `kind` at runtime. Residual — a genuinely gate-weakening NEW toggle registered as `bool` — is not name-detectable and is the plan's already-declared Risk row; backlog. |
| F2 module-constant aliasing hides real read sites from lint L9, so the "0 raw comparisons" claim is fail-open | HIGH | ACCEPT_NOW | Correct and the plan only *documented* the gap rather than closing it. A control that misses real call sites is worse than no control because it licenses the claim. L9 now detects three forms, not one: direct `process.env.NAME` comparison, load-time capture (`const X = process.env.NAME` then `X === '1'`), and destructuring (`const { NAME } = process.env`). Alias resolution is per-file and single-hop — not full data-flow — and `lint.js` says so in its header rather than overclaiming. |
| F3 the L8 ordering fixture only proves lexical-screen-first if its absolute path actually EXISTS on disk | HIGH | ACCEPT_NOW | The attack surfaced a real defect in the plan's own example: it names `path.resolve("package.json")`, and **this repo has no `package.json`** (verified in Phase 0). That fixture would resolve to a non-existent path, both orderings would reject it, and the test would be vacuous — precisely the failure the plan warned about. The fixture now uses `__filename` (always absolute, always exists, computed at runtime, no literal in the committed source) and asserts `fs.existsSync` on it first so it cannot go vacuous silently. |
| F4 "unrecognized value falls back to default" is not restrictive for default-ON toggles | MEDIUM | DEFER_TO_BACKLOG + 1-line honesty fix | Downgraded with evidence: today's parsers behave identically (`!== '0'` on garbage is already `true`), so this plan's movement is zero. What was actually wrong was the *claim*, not the behavior — DD1 guarantees "no widening relative to today", not absolute safety. That exact sentence now sits in `value.js` and in the index's 값 규약 section so the document does not overclaim. |
| F5 command-body `require` of the shared parser can fail with MODULE_NOT_FOUND and be swallowed by `|| echo ""` | MEDIUM | DEFER_TO_BACKLOG | Mitigated in-cycle by Validation 0d, which forces the `2> /dev/null` off those blocks so the failure is at least visible. |
| F6 add a Validation 0e that parses the default out of the `evidence` line and compares it to `registry.default` | MEDIUM | REJECT (evidence) | Contradicts a decision the plan already absorbed in the opposite direction (R3 architect HIGH): `evidence` points at a read site, not a default literal, because `process.env.X === '1'` has no default written in code. Requiring 0e makes `status: 'undocumented-default'` structurally unsatisfiable. |
| F7 homoglyph / zero-width toggle names | MEDIUM | subsumed | The registry's structural name invariant is ASCII `^[A-Z][A-Z0-9_]*$`, which makes homoglyphs and zero-width characters unrepresentable. Not a separate check. |
| F8 `polarity` enum not validated | LOW | subsumed | Registry structure test validates every declared field against its enum, `polarity` included. |
| F9 raise Validation 2b's vacuity floor to `anchors > 50` | LOW | REJECT (evidence) | An undefended threshold. Anchor coverage is owned by lint L3 (every index `상세` link must resolve to a file AND an anchor), which is fail-closed and needs no magic number. |

### Design Review

`impeccable-detect.js detect --mode implement` → `skill_available=true`,
`design_signal=false`, `reason=no-signal`, `silent_skip=true`.

Decision-tree row `SKILL_AVAIL=1 / SIGNAL=0 / DESIGN_INTENT_ACTIVE=0` — silent skip.
Loud stderr warn emitted; the receipt carries
`--impeccable-silent-skip --impeccable-silent-skip-reason "no-signal"`.
No routing pass, no critique retry loop, no Phase 2.5.5c grounding capture, and
therefore Phase 3.6 DESIGN FINISH and Phase 3.7 DESIGN GROUNDING VERIFY are both
no-ops this cycle (their gates require the 2.5.5b trigger to have fired).

This is honest rather than convenient: the pre-EXECUTE diff has no rendered surface.
The plan's own Design Critique section reached the same conclusion at plan time —
the only rendering surface in scope is the version string on two renderer files, and
`impeccable-detect` scores that as no-signal.
