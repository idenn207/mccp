# Deferred HIGH debt — successor for the M10 inventory

**Inventory**: `sha256:f171a42e2c344849b988f613e827b11e3515dfcd777ad1d997645d917e71dfba`
**Sealed at**: commit `9093b08` (2026-09-01)

## What was deferred, and on whose decision

The M10 plan scoped individual adjudication to "still-valid CRITICAL/HIGH". When
the denominator was sealed it came to 1115 items — 448 of them CRITICAL or HIGH,
against the ~37 the plan had estimated from the unmerged M9 branch. The operator
was shown the measured figure and chose **CRITICAL first**: judge the CRITICAL
band item by item, defer HIGH and below with the deferral recorded.

So this file exists because of a scope decision, not because the items were
examined and found unimportant. **None of the items below was read.**

## What was closed anyway, and on what evidence

20 HIGH rows are not here. They are auto-appended panel rows
(`L2 <perspective>: <claim> · 원문 <path> · id=<digest>`) whose digest is cited
again elsewhere in the same backlog file — which is where this repository records
a judgment on a panel finding. That citation is machine-checkable, so those rows
were disposed `superseded` without anyone reading them.

The rest are deferred. The distinction is deliberate: a mechanical trace to an
existing adjudication is evidence; "a HIGH finding is probably fine" is not.

## What is in here

316 items:

- **175** rows written by a person. In the CRITICAL band, rows of this shape
  turned out to be adjudication records almost without exception — the backlog is
  not a list of open defects, it is a mixed ledger of claims and judgments. That
  finding is a strong prior for these 175, but a prior is not evidence, and
  reading them is the work that was deferred.
- **72** auto-appended panel rows whose digest appears nowhere else, so no
  adjudication is locatable for them in this file.
- **69** open registry findings. Most of these cannot be read at all: the review
  records are one file per work unit and each gate run overwrites the previous
  one, so the claim a finding refers to is frequently gone. See
  [debt-deferred-critical.md](debt-deferred-critical.md) §3 for the measurement.

## What deferral does and does not do here

`deferred` is not a suppressing disposition. Every HIGH finding in the registry
listed here keeps appearing in the next session's promotion list, unchanged. What
the deferral records is that M10 counted it and did not judge it.

It also does not move C1. Dispositions live outside the findings registry
precisely so that settling debt cannot inflate the metric that measures whether
findings are resolved where they are found.

## Where the next cycle should start

The 175 human-written rows are the cheapest band: if the CRITICAL ratio holds,
most are already-recorded judgments and a reader can dispose them quickly with
the row itself as evidence. The 72 uncited panel rows and the 69 registry
findings need the review records, and for a share of them those records no
longer contain the claim — that gap is recorded as `IV6` in
[intent-violation-ledger.json](intent-violation-ledger.json) and is worth
closing before another cycle tries to read them.
