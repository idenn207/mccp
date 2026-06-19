'use strict';

const fs = require('fs');
const path = require('path');
const stateWriter = require('../../state/state-writer');
const sessionLedger = require('../../state/session-ledger');

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

// v1.5.0-m1 — surface active session ledgers via scope-aware listLedgers
// (Codex Implement R1 F3 absorption). Default global path is consumed
// transparently; no hardcoded repo path. fail-open per-source: ledger
// scan errors mark the item as degraded but do not abort the whole derive.
function collectActiveSessionLedgers(repoRoot) {
  try {
    const list = sessionLedger.listLedgers({ activeOnly: true, cwd: repoRoot });
    if (!list || !list.ok) {
      return { ledgers: [], degraded: true, error: (list && list.error) || 'listLedgers returned !ok' };
    }
    const surfaced = list.ledgers.map(function (l) {
      return {
        session_id: l.session_id,
        cwd: l.cwd,
        git_branch: l.git_branch,
        created_at: l.created_at,
        host: l.host,
        pid: l.pid,
        project_id: l.project_id,
      };
    });
    return { ledgers: surfaced, degraded: !!list.degraded, error: null };
  } catch (err) {
    return { ledgers: [], degraded: true, error: (err && err.message) || String(err) };
  }
}

function scanState(repoRoot) {
  const target = path.join(repoRoot, '.claude', 'state', 'STATE.md');
  const ledgerScan = collectActiveSessionLedgers(repoRoot);
  if (!fs.existsSync(target)) {
    return {
      ok: true,
      item: {
        frontmatter: {},
        body: {},
        resume_state: 'idle',
        controller_active: false,
        escalate_pending: false,
        path: null,
        active_session_ledgers: ledgerScan.ledgers,
      },
      degraded: ledgerScan.degraded,
      error: ledgerScan.error,
    };
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
    active_session_ledgers: ledgerScan.ledgers,
  };
  return {
    ok: true,
    item,
    degraded: ledgerScan.degraded,
    error: ledgerScan.error,
  };
}

module.exports = {
  scanState,
  computeResumeState,
  collectActiveSessionLedgers,
  GIVEUP_THRESHOLD,
};
