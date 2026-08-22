'use strict';

// impeccable-resolve — channel-combination matrix for resolveImpeccable().
//
// The pre-M1 probe answered "is impeccable installed?" with a boolean, and got
// it wrong in both directions: it missed a plugin whose registry key carried a
// different marketplace suffix, and it counted an empty directory as installed.
// These cases pin the replacement contract — every source enumerated, the real
// version read, and ONE invocation named — plus the two things the oracle must
// refuse to answer (an ambiguous bare winner, and a version it cannot read).
//
// Every filesystem path is injected. That is not incidental: `projectSkillDir`
// now defaults to <repoRoot>/.claude/skills/impeccable, and this repository has
// a real copy there, so a case that forgets to inject would silently assert
// against the developer's own checkout instead of its fixture.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const detector = require('../impeccable-detect');

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-impeccable-resolve-'));
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

// Mirrors the shape of a real SKILL.md head: frontmatter fence, a long
// description line, then `version`. Keeping the description long is deliberate
// — it is what pushes `version` off byte 0 and exercises the bounded read.
function writeSkill(dir, version, opts) {
  const o = opts || {};
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'SKILL.md');
  let body;
  if (o.noFrontmatter) {
    body = '# impeccable\n\nNo frontmatter here.\n';
  } else if (o.brokenFence) {
    body = '---\nname: impeccable\nversion: ' + (version || '9.9.9') + '\n\nnever closed\n';
  } else {
    const lines = ['---', 'name: impeccable', 'description: ' + 'x'.repeat(400)];
    if (version !== null && version !== undefined) lines.push('version: ' + version);
    lines.push('user-invocable: true', '---', '', 'body');
    body = lines.join('\n');
  }
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

// `key` is the registry key verbatim. The real one observed on a default
// install is `impeccable@impeccable`; `impeccable@anthropics` is kept as its
// own case because prefix matching is what carries that back-compat.
function writePluginsManifest(dir, entries) {
  const file = path.join(dir, 'installed_plugins.json');
  const plugins = {};
  (entries || []).forEach(function (e) {
    plugins[e.key] = [{ scope: 'user', version: e.version || null, installPath: e.installPath }];
  });
  fs.writeFileSync(file, JSON.stringify({ version: 2, plugins: plugins }), 'utf8');
  return file;
}

// A plugin install tree: <base>/skills/<name>/SKILL.md
function writePluginTree(base, name, version) {
  const skillDir = path.join(base, 'skills', name);
  writeSkill(skillDir, version);
  return base;
}

// Absent-by-construction paths, so a case that means "no source here" cannot
// accidentally pick up a real one.
function absent(dir, label) {
  return path.join(dir, 'absent-' + label);
}

function resolveIn(dir, over) {
  const base = {
    repoRoot: dir,
    installedPluginsPath: absent(dir, 'manifest.json'),
    projectSkillDir: absent(dir, 'project'),
    userSkillDir: absent(dir, 'user'),
  };
  return detector.resolveImpeccable(Object.assign(base, over || {}));
}

const NO_ENV = { MCCP_IMPECCABLE_SKILL: undefined };

// === Channel matrix (plan Task 4) ===

test('plugin only (impeccable@impeccable): namespaced invocation, manifest version', () => {
  withTempDir((dir) => {
    const install = writePluginTree(path.join(dir, 'cache'), 'impeccable', '4.1.1');
    const manifest = writePluginsManifest(dir, [
      { key: 'impeccable@impeccable', version: '4.1.1', installPath: install },
    ]);
    withEnv(NO_ENV, () => {
      const r = resolveIn(dir, { installedPluginsPath: manifest });
      assert.strictEqual(r.available, true);
      assert.strictEqual(r.reason, 'ok');
      assert.strictEqual(r.source, 'plugin');
      assert.strictEqual(r.invocation, 'impeccable:impeccable');
      assert.strictEqual(r.version, '4.1.1');
      assert.strictEqual(r.shadowed, false);
      assert.strictEqual(r.sources.length, 1);
    });
  });
});

