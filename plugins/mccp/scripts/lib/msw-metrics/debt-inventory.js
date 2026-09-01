'use strict';

// debt-inventory — M10's denominator and its disposition ledger.
//
// WHAT THIS IS. Three ledgers accumulate findings in this repo and none of them
// records that a finding was dealt with: the backlog markdown table, the
// findings registry shards, and the fix-task slot. This module normalizes all
// three into one immutable inventory (the denominator), and records a
// disposition for every item in a SEPARATE append-only ledger.
//
// WHY THE DISPOSITIONS ARE NOT WRITTEN INTO THE REGISTRY. `computeC1` divides
// closed findings by all findings with no work-unit attribution check, while
// C1's frozen numerator is "findings resolved WITHIN THE SAME WORK UNIT". If
// M10 closed another work unit's finding in the registry, that closure would be
// counted in the numerator it is by definition not part of — the exact
// manipulation the PRD's integrity rule names. `state/cli.js` already reached
// this conclusion and writes attribution to a sidecar for the same reason. So
// the registry is not touched here, C1 does not move, and a low C1 stays
// readable as what it is: findings are not being resolved where they are found.
//
// THREAT MODEL. Same as the M8 and M9 coverage gates: this guards against an
// unclaimed flip and against producer drift, not against a forger. Anyone who
// can run node with write access to this repo can write these files directly.
// That is stated rather than defended.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const backlogSource = require('../../derive/sources/backlog');
const registry = require('../../state/findings-registry');

const INVENTORY_REL = 'docs/multi-session-work-loop/debt-inventory.json';
const DISPOSITIONS_REL = 'docs/multi-session-work-loop/debt-dispositions.jsonl';

const SOURCES = ['backlog', 'findings', 'fix-task'];

// Severity tokens, longest-first so CRITICAL is not shadowed while scanning a
// cell like "CRITICAL/HIGH".
const SEVERITY_TOKENS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'FAIL'];
const ADJUDICABLE_SEVERITIES = ['CRITICAL', 'HIGH'];

// Disposition vocabulary. Six terms, deliberately distinct from the registry's
// CLOSURE_TYPES: these describe what a human decided about a debt item, not a
// finding lifecycle transition, and conflating the two is how a third vocabulary
// silently becomes a fourth.
const DISPOSITIONS = ['fixed', 'obsolete', 'superseded', 'duplicate', 'rejected', 'deferred'];

// Which dispositions may suppress a finding from the SessionStart promotion
// list. This mirrors `RESOLVING_CLOSURE_TYPES` in the registry, which already
// fixed this boundary in code: "앞 둘만 해소다 — 이연·강등·기각을 해소로 계상하는
// 것이 UI5가 금지하는 조작 경로".
//
// The plan's Task 3 said "처분된 finding_id를 SessionStart 목록에서 내린다" without
// splitting the vocabulary, and three independent L2 perspectives (architect,
// security, invariant) each landed a HIGH on it: a still-open CRITICAL marked
// `deferred` would vanish from the next session's list while the registry still
// reports it open and C1 still counts it unresolved — M7's "발견과 해소 사이의
// 유실이 사라진다" turned off while the gate reads green. `deferred` and
// `rejected` are therefore NOT suppressing: deferring a finding moves who will
// fix it, never whether the next session is told about it.
const SUPPRESSING_DISPOSITIONS = ['fixed', 'obsolete', 'superseded', 'duplicate'];

const SHA_RE = /^[0-9a-f]{40}$/;
const PR_RE = /^#\d+$/;
const PATH_LINE_RE = /^(.+):(\d+)$/;
// Uppercase only, and only these two words. The canonical marker the repo
// writes is `**ABSORBED in … **` / `RESOLVED`. Widening this to the Korean verb
// 흡수 matched 218 rows instead of 45, because "R1 흡수" is ordinary prose in a
// finding's body — and this marker grants a machine `superseded` disposition, so
// a loose match retires debt nobody retired.
const ABSORBED_MARKER_RE = /ABSORBED|RESOLVED/;

