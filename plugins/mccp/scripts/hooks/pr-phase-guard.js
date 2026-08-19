#!/usr/bin/env node
'use strict';

// pr-phase-guard — PreToolUse + PostToolUse hook enforcing review-only
// invariant during the Codex-review subphase of /mccp:pr.
//
// v0.2.8 Task 2.6.1 R1-F1 + R2-F1 + R3-F1 absorption:
//   - Declarative invariant in pr.md cannot stop a single AI lapse.
//   - This hook reads pr-phase-lock state. While subphase=codex-review:
//     * PreToolUse on write-capable tools (Edit/Write/MultiEdit/NotebookEdit)
//       blanket-denies.
//     * PreToolUse on Bash applies a TOKENIZER-FIRST classify pipeline.
//     * PostToolUse on any tool records the call into the hook-trace shard.
//   - Outside Codex-review subphase the hook is a no-op (allow + no record).
//   - Fail-open on any internal exception (v0.2.7 invariant).
//
// v0.2.8 Task 2.6.1-followup F10 + F7 + F11 (R2-F1 + R3-F1 + R3-F2):
//   F10 — `BASH_ALLOW_PATTERNS` reduced to ONE helper-path-anchored regex
//         matching `${CLAUDE_PLUGIN_ROOT}/scripts/lib/pr-phase-helpers/
//         [a-z][a-z0-9-]*.js` plus a minimal read-only catalog (≤5 patterns).
//         Helper-path match is the *post-tokenizer trust gate* — necessary
//         but not sufficient (content-hash check is the actual trust gate).
//   F10 — content-hash verification: each allowed helper-path is verified
//         against `lock.helper_manifest[realpath(helper)]`. Mismatch → DENY.
//   F7  — tokenizer runs FIRST against ALL Bash including would-be helper
//         allowlist matches: chain-split + mutating-construct detect + comment
//         strip + indirect-invoke / subshell reject. `node helper; git commit`
//         fails at chain-split before allowlist is consulted.
//   F11 — additional BLOCK rules: `pr-phase-lock.js enter` via Bash during
//         Codex-review subphase (R3-F2 stdout-pipe IPC contract);
//         read of .claude/state/pr-phase.lock by any tool (defense-in-depth
//         even after token storage is hashed); `MCCP_LOCK_TEST_ARGV_TOKEN=1`
//         substring (production-accident leak guard).

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const envValue = require('../lib/env-contract/value');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');
const LIB_DIR = path.join(PLUGIN_ROOT, 'scripts', 'lib');

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

// v1.0.1 axis K — state marker file written when guard hook reclaims an orphan
// pr-phase.lock (same-host + dead PID). finalize-receipt reads + unlinks it to
// stamp `meta.pr_phase_lock_stale_reclaimed_at_hook=true` on the next PR
// receipt, converting silent recovery into a loud audit trail.
const STALE_RECLAIM_MARKER_REL = path.join('.claude', 'state', 'pr-phase-lock-stale-reclaimed.json');

