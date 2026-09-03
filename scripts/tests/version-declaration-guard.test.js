'use strict';

// scripts/version-declaration-guard.js 의 판별력 test.
//
// 이 가드는 "우산 결정 1을 어겼는가"를 판정하므로, 통과만 확인하는 test 는
// 무의미하다 — 아무것도 안 하는 스크립트도 통과한다. 그래서 **흔들면 붉어지고
// 되돌리면 통과하는지**를 축마다 확인한다(이 저장소가 검사 13·15에 요구한 형태).
//
// end-to-end 축은 임시 git 저장소를 세워 실제로 프로세스를 띄운다. 모듈 함수만
// 부르면 base 해소·git 호출·종료 코드가 전부 검증 밖으로 빠지는데, 그 셋이
// 이 가드가 CI 에서 하는 일의 전부다.

const test = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GUARD = path.join(__dirname, '..', 'version-declaration-guard.js');
const guard = require('../version-declaration-guard.js');

const MANIFEST = 'plugins/mccp/.claude-plugin/plugin.json';
const HTML = 'plugins/mccp/scripts/lib/renderer/html.js';
const MD = 'plugins/mccp/scripts/lib/renderer/markdown.js';
const CHANGELOG = 'CHANGELOG.md';

function write(root, rel, body) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
}

function seed(root, version) {
  write(root, MANIFEST, JSON.stringify({ name: 'mccp', version: version }, null, 2) + '\n');
  write(root, HTML,
    "parts.push('<footer role=\"contentinfo\" class=\"page-foot mono\">v" + version +
    " · derive-only</footer>');\n");
  write(root, MD, "out.push('_derived from .claude/ · v" + version + "_');\n");
  write(root, CHANGELOG,
    '# Changelog\n\n> manifest — currently `' + version + '`\n\n## [Unreleased]\n\n- seeded\n');
}

function makeRepo(baseVersion) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-'));
  const g = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  g(['init', '-q', '-b', 'main']);
  g(['config', 'user.email', 'test@example.com']);
  g(['config', 'user.name', 'test']);
  seed(root, baseVersion);
  g(['add', '-A']);
  g(['commit', '-qm', 'base']);
  g(['branch', 'base-ref']);
  return { root: root, git: g };
}

function run(root, env) {
  const r = spawnSync(process.execPath, [GUARD, '--base', 'base-ref', '--json'], {
    cwd: root,
    encoding: 'utf8',
    env: Object.assign({}, process.env, { MCCP_RELEASE_CUT: '' }, env || {}),
  });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_e) { /* non-json failure path */ }
  return { status: r.status, json: json, stderr: r.stderr };
}

test('clean branch: no version declaration passes', () => {
  const { root } = makeRepo('1.34.4');
  const r = run(root);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.json.ok, true);
  assert.deepStrictEqual(r.json.violations, []);
});

test('manifest bump is caught (the exact failure that shipped in PR #176)', () => {
  const { root } = makeRepo('1.34.4');
  seed(root, '1.34.5');
  const r = run(root);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.json.ok, false);
  const rules = r.json.violations.map((v) => v.rule);
  assert.ok(rules.includes('manifest-version-declared'), 'expected manifest-version-declared, got ' + rules);
});

test('half declaration is caught: footer moves while manifest stays', () => {
  const { root } = makeRepo('1.34.4');
  write(root, MD, "out.push('_derived from .claude/ · v1.34.5_');\n");
  const r = run(root);
  assert.strictEqual(r.status, 1);
  const rules = r.json.violations.map((v) => v.rule);
  assert.ok(rules.includes('version-face-drift'), 'expected version-face-drift, got ' + rules);
});

test('number squatting via CHANGELOG alone is caught', () => {
  const { root } = makeRepo('1.34.4');
  write(root, CHANGELOG,
    '# Changelog\n\n> manifest — currently `1.34.4`\n\n## [1.34.5] — 2026-09-03\n\n- squatted\n');
  const r = run(root);
  assert.strictEqual(r.status, 1);
  const rules = r.json.violations.map((v) => v.rule);
  assert.ok(rules.includes('changelog-version-heading-claimed'), 'expected changelog-version-heading-claimed, got ' + rules);
  assert.deepStrictEqual(r.json.new_changelog_headings, ['1.34.5']);
});

test('a face whose literal shape moved is reported, not silently skipped', () => {
  const { root } = makeRepo('1.34.4');
  write(root, MD, "out.push('derived, but the literal shape changed');\n");
  const r = run(root);
  assert.strictEqual(r.status, 1);
  const rules = r.json.violations.map((v) => v.rule);
  assert.ok(rules.includes('version-face-unreadable'), 'expected version-face-unreadable, got ' + rules);
});

test('release cut is the one legal path, and only with a substantive reason', () => {
  const { root } = makeRepo('1.34.4');
  seed(root, '2.0.0');

  const bare = run(root, { MCCP_RELEASE_CUT: '1' });
  assert.strictEqual(bare.status, 1, 'a one-token reason must not unlock the cut');

  const real = run(root, {
    MCCP_RELEASE_CUT: 'release cut 2.0.0 — channel separation umbrella lands as one delivery',
  });
  assert.strictEqual(real.status, 0);
  assert.strictEqual(real.json.ok, true);
  assert.ok(real.json.violations.length > 0, 'the cut is allowed, not undetected — violations stay visible');
});

test('an unresolvable base halts instead of reporting clean', () => {
  const { root } = makeRepo('1.34.4');
  const r = spawnSync(process.execPath, [GUARD, '--base', 'no/such/ref', '--json'], {
    cwd: root, encoding: 'utf8',
  });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /not resolvable/);
});

test('releaseCutReason throws rather than killing the caller process', () => {
  assert.strictEqual(guard.releaseCutReason({}), null);
  assert.strictEqual(guard.releaseCutReason({ MCCP_RELEASE_CUT: '   ' }), null);
  assert.throws(() => guard.releaseCutReason({ MCCP_RELEASE_CUT: 'nope' }), /not substantive/);
  assert.strictEqual(
    guard.releaseCutReason({ MCCP_RELEASE_CUT: '  release cut for the   umbrella delivery line  ' }),
    'release cut for the umbrella delivery line');
});

test('changelog heading scanner sees every version heading, not just the first', () => {
  const t = '## [Unreleased]\n\n## [1.2.3] — x\n\n## [1.2.4] — y\n';
  assert.deepStrictEqual(guard.changelogVersionHeadings(t), ['1.2.3', '1.2.4']);
});
