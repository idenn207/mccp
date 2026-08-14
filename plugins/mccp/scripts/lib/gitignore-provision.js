'use strict';

// gitignore-provision — idempotently merge mccp's runtime ignore rules into a
// target repository's .gitignore.
//
// Ownership (DD2): MCCP_IGNORE_BLOCK below is the canonical list. It is never
// derived at runtime from this repo's own .gitignore — that would leak
// repo-specific rules into every install. A bidirectional drift lint
// (tests/gitignore-provision.test.js) + a dedicated CI workflow keep the two in
// sync; the lint is the mechanism, not human memory.
//
// Error contract (DD1) — the two layers are deliberately different models:
//   - planMerge / applyMerge / buildBlock  -> THROW (ProvisionError)
//   - resolveRepoRoot / detectTrackedPollution -> detection, never throw,
//     return a sentinel instead
//   - the CLI wraps everything in try/catch: success exit 0, failure exit 1.
//     `not-a-git-repo` is NOT a failure — it is a normal skip at exit 0 (UI5).
//
// `reason` is a CLOSED enum (REASONS). Every anticipated failure is converted
// into a ProvisionError carrying one of those values, and the CLI maps any
// non-ProvisionError exception to `internal-error`. Without that mapping the
// protocol value a consumer branches on would be an OS/Node-specific message
// string that differs per machine.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const BEGIN_MARKER = '# >>> mccp runtime artifacts — managed by /mccp:setup >>>';
const END_MARKER = '# <<< mccp runtime artifacts — managed by /mccp:setup <<<';

// Closed reason enum. A value outside this set never reaches stdout.
const REASONS = Object.freeze({
  NOT_A_GIT_REPO: 'not-a-git-repo',
  GIT_UNAVAILABLE: 'git-unavailable',
  GIT_ERROR: 'git-error',
  MARKER_DAMAGED: 'marker-damaged',
  CONCURRENT_MODIFICATION: 'concurrent-modification',
  LOCK_TIMEOUT: 'lock-timeout',
  SYMLINK_TARGET: 'symlink-target',
  INTERNAL_ERROR: 'internal-error',
});
const REASON_VALUES = Object.freeze(Object.keys(REASONS).map((k) => REASONS[k]));

class ProvisionError extends Error {
  constructor(reason, message, detail) {
    super(message);
    this.name = 'ProvisionError';
    this.reason = reason;
    this.detail = detail === undefined ? null : detail;
  }
}

// Canonical block, comments included. ORDER IS LOAD-BEARING inside the receipt
// group: the negation must follow the ignore, and the lock/tmp re-ignores must
// follow the negation. The comments ship with the block because they are the
// only channel that carries that invariant to whoever reads the installed file.
const MCCP_IGNORE_BLOCK = [
  '# Receipt chain — plan/implement receipts are session diagnostics (working-tree',
  '# only); ship receipts (mccp-pr-codex) are the audit corpus and stay tracked.',
  '# ORDER IS LOAD-BEARING: the negation must follow the ignore, and the lock/tmp',
  '# re-ignores must follow the negation.',
  '.claude/receipts/*',
  '!.claude/receipts/mccp-pr-codex/',
  '.claude/receipts/mccp-pr-codex/*.lock',
  '.claude/receipts/mccp-pr-codex/*.tmp',
  '',
  '# Session-local counters and advisory locks. STATE.md / fix-task.md stay tracked.',
  '.claude/state/loop-counter.json',
  '.claude/state/orchestration-runaway.json',
  '.claude/state/*.lock',
  '',
  '# completion-ledger entries ARE tracked; only the per-entry lock/tmp are local.',
  '# The single-level glob above does not reach this subdir.',
  '.claude/state/completion-ledger/*.lock',
  '.claude/state/completion-ledger/*.tmp',
  '',
  '# Per-session runtime state — never committed.',
  '.claude/state/evidence-claims/',
  '.claude/state/dispatches/',
  '.claude/state/plan-review/',
  '.claude/state/session-ledgers/',
  '.claude/state/msw-events/',
  '.claude/state/codex-stop-loop-input.txt',
  '.claude/state/auto-handoff-log.jsonl',
  '.claude/state/m3-friction-events.jsonl',
  '.claude/state/hook-caps.json',
  '.claude/state/*.env-snapshot.json',
  '.claude/state/*.handoff-items.json',
  '',
  '# hook-trace shards. NOT root-anchored: a hook whose cwd is a nested package',
  "# writes its shards under that package's own .claude/.",
  '**/.claude/state/hook-trace/',
  '',
  '# derive cache — per-session/per-machine.',
  '.claude/cache/',
  '',
  '# ultracode delegation sidecar journal (per-task local audit).',
  '*.delegations.jsonl',
  '',
  '# impeccable tool byproducts. design.json is the shared design-direction config.',
  '.impeccable/*',
  '!.impeccable/design.json',
  '',
  '# mccp worktree convention (CLAUDE.md §3.8).',
  '.worktrees/',
  '',
  "# This provisioner's own byproducts. The advisory lock and the atomic tmp are",
  '# transient, but a crash leaves them behind; the .bak persists by',
  '# design and is a verbatim copy of the pre-run file. A tool whose purpose is to',
  '# keep runtime artifacts out of git must not exempt its own.',
  '.gitignore.lock',
  '.gitignore.bak',
  '.gitignore.*.tmp',
];

