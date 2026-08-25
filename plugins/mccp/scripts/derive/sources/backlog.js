'use strict';

const fs = require('fs');
const path = require('path');

const HEADER_RE = /^\|\s*Date\s*\|\s*Severity\s*\|\s*Source plan\s*\|\s*Finding\s*\|\s*$/;
const SEPARATOR_RE = /^\|\s*-+\s*\|/;

// GFM makes the leading and trailing pipe of a table row OPTIONAL. Requiring
// both dropped 272 of 443 real rows silently, so the parser — not the data —
// is what gets fixed here (M3 DD1). Loosening the row shape opens a surface
// for prose to be misread as a row, so the date cell tightens in the same
// change: a row is only an item when cell 0 is exactly an ISO date.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLUMNS = 4;

// splitRow — GFM cell split with optional boundary pipes. Returns the content
// cells only; an empty cell produced by a leading or trailing pipe is dropped
// once on each side, never from the interior.
function splitRow(line) {
  const cells = line.trim().split(/\s*\|\s*/);
  if (cells.length && cells[0] === '') cells.shift();
  if (cells.length && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

// isRowShaped — what counts as "an attempted row" for invalid_count. Canonical
// appends (plan-review/cli.js backlog-append) always emit the leading pipe, so
// that form is row-shaped even when it has too few columns; anything else needs
// a full set of cells. Prose carrying a stray `|` is neither, and is not counted
// as a defect.
function isRowShaped(line, cells) {
  return line.trim().startsWith('|') || cells.length >= COLUMNS;
}

function scanBacklog(repoRoot) {
  const target = path.join(repoRoot, '.claude', 'plans', 'codex-findings-backlog.md');
  if (!fs.existsSync(target)) {
    return { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null };
  }
  let raw;
  try {
    raw = fs.readFileSync(target, 'utf8');
  } catch (err) {
    return { ok: false, count: 0, items: [], invalid_count: 0, degraded: false, error: err.message };
  }
  const lines = raw.split(/\r?\n/);
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (HEADER_RE.test(lines[i])) { headerIdx = i; break; }
  }
  if (headerIdx === -1) {
    return {
      ok: true, count: 0, items: [], invalid_count: 0, degraded: false,
      error: null,
      warning: 'backlog file present but header not found',
    };
  }
  const items = [];
  let invalidCount = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (SEPARATOR_RE.test(line)) continue;
    if (!line.trim()) continue;
    const cells = splitRow(line);
    if (!isRowShaped(line, cells)) continue;
    if (cells.length < COLUMNS || !DATE_RE.test(cells[0])) {
      invalidCount += 1;
      continue;
    }
    items.push({
      date: cells[0],
      severity: cells[1].trim(),
      source_plan: cells[2].trim(),
      // A finding may itself contain `|`. Destructuring the first four cells
      // truncated it at the first one, which silently drops the tail — the same
      // class of loss this parser exists to stop. Rejoin instead.
      finding: cells.slice(COLUMNS - 1).join(' | ').trim(),
    });
  }
  return {
    ok: true,
    count: items.length,
    items,
    invalid_count: invalidCount,
    degraded: invalidCount > 0,
    error: null,
  };
}

module.exports = {
  scanBacklog,
};
