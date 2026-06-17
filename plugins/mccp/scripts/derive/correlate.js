'use strict';

const path = require('path');
const { planAwareMarkdownHash } = require('../receipt/hash');

const ENVELOPE_PATH_RE = /\.claude[\\/]state[\\/]dispatches[\\/]([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.envelope\.json/i;

const FIX_TASK_TRIGGER_EVENTS = new Set(['plan_conflict_escalated', 'receipt_write']);

function buildPlanHashIndex(repoRoot, planItems) {
  const idx = new Map();
  for (const p of planItems || []) {
    if (!p || !p.path || p.error) continue;
    const abs = path.join(repoRoot, p.path);
    try {
      const h = planAwareMarkdownHash(abs);
      idx.set(h, p);
    } catch (_e) {
      // unreadable plan — skip, but don't poison the index
    }
  }
  return idx;
}

function buildEnvelopeIndex(envelopeItems) {
  const byDispatchId = new Map();
  const byPath = new Map();
  for (const e of envelopeItems || []) {
    if (!e || e.ok === false) continue;
    if (e.dispatch_id) byDispatchId.set(e.dispatch_id, e);
    if (e.path) byPath.set(e.path.replace(/\\/g, '/'), e);
  }
  return { byDispatchId, byPath };
}

function correlateReceiptToEnvelope(receipt, envIdx, warnings) {
  if (!receipt.controller_context_marker_present) return null;
  const ipcPath = receipt.ipc_envelope_path;
  if (!ipcPath || typeof ipcPath !== 'string') {
    warnings.push('receipt ' + receipt.path + ': controller_context_marker_present but ipc_envelope_path missing');
    return null;
  }
  const pathMatch = ipcPath.match(ENVELOPE_PATH_RE);
  if (!pathMatch) {
    warnings.push('receipt ' + receipt.path + ': ipc_envelope_path does not match envelope path pattern');
    return null;
  }
  const pathUuid = pathMatch[1].toLowerCase();
  if (receipt.worker_dispatch_id !== pathUuid) {
    warnings.push('receipt ' + receipt.path + ': axis (b) fail — worker_dispatch_id != UUID in ipc_envelope_path');
    return null;
  }
  const lookupKey = ipcPath.replace(/\\/g, '/');
  const env = envIdx.byPath.get(lookupKey) || envIdx.byDispatchId.get(pathUuid);
  if (!env) {
    warnings.push('receipt ' + receipt.path + ': axis (c) fail — envelope file not present at ipc_envelope_path');
    return null;
  }
  if ((env.dispatch_id || '').toLowerCase() !== pathUuid) {
    warnings.push('receipt ' + receipt.path + ': axis (c) fail — envelope.dispatch_id != UUID from ipc_envelope_path');
    return null;
  }
  if (receipt.dispatched_by_controller_session_id !== env.controller_session_id) {
    warnings.push('receipt ' + receipt.path + ': axis (d) fail — dispatched_by_controller_session_id != envelope.controller_session_id');
    return null;
  }
  return {
    kind: 'receipt-attributed-to-envelope',
    from: { kind: 'receipt', id: receipt.path },
    to: { kind: 'envelope', id: env.dispatch_id },
    link_via: '4-axis equality',
    evidence: [
      'ipc_envelope_path UUID == worker_dispatch_id',
      'envelope.dispatch_id == worker_dispatch_id',
      'envelope.controller_session_id == receipt.dispatched_by_controller_session_id (' + env.controller_session_id + ')',
      'envelope file present at ' + env.path,
    ],
  };
}

function correlate(model) {
  const out = [];
  const warnings = [];
  if (!model || !model.sources) return out;

  const repoRoot = model.repo_root || process.cwd();
  const planItems = (model.sources.plans && model.sources.plans.items) || [];
  const receiptItems = (model.sources.receipts && model.sources.receipts.items) || [];
  const envelopeItems = (model.sources.envelopes && model.sources.envelopes.items) || [];
  const stateItem = model.sources.state && model.sources.state.item;
  const fixTaskItem = model.sources.fix_task && model.sources.fix_task.item;
  const backlogItems = (model.sources.backlog && model.sources.backlog.items) || [];

  const envIdx = buildEnvelopeIndex(envelopeItems);

  // Kind 1: receipt ↔ envelope (4-axis equality)
  for (const r of receiptItems) {
    if (!r || r.ok === false) continue;
    const link = correlateReceiptToEnvelope(r, envIdx, warnings);
    if (link) out.push(link);
  }

  // Kind 2: state ↔ envelope (controller layer)
  if (stateItem && stateItem.frontmatter && stateItem.frontmatter.controller_session_id) {
    const sid = stateItem.frontmatter.controller_session_id;
    for (const e of envelopeItems) {
      if (!e || e.ok === false) continue;
      if (e.controller_session_id === sid) {
        out.push({
          kind: 'state-controller-tracks-envelope',
          from: { kind: 'state', id: stateItem.path },
          to: { kind: 'envelope', id: e.dispatch_id },
          link_via: 'controller_session_id',
          evidence: [
            'state.frontmatter.controller_session_id == envelope.controller_session_id (' + sid + ')',
          ],
        });
      }
    }
  }

  // Kind 3: state ↔ envelope (resume layer)
  if (stateItem && stateItem.frontmatter && stateItem.frontmatter.dispatch_id) {
    const did = stateItem.frontmatter.dispatch_id;
    const env = envIdx.byDispatchId.get(did);
    if (env) {
      out.push({
        kind: 'state-resume-tracks-envelope',
        from: { kind: 'state', id: stateItem.path },
        to: { kind: 'envelope', id: env.dispatch_id },
        link_via: 'dispatch_id',
        evidence: [
          'state.frontmatter.dispatch_id == envelope.dispatch_id (' + did + ')',
        ],
      });
    }
  }

  // Kind 4: receipt ↔ plan (plan_hash) — Codex F1 absorption: one-pass index
  const planHashIdx = buildPlanHashIndex(repoRoot, planItems);
  for (const r of receiptItems) {
    if (!r || r.ok === false || !r.plan_hash) continue;
    const plan = planHashIdx.get(r.plan_hash);
    if (plan) {
      out.push({
        kind: 'receipt-anchored-to-plan',
        from: { kind: 'receipt', id: r.path },
        to: { kind: 'plan', id: plan.path },
        link_via: 'plan_hash',
        evidence: [
          'sha256 of canonicalized plan markdown matches receipt.plan_hash',
          'one-pass hash index',
          'plan path: ' + plan.path,
        ],
      });
    } else {
      warnings.push('receipt ' + r.path + ': plan_hash ' + r.plan_hash.slice(0, 18) +
        '… does not match any current plan (plan may have been edited or archived)');
    }
  }

  // Kind 5: backlog ↔ plan (source_plan path)
  const planPathSet = new Map();
  for (const p of planItems) {
    if (p && p.path) planPathSet.set(p.path.replace(/\\/g, '/'), p);
  }
  for (const b of backlogItems) {
    if (!b || !b.source_plan) continue;
    const needle = b.source_plan.replace(/\\/g, '/');
    let match = null;
    for (const [k, v] of planPathSet.entries()) {
      if (k.indexOf(needle) !== -1 || needle.indexOf(k) !== -1) { match = v; break; }
    }
    if (match) {
      out.push({
        kind: 'backlog-row-anchored-to-plan',
        from: { kind: 'backlog', id: b.date + '|' + b.severity },
        to: { kind: 'plan', id: match.path },
        link_via: 'source_plan substring',
        evidence: [
          'backlog.source_plan = ' + b.source_plan,
          'matched plan: ' + match.path,
        ],
      });
    }
  }

  // Kind 6: fix-task ↔ STATE.md (event)
  if (fixTaskItem && stateItem && stateItem.frontmatter) {
    const lastEvent = stateItem.frontmatter.last_event;
    if (FIX_TASK_TRIGGER_EVENTS.has(lastEvent)) {
      out.push({
        kind: 'fix-task-anchored-to-state-event',
        from: { kind: 'fix_task', id: fixTaskItem.path },
        to: { kind: 'state', id: stateItem.path },
        link_via: 'last_event',
        evidence: [
          'state.frontmatter.last_event = ' + lastEvent,
          'fix-task.verdict = ' + (fixTaskItem.verdict || '(unset)'),
        ],
      });
    }
  }

  if (warnings.length > 0 && Array.isArray(model.warnings)) {
    for (const w of warnings) model.warnings.push({ severity: 'low', source: 'correlate', message: w });
  }

  return out;
}

module.exports = {
  correlate,
  ENVELOPE_PATH_RE,
  _buildPlanHashIndex: buildPlanHashIndex,
  _buildEnvelopeIndex: buildEnvelopeIndex,
};
