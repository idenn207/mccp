'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  upsertSection,
  splitSections,
  joinSections,
  SECTION_HEADINGS,
} = require('../../pr-phase-helpers/body-builder');

const builderPath = require.resolve('../../pr-phase-helpers/body-builder.js');
const { spawnSync } = require('child_process');
const NODE = process.execPath;

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-body-bld-'));
}

test('upsertSection inserts new heading when missing (action=created)', () => {
  const out = upsertSection('# Title\n\nIntro line.\n', '## Codex Adversarial Review',
    '- Round 1 converged.');
  assert.strictEqual(out.action, 'created');
  assert.match(out.body, /^# Title/);
  assert.match(out.body, /## Codex Adversarial Review/);
  assert.match(out.body, /- Round 1 converged\./);
});

test('upsertSection replaces existing heading content (action=replaced)', () => {
  const existing = '# T\n\n## Codex Adversarial Review\n\nold round\n';
  const out = upsertSection(existing, '## Codex Adversarial Review', 'NEW CONTENT');
  assert.strictEqual(out.action, 'replaced');
  assert.match(out.body, /NEW CONTENT/);
  assert.ok(!/old round/.test(out.body), 'old content removed');
});

test('upsertSection preserves order of unrelated sections', () => {
  const existing = '## A\n\nalpha\n\n## B\n\nbeta\n\n## Codex Adversarial Review\n\nold\n';
  const out = upsertSection(existing, '## Codex Adversarial Review', 'NEW');
  const idxA = out.body.indexOf('## A');
  const idxB = out.body.indexOf('## B');
  const idxC = out.body.indexOf('## Codex Adversarial Review');
  assert.ok(idxA < idxB && idxB < idxC, 'order preserved');
  assert.match(out.body, /NEW/);
});

test('SECTION_HEADINGS keys map to exact heading strings', () => {
  assert.strictEqual(SECTION_HEADINGS.codex, '## Codex Adversarial Review');
  assert.strictEqual(SECTION_HEADINGS.security, '## Security Reviewer Override');
  assert.strictEqual(SECTION_HEADINGS.impeccable, '## Impeccable Override');
  assert.strictEqual(SECTION_HEADINGS.design, '## Design Review');
});

test('CLI: creates body-file when absent', () => {
  const dir = tmp();
  const bodyFile = path.join(dir, 'body.md');
  const contentFile = path.join(dir, 'content.md');
  fs.writeFileSync(contentFile, '- bullet one\n- bullet two', 'utf8');
  const r = spawnSync(NODE, [builderPath,
    '--section', 'codex',
    '--body-file', bodyFile,
    '--content-file', contentFile,
  ], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.action, 'created');
  assert.match(fs.readFileSync(bodyFile, 'utf8'), /## Codex Adversarial Review/);
});

test('CLI: replaces existing section on second call', () => {
  const dir = tmp();
  const bodyFile = path.join(dir, 'body.md');
  fs.writeFileSync(bodyFile, '## Codex Adversarial Review\n\nfirst-round\n', 'utf8');
  const contentFile = path.join(dir, 'content.md');
  fs.writeFileSync(contentFile, 'second-round', 'utf8');
  const r = spawnSync(NODE, [builderPath,
    '--section', 'codex',
    '--body-file', bodyFile,
    '--content-file', contentFile,
  ], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.action, 'replaced');
  const written = fs.readFileSync(bodyFile, 'utf8');
  assert.match(written, /second-round/);
  assert.ok(!written.includes('first-round'), 'old content removed');
});

test('CLI: strips a leading duplicate heading from content', () => {
  const dir = tmp();
  const bodyFile = path.join(dir, 'body.md');
  const contentFile = path.join(dir, 'c.md');
  fs.writeFileSync(contentFile, '## Codex Adversarial Review\n\n- actual content\n', 'utf8');
  const r = spawnSync(NODE, [builderPath,
    '--section', 'codex',
    '--body-file', bodyFile,
    '--content-file', contentFile,
  ], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0);
  const written = fs.readFileSync(bodyFile, 'utf8');
  // Should appear exactly once
  const matches = written.match(/## Codex Adversarial Review/g);
  assert.strictEqual(matches.length, 1, 'heading dedup');
});

test('CLI: unknown --section value fails', () => {
  const r = spawnSync(NODE, [builderPath,
    '--section', 'frobnicate',
    '--body-file', '/tmp/x',
    '--content-file', '/tmp/y',
  ], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /unknown --section/);
});

test('CLI: missing --body-file or --content-file fails', () => {
  const r = spawnSync(NODE, [builderPath, '--section', 'codex'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /--body-file/);
});

test('CLI: written file has mode 0o600 on POSIX', { skip: process.platform === 'win32' }, () => {
  const dir = tmp();
  const bodyFile = path.join(dir, 'body.md');
  const contentFile = path.join(dir, 'c.md');
  fs.writeFileSync(contentFile, 'x', 'utf8');
  spawnSync(NODE, [builderPath,
    '--section', 'codex',
    '--body-file', bodyFile,
    '--content-file', contentFile,
  ], { encoding: 'utf8' });
  const st = fs.statSync(bodyFile);
  assert.strictEqual(st.mode & 0o777, 0o600, 'mode must be owner-only');
});

test('joinSections round-trips through splitSections', () => {
  const body = '# H1\n\n## A\n\nalpha\n\n## B\n\nbeta line\n';
  const round = joinSections(splitSections(body));
  // Allow trailing newline normalization
  assert.strictEqual(round.replace(/\n+$/, ''), body.replace(/\n+$/, ''));
});
