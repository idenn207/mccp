'use strict';
const envValue = require('./env-contract/value');

// Codex bridge — parse `Skill(codex:adversarial-review)` results into a
// stable verdict shape the Stop-loop hook can act on.
//
// This module does not invoke Codex itself (the Skill tool does that
// from the command body / hook context). It receives the raw skill
// response text plus the focus text the hook sent in, and classifies:
//
//   - verdict:        'converged' | 'divergent' | 'critical' | 'unavailable'
//   - rounds:         observed round count (1..3+; 0 if unparsable)
//   - openQuestions:  array of {severity, item}
//   - summary:        one-line gist (≤120 chars)
//   - escalate:       true when dual-reviewer escalation should be flagged
//                     (Sprint 12: divergent && rounds>=3 OR verdict==='critical')
//
// Auto-fallback triggers (Risk #1): setup_required / not authenticated /
// 60-second timeout / rate_limit / service_unavailable / any thrown
// error in the bridge itself → verdict='unavailable', escalate=false.

const AUTO_FALLBACK_PATTERNS = [
  /setup[_ ]required/i,
  /not\s+authenticated/i,
  /rate[_ ]?limit/i,
  /service[_ ]unavailable/i,
  /^codex unavailable/im,
  /\bauto-fallback\b/i,
  /timed?\s*out\s*\(?60s?\)?/i,
  /codex[\s-]plugin[\s-]not[\s-]installed/i,
  /codex[\s-]companion[\s-]not[\s-]found/i,
  /cli[\s-]not[\s-]authenticated/i,
  /process[\s-]exit[\s-]nonzero/i,
];

// Auto-CRITICAL catalog mirrors docs/gate-design.md §Auto-CRITICAL.
const CRITICAL_PATTERNS = [
  { name: 'secret_exposure',      re: /(secret|credential|api[_ ]?key|password|token)\b.{0,40}(expose|exposed|leak|leaked|committed)/i },
  { name: 'data_loss',            re: /(data\s+loss|irreversible|drop\s+table|drop\s+database|delete\s+all)/i },
  { name: 'authz_bypass',         re: /(auth(orization)?\s+bypass|authentication\s+bypass|privilege\s+escalation)/i },
  { name: 'external_destination', re: /(external\s+destination|exfiltrat|sends?\s+to\s+(external|third[\s-]party))/i },
  { name: 'crypto_key',           re: /(crypto(graphic)?\s+key|signing\s+key|hsm|kms|key\s+rotation)/i },
];

const SEVERITY_RE = /^\s*(CRITICAL|HIGH|MEDIUM|LOW)\b[:\-\s]\s*(.+)$/im;

const MAX_SUMMARY_LEN = 120;

function isUnavailable(text) {
  if (!text) return true;
  for (const re of AUTO_FALLBACK_PATTERNS) {
    if (re.test(text)) return true;
  }
  return false;
}

function detectCriticalCategory(text) {
  if (!text) return null;
  for (const cat of CRITICAL_PATTERNS) {
    if (cat.re.test(text)) return cat.name;
  }
  return null;
}

