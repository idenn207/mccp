'use strict';

// v1.18.0 M2 (Codex Plan-Codex F1 absorption) — single source of truth for
// per-decision gate state. status-grid (blocked count), pipeline (node markers
// + pipe-status text), and audit-timeline (is-bad node) all consume this so the
// "is this decision blocked?" judgment is computed once, time-ordered.
//
// The old heuristic was `converged === false` per receipt — that flagged a
// brand-new first-round plan (in progress) the same as an escalated divergent
// gate (genuinely stuck). This helper distinguishes them:
//
//   - A gate's latest receipt (created_at desc, round desc) decides its node.
//   - converged === true            → done
//   - converged !== true, round>=2  → blocked  (escalated past R1, divergent terminus)
//   - converged !== true, round<=1  → active   (first-round, in progress)
//   - no receipt                    → missing
//
// Decision-level state then derives from the nodes plus a time-order supersede
// guard: a blocked node only blocks the decision if no converged receipt is
// more recent than it (a later convergence clears a stale failure).
//
// Read-side only. No schema extension — uses gate_id|gate, converged, round,
// created_at, decision_id. Mirrors pipeline.js latest() picking exactly.

const STAGES = [
  { gate: 'mccp-plan-codex', short: 'plan' },
  { gate: 'mccp-implement-codex', short: 'impl' },
  { gate: 'mccp-pr-codex', short: 'pr' },
];

// Dashboard Truthfulness M6 Task 6 — terminal gate(=decision 종료 입증). pr-codex
// receipt 가 converged 면 그 decision 은 닫혔다(완료). 그 외 비-terminal 게이트의
// converged 는 "게이트 통과" 사실일 뿐 stage 완결(커밋/PR)이 아니다.
const TERMINAL_GATE_SET = new Set(['mccp-pr-codex']);

function gateOf(r) {
  return (r && (r.gate_id || r.gate)) || '';
}

