'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  IMPLEMENT_RESULT_SCHEMA,
  FORBIDDEN_RECEIPT_RE,
  IMPLEMENT_RECEIPT_RE,
  RESULT_STATUSES,
  normSlugSet,
  deriveVerdict,
} = require('../result-schema');

const CONTROLLER_SESSION_ID = '019eced3-cce9-7be3-81a1-c8a5c30a27fe';
const DISPATCH_ID = '019ecedf-1234-5678-9abc-def012345678';
const IPC_PATH = '.claude/state/dispatches/' + DISPATCH_ID + '.envelope.json';
const IMPL_SLUG = 'mccp-implement-codex/x.json';

const EXPECTED_ANCHOR = {
  sessionId: CONTROLLER_SESSION_ID,
  dispatchId: DISPATCH_ID,
  ipcPath: IPC_PATH,
};

// A fully-anchored implement receipt as the caller would read it off disk.
function anchoredReceipt(over) {
  return {
    meta: Object.assign({
      controller_context_marker_present: true,
      dispatched_by_controller_session_id: CONTROLLER_SESSION_ID,
      worker_dispatch_id: DISPATCH_ID,
      ipc_envelope_path: IPC_PATH,
    }, (over && over.meta) || {}),
  };
}

function okEnvelope(over) {
  return Object.assign({
    schema_version: 'v1',
    dispatch_id: DISPATCH_ID,
    worker_exit_status: 'ok',
    receipts_added: [IMPL_SLUG],
    findings: [],
    controller_session_id: CONTROLLER_SESSION_ID,
    parent_cwd: '/repo',
  }, over || {});
}

function okResult(over) {
  return Object.assign({
    status: 'ok',
    receiptsAdded: [IMPL_SLUG],
    changedFiles: ['plugins/mccp/scripts/lib/foo.js'],
    testResult: '590 pass',
    nextAction: 'implement done; controller may commit',
    findings: [],
  }, over || {});
}

function baseInput(over) {
  return Object.assign({
    result: okResult(),
    envelope: okEnvelope(),
    receiptStore: { [IMPL_SLUG]: anchoredReceipt() },
    expectedAnchor: EXPECTED_ANCHOR,
  }, over || {});
}

// ── schema integrity ───────────────────────────────────────────────────────

test('schema: frozen, additionalProperties:false, required core fields, valid enum', () => {
  assert.ok(Object.isFrozen(IMPLEMENT_RESULT_SCHEMA), 'schema must be frozen');
  assert.strictEqual(IMPLEMENT_RESULT_SCHEMA.additionalProperties, false);
  assert.deepStrictEqual(
    IMPLEMENT_RESULT_SCHEMA.required,
    ['status', 'receiptsAdded', 'changedFiles', 'testResult']);
  assert.deepStrictEqual(
    IMPLEMENT_RESULT_SCHEMA.properties.status.enum,
    ['ok', 'failure', 'timeout', 'crashed']);
  // status enum must equal the envelope terminal set so reconciliation compares
  // like-for-like (no 'pending' — that is a non-terminal envelope state only).
  assert.deepStrictEqual(RESULT_STATUSES, ['ok', 'failure', 'timeout', 'crashed']);
});

test('workflow port: implement-dispatch.js IMPLEMENT_RESULT_SCHEMA is faithful to the lib (drift guard, L1)', () => {
  // The Workflow sandbox has no `require`, so scripts/workflows/implement-dispatch.js
  // inlines a HAND-COPIED port of IMPLEMENT_RESULT_SCHEMA. A silent divergence
  // (someone edits the lib enum/required but not the port) would let the Workflow
  // agent() accept a shape the caller-side deriveVerdict later rejects. Extract the
  // port literal and structurally compare it to the canonical lib object so the two
  // can never drift undetected (shared debt with plan-fanout's oracle+port split).
  const portSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'workflows', 'implement-dispatch.js'), 'utf8');
  const m = portSrc.match(/const IMPLEMENT_RESULT_SCHEMA\s*=\s*(\{[\s\S]*?\n\};)/);
  assert.ok(m, 'port must declare `const IMPLEMENT_RESULT_SCHEMA = { ... };`');
  const literal = m[1].replace(/;\s*$/, '');
  // eslint-disable-next-line no-new-func — evaluating our OWN repo source in-test
  const port = (new Function('return (' + literal + ')'))();
  assert.deepStrictEqual(port, IMPLEMENT_RESULT_SCHEMA,
    'Workflow port schema drifted from the lib canonical — keep the two in sync');
});

