# M4 reviewer inversion — implementation checkpoint

Status: **in progress; M4 acceptance is not complete**.

The 2026-09-10 CLI probe measured Claude Code 2.1.267 and codex-cli 0.154.0.
The assistant response identified `claude-opus-5`. A real Write request was
denied under `dontAsk`, and the disposable protected file retained its hash.
The structured result is in `result.structured_output` of the stream-json
transcript. An invalid option and a forced process timeout were measured as
failure controls. No authentication settings were changed.

Reproduce the CLI contract probe:

```bash
node scripts/codex-probe/reviewer-probe.js --live --out .claude/_meta/data/codex-harness-portability-m4.json
node scripts/codex-probe/redact-gate.js --check .claude/_meta/data/codex-harness-portability-m4.json
```

The probe reports `task1_complete` independently from `m4_complete`; the plan,
implement and PR gate measurements remain `unmeasured`. A CLI response is not
evidence that a complete gate ran.

Implemented foundations:

- `reviewer-invoke` selects Claude for a positively designated Codex host and
  preserves the Codex adapter for a Claude host. Unknown hosts block.
- The Claude adapter uses argv/stdin, bounded subprocess execution, structured
  findings and actual assistant model checks. Codex disabled/advisory settings
  cannot turn a Claude error into approval. Successful calls use a distinct
  `claude` round-ledger channel.
- The present-only `reviewer_verdict` / `reviewer_execution` pair rejects legacy
  approval-field mixtures. Its evidence requires repository containment,
  content hash and current gate/decision/subject/host context. A caller without
  that context reads `unavailable`. The writer requires a bound in-process run,
  not a deserialized assertion of approval.
- The plan runner has an initial facade connection. Its existing regression
  tests pass; a real Claude-to-plan-receipt end-to-end run remains unmeasured.

Remaining work:

- Complete plan mode selection, implement command and PR runner/finalizer wiring.
  In particular, implement/PR currently hand results between processes; the
  new in-process execution contract must be preserved through a runner-owned
  finalization path. Do not replace it with an arbitrary approval-JSON flag.
- Exercise each actual gate entry through receipt read-back, including locks,
  nonce races, unsupported auxiliary tools and unavailable negative controls.
- Finish context propagation and current-target checks at all dedupe/ship
  consumers, update the coupling inventory and command documentation.
- Resolve or explicitly retain existing F1: legacy subject hashes do not bind
  uncommitted implementation content. This checkpoint does not fix that issue.
- M5 producer/session provenance and cross-harness continuation remain separate.

Two HIGH findings from a Codex security review were fixed locally: structural
evidence alone could previously read as approved, and a review target could be
hashed without being sent to Claude. The focused tests now require disk evidence
and actual target text. This is not a fresh security approval of complete M4.

Validation at this checkpoint:

- Focused probe/adapter/evidence tests: 16 passed.
- Existing Codex adapter/payload regressions: 72 passed.
- Plan runner regressions: 51 passed.
- Receipt regressions: 726 passed with `MCCP_BRIEFING=off MCCP_HARNESS=claude`.
  New Codex-host tests set their host explicitly. This preserves the legacy
  regression environment while testing the new host policy separately.
- Round-ledger/seal/enforcement regressions: 61 passed.
- Environment contract lint and `git diff --check`: passed.

The original receipt-suite invocation inherited enabled briefing and launched
real Codex calls from temporary test repositories. It was stopped, along with
its identified descendants and detached fixture processes; the final fixture
process count was zero. That interrupted run is not counted as a test pass.
Future receipt-suite invocations must disable briefing:

```bash
MCCP_BRIEFING=off MCCP_HARNESS=claude node --test --test-concurrency=4 plugins/mccp/scripts/receipt/tests/*.test.js
```

The user's intent-gate override was applied with a length-expanded explanation
of the existing Codex review and review-record hash change. It preserved
`codex_verdict=divergent` and sealed `intent_gate_verdict=incomplete`, not approval.
Subsequent implementation commits and plan scope additions make those earlier
receipts stale again; they must not be presented as final implementation proof.
