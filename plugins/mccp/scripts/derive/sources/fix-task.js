'use strict';

const path = require('path');
const fixTask = require('../../state/fix-task');

function scanFixTask(repoRoot) {
  const raw = fixTask.read(repoRoot);
  if (raw === null) {
    return { ok: true, item: null, degraded: false, error: null };
  }
  const parsed = fixTask.parseFixTaskMd(raw);
  if (parsed === null) {
    return {
      ok: false,
      item: null,
      degraded: true,
      error: 'fix-task frontmatter unparseable',
    };
  }
  const fm = parsed.fm || {};
  const body = parsed.body || '';
  const nowIso = new Date().toISOString();
  const expired = !!(fm.expires_at && fm.expires_at < nowIso);
  const item = {
    schema_version: fm.schema_version,
    created_at: fm.created_at,
    expires_at: fm.expires_at,
    counter: fm.counter,
    verdict: fm.verdict,
    originating_receipts: Array.isArray(fm.originating_receipts) ? fm.originating_receipts : [],
    body,
    body_hash: fixTask.bodyHash(body),
    path: path.relative(repoRoot, fixTask.fixTaskPath(repoRoot)),
    expired,
  };
  return { ok: true, item, degraded: false, error: null };
}

module.exports = {
  scanFixTask,
};
