'use strict';

/**
 * instruction-contract — relocation ledger parser + reachability lint.
 *
 * The point of these tests is the NEGATIVE direction. A lint that only ever
 * sees a healthy tree cannot tell you it works; each of C1-C4 gets a fixture
 * that breaks exactly that check and nothing else, so a check silently going
 * no-op is caught. Path-traversal fixtures pin the S3 security absorption.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseLedger, extractHeadings } = require('../instruction-contract/ledger');
const { lintReachability, unsafePathReason } = require('../instruction-contract/lint');

// ---------------------------------------------------------------- fixtures

function ledgerDoc(rows) {
  const header = [
    '# fixture ledger',
    '',
    '## 3. Relocation Ledger',
    '',
    '| ID | Heading | Disposition | Dest File | Dest Anchor | Resident Pointer | 근거 |',
    '|---|---|---|---|---|---|---|',
  ];
  const body = rows.map((r) => `| ${r.id || '-'} | ${r.heading} | ${r.disposition} | ${r.destFile || '-'} | ${r.destAnchor || '-'} | ${r.pointer || '-'} | fixture |`);
  return header.concat(body).join('\n') + '\n';
}

/**
 * Healthy tree: one resident section, one relocated section whose destination
 * and anchor exist and which CLAUDE.md still points at.
 */
function makeTree(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ic-lint-'));
  const claudeHeadings = overrides.claudeHeadings || ['1. Kept section'];
  const claudeBody = [
    '# CLAUDE.md',
    '',
  ].concat(claudeHeadings.map((h) => `## ${h}\n\nbody\n`));
  if (overrides.pointer !== null) {
    claudeBody.push(overrides.pointer || 'See docs/moved.md for the relocated detail.');
  }
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), claudeBody.join('\n'), 'utf8');

  if (overrides.destExists !== false) {
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'docs', 'moved.md'),
      ['# moved', '', `## ${overrides.destAnchorInFile || 'Relocated detail'}`, '', 'content', ''].join('\n'),
      'utf8'
    );
  }

  fs.writeFileSync(path.join(root, 'ledger.md'), ledgerDoc(overrides.rows || [
    { id: 'S1', heading: '1. Kept section', disposition: 'resident' },
    {
      id: 'S2', heading: '2. Moved section', disposition: 'on-demand',
      destFile: 'docs/moved.md', destAnchor: 'Relocated detail', pointer: 'docs/moved.md',
    },
  ]), 'utf8');

  return root;
}

// Synthetic trees have no git history, so C4's strict pass has no pre-reduction
// ref to anchor against and correctly fails closed. These fixtures exercise the
// per-check logic, so they opt into the ledger-only C4 explicitly; the strict
// pass is covered separately against the real repository below. Opting in here
// is deliberate — silently defaulting to the weaker check is what would let the
// strict pass rot unnoticed.
function runLint(root, opts) {
  return lintReachability(Object.assign({
    repoRoot: root, claudePath: 'CLAUDE.md', ledgerPath: 'ledger.md', allowMissingBefore: true,
  }, opts || {}));
}

