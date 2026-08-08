'use strict';

// codex-intent-context M1 — the marker state machine lives in Bash inside
// commands/plan.md, so no JS suite executes it. That gap is not theoretical: the
// `blocked` row of the Phase 5.6 state table was documented, and 5.4a spelled out
// its whole recovery block, while the code read `MARKER_EXIT` into a variable it
// then never consulted. The chain still stopped at 5.7 for want of a receipt, so
// nothing failed loudly — the operator just lost the verdict, the reason and the
// recovery steps.
//
// These are static checks, which is the weakest kind of test and the kind this
// repo has already been burned by: a lint that matches no real writer form passes
// forever and proves nothing. So each assertion below was mutation-checked against
// the pre-fix file — revert the branch it names and the test fails.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PLAN_MD = path.join(__dirname, '..', '..', '..', 'commands', 'plan.md');
const body = fs.readFileSync(PLAN_MD, 'utf8');

function section(startNeedle, endNeedle) {
  const a = body.indexOf(startNeedle);
  assert.ok(a >= 0, 'anchor moved: ' + startNeedle);
  const b = body.indexOf(endNeedle, a);
  assert.ok(b > a, 'anchor moved: ' + endNeedle);
  return body.slice(a, b);
}

function bashBlocks(text) {
  const out = [];
  const re = /```bash\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out.join('\n');
}

const markerSection = section('### 5.6 — Await the runner', '### 5.6b');
const markerBash = bashBlocks(markerSection);

test('the marker section actually contains the polling Bash (anchors still valid)', function () {
  assert.match(markerBash, /while \[ ! -f "\$MARKER" \]/,
    'if this fails the section anchors drifted and every check below is vacuous');
});

// The general form of the defect: a value computed from the marker and then never
// consulted. Reading is allowed anywhere later in the file, so a variable consumed
// by a downstream phase still counts.
test('no variable the marker section computes is left write-only', function () {
  const assigned = new Set();
  const re = /^[ \t]*([A-Z][A-Z0-9_]*)=/gm;
  let m;
  while ((m = re.exec(markerBash)) !== null) assigned.add(m[1]);
  assert.ok(assigned.size > 0, 'no assignments found — the extractor is broken');

  const unread = [];
  assigned.forEach(function (name) {
    const read = new RegExp('\\$\\{?' + name + '\\b');
    // Strip the assignments themselves so `NAME=$(...)` does not count as a read.
    const withoutAssignments = body.replace(
      new RegExp('^[ \\t]*' + name + '=', 'gm'), '');
    if (!read.test(withoutAssignments)) unread.push(name);
  });

  assert.deepStrictEqual(unread, [],
    'these are computed and never consulted — a dropped branch looks exactly like this');
});

// Each state the table documents must have something that acts on it. A table row
// with no branch is a claim the command body does not honour.
test('every branching state in the 5.6 table has an implementation', function () {
  assert.match(markerSection, /\|\s*`blocked`\s*\|/, 'the state table itself moved');

  assert.match(markerBash, /if \[ "\$MARKER_EXIT" != "0" \]/,
    '`blocked` (marker exit_code=12) must branch — otherwise 5.4a is unreachable');
  assert.match(markerBash, /if \[ "\$MARKERLESS" = "1" \]/,
    '`succeeded-markerless` must branch — otherwise it falls into the marker parse ' +
    'and dies as a foreign-marker mismatch');
  assert.match(markerBash, /timed out/,
    '`timeout` must report itself as a timeout, not as some other failure');
  assert.match(markerBash, /crashed/,
    '`crashed` must be reported distinctly from a blocked verdict');
});

test('the blocked branch surfaces the verdict and the reason, not just an exit code', function () {
  const blocked = markerBash.slice(markerBash.indexOf('if [ "$MARKER_EXIT" != "0" ]'));
  assert.match(blocked, /intent_gate_verdict/,
    'the operator needs the verdict to pick a recovery path in 5.4a');
  assert.match(blocked, /\.reason/,
    'the operator needs the reason the runner recorded');
  assert.match(blocked, /MCCP-INTENT-GATE-STOP/,
    'the stop must be the intent-gate one, not a generic gate stop');
});

test('a decision lock held by another run is diagnosed instead of waited out', function () {
  // The runner exits 11 rather than becoming a second writer, and it writes no
  // marker when it does. Nothing of ours will ever appear, so polling our own
  // nonce-scoped paths burns the full deadline and then blames a timeout — or,
  // once the winner releases the lock, reads the winner's nonce, sees it is not
  // ours, and calls a successful run "crashed". The caller must read the lock's
  // owner and say what actually happened.
  assert.match(markerBash, /LOCK_OWNER=/,
    'the caller must read the lock owner; exit 11 is otherwise invisible to it');
  assert.match(markerBash, /\[ "\$LOCK_OWNER" != "\$RUN_NONCE" \]/,
    'a foreign owner must be compared against our nonce');
  const foreign = markerBash.slice(markerBash.indexOf('LOCK_OWNER='));
  assert.match(foreign, /already owns decision/,
    'the operator must be told another run owns the decision, not "timed out"');
});

test('a stale lock does not turn an already-written receipt into a timeout', function () {
  // The poll loop only consults the receipt when the lock DISAPPEARS. A hard kill
  // skips the runner's finally block, so the lock outlives the process and a gate
  // that already wrote its receipt is reported as a timeout. The recheck after the
  // loop is what makes `succeeded-markerless` reachable in that state.
  const afterLoop = markerBash.slice(markerBash.lastIndexOf('done'));
  assert.match(afterLoop, /MARKERLESS/,
    'the post-loop recheck must be able to set the markerless state');
  assert.match(afterLoop, /sealed_nonce|intent_run_nonce/,
    'the recheck must consult the nonce the receipt sealed');
});

test('a lock-loser is diagnosed in the 5.2 wait, not only in 5.6', function () {
  // 5.6's owner check is unreachable for a lock-loser: the exit-11 runner writes
  // nothing, so 5.2 waits out its full 1200s on nonce-scoped artifacts that can
  // never appear and generic-stops before 5.6 runs. A diagnosis that arrives
  // after 1200s of silence is not a diagnosis.
  const i = body.indexOf('Then wait for the runner to publish the findings');
  assert.ok(i > 0, 'anchor moved: 5.2 wait');
  const wait = body.slice(i, body.indexOf('### 5.3', i));
  assert.match(wait, /LOCK_OWNER=/,
    'the 5.2 wait must read the lock owner');
  assert.match(wait, /already owns decision/,
    'the lock-loser must be told what happened instead of waiting out the deadline');
});

test('5.6b rejects an unreplaced placeholder, not just a missing heading', function () {
  // Phase 5.1 appends the heading AND the placeholder together, so a heading-only
  // grep passes even when 5.3 never wrote the triage record — an approved receipt
  // for a plan carrying no review content.
  const i = body.indexOf('5.6b — Verify the Codex section was injected');
  assert.ok(i > 0, 'anchor moved: 5.6b');
  const verify = body.slice(i, i + 1400);
  assert.match(verify, /placeholder: will be replaced/,
    "5.6b must reject a plan still carrying 5.1's placeholder");
  assert.match(verify, /if grep -q/,
    'use `if`, not `grep … && { … }` — a non-match would otherwise trip set -e');
});

test('the 5.2 wait resolves a vanished lock three ways, not one', function () {
  // 5.6 owns markerless recovery, but 5.2 runs first and used to stop before it.
  // A no-adjudication run (free-form / zero findings / codex disabled) never
  // creates $AWAITING, so a lost marker on such a run timed out here with a valid
  // receipt already on disk. The same blind spot swallowed the lock-loser whose
  // winner released the lock between polls.
  const i = body.indexOf('Then wait for the runner to publish the findings');
  assert.ok(i > 0, 'anchor moved: 5.2 wait');
  const wait = body.slice(i, body.indexOf('### 5.3', i));

  assert.match(wait, /SPAWN_GRACE/,
    'a detached runner needs time to create its lock, or the first poll calls it a crash');
  assert.match(wait, /intent_run_nonce/,
    '5.2 must consult the nonce the receipt sealed, not only $AWAITING/$MARKER');
  assert.match(wait, /if \[ "\$SEALED" = "\$RUN_NONCE" \]; then break/,
    'our own sealed nonce must hand off to 5.6 rather than stop');
  assert.match(wait, /completed by another run/,
    'a winner that already released the lock must still be named, not timed out');
  assert.match(wait, /crashed/,
    'nothing sealed at all is a crash, and must be reported as one');
});

test('the adjudication file is published atomically', function () {
  // The runner polls for $ADJUDICATION and reads it the instant it appears, so an
  // in-place heredoc lets it parse a half-written file and block the gate as
  // `incomplete` for input that was complete a millisecond later.
  const i = body.indexOf('cat > "$ADJUDICATION');
  assert.ok(i > 0, 'anchor moved: 5.5a heredoc');
  const block = body.slice(i, i + 1800);
  assert.match(block, /cat > "\$ADJUDICATION\.tmp"/,
    'write to a temp path first');
  assert.match(block, /mv "\$ADJUDICATION\.tmp" "\$ADJUDICATION"/,
    'then rename — rename(2) is atomic within a directory');
});
