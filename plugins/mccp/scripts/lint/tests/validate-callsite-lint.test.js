'use strict';

// v1.3.1 R2-F3 absorption — static lint guard on receipt-validate callsites.
//
// Why this exists: in v1.3.0 and earlier, five command bodies called
// `cli.js validate --command X` with no `--decision`/`--plan` flags. The CLI
// silently fell back to `decisionId='default'`, which under v0.2.8 generic-
// receipt quarantine triggered fail-closed quarantine on a slug the user
// never owed. The v1.3.1 patch fixes the five callsites; this test ensures
// any future callsite (or any regression that removes a flag) fails CI before
// it can reach a user session.
//
// What it checks:
//   1. (all commands) every line in `plugins/mccp/commands/*.md` matching
//      `cli.js validate --command` MUST be followed (in the same bash fence)
//      by both `--decision` AND `--plan` flags. Values are not inspected here:
//      variables, placeholders and literals all satisfy this rule.
//   2. (`pr.md` only, v1.25.2 — gate-guard-integrity M3 / C6) the `--plan`
//      VALUE must additionally be a real shell variable (`"$…"`).
//   3. (`pr.md` only, v1.25.2 — local review) the bash block containing a gating
//      callsite must DERIVE `DECISION_SLUG` itself, rather than inheriting it
//      from an earlier block.
//
// Why rule 2 exists, and why it is scoped to one file: until v1.25.2 this
// header said *"The flag values may be variables, placeholders, or literals —
// only flag presence is asserted"*, i.e. it declared its own blind spot. C6 is
// precisely a defect that walked through it: `pr.md`'s 2.5.8 chain-check kept
// the literal `--plan <plan path>` while 2.5.7 and 2.5.9 had been moved to real
// variables, and the comment at 2.5.9 asserted all of them passed `--plan`.
// Flag-presence-only lint reported green throughout. That is the same species
// of failure the gate-guard-integrity PRD names as G2 — "the lint only looks at
// flag presence, so it passes while the guard is dead".
//
// Scope: `pr.md` is where a `--plan` value is load-bearing, because all three
// of its validate callsites gate a result (Phase 1.6 preflight, 2.5.8
// chain-check, 2.5.9 ship-gate) — the set of "validate callsites in pr.md" and
// the set of "gating callsites" are the same set. Mind the labels: the preflight
// lives under `## Phase 1.6`, NOT under 2.5.7. 2.5.7 is the finalize-receipt
// WRITE step; it carries `--plan "<plan path or PR title>"` as a placeholder by
// design and is invisible to this matcher (it is not a `validate` call), so
// citing it as an example of a real-variable callsite points a reader at the
// opposite of the claim. Other command bodies legitimately carry
// placeholder callsites for documentation (`plan.md` has two), so a repo-wide
// value rule would red them immediately. File scope is what keeps rule 2 honest
// rather than merely strict.
//
// Failure mode being closed: an unsubstituted `<plan path>` is not a bad
// argument, it is a bash SYNTAX ERROR (`<` opens a redirection). The quiet path
// is the model dropping the `--plan` line rather than emitting broken bash —
// and `validate-cmd.js` keeps the entire staleness check inside
// `if (opts.planPath)`, so an absent `--plan` skips it with neither error nor
// warning. Rule 1 catches the dropped line; rule 2 catches the placeholder that
// invites dropping it.
//
// What it does NOT check:
//   - Inline backtick references (e.g. trace.md doc examples) — not in a
//     fenced bash block, ignored.
//   - Alias passthrough files that contain no validate calls — vacuously pass.
//   - Non-`validate` subcommands. `cli.js dedupe --plan <plan-path>`
//     (`pr.md` 2.5.x) is invisible to the matcher by construction and is out of
//     scope for both rules.
//   - `--plan` values in command bodies other than `pr.md` (rule 1 still
//     applies to them).
//   - Whether a shell variable is DEFINED and NON-EMPTY at run time. Rule 2
//     inspects the value's shape only, so `--plan "$UNSET"` passes it. Rule 3
//     closes the one instance of that gap this file can see statically (the
//     slug the path is built from); the general case is a runtime property no
//     text lint can decide.
//
// Mechanical guard, not a style preference. Plan body lists this as the
// gate that keeps Task 1 (callsite patch) correct across future edits.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const COMMANDS_DIR = path.resolve(__dirname, '..', '..', '..', 'commands');

function listCommandMarkdown(dir) {
  return fs.readdirSync(dir)
    .filter(function (n) { return n.endsWith('.md'); })
    .map(function (n) { return path.join(dir, n); });
}

