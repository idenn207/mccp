'use strict';

// durable-evidence-substrate Phase A follow-up · F-H + F-I (Codex R5 + R6).
//
// The working-tree cwd-redaction + exact-manifest gate only protect the STAGED
// tree. They do NOT remove leaking content from ancestor commits (F-H), and —
// critically — the leak is NOT confined to receipt blobs: the committed design
// artifacts (plan, findings report) embed the same absolute drive-letter paths
// (F-I). A receipt-only gate would pass while the plan/report commits publish
// `<drive>:\…\<repo>` into public history.
//
// So this is the TERMINAL pre-push guarantee: scan EVERY NEW text blob reachable
// in `origin/<base>..HEAD` (all ancestor commits, not just the tip tree) for an
// absolute local path that names the repo root, and HALT if any non-allowlisted
// blob leaks. "NEW" = `git rev-list --objects base..HEAD` (objects reachable from
// HEAD but not base) — exactly what the push would send; blobs already in base
// are already public and out of scope.
//
// Pattern scope (Codex IF3): anchored on the REPO-ROOT absolute path (both `/`
// and `\` forms) + known old-repo-name path markers — NOT a bare `[A-Za-z]:[\\/]`
// which would false-positive on the plugin's own cache-path convention
// (`…\Users\<user>\.claude\plugins\cache\…`), Windows path examples, and test
// fixtures like `C:\evil\abs`. The allowlist is LINE/FIXTURE-specific (exact
// file path, optional line-substring) — NEVER directory-wide — so it can never
// grow broad enough to mask the exact leak class F-I exists to catch.

const { execFileSync } = require('child_process');

// Old repo names whose absolute-path form is a known leak (the corpus predates
// the rename from `my-claude-code-plugin` to `mccp`).
const DEFAULT_OLD_REPO_NAMES = Object.freeze(['my-claude-code-plugin']);

// Documented DEFAULT allowlist — the SOLE sanctioned intentional occurrence.
// This scanner's OWN test fixture MUST embed a `<drive>…my-claude-code-plugin`
// literal to prove the gate catches the old-repo path class; the fixture is
// unavoidable and there is exactly one. The entry is LINE/FIXTURE-specific
// (exact path + the old-repo marker) — NEVER directory-wide (Codex IF3), so it
// can never mask a real leak: a current repo-root path, or a leak in any OTHER
// file, is still caught. Callers may pass additional allowlist entries; they are
// merged on top of this default.
const DEFAULT_ALLOWLIST = Object.freeze([
  {
    path: 'plugins/mccp/scripts/lib/tests/history-leak-scan.test.js',
    contains: 'my-claude-code-plugin',
  },
]);

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd: cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Build the leak-detection regexes from the repo root + old-repo-name markers.
// Returns [{ name, re }]. The repo-root pattern joins the path segments with a
// SEPARATOR-FLEXIBLE class `[\\/]+` (one-or-more) so it matches every on-disk
// form: forward `X:/parent/repo`, single-back `X:\parent\repo`, AND the
// JSON-escaped double-back `X:\\parent\\repo` that receipt blobs actually store
// (a literal single-backslash pattern silently MISSES the JSON form — the exact
// bug that let 12 current-repo receipts slip past the first cut). Examples use a
// synthetic `X:/parent/repo` on purpose: a comment must never embed THIS repo's
// real root, or the gate would flag its own source.
function buildLeakPatterns(repoRoot, oldNames) {
  const rootFwd = String(repoRoot).replace(/\\/g, '/');
  const segs = rootFwd.split('/').filter(function (s) { return s.length > 0; });
  const sepFlexible = segs.map(escapeRe).join('[\\\\/]+');
  const patterns = [
    { name: 'repo-root', re: new RegExp(sepFlexible) },
  ];
  for (const nm of (oldNames || DEFAULT_OLD_REPO_NAMES)) {
    // drive-letter path (any separator run) that ends in the old repo name.
    patterns.push({
      name: 'old-repo:' + nm,
      re: new RegExp('[A-Za-z]:[\\\\/][^\\s"\'`]*' + escapeRe(nm)),
    });
  }
  return patterns;
}

// A leak occurrence is allowlisted iff an entry matches its file path EXACTLY
// (never a directory prefix — IF3) and, if the entry has `contains`, the leaking
// line includes that substring.
function isAllowlisted(allowlist, filePath, line) {
  for (const a of (allowlist || [])) {
    if (a.path !== filePath) continue;
    if (a.contains === undefined || a.contains === null) return true;
    if (String(line).indexOf(a.contains) !== -1) return true;
  }
  return false;
}

// Resolve the base ref (mirror hash.js candidate order) to a form `git rev-list`
// accepts. Returns null if none resolve (empty range → nothing to scan).
function resolveBase(repoRoot, base, gitFn) {
  const g = gitFn || git;
  const candidates = [];
  if (base) candidates.push(base);
  candidates.push('origin/main', 'origin/master', 'main', 'master');
  for (const c of candidates) {
    try { g(['rev-parse', '--verify', '--quiet', c + '^{commit}'], repoRoot); return c; }
    catch (_e) { /* try next */ }
  }
  return null;
}

