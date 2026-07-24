'use strict';

// durable-evidence-substrate Phase A · Task A1 — evidence audit tool.
//
// E1 (감사 맹점): 두 세션이 같은 감사를 돌려 정반대 결론에 도달했다 — 한쪽은
// 대조할 receipt가 아예 없어서 "모순 없음"을 결함 부재로 보고했다. 이 도구는
// coverage를 정직하게 만든다: 대조 대상이 없으면(comparable === 0) 절대
// 'ok'/'clean'을 반환하지 않고 state='blind' + CLI 비영점 exit를 낸다. 이 한
// 규칙이 E1이 만든 결함의 정확한 반대다.
//
// 조인 규약 (2026-07-22 실측): 1차 키는 entry.decision_id. ledger는 판정 필드가
// `entry` 하위에 중첩돼 있어 최상위 조인은 조용히 comparable=0을 낸다. RAW ledger
// 파일을 쓴다(decision-dedup된 readLedger 뷰가 아님) — 같은 decision을 N번 재-PR한
// 경우 N개 ledger 파일이 각각 대조 대상이다. entry.receipt_hash ↔
// receipt.receipt_hash 결속은 hash_bound로 **별도 보고**한다: 결속이 끊기면 감사
// 체인이 끊긴 것이므로 침묵하지 않는다(E4).
//
// read-only · LLM-free · fs + child_process(git) 외 의존 없음.
//
// State precedence ladder (durable-evidence-substrate Phase A follow-up · F2).
// The tool green-lit the exact inconsistencies it exists to expose: `state`
// collapsed to 'ok'/exit 0 for ANY comparable pair once parsing succeeded, so a
// false_positive (ledger says converged, receipt says divergent) or a broken
// hash binding still exited 0. F2 graduates the ladder — evaluated most-severe
// first, each state maps to a distinct CLI exit code (STATE_EXIT_CODES):
//
//   degraded     (exit 1) — hard source read error (a failure, NOT proven
//                           absence) OR parse_failures>0 (soft, from-parse).
//   blind        (exit 2) — comparable===0 with no hard read error. Absence is
//                           NEVER "no defect" (E1). ABSOLUTE when it holds.
//   inconsistent (exit 3) — false_positive>0 (ledger↔receipt verdict disagree,
//                           E2) OR hash_bound<comparable (a JOINED pair whose
//                           receipt_hash binding is broken, E4). A real
//                           integrity violation.
//   incomplete   (exit 4) — unverifiable>0 (ledger entry with no matching ship
//                           receipt = coverage gap). Softer than inconsistent
//                           but still non-ok.
//   ok           (exit 0) — every comparable pair agrees and is bound; nothing
//                           unverifiable.
//
// Ordering when several hold: a hard-read-error 'degraded' and 'blind' dominate
// (a dead source / total absence beats everything), then 'inconsistent'
// OUTRANKS 'incomplete' OUTRANKS 'degraded'-from-parse. So a corpus with both a
// false_positive and unverifiable entries reports 'inconsistent' (most-severe);
// one with unverifiable entries plus a stray parse failure reports 'incomplete'
// (a coverage gap outranks a soft parse hiccup once the integrity axis is clean).
// NOTE: exit-number is NOT a severity rank — inconsistent(3) is MORE severe than
// incomplete(4); the ladder order below, not the numbers, encodes precedence.
// On today's corpus this correctly reports a NON-ok state (19 pre-existing
// dangling ledger entries → unverifiable → 'incomplete'); that is the tool
// working as intended, not a regression (repairing the 19 is a separate axis).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { receiptHash } = require('../receipt/hash');
const { validate: validateReceiptSchema } = require('./../receipt/schema');

// state → CLI exit code. Unknown state → 1 (nonzero, fail-closed): a state the
// ladder did not produce must never masquerade as a clean exit 0.
const STATE_EXIT_CODES = Object.freeze({
  ok: 0,
  degraded: 1,
  blind: 2,
  inconsistent: 3,
  incomplete: 4,
});

