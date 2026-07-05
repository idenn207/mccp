'use strict';

// plan-fanout Task 1 validate — perspective catalogue integrity + read-only
// prompt phrasing. Codex F1: assert every perspective maps to a dedicated
// read-only fanout-* agent, never a write-capable agent.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PERSPECTIVES,
  PERSPECTIVE_SCHEMA,
  findPerspective,
  buildPerspectivePrompt,
} = require('../perspectives');

test('catalogue has exactly the 4 M1 perspectives', function () {
  assert.equal(PERSPECTIVES.length, 4);
  const keys = PERSPECTIVES.map(function (p) { return p.key; });
  assert.deepEqual(keys, ['architect', 'security', 'test', 'explorer']);
});

test('every agentType is a dedicated read-only fanout-* agent (Codex F1)', function () {
  // Positive whitelist: the ONLY legal agentTypes are the four dedicated
  // read-only fanout-* agents. This rejects any bare write-capable agent
  // (mccp:security-reviewer, mccp:tdd-guide, mccp:architect, …) by construction.
  PERSPECTIVES.forEach(function (p) {
    assert.match(p.agentType, /^mccp:fanout-(architect|security|test|explorer)$/,
      p.key + ' must route to a dedicated read-only mccp:fanout-* agent');
  });
});

test('catalogue + perspective entries are frozen', function () {
  assert.ok(Object.isFrozen(PERSPECTIVES));
  PERSPECTIVES.forEach(function (p) { assert.ok(Object.isFrozen(p)); });
});

test('every prompt states the read-only + propose-only mandate', function () {
  PERSPECTIVES.forEach(function (p) {
    const prompt = buildPerspectivePrompt({ perspective: p, prdPath: 'x.prd.md', planPath: 'y.plan.md' });
    assert.match(prompt, /Read, Grep, Glob ONLY/, p.key + ' prompt missing read-only tool statement');
    assert.match(prompt, /CANNOT edit files or run commands/, p.key + ' prompt missing no-edit statement');
    assert.match(prompt, /Do NOT propose file edits/, p.key + ' prompt missing propose-only statement');
    assert.ok(prompt.indexOf(p.lens) !== -1, p.key + ' prompt missing its lens');
  });
});

test('prompt binds the concrete PRD + plan paths', function () {
  const prompt = buildPerspectivePrompt({
    perspective: findPerspective('security'),
    prdPath: '.claude/prds/foo.prd.md',
    planPath: '.claude/plans/foo.plan.md',
  });
  assert.match(prompt, /\.claude\/prds\/foo\.prd\.md/);
  assert.match(prompt, /\.claude\/plans\/foo\.plan\.md/);
});

test('buildPerspectivePrompt throws on malformed perspective', function () {
  assert.throws(function () { buildPerspectivePrompt({ perspective: {} }); });
  assert.throws(function () { buildPerspectivePrompt({}); });
});

test('findPerspective returns entry or null', function () {
  assert.equal(findPerspective('architect').key, 'architect');
  assert.equal(findPerspective('nope'), null);
});

test('PERSPECTIVE_SCHEMA is a closed object schema with severity enum', function () {
  assert.equal(PERSPECTIVE_SCHEMA.type, 'object');
  assert.equal(PERSPECTIVE_SCHEMA.additionalProperties, false);
  const sev = PERSPECTIVE_SCHEMA.properties.findings.items.properties.severity;
  assert.deepEqual(sev.enum, ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
});
