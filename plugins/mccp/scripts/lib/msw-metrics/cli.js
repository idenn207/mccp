#!/usr/bin/env node
'use strict';

// msw-metrics CLI — A3 baseline artifact emitter (multi-session-work-loop M4 Task 1).
//
// Why a dedicated entry point: A3 needs a Python subprocess (tiktoken), which
// costs ~1s. The derive pipeline runs on every render trigger and has a ~1s
// total budget, so it must NEVER tokenize inline. The split is:
//
//   this CLI            → runs the tokenizer, writes a committed artifact
//   derive source       → reads that artifact (a cheap file read)
//
// Usage:
//   node cli.js a3 --emit <path>              write the BEFORE record (refuses to clobber)
//   node cli.js a3 --emit <path> --force      re-pin an existing record; what it
//                                             replaced is preserved under
//                                             `reseal_history` so the re-pin is
//                                             visible in the artifact itself
//   node cli.js a3 --emit-after <path>        measure now, store as `.after` in <path>
//   node cli.js a3 --print                    measure and print, write nothing
//
// Artifact shape is flat at the top level (`status`, `numerator_tokens`, …) so
// the pinned baseline is readable without knowing the schema, with an optional
// `after` slot holding the post-reduction measurement and a derived `reduction`.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { measureA3, DENOMINATOR_TOKENS } = require('./a3-instruction-cost');

const SCHEMA = 'a3-baseline/v1';

function gitHead(repoRoot) {
  try {
    const r = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot, encoding: 'utf8', shell: false, windowsHide: true,
    });
    if (r.status === 0) return String(r.stdout || '').trim() || null;
  } catch (_e) { /* fall through */ }
  return null;
}

// Security absorption S5 — the committed artifact must never carry a content
// hash of the user-level MEMORY.md.
//
// Two independent reasons: (1) a sha256 in git history permanently fingerprints
// a file that lives outside the repo and can be cross-referenced against
// backups; (2) that component is not reproducible on a fresh clone, so pinning
// its hash would make the "reproducible baseline" claim (G1) false. Byte and
// token counts are kept — the numerator stays honest — only the identifying
// digest is dropped.
function redactForCommit(components) {
  const out = {};
  for (const [name, comp] of Object.entries(components || {})) {
    if (!comp || typeof comp !== 'object') { out[name] = comp; continue; }
    const copy = Object.assign({}, comp);
    if (name === 'memory_index' && copy.hash) {
      copy.hash = null;
      copy.hash_redacted = 'user-level file — digest intentionally not committed (S5)';
    }
    out[name] = copy;
  }
  return out;
}

// The same S5 reasoning applied to the tokenizer block. `sys.executable` is an
// absolute path, so committing it (1) writes the operator's home directory into
// git history permanently and (2) records a value that cannot reproduce on any
// other machine — which is exactly the "not reproducible on a fresh clone"
// ground on which the memory digest is dropped above. Which interpreter did the
// measuring is still answerable: `interpreter` ("python" / "py -3") and
// `python_version` are kept, and only the machine-specific prefix is dropped.
function redactTokenizerForCommit(info) {
  if (!info || typeof info !== 'object') return info;
  const copy = Object.assign({}, info);
  if (typeof copy.executable === 'string' && copy.executable !== '') {
    copy.executable = path.basename(copy.executable);
    copy.executable_redacted = 'absolute path intentionally not committed (machine-specific, not reproducible on a fresh clone)';
  }
  return copy;
}

function toRecord(result, repoRoot) {
  return {
    status: result.status,
    numerator_tokens: result.numerator_tokens,
    numerator_bytes: result.numerator_bytes,
    denominator_tokens: result.denominator_tokens || DENOMINATOR_TOKENS,
    ratio: result.ratio,
    baseline_available: result.baseline_available,
    not_delivered_reason: result.not_delivered_reason || null,
    components: redactForCommit(result.components),
    tokenizer: redactTokenizerForCommit(result.tokenizer_info),
    measured_at: new Date().toISOString(),
    git_head: gitHead(repoRoot),
  };
}

