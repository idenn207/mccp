'use strict';

const path = require('path');

const REPO_PLACEHOLDER = '<repo>';

function toPosix(p) {
  return String(p).replace(/\\/g, '/');
}

function maskPath(absOrRel, repoRoot) {
  if (typeof absOrRel !== 'string' || absOrRel.length === 0) return absOrRel;
  if (absOrRel === REPO_PLACEHOLDER) return absOrRel;
  if (path.isAbsolute(absOrRel)) {
    const rel = path.relative(repoRoot, absOrRel);
    if (!rel || rel.startsWith('..')) return absOrRel;
    return toPosix(rel);
  }
  return toPosix(absOrRel);
}

function maskItem(item, repoRoot, pathKeys) {
  if (!item || typeof item !== 'object') return item;
  for (const k of pathKeys) {
    if (Object.prototype.hasOwnProperty.call(item, k) && typeof item[k] === 'string' && item[k].length > 0) {
      item[k] = maskPath(item[k], repoRoot);
    }
  }
  return item;
}

// v1.3.0-m4 — secret pattern catalogue (Task 5).
// Codex Plan-Codex R1 F2 absorption: maskSecrets runs unconditionally,
// including --raw output. The --raw flag only bypasses path normalization;
// secret redaction is mandatory in all output paths.
//
// Patterns tuned for length (≥20 chars after prefix) to limit false-positive
// over-matches. Each match becomes `[REDACTED:<kind>]`. The renderer's
// verdict step 1.5 (Task 7) consumes the `mask_hits` aggregate for the
// secret-suspect red banner; severe kinds (sk-key, aws-key,
// private-key-block) fire the banner, Bearer/password= mask quietly.
const SECRET_PATTERNS = [
  {
    kind: 'sk-key',
    re: /sk-[A-Za-z0-9_-]{20,}/g,
    severe: true,
  },
  {
    kind: 'aws-key',
    re: /AKIA[0-9A-Z]{16}/g,
    severe: true,
  },
  {
    kind: 'bearer',
    re: /Bearer\s+[A-Za-z0-9._~+/=-]{20,}/g,
    severe: false,
  },
  {
    kind: 'password-eq',
    re: /password\s*=\s*['"]?[^\s'"]{8,}['"]?/gi,
    severe: false,
  },
  {
    kind: 'private-key-block',
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    severe: true,
  },
];

const SEVERE_KINDS = SECRET_PATTERNS
  .filter(p => p.severe)
  .map(p => p.kind);

function isSevereKind(kind) {
  return SEVERE_KINDS.indexOf(kind) !== -1;
}

// maskSecrets(text, opts) → { masked, hits }
//
// Pure regex replacement. opts.fieldName / opts.sourceId / opts.sourceKind
// are propagated through to each hit so the renderer can attribute.
function maskSecrets(text, opts) {
  opts = opts || {};
  if (typeof text !== 'string' || text.length === 0) {
    return { masked: text, hits: [] };
  }
  let out = text;
  const hits = [];
  for (const p of SECRET_PATTERNS) {
    let count = 0;
    out = out.replace(p.re, function () {
      count += 1;
      return '[REDACTED:' + p.kind + ']';
    });
    if (count > 0) {
      hits.push({
        kind: p.kind,
        count: count,
        severe: !!p.severe,
        field: opts.fieldName || null,
        source_id: opts.sourceId || null,
        source_kind: opts.sourceKind || null,
      });
    }
  }
  return { masked: out, hits: hits };
}

