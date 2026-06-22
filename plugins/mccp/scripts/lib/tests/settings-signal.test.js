'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const signal = require('../settings-signal');

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-settings-signal-'));
  try { return fn(dir); }
  finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) {} }
}

function withEnv(overrides, fn) {
  const saved = {};
  for (const k of Object.keys(overrides)) {
    saved[k] = process.env[k];
    if (overrides[k] === undefined) delete process.env[k];
    else process.env[k] = overrides[k];
  }
  try { return fn(); }
  finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

// Build an isolated three-level path set inside a temp dir. Any level whose
// content is provided gets a file written; the rest point at nonexistent paths
// so the real ~/.claude / OS managed settings are never consulted.
function isolatedPaths(dir, contents) {
  const c = contents || {};
  const out = {
    managedPath: path.join(dir, 'managed-settings.json'),
    userPath: path.join(dir, 'user-settings.json'),
    projectPath: path.join(dir, 'project-settings.json'),
  };
  if (c.managed !== undefined) {
    fs.writeFileSync(out.managedPath, typeof c.managed === 'string' ? c.managed : JSON.stringify(c.managed), 'utf8');
  }
  if (c.user !== undefined) {
    fs.writeFileSync(out.userPath, typeof c.user === 'string' ? c.user : JSON.stringify(c.user), 'utf8');
  }
  if (c.project !== undefined) {
    fs.writeFileSync(out.projectPath, typeof c.project === 'string' ? c.project : JSON.stringify(c.project), 'utf8');
  }
  return out;
}

// Run with CLAUDE_CODE_DISABLE_WORKFLOWS cleared so the host environment cannot
// leak into workflow-signal assertions.
function withCleanWorkflowEnv(fn) {
  return withEnv({ CLAUDE_CODE_DISABLE_WORKFLOWS: undefined }, fn);
}

// === readMergedSettings: precedence + absence + parse failure ===

test('M1: precedence project > user > managed for a scalar key', () => {
  withTempDir((dir) => {
    const p = isolatedPaths(dir, {
      managed: { k: 'managed' },
      user: { k: 'user' },
      project: { k: 'project' },
    });
    const read = signal.readMergedSettings(p);
    assert.strictEqual(read.merged.k, 'project');
  });
});

test('M2: user overrides managed when project absent', () => {
  withTempDir((dir) => {
    const p = isolatedPaths(dir, { managed: { k: 'managed' }, user: { k: 'user' } });
    const read = signal.readMergedSettings(p);
    assert.strictEqual(read.merged.k, 'user');
  });
});

test('M3: all levels absent → merged is empty, all levels present=false readable=true', () => {
  withTempDir((dir) => {
    const p = isolatedPaths(dir, {});
    const read = signal.readMergedSettings(p);
    assert.deepStrictEqual(read.merged, {});
    assert.strictEqual(read.levels.managed.present, false);
    assert.strictEqual(read.levels.user.present, false);
    assert.strictEqual(read.levels.project.present, false);
    assert.strictEqual(read.levels.managed.readable, true);
  });
});

test('M4: parse failure at user level → level unreadable, merged excludes it (loud)', () => {
  withTempDir((dir) => {
    const p = isolatedPaths(dir, { managed: { k: 'managed' }, user: '{ not valid json', project: undefined });
    const read = signal.readMergedSettings(p);
    assert.strictEqual(read.levels.user.present, true);
    assert.strictEqual(read.levels.user.readable, false);
    // merged falls back to managed value since user level was unreadable
    assert.strictEqual(read.merged.k, 'managed');
  });
});

// === workflowsEnabled tristate ===

test('W1: env CLAUDE_CODE_DISABLE_WORKFLOWS=1 → missing (beats settings)', () => {
  withTempDir((dir) => {
    const p = isolatedPaths(dir, { user: { enableWorkflows: true } });
    withEnv({ CLAUDE_CODE_DISABLE_WORKFLOWS: '1' }, () => {
      assert.strictEqual(signal.workflowsEnabled(p), 'missing');
    });
  });
});

test('W2: disableWorkflows:true at user → missing', () => {
  withTempDir((dir) => {
    const p = isolatedPaths(dir, { user: { disableWorkflows: true } });
    withCleanWorkflowEnv(() => {
      assert.strictEqual(signal.workflowsEnabled(p), 'missing');
    });
  });
});

test('W3: disableWorkflows:true at managed → missing', () => {
  withTempDir((dir) => {
    const p = isolatedPaths(dir, { managed: { disableWorkflows: true } });
    withCleanWorkflowEnv(() => {
      assert.strictEqual(signal.workflowsEnabled(p), 'missing');
    });
  });
});

test('W4: enableWorkflows:true at user, no disable → available', () => {
  withTempDir((dir) => {
    const p = isolatedPaths(dir, { user: { enableWorkflows: true } });
    withCleanWorkflowEnv(() => {
      assert.strictEqual(signal.workflowsEnabled(p), 'available');
    });
  });
});

test('W5: no workflow signal anywhere → unknown (phantom guidance prevention)', () => {
  withTempDir((dir) => {
    const p = isolatedPaths(dir, { user: { unrelated: true } });
    withCleanWorkflowEnv(() => {
      assert.strictEqual(signal.workflowsEnabled(p), 'unknown');
    });
  });
});

test('W6: disable at project beats enable at managed → missing', () => {
  withTempDir((dir) => {
    const p = isolatedPaths(dir, {
      managed: { enableWorkflows: true },
      project: { disableWorkflows: true },
    });
    withCleanWorkflowEnv(() => {
      assert.strictEqual(signal.workflowsEnabled(p), 'missing');
    });
  });
});

// === hooksGoalEnabled tristate (F1+F3 absorption) ===

test('G1: no hook-disable signal, managed absent → available (goal default-on)', () => {
  withTempDir((dir) => {
    const p = isolatedPaths(dir, { user: { unrelated: true } });
    assert.strictEqual(signal.hooksGoalEnabled(p), 'available');
  });
});

test('G2: disableAllHooks:true at user → missing', () => {
  withTempDir((dir) => {
    const p = isolatedPaths(dir, { user: { disableAllHooks: true } });
    assert.strictEqual(signal.hooksGoalEnabled(p), 'missing');
  });
});

test('G3: allowManagedHooksOnly:true at managed → missing', () => {
  withTempDir((dir) => {
    const p = isolatedPaths(dir, { managed: { allowManagedHooksOnly: true } });
    assert.strictEqual(signal.hooksGoalEnabled(p), 'missing');
  });
});

test('G4: managed present but unreadable → unknown (policy unconfirmed downgrade)', () => {
  withTempDir((dir) => {
    const p = isolatedPaths(dir, { managed: '{ broken json' });
    assert.strictEqual(signal.hooksGoalEnabled(p), 'unknown');
  });
});

test('G5: managed present + readable + no disable → available', () => {
  withTempDir((dir) => {
    const p = isolatedPaths(dir, { managed: { someManagedKey: 'x' } });
    assert.strictEqual(signal.hooksGoalEnabled(p), 'available');
  });
});

test('G6: disableAllHooks:true at managed → missing (managed policy honored)', () => {
  withTempDir((dir) => {
    const p = isolatedPaths(dir, { managed: { disableAllHooks: true } });
    assert.strictEqual(signal.hooksGoalEnabled(p), 'missing');
  });
});

// === managedSettingsPath OS mapping ===

test('P1: managedSettingsPath returns a non-empty platform string', () => {
  const mp = signal.managedSettingsPath();
  assert.ok(typeof mp === 'string' && mp.length > 0);
  assert.ok(Object.values(signal.MANAGED_SETTINGS_PATHS).includes(mp));
});