function exitCodeForState(state) {
  const code = STATE_EXIT_CODES[state];
  return typeof code === 'number' ? code : 1;
}

const LEDGER_SUBDIR = path.join('.claude', 'state', 'completion-ledger');
const SHIP_RECEIPT_SUBDIR = path.join('.claude', 'receipts', 'mccp-pr-codex');

function warn(line) {
  process.stderr.write('[mccp:evidence-audit] ' + line + '\n');
}

// Read RAW ledger entries (one {entry} per file, NO decision-dedup — a decision
// re-PR'd N times has N ledger files and all N are audited). Mirrors derive
// per-source `degraded`: a directory that exists but cannot be enumerated is a
// read_error; a per-file parse miss increments parse_failures but keeps going.
function readRawLedger(root) {
  const dir = path.join(root, LEDGER_SUBDIR);
  const out = { entries: [], read_error: false, parse_failures: 0 };
  if (!fs.existsSync(dir)) return out;
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (_err) {
    out.read_error = true;
    return out;
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      const entry = parsed && parsed.entry;
      if (entry && typeof entry.decision_id === 'string' && entry.decision_id.length > 0) {
        out.entries.push(entry);
      } else {
        out.parse_failures += 1;
      }
    } catch (_err) {
      out.parse_failures += 1;
    }
  }
  return out;
}

// Index ship receipts (mccp-pr-codex) by decision_id.
function readShipReceipts(root) {
  const dir = path.join(root, SHIP_RECEIPT_SUBDIR);
  const out = { byDecision: {}, read_error: false, parse_failures: 0 };
  if (!fs.existsSync(dir)) return out;
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (_err) {
    out.read_error = true;
    return out;
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      if (j && typeof j.decision_id === 'string' && j.decision_id.length > 0) {
        out.byDecision[j.decision_id] = j;
      } else {
        out.parse_failures += 1;
      }
    } catch (_err) {
      out.parse_failures += 1;
    }
  }
  return out;
}

// The ship receipt's honest verdict lives in resolution.codex_verdict (v1.20.3 —
// resolution.converged is always-true and NOT trustworthy). null when absent.
function receiptVerdict(receipt) {
  const res = receipt && receipt.resolution;
  return res && typeof res.codex_verdict === 'string' ? res.codex_verdict : null;
}

// Task 3 / R5-F2 — a receipt's DECLARED receipt_hash must be a recomputation of
// its canonical body AND the body must be schema-valid. A declared-hash string
// that equals the ledger's stored hash is NECESSARY for a binding but NOT
// sufficient: an attacker who flips an audited field and leaves the stale hash
// (which the ledger also stored) would otherwise count as bound. This is the
// read-side mirror of evidence-stage-guard.validateContent (same receiptHash fn).
function receiptIntegrityOk(receipt) {
  if (!receipt || typeof receipt.receipt_hash !== 'string' || receipt.receipt_hash.length === 0) {
    return false;
  }
  let recomputed;
  try {
    recomputed = receiptHash(receipt);
  } catch (_e) {
    return false;
  }
  if (recomputed !== receipt.receipt_hash) return false;
  return validateReceiptSchema(receipt).ok;
}

