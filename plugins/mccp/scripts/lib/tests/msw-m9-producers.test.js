'use strict';

// multi-session-work-loop M9 — producer wiring regression.
//
// Created by Task 2 and extended in place by Tasks 3 and 4 (see the plan's
// `## Tasks` banner). Each task's Validate runs only the assertions that exist
// at that point; the file is not created by Task 6, which builds the coverage
// gate and nothing else.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const registry = require('../../state/findings-registry');
const CLI = path.join(__dirname, '..', 'plan-review', 'cli.js');

const HEADER = [
  '# Codex findings backlog',
  '',
  '| Date | Severity | Source plan | Finding |',
  '|---|---|---|---|',
  '',
].join('\n');

const PLAN_HASH = 'sha256:' + 'a'.repeat(64);

// Windows tmp hands back 8.3 short names and the CLI judges containment by
// realpath, so the root must be normalised the same way the sibling suite does.
function makeRepo(opts) {
  const o = opts || {};
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-m9-')));
  fs.mkdirSync(path.join(root, '.claude', 'plans'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'state', 'plan-review'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'reviews'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'plans', 'codex-findings-backlog.md'),
    o.backlogBody === undefined ? HEADER : o.backlogBody, 'utf8');
  fs.writeFileSync(path.join(root, '.claude', 'plans', 'x.plan.md'), '# Plan\n', 'utf8');
  fs.writeFileSync(path.join(root, '.claude', 'state', 'plan-review', 'decision.json'),
    JSON.stringify(o.decision, null, 2), 'utf8');
  return root;
}

function decisionWith(blockingFindings) {
  return {
    review_verdict: 'divergent',
    review_source: 'multi-agent',
    single_pass_reason: 'deferred_to_prd_completion',
    review_proof: { reviewed_plan_hash: PLAN_HASH },
    quorum: { passed: false, blockingFindings: blockingFindings },
  };
}

// Open a finding through the real producer path so the id is derived exactly as
// `emitPanelFindings` derives it. Hand-writing the JSONL would let the test
// agree with a formula the shipping code does not use.
function openFinding(root, slug, f) {
  const r = registry.appendFindings(slug, [{
    kind: 'finding_opened',
    gate_id: 'mccp-plan-codex',
    perspective: f.perspective,
    severity: f.severity,
    claim: f.claim,
    claim_digest: registry.claimDigestOf(f.claim),
  }], { repoRoot: root });
  assert.ok(r.ok, 'fixture setup: finding_opened must append');
  return registry.deriveFindingId({
    work_unit: slug,
    gate_id: 'mccp-plan-codex',
    perspective: f.perspective,
    severity: f.severity,
    claim: f.claim,
  });
}

function runBacklogAppend(root, slug) {
  return spawnSync(process.execPath, [CLI, 'backlog-append',
    '--review-dir', path.join(root, '.claude', 'state', 'plan-review'),
    '--plan', path.join(root, '.claude', 'plans', 'x.plan.md'),
    '--slug', slug,
  ], { encoding: 'utf8', cwd: root });
}

function shardOf(root, slug) {
  return registry.readShard(slug, { repoRoot: root });
}

// ---- Task 2 - the panel path closes what it defers -------------------------

test('M9 Task 2: a backlogged finding is closed as deferred, and the closure rate does not move', () => {
  const slug = 'm9-close';
  const real = { perspective: 'security', severity: 'CRITICAL', claim: 'a real reviewer finding' };
  const root = makeRepo({ decision: decisionWith([real]) });

  const id = openFinding(root, slug, real);
  assert.strictEqual(shardOf(root, slug).counts.open, 1, 'precondition: exactly one open finding');

  const run = runBacklogAppend(root, slug);
  assert.strictEqual(run.status, 0, 'backlog-append must succeed:\n' + run.stderr);

  const shard = shardOf(root, slug);
  const rec = shard.findings.find((f) => f.finding_id === id);
  assert.ok(rec, 'the closure must join to the finding the panel opened, not create a new one');
  assert.strictEqual(rec.state, 'closed');
  assert.strictEqual(rec.closure_type, 'deferred');

  // The whole safety argument for this producer: `deferred` is not a resolving
  // closure type, so a producer that runs on every relaxed round cannot inflate
  // C1. If this ever fails, the producer started claiming work it did not do.
  assert.strictEqual(registry.RESOLVING_CLOSURE_TYPES.indexOf('deferred'), -1,
    'deferred must never become a resolving closure type');
  assert.strictEqual(shard.counts.resolved, 0, 'the numerator must not move');
  assert.strictEqual(shard.counts.deferred, 1);
  assert.strictEqual(shard.counts.open, 0);
  assert.strictEqual(shard.counts.total, 1, 'the denominator must not grow either');

  fs.rmSync(root, { recursive: true, force: true });
});

test('M9 Task 2: a blocking entry the panel never opened is skipped, not fabricated', () => {
  // `quorum.js` synthesises a row for `verdict=fail` that carries no reviewer
  // claim, and normalises an unreadable severity to 'UNKNOWN' while the opener
  // writes null. Neither can join to an opened finding. Closing them anyway
  // would mint records with `opened_at: null` - a denominator made of findings
  // nobody ever reported.
  const slug = 'm9-phantom';
  const real = { perspective: 'test', severity: 'HIGH', claim: 'a real reviewer finding' };
  const synthetic = { perspective: 'test', severity: 'FAIL', claim: 'reviewer returned verdict=fail' };
  const root = makeRepo({ decision: decisionWith([real, synthetic]) });

  openFinding(root, slug, real);
  const before = shardOf(root, slug);
  assert.strictEqual(before.counts.total, 1);

  const run = runBacklogAppend(root, slug);
  assert.strictEqual(run.status, 0, run.stderr);

  const artifact = JSON.parse(fs.readFileSync(
    path.join(root, '.claude', 'state', 'plan-review', 'backlog.json'), 'utf8'));
  assert.strictEqual(artifact.closures_emitted, 1);
  assert.strictEqual(artifact.closures_skipped_unmatched, 1,
    'the synthesised verdict=fail row has no opened counterpart and must be counted as skipped');

  const after = shardOf(root, slug);
  assert.strictEqual(after.counts.total, 1, 'no phantom record may enter the denominator');
  assert.strictEqual(after.counts.deferred, 1);

  fs.rmSync(root, { recursive: true, force: true });
});

test('M9 Task 2: when the backlog append fails, nothing is closed', () => {
  // Order is the contract. A finding closed as `deferred` with no deferral
  // record behind it is a closure pointing at nothing, so the failure path must
  // return before the producer runs.
  const slug = 'm9-noheader';
  const real = { perspective: 'invariant', severity: 'CRITICAL', claim: 'a real reviewer finding' };
  // A backlog with no header row: appendRows refuses rather than inventing one.
  const root = makeRepo({ decision: decisionWith([real]), backlogBody: '# Codex findings backlog\n' });

  openFinding(root, slug, real);

  const run = runBacklogAppend(root, slug);
  assert.notStrictEqual(run.status, 0, 'a load it could not record must not report success');

  const shard = shardOf(root, slug);
  assert.strictEqual(shard.counts.open, 1, 'the finding must still be open');
  assert.strictEqual(shard.counts.deferred, 0, 'nothing may be deferred without a backlog row');

  fs.rmSync(root, { recursive: true, force: true });
});
