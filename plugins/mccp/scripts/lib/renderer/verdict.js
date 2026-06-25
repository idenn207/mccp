'use strict';

const path = require('path');
const { extractIntentFromPath } = require('./parsers/intent-extractor');
const { formatPlanLabel } = require('./sections/status-grid');

function computeIntentForNextPlan(plan, opts) {
  if (!plan || !plan.path) return null;
  try {
    const cwd = (opts && opts.cwd) || process.cwd();
    const planAbs = path.isAbsolute(plan.path) ? plan.path : path.resolve(cwd, plan.path);
    return extractIntentFromPath(planAbs, opts);
  } catch (_) {
    return null;
  }
}

function planSlug(plan) {
  if (!plan) return '(unknown)';
  if (plan.slug) return plan.slug;
  if (plan.path) {
    const basename = path.basename(plan.path);
    return basename.replace(/\.plan\.md$/, '').replace(/\.md$/, '');
  }
  return '(unknown)';
}

// M5 Task 3 — Hero h1 요약체 cap. intent 자동추출이 길면 잘림(말줄임은 드로어/route
// 위임). 문자열 codepoint 기준 cap(한글 깨짐 방지) — character-aware slice.
const INTENT_CAP = 72;
function capIntent(s) {
  const str = String(s == null ? '' : s).trim();
  const chars = Array.from(str);
  if (chars.length <= INTENT_CAP) return str;
  return chars.slice(0, INTENT_CAP - 1).join('') + '…';
}

