'use strict';

const fs = require('fs');
const path = require('path');
const { planAwareMarkdownHash, gitRepoRoot, subjectHash, receiptHash, gitRefs } = require('./hash');
const { validate: validateSchema } = require('./schema');
const { readReceipt } = require('./store');
const { getCommandSpec, normalizeCommand } = require('./aliases');
const { validateReason } = require('./lib/force-override-reason');
const { classifyIntentMeta, isIntentChainAllowed } = require('../lib/intent-context');

// codex-intent-context M1 — gates the intent oracle governs. Mirrors
// write.js#INTENT_IN_SCOPE_GATES; mccp-implement-codex is excluded by UI4.
const INTENT_IN_SCOPE_GATES = ['mccp-plan-codex'];

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
// Per-verdict recovery text. M1 emitted ONE sentence ("every Codex finding must
// carry an explicit adjudication") for every blocking intent verdict, which
// actively misdiagnoses the M1.5 verdicts: an operator told to go add
// adjudications when the real problem is that the REVIEWER ignored the contract
// will edit the wrong file and still be blocked.
//
// The shared tail is deliberate: the integrity warning ("do not hand-write this
// receipt") applies to every one of these, because the intent decision has no
// CLI surface in any of them.
function intentVerdictRecovery(meta) {
  const verdict = meta && meta.intent_gate_verdict;
  const tail = ' INTEGRITY: do NOT hand-write this receipt (the intent decision has ' +
    'no CLI surface). Re-run `/mccp:plan <plan-path>`, or set ' +
    'MCCP_SKIP_INTENT_GATE="<substantive reason>" for an audited override.';

  let head;
  switch (verdict) {
    case 'skipped':
    case 'skipped-unproven':
      head = 'the receipt claims the gate did not apply but carries no corroborated ' +
        'meta.intent_skip_proof — an unproven skip is not a pass.';
      break;
    case 'conflict_unresolved':
      head = 'a finding that conflicts with stated user intent was accepted ' +
        '(ACCEPT_NOW) without an intent_override_reason. Write the override reason, ' +
        'or change that adjudication\'s verdict.';
      break;
    case 'inconclusive':
      head = 'the REVIEWER did not follow the per-finding `INTENT:` contract, so the ' +
        'author\'s labels could not be checked against anything (see ' +
        'meta.intent_reviewer_contract / meta.intent_claim_counts). This is not fixed ' +
        'by editing adjudications — re-run the review so the reviewer emits one ' +
        '`INTENT:` line per finding, or set MCCP_INTENT_MISLABEL=warn to record the ' +
        'gap instead of blocking on it.';
      break;
    case 'mislabel_unresolved':
      head = 'the reviewer named a user-intent id the author did not (see ' +
        'meta.intent_mislabel_audit). Resolve each entry by correcting ' +
        'intent_conflict to the id the reviewer named, or by writing a substantive ' +
        'intent_dispute_reason saying why the reviewer is wrong. ' +
        'MCCP_INTENT_MISLABEL=warn records it instead of blocking.';
      break;
    default:
      // `incomplete` is not one cause. decideIntentGate emits it for a missing
      // adjudication, but also for a stale/foreign `review_payload_digest`, an
      // adjudication count that does not match the findings, and an out-of-range
      // or duplicate `finding_index` — and the receipt does not record which.
      // Asserting the first one sends an operator whose real problem is a stale
      // file off to add rows that already exist. Naming the range costs a line
      // and the single re-run fixes all of them, because it regenerates the
      // review and the adjudication together.
      head = 'the gate could not certify that every finding was adjudicated. That is ' +
        'usually a missing adjudication row, but it also covers an adjudication file ' +
        'written against a different review (stale review_payload_digest), a count ' +
        'that does not match the findings, and a duplicate or out-of-range ' +
        'finding_index. Re-running the plan gate regenerates both sides together, ' +
        'which resolves all of them.';
      break;
  }
  // M2 — a run that fell back to the author adjudicated with the very context the
  // separation exists to withhold, and every verdict above reads differently in
  // that light: `incomplete` after a fallback usually means the author's hand
  // written entries are short, not that the reviewer misbehaved. This is an extra
  // SENTENCE, not an extra verdict — inventing `degraded_*` variants of five
  // verdicts would double the enum to say one thing that is true of all of them.
  const degradedNote = (meta && meta.intent_arbiter === 'author'
    && typeof meta.intent_arbiter_degraded_reason === 'string'
    && meta.intent_arbiter_degraded_reason.length > 0)
    ? ' NOTE: this run degraded to author adjudication (' +
      meta.intent_arbiter_degraded_reason + '), so the judgement above was made ' +
      'with the author\'s own context in scope.'
    : '';
  return head + tail + degradedNote;
}

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
      // M2 Task 1 (integrity-unification) — subject_hash is a self-consistency
      // seal over the receipt's OWN SUBJECT_FIELDS (hash.js: task_id/phase/
      // gate_id/plan_hash/design_doc_hash/base_sha/head_sha/round). A mismatch is
      // a post-seal alteration of those subject fields (tamper), NOT plan
      // staleness — plan staleness is the separate plan_hash comparison below,
      // which compares the receipt against the CURRENT plan file. Classifying it
      // as `stale` routed preflight.js to "regenerate STALE", which would
      // overwrite (destroy) the tamper evidence — the subject-side residual of
      // the exact P5 hole the receipt_hash block below already closed. Symmetric
      // with that receipt-tamper block: blocking + kind:'subject-tamper'
      // (classify.js treats non-tempfail kinds as exit 2).
      result.blocking.push({
        gate_id: gateId,
        decision_id: result.decisionId,
        kind: 'subject-tamper',
        reason: 'subject_hash mismatch (subject fields altered after signing)',
      });
      continue;
    }

    // P5 (audit-remediation) — receipt_hash tamper-detect. subject_hash only
    // covers SUBJECT_FIELDS (task_id/phase/gate_id/plan_hash/...); post-seal
    // mutation of findings/resolution/meta (notably the dual-review integrity
    // field resolution.codex_verdict recovered in P1) went undetected because
    // write.js sealed receipt_hash but validate never recomputed it. Mirror the
    // subject_hash block above with the same hash.js#receiptHash() the writer
    // uses, so briefing_*/ledger_write_skipped carve-out parity is structural.
    // Codex R1 F1: classify as blocking (kind='receipt-tamper'), NOT stale —
    // a stale verdict routes preflight.js to "regenerate STALE" which would
    // overwrite (destroy) the tamper evidence. blocking gates hard+soft (off
    // only bypasses); classify.js treats non-tempfail kinds as exit 2.
    const computedReceipt = receiptHash(receipt);
    if (computedReceipt !== receipt.receipt_hash) {
      result.blocking.push({
        gate_id: gateId,
        decision_id: result.decisionId,
        kind: 'receipt-tamper',
        reason: 'receipt_hash mismatch (findings/resolution/meta altered after signing)',
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

    // codex-intent-context M1 (DD5) — intent-gate canonical read-back surface.
    //
    // Placement is load-bearing: this sits AFTER schema / subject-tamper /
    // receipt-tamper / plan-staleness, each of which `continue`s out of the
    // loop on failure. So a receipt whose integrity is already in question
    // never has its intent fields read, let alone trusted.
    //
    // Scoped to the gates the oracle governs (UI4 — mccp-implement-codex is
    // deliberately out of scope and must never be judged here).
    if (INTENT_IN_SCOPE_GATES.indexOf(gateId) !== -1 && receipt.meta) {
      const cls = classifyIntentMeta(receipt.meta);
      if (cls === 'unknown') {
        // DD2 — absence means "written before this field existed", not
        // "approved". Blocking in-flight work retroactively buys nothing (the
        // plan has no intent record to begin with), so the chain allows it and
        // says so out loud. dedupe still refuses it (dedupe.js), which is where
        // the fail-closed pressure belongs.
        result.warnings.push({
          gate_id: gateId,
          decision_id: result.decisionId,
          kind: 'intent_gate_unknown',
          reason: 'preceding gate predates the intent gate (meta.intent_gate_verdict ' +
            'absent) — allowed for chain continuity; cross-gate dedupe still ' +
            'declines it, so PR-Codex will run.',
        });
      } else if (!isIntentChainAllowed(receipt.meta)) {
        result.blocking.push({
          gate_id: gateId,
          decision_id: result.decisionId,
          kind: 'intent_gate_incomplete',
          reason: 'preceding gate has meta.intent_gate_verdict="' +
            String(receipt.meta.intent_gate_verdict) + '" — ' +
            intentVerdictRecovery(receipt.meta),
          intent_gate_verdict: receipt.meta.intent_gate_verdict === undefined
            ? null : receipt.meta.intent_gate_verdict,
          intent_skip_proof: receipt.meta.intent_skip_proof || null,
        });
      } else if (Object.prototype.hasOwnProperty.call(receipt.meta, 'intent_plan_digest')
                 && receipt.meta.intent_plan_digest
                 && receipt.meta.intent_plan_digest !== receipt.plan_hash) {
        // DD4-2 — the reviewed body and the sealed body must be the same
        // document. This is the canonical backstop for the residual TOCTOU
        // window write.js cannot close on its own (it re-reads the plan itself).
        result.blocking.push({
          gate_id: gateId,
          decision_id: result.decisionId,
          kind: 'intent_gate_incomplete',
          reason: 'meta.intent_plan_digest (' + receipt.meta.intent_plan_digest +
            ') != receipt.plan_hash (' + receipt.plan_hash + ') — the intent verdict ' +
            'was reached on a different plan body than the one this receipt seals. ' +
            'INTEGRITY: re-run `/mccp:plan <plan-path>` (do NOT edit the receipt).',
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

  // integrity-unification M3 (DD2/DD4/DD5) — terminal /mccp:pr self-verdict ship
  // gate. Fires ONLY when the caller opts in via checkShipVerdict AND the command
  // is a terminal PR step. pr.md Phase 2.5.9 sets it as a read-back right after
  // finalize wrote the fresh mccp-pr-codex receipt; the early Phase 1.6 preflight,
  // the auto-chain preflight, and read-only code-review chain-checks all leave it
  // off, so:
  //   - re-entrancy (DD4): the early preflight never self-gates, so a stale
  //     divergent receipt cannot block the very re-run that would refresh it.
  //   - historical (DD5): the gate only judges the just-written receipt at this
  //     locus (the fresh-receipt read-back), so absent-verdict fail-closed never
  //     retro-blocks an old receipt on a default (flag-less) validate.
  if (isPrTerminal && opts.checkShipVerdict) {
    const shipGate = require('../lib/pr-ship-gate');
    let prReceipt = null;
    let readErr = null;
    try {
      prReceipt = readReceipt(repoRoot, 'mccp-pr-codex', result.decisionId);
    } catch (err) {
      readErr = err;
    }
    if (readErr) {
      // Fail-closed: a receipt we cannot read cannot certify a ship.
      result.blocking.push({
        gate_id: 'mccp-pr-codex',
        decision_id: result.decisionId,
        kind: 'pr_codex_nonconverged',
        reason: 'ship-gate: cannot read mccp-pr-codex receipt: ' + readErr.message,
      });
    } else if (prReceipt) {
      // Schema + tamper checks (mirror of the preceding-gate loop) before trusting
      // resolution.codex_verdict.
      // R2 F4 — current HEAD for the staleness binding below.
      // santa-loop R3 (Codex FAIL absorption) — FAIL-CLOSED when the receipt declares
      // a head_sha but HEAD is unreadable. A git failure previously left curHeadSha
      // null and SKIPPED the stale-head guard, so an unverifiable binding could certify
      // an old commit. Capture the error and block below when HEAD cannot be confirmed.
      let curHeadSha = null;
      let headErr = null;
      try { curHeadSha = gitRefs({ cwd: repoRoot }).headSha; } catch (e) { headErr = e; }
      const sres = validateSchema(prReceipt);
      if (!sres.ok) {
        result.blocking.push({
          gate_id: 'mccp-pr-codex',
          decision_id: result.decisionId,
          kind: 'ship-gate-schema-invalid',
          reason: 'ship-gate: mccp-pr-codex schema invalid: ' + sres.errors.join('; '),
        });
      } else if (subjectHash(prReceipt) !== prReceipt.subject_hash) {
        result.blocking.push({
          gate_id: 'mccp-pr-codex',
          decision_id: result.decisionId,
          kind: 'subject-tamper',
          reason: 'ship-gate: subject_hash mismatch (subject fields altered after signing)',
        });
      } else if (receiptHash(prReceipt) !== prReceipt.receipt_hash) {
        result.blocking.push({
          gate_id: 'mccp-pr-codex',
          decision_id: result.decisionId,
          kind: 'receipt-tamper',
          reason: 'ship-gate: receipt_hash mismatch (findings/resolution/meta altered after signing)',
        });
      } else if (prReceipt.head_sha && !curHeadSha) {
        // santa-loop R3 (Codex FAIL absorption) — the receipt declares a head_sha but
        // current HEAD is unreadable (git failure). We cannot confirm the receipt binds
        // to the reviewed commit, so fail CLOSED rather than skip the staleness guard.
        result.blocking.push({
          gate_id: 'mccp-pr-codex',
          decision_id: result.decisionId,
          kind: 'ship-gate-head-unverifiable',
          reason: 'ship-gate: cannot read current HEAD (' +
            (headErr ? headErr.message : 'no HEAD sha') + ') to bind receipt head_sha ' +
            prReceipt.head_sha + ' — unverifiable HEAD binding, cannot certify ship. push blocked.',
          prior_verdict: (prReceipt.resolution && prReceipt.resolution.codex_verdict) || null,
        });
      } else if (curHeadSha && prReceipt.head_sha && prReceipt.head_sha !== curHeadSha) {
        // R2 F4 — bind certification to the CURRENT diff. A stale converged receipt
        // (same decision slug, older head_sha) must not certify unreviewed commits
        // just because a receipt for this decision happens to exist.
        result.blocking.push({
          gate_id: 'mccp-pr-codex',
          decision_id: result.decisionId,
          kind: 'ship-gate-stale-head',
          reason: 'ship-gate: receipt head_sha ' + prReceipt.head_sha +
            ' != current HEAD ' + curHeadSha + ' (stale receipt for an older commit — ' +
            'the current diff was not reviewed). push blocked.',
          prior_verdict: (prReceipt.resolution && prReceipt.resolution.codex_verdict) || null,
        });
      } else if (opts.expectedReceiptHash
          && prReceipt.receipt_hash !== opts.expectedReceiptHash) {
        // R3 F5 — defense-in-depth binding: pr.md 2.5.9 passes the exact receipt_hash
        // finalize sealed (2.5.7). If the receipt read here carries a different hash,
        // it was swapped/replaced between finalize and this read-back — fail closed
        // so a converged receipt cannot shadow the divergent one finalize wrote.
        result.blocking.push({
          gate_id: 'mccp-pr-codex',
          decision_id: result.decisionId,
          kind: 'ship-gate-hash-mismatch',
          reason: 'ship-gate: read-back receipt_hash ' + prReceipt.receipt_hash +
            ' != expected ' + opts.expectedReceiptHash + ' (finalize sealed a different ' +
            'receipt — swapped/replaced after write). push blocked.',
        });
      } else {
        // forceOverrideActive: the durable meta flag (finalize stamped it) OR a
        // live env var that passes the strict reason validator. Either unblocks
        // THIS ship; neither rewrites the sealed verdict (DD3).
        const meta = prReceipt.meta || {};
        let overrideActive = meta.pr_codex_force_override === true;
        let envOverrideReason = null;
        if (!overrideActive) {
          const raw = process.env.MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE;
          if (typeof raw === 'string' && raw.length > 0
              && validateReason(raw, { strict: true }).ok) {
            overrideActive = true;
            envOverrideReason = raw;
          }
        }
        const decision = shipGate.deriveShipDecision(prReceipt,
          { forceOverrideActive: overrideActive });
        if (!decision.ship) {
          result.blocking.push({
            gate_id: 'mccp-pr-codex',
            decision_id: result.decisionId,
            kind: 'pr_codex_nonconverged',
            reason: 'PR-Codex ship-gate BLOCKED: resolution.codex_verdict="' +
              decision.blockingVerdict + '" is non-approving. Resolve the divergence ' +
              '(re-run so PR-Codex re-fires on the fresh diff), or set ' +
              'MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE with a substantive reason for an ' +
              'audited override that ships WITHOUT rewriting the sealed verdict.',
            prior_verdict: decision.blockingVerdict,
          });
        } else if (overrideActive && decision.blockingVerdict) {
          // Shipping a non-approving verdict under audited override — surface as
          // warning (audit), never blocking. PR body is the canonical audit source.
          result.warnings.push({
            gate_id: 'mccp-pr-codex',
            decision_id: result.decisionId,
            kind: 'pr_codex_force_override',
            reason: 'PR-Codex ship-gate: shipped under MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE ' +
              'audited override (verdict="' + decision.blockingVerdict + '" sealed unchanged — ' +
              'PR body is canonical audit source)',
            prior_verdict: decision.blockingVerdict,
            force_override_reason:
              meta.pr_codex_force_override_reason || envOverrideReason || null,
          });
        }
      }
    } else {
      // prReceipt === null: no receipt on disk. checkShipVerdict is set ONLY by
      // pr.md Phase 2.5.9 — the POST-finalize read-back — so a missing receipt
      // here is an anomaly (finalize guarantees it wrote one), NOT a benign
      // pre-write probe. Fail closed rather than let the aggregate ok===true gate
      // ship with no receipt to audit (Implement-Codex R1 F1). No pre-write caller
      // sets checkShipVerdict, so this never retro-blocks a historical receipt (DD5).
      result.blocking.push({
        gate_id: 'mccp-pr-codex',
        decision_id: result.decisionId,
        kind: 'ship-gate-receipt-missing',
        reason: 'ship-gate: no mccp-pr-codex receipt found at read-back — finalize ' +
          'must have written one; cannot certify ship. push blocked.',
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
