#!/usr/bin/env node
'use strict';

// finalize-receipt — wraps the Phase 2.5.7 WRITE_FLAGS bash assembly +
// receipt CLI invocation. Builds the flag vector deterministically from
// (a) explicit argv flags and (b) an optional --codex-result JSON file
// produced by codex-runner.js.
//
// v0.2.8 Task 2.6.1-followup F10 — collapses the Bash array-build +
// conditional `if [ ... ]` + `WRITE_FLAGS+=(...)` ceremony so the guard
// allowlist no longer needs to permit shell array construction.
//
// Argv:
//   --gate <id>                     (default: mccp-pr-codex)
//   --decision <slug>               REQUIRED
//   --plan <path>                   REQUIRED
//   --codex-result <json-file>      optional — drives codex-skipped/dedupe/actionable
//   --security-force-override-reason <text>
//   --impeccable-skip-reason <text>
//   --impeccable-silent-skip        v1.3.0 M1 — forwarded when detector reported
//                                   SKILL_AVAIL=1 + SIGNAL=0 (silent fall-through).
//   --impeccable-silent-skip-reason <text>
//   --quiet                         forwarded to receipt CLI
//   [--cwd <path>]
// Stdout (JSON): { ok, gate_id, decision, receipt_path, write_flags_used }
// Stderr passes through receipt CLI errors.

const fs = require('fs');
const path = require('path');
const { parseArgs, locateReceiptCli, callReceiptCli, emit, fail } =
  require('./_args');
// integrity-unification M3 — runtime primary ship gate. finalize is the write
// path itself (pr.md runs it unconditionally + checks its exit unconditionally),
// so enforcing here cannot be skipped by an LLM dropping a markdown step (DD2).
const { readReceipt } = require('../../receipt/store');
const { gitRepoRoot } = require('../../receipt/hash');
const { deriveShipDecision, EX_SHIP_BLOCKED } = require('../pr-ship-gate');

// v1.0.1 axis K — relative path of the stale-reclaim marker written by
// pr-phase-guard's lockActive() when it reclaimed an orphan pr-phase.lock.
// finalize-receipt reads + unlinks it so each marker stamps exactly one
// downstream receipt (loud audit trail).
const STALE_RECLAIM_MARKER_REL = path.join(
  '.claude', 'state', 'pr-phase-lock-stale-reclaimed.json');

// v1.0.1 axis K — read the marker (best-effort) and unlink it. Returns true
// iff a parseable marker was present + consumed; false on absence or any
// read/parse failure. Failure path emits a stderr line (loud fail-open) and
// still attempts unlink so a corrupt marker does not block future reclaims.
function consumeStaleReclaimMarker(cwd) {
  if (!cwd) return false;
  const markerPath = path.join(cwd, STALE_RECLAIM_MARKER_REL);
  let raw;
  try { raw = fs.readFileSync(markerPath, 'utf8'); }
  catch (err) {
    if (err && err.code !== 'ENOENT') {
      process.stderr.write(
        '[finalize-receipt] stale-reclaim marker read failed: ' +
        err.message + ' (allow)\n');
    }
    return false;
  }
  let body = null;
  try { body = JSON.parse(raw); }
  catch (err) {
    process.stderr.write(
      '[finalize-receipt] stale-reclaim marker parse failed: ' +
      err.message + ' — unlinking anyway\n');
  }
  try { fs.unlinkSync(markerPath); }
  catch (err) {
    if (err && err.code !== 'ENOENT') {
      process.stderr.write(
        '[finalize-receipt] stale-reclaim marker unlink failed: ' +
        err.message + ' (allow)\n');
    }
  }
  // body=null (parse error) still counts as marker-present-and-consumed — the
  // audit fact is "guard hook reclaimed something", and we'd rather stamp an
  // imprecise audit than swallow it.
  return body === null ? true : (body && typeof body === 'object');
}

function loadCodexResult(p) {
  if (!p) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return { _load_error: err.message };
  }
}

