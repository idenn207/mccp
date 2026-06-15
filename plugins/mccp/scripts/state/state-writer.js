'use strict';

// STATE.md writer — session-bridging context container.
//
// Schema: docs/v0.2-state-schema.md §1
//
// Atomic rename + advisory lock, mirroring loop-counter.js:82-205. Same
// lock-file convention so concurrent PreCompact + Stop-loop touches cannot
// race the read-modify-write.
//
// API: update(repoRoot, patch) where patch is a partial object. Fields not
// specified are preserved from the existing STATE.md (read-modify-write).
// Template render enforces section order and per-section line bounds —
// callers cannot inject free-form structure.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const STATE_VERSION = 1;
const STATE_DIRNAME = path.join('.claude', 'state');
const STATE_FILENAME = 'STATE.md';
const LOCK_MAX_RETRIES = 50;
const LOCK_RETRY_MS = 20;
const LOCK_STALE_MS = 30 * 1000;

const VALID_EVENTS = new Set([
  'stop_loop_pass',
  'receipt_write',
  'pr_created',
  'fix_task_applied',
  'precompact',
  // v0.3.0 S10b — emitted by session-spawner when handoff actually fires.
  // Reading session can use this to skip re-running cost detection.
  'handoff_spawn',
  // v0.4.0 axis H — emitted by /mccp:prp-implement Phase 3 when
  // plan-conflict-detector signals a plan ↔ implementation gap. Paired
  // with chain_aborted=true so auto-chain stops at commit/PR step.
  'plan_conflict_escalated',
  // v1.1.0 Stage 1 Task 1.5 (F2 absorption) — /mccp:resume 2-phase atomic
  // dispatch markers. resume_dispatching is set by phase 1 just before the
  // dispatched command runs (handoff_spawn signal preserved). resume_dispatched
  // is set by phase 2 only when the dispatched command produced a success
  // receipt (and optionally clears handoff_spawn via clearHandoff=true).
  // Without these entries the unknown-event downgrade silently rewrites
  // last_event → precompact, losing the in-flight marker.
  'resume_dispatching',
  'resume_dispatched',
]);

const SECTIONS = ['Goal', 'Plan', 'Done', 'In Progress', 'Next Step', 'Last Decision', 'Open Questions', 'Last Updated'];

function statePath(repoRoot) {
  return path.join(repoRoot, STATE_DIRNAME, STATE_FILENAME);
}

function lockPath(repoRoot) {
  return statePath(repoRoot) + '.lock';
}

