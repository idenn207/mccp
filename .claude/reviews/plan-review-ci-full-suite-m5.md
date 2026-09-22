# Plan Review Panel — ci-full-suite-m5

**Plan**: `.claude/plans/ci-full-suite-m5.plan.md` · **Plan version**: `sha256:216e0a03c267ac478a4a54d6ba4dbd6cfffe9ce2e91945a60ce1713380e33962`
**Verdict**: `divergent` via `hybrid`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=true
**Layers**: L1 converged · L2 converged · L3 divergent
**Halted at**: `5.2e`

> Reason: L1+L2 converged but L3 (Codex) returned divergent

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | LOW | Validation and Task 2 use two different working directories for the c2 path. Task 2 runs from the main repo root, but V4 assumes the c3 worktree is the working directory. If both run from the same place, one of them points at a path that does not exist. | Plan line 89 uses `git -C .worktrees/c2-orchestrator-step-wiring`. Plan line 128 uses `C2=../c2-orchestrator-step-wiring`. |
| architect | LOW | The V2 check that the batch matches the document takes every table row containing `\| fixed \|` anywhere in the document. Task 0 also puts the c2 cleanup record in the same document, so a row from that record could get counted as a disposition, which breaks the one-to-one match V2 is meant to prove. | Plan line 115 filters with `/\\\|\\s*fixed\\s*\\\|/` and takes the first 16-hex match. Plan line 71 says the document also holds the 'c2 잔재 처리 기록' (c2 cleanup record). |
| security | MEDIUM | DD3 makes `#<pr>` the preferred batch evidence, but `classifyEvidence` accepts any `#<number>` from its format alone and never checks it against a real PR or the fix. Once Task 3 applies the batch, a `fixed` row with a wrong or made-up PR number hides a CRITICAL finding from SessionStart promotion. The path:line check V1 runs lives only in the markdown doc, not in the item that does the hiding. This is an existing gap in the ledger, and M5 routes 8 CRITICAL suppressions through it. | plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js:135 `if (PR_RE.test(raw)) return { ok: true, kind: 'pr', value: raw };` (the path-line branch at :137-143 at least resolves the path inside the repo); handoff-items.js:154-158 hides whatever `suppressedFindingIds` returns; plan DD3 says `batch evidence는 #<pr>을 우선한다`; V2 only calls classifyEvidence (a format check). |
| security | LOW | Task 2 gives the c2 path relative to the repo root (`git -C .worktrees/c2-orchestrator-step-wiring`), but V4 uses `../c2-orchestrator-step-wiring`, relative to the c3 worktree. Run from the c3 cwd, the Task 2 command points at a path that does not exist and fails without touching anything. It cannot hit the wrong worktree, so the destructive checkout does not reach an unintended target. It is still an inconsistency in a destructive step. | plan Task 2 line 89 vs V4 line 128 `C2=../c2-orchestrator-step-wiring` |
| test | MEDIUM | Task 3's trigger can fire falsely. If Task 0 marks no finding `fixed`, the batch file is empty. V3 then counts miss=0 and prints `V3 ready — Task 3 적용 가능`, and V2 also passes because an empty batch matches an empty doc set. Acceptance expects `blocked`, but an empty batch produces `ready`. Nothing catches that result, so the trigger is not reliable. | plan V3 line 124-125: `const miss=rows.filter(r=>!have.has(r.item_id)).length; console.log(miss===0?"V3 ready ..."` and Task 3 트리거 line 93: `V3가 ready를 출력한다`; V2 line 117 compares sorted joins, and two empty strings are equal |
| test | MEDIUM | The riskiest claim, that a `fixed` verdict means the closure is proven, has no check. V1 only looks for some `path.ext:N` text in the row. It does not confirm the file or line exists, or that the cited code addresses the finding. Nothing enforces DD4 either: a finding that belongs to a residual axis can still be marked `fixed` and pass V1 and V2. Once Task 3 applies the batch, that finding disappears from SessionStart. | plan V1 line 105 regex `/[\\w./-]+\\.\\w+:\\d+/`; plan Risks line 140 relies on V1 as the mitigation; DD4 line 45; V2 line 116 validates only the batch evidence `#<pr>`, not the doc's code citation |
| test | LOW | V2 decides which doc rows count as `fixed` with a bare `\| fixed \|` match and then takes the first 16-hex string on the line. The check is loose but holds as long as finding_id is the first column. A differently ordered row would be mis-keyed without any warning. | plan V2 line 115 `filter(l=>/\\\|\\s*fixed\\s*\\\|/.test(l)).map(l=>"findings:"+(l.match(/[0-9a-f]{16}/)\|\|[""])[0])` |
| invariant | MEDIUM | V4 can report success when the check itself never ran. If the c2 worktree path is missing or wrong, `git -C "$C2" status` fails, prints its error to stderr and nothing to stdout. `test -z` then passes, and so does `test ! -e` on a marker in a directory that does not exist, so V4 prints 'V4 ok' without having checked anything. | plan:128-130 `C2=../c2-orchestrator-step-wiring` / `test -z "$(git -C "$C2" status --porcelain ...)" && test ! -e "$C2/..." && echo "V4 ok"`. There is no `test -d "$C2"` and no exit-status check on git. Task 2 (plan:89) also uses a different base path, `.worktrees/c2-...` relative to the repo root. |
| invariant | MEDIUM | The `#<pr>` evidence that DD3 prefers is not tied to the finding. `classifyEvidence` accepts any `#N` without checking it, and V2 checks only its format. A `fixed` row whose PR never closed the claim still passes V2 and, after Task 3, silences a CRITICAL at SessionStart promotion. The only link to real code is the path:line in the doc, and V1 checks only that some `x.y:N` string appears on the row, not that it points at the claim. | debt-inventory.js:135 `if (PR_RE.test(raw)) return { ok: true, kind: 'pr' ...}`; plan:44 DD3 'batch evidence는 `#<pr>`을 우선한다'; plan:105 V1 regex `/[\\w./-]+\\.\\w+:\\d+/`; handoff-items.js:156-158 suppression by finding_id. |
| invariant | LOW | Nothing mechanical records that each `fixed` verdict was matched to its original claim. Task 0 says to match claim text via `claimDigestOf`, but no validation step checks that the digest actually matched. So a finding whose original text was never found could still get `fixed` instead of `open`, and only the author's discipline prevents it. | plan:79 Task 0 '`open`(원문 미발견 또는 입증 불가)'; plan:101-118 V1 and V2 never recompute or compare claim_digest. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | 1. Opened every citation the plan's structural argument rests on. debt-inventory.js:11-19 does say registry closes would distort C1. :496 does reject items outside the sealed inventory. :825-845 is the `--batch` JSONL parse. :129 `classifyEvidence(value, repoRoot, opts)` is exported and reads `allowBarePath`. handoff-items.js:139-164 suppresses only through `suppressedFindingIds`, which returns null when the ledger is unsealed. findings-registry.js:686 `readAll` returns `.findings`, and :588 confirms `state:'open'`. 2. Checked for boundary leaks. The plan writes nothing to the registry and changes no code. Suppression stays outside the pure `isPromotable` predicate. Dispose goes through the separate ledger, which matches the module's own design. 3. Checked the seam to Task 3. It depends on the M2 re-seal, V3 observes that without writing anything, and the batch is all-or-nothing, so there is no partial state and no second owner. 4. Checked whether the V2 calls fit the real exports and signatures. They do. Found no HIGH or CRITICAL structural defect. |
| security | pass | 1) Suppression escalation. Traced the path from a batch row to SessionStart suppression through handoff-items.js:139-164. Only resolving dispositions suppress, and the ledger fails open (null suppresses nothing). DD4 keeps `residual` off the batch. The remaining weak point is PR evidence that is only format-checked (reported MEDIUM). Nothing is applied this cycle because of DD2 and the seal. 2) Forged or partial records. The batch is all-or-nothing. Items outside the seal are rejected (DD2/V3), so no partial application is possible. 3) Leakage into committed files. The new doc and jsonl hold finding ids, repo-relative path:line, SHAs and PR numbers. The plan has no step that writes absolute paths or cwd. 4) Path traversal. path:line evidence goes through normalizeCitedPath with an OUTSIDE_REPO check (:139-141). 5) Destructive c2 revert. It has a re-measure-then-stop guard, requires user confirmation, and only removes lines that were added. The mismatched path makes it fail safely, not act on the wrong target (LOW). 6) Bypass and override. The plan adds no env toggle, and registry and seal code are untouched. Found no HIGH or CRITICAL issue. |
| test | pass | 1) I checked that the V2 APIs exist. `classifyEvidence` is exported at `debt-inventory.js:894`, with signature (value, repoRoot, opts) at :129. `readAll` returns `findings[]` with `finding_id` and `state` (`findings-registry.js:577-588`, :686-696). 2) V4 path: cwd is `.worktrees/c3-ci-full-suite`, so `../c2-orchestrator-step-wiring` resolves correctly. 3) Empty-batch case: V2 and V3 both pass vacuously, and V3 prints `ready`. 4) The `fixed`-means-proven claim and DD4 have no mechanical check. 5) Task 3 is deferred, so its weak validation is out of this cycle. The plan changes no code, so no existing suite encodes the behaviour. No HIGH or CRITICAL defect found. |
| invariant | pass | Checked whether any part of the plan can open a gate early. Dispose is deferred, and the sealed-inventory check at debt-inventory.js:495-497 plus all-or-nothing application block it (DD2). Confirmed that handoff-items.js:146-158 suppresses only resolving dispositions, and that suppression fails open toward promoting everything. Traced V2 on an empty batch: it passes consistently when the doc has no fixed rows. Checked that the classifyEvidence export and signature match what V2 calls (:129, :894). Traced V4 with the c2 path absent: it falls through to a pass. Checked evidence anchoring: `#pr` is unverified, and V1's path:line check only looks at the string's form. Checked the rollback in Task 2: it re-measures first, requires user confirmation, and halts if the diff has changed. Registry writes and seal changes are explicitly out of scope. No path reaches dispose application or a registry close in this cycle, so the findings are MEDIUM or lower. |

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
  "wall_clock_ms": 157066,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:216e0a03c267ac478a4a54d6ba4dbd6cfffe9ce2e91945a60ce1713380e33962",
  "plan_path": ".claude/plans/ci-full-suite-m5.plan.md",
  "recorded_at": "2026-09-14T05:07:56.423Z"
}
```
