'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dg = require('../design-grounding');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dg-test-'));
}

// ── parseGroundingMode ──────────────────────────────────────────────────────

test('parseGroundingMode: off/warn/enforce honored', function () {
  assert.strictEqual(dg.parseGroundingMode({ MCCP_DESIGN_GROUNDING: 'off' }), 'off');
  assert.strictEqual(dg.parseGroundingMode({ MCCP_DESIGN_GROUNDING: 'warn' }), 'warn');
  assert.strictEqual(dg.parseGroundingMode({ MCCP_DESIGN_GROUNDING: 'enforce' }), 'enforce');
  assert.strictEqual(dg.parseGroundingMode({ MCCP_DESIGN_GROUNDING: 'ENFORCE' }), 'enforce');
});

test('parseGroundingMode: unset/empty/typo → enforce (fail-closed default)', function () {
  assert.strictEqual(dg.parseGroundingMode({}), 'enforce');
  assert.strictEqual(dg.parseGroundingMode({ MCCP_DESIGN_GROUNDING: '' }), 'enforce');
  assert.strictEqual(dg.parseGroundingMode({ MCCP_DESIGN_GROUNDING: 'bogus' }), 'enforce');
  assert.strictEqual(dg.parseGroundingMode(undefined), 'enforce');
});

// ── bucketForFile / extractRenderedSurfaceFromDiff ──────────────────────────

test('bucketForFile: rendered-surface classification', function () {
  assert.strictEqual(dg.bucketForFile('app/main.css'), 'css');
  assert.strictEqual(dg.bucketForFile('app/main.scss'), 'css');
  assert.strictEqual(dg.bucketForFile('src/App.tsx'), 'html');
  assert.strictEqual(dg.bucketForFile('src/Btn.jsx'), 'html');
  assert.strictEqual(dg.bucketForFile('page.html'), 'html');
  assert.strictEqual(dg.bucketForFile('x.vue'), 'html');
  assert.strictEqual(dg.bucketForFile('.claude/cache/STATUS.md'), 'md');
});

test('bucketForFile: generic .md + non-UI excluded (no H15 false-positive on command docs)', function () {
  assert.strictEqual(dg.bucketForFile('plugins/mccp/commands/prp-implement.md'), null);
  assert.strictEqual(dg.bucketForFile('CHANGELOG.md'), null);
  assert.strictEqual(dg.bucketForFile('.claude/plans/x.plan.md'), null);
  assert.strictEqual(dg.bucketForFile('README.md'), null);
  assert.strictEqual(dg.bucketForFile('scripts/lib/x.js'), null);
});

test('extractRenderedSurfaceFromDiff: added lines bucketed by rendered file', function () {
  const diff = [
    'diff --git a/src/App.tsx b/src/App.tsx',
    '--- a/src/App.tsx',
    '+++ b/src/App.tsx',
    '@@ -1,1 +1,2 @@',
    ' <div>old</div>',
    '+<h4>added heading</h4>',
    'diff --git a/styles.css b/styles.css',
    '--- a/styles.css',
    '+++ b/styles.css',
    '@@ -0,0 +1,1 @@',
    '+.x { color: red; }',
    'diff --git a/notes.md b/notes.md',
    '--- a/notes.md',
    '+++ b/notes.md',
    '@@ -0,0 +1,1 @@',
    '+#### generic doc heading',
  ].join('\n');
  const b = dg.extractRenderedSurfaceFromDiff(diff);
  assert.deepStrictEqual(b.html, ['<h4>added heading</h4>']);
  assert.deepStrictEqual(b.css, ['.x { color: red; }']);
  assert.deepStrictEqual(b.md, [], 'generic .md must NOT be captured');
});

test('extractRenderedSurfaceFromDiff: rendered dashboard md captured, +++ header not treated as content', function () {
  const diff = [
    '+++ b/.claude/cache/STATUS.md',
    '@@ -0,0 +1,2 @@',
    '+## section',
    '+#### too deep',
  ].join('\n');
  const b = dg.extractRenderedSurfaceFromDiff(diff);
  assert.deepStrictEqual(b.md, ['## section', '#### too deep']);
});

test('extractRenderedSurfaceFromDiff: /dev/null + non-UI diff → empty buckets', function () {
  const diff = [
    'diff --git a/scripts/x.js b/scripts/x.js',
    '+++ b/scripts/x.js',
    '@@ -0,0 +1,1 @@',
    '+const a = 1;',
    'diff --git a/gone.css b/dev/null',
    '+++ /dev/null',
    '-removed',
  ].join('\n');
  const b = dg.extractRenderedSurfaceFromDiff(diff);
  assert.deepStrictEqual(b, { css: [], html: [], md: [] });
});

test('extractRenderedSurfaceFromDiff: empty/undefined input → empty buckets', function () {
  assert.deepStrictEqual(dg.extractRenderedSurfaceFromDiff(''), { css: [], html: [], md: [] });
  assert.deepStrictEqual(dg.extractRenderedSurfaceFromDiff(undefined), { css: [], html: [], md: [] });
});

// ── subtractBuckets (F2 EXECUTE-delta isolation) ────────────────────────────

