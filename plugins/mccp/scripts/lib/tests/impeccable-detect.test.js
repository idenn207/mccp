'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const detector = require('../impeccable-detect');

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-impeccable-detect-'));
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

function writePluginsManifest(dir, hasImpeccable) {
  const file = path.join(dir, 'installed_plugins.json');
  const payload = hasImpeccable
    ? { version: 2, plugins: { 'impeccable@anthropics': [{ scope: 'user', version: '0.1.0', installPath: '/fake' }] } }
    : { version: 2, plugins: {} };
  fs.writeFileSync(file, JSON.stringify(payload), 'utf8');
  return file;
}

// === Mode plumbing ===

test('detect: invalid mode returns mode-mismatch with mode=null', () => {
  withEnv({ MCCP_IMPECCABLE_SKILL: 'available', MCCP_IMPECCABLE_CLI_MOCK: 'available' }, () => {
    const r = detector.detect({ mode: 'bogus' });
    assert.strictEqual(r.mode, null);
    assert.strictEqual(r.reason, 'mode-mismatch');
    assert.strictEqual(r.design_signal, false);
  });
});

// === 8-combo matrix: (skill) × (cli) × (signal) ===
// signal axis is varied via plan fixture content for prd mode.

const matrix = [
  { skill: 'available', cli: 'available', signal: true,  wantReason: 'ok' },
  { skill: 'available', cli: 'available', signal: false, wantReason: 'no-signal' },
  { skill: 'available', cli: 'missing',   signal: true,  wantReason: 'ok' },          // hot path: skill+cli-missing must not false-unavailable
  { skill: 'available', cli: 'missing',   signal: false, wantReason: 'no-signal' },
  { skill: 'missing',   cli: 'available', signal: true,  wantReason: 'skill-missing' },
  { skill: 'missing',   cli: 'available', signal: false, wantReason: 'skill-missing' },
  { skill: 'missing',   cli: 'missing',   signal: true,  wantReason: 'skill-missing' },
  { skill: 'missing',   cli: 'missing',   signal: false, wantReason: 'skill-missing' },
];

for (const combo of matrix) {
  test(`detect 8-combo: skill=${combo.skill} cli=${combo.cli} signal=${combo.signal} → reason=${combo.wantReason}`, () => {
    withTempDir((dir) => {
      const planPath = path.join(dir, 'fixture.plan.md');
      const body = combo.signal
        ? '# Plan\n## Files to Change\n| File | Action |\n|---|---|\n| `src/Button.tsx` | CREATE |\n'
        : '# Plan\nNo design content here.\n';
      fs.writeFileSync(planPath, body, 'utf8');
      withEnv({
        MCCP_IMPECCABLE_SKILL: combo.skill,
        MCCP_IMPECCABLE_CLI_MOCK: combo.cli,
      }, () => {
        const r = detector.detect({ mode: 'plan', planPath: 'fixture.plan.md', repoRoot: dir });
        assert.strictEqual(r.mode, 'plan');
        assert.strictEqual(r.skill_available, combo.skill === 'available');
        assert.strictEqual(r.cli_available, combo.cli === 'available');
        assert.strictEqual(r.design_signal, combo.signal);
        assert.strictEqual(r.reason, combo.wantReason);
      });
    });
  });
}

// === Mode-aware artifact detection (F3 absorption) ===

test('detect prd mode: explicit Design Direction keyword counts as signal', () => {
  withTempDir((dir) => {
    const prdPath = path.join(dir, 'feature.prd.md');
    fs.writeFileSync(prdPath, '# PRD\n\n## Design Direction\n\nClean and minimal.\n', 'utf8');
    withEnv({ MCCP_IMPECCABLE_SKILL: 'available', MCCP_IMPECCABLE_CLI_MOCK: 'missing' }, () => {
      const r = detector.detect({ mode: 'prd', planPath: 'feature.prd.md', repoRoot: dir });
      assert.strictEqual(r.design_signal, true);
      assert.deepStrictEqual(r.signal_files, ['<keyword:design>']);
      assert.strictEqual(r.reason, 'ok');
    });
  });
});

test('detect plan mode: .claude/design/*.design.plan.md reference counts as signal', () => {
  withTempDir((dir) => {
    const planPath = path.join(dir, 'feature.plan.md');
    fs.writeFileSync(planPath, '# Plan\n\nSee .claude/design/feature.design.plan.md for visual spec.\n', 'utf8');
    withEnv({ MCCP_IMPECCABLE_SKILL: 'available', MCCP_IMPECCABLE_CLI_MOCK: 'missing' }, () => {
      const r = detector.detect({ mode: 'plan', planPath: 'feature.plan.md', repoRoot: dir });
      assert.strictEqual(r.design_signal, true);
      assert.ok(r.signal_files.some(function (f) { return f.includes('feature.design.plan.md'); }));
    });
  });
});