function ensureDir(target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeLines(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(/[\r\n]+/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
}

function normalizeSingleLine(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function truncateLines(text, maxLines) {
  const norm = normalizeLines(text);
  if (!norm) return '';
  const lines = norm.split('\n');
  if (lines.length <= maxLines) return norm;
  process.stderr.write('[mccp:state-writer] WARNING: section truncated from ' +
    lines.length + ' to ' + maxLines + ' lines\n');
  return lines.slice(0, maxLines).join('\n') + '\n…';
}

function truncateParagraph(text) {
  const single = normalizeSingleLine(text);
  if (single.length <= 800) return single;
  process.stderr.write('[mccp:state-writer] WARNING: paragraph truncated from ' +
    single.length + ' to 800 chars\n');
  return single.slice(0, 799) + '…';
}

function normalizeBulletList(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.map(v => normalizeSingleLine(v)).filter(s => s.length > 0);
  }
  const flat = normalizeLines(value);
  if (!flat) return [];
  return flat.split('\n').map(line => line.replace(/^[\s-]+/, '').trim()).filter(s => s.length > 0);
}

function emptyState() {
  return {
    frontmatter: {
      state_version: STATE_VERSION,
      task_fingerprint: 'unknown',
      created_at: null,
      updated_at: null,
      last_event: 'precompact',
      last_event_at: null,
      unsafe_checkpoint: false,
      confirm_required: false,
      next_chunk: null,
      // v0.2.2 Task 8 — auto-chain + cost ceiling fields
      session_end_imminent: false,
      chain_aborted: false,
      chain_progress: null,
      last_pr_url: null,
      // v0.2.3 — dep-check dedupe state (24h re-warn threshold)
      dep_check_at: null,
      dep_check_missing: null,
      // v0.3.2 — dual-reviewer escalate flag (set by receipt-write when an
      // escalate trigger fires; cleared on next clean receipt for the same
      // decision_id). Conditional emit — only rendered when escalate_pending=true.
      escalate_pending: false,
      escalate_pending_decision_id: null,
      // v1.1.0 Stage 1 Task 1.5 — /mccp:resume 2-phase atomic dispatch tracking.
      // dispatch_id: uuid set by resume phase 1, cleared (well: superseded) by
      //              phase 2 success path or carried forward on retry.
      // dispatch_id_completed: uuid set by resume phase 2 success — sentinel
      //              that the in-flight cycle finished cleanly.
      // dispatch_attempt_count: integer, incremented per phase 1 entry. Phase
      //              1 short-circuits to in-flight at count < 3, resume_giveup
      //              at count >= 3 (manual recovery required).
      dispatch_id: null,
      dispatch_id_completed: null,
      dispatch_attempt_count: 0,
    },
    body: {
      goal: '',
      plan: [],
      done: [],
      inProgress: '',
      nextStep: '',
      lastDecision: '',
      openQuestions: [],
    },
  };
}

function readState(repoRoot) {
  const target = statePath(repoRoot);
  if (!fs.existsSync(target)) return emptyState();
  let raw;
  try {
    raw = fs.readFileSync(target, 'utf8');
  } catch (err) {
    process.stderr.write('[mccp:state-writer] WARNING: read failed for ' + target +
      ' (' + err.code + '); resetting state\n');
    return emptyState();
  }
  return parseStateMd(raw) || emptyState();
}

function parseStateMd(raw) {
  const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/);
  if (!match) {
    process.stderr.write('[mccp:state-writer] WARNING: no frontmatter found; resetting state\n');
    return null;
  }
  const fm = parseFrontmatter(match[1]);
  if (!fm) return null;
  if (fm.state_version !== STATE_VERSION) {
    process.stderr.write('[mccp:state-writer] WARNING: unsupported state_version ' +
      fm.state_version + ' (expected ' + STATE_VERSION + '); resetting state\n');
    return null;
  }
  const body = parseBody(match[2]);
  return { frontmatter: Object.assign(emptyState().frontmatter, fm), body: body };
}

function parseFrontmatter(text) {
  const fm = {};
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^([a-z_][a-z0-9_]*)\s*:\s*(.*)$/i);
    if (!m) { i++; continue; }
    const key = m[1];
    let value = m[2];
    if (value === '|' || value === '>') {
      const block = [];
      i++;
      while (i < lines.length && (lines[i].startsWith('  ') || lines[i] === '')) {
        block.push(lines[i].replace(/^ {2}/, ''));
        i++;
      }
      fm[key] = block.join('\n').replace(/\s+$/, '');
      continue;
    }
    value = value.trim();
    if (value === 'true') fm[key] = true;
    else if (value === 'false') fm[key] = false;
    else if (value === 'null' || value === '') fm[key] = null;
    else if (/^\d+$/.test(value)) fm[key] = parseInt(value, 10);
    else fm[key] = value;
    i++;
  }
  return fm;
}

function parseBody(text) {
  const body = emptyState().body;
  const sectionRe = /^## (.+)$/;
  const lines = text.split(/\r?\n/);
  let current = null;
  let buf = [];
  function flush() {
    if (current === null) return;
    const content = buf.join('\n').trim();
    switch (current) {
      case 'Goal': body.goal = content; break;
      case 'Plan': body.plan = bulletsFrom(content); break;
      case 'Done': body.done = bulletsFrom(content); break;
      case 'In Progress': body.inProgress = content; break;
      case 'Next Step': body.nextStep = content; break;
      case 'Last Decision': body.lastDecision = content; break;
      case 'Open Questions': body.openQuestions = bulletsFrom(content); break;
      default: break;
    }
    buf = [];
  }
  for (const line of lines) {
    const m = line.match(sectionRe);
    if (m) {
      flush();
      current = m[1].trim();
    } else if (current !== null) {
      buf.push(line);
    }
  }
  flush();
  return body;
}

function bulletsFrom(text) {
  if (!text) return [];
  return text.split(/\r?\n/).map(l => l.replace(/^[\s-]+/, '').trim()).filter(s => s.length > 0);
}