function withTree(overrides, fn) {
  const root = makeTree(overrides);
  try { return fn(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------- parser

test('ledger: parses the table into typed rows', () => {
  const parsed = parseLedger(ledgerDoc([
    { id: 'S1', heading: 'A', disposition: 'resident' },
    { id: 'S2', heading: 'B', disposition: 'on-demand', destFile: 'docs/x.md', destAnchor: 'Anchor', pointer: 'docs/x.md' },
    { id: 'S3', heading: 'C', disposition: 'retire' },
  ]));

  assert.strictEqual(parsed.ok, true, parsed.errors.join('; '));
  assert.strictEqual(parsed.rows.length, 3);
  assert.strictEqual(parsed.rows[0].dest_file, null, '"-" cells become null');
  assert.strictEqual(parsed.rows[1].dest_anchor, 'Anchor');
  assert.strictEqual(parsed.rows[2].disposition, 'retire');
});

test('ledger: rejects a half-specified destination', () => {
  const parsed = parseLedger(ledgerDoc([
    { id: 'S1', heading: 'A', disposition: 'on-demand', destFile: 'docs/x.md' },
  ]));
  assert.strictEqual(parsed.ok, false);
  assert.match(parsed.errors.join(' '), /must be specified together/);
});

test('ledger: rejects unknown disposition and duplicate headings', () => {
  const bad = parseLedger(ledgerDoc([{ id: 'S1', heading: 'A', disposition: 'maybe' }]));
  assert.strictEqual(bad.ok, false);
  assert.match(bad.errors.join(' '), /unknown Disposition/);

  const dup = parseLedger(ledgerDoc([
    { id: 'S1', heading: 'A', disposition: 'resident' },
    { id: 'S2', heading: 'A', disposition: 'resident' },
  ]));
  assert.strictEqual(dup.ok, false);
  assert.match(dup.errors.join(' '), /duplicate Heading/);
});

test('ledger: a resident row may not declare a destination', () => {
  const parsed = parseLedger(ledgerDoc([
    { id: 'S1', heading: 'A', disposition: 'resident', destFile: 'docs/x.md', destAnchor: 'Anchor' },
  ]));
  assert.strictEqual(parsed.ok, false);
  assert.match(parsed.errors.join(' '), /resident section must not declare a destination/);
});

test('extractHeadings: ignores headings inside fenced code blocks', () => {
  const md = [
    '## Real one',
    '',
    '```bash',
    '## not a heading, a shell comment',
    '```',
    '',
    '### Real two',
    '',
    '~~~',
    '## also fenced',
    '~~~',
  ].join('\n');

  const titles = extractHeadings(md).map((h) => h.title);
  assert.deepStrictEqual(titles, ['Real one', 'Real two']);
});

// ---------------------------------------------------------------- happy path

test('lint: healthy tree passes all four checks', () => {
  withTree({}, (root) => {
    const r = runLint(root);
    assert.strictEqual(r.ok, true, JSON.stringify(r.failures));
    assert.deepStrictEqual(r.checks, { C1: 'pass', C2: 'pass', C3: 'pass', C4: 'pass' });
    assert.strictEqual(r.stats.routed, 1, "one row declares a destination");
    assert.strictEqual(r.stats.removed, 1, "and that heading is gone from CLAUDE.md in this fixture");
  });
});

// ---------------------------------------------------------------- negatives

test('lint C1: destination file deleted → C1 fails', () => {
  withTree({ destExists: false }, (root) => {
    const r = runLint(root);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.checks.C1, 'fail');
    assert.match(r.failures.map((f) => f.message).join(' '), /Dest File does not exist/);
  });
});

test('lint C2: anchor typo → C2 fails while C1 still passes', () => {
  withTree({ destAnchorInFile: 'Relocated detai' }, (root) => {
    const r = runLint(root);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.checks.C2, 'fail');
    assert.strictEqual(r.checks.C1, 'pass', 'C1 must not be collateral — the file does exist');
  });
});

test('lint C3: resident pointer removed → C3 fails', () => {
  withTree({ pointer: null }, (root) => {
    const r = runLint(root);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.checks.C3, 'fail');
    assert.match(r.failures.map((f) => f.message).join(' '), /no pointer containing/);
  });
});

test('lint C4: section removed with no destination in the ledger → C4 fails', () => {
  // "2. Unrouted section" is in the ledger as on-demand with NO destination and
  // is absent from CLAUDE.md — i.e. it was deleted, not relocated.
  withTree({
    claudeHeadings: ['1. Kept section'],
    rows: [
      { id: 'S1', heading: '1. Kept section', disposition: 'resident' },
      { id: 'S2', heading: '2. Unrouted section', disposition: 'on-demand' },
    ],
    pointer: 'no destination declared',
  }, (root) => {
    const r = runLint(root);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.checks.C4, 'fail');
    assert.match(r.failures.map((f) => f.message).join(' '), /declares no destination/);
  });
});

test('lint C4: a resident section that disappeared → C4 fails', () => {
  withTree({
    claudeHeadings: ['2. Moved section'],
    pointer: 'docs/moved.md',
  }, (root) => {
    const r = runLint(root);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.checks.C4, 'fail');
    assert.match(r.failures.map((f) => f.message).join(' '), /classified resident but is no longer/);
  });
});

test('lint C4: a retire row may disappear without a destination', () => {
  withTree({
    claudeHeadings: ['1. Kept section'],
    rows: [
      { id: 'S1', heading: '1. Kept section', disposition: 'resident' },
      { id: 'S2', heading: '2. Retired section', disposition: 'retire' },
    ],
    pointer: 'nothing to point at',
  }, (root) => {
    const r = runLint(root);
    assert.strictEqual(r.ok, true, JSON.stringify(r.failures));
  });
});