// Explicit mutation patterns — any match → DENY (applied per tokenized segment).
const BASH_BLOCK_PATTERNS = [
  /\bgit\s+commit\b/,
  /\bgit\s+push\b/,
  /\bgit\s+reset\b/,
  /\bgit\s+rebase\b/,
  /\bgit\s+stash\b/,
  /\bgit\s+merge\b/,
  /\bgit\s+checkout\s+[^-]/,
  /\bgit\s+branch\s+-[dD]\b/,
  /\bgit\s+tag\s+-[dDfFa]/,
  /\bgh\s+pr\s+create\b/,
  /\bgh\s+pr\s+merge\b/,
  /\bgh\s+pr\s+edit\b/,
  /\bgh\s+pr\s+close\b/,
  /\bgh\s+pr\s+reopen\b/,
  /\bgh\s+issue\s+create\b/,
  /\bgh\s+issue\s+edit\b/,
  /\bgh\s+api\b[^|;&]*\s-X\s+(POST|PUT|PATCH|DELETE)\b/i,
  /\bgh\s+api\b[^|;&]*--method\s+(POST|PUT|PATCH|DELETE)\b/i,
  /\bnpm\s+(install|i|update|upgrade)\b/,
  /\bpnpm\s+(install|i|add|remove|update)\b/,
  /\byarn\s+(add|install|upgrade|remove)\b/,
  /(^|[\s;&|])rm\s+/,
  /(^|[\s;&|])mv\s+/,
  /(^|[\s;&|])cp\s+/,
  /(^|[\s;&|])mkdir\b(?!\s+-p\s+\.git\/mccp\/tmp\s*$)/,
  /(^|[\s;&|])touch\s+/,
  /(^|[\s;&|])chmod\b/,
  /(^|[\s;&|])chown\b/,
  /\bsed\s+-i\b/,
  /\bcurl\b[^|;&]*\s-X\s+(POST|PUT|PATCH|DELETE)\b/i,
  /\bcurl\b[^|;&]*--data\b/i,
  // F11 R3-F2 — block direct Bash invocation of pr-phase-lock enter during
  // Codex-review subphase. codex-runner.js spawns it via child_process so
  // the hook never sees it; only Bash-shell paths get blocked.
  /\bpr-phase-lock\.js\b\s+enter\b/,
  // F11 defense-in-depth — block reads of the lock file body
  /(\bcat\b|\bhead\b|\btail\b|\bless\b|\bmore\b|\bsed\b|\bawk\b|\bgrep\b|\bnode\b)\s+[^|;&]*\bpr-phase\.lock\b/,
  // F11 R2-F1 — block any Bash containing the test-mode env-var literal,
  // to prevent accidental production leak.
  /\bMCCP_LOCK_TEST_ARGV_TOKEN\s*=\s*1\b/,
];

// F7 mutating-construct patterns applied AFTER tokenizer per segment.
const MUTATING_CONSTRUCT_PATTERNS = [
  /\S>\S/,                              // no-space redirect (e.g. echo x>file)
  /\s\d+>\S/,                           // fd redirect (e.g. cmd 2>file)
  /\s\d+>>/,                            // fd append (e.g. cmd 2>>file)
  /\|\s*(tee|sponge)\b/,                // pipe to mutating sink
  /\bawk\b[^|;&]*\bsystem\s*\(/,        // awk -> system()
  /\bfind\b[^|;&]*\b-(exec|delete)\b/,  // find with -exec or -delete
];

// F7 indirect-invoke + subshell — DENY at substring level (any segment).
const INDIRECT_INVOKE_PATTERNS = [
  /\beval\b/,
  /\bbash\s+-c\b/,
  /\bsh\s+-c\b/,
  /\bzsh\s+-c\b/,
  /(^|\s)source\s+/,
  /\$\(/,
  /`/,
];

// F10 — helper-path allowlist pattern. Anchored to the realpath under the
// installed plugin cache (or dev tree). Underscore-prefixed helpers (e.g.
// `_args.js`) are NOT matched — they're internal-only.
function helperPathPattern() {
  const helpersDir = path.join(LIB_DIR, 'pr-phase-helpers').replace(/\\/g, '/');
  // Allow quoted or unquoted path; match `node <helpers-dir>/<name>.js [args...]`
  const escaped = helpersDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    '^\\s*node\\s+["\']?' + escaped + '/[a-z][a-z0-9-]*\\.js["\']?(\\s|$)'
  );
}

// Minimal read-only allowlist catalog (post-F10 reduction — ≤5 entries).
const READ_ONLY_CATALOG = [
  /^\s*git\s+(status|log|diff|rev-parse|show|ls-files|cat-file|describe|remote|config\s+--get|branch(?!\s+-[dD])|tag(?!\s+-[dDa])|blame|fetch\s+--dry-run|whatchanged)\b/,
  /^\s*gh\s+(pr|issue|repo)\s+(list|view|status|checks|diff|comments)\b/,
  /^\s*gh\s+api\b/,
  /^\s*gh\s+auth\s+status\b/,
  /^\s*mkdir\s+-p\s+\.git\/mccp\/tmp\s*$/,
];

// ─── Tokenizer ─────────────────────────────────────────────────────────────

// stripComment — remove `# ...` to EOL while respecting `'…'` `"…"` quoting.
function stripComment(s) {
  let out = '';
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '\\' && i + 1 < s.length) { out += c + s[i + 1]; i += 1; continue; }
      if (c === q) q = null;
      out += c;
    } else {
      if (c === '\'' || c === '"') { q = c; out += c; }
      else if (c === '#') break;
      else out += c;
    }
  }
  return out;
}

