'use strict';

// review-record-linkage M3 — the wiring, not the prose (UI12).
//
// Every oracle underneath this milestone can be green while the markdown that calls
// it is not, and the markdown is where the gate actually lives. That is the recurring
// shape this repository keeps rediscovering, so the guards live in the suite rather
// than in another paragraph asking the next author to remember.
//
// Two kinds of assertion here, and they answer different questions:
//   - STATIC: does the call site exist, in the right phase, with the right argument?
//   - SPAWN e2e: does running the real code actually seal a link — and does it
//     REFUSE to when the anchor disagrees?
//
// The e2e pair is the point. With only the positive one, deleting the whole anchor
// still passes; that was the exact test-HIGH raised against this plan's R3 round.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const blocks = require('../command-body/blocks');

const CMD_DIR = path.join(__dirname, '..', '..', '..', 'commands');
const PR_MD = fs.readFileSync(path.join(CMD_DIR, 'pr.md'), 'utf8');
const PLAN_MD = fs.readFileSync(path.join(CMD_DIR, 'plan.md'), 'utf8');

const WRITE_JS = fs.readFileSync(path.join(__dirname, '..', '..', 'receipt', 'write.js'), 'utf8');
const CLI_JS = fs.readFileSync(path.join(__dirname, '..', 'plan-review', 'cli.js'), 'utf8');
const RECORD_JS = fs.readFileSync(path.join(__dirname, '..', 'plan-review', 'record.js'), 'utf8');
const LINK_JS = fs.readFileSync(path.join(__dirname, '..', 'plan-review', 'link-receipt.js'), 'utf8');
const FINALIZE_JS = fs.readFileSync(
  path.join(__dirname, '..', 'pr-phase-helpers', 'finalize-receipt.js'), 'utf8');
const GUARD_JS = fs.readFileSync(path.join(__dirname, '..', 'evidence-stage-guard.js'), 'utf8');

