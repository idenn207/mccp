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

const {
  buildReviewRecord, reviewRecordPath, sanitizeSlug, MAX_PLAUSIBLE_SPAN_MS,
} = require('../plan-review/record');
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

// `### Recording degradations` 아래의 `- ` 항목들. 이 문장들은 **커밋되는 텍스트**라,
// 무엇이 그 안에 들어가는지를 test 가 직접 볼 수 있어야 한다(local code-review H1).
function degradationsOf(markdown) {
  const sec = markdown.split('### Recording degradations')[1];
  if (!sec) return [];
  return sec.split(/\r?\n/)
    .filter(function (l) { return l.indexOf('- ') === 0; })
    .map(function (l) { return l.slice(2); });
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
    // review-record-linkage M4 — "full artifacts" grew by one axis. A panel that
    // ran and cannot say how many rounds it spent is now a measurement gap, so a
    // complete run has to carry the ledger reading too; without it this case is
    // no longer the pass path it is named after.
    roundLedger: { available: true, count: 1 },
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
  assert.equal(measurement.rounds, 1, 'M4 — the round count rides in the same measurement');
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

// ── PR-Codex R6 F2 — silence from a reviewer is absence, never approval ───────
//
// R3 caught the explicit form: `verdict:"fail"` with an empty findings array was
// recorded as "None — all reviewers passed." This is the partial-response form of
// the same false operator-facing record. `[pass, null, null]` produces one usable
// refutation row and zero findings, so the old branch asserted a clean panel while
// decideQuorum was blocking on 1-of-3 responses.
const { buildReviewRecord: buildR6 } = require('../plan-review/record');

test('R6: a partial panel is not recorded as "all reviewers passed"', () => {
  const built = buildR6({
    slug: 'r6-partial',
    l2: { results: [{ perspective: 'architect', verdict: 'pass', refutationAttempted: 'structure', findings: [] }, null, null] },
    decision: {
      review_verdict: 'divergent',
      review_source: 'multi-agent',
      reason: 'quorum not met: 1 of 3 responses',
      quorum: { responded: 1, required: 3, of: 3, roles: 1, passed: false },
    },
    nowMs: 1000, startedAtMs: 900,
  });

  assert.ok(!/all .*reviewers? .*passed/i.test(built.markdown),
    'a panel where two reviewers never answered must not be recorded as passing');
  assert.match(built.markdown, /not\*{0,2} a clean pass/i,
    'the record must say plainly that this is not a clean pass');
  assert.match(built.markdown, /absent from this record, not passing/,
    'silent reviewers must be named as absent rather than implied to have approved');
});

test('R6: a genuinely complete clean panel still reads as a pass', () => {
  // The guard must not flip the honest case into a scare. All fielded reviewers
  // responded, the quorum held, nobody filed anything.
  const built = buildR6({
    slug: 'r6-clean',
    l2: { results: [
      { perspective: 'architect', verdict: 'pass', refutationAttempted: 'a', findings: [] },
      { perspective: 'security', verdict: 'pass', refutationAttempted: 'b', findings: [] },
    ] },
    decision: {
      review_verdict: 'converged',
      review_source: 'multi-agent',
      quorum: { responded: 2, required: 2, of: 2, roles: 2, passed: true },
    },
    nowMs: 1000, startedAtMs: 900,
  });

  assert.match(built.markdown, /all 2 fielded reviewer\(s\) responded and passed/,
    'a complete, passing panel must still be reported as one');
});

test('R6: an absent quorum block never manufactures a clean pass', () => {
  // No quorum data at all — the record must fall back to the counts it can see
  // and stay non-committal, never assert completeness it cannot observe.
  const built = buildR6({
    slug: 'r6-noquorum',
    l2: { results: [{ perspective: 'test', verdict: 'pass', refutationAttempted: 'c', findings: [] }] },
    decision: { review_verdict: 'unavailable', review_source: 'multi-agent' },
    nowMs: 1000, startedAtMs: 900,
  });

  assert.ok(!/all .*reviewers? .*passed/i.test(built.markdown),
    'without quorum data the record cannot claim the panel was complete');
});

// ── review-record-linkage M3 — the record's half of the link ────────────────

const { toRepoRelativePosix } = require('../repo-path');

test('M3 — measurement carries receipt_hash, and it is NEVER filled here', function () {
  // `null` means "not yet sealed"; an ABSENT key means "this build has no linkage
  // axis". An audit has to be able to tell a pre-M3 record from an unlinked one, so
  // the key must exist and the value must not.
  const built = buildReviewRecord({
    slug: 'x', planPath: '.claude/plans/x.plan.md', repoRoot: '/repo',
    mode: 'multi-agent', nowMs: 0,
  });
  assert.equal('receipt_hash' in built.measurement, true, 'the key must be present');
  assert.equal(built.measurement.receipt_hash, null,
    'the record is written BEFORE the ship receipt exists — there is no hash to record yet');
});

test('M3 — measurement.plan_path is folded by the SAME rule the receipt uses', function () {
  // The back-patch binding compares these two sealed strings and is FAIL-CLOSED, so
  // a notation difference does not show up as a missing stamp — it shows up as a
  // rejected ship. Behavioural, not a "calls the same helper" static claim: calling
  // a helper does not prove its return value reached the field.
  const B = String.fromCharCode(92);
  const variants = [
    '.claude/plans/x.plan.md',
    './.claude/plans/x.plan.md',
    '.claude//plans/./x.plan.md',
    '.claude' + B + 'plans' + B + 'x.plan.md',
  ];
  variants.forEach(function (v) {
    const built = buildReviewRecord({ slug: 'x', planPath: v, repoRoot: '/repo', nowMs: 0 });
    assert.equal(built.measurement.plan_path, '.claude/plans/x.plan.md',
      JSON.stringify(v) + ' must fold to the one canonical identity');
    assert.equal(built.measurement.plan_path, toRepoRelativePosix(v, '/repo'),
      'and it must agree with the shared helper exactly');
  });
});

test('M3 — an unfoldable plan path is recorded as null, never half-normalized', function () {
  ['../outside.md', '', null, 42].forEach(function (v) {
    const built = buildReviewRecord({ slug: 'x', planPath: v, repoRoot: '/repo', nowMs: 0 });
    assert.equal(built.measurement.plan_path, null,
      JSON.stringify(v) + ' must fold to null — a partly-normalized string would be a ' +
      'plan identity nobody can match');
  });
});

test('M3 — buildReviewRecord still never throws on the new axis', function () {
  // The module's standing contract: measuring must not become a new way for the
  // gate to die. The new fold runs on caller-supplied input, so it is re-checked.
  assert.doesNotThrow(function () {
    buildReviewRecord({ slug: 'x', planPath: {}, repoRoot: {}, nowMs: 0 });
  });
  assert.doesNotThrow(function () { buildReviewRecord({}); });
});

// ═══ review-record-linkage M4 — the round axis ═══════════════════════════════
//
// M1 gave the record a measurement; M4 gives it the ONE number the whole
// milestone is about. Four things are pinned here and they are different
// questions, so they get different tests:
//
//   Task 2 — the value folds correctly, and null is never 0
//   Task 3 — the record declares its own D1 non-conformance, without dying
//   Task 6 — the measurement KEY SET is a contract (deletions/renames go red)
//   Task 4 — the CLI seam actually reads a ledger, and every failure exits 0
//   Task 7(b) — a real spawn, because an in-process call cannot catch a module
//               resolution failure

const { spawnSync } = require('child_process');
const defsM4 = require('../plan-review/linkage-defs');
const CLI_PATH = path.join(__dirname, '..', 'plan-review', 'cli.js');

const ROUND_GATE = 'mccp-plan-codex';

function writeLedger(root, slug, n, raw) {
  const dir = path.join(root, '.claude', 'state', 'review-rounds');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, ROUND_GATE + '__' + slug + '.json');
  if (typeof raw === 'string') { fs.writeFileSync(target, raw); return target; }
  const rounds = [];
  for (let i = 0; i < n; i++) {
    rounds.push({ index: i, at: '2026-01-01T00:00:00.000Z', channel: 'panel', classification: null });
  }
  fs.writeFileSync(target, JSON.stringify(
    { schema_version: 1, gate_id: ROUND_GATE, decision_id: slug, rounds: rounds }, null, 2));
  return target;
}

