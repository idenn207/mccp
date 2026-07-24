'use strict';

// v1.3.0-m2 briefing LLM call via codex-invoke (degenerate adversarial-review).
//
// Single export invokeBriefing(receipt, deriveModel, opts).
//
// Returns the contract:
//   { ok, summary, tokenCount, estimated, classification, error? }
//
// Mapped from codex-invoke.invokeAdversarialReview's classification enum:
//   - 'ok' + non-empty stdout     → { ok:true,  summary, tokenCount, estimated, 'ok' }
//   - 'disabled' (env-disabled)   → { ok:true,  null, 0, false, 'disabled' }   ← graceful
//   - any other classification    → { ok:false, null, 0, false, <class>, error }

const path = require('path');
const codexInvoke = require('../codex-invoke');
const { isConvergedVerdict } = require('../receipt-convergence');

const BRIEFING_TIMEOUT_MS = 60 * 1000;  // 60s — much tighter than codex 900s default.
const SUMMARY_CAP_CHARS = 1024;          // matches schema.js validate cap.

function buildFocus(receipt, deriveModel) {
  const r = receipt || {};
  const res = r.resolution || {};
  const lines = [];
  lines.push('Briefing for receipt ' + (r.gate_id || '?') + '/' + (r.decision_id || '?') + ':');
  lines.push('- phase: ' + (r.phase || 'unknown'));
  // M2 Task 4 (integrity-unification) — use the codex_verdict-first shared helper,
  // NOT raw `!!res.converged`. resolution.converged is ALWAYS true once findings
  // are finalized (writer-finalized, not Codex-approved), so a divergent/critical
  // ship would otherwise be summarized as "converged: true". Closes the M1 Task 1b
  // sweep residual (the last raw resolution.converged consumer).
  lines.push('- converged: ' + isConvergedVerdict(res) + ', rounds: ' + (res.rounds || r.round || 1)
    + ', open_questions: ' + ((res.open_questions || []).length));
  lines.push('- findings: ' + ((r.findings || []).length));

  // Derive correlations are masked-by-default; M2 inherits M1's mask discipline
  // by trusting the deriveModel surface we were handed. When deriveModel is
  // null (steady-state — we don't run derive synchronously), skip the line.
  if (deriveModel && Array.isArray(deriveModel.correlations) && r.decision_id) {
    const related = deriveModel.correlations.filter(function (c) {
      return c && (c.decision_id === r.decision_id);
    }).slice(0, 3);
    if (related.length > 0) {
      lines.push('- correlations: ' + related.length + ' (masked)');
    }
  }

  lines.push('');
  lines.push('Task: write a single 1-line PM-readable verdict (<=80 chars), neutral tone,');
  lines.push('no marketing copy, no em dashes. Verb+object cadence ("M2 ready for PR review",');
  lines.push('"blocked on Codex tempfail", "next: ship after schema bump").');
  lines.push('Output ONLY the verdict line, no preamble.');
  return lines.join('\n');
}

function parseSummary(stdout) {
  if (typeof stdout !== 'string') return '';
  // Wrapper emits a JSON envelope to stdout; the companion stdout we want
  // is the nested `stdout` field of that JSON. But invokeBriefing receives
  // the parsed wrapper result directly, so this helper operates on the
  // companion-stdout string passed by the caller.
  const trimmed = stdout.replace(/^\s+/, '').replace(/\s+$/, '');
  if (!trimmed) return '';
  const firstLine = trimmed.split(/\r?\n/)[0] || '';
  const collapsed = firstLine.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= SUMMARY_CAP_CHARS) return collapsed;
  return collapsed.slice(0, SUMMARY_CAP_CHARS);
}

function tokenEstimate(focus, stdout) {
  // Codex R1 F2 absorption — count input + output (focus dominates input on
  // briefing's short-output workload). Math.ceil so any non-zero string
  // contributes ≥1 token.
  const f = typeof focus === 'string' ? focus : '';
  const s = typeof stdout === 'string' ? stdout : '';
  return Math.ceil((f.length + s.length) / 4);
}

function invokeBriefing(receipt, deriveModel, opts) {
  opts = opts || {};
  const focus = buildFocus(receipt, deriveModel);
  const env = opts.env || process.env;
  const invoker = opts.invoker || codexInvoke.invokeAdversarialReview;

  let result;
  try {
    result = invoker(focus, {
      env: env,
      timeoutMs: BRIEFING_TIMEOUT_MS,
      json: true,
      impeccableAvailable: false,
    });
  } catch (err) {
    return {
      ok: false,
      summary: null,
      tokenCount: 0,
      estimated: false,
      classification: 'parse-error',
      error: 'invoker threw: ' + (err && err.message ? err.message : String(err)),
    };
  }

  if (!result || typeof result !== 'object') {
    return {
      ok: false,
      summary: null,
      tokenCount: 0,
      estimated: false,
      classification: 'parse-error',
      error: 'invoker returned non-object',
    };
  }

  const classification = result.classification || 'parse-error';

  if (classification === 'disabled') {
    // Graceful no-op — env-level disable. Caller stamps invocation_count=1
    // (we did attempt) but summary stays null + tokenCount=0.
    return {
      ok: true,
      summary: null,
      tokenCount: 0,
      estimated: false,
      classification: 'disabled',
    };
  }

  if (classification !== 'ok') {
    return {
      ok: false,
      summary: null,
      tokenCount: 0,
      estimated: false,
      classification: classification,
      error: result.stderr || 'classification=' + classification,
    };
  }

  const summary = parseSummary(result.stdout);
  if (!summary) {
    return {
      ok: false,
      summary: null,
      tokenCount: 0,
      estimated: false,
      classification: 'stdout-empty',
      error: 'companion stdout produced no parseable summary line',
    };
  }

  // Codex R1 F2 — prefer real tokenUsage when present, else estimate.
  let tokenCount;
  let estimated;
  if (result.tokenUsage && Number.isFinite(result.tokenUsage.total)) {
    tokenCount = Math.max(0, Math.trunc(result.tokenUsage.total));
    estimated = false;
  } else {
    tokenCount = tokenEstimate(focus, result.stdout);
    estimated = true;
  }

  return {
    ok: true,
    summary: summary,
    tokenCount: tokenCount,
    estimated: estimated,
    classification: 'ok',
  };
}

module.exports = {
  invokeBriefing: invokeBriefing,
  // Exported for unit tests + future audit consumers.
  buildFocus: buildFocus,
  parseSummary: parseSummary,
  tokenEstimate: tokenEstimate,
  BRIEFING_TIMEOUT_MS: BRIEFING_TIMEOUT_MS,
  SUMMARY_CAP_CHARS: SUMMARY_CAP_CHARS,
};