test('detect prd mode: no plan path + no signal → no-signal not mode-mismatch', () => {
  withEnv({ MCCP_IMPECCABLE_SKILL: 'available', MCCP_IMPECCABLE_CLI_MOCK: 'missing' }, () => {
    const r = detector.detect({ mode: 'prd' });
    assert.strictEqual(r.mode, 'prd');
    assert.strictEqual(r.design_signal, false);
    assert.strictEqual(r.reason, 'no-signal');
  });
});

test('detect implement mode: returns mode + cli/skill axis even without git context', () => {
  withTempDir((dir) => {
    withEnv({ MCCP_IMPECCABLE_SKILL: 'available', MCCP_IMPECCABLE_CLI_MOCK: 'missing' }, () => {
      const r = detector.detect({ mode: 'implement', repoRoot: dir });
      assert.strictEqual(r.mode, 'implement');
      assert.strictEqual(r.skill_available, true);
      assert.strictEqual(r.cli_available, false);
      // No git diff inside an empty temp dir → empty signal_files. Helper does not throw.
      assert.deepStrictEqual(r.signal_files, []);
    });
  });
});

// === F-Sec-2: path traversal ===

test('detect: --plan with .. traversal → reason=path-traversal, no fs read', () => {
  withTempDir((dir) => {
    withEnv({ MCCP_IMPECCABLE_SKILL: 'available', MCCP_IMPECCABLE_CLI_MOCK: 'missing' }, () => {
      const r = detector.detect({ mode: 'plan', planPath: '../../../etc/passwd', repoRoot: dir });
      assert.strictEqual(r.reason, 'path-traversal');
      assert.strictEqual(r.design_signal, false);
      assert.deepStrictEqual(r.signal_files, []);
    });
  });
});

test('detect: --plan with absolute path outside repo → reason=path-traversal', () => {
  withTempDir((dir) => {
    withTempDir((outsideDir) => {
      const outside = path.join(outsideDir, 'evil.md');
      fs.writeFileSync(outside, '# evil', 'utf8');
      withEnv({ MCCP_IMPECCABLE_SKILL: 'available', MCCP_IMPECCABLE_CLI_MOCK: 'missing' }, () => {
        const r = detector.detect({ mode: 'plan', planPath: outside, repoRoot: dir });
        assert.strictEqual(r.reason, 'path-traversal');
      });
    });
  });
});

// === Skill probe via installed_plugins.json (no env override) ===

test('probeSkillAvailable: impeccable plugin entry in manifest → true', () => {
  withTempDir((dir) => {
    const file = writePluginsManifest(dir, true);
    withEnv({ MCCP_IMPECCABLE_SKILL: undefined }, () => {
      assert.strictEqual(detector.probeSkillAvailable({ installedPluginsPath: file }), true);
    });
  });
});

test('probeSkillAvailable: empty manifest → false', () => {
  withTempDir((dir) => {
    const file = writePluginsManifest(dir, false);
    withEnv({ MCCP_IMPECCABLE_SKILL: undefined }, () => {
      assert.strictEqual(detector.probeSkillAvailable({ installedPluginsPath: file }), false);
    });
  });
});

// === Helper unit ===

test('hasUiExtension: detects common UI extensions including .module.css', () => {
  assert.strictEqual(detector.hasUiExtension('src/Foo.tsx'), true);
  assert.strictEqual(detector.hasUiExtension('src/Foo.module.css'), true);
  assert.strictEqual(detector.hasUiExtension('src/Foo.vue'), true);
  assert.strictEqual(detector.hasUiExtension('src/Foo.scss'), true);
  assert.strictEqual(detector.hasUiExtension('src/Foo.ts'), false);
  assert.strictEqual(detector.hasUiExtension('README.md'), false);
});

test('isDesignPlanPath: matches .claude/design/*.design.plan.md', () => {
  assert.strictEqual(detector.isDesignPlanPath('.claude/design/feature.design.plan.md'), true);
  assert.strictEqual(detector.isDesignPlanPath('.claude\\design\\feature.design.plan.md'), true);
  assert.strictEqual(detector.isDesignPlanPath('.claude/plans/feature.plan.md'), false);
});
