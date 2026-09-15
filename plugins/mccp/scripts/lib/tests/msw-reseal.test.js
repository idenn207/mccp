'use strict';

// closure-accounting M2 — succession (re-seal) invariants.
//
// What is frozen here are INVARIANTS and RELATIONS, never this repository's
// counts: the ledger is append-only and the live pile moves on every gate run, so
// each test builds its own repo. The fixture is a REAL git repo (`git init` +
// `git add`), which the M10 fixture is not — an ancestor is only trusted when its
// archive is in the index, so a fake `.git` directory would make every ancestry
// test vacuous in the passing direction.
//
//   1. Succession APPENDS. Old lines are never edited; a carried item gets a new
//      line bound to the new digest.
//   2. A carried line copies the judgment verbatim. The tool never invents one.
//   3. An ancestor is RECOMPUTED and must be tracked. A sha declared in `meta`
//      buys nothing on its own — `meta` is outside the sealed digest.
//   4. `binding_mismatch` keeps catching what it was built for. Only VERIFIED
//      ancestors move to `ancestor_bound_lines`.
//   5. Acceptance is a marker, not a substring. A file that merely contains the
//      digest is not a successor.
//   6. Acceptance is checked against the ancestor SET, so the chain survives N
//      generations.
//   7. The manifest has a state. A finished operation does not swallow the next
//      generation, and a deleted manifest mid-flight refuses rather than guesses.
//   8. Writes go through `appendDispositions`. There is no second writer.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const di = require('../msw-metrics/debt-inventory');
const reseal = require('../msw-metrics/reseal');

const BACKLOG_HEADER = [
  '# Backlog',
  '',
  '| Date | Severity | Source plan | Finding |',
  '| --- | --- | --- | --- |',
];

function git(root, args) {
  return execFileSync('git', ['-C', root].concat(args),
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function makeRepo(opts) {
  const o = opts || {};
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-reseal-'));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 't@example.com']);
  git(root, ['config', 'user.name', 'test']);
  fs.mkdirSync(path.join(root, '.claude', 'plans'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'state', 'findings'), { recursive: true });
  writeBacklog(root, o.backlogRows || []);
  return root;
}

function writeBacklog(root, rows) {
  fs.writeFileSync(path.join(root, '.claude', 'plans', 'codex-findings-backlog.md'),
    BACKLOG_HEADER.concat(rows).join('\n') + '\n', 'utf8');
}

function row(n, sev) {
  return '| 2026-09-01 | ' + (sev || 'LOW') + ' | a.md | finding ' + n + ' |';
}

// A successor that ACCEPTS the given seals. The marker, not the bare digest, is
// what acceptance means.
function writeSuccessor(root, rel, shas) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs,
    'Successor.\n\n' + shas.map(function (s) {
      return '<!-- accepts-inventory: ' + s + ' -->';
    }).join('\n') + '\n', 'utf8');
  git(root, ['add', '--', rel]);
}

// Seal, then judge everything so the fixture starts from the state a live repo is
// in before a re-seal: a fully disposed denominator.
function sealAndDispose(root, opts) {
  const o = opts || {};
  const doc = di.sealInventory(root);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'seal']);
  writeSuccessor(root, 'docs/next.md', [doc.inventory_sha256]);
  const records = doc.items.map(function (it, i) {
    if (i === 0) return { item_id: it.item_id, disposition: 'fixed', evidence: '#1' };
    return { item_id: it.item_id, disposition: 'deferred', successor: 'docs/next.md' };
  });
  const res = di.appendDispositions(root, records);
  assert.equal(res.ok, true, 'fixture setup: ' + JSON.stringify(res.rejected || []));
  if (o.commit !== false) { git(root, ['add', '-A']); git(root, ['commit', '-q', '-m', 'dispose']); }
  return doc;
}

// ── 1·2: succession appends, and copies the judgment verbatim ────────────────

test('a re-seal appends carried lines and never edits the old ones', () => {
  const root = makeRepo({ backlogRows: [row(1, 'HIGH'), row(2), row(3)] });
  const old = sealAndDispose(root);
  const beforeLines = di.readDispositions(root).lines.length;
  const beforeRaw = fs.readFileSync(path.join(root, di.DISPOSITIONS_REL), 'utf8');

  writeBacklog(root, [row(1, 'HIGH'), row(2), row(3), row(4)]);
  const res = reseal.applyReseal(root, { apply: true });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.mode, 'reseal');
  assert.notEqual(res.new_sha, old.inventory_sha256);

  const after = di.readDispositions(root);
  assert.equal(after.lines.length, beforeLines + res.appended);
  assert.ok(after.lines.length > beforeLines, 'succession must add lines');
  // The old lines are byte-identical — succession is an append, not a rewrite.
  assert.equal(fs.readFileSync(path.join(root, di.DISPOSITIONS_REL), 'utf8')
    .slice(0, beforeRaw.length), beforeRaw);
});

