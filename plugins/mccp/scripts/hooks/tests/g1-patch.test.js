'use strict';

// G1 patch integration — module load error + decision eval error must
// surface a systemMessage and allow the operation through.
// Covers receipt-prompt.js (UserPromptExpansion) and receipt-skill.js
// (PreToolUse Skill).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REAL_PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');
const RECEIPT_PROMPT = path.join(REAL_PLUGIN_ROOT, 'scripts', 'hooks', 'receipt-prompt.js');
const RECEIPT_SKILL = path.join(REAL_PLUGIN_ROOT, 'scripts', 'hooks', 'receipt-skill.js');

function mkTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-g1-'));
}

function makeBrokenPluginRoot() {
  // hook-trace lives in <root>/scripts/lib, so we point CLAUDE_PLUGIN_ROOT at a
  // skeleton that has hook-trace.js but NO receipt/ tree → validate-cmd require
  // fails, triggering G1 path.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-g1-broken-root-'));
  const libDir = path.join(root, 'scripts', 'lib');
  fs.mkdirSync(libDir, { recursive: true });
  fs.copyFileSync(
    path.join(REAL_PLUGIN_ROOT, 'scripts', 'lib', 'hook-trace.js'),
    path.join(libDir, 'hook-trace.js')
  );
  fs.copyFileSync(
    path.join(REAL_PLUGIN_ROOT, 'scripts', 'lib', 'receipt-mode.js'),
    path.join(libDir, 'receipt-mode.js')
  );
  // Intentionally no scripts/receipt/* — validate-cmd require will throw.
  return root;
}

test('receipt-prompt: module-load error emits systemMessage + allows (G1)', () => {
  const repo = mkTempRepo();
  const brokenRoot = makeBrokenPluginRoot();
  try {
    const r = spawnSync(process.execPath, [RECEIPT_PROMPT], {
      cwd: repo,
      input: JSON.stringify({
        command_name: 'mccp:plan',
        command_args: '',
        session_id: 'g1sess',
        tool_use_id: 'g1tu',
        cwd: repo,
      }),
      encoding: 'utf8',
      timeout: 15000,
      env: Object.assign({}, process.env, {
        CLAUDE_PLUGIN_ROOT: brokenRoot,
        MCCP_RECEIPT_DEBUG: '0',
      }),
    });
    assert.strictEqual(r.status, 0, 'must allow (exit 0) on internal error');
    const payload = JSON.parse(r.stdout || '{}');
    assert.match(payload.systemMessage || '', /receipt-gate internal error/);
    assert.match(payload.systemMessage || '', /ModuleLoadError/);
    assert.strictEqual(payload.hookSpecificOutput.hookEventName, 'UserPromptExpansion');
    assert.match(payload.hookSpecificOutput.additionalContext, /G1 fail-open/);
    // L1 shard should exist because we provided session_id + tool_use_id
    const shardDir = path.join(repo, '.claude', 'state', 'hook-trace', 'g1sess');
    assert.ok(fs.existsSync(shardDir), 'L1 shard dir should exist');
    const files = fs.readdirSync(shardDir);
    assert.ok(files.length >= 1, 'at least one shard file written');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(brokenRoot, { recursive: true, force: true });
  }
});

test('receipt-skill: module-load error emits systemMessage + allows (G1)', () => {
  const repo = mkTempRepo();
  const brokenRoot = makeBrokenPluginRoot();
  try {
    const r = spawnSync(process.execPath, [RECEIPT_SKILL], {
      cwd: repo,
      input: JSON.stringify({
        tool_name: 'Skill',
        tool_input: { name: 'mccp:plan' },
        session_id: 'g1sess2',
        tool_use_id: 'g1tu2',
        cwd: repo,
      }),
      encoding: 'utf8',
      timeout: 15000,
      env: Object.assign({}, process.env, {
        CLAUDE_PLUGIN_ROOT: brokenRoot,
        MCCP_RECEIPT_DEBUG: '0',
      }),
    });
    assert.strictEqual(r.status, 0, 'must allow (exit 0) on internal error');
    const payload = JSON.parse(r.stdout || '{}');
    assert.match(payload.systemMessage || '', /Skill receipt-gate internal error/);
    assert.match(payload.systemMessage || '', /ModuleLoadError/);
    assert.strictEqual(payload.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.match(payload.hookSpecificOutput.additionalContext, /G1 fail-open/);
    // L1 shard should exist (phase = PreToolUseSkill)
    const shardDir = path.join(repo, '.claude', 'state', 'hook-trace', 'g1sess2');
    assert.ok(fs.existsSync(shardDir));
    const files = fs.readdirSync(shardDir);
    const shard = files.find(n => n.includes('PreToolUseSkill'));
    assert.ok(shard, 'PreToolUseSkill shard should exist');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(brokenRoot, { recursive: true, force: true });
  }
});

test('receipt-prompt: no session_id → G1 allows + emits systemMessage without trace path', () => {
  const repo = mkTempRepo();
  const brokenRoot = makeBrokenPluginRoot();
  try {
    const r = spawnSync(process.execPath, [RECEIPT_PROMPT], {
      cwd: repo,
      input: JSON.stringify({
        command_name: 'mccp:plan',
        command_args: '',
        cwd: repo,
      }),
      encoding: 'utf8',
      timeout: 15000,
      env: Object.assign({}, process.env, {
        CLAUDE_PLUGIN_ROOT: brokenRoot,
        MCCP_RECEIPT_DEBUG: '0',
      }),
    });
    assert.strictEqual(r.status, 0);
    const payload = JSON.parse(r.stdout || '{}');
    assert.match(payload.systemMessage || '', /receipt-gate internal error/);
    assert.doesNotMatch(payload.systemMessage || '', /\n  trace: /);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(brokenRoot, { recursive: true, force: true });
  }
});
