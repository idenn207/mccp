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

// A SKILL.md shaped like the real ones (frontmatter fence, then `version`).
function writeSkillFixture(dir, version) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'SKILL.md');
  fs.writeFileSync(file, ['---', 'name: impeccable', 'version: ' + version, '---', '', 'body'].join('\n'), 'utf8');
  return file;
}

// The key is `impeccable@impeccable` on a default install — the old fixture
// planted `impeccable@anthropics` with installPath '/fake', so it encoded two
// errors at once and the suite kept them alive. The install tree is now real,
// because a plugin entry whose installPath is not on disk is deliberately not
// counted (stale installPath = `install-path-stale`).
function writePluginsManifest(dir, hasImpeccable) {
  const file = path.join(dir, 'installed_plugins.json');
  let payload = { version: 2, plugins: {} };
  if (hasImpeccable) {
    const installPath = path.join(dir, 'plugin-cache');
    writeSkillFixture(path.join(installPath, 'skills', 'impeccable'), '4.1.1');
    payload = {
      version: 2,
      plugins: { 'impeccable@impeccable': [{ scope: 'user', version: '4.1.1', installPath: installPath }] },
    };
  }
  fs.writeFileSync(file, JSON.stringify(payload), 'utf8');
  return file;
}

// v1.31.1 M1 — resolveImpeccable added a PROJECT channel that defaults to
// <repoRoot>/.claude/skills/impeccable, and this repository has a real copy
// there. Without pinning repoRoot and projectSkillDir at a fixture path,
// every probe below would read the developer's own checkout instead of its
// fixture — two of these cases were already passing for that reason rather
// than for the reason they claim to assert.
function probeOpts(dir, over) {
  return Object.assign({
    repoRoot: dir,
    projectSkillDir: path.join(dir, 'no-project-skill'),
    userSkillDir: path.join(dir, 'no-user-skill'),
  }, over || {});
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
      assert.strictEqual(detector.probeSkillAvailable(probeOpts(dir, { installedPluginsPath: file })), true);
    });
  });
});