// Entries this repo carries that are deliberately NOT shipped to target repos,
// each with the reason it stays behind. Kept as data (not a comment) so the
// drift lint can assert `canonical ∩ REPO_ONLY === ∅`.
const REPO_ONLY = Object.freeze([
  { entry: 'node_modules/', reason: 'generic Node rule — not an mccp runtime artifact' },
  { entry: '*.log', reason: 'generic Node rule — not an mccp runtime artifact' },
  { entry: 'npm-debug.log*', reason: 'generic Node rule — not an mccp runtime artifact' },
  { entry: 'yarn-debug.log*', reason: 'generic Node rule — not an mccp runtime artifact' },
  { entry: 'yarn-error.log*', reason: 'generic Node rule — not an mccp runtime artifact' },
  { entry: 'Thumbs.db', reason: 'OS artifact — unrelated to mccp' },
  { entry: '.DS_Store', reason: 'OS artifact — unrelated to mccp' },
  { entry: 'Desktop.ini', reason: 'OS artifact — unrelated to mccp' },
  { entry: '*.stackdump', reason: 'OS artifact — unrelated to mccp' },
  { entry: '.vscode/', reason: 'IDE — unrelated to mccp' },
  { entry: '.idea/', reason: 'IDE — unrelated to mccp' },
  { entry: '*.swp', reason: 'IDE — unrelated to mccp' },
  { entry: '*.swo', reason: 'IDE — unrelated to mccp' },
  { entry: 'dist/', reason: 'build output — mccp has no build step' },
  { entry: 'build/', reason: 'build output — mccp has no build step' },
  { entry: '*.tsbuildinfo', reason: 'build output — mccp has no build step' },
  { entry: '.env', reason: "generic secret hygiene — the target repo's policy, not mccp's to set" },
  { entry: '.env.local', reason: "generic secret hygiene — the target repo's policy, not mccp's to set" },
  { entry: '.claude/settings.local.json', reason: 'generic Claude Code file — not an mccp runtime artifact' },
  { entry: 'ECC/', reason: "this repo's fork seed checkout — repo-specific" },
  { entry: '.claude/state/dogfood-*/', reason: "this repo's test fixtures/sandboxes — repo-specific" },
]);

// ---------------------------------------------------------------------------
// Parsing / block location
// ---------------------------------------------------------------------------

// Shared by the drift lint AND the merge oracle so the two can never disagree
// about what counts as an entry.
//
// Inline `#` is NOT stripped: per the gitignore spec `#` starts a comment only
// as the first character of a line; elsewhere it is a literal. Trimming inline
// would corrupt valid patterns.
function parseEntries(text) {
  if (typeof text !== 'string') return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

const MCCP_IGNORE_ENTRIES = Object.freeze(parseEntries(MCCP_IGNORE_BLOCK.join('\n')));

// Segment the text the same way `split(/\r?\n/)` does — same count, same line
// text — but keep each line's own terminator alongside it. The update splice
// needs that to put the user's lines back byte-for-byte; a lone \r is NOT a
// separator here, matching the split the rest of this module uses.
function splitPreservingEol(text) {
  const segs = [];
  const re = /\r?\n/g;
  let start = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    segs.push({ text: text.slice(start, m.index), eol: m[0] });
    start = re.lastIndex;
  }
  segs.push({ text: text.slice(start), eol: '' });
  return segs;
}

// Single adjudicator shared by stripManagedBlock and planMerge (they used to
// interpret damaged input differently).
//
// Matching is strict — counts, not "first BEGIN + next END". The loose rule
// swallows user lines: given [orphan BEGIN, ...user lines..., BEGIN, block,
// END], the span between the first BEGIN and the first END contains the user's
// lines wholesale, and replacing that span breaks UI2.
function locateManagedBlock(lines) {
  const beginIdxs = [];
  const endIdxs = [];
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === BEGIN_MARKER) beginIdxs.push(i);
    else if (trimmed === END_MARKER) endIdxs.push(i);
  }
  if (beginIdxs.length === 0 && endIdxs.length === 0) return { state: 'absent' };
  if (beginIdxs.length === 1 && endIdxs.length === 1 && endIdxs[0] > beginIdxs[0]) {
    return { state: 'wellFormed', beginIdx: beginIdxs[0], endIdx: endIdxs[0] };
  }
  return {
    state: 'damaged',
    detail:
      'BEGIN markers: ' + beginIdxs.length + ', END markers: ' + endIdxs.length +
      (beginIdxs.length === 1 && endIdxs.length === 1 ? ' (END precedes BEGIN)' : ''),
  };
}

// Read-only, and deliberately conservative in the opposite direction from
// planMerge: on damaged input it returns the text unchanged. Deleting lines
// here would make the drift lint see a smaller set than reality and pass
// silently; refusing to write there is what keeps the file safe.
function stripManagedBlock(text) {
  if (typeof text !== 'string') return '';
  const eol = text.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const located = locateManagedBlock(lines);
  if (located.state !== 'wellFormed') return text;
  const kept = lines.slice(0, located.beginIdx).concat(lines.slice(located.endIdx + 1));
  return kept.join(eol);
}

// ---------------------------------------------------------------------------
// Version + block construction
// ---------------------------------------------------------------------------

const DEFAULT_PLUGIN_JSON = path.join(__dirname, '..', '..', '.claude-plugin', 'plugin.json');

