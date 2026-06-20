'use strict';

// v1.3.0-m3-redux verdict — tone enum now 5-way (red/amber/green/blue/neutral)
// matching the 4-signal token palette in html.js (signal/warn/ok/accent).
//
// Backwards-compat: `text` field preserved verbatim (downstream md composer +
// existing tests read it). New `prose` field carries PM-voice sentence; html.js
// renders prose-if-present, else text. Future derive-side LLM briefing can
// populate prose with richer phrasing while text stays mechanical.

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

// Build verdict object with both `text` (legacy) and `prose` (PM-voice). For
// now they are equal; prose only diverges when a future derive briefing
// supplies a more human sentence. tone is mapped to the new 5-way enum.
function v(tone, icon, text, prose) {
  return { tone, icon, text, prose: prose || text };
}

function computeVerdict(model, planBody) {
  const m = model || {};
  const sources = m.sources || {};
  const warnings = Array.isArray(m.warnings) ? m.warnings : [];
  const pb = planBody || {};
  const planStatuses = pb.planStatuses instanceof Map ? pb.planStatuses : new Map();

  if (m.m0_capability && m.m0_capability.contract_present === false) {
    return v('red', '🚫', 'schema contract missing, derive degraded');
  }

  const hits = Array.isArray(m.mask_hits) ? m.mask_hits : [];
  const severeHits = hits.filter(h => h && h.severe === true);
  if (severeHits.length > 0) {
    const severeCount = severeHits.reduce((acc, h) => acc + (h.count || 1), 0);
    const firstId = (severeHits[0] && severeHits[0].source_id) || null;
    const idSuffix = firstId ? ', ' + String(firstId).slice(0, 16) + ' 확인' : '';
    return v('red', '⚠', '시크릿 ' + severeCount + '건 감지, 즉시 키 회전' + idSuffix);
  }

  const crit = warnings.find(w => w && w.severity === 'critical');
  if (crit) {
    return v('red', '🚫', (crit.source || 'warning') + ': ' + (crit.message || 'critical'));
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
    return v('amber', '⏱', text);
  }

  const stateItem = sources.state && sources.state.item;
  if (stateItem) {
    if (stateItem.resume_state === 'giveup') {
      const attempts = (stateItem.frontmatter && stateItem.frontmatter.dispatch_attempt_count) || 0;
      return v('red', '🚫', 'resume dispatch gave up after ' + attempts + ' attempts');
    }
    if (stateItem.resume_state === 'in-flight') {
      const attempts = (stateItem.frontmatter && stateItem.frontmatter.dispatch_attempt_count) || 1;
      return v('amber', '⏱', 'resume dispatch in-flight (attempt ' + attempts + ')');
    }
  }

  const fixTask = sources.fix_task && sources.fix_task.item;
  if (fixTask && stateItem && stateItem.escalate_pending) {
    return v('amber', '⚠', 'fix-task pending escalate');
  }

  const envItems = (sources.envelopes && sources.envelopes.items) || [];
  const staleWorkers = envItems.filter(e => e && e.ok && e.stale).length;
  if (staleWorkers > 0) {
    return v('amber', '⏱', staleWorkers + ' worker(s) heartbeat stale');
  }

  if (stateItem && stateItem.controller_active && envItems.length === 0) {
    const adc = (stateItem.frontmatter && stateItem.frontmatter.active_dispatch_count) || 0;
    return v('amber', '⏱', 'controller active, envelopes missing (' + adc + ' dispatches)');
  }

  const aliveWorkers = envItems.filter(e => e && e.ok && !e.is_terminal && !e.stale).length;
  const terminalWorkers = envItems.filter(e => e && e.ok && e.is_terminal).length;
  if (aliveWorkers > 0) {
    return v('green', '●', aliveWorkers + ' worker(s) alive · ' + terminalWorkers + ' terminal');
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
    const text = backlogCount + ' findings deferred · next: ' + nextSlug;
    return v('neutral', '·', text);
  }

  if (inProgressPlans.length > 0) {
    const text = inProgressPlans.length + ' plans active · next: ' + planSlug(inProgressPlans[0]);
    return v('neutral', '◐', text);
  }

  return v('muted', '·', 'no in-flight signal · select next milestone from PRDs');
}

module.exports = { computeVerdict, planSlug };
