# M4 plan re-review — converged at R5

- Plan: `.claude/plans/codex-harness-portability-m4.plan.md`.
- Command body: installed mccp 1.34.4 `commands/plan.md`, resolved by command-reach; review and receipt writer: installed `scripts/lib/plan-codex-runner.js`.
- User superseded the cap=3 stop with repetition until convergence. `MCCP_ROUND_LEDGER=observe` was sealed using the supported CLI. The numeric cap remains 3 for audit, enforcement is observe, and the existing ledger now counts 5. No ledger reset or new decision ID was used.
- R4: divergent, one HIGH finding: strict target equality conflicts with the mandatory evidence commit. Accepted and addressed in DD8.
- R5: **approve / converged**, findings **0**. Raw evidence: `.claude/reviews/codex-harness-portability-m4-plan-r5.json`.
- Receipt: `.claude/receipts/mccp-plan-codex/codex-harness-portability-m4.json`.
- Intent gate: skipped with mechanical proof `no_codex_findings`; no author adjudication or independent arbiter is claimed for zero-finding R5.
- Design step remains skipped with explicit user authorization. Codex plan approval is same-family review, not M4 product acceptance by a Claude reviewer.

## Corrections reviewed

1. R3 F1: DD6 chooses immutable committed input and captures draft plan/design separately. It distinguishes upstream historical evidence from current-target approval and checks dirty/current target state at consumers.
2. R3 F2: DD7 separates reviewed-input identity from final receipt identity, permits only the exact review-section transformation, and specifies same-process implement/PR evidence ownership.
3. R4 F1: DD8 preserves reviewed commit R while verifying an evidence-only descendant H, checks intermediate commits and fixed output roles/digests, and pushes the exact verified H.
4. Local L1: nine already-created targets now read UPDATE; L1 has no violations.

## History and limits

R1–R3 backlog rows and the cap3 review report remain historical. The actual cap3 receipt was copied unchanged to `.claude/reviews/codex-harness-portability-m4-cap3-receipt.json` before replacement. Design corrections are accepted at plan level only; product implementation and regression/live acceptance tests still must be completed. The approved plan was not edited after the R5 runner sealed it; this sibling report carries the final outcome without invalidating its hash.

Run nonce: `ea4ac1d5-33df-4e4d-8812-c5bf4bbd4839`

Plan digest: `sha256:115454476f870021106763eb090c22a05021f58f4049e31e778df4663674f6ee`

Receipt hash: `sha256:867e849bee86614677156be273797078825b5a02914fa6c4a6b7b69eb1870d7e`
