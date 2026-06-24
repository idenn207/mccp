'use strict';

const fs = require('fs');
const path = require('path');

const VALID_STATUSES = new Set(['pending', 'in-progress', 'complete']);

// 추출 경로의 markdown-link/inline-code/quote 래퍼 제거. 평문 Source PRD가
// 백틱·따옴표·대괄호로 감싸진 경우 해석 전에 벗긴다 (Codex F1 absorption).
function stripPathWrappers(s) {
  return String(s == null ? '' : s).trim().replace(/^[`'"<[]+|[`'">\]]+$/g, '').trim();
}

// source_prd ref를 plan-dir-relative(링크 형태) 또는 repo-root-relative(평문)
// 둘 다 시도해 실제로 읽히는 경로를 채택한다. 렌더러는 ref를 plan 디렉토리 기준
// 으로 resolve하므로 평문 `.claude/prds/...` 는 `.claude/plans/.claude/prds/...`
// 로 이중화돼 fail-open skip 됐다 — dual-candidate로 해소 (Codex F1 absorption).
function resolvePrdRef(ref, planAbs, cwd, fsRead) {
  const cleaned = stripPathWrappers(ref);
  if (!cleaned) return null;
  const candidates = path.isAbsolute(cleaned)
    ? [cleaned]
    : [path.resolve(path.dirname(planAbs), cleaned), path.resolve(cwd, cleaned)];
  for (const c of candidates) {
    try { return { path: c, body: fsRead(c) }; } catch (_) { /* try next candidate */ }
  }
  return null;
}

// Delivery Milestones 표의 Plan 셀에서 `.plan.md` 경로를 추출한다. `(report: …)`
// 같은 괄호 annotation을 잡지 않도록 markdown-link target → bare `.plan.md`
// 토큰 순으로 우선하고, 미발견 시 legacy 첫-괄호 폴백 (Codex F2 absorption).
function extractPlanPath(planCell) {
  const cell = String(planCell == null ? '' : planCell);
  const links = cell.match(/\[[^\]]*\]\(([^)]+)\)/g) || [];
  for (const lk of links) {
    const m = lk.match(/\]\(([^)]+)\)/);
    if (m && /\.plan\.md$/i.test(m[1].trim())) return stripPathWrappers(m[1]);
  }
  const bare = cell.match(/(?:^|[\s(`'"[])([^\s()`'"[\]]+\.plan\.md)\b/i);
  if (bare) return stripPathWrappers(bare[1]);
  const paren = cell.match(/\(([^)]+)\)/);
  return paren ? stripPathWrappers(paren[1]) : null;
}

function findSection(body, heading) {
  const startMatch = new RegExp('^' + heading + '\\s*$', 'm').exec(body);
  if (!startMatch) return null;
  const startIdx = startMatch.index + startMatch[0].length;
  const rest = body.slice(startIdx);
  const nextHeader = rest.match(/\n##\s/);
  return nextHeader ? rest.slice(0, nextHeader.index) : rest;
}

function parseTableRows(section) {
  if (!section) return [];
  const lines = section.split(/\r?\n/);
  const rows = [];
  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\|\s*-+/.test(trimmed)) { inTable = true; continue; }
    if (!inTable) continue;
    if (!trimmed.startsWith('|')) {
      if (trimmed === '') continue;
      break;
    }
    const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
    const cells = inner.split('|').map(c => c.trim());
    rows.push(cells);
  }
  return rows;
}

function parseDeliveryMilestones(prdBody) {
  const result = new Map();
  const section = findSection(prdBody, '## Delivery Milestones');
  if (!section) return result;
  const rows = parseTableRows(section);
  for (const cells of rows) {
    if (cells.length < 5) continue;
    const status = cells[3].toLowerCase();
    const planCell = cells[4];
    const linkMatch = planCell.match(/\(([^)]+)\)/);
    if (!linkMatch) continue;
    const linkPath = linkMatch[1].trim();
    if (!linkPath || linkPath === '—' || linkPath === '-') continue;
    const basename = linkPath.split(/[\\/]/).pop();
    if (basename && VALID_STATUSES.has(status)) {
      result.set(basename, status);
    }
  }
  return result;
}

