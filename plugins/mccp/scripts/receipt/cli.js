#!/usr/bin/env node
'use strict';

const VERSION = '1.0.0';

function showHelp() {
  process.stdout.write([
    'mccp-receipt v' + VERSION,
    '',
    'Usage: mccp-receipt <subcommand> [options]',
    '',
    'Foundation subcommands:',
    '  version                       Print version and exit',
    '  schema-version                Print receipt schema version',
    '  hash-markdown <file>          Print SHA-256 of canonicalized markdown',
    '  hash-plan <file>              Print SHA-256 the PLAN axis binds to (plan-aware:',
    '                                structural canonicalization under .claude/plans/*.plan.md)',
    '  canonicalize-markdown <file>  Print canonical form (debug)',
    '  canonicalize-json [<file>]    Print RFC 8785 JCS canonical form (stdin if no file)',
    '  git-refs [<base-ref>]         Print {baseSha, headSha, baseRef} as JSON',
    '',
    'Receipt core subcommands:',
    '  write            --gate <id> --decision <slug> --plan <path> [--design-doc <p>] [--findings-file <p>] [--resolution-file <p>] [--codex-verdict converged|divergent|critical|unavailable|skipped] [--auto-round] [--codex-skipped] [--codex-disabled] [--codex-disabled-at-pr] [--advisory] [--security-skipped] [--security-skip-reason <text>] [--security-force-override] [--security-force-override-reason <text>] [--impeccable-skipped] [--impeccable-skip-reason <text>] [--impeccable-silent-skip] [--impeccable-silent-skip-reason <text>] [--impeccable-force-override] [--impeccable-force-override-reason <text>] [--deferred-findings <N>] [--codex-design-scope-excluded] [--design-findings-dropped <N>] [--a11y-routed-to-impeccable] [--dropped-findings-digest sha256:<hex>] [--plan-conflict-escalated] [--pr-phase-lock-stale-reclaimed-at-hook] [--dispatched-by-controller-session <uuid>] [--worker-dispatch-id <uuid>] [--ipc-envelope-path <path>] [--design-critique-rounds <N>] [--design-critique-verdict converged|divergent|skipped] [--design-intent-reason <text>] [--pr-design-chain-skip-reason <text>] [--impeccable-routing-mode auto|hybrid|recommend] [--impeccable-commands-routed-file <path>] [--design-grounding-captured] [--design-grounding-verdict grounded|anchor_clean|inconclusive|violations|skipped] [--merged-verify-verdict converged|divergent|critical|unavailable|skipped] [--merged-verify-rounds <N>] [--review-mode codex|multi-agent|hybrid] [--review-verdict converged|divergent|critical|unavailable|skipped] [--review-source codex|multi-agent|hybrid] [--review-proof-file <path>] [--review-l3-invoked] [--review-l3-reason <text>] [--review-wall-clock-ms <N>] [--review-single-pass-reason scope_too_small|deadline_pressure|deferred_to_prd_completion] [--review-single-pass-bypassed-verdict] [--pr-codex-force-override] [--pr-codex-force-override-reason <text>] [--quiet]',
    '  restamp-grounding --gate <id> --decision <slug> --design-grounding-verdict <enum> [--cwd <path>] [--quiet]',
    '  restamp-routed    --gate mccp-implement-codex --decision <slug> --impeccable-commands-routed-file <path> [--cwd <path>] [--quiet]',
    '  validate         --command <slug> [--decision <slug>] [--plan <path>] [--check-ship-verdict] [--expected-receipt-hash <hex>]',
    '  preflight        --command <slug> [--decision <slug>] [--plan <path>]',
    '  status           [--gate <id>] [--json]',
    '  derive-decision  --command <name> [--args "<raw args>"] [--plan <path>] [--cwd <path>]',
    '  dedupe           --plan <path> --base <ref> --decision <slug> [--cwd <path>]',
    '  pr-body          --decision <slug> --head <sha> --action write|path|delete|sweep [--content <text>] [--content-file <path>] [--cwd <path>]',
    '',
    'Subcommands not yet implemented (Phase 5 — fallback):',
    '  diff        --plan <path> --against <receipt.json>',
    '  backfill    --from-pr <num>',
    '',
    'Environment:',
    '  MCCP_SKIP_RECEIPT=1            User-explicit bypass (logged into receipt meta)',
    '  MCCP_RECEIPT_DEBUG=1           Verbose debug output to stderr',
    '',
  ].join('\n'));
}

