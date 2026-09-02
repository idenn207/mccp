'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const HEADER_RE = /^\|\s*Date\s*\|\s*Severity\s*\|\s*Source plan\s*\|\s*Finding\s*\|\s*$/;
const SEPARATOR_RE = /^\|\s*-+\s*\|/;

// GFM makes the leading and trailing pipe of a table row OPTIONAL. Requiring
// both dropped 272 of the 443 rows the file held WHEN THIS WAS MEASURED, so the
// parser — not the data —
// is what gets fixed here (M3 DD1). Loosening the row shape opens a surface
// for prose to be misread as a row, so the date cell tightens in the same
// change: a row is only an item when cell 0 is exactly an ISO date.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLUMNS = 4;

// splitRow — GFM cell split with optional boundary pipes. Returns the content
// cells only; an empty cell produced by a leading or trailing pipe is dropped
// once on each side, never from the interior.
//
// A backslash-escaped pipe is CONTENT, not a delimiter (GFM 4.10). Splitting on
// it tore findings that quote a regex — `/\s*\|\s*/` is real backlog text — into
// two cells, and the rejoin below then handed the consumer `/\s* | \s*/`. That is
// the same silent alteration this parser exists to stop, one layer down. The
// escape is removed after the split so the cell reads as the author wrote it.
//
// An escaped BACKSLASH followed by a delimiter is read here as an escaped pipe.
// GFM is ambiguous there, no backlog row has ever held one, and the cost of
// guessing wrong is a single un-split cell — which loses nothing.
function splitRow(line) {
  const cells = line.trim().split(/\s*(?<!\\)\|\s*/)
    .map(function (c) { return c.replace(/\\\|/g, '|'); });
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

// rowId — a backlog row's identity, and the ONLY implementation of it. M10's
// debt inventory keys `backlog:<rowId>` items with this, and a disposition line
// that cannot find its row is a red gate axis, so a second implementation
// drifting from this one would silently unbind the ledger.
//
// It takes the ITEM, not the raw cells. The plan sketched `rowId(cells)`, but
// cells[3] holds only the finding up to its first interior pipe — scanBacklog
// rejoins the tail below precisely because that truncation loses content. A
// cells-based id would have to repeat that rejoin, which is the "two parsers"
// this export exists to prevent.
//
// Fields are joined with NUL rather than the `|` the plan wrote, because a
// finding may contain `|` (that is why the rejoin exists) and a printable
// separator that occurs in the data lets two different rows collide.
function rowId(item) {
  const it = item || {};
  const material = [
    String(it.date == null ? '' : it.date),
    String(it.severity == null ? '' : it.severity),
    String(it.source_plan == null ? '' : it.source_plan),
    String(it.finding == null ? '' : it.finding),
  ].join('\0');
  return crypto.createHash('sha256').update(material, 'utf8').digest('hex').slice(0, 16);
}

function scanBacklog(repoRoot) {
  const target = path.join(repoRoot, '.claude', 'plans', 'codex-findings-backlog.md');
  // The disposition fields ride on EVERY exit path, including the early ones.
  // A shape that varies by branch hands consumers `undefined` for open_count in
  // exactly the cases they are least likely to test.
  const EMPTY = { closed_count: 0, open_count: 0, resolved_count: 0 };
  if (!fs.existsSync(target)) {
    return Object.assign(
      { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null }, EMPTY);
  }
  let raw;
  try {
    raw = fs.readFileSync(target, 'utf8');
  } catch (err) {
    return Object.assign(
      { ok: false, count: 0, items: [], invalid_count: 0, degraded: false, error: err.message },
      EMPTY);
  }
  const lines = raw.split(/\r?\n/);
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (HEADER_RE.test(lines[i])) { headerIdx = i; break; }
  }
  if (headerIdx === -1) {
    return Object.assign({
      ok: true, count: 0, items: [], invalid_count: 0, degraded: false,
      error: null,
      warning: 'backlog file present but header not found',
    }, EMPTY);
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
  const disposed = countDisposed(repoRoot, items);

  return {
    ok: true,
    count: items.length,
    items,
    invalid_count: invalidCount,
    degraded: invalidCount > 0,
    error: null,
    // M10. `closed` means DISPOSED — a row that has been judged — which is not
    // the same as resolved: a `deferred` row is closed here and still open as
    // work. `resolved_count` counts only the resolving dispositions, so a
    // consumer that needs "actually dealt with" has a field for it instead of
    // reading the wrong one.
    closed_count: disposed.closed,
    open_count: items.length - disposed.closed,
    resolved_count: disposed.resolved,
  };
}

// Lazily required: debt-inventory requires THIS module at load time, so a
// top-level require here would be a cycle and would hand us a half-built
// exports object. By the time scanBacklog runs, the module is complete.
//
// Fail-soft in both directions. A missing or unreadable ledger means nothing is
// disposed — the same posture the promotion suppression takes, for the same
// reason: guessing high here would report debt as settled that no one settled.
function countDisposed(repoRoot, items) {
  const none = { closed: 0, resolved: 0 };
  let debt;
  try {
    debt = require('../../lib/msw-metrics/debt-inventory');
  } catch (err) {
    return none;
  }
  try {
    const doc = debt.readInventory(repoRoot);
    if (!doc) return none;
    const led = debt.readDispositions(repoRoot);
    if (!led.ok) return none;
    const bound = led.lines.filter(function (r) {
      return r.inventory_sha256 === doc.inventory_sha256 &&
        String(r.item_id).slice(0, 8) === 'backlog:';
    });
    const folded = debt.foldDispositions(bound);
    const present = new Set(items.map(function (it) {
      return 'backlog:' + rowId(it);
    }));
    let closed = 0;
    let resolved = 0;
    for (const rec of folded.values()) {
      if (!present.has(rec.item_id)) continue;
      closed += 1;
      if (debt.SUPPRESSING_DISPOSITIONS.indexOf(rec.disposition) !== -1) resolved += 1;
    }
    return { closed, resolved };
  } catch (err) {
    return none;
  }
}

module.exports = {
  scanBacklog,
  // Widened for M10 Task 2: the debt inventory normalizes this same file and
  // must not carry a second copy of the row grammar.
  splitRow,
  isRowShaped,
  rowId,
  COLUMNS,
};