function computeVerdict(model, planBody, opts) {
  const m = model || {};
  const sources = m.sources || {};
  const warnings = Array.isArray(m.warnings) ? m.warnings : [];
  const pb = planBody || {};
  const planStatuses = pb.planStatuses instanceof Map ? pb.planStatuses : new Map();

  if (m.m0_capability && m.m0_capability.contract_present === false) {
    return { tone: 'red', icon: '🚫', text: 'schema contract missing — derive degraded' };
  }

  // v1.3.0-m4 Task 7 — secret-suspect banner (step 1.5). Fires only for
  // severe kinds (sk-key, aws-key, private-key-block). Bearer/password=
  // mask silently. impeccable F1+F3 absorption — telegraphic Korean copy,
  // no em dash, receipt/envelope source id surfaced for triage.
  const hits = Array.isArray(m.mask_hits) ? m.mask_hits : [];
  const severeHits = hits.filter(function (h) {
    return h && h.severe === true;
  });
  if (severeHits.length > 0) {
    const severeCount = severeHits.reduce(function (acc, h) { return acc + (h.count || 1); }, 0);
    const firstId = (severeHits[0] && severeHits[0].source_id) || null;
    const idSuffix = firstId ? ' · ' + String(firstId).slice(0, 16) + ' 확인' : '';
    return {
      tone: 'red', icon: '⚠',
      text: '시크릿 ' + severeCount + '건 감지 · 즉시 키 회전' + idSuffix,
    };
  }

  const crit = warnings.find(w => w && w.severity === 'critical');
  if (crit) {
    return { tone: 'red', icon: '🚫', text: (crit.source || 'warning') + ': ' + (crit.message || 'critical') };
  }

  const degradedSources = Object.entries(sources)
    .filter(([, v]) => v && v.degraded)
    .map(([k]) => k);
  if (degradedSources.length > 0) {
    const first = degradedSources[0];
    const rest = degradedSources.length - 1;
    const text = rest > 0
      ? first + ' + ' + rest + ' more 소스 손상'
      : first + ' 소스 손상';
    return { tone: 'amber', icon: '⏱', text };
  }

  const stateItem = sources.state && sources.state.item;
  if (stateItem) {
    if (stateItem.resume_state === 'giveup') {
      const attempts = (stateItem.frontmatter && stateItem.frontmatter.dispatch_attempt_count) || 0;
      return { tone: 'red', icon: '🚫', text: 'resume dispatch gave up after ' + attempts + ' attempts' };
    }
    if (stateItem.resume_state === 'in-flight') {
      const attempts = (stateItem.frontmatter && stateItem.frontmatter.dispatch_attempt_count) || 1;
      return { tone: 'amber', icon: '⏱', text: 'resume dispatch in-flight (attempt ' + attempts + ')' };
    }
  }

  const fixTask = sources.fix_task && sources.fix_task.item;
  if (fixTask && stateItem && stateItem.escalate_pending) {
    return { tone: 'amber', icon: '⚠', text: 'fix-task pending escalate' };
  }

  const envItems = (sources.envelopes && sources.envelopes.items) || [];
  const staleWorkers = envItems.filter(e => e && e.ok && e.stale).length;
  if (staleWorkers > 0) {
    return { tone: 'amber', icon: '⏱', text: staleWorkers + ' worker(s) heartbeat stale' };
  }

  if (stateItem && stateItem.controller_active && envItems.length === 0) {
    const adc = (stateItem.frontmatter && stateItem.frontmatter.active_dispatch_count) || 0;
    return { tone: 'amber', icon: '⏱', text: 'controller active, envelopes missing (' + adc + ' dispatches)' };
  }

  const aliveWorkers = envItems.filter(e => e && e.ok && !e.is_terminal && !e.stale).length;
  const terminalWorkers = envItems.filter(e => e && e.ok && e.is_terminal).length;
  if (aliveWorkers > 0) {
    return { tone: 'green', icon: '●', text: aliveWorkers + ' worker(s) alive · ' + terminalWorkers + ' terminal' };
  }

  const backlogCount = (sources.backlog && sources.backlog.count) || 0;
  const plansItems = (sources.plans && sources.plans.items) || [];
  const inProgressPlans = plansItems.filter(p => {
    if (!p) return false;
    const basename = p.path ? path.basename(p.path) : null;
    const status = basename ? planStatuses.get(basename) : undefined;
    return status === 'in-progress';
  });
  const staleness = pb.planStaleness instanceof Map ? pb.planStaleness : new Map();
  const freshInProgress = inProgressPlans.filter(p => {
    const basename = p.path ? path.basename(p.path) : null;
    const st = basename ? staleness.get(basename) : undefined;
    return st !== 'stale';
  });

  // M5 Task 3 / M6 Task 4 — fresh in-progress plan 을 backlog-deferred 보다 우선.
  // Hero h1 은 마일스톤명(formatPlanLabel)을 primary 로 두고(짧아 잘림 0), verbose
  // Summary 추출은 h1 에서 제거해 2줄 subtext 로 분리한다(잘림 대신 line-clamp).
  // "현재 작업: " 선행어는 PM voice 유지(H14 slug-only 회피) + 마일스톤명이 주 내용.
  if (freshInProgress.length > 0) {
    const nextPlan = freshInProgress[0];
    const basename = nextPlan.path ? path.basename(nextPlan.path) : null;
    const label = basename ? formatPlanLabel(basename, { maxLen: 56 }) : planSlug(nextPlan);
    // M7 Task 5 (⑤) — subtext 는 첫 완결 문장(mid-word `…` 없음). 220자 hard-cut
    // 대신 complete 모드로 "문장 중간 잘림"을 제거한다(사용자 "그만 잘라"). 시각
    // 안전망은 CSS relaxed line-clamp(html.js .verdict-sub)이 담당.
    const intent = computeIntentForNextPlan(nextPlan, Object.assign({}, opts, { complete: true }));
    const out = { tone: 'neutral', icon: '◐', text: '현재 작업: ' + label };
    if (intent) out.subtext = intent;
    return out;
  }

  // fresh in-progress 가 없을 때만 backlog/stale 신호를 surface. in-progress 가 전부
  // stale 이면 진행 신호가 약함(amber 경고 톤).
  if (inProgressPlans.length > 0) {
    if (backlogCount > 0) {
      return {
        tone: 'amber', icon: '⚠',
        text: backlogCount + ' findings deferred · 다음 미정 (in-progress plan stale)',
      };
    }
    return {
      tone: 'amber', icon: '⚠',
      text: inProgressPlans.length + ' plans active · 다음 미정 (stale)',
    };
  }

  // 활성 plan 없음 + backlog 만 → 이월 finding 있으나 진행 작업 없음(대기, 다음 선택).
  if (backlogCount > 0) {
    return {
      tone: 'muted', icon: '·',
      text: backlogCount + ' findings deferred · 다음 마일스톤 선택',
    };
  }

  return { tone: 'muted', icon: '·', text: 'no in-flight signal · select next milestone from PRDs' };
}

module.exports = { computeVerdict, planSlug, computeIntentForNextPlan };
