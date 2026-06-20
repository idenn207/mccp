'use strict';

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

  const inProgressTone = inProgressCount > 0 ? 'accent' : 'idle';
  const blockedTone = blockedCount > 0 ? 'critical' : 'ok';
  const nextTone = nextStep === 'idle' ? 'idle' : 'accent';
  const risksTone = risksOpen >= 3 ? 'critical' : (risksOpen > 0 ? 'high' : 'ok');

  const cells = [
    { korean: '진행 중', icon: '◐', value: String(inProgressCount), tone: inProgressTone, valueKind: 'num' },
    { korean: '차단', icon: '🚫', value: String(blockedCount), tone: blockedTone, valueKind: 'num' },
    { korean: '다음', icon: '→', value: nextStep, tone: nextTone, valueKind: 'text' },
    { korean: 'risks open', icon: '⚠', value: String(risksOpen), tone: risksTone, valueKind: 'num' },
  ];

  const md = [
    '| ' + cells.map(c => c.icon + ' ' + c.korean).join(' | ') + ' |',
    '| ' + cells.map(() => '---').join(' | ') + ' |',
    '| ' + cells.map(c => c.value).join(' | ') + ' |',
  ].join('\n');

  const htmlCells = cells.map(c => {
    const valueClass = c.valueKind === 'text' ? 'grid-value text' : 'grid-value';
    return '<div class="grid-cell" data-tone="' + escapeHtml(c.tone) + '">'
      + '<div class="grid-label"><span class="icon">' + escapeHtml(c.icon) + '</span> '
      + escapeHtml(c.korean) + '</div>'
      + '<div class="' + valueClass + '">' + escapeHtml(c.value) + '</div></div>';
  }).join('');
  const html = '<div class="status-grid">' + htmlCells + '</div>';

  return { md, html };
}

module.exports = { renderStatusGrid };