// Wiring lives in fenced bash. Prose mentions the same tokens (tables, narrative)
// and must not be mistaken for a call site — the same reason
// plan-review-command-body.test.js consumes this oracle instead of scanning raw text.
function bashText(src) {
  return blocks.bashBlocks(src).map(function (b) { return b.lines.join('\n'); }).join('\n');
}
// The "this construct must NOT appear" assertions need CODE only. A shell comment
// that NAMES the forbidden form — which is how each of them is explained at its call
// site — is not an occurrence of it, and treating it as one makes the rule
// unstatable in the very place it has to be justified.
function bashCode(src) {
  return blocks.bashBlocks(src)
    .map(function (b) {
      return b.lines.filter(function (l) { return !/^\s*#/.test(l); }).join('\n');
    })
    .join('\n');
}
const PR_BASH = bashText(PR_MD);
const PLAN_BASH = bashText(PLAN_MD);
const PR_CODE = bashCode(PR_MD);
const PLAN_CODE = bashCode(PLAN_MD);

// ── static: the call sites exist ─────────────────────────────────────────────

test('plan.md 5.6b forwards --review-record-path, and does NOT hand-build the filename', function () {
  assert.ok(PLAN_BASH.indexOf('--review-record-path') !== -1,
    'plan.md must forward the review record path onto the plan receipt');
  assert.ok(PLAN_BASH.indexOf('reviewRecordPath(') !== -1,
    'the path must come from record.js#reviewRecordPath — sanitizeSlug owns that filename');
  // A hand-interpolated path seals a name that may differ from the file on disk
  // (sanitizeSlug rewrites the slug), producing a dangling link that still passes
  // the shape check and is counted as "linked".
  //
  // Scoped to the FLAG's argument, not to any occurrence of the pattern: an
  // unrelated `echo` elsewhere in this body tells the operator where to read the
  // findings on a bypass, and that recovery message is not a filename construction.
  const flagLines = PLAN_CODE.split('\n')
    .filter(function (l) { return l.indexOf('--review-record-path') !== -1; });
  assert.ok(flagLines.length > 0, 'the flag must be forwarded somewhere');
  flagLines.forEach(function (l) {
    assert.equal(/plan-review-\$\{?DECISION_SLUG/.test(l), false,
      'the review-record filename must never be interpolated into the flag: ' + l.trim());
    assert.ok(l.indexOf('"$REVIEW_RECORD_PATH"') !== -1,
      'the flag must carry the value reviewRecordPath() returned: ' + l.trim());
  });
});

test('plan.md records the plan path ONCE and 5.6b reads that artifact', function () {
  assert.ok(PLAN_BASH.indexOf('"$REVIEW_DIR/plan-path"') !== -1,
    '5.2 must record the plan path as the single source');
  assert.ok(PLAN_BASH.indexOf('PLAN_PATH_FILE=') !== -1 && PLAN_BASH.indexOf('--plan "$PLAN_PATH"') !== -1,
    '5.6b must pass the artifact value, not a re-typed literal');
  // Purged at 5.2 entry with the rest, so a previous run cannot answer for this one.
  const purge = PLAN_BASH.slice(PLAN_BASH.indexOf('rm -f "$REVIEW_DIR/codex-verdict"'));
  assert.ok(purge.indexOf('"$REVIEW_DIR/plan-path"') !== -1,
    'the plan-path artifact must be purged at 5.2 entry');
});

test('pr.md 2.5.7 derives SHIP_PLAN_PATH — the placeholder is gone', function () {
  assert.equal(PR_MD.indexOf('<plan path or PR title>'), -1,
    'the 2.5.7 placeholder must be replaced by a derived value; while it was a ' +
    'placeholder, choosing a plan that satisfies the anchor was enough to claim ' +
    "another milestone's review as this ship's evidence");
  assert.ok(PR_BASH.indexOf('SHIP_PLAN_PATH="${PR_PLAN_PATH:-') !== -1,
    'SHIP_PLAN_PATH must derive the same way 2.5.8/2.5.9 already do');
  assert.ok(PR_BASH.indexOf('if [ ! -f "$SHIP_PLAN_PATH" ]; then') !== -1,
    'an unresolved plan path must HALT with a diagnostic, not die in an ENOENT throw');
  assert.ok(PR_BASH.indexOf('--plan "$SHIP_PLAN_PATH"') !== -1,
    'FINALIZE_FLAGS must carry the derived value');
  assert.ok(PR_BASH.indexOf('PR_PLAN_PATH=') !== -1,
    'the HALT must name the operator recovery channel');
});

test('pr.md 2.5.7 calls link-receipt with the binding, and reads the skip toggle THERE', function () {
  assert.ok(PR_BASH.indexOf('link-receipt') !== -1, 'the back-patch call must exist');
  assert.ok(PR_BASH.indexOf('--expect-plan-path "$SHIP_PLAN_PATH"') !== -1,
    'the back-patch must be BOUND to this ship — an unbound one can mutate another ' +
    "decision's git-tracked record before any guard runs");
  assert.ok(PR_BASH.indexOf('--receipt-hash "$FINALIZE_RECEIPT_HASH"') !== -1,
    'the back-patch must use the hash finalize just sealed');
  // The record path is the SEALED one, never re-derived from the slug — that would
  // revive the filename convention this milestone removed.
  assert.ok(PR_BASH.indexOf('SEALED_RECORD') !== -1 && PR_BASH.indexOf('review_record_path') !== -1,
    'the --record argument must come from the sealed receipt field');

  // The toggle is read at 2.5.7, not 3.0: the receipt is hash-sealed by 3.0, so a
  // 3.0-time edit either breaks the no-rehash invariant or HALTs every ship on the
  // stage guard's hash check.
  const at257 = PR_BASH.indexOf('MCCP_PR_SKIP_LINK_EVIDENCE');
  const at30 = PR_BASH.indexOf('git add -- .claude/receipts/mccp-pr-codex/');
  assert.notEqual(at257, -1, 'the toggle must be read in the command body');
  assert.ok(at257 < at30, 'MCCP_PR_SKIP_LINK_EVIDENCE must be read BEFORE the evidence commit');
  assert.ok(PR_BASH.indexOf('--link-evidence-skip-reason') !== -1,
    'the reason must be forwarded to the receipt write, where it can still be sealed');
});

test('pr.md Phase 3.0 widens all FOUR places, and none of them by prefix', function () {
  const evidence = PR_BASH.slice(PR_BASH.indexOf('LINK_EVIDENCE_FILE="$MCCP_TMP/link-evidence--'));
  assert.notEqual(evidence.length, 0, 'the evidence-commit block must exist');

  // 0. entry predicate — without it a record-only run skips the whole block and
  //    HALTs nowhere, silently dropping half the link.
  assert.ok(/git status --porcelain -- "\$LINK_RECORD"/.test(PR_BASH),
    'the entry predicate must also open on a dirty linked record');
  // 1. stage set
  assert.ok(PR_BASH.indexOf('git add -- "$LINK_RECORD"') !== -1, 'the record must be staged');
  // 2. guard stdin producer — widening only the stage set leaves the record
  //    unreachable by the guard, so the hash check silently never fires.
  assert.ok(/git diff --cached --name-only -- \.claude\/receipts\/mccp-pr-codex\/ \$\{LINK_RECORD/.test(PR_BASH),
    "the guard's stdin pathspec must include the linked record");
  // 3. the guard's anchor
  assert.ok(PR_BASH.indexOf('--anchor-file "$LINK_EVIDENCE_FILE"') !== -1,
    'the guard must receive this run\'s anchor; without it the review-record branch ' +
    'is fail-closed and the axis never fires');

  // NOT a prefix exemption. A `grep -v '^\.claude/reviews/'` would satisfy every
  // stated test while opening the whole record corpus to the evidence commit.
  assert.equal(PR_CODE.indexOf("grep -v '^\\.claude/reviews/'"), -1,
    'the OUTSIDE-HALT exemption must be one literal path, never a directory prefix');
  assert.ok(PR_BASH.indexOf('grep -vxF "$LINK_RECORD"') !== -1,
    'the exemption must match exactly one path, literally');
});

// Every assertion above reads the markdown as TEXT, and text cannot tell whether the
// embedded `node -e` snippet even parses. It did not: a top-level `return` inside
// `node -e` is `SyntaxError: Illegal return statement`, so `$LINK_RECORD` was empty
// on every run — stderr discarded, exit code absorbed by `|| printf ''` — and all
// four widenings above were dead while this file stayed green. So run the thing.
test('pr.md Phase 3.0 LINK_RECORD extraction RUNS — the snippet must parse and emit', function () {
  // Take the real snippet out of the command body rather than restating it; a copy
  // here would drift and re-open exactly the gap this test exists to close.
  const m = /LINK_RECORD=\$\(node -e '([\s\S]*?)'\s*"\$\{CLAUDE_PLUGIN_ROOT\}"/.exec(PR_BASH);
  assert.ok(m, 'the Phase 3.0 LINK_RECORD extraction snippet must be findable');
  const snippet = m[1];

  const pluginRoot = path.join(__dirname, '..', '..', '..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-link-record-'));
  const artifact = path.join(tmp, 'link-evidence.json');
  const hash = 'sha256:' + 'a'.repeat(64);
  const recordPath = '.claude/reviews/plan-review-example.md';

  // Run it WITHOUT `2>/dev/null` and WITHOUT `|| printf ''`. The command body needs
  // both; this test must not inherit the two mufflers that hid the defect.
  const run = function (argPath) {
    return execFileSync(process.execPath, ['-e', snippet, pluginRoot, argPath],
      { encoding: 'utf8' });
  };

  fs.writeFileSync(artifact, JSON.stringify({
    record_path: recordPath,
    receipt_path: '.claude/receipts/mccp-pr-codex/example.json',
    receipt_hash: hash,
  }));
  assert.equal(run(artifact), recordPath,
    'a valid artifact must yield the record path — an empty result silently kills ' +
    'the entry predicate, the stage set, the guard pathspec and the OUTSIDE exemption');

  // The negatives matter as much: absence and malformed input must both fold to
  // empty WITHOUT throwing, because the command body treats empty as "nothing to do".
  assert.equal(run(path.join(tmp, 'does-not-exist.json')), '',
    'a missing artifact must yield an empty string, not an exception');
  fs.writeFileSync(artifact, '{ not json');
  assert.equal(run(artifact), '', 'unparsable JSON must yield an empty string');
  fs.writeFileSync(artifact, JSON.stringify({
    record_path: '../escape.md', receipt_path: 'x', receipt_hash: hash,
  }));
  assert.equal(run(artifact), '', 'a rejected carrier must yield an empty string');

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('the anchor travels as an artifact, never as an environment variable', function () {
  // An exported var either fails to cross the fence (silently disabling the check)
  // or outlives its run — the stale-value class this file has hard-`unset` twice.
  assert.equal(GUARD_JS.indexOf('MCCP_EVIDENCE_STAGE_ANCHOR'), -1,
    'the guard must not read an anchor from the environment');
  assert.ok(GUARD_JS.indexOf("'--anchor-file'") !== -1, 'the anchor must arrive on argv');
  assert.ok(PR_BASH.indexOf('rm -f "$LINK_EVIDENCE_FILE"') !== -1,
    'the artifact must be cleared before use so a previous run cannot answer for this one');
});

test('meta.plan_path is derived from --plan and has NO CLI flag of its own', function () {
  // receipt/cli.js parseFlags forwards arbitrary `--*` into write(); a flag here
  // would let any shell caller assert a plan identity it does not hold, turning the
  // anchor from a check into a self-report (§3.13's argument for the intent gate).
  assert.equal(WRITE_JS.indexOf("args['plan-path']"), -1,
    'write.js must never read a --plan-path flag');
  assert.ok(/receipt\.meta\.plan_path = rel/.test(WRITE_JS),
    'meta.plan_path must be stamped from the resolved --plan');
  const cliHelp = fs.readFileSync(path.join(__dirname, '..', '..', 'receipt', 'cli.js'), 'utf8');
  assert.equal(cliHelp.indexOf('--plan-path '), -1, 'no --plan-path flag may be advertised');
});

test('the normalization rule has exactly one owner', function () {
  // Two implementations would surface as REJECTED SHIPS, not silent drift: the
  // back-patch binding that compares these two values is fail-closed.
  const OWNER = "require('../repo-path')";
  assert.ok(RECORD_JS.indexOf(OWNER) !== -1, 'record.js must use the shared helper');
  assert.ok(WRITE_JS.indexOf("require('../lib/repo-path')") !== -1,
    'write.js must use the shared helper');
  assert.ok(LINK_JS.indexOf(OWNER) !== -1,
    'link-receipt.js must fold with the same rule it compares against');
  assert.ok(FINALIZE_JS.indexOf("require('../repo-path')") !== -1,
    'finalize-receipt.js must fold the anchor with the same rule');
});

test('the link-receipt write locus does not reuse the read-side resolver', function () {
  // security-reviewer H1. resolveContained returns an UNRESOLVED lexical path when
  // realpath fails — deliberate for readers, a hole for a writer.
  assert.ok(CLI_JS.indexOf('function resolveRecordForWrite') !== -1,
    'the write locus needs its own strict resolver');
  const fn = CLI_JS.slice(CLI_JS.indexOf('function resolveRecordForWrite'),
    CLI_JS.indexOf('function cmdLinkReceipt'));
  assert.ok(fn.indexOf('lstatSync') !== -1, 'the leaf must be lstat-ed, not stat-ed');
  assert.ok(fn.indexOf('isSymbolicLink') !== -1, 'a symlinked leaf must be refused');
  assert.ok(fn.indexOf('realpathSync') !== -1, 'the path must be resolved');
  const cmd = CLI_JS.slice(CLI_JS.indexOf('function cmdLinkReceipt'),
    CLI_JS.indexOf('function cmdBacklogAppend'));
  assert.equal(cmd.indexOf('resolveContained'), -1,
    'cmdLinkReceipt must not fall back to the read-side resolver');
});

test('finalize-receipt reads the upstream plan-codex corpus by path, not by slug', function () {
  assert.ok(FINALIZE_JS.indexOf("listReceipts(repoRoot, 'mccp-plan-codex')") !== -1,
    'the anchor must scan the gate directory');
  assert.ok(FINALIZE_JS.indexOf('declared === shipPlan') !== -1,
    'selection must be by meta.plan_path equality');
  assert.ok(FINALIZE_JS.indexOf('matches.length !== 1') !== -1,
    '0 and >=2 matches must both refuse to stamp — picking the first row would ' +
    'reinstate the failure this closes under a new name');
});

// ── spawn e2e: the produced real value (UI12) ────────────────────────────────
//
// This cycle's own ship cannot produce a live link — its upstream plan receipt was
// written before meta.plan_path existed, so the anchor correctly finds nothing.
// These two runs stand in for that, and they run production code, not a mock.

function mkShipRepo(opts) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-wire-')));
  const g = function (args) {
    execFileSync('git', args, { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
  };
  g(['init', '-q']);
  g(['config', 'user.email', 't@example.com']);
  g(['config', 'user.name', 't']);

  const planRel = '.claude/plans/wired.plan.md';
  fs.mkdirSync(path.join(root, '.claude', 'plans'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'reviews'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'receipts', 'mccp-plan-codex'), { recursive: true });
  fs.writeFileSync(path.join(root, planRel), '# Plan: wired\n\n## Summary\n\nbody\n');
  fs.writeFileSync(path.join(root, '.claude/reviews/plan-review-wired.md'),
    panelRecord('wired', { verdict: 'divergent', plan_path: planRel, receipt_hash: null }));

  // The upstream plan receipt. `meta.plan_path` is what the anchor matches on;
  // the negative run points it at a DIFFERENT plan.
  fs.writeFileSync(path.join(root, '.claude/receipts/mccp-plan-codex/wired.json'),
    JSON.stringify({
      schema_version: 'v1', gate_id: 'mccp-plan-codex', phase: 'plan',
      decision_id: 'wired', plan_hash: 'sha256:' + 'c'.repeat(64), round: 1,
      findings: [], resolution: { converged: false, rounds: 1, review_source: 'multi-agent' },
      subject_hash: null, receipt_hash: null,
      meta: {
        created_at: new Date().toISOString(), command: '/mccp:plan', cwd: '.',
        plan_path: opts.upstreamPlanPath,
        review_record_path: '.claude/reviews/plan-review-wired.md',
      },
    }, null, 2));
  g(['add', '-A']);
  execFileSync('git', ['commit', '-q', '-m', 'fixture'], {
    cwd: root, stdio: ['ignore', 'ignore', 'ignore'],
    env: Object.assign({}, process.env, {
      GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z',
    }),
  });
  return { root: root, planRel: planRel };
}

function panelRecord(slug, measurement) {
  return ['# Plan Review Panel — ' + slug, '',
    '**Verdict**: `divergent` via `multi-agent`', '',
    '## Findings', '', 'None.', '',
    '## Measurement', '', '```json', JSON.stringify(measurement, null, 2), '```', ''].join('\n');
}

const FINALIZE = path.join(__dirname, '..', 'pr-phase-helpers', 'finalize-receipt.js');

function runFinalize(root, planRel) {
  const res = { code: 0, stdout: '', stderr: '' };
  try {
    res.stdout = execFileSync(process.execPath, [FINALIZE,
      '--gate', 'mccp-pr-codex', '--decision', 'wired', '--plan', planRel, '--cwd', root],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, { MCCP_CODEX_DISABLED: '1' }) });
  } catch (e) {
    res.code = typeof e.status === 'number' ? e.status : 1;
    res.stdout = (e.stdout || '').toString();
    res.stderr = (e.stderr || '').toString();
  }
  return res;
}

function shipMeta(root) {
  const p = path.join(root, '.claude', 'receipts', 'mccp-pr-codex', 'wired.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')).meta;
}

test('e2e POSITIVE — a matching anchor seals the link onto a real ship receipt', function () {
  const { root, planRel } = mkShipRepo({ upstreamPlanPath: '.claude/plans/wired.plan.md' });
  runFinalize(root, planRel);
  const meta = shipMeta(root);
  assert.ok(meta, 'the ship receipt must have been written');
  assert.equal(meta.review_record_path, '.claude/reviews/plan-review-wired.md',
    'the sealed link is the produced real value UI12 asks for');
  assert.equal(meta.plan_review_expected, true,
    'review_source=multi-agent establishes D2 eligibility');
  assert.equal(meta.plan_path, planRel, 'the ship receipt seals its own plan identity');
  fs.rmSync(root, { recursive: true, force: true });
});

test('e2e NEGATIVE — a mismatched anchor seals NOTHING', function () {
  // Without this run the positive one passes with the whole anchor deleted.
  const { root, planRel } = mkShipRepo({ upstreamPlanPath: '.claude/plans/some-other.plan.md' });
  const r = runFinalize(root, planRel);
  const meta = shipMeta(root);
  assert.ok(meta, 'the ship must still be written — a missing link is not a blocked ship');
  assert.equal('review_record_path' in meta, false,
    'a non-matching upstream receipt must not lend its link to this ship');
  assert.equal('plan_review_expected' in meta, false,
    'nor its eligibility — "do not know" is never promoted to a decision');
  assert.ok(/link_anchor_unresolved/.test(r.stderr),
    'the refusal must be loud, not silent');
  fs.rmSync(root, { recursive: true, force: true });
});

test('e2e NEGATIVE — a legacy upstream receipt (no meta.plan_path) seals NOTHING', function () {
  const { root, planRel } = mkShipRepo({ upstreamPlanPath: undefined });
  runFinalize(root, planRel);
  const meta = shipMeta(root);
  assert.ok(meta);
  assert.equal('review_record_path' in meta, false,
    'absence of the anchor field is legacy, not a match — this is exactly the state ' +
    "of this milestone's own bootstrap cycle");
  fs.rmSync(root, { recursive: true, force: true });
});

test('e2e FALSIFIABILITY — removing the meta.plan_path stamp turns the POSITIVE red', function () {
  // The plan asks for this check by name: a static assertion that is never shown to
  // fail is not a proof. Simulated by writing an upstream receipt whose plan_path
  // key is absent — the exact state write.js would produce with the stamp deleted.
  const { root, planRel } = mkShipRepo({ upstreamPlanPath: '.claude/plans/wired.plan.md' });
  const up = path.join(root, '.claude', 'receipts', 'mccp-plan-codex', 'wired.json');
  const body = JSON.parse(fs.readFileSync(up, 'utf8'));
  delete body.meta.plan_path;
  fs.writeFileSync(up, JSON.stringify(body, null, 2));
  runFinalize(root, planRel);
  const meta = shipMeta(root);
  assert.equal('review_record_path' in meta, false,
    'with the stamp gone the positive e2e MUST fail to seal a link — if this ever ' +
    'passes with a link, the anchor is not actually load-bearing');
  fs.rmSync(root, { recursive: true, force: true });
});
