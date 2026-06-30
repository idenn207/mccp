'use strict';

// design-grounding — mechanical, LLM-free post-EXECUTE design grounding lint.
//
// The impeccable design-critique loop (CLAUDE.md §3.9) runs BEFORE EXECUTE: it
// judges the plan/direction but never sees the produced diff. This lib closes
// that gap with a deterministic 3-step contract — capture direction → EXECUTE
// consumes it → lint the produced rendered-surface added lines against the
// source-diff-safe H15 anchor + optional required-signal consistency.
//
// Pure except the two artifact I/O functions (captureDirection / readDirection),
// which mirror state-writer's single-purpose persistence. The caller (the
// /mccp:prp-implement command body) owns all git invocation and passes diff
// TEXT in — this lib never shells out, so it stays unit-testable and
// worktree-path agnostic (Codex Implement-R1 F1: the command resolves all
// artifact paths via `git rev-parse --git-path`, never `.git/` hardcode).

const fs = require('fs');
const { runRules, GROUNDING_RULES } = require('./renderer/output-constraints');
const { extractDiffSignals } = require('./impeccable-routing');

const GROUNDING_MODES = ['off', 'warn', 'enforce'];
const VERDICTS = ['grounded', 'anchor_clean', 'inconclusive', 'violations', 'skipped'];
const SIGNAL_KINDS = ['motion', 'color', 'typography', 'responsive'];

// parseGroundingMode(env) → 'off' | 'warn' | 'enforce'. Default enforce.
// Typos / unset → enforce (fail-closed) with a loud stderr warn so a silent
// disable is impossible (§feedback-loud-fail-open). 'off' is the only way to
// disable, and it too warns loudly (the caller emits that one).
function parseGroundingMode(env) {
  const raw = (env && env.MCCP_DESIGN_GROUNDING);
  if (raw === undefined || raw === null || raw === '') return 'enforce';
  const v = String(raw).trim().toLowerCase();
  if (GROUNDING_MODES.indexOf(v) !== -1) return v;
  process.stderr.write('[mccp:design-grounding] unknown MCCP_DESIGN_GROUNDING="' +
    raw + '" — falling back to enforce\n');
  return 'enforce';
}

// Rendered-surface classification. CSS/SCSS → css bucket; component + HTML
// extensions → html bucket (H15 matches `<h4-9>` in JSX exactly as in HTML);
// rendered dashboard markdown (.claude/cache/*.md) → md bucket. Generic .md
// (command docs, plans, README, CHANGELOG) is intentionally EXCLUDED — bare
// .md would false-positive H15 on the many `####` headings in command docs,
// which are authoring structure, not a rendered viewport (plan Risk "임의
// 비-디자인 diff 오발화 회피"; documented refinement of the plan's draft regex).
const CSS_EXT_RE = /\.(?:css|scss)$/i;
const HTML_EXT_RE = /\.(?:html|tsx|jsx|vue|svelte|astro)$/i;
const RENDERED_MD_RE = /(?:^|\/)\.claude\/cache\/[^/]*\.md$/i;

function bucketForFile(filePath) {
  const f = String(filePath || '').replace(/\\/g, '/');
  if (CSS_EXT_RE.test(f)) return 'css';
  if (HTML_EXT_RE.test(f)) return 'html';
  if (RENDERED_MD_RE.test(f)) return 'md';
  return null;
}

function emptyBuckets() {
  return { css: [], html: [], md: [] };
}

// extractRenderedSurfaceFromDiff(diffText) → { css:[], html:[], md:[] }.
// Parses a unified diff (git diff / git diff --no-index) and collects ADDED
// content lines (`+` but not the `+++` file header) for rendered-surface files
// only. Non-rendered files contribute nothing → a non-UI diff yields empty
// buckets (the gate then no-ops). Robust to multi-file diffs; the current file
// is tracked from the `+++ b/<path>` header (falls back to `diff --git`).
function extractRenderedSurfaceFromDiff(diffText) {
  const buckets = emptyBuckets();
  const text = String(diffText || '');
  if (!text) return buckets;
  const lines = text.split(/\r?\n/);
  let currentBucket = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('+++ ')) {
      // new-file header: `+++ b/path` or `+++ path` or `+++ /dev/null`
      let p = line.slice(4).trim();
      if (p === '/dev/null') { currentBucket = null; continue; }
      p = p.replace(/^b\//, '');
      // strip a trailing tab-timestamp some diff tools append
      p = p.replace(/\t.*$/, '');
      currentBucket = bucketForFile(p);
      continue;
    }
    if (line.startsWith('--- ')) continue; // old-file header
    if (line.startsWith('diff --git')) {
      // `diff --git a/x b/y` — adopt the b-path as a fallback file scope.
      const m = line.match(/ b\/(.+)$/);
      currentBucket = m ? bucketForFile(m[1]) : null;
      continue;
    }
    if (line.startsWith('@@')) continue; // hunk header
    if (line.startsWith('+') && !line.startsWith('+++')) {
      if (currentBucket) buckets[currentBucket].push(line.slice(1));
    }
  }
  return buckets;
}