// F2 / Implement-Codex IF1 — TOTAL ledger↔receipt agreement check. Pre-F2 the
// audit only verified agreement when the LEDGER verdict was 'converged'; a
// comparable hash-bound pair with an 'advisory'/'skipped' ledger verdict fell
// through to 'ok'/exit 0 without ANY corroboration, so a stale or tampered
// ledger could hide an integrity disagreement by moving out of 'converged'.
// This makes the check total: every comparable pair MUST be positively
// corroborated. The ledger verdict ∈ {converged, advisory, skipped} (store.js
// derives it from meta: advisory→advisory, skipped→skipped, else converged); the
// receipt's codex_verdict ∈ {converged, divergent, critical, unavailable,
// skipped} or null (absent). A null receipt verdict corroborates NOTHING → never
// agrees. Any disagreement is a false_positive → 'inconsistent'.
function verdictsAgree(ledgerVerdict, receiptCodexVerdict) {
  if (receiptCodexVerdict === null || receiptCodexVerdict === undefined) return false;
  switch (ledgerVerdict) {
    case 'converged': return receiptCodexVerdict === 'converged';
    case 'skipped':   return receiptCodexVerdict === 'skipped';
    case 'advisory':  return receiptCodexVerdict === 'unavailable';
    default:          return false; // unknown ledger verdict → cannot corroborate
  }
}

// audit(opts) — ledger↔receipt 대조 + coverage 정직 보고 + 해시 결속 검증.
//   opts.repoRoot  대상 트리 (default: process.cwd())
// returns { state, comparable, ok, false_positive, unverifiable, hash_bound,
//           coverage, ledger_count, ship_receipt_count, degraded, read_error,
//           parse_failures, repo_root }
function audit(opts) {
  opts = opts || {};
  const root = opts.repoRoot || process.cwd();

  const ledger = readRawLedger(root);
  const ships = readShipReceipts(root);

  let comparable = 0;
  let ok = 0;
  let falsePositive = 0;
  let unverifiable = 0;
  let hashBound = 0;

  for (const entry of ledger.entries) {
    const receipt = ships.byDecision[entry.decision_id];
    if (!receipt) {
      unverifiable += 1;
      continue;
    }
    comparable += 1;
    const cv = receiptVerdict(receipt);
    // TOTAL agreement (IF1): every comparable pair must be positively
    // corroborated — a non-'converged' ledger verdict is NO LONGER a silent
    // pass. ok + false_positive === comparable always, so 'ok' state requires
    // ok === comparable (every pair agrees). A disagreement is E2.
    if (verdictsAgree(entry.verdict, cv)) ok += 1;
    else falsePositive += 1;
    // binding: entry.receipt_hash must point at the receipt on disk (E4) AND the
    // receipt body must recompute to that hash + be schema-valid (Task 3 / R5-F2).
    // A declared-hash match alone is necessary but NOT sufficient — a tampered body
    // carrying a stale-but-ledger-matching hash must NOT count as bound; the
    // shortfall (hash_bound < comparable) promotes state to 'inconsistent'.
    if (entry.receipt_hash && receipt.receipt_hash
        && entry.receipt_hash === receipt.receipt_hash
        && receiptIntegrityOk(receipt)) {
      hashBound += 1;
    }
  }

  const ledgerCount = ledger.entries.length;
  const coverage = ledgerCount > 0 ? comparable / ledgerCount : 0;

  const hardReadError = ledger.read_error || ships.read_error;
  const parseFailures = ledger.parse_failures + ships.parse_failures;
  const degraded = hardReadError || parseFailures > 0;

  // state precedence ladder (F2) — see the header comment for the full rationale.
  // Evaluated most-severe-first; each arm maps to a distinct exit code. 'blind'
  // stays ABSOLUTE when comparable===0 and no hard read error (E1: never call
  // absence "ok"/"clean"). The two NEW arms — 'inconsistent' (verdict
  // disagreement OR broken binding) and 'incomplete' (coverage gap) — are the
  // integrity violations F2 exists to stop exiting 0.
  let state;
  if (hardReadError) state = 'degraded';
  else if (comparable === 0) state = 'blind';
  else if (falsePositive > 0 || hashBound < comparable) state = 'inconsistent';
  else if (unverifiable > 0) state = 'incomplete';
  else if (parseFailures > 0) state = 'degraded';
  else state = 'ok';

  return {
    state: state,
    comparable: comparable,
    ok: ok,
    false_positive: falsePositive,
    unverifiable: unverifiable,
    hash_bound: hashBound,
    coverage: coverage,
    ledger_count: ledgerCount,
    ship_receipt_count: Object.keys(ships.byDecision).length,
    degraded: degraded,
    read_error: hardReadError,
    parse_failures: parseFailures,
    repo_root: root,
  };
}

