'use strict';

// meta-research — deterministic scaffold / register / lint for the research
// artifacts under `.claude/_meta/`. (meta-research-command M1)
//
// Three subcommands, each fail-closed:
//   scaffold --topic "<t>" [--slug <s>] [--date YYYY-MM-DD] [--json]
//   register --doc <repo-relative path>
//   lint [--doc <path> [--pre-register] | --all] [--json]
//
// The four lint checks (numbered like `instruction-contract/lint.js`):
//   L1 BAD_FILENAME       `<YYYY-MM-DD>-<slug>.md`                 spec docs only
//   L2 MISSING_COMPONENT  7 components / 9 inspection points       spec docs only
//   L3 PREMISES_*         >=1 premise row, parseable timestamp,
//                         reference path that exists inside repo   spec docs only
//   L4 NOT_INDEXED        reachable in one hop from README index   ALL docs
//
// APPLICABILITY SPLIT. The legacy `_meta/` documents predate this format and are
// NOT rewritten (renaming them breaks 6 inbound links). So L1/L2/L3 apply only
// to documents carrying a `**Status**` header line — i.e. scaffold output — and
// L4 applies to every `.md`. Exempted documents are ENUMERATED in `exempt[]`
// with a reason; the exemption is never silent. One predicate is shared by
// L1/L2/L3 so one exempt entry means one document, not one document per check.
//
// `repoRoot` HAS NO CLI SURFACE. The CLI derives it by walking up from
// `process.cwd()` to the git root; it is a module parameter only, so tests can
// inject a tmp fixture. A `--repo-root` flag would move the very thing the
// containment guards protect: this module WRITES (scaffold creates a document,
// register rewrites the README), so a caller-chosen root is write redirection,
// not scope selection. Precedent for the programmatic-only shape: CLAUDE.md
// §3.13 `intentDecision`. `impeccable-detect.js` does expose `--repo-root`, but
// it is a read-only detector — the difference is read vs write, not taste.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { assertContained } = require('./path-containment');
const { parseTableRows, splitTableRow, isSeparatorRow } = require('./markdown-table');

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FILENAME_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/;
const SHA_RE = /^[0-9a-f]{7,40}$/;

const INDEX_HEADING_RE = /^##\s+색인\s*$/;
const INDEX_HEADER_ROW_RE = /^\|\s*문서\s*\|\s*날짜\s*\|\s*상태\s*\|\s*한 줄\s*\|\s*$/;

const HEADER_KEYS = ['Status', 'Date', 'Topic'];
const REQUIRED_SECTIONS = [
  'Premises', 'Evidence', 'Prior Art', 'Precedent', 'Verdict', 'Open Questions',
];

// Lock tuning mirrors completion-ledger/store.js:79-81.
const LOCK_MAX_RETRIES = 50;
const LOCK_RETRY_MS = 20;
const LOCK_STALE_MS = 30000;

function warn(message) {
  process.stderr.write('[mccp:meta-research] ' + message + '\n');
}

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// --- repo / path derivation -------------------------------------------------

function findRepoRoot(cwd) {
  let dir = cwd || process.cwd();
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return cwd || process.cwd();
}

// metaDir and README are DERIVED, never arguments. Opening either to caller
// control would make the allowlist and `assertContained` guard a target the
// caller chose, i.e. both layers would check themselves.
function metaDirOf(repoRoot) {
  return path.join(repoRoot, '.claude', '_meta');
}

function readmeOf(repoRoot) {
  return path.join(metaDirOf(repoRoot), 'README.md');
}

// --- lexical screen ---------------------------------------------------------