// Split markdown into fenced bash blocks. Returns an array of { startLine, lines }
// where startLine is 1-based for diagnostic messages.
function extractBashBlocks(content) {
  const lines = content.split(/\r?\n/);
  const blocks = [];
  let inBlock = false;
  let blockStart = -1;
  let buf = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inBlock) {
      // open: ```bash or ```sh (be permissive — both treated as shell)
      if (/^```(bash|sh)\s*$/i.test(line.trim())) {
        inBlock = true;
        blockStart = i + 1; // 1-based start of body
        buf = [];
      }
    } else {
      if (/^```\s*$/.test(line.trim())) {
        blocks.push({ startLine: blockStart, lines: buf });
        inBlock = false;
        buf = [];
      } else {
        buf.push(line);
      }
    }
  }
  return blocks;
}

// A validate callsite begins on the line where `validate --command` (or its
// multi-line opening `validate \\` followed by `--command` on the next line)
// is found, and ends at the first line that does NOT end in a `\\` continuation.
// Returns array of { firstLine (1-based abs), text (joined string) }.
function findValidateCallsites(block) {
  const result = [];
  const lines = block.lines;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match patterns:
    //   1) `cli.js validate --command <X>` (single-line full form)
    //   2) `cli.js validate \\` (multi-line opener; --command on later line)
    const isFullForm = /cli\.js"?\s+validate\s+--command/.test(line);
    const isOpener = /cli\.js"?\s+validate\s+\\\s*$/.test(line);
    if (!isFullForm && !isOpener) continue;

    // Collect continuation lines (those ending with `\`).
    const parts = [line];
    let j = i;
    while (j < lines.length && /\\\s*$/.test(lines[j])) {
      j++;
      if (j < lines.length) parts.push(lines[j]);
    }
    const absLine = block.startLine + i; // 1-based absolute file line
    result.push({ firstLine: absLine, text: parts.join('\n') });
  }
  return result;
}

function callsiteHasFlag(text, flag) {
  // Match `--flag ` (with following whitespace) or `--flag=` (rare in mccp).
  const re = new RegExp('(^|\\s)' + flag.replace('--', '--') + '(\\s|=)');
  return re.test(text);
}

// v1.25.2 (C6) — first token after `--flag`, for rule 2's value inspection.
// Returns null when the flag is absent (rule 1 owns that case).
function callsiteFlagValue(text, flag) {
  const m = text.match(new RegExp('(?:^|\\s)' + flag + '[\\s=]+(\\S+)'));
  return m ? m[1] : null;
}

// A gating `--plan` value must be a real shell variable, i.e. start with `"$`.
// Anything opening with `<` is a placeholder (and a bash redirection); a bare
// literal path is not wrong per se but is not what any gating callsite uses,
// and admitting it would re-open the substitution dependency this rule closes.
function isShellVariableValue(value) {
  return typeof value === 'string' && /^"\$/.test(value);
}

// Rule 2's file scope. Kept as an explicit set rather than a line-number list
// so the boundary survives edits that move lines (the defect this rule closes
// was itself introduced by an edit that moved lines).
const VALUE_CHECKED_BASENAMES = new Set(['pr.md']);

test('validate-callsite-lint: every validate call in command bodies forwards --decision AND --plan', function () {
  const files = listCommandMarkdown(COMMANDS_DIR);
  assert.ok(files.length > 0, 'no command markdown files found at ' + COMMANDS_DIR);

  const violations = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const blocks = extractBashBlocks(content);
    for (const block of blocks) {
      const calls = findValidateCallsites(block);
      for (const call of calls) {
        const hasDecision = callsiteHasFlag(call.text, '--decision');
        const hasPlan = callsiteHasFlag(call.text, '--plan');
        if (!hasDecision || !hasPlan) {
          violations.push({
            file: path.relative(path.resolve(__dirname, '..', '..', '..', '..', '..'), file),
            line: call.firstLine,
            missing: [
              !hasDecision ? '--decision' : null,
              !hasPlan ? '--plan' : null,
            ].filter(Boolean),
            snippet: call.text.split('\n').slice(0, 3).join(' / '),
          });
        }
      }
    }
  }

  if (violations.length > 0) {
    const lines = violations.map(function (v) {
      return '  ' + v.file + ':' + v.line +
        ' missing ' + v.missing.join(' + ') + '\n    ' + v.snippet;
    });
    assert.fail(
      'validate-callsite-lint failed — ' + violations.length +
      ' callsite(s) missing required flags:\n' + lines.join('\n') +
      '\n\nFix: every `cli.js validate --command <X>` invocation in a bash block ' +
      'must also pass `--decision <slug>` AND `--plan <path>`. See v1.3.1 plan body Task 1 + Task 3.'
    );
  }
});

