'use strict';

// v1.3.0-m2 Task 3 validate — invokeBriefing classification mapping.
//
// Injects opts.invoker shim so no real codex-companion spawn occurs.

const test = require('node:test');
const assert = require('node:assert/strict');

const { invokeBriefing, buildFocus, tokenEstimate } = require('../invoke');

function makeReceipt(over) {
  return Object.assign({
    gate_id: 'mccp-plan-codex',
    decision_id: 'invoke-test',
    phase: 'plan',
    round: 1,
    findings: [],
    resolution: { converged: true, rounds: 1, open_questions: [] },
  }, over || {});
}

test('classification=ok with non-empty stdout returns parsed 1-line summary', function () {
  const r = invokeBriefing(makeReceipt(), null, {
    invoker: function (focus, opts) {
      assert.ok(typeof focus === 'string' && focus.length > 0);
      assert.equal(opts.timeoutMs, 60 * 1000);
      assert.equal(opts.json, true);
      return {
        ok: true,
        classification: 'ok',
        stdout: 'M2 ready for PR review\n',
        stderr: '',
        durationMs: 100,
      };
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.classification, 'ok');
  assert.equal(r.summary, 'M2 ready for PR review');
  assert.equal(typeof r.tokenCount, 'number');
  assert.ok(r.tokenCount > 0);
  assert.equal(r.estimated, true,
    'codex-companion does not emit tokenUsage as of v1.3 — estimated must be true');
});

test('classification=ok with real tokenUsage flips estimated=false', function () {
  const r = invokeBriefing(makeReceipt(), null, {
    invoker: function () {
      return {
        ok: true,
        classification: 'ok',
        stdout: 'next: ship after schema bump',
        stderr: '',
        durationMs: 80,
        tokenUsage: { total: 73 },
      };
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.tokenCount, 73);
  assert.equal(r.estimated, false);
});

test('classification=disabled is a graceful no-op (not a failure)', function () {
  const r = invokeBriefing(makeReceipt(), null, {
    invoker: function () {
      return { ok: true, classification: 'disabled', stdout: '', stderr: '', durationMs: 0 };
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.classification, 'disabled');
  assert.equal(r.summary, null);
  assert.equal(r.tokenCount, 0);
  assert.equal(r.estimated, false);
});

test('classification=timeout returns ok:false + classification preserved', function () {
  const r = invokeBriefing(makeReceipt(), null, {
    invoker: function () {
      return { ok: false, classification: 'timeout', stdout: '', stderr: 'timeout', durationMs: 60001 };
    },
  });
  assert.equal(r.ok, false);
  assert.equal(r.classification, 'timeout');
  assert.equal(r.summary, null);
  assert.equal(r.tokenCount, 0);
});

test('classification=ok but empty stdout returns stdout-empty failure', function () {
  const r = invokeBriefing(makeReceipt(), null, {
    invoker: function () {
      return { ok: true, classification: 'ok', stdout: '   \n  ', stderr: '', durationMs: 50 };
    },
  });
  assert.equal(r.ok, false);
  assert.equal(r.classification, 'stdout-empty');
});

test('invoker throwing surfaces parse-error classification (fail-closed at boundary)', function () {
  const r = invokeBriefing(makeReceipt(), null, {
    invoker: function () { throw new Error('synthetic spawn fail'); },
  });
  assert.equal(r.ok, false);
  assert.equal(r.classification, 'parse-error');
  assert.ok(r.error && r.error.includes('synthetic spawn fail'));
});

test('summary is capped at 1024 chars (matches schema validate cap)', function () {
  const longLine = 'X'.repeat(2000);
  const r = invokeBriefing(makeReceipt(), null, {
    invoker: function () {
      return { ok: true, classification: 'ok', stdout: longLine, stderr: '', durationMs: 1 };
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.summary.length, 1024);
});

test('buildFocus contains gate_id + decision_id + verdict instruction', function () {
  const focus = buildFocus(makeReceipt({ decision_id: 'aud-test' }), null);
  assert.ok(focus.includes('mccp-plan-codex'));
  assert.ok(focus.includes('aud-test'));
  assert.ok(focus.includes('verdict'));
  assert.ok(focus.includes('Output ONLY the verdict line'));
});

test('tokenEstimate counts input+output (Codex R1 F2 absorption)', function () {
  const e = tokenEstimate('a'.repeat(100), 'b'.repeat(20));
  // (100 + 20) / 4 = 30, ceil → 30.
  assert.equal(e, 30);
});
