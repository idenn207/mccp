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

// Where a superseded seal is archived so its digest can be recomputed later.
const SEALS_DIR_REL = 'docs/multi-session-work-loop/seals';

// ONE constant, named once. The re-seal plan wrote the archive filename as
// `<sha12>` in its rules and as an 8-hex example in its file table; a write side
// and a read side that truncate to different lengths never meet, so the ancestor
// simply never verifies. That direction is safe (fail-closed) but it kills the
// design silently, which is worse than loud. Both sides read this.
const ARCHIVE_SHA_PREFIX_LEN = 12;

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
// The `sha256:<64hex>` form THIS module produces (`inventoryHash`). Anchored on
// the whole string deliberately: a prefix or length test would let a crafted
// value reach `path.join` and a git argv. It lives beside its producer rather
// than being imported from the receipt layer, which describes receipt fields —
// the debt ledger should not depend on that layer for a string it generates
// itself, and the regex sitting next to `inventoryHash` is what keeps the two
// from drifting.
const INVENTORY_SHA_RE = /^sha256:[0-9a-f]{64}$/;
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


// ── ancestry ─────────────────────────────────────────────────────────────────
//
// A re-seal supersedes its predecessor rather than erasing it: the new document
// carries `meta.ancestry`, the chain of digests it descends from. Lines still
// bound to one of those digests are a HISTORICAL NORMAL STATE, not the drift
// `binding_mismatch` exists to catch.
//
// `meta` is OUTSIDE the sealed digest (`inventoryHash` covers `items[]` only), so
// this field is not signed. Trusting it as written would mean one appended line
// buys every record bound to that sha an exemption from `binding_mismatch` while
// `seal_intact` stays true — precisely the scenario the binding was built for
// ("delete the seal, seal again over a changed tree, and the old lines would
// silently certify a different denominator"). So an ancestor is not believed, it
// is RECOMPUTED, under three conditions that must all hold:
//
//   1. shape      — `sha256:<64hex>`, no duplicates, never the document's own sha
//   2. recompute  — the archived seal exists and `inventoryHash(archived.items)`
//                   equals the claimed sha
//   3. tracked    — the archive is in the git index
//
// Condition 2 alone is SELF-FULFILLING: `inventoryHash` is a public pure function,
// so anyone can hash a fabricated `items[]` and park the result under the matching
// filename. Condition 3 raises that to "and it is in the index" — which is INDEX
// MEMBERSHIP, not commit history: `git add` satisfies it and leaves no commit.
// Neither condition authenticates provenance. What they close is drift, mistakes
// and silent reclassification; forgery stays open exactly as CLAUDE.md §3.12
// already states for every ledger here. Claiming more than that would be the same
// comfortable-false-number this subsystem exists to remove.
//
// A malformed SHAPE folds the whole array to null (judgment impossible → no
// ancestor allowance at all). A single entry failing recompute/tracked is not
// fatal to the rest: it is dropped into `unverified` so a caller can report it.
function archiveRelFor(sha) {
  if (typeof sha !== 'string' || !INVENTORY_SHA_RE.test(sha)) return null;
  const hex = sha.slice('sha256:'.length, 'sha256:'.length + ARCHIVE_SHA_PREFIX_LEN);
  return SEALS_DIR_REL + '/debt-inventory-' + hex + '.json';
}

