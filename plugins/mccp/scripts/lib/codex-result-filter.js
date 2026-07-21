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
//   1. matches A11Y_KEYWORDS (any MATCH_FIELD) → drop + a11yRoutedCount++
//   2. matches DESIGN_KEYWORDS (any MATCH_FIELD) → drop
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
//
// v1.22.3 M3 follow-up (F1 premise repair) — MATCH THE REAL PRODUCER.
//
// This filter used to read ONLY `finding.category` / `finding.text`. The real
// producer emits neither. codex-companion's render.mjs#normalizeReviewFinding
// pins each finding to exactly:
//   { severity, title, body, file, line_start, line_end, recommendation }
// and codex-invoke.js passes that JSON through verbatim (no re-shaping). So
// every matcher missed on every real finding: the filter was structurally an
// IDENTITY whenever impeccable was available, and the four receipt audit fields
// it feeds (codex_design_scope_excluded / design_findings_dropped /
// a11y_routed_to_impeccable / dropped_findings_digest) were always
// true/0/false/null. Measured: 18 receipts since v0.3.6 carry
// codex_design_scope_excluded=true with dropped=0 on every one. The
// category/text fixture shape existed only in this module's own tests — the
// tests encoded the implementation's assumption instead of the producer's
// contract, which is the same failure mode as the M3 `.stdout` blindness this
// cycle is closing.
//
// FIELD CHOICE IS DELIBERATELY ASYMMETRIC. We add `title` (the producer's short,
// topical label) but NOT `body` / `recommendation` (free prose). The two error
// directions are not equally costly:
//   - false DROP  → an in-scope security/correctness finding silently leaves the
//                   review surface. The gate weakens with no audit signal.
//   - false KEEP  → the finding stays actionable, the PR blocks, a human reads it.
//                   Fail-closed, which is the direction this gate must err in.
// `\bcolor\b` / `\bbrand\b` / `\bspacing\b` occur incidentally in prose about
// non-design code, so matching `body` would buy marginal recall at the price of
// silent false drops. `category` / `text` stay in the list for back-compat with
// any legacy caller (and this module's older fixtures); they are simply absent
// on real payloads.
const MATCH_FIELDS = Object.freeze(['category', 'text', 'title']);

// IN-SCOPE VETO — a finding that shows any in-scope signal is NEVER dropped, no
// matter how design-ish its title reads.
//
// Making the matcher work (above) created a hole that could not exist while it
// was an identity: a genuine security finding whose TITLE happens to carry a
// design word now matches and gets dropped. Measured on real-looking payloads
// before this veto existed:
//   "Brand asset path traversal"                    → DROPPED  (\bbrand\b)
//   "Color palette config allows script injection"  → DROPPED  (\bcolor\b)
//   "Spacing token loader leaks credentials"        → DROPPED  (\bspacing\b)
// If such a finding were the only one, deriveEffectiveReview row 5 would mark the
// review scope-excluded and the PR would pass with a real security objection
// silently removed from the review surface.
//
// The veto scans DELIBERATELY WIDER fields than the drop does (body and
// recommendation included), because the asymmetry runs the other way here:
//   - a false VETO → the finding is KEPT → PR blocks → a human reads it. Safe.
//   - a false DROP → the gate weakens silently. Never acceptable.
// So: drop decides on narrow, high-signal fields; veto reads everything.
const IN_SCOPE_VETO = Object.freeze([
  /\binject/i,
  /\btraversal\b/i,
  /\bauth(n|z|entication|orization)?\b/i,
  /\bsecret/i,
  /\bcredential/i,
  /\bpassword/i,
  /\bxss\b/i,
  /\bcsrf\b/i,
  /\bssrf\b/i,
  /\brce\b/i,
  /\bexploit/i,
  /\bsanitiz/i,
  /\bprivilege/i,
  /\bescalat/i,
  /\bleak(s|ed|ing)?\b/i,
  /\brace\s+condition/i,
  /\bdeadlock/i,
  /\bcorrupt/i,
  /\bdata\s+loss\b/i,
  /\boverflow/i,
]);

