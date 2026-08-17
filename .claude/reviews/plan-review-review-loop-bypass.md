# Plan Review Panel — review-loop-bypass

**Plan**: `.claude/plans/review-loop-bypass-m1.plan.md` · **Plan version**: `sha256:6f18c14bbcc3d8c3d92e6b7242fd7ae9fdd89cd22c99a888b319bbb56ea4057e`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 2 blocking finding(s): test/HIGH, test/FAIL

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| test | HIGH | Non-converged review_verdict does not block downstream validators through all three gates (plan → implement → pr) | Plan Validation section (line 432-433) specifies validation of only mccp:prp-implement, not mccp:pr. The test for 'divergent review_verdict' only validates the first downstream transition (plan→implement) but not the full chain to the PR gate. No test verifies that a divergent verdict from implement doesn't block the PR validator. Example: Validation line 432 shows 'validate --command mccp:prp-implement' but there is no corresponding 'validate --command mccp:pr' for a divergent verdict receipt. |
| test | MEDIUM | Task 7 'chain 회귀 pin' test covers all downstream validators that consume review_verdict | Task 7 (line 363-365) specifies: '`review_verdict='divergent'`인 `mccp-plan-codex` receipt에 대해 `validateCommand({command:'mccp:prp-implement'})`가 `ok:true`임을 단언한다.' This test only covers the mccp:prp-implement validator. The test does not explicitly specify validating the PR gate's validator against a divergent review_verdict. Since dd1 claims all downstream validators must accept divergent verdicts, but only one validator is tested, if any downstream validator is later modified to reject divergent verdicts, the test will not catch it before production failure. |
| test | MEDIUM | Acceptance criteria verify the full chain works end-to-end with single-pass toggle active through all three gates | Acceptance section (line 456-467) lists items (a)-(d) for '라이브 산출물 4종' but item (c) only validates mccp:prp-implement: 'node plugins/mccp/scripts/receipt/cli.js validate --command mccp:prp-implement'. There is no item validating mccp:pr or showing the full chain execution from plan through implement to pr. Item (d) checks 'L2 라운드 수가 정확히 1' but does not verify the chain proceeded through all three gates. The acceptance commands run /mccp:plan and validate one transition but do not show running /mccp:prp-implement or /mccp:pr to completion. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | Verification of: (1) All cited code patterns exist and match plan claims — verified via grep/read of santa/gate.js:138, plan-review/decide.js:140/150, schema.js:224-238, write.js:492-501/612/771, receipt-convergence.js, validate-cmd.js. (2) L1 boundary invariant held — confirmed L1 logic at decide.js:150-167 returns before bypass logic at proposed L313+. (3) mkSinglePass unique call site — single `if (sp)` branch in proposed Task 2 means present-only fields only appear in bypass path. (4) Codex verdict non-forwarding enforced — forwardCodexVerdict:false literal in mkSinglePass prevents write.js:492-501 throw. (5) Cross-model dedupe unreachable — verified write.js:492 throws on multi-agent+codex_verdict; dedupe.js checks isCrossModelCorroborated which requires CROSS_MODEL_SOURCES=['codex','hybrid'] excluding 'multi-agent'. (6) Schema allows non-converged verdicts — confirmed schema.js:224-238 permits less strict proof for divergent/unavailable. (7) Three-command oracle synchronization — grepped MCCP_GATE_ROUND_CAP in plan.md:1818, prp-implement.md:316, pr.md:511/585; Task 7 includes static test for all three referencing oracle. (8) Acceptance criteria soundness — live execution criterion at line 467 requires "정확히 1" observed L2 rounds; fail-open calculation risk noted but mitigated by measurement requirement. (9) Boundary leaks by asymmetry — DD7 explicitly documents three gates have different oracles (plan has decideReview, implement has none, pr has ship-gate unchanged); not a defect but intentional scope limit. (10) Chain-consistency model — DD8 documents mid-chain toggle changes use loud stderr warning not fail-closed block; accepts friction trade-off per UI12 opt-in design. No structural defect found. |
| security | pass | **Trust boundary analysis (cross-gate consistency)**: Tested whether environment variable toggle state can be changed mid-chain. Plan explicitly accepts this risk (DD8): loud stderr warning on mismatch, each receipt stamps its toggle state, no hard block. This is an operational risk, not a security defect — the audit trail makes it observable post-facto, and the bypass intent is operator-controlled, not ambient. **Verdict escaping to downstream gates**: Verified that divergent-verdict plan receipts (produced when L2 is bypassed) don't cause issues downstream. Confirmed via code inspection that `validate-cmd.js` does not consume `review_verdict` field; chain-check succeeds even with divergent review_verdict. Plan mitigates future breakage via regression pin test (Task 7). **Cross-gate dedupe bypass**: The critical claim is that even if both plan-codex and implement-codex are bypassed, dedupe cannot skip PR-codex because `review_source='multi-agent'` is not in `CROSS_MODEL_SOURCES` (`review-verdict.js:42`). Verified the dedupe logic at `review-verdict.js:245-274` — `isCrossModelCorroborated` returns false when source is 'multi-agent' (line 248: `if (CROSS_MODEL_SOURCES.indexOf(eff.source) === -1) return false`). Dual-model review is preserved. **Receipt proof forgery**: Verified that schema (`write.js:458-469`) enforces all-or-nothing stamping of review_* triple — proof cannot be null when verdict is set, else write fails with REVIEW_STAMP_INVALID. Unset proof = no approval sealed, correct fail-closed behavior. **Codex verdict forwarding**: Verified existing plan.md code (line 2211, 2226) reads `forwardCodexVerdict` from decision.json and conditionally adds `--codex-verdict` flag. Plan's code sketch hard-codes `forwardCodexVerdict: false` in `mkSinglePass`, preventing `write.js:492-501` throw ("contradictory receipt: review_source='multi-agent' + codex_verdict"). **L1 mechanical inviolability**: Verified code-structure boundary — bypass code (`if (quorum.passed !== true)`) comes after L1 branch (plan sketch line 307-312: "hoist 목적지는... L1 분기는 :150-167이라 hoist 후에도 여전히 앞선다"). Early returns from L1 failures bypass the entire `if` block. Test (Task 7) asserts "L1 divergent → exit 12 even with toggle on." **Working vs. ship receipt protection**: Plan acknowledges (CLAUDE.md §3.12) that working receipts (plan/implement) are mutable, ship receipts are git-tracked. Bypass reason is only sensiti​ve at commit time (ship receipt). No escalation path from tampering working receipts. **Enum value validation**: Plan requires bypass reason to be one of 3 enum values; schema (Task 6) validates presence/membership. No case where partial or garbage value can slip through — absent field = no bypass applied, invalid enum = schema reject. **Shell escaping**: Enum values (`scope_too_small\|deadline_pressure\|deferred_to_prd_completion`) contain no shell metacharacters. Task 8 shell condition uses `[ -n "$VAR" ]` to test non-empty value, not key presence, avoiding logical gaps. |
| test | fail | I attacked the plan's core claim (DD1) that "비수렴 verdict도 chain을 진행시킨다" (non-converged verdicts do not block the chain). I searched for tests that would catch if any downstream validator begins rejecting non-converged review_verdict values. I found: (1) Unit tests in Task 7 that validate only mccp:prp-implement, not all downstream gates; (2) Validation commands that validate only the first transition (plan→implement), not the full chain through PR; (3) Acceptance criteria that claim to test full-path execution but only show validating one validator, not running all three gates end-to-end. The existing test pattern (e2e-dogfood.test.js) shows how to test full chains through all three gates, but the plan does not specify such a test for the divergent-verdict case. Gap: if someone changes the PR validator to check review_verdict and reject non-converged, no specified test would fail before the mistake reached production. |
| invariant | pass | Attacked: (1) receipt anchoring — verified `buildAuditProof` returns honest divergent verdict + quorum.passed=false + no masking as converged. (2) Fail-open drift — traced exemption code placement to single `quorum.passed !== true` branch after L1/L2/DD13 checks; L1 failures route to line 162 before exemption. (3) Skip predicates — confirmed validate-cmd does not check review_verdict (grep 0 hits in validate-cmd.js); chain proceeds because gates ignore this field, not because gates are weakened. (4) Digest coverage — verified schema.js:224-238 validates non-converged proofs require only dispatch_evidence repo-relative paths, not full structural invariant. (5) Rollback — toggle OFF reverts to `decision.block=true` (normal path), toggle ON allows exemption only when quorum failed. (6) Receipt write barriers — write.js:458-469 enforces all-or-nothing review_* stamping; write.js:492-501 rejects codex_verdict when review_source='multi-agent'; plan's `forwardCodexVerdict=false` prevents injection. (7) Weak premise hardening — plan acknowledges validate-cmd non-consumption is grep-based; Task 7 adds regression pin test to fail if someone adds blocking logic. Could not find evidence that plan erodes invariants; all bypass paths end in receipt honesty and schema/write-time validation, not gate silence. |

## Measurement

<!-- Written by plan-review/cli.js record on EVERY exit path, pass or halt.
     Machine-readable; do not hand-edit. A null field means the axis was
     not observed, never that it was zero. -->

```json
{
  "verdict": "divergent",
  "source": "multi-agent",
  "layers": {
    "l1": "converged",
    "l2": "divergent",
    "l3": "not fired"
  },
  "quorum": {
    "responded": 4,
    "required": 3,
    "roles": 4,
    "of": 4,
    "passed": false
  },
  "wall_clock_ms": 2713304,
  "halt_stage": "5.2e",
  "granted": 4,
  "reviewed_plan_hash": "sha256:6f18c14bbcc3d8c3d92e6b7242fd7ae9fdd89cd22c99a888b319bbb56ea4057e",
  "plan_path": ".claude/plans/review-loop-bypass-m1.plan.md",
  "recorded_at": "2026-08-17T16:20:14.595Z"
}
```
