'use strict';

// reseal — move the sealed debt denominator forward WITHOUT breaking the
// dispositions bound to the old one.
//
// WHY THIS EXISTS. `sealInventory` refuses a second seal, and that refusal is
// correct on its own terms: re-labelling the denominator under records bound to
// the previous digest is how a ledger starts certifying something nobody judged.
// But the refusal left no path at all, so the denominator froze on 2026-09-01
// while live debt grew past it — `verify` reports `open: 0` on a snapshot that
// answers a question nobody is asking any more.
//
// SUCCESSION, NOT RE-KEYING. The sanctioned precedent in this repo
// (`migrations/v1.22.4-cwd-rebind.js`) rewrites a binding in place because there
// the binding IS the filename: break it and the ledger entry dangles, so the only
// honest move is to re-key both sides in one run. Here the binding is a FIELD
// INSIDE A LINE of an append-only log, and `foldDispositions` already fixes the
// rule for that shape — "a re-judgment is recorded rather than overwritten, both
// readings stay auditable". Editing 1115 lines in place would not be re-keying an
// index; it would be rewriting a log. So old lines are not touched at all. Each
// carried item gets a NEW line bound to the new digest, which is just another
// re-judgment: "under the new denominator, this item keeps the judgment it had".
//
// WHAT THIS DELIBERATELY DOES NOT DO.
//   - It does not invent judgments. A carried line copies `disposition`,
//     `evidence`, `successor` and `duplicate_of` verbatim; the only new fields are
//     provenance.
//   - It does not carry an item whose cross-reference no longer resolves
//     (`carry_blocked`). Swapping in a different twin would be a machine editing a
//     human's decision.
//   - It does not hide what falls out of the denominator (`dropped`). An item that
//     stopped being live is not an item that got done, and a re-seal that silently
//     drops judged debt is a laundering device.
//   - It does not write the ledger itself. Every line goes through
//     `appendDispositions`, whose all-or-nothing rule is the only place each record
//     is validated. A second writer here would put unvalidated lines into a log
//     that cannot be undone.
//
// AFTER A RE-SEAL, `verify` GOES RED. `open` jumps from 0 to the unjudged remainder
// and `ok` becomes false. That is the point, not a regression: the green was an
// artifact of measuring a frozen denominator.
//
// THREAT MODEL. Unchanged from `debt-inventory.js` and CLAUDE.md §3.12 — this
// guards against drift and mistakes, not against someone who can run node with
// write access to the repo. That is stated rather than defended.

const fs = require('fs');
const path = require('path');

const di = require('./debt-inventory');
const { scrubPathsFromMessage } = require('../closure/report');

const MANIFEST_REL = '.claude/state/reseal-manifest.json';

const EX_OK = 0;
const EX_FAIL = 1;
const EX_USAGE = 2;
// Distinct from EX_FAIL on purpose: 12 means "refused before touching anything",
// which is the only exit where the caller knows the tree is untouched.
const EX_ABORT = 12;

const MANIFEST_STATES = ['in-progress', 'complete'];

function manifestPath(repoRoot) { return path.join(repoRoot, MANIFEST_REL); }

function readManifest(repoRoot) {
  const abs = manifestPath(repoRoot);
  if (!fs.existsSync(abs)) return null;
  try {
    const m = JSON.parse(fs.readFileSync(abs, 'utf8'));
    if (!m || MANIFEST_STATES.indexOf(m.state) === -1) return null;
    return m;
  } catch (err) {
    return null;
  }
}

function writeJsonAtomic(abs, value) {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = abs + '.' + process.pid + '.' + Math.random().toString(36).slice(2) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, abs);
}

