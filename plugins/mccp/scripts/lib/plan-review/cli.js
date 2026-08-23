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
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const { checkPlanConsistency } = require('./l1-check');
const { panelMinRemaining } = require('./budget');
const { buildReviewRecord, reviewRecordPath } = require('./record');
const {
  decideQuorum, parseQuorum, parseRolesMin, isUsableResult, DEFAULT_BLOCK_SEVERITY,
} = require('./quorum');
const { decideReview, parseReviewMode, parseL3Enabled } = require('./decide');
const {
  buildL3Record, buildFindingsRecord, bridgeArtifacts, L3_ARTIFACTS,
} = require('./l3');
const { parseSinglePass, extractMeasurement } = require('../review-single-pass');
const { parseBool } = require('../env-contract/value');
const { deriveBacklogRows, appendRows, backlogPath } = require('./backlog-append');
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

// writePrivate — owner-only, atomic-at-the-destination, unpredictable temp name.
// Mirrors plan-codex-runner.js#writePrivate with one addition: `flag: 'wx'` on
// the temp write. The temp name already carries pid + 6 random bytes, so
// pre-creation is not a practical attack, but 'wx' turns "someone got there
// first" from a silent overwrite into an error, and this function's callers
// treat any error as a BLOCK.
//
// The rename is what makes the destination safe: rename(2) replaces a symlink at
// the target rather than following it, so a pre-planted `l3.json -> /etc/passwd`
// is destroyed, not written through.
// A failed rename leaves the temp file behind. REVIEW_DIR is purged by an
// explicit filename list at Phase 5.2 entry, not a glob, so an orphan named
// `l3.json.4711.a3f2….tmp` would never be swept and would accumulate one per
// failure. Clean it up here rather than growing the purge list a wildcard.
function writePrivate(file, text) {
  const tmp = file + '.' + process.pid + '.' +
    crypto.randomBytes(6).toString('hex') + '.tmp';
  try {
    fs.writeFileSync(tmp, text, { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, file);
  } catch (e) {
    // Clean up only a temp WE created. EEXIST means the name was already taken,
    // which is the one case 'wx' exists to detect — and unlinking someone else's
    // file there would be the exact opposite of what the flag is for. Every other
    // failure (ENOSPC, EACCES, a failed rename) leaves our own orphan behind.
    if (!e || e.code !== 'EEXIST') {
      try { fs.unlinkSync(tmp); } catch (_) { /* never mask the original failure */ }
    }
    throw e;
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
  // santa-loop R5 — lexical containment alone is defeated by a symlink pointing
  // out of the tree, so compare REAL paths when both sides exist. Resolution
  // failure is not fatal: a plan that does not exist yet still fails later on
  // read, and treating ENOENT as an escape would reject ordinary first-run cases.
  try {
    const realAbs = fs.realpathSync(abs);
    const realRoot = fs.realpathSync(root);
    if (!insideRoot(realAbs, realRoot)) {
      return { ok: false, reason: flag + ' resolves outside the repository through a ' +
        'symlink (' + rawPath + ')' };
    }
    return { ok: true, abs: realAbs };
  } catch (_) {
    return { ok: true, abs: abs };
  }
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
    // The budget gate's only producer. Computed AFTER the --granted cap because
    // the threshold must describe the panel that will actually launch: budgeting
    // for four reviewers when the reservation granted two overstates it and skips
    // a panel the turn can afford. Omitting the key (as every build before M4 did)
    // makes workflows/plan-review.js read `undefined`, substitute 0, and leave the
    // gate structurally unreachable.
    minRemaining: panelMinRemaining(process.env, fleet.length),
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

// ── l3 (hybrid only) ──────────────────────────────────────────────────────────
//
// The dedicated Codex call for the hybrid mode's third layer. It replaces the
// old arrangement, where 5.2f told the operator to run 5.2z's wrapper block
// "verbatim" — a block whose real job is to launch plan-codex-runner.js, which
// WRITES THE RECEIPT. On the hybrid path that made two receipt writers for one
// receipt with no ordering between them (PRD design input (b)).
//
// This subcommand closes that by SUBTRACTION rather than by sequencing: it
// produces the L3 inputs and nothing else, so on the hybrid path the runner is
// never launched and the ordering requirement does not exist to be violated
// (DD1). What remains is one static assertion — no runner call inside 5.2f —
// which plan-review-command-body.test.js pins.
//
// It therefore has NO receipt, NO adjudication and NO lock (DD2). Blocking
// authority stays with `decide`, which is the single place a reader can look to
// find out what stopped a gate. Consequently `invoked:false` is exit 0: "Codex
// declined to speak" is a legitimate outcome that `decide` fails closed on. Only
// an unwritten artifact is exit 12 — there `decide` would still fail closed, but
// it would report "L3 did not run" when the truth is "L3 ran and we could not
// record it", so the accurate cause has to be raised here.
function cmdL3(args) {
  const root = (args['repo-root'] && args['repo-root'] !== true)
    ? args['repo-root'] : repoRoot();

  const required = [
    ['review-dir', args['review-dir']],
    ['plan', args.plan],
    ['focus', args.focus],
    ['run-nonce', args['run-nonce']],
  ];
  for (let i = 0; i < required.length; i++) {
    const v = required[i][1];
    if (!v || v === true) {
      errln('l3 requires --' + required[i][0] + ' <value>');
      usage();
      return EX_USAGE;
    }
  }

  // The nonce is a staleness discriminator that gets written verbatim into
  // l3.json and compared by 5.2f's poll. Constrain its shape for the same reason
  // plan-codex-runner.js does (SAFE_TOKEN_RE): an unconstrained argv value ends
  // up inside a JSON document and inside an operator-facing message.
  const runNonce = String(args['run-nonce']);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runNonce)) {
    errln('--run-nonce must match [A-Za-z0-9][A-Za-z0-9._-]{0,127} (got ' +
      JSON.stringify(runNonce.slice(0, 32)) + ')');
    return EX_USAGE;
  }

  // ── containment ────────────────────────────────────────────────────────────
  // --review-dir is different in kind from --plan: we WRITE into it, and we
  // create it if absent. resolveContained's realpath comparison silently
  // degrades to the lexical check when the path does not exist yet (that
  // tolerance is deliberate there — a plan that does not exist yet must fail on
  // read, not as an escape). Writing under that degraded answer would accept a
  // dangling symlink whose target lands outside the repo, so we contain, create,
  // and then contain AGAIN — the second call runs against a path that now
  // exists, so realpath actually resolves.
  const dirFirst = resolveContained(args['review-dir'], root, '--review-dir');
  if (!dirFirst.ok) {
    errln('BLOCK: ' + dirFirst.reason + ' — L3 writes its artifacts into this ' +
      'directory, so it may only be a path inside the repository');
    return EX_BLOCK;
  }
  try {
    fs.mkdirSync(dirFirst.abs, { recursive: true });
  } catch (e) {
    errln('BLOCK: cannot create --review-dir ' + dirFirst.abs + ': ' +
      (e && e.message ? e.message : String(e)));
    return EX_BLOCK;
  }
  const dirContained = resolveContained(dirFirst.abs, root, '--review-dir');
  if (!dirContained.ok) {
    errln('BLOCK: ' + dirContained.reason + ' — re-checked after creation, when ' +
      'realpath can actually resolve; a symlinked review dir is not a place we ' +
      'write gate evidence into');
    return EX_BLOCK;
  }
  const reviewDir = dirContained.abs;

  // --plan is read-only here, but checking it BEFORE the call is what keeps a
  // typo from costing a 900-second Codex invocation.
  const planContained = resolveContained(args.plan, root, '--plan');
  if (!planContained.ok) {
    errln('BLOCK: ' + planContained.reason);
    return EX_BLOCK;
  }
  if (!fs.existsSync(planContained.abs)) {
    errln('BLOCK: plan does not exist: ' + args.plan);
    return EX_BLOCK;
  }
  if (args.prd && args.prd !== true) {
    const prdContained = resolveContained(args.prd, root, '--prd');
    if (!prdContained.ok) {
      errln('BLOCK: ' + prdContained.reason);
      return EX_BLOCK;
    }
  }

  // ── the call ───────────────────────────────────────────────────────────────
  // `--invoke-module` exists so the suite can exercise every classification row
  // without a network call or a codex installation.
  //
  // IT IS A POLICY SEAM AND IT IS GATED FOR THAT REASON. An earlier revision of
  // this comment claimed the opposite — "whatever it returns is still put through
  // buildL3Record, whose enum check is the thing that decides what may be sealed"
  // — and that is true only about VOCABULARY. A double returning
  // `{classification:'ok', stdout:'{"result":{"verdict":"approve"}}'}` yields
  // `verdict:'converged'` with `verdict-source=structured`, which is byte-identical
  // to a real Codex approval; on the hybrid path 5.6b seals it as
  // resolution.codex_verdict, `hybrid` is a CROSS_MODEL_SOURCES member, and
  // cross-gate dedupe at /mccp:pr then skips PR-Codex. The enum check constrains
  // WHICH WORDS may be sealed, never WHO SAID THEM.
  //
  // The env gate does not make forgery impossible — §3.13.2 already concedes that
  // anyone who can run node at this privilege can seal a receipt directly. What it
  // removes is a flag on the production gate binary that mints a cross-model
  // approval with no marker distinguishing it from one Codex actually uttered.
  let codexInvoke;
  const injectedModule = (args['invoke-module'] && args['invoke-module'] !== true)
    ? String(args['invoke-module']) : null;
  // M5: 등재된 bypass-flag를 raw로 비교하면 lint L9가 붉어진다 — 그것이 L9의 존재 이유다.
  // `parseBool`의 bypass-flag 분기는 `raw === '1'`이라 이 교체는 **바이트 단위로 동일**하다
  // (trim도 대소문자 접기도 하지 않는다 — `env-contract/value.js:91-95`).
  if (injectedModule && !parseBool(process.env, 'MCCP_PLAN_REVIEW_TEST_INVOKE')) {
    errln('BLOCK: --invoke-module substitutes the Codex wrapper and can therefore ' +
      'produce verdict=converged without Codex ever running. It requires ' +
      'MCCP_PLAN_REVIEW_TEST_INVOKE=1, which the suite sets and a gate run never does.');
    return EX_BLOCK;
  }
  try {
    codexInvoke = injectedModule
      ? require(path.resolve(injectedModule))
      : require('../codex-invoke');
  } catch (e) {
    errln('BLOCK: cannot load the codex-invoke module: ' +
      (e && e.message ? e.message : String(e)));
    return EX_BLOCK;
  }

  let envelope;
  try {
    envelope = codexInvoke.invokeAdversarialReview(String(args.focus), {
      json: true,
      impeccableAvailable: args['impeccable-available'] === true,
    });
  } catch (e) {
    // A throw out of the wrapper is not an approval and not a crash of this
    // command: it is one more way for Codex not to have spoken, so it takes the
    // same shape every other non-answer takes.
    envelope = {
      ok: false, stdout: '', stderr: String((e && e.message) || e),
      classification: 'spawn-enoent', blocking: true, advisory: false,
    };
  }
  envelope = (envelope && typeof envelope === 'object') ? envelope : {};

  const record = buildL3Record({
    classification: envelope.classification,
    // The wrapper reports failure through `ok`/`blocking`/`classification`
    // rather than a process exit code, so the exit axis is 0 whenever it
    // returned at all. Passing envelope.ok through it keeps buildL3Record's
    // three-condition guard meaningful for both callers.
    exitCode: envelope.ok === false ? 1 : 0,
    blocking: envelope.blocking,
    envelope: envelope,
    freeText: typeof envelope.stdout === 'string' ? envelope.stdout : '',
    runNonce: runNonce,
  });

  // ── the artifacts ──────────────────────────────────────────────────────────
  // Order is load-bearing (l3.js ARTIFACT_ORDER_RATIONALE): l3.json last, so the
  // poll's "the file is there" and "the run is complete" are one fact.
  const bridge = bridgeArtifacts(record);
  const findings = buildFindingsRecord({ record: record, envelope: envelope });
  const payloads = [
    ['codex-verdict', bridge['codex-verdict']],
    ['codex-class', bridge['codex-class']],
    ['l3-findings.json', JSON.stringify(findings, null, 2) + '\n'],
    ['l3.json', JSON.stringify(record, null, 2) + '\n'],
  ];
  for (let i = 0; i < payloads.length; i++) {
    const name = payloads[i][0];
    try {
      writePrivate(path.join(reviewDir, name), payloads[i][1]);
    } catch (e) {
      // All four are required, and NOT because a reader would miss one. After
      // the F1 absorption 5.6b takes the hybrid verdict from l3.json, so on this
      // path the two bridge files have no reader at all (see l3.js#bridgeArtifacts
      // for why they are still produced). The rule is about l3.json's meaning: its
      // presence is the poll's completeness signal, so a directory that could not
      // take all four is a directory whose l3.json must not be left behind
      // claiming a complete run.
      errln('BLOCK: cannot write ' + name + ' into ' + reviewDir + ': ' +
        (e && e.message ? e.message : String(e)) +
        ' — all ' + L3_ARTIFACTS.length + ' L3 artifacts must land or none of ' +
        'them may be trusted');
      return EX_BLOCK;
    }
  }

  out({
    invoked: record.invoked,
    verdict: record.verdict === undefined ? null : record.verdict,
    reason: record.reason,
    run_nonce: record.run_nonce,
    findings_count: Array.isArray(findings.findings) ? findings.findings.length : 0,
    artifacts: L3_ARTIFACTS.map(function (f) { return path.join(reviewDir, f); }),
  });
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

  // A panel that was SKIPPED never fired, and the gate must not say otherwise.
  //
  // Without this branch a skip reaches decideQuorum as `results: []`, comes back
  // `responded: 0`, and decideReview reports "L2 fired but no reviewer responded
  // usably" — a stated cause that is false, attached to the recovery paths 5.2e
  // prints, none of which can fix a budget shortfall. The workflow already
  // carries the observed numbers out for exactly this reason; nothing was
  // reading them. The verdict is unchanged (unavailable, fail-closed) — only the
  // reason becomes true, which is the whole point of this milestone.
  const l2raw = l2r.value || {};
  if (l2raw.skipped === true) {
    const why = (typeof l2raw.reason === 'string' && l2raw.reason) ? l2raw.reason : 'unknown';
    let detail = 'L2 panel did not fire (reason: ' + why + ') — the gate cannot ' +
      'certify a review that never ran';
    if (why === 'budget' && Number.isFinite(l2raw.remaining) &&
        Number.isFinite(l2raw.minRemaining)) {
      detail += '. The turn had ' + l2raw.remaining + ' token(s) remaining and the ' +
        'panel needs ' + l2raw.minRemaining + '. Recover by raising or removing this ' +
        "turn's budget target, lowering MCCP_PLAN_REVIEW_BUDGET, or running " +
        'MCCP_PLAN_REVIEW=codex';
    }
    errln('BLOCK: ' + detail);
    out({ review_verdict: 'unavailable', review_source: 'multi-agent',
      review_proof: null, block: true, reason: detail, forwardCodexVerdict: false });
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

  // review-loop-bypass M1 — the CLI is the only layer that reads env for this
  // axis; decideReview stays pure. Only the quorum-failure return honours it,
  // and every earlier block (L1, unreadable L2, budget skip, DD13 bind) has
  // already returned above, so the toggle cannot reach them.
  const decision = decideReview({
    mode: mode,
    l1: l1r.value,
    l2: { quorum: quorum, results: results },
    l3: l3,
    dispatchEvidence: args.evidence,
    reviewedPlanHash: l2raw.reviewedPlanHash || null,
    currentPlanHash: currentPlanHash,
    singlePass: parseSinglePass(process.env),
  });

  // A relaxation must never be quiet. The exit code below is unchanged — it is
  // decision.block that moved — so without this line the only trace of a
  // bypassed panel would be a receipt field nobody is looking at yet.
  if (typeof decision.single_pass_reason === 'string' && decision.single_pass_reason) {
    errln('SINGLE-PASS: 패널이 이견을 냈으나 단일통과 토글(' +
      decision.single_pass_reason + ')로 진행한다 — verdict는 divergent 그대로 ' +
      '봉인된다. findings는 l2.json과 리뷰 기록에 남는다.');
  }

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

// ── record ────────────────────────────────────────────────────────────────────
//
// M4 axis A. Writes `.claude/reviews/plan-review-<slug>.md` from whatever the
// REVIEW_DIR holds, and ALWAYS exits 0.
//
// The exit contract is deliberate and is the one place in this file that breaks
// the fail-closed rule above. Every other subcommand answers "may this plan be
// approved?", where an unreadable input must block. This one answers "what
// happened?", and a measurement that can block is a measurement that will be
// removed the first time it misfires. It is called immediately BEFORE the stop
// blocks at 5.2a/b/c/e/g, so it cannot alter a verdict that is already decided —
// and on the pass path it runs after 5.2g, equally unable to change anything.
//
// Silent is not the same as harmless, though: every degraded axis is named on
// stderr ([[feedback-loud-fail-open]]). "exit 0" means "I did not block you", not
// "everything was fine".
function cmdRecord(args) {
  const root = (args['repo-root'] && args['repo-root'] !== true) ? args['repo-root'] : repoRoot();

  // --review-dir gets the same containment every other path flag in this file
  // gets. It is read-only and the production caller is repo-internal, but it was
  // the one path argument exempt from the rule, and "the caller is trusted" is
  // the assumption every one of those rules was written to stop relying on.
  //
  // A failure here does NOT block: this subcommand's contract is exit 0. Refusing
  // to READ is the whole remedy — the record is still written, every axis reads
  // as absent, and the degradation says why. Falling back to the default
  // directory would be worse than either: it would silently record a different
  // run than the caller named.
  let reviewDir = path.join(root, '.claude', 'state', 'plan-review');
  let reviewDirRejected = null;
  if (args['review-dir'] && args['review-dir'] !== true) {
    const dirContained = resolveContained(args['review-dir'], root, '--review-dir');
    if (dirContained.ok) {
      reviewDir = dirContained.abs;
    } else {
      reviewDirRejected = dirContained.reason + ' — refused to read it, so every ' +
        'axis below is absent for that reason and not because the run halted early';
      reviewDir = null;
    }
  }

  // Reading is best-effort by construction: absence is the normal case for a run
  // that halted early, and it is information, not an error.
  const readIf = function (name) {
    if (reviewDir === null) return null;
    try {
      return JSON.parse(fs.readFileSync(path.join(reviewDir, name), 'utf8'));
    } catch (_) {
      return null;
    }
  };
  let startedAtMs = null;
  if (reviewDir !== null) {
    try {
      const raw = fs.readFileSync(path.join(reviewDir, 'started-at'), 'utf8').trim();
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) startedAtMs = n;
    } catch (_) { /* recorded as a degradation by the oracle */ }
  }

  const modeArtifact = readIf('mode.json');
  const slug = (args.slug && args.slug !== true) ? args.slug : 'unknown-decision';

  let built;
  try {
    built = buildReviewRecord({
      slug: slug,
      planPath: (args.plan && args.plan !== true) ? args.plan : null,
      mode: modeArtifact && modeArtifact.mode ? modeArtifact.mode : null,
      l1: readIf('l1.json'),
      l2: readIf('l2.json'),
      l3: readIf('l3.json'),
      decision: readIf('decision.json'),
      reservation: readIf('reservation.json'),
      backlog: readIf('backlog.json'),
      startedAtMs: startedAtMs,
      nowMs: Date.now(),
      haltStage: (args['halt-stage'] && args['halt-stage'] !== true) ? args['halt-stage'] : null,
      extraDegradations: reviewDirRejected ? [reviewDirRejected] : [],
    });
  } catch (e) {
    // buildReviewRecord is written not to throw. If it ever does, that is a bug
    // in the instrument — report it and still leave the gate alone.
    errln('record generation failed (' + (e && e.message ? e.message : String(e)) +
      ') — the gate is unaffected, but this run left no review record');
    return EX_OK;
  }

  const rel = reviewRecordPath(slug);
  const target = path.join(root, rel);
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, built.markdown, 'utf8');
  } catch (e) {
    errln('cannot write the review record to ' + rel + ': ' +
      (e && e.message ? e.message : String(e)) + ' — the gate is unaffected');
    return EX_OK;
  }

  built.degradations.forEach(function (d) { errln('record degraded: ' + d); });
  out({
    recordPath: rel,
    verdict: built.measurement.verdict,
    haltStage: built.measurement.halt_stage,
    wallClockMs: built.measurement.wall_clock_ms,
    degradations: built.degradations,
  });
  return EX_OK;
}