const NOTES = Object.freeze([
  'A3 numerator = SessionStart auto-injected payload only (CLAUDE.md + MEMORY.md index + STATE.md block). Slash-command bodies and skill definitions are request-time loads and are excluded per measurement-design.md §A3.',
  'The tokenizer version is read inside the same process that ran enc.encode, so it pins the encoder that actually produced these counts.',
  'memory_index: omitted unless MCCP_A3_READ_USER_MEMORY is set. Even when present its content digest is never committed (user-level file, not reproducible on a fresh clone).',
  'state_block: session-volatile. It is reconstructed read-only from state-injector.readState plus the injector wrapper shape; if that wrapper changes this measurement must follow. Compare the claude_md component for a reduction figure free of session noise.',
  'Byte-based estimation is prohibited (measurement-design.md §A3 worked example): bytes/4 understates the observed Korean-dense count by roughly 12 percent.',
]);

function reductionOf(before, after) {
  if (!before || !after) return null;
  if (before.status !== 'computed' || after.status !== 'computed') return null;
  const b = before.numerator_tokens;
  const a = after.numerator_tokens;
  if (!Number.isFinite(b) || !Number.isFinite(a) || b <= 0) return null;

  const componentRatio = (key) => {
    const bc = before.components && before.components[key];
    const ac = after.components && after.components[key];
    if (!bc || !ac || !Number.isFinite(bc.tokens) || !Number.isFinite(ac.tokens) || bc.tokens <= 0) {
      return null;
    }
    return 1 - ac.tokens / bc.tokens;
  };

  return {
    total_ratio: 1 - a / b,
    before_tokens: b,
    after_tokens: a,
    // The headline M4 target is CLAUDE.md. Reporting it separately keeps the
    // session-volatile state_block from contaminating the claim in either
    // direction.
    claude_md_ratio: componentRatio('claude_md'),
  };
}

async function cmdA3(argv) {
  const repoRoot = process.cwd();
  const emitIdx = argv.indexOf('--emit');
  const afterIdx = argv.indexOf('--emit-after');
  const force = argv.includes('--force');
  const printOnly = argv.includes('--print');

  const result = await measureA3({ repoRoot: repoRoot });

  if (printOnly || (emitIdx === -1 && afterIdx === -1)) {
    process.stdout.write(JSON.stringify(toRecord(result, repoRoot), null, 2) + '\n');
    return result.status === 'error' ? 1 : 0;
  }

  // A non-computed measurement must not be written as if it were a baseline.
  // Task 1 is a blocker precisely so that a reduction is never claimed against
  // an unmeasurable before-value.
  if (result.status !== 'computed') {
    process.stderr.write(
      '[a3] refusing to write artifact: status=' + result.status +
      ' (' + (result.not_delivered_reason || 'no reason recorded') + ')\n'
    );
    return 1;
  }

  if (afterIdx !== -1) {
    const target = argv[afterIdx + 1];
    if (!target) { process.stderr.write('[a3] --emit-after requires a path\n'); return 2; }
    if (!fs.existsSync(target)) {
      process.stderr.write('[a3] --emit-after: baseline not found at ' + target + '\n');
      return 1;
    }
    const doc = JSON.parse(fs.readFileSync(target, 'utf8'));
    doc.after = toRecord(result, repoRoot);
    doc.reduction = reductionOf(doc, doc.after);
    writeJson(target, doc);
    const pct = doc.reduction && Number.isFinite(doc.reduction.total_ratio)
      ? (doc.reduction.total_ratio * 100).toFixed(1) + '%' : 'n/a';
    process.stdout.write('[a3] after recorded → ' + target + ' (total reduction ' + pct + ')\n');
    return 0;
  }

  const target = argv[emitIdx + 1];
  if (!target) { process.stderr.write('[a3] --emit requires a path\n'); return 2; }

  // Guard the pinned before-value. Overwriting the baseline after a reduction
  // would silently retarget the comparison and make any reduction claim
  // unfalsifiable.
  const targetExists = fs.existsSync(target);
  if (targetExists && !force) {
    process.stderr.write(
      '[a3] refusing to overwrite existing baseline ' + target + '\n' +
      '     Use --emit-after <path> to record the post-reduction value, or --force to re-pin.\n'
    );
    return 1;
  }

  // A re-pin stays possible, but it can never be silent. The guard above only
  // stops the accidental clobber; without a record of what --force replaced,
  // the escape hatch reopens the exact hole the guard exists to close (an
  // operator re-pins the before-value after the reduction and the claim
  // becomes unfalsifiable). So the replaced identity is carried forward in the
  // artifact itself, and a prior record we cannot read is a hard stop rather
  // than a re-pin over an unrecordable value.
  let resealHistory = [];
  if (targetExists) {
    const reseal = buildResealHistory(readFileOrNull(target), new Date().toISOString());
    if (!reseal.ok) {
      process.stderr.write(
        '[a3] --force: existing baseline at ' + target + ' is unreadable (' + reseal.error + ')\n' +
        '     Refusing to re-pin over a record whose prior value cannot be preserved.\n'
      );
      return 1;
    }
    resealHistory = reseal.history;
    const latest = resealHistory[resealHistory.length - 1];
    process.stderr.write(
      '[a3] --force: re-pinning baseline at ' + target + '\n' +
      '     previous before-value (git_head=' + (latest.previous_git_head || 'unknown') +
      ', tokens=' + (latest.previous_numerator_tokens != null ? latest.previous_numerator_tokens : 'unknown') + ')' +
      ' recorded in reseal_history; any prior `after` is discarded.\n'
    );
  }

  const record = toRecord(result, repoRoot);
  writeJson(target, Object.assign({ schema: SCHEMA, role: 'a3-instruction-cost' }, record, {
    after: null,
    reduction: null,
    reseal_history: resealHistory.length ? resealHistory : null,
    notes: NOTES,
  }));
  process.stdout.write(
    '[a3] baseline written → ' + target +
    ' (' + record.numerator_tokens + ' tokens / ' + record.denominator_tokens + ')\n'
  );
  return 0;
}