function deriveCodexFlags(codexResult) {
  const flags = [];
  if (!codexResult || codexResult._load_error) return flags;
  // codex_outcome shape from codex-runner.js (or pr.md flow legacy):
  //   'invoked'  — actual Codex round happened; check actionable findings
  //   'skipped'  — MCCP_PR_SKIP_CODEX_REVIEW path
  //   'deduped'  — dedupe-check signalled skip_safe=true
  if (codexResult.codex_outcome === 'skipped' && codexResult.codex_skip_reason) {
    flags.push('--codex-skipped-at-pr');
    flags.push('--codex-skip-reason');
    flags.push(String(codexResult.codex_skip_reason));
  } else if (codexResult.codex_outcome === 'deduped') {
    flags.push('--codex-dedupe-at-pr');
  }
  // v1.20.3 — forward the Codex verdict onto the mccp-pr-codex receipt.
  //
  // v1.22.3 M3 (Implement-Codex R1 F1) — an 'invoked' outcome used to map
  // unconditionally to 'converged'. The reasoning was that "codex-runner
  // fail-stops on any non-ok/blocking review, so invoked means approved" — but
  // that check is on the WRAPPER ENVELOPE (transport: classification/blocking),
  // not on the review's verdict. An envelope with classification='ok' carrying
  // verdict='needs-attention' reached here and was stamped 'converged': the
  // receipt certified convergence for a "No ship" review, and because
  // evaluateForDedupe keys on codex_verdict==='converged', that receipt could even
  // authorize a later dedupe. Map from the REAL parsed verdict instead.
  //
  //   approve            → converged
  //   any other verdict  → divergent   (needs-attention per the companion contract)
  //   null (unreadable)  → unavailable (fail-closed: cannot certify approval)
  //   disabled/skipped/deduped → skipped (Codex never ran at the PR step)
  const OUTCOME_TO_VERDICT = {
    disabled: 'skipped',
    skipped: 'skipped',
    deduped: 'skipped',
  };
  let codexVerdict = OUTCOME_TO_VERDICT[codexResult.codex_outcome];
  if (codexResult.codex_outcome === 'invoked') {
    const raw = codexResult.codex_verdict;
    if (raw === null || raw === undefined) {
      codexVerdict = 'unavailable';
    } else {
      codexVerdict = String(raw).trim().toLowerCase() === 'approve' ? 'converged' : 'divergent';
    }
    // v1.22.3 M3 follow-up (R1 F1/F4 + Implement-Codex R1 F4) — scope-exclusion is
    // AUDIT, never a verdict rewrite.
    //
    // An earlier cut mapped a scope-excluded non-approve to 'converged'. Two
    // separate defects killed that:
    //   1. The pass rested on broad keyword matching over free text, and the
    //      producer emits no category/scope field to verify against — so it could
    //      drop a real security finding ("Brand asset loader reads arbitrary local
    //      files") and pass the PR (Implement-Codex R1 F4).
    //   2. resolution.codex_verdict is contracted as "the real Codex verdict" and
    //      is the cross-gate dedupe key. Writing 'converged' over a "No ship"
    //      review meant that receipt could authorize a later dedupe that skips
    //      PR-Codex entirely.
    // The verdict now stays what Codex actually said. The scope-exclusion flag and
    // the raw verdict are stamped purely so the block can be EXPLAINED — the
    // original complaint was an OPAQUE block, not the block itself — and so
    // dropped_findings_digest / design_findings_dropped below reproduce exactly
    // what was routed away and to whom.
    if (codexResult.codex_scope_excluded_verdict === true) {
      flags.push('--codex-scope-excluded-verdict');
      if (raw !== null && raw !== undefined && String(raw).trim().length > 0) {
        flags.push('--codex-raw-verdict');
        flags.push(String(raw).trim());
      }
    }
  }
  if (codexVerdict) {
    flags.push('--codex-verdict');
    flags.push(codexVerdict);
  }
  if (codexResult.codex_actionable_findings === true) {
    flags.push('--codex-actionable-findings');
  }
  // v0.3.6 Task 8 — Codex/impeccable scope audit fields. codex-runner.js
  // computes these and emits them in its JSON output; we forward them to the
  // receipt-write CLI so the audit trail lands in receipt.meta.
  if (codexResult.codex_design_scope_excluded === true) {
    flags.push('--codex-design-scope-excluded');
  }
  if (Number.isInteger(codexResult.design_findings_dropped) &&
      codexResult.design_findings_dropped > 0) {
    flags.push('--design-findings-dropped');
    flags.push(String(codexResult.design_findings_dropped));
  }
  if (codexResult.a11y_routed_to_impeccable === true) {
    flags.push('--a11y-routed-to-impeccable');
  }
  // v1.13.0 M3 — pr.md sets a11y_auto_invoked=true in codex-result.json after
  // it actually spawns mccp:a11y-architect. Forward it so the receipt records
  // the auto-invoke (Codex R1 F3) and write_flags_used exposes it for audit.
  if (codexResult.a11y_auto_invoked === true) {
    flags.push('--a11y-auto-invoked');
  }
  if (typeof codexResult.dropped_findings_digest === 'string' &&
      codexResult.dropped_findings_digest.length > 0) {
    flags.push('--dropped-findings-digest');
    flags.push(codexResult.dropped_findings_digest);
  }
  return flags;
}

