'use strict';

// workflow-orchestration M3 Task 2 — aggregate adversarial-verify oracle.
//
// After the implement dispatch (a single worker editing the parent directly, or
// — once worktree-merge is unlocked — N disjoint workers merged back), the
// INTEGRATED diff is reviewed ONCE by Codex OUTSIDE the worker boundary, before
// commit. This is the pipeline "verify stage" that answers PRD Open Question 1(c)
// (게이트 합성 척추): a worker-external, commit-gating check that catches
// cross-partition / whole-diff regressions (public API drift, import-graph
// breakage, shared-config divergence) that per-worker Implement-Codex (inside each
// worker) and the integrated `node --test` structurally cannot see.
//
// DD6 / Codex R1 F2 — the verify stage fires on the SINGLE path too, not only the
// (currently gated) parallel path. So M3's verify-네이티브화 has runtime value
// regardless of whether worktree-merge is activated.
//
// DD2 — cross-model invariant. The invoker stays Codex (codex-invoke.js); the
// "adversarial-verify" pattern is borrowed only for its WORKER-EXTERNAL structure,
// NOT to swap the reviewer to a same-model Claude skeptic (that reintroduces the
// blind spot mccp's Claude↔Codex dual-review exists to prevent).
//
// PURE functions — the Codex spawn + fs reads live in the caller (work.md Bash /
// dispatch-cli). buildVerifyFocus assembles the focus text; decideMergedVerify
// maps the Codex outcome → verdict + block decision. Mirrors result-schema.js
// (pure oracle + module.exports) and reuses codex-bridge parseVerdict /
// detectCriticalCategory semantics (DRY — same verdict vocabulary as every other
// mccp Codex gate).

const bridge = require('../codex-bridge');

const MERGED_VERIFY_MODES = Object.freeze(['off', 'warn', 'enforce']);
const VERDICTS = Object.freeze(['converged', 'divergent', 'critical', 'unavailable', 'skipped']);

const ENV_MODE = 'MCCP_WORK_MERGED_VERIFY';

// parseMergedVerifyMode(env) → 'off' | 'warn' | 'enforce'. Default enforce.
// Typos / unset → enforce (fail-closed) with a loud stderr warn so a silent
// disable is impossible (§feedback-loud-fail-open). Mirror of design-grounding
// parseGroundingMode. 'off' is the only disable and the caller warns on it.
function parseMergedVerifyMode(env) {
  const raw = env && env[ENV_MODE];
  if (raw === undefined || raw === null || raw === '') return 'enforce';
  const v = String(raw).trim().toLowerCase();
  if (MERGED_VERIFY_MODES.indexOf(v) !== -1) return v;
  process.stderr.write('[mccp:merged-verify] unknown ' + ENV_MODE + '="' +
    raw + '" — falling back to enforce\n');
  return 'enforce';
}

function asArray(v) {
  return Array.isArray(v) ? v.filter(function (x) { return x !== null && x !== undefined; }) : [];
}

function normFile(f) {
  return typeof f === 'string' ? f.replace(/\\/g, '/').trim() : '';
}

// buildVerifyFocus({ changedFiles, partitions, workerFindings, base }) → string.
//
// Assembles the focus text handed to `codex-invoke.js adversarial-review --focus`.
// The framing tells Codex to challenge the INTEGRATED result for cross-partition
// regressions the per-partition reviews cannot see — the whole, not each part.
// Pure: no fs, no spawn. Robust to missing inputs (all optional).
function buildVerifyFocus(input) {
  input = input || {};
  const changed = asArray(input.changedFiles).map(normFile).filter(Boolean);
  const partitions = asArray(input.partitions);
  const findings = asArray(input.workerFindings);
  const base = typeof input.base === 'string' && input.base.trim() ? input.base.trim() : 'HEAD';

  const lines = [];
  lines.push('Aggregate merged-diff adversarial verify (worker-external, pre-commit).');
  lines.push('The implement dispatch produced an integrated diff against base ' + base +
    (partitions.length > 1
      ? ' from ' + partitions.length + ' disjoint partitions.'
      : ' from a single worker.'));
  lines.push('');
  lines.push('Challenge the INTEGRATED result for cross-cut / whole-diff regressions that');
  lines.push('per-partition review and unit tests cannot see:');
  lines.push('- public API / exported-symbol drift across the merged files');
  lines.push('- import-graph breakage (one change removes/renames a symbol another imports)');
  lines.push('- shared config / manifest / schema divergence (versions, aliases, gate ids)');
  lines.push('- test-impact: does one change break behavior another change relies on');
  lines.push('- invariant erosion (fail-closed gates, receipt anchoring, rollback safety)');
  lines.push('');

  if (changed.length > 0) {
    lines.push('Changed files (' + changed.length + '):');
    changed.slice(0, 60).forEach(function (f) { lines.push('  - ' + f); });
    if (changed.length > 60) lines.push('  … +' + (changed.length - 60) + ' more');
  }

  if (partitions.length > 0) {
    lines.push('Partitions:');
    partitions.slice(0, 12).forEach(function (p, i) {
      const pf = asArray(p && p.files).map(normFile).filter(Boolean);
      lines.push('  [' + i + '] ' + (pf.length ? pf.join(', ') : '(no files)'));
    });
  }

  if (findings.length > 0) {
    lines.push('Worker-reported findings (secondary input):');
    findings.slice(0, 20).forEach(function (fd) {
      const t = (fd && (fd.title || fd.summary || fd.detail)) || String(fd);
      lines.push('  - ' + String(t).replace(/\s+/g, ' ').slice(0, 160));
    });
  }

  lines.push('');
  lines.push('Verdict on whether the WHOLE is sound. Answer converged (ship-safe) or');
  lines.push('divergent (a real cross-cut regression) — do not restate per-file review.');
  return lines.join('\n');
}

