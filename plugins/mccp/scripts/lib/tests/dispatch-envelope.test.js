'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const envelope = require('../dispatch-envelope');

function makeSandbox() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-envelope-test-'));
}

function rimraf(target) {
  try { fs.rmSync(target, { recursive: true, force: true }); } catch (_) {}
}

function validPlaceholder(overrides) {
  return Object.assign({
    schema_version: 'v1',
    dispatch_id: '019eced3-cce9-7be3-81a1-c8a5c30a27fe',
    worker_subagent_type: 'mccp:code-reviewer',
    worker_started_at: '2026-06-16T05:00:00Z',
    worker_ended_at: null,
    worker_exit_status: 'pending',
    receipts_added: [],
    findings: [],
    next_action: null,
    controller_session_id: '019ecedf-1234-5678-9abc-def012345678',
    parent_cwd: 'C:/_project/my/my-claude-code-plugin',
  }, overrides || {});
}

function validTerminal(status, overrides) {
  return Object.assign(validPlaceholder({
    worker_ended_at: '2026-06-16T05:01:30.123Z',
    worker_exit_status: status,
    receipts_added: ['mccp-code-reviewer/v1-2-0-orchestrator-controller-m1.json'],
  }), overrides || {});
}

test('schema constants exported', () => {
  assert.strictEqual(envelope.SCHEMA_VERSION, 'v1');
  assert.deepStrictEqual(envelope.WORKER_EXIT_STATUSES,
    ['pending', 'ok', 'failure', 'timeout', 'crashed']);
  assert.deepStrictEqual(envelope.TERMINAL_STATUSES,
    ['ok', 'failure', 'timeout', 'crashed']);
  assert.ok(envelope.UUID_RE instanceof RegExp);
  assert.ok(envelope.ISO8601_RE instanceof RegExp);
  assert.strictEqual(envelope.JSON_SCHEMA.$schema,
    'http://json-schema.org/draft-07/schema#');
});

test('JSON_SCHEMA is frozen (immutable contract)', () => {
  assert.strictEqual(Object.isFrozen(envelope.JSON_SCHEMA), true);
});

test('valid placeholder (pending) passes validate', () => {
  const result = envelope.validate(validPlaceholder());
  assert.strictEqual(result.ok, true, result.errors.join('; '));
  assert.deepStrictEqual(result.errors, []);
});

test('valid terminal (ok) passes validate', () => {
  const result = envelope.validate(validTerminal('ok'));
  assert.strictEqual(result.ok, true, result.errors.join('; '));
});

test('valid terminal (failure) passes validate', () => {
  const result = envelope.validate(validTerminal('failure'));
  assert.strictEqual(result.ok, true, result.errors.join('; '));
});

test('valid terminal (timeout) passes validate', () => {
  const result = envelope.validate(validTerminal('timeout'));
  assert.strictEqual(result.ok, true, result.errors.join('; '));
});

test('valid terminal (crashed) passes validate', () => {
  const result = envelope.validate(validTerminal('crashed'));
  assert.strictEqual(result.ok, true, result.errors.join('; '));
});

test('Codex F2 invariant: pending with non-null worker_ended_at rejects', () => {
  const bad = validPlaceholder({ worker_ended_at: '2026-06-16T05:01:00Z' });
  const result = envelope.validate(bad);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(function (e) {
    return e.indexOf('worker_ended_at must be null when worker_exit_status="pending"') !== -1;
  }), 'expected pending+non-null error, got: ' + result.errors.join('; '));
});

test('Codex F2 invariant: terminal status with null worker_ended_at rejects', () => {
  const bad = validTerminal('ok', { worker_ended_at: null });
  const result = envelope.validate(bad);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(function (e) {
    return e.indexOf('worker_ended_at must be ISO8601 string when worker_exit_status is terminal') !== -1;
  }), 'expected terminal+null error, got: ' + result.errors.join('; '));
});

test('Codex F2 invariant: pending->terminal transition validates both states', () => {
  const placeholder = validPlaceholder();
  assert.strictEqual(envelope.validate(placeholder).ok, true,
    'placeholder must validate green');
  const terminal = Object.assign({}, placeholder, {
    worker_ended_at: '2026-06-16T05:01:30Z',
    worker_exit_status: 'ok',
    receipts_added: ['mccp-code-reviewer/abc.json'],
  });
  assert.strictEqual(envelope.validate(terminal).ok, true,
    'terminal after transition must validate green');
});

test('invalid enum value for worker_exit_status rejects', () => {
  const bad = validPlaceholder({ worker_exit_status: 'running' });
  const result = envelope.validate(bad);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(function (e) {
    return e.indexOf('worker_exit_status must be one of') !== -1;
  }));
});

