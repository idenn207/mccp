'use strict';

// session-process-reclaim — source-level regression net.
//
// Everything here is a SOURCE scan rather than a behavioural test, because what
// it guards is coverage: a new long-lived spawn that forgets to register, a kill
// that appears outside the ownership predicate, a caller that throws away the
// reclaim verdict. None of those can be caught by exercising today's code — they
// are about code that does not exist yet.
//
// The rule in every case is the same: the scan is compared against an explicit
// inventory, so a NEW site is red until someone enrolls it with a reason.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SCRIPTS = path.resolve(__dirname, '..', '..');            // plugins/mccp/scripts
const COMMANDS = path.resolve(SCRIPTS, '..', 'commands');       // plugins/mccp/commands
const REPO_ROOT = path.resolve(SCRIPTS, '..', '..', '..');

function rel(p) { return path.relative(REPO_ROOT, p).split(path.sep).join('/'); }

function walkJs(dir, out) {
  out = out || [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'tests' || e.name === 'vendor') continue;
      walkJs(p, out);
    } else if (e.name.endsWith('.js')) {
      out.push(p);
    }
  }
  return out;
}

const JS_FILES = walkJs(SCRIPTS);
const MD_FILES = fs.readdirSync(COMMANDS)
  .filter((f) => f.endsWith('.md'))
  .map((f) => path.join(COMMANDS, f));

function read(p) { return fs.readFileSync(p, 'utf8'); }

// ── (a) the spawn sites that must be registered ─────────────────────────────
//
// §D1 replaces the PRD's "3 detached spawn points", which was wrong in both
// directions: it named a browser launcher that must NOT be registered, and
// omitted the dashboard server body that must be. Line numbers are deliberately
// absent — they move on every edit and would make this test a tripwire for
// unrelated changes.

const EXPECTED_SPAWN_SITES = [
  {
    file: 'plugins/mccp/scripts/lib/dashboard-server.js',
    disposition: 'registers',
    kind: 'dashboard-server',
    reason: 'the server body itself — the process that keeps holding the port after its session is gone',
  },
  {
    file: 'plugins/mccp/scripts/lib/dashboard-server.js',
    disposition: 'excluded',
    kind: null,
    reason: 'openBrowser() — a `cmd /c start` launcher that exits within milliseconds. '
      + 'Registering it would hand SessionEnd a pid the OS has almost certainly recycled (UI2)',
  },
  {
    file: 'plugins/mccp/scripts/state/session-spawner.js',
    disposition: 'registers',
    kind: 'handoff-session',
    reason: 'win32 handoff child — outliving this session is its reason to exist, so it is '
      + 'recorded but never reclaimed',
  },
  {
    file: 'plugins/mccp/commands/plan.md',
    disposition: 'registers',
    kind: 'plan-codex-runner',
    // The spawn site and the registration site are different files here: a
    // markdown command body cannot call register(), so the launched process
    // registers itself. That split is exactly why §D2 chose self-registration
    // over a spawn() wrapper — a wrapper is structurally blind to a Bash nohup.
    registersIn: 'plugins/mccp/scripts/lib/plan-codex-runner.js',
    reason: 'Bash `nohup node …` — not a JS spawn at all, so the runner self-registers',
  },
];

test('(a) every literal detached spawn site is enrolled in EXPECTED_SPAWN_SITES', () => {
  const jsHits = JS_FILES.filter((f) => /detached\s*:\s*true/.test(read(f))).map(rel);
  const mdHits = MD_FILES.filter((f) => /^\s*nohup\s+node\b/m.test(read(f))).map(rel);
  const scanned = new Set(jsHits.concat(mdHits));
  const enrolled = new Set(EXPECTED_SPAWN_SITES.map((s) => s.file));

  assert.deepStrictEqual([...scanned].sort(), [...enrolled].sort(),
    'a new detached spawn site must be enrolled with a disposition and a reason. '
    + 'Editing the inventory to match is the point — an unlisted site is a process '
    + 'nothing will ever reclaim.');
});

