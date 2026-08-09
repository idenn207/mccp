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
  // v1.23.5 G1 — receipt-mode.js is NO LONGER copied in. It used to be, which
  // meant this fixture never exercised the unguarded top-level `require`
  // of receipt-mode: the module was handed to the hook so the defect could not
  // fire. Copying a module in to keep a fixture green is the failure mode this
  // milestone exists to remove. Now only hook-trace is provided.
  //
  // santa-loop R1 (Reviewer B, Test honesty) — this comment used to end with
  // "Intentionally no scripts/receipt/* — validate-cmd require will throw", and
  // that is NO LONGER what happens. Once the core-module guard landed, the hooks
  // return at coreModuleLoadError() (receipt-mode is missing here) BEFORE they
  // ever require validate-cmd. So this fixture now exercises the CORE-module
  // route, and the validate-cmd route it used to cover lost its only test —
  // restored below by makeValidateCmdBrokenRoot(). The assertions here still
  // hold; the description was the stale part.
  return root;
}

// santa-loop R1 (Reviewer B) — restores coverage of the ORIGINAL G1 route: the
// validate-cmd require failing. Gives the hook every core module it needs (so
// coreModuleLoadError passes and cannot short-circuit first) but no
// scripts/receipt tree, so `require(RECEIPT_DIR/validate-cmd)` throws and the
// hook must route THAT through g1Allow.
function makeValidateCmdBrokenRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-g1-vcmd-'));
  copyRuntimeTrees(root, { omit: ['receipt'] });
  return root;
}

// Trees the hooks + receipt modules resolve at runtime. `lib` and `receipt` are
// the obvious ones; `migrations` and `state` are NOT optional —
// validate-cmd.js:90 lazy-requires ../migrations/v0.2.8-generic-receipt-quarantine
// and the receipt tree reaches ../state/{fix-task,state-writer,msw-events,
// evidence-claim}. Both were missing from the first version of this fixture,
// which is why its "every module resolves" claim was false (Reviewer B caught
// migrations; state was found while verifying the report).
const RUNTIME_TREES = ['lib', 'receipt', 'migrations', 'state'];

function copyRuntimeTrees(root, opts) {
  opts = opts || {};
  const omit = opts.omit || [];
  const skipTests = function (src) { return path.basename(src) !== 'tests'; };
  for (const sub of RUNTIME_TREES) {
    if (omit.indexOf(sub) !== -1) continue;
    fs.cpSync(
      path.join(REAL_PLUGIN_ROOT, 'scripts', sub),
      path.join(root, 'scripts', sub),
      { recursive: true, filter: skipTests }
    );
  }
}

// v1.23.5 G1 Task 2 — per-module isolation fixture. Copies the runtime trees
// (minus tests/) so the hook's dependency graph resolves, then removes exactly
// one lib module. That makes the omitted module the SOLE cause of the G1 route —
// without it, an incidental load failure elsewhere would satisfy a
// /ModuleLoadError/ assertion and the test would pass for the wrong reason.
// `omitLibModule === null` builds the positive control (nothing removed).
function makeIsolatedPluginRoot(omitLibModule) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-g1-iso-'));
  copyRuntimeTrees(root);
  if (omitLibModule) {
    const target = path.join(root, 'scripts', 'lib', omitLibModule);
    assert.ok(fs.existsSync(target), 'fixture precondition: ' + omitLibModule + ' must exist before removal');
    fs.rmSync(target);
  }
  return root;
}

