'use strict';

const fs = require('fs');
const path = require('path');
const { planAwareMarkdownHash, gitRepoRoot, subjectHash } = require('./hash');
const { validate: validateSchema } = require('./schema');
const { readReceipt } = require('./store');
const { getCommandSpec, normalizeCommand } = require('./aliases');
const { validateReason } = require('./lib/force-override-reason');

// v1.3.0-m2 Task 5 (F3 absorption) — terminal PR commands trigger the
// design-critique chain-check. Codex review is invoked at plan + implement,
// so the PR step is enforcement-only (BLOCK when any prior receipt carries
// design_critique_verdict='divergent'). MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN
// is the only audited escape — reason validator (strict mirror of M1
// impeccable_force_override rules) gates the advisory mode entry.
const PR_TERMINAL_COMMANDS = new Set(['mccp:pr', 'mccp:prp-pr']);

// v0.2.4 Task 8 — gate IDs where security-reviewer skip is BLOCKING. Other
// gates (notably code-reviewer) treat security_skipped as informational because
// they are read-only and cannot themselves introduce new security risk.
const STRICT_SECURITY_GATES = ['mccp-implement-codex', 'mccp-pr-codex'];

// v0.2.6 Milestone 1 Task 1.3 — impeccable_skipped parallel to security.
// Codex R1 F1 absorption: no separate STRICT_DESIGN_GATES constant; reuse the
// same strict list because the gate strictness comes from the WRITE-action
// semantic (implement / pr), not the namespace.
const STRICT_IMPECCABLE_GATES = ['mccp-implement-codex', 'mccp-pr-codex'];