test('(a2) each "registers" site actually calls register() with its declared kind', () => {
  for (const site of EXPECTED_SPAWN_SITES.filter((s) => s.disposition === 'registers')) {
    // A markdown spawn site registers from the process it launches, so follow
    // `registersIn` when the two differ.
    const where = site.registersIn || site.file;
    const text = read(path.join(REPO_ROOT, where));
    assert.match(text, /register\s*\(/,
      where + ' is declared as registering but contains no register( call');
    assert.ok(text.includes("'" + site.kind + "'") || text.includes('"' + site.kind + '"'),
      where + ' must name its kind literal ' + JSON.stringify(site.kind)
      + ' — (a) only proves WHERE a spawn is, not that registration was wired');
  }
});

// ── (a3) the wider net: the variable-indirection gap ────────────────────────
//
// (a) only sees the literal `detached: true` on the spawn call. `const opts =
// {detached: true}; spawn(cmd, args, opts)` slips straight through it. Rather
// than making that one regex cleverer, this widens the net to any `detached:`
// property and any `.unref(` — the two things a process that outlives us does —
// and demands every hit be enrolled.
//
// DEVIATION from the plan, documented in the implementation report: the plan
// specified enrolling all `spawn|spawnSync|execFile|execFileSync|exec|fork`
// call sites as {file, line, disposition}. Measured here that is 143 sites over
// 81 files, almost all synchronous `git` calls, and pinning line numbers would
// make ANY edit above ANY of them red — contradicting the same plan's stated
// reason for keeping line numbers out of (a). The net below is narrower in
// volume but strictly WIDER than (a) on the axis (a3) exists to close.
//
// Stated honestly: this does not see `require(name)[fn]()` or split-string
// construction. There are zero such sites today; if one appears, code review
// catches it, not this test. The claim is only that every literal
// detached/unref site is enrolled and a new one turns this red.

const SPAWN_CALL_INVENTORY = [
  {
    file: 'plugins/mccp/scripts/lib/dashboard-server.js',
    disposition: 'registers',
    reason: 'server body registers; openBrowser is the excluded short-lived launcher',
  },
  {
    file: 'plugins/mccp/scripts/state/session-spawner.js',
    disposition: 'registers',
    reason: 'win32 handoff child is registered by its parent (it cannot self-register)',
  },
  {
    file: 'plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js',
    disposition: 'not-detached',
    reason: 'spawns with an explicit `detached: false` — dies with its parent',
  },
  {
    file: 'plugins/mccp/scripts/derive/sources/worktrees.js',
    disposition: 'not-a-process',
    reason: 'false positive — `detached` here is the git worktree HEAD state field, not a spawn option',
  },
  {
    file: 'plugins/mccp/scripts/hooks/mcp-health-check.js',
    disposition: 'not-a-process',
    reason: 'false positive — timer.unref(), a Node timer handle',
  },
  {
    file: 'plugins/mccp/scripts/lib/dispatch-watcher.js',
    disposition: 'not-a-process',
    reason: 'false positive — poll/timeout handle unref(), Node timers',
  },
  {
    file: 'plugins/mccp/scripts/lib/utils.js',
    disposition: 'not-a-process',
    reason: 'false positive — process.stdin.unref(), a stream handle',
  },
];

test('(a3) every detached-property / unref call site is enrolled with a reason', () => {
  const scanned = JS_FILES
    .filter((f) => /\bdetached\s*:/.test(read(f)) || /\.unref\s*\(/.test(read(f)))
    .map(rel);
  const enrolled = SPAWN_CALL_INVENTORY.map((s) => s.file);

  assert.deepStrictEqual([...new Set(scanned)].sort(), [...new Set(enrolled)].sort(),
    'a new detached/unref site must be enrolled. Implicit exclusion is not allowed — '
    + 'a false positive has to be declared as one.');

  for (const entry of SPAWN_CALL_INVENTORY) {
    assert.ok(entry.reason && entry.reason.split(/\s+/).length >= 4,
      entry.file + ' needs a substantive reason, not a label');
    assert.ok(['registers', 'short-lived', 'not-detached', 'not-a-process', 'test-only']
      .includes(entry.disposition), entry.file + ' has an unknown disposition');
  }
});

// ── (b) openBrowser must stay unregistered ──────────────────────────────────

test('(b) openBrowser does not register — a millisecond-lived launcher is a UI2 hazard', () => {
  const text = read(path.join(REPO_ROOT, 'plugins/mccp/scripts/lib/dashboard-server.js'));
  const start = text.indexOf('function openBrowser(');
  assert.ok(start > -1, 'openBrowser must still exist for this guard to mean anything');
  // Body span by brace matching from the signature.
  let depth = 0, i = text.indexOf('{', start), end = -1;
  for (; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = text.slice(start, end);
  assert.ok(!/register\s*\(/.test(body),
    'openBrowser exits within milliseconds; by SessionEnd its pid is very likely '
    + 'owned by an unrelated process, so registering it would make the reaper a mis-kill engine');
});

// ── (c) lifetime literals ───────────────────────────────────────────────────

test('(c) each registration site pins its kind→lifetime pair', () => {
  const pairs = [
    ['plugins/mccp/scripts/lib/dashboard-server.js', 'dashboard-server', 'outlives-session'],
    ['plugins/mccp/scripts/state/session-spawner.js', 'handoff-session', 'outlives-session'],
    ['plugins/mccp/scripts/lib/plan-codex-runner.js', 'plan-codex-runner', 'session'],
  ];
  for (const [file, kind, lifetime] of pairs) {
    const text = read(path.join(REPO_ROOT, file));
    const re = new RegExp("kind:\\s*'" + kind + "'[\\s\\S]{0,200}?lifetime:\\s*'" + lifetime + "'");
    assert.match(text, re,
      file + ' must register kind=' + kind + ' with lifetime=' + lifetime
      + '. Flipping a runner to outlives-session would silently exempt it from reclaim.');
  }
});

// ── (d) the kill site is unique and gated by the predicate ──────────────────

function functionBody(text, signature) {
  const start = text.indexOf(signature);
  if (start === -1) return null;
  let depth = 0, end = -1;
  for (let i = text.indexOf('{', start); i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  return end === -1 ? null : text.slice(start, end);
}

test('(d) process.kill lives in exactly one place, inside reclaimSession, behind isReclaimableBy', () => {
  const file = path.join(REPO_ROOT, 'plugins/mccp/scripts/lib/session-processes.js');
  const text = read(file);

  const killLines = text.split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, ''))
    .filter((l) => /process\.kill\s*\(/.test(l))
    .filter((l) => !/process\.kill\s*\([^)]*,\s*0\s*\)/.test(l));   // liveness probe
  assert.strictEqual(killLines.length, 1,
    'exactly one kill site; found:\n' + killLines.join('\n'));

  const body = functionBody(text, 'function reclaimSession(');
  assert.ok(body, 'reclaimSession must be a named function so this span is checkable');
  assert.ok(/process\.kill\s*\(/.test(body), 'the kill must live inside reclaimSession');
  assert.ok(/isReclaimableBy\s*\(/.test(body),
    'and the same function must consult the ownership predicate — otherwise the '
    + 'predicate is decorative');
});

test('(d2) scanForeignOrphans never kills — it only unlinks records of dead pids', () => {
  const text = read(path.join(REPO_ROOT, 'plugins/mccp/scripts/lib/session-processes.js'));
  const body = functionBody(text, 'function scanForeignOrphans(');
  assert.ok(body);
  assert.ok(!/process\.kill\s*\(/.test(body),
    'UI1 allows reporting a foreign live process, never reclaiming it');
});

// ── (e) list() consumer whitelist ───────────────────────────────────────────

test('(e) nothing outside session-processes.js consumes list() yet', () => {
  const importers = JS_FILES.filter((f) =>
    /require\([^)]*session-processes[^)]*\)/.test(read(f))
    && rel(f) !== 'plugins/mccp/scripts/lib/session-processes.js');

  const consumers = importers.filter((f) => {
    const t = read(f);
    return /\.\s*list\s*\(/.test(t) || /const\s*\{[^}]*\blist\b[^}]*\}\s*=\s*require\([^)]*session-processes/.test(t);
  }).map(rel);

  assert.deepStrictEqual(consumers, [],
    'a new list() consumer must handle `incomplete` — absence of a record is NOT '
    + 'proof of reclaim. Adding one here is a prompt to wire that handling, not a '
    + 'reason to delete this assertion.');
});

// ── (g) every reuse registration reads its result ───────────────────────────
//
// Round-1 santa-loop finding. The reuse record is the ONLY signal that tells the
// owning session "someone else is still using this server". Both call sites
// discarded the result, so a failed registration — most simply, a session with
// no CLAUDE_CODE_SESSION_ID — silently removed the owner's
// `in_use_by_live_session` guard, and under MCCP_RECLAIM_OUTLIVES=1 the owner
// would SIGTERM a server still in use. Same shape as (f): the source scan owns
// COVERAGE, the behavioural surfacing is asserted in dashboard-server.test.js.

test('(g) no caller throws away a reuse-registration result', () => {
  const callers = JS_FILES.filter((f) => /registerServerReuse\s*\(/.test(read(f)));
  assert.ok(callers.length >= 1,
    'zero callers means the scan has gone blind — e.g. the helper was renamed');

  for (const f of callers) {
    read(f).split(/\r?\n/).forEach((line, i) => {
      if (!/registerServerReuse\s*\(/.test(line)) return;
      if (/^\s*(?:function|const|let|var)\s/.test(line)) return;   // the definition itself
      assert.ok(!/^\s*registerServerReuse\s*\(/.test(line),
        rel(f) + ':' + (i + 1) + ' calls registerServerReuse as a bare statement — '
        + 'a failed reuse record is a missing mis-kill guard, so it must be read '
        + 'and surfaced, not discarded');
    });
  }
});

// ── (f) every reclaimSession caller reads the return value ──────────────────

test('(f) no caller throws away the reclaimSession verdict', () => {
  const callers = JS_FILES.filter((f) =>
    rel(f) !== 'plugins/mccp/scripts/lib/session-processes.js'
    && /reclaimSession\s*\(/.test(read(f)));

  assert.ok(callers.length >= 1,
    'at least the SessionEnd hook must call it — zero callers means the scan has '
    + 'gone blind (e.g. the call was aliased behind another name)');

  for (const f of callers) {
    const lines = read(f).split(/\r?\n/);
    let bound = null;
    lines.forEach((line, i) => {
      if (!/reclaimSession\s*\(/.test(line)) return;
      assert.ok(!/^\s*(?:await\s+)?[\w.]*reclaimSession\s*\(/.test(line),
        rel(f) + ':' + (i + 1) + ' calls reclaimSession as a bare statement — the '
        + 'return value is the only place incompleteness is visible (§D6)');
      const m = /(?:const|let|var)\s+(?:(\w+)|\{\s*([^}]+)\})\s*=\s*(?:await\s+)?[\w.]*reclaimSession\s*\(/.exec(line);
      if (m) bound = m[1] || m[2];
    });
    assert.ok(bound, rel(f) + ' must bind the reclaimSession result to a name');
    const text = read(f);
    const names = bound.split(',').map((s) => s.trim().split(':').pop().trim());
    const referenced = names.some((n) => n === 'complete' || n === 'unreclaimed')
      || new RegExp('\\b' + names[0] + '\\s*\\.\\s*(complete|unreclaimed)\\b').test(text);
    assert.ok(referenced,
      rel(f) + ' binds the result but never reads .complete or .unreclaimed — '
      + 'the source scan owns COVERAGE here; session-end-marker-reclaim.test.js '
      + 'owns whether the read actually surfaces anything');
  }
});
