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

module.exports = {
  deriveDecisionState,
  buildDecisionState,
  nodeStatus,
  latest,
  gateOf,
  STAGES,
};
