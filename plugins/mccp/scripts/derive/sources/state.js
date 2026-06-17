'use strict';

const fs = require('fs');
const path = require('path');
const stateWriter = require('../../state/state-writer');

const GIVEUP_THRESHOLD = 3;

function computeResumeState(fm) {
  if (!fm) return 'idle';
  const dispatchId = fm.dispatch_id || null;
  const completedId = fm.dispatch_id_completed || null;
  const attemptCount = typeof fm.dispatch_attempt_count === 'number' ? fm.dispatch_attempt_count : 0;
  if (dispatchId && !completedId && attemptCount >= GIVEUP_THRESHOLD) return 'giveup';
  if (completedId) return 'completed';
  if (dispatchId && !completedId) return 'in-flight';
  return 'idle';
}

function scanState(repoRoot) {
  const target = path.join(repoRoot, '.claude', 'state', 'STATE.md');
  if (!fs.existsSync(target)) {
    return { ok: true, item: null, degraded: false, error: null };
  }
  let state;
  try {
    state = stateWriter.readState(repoRoot);
  } catch (err) {
    return { ok: false, item: null, degraded: true, error: err.message };
  }
  const fm = (state && state.frontmatter) || {};
  const body = (state && state.body) || {};
  const item = {
    frontmatter: fm,
    body,
    resume_state: computeResumeState(fm),
    controller_active: !!(fm.controller_session_id && fm.active_dispatch_count > 0),
    escalate_pending: !!fm.escalate_pending,
    path: path.relative(repoRoot, target),
  };
  return { ok: true, item, degraded: false, error: null };
}

module.exports = {
  scanState,
  computeResumeState,
  GIVEUP_THRESHOLD,
};