// ── backlog-append (review-loop-bypass M2) ────────────────────────────────────
//
// 단일통과 토글이 떨어뜨린 blockingFindings를 backlog 원장에 적재한다. 5.2g와
// 5.2h 사이에서 돌며, 실패는 EX_BLOCK이다 — 적재는 완화의 부수효과가 아니라
// **전제조건**이기 때문이다(DD1). 부수효과로 두면 조용히 실패했을 때 남는 것이
// 정확히 M1이 만든 부채(지적은 사라지고 receipt는 통과를 기록)다.
//
// 이 subcommand는 `record`와 실패 정책이 **반대**다. record는 "무슨 일이
// 있었나"에 답하므로 판독 불가가 exit 0이고, 이쪽은 "지적을 안전하게 옮겼나"에
// 답하므로 판독 불가가 EX_BLOCK이다.
//
// **데이터 경로는 하나다**: `--review-dir`의 `decision.json` → 그
// `quorum.blockingFindings`. `--l2` 계열 플래그는 두지 않는다 — 만들면 셸
// 호출자가 임의 배열을 적재원으로 주입할 수 있어 "적재 대상 = 완화 대상"(DD2)이
// 호출자 재량으로 바뀐다. l2.json은 non-blocking **카운트**로만 읽으며, 그것은
// 적재원이 아니라 관측값이다(읽을 수 없으면 0이 아니라 null).
function cmdBacklogAppend(args) {
  const rootRaw = (args['repo-root'] && args['repo-root'] !== true) ? args['repo-root'] : repoRoot();
  // `resolveContained`는 양쪽을 realpath로 비교하므로 정규화된 abs를 돌려준다.
  // root를 정규화하지 않으면 Windows 8.3 short name(`SKYPAR~1`)이나 심볼릭 링크
  // 아래에서 `path.relative(root, abs)`가 `..`로 시작해, 저장소 안의 plan이
  // `<outside-repo>`로 떨어진다.
  let root = rootRaw;
  try { root = fs.realpathSync(rootRaw); } catch (_) { /* 미존재 root는 아래에서 드러난다 */ }

  let reviewDir = path.join(root, '.claude', 'state', 'plan-review');
  if (args['review-dir'] && args['review-dir'] !== true) {
    const dirContained = resolveContained(args['review-dir'], root, '--review-dir');
    if (!dirContained.ok) {
      errln(dirContained.reason + ' — refusing to read the relaxed findings from ' +
        'outside the repository');
      return EX_BLOCK;
    }
    reviewDir = dirContained.abs;
  }

  const decisionFile = path.join(reviewDir, 'decision.json');
  let decision;
  try {
    decision = JSON.parse(fs.readFileSync(decisionFile, 'utf8'));
  } catch (e) {
    errln('cannot read ' + decisionFile + ' (' + (e && e.code ? e.code : String(e)) +
      ') — without the decision we cannot know WHICH findings the toggle dropped, ' +
      'and appending a guess is worse than not appending');
    return EX_BLOCK;
  }

  // `--plan`은 **여기서** 검증하고 정규화한다. 오라클이 아니라 CLI가 그 일을
  // 하는 이유는 셸 호출자가 우회할 수 없는 지점이 하나여야 하기 때문이다:
  // 절대경로가 정규화되지 않은 채 escapeCell을 거쳐 git-tracked backlog로
  // 흘러가는 것이 E7 재현 경로다.
  const planArg = (args.plan && args.plan !== true) ? args.plan : null;
  if (!planArg) {
    errln('backlog-append requires --plan: the appended row names the source plan, ' +
      'and a row that cannot say what it came from is not an audit record');
    return EX_BLOCK;
  }
  const planContained = resolveContained(planArg, root, '--plan');
  if (!planContained.ok) {
    errln(planContained.reason + ' — the backlog is git-tracked, so an out-of-repo ' +
      'path would commit a worktree location into the evidence corpus (E7)');
    return EX_BLOCK;
  }

  const slug = (args.slug && args.slug !== true) ? args.slug : null;
  if (!slug) {
    errln('backlog-append requires --slug: the row cites the review record by slug');
    return EX_BLOCK;
  }

  let rows;
  try {
    rows = deriveBacklogRows({
      decision: decision,
      planPath: planContained.abs,
      slug: slug,
      today: new Date().toISOString().slice(0, 10),
      repoRoot: root,
    });
  } catch (e) {
    errln('cannot derive the backlog rows (' + (e && e.message ? e.message : String(e)) + ')');
    return EX_BLOCK;
  }

  let appendResult;
  try {
    appendResult = appendRows({ repoRoot: root, rows: rows });
  } catch (e) {
    errln('cannot append to the backlog (' + (e && e.message ? e.message : String(e)) +
      ') — the relaxation must NOT proceed: the recovery is to turn the toggle OFF, ' +
      'which restores the ordinary non-convergence HALT and leaves the findings for ' +
      'the author to absorb (DD1)');
    return EX_BLOCK;
  }

  // 관측값 — 적재원이 아니다. DD2는 MEDIUM/LOW를 적재하지 않되 "몇 건을 그렇게
  // 두었는지는 명시적으로 센다"고 정했다. 읽을 수 없으면 0이 아니라 null이다:
  // 부재와 0은 다른 사실이고, 0으로 적으면 세지 않은 것이 "없었다"로 읽힌다.
  let skippedNonblocking = null;
  try {
    const l2 = JSON.parse(fs.readFileSync(path.join(reviewDir, 'l2.json'), 'utf8'));
    const results = Array.isArray(l2.results) ? l2.results : [];
    let n = 0;
    results.filter(isUsableResult).forEach(function (r) {
      (Array.isArray(r.findings) ? r.findings : []).forEach(function (f) {
        if (f === null || typeof f !== 'object' || Array.isArray(f)) return;
        const sev = typeof f.severity === 'string' ? f.severity.trim().toUpperCase() : null;
        // blockingFindings에 들어가지 않은 것 = 판독 가능하면서 차단 등급이 아닌 것.
        if (sev !== null && DEFAULT_BLOCK_SEVERITY.indexOf(sev) === -1) n += 1;
      });
    });
    skippedNonblocking = n;
  } catch (_) {
    errln('l2.json unreadable — skipped_nonblocking recorded as null, NOT as zero ' +
      '(an uncounted axis must not read as an empty one)');
  }

  const artifact = {
    appended: appendResult.appended,
    skipped_duplicate: appendResult.skipped_duplicate,
    skipped_nonblocking: skippedNonblocking,
    rows: appendResult.rows,
  };
  try {
    fs.mkdirSync(reviewDir, { recursive: true });
    fs.writeFileSync(path.join(reviewDir, 'backlog.json'),
      JSON.stringify(artifact, null, 2) + '\n', 'utf8');
  } catch (e) {
    errln('appended ' + appendResult.appended + ' row(s) but cannot write backlog.json (' +
      (e && e.message ? e.message : String(e)) + ') — the parity assertion has no anchor');
    return EX_BLOCK;
  }

  out(artifact);
  return EX_OK;
}

