'use strict';

// Dashboard Multi-Session M1 — derive `worktrees` count-source. Live cross-
// worktree progress scanner: enumerate `git worktree list --porcelain` and read
// each worktree's working-tree .claude/ (STATE.md + receipts) directly, so a
// dashboard opened from the parent repo or any sibling worktree sees every
// active worktree's branch / current gate / blocked state / last activity / self
// marker. gitignore-agnostic (reads uncommitted working-tree files), read-only,
// dep-free, loud fail-open.
//
// derive() is contracted spawn-free under a strict perf budget, so the git spawn
// sits behind an opt-in gate that mirrors host-version.js `allowGit`: the bare
// derive() call leaves it OFF (no spawn) and only render callers pass
// worktreeScan:true (cli.js render + renderer/trigger.js — Codex F1). The
// MCCP_MULTI_SESSION_SCAN env is the operator override (=1 force on, =0 kill).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const stateWriter = require('../../state/state-writer');
const { listReceipts, readReceipt } = require('../../receipt/store');
const mask = require('../mask');

const SCAN_TIMEOUT_MS = 3000;
const DEFAULT_CAP = 20;
const DEFAULT_ACTIVE_DAYS = 14;

// ── Task 1: pure porcelain parser ────────────────────────────────────────────

// Parse `git worktree list --porcelain`. Blocks are separated by blank lines;
// each block leads with a `worktree <path>` line. Pure string → array — no
// spawn, fixture-testable (parsing purity mirrors host-version.js's spawn-free
// regex extraction helpers).
function parseWorktreePorcelain(stdout) {
  if (typeof stdout !== 'string' || stdout.length === 0) return [];
  const blocks = stdout.replace(/\r\n/g, '\n').split(/\n[ \t]*\n+/);
  const out = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const wt = {
      path: null, head: null, branch: null,
      detached: false, bare: false, locked: false, prunable: false,
    };
    let sawWorktree = false;
    for (const line of lines) {
      if (line.indexOf('worktree ') === 0) {
        wt.path = line.slice('worktree '.length).trim();
        sawWorktree = true;
      } else if (line.indexOf('HEAD ') === 0) {
        wt.head = line.slice('HEAD '.length).trim();
      } else if (line.indexOf('branch ') === 0) {
        wt.branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '');
      } else if (line === 'detached') {
        wt.detached = true;
      } else if (line === 'bare') {
        wt.bare = true;
      } else if (line === 'locked' || line.indexOf('locked ') === 0) {
        wt.locked = true;
      } else if (line === 'prunable' || line.indexOf('prunable ') === 0) {
        wt.prunable = true;
      }
    }
    if (sawWorktree && wt.path) out.push(wt);
  }
  return out;
}

// ── Task 3: self / path normalization ────────────────────────────────────────

// Platform-independent worktree path normalization: path.resolve + win32 drive
// lowercase + realpath (symlink/junction) resolution with try/catch fallback.
// Mirrors state.js resolveSelfSessionId's path.resolve comparison and mask.js's
// Windows-drive case sensitivity.
function normalizeWorktreePath(p) {
  if (typeof p !== 'string' || p.length === 0) return null;
  let resolved;
  try {
    resolved = path.resolve(p);
  } catch (_e) {
    return null;
  }
  try {
    // realpath canonicalizes symlinks/junctions + filesystem casing. Prefer the
    // native (libuv) impl: on Windows it expands 8.3 short names (SKYPAR~1 →
    // skypark207) and fixes casing, which the JS impl does not — `git worktree
    // list` reports long-form paths, so without this a self-match against a
    // short-form cwd silently fails. Failure (worktree removed mid-scan) falls
    // back to the resolve() value — silent degrade per state.js precedent.
    const realpath = (fs.realpathSync && fs.realpathSync.native) || fs.realpathSync;
    resolved = realpath(resolved);
  } catch (_e) {
    /* keep resolve() value */
  }
  if (/^[A-Za-z]:/.test(resolved)) {
    resolved = resolved[0].toLowerCase() + resolved.slice(1);
  }
  return resolved;
}

// self is exactly the worktree whose normalized path === the (normalized)
// repoRoot derive was invoked against. 0 matches → all false (silent degrade,
// state.js mirror); never throws.
function isSelfWorktree(worktreePath, repoRoot) {
  const a = normalizeWorktreePath(worktreePath);
  const b = normalizeWorktreePath(repoRoot);
  if (!a || !b) return false;
  return a === b;
}

// ── Task 2: per-worktree progress derive ─────────────────────────────────────

function firstLine(s) {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (!t) return null;
  const line = t.split(/\r?\n/)[0].trim();
  return line || null;
}

function safeMtimeMs(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch (_e) {
    return null;
  }
}