function parseRounds(text) {
  if (!text) return 0;
  // Explicit declaration first: "rounds: 3", "round=3", "Round count: 2".
  const explicit = text.match(/rounds?\s*(?:count|number)?\s*[:=]\s*(\d+)/i);
  if (explicit) {
    const n = parseInt(explicit[1], 10);
    if (Number.isFinite(n) && n >= 0 && n <= 99) return n;
  }
  // Fallback: find the highest "Round N" numeric occurrence.
  const matches = text.match(/Round\s+(\d+)/gi);
  if (matches && matches.length > 0) {
    let max = 0;
    for (const m of matches) {
      const n = parseInt(m.replace(/[^\d]/g, ''), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return max;
  }
  return 0;
}

function parseOpenQuestions(text) {
  if (!text) return [];
  const out = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(SEVERITY_RE);
    if (m) {
      out.push({ severity: m[1].toUpperCase(), item: m[2].trim() });
    }
  }
  return out;
}

// parseVerdict(text) → 'converged' | 'divergent' | 'unavailable'
//
// FREE-TEXT FALLBACK ONLY (v1.22.3 M3 follow-up, F5). This is a keyword scan over
// prose and it has NO knowledge of the companion's structured vocabulary
// (`approve` | `needs-attention`). It therefore cannot see a real verdict, and the
// `/\bconverged\b/i` rule below matches the word ANYWHERE — including inside a
// finding that is arguing *against* converging. Measured on this cycle's own
// Plan-Codex R1 ('needs-attention', "No ship", 4 findings): this function returned
// 'converged', because a finding body contained the sentence "…calls stamping
// `converged` for a 'No ship' review an integrity bug".
//
// PRECEDENCE: callers deriving a gate verdict MUST go through
// codex-review-payload.js#deriveGateVerdict, which reads the STRUCTURED
// `.result.verdict` first and only falls back here when there is no structured
// verdict to read (legacy / non-envelope input). Do not call this directly to
// decide a receipt's resolution.codex_verdict — cross-gate dedupe keys on that
// value, so a false 'converged' here silently bypasses dual review.
function parseVerdict(text) {
  if (!text) return 'unavailable';
  if (/divergent[_ ]unresolved/i.test(text)) return 'divergent';
  if (/\bconverged\b/i.test(text)) return 'converged';
  if (/\bdivergent\b/i.test(text)) return 'divergent';
  if (/\bAPPROVE\b/i.test(text)) return 'converged';
  if (/\bREJECT\b/i.test(text)) return 'divergent';
  // Default-safe: when no verdict keyword is recognized, the bridge cannot
  // certify approval. Treat as 'unavailable' so the hook fails open without
  // recording a false "converged" review (Reviewer B Round 1 #7).
  return 'unavailable';
}

function deriveSummary(text, focus) {
  const source = String(text || focus || '').replace(/\s+/g, ' ').trim();
  if (source.length <= MAX_SUMMARY_LEN) return source;
  return source.slice(0, MAX_SUMMARY_LEN - 1) + '…';
}

function isDisabled() {
  return envValue.parseBool(process.env, 'MCCP_CODEX_DISABLED');
}

function parseCodexResult(rawText, focus) {
  try {
    // MCCP_CODEX_DISABLED=1 short-circuits the bridge. The caller still
    // wrote a receipt with codex_skipped=true and reason='codex_disabled';
    // the bridge surfaces 'skipped' so downstream gate logic can tell the
    // difference between "tried Codex and it failed" (unavailable) and
    // "policy says don't call Codex" (skipped).
    if (isDisabled()) {
      return {
        verdict: 'skipped',
        rounds: 0,
        openQuestions: [],
        summary: deriveSummary('Codex skipped (MCCP_CODEX_DISABLED=1)', focus),
        criticalCategory: null,
        escalate: false,
        reason: 'codex_disabled',
      };
    }

    const text = String(rawText || '');

    if (isUnavailable(text) || !text.trim()) {
      return {
        verdict: 'unavailable',
        rounds: 0,
        openQuestions: [],
        summary: deriveSummary('Codex unavailable (auto-fallback)', focus),
        criticalCategory: null,
        escalate: false,
      };
    }

    const criticalCategory = detectCriticalCategory(text);
    if (criticalCategory) {
      return {
        verdict: 'critical',
        rounds: parseRounds(text) || 1,
        openQuestions: parseOpenQuestions(text),
        summary: deriveSummary('CRITICAL: ' + criticalCategory + ' detected', focus),
        criticalCategory: criticalCategory,
        escalate: true,
      };
    }

    const verdict = parseVerdict(text);
    const rounds = parseRounds(text) || 1;
    const openQuestions = parseOpenQuestions(text);
    const escalate = verdict === 'divergent' && rounds >= 3;

    return {
      verdict: verdict,
      rounds: rounds,
      openQuestions: openQuestions,
      summary: deriveSummary(text.split(/\r?\n/).find(l => l.trim()) || focus || '', focus),
      criticalCategory: null,
      escalate: escalate,
    };
  } catch (err) {
    return {
      verdict: 'unavailable',
      rounds: 0,
      openQuestions: [],
      summary: deriveSummary('bridge parse error: ' + err.message, focus),
      criticalCategory: null,
      escalate: false,
    };
  }
}

module.exports = {
  parseCodexResult: parseCodexResult,
  isUnavailable: isUnavailable,
  isDisabled: isDisabled,
  detectCriticalCategory: detectCriticalCategory,
  parseRounds: parseRounds,
  parseOpenQuestions: parseOpenQuestions,
  parseVerdict: parseVerdict,
  AUTO_FALLBACK_PATTERNS: AUTO_FALLBACK_PATTERNS,
  CRITICAL_PATTERNS: CRITICAL_PATTERNS,
  MAX_SUMMARY_LEN: MAX_SUMMARY_LEN,
};
