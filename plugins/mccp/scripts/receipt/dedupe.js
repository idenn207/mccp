'use strict';

// Deterministic cross-gate dedupe for /mccp:pr.
//
// Per Codex Q1 (Sprint 6 design): replace LLM inference with a pure
// computation of which PR diff files fall outside the plan's "Files to
// Change" scope plus any changes made after the implement receipt was
// recorded.
//
//   planned         = parsed plan "Files to Change" entries
//   pr_diff         = git diff --name-only <base>..HEAD
//   post_gate_diff  = git diff --name-only <implement-receipt.head_sha>..HEAD
//   residual        = (pr_diff - planned) ∪ post_gate_diff
//
// PR-Codex may be skipped only when:
//   1. residual is empty
//   2. plan-codex receipt and implement-codex receipt both have
//      resolution.codex_verdict === 'converged'
//   3. the plan parsed cleanly
//
// Otherwise the caller must review residual.
//
// v1.20.3 — the convergence gate reads resolution.codex_verdict (the real Codex
// adversarial-review outcome), NOT resolution.converged. `converged` defaults
// true at receipt-write time (write.js defaultResolution), so a divergent Codex
// review would still record converged=true and silently skip PR-Codex, defeating
// the dual-review invariant. codex_verdict is present-only + fail-closed: a
// missing verdict (legacy receipt or a gate that didn't forward it) reads as NOT
// converged, so PR-Codex runs (the safe, dual-review-preserving direction).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { gitRepoRoot } = require('./hash');
const { readReceipt } = require('./store');
const { isCrossModelCorroborated } = require('../lib/review-verdict');
const { isIntentApproved } = require('../lib/intent-context');

const FILES_HEADING_RE = /^#{1,6}\s+files\s+to\s+change\s*$/i;
const HEADING_RE = /^#{1,6}\s+/;
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{2,}/;