// splitSegments — split on `;` `&&` `||` at depth 0 (respecting quotes + parens).
function splitSegments(s) {
  const segs = [];
  let buf = '';
  let q = null;
  let paren = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const n = s[i + 1];
    if (q) {
      if (c === '\\' && n) { buf += c + n; i += 1; continue; }
      if (c === q) q = null;
      buf += c;
      continue;
    }
    if (c === '\'' || c === '"') { q = c; buf += c; continue; }
    if (c === '(') { paren += 1; buf += c; continue; }
    if (c === ')') { paren = Math.max(0, paren - 1); buf += c; continue; }
    if (paren > 0) { buf += c; continue; }
    if (c === ';') {
      pushSeg(segs, buf); buf = ''; continue;
    }
    if ((c === '&' && n === '&') || (c === '|' && n === '|')) {
      pushSeg(segs, buf); buf = ''; i += 1; continue;
    }
    buf += c;
  }
  pushSeg(segs, buf);
  return segs;
}

function pushSeg(segs, s) {
  const t = s.trim();
  if (t.length > 0) segs.push(t);
}

// Decompose: strip comment first, then split segments. Each segment is the
// unit for allow/block decisions.
function tokenize(cmd) {
  if (typeof cmd !== 'string') return { ok: false, segments: [], reason: 'non-string' };
  const stripped = stripComment(cmd);
  return { ok: true, segments: splitSegments(stripped) };
}

// ─── Classify ──────────────────────────────────────────────────────────────

// classifyBashCommand — F7 tokenizer-first, then F10 helper-path + content-hash.
// `opts.helperManifest` (optional) is the lock body's helper_manifest map.
// `opts.helperPathPattern` (optional override for tests).
function classifyBashCommand(cmd, opts) {
  opts = opts || {};
  if (typeof cmd !== 'string') return { decision: 'deny', reason: 'non-string command' };
  const trimmed = cmd.trim();
  if (!trimmed) return { decision: 'deny', reason: 'empty command' };

  const tok = tokenize(trimmed);
  if (!tok.ok) return { decision: 'deny', reason: 'tokenizer: ' + tok.reason };
  if (tok.segments.length === 0) return { decision: 'deny', reason: 'no-segments-after-strip' };

  const hPattern = opts.helperPathPattern || helperPathPattern();

  for (let s = 0; s < tok.segments.length; s++) {
    const seg = tok.segments[s];

    // F7 indirect-invoke + subshell — DENY immediately
    for (let i = 0; i < INDIRECT_INVOKE_PATTERNS.length; i++) {
      if (INDIRECT_INVOKE_PATTERNS[i].test(seg)) {
        return { decision: 'deny', reason: 'indirect-invoke or subshell: ' + INDIRECT_INVOKE_PATTERNS[i].source + ' (segment: ' + seg + ')' };
      }
    }

    // Block patterns per segment
    for (let i = 0; i < BASH_BLOCK_PATTERNS.length; i++) {
      if (BASH_BLOCK_PATTERNS[i].test(seg)) {
        return { decision: 'deny', reason: 'segment-block: ' + BASH_BLOCK_PATTERNS[i].source + ' (segment: ' + seg + ')' };
      }
    }

    // F7 mutating constructs per segment
    for (let i = 0; i < MUTATING_CONSTRUCT_PATTERNS.length; i++) {
      if (MUTATING_CONSTRUCT_PATTERNS[i].test(seg)) {
        return { decision: 'deny', reason: 'mutating-construct: ' + MUTATING_CONSTRUCT_PATTERNS[i].source + ' (segment: ' + seg + ')' };
      }
    }

    // Allow paths: helper-path OR minimal read-only catalog
    const helperMatch = seg.match(hPattern);
    if (helperMatch) {
      const verifyResult = verifyHelperContent(seg, opts.helperManifest);
      if (!verifyResult.ok) {
        return { decision: 'deny', reason: 'helper-content: ' + verifyResult.reason + ' (segment: ' + seg + ')' };
      }
      continue; // segment allowed
    }
    let catalogMatch = false;
    for (let i = 0; i < READ_ONLY_CATALOG.length; i++) {
      if (READ_ONLY_CATALOG[i].test(seg)) { catalogMatch = true; break; }
    }
    if (catalogMatch) continue;

    return {
      decision: 'deny',
      reason: 'no allowlist match (default-deny in Codex-review subphase) — segment: ' + seg,
    };
  }
  return { decision: 'allow', reason: 'all segments matched allowlist (helper-path content-verified)' };
}