function parseOpenQuestions(planBody) {
  if (!planBody) return [];
  const lines = planBody.split(/\r?\n/);
  const out = [];
  const headingStack = [];
  let inOQ = false;
  let oqHeadingLine = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    const h3 = /^###\s+(.+?)\s*$/.exec(line);
    if (h2) {
      headingStack.length = 0;
      headingStack.push('## ' + h2[1].trim());
      inOQ = /open\s+questions/i.test(h2[1]);
      if (inOQ) oqHeadingLine = i + 1;
      continue;
    }
    if (h3) {
      while (headingStack.length > 1) headingStack.pop();
      headingStack.push('### ' + h3[1].trim());
      continue;
    }
    if (!inOQ) continue;
    const m = line.match(/^\s*-\s+(?:\[[ xX]?\]\s+)?(.+?)\s*$/);
    if (m) {
      const text = m[1].trim();
      if (text) {
        out.push({
          text,
          lineNumber: i + 1,
          headingPath: headingStack.slice(),
          oqHeadingLineNumber: oqHeadingLine,
        });
      }
    }
  }
  return out;
}

function parseDeliveryMilestonesComplete(prdBody) {
  const out = [];
  const section = findSection(prdBody, '## Delivery Milestones');
  if (!section) return out;
  const rows = parseTableRows(section);
  for (const cells of rows) {
    if (cells.length < 5) continue;
    const status = cells[3].toLowerCase();
    if (status !== 'complete') continue;
    const name = (cells[1] || '').trim();
    const planCell = cells[4] || '';
    const planPath = extractPlanPath(planCell);
    const basename = planPath ? planPath.split(/[\\/]/).pop() : null;
    if (name) out.push({ name, planBasename: basename, planPath });
  }
  return out;
}

function parseRisks(planBody) {
  const section = findSection(planBody, '## Risks');
  if (!section) return { rows: [], malformedCount: 0 };
  const rows = parseTableRows(section);
  const out = [];
  let malformedCount = 0;
  for (const cells of rows) {
    if (cells.length === 4) {
      out.push({
        risk: cells[0],
        likelihood: cells[1],
        impact: cells[2],
        mitigation: cells[3],
      });
    } else if (cells.length === 3) {
      out.push({
        risk: cells[0],
        likelihood: cells[1],
        impact: '',
        mitigation: cells[2],
      });
    } else {
      malformedCount += 1;
    }
  }
  return { rows: out, malformedCount };
}

function sourcePrdPath(p) {
  if (!p || !p.source_prd) return null;
  if (typeof p.source_prd === 'string') return p.source_prd;
  if (typeof p.source_prd === 'object' && p.source_prd.path) return p.source_prd.path;
  return null;
}

function extractCyclePrefix(slug) {
  if (!slug || typeof slug !== 'string') return null;
  const m = slug.match(/^(v\d+-\d+-\d+)/);
  return m ? m[1] : null;
}

function computePlanStaleness(plan, model) {
  if (!plan || !plan.path) return 'unknown';
  const basename = path.basename(plan.path).replace(/\.plan\.md$/, '').replace(/\.md$/, '');
  const planCycle = extractCyclePrefix(basename);
  const fp = (model && model.sources && model.sources.state
            && model.sources.state.item && model.sources.state.item.frontmatter
            && model.sources.state.item.frontmatter.task_fingerprint) || null;
  if (!fp) return 'unknown';
  const fpCycle = extractCyclePrefix(fp);
  if (!planCycle || !fpCycle) return 'unknown';
  return planCycle === fpCycle ? 'fresh' : 'stale';
}

// v1.18.1 M3 — 마일스톤 드로어 요약(OPTIONAL). plan `## Summary` 섹션 첫 단락을
// read-side 추출(receipt 스키마 무확장 — chain-of-custody 무손상). 부재 시 null →
// 드로어 graceful degrade. 다음 `##` heading 또는 빈 줄 2개에서 단락 종료.
function extractPlanSummary(planBody) {
  const section = findSection(planBody, '## Summary');
  if (!section) return null;
  const lines = section.split(/\r?\n/);
  const para = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) { if (para.length) break; else continue; }
    if (/^#{1,6}\s/.test(t)) break;
    para.push(t);
  }
  const text = para.join(' ').trim();
  return text || null;
}

