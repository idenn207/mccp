'use strict';

// multi-session-work-loop M10 — debt inventory and disposition ledger.
//
// What is frozen here are INVARIANTS, not this repository's counts. The debt
// totals move every time a gate appends a finding, so a fixture repo is built
// per test and the live tree is never asserted against.
//
//   1. The seal covers `items[]` only, so it can be recomputed and verified.
//      Anything that varies per run (timestamps, commit sha) must live outside
//      it or the seal could never be checked.
//   2. Sealing is once-only. A re-seal would relabel the denominator under
//      dispositions already bound to the old digest.
//   3. Evidence is normalized through the registry's `normalizeCitedPath`, so
//      absolute paths and `..` traversal are refused rather than recorded.
//   4. A severity cell that cannot be read is UNKNOWN, never silently
//      downgraded — an unreadable item must not slip below the CRITICAL/HIGH
//      adjudication bar by being unreadable.
//   5. A truncated backlog claim is unlinkable, not linked on a digest of a
//      different string. A link grants a machine `duplicate` disposition.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const di = require('../msw-metrics/debt-inventory');

const BACKLOG_HEADER = [
  '# Backlog',
  '',
  '| Date | Severity | Source plan | Finding |',
  '| --- | --- | --- | --- |',
];

function makeRepo(opts) {
  const o = opts || {};
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-m10-'));
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'plans'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'state', 'findings'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.claude', 'plans', 'codex-findings-backlog.md'),
    BACKLOG_HEADER.concat(o.backlogRows || []).join('\n') + '\n', 'utf8');
  if (o.findingEvents) {
    fs.writeFileSync(
      path.join(root, '.claude', 'state', 'findings', 'unit.jsonl'),
      o.findingEvents.map(function (e) { return JSON.stringify(e); }).join('\n') + '\n', 'utf8');
  }
  if (o.fixTask) {
    fs.writeFileSync(path.join(root, '.claude', 'state', 'fix-task.md'), o.fixTask, 'utf8');
  }
  return root;
}

function openEvent(over) {
  return Object.assign({
    kind: 'finding_opened',
    ts: '2026-09-01T00:00:00.000Z',
    finding_id: '0123456789abcdef',
    work_unit: 'unit',
    gate_id: 'mccp-plan-codex',
    perspective: 'architect',
    severity: 'HIGH',
    claim_digest: 'aaaaaaaaaaaaaaaa',
    cited_path: null,
    seq: 1,
    event_id: '00000000-0000-4000-8000-000000000001',
    batch_expected: 1,
    gate_decision_id: 'unit',
  }, over || {});
}

// ── invariant 4: severity ────────────────────────────────────────────────────

test('severity takes the first enum token and is UNKNOWN when it has none', () => {
  assert.equal(di.normalizeSeverity('HIGH'), 'HIGH');
  assert.equal(di.normalizeSeverity('CRITICAL/HIGH'), 'CRITICAL');
  assert.equal(di.normalizeSeverity('HIGH→기각'), 'HIGH');
  assert.equal(di.normalizeSeverity('~~MEDIUM~~ **ABSORBED in x (2026-08-16)**'), 'MEDIUM');
  assert.equal(di.normalizeSeverity('LOW (PR security-reviewer)'), 'LOW');
  // Not downgraded to LOW, and not defaulted to anything adjudicable either.
  assert.equal(di.normalizeSeverity('RESOLVED-BY-IMPL'), 'UNKNOWN');
  assert.equal(di.normalizeSeverity(''), 'UNKNOWN');
  assert.equal(di.normalizeSeverity(null), 'UNKNOWN');
});

// ── invariant 3: evidence ────────────────────────────────────────────────────

test('evidence accepts exactly four forms and refuses paths outside the repo', () => {
  const root = makeRepo({});
  const ok = function (v, bare) { return di.classifyEvidence(v, root, { allowBarePath: !!bare }); };

  assert.equal(ok('plugins/mccp/scripts/lib/x.js:12').kind, 'path-line');
  assert.equal(ok('0123456789abcdef0123456789abcdef01234567').kind, 'commit');
  assert.equal(ok('#164').kind, 'pr');
  assert.equal(ok('docs/a.md', true).kind, 'path');

  // A bare path is for --successor only; elsewhere it is not evidence.
  assert.equal(ok('docs/a.md').ok, false);

  assert.equal(ok('../../etc/passwd:1').ok, false);
  assert.equal(ok('/etc/passwd:1').ok, false);
  assert.equal(ok('../outside', true).ok, false);
  assert.equal(ok('').ok, false);
  assert.equal(ok(null).ok, false);

  // Refusal states which path was refused, so the operator can fix it.
  assert.match(ok('../../etc/passwd:1').reason, /outside repository/);
});

