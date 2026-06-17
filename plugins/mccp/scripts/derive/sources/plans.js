'use strict';

const fs = require('fs');
const path = require('path');

const PLAN_GLOB_SUFFIX = '.plan.md';

const SOURCE_PRD_RE = /\*\*Source PRD\*\*:\s*\[([^\]]+)\]\(([^)]+)\)/;
const MILESTONE_RE = /\*\*Selected Milestone\*\*:\s*(.+)$/m;
const COMPLEXITY_RE = /\*\*Complexity\*\*:\s*([A-Za-z][\w-]*)/;
const ACCEPTANCE_RE = /^##\s+Acceptance\s*$/m;

function isPlainDir(dir) {
  let lst;
  try { lst = fs.lstatSync(dir); } catch { return false; }
  if (lst.isSymbolicLink()) return false;
  return lst.isDirectory();
}

function isPlainFile(filePath) {
  let lst;
  try { lst = fs.lstatSync(filePath); } catch { return false; }
  if (lst.isSymbolicLink()) return false;
  return lst.isFile();
}

function listPlansInDir(dir) {
  if (!fs.existsSync(dir) || !isPlainDir(dir)) return [];
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const f of entries) {
    if (!f.endsWith(PLAN_GLOB_SUFFIX)) continue;
    const full = path.join(dir, f);
    if (!isPlainFile(full)) continue;
    out.push(full);
  }
  return out;
}

function extractFields(filePath, repoRoot, maxBytes) {
  let raw;
  try {
    const stat = fs.statSync(filePath);
    if (typeof maxBytes === 'number' && maxBytes > 0 && stat.size > maxBytes) {
      return { slug: path.basename(filePath, PLAN_GLOB_SUFFIX),
        path: path.relative(repoRoot, filePath),
        error: 'plan file > ' + maxBytes + ' bytes; skipped (perf guard)' };
    }
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { slug: path.basename(filePath, PLAN_GLOB_SUFFIX),
      path: path.relative(repoRoot, filePath),
      error: err.message };
  }
  const slug = path.basename(filePath, PLAN_GLOB_SUFFIX);
  const sourceMatch = raw.match(SOURCE_PRD_RE);
  const milestoneMatch = raw.match(MILESTONE_RE);
  const complexityMatch = raw.match(COMPLEXITY_RE);

  let acceptance = { total: 0, checked: 0 };
  const accIdx = raw.search(ACCEPTANCE_RE);
  if (accIdx !== -1) {
    const tail = raw.slice(accIdx);
    const nextHdr = tail.slice(2).search(/^##\s+/m);
    const accBody = nextHdr === -1 ? tail : tail.slice(0, 2 + nextHdr);
    const uncheckedHits = accBody.match(/^-\s*\[ \]/gm) || [];
    const checkedHits = accBody.match(/^-\s*\[x\]/gmi) || [];
    acceptance = {
      total: uncheckedHits.length + checkedHits.length,
      checked: checkedHits.length,
    };
  }

  return {
    slug,
    path: path.relative(repoRoot, filePath),
    source_prd: sourceMatch
      ? { label: sourceMatch[1], path: sourceMatch[2] }
      : null,
    milestone: milestoneMatch ? milestoneMatch[1].trim() : null,
    complexity: complexityMatch ? complexityMatch[1] : null,
    acceptance,
  };
}

function scanPlans(repoRoot, opts) {
  opts = opts || {};
  const maxBytes = typeof opts.maxPlanScanBytes === 'number' ? opts.maxPlanScanBytes : 256 * 1024;
  const primary = path.join(repoRoot, '.claude', 'plans');
  const legacy = path.join(repoRoot, '.claude', 'PRPs', 'plans');
  const files = listPlansInDir(primary).concat(listPlansInDir(legacy));
  const items = files.map(f => extractFields(f, repoRoot, maxBytes));
  return { ok: true, count: items.length, items, invalid_count: 0, degraded: false, error: null };
}

module.exports = {
  scanPlans,
};
