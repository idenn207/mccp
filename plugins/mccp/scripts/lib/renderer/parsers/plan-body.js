'use strict';

const fs = require('fs');
const path = require('path');

const VALID_STATUSES = new Set(['pending', 'in-progress', 'complete']);

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
  const section = findSection(planBody, '## Open Questions');
  if (!section) return [];
  const lines = section.split(/\r?\n/);
  const questions = [];
  for (const line of lines) {
    const m = line.match(/^\s*-\s+(?:\[[ xX]?\]\s+)?(.+?)\s*$/);
    if (m) {
      const text = m[1].trim();
      if (text) questions.push(text);
    }
  }
  return questions;
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

  const prdSources = new Map();
  for (const p of plans) {
    if (!p || !p.path) continue;
    const planAbs = path.isAbsolute(p.path) ? p.path : path.resolve(cwd, p.path);
    const prdRel = sourcePrdPath(p);
    if (prdRel) {
      const prdAbs = path.isAbsolute(prdRel) ? prdRel : path.resolve(path.dirname(planAbs), prdRel);
      if (!prdSources.has(prdAbs)) prdSources.set(prdAbs, true);
    }
  }

  for (const prdAbs of prdSources.keys()) {
    let prdBody;
    try { prdBody = fsRead(prdAbs); }
    catch (err) {
      degraded = true;
      warnings.push({ source: prdAbs, message: 'PRD read failed: ' + err.message });
      continue;
    }
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
    for (const text of oq) {
      openQuestions.push({ source: p.path, text });
    }
    const { rows: riskRows, malformedCount } = parseRisks(planBody);
    for (const row of riskRows) {
      risks.push(Object.assign({}, row, { source: p.path }));
    }
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
  parseOpenQuestions,
  parseRisks,
  extractCyclePrefix,
  computePlanStaleness,
};