test('malformed dispatch_id UUID rejects', () => {
  const bad = validPlaceholder({ dispatch_id: 'not-a-uuid' });
  const result = envelope.validate(bad);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(function (e) {
    return e.indexOf('dispatch_id must be UUID') !== -1;
  }));
});

test('malformed controller_session_id UUID rejects', () => {
  const bad = validPlaceholder({ controller_session_id: 'short' });
  const result = envelope.validate(bad);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(function (e) {
    return e.indexOf('controller_session_id must be UUID') !== -1;
  }));
});

test('malformed worker_started_at ISO8601 rejects', () => {
  const bad = validPlaceholder({ worker_started_at: '2026-06-16 05:00:00' });
  const result = envelope.validate(bad);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(function (e) {
    return e.indexOf('worker_started_at must be ISO8601') !== -1;
  }));
});

test('schema_version mismatch rejects', () => {
  const bad = validPlaceholder({ schema_version: 'v2' });
  const result = envelope.validate(bad);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(function (e) {
    return e.indexOf('schema_version must be "v1"') !== -1;
  }));
});

test('missing worker_subagent_type rejects', () => {
  const bad = validPlaceholder();
  delete bad.worker_subagent_type;
  const result = envelope.validate(bad);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(function (e) {
    return e.indexOf('worker_subagent_type') !== -1;
  }));
});

test('empty string worker_subagent_type rejects', () => {
  const bad = validPlaceholder({ worker_subagent_type: '' });
  const result = envelope.validate(bad);
  assert.strictEqual(result.ok, false);
});

test('non-array receipts_added rejects', () => {
  const bad = validPlaceholder({ receipts_added: 'string-not-array' });
  const result = envelope.validate(bad);
  assert.strictEqual(result.ok, false);
});

test('empty receipts_added is OK (controller may have spawned worker that wrote nothing)', () => {
  const result = envelope.validate(validPlaceholder({ receipts_added: [] }));
  assert.strictEqual(result.ok, true);
});

test('empty findings is OK', () => {
  const result = envelope.validate(validPlaceholder({ findings: [] }));
  assert.strictEqual(result.ok, true);
});

test('non-object findings entry rejects', () => {
  const bad = validPlaceholder({ findings: ['string-not-object'] });
  const result = envelope.validate(bad);
  assert.strictEqual(result.ok, false);
});

test('non-null non-string next_action rejects', () => {
  const bad = validPlaceholder({ next_action: 42 });
  const result = envelope.validate(bad);
  assert.strictEqual(result.ok, false);
});

test('null next_action is OK', () => {
  const result = envelope.validate(validPlaceholder({ next_action: null }));
  assert.strictEqual(result.ok, true);
});

test('non-object input rejects loudly', () => {
  assert.strictEqual(envelope.validate(null).ok, false);
  assert.strictEqual(envelope.validate('string').ok, false);
  assert.strictEqual(envelope.validate(42).ok, false);
  assert.strictEqual(envelope.validate([]).ok, false);
});

test('JSON_SCHEMA required[] matches validate() coverage', () => {
  const required = envelope.JSON_SCHEMA.required;
  const expected = [
    'schema_version',
    'dispatch_id',
    'worker_subagent_type',
    'worker_started_at',
    'worker_exit_status',
    'receipts_added',
    'findings',
    'controller_session_id',
    'parent_cwd',
  ];
  expected.forEach(function (field) {
    assert.ok(required.indexOf(field) !== -1,
      'JSON_SCHEMA.required missing field: ' + field);
  });
});

// ── Task 2 I/O helpers (read/write/markStatus) ────────────────────────────

test('read returns ENOENT loudly when envelope missing', () => {
  const sb = makeSandbox();
  try {
    const result = envelope.read(path.join(sb, 'missing.envelope.json'));
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.indexOf('envelope not found') !== -1, result.error);
  } finally { rimraf(sb); }
});

test('read returns parse error on malformed JSON', () => {
  const sb = makeSandbox();
  try {
    const p = path.join(sb, 'bad.envelope.json');
    fs.writeFileSync(p, '{ not valid json', 'utf8');
    const result = envelope.read(p);
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.indexOf('envelope parse failed') !== -1, result.error);
  } finally { rimraf(sb); }
});

test('read returns schema error when envelope invalid', () => {
  const sb = makeSandbox();
  try {
    const p = path.join(sb, 'invalid.envelope.json');
    fs.writeFileSync(p, JSON.stringify({ schema_version: 'v2' }), 'utf8');
    const result = envelope.read(p);
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.indexOf('envelope invalid') !== -1, result.error);
  } finally { rimraf(sb); }
});

