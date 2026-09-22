# Plan Review Panel — closure-accounting-m5

**Plan**: `.claude/plans/closure-accounting-m5.plan.md` · **Plan version**: `sha256:dd62bd74441db4699604e7e6d3311dc683f345a65ccc4489dc841a3159767d02`
**Verdict**: `divergent` via `hybrid`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=true
**Layers**: L1 converged · L2 converged · L3 divergent
**Halted at**: `5.2e`

> Reason: L1+L2 converged but L3 (Codex) returned divergent

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | LOW | Task 2 makes the m10 gate call `verifyDispositions` twice in one run: once in the new `checkSeal` cross-check and again in `checkDispositions`. That is the same redundant-call shape Task 3 removes from report.js (backlog 1842). The plan does not mention the inconsistency. It costs performance only, not correctness. | m10-coverage-gate.js:164 already calls `debt.verifyDispositions(repoRoot)` in checkDispositions. Plan Task 2 says "`checkSeal`(`m10-coverage-gate.js:74`)에서 `debt.verifyDispositions(repoRoot)`를 한 번 부른다". Plan DD3 removes the equivalent double `sealAncestry` call in report.js:436-443. |
| architect | LOW | Validation 3 exits 1 when `denominator_gap` is null. But report.js deliberately returns null for the whole gap object when the live inventory is degraded or the seal digest mismatches. The check therefore equates a legitimate degraded state with a defect. That contradicts the plan's own rule that an unreadable value is not 0 (the check does not treat null as a valid answer). | report.js:685-686 `finalDenominatorGap = (allDegraded.length > 0 && liveInventoryDegraded) \|\| sealDigestMismatch ? null : {...}`. Plan Validation 3: `if(!g\|\|...) process.exit(1)`. |
| security | LOW | Task 1's paragraph-level span pairing can accept a marker that line-level pairing used to reject. Example: a stray backtick on line N pairs with a backtick at the start of line N+1, so a marker that was inside a same-line span becomes exposed. This is not a defect. It follows CommonMark rendering, where that marker really is visible text, and successor documents are repo-authored and reviewed. No hostile input gets past review this way. | debt-inventory.js:703-723 (stripInlineCode pairs the next run of exactly N backticks) and :763 (currently called per line); plan DD1 claims the approximation errs only toward over-removal |
| test | LOW | Validation 5 reads a baseline file that no task actually creates. Task 0(c) only says to save the baseline values "to scratch". It never names `$TMPDIR/m5-baseline.json` or says what shape the file has. The check fails loudly (require throws), so it can't pass by accident. But the invariant comparison can't be run exactly as written, and `$TMPDIR` is never set in the Validation block. | .claude/plans/closure-accounting-m5.plan.md:215-216 ("라이브 불변식 기준값을 scratch에 저장한다") vs :422 ("$TMPDIR/m5-baseline.json"); :388-389 set -e / export only MCCP_CODEX_DISABLED |
| invariant | LOW | Validation 3 and 5 write to and read from "$TMPDIR/...", but Task 0 says the baseline is saved "to scratch" and never names $TMPDIR. If TMPDIR is unset, the paths turn into /cr.json and /m5-baseline.json. The run then fails closed: require throws, or the write is denied. That blocks the check rather than passing it, so the only cost is a misleading red. | plan Task 0 (c) "라이브 불변식 기준값을 scratch에 저장한다" vs Validation 5 `require(process.argv[1])` with "$TMPDIR/m5-baseline.json" |
| invariant | LOW | Task 3 step 3 leaves reseal_warning unchanged when sealed_not_live_disposed is null. Only the JSON field carries the unknown. The table renders it as n/a (step 4), so the unknown still shows and does not fall to 0. This is reported only so the table rendering stays pinned: test (c3) must cover the null case. | plan Task 3 step 3 "0이거나 null이면 문구를 바꾸지 않는다"; step 4 "값이 null이면 `n/a`로 렌더한다" |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | 1) DD2/Task 2: checked that the m10 `checkSeal` counts and verify count the same thing. Both use sha≠current ∧ ∈ verified ancestors (m10:107-114 vs debt-inventory.js:976-986). In the null-ancestry case, m10 returns early (m10:101) and verify reports `ancestry_depth` null (:1036), so the plan's agreement rule for that case holds. 2) DD3: confirmed that verify's `ancestry_depth` is `anc.verified.length` (:970, :1036), which is the same value report.js:440 computes today, so removing the duplicate call does not change what the field means. I also confirmed that verify's early returns leave the field out, which the plan already maps to null. 3) DD5: confirmed that reseal's `sameOwner` and `selfBody` are the 3-field shapes the plan cites (reseal.js:112-118). Falling back to the 3 fields when a nonce is absent keeps the dead-pid reclaim path working, including the re-read at :168. 4) DD6/Task 7: confirmed that `readAll` returns `degraded` and `degraded_reasons` (findings-registry.js:789-795). handoff-items.js:133-197 ignores them today, and the catch path returns EMPTY without the field, so the change purely adds information. 5) Task 3: confirmed that `identityIncomplete`, `disposalBlocked`, `sealedNotLive` and `finalDenominatorGap` exist at the cited locations, so the new field has somewhere to attach. 6) Checked every place the plan claims a single source of truth: the `rowId` identity stays unchanged, and fixes owned by other subsystems (write.js, plan.md, the findings-registry oracle) go to backlog rather than into the code, so no boundaries leak. No HIGH or CRITICAL defect found. |
| security | pass | 1. Task 1 (fake acceptance marker). I tried to un-hide a marker with multi-line spans, blank-line boundaries and backtick re-pairing. The only change I found matches how CommonMark renders the text, so it is not an escalation. Validation 5 compares live invalid_dispositions and deferrals against the Task 0 baseline. 2. Task 5 lock nonce, partial state. When one side has no nonce, the check falls back to the existing 3-field comparison (reseal.js:116-118). That is exactly today's strength, so nothing gets weaker. The reclaim re-read compares two reads of the same file, so a mixed old/new body cannot let one owner pass as another. 3. Task 9 dynamic fence. The report text is only measured for its backtick length inside node -e; it never reaches shell evaluation. The artifact is a JSON report with repo-relative data, and Task 7 already checks that no absolute path appears. 4. Task 7 stderr: the message is a fixed string plus a count, with a negative assertion for absolute paths. 5. Task 2 m10 cross-check: it only adds an AND to ok, and a verify throw folds to disagreement, which fails closed. 6. Task 10 backlog rows: append-only, no reseal or rehash, and no tracked receipt is touched. I could not reach any path from input to escalation or leak. |
| test | pass | 1) Task 2 agreement claim: checked whether checkSeal's counts are defined the same way as verifyDispositions' counts. They are, at m10-coverage-gate.js:100-114 and debt-inventory.js:969-985: both count ancestor-bound lines, and both count mismatches as sha≠current and not an ancestor. When ancestry is null, verify returns ancestry_depth null (:1036). So sub-tests (a) to (d) test real behaviour, and live Validation 4 is not self-contradictory. 2) Task 4 export: cli.js has a require.main guard (:200), so requiring it in cli.test.js won't run main. 3) Task 7 (p1): if `.claude/state/findings` is a file, readdir fails, and findings-registry.js:754-796 returns degraded:true instead of throwing. So the test drives the new branch, not the catch branch. 4) The Task 11 grep target row exists in the PRD (:123). 5) Every file the plan edits has a matching test file in Validation 1. The Task 1, 3, 5, 8 and 9 tests each come with a positive or mutation control, including the over-permissive direction: (t5)/(t7) reject, (t6) guards against over-stripping, and (n1) checks that release does not unlink someone else's lock. I found nothing the plan asserts that no test would catch, apart from the LOW baseline-path gap. |
| invariant | pass | 1) Task 2 seal cross-check. I checked that verifyDispositions puts records in the same buckets as checkSeal (sha≠current, then ancestor or mismatch; debt-inventory.js:969-984 vs m10-coverage-gate.js:100-114), so correct state cannot trigger a false disagreement. When verify throws, returns a non-object, or takes an early return, producer_agrees is false. When ancestry cannot be judged, ok is still false. No path opens the gate. 2) Task 5 nonce fallback. When one body lacks a nonce, sameOwner compares the old three fields. That is the same strength as today (reseal.js:116-118), so it does not weaken anything. The empty-body and cross-host refusals at :139-147 stay. 3) Task 1 paragraph-level stripping. It can only remove too much, which rejects a marker and never creates acceptance. Test (t6) covers the paragraph boundary, and Validation 5 checks invalid_dispositions and deferrals_by_successor live against the Task 0 baseline. 4) Task 3 verify-derived ancestry_depth. An absent verify or a throw gives null, not 0. 5) Task 7 handoff. It stays fail-open, which is the existing documented rule (:131-132); only added surfacing, no gate. 6) Task 9 artifact. It uses if-no-files-found: error after the parse step, and there is no if: that could make it continue-on-error. 7) DD10: no reseal and no disposition append, so no receipt or seal re-anchoring. MF3 escalate_pending is left unresolved on purpose and is not faked. 8) Validation uses set -e, and the m10 exit is expected to be 1; I found no step where a crash or missing artifact ends in a pass. |

## Measurement

<!-- Written by plan-review/cli.js record on EVERY exit path, pass or halt.
     Machine-readable; do not hand-edit. A null field means the axis was
     not observed, never that it was zero. -->

```json
{
  "verdict": "divergent",
  "source": "hybrid",
  "layers": {
    "l1": "converged",
    "l2": "converged",
    "l3": "divergent"
  },
  "quorum": {
    "responded": 4,
    "required": 3,
    "roles": 4,
    "of": 4,
    "passed": true
  },
  "wall_clock_ms": 384735,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:dd62bd74441db4699604e7e6d3311dc683f345a65ccc4489dc841a3159767d02",
  "plan_path": ".claude/plans/closure-accounting-m5.plan.md",
  "receipt_hash": null,
  "recorded_at": "2026-09-15T06:59:16.017Z",
  "rounds": 1
}
```