test('lint: an unledgered CLAUDE.md heading is an advisory, not a failure', () => {
  withTree({ claudeHeadings: ['1. Kept section', '9. Brand new section'] }, (root) => {
    const r = runLint(root);
    assert.strictEqual(r.ok, true, JSON.stringify(r.failures));
    assert.match(r.advisories.join(' '), /9\. Brand new section/);
  });
});

// ---------------------------------------------------------------- security S3

test('unsafePathReason: rejects traversal, absolute, drive and UNC paths', () => {
  assert.strictEqual(unsafePathReason('docs/ok.md'), null);
  assert.match(unsafePathReason('../../etc/passwd'), /traversal/);
  assert.match(unsafePathReason('docs/../../etc/passwd'), /traversal/);
  assert.match(unsafePathReason('C:\\Windows\\System32\\config\\SAM'), /drive-qualified/);
  assert.match(unsafePathReason('\\\\attacker.example.com\\share\\payload'), /UNC/);
  assert.match(unsafePathReason('//attacker.example.com/share'), /UNC/);
  assert.ok(unsafePathReason(''), 'empty path rejected');
});

test('lint C1: a traversal Dest File is rejected as unsafe, not merely missing', () => {
  // The document is the attacker-controlled input here. The failure must name
  // the escape; reporting "file not found" would hide that the lint was asked
  // to read outside the repo at all.
  withTree({
    rows: [
      { id: 'S1', heading: '1. Kept section', disposition: 'resident' },
      {
        id: 'S2', heading: '2. Moved section', disposition: 'on-demand',
        destFile: '../../../../etc/passwd', destAnchor: 'root', pointer: 'docs/moved.md',
      },
    ],
  }, (root) => {
    const r = runLint(root);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.checks.C1, 'fail');
    assert.match(r.failures.map((f) => f.message).join(' '), /unsafe Dest File.*traversal/);
  });
});

test('lint: the real repo ledger parses and covers every CLAUDE.md heading', () => {
  // Guards the Task 2 acceptance condition mechanically: a section with no
  // classification would silently escape the contract.
  // plugins/mccp/scripts/lib/tests -> FIVE levels up is the repo root. At four
  // this resolved to `plugins/`, both files were missing, and the existence
  // guard below turned the whole check into a silent no-op — it reported pass
  // while verifying nothing. Assert instead of skipping.
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
  const ledgerPath = path.join(repoRoot, 'docs', 'multi-session-work-loop', 'instruction-contract.md');
  const claudePath = path.join(repoRoot, 'CLAUDE.md');
  assert.ok(fs.existsSync(ledgerPath), 'repo ledger must exist at ' + ledgerPath);
  assert.ok(fs.existsSync(claudePath), 'CLAUDE.md must exist at ' + claudePath);

  const parsed = parseLedger(fs.readFileSync(ledgerPath, 'utf8'));
  assert.strictEqual(parsed.ok, true, parsed.errors.join('; '));

  const ledgerHeadings = new Set(parsed.rows.map((r) => r.heading));
  const claudeHeadings = extractHeadings(fs.readFileSync(claudePath, 'utf8')).map((h) => h.title);
  const unclassified = claudeHeadings.filter((h) => !ledgerHeadings.has(h));
  assert.deepStrictEqual(unclassified, [],
    'every CLAUDE.md heading must carry a disposition in the contract');
});

// ------------------------------------------------- santa-loop round 1 hardening
//
// Reviewer B found three ways the lint reported success while proving less than
// G2 claims. Each fix gets the fixture that drives it red, because a check that
// cannot be shown failing is indistinguishable from one that never runs.

test('lint C3: a routed row with no resident pointer fails (was silently skipped)', () => {
  withTree({
    rows: [
      { id: 'S1', heading: '1. Kept section', disposition: 'resident' },
      {
        id: 'S2', heading: '2. Moved section', disposition: 'on-demand',
        destFile: 'docs/moved.md', destAnchor: 'Relocated detail', pointer: null,
      },
    ],
  }, (root) => {
    const r = runLint(root);
    assert.strictEqual(r.checks.C3, 'fail',
      'omitting the pointer column must not switch the check off');
    assert.match(r.failures.map((f) => f.message).join('\n'), /declares no Resident Pointer/);
  });
});

