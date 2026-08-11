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

test('the only "directed" stage is 5.2e, and it states a structural reason', () => {
  // "Not yet mechanised" is a description of unfinished work, not a design. 5.2e
  // is exempt because it already routes through 5.2h, so an inline call would
  // write the record twice and the second write would erase halt_stage.
  const row = LINES.find((l) => /^\| Directed —/.test(l));
  assert.ok(row, 'enforcement table row for directed stages is missing');
  // Dedupe: the cell names the stage once and then repeats it inside the
  // `--halt-stage 5.2e` flag it tells you to pass. 5.2h is the sink it routes
  // through, not a stage of its own.
  const directed = Array.from(new Set(row.match(/5\.2[0-9a-z-]*/g) || []))
    .filter((s) => s !== '5.2h');
  assert.deepEqual(directed, ['5.2e'], '5.2e must be the only directed stage');
  assert.ok(/write the record twice/.test(SRC),
    'the directed exemption must state why it is structural');
});
