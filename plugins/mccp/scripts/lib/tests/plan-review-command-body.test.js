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
//
// M5 Task 6 — the local extractor is gone; this consumes the canonical oracle
// (`command-body/blocks`). The local copy pinned fences to column 0 and to the
// `bash` tag alone, so it could not see indented fences (13 across the corpus,
// 2 of them in this file) nor `sh`/`shell` blocks. Every existing assertion is
// preserved verbatim — only the extractor underneath changed.
const blocks = require('../command-body/blocks');

const BASH_BLOCKS = blocks.bashBlocks(SRC);

function bashBlockLines() {
  const out = [];
  BASH_BLOCKS.forEach(function (b) {
    b.lines.forEach(function (line, i) {
      out.push({ line: line, n: blocks.lineNumberOf(b, i) });
    });
  });
  return out;
}

// Which block a 1-based line belongs to. The F1 lookahead below needs a block
// boundary it can trust: judging the end with its own `/^```\s*$/` would miss an
// indented closing fence and run the lookahead past the block into following
// prose, where a stray `exit N` or `}` would resolve it — a NEW fail-open inside
// the very assertion that exists to prevent fail-open, and green on screen.
const BLOCK_OF_LINE = new Map();
BASH_BLOCKS.forEach(function (b) {
  b.lines.forEach(function (_line, i) { BLOCK_OF_LINE.set(blocks.lineNumberOf(b, i), b); });
});

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

  let scanned = 0;
  for (let i = 0; i < LINES.length; i++) {
    if (!inBash.has(i + 1)) continue;
    if (!RECORDER_CALL.test(LINES[i])) continue;
    scanned++;

    // M5 Task 6b — the block boundary comes from the oracle, not from a local
    // fence regex. Leaving the owning block ends the lookahead.
    const owner = BLOCK_OF_LINE.get(i + 1);
    let resolved = null;
    for (let j = i + 1; j < Math.min(i + 12, LINES.length); j++) {
      if (BLOCK_OF_LINE.get(j + 1) !== owner) break;   // left the block
      if (/\bexit\s+\d+/.test(LINES[j])) { resolved = 'exit'; break; }
      // PIN_HALT()-style helper: the body ends, and the call site does the exit.
      if (/^\s*\}\s*$/.test(LINES[j])) { resolved = 'helper'; break; }
      if (/^\s*fi\s*$/.test(LINES[j])) break;
    }
    if (!resolved) offenders.push({ line: i + 1, text: LINES[i].trim() });
  }

  // M5 Task 6c — non-empty population. A widened extractor can only shrink this
  // set silently; without this pair the assertion below passes vacuously the day
  // RECORDER_CALL stops matching anything.
  assert.ok(scanned > 0, 'no recorder invocation was scanned — the assertion would be vacuous');

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
  const recorderCalls = bashBlockLines().filter((b) => RECORDER_CALL.test(b.line));
  // M5 Task 6c — non-empty population pair (see F1).
  assert.ok(recorderCalls.length > 0, 'no recorder invocation found — the assertion would be vacuous');

  const offenders = recorderCalls
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

// ── codex-intent-context M3 — the hybrid L3 wiring ───────────────────────────
//
// M3's whole claim is that hybrid no longer delegates to 5.2z. That claim lives
// in markdown, which is exactly the surface this file exists to lint: the oracles
// under it can be perfectly green while the block that calls them says something
// else. Each assertion below pins one sentence of the claim.

