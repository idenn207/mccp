'use strict';

// Task 5 dogfood — Task tool contract invocation runtime drift catcher.
//
// v0.2.4 Task 5 (absorbs R2 finding #2). The guard sibling test
// (security-reviewer-guard.test.js) asserts the canonical contract string is
// present in command bodies. This dogfood test goes one step further: it
// extracts the contract from the command file as markdown, feeds it into a
// fake Task tool harness, and asserts the harness can dispatch it according
// to the documented schema.
//
// If a future edit silently breaks the markdown shape (missing prompt field,
// renamed subagent_type, etc.) this test catches the drift even before the
// harness ever sees it in production.
//
// Schema contract (per docs/v0.2-architecture.md §7 Task tool subsection):
//   - subagent_type: non-empty string, exactly "security-reviewer"
//   - prompt: non-empty string (any concrete instruction text)
//   - harness returns { ok: boolean, findings?: string, error?: string }

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');

// Each command file pairs with its expected security-sensitive Phase sub-step.
const TARGETS = [
  {
    file: path.join(PLUGIN_ROOT, 'commands', 'prp-implement.md'),
    phase: '2.5.5',
    expectedPromptPrefix: 'review proposed implementation',
  },
  {
    file: path.join(PLUGIN_ROOT, 'commands', 'pr.md'),
    phase: '2.5.5',
    expectedPromptPrefix: 'review this PR diff against base',
  },
  {
    file: path.join(PLUGIN_ROOT, 'commands', 'code-review.md'),
    phase: '2.5.3',
    expectedPromptPrefix: 'review PR #<NUMBER> against base',
  },
];

// Markdown contract extractor. The plan committed to a two-bullet form:
//   - `subagent_type: "security-reviewer"`
//   - prompt: `"<text>"`
// Both bullets are documented in backticks so authors can copy verbatim.
function extractContract(source) {
  const subagentMatch = source.match(/`subagent_type:\s*"([^"]+)"`/);
  const promptMatch = source.match(/-\s*prompt:\s*`"([^"]+)"`/);
  return {
    subagent_type: subagentMatch ? subagentMatch[1] : null,
    prompt: promptMatch ? promptMatch[1] : null,
  };
}

// Fake Task tool harness. Mirrors the shape the real harness uses to validate
// dispatched calls. The real harness lives in the Claude Code runtime and is
// not invocable from node --test; this fake is intentionally strict so any
// schema drift in the command body surfaces as a test failure.
function fakeTaskTool({ subagent_type, prompt }) {
  if (typeof subagent_type !== 'string' || subagent_type.length === 0) {
    return { ok: false, error: 'subagent_type must be a non-empty string' };
  }
  if (typeof prompt !== 'string' || prompt.length === 0) {
    return { ok: false, error: 'prompt must be a non-empty string' };
  }
  if (subagent_type !== 'security-reviewer') {
    return { ok: false, error: `unknown agent: ${subagent_type}` };
  }
  return {
    ok: true,
    findings: `(fake security review for prompt: ${prompt.slice(0, 40)}...)`,
  };
}

for (const target of TARGETS) {
  const base = path.basename(target.file);

  test(`${base}: canonical contract is extractable from markdown`, () => {
    const source = fs.readFileSync(target.file, 'utf8');
    const contract = extractContract(source);
    assert.ok(
      contract.subagent_type,
      `${base}: subagent_type bullet not parsable from markdown body`,
    );
    assert.ok(
      contract.prompt,
      `${base}: prompt bullet not parsable from markdown body`,
    );
  });

  test(`${base}: contract dispatches against the fake Task tool harness`, () => {
    const source = fs.readFileSync(target.file, 'utf8');
    const contract = extractContract(source);
    const result = fakeTaskTool(contract);
    assert.strictEqual(result.ok, true, `harness rejected: ${result.error}`);
    assert.match(
      result.findings,
      /fake security review/,
      'fake harness should produce findings shape',
    );
  });

  test(`${base}: prompt text starts with expected security-review framing`, () => {
    const source = fs.readFileSync(target.file, 'utf8');
    const contract = extractContract(source);
    assert.ok(
      contract.prompt.startsWith(target.expectedPromptPrefix),
      `${base}: prompt should start with "${target.expectedPromptPrefix}", got "${contract.prompt.slice(0, 60)}..."`,
    );
  });
}

test('fake Task tool harness rejects malformed contracts (sanity)', () => {
  assert.strictEqual(
    fakeTaskTool({ subagent_type: '', prompt: 'x' }).ok,
    false,
    'empty subagent_type must reject',
  );
  assert.strictEqual(
    fakeTaskTool({ subagent_type: 'security-reviewer', prompt: '' }).ok,
    false,
    'empty prompt must reject',
  );
  assert.strictEqual(
    fakeTaskTool({ subagent_type: 'code-reviewer', prompt: 'x' }).ok,
    false,
    'wrong agent name must reject',
  );
  assert.strictEqual(
    fakeTaskTool({ subagent_type: 'security-reviewer', prompt: 'review X' }).ok,
    true,
    'valid contract must accept',
  );
});
