'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const detector = require('../ultracode-detect');

const DETECT_JS = path.resolve(__dirname, '..', 'ultracode-detect.js');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
// M1 axis A plan is the false-positive fixture — Effort marker absent there.
const FALSE_POSITIVE_FIXTURE = path.join(REPO_ROOT, '.claude', 'PRPs', 'plans', 'archived', 'v1-4-0-m1-deep-research.plan.md');

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-ultracode-detect-'));
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

// === Scenario 1: env override tristate (3 paths) ===

test('S1a: env override "available" → availability=available', () => {
  withEnv({ MCCP_ULTRACODE_FEATURE: 'available' }, () => {
    assert.strictEqual(detector.probeAvailability({}), 'available');
  });
});

test('S1b: env override "missing" → availability=missing', () => {
  withEnv({ MCCP_ULTRACODE_FEATURE: 'missing' }, () => {
    assert.strictEqual(detector.probeAvailability({}), 'missing');
  });
});

test('S1c: env override "unknown" → availability=unknown', () => {
  withEnv({ MCCP_ULTRACODE_FEATURE: 'unknown' }, () => {
    assert.strictEqual(detector.probeAvailability({}), 'unknown');
  });
});

// Build an isolated three-level settings path set inside a temp dir.
function isolatedSettings(dir, contents) {
  const c = contents || {};
  const out = {
    managedPath: path.join(dir, 'managed-settings.json'),
    userPath: path.join(dir, 'user-settings.json'),
    projectPath: path.join(dir, 'project-settings.json'),
  };
  for (const lvl of ['managed', 'user', 'project']) {
    if (c[lvl] !== undefined) {
      fs.writeFileSync(out[lvl + 'Path'], JSON.stringify(c[lvl]), 'utf8');
    }
  }
  return out;
}

test('S1d: no env + no workflow signal → default=unknown (phantom-안내-금지 invariant)', () => {
  withTempDir((dir) => {
    const paths = isolatedSettings(dir, {});
    withEnv({ MCCP_ULTRACODE_FEATURE: undefined, CLAUDE_CODE_DISABLE_WORKFLOWS: undefined }, () => {
      assert.strictEqual(detector.probeAvailability(paths), 'unknown');
    });
  });
});

test('S1e: no env + disableWorkflows:true → missing (shared workflows signal)', () => {
  withTempDir((dir) => {
    const paths = isolatedSettings(dir, { user: { disableWorkflows: true } });
    withEnv({ MCCP_ULTRACODE_FEATURE: undefined, CLAUDE_CODE_DISABLE_WORKFLOWS: undefined }, () => {
      assert.strictEqual(detector.probeAvailability(paths), 'missing');
    });
  });
});

test('S1f: no env + enableWorkflows:true → available (shared workflows signal)', () => {
  withTempDir((dir) => {
    const paths = isolatedSettings(dir, { user: { enableWorkflows: true } });
    withEnv({ MCCP_ULTRACODE_FEATURE: undefined, CLAUDE_CODE_DISABLE_WORKFLOWS: undefined }, () => {
      assert.strictEqual(detector.probeAvailability(paths), 'available');
    });
  });
});

test('S1g: no env + env CLAUDE_CODE_DISABLE_WORKFLOWS=1 → missing', () => {
  withTempDir((dir) => {
    const paths = isolatedSettings(dir, { user: { enableWorkflows: true } });
    withEnv({ MCCP_ULTRACODE_FEATURE: undefined, CLAUDE_CODE_DISABLE_WORKFLOWS: '1' }, () => {
      assert.strictEqual(detector.probeAvailability(paths), 'missing');
    });
  });
});

// === Scenario 2: marker absent — M1 plan fixture → signal=false ===

test('S2: false-positive — M1 axis A plan (no Effort marker) → ultracode_signal=false', () => {
  if (!fs.existsSync(FALSE_POSITIVE_FIXTURE)) {
    return;  // skip if fixture archived differently
  }
  withEnv({ MCCP_ULTRACODE_FEATURE: 'available' }, () => {
    const result = detector.detect({
      mode: 'implement',
      planPath: path.relative(REPO_ROOT, FALSE_POSITIVE_FIXTURE),
      repoRoot: REPO_ROOT,
    });
    assert.strictEqual(result.availability, 'available');
    assert.strictEqual(result.ultracode_signal, false);
    assert.deepStrictEqual(result.signal_tasks, []);
    assert.deepStrictEqual(result.unknown_tiers, []);
    assert.strictEqual(result.reason, 'no-signal');
  });
});