// Dashboard Truthfulness M1 Task 3 — ship-time snapshot of a plan's `## Risks`
// (Risk column) + `## Open Questions` (list-item text). The completion-ledger
// facade reads the plan body at gate-converge time and stores these as
// risks_closed[] / oq_closed[]; M3 will diff this snapshot against the live
// plan body to retire resolved rows. fail-open → { risks: [], openQuestions: [] }.
function extractRisksAndOpenQuestions(planBody) {
  const out = { risks: [], openQuestions: [] };
  if (!planBody || typeof planBody !== 'string') return out;
  try {
    const { rows } = parseRisks(planBody);
    out.risks = rows
      .map(function (r) { return (r.risk || '').trim(); })
      .filter(Boolean);
  } catch (_e) { out.risks = []; }
  try {
    out.openQuestions = parseOpenQuestions(planBody)
      .map(function (o) { return (o.text || '').trim(); })
      .filter(Boolean);
  } catch (_e) { out.openQuestions = []; }
  return out;
}

function parsePlanBody(model, opts) {
  opts = opts || {};
  const cwd = opts.cwd || process.cwd();
  const fsRead = opts.fsRead || ((p) => fs.readFileSync(p, 'utf8'));
  const m = model || {};
  const plansSrc = (m.sources && m.sources.plans) || {};
  const plans = plansSrc.items || [];

  const planStatuses = new Map();
  const planStaleness = new Map();
  const openQuestions = [];
  const risks = [];
  const warnings = [];
  let degraded = false;

  const prdBodies = new Map();
  for (const p of plans) {
    if (!p || !p.path) continue;
    const planAbs = path.isAbsolute(p.path) ? p.path : path.resolve(cwd, p.path);
    const prdRel = sourcePrdPath(p);
    if (!prdRel) continue;
    const resolved = resolvePrdRef(prdRel, planAbs, cwd, fsRead);
    if (!resolved) {
      degraded = true;
      warnings.push({ source: prdRel, message: 'PRD read failed (all candidates unreadable)' });
      continue;
    }
    if (!prdBodies.has(resolved.path)) prdBodies.set(resolved.path, resolved.body);
  }

  for (const [prdAbs, prdBody] of prdBodies) {
    const statusMap = parseDeliveryMilestones(prdBody);
    if (statusMap.size === 0) {
      degraded = true;
      warnings.push({ source: prdAbs, message: 'no Delivery Milestones table found' });
    }
    for (const [basename, status] of statusMap) {
      planStatuses.set(basename, status);
    }
  }

  for (const p of plans) {
    if (!p || !p.path) continue;
    const planAbs = path.isAbsolute(p.path) ? p.path : path.resolve(cwd, p.path);
    let planBody;
    try { planBody = fsRead(planAbs); }
    catch (err) {
      degraded = true;
      warnings.push({ source: planAbs, message: 'plan read failed: ' + err.message });
      continue;
    }
    const oq = parseOpenQuestions(planBody);
    oq.forEach((entry, idx) => {
      openQuestions.push({
        source: p.path,
        text: entry.text,
        lineNumber: entry.lineNumber,
        // v1.18.1 M3 — drawer 안정 키 fallback(lineNumber 부재 시). plan 내 등장 순.
        ordinal: idx,
        headingPath: entry.headingPath,
        oqHeadingLineNumber: entry.oqHeadingLineNumber,
      });
    });
    const { rows: riskRows, malformedCount } = parseRisks(planBody);
    // v1.18.1 M3 — risk 안정 키는 plan Risks 표 등장 순서(ordinal). 중복 위험
    // 텍스트에도 유일·안정(text-hash 폐기, Codex R1 F2). render-time 정렬과 무관한
    // parse-time 원본 순서를 박는다.
    riskRows.forEach((row, idx) => {
      risks.push(Object.assign({}, row, { source: p.path, ordinal: idx }));
    });
    if (malformedCount > 0) {
      warnings.push({
        source: planAbs,
        message: malformedCount + ' malformed Risks row(s) skipped',
      });
    }
  }

  for (const p of plans) {
    if (!p || !p.path) continue;
    const basename = path.basename(p.path);
    if (planStatuses.get(basename) !== 'in-progress') continue;
    planStaleness.set(basename, computePlanStaleness(p, model));
  }

  return { planStatuses, planStaleness, openQuestions, risks, warnings, degraded };
}

module.exports = {
  parsePlanBody,
  parseDeliveryMilestones,
  parseDeliveryMilestonesComplete,
  parseOpenQuestions,
  parseRisks,
  extractRisksAndOpenQuestions,
  extractPlanSummary,
  extractCyclePrefix,
  computePlanStaleness,
  resolvePrdRef,
  extractPlanPath,
  stripPathWrappers,
};
