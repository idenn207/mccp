'use strict';

const fs = require('fs');
const path = require('path');

const PLAN_GLOB_SUFFIX = '.plan.md';

// 대시보드가 *표시*하는 plan 집합의 SSoT (repoRoot 상대, 둘 다 비재귀): 현재 작업
// plan(.claude/plans) + 레거시 top-level(.claude/PRPs/plans). completed/ 아카이브는
// 비표시라 여기 미포함. stale-audit/enumerate.js 가 이 목록을 import 해 re-enumerate
// 집합을 enumerate ⊇ derive 로 맞춘다(item-id 계약 — 표시돼 resolveId 가 붙은 항목은
// 서버가 항상 재현 가능해야 한다). 두 surface 의 dir-scan drift 를 막는 단일 출처.
const PLAN_DIRS = [
  path.join('.claude', 'plans'),
  path.join('.claude', 'PRPs', 'plans'),
];

const SOURCE_PRD_LINK_RE = /\*\*Source PRD\*\*:\s*\[([^\]]+)\]\(([^)]+)\)/;
// 평문 형태 `**Source PRD**: .claude/prds/x.prd.md` (마크다운 링크 없이). 링크
// 매칭 실패 시에만 사용 — 평문 path/백틱 path 모두 discovery 되도록 (Codex F1).
const SOURCE_PRD_PLAIN_RE = /\*\*Source PRD\*\*:[ \t]*(.+?\.prd\.md)[ \t\x60'"\]>)]*$/m;
const MILESTONE_RE = /\*\*Selected Milestone\*\*:\s*(.+)$/m;
const COMPLEXITY_RE = /\*\*Complexity\*\*:\s*([A-Za-z][\w-]*)/;
const ACCEPTANCE_RE = /^##\s+Acceptance\s*$/m;

function stripWrap(s) {
  return String(s == null ? '' : s).trim().replace(/^[`'"<[]+|[`'">\]]+$/g, '').trim();
}

// Source PRD를 링크 형태 우선, 없으면 평문 형태로 추출. 평문일 땐 label=path.
// 둘 다 미발견 시 null. (Codex F1 — 평문/백틱 path discovery 복원)
function extractSourcePrd(raw) {
  const link = raw.match(SOURCE_PRD_LINK_RE);
  if (link) return { label: link[1].trim(), path: stripWrap(link[2]) };
  const plain = raw.match(SOURCE_PRD_PLAIN_RE);
  if (plain) {
    const p = stripWrap(plain[1]);
    return p ? { label: p, path: p } : null;
  }
  return null;
}

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
  const sourcePrd = extractSourcePrd(raw);
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
    source_prd: sourcePrd,
    milestone: milestoneMatch ? milestoneMatch[1].trim() : null,
    complexity: complexityMatch ? complexityMatch[1] : null,
    acceptance,
  };
}

function scanPlans(repoRoot, opts) {
  opts = opts || {};
  const maxBytes = typeof opts.maxPlanScanBytes === 'number' ? opts.maxPlanScanBytes : 256 * 1024;
  const files = PLAN_DIRS.reduce(
    (acc, rel) => acc.concat(listPlansInDir(path.join(repoRoot, rel))), []);
  const items = files.map(f => extractFields(f, repoRoot, maxBytes));
  return { ok: true, count: items.length, items, invalid_count: 0, degraded: false, error: null };
}

module.exports = {
  scanPlans,
  PLAN_DIRS,
};