// ── plan (pure) ──────────────────────────────────────────────────────────────
//
// Computes everything and writes nothing. `ok:false` with a populated `degraded[]`
// means the apply path must refuse: a re-seal built on a source that could not be
// read would drop the debt it failed to see, and the ledger is append-only.
function planReseal(repoRoot) {
  const degraded = [];
  const fail = function (name, err) {
    degraded.push({
      name: name,
      // These messages end up in a committed artifact, and this repo has already
      // paid once for an absolute path leaking into a receipt (§3.12). Reuse the
      // scrubber rather than writing a second one.
      reason: scrubPathsFromMessage(String((err && err.message) || err), repoRoot),
    });
  };

  const EMPTY = {
    ok: false,
    old_sha: null,
    new_sha: null,
    carried: [],
    carry_blocked: [],
    dropped: [],
    unjudged_count: null,
    ancestry: [],
    ancestry_unverified: [],
    degraded: degraded,
  };

  let doc;
  try {
    doc = di.readInventory(repoRoot);
  } catch (err) {
    fail('sealed-inventory', err);
    return EMPTY;
  }
  if (!doc) {
    degraded.push({ name: 'sealed-inventory', reason: 'no sealed inventory — seal before re-sealing' });
    return EMPTY;
  }
  if (di.inventoryHash(doc.items) !== doc.inventory_sha256) {
    degraded.push({
      name: 'sealed-inventory',
      reason: 'seal digest does not match its items — the old denominator cannot be trusted as an ancestor',
    });
    return EMPTY;
  }

  const anc = di.sealAncestry(repoRoot, doc);
  if (anc === null) {
    degraded.push({
      name: 'ancestry',
      reason: 'meta.ancestry is malformed — refusing rather than descending from an unjudgeable chain',
    });
    return EMPTY;
  }

  let built;
  try {
    built = di.buildInventory(repoRoot);
  } catch (err) {
    fail('live-inventory', err);
    return EMPTY;
  }
  if (built.stats && built.stats.findings_degraded) {
    degraded.push({
      name: 'live-inventory',
      reason: 'findings registry read partially — a new denominator built on a partial read would drop debt it never saw',
    });
    return EMPTY;
  }

  const led = di.readDispositions(repoRoot);
  if (!led.ok) { fail('disposition-ledger', led.error); return EMPTY; }
  if (led.malformed > 0) {
    degraded.push({
      name: 'disposition-ledger',
      reason: 'ledger has ' + led.malformed + ' malformed line(s) — a judgment that cannot be read cannot be carried',
    });
    return EMPTY;
  }

  const newSha = di.inventoryHash(built.items);
  const newIndex = new Map(built.items.map(function (i) { return [i.item_id, i]; }));

  // Latest line wins, scoped to the CURRENT seal — the same fold `verify` uses.
  const folded = di.foldDispositions(led.lines.filter(function (r) {
    return r.inventory_sha256 === doc.inventory_sha256;
  }));

  const carried = [];
  const carryBlocked = [];
  const dropped = [];
  for (const it of doc.items) {
    const rec = folded.get(it.item_id);
    if (!rec) continue;                       // never judged — nothing to carry
    if (!newIndex.has(it.item_id)) {
      dropped.push({ item_id: it.item_id, disposition: rec.disposition, severity: it.severity });
      continue;
    }
    // The item survived, but its line may point at another item. `duplicate_of` is
    // RECOMPUTED by `linkDuplicates` on every seal, so a twin that was in the old
    // denominator need not be in the new one — and `validateDisposition` checks it
    // against the NEW index. Carrying it anyway would surface as an
    // `invalid_disposition` only AFTER the append, in a log that cannot be undone.
    if (rec.disposition === 'duplicate' && !newIndex.has(rec.duplicate_of)) {
      carryBlocked.push({
        item_id: it.item_id,
        disposition: rec.disposition,
        reason: 'duplicate_of ' + rec.duplicate_of + ' is not in the new denominator',
      });
      continue;
    }
    carried.push({
      item_id: rec.item_id,
      disposition: rec.disposition,
      evidence: rec.evidence || null,
      successor: rec.successor || null,
      duplicate_of: rec.duplicate_of || null,
      succeeded_from: doc.inventory_sha256,
      originally_disposed_at: rec.originally_disposed_at || rec.disposed_at || null,
      note: 'carried forward by reseal from ' + doc.inventory_sha256,
    });
  }

  const carriedIds = new Set(carried.map(function (c) { return c.item_id; }));
  let unjudged = 0;
  for (const it of built.items) if (!carriedIds.has(it.item_id)) unjudged += 1;

  return {
    ok: true,
    old_sha: doc.inventory_sha256,
    new_sha: newSha,
    carried: carried,
    carry_blocked: carryBlocked,
    dropped: dropped,
    unjudged_count: unjudged,
    ancestry: anc.verified,
    ancestry_unverified: anc.unverified,
    new_items: built.items,
    new_stats: built.stats,
    degraded: degraded,
  };
}

// ── apply ────────────────────────────────────────────────────────────────────

