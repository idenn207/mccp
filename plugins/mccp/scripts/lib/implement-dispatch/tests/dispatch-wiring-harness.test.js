'use strict';

// workflow-orchestration live-activation M1 Task 5 — low-cost dispatch-wiring
// harness. A synthetic git-worktree e2e that exercises the REAL command-body
// dispatch plumbing — prepare-fleet → (per worktree) seed-envelope + mark →
// collect-worktrees → reconcile — with NO LLM / Agent call (fake workers just
// seed+mark). It proves the seed→mark→collect→reconcile wiring reaches a clean
// aggregate verdict WITH the 3-flag attribution anchor enforced, and that an F1
// PR-gate leak still HALTs. M2 owns the real LLM completion; this closes the
// wiring gaps cheaply first.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');

const CLI = path.resolve(__dirname, '..', '..', 'dispatch-cli.js');

function git(args, cwd, input) {
  return spawnSync('git', args, { cwd: cwd, encoding: 'utf8', input: input });
}

// Run dispatch-cli.js as the command body does (fresh node process).
function cli(args, cwd) {
  const r = spawnSync(process.execPath, [CLI].concat(args), { cwd: cwd, encoding: 'utf8' });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_) { /* non-JSON output */ }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json: json };
}

function rimraf(t) { try { fs.rmSync(t, { recursive: true, force: true }); } catch (_) {} }

function setupRepo() {
  const raw = fs.mkdtempSync(path.join(os.tmpdir(), 'wiring-'));
  git(['init', '-q', '-b', 'main', '.'], raw);
  // Canonicalize to git's own toplevel form. On Windows os.tmpdir() can return an
  // 8.3 short name (C:\Users\SKYPAR~1\...) while `git worktree list` reports the
  // long name — collect-worktrees' self-filter compares them and would fail to
  // exclude the parent, double-counting its placeholder envelope. A real repo
  // path has no such mismatch; this only bites the temp dir.
  const top = git(['-C', raw, 'rev-parse', '--show-toplevel'], raw).stdout.trim();
  const root = top ? path.resolve(top) : raw;
  git(['config', 'user.email', 's@e.com'], root);
  git(['config', 'user.email', 's@e.com'], root);
  git(['config', 'user.name', 'harness'], root);
  git(['config', 'commit.gpgsign', 'false'], root);
  git(['config', 'core.autocrlf', 'false'], root);
  // .claude/ gitignored so seeded envelopes + written receipts never show up as
  // untracked in a worktree (they'd otherwise register as partition-escapes).
  fs.writeFileSync(path.join(root, '.gitignore'), '.claude/\n');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.js'), 'module.exports = "a base";\n');
  fs.writeFileSync(path.join(root, 'src', 'b.js'), 'module.exports = "b base";\n');
  fs.writeFileSync(path.join(root, 'plan.md'), '# harness plan\n');
  git(['add', '-A'], root);
  git(['commit', '-qm', 'base'], root);
  return root;
}

// Write an ANCHORED implement-codex receipt to the parent store so deriveVerdict's
// F3 anchor gate passes (controller_context_marker_present + 3 flags ==
// expectedAnchor). In the live flow the worker writes this via receipt/cli.js with
// the 3 attribution flags; the harness stands in for the LLM by writing the fixture.
function writeAnchoredReceipt(root, slug, anchor) {
  const p = path.join(root, '.claude', 'receipts', slug);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({
    gate: 'mccp-implement-codex',
    meta: {
      controller_context_marker_present: true,
      dispatched_by_controller_session_id: anchor.sessionId,
      worker_dispatch_id: anchor.dispatchId,
      ipc_envelope_path: anchor.ipcPath,
    },
  }, null, 2));
}

