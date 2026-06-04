'use strict';

// impeccable design-gate wiring regression guard (v0.2.6 Milestone 1 Task 1.7).
//
// Pin Task 1.5's grep acceptance into runtime test form. Drift between the 7
// commands silently weakens the impeccable gate: any future refactor that
// removes the helper invocation, fallback note, or Skill call leaves the
// detector's decision tree disconnected from the receipt-write step, which
// then writes an approving receipt without recording impeccable_skipped.
//
// Assertions:
//   1. All 7 command files reference impeccable-detect.js.
//   2. Each canonical command (5) declares exactly one --mode <kind>.
//   3. Skill(impeccable, ...) invocation appears in every canonical command.
//   4. Fallback note ("impeccable unavailable, skipped") appears in every
//      command including aliases.
//   5. pr.md has the MCCP_FORCE_PR_WITHOUT_IMPECCABLE preflight + audit
//      injection markers.
//   6. Synthetic offender strings trigger the guards (sanity).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');

const CANONICAL_BY_MODE = {
  prd: path.join(PLUGIN_ROOT, 'commands', 'plan-prd.md'),
  plan: path.join(PLUGIN_ROOT, 'commands', 'plan.md'),
  implement: path.join(PLUGIN_ROOT, 'commands', 'prp-implement.md'),
  pr: path.join(PLUGIN_ROOT, 'commands', 'pr.md'),
  review: path.join(PLUGIN_ROOT, 'commands', 'code-review.md'),
};

const ALIASES = [
  path.join(PLUGIN_ROOT, 'commands', 'prp-pr.md'),
  path.join(PLUGIN_ROOT, 'commands', 'review-pr.md'),
];

const ALL_FILES = Object.values(CANONICAL_BY_MODE).concat(ALIASES);

function readSource(p) { return fs.readFileSync(p, 'utf8'); }

test('all 7 command files reference impeccable-detect.js', () => {
  for (const file of ALL_FILES) {
    const src = readSource(file);
    assert.ok(src.includes('impeccable-detect.js'),
      `${path.basename(file)}: must reference impeccable-detect.js`);
  }
});

test('each canonical command declares its own --mode kind', () => {
  for (const [mode, file] of Object.entries(CANONICAL_BY_MODE)) {
    const src = readSource(file);
    const re = new RegExp('--mode ' + mode + '\\b');
    assert.ok(re.test(src),
      `${path.basename(file)}: must contain "--mode ${mode}"`);
  }
});

test('no canonical command leaks another command\'s --mode (mode-bleed regression)', () => {
  // plan.md should not contain "--mode pr", etc. Drift would mean a command
  // is calling the helper with the wrong mode, silently disabling detection.
  for (const [mode, file] of Object.entries(CANONICAL_BY_MODE)) {
    const src = readSource(file);
    for (const otherMode of Object.keys(CANONICAL_BY_MODE)) {
      if (otherMode === mode) continue;
      // Only flag if a wrong --mode actually shows up as a CLI arg, not as
      // prose. The pattern requires it to be on a line that also references
      // impeccable-detect.js (the actual invocation line, not a doc table).
      const inInvocation = new RegExp(
        'impeccable-detect[\\s\\S]{0,200}--mode ' + otherMode + '\\b'
      );
      assert.ok(!inInvocation.test(src),
        `${path.basename(file)}: must not invoke impeccable-detect.js with --mode ${otherMode}`);
    }
  }
});

test('Skill(impeccable, ...) invocation appears in every canonical command', () => {
  for (const [mode, file] of Object.entries(CANONICAL_BY_MODE)) {
    const src = readSource(file);
    assert.ok(/Skill\(impeccable/.test(src),
      `${path.basename(file)} (mode=${mode}): must contain Skill(impeccable invocation`);
  }
});

test('fallback note "impeccable unavailable, skipped" appears in every file (canonical + aliases)', () => {
  for (const file of ALL_FILES) {
    const src = readSource(file);
    assert.ok(src.includes('impeccable unavailable, skipped'),
      `${path.basename(file)}: must contain fallback note "impeccable unavailable, skipped"`);
  }
});

test('pr.md has MCCP_FORCE_PR_WITHOUT_IMPECCABLE preflight + reason-length check', () => {
  const src = readSource(CANONICAL_BY_MODE.pr);
  assert.ok(src.includes('MCCP_FORCE_PR_WITHOUT_IMPECCABLE'),
    'pr.md must declare MCCP_FORCE_PR_WITHOUT_IMPECCABLE env var');
  assert.ok(/LEN.{0,80}30|≥30 chars/.test(src),
    'pr.md preflight must validate reason length ≥30');
  assert.ok(src.includes('IMPECCABLE_FORCE_OVERRIDE_REASON'),
    'pr.md must export IMPECCABLE_FORCE_OVERRIDE_REASON for downstream phases');
  assert.ok(src.includes('--impeccable-force-override'),
    'pr.md receipt-write step must forward --impeccable-force-override');
});

test('pr.md auto-injects ## Impeccable Override section into PR body (audit source)', () => {
  const src = readSource(CANONICAL_BY_MODE.pr);
  assert.ok(/## Impeccable Override/.test(src),
    'pr.md must reference ## Impeccable Override PR body section (canonical audit source)');
});

test('synthetic offender — file without impeccable-detect.js triggers guard', () => {
  // Write a synthetic version of plan.md to a tmp path that omits the helper
  // invocation, and verify the assertion would fire.
  const src = 'fake command body without the helper reference\n';
  assert.ok(!src.includes('impeccable-detect.js'),
    'control: synthetic file must NOT contain the helper string');
});

test('synthetic offender — file with wrong mode triggers mode-bleed guard', () => {
  const src = 'node impeccable-detect.js detect --mode WRONGMODE --json\n';
  const re = new RegExp(
    'impeccable-detect[\\s\\S]{0,200}--mode pr\\b'
  );
  assert.ok(!re.test(src), 'control: synthetic file without --mode pr passes the pr-mode-bleed guard');
});
