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
//   --link-evidence-skip-reason <text>  M3 — MCCP_PR_SKIP_LINK_EVIDENCE audited escape,
//                                   sealed at 2.5.7 because 3.0 is past the hash
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
const { readReceipt, listReceipts } = require('../../receipt/store');
// review-record-linkage M3 — the shared repo-relative fold + M1's path-shape rule.
const { toRepoRelativePosix } = require('../repo-path');
const { isRepoRelativePath } = require('../plan-review/linkage-defs');
const { gitRepoRoot, subjectHash, receiptHash, gitRefs } = require('../../receipt/hash');
const { validate: validateReceiptSchema } = require('../../receipt/schema');
const { deriveShipDecision, EX_SHIP_BLOCKED } = require('../pr-ship-gate');
const { validateReason: validateForceReason } = require('../../receipt/lib/force-override-reason');

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
  //   'disabled' — MCCP_CODEX_DISABLED env policy (codex-runner.js:242-245)
  if (codexResult.codex_outcome === 'skipped' && codexResult.codex_skip_reason) {
    flags.push('--codex-skipped-at-pr');
    flags.push('--codex-skip-reason');
    flags.push(String(codexResult.codex_skip_reason));
  } else if (codexResult.codex_outcome === 'deduped') {
    flags.push('--codex-dedupe-at-pr');
  } else if (codexResult.codex_outcome === 'disabled') {
    // v1.23.5 (gate-guard-integrity M1, fix C) — this branch did not exist, so
    // the env-policy ship path got its proof ONLY from the ambient
    // meta.codex_disabled stamp that fix A just retired from SKIP_PROOF_META_KEYS.
    // Landing fix A without this would silently break the operator's
    // MCCP_CODEX_DISABLED ship path (receipt written, gate blocked) — the two are
    // a single-commit invariant. `_at_pr` is the right axis: it is the explicit
    // PR-step claim, and the sibling branches above forward the same shape.
    flags.push('--codex-disabled-at-pr');
    // schema.js:397-402 requires codex_skip_reason === 'codex_disabled' whenever
    // codex_disabled_at_pr is set. Forward it explicitly rather than relying on
    // write.js inferring it from ambient env: finalize can run in a process where
    // MCCP_CODEX_DISABLED is not set (the codex-result.json is what carries the
    // fact), and there the receipt would fail schema validation on write.
    flags.push('--codex-skip-reason');
    flags.push('codex_disabled');
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

// ── review-record-linkage M3 — the path anchor + D2 eligibility ──────────────
//
// The link is CARRIED, not derived: the plan gate seals the review-record path on
// its own receipt, and this step propagates that value onto the ship receipt.
// The hard part is deciding WHICH upstream receipt is ours.
//
// Not by slug. The two gates build their slugs from different inputs (`/mccp:plan`
// from its argument, `/mccp:pr` from the branch), so they diverge structurally —
// and on this very branch the ship slug `review-record-linkage` names M1's
// receipt exactly. Opening by name would seal ANOTHER milestone's review as this
// ship's approval evidence.
//
// Not by `plan_hash` either. Phase 2.5.4 injects `## Codex Implementation Review`
// into the plan body, so the ship's re-computed hash and the plan receipt's hash
// differ on every cycle — measured on an already-merged pair (M1's ship carries
// `a467cd83…`, its plan receipt `e85bad7d…`).
//
// So the anchor is the plan's repo-relative PATH: immutable under that injection,
// and an identifier-to-identifier comparison, which is what makes it isomorphic
// to `evidence-stage-guard.js:95-98` (slug <-> decision_id).
//
// Four rules, all fail-closed toward NO STAMP:
//   - exactly one match stamps; 0 and >=2 do not (>=2 is real here — the same plan
//     can be reviewed under two slugs — and picking the first row would reinstate
//     the very failure this closes, under a new name);
//   - an upstream receipt with no `meta.plan_path` is legacy, not a match;
//   - "don't know" is never promoted to a negative. Absent/corrupt/null/unknown
//     `review_source` forwards nothing, so D2 reports `undecidable`. Sealing
//     `false` would permanently drop a genuinely-reviewed ship out of metric 2's
//     denominator and put a falsehood in a hash-sealed audit field;
//   - the carried path is re-validated before forwarding. The upstream receipt is
//     working-tree-only and hash-unverified (`evidence-stage-guard` checks
//     `mccp-pr-codex` alone), so a malformed value would otherwise reach the ship
//     receipt's schema and fail-CLOSE a terminal ship — an instrumentation field
//     must not widen the ship-blocking condition (R14's argument, applied to the
//     propagation axis).
function deriveLinkageFlags(opts) {
  const o = opts || {};
  const repoRoot = o.repoRoot;
  const warn = o.warn || function (m) { process.stderr.write('[finalize-receipt] ' + m + '\n'); };
  const out = { flags: [], anchor: null, reason: null };

  const shipPlan = toRepoRelativePosix(o.shipPlanPath, repoRoot);
  if (shipPlan === null) {
    out.reason = 'link_anchor_unresolved: this ship has no resolvable repo-relative plan path (' +
      JSON.stringify(o.shipPlanPath) + ')';
    warn(out.reason);
    return out;
  }

  let rows = [];
  try { rows = listReceipts(repoRoot, 'mccp-plan-codex') || []; }
  catch (e) {
    out.reason = 'link_anchor_unresolved: cannot list mccp-plan-codex receipts (' +
      (e && e.message) + ')';
    warn(out.reason);
    return out;
  }

  const matches = [];
  for (const row of rows) {
    let receipt = null;
    try { receipt = readReceipt(repoRoot, 'mccp-plan-codex', row.decision_id); }
    catch (_e) { continue; }                 // unreadable/corrupt is not a match
    if (!receipt || typeof receipt !== 'object') continue;
    const meta = receipt.meta;
    if (!meta || typeof meta !== 'object') continue;
    const declared = toRepoRelativePosix(meta.plan_path, repoRoot);
    if (declared === null) continue;         // legacy receipt — absence is not a match
    if (declared === shipPlan) matches.push({ decision_id: row.decision_id, receipt: receipt });
  }

  if (matches.length !== 1) {
    out.reason = 'link_anchor_unresolved: ' + matches.length + ' upstream mccp-plan-codex ' +
      'receipt(s) seal meta.plan_path=' + JSON.stringify(shipPlan) + ', expected exactly 1' +
      (matches.length > 1
        ? ' (ambiguous: ' + matches.map(function (m) { return m.decision_id; }).join(', ') +
          ' — NOT picking the first)'
        : ' (0 = not wired yet, a legacy receipt with no meta.plan_path, or a different plan)') +
      '. No link is stamped; the audit reports this as undecidable.';
    warn(out.reason);
    return out;
  }

  const upstream = matches[0].receipt;
  out.anchor = { decision_id: matches[0].decision_id, plan_path: shipPlan };

  const carried = upstream.meta.review_record_path;
  if (typeof carried === 'string' && carried.length > 0) {
    if (isRepoRelativePath(carried) && carried.indexOf('.claude/reviews/') === 0) {
      out.flags.push('--review-record-path', carried);
    } else {
      warn('the upstream receipt carries a malformed meta.review_record_path (' +
        JSON.stringify(carried) + ') — NOT forwarding it. The upstream receipt is ' +
        'working-tree-only and hash-unverified, so forwarding it verbatim would let a ' +
        'bad value fail-close this ship on the receipt schema.');
    }
  }

  // D2 eligibility. Positive only for the two sources that actually run a panel;
  // `codex` is the one negative we can establish, and it carries its reason.
  const source = upstream.resolution && upstream.resolution.review_source;
  if (source === 'multi-agent' || source === 'hybrid') {
    out.flags.push('--plan-review-expected=true');
  } else if (source === 'codex') {
    out.flags.push('--plan-review-expected=false');
    out.flags.push('--no-plan-review-reason',
      'plan gate ran in codex mode; the review record is the plan body\'s Codex section, ' +
      'not a panel record');
  } else {
    warn('upstream review_source is ' + JSON.stringify(source) + ' — not one of ' +
      'multi-agent/hybrid/codex, so eligibility stays UNSTAMPED (undecidable). ' +
      'schema.js:206 permits a null review_source, and "unknown" is not "not reviewed".');
  }
  return out;
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
  // R3 F5 — the pr-codex ship gate needs the sealed receipt_hash back to bind the
  // re-read to THIS write, and --quiet emits only the path. Keep --quiet for other
  // gates when requested; for mccp-pr-codex always take the JSON (carries receipt_hash).
  if (args.quiet && gateId !== 'mccp-pr-codex') writeFlags.push('--quiet');

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
  //
  // santa-loop R1 (Codex FAIL absorption) — PROVENANCE-BIND the override to THIS
  // run. The forwarded reason flag alone is NOT proof the override was authorized
  // now: an ambient/stale PR_CODEX_FORCE_OVERRIDE_REASON (settings.json, an
  // inherited shell export, a prior run) forwards here with no
  // MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE set this run, and would silently stamp
  // the override and ship a divergent PR — a second, unvalidated bypass of the
  // "only sanctioned bypass" contract (the symmetric hole the entry `unset
  // CODEX_DEDUPE_AT_PR` reset guards). The strict validator on the reason string
  // only proves it is well-formed, not that it was authorized this run. finalize
  // is the write locus and inherits the ambient env, so re-reading + strict-
  // validating MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE HERE is authoritative; a
  // forwarded flag with no valid env this run is dropped fail-closed (the sealed
  // verdict then gates the ship at the runtime primary check below).
  // review-record-linkage M3 — path-anchored link + D2 eligibility forward.
  // Runs unconditionally: every branch inside deriveLinkageFlags that cannot
  // establish the anchor returns an EMPTY flag list plus a loud reason, so the
  // absence of a link is always the honest kind.
  const linkage = deriveLinkageFlags({
    repoRoot: gitRepoRoot(args.cwd || process.cwd()),
    shipPlanPath: args.plan,
  });
  for (let i = 0; i < linkage.flags.length; i++) writeFlags.push(linkage.flags[i]);

  // The MCCP_PR_SKIP_LINK_EVIDENCE audited escape is sealed HERE, at 2.5.7 —
  // not at Phase 3.0. The ship receipt is finalized before the evidence commit
  // runs, so a 3.0-time edit would either violate the §3.12 no-rehash invariant
  // or, written without a rehash, trip `evidence-stage-guard.js:75-77` and HALT
  // every ship. Phase 3.0 only READS this field to decide whether to stage the
  // record. The link then stays incomplete and the audit says so.
  if (args['link-evidence-skip-reason'] && args['link-evidence-skip-reason'] !== true) {
    const lv = validateForceReason(args['link-evidence-skip-reason'], { strict: true });
    if (lv.ok) {
      writeFlags.push('--link-evidence-skip-reason', String(args['link-evidence-skip-reason']));
    } else {
      process.stderr.write('[finalize-receipt] --link-evidence-skip-reason rejected (' +
        lv.reason + ') — DROPPING it. The escape is not applied and the record will be ' +
        'staged normally.\n');
    }
  }

  if (args['pr-codex-force-override-reason']
      && args['pr-codex-force-override-reason'] !== true) {
    const forceProv = validateForceReason(
      process.env.MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE, { strict: true });
    if (forceProv.ok) {
      writeFlags.push('--pr-codex-force-override');
      writeFlags.push('--pr-codex-force-override-reason');
      writeFlags.push(String(args['pr-codex-force-override-reason']));
    } else {
      process.stderr.write('[mccp] PR-Codex ship-gate: a --pr-codex-force-override-reason ' +
        'flag was forwarded but MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE is not set/valid ' +
        'this run (' + forceProv.reason + ') — treating as a stale/unprovenanced override ' +
        'and DROPPING it. The sealed verdict gates the ship.\n');
    }
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

  // R3 F5 — capture the receipt_hash the write CLI just sealed (non-quiet JSON for
  // the pr-codex gate) so the ship-gate can bind its re-read to THIS write.
  let writtenReceiptHash = null;
  if (gateId === 'mccp-pr-codex') {
    try { writtenReceiptHash = (JSON.parse(result.stdout) || {}).receipt_hash || null; }
    catch (_) { writtenReceiptHash = null; }
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
    // R2 F3 — the runtime PRIMARY gate must be SELF-SUFFICIENT: verify integrity
    // (schema + subject_hash + receipt_hash) before trusting resolution.codex_verdict.
    // Otherwise a post-write corruption/replacement that flips a non-approving
    // verdict to converged before this re-read would ship at exit 0, relying on the
    // markdown 2.5.9 read-back (which can be skipped). Mirror validate-cmd's checks.
    const shipSchema = validateReceiptSchema(prReceipt);
    if (!shipSchema.ok) {
      process.stderr.write('[MCCP-GATE-STOP] PR-Codex ship-gate: re-read receipt failed ' +
        'schema validation (' + shipSchema.errors.join('; ') + ') — push blocked.\n');
      return EX_SHIP_BLOCKED;
    }
    if (subjectHash(prReceipt) !== prReceipt.subject_hash) {
      process.stderr.write('[MCCP-GATE-STOP] PR-Codex ship-gate: subject_hash mismatch ' +
        '(subject fields altered after signing) — push blocked.\n');
      return EX_SHIP_BLOCKED;
    }
    if (receiptHash(prReceipt) !== prReceipt.receipt_hash) {
      process.stderr.write('[MCCP-GATE-STOP] PR-Codex ship-gate: receipt_hash mismatch ' +
        '(findings/resolution/meta altered after signing) — push blocked.\n');
      return EX_SHIP_BLOCKED;
    }
    // R3 F5 — bind the re-read to THIS invocation's write. The write CLI reported
    // the receipt_hash it sealed; if the file on disk now carries a different hash,
    // it was swapped/replaced (concurrent /mccp:pr or external write) between write
    // and re-read. With the self-consistency check above, an equal hash proves the
    // certified receipt IS the one this finalize wrote — a converged receipt for the
    // same decision/head can no longer shadow a divergent write.
    if (!writtenReceiptHash || prReceipt.receipt_hash !== writtenReceiptHash) {
      process.stderr.write('[MCCP-GATE-STOP] PR-Codex ship-gate: re-read receipt_hash ' +
        (prReceipt.receipt_hash || 'null') + ' != the hash this finalize wrote ' +
        (writtenReceiptHash || 'null') + ' (receipt swapped/replaced after write) — ' +
        'push blocked.\n');
      return EX_SHIP_BLOCKED;
    }
    // R2 F4 — bind certification to the CURRENT diff: a stale receipt (older
    // head_sha) must not certify unreviewed commits.
    // santa-loop R3 (Codex FAIL absorption) — this binding is now FAIL-CLOSED when
    // the receipt declares a head_sha but HEAD is unreadable. Previously a git failure
    // left curHeadSha=null and SILENTLY SKIPPED the stale-head guard, so an
    // unverifiable binding could certify an old commit. If the receipt has a head_sha
    // we MUST confirm it against HEAD; a read failure blocks. (No head_sha → nothing
    // to bind → skip.)
    let curHeadSha = null;
    let headErr = null;
    try { curHeadSha = gitRefs({ cwd: args.cwd || process.cwd() }).headSha; }
    catch (e) { headErr = e; }
    if (prReceipt.head_sha && !curHeadSha) {
      process.stderr.write('[MCCP-GATE-STOP] PR-Codex ship-gate: cannot read current HEAD ' +
        '(' + (headErr ? headErr.message : 'no HEAD sha') + ') to bind receipt head_sha ' +
        prReceipt.head_sha + ' — unverifiable HEAD binding, cannot certify ship. push blocked.\n');
      return EX_SHIP_BLOCKED;
    }
    if (curHeadSha && prReceipt.head_sha && prReceipt.head_sha !== curHeadSha) {
      process.stderr.write('[MCCP-GATE-STOP] PR-Codex ship-gate: receipt head_sha ' +
        prReceipt.head_sha + ' != current HEAD ' + curHeadSha +
        ' (stale receipt for an older commit) — cannot certify ship. push blocked.\n');
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

  // ── ship 봉인 관측 (multi-session-work-loop M8 Task 4 · DD5) ───────────────
  //
  // **이것은 A1의 분자가 아니다.** 봉인 뒤 `gh pr create`가 실패하면 완주가
  // 아니기 때문이다. 완주(`task_completed`)는 PR 번호가 생긴 **뒤에** 명령
  // 본문이 기록한다(DD4).
  //
  // 그럼 왜 기록하는가: DD4가 완주 emit을 산문에 맡겼고 이 저장소의 산문 지시는
  // 자주 불이행된다. 그 간극을 침묵시키지 않기 위해 봉인 사실을 코드로 남긴다 —
  // `sealed_without_completion`(봉인은 됐는데 완주 기록이 없는 작업 단위 수)이
  // 그 차이를 **관측 가능한 수치**로 만든다. 침묵하는 과소 계상과 보이는 과소
  // 계상은 다르다.
  //
  // fail-open: 이 emit이 실패해도 PR finalize는 계속된다. 관측이 게이트를
  // 막으면 관측이 아니라 게이트다(UI4).
  try {
    const mswEvents = require('../../state/msw-events');
    const { resolveRawSessionId } = require('../session-identity');
    const { sanitizeSessionId } = require('../utils');
    const sid = sanitizeSessionId(resolveRawSessionId(process.env));
    if (sid) {
      // repoRoot는 위 ship-gate 블록 **안**에서만 선언되므로 여기서 다시 푼다.
      // 그 이름을 빌려 쓰면 non-PR 게이트에서 ReferenceError가 되고, 이 try가
      // 그것을 삼켜 emit이 조용히 사라진다 — fail-open이 결함을 숨기는 형태다.
      //
      // orchestrator-step-wiring M1 (DD8) — 이 파일은 **세 번째 A1 producer**다
      // (`task_ship_sealed`). 앞의 둘과 root 해소 방식이 다르다: `gitRepoRoot`는
      // `git rev-parse --show-toplevel` spawn이고 실패 시 null을 낸다. null을 그대로
      // 넘기면 `resolveEventsDir`가 `process.cwd()` walk-up으로 떨어져 sealed 이벤트가
      // completed와 **다른 root 아래**에 착지하고, `sealed_without_completion`이
      // 유령 gap을 보고한다. 그래서 실패 시 나머지 둘과 같은 해소기로 넘긴다.
      const emitCwd = args.cwd || process.cwd();
      const emitRoot = gitRepoRoot(emitCwd) || mswEvents.discoverRepoRoot(emitCwd);
      const r = mswEvents.appendEvent(sid, {
        kind: 'task_ship_sealed',
        work_unit: args.decision,
        producer: 'finalize-receipt',
        // `cwd`도 함께 넘긴다 (local review L1). 둘 다 실패해 `emitRoot`가 null이면
        // 해소기가 walk-up으로 떨어지는데, `cwd`가 없으면 그 출발점이 `process.cwd()`가
        // 되어 `args.cwd`가 다를 때 앞의 두 producer와 **다른 root**에서 탐색한다.
      }, { repoRoot: emitRoot, cwd: emitCwd });
      if (!r || !r.ok) {
        process.stderr.write('[mccp:msw-a1] task_ship_sealed append failed: '
          + ((r && r.reason) || 'unknown') + '\n');
      }
    } else {
      process.stderr.write('[mccp:msw-a1] task_ship_sealed skipped — no resolvable session id\n');
    }
  } catch (err) {
    process.stderr.write('[mccp:msw-a1] task_ship_sealed emit error (fail-open): '
      + ((err && err.message) || String(err)) + '\n');
  }

  // Receipt write succeeded — compose summary
  const receiptPath = path.posix.join('.claude', 'receipts', gateId, args.decision + '.json');
  return emit({
    ok: true,
    gate_id: gateId,
    decision: args.decision,
    receipt_path: receiptPath,
    // R3 F5 — surface the sealed receipt_hash so pr.md can forward it to the
    // 2.5.9 read-back (--expected-receipt-hash) for defense-in-depth binding.
    receipt_hash: writtenReceiptHash || null,
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
  // review-record-linkage M3 — exported so the seven anchor branches can be
  // asserted directly. The NEGATIVE branches are the body of that test: with only
  // the positive one, deleting the whole anchor still passes.
  deriveLinkageFlags,
  consumeStaleReclaimMarker,
  STALE_RECLAIM_MARKER_REL,
};
