'use strict';

// relocation ledger — schema + pure parser (multi-session-work-loop M4 Task 3).
//
// The ledger's single source of truth is the markdown table in
// docs/multi-session-work-loop/instruction-contract.md §3. This module parses
// that table; it deliberately does NOT carry its own copy of the section list.
// Duplicating the list in code would let the two drift, and the drift would be
// invisible precisely when it matters (a section removed from CLAUDE.md but
// still listed in code would silently pass the reachability lint).
//
// Pure: no filesystem, no process state. lint.js owns all I/O.

const EXPECTED_COLUMNS = Object.freeze([
  'ID', 'Heading', 'Disposition', 'Dest File', 'Dest Anchor', 'Resident Pointer',
]);

const DISPOSITIONS = Object.freeze(['resident', 'on-demand', 'retire']);
const EMPTY_CELL = '-';

/**
 * Extract `##`/`###` headings from markdown, ignoring fenced code blocks.
 *
 * Fence awareness is not optional here: CLAUDE.md carries large bash/json
 * blocks whose `#` comment lines would otherwise register as sections and
 * pollute the before/after set comparison in check C4.
 *
 * @param {string} markdown
 * @param {Object} [opts]
 * @param {number} [opts.maxLevel=3] - deepest heading level to collect
 * @returns {Array<{level: number, title: string, line: number}>}
 */
function extractHeadings(markdown, opts = {}) {
  const maxLevel = opts.maxLevel || 3;
  const out = [];
  let inFence = false;
  const lines = String(markdown == null ? '' : markdown).split(/\r?\n/);

  lines.forEach((line, idx) => {
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const m = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (!m) return;
    const level = m[1].length;
    if (level < 2 || level > maxLevel) return;
    const title = m[2].trim();
    if (!title) return;
    out.push({ level: level, title: title, line: idx + 1 });
  });

  return out;
}

function splitRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((c) => c.trim());
}

function isSeparatorRow(line) {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
}

function cell(value) {
  if (value === undefined || value === null) return null;
  const v = String(value).trim();
  if (v === '' || v === EMPTY_CELL) return null;
  return v;
}

/**
 * Parse the relocation ledger table out of instruction-contract.md.
 *
 * @param {string} markdown
 * @returns {{ok: boolean, rows: Array<Object>, errors: string[]}}
 */
function parseLedger(markdown) {
  const errors = [];
  const rows = [];
  const lines = String(markdown == null ? '' : markdown).split(/\r?\n/);

  let headerIdx = -1;
  let columns = null;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('|') === -1) continue;
    const cells = splitRow(lines[i]);
    const hasAll = EXPECTED_COLUMNS.every((c) => cells.indexOf(c) !== -1);
    if (hasAll && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      headerIdx = i;
      columns = cells;
      break;
    }
  }

  if (headerIdx === -1) {
    errors.push(
      'ledger table not found: expected a markdown table whose header contains ' +
      EXPECTED_COLUMNS.join(', ')
    );
    return { ok: false, rows: rows, errors: errors };
  }

  const colIndex = {};
  EXPECTED_COLUMNS.forEach((name) => { colIndex[name] = columns.indexOf(name); });

  const seenHeadings = new Set();
  const seenIds = new Set();

  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') break;
    if (line.indexOf('|') === -1) break;

    const cells = splitRow(line);
    const at = (name) => cell(cells[colIndex[name]]);

    const heading = at('Heading');
    const id = at('ID');
    const dispositionRaw = at('Disposition');

    if (!heading) {
      errors.push(`row ${i + 1}: empty Heading`);
      continue;
    }
    if (seenHeadings.has(heading)) {
      errors.push(`row ${i + 1}: duplicate Heading "${heading}"`);
      continue;
    }
    seenHeadings.add(heading);
    if (id) {
      if (seenIds.has(id)) errors.push(`row ${i + 1}: duplicate ID "${id}"`);
      seenIds.add(id);
    }

    const disposition = dispositionRaw ? dispositionRaw.toLowerCase() : null;
    if (!disposition || DISPOSITIONS.indexOf(disposition) === -1) {
      errors.push(
        `row ${i + 1} ("${heading}"): unknown Disposition "${dispositionRaw}" ` +
        `(expected one of ${DISPOSITIONS.join(', ')})`
      );
      continue;
    }

    const destFile = at('Dest File');
    const destAnchor = at('Dest Anchor');

    // A half-specified destination is worse than none: C1/C2 would each pass
    // vacuously on the missing half while the section is nonetheless gone.
    if ((destFile && !destAnchor) || (!destFile && destAnchor)) {
      errors.push(
        `row ${i + 1} ("${heading}"): Dest File and Dest Anchor must be specified together ` +
        `(got file=${destFile || 'none'} anchor=${destAnchor || 'none'})`
      );
      continue;
    }

    if (disposition === 'resident' && destFile) {
      errors.push(`row ${i + 1} ("${heading}"): a resident section must not declare a destination`);
      continue;
    }

    rows.push({
      section_id: id,
      heading: heading,
      disposition: disposition,
      dest_file: destFile,
      dest_anchor: destAnchor,
      resident_pointer: at('Resident Pointer'),
    });
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push('ledger table has no data rows');
  }

  return { ok: errors.length === 0, rows: rows, errors: errors };
}

module.exports = {
  parseLedger,
  extractHeadings,
  EXPECTED_COLUMNS,
  DISPOSITIONS,
};