// Read lazily (not at module load) so tests can point at a missing/corrupt file
// and assert the throw -> exit 1 path. Writing a block without knowing the real
// version would make the marker's version comment a lie, and DD4-Q4 rests
// entirely on that comment being true.
function readPluginVersion(pluginJsonPath) {
  const target = pluginJsonPath || DEFAULT_PLUGIN_JSON;
  let raw;
  try {
    raw = fs.readFileSync(target, 'utf8');
  } catch (err) {
    throw new ProvisionError(
      REASONS.INTERNAL_ERROR,
      'cannot read plugin.json for version: ' + err.message,
      target
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ProvisionError(
      REASONS.INTERNAL_ERROR,
      'plugin.json is not valid JSON: ' + err.message,
      target
    );
  }
  if (!parsed || typeof parsed.version !== 'string' || parsed.version.length === 0) {
    throw new ProvisionError(REASONS.INTERNAL_ERROR, 'plugin.json has no version field', target);
  }
  return parsed.version;
}

function buildBlock(version) {
  if (typeof version !== 'string' || version.length === 0) {
    throw new ProvisionError(REASONS.INTERNAL_ERROR, 'buildBlock requires a version string');
  }
  // The "do not edit here" line ships INSIDE the block on purpose. `update`
  // rebuilds the whole marker span, so a rule a user adds between the markers is
  // replaced on the next run. That is the definition of a managed block, not a
  // defect — preserving arbitrary in-block lines would make the block
  // unmaintainable — but "managed by" alone does not tell a reader that their
  // edit will not survive. The warning is the only channel that reaches the
  // person about to make that mistake, and the .bak is their recovery if they do.
  return [
    BEGIN_MARKER,
    '# managed by /mccp:setup (mccp ' + version + ')',
    '# Lines between these markers are REPLACED on the next /mccp:setup run.',
    '# Put your own rules OUTSIDE the markers — everything out there is preserved.',
  ]
    .concat(MCCP_IGNORE_BLOCK)
    .concat([END_MARKER]);
}

function sha256(text) {
  return 'sha256:' + crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Merge oracle (pure)
// ---------------------------------------------------------------------------

function planMerge(options) {
  const opts = options || {};
  const content = opts.content === undefined ? null : opts.content;
  const version = opts.version;
  const blockLines = buildBlock(version);

  if (content === null) {
    const eol = '\n';
    return {
      action: 'create',
      nextContent: blockLines.join(eol) + eol,
      addedLines: blockLines.slice(),
      eol,
      sourceHash: null,
    };
  }

  const eol = content.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const sourceHash = sha256(content);
  const lines = content.split(/\r?\n/);
  const located = locateManagedBlock(lines);

  if (located.state === 'damaged') {
    // Not degraded to append. Appending would leave the orphan marker in place
    // AND add a second block, so the next run's input is damaged for good, and
    // every run adds one more block. Reading and stopping is the only safe
    // response to "a human edited the marker lines".
    throw new ProvisionError(
      REASONS.MARKER_DAMAGED,
      'managed block markers are damaged (' + located.detail + '). ' +
        'Delete the orphan marker line(s) from .gitignore and re-run.',
      located.detail
    );
  }

  if (located.state === 'absent') {
    const trailing = content.length === 0 || content.endsWith('\n') ? '' : eol;
    // The blank separator line belongs between the user's content and the
    // block. An existing-but-empty file has no content to separate from, and
    // emitting it there made `append` produce a leading blank line while
    // `create` — the same outcome reached from a missing file — did not. Two
    // paths that describe the same end state must agree on the bytes.
    const separator = content.length === 0 ? '' : eol;
    const payload = trailing + separator + blockLines.join(eol) + eol;
    return {
      action: 'append',
      nextContent: content + payload,
      appendPayload: payload,
      addedLines: blockLines.slice(),
      eol,
      sourceHash,
    };
  }

  // Spliced on the ORIGINAL text, not rebuilt from a line array. Splitting on
  // /\r?\n/ and re-joining with one detected `eol` rewrites the terminator of
  // every line in the file, so a file with mixed endings came back normalized —
  // including the lines OUTSIDE the managed block, which are the user's bytes.
  // That was survivable while the rewrite needed an explicit flag; now that
  // `update` runs on a normal setup it would silently touch user-owned content
  // on every canonical change, which is exactly what UI2 forbids.
  //
  // Each segment keeps the terminator it came with; only the block's own lines
  // are joined with the detected eol, because those lines are ours.
  const segs = splitPreservingEol(content);
  const prefix = segs.slice(0, located.beginIdx).map((s) => s.text + s.eol).join('');
  const suffix = segs.slice(located.endIdx + 1).map((s) => s.text + s.eol).join('');
  // The END marker's own terminator carries over. It is '' only when the marker
  // is the final line with no trailing newline, and in that case the suffix is
  // empty too — so the file keeps its unterminated last line rather than gaining
  // a newline the user never wrote.
  const nextContent = prefix + blockLines.join(eol) + segs[located.endIdx].eol + suffix;
  if (nextContent === content) {
    return { action: 'noop', nextContent: content, addedLines: [], eol, sourceHash };
  }
  return { action: 'update', nextContent, addedLines: blockLines.slice(), eol, sourceHash };
}

// ---------------------------------------------------------------------------
// Advisory lock — <target>.lock
// ---------------------------------------------------------------------------
//
// Mirrors the pr-phase.lock / quarantine.lock model from CLAUDE.md §3.6:
// 60s lease + PID-alive tri-state + heartbeat. It deliberately does NOT use the
// evidence write lock's 5s lease — that value is for millisecond-scale critical
// sections, and here it would let a second writer reclaim the lock of a live
// writer merely stalled by a slow disk or a virus scanner, putting both into
// the backup/rename path at once.
//
// Serialization covers create/append/update alike. A missing lock on `append`
// lets two processes both observe `absent` and each append a block, leaving the
// file permanently `damaged` — append-only does not destroy, but it does
// duplicate, and the post-append recount detects that only after both have
// written.
//
// Known limitation (accepted, low risk): a PID can be reused between the old
// owner's death and this check. Reclaim would then be refused until the lease
// expires. The lock is per-target, so this needs the same PID AND the same
// repository AND the same instant to coincide.

const LOCK_LEASE_MS = 60 * 1000;
const LOCK_WAIT_MS = 10 * 1000;
const LOCK_POLL_MS = 50;

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err && err.code === 'EPERM';
  }
}