test('write + read round-trip preserves valid envelope', () => {
  const sb = makeSandbox();
  try {
    const p = path.join(sb, 'rt.envelope.json');
    const original = validPlaceholder();
    const wResult = envelope.write(p, original);
    assert.strictEqual(wResult.ok, true, wResult.error);
    assert.strictEqual(fs.existsSync(p), true);
    assert.strictEqual(fs.existsSync(p + '.tmp'), false,
      'tmp file must not survive successful rename');
    const rResult = envelope.read(p);
    assert.strictEqual(rResult.ok, true, rResult.error);
    assert.deepStrictEqual(rResult.envelope, original);
  } finally { rimraf(sb); }
});

test('write auto-creates parent directory', () => {
  const sb = makeSandbox();
  try {
    const p = path.join(sb, 'nested', 'deeper', 'auto.envelope.json');
    const wResult = envelope.write(p, validPlaceholder());
    assert.strictEqual(wResult.ok, true, wResult.error);
    assert.strictEqual(fs.existsSync(p), true);
  } finally { rimraf(sb); }
});

test('write rejects invalid envelope before touching disk', () => {
  const sb = makeSandbox();
  try {
    const p = path.join(sb, 'reject.envelope.json');
    const wResult = envelope.write(p, { schema_version: 'v2' });
    assert.strictEqual(wResult.ok, false);
    assert.ok(wResult.error.indexOf('envelope invalid') !== -1, wResult.error);
    assert.strictEqual(fs.existsSync(p), false,
      'file must not be created when validation fails');
    assert.strictEqual(fs.existsSync(p + '.tmp'), false);
  } finally { rimraf(sb); }
});

test('markStatus transitions pending → ok and sets worker_ended_at', () => {
  const sb = makeSandbox();
  try {
    const p = path.join(sb, 'transition.envelope.json');
    envelope.write(p, validPlaceholder());
    const result = envelope.markStatus(p, 'ok', {
      receiptsAdded: ['mccp-code-reviewer/abc.json'],
    });
    assert.strictEqual(result.ok, true, result.error);
    const after = envelope.read(p);
    assert.strictEqual(after.ok, true);
    assert.strictEqual(after.envelope.worker_exit_status, 'ok');
    assert.ok(envelope.ISO8601_RE.test(after.envelope.worker_ended_at),
      'worker_ended_at must be ISO8601 after terminal mark');
    assert.deepStrictEqual(after.envelope.receipts_added,
      ['mccp-code-reviewer/abc.json']);
  } finally { rimraf(sb); }
});

test('markStatus honors explicit opts.endedAt', () => {
  const sb = makeSandbox();
  try {
    const p = path.join(sb, 'explicit-ended.envelope.json');
    envelope.write(p, validPlaceholder());
    const explicit = '2026-06-17T01:23:45.678Z';
    const result = envelope.markStatus(p, 'failure', { endedAt: explicit });
    assert.strictEqual(result.ok, true, result.error);
    const after = envelope.read(p);
    assert.strictEqual(after.envelope.worker_ended_at, explicit);
    assert.strictEqual(after.envelope.worker_exit_status, 'failure');
  } finally { rimraf(sb); }
});

test('markStatus pending with explicit endedAt is ignored (kept null)', () => {
  const sb = makeSandbox();
  try {
    const p = path.join(sb, 'pending-keep-null.envelope.json');
    envelope.write(p, validTerminal('ok'));
    const result = envelope.markStatus(p, 'pending', {
      endedAt: '2026-06-17T01:23:45Z',
    });
    assert.strictEqual(result.ok, true, result.error);
    const after = envelope.read(p);
    assert.strictEqual(after.envelope.worker_ended_at, null);
    assert.strictEqual(after.envelope.worker_exit_status, 'pending');
  } finally { rimraf(sb); }
});

test('markStatus rejects unknown status loudly', () => {
  const sb = makeSandbox();
  try {
    const p = path.join(sb, 'bad-status.envelope.json');
    envelope.write(p, validPlaceholder());
    const result = envelope.markStatus(p, 'zombie');
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.indexOf('status must be one of') !== -1, result.error);
  } finally { rimraf(sb); }
});

test('markStatus fails when envelope is missing', () => {
  const sb = makeSandbox();
  try {
    const result = envelope.markStatus(path.join(sb, 'absent.envelope.json'), 'ok');
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.indexOf('pre-read failed') !== -1, result.error);
  } finally { rimraf(sb); }
});

test('markStatus applies findings + nextAction overrides', () => {
  const sb = makeSandbox();
  try {
    const p = path.join(sb, 'overrides.envelope.json');
    envelope.write(p, validPlaceholder());
    const findings = [{ severity: 'HIGH', message: 'race observed' }];
    const result = envelope.markStatus(p, 'crashed', {
      findings: findings,
      nextAction: 'reclaim envelope manually',
    });
    assert.strictEqual(result.ok, true, result.error);
    const after = envelope.read(p);
    assert.deepStrictEqual(after.envelope.findings, findings);
    assert.strictEqual(after.envelope.next_action, 'reclaim envelope manually');
  } finally { rimraf(sb); }
});
