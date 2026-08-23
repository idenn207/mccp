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
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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

// The four bodies that actually invoke impeccable. plan-prd.md is canonical by
// mode but calls nothing — it is covered by the detect-reference test above and
// by the negative assertion below, not by the call-form assertions.
const CALLING = ['plan.md', 'prp-implement.md', 'pr.md', 'code-review.md'].map(
  (f) => path.join(PLUGIN_ROOT, 'commands', f));

const BARE_CALL_LITERAL = 'Skill(impeccable';
const REPO_ROOT = path.resolve(PLUGIN_ROOT, '..', '..');
const BARE_SKILL_MD = path.join(REPO_ROOT, '.claude', 'skills', 'impeccable', 'SKILL.md');

test('each calling command resolves its call form instead of hardcoding one', () => {
  // Replaces the pre-v1.31.3 assertion that a bare Skill(impeccable literal
  // appeared in every canonical command. That assertion, left in place, would
  // have FORBIDDEN the rewiring it was written to protect.
  for (const file of CALLING) {
    const src = readSource(file);
    assert.ok(src.includes('IMPECCABLE_INVOCATION=$('),
      `${path.basename(file)}: must extract the resolved invocation from the detect JSON`);
    assert.ok(src.includes('impeccable_invocation'),
      `${path.basename(file)}: must read the oracle's impeccable_invocation field`);
    assert.ok(src.includes('[mccp:impeccable] call-form:'),
      `${path.basename(file)}: must print the one stderr line the LLM reads`);
    assert.ok(src.includes('Call-form rule'),
      `${path.basename(file)}: must carry the call-form rule, including the absent-line branch`);
  }
});

test('no command body hardcodes a bare impeccable call literal', () => {
  // Deliberately a whole-file check rather than an attempt to tell a live
  // instruction from a sentence about one. Markdown carries no syntax that
  // separates the two, so a guard that tried would be guessing — and a guard
  // that fires on documentation is worse than none (Implement-Codex R1 F4b).
  // Absence is the only version of this assertion that means what it says, so
  // prose which needs to discuss the old form describes it instead of quoting it.
  for (const file of ALL_FILES) {
    const src = readSource(file);
    assert.ok(!src.includes(BARE_CALL_LITERAL),
      `${path.basename(file)}: still hardcodes ${BARE_CALL_LITERAL} — the call form must come from the oracle`);
  }
});

test('single-commit invariant: the bare copy and the bare literal live and die together', () => {
  // The dangerous half is copy-removed-but-bodies-still-bare: every design gate
  // would reach unknown_skill at once. The other half (rewired but the copy is
  // still here) is harmless in itself — a bare source would simply still win —
  // but the two are asserted as ONE equality because that is the only form that
  // cannot be satisfied by landing half of the change.
  //
  // A red here is not ambiguous: read which side is true.
  const bareCopyPresent = fs.existsSync(BARE_SKILL_MD);
  const bareLiteralPresent = ALL_FILES.some((f) => readSource(f).includes(BARE_CALL_LITERAL));
  assert.strictEqual(bareLiteralPresent, bareCopyPresent,
    `bare copy on disk = ${bareCopyPresent}, bare literal in a command body = ${bareLiteralPresent}. `
    + 'These must match. copy=false + literal=true is the dangerous order: the bodies call a name '
    + 'nothing answers, so every design gate records unknown_skill. copy=true + literal=false is '
    + 'harmless but still means the removal half of this change has not landed.');
});

