'use strict';

const fs = require('fs');
const path = require('path');
const stateWriter = require('../../state/state-writer');
const sessionLedger = require('../../state/session-ledger');
const observerSessions = require('../../lib/observer-sessions');
const { resolveRawSessionId } = require('../../lib/session-identity');

const GIVEUP_THRESHOLD = 3;

// v1.4.0-m3 — self_session_id + self_resolution contracted surface
// (Codex Implement R1 F3 absorption). Resolution chain:
//   1. session-identity chain env (sanitized) → 'resolved'
//   2. ledger cwd === process.cwd() (resolved-path match) → 'resolved-by-cwd'
//   3. env present but sanitize failed (after cwd fallback) → 'unresolved'
//   4. env unset (after cwd fallback) → 'env-missing'
// Always emits both fields — null fallback is forbidden (contract).
function resolveSelfSessionId(ledgers, options) {
  options = options || {};
  const envRaw = Object.prototype.hasOwnProperty.call(options, 'envSessionId')
    ? options.envSessionId
    : resolveRawSessionId(process.env);
  const cwdRaw = options.cwd || process.cwd();

  const envProvided = typeof envRaw === 'string' && envRaw.length > 0;
  if (envProvided) {
    const sanitized = observerSessions.resolveSessionId(envRaw);
    if (sanitized) {
      return { id: sanitized, resolution: 'resolved' };
    }
  }

  let myResolved = null;
  try {
    myResolved = path.resolve(cwdRaw);
  } catch (_e) {
    myResolved = null;
  }
  if (myResolved && Array.isArray(ledgers)) {
    for (const l of ledgers) {
      if (!l || !l.cwd) continue;
      let lResolved = null;
      try {
        lResolved = path.resolve(l.cwd);
      } catch (_e) {
        continue;
      }
      if (lResolved === myResolved) {
        return { id: l.session_id || null, resolution: 'resolved-by-cwd' };
      }
    }
  }

  if (envProvided) {
    return { id: null, resolution: 'unresolved' };
  }
  return { id: null, resolution: 'env-missing' };
}

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
function collectActiveSessionLedgers(repoRoot, options) {
  options = options || {};
  try {
    const list = sessionLedger.listLedgers({ activeOnly: true, cwd: repoRoot });
    if (!list || !list.ok) {
      const self = resolveSelfSessionId([], options);
      return {
        ledgers: [],
        self_session_id: self.id,
        self_resolution: self.resolution,
        degraded: true,
        error: (list && list.error) || 'listLedgers returned !ok',
      };
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
    const self = resolveSelfSessionId(surfaced, options);
    return {
      ledgers: surfaced,
      self_session_id: self.id,
      self_resolution: self.resolution,
      degraded: !!list.degraded,
      error: null,
    };
  } catch (err) {
    const self = resolveSelfSessionId([], options);
    return {
      ledgers: [],
      self_session_id: self.id,
      self_resolution: self.resolution,
      degraded: true,
      error: (err && err.message) || String(err),
    };
  }
}

function scanState(repoRoot, options) {
  options = options || {};
  const target = path.join(repoRoot, '.claude', 'state', 'STATE.md');
  const ledgerScan = collectActiveSessionLedgers(repoRoot, options);
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
        self_session_id: ledgerScan.self_session_id,
        self_resolution: ledgerScan.self_resolution,
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
    self_session_id: ledgerScan.self_session_id,
    self_resolution: ledgerScan.self_resolution,
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
  resolveSelfSessionId,
  GIVEUP_THRESHOLD,
};