test('a carried line copies the judgment verbatim and only adds provenance', () => {
  const root = makeRepo({ backlogRows: [row(1, 'HIGH'), row(2)] });
  const old = sealAndDispose(root);
  const before = di.foldDispositions(di.readDispositions(root).lines);

  writeBacklog(root, [row(1, 'HIGH'), row(2), row(3)]);
  assert.equal(reseal.applyReseal(root, { apply: true }).ok, true);

  const doc = di.readInventory(root);
  const carried = di.readDispositions(root).lines
    .filter(function (r) { return r.inventory_sha256 === doc.inventory_sha256; });
  assert.ok(carried.length > 0);
  for (const c of carried) {
    const src = before.get(c.item_id);
    assert.ok(src, 'a carried line must have an original');
    for (const field of ['disposition', 'evidence', 'successor', 'duplicate_of']) {
      assert.deepEqual(c[field] || null, src[field] || null,
        field + ' must be carried verbatim — the tool does not invent judgments');
    }
    assert.equal(c.succeeded_from, old.inventory_sha256);
    assert.equal(c.originally_disposed_at, src.disposed_at);
  }
});

// ── 3: an ancestor is recomputed and must be tracked ─────────────────────────

test('a declared ancestor with no archive is not verified', () => {
  const root = makeRepo({ backlogRows: [row(1)] });
  const doc = di.sealInventory(root);
  const ghost = 'sha256:' + 'b'.repeat(64);
  doc.meta.ancestry = [ghost];
  fs.writeFileSync(path.join(root, di.INVENTORY_REL), JSON.stringify(doc, null, 2) + '\n', 'utf8');

  const anc = di.sealAncestry(root, di.readInventory(root));
  assert.deepEqual(anc.verified, [],
    'a sha in unsigned meta must buy nothing on its own');
  assert.equal(anc.unverified.length, 1);
  assert.match(anc.unverified[0].reason, /unreadable/);
});

test('an archive that hashes correctly but is untracked is not an ancestor', () => {
  const root = makeRepo({ backlogRows: [row(1)] });
  const doc = di.sealInventory(root);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'seal']);

  // A real, self-consistent archive placed on disk and NOT added to the index.
  const rel = di.archiveRelFor(doc.inventory_sha256);
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  assert.equal(di.inventoryHash(JSON.parse(fs.readFileSync(abs, 'utf8')).items),
    doc.inventory_sha256, 'the archive really does hash to its own name');

  const probe = { inventory_sha256: 'sha256:' + 'c'.repeat(64), meta: { ancestry: [doc.inventory_sha256] }, items: [] };
  assert.deepEqual(di.sealAncestry(root, probe).verified, [],
    'recomputing a hash proves internal consistency, not that the seal existed');

  git(root, ['add', '--', rel]);
  assert.deepEqual(di.sealAncestry(root, probe).verified, [doc.inventory_sha256]);
});

test('a malformed ancestry folds the whole array to null, not to empty', () => {
  const root = makeRepo({ backlogRows: [row(1)] });
  const doc = di.sealInventory(root);
  assert.deepEqual(di.sealAncestry(root, doc).verified, [], 'absent ancestry is empty, not null');
  for (const bad of [['nope'], ['sha256:' + 'z'.repeat(64)], [doc.inventory_sha256, doc.inventory_sha256]]) {
    assert.equal(di.sealAncestry(root, { inventory_sha256: 'sha256:' + 'd'.repeat(64), meta: { ancestry: bad }, items: [] }),
      null, 'unjudgeable shape must be null (no allowance), never []');
  }
  // Self-reference is refused too — a seal cannot descend from itself.
  assert.equal(di.sealAncestry(root, { inventory_sha256: doc.inventory_sha256, meta: { ancestry: [doc.inventory_sha256] }, items: [] }), null);
});

// ── 4: binding_mismatch still catches what it was built for ──────────────────