test('plugin only (legacy impeccable@anthropics key): prefix match carries back-compat', () => {
  withTempDir((dir) => {
    const install = writePluginTree(path.join(dir, 'cache'), 'impeccable', '4.0.0');
    const manifest = writePluginsManifest(dir, [
      { key: 'impeccable@anthropics', version: '4.0.0', installPath: install },
    ]);
    withEnv(NO_ENV, () => {
      const r = resolveIn(dir, { installedPluginsPath: manifest });
      assert.strictEqual(r.available, true);
      assert.strictEqual(r.source, 'plugin');
      assert.strictEqual(r.invocation, 'impeccable:impeccable');
      assert.strictEqual(r.version, '4.0.0');
    });
  });
});

test('plugin only with stale installPath: not-installed, never counted', () => {
  withTempDir((dir) => {
    const manifest = writePluginsManifest(dir, [
      { key: 'impeccable@impeccable', version: '4.1.1', installPath: path.join(dir, 'gone') },
    ]);
    withEnv(NO_ENV, () => {
      const r = resolveIn(dir, { installedPluginsPath: manifest });
      assert.strictEqual(r.available, false);
      assert.strictEqual(r.reason, 'not-installed');
      assert.strictEqual(r.invocation, null);
      assert.deepStrictEqual(r.sources, []);
    });
  });
});

test('unrelated plugin (impeccable-foo@x) does not match the prefix', () => {
  withTempDir((dir) => {
    const install = writePluginTree(path.join(dir, 'cache'), 'impeccable', '1.0.0');
    const manifest = writePluginsManifest(dir, [
      { key: 'impeccable-foo@x', version: '1.0.0', installPath: install },
    ]);
    withEnv(NO_ENV, () => {
      const r = resolveIn(dir, { installedPluginsPath: manifest });
      assert.strictEqual(r.available, false);
      assert.deepStrictEqual(r.sources, []);
    });
  });
});

test('project-local only: bare invocation, frontmatter version', () => {
  withTempDir((dir) => {
    const projectDir = path.join(dir, '.claude', 'skills', 'impeccable');
    writeSkill(projectDir, '3.5.0');
    withEnv(NO_ENV, () => {
      const r = resolveIn(dir, { projectSkillDir: projectDir });
      assert.strictEqual(r.available, true);
      assert.strictEqual(r.source, 'project');
      assert.strictEqual(r.invocation, 'impeccable');
      assert.strictEqual(r.version, '3.5.0');
      assert.strictEqual(r.shadowed, false);
    });
  });
});

test('user-level only: bare invocation', () => {
  withTempDir((dir) => {
    const userDir = path.join(dir, 'home', 'skills', 'impeccable');
    writeSkill(userDir, '3.4.0');
    withEnv(NO_ENV, () => {
      const r = resolveIn(dir, { userSkillDir: userDir });
      assert.strictEqual(r.available, true);
      assert.strictEqual(r.source, 'user');
      assert.strictEqual(r.invocation, 'impeccable');
      assert.strictEqual(r.version, '3.4.0');
    });
  });
});

test('project + user: ambiguous winner is reported as unknown, not guessed', () => {
  withTempDir((dir) => {
    const projectDir = path.join(dir, '.claude', 'skills', 'impeccable');
    const userDir = path.join(dir, 'home', 'skills', 'impeccable');
    writeSkill(projectDir, '3.5.0');
    writeSkill(userDir, '3.4.0');
    withEnv(NO_ENV, () => {
      const r = resolveIn(dir, { projectSkillDir: projectDir, userSkillDir: userDir });
      assert.strictEqual(r.available, true);
      assert.strictEqual(r.shadowed, true);
      assert.strictEqual(r.version, null);
      assert.strictEqual(r.sources.length, 2);
      // Implement-Codex F3 — the whole promise of this oracle is to name the
      // body that actually opens. When two bare sources exist that order has
      // never been measured, so naming EITHER one would be the most damaging
      // thing it could do. source and path must be null too, not just version.
      assert.strictEqual(r.source, null);
      assert.strictEqual(r.path, null);
      // The NAME is still known — both bare sources answer to it.
      assert.strictEqual(r.invocation, 'impeccable');
    });
  });
});