// Stand up 2 partition workers end-to-end (worktree + seed + edit + mark + receipt
// + result file). Returns the paths the reconcile step needs.
function runFakeFleet(root) {
  const session = crypto.randomUUID();
  const gitdir = path.join(root, '.harness');
  fs.mkdirSync(gitdir, { recursive: true });

  // partitions: two disjoint file sets.
  const partitionsFile = path.join(gitdir, 'partitions.json');
  fs.writeFileSync(partitionsFile, JSON.stringify({
    partitions: [
      { files: ['src/a.js'], taskIds: ['1'] },
      { files: ['src/b.js'], taskIds: ['2'] },
    ],
  }));

  // 1 — prepare-fleet.
  const prep = cli(['prepare-fleet', '--plan', 'plan.md', '--controller-session', session,
    '--partitions-file', partitionsFile, '--subagent', 'general-purpose'], root);
  assert.equal(prep.status, 0, 'prepare-fleet exit 0: ' + prep.stderr);
  const prepareFile = path.join(gitdir, 'prepare.json');
  fs.writeFileSync(prepareFile, prep.stdout);
  assert.equal(prep.json.n, 2);

  // 2 — emit-workflow-args (fleet shape).
  const emit = cli(['emit-workflow-args', '--prepare-file', prepareFile, '--min-remaining', '0'], root);
  assert.equal(emit.status, 0, 'emit-workflow-args exit 0: ' + emit.stderr);
  const argsFile = path.join(gitdir, 'fleet-args.json');
  fs.writeFileSync(argsFile, emit.stdout);
  assert.ok(Array.isArray(emit.json.reconcileInputs) && emit.json.reconcileInputs.length === 2);

  const resultsDir = path.join(gitdir, 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const dispatchIds = [];

  // 3 — per worker: worktree + seed + edit + mark + anchored receipt + result.
  prep.json.workers.forEach(function (w, i) {
    dispatchIds.push(w.dispatchId);
    const wt = path.join(root, '.wt', 'w' + i);
    const add = git(['worktree', 'add', '-q', '-b', 'wt-' + i, wt, 'HEAD'], root);
    assert.equal(add.status, 0, 'worktree add: ' + add.stderr);

    // fake worker seeds its envelope IN the worktree (FIRST STEP contract).
    const seed = cli(['seed-envelope', '--envelope', w.ipcEnvelopePath,
      '--dispatch-id', w.dispatchId, '--controller-session', session], wt);
    assert.equal(seed.status, 0, 'seed-envelope exit 0: ' + seed.stderr);

    // fake worker edits ONLY its partition file (stays inside the slice).
    const partFile = w.partitionFiles[0];
    fs.appendFileSync(path.join(wt, partFile), '// touched by worker ' + i + '\n');

    // per-worker anchored receipt (distinct slug avoids a same-decision collision
    // in the shared parent store; each must anchor to its own dispatch identity).
    const slug = 'mccp-implement-codex/harness-w' + i + '.json';
    writeAnchoredReceipt(root, slug, w.expectedAnchor);

    // terminal envelope (ok) with the receipt slug.
    const mark = cli(['mark', '--envelope', w.ipcEnvelopePath, '--status', 'ok',
      '--receipts', slug, '--next-action', 'done'], wt);
    assert.equal(mark.status, 0, 'mark exit 0: ' + mark.stderr);

    // structured return the reconcile trigger consumes.
    fs.writeFileSync(path.join(resultsDir, w.dispatchId + '.json'), JSON.stringify({
      result: { status: 'ok', receiptsAdded: [slug], changedFiles: [partFile], testResult: 'ok' },
      dispatchId: w.dispatchId,
    }));
  });

  return { session, gitdir, argsFile, resultsDir, dispatchIds };
}

test('e2e: prepare-fleet → seed → mark → collect → reconcile → verdict ok (+ anchor)', function (t) {
  if (git(['--version']).status !== 0) { t.skip('git not available'); return; }
  const root = setupRepo();
  try {
    const f = runFakeFleet(root);

    // 4 — collect-worktrees correlates each dispatchId to its worktree via the
    // seeded envelope filename.
    const mapFile = path.join(f.gitdir, 'worktree-map.json');
    const collect = cli(['collect-worktrees', '--dispatch-ids', f.dispatchIds.join(','),
      '--repo-root', root, '--out', mapFile], root);
    assert.equal(collect.status, 0, 'collect-worktrees exit 0: ' + collect.stderr);
    assert.deepEqual(collect.json.missing, []);
    assert.deepEqual(collect.json.ambiguous, []);
    const wmap = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
    f.dispatchIds.forEach(function (id) { assert.ok(typeof wmap[id] === 'string' && wmap[id].length > 0); });

    // 5 — reconcile (fleet: return ∧ worktree-envelope ∧ store ∧ real-diff).
    const rec = cli(['reconcile', '--args-file', f.argsFile, '--results-dir', f.resultsDir,
      '--worktree-map', mapFile, '--repo-root', root], root);
    assert.equal(rec.status, 0, 'reconcile exit 0: ' + rec.stderr);
    assert.equal(rec.json.verdict, 'ok', 'clean wiring → ok; got ' + JSON.stringify(rec.json));
    assert.deepEqual(rec.json.invariantViolations, []);
    assert.deepEqual(rec.json.unanchored, [], 'all receipts store-anchored to the controller session');
    assert.deepEqual(rec.json.partitionEscapes, [], 'workers stayed inside their partitions');
    assert.equal(rec.json.receiptsAdded.length, 2);
  } finally {
    for (let i = 0; i < 2; i++) git(['worktree', 'remove', '--force', '.wt/w' + i], root);
    rimraf(root);
  }
});

test('e2e: F1 — a leaked mccp-pr-codex receipt HALTs the fleet (invariant-violation)', function (t) {
  if (git(['--version']).status !== 0) { t.skip('git not available'); return; }
  const root = setupRepo();
  try {
    const f = runFakeFleet(root);
    // Poison worker 0's return with a forbidden PR-gate slug (as if it ran commit/PR).
    const id0 = f.dispatchIds[0];
    fs.writeFileSync(path.join(f.resultsDir, id0 + '.json'), JSON.stringify({
      result: {
        status: 'ok',
        receiptsAdded: ['mccp-implement-codex/harness-w0.json', 'mccp-pr-codex/leak.json'],
        changedFiles: ['src/a.js'], testResult: 'ok',
      },
      dispatchId: id0,
    }));

    const mapFile = path.join(f.gitdir, 'worktree-map.json');
    cli(['collect-worktrees', '--dispatch-ids', f.dispatchIds.join(','),
      '--repo-root', root, '--out', mapFile], root);
    const rec = cli(['reconcile', '--args-file', f.argsFile, '--results-dir', f.resultsDir,
      '--worktree-map', mapFile, '--repo-root', root], root);
    assert.equal(rec.status, 0, 'reconcile exit 0 (verdict carries the halt): ' + rec.stderr);
    assert.equal(rec.json.verdict, 'invariant-violation', 'PR-gate leak must HALT');
    assert.ok(rec.json.invariantViolations.length >= 1);
    assert.ok(rec.json.invariantViolations.some(function (v) { return /pr-codex/.test(v.slug); }));
  } finally {
    for (let i = 0; i < 2; i++) git(['worktree', 'remove', '--force', '.wt/w' + i], root);
    rimraf(root);
  }
});

test('smoke: merge-apply (patch-scoped) then rollback-apply restores the parent', function (t) {
  if (git(['--version']).status !== 0) { t.skip('git not available'); return; }
  const root = setupRepo();
  try {
    const base = git(['rev-parse', 'HEAD'], root).stdout.trim();
    const wt = path.join(root, '.wt', 'm0');
    git(['worktree', 'add', '-q', '-b', 'merge-0', wt, base], root);
    const dispatchId = crypto.randomUUID();
    // disjoint edit staged in the worktree.
    fs.appendFileSync(path.join(wt, 'src', 'a.js'), '// merged line\n');
    git(['add', '-A'], wt);

    const wmapFile = path.join(root, '.harness-merge-map.json');
    fs.mkdirSync(path.dirname(wmapFile), { recursive: true });
    const wmap = {}; wmap[dispatchId] = wt;
    fs.writeFileSync(wmapFile, JSON.stringify(wmap));
    const partFile = path.join(root, '.harness-merge-part.json');
    const part = {}; part[dispatchId] = ['src/a.js'];
    fs.writeFileSync(partFile, JSON.stringify(part));
    const patchesOut = path.join(root, '.harness-merge-patches.json');

    const merge = cli(['merge-apply', '--worktree-map', wmapFile, '--partitions-file', partFile,
      '--repo-root', root, '--patches-out', patchesOut], root);
    assert.equal(merge.status, 0, 'merge-apply exit 0: ' + merge.stderr);
    assert.equal(merge.json.ok, true);
    assert.equal(merge.json.applied, 1);
    assert.match(fs.readFileSync(path.join(root, 'src', 'a.js'), 'utf8'), /merged line/);

    // patch-scoped rollback restores the parent (F4 — never a broad checkout).
    const rb = cli(['rollback-apply', '--patches-file', patchesOut, '--repo-root', root], root);
    assert.equal(rb.status, 0, 'rollback-apply exit 0: ' + rb.stderr);
    assert.equal(rb.json.ok, true);
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'src', 'a.js'), 'utf8'), /merged line/);
  } finally {
    git(['worktree', 'remove', '--force', '.wt/m0'], root);
    rimraf(root);
  }
});