function parseFlags(args) {
  const out = { _: [] };
  function setOrPush(key, val) {
    if (out[key] === undefined) {
      out[key] = val;
    } else if (Array.isArray(out[key])) {
      out[key].push(val);
    } else {
      out[key] = [out[key], val];
    }
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        setOrPush(a.slice(2, eq), a.slice(eq + 1));
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        setOrPush(a.slice(2), args[i + 1]);
        i += 1;
      } else {
        setOrPush(a.slice(2), true);
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function cmdVersion() {
  process.stdout.write(VERSION + '\n');
  return 0;
}

function cmdSchemaVersion() {
  const { SCHEMA_VERSION } = require('./schema');
  process.stdout.write(SCHEMA_VERSION + '\n');
  return 0;
}

function cmdHashMarkdown(rest) {
  const { markdownHash } = require('./hash');
  const file = rest._[0];
  if (!file) {
    process.stderr.write('mccp-receipt hash-markdown: <file> argument required\n');
    return 1;
  }
  try {
    process.stdout.write(markdownHash(file) + '\n');
    return 0;
  } catch (err) {
    process.stderr.write('mccp-receipt hash-markdown: ' + err.message + '\n');
    return 1;
  }
}

// The PLAN axis's hash, not markdown's. `hash-markdown` above is the raw
// canonicalization; for anything under `.claude/plans/*.plan.md` the plan axis
// binds to the STRUCTURAL one instead (frontmatter keys stripped, `[x]`→`[ ]`,
// `PR #N` and table status tokens normalized — hash.js#canonicalizeMarkdownStructural).
//
// The two agree only while every structural normalization happens to be a no-op,
// which is why a caller that means "the hash this plan is reviewed under" and
// reaches for `hash-markdown` gets a value that silently diverges the first time
// an Acceptance checkbox is ticked. Every producer of a plan-bound hash
// (plan-review/cli.js, receipt/write.js) already calls planAwareMarkdownHash;
// this subcommand is that same function for shell callers.
function cmdHashPlan(rest) {
  const { planAwareMarkdownHash } = require('./hash');
  const file = rest._[0];
  if (!file) {
    process.stderr.write('mccp-receipt hash-plan: <file> argument required\n');
    return 1;
  }
  try {
    process.stdout.write(planAwareMarkdownHash(file) + '\n');
    return 0;
  } catch (err) {
    process.stderr.write('mccp-receipt hash-plan: ' + err.message + '\n');
    return 1;
  }
}

function cmdCanonicalizeMarkdown(rest) {
  const fs = require('fs');
  const { canonicalizeMarkdown } = require('./hash');
  const file = rest._[0];
  if (!file) {
    process.stderr.write('mccp-receipt canonicalize-markdown: <file> argument required\n');
    return 1;
  }
  try {
    const raw = fs.readFileSync(file, 'utf8');
    process.stdout.write(canonicalizeMarkdown(raw));
    return 0;
  } catch (err) {
    process.stderr.write('mccp-receipt canonicalize-markdown: ' + err.message + '\n');
    return 1;
  }
}

function readStdin() {
  return new Promise(function (resolve, reject) {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (chunk) { buf += chunk; });
    process.stdin.on('end', function () { resolve(buf); });
    process.stdin.on('error', reject);
  });
}

async function cmdCanonicalizeJson(rest) {
  const fs = require('fs');
  const { canonicalize } = require('./jcs');
  const file = rest._[0];
  let raw;
  if (file) {
    raw = fs.readFileSync(file, 'utf8');
  } else {
    raw = await readStdin();
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    process.stderr.write('mccp-receipt canonicalize-json: invalid JSON: ' + err.message + '\n');
    return 1;
  }
  try {
    process.stdout.write(canonicalize(parsed));
    return 0;
  } catch (err) {
    process.stderr.write('mccp-receipt canonicalize-json: ' + err.message + '\n');
    return 1;
  }
}

function cmdGitRefs(rest) {
  const { gitRefs } = require('./hash');
  try {
    const refs = gitRefs({ base: rest._[0] });
    process.stdout.write(JSON.stringify(refs, null, 2) + '\n');
    return 0;
  } catch (err) {
    process.stderr.write('mccp-receipt git-refs: ' + err.message + '\n');
    return 2;
  }
}

function cmdWrite(args) {
  const { write } = require('./write');
  try {
    const result = write(args);
    if (args.quiet) {
      process.stdout.write(result.path + '\n');
    } else {
      process.stdout.write(JSON.stringify({
        path: result.path,
        gate_id: result.receipt.gate_id,
        decision_id: result.receipt.decision_id,
        round: result.receipt.round,
        subject_hash: result.receipt.subject_hash,
        receipt_hash: result.receipt.receipt_hash,
      }, null, 2) + '\n');
    }
    return 0;
  } catch (err) {
    process.stderr.write('mccp-receipt write: ' + err.message + '\n');
    if (err.code === 'SCHEMA_INVALID') return 2;
    // v1.2.0-m1 Task 6 — controller dispatch marker detected without all 3
    // attribution flags = fail-closed exit 12 (F2 absorption). cli surfaces
    // the distinct exit so callers (and auto-chain) can branch on it.
    if (err.code === 'DISPATCH_MARKER_MISSING_FIELDS') return 12;
    // diverse-agent-review M1 — a rejected review_* stamp (partial triple,
    // contradictory source/codex_verdict pair, or a proof bound to a different
    // plan version) is fail-closed at the same severity: the write did not
    // happen and the caller must HALT rather than proceed on an unsealed gate.
    if (err.code === 'REVIEW_STAMP_INVALID') return 12;
    // env-contract-integrity M3 (DD9) — an explicit --resolution-file whose round
    // count contradicts the ledger is fail-closed at the same severity: the write
    // did not happen, and the caller must reconcile the two numbers rather than
    // seal a receipt that disagrees with the record of what actually ran.
    if (err.code === 'ROUND_LEDGER_MISMATCH') return 12;
    return 1;
  }
}

// v1.18.21 design-grounding (Codex Implement-R1 F3) — field-preserving restamp
// of the post-EXECUTE grounding verdict onto an existing receipt.
function cmdRestampGrounding(args) {
  const { restampGroundingVerdict } = require('./write');
  try {
    const result = restampGroundingVerdict(args);
    if (args.quiet) {
      process.stdout.write(result.path + '\n');
    } else {
      process.stdout.write(JSON.stringify({
        path: result.path,
        gate_id: result.receipt.gate_id,
        decision_id: result.receipt.decision_id,
        design_grounding_verdict: result.receipt.meta.design_grounding_verdict,
        subject_hash: result.receipt.subject_hash,
        receipt_hash: result.receipt.receipt_hash,
      }, null, 2) + '\n');
    }
    return 0;
  } catch (err) {
    process.stderr.write('mccp-receipt restamp-grounding: ' + err.message + '\n');
    if (err.code === 'SCHEMA_INVALID') return 2;
    return 1;
  }
}

// v1.31.4 M4 — append POST-EXECUTE routed-command outcomes onto an existing
// implement receipt. Field-preserving like restamp-grounding above; append-only
// across restamps and idempotent within one (see write.js#restampRoutedCommands
// for why those are two different axes).
function cmdRestampRouted(args) {
  const { restampRoutedCommands } = require('./write');
  try {
    const result = restampRoutedCommands(args);
    if (args.quiet) {
      // A suppressed retry still prints the path. Callers redirect this into a
      // log, where a silent success reads exactly like a silent failure.
      // The two no-op shapes are named apart: a replay of an already-recorded
      // pass and a pass that produced no outcomes are different facts about the
      // cycle, and one message for both hid which had happened (code-review M2).
      const noopNote = result.reason === 'no-entries'
        ? ' (no-op: finish pass produced no outcomes)'
        : ' (no-op: already recorded)';
      process.stdout.write(result.path + (result.noop ? noopNote : '') + '\n');
    } else {
      process.stdout.write(JSON.stringify({
        path: result.path,
        noop: result.noop,
        reason: result.reason,
        appended: result.appended,
        gate_id: result.receipt ? result.receipt.gate_id : (args.gate || null),
        decision_id: result.receipt ? result.receipt.decision_id : (args.decision || null),
        impeccable_commands_routed: result.receipt
          ? result.receipt.meta.impeccable_commands_routed
          : null,
        receipt_hash: result.receipt ? result.receipt.receipt_hash : null,
      }, null, 2) + '\n');
    }
    return 0;
  } catch (err) {
    process.stderr.write('mccp-receipt restamp-routed: ' + err.message + '\n');
    if (err.code === 'SCHEMA_INVALID') return 2;
    return 1;
  }
}

function cmdValidate(args) {
  const { validateCommand } = require('./validate-cmd');
  // v0.2.8 Task 2.6.5a A3 R2 F2 absorption — shared classifier. tempfail
  // and block paths used to collapse to exit 2; classify enforces the
  // precedence contract (tempfail → 75 / block → 2 / ok → 0).
  let classify;
  try { classify = require('./classify'); }
  catch (err) {
    process.stderr.write('mccp-receipt validate: classify helper load failed (' +
      err.message + '); falling back to result.ok\n');
    classify = null;
  }
  try {
    const result = validateCommand(args.command || (args._ && args._[0]), {
      decisionId: args.decision || 'default',
      planPath: args.plan,
      cwd: args.cwd,
      // integrity-unification M3 — opt-in PR-terminal self-verdict ship gate.
      // Only pr.md Phase 2.5.9 (finalize-follow read-back) sets this; the early
      // Phase 1.6 preflight and standard code-review chain-checks leave it off,
      // so the self-gate cannot self-poison a re-run (DD4) or retro-block a
      // historical receipt (DD5).
      checkShipVerdict: args['check-ship-verdict'] === true,
      // R3 F5 — defense-in-depth binding: pr.md 2.5.9 forwards the receipt_hash
      // finalize sealed so the read-back certifies THAT exact receipt, not a
      // swapped same-decision/head one. Omitted → binding sub-check skipped.
      expectedReceiptHash: (typeof args['expected-receipt-hash'] === 'string'
        && args['expected-receipt-hash'].length > 0) ? args['expected-receipt-hash'] : null,
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (!classify) return result.ok ? 0 : 2;
    return classify.exitCodeFor(classify.classifyValidationResult(result));
  } catch (err) {
    process.stderr.write('mccp-receipt validate: ' + err.message + '\n');
    return 1;
  }
}

function cmdPreflight(args) {
  const { preflight } = require('./preflight');
  return preflight(args);
}

function cmdStatus(args) {
  const { status } = require('./status');
  return status(args);
}

function cmdPrBody(args) {
  const prBody = require('./pr-body');
  const action = args.action;
  if (!action) {
    process.stderr.write('mccp-receipt pr-body: --action <write|path|delete|sweep> required\n');
    return 1;
  }
  let repoRoot;
  try {
    repoRoot = prBody.resolveRepoRoot(args.cwd);
  } catch (err) {
    process.stderr.write('mccp-receipt pr-body: ' + err.message + '\n');
    return 1;
  }
  if (action === 'sweep') {
    const maxAgeMs = args['max-age-ms'] !== undefined ? parseInt(args['max-age-ms'], 10) : undefined;
    const removed = prBody.sweepStale(repoRoot, maxAgeMs);
    process.stdout.write(JSON.stringify({ removed: removed }, null, 2) + '\n');
    return 0;
  }
  const decision = args.decision;
  const head = args.head;
  if (!decision) {
    process.stderr.write('mccp-receipt pr-body: --decision <slug> required\n');
    return 1;
  }
  if (!head) {
    process.stderr.write('mccp-receipt pr-body: --head <sha> required\n');
    return 1;
  }
  if (action === 'path') {
    process.stdout.write(prBody.bodyPath(repoRoot, decision, head) + '\n');
    return 0;
  }
  if (action === 'write') {
    let content;
    if (args['content-file']) {
      const fs = require('fs');
      try {
        content = fs.readFileSync(args['content-file'], 'utf8');
      } catch (err) {
        process.stderr.write('mccp-receipt pr-body: cannot read --content-file: ' + err.message + '\n');
        return 1;
      }
    } else if (args.content !== undefined && args.content !== true) {
      content = String(args.content);
    } else {
      process.stderr.write('mccp-receipt pr-body: --content <text> or --content-file <path> required for write\n');
      return 1;
    }
    const written = prBody.writeBody(repoRoot, decision, head, content);
    process.stdout.write(written + '\n');
    return 0;
  }
  if (action === 'delete') {
    const removed = prBody.deleteBody(repoRoot, decision, head);
    process.stdout.write(JSON.stringify({ removed: removed, path: prBody.bodyPath(repoRoot, decision, head) }, null, 2) + '\n');
    return 0;
  }
  process.stderr.write('mccp-receipt pr-body: unknown --action "' + action + '"\n');
  return 1;
}

function cmdDedupe(args) {
  const { evaluateForDedupe } = require('./dedupe');
  const planPath = args.plan;
  const baseRef = args.base;
  const decisionId = args.decision;
  if (!planPath) {
    process.stderr.write('mccp-receipt dedupe: --plan <path> required\n');
    return 1;
  }
  if (!baseRef) {
    process.stderr.write('mccp-receipt dedupe: --base <ref> required\n');
    return 1;
  }
  if (!decisionId) {
    process.stderr.write('mccp-receipt dedupe: --decision <slug> required\n');
    return 1;
  }
  try {
    const result = evaluateForDedupe({
      cwd: args.cwd,
      planPath: planPath,
      baseRef: baseRef,
      decisionId: decisionId,
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (!result.ok) return 2;
    return 0;
  } catch (err) {
    process.stderr.write('mccp-receipt dedupe: ' + err.message + '\n');
    return 1;
  }
}

function cmdDeriveDecision(args) {
  const { deriveDecisionId } = require('./decision');
  const commandName = args.command || (args._ && args._[0]);
  if (!commandName) {
    process.stderr.write('mccp-receipt derive-decision: --command <name> required\n');
    return 1;
  }
  const commandArgs = (args.args === true || args.args === undefined) ? '' : String(args.args);
  const planPath = (args.plan === true || args.plan === undefined) ? null : String(args.plan);
  try {
    const slug = deriveDecisionId(commandName, commandArgs, { cwd: args.cwd, planPath: planPath });
    process.stdout.write(slug + '\n');
    return 0;
  } catch (err) {
    process.stderr.write('mccp-receipt derive-decision: ' + err.message + '\n');
    return 1;
  }
}

async function main(argv) {
  const subcommand = argv[2];
  const rest = parseFlags(argv.slice(3));

  switch (subcommand) {
    case undefined:
    case '-h':
    case '--help':
    case 'help':
      showHelp();
      return 0;
    case '-v':
    case '--version':
    case 'version':
      return cmdVersion();
    case 'schema-version':
      return cmdSchemaVersion();
    case 'hash-markdown':
      return cmdHashMarkdown(rest);
    case 'hash-plan':
      return cmdHashPlan(rest);
    case 'canonicalize-markdown':
      return cmdCanonicalizeMarkdown(rest);
    case 'canonicalize-json':
      return await cmdCanonicalizeJson(rest);
    case 'git-refs':
      return cmdGitRefs(rest);
    case 'write':
      return cmdWrite(rest);
    case 'restamp-grounding':
      return cmdRestampGrounding(rest);
    case 'restamp-routed':
      return cmdRestampRouted(rest);
    case 'validate':
      return cmdValidate(rest);
    case 'preflight':
      return cmdPreflight(rest);
    case 'status':
      return cmdStatus(rest);
    case 'derive-decision':
      return cmdDeriveDecision(rest);
    case 'dedupe':
      return cmdDedupe(rest);
    case 'pr-body':
      return cmdPrBody(rest);
    case 'diff':
    case 'backfill':
      process.stderr.write('mccp-receipt ' + subcommand + ': not implemented yet (Phase 5)\n');
      return 99;
    default:
      process.stderr.write('mccp-receipt: unknown subcommand "' + subcommand + '"\n');
      showHelp();
      return 1;
  }
}

if (require.main === module) {
  main(process.argv).then(function (code) {
    process.exit(code);
  }).catch(function (err) {
    process.stderr.write('mccp-receipt: fatal: ' + (err && err.stack || err) + '\n');
    process.exit(1);
  });
}

module.exports = { main: main, VERSION: VERSION };