function bucketsToInput(buckets) {
  return {
    css: (buckets.css || []).join('\n'),
    html: (buckets.html || []).join('\n'),
    md: (buckets.md || []).join('\n'),
  };
}

function hasAnyBucketContent(buckets) {
  return (buckets.css && buckets.css.length > 0) ||
    (buckets.html && buckets.html.length > 0) ||
    (buckets.md && buckets.md.length > 0);
}

// Per-bucket line-set difference: lines present in `current` but not in `base`.
// This isolates the EXECUTE delta from a worktree that was already dirty at
// capture time (Codex Implement-R1 F2). Order is preserved from `current`.
function subtractBuckets(current, base) {
  const out = emptyBuckets();
  ['css', 'html', 'md'].forEach(function (k) {
    const baseSet = new Set((base && base[k]) || []);
    out[k] = ((current && current[k]) || []).filter(function (l) {
      return !baseSet.has(l);
    });
  });
  return out;
}

function normalizeRequiredSignals(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(function (s) { return String(s || '').trim().toLowerCase(); })
    .filter(function (s) { return SIGNAL_KINDS.indexOf(s) !== -1; });
}

function atomicWriteJson(filePath, obj) {
  const tmp = filePath + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, filePath);
}

// captureDirection(opts) → path. Persists the pre-EXECUTE direction artifact.
// The caller resolves `path` via `git rev-parse --git-path mccp/tmp/...` so it
// lands in the per-worktree gitdir (F1). opts.preExecuteDiffText is the diff
// snapshot taken BEFORE EXECUTE; we store its rendered-surface buckets so the
// post-EXECUTE lint can subtract them (F2). Write is atomic (temp + rename, F4)
// so a crash mid-write never leaves a half-written artifact that readDirection
// would silently treat as "no capture".
function captureDirection(opts) {
  const o = opts || {};
  if (!o.path) throw new Error('captureDirection: opts.path is required');
  const artifact = {
    schema: 'design-grounding/v1',
    slug: o.slug || null,
    captured_at: o.now || new Date().toISOString(),
    baseline_rev: o.baselineRev || null,
    direction: o.direction || null,
    routed_commands: Array.isArray(o.routedCommands) ? o.routedCommands : [],
    critique_verdict: o.critiqueVerdict || null,
    required_signals: normalizeRequiredSignals(o.requiredSignals),
    // 4 SKILL.md Output Constraints checklist anchor (informational — the
    // mechanical lint enforces the H15 subset; this records intent).
    output_constraints: [
      '정보 위계 3단계 (heading depth <= 3 in primary surface)',
      '강조색 화면당 1개 (accent/highlight token <= 1 per viewport)',
      'raw markdown marker 금지 (no unrendered **bold**/MD0xx/stray code)',
      '한 화면 항목 수 상한 (list-of-N top 3 expanded + rest collapsed)',
    ],
    pre_execute_rendered_buckets: extractRenderedSurfaceFromDiff(o.preExecuteDiffText),
  };
  atomicWriteJson(o.path, artifact);
  return o.path;
}

// readDirection(path) → object | null. Fail-open read: a missing/unreadable/
// corrupt artifact returns null. The CALLER distinguishes "no capture expected"
// (null is fine, gate no-ops) from "capture was required but read failed"
// (null → decideGrounding({readFailed:true}) → inconclusive block in enforce,
// Codex Implement-R1 F4). This function does not decide that — it only reports
// readability, so the policy lives in one place (decideGrounding).
function readDirection(path) {
  try {
    if (!path || !fs.existsSync(path)) return null;
    const raw = fs.readFileSync(path, 'utf8');
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    return obj;
  } catch (_err) {
    return null;
  }
}