test('validate-callsite-lint: gating validate callsites in pr.md pass --plan as a shell variable, not a placeholder', function () {
  const files = listCommandMarkdown(COMMANDS_DIR)
    .filter(function (f) { return VALUE_CHECKED_BASENAMES.has(path.basename(f)); });
  assert.ok(files.length > 0, 'no value-checked command body found — rule 2 would be vacuous');

  const violations = [];
  let callsiteCount = 0;
  for (const file of files) {
    const blocks = extractBashBlocks(fs.readFileSync(file, 'utf8'));
    for (const block of blocks) {
      for (const call of findValidateCallsites(block)) {
        callsiteCount++;
        const value = callsiteFlagValue(call.text, '--plan');
        if (value === null) continue; // rule 1 reports the absent flag
        if (!isShellVariableValue(value)) {
          violations.push({
            file: path.basename(file),
            line: call.firstLine,
            value: value,
          });
        }
      }
    }
  }

  // Non-vacuity: if the matcher ever stops finding pr.md's callsites (e.g. the
  // fence style changes), this rule would pass by finding nothing. Assert the
  // denominator is non-zero rather than trusting an empty violation list.
  assert.ok(
    callsiteCount > 0,
    'no validate callsites found in ' + Array.from(VALUE_CHECKED_BASENAMES).join(', ') +
    ' — the matcher stopped matching; rule 2 would be silently vacuous'
  );

  if (violations.length > 0) {
    assert.fail(
      'validate-callsite-lint failed — ' + violations.length +
      ' gating callsite(s) pass a non-variable --plan value:\n' +
      violations.map(function (v) {
        return '  ' + v.file + ':' + v.line + '  --plan ' + v.value;
      }).join('\n') +
      '\n\nFix: derive a real path variable in the same bash block and pass it quoted, e.g.\n' +
      '  SHIP_PLAN_PATH="${PR_PLAN_PATH:-.claude/plans/${DECISION_SLUG}.plan.md}"\n' +
      '  … validate --command mccp:pr --decision "${DECISION_SLUG}" --plan "$SHIP_PLAN_PATH"\n' +
      'A literal `<plan path>` is a bash redirection, not an argument; see this file\'s header.'
    );
  }
});

test('validate-callsite-lint: regression — a placeholder --plan value is detected (rule 2 is not vacuous)', function () {
  const synth = [
    '```bash',
    'node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js validate \\',
    '  --command mccp:code-review \\',
    '  --decision ${DECISION_SLUG} \\',
    '  --plan <plan path>',
    '```',
  ].join('\n');
  const calls = findValidateCallsites(extractBashBlocks(synth)[0]);
  assert.strictEqual(calls.length, 1, 'one synthetic callsite expected');
  // Rule 1 is satisfied — this is exactly how C6 stayed green for two milestones.
  assert.strictEqual(callsiteHasFlag(calls[0].text, '--plan'), true,
    'flag presence alone must still pass — that blind spot is what rule 2 closes');
  // Rule 2 must reject it.
  assert.strictEqual(isShellVariableValue(callsiteFlagValue(calls[0].text, '--plan')), false,
    'placeholder `<plan path>` must be rejected as a non-variable value');
  assert.strictEqual(isShellVariableValue('"$SHIP_PLAN_PATH"'), true,
    'a quoted shell variable must be accepted');
});

// Rule 3 (local review, 2026-08-16). Rule 2 fixed the value's SHAPE; it cannot
// see whether the variable that shape refers to actually holds anything. In
// `pr.md` every gating `--plan` is built from `${DECISION_SLUG}`, and each fenced
// block may execute as its own shell, so a block that only *reads* the slug can
// receive an empty string — which yields `.claude/plans/.plan.md`, unreadable,
// `stale`, `ok=false`. That failure did not exist before C6 made `--plan`
// reachable at 2.5.8, which is precisely why the guard belongs with it. An
// assignment inside a `#` comment does not count (the anchor requires the name
// at the start of a statement).
const SLUG_ASSIGN_RE = /(^|\n)[ \t]*DECISION_SLUG=/;