// ── invariant 1: the seal covers items only ──────────────────────────────────

test('inventory_sha256 is recomputable from items[] and ignores item order', () => {
  const items = [
    { item_id: 'backlog:b', source: 'backlog', severity: 'LOW', claim_digest: null },
    { item_id: 'findings:a', source: 'findings', severity: 'HIGH', claim_digest: 'x' },
  ];
  const forward = di.inventoryHash(items);
  const reversed = di.inventoryHash(items.slice().reverse());
  assert.equal(forward, reversed);
  assert.match(forward, /^sha256:[0-9a-f]{64}$/);

  // Fields outside the canonical projection do not move the digest — that is
  // what lets meta (timestamps, commit sha) live outside the seal.
  const withNoise = items.map(function (i) {
    return Object.assign({}, i, { coords: { anything: Date.now() }, absorbed_marker: true });
  });
  assert.equal(di.inventoryHash(withNoise), forward);

  // A changed severity IS debt changing, so it must move the digest.
  const changed = items.map(function (i, n) {
    return n === 0 ? Object.assign({}, i, { severity: 'CRITICAL' }) : i;
  });
  assert.notEqual(di.inventoryHash(changed), forward);
});

test('a sealed inventory recomputes to its own digest and refuses a re-seal', () => {
  const root = makeRepo({
    backlogRows: ['| 2026-09-01 | HIGH | a.md | something went wrong |'],
    findingEvents: [openEvent({})],
  });
  const doc = di.sealInventory(root);
  assert.equal(di.inventoryHash(doc.items), doc.inventory_sha256);
  assert.equal(doc.items.length, 2);

  assert.throws(function () { di.sealInventory(root); }, function (err) {
    return err.code === 'ALREADY_SEALED';
  });

  // The refusal must survive as a nonzero exit for the Validation block.
  assert.notEqual(di.runCli(['seal', '--json', '--repo-root', root]), 0);
});

// ── item identity ────────────────────────────────────────────────────────────

test('every source contributes items under its own id prefix', () => {
  const root = makeRepo({
    backlogRows: ['| 2026-09-01 | LOW | a.md | a row |'],
    findingEvents: [openEvent({})],
    fixTask: '---\ntask_fingerprint: some-unit\nverdict: codex_divergent\n---\n## Title\nx\n',
  });
  const built = di.buildInventory(root);
  const prefixes = built.items.map(function (i) { return i.item_id.split(':')[0]; }).sort();
  assert.deepEqual(prefixes, ['backlog', 'findings', 'fix-task']);
  assert.equal(built.stats.by_source.backlog, 1);
  assert.equal(built.stats.by_source.findings, 1);
  assert.equal(built.stats.by_source['fix-task'], 1);

  // The fix-task slot carries an escalation, not a graded finding. Asserting a
  // severity there would put it into the adjudication bar on no evidence.
  const ft = built.items.find(function (i) { return i.source === 'fix-task'; });
  assert.equal(ft.severity, 'UNKNOWN');
});

test('an absent fix-task slot is a state, not a failure', () => {
  const root = makeRepo({ backlogRows: ['| 2026-09-01 | LOW | a.md | a row |'] });
  const built = di.buildInventory(root);
  assert.equal(built.stats.by_source['fix-task'], 0);
  assert.equal(built.stats.total, 1);
});

// ── invariant 5: linking, not folding ────────────────────────────────────────

test('a cross-source duplicate is LINKED, and both rows stay in the denominator', () => {
  const claim = 'the promotion suppression predicate is wrong';
  const digest = require('../../state/findings-registry').claimDigestOf(claim);
  const root = makeRepo({
    backlogRows: ['| 2026-09-01 | HIGH | a.md | L2 architect: ' + claim + ' · 원문 x.md · id=abc |'],
    findingEvents: [openEvent({ claim_digest: digest })],
  });
  const built = di.buildInventory(root);

  assert.equal(built.stats.total, 2, 'both ledger entries are still counted');
  assert.equal(built.stats.duplicate_links, 1);
  const row = built.items.find(function (i) { return i.source === 'backlog'; });
  assert.equal(row.duplicate_of, 'findings:0123456789abcdef');

  // Folding them would make ONE disposition satisfy both, and since the backlog
  // side can earn a machine `superseded` from prose, a sentence would silence a
  // finding. Each side keeps needing its own disposition.
  const finding = built.items.find(function (i) { return i.source === 'findings'; });
  assert.equal(finding.duplicate_of, undefined);
});