// deriveVerdictFromCodex(codexJson) → one of VERDICTS.
//
// codexJson is the `codex-invoke.js adversarial-review --json` output:
//   { classification, blocking, stdout, ... }
// Precedence:
//   - classification 'disabled'            → skipped   (MCCP_CODEX_DISABLED policy)
//   - classification !== 'ok' OR blocking  → unavailable (Codex failed/unreachable)
//   - stdout matches a CRITICAL category   → critical   (codex-bridge patterns)
//   - else parseVerdict(stdout)            → converged | divergent | unavailable
function deriveVerdictFromCodex(codexJson) {
  if (!codexJson || typeof codexJson !== 'object') return 'unavailable';
  const cls = typeof codexJson.classification === 'string' ? codexJson.classification : null;
  if (cls === 'disabled') return 'skipped';
  if ((cls && cls !== 'ok') || codexJson.blocking === true) return 'unavailable';
  const text = typeof codexJson.stdout === 'string' ? codexJson.stdout : '';
  if (bridge.detectCriticalCategory(text)) return 'critical';
  return bridge.parseVerdict(text); // converged | divergent | unavailable
}

// decideMergedVerify({ codexJson | verdict, mode, rounds, env }) →
//   { verdict, block, mode, rounds, reason }
//
// verdict resolution: an explicit input.verdict (a known enum) wins; else it is
// derived from codexJson. Block matrix (fail-closed on unavailable in enforce):
//   converged   → pass
//   divergent   → BLOCK (real cross-cut regression)
//   critical    → BLOCK (auto-CRITICAL category)
//   unavailable → BLOCK iff mode === 'enforce' (warn/off = advisory pass)
//   skipped     → pass (mode=off, Codex disabled, or nothing to verify)
// mode=off short-circuits to skipped BEFORE looking at any Codex outcome.
function decideMergedVerify(input) {
  input = input || {};
  const mode = MERGED_VERIFY_MODES.indexOf(input.mode) !== -1
    ? input.mode
    : parseMergedVerifyMode(input.env || process.env);

  const mk = function (verdict, block, reason, rounds) {
    return {
      verdict: verdict,
      block: block,
      mode: mode,
      rounds: (typeof rounds === 'number' && rounds >= 0) ? rounds
        : (verdict === 'skipped' ? 0 : 1),
      reason: reason || null,
    };
  };

  if (mode === 'off') {
    return mk('skipped', false, 'MCCP_WORK_MERGED_VERIFY=off (advisory disable)', 0);
  }

  let verdict;
  if (typeof input.verdict === 'string' && VERDICTS.indexOf(input.verdict) !== -1) {
    verdict = input.verdict;
  } else {
    verdict = deriveVerdictFromCodex(input.codexJson);
  }

  const rounds = (Number.isInteger(input.rounds) && input.rounds >= 0)
    ? input.rounds : undefined;

  switch (verdict) {
    case 'converged':
      return mk('converged', false, 'integrated diff ship-safe (cross-model)', rounds);
    case 'divergent':
      return mk('divergent', true, 'cross-cut regression — aggregate verify HALT', rounds);
    case 'critical':
      return mk('critical', true, 'auto-CRITICAL category in integrated diff — HALT', rounds);
    case 'unavailable':
      return mk('unavailable', mode === 'enforce',
        mode === 'enforce'
          ? 'Codex unavailable + enforce → fail-closed HALT'
          : 'Codex unavailable + ' + mode + ' → advisory pass', rounds);
    case 'skipped':
    default:
      return mk('skipped', false, 'verify skipped (Codex disabled / nothing to verify)', 0);
  }
}

module.exports = {
  MERGED_VERIFY_MODES: MERGED_VERIFY_MODES,
  VERDICTS: VERDICTS,
  ENV_MODE: ENV_MODE,
  parseMergedVerifyMode: parseMergedVerifyMode,
  buildVerifyFocus: buildVerifyFocus,
  deriveVerdictFromCodex: deriveVerdictFromCodex,
  decideMergedVerify: decideMergedVerify,
};
