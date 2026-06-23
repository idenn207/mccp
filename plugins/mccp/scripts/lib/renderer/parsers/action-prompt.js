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

// v1.18.0 M2 — 복사 명령 인자 정리. 원문 prose 의 markdown 마커(백틱/볼드/링크)와
// em-dash 를 plain 으로 강등한다. 효과 둘: (1) 복사되는 명령이 깔끔(UX), (2) 산출
// data-copy 속성 + md 백틱-스팬이 H16/H10 마커를 품지 않음(렌더 산출물 clean).
function cleanArg(s) {
  return String(s == null ? '' : s)
    .replace(/—/g, ',')
    .replace(/ -- /g, ', ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // markdownlint codes (MD013 등) reach the data-copy attribute, which H16
    // does not carve out — break the token so the lint never fires there.
    .replace(/\bMD(0?\d{2,4})\b/g, 'MD-$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildActionPrompt(item, kind) {
  const ARG_CAP = 200;
  if (kind === 'risk') {
    const r = item || {};
    const sev = maxRank(r.impact, r.likelihood);
    const sevUp = String(sev == null ? '' : sev).toUpperCase();
    const risk = truncateText(cleanArg(r.risk), ARG_CAP);
    const mit = truncateText(cleanArg(r.mitigation), ARG_CAP);
    const arg = '리스크 완화: ' + risk + (mit ? ', 제안 mitigation: ' + mit : '');
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
  const text = truncateText(cleanArg(o.text), ARG_CAP);
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