function renderFrontmatter(fm) {
  const out = ['---'];
  out.push('state_version: ' + fm.state_version);
  out.push('task_fingerprint: ' + fm.task_fingerprint);
  out.push('created_at: ' + (fm.created_at || ''));
  out.push('updated_at: ' + (fm.updated_at || ''));
  out.push('last_event: ' + fm.last_event);
  out.push('last_event_at: ' + (fm.last_event_at || ''));
  out.push('unsafe_checkpoint: ' + (fm.unsafe_checkpoint ? 'true' : 'false'));
  out.push('confirm_required: ' + (fm.confirm_required ? 'true' : 'false'));
  if (fm.next_chunk) {
    out.push('next_chunk: |');
    for (const line of String(fm.next_chunk).split('\n')) {
      out.push('  ' + line);
    }
  }
  // v0.2.2 Task 8 — auto-chain + cost ceiling fields (defaults emitted always
  // so downstream readers can rely on presence).
  out.push('session_end_imminent: ' + (fm.session_end_imminent ? 'true' : 'false'));
  out.push('chain_aborted: ' + (fm.chain_aborted ? 'true' : 'false'));
  if (fm.last_pr_url) out.push('last_pr_url: ' + String(fm.last_pr_url));
  if (fm.chain_progress) {
    out.push('chain_progress: |');
    const cp = typeof fm.chain_progress === 'string'
      ? fm.chain_progress
      : JSON.stringify(fm.chain_progress);
    for (const line of cp.split('\n')) out.push('  ' + line);
  }
  // v0.2.3 — dep-check dedupe state (only rendered when set)
  if (fm.dep_check_at) out.push('dep_check_at: ' + fm.dep_check_at);
  if (fm.dep_check_missing) out.push('dep_check_missing: ' + fm.dep_check_missing);
  // v0.3.2 — escalate_pending (only rendered when active, mirroring dep_check pattern)
  if (fm.escalate_pending === true) {
    out.push('escalate_pending: true');
    if (fm.escalate_pending_decision_id) {
      out.push('escalate_pending_decision_id: ' + fm.escalate_pending_decision_id);
    }
  }
  // v1.1.0 Stage 1 Task 1.5 — resume dispatch tracking (only rendered when set,
  // mirroring dep_check / escalate_pending convention).
  if (fm.dispatch_id) out.push('dispatch_id: ' + fm.dispatch_id);
  if (fm.dispatch_id_completed) out.push('dispatch_id_completed: ' + fm.dispatch_id_completed);
  if (fm.dispatch_attempt_count && fm.dispatch_attempt_count > 0) {
    out.push('dispatch_attempt_count: ' + fm.dispatch_attempt_count);
  }
  out.push('---');
  return out.join('\n');
}

function renderBody(body, updatedAt) {
  const out = [];
  out.push('## Goal');
  out.push(body.goal || '');
  out.push('');
  out.push('## Plan');
  for (const item of body.plan) out.push('- ' + item);
  if (body.plan.length === 0) out.push('');
  out.push('');
  out.push('## Done');
  for (const item of body.done) out.push('- ' + item);
  if (body.done.length === 0) out.push('');
  out.push('');
  out.push('## In Progress');
  out.push(body.inProgress || '');
  out.push('');
  out.push('## Next Step');
  out.push(body.nextStep || '');
  out.push('');
  out.push('## Last Decision');
  out.push(body.lastDecision || '');
  out.push('');
  out.push('## Open Questions');
  for (const item of body.openQuestions) out.push('- ' + item);
  if (body.openQuestions.length === 0) out.push('');
  out.push('');
  out.push('## Last Updated');
  out.push(updatedAt);
  out.push('');
  return out.join('\n');
}

