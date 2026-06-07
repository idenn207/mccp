'use strict';

// v0.2.8 Task 2.6.1 review-only invariant — declarative grep guard.
//
// pr.md and prp-pr.md must NOT contain any Edit(/Write(/MultiEdit(/NotebookEdit(
// tool-call references inside the Phase 2.5 (Codex review) block, except as
// negative invariant statements ("NO Edit/Write calls"). This is a mechanical
// regression check on top of the runtime pr-phase-guard.js hook — if a future
// edit accidentally adds an Edit call into the Codex-review subphase, this
// test fires before the change ships.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const COMMANDS_DIR = path.join(__dirname, '..', '..', '..', 'commands');
const PR_MD = path.join(COMMANDS_DIR, 'pr.md');
const PRP_PR_MD = path.join(COMMANDS_DIR, 'prp-pr.md');

const MUTATION_TOOL_CALL_RE = /\b(Edit|Write|MultiEdit|NotebookEdit)\s*\(/g;

function readSection(filePath, startHeading, endHeading) {
  // Return the substring of filePath content between the line starting with
  // `## ${startHeading}` (inclusive) and `## ${endHeading}` (exclusive).
  // Both markers are matched as exact heading-2 lines.
  const raw = fs.readFileSync(filePath, 'utf8');
  const startRe = new RegExp('^## ' + startHeading + '.*$', 'm');
  const endRe = new RegExp('^## ' + endHeading + '.*$', 'm');
  const startMatch = raw.match(startRe);
  if (!startMatch) {
    throw new Error('start heading not found in ' + filePath + ': ## ' + startHeading);
  }
  const startIdx = raw.indexOf(startMatch[0]);
  const tailFromStart = raw.slice(startIdx);
  const endMatch = tailFromStart.match(endRe);
  if (!endMatch) return tailFromStart;
  return tailFromStart.slice(0, tailFromStart.indexOf(endMatch[0]));
}

function findMutationCalls(text) {
  // Return matches that look like tool calls (heuristic). Filter out lines
  // that explicitly state the invariant ("NO Edit/Write" / negative phrasing).
  const lines = text.split(/\r?\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!MUTATION_TOOL_CALL_RE.test(line)) { MUTATION_TOOL_CALL_RE.lastIndex = 0; continue; }
    MUTATION_TOOL_CALL_RE.lastIndex = 0;
    // Skip negative invariant statements.
    if (/\bNO\s+(Edit|Write|MultiEdit|NotebookEdit)\b/i.test(line)) continue;
    if (/forbidden|FORBIDDEN/.test(line)) continue;
    // Skip references to filenames like Edit.test.js etc — pattern requires `(` after the word.
    hits.push({ lineNo: i + 1, line: line.trim() });
  }
  return hits;
}

test('pr.md Phase 2.5 contains NO Edit/Write/MultiEdit/NotebookEdit tool calls', () => {
  const section = readSection(PR_MD, 'Phase 2.5', 'Phase 3');
  const hits = findMutationCalls(section);
  assert.deepStrictEqual(hits, [],
    'Found mutation tool calls inside /mccp:pr Phase 2.5 — review-only invariant breached:\n' +
    hits.map(function (h) { return '  L' + h.lineNo + ': ' + h.line; }).join('\n'));
});

test('pr.md contains explicit review-only invariant statement', () => {
  const raw = fs.readFileSync(PR_MD, 'utf8');
  // The invariant block uses "NO Edit/Write" wording.
  assert.match(raw, /NO Edit\/Write\/MultiEdit calls in this command body/i,
    'pr.md must declare review-only invariant block (Task 2.6.1)');
});

test('prp-pr.md inherits review-only invariant via alias section', () => {
  const raw = fs.readFileSync(PRP_PR_MD, 'utf8');
  // prp-pr.md should mention Task 2.6.1 inheritance.
  assert.match(raw, /Task 2\.6\.1/,
    'prp-pr.md must mention Task 2.6.1 to confirm alias inheritance');
  assert.match(raw, /Review-only invariant/i,
    'prp-pr.md must mention review-only invariant in alias section');
});

test('pr.md Phase 2.5.3 contains pr-phase-lock.js enter call', () => {
  const section = readSection(PR_MD, 'Phase 2.5', 'Phase 3');
  assert.match(section, /pr-phase-lock\.js[^\n]*enter/,
    'Phase 2.5.3 must invoke pr-phase-lock.js enter to arm the runtime guard');
});

test('pr.md Phase 2.5 contains pr-phase-lock.js exit finalizer call', () => {
  const section = readSection(PR_MD, 'Phase 2.5', 'Phase 3');
  assert.match(section, /pr-phase-lock\.js[^\n]*exit/,
    'Phase 2.5.6b must invoke pr-phase-lock.js exit to run the finalizer');
});