// === Scenario 3: single marker — signal=true, task captured ===

test('S3: single marker in Task 1 body → signal=true, signal_tasks length 1', () => {
  const body = '### Task 1: refactor logger\n\n- **Action**: write code\n- **Effort**: ultracode\n- **Validate**: tests pass\n';
  withEnv({ MCCP_ULTRACODE_FEATURE: 'available' }, () => {
    const result = detector.detect({ mode: 'implement', body: body });
    assert.strictEqual(result.ultracode_signal, true);
    assert.strictEqual(result.signal_tasks.length, 1);
    assert.strictEqual(result.signal_tasks[0].index, 1);
    assert.strictEqual(result.signal_tasks[0].name, 'refactor logger');
    assert.strictEqual(result.signal_tasks[0].line, 4);
    assert.strictEqual(result.reason, 'ok');
  });
});

// === Scenario 4: multiple markers — signal_tasks length 2 with correct indexes ===

test('S4: multiple markers (Task 1 + Task 3) → signal_tasks length 2, indexes correct', () => {
  const body =
    '### Task 1: alpha\n\n- **Effort**: ultracode\n\n' +
    '### Task 2: beta\n\n- **Action**: normal flow\n\n' +
    '### Task 3: gamma\n\n- **Effort**: ultracode\n';
  withEnv({ MCCP_ULTRACODE_FEATURE: 'available' }, () => {
    const result = detector.detect({ mode: 'implement', body: body });
    assert.strictEqual(result.signal_tasks.length, 2);
    assert.strictEqual(result.signal_tasks[0].index, 1);
    assert.strictEqual(result.signal_tasks[0].name, 'alpha');
    assert.strictEqual(result.signal_tasks[1].index, 3);
    assert.strictEqual(result.signal_tasks[1].name, 'gamma');
  });
});

// === Scenario 5: marker regex boundary (case sensitive, asterisks strict) ===

test('S5a: lowercase **effort** → match (regex is case-sensitive on tier value, not field name)', () => {
  // Regex is `\*\*Effort\*\*` literal — lowercase **effort** must NOT match.
  const body = '### Task 1: x\n\n- **effort**: ultracode\n';
  withEnv({ MCCP_ULTRACODE_FEATURE: 'available' }, () => {
    const result = detector.detect({ mode: 'implement', body: body });
    assert.strictEqual(result.ultracode_signal, false);
  });
});

test('S5b: Effort without asterisks → no match', () => {
  const body = '### Task 1: x\n\nEffort: ultracode\n';
  withEnv({ MCCP_ULTRACODE_FEATURE: 'available' }, () => {
    const result = detector.detect({ mode: 'implement', body: body });
    assert.strictEqual(result.ultracode_signal, false);
  });
});

test('S5c: trailing whitespace tolerated', () => {
  const body = '### Task 1: x\n\n- **Effort**: ultracode   \n';
  withEnv({ MCCP_ULTRACODE_FEATURE: 'available' }, () => {
    const result = detector.detect({ mode: 'implement', body: body });
    assert.strictEqual(result.ultracode_signal, true);
  });
});

// === Scenario 6: marker present but no task heading above → orphan, skip silently ===

test('S6: marker without task heading above → skip (orphan, no entry)', () => {
  const body = '# Top-level\n\nSome prose.\n\n- **Effort**: ultracode\n';
  withEnv({ MCCP_ULTRACODE_FEATURE: 'available' }, () => {
    const result = detector.detect({ mode: 'implement', body: body });
    assert.strictEqual(result.ultracode_signal, false);
    assert.deepStrictEqual(result.signal_tasks, []);
  });
});

// === Scenario 7: path traversal ===

test('S7a: relative path traversal → reason=path-traversal', () => {
  withTempDir((dir) => {
    withEnv({ MCCP_ULTRACODE_FEATURE: 'available' }, () => {
      const result = detector.detect({
        mode: 'implement',
        planPath: '../../../etc/passwd',
        repoRoot: dir,
      });
      assert.strictEqual(result.reason, 'path-traversal');
      assert.strictEqual(result.ultracode_signal, false);
    });
  });
});

test('S7b: absolute path outside repo → reason=path-traversal', () => {
  withTempDir((dir) => {
    withTempDir((outsideDir) => {
      const outside = path.join(outsideDir, 'evil.md');
      fs.writeFileSync(outside, '### Task 1: x\n- **Effort**: ultracode\n', 'utf8');
      withEnv({ MCCP_ULTRACODE_FEATURE: 'available' }, () => {
        const result = detector.detect({
          mode: 'implement',
          planPath: outside,
          repoRoot: dir,
        });
        assert.strictEqual(result.reason, 'path-traversal');
      });
    });
  });
});