// lintProducedDiff({ currentDiffText, direction, mode }) → analysis object.
// Pure. Extracts current rendered-surface buckets, subtracts the captured
// pre-EXECUTE buckets (F2) to isolate the EXECUTE delta, runs the GROUNDING
// rule subset (H15) over the delta, and computes required-signal consistency
// (declared machine-checkable dimensions absent from the delta). Returns the
// raw inputs decideGrounding needs — it does NOT itself pick a verdict.
function lintProducedDiff(opts) {
  const o = opts || {};
  const direction = o.direction || {};
  const currentBuckets = extractRenderedSurfaceFromDiff(o.currentDiffText);
  const preBuckets = direction.pre_execute_rendered_buckets || emptyBuckets();
  const deltaBuckets = subtractBuckets(currentBuckets, preBuckets);
  const hasRenderedDiff = hasAnyBucketContent(deltaBuckets);

  const ruleResult = runRules(bucketsToInput(deltaBuckets), GROUNDING_RULES);
  const blockingViolations = ruleResult.details.slice();

  const requiredSignals = normalizeRequiredSignals(direction.required_signals);
  const deltaText = []
    .concat(deltaBuckets.css, deltaBuckets.html, deltaBuckets.md)
    .join('\n');
  const presentSignals = extractDiffSignals(deltaText);
  const missingRequiredSignals = requiredSignals.filter(function (s) {
    return presentSignals[s] !== true;
  });

  const advisories = [];
  if (!hasRenderedDiff) {
    advisories.push('no rendered-surface added lines in EXECUTE delta (gate no-op)');
  }

  return {
    hasRenderedDiff: hasRenderedDiff,
    blockingViolations: blockingViolations,
    requiredSignals: requiredSignals,
    missingRequiredSignals: missingRequiredSignals,
    presentSignals: presentSignals,
    deltaBuckets: deltaBuckets,
    advisories: advisories,
    details: ruleResult.details,
  };
}

// decideGrounding({ blockingViolations, missingRequiredSignals,
//   requiredSignalsDeclared, hasRenderedDiff, mode, readFailed }) →
//   { verdict, block }.
//
// verdict enum (Codex Implement-R1 F4 — never silently 'verified'):
//   skipped       — mode 'off'.
//   inconclusive  — capture expected but artifact read failed (readFailed), OR
//                   enforce + rendered diff + a declared required signal is
//                   absent from the produced delta. Honest "couldn't confirm".
//   violations    — H15 anchor violated in the produced delta.
//   grounded      — rendered diff present, no violations, AND declared required
//                   signals were all satisfied.
//   anchor_clean  — rendered diff present (or none) with clean anchors but no
//                   declared required signals to confirm grounding against; OR
//                   no rendered surface produced at all (nothing to ground).
// `block` is true only in enforce mode for violations / inconclusive.
function decideGrounding(opts) {
  const o = opts || {};
  const mode = o.mode || 'enforce';
  const bv = Array.isArray(o.blockingViolations)
    ? o.blockingViolations.length : (parseInt(o.blockingViolations, 10) || 0);
  const mrs = Array.isArray(o.missingRequiredSignals)
    ? o.missingRequiredSignals.length : (parseInt(o.missingRequiredSignals, 10) || 0);
  const requiredDeclared = (o.requiredSignalsDeclared === true) ||
    (typeof o.requiredSignalsDeclared === 'number' && o.requiredSignalsDeclared > 0);

  if (mode === 'off') return { verdict: 'skipped', block: false };

  if (o.readFailed === true) {
    return { verdict: 'inconclusive', block: mode === 'enforce' };
  }

  if (!o.hasRenderedDiff) {
    return { verdict: 'anchor_clean', block: false };
  }

  if (bv > 0) return { verdict: 'violations', block: mode === 'enforce' };
  if (mrs > 0) return { verdict: 'inconclusive', block: mode === 'enforce' };

  if (requiredDeclared) return { verdict: 'grounded', block: false };
  return { verdict: 'anchor_clean', block: false };
}

module.exports = {
  GROUNDING_MODES: GROUNDING_MODES,
  VERDICTS: VERDICTS,
  SIGNAL_KINDS: SIGNAL_KINDS,
  parseGroundingMode: parseGroundingMode,
  bucketForFile: bucketForFile,
  extractRenderedSurfaceFromDiff: extractRenderedSurfaceFromDiff,
  subtractBuckets: subtractBuckets,
  captureDirection: captureDirection,
  readDirection: readDirection,
  lintProducedDiff: lintProducedDiff,
  decideGrounding: decideGrounding,
};
