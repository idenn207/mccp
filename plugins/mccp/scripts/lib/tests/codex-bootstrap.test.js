'use strict';

// codex-bootstrap 순수 오라클 단위 test (codex-harness-portability M3.5).
//
// 여기서 재는 것은 전부 fs·spawn 없이 성립하는 형태다 — 그 조립이 어긋나면 hook 발화가
// 0이 되고, 그것은 "hook이 애초에 없다"와 **같은 모양**이라 운영자가 구별할 수 없다.

const { test } = require('node:test');
const assert = require('node:assert');

const b = require('../codex-bootstrap');
const reach = require('../command-reach');

const HOOK = function (key, hash, status) {
  return { key: key, currentHash: hash, trustStatus: status || 'untrusted' };
};

test('mergeTrustBlocks is idempotent — two merges equal one, byte for byte', function () {
  const base = '[tui]\nfoo = 1\n';
  const hooks = [HOOK('mccp@mccp:SessionStart:0', 'aaa'), HOOK('mccp@mccp:Stop:0', 'bbb')];
  const once = b.mergeTrustBlocks(base, hooks).toml;
  const twice = b.mergeTrustBlocks(once, hooks).toml;
  assert.strictEqual(twice, once);
  // 그리고 세 번째도. 접힘이 한 번만 수렴하는 것이 아니라 고정점임을 확인한다.
  assert.strictEqual(b.mergeTrustBlocks(twice, hooks).toml, once);
});

test('mergeTrustBlocks preserves unrelated sections and other plugins trust blocks', function () {
  const base = [
    '[tui]', 'model_availability_nux = true', '',
    '[projects."/some/path"]', 'trust_level = "trusted"', '',
    '[hooks.state."other@market:Stop:0"]', 'enabled = true', 'trusted_hash = "zzz"', '',
  ].join('\n');
  const out = b.mergeTrustBlocks(base, [HOOK('mccp@mccp:SessionStart:0', 'aaa')]).toml;
  assert.ok(out.includes('[tui]'));
  assert.ok(out.includes('model_availability_nux = true'));
  assert.ok(out.includes('[projects."/some/path"]'));
  assert.ok(out.includes('[hooks.state."other@market:Stop:0"]'), 'another plugin trust block must survive');
  assert.ok(out.includes('trusted_hash = "zzz"'), 'and keep its hash');
  assert.ok(out.includes('[hooks.state."mccp@mccp:SessionStart:0"]'));
});

test('mergeTrustBlocks replaces an existing block rather than duplicating it', function () {
  const base = '[hooks.state."mccp@mccp:Stop:0"]\nenabled = true\ntrusted_hash = "old"\n';
  const out = b.mergeTrustBlocks(base, [HOOK('mccp@mccp:Stop:0', 'new')]).toml;
  const occurrences = out.split('[hooks.state."mccp@mccp:Stop:0"]').length - 1;
  assert.strictEqual(occurrences, 1, 'the key must appear exactly once');
  assert.ok(out.includes('trusted_hash = "new"'));
  assert.ok(!out.includes('"old"'));
});

// ── selectTrustable: the three conditions ────────────────────────────────────
// 프로브의 grantHookTrust는 hooks/list 반환 전량을 승인한다. 스크래치 home에서는
// 무해했으나 실사용 home에서 같은 짓을 하면 서드파티 hook 전부를 신뢰하게 된다.

test('selectTrustable grants only mccp-declared hooks', function () {
  const sel = b.selectTrustable([
    HOOK('mccp@mccp:SessionStart:0', 'a'),
    HOOK('other@market:Stop:0', 'b'),
    HOOK('/home/u/.codex/config.toml:PreToolUse:0', 'c'),
  ], '');
  assert.deepStrictEqual(sel.grant.map(function (h) { return h.key; }), ['mccp@mccp:SessionStart:0']);
  const reasons = sel.skipped.map(function (s) { return s.reason; });
  assert.deepStrictEqual(reasons, ['not-declared-by-mccp', 'not-declared-by-mccp']);
});

test('selectTrustable refuses a modified hook — a tamper signal is not ours to erase', function () {
  const sel = b.selectTrustable([HOOK('mccp@mccp:Stop:0', 'a', 'modified')], '');
  assert.strictEqual(sel.grant.length, 0);
  assert.strictEqual(sel.skipped[0].reason, 'trust-status-modified');
});

test('selectTrustable honours an operator-disabled block', function () {
  const cfg = '[hooks.state."mccp@mccp:Stop:0"]\nenabled = false\ntrusted_hash = "a"\n';
  const sel = b.selectTrustable([HOOK('mccp@mccp:Stop:0', 'a')], cfg);
  assert.strictEqual(sel.grant.length, 0);
  assert.strictEqual(sel.skipped[0].reason, 'operator-disabled');
});

test('selectTrustable still grants when the operator left the block enabled', function () {
  const cfg = '[hooks.state."mccp@mccp:Stop:0"]\nenabled = true\ntrusted_hash = "old"\n';
  const sel = b.selectTrustable([HOOK('mccp@mccp:Stop:0', 'new')], cfg);
  assert.strictEqual(sel.grant.length, 1);
});

test('parseHookStateBlocks reads escaped keys and the enabled flag', function () {
  const cfg = '[hooks.state."a\\"b:Stop:0"]\nenabled = false\n';
  const blocks = b.parseHookStateBlocks(cfg);
  assert.strictEqual(blocks.length, 1);
  assert.strictEqual(blocks[0].key, 'a"b:Stop:0');
  assert.strictEqual(blocks[0].enabled, false);
});

test('shortHookKey drops the absolute path of a config-declared origin', function () {
  assert.strictEqual(b.shortHookKey('/home/u/.codex/config.toml:Stop:0'), 'config.toml:Stop:0');
  assert.strictEqual(b.shortHookKey('mccp@mccp:Stop:0'), 'mccp@mccp:Stop:0');
});

// ── structural binding, not a restatement ───────────────────────────────────
// verifyReach clears the env names command-reach.js reads as root candidates. If a
// new name is added there and not here, the reach check silently starts resolving
// against a developer worktree again — the exact false success R1 flagged. Bind the
// two lists so that addition turns this test red.

test('REACH_ENV_TO_CLEAR covers every root env command-reach.js consults', function () {
  reach.ROOT_ENV_NAMES.forEach(function (name) {
    assert.ok(
      b.REACH_ENV_TO_CLEAR.indexOf(name) !== -1,
      name + ' is a command-reach root candidate but verifyReach does not clear it'
    );
  });
  assert.ok(b.REACH_ENV_TO_CLEAR.indexOf('MCCP_PLUGIN_ROOT_HINT') !== -1,
    'the R-b hint is read by the command-reach CLI shim and must be cleared too');
});