function run(args) {
  if (!args.decision) return fail('--decision <slug> required');
  if (!args.plan) return fail('--plan <path> required');

  const gateId = args.gate || 'mccp-pr-codex';
  const codexResult = loadCodexResult(args['codex-result']);

  const writeFlags = [
    'write',
    '--gate', gateId,
    '--decision', args.decision,
    '--plan', args.plan,
  ];
  if (args.quiet) writeFlags.push('--quiet');

  // Conditional flags driven by codex-result
  const codexFlags = deriveCodexFlags(codexResult);
  for (let i = 0; i < codexFlags.length; i++) writeFlags.push(codexFlags[i]);

  // Security force-override (set when MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER had a reason)
  if (args['security-force-override-reason']
      && args['security-force-override-reason'] !== true) {
    writeFlags.push('--security-force-override');
    writeFlags.push('--security-force-override-reason');
    writeFlags.push(String(args['security-force-override-reason']));
  }

  // Impeccable skip (set when impeccable-detect returned skill_available=false)
  if (args['impeccable-skip-reason'] && args['impeccable-skip-reason'] !== true) {
    writeFlags.push('--impeccable-skipped');
    writeFlags.push('--impeccable-skip-reason');
    writeFlags.push(String(args['impeccable-skip-reason']));
  }

  // v1.3.0 M1 — silent-skip surface. Forwarded when impeccable-detect returned
  // SKILL_AVAIL=1 + SIGNAL=0 (skill available but no design surface in this
  // PR/diff). validate-cmd surfaces this as informational warning at every
  // gate in M1; strict-gate blocking is deferred to M2 after SKILL first-step
  // + critique loop close the false-negative window. Runtime-mutually-
  // exclusive with impeccable_skipped (single detector invocation never emits
  // both). Defense-in-depth mutex guard: schema rejects silent_skip +
  // force_override coexisting, so suppress the forward when the caller is
  // also asking for force_override. Command bodies already gate the forward
  // on $IMPECCABLE_FORCE_OVERRIDE_REASON; this helper guard catches any
  // future caller that forgets.
  if (args['impeccable-silent-skip'] === true
      && args['impeccable-force-override'] !== true
      && !args['impeccable-force-override-reason']) {
    writeFlags.push('--impeccable-silent-skip');
    if (args['impeccable-silent-skip-reason']
        && args['impeccable-silent-skip-reason'] !== true) {
      writeFlags.push('--impeccable-silent-skip-reason');
      writeFlags.push(String(args['impeccable-silent-skip-reason']));
    }
  }

  // v1.0.1 axis K — stale-reclaim marker consume + flag forward. Resolves cwd
  // against args.cwd if given (matches the receipt CLI's --cwd semantics) and
  // falls back to process.cwd(). The marker is unlinked even when the flag is
  // not forwarded (e.g. parse failure) so a corrupt marker doesn't stick.
  const reclaimCwd = args.cwd || process.cwd();
  if (consumeStaleReclaimMarker(reclaimCwd)) {
    writeFlags.push('--pr-phase-lock-stale-reclaimed-at-hook');
  }

  // v1.3.0-m2 Task 8 (F3 absorption) — pr-design-chain-skip-reason forward.
  // Receipt schema runs the strict reason validator on this field; the caller
  // (pr.md 2.5.7) already gates the flag on MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN
  // env + reason-validator pre-check, so by the time the flag reaches this
  // helper it has already been admitted to the audited-escape path.
  if (args['pr-design-chain-skip-reason']
      && args['pr-design-chain-skip-reason'] !== true) {
    writeFlags.push('--pr-design-chain-skip-reason');
    writeFlags.push(String(args['pr-design-chain-skip-reason']));
  }

  // integrity-unification M3 — PR-Codex ship-gate audited override forward. pr.md
  // Phase 0.4 validated MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE's reason and
  // exported it; Phase 2.5.7 passes it here. Forward both flags so write.js stamps
  // meta.pr_codex_force_override=true + reason (schema re-runs the strict validator,
  // so a bad reason REJECTs the write before the ship-gate below even runs).
  if (args['pr-codex-force-override-reason']
      && args['pr-codex-force-override-reason'] !== true) {
    writeFlags.push('--pr-codex-force-override');
    writeFlags.push('--pr-codex-force-override-reason');
    writeFlags.push(String(args['pr-codex-force-override-reason']));
  }

  const cli = locateReceiptCli();
  const result = callReceiptCli(cli, writeFlags, { cwd: args.cwd, timeoutMs: 60000 });
  if (result.error) {
    return fail('receipt cli error: ' + result.error, result.exitCode || 1);
  }
  if (result.exitCode !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.stdout) process.stdout.write(result.stdout);
    return result.exitCode;
  }

  // integrity-unification M3 (DD1/DD2/DD3) — runtime primary ship gate. The
  // mccp-pr-codex receipt is now written; re-read it and enforce deriveShipDecision
  // BEFORE reporting success. A non-approving verdict (divergent/critical/
  // unavailable/absent) returns EX_SHIP_BLOCKED so pr.md HALTs before push, unless
  // the receipt carries the audited override (which ships without rewriting the
  // sealed verdict). Only fires for the PR-Codex gate; plan/implement finalize is
  // unaffected. Re-read failure is fail-closed (cannot certify what we cannot read).
  if (gateId === 'mccp-pr-codex') {
    let prReceipt = null;
    let shipErr = null;
    try {
      const repoRoot = gitRepoRoot(args.cwd || process.cwd());
      prReceipt = readReceipt(repoRoot, gateId, args.decision);
    } catch (err) {
      shipErr = err;
    }
    if (shipErr || !prReceipt) {
      process.stderr.write('[MCCP-GATE-STOP] PR-Codex ship-gate could not re-read the ' +
        'just-written receipt (' + (shipErr ? shipErr.message : 'not found') +
        ') — cannot certify ship. push blocked.\n');
      return EX_SHIP_BLOCKED;
    }
    const overrideActive = !!(prReceipt.meta
      && prReceipt.meta.pr_codex_force_override === true);
    const decision = deriveShipDecision(prReceipt, { forceOverrideActive: overrideActive });
    if (!decision.ship) {
      process.stderr.write('[MCCP-GATE-STOP] PR-Codex non-approving (verdict=' +
        decision.blockingVerdict + ') — push blocked. ' +
        'Set MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE="<substantive reason ≥30 chars, ≥3 words>" ' +
        'for an audited override (ships without rewriting the sealed verdict).\n');
      return EX_SHIP_BLOCKED;
    }
    if (overrideActive && decision.blockingVerdict) {
      process.stderr.write('[mccp] PR-Codex ship-gate: shipping under ' +
        'MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE audited override (verdict=' +
        decision.blockingVerdict + ' sealed unchanged).\n');
    }
  }

  // Receipt write succeeded — compose summary
  const receiptPath = path.posix.join('.claude', 'receipts', gateId, args.decision + '.json');
  return emit({
    ok: true,
    gate_id: gateId,
    decision: args.decision,
    receipt_path: receiptPath,
    write_flags_used: writeFlags.slice(1), // drop leading 'write'
    receipt_cli_stdout: result.stdout.trim(),
  }, 0);
}

if (require.main === module) {
  process.exit(run(parseArgs(process.argv.slice(2))));
}

module.exports = {
  run,
  deriveCodexFlags,
  consumeStaleReclaimMarker,
  STALE_RECLAIM_MARKER_REL,
};