test('regex: forbidden matches pr-codex slug; implement regex matches implement slug', () => {
  assert.ok(FORBIDDEN_RECEIPT_RE.test('mccp-pr-codex/x.json'));
  assert.ok(FORBIDDEN_RECEIPT_RE.test('.claude/receipts/mccp-pr-codex/x.json'));
  assert.ok(!FORBIDDEN_RECEIPT_RE.test('mccp-implement-codex/x.json'));
  assert.ok(IMPLEMENT_RECEIPT_RE.test('mccp-implement-codex/x.json'));
  assert.ok(!IMPLEMENT_RECEIPT_RE.test('mccp-plan-codex/x.json'));
});

test('normSlugSet: trims, dedupes, sorts, order-independent', () => {
  assert.deepStrictEqual(
    normSlugSet([' b ', 'a', 'b', '', null, 'a']),
    ['a', 'b']);
});

// ── (8) ok ──────────────────────────────────────────────────────────────────

test('ok: result ∧ envelope ∧ anchored store all agree', () => {
  const v = deriveVerdict(baseInput());
  assert.strictEqual(v.verdict, 'ok');
  assert.deepStrictEqual(v.receiptsAdded, [IMPL_SLUG]);
  assert.strictEqual(v.failedReason, null);
  assert.deepStrictEqual(v.invariantViolations, []);
  assert.deepStrictEqual(v.mismatches, []);
  assert.deepStrictEqual(v.unanchored, []);
});

test('ok: receipt order differs between result and envelope (set compare)', () => {
  const slugs = [IMPL_SLUG, 'mccp-implement-codex/y.json'];
  const v = deriveVerdict(baseInput({
    result: okResult({ receiptsAdded: slugs.slice().reverse() }),
    envelope: okEnvelope({ receipts_added: slugs }),
    receiptStore: {
      [IMPL_SLUG]: anchoredReceipt(),
      'mccp-implement-codex/y.json': anchoredReceipt(),
    },
  }));
  assert.strictEqual(v.verdict, 'ok');
});

// ── (1) result-unreadable ─────────────────────────────────────────────────────

test('result-unreadable: null result (agent death)', () => {
  const v = deriveVerdict(baseInput({ result: null }));
  assert.strictEqual(v.verdict, 'result-unreadable');
});

test('result-unreadable: non-object result', () => {
  assert.strictEqual(deriveVerdict(baseInput({ result: 'ok' })).verdict, 'result-unreadable');
  assert.strictEqual(deriveVerdict(baseInput({ result: ['ok'] })).verdict, 'result-unreadable');
});

// ── (6) failed ────────────────────────────────────────────────────────────────

test('failed: reconciled non-ok terminal status (worker validation red)', () => {
  const v = deriveVerdict(baseInput({
    result: okResult({ status: 'failure' }),
    envelope: okEnvelope({ worker_exit_status: 'failure' }),
  }));
  assert.strictEqual(v.verdict, 'failed');
  assert.match(v.failedReason, /status=failure/);
});

// ── (5) invariant-violation (F1) ──────────────────────────────────────────────

test('invariant-violation: mccp-pr-codex leak on BOTH sides', () => {
  const leaked = [IMPL_SLUG, 'mccp-pr-codex/x.json'];
  const v = deriveVerdict(baseInput({
    result: okResult({ receiptsAdded: leaked }),
    envelope: okEnvelope({ receipts_added: leaked }),
    receiptStore: { [IMPL_SLUG]: anchoredReceipt() },
  }));
  assert.strictEqual(v.verdict, 'invariant-violation');
  assert.strictEqual(v.invariantViolations.length, 1);
  assert.strictEqual(v.invariantViolations[0].kind, 'worker-ran-pr-gate');
  assert.strictEqual(v.invariantViolations[0].slug, 'mccp-pr-codex/x.json');
});

test('invariant-violation: forbidden slug present on both sides but nested path form', () => {
  const leaked = ['.claude/receipts/mccp-pr-codex/y.json'];
  const v = deriveVerdict(baseInput({
    result: okResult({ receiptsAdded: leaked }),
    envelope: okEnvelope({ receipts_added: leaked }),
    receiptStore: {},
  }));
  assert.strictEqual(v.verdict, 'invariant-violation');
});

// ── (2)(3)(4) reconcile-mismatch (F2) ─────────────────────────────────────────

test('reconcile-mismatch: envelope still pending (F2 pending=failed inheritance)', () => {
  const v = deriveVerdict(baseInput({
    envelope: okEnvelope({ worker_exit_status: 'pending' }),
  }));
  assert.strictEqual(v.verdict, 'reconcile-mismatch');
  assert.strictEqual(v.mismatches[0].kind, 'envelope-non-terminal');
});

test('reconcile-mismatch: envelope absent (lost dispatch)', () => {
  const v = deriveVerdict(baseInput({ envelope: null }));
  assert.strictEqual(v.verdict, 'reconcile-mismatch');
  assert.match(v.mismatches[0].detail, /absent/);
});

