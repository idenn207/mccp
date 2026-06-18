'use strict';

const path = require('path');

function planSlug(plan) {
  if (!plan) return '(unknown)';
  if (plan.slug) return plan.slug;
  if (plan.path) {
    const basename = path.basename(plan.path);
    return basename.replace(/\.plan\.md$/, '').replace(/\.md$/, '');
  }
  return '(unknown)';
}

function computeVerdict(model, planBody) {
  const m = model || {};
  const sources = m.sources || {};
  const warnings = Array.isArray(m.warnings) ? m.warnings : [];
  const pb = planBody || {};
  const planStatuses = pb.planStatuses instanceof Map ? pb.planStatuses : new Map();

  if (m.m0_capability && m.m0_capability.contract_present === false) {
    return { tone: 'red', icon: '🚫', text: 'schema contract missing — derive degraded' };
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

  if (backlogCount > 0) {
    const nextSlug = inProgressPlans[0] ? planSlug(inProgressPlans[0]) : '(none)';
    return { tone: 'neutral', icon: '·', text: backlogCount + ' findings deferred · next: ' + nextSlug };
  }

  if (inProgressPlans.length > 0) {
    return {
      tone: 'neutral', icon: '◐',
      text: inProgressPlans.length + ' plans active · next: ' + planSlug(inProgressPlans[0]),
    };
  }

  return { tone: 'muted', icon: '·', text: 'no in-flight signal · select next milestone from PRDs' };
}

module.exports = { computeVerdict, planSlug };
