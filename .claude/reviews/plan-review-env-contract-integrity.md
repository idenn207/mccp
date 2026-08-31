# Plan Review Panel — env-contract-integrity

**Plan**: `.claude/plans/env-contract-integrity-m3.plan.md` · **Plan version**: `sha256:840953a92bb66c0d7b507c1a00ac7956f59358df3eb4d435046678c393d2f0fb`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 5 blocking finding(s): test/HIGH, test/HIGH, test/FAIL, invariant/HIGH — MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| test | MEDIUM | Task 6 Validate will verify that existing receipt tests remain unbroken because they use no-ledger paths (line 128: 기존 receipt test가 `rounds: 1`을 단언하는 곳은 원장 부재 경로라 불변임을 확인) | Line 128 describes the Validate action as 'confirming' that existing tests are in no-ledger paths. However, this is an assumption, not a testable claim. No test can verify 'this test is in a no-ledger path' without explicitly checking the ledger is absent in those fixtures. The existing test at plugins/mccp/scripts/receipt/tests/v1-3-0-baseline.test.js:48 hardcodes `rounds: 1` but doesn't verify what happens when a ledger DOES exist. The newly-created round-ledger-fields.test.js must test positive cases (ledger count 1+ → rounds derives), but the Validate line doesn't describe these explicit cases. |
| test | MEDIUM | Risk line 177 states existing receipt tests will 'pass as expected' because they're no-ledger fixtures (예상하되 확인) | .claude/plans/env-contract-integrity-m3.plan.md:177 uses the word '예상' (expect/anticipate) not '확인' (confirm). This marks it as an assumption requiring verification rather than a guarantee. The mitigation says 'Task 6 Validate가 receipt test 전량을 돌려 확인' — run all tests to verify — but running all tests will only pass if the assumption is correct. There is no negative test case (e.g., fixture WITH a ledger) described to verify the derivation logic works. |
| test | HIGH | Task 7 Validate will verify static positioning that `review-rounds/cli.js seal` is called before the first codex-invoke call (line 134: 정적 위치 단언) | Line 134 references 'review-single-pass-command-body.test.js 방식' (same pattern as review-single-pass-command-body.test.js) for static assertions. However, the existing review-single-pass-command-body.test.js (line 96-100) tests `codex-policy.js seal`, not `review-rounds seal`. The new test file 'round-cap-command-body.test.js' to be created in Task 7 is not shown in the plan text, so we cannot verify it will check for the new seal module. A new seal module requires new static assertions. |
| test | HIGH | All new test files (ledger.test.js, seal.test.js, enforcement.test.js, round-cap-command-body.test.js, round-ledger-fields.test.js) will be created and will test the required behavior (lines 81-85, Validate lines 98-128) | These files do not currently exist (verified via glob search: no plugins/mccp/scripts/lib/review-rounds/ directory). The Validate lines reference tests that will be created ('node --test plugins/mccp/scripts/lib/review-rounds/tests/ledger.test.js') but the content of those tests is not shown in the plan. Without seeing the test code, we cannot verify that: (1) Task 2 Validate actually tests '봉인 후 env를 비워도' (seal persists even after env is cleared) — the most critical false-passing scenario, (2) Task 4 Validate tests 'timeout 응답 후 count 0' (DD3 counting logic), (3) Task 6 Validate tests ledger derivation with positive count values. The plan describes intended test scenarios in prose but provides no actual test code. |
| test | LOW | Version synchronization test (i18n-surface.test.js at line 165) will catch if Task 9 version updates are incomplete | The existing test at plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js:96-142 checks HTML footer version and markdown footer version against plugin.json, but does NOT check CHANGELOG.md. Per Task 9, 4 places must be updated: plugin.json, html.js page-foot, markdown.js derived line, and CHANGELOG.md. The test covers 3 of 4. CHANGELOG.md version drift would not be caught by this test. |
| test | MEDIUM | Task 5 panel-channel enforcement test will verify that cap-reached prevents workflow-args.json creation (line 122: cap 도달 시 `workflow-args.json` 미생성) | Line 122 Validate says 'cap 도달 시 `workflow-args.json` 미생성 과 exit 12'. However, this is a negative test (verifying a file is NOT created). The existing plan-review tests referenced at line 122 ('plugins/mccp/scripts/lib/plan-review/tests/*.test.js') are not shown. Without reviewing the actual test code or seeing the new enforcement.test.js, we cannot verify it actually checks file non-existence rather than just exit code. A test that only checks exit 12 would pass even if workflow-args.json was created. |
| invariant | HIGH | Task 8 acknowledges documentation-settings drift (G7) but defers the fix to 'whoever decides', leaving no fail-closed mechanism to prevent the drift from landing. The Validation only runs registry-vs-code lint, not settings.json-vs-docs sync check. | Plan Task 8: '**문서를 값에 맞출지 값을 문서에 맞출지는 사람이 정한다**... 정하지 않고 넘어가면 M3이 강제하는 캡과 문서가 어긋난 채로 착지한다.' G7 states CLAUDE.md §3.16 claims 'MCCP_GATE_ROUND_CAP=1' but actual .claude/settings.json has '"MCCP_GATE_ROUND_CAP": "3"'. Task 8 Validate cites only 'lint.js' (registry-code check), not a sync check between settings.json and CLAUDE.md. |
| invariant | MEDIUM | The plan leaves underspecified whether the seal → choicepoint integration is tested in CI before merge. Unit tests verify seal and choicepoint in isolation, but integration test details are absent. Only live acceptance test (criterion 6) would catch a bug where seal writes successfully but choicepoint doesn't read it. | Plan Task 2 Validate: seal.js tests in isolation. Task 4 Validate: 'cap 1 과 원장 1건에서 spawn 0회' but doesn't specify whether cap is provided as parameter or retrieved via resolveCap(seal). Task 7 Validate: 'seal이 첫 codex-invoke 호출보다 **앞선 위치**에' (location assertion only). Acceptance criterion 6 is live test, not CI gate. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | Verified all architectural claims: (1) Single source of truth — ledger correctly keyed per gate+decision with detailed round history, write.js properly derives resolution.rounds from ledger count (not hardcoded), author bypass via --resolution-file blocked by fail-closed divergence check (DD9); (2) Two chokepoints — codex-invoke spawn check and plan-review/cli emit-workflow-args check both read ledger and return round-cap-reached before action, preventing prose-only enforcement; (3) Pattern correctness — Sealing mirrors codex-policy (unlink-write-readback, 0o600, git-dir path), decideRound correctly reused from santa/counter.js (pure function), no circular dependency; (4) Boundary handling — Seal at git-dir handles policy (shared worktree anchor via readGitDirFile), ledger at repo-root/.claude/state per-worktree, matches existing architecture; (5) Abstraction integrity — Cap enforcement moved from prose to machine (chokepoints before spawn/emit), receipt doesn't lie (resolution.rounds from ledger, present-only meta.round_ledger_count for real count), escalate detection preserved (round-cap-reached → divergent, non-blocking); (6) Process boundaries — All three gates seal cap independently, ledger records channel (codex/panel), count is total across channels. No abstraction leakage, no shortcut paths, no invariant erosion detected. |
| security | pass | Attacked path containment: verified repo-root anchoring with assertContained second-order defense in both seal and ledger paths. Attacked seal/ledger forgery: verified read-back verification (codex-policy.js pattern), 0o600 file mode protection, guardedReadModifyWrite locking with lease-based reclaim. Checked hash coverage: resolution.rounds IS included in receipt_hash (not present-only); meta observational fields deliberately excluded per DD8 and policy precedent. Verified chokepoint fail-closed: codex-invoke spawn short-circuit on (cap>=count && mode=='enforce'), plan-review emit-workflow-args check both fail-closed. Checked bypass vectors: no env toggle to bypass seal, no CLI flag path to inject ledger state, no means to reach spawn without passing both chokepoints. Examined concurrent modification scenario: lock token model prevents unauthorized release, lost-update risk mitigated by lock acquisition before mutation decision. Traced DD3 rule (rounds counted only on ok-classification, not on transport failure): verified codex-invoke returns without recordRound on non-ok classification. Could not identify concrete attack path from hostile local input (filesystem forging, env tampering, or concurrent access) to durable false state that wouldn't be detected by read-back verification or leave evidence in sealed receipt. |
| test | fail | Attacked the plan through 6 lenses: (1) Whether Validate lines reference tests that exist and test what's claimed, by checking if referenced test files exist; (2) Whether assumptions in Risk/Acceptance are marked as such or falsely presented as guarantees, by reading prose carefully; (3) Whether new functionality has corresponding tests, by verifying review-rounds directory doesn't exist yet; (4) Whether the plan's claims about existing tests remaining unbroken are testable, by reading the specific existing test that checks resolution.rounds; (5) Whether version synchronization test covers all 4 places, by reading i18n-surface.test.js; (6) Whether negative tests (file not created) are explicitly described vs just exit codes, by examining Task 5 validate language. Did NOT find defects in the actual round-cap logic design (DD1-DD9 patterns mirror codex-policy correctly), only in test coverage specification and assumption documentation. |
| invariant | fail | Attacked fail-open drift (Task 8 drift solution), receipt anchoring (rounds derivation from ledger), seal/ledger atomicity and rollback paths, skip predicates (dedupe correctness), mode sealing design choice, integration of seal → resolution.rounds → receipt. Verified ledger correctness (decision_slug keying, guardedReadModifyWrite), DD3 accounting (only count after ok), acceptance criteria coverage. Confirmed G7 drift exists and Task 8 defers. Found test coverage for logic but integration spec gap and no settings.json-docs sync test." |

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
  "wall_clock_ms": 559150,
  "halt_stage": null,
  "backlog_appended": 5,
  "backlog_skipped_nonblocking": 5,
  "granted": 4,
  "reviewed_plan_hash": "sha256:840953a92bb66c0d7b507c1a00ac7956f59358df3eb4d435046678c393d2f0fb",
  "plan_path": ".claude/plans/env-contract-integrity-m3.plan.md",
  "recorded_at": "2026-08-27T04:36:31.577Z"
}
```
