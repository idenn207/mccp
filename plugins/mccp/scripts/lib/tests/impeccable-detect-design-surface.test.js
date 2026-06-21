'use strict';

// v1.3.0 M1 design-gate enforcement — regression fixtures.
//
// Fixture A: DESIGN_SURFACE_PATHS hit on a .js file (diff mode + artifact mode)
//            — wedge sees its own surface (Codex R1 F1 absorption: plan-mode
//            detection mirrors diff-mode coverage).
// Fixture B: silent_skip=true when SKILL_AVAIL=1 + SIGNAL=0 — the silent
//            fall-through is now an observable receipt artifact (Task 2).
// Fixture C: Overshoot safety margin — state-writer.js (no design surface
//            relationship) returns signal=false even though it lives under
//            plugins/mccp/scripts/. Risk-table "detector overshoot" hedge.
// Fixture D: Cache target diff — .claude/cache/STATUS.md and status.html
//            trigger signal=true via DESIGN_SURFACE_PATHS exact match
//            (Codex R1 F3 absorption: status.html lifecycle whole-coverage).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const detector = require('../impeccable-detect');

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-design-surface-'));
  try {
    return fn(dir);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) {}
  }
}

function withEnv(overrides, fn) {
  const saved = {};
  for (const k of Object.keys(overrides)) {
    saved[k] = process.env[k];
    if (overrides[k] === undefined) delete process.env[k];
    else process.env[k] = overrides[k];
  }
  try { return fn(); } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

// === hasDesignSurfacePath unit ===

test('hasDesignSurfacePath: 7 whitelist prefixes hit', () => {
  // Directory-prefix matches.
  assert.ok(detector.hasDesignSurfacePath('plugins/mccp/scripts/lib/renderer/index.js'));
  assert.ok(detector.hasDesignSurfacePath('plugins/mccp/scripts/lib/briefing/cost-guard.js'));
  assert.ok(detector.hasDesignSurfacePath('plugins/mccp/scripts/derive/sources/receipts.js'));
  // Exact-file matches.
  assert.ok(detector.hasDesignSurfacePath('plugins/mccp/scripts/hooks/render-trigger-session-start.js'));
  assert.ok(detector.hasDesignSurfacePath('plugins/mccp/scripts/receipt/write.js'));
  assert.ok(detector.hasDesignSurfacePath('.claude/cache/STATUS.md'));
  assert.ok(detector.hasDesignSurfacePath('.claude/cache/status.html'));
});

test('hasDesignSurfacePath: Windows backslash paths normalize', () => {
  assert.ok(detector.hasDesignSurfacePath('plugins\\mccp\\scripts\\lib\\renderer\\index.js'));
  assert.ok(detector.hasDesignSurfacePath('.claude\\cache\\STATUS.md'));
});

test('hasDesignSurfacePath: non-design paths return false (Fixture C overshoot)', () => {
  assert.strictEqual(detector.hasDesignSurfacePath('plugins/mccp/scripts/state/state-writer.js'), false);
  assert.strictEqual(detector.hasDesignSurfacePath('plugins/mccp/scripts/receipt/cli.js'), false);
  assert.strictEqual(detector.hasDesignSurfacePath('plugins/mccp/scripts/lib/codex-invoke.js'), false);
  assert.strictEqual(detector.hasDesignSurfacePath(''), false);
  assert.strictEqual(detector.hasDesignSurfacePath(null), false);
});

// === findDesignSignalInDiff — whitelist applied (Fixture A diff, Fixture D cache) ===

test('findDesignSignalInDiff: Fixture A — .js file in renderer/ triggers signal', () => {
  const result = detector.findDesignSignalInDiff([
    'plugins/mccp/scripts/lib/renderer/index.js',
    'plugins/mccp/scripts/state/state-writer.js',
  ]);
  assert.deepStrictEqual(result, ['plugins/mccp/scripts/lib/renderer/index.js']);
});

test('findDesignSignalInDiff: Fixture D — .claude/cache/STATUS.md triggers signal', () => {
  const result = detector.findDesignSignalInDiff([
    '.claude/cache/STATUS.md',
    '.claude/cache/status.html',
  ]);
  assert.deepStrictEqual(result.sort(), ['.claude/cache/STATUS.md', '.claude/cache/status.html'].sort());
});

test('findDesignSignalInDiff: Fixture C — state-writer.js does NOT trigger signal (overshoot guard)', () => {
  const result = detector.findDesignSignalInDiff([
    'plugins/mccp/scripts/state/state-writer.js',
    'plugins/mccp/scripts/state/pre-compact.js',
  ]);
  assert.deepStrictEqual(result, []);
});

test('findDesignSignalInDiff: UI extension + whitelist OR semantics', () => {
  const result = detector.findDesignSignalInDiff([
    'app/page.tsx',
    'plugins/mccp/scripts/lib/renderer/index.js',
    'random/file.txt',
  ]);
  assert.strictEqual(result.length, 2);
});

// === findDesignSignalInArtifact — Fixture B (Codex F1 absorption) ===

test('findDesignSignalInArtifact: Fixture B — plan body backtick path hits whitelist', () => {
  withTempDir((dir) => {
    const planPath = path.join(dir, 'plan.md');
    fs.writeFileSync(planPath, [
      '# Plan',
      '',
      '## Files to Change',
      '',
      '| File | Action |',
      '|---|---|',
      '| `plugins/mccp/scripts/lib/renderer/index.js` | UPDATE |',
    ].join('\n'), 'utf8');
    const found = detector.findDesignSignalInArtifact(planPath);
    assert.ok(found.includes('plugins/mccp/scripts/lib/renderer/index.js'),
      'Expected whitelist hit. Got: ' + JSON.stringify(found));
  });
});

test('findDesignSignalInArtifact: state-writer.js mention does NOT trigger signal', () => {
  withTempDir((dir) => {
    const planPath = path.join(dir, 'plan.md');
    fs.writeFileSync(planPath, [
      '# Plan',
      '',
      '## Files to Change',
      '',
      '| File | Action |',
      '|---|---|',
      '| `plugins/mccp/scripts/state/state-writer.js` | UPDATE |',
    ].join('\n'), 'utf8');
    const found = detector.findDesignSignalInArtifact(planPath);
    assert.strictEqual(found.length, 0,
      'Expected no signal for non-design path. Got: ' + JSON.stringify(found));
  });
});

test('findDesignSignalInArtifact: empty plan returns no signal', () => {
  withTempDir((dir) => {
    const planPath = path.join(dir, 'empty.md');
    fs.writeFileSync(planPath, '# Empty plan\n', 'utf8');
    assert.deepStrictEqual(detector.findDesignSignalInArtifact(planPath), []);
  });
});

// === detect() silent_skip surface (Task 2) ===

function makePluginsManifest(dir, hasImpeccable) {
  const file = path.join(dir, 'installed_plugins.json');
  const payload = hasImpeccable
    ? { version: 2, plugins: { 'impeccable@anthropics': [{ scope: 'user', version: '0.1.0', installPath: '/fake' }] } }
    : { version: 2, plugins: {} };
  fs.writeFileSync(file, JSON.stringify(payload), 'utf8');
  return file;
}

test('detect: Fixture B — silent_skip=true when SKILL_AVAIL=1 + SIGNAL=0', () => {
  withTempDir((dir) => {
    const planPath = path.join(dir, 'empty.md');
    fs.writeFileSync(planPath, '# Empty plan\n', 'utf8');
    withEnv({
      MCCP_IMPECCABLE_SKILL: 'available',
      MCCP_IMPECCABLE_CLI_MOCK: 'available',
    }, () => {
      const r = detector.detect({
        mode: 'plan',
        planPath: planPath,
        repoRoot: dir,
      });
      assert.strictEqual(r.skill_available, true);
      assert.strictEqual(r.design_signal, false);
      assert.strictEqual(r.reason, 'no-signal');
      assert.strictEqual(r.silent_skip, true);
      assert.strictEqual(r.silent_skip_reason, 'no-signal');
    });
  });
});

test('detect: silent_skip=false when SKILL_AVAIL=0 (skill-missing path is not silent)', () => {
  withTempDir((dir) => {
    const planPath = path.join(dir, 'empty.md');
    fs.writeFileSync(planPath, '# Empty plan\n', 'utf8');
    // MCCP_IMPECCABLE_SKILL='missing' short-circuits the probe before both the
    // installed_plugins.json check and the user-level skill-dir fallback —
    // necessary because tests run on developer machines that may have
    // ~/.claude/skills/impeccable installed (would otherwise force skill_available=true).
    withEnv({
      MCCP_IMPECCABLE_SKILL: 'missing',
      MCCP_IMPECCABLE_CLI_MOCK: 'missing',
    }, () => {
      const r = detector.detect({
        mode: 'plan',
        planPath: planPath,
        repoRoot: dir,
      });
      assert.strictEqual(r.skill_available, false);
      assert.strictEqual(r.reason, 'skill-missing');
      assert.strictEqual(r.silent_skip, false);
      assert.strictEqual(r.silent_skip_reason, null);
    });
  });
});

test('detect: silent_skip=false when design_signal=true (whitelist hit on plan body)', () => {
  withTempDir((dir) => {
    const planPath = path.join(dir, 'plan.md');
    fs.writeFileSync(planPath, [
      '# Plan',
      '',
      '`plugins/mccp/scripts/lib/renderer/index.js`',
    ].join('\n'), 'utf8');
    withEnv({
      MCCP_IMPECCABLE_SKILL: 'available',
      MCCP_IMPECCABLE_CLI_MOCK: 'available',
    }, () => {
      const r = detector.detect({
        mode: 'plan',
        planPath: planPath,
        repoRoot: dir,
      });
      assert.strictEqual(r.skill_available, true);
      assert.strictEqual(r.design_signal, true);
      assert.strictEqual(r.reason, 'ok');
      assert.strictEqual(r.silent_skip, false);
      assert.strictEqual(r.silent_skip_reason, null);
    });
  });
});

// === backend-only false-positive: silent_skip fires but M1 validator emits ===
// === warning only (the wedge MUST NOT block non-UI cycles). Surface contract: ===
// === detect() flips silent_skip=true; the wedge's M1 promise is that this is ===
// === observational, not blocking. Promotion to blocking is M2 work. ===

test('detect: backend-only plan body — silent_skip=true (observational, NOT blocking at M1)', () => {
  withTempDir((dir) => {
    const planPath = path.join(dir, 'backend-plan.md');
    fs.writeFileSync(planPath, [
      '# Plan: backend state-writer fix',
      '',
      '## Files to Change',
      '',
      '| File | Action |',
      '|---|---|',
      '| `plugins/mccp/scripts/state/state-writer.js` | UPDATE |',
      '| `plugins/mccp/scripts/state/pre-compact.js` | UPDATE |',
    ].join('\n'), 'utf8');
    withEnv({
      MCCP_IMPECCABLE_SKILL: 'available',
      MCCP_IMPECCABLE_CLI_MOCK: 'available',
    }, () => {
      const r = detector.detect({
        mode: 'plan',
        planPath: planPath,
        repoRoot: dir,
      });
      // Fires — but the M1 contract is informational. validate-cmd test (separate
      // file) exercises the warning-not-blocking promise. This fixture pins
      // detect()'s output so future detector refinements (e.g., a design-suspect
      // discriminator) surface here as a deliberate diff.
      assert.strictEqual(r.skill_available, true);
      assert.strictEqual(r.design_signal, false);
      assert.strictEqual(r.silent_skip, true,
        'Backend-only plan still trips silent_skip — the wedge cannot tell ' +
        '"no design intended" from "design missed". M2 must close this gap.');
      assert.strictEqual(r.silent_skip_reason, 'no-signal');
    });
  });
});

test('detect: early-return paths (mode-mismatch, path-traversal) carry silent_skip=false', () => {
  withEnv({ MCCP_IMPECCABLE_SKILL: 'available', MCCP_IMPECCABLE_CLI_MOCK: 'available' }, () => {
    // mode-mismatch
    const r1 = detector.detect({ mode: 'bogus' });
    assert.strictEqual(r1.reason, 'mode-mismatch');
    assert.strictEqual(r1.silent_skip, false);
    assert.strictEqual(r1.silent_skip_reason, null);
  });
  withTempDir((dir) => {
    withEnv({ MCCP_IMPECCABLE_SKILL: 'available', MCCP_IMPECCABLE_CLI_MOCK: 'available' }, () => {
      // path-traversal
      const r2 = detector.detect({
        mode: 'plan',
        planPath: '../../etc/passwd',
        repoRoot: dir,
      });
      assert.strictEqual(r2.reason, 'path-traversal');
      assert.strictEqual(r2.silent_skip, false);
      assert.strictEqual(r2.silent_skip_reason, null);
    });
  });
});