test('ancestor-bound lines leave binding_mismatch, but an unverified sha does not', () => {
  const root = makeRepo({ backlogRows: [row(1, 'HIGH'), row(2)] });
  sealAndDispose(root);
  writeBacklog(root, [row(1, 'HIGH'), row(2), row(3)]);
  assert.equal(reseal.applyReseal(root, { apply: true }).ok, true);

  const good = di.verifyDispositions(root);
  assert.equal(good.binding_mismatch, 0, 'a verified ancestor is a normal state');
  assert.ok(good.ancestor_bound_lines > 0, 'and it is counted somewhere');
  assert.equal(good.ancestry_depth, 1);

  // Over-permissive direction: append a sha to unsigned meta with no archive
  // behind it, bind a line to it, and it must NOT escape binding_mismatch.
  const doc = di.readInventory(root);
  const forged = 'sha256:' + 'e'.repeat(64);
  doc.meta.ancestry = doc.meta.ancestry.concat([forged]);
  fs.writeFileSync(path.join(root, di.INVENTORY_REL), JSON.stringify(doc, null, 2) + '\n', 'utf8');
  fs.appendFileSync(path.join(root, di.DISPOSITIONS_REL),
    JSON.stringify({ item_id: 'backlog:deadbeef', disposition: 'fixed', evidence: '#9',
      inventory_sha256: forged, disposed_at: new Date().toISOString() }) + '\n', 'utf8');

  const bad = di.verifyDispositions(root);
  assert.equal(bad.binding_mismatch, 1,
    'a sha with no verified archive must stay in binding_mismatch');
  assert.equal(bad.ok, false, 'and it must still turn the gate red');
});

// ── 5: acceptance is a marker, not a substring ───────────────────────────────

test('a file that merely contains the digest is not a successor', () => {
  const root = makeRepo({ backlogRows: [row(1)] });
  const doc = di.sealInventory(root);
  const index = new Map(doc.items.map(function (i) { return [i.item_id, i]; }));
  const attempt = function (successor) {
    return di.validateDisposition(root,
      { item_id: doc.items[0].item_id, disposition: 'deferred', successor },
      index, doc.inventory_sha256, []);
  };

  // The shape a closure report writes: the full digest inside a JSON body.
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'report.json'),
    JSON.stringify({ seal: { inventory_sha256: doc.inventory_sha256 } }, null, 2), 'utf8');
  assert.equal(attempt('docs/report.json').ok, false,
    'a report JSON carrying the digest must not be able to absorb a deferral');

  writeSuccessor(root, 'docs/real.md', [doc.inventory_sha256]);
  assert.equal(attempt('docs/real.md').ok, true);
});

// ── 6: the chain survives N generations ──────────────────────────────────────
//
// Reviewer-specified shape: A→B, an unchanged retry with zero appends, then added
// debt followed by B→C — all through the public apply path.
test('reseal A→B, an unchanged retry appends nothing, then B→C succeeds', () => {
  const root = makeRepo({ backlogRows: [row(1, 'HIGH'), row(2)] });
  const a = sealAndDispose(root);

  // A → B
  writeBacklog(root, [row(1, 'HIGH'), row(2), row(3)]);
  const ab = reseal.applyReseal(root, { apply: true });
  assert.equal(ab.ok, true, JSON.stringify(ab));
  const b = di.readInventory(root).inventory_sha256;
  assert.notEqual(b, a.inventory_sha256);
  const linesAfterB = di.readDispositions(root).lines.length;
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'reseal b']);

  // Unchanged retry — nothing to do, and nothing appended.
  const retry = reseal.applyReseal(root, { apply: true });
  assert.equal(retry.ok, true, JSON.stringify(retry));
  assert.equal(retry.mode, 'noop',
    'a completed manifest must not make every later call a replay of the finished append');
  assert.equal(di.readDispositions(root).lines.length, linesAfterB,
    'an unchanged retry must append nothing to an append-only ledger');

  // B → C, with new debt. The successor still carries ONLY A's marker, so this
  // leg fails unless acceptance is checked against the ancestor SET.
  writeBacklog(root, [row(1, 'HIGH'), row(2), row(3), row(4)]);
  const bc = reseal.applyReseal(root, { apply: true });
  assert.equal(bc.ok, true,
    'generation 3 must land. If this is red, the cause is either the manifest ' +
    'state machine (mode would be "resume") or ancestor-SET acceptance (aborted ' +
    'would be "preflight-unresolved"): ' + JSON.stringify(bc));
  assert.equal(bc.mode, 'reseal');
  assert.equal(bc.ancestry_depth, 2, 'the chain accumulates');

  const v = di.verifyDispositions(root);
  assert.equal(v.binding_mismatch, 0);
  assert.equal(v.invalid_dispositions, 0);
  assert.ok(v.ancestor_bound_lines > 0);
});

