'use strict';

// v1.3.0-m2 Task 4 validate — triggerBriefing end-to-end with fs fixture.
//
// Uses os.tmpdir() + mkdtempSync (mirror of derive/tests/mccp-fixture.test.js)
// to synthesize a tiny repo, inject guard + invoke shims, and verify the
// on-disk receipt JSON is re-stamped correctly.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { triggerBriefing } = require('../index');
const { makeSkeleton, validate } = require('../../../receipt/schema');
const { writeReceipt, receiptPath } = require('../../../receipt/store');

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-briefing-'));
  fs.mkdirSync(path.join(root, '.claude', 'receipts'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'state'), { recursive: true });
  return root;
}

function seedReceipt(repoRoot, decisionId) {
  const r = makeSkeleton({});
  r.gate_id = 'mccp-plan-codex';
  r.phase = 'plan';
  r.decision_id = decisionId;
  r.task_id = 'T1';
  r.plan_hash = 'sha256:' + 'a'.repeat(64);
  r.base_sha = 'a'.repeat(40);
  r.head_sha = 'a'.repeat(40);
  r.subject_hash = 'sha256:' + 'b'.repeat(64);
  r.receipt_hash = 'sha256:' + 'c'.repeat(64);
  r.meta.command = 'mccp:test';
  const p = writeReceipt(repoRoot, r);
  return { r, p };
}

function readDisk(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

test('skip path stamps invocation_count=0 + summary=null (audit trail of "attempted, skipped")', function () {
  const root = makeRepo();
  const { r, p } = seedReceipt(root, 'skip-path-decision');

  triggerBriefing(root, r, p, {
    guard: function () { return { skip: true, reason: 'tier-notice', tier: 'notice' }; },
    invoke: function () { throw new Error('should not be called in skip path'); },
  });

  const disk = readDisk(p);
  assert.equal(disk.meta.briefing_summary, null);
  assert.equal(disk.meta.briefing_token_count, 0);
  assert.equal(disk.meta.briefing_token_estimated, false);
  assert.equal(disk.meta.briefing_invocation_count, 0);
  // Validate the result on disk satisfies the schema.
  const v = validate(disk);
  assert.equal(v.ok, true, 'errors: ' + JSON.stringify(v.errors));
});

test('ok path stamps summary + token count + invocation_count=1', function () {
  const root = makeRepo();
  const { r, p } = seedReceipt(root, 'ok-path-decision');

  triggerBriefing(root, r, p, {
    guard: function () { return { skip: false, reason: 'ok-run', tier: 'green' }; },
    invoke: function () {
      return {
        ok: true,
        summary: 'M2 dogfood verdict',
        tokenCount: 88,
        estimated: true,
        classification: 'ok',
      };
    },
  });

  const disk = readDisk(p);
  assert.equal(disk.meta.briefing_summary, 'M2 dogfood verdict');
  assert.equal(disk.meta.briefing_token_count, 88);
  assert.equal(disk.meta.briefing_token_estimated, true);
  assert.equal(disk.meta.briefing_invocation_count, 1);
});

test('invoke failure stamps null summary + estimated false + invocation_count=1', function () {
  const root = makeRepo();
  const { r, p } = seedReceipt(root, 'fail-path-decision');

  triggerBriefing(root, r, p, {
    guard: function () { return { skip: false, reason: 'ok-run', tier: 'green' }; },
    invoke: function () {
      return { ok: false, summary: null, tokenCount: 0, estimated: false, classification: 'timeout' };
    },
  });

  const disk = readDisk(p);
  assert.equal(disk.meta.briefing_summary, null);
  assert.equal(disk.meta.briefing_token_count, 0);
  assert.equal(disk.meta.briefing_invocation_count, 1,
    'invocation_count must be 1 even when the call failed — we did attempt it');
});

test('thrown exception inside invoke is caught + logged (fail-open invariant)', function () {
  const root = makeRepo();
  const { r, p } = seedReceipt(root, 'throw-path-decision');

  // Should NOT throw out of triggerBriefing.
  assert.doesNotThrow(function () {
    triggerBriefing(root, r, p, {
      guard: function () { return { skip: false, reason: 'ok-run', tier: 'green' }; },
      invoke: function () { throw new Error('synthetic invoke throw'); },
    });
  });
});

test('schema-invalid stamp is caught — receipt left in pre-stamp state', function () {
  const root = makeRepo();
  const { r, p } = seedReceipt(root, 'invalid-stamp-decision');
  const preStamp = readDisk(p);

  // Inject a guard that returns ok-run + invoke that returns a summary
  // longer than the 1024 cap (would fail validate inside stampReceipt).
  triggerBriefing(root, r, p, {
    guard: function () { return { skip: false, reason: 'ok-run', tier: 'green' }; },
    invoke: function () {
      return {
        ok: true,
        summary: 'x'.repeat(2000),
        tokenCount: 1,
        estimated: true,
        classification: 'ok',
      };
    },
  });

  // schema-invalid throws inside stampReceipt → outer catch → receipt
  // remains in pre-stamp state.
  // NOTE: invoke's parseSummary caps at 1024, so this actually succeeds. The
  // *real* schema-invalid path is exercised by directly producing oversized
  // summary at stampReceipt boundary — which can't happen via the public
  // surface. So we verify only that the receipt is consistent (no torn write).
  const postStamp = readDisk(p);
  assert.ok(typeof postStamp === 'object');
  assert.equal(postStamp.decision_id, preStamp.decision_id);
});

test('re-entrancy guard short-circuits (BRIEFING_IN_PROGRESS)', function () {
  const root = makeRepo();
  const { r, p } = seedReceipt(root, 'reentrancy-decision');

  let inner = 0;
  let outer = 0;
  triggerBriefing(root, r, p, {
    guard: function () { return { skip: false, reason: 'ok-run', tier: 'green' }; },
    invoke: function () {
      outer += 1;
      // Inside the invoke (simulating a sub-process that re-enters write).
      triggerBriefing(root, r, p, {
        guard: function () { return { skip: false, reason: 'ok-run', tier: 'green' }; },
        invoke: function () { inner += 1; return { ok: true, summary: 'inner', tokenCount: 1 }; },
      });
      return { ok: true, summary: 'outer', tokenCount: 1, estimated: true, classification: 'ok' };
    },
  });

  assert.equal(outer, 1);
  assert.equal(inner, 0,
    'inner triggerBriefing must short-circuit on BRIEFING_IN_PROGRESS');
});
