'use strict';

const path = require('path');
const { extractIntentFromPath } = require('../parsers/intent-extractor');
const { deriveDecisionState } = require('../parsers/decision-state');
const { resolveNextAction } = require('../parsers/next-action');

// Dashboard Truthfulness M2 — named-widget item cap. Top-N expanded + overflow
// count (collapsed in the hero/STATUS.md). Mirrors milestone-history MAX_EXPANDED
// + Output Constraint "한 화면 항목 상한".
const TOP_N = 3;

// host_version.source → 한국어 라벨. provenance 를 항상 노출(F3) — meta 가
// CHANGELOG 와 불일치해도 어느 신호가 채택됐는지 사용자가 검증 가능.
function sourceLabel(source) {
  switch (source) {
    case 'changelog': return 'CHANGELOG';
    case 'git-tag': return 'git 태그';
    case 'plan-cycle': return '최신 plan cycle';
    case 'unknown': return '미상';
    default:
      if (typeof source === 'string' && source.indexOf('meta:') === 0) return source.slice(5);
      return source || '미상';
  }
}

function projectNameOf(m) {
  const root = m && m.repo_root;
  if (typeof root === 'string' && root && root !== '<repo>') {
    const base = root.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
    if (base) return base;
  }
  return 'mccp';
}

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

// named-widget plain-text 동등본 — top-N 인라인 + 나머지 <details> 접힘(md).
// 항목 텍스트는 renderProseMd(em-dash → comma) 경유로 H10 안전. headCount 는
// 카운트 셀 값(미해결 위험처럼 finding 텍스트가 빈 행은 items 에서 빠지지만 count
// 는 유지)을 우선 사용.
function widgetMd(label, items, formatUtils, headCount) {
  const list = Array.isArray(items) ? items : [];
  const count = typeof headCount === 'number' ? headCount : list.length;
  const head = label + ' (' + count + ')';
  if (list.length === 0) return head + ': 없음';
  const renderMd = (formatUtils && formatUtils.renderProseMd) || ((s) => String(s == null ? '' : s));
  const shown = list.slice(0, TOP_N).map(renderMd).join(' · ');
  let s = head + ': ' + shown;
  const overflow = list.length - TOP_N;
  if (overflow > 0) {
    const rest = list.slice(TOP_N).map((t) => '- ' + renderMd(t)).join('\n');
    s += '\n\n<details>\n<summary>+' + overflow + ' 더보기</summary>\n\n' + rest + '\n\n</details>';
  }
  return s;
}