// deriveWorktreeProgress — read one worktree's working-tree STATE.md + receipts
// into a progress projection. STATE read is DIAGNOSTIC (Codex F3): stateWriter
// .readState swallows missing / unreadable / unparseable / version-mismatch all
// into emptyState(), so a corrupt STATE would masquerade as "absent" (loud
// fail-open violation). Instead: existsSync first → absent is genuine; present
// → raw read + parseStateMd, and an unparseable result keeps the row
// (degraded:true + blocked_reason='state-unparseable') so receipts/other
// signals survive. authority: milestone_hint = STATE.md (git-tracked, trusted);
// current_gate/blocked = latest receipt (detailed, freshest) — different axes,
// not a conflict.
function deriveWorktreeProgress(worktreePath, repoRoot, opts) {
  opts = opts || {};
  const activeDays = (typeof opts.activeDays === 'number' && opts.activeDays > 0)
    ? opts.activeDays : DEFAULT_ACTIVE_DAYS;

  const progress = {
    state_present: false,
    state_parseable: false,
    milestone_hint: null,
    state_last_updated: null,
    current_gate: null,
    gate_converged: null,
    receipts: 0,
    blocked: false,
    blocked_reason: null,
    last_activity: null,
    has_signal: false,
    active: false,
    degraded: false,
    error: null,
  };

  // --- STATE.md diagnostic read (Codex F3) ---
  const statePath = path.join(worktreePath, '.claude', 'state', 'STATE.md');
  let stateMtimeMs = null;
  if (fs.existsSync(statePath)) {
    progress.state_present = true;
    let raw = null;
    try {
      raw = fs.readFileSync(statePath, 'utf8');
      stateMtimeMs = safeMtimeMs(statePath);
    } catch (err) {
      progress.degraded = true;
      progress.blocked_reason = 'state-unreadable';
      progress.error = mask.scrubAbsPaths((err && err.message) || String(err), repoRoot);
    }
    if (raw !== null) {
      const parsed = stateWriter.parseStateMd(raw);
      if (!parsed) {
        // present but corrupt / version-mismatch — NOT absent (F3). preserve row.
        progress.degraded = true;
        progress.blocked_reason = progress.blocked_reason || 'state-unparseable';
      } else {
        progress.state_parseable = true;
        const fm = parsed.frontmatter || {};
        const body = parsed.body || {};
        progress.state_last_updated = fm.updated_at || null;
        progress.milestone_hint = firstLine(body.goal)
          || firstLine(body.inProgress)
          || (Array.isArray(body.plan) && body.plan.length ? firstLine(body.plan[0]) : null)
          || null;
      }
    }
  }

  // --- receipts projection (latest by meta.created_at) ---
  let latest = null;
  let latestCreatedAt = null;
  let latestMtimeMs = null;
  try {
    const entries = listReceipts(worktreePath);
    progress.receipts = entries.length;
    for (const e of entries) {
      let receipt;
      try {
        receipt = readReceipt(worktreePath, e.gate_id, e.decision_id);
      } catch (_e) {
        progress.degraded = true;
        continue;
      }
      if (!receipt) continue;
      const createdAt = (receipt.meta && receipt.meta.created_at) || null;
      if (!latest || (createdAt && (!latestCreatedAt || createdAt > latestCreatedAt))) {
        latest = receipt;
        latestCreatedAt = createdAt;
        latestMtimeMs = safeMtimeMs(e.path);
      }
    }
  } catch (err) {
    progress.degraded = true;
    progress.error = progress.error
      || mask.scrubAbsPaths((err && err.message) || String(err), repoRoot);
  }

  if (latest) {
    const res = latest.resolution || {};
    const meta = latest.meta || {};
    progress.current_gate = latest.gate_id || null;
    progress.gate_converged = (typeof res.converged === 'boolean') ? res.converged : null;
    if (res.converged === false) {
      progress.blocked = true;
      progress.blocked_reason = progress.blocked_reason
        || ('gate ' + (latest.gate_id || '?') + ' not converged');
    } else if (meta.advisory === true) {
      progress.blocked = true;
      progress.blocked_reason = progress.blocked_reason
        || ('advisory receipt at ' + (latest.gate_id || '?'));
    }
  }

  // fix-task.md presence is an independent blocked signal.
  const fixTaskPath = path.join(worktreePath, '.claude', 'state', 'fix-task.md');
  if (fs.existsSync(fixTaskPath)) {
    progress.blocked = true;
    progress.blocked_reason = progress.blocked_reason || 'fix-task.md present';
  }

  // --- recency ---
  const mtimes = [stateMtimeMs, latestMtimeMs].filter((m) => typeof m === 'number');
  if (mtimes.length) {
    progress.last_activity = new Date(Math.max.apply(null, mtimes)).toISOString();
  }
  progress.has_signal = progress.state_present || progress.receipts > 0;
  if (progress.has_signal && progress.last_activity) {
    const ageMs = Date.now() - new Date(progress.last_activity).getTime();
    progress.active = ageMs <= activeDays * 24 * 60 * 60 * 1000;
  }

  return progress;
}

// ── Task 4: scanner facade + spawn gate ──────────────────────────────────────