test('plugin + project: different names, so no shadowing; bare wins', () => {
  withTempDir((dir) => {
    const install = writePluginTree(path.join(dir, 'cache'), 'impeccable', '4.1.1');
    const manifest = writePluginsManifest(dir, [
      { key: 'impeccable@impeccable', version: '4.1.1', installPath: install },
    ]);
    const projectDir = path.join(dir, '.claude', 'skills', 'impeccable');
    writeSkill(projectDir, '3.5.0');
    withEnv(NO_ENV, () => {
      const r = resolveIn(dir, { installedPluginsPath: manifest, projectSkillDir: projectDir });
      assert.strictEqual(r.available, true);
      assert.strictEqual(r.shadowed, false);
      assert.strictEqual(r.source, 'project');
      assert.strictEqual(r.invocation, 'impeccable');
      assert.strictEqual(r.version, '3.5.0');
      assert.strictEqual(r.sources.length, 2);
      const kinds = r.sources.map((s) => s.source).sort();
      assert.deepStrictEqual(kinds, ['plugin', 'project']);
    });
  });
});

test('empty skill directory (no SKILL.md) is NOT installed — behaviour-change anchor', () => {
  withTempDir((dir) => {
    const projectDir = path.join(dir, '.claude', 'skills', 'impeccable');
    const userDir = path.join(dir, 'home', 'skills', 'impeccable');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(userDir, { recursive: true });
    withEnv(NO_ENV, () => {
      const r = resolveIn(dir, { projectSkillDir: projectDir, userSkillDir: userDir });
      assert.strictEqual(r.available, false);
      assert.strictEqual(r.reason, 'not-installed');
      assert.deepStrictEqual(r.sources, []);
    });
  });
});

test('nothing installed anywhere: not-installed with an empty enumeration', () => {
  withTempDir((dir) => {
    withEnv(NO_ENV, () => {
      const r = resolveIn(dir);
      assert.strictEqual(r.available, false);
      assert.strictEqual(r.reason, 'not-installed');
      assert.strictEqual(r.invocation, null);
      assert.strictEqual(r.source, null);
      assert.strictEqual(r.version, null);
      assert.strictEqual(r.path, null);
      assert.deepStrictEqual(r.sources, []);
      assert.strictEqual(r.shadowed, false);
    });
  });
});

test('MCCP_IMPECCABLE_SKILL=missing beats every real source and enumerates none', () => {
  withTempDir((dir) => {
    const install = writePluginTree(path.join(dir, 'cache'), 'impeccable', '4.1.1');
    const manifest = writePluginsManifest(dir, [
      { key: 'impeccable@impeccable', version: '4.1.1', installPath: install },
    ]);
    const projectDir = path.join(dir, '.claude', 'skills', 'impeccable');
    writeSkill(projectDir, '3.5.0');
    withEnv({ MCCP_IMPECCABLE_SKILL: 'missing' }, () => {
      const r = resolveIn(dir, { installedPluginsPath: manifest, projectSkillDir: projectDir });
      assert.strictEqual(r.available, false);
      assert.strictEqual(r.reason, 'env-forced-missing');
      // Enumerating sources we were told to ignore would only invite a caller
      // to reach past the override.
      assert.deepStrictEqual(r.sources, []);
    });
  });
});

test('MCCP_IMPECCABLE_SKILL=available asserts the name resolves, not which body', () => {
  withTempDir((dir) => {
    withEnv({ MCCP_IMPECCABLE_SKILL: 'available' }, () => {
      const r = resolveIn(dir);
      assert.strictEqual(r.available, true);
      assert.strictEqual(r.reason, 'env-forced-available');
      assert.strictEqual(r.source, 'env');
      assert.strictEqual(r.invocation, 'impeccable');
      assert.strictEqual(r.version, null);
      assert.strictEqual(r.path, null);
      assert.strictEqual(r.shadowed, false);
    });
  });
});

