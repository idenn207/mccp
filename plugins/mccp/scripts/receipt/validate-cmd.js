'use strict';

const fs = require('fs');
const path = require('path');
const { planAwareMarkdownHash, gitRepoRoot, subjectHash } = require('./hash');
const { validate: validateSchema } = require('./schema');
const { readReceipt } = require('./store');
const { getCommandSpec, normalizeCommand } = require('./aliases');

// Validate the receipt situation for a given /mccp:* command invocation.
// Returns: { ok, command, decisionId, missing, stale, blocking, open_critical, reason? }
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
  }

  result.ok = result.missing.length === 0
    && result.stale.length === 0
    && result.blocking.length === 0
    && result.open_critical.length === 0;
  return result;
}

module.exports = { validateCommand: validateCommand };
