'use strict';

const fs = require('fs');
const path = require('path');

const HEADER_RE = /^\|\s*Date\s*\|\s*Severity\s*\|\s*Source plan\s*\|\s*Finding\s*\|\s*$/;
const SEPARATOR_RE = /^\|\s*-+\s*\|/;

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
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (SEPARATOR_RE.test(line)) continue;
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split(/\s*\|\s*/);
    if (cells.length < 6) continue;
    cells.shift();
    cells.pop();
    if (cells.length < 4) continue;
    const [date, severity, sourcePlan, finding] = cells;
    if (!date || !date.trim()) continue;
    items.push({
      date: date.trim(),
      severity: severity.trim(),
      source_plan: sourcePlan.trim(),
      finding: finding.trim(),
    });
  }
  return { ok: true, count: items.length, items, invalid_count: 0, degraded: false, error: null };
}

module.exports = {
  scanBacklog,
};