// Every field we can see — the veto errs toward keeping.
const VETO_FIELDS = Object.freeze(['category', 'text', 'title', 'body', 'recommendation']);

// Field preference for the dropped-findings digest. `text`/`category` first so
// the legacy fixture shape digests exactly as before (stability), then `title`
// so real producer findings resolve to their label instead of to nothing.
const DIGEST_FIELDS = Object.freeze(['text', 'title', 'category']);

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
  // v1.13.0 M3 — a11y findings exposed as a supplementary input so a caller
  // (pr.md) can hand them to mccp:a11y-architect. a11yRoutedCount stays the
  // length of this array. Primary a11y-auto-invoke trigger is the diff's
  // rendering surface, NOT this array (Codex R1 F1: the design-scope preamble
  // usually suppresses a11y findings before they reach the filter).
  a11yFindings: Object.freeze([]),
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
  for (let i = 0; i < MATCH_FIELDS.length; i++) {
    if (matchesAny(finding[MATCH_FIELDS[i]], patterns)) return true;
  }
  return false;
}

// hasInScopeSignal(finding) → boolean. True ⇒ never droppable (see IN_SCOPE_VETO).
function hasInScopeSignal(finding) {
  if (!finding || typeof finding !== 'object') return false;
  for (let i = 0; i < VETO_FIELDS.length; i++) {
    if (matchesAny(finding[VETO_FIELDS[i]], IN_SCOPE_VETO)) return true;
  }
  return false;
}

function isDesignFinding(finding) {
  if (hasInScopeSignal(finding)) return false;
  return findingMatches(finding, DESIGN_KEYWORDS);
}

function isA11yFinding(finding) {
  if (hasInScopeSignal(finding)) return false;
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
      a11yFindings: [],
    };
  }

  if (findings.length === 0) {
    return { filteredFindings: [], droppedFindings: [], a11yRoutedCount: 0, a11yFindings: [] };
  }

  const filteredFindings = [];
  const droppedFindings = [];
  const a11yFindings = [];

  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    if (isA11yFinding(f)) {
      droppedFindings.push(f);
      a11yFindings.push(f);
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
    // a11yRoutedCount stays the canonical count; a11yFindings is the same set
    // as an array so the count and the payload can never drift.
    a11yRoutedCount: a11yFindings.length,
    a11yFindings: a11yFindings,
  };
}

function computeDroppedDigest(droppedFindings) {
  if (!Array.isArray(droppedFindings) || droppedFindings.length === 0) return null;
  // v1.22.3 M3 follow-up — the identifying piece must be resolvable on a REAL
  // finding too. `text`/`category` never exist on producer payloads (see
  // MATCH_FIELDS), so a title-less lookup digested nothing and returned null:
  // the audit trail claimed "nothing was dropped" precisely when something was.
  // Order mirrors MATCH_FIELDS so the digest names the same field the drop
  // decision keyed on.
  const parts = [];
  for (let i = 0; i < droppedFindings.length; i++) {
    const f = droppedFindings[i];
    if (!f || typeof f !== 'object') continue;
    let piece = '';
    for (let k = 0; k < DIGEST_FIELDS.length; k++) {
      const v = f[DIGEST_FIELDS[k]];
      if (v != null && String(v).length > 0) { piece = String(v); break; }
    }
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
  hasInScopeSignal: hasInScopeSignal,
  DESIGN_KEYWORDS: DESIGN_KEYWORDS,
  A11Y_KEYWORDS: A11Y_KEYWORDS,
  IN_SCOPE_VETO: IN_SCOPE_VETO,
  MATCH_FIELDS: MATCH_FIELDS,
  VETO_FIELDS: VETO_FIELDS,
  DIGEST_FIELDS: DIGEST_FIELDS,
  EMPTY_RESULT: EMPTY_RESULT,
};
