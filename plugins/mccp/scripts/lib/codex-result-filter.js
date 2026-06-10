'use strict';

// codex-result-filter — output-level design + a11y finding triage.
//
// Plan v0.3.6 Task 2 (축 1b). When impeccable is available, Codex review
// findings that match design-domain or accessibility keywords are dropped from
// the review surface (impeccable handles design critique; a11y-architect
// handles accessibility). Both flows go into droppedFindings so the caller can
// stamp the receipt audit fields (Task 3) and optionally route a11y items to
// impeccable a11y-architect.
//
// Rule (first match wins per finding):
//   1. matches A11Y_KEYWORDS (category OR text) → drop + a11yRoutedCount++
//   2. matches DESIGN_KEYWORDS (category OR text) → drop
//   3. otherwise → pass-through (filteredFindings)
//
// Rationale (mirrors codex-invoke.js classification enum comment style):
//   - Strict opts.impeccableAvailable === true gate — truthy strings like '1'
//     do NOT trigger silently. Identity pass-through otherwise.
//   - Word-boundary regex prevents partial matches (e.g., 'scolor', 'branding-team').
//   - Malformed input (null, non-object, missing findings) → safe empty result.
//   - computeDroppedDigest produces sha256 over joined finding texts so the
//     receipt audit trail is reproducible (caller stamps as
//     meta.dropped_findings_digest, Task 3).

const crypto = require('crypto');

const DESIGN_KEYWORDS = Object.freeze([
  /\bvisual\s+design\b/i,
  /\bcolor\b/i,
  /\btypography\b/i,
  /\bspacing\b/i,
  /\banimation\b/i,
  /\bmicro[-\s]interaction\b/i,
  /\bbrand\b/i,
]);

const A11Y_KEYWORDS = Object.freeze([
  /\ba11y\b/i,
  /\baccessibility\b/i,
  /\bwcag\b/i,
  /\baria\b/i,
  /\bkeyboard\s+navigation\b/i,
]);

const EMPTY_RESULT = Object.freeze({
  filteredFindings: Object.freeze([]),
  droppedFindings: Object.freeze([]),
  a11yRoutedCount: 0,
});

function matchesAny(text, patterns) {
  if (text == null) return false;
  const s = String(text);
  if (s.length === 0) return false;
  for (let i = 0; i < patterns.length; i++) {
    if (patterns[i].test(s)) return true;
  }
  return false;
}

function findingMatches(finding, patterns) {
  if (!finding || typeof finding !== 'object') return false;
  return matchesAny(finding.category, patterns) || matchesAny(finding.text, patterns);
}

function isDesignFinding(finding) {
  return findingMatches(finding, DESIGN_KEYWORDS);
}

function isA11yFinding(finding) {
  return findingMatches(finding, A11Y_KEYWORDS);
}

function filterDesignFindings(codexResult, opts) {
  opts = opts || {};
  const findings = (codexResult && typeof codexResult === 'object' && Array.isArray(codexResult.findings))
    ? codexResult.findings
    : [];

  // impeccable unavailable → identity pass-through. Counter at 0, dropped empty.
  if (opts.impeccableAvailable !== true) {
    return {
      filteredFindings: findings.slice(),
      droppedFindings: [],
      a11yRoutedCount: 0,
    };
  }

  if (findings.length === 0) {
    return { filteredFindings: [], droppedFindings: [], a11yRoutedCount: 0 };
  }

  const filteredFindings = [];
  const droppedFindings = [];
  let a11yRoutedCount = 0;

  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    if (isA11yFinding(f)) {
      droppedFindings.push(f);
      a11yRoutedCount++;
      continue;
    }
    if (isDesignFinding(f)) {
      droppedFindings.push(f);
      continue;
    }
    filteredFindings.push(f);
  }

  return {
    filteredFindings: filteredFindings,
    droppedFindings: droppedFindings,
    a11yRoutedCount: a11yRoutedCount,
  };
}

function computeDroppedDigest(droppedFindings) {
  if (!Array.isArray(droppedFindings) || droppedFindings.length === 0) return null;
  const parts = [];
  for (let i = 0; i < droppedFindings.length; i++) {
    const f = droppedFindings[i];
    if (!f || typeof f !== 'object') continue;
    const text = (f.text != null) ? String(f.text) : '';
    const category = (f.category != null) ? String(f.category) : '';
    const piece = text.length > 0 ? text : category;
    if (piece.length > 0) parts.push(piece);
  }
  if (parts.length === 0) return null;
  // Prefix with 'sha256:' to match the codebase's SHA256_RE receipt convention
  // (plan_hash, subject_hash, receipt_hash all carry the prefix). Without it
  // schema.js validator would reject the digest as malformed.
  return 'sha256:' + crypto.createHash('sha256').update(parts.join('\n---\n'), 'utf8').digest('hex');
}

module.exports = {
  filterDesignFindings: filterDesignFindings,
  computeDroppedDigest: computeDroppedDigest,
  isDesignFinding: isDesignFinding,
  isA11yFinding: isA11yFinding,
  DESIGN_KEYWORDS: DESIGN_KEYWORDS,
  A11Y_KEYWORDS: A11Y_KEYWORDS,
  EMPTY_RESULT: EMPTY_RESULT,
};
