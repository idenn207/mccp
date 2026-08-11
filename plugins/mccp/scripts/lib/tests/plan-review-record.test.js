'use strict';

// plan-review/record.js + `cli.js record` — the measurement surface (M4 axis A).
//
// M1 stamped wall-clock inside 5.6b's receipt write only, so a run that HALTed
// earlier recorded nothing. Because a blocked run is usually the SLOW run, the
// instrument systematically dropped its longest samples: survivorship bias built
// into the measurement. Forty receipts, zero review verdicts.
//
// The three cases below are the three shapes a real run produces:
//   1. pass      — every artifact present
//   2. halt late — decision.json present, l2.json absent (5.2e-class stop)
//   3. halt early— started-at only (5.2b-class stop, before anything else exists)
// All three must yield a readable record with a parseable ## Measurement block.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildReviewRecord, reviewRecordPath, sanitizeSlug } = require('../plan-review/record');
const { runCli, EX_OK } = require('../plan-review/cli');

const HASH = 'sha256:' + 'a'.repeat(64);

const L2_PASS = {
  skipped: false,
  coverage: 4,
  spent: 12345,
  reviewedPlanHash: HASH,
  results: [
    { perspective: 'architect', verdict: 'pass', findings: [], refutationAttempted: 'attacked boundaries' },
    { perspective: 'security', verdict: 'pass', findings: [], refutationAttempted: 'attacked inputs' },
    { perspective: 'test', verdict: 'fail', findings: [
      { claim: 'no runtime test', evidence: 'file.js:1', severity: 'MEDIUM' },
    ], refutationAttempted: 'attacked validation' },
    { perspective: 'invariant', verdict: 'pass', findings: [], refutationAttempted: 'attacked gates' },
  ],
};

const DECISION_PASS = {
  review_verdict: 'converged',
  review_source: 'multi-agent',
  review_proof: { reviewed_plan_hash: HASH },
  block: false,
  reason: 'L1 converged; L2 quorum satisfied',
  quorum: { passed: true, responded: 4, required: 3, roles: 4, of: 4 },
};