// === Task 2 — bounded frontmatter version read ===

test('version reader: real 4.1.1-shaped and 3.5.0-shaped frontmatter', () => {
  withTempDir((dir) => {
    const a = writeSkill(path.join(dir, 'a'), '4.1.1');
    const b = writeSkill(path.join(dir, 'b'), '3.5.0');
    assert.strictEqual(detector.readFrontmatterVersion(a), '4.1.1');
    assert.strictEqual(detector.readFrontmatterVersion(b), '3.5.0');
  });
});

test('version reader: absent frontmatter, absent key, unclosed fence, missing file all yield null', () => {
  withTempDir((dir) => {
    const none = writeSkill(path.join(dir, 'none'), null, { noFrontmatter: true });
    const noKey = writeSkill(path.join(dir, 'nokey'), null);
    const broken = writeSkill(path.join(dir, 'broken'), '9.9.9', { brokenFence: true });
    assert.strictEqual(detector.readFrontmatterVersion(none), null);
    assert.strictEqual(detector.readFrontmatterVersion(noKey), null);
    assert.strictEqual(detector.readFrontmatterVersion(broken), null);
    assert.strictEqual(detector.readFrontmatterVersion(path.join(dir, 'nope', 'SKILL.md')), null);
  });
});

test('version reader: a quoted value is unquoted, an empty value is null', () => {
  withTempDir((dir) => {
    const quoted = path.join(dir, 'q');
    fs.mkdirSync(quoted, { recursive: true });
    fs.writeFileSync(path.join(quoted, 'SKILL.md'), '---\nname: x\nversion: "2.0.1"\n---\n', 'utf8');
    assert.strictEqual(detector.readFrontmatterVersion(path.join(quoted, 'SKILL.md')), '2.0.1');

    const empty = path.join(dir, 'e');
    fs.mkdirSync(empty, { recursive: true });
    fs.writeFileSync(path.join(empty, 'SKILL.md'), '---\nname: x\nversion:\n---\n', 'utf8');
    assert.strictEqual(detector.readFrontmatterVersion(path.join(empty, 'SKILL.md')), null);
  });
});

test('version reader: a version beyond the bounded window reads as unknown, not as a throw', () => {
  withTempDir((dir) => {
    const big = path.join(dir, 'big');
    fs.mkdirSync(big, { recursive: true });
    const filler = 'note: ' + 'y'.repeat(detector.FRONTMATTER_READ_BYTES + 512);
    fs.writeFileSync(
      path.join(big, 'SKILL.md'),
      '---\nname: x\n' + filler + '\nversion: 5.0.0\n---\n',
      'utf8'
    );
    // Honest degradation: the read is bounded on purpose, so a version pushed
    // past the window is reported as unknown rather than guessed at.
    assert.strictEqual(detector.readFrontmatterVersion(path.join(big, 'SKILL.md')), null);
  });
});

// === Security absorptions (security-reviewer 1A / 1B / 2B) ===

test('1A: a skill directory whose name is not a plain identifier is not counted', () => {
  withTempDir((dir) => {
    const base = path.join(dir, 'cache');
    // `path.join` would collapse a literal `..`; the point of the whitelist is
    // that any name carrying separator or dot syntax never reaches path.join
    // OR the invocation string. A dotted name exercises the same rule.
    writeSkill(path.join(base, 'skills', '..evil'), '1.0.0');
    const manifest = writePluginsManifest(dir, [
      { key: 'impeccable@impeccable', version: '1.0.0', installPath: base },
    ]);
    withEnv(NO_ENV, () => {
      const r = resolveIn(dir, { installedPluginsPath: manifest });
      assert.strictEqual(r.available, false);
      assert.deepStrictEqual(r.sources, []);
    });
  });
});

