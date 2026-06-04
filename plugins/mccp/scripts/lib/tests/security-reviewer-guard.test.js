'use strict';

// security-reviewer Skill→Task contract regression guard.
//
// v0.2.4 Task 5 (absorbs R2 finding #2). The 3 command files below previously
// invoked the Skill index for security-reviewer, which is broken because the
// Skill index does NOT register security-reviewer and the slash command form
// is `disable-model-invocation:true`. v0.2.4 migrated all 3 to the canonical
// Task tool contract: `subagent_type: "security-reviewer"` + explicit prompt.
//
// This guard asserts the migration sticks:
//   1. No Skill(security-reviewer ...) string anywhere in the 3 files.
//   2. No bare Agent(security-reviewer ...) shorthand either — the shorthand
//      form does not map 1:1 to the Task tool harness contract.
//   3. The canonical `subagent_type: "security-reviewer"` contract appears
//      at least once in each file.
//   4. Synthetic offender strings trigger the guards (sanity).
//
// Reference: tests/dep0190-guard.test.js for the same audit pattern.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');
const COMMANDS = [
  path.join(PLUGIN_ROOT, 'commands', 'prp-implement.md'),
  path.join(PLUGIN_ROOT, 'commands', 'pr.md'),
  path.join(PLUGIN_ROOT, 'commands', 'code-review.md'),
];

const SKILL_RE = /Skill\(security-reviewer/g;
const AGENT_SHORTHAND_RE = /Agent\(security-reviewer/g;
const CANONICAL_RE = /subagent_type:\s*"security-reviewer"/g;

function countMatches(source, re) {
  const matches = source.match(re);
  return matches ? matches.length : 0;
}

test('command files contain zero Skill(security-reviewer ...) invocations', () => {
  for (const file of COMMANDS) {
    const source = fs.readFileSync(file, 'utf8');
    const count = countMatches(source, SKILL_RE);
    assert.strictEqual(
      count,
      0,
      `${path.basename(file)}: expected 0 Skill(security-reviewer matches, got ${count}`,
    );
  }
});

test('command files contain zero Agent(security-reviewer shorthand', () => {
  for (const file of COMMANDS) {
    const source = fs.readFileSync(file, 'utf8');
    const count = countMatches(source, AGENT_SHORTHAND_RE);
    assert.strictEqual(
      count,
      0,
      `${path.basename(file)}: expected 0 Agent(security-reviewer shorthand, got ${count}. ` +
        `Use the canonical Task tool contract instead: subagent_type: "security-reviewer"`,
    );
  }
});

test('command files document the canonical subagent_type: "security-reviewer" contract', () => {
  for (const file of COMMANDS) {
    const source = fs.readFileSync(file, 'utf8');
    const count = countMatches(source, CANONICAL_RE);
    assert.ok(
      count >= 1,
      `${path.basename(file)}: expected >=1 'subagent_type: "security-reviewer"' canonical contract, got ${count}`,
    );
  }
});

test('synthetic offender strings trigger the guards (bidirectional sanity)', () => {
  const skillOffender = 'invoke `Skill(security-reviewer, "audit")` after step 2';
  const agentOffender = 'fallback to Agent(security-reviewer, "...")';
  const canonical = 'use `subagent_type: "security-reviewer"` via Task tool';
  const safeForm = 'the canonical contract is `subagent_type: "security-reviewer"` + prompt';

  assert.strictEqual(countMatches(skillOffender, SKILL_RE), 1, 'skill regex should fire on offender');
  assert.strictEqual(countMatches(safeForm, SKILL_RE), 0, 'skill regex should NOT fire on safe form');

  assert.strictEqual(countMatches(agentOffender, AGENT_SHORTHAND_RE), 1, 'agent shorthand regex should fire');
  assert.strictEqual(countMatches(safeForm, AGENT_SHORTHAND_RE), 0, 'agent shorthand regex should NOT fire on safe form');

  assert.strictEqual(countMatches(canonical, CANONICAL_RE), 1, 'canonical regex should fire on canonical form');
  assert.strictEqual(countMatches(skillOffender, CANONICAL_RE), 0, 'canonical regex should NOT fire on Skill offender');
});

test('pr.md documents the MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER audited escape branch (Task 10)', () => {
  const prMd = path.join(PLUGIN_ROOT, 'commands', 'pr.md');
  const source = fs.readFileSync(prMd, 'utf8');
  assert.match(
    source,
    /MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER/,
    'pr.md must document the audited escape env var',
  );
  assert.match(
    source,
    /## Security Reviewer Override/,
    'pr.md must inject the canonical PR body audit section reference',
  );
});
