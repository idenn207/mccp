# Deferred CRITICAL debt — successor for the M10 inventory

**Inventory**: `sha256:f171a42e2c344849b988f613e827b11e3515dfcd777ad1d997645d917e71dfba`
**Sealed at**: commit `9093b08` (2026-09-01)
**Owner**: the next cycle that opens this axis. This file is a successor record,
not a plan — it says what was not judged and why, so the deferral is legible
instead of silent.

M10 adjudicated the CRITICAL band individually (the operator's decision when the
denominator turned out to be 1115 items rather than the ~800 the plan assumed).
Of the 79 undisposed CRITICAL items, most turned out to be already-adjudicated
records that no machine ledger had ever recorded. The ones below are the
remainder: items this cycle could **not** honestly close.

They are deferred, not resolved. `deferred` is not a suppressing disposition, so
every one of these still appears in the next session's promotion list — deferring
decides who fixes it, never whether the next session hears about it.

## Why these could not be judged

### 1. Panel rows whose adjudication is not locatable (17 items)

The backlog carries two kinds of row. One is written by a person and states a
judgment. The other is appended automatically by `plan-review/cli.js` in the
fixed form `L2 <perspective>: <claim> · 원문 <path> · id=<digest>` and states
only what a reviewer claimed — its adjudication lives elsewhere, normally in a
sibling `«triage:»` row or the plan's own `## Review History`.

For 11 of the automatically appended CRITICAL rows the digest is cited again
somewhere in the same file, which is the judgment. For these 17 it is not cited
anywhere, so this cycle has no evidence that anyone ever ruled on them. Marking
them `superseded` on the assumption that someone must have would be exactly the
"기록 없는 수용" this repository's intent gate exists to prevent.

**What the next cycle needs**: the plan review record each row points at. Note
that for several of them that record no longer contains the claim — see 3.

### 2. Measured, still open (1 item)

- `backlog:50142decbaed` — "tombstone producer가 프로덕션에 존재하지 않는다 — G2의
  tombstone 축이 사실상 test 전용이다" (2026-08-14, multi-session-work-loop M5
  PR-Codex final round). No production code writes a `kind='tombstone'` record.
  This is a real, unfixed gap; it is deferred rather than fixed because closing
  it means designing a producer, which is a milestone, not a disposition.

### 3. Findings whose claim text no longer exists (13 items)

`.claude/reviews/plan-review-<work-unit>.md` holds **one file per work unit**, and
each new gate run overwrites it. The findings registry stores only
`claim_digest`, never the claim, and the SessionStart banner tells the reader
that "원문은 각 항목이 가리키는 리뷰 기록에 있습니다".

Measured on this tree: of the 14 undisposed CRITICAL registry findings, exactly
**4** could be traced back to a surviving claim by recomputing `deriveFindingId`
over the review records. For the other 10 the text the finding refers to has
been overwritten and cannot be recovered from this repository.

This is itself a defect in the evidence chain rather than a property of the
findings, and M10 records it as one (`IV6` in
[intent-violation-ledger.json](intent-violation-ledger.json)). An item whose
claim cannot be read cannot be honestly judged, so it is deferred.

One of the four traceable findings was closed instead: `findings:46454d7b7d8f`
("C1 will be computed but depends on M8") is `obsolete` — M8 is complete, so the
dependency the finding was about no longer exists.

**What the next cycle needs**: either a review record that is not overwritten per
work unit, or a claim field in the registry. Until one of those exists this class
of finding will keep being unjudgeable, and deferring it again would be the
honest outcome a second time.

## What this file does not claim

It does not claim these items are low priority, or that a later cycle will
definitely take them. It records that they were counted, that no evidence was
found to close them, and where the next reader should start.