// === Scenario 8: mode-mismatch (only implement supported in M2) ===

test('S8a: mode=prd → mode-mismatch', () => {
  const result = detector.detect({ mode: 'prd' });
  assert.strictEqual(result.reason, 'mode-mismatch');
  assert.strictEqual(result.mode, null);
});

test('S8b: mode=plan → mode-mismatch', () => {
  const result = detector.detect({ mode: 'plan' });
  assert.strictEqual(result.reason, 'mode-mismatch');
});

test('S8c: missing mode → mode-mismatch', () => {
  const result = detector.detect({});
  assert.strictEqual(result.reason, 'mode-mismatch');
});

// === Scenario 9: env override beats settings signal ===

test('S9: env override "missing" beats enableWorkflows settings signal', () => {
  withTempDir((dir) => {
    const paths = isolatedSettings(dir, { user: { enableWorkflows: true } });
    withEnv({ MCCP_ULTRACODE_FEATURE: 'missing', CLAUDE_CODE_DISABLE_WORKFLOWS: undefined }, () => {
      assert.strictEqual(detector.probeAvailability(paths), 'missing');
    });
  });
});

// === Scenario 10: plan file missing → loud fail-open ===

test('S10: plan file does not exist → reason=plan-missing, exit 0 semantics', () => {
  withTempDir((dir) => {
    withEnv({ MCCP_ULTRACODE_FEATURE: 'available' }, () => {
      const result = detector.detect({
        mode: 'implement',
        planPath: 'definitely-does-not-exist.md',
        repoRoot: dir,
      });
      assert.strictEqual(result.reason, 'plan-missing');
      assert.strictEqual(result.ultracode_signal, false);
    });
  });
});

// === F5 absorption: unknown tier explicit reject + warn ===

test('S11a: unknown Effort tier "ultraplan" → reason=unknown-effort-tier + unknown_tiers populated', () => {
  const body = '### Task 1: x\n\n- **Effort**: ultraplan\n';
  withEnv({ MCCP_ULTRACODE_FEATURE: 'available' }, () => {
    const result = detector.detect({ mode: 'implement', body: body });
    assert.strictEqual(result.ultracode_signal, false);
    assert.strictEqual(result.unknown_tiers.length, 1);
    assert.strictEqual(result.unknown_tiers[0].tier, 'ultraplan');
    assert.strictEqual(result.reason, 'unknown-effort-tier');
  });
});

test('S11b: mixed known + unknown — known wins for signal, unknown still surfaced', () => {
  const body =
    '### Task 1: alpha\n- **Effort**: ultracode\n\n' +
    '### Task 2: beta\n- **Effort**: ultraplan\n';
  withEnv({ MCCP_ULTRACODE_FEATURE: 'available' }, () => {
    const result = detector.detect({ mode: 'implement', body: body });
    assert.strictEqual(result.ultracode_signal, true);
    assert.strictEqual(result.signal_tasks.length, 1);
    assert.strictEqual(result.unknown_tiers.length, 1);
    assert.strictEqual(result.reason, 'ok');  // ok wins when at least 1 known signal
  });
});

test('S11c: unknown tier stderr warn surfaced via CLI', () => {
  const body = '### Task 1: x\n\n- **Effort**: ultraplan\n';
  const result = spawnSync('node', [DETECT_JS, 'detect', '--mode', 'implement', '--stdin', '--json'], {
    input: body,
    encoding: 'utf8',
    env: Object.assign({}, process.env, { MCCP_ULTRACODE_FEATURE: 'available' }),
  });
  assert.strictEqual(result.status, 0);
  assert.match(result.stderr, /unknown Effort tier "ultraplan"/);
  const parsed = JSON.parse(result.stdout);
  assert.strictEqual(parsed.reason, 'unknown-effort-tier');
});

// === --stdin CLI smoke ===

test('CLI smoke: --stdin pipe with marker → JSON output with signal=true', () => {
  const body = '### Task 1: alpha\n- **Effort**: ultracode\n';
  const result = spawnSync('node', [DETECT_JS, 'detect', '--mode', 'implement', '--stdin', '--json'], {
    input: body,
    encoding: 'utf8',
    env: Object.assign({}, process.env, { MCCP_ULTRACODE_FEATURE: 'available' }),
  });
  assert.strictEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.strictEqual(parsed.ultracode_signal, true);
  assert.strictEqual(parsed.signal_tasks.length, 1);
});