// Five axes, checked BEFORE any filesystem call so an escape is never reported
// as the innocuous "file not found". Same ordering rationale as
// `instruction-contract/lint.js`. Returns a reason string, or null when clean.
function lexicalScreen(ref) {
  if (typeof ref !== 'string' || ref === '') return 'empty reference';
  if (ref.indexOf('\0') !== -1) return 'NUL byte in path';
  if (/^\\\\/.test(ref) || /^\/\//.test(ref)) return 'UNC path';
  if (/^[a-zA-Z]:/.test(ref)) return 'drive-letter path';
  if (ref.startsWith('/') || ref.startsWith('\\') || path.isAbsolute(ref)) return 'absolute path';
  if (ref.split(/[/\\]/).indexOf('..') !== -1) return 'parent traversal';
  return null;
}

// --- header block -----------------------------------------------------------

// Fixed grammar: `**Key**: value`, one line per key, value on the same line.
// register parses exactly this; blockquote / newline-separated variants are
// neither produced nor accepted (DD7 — one format, so one is canonical).
function headerValue(body, key) {
  const re = new RegExp('^\\*\\*' + key + '\\*\\*:[ \\t]*(.+?)[ \\t]*$', 'm');
  const m = String(body).match(re);
  if (!m) return null;
  const v = m[1].trim();
  return v === '' ? null : v;
}

function isSpecDoc(body) {
  return headerValue(body, 'Status') !== null;
}

function sectionOf(body, heading) {
  const lines = String(body).split(/\r?\n/);
  const start = lines.findIndex(function (l) {
    return new RegExp('^##\\s+' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$').test(l);
  });
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start + 1, end).join('\n');
}

// --- index table ------------------------------------------------------------

function detectEol(text) {
  return text.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
}

// Split into content lines while REMEMBERING each line's own terminator.
//
// `split(/\r?\n/)` + `join(detectedEol)` would rewrite the ending of every line
// in the file, so adding one index row to a mixed-EOL README silently reformats
// lines this command never touched (Codex santa R1 H2 — measured: 4 LF-only
// lines became 0). Keeping the terminators lets an untouched line stay
// byte-identical. The final element is the trailing segment after the last
// terminator (empty when the file ends with a newline), so join round-trips
// exactly.
function splitLinesPreservingEol(text) {
  const lines = [];
  const eols = [];
  const re = /\r\n|\n|\r/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    lines.push(text.slice(last, m.index));
    eols.push(m[0]);
    last = re.lastIndex;
  }
  lines.push(text.slice(last));
  eols.push('');
  return { lines: lines, eols: eols };
}

function joinLinesPreservingEol(lines, eols) {
  let out = '';
  for (let i = 0; i < lines.length; i++) out += lines[i] + (eols[i] || '');
  return out;
}

// Locate the `## 색인` table. Returns null when the section, its header row, or
// its separator is absent — register treats null as a hard stop (Task 0 backfill
// is its precondition), lint treats it as "nothing is indexed".
function locateIndexTable(lines) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (INDEX_HEADING_RE.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) { end = i; break; }
  }
  let headerIdx = -1;
  for (let i = start + 1; i < end; i++) {
    if (INDEX_HEADER_ROW_RE.test(lines[i])) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return null;
  const sepIdx = headerIdx + 1;
  if (sepIdx >= end || !isSeparatorRow(lines[sepIdx].trim())) return null;
  let rowEnd = sepIdx + 1;
  while (rowEnd < end && lines[rowEnd].trim().startsWith('|')) rowEnd++;
  return { start: start, end: end, headerIdx: headerIdx, sepIdx: sepIdx, rowStart: sepIdx + 1, rowEnd: rowEnd };
}

function linkTargetOf(rowLine) {
  const cells = splitTableRow(rowLine);
  if (!cells.length) return null;
  const m = cells[0].match(/\]\(([^)]*)\)/);
  return m ? m[1].trim() : null;
}

// Read the set of filenames reachable in one hop from the index.
function indexedTargets(repoRoot) {
  const readme = readmeOf(repoRoot);
  let text;
  try { text = fs.readFileSync(readme, 'utf8'); } catch (_e) { return new Set(); }
  const lines = splitLinesPreservingEol(text).lines;
  const t = locateIndexTable(lines);
  if (!t) return new Set();
  const out = new Set();
  for (let i = t.rowStart; i < t.rowEnd; i++) {
    const target = linkTargetOf(lines[i]);
    if (target) out.add(target);
  }
  return out;
}

