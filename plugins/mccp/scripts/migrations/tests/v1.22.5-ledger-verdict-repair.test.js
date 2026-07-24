'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const mig = require('../v1.22.5-ledger-verdict-repair');
const store = require('../../lib/completion-ledger/store');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-ledger-mig-')); }
function cleanup(d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* ignore */ } }
function ledgerDir(root) { return path.join(root, '.claude', 'state', 'completion-ledger'); }
function countLedger(root) {
  try { return fs.readdirSync(ledgerDir(root)).filter(function (n) { return n.endsWith('.json'); }).length; }
  catch (_e) { return 0; }
}

let LEDGER_SEQ = 0;
function writeLedger(root, id, verdict, over) {
  const dir = ledgerDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const entry = Object.assign({
    decision_id: id,
    gate: 'mccp-pr-codex',
    verdict: verdict,
    version: null,
    completed_at: '2026-01-01T00:00:00.000Z',
    commit_sha: null,
    plan_basename: id + '.plan.md',
    plan_file_hash: null,
    risks_closed: [],
    oq_closed: [],
    receipt_hash: 'sha256:' + 'a'.repeat(64),
  }, over || {});
  LEDGER_SEQ += 1;
  const fname = id + '__' + String(LEDGER_SEQ).padStart(12, '0') + '.json';
  const file = path.join(dir, fname);
  fs.writeFileSync(file, JSON.stringify({ schema_version: 'v1', entry: entry }, null, 2) + '\n');
  return { file: file, fname: fname };
}
function writeShip(root, id, codexVerdict) {
  const dir = path.join(root, '.claude', 'receipts', 'mccp-pr-codex');
  fs.mkdirSync(dir, { recursive: true });
  const res = { converged: true };
  if (codexVerdict !== undefined) res.codex_verdict = codexVerdict;
  fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify({ decision_id: id, resolution: res }));
}

// ── classifyProvenance oracle ─────────────────────────────────────────────────

test('classifyProvenance: ship absent → legacy-unknown', () => {
  assert.equal(mig.classifyProvenance({ verdict: 'converged' }, { present: false, codex_verdict: null }), 'legacy-unknown');
});
test('classifyProvenance: ship present but no codex_verdict → legacy-unknown', () => {
  assert.equal(mig.classifyProvenance({ verdict: 'converged' }, { present: true, codex_verdict: null }), 'legacy-unknown');
});
test('classifyProvenance: verdicts agree → codex-verdict', () => {
  assert.equal(mig.classifyProvenance({ verdict: 'converged' }, { present: true, codex_verdict: 'converged' }), 'codex-verdict');
  assert.equal(mig.classifyProvenance({ verdict: 'skipped' }, { present: true, codex_verdict: 'skipped' }), 'codex-verdict');
  assert.equal(mig.classifyProvenance({ verdict: 'advisory' }, { present: true, codex_verdict: 'unavailable' }), 'codex-verdict');
});
test('classifyProvenance: verdicts disagree → superseded', () => {
  assert.equal(mig.classifyProvenance({ verdict: 'converged' }, { present: true, codex_verdict: 'divergent' }), 'superseded');
  assert.equal(mig.classifyProvenance({ verdict: 'converged' }, { present: true, codex_verdict: 'skipped' }), 'superseded');
});

// ── migrate ───────────────────────────────────────────────────────────────────

test('migrate: marks mixed corpus + cardinality invariant + no drops', () => {
  const root = tmp();
  try {
    writeLedger(root, 'agree', 'converged'); writeShip(root, 'agree', 'converged');   // codex-verdict
    writeLedger(root, 'skip-ok', 'skipped'); writeShip(root, 'skip-ok', 'skipped');    // codex-verdict
    writeLedger(root, 'legacy-ship', 'converged'); writeShip(root, 'legacy-ship');     // legacy-unknown (no codex_verdict)
    writeLedger(root, 'no-ship', 'converged');                                          // legacy-unknown (uncomparable)
    writeLedger(root, 'false-pos', 'converged'); writeShip(root, 'false-pos', 'divergent'); // superseded

    const before = countLedger(root);
    const r = mig.migrate({ repoRoot: root });
    assert.equal(r.state, 'complete');
    assert.equal(r.scanned, 5);
    assert.equal(r.changed, 5);
    assert.equal(r.by_provenance['codex-verdict'], 2);
    assert.equal(r.by_provenance['legacy-unknown'], 2);
    assert.equal(r.by_provenance['superseded'], 1);
    // cardinality invariant — never drops or creates a ledger entry
    assert.equal(r.cardinality_before, before);
    assert.equal(r.cardinality_after, before);
    assert.equal(countLedger(root), before);

    // every entry now has a valid provenance + still validates
    const led = store.readLedger(root);
    assert.equal(led.entries.length, 5);
    for (const e of led.entries) {
      assert.ok(store.VALID_PROVENANCE.indexOf(e.verdict_provenance) !== -1,
        'entry ' + e.decision_id + ' got provenance ' + e.verdict_provenance);
    }
  } finally { cleanup(root); }
});

