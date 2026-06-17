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

function maskModel(model, repoRoot) {
  if (!model || typeof model !== 'object') return model;
  const cloned = JSON.parse(JSON.stringify(model));
  const root = repoRoot || cloned.repo_root || process.cwd();

  cloned.repo_root = REPO_PLACEHOLDER;
  cloned.masked = true;

  const s = cloned.sources || {};

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
  if (s.state && s.state.item) maskItem(s.state.item, root, ['path']);
  if (s.fix_task && s.fix_task.item) maskItem(s.fix_task.item, root, ['path']);
  if (s.pr && s.pr.item) {
    // origin_url + branch + head_sha are not paths; leave as-is.
    // owner/repo is identifying metadata but not path-typed; expose by default.
  }

  if (Array.isArray(cloned.correlations)) {
    for (const c of cloned.correlations) {
      if (c && c.from && c.from.id) c.from.id = maskPath(c.from.id, root);
      if (c && c.to && c.to.id) c.to.id = maskPath(c.to.id, root);
      if (Array.isArray(c.evidence)) {
        c.evidence = c.evidence.map(e => typeof e === 'string' ? e.replace(root, REPO_PLACEHOLDER) : e);
      }
    }
  }

  if (Array.isArray(cloned.warnings)) {
    cloned.warnings = cloned.warnings.map(w => {
      if (w && typeof w === 'object' && typeof w.message === 'string') {
        return Object.assign({}, w, { message: w.message.replace(root, REPO_PLACEHOLDER) });
      }
      return w;
    });
  }

  return cloned;
}

module.exports = {
  maskModel,
  maskPath,
  REPO_PLACEHOLDER,
};
