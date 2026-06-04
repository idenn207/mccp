'use strict';

// Codex Round 1 finding #1 (HIGH, conf 0.86) — session-start-bootstrap.js used
// to unconditionally append `\n<system-reminder>...` after the child stdout.
// When stdout was a JSON hook payload, the combined output
// `{json}\n<system-reminder>...` was invalid and Claude Code silently dropped
// the whole SessionStart payload — losing prior-session context AND the L2c
// reminder it was meant to surface (self-defeating).
//
// Fix: mergeL2c parses stdout; when JSON, it injects `extra` into
// `hookSpecificOutput.additionalContext` so the output stays a single valid
// JSON document. Text/empty stdout falls back to the original append behavior.

const test = require('node:test');
const assert = require('node:assert');

const { mergeL2c } = require('../merge-l2c');

const RAW = '{"hook_event_name":"SessionStart","session_id":"s1","cwd":"/r"}';
const EXTRA = '<system-reminder>\n[mccp:capabilities] {...}\n</system-reminder>';

test('mergeL2c: no extra → passthrough stdout', () => {
  const out = mergeL2c('hello world', RAW, '');
  assert.strictEqual(out, 'hello world');
});

test('mergeL2c: no extra + empty stdout → passthrough raw', () => {
  const out = mergeL2c('', RAW, '');
  assert.strictEqual(out, RAW);
});

test('mergeL2c: JSON stdout → extra merged into hookSpecificOutput.additionalContext', () => {
  const childJson = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: 'pre-existing prior-session injection',
    },
    continue: true,
  });
  const out = mergeL2c(childJson, RAW, EXTRA);
  // Output must remain a single valid JSON document
  const parsed = JSON.parse(out);
  assert.ok(parsed.hookSpecificOutput, 'hookSpecificOutput preserved');
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.ok(parsed.hookSpecificOutput.additionalContext.includes('pre-existing prior-session injection'),
    'existing additionalContext preserved');
  assert.ok(parsed.hookSpecificOutput.additionalContext.includes('[mccp:capabilities]'),
    'L2c extra appended');
  assert.strictEqual(parsed.continue, true, 'other top-level fields preserved');
});

test('mergeL2c: JSON stdout without hookSpecificOutput → field created and extra inserted', () => {
  const childJson = JSON.stringify({ continue: true });
  const out = mergeL2c(childJson, RAW, EXTRA);
  const parsed = JSON.parse(out);
  assert.ok(parsed.hookSpecificOutput, 'hookSpecificOutput field created');
  assert.strictEqual(parsed.hookSpecificOutput.additionalContext, EXTRA);
  assert.strictEqual(parsed.continue, true);
});

test('mergeL2c: JSON stdout with non-object hookSpecificOutput → safely overwritten', () => {
  // Defensive — if the child somehow emits a primitive in that slot, the merge
  // must not crash. Overwriting is acceptable (preserves valid JSON shape).
  const childJson = JSON.stringify({ hookSpecificOutput: 'oops' });
  const out = mergeL2c(childJson, RAW, EXTRA);
  const parsed = JSON.parse(out);
  assert.strictEqual(typeof parsed.hookSpecificOutput, 'object');
  assert.strictEqual(parsed.hookSpecificOutput.additionalContext, EXTRA);
});

test('mergeL2c: text stdout (non-JSON) → extra appended as separate paragraph', () => {
  const out = mergeL2c('plain text output', RAW, EXTRA);
  // Must NOT be JSON; original text + extra both present
  assert.throws(() => JSON.parse(out), 'output remains text, not JSON-wrapped');
  assert.ok(out.startsWith('plain text output'));
  assert.ok(out.includes(EXTRA));
});

test('mergeL2c: empty stdout + extra → raw passthrough then extra', () => {
  const out = mergeL2c('', RAW, EXTRA);
  assert.ok(out.startsWith(RAW), 'raw event JSON passes through first');
  assert.ok(out.includes(EXTRA), 'extra trails after');
});

test('mergeL2c: JSON-array stdout (not object) → treated as non-JSON, text-appended', () => {
  // Arrays shouldn't be treated as hook payloads — fall through to text mode.
  const childJson = JSON.stringify([1, 2, 3]);
  const out = mergeL2c(childJson, RAW, EXTRA);
  // The text mode would append extra; the array string must be preserved.
  assert.ok(out.startsWith('[1,2,3]'));
  assert.ok(out.includes(EXTRA));
});

test('mergeL2c: regression — final output is single valid JSON when child is JSON', () => {
  // This is the exact regression scenario from the Codex finding.
  const childJson = '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"prior context"}}';
  const out = mergeL2c(childJson, RAW, EXTRA);
  // No newline between } and <system-reminder> — must be parseable as ONE JSON
  let parsed;
  assert.doesNotThrow(() => { parsed = JSON.parse(out); },
    'combined output must be a single valid JSON document');
  assert.ok(parsed.hookSpecificOutput.additionalContext.includes('[mccp:capabilities]'));
});
