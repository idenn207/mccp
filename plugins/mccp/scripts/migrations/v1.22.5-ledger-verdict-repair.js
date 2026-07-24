#!/usr/bin/env node
'use strict';

// v1.22.5 M1 — completion-ledger verdict-provenance repair.
//
// M1 retires resolution.converged as the ledger's trust key: NEW appends are
// codex_verdict-first and mark themselves verdict_provenance='codex-verdict'.
// Existing (pre-M1) ledger entries have NO provenance field. This migration
// re-judges each existing entry against its ship receipt and stamps a
// verdict_provenance so audits can tell a corroborated entry from a preserved-
// but-unverified one — WITHOUT dropping anything (cardinality-invariant).
//
//   classify(entry, ship):
//     ship absent            → 'legacy-unknown'  (uncomparable — receipt lost to
//                                                 the pre-durable-evidence era)
//     ship has no codex_verdict → 'legacy-unknown'  (legacy pre-v1.20.3 ship)
//     verdictsAgree(...)     → 'codex-verdict'   (corroborated)
//     verdict disagrees      → 'superseded'      (false-positive — PRESERVED +
//                                                 flagged, NEVER dropped; audit
//                                                 still surfaces it as E2)
//
// Invariants (mirrors v0.2.8-generic-receipt-quarantine):
//   - idempotent — re-run is a no-op once provenance matches the re-judgment.
//   - --dry-run — reports the planned changes, writes nothing (read-only first).
//   - cardinality-invariant — NEVER creates/removes a ledger file; only rewrites
//     an existing entry body in place (same filename, receipt_hash untouched, so
//     the <decision>__<hash12> identity is preserved).
//   - fail-closed write — an entry that would fail store.validateEntry is NOT
//     written (the original file is left untouched + recorded as an error).
//
// On the CURRENT corpus (measured): 9 comparable-all-agree → 'codex-verdict',
// 19 unverifiable → 'legacy-unknown', 0 false-positive → 0 'superseded'.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const store = require('../lib/completion-ledger/store');
const { receiptVerdict, verdictsAgree } = require('../lib/evidence-audit');

const LEDGER_SUBDIR = path.join('.claude', 'state', 'completion-ledger');
const SHIP_SUBDIR = path.join('.claude', 'receipts', 'mccp-pr-codex');
const MARKER_REL = path.join('.claude', 'state', 'completion-ledger', '.migrations',
  'v1.22.5-ledger-verdict-repair.json');

function resolveRepoRoot(explicit) {
  if (explicit) return explicit;
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || process.cwd();
  } catch (_e) {
    return process.cwd();
  }
}

// Read a ship receipt's codex_verdict by decision_id. { present, codex_verdict }.
function readShipVerdict(root, decisionId) {
  const p = path.join(root, SHIP_SUBDIR, decisionId + '.json');
  if (!fs.existsSync(p)) return { present: false, codex_verdict: null };
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return { present: true, codex_verdict: receiptVerdict(j) };
  } catch (_e) {
    return { present: false, codex_verdict: null };
  }
}

// classifyProvenance(entry, ship) → 'codex-verdict' | 'legacy-unknown' | 'superseded'.
function classifyProvenance(entry, ship) {
  if (!ship || !ship.present) return 'legacy-unknown';
  if (ship.codex_verdict === null || ship.codex_verdict === undefined) return 'legacy-unknown';
  return verdictsAgree(entry.verdict, ship.codex_verdict) ? 'codex-verdict' : 'superseded';
}

function writeFileAtomic(target, content) {
  const tmp = target + '.tmp';
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(tmp, content, 'utf8');
  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (_e) { /* ignore */ }
    throw err;
  }
}

