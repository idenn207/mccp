'use strict';

// setup-command-body — static literal contract for /mccp:setup.
//
// The command body is prose an LLM executes, so nothing about it is checked at
// runtime. The two failures this file exists to catch are both silent:
//
//   1. A deleted install command comes back. `npm install -g impeccable` and
//      `impeccable skills install` were removed because the first is one channel
//      among several and the second is not how any current channel deploys the
//      skill. Prose drifts back; a literal assertion does not.
//   2. Phase 3 goes back to reading the PATH probe. The entry condition is
//      `checkImpeccable().available`, and the whole point of M2 is that the CLI
//      probe has no decision authority.
//
// Mirror: plan-review-command-body.test.js — read the markdown, assert on
// literals, and say WHY each one is load-bearing.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SETUP_MD = path.join(__dirname, '..', '..', '..', 'commands', 'setup.md');

function body() {
  return fs.readFileSync(SETUP_MD, 'utf8');
}

function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(m, 'setup.md has no frontmatter block');
  return m[1];
}

function allowedTools(text) {
  const fm = frontmatter(text);
  const line = fm.split(/\r?\n/).find((l) => l.startsWith('allowed-tools:'));
  assert.ok(line, 'frontmatter has no allowed-tools line');
  return line;
}

// Each entry carries the reason it is forbidden, so a future reader deleting an
// assertion has to argue with the reason rather than with a bare string.
const FORBIDDEN = [
  ['npm install -g impeccable', 'npm-global is one channel among four and is not the recommended one'],
  ['impeccable skills install', 'no current channel deploys the skill through this subcommand'],
  ['/mccp:impeccable', 'this plugin ships no such command, so a refusal by it can never happen'],
  ['Bash(npm:*)', 'the only npm command this body ran is gone; the permission must go with it'],
  ['Bash(impeccable:*)', 'nothing here invokes an `impeccable` binary directly any more'],
  ['checkImpeccableCli().installed', 'the PATH probe has no decision authority — Phase 3 must not branch on it'],
];

const REQUIRED = [
  ['checkImpeccable', 'Phase 3 branches on the skill oracle, not on the PATH probe'],
  ['npx impeccable install', 'the bare-name CLI channel is the one that makes the gate fire today'],
  ['pbakaus/impeccable', 'the marketplace source measured in Task 0 (b)'],
  ['impeccable@impeccable', 'the registry key measured in Task 0 (b)'],
  ['dep-check', 'an install that does not re-check reports the state from before it ran'],
];

test('setup.md: every deleted install command stays deleted', () => {
  const text = body();
  for (const [literal, why] of FORBIDDEN) {
    assert.ok(
      !text.includes(literal),
      'forbidden literal is back in setup.md: ' + JSON.stringify(literal) + ' — ' + why
    );
  }
});

test('setup.md: the measured install path and the re-check are named literally', () => {
  const text = body();
  for (const [literal, why] of REQUIRED) {
    assert.ok(
      text.includes(literal),
      'required literal missing from setup.md: ' + JSON.stringify(literal) + ' — ' + why
    );
  }
});

// `Bash(npx:*)` would let this command run ANY package off the npm registry;
// the body only ever runs one. The narrower prefix is the whole permission.
test('setup.md: the npx permission is scoped to impeccable, not to all of npx', () => {
  const line = allowedTools(body());
  assert.ok(
    line.includes('Bash(npx impeccable:*)'),
    'allowed-tools must carry the scoped npx permission: ' + line
  );
  assert.ok(
    !/Bash\(npx:\*\)/.test(line),
    'allowed-tools must NOT carry the unscoped Bash(npx:*): ' + line
  );
});

// The regression this guards is the one M2 exists to fix: a user who installed
// through any non-npm channel was asked to install again on every single run.
test('setup.md: Phase 3 skips entirely when the skill already resolves', () => {
  const text = body();
  assert.ok(
    /available === true/.test(text),
    'Phase 3 must state the `available === true` entry condition'
  );
  const phase3 = text.slice(text.indexOf('## Phase 3'), text.indexOf('## Phase 4'));
  assert.ok(phase3.length > 0, 'Phase 3 section not found');
  assert.ok(
    /skip this entire Phase/i.test(phase3),
    'Phase 3 must say it skips entirely, not merely that it reports'
  );
  assert.ok(
    /AskUserQuestion/.test(phase3),
    'Phase 3 still needs its install branch for the unresolved case'
  );
});

// Plugin-first is the operator's choice (UI6) and it does not make the gate
// fire. Setup has to say so at install time rather than let the user discover
// it at the next gate.
test('setup.md: the plugin channel install states the invocation gap', () => {
  const text = body();
  const phase3 = text.slice(text.indexOf('## Phase 3'), text.indexOf('## Phase 4'));
  assert.ok(
    phase3.includes('impeccable:impeccable'),
    'Phase 3 must name the namespaced invocation a plugin install actually registers'
  );
  assert.ok(
    /unknown_skill|impeccable_skipped/.test(phase3),
    'Phase 3 must name the consequence, not just the name mismatch'
  );
});

// Phase 6 used to promise a refusal by a command that does not exist, which hid
// the two blocks that really happen.
test('setup.md: Phase 6 states the real lenient/strict split', () => {
  const text = body();
  const phase6 = text.slice(text.indexOf('## Phase 6'));
  assert.ok(phase6.length > 0, 'Phase 6 section not found');
  assert.ok(/lenient/i.test(phase6) && /strict/i.test(phase6), 'Phase 6 must state both gate strengths');
  assert.ok(
    phase6.includes('MCCP_FORCE_PR_WITHOUT_IMPECCABLE'),
    'Phase 6 must name the audited escape for the strict gates'
  );
});
