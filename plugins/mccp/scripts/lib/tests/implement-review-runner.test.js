'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const target = require('../review-target');
const runner = require('../implement-review-runner');
const store = require('../../receipt/store');
function fixture(fn) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'implement-owner-')); const root = path.join(temp, 'repo'); fs.mkdirSync(root);
  try {
    target.git(root, ['init', '-q']); target.git(root, ['config', 'user.name', 'Test']); target.git(root, ['config', 'user.email', 'test@example.invalid']);
    fs.writeFileSync(path.join(root, 'plan.md'), '# Plan\n\n## Tasks\nImplement a fixture.\n');
    fs.writeFileSync(path.join(root, '.gitignore'), '.claude/state/msw-events/\n');
    target.git(root, ['add', '.']); target.git(root, ['commit', '-qm', 'fixture']);
    const bin = path.join(temp, 'claude');
    const success = [ { type: 'assistant', message: { model: 'claude-opus-5' } },
      { type: 'result', subtype: 'success', is_error: false, structured_output: { verdict: 'approve', summary: 'ok', findings: [] } } ].map(JSON.stringify).join('\n');
    fs.writeFileSync(bin, '#!' + process.execPath + '\nconst fs=require("fs"); const input=fs.readFileSync(0,"utf8"); if(!input.includes("Committed tree"))process.exit(3);process.stdout.write(' + JSON.stringify(success) + ');', { mode: 0o700 });
    const opts = { cwd: root, bin, plan: 'plan.md', decision: 'fixture', env: { ...process.env, MCCP_HARNESS: 'codex', MCCP_BRIEFING: 'off' }, budget: { allowed: true, canRecord: false } };
    fn(root, bin, opts);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
test('actual executable reaches bound writer and read-back in a single owner', () => fixture((root, bin, opts) => {
  const r = runner.run(opts); assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.reviewerFamily, 'claude');
  const receipt = store.readReceipt(root, 'mccp-implement-codex', 'fixture');
  assert.equal(receipt.resolution.reviewer_verdict, 'converged'); assert.equal(receipt.resolution.codex_verdict, undefined);
  assert.equal(receipt.resolution.reviewer_execution.reviewed_input.target_commit, target.git(root, ['rev-parse', 'HEAD']).trim());
}));
test('failed executable and dirty target issue no approval receipt', () => fixture((root, bin, opts) => {
  fs.writeFileSync(bin, '#!' + process.execPath + '\nprocess.exit(1);');
  assert.equal(runner.run(opts).ok, false); assert.equal(store.readReceipt(root, 'mccp-implement-codex', 'fixture'), null);
  fs.writeFileSync(path.join(root, 'new.js'), 'unreviewed');
  assert.match(runner.run(opts).reason, /dirty/); assert.equal(store.readReceipt(root, 'mccp-implement-codex', 'fixture'), null);
}));
test('result-file and override flags cannot mint an execution proof', () => {
  assert.equal(runner.cli(['--result-file', 'approve.json']), 2);
  assert.equal(runner.cli(['--plan', 'plan.md', '--decision', 'fixture', '--allow-dirty', 'yes']), 2);
});
test('a live owner lock prevents another review from writing', () => fixture((root, bin, opts) => {
  const dir = path.join(root, '.git', 'mccp', 'implement-review'); fs.mkdirSync(dir, { recursive: true });
  const lock = path.join(dir, 'fixture.lock'); fs.writeFileSync(lock, 'existing owner');
  assert.match(runner.run(opts).reason, /owner already active/);
  assert.equal(fs.readFileSync(lock, 'utf8'), 'existing owner');
  assert.equal(store.readReceipt(root, 'mccp-implement-codex', 'fixture'), null);
}));