// ── Task 2 — the fold ────────────────────────────────────────────────────────

test('M4 Task 2: rounds folds from the injected ledger, and absence is null not zero', () => {
  const cases = [
    [undefined, null, 'no injection at all — this build/run read no ledger'],
    [{ available: false, count: null }, null, 'the ledger file did not exist'],
    [{ available: true, count: 0 }, 0, 'a ledger existed and counted nothing'],
    [{ available: true, count: 3 }, 3, 'a ledger existed and counted three'],
  ];
  cases.forEach(function (c) {
    const built = buildReviewRecord({
      slug: 'm4-fold', planPath: '.claude/plans/x.plan.md', mode: 'multi-agent',
      l2: L2_PASS, decision: DECISION_PASS, startedAtMs: 1000, nowMs: 2000,
      roundLedger: c[0],
    });
    assert.equal(built.measurement.rounds, c[1], c[2]);
  });
});

test('M4 Task 2: the rounds KEY is always present — absence means "no axis in this build"', () => {
  const built = buildReviewRecord({ slug: 'm4-key', nowMs: 1 });
  assert.ok(Object.prototype.hasOwnProperty.call(built.measurement, 'rounds'),
    'an absent key and a null value are different facts: the first says a pre-M4 build ' +
    'wrote this record, the second says this run could not observe the count');
  assert.equal(built.measurement.rounds, null);
});

