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

const PLACEHOLDER_RE = /\b(lorem|ipsum|test|tmp|temp|dummy|asdf|placeholder|todo|xxx|foo|bar|baz|qwerty)\b/i;
const URL_ONLY_RE = /^https?:\/\/\S+$/i;

const MIN_LENGTH = 30;
const MIN_WORDS = 3;

function tokenCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function validateReason(reason, opts) {
  const namespace = (opts && opts.namespace) || 'impeccable';
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
  if (PLACEHOLDER_RE.test(trimmed)) return { ok: false, reason: 'reason-placeholder' };

  return { ok: true, reason: null };
}

module.exports = {
  validateReason: validateReason,
  STRICT_NAMESPACES: STRICT_NAMESPACES,
  ONE_TOKEN_BANLIST: ONE_TOKEN_BANLIST,
  PLACEHOLDER_RE: PLACEHOLDER_RE,
  URL_ONLY_RE: URL_ONLY_RE,
  MIN_LENGTH: MIN_LENGTH,
  MIN_WORDS: MIN_WORDS,
};
