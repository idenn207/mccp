'use strict';

// v1.3.0-m3-redux — status row is now ONE inline sentence, not a 4-card grid.
// Anti-ref 1 (SaaS hero-metric) + absolute-ban (identical card grids) compliance.
// Returns { md, html } where html is a <p class="status-line"> single line.

const path = require('path');

function renderStatusGrid(model, formatUtils, planBody) {
  const { escapeHtml } = formatUtils;
  const m = model || {};
  const sources = m.sources || {};
  const pb = planBody || {};
  const planStatuses = pb.planStatuses instanceof Map ? pb.planStatuses : new Map();

  const plansItems = (sources.plans && sources.plans.items) || [];
  const inProgressCount = plansItems.filter(p => {
    if (!p || !p.path) return false;
    return planStatuses.get(path.basename(p.path)) === 'in-progress';
  }).length;

  const receiptItems = (sources.receipts && sources.receipts.items) || [];
  const blockedReceipts = receiptItems.filter(r => r && r.converged === false);
  const decisionsWithLaterConverged = new Set();
  for (const r of receiptItems) {
    if (r && r.converged === true && r.decision_id) {
      decisionsWithLaterConverged.add(r.decision_id);
    }
  }
  const blockedCount = blockedReceipts.filter(r => !decisionsWithLaterConverged.has(r.decision_id)).length;

  let nextStep = 'idle';
  const stateItem = sources.state && sources.state.item;
  if (stateItem && stateItem.resume_state === 'in-flight') {
    nextStep = '/mccp:resume';
  } else {
    const firstInProgress = plansItems.find(p => {
      if (!p || !p.path) return false;
      return planStatuses.get(path.basename(p.path)) === 'in-progress';
    });
    if (firstInProgress) {
      nextStep = path.basename(firstInProgress.path).replace(/\.plan\.md$/, '').replace(/\.md$/, '');
    }
  }

  const backlogItems = (sources.backlog && sources.backlog.items) || [];
  const risksOpen = backlogItems.filter(b => {
    if (!b) return false;
    const s = (b.severity || '').toUpperCase();
    return s === 'HIGH' || s === 'CRITICAL';
  }).length;

  // Markdown stays as a small table for STATUS.md text-fallback readers.
  const md = [
    '| 진행 중 | 차단 | 다음 | risks open |',
    '|---|---|---|---|',
    '| ' + inProgressCount + ' | ' + blockedCount + ' | ' + nextStep + ' | ' + risksOpen + ' |',
  ].join('\n');

  // HTML is a single inline sentence. Severity is expressed by word color
  // class (x-red / x-ok) on the count value, never as a background or pill.
  const blockedHtml = blockedCount > 0
    ? '<span class="x-red"><b>' + blockedCount + '</b></span>'
    : '<b>0</b>';
  const risksHtml = risksOpen >= 3
    ? '<span class="x-red"><b>' + risksOpen + '</b></span>'
    : (risksOpen > 0 ? '<b>' + risksOpen + '</b>' : '<b>0</b>');
  const nextHtml = nextStep === 'idle'
    ? '<span class="muted">없음</span>'
    : '<code>' + escapeHtml(nextStep) + '</code>';

  const html = '<p class="status-line">'
    + '진행 중 <b>' + inProgressCount + '</b>, '
    + '차단 ' + blockedHtml + ', '
    + '다음 ' + nextHtml + ', '
    + 'risks open ' + risksHtml
    + '</p>';

  return { md, html };
}

module.exports = { renderStatusGrid };