function readFileOrNull(target) {
  try { return fs.readFileSync(target, 'utf8'); } catch (err) { return null; }
}

/**
 * Carry forward what a --force re-pin is about to replace.
 *
 * Kept pure so the guard is testable without a tokenizer: the CLI path needs
 * python + tiktoken, and a guard that can only be exercised on one machine is a
 * guard nobody re-checks. Returns ok:false when the prior record cannot be read,
 * because re-pinning over a value we cannot record is the unfalsifiable case the
 * whole baseline seal exists to prevent.
 *
 * @param {string|null} priorRaw  existing artifact text, or null if unreadable
 * @param {string} nowIso
 * @returns {{ok: boolean, history?: Array, error?: string}}
 */
function buildResealHistory(priorRaw, nowIso) {
  if (priorRaw === null) return { ok: false, error: 'file not readable' };
  let prior;
  try {
    prior = JSON.parse(priorRaw);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (!prior || typeof prior !== 'object') return { ok: false, error: 'not a JSON object' };

  const history = Array.isArray(prior.reseal_history) ? prior.reseal_history.slice() : [];
  history.push({
    resealed_at: nowIso,
    previous_git_head: prior.git_head || null,
    previous_measured_at: prior.measured_at || null,
    previous_numerator_tokens: Number.isFinite(prior.numerator_tokens) ? prior.numerator_tokens : null,
    previous_after_git_head: prior.after && prior.after.git_head ? prior.after.git_head : null,
  });
  return { ok: true, history: history };
}

function writeJson(target, doc) {
  const dir = path.dirname(target);
  if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = target + '.' + process.pid + '.' + Math.random().toString(16).slice(2, 10) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (_e) { /* ignore */ }
    throw err;
  }
}

async function main(argv) {
  const sub = argv[0];
  if (sub === 'a3') return cmdA3(argv.slice(1));
  process.stderr.write('usage: cli.js a3 [--emit <path> [--force] | --emit-after <path> | --print]\n');
  return 2;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => { process.exitCode = code; })
    .catch((err) => {
      process.stderr.write('[a3] ' + (err && err.stack ? err.stack : err) + '\n');
      process.exitCode = 1;
    });
}

module.exports = {
  toRecord, redactForCommit, redactTokenizerForCommit, reductionOf, buildResealHistory, SCHEMA,
};
