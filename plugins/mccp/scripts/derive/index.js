'use strict';

const fs = require('fs');
const path = require('path');

const { emptyModel } = require('./model');
const { probeM0SchemaContract } = require('./capability');
const { correlate } = require('./correlate');
const { applySecretMask, applyPathMask } = require('./mask');

const { scanPlans } = require('./sources/plans');
const { scanReceipts } = require('./sources/receipts');
const { scanState } = require('./sources/state');
const { scanBacklog } = require('./sources/backlog');
const { scanFixTask } = require('./sources/fix-task');
const { scanPR } = require('./sources/pr');
const { scanEnvelopes } = require('./sources/envelopes');
const { scanLedger } = require('./sources/ledger');

const SOURCE_SCANNERS = {
  plans: (root, opts) => scanPlans(root, opts),
  receipts: (root) => scanReceipts(root),
  state: (root) => scanState(root),
  backlog: (root) => scanBacklog(root),
  fix_task: (root) => scanFixTask(root),
  pr: (root) => scanPR(root),
  envelopes: (root) => scanEnvelopes(root),
  ledger: (root) => scanLedger(root),
};

function pushWarning(model, severity, source, message) {
  model.warnings.push({ severity, source, message });
}

function derive(repoRoot, opts) {
  if (typeof repoRoot !== 'string' || repoRoot.length === 0) {
    throw new TypeError('derive(repoRoot, opts): repoRoot must be a non-empty string');
  }
  opts = opts || {};
  const root = path.resolve(repoRoot);
  const skipSet = new Set(Array.isArray(opts.skipSources) ? opts.skipSources : []);

  const model = emptyModel(root);
  model.masked = false; // unmasked while building; masking applied at end unless --raw

  const claudeDir = path.join(root, '.claude');
  const claudePresent = fs.existsSync(claudeDir);

  // Capability probe (M0 schema contract)
  try {
    model.m0_capability = probeM0SchemaContract();
    if (model.m0_capability.contract_present === false) {
      pushWarning(model, 'critical', 'capability', model.m0_capability.evidence);
    }
  } catch (err) {
    model.m0_capability = { contract_present: false, evidence: 'capability probe threw: ' + err.message };
    pushWarning(model, 'critical', 'capability', model.m0_capability.evidence);
  }

  if (!claudePresent) {
    if (opts.strict) pushWarning(model, 'low', 'derive', 'no .claude/ directory at ' + root);
    model.derived_at = new Date().toISOString();
    applySecretMask(model);
    if (opts.raw === true) {
      model.masked = false;
      return model;
    }
    applyPathMask(model, root);
    return model;
  }

  for (const [name, scan] of Object.entries(SOURCE_SCANNERS)) {
    if (skipSet.has(name)) continue;
    try {
      const result = scan(root, opts);
      if (result && typeof result === 'object') {
        model.sources[name] = Object.assign({}, model.sources[name], result);
        if (result.warning) pushWarning(model, 'low', name, result.warning);
        if (result.degraded) {
          pushWarning(model, 'medium', name,
            'source ' + name + ' degraded: invalid_count=' + (result.invalid_count || 0));
        }
      }
    } catch (err) {
      pushWarning(model, 'medium', name, 'source ' + name + ' threw: ' + err.message);
      const s = model.sources[name];
      if (s) { s.ok = false; s.error = err.message; }
    }
  }

  try {
    model.correlations = correlate(model);
  } catch (err) {
    pushWarning(model, 'medium', 'correlate', 'correlate threw: ' + err.message);
  }

  // v1.3.0-m4 — M4 last-render meta surface. Read .claude/cache/.last-render.json
  // (graceful — missing file is normal on first ever render). Audit-timeline
  // section consumes was_stale; verdict step 1.5 consumes mask_hits.
  try {
    const lastRenderPath = path.join(root, '.claude', 'cache', '.last-render.json');
    if (fs.existsSync(lastRenderPath)) {
      const raw = fs.readFileSync(lastRenderPath, 'utf8');
      model.last_render_meta = JSON.parse(raw);
    } else {
      model.last_render_meta = null;
    }
  } catch (err) {
    process.stderr.write('[mccp:derive] last-render meta parse failed: '
      + (err && err.message) + ' (allow)\n');
    model.last_render_meta = null;
  }

  model.derived_at = new Date().toISOString();

  // v1.3.0-m4 — secret masking is mandatory in all output paths, including
  // --raw. The --raw flag only bypasses path normalization. (Codex Plan-Codex
  // R1 F2 absorption: secrets in envelope payload / briefing_summary must
  // never reach raw output.)
  applySecretMask(model);

  if (opts.raw === true) {
    model.masked = false;
    return model;
  }
  applyPathMask(model, root);
  return model;
}

module.exports = {
  derive,
};
