'use strict';

const fs = require('fs');
const path = require('path');
const { parseDeliveryMilestonesComplete } = require('../parsers/plan-body');

const MAX_EXPANDED = 5;

function findPrdSourcesFromPlans(plans, cwd) {
  const set = new Map();
  for (const p of plans) {
    if (!p) continue;
    let ref = null;
    if (typeof p.source_prd === 'string') ref = p.source_prd;
    else if (p.source_prd && typeof p.source_prd === 'object' && p.source_prd.path) ref = p.source_prd.path;
    if (!ref) continue;
    if (!p.path) continue;
    const planAbs = path.isAbsolute(p.path) ? p.path : path.resolve(cwd, p.path);
    const prdAbs = path.isAbsolute(ref) ? ref : path.resolve(path.dirname(planAbs), ref);
    if (!set.has(prdAbs)) set.set(prdAbs, true);
  }
  return Array.from(set.keys());
}

function pickShipReceipt(receipts, planBasename) {
  if (!planBasename) return null;
  const slug = planBasename.replace(/\.plan\.md$/, '').replace(/\.md$/, '');
  let best = null;
  for (const r of receipts) {
    if (!r) continue;
    // F2 absorption — derive normalize 출력은 `gate`. 원본은 `gate_id`. 양쪽 호환.
    const gate = r.gate_id || r.gate;
    if (gate !== 'mccp-pr-codex') continue;
    const dec = r.decision_id || '';
    if (!dec) continue;
    const slugCycle = (slug.match(/^(v\d+-\d+-\d+)/) || [])[0] || null;
    const decCycle = (dec.match(/^(v\d+-\d+-\d+)/) || [])[0] || null;
    const ok = dec.indexOf(slug) >= 0
      || slug.indexOf(dec) >= 0
      || (slugCycle && decCycle && slugCycle === decCycle);
    if (!ok) continue;
    if (!r.created_at) continue;
    if (!best || new Date(r.created_at).getTime() > new Date(best.created_at).getTime()) {
      best = r;
    }
  }
  return best;
}

function renderMilestoneHistory(model, formatUtils, planBody, opts) {
  opts = opts || {};
  const { escapeHtml, formatRelativeTime } = formatUtils;
  const m = model || {};
  const cwd = opts.cwd
    || (m.repo_root && typeof m.repo_root === 'string' && m.repo_root !== '<repo>'
      ? m.repo_root : process.cwd());
  const fsRead = opts.fsRead || ((p) => fs.readFileSync(p, 'utf8'));
  const plans = (m.sources && m.sources.plans && m.sources.plans.items) || [];
  const receipts = (m.sources && m.sources.receipts && m.sources.receipts.items) || [];

  const prdPaths = findPrdSourcesFromPlans(plans, cwd);
  const all = [];
  for (const prdAbs of prdPaths) {
    let body;
    try { body = fsRead(prdAbs); } catch (_) { continue; }
    const completeRows = parseDeliveryMilestonesComplete(body);
    for (const row of completeRows) {
      const ship = pickShipReceipt(receipts, row.planBasename);
      all.push({
        name: row.name,
        planBasename: row.planBasename,
        completedAt: ship && ship.created_at ? ship.created_at : null,
      });
    }
  }

  // dedup by planBasename (한 plan이 multiple PRD 등장 시 최신)
  const seen = new Map();
  for (const e of all) {
    const key = e.planBasename || e.name;
    const prev = seen.get(key);
    if (!prev) { seen.set(key, e); continue; }
    const a = e.completedAt ? new Date(e.completedAt).getTime() : 0;
    const b = prev.completedAt ? new Date(prev.completedAt).getTime() : 0;
    if (a > b) seen.set(key, e);
  }
  const merged = Array.from(seen.values()).sort((a, b) => {
    const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return tb - ta;
  });

  if (merged.length === 0) return null;
  const expanded = merged.slice(0, MAX_EXPANDED);
  const collapsed = merged.slice(MAX_EXPANDED);
  const now = Date.now();

  function renderItem(e) {
    const rel = e.completedAt && typeof formatRelativeTime === 'function'
      ? formatRelativeTime(e.completedAt, now)
      : (e.completedAt || '날짜 미상');
    const planChip = e.planBasename
      ? '<code>' + escapeHtml(e.planBasename) + '</code>'
      : '';
    const html = '<li class="milestone-item">'
      + '<span class="ms-name">' + escapeHtml(e.name) + '</span>'
      + ' <span class="muted">· ' + escapeHtml(rel) + '</span>'
      + (planChip ? ' ' + planChip : '')
      + '</li>';
    const md = '- ' + e.name + ' · ' + rel
      + (e.planBasename ? ' (' + e.planBasename + ')' : '');
    return { html, md };
  }

  const expR = expanded.map(renderItem);
  const colR = collapsed.map(renderItem);

  let html = '<ul class="milestone-history" role="list">' + expR.map(r => r.html).join('') + '</ul>';
  if (collapsed.length > 0) {
    html += '<details class="ms-more"><summary>+' + collapsed.length + ' 더보기</summary>'
      + '<ul role="list">' + colR.map(r => r.html).join('') + '</ul></details>';
  }
  let md = expR.map(r => r.md).join('\n');
  if (collapsed.length > 0) {
    md += '\n\n<details>\n<summary>+' + collapsed.length + ' 더보기</summary>\n\n'
      + colR.map(r => r.md).join('\n')
      + '\n\n</details>';
  }
  return { md, html };
}

module.exports = { renderMilestoneHistory };
