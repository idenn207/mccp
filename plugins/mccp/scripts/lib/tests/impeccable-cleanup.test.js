'use strict';

// impeccable-cleanup rejection-rule regression (M3 Task 4).
//
// This module deletes directories, so the tests that matter are the ones that
// prove it REFUSES. Every rule gets a case that also asserts the disk is
// unchanged — a refusal that still deleted something is the failure mode the
// rules exist to prevent, and a reason string alone cannot rule it out.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const cleanup = require('../impeccable-cleanup');

const R = cleanup.REASONS;

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-impeccable-cleanup-'));
  try { return fn(dir); } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) {}
  }
}

function withEnv(overrides, fn) {
  const saved = {};
  Object.keys(overrides).forEach(function (k) {
    saved[k] = process.env[k];
    if (overrides[k] === undefined) delete process.env[k];
    else process.env[k] = overrides[k];
  });
  try { return fn(); } finally {
    Object.keys(saved).forEach(function (k) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  }
}

const NO_ENV = { MCCP_IMPECCABLE_SKILL: undefined };

function writeSkill(dir, version) {
  fs.mkdirSync(dir, { recursive: true });
  const lines = ['---', 'name: impeccable', 'description: ' + 'x'.repeat(200)];
  if (version) lines.push('version: ' + version);
  lines.push('user-invocable: true', '---', '', 'body');
  fs.writeFileSync(path.join(dir, 'SKILL.md'), lines.join('\n'), 'utf8');
  return dir;
}

// A well-known-shaped copy: <root>/.claude/skills/impeccable/SKILL.md
function wellKnown(root) {
  return path.join(root, '.claude', 'skills', 'impeccable');
}

function writeManifest(dir, entries) {
  const file = path.join(dir, 'installed_plugins.json');
  const plugins = {};
  (entries || []).forEach(function (e) {
    plugins[e.key] = [{ scope: 'user', version: e.version || null, installPath: e.installPath }];
  });
  fs.writeFileSync(file, JSON.stringify({ version: 2, plugins: plugins }), 'utf8');
  return file;
}

function writePluginTree(base, name, version) {
  writeSkill(path.join(base, 'skills', name), version);
  return base;
}

function absent(dir, label) { return path.join(dir, 'absent-' + label); }

// Build an options bundle whose every filesystem input is injected, so nothing
// on the machine running the tests can reach the oracle.
function opts(dir, over) {
  const repoRoot = path.join(dir, 'repo');
  const homeDir = path.join(dir, 'home');
  fs.mkdirSync(repoRoot, { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });
  return Object.assign({
    repoRoot: repoRoot,
    homeDir: homeDir,
    installedPluginsPath: absent(dir, 'manifest.json'),
    projectSkillDir: wellKnown(repoRoot),
    userSkillDir: wellKnown(homeDir),
  }, over || {});
}

function refuses(fn, reason, message) {
  let caught = null;
  try { fn(); } catch (e) { caught = e; }
  assert.ok(caught, message + ': expected a refusal, got none');
  assert.strictEqual(caught.name, 'CleanupError', message + ': wrong error type: ' + caught.name);
  assert.strictEqual(caught.reason, reason, message + ': wrong reason: ' + caught.reason);
  return caught;
}

// === plan: read-only statements about the resolution ===

test('plan: nothing installed anywhere is not-installed with no removable rows', () => {
  withTempDir((dir) => {
    withEnv(NO_ENV, () => {
      const p = cleanup.planCleanup(opts(dir));
      assert.strictEqual(p.reason, R.NOT_INSTALLED);
      assert.strictEqual(p.winner, null);
      assert.deepStrictEqual(p.removable, []);
    });
  });
});

test('plan rule 2: a plugin copy is enumerated as skipped, never as removable', () => {
  withTempDir((dir) => {
    const o = opts(dir);
    writeSkill(o.projectSkillDir, '3.5.0');
    const pluginBase = path.join(dir, 'plugin');
    writePluginTree(pluginBase, 'impeccable', '4.1.1');
    o.installedPluginsPath = writeManifest(dir, [
      { key: 'impeccable@impeccable', version: '4.1.1', installPath: pluginBase },
    ]);
    withEnv(NO_ENV, () => {
      const p = cleanup.planCleanup(o);
      assert.strictEqual(p.winner.source, 'project');
      assert.deepStrictEqual(p.removable, [],
        'plugin removal belongs to `claude plugin uninstall`, not here');
      assert.strictEqual(p.skipped.length, 1);
      assert.strictEqual(p.skipped[0].source, 'plugin');
      assert.strictEqual(p.skipped[0].reason, R.PLUGIN_NOT_REMOVABLE);
    });
  });
});

test('plan rule 6: shadowed reports ambiguous-winner and offers nothing', () => {
  withTempDir((dir) => {
    const o = opts(dir);
    writeSkill(o.projectSkillDir, '3.5.0');
    writeSkill(o.userSkillDir, '4.0.0');
    withEnv(NO_ENV, () => {
      const p = cleanup.planCleanup(o);
      assert.strictEqual(p.shadowed, true);
      assert.strictEqual(p.reason, R.AMBIGUOUS_WINNER);
      assert.strictEqual(p.winner, null);
      assert.deepStrictEqual(p.removable, []);
      assert.strictEqual(p.skipped.length, 2, 'both bodies are still shown to the operator');
    });
  });
});

// This is the shape of the contract, not an accident: it pins the JOINT effect
// of rules 1 and 2 so that a later milestone which wants a removable bare copy
// has to change a rule deliberately and watch this test go red.
test('rules 1+2 jointly: with real sources only, nothing is ever removable', () => {
  withTempDir((dir) => {
    const o = opts(dir);
    writeSkill(o.projectSkillDir, '3.5.0');
    const pluginBase = path.join(dir, 'plugin');
    writePluginTree(pluginBase, 'impeccable', '4.1.1');
    o.installedPluginsPath = writeManifest(dir, [
      { key: 'impeccable@impeccable', version: '4.1.1', installPath: pluginBase },
    ]);
    withEnv(NO_ENV, () => {
      // A bare source always wins, so a bare copy is either the winner (rule 1)
      // or one of two bare copies (rule 6). The eclipsed set therefore holds
      // only plugin rows, which rule 2 refuses. The tool is inert here BY
      // CONSTRUCTION, and /mccp:setup must say so rather than offering a
      // removal that cannot happen.
      assert.deepStrictEqual(cleanup.planCleanup(o).removable, []);
    });
  });
});

// === apply: the destructive half ===

test('apply rule 1: the winning copy is refused', () => {
  withTempDir((dir) => {
    const o = opts(dir);
    writeSkill(o.projectSkillDir, '3.5.0');
    withEnv(NO_ENV, () => {
      refuses(() => cleanup.applyCleanup(Object.assign({ source: 'project', confirm: true }, o)),
        R.IS_WINNER, 'winner');
      assert.ok(fs.existsSync(path.join(o.projectSkillDir, 'SKILL.md')), 'disk unchanged');
    });
  });
});

test('apply rule 2: plugin is not an addressable source at all', () => {
  withTempDir((dir) => {
    const o = opts(dir);
    writeSkill(o.projectSkillDir, '3.5.0');
    const pluginBase = path.join(dir, 'plugin');
    writePluginTree(pluginBase, 'impeccable', '4.1.1');
    o.installedPluginsPath = writeManifest(dir, [
      { key: 'impeccable@impeccable', version: '4.1.1', installPath: pluginBase },
    ]);
    withEnv(NO_ENV, () => {
      refuses(() => cleanup.applyCleanup(Object.assign({ source: 'plugin', confirm: true }, o)),
        R.UNKNOWN_SOURCE, 'plugin source');
      assert.ok(fs.existsSync(path.join(pluginBase, 'skills', 'impeccable', 'SKILL.md')),
        'the plugin cache is untouched');
    });
  });
});

test('apply rule 6: two bare copies refuse BOTH sources and leave the disk alone', () => {
  // The plan calls this out by name: with no winner, rule 1 is undecidable, so
  // allowing either source through would be allowing a coin flip on which live
  // body gets deleted.
  withTempDir((dir) => {
    const o = opts(dir);
    writeSkill(o.projectSkillDir, '3.5.0');
    writeSkill(o.userSkillDir, '4.0.0');
    withEnv(NO_ENV, () => {
      refuses(() => cleanup.applyCleanup(Object.assign({ source: 'project', confirm: true }, o)),
        R.AMBIGUOUS_WINNER, 'shadowed/project');
      refuses(() => cleanup.applyCleanup(Object.assign({ source: 'user', confirm: true }, o)),
        R.AMBIGUOUS_WINNER, 'shadowed/user');
      assert.ok(fs.existsSync(path.join(o.projectSkillDir, 'SKILL.md')), 'project copy intact');
      assert.ok(fs.existsSync(path.join(o.userSkillDir, 'SKILL.md')), 'user copy intact');
    });
  });
});

test('apply rule 7: an env-forced winner names no body, so every source is refused', () => {
  // MCCP_IMPECCABLE_SKILL=available used to be the one configuration in which a
  // bare copy came out eclipsed rather than winning. That made it the harness
  // these tests reached the deletion path through -- and it made the deletion
  // path unsafe, because the override asserts that the NAME resolves and
  // asserts nothing about which copy answers it. rule 1 compares
  // `winner.source === source`, so against a winner of source 'env' it never
  // matched, and the one body that actually opens was offered for removal.
  // Worse, the post-condition could not catch it: the same override keeps
  // reporting available:true after the body is gone.
  withTempDir((dir) => {
    const o = opts(dir);
    writeSkill(o.projectSkillDir, '3.5.0');
    withEnv({ MCCP_IMPECCABLE_SKILL: 'available' }, () => {
      const plan = cleanup.planCleanup(o);
      assert.strictEqual(plan.reason, R.UNVERIFIABLE_WINNER);
      assert.deepStrictEqual(plan.removable, [], 'nothing may be offered');
      assert.ok(plan.skipped.length > 0, 'the copies are still reported, just not offered');
      refuses(() => cleanup.applyCleanup(Object.assign({ source: 'project', confirm: true }, o)),
        R.UNVERIFIABLE_WINNER, 'env-forced winner');
      assert.ok(fs.existsSync(path.join(o.projectSkillDir, 'SKILL.md')),
        'the body that actually opens is still on disk');
    });
  });
});

test('rule 3: a link between the anchor and the target is refused', () => {
  // Asserted against the containment predicate directly: applyCleanup can no
  // longer be driven this far (rule 7 stops it), and a rule that lives only
  // inside an unreachable branch is a rule nothing checks.
  withTempDir((dir) => {
    const real = path.join(dir, 'elsewhere', 'skills');
    writeSkill(path.join(real, 'impeccable'), '3.5.0');
    const repoRoot = path.join(dir, 'repo');
    const claudeDir = path.join(repoRoot, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    try {
      fs.symlinkSync(real, path.join(claudeDir, 'skills'),
        process.platform === 'win32' ? 'junction' : 'dir');
    } catch (_e) {
      return; // unprivileged environment: nothing to assert
    }
    refuses(() => cleanup._internals.assertReachableWithoutLinks(repoRoot, 'project'),
      R.SYMLINK_PATH, 'symlinked ancestor');
    assert.ok(fs.existsSync(path.join(real, 'impeccable', 'SKILL.md')),
      'the tree behind the link is untouched');
  });
});

test('rule 3: an anchor that is itself a link is ALLOWED, not refused', () => {
  // security-reviewer S1 proposed refusing any symlinked repo root. That would
  // refuse ordinary installs (macOS /tmp, a junctioned dev drive) while buying
  // nothing: the expected parent and the target resolve through the SAME link,
  // so containment still holds. This test is the evidence for that rejection.
  withTempDir((dir) => {
    const realRoot = path.join(dir, 'real-root');
    fs.mkdirSync(realRoot, { recursive: true });
    const linkedRoot = path.join(dir, 'linked-root');
    try {
      fs.symlinkSync(realRoot, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (_e) {
      return;
    }
    writeSkill(wellKnown(linkedRoot), '3.5.0');
    const resolved = cleanup._internals.assertReachableWithoutLinks(linkedRoot, 'project');
    assert.ok(fs.existsSync(path.join(resolved, 'SKILL.md')),
      'containment holds through the link and resolves to the real tree');
  });
});

test('rule 8: a skill dir overridden away from the well-known location is refused', () => {
  // planCleanup reports what the oracle read from the configured skill dirs,
  // while applyCleanup derives what it deletes from the ANCHOR. For every
  // shipped caller those are the same directory (neither the CLI nor
  // /mccp:setup passes an override); this predicate is what keeps them the
  // same, so a plan can never describe one directory while the deletion
  // removes another.
  withTempDir((dir) => {
    const o = opts(dir, { projectSkillDir: path.join(dir, 'somewhere-else', 'impeccable') });
    refuses(() => cleanup._internals.assertStandardLocation(o, 'project'),
      R.NON_STANDARD_LOCATION, 'overridden project dir');
    // The un-overridden pair is accepted, which is what every real caller does.
    const std = opts(dir);
    assert.doesNotThrow(() => cleanup._internals.assertStandardLocation(std, 'project'));
    assert.doesNotThrow(() => cleanup._internals.assertStandardLocation(std, 'user'));
  });
});

test('no configuration this oracle can produce makes a copy removable', () => {
  // The honest statement of what rules 1+2+6+7 add up to, and the tripwire for
  // the day that stops being true. A bare source either wins (rule 1 protects
  // it) or is one of two (rule 6 refuses both); a plugin row is never a target
  // (rule 2); and an env-forced resolution names no winner at all (rule 7). So
  // `removable` is empty in every arrangement, and the deletion half of this
  // module is unreachable today. If a later change to the resolution order
  // makes one of these produce a removable row, this test goes red and the
  // deletion path needs end-to-end cover again before it ships.
  withTempDir((dir) => {
    const cases = [
      ['project only', (o) => { writeSkill(o.projectSkillDir, '3.5.0'); }],
      ['user only', (o) => { writeSkill(o.userSkillDir, '4.0.0'); }],
      ['both bare (shadowed)', (o) => {
        writeSkill(o.projectSkillDir, '3.5.0'); writeSkill(o.userSkillDir, '4.0.0');
      }],
      ['nothing at all', () => {}],
    ];
    cases.forEach(([label, arrange], i) => {
      const sub = path.join(dir, 'case-' + i);
      fs.mkdirSync(sub, { recursive: true });
      const o = opts(sub);
      arrange(o);
      withEnv(NO_ENV, () => {
        assert.deepStrictEqual(cleanup.planCleanup(o).removable, [],
          label + ': removable must be empty');
      });
      withEnv({ MCCP_IMPECCABLE_SKILL: 'available' }, () => {
        assert.deepStrictEqual(cleanup.planCleanup(o).removable, [],
          label + ' (env-forced): removable must be empty');
      });
    });
  });
});

test('every thrown reason is a member of the closed enum', () => {
  // A reason that is not in REASONS reaches a caller as an unbranchable string.
  const seen = [R.NOT_INSTALLED, R.AMBIGUOUS_WINNER, R.UNVERIFIABLE_WINNER,
    R.NON_STANDARD_LOCATION, R.IS_WINNER, R.UNKNOWN_SOURCE,
    R.NOT_ECLIPSED, R.TARGET_MISSING, R.SYMLINK_PATH, R.PATH_ESCAPE, R.NOT_CONFIRMED,
    R.GIT_RM_FAILED, R.PARTIAL_REMOVAL, R.RACED];
  seen.forEach(function (r) {
    assert.ok(cleanup.REASON_VALUES.indexOf(r) !== -1, 'reason escaped the enum: ' + r);
  });
});