test('a truncated backlog claim is not linked on a digest of a different string', () => {
  const claim = 'the promotion suppression predicate is wrong';
  const digest = require('../../state/findings-registry').claimDigestOf(claim);
  const root = makeRepo({
    backlogRows: ['| 2026-09-01 | HIGH | a.md | L2 architect: ' + claim.slice(0, 20) + '… · 원문 x.md · id=abc |'],
    findingEvents: [openEvent({ claim_digest: digest })],
  });
  const built = di.buildInventory(root);
  const row = built.items.find(function (i) { return i.source === 'backlog'; });
  assert.equal(row.claim_truncated, true);
  assert.equal(row.claim_digest, null);
  assert.equal(built.stats.duplicate_links, 0);
});

// ── machine disposition inputs ───────────────────────────────────────────────

test('the absorbed marker matches the written marker, not the Korean verb', () => {
  const root = makeRepo({
    backlogRows: [
      '| 2026-09-01 | HIGH | a.md | fixed here **ABSORBED in this PR** |',
      '| 2026-09-01 | HIGH | a.md | R1 지적을 흡수해 문장을 고쳤다 |',
    ],
  });
  const built = di.buildInventory(root);
  assert.equal(built.stats.absorbed_marked, 1,
    '흡수 as ordinary prose must not earn a machine superseded disposition');
});

// ── dispositions ─────────────────────────────────────────────────────────────

function sealed(opts) {
  const root = makeRepo(opts);
  const doc = di.sealInventory(root);
  return { root, doc };
}

test('a disposition binds to the seal and must name an item inside it', () => {
  const { root, doc } = sealed({
    backlogRows: ['| 2026-09-01 | HIGH | a.md | a row |'],
    findingEvents: [openEvent({ severity: 'CRITICAL' })],
  });
  const findingItem = doc.items.find(function (i) { return i.source === 'findings'; });

  const ok = di.appendDispositions(root, [{
    item_id: findingItem.item_id, disposition: 'fixed', evidence: '#164',
  }]);
  assert.equal(ok.ok, true);
  assert.equal(ok.appended, 1);

  const led = di.readDispositions(root);
  assert.equal(led.lines[0].inventory_sha256, doc.inventory_sha256);

  const bad = di.appendDispositions(root, [{
    item_id: 'findings:ffffffffffffffff', disposition: 'fixed', evidence: '#164',
  }]);
  assert.equal(bad.ok, false);
  assert.match(bad.rejected[0].reason, /not in the sealed inventory/);
});

test('a batch is all-or-nothing so a partial write cannot land in an append-only ledger', () => {
  const { root, doc } = sealed({ backlogRows: ['| 2026-09-01 | LOW | a.md | a row |'] });
  const good = doc.items[0].item_id;
  const res = di.appendDispositions(root, [
    { item_id: good, disposition: 'fixed', evidence: '#1' },
    { item_id: 'backlog:deadbeefdeadbeef', disposition: 'fixed', evidence: '#1' },
  ]);
  assert.equal(res.ok, false);
  assert.equal(res.appended, 0);
  assert.equal(di.readDispositions(root).lines.length, 0);
});

test('each disposition demands the evidence its own kind requires', () => {
  const { root, doc } = sealed({
    backlogRows: [
      '| 2026-09-01 | LOW | a.md | one |',
      '| 2026-09-01 | LOW | a.md | two |',
    ],
  });
  const [a, b] = doc.items.map(function (i) { return i.item_id; });
  const attempt = function (rec) {
    return di.validateDisposition(root, Object.assign({ item_id: a }, rec),
      new Map(doc.items.map(function (i) { return [i.item_id, i]; })), doc.inventory_sha256);
  };

  assert.equal(attempt({ disposition: 'fixed' }).ok, false, 'fixed needs evidence');
  assert.equal(attempt({ disposition: 'fixed', evidence: '#12' }).ok, true);
  assert.equal(attempt({ disposition: 'duplicate' }).ok, false, 'duplicate needs a twin');
  assert.equal(attempt({ disposition: 'duplicate', duplicate_of: b }).ok, true);
  assert.equal(attempt({ disposition: 'deferred', evidence: '#12' }).ok, false,
    'deferred needs a successor, and evidence is not one');
  assert.equal(attempt({ disposition: 'invented' }).ok, false);
});