// Extract the helper path from a `node /abs/path/to/helper.js ...` segment
// and verify its content sha256 matches the manifest stored at lock-enter time.
function verifyHelperContent(segment, helperManifest) {
  // Pull the helper path (after `node` + optional quote)
  const m = segment.match(/^\s*node\s+["']?([^"'\s]+\.js)["']?/);
  if (!m) return { ok: false, reason: 'helper-path-not-extracted' };
  let realPath;
  try { realPath = fs.realpathSync(m[1]); }
  catch (err) { return { ok: false, reason: 'helper-realpath-failed: ' + err.message }; }
  if (!helperManifest || typeof helperManifest !== 'object') {
    return { ok: false, reason: 'lock-has-no-helper-manifest' };
  }
  const expected = helperManifest[realPath];
  if (!expected) return { ok: false, reason: 'helper-not-in-manifest: ' + realPath };
  let actualBuf;
  try { actualBuf = fs.readFileSync(realPath); }
  catch (err) { return { ok: false, reason: 'helper-read-failed: ' + err.message }; }
  const actual = 'sha256:' + crypto.createHash('sha256').update(actualBuf).digest('hex');
  if (actual !== expected) {
    return { ok: false, reason: 'helper-content-changed-during-lock' };
  }
  return { ok: true };
}

// ─── Hook plumbing ─────────────────────────────────────────────────────────

function readStdin() {
  return new Promise(function (resolve) {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (c) { buf += c; });
    process.stdin.on('end', function () { resolve(buf); });
    process.stdin.on('error', function () { resolve(buf); });
    setTimeout(function () { resolve(buf); }, 25000);
  });
}

function debug(msg) {
  if (envValue.parseBool(process.env, 'MCCP_RECEIPT_DEBUG')) {
    process.stderr.write('[mccp:pr-phase-guard] ' + msg + '\n');
  }
}

function loadLock() {
  try { return require(path.join(LIB_DIR, 'pr-phase-lock')); }
  catch (err) { debug('pr-phase-lock unavailable: ' + err.message); return null; }
}

function loadHookTrace() {
  try { return require(path.join(LIB_DIR, 'hook-trace')); }
  catch (err) { debug('hook-trace unavailable: ' + err.message); return null; }
}

function detectRepoRoot(event) {
  if (event && typeof event.cwd === 'string') return event.cwd;
  return process.cwd();
}

// v1.0.1 axis K — assertContained mirror of pr-phase-lock.js Task 2: refuse to
// write the marker outside <root>/.claude even if path joining is somehow
// corrupted (symlink/race). Loaded lazily so the guard doesn't crash if the
// helper module is missing from older plugin installs.
function loadPathContainment() {
  try { return require(path.join(LIB_DIR, 'path-containment')); }
  catch (err) { debug('path-containment unavailable: ' + err.message); return null; }
}