// applySecretMask(model) — F2 absorption. Runs unconditionally, including in
// --raw mode. Scans receipt briefing_summary in place; envelopes are already
// scanned at source-scan time (envelopes.js emits masked_payload_signal +
// drops raw payload strings — F3 absorption). Aggregates all hits onto
// model.mask_hits (additive — does not exist before this call).
function applySecretMask(model) {
  if (!model || typeof model !== 'object') return model;
  if (!Array.isArray(model.mask_hits)) model.mask_hits = [];
  const s = model.sources || {};

  if (s.receipts && Array.isArray(s.receipts.items)) {
    for (const item of s.receipts.items) {
      if (!item || typeof item !== 'object') continue;
      if (typeof item.briefing_summary === 'string' && item.briefing_summary.length > 0) {
        const result = maskSecrets(item.briefing_summary, {
          fieldName: 'briefing_summary',
          sourceId: item.decision_id || null,
          sourceKind: 'receipt',
        });
        if (result.hits.length > 0) {
          item.briefing_summary = result.masked;
          for (const h of result.hits) model.mask_hits.push(h);
        }
      }
    }
  }

  if (s.envelopes && Array.isArray(s.envelopes.items)) {
    for (const item of s.envelopes.items) {
      if (!item || typeof item !== 'object') continue;
      const signal = item.masked_payload_signal;
      if (signal && Array.isArray(signal.hits) && signal.hits.length > 0) {
        for (const h of signal.hits) {
          model.mask_hits.push(Object.assign({
            field: h.field || null,
            source_id: item.dispatch_id || null,
            source_kind: 'envelope',
          }, h));
        }
      }
    }
  }

  return model;
}

// applyPathMask(model, repoRoot) — split out of the previous monolithic
// maskModel. Same semantics as before; raw mode bypasses this layer.
function applyPathMask(model, repoRoot) {
  if (!model || typeof model !== 'object') return model;
  const root = repoRoot || model.repo_root || process.cwd();

  model.repo_root = REPO_PLACEHOLDER;
  model.masked = true;

  const s = model.sources || {};

  if (s.plans && Array.isArray(s.plans.items)) {
    for (const it of s.plans.items) maskItem(it, root, ['path']);
  }
  if (s.receipts && Array.isArray(s.receipts.items)) {
    for (const it of s.receipts.items) maskItem(it, root, ['path', 'cwd']);
  }
  if (s.envelopes && Array.isArray(s.envelopes.items)) {
    for (const it of s.envelopes.items) {
      maskItem(it, root, ['path', 'heartbeat_path', 'parent_cwd']);
    }
  }
  if (s.state && s.state.item) {
    maskItem(s.state.item, root, ['path']);
    // v1.5.0-m1 — session-ledger surface privacy. cwd is path-normalized;
    // host is redacted to a placeholder because hostnames can identify the
    // operator's machine. git_branch / project_id / session_id stay raw
    // (branches are public-ish, project_id is a 12-char sha, session_id is
    // a transient UUID).
    if (Array.isArray(s.state.item.active_session_ledgers)) {
      for (const led of s.state.item.active_session_ledgers) {
        maskItem(led, root, ['cwd']);
        if (led && typeof led.host === 'string' && led.host.length > 0) {
          led.host = '<host>';
        }
      }
    }
  }
  if (s.fix_task && s.fix_task.item) maskItem(s.fix_task.item, root, ['path']);

  if (Array.isArray(model.correlations)) {
    for (const c of model.correlations) {
      if (c && c.from && c.from.id) c.from.id = maskPath(c.from.id, root);
      if (c && c.to && c.to.id) c.to.id = maskPath(c.to.id, root);
      if (Array.isArray(c.evidence)) {
        c.evidence = c.evidence.map(e => typeof e === 'string' ? e.replace(root, REPO_PLACEHOLDER) : e);
      }
    }
  }

  if (Array.isArray(model.warnings)) {
    model.warnings = model.warnings.map(w => {
      if (w && typeof w === 'object' && typeof w.message === 'string') {
        return Object.assign({}, w, { message: w.message.replace(root, REPO_PLACEHOLDER) });
      }
      return w;
    });
  }

  return model;
}

// maskModel — backward-compat facade. Applies BOTH secret mask and path mask.
// derive/index.js no longer calls this; it calls applySecretMask + applyPathMask
// separately so --raw can bypass path mask while keeping secret mask in place.
function maskModel(model, repoRoot) {
  if (!model || typeof model !== 'object') return model;
  const cloned = JSON.parse(JSON.stringify(model));
  const root = repoRoot || cloned.repo_root || process.cwd();
  applySecretMask(cloned);
  applyPathMask(cloned, root);
  return cloned;
}

module.exports = {
  maskModel,
  maskPath,
  maskSecrets,
  applySecretMask,
  applyPathMask,
  isSevereKind,
  SECRET_PATTERNS: SECRET_PATTERNS,
  SEVERE_KINDS: SEVERE_KINDS.slice(),
  REPO_PLACEHOLDER,
};
