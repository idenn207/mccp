'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DICTIONARY,
  expandJargon,
  renderJargonHtml,
  renderJargonMarkdown,
} = require('../parsers/jargon-dictionary');
const { escapeHtml, escapeAttr } = require('../format-utils');

test('gate name single occurrence expand', () => {
  const { expansions } = expandJargon('see mccp-plan-codex for details');
  assert.equal(expansions.length, 1);
  assert.equal(expansions[0].token, 'mccp-plan-codex');
  assert.equal(expansions[0].korean, DICTIONARY['mccp-plan-codex']);
});

test('env var single occurrence expand', () => {
  const { expansions } = expandJargon('set MCCP_GATE_ROUND_CAP=2');
  assert.equal(expansions.length, 1);
  assert.equal(expansions[0].token, 'MCCP_GATE_ROUND_CAP');
});

test('command single occurrence expand', () => {
  const { expansions } = expandJargon('run /mccp:plan-prd to start');
  // /mccp:plan-prd (longer) should win over /mccp:plan (sorted longer-first)
  const tokens = expansions.map(e => e.token);
  assert.ok(tokens.includes('/mccp:plan-prd'));
  // /mccp:plan substring will NOT match because the longer key consumed those bytes
  // first AND first-occurrence-only seen-set prevents re-match. Both are acceptable
  // semantics — verify exactly one expansion in this case.
  assert.equal(expansions.length, 1);
});

test('first-occurrence-only — repeated jargon expanded once', () => {
  const seen = new Set();
  const out1 = renderJargonMarkdown('first MCCP_BRIEFING usage', { seen });
  const out2 = renderJargonMarkdown('second MCCP_BRIEFING usage', { seen });
  assert.ok(out1.includes('MCCP_BRIEFING (LLM briefing stamp 토글)'));
  // second call shares the same seen Set — no expansion
  assert.ok(!out2.includes('(LLM briefing stamp 토글)'));
  assert.ok(out2.includes('MCCP_BRIEFING'));
});

test('non-whitelist token unchanged', () => {
  const { expansions } = expandJargon('FOO_BAR_BAZ is unknown');
  assert.equal(expansions.length, 0);
  const md = renderJargonMarkdown('FOO_BAR_BAZ is unknown');
  assert.equal(md, 'FOO_BAR_BAZ is unknown');
});

test('HTML escape interplay — hostile input safe', () => {
  const hostile = 'MCCP_BRIEFING and <script>alert(1)</script>';
  const html = renderJargonHtml(hostile, {}, escapeHtml, escapeAttr);
  // script tag must be escaped
  assert.ok(html.includes('&lt;script&gt;'));
  // jargon must still be expanded
  assert.ok(html.includes('<abbr title='));
  assert.ok(html.includes('MCCP_BRIEFING</abbr>'));
  // no live script tag
  assert.ok(!html.includes('<script>'));
});
