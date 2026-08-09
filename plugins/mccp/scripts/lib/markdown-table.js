'use strict';

// markdown-table — the NEUTRAL markdown table reader shared by the dashboard
// renderer and the intent gate.
//
// WHY THIS MODULE EXISTS (codex-intent-context M1, DD7 / Plan-Codex R2 F4).
//
// `renderer/parsers/plan-body.js` owned the only correct table reader in the
// repo. The intent gate needs the same reader to decide whether a plan's
// `## User Intent` section exists and which constraints get injected into the
// reviewer's focus — i.e. it is a LOAD-BEARING decision input, not cosmetics.
// Two bad options were rejected:
//
//   1. Re-implement locally with `split('|')`. That reintroduces a fixed
//      production bug: an escaped pipe (`a\|b`) inside a cell used to be split
//      as a column separator, shifting every downstream cell and SILENTLY
//      DROPPING rows (completed-plan lifecycle went undetected → wrong risk
//      aggregation). The `(?<!\\)\|` regex below is the fix; it must not be
//      forked.
//   2. Have the gate `require()` the renderer parser. That inverts the
//      dependency: dashboard-driven changes (blank-line handling, marker rows)
//      would silently move what the GATE considers a valid intent section.
//
// So the full contract lives here and BOTH callers import it.
//
// COMPLETE CONTRACT, NOT JUST A CELL SPLITTER (Implement-Codex R1 F4).
// `parseTableRows` is not a pure splitter: with `opts.withMeta` it strips a
// row's trailing resolution marker BEFORE splitting (otherwise the marker lands
// in the last cell as a phantom column) and returns `{cells, resolved, meta}`,
// a shape `parseRisks` depends on. Narrowing the extraction to
// `string[][]` would regress resolved risk rows. The whole contract moved.
//
// The marker stripper is INJECTED (`opts.stripLineMarker`) rather than
// required, so this module stays dependency-free and the gate can call it
// without dragging in renderer-side modules. The renderer injects its own
// `resolution-marker#stripLineMarker`, which makes the delegation
// behavior-identical.

// Default stripper: no marker vocabulary at all. Callers that do not inject one
// (the intent gate) get plain rows with inert metadata.
function noMarker(line) {
  return { line: line, resolved: false, meta: null };
}

// splitTableRow(line) → string[]
// Accepts a full row (leading/trailing pipes optional) and returns trimmed
// cells. Only UNESCAPED pipes separate cells; `\|` is a literal pipe inside a
// cell and is unescaped in the output.
function splitTableRow(line) {
  const trimmed = String(line == null ? '' : line).trim();
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return inner.split(/(?<!\\)\|/).map(function (c) {
    return c.replace(/\\\|/g, '|').trim();
  });
}

// isSeparatorRow(trimmedLine) → boolean
// The `|---|---|` alignment row. Its presence is what starts a table; the
// header row above it is intentionally NOT emitted.
function isSeparatorRow(trimmed) {
  return /^\|\s*-+/.test(trimmed);
}

// parseTableRows(section, opts) → string[][] | Array<{cells, resolved, meta}>
//
// Verbatim behavior of the renderer's original implementation:
//   - rows are emitted only AFTER a separator row is seen (header row skipped)
//   - blank lines inside the table are skipped, not terminators
//   - the first non-blank line that does not start with `|` terminates the table
//   - `opts.withMeta` strips the row marker before splitting and returns the
//     `{cells, resolved, meta}` shape
function parseTableRows(section, opts) {
  opts = opts || {};
  const withMeta = !!opts.withMeta;
  const stripLineMarker = opts.stripLineMarker || noMarker;
  if (!section) return [];
  const lines = String(section).split(/\r?\n/);
  const rows = [];
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const sm = withMeta ? stripLineMarker(rawLine) : null;
    const line = sm ? sm.line : rawLine;
    const trimmed = line.trim();
    if (isSeparatorRow(trimmed)) { inTable = true; continue; }
    if (!inTable) continue;
    if (!trimmed.startsWith('|')) {
      if (trimmed === '') continue;
      break;
    }
    const cells = splitTableRow(trimmed);
    if (withMeta) rows.push({ cells: cells, resolved: sm.resolved, meta: sm.meta });
    else rows.push(cells);
  }
  return rows;
}

module.exports = {
  splitTableRow: splitTableRow,
  isSeparatorRow: isSeparatorRow,
  parseTableRows: parseTableRows,
};