// security S3 — the M3 precedent (:498-504) is a targeted malformed-shape
// re-assertion per new axis. The general fuzz sweep above carries no roundLedger
// case, so the never-throw contract for THIS axis is unproven without these.
test('M4 Task 2: a malformed roundLedger cannot break the never-throw contract', () => {
  ['garbage', [], 42, true, null, { available: true },
    { available: true, count: 'three' }, { available: true, count: 1.5 },
    { available: true, count: -1 }, { available: 'yes', count: 3 },
    { count: 3 }, Object.create(null),
  ].forEach(function (rl) {
    let built;
    assert.doesNotThrow(function () {
      built = buildReviewRecord({ slug: 'm4-fuzz', nowMs: 1, roundLedger: rl });
    }, 'roundLedger=' + JSON.stringify(rl) + ' must not throw');
    assert.ok(Object.prototype.hasOwnProperty.call(built.measurement, 'rounds'));
    assert.ok(built.measurement.rounds === null || Number.isInteger(built.measurement.rounds),
      'a malformed shape folds to null, never to a half-read value');
  });
});

// ── Task 3 — the record declares its own non-conformance ─────────────────────

test('M4 Task 3: a D1-absent record says so, and still exits through the normal path', () => {
  const built = buildReviewRecord({
    slug: 'm4-absent', planPath: '.claude/plans/x.plan.md', mode: 'multi-agent',
    l2: L2_PASS, decision: DECISION_PASS, startedAtMs: 1000, nowMs: 2000,
    roundLedger: { available: true, count: 0 },
  });
  assert.equal(defsM4.classifyRoundStructure(built.measurement).verdict, 'absent');
  assert.ok(built.degradations.some(function (d) { return d.indexOf('D1 round structure ABSENT') === 0; }),
    'the record must declare its own non-conformance rather than leaving the audit to ' +
    'discover it silently');
  assert.match(built.markdown, /### Recording degradations/);
});

test('M4 Task 3: a not_enrolled record carries NO degradation for this axis', () => {
  // dispatch 이전에 멎은 실행 — 라운드가 실제로 0회다. degradation 은 "덜 기록됐다"는
  // 뜻이므로 정상 상태를 거기 적으면 진짜 결손이 그 노이즈에 묻힌다.
  const built = buildReviewRecord({
    slug: 'm4-not-enrolled', planPath: '.claude/plans/x.plan.md',
    startedAtMs: 1000, nowMs: 2000, haltStage: '5.2b',
    roundLedger: { available: false, count: null },
  });
  assert.equal(defsM4.classifyRoundStructure(built.measurement).verdict, 'not_enrolled');
  assert.ok(!built.degradations.some(function (d) { return d.indexOf('D1 round structure ABSENT') === 0; }),
    'a run that never reached dispatch has no round to report — that is not a gap');
});

test('M4 Task 3: a present record carries no degradation and no throw', () => {
  let built;
  assert.doesNotThrow(function () {
    built = buildReviewRecord({
      slug: 'm4-present', planPath: '.claude/plans/x.plan.md', mode: 'multi-agent',
      l2: L2_PASS, decision: DECISION_PASS, startedAtMs: 1000, nowMs: 2000,
      roundLedger: { available: true, count: 2 },
    });
  });
  assert.equal(built.measurement.rounds, 2);
  assert.equal(defsM4.classifyRoundStructure(built.measurement).verdict, 'present');
  assert.ok(!built.degradations.some(function (d) { return d.indexOf('D1 round structure ABSENT') === 0; }));
});

// ── Task 6 — the measurement key set is a contract ───────────────────────────
//
// UI3 says the milestone fixes the MINIMUM contract and leaves the prose free.
// So the assertion is the key set and nothing about the narrative body.

test('M4 Task 6: the measurement key set is pinned — deletions and renames go red', () => {
  const built = buildReviewRecord({
    slug: 'm4-keys', planPath: '.claude/plans/x.plan.md', mode: 'multi-agent',
    l1: { verdict: 'converged' }, l2: L2_PASS, decision: DECISION_PASS,
    reservation: { granted: 4 }, backlog: { appended: 2, skipped_nonblocking: 1 },
    startedAtMs: 1000, nowMs: 2000, roundLedger: { available: true, count: 1 },
  });
  const EXPECTED = [
    'backlog_appended', 'backlog_skipped_nonblocking', 'granted', 'halt_stage', 'layers',
    'plan_path', 'quorum', 'receipt_hash', 'recorded_at', 'rounds', 'reviewed_plan_hash',
    'source', 'verdict', 'wall_clock_ms',
  ].sort();
  assert.deepEqual(Object.keys(built.measurement).sort(), EXPECTED,
    'the measurement key set is the read-side contract every downstream consumer ' +
    '(corpus.js, linkage-audit.js, linkage-defs.js) binds to');
  // 서술 본문에는 아무 제약도 걸지 않는다 (UI3) — 이 test 는 키만 본다.
});

// ── Task 4 — the CLI seam ────────────────────────────────────────────────────

test('M4 Task 4 (a): a ledger on disk lands in the measurement', () => {
  withDir(function (ctx) {
    writeLedger(ctx.root, 'tmp-check', 4);
    const r = record(ctx, []);
    assert.equal(r.code, EX_OK);
    assert.equal(measurementOf(r.markdown).rounds, 4);
  });
});

test('M4 Task 4 (b): an ABSENT ledger file is null, never 0', () => {
  withDir(function (ctx) {
    const r = record(ctx, []);
    assert.equal(r.code, EX_OK);
    const m = measurementOf(r.markdown);
    assert.equal(m.rounds, null,
      'ledger.read() folds a missing file to emptyState, so count() returns 0 — reading ' +
      'that as a measured zero would put DD5 eligibility on top of an indistinguishable 0');
    assert.notEqual(m.rounds, 0);
  });
});

test('M4 Task 4 (c): a corrupt ledger is null plus a degradation, and still exit 0', () => {
  withDir(function (ctx) {
    writeLedger(ctx.root, 'tmp-check', 0, '{ truncated');
    const r = record(ctx, []);
    assert.equal(r.code, EX_OK, 'instrumentation must never block the gate');
    assert.equal(measurementOf(r.markdown).rounds, null);
    assert.match(r.markdown, /round ledger .* is unreadable/);
  });
});

// local code-review H1 — the record is git-tracked, so a degradation is a COMMITTED
// string. The first implementation put `basename` in the sentence and then appended
// `err.message`, and the ledger's corruption error is built as
// `'round ledger is not valid JSON at ' + statePath` — so the host absolute path rode
// in anyway and the comment four lines above promised the opposite. This is the
// `meta.cwd` leak §3.12 already paid a sanctioned rebind migration to close,
// re-opened at a new locus. Reproduced before the fix.
//
// The assertion is on the SHAPE of a path, not on the tmpdir this run happens to get:
// pinning the literal root would pass on a machine whose paths look different.
test('H1: no degradation ever carries a host absolute path into the tracked record', () => {
  const ABSOLUTE = /(^|[\s(])(?:[A-Za-z]:[\\/]|\/(?:home|Users|tmp|var|private)\/)/;

  // (a) corrupt ledger — the path came from ReviewRoundsLedgerError.message
  withDir(function (ctx) {
    writeLedger(ctx.root, 'tmp-check', 0, '{ truncated');
    const r = record(ctx, []);
    const deg = degradationsOf(r.markdown);
    assert.ok(deg.some((d) => /round ledger .* is unreadable/.test(d)),
      'the degradation must still be emitted — the fix redacts it, it does not remove it');
    deg.forEach((d) => assert.ok(!ABSOLUTE.test(d),
      'a committed degradation must not name a host path; got: ' + d));
    assert.match(r.markdown, /is unreadable \(REVIEW_ROUNDS_CORRUPT\)/,
      'the CAUSE survives redaction — an enum names the failure without naming the disk');
  });

  // (b) a slug that cannot be a ledger key — the error message is a different one
  withDir(function (ctx) {
    const code = runCli(['record', '--slug', 'Alpha.Beta_1', '--repo-root', ctx.root,
      '--review-dir', ctx.reviewDir]);
    assert.equal(code, EX_OK);
    const md = fs.readFileSync(
      path.join(ctx.root, '.claude', 'reviews', 'plan-review-Alpha.Beta_1.md'), 'utf8');
    degradationsOf(md).forEach((d) => assert.ok(!ABSOLUTE.test(d),
      'a committed degradation must not name a host path; got: ' + d));
    assert.match(md, /key could not be resolved for this slug \(REVIEW_ROUNDS_BAD_KEY\)/);
  });
});

// local code-review H2 — `wall_clock_ms` guarded only the negative direction. M4's own
// Task 8 regenerated a record a day later from the SAME REVIEW_DIR, so a 6-minute gate
// was recorded as 971.9 minutes (360957 → 58316230) and `leadtime.js` reported it as
// the maximum of the live distribution. That tool declares it "plants no new
// measurement", so it has no way to filter the value out. The upper bound is the
// contrapositive of the guard that already existed.
test('H2: a started-at older than one gate execution is null, not a very long span', () => {
  const bound = MAX_PLAUSIBLE_SPAN_MS;

  // 경계 바로 아래는 통과한다 — 이 가드는 긴 실행을 벌하는 것이 아니다.
  const ok = buildReviewRecord({
    slug: 'h2-inside', l2: L2_PASS, decision: DECISION_PASS,
    startedAtMs: 1000, nowMs: 1000 + bound, roundLedger: { available: true, count: 1 },
  });
  assert.equal(ok.measurement.wall_clock_ms, bound, 'the bound itself is still measurable');
  assert.ok(!ok.degradations.some((d) => d.indexOf('plausibility bound') !== -1));

  // 경계를 넘으면 null + degradation. clamp 가 아니라 폐기여야 한다 — clamp 는 이 모듈이
  // 모르는 사실(실제 경과 시간)을 새로 만든다.
  const stale = buildReviewRecord({
    slug: 'h2-stale', l2: L2_PASS, decision: DECISION_PASS,
    startedAtMs: 1000, nowMs: 1000 + bound + 1, roundLedger: { available: true, count: 1 },
  });
  assert.equal(stale.measurement.wall_clock_ms, null,
    'an unmeasured duration must not read as a very long one');
  assert.notEqual(stale.measurement.wall_clock_ms, bound, 'clamping would invent a fact');
  assert.ok(stale.degradations.some((d) => d.indexOf('plausibility bound') !== -1),
    'the record declares why the axis is null');

  // 이 사이클이 실제로 기록한 값 — 회귀의 원본.
  const observed = buildReviewRecord({
    slug: 'h2-observed', l2: L2_PASS, decision: DECISION_PASS,
    startedAtMs: 0, nowMs: 58316230, roundLedger: { available: true, count: 1 },
  });
  assert.equal(observed.measurement.wall_clock_ms, null,
    '58316230ms (971.9min) is the value M4 Task 8 actually committed; it must not recur');

  // 음수 가드는 그대로다 — 새 가드가 그것을 대체하지 않는다.
  const future = buildReviewRecord({ slug: 'h2-future', startedAtMs: 5000, nowMs: 1000 });
  assert.equal(future.measurement.wall_clock_ms, null);
  assert.ok(future.degradations.some((d) => d.indexOf('in the future') !== -1));
});

// 상한을 복제한 이유는 이 파일의 dep-free 계약이다(`codex-policy.js` 는 fs 를 끌어온다).
// 복제한 값은 갈라질 수 있으므로, dep 제약이 없는 test 가 동치를 붙들어 둔다.
test('H2: the plausibility bound does not drift from the observation it came from', () => {
  const codexPolicy = require('../codex-policy');
  assert.equal(MAX_PLAUSIBLE_SPAN_MS, codexPolicy.MAX_SEAL_AGE_MS,
    'both encode the same measured claim — one gate execution does not exceed 6 hours ' +
    '(codex timeout 900s, gate deadline 1200~2400s). If that observation changes, both move.');
  assert.equal(MAX_PLAUSIBLE_SPAN_MS, 6 * 60 * 60 * 1000);
});

test('M4 Task 4 (d): no usable seal is paired with "the count is not authoritative"', () => {
  withDir(function (ctx) {
    writeLedger(ctx.root, 'tmp-check', 2);
    const r = record(ctx, []);
    assert.match(r.markdown, /no usable round-cap seal for this run/);
    assert.match(r.markdown, /NOT authoritative/,
      'write.js:52-58 pairs "no usable seal" with "the count is not authoritative"; the ' +
      'record layer keeps that pairing');
  });
});

test('M4 Task 4 (e)(f): a gate mismatch and a decision mismatch get DIFFERENT sentences', () => {
  const seal = require('../review-rounds/seal');
  [
    { gate: 'mccp-pr-codex', decision: 'tmp-check', want: /seal on disk enforces gate/ },
    { gate: 'mccp-plan-codex', decision: 'some-other-slug',
      want: /ENFORCED ledger and the MEASURED ledger are different/ },
  ].forEach(function (c) {
    withDir(function (ctx) {
      writeLedger(ctx.root, 'tmp-check', 2);
      const realGitDir = path.join(ctx.root, '.git');
      fs.mkdirSync(realGitDir, { recursive: true });
      seal.sealCap({ gitDir: realGitDir, gateId: c.gate, decisionId: c.decision,
        cap: 1, mode: 'enforce', pinned: true, pinnedBy: 'test' });
      const r = record(ctx, []);
      assert.equal(r.code, EX_OK);
      assert.match(r.markdown, c.want,
        'gate=' + c.gate + ' decision=' + c.decision + ' must produce its OWN sentence');
    });
  });
});

// security S2 — a slug that sanitizeSlug accepts and SLUG_RE rejects makes
// resolveStatePath throw. If that read is evaluated inside the
// buildReviewRecord({...}) argument list, the existing catch swallows it and NO
// RECORD IS WRITTEN AT ALL — precisely the sample loss DD4 exists to prevent,
// and blocked runs are the ones that matter most.
test('M4 Task 4 (g): a ledger-invalid slug still produces a record (security S2)', () => {
  withDir(function (ctx) {
    const code = runCli(['record', '--slug', 'Alpha.Beta_1', '--repo-root', ctx.root,
      '--review-dir', ctx.reviewDir]);
    assert.equal(code, EX_OK);
    const target = path.join(ctx.root, '.claude', 'reviews', 'plan-review-Alpha.Beta_1.md');
    assert.ok(fs.existsSync(target),
      'a slug that names a record but cannot name a ledger must still leave a record');
    const md = fs.readFileSync(target, 'utf8');
    assert.equal(measurementOf(md).rounds, null);
    assert.match(md, /round ledger key could not be resolved/);
  });
});

test('M4 Task 4: the round axis has NO cli flag (DD2 — measurement is not self-report)', () => {
  const src = fs.readFileSync(CLI_PATH, 'utf8');
  ['--rounds', '--round-count', '--ledger-decision', '--ledger-gate', '--gate-id'].forEach(function (f) {
    assert.equal(src.indexOf("'" + f + "'"), -1,
      'a flag on this axis turns a measurement into a self-report (§3.13: the intent ' +
      'decision has no CLI surface, for exactly this reason); found ' + f);
  });
  assert.match(src, /const ROUND_LEDGER_GATE_ID = 'mccp-plan-codex';/,
    'the gate id must be a constant, not a caller-supplied value');
});

// ── Task 7(b) — a real spawn ─────────────────────────────────────────────────
//
// runCli is in-process and shares this process's module cache, so it cannot
// observe a module-resolution failure in the new lazy requires. A spawn can.

test('M4 Task 7(b): a spawned cli.js record writes a record whose rounds classify present', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm4-e2e-'));
  try {
    const reviewDir = path.join(root, '.claude', 'state', 'plan-review');
    fs.mkdirSync(reviewDir, { recursive: true });
    fs.writeFileSync(path.join(reviewDir, 'started-at'), String(Date.now() - 2000));
    fs.writeFileSync(path.join(reviewDir, 'l2.json'), JSON.stringify(L2_PASS));
    fs.writeFileSync(path.join(reviewDir, 'decision.json'), JSON.stringify(DECISION_PASS));
    writeLedger(root, 'e2e-slug', 2);

    const res = spawnSync(process.execPath, [CLI_PATH, 'record',
      '--slug', 'e2e-slug', '--repo-root', root, '--review-dir', reviewDir,
      '--plan', '.claude/plans/x.plan.md'], { encoding: 'utf8', cwd: root });
    assert.equal(res.status, 0, 'stderr: ' + (res.stderr || ''));

    const target = path.join(root, '.claude', 'reviews', 'plan-review-e2e-slug.md');
    assert.ok(fs.existsSync(target));
    // 디스크에 쓰인 것을 corpus 파서로 되읽는다 — 생산자와 소비자가 같은 파일에
    // 대해 같은 답을 내는지가 이 test 의 요점이다.
    const corpusMod = require('../plan-review/corpus');
    const parsed = corpusMod.parseRecord(fs.readFileSync(target, 'utf8'));
    assert.equal(parsed.kind, 'record');
    assert.equal(parsed.measurement.rounds, 2);
    assert.equal(defsM4.classifyRoundStructure(parsed.measurement).verdict, 'present');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
