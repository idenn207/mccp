'use strict';

// Dashboard Truthfulness M2 (Codex R1 F2/F3) — host-version fallback ladder.
// Pure function with injected fsRead/gitDescribe — no real fs/git touched.

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveHostVersion } = require('../host-version');

// fsRead factory — throws ENOENT for any basename not in the map (mirrors
// fs.readFileSync on a missing file).
function fsReadFrom(map) {
  return (p) => {
    const base = String(p).split(/[\\/]/).pop();
    if (Object.prototype.hasOwnProperty.call(map, base)) return map[base];
    const err = new Error('ENOENT: ' + p);
    err.code = 'ENOENT';
    throw err;
  };
}
const throwAll = () => { throw new Error('ENOENT'); };
const nilGit = () => null;

test('host-version — host meta (package.json) is authoritative (rung 1)', () => {
  const r = resolveHostVersion('/repo', {
    fsRead: fsReadFrom({ 'package.json': '{"name":"x","version":"2.3.4"}' }),
    gitDescribe: () => 'v9.9.9',
    plans: [],
  });
  assert.equal(r.version, '2.3.4');
  assert.equal(r.source, 'meta:package.json');
  assert.equal(r.degraded, false);
});

test('host-version — pyproject.toml version (rung 1, toml)', () => {
  const r = resolveHostVersion('/repo', {
    fsRead: fsReadFrom({ 'pyproject.toml': '[project]\nname = "x"\nversion = "1.2.3"\n' }),
    gitDescribe: nilGit, plans: [],
  });
  assert.equal(r.version, '1.2.3');
  assert.equal(r.source, 'meta:pyproject.toml');
});

test('host-version — Cargo.toml version (rung 1, toml)', () => {
  const r = resolveHostVersion('/repo', {
    fsRead: fsReadFrom({ 'Cargo.toml': "[package]\nname = 'x'\nversion = '0.5.0'\n" }),
    gitDescribe: nilGit, plans: [],
  });
  assert.equal(r.version, '0.5.0');
  assert.equal(r.source, 'meta:Cargo.toml');
});

test('host-version — CHANGELOG top heading (rung 2) beats git tag', () => {
  const r = resolveHostVersion('/repo', {
    fsRead: fsReadFrom({ 'CHANGELOG.md': '# Changelog\n\n## [1.18.3] — 2026-06-24\n\nbody\n' }),
    gitDescribe: () => 'v1.0.0',
    plans: [],
  });
  assert.equal(r.version, '1.18.3');
  assert.equal(r.source, 'changelog');
});

test('host-version — unreleased CHANGELOG heading skipped, first SemVer wins', () => {
  const r = resolveHostVersion('/repo', {
    fsRead: fsReadFrom({ 'CHANGELOG.md': '## [Unreleased]\n\n## [1.17.0] — 2026\n' }),
    gitDescribe: nilGit, plans: [],
  });
  assert.equal(r.version, '1.17.0');
  assert.equal(r.source, 'changelog');
});

test('host-version — git describe tag (rung 3), v-prefix stripped', () => {
  const r = resolveHostVersion('/repo', {
    fsRead: throwAll,
    gitDescribe: () => 'v1.0.0',
    plans: [],
  });
  assert.equal(r.version, '1.0.0');
  assert.equal(r.source, 'git-tag');
});

test('host-version — latest plan cycle (rung 4) framed as cycle, not version claim', () => {
  const r = resolveHostVersion('/repo', {
    fsRead: throwAll,
    gitDescribe: nilGit,
    plans: [
      { path: '.claude/plans/v1-12-0-old.plan.md', slug: 'v1-12-0-old' },
      { path: '.claude/plans/v1-13-0-foo-m3.plan.md', slug: 'v1-13-0-foo-m3' },
    ],
  });
  assert.equal(r.version, '1.13.0');
  assert.equal(r.source, 'plan-cycle');
  assert.equal(r.latest_plan, 'v1-13-0-foo-m3.plan.md');
});

test('host-version — all miss → honest unknown (rung 5)', () => {
  const r = resolveHostVersion('/repo', { fsRead: throwAll, gitDescribe: nilGit, plans: [] });
  assert.equal(r.version, null);
  assert.equal(r.source, 'unknown');
});

test('host-version — meta ↔ CHANGELOG disagreement: meta wins, source labels it (F3)', () => {
  const r = resolveHostVersion('/repo', {
    fsRead: fsReadFrom({
      'package.json': '{"version":"2.0.0"}',
      'CHANGELOG.md': '## [1.18.3]\n',
    }),
    gitDescribe: nilGit, plans: [],
  });
  assert.equal(r.version, '2.0.0', 'authoritative meta wins');
  assert.equal(r.source, 'meta:package.json', 'source exposes which signal was used');
});

test('host-version — loud fail-open: gitDescribe throws → degraded, never throws, falls through', () => {
  const boom = () => { throw new Error('git not found'); };
  const r = resolveHostVersion('/repo', { fsRead: throwAll, gitDescribe: boom, plans: [] });
  assert.equal(r.version, null);
  assert.equal(r.source, 'unknown');
  assert.equal(r.degraded, true);
  assert.ok(r.error && r.error.indexOf('git') !== -1);
});

test('host-version — allowGit:false skips git rung entirely (derive spawn-free contract)', () => {
  // No meta, no CHANGELOG, allowGit:false, gitDescribe would throw if called.
  const boom = () => { throw new Error('git MUST NOT be spawned'); };
  const r = resolveHostVersion('/repo', {
    fsRead: throwAll, gitDescribe: boom, allowGit: false,
    plans: [{ path: '.claude/plans/v2-0-0-x.plan.md', slug: 'v2-0-0-x' }],
  });
  // git rung skipped → falls straight to plan-cycle (rung 4), no spawn, no throw.
  assert.equal(r.version, '2.0.0');
  assert.equal(r.source, 'plan-cycle');
  assert.equal(r.degraded, false);
});

test('host-version — plugin manifest is never read (PRD: plugin self-version invisible)', () => {
  // Only a plugin.json under plugins/ exists — must NOT be picked up.
  const r = resolveHostVersion('/repo', {
    fsRead: (p) => {
      if (String(p).split(/[\\/]/).pop() === 'package.json' && /plugins/.test(p)) {
        return '{"version":"9.9.9"}';
      }
      const err = new Error('ENOENT'); err.code = 'ENOENT'; throw err;
    },
    gitDescribe: nilGit, plans: [],
  });
  // Root package.json (the one resolveHostVersion reads) is absent → unknown,
  // because the only readable manifest sits under plugins/ which is never read.
  assert.equal(r.version, null);
  assert.equal(r.source, 'unknown');
});