function readLockBody(lockPath) {
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_err) {
    return null;
  }
}

// The pair (token, mtimeMs) is what makes one observation of the lock file
// distinguishable from another. mtimeMs alone would miss a same-instant
// replacement; token alone would miss a heartbeat, and a heartbeat is exactly
// the signal that says "do not reclaim".
function lockIdentity(lockPath) {
  let stat;
  try {
    stat = fs.statSync(lockPath);
  } catch (_err) {
    return null;
  }
  const body = readLockBody(lockPath);
  return {
    mtimeMs: stat.mtimeMs,
    token: body && typeof body.token === 'string' ? body.token : null,
  };
}

function lockIsReclaimable(lockPath, nowMs) {
  const identity = lockIdentity(lockPath);
  if (!identity) return { reclaimable: true, identity: null }; // vanished between EEXIST and here
  const ageMs = nowMs - identity.mtimeMs;
  const body = readLockBody(lockPath);
  const verdict = (reclaimable) => ({ reclaimable, identity });
  if (!body) return verdict(ageMs > LOCK_LEASE_MS); // zero-byte / unparsable: lease only
  const sameHost = body.host === os.hostname();
  if (sameHost && isPidAlive(body.pid)) return verdict(false); // tri-state: never reclaim
  if (sameHost) return verdict(true); // owner is dead
  return verdict(ageMs > LOCK_LEASE_MS); // cross-host: liveness is unknowable, lease rules
}

// Re-verify the identity that was judged, immediately before unlinking.
// Without this, two processes can both judge the SAME stale lock reclaimable;
// the faster one unlinks it and creates its own, and the slower one's unlink
// then deletes that fresh lock — putting both inside the critical section,
// which is the one outcome this lock exists to prevent. `judged === null`
// (the file was gone at judgement time) never unlinks: whatever is there now
// is somebody else's.
function reclaimLock(lockPath, judged) {
  if (!judged) return false;
  const current = lockIdentity(lockPath);
  if (!current) return true; // already gone; the retry will win it with wx
  if (current.token !== judged.token || current.mtimeMs !== judged.mtimeMs) return false;
  try {
    fs.unlinkSync(lockPath);
    return true;
  } catch (_err) {
    return false;
  }
}

// A real synchronous sleep. The previous spin loop burned a full core for the
// entire wait, and the wait is bounded by waitMs (10s by default, and higher
// when the env override raises it) — not by the millisecond-scale critical
// section the old comment cited.
const SLEEP_SIGNAL = new Int32Array(new SharedArrayBuffer(4));
function sleepSync(ms) {
  if (!(ms > 0)) return;
  Atomics.wait(SLEEP_SIGNAL, 0, 0, ms);
}