// A markdown heading and a bash comment are the same three characters at the
// start of a line. Terminating a section on `/^#{1,4} /` alone cut 5.2f off at
// its first `# comment` — eight lines in — and every assertion below then ran
// against a body that did not contain the wiring it was checking, which is a
// LINT THAT SILENTLY PASSES if the regex happens to be a doesNotMatch. Ask the
// fence tracker whether the line is code before treating it as a heading.
function sectionLines(startRe, label) {
  const bashNums = new Set(bashBlockLines().map((b) => b.n));
  const start = LINES.findIndex((l) => startRe.test(l));
  assert.ok(start >= 0, 'section not found: ' + label);
  let end = LINES.length;
  for (let i = start + 1; i < LINES.length; i++) {
    if (bashNums.has(i + 1)) continue;
    if (/^#{1,4} /.test(LINES[i])) { end = i; break; }
  }
  assert.ok(end - start > 8,
    'section ' + label + ' resolved to ' + (end - start) + ' lines — that is a ' +
    'boundary-detection failure, not a short section');
  return LINES.slice(start, end).map((line, k) => ({ line: line, n: start + k + 1 }));
}

function splitBash(sectionRows) {
  const bashNums = new Set(bashBlockLines().map((b) => b.n));
  return {
    bash: sectionRows.filter((r) => bashNums.has(r.n)),
    prose: sectionRows.filter((r) => !bashNums.has(r.n)),
  };
}

test('M3 (a): the hybrid L3 section never launches plan-codex-runner', () => {
  // The double-writer removal is structural, not sequenced: hybrid does not start
  // the runner at all, so "the runner finishes before 5.6b" is not a race that can
  // be lost — it is a race that does not exist (DD1). One line of the runner's
  // name inside 5.2f would restore it silently, because both writers would still
  // produce a receipt and only the interleaving would decide which survived.
  const { bash } = splitBash(sectionLines(/^#### 5\.2f — /, '5.2f'));
  assert.ok(bash.length > 0, 'expected fenced bash inside 5.2f');
  const offenders = bash
    .filter((b) => /plan-codex-runner/.test(b.line))
    .map((b) => ({ line: b.n, text: b.line.trim() }));
  assert.deepEqual(offenders, [],
    '5.2f must not invoke plan-codex-runner.js — that is the receipt writer, and ' +
    '5.6b writes the receipt on this path');
});

test('M3 (b): 5.2f no longer tells the operator to run 5.2z verbatim', () => {
  // The prose is the other half of the wiring. It used to say "execute 5.2z's
  // block verbatim", and an operator following it would launch the runner even
  // with the shell here clean. Mentioning 5.2z is fine and necessary (5.2f
  // explains why it does NOT run it); pairing it with `verbatim` on one line is
  // the instruction that must not come back.
  const { prose } = splitBash(sectionLines(/^#### 5\.2f — /, '5.2f'));
  const offenders = prose
    .filter((b) => /5\.2z/.test(b.line) && /verbatim/i.test(b.line))
    .map((b) => ({ line: b.n, text: b.line.trim() }));
  assert.deepEqual(offenders, [],
    '5.2f must not instruct verbatim execution of 5.2z; L3 has its own subcommand');
});

test('M3 (c): hybrid_without_l3 is actually consumed by the command body', () => {
  // cmdMode computed this field from the first day of the mode oracle and nothing
  // read it, so `MCCP_PLAN_REVIEW=hybrid` alone spent a full panel to reach a
  // conclusion the environment had already fixed. A value computed and never read
  // is indistinguishable from one that is not computed at all.
  const readers = bashBlockLines().filter((b) => /hybrid_without_l3/.test(b.line));
  assert.ok(readers.length > 0,
    'hybrid_without_l3 is computed by cli.js mode but no bash block reads it');
});

test('M3 (d): the hybrid-without-L3 halt costs zero agents', () => {
  // The acceptance criterion is "agents 0", not merely "it halts". That property
  // is positional: the halt has to sit before the reservation, because after it
  // the panel has been paid for whether or not it answers.
  const halt = LINES.findIndex((l) => /^#### 5\.2a-0 — /.test(l));
  const reserve = LINES.findIndex((l) => /^#### 5\.2b — /.test(l));
  assert.ok(halt >= 0, '5.2a-0 section is missing');
  assert.ok(reserve >= 0, '5.2b section is missing');
  assert.ok(halt < reserve,
    '5.2a-0 must precede 5.2b; after the reservation the agents are already charged');

  const { bash } = splitBash(sectionLines(/^#### 5\.2a-0 — /, '5.2a-0'));
  const spends = bash
    .filter((b) => /orchestration-runaway\.js" reserve|Workflow|Task\(/.test(b.line))
    .map((b) => ({ line: b.n, text: b.line.trim() }));
  assert.deepEqual(spends, [],
    '5.2a-0 must not reserve or launch anything — it exists to stop before that');

  const body = bash.map((b) => b.line).join('\n');
  assert.match(body, /--halt-stage 5\.2a-0 /,
    '5.2a-0 must record its own halt like every other stop in 5.2');
  assert.match(body, /\bexit 12\b/,
    '5.2a-0 must exit; a recorder is non-blocking and would leave the branch at 0');
});

test('M3 (e): 5.2f calls the l3 subcommand and accepts only its own record', () => {
  // DD6 moved the nonce from the PATH (5.2z's shape, where the runner owns its own
  // filenames) into the RECORD, because l3.json's name is fixed — `decide` and 5.6b
  // both read it by that name. A poll that only tested for the file's existence
  // would accept a survivor from another run, which is how a stale `converged`
  // reaches a fresh receipt.
  const { bash } = splitBash(sectionLines(/^#### 5\.2f — /, '5.2f'));
  const body = bash.map((b) => b.line).join('\n');

  assert.match(body, /plan-review\/cli\.js" l3 /,
    '5.2f must invoke the dedicated l3 subcommand');
  assert.match(body, /--run-nonce "\$RUN_NONCE"/,
    'the l3 call must carry this run\'s nonce');
  assert.match(body, /\.run_nonce/,
    'the poll must read run_nonce back out of the record');
  assert.match(body, /"\$GOT_NONCE" = "\$RUN_NONCE"/,
    'the poll must COMPARE the record\'s nonce to this run\'s, not merely read it');
  assert.match(body, /nohup /,
    'the l3 call must be detached — codex 900s exceeds the Bash tool\'s 600s cap');
});

test('M3 (f): the focus text is built through a quoted heredoc, never inlined', () => {
  // Security review, absorbed. Everywhere else in this file the Codex focus is a
  // shell LITERAL typed into the markdown, so a backtick or `$(` inside a phrase
  // lifted out of the plan is shell source. A single-quoted heredoc performs no
  // expansion on its body, which makes whatever the author writes inert.
  const { bash } = splitBash(sectionLines(/^#### 5\.2f — /, '5.2f'));
  const body = bash.map((b) => b.line).join('\n');
  assert.match(body, /<<'L3FOCUS'/,
    'the focus heredoc delimiter must be QUOTED; an unquoted one expands its body');
  assert.match(body, /--focus "\$L3_FOCUS"/,
    'the focus must reach the subcommand as a quoted variable, not as an inline literal');
});

test('M3 (g): a hybrid receipt records WHY L3 reached its verdict', () => {
  // write.js has accepted --review-l3-reason since the field existed; nothing
  // passed it, so every hybrid receipt said L3 fired and nothing about what it
  // saw. The boolean alone cannot separate a structured `approve` from a
  // free-text fallback, which is the one distinction the audit needs.
  const bash = bashBlockLines().map((b) => b.line).join('\n');
  assert.match(bash, /--review-l3-invoked/, 'the L3 boolean forward is missing');
  assert.match(bash, /--review-l3-reason "\$REVIEW_L3_REASON"/,
    '5.6b must forward the L3 reason alongside the boolean');
});

test('M3 (h): a hybrid receipt takes its verdict from the nonce-verified record', () => {
  // L3-Codex R1 F1, absorbed. The four L3 artifacts have fixed names and are
  // renamed independently, so overlapping runs can interleave A:codex-verdict →
  // B:codex-verdict → A:l3.json. A's poll accepts l3.json on a matching nonce
  // while a bridge-file read returns B's verdict, and the receipt then seals a
  // verdict produced by a review of a different plan. Reading the same record the
  // poll accepted makes the two agree by construction.
  //
  // The codex path must keep reading the bridge file: 5.2z is its only producer
  // there and there is no l3.json to read (DD5).
  const bash = bashBlockLines().map((b) => b.line).join('\n');
  assert.match(bash, /CODEX_VERDICT_EFF=.*l3\.json/,
    'the hybrid branch must derive CODEX_VERDICT_EFF from l3.json');
  assert.match(bash, /CODEX_VERDICT_EFF=\$\(cat "\$REVIEW_DIR\/codex-verdict"/,
    'the non-hybrid branch must keep reading the bridge artifact unchanged');
});