// Panel rows are written by plan-review/backlog-append as
// `L2 <perspective>: <claim, possibly truncated> · 원문 <path> · id=<digest>`.
// The claim has to be lifted back out before hashing, because the registry
// stores only `claim_digest` — there is no claim text on that side to prefix-
// match against, so anything short of the exact claim can never link.
//
// A truncated claim (trailing `…`) is reported as unlinkable rather than hashed:
// its digest would be a digest of a different string, and a link is what grants
// a machine `duplicate` disposition.
const PANEL_PREFIX_RE = /^L\d+\s+[\w-]+:\s*/;
const PANEL_SUFFIX_RE = /\s*·\s*원문[\s\S]*$/;

function extractClaim(cell) {
  const raw = String(cell == null ? '' : cell);
  if (!PANEL_PREFIX_RE.test(raw)) return { claim: raw.trim(), truncated: false, panel: false };
  const body = raw.replace(PANEL_PREFIX_RE, '').replace(PANEL_SUFFIX_RE, '').trim();
  return { claim: body, truncated: /…$/.test(body), panel: true };
}

class DebtInventoryError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'DebtInventoryError';
    this.code = code || 'DEBT_INVENTORY_ERROR';
  }
}

// ── severity ─────────────────────────────────────────────────────────────────
//
// The backlog's severity cell is free text — 58 distinct spellings in the live
// file, including `HIGH→기각`, `~~MEDIUM~~ **ABSORBED …**` and `CRITICAL/HIGH`.
// Take the first enum token that appears. A cell with none is UNKNOWN, never
// silently downgraded: an item whose severity cannot be read must not be able
// to slip below the CRITICAL/HIGH adjudication bar by being unreadable.
function normalizeSeverity(cell) {
  const text = String(cell == null ? '' : cell).toUpperCase();
  let best = null;
  let bestAt = Infinity;
  for (const token of SEVERITY_TOKENS) {
    const at = text.indexOf(token);
    if (at !== -1 && at < bestAt) { best = token; bestAt = at; }
  }
  return best || 'UNKNOWN';
}

// ── evidence ─────────────────────────────────────────────────────────────────
//
// Four accepted forms. The path component of every one of them goes through the
// registry's `normalizeCitedPath`, which is field-name agnostic and already
// folds absolute paths and `..` traversal to OUTSIDE_REPO — writing a second
// normalizer here is how the two drift.
//
// The bare-path form exists only for `--successor`. Without it a deferral has no
// form it can take and would either become unusable or route around
// normalization entirely.
function classifyEvidence(value, repoRoot, opts) {
  const allowBarePath = !!(opts && opts.allowBarePath);
  const raw = String(value == null ? '' : value).trim();
  if (raw === '') return { ok: false, reason: 'empty' };

  if (SHA_RE.test(raw)) return { ok: true, kind: 'commit', value: raw };
  if (PR_RE.test(raw)) return { ok: true, kind: 'pr', value: raw };

  const m = PATH_LINE_RE.exec(raw);
  if (m) {
    const norm = registry.normalizeCitedPath(m[1], repoRoot);
    if (!norm || norm === registry.OUTSIDE_REPO) {
      return { ok: false, reason: 'path outside repository: ' + m[1] };
    }
    return { ok: true, kind: 'path-line', value: norm + ':' + m[2], path: norm, line: Number(m[2]) };
  }

  if (allowBarePath) {
    const norm = registry.normalizeCitedPath(raw, repoRoot);
    if (!norm || norm === registry.OUTSIDE_REPO) {
      return { ok: false, reason: 'path outside repository: ' + raw };
    }
    return { ok: true, kind: 'path', value: norm, path: norm };
  }

  return {
    ok: false,
    reason: 'not one of: <path>:<line>, 40-hex commit sha, #<pr>' +
      ' (a bare path is accepted only for --successor)',
  };
}

// ── sources ──────────────────────────────────────────────────────────────────