test('reconcile-mismatch: result.status ok but envelope failure (F2 self-report drift)', () => {
  const v = deriveVerdict(baseInput({
    result: okResult({ status: 'ok' }),
    envelope: okEnvelope({ worker_exit_status: 'failure' }),
  }));
  assert.strictEqual(v.verdict, 'reconcile-mismatch');
  assert.strictEqual(v.mismatches[0].kind, 'status-mismatch');
});

test('reconcile-mismatch: receipt slug sets disagree', () => {
  const v = deriveVerdict(baseInput({
    result: okResult({ receiptsAdded: [IMPL_SLUG] }),
    envelope: okEnvelope({ receipts_added: [IMPL_SLUG, 'mccp-implement-codex/extra.json'] }),
  }));
  assert.strictEqual(v.verdict, 'reconcile-mismatch');
  assert.strictEqual(v.mismatches[0].kind, 'receipt-set-mismatch');
});

// ── (7) unanchored (F3) ───────────────────────────────────────────────────────

test('unanchored: marker present=false on the implement receipt', () => {
  const v = deriveVerdict(baseInput({
    receiptStore: { [IMPL_SLUG]: anchoredReceipt({ meta: { controller_context_marker_present: false } }) },
  }));
  assert.strictEqual(v.verdict, 'unanchored');
  assert.match(v.unanchored[0].reason, /marker_present/);
});

test('unanchored: attribution flags differ from expectedAnchor', () => {
  const v = deriveVerdict(baseInput({
    receiptStore: {
      [IMPL_SLUG]: anchoredReceipt({ meta: { worker_dispatch_id: 'someone-elses-id' } }),
    },
  }));
  assert.strictEqual(v.verdict, 'unanchored');
  assert.match(v.unanchored[0].reason, /dispatchId/);
});

test('unanchored: receipt missing from store entirely (cannot verify)', () => {
  const v = deriveVerdict(baseInput({ receiptStore: {} }));
  assert.strictEqual(v.verdict, 'unanchored');
  assert.match(v.unanchored[0].reason, /absent from store/);
});

test('unanchored: no expectedAnchor supplied → cannot verify → fail-closed', () => {
  const v = deriveVerdict(baseInput({ expectedAnchor: null }));
  assert.strictEqual(v.verdict, 'unanchored');
  assert.match(v.unanchored[0].reason, /no expectedAnchor/);
});

test('anchor check ignores non-implement receipts (e.g. no implement slug → ok)', () => {
  // A reconciled dispatch whose only receipt is NOT implement-codex is not
  // anchor-checked (nothing to anchor) and passes to ok.
  const other = 'mccp-plan-codex/x.json';
  const v = deriveVerdict(baseInput({
    result: okResult({ receiptsAdded: [other] }),
    envelope: okEnvelope({ receipts_added: [other] }),
    receiptStore: {},
  }));
  assert.strictEqual(v.verdict, 'ok');
});

// ── ordering: invariant precedes reconcile (F1 un-maskable) ───────────────────

test('ordering: an invariant leak wins over a co-occurring status mismatch (F1 first)', () => {
  // result says ok, envelope says failure (a reconcile-mismatch condition) AND a
  // forbidden slug is present on both sides. The F1 invariant is the most severe
  // (a PR/commit may have leaked) so it is surfaced with its own label — never
  // relabeled as a benign reconcile-mismatch.
  const leaked = [IMPL_SLUG, 'mccp-pr-codex/x.json'];
  const v = deriveVerdict(baseInput({
    result: okResult({ status: 'ok', receiptsAdded: leaked }),
    envelope: okEnvelope({ worker_exit_status: 'failure', receipts_added: leaked }),
  }));
  assert.strictEqual(v.verdict, 'invariant-violation');
});

// ── belt-and-suspenders: F1 fires from the RETURN VALUE alone (plan smoke) ─────

test('invariant-violation: bare result with a leaked pr-codex slug (no envelope)', () => {
  // The plan Validation smoke: deriveVerdict({status:'ok',receiptsAdded:[...]})
  // must yield invariant-violation from a return value alone — no envelope, no
  // store. The bare-result normalization + invariant-first ordering deliver it.
  const v = deriveVerdict({ status: 'ok', receiptsAdded: ['mccp-pr-codex/foo.json'] });
  assert.strictEqual(v.verdict, 'invariant-violation');
  assert.strictEqual(v.invariantViolations[0].slug, 'mccp-pr-codex/foo.json');
});

test('bare result WITHOUT a leak falls through to envelope reconciliation (not ok)', () => {
  // A bare clean result has no envelope → reconcile-mismatch (envelope absent),
  // proving the normalization does not short-circuit to a false ok.
  const v = deriveVerdict({ status: 'ok', receiptsAdded: [IMPL_SLUG] });
  assert.strictEqual(v.verdict, 'reconcile-mismatch');
});