function escapeCell(v) {
  return String(v).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

// --- lock + atomic write ----------------------------------------------------

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
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
    return Date.now() - fs.statSync(lockFile).mtimeMs > LOCK_STALE_MS;
  } catch (_e) { return false; }
}

// The critical section spans READ THROUGH RENAME. Guarding only the write
// leaves the same lost-update race: two processes each read the README, each
// add a different row, and the later rename silently drops the earlier row.
//
// WHAT THIS GUARANTEES AND WHAT IT DOES NOT. On the acquired path there is no
// lost update. On the NOT-acquired path we warn and proceed, so a lost update
// remains possible — this narrows the window loudly, it does not close it.
// fail-open is the right policy here because the index is a discovery aid, not
// an audit corpus (CLAUDE.md §3.6 splits lock policy on exactly that), and a
// stale lock must not halt research work. The loss is not silent: the dropped
// document surfaces as `NOT_INDEXED` on the next `lint --all`.
function withReadmeLock(readme, fn) {
  const lockFile = readme + '.lock';
  let acquired = false;
  for (let i = 0; i < LOCK_MAX_RETRIES; i++) {
    if (tryAcquire(lockFile)) { acquired = true; break; }
    if (isStaleLock(lockFile)) {
      try { fs.unlinkSync(lockFile); } catch (_e) { /* ignore */ }
      continue;
    }
    sleepSync(LOCK_RETRY_MS);
  }
  if (!acquired) {
    warn('could not acquire ' + lockFile + ' after '
      + (LOCK_MAX_RETRIES * LOCK_RETRY_MS) + 'ms; proceeding without lock '
      + '(race window open — a lost row self-reports as NOT_INDEXED on `lint --all`)');
  }
  try {
    return fn();
  } finally {
    if (acquired) {
      try { fs.unlinkSync(lockFile); } catch (_e) { /* ignore */ }
    }
  }
}

// Unique per call. A fixed `<target>.tmp` (the shape used by
// completion-ledger's writeFileAtomic) makes concurrent writers collide in the
// tmp stage itself — same reason CLAUDE.md §3.6 mandates `<target>.<pid>.<rand>.tmp`
// for the evidence write lock.
function tmpNameFor(target) {
  return target + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
}

function writeAtomic(target, content) {
  const tmp = tmpNameFor(target);
  fs.writeFileSync(tmp, content, 'utf8');
  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (_e) { /* ignore */ }
    throw err;
  }
}

// --- scaffold ---------------------------------------------------------------

