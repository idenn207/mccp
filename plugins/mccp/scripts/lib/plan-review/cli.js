#!/usr/bin/env node
'use strict';

// plan-review CLI — the seam between commands/plan.md and the pure oracles.
//
// Exit codes are part of the contract:
//   0  pass / informational success
//   1  L1 divergent — the PLAN is wrong (violations on stdout)
//   2  CLI misuse only (unknown subcommand, missing required flag)
//   12 BLOCK — we could not certify. Reuses EX_SHIP_BLOCKED's vocabulary.
//
// The 1-vs-12 split exists because "the plan has a defect" and "we could not
// evaluate the plan" need different operator responses: the first says fix the
// plan, the second says something is wrong with the environment (worktree race,
// missing artifact, unreadable file).
//
// Missing INPUT is 12, never 2. An absent --l2-file is not "you typed the flag
// wrong", it is "the verification result is unknown", and unknown is not a pass
// at a gate. 2 is reserved for genuine CLI misuse.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { checkPlanConsistency } = require('./l1-check');
const { decideQuorum, parseQuorum, parseRolesMin } = require('./quorum');
const { decideReview, parseReviewMode, parseL3Enabled } = require('./decide');
const {
  REVIEW_PERSPECTIVES,
  REVIEW_SCHEMA,
  buildRefutePrompt,
  findReviewPerspective,
} = require('./perspectives');
const { isRepoRelativeEvidencePath } = require('../review-verdict');
const { planAwareMarkdownHash } = require('../../receipt/hash');

const EX_OK = 0;
const EX_L1_DIVERGENT = 1;
const EX_USAGE = 2;
const EX_BLOCK = 12;

