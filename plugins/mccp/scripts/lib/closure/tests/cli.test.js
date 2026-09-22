'use strict';

// closure-accounting M5 Task 4 (backlog 1829) — the human table.
//
// `report.test.js` pins the object; nothing pinned what a reader actually sees.
// The producer lines under the registry row and the gap lines are the two places
// a number can be printed without the sentence that qualifies it, so those are
// what this file renders from fixtures and reads back.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Same guard as report.test.js: a suite run from another directory must still
// load the module it names, not quietly pass against nothing.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
assert.ok(fs.existsSync(path.join(REPO_ROOT, '.git')),
  'REPO_ROOT must resolve to the repository, not the launch directory: ' + REPO_ROOT);

const { formatTable } = require('../cli');

function observed(open, total, accepted) {
  return { total: total, open: open, accepted: accepted, closed: total - open, by_closure_type: {} };
}

const PRODUCERS = [
  { channel: 'plan-codex-runner', registers: true, pending_owner: null,
    reachable: { adjudicated: true, closure_types: ['deferred', 'rejected'] }, observed: observed(3, 5, 3) },
  { channel: 'plan-review-panel', registers: true, pending_owner: 'diverse-agent-review #1.5',
    reachable: { adjudicated: false, closure_types: ['deferred'] }, observed: observed(10, 12, 0) },
  { channel: 'santa-loop', registers: true, pending_owner: null,
    reachable: { adjudicated: false, closure_types: [] }, observed: observed(2, 2, 0) },
  { channel: 'plan-review-l3', registers: false, pending_owner: null,
    reachable: { adjudicated: false, closure_types: [] }, observed: observed(0, 0, 0) },
  { channel: 'unattributed', registers: null, pending_owner: null, reachable: null, observed: observed(1, 1, 0) },
];

function registryRow(extra) {
  return Object.assign({
    name: 'findings-registry', closed: 4, total: 20, pct: 20,
    denominator_note: 'live registry entries', producers: PRODUCERS,
  }, extra || {});
}

function linesUnder(out, heading) {
  const all = out.split('\n');
  const at = all.indexOf(heading);
  assert.ok(at !== -1, 'heading present: ' + heading);
  const rest = all.slice(at + 1);
  const end = rest.findIndex(function (l) { return !/^\s/.test(l); });
  return end === -1 ? rest : rest.slice(0, end);
}

test('(c1) one line per producer channel, each carrying what it can and cannot reach', () => {
  const out = formatTable({ ledgers: [registryRow()] });
  const block = linesUnder(out, '    Producers:');
  assert.strictEqual(block.length, 5, block.join('\n'));
  const byChannel = {};
  for (const l of block) byChannel[l.trim().split(/\s+/)[0]] = l;

  assert.match(byChannel['plan-review-l3'], /not registered in the findings registry$/);
  assert.match(byChannel['plan-review-l3'], /open 0 \/ total 0/, 'counts stay visible so the row can be summed');
  assert.match(byChannel.unattributed, /not a declared producer$/);
  assert.match(byChannel['plan-review-panel'], /\(owner: diverse-agent-review #1\.5\)$/);
  assert.ok(!/owner:/.test(byChannel['plan-codex-runner']), 'no owner suffix without an owner');
  assert.match(byChannel['plan-codex-runner'], /closures reachable: deferred, rejected · adjudication: reachable/);
  assert.match(byChannel['santa-loop'], /closures reachable: none · adjudication: unreachable/);
});

test('(c2) an uncounted row says so and sends the reader to Denominator — never `null`', () => {
  const out = formatTable({ ledgers: [registryRow({ closed: null, total: null, pct: null,
    denominator_note: 'NOT COUNTED (see degraded)' })] });
  assert.match(out, /Closed:\s+not counted \(see Denominator\)/);
  assert.match(out, /Pct:\s+n\/a/);
  assert.ok(!/null/.test(out), out);
});

test('(c3) the gap lines render their qualifier, and an unknown number is n/a', () => {
  const known = formatTable({ denominator_gap: {
    count: 525, pct: 15.65, net_change: 514, sealed_not_live: 11, sealed_not_live_disposed: 1 } });
  assert.match(known, /^ {2}Net change: {6}514 \(live − sealed; may be negative\)$/m);
  assert.match(known, /^ {2}Sealed not live: 11 \(1 with a disposition — dropped at the next re-seal\)$/m);

  const none = formatTable({ denominator_gap: {
    count: 3, pct: 1, net_change: -2, sealed_not_live: 5, sealed_not_live_disposed: 0 } });
  assert.match(none, /Net change: {6}-2 \(/, 'a shrinking pile is printed negative, not clamped');
  assert.match(none, /Sealed not live: 5 \(none with a disposition\)/);

  const unknown = formatTable({ denominator_gap: {
    count: null, pct: null, net_change: 4, sealed_not_live: null, sealed_not_live_disposed: null } });
  assert.match(unknown, /Count: {11}n\/a/);
  assert.match(unknown, /Percentage: {6}n\/a$/m);
  assert.match(unknown, /Sealed not live: n\/a$/m);
  const partial = formatTable({ denominator_gap: {
    count: 1, pct: 1, net_change: 1, sealed_not_live: 7, sealed_not_live_disposed: null } });
  assert.match(partial, /Sealed not live: 7 \(dispositions among them: n\/a\)/);
  for (const out of [known, none, unknown, partial]) assert.ok(!/null/.test(out), out);
});

test('(c4) a row with no producers key prints no Producers line', () => {
  // The branch keys off the KEY, not the row name — the disposition row has none.
  const out = formatTable({ ledgers: [{ name: 'disposition-ledger', closed: 1, total: 2, pct: 50,
    resolved: 1, fixed: 1, denominator_note: 'sealed inventory' }] });
  assert.ok(!/Producers:/.test(out), out);
  assert.match(formatTable({ ledgers: [registryRow()] }), /Producers:/, 'positive control');
});