test('a NEW deferral cannot ride an ancestor marker — the friction stays', () => {
  const root = makeRepo({ backlogRows: [row(1, 'HIGH'), row(2)] });
  const a = sealAndDispose(root);
  writeBacklog(root, [row(1, 'HIGH'), row(2), row(3)]);
  assert.equal(reseal.applyReseal(root, { apply: true }).ok, true);

  const doc = di.readInventory(root);
  const fresh = doc.items.find(function (i) {
    return !di.readDispositions(root).lines.some(function (r) {
      return r.item_id === i.item_id && r.inventory_sha256 === doc.inventory_sha256;
    });
  });
  assert.ok(fresh, 'the re-seal must leave something unjudged');

  // docs/next.md accepts A only. A hand-written deferral has no succeeded_from,
  // so it must name the CURRENT seal.
  const res = di.appendDispositions(root, [{
    item_id: fresh.item_id, disposition: 'deferred', successor: 'docs/next.md',
  }]);
  assert.equal(res.ok, false,
    'an ancestor marker must not pay for a judgment nobody has made yet');
  assert.match(res.rejected[0].reason, /accepts-inventory/);
});

// ── 7: the manifest has a state ──────────────────────────────────────────────

test('a manifest deleted mid-flight refuses instead of re-deriving the denominator', () => {
  const root = makeRepo({ backlogRows: [row(1, 'HIGH'), row(2)] });
  sealAndDispose(root);
  writeBacklog(root, [row(1, 'HIGH'), row(2), row(3)]);

  // Reproduce the crash window: seal swapped, carried lines not yet appended.
  const plan = reseal.planReseal(root);
  assert.equal(plan.ok, true);
  const candidate = reseal.buildCandidate(di.readInventory(root), plan);
  const rel = di.archiveRelFor(plan.old_sha);
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel),
    JSON.stringify(di.readInventory(root), null, 2) + '\n', 'utf8');
  git(root, ['add', '--', rel]);
  fs.writeFileSync(path.join(root, di.INVENTORY_REL),
    JSON.stringify(candidate, null, 2) + '\n', 'utf8');
  assert.equal(fs.existsSync(path.join(root, reseal.MANIFEST_REL)), false);

  const res = reseal.applyReseal(root, { apply: true });
  assert.equal(res.ok, false);
  assert.equal(res.aborted, 'manifest-missing-midflight',
    'without a manifest the target is unidentifiable, and re-planning would lose the judgments');
});

test('the mid-flight window is told apart from a first run by the manifest alone', () => {
  // S6 — branch 4 keys on "supersedes present AND nothing bound to the current
  // seal". A freshly swapped seal in a NORMAL run has exactly that shape for an
  // instant, so the only thing separating the two is that step 0 wrote a manifest
  // before anything destructive. Assert that ordering rather than assuming it.
  const root = makeRepo({ backlogRows: [row(1, 'HIGH'), row(2)] });
  sealAndDispose(root);
  writeBacklog(root, [row(1, 'HIGH'), row(2), row(3)]);
  assert.equal(reseal.applyReseal(root, { apply: true }).ok, true);

  const m = reseal.readManifest(root);
  assert.equal(m.state, 'complete');
  assert.ok(m.started_at <= m.completed_at);

  // A first run has no supersedes at all, so it can never reach branch 4.
  const fresh = makeRepo({ backlogRows: [row(1)] });
  const doc0 = di.sealInventory(fresh);
  assert.equal(doc0.meta.supersedes, undefined);
  assert.equal(reseal.decideEntry(fresh, doc0).mode, 'fresh');
});

test('an in-progress manifest whose target matches the disk resumes the append', () => {
  const root = makeRepo({ backlogRows: [row(1, 'HIGH'), row(2)] });
  sealAndDispose(root);
  writeBacklog(root, [row(1, 'HIGH'), row(2), row(3)]);

  const plan = reseal.planReseal(root);
  const candidate = reseal.buildCandidate(di.readInventory(root), plan);
  const rel = di.archiveRelFor(plan.old_sha);
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), JSON.stringify(di.readInventory(root), null, 2) + '\n', 'utf8');
  git(root, ['add', '--', rel]);
  fs.mkdirSync(path.join(root, '.claude', 'state'), { recursive: true });
  fs.writeFileSync(path.join(root, reseal.MANIFEST_REL), JSON.stringify({
    schema: 1, state: 'in-progress', old_sha: plan.old_sha, new_sha: plan.new_sha,
    carried_item_ids: plan.carried.map(function (c) { return c.item_id; }),
    carried_records: plan.carried, started_at: new Date().toISOString(), completed_at: null,
  }, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(root, di.INVENTORY_REL), JSON.stringify(candidate, null, 2) + '\n', 'utf8');

  const before = di.verifyDispositions(root).open;
  const res = reseal.applyReseal(root, { apply: true });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.mode, 'resume');
  assert.ok(res.appended > 0);
  assert.ok(di.verifyDispositions(root).open < before,
    'resuming must actually reduce the unjudged count, not merely report success');
  assert.equal(reseal.readManifest(root).state, 'complete');
});