// ── assert-backlog-parity (review-loop-bypass M2) ─────────────────────────────
//
// M1의 `assert-single-round`와 같은 방식으로 성립한다: 리뷰 기록의 Measurement를
// 읽어 단언하고, **불량 입력에 fail-open하지 않는다**. exit 0에 도달하는 경로는
// 하나뿐이고 그 밖의 모든 입력은 구분되는 진단과 함께 비영점이다.
function cmdAssertBacklogParity(args) {
  const fail = function (line) {
    process.stderr.write('[mccp:backlog-parity] assert-backlog-parity FAIL — ' + line + '\n');
    return 1;
  };

  const recordArg = (args.record && args.record !== true) ? args.record : null;
  if (!recordArg) {
    return fail('usage: plan-review/cli.js assert-backlog-parity --record <review-record.md>');
  }
  const recordAbs = path.resolve(recordArg);

  let markdown;
  try {
    markdown = fs.readFileSync(recordAbs, 'utf8');
  } catch (e) {
    return fail('cannot read the review record at ' + recordAbs + ' (' +
      (e && e.code ? e.code : String(e)) + ') — 기록이 없으면 적재 건수를 알 수 없다');
  }

  const mx = extractMeasurement(markdown);
  if (!mx.ok) return fail(mx.reason + ' in ' + recordAbs);
  const measurement = mx.measurement;

  // 키 **부재**와 명시적 null은 다르다. 부재는 기록기가 그 축을 아예 쓰지
  // 않았다는 뜻이라 판독 실패이고, null이 "적재가 돌지 않았다"는 관측이다.
  if (!Object.prototype.hasOwnProperty.call(measurement, 'backlog_appended')) {
    return fail('Measurement block has no `backlog_appended` key — 판독할 수 없는 기록이다 ' +
      '(record.js가 그 축을 쓰지 않았다)');
  }

  // 기록은 `<root>/.claude/reviews/plan-review-<slug>.md`이므로 root는 두 단계 위다.
  const root = path.resolve(path.dirname(recordAbs), '..', '..');
  const artifactPath = path.join(root, '.claude', 'state', 'plan-review', 'backlog.json');

  let artifact = null;
  let artifactErr = null;
  try {
    artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  } catch (e) {
    artifactErr = (e && e.code ? e.code : String(e));
  }

  if (measurement.backlog_appended === null) {
    if (artifact !== null) {
      return fail('Measurement says backlog_appended=null (적재가 돌지 않았다) but ' +
        artifactPath + ' exists with appended=' + JSON.stringify(artifact.appended) +
        ' — 기록과 아티팩트가 서로 다른 실행을 가리킨다');
    }
    process.stdout.write('[mccp:backlog-parity] OK — no append ran (backlog_appended=null, ' +
      'no backlog.json). 토글이 꺼진 실행의 정상 상태다.\n');
    return EX_OK;
  }

  if (!Number.isInteger(measurement.backlog_appended) || measurement.backlog_appended < 0) {
    return fail('backlog_appended = ' + JSON.stringify(measurement.backlog_appended) +
      ' is not a non-negative integer');
  }
  if (artifact === null) {
    return fail('Measurement says backlog_appended=' + measurement.backlog_appended +
      ' but ' + artifactPath + ' is unreadable (' + artifactErr + ') — 적재를 주장하는 ' +
      '기록에 대조할 아티팩트가 없다');
  }
  if (artifact.appended !== measurement.backlog_appended) {
    return fail('backlog_appended mismatch: record says ' + measurement.backlog_appended +
      ', backlog.json says ' + JSON.stringify(artifact.appended));
  }

  // 건수 일치만으로는 부족하다 — 행이 실제로 원장에 있어야 적재다.
  let body;
  try {
    body = fs.readFileSync(backlogPath(root), 'utf8');
  } catch (e) {
    return fail('cannot read the backlog at ' + backlogPath(root) + ' (' +
      (e && e.code ? e.code : String(e)) + ')');
  }
  const rows = Array.isArray(artifact.rows) ? artifact.rows : [];
  if (rows.length !== artifact.appended) {
    return fail('backlog.json claims appended=' + artifact.appended + ' but carries ' +
      rows.length + ' row digest(s) — 자기모순이다');
  }
  const missing = rows.filter(function (r) {
    return !(r && typeof r.digest === 'string') ||
      body.indexOf('id=' + r.digest) === -1;
  });
  if (missing.length > 0) {
    return fail(missing.length + ' of ' + rows.length + ' appended row(s) are absent from ' +
      'the backlog body — 적재됐다고 기록된 지적이 원장에 없다');
  }

  process.stdout.write('[mccp:backlog-parity] OK — ' + artifact.appended +
    ' row(s) recorded and present in the backlog.\n');
  return EX_OK;
}