function out(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

function errln(msg) {
  process.stderr.write('[mccp:plan-review] ' + msg + '\n');
}

function parseArgs(argv) {
  const args = { _: [], evidence: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.indexOf('--') === 0) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.indexOf('--') === 0) {
        args[key] = true;
      } else if (key === 'evidence') {
        args.evidence.push(next);
        i += 1;
      } else {
        args[key] = next;
        i += 1;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {
    return process.cwd();
  }
}

// Worktree-safe scratch dir. `.git` is a FILE inside a worktree, so a `.git/`
// hardcode breaks there (§3.8).
function tmpDir() {
  try {
    const p = execFileSync('git', ['rev-parse', '--git-path', 'mccp/tmp'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const abs = path.isAbsolute(p) ? p : path.join(repoRoot(), p);
    fs.mkdirSync(abs, { recursive: true });
    return abs;
  } catch (_) {
    return process.cwd();
  }
}

// readJsonOrBlock — an unreadable input is a BLOCK, not a usage error. Returns
// a sentinel the caller turns into exit 12 with a specific reason.
function readJsonOrBlock(file, label) {
  if (!file || file === true) {
    return { ok: false, reason: label + ' not supplied' };
  }
  let raw;
  try {
    raw = fs.readFileSync(path.resolve(file), 'utf8');
  } catch (e) {
    return { ok: false, reason: label + ' unreadable at ' + file + ': ' +
      (e && e.message ? e.message : String(e)) };
  }
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, reason: label + ' is not valid JSON at ' + file + ': ' +
      (e && e.message ? e.message : String(e)) };
  }
}

// ── mode ──────────────────────────────────────────────────────────────────────
// Reports what WILL fire, so the command body branches on data rather than
// re-deriving the policy in shell.
function cmdMode() {
  const mode = parseReviewMode(process.env);
  const l3Enabled = parseL3Enabled(process.env);
  const quorum = parseQuorum(process.env);
  const rolesMin = parseRolesMin(process.env, quorum.of);

  const firesL1 = mode !== 'codex';
  const firesL2 = mode !== 'codex';
  const firesL3 = mode === 'hybrid' && l3Enabled;

  out({
    mode: mode,
    l3_enabled: l3Enabled,
    fires: { l1: firesL1, l2: firesL2, l3: firesL3 },
    quorum: { required: quorum.required, of: quorum.of, roles_min: rolesMin },
    // The panel the policy WANTS. What actually fires is capped by the runaway
    // reservation — emit-workflow-args --granted owns that, so a caller must not
    // treat this list as the launch set.
    fleet_keys: firesL2
      ? REVIEW_PERSPECTIVES.slice(0, quorum.of).map(function (p) { return p.key; })
      : [],
    // hybrid without L3 enabled can only ever end in `unavailable` (DD2 row 9);
    // surfacing it here lets the operator see the dead end before spending L2.
    hybrid_without_l3: mode === 'hybrid' && !l3Enabled,
  });
  return EX_OK;
}

// ── path containment ──────────────────────────────────────────────────────────
// santa-loop R2/R3 (Codex GPT-5.4, flagged twice): --plan/--prd were path.resolve'd,
// read, hashed, and echoed into reviewer prompts with no containment check, so the
// panel could be pointed at a file outside the repository.
//
// Deliberately NOT isRepoRelativeEvidencePath, which is what the reviewer proposed.
// That predicate exists for strings that get SEALED into a receipt, where the shape
// of the string is itself the product (an absolute path there leaks the developer's
// filesystem into the durable corpus — §3.12). A --plan argument is not sealed; it
// is a file to read. The property that matters is CONTAINMENT, and requiring the
// literal to be repo-relative would reject an ordinary absolute path to a plan
// inside the repo, which the command body may legitimately pass. Resolve, then ask
// whether the result is inside the root.
function insideRoot(p, root) {
  const rel = path.relative(root, p);
  if (rel === '') return true;
  if (rel.startsWith('..')) return false;
  return !path.isAbsolute(rel);
}

function resolveContained(rawPath, root, flag) {
  if (typeof rawPath !== 'string' || rawPath.length === 0) return { ok: false, reason: flag + ' is empty' };
  if (rawPath.indexOf('\0') !== -1) return { ok: false, reason: flag + ' contains a NUL byte' };
  const abs = path.resolve(root, rawPath);
  if (!insideRoot(abs, root)) {
    return { ok: false, reason: flag + ' resolves outside the repository (' + rawPath + ')' };
  }
  return { ok: true, abs: abs };
}

// ── l1 ────────────────────────────────────────────────────────────────────────
function cmdL1(args) {
  const planPath = args.plan;
  if (!planPath || planPath === true) {
    errln('l1 requires --plan <path>');
    return EX_USAGE;
  }
  const root = args['repo-root'] && args['repo-root'] !== true
    ? args['repo-root'] : repoRoot();

  const contained = resolveContained(planPath, root, '--plan');
  if (!contained.ok) {
    errln('BLOCK: ' + contained.reason + ' — L1 reads and quotes the plan, so it ' +
      'may only be given a file inside the repository');
    out({ verdict: 'inconclusive', violations: [{ code: 'E_PATH', detail: contained.reason }],
      plan: planPath });
    return EX_BLOCK;
  }

  // Read the path containment APPROVED, not the raw argv string. l1-check.js
  // re-resolves what it is given with nodePath.resolve(), which is relative to
  // process.cwd() — so from any cwd that is not the repo root, the check
  // validated one file and L1 read another (santa-loop R4, Codex GPT-5.4).
  const result = checkPlanConsistency({ planPath: contained.abs, repoRoot: root });
  out({ verdict: result.verdict, violations: result.violations, plan: planPath });

  if (result.verdict === 'converged') return EX_OK;
  if (result.verdict === 'divergent') {
    errln('L1 found ' + result.violations.length + ' violation(s) in ' + planPath);
    return EX_L1_DIVERGENT;
  }
  errln('L1 could not evaluate ' + planPath + ' — this is an environment problem, ' +
    'not a plan defect');
  return EX_BLOCK;
}

// ── emit-workflow-args ────────────────────────────────────────────────────────
// DD13: reviewed_plan_hash is computed HERE, on the same side of the fence as
// the L2 agents that are about to read the plan. Computing it later (at decide
// time) would read the post-edit file and erase the very mismatch the binding
// exists to detect.
function cmdEmitWorkflowArgs(args) {
  const planPath = args.plan;
  if (!planPath || planPath === true) {
    errln('emit-workflow-args requires --plan <path>');
    return EX_USAGE;
  }
  const emitRoot = (args['repo-root'] && args['repo-root'] !== true) ? args['repo-root'] : repoRoot();
  const contained = resolveContained(planPath, emitRoot, '--plan');
  if (!contained.ok) {
    errln('BLOCK: ' + contained.reason + ' — the plan is hashed into ' +
      'reviewed_plan_hash and quoted to the panel, so it may only be a file ' +
      'inside the repository');
    return EX_BLOCK;
  }
  const abs = contained.abs;
  if (!fs.existsSync(abs)) {
    errln('plan does not exist: ' + planPath);
    return EX_BLOCK;
  }
  if (args.prd && args.prd !== true) {
    const prdContained = resolveContained(args.prd, emitRoot, '--prd');
    if (!prdContained.ok) {
      errln('BLOCK: ' + prdContained.reason + ' — the PRD is quoted to the panel');
      return EX_BLOCK;
    }
  }

  let reviewedPlanHash;
  try {
    reviewedPlanHash = planAwareMarkdownHash(abs);
  } catch (e) {
    errln('cannot hash plan: ' + (e && e.message ? e.message : String(e)));
    return EX_BLOCK;
  }

  const quorum = parseQuorum(process.env);
  const requested = (args['fleet-keys'] && args['fleet-keys'] !== true)
    ? String(args['fleet-keys']).split(',').map(function (s) { return s.trim(); }).filter(Boolean)
    : REVIEW_PERSPECTIVES.slice(0, quorum.of).map(function (p) { return p.key; });

  // --granted is the runaway reservation's answer, and it is a CEILING, not a
  // suggestion. reserveWorkers clamps to the remaining headroom, so a caller that
  // reserves 4, receives 2, and then fires 4 launches two agents the session cap
  // never recorded — the exact leak `reserveWorkers` exists to close. Capping
  // here (rather than in the command body) keeps the arithmetic testable and out
  // of shell.
  const grantedRaw = args.granted;
  let granted = null;
  if (grantedRaw !== undefined) {
    // Digits only — parseInt would read "2.5" as 2 and "2x" as 2, quietly
    // launching a different fleet than the operator (or the reservation) named.
    // Same rule reconcile --actual already enforces: a value we cannot read
    // exactly is misuse, never a guess.
    const s = String(grantedRaw);
    if (grantedRaw === true || !/^\d+$/.test(s)) {
      errln('--granted must be a non-negative integer, got "' + s + '"');
      return EX_USAGE;
    }
    granted = parseInt(s, 10);
  }
  if (granted === 0) {
    errln('--granted 0 — the reservation denied every worker; nothing may be launched');
    return EX_BLOCK;
  }

  const capped = granted === null ? requested : requested.slice(0, granted);

  const fleet = capped
    .map(function (k) { return findReviewPerspective(k); })
    .filter(Boolean)
    .map(function (p) {
      return {
        key: p.key,
        agentType: p.agentType,
        lens: p.lens,
        prompt: buildRefutePrompt({
          perspective: p,
          planPath: planPath,
          prdPath: (args.prd && args.prd !== true) ? args.prd : null,
          reviewedPlanHash: reviewedPlanHash,
        }),
      };
    });

  if (fleet.length === 0) {
    errln('no valid perspectives resolved from fleet-keys');
    return EX_BLOCK;
  }

  // A fleet smaller than the quorum threshold cannot pass, no matter what the
  // reviewers say. Firing it would spend agents to reach a foregone `divergent`,
  // so refuse before the spend and name the actual constraint.
  if (fleet.length < quorum.required) {
    errln('fleet of ' + fleet.length + ' cannot satisfy a quorum requiring ' +
      quorum.required + ' response(s)' +
      (granted !== null ? ' (reservation granted ' + granted + ')' : '') +
      ' — the panel would block on arithmetic alone. Raise the agent cap, lower ' +
      'MCCP_PLAN_REVIEW_QUORUM, or run MCCP_PLAN_REVIEW=codex.');
    return EX_BLOCK;
  }

  const payload = {
    planPath: planPath,
    prdPath: (args.prd && args.prd !== true) ? args.prd : null,
    reviewedPlanHash: reviewedPlanHash,
    fleet: fleet,
    // fleetKeys mirrors fleet[].key so the Workflow receives the granted panel
    // verbatim — plan-review.js degrades to a single reviewer when it is absent.
    fleetKeys: fleet.map(function (f) { return f.key; }),
    schema: REVIEW_SCHEMA,
    quorum: {
      required: quorum.required,
      // The panel actually fielded, which is what review_proof must describe.
      of: fleet.length,
      rolesMin: parseRolesMin(process.env, fleet.length),
    },
  };

  const target = (args.out && args.out !== true)
    ? path.resolve(args.out)
    : path.join(tmpDir(), 'plan-review-workflow-args.json');
  try {
    fs.writeFileSync(target, JSON.stringify(payload, null, 2), 'utf8');
  } catch (e) {
    errln('cannot write workflow args: ' + (e && e.message ? e.message : String(e)));
    return EX_BLOCK;
  }

  out({ argsPath: target, reviewedPlanHash: reviewedPlanHash,
    fleetKeys: fleet.map(function (f) { return f.key; }) });
  return EX_OK;
}

// ── decide ────────────────────────────────────────────────────────────────────
function cmdDecide(args) {
  const mode = (args.mode && args.mode !== true) ? args.mode : parseReviewMode(process.env);

  // In codex mode nothing downstream is consulted, so an absent artifact is not
  // a block — there was never anything to read.
  if (mode === 'codex') {
    const d = decideReview({ mode: 'codex' });
    out(d);
    return EX_OK;
  }

  const l1r = readJsonOrBlock(args['l1-file'], '--l1-file');
  if (!l1r.ok) {
    errln('BLOCK: ' + l1r.reason + ' — a gate cannot pass on an unknown L1 result');
    out({ review_verdict: 'unavailable', review_source: 'multi-agent',
      review_proof: null, block: true, reason: l1r.reason, forwardCodexVerdict: false });
    return EX_BLOCK;
  }

  // DD3 short-circuit. L1 is the gatekeeper: when it fails, 5.2c never runs and
  // no l2.json exists, so demanding one here turns a real L1 defect into
  // "unavailable — L2 produced no readable result". Those are different events.
  // The operator is told the gate could not run when in fact the gate ran and
  // found violations in their plan, and the L1 violation list never reaches the
  // decision reason. It also made decideReview's own DD3 branch dead code on the
  // only path that reaches it (santa-loop R2, Codex GPT-5.4).
  //
  // Ordering matters and mirrors the oracle: an `inconclusive` L1 ("could not
  // check") still resolves to unavailable, and a converged L1 still REQUIRES a
  // readable L2 below — this widens nothing, it only stops asking L2 a question
  // that L1 already answered.
  const l1v = (l1r.value && typeof l1r.value === 'object' && !Array.isArray(l1r.value))
    ? l1r.value.verdict : null;
  if (l1v !== 'converged') {
    const d = decideReview({ mode: mode, l1: l1r.value, l2: null, l3: null });
    errln('BLOCK: L1 gatekeeper — ' + d.reason);
    out(d);
    return d.block ? EX_BLOCK : EX_OK;
  }

  const l2r = readJsonOrBlock(args['l2-file'], '--l2-file');
  if (!l2r.ok) {
    errln('BLOCK: ' + l2r.reason + ' — L2 produced no readable result, so the ' +
      'panel verdict is unknown (this is the Workflow-threw / artifact-missing path)');
    out({ review_verdict: 'unavailable', review_source: 'multi-agent',
      review_proof: null, block: true, reason: l2r.reason, forwardCodexVerdict: false });
    return EX_BLOCK;
  }

  let l3 = null;
  if (args['l3-file'] && args['l3-file'] !== true) {
    const l3r = readJsonOrBlock(args['l3-file'], '--l3-file');
    // An unreadable L3 is not fatal by itself: decideReview treats "L3 did not
    // run" as unavailable-and-honest rather than a hard error.
    l3 = l3r.ok ? l3r.value : { invoked: false, reason: l3r.reason };
  }

  // Recompute the quorum here rather than trusting whatever the workflow wrote:
  // the workflow reports reviewer RESULTS, the gate decides what they amount to.
  const l2raw = l2r.value || {};
  const results = Array.isArray(l2raw.results) ? l2raw.results : [];
  const q = parseQuorum(process.env);
  // `of` is the panel that was FIELDED, which is not always the panel that was
  // configured: the runaway reservation can cap the fleet below MCCP_PLAN_REVIEW_
  // QUORUM's N. parallel() returns one slot per launched reviewer (null when it
  // failed), so results.length is that number. Recording the configured N instead
  // would put a panel size in review_proof that never existed.
  const fielded = results.length > 0 ? results.length : q.of;
  const quorum = decideQuorum({
    results: results,
    required: q.required,
    of: fielded,
    rolesMin: parseRolesMin(process.env, fielded),
  });

  // santa-loop R4 — --plan is MANDATORY here, and an unhashable plan is a block.
  //
  // decideReview compares the sealed reviewed_plan_hash against currentPlanHash
  // only when the latter is a non-empty string (decide.js:197). So a missing
  // --plan, or a hash that threw, left currentPlanHash null and the DD13 bind
  // silently did nothing — a converged verdict could be issued for a plan version
  // nobody checked. The bind is the milestone's answer to "reviewers were launched
  // and then the plan was edited"; a bind that no-ops on an omitted flag is not a
  // bind. Failing closed here costs nothing: the only production caller (5.2e)
  // always passes --plan.
  //
  // Enforced at the CLI rather than in decideReview because the oracle is used
  // with hand-built inputs throughout the suite, and widening a pure function to
  // demand a hash it was never given would reject valid callers — the
  // over-correction this cycle already made once.
  const planPath = (args.plan && args.plan !== true) ? args.plan : null;
  let currentPlanHash = null;
  const blockBind = function (reason) {
    errln('BLOCK: ' + reason);
    out({ review_verdict: 'unavailable', review_source: 'multi-agent',
      review_proof: null, block: true, reason: reason, forwardCodexVerdict: false });
    return EX_BLOCK;
  };
  if (!planPath) {
    return blockBind('decide requires --plan: without it the DD13 bind cannot be ' +
      'evaluated and a converged verdict would certify an unverified plan version');
  }
  // Containment applies here too: this hash is what DD13 compares the sealed
  // reviewed_plan_hash against, so an out-of-repo file must not be able to
  // satisfy the bind.
  const decideRoot = (args['repo-root'] && args['repo-root'] !== true) ? args['repo-root'] : repoRoot();
  const contained = resolveContained(planPath, decideRoot, '--plan');
  if (!contained.ok) {
    return blockBind(contained.reason + ' — the DD13 bind may only be satisfied ' +
      'by a plan inside the repository');
  }
  try {
    currentPlanHash = planAwareMarkdownHash(contained.abs);
  } catch (e) {
    return blockBind('cannot hash the plan for the DD13 bind (' +
      (e && e.message ? e.message : String(e)) + ') — an unverifiable bind must ' +
      'not pass as a satisfied one');
  }

  const decision = decideReview({
    mode: mode,
    l1: l1r.value,
    l2: { quorum: quorum, results: results },
    l3: l3,
    dispatchEvidence: args.evidence,
    reviewedPlanHash: l2raw.reviewedPlanHash || null,
    currentPlanHash: currentPlanHash,
  });

  out(Object.assign({}, decision, { quorum: quorum }));
  return decision.block ? EX_BLOCK : EX_OK;
}

// ── verify-proof ──────────────────────────────────────────────────────────────
// DD5 caller axis: the pure oracle checked path FORMAT; this checks EXISTENCE.
function cmdVerifyProof(args) {
  const pr = readJsonOrBlock(args['proof-file'], '--proof-file');
  if (!pr.ok) {
    errln('BLOCK: ' + pr.reason);
    return EX_BLOCK;
  }
  const proof = pr.value;
  const evidence = (proof && Array.isArray(proof.dispatch_evidence))
    ? proof.dispatch_evidence : null;
  if (!evidence || evidence.length === 0) {
    errln('BLOCK: proof has no dispatch_evidence');
    return EX_BLOCK;
  }

  const root = args['repo-root'] && args['repo-root'] !== true
    ? args['repo-root'] : repoRoot();
  const bad = [];
  evidence.forEach(function (p) {
    if (!isRepoRelativeEvidencePath(p)) {
      bad.push({ path: String(p), problem: 'not a repo-relative path' });
      return;
    }
    if (!fs.existsSync(path.join(root, p))) {
      bad.push({ path: p, problem: 'does not exist' });
    }
  });

  out({ ok: bad.length === 0, checked: evidence.length, problems: bad });
  if (bad.length > 0) {
    errln('BLOCK: ' + bad.length + ' evidence path problem(s)');
    return EX_BLOCK;
  }
  return EX_OK;
}

function usage() {
  process.stderr.write([
    'usage: plan-review/cli.js <subcommand>',
    '  mode',
    '  l1                 --plan <path> [--repo-root <path>]',
    '  emit-workflow-args --plan <path> [--prd <path>] [--fleet-keys a,b]',
    '                     [--granted <n>] [--out <path>]',
    '  decide             --l1-file <p> --l2-file <p> [--l3-file <p>] [--plan <p>]',
    '                     [--mode <m>] [--evidence <repo-rel-path> ...]',
    '  verify-proof       --proof-file <p> [--repo-root <path>]',
    '',
    'exit: 0 pass · 1 L1 divergent · 2 CLI misuse · 12 block (cannot certify)',
    '',
  ].join('\n'));
}

function runCli(argv) {
  const sub = argv[0];
  const args = parseArgs(argv.slice(1));
  switch (sub) {
    case 'mode': return cmdMode(args);
    case 'l1': return cmdL1(args);
    case 'emit-workflow-args': return cmdEmitWorkflowArgs(args);
    case 'decide': return cmdDecide(args);
    case 'verify-proof': return cmdVerifyProof(args);
    default:
      usage();
      return EX_USAGE;
  }
}

if (require.main === module) {
  let code;
  try {
    code = runCli(process.argv.slice(2));
  } catch (e) {
    // An unexpected throw is a block, never a silent pass.
    errln('unexpected failure: ' + (e && e.stack ? e.stack : String(e)));
    code = EX_BLOCK;
  }
  process.exit(code);
}

module.exports = {
  runCli: runCli,
  EX_OK: EX_OK,
  EX_L1_DIVERGENT: EX_L1_DIVERGENT,
  EX_USAGE: EX_USAGE,
  EX_BLOCK: EX_BLOCK,
};