function mergeState(existing, patch) {
  const merged = JSON.parse(JSON.stringify(existing));
  const now = nowIso();

  if (patch.taskFingerprint) merged.frontmatter.task_fingerprint = patch.taskFingerprint;
  if (patch.event) {
    if (!VALID_EVENTS.has(patch.event)) {
      process.stderr.write('[mccp:state-writer] WARNING: unknown event "' + patch.event +
        '"; recording as precompact\n');
      merged.frontmatter.last_event = 'precompact';
    } else {
      merged.frontmatter.last_event = patch.event;
    }
    merged.frontmatter.last_event_at = now;
  }
  if (patch.unsafeCheckpoint !== undefined) merged.frontmatter.unsafe_checkpoint = !!patch.unsafeCheckpoint;
  if (patch.confirmRequired !== undefined) merged.frontmatter.confirm_required = !!patch.confirmRequired;
  if (patch.nextChunk !== undefined) merged.frontmatter.next_chunk = patch.nextChunk;
  if (patch.depCheck !== undefined) {
    const dc = patch.depCheck || {};
    merged.frontmatter.dep_check_at = dc.checkedAt || now;
    const missing = Array.isArray(dc.missing) ? dc.missing.filter(Boolean) : [];
    merged.frontmatter.dep_check_missing = missing.length > 0 ? missing.join(',') : null;
  }

  // v0.2.2 Task 8 — auto-chain + cost ceiling fields
  if (patch.session_end_imminent !== undefined || patch.sessionEndImminent !== undefined) {
    merged.frontmatter.session_end_imminent = !!(patch.session_end_imminent || patch.sessionEndImminent);
  }
  if (patch.chain_aborted !== undefined || patch.chainAborted !== undefined) {
    merged.frontmatter.chain_aborted = !!(patch.chain_aborted || patch.chainAborted);
  }
  if (patch.last_pr_url !== undefined || patch.lastPrUrl !== undefined) {
    merged.frontmatter.last_pr_url = patch.last_pr_url || patch.lastPrUrl || null;
  }
  if (patch.chain_progress !== undefined || patch.chainProgress !== undefined) {
    merged.frontmatter.chain_progress = patch.chain_progress || patch.chainProgress || null;
  }

  // v0.3.2 — dual-reviewer escalation flag.
  // Decision_id intentionally accepts null/'' to support the reverse-clear
  // path (receipt-write clears the flag when det.escalate=false matches the
  // recorded decision_id).
  if (patch.escalate_pending !== undefined) {
    merged.frontmatter.escalate_pending = !!patch.escalate_pending;
  }
  if (patch.escalate_pending_decision_id !== undefined) {
    const v = patch.escalate_pending_decision_id;
    merged.frontmatter.escalate_pending_decision_id = (v === null || v === '') ? null : String(v);
  }

  // v1.1.0 Stage 1 Task 1.5 — /mccp:resume dispatch tracking.
  // dispatch_id: uuid carried across phase 1 (resume_dispatching) → phase 2.
  // dispatch_id_completed: uuid set ONLY by phase 2 success path.
  // dispatch_attempt_count: incremented by phase 1, capped at 3 (giveup).
  // clearHandoff: control signal — when true, clears the handoff_spawn fields
  //               so the next session-start does not re-trigger. Defaults to
  //               false: phase 1 NEVER clears, only phase 2 success can.
  if (patch.dispatch_id !== undefined) {
    merged.frontmatter.dispatch_id = patch.dispatch_id || null;
  }
  if (patch.dispatch_id_completed !== undefined) {
    merged.frontmatter.dispatch_id_completed = patch.dispatch_id_completed || null;
  }
  if (patch.dispatch_attempt_count !== undefined) {
    const n = Number(patch.dispatch_attempt_count);
    merged.frontmatter.dispatch_attempt_count = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }
  if (patch.clearHandoff === true) {
    // F1 absorption — handoff_spawn signal preservation is the default. Only
    // an explicit clearHandoff=true call (= phase 2 after success receipt
    // readback) erases the next-session resume signal. session_end_imminent
    // and next_chunk are the surfaces state-injector reads; reset both.
    merged.frontmatter.next_chunk = null;
    merged.frontmatter.session_end_imminent = false;
  }

  if (!merged.frontmatter.created_at) merged.frontmatter.created_at = now;
  merged.frontmatter.updated_at = now;

  if (patch.goal !== undefined) merged.body.goal = truncateLines(patch.goal, 3);
  if (patch.plan !== undefined) merged.body.plan = normalizeBulletList(patch.plan);
  if (patch.done !== undefined) merged.body.done = normalizeBulletList(patch.done);
  if (patch.inProgress !== undefined) merged.body.inProgress = normalizeSingleLine(patch.inProgress);
  if (patch.nextStep !== undefined) merged.body.nextStep = normalizeSingleLine(patch.nextStep);
  if (patch.lastDecision !== undefined) merged.body.lastDecision = truncateParagraph(patch.lastDecision);
  if (patch.openQuestions !== undefined) merged.body.openQuestions = normalizeBulletList(patch.openQuestions);

  return merged;
}

function renderState(state) {
  return renderFrontmatter(state.frontmatter) + '\n' +
    renderBody(state.body, state.frontmatter.updated_at);
}

function writeStateAtomic(repoRoot, state) {
  const target = statePath(repoRoot);
  ensureDir(target);
  const tmp = target + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  fs.writeFileSync(tmp, renderState(state), 'utf8');
  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
    throw err;
  }
}

function tryAcquire(lockFile) {
  try {
    const fd = fs.openSync(lockFile, 'wx');
    fs.writeSync(fd, String(process.pid) + '\n' + new Date().toISOString());
    fs.closeSync(fd);
    return true;
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    return false;
  }
}

function isStaleLock(lockFile) {
  try {
    const stat = fs.statSync(lockFile);
    return Date.now() - stat.mtimeMs > LOCK_STALE_MS;
  } catch (_e) { return false; }
}