// Which branch a re-entry takes, decided from disk alone.
//
// The discriminator cannot be "does a manifest exist", and it cannot be
// "manifest.new_sha equals the seal on disk" either. The second one is true FOREVER
// after a successful run, so every later generation would fold into a retry of an
// already-finished append and the chain would be one-shot. The manifest therefore
// carries an explicit state.
function decideEntry(repoRoot, doc) {
  const m = readManifest(repoRoot);
  const sealSha = doc ? doc.inventory_sha256 : null;

  if (m && m.state === 'in-progress') {
    if (m.new_sha === sealSha) return { mode: 'resume', manifest: m };
    // The seal was never swapped, so nothing destructive happened. Re-planning is
    // safe and the stale manifest is simply overwritten.
    return { mode: 'fresh', manifest: m };
  }
  if (m && m.state === 'complete') {
    // Finished. A further call is a NEW generation, planned from scratch. If there
    // is nothing to re-seal, `applyReseal` reports a noop instead of writing.
    return { mode: 'fresh', manifest: m };
  }

  // No readable manifest. In the normal flow that means nothing has happened yet,
  // because step 0 writes the manifest before any destructive change — and refusing
  // here unconditionally would make even the FIRST re-seal impossible.
  //
  // The dangerous shape is a manifest that was deleted mid-flight: the seal was
  // swapped but the carried lines never landed. That is visible without the
  // manifest — the seal descends from something, yet nothing is bound to it.
  if (doc && doc.meta && doc.meta.supersedes) {
    return { mode: 'orphan-check', manifest: null };
  }
  return { mode: 'fresh', manifest: null };
}

function boundLineCount(repoRoot, sha) {
  const led = di.readDispositions(repoRoot);
  if (!led.ok) return null;
  let n = 0;
  for (const r of led.lines) if (r.inventory_sha256 === sha) n += 1;
  return n;
}

// Pre-flight the ENTIRE carried batch against the candidate inventory, using the
// same validator `appendDispositions` will use, before the seal is swapped.
//
// Checking only that the old sha verifies as an ancestor is weaker than the rule
// actually applied later: a carried line's `succeeded_from` may name an OLDER
// generation, which is normal once the ancestor set is what grants acceptance. If
// that older archive is missing, the narrow check passes and the batch is refused
// after the seal is already replaced — and no retry can manufacture the missing
// archive. So the pre-flight applies the real predicate to every record.
function preflightCarried(repoRoot, candidateDoc, records) {
  const index = new Map(candidateDoc.items.map(function (i) { return [i.item_id, i]; }));
  const anc = di.sealAncestry(repoRoot, candidateDoc);
  if (anc === null) {
    return { ok: false, unresolved: [{ item_id: null, reason: 'candidate ancestry is malformed' }] };
  }
  const unresolved = [];
  for (const raw of records) {
    const rec = Object.assign({}, raw, { inventory_sha256: candidateDoc.inventory_sha256 });
    const v = di.validateDisposition(
      repoRoot, rec, index, candidateDoc.inventory_sha256, anc.verified);
    if (!v.ok) unresolved.push({ item_id: rec.item_id, reason: v.reason });
  }
  return { ok: unresolved.length === 0, unresolved: unresolved, ancestry: anc.verified };
}

