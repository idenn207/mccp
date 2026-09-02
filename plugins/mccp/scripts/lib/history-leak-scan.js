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

// Documented DEFAULT allowlist — the sanctioned intentional occurrences.
// This scanner's OWN test fixture MUST embed a `<drive>…my-claude-code-plugin`
// literal to prove the gate catches the old-repo path class; the fixture is
// unavoidable and there is exactly one. Entries are LINE/FIXTURE-specific
// (exact path + a marker the line must contain) — NEVER directory-wide (Codex
// IF3), so they can never mask a real leak: a current repo-root path, or a leak
// in any OTHER file, is still caught. Callers may pass additional allowlist
// entries; they are merged on top of this default.
//
// The second entry is the same category one layer up: the backlog line that
// REPORTS this scanner's URL-scheme false positive quotes both the drive-letter
// path class it targets and the offending match string verbatim, as its
// evidence. Suppressing that quotation is not a weakening — a bug report about
// a detector has to be allowed to name what the detector matches, exactly as
// the fixture above has to embed what it proves. The marker is a citation
// unique to that one line (`history-leak-scan.js:90`), NOT the old-repo name:
// keying on the name would exempt every future backlog line that happens to
// mention it, and this file accumulates arbitrary findings. If that line is
// ever rewritten, the exemption lapses and the gate fires again — fail-closed,
// which is the correct direction for an allowlist to fail.
const DEFAULT_ALLOWLIST = Object.freeze([
  {
    path: 'plugins/mccp/scripts/lib/tests/history-leak-scan.test.js',
    contains: 'my-claude-code-plugin',
  },
  {
    path: '.claude/plans/codex-findings-backlog.md',
    contains: 'history-leak-scan.js:90',
  },
  // Third entry, same category as the second: the backlog line that REJECTS an
  // L2 security finding about hook-trace does so by QUOTING the absolute path the
  // running hook actually produced, because that measurement IS the refutation —
  // the claim was that anchoring at the git toplevel would introduce a leak, and
  // the evidence is that `event.cwd` already produced a longer absolute path
  // before the change. Redacting the quotation would leave the rejection asserting
  // a measurement it no longer shows, which is the same bind the entry above
  // resolves for this scanner's own false-positive report.
  //
  // The marker is the finding digest — unique to that one line, and not a word
  // this file otherwise accumulates. Keying on `hook-trace` or on the repo name
  // would exempt every future backlog row that happens to mention either. If the
  // line is ever rewritten the digest goes with it, the exemption lapses, and the
  // gate fires again — fail-closed, which is the correct direction.
  {
    path: '.claude/plans/codex-findings-backlog.md',
    contains: 'digest 22877fd2',
  },
  // Fourth entry, same category as the second — and the reason it needs its own
  // row rather than a broader key. The M9 snapshot artifact is a derived capture
  // of the backlog, so it carries a VERBATIM copy of the entry-2 line into a
  // second path. Entry 2 exempts that line where it is authored; this scanner
  // deliberately evaluates the allowlist PER PATH (see the scan loop below), so
  // the copy is reported — which is correct behaviour for laundering in general
  // and merely path-scoped here, because the bytes are the same already-sanctioned
  // bug report about what this detector matches.
  //
  // The marker is entry 2's marker, on purpose. Keying the exemption to the same
  // unique citation means the two rows cannot drift apart: if that finding is
  // ever rewritten, BOTH exemptions lapse together and the gate fires again.
  // Keying on the old-repo name instead would exempt every future line in a
  // snapshot that happens to mention it, and snapshots capture arbitrary content.
  {
    path: 'docs/multi-session-work-loop/m9-after.json',
    contains: 'history-leak-scan.js:90',
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
  // F4 (Codex R4) — Windows paths are case-INSENSITIVE: `X:\parent\repo` and
  // `x:\parent\repo` name the SAME repo root, so a leak line with a differently-
  // cased drive letter or segment would slip past a case-sensitive regex compiled
  // from the one casing `repoRoot` happens to emit (examples are synthetic on
  // purpose — a comment must never embed THIS repo's real root, or the case-
  // insensitive pattern below would flag its own source, per line ~66). Compile the
  // repo-root pattern case-insensitively when the root is a drive-letter (Windows)
  // path; POSIX roots stay case-sensitive because their filesystems are (a
  // case-variant there is a genuinely different path, and `i` would over-match).
  // The old-repo drive-letter patterns are Windows by construction → always `i`.
  const winStyle = /^[A-Za-z]:/.test(rootFwd);
  const patterns = [
    { name: 'repo-root', re: new RegExp(sepFlexible, winStyle ? 'i' : '') },
  ];
  for (const nm of (oldNames || DEFAULT_OLD_REPO_NAMES)) {
    // drive-letter path (any separator run) that ends in the old repo name.
    //
    // The lookbehind is what makes "drive letter" mean a drive letter. Without
    // it, `[A-Za-z]:` also matches the LAST letter of any URL scheme, so
    // `https://host/<old-name>` read as a path and the gate blocked a push over
    // a stale hyperlink — a false positive that costs exactly as much as a miss,
    // because the only ways out are rewriting history or allowlisting a line
    // that was never a leak. A real drive letter is never preceded by another
    // alphanumeric; a scheme's final letter always is.
    patterns.push({
      name: 'old-repo:' + nm,
      re: new RegExp('(?<![A-Za-z0-9])[A-Za-z]:[\\\\/][^\\s"\'`]*' + escapeRe(nm), 'i'),
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
  if (!base) {
    // F3 (M2 follow-up, Codex R3) — an UNRESOLVED base is NOT an empty range; it is
    // an unclassified range. As the mandatory pre-push backstop, returning ok:true
    // here would publish HEAD without scanning ANY range commit (including the
    // ancestor-only old-blob disclosure paths F1 exists to catch) whenever
    // opts.base, origin/main, origin/master, main, and master are ALL absent (bare
    // CI checkout, detached env). That silently voids the fail-closed guarantee the
    // rest of scanRange upholds. Fail-CLOSED — the caller must supply a resolvable
    // base (pass an explicit --base <sha>).
    return {
      ok: false,
      leaks: [{ path: '(git)', line: 0, pattern: 'scan-error', evidence: 'no base ref resolved (tried opts.base, origin/main, origin/master, main, master) — cannot classify NEW objects; pass an explicit --base' }],
      scanned_blobs: 0,
      base: null,
      commits: 0,
    };
  }

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
  // R5-F3 (M2 Task 2) — collect EVERY path each NEW blob is reachable at, not
  // just the first. `git rev-list --objects` annotates each object with only its
  // FIRST-seen path (empirically: a blob at two paths emits ONE object line), so
  // the old `oid → representative path` map let an allowlisted fixture path MASK a
  // real leak on a sibling path of the SAME blob (identical content). The
  // allowlist is now evaluated PER PATH in the scan loop below, so a blob reaching
  // an allowlisted path AND a non-allowlisted path still reports the latter.
  const byOid = new Map(); // oid → paths[] (representative first; all tree paths appended)
  const commits = [];      // bare-sha lines in rev-list --objects are commits (root tree has an empty path)
  for (const raw of objectsRaw.split(/\r?\n/)) {
    if (!raw) continue;
    const sp = raw.indexOf(' ');
    if (sp === -1) { commits.push(raw); continue; }   // commit (no path) — reused for the ls-tree walk
    const oid = raw.slice(0, sp);
    const p = raw.slice(sp + 1);
    if (!p) continue;                                 // root tree line ("<sha> ") — empty path, skip
    if (!byOid.has(oid)) byOid.set(oid, []);
    const arr = byOid.get(oid);
    if (arr.indexOf(p) === -1) arr.push(p);
  }
  // F1 (M2 follow-up, Codex R2) — base tree (oid+path) set. `rev-list --objects
  // base..HEAD` seeds byOid with NEW blobs only, so an OLD (base-reachable) blob
  // re-referenced at a range-introduced path is invisible there. To tell a
  // range-introduced disclosure path apart from an unchanged base path during the
  // ls-tree walk below, we need to know exactly which (oid,path) pairs base already
  // published. `git ls-tree -r <base>` lists every leaf blob (path→oid) in base.
  // Build a `oid\0path` membership set; a walk entry whose pair is in base is
  // unchanged (already public) and skipped, everything else is range-introduced and
  // scanned. Fail-CLOSED on error (we cannot classify without the base tree).
  const baseTree = new Set();
  {
    let baseRaw;
    try {
      baseRaw = gitFn(['ls-tree', '-r', base], repoRoot);
    } catch (err) {
      return { ok: false, leaks: [{ path: '(git)', evidence: 'ls-tree -r ' + base + ' (base) failed: ' + String((err && err.message) || 'unknown').slice(0, 160) }], scanned_blobs: 0, base: base, commits: commitCount };
    }
    for (const line of baseRaw.split(/\r?\n/)) {
      if (!line) continue;
      const tab = line.indexOf('\t');
      if (tab === -1) continue;
      const oid = line.slice(0, tab).split(/\s+/)[2];
      const p = line.slice(tab + 1);
      if (!oid || !p) continue;
      baseTree.add(oid + '\0' + p);
    }
  }
  // Walk EVERY range commit's full tree. `git ls-tree -r <commit>` lists every leaf
  // blob (path→oid) in that commit — so a path introduced in an INTERMEDIATE commit
  // and deleted before HEAD is still enumerated here (this is what preserves the
  // ancestor-leak guarantee, F-H). Fold a (oid,path) when the blob is NEW (in byOid
  // from rev-list) OR it is an OLD blob at a pair base did NOT publish — a range-
  // introduced disclosure path onto pre-existing content. This closes F1 (Codex
  // R2): a copy of a base-existing leaking blob to a non-allowlisted path is now
  // scanned even if a later range commit deletes it before HEAD, because we read the
  // full tree of EVERY range commit (not just the net base..HEAD diff, which missed
  // ancestor-only paths). Unchanged base paths (pair in baseTree) are already public
  // → skipped. A ls-tree failure is fail-CLOSED. Test gitFn stubs that emit no
  // bare-commit line leave `commits` empty, so this walk is skipped.
  for (const c of commits) {
    let treeRaw;
    try {
      treeRaw = gitFn(['ls-tree', '-r', c], repoRoot);
    } catch (err) {
      return { ok: false, leaks: [{ path: '(git)', evidence: 'ls-tree -r ' + c + ' failed: ' + String((err && err.message) || 'unknown').slice(0, 160) }], scanned_blobs: 0, base: base, commits: commitCount };
    }
    for (const line of treeRaw.split(/\r?\n/)) {
      if (!line) continue;
      const tab = line.indexOf('\t');
      if (tab === -1) continue;                        // "<mode> <type> <oid>\t<path>"
      const oid = line.slice(0, tab).split(/\s+/)[2];
      const p = line.slice(tab + 1);
      if (!oid || !p) continue;
      // OLD blob at an unchanged base path → already public, skip. Otherwise fold
      // (NEW blob, or OLD blob at a range-introduced path/content).
      if (!byOid.has(oid) && baseTree.has(oid + '\0' + p)) continue;
      if (!byOid.has(oid)) byOid.set(oid, []);
      const arr = byOid.get(oid);
      if (arr.indexOf(p) === -1) arr.push(p);
    }
  }

  const leaks = [];
  let scanned = 0;
  for (const [oid, paths] of byOid) {
    const repPath = paths[0]; // blob-level scan-errors report a representative path
    // type check — only blobs.
    let type;
    try {
      type = gitFn(['cat-file', '-t', oid], repoRoot).trim();
    } catch (e) {
      // R4/F2 — a security backstop must NOT skip a blob it cannot classify. A
      // swallowed `continue` here returns ok while a transient cat-file failure
      // could hide a leak. Fail-CLOSED via a scan-error (ok becomes false).
      leaks.push({ oid: oid, path: repPath, line: 0, pattern: 'scan-error', evidence: 'cat-file -t failed: ' + String((e && e.message) || 'unknown').slice(0, 160) });
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
      leaks.push({ oid: oid, path: repPath, line: 0, pattern: 'scan-error', evidence: 'cat-file blob failed (unscanned, possibly >64MiB): ' + String((e && e.message) || 'unknown').slice(0, 160) });
      continue;
    }
    if (content.indexOf(String.fromCharCode(0)) !== -1) continue; // NUL byte => binary blob, skip
    scanned += 1;
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      for (const pat of patterns) {
        if (pat.re.test(lines[i])) {
          // Per-path allowlist — a match is suppressed only for the exact path(s)
          // an allowlist entry names; the SAME leaking line on a non-allowlisted
          // path of the same blob is still reported (R5-F3 fix).
          for (const p of paths) {
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