function measurementOf(markdown) {
  const m = markdown.match(/## Measurement[\s\S]*?```json\n([\s\S]*?)\n```/);
  assert.ok(m, 'the record must carry a fenced ## Measurement JSON block');
  return JSON.parse(m[1]);
}

// ── 1. pure oracle, three shapes ──────────────────────────────────────────────

test('pass path — full artifacts produce the M1 record format plus a measurement', () => {
  const { markdown, measurement, degradations } = buildReviewRecord({
    slug: 'diverse-agent-review',
    planPath: '.claude/plans/x.plan.md',
    mode: 'multi-agent',
    l1: { verdict: 'converged', violations: [] },
    l2: L2_PASS,
    l3: null,
    decision: DECISION_PASS,
    reservation: { granted: 4, reservationId: 'r1' },
    startedAtMs: 1000,
    nowMs: 91000,
    haltStage: null,
  });

  // The M1 format is preserved verbatim — this record replaces hand-typed
  // markdown and a regression here silently changes what an author reads.
  assert.match(markdown, /^# Plan Review Panel — diverse-agent-review$/m);
  assert.match(markdown, /^\*\*Verdict\*\*: `converged` via `multi-agent`$/m);
  assert.match(markdown, /^\*\*Quorum\*\*: 4\/3 responses · 4 distinct roles \(of 4 fielded\) · passed=true$/m);
  assert.match(markdown, /^\*\*Layers\*\*: L1 converged · L2 converged · L3 not fired$/m);
  assert.match(markdown, /^## Findings$/m);
  assert.match(markdown, /^## Refutation attempted$/m);
  assert.match(markdown, /\| test \| MEDIUM \| no runtime test \| file\.js:1 \|/);
  assert.equal((markdown.match(/^\| (architect|security|test|invariant) \| (pass|fail) \|/gm) || []).length, 4);

  assert.equal(measurement.verdict, 'converged');
  assert.equal(measurement.source, 'multi-agent');
  assert.equal(measurement.wall_clock_ms, 90000);
  assert.ok(Number.isInteger(measurement.wall_clock_ms));
  assert.equal(measurement.halt_stage, null);
  assert.equal(measurement.reviewed_plan_hash, HASH);
  assert.deepEqual(measurement.quorum, { responded: 4, required: 3, roles: 4, of: 4, passed: true });
  assert.deepEqual(degradations, [], 'a complete run degrades nothing');
  assert.deepEqual(measurementOf(markdown), measurement, 'the embedded JSON is the measurement');
});

test('late halt — decision present, panel result gone, still fully measured (UI10)', () => {
  const { markdown, measurement, degradations } = buildReviewRecord({
    slug: 'late-halt',
    planPath: '.claude/plans/x.plan.md',
    mode: 'multi-agent',
    l1: { verdict: 'converged', violations: [] },
    l2: null,
    decision: {
      review_verdict: 'unavailable', review_source: 'multi-agent', review_proof: null,
      block: true, reason: '--l2-file unreadable',
    },
    startedAtMs: 5000,
    nowMs: 605000,
    haltStage: '5.2e',
  });

  assert.equal(measurement.verdict, 'unavailable');
  assert.equal(measurement.halt_stage, '5.2e');
  assert.equal(measurement.wall_clock_ms, 600000,
    'the slow blocked run is exactly the sample M1 kept losing');
  assert.equal(measurement.quorum, null, 'no panel result means no quorum — not a zero one');
  assert.match(markdown, /^\*\*Halted at\*\*: `5\.2e`$/m);
  assert.match(markdown, /> Reason: --l2-file unreadable/);
  assert.match(markdown, /None recorded/);
  assert.ok(degradations.some(function (d) { return /l2\.json absent/.test(d); }));
  assert.equal(measurementOf(markdown).halt_stage, '5.2e');
});

test('early halt — only started-at exists, and the record says so honestly', () => {
  const { markdown, measurement, degradations } = buildReviewRecord({
    slug: 'early-halt',
    mode: 'multi-agent',
    startedAtMs: 2000,
    nowMs: 3500,
    haltStage: '5.2b',
  });

  assert.equal(measurement.verdict, 'unknown', 'no decision means unknown, never converged');
  assert.equal(measurement.halt_stage, '5.2b');
  assert.equal(measurement.wall_clock_ms, 1500);
  assert.equal(measurement.layers.l1, null);
  assert.equal(measurement.layers.l2, null);
  assert.equal(measurement.plan_path, null);
  assert.equal(degradations.length, 3, 'l1 + l2 + decision each named');
  assert.doesNotThrow(function () { measurementOf(markdown); });
});

test('an unmeasurable duration is null, never 0', () => {
  // 0 would read as "the gate was instantaneous", which is a false measurement
  // and precisely the kind of silent zero that made the M1 numbers unusable.
  const noStart = buildReviewRecord({ slug: 's', nowMs: 100 });
  assert.equal(noStart.measurement.wall_clock_ms, null);
  assert.ok(noStart.degradations.some(function (d) { return /NOT as zero/.test(d); }));

  const skewed = buildReviewRecord({ slug: 's', startedAtMs: 900, nowMs: 100 });
  assert.equal(skewed.measurement.wall_clock_ms, null, 'clock skew is unknown, not negative');
});

test('a budget-skipped panel is reported as skipped, not as divergent', () => {
  const { markdown, measurement } = buildReviewRecord({
    slug: 's',
    l1: { verdict: 'converged' },
    l2: { skipped: true, reason: 'budget', results: [], remaining: 100, minRemaining: 600000 },
    decision: { review_verdict: 'unavailable', review_source: 'multi-agent', reason: 'no results' },
    startedAtMs: 1, nowMs: 2,
  });
  assert.match(measurement.layers.l2, /^skipped \(budget: remaining 100 < 600000\)$/);
  assert.match(markdown, /L2 skipped \(budget/);
});

test('findings with pipes or newlines cannot break the table they live in', () => {
  const { markdown } = buildReviewRecord({
    slug: 's',
    l2: { results: [{ perspective: 'test', verdict: 'fail', refutationAttempted: 'a\nb',
      findings: [{ claim: 'a | b', evidence: 'line1\nline2', severity: 'HIGH' }] }] },
    startedAtMs: 1, nowMs: 2,
  });
  const row = markdown.split('\n').find(function (l) { return l.indexOf('a \\| b') !== -1; });
  assert.ok(row, 'a literal pipe must be escaped, not left to split the row');
  // Count DELIMITERS only — an escaped `\|` stays inside its cell, which is the
  // whole point. Five delimiters bound four cells.
  assert.equal((row.match(/(^|[^\\])\|/g) || []).length, 5,
    'exactly the four cells plus delimiters');
  assert.ok(markdown.indexOf('line1 line2') !== -1, 'newlines collapse to a space');
});

test('a backslash before a pipe cannot smuggle a live delimiter into the table', () => {
  // Escaping only the pipe turns `a\|b` into `a\\|b`, which markdown renders as a
  // literal backslash plus a LIVE delimiter — the row splits on precisely the
  // input that was talking about escaping. Windows paths and regexes in evidence
  // citations make this reachable, not theoretical.
  const { markdown } = buildReviewRecord({
    slug: 's',
    l2: { results: [{ perspective: 'test', verdict: 'fail', refutationAttempted: 'x',
      findings: [{ claim: 'a\\|b', evidence: 'plugins\\mccp\\x.js:1', severity: 'HIGH' }] }] },
    startedAtMs: 1, nowMs: 2,
  });
  const row = markdown.split('\n').find(function (l) { return l.indexOf('a\\\\') !== -1; });
  assert.ok(row, 'the literal backslash must survive, escaped');
  assert.equal((row.match(/(^|[^\\])\|/g) || []).length, 5,
    'four cells and no more: the escaped pipe must stay inside its cell');
  assert.ok(row.indexOf('plugins\\\\mccp\\\\x.js:1') !== -1,
    'a Windows path renders back as itself rather than eating its own separators');
});

test('buildReviewRecord never throws, whatever it is handed', () => {
  [undefined, null, 'string', 42, [], { l2: 'not an object', decision: [] }].forEach(function (bad) {
    assert.doesNotThrow(function () { buildReviewRecord(bad); }, 'input=' + JSON.stringify(bad));
  });
});

test('the slug cannot escape .claude/reviews/', () => {
  assert.equal(reviewRecordPath('ok-slug'), '.claude/reviews/plan-review-ok-slug.md');
  assert.equal(sanitizeSlug('../../etc/passwd'), 'etc-passwd');
  assert.equal(sanitizeSlug('a/b\\c'), 'a-b-c');
  assert.equal(sanitizeSlug(''), 'unknown-decision');
  [reviewRecordPath('../../x'), reviewRecordPath('a\0b'), reviewRecordPath(null)].forEach(function (p) {
    assert.ok(p.startsWith('.claude/reviews/plan-review-'), p);
    assert.equal(p.indexOf('..'), -1, p);
  });
});

// ── 2. the CLI seam ───────────────────────────────────────────────────────────

function withDir(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-review-record-'));
  const reviewDir = path.join(root, '.claude', 'state', 'plan-review');
  fs.mkdirSync(reviewDir, { recursive: true });
  const savedOut = process.stdout.write;
  const savedErr = process.stderr.write;
  process.stdout.write = function () { return true; };
  process.stderr.write = function () { return true; };
  try {
    return fn({ root: root, reviewDir: reviewDir });
  } finally {
    process.stdout.write = savedOut;
    process.stderr.write = savedErr;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function record(ctx, extra) {
  const code = runCli(['record', '--slug', 'tmp-check', '--repo-root', ctx.root,
    '--review-dir', ctx.reviewDir].concat(extra || []));
  const p = path.join(ctx.root, '.claude', 'reviews', 'plan-review-tmp-check.md');
  return { code: code, exists: fs.existsSync(p),
    markdown: fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null };
}

test('record writes the file and exits 0 on a complete run', () => {
  withDir(function (ctx) {
    fs.writeFileSync(path.join(ctx.reviewDir, 'started-at'), String(Date.now() - 4000));
    fs.writeFileSync(path.join(ctx.reviewDir, 'mode.json'), JSON.stringify({ mode: 'multi-agent' }));
    fs.writeFileSync(path.join(ctx.reviewDir, 'l1.json'), JSON.stringify({ verdict: 'converged' }));
    fs.writeFileSync(path.join(ctx.reviewDir, 'l2.json'), JSON.stringify(L2_PASS));
    fs.writeFileSync(path.join(ctx.reviewDir, 'decision.json'), JSON.stringify(DECISION_PASS));

    const { code, exists, markdown } = record(ctx, ['--plan', '.claude/plans/x.plan.md']);
    assert.equal(code, EX_OK);
    assert.ok(exists);
    const m = measurementOf(markdown);
    assert.equal(m.verdict, 'converged');
    assert.ok(Number.isInteger(m.wall_clock_ms) && m.wall_clock_ms >= 4000);
    assert.match(m.recorded_at, /^\d{4}-\d{2}-\d{2}T/);
  });
});

test('an infrastructure halt with no l2.json still records — the UI10 case', () => {
  withDir(function (ctx) {
    // Exactly the 5.2b shape: the reservation was denied, so nothing past
    // started-at/mode/l1 was ever written.
    fs.writeFileSync(path.join(ctx.reviewDir, 'started-at'), String(Date.now() - 1500));
    fs.writeFileSync(path.join(ctx.reviewDir, 'l1.json'), JSON.stringify({ verdict: 'converged' }));
    fs.writeFileSync(path.join(ctx.reviewDir, 'reservation.json'), JSON.stringify({ granted: 0 }));

    const { code, markdown } = record(ctx, ['--halt-stage', '5.2b']);
    assert.equal(code, EX_OK, 'instrumentation must never block the gate');
    const m = measurementOf(markdown);
    assert.equal(m.halt_stage, '5.2b');
    assert.equal(m.granted, 0);
    assert.ok(Number.isInteger(m.wall_clock_ms) && m.wall_clock_ms >= 1500);
  });
});

test('record exits 0 even when the REVIEW_DIR is entirely empty', () => {
  withDir(function (ctx) {
    const { code, markdown } = record(ctx, ['--halt-stage', '5.2a']);
    assert.equal(code, EX_OK);
    const m = measurementOf(markdown);
    assert.equal(m.verdict, 'unknown');
    assert.equal(m.wall_clock_ms, null, 'no started-at → null, and the record says why');
    assert.match(markdown, /### Recording degradations/);
  });
});

test('a --review-dir outside the repo is refused, and the record says why', () => {
  withDir(function (ctx) {
    // Legitimate artifacts exist at the real location. Refusing must mean reading
    // NOTHING — neither the escaped path nor a quiet fallback to these, which
    // would record a different run than the caller named.
    fs.writeFileSync(path.join(ctx.reviewDir, 'started-at'), String(Date.now() - 1000));
    fs.writeFileSync(path.join(ctx.reviewDir, 'decision.json'), JSON.stringify(DECISION_PASS));

    const code = runCli(['record', '--slug', 'tmp-check', '--repo-root', ctx.root,
      '--review-dir', '../escape-attempt']);
    assert.equal(code, EX_OK, 'containment failure must not become a gate failure');

    const markdown = fs.readFileSync(
      path.join(ctx.root, '.claude', 'reviews', 'plan-review-tmp-check.md'), 'utf8');
    const m = measurementOf(markdown);
    assert.equal(m.verdict, 'unknown', 'nothing was read, so nothing may be claimed');
    assert.equal(m.wall_clock_ms, null, 'the real started-at must NOT be picked up by fallback');
    assert.match(markdown, /### Recording degradations/);
    assert.match(markdown, /--review-dir/,
      'an empty record that cannot say why it is empty is the instrument this module replaced');
  });
});

test('corrupt artifacts degrade the record, they do not fail the command', () => {
  withDir(function (ctx) {
    fs.writeFileSync(path.join(ctx.reviewDir, 'started-at'), 'not-a-number');
    fs.writeFileSync(path.join(ctx.reviewDir, 'l2.json'), '{ truncated');
    fs.writeFileSync(path.join(ctx.reviewDir, 'decision.json'), '');
    const { code, markdown } = record(ctx, ['--halt-stage', '5.2g']);
    assert.equal(code, EX_OK);
    assert.equal(measurementOf(markdown).wall_clock_ms, null);
    assert.match(markdown, /### Recording degradations/);
  });
});

// ── PR-Codex R3 F2 — an explicit reviewer failure with no findings ────────────
//
// quorum.js counts `verdict === 'fail'` as a blocking finding in its own right,
// synthesising one even when the reviewer filed nothing (quorum.js:175-181). The
// record rendered only `results[].findings[]`, so this reachable shape produced
// "None — all reviewers passed." on a run the gate had just blocked because of
// that reviewer. A record that contradicts the verdict is worse than no record:
// it is the blocked path this milestone exists to preserve, preserved wrongly.
test('R3-F2: verdict=fail with an empty findings array still appears in the record', () => {
  const built = buildReviewRecord({
    slug: 'r3-f2-explicit-fail',
    planPath: '.claude/plans/x.plan.md',
    mode: 'multi-agent',
    l1: { verdict: 'converged', violations: [] },
    l2: {
      reviewedPlanHash: HASH,
      results: [
        { perspective: 'security', verdict: 'fail', findings: [],
          refutationAttempted: 'tried to refute the trust boundary claim' },
        { perspective: 'test', verdict: 'pass', findings: [],
          refutationAttempted: 'tried to refute the validation strategy' },
      ],
    },
    decision: { review_verdict: 'divergent', review_source: 'multi-agent',
      block: true, reason: '1 blocking finding(s): security/FAIL' },
    startedAtMs: 1000, nowMs: 2000,
    haltStage: '5.2e',
  });

  assert.ok(!/None — all reviewers passed/.test(built.markdown),
    'a blocked run must not report that every reviewer passed');
  assert.match(built.markdown, /security/,
    'the failing reviewer must be named in the Findings table');
  assert.match(built.markdown, /verdict=fail/,
    'the record must say the verdict itself was the block');
});

test('R3-F2: a fail WITH findings is not double-counted', () => {
  const built = buildReviewRecord({
    slug: 'r3-f2-fail-with-findings',
    planPath: '.claude/plans/x.plan.md',
    mode: 'multi-agent',
    l1: { verdict: 'converged', violations: [] },
    l2: {
      reviewedPlanHash: HASH,
      results: [
        { perspective: 'security', verdict: 'fail',
          findings: [{ severity: 'HIGH', claim: 'token leaks to argv', evidence: 'cli.js:12' }],
          refutationAttempted: 'tried and failed' },
      ],
    },
    decision: { review_verdict: 'divergent', review_source: 'multi-agent', block: true },
    startedAtMs: 1000, nowMs: 2000, haltStage: '5.2e',
  });
  const synthetic = (built.markdown.match(/reviewer returned verdict=fail/g) || []).length;
  assert.equal(synthetic, 0,
    'the synthetic row is a fallback for an EMPTY findings list, not an addition');
  assert.match(built.markdown, /token leaks to argv/);
});
