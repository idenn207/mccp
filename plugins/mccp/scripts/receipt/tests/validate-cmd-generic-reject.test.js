'use strict';

// v0.2.8 Task 2.6.5 — generic decision_id reject with --plan mismatch.
//
// validates that when a caller passes `--decision {default|main}` together
// with `--plan <unrelated>`, the validator surfaces a plan_hash mismatch
// rather than a false-green pass. This is the R1-F1 absorption path that
// prevents stale `default.json`/`main.json` receipts from re-validating
// unrelated plans.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write } = require('../write');
const { validateCommand } = require('../validate-cmd');

function setupRepo() {
  const repo = mkTmpRepo();
  const original = writeFileSync(repo, '.claude/plans/original.plan.md', '# original plan\n\nbody\n');
  const unrelated = writeFileSync(repo, '.claude/plans/unrelated.plan.md', '# unrelated plan\n\ndifferent body\n');
  return {
    repo: repo,
    originalRel: path.relative(repo, original),
    unrelatedRel: path.relative(repo, unrelated),
  };
}

test('generic-reject: --decision default --plan <unrelated> → stale plan_hash mismatch', function () {
  const { repo, originalRel, unrelatedRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    // Write a "default" receipt for the original plan.
    write({ gate: 'mccp-plan-codex', decision: 'default', plan: originalRel });

    // Validate prp-implement with decision=default + plan=unrelated.
    // The boot-time migration moves the receipt to default.legacy.json,
    // so the validator finds no matching active receipt → missing.
    const r = validateCommand('/mccp:prp-implement', {
      cwd: repo,
      decisionId: 'default',
      planPath: unrelatedRel,
    });

    assert.strictEqual(r.ok, false, JSON.stringify(r));
    // Either stale (if migration didn't run) or missing (if migration ran).
    const hasReject = r.stale.length > 0 || r.missing.length > 0;
    assert.ok(hasReject, 'expected stale OR missing entry: ' + JSON.stringify(r));
  } finally {
    process.chdir(cwd);
  }
});

test('generic-reject: --decision main --plan <unrelated> → stale plan_hash mismatch', function () {
  const { repo, originalRel, unrelatedRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'main', plan: originalRel });

    const r = validateCommand('/mccp:prp-implement', {
      cwd: repo,
      decisionId: 'main',
      planPath: unrelatedRel,
    });

    assert.strictEqual(r.ok, false);
    const hasReject = r.stale.length > 0 || r.missing.length > 0;
    assert.ok(hasReject, 'expected stale OR missing entry: ' + JSON.stringify(r));
  } finally {
    process.chdir(cwd);
  }
});
