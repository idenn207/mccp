'use strict';

// commands/plan.md Phase 5.2 — mechanical guards over the gate WIRING, not its prose.
//
// Every defect this file pins was found in the command body, after the oracles
// underneath it were fully unit-tested and green. That is the recurring shape in
// this milestone: the JS is verified, the markdown that calls it is not, and the
// markdown is where the gate actually lives. Three review rounds landed on the
// same class from different angles, so the guard belongs in the suite rather than
// in another paragraph asking the next author to remember.
//
// PR-Codex F1 (high) and F3 (medium) are pinned here directly; the third rule
// pins the "prose wider than wiring" class the santa-loop rounds kept reopening.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PLAN_MD = path.join(__dirname, '..', '..', '..', 'commands', 'plan.md');
const SRC = fs.readFileSync(PLAN_MD, 'utf8');
const LINES = SRC.split(/\r?\n/);

// Recorder invocations only exist inside fenced bash blocks. Prose mentions the
// same token (tables, narrative) and must not be linted as code.
function bashBlockLines() {
  const out = [];
  let inBlock = false;
  for (let i = 0; i < LINES.length; i++) {
    if (/^```bash\s*$/.test(LINES[i])) { inBlock = true; continue; }
    if (/^```\s*$/.test(LINES[i])) { inBlock = false; continue; }
    if (inBlock) out.push({ line: LINES[i], n: i + 1 });
  }
  return out;
}

const RECORDER_CALL = /--halt-stage 5\.[0-9a-z-]+ /;

