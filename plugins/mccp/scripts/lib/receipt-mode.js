'use strict';

// Plan v0.2.2 Task 4 — MCCP_RECEIPT_GATE_MODE resolver.
//
// Modes (default = 'hard' per R2#3 commitment — chain-of-custody must hold):
//   'hard' — current behavior. Missing/stale receipts block via hooks + validate-cmd.
//   'soft' — opt-in. Missing receipts get a skipped-soft placeholder written immediately,
//            blocking=true, downstream validator treats as non-approving. Operator can
//            switch back to 'hard' without breaking the chain.
//   'off'  — debugging only. Hook bypasses entirely with loud stderr warning.

const VALID_MODES = new Set(['hard', 'soft', 'off']);
const DEFAULT_MODE = 'hard';

function resolveMode(env) {
  env = env || process.env;
  const raw = env.MCCP_RECEIPT_GATE_MODE;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_MODE;
  }
  const normalized = String(raw).trim().toLowerCase();
  if (VALID_MODES.has(normalized)) return normalized;
  // Unknown mode → safe default + stderr warning
  process.stderr.write(
    '[mccp-receipt-mode] unknown MCCP_RECEIPT_GATE_MODE=' + JSON.stringify(raw) +
    '; falling back to "' + DEFAULT_MODE + '"\n'
  );
  return DEFAULT_MODE;
}

function warnIfOff(mode, contextLabel) {
  if (mode !== 'off') return;
  process.stderr.write(
    '[mccp-receipt-mode] WARNING: MCCP_RECEIPT_GATE_MODE=off — receipt gate bypassed' +
    (contextLabel ? ' (' + contextLabel + ')' : '') +
    '. This mode is for personal debugging only; chain-of-custody is broken.\n'
  );
}

module.exports = {
  resolveMode: resolveMode,
  warnIfOff: warnIfOff,
  VALID_MODES: VALID_MODES,
  DEFAULT_MODE: DEFAULT_MODE,
};
