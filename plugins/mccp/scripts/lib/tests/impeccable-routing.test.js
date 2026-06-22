'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const routing = require('../impeccable-routing.js');
const {
  parseRoutingMode,
  parseIntentCommands,
  routeCommands,
  selectByDiffSignals,
  extractDiffSignals,
} = routing;

function byCommand(result) {
  const map = {};
  result.commands.forEach(function (c) { map[c.command] = c; });
  return map;
}

// Implement gate catalogue grew in M2 (discovery+refine+simplify+evaluate),
// then M3 added the System stage (document+extract): 14 → 16.
const IMPLEMENT_COUNT = 16;
const PR_COUNT = 7;

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

test('(a) auto/implement/renderingSurface=true, no diffSignals → full catalogue, shape=background, content base invoke', function () {
  const r = routeCommands({ gate: 'implement', mode: 'auto', designSignal: true, renderingSurface: true });
  assert.strictEqual(r.skipped, false);
  assert.strictEqual(r.commands.length, IMPLEMENT_COUNT);
  const m = byCommand(r);
  assert.strictEqual(m.shape.callForm, 'background');
  assert.strictEqual(m.layout.callForm, 'invoke');
  assert.strictEqual(m.typeset.callForm, 'invoke');
  assert.strictEqual(m.animate.callForm, 'invoke');
  assert.strictEqual(m.colorize.callForm, 'invoke');
  assert.strictEqual(m.adapt.callForm, 'invoke');
  assert.strictEqual(m.critique.callForm, 'invoke');
  assert.strictEqual(m.audit.callForm, 'invoke');
});

