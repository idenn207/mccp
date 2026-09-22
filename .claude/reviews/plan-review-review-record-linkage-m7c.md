# Plan Review Panel — review-record-linkage-m7c

**Plan**: `.claude/plans/review-record-linkage-m7c.plan.md` · **Plan version**: `sha256:e603253f19d98dd7122567647403c3a9d21faf06c454b08ac842ae6d521cf3e4`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 3 blocking finding(s): test/HIGH, test/HIGH, test/FAIL — MCCP_REVIEW_SINGLE_PASS=scope_too_small 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| security | LOW | The K5 deny list is a partial ceiling, and the plan says so itself. Under bypassPermissions, a sub-session can still write receipts, the plan, or settings through Bash (for example `git push origin --force` or `gh api .../merge`), and none of those shows up in permission_denials. The only defences are the prompt text and after-the-fact disk checks. This is residual risk the plan knowingly accepts, not a new defect. | Plan K5, line 140-142: "막지 못하는 것: `git push origin --force` ... `gh api …/merge` · Bash로 settings를 쓰는 경로". Plan K2, line 125-126: "막지 못하는 것: Bash로 파일을 쓰는 경로" |
| security | LOW | The deny list protects `.claude/settings.json` but not `.claude/settings.local.json`. A sub-session could therefore change project env or permissions with Edit, and check 5 would not flag it because no denial is recorded. There is no path from an untrusted input: the sub-session is our own model following a fixed slash command. | Plan line 159: DENY contains only `Edit(/$REPO/.claude/settings.json)` and `Write(/$REPO/.claude/settings.json)` |
| test | HIGH | Validation check 7 (the HSR record) has no executable command. The recomputation is only a comment, so the HSR claim that Task 6 relies on cannot be falsified by the Validate lines. | plan:257-258 `# 7. HSR 기록 ...` / `#    HSR 재계산은 M6 plan 검사 11과 같은 스크립트를 HSR_REQUIRED=... 로 돌린다`. Only version-guard and git diff run after it (plan:259-260). Task 6 Validate cites 검사 7 (plan:215). |
| test | HIGH | Two acceptance items have no check in any Validate block: UI3 (installed_plugins.json sha256 unchanged) and K4 (the -m7b receipt, ledger and records are unchanged). If either is violated, no command fails. | plan:303-304 Acceptance items; Task 1 says 'sha256을 새로 기록한다' (plan:178), but no command in Validation (plan:219-261) or 오케스트레이터 검사 (plan:268-285) hashes installed_plugins.json or diffs the .claude/receipts/*/review-record-linkage-m7b.json files. |
| test | MEDIUM | The delete check only prints its output and never fails, so an unintended deletion still passes. | plan:260 `git diff --diff-filter=D --name-only origin/main...HEAD` has no `test -z` or exit, unlike the other checks. |
| test | LOW | Check 2 only tests that review_record_path is a non-empty string. It does not confirm that the file exists or matches the planned .claude/reviews/plan-review-review-record-linkage-m7c.md, so a dangling link would pass. | plan:235 `record:typeof r.meta.review_record_path==="string"&&r.meta.review_record_path.length>0` |
| invariant | MEDIUM | Check 7 says it recomputes the HSR record, but it runs nothing. The block has only a comment that points at the M6 plan's script, so a missing or wrong P1-M7PATH record would still pass. | .claude/plans/review-record-linkage-m7c.plan.md:257-258 — the recomputation exists only as a comment ('HSR 재계산은 M6 plan 검사 11과 같은 스크립트를 ... 로 돌린다'). Lines 259-260 run the version guard and a `git diff --diff-filter=D` listing. The listing has no exit condition, so deleted files are printed but never fail the check. |
| invariant | MEDIUM | Two Acceptance items have no check behind them: 'installed_plugins.json sha256 unchanged' (UI3) and '-m7b receipts, ledger and records unchanged' (K4). They rest on assertion alone. Task 1 records the sha256, but no check ever compares it again. | plan:303-304 (Acceptance). plan:178 says to record the sha256 value. Neither the Validation block nor the orchestrator checks (plan:219-285) re-hash that file or diff the -m7b receipts. |
| invariant | LOW | Check 5 treats a denied force-push or merge attempt as allowed. That is correct under K5. But the check only reads the final result event, so a flag-last form such as `git push origin --force` that ran successfully never shows up as a denial and passes. | plan:141 admits these forms are not blocked. plan:278 matches only denials. No disk or remote check follows the push, although K5 promises '사후 디스크 대조'. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | I checked the load-bearing structural claims. (1) K1 says the file name is the only identity needed. pr.md:923 and :1210 both derive SHIP_PLAN_PATH from `.claude/plans/${DECISION_SLUG}.plan.md` unless PR_PLAN_PATH is set, so leaving PR_PLAN_PATH unset does collapse the slug, branch and plan path into one value. The same path is used for --plan (:941) and --expect-plan-path (:1065), so there is no second owner. (2) The S4 and Patterns citation of finalize-receipt.js:281-303: the code matches on repo-relative meta.plan_path string equality, needs exactly 1 match, and refuses to pick the first when there are several. Because the -m7b receipt seals a different plan_path, the new path yields a single match, and K4 (leave -m7b alone) cannot create ambiguity. (3) K2 freeze boundary: a freeze enforced by deny rules (Edit/Write only) is a real mechanism, not a prose promise. The plan openly names the Bash gap and backs it with check 3, a three-way comparison of plan file hash, plan receipt and implement receipt. So the invariant has an after-the-fact detector covering exactly the path the mechanism leaves open. (4) Check 5's allow-list mirrors the K5 deny list term by term (plan and settings for Edit/Write; gh pr merge and git push --force/-f prefixes), so the list of acceptable denials matches the deny rules. (5) Files to Change: I looked for a planned-matcher mismatch. All paths are repo-root full paths, and the -m7b carry-over files are listed to avoid a file-expansion stop. I found no cross-layer reach-through, no pure oracle doing I/O, and no new enum or seam, since this plan adds no code. No evidenced defect in my lens. |
| security | pass | 1. Leakage of absolute paths or machine names into committed files. The stream-json files under $S hold absolute paths from the //$PLAN deny rules, but they are not in Files to Change. The receipt's `meta.plan_path` is compared as a relative path in check 2. I found no committed field that carries `$REPO`. 2. Whether a partial or forged denial could make a failed step look successful. The `allowed()` predicate in check 5 matches exact file_path equality and an anchored Bash regex. A denial outside the deny list fails the step, so a sub-session hiding a real refusal cannot pass. 3. Whether the PR_PLAN_PATH anchor can be contaminated. K1 forbids the variable, and the constraints text repeats the ban. 4. Whether the override rewrites the verdict. Single-pass seals the real divergent verdict (§3.15), so it cannot pose as converged. 5. Whether the -m7b corpus gets rewritten. K4 rules out deletion and re-sealing, which is consistent with §3.12. 6. Whether `$EXTRA_ENV` or `$CONSTRAINTS` can inject into the JSON. Both come only from the orchestrator, with no untrusted input. 7. Whether the plan's own "막지 못하는 것" admissions hide an escalation. None does beyond what the plan already accepts. I could not reach a HIGH consequence on any of these paths. |
| test | fail | For each K and UI claim and each Acceptance item, I looked for a check command that would fail if the claim were false. I confirmed that the K1 default SHIP_PLAN_PATH matches pr.md:923. I checked the check-5 denial allowlist against the deny-rule shape (S7), the check-3 hash triple-compare, and whether each Task has a Validate line. I found that the HSR check 7, UI3 and K4 have no executable checks, and that the deletion check cannot fail. |
| invariant | pass | I traced where each gate's default falls: K7 halts on L1 failure, on L2 unavailable, and on a hash mismatch. I checked the freeze: the deny rule is applied only after T2, and check 3 compares three hashes and fails closed. I checked the anchor: K1 forbids PR_PLAN_PATH, and S4 requires exactly one match. The Validation checks exit non-zero when validate crashes, because JSON.parse throws. I then looked for acceptance items and a check (7) that the plan claims but never runs. I found no HIGH defect: every failure path I traced ends in halt, not in approval. |

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
  "wall_clock_ms": 162195,
  "halt_stage": null,
  "backlog_appended": 3,
  "backlog_skipped_nonblocking": 7,
  "granted": 4,
  "reviewed_plan_hash": "sha256:e603253f19d98dd7122567647403c3a9d21faf06c454b08ac842ae6d521cf3e4",
  "plan_path": ".claude/plans/review-record-linkage-m7c.plan.md",
  "receipt_hash": null,
  "recorded_at": "2026-09-22T06:39:37.940Z",
  "rounds": 1
}
```
