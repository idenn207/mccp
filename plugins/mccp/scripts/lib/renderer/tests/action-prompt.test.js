'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildActionPrompt, rank, maxRank } = require('../parsers/action-prompt');

test('HIGH severity → /codex:rescue', () => {
  const out = buildActionPrompt({ text: 'OQ-a 결정 필요', severity: 'HIGH' }, 'openQuestion');
  assert.equal(out.command, '/codex:rescue');
  assert.equal(out.severity, 'HIGH');
  assert.ok(out.fullText.startsWith('/codex:rescue "'));
});

test('CRITICAL severity → /codex:rescue', () => {
  const out = buildActionPrompt({ text: 'crit', severity: 'CRITICAL' }, 'openQuestion');
  assert.equal(out.command, '/codex:rescue');
});

test('MEDIUM severity → /mccp:plan', () => {
  const out = buildActionPrompt({ text: 'mid', severity: 'MEDIUM' }, 'openQuestion');
  assert.equal(out.command, '/mccp:plan');
});

test('LOW severity → /mccp:plan-prd', () => {
  const out = buildActionPrompt({ text: 'low', severity: 'LOW' }, 'openQuestion');
  assert.equal(out.command, '/mccp:plan-prd');
});

test('unknown severity → /mccp:plan-prd', () => {
  const out = buildActionPrompt({ text: 'unk' }, 'openQuestion');
  assert.equal(out.command, '/mccp:plan-prd');
  assert.equal(out.severity, 'UNKNOWN');
});

test('risk kind embeds mitigation', () => {
  const out = buildActionPrompt(
    { risk: 'data corruption', impact: 'HIGH', likelihood: 'LOW', mitigation: 'fsync + checksum' },
    'risk'
  );
  assert.equal(out.command, '/codex:rescue');
  assert.ok(out.fullText.includes('리스크 완화: data corruption'));
  assert.ok(out.fullText.includes('제안 mitigation: fsync + checksum'));
  assert.equal(out.severity, 'HIGH');
});

test('text containing quotes is escaped + length capped', () => {
  const long = 'a'.repeat(300);
  const out = buildActionPrompt({ text: 'say "hi" — ' + long, severity: 'HIGH' }, 'openQuestion');
  // double quotes inside become \"
  assert.ok(out.fullText.includes('\\"hi\\"'));
  // arg cap (200) applies → fullText contains …
  assert.ok(out.fullText.includes('…'));
});

test('rank / maxRank enum', () => {
  assert.equal(rank('CRITICAL'), 4);
  assert.equal(rank('high'), 3);
  assert.equal(rank(''), 0);
  assert.equal(maxRank('LOW', 'HIGH'), 'HIGH');
  assert.equal(maxRank('CRITICAL', 'MEDIUM'), 'CRITICAL');
});