function nextActionMd(na) {
  if (!na || na.source === 'idle') return '다음: 대기';
  if (na.executable && na.copyText) return '다음: `' + na.copyText + '`';
  if (na.stale) return '다음: ' + (na.prose || '미정 (stale)');
  return '다음: ' + (na.prose || '대기');
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
  // M2 — named items (카운트가 아닌 '무엇'). 진행중 = in-progress plan 라벨.
  // M5 Task 1 — 신선도 가드: 진행중 카운트는 fresh 만. stale(마지막 활동 > 임계,
  // plan-body.js 판정)은 카운트에서 제외하고 별도 muted 로 표기 — '진행중=실제'.
  const inProgressPlans = plansItems
    .filter(p => p && p.path && planStatuses.get(path.basename(p.path)) === 'in-progress');
  const inProgressItems = inProgressPlans
    .filter(p => staleness.get(path.basename(p.path)) !== 'stale')
    .map(p => formatPlanLabel(path.basename(p.path)));
  const staleInProgressItems = inProgressPlans
    .filter(p => staleness.get(path.basename(p.path)) === 'stale')
    .map(p => formatPlanLabel(path.basename(p.path)));
  const inProgressCount = inProgressItems.length;

  // v1.18.0 M2 (H1 fix) — blocked 카운트는 공유 SSoT deriveDecisionState 로 일원화.
  // 폐기된 `converged===false` per-receipt 휴리스틱은 첫 라운드 in-progress 를
  // divergent 차단과 혼동해 hero/pin-alert("차단 N건")가 pipeline("차단 0")과 모순됐다.
  // decision-level state==='blocked'(round≥2 미수렴 + 시간순 supersede 가드)만 집계 →
  // pipeline·timeline 과 동일 판정 보장. (decision-state.js §8-16)
  const receiptItems = (sources.receipts && sources.receipts.items) || [];
  const stateMap = deriveDecisionState(receiptItems);
  // M2 — 차단 = blocked decision_id 들이 곧 '무엇'(decision-state SSoT).
  const blockedItems = [];
  for (const [id, d] of stateMap.entries()) {
    if (d.state === 'blocked') blockedItems.push(id);
  }
  const blockedCount = blockedItems.length;

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
  // count cell 값은 카운트 소스(HIGH/CRITICAL 행 수) 유지 — finding 텍스트가 빈 행도
  // 집계(기존 의미 불변). named items 는 그 중 finding 텍스트 있는 것만(top-N 표시).
  const highCritical = backlogItems.filter(b => {
    if (!b) return false;
    const s = (b.severity || '').toUpperCase();
    return s === 'HIGH' || s === 'CRITICAL';
  });
  const risksOpen = highCritical.length;
  const riskItems = highCritical.map(b => (b.finding || '').trim()).filter(Boolean);

  const cells = [
    { key: 'in-progress', label: '진행 중', icon: '◐', value: String(inProgressCount), kind: 'count', items: inProgressItems, staleItems: staleInProgressItems },
    { key: 'blocked', label: '차단', icon: '🚫', value: String(blockedCount), kind: 'count', accent: 'blocked', items: blockedItems },
    { key: 'next', label: '다음', icon: '→', value: nextStep, kind: 'next', stale: nextStale, intent: nextIntent },
    { key: 'risks', label: '미해결 위험', icon: '⚠', value: String(risksOpen), kind: 'count', items: riskItems },
  ];

  // M2 — host-version snapshot 소비(파일 읽기 없음, F2) + STATE.md next-action 추출(F1).
  const version = (m.host_version && typeof m.host_version === 'object')
    ? m.host_version
    : { version: null, source: 'unknown', latest_plan: null, degraded: false, error: null };
  let nextAction;
  try {
    nextAction = resolveNextAction(stateItem, {
      plans: plansItems, planStatuses, planStaleness: staleness,
    });
  } catch (_) {
    nextAction = { command: null, args: '', prose: '대기', copyText: null, source: 'idle', executable: false, stale: false };
  }

  const summaryLine = cells.map(c => c.icon + ' ' + c.label + ' ' + c.value).join(' · ');
  const projectName = projectNameOf(m);
  const versionMd = version.version
    ? '버전: ' + projectName + ' · v' + version.version + ' · ' + sourceLabel(version.source)
    : '버전: ' + projectName + ' · 미상';
  // M5 Task 1 — stale in-progress 는 카운트 밖 muted 한 줄(있을 때만).
  const staleNoteMd = staleInProgressItems.length
    ? '\n오래된 진행중 (' + staleInProgressItems.length + '): '
      + staleInProgressItems.slice(0, TOP_N).map(s => (formatUtils.renderProseMd || ((x) => x))(s)).join(' · ')
    : '';
  const widgetsMd = [
    widgetMd('진행 중', inProgressItems, formatUtils) + staleNoteMd,
    widgetMd('차단', blockedItems, formatUtils),
    widgetMd('미해결 위험', riskItems, formatUtils, risksOpen),
  ].join('\n');
  const md = [summaryLine, '', versionMd, '', widgetsMd, '', nextActionMd(nextAction)].join('\n');

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

  // md/html/cells 키 불변(기존 소비자 호환) + version/nextAction 추가(F1/F2 소비처).
  return { md, html, cells, version, nextAction };
}

module.exports = { renderStatusGrid, formatPlanLabel };
