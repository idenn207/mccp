# Deferred MEDIUM / LOW / FAIL / UNKNOWN debt — successor for the M10 inventory

**Inventory**: `sha256:f171a42e2c344849b988f613e827b11e3515dfcd777ad1d997645d917e71dfba`
**Sealed at**: commit `9093b08` (2026-09-01)

## Why these are deferred as a batch

CLAUDE.md §3.14 has governed this repository since 2026-08-13: only CRITICAL and
HIGH are absorbed in place; MEDIUM and LOW are appended to the backlog. The
operator restated the same boundary for M10 (UI5 — "이번이 이 PRD의 최종 수정이며
이후 발견되는 backlog는 수정 없이 진행될 가능성이 높다"), and the plan permits a
shared successor for this band while requiring the count to be surfaced.

So this is a batch deferral by standing policy, and the count is the point: it is
reported per successor by `debt-inventory.js verify`
(`deferrals_by_successor`) rather than hidden in a total.

## What is in here

637 items:

| Band | Count | Note |
|---|---|---|
| MEDIUM | 425 | 345 backlog rows written by a person, 80 open registry findings |
| LOW | 141 | 126 backlog rows, 15 registry findings |
| FAIL | 67 | 12 written rows, 55 auto-appended panel rows with no locatable adjudication |
| UNKNOWN | 3 | severity cell carries no enum token (e.g. `RESOLVED-BY-IMPL`), plus the fix-task slot |

4 FAIL rows are **not** here: their digest is cited elsewhere in the backlog, so
they were disposed `superseded` on that mechanical trace.

## FAIL is a synthesized severity, and that is its own open axis

67 of these carry severity `FAIL` because `plan-review/quorum.js` synthesizes a
blocking finding at `severity:'FAIL'` from a bare `verdict='fail'`, regardless of
what the reviewer's own findings were graded. CLAUDE.md §3.14 names this as the
release condition for its own temporary rule:

> 해제 조건 — `quorum.js`가 bare `verdict='fail'`을 `severity:'FAIL'` blocking
> finding으로 합성하지 않게 되면 … 이 절과 backlog의 해당 항목을 함께 정리한다.

That condition is still unmet (`quorum.js:176-182`), and M10 records it as `IV4`
in [intent-violation-ledger.json](intent-violation-ledger.json). Until it is met,
a FAIL row does not tell a reader how severe anything actually was, which is why
none of them were adjudicated on their severity here.

## What this does not do

It does not resolve anything, does not suppress anything from the next session's
promotion list (`deferred` is not a suppressing disposition, and in any case
promotion is CRITICAL/HIGH only), and does not move C1.