function withStateLock(repoRoot, fn) {
  ensureDir(statePath(repoRoot));
  const lockFile = lockPath(repoRoot);
  let acquired = false;
  for (let i = 0; i < LOCK_MAX_RETRIES; i++) {
    if (tryAcquire(lockFile)) { acquired = true; break; }
    if (isStaleLock(lockFile)) {
      try { fs.unlinkSync(lockFile); } catch (_e) { /* ignore */ }
      continue;
    }
    const start = Date.now();
    while (Date.now() - start < LOCK_RETRY_MS) { /* spin briefly */ }
  }
  if (!acquired) {
    process.stderr.write('[mccp:state-writer] WARNING: could not acquire lock at ' +
      lockFile + ' after ' + (LOCK_MAX_RETRIES * LOCK_RETRY_MS) +
      'ms; proceeding without lock (race window open)\n');
  }
  try {
    return fn();
  } finally {
    if (acquired) {
      try { fs.unlinkSync(lockFile); } catch (_e) { /* ignore */ }
    }
  }
}

// v0.3.6 Task 4 (축 2) — STATE.md noise elimination.
//
// Every PreCompact / SessionStart hook calls update() which auto-bumps
// updated_at and (if event is set) last_event_at. Before this fix, even a
// no-op precompact rewrote the file purely for timestamp churn → `git status`
// dirty every session, working tree noise that masked real changes.
//
// Fix: hash the *semantic* content (frontmatter minus the 3 self-bumping
// timestamps + the full body). When existing and merged hashes match AND
// the file already exists on disk, skip writeStateAtomic and return existing
// (mtime untouched). last_event change still bumps the hash because
// last_event itself (not last_event_at) is the semantic value — so explicit
// event transitions still write.
const HASH_EXCLUDE_FRONTMATTER_KEYS = new Set(['updated_at', 'last_event_at', 'created_at']);

function contentSnapshot(state) {
  const fm = {};
  const fmKeys = Object.keys(state.frontmatter).sort();
  for (const k of fmKeys) {
    if (!HASH_EXCLUDE_FRONTMATTER_KEYS.has(k)) fm[k] = state.frontmatter[k];
  }
  const body = {};
  const bodyKeys = Object.keys(state.body).sort();
  for (const k of bodyKeys) body[k] = state.body[k];
  return { fm: fm, body: body };
}

function contentHash(state) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(contentSnapshot(state)), 'utf8')
    .digest('hex');
}

function update(repoRoot, patch) {
  return withStateLock(repoRoot, function () {
    const existing = readState(repoRoot);
    const target = statePath(repoRoot);
    const fileExisted = fs.existsSync(target);
    const merged = mergeState(existing, patch || {});
    if (fileExisted && contentHash(existing) === contentHash(merged)) {
      // Content is semantically identical — only timestamps would change.
      // Skip disk write so STATE.md stays out of `git status`.
      return existing;
    }
    writeStateAtomic(repoRoot, merged);
    return merged;
  });
}

// v0.2.2 Task 8 — append-only chain progress recorder for auto-chain.js.
function recordChainProgress(repoRoot, entry) {
  return withStateLock(repoRoot, function () {
    const existing = readState(repoRoot);
    let log;
    if (existing.frontmatter.chain_progress) {
      try { log = JSON.parse(existing.frontmatter.chain_progress); }
      catch { log = { steps: [] }; }
    } else {
      log = { steps: [] };
    }
    if (!Array.isArray(log.steps)) log.steps = [];
    log.steps.push({
      step: String(entry.step || 'unknown'),
      status: String(entry.status || 'unknown'),
      receipt_path: entry.receipt_path || entry.receiptPath || null,
      ts: nowIso(),
    });
    const merged = mergeState(existing, { chain_progress: JSON.stringify(log) });
    writeStateAtomic(repoRoot, merged);
    return { path: statePath(repoRoot), log: log };
  });
}

module.exports = {
  STATE_VERSION: STATE_VERSION,
  VALID_EVENTS: VALID_EVENTS,
  SECTIONS: SECTIONS,
  statePath: statePath,
  lockPath: lockPath,
  emptyState: emptyState,
  readState: readState,
  parseStateMd: parseStateMd,
  mergeState: mergeState,
  renderState: renderState,
  withStateLock: withStateLock,
  update: update,
  recordChainProgress: recordChainProgress,
  contentSnapshot: contentSnapshot,
  contentHash: contentHash,
  HASH_EXCLUDE_FRONTMATTER_KEYS: HASH_EXCLUDE_FRONTMATTER_KEYS,
};
