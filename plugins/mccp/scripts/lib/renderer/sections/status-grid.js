'use strict';

const path = require('path');
const { extractIntentFromPath } = require('../parsers/intent-extractor');
const { deriveDecisionState } = require('../parsers/decision-state');
const { planHashesFromModel } = require('../parsers/plan-hashes');
const { resolveNextAction } = require('../parsers/next-action');
const { stripMarker } = require('../parsers/resolution-marker');
const { maxRank } = require('../parsers/action-prompt');

// M5 Task 2 — 위험 severity rank(risks.js RANK_MAP 미러). hero 위젯 top-N 을 위험
// 섹션과 같은 순서(severity 내림차순)로 보여 rail↔섹션 표시 일관.
const RISK_RANK_MAP = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, '': 0 };
function riskSevRank(r) {
  const sev = String(maxRank(r && r.impact, r && r.likelihood) || '').toUpperCase();
  return RISK_RANK_MAP[sev] || 0;
}

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

// M6 Task 4 — generalized: optional maxLen + 비-v-prefix humanize(하이픈→공백).
// v-prefix는 'v1.4.2 · rest'로, 비-v-prefix slug도 readable 라벨로 일반화해
// Hero h1(verdict.js)이 마일스톤명을 그대로 primary로 쓸 수 있게 한다.
function formatPlanLabel(basename, opts) {
  opts = opts || {};
  const maxLen = typeof opts.maxLen === 'number' ? opts.maxLen : 30;
  if (!basename || typeof basename !== 'string') return '(unknown)';
  const slug = basename.replace(/\.plan\.md$/, '').replace(/\.md$/, '');
  const m = slug.match(/^(v\d+)-(\d+)-(\d+)-(.+)$/);
  let label;
  if (m) {
    const cycle = m[1] + '.' + m[2] + '.' + m[3];
    const rest = m[4].replace(/-/g, ' ');
    label = cycle + ' · ' + rest;
  } else {
    label = slug.replace(/-/g, ' ');
  }
  return label.length > maxLen ? label.slice(0, maxLen - 1) + '…' : label;
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

// M6 Task 5 — next-action 설명("무엇을 하는지") md 동등. prose 와 중복일 땐 생략.
function nextActionMd(na) {
  if (!na || na.source === 'idle') return '다음: 대기';
  let line;
  if (na.executable && na.copyText) line = '다음: `' + na.copyText + '`';
  else if (na.stale) line = '다음: ' + (na.prose || '미정 (stale)');
  else line = '다음: ' + (na.prose || '대기');
  const desc = na.description;
  if (desc && desc !== na.prose) line += '\n  · ' + desc;
  return line;
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
    .map(p => formatPlanLabel(path.basename(p.path), { maxLen: 56 }));
  const staleInProgressItems = inProgressPlans
    .filter(p => staleness.get(path.basename(p.path)) === 'stale')
    .map(p => formatPlanLabel(path.basename(p.path), { maxLen: 56 }));
  const inProgressCount = inProgressItems.length;

  // v1.18.0 M2 (H1 fix) — blocked 카운트는 공유 SSoT deriveDecisionState 로 일원화.
  // 폐기된 `converged===false` per-receipt 휴리스틱은 첫 라운드 in-progress 를
  // divergent 차단과 혼동해 hero/pin-alert("차단 N건")가 pipeline("차단 0")과 모순됐다.
  // decision-level state==='blocked'(round≥2 미수렴 + 시간순 supersede 가드)만 집계 →
  // pipeline·timeline 과 동일 판정 보장. (decision-state.js §8-16)
  const receiptItems = (sources.receipts && sources.receipts.items) || [];
  // M7 Task 4 — ledger-aware decision-state (shared with the next-action
  // frontier derive below). A fresh-matched completion-ledger entry promotes a
  // converged-frontier decision to done so the frontier reads truthfully (Codex F2).
  const ledgerItems = (sources.ledger && sources.ledger.items) || [];
  const planHashes = planHashesFromModel(m, { cwd: opts.cwd });
  const stateMap = deriveDecisionState(receiptItems, { ledgerItems, planHashes });
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
  // M7 Task 4 (Codex F3) — genuine handoff = STATE.md last_event==='handoff_spawn'
  // (the signal the resume dispatcher honors), NOT the broader resume_state.
  const hasHandoffSignal = !!(stateItem && stateItem.frontmatter
    && stateItem.frontmatter.last_event === 'handoff_spawn');
  if (hasHandoffSignal) {
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

  // M5 Task 2 — '이월 finding' = codex-findings-backlog HIGH/CRITICAL(기존 risksOpen
  // 소스). 이전엔 이 카운트를 '미해결 위험'으로 라벨링해 위험 섹션(plan body risks)과
  // 다른 숫자를 보였다(rail 1 vs 섹션 45). backlog 는 deferred finding 이므로 '이월
  // finding' 으로 분리 명명. count 는 HIGH/CRITICAL 행 수(finding 텍스트 빈 행도 집계).
  const backlogItems = (sources.backlog && sources.backlog.items) || [];
  const highCritical = backlogItems.filter(b => {
    if (!b) return false;
    const s = (b.severity || '').toUpperCase();
    return s === 'HIGH' || s === 'CRITICAL';
  });
  const deferredCount = highCritical.length;
  const deferredItems = highCritical.map(b => (b.finding || '').trim()).filter(Boolean);

  // M5 Task 2 — '미해결 위험' = 위험 섹션과 동일 소스(plan body risks, active=미마커).
  // rail 카운트가 risks.js activeCount 와 같은 pb.risks 를 filter 하므로 정합(rail==섹션).
  // severity 내림차순 top-N 으로 hero 위젯이 섹션 top-3 와 같은 항목을 보인다.
  // M8 — historical-risk lifecycle scope 종료(이전 M6 backlog 이월, Codex F4). active
  // 정의가 risks.js 와 동일(!resolved && !sourceClosed)이라 완료/은퇴 plan 출처
  // 미마커 위험이 rail 셀에서도 제외 → rail==섹션 reconcile 유지.
  const allRisks = Array.isArray(pb.risks) ? pb.risks : [];
  const activeRisks = allRisks
    .filter(r => r && !r.resolved && !r.sourceClosed)
    .slice()
    .sort((a, b) => riskSevRank(b) - riskSevRank(a));
  const risksOpen = activeRisks.length;
  const riskItems = activeRisks
    .map(r => stripMarker(r.risk || '').trim())
    .filter(Boolean);

  // M5 Task 2 — 차단 셀 툴팁. decision-state SSoT 판정(round≥2 미수렴)의 의미를 라벨
  // hover 로 노출. 0건이면 검토 충돌 없음 empty-state 의미.
  const blockedIntent = blockedCount > 0
    ? 'Codex 검토 ' + blockedCount + '건 미수렴 · 사람 개입 필요'
    : '검토 충돌 없음';

  const cells = [
    { key: 'in-progress', label: '진행 중', icon: '◐', value: String(inProgressCount), kind: 'count', items: inProgressItems, staleItems: staleInProgressItems },
    { key: 'blocked', label: '차단', icon: '🚫', value: String(blockedCount), kind: 'count', accent: 'blocked', items: blockedItems, intent: blockedIntent },
    { key: 'deferred', label: '이월 finding', icon: '↪', value: String(deferredCount), kind: 'count', items: deferredItems },
    { key: 'risks', label: '위험', icon: '⚠', value: String(risksOpen), kind: 'count', items: riskItems, routeHref: '#route-risks' },
    { key: 'next', label: '다음', icon: '→', value: nextStep, kind: 'next', stale: nextStale, intent: nextIntent },
  ];

  // M2 — host-version snapshot 소비(파일 읽기 없음, F2) + STATE.md next-action 추출(F1).
  const version = (m.host_version && typeof m.host_version === 'object')
    ? m.host_version
    : { version: null, source: 'unknown', latest_plan: null, degraded: false, error: null };
  let nextAction;
  try {
    nextAction = resolveNextAction(stateItem, {
      plans: plansItems, planStatuses, planStaleness: staleness, planIntent: nextIntent,
      // M7 Task 4 — frontier-primary derive (Codex F1) + genuine-handoff resume
      // (Codex F3). Reuse the ledger-aware stateMap so the chip and the pipeline
      // agree on which gate is the frontier.
      decisionState: stateMap, hasHandoffSignal,
    });
  } catch (_) {
    nextAction = { command: null, args: '', prose: '대기', copyText: null, source: 'idle', executable: false, stale: false };
  }

  const summaryLine = cells.map(c => c.icon + ' ' + c.label + ' ' + c.value).join(' · ');
  // M5 Task 1 — stale in-progress 는 카운트 밖 muted 한 줄(있을 때만).
  const staleNoteMd = staleInProgressItems.length
    ? '\n오래된 진행중 (' + staleInProgressItems.length + '): '
      + staleInProgressItems.slice(0, TOP_N).map(s => (formatUtils.renderProseMd || ((x) => x))(s)).join(' · ')
    : '';
  // M5 Task 2 — 위젯 mirror(hero 4종: 진행중/차단/이월/위험). M5 Task 5 — versionMd
  // 제거(footer page-foot 가 이미 version 노출 → hero 표면 중복 제거).
  const widgetsMd = [
    widgetMd('진행 중', inProgressItems, formatUtils) + staleNoteMd,
    widgetMd('차단', blockedItems, formatUtils),
    widgetMd('이월 finding', deferredItems, formatUtils, deferredCount),
    widgetMd('위험', riskItems, formatUtils, risksOpen),
  ].join('\n');
  const md = [summaryLine, '', widgetsMd, '', nextActionMd(nextAction)].join('\n');

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
      // M5 Task 2 — count 셀 툴팁(차단 의미 노출). intent 없으면 생략. title 은
      // human-readable 이라 escapeHtml(공백 보존) — escapeAttr 는 공백을 %20 인코딩.
      const titleAttr = c.intent ? ' title="' + escapeHtml(c.intent) + '"' : '';
      valueHtml = '<div class="grid-value"' + titleAttr + '>' + escapeHtml(c.value) + '</div>';
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