test('validate-callsite-lint: every pr.md block with a gating callsite derives DECISION_SLUG itself', function () {
  const files = listCommandMarkdown(COMMANDS_DIR)
    .filter(function (f) { return VALUE_CHECKED_BASENAMES.has(path.basename(f)); });
  assert.ok(files.length > 0, 'no value-checked command body found — rule 3 would be vacuous');

  const violations = [];
  let blockCount = 0;
  for (const file of files) {
    for (const block of extractBashBlocks(fs.readFileSync(file, 'utf8'))) {
      const calls = findValidateCallsites(block);
      if (calls.length === 0) continue;
      blockCount++;
      if (!SLUG_ASSIGN_RE.test(block.lines.join('\n'))) {
        violations.push({ file: path.basename(file), line: calls[0].firstLine });
      }
    }
  }

  assert.ok(
    blockCount > 0,
    'no bash block with a validate callsite found in pr.md — rule 3 would be silently vacuous'
  );

  if (violations.length > 0) {
    assert.fail(
      'validate-callsite-lint failed — ' + violations.length +
      ' gating block(s) inherit DECISION_SLUG instead of deriving it:\n' +
      violations.map(function (v) { return '  ' + v.file + ':' + v.line; }).join('\n') +
      '\n\nFix: add the deterministic derivation to the same bash block:\n' +
      '  DECISION_SLUG=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js" derive-decision \\\n' +
      '    --command mccp:pr --args "$ARGUMENTS")\n' +
      'It is a no-op when the slug was already in scope; see this file\'s header.'
    );
  }
});

test('validate-callsite-lint: regression — an inherited DECISION_SLUG is detected (rule 3 is not vacuous)', function () {
  const inherited = [
    '```bash',
    '# DECISION_SLUG= was derived in an earlier block (a comment is not a derivation)',
    'PLAN=".claude/plans/${DECISION_SLUG}.plan.md"',
    'node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js validate \\',
    '  --command mccp:pr \\',
    '  --decision ${DECISION_SLUG} \\',
    '  --plan "$PLAN"',
    '```',
  ].join('\n');
  const derived = inherited.replace(
    'PLAN=".claude/plans/${DECISION_SLUG}.plan.md"',
    'DECISION_SLUG=$(node cli.js derive-decision --command mccp:pr --args "$ARGUMENTS")\n' +
    'PLAN=".claude/plans/${DECISION_SLUG}.plan.md"'
  );

  const bad = extractBashBlocks(inherited)[0];
  const good = extractBashBlocks(derived)[0];
  assert.strictEqual(findValidateCallsites(bad).length, 1, 'one synthetic callsite expected');
  // Rules 1 and 2 both pass here — that is the whole point: the value is a real
  // quoted variable, it just cannot be trusted to hold anything.
  assert.strictEqual(callsiteHasFlag(findValidateCallsites(bad)[0].text, '--plan'), true);
  assert.strictEqual(
    isShellVariableValue(callsiteFlagValue(findValidateCallsites(bad)[0].text, '--plan')), true,
    'rule 2 must accept it — rule 3 is what rejects it'
  );
  assert.strictEqual(SLUG_ASSIGN_RE.test(bad.lines.join('\n')), false,
    'a commented-out assignment must not count as a derivation');
  assert.strictEqual(SLUG_ASSIGN_RE.test(good.lines.join('\n')), true,
    'a real in-block derivation must be accepted');
});

test('validate-callsite-lint: regression — synthetic missing --plan is detected', function () {
  // Verify the lint logic itself catches the failure mode (not just the
  // happy path). We synthesize an in-memory block instead of mutating real
  // files to keep this test hermetic.
  const synth = '```bash\nnode ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js validate --command mccp:plan --decision foo\n```';
  const blocks = extractBashBlocks(synth);
  assert.strictEqual(blocks.length, 1, 'one synthetic block expected');
  const calls = findValidateCallsites(blocks[0]);
  assert.strictEqual(calls.length, 1, 'one synthetic callsite expected');
  assert.strictEqual(callsiteHasFlag(calls[0].text, '--decision'), true, '--decision should be detected');
  assert.strictEqual(callsiteHasFlag(calls[0].text, '--plan'), false, 'missing --plan should be detected');
});

test('validate-callsite-lint: regression — multi-line callsite without --plan also caught', function () {
  const synth = [
    '```bash',
    'node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js validate \\',
    '  --command mccp:prp-implement \\',
    '  --decision ${DECISION_SLUG}',
    '```',
  ].join('\n');
  const blocks = extractBashBlocks(synth);
  const calls = findValidateCallsites(blocks[0]);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(callsiteHasFlag(calls[0].text, '--decision'), true);
  assert.strictEqual(callsiteHasFlag(calls[0].text, '--plan'), false,
    'multi-line callsite missing --plan must be caught by lint');
});

test('validate-callsite-lint: inline backtick references are NOT scanned', function () {
  // trace.md uses `node cli.js validate --command <slug>` as documentation
  // text inside a backtick span, not a bash fence. The lint must ignore it.
  const synth = '- `node cli.js validate --command foo` — doc example\n';
  const blocks = extractBashBlocks(synth);
  assert.strictEqual(blocks.length, 0, 'inline backtick must not be parsed as a fenced bash block');
});
