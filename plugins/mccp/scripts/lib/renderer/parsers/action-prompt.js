'use strict';

const RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, '': 0 };

function rank(s) {
  return RANK[String(s == null ? '' : s).toUpperCase()] || 0;
}

function maxRank(a, b) {
  return rank(a) >= rank(b) ? a : b;
}

function quoteArg(s) {
  // PowerShell + Bash 양쪽 호환 — 안 쪽 " escape only
  return '"' + String(s == null ? '' : s).replace(/"/g, '\\"') + '"';
}

function truncateText(s, n) {
  const t = String(s == null ? '' : s).trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + '…';
}

function buildActionPrompt(item, kind) {
  const ARG_CAP = 200;
  if (kind === 'risk') {
    const r = item || {};
    const sev = maxRank(r.impact, r.likelihood);
    const sevUp = String(sev == null ? '' : sev).toUpperCase();
    const risk = truncateText(r.risk, ARG_CAP);
    const mit = truncateText(r.mitigation, ARG_CAP);
    const arg = '리스크 완화: ' + risk + (mit ? ' — 제안 mitigation: ' + mit : '');
    return {
      command: '/codex:rescue',
      args: quoteArg(arg),
      fullText: '/codex:rescue ' + quoteArg(arg),
      severity: sevUp || 'UNKNOWN',
    };
  }
  // openQuestion default
  const o = item || {};
  const sev = String(o.severity == null ? '' : o.severity).toUpperCase();
  const text = truncateText(o.text, ARG_CAP);
  let cmd;
  if (sev === 'CRITICAL' || sev === 'HIGH') cmd = '/codex:rescue';
  else if (sev === 'MEDIUM') cmd = '/mccp:plan';
  else cmd = '/mccp:plan-prd';
  return {
    command: cmd,
    args: quoteArg(text),
    fullText: cmd + ' ' + quoteArg(text),
    severity: sev || 'UNKNOWN',
  };
}

module.exports = { buildActionPrompt, rank, maxRank, RANK };
