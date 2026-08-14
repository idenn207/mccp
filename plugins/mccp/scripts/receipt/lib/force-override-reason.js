'use strict';

// force-override-reason — namespace-aware reason validator for force-override
// receipts (impeccable_force_override / security_force_override).
//
// v0.2.5 Codex R1 F4 absorption + security-reviewer F-Sec-1 absorption:
//   - impeccable namespace (strict): REJECT placeholder/short/empty/URL-only
//     reasons at schema time. force_override receipts must carry deliberate
//     authored context — bypassing the impeccable design gate is auditable.
//   - security namespace (lenient): warning only (v0.2.4 baseline). v0.2.7
//     housekeeping debt: flip to strict via STRICT_NAMESPACES once existing
//     receipts are migrated.
//
// Returns { ok: boolean, reason: string|null }. reason is the rejection code
// when ok=false. Caller decides whether to error (strict) or warn (lenient).

const STRICT_NAMESPACES = new Set(['impeccable']);

const ONE_TOKEN_BANLIST = new Set([
  '1', 'yes', 'no', 'ok', 'true', 'false', 'noop', 'n/a', 'na', 'fixme', 'tbd',
]);

// Split by what the token PROVES, not by where it came from.
//
// FILLER is text nobody writes on purpose — `lorem ipsum`, `asdf`, `qwerty`.
// A reason containing one is filler regardless of what it is a reason FOR, and
// no real codebase names a symbol `lorem`, so rejecting it costs nothing.
//
// CODE_VOCABULARY is the rest: `test`, `tmp`, `foo`, `bar`, `todo`. In a short
// bypass justification these still read as throwaway, so overrides keep
// rejecting them. In prose ABOUT code they are ordinary nouns — a rebuttal has
// to be able to say "the reviewer pointed at test scaffolding in bar.ts" — so
// callers that pass `allowCodeVocabulary` skip this half only.
const FILLER_RE = /\b(lorem|ipsum|asdf|qwerty|placeholder|dummy)\b/i;
const CODE_VOCABULARY_RE = /\b(test|tmp|temp|todo|xxx|foo|bar|baz)\b/i;

// Kept as the union for back-compat: it is exported, and callers that want the
// original all-or-nothing rule should keep getting it.
const PLACEHOLDER_RE = /\b(lorem|ipsum|test|tmp|temp|dummy|asdf|placeholder|todo|xxx|foo|bar|baz|qwerty)\b/i;
const URL_ONLY_RE = /^https?:\/\/\S+$/i;

const MIN_LENGTH = 30;
const MIN_WORDS = 3;

function tokenCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

// `allowCodeVocabulary` — skip PLACEHOLDER_RE for reasons that are prose ABOUT
// CODE. The list bans `test`, `tmp`, `temp`, `foo`, `bar`, `baz` as whole words
// anywhere in the string, which is right for an override justification (a 30-char
// bypass reason containing "test" is usually throwaway) and wrong for a rebuttal
// that must name files and symbols: "the reviewer pointed at test scaffolding in
// bar.ts, not the shipped module boundary" is substantive and was rejected.
//
// A false block here is not a safe direction. The author has a real rebuttal, is
// refused, and the paths out are to reword until the validator relents — which
// teaches gaming — or to give up and mislabel, which is the failure the gate
// exists to prevent. What still holds is length + word count + the one-token
// banlist, which is what makes a reason a sentence. What was never true is that
// this validator makes a dispute correct; the audit trail is what makes it
// reviewable (CLAUDE.md §3.13.1).
function validateReason(reason, opts) {
  const namespace = (opts && opts.namespace) || 'impeccable';
  const allowCodeVocabulary = !!(opts && opts.allowCodeVocabulary);
  const strictOverride = opts && typeof opts.strict === 'boolean' ? opts.strict : null;
  const strict = strictOverride !== null ? strictOverride : STRICT_NAMESPACES.has(namespace);

  if (!strict) return { ok: true, reason: null };

  if (reason === null || reason === undefined) {
    return { ok: false, reason: 'reason-required' };
  }
  if (typeof reason !== 'string') {
    return { ok: false, reason: 'reason-not-string' };
  }
  const trimmed = reason.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'reason-empty' };

  const lower = trimmed.toLowerCase();
  if (ONE_TOKEN_BANLIST.has(lower)) return { ok: false, reason: 'reason-banlist-token' };
  if (URL_ONLY_RE.test(trimmed)) return { ok: false, reason: 'reason-url-only' };
  if (trimmed.length < MIN_LENGTH) return { ok: false, reason: 'reason-too-short' };
  if (tokenCount(trimmed) < MIN_WORDS) return { ok: false, reason: 'reason-too-few-words' };
  if (FILLER_RE.test(trimmed)) return { ok: false, reason: 'reason-placeholder' };
  if (!allowCodeVocabulary && CODE_VOCABULARY_RE.test(trimmed)) {
    return { ok: false, reason: 'reason-placeholder' };
  }

  return { ok: true, reason: null };
}

module.exports = {
  validateReason: validateReason,
  STRICT_NAMESPACES: STRICT_NAMESPACES,
  ONE_TOKEN_BANLIST: ONE_TOKEN_BANLIST,
  PLACEHOLDER_RE: PLACEHOLDER_RE,
  FILLER_RE: FILLER_RE,
  CODE_VOCABULARY_RE: CODE_VOCABULARY_RE,
  URL_ONLY_RE: URL_ONLY_RE,
  MIN_LENGTH: MIN_LENGTH,
  MIN_WORDS: MIN_WORDS,
};