test('lint C3: a pointer that never names its destination fails', () => {
  withTree({
    pointer: 'See the appendix for the relocated detail.',
    rows: [
      { id: 'S1', heading: '1. Kept section', disposition: 'resident' },
      {
        id: 'S2', heading: '2. Moved section', disposition: 'on-demand',
        destFile: 'docs/moved.md', destAnchor: 'Relocated detail', pointer: 'appendix',
      },
    ],
  }, (root) => {
    const r = runLint(root);
    assert.strictEqual(r.checks.C3, 'fail',
      'pointer text present in CLAUDE.md is not the same as the destination being reachable');
    assert.match(r.failures.map((f) => f.message).join('\n'), /never names the destination/);
  });
});

test('lint C4: with no resolvable before-ref the lint fails closed', () => {
  withTree({}, (root) => {
    const r = lintReachability({
      repoRoot: root, claudePath: 'CLAUDE.md', ledgerPath: 'ledger.md',
      beforeRef: 'refs/mccp-test/does-not-exist', baselinePath: 'no-such-baseline.json',
      baseRef: 'refs/mccp-test/also-missing',
    });
    assert.strictEqual(r.checks.C4, 'fail', 'an unprovable C4 must not report pass');
    assert.strictEqual(r.stats.c4_strict, false);
    assert.match(r.failures.map((f) => f.message).join('\n'), /no trusted pre-reduction heading set/);
  });
});

test('lint C4: --allow-missing-before degrades but says so', () => {
  withTree({}, (root) => {
    const r = lintReachability({
      repoRoot: root, claudePath: 'CLAUDE.md', ledgerPath: 'ledger.md',
      beforeRef: 'refs/mccp-test/does-not-exist', baselinePath: 'no-such-baseline.json',
      baseRef: 'refs/mccp-test/also-missing', allowMissingBefore: true,
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.stats.c4_strict, false, 'the weaker run must be visible in the stats');
    assert.match(r.advisories.join('\n'), /WITHOUT a pre-reduction baseline/);
  });
});

test('lint C4 strict: a section deleted from BOTH CLAUDE.md and the ledger is caught', () => {
  // The ledger-row walk structurally cannot see this case: with the row gone
  // there is nothing left to iterate. Only a trusted before-set catches it, so
  // this runs against the real repo where git can supply one.
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
  const claudeText = fs.readFileSync(path.join(repoRoot, 'CLAUDE.md'), 'utf8');
  const ledgerRel = path.join('docs', 'multi-session-work-loop', 'instruction-contract.md');
  const ledgerText = fs.readFileSync(path.join(repoRoot, ledgerRel), 'utf8');

  const victim = '### 3.11 완료 PRD/plan 아카이브 (`archived/` 관례 + `/mccp:archive-complete`) (v1.20.15)';
  assert.ok(claudeText.indexOf(victim) !== -1, 'fixture heading must exist in CLAUDE.md');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ic-c4-'));
  try {
    const claudeCut = path.join(tmp, 'CLAUDE.cut.md');
    const ledgerCut = path.join(tmp, 'ledger.cut.md');
    fs.writeFileSync(claudeCut,
      claudeText.split('\n').filter((ln) => ln.trim() !== victim).join('\n'), 'utf8');
    fs.writeFileSync(ledgerCut,
      ledgerText.split('\n').filter((ln) => ln.indexOf('3.11 완료 PRD/plan 아카이브') === -1).join('\n'), 'utf8');

    const r = lintReachability({ repoRoot: repoRoot, claudePath: claudeCut, ledgerPath: ledgerCut });
    assert.strictEqual(r.stats.c4_strict, true, 'the real repo must supply a before-ref');
    assert.strictEqual(r.checks.C4, 'fail');
    assert.match(r.failures.map((f) => f.message).join('\n'), /the ledger has\s+no row for it/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('lint: the real repo passes with the STRICT C4 pass enabled', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
  const r = lintReachability({
    repoRoot: repoRoot,
    claudePath: 'CLAUDE.md',
    ledgerPath: path.join('docs', 'multi-session-work-loop', 'instruction-contract.md'),
  });
  assert.strictEqual(r.stats.c4_strict, true,
    'the reduction claim rests on a before-set actually being available');
  assert.strictEqual(r.ok, true, r.failures.map((f) => f.check + ': ' + f.message).join('\n'));
});