function migrate(opts) {
  opts = opts || {};
  const root = resolveRepoRoot(opts.repoRoot);
  const dryRun = !!opts.dryRun;
  const dir = path.join(root, LEDGER_SUBDIR);

  const result = {
    state: 'complete',
    dry_run: dryRun,
    repo_root: root,
    scanned: 0,
    changed: 0,
    unchanged: 0,
    by_provenance: { 'codex-verdict': 0, 'legacy-unknown': 0, 'superseded': 0 },
    cardinality_before: 0,
    cardinality_after: 0,
    changes: [],
    errors: [],
  };

  if (!fs.existsSync(dir)) {
    result.state = 'noop';
    return result;
  }

  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    result.state = 'failed';
    result.errors.push({ file: LEDGER_SUBDIR, error: (err && err.message) || String(err) });
    return result;
  }

  const jsonNames = names.filter(function (n) { return n.endsWith('.json'); });
  result.cardinality_before = jsonNames.length;

  for (const name of jsonNames) {
    const file = path.join(dir, name);
    let parsed;
    let entry;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      entry = parsed && parsed.entry;
    } catch (_e) {
      result.errors.push({ file: name, error: 'unparseable JSON' });
      continue;
    }
    if (!entry || typeof entry.decision_id !== 'string' || entry.decision_id.length === 0) {
      result.errors.push({ file: name, error: 'no valid entry.decision_id' });
      continue;
    }
    result.scanned += 1;

    const ship = readShipVerdict(root, entry.decision_id);
    const provenance = classifyProvenance(entry, ship);
    result.by_provenance[provenance] += 1;

    if (entry.verdict_provenance === provenance) {
      result.unchanged += 1; // idempotent — already marked with the same judgment
      continue;
    }

    result.changes.push({
      file: name,
      decision_id: entry.decision_id,
      from: entry.verdict_provenance || null,
      to: provenance,
      ledger_verdict: entry.verdict,
      ship_present: ship.present,
      ship_codex_verdict: ship.codex_verdict,
    });

    if (dryRun) {
      result.changed += 1;
      continue;
    }

    // Preserve everything except the added/updated provenance field; the
    // receipt_hash + filename identity are untouched (no rehash — §3.12).
    entry.verdict_provenance = provenance;
    const v = store.validateEntry(entry);
    if (!v.ok) {
      result.errors.push({ file: name, error: 'invalid after mark: ' + v.errors.join('; ') });
      continue; // leave the file untouched — fail-closed
    }
    try {
      writeFileAtomic(file, JSON.stringify({
        schema_version: (parsed && parsed.schema_version) || store.SCHEMA_VERSION,
        entry: entry,
      }, null, 2) + '\n');
      result.changed += 1;
    } catch (err) {
      result.errors.push({ file: name, error: 'write failed: ' + ((err && err.message) || String(err)) });
    }
  }

  // Cardinality invariant — re-count AFTER (nothing was created/removed).
  try {
    result.cardinality_after = fs.readdirSync(dir).filter(function (n) { return n.endsWith('.json'); }).length;
  } catch (_e) {
    result.cardinality_after = result.cardinality_before;
  }

  if (result.errors.length > 0) {
    result.state = (result.changed > 0 || result.unchanged > 0) ? 'partial' : 'failed';
  }

  if (!dryRun && result.state !== 'failed') {
    try {
      writeFileAtomic(path.join(root, MARKER_REL), JSON.stringify({
        migration: 'v1.22.5-ledger-verdict-repair',
        completed_at: new Date().toISOString(),
        state: result.state,
        scanned: result.scanned,
        changed: result.changed,
        unchanged: result.unchanged,
        by_provenance: result.by_provenance,
        cardinality_before: result.cardinality_before,
        cardinality_after: result.cardinality_after,
        errors: result.errors,
      }, null, 2) + '\n');
    } catch (_e) { /* marker is best-effort — do not fail the run */ }
  }

  return result;
}

module.exports = {
  migrate: migrate,
  classifyProvenance: classifyProvenance,
  readShipVerdict: readShipVerdict,
  LEDGER_SUBDIR: LEDGER_SUBDIR,
  MARKER_REL: MARKER_REL,
};

// ── require.main CLI ──────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  let dryRun = false;
  let asJson = false;
  let repoRoot = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--json') asJson = true;
    else if (a === '--repo-root') { repoRoot = args[i + 1]; i++; }
    else process.stderr.write('[ledger-verdict-repair] unknown arg "' + a + '" (ignored)\n');
  }
  const result = migrate({ dryRun: dryRun, repoRoot: repoRoot });
  if (asJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stdout.write('── ledger verdict-provenance repair (' + result.repo_root + ') ──\n');
    process.stdout.write('mode          : ' + (result.dry_run ? 'DRY-RUN (no writes)' : 'apply') + '\n');
    process.stdout.write('state         : ' + result.state + '\n');
    process.stdout.write('scanned       : ' + result.scanned + '\n');
    process.stdout.write('changed       : ' + result.changed + (result.dry_run ? ' (would change)' : '') + '\n');
    process.stdout.write('unchanged     : ' + result.unchanged + '\n');
    process.stdout.write('by_provenance : codex-verdict=' + result.by_provenance['codex-verdict']
      + ' legacy-unknown=' + result.by_provenance['legacy-unknown']
      + ' superseded=' + result.by_provenance['superseded'] + '\n');
    process.stdout.write('cardinality   : ' + result.cardinality_before + ' → ' + result.cardinality_after
      + (result.cardinality_before === result.cardinality_after ? ' (invariant)' : ' (CHANGED — BUG)') + '\n');
    if (result.errors.length) {
      process.stdout.write('errors        : ' + result.errors.length + '\n');
      result.errors.forEach(function (e) { process.stdout.write('  ! ' + e.file + ' — ' + e.error + '\n'); });
    }
  }
  // Non-zero only on a hard failure; a clean dry-run / apply exits 0.
  process.exit(result.state === 'failed' ? 1 : 0);
}
