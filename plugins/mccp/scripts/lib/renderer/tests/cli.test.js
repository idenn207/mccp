'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '..', '..', '..', 'derive', 'cli.js');

function mkFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-render-cli-'));
  const claude = path.join(root, '.claude');
  fs.mkdirSync(path.join(claude, 'plans'), { recursive: true });
  fs.mkdirSync(path.join(claude, 'receipts'), { recursive: true });
  fs.mkdirSync(path.join(claude, 'state'), { recursive: true });
  fs.mkdirSync(path.join(claude, 'prds'), { recursive: true });
  fs.writeFileSync(path.join(claude, 'prds', 't.prd.md'),
    '# T\n\n## Delivery Milestones\n\n| # | M | O | Status | Plan |\n|---|---|---|---|---|\n| 0 | x | y | in-progress | [t.plan.md](../plans/t.plan.md) |\n');
  fs.writeFileSync(path.join(claude, 'plans', 't.plan.md'),
    '# T\n\n**Source PRD**: [t.prd.md](../prds/t.prd.md)\n\n## Summary\n\nx.\n\n## Risks\n\n| Risk | Likelihood | Impact | Mitigation |\n|---|---|---|---|\n| r1 | High | High | m1 |\n');
  return root;
}

function rmFixture(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (err) { /* ignore */ }
}

function runCli(cwd, args) {
  return spawnSync('node', [CLI].concat(args), { cwd, encoding: 'utf8' });
}

test('render with no flags writes both files', () => {
  const root = mkFixture();
  try {
    const r = runCli(root, ['render']);
    assert.equal(r.status, 0, 'exit 0: ' + r.stderr);
    assert.ok(fs.existsSync(path.join(root, '.claude', 'cache', 'STATUS.md')));
    assert.ok(fs.existsSync(path.join(root, '.claude', 'cache', 'status.html')));
  } finally { rmFixture(root); }
});

test('render --md writes only STATUS.md', () => {
  const root = mkFixture();
  try {
    const r = runCli(root, ['render', '--md']);
    assert.equal(r.status, 0);
    assert.ok(fs.existsSync(path.join(root, '.claude', 'cache', 'STATUS.md')));
    assert.ok(!fs.existsSync(path.join(root, '.claude', 'cache', 'status.html')));
  } finally { rmFixture(root); }
});

test('render --html writes only status.html', () => {
  const root = mkFixture();
  try {
    const r = runCli(root, ['render', '--html']);
    assert.equal(r.status, 0);
    assert.ok(!fs.existsSync(path.join(root, '.claude', 'cache', 'STATUS.md')));
    assert.ok(fs.existsSync(path.join(root, '.claude', 'cache', 'status.html')));
  } finally { rmFixture(root); }
});

test('render --out <tmp> honors custom output dir', () => {
  const root = mkFixture();
  const outDir = path.join(root, 'custom-out');
  try {
    const r = runCli(root, ['render', '--out', outDir]);
    assert.equal(r.status, 0);
    assert.ok(fs.existsSync(path.join(outDir, 'STATUS.md')));
    assert.ok(fs.existsSync(path.join(outDir, 'status.html')));
  } finally { rmFixture(root); }
});

test('render --raw emits stderr warning + secret ribbon class', () => {
  const root = mkFixture();
  try {
    const r = runCli(root, ['render', '--raw']);
    assert.equal(r.status, 0);
    assert.match(r.stderr, /--raw/);
    const html = fs.readFileSync(path.join(root, '.claude', 'cache', 'status.html'), 'utf8');
    assert.match(html, /s-secret/);
  } finally { rmFixture(root); }
});