// ── 8: no second writer ──────────────────────────────────────────────────────

test('reseal.js never appends to the ledger itself', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'msw-metrics', 'reseal.js'), 'utf8');
  // `appendDispositions` is the only place a record is validated, and the ledger
  // cannot be un-appended. A second writer here would put unvalidated lines in it.
  assert.equal(/fs\.appendFileSync/.test(src), false,
    'every ledger write must go through appendDispositions');
});

// ── fail-closed: a degraded plan never applies ───────────────────────────────

test('an unreadable source refuses to apply rather than re-sealing around it', () => {
  const root = makeRepo({ backlogRows: [row(1, 'HIGH'), row(2)] });
  sealAndDispose(root);
  writeBacklog(root, [row(1, 'HIGH'), row(2), row(3)]);

  // Corrupt the ledger so the plan cannot read the judgments it must carry.
  fs.appendFileSync(path.join(root, di.DISPOSITIONS_REL), '{ not json\n', 'utf8');
  const plan = reseal.planReseal(root);
  assert.equal(plan.ok, false);
  assert.ok(plan.degraded.length > 0);

  const sealBefore = fs.readFileSync(path.join(root, di.INVENTORY_REL), 'utf8');
  const res = reseal.applyReseal(root, { apply: true });
  assert.equal(res.ok, false);
  assert.equal(res.aborted, 'plan-degraded');
  assert.equal(fs.readFileSync(path.join(root, di.INVENTORY_REL), 'utf8'), sealBefore,
    'a refused re-seal must leave the denominator exactly where it was');
});

test('the succession arithmetic always closes', () => {
  const root = makeRepo({ backlogRows: [row(1, 'HIGH'), row(2), row(3)] });
  const old = sealAndDispose(root);
  writeBacklog(root, [row(1, 'HIGH'), row(3), row(4), row(5)]);   // one row removed, two added
  const plan = reseal.planReseal(root);
  assert.equal(plan.ok, true);
  const judged = old.items.filter(function (it) {
    return di.foldDispositions(di.readDispositions(root).lines).has(it.item_id);
  }).length;
  assert.equal(plan.carried.length + plan.carry_blocked.length + plan.dropped.length, judged,
    'every judged item is carried, blocked, or reported dropped — none silently vanishes');
  assert.ok(plan.dropped.length > 0, 'the removed row must be REPORTED, not absorbed');
});

test('a tracked archive filed under a sha it does not hash to is not an ancestor', () => {
  // The missing-archive and untracked-archive cases are caught by the read and
  // the index check; NEITHER exercises the recompute. Without this case, deleting
  // the `inventoryHash(archived.items) !== sha` test leaves the whole suite green
  // — measured. The recompute is the only thing standing between "a sha appears
  // in unsigned meta" and "every line bound to it escapes binding_mismatch", so it
  // needs a case that fails when it is removed.
  const root = makeRepo({ backlogRows: [row(1)] });
  const real = di.sealInventory(root);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'seal']);

  // A well-formed archive whose items are NOT the ones that hash to this name.
  const rel = di.archiveRelFor(real.inventory_sha256);
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const impostor = {
    meta: real.meta,
    inventory_sha256: real.inventory_sha256,
    items: [{ item_id: 'backlog:0000000000000000', source: 'backlog', severity: 'LOW' }],
  };
  fs.writeFileSync(abs, JSON.stringify(impostor, null, 2) + '\n', 'utf8');
  git(root, ['add', '--', rel]);
  assert.notEqual(di.inventoryHash(impostor.items), real.inventory_sha256);

  const probe = {
    inventory_sha256: 'sha256:' + 'a'.repeat(64),
    meta: { ancestry: [real.inventory_sha256] },
    items: [],
  };
  const anc = di.sealAncestry(root, probe);
  assert.deepEqual(anc.verified, [],
    'a filename is a claim; only the recompute checks it');
  assert.equal(anc.unverified.length, 1);
  assert.match(anc.unverified[0].reason, /does not hash to the sha it is filed under/);
});
