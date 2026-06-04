'use strict';

const fs = require('fs');
const path = require('path');
const { planAwareMarkdownHash, gitRepoRoot, subjectHash } = require('./hash');
const { validate: validateSchema } = require('./schema');
const { readReceipt } = require('./store');
const { getCommandSpec, normalizeCommand } = require('./aliases');

// v0.2.4 Task 8 — gate IDs where security-reviewer skip is BLOCKING. Other
// gates (notably code-reviewer) treat security_skipped as informational because
// they are read-only and cannot themselves introduce new security risk.
const STRICT_SECURITY_GATES = ['mccp-implement-codex', 'mccp-pr-codex'];

// Validate the receipt situation for a given /mccp:* command invocation.
// Returns: { ok, command, decisionId, missing, stale, blocking, warnings, open_critical, reason? }
function validateCommand(command, opts) {
  opts = opts || {};
  const cwd = opts.cwd || process.cwd();
  const result = {
    ok: true,
    command: normalizeCommand(command),
    decisionId: opts.decisionId || 'default',
    missing: [],
    stale: [],
    blocking: [],
    warnings: [],
    open_critical: [],
  };

  const spec = getCommandSpec(command);
  if (!spec) {
    result.reason = 'no alias matrix entry for command "' + command + '" — out-of-scope';
    return result;
  }

  let repoRoot;
  try {
    repoRoot = gitRepoRoot(cwd);
  } catch (err) {
    result.ok = false;
    result.reason = 'not a git repository: ' + err.message;
    result.blocking.push({
      gate_id: '_meta',
      decision_id: result.decisionId,
      reason: 'preflight requires a git repository',
    });
    return result;
  }

  const requires = spec.requires_preceding || [];
  for (let i = 0; i < requires.length; i++) {
    const gateId = requires[i];
    let receipt;
    try {
      receipt = readReceipt(repoRoot, gateId, result.decisionId);
    } catch (err) {
      result.blocking.push({
        gate_id: gateId,
        decision_id: result.decisionId,
        reason: 'cannot read receipt: ' + err.message,
      });
      continue;
    }
    if (!receipt) {
      result.missing.push({
        gate_id: gateId,
        decision_id: result.decisionId,
        reason: 'no receipt written',
      });
      continue;
    }

    const schemaResult = validateSchema(receipt);
    if (!schemaResult.ok) {
      result.blocking.push({
        gate_id: gateId,
        decision_id: result.decisionId,
        reason: 'schema invalid: ' + schemaResult.errors.join('; '),
      });
      continue;
    }

    const computedSubject = subjectHash(receipt);
    if (computedSubject !== receipt.subject_hash) {
      result.stale.push({
        gate_id: gateId,
        decision_id: result.decisionId,
        reason: 'subject_hash mismatch (receipt fields altered after signing)',
      });
      continue;
    }

    if (opts.planPath) {
      try {
        const currentHash = planAwareMarkdownHash(path.resolve(cwd, opts.planPath));
        if (currentHash !== receipt.plan_hash) {
          result.stale.push({
            gate_id: gateId,
            decision_id: result.decisionId,
            reason: 'plan file hash differs from receipt (plan changed since gate)',
            receipt_plan_hash: receipt.plan_hash,
            current_plan_hash: currentHash,
          });
          continue;
        }
      } catch (err) {
        result.stale.push({
          gate_id: gateId,
          decision_id: result.decisionId,
          reason: 'cannot read plan to re-hash: ' + err.message,
        });
        continue;
      }
    }

    const resolution = receipt.resolution || {};
    const oq = resolution.open_questions || [];
    for (let j = 0; j < oq.length; j++) {
      const q = oq[j];
      if (q && q.severity === 'CRITICAL') {
        result.open_critical.push({
          gate_id: gateId,
          item: q.item || q.description || '(unspecified)',
        });
      }
    }

    if (receipt.meta && receipt.meta.skipped) {
      result.blocking.push({
        gate_id: gateId,
        decision_id: result.decisionId,
        reason: 'preceding gate was skipped (meta.skipped=true, reason: ' + (receipt.meta.skip_reason || 'n/a') + ')',
      });
    }

    // v0.2.2 Task 4 — codex_skipped + advisory receipts are non-approving.
    // Plan R1#2: hollow-gate weakness fix. A receipt where Codex review was
    // bypassed (auto-fallback, advisory mode, soft-mode placeholder) must not
    // satisfy downstream gates as if Codex had approved.
    if (receipt.meta && receipt.meta.codex_skipped === true && !receipt.meta.skipped) {
      result.blocking.push({
        gate_id: gateId,
        decision_id: result.decisionId,
        reason: 'preceding gate has meta.codex_skipped=true (non-approving — Codex did not converge)',
      });
    }
    if (receipt.meta && receipt.meta.advisory === true) {
      result.blocking.push({
        gate_id: gateId,
        decision_id: result.decisionId,
        reason: 'preceding gate ran in advisory mode (meta.advisory=true — non-approving)',
      });
    }

    // v0.2.4 Task 8 — security_skipped enforcement (R2 finding #1).
    // Mirrors codex_skipped policy but with gate-specific strictness: strict
    // for implement/pr (write actions on security-sensitive areas), informational
    // for code-review and other read-only gates.
    if (receipt.meta && receipt.meta.security_skipped === true && !receipt.meta.skipped) {
      const reason = 'preceding gate has meta.security_skipped=true ' +
        '(security-reviewer auto-fallback — non-approving)' +
        (receipt.meta.security_skip_reason ? '; skip_reason: ' + receipt.meta.security_skip_reason : '');
      if (STRICT_SECURITY_GATES.indexOf(gateId) !== -1) {
        result.blocking.push({
          gate_id: gateId,
          decision_id: result.decisionId,
          reason: reason,
          skip_reason: receipt.meta.security_skip_reason || null,
        });
      } else {
        result.warnings.push({
          gate_id: gateId,
          decision_id: result.decisionId,
          reason: reason + ' (informational for non-strict gate)',
          skip_reason: receipt.meta.security_skip_reason || null,
        });
      }
    }

    // v0.2.4 Task 10 — security_force_override warning (R2 finding #3).
    // Audited escape hatch via MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER. The
    // receipt is non-approving (warning, not blocking) — PR creation proceeds
    // but the audit trail surfaces to the validator so any downstream gate or
    // reviewer can see the override was exercised.
    if (receipt.meta && receipt.meta.security_force_override === true) {
      result.warnings.push({
        gate_id: gateId,
        decision_id: result.decisionId,
        reason: 'preceding gate exercised MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER ' +
          '(audited escape — PR body is canonical audit source)',
        force_override_reason: receipt.meta.security_force_override_reason || null,
      });
    }
  }

  result.ok = result.missing.length === 0
    && result.stale.length === 0
    && result.blocking.length === 0
    && result.open_critical.length === 0;
  return result;
}

module.exports = { validateCommand: validateCommand };