// No skip option: both arms of the old ternary were falsy, so it never skipped
// anything and only read as though it did. The platform difference is handled
// where it actually shows up — the symlink call below.
test('1B: a symlinked skill directory is not counted', () => {
  withTempDir((dir) => {
    const real = path.join(dir, 'real');
    writeSkill(real, '3.5.0');
    const link = path.join(dir, 'linked');
    try {
      fs.symlinkSync(real, link, 'dir');
    } catch (_e) {
      // Windows without developer mode cannot create symlinks; the guard is
      // still compiled in, it just cannot be exercised here.
      return;
    }
    withEnv(NO_ENV, () => {
      const r = resolveIn(dir, { projectSkillDir: link });
      assert.strictEqual(r.available, false);
    });
  });
});

test('2B: a non-regular SKILL.md is refused instead of being read', () => {
  withTempDir((dir) => {
    const skillDir = path.join(dir, '.claude', 'skills', 'impeccable');
    fs.mkdirSync(path.join(skillDir, 'SKILL.md'), { recursive: true });
    // A directory stands in for the FIFO/device case: both are non-regular, and
    // both must be rejected by the same isFile() gate BEFORE any read happens.
    withEnv(NO_ENV, () => {
      const r = resolveIn(dir, { projectSkillDir: skillDir });
      assert.strictEqual(r.available, false);
    });
  });
});

// === Reported paths ===

test('a source inside the repo is reported repo-relative, not as an absolute path', () => {
  withTempDir((dir) => {
    const projectDir = path.join(dir, '.claude', 'skills', 'impeccable');
    writeSkill(projectDir, '3.5.0');
    withEnv(NO_ENV, () => {
      const r = resolveIn(dir, { projectSkillDir: projectDir });
      assert.strictEqual(r.path, '.claude/skills/impeccable/SKILL.md');
      assert.ok(!path.isAbsolute(r.path), 'reported path must not be absolute');
    });
  });
});

// === The contract that actually matters (plan Success Metric 2) ===

test('the oracle emits the exact field name the command bodies read', () => {
  withTempDir((dir) => {
    const projectDir = path.join(dir, '.claude', 'skills', 'impeccable');
    writeSkill(projectDir, '3.5.0');
    withEnv(NO_ENV, () => {
      const r = resolveIn(dir, { projectSkillDir: projectDir });
      assert.strictEqual(r.invocation, 'impeccable', 'a bare source still answers to the bare name');

      // Until v1.31.3 this test read the literal call names out of the command
      // bodies and asserted the resolved name was among them. The rewiring
      // removed every literal, and the assertion would then have passed on the
      // strength of ONE sentence in plan-prd.md — a body that never calls
      // impeccable at all. It was not checking wiring; it was checking prose.
      //
      // What matters now is the seam that replaced the literal: the bodies read
      // a named field out of this oracle's JSON. Assert THAT name, from both
      // sides, so the two cannot drift apart silently.
      const fields = detector.detect({
        mode: 'implement',
        repoRoot: dir,
        installedPluginsPath: absent(dir, 'manifest.json'),
        projectSkillDir: projectDir,
        userSkillDir: absent(dir, 'user'),
      });
      assert.ok(Object.prototype.hasOwnProperty.call(fields, 'impeccable_invocation'),
        'detect() must expose impeccable_invocation');
      assert.strictEqual(fields.impeccable_invocation, r.invocation);

      const commandsDir = path.join(__dirname, '..', '..', '..', 'commands');
      const callers = ['plan.md', 'prp-implement.md', 'pr.md', 'code-review.md'];
      callers.forEach((f) => {
        const src = fs.readFileSync(path.join(commandsDir, f), 'utf8');
        assert.ok(src.includes('impeccable_invocation'),
          f + ' must read the invocation from the oracle rather than hardcode one');
      });
    });
  });
});

// === probeSkillAvailable stays the boolean face of the same oracle ===

