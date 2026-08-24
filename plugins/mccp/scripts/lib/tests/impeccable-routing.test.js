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
// then M3 added the System stage (document+extract): 14 → 16. M4 split the
// table on a `phase` axis and gave the finish pass its own entries
// (clarify/distill moved pre → finish; polish/harden/optimize added): 16 → 19,
// read as pre 14 + finish 5. routeCommands FILTERS by phase, so the default
// (phase omitted → 'pre') returns 14 — the pre count, not the total.
const IMPLEMENT_PRE_COUNT = 14;
const IMPLEMENT_FINISH_COUNT = 5;
const IMPLEMENT_TOTAL_COUNT = IMPLEMENT_PRE_COUNT + IMPLEMENT_FINISH_COUNT;
const IMPLEMENT_COUNT = IMPLEMENT_PRE_COUNT;
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

test('(a) auto/implement/renderingSurface=true, no diffSignals → pre catalogue, shape=recommend (M4), content base invoke', function () {
  const r = routeCommands({ gate: 'implement', mode: 'auto', designSignal: true, renderingSurface: true });
  assert.strictEqual(r.skipped, false);
  assert.strictEqual(r.commands.length, IMPLEMENT_COUNT);
  const m = byCommand(r);
  // M4 Task 2 — shape is demoted background → recommend because the vendor
  // contract makes it un-completable in a non-interactive gate
  // (command-metadata.json shape.description: "Runs a required multi-round
  // discovery interview"; context.mjs:1121 BUILD_INIT_REQUIRED). The
  // 'background' call form is now unreachable oracle-wide — pinned below.
  assert.strictEqual(m.shape.callForm, 'recommend');
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

test('(l) simplify: adapt invoke only with responsive signal; distill/clarify absent from the pre pass (M4)', function () {
  const withResp = byCommand(routeCommands({
    gate: 'implement', mode: 'auto', designSignal: true, renderingSurface: true,
    diffSignals: { responsive: true },
  }));
  assert.strictEqual(withResp.adapt.callForm, 'invoke');
  // M4 — distill/clarify moved to the finish phase. Absence here is the point:
  // before M4 they sat in the pre table as permanent `recommend` rows while
  // Phase 3.6 invoked them anyway, off-oracle and unrecorded. Asserting
  // 'recommend' again would re-pin the very mismatch M4 removes.
  assert.strictEqual(withResp.distill, undefined, 'distill is a finish-phase entry');
  assert.strictEqual(withResp.clarify, undefined, 'clarify is a finish-phase entry');
  const finish = byCommand(routeCommands({
    gate: 'implement', mode: 'auto', designSignal: true, renderingSurface: true,
    phase: 'finish', diffSignals: { responsive: true },
  }));
  assert.strictEqual(finish.distill.callForm, 'invoke');
  assert.strictEqual(finish.clarify.callForm, 'invoke');
  assert.strictEqual(finish.adapt, undefined, 'adapt stays a pre-phase entry');

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

// ── M4 cases: 발화 × 차단조건 정합 ────────────────────────────────────────
//
// M4의 주장 셋을 기계가 반증 가능한 형태로 고정한다.
//   1. auto 모드가 발화시키는 명령은 비대화형 게이트에서 실제로 완주 가능하다.
//   2. 'background' call form은 현재 도달 불가다 (의도적 결과이지 enum 은퇴가 아니다).
//   3. 발화가 0인 lifecycle stage는 정확히 {discovery, system}이며 각각 근거가 있다.
//
// 셋 다 전수 조합 위에서 단언한다. 조합 하나를 골라 단언하면 그 조합만 지키는
// 구현이 통과하는데, 주장이 "모든 구성에서"인 이상 열거도 그래야 한다.

const M4_GATES = ['prd', 'plan', 'implement', 'pr'];
const M4_PHASES = ['pre', 'finish'];

// gate(4) × mode{auto,hybrid}(2) × renderingSurface(2) × phase(2)
// × designIntentActive(2) × intentCommands{none,all-mood}(2) = 128 조합.
// 'recommend' 모드는 정의상 전 행이 recommend이라 반례를 만들 수 없어 제외한다 —
// 포함하면 단언이 그만큼 공허해진다.
function eachM4Combination(visit) {
  M4_GATES.forEach(function (gate) {
    ['auto', 'hybrid'].forEach(function (mode) {
      [true, false].forEach(function (renderingSurface) {
        M4_PHASES.forEach(function (phase) {
          [true, false].forEach(function (designIntentActive) {
            [[], routing.MOOD_COMMANDS.slice()].forEach(function (intentCommands) {
              const r = routeCommands({
                gate: gate,
                mode: mode,
                designSignal: true,
                designIntentActive: designIntentActive,
                renderingSurface: renderingSurface,
                phase: phase,
                intentCommands: intentCommands,
              });
              visit(r, gate + '/' + mode + '/rs=' + renderingSurface + '/phase=' + phase +
                '/intent=' + designIntentActive +
                '/mood=' + (intentCommands.length ? 'all' : 'none'));
            });
          });
        });
      });
    });
  });
}

test('(M4-0) INTERVIEW_REQUIRED_COMMANDS is the frozen vendor-blocked set', function () {
  // 근거는 벤더가 함께 배포하는 두 소스다 (impeccable 4.1.1):
  //   command-metadata.json — shape.description "Runs a required multi-round
  //     discovery interview" (조건 없음) · init "…interview when context is missing"
  //   scripts/context.mjs:1116,1132 — "For `init`, `teach`, `shape`, … create
  //     PRODUCT.md with the user first" · :1121 BUILD_INIT_REQUIRED
  // `teach`는 4.1.1 command-metadata.json의 23개 카탈로그에 없다(벤더 측 불일치:
  // 차단 프로즈는 부르는데 카탈로그에는 없다). 그래도 집합에 두는 이유는 이 집합의
  // 목적이 "미래에 카탈로그가 넓어질 때 인터뷰형 명령이 조용히 발화하지 않게
  // 막는 것"이고 `teach`가 정확히 그 후보이기 때문이다. 오늘 mccp 라우팅
  // 카탈로그와의 교집합은 `shape` 하나다.
  assert.deepStrictEqual(routing.INTERVIEW_REQUIRED_COMMANDS.slice().sort(),
    ['init', 'shape', 'teach']);
  assert.ok(Object.isFrozen(routing.INTERVIEW_REQUIRED_COMMANDS));
});

test('(M4-1) metric: no interview-required command ever fires in any configuration', function () {
  let checked = 0;
  eachM4Combination(function (r, label) {
    r.commands.forEach(function (c) {
      if (c.callForm === 'recommend') return;
      assert.strictEqual(routing.INTERVIEW_REQUIRED_COMMANDS.indexOf(c.command), -1,
        label + ': ' + c.command + ' fires as ' + c.callForm + ' but requires a ' +
        'multi-round interview — it cannot complete in a non-interactive gate');
    });
    checked += 1;
  });
  assert.strictEqual(checked, 128, 'combination enumeration drifted');
});

test('(M4-2) call form "background" is unreachable oracle-wide', function () {
  // 은퇴가 아니라 관측이다. receipt schema의 ROUTING_CALL_FORM_VALUES는
  // 'background'를 그대로 갖는다 — enum을 좁히면 과거 receipt 해석이 바뀌고,
  // 'background'는 정당한 미래 base다. 이 test는 그 base가 다시 도달 가능해지는
  // 날 붉어져서, 그것이 의도된 결정이었음을 증명하도록 강제한다.
  eachM4Combination(function (r, label) {
    r.commands.forEach(function (c) {
      assert.notStrictEqual(c.callForm, 'background',
        label + ': ' + c.command + ' resolved to background. Someone revived an ' +
        'interview-class command or introduced a new background base — either is a ' +
        'deliberate decision that must update this test and (M4-1) together.');
    });
  });
});

test('(M4-3a) phase filter is inert for plan/prd/pr — default equals explicit pre', function () {
  ['plan', 'prd', 'pr'].forEach(function (gate) {
    ['auto', 'hybrid', 'recommend'].forEach(function (mode) {
      const implicit = routeCommands({
        gate: gate, mode: mode, designSignal: true, renderingSurface: true,
      });
      const explicit = routeCommands({
        gate: gate, mode: mode, designSignal: true, renderingSurface: true, phase: 'pre',
      });
      assert.deepStrictEqual(implicit.commands, explicit.commands,
        gate + '/' + mode + ': omitting phase must equal phase="pre"');
    });
  });
});

test('(M4-3b) phase filter leaves plan/prd/pr output byte-identical to pre-M4', function () {
  // 명시 배열 pin. plan·prd 테이블은 전 엔트리가 pre이므로 M4 이전과 같아야 한다.
  const PLAN_GUIDE_COMMANDS = [
    'shape', 'layout', 'typeset', 'animate', 'colorize', 'bolder', 'quieter',
    'overdrive', 'delight', 'adapt', 'distill', 'clarify', 'critique', 'audit',
    'harden', 'optimize', 'onboard', 'polish', 'document', 'extract',
  ];
  ['plan', 'prd'].forEach(function (gate) {
    const r = routeCommands({
      gate: gate, mode: 'auto', designSignal: true, renderingSurface: true,
    });
    assert.deepStrictEqual(r.commands.map(function (c) { return c.command; }),
      PLAN_GUIDE_COMMANDS);
    r.commands.forEach(function (c) {
      assert.strictEqual(c.callForm, 'recommend', gate + '/' + c.command + ' must stay recommend');
    });
  });
  const pr = routeCommands({
    gate: 'pr', mode: 'auto', designSignal: true, renderingSurface: true,
  });
  assert.deepStrictEqual(pr.commands.map(function (c) { return c.command; }),
    ['polish', 'audit', 'harden', 'optimize', 'onboard', 'document', 'extract']);
  assert.strictEqual(pr.commands.length, PR_COUNT);
});

test('(M4-3c) implement splits pre 14 / finish 5, and the two passes are disjoint', function () {
  const pre = routeCommands({
    gate: 'implement', mode: 'auto', designSignal: true, renderingSurface: true,
  });
  const finish = routeCommands({
    gate: 'implement', mode: 'auto', designSignal: true, renderingSurface: true, phase: 'finish',
  });
  assert.strictEqual(pre.commands.length, IMPLEMENT_PRE_COUNT);
  assert.strictEqual(finish.commands.length, IMPLEMENT_FINISH_COUNT);
  assert.strictEqual(pre.commands.length + finish.commands.length, IMPLEMENT_TOTAL_COUNT);

  assert.deepStrictEqual(finish.commands.map(function (c) { return c.command; }).sort(),
    ['clarify', 'distill', 'harden', 'optimize', 'polish']);
  finish.commands.forEach(function (c) {
    assert.strictEqual(c.callForm, 'invoke',
      'finish/' + c.command + ' must be invoke on a rendered surface — that is the point of the finish pass');
  });

  // 두 패스는 서로소여야 한다. 겹치면 duplicate-call 불변식이 산문이 아니라
  // 테이블 수준에서 이미 거짓이다 (M4는 그 불변식을 산문에서 필터로 옮긴다).
  const preNames = pre.commands.map(function (c) { return c.command; });
  finish.commands.forEach(function (c) {
    assert.strictEqual(preNames.indexOf(c.command), -1,
      c.command + ' appears in BOTH the pre and finish pass — duplicate-call invariant broken at the table');
  });
});

test('(M4-3d) finish pass degrades under the same rules as pre', function () {
  const noSurface = routeCommands({
    gate: 'implement', mode: 'auto', designSignal: true, renderingSurface: false, phase: 'finish',
  });
  noSurface.commands.forEach(function (c) {
    assert.strictEqual(c.callForm, 'recommend',
      'finish/' + c.command + ' must degrade to recommend without a rendered surface');
  });
  const hybrid = routeCommands({
    gate: 'implement', mode: 'hybrid', designSignal: true, renderingSurface: true, phase: 'finish',
  });
  hybrid.commands.forEach(function (c) {
    assert.strictEqual(c.callForm, 'recommend',
      'hybrid keeps only evaluate, and finish carries no evaluate entry, so ' +
      c.command + ' must be recommend');
  });
});

test('(M4-4) the stages that never fire are exactly {discovery, system}', function () {
  const allStages = new Set();
  const firingStages = new Set();
  eachM4Combination(function (r) {
    r.commands.forEach(function (c) {
      allStages.add(c.stage);
      if (c.callForm !== 'recommend') firingStages.add(c.stage);
    });
  });
  const silent = Array.from(allStages).filter(function (s) {
    return !firingStages.has(s);
  }).sort();

  // discovery — 유일한 명령 `shape`가 벤더 계약상 인터뷰를 요구한다. UI11을
  //   지키는 한 영구히 0이고, 이것이 UI12를 문자 그대로 달성하지 못하는 지점이다.
  // system  — `document`/`extract`는 v1.13.0 M3이 "heavyweight generative actions
  //   that should be a deliberate operator step"라는 근거로 전 게이트 recommend로
  //   확정했다. M4는 그 결정을 뒤집을 근거를 갖지 않는다.
  assert.deepStrictEqual(silent, ['discovery', 'system'],
    'the silent-stage set changed. Gaining a member means a lifecycle stage lost its ' +
    'voice; losing one means a previously-justified silence was opened — either needs ' +
    'its reason recorded in docs/gate-design.md before this test is updated.');
});

test('(M4-5) public return schema is still exactly {command, stage, callForm} — no phase leak', function () {
  eachM4Combination(function (r, label) {
    r.commands.forEach(function (c) {
      assert.deepStrictEqual(Object.keys(c).sort(), ['callForm', 'command', 'stage'],
        label + ': ' + c.command + ' leaked internal table metadata into the public return');
    });
  });
});

test('(M4-6) an unknown phase yields no commands rather than silently falling back to pre', function () {
  // 오타로 인한 조용한 pre 재실행은 finish 패스가 통째로 사라지는 것보다 나쁘다 —
  // 그 경우 pre 명령이 EXECUTE 이후에 한 번 더 발화해 duplicate-call 불변식을 깬다.
  const r = routeCommands({
    gate: 'implement', mode: 'auto', designSignal: true, renderingSurface: true, phase: 'finsih',
  });
  assert.deepStrictEqual(r.commands, []);
  assert.strictEqual(r.skipped, false, 'an unknown phase is an empty route, not a skipped gate');
});

test('(M4-7) every table entry carries a phase from ROUTING_PHASES', function () {
  // code-review M3 — ROUTING_PHASES shipped with no consumer at all: neither the
  // oracle nor a test read it, so a frozen list documented an invariant nothing
  // enforced. The invariant is real. A typo'd phase is filtered out of BOTH
  // passes (M4-6 folds an unknown phase into an empty route), so that command
  // silently never routes and never reaches a receipt — nothing throws, nothing
  // logs, the row is simply gone. This is the only place that failure is visible.
  const gates = Object.keys(routing.STAGE_ROUTING);
  assert.ok(gates.length > 0, 'STAGE_ROUTING is empty — the table vanished');
  let entries = 0;
  gates.forEach(function (gate) {
    routing.STAGE_ROUTING[gate].forEach(function (e) {
      assert.notStrictEqual(routing.ROUTING_PHASES.indexOf(e.phase), -1,
        gate + '/' + e.command + ': phase "' + e.phase + '" is not in ROUTING_PHASES (' +
        routing.ROUTING_PHASES.join(', ') + '). It would be filtered out of every pass ' +
        'and route nowhere, silently.');
      entries += 1;
    });
  });
  assert.ok(entries > 0, 'no table entries were checked — the walk drifted');
  assert.ok(Object.isFrozen(routing.ROUTING_PHASES));
});
