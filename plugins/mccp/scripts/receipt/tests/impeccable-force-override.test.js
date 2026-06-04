'use strict';

// Milestone 1 Task 1.6 — MCCP_FORCE_PR_WITHOUT_IMPECCABLE audited escape.
//
// Codex R1 F4 + security-reviewer F-Sec-1 absorption: impeccable namespace
// uses strict reason validator. v0.2.4 security namespace was warning-only;
// v0.2.5 impeccable namespace REJECTS bad reasons at schema time. Force-
// override requires substantive reason (≥30 chars, ≥3 words, no placeholder/
// URL-only/1-token banlist).
//
// 10 test cases:
//   - 3 positive (substantive reasons that pass)
//   - 7 REJECT (empty / whitespace / 1-token / URL-only / under-30-chars /
//               placeholder × 2)

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write } = require('../write');
const { validateCommand } = require('../validate-cmd');

function setupRepo() {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/feature-x.plan.md', '# feature x\n\nbody\n');
  return { repo, plan, planRel: path.relative(repo, plan) };
}

function tryWrite(repo, planRel, reason) {
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    return write({
      gate: 'mccp-pr-codex',
      decision: 'feature-x',
      plan: planRel,
      'impeccable-force-override': true,
      'impeccable-force-override-reason': reason,
    });
  } finally {
    process.chdir(cwd);
  }
}

// === 3 POSITIVE — substantive reasons accepted ===

test('impeccable force_override accepts substantive reason (action + target + duration)', () => {
  const { repo, planRel } = setupRepo();
  const reason = 'Skipping impeccable design review because the impeccable Skill is not registered in this environment and CI cannot install it before the 5pm release window today';
  const r = tryWrite(repo, planRel, reason);
  assert.strictEqual(r.receipt.meta.impeccable_force_override, true);
  assert.strictEqual(r.receipt.meta.impeccable_force_override_reason, reason);
});

test('impeccable force_override accepts reason referencing incident ticket', () => {
  const { repo, planRel } = setupRepo();
  const reason = 'Override pending INCIDENT-2026-06-04 because impeccable Skill registry probe returns false in this sandbox; team approved bypass';
  const r = tryWrite(repo, planRel, reason);
  assert.strictEqual(r.receipt.meta.impeccable_force_override, true);
});

test('impeccable force_override accepts reason at exactly 30 chars (boundary)', () => {
  const { repo, planRel } = setupRepo();
  const reason = 'Bypass impeccable for retire-job'; // 32 chars, 4 words
  const r = tryWrite(repo, planRel, reason);
  assert.strictEqual(r.receipt.meta.impeccable_force_override, true);
});

// === 7 REJECT ===

function expectReject(reason, expectedCode) {
  const { repo, planRel } = setupRepo();
  let thrown = null;
  try {
    tryWrite(repo, planRel, reason);
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown, 'expected schema reject for reason: ' + JSON.stringify(reason));
  assert.strictEqual(thrown.code, 'SCHEMA_INVALID');
  const joined = (thrown.errors || []).join(' ');
  assert.ok(new RegExp(expectedCode).test(joined),
    'expected ' + expectedCode + ' in errors, got: ' + joined);
}

test('REJECT: empty string reason (coerced to reason-required via write.js || null)', () => {
  expectReject('', 'reason-required');
});

test('REJECT: whitespace-only reason', () => {
  expectReject('       \t  \n  ', 'reason-empty');
});

test('REJECT: 1-token banlist (yes)', () => {
  expectReject('yes', 'reason-banlist-token');
});

test('REJECT: 1-token banlist (ok)', () => {
  expectReject('ok', 'reason-banlist-token');
});

test('REJECT: URL-only reason', () => {
  expectReject('https://example.com/some/path/to/issue/123', 'reason-url-only');
});

test('REJECT: under 30 chars (29 chars)', () => {
  expectReject('Short bypass for now today.x', 'reason-too-short');
});

test('REJECT: placeholder content (lorem ipsum)', () => {
  expectReject('lorem ipsum dolor sit amet consectetur adipisicing elit sed do', 'reason-placeholder');
});

// === validate-cmd surfaces force_override as warning (audit) ===

test('validate-cmd surfaces impeccable_force_override as warning (audited escape)', () => {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    write({
      gate: 'mccp-implement-codex',
      decision: 'feature-x',
      plan: planRel,
      'impeccable-force-override': true,
      'impeccable-force-override-reason': 'Bypass impeccable because Skill registry probe returns missing in build agent containers used by release pipeline',
    });
    const r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
    // force_override is warning, not blocking — PR proceeds with audit trail
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    const warning = r.warnings.find((w) => /impeccable_force_override|MCCP_FORCE_PR_WITHOUT_IMPECCABLE/.test(w.reason));
    assert.ok(warning, 'force_override should surface as audit warning');
    assert.ok(typeof warning.impeccable_force_override_reason === 'string');
  } finally {
    process.chdir(cwd);
  }
});