test('subtractBuckets: pre-EXECUTE lines removed from current', function () {
  const cur = { css: ['a', 'b', 'c'], html: ['<h4>x</h4>'], md: [] };
  const base = { css: ['a'], html: ['<h4>x</h4>'], md: [] };
  const delta = dg.subtractBuckets(cur, base);
  assert.deepStrictEqual(delta.css, ['b', 'c']);
  assert.deepStrictEqual(delta.html, [], 'pre-existing dirty line subtracted out');
  assert.deepStrictEqual(delta.md, []);
});

// ── captureDirection / readDirection round-trip + atomic + fail-open ─────────

test('captureDirection + readDirection: round-trip', function () {
  const dir = tmpDir();
  try {
    const p = path.join(dir, 'design-direction--slug.json');
    const preDiff = '+++ b/a.css\n@@ -0,0 +1 @@\n+.pre { color: blue; }';
    const ret = dg.captureDirection({
      path: p,
      slug: 'slug',
      direction: { summary: 'dark console' },
      routedCommands: [{ command: 'layout', call_form: 'invoke', status: 'invoked' }],
      critiqueVerdict: 'converged',
      requiredSignals: ['color', 'bogus-signal'],
      baselineRev: 'abc1234',
      preExecuteDiffText: preDiff,
      now: '2026-06-29T00:00:00.000Z',
    });
    assert.strictEqual(ret, p);
    const read = dg.readDirection(p);
    assert.strictEqual(read.slug, 'slug');
    assert.strictEqual(read.baseline_rev, 'abc1234');
    assert.strictEqual(read.critique_verdict, 'converged');
    assert.deepStrictEqual(read.required_signals, ['color'], 'unknown signal filtered out');
    assert.deepStrictEqual(read.pre_execute_rendered_buckets.css, ['.pre { color: blue; }']);
    assert.strictEqual(read.output_constraints.length, 4);
    // atomic: no leftover temp file
    const leftovers = fs.readdirSync(dir).filter(function (f) { return f.indexOf('.tmp') !== -1; });
    assert.deepStrictEqual(leftovers, [], 'temp file renamed away (atomic write)');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('captureDirection: requires path', function () {
  assert.throws(function () { dg.captureDirection({}); }, /opts.path is required/);
});

test('readDirection: missing/corrupt → null (fail-open)', function () {
  const dir = tmpDir();
  try {
    assert.strictEqual(dg.readDirection(path.join(dir, 'nope.json')), null);
    assert.strictEqual(dg.readDirection(null), null);
    const bad = path.join(dir, 'corrupt.json');
    fs.writeFileSync(bad, '{ not json');
    assert.strictEqual(dg.readDirection(bad), null);
    const notObj = path.join(dir, 'arr.json');
    fs.writeFileSync(notObj, '42');
    assert.strictEqual(dg.readDirection(notObj), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── lintProducedDiff ────────────────────────────────────────────────────────

test('lintProducedDiff: H15 violation in produced delta detected', function () {
  const direction = { pre_execute_rendered_buckets: { css: [], html: [], md: [] }, required_signals: [] };
  const currentDiff = '+++ b/src/App.tsx\n@@ -0,0 +1 @@\n+<h4>deep heading</h4>';
  const res = dg.lintProducedDiff({ currentDiffText: currentDiff, direction: direction, mode: 'enforce' });
  assert.strictEqual(res.hasRenderedDiff, true);
  assert.ok(res.blockingViolations.length >= 1, 'H15 should fire on <h4>');
  assert.strictEqual(res.blockingViolations[0].rule, 'H15');
});

test('lintProducedDiff: pre-EXECUTE h4 subtracted → no violation (F2)', function () {
  const preDiff = '+++ b/src/App.tsx\n@@ -0,0 +1 @@\n+<h4>was already here</h4>';
  const direction = {
    pre_execute_rendered_buckets: dg.extractRenderedSurfaceFromDiff(preDiff),
    required_signals: [],
  };
  // current diff still shows the same h4 (pre-existing) — must NOT count as EXECUTE delta
  const res = dg.lintProducedDiff({ currentDiffText: preDiff, direction: direction, mode: 'enforce' });
  assert.strictEqual(res.hasRenderedDiff, false, 'all current lines were pre-existing → empty delta');
  assert.strictEqual(res.blockingViolations.length, 0);
});

test('lintProducedDiff: non-rendered diff → no rendered surface', function () {
  const direction = { pre_execute_rendered_buckets: { css: [], html: [], md: [] }, required_signals: [] };
  const currentDiff = '+++ b/scripts/lib/x.js\n@@ -0,0 +1 @@\n+const x = 1;';
  const res = dg.lintProducedDiff({ currentDiffText: currentDiff, direction: direction, mode: 'enforce' });
  assert.strictEqual(res.hasRenderedDiff, false);
  assert.strictEqual(res.blockingViolations.length, 0);
});

test('lintProducedDiff: required signal absent from delta → missingRequiredSignals', function () {
  const direction = {
    pre_execute_rendered_buckets: { css: [], html: [], md: [] },
    required_signals: ['motion'],
  };
  // produced delta has color but not motion
  const currentDiff = '+++ b/styles.css\n@@ -0,0 +1 @@\n+.x { color: oklch(0.5 0 0); }';
  const res = dg.lintProducedDiff({ currentDiffText: currentDiff, direction: direction, mode: 'enforce' });
  assert.strictEqual(res.hasRenderedDiff, true);
  assert.deepStrictEqual(res.missingRequiredSignals, ['motion']);
});

test('lintProducedDiff: required signal present → satisfied', function () {
  const direction = {
    pre_execute_rendered_buckets: { css: [], html: [], md: [] },
    required_signals: ['motion'],
  };
  const currentDiff = '+++ b/styles.css\n@@ -0,0 +1 @@\n+.x { transition: all 0.2s ease; }';
  const res = dg.lintProducedDiff({ currentDiffText: currentDiff, direction: direction, mode: 'enforce' });
  assert.deepStrictEqual(res.missingRequiredSignals, []);
});

// ── decideGrounding (5-verdict enum + F4) ────────────────────────────────────

test('decideGrounding: off → skipped, never blocks', function () {
  const d = dg.decideGrounding({ mode: 'off', blockingViolations: [1], hasRenderedDiff: true });
  assert.deepStrictEqual(d, { verdict: 'skipped', block: false });
});

test('decideGrounding: readFailed → inconclusive, blocks only in enforce (F4)', function () {
  assert.deepStrictEqual(
    dg.decideGrounding({ mode: 'enforce', readFailed: true }),
    { verdict: 'inconclusive', block: true });
  assert.deepStrictEqual(
    dg.decideGrounding({ mode: 'warn', readFailed: true }),
    { verdict: 'inconclusive', block: false });
});

test('decideGrounding: no rendered diff → anchor_clean no-op', function () {
  assert.deepStrictEqual(
    dg.decideGrounding({ mode: 'enforce', hasRenderedDiff: false }),
    { verdict: 'anchor_clean', block: false });
});

test('decideGrounding: violations block in enforce, not in warn (silent verified forbidden)', function () {
  assert.deepStrictEqual(
    dg.decideGrounding({ mode: 'enforce', hasRenderedDiff: true, blockingViolations: [{ rule: 'H15' }] }),
    { verdict: 'violations', block: true });
  assert.deepStrictEqual(
    dg.decideGrounding({ mode: 'warn', hasRenderedDiff: true, blockingViolations: [{ rule: 'H15' }] }),
    { verdict: 'violations', block: false });
});

test('decideGrounding: missing required signal → inconclusive (enforce blocks)', function () {
  assert.deepStrictEqual(
    dg.decideGrounding({
      mode: 'enforce', hasRenderedDiff: true, blockingViolations: [],
      missingRequiredSignals: ['motion'], requiredSignalsDeclared: true,
    }),
    { verdict: 'inconclusive', block: true });
});

test('decideGrounding: required signals declared + satisfied → grounded', function () {
  assert.deepStrictEqual(
    dg.decideGrounding({
      mode: 'enforce', hasRenderedDiff: true, blockingViolations: [],
      missingRequiredSignals: [], requiredSignalsDeclared: true,
    }),
    { verdict: 'grounded', block: false });
});

test('decideGrounding: clean anchors, no required signals → anchor_clean', function () {
  assert.deepStrictEqual(
    dg.decideGrounding({
      mode: 'enforce', hasRenderedDiff: true, blockingViolations: [],
      missingRequiredSignals: [], requiredSignalsDeclared: false,
    }),
    { verdict: 'anchor_clean', block: false });
});

// ── end-to-end: capture → lint → decide (dogfood shape) ──────────────────────

test('end-to-end: control-plane change (no rendered surface) → anchor_clean pass', function () {
  const dir = tmpDir();
  try {
    const p = path.join(dir, 'd.json');
    dg.captureDirection({
      path: p,
      slug: 'design-grounding',
      preExecuteDiffText: '',
      requiredSignals: [],
      now: '2026-06-29T00:00:00.000Z',
    });
    const direction = dg.readDirection(p);
    // produced diff = only .js + .md command docs (no rendered surface)
    const currentDiff = [
      '+++ b/plugins/mccp/scripts/lib/design-grounding.js',
      '@@ -0,0 +1 @@',
      "+module.exports = {};",
      '+++ b/plugins/mccp/commands/prp-implement.md',
      '@@ -0,0 +1 @@',
      '+#### 3.6 phase',
    ].join('\n');
    const lint = dg.lintProducedDiff({ currentDiffText: currentDiff, direction: direction, mode: 'enforce' });
    const decision = dg.decideGrounding({
      mode: 'enforce',
      blockingViolations: lint.blockingViolations,
      missingRequiredSignals: lint.missingRequiredSignals,
      requiredSignalsDeclared: lint.requiredSignals.length > 0,
      hasRenderedDiff: lint.hasRenderedDiff,
      readFailed: false,
    });
    assert.strictEqual(lint.hasRenderedDiff, false, 'command-doc #### must not count as rendered surface');
    assert.deepStrictEqual(decision, { verdict: 'anchor_clean', block: false });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