function runPromptHook(repo, pluginRoot) {
  return spawnSync(process.execPath, [RECEIPT_PROMPT], {
    cwd: repo,
    input: JSON.stringify({
      command_name: 'mccp:plan',
      command_args: '',
      session_id: 'g1iso',
      tool_use_id: 'g1isotu',
      cwd: repo,
    }),
    encoding: 'utf8',
    timeout: 30000,
    env: Object.assign({}, process.env, {
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      MCCP_RECEIPT_DEBUG: '0',
    }),
  });
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

// ── v1.23.5 G1 Task 2 — per-module isolation (the four unguarded requires) ────
//
// Control first: the isolation fixture with NOTHING removed must NOT produce a
// ModuleLoadError. Without this control, the two omission tests below could pass
// off an unrelated load failure and prove nothing about the guarded modules.

test('G1 isolation control: complete fixture does NOT route to ModuleLoadError', () => {
  const repo = mkTempRepo();
  const root = makeIsolatedPluginRoot(null);
  try {
    // What this control proves, precisely: the complete fixture takes NO
    // ModuleLoadError route, which is the precondition the omission tests below
    // depend on. It is non-vacuous — makeValidateCmdBrokenRoot() differs from
    // this fixture by one tree and DOES trip this assertion (tests 4/5).
    //
    // What it does NOT prove: that every lazily-required dependency resolved.
    // santa-loop R1 (Reviewer B) correctly flagged that the fixture omitted
    // scripts/migrations (validate-cmd.js:90) — and scripts/state was missing too.
    // Both are now copied. But an "assert no load diagnostic" check was tried here
    // and MEASURED to be vacuous: it passes identically on the incomplete and the
    // complete fixture, because those load failures degrade into result.warnings
    // the hook never surfaces. Rather than keep an assertion that cannot fail —
    // the exact defect this milestone exists to remove — the claim is narrowed to
    // what is observable, and RUNTIME_TREES documents the resolution requirement.
    const r = runPromptHook(repo, root);
    assert.strictEqual(r.status, 0, 'control run must exit 0: ' + r.stderr);
    assert.doesNotMatch(
      r.stdout || '', /ModuleLoadError/,
      'complete fixture must not report a module load failure — if it does, the ' +
      'omission tests below prove nothing about the omitted module'
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// santa-loop R1 (Reviewer B, Test honesty) — the validate-cmd load-failure route
// is the ORIGINAL G1 case. Once the core-module guard landed it stopped being
// reachable from makeBrokenPluginRoot (that fixture also lacks receipt-mode, so
// the core guard returns first), leaving the route with no coverage at all. These
// two tests restore it by supplying every core module and removing only the
// receipt tree.

test('receipt-prompt: validate-cmd load failure alone → G1 allows (core modules all present)', () => {
  const repo = mkTempRepo();
  const root = makeValidateCmdBrokenRoot();
  try {
    const r = runPromptHook(repo, root);
    assert.strictEqual(r.status, 0, 'must allow (exit 0): ' + r.stderr);
    const payload = JSON.parse(r.stdout || '{}');
    assert.match(payload.systemMessage || '', /receipt-gate internal error/);
    assert.match(payload.systemMessage || '', /ModuleLoadError/);
    // Proves the core guard did NOT short-circuit: neither core module is named.
    assert.doesNotMatch(payload.systemMessage || '', /receipt-mode:/);
    assert.doesNotMatch(payload.systemMessage || '', /extract-plan-path:/);
    assert.match(payload.hookSpecificOutput.additionalContext, /G1 fail-open/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('receipt-skill: validate-cmd load failure alone → G1 allows (core modules all present)', () => {
  const repo = mkTempRepo();
  const root = makeValidateCmdBrokenRoot();
  try {
    const r = spawnSync(process.execPath, [RECEIPT_SKILL], {
      cwd: repo,
      input: JSON.stringify({
        tool_name: 'Skill',
        tool_input: { name: 'mccp:plan' },
        session_id: 'g1vc2', tool_use_id: 'g1vc2tu', cwd: repo,
      }),
      encoding: 'utf8',
      timeout: 30000,
      env: Object.assign({}, process.env, {
        CLAUDE_PLUGIN_ROOT: root,
        MCCP_RECEIPT_DEBUG: '0',
      }),
    });
    assert.strictEqual(r.status, 0, 'must allow (exit 0), not block (2): ' + r.stderr);
    const payload = JSON.parse(r.stdout || '{}');
    assert.match(payload.systemMessage || '', /Skill receipt-gate internal error/);
    assert.match(payload.systemMessage || '', /ModuleLoadError/);
    assert.doesNotMatch(payload.systemMessage || '', /receipt-mode:/);
    assert.doesNotMatch(payload.systemMessage || '', /extract-plan-path:/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('receipt-prompt: receipt-mode ALONE missing → G1 allows + names receipt-mode', () => {
  const repo = mkTempRepo();
  const root = makeIsolatedPluginRoot('receipt-mode.js');
  try {
    const r = runPromptHook(repo, root);
    assert.strictEqual(r.status, 0, 'must allow (exit 0) when receipt-mode is absent');
    const payload = JSON.parse(r.stdout || '{}');
    assert.match(payload.systemMessage || '', /receipt-gate internal error/);
    assert.match(payload.systemMessage || '', /ModuleLoadError/);
    // Names the actual culprit — proves the route came from THIS module, not a
    // coincidental failure somewhere else in the fixture.
    assert.match(payload.systemMessage || '', /receipt-mode:/);
    assert.match(payload.hookSpecificOutput.additionalContext, /G1 fail-open/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('receipt-prompt: extract-plan-path ALONE missing → G1 allows (never a silent null --plan)', () => {
  const repo = mkTempRepo();
  const root = makeIsolatedPluginRoot('extract-plan-path.js');
  try {
    const r = runPromptHook(repo, root);
    assert.strictEqual(r.status, 0, 'must allow (exit 0) when extract-plan-path is absent');
    const payload = JSON.parse(r.stdout || '{}');
    assert.match(payload.systemMessage || '', /ModuleLoadError/);
    assert.match(payload.systemMessage || '', /extract-plan-path:/);
    // The whole point of routing instead of falling back to null: a null
    // extractor would have let the gate run on with --plan silently dropped.
    assert.doesNotMatch(payload.systemMessage || '', /receipt-mode:/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('receipt-skill: receipt-mode ALONE missing → G1 allows + names receipt-mode', () => {
  const repo = mkTempRepo();
  const root = makeIsolatedPluginRoot('receipt-mode.js');
  try {
    const r = spawnSync(process.execPath, [RECEIPT_SKILL], {
      cwd: repo,
      input: JSON.stringify({
        tool_name: 'Skill',
        tool_input: { name: 'mccp:plan' },
        session_id: 'g1iso2',
        tool_use_id: 'g1isotu2',
        cwd: repo,
      }),
      encoding: 'utf8',
      timeout: 30000,
      env: Object.assign({}, process.env, {
        CLAUDE_PLUGIN_ROOT: root,
        MCCP_RECEIPT_DEBUG: '0',
      }),
    });
    assert.strictEqual(r.status, 0, 'must allow (exit 0), not block (2), on module absence');
    const payload = JSON.parse(r.stdout || '{}');
    assert.match(payload.systemMessage || '', /Skill receipt-gate internal error/);
    assert.match(payload.systemMessage || '', /receipt-mode:/);
    assert.strictEqual(payload.hookSpecificOutput.hookEventName, 'PreToolUse');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('receipt-skill: extract-plan-path ALONE missing → G1 allows (never a silent null --plan)', () => {
  const repo = mkTempRepo();
  const root = makeIsolatedPluginRoot('extract-plan-path.js');
  try {
    const r = spawnSync(process.execPath, [RECEIPT_SKILL], {
      cwd: repo,
      input: JSON.stringify({
        tool_name: 'Skill',
        tool_input: { name: 'mccp:plan' },
        session_id: 'g1iso3',
        tool_use_id: 'g1isotu3',
        cwd: repo,
      }),
      encoding: 'utf8',
      timeout: 30000,
      env: Object.assign({}, process.env, {
        CLAUDE_PLUGIN_ROOT: root,
        MCCP_RECEIPT_DEBUG: '0',
      }),
    });
    assert.strictEqual(r.status, 0);
    const payload = JSON.parse(r.stdout || '{}');
    assert.match(payload.systemMessage || '', /extract-plan-path:/);
    assert.doesNotMatch(payload.systemMessage || '', /receipt-mode:/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
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