// `execFileSync` with an argv ARRAY, never a composed string: a string would go
// through /bin/sh and make the argument injectable. `--` ends option parsing so a
// pathspec can never be read as a flag. The sha reached here only after
// `INVENTORY_SHA_RE`, so the derived segment is lowercase hex and cannot contain
// a separator — validation happens BEFORE derivation, not after.
function isGitTracked(repoRoot, rel) {
  try {
    require('child_process').execFileSync(
      'git', ['-C', repoRoot, 'ls-files', '--error-unmatch', '--', rel],
      { stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch (err) {
    return false;
  }
}

function sealAncestry(repoRoot, doc) {
  const raw = (doc && doc.meta && doc.meta.ancestry);
  if (raw === undefined || raw === null) return { verified: [], unverified: [] };
  if (!Array.isArray(raw)) return null;

  const own = doc && doc.inventory_sha256;
  const seen = new Set();
  for (const sha of raw) {
    if (typeof sha !== 'string' || !INVENTORY_SHA_RE.test(sha)) return null;
    if (sha === own) return null;
    if (seen.has(sha)) return null;
    seen.add(sha);
  }

  const verified = [];
  const unverified = [];
  for (const sha of raw) {
    const rel = archiveRelFor(sha);
    const abs = path.join(repoRoot, rel);
    let archived;
    try {
      archived = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch (err) {
      unverified.push({ sha: sha, reason: 'archive unreadable at ' + rel });
      continue;
    }
    if (!archived || !Array.isArray(archived.items)) {
      unverified.push({ sha: sha, reason: 'archive at ' + rel + ' has no items[]' });
      continue;
    }
    if (inventoryHash(archived.items) !== sha) {
      unverified.push({
        sha: sha,
        reason: 'archive at ' + rel + ' does not hash to the sha it is filed under',
      });
      continue;
    }
    if (!isGitTracked(repoRoot, rel)) {
      unverified.push({
        sha: sha,
        reason: 'archive at ' + rel + ' is not in the git index — a file placed on ' +
          'disk cannot be an ancestor, because recomputing its own hash proves ' +
          'only internal consistency',
      });
      continue;
    }
    verified.push(sha);
  }
  return { verified: verified, unverified: unverified };
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

// ── successor acceptance ─────────────────────────────────────────────────────
//
// A successor must exist AND declare that it accepts the handoff.
//
// Existence alone is the M9 trap this subsystem already named: "커밋된 정적 파일이라
// 한 번 착지하면 영구히 참". Any committed file would satisfy it, so mass deferral
// would pass with no friction at all.
//
// The first fix was `body.indexOf(inventorySha) !== -1`, and it does not hold:
// EVERY committed file that happens to carry the sha becomes eligible. Measured in
// this repo — `.claude/_meta/data/2026-09-08-closure-baseline.json` and
// `…-closure-report-live.json` both embed the full sha, and every line of
// `debt-dispositions.jsonl` does. An enumerated deny-list cannot fix that: the set
// of files carrying the sha grows on its own, and a re-seal writes more of them.
//
// So the SHAPE of the test changes. Containing the sha is not acceptance; a
// dedicated marker is:
//
//     <!-- accepts-inventory: sha256:<64hex> -->
//
// A report JSON or a ledger line is not that shape, so the class closes instead of
// the list growing. Writing the marker is a person declaring the handoff accepted,
// which is the friction the original rule wanted.
const ACCEPT_MARKER_RE =
  /<!--[ \t]*accepts-inventory:[ \t]*(sha256:[0-9a-f]{64})[ \t]*-->/g;

// `[ \t]` and not `\s`: \s crosses newlines, which would let a "marker" span lines
// and make the line-oriented stripping below meaningless. The pattern has no nested
// quantifiers, so it cannot backtrack catastrophically.

// CHARACTERS, not bytes — the scan cost tracks code units. Over the cap the answer
// is REFUSAL, not a truncated scan: a partial read of an acceptance record would
// decide a handoff on evidence nobody looked at.
const MAX_SUCCESSOR_SCAN_CHARS = 256 * 1024;

// Quoted structures are removed before scanning so a marker shown as an EXAMPLE —
// inside a fence in a doc that explains the format — cannot accept a real handoff.
//
// This does NOT reuse `intent-claims.stripQuotedStructures`, and the reason is
// worth stating so a later reader does not "unify" them: that stripper removes HTML
// comments wherever they appear, and this marker IS an HTML comment. Running it here
// deletes the genuine markers too, so every deferral would be refused. Measured: a
// document with three markers comes back with zero occurrences of the token.
//
// Over-removal is the safe direction — a stripped real marker yields no match, which
// refuses. So the rules stay deliberately blunt: fenced blocks, indented code, and
// blockquotes.
const FENCE_OPEN_RE = /^[ ]{0,3}(`{3,}|~{3,})/;
const BLOCKQUOTE_RE = /^[ ]{0,3}>/;

// Indentation is measured in COLUMNS, not characters: a tab advances to the next
// 4-column tab stop. Counting characters would let " \tmarker" read as 2 columns
// when markdown sees a code block.
function indentColumns(line) {
  let col = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i);
    if (ch === ' ') col += 1;
    else if (ch === '\t') col += 4 - (col % 4);
    else break;
    if (col >= 4) return col;
  }
  return col;
}

function stripQuotedForMarker(text) {
  const lines = String(text == null ? '' : text).split(/\r?\n/);
  const out = [];
  let fence = null;
  for (const line of lines) {
    if (fence) {
      // A closing fence must be the same character and at least as long.
      const close = line.match(FENCE_OPEN_RE);
      if (close && close[1].charAt(0) === fence.charAt(0) && close[1].length >= fence.length) {
        fence = null;
      }
      out.push('');
      continue;
    }
    const open = line.match(FENCE_OPEN_RE);
    if (open) { fence = open[1]; out.push(''); continue; }
    if (BLOCKQUOTE_RE.test(line)) { out.push(''); continue; }
    if (indentColumns(line) >= 4) { out.push(''); continue; }
    out.push(line);
  }
  // An unterminated fence swallows the rest of the document, same rule the repo's
  // other stripper uses — refusing is safe, accepting on a half-open fence is not.
  return out.join('\n');
}

// Every well-formed marker in the document, as a Set.
//
// The scan is GLOBAL and the answer is set membership — deliberately NOT the
// "exactly one anchor" rule `intent-claims` uses. There the answer is a scalar (which
// UI id?), so two anchors mean ambiguity. Here a document legitimately accumulates
// one marker per generation, and demanding exactly one would break the N-generation
// chain the ancestor set exists to support. Each marker is still an explicit human
// declaration, so accepting any of them is not a fail-open.
function collectAcceptedShas(body) {
  const out = new Set();
  if (typeof body !== 'string' || body.length > MAX_SUCCESSOR_SCAN_CHARS) return out;
  const text = stripQuotedForMarker(body);
  ACCEPT_MARKER_RE.lastIndex = 0;
  let m;
  while ((m = ACCEPT_MARKER_RE.exec(text)) !== null) out.add(m[1]);
  return out;
}

// `acceptable` is a single sha, a list of them, or null/'' for "do not check".
// A list is how a carried-forward line is validated: its marker may name any
// generation this inventory descends from, so the check is membership in
// {current} ∪ {verified ancestors}. Widening the parameter rather than adding a
// new one keeps every existing caller — all of which pass one string — unchanged.
function checkSuccessor(repoRoot, successor, acceptable) {
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
  const wanted = (acceptable === null || acceptable === undefined || acceptable === '')
    ? []
    : (Array.isArray(acceptable) ? acceptable : [acceptable]).filter(Boolean);
  if (!wanted.length) return { ok: true, path: cls.path };

  const accepted = collectAcceptedShas(body);
  const hit = wanted.filter(function (s) { return accepted.has(s); });
  if (!hit.length) {
    return {
      ok: false,
      reason: 'successor ' + cls.path + ' carries no <!-- accepts-inventory: ' +
        '<sha> --> marker for ' + (wanted.length === 1 ? wanted[0] : wanted.length +
        ' acceptable seal(s)') + ' — containing the digest somewhere in the body is ' +
        'not acceptance, because report JSON and the ledger itself contain it too',
    };
  }
  return { ok: true, path: cls.path, accepted_sha: hit[0] };
}

// `ancestry` is the VERIFIED ancestor list (see `sealAncestry`). It defaults to
// an empty array so every existing 4-argument caller behaves exactly as before.
function validateDisposition(repoRoot, rec, index, inventorySha, ancestry) {
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
    // A NEW deferral must name the CURRENT seal — the friction is unchanged for
    // anything written by hand today.
    if (!rec.succeeded_from) {
      return checkSuccessor(repoRoot, rec.successor, inventorySha);
    }
    // A CARRIED-FORWARD line is different: the successor already accepted this
    // handoff, in an earlier generation, and that acceptance is still true. Charging
    // the friction twice for the same decision is what would force a re-seal to
    // rewrite successor documents on the machine's behalf — which would hollow out
    // the marker entirely.
    if (!Array.isArray(ancestry)) {
      return {
        ok: false,
        reason: 'succeeded_from is set but this inventory has no readable ancestry ' +
          '— an ancestor allowance cannot be granted on an unjudgeable chain',
      };
    }
    if (ancestry.indexOf(rec.succeeded_from) === -1) {
      return {
        ok: false,
        reason: 'succeeded_from names a seal this inventory does not descend from (' +
          rec.succeeded_from + ')',
      };
    }
    // Membership in the whole set, not a lookup keyed by succeeded_from. Keying on
    // succeeded_from makes the design one-shot: at generation 3 that field holds
    // generation 2's sha while the marker still names generation 1, so every carried
    // line would be refused and the all-or-nothing batch would reject in full.
    return checkSuccessor(repoRoot, rec.successor, ancestry.concat([inventorySha]));
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
  // The ancestry has to reach the validator HERE as well as in `verifyDispositions`.
  // A carried-forward line is bound to the CURRENT sha, so it never hits the
  // ancestor short-circuit in verify — it lands in `validateDisposition`, and if
  // ancestry arrives empty every carried `deferred` is refused, which the
  // all-or-nothing rule then turns into a rejected batch.
  const anc = sealAncestry(repoRoot, doc);
  const ancestry = anc ? anc.verified : null;
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
    // Succession provenance. Present ONLY on carried lines, so an ordinary
    // disposition's shape is byte-for-byte what it was before.
    if (raw.succeeded_from) rec.succeeded_from = raw.succeeded_from;
    if (raw.originally_disposed_at) rec.originally_disposed_at = raw.originally_disposed_at;
    const v = validateDisposition(repoRoot, rec, index, doc.inventory_sha256, ancestry);
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
  const anc = sealAncestry(repoRoot, doc);
  const ancestry = anc ? anc.verified : null;
  const ancestrySet = new Set(ancestry || []);
  const unmatched = [];
  const boundMismatch = [];
  const ancestorBound = [];
  const invalid = [];
  for (const rec of led.lines) {
    if (rec.inventory_sha256 !== doc.inventory_sha256) {
      // A line bound to a VERIFIED ancestor is the normal state after a re-seal,
      // not drift. Counting it as `binding_mismatch` would put a thousand-line
      // false alarm on top of the one field that is supposed to mean something,
      // and a number that always fires stops being read. Anything bound to a sha
      // this inventory does NOT descend from still lands in `binding_mismatch`,
      // so the field keeps catching what it was built to catch.
      if (ancestrySet.has(rec.inventory_sha256)) ancestorBound.push(rec.item_id);
      else boundMismatch.push(rec.item_id);
      continue;
    }
    if (!index.has(rec.item_id)) { unmatched.push(rec.item_id); continue; }
    const v = validateDisposition(repoRoot, rec, index, doc.inventory_sha256, ancestry);
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

  // `ancestor_bound_lines` is deliberately NOT in this expression — it is a
  // historical normal state. `binding_mismatch` stays in it, unchanged.
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
    ancestor_bound_lines: ancestorBound.length,
    ancestry_depth: ancestry === null ? null : ancestry.length,
    ancestry_unverified: anc ? anc.unverified : null,
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

// ── machine dispositions ─────────────────────────────────────────────────────
//
// Only two kinds are proposed, and both cite something already written down:
//
//   superseded — the row says so itself. The evidence is that row's own
//                location, because what is being asserted is "this line
//                records its own absorption", not "the work happened".
//   duplicate  — the seal linked it to a finding carrying the same claim.
//
// `obsolete` is NOT proposed. The plan called it a candidate for a reason: a
// cited path missing from the tree cannot be told apart from a path that moved,
// and 241 items match that shape here. Retiring them on a moved file would
// delete real debt, so they stay for human judgment.
function backlogLineIndex(repoRoot) {
  const abs = path.join(repoRoot, '.claude', 'plans', 'codex-findings-backlog.md');
  const index = new Map();
  if (!fs.existsSync(abs)) return index;
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const cells = backlogSource.splitRow(lines[i]);
    if (cells.length < backlogSource.COLUMNS) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cells[0])) continue;
    const id = backlogSource.rowId({
      date: cells[0],
      severity: cells[1].trim(),
      source_plan: cells[2].trim(),
      finding: cells.slice(backlogSource.COLUMNS - 1).join(' | ').trim(),
    });
    if (!index.has(id)) index.set(id, i + 1);
  }
  return index;
}

function proposeMachineDispositions(repoRoot) {
  const doc = readInventory(repoRoot);
  if (!doc) {
    throw new DebtInventoryError('no sealed inventory — seal first', 'NOT_SEALED');
  }
  const lineIndex = backlogLineIndex(repoRoot);
  const proposals = [];
  const skipped = [];
  for (const it of doc.items) {
    if (it.duplicate_of) {
      proposals.push({
        item_id: it.item_id,
        disposition: 'duplicate',
        duplicate_of: it.duplicate_of,
        note: 'seal linked this row to a finding carrying the same claim digest',
      });
      continue;
    }
    if (it.absorbed_marker && it.source === 'backlog') {
      const line = lineIndex.get(it.coords.row_id);
      if (!line) { skipped.push({ item_id: it.item_id, reason: 'row line not locatable' }); continue; }
      proposals.push({
        item_id: it.item_id,
        disposition: 'superseded',
        evidence: '.claude/plans/codex-findings-backlog.md:' + line,
        note: 'the row itself records an ABSORBED/RESOLVED marker',
      });
    }
  }
  return { proposals, skipped };
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
    if (cmd === 'propose') {
      const res = proposeMachineDispositions(repoRoot);
      if (flags.apply) {
        const applied = appendDispositions(repoRoot, res.proposals);
        process.stdout.write(JSON.stringify(
          { proposed: res.proposals.length, skipped: res.skipped, applied }, null, 2) + '\n');
        return applied.ok ? EX_OK : EX_FAIL;
      }
      process.stdout.write(res.proposals.map(function (p) { return JSON.stringify(p); }).join('\n') + '\n');
      process.stderr.write('[debt-inventory] proposed ' + res.proposals.length +
        ', skipped ' + res.skipped.length + ' (pass --apply to write them)\n');
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
  SEALS_DIR_REL,
  ARCHIVE_SHA_PREFIX_LEN,
  INVENTORY_SHA_RE,
  archiveRelFor,
  isGitTracked,
  sealAncestry,
  collectAcceptedShas,
  stripQuotedForMarker,
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
