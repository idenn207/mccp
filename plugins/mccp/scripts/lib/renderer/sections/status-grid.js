'use strict';

const path = require('path');
const { extractIntentFromPath } = require('../parsers/intent-extractor');
const { deriveDecisionState } = require('../parsers/decision-state');

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

function renderStatusGrid(model, formatUtils, planBody, opts) {
  opts = opts || {};
  const { escapeHtml, escapeAttr } = formatUtils;
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

  // v1.18.0 M2 (H1 fix) — blocked 카운트는 공유 SSoT deriveDecisionState 로 일원화.
  // 폐기된 `converged===false` per-receipt 휴리스틱은 첫 라운드 in-progress 를
  // divergent 차단과 혼동해 hero/pin-alert("차단 N건")가 pipeline("차단 0")과 모순됐다.
  // decision-level state==='blocked'(round≥2 미수렴 + 시간순 supersede 가드)만 집계 →
  // pipeline·timeline 과 동일 판정 보장. (decision-state.js §8-16)
  const receiptItems = (sources.receipts && sources.receipts.items) || [];
  const stateMap = deriveDecisionState(receiptItems);
  let blockedCount = 0;
  for (const d of stateMap.values()) {
    if (d.state === 'blocked') blockedCount += 1;
  }

  let nextStep = '대기';
  let nextStale = false;
  let nextIntent = null;
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
        // M2 — intent tooltip. fail-open.
        try {
          const cwd = opts.cwd
            || (m.repo_root && typeof m.repo_root === 'string' && m.repo_root !== '<repo>'
              ? m.repo_root : process.cwd());
          const planAbs = path.isAbsolute(firstInProgress.path)
            ? firstInProgress.path
            : path.resolve(cwd, firstInProgress.path);
          nextIntent = extractIntentFromPath(planAbs, opts);
        } catch (_) { nextIntent = null; }
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
    { key: 'next', label: '다음', icon: '→', value: nextStep, kind: 'next', stale: nextStale, intent: nextIntent },
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
      if (c.stale) {
        valueHtml = '<span class="stale-label">' + escapeHtml(c.value) + '</span>';
      } else {
        const titleAttr = c.intent
          ? ' title="' + escapeAttr(c.intent) + '"'
          : '';
        valueHtml = '<code' + titleAttr + '>' + escapeHtml(c.value) + '</code>';
      }
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