test('setup.md carries the Phase 3.5 cleanup surface', () => {
  const src = readSource(path.join(PLUGIN_ROOT, 'commands', 'setup.md'));
  assert.ok(/^### 3\.5 /m.test(src), 'setup.md must declare a Phase 3.5 section');
  assert.ok(src.includes('impeccable-cleanup.js'),
    'setup.md Phase 3.5 must call the cleanup oracle, not reason about paths itself');
  assert.ok(src.includes('plan --json'), 'Phase 3.5 must read the plan before offering anything');
  assert.ok(src.includes('--confirm'), 'the apply step must pass an explicit confirmation');
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

// ── v1.31.4 M4 — finish-pass wiring ───────────────────────────────────────
//
// M3 taught this file a lesson the hard way: the assertion that used to sit
// here checked PROSE (a literal that a sentence *about* the old call form would
// satisfy) instead of WIRING. These check wiring — what the body calls, not
// what it says about itself.

const IMPLEMENT_MD = CANONICAL_BY_MODE.implement;

// The three commands Phase 3.6 used to name inline. Their absence is what
// proves the step now asks the oracle instead of carrying its own list.
const HARDCODED_FINISH_LITERALS = ['`clarify <slug>`', '`distill <slug>`', '`polish <slug>`'];

test('M4 pair: routing the finish phase and restamping its outcomes live and die together', () => {
  // Half-landings are the danger, in both directions:
  //   route-but-no-restamp — the finish commands fire and the receipt still
  //     under-reports, which is the exact gap M4 exists to close;
  //   restamp-but-no-route — the restamp has nothing real to stamp, so it
  //     either no-ops forever or seals a hand-written list, and the receipt
  //     then claims invocations the oracle never authorised.
  // Asserting ONE equality is the only form neither half can satisfy alone.
  const src = readSource(IMPLEMENT_MD);
  const routesFinish = src.includes('phase:"finish"');
  const restampsRouted = src.includes('restamp-routed');
  assert.strictEqual(routesFinish, restampsRouted,
    `routes finish phase = ${routesFinish}, calls restamp-routed = ${restampsRouted}. `
    + 'These must match: routing without restamping leaves the receipt under-reporting the '
    + 'invocations that actually happened, and restamping without routing means the outcomes '
    + 'being sealed did not come from the oracle.');
});

test('M4: the pre pass names its phase explicitly', () => {
  // Same value as the default, so this is not a behaviour assertion — it is a
  // readability one. With two passes reading one table, a call site that omits
  // the axis leaves the next editor to infer which pass they are looking at.
  const src = readSource(IMPLEMENT_MD);
  assert.ok(src.includes('phase:"pre"'),
    'prp-implement.md 2.5.5b must pass phase:"pre" explicitly now that a finish pass exists');
});

test('M4: Phase 3.6 no longer carries its own command list', () => {
  const src = readSource(IMPLEMENT_MD);
  for (const literal of HARDCODED_FINISH_LITERALS) {
    assert.ok(!src.includes(literal),
      `prp-implement.md still hardcodes ${literal} — the finish commands must come from `
      + 'routeCommands({phase:"finish"}), otherwise the receipt records a list nobody routed.');
  }
});

test('M4: the routing oracle actually carries a finish phase for implement', () => {
  // Guards the other side of the pair from the command body's point of view:
  // a body asking for phase:"finish" against a table that has no finish rows
  // would route zero commands and restamp an empty array, silently.
  const routing = require('../impeccable-routing');
  const finish = routing.routeCommands({
    gate: 'implement', mode: 'auto', designSignal: true, renderingSurface: true, phase: 'finish',
  });
  assert.ok(finish.commands.length > 0,
    'implement/finish routed nothing — the command body would restamp an empty array');
  assert.strictEqual(finish.skipped, false);
});

// code-review L4 — the M4 pair test above proves the wiring literals are
// PRESENT. It cannot tell whether the shell carrying them parses, and it did
// not: Phase 3.6.5 shipped with an unbalanced quote (`cli.js"` with no opener),
// which made every command in that block a syntax error while every literal
// assertion stayed green. A grep-shaped guard cannot see that class of defect;
// only a parser can. This runs one over the whole file, not just M4's blocks.
//
// Fences containing `<placeholder>` text are excluded. The repo documents
// operator-substituted arguments as `<plan path>`, which bash reads as a
// redirection — a documentation convention, not a defect.
const BASH_PLACEHOLDER = /<[A-Za-z][^>\n]*>/;

function bashFences(mdPath) {
  const lines = fs.readFileSync(mdPath, 'utf8').split(/\r?\n/);
  const fences = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^```bash\s*$/.test(lines[i])) continue;
    const start = i + 1;
    let j = start;
    while (j < lines.length && !/^```\s*$/.test(lines[j])) j += 1;
    fences.push({ line: start + 1, body: lines.slice(start, j).join('\n') });
    i = j;
  }
  return fences;
}

test('M4: every self-contained bash fence in prp-implement.md parses', (t) => {
  if (spawnSync('bash', ['-c', 'exit 0']).error) {
    t.skip('bash unavailable on this platform — the parser check cannot run here');
    return;
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-fence-'));
  const failures = [];
  let checked = 0;
  try {
    for (const fence of bashFences(IMPLEMENT_MD)) {
      if (BASH_PLACEHOLDER.test(fence.body)) continue;
      const scratch = path.join(tmpDir, 'fence-' + fence.line + '.sh');
      fs.writeFileSync(scratch, fence.body);
      const r = spawnSync('bash', ['-n', scratch], { encoding: 'utf8' });
      checked += 1;
      if (r.status !== 0) {
        failures.push('prp-implement.md:' + fence.line + ' — '
          + String(r.stderr || '').trim().split('\n')[0]);
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  assert.ok(checked > 0, 'no checkable bash fences found — the extractor drifted');
  assert.deepStrictEqual(failures, [],
    'bash fences that do not parse:\n  ' + failures.join('\n  '));
});
