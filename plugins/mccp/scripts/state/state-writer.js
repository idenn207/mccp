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
  // v1.2.0-m1 Task 8 — orchestrator controller lifecycle markers. Emitted
  // by dispatch-controller.prepareDispatch (dispatch_started), by the
  // hybrid watcher when a worker envelope is received (dispatch_envelope_received),
  // and by reclaimStale or controller crash recovery
  // (dispatch_chain_aborted, paired with chain_aborted=true). All three
  // must be in VALID_EVENTS to survive the unknown-event downgrade branch.
  'dispatch_started',
  'dispatch_envelope_received',
  'dispatch_chain_aborted',
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
      // v1.2.0-m1 Task 8 — orchestrator controller session tracking.
      // controller_session_id: UUID set by prepareDispatch, cleared on
      //   chain abort or successful merge of all envelopes. Conditional render
      //   (only emit when set) keeps STATE.md quiet for non-controller sessions.
      // active_dispatch_count: integer count of in-flight dispatches under
      //   this controller. Watcher decrements as envelopes arrive; reclaimStale
      //   forces to 0 on chain abort.
      controller_session_id: null,
      active_dispatch_count: 0,
      // cost-model-subscription M3 (Axis 2, F3) — chain_aborted provenance.
      // abort_owner: 'cost' | 'dispatch' | null — which channel set chain_aborted.
      //   A STABLE ownership token (last_event was unstable: overwritten by any
      //   later event). The cost producer stamps 'cost'; the dispatch_chain_aborted
      //   event stamps 'dispatch' + clears the stale cost marker. Conditional render.
      // cost_abort_at: ISO timestamp of the cost SET — the decay-clear age anchor.
      abort_owner: null,
      cost_abort_at: null,
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
  // cost-model-subscription M3 (Axis 2, F3) — chain_aborted provenance (present-only,
  // dep_check_at mirror). Emitted only when the flag was set by a channel.
  if (fm.abort_owner) out.push('abort_owner: ' + fm.abort_owner);
  if (fm.cost_abort_at) out.push('cost_abort_at: ' + fm.cost_abort_at);
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
  // v1.2.0-m1 Task 8 — orchestrator controller fields (conditional emit).
  if (fm.controller_session_id) {
    out.push('controller_session_id: ' + fm.controller_session_id);
  }
  if (fm.active_dispatch_count && fm.active_dispatch_count > 0) {
    out.push('active_dispatch_count: ' + fm.active_dispatch_count);
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

  // cost-model-subscription M3 (Axis 2, F3) — chain_aborted provenance markers.
  // abort_owner: enum 'cost'|'dispatch'|null; cost_abort_at: ISO|null. Both accept
  // null/'' to clear (present-only render then omits them). The cost producer
  // stamps abort_owner='cost'+cost_abort_at when it SETS chain_aborted; the decay-
  // clear path nulls chain_aborted + abort_owner + cost_abort_at together.
  if (patch.abort_owner !== undefined) {
    const v = patch.abort_owner;
    merged.frontmatter.abort_owner = (v === null || v === '') ? null : String(v);
  }
  if (patch.cost_abort_at !== undefined) {
    const v = patch.cost_abort_at;
    merged.frontmatter.cost_abort_at = (v === null || v === '') ? null : String(v);
  }
  // F3 stale-marker: when a dispatch takes chain_aborted ownership it invalidates
  // any residual cost marker, so the cost decay-clear (which requires
  // abort_owner==='cost') can never fire against a dispatch abort. Runs AFTER the
  // explicit merge so the dispatch event is authoritative for ownership.
  if (patch.event === 'dispatch_chain_aborted') {
    merged.frontmatter.abort_owner = 'dispatch';
    merged.frontmatter.cost_abort_at = null;
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

  // v1.2.0-m1 Task 8 — orchestrator controller patch fields.
  // controller_session_id: UUID set by prepareDispatch, null on chain
  //   abort or successful merge. Accept any non-empty string but no
  //   format validation here (caller supplies UUID; loose here is safe
  //   because schema render only emits when non-null).
  // active_dispatch_count: integer ≥ 0. Watcher emits decrements as
  //   envelopes arrive; reclaimStale forces to 0 on chain abort.
  if (patch.controller_session_id !== undefined || patch.controllerSessionId !== undefined) {
    const v = patch.controller_session_id !== undefined
      ? patch.controller_session_id : patch.controllerSessionId;
    merged.frontmatter.controller_session_id = (v === null || v === '') ? null : String(v);
  }
  if (patch.active_dispatch_count !== undefined || patch.activeDispatchCount !== undefined) {
    const raw = patch.active_dispatch_count !== undefined
      ? patch.active_dispatch_count : patch.activeDispatchCount;
    const n = Number(raw);
    merged.frontmatter.active_dispatch_count = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
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
  let fd;
  try {
    fd = fs.openSync(lockFile, 'wx');
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    return false;
  }
  // fd is open — guarantee close even if writeSync throws (B#17). The old
  // open→write→close sequence leaked the fd when writeSync failed and re-threw.
  try {
    fs.writeSync(fd, String(process.pid) + '\n' + new Date().toISOString());
    return true;
  } finally {
    try { fs.closeSync(fd); } catch (_) { /* best-effort */ }
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
// dep_check_at is added because session-start.js calls update({depCheck})
// on every session boot. The semantic payload lives in dep_check_missing
// (which packages are missing) — dep_check_at is just timestamp self-bump.
// Including it in the hash dirtied STATE.md in `git status` every session.
const HASH_EXCLUDE_FRONTMATTER_KEYS = new Set(['updated_at', 'last_event_at', 'created_at', 'dep_check_at']);

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

// multi-session-work-loop M5 — 상태 변형의 단일 임계구역 (G1·G3).
//
// **호출자는 반드시 withStateLock 안에서 부른다.** update()와
// recordChainProgress()가 둘 다 이 함수를 거치므로 `writeStateAtomic` 호출부는
// 저장소 전체에서 여기 하나뿐이고, single-writer-lint.js 축 1이 그 사실을
// 정적으로 검사한다. 두 함수가 각자 write하던 이전 구조에서는 축 1이 자기
// 모듈 안에서 이미 거짓이었다.
//
// 공개 시그니처·렌더 바이트는 불변이다 (G3). 바뀌는 것은 `merged`를 어디서
// 얻는가 하나뿐 — 디스크 read-modify-write냐, 저널 투영이냐.
function applyLocked(repoRoot, patch) {
  const existing = readState(repoRoot);
  const target = statePath(repoRoot);
  const fileExisted = fs.existsSync(target);

  // DD6.1 — 마커 검사는 **락을 잡은 직후 가장 먼저** 수행되고 그 뒤에 분기가
  // 결정된다. 락 밖에서 보거나 분기 이후에 보면 두 프로세스가 서로 다른 모드로
  // 같은 STATE.md를 쓰는 창이 열린다. 락 자체는 여전히 advisory이므로(잔여 4)
  // 이 배치가 상호배제를 *만들지는* 않지만, 모드 판정과 쓰기가 같은 임계구역
  // 안에 있다는 것은 보장한다.
  //
  // lazy require인 이유 (I2): `project.js`가 top-level에서 이 모듈의
  // `mergeState`를 require하므로, 여기서 top-level로 저널을 require하면 CommonJS
  // 부분 초기화로 `mergeState`가 undefined가 된다.
  let journal = null;
  try {
    journal = require('../lib/state-journal').journalApply({
      repoRoot: repoRoot,
      patch: patch,
      existingState: existing,
    });
  } catch (err) {
    // 저널 모듈이 로드/실행 불가. 조용히 넘기면 "SoT는 저널"이라는 주장이 검증
    // 불가가 되므로 loud warn 후 직접 경로로 계속한다 (fail-loud-open).
    process.stderr.write('[mccp:state-writer] WARNING: state-journal unavailable (' +
      (err && err.message) + '); writing STATE.md directly\n');
    journal = null;
  }

  if (journal && journal.appendFailed) {
    // DD6.1 abort 표 3·4행. STATE.md는 **쓴다**(변형을 잃지 않는다) — 그 다음
    // degraded 마커를 남기고, 마커가 실패하면 throw한다. 되돌리지 않는 이유는
    // rollback이 *또 하나의 실패 가능한 write*이고, 이미 fs가 흔들리는 구간에서
    // 그것을 신뢰할 근거가 없기 때문이다.
    const merged = mergeState(existing, patch);
    const skip = fileExisted && contentHash(existing) === contentHash(merged);
    let writeError = null;
    if (!skip) {
      try { writeStateAtomic(repoRoot, merged); }
      catch (err) { writeError = err; }
    }
    const marker = require('./journal-store')
      .writeDegradedMarker(repoRoot, { reason: journal.reason });
    if (!marker.ok) {
      // **유일 throw 지점** (DD6.1 책임 2층 표). 보증하는 것은 "세션이 시끄럽게
      // 죽는다"가 아니라 둘이다: ① update()가 성공을 반환하지 않는다 ② 다음
      // 세션의 `journal verify` 추론 축이 반드시 잡는다.
      process.stderr.write('[mccp:state-writer] WARNING: journal append failed (' +
        journal.reason + ') AND the degraded marker could not be written (' +
        marker.reason + '). A downgrade that cannot be recorded must not be ' +
        'reported as success.\n');
      throw new Error('MCCP_JOURNAL_DEGRADED_UNRECORDED: ' + journal.reason +
        ' / marker: ' + marker.reason);
    }
    process.stderr.write('[mccp:state-writer] WARNING: journal append failed (' +
      journal.reason + ') — entering degraded mode. STATE.md is now the source of ' +
      'truth for this repo until `journal checkpoint --reseed` runs.\n');
    if (writeError) throw writeError;
    return skip ? existing : merged;
  }

  // enforce + 저널 정상 → 투영이 권위. off/shadow/degraded → 기존 직접 경로.
  const authoritative = !!(journal && journal.authoritative && journal.projected);
  const merged = authoritative ? journal.projected : mergeState(existing, patch);

  if (fileExisted && contentHash(existing) === contentHash(merged)) {
    // Content is semantically identical — only timestamps would change.
    // Skip disk write so STATE.md stays out of `git status`.
    //
    // 지연 레코드(admit-superseded / admit-post-tombstone)가 투영에서 배제되면
    // 재투영 결과가 이전과 같으므로 이 비교에서 write가 skip된다 — 부활 시도는
    // 파일 mtime조차 건드리지 못한다 (G2, Task 4 단언 d).
    return existing;
  }
  writeStateAtomic(repoRoot, merged);
  return merged;
}

function update(repoRoot, patch) {
  return withStateLock(repoRoot, function () {
    return applyLocked(repoRoot, patch || {});
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
    // M5 — 직접 write 대신 공용 임계구역을 거친다. 이미 락 안이므로
    // update()를 부르면 재진입이 되어 락 획득이 실패한다(fail-soft 경고 후
    // 무락 진행) — 그래서 applyLocked를 직접 부른다.
    applyLocked(repoRoot, { chain_progress: JSON.stringify(log) });
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
