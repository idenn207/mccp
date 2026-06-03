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

function update(repoRoot, patch) {
  return withStateLock(repoRoot, function () {
    const existing = readState(repoRoot);
    const merged = mergeState(existing, patch || {});
    writeStateAtomic(repoRoot, merged);
    return merged;
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
};