function normalizePath(p) {
  if (typeof p !== 'string') return '';
  return p.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function stripBackticks(s) {
  return String(s || '').replace(/`/g, '').trim();
}

// Parse a markdown table row "| a | b | c |" into ["a", "b", "c"].
// Tolerant of missing leading/trailing pipes.
function parseRow(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let body = trimmed;
  if (body.startsWith('|')) body = body.slice(1);
  if (body.endsWith('|')) body = body.slice(0, -1);
  return body.split('|').map(function (c) { return c.trim(); });
}

// Extract path entries from the first column of one row.
// Handles backticks, comma-separated lists, and quoted paths.
function extractPaths(cell) {
  if (!cell) return [];
  const cleaned = stripBackticks(cell)
    .replace(/^["']|["']$/g, '');
  if (!cleaned) return [];
  return cleaned
    .split(',')
    .map(function (p) { return normalizePath(stripBackticks(p)); })
    .filter(function (p) { return p.length > 0; });
}

function parsePlanFiles(planPath) {
  if (!planPath) {
    return { ok: false, error: 'plan path is required', files: [] };
  }
  if (!fs.existsSync(planPath)) {
    return { ok: false, error: 'plan file not found: ' + planPath, files: [] };
  }
  const raw = fs.readFileSync(planPath, 'utf8').replace(/\r\n/g, '\n');
  const lines = raw.split('\n');

  let i = 0;
  let headingLine = -1;
  for (; i < lines.length; i++) {
    if (FILES_HEADING_RE.test(lines[i])) {
      headingLine = i;
      break;
    }
  }
  if (headingLine === -1) {
    return {
      ok: false,
      error: 'plan has no "Files to Change" heading',
      files: [],
    };
  }

  // gate-guard-integrity M3 (C3) — advance to the table itself, tolerating
  // prose between the heading and the first row. This used to skip blank lines
  // only, so a single explanatory sentence under the heading became the
  // "header row": parseRow returns a 1-cell array for a pipe-less line, so the
  // header check passed and the failure surfaced one line later as
  // `"Files to Change" table separator missing`. Measured A/B: deleting one
  // description line flipped ok:false → ok:true (files=13). The consequence was
  // silent — parse failure makes every planned file fall through to residual,
  // so cross-gate dedupe just never fires (fail-closed, but the optimisation is
  // lost and the reason is invisible).
  //
  // Fail-closed is preserved: the table is still required explicitly. We stop
  // at the next heading or EOF and fall through to exactly the same errors as
  // before, and a section with prose but no table now reports "section is
  // empty" instead of "table separator missing" — a different existing error,
  // never a pass. Scanning for a line that STARTS with `|` (rather than one
  // that merely contains `|`) is deliberate: prose containing an inline pipe
  // would otherwise be adopted as the header and reproduce the original bug.
  //
  // Fenced regions are skipped entirely, and that is load-bearing in BOTH
  // directions (local review, 2026-08-16):
  //   - Without it, an EXAMPLE table inside a ``` fence placed before the real
  //     one would be adopted as the table and parse to ok:true with the WRONG
  //     file list. That is strictly worse than the old error: usually the real
  //     files then fall to residual (still fail-closed), but an example whose
  //     first column is a glob can swallow them and yield skip_safe=true — a
  //     dual-review bypass. The "never a pass" claim above only holds because
  //     of this skip.
  //   - Without it, `HEADING_RE` (/^#{1,6}\s+/) also matches a `# comment` line
  //     inside a bash fence, so a fenced snippet before the table would stop
  //     the scan and report the section empty.
  // Indented (4-column) code blocks are deliberately NOT treated as code here:
  // distinguishing them needs paragraph context, and a leading-indented `|` row
  // in this section is far more likely to be a real table someone indented than
  // a code sample. `.trim()` keeps tolerating those.
  i = headingLine + 1;
  let fenceChar = null;
  for (; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const fence = trimmed.match(/^(`{3,}|~{3,})/);
    if (fence) {
      const ch = fence[1].charAt(0);
      if (fenceChar === null) fenceChar = ch;
      else if (fenceChar === ch) fenceChar = null;
      continue;
    }
    if (fenceChar !== null) continue;
    if (HEADING_RE.test(lines[i])) break;
    if (trimmed.charAt(0) === '|') break;
  }
  // An unterminated fence runs the scan to EOF, which the check below reports as
  // an empty section — fail-closed, not a silent adoption of whatever followed.

  if (i >= lines.length || HEADING_RE.test(lines[i])) {
    return {
      ok: false,
      error: '"Files to Change" section is empty',
      files: [],
    };
  }

  const headerRow = parseRow(lines[i]);
  if (!headerRow || headerRow.length === 0) {
    return {
      ok: false,
      error: '"Files to Change" header row not parseable',
      files: [],
    };
  }
  i += 1;

  if (i >= lines.length || !TABLE_SEPARATOR_RE.test(lines[i])) {
    return {
      ok: false,
      error: '"Files to Change" table separator missing',
      files: [],
    };
  }
  i += 1;

  const files = [];
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') break;
    if (HEADING_RE.test(line)) break;
    const row = parseRow(line);
    if (!row || row.length === 0) continue;
    const paths = extractPaths(row[0]);
    for (const p of paths) files.push(p);
  }

  if (files.length === 0) {
    return {
      ok: false,
      error: '"Files to Change" table has no entries',
      files: [],
    };
  }

  return { ok: true, error: null, files: files };
}

function isGlob(entry) {
  return /[*?[]/.test(entry);
}

function globToRegex(entry) {
  let re = '^';
  let i = 0;
  while (i < entry.length) {
    const c = entry[i];
    if (c === '*' && entry[i + 1] === '*' && entry[i + 2] === '/') {
      // `**/` matches zero or more path segments incl. their trailing slash.
      re += '(?:.*/)?';
      i += 3;
      continue;
    }
    if (c === '/' && entry[i + 1] === '*' && entry[i + 2] === '*' && (i + 3 === entry.length)) {
      // trailing `/**` matches the rest of the path.
      re += '(?:/.*)?';
      i += 3;
      continue;
    }
    if (c === '*' && entry[i + 1] === '*') {
      // standalone `**` matches anything.
      re += '.*';
      i += 2;
      continue;
    }
    if (c === '*') {
      re += '[^/]*';
      i += 1;
      continue;
    }
    if (c === '?') {
      re += '[^/]';
      i += 1;
      continue;
    }
    if ('.+^${}()|\\'.indexOf(c) !== -1) {
      re += '\\' + c;
      i += 1;
      continue;
    }
    re += c;
    i += 1;
  }
  re += '$';
  return new RegExp(re);
}

function buildPlannedMatcher(plannedFiles) {
  const literals = new Set();
  const patterns = [];
  for (const p of plannedFiles) {
    if (isGlob(p)) {
      patterns.push(globToRegex(p));
    } else {
      literals.add(p);
    }
  }
  return function (filePath) {
    if (literals.has(filePath)) return true;
    for (const re of patterns) {
      if (re.test(filePath)) return true;
    }
    return false;
  };
}

function gitDiffNameOnly(cwd, fromRef, toRef) {
  if (!fromRef) throw new Error('gitDiffNameOnly: fromRef required');
  const args = ['diff', '--name-only', '-z'];
  args.push(fromRef + '..' + (toRef || 'HEAD'));
  let out;
  try {
    out = execFileSync('git', args, {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (err) {
    const stderr = err.stderr ? String(err.stderr).trim() : '';
    const e = new Error('git diff ' + fromRef + '..' + (toRef || 'HEAD') + ' failed: ' + (stderr || err.message));
    e.code = 'GIT_FAILED';
    throw e;
  }
  if (!out) return [];
  return out
    .split('\0')
    .map(function (p) { return normalizePath(p); })
    .filter(function (p) { return p.length > 0; });
}

function dedupe(unique) {
  const seen = new Set();
  const out = [];
  for (const v of unique) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

// Main computation.
//
// opts:
//   cwd: working directory (default process.cwd())
//   planPath: required, absolute or cwd-relative
//   baseRef: git ref or sha to diff against; required
//   implementReceiptPath: optional path to implement-codex receipt
//     (or pass implementReceipt directly for tests)
//   implementReceipt: parsed receipt object (overrides path read)
//
// Returns:
//   {
//     ok: bool,
//     errors: string[],
//     planned: string[],
//     pr_diff: string[],
//     post_gate_diff: string[],
//     residual: string[],
//     skip_safe: bool,           // residual empty AND post-gate clean
//     reason: string,            // why skip_safe is false (when false)
//     plan_parse_error: string|null,
//     implement_receipt_head_sha: string|null,
//   }
function computeResidual(opts) {
  const o = opts || {};
  const cwd = o.cwd || process.cwd();
  const errors = [];
  const result = {
    ok: false,
    errors: errors,
    planned: [],
    pr_diff: [],
    post_gate_diff: [],
    residual: [],
    skip_safe: false,
    reason: '',
    plan_parse_error: null,
    implement_receipt_head_sha: null,
  };

  if (!o.planPath) {
    errors.push('planPath required');
    result.reason = 'planPath required';
    return result;
  }
  if (!o.baseRef) {
    errors.push('baseRef required');
    result.reason = 'baseRef required';
    return result;
  }

  const planAbs = path.resolve(cwd, o.planPath);
  const planned = parsePlanFiles(planAbs);
  if (!planned.ok) {
    result.plan_parse_error = planned.error;
    errors.push('plan parse failed: ' + planned.error);
    result.reason = 'plan parse failed (fail-closed): ' + planned.error;
    return result;
  }
  result.planned = planned.files.slice();

  let prDiff;
  try {
    prDiff = gitDiffNameOnly(cwd, o.baseRef, 'HEAD');
  } catch (err) {
    errors.push(err.message);
    result.reason = 'pr diff failed: ' + err.message;
    return result;
  }
  result.pr_diff = prDiff.slice();

  let postGateDiff = [];
  let implementReceipt = o.implementReceipt || null;
  if (!implementReceipt && o.implementReceiptPath) {
    if (fs.existsSync(o.implementReceiptPath)) {
      try {
        implementReceipt = JSON.parse(fs.readFileSync(o.implementReceiptPath, 'utf8'));
      } catch (err) {
        errors.push('implement receipt parse failed: ' + err.message);
      }
    }
  }
  if (implementReceipt && typeof implementReceipt.head_sha === 'string' && implementReceipt.head_sha.length >= 7) {
    result.implement_receipt_head_sha = implementReceipt.head_sha;
    try {
      postGateDiff = gitDiffNameOnly(cwd, implementReceipt.head_sha, 'HEAD');
    } catch (err) {
      errors.push('post-gate diff failed: ' + err.message);
    }
  }
  result.post_gate_diff = postGateDiff.slice();

  const matchesPlanned = buildPlannedMatcher(result.planned);
  const prOutsidePlan = prDiff.filter(function (p) { return !matchesPlanned(p); });
  result.residual = dedupe(prOutsidePlan.concat(postGateDiff));

  result.ok = errors.length === 0;
  if (result.residual.length === 0 && result.ok) {
    result.skip_safe = true;
    result.reason = 'residual empty';
  } else if (!result.ok) {
    result.skip_safe = false;
    if (!result.reason) result.reason = 'errors present';
  } else {
    result.skip_safe = false;
    result.reason = 'residual files present (' + result.residual.length + ')';
  }
  return result;
}

// v1.20.3 — fail-closed convergence predicate, widened by diverse-agent-review
// M1 (DD2) from "Codex said converged" to "a CROSS-MODEL reviewer said converged".
//
// Skipping PR-Codex means asserting "Codex already reviewed this twice, so a
// third pass adds nothing". A multi-agent panel approval is not evidence that
// Codex ever spoke, so it must NOT satisfy the skip — otherwise moving plan
// review off Codex would silently delete cross-model review from the pipeline
// entirely instead of relocating it to the ship point. The predicate therefore
// requires verdict==='converged' AND source ∈ {codex, hybrid}.
//
// Still fail-closed on everything else: a missing receipt, a missing verdict,
// any non-'converged' verdict, a structurally broken proof, or a partial
// review_* stamp all read false.
function crossModelConverged(receipt) {
  return !!(receipt && isCrossModelCorroborated(receipt.resolution));
}

// Retained name — this is the predicate's historical identity and several
// call sites and tests refer to it. Semantics are now cross-model, not
// Codex-literal.
const codexConverged = crossModelConverged;

// CLI integration: combines computeResidual with convergence check against
// plan-codex + implement-codex receipts. Returns the same shape plus
// `convergence` block + finalized `skip_safe` that requires both gates
// converged.
function evaluateForDedupe(opts) {
  const o = opts || {};
  const cwd = o.cwd || process.cwd();
  let repoRoot;
  try {
    repoRoot = gitRepoRoot(cwd);
  } catch (err) {
    return {
      ok: false,
      errors: ['git repo root resolution failed: ' + err.message],
      skip_safe: false,
      reason: 'not in a git repository',
    };
  }

  const decisionId = o.decisionId;
  if (!decisionId) {
    return {
      ok: false,
      errors: ['decisionId required'],
      skip_safe: false,
      reason: 'decisionId required',
    };
  }

  const planReceipt = readReceipt(repoRoot, 'mccp-plan-codex', decisionId);
  const implementReceipt = readReceipt(repoRoot, 'mccp-implement-codex', decisionId);

  const residual = computeResidual({
    cwd: cwd,
    planPath: o.planPath,
    baseRef: o.baseRef,
    implementReceipt: implementReceipt,
  });

  // `converged` here means CROSS-MODEL converged (DD2): verdict==='converged'
  // AND the issuer was Codex or a hybrid panel. The raw codex_verdict and the
  // review_source are both surfaced so an audit trail can see exactly why a
  // skip was or was not permitted — a multi-agent approval shows up as
  // converged:false with review_source:'multi-agent', which is a different
  // story from a missing receipt and should read differently.
  const convergence = {
    decision_id: decisionId,
    plan_codex_receipt: planReceipt ? {
      converged: crossModelConverged(planReceipt),
      codex_verdict: (planReceipt.resolution && planReceipt.resolution.codex_verdict) || null,
      review_verdict: (planReceipt.resolution && planReceipt.resolution.review_verdict) || null,
      review_source: (planReceipt.resolution && planReceipt.resolution.review_source) || null,
      // codex-intent-context M1 (DD9) — the intent axis is added HERE, on the
      // plan receipt only, and NOT inside the shared codexConverged helper.
      // codexConverged is used for both receipts, so folding intent into it
      // would make mccp-implement-codex — deliberately out of intent scope
      // (UI4) — always read as unknown → false, killing dedupe for every
      // decision in the repo.
      intent_approved: isIntentApproved(planReceipt),
      round: planReceipt.round,
      head_sha: planReceipt.head_sha,
    } : null,
    implement_codex_receipt: implementReceipt ? {
      converged: crossModelConverged(implementReceipt),
      codex_verdict: (implementReceipt.resolution && implementReceipt.resolution.codex_verdict) || null,
      review_verdict: (implementReceipt.resolution && implementReceipt.resolution.review_verdict) || null,
      review_source: (implementReceipt.resolution && implementReceipt.resolution.review_source) || null,
      round: implementReceipt.round,
      head_sha: implementReceipt.head_sha,
    } : null,
  };

  let skipSafe = residual.skip_safe;
  let reason = residual.reason;
  if (skipSafe) {
    if (!convergence.plan_codex_receipt || !convergence.plan_codex_receipt.converged) {
      skipSafe = false;
      reason = 'plan-codex codex_verdict !== "converged" (or receipt missing) — dual-review required (fail-closed)';
    } else if (!convergence.plan_codex_receipt.intent_approved) {
      // DD2 — a legacy receipt (field absent) reads as unknown → not approved.
      // Refusing it costs one extra PR-Codex review; approving it would let
      // "delete the key" buy a free dual-review bypass, so the incentive to
      // forge by omission is zero. DD6 — a receipt written under the audited
      // override seals its real blocking verdict, so it lands here too.
      skipSafe = false;
      reason = 'plan-codex intent gate not approved (verdict=' +
        ((planReceipt.meta && planReceipt.meta.intent_gate_verdict) === undefined
          ? 'absent/legacy' : String(planReceipt.meta.intent_gate_verdict)) +
        ') — dual-review required (fail-closed)';
    } else if (!convergence.implement_codex_receipt || !convergence.implement_codex_receipt.converged) {
      skipSafe = false;
      reason = 'implement-codex codex_verdict !== "converged" (or receipt missing) — dual-review required (fail-closed)';
    } else {
      reason = 'residual empty AND both gates codex_verdict="converged" AND plan intent gate approved';
    }
  }

  return Object.assign({}, residual, {
    skip_safe: skipSafe,
    reason: reason,
    convergence: convergence,
  });
}

module.exports = {
  parsePlanFiles: parsePlanFiles,
  gitDiffNameOnly: gitDiffNameOnly,
  computeResidual: computeResidual,
  evaluateForDedupe: evaluateForDedupe,
  codexConverged: codexConverged,
  crossModelConverged: crossModelConverged,
  buildPlannedMatcher: buildPlannedMatcher,
  globToRegex: globToRegex,
  normalizePath: normalizePath,
};