function timeOf(r) {
  const t = r && r.created_at ? new Date(r.created_at).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

function roundOf(r) {
  const n = r && r.round;
  return Number.isFinite(n) ? n : (Number.isFinite(Number(n)) ? Number(n) : 0);
}

// Latest receipt for one gate bucket: created_at desc, round desc tiebreak.
function latest(receipts) {
  let best = null;
  for (const r of receipts) {
    if (!best) { best = r; continue; }
    const dt = timeOf(r) - timeOf(best);
    if (dt > 0 || (dt === 0 && roundOf(r) > roundOf(best))) best = r;
  }
  return best;
}

function nodeStatus(receipt) {
  if (!receipt) return 'missing';
  if (receipt.converged === true) return 'done';
  // Non-converged: escalated (round >= 2) reads as divergent/blocked; a first
  // round (round <= 1) is in-progress/active. Mirrors the timeline distinction
  // "수렴 R1" (active retry) vs "Codex R2 미수렴, 차단" (divergent).
  return roundOf(receipt) >= 2 ? 'blocked' : 'active';
}

// Build one decision's stage nodes + a decision-level state.
function buildDecisionState(decisionId, receipts) {
  const byGate = new Map();
  for (const r of receipts) {
    const g = gateOf(r);
    if (!byGate.has(g)) byGate.set(g, []);
    byGate.get(g).push(r);
  }
  const nodes = STAGES.map((stage) => {
    const picked = latest(byGate.get(stage.gate) || []);
    return {
      gate: stage.gate,
      short: stage.short,
      status: nodeStatus(picked),
      receipt: picked || null,
      time: picked ? timeOf(picked) : 0,
    };
  });

  // M6 Task 6 — receipt-only supersession. done-green('완료', ✓)는 stage 종료가
  // *입증된* converged 노드에만 준다: (a) downstream stage 에 receipt 가 존재(=다음
  // 게이트가 시작됨 → 이 stage 종료 입증)하거나 (b) decision 이 closed(terminal
  // pr-codex converged). 그 외 최신 converged 비-terminal frontier(downstream receipt
  // 無 + 미-closed)는 'done' 이 아니라 'converged-frontier' — "게이트 수렴·다음 대기".
  // 입력은 receipt 존재/converged/gate 뿐 (plan-status·매칭·liveness 미사용, Codex F2).
  const closed = nodes.some(
    (n) => TERMINAL_GATE_SET.has(n.gate) && n.receipt && n.receipt.converged === true);
  nodes.forEach((node, i) => {
    if (node.status !== 'done') return; // converged 노드만 (nodeStatus done = converged)
    if (TERMINAL_GATE_SET.has(node.gate)) return; // terminal converged = closed → done 유지
    const supersededByDownstream = nodes.slice(i + 1).some((n) => n.receipt);
    if (supersededByDownstream || closed) return; // 종료 입증 → done 유지
    node.status = 'converged-frontier';
  });

  const latestConvergedTime = receipts.reduce(
    (mx, r) => (r && r.converged === true ? Math.max(mx, timeOf(r)) : mx), 0);

  // Live block: a blocked node not superseded by a more recent convergence.
  const blockedNode = nodes.find(
    (n) => n.status === 'blocked' && n.time >= latestConvergedTime);

  let state;
  let activeStage = null;
  if (blockedNode) {
    state = 'blocked';
    activeStage = blockedNode.short;
  } else {
    const frontier = nodes.find((n) => n.status !== 'done');
    if (!frontier) {
      state = 'done';
    } else {
      state = 'active';
      activeStage = frontier.short;
    }
  }

  const lastTime = receipts.reduce((mx, r) => Math.max(mx, timeOf(r)), 0);
  return { decisionId, nodes, state, activeStage, lastTime };
}

// Group a flat receipt list by decision_id → Map<decisionId, decisionState>.
// Only receipts that map to a canonical gate stage participate.
function deriveDecisionState(receipts) {
  const items = (Array.isArray(receipts) ? receipts : [])
    .filter((r) => r && r.ok !== false && r.decision_id
      && STAGES.some((s) => s.gate === gateOf(r)));
  const byDecision = new Map();
  for (const r of items) {
    if (!byDecision.has(r.decision_id)) byDecision.set(r.decision_id, []);
    byDecision.get(r.decision_id).push(r);
  }
  const out = new Map();
  for (const [id, rs] of byDecision.entries()) {
    out.set(id, buildDecisionState(id, rs));
  }
  return out;
}

// Dashboard Truthfulness M5 (Codex Plan-F1 + Implement-F1) — terminal-gate
// receipts that signal a milestone is shipped/closed. mccp-pr-codex is the PR
// gate; code-reviewer is the alternate review terminus.
const TERMINAL_GATES = new Set(['mccp-pr-codex', 'code-reviewer']);
// Generic/legacy decision slugs never close a milestone — a v0.1-era `default`/
// `main` receipt must not be mistaken for a real per-plan convergence.
const GENERIC_DECISION_IDS = new Set(['default', 'main']);
const LEGACY_RECEIPT_RE = /\.legacy(?:-[\w.-]+)?\.json$/i;

// A milestone (PRD Delivery-Milestones row) is "closed" (auto-complete) when
// EITHER:
//   (a) a terminal-gate receipt converged with an EXACT decision_id match AND a
//       FRESH plan_hash — receipt.plan_hash === currentPlanHash, i.e. the plan
//       body has not changed since the gate. The freshness key is plan_hash,
//       NOT a non-existent is_stale flag (Implement-Codex F1): an edited plan
//       with the same decision_id keeps its old converged receipt, and without
//       the hash check that stale receipt would hide genuinely-reopened work.
//   (b) a completion-ledger entry matches (decision_id or plan_basename) with a
//       converged verdict. The ledger is git-tracked + durable, so it closes a
//       milestone even after `git worktree remove` deletes the live receipt
//       (the post-merge amnesia window).
// Fail-closed everywhere else: generic/legacy ids and *.legacy receipts never
// close; a null currentPlanHash disables path (a) but path (b) can still fire.
// Returns { closed, via } — never throws.
function isMilestoneClosed(opts) {
  opts = opts || {};
  const decisionId = opts.decisionId;
  const planBasename = opts.planBasename;
  const currentPlanHash = opts.currentPlanHash || null;
  const receipts = Array.isArray(opts.receipts) ? opts.receipts : [];
  const ledgerItems = Array.isArray(opts.ledgerItems) ? opts.ledgerItems : [];
  const hasRealDecision = !!decisionId && !GENERIC_DECISION_IDS.has(decisionId);

  // (a) terminal receipt — exact decision_id + fresh plan_hash.
  if (hasRealDecision && currentPlanHash) {
    for (const r of receipts) {
      if (!r || r.ok === false) continue;
      if (!TERMINAL_GATES.has(gateOf(r))) continue;
      if (r.converged !== true) continue;
      if (r.decision_id !== decisionId) continue;
      if (r.path && LEGACY_RECEIPT_RE.test(r.path)) continue;
      if (!r.plan_hash || r.plan_hash !== currentPlanHash) continue;
      return { closed: true, via: 'terminal-receipt' };
    }
  }

  // (b) completion-ledger — durable close (survives worktree removal).
  for (const e of ledgerItems) {
    if (!e) continue;
    const matchDecision = hasRealDecision && e.decision_id === decisionId;
    const matchBasename = !!planBasename && e.plan_basename === planBasename;
    if (!matchDecision && !matchBasename) continue;
    // Only a converged verdict closes — advisory/skipped gates did not finish.
    if (e.verdict && e.verdict !== 'converged') continue;
    return { closed: true, via: 'ledger' };
  }

  return { closed: false };
}

module.exports = {
  deriveDecisionState,
  buildDecisionState,
  nodeStatus,
  latest,
  gateOf,
  isMilestoneClosed,
  STAGES,
  TERMINAL_GATES,
};