test('probeSkillAvailable: empty manifest → false', () => {
  withTempDir((dir) => {
    const file = writePluginsManifest(dir, false);
    withEnv({ MCCP_IMPECCABLE_SKILL: undefined }, () => {
      assert.strictEqual(detector.probeSkillAvailable(probeOpts(dir, {
        installedPluginsPath: file,
        userSkillDir: path.join(dir, 'nonexistent-impeccable'),
      })), false);
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

// === v0.3.6 Task 0 — user-level skill directory probe ===

test('probeSkillAvailable: user-level skill directory triggers true (no manifest entry)', () => {
  withTempDir((dir) => {
    const userSkillDir = path.join(dir, 'impeccable');
    writeSkillFixture(userSkillDir, '3.5.0');
    withEnv({ MCCP_IMPECCABLE_SKILL: undefined }, () => {
      const result = detector.probeSkillAvailable(probeOpts(dir, {
        installedPluginsPath: writePluginsManifest(dir, false),
        userSkillDir: userSkillDir,
      }));
      assert.strictEqual(result, true);
    });
  });
});

test('probeSkillAvailable: missing user-level skill directory + no manifest entry returns false', () => {
  withTempDir((dir) => {
    withEnv({ MCCP_IMPECCABLE_SKILL: undefined }, () => {
      const result = detector.probeSkillAvailable(probeOpts(dir, {
        installedPluginsPath: writePluginsManifest(dir, false),
        userSkillDir: path.join(dir, 'nonexistent-impeccable'),
      }));
      assert.strictEqual(result, false);
    });
  });
});

test('probeSkillAvailable: plugin manifest still wins when user-level skill directory absent', () => {
  withTempDir((dir) => {
    withEnv({ MCCP_IMPECCABLE_SKILL: undefined }, () => {
      const result = detector.probeSkillAvailable(probeOpts(dir, {
        installedPluginsPath: writePluginsManifest(dir, true),
        userSkillDir: path.join(dir, 'nonexistent-impeccable'),
      }));
      assert.strictEqual(result, true);
    });
  });
});

test('probeSkillAvailable: env override "missing" beats user-level skill directory presence', () => {
  withTempDir((dir) => {
    const userSkillDir = path.join(dir, 'impeccable');
    writeSkillFixture(userSkillDir, '3.5.0');
    withEnv({ MCCP_IMPECCABLE_SKILL: 'missing' }, () => {
      const result = detector.probeSkillAvailable(probeOpts(dir, {
        installedPluginsPath: writePluginsManifest(dir, false),
        userSkillDir: userSkillDir,
      }));
      assert.strictEqual(result, false);
    });
  });
});

test('probeSkillAvailable: env override "available" beats both manifest and directory absence', () => {
  withTempDir((dir) => {
    withEnv({ MCCP_IMPECCABLE_SKILL: 'available' }, () => {
      const result = detector.probeSkillAvailable(probeOpts(dir, {
        installedPluginsPath: writePluginsManifest(dir, false),
        userSkillDir: path.join(dir, 'nonexistent-impeccable'),
      }));
      assert.strictEqual(result, true);
    });
  });
});

// === v1.31.1 M1 — the six reporting fields detect() layers on top ===

// CLAUDE.md §3.17 and the CHANGELOG both call detect() a STRICT SUPERSET of the
// pre-M1 shape. That is a claim about EVERY branch, not just the resolved one,
// and the rejected --plan branch quietly broke it: it returned the eight old
// keys and none of the six new ones, so a consumer reading impeccable_source
// there could not tell `null` (measured, unknown) from `undefined` (never
// asked) — a distinction this repo relies on elsewhere. Nothing pinned it,
// which is why the omission survived to code review.
const RESOLUTION_KEYS = [
  'impeccable_invocation', 'impeccable_source', 'impeccable_version',
  'impeccable_path', 'impeccable_sources', 'impeccable_shadowed',
];

test('detect: every branch carries the six reporting fields', () => {
  withTempDir((dir) => {
    withEnv({ MCCP_IMPECCABLE_SKILL: undefined }, () => {
      const base = probeOpts(dir, { installedPluginsPath: writePluginsManifest(dir, false) });
      const branches = [
        ['mode-mismatch', detector.detect(Object.assign({ mode: 'bogus' }, base))],
        ['path-traversal', detector.detect(Object.assign({ mode: 'plan', planPath: '../../../etc/passwd' }, base))],
        ['resolved', detector.detect(Object.assign({ mode: 'plan', planPath: 'absent-plan.md' }, base))],
      ];
      branches.forEach(([label, result]) => {
        RESOLUTION_KEYS.forEach((key) => {
          assert.ok(
            Object.prototype.hasOwnProperty.call(result, key),
            label + ' branch (reason=' + result.reason + ') is missing ' + key
          );
        });
      });
      // The branch that was broken, named outright so a regression reads plainly.
      assert.strictEqual(branches[1][1].reason, 'path-traversal');
    });
  });
});

test('detect: the six fields carry exactly what the oracle resolved', () => {
  withTempDir((dir) => {
    const projectSkillDir = path.join(dir, 'project-skill');
    writeSkillFixture(projectSkillDir, '3.5.0');
    withEnv({ MCCP_IMPECCABLE_SKILL: undefined }, () => {
      const opts = probeOpts(dir, {
        installedPluginsPath: writePluginsManifest(dir, false),
        projectSkillDir: projectSkillDir,
      });
      const resolved = detector.resolveImpeccable(opts);
      const result = detector.detect(Object.assign({ mode: 'implement' }, opts));
      // detect() must not resolve a second time and disagree with itself.
      assert.strictEqual(result.impeccable_invocation, resolved.invocation);
      assert.strictEqual(result.impeccable_source, 'project');
      assert.strictEqual(result.impeccable_version, '3.5.0');
      assert.strictEqual(result.impeccable_shadowed, false);
      assert.strictEqual(result.skill_available, resolved.available);
      assert.deepStrictEqual(result.impeccable_sources, resolved.sources);
    });
  });
});