// scanRange({ repoRoot, base, allowlist, oldRepoNames })
//   → { ok, leaks: [{ oid, path, line, evidence, pattern }], scanned_blobs, base, commits }
// Loud fail-open is NOT appropriate here (this is a security backstop): a git
// failure returns ok=false with an error leak so the caller HALTs rather than
// silently passing an unscanned push.
function scanRange(opts) {
  opts = opts || {};
  const repoRoot = opts.repoRoot || process.cwd();
  const gitFn = opts.gitFn || git; // injectable for tests (R4/F2 fail-closed coverage)
  // Merge the caller allowlist ON TOP of the documented DEFAULT (the scanner's
  // own fixture). Pass opts.allowlist=[] to keep the default; there is no way to
  // drop the default because the fixture leak is structural to this tool's tests.
  const allowlist = DEFAULT_ALLOWLIST.concat(opts.allowlist || []);
  const patterns = buildLeakPatterns(repoRoot, opts.oldRepoNames);

  const base = resolveBase(repoRoot, opts.base, gitFn);
  if (!base) return { ok: true, leaks: [], scanned_blobs: 0, base: null, commits: 0 };

  const range = base + '..HEAD';
  let commitCount = 0;
  try {
    const rl = gitFn(['rev-list', '--count', range], repoRoot).trim();
    commitCount = parseInt(rl, 10) || 0;
  } catch (err) {
    return { ok: false, leaks: [{ path: '(git)', evidence: 'rev-list --count failed: ' + err.message }], scanned_blobs: 0, base: base, commits: 0 };
  }
  if (commitCount === 0) return { ok: true, leaks: [], scanned_blobs: 0, base: base, commits: 0 };

  // NEW objects the push would send. Format: "<oid> <path>" (blobs/trees have a
  // path; commits do not). Dedup blobs by oid — a blob in N commits is scanned once.
  let objectsRaw;
  try {
    objectsRaw = gitFn(['rev-list', '--objects', range], repoRoot);
  } catch (err) {
    return { ok: false, leaks: [{ path: '(git)', evidence: 'rev-list --objects failed: ' + err.message }], scanned_blobs: 0, base: base, commits: commitCount };
  }
  const byOid = new Map(); // oid → path (first-seen path is representative)
  for (const raw of objectsRaw.split(/\r?\n/)) {
    if (!raw) continue;
    const sp = raw.indexOf(' ');
    if (sp === -1) continue;            // commit (no path) — skip
    const oid = raw.slice(0, sp);
    const p = raw.slice(sp + 1);
    if (!p) continue;
    if (!byOid.has(oid)) byOid.set(oid, p);
  }

  const leaks = [];
  let scanned = 0;
  for (const [oid, p] of byOid) {
    // type check — only blobs.
    let type;
    try {
      type = gitFn(['cat-file', '-t', oid], repoRoot).trim();
    } catch (e) {
      // R4/F2 — a security backstop must NOT skip a blob it cannot classify. A
      // swallowed `continue` here returns ok while a transient cat-file failure
      // could hide a leak. Fail-CLOSED via a scan-error (ok becomes false).
      leaks.push({ oid: oid, path: p, line: 0, pattern: 'scan-error', evidence: 'cat-file -t failed: ' + String((e && e.message) || 'unknown').slice(0, 160) });
      continue;
    }
    if (type !== 'blob') continue;
    let content;
    try {
      content = gitFn(['cat-file', 'blob', oid], repoRoot);
    } catch (e) {
      // R4/F2 — a >64MiB text blob throws maxBuffer here; the old `continue`
      // returned ok while leaving that blob UNSCANNED, so a repo-root path inside
      // it would reach the push. Fail-CLOSED — the operator must confirm no leak
      // (a receipt-corpus blob this large is anomalous by itself).
      leaks.push({ oid: oid, path: p, line: 0, pattern: 'scan-error', evidence: 'cat-file blob failed (unscanned, possibly >64MiB): ' + String((e && e.message) || 'unknown').slice(0, 160) });
      continue;
    }
    if (content.indexOf(String.fromCharCode(0)) !== -1) continue; // NUL byte => binary blob, skip
    scanned += 1;
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      for (const pat of patterns) {
        if (pat.re.test(lines[i])) {
          if (isAllowlisted(allowlist, p, lines[i])) continue;
          leaks.push({
            oid: oid,
            path: p,
            line: i + 1,
            pattern: pat.name,
            evidence: lines[i].trim().slice(0, 200),
          });
        }
      }
    }
  }
  return { ok: leaks.length === 0, leaks: leaks, scanned_blobs: scanned, base: base, commits: commitCount };
}

module.exports = {
  scanRange: scanRange,
  buildLeakPatterns: buildLeakPatterns,
  isAllowlisted: isAllowlisted,
  resolveBase: resolveBase,
  DEFAULT_OLD_REPO_NAMES: DEFAULT_OLD_REPO_NAMES,
  DEFAULT_ALLOWLIST: DEFAULT_ALLOWLIST,
};

// ── require.main CLI (invoked by pr.md Phase 3.1 pre-push gate) ────────────────
if (require.main === module) {
  const args = { base: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') args.base = argv[++i];
    else if (argv[i] === '--repo-root') args.repoRoot = argv[++i];
    else if (argv[i] === '--json') args.json = true;
  }
  let repoRoot = args.repoRoot;
  if (!repoRoot) {
    try { repoRoot = git(['rev-parse', '--show-toplevel'], process.cwd()).trim(); }
    catch (_e) { repoRoot = process.cwd(); }
  }
  const res = scanRange({ repoRoot: repoRoot, base: args.base });
  if (args.json) process.stdout.write(JSON.stringify(res, null, 2) + '\n');
  else {
    process.stdout.write('history-leak-scan: base=' + res.base + ' commits=' + res.commits +
      ' scanned_blobs=' + res.scanned_blobs + ' leaks=' + res.leaks.length + '\n');
    for (const l of res.leaks) {
      process.stderr.write('  LEAK ' + l.path + ':' + l.line + ' [' + l.pattern + '] ' + l.evidence + '\n');
    }
  }
  process.exit(res.ok ? 0 : 1);
}