function usage() {
  process.stderr.write([
    'usage: plan-review/cli.js <subcommand>',
    '  mode',
    '  l1                 --plan <path> [--repo-root <path>]',
    '  emit-workflow-args --plan <path> [--prd <path>] [--fleet-keys a,b]',
    '                     [--granted <n>] [--out <path>]',
    '  l3                 --review-dir <path> --plan <p> --focus <text> --run-nonce <n>',
    '                     [--prd <p>] [--impeccable-available] [--repo-root <path>]',
    '                     hybrid only. Calls Codex and writes codex-verdict,',
    '                     codex-class, then l3.json (last — its presence implies',
    '                     the other two). Writes NO receipt and holds NO lock.',
    '                     exit 0 even when invoked:false; exit 12 only when an',
    '                     artifact could not be written.',
    '  decide             --l1-file <p> --l2-file <p> [--l3-file <p>] [--plan <p>]',
    '                     [--mode <m>] [--evidence <repo-rel-path> ...]',
    '  verify-proof       --proof-file <p> [--repo-root <path>]',
    '  record             --slug <s> [--plan <p>] [--halt-stage <s>]',
    '                     [--review-dir <path>] [--repo-root <path>]   (always exit 0)',
    '                     halt-stage ∈ 5.2a-0|5.2a|5.2b|5.2c-emit|5.2c-pin|5.2d|5.2e|',
    '                                 5.2e-proof|5.2f|5.2g|5.2g2  (free-form; recorded verbatim)',
    '  backlog-append     --plan <p> --slug <s> [--review-dir <path>] [--repo-root <path>]',
    '                     appends the single-pass-dropped blockingFindings to the backlog',
    '                     (5.2g2 — failure is EX_BLOCK: the relaxation must not proceed)',
    '  assert-backlog-parity --record <review-record.md>   (exit 0 only on parity)',
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
    case 'l3': return cmdL3(args);
    case 'decide': return cmdDecide(args);
    case 'verify-proof': return cmdVerifyProof(args);
    case 'record': return cmdRecord(args);
    case 'backlog-append': return cmdBacklogAppend(args);
    case 'assert-backlog-parity': return cmdAssertBacklogParity(args);
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