test('probeSkillAvailable returns exactly resolveImpeccable().available', () => {
  withTempDir((dir) => {
    const projectDir = path.join(dir, '.claude', 'skills', 'impeccable');
    withEnv(NO_ENV, () => {
      const opts = {
        repoRoot: dir,
        installedPluginsPath: absent(dir, 'manifest.json'),
        projectSkillDir: projectDir,
        userSkillDir: absent(dir, 'user'),
      };
      assert.strictEqual(detector.probeSkillAvailable(opts), false);
      writeSkill(projectDir, '3.5.0');
      assert.strictEqual(detector.probeSkillAvailable(opts), true);
      assert.strictEqual(
        detector.probeSkillAvailable(opts),
        detector.resolveImpeccable(opts).available
      );
    });
  });
});

// === eclipsed: the non-winning sources, named (M3 Task 1) ===

test('eclipsed (i): with one winner, it is exactly the non-winner rows', () => {
  withTempDir((dir) => {
    const projectDir = path.join(dir, '.claude', 'skills', 'impeccable');
    writeSkill(projectDir, '3.5.0');
    const pluginBase = path.join(dir, 'plugin-a');
    writePluginTree(pluginBase, 'impeccable', '4.1.1');
    const manifest = writePluginsManifest(dir, [
      { key: 'impeccable@impeccable', version: '4.1.1', installPath: pluginBase },
    ]);
    withEnv(NO_ENV, () => {
      const r = resolveIn(dir, { projectSkillDir: projectDir, installedPluginsPath: manifest });
      assert.strictEqual(r.source, 'project', 'bare source decides the winner');
      assert.strictEqual(r.sources.length, 2);
      assert.strictEqual(r.eclipsed.length, 1);
      assert.strictEqual(r.eclipsed[0].source, 'plugin');
      assert.strictEqual(r.eclipsed[0].invocation, 'impeccable:impeccable');
      // Set equality with "every enumerated row that is not the winner", by identity.
      const winner = r.sources.filter((s) => s.source === 'project')[0];
      const expected = r.sources.filter((s) => s !== winner);
      assert.deepStrictEqual(r.eclipsed, expected);
      assert.ok(!r.eclipsed.includes(winner), 'winner must not appear in its own eclipsed list');
    });
  });
});

test('eclipsed (i-dup): duplicate rows sharing source+invocation+path exclude only the winner', () => {
  // Regression for Implement-Codex R1 F5. Two registry keys pointing at ONE
  // install tree produce two rows with an identical (source, invocation, path)
  // triple. A field comparison would mark both as the winner and report zero
  // eclipsed while two bodies are enumerated; identity exclusion drops exactly
  // one. pluginNameFromRegistryKey returns the literal name "impeccable" for
  // every key the matcher admits, so the two invocations really are identical.
  withTempDir((dir) => {
    const pluginBase = path.join(dir, 'plugin-shared');
    writePluginTree(pluginBase, 'impeccable', '4.1.1');
    const manifest = writePluginsManifest(dir, [
      { key: 'impeccable@impeccable', version: '4.1.1', installPath: pluginBase },
      { key: 'impeccable@mirror', version: '4.1.1', installPath: pluginBase },
    ]);
    withEnv(NO_ENV, () => {
      const r = resolveIn(dir, { installedPluginsPath: manifest });
      assert.strictEqual(r.sources.length, 2, 'both registry entries enumerate');
      assert.strictEqual(r.sources[0].invocation, r.sources[1].invocation,
        'fixture precondition: the two rows share an invocation');
      assert.strictEqual(r.sources[0].path, r.sources[1].path,
        'fixture precondition: the two rows share a path');
      assert.strictEqual(r.eclipsed.length, 1,
        'identity exclusion drops exactly one row, not both and not neither');
      const eclipsedIsAnEnumeratedRow = r.sources.indexOf(r.eclipsed[0]) !== -1;
      assert.ok(eclipsedIsAnEnumeratedRow, 'the eclipsed row is one of the enumerated objects');
    });
  });
});