function collectBacklog(repoRoot) {
  const scan = backlogSource.scanBacklog(repoRoot);
  if (!scan.ok) return { ok: false, items: [], error: scan.error };
  const items = scan.items.map(function (it) {
    const id = backlogSource.rowId(it);
    const claim = extractClaim(it.finding);
    return {
      item_id: 'backlog:' + id,
      source: 'backlog',
      severity: normalizeSeverity(it.severity),
      claim_digest: claim.truncated ? null : registry.claimDigestOf(claim.claim),
      claim_truncated: claim.truncated,
      absorbed_marker: ABSORBED_MARKER_RE.test(it.severity + ' ' + it.finding),
      coords: {
        row_id: id,
        date: it.date,
        severity_cell: it.severity,
        source_plan: it.source_plan,
        panel_row: claim.panel,
      },
    };
  });
  return { ok: true, items, error: null };
}

function collectFindings(repoRoot) {
  let all;
  try {
    // `readAll` takes an options object, not a path. Passing a string silently
    // falls through to `discoverRepoRoot`, which reads whatever repo the
    // process happens to stand in — the fixture asserts against that mistake.
    all = registry.readAll({ repoRoot: repoRoot });
  } catch (err) {
    return { ok: false, items: [], error: err.message };
  }
  const list = (all && Array.isArray(all.findings)) ? all.findings : [];
  const items = list
    .filter(function (f) { return f && f.state === 'open'; })
    .map(function (f) {
      return {
        item_id: 'findings:' + f.finding_id,
        source: 'findings',
        severity: normalizeSeverity(f.severity),
        claim_digest: f.claim_digest || null,
        absorbed_marker: false,
        coords: {
          finding_id: f.finding_id,
          work_unit: f.work_unit,
          gate_id: f.gate_id,
          perspective: f.perspective,
          opened_at: f.opened_at,
        },
      };
    });
  return { ok: true, items, error: null, degraded: !!(all && all.degraded) };
}

// fix-task slot. Both files are read and neither is required: the slot is empty
// most of the time, and an empty slot is a state, not a failure.
function collectFixTasks(repoRoot) {
  const names = ['fix-task.md', 'fix-task-applied.md'];
  const items = [];
  for (const name of names) {
    const abs = path.join(repoRoot, '.claude', 'state', name);
    if (!fs.existsSync(abs)) continue;
    let raw;
    try {
      raw = fs.readFileSync(abs, 'utf8');
    } catch (err) {
      return { ok: false, items: [], error: name + ': ' + err.message };
    }
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
    if (!fm) continue;
    const fp = /^task_fingerprint:\s*(.+)$/m.exec(fm[1]);
    if (!fp) continue;
    const fingerprint = fp[1].trim();
    if (!fingerprint) continue;
    const verdict = /^verdict:\s*(.+)$/m.exec(fm[1]);
    items.push({
      item_id: 'fix-task:' + fingerprint,
      source: 'fix-task',
      // No severity is asserted. The slot carries an escalation, not a graded
      // finding, and inventing HIGH here would put an item into the adjudication
      // bar on no evidence.
      severity: 'UNKNOWN',
      claim_digest: null,
      absorbed_marker: false,
      coords: {
        task_fingerprint: fingerprint,
        file: '.claude/state/' + name,
        verdict: verdict ? verdict[1].trim() : null,
      },
    });
  }
  return { ok: true, items, error: null };
}

// ── inventory ────────────────────────────────────────────────────────────────

// Cross-source duplicates are LINKED, not folded.
//
// The plan said to fold a matched pair into one item preserving both
// coordinates. Two L2 perspectives showed why that is unsafe: the suppression
// key is `finding_id`, so a folded item's single disposition becomes a
// suppression of the finding inside it — and machine disposition 2 grants
// `superseded` from backlog prose (an `ABSORBED` marker) with no human in the
// loop. A backlog sentence would then silence another work unit's open
// CRITICAL.
//
// Keeping both rows costs nothing the plan wanted: the backlog row still gets a
// cheap machine `duplicate` disposition pointing at its twin, the denominator
// stays honest about how many ledger entries exist, and the finding keeps
// needing its own judgment. `claimDigestOf` hashes the claim only (no work
// unit), so it is used here — to SUGGEST a link — and nowhere near suppression.
function linkDuplicates(items) {
  const byDigest = new Map();
  for (const it of items) {
    if (it.source !== 'findings' || !it.claim_digest) continue;
    if (!byDigest.has(it.claim_digest)) byDigest.set(it.claim_digest, it.item_id);
  }
  let linked = 0;
  for (const it of items) {
    if (it.source !== 'backlog' || !it.claim_digest) continue;
    const twin = byDigest.get(it.claim_digest);
    if (twin) { it.duplicate_of = twin; linked += 1; }
  }
  return linked;
}