// v1.0.1 axis K — atomic marker write (write to tmp + rename) so a concurrent
// finalize-receipt cannot read a partially written body. Returns true on
// success, false on any failure (loud fail-open: stderr always emits below).
function writeStaleReclaimMarker(root, formerLock, reason) {
  const markerPath = path.join(root, STALE_RECLAIM_MARKER_REL);
  const markerDir = path.dirname(markerPath);
  try {
    fs.mkdirSync(markerDir, { recursive: true });
    const containment = loadPathContainment();
    if (containment && typeof containment.assertContained === 'function') {
      containment.assertContained(markerDir, path.join(root, '.claude'), null);
    }
    const body = JSON.stringify({
      reclaimed_at: new Date().toISOString(),
      former_run_id: (formerLock && formerLock.run_id) || null,
      former_pid: (formerLock && typeof formerLock.pid === 'number') ? formerLock.pid : null,
      former_host: (formerLock && formerLock.host) || null,
      reason: reason || 'same-host-dead-pid',
    }, null, 2) + '\n';
    const tmpPath = markerPath + '.tmp.' + process.pid + '.' + Date.now();
    fs.writeFileSync(tmpPath, body, { mode: 0o600 });
    fs.renameSync(tmpPath, markerPath);
    return true;
  } catch (err) {
    debug('writeStaleReclaimMarker failed: ' + err.message);
    return false;
  }
}

function lockActive(lockMod, cwd) {
  if (!lockMod) return null;
  try {
    const root = lockMod.repoRoot(cwd);
    const lock = lockMod.readLock(root);
    if (!lock || lock._parse_error) return null;
    if (lock.subphase !== lockMod.SUBPHASE_DEFAULT) return null;

    // v1.0.1 axis K — same-host + dead-PID orphan recovery. Without this
    // branch, a crashed PR helper leaves the lock body intact and every
    // subsequent /mccp:pr is blocked because lockActive() returns the orphan
    // lock metadata → guard hook denies all write tools. detect-stale via
    // Bash is itself blocked by the guard (tokenizer + allowlist), so the
    // user has no in-band escape. Reclaim path uses the lock module's own
    // host-aware tri-state policy (same-host+pid-alive=NEVER reclaim), so
    // alive PIDs are never disturbed.
    // v1.20.6 B#2 — delegate the same-host reclaim decision to the lock
    // module's host-aware tri-state policy. The prior `!isPidAlive` pre-gate
    // entered the reclaim path ONLY for a dead PID, so a PID-reuse imposter
    // (live PID + stale mtime) short-circuited it and blocked every subsequent
    // /mccp:pr until the reused process happened to exit. tryReclaimStaleLock
    // now reclaims both dead-PID orphans and alive-PID stale-mtime imposters
    // while still protecting a genuinely live holder (alive PID + fresh mtime,
    // heartbeat-kept), so the guard must hand alive-or-dead locks to it.
    const sameHost = !!(lock.host && typeof lockMod.isPidAlive === 'function'
      && lock.host === os.hostname());
    if (sameHost) {
      const pidAlive = lockMod.isPidAlive(lock.pid);
      const lockFilePath = lockMod.lockPath(root);
      const reclaimed = lockMod.tryReclaimStaleLock(lockFilePath);
      if (reclaimed) {
        const reason = pidAlive ? 'same-host-stale-imposter' : 'same-host-dead-pid';
        writeStaleReclaimMarker(root, lock, reason);
        process.stderr.write(
          '[mccp:pr-phase-guard] stale lock reclaimed ' +
          '(former_run_id=' + (lock.run_id || 'unknown') +
          ', former_pid=' + (lock.pid || 'unknown') +
          ', reason=' + reason + ')\n'
        );
        return null;
      }
      // Reclaim failed (genuine live holder with fresh mtime, or a race:
      // holder revived / unlink raced with another reclaim). Fall through to
      // the existing block path — the next call re-evaluates.
    }

    return { root: root, lock: lock };
  } catch (err) {
    debug('lockActive error: ' + err.message);
    return null;
  }
}

