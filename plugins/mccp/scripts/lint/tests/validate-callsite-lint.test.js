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
// What it checks: every line in `plugins/mccp/commands/*.md` matching
// `cli.js validate --command` MUST be followed (in the same bash fence) by
// both `--decision` AND `--plan` flags. The flag values may be variables,
// placeholders, or literals — only flag presence is asserted.
//
// What it does NOT check:
//   - Inline backtick references (e.g. trace.md doc examples) — not in a
//     fenced bash block, ignored.
//   - Alias passthrough files that contain no validate calls — vacuously pass.
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