// v0.2.8 Task 2.6.5 — Generic decision_id slugs come from the branch
// fallback in derive-decision (e.g. /mccp:pr on `main` derives
// decision_id="main"). Before v0.2.8, an unrelated stale receipt at
// mccp-plan-codex/main.json would re-validate any plan. The quarantine
// migration moves those to .legacy.json; this list lets us block bare
// (no --plan) generic-slug invocations as well.
const GENERIC_DECISION_IDS = ['default', 'main'];

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

  // v0.2.8 Task 2.6.5 — boot-time auto-trigger for the generic-receipt
  // quarantine migration (Codex R1-F3 + IMPL-R1-F1/F2 + IMPL-R2-F1
  // absorption). Idempotent: subsequent invocations see the completion
  // marker and noop. Lock-loser path hands back an in-progress signal so
  // the caller aborts instead of reading pre-migration state. Trigger
  // failures degrade to a visible warning rather than a brick — silent
  // fail-open is the wrong default but loud-fail-open is the right one
  // here so a buggy migration cannot disable the validator entirely.
  if (!opts.skipMigration) {
    let migrationModule;
    try {
      migrationModule = require('../migrations/v0.2.8-generic-receipt-quarantine');
    } catch (err) {
      migrationModule = null;
      result.warnings.push({
        gate_id: '_meta',
        decision_id: result.decisionId,
        reason: 'v0.2.8 quarantine migration module load failed: ' + err.message,
      });
    }
    if (migrationModule) {
      try {
        const mres = migrationModule.migrate(repoRoot, {
          systemMessage: opts.systemMessage || function () {},
        });
        if (mres.status === 'in-progress-aborted') {
          // v0.2.8 Task 2.6.5a A3 (R1 F3 + R2 F2 absorption) — canonical
          // tempfail signaling. The top-level `tempfail`/`exitCode` fields
          // are the single source of truth; the `blocking[]` entry is
          // preserved for backward JSON compatibility and carries
          // `kind: "tempfail"` so consumers using the classify helper
          // disambiguate from hard blocks.
          result.ok = false;
          result.tempfail = true;
          result.exitCode = migrationModule.EX_TEMPFAIL;
          result.reason = 'v0.2.8 generic-receipt quarantine migration in progress — retry shortly';
          result.blocking.push({
            gate_id: '_meta',
            decision_id: result.decisionId,
            reason: result.reason,
            kind: 'tempfail',
            tempfail_exit: migrationModule.EX_TEMPFAIL,
          });
          return result;
        }
        if (mres.status === 'failed') {
          result.warnings.push({
            gate_id: '_meta',
            decision_id: result.decisionId,
            reason: 'v0.2.8 quarantine migration reported failures; see ' +
              '.claude/receipts/.migrations/v0.2.8-generic-quarantine.json',
          });
        }
      } catch (err) {
        result.warnings.push({
          gate_id: '_meta',
          decision_id: result.decisionId,
          reason: 'v0.2.8 quarantine migration trigger threw: ' + err.message,
        });
      }
    }
  }

  // v1.2.0-m1 Task 12 (Codex F4 absorption) — boot-time stale heartbeat
  // reclaim. Fires before the per-gate scan so any envelopes whose controller
  // died are flipped to worker_exit_status='crashed' first; downstream
  // envelope-mismatch checks then see the canonical crashed envelope rather
  // than a confusing pending-forever placeholder.
  //
  // Fail-open: any error here is logged + skipped. The reclaim is opportunistic
  // cleanup, not a correctness boundary.
  if (!opts.skipReclaim) {
    let controllerModule;
    try {
      controllerModule = require('../lib/dispatch-controller');
    } catch (_) { controllerModule = null; }
    if (controllerModule) {
      const dispatchDir = path.join(repoRoot, '.claude', 'state', 'dispatches');
      try {
        const reclaim = controllerModule.reclaimStale({ envelopeDir: dispatchDir });
        if (reclaim.reclaimed.length > 0) {
          result.warnings.push({
            gate_id: '_meta',
            decision_id: result.decisionId,
            reason: 'dispatch-controller reclaimed ' + reclaim.reclaimed.length +
              ' stale heartbeat(s); see envelope status=crashed',
            reclaimed: reclaim.reclaimed.map(function (r) {
              return { envelopePath: r.envelopePath, reason: r.reason };
            }),
          });
        }
      } catch (err) {
        result.warnings.push({
          gate_id: '_meta',
          decision_id: result.decisionId,
          reason: 'reclaimStale threw (skipped): ' + err.message,
        });
      }
    }
  }

  const requires = spec.requires_preceding || [];

  // v1.3.0-m2 Task 5 (F3 absorption) — chain-check audited escape preflight.
  // Only meaningful when the current command is a terminal PR step. When the
  // env var is set with a substantive reason, the chain-check downgrades
  // blocking → warning for that one invocation. Bad reason = audited escape
  // refused + visible warning + chain-check stays strict.
  const isPrTerminal = PR_TERMINAL_COMMANDS.has(normalizeCommand(command));
  const chainSkipReasonRaw = process.env.MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN;
  let chainSkipActive = false;
  if (isPrTerminal && typeof chainSkipReasonRaw === 'string' && chainSkipReasonRaw.length > 0) {
    const rv = validateReason(chainSkipReasonRaw, { strict: true });
    if (rv.ok) {
      chainSkipActive = true;
    } else {
      result.warnings.push({
        gate_id: '_meta',
        decision_id: result.decisionId,
        reason: 'MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN reason rejected (' + rv.reason +
          '): chain-check stays strict; provide substantive reason ≥30 chars + ≥3 words ' +
          'or remove the env var',
      });
    }
  }

  // v0.2.8 Task 2.6.5 R1-F1 + R3 absorption — bare generic-slug rejection.
  // When a downstream command (one with required preceding gates) lands on
  // a generic decision_id WITHOUT an explicit --plan, the only thing a
  // matching receipt could prove is "some receipt at this slug exists",
  // which used to be a false-green path. Block early with a runbook
  // pointer so callers know to use a feature branch or pass --plan.
  if (requires.length > 0
      && GENERIC_DECISION_IDS.indexOf(result.decisionId) !== -1
      && !opts.planPath) {
    result.ok = false;
    result.blocking.push({
      gate_id: '_meta',
      decision_id: result.decisionId,
      reason: 'generic decision_id "' + result.decisionId +
        '" requires an explicit --plan or a feature branch; bare branch ' +
        'fallback is closed by v0.2.8. See CLAUDE.md §4 quarantine runbook.',
    });
    return result;
  }

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

    // v0.2.6 Milestone 1 Task 1.3 — impeccable_skipped enforcement.
    // Mirrors security_skipped policy: strict for implement/pr (write actions),
    // informational for read-only gates. Codex R1 F1 absorption: enforcement
    // sits on the same primary codex receipt meta, not on a separate
    // design_* namespace.
    if (receipt.meta && receipt.meta.impeccable_skipped === true && !receipt.meta.skipped) {
      const reason = 'preceding gate has meta.impeccable_skipped=true ' +
        '(impeccable design-review auto-fallback — non-approving)' +
        (receipt.meta.impeccable_skip_reason ? '; skip_reason: ' + receipt.meta.impeccable_skip_reason : '');
      if (STRICT_IMPECCABLE_GATES.indexOf(gateId) !== -1) {
        result.blocking.push({
          gate_id: gateId,
          decision_id: result.decisionId,
          reason: reason,
          impeccable_skip_reason: receipt.meta.impeccable_skip_reason || null,
        });
      } else {
        result.warnings.push({
          gate_id: gateId,
          decision_id: result.decisionId,
          reason: reason + ' (informational for non-strict gate)',
          impeccable_skip_reason: receipt.meta.impeccable_skip_reason || null,
        });
      }
    }

    // v0.2.6 Milestone 1 Task 1.6 — impeccable_force_override warning.
    // Reason validation has already happened at schema time (REJECT on bad
    // reason). By the time we see force_override=true here, the reason is
    // substantive. Surface as audit warning, not blocking.
    if (receipt.meta && receipt.meta.impeccable_force_override === true) {
      result.warnings.push({
        gate_id: gateId,
        decision_id: result.decisionId,
        reason: 'preceding gate exercised MCCP_FORCE_PR_WITHOUT_IMPECCABLE ' +
          '(audited escape — PR body is canonical audit source)',
        impeccable_force_override_reason: receipt.meta.impeccable_force_override_reason || null,
      });
    }

    // v1.3.0 design-gate enforcement M1 — impeccable_silent_skip surface.
    //
    // M1 is observational only: the wedge records that the detector returned
    // skill_available=true + design_signal=false so M2 (SKILL first-step +
    // critique loop) has a receipt artifact to act on. We deliberately do NOT
    // block on silent_skip at M1 — silentSkip fires on every plan whose diff
    // carries no design signal, including pure-backend changes, so blocking
    // here would freeze every non-UI cycle. Codex R1 F2 absorption (strict-gate
    // blocking on silent_skip) is deferred to M2 once the detector gains a
    // "design-suspect" discriminator OR the SKILL first-step path eliminates
    // the false-negative window. Until then both strict and lenient gates
    // emit warnings only.
    if (receipt.meta && receipt.meta.impeccable_silent_skip === true
        && !receipt.meta.skipped) {
      const reason = 'preceding gate has meta.impeccable_silent_skip=true ' +
        '(impeccable Skill available but detector returned design_signal=false — ' +
        'observational at M1; M2 will promote to blocking once SKILL first-step + ' +
        'critique loop are wired)' +
        (receipt.meta.impeccable_silent_skip_reason
          ? '; silent_skip_reason: ' + receipt.meta.impeccable_silent_skip_reason
          : '');
      result.warnings.push({
        gate_id: gateId,
        decision_id: result.decisionId,
        reason: reason,
        impeccable_silent_skip_reason: receipt.meta.impeccable_silent_skip_reason || null,
      });
    }

    // v1.3.0-m2 Task 5 — design-critique verdict surfacing + chain-check.
    //
    // Lenient path (plan/implement gates):
    //   design_critique_verdict='divergent' → warnings push. The retry loop in
    //   plan.md / prp-implement.md is responsible for resolving divergence
    //   inside its own scope; surfacing as warning keeps the gate observable
    //   without blocking the chain in case the divergence is intentional.
    //
    // Strict chain-check (terminal PR commands):
    //   When the current command is /mccp:pr or /mccp:prp-pr, divergent verdict
    //   in ANY prior receipt (plan + implement) escalates to blocking. Audited
    //   escape MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN downgrades back to warning
    //   for that one invocation when the reason validator passes (strict rules).
    if (receipt.meta && receipt.meta.design_critique_verdict === 'divergent'
        && !receipt.meta.skipped) {
      const verdictMsg = 'preceding gate has meta.design_critique_verdict="divergent" ' +
        '(impeccable critique retry loop did not converge within ' +
        'MCCP_DESIGN_CRITIQUE_MAX_RETRY cap; rounds=' +
        (receipt.meta.design_critique_rounds == null ? 'n/a'
          : receipt.meta.design_critique_rounds) + ')';
      if (isPrTerminal && !chainSkipActive) {
        result.blocking.push({
          gate_id: gateId,
          decision_id: result.decisionId,
          reason: verdictMsg + ' — chain-check BLOCKED on PR step. ' +
            'Resolve in plan/implement, or set MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN ' +
            'with a substantive reason for audited advisory mode.',
          kind: 'design_critique_chain_divergent',
          prior_gate: gateId,
          prior_verdict: 'divergent',
          design_critique_rounds: receipt.meta.design_critique_rounds || null,
        });
      } else {
        result.warnings.push({
          gate_id: gateId,
          decision_id: result.decisionId,
          reason: verdictMsg + (isPrTerminal && chainSkipActive
            ? ' (advisory — MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN active with audited reason)'
            : ' (lenient surface — retry loop owns convergence in this gate scope)'),
          kind: 'design_critique_divergent',
          prior_verdict: 'divergent',
          design_critique_rounds: receipt.meta.design_critique_rounds || null,
        });
      }
    }

    // v1.2.0-m1 Task 6 (Codex F3 absorption) — envelope integrity check.
    // When the receipt carries meta.ipc_envelope_path (controller-spawned
    // worker context), the validator loads the envelope and confirms:
    //   1. envelope.dispatch_id === receipt.meta.worker_dispatch_id
    //   2. envelope.receipts_added contains '<gate_id>/<decision_id>'
    // Mismatch/missing surfaces as blocking[].kind="envelope-mismatch" so
    // downstream callers can distinguish IPC drift from ordinary stale state.
    if (receipt.meta && receipt.meta.ipc_envelope_path) {
      const envRelPath = receipt.meta.ipc_envelope_path;
      const envAbs = path.resolve(repoRoot, envRelPath);
      let envelopeModule;
      try {
        envelopeModule = require('../lib/dispatch-envelope');
      } catch (err) {
        result.blocking.push({
          gate_id: gateId,
          decision_id: result.decisionId,
          reason: 'cannot load dispatch-envelope module: ' + err.message,
          kind: 'envelope-mismatch',
        });
        continue;
      }
      const envResult = envelopeModule.read(envAbs);
      if (!envResult.ok) {
        result.blocking.push({
          gate_id: gateId,
          decision_id: result.decisionId,
          reason: 'envelope load failed at ' + envRelPath + ': ' + envResult.error,
          kind: 'envelope-mismatch',
        });
        continue;
      }
      const env = envResult.envelope;
      if (env.dispatch_id !== receipt.meta.worker_dispatch_id) {
        result.blocking.push({
          gate_id: gateId,
          decision_id: result.decisionId,
          reason: 'envelope dispatch_id "' + env.dispatch_id +
            '" does not match receipt.meta.worker_dispatch_id "' +
            receipt.meta.worker_dispatch_id + '"',
          kind: 'envelope-mismatch',
        });
        continue;
      }
      const ownSlug = gateId + '/' + result.decisionId;
      if (!Array.isArray(env.receipts_added)
          || env.receipts_added.indexOf(ownSlug) === -1) {
        result.blocking.push({
          gate_id: gateId,
          decision_id: result.decisionId,
          reason: 'envelope.receipts_added missing self slug "' + ownSlug +
            '" (envelope.receipts_added=' + JSON.stringify(env.receipts_added) + ')',
          kind: 'envelope-mismatch',
        });
        continue;
      }
    }
  }

  result.ok = result.missing.length === 0
    && result.stale.length === 0
    && result.blocking.length === 0
    && result.open_critical.length === 0;
  return result;
}

module.exports = { validateCommand: validateCommand };