function denyBlock(reason, lockMeta) {
  const lines = [
    '[mccp:pr-phase-guard] BLOCK — review-only invariant active.',
    '  subphase: ' + (lockMeta.subphase || 'codex-review'),
    '  run_id  : ' + lockMeta.run_id,
    '  reason  : ' + reason,
    '',
    '  Codex-review subphase forbids write-tool calls. Per pr.md Phase 2.5.3,',
    '  findings flow into the PR body only — fix-cycle requires a separate',
    '  /mccp:plan or /mccp:prp-implement invocation after /mccp:pr exits.',
    '',
    '  To release the lock manually: node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/pr-phase-lock.js detect-stale',
  ];
  process.stderr.write(lines.join('\n') + '\n');
  process.exit(2);
}

function extractFilePath(toolName, toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return null;
  if (WRITE_TOOLS.has(toolName)) {
    if (typeof toolInput.file_path === 'string') return toolInput.file_path;
    if (typeof toolInput.notebook_path === 'string') return toolInput.notebook_path;
  }
  return null;
}

function recordPostUse(traceMod, event, ctx) {
  if (!traceMod || !event) return;
  const sessionId = event.session_id;
  const toolUseId = event.tool_use_id;
  if (!sessionId || !toolUseId) return;
  const filePath = extractFilePath(event.tool_name, event.tool_input);
  const filePathTruncated = filePath ? filePath.slice(0, 250) : null;
  try {
    traceMod.recordWrite(ctx.root, sessionId, toolUseId, 'post', {
      command_name: '/mccp:pr',
      gate_decision: 'pr-phase-guard:audit',
      layer: 'L2c',
      phase: ctx.lock.subphase || 'codex-review',
      tool: event.tool_name || null,
      file_path: filePathTruncated,
    });
  } catch (err) {
    debug('recordPostUse error: ' + err.message);
  }
}

async function main() {
  let raw = '';
  try { raw = await readStdin(); } catch (_) { /* fail open */ }
  let event = null;
  try { if (raw.trim()) event = JSON.parse(raw); }
  catch (err) { debug('stdin parse error: ' + err.message); }
  if (!event) return 0;

  const eventName = event.hook_event_name || event.eventName || '';
  const toolName = event.tool_name || '';
  const toolInput = event.tool_input || {};
  const cwd = detectRepoRoot(event);

  const lockMod = loadLock();
  const active = lockActive(lockMod, cwd);
  if (!active) return 0;

  if (eventName === 'PreToolUse') {
    if (WRITE_TOOLS.has(toolName)) {
      denyBlock('tool=' + toolName + ' is write-capable (blanket default-deny)', active.lock);
      return 2;
    }
    if (toolName === 'Bash') {
      const cls = classifyBashCommand(toolInput.command, {
        helperManifest: active.lock.helper_manifest,
      });
      if (cls.decision === 'deny') {
        denyBlock('Bash ' + cls.reason, active.lock);
        return 2;
      }
    }
    return 0;
  }

  if (eventName === 'PostToolUse') {
    const traceMod = loadHookTrace();
    recordPostUse(traceMod, event, { root: active.root, lock: active.lock });
    return 0;
  }

  return 0;
}

if (require.main === module) {
  main().then(function (code) { process.exit(code || 0); })
    .catch(function (err) {
      debug('main exception: ' + err.message);
      process.exit(0);
    });
}

module.exports = {
  WRITE_TOOLS,
  BASH_BLOCK_PATTERNS,
  MUTATING_CONSTRUCT_PATTERNS,
  INDIRECT_INVOKE_PATTERNS,
  READ_ONLY_CATALOG,
  STALE_RECLAIM_MARKER_REL,
  classifyBashCommand,
  tokenize,
  stripComment,
  splitSegments,
  helperPathPattern,
  verifyHelperContent,
  lockActive,
  writeStaleReclaimMarker,
  extractFilePath,
};