test('migrate: idempotent — a second run marks nothing new', () => {
  const root = tmp();
  try {
    writeLedger(root, 'agree', 'converged'); writeShip(root, 'agree', 'converged');
    writeLedger(root, 'no-ship', 'converged');
    mig.migrate({ repoRoot: root });
    const second = mig.migrate({ repoRoot: root });
    assert.equal(second.changed, 0);
    assert.equal(second.unchanged, 2);
    assert.equal(second.cardinality_before, second.cardinality_after);
  } finally { cleanup(root); }
});

test('migrate: --dry-run writes nothing to disk', () => {
  const root = tmp();
  try {
    const { file } = writeLedger(root, 'agree', 'converged');
    writeShip(root, 'agree', 'converged');
    const before = fs.readFileSync(file, 'utf8');
    const r = mig.migrate({ repoRoot: root, dryRun: true });
    assert.equal(r.dry_run, true);
    assert.equal(r.changed, 1); // would change
    assert.equal(fs.readFileSync(file, 'utf8'), before, 'dry-run must not mutate the entry file');
    // no marker written on dry-run
    assert.equal(fs.existsSync(path.join(root, mig.MARKER_REL)), false);
  } finally { cleanup(root); }
});

test('migrate: superseded entry is PRESERVED — verdict unchanged, file kept', () => {
  const root = tmp();
  try {
    const { fname } = writeLedger(root, 'false-pos', 'converged');
    writeShip(root, 'false-pos', 'divergent');
    mig.migrate({ repoRoot: root });
    const onDisk = JSON.parse(fs.readFileSync(path.join(ledgerDir(root), fname), 'utf8'));
    assert.equal(onDisk.entry.verdict, 'converged', 'original verdict preserved (mark, not rewrite)');
    assert.equal(onDisk.entry.verdict_provenance, 'superseded');
    assert.equal(fs.existsSync(path.join(ledgerDir(root), fname)), true, 'file NOT dropped');
  } finally { cleanup(root); }
});

test('migrate: receipt_hash + filename identity preserved (no rehash)', () => {
  const root = tmp();
  try {
    const rh = 'sha256:' + 'e'.repeat(64);
    const { fname } = writeLedger(root, 'agree', 'converged', { receipt_hash: rh });
    writeShip(root, 'agree', 'converged');
    mig.migrate({ repoRoot: root });
    // same filename still exists (identity is <decision>__<hash12>)
    assert.equal(fs.existsSync(path.join(ledgerDir(root), fname)), true);
    const onDisk = JSON.parse(fs.readFileSync(path.join(ledgerDir(root), fname), 'utf8'));
    assert.equal(onDisk.entry.receipt_hash, rh, 'receipt_hash untouched');
  } finally { cleanup(root); }
});

test('migrate: writes a completion marker on apply', () => {
  const root = tmp();
  try {
    writeLedger(root, 'agree', 'converged'); writeShip(root, 'agree', 'converged');
    mig.migrate({ repoRoot: root });
    const markerPath = path.join(root, mig.MARKER_REL);
    assert.equal(fs.existsSync(markerPath), true);
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    assert.equal(marker.migration, 'v1.22.5-ledger-verdict-repair');
    assert.equal(marker.cardinality_before, marker.cardinality_after);
    // the marker lives in a dot-subdir, so readLedger never picks it up as an entry
    assert.equal(store.readLedger(root).entries.length, 1);
  } finally { cleanup(root); }
});
