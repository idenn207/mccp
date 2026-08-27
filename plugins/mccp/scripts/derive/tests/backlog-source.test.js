'use strict';

// santa-delta-review M3 Task 1 — backlog parser regression.
//
// What is frozen here are INVARIANTS, not this repository's row counts: the
// counts move every time a gate appends a finding (measured 171/443 -> 181/453
// while the M3 plan gate was running). The invariants are:
//
//   1. GFM makes boundary pipes optional, so all four pipe forms of the same
//      row must parse identically (DD1).
//   2. A row-shaped line that fails the cell-count or date check is COUNTED,
//      not silently dropped (DD2) — the fixture plants a bad row so that
//      restoring `invalid_count: 0` as a literal turns this file red.
//   3. Prose carrying a stray `|` is not misread as a row — the surface that
//      loosening rule 1 opens is closed by the strict date cell.
//   4. A finding containing `|` keeps its tail instead of being truncated at
//      the first one.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scanBacklog } = require('../sources/backlog');

const HEADER = [
  '# Backlog',
  '',
  '| Date | Severity | Source plan | Finding |',
  '| --- | --- | --- | --- |',
];

function makeRepo(bodyLines) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-backlog-src-'));
  fs.mkdirSync(path.join(root, '.claude', 'plans'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.claude', 'plans', 'codex-findings-backlog.md'),
    HEADER.concat(bodyLines).join('\n') + '\n',
    'utf8'
  );
  return root;
}

test('all four GFM pipe forms of the same row parse identically', () => {
  const forms = {
    both: '| 2026-08-25 | HIGH | .claude/plans/x.plan.md | finding text |',
    leading: '| 2026-08-25 | HIGH | .claude/plans/x.plan.md | finding text',
    trailing: '2026-08-25 | HIGH | .claude/plans/x.plan.md | finding text |',
    neither: '2026-08-25 | HIGH | .claude/plans/x.plan.md | finding text',
  };
  const parsed = {};
  for (const name of Object.keys(forms)) {
    const r = scanBacklog(makeRepo([forms[name]]));
    assert.equal(r.ok, true, name + ': ok');
    assert.equal(r.count, 1, name + ': one row parsed');
    assert.equal(r.invalid_count, 0, name + ': no invalid rows');
    parsed[name] = r.items[0];
  }
  for (const name of ['leading', 'trailing', 'neither']) {
    assert.deepEqual(parsed[name], parsed.both, name + ' matches the both-pipes form');
  }
  assert.deepEqual(parsed.both, {
    date: '2026-08-25',
    severity: 'HIGH',
    source_plan: '.claude/plans/x.plan.md',
    finding: 'finding text',
  });
});

test('every pipe form contributes to the same row count in one file', () => {
  const r = scanBacklog(makeRepo([
    '| 2026-08-25 | HIGH | a.md | one |',
    '| 2026-08-25 | HIGH | a.md | two',
    '2026-08-25 | HIGH | a.md | three |',
    '2026-08-25 | HIGH | a.md | four',
  ]));
  assert.equal(r.count, 4);
  assert.equal(r.invalid_count, 0);
  assert.deepEqual(r.items.map((i) => i.finding), ['one', 'two', 'three', 'four']);
});

test('row-shaped lines that fail the checks are counted, not dropped', () => {
  // Each bad line below is row-shaped (canonical leading pipe) but fails one
  // of the two checks. If `invalid_count` ever regresses to a literal 0 this
  // assertion is what catches it.
  const r = scanBacklog(makeRepo([
    '| 2026-08-25 | HIGH | a.md | good row |',
    '| 2026-08 | HIGH | a.md | date is not a full ISO date |',
    '| not-a-date | HIGH | a.md | date cell is prose |',
    '| 2026-08-25 | HIGH | only three columns |',
  ]));
  assert.equal(r.count, 1, 'only the well-formed row becomes an item');
  assert.equal(r.invalid_count, 3, 'the three attempted rows are counted');
  assert.equal(r.degraded, true, 'degraded is derived from invalid_count, not hardcoded');
});

test('a clean file reports degraded=false with a real (not literal) count', () => {
  const r = scanBacklog(makeRepo(['| 2026-08-25 | LOW | a.md | fine |']));
  assert.equal(r.invalid_count, 0);
  assert.equal(r.degraded, false);
});

test('prose carrying a stray pipe is not misread as a row', () => {
  const r = scanBacklog(makeRepo([
    '| 2026-08-25 | HIGH | a.md | real row |',
    'See `a | b` for the pipe form, and note the table above.',
    'Run `grep -c foo | wc -l` to count them.',
    '',
    'A sentence with | one pipe.',
  ]));
  assert.equal(r.count, 1, 'only the real row parsed');
  assert.equal(r.invalid_count, 0, 'prose is not counted as an attempted row');
  assert.equal(r.degraded, false);
});

test('a finding containing pipes keeps its tail', () => {
  const r = scanBacklog(makeRepo([
    '| 2026-08-25 | HIGH | a.md | uses `a | b` then adds **ABSORBED** |',
  ]));
  assert.equal(r.count, 1);
  assert.equal(r.items[0].finding, 'uses `a | b` then adds **ABSORBED**');
});

test('header absent / file absent keep their existing contracts', () => {
  const noHeader = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-backlog-nohdr-'));
  fs.mkdirSync(path.join(noHeader, '.claude', 'plans'), { recursive: true });
  fs.writeFileSync(
    path.join(noHeader, '.claude', 'plans', 'codex-findings-backlog.md'),
    '# Backlog\n\nno table here\n',
    'utf8'
  );
  const r1 = scanBacklog(noHeader);
  assert.equal(r1.ok, true);
  assert.equal(r1.count, 0);
  assert.equal(r1.invalid_count, 0);
  assert.match(r1.warning, /header not found/);

  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-backlog-none-'));
  const r2 = scanBacklog(empty);
  assert.deepEqual(r2, { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null });
});

test('the return shape is unchanged so consumers need no edit', () => {
  const r = scanBacklog(makeRepo(['| 2026-08-25 | LOW | a.md | fine |']));
  assert.deepEqual(
    Object.keys(r).sort(),
    ['count', 'degraded', 'error', 'invalid_count', 'items', 'ok']
  );
});