// The sealed digest covers `items[]` ONLY. Generation time and commit sha live
// outside it in `meta`, so the seal is a function of the debt and nothing else
// — otherwise it could never be recomputed and verified.
function inventoryHash(items) {
  const canonical = items
    .slice()
    .sort(function (a, b) { return a.item_id < b.item_id ? -1 : a.item_id > b.item_id ? 1 : 0; })
    .map(function (it) {
      return {
        item_id: it.item_id,
        source: it.source,
        severity: it.severity,
        claim_digest: it.claim_digest || null,
        duplicate_of: it.duplicate_of || null,
      };
    });
  return 'sha256:' + crypto.createHash('sha256')
    .update(JSON.stringify(canonical), 'utf8').digest('hex');
}

function buildInventory(repoRoot) {
  const backlog = collectBacklog(repoRoot);
  const findings = collectFindings(repoRoot);
  const fixTasks = collectFixTasks(repoRoot);
  const failed = [backlog, findings, fixTasks].filter(function (r) { return !r.ok; });
  if (failed.length) {
    throw new DebtInventoryError(
      'source unreadable: ' + failed.map(function (r) { return r.error; }).join(' · '),
      'SOURCE_UNREADABLE');
  }
  const items = [].concat(backlog.items, findings.items, fixTasks.items);

  // An id collision would let one disposition satisfy two items. Both id
  // schemes are content hashes, so a collision means the two rows really are
  // byte-identical — which the backlog does contain. Keep one and count the
  // rest, rather than carrying an ambiguous duplicate id into the seal.
  const seen = new Map();
  const unique = [];
  let collisions = 0;
  for (const it of items) {
    if (seen.has(it.item_id)) { collisions += 1; continue; }
    seen.set(it.item_id, true);
    unique.push(it);
  }

  const linked = linkDuplicates(unique);
  unique.sort(function (a, b) { return a.item_id < b.item_id ? -1 : a.item_id > b.item_id ? 1 : 0; });

  const counts = { backlog: 0, findings: 0, 'fix-task': 0 };
  const bySeverity = {};
  for (const it of unique) {
    counts[it.source] += 1;
    bySeverity[it.severity] = (bySeverity[it.severity] || 0) + 1;
  }

  return {
    items: unique,
    stats: {
      total: unique.length,
      by_source: counts,
      by_severity: bySeverity,
      duplicate_links: linked,
      identical_rows_collapsed: collisions,
      absorbed_marked: unique.filter(function (i) { return i.absorbed_marker; }).length,
      claim_truncated: unique.filter(function (i) { return i.claim_truncated; }).length,
      adjudicable: unique.filter(function (i) {
        return ADJUDICABLE_SEVERITIES.indexOf(i.severity) !== -1;
      }).length,
      findings_degraded: !!findings.degraded,
    },
  };
}

function fileDigest(repoRoot, rel) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) return null;
  return 'sha256:' + crypto.createHash('sha256')
    .update(fs.readFileSync(abs)).digest('hex');
}

function headCommit(repoRoot) {
  try {
    return require('child_process')
      .execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
      .trim();
  } catch (err) {
    return null;
  }
}

function inventoryPath(repoRoot) { return path.join(repoRoot, INVENTORY_REL); }
function dispositionsPath(repoRoot) { return path.join(repoRoot, DISPOSITIONS_REL); }

