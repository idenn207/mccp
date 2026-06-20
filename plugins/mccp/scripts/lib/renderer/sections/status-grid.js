'use strict';

const path = require('path');

function formatPlanLabel(basename) {
  if (!basename || typeof basename !== 'string') return '(unknown)';
  const slug = basename.replace(/\.plan\.md$/, '').replace(/\.md$/, '');
  const m = slug.match(/^(v\d+)-(\d+)-(\d+)-(.+)$/);
  let label;
  if (m) {
    const cycle = m[1] + '.' + m[2] + '.' + m[3];
    const rest = m[4].replace(/-/g, ' ');
    label = cycle + ' · ' + rest;
  } else {
    label = slug;
  }
  return label.length > 30 ? label.slice(0, 29) + '…' : label;
}

function renderStatusGrid(model, formatUtils, planBody) {
  const { escapeHtml } = formatUtils;
  const m = model || {};
  const sources = m.sources || {};
  const pb = planBody || {};
  const planStatuses = pb.planStatuses instanceof Map ? pb.planStatuses : new Map();
  const staleness = pb.planStaleness instanceof Map ? pb.planStaleness : new Map();

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

  let nextStep = '대기';
  let nextStale = false;
  const stateItem = sources.state && sources.state.item;
  if (stateItem && stateItem.resume_state === 'in-flight') {
    nextStep = '/mccp:resume';
  } else {
    const firstInProgress = plansItems.find(p => {
      if (!p || !p.path) return false;
      return planStatuses.get(path.basename(p.path)) === 'in-progress';
    });
    if (firstInProgress) {
      const basename = path.basename(firstInProgress.path);
      const st = staleness.get(basename);
      if (st === 'stale') {
        nextStep = '미정 (stale)';
        nextStale = true;
      } else {
        nextStep = formatPlanLabel(basename);
      }
    }
  }

  const backlogItems = (sources.backlog && sources.backlog.items) || [];
  const risksOpen = backlogItems.filter(b => {
    if (!b) return false;
    const s = (b.severity || '').toUpperCase();
    return s === 'HIGH' || s === 'CRITICAL';
  }).length;

  const cells = [
    { key: 'in-progress', label: '진행 중', icon: '◐', value: String(inProgressCount), kind: 'count' },
    { key: 'blocked', label: '차단', icon: '🚫', value: String(blockedCount), kind: 'count', accent: 'blocked' },
    { key: 'next', label: '다음', icon: '→', value: nextStep, kind: 'next', stale: nextStale },
    { key: 'risks', label: '미해결 위험', icon: '⚠', value: String(risksOpen), kind: 'count' },
  ];

  const md = cells.map(c => {
    if (c.kind === 'next') {
      return c.icon + ' ' + c.label + ' ' + c.value;
    }
    return c.icon + ' ' + c.label + ' ' + c.value;
  }).join(' · ');

  const htmlCells = cells.map(c => {
    let valueHtml;
    if (c.kind === 'next') {
      valueHtml = c.stale
        ? '<span class="stale-label">' + escapeHtml(c.value) + '</span>'
        : '<code>' + escapeHtml(c.value) + '</code>';
    } else {
      valueHtml = '<div class="grid-value">' + escapeHtml(c.value) + '</div>';
    }
    return '<div class="grid-cell"><div class="grid-label">'
      + escapeHtml(c.icon) + ' ' + escapeHtml(c.label)
      + '</div>' + valueHtml + '</div>';
  }).join('');
  const html = '<div class="status-grid">' + htmlCells + '</div>';

  return { md, html, cells };
}

module.exports = { renderStatusGrid, formatPlanLabel };