function renderHuman(r) {
  const lines = [
    '── evidence audit (' + r.repo_root + ') ──',
    'state           : ' + r.state,
    'ledger entries  : ' + r.ledger_count + ' (raw files, no dedup)',
    'ship receipts   : ' + r.ship_receipt_count,
    'comparable      : ' + r.comparable,
    '  ok            : ' + r.ok,
    '  false_positive: ' + r.false_positive,
    'unverifiable    : ' + r.unverifiable + ' (ledger entry, no matching ship receipt)',
    'hash_bound      : ' + r.hash_bound + ' / ' + r.comparable + ' (entry.receipt_hash ↔ receipt.receipt_hash)',
    'coverage        : ' + (Math.round(r.coverage * 1000) / 1000),
  ];
  if (r.degraded) lines.push('degraded        : read_error=' + r.read_error + ' parse_failures=' + r.parse_failures);
  return lines.join('\n');
}

function printUsage() {
  const lines = [
    'Usage: evidence-audit [--json] [--repo-root <path>]',
    '',
    '  ledger↔receipt 대조 감사. comparable===0 이면 state="blind" + 비영점 exit.',
    '',
    '  --json              구조화 출력',
    '  --repo-root <path>  대상 트리 (default: git rev-parse --show-toplevel)',
  ];
  process.stdout.write(lines.join('\n') + '\n');
}

module.exports = {
  audit: audit,
  readRawLedger: readRawLedger,
  readShipReceipts: readShipReceipts,
  receiptVerdict: receiptVerdict,
  receiptIntegrityOk: receiptIntegrityOk,
  verdictsAgree: verdictsAgree,
  renderHuman: renderHuman,
  exitCodeForState: exitCodeForState,
  STATE_EXIT_CODES: STATE_EXIT_CODES,
};

// ── require.main CLI ──────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  let asJson = false;
  let repoRoot = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') {
      asJson = true;
    } else if (a === '--repo-root') {
      repoRoot = args[i + 1];
      i++;
      if (!repoRoot) { warn('--repo-root requires a path argument'); process.exit(2); }
    } else if (a === '-h' || a === '--help') {
      printUsage();
      process.exit(0);
    } else {
      warn('unknown argument "' + a + '" (ignored — loud fail-open).');
    }
  }
  if (!repoRoot) {
    try {
      repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch (_err) {
      repoRoot = process.cwd();
    }
  }

  const result = audit({ repoRoot: repoRoot });
  if (asJson) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else process.stdout.write(renderHuman(result) + '\n');

  // Per-state loud stderr line, then exit via the state→code map. Every non-ok
  // state exits nonzero (F2): the tool must not green-light the inconsistencies
  // it exists to expose.
  switch (result.state) {
    case 'blind':
      warn('BLIND — comparable=0 (no ledger↔receipt pair to audit). Absence is NOT "no defect" (E1).');
      break;
    case 'inconsistent':
      warn('INCONSISTENT — integrity violation: false_positive=' + result.false_positive
        + ' hash_bound=' + result.hash_bound + '/' + result.comparable
        + ' (ledger↔receipt verdict disagreement (E2) or broken hash binding (E4)).');
      break;
    case 'incomplete':
      warn('INCOMPLETE — coverage gap: unverifiable=' + result.unverifiable
        + ' ledger entr' + (result.unverifiable === 1 ? 'y has' : 'ies have')
        + ' no matching ship receipt.');
      break;
    case 'degraded':
      warn('DEGRADED — a source failed to read fully'
        + ' (read_error=' + result.read_error + ' parse_failures=' + result.parse_failures + ').');
      break;
    default:
      break; // ok — exit 0
  }
  process.exit(exitCodeForState(result.state));
}