test('eclipsed (ii): shadowed:true reports an EMPTY list even with two sources', () => {
  withTempDir((dir) => {
    const projectDir = path.join(dir, '.claude', 'skills', 'impeccable');
    const userDir = path.join(dir, 'home', '.claude', 'skills', 'impeccable');
    writeSkill(projectDir, '3.5.0');
    writeSkill(userDir, '4.0.0');
    withEnv(NO_ENV, () => {
      const r = resolveIn(dir, { projectSkillDir: projectDir, userSkillDir: userDir });
      assert.strictEqual(r.shadowed, true);
      assert.strictEqual(r.source, null, 'no winner is named');
      assert.strictEqual(r.sources.length, 2, 'both bodies are still enumerated');
      assert.deepStrictEqual(r.eclipsed, [],
        'naming the eclipsed set requires naming the winner; refuse instead of guessing');
    });
  });
});

test('eclipsed (iii): one-or-zero sources, and available:false, are all empty', () => {
  withTempDir((dir) => {
    const projectDir = path.join(dir, '.claude', 'skills', 'impeccable');
    writeSkill(projectDir, '3.5.0');
    withEnv(NO_ENV, () => {
      const one = resolveIn(dir, { projectSkillDir: projectDir });
      assert.strictEqual(one.sources.length, 1);
      assert.deepStrictEqual(one.eclipsed, [], 'a lone winner eclipses nothing');

      const none = resolveIn(dir);
      assert.strictEqual(none.available, false);
      assert.deepStrictEqual(none.eclipsed, []);
    });
    withEnv({ MCCP_IMPECCABLE_SKILL: 'missing' }, () => {
      const forced = resolveIn(dir, { projectSkillDir: projectDir });
      assert.strictEqual(forced.available, false);
      assert.deepStrictEqual(forced.sources, [], 'forced-missing enumerates nothing');
      assert.deepStrictEqual(forced.eclipsed, []);
    });
    withEnv({ MCCP_IMPECCABLE_SKILL: 'available' }, () => {
      const forced = resolveIn(dir, { projectSkillDir: projectDir });
      assert.strictEqual(forced.source, 'env');
      // The env row wins outright, so the real project copy it overrode is
      // eclipsed BY it. That is the honest reading: the body on disk exists and
      // is not what the override says will answer.
      assert.strictEqual(forced.eclipsed.length, 1);
      assert.strictEqual(forced.eclipsed[0].source, 'project');
    });
  });
});

test('eclipsed (iv): every detect() return branch carries impeccable_eclipsed', () => {
  withTempDir((dir) => {
    const projectDir = path.join(dir, '.claude', 'skills', 'impeccable');
    writeSkill(projectDir, '3.5.0');
    const base = {
      repoRoot: dir,
      installedPluginsPath: absent(dir, 'manifest.json'),
      projectSkillDir: projectDir,
      userSkillDir: absent(dir, 'user'),
    };
    withEnv(NO_ENV, () => {
      // The three places detect() returns from. The M1 regression this guards
      // was a return that omitted the reporting fields entirely, so the check
      // is PRESENCE of the key, not a truthy value.
      const branches = [
        ['mode-mismatch', detector.detect(Object.assign({}, base))],
        ['unsafe-plan-path', detector.detect(Object.assign({ mode: 'plan', planPath: '../escape.md' }, base))],
        ['normal', detector.detect(Object.assign({ mode: 'implement' }, base))],
      ];
      branches.forEach((pair) => {
        const label = pair[0];
        const result = pair[1];
        assert.ok(
          Object.prototype.hasOwnProperty.call(result, 'impeccable_eclipsed'),
          label + ': detect() must carry impeccable_eclipsed'
        );
        assert.ok(Array.isArray(result.impeccable_eclipsed), label + ': must be an array');
      });
      assert.notStrictEqual(branches[1][1].reason, 'ok',
        'fixture precondition: the plan path was actually rejected');
    });
  });
});
