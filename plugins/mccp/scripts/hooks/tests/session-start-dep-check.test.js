'use strict';

// session-start-dep-check — the missing-dependency banner, end to end.
//
// The banner predicate moved from the PATH probe to the skill oracle in M2, and
// the interesting part is not the predicate but the ARGUMENT: session-start has
// to hand its resolved repo root to checkAll(), or the oracle falls back to
// process.cwd() and misses a project-local install whenever the hook runs from
// a nested directory.
//
// Testing the `missing` array in isolation would not see that. The hook is
// spawned for real.
//
// Two kinds of case, deliberately:
//   - env-forced (MCCP_IMPECCABLE_SKILL) proves the WIRING in both directions
//     cheaply. It cannot prove the repoRoot forward: that env axis is the
//     oracle's highest-precedence branch and short-circuits the filesystem walk
//     entirely, so an implementation that never threads repoRoot still passes.
//     (Implement-Codex R1a-F1.)
//   - filesystem cases with NO env, run from a nested cwd and with HOME
//     redirected so the plugin and user channels cannot answer. Only the
//     project channel can resolve, and only if repoRoot actually arrived.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const SESSION_START = path.resolve(__dirname, '..', 'session-start.js');

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-ss-depcheck-'));
  try { return fn(dir); } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) {}
  }
}

function initRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 't@t'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

function writeSkill(dir, version) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    ['---', 'name: impeccable', 'version: ' + version, 'user-invocable: true', '---', '', 'body'].join('\n'),
    'utf8'
  );
  return dir;
}

function runHook(cwd, envOverrides) {
  const env = Object.assign({}, process.env, {
    // The whole dep-check block is skipped when the user has opted out of
    // Codex, which would make every assertion here vacuously pass.
    MCCP_CODEX_DISABLED: '0',
  }, envOverrides || {});
  // Deleting rather than setting empty: the oracle treats '' as "not forced",
  // but an inherited value from the developer's own shell would decide these
  // cases instead of the fixture.
  if (envOverrides && envOverrides.MCCP_IMPECCABLE_SKILL === undefined) {
    delete env.MCCP_IMPECCABLE_SKILL;
  }
  const r = spawnSync(process.execPath, [SESSION_START], {
    cwd: cwd,
    input: '{"session_id":"test-dep-check"}',
    encoding: 'utf8',
    timeout: 30000,
    env: env,
  });
  return String(r.stdout || '') + '\n' + String(r.stderr || '');
}

// The banner names every missing dependency in one line, so "did it fire" is
// the wrong question — codex may legitimately be missing in a redirected HOME.
// The question is whether impeccable is among them.
function bannerNamesImpeccable(output) {
  const line = output.split(/\r?\n/).find((l) => l.includes('Missing dependencies:'));
  if (!line) return false;
  return /\bimpeccable\b/.test(line);
}

test('SessionStart: a resolved skill keeps impeccable out of the missing banner', () => {
  withTempDir((dir) => {
    initRepo(dir);
    const out = runHook(dir, { MCCP_IMPECCABLE_SKILL: 'available' });
    assert.strictEqual(
      bannerNamesImpeccable(out), false,
      'impeccable resolves, so the banner must not report it as missing:\n' + out.slice(0, 2000)
    );
  });
});

test('SessionStart: an unresolved skill still reaches the missing banner', () => {
  withTempDir((dir) => {
    initRepo(dir);
    const out = runHook(dir, { MCCP_IMPECCABLE_SKILL: 'missing' });
    assert.strictEqual(
      bannerNamesImpeccable(out), true,
      'impeccable does not resolve, so the banner must report it:\n' + out.slice(0, 2000)
    );
  });
});