function readInventory(repoRoot) {
  const abs = inventoryPath(repoRoot);
  if (!fs.existsSync(abs)) return null;
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

// Sealing is once-only. A re-seal would relabel the denominator under
// dispositions already bound to the old one, so the refusal is the invariant,
// not a convenience.
function sealInventory(repoRoot) {
  const abs = inventoryPath(repoRoot);
  if (fs.existsSync(abs)) {
    throw new DebtInventoryError(
      'inventory already sealed at ' + INVENTORY_REL + ' — re-sealing would ' +
      'rebind dispositions to a different denominator. Delete it only if no ' +
      'disposition line references its inventory_sha256.',
      'ALREADY_SEALED');
  }
  const built = buildInventory(repoRoot);
  const doc = {
    meta: {
      sealed_at: new Date().toISOString(),
      sealed_at_commit: headCommit(repoRoot),
      source_digests: {
        backlog: fileDigest(repoRoot, '.claude/plans/codex-findings-backlog.md'),
        fix_task: fileDigest(repoRoot, '.claude/state/fix-task.md'),
        fix_task_applied: fileDigest(repoRoot, '.claude/state/fix-task-applied.md'),
      },
      stats: built.stats,
      note: 'Snapshot semantics: this denominator is the debt at sealed_at_commit. ' +
        'Debt appended afterwards — including by M10\'s own gates — is outside it ' +
        'and belongs to the next cycle. See docs/multi-session-work-loop/debt-inventory.md.',
    },
    inventory_sha256: inventoryHash(built.items),
    items: built.items,
  };
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  return doc;
}

// ── dispositions ─────────────────────────────────────────────────────────────

// Every line carries the `inventory_sha256` it was written against. Existence
// alone would not show the case this binding exists for: delete the seal, seal
// again over a changed tree, and the old lines would silently certify a
// different denominator. The gate compares, so that path is red instead.
function readDispositions(repoRoot) {
  const abs = dispositionsPath(repoRoot);
  if (!fs.existsSync(abs)) return { ok: true, lines: [], malformed: 0, error: null };
  let raw;
  try {
    raw = fs.readFileSync(abs, 'utf8');
  } catch (err) {
    return { ok: false, lines: [], malformed: 0, error: err.message };
  }
  const lines = [];
  let malformed = 0;
  for (const text of raw.split(/\r?\n/)) {
    if (!text.trim()) continue;
    try {
      const rec = JSON.parse(text);
      if (rec && typeof rec.item_id === 'string') lines.push(rec);
      else malformed += 1;
    } catch (err) {
      malformed += 1;
    }
  }
  return { ok: true, lines, malformed, error: null };
}

// A successor must both exist AND name the seal it is taking items from.
//
// Existence alone is the trap this plan's own Patterns section flagged in the M9
// gate: "커밋된 정적 파일이라 한 번 착지하면 영구히 참". Any file already in the
// repo would satisfy it, so mass deferral would pass with no friction at all —
// which the plan's Risks table rates as the likely path. Requiring the digest
// means the successor had to be edited in THIS cycle to accept the handoff, and
// one line covers a batch, so the friction is real without being busywork.
function checkSuccessor(repoRoot, successor, inventorySha) {
  const cls = classifyEvidence(successor, repoRoot, { allowBarePath: true });
  if (!cls.ok) return { ok: false, reason: 'successor ' + cls.reason };
  const abs = path.join(repoRoot, cls.path);
  if (!fs.existsSync(abs)) {
    return { ok: false, reason: 'successor does not exist: ' + cls.path };
  }
  let body;
  try {
    body = fs.readFileSync(abs, 'utf8');
  } catch (err) {
    return { ok: false, reason: 'successor unreadable: ' + err.message };
  }
  if (inventorySha && body.indexOf(inventorySha) === -1) {
    return {
      ok: false,
      reason: 'successor ' + cls.path + ' does not name the inventory it is ' +
        'taking items from (' + inventorySha + ') — file existence alone would ' +
        'let any committed file absorb an unlimited deferral',
    };
  }
  return { ok: true, path: cls.path };
}

function validateDisposition(repoRoot, rec, index, inventorySha) {
  if (!rec || typeof rec.item_id !== 'string' || !rec.item_id) {
    return { ok: false, reason: 'missing item_id' };
  }
  if (DISPOSITIONS.indexOf(rec.disposition) === -1) {
    return { ok: false, reason: 'disposition must be one of ' + DISPOSITIONS.join('|') };
  }
  if (index && !index.has(rec.item_id)) {
    return { ok: false, reason: 'item_id is not in the sealed inventory' };
  }
  if (rec.disposition === 'duplicate') {
    if (typeof rec.duplicate_of !== 'string' || !rec.duplicate_of) {
      return { ok: false, reason: 'duplicate requires --duplicate-of <item_id>' };
    }
    if (index && !index.has(rec.duplicate_of)) {
      return { ok: false, reason: 'duplicate_of is not in the sealed inventory' };
    }
    return { ok: true };
  }
  if (rec.disposition === 'deferred') {
    if (typeof rec.successor !== 'string' || !rec.successor) {
      return { ok: false, reason: 'deferred requires --successor <path>' };
    }
    return checkSuccessor(repoRoot, rec.successor, inventorySha);
  }
  // fixed · obsolete · superseded · rejected
  const cls = classifyEvidence(rec.evidence, repoRoot, { allowBarePath: false });
  if (!cls.ok) return { ok: false, reason: rec.disposition + ' requires --evidence: ' + cls.reason };
  return { ok: true };
}

function itemIndex(doc) {
  const map = new Map();
  for (const it of (doc && doc.items) || []) map.set(it.item_id, it);
  return map;
}

function appendDispositions(repoRoot, records) {
  const doc = readInventory(repoRoot);
  if (!doc) {
    throw new DebtInventoryError(
      'no sealed inventory at ' + INVENTORY_REL + ' — seal before disposing',
      'NOT_SEALED');
  }
  const index = itemIndex(doc);
  const now = new Date().toISOString();
  const accepted = [];
  const rejected = [];
  for (const raw of records) {
    const rec = {
      item_id: raw.item_id,
      disposition: raw.disposition,
      evidence: raw.evidence || null,
      successor: raw.successor || null,
      duplicate_of: raw.duplicate_of || null,
      note: raw.note || null,
      inventory_sha256: doc.inventory_sha256,
      disposed_at: now,
    };
    const v = validateDisposition(repoRoot, rec, index, doc.inventory_sha256);
    if (!v.ok) { rejected.push({ item_id: rec.item_id, reason: v.reason }); continue; }
    accepted.push(rec);
  }
  // All-or-nothing per call: a partially applied batch leaves the ledger in a
  // state no one asked for, and the ledger is append-only so it cannot be undone.
  if (rejected.length) {
    return { ok: false, appended: 0, accepted: accepted.length, rejected };
  }
  if (accepted.length) {
    const abs = dispositionsPath(repoRoot);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.appendFileSync(abs,
      accepted.map(function (r) { return JSON.stringify(r); }).join('\n') + '\n', 'utf8');
  }
  return { ok: true, appended: accepted.length, rejected: [] };
}

// Latest line wins per item. The ledger is append-only, so a re-judgment is
// recorded rather than overwritten — both readings stay auditable.
function foldDispositions(lines) {
  const byItem = new Map();
  for (const rec of lines) byItem.set(rec.item_id, rec);
  return byItem;
}

function verifyDispositions(repoRoot) {
  const doc = readInventory(repoRoot);
  if (!doc) {
    return {
      ok: false, reason: 'no sealed inventory at ' + INVENTORY_REL,
      open: null, unmatched_dispositions: null,
    };
  }
  const sealedHash = inventoryHash(doc.items);
  const sealIntact = sealedHash === doc.inventory_sha256;

  const led = readDispositions(repoRoot);
  if (!led.ok) {
    return {
      ok: false, reason: 'disposition ledger unreadable: ' + led.error,
      open: null, unmatched_dispositions: null,
    };
  }

  const index = itemIndex(doc);
  const unmatched = [];
  const boundMismatch = [];
  const invalid = [];
  for (const rec of led.lines) {
    if (rec.inventory_sha256 !== doc.inventory_sha256) {
      boundMismatch.push(rec.item_id);
      continue;
    }
    if (!index.has(rec.item_id)) { unmatched.push(rec.item_id); continue; }
    const v = validateDisposition(repoRoot, rec, index, doc.inventory_sha256);
    if (!v.ok) invalid.push({ item_id: rec.item_id, reason: v.reason });
  }

  const folded = foldDispositions(led.lines.filter(function (r) {
    return r.inventory_sha256 === doc.inventory_sha256 && index.has(r.item_id);
  }));

  const openItems = [];
  const byDisposition = {};
  let adjudicableFixed = 0;
  for (const it of doc.items) {
    const rec = folded.get(it.item_id);
    if (!rec) { openItems.push(it.item_id); continue; }
    byDisposition[rec.disposition] = (byDisposition[rec.disposition] || 0) + 1;
    if (rec.disposition === 'fixed' && ADJUDICABLE_SEVERITIES.indexOf(it.severity) !== -1) {
      adjudicableFixed += 1;
    }
  }

  // Deferral concentration is surfaced, not capped. No defensible threshold
  // exists, so the gate reports where a single successor absorbed many items and
  // leaves the judgment to the audit sample the PRD already requires.
  const deferralsBySuccessor = {};
  for (const rec of folded.values()) {
    if (rec.disposition !== 'deferred' || !rec.successor) continue;
    deferralsBySuccessor[rec.successor] = (deferralsBySuccessor[rec.successor] || 0) + 1;
  }

  const ok = sealIntact && openItems.length === 0 && unmatched.length === 0 &&
    boundMismatch.length === 0 && invalid.length === 0 && led.malformed === 0 &&
    adjudicableFixed >= 1;

  return {
    ok,
    seal_intact: sealIntact,
    inventory_sha256: doc.inventory_sha256,
    total_items: doc.items.length,
    disposed: doc.items.length - openItems.length,
    open: openItems.length,
    open_sample: openItems.slice(0, 10),
    unmatched_dispositions: unmatched.length,
    unmatched_sample: unmatched.slice(0, 10),
    binding_mismatch: boundMismatch.length,
    invalid_dispositions: invalid.length,
    invalid_sample: invalid.slice(0, 10),
    malformed_lines: led.malformed,
    by_disposition: byDisposition,
    adjudicable_fixed: adjudicableFixed,
    deferrals_by_successor: deferralsBySuccessor,
  };
}

// Which findings a session may stop being told about.
//
// Returns null — meaning suppress NOTHING — whenever the ledger cannot be read
// with confidence. Over-suppression removes a live CRITICAL from the next
// session's list, which is exactly the failure M7 exists to prevent, and C1 does
// not watch promotion so nothing would detect it. Under-suppression only shows
// an item that was already dealt with.
function suppressedFindingIds(repoRoot) {
  const doc = readInventory(repoRoot);
  if (!doc) return null;
  const led = readDispositions(repoRoot);
  if (!led.ok) return null;
  const index = itemIndex(doc);
  const folded = foldDispositions(led.lines.filter(function (r) {
    return r.inventory_sha256 === doc.inventory_sha256 && index.has(r.item_id);
  }));
  const out = new Set();
  for (const rec of folded.values()) {
    if (SUPPRESSING_DISPOSITIONS.indexOf(rec.disposition) === -1) continue;
    if (rec.item_id.slice(0, 9) !== 'findings:') continue;
    out.add(rec.item_id.slice(9));
  }
  return out;
}

// ── cli ──────────────────────────────────────────────────────────────────────

const EX_OK = 0;
const EX_FAIL = 1;
const EX_USAGE = 2;

function parseFlags(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { out[a.slice(2)] = true; continue; }
      out[a.slice(2)] = next; i += 1;
    } else {
      out._.push(a);
    }
  }
  return out;
}