test('a successor must exist AND name the seal, closing the static-file trap', () => {
  const { root, doc } = sealed({ backlogRows: ['| 2026-09-01 | LOW | a.md | one |'] });
  const item = doc.items[0].item_id;
  const index = new Map(doc.items.map(function (i) { return [i.item_id, i]; }));
  const attempt = function (successor) {
    return di.validateDisposition(root,
      { item_id: item, disposition: 'deferred', successor },
      index, doc.inventory_sha256);
  };

  assert.equal(attempt('docs/nope.md').ok, false, 'a missing file is not a successor');

  // A file that already exists is NOT enough. That is the trap the M9 gate's
  // own comment names: a committed static file is true forever, so any repo
  // file could absorb an unlimited deferral.
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'bystander.md'), 'unrelated\n', 'utf8');
  const bystander = attempt('docs/bystander.md');
  assert.equal(bystander.ok, false);
  assert.match(bystander.reason, /does not name the inventory/);

  fs.writeFileSync(path.join(root, 'docs', 'successor.md'),
    'This takes items from ' + doc.inventory_sha256 + '\n', 'utf8');
  assert.equal(attempt('docs/successor.md').ok, true);
});

test('verify reports open items, binding, and the CRITICAL/HIGH fixed floor', () => {
  const { root, doc } = sealed({
    backlogRows: ['| 2026-09-01 | HIGH | a.md | a row |'],
    findingEvents: [openEvent({ severity: 'CRITICAL' })],
  });
  let r = di.verifyDispositions(root);
  assert.equal(r.ok, false);
  assert.equal(r.open, 2);
  assert.equal(r.seal_intact, true);

  for (const it of doc.items) {
    di.appendDispositions(root, [{ item_id: it.item_id, disposition: 'fixed', evidence: '#164' }]);
  }
  r = di.verifyDispositions(root);
  assert.equal(r.open, 0);
  assert.equal(r.unmatched_dispositions, 0);
  assert.equal(r.binding_mismatch, 0);
  assert.ok(r.adjudicable_fixed >= 1);
  assert.equal(r.ok, true);
});

test('a line bound to a different seal is counted, not silently honoured', () => {
  const { root, doc } = sealed({ backlogRows: ['| 2026-09-01 | HIGH | a.md | a row |'] });
  fs.appendFileSync(di.dispositionsPath(root), JSON.stringify({
    item_id: doc.items[0].item_id, disposition: 'fixed', evidence: '#1',
    inventory_sha256: 'sha256:' + '0'.repeat(64), disposed_at: '2026-09-01T00:00:00.000Z',
  }) + '\n', 'utf8');
  const r = di.verifyDispositions(root);
  assert.equal(r.binding_mismatch, 1);
  assert.equal(r.open, 1, 'a mismatched line does not dispose its item');
  assert.equal(r.ok, false);
});

test('a malformed ledger line is counted rather than skipped', () => {
  const { root, doc } = sealed({ backlogRows: ['| 2026-09-01 | HIGH | a.md | a row |'] });
  di.appendDispositions(root, [{ item_id: doc.items[0].item_id, disposition: 'fixed', evidence: '#1' }]);
  fs.appendFileSync(di.dispositionsPath(root), '{ not json\n', 'utf8');
  const r = di.verifyDispositions(root);
  assert.equal(r.malformed_lines, 1);
  assert.equal(r.ok, false, 'an unreadable line means the ledger is not fully accounted for');
});