test('F1: no halt-path recorder is the last statement on its failure branch', () => {
  // The recorder is deliberately non-blocking (`|| true`) so a measurement
  // failure can never become a gate failure. That makes it lethal as a branch
  // terminator: the branch's exit status becomes the recorder's, which is always
  // 0, so a FAILED check reads to the caller as a passing one. 5.2g shipped
  // exactly that — a failed `verify-proof` fell through to 5.2h/5.6b with the
  // same proof.json, and the receipt writer checks the proof's hash, not whether
  // the evidence it names exists.
  const offenders = [];
  const inBash = new Set(bashBlockLines().map((b) => b.n));

  for (let i = 0; i < LINES.length; i++) {
    if (!inBash.has(i + 1)) continue;
    if (!RECORDER_CALL.test(LINES[i])) continue;

    let resolved = null;
    for (let j = i + 1; j < Math.min(i + 12, LINES.length); j++) {
      if (/\bexit\s+\d+/.test(LINES[j])) { resolved = 'exit'; break; }
      // PIN_HALT()-style helper: the body ends, and the call site does the exit.
      if (/^\s*\}\s*$/.test(LINES[j])) { resolved = 'helper'; break; }
      if (/^\s*fi\s*$/.test(LINES[j]) || /^```\s*$/.test(LINES[j])) break;
    }
    if (!resolved) offenders.push({ line: i + 1, text: LINES[i].trim() });
  }

  assert.deepEqual(offenders, [],
    'every halt branch must end in an explicit exit; a non-blocking recorder as ' +
    'the last statement makes a failed check exit 0');
});

test('F1: each helper-wrapped recorder has a caller that exits', () => {
  // The `helper` escape above is only sound while the call sites still stop.
  const callSites = [];
  bashBlockLines().forEach((b, idx, all) => {
    if (!/^\s*[A-Z_]+_HALT\s*$/.test(b.line)) return;
    const rest = all.slice(idx + 1, idx + 5).map((x) => x.line).join('\n');
    callSites.push({ n: b.n, exits: /\bexit\s+\d+/.test(rest) });
  });
  assert.ok(callSites.length > 0, 'expected at least one helper call site');
  assert.deepEqual(callSites.filter((c) => !c.exits), [],
    'a helper-wrapped recorder call site must still exit');
});

test('F3: no recorder invocation discards stderr', () => {
  // cmdRecord always exits 0 by contract, so stderr is the ONLY channel it has
  // for naming a degraded axis ("could not write the record", "review dir
  // rejected"). Redirecting 2>&1 to /dev/null removes the loud half of a
  // deliberate loud-fail-open design and leaves the blocked paths this milestone
  // added with neither a record nor a warning.
  const offenders = bashBlockLines()
    .filter((b) => RECORDER_CALL.test(b.line))
    .filter((b) => /2>&1/.test(b.line))
    .map((b) => ({ line: b.n, text: b.line.trim() }));

  assert.deepEqual(offenders, [],
    'recorder stderr must reach the operator; stdout-only suppression is fine');
});

test('the enforcement table matches the stages actually wired in shell', () => {
  // The santa-loop rounds kept reopening one class: a heading claiming more than
  // the body delivers. The table is the claim; this is the check.
  const tableRow = LINES.find((l) => /^\| Shell — the block records/.test(l));
  assert.ok(tableRow, 'enforcement table row for shell-enforced stages is missing');

  const claimed = (tableRow.match(/5\.2[0-9a-z-]*/g) || []).sort();
  const wired = Array.from(new Set(
    bashBlockLines()
      .filter((b) => RECORDER_CALL.test(b.line))
      .map((b) => (b.line.match(/--halt-stage (5\.2[0-9a-z-]*)/) || [])[1])
      .filter(Boolean)
  )).sort();

  assert.deepEqual(claimed, wired,
    'the table claims a different stage set than the shell blocks implement');
});

test('no stage is left to prose — the enforcement table has no "directed" row', () => {
  // The directed category existed for exactly one stage (5.2e) and the reason
  // given for it was circular: "recording inline would double-write, because the
  // run continues to 5.2h". It only continues if the branch does not exit, and
  // the not-exiting WAS the defect. Once the branch exits there is no second
  // write, so the exemption dissolved rather than being waived.
  assert.equal(LINES.filter((l) => /^\| Directed —/.test(l)).length, 0,
    'a directed row means some stage depends on the operator remembering; ' +
    'mechanise it instead');
});

test('PR-Codex R2: a captured DECIDE_EXIT implies a halt-stage 5.2e branch', () => {
  // DECIDE_EXIT was captured and then never branched on in shell. The instruction
  // to record with --halt-stage 5.2e lived in prose while the executable 5.2h
  // snippet passes no stage at all, so a divergent / budget-skipped / unavailable
  // decision was written to disk with halt_stage: null — a blocked run filed as a
  // pass-path record, which is precisely the measurement UI10 asks for, inverted.
  const bash = bashBlockLines();
  const captures = bash.filter((b) => /^\s*DECIDE_EXIT=\$\?/.test(b.line));
  assert.ok(captures.length > 0, 'expected DECIDE_EXIT to be captured');

  const branches = bash.filter((b) => /\[\s*"\$DECIDE_EXIT"\s*-ne\s*0\s*\]/.test(b.line));
  assert.ok(branches.length > 0,
    'DECIDE_EXIT is captured but never branched on; a blocked decision would ' +
    'fall through to the stage-less 5.2h call and record halt_stage: null');

  const recorded = bash.some((b) => /--halt-stage 5\.2e /.test(b.line));
  assert.ok(recorded, 'the DECIDE_EXIT branch must record with --halt-stage 5.2e');
});

test('the pass-path 5.2h call stays stage-less', () => {
  // It must remain the ONLY recorder invocation without a stage: that is what
  // makes it the pass path. If a blocked run ever reaches it, a null stage
  // overwrites a real one, so the guard above (blocked runs exit first) is what
  // keeps this safe.
  const stageless = bashBlockLines().filter(
    (b) => /plan-review\/cli\.js" record/.test(b.line)
  );
  assert.ok(stageless.length > 0, 'expected the 5.2h recorder invocation');
});

test('PR-Codex R3 F1: 5.2d must not charge the cap for a skipped panel', () => {
  // Axis B made the budget-skip branch reachable for the first time. The workflow
  // returns {skipped:true, results:[]} WITHOUT spawning an agent, and that return
  // is written as l2.json — so the old `-s` (absence) guard passed and the block
  // reconciled the full planned fleet. Committed reservation entries never expire,
  // so that permanently charged session cap headroom for launches that never
  // happened, and cleared the debt marker as if they had.
  const bash = bashBlockLines().map((b) => b.line).join('\n');

  assert.match(bash, /\.skipped\s*===\s*true/,
    '5.2d must read l2.json.skipped, not just test the file for existence');
  assert.match(bash, /ACTUAL_N=0/,
    'a skipped panel must reconcile --actual 0');

  // Unreadable is a THIRD state and must stay pending rather than resolving to 0:
  // guessing 0 for a panel that may have launched under-counts the cap, which is
  // the one direction a cap may never err in.
  assert.match(bash, /"\$SKIPPED"\s*=\s*"\?"/,
    'an unreadable l2.json must leave the reservation pending, not reconcile 0');
});

// ── PR-Codex R4 — pre-launch halts must return the reservation ────────────────
//
// The cap can be poisoned from either direction, and this milestone hit both.
// R3 caught the over-count: a budget-skipped panel reconciled the PLANNED fleet,
// committing launches that never happened. R4 caught the mirror: the pre-launch
// halts reserved workers and then exited without reconciling at all, so the
// headroom stayed charged until the lease expired (10 min default) for reviewers
// that never existed. `--actual 0` is the module's documented value for "nothing
// fired", so a halt that KNOWS zero launched has no excuse to stay silent.
test('R4: every pre-launch halt returns its reservation with --actual 0', () => {
  const bash = bashBlockLines();

  // The three stages that hold a reservation and can stop before the Workflow
  // call. 5.2a is excluded on purpose: it halts before `reserve` runs.
  const PRE_LAUNCH = ['5.2b', '5.2c-emit', '5.2c-pin'];

  for (const stage of PRE_LAUNCH) {
    const idx = bash.findIndex((b) => new RegExp('--halt-stage ' + stage.replace('.', '\.') + ' ').test(b.line));
    assert.ok(idx >= 0, `recorder invocation for ${stage} not found`);

    // Look in the enclosing branch/helper, both directions: the reconcile may sit
    // before the recorder (5.2b/5.2c-emit) or above it in a helper (5.2c-pin).
    const window = bash.slice(Math.max(0, idx - 8), idx + 8).map((b) => b.line).join('\n');
    assert.match(window, /orchestration-runaway\.js" reconcile/,
      `${stage} halts without reconciling; the reservation stays charged for the ` +
      'lease window over reviewers that never launched');
    assert.match(window, /--actual 0/,
      `${stage} must reconcile with --actual 0 (the documented "nothing fired" value)`);
  }
});

test('R4: the known-zero and unknown cases stay distinguishable', () => {
  // 5.2d must NOT reconcile when l2.json is absent: the panel may have launched
  // and only the return was lost, and a cap may never under-count. The pre-launch
  // halts are the opposite case — zero is observed. If this guard ever fails, one
  // of the two policies has been copied onto the other.
  assert.match(SRC, /l2\.json absent or unreadable — NOT reconciling/,
    'the unknown-launch case must still refuse to guess');
  assert.match(SRC, /zero is observed, not assumed|observed rather than assumed/,
    'the known-zero case must state why it is allowed to answer');
});

// ── PR-Codex R5 — the singleton REVIEW_DIR must not leak between runs ─────────
//
// R5 reported this as a HIGH defect: `record` reads the whole artifact set from a
// fixed directory, so a stale l2.json/decision.json from a previous invocation
// could be folded into a current early-halt record. It was a false positive —
// Phase 5.2 purges every one of those files at entry, roughly forty lines above
// 5.2a, and the reviewer's own note says the claim is "inference from the command
// wiring". Refuted, but worth pinning: the invariant is load-bearing (it is what
// makes "absent axis" mean "not observed this run" rather than "left over from
// last run") and it breaks silently the moment someone adds an artifact the
// recorder reads and forgets the purge list.
test('R5: every artifact the recorder reads is reset at Phase 5.2 entry', () => {
  const cliSrc = fs.readFileSync(
    path.join(__dirname, '..', 'plan-review', 'cli.js'), 'utf8');

  // What cmdRecord actually consumes, read off the source rather than restated.
  const readsJson = Array.from(cliSrc.matchAll(/readIf\('([^']+)'\)/g)).map((m) => m[1]);
  const reads = Array.from(new Set(readsJson.concat(['started-at'])));
  assert.ok(reads.length >= 6, `expected the recorder to read several artifacts, saw ${reads.length}`);

  // The entry block: one unconditional `rm -f`, plus anything rewritten right
  // after it (mode.json is regenerated rather than deleted, which is equally safe).
  const entryIdx = LINES.findIndex((l) => /rm -f "\$REVIEW_DIR\/codex-verdict"/.test(l));
  assert.ok(entryIdx >= 0, 'the Phase 5.2 entry purge is missing entirely');
  const entryBlock = LINES.slice(entryIdx, entryIdx + 8).join('\n');

  const unreset = reads.filter((f) => !entryBlock.includes(f));
  assert.deepEqual(unreset, [],
    'these artifacts are read by the recorder but neither purged nor rewritten at ' +
    'Phase 5.2 entry, so a previous run can leak into this run\'s record');

  // And the purge must precede the first thing that writes into the directory,
  // otherwise it would erase the current run's own state.
  const startedAtIdx = LINES.findIndex((l) => /date \+%s%3N > "\$REVIEW_DIR\/started-at"/.test(l));
  assert.ok(startedAtIdx > entryIdx,
    'the purge must run before started-at is stamped, not after');
});