function applyReseal(repoRoot, opts) {
  const o = opts || {};
  const doc = di.readInventory(repoRoot);
  const entry = decideEntry(repoRoot, doc);

  if (entry.mode === 'orphan-check') {
    const bound = boundLineCount(repoRoot, doc.inventory_sha256);
    if (bound === 0) {
      return {
        ok: false,
        aborted: 'manifest-missing-midflight',
        reason: 'the seal on disk supersedes ' +
          (doc.meta.supersedes.inventory_sha256 || 'an earlier seal') +
          ' but no disposition line is bound to it, and there is no manifest to say ' +
          'which items were meant to carry. Re-planning here would re-derive the ' +
          'denominator from live debt, which has moved — the judgments would be lost ' +
          'and the ledger cannot be un-appended. Restore ' + MANIFEST_REL +
          ' (state=in-progress, new_sha=' + doc.inventory_sha256 + ') from the ' +
          'aborted run, then re-run.',
      };
    }
    // Bound lines exist, so the previous run completed its append. Treat it as a
    // finished generation and plan a new one.
  }

  if (entry.mode === 'resume') {
    const m = entry.manifest;
    const wanted = new Set(m.carried_item_ids || []);
    const plan = { old_sha: m.old_sha, new_sha: m.new_sha };
    const records = (m.carried_records || []).filter(function (r) { return wanted.has(r.item_id); });
    if (!o.apply) {
      return { ok: true, mode: 'resume', dry_run: true, plan: plan, pending: records.length };
    }
    const res = appendCarried(repoRoot, doc, records);
    if (!res.ok) return { ok: false, aborted: 'append-rejected', append: res };
    completeManifest(repoRoot, m);
    return { ok: true, mode: 'resume', appended: res.appended, old_sha: m.old_sha, new_sha: m.new_sha };
  }

  const plan = planReseal(repoRoot);
  if (!plan.ok) {
    return { ok: false, aborted: 'plan-degraded', degraded: plan.degraded };
  }
  if (plan.new_sha === plan.old_sha) {
    // Nothing to do. This is what makes an unchanged retry idempotent instead of
    // appending a second copy of the same carried lines.
    return { ok: true, mode: 'noop', reason: 'live debt already hashes to the sealed digest',
      old_sha: plan.old_sha, new_sha: plan.new_sha, appended: 0 };
  }
  if (!o.apply) {
    return { ok: true, mode: 'plan', dry_run: true, plan: summarize(plan) };
  }

  // ── step 0: manifest FIRST, before anything destructive ────────────────────
  const manifest = {
    schema: 1,
    state: 'in-progress',
    old_sha: plan.old_sha,
    new_sha: plan.new_sha,
    carried_item_ids: plan.carried.map(function (c) { return c.item_id; }),
    carried_records: plan.carried,
    started_at: new Date().toISOString(),
    completed_at: null,
  };
  writeJsonAtomic(manifestPath(repoRoot), manifest);

  // ── step 1: archive the outgoing seal ──────────────────────────────────────
  const archiveRel = di.archiveRelFor(plan.old_sha);
  const archiveAbs = path.join(repoRoot, archiveRel);
  if (fs.existsSync(archiveAbs)) {
    const existing = fs.readFileSync(archiveAbs, 'utf8');
    if (existing !== JSON.stringify(doc, null, 2) + '\n') {
      return { ok: false, aborted: 'archive-conflict',
        reason: 'an archive already exists at ' + archiveRel + ' with different content' };
    }
  } else {
    fs.mkdirSync(path.dirname(archiveAbs), { recursive: true });
    fs.writeFileSync(archiveAbs, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  }

  // ── step 1b: put it in the index, then PROVE the succession resolves ───────
  //
  // The ancestor rule requires a tracked archive, and a copy is not tracked. Without
  // this, the first re-seal would swap the seal, then have every carried `deferred`
  // refused, and the all-or-nothing rule would reject the batch — leaving exactly
  // the broken binding this whole path exists to avoid. Everything above is
  // reversible (a manifest and one new file), so aborting here is safe.
  try {
    require('child_process').execFileSync(
      'git', ['-C', repoRoot, 'add', '--', archiveRel],
      { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (err) {
    return { ok: false, aborted: 'archive-not-stageable',
      reason: scrubPathsFromMessage(String(err.message || err), repoRoot) };
  }

  const candidate = buildCandidate(doc, plan);
  const pre = preflightCarried(repoRoot, candidate, plan.carried);
  if (!pre.ok) {
    return {
      ok: false,
      aborted: 'preflight-unresolved',
      reason: 'the carried batch does not validate against the candidate inventory; ' +
        'the seal was NOT replaced',
      unresolved: pre.unresolved.slice(0, 10),
      unresolved_count: pre.unresolved.length,
    };
  }

  // ── step 2: swap the seal ──────────────────────────────────────────────────
  writeJsonAtomic(di.inventoryPath(repoRoot), candidate);

  // ── step 3: append the carried lines, through the validator ────────────────
  const res = appendCarried(repoRoot, candidate, plan.carried);
  if (!res.ok) return { ok: false, aborted: 'append-rejected', append: res };
  completeManifest(repoRoot, manifest);

  return {
    ok: true,
    mode: 'reseal',
    old_sha: plan.old_sha,
    new_sha: plan.new_sha,
    appended: res.appended,
    carried: plan.carried.length,
    carry_blocked: plan.carry_blocked,
    dropped: plan.dropped,
    unjudged_count: plan.unjudged_count,
    ancestry_depth: (candidate.meta.ancestry || []).length,
    archive: archiveRel,
  };
}

function buildCandidate(doc, plan) {
  const priorAncestry = (doc.meta && Array.isArray(doc.meta.ancestry)) ? doc.meta.ancestry : [];
  return {
    meta: Object.assign({}, doc.meta, {
      sealed_at: new Date().toISOString(),
      sealed_at_commit: doc.meta.sealed_at_commit,
      stats: plan.new_stats,
      // `meta` is outside the digest, so adding these moves nothing: `inventoryHash`
      // covers `items[]` only. That is what makes succession possible without
      // changing what a seal means.
      supersedes: {
        inventory_sha256: doc.inventory_sha256,
        sealed_at: doc.meta.sealed_at,
        sealed_at_commit: doc.meta.sealed_at_commit,
        archived_at: di.archiveRelFor(doc.inventory_sha256),
      },
      ancestry: priorAncestry.concat([doc.inventory_sha256]),
      note: 'Snapshot semantics unchanged: this denominator is the debt at its own ' +
        'seal time. It supersedes an earlier seal, which is archived under ' +
        di.SEALS_DIR_REL + '. See docs/multi-session-work-loop/debt-inventory.md.',
    }),
    inventory_sha256: plan.new_sha,
    items: plan.new_items,
  };
}

// Idempotent by construction: a pair already present is filtered BEFORE the call,
// so the all-or-nothing contract is never asked to tolerate a partial batch.
function appendCarried(repoRoot, doc, records) {
  const led = di.readDispositions(repoRoot);
  if (!led.ok) return { ok: false, appended: 0, rejected: [{ reason: 'ledger unreadable' }] };
  const present = new Set();
  for (const r of led.lines) {
    if (r.inventory_sha256 === doc.inventory_sha256) present.add(r.item_id);
  }
  const todo = records.filter(function (r) { return !present.has(r.item_id); });
  if (!todo.length) return { ok: true, appended: 0, rejected: [] };
  return di.appendDispositions(repoRoot, todo);
}

function completeManifest(repoRoot, m) {
  writeJsonAtomic(manifestPath(repoRoot), Object.assign({}, m, {
    state: 'complete',
    completed_at: new Date().toISOString(),
  }));
}

function summarize(plan) {
  return {
    old_sha: plan.old_sha,
    new_sha: plan.new_sha,
    carried: plan.carried.length,
    carry_blocked: plan.carry_blocked,
    dropped: plan.dropped,
    unjudged_count: plan.unjudged_count,
    ancestry: plan.ancestry,
    ancestry_unverified: plan.ancestry_unverified,
    degraded: plan.degraded,
  };
}

// ── cli ──────────────────────────────────────────────────────────────────────

const USAGE = [
  'usage: reseal.js [plan|apply] [--apply] [--json] [--repo-root <path>]',
  '',
  '  plan    (default) compute the succession and print it. Writes NOTHING.',
  '  apply   perform the re-seal. Requires --apply as an explicit consent flag,',
  '          because `sealInventory` refuses re-sealing by design and a tool that',
  '          walks around that refusal must not be reachable by accident.',
  '',
].join('\n');

function runCli(argv) {
  const flags = parseFlags(argv);
  const cmd = flags._[0] || 'plan';
  const json = !!flags.json;
  const repoRoot = (flags['repo-root'] && flags['repo-root'] !== true)
    ? String(flags['repo-root'])
    : process.cwd();

  if (cmd === 'help' || flags.help) { process.stdout.write(USAGE); return EX_OK; }

  if (cmd === 'plan') {
    const plan = planReseal(repoRoot);
    const payload = Object.assign({ ok: plan.ok }, summarize(plan));
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    return EX_OK;
  }

  if (cmd === 'apply') {
    if (!flags.apply) {
      process.stderr.write(
        're-sealing requires explicit consent: pass --apply.\n' +
        'It replaces the sealed denominator and appends to an append-only ledger;\n' +
        'neither can be undone except through git.\n');
      return EX_USAGE;
    }
    const res = applyReseal(repoRoot, { apply: true });
    process.stdout.write(JSON.stringify(res, null, 2) + '\n');
    if (res.ok) return EX_OK;
    return res.aborted ? EX_ABORT : EX_FAIL;
  }

  process.stderr.write('unknown command: ' + cmd + '\n' + USAGE);
  return EX_USAGE;
}

function parseFlags(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { out[a.slice(2)] = true; continue; }
      out[a.slice(2)] = next; i += 1;
    } else {
      out._.push(a);
    }
  }
  return out;
}

if (require.main === module) {
  process.exit(runCli(process.argv.slice(2)));
}

module.exports = {
  runCli,
  MANIFEST_REL,
  EX_OK,
  EX_FAIL,
  EX_USAGE,
  EX_ABORT,
  planReseal,
  applyReseal,
  decideEntry,
  preflightCarried,
  buildCandidate,
  readManifest,
};