test('deferral concentration is surfaced rather than capped', () => {
  const { root, doc } = sealed({
    backlogRows: [
      '| 2026-09-01 | LOW | a.md | one |',
      '| 2026-09-01 | LOW | a.md | two |',
    ],
  });
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'next.md'), doc.inventory_sha256 + '\n', 'utf8');
  for (const it of doc.items) {
    di.appendDispositions(root, [{
      item_id: it.item_id, disposition: 'deferred', successor: 'docs/next.md',
    }]);
  }
  const r = di.verifyDispositions(root);
  assert.equal(r.deferrals_by_successor['docs/next.md'], 2);
  // No threshold blocks it — but with zero CRITICAL/HIGH fixed the gate is red,
  // so deferring everything is visible rather than quietly successful.
  assert.equal(r.adjudicable_fixed, 0);
  assert.equal(r.ok, false);
});

// ── backlog open/closed split ────────────────────────────────────────────────

test('one ledger line moves a backlog row from open to closed, and resolved tracks separately', () => {
  const { scanBacklog } = require('../../derive/sources/backlog');
  const { root, doc } = sealed({
    backlogRows: [
      '| 2026-09-01 | HIGH | a.md | one |',
      '| 2026-09-01 | LOW | a.md | two |',
    ],
  });
  const before = scanBacklog(root);
  assert.equal(before.count, 2);
  assert.equal(before.open_count, 2);
  assert.equal(before.closed_count, 0);

  di.appendDispositions(root, [{
    item_id: doc.items[0].item_id, disposition: 'fixed', evidence: '#164',
  }]);
  const after = scanBacklog(root);
  assert.equal(after.count, 2, 'the table itself is never edited');
  assert.equal(after.open_count, 1);
  assert.equal(after.closed_count, 1);
  assert.equal(after.resolved_count, 1);

  // A deferral is disposed but NOT resolved. Reading closed_count as "dealt
  // with" is the misreading the second field exists to prevent.
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'next.md'), doc.inventory_sha256 + '\n', 'utf8');
  di.appendDispositions(root, [{
    item_id: doc.items[1].item_id, disposition: 'deferred', successor: 'docs/next.md',
  }]);
  const end = scanBacklog(root);
  assert.equal(end.closed_count, 2);
  assert.equal(end.resolved_count, 1);
  assert.equal(end.open_count, 0);
});

test('a ledger bound to another seal does not close any backlog row', () => {
  const { scanBacklog } = require('../../derive/sources/backlog');
  const { root, doc } = sealed({ backlogRows: ['| 2026-09-01 | HIGH | a.md | one |'] });
  fs.appendFileSync(di.dispositionsPath(root), JSON.stringify({
    item_id: doc.items[0].item_id, disposition: 'fixed', evidence: '#1',
    inventory_sha256: 'sha256:' + '0'.repeat(64), disposed_at: '2026-09-01T00:00:00.000Z',
  }) + '\n', 'utf8');
  assert.equal(scanBacklog(root).open_count, 1);
});

// ── suppression (both directions) ────────────────────────────────────────────

test('suppression removes disposed findings and keeps everything else', () => {
  const handoff = require('../../state/handoff-items');
  const { root, doc } = sealed({
    findingEvents: [
      openEvent({ finding_id: 'aaaaaaaaaaaaaaaa', severity: 'CRITICAL', seq: 1,
        event_id: '00000000-0000-4000-8000-00000000000a', batch_expected: 2 }),
      openEvent({ finding_id: 'bbbbbbbbbbbbbbbb', severity: 'CRITICAL', seq: 2,
        event_id: '00000000-0000-4000-8000-00000000000b', batch_expected: 2 }),
    ],
  });
  assert.equal(doc.items.length, 2);

  // (b) before any disposition, both are promoted.
  let ids = handoff.enumerateOpenFindings(root).items.map(function (i) { return i.id; }).sort();
  assert.deepEqual(ids, ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb']);

  // (a) a resolving disposition removes exactly one.
  di.appendDispositions(root, [{
    item_id: 'findings:aaaaaaaaaaaaaaaa', disposition: 'fixed', evidence: '#164',
  }]);
  ids = handoff.enumerateOpenFindings(root).items.map(function (i) { return i.id; });
  assert.deepEqual(ids, ['bbbbbbbbbbbbbbbb'],
    'the undisposed CRITICAL must still be promoted');

  // (c) a corrupt ledger suppresses nothing — over-suppression is the unsafe
  // direction, and nothing downstream would detect it.
  fs.writeFileSync(di.dispositionsPath(root), 'garbage not json\n', 'utf8');
  ids = handoff.enumerateOpenFindings(root).items.map(function (i) { return i.id; }).sort();
  assert.deepEqual(ids, ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb']);
});

test('a deferred CRITICAL is still promoted — the L2 HIGH that three perspectives landed', () => {
  const handoff = require('../../state/handoff-items');
  const { root, doc } = sealed({
    findingEvents: [openEvent({ finding_id: 'cccccccccccccccc', severity: 'CRITICAL' })],
  });
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'next.md'), doc.inventory_sha256 + '\n', 'utf8');

  di.appendDispositions(root, [{
    item_id: 'findings:cccccccccccccccc', disposition: 'deferred', successor: 'docs/next.md',
  }]);
  const ids = handoff.enumerateOpenFindings(root).items.map(function (i) { return i.id; });
  assert.deepEqual(ids, ['cccccccccccccccc'],
    'deferring decides who fixes it, never whether the next session hears about it');

  // Same for a rejection: the registry still calls it open, so the list does too.
  di.appendDispositions(root, [{
    item_id: 'findings:cccccccccccccccc', disposition: 'rejected', evidence: '#164',
  }]);
  assert.equal(handoff.enumerateOpenFindings(root).items.length, 1);
});