// `0` is a legitimate value (fail fast instead of waiting), so it cannot be
// filtered through `||` — that turns an explicit "do not wait" into the 10s
// default, which is the opposite instruction.
function resolveWaitMs(optWaitMs) {
  if (Number.isFinite(optWaitMs) && optWaitMs >= 0) return optWaitMs;
  const raw = process.env.MCCP_GITIGNORE_LOCK_WAIT_MS;
  if (raw !== undefined && raw !== '') {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return LOCK_WAIT_MS;
}

function acquireLock(lockPath, options) {
  const opts = options || {};
  // The exclusive create below already refuses to follow a symlink — O_EXCL
  // fails with EEXIST on one, even a dangling one, so nothing is ever written
  // through the link. But EEXIST is this loop's "somebody holds the lock"
  // signal, so without this check a symlinked lock path spins out the whole
  // wait and then blames a live writer that does not exist. Naming the real
  // condition is the fix; the write itself was never the exposure.
  assertNotSymlink(lockPath);
  const waitMs = resolveWaitMs(opts.waitMs);
  const token = crypto.randomUUID();
  const body = JSON.stringify({ token, pid: process.pid, host: os.hostname(), acquired_at: new Date().toISOString() });
  const deadline = Date.now() + waitMs;

  for (;;) {
    try {
      fs.writeFileSync(lockPath, body, { flag: 'wx', mode: 0o600 });
      return token;
    } catch (err) {
      if (!err || err.code !== 'EEXIST') {
        throw new ProvisionError(REASONS.INTERNAL_ERROR, 'cannot create lock: ' + err.message, lockPath);
      }
      // EEXIST is a wait signal, not an error.
      const verdict = lockIsReclaimable(lockPath, Date.now());
      if (verdict.reclaimable && reclaimLock(lockPath, verdict.identity)) continue;
      if (Date.now() >= deadline) {
        throw new ProvisionError(
          REASONS.LOCK_TIMEOUT,
          'timed out after ' + waitMs + 'ms waiting for ' + lockPath +
            ' (held by a live writer). Re-run once the other /mccp:setup finishes.',
          lockPath
        );
      }
      sleepSync(LOCK_POLL_MS);
    }
  }
}

// Heartbeat. The critical section here is milliseconds, so one refresh before
// the write is enough; a timer would never fire inside synchronous fs calls.
function touchLock(lockPath) {
  try {
    const now = new Date();
    fs.utimesSync(lockPath, now, now);
  } catch (_err) { /* best effort */ }
}

function releaseLock(lockPath, token) {
  const body = readLockBody(lockPath);
  if (!body || body.token !== token) return false; // not ours — leave it to lease reclaim
  try {
    fs.unlinkSync(lockPath);
    return true;
  } catch (_err) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

function readTargetContent(target) {
  try {
    return fs.readFileSync(target, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw new ProvisionError(REASONS.INTERNAL_ERROR, 'cannot read ' + target + ': ' + err.message, target);
  }
}

// Node's fs follows symlinks. If .gitignore is a symlink an attacker pre-placed,
// append-only ('a') and the block-replacing rewrite would both act on the link's
// target. There is no legitimate shape in which .gitignore is a symlink, so we
// refuse rather than compute a "safe" boundary — the allow-check would itself be
// new attack surface.
//
// The same reasoning covers every path this module writes, not just the target:
// `.gitignore.lock` and `.gitignore.bak` are equally deterministic, so they are
// equally pre-placeable, and the guard is only worth its name if it is applied
// uniformly. The tmp path is the one exception — pid + nonce means an attacker
// cannot name it in advance — and it is written exclusively anyway.
// The append open carries O_NOFOLLOW so the refusal is atomic with the write
// rather than a check the write trusts. Windows does not define the flag, where
// it degrades to the lstat alone — and there creating a symlink takes a
// privilege or Developer Mode in the first place.
const APPEND_FLAGS =
  fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND | (fs.constants.O_NOFOLLOW || 0);

function assertNotSymlink(target) {
  let st;
  try {
    st = fs.lstatSync(target);
  } catch (err) {
    if (err && err.code === 'ENOENT') return;
    throw new ProvisionError(REASONS.INTERNAL_ERROR, 'cannot stat ' + target + ': ' + err.message, target);
  }
  if (st.isSymbolicLink()) {
    throw new ProvisionError(
      REASONS.SYMLINK_TARGET,
      target + ' is a symbolic link. Refusing to write through it.',
      target
    );
  }
}

function countMarkerPairs(text) {
  const lines = text.split(/\r?\n/);
  const located = locateManagedBlock(lines);
  return located.state === 'wellFormed' ? 1 : located.state === 'absent' ? 0 : 2;
}

function applyMerge(target, plan, options) {
  const opts = options || {};
  const lockPath = opts.lockPath || target + '.lock';
  assertNotSymlink(target);
  touchLock(lockPath);

  if (plan.action === 'noop') {
    return { written: false, backupPath: null };
  }

  if (plan.action === 'create') {
    // 'wx', not 'a': the plan was made against a missing file, and 'a' would
    // happily append the empty-file-derived block onto whatever another process
    // created in the meantime.
    try {
      fs.writeFileSync(target, plan.nextContent, { flag: 'wx', mode: 0o644 });
    } catch (err) {
      if (err && err.code === 'EEXIST') {
        throw new ProvisionError(
          REASONS.CONCURRENT_MODIFICATION,
          target + ' appeared after the merge was planned. Re-run to merge into it.',
          target
        );
      }
      throw new ProvisionError(REASONS.INTERNAL_ERROR, 'cannot create ' + target + ': ' + err.message, target);
    }
    return { written: true, backupPath: null };
  }

  if (plan.action === 'append') {
    // Append-only: existing bytes are never read back and rewritten, so there is
    // nothing for a concurrent edit to lose (UI2 as a structural property, not a
    // defended one). Whenever the file has content the payload starts with a
    // newline, so BEGIN_MARKER begins its own line even if the last line was
    // unterminated; an empty file has no such line to terminate.
    //
    // Opened explicitly rather than handed to appendFileSync so O_NOFOLLOW can
    // ride along. The lstat above is a check-then-use, and 'a' follows a symlink
    // swapped in after it; making the open itself refuse is the difference
    // between closing that window and narrowing it.
    let fd;
    try {
      fd = fs.openSync(target, APPEND_FLAGS, 0o644);
    } catch (err) {
      if (err && (err.code === 'ELOOP' || err.code === 'EMLINK')) {
        throw new ProvisionError(
          REASONS.SYMLINK_TARGET,
          target + ' became a symbolic link after it was checked. Refusing to append through it.',
          target
        );
      }
      throw new ProvisionError(REASONS.INTERNAL_ERROR, 'cannot append to ' + target + ': ' + err.message, target);
    }
    // Where the file ended before we touched it. The rollback below needs a
    // length, not a flag: a failure part-way through leaves real bytes on disk.
    let originalSize = null;
    let fdOpen = true;
    try {
      originalSize = fs.fstatSync(fd).size;
    } catch (_err) { /* cannot measure — rollback degrades to best effort */ }
    const writeAll = (opts.deps && opts.deps.writeFileSync) || fs.writeFileSync;
    try {
      // writeFileSync, not writeSync: a bare writeSync returns a byte count and
      // is not guaranteed to consume the whole buffer, so a short write would
      // append a TRUNCATED managed block. The marker recount below would catch
      // it but cannot roll it back — the bytes are already in the user's file.
      // appendFileSync used to supply that loop for free; taking the descriptor
      // to carry O_NOFOLLOW meant taking the loop back too. Passing an fd here
      // writes it all and leaves closing to the caller.
      writeAll(fd, plan.appendPayload);
    } catch (err) {
      // Roll the file back to where it started. writeFileSync retries short
      // writes, but a genuine failure part-way (ENOSPC, quota, I/O error) still
      // leaves the bytes it did manage to write. Those bytes contain an orphan
      // BEGIN marker, which makes every later run fail `marker-damaged` and
      // demands manual repair — a transient disk-full turning into a permanently
      // stuck file. Truncating to the pre-append length makes the failure a
      // no-op on disk, which is what lets the user simply re-run.
      //
      // Descriptor first, path second: ftruncate on an O_APPEND descriptor is
      // EPERM on Windows (measured), and the path form works there. The fallback
      // reopens by name, so it is the weaker of the two — but the alternative is
      // leaving the orphan marker, and the not-a-symlink check already ran.
      if (originalSize !== null) {
        let rolledBack = false;
        try {
          fs.ftruncateSync(fd, originalSize);
          rolledBack = true;
        } catch (_e) { /* fall through to the path form */ }
        if (!rolledBack) {
          // Close BEFORE the path truncate, and mark it closed so the finally
          // does not close a second time — a stale double-close can land on an
          // unrelated descriptor once the number is reused.
          try { fs.closeSync(fd); fdOpen = false; } catch (_e) {}
          try { fs.truncateSync(target, originalSize); } catch (_e) { /* best effort */ }
        }
      }
      throw new ProvisionError(REASONS.INTERNAL_ERROR, 'cannot append to ' + target + ': ' + err.message, target);
    } finally {
      if (fdOpen) {
        try { fs.closeSync(fd); } catch (_e) {}
      }
    }
    // Second safety net, against writers that do not honour our lock.
    const after = readTargetContent(target);
    if (after !== null && countMarkerPairs(after) !== 1) {
      throw new ProvisionError(
        REASONS.MARKER_DAMAGED,
        target + ' now holds more than one managed block (a concurrent writer appended too). ' +
          'Delete the duplicate block and re-run.',
        target
      );
    }
    return { written: true, backupPath: null };
  }

  // The one path that rewrites the whole file. Asserted rather than assumed: an
  // unrecognized action falling through into a whole-file rewrite is the worst
  // possible default. The rewrite carries every line outside the managed block
  // over unchanged — that is what lets it run without a separate consent flag,
  // and it is also why the assertion above it has to be exact.
  if (plan.action !== 'update') {
    throw new ProvisionError(
      REASONS.INTERNAL_ERROR,
      'applyMerge received an unknown action: ' + String(plan.action),
      String(plan.action)
    );
  }

  const current = readTargetContent(target);
  const currentHash = current === null ? null : sha256(current);
  if (currentHash !== plan.sourceHash) {
    // Atomic rename does not prevent a lost update: it only guarantees no
    // partially-written file is observable. A stale nextContent lands atomically
    // and the user's newer lines vanish. We refuse instead of silently
    // re-planning, because re-planning over an unknown edit IS the defect.
    throw new ProvisionError(
      REASONS.CONCURRENT_MODIFICATION,
      target + ' changed after the merge was planned. Nothing was written — re-run.',
      target
    );
  }

  // .bak is a single-rotation backup for this rewrite only; an existing .bak is
  // overwritten. It is a recovery aid, not an archive. 0o600 because it holds a
  // verbatim copy of the user's file.
  //
  // The path is deterministic, so it can be pre-placed, and a plain 'w' write
  // follows a symlink: `.gitignore.bak -> ~/.bashrc` would land the user's
  // .gitignore — whose lines an attacker with repo-write already controls —
  // on that file. The lstat names that case with its own reason; unlink + 'wx'
  // then closes the check-to-write window, because a symlink re-placed inside
  // it makes the exclusive create fail rather than follow.
  const backupPath = target + '.bak';
  assertNotSymlink(backupPath);
  // Staged, then renamed into place. Unlinking the old .bak first and creating
  // the new one after would destroy the previous recovery copy at exactly the
  // moment the replacement might fail (ENOSPC, permissions, a scanner holding
  // the path) — leaving no backup at all. A rename replaces atomically, so the
  // old copy survives until the new one is complete.
  //
  // Rename also can NOT be redirected through a symlink: it replaces the link
  // itself rather than writing to its target, which is the same protection the
  // lstat gives, minus the check-to-use window.
  const backupTmp = backupPath + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
  try {
    fs.writeFileSync(backupTmp, current, { flag: 'wx', mode: 0o600 });
    fs.renameSync(backupTmp, backupPath);
  } catch (err) {
    try { fs.unlinkSync(backupTmp); } catch (_e) {}
    throw new ProvisionError(REASONS.INTERNAL_ERROR, 'cannot write backup ' + backupPath + ': ' + err.message, backupPath);
  }

  // Per-run unique tmp: a fixed name would collide between two parallel setups
  // (CLAUDE.md §3.6 mandates pid + nonce for the same reason). 0o600 so the tmp
  // is never world-readable even briefly.
  const tmpPath = target + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
  try {
    // 'wx' for the same reason the backup uses it: an exclusive create cannot
    // be redirected through a symlink. The nonce already makes pre-placement
    // impractical, so this is the cheap half of defence in depth, not the load
    // -bearing half.
    fs.writeFileSync(tmpPath, plan.nextContent, { flag: 'wx', mode: 0o600 });
    touchLock(lockPath);
    // Re-verify immediately before the swap. The check above ran before two
    // file writes, so the window it left is as wide as that I/O; this one
    // leaves a window a few syscalls wide.
    //
    // It NARROWS the race, it does not close it: no portable rename can say
    // "replace only if unchanged", so a writer that ignores our lock can still
    // land an edit in the remaining gap. The advisory lock is what actually
    // serializes cooperating writers; this is the last cheap reduction
    // available to a non-cooperating one, and calling it a guarantee would be
    // the dishonest version of the same code.
    // Carry the target's own mode across the swap. rename() replaces the inode,
    // so the file inherits the TMP's mode — and the tmp is deliberately 0600 so
    // it is never world-readable mid-write. Without this the user's 0644
    // .gitignore silently becomes owner-only, which breaks a shared checkout or
    // a service account that has to read it. Written at 0600, restored to the
    // original immediately before the swap: the hardening covers the window it
    // was for, and nothing outlives it.
    try {
      const targetMode = fs.statSync(target).mode & 0o777;
      fs.chmodSync(tmpPath, targetMode);
    } catch (_err) { /* best effort — Windows has no POSIX mode to carry */ }

    const beforeSwap = readTargetContent(target);
    if (beforeSwap === null || sha256(beforeSwap) !== plan.sourceHash) {
      throw new ProvisionError(
        REASONS.CONCURRENT_MODIFICATION,
        target + ' changed while the replacement was being staged. Nothing was written — re-run.',
        target
      );
    }
    fs.renameSync(tmpPath, target);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch (_e) {}
    // A ProvisionError here is already a diagnosis; rewrapping it as
    // internal-error would erase the reason a consumer branches on.
    if (err instanceof ProvisionError) throw err;
    throw new ProvisionError(REASONS.INTERNAL_ERROR, 'cannot write ' + target + ': ' + err.message, target);
  }
  return { written: true, backupPath, tmpPath };
}

// ---------------------------------------------------------------------------
// Detection (never throws)
// ---------------------------------------------------------------------------

// git's own "this is not a repository" diagnosis, anchored. A loose /not a git
// repository/ scan also matches corruption messages that merely quote the
// phrase, and misreading those as "skip" is exactly the fail-open DD1 exists to
// prevent.
const NOT_A_REPO_RE = /^fatal: not a git repository \(or any of the parent directories\)/m;

function gitEnv() {
  // Locale pinned: the classification below reads git's diagnostic text, and a
  // translated stderr would break it.
  return Object.assign({}, process.env, { LC_ALL: 'C', LANG: 'C' });
}

// The `cwd` argument is mandatory in effect: dropping it from the spawn options
// makes --repo cosmetic and writes to whatever directory the process happens to
// be in.
//
// Conditions are evaluated top-down and the first match wins. 1 and 2 really do
// co-occur (spawnSync sets `error` AND leaves `status` null on ENOENT); both
// land on git-unavailable, but an implementation that tested `status !== 0`
// first would misclassify null, since null !== 0 is true.
function resolveRepoRoot(cwd, deps) {
  const run = (deps && deps.spawnSync) || spawnSync;
  const result = run('git', ['rev-parse', '--show-toplevel'], {
    cwd: cwd || process.cwd(),
    encoding: 'utf8',
    env: gitEnv(),
  });
  if (!result) return { ok: false, reason: REASONS.GIT_UNAVAILABLE, stderr: 'no result from spawnSync' };
  if (result.error) return { ok: false, reason: REASONS.GIT_UNAVAILABLE, stderr: String(result.error.message || result.error) };
  if (result.status === null || result.status === undefined) {
    return { ok: false, reason: REASONS.GIT_UNAVAILABLE, stderr: String(result.stderr || 'git terminated by signal') };
  }
  if (result.status !== 0) {
    const stderr = String(result.stderr || '');
    if (NOT_A_REPO_RE.test(stderr)) return { ok: false, reason: REASONS.NOT_A_GIT_REPO, stderr };
    return { ok: false, reason: REASONS.GIT_ERROR, stderr };
  }
  return { ok: true, root: String(result.stdout || '').trim() };
}

// Scoped to the canonical rules ONLY, via a temp exclude file, because the
// caller presents every result as "newly ignored by this provisioning" and tells
// the user to `git rm --cached` it. `--exclude-standard` evaluates the
// repository's whole ignore configuration, so a file already tracked and already
// ignored by the user's own .gitignore would be reported here and the user would
// be advised to untrack a file this tool never touched. It also pulled in
// .git/info/exclude and the global ignore file — the two channels UI4 puts out
// of scope — through the back door.
function detectTrackedPollution(root, deps) {
  const run = (deps && deps.spawnSync) || spawnSync;
  let excludeFile;
  try {
    excludeFile = path.join(
      os.tmpdir(),
      'mccp-gitignore-scan-' + process.pid + '-' + crypto.randomBytes(6).toString('hex')
    );
    fs.writeFileSync(excludeFile, MCCP_IGNORE_BLOCK.join('\n') + '\n', { mode: 0o600 });
  } catch (_err) {
    return { ok: false, reason: REASONS.INTERNAL_ERROR, files: [] };
  }
  let result;
  try {
    // No --exclude-standard: with -X alone the patterns are exactly ours.
    result = run('git', ['ls-files', '-i', '-c', '-X', excludeFile], {
      cwd: root,
      encoding: 'utf8',
      env: gitEnv(),
    });
  } catch (err) {
    return { ok: false, reason: REASONS.GIT_UNAVAILABLE, files: [] };
  } finally {
    try { fs.unlinkSync(excludeFile); } catch (_e) {}
  }
  if (!result || result.error || result.status !== 0) {
    return { ok: false, reason: REASONS.GIT_UNAVAILABLE, files: [] };
  }
  const files = String(result.stdout || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return { ok: true, files };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

// Actions after which newly-installed rules can be shadowing already-tracked
// files. `noop` installs nothing new, and `skip` has no repo.
const POLLUTION_RELEVANT = Object.freeze(['create', 'append', 'update']);

// Runs against repoRoot, not the caller's cwd. Detection scoped to cwd would
// list only the subtree the command happened to be invoked from and report
// that partial scan in the same shape as a clean one — "checked, clean" and
// "checked half the repo" must not be indistinguishable.
function pollutionFor(action, repoRoot, deps) {
  if (!POLLUTION_RELEVANT.includes(action)) return null;
  const detected = detectTrackedPollution(repoRoot, deps);
  return { ok: detected.ok, files: detected.files, reason: detected.reason || null };
}

function provision(options) {
  const opts = options || {};
  const dryRun = Boolean(opts.dryRun);

  // Repo resolution first: in a non-git directory the version is never needed,
  // and reading it first turned a corrupt plugin.json there into exit 1 instead
  // of the documented skip.
  const resolved = resolveRepoRoot(opts.repo || process.cwd(), opts.deps);
  if (!resolved.ok) {
    if (resolved.reason === REASONS.NOT_A_GIT_REPO) {
      // Normal skip (UI5) — not a failure.
      return {
        ok: true, action: 'skip', reason: REASONS.NOT_A_GIT_REPO, repoRoot: null,
        addedLines: [], backupPath: null, dryRun, version: null, pollution: null,
      };
    }
    throw new ProvisionError(resolved.reason, 'git failed: ' + (resolved.stderr || resolved.reason), resolved.stderr || null);
  }

  const version = readPluginVersion(opts.pluginJsonPath);
  const repoRoot = resolved.root;
  const target = path.join(repoRoot, '.gitignore');

  if (dryRun) {
    // No lock: nothing is written, so there is no section to serialize. No
    // pollution scan either — nothing became newly ignored.
    assertNotSymlink(target);
    const plan = planMerge({ content: readTargetContent(target), version });
    return {
      ok: true, action: plan.action, reason: null, repoRoot, addedLines: plan.addedLines,
      backupPath: null, dryRun: true, version, pollution: null,
    };
  }

  const lockPath = target + '.lock';
  const token = acquireLock(lockPath, { waitMs: opts.lockWaitMs });
  let result;
  try {
    // read-plan-write, all inside the lock.
    const content = readTargetContent(target);
    const plan = planMerge({ content, version });

    // `update` applies without a separate consent flag. The block is TOOL-OWNED
    // and planMerge replaces only the marker span, so every line outside it is
    // carried over byte-for-byte (the index-inequality test asserts this) —
    // there is no user content for consent to protect. Gating it behind
    // --force-update conflated "replace the tool's own block" with "rewrite the
    // user's file", and the cost of that conflation was severe: the block
    // embeds the plugin version, so ANY version bump put every existing install
    // into a permanent no-write state while setup still reported success. The
    // feature's own promise — idempotently merge the canonical rules — stopped
    // holding after the first upgrade. The .bak and the sourceHash re-check stay
    // as the recovery and lost-update guards.
    const applied = applyMerge(target, plan, { lockPath });
    result = {
      ok: true, action: plan.action, reason: null, repoRoot,
      addedLines: plan.addedLines, backupPath: applied.backupPath, dryRun: false, version, pollution: null,
    };
  } finally {
    releaseLock(lockPath, token);
  }

  // Outside the lock on purpose: this is a read-only advisory scan, and holding
  // a write lock across it would serialize every concurrent setup behind a git
  // call that changes nothing. It never throws (DD4-Q2) — detection is extra
  // information, not a precondition, so it cannot turn a completed write into a
  // failure.
  result.pollution = pollutionFor(result.action, repoRoot, opts.deps);
  return result;
}

module.exports = {
  BEGIN_MARKER,
  END_MARKER,
  REASONS,
  REASON_VALUES,
  ProvisionError,
  MCCP_IGNORE_BLOCK,
  MCCP_IGNORE_ENTRIES,
  REPO_ONLY,
  LOCK_LEASE_MS,
  APPEND_FLAGS,
  parseEntries,
  locateManagedBlock,
  stripManagedBlock,
  readPluginVersion,
  buildBlock,
  planMerge,
  applyMerge,
  acquireLock,
  releaseLock,
  lockIsReclaimable,
  reclaimLock,
  resolveRepoRoot,
  detectTrackedPollution,
  provision,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  // A value-taking flag must actually be given a value. Returning args[i+1]
  // blind made `--repo` silently fall back to cwd when it was last, and made
  // `--repo --json` write to a directory literally named "--json" — both of
  // which write to a repository the caller did not name.
  const flag = (name) => {
    const i = args.indexOf('--' + name);
    if (i < 0) return undefined;
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) {
      process.stderr.write('usage: --' + name + ' requires a value\n');
      process.exit(2);
    }
    return value;
  };
  const dryRun = args.includes('--dry-run');
  const asJson = args.includes('--json');
  const repo = flag('repo');

  if (cmd !== 'provision') {
    process.stderr.write('usage: gitignore-provision.js provision [--dry-run] [--repo <path>] [--json]\n');
    process.exit(2);
  }

  try {
    const result = provision({ dryRun, repo });
    if (asJson) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else process.stdout.write((result.action || 'unknown') + (result.reason ? ' (' + result.reason + ')' : '') + '\n');
    process.exit(0);
  } catch (err) {
    // Closed enum: anything that is not a ProvisionError becomes internal-error,
    // so a consumer branching on `reason` never sees an OS/Node message string.
    const reason = err instanceof ProvisionError ? err.reason : REASONS.INTERNAL_ERROR;
    process.stderr.write('error [' + reason + ']: ' + (err && err.message ? err.message : String(err)) + '\n');
    const payload = {
      ok: false, action: null, reason, repoRoot: null, addedLines: [],
      backupPath: null, dryRun, version: null, pollution: null,
      detail: err instanceof ProvisionError ? err.detail : (err && err.message) || null,
    };
    if (asJson) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    process.exit(1);
  }
}