function parseCap(opts) {
  if (opts && typeof opts.cap === 'number' && opts.cap > 0) return opts.cap;
  const env = process.env.MCCP_WORKTREE_SCAN_CAP;
  if (env) {
    const n = parseInt(env, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_CAP;
}

function parseActiveDays(opts) {
  if (opts && typeof opts.activeDays === 'number' && opts.activeDays > 0) return opts.activeDays;
  const env = process.env.MCCP_WORKTREE_ACTIVE_DAYS;
  if (env) {
    const n = parseInt(env, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_ACTIVE_DAYS;
}

function offShape() {
  return {
    ok: true, count: 0, items: [], invalid_count: 0,
    degraded: false, error: null, scanned: false, self_path: null, truncated: false,
  };
}

// scanWorktrees — gated facade. gate on := (opts.worktreeScan===true OR
// MCCP_MULTI_SESSION_SCAN==='1') AND MCCP_MULTI_SESSION_SCAN!=='0'. off → no-op
// off-shape (no spawn, perf-budget safe). on → execFileSync git +
// per-worktree progress, with per-worktree fail-open (error row preserved, NOT
// dropped — PRD OQ#5) and all error/warning strings scrubbed of outside-root
// absolute paths (Codex F2). bare/locked/prunable surfaced; bare excluded from
// progress rows.
function scanWorktrees(repoRoot, opts) {
  opts = opts || {};
  const root = path.resolve(repoRoot);

  const envScan = process.env.MCCP_MULTI_SESSION_SCAN;
  const killSwitch = envScan === '0';
  const optIn = opts.worktreeScan === true || envScan === '1';

  if (killSwitch && opts.worktreeScan === true) {
    process.stderr.write('[mccp:worktrees] MCCP_MULTI_SESSION_SCAN=0 kill-switch '
      + 'overrides worktreeScan opt-in; skipping scan\n');
  }
  if (!optIn || killSwitch) return offShape();

  let stdout;
  try {
    stdout = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: SCAN_TIMEOUT_MS,
    });
  } catch (err) {
    // loud fail-open — degrade, never abort derive. scrub sibling/parent abs
    // paths the spawn error may embed (Codex F2).
    return {
      ok: true, count: 0, items: [], invalid_count: 0,
      degraded: true,
      error: mask.scrubAbsPaths((err && err.message) || String(err), root),
      scanned: true, self_path: null, truncated: false,
    };
  }

  const parsedAll = parseWorktreePorcelain(stdout).filter((w) => !w.bare);
  const cap = parseCap(opts);
  const activeDays = parseActiveDays(opts);
  let parsed = parsedAll;
  let truncated = false;
  if (parsedAll.length > cap) {
    truncated = true;
    parsed = parsedAll.slice(0, cap);
    // review M2 — never truncate out the self worktree (the anchor row of a
    // multi-session view, and the one most likely to matter to the operator who
    // opened the dashboard). If self sorts past the cap, swap it into the last
    // retained slot so is_self/self_path survive the cap. The primary
    // (index 0 = is_main) stays at the front for any cap >= 2, so is_main
    // ordering is preserved; only the degenerate cap=1 prefers self over main.
    const selfIdx = parsedAll.findIndex((w) => isSelfWorktree(w.path, root));
    if (selfIdx >= cap) {
      parsed = parsed.slice(0, cap - 1).concat(parsedAll[selfIdx]);
    }
    process.stderr.write('[mccp:worktrees] scan truncated to ' + cap + ' of '
      + parsedAll.length + ' worktrees (MCCP_WORKTREE_SCAN_CAP)\n');
  }

  const items = [];
  let degraded = false;
  let selfPath = null;
  let mainAssigned = false;

  for (const w of parsed) {
    const isMain = !mainAssigned; // git lists the primary worktree first
    mainAssigned = true;
    const base = {
      path: w.path,
      branch: w.branch,
      head: w.head,
      detached: !!w.detached,
      locked: !!w.locked,
      prunable: !!w.prunable,
      is_self: false,
      is_main: isMain,
    };
    let item;
    try {
      base.is_self = isSelfWorktree(w.path, root);
      if (base.is_self) selfPath = w.path;
      const progress = deriveWorktreeProgress(w.path, root, { activeDays });
      item = Object.assign(base, progress);
      if (progress.degraded) degraded = true;
    } catch (err) {
      // per-worktree exception → error row preserved (PRD OQ#5, fail-open
      // visibility), NOT dropped. error scrubbed of outside-root paths (F2).
      degraded = true;
      item = Object.assign(base, {
        degraded: true,
        error: mask.scrubAbsPaths((err && err.message) || String(err), root),
      });
    }
    items.push(item);
  }

  const invalidCount = items.filter((it) => it && it.degraded).length;
  const result = {
    ok: true,
    count: items.length,
    items,
    invalid_count: invalidCount,
    degraded,
    error: null,
    scanned: true,
    self_path: selfPath,
    truncated,
  };
  if (truncated) {
    result.warning = 'worktree scan truncated to ' + cap + ' of '
      + parsedAll.length + ' worktrees (cap via MCCP_WORKTREE_SCAN_CAP)';
  }
  return result;
}

module.exports = {
  scanWorktrees,
  parseWorktreePorcelain,
  deriveWorktreeProgress,
  isSelfWorktree,
  normalizeWorktreePath,
};
