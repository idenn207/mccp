'use strict';

// closure-accounting M4 Task 7 — the wiring of `.github/workflows/closure-report.yml`.
//
// The PRD's metric 5 is "something calls the instrument periodically", and the
// only way that claim goes false is silently: a trigger deleted, the CLI path
// renamed, `continue-on-error` added by someone tidying a red build. So the yml
// is read as TEXT and its structure asserted, the same shape
// `scripts/tests/wiring-cut.test.js` uses.
//
// What this file does NOT claim: that GitHub will schedule the cron (it disables
// one on an idle repository), or that the job passed. (w6) is the part that
// actually runs the instrument.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WORKFLOW_REL = '.github/workflows/closure-report.yml';
const CLI_REL = 'plugins/mccp/scripts/lib/closure/cli.js';

const raw = fs.readFileSync(path.join(REPO_ROOT, WORKFLOW_REL), 'utf8');

// Structural assertions read the yml with COMMENT LINES REMOVED. Scanning the
// whole file conflates a setting with prose about it: the header here explains
// why there is no `continue-on-error`, and a naive scan called that explanation a
// violation. A comment is not configuration.
const yml = raw.split(/\r?\n/)
  .filter(function (l) { return !/^\s*#/.test(l); })
  .join('\n');

test('(w1) all four triggers are present', () => {
  // push:main and workflow_dispatch are what keep the job reachable when the
  // cron is auto-disabled; the pull_request filter is what lets the introducing
  // PR exercise the path before merge.
  assert.match(yml, /^on:$/m);
  assert.match(yml, /^\s+push:$/m);
  assert.match(yml, /branches: \[main\]/);
  assert.match(yml, /^\s+schedule:$/m);
  assert.match(yml, /cron: '[^']+'/);
  assert.match(yml, /^\s+workflow_dispatch:$/m);
  assert.match(yml, /^\s+pull_request:$/m);
  assert.match(yml, new RegExp('- \'' + WORKFLOW_REL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\''),
    'the filter must include the workflow itself, or the introducing PR never runs it');
});

test('(w2) the CLI is invoked as its own command, not inside a redirect group', () => {
  assert.ok(yml.includes(CLI_REL + ' report'), 'the report command is wired');
  assert.ok(yml.includes(CLI_REL + ' report --json'), 'and the json form too');

  // The trap: a `{ ...; node ...; ... } >> "$GITHUB_STEP_SUMMARY"` group takes
  // its exit status from the LAST command in the group, so a crashed CLI reports
  // a green job. Every line that runs the CLI must therefore be outside any such
  // group — checked by asserting no brace-group line also carries the CLI.
  const lines = yml.split(/\r?\n/);
  for (const line of lines) {
    if (line.includes(CLI_REL) && /[{}]/.test(line)) {
      assert.fail('the CLI must not be invoked inside a brace group: ' + line.trim());
    }
    if (line.includes(CLI_REL)) {
      assert.ok(!line.includes('GITHUB_STEP_SUMMARY'),
        'the CLI must redirect to a file first: ' + line.trim());
    }
  }
});

test('(w3) there is no continue-on-error', () => {
  // Red here means the instrument could not run. Suppressing that returns this
  // job to the class of things that report nothing while nobody looks.
  assert.ok(!/continue-on-error/.test(yml));
});

test('(w4) every action is pinned to a 40-hex sha', () => {
  const uses = yml.split(/\r?\n/)
    .map(function (l) { return l.match(/^\s*-?\s*uses:\s*(\S+)/); })
    .filter(Boolean)
    .map(function (m) { return m[1]; });
  assert.ok(uses.length >= 2, 'checkout and setup-node at least; found ' + uses.length);

  const PINNED = /^[^@]+@[0-9a-f]{40}$/;
  for (const u of uses) assert.match(u, PINNED, u + ' is not sha-pinned');

  // Negative control: the same predicate must REJECT a tag, otherwise the
  // assertion above would pass on any string and prove nothing.
  assert.equal(PINNED.test('actions/checkout@v4'), false);
  assert.equal(PINNED.test('actions/checkout@' + 'g'.repeat(40)), false);
});

test('(w5) permissions are contents: read, with credentials not persisted', () => {
  assert.match(yml, /^permissions:\n\s+contents: read$/m);
  assert.match(yml, /persist-credentials: false/);
  assert.match(yml, /timeout-minutes: \d+/);
});

test('(w6) the CLI it names actually runs and emits the report shape', () => {
  // The five assertions above are about the file. This one is about the thing
  // the file calls — a workflow that is structurally perfect and points at a
  // module that throws is exactly the wiring break metric 5 is looking for.
  const out = execFileSync('node', [path.join(REPO_ROOT, CLI_REL), 'report', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: Object.assign({}, process.env, { MCCP_CODEX_DISABLED: '1' }),
    maxBuffer: 32 * 1024 * 1024,
  });
  const parsed = JSON.parse(out);
  for (const key of ['seal', 'live', 'ledgers']) {
    assert.ok(Object.prototype.hasOwnProperty.call(parsed, key), 'missing key: ' + key);
  }
  assert.ok(Array.isArray(parsed.ledgers) && parsed.ledgers.length > 0);
});