// The repoRoot forward, without the env shortcut.
//
// HOME/USERPROFILE are redirected so ~/.claude/plugins and ~/.claude/skills
// cannot answer — on a developer machine the plugin channel resolves and would
// mask the defect. cwd is a NESTED directory, so a checkAll() called with no
// repoRoot resolves against that nested path, finds no .claude/skills/impeccable
// under it, and reports impeccable missing.
test('SessionStart: the project channel is found from a nested cwd (repoRoot is actually forwarded)', () => {
  withTempDir((dir) => {
    const repo = initRepo(path.join(dir, 'repo'));
    writeSkill(path.join(repo, '.claude', 'skills', 'impeccable'), '3.5.0');
    const nested = path.join(repo, 'packages', 'inner');
    fs.mkdirSync(nested, { recursive: true });
    const fakeHome = path.join(dir, 'home');
    fs.mkdirSync(fakeHome, { recursive: true });

    const out = runHook(nested, {
      MCCP_IMPECCABLE_SKILL: undefined,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
    });
    assert.strictEqual(
      bannerNamesImpeccable(out), false,
      'the project copy is one level up from cwd — this fails when checkAll() is '
        + 'called without repoRoot and the oracle falls back to process.cwd():\n' + out.slice(0, 2000)
    );
  });
});

// The counterpart. Without it the case above could pass for the wrong reason
// (an oracle that answers "available" no matter what would satisfy it too).
test('SessionStart: with no channel at all the banner still names impeccable', () => {
  withTempDir((dir) => {
    const repo = initRepo(path.join(dir, 'repo'));
    const nested = path.join(repo, 'packages', 'inner');
    fs.mkdirSync(nested, { recursive: true });
    const fakeHome = path.join(dir, 'home');
    fs.mkdirSync(fakeHome, { recursive: true });

    const out = runHook(nested, {
      MCCP_IMPECCABLE_SKILL: undefined,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
    });
    assert.strictEqual(
      bannerNamesImpeccable(out), true,
      'no channel can resolve here, so the banner must report impeccable:\n' + out.slice(0, 2000)
    );
  });
});

// --- eclipsed / shadowed banner (v1.31.3, code-review absorption) --------------
//
// The banner had no hook-level test, and that is why its rate-limit could be
// wrong without anything going red: it was gated on `!within24h` alone, while
// `dep_check_at` is re-stamped on EVERY session that runs dep-check. An
// operator opening a session daily would have seen it once, ever -- and a copy
// appearing or disappearing would not have brought it back. What follows pins
// the two halves that matter: it does not repeat unchanged, and it does repeat
// when the state changes.

function eclipsedBannerFired(output) {
  return output.split(/\r?\n/).some((l) =>
    l.includes('copies answer the same name') || l.includes('NOT opened'));
}

function writePluginChannel(home, version) {
  const installPath = path.join(home, 'plugin-install');
  writeSkill(path.join(installPath, 'skills', 'impeccable'), version);
  const pluginsDir = path.join(home, '.claude', 'plugins');
  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.writeFileSync(path.join(pluginsDir, 'installed_plugins.json'), JSON.stringify({
    plugins: { 'impeccable@impeccable': [{ installPath: installPath, version: version }] },
  }), 'utf8');
}

test('SessionStart: the eclipsed banner repeats only when the state changes', () => {
  withTempDir((dir) => {
    const repo = path.join(dir, 'repo');
    initRepo(repo);
    const home = path.join(dir, 'home');
    fs.mkdirSync(home, { recursive: true });
    // A bare project copy wins; the plugin copy is present and eclipsed.
    writeSkill(path.join(repo, '.claude', 'skills', 'impeccable'), '3.5.0');
    writePluginChannel(home, '4.1.1');
    const env = { HOME: home, USERPROFILE: home, MCCP_IMPECCABLE_SKILL: undefined };

    const first = runHook(repo, env);
    assert.ok(eclipsedBannerFired(first),
      'the first session must report the eclipsed copy:\n' + first.slice(0, 2000));

    const second = runHook(repo, env);
    assert.ok(!eclipsedBannerFired(second),
      'an unchanged state inside 24h must not repeat the banner:\n' + second.slice(0, 2000));

    // State changes: a second bare copy appears, so the install goes from
    // resolved-with-a-spare to ambiguous. The 24h clock has not moved -- only
    // the key has -- which is exactly the case the old gate stayed silent for.
    writeSkill(path.join(home, '.claude', 'skills', 'impeccable'), '4.0.0');
    const third = runHook(repo, env);
    assert.ok(eclipsedBannerFired(third),
      'a changed state must speak up even inside 24h:\n' + third.slice(0, 2000));
    assert.ok(third.includes('cannot tell which one opens'),
      'and it must be the shadowed sentence now:\n' + third.slice(0, 2000));
  });
});