test('(b) hybrid/implement → evaluate invoke, everything else recommend', function () {
  const r = routeCommands({ gate: 'implement', mode: 'hybrid', designSignal: true, renderingSurface: true });
  const m = byCommand(r);
  assert.strictEqual(m.critique.callForm, 'invoke');
  assert.strictEqual(m.audit.callForm, 'invoke');
  assert.strictEqual(m.shape.callForm, 'recommend');
  assert.strictEqual(m.layout.callForm, 'recommend');
  assert.strictEqual(m.typeset.callForm, 'recommend');
  assert.strictEqual(m.animate.callForm, 'recommend');
  assert.strictEqual(m.colorize.callForm, 'recommend');
  assert.strictEqual(m.adapt.callForm, 'recommend');
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

test('(f) pr gate → all recommend in every mode (optimize/onboard included)', function () {
  ['auto', 'hybrid', 'recommend'].forEach(function (mode) {
    const r = routeCommands({ gate: 'pr', mode: mode, designSignal: true, renderingSurface: true });
    assert.strictEqual(r.commands.length, PR_COUNT);
    const m = byCommand(r);
    assert.ok(m.optimize && m.onboard, 'pr must include optimize + onboard');
    r.commands.forEach(function (c) {
      assert.strictEqual(c.callForm, 'recommend', 'pr ' + c.command + ' must stay recommend under ' + mode);
    });
  });
});

test('(g) F1: designSignal=false + designIntentActive=true → NOT skipped', function () {
  const r = routeCommands({ gate: 'implement', mode: 'auto', designSignal: false, designIntentActive: true, renderingSurface: true });
  assert.strictEqual(r.skipped, false);
  assert.strictEqual(r.commands.length, IMPLEMENT_COUNT);
});

test('(h) F4: auto/implement/renderingSurface=false → refine/discovery/simplify degrade, evaluate invoke', function () {
  const r = routeCommands({ gate: 'implement', mode: 'auto', designSignal: true, renderingSurface: false });
  const m = byCommand(r);
  assert.strictEqual(m.shape.callForm, 'recommend');
  assert.strictEqual(m.layout.callForm, 'recommend');
  assert.strictEqual(m.typeset.callForm, 'recommend');
  assert.strictEqual(m.animate.callForm, 'recommend');
  assert.strictEqual(m.colorize.callForm, 'recommend');
  assert.strictEqual(m.adapt.callForm, 'recommend');
  assert.strictEqual(m.critique.callForm, 'invoke');
  assert.strictEqual(m.audit.callForm, 'invoke');
});

test('unknown gate → skipped', function () {
  const r = routeCommands({ gate: 'nonsense', mode: 'auto', designSignal: true });
  assert.strictEqual(r.skipped, true);
});

test('(M3) System commands document/extract: recommend in every gate × every mode', function () {
  ['implement', 'pr', 'plan', 'prd'].forEach(function (gate) {
    ['auto', 'hybrid', 'recommend'].forEach(function (mode) {
      const r = routeCommands({ gate: gate, mode: mode, designSignal: true, renderingSurface: true });
      const m = byCommand(r);
      assert.ok(m.document, gate + '/' + mode + ' must include document');
      assert.ok(m.extract, gate + '/' + mode + ' must include extract');
      assert.strictEqual(m.document.callForm, 'recommend', gate + '/' + mode + ' document must be recommend');
      assert.strictEqual(m.extract.callForm, 'recommend', gate + '/' + mode + ' extract must be recommend');
      assert.strictEqual(m.document.stage, 'system');
      assert.strictEqual(m.extract.stage, 'system');
    });
  });
});

test('(M3) SYSTEM_COMMANDS export is the frozen document/extract set', function () {
  const r = require('../impeccable-routing');
  assert.deepStrictEqual(r.SYSTEM_COMMANDS.slice().sort(), ['document', 'extract']);
  assert.ok(Object.isFrozen(r.SYSTEM_COMMANDS));
});

test('plan gate is guide-only (recommend) even in auto', function () {
  const r = routeCommands({ gate: 'plan', mode: 'auto', designSignal: true, renderingSurface: true });
  assert.ok(r.commands.length >= 5);
  r.commands.forEach(function (c) {
    assert.strictEqual(c.callForm, 'recommend', 'plan ' + c.command + ' must be recommend');
  });
});

// ── M2 cases ──────────────────────────────────────────────────────────────

test('(i) content narrow: auto + diffSignals={motion} → animate invoke, colorize/typeset/adapt recommend, layout invoke', function () {
  const r = routeCommands({
    gate: 'implement', mode: 'auto', designSignal: true, renderingSurface: true,
    diffSignals: { motion: true },
  });
  const m = byCommand(r);
  assert.strictEqual(m.animate.callForm, 'invoke', 'motion signal → animate invoke');
  assert.strictEqual(m.colorize.callForm, 'recommend', 'no color signal → colorize recommend');
  assert.strictEqual(m.typeset.callForm, 'recommend', 'no typography signal → typeset recommend');
  assert.strictEqual(m.adapt.callForm, 'recommend', 'no responsive signal → adapt recommend');
  assert.strictEqual(m.layout.callForm, 'invoke', 'layout has no signal → stays invoke');
  assert.strictEqual(m.critique.callForm, 'invoke');
  assert.strictEqual(m.audit.callForm, 'invoke');
});

test('(j) backward-compat: diffSignals omitted → no narrowing (M1 fail-open)', function () {
  const r = routeCommands({ gate: 'implement', mode: 'auto', designSignal: true, renderingSurface: true });
  const m = byCommand(r);
  assert.strictEqual(m.animate.callForm, 'invoke');
  assert.strictEqual(m.colorize.callForm, 'invoke');
  assert.strictEqual(m.typeset.callForm, 'invoke');
  assert.strictEqual(m.adapt.callForm, 'invoke');
});

test('(k) mood commands recommend-only by default in every mode/signal', function () {
  ['auto', 'hybrid', 'recommend'].forEach(function (mode) {
    const r = routeCommands({
      gate: 'implement', mode: mode, designSignal: true, renderingSurface: true,
      diffSignals: { motion: true, color: true, typography: true, responsive: true },
    });
    const m = byCommand(r);
    ['bolder', 'quieter', 'overdrive', 'delight'].forEach(function (cmd) {
      assert.strictEqual(m[cmd].callForm, 'recommend', cmd + ' must be recommend under ' + mode);
    });
  });
});

test('(l) simplify: adapt invoke only with responsive signal; distill/clarify always recommend', function () {
  const withResp = byCommand(routeCommands({
    gate: 'implement', mode: 'auto', designSignal: true, renderingSurface: true,
    diffSignals: { responsive: true },
  }));
  assert.strictEqual(withResp.adapt.callForm, 'invoke');
  assert.strictEqual(withResp.distill.callForm, 'recommend');
  assert.strictEqual(withResp.clarify.callForm, 'recommend');

  const noResp = byCommand(routeCommands({
    gate: 'implement', mode: 'auto', designSignal: true, renderingSurface: true,
    diffSignals: { color: true },
  }));
  assert.strictEqual(noResp.adapt.callForm, 'recommend', 'no responsive → adapt recommend');
});

test('(o) F3 mood intent upgrade: auto + renderingSurface + designIntentActive + intentCommands=[bolder] → bolder invoke only', function () {
  const r = routeCommands({
    gate: 'implement', mode: 'auto', designSignal: true, renderingSurface: true,
    designIntentActive: true, intentCommands: ['bolder'],
  });
  const m = byCommand(r);
  assert.strictEqual(m.bolder.callForm, 'invoke', 'intent member bolder → invoke');
  assert.strictEqual(m.quieter.callForm, 'recommend');
  assert.strictEqual(m.overdrive.callForm, 'recommend');
  assert.strictEqual(m.delight.callForm, 'recommend');
});

test('(o2) mood intent non-escalation: each of the 4 guards blocks alone', function () {
  // designIntentActive=false blocks
  let m = byCommand(routeCommands({
    gate: 'implement', mode: 'auto', designSignal: true, renderingSurface: true,
    designIntentActive: false, intentCommands: ['bolder'],
  }));
  assert.strictEqual(m.bolder.callForm, 'recommend', 'no designIntentActive → recommend');

  // renderingSurface=false blocks (designSignal keeps it non-skipped)
  m = byCommand(routeCommands({
    gate: 'implement', mode: 'auto', designSignal: true, renderingSurface: false,
    designIntentActive: true, intentCommands: ['bolder'],
  }));
  assert.strictEqual(m.bolder.callForm, 'recommend', 'no renderingSurface → recommend');

  // mode != auto blocks
  m = byCommand(routeCommands({
    gate: 'implement', mode: 'hybrid', designSignal: true, renderingSurface: true,
    designIntentActive: true, intentCommands: ['bolder'],
  }));
  assert.strictEqual(m.bolder.callForm, 'recommend', 'hybrid mode → recommend');

  // membership absent blocks
  m = byCommand(routeCommands({
    gate: 'implement', mode: 'auto', designSignal: true, renderingSurface: true,
    designIntentActive: true, intentCommands: ['quieter'],
  }));
  assert.strictEqual(m.bolder.callForm, 'recommend', 'not in intentCommands → recommend');
});

test('(p) selectByDiffSignals pure fn: undefined → unchanged; partial → narrow', function () {
  const cmds = [
    { command: 'animate', callForm: 'invoke', signal: 'motion' },
    { command: 'colorize', callForm: 'invoke', signal: 'color' },
    { command: 'layout', callForm: 'invoke', signal: null },
  ];
  const unchanged = selectByDiffSignals(cmds, undefined);
  assert.deepStrictEqual(unchanged.map(function (c) { return c.callForm; }), ['invoke', 'invoke', 'invoke']);

  const narrowed = selectByDiffSignals(cmds, { color: true });
  const nm = {};
  narrowed.forEach(function (c) { nm[c.command] = c.callForm; });
  assert.strictEqual(nm.colorize, 'invoke', 'color present → colorize stays invoke');
  assert.strictEqual(nm.animate, 'recommend', 'motion absent → animate narrowed');
  assert.strictEqual(nm.layout, 'invoke', 'no signal → layout untouched');
  // purity: input not mutated
  assert.strictEqual(cmds[0].callForm, 'invoke');
});

test('routeCommands return schema is stable: exactly {command, stage, callForm}, no signal leak', function () {
  const r = routeCommands({ gate: 'implement', mode: 'auto', designSignal: true, renderingSurface: true });
  r.commands.forEach(function (c) {
    assert.deepStrictEqual(Object.keys(c).sort(), ['callForm', 'command', 'stage'], c.command + ' keys');
    assert.strictEqual('signal' in c, false, 'internal signal metadata must not leak');
  });
});

test('extractDiffSignals: CSS property syntax', function () {
  const s = extractDiffSignals('.x { transition: all .3s; color: #abc; font-size: 14px; @media (min-width: 768px) {} }');
  assert.strictEqual(s.motion, true);
  assert.strictEqual(s.color, true);
  assert.strictEqual(s.typography, true);
  assert.strictEqual(s.responsive, true);
});

test('extractDiffSignals: Tailwind utility classes', function () {
  const s = extractDiffSignals('<div className="md:grid-cols-2 transition-all duration-300 bg-primary text-foreground">');
  assert.strictEqual(s.motion, true, 'transition-all/duration-300 → motion');
  assert.strictEqual(s.color, true, 'bg-primary/text-foreground → color');
  assert.strictEqual(s.responsive, true, 'md: → responsive');
});

test('extractDiffSignals: CSS-in-JS camelCase', function () {
  const s = extractDiffSignals('const sx = { fontSize: 14, backgroundColor: "#fff", transform: "translateY(1px)" }');
  assert.strictEqual(s.typography, true, 'fontSize → typography');
  assert.strictEqual(s.color, true, 'backgroundColor → color');
  assert.strictEqual(s.motion, true, 'transform/translate → motion');
});

test('extractDiffSignals: plain backend text → all false', function () {
  const s = extractDiffSignals('function add(a, b) { return a + b; } // pure logic');
  assert.deepStrictEqual(s, { motion: false, color: false, typography: false, responsive: false });
});

test('parseIntentCommands: comma list filtered to known mood commands', function () {
  assert.deepStrictEqual(parseIntentCommands({ MCCP_IMPECCABLE_INTENT_COMMANDS: 'bolder, quieter , nonsense' }), ['bolder', 'quieter']);
  assert.deepStrictEqual(parseIntentCommands({}), []);
  assert.deepStrictEqual(parseIntentCommands({ MCCP_IMPECCABLE_INTENT_COMMANDS: 'layout' }), [], 'non-mood ignored');
});
