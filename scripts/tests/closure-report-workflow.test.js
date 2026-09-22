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

// ── closure-accounting M5 Task 9 ─────────────────────────────────────────────

// The `run: |` block of a named step, dedented. Empty when the step or its block
// is missing — callers assert non-empty, so a failed extraction cannot pass.
function runBlockOf(stepName) {
  const lines = raw.split(/\r?\n/);
  const at = lines.findIndex(function (l) { return l.trim() === '- name: ' + stepName; });
  if (at === -1) return '';
  let i = at + 1;
  while (i < lines.length && !/^\s+run: \|\s*$/.test(lines[i])) {
    if (/^\s+- name: /.test(lines[i])) return '';
    i += 1;
  }
  if (i >= lines.length) return '';
  const keyIndent = lines[i].match(/^\s*/)[0].length;
  const body = [];
  for (i += 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() !== '' && l.match(/^\s*/)[0].length <= keyIndent) break;
    body.push(l);
  }
  const indent = Math.min.apply(null, body.filter(function (l) { return l.trim(); })
    .map(function (l) { return l.match(/^\s*/)[0].length; }));
  return body.map(function (l) { return l.slice(indent); }).join('\n').trim() + '\n';
}

test('(w7) the json report is uploaded as an artifact, after it is proven to parse', () => {
  // OQ2's substance is the gap's growth RATE, and a rate needs past values. The
  // job summary is text; the json is what a later reader can recompute from.
  const parseAt = yml.indexOf('- name: Check the json report parses');
  const uploadAt = yml.indexOf('- name: Upload the json report');
  assert.ok(parseAt !== -1 && uploadAt !== -1, 'both steps exist');
  assert.ok(uploadAt > parseAt, 'upload comes after the parse check');
  const step = yml.slice(uploadAt).split(/\n\s+- name: /)[0];
  assert.match(step, /uses: actions\/upload-artifact@[0-9a-f]{40}/);
  assert.match(step, /^\s+name: closure-report$/m);
  assert.match(step, /^\s+path: closure-report\.json$/m);
  // A missing file means the instrument did not run — red, like everything else here.
  assert.match(step, /^\s+if-no-files-found: error$/m);
  assert.ok(!/retention-days/.test(step), 'repository default retention (DD8)');
});

test('(w8) report content cannot close the job-summary fence early', () => {
  // backlog 1852 — the report quotes backlog and reviewer text, so a literal
  // ``` in it would end a fixed-length fence and render the rest as markdown.
  const script = runBlockOf('Publish to the job summary');
  assert.ok(script.length > 0, 'the publish step has a run block');
  assert.ok(script.includes('GITHUB_STEP_SUMMARY'), 'the extracted block is the one that publishes');

  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'mccp-w8-'));
  try {
    fs.writeFileSync(path.join(dir, 'closure-report.txt'),
      'DENOMINATOR GAP\n```\nquoted fence\n````\nend\n', 'utf8');
    const summary = path.join(dir, 'summary.md');
    execFileSync('bash', ['-e', '-c', script], {
      cwd: dir, encoding: 'utf8',
      env: Object.assign({}, process.env, { GITHUB_STEP_SUMMARY: summary }),
    });
    const out = fs.readFileSync(summary, 'utf8').replace(/\n$/, '').split('\n');
    const open = out[0].match(/^(`+)text$/);
    assert.ok(open, 'the first line opens a fence: ' + out[0]);
    assert.ok(open[1].length >= 5, 'longer than the longest run in the report (4): ' + open[1].length);
    assert.strictEqual(out[out.length - 1], open[1], 'closed with the same fence');
    const inner = out.slice(1, -1);
    assert.ok(inner.indexOf('```') !== -1 && inner.indexOf('````') !== -1,
      'both backtick lines stay inside the fence');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
