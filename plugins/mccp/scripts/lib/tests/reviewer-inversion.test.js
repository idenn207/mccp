'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const reviewer = require('../reviewer-invoke');
const claude = require('../claude-review-invoke');
const fs = require('fs');
const os = require('os');
const path = require('path');

function response(patch) {
  const events = [
    { type: 'assistant', message: { model: 'claude-opus-5', content: [] } },
    { type: 'result', subtype: 'success', is_error: false,
      structured_output: { verdict: 'approve', summary: 'ok', findings: [] } },
  ];
  return Object.assign({ status: 0, stdout: events.map(e => JSON.stringify(e)).join('\n'), stderr: '' }, patch);
}

test('host routing requires a positive designation', () => {
  assert.equal(reviewer.route({ MCCP_HARNESS: 'codex' }).reviewer, 'claude');
  assert.equal(reviewer.route({ CLAUDE_PLUGIN_ROOT: '/plugin' }).reviewer, 'codex');
  assert.equal(reviewer.route({ MCCP_HARNESS: 'codex', CLAUDE_PLUGIN_ROOT: '/plugin' }).reviewer, 'claude');
  assert.equal(reviewer.route({ CODEX_HOME: '/home' }).blocking, true);
  assert.equal(reviewer.route({ MCCP_HARNESS: 'bad' }).blocking, true);
});
test('Codex-host plan mode forces the opposite-family runner, not a Codex panel', () => {
  const { spawnSync } = require('child_process');
  const cli = path.resolve(__dirname, '../plan-review/cli.js');
  const r = spawnSync(process.execPath, [cli, 'mode'], { encoding: 'utf8', env: { ...process.env, MCCP_HARNESS: 'codex', MCCP_PLAN_REVIEW: 'multi-agent' } });
  assert.equal(r.status, 0, r.stderr);
  const mode = JSON.parse(r.stdout); assert.equal(mode.mode, 'codex'); assert.equal(mode.reviewer_family, 'claude');
  assert.equal(mode.fires.l2, false);
});

test('structured Claude output requires an actual Claude assistant model', () => {
  assert.equal(claude.normalize(response()).ok, true);
  for (const r of [response({ status: 1 }), response({ stdout: '' }), response({ stdout: 'approve' }),
    response({ error: { code: 'ETIMEDOUT' } }), response({ stdout: response().stdout.replace('claude-opus-5', 'gpt-5') }),
    response({ stdout: response().stdout.replace('"approve"', '"unknown"') }),
    response({ stdout: response().stdout.replace('"is_error":false', '"is_error":true') })]) {
    assert.equal(claude.normalize(r).blocking, true);
  }
});

test('partial or unknown finding vocabulary and intent IDs fail closed', () => {
  const events = response().stdout.split('\n').map(JSON.parse);
  events[1].structured_output.findings = [{ id: 'F1', severity: 'urgent', title: 'x', body: 'x', intent_ids: [] }];
  assert.equal(claude.normalize(response({ stdout: events.map(JSON.stringify).join('\n') })).blocking, true);
  events[1].structured_output.findings[0].severity = 'high';
  events[1].structured_output.findings[0].intent_ids = ['UI99'];
  assert.equal(claude.normalize(response({ stdout: events.map(JSON.stringify).join('\n') }), { intentIds: ['UI1'] }).blocking, true);
});

test('Claude failures never honor Codex advisory or disabled policies', () => {
  const out = reviewer.invokeAdversarialReview('x', {
    env: { MCCP_HARNESS: 'codex', MCCP_CODEX_DISABLED: '1', MCCP_ALLOW_CODEX_UNAVAILABLE: '1' },
    spawn: () => response({ status: 1 }), budget: { allowed: true, canRecord: false },
  });
  assert.equal(out.blocking, true);
  assert.equal(out.advisory, false);
});

test('exhausted budget never spawns or reports an approving result', () => {
  const out = claude.invokeAdversarialReview('x', { budget: { allowed: false }, spawn: () => { throw new Error('must not spawn'); } });
  assert.equal(out.classification, 'round-cap-reached');
  assert.equal(out.blocking, true);
});

test('real child process preserves argv/stdin and bounds errors, timeout and output', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-reviewer-test-'));
  const bin = path.join(dir, 'reviewer');
  try {
    fs.writeFileSync(bin, '#!' + process.execPath + '\n' +
      'const fs=require("fs"); fs.readFileSync(0,"utf8"); process.stdout.write(' + JSON.stringify(response().stdout) + ');', { mode: 0o700 });
    const options = { bin, cwd: dir, budget: { allowed: true, canRecord: false } };
    assert.equal(claude.invokeAdversarialReview('literal $(touch must-not-exist)', options).ok, true);
    assert.equal(fs.existsSync(path.join(dir, 'must-not-exist')), false);
    fs.writeFileSync(bin, '#!' + process.execPath + '\nprocess.stderr.write("secret-error"); process.exit(1);');
    const failed = claude.invokeAdversarialReview('x', options);
    assert.equal(failed.blocking, true);
    assert.equal(JSON.stringify(failed).includes('secret-error'), false);
    fs.writeFileSync(bin, '#!' + process.execPath + '\nsetInterval(()=>{},1000);');
    assert.equal(claude.invokeAdversarialReview('x', { ...options, timeoutMs: 30 }).classification, 'timeout');
    fs.writeFileSync(bin, '#!' + process.execPath + '\nprocess.stdout.write("x".repeat(2*1024*1024));');
    assert.equal(claude.invokeAdversarialReview('x', options).blocking, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('CLI rejects unknown flags and missing input before invoking a reviewer', () => {
  assert.equal(reviewer.runCli([]), 2);
  assert.equal(reviewer.runCli(['adversarial-review', '--surprise']), 2);
  assert.equal(reviewer.runCli(['adversarial-review', '--focus']), 2);
  assert.equal(reviewer.runCli(['adversarial-review', '--timeout-ms', '-1']), 2);
  assert.equal(reviewer.runCli(['adversarial-review', '--intent-reference-file', '/missing-mccp-ref']), 2);
});

test('gate calls require review target text and pass it to the reviewer', () => {
  let input = '';
  const options = { budget: { allowed: true, canRecord: false }, reviewContext: {},
    spawn: (bin, args, opts) => { input = opts.input; return response(); } };
  assert.equal(claude.invokeAdversarialReview('', options).classification, 'missing-review-target');
  assert.equal(input, '');
  options.reviewContext.reviewText = 'EXACT_PLAN_FIXTURE';
  assert.equal(claude.invokeAdversarialReview('', options).ok, true);
  assert.ok(input.includes('EXACT_PLAN_FIXTURE'));
});
