'use strict';

const path = require('path');
const { listReceipts, readReceipt } = require('../../receipt/store');

function pick(m, k) {
  return (m && Object.prototype.hasOwnProperty.call(m, k)) ? m[k] : undefined;
}

function extract(repoRoot, entry) {
  let receipt;
  try {
    receipt = readReceipt(repoRoot, entry.gate_id, entry.decision_id);
  } catch (err) {
    return {
      ok: false,
      gate: entry.gate_id,
      decision_id: entry.decision_id,
      path: path.relative(repoRoot, entry.path),
      error: err.message,
    };
  }
  if (!receipt) {
    return {
      ok: false,
      gate: entry.gate_id,
      decision_id: entry.decision_id,
      path: path.relative(repoRoot, entry.path),
      error: 'receipt missing at expected path',
    };
  }

  const resolution = receipt.resolution || {};
  const meta = receipt.meta || {};

  return {
    ok: true,
    gate: entry.gate_id,
    decision_id: entry.decision_id,
    round: receipt.round,
    converged: !!resolution.converged,
    open_questions_count: (resolution.open_questions || []).length,
    advisory: !!meta.advisory,
    skipped: !!meta.skipped,
    skip_reason: meta.skip_reason,
    codex_skipped: !!meta.codex_skipped,
    security_skipped: !!meta.security_skipped,
    security_skip_reason: meta.security_skip_reason,
    security_force_override: !!meta.security_force_override,
    security_force_override_reason: meta.security_force_override_reason,
    impeccable_skipped: !!meta.impeccable_skipped,
    impeccable_skip_reason: meta.impeccable_skip_reason,
    impeccable_force_override: !!meta.impeccable_force_override,
    impeccable_force_override_reason: meta.impeccable_force_override_reason,
    codex_dedupe_at_pr: pick(meta, 'codex_dedupe_at_pr'),
    codex_skipped_at_pr: pick(meta, 'codex_skipped_at_pr'),
    codex_disabled_at_pr: pick(meta, 'codex_disabled_at_pr'),
    codex_skip_reason: pick(meta, 'codex_skip_reason'),
    codex_review_actionable_findings: pick(meta, 'codex_review_actionable_findings'),
    codex_disabled: pick(meta, 'codex_disabled'),
    codex_design_scope_excluded: pick(meta, 'codex_design_scope_excluded'),
    design_findings_dropped: pick(meta, 'design_findings_dropped'),
    a11y_routed_to_impeccable: pick(meta, 'a11y_routed_to_impeccable'),
    dropped_findings_digest: pick(meta, 'dropped_findings_digest'),
    deferred_findings_count: pick(meta, 'deferred_findings_count'),
    plan_conflict_escalated: pick(meta, 'plan_conflict_escalated'),
    pr_phase_lock_stale_reclaimed_at_hook: pick(meta, 'pr_phase_lock_stale_reclaimed_at_hook'),
    controller_context_marker_present: pick(meta, 'controller_context_marker_present'),
    dispatched_by_controller_session_id: pick(meta, 'dispatched_by_controller_session_id'),
    worker_dispatch_id: pick(meta, 'worker_dispatch_id'),
    ipc_envelope_path: pick(meta, 'ipc_envelope_path'),
    // v1.3.0-m2 — LLM briefing stamp + token telemetry surface. M3 audit-
    // timeline renderer consumes these read-only. v0.2.x-era receipts lack
    // the keys → pick() returns undefined, preserving M1's absence semantics.
    briefing_summary: pick(meta, 'briefing_summary'),
    briefing_token_count: pick(meta, 'briefing_token_count'),
    briefing_invocation_count: pick(meta, 'briefing_invocation_count'),
    created_at: meta.created_at,
    command: meta.command,
    // v1.4.x patch — meta.cwd surface paired with derive/mask.js receipts cwd
    // key. v0.2.x-era receipts lack the key → pick() returns undefined.
    cwd: pick(meta, 'cwd'),
    base_sha: receipt.base_sha,
    head_sha: receipt.head_sha,
    plan_hash: receipt.plan_hash,
    // v1.3.0-m5 — receipt_hash surfaces the JCS canonical digest receipt-write
    // stamps on every receipt. M5 snapshot de-dup identity uses
    // `gate_id + decision_id + receipt_hash` so a re-issued receipt (briefing
    // restamp, dedupe attribution) is treated as a distinct event rather than
    // collapsed against the prior write.
    receipt_hash: receipt.receipt_hash || null,
    path: path.relative(repoRoot, entry.path),
  };
}

function scanReceipts(repoRoot) {
  let entries;
  try {
    entries = listReceipts(repoRoot);
  } catch (err) {
    return {
      ok: false,
      count: 0,
      items: [],
      invalid_count: 0,
      degraded: false,
      error: err.message,
    };
  }
  const items = entries.map(e => extract(repoRoot, e));
  const invalidCount = items.filter(i => i && i.ok === false).length;
  return {
    ok: true,
    count: items.length,
    items,
    invalid_count: invalidCount,
    degraded: invalidCount > 0,
    error: null,
  };
}

module.exports = {
  scanReceipts,
  _pick: pick,
};