// ── Task 6: a still-valid CRITICAL, actually fixed ───────────────────────────

test('the C2 attribution line reports a missing count as unknown, not as zero', () => {
  const { coReportDetails } = require('../renderer/sections/msw-metrics');
  const lineFor = function (ac) {
    return coReportDetails({ C2: { attribution_coverage: ac } })
      .find(function (t) { return t.indexOf('C2/C3 귀속') === 0; });
  };

  assert.match(lineFor({ with_gate_decision: 119, with_remediation_pr: 0, findings_total: 178 }),
    /차단 판정 연결 119건 · 해소 PR 연결 0건 · finding 전수 178건/);

  // Absent is not zero. Reporting "0건" for a count nobody measured is the same
  // confidently-wrong shape this PRD exists to remove.
  const unknown = lineFor({ with_gate_decision: null, findings_total: undefined });
  assert.match(unknown, /차단 판정 연결 \?건/);
  assert.match(unknown, /해소 PR 연결 \?건/);
  assert.match(unknown, /finding 전수 \?건/);

  // A non-number never reaches string concatenation as itself.
  const junk = lineFor({ with_gate_decision: {}, with_remediation_pr: '12', findings_total: NaN });
  assert.doesNotMatch(junk, /\[object Object\]/);
  assert.doesNotMatch(junk, /NaN/);
  assert.match(junk, /해소 PR 연결 \?건/, 'a numeric string is still not a number');

  // A real zero keeps saying zero.
  assert.match(lineFor({ with_gate_decision: 0, with_remediation_pr: 0, findings_total: 0 }),
    /차단 판정 연결 0건/);
});

// ── the coverage gate ────────────────────────────────────────────────────────

const gate = require('../msw-metrics/m10-coverage-gate');

function gateRepo(over) {
  const o = over || {};
  const { root, doc } = sealed({
    backlogRows: ['| 2026-09-01 | CRITICAL | a.md | one |'],
  });
  di.appendDispositions(root, [{
    item_id: doc.items[0].item_id, disposition: 'fixed', evidence: '#164',
  }]);

  fs.mkdirSync(path.join(root, '.claude', 'prds'), { recursive: true });
  fs.writeFileSync(path.join(root, gate.PRD_REL),
    '| # | Milestone | Outcome | Status | Plan |\n' +
    '| 10 | **debt** | outcome | ' + (o.status || 'complete') + ' | [p](p.md) |\n', 'utf8');

  fs.mkdirSync(path.join(root, 'docs', 'multi-session-work-loop'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'multi-session-work-loop', 'note.md'),
    (o.assertedText === undefined ? 'the declaration says so' : o.assertedText) + '\n', 'utf8');
  fs.writeFileSync(path.join(root, gate.LEDGER_REL), JSON.stringify({
    items: gate.REQUIRED_IV_IDS.map(function (id) {
      return {
        id: id,
        resolution: 'declaration-corrected',
        evidence: 'docs/multi-session-work-loop/note.md',
        asserted_text: 'the declaration says so',
      };
    }),
  }, null, 1), 'utf8');
  return { root, doc };
}

test('the gate passes only when all four axes hold', () => {
  const { root } = gateRepo();
  const r = gate.evaluateGate({ repoRoot: root });
  assert.equal(r.seal.ok, true);
  assert.equal(r.dispositions.ok, true);
  assert.equal(r.intent_violations.ok, true);
  assert.equal(r.prd_flip.ok, true);
  assert.equal(r.ok, true);
});

