# Plan Review Panel — codex-disabled-round-invariant

**Plan**: `.claude/plans/codex-disabled-round-invariant-m1.plan.md` · **Plan version**: `sha256:17c335d4446ace724472480de240f5ce48391fb4fa1d0b71dc195850ba84e9fb`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 3 blocking finding(s): invariant/HIGH, invariant/HIGH, invariant/FAIL — MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| invariant | LOW | Plan Open Question 3 about purge collision is InvalidQuestion — purge does not affect the seal artifact. | plan.md:916-921 specifies purge happens on REVIEW_DIR (`/.claude/state/plan-review/`) and explicitly excludes `dispatch-log-<slug>.jsonl`. Plan Task 1 places seal at `<git-dir>/mccp/tmp/codex-policy.json` — outside REVIEW_DIR, in git-dir which is worktree-safe and never purged. D2 justifies this path choice, making Q3's collision concern obsolete before implementation. |
| invariant | MEDIUM | Escalation path in prp-implement.md (and plan.md) contains no instruction to seal on R2 entry — policy re-seal is unforced in escalation. | prp-implement.md:313-316 states 'If escalate triggers, run R2 with focus restricted...' — prose-only directive. No mention of re-sealing, re-reading policy, or calling codex-policy CLI. Contrast with Task 4 L114-116 which adds seal to command 5.0 entry. R1→R2 escalation in same gate-invocation has no seal refresh, relying on read-back of existing seal (D4 fallback). If seal fails to write or is corrupted, escalation path has no recovery. |
| invariant | MEDIUM | Plan acceptance criterion 3 (existing tests pass unmodified) is potentially contradicted by Tasks themselves. | Acceptance L228-229: 'existing review-single-pass.test.js and codex-invoke.test.js unmodified green'. Plan L43 UPDATE tasks modify review-single-pass.js. For backward-compat to hold, new function sig must be effectiveRoundCap(env, opts={}) with opts.codexDisabled fallback to env read. Plan L105 correctly specifies this. However, acceptance criterion states 'unmodified' — if interpreted as 'no test fixture change', it may pass (old calls still work via fallback), but if 'no test expectations change', it will fail (new codexDisabled axis adds paths old tests do not exercise). |
| invariant | MEDIUM | Plan Open Questions Q1, Q2, Q4 are declared unresolved but plan proceeds to acceptance checklist, creating unclear implementation scope. | Plan L65-68 lists four open questions marked with empty checkboxes. L223-231 Acceptance section has no corresponding decision points for these questions — no statement like 'Q1 resolved: fallback shall be env' or 'Q2 resolved: reason shall be composed'. Plan L105 (Task 3) does resolve Q1 implicitly (fail-open), and L107 adds pinnedBy field (partial Q2 answer), but these are not called-out as question resolution. Reader cannot determine which questions plan assumes answered vs. deferred. |
| invariant | HIGH | Seal read path in codex-invoke.js has fail-open to env when codex-policy module or readPolicy() fails, reducing seal's protective power. | Task 2 L98: 'fail-open: `codex-policy` require 실패와 판독 실패는 env 단독으로 강등'. If seal file is unreadable/missing (disk I/O error, permissions, old worktree), invokeAdversarialReview silently falls back to env-only read. This means a stale seal or corrupted seal cannot protect policy in escalation — user's env change will take effect. Mitigated only by 6-hour age-based expiry (D5), which is a probabilistic defense, not absolute. |
| invariant | MEDIUM | Six-hour seal expiry (DD5) assumes gate execution completes within 6h, but this assumption is documented only as rationale, not validated by test. | Plan D5: 'stale true 봉인이 OR을 통해...게이트 1회 실행은 6시간을 넘지 않는다(codex 타임아웃 900s, 게이트 deadline 1200~2400s)'. Acceptance L229 includes no test validating seal lifetime < 6h under worst-case load. Acceptance L228 (live paths) specifies testing 6h+ expiry case, but does not test 'gate did not exceed 6h and seal remained effective'. If a gate invocation approaches or exceeds 6h in practice, seal validity becomes a race condition. |
| invariant | HIGH | Plan does not explain how 'env변조에 면역' (immunity to env mutation) is guaranteed when escalation re-invokes codex-invoke. | Hypothesis (L27): 'escalation 라운드에서는 무시된다' is the bug being fixed. Plan's solution: seal once at gate entry, then re-read seal on every invokeAdversarialReview call. But escalation invokes are LLM-generated ('run R2') not gate-controlled. No code path re-seals on escalation. Immunity holds only if seal persists and is readable, but fail-open path (Task 2 L98) breaks this — seal corruption → env read → policy loss. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | Examined three-defense layering (codex-invoke.js mechanical, cap pinning, prohibition clause) for completeness and enforcement; verified seal location choice relative to plan-review purge timing; confirmed boundary isolation between git-dir scope and command-body scope; validated error handling paths for absent/expired/corrupted seal; checked consistency with existing CLI patterns (archive-complete, impeccable-detect); verified injection points allow testability and graceful fallback; confirmed all call sites of effectiveRoundCap are documented for update; reviewed DD1-DD9 for circular reasoning, gap cases, and hidden couplings. Found no defects." |
| security | pass | Attacked plan along trust boundary, data leakage, and tamper surface axes: (1) Verified chokepoint claim by grep + module inspection showing all three gates invoke via single exported `invokeAdversarialReview` function. (2) Checked policy file placement and git-dir resolution for worktree safety and commit prevention — verified use of `.git/mccp/tmp/` and worktree-safe `git rev-parse --git-dir` pattern. (3) Examined write-back verification against corrupted seal following established plan.md:2144-2148 pattern. (4) Analyzed OR logic for false negatives (sealed=true + env=0) and stale seals (6h expiry) — found correct behavior within gate execution window. (5) Searched for bypass paths: all Codex invocations confirmed to go through codex-invoke.js (no direct shell spawns); no symlink/traversal vulnerabilities beyond existing repo-write access requirements; fallback to env on policy module failure is intentional fail-open. (6) Checked for data leakage to durable artifacts — policy file outside repo, contains only boolean flag + timestamp. (7) Verified test requirements in Task 5 cover seal/read-back/expiry/dual-axis/wiring concerns. Found no evidence the plan is wrong from a security perspective. |
| test | pass | Attacked plan through test/falsifiability lens: (1) Checked whether `codex-invoke.js:213` truly is the only Codex spawn chokepoint by reading the file — confirmed it is the env check that all routes go through. (2) Verified that promised test files exist or are scheduled for creation: `codex-invoke.test.js` (exists), `review-single-pass.test.js` (exists with helpers `withCapturedStderr`/`captureExit`), `review-single-pass-command-body.test.js` (exists, tests bash-block wiring). (3) Confirmed that the live-path manual validation cases at plan lines 182–206 are concretely falsifiable: case 1 (seal survives env modification) would fail if Task 2's codex-policy integration wasn't done; case 2 (staleness) tests MAX_SEAL_AGE_MS which is exported; case 4 (clear) tests deterministically on the seal artifact. (4) Checked that the test pattern mirrors (write+read-back, fenced-only scans, parseBool usage) all exist in the codebase at the cited lines (plan.md 2144–2152, review-single-pass.js, env-contract/value.js). (5) Verified acceptance criterion "정책 off 상태에서 기존 테스트가 무수정으로 green" is achievable: the plan's fail-open path (require failure → env-only fallback) preserves backward compatibility because effectiveRoundCap's new `opts.codexDisabled` parameter defaults to env read when omitted. (6) Confirmed the 4 live paths are not integrated into automated `node --test` suite, but this matches the acceptance criterion distinction that explicitly promises manual end-to-end validation separately from unit tests. (7) Found no gap in the core regression test: case 1 (seal then env=0) would catch if Task 2's codex-policy invoke was omitted because disabled would only be true if seal succeeded. (8) Examined whether tests could pass without the actual implementation working: tasks have implicit dependency ordering (Task 1 creates module, Task 2 uses it) and codex-policy exports MAX_SEAL_AGE_MS for direct test assertion as promised. (9) No falsifiable claim in the plan contradicts any existing test or code structure discovered. All Patterns to Mirror citations (lines 25–35) point to existing code/tests. |
| invariant | fail | Attacked the plan's core invariant: (1) Seal durability and read-back path — found fail-open fallback in Task 2 creates vulnerability when seal corrupts. (2) Escalation path — escalation prose contains no seal-refresh instruction, relying on one-time seal from gate entry (valid but undocumented as requirement). (3) 6-hour expiry assumption — checked if this is validated by acceptance criteria; found no test ensuring gate completes < 6h. (4) Open Questions resolution — traced Q3 (purge collision) and found it invalid given path choice (git-dir not REVIEW_DIR), but Q1/Q2/Q4 remain unresolved in plan. (5) Backward-compat of effectiveRoundCap signature — confirmed signature design allows fallback to env read when opts omitted, but acceptance criterion phrasing is ambiguous about test expectations vs code changes. (6) Receipt anchoring — checked that seal write includes read-back + throw (plan L30-31 mirror), confirming unanchored write is not the gap; gap is persistence across escalation without guarantee." |

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
  "wall_clock_ms": 618218,
  "halt_stage": null,
  "backlog_appended": 3,
  "backlog_skipped_nonblocking": 5,
  "granted": 4,
  "reviewed_plan_hash": "sha256:17c335d4446ace724472480de240f5ce48391fb4fa1d0b71dc195850ba84e9fb",
  "plan_path": ".claude/plans/codex-disabled-round-invariant-m1.plan.md",
  "recorded_at": "2026-08-25T09:18:57.141Z"
}
```