function repoRootOf(flags) {
  if (flags['repo-root'] && flags['repo-root'] !== true) return String(flags['repo-root']);
  try {
    return registry.discoverRepoRoot(process.cwd());
  } catch (err) {
    return process.cwd();
  }
}

const USAGE = [
  'usage: debt-inventory.js <command> [--json] [--repo-root <path>]',
  '',
  '  seal      normalize the three ledgers into an immutable denominator',
  '            (refuses if ' + INVENTORY_REL + ' already exists)',
  '  stats     report what a seal would contain, without writing anything',
  '  dispose   record a disposition:',
  '              --item <item_id> --disposition <' + DISPOSITIONS.join('|') + '>',
  '              [--evidence <path:line|sha|#pr>] [--successor <path>]',
  '              [--duplicate-of <item_id>] [--note <text>]',
  '            or --batch <file.jsonl> for many at once (all-or-nothing)',
  '  verify    report open items, binding, and rule compliance',
  '',
].join('\n');

function runCli(argv) {
  const flags = parseFlags(argv);
  const cmd = flags._[0];
  const json = !!flags.json;
  const repoRoot = repoRootOf(flags);

  if (!cmd || cmd === 'help' || flags.help) {
    process.stdout.write(USAGE);
    return cmd ? EX_OK : EX_USAGE;
  }

  try {
    if (cmd === 'stats') {
      const built = buildInventory(repoRoot);
      const payload = { ok: true, sealed: !!readInventory(repoRoot), stats: built.stats };
      process.stdout.write(json ? JSON.stringify(payload, null, 2) + '\n'
        : JSON.stringify(payload.stats, null, 2) + '\n');
      return EX_OK;
    }
    if (cmd === 'dispose') {
      let records;
      if (flags.batch && flags.batch !== true) {
        const abs = path.isAbsolute(String(flags.batch))
          ? String(flags.batch) : path.join(repoRoot, String(flags.batch));
        records = fs.readFileSync(abs, 'utf8').split(/\r?\n/)
          .filter(function (l) { return l.trim(); })
          .map(function (l) { return JSON.parse(l); });
      } else {
        if (!flags.item || flags.item === true || !flags.disposition || flags.disposition === true) {
          process.stderr.write('dispose requires --item and --disposition (or --batch)\n');
          return EX_USAGE;
        }
        records = [{
          item_id: String(flags.item),
          disposition: String(flags.disposition),
          evidence: flags.evidence && flags.evidence !== true ? String(flags.evidence) : null,
          successor: flags.successor && flags.successor !== true ? String(flags.successor) : null,
          duplicate_of: flags['duplicate-of'] && flags['duplicate-of'] !== true
            ? String(flags['duplicate-of']) : null,
          note: flags.note && flags.note !== true ? String(flags.note) : null,
        }];
      }
      const res = appendDispositions(repoRoot, records);
      process.stdout.write(JSON.stringify(res, null, 2) + '\n');
      return res.ok ? EX_OK : EX_FAIL;
    }
    if (cmd === 'verify' || flags.verify) {
      const report = verifyDispositions(repoRoot);
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      return report.ok ? EX_OK : EX_FAIL;
    }
    if (cmd === 'seal') {
      const doc = sealInventory(repoRoot);
      const payload = {
        ok: true,
        inventory_sha256: doc.inventory_sha256,
        sealed_at_commit: doc.meta.sealed_at_commit,
        stats: doc.meta.stats,
        path: INVENTORY_REL,
      };
      process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
      return EX_OK;
    }
  } catch (err) {
    const payload = { ok: false, code: err.code || 'ERROR', error: err.message };
    if (json) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    else process.stderr.write('[debt-inventory] ' + err.message + '\n');
    return EX_FAIL;
  }

  process.stderr.write('unknown command: ' + cmd + '\n' + USAGE);
  return EX_USAGE;
}

if (require.main === module) {
  process.exit(runCli(process.argv.slice(2)));
}

module.exports = {
  runCli,
  INVENTORY_REL,
  DISPOSITIONS_REL,
  SOURCES,
  SEVERITY_TOKENS,
  ADJUDICABLE_SEVERITIES,
  DISPOSITIONS,
  SUPPRESSING_DISPOSITIONS,
  DebtInventoryError,
  normalizeSeverity,
  classifyEvidence,
  collectBacklog,
  collectFindings,
  collectFixTasks,
  linkDuplicates,
  inventoryHash,
  buildInventory,
  readInventory,
  sealInventory,
  inventoryPath,
  dispositionsPath,
  readDispositions,
  appendDispositions,
  validateDisposition,
  checkSuccessor,
  foldDispositions,
  verifyDispositions,
  suppressedFindingIds,
};