test('axes 1 to 3 are evaluated even before the PRD row flips', () => {
  const { root } = gateRepo({ status: 'in-progress' });
  const r = gate.evaluateGate({ repoRoot: root });
  assert.equal(r.ok, false);
  assert.equal(r.prd_flip.ok, false);
  // The M9 gate skipped un-flipped rows entirely, which is why its plan had to
  // mandate two runs. Here the other three axes still say something.
  assert.equal(r.seal.ok, true);
  assert.equal(r.dispositions.ok, true);
  assert.equal(r.intent_violations.ok, true);
});

test('deleting the asserted text from its document turns axis 3 red', () => {
  const { root } = gateRepo();
  assert.equal(gate.evaluateGate({ repoRoot: root }).intent_violations.ok, true);

  // The document still EXISTS — only the sentence is gone. A file-existence
  // predicate would stay green here forever, which is the trap this checks.
  fs.writeFileSync(path.join(root, 'docs', 'multi-session-work-loop', 'note.md'),
    'unrelated content\n', 'utf8');
  const r = gate.evaluateGate({ repoRoot: root });
  assert.equal(r.intent_violations.ok, false);
  assert.match(r.intent_violations.problems[0].reason, /not present/);
  assert.equal(r.ok, false);
});

test('a missing intent-violation id fails rather than being counted as none', () => {
  const { root } = gateRepo();
  const led = JSON.parse(fs.readFileSync(path.join(root, gate.LEDGER_REL), 'utf8'));
  led.items = led.items.filter(function (i) { return i.id !== 'IV3'; });
  fs.writeFileSync(path.join(root, gate.LEDGER_REL), JSON.stringify(led), 'utf8');
  const r = gate.evaluateGate({ repoRoot: root });
  assert.deepEqual(r.intent_violations.missing_ids, ['IV3']);
  assert.equal(r.ok, false);
});

test('an unreadable input fails closed rather than passing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-m10-bare-'));
  const r = gate.evaluateGate({ repoRoot: root });
  assert.equal(r.ok, false);
  assert.equal(r.seal.ok, false);
  assert.match(r.seal.reason, /inventory absent/);
  assert.equal(r.prd_flip.ok, false);
});

test('a disposition line bound to another seal fails axis 1 and leaves the item open', () => {
  const { root, doc } = gateRepo();
  fs.appendFileSync(di.dispositionsPath(root), JSON.stringify({
    item_id: doc.items[0].item_id, disposition: 'fixed', evidence: '#1',
    inventory_sha256: 'sha256:' + '0'.repeat(64), disposed_at: '2026-09-01T00:00:00.000Z',
  }) + '\n', 'utf8');
  const r = gate.evaluateGate({ repoRoot: root });
  assert.equal(r.seal.mismatched_lines, 1);
  assert.equal(r.seal.ok, false);
  assert.equal(r.ok, false);
});

test('the gate recomputes the disposition verdict instead of trusting the producer', () => {
  const { root } = gateRepo();
  const r = gate.evaluateGate({ repoRoot: root });
  // Both numbers are present and compared. If the producer's own verify ever
  // loosens, producer_agrees goes false and the gate fails on the disagreement.
  assert.equal(r.dispositions.producer_agrees, true);
  assert.equal(r.dispositions.recomputed.open, r.dispositions.producer_reported.open);
  assert.equal(r.dispositions.recomputed.adjudicable_fixed, 1);
});

// ── suppression eligibility (the L2 HIGH that three perspectives landed) ─────

test('deferring or rejecting an item never makes it eligible for suppression', () => {
  // The registry already fixed this boundary: RESOLVING_CLOSURE_TYPES is
  // ['fixed','invalidated'] because counting a deferral as a resolution is the
  // manipulation path. The disposition vocabulary mirrors it.
  for (const d of ['deferred', 'rejected']) {
    assert.ok(di.DISPOSITIONS.includes(d));
    assert.ok(!di.SUPPRESSING_DISPOSITIONS.includes(d),
      d + ' must not suppress a still-open finding from the next session');
  }
  for (const d of di.SUPPRESSING_DISPOSITIONS) {
    assert.ok(di.DISPOSITIONS.includes(d));
  }
});
