'use strict';

// Dashboard Truthfulness M1 — derive `ledger` count-source. Read-only surface
// over the git-tracked completion-ledger directory. The store already validates
// + dedups (by decision_id, latest completed_at) and is loud fail-open, so this
// scanner is a thin projection into the count-source shape
// { ok, count, items, invalid_count, degraded, error }. Secret/path masking is
// the derive mask layer's concern (applied at end of derive()).

const { readLedger } = require('../../lib/completion-ledger/store');

function scanLedger(repoRoot) {
  let result;
  try {
    result = readLedger(repoRoot);
  } catch (err) {
    return {
      ok: false, count: 0, items: [], invalid_count: 0, degraded: false,
      error: err && err.message ? err.message : String(err),
    };
  }
  if (!result || result.ok === false) {
    return {
      ok: false,
      count: 0,
      items: [],
      invalid_count: (result && result.invalid_count) || 0,
      degraded: false,
      error: (result && result.error) || 'readLedger returned not-ok',
    };
  }
  const items = result.entries || [];
  return {
    ok: true,
    count: items.length,
    items: items,
    invalid_count: result.invalid_count || 0,
    degraded: !!result.degraded,
    error: null,
  };
}

module.exports = {
  scanLedger,
};
