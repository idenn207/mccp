'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const routing = require('../impeccable-routing.js');
const { parseRoutingMode, routeCommands } = routing;

function byCommand(result) {
  const map = {};
  result.commands.forEach(function (c) { map[c.command] = c; });
  return map;
}

test('parseRoutingMode: unset → auto', function () {
  assert.strictEqual(parseRoutingMode({}), 'auto');
  assert.strictEqual(parseRoutingMode({ MCCP_IMPECCABLE_ROUTING_MODE: '' }), 'auto');
});

test('parseRoutingMode: typo/invalid → auto', function () {
  assert.strictEqual(parseRoutingMode({ MCCP_IMPECCABLE_ROUTING_MODE: 'aut0' }), 'auto');
  assert.strictEqual(parseRoutingMode({ MCCP_IMPECCABLE_ROUTING_MODE: 'on' }), 'auto');
});

test('parseRoutingMode: valid values (case-insensitive)', function () {
  assert.strictEqual(parseRoutingMode({ MCCP_IMPECCABLE_ROUTING_MODE: 'hybrid' }), 'hybrid');
  assert.strictEqual(parseRoutingMode({ MCCP_IMPECCABLE_ROUTING_MODE: 'RECOMMEND' }), 'recommend');
  assert.strictEqual(parseRoutingMode({ MCCP_IMPECCABLE_ROUTING_MODE: '  auto ' }), 'auto');
});

test('(a) auto/implement/renderingSurface=true → 5 commands, shape=background', function () {
  const r = routeCommands({ gate: 'implement', mode: 'auto', designSignal: true, renderingSurface: true });
  assert.strictEqual(r.skipped, false);
  assert.strictEqual(r.commands.length, 5);
  const m = byCommand(r);
  assert.strictEqual(m.shape.callForm, 'background');
  assert.strictEqual(m.layout.callForm, 'invoke');
  assert.strictEqual(m.typeset.callForm, 'invoke');
  assert.strictEqual(m.critique.callForm, 'invoke');
  assert.strictEqual(m.audit.callForm, 'invoke');
});

test('(b) hybrid/implement → critique/audit invoke, shape/layout/typeset recommend', function () {
  const r = routeCommands({ gate: 'implement', mode: 'hybrid', designSignal: true, renderingSurface: true });
  const m = byCommand(r);
  assert.strictEqual(m.critique.callForm, 'invoke');
  assert.strictEqual(m.audit.callForm, 'invoke');
  assert.strictEqual(m.shape.callForm, 'recommend');
  assert.strictEqual(m.layout.callForm, 'recommend');
  assert.strictEqual(m.typeset.callForm, 'recommend');
});

test('(c) recommend mode → every command recommend', function () {
  const r = routeCommands({ gate: 'implement', mode: 'recommend', designSignal: true, renderingSurface: true });
  r.commands.forEach(function (c) {
    assert.strictEqual(c.callForm, 'recommend', c.command + ' should be recommend');
  });
});

test('(d) no signal + no intent → skipped', function () {
  const r = routeCommands({ gate: 'implement', mode: 'auto', designSignal: false, designIntentActive: false });
  assert.strictEqual(r.skipped, true);
  assert.deepStrictEqual(r.commands, []);
});

test('(f) pr gate → polish/audit/harden all recommend in every mode', function () {
  ['auto', 'hybrid', 'recommend'].forEach(function (mode) {
    const r = routeCommands({ gate: 'pr', mode: mode, designSignal: true, renderingSurface: true });
    assert.strictEqual(r.commands.length, 3);
    r.commands.forEach(function (c) {
      assert.strictEqual(c.callForm, 'recommend', 'pr ' + c.command + ' must stay recommend under ' + mode);
    });
  });
});

test('(g) F1: designSignal=false + designIntentActive=true → NOT skipped', function () {
  const r = routeCommands({ gate: 'implement', mode: 'auto', designSignal: false, designIntentActive: true, renderingSurface: true });
  assert.strictEqual(r.skipped, false);
  assert.strictEqual(r.commands.length, 5);
});

test('(h) F4: auto/implement/renderingSurface=false → refine/discovery degrade, evaluate invoke', function () {
  const r = routeCommands({ gate: 'implement', mode: 'auto', designSignal: true, renderingSurface: false });
  const m = byCommand(r);
  // control-plane-only signal: shape/layout/typeset degrade to recommend
  assert.strictEqual(m.shape.callForm, 'recommend');
  assert.strictEqual(m.layout.callForm, 'recommend');
  assert.strictEqual(m.typeset.callForm, 'recommend');
  // evaluate commands still invoke
  assert.strictEqual(m.critique.callForm, 'invoke');
  assert.strictEqual(m.audit.callForm, 'invoke');
});

test('unknown gate → skipped', function () {
  const r = routeCommands({ gate: 'nonsense', mode: 'auto', designSignal: true });
  assert.strictEqual(r.skipped, true);
});

test('plan gate is guide-only (recommend) even in auto', function () {
  const r = routeCommands({ gate: 'plan', mode: 'auto', designSignal: true, renderingSurface: true });
  assert.ok(r.commands.length >= 5);
  r.commands.forEach(function (c) {
    assert.strictEqual(c.callForm, 'recommend', 'plan ' + c.command + ' must be recommend');
  });
});