function deriveSlug(topic) {
  return String(topic == null ? '' : topic)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function renderTemplate(topic, date) {
  return [
    '# ' + topic,
    '',
    '**Status**: active',
    '**Date**: ' + date,
    '**Topic**: ' + topic,
    '',
    '## Premises',
    '',
    '| # | 참조 | 시점 | 무엇을 전제하는가 |',
    '|---|---|---|---|',
    '',
    '## Evidence',
    '',
    '## Prior Art',
    '',
    '## Precedent',
    '',
    '## Verdict',
    '',
    '## Open Questions',
    '',
  ].join('\n');
}

// scaffold — writes a new research document. The `## Premises` table is born
// with zero data rows, so the document is DELIBERATELY lint-red on L3 until the
// premises are actually written (DD6). That red is what turns the PRD's primary
// metric ("premises stated, 100%") from an aspiration into a machine condition.
function scaffold(opts) {
  opts = opts || {};
  const repoRoot = opts.repoRoot || findRepoRoot(process.cwd());
  const topic = typeof opts.topic === 'string' ? opts.topic.trim() : '';
  if (!topic) throw fail('BAD_TOPIC', '--topic is required and must be non-empty');

  // `--date` is a path component too (`<date>-<slug>.md`), so it gets the same
  // strength of allowlist as the slug. The regex cannot express `/`, `\` or `.`,
  // so traversal dies before `path.join` normalizes anything.
  const date = opts.date == null || opts.date === '' ? isoToday() : String(opts.date);
  if (!DATE_RE.test(date)) {
    throw fail('BAD_DATE', 'invalid --date "' + date + '" (expected YYYY-MM-DD)');
  }

  const slug = opts.slug == null || opts.slug === '' ? deriveSlug(topic) : String(opts.slug);
  if (!SLUG_RE.test(slug)) {
    throw fail('BAD_SLUG', 'unusable slug "' + slug + '" derived from --topic; '
      + 'pass an explicit --slug matching ' + SLUG_RE.source);
  }

  const metaDir = metaDirOf(repoRoot);
  // Checked before the containment anchor: `assertContained` realpaths metaDir
  // first, so on a missing directory it dies with PATH_ESCAPES_GATE — a message
  // that hides the real cause. Not auto-created, so an incomplete Task 0
  // (README backfill) cannot be passed over silently.
  if (!fs.existsSync(metaDir)) {
    throw fail('META_DIR_MISSING', metaDir + ' does not exist (run the `## 색인` backfill first)');
  }

  // Layer 2 of the containment. The allowlist above cannot see symlinks; this
  // realpath anchor does not need to re-check the `..` the allowlist already
  // killed. Two layers looking at two different things.
  assertContained(metaDir, repoRoot);
  const realMeta = fs.realpathSync(metaDir);
  const filename = date + '-' + slug + '.md';
  const target = path.join(realMeta, filename);

  if (fs.existsSync(target)) {
    throw fail('DOC_EXISTS', target + ' already exists (refusing to overwrite)');
  }
  fs.writeFileSync(target, renderTemplate(topic, date), 'utf8');
  return { ok: true, path: target, filename: filename, slug: slug, date: date };
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

// --- register ---------------------------------------------------------------

// Resolve a `--doc` argument against the same three-step screen L3 uses.
// `--doc` is confined to `_meta/` for the same reason the README path is not an
// argument: a document outside `_meta/` would be indexed under a link target
// that is its basename, i.e. a broken link that L4 (which only asks "is it
// listed?") cannot detect.
function resolveDocArg(repoRoot, doc) {
  if (typeof doc !== 'string' || doc.trim() === '') {
    throw fail('BAD_DOC', '--doc is required');
  }
  const rel = doc.trim();
  const bad = lexicalScreen(rel);
  if (bad) throw fail('DOC_OUTSIDE_META', '--doc rejected (' + bad + '): ' + rel);
  const joined = path.join(repoRoot, rel);
  if (!fs.existsSync(joined)) throw fail('DOC_NOT_FOUND', 'no such document: ' + joined);
  const metaDir = metaDirOf(repoRoot);
  if (!fs.existsSync(metaDir)) {
    throw fail('META_DIR_MISSING', metaDir + ' does not exist');
  }
  try {
    assertContained(joined, metaDir);
  } catch (err) {
    throw fail('DOC_OUTSIDE_META', '--doc must live under .claude/_meta/: ' + err.message);
  }
  return joined;
}

function register(opts) {
  opts = opts || {};
  const repoRoot = opts.repoRoot || findRepoRoot(process.cwd());
  const docPath = resolveDocArg(repoRoot, opts.doc);
  const body = fs.readFileSync(docPath, 'utf8');

  // All three columns come from the document header — there are no extra
  // arguments. Missing or empty means exit 1: an index is not filled with blanks.
  const meta = {};
  for (const key of HEADER_KEYS) {
    const v = headerValue(body, key);
    if (v === null) {
      throw fail('MISSING_HEADER_FIELD', 'document header lacks **' + key + '**: ' + docPath);
    }
    meta[key] = v;
  }

  const readme = readmeOf(repoRoot);
  const filename = path.basename(docPath);

  // PREFLIGHT BEFORE ANY WRITE. Deferring the structural check until after a
  // write attempt makes the failure look like "died mid-write" and hides that
  // the cause is the README's structure. No tmp file is created on this path.
  let readmeText;
  try { readmeText = fs.readFileSync(readme, 'utf8'); }
  catch (_e) { throw fail('INDEX_SECTION_MISSING', 'cannot read ' + readme); }
  if (!locateIndexTable(splitLinesPreservingEol(readmeText).lines)) {
    throw fail('INDEX_SECTION_MISSING',
      readme + ' has no `## 색인` table with the `| 문서 | 날짜 | 상태 | 한 줄 |` header row');
  }

  return withReadmeLock(readme, function () {
    // Re-read inside the critical section: the preflight copy above may be
    // stale by the time the lock is held.
    const text = fs.readFileSync(readme, 'utf8');
    const split = splitLinesPreservingEol(text);
    const lines = split.lines;
    const eols = split.eols;
    const t = locateIndexTable(lines);
    if (!t) {
      throw fail('INDEX_SECTION_MISSING', readme + ' lost its `## 색인` table between preflight and write');
    }

    const row = '| [' + escapeCell(filename) + '](' + escapeCell(filename) + ') | '
      + escapeCell(meta.Date) + ' | ' + escapeCell(meta.Status) + ' | ' + escapeCell(meta.Topic) + ' |';

    let replacedAt = -1;
    for (let i = t.rowStart; i < t.rowEnd; i++) {
      if (linkTargetOf(lines[i]) === filename) { replacedAt = i; break; }
    }
    if (replacedAt !== -1) {
      // Replace the content only; the line keeps its own terminator.
      lines[replacedAt] = row;
    } else {
      const at = t.rowEnd;
      const prevEol = eols[at - 1];
      if (prevEol === '') {
        // The line above was the file's final, unterminated line. Terminate it
        // with the file's dominant style and let the new row end the file.
        eols[at - 1] = detectEol(text);
        lines.splice(at, 0, row);
        eols.splice(at, 0, '');
      } else {
        // Adopt the local convention rather than a file-wide guess.
        lines.splice(at, 0, row);
        eols.splice(at, 0, prevEol);
      }
    }

    writeAtomic(readme, joinLinesPreservingEol(lines, eols));
    return { ok: true, readme: readme, doc: docPath, row: row, updated: replacedAt !== -1 };
  });
}

// --- lint -------------------------------------------------------------------

function stripRef(cell) {
  return String(cell == null ? '' : cell)
    .trim()
    .replace(/^`+|`+$/g, '')
    .trim()
    // A `path:12` / `path:98-102` citation is the normal shape in this repo.
    // Without this strip every legitimate citation fails the existence check.
    .replace(/:\d+(?:-\d+)?$/, '')
    .trim();
}

function checkPremises(repoRoot, filename, body, violations) {
  const section = sectionOf(body, 'Premises');
  const rows = section === null ? [] : parseTableRows(section);
  if (!rows.length) {
    violations.push({ doc: filename, check: 'L3', code: 'PREMISES_EMPTY', detail: '## Premises has no data rows' });
    return;
  }
  for (const cells of rows) {
    const ref = stripRef(cells[1]);
    const when = String(cells[2] == null ? '' : cells[2]).trim().replace(/^`+|`+$/g, '').trim();

    if (!SHA_RE.test(when) && !DATE_RE.test(when)) {
      violations.push({ doc: filename, check: 'L3', code: 'BAD_TIMESTAMP', detail: when });
    }

    // An empty reference cell would `path.join` to repoRoot itself, which
    // exists — so it must be rejected explicitly rather than fall through to
    // the existence check. It is an absent citation, not an escape.
    if (!ref) {
      violations.push({ doc: filename, check: 'L3', code: 'REF_NOT_FOUND', detail: '(empty reference cell)' });
      continue;
    }

    // Order is fixed: lexical screen, then existence, then realpath anchor.
    const bad = lexicalScreen(ref);
    if (bad) {
      violations.push({ doc: filename, check: 'L3', code: 'REF_OUTSIDE_REPO', detail: ref });
      continue;
    }
    const joined = path.join(repoRoot, ref);
    if (!fs.existsSync(joined)) {
      violations.push({ doc: filename, check: 'L3', code: 'REF_NOT_FOUND', detail: ref });
      continue;
    }
    // The only thing this layer catches that the lexical screen cannot: a
    // symlink escape. Existence is already proven, so realpath is safe here.
    try {
      assertContained(joined, repoRoot);
    } catch (_err) {
      violations.push({ doc: filename, check: 'L3', code: 'REF_OUTSIDE_REPO', detail: ref });
    }
  }
}

function lintDoc(repoRoot, docPath, indexed, opts) {
  opts = opts || {};
  const filename = path.basename(docPath);
  const violations = [];
  const body = fs.readFileSync(docPath, 'utf8');
  const spec = isSpecDoc(body);

  if (spec) {
    if (!FILENAME_RE.test(filename)) {
      violations.push({ doc: filename, check: 'L1', code: 'BAD_FILENAME', detail: filename });
    }
    // 7 components, 9 inspection points: the header block counts as one
    // component but each of its three keys is checked separately — testing only
    // "is there a header block?" lets a document missing **Topic** through.
    for (const key of HEADER_KEYS) {
      if (headerValue(body, key) === null) {
        violations.push({ doc: filename, check: 'L2', code: 'MISSING_COMPONENT', detail: '**' + key + '**' });
      }
    }
    for (const heading of REQUIRED_SECTIONS) {
      if (sectionOf(body, heading) === null) {
        violations.push({ doc: filename, check: 'L2', code: 'MISSING_COMPONENT', detail: '## ' + heading });
      }
    }
    checkPremises(repoRoot, filename, body, violations);
  }

  // L4 runs on every document, spec or legacy — that is what keeps the PRD's
  // discoverability metric intact after narrowing L1/L2/L3.
  if (!opts.preRegister && !indexed.has(filename)) {
    violations.push({ doc: filename, check: 'L4', code: 'NOT_INDEXED', detail: filename });
  }

  return { spec: spec, violations: violations };
}

function lint(opts) {
  opts = opts || {};
  const repoRoot = opts.repoRoot || findRepoRoot(process.cwd());
  const metaDir = metaDirOf(repoRoot);

  let docs;
  if (opts.all) {
    if (!fs.existsSync(metaDir)) throw fail('META_DIR_MISSING', metaDir + ' does not exist');
    docs = fs.readdirSync(metaDir)
      .filter(function (f) { return f.endsWith('.md') && f !== 'README.md'; })
      .sort()
      .map(function (f) { return path.join(metaDir, f); });
  } else {
    docs = [resolveDocArg(repoRoot, opts.doc)];
  }

  const indexed = opts.preRegister ? new Set() : indexedTargets(repoRoot);
  const violations = [];
  const exempt = [];
  for (const docPath of docs) {
    const r = lintDoc(repoRoot, docPath, indexed, { preRegister: !!opts.preRegister });
    for (const v of r.violations) violations.push(v);
    // One entry per exempt document, not one per skipped check — so
    // `exempt.length` reads as a document count.
    if (!r.spec) exempt.push({ doc: path.basename(docPath), reason: 'no-status-header' });
  }
  return { ok: violations.length === 0, scanned: docs.length, violations: violations, exempt: exempt };
}

module.exports = {
  scaffold: scaffold,
  register: register,
  lint: lint,
  // exported for tests / reuse
  findRepoRoot: findRepoRoot,
  metaDirOf: metaDirOf,
  readmeOf: readmeOf,
  lexicalScreen: lexicalScreen,
  deriveSlug: deriveSlug,
  headerValue: headerValue,
  locateIndexTable: locateIndexTable,
  indexedTargets: indexedTargets,
  splitLinesPreservingEol: splitLinesPreservingEol,
  stripRef: stripRef,
  tmpNameFor: tmpNameFor,
  SLUG_RE: SLUG_RE,
  DATE_RE: DATE_RE,
  FILENAME_RE: FILENAME_RE,
  REQUIRED_SECTIONS: REQUIRED_SECTIONS,
  HEADER_KEYS: HEADER_KEYS,
};

// --- CLI --------------------------------------------------------------------

function parseArgs(argv) {
  const args = { topic: null, slug: null, date: null, doc: null, all: false, preRegister: false, json: false };
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--all') args.all = true;
    else if (a === '--pre-register') args.preRegister = true;
    else if (a === '--topic') args.topic = argv[++i];
    else if (a === '--slug') args.slug = argv[++i];
    else if (a === '--date') args.date = argv[++i];
    else if (a === '--doc') args.doc = argv[++i];
    else {
      process.stderr.write('[mccp:meta-research] unknown argument: ' + a + '\n');
      process.exit(2);
    }
  }
  return args;
}

const USAGE = 'Usage: meta-research.js <scaffold|register|lint> [options]\n'
  + '  scaffold --topic "<t>" [--slug <s>] [--date YYYY-MM-DD] [--json]\n'
  + '  register --doc <path under .claude/_meta/>\n'
  + '  lint [--doc <path> [--pre-register] | --all] [--json]\n';

if (require.main === module) {
  const sub = process.argv[2];
  if (['scaffold', 'register', 'lint'].indexOf(sub) === -1) {
    process.stderr.write(USAGE);
    process.exit(2);
  }
  const args = parseArgs(process.argv);
  // The CLI never reads a root from its arguments.
  const repoRoot = findRepoRoot(process.cwd());

  try {
    if (sub === 'scaffold') {
      const r = scaffold({ repoRoot: repoRoot, topic: args.topic, slug: args.slug, date: args.date });
      process.stdout.write(args.json ? JSON.stringify(r) + '\n' : r.path + '\n');
      process.exit(0);
    }
    if (sub === 'register') {
      const r = register({ repoRoot: repoRoot, doc: args.doc });
      process.stdout.write(args.json
        ? JSON.stringify(r) + '\n'
        : (r.updated ? 'updated' : 'added') + ' index row for ' + path.basename(r.doc) + '\n');
      process.exit(0);
    }
    // lint
    if (args.all && args.preRegister) {
      process.stderr.write('[mccp:meta-research] --pre-register is --doc only '
        + '(a full scan has no notion of "not yet registered")\n');
      process.exit(2);
    }
    if (!args.all && !args.doc) {
      process.stderr.write(USAGE);
      process.exit(2);
    }
    const r = lint({ repoRoot: repoRoot, doc: args.doc, all: args.all, preRegister: args.preRegister });
    if (args.json) {
      process.stdout.write(JSON.stringify(r) + '\n');
    } else {
      process.stdout.write('meta-research lint: scanned ' + r.scanned
        + ' · violations ' + r.violations.length + ' · exempt ' + r.exempt.length + '\n');
      for (const v of r.violations) {
        process.stdout.write('  [' + v.check + '/' + v.code + '] ' + v.doc + ' — ' + v.detail + '\n');
      }
      for (const e of r.exempt) {
        process.stdout.write('  (exempt: ' + e.doc + ' — ' + e.reason + ')\n');
      }
    }
    process.exit(r.ok ? 0 : 1);
  } catch (err) {
    process.stderr.write('[mccp:meta-research] ' + (err.code || 'ERROR') + ': ' + err.message + '\n');
    process.exit(1);
  }
}
