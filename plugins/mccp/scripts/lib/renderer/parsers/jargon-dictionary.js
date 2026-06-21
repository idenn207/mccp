'use strict';

const DICTIONARY = Object.freeze({
  // gate names
  'mccp-plan-codex': 'plan 단계 Codex 검토',
  'mccp-implement-codex': '구현 단계 Codex 검토',
  'mccp-pr-codex': 'PR 단계 Codex 검토',
  'mccp-code-review': '로컬 코드 리뷰',
  // env vars
  'MCCP_GATE_ROUND_CAP': 'gate 재실행 상한',
  'MCCP_RECEIPT_GATE_MODE': 'receipt 게이트 엄격도',
  'MCCP_AUTO_HANDOFF': '비용 임계 자동 핸드오프',
  'MCCP_BRIEFING': 'LLM briefing stamp 토글',
  'MCCP_PR_SKIP_CODEX_REVIEW': 'PR 단계 Codex skip(감사 가능)',
  'MCCP_CODEX_DISABLED': 'Codex 호출 영구 비활성',
  'MCCP_FORCE_PR_WITHOUT_IMPECCABLE': 'impeccable 미가용 우회(감사)',
  'MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER': 'security-reviewer 미가용 우회(감사)',
  'MCCP_RECEIPT_DEBUG': 'receipt 디버그 출력',
  'MCCP_SKIP_RECEIPT': 'receipt 일회성 우회',
  // commands
  '/mccp:plan': '구현 계획 작성 + Codex R1',
  '/mccp:plan-prd': '문제 정의 PRD 작성',
  '/mccp:prp-implement': '계획 실행 + 검증 루프',
  '/mccp:pr': 'GitHub PR 생성 + Codex R3',
  '/mccp:work': '단일 entry orchestrator',
  '/mccp:resume': '핸드오프 신호 복원',
  '/mccp:code-review': '로컬 변경 multi-perspective 검토',
  '/mccp:receipt-status': 'receipt chain 상태 조회',
  '/mccp:receipt-validate': 'receipt chain 유효성 검증',
  '/mccp:receipt-write': 'receipt 수동 작성',
  '/codex:rescue': 'Codex에 위임 (조사/수정)',
  '/codex:setup': 'Codex CLI 인증 확인',
  // concepts
  'fail-closed': '실패 시 차단',
  'fail-open': '실패 시 통과 + 경고',
  'dual-review': '서로 다른 모델 2개 합의',
  'cross-gate dedupe': '같은 결정 중복 검토 skip',
  'receipt chain': '게이트 receipt 연쇄 검증',
  'pr-phase lock': 'PR 검토 단계 write 차단',
  // file path 식별자
  'STATE.md': '세션 연속성 상태',
  'STATUS.md': '대시보드 markdown 산출',
});

// longer keys first — 짧은 key가 긴 key 안에 substring으로 들어있어도 longer 먼저 match
const SORTED_KEYS = Object.keys(DICTIONARY).sort((a, b) => b.length - a.length);

function expandJargon(text, opts) {
  opts = opts || {};
  const firstOccurrenceOnly = opts.firstOccurrenceOnly !== false;
  const seen = opts.seen instanceof Set ? opts.seen : new Set();
  const expansions = [];
  const out = String(text == null ? '' : text);
  for (const key of SORTED_KEYS) {
    if (firstOccurrenceOnly && seen.has(key)) continue;
    const idx = out.indexOf(key);
    if (idx === -1) continue;
    const span = [idx, idx + key.length];
    // overlap guard — 긴 key가 이미 차지한 영역 안 substring은 별개 expand 금지
    const overlaps = expansions.some(e => !(span[1] <= e.span[0] || span[0] >= e.span[1]));
    if (overlaps) continue;
    expansions.push({ token: key, korean: DICTIONARY[key], span });
    seen.add(key);
  }
  return { text: out, expansions };
}

function renderJargonHtml(text, opts, escapeHtml, escapeAttr) {
  const { text: raw, expansions } = expandJargon(text, opts);
  const escaped = escapeHtml(raw);
  if (expansions.length === 0) return escaped;
  // 긴 token 우선 + 단순 substring replace — escape 후 token이 손상되지 않은 경우만
  expansions.sort((a, b) => b.token.length - a.token.length);
  let html = escaped;
  for (const ex of expansions) {
    const escToken = escapeHtml(ex.token);
    const escKorean = escapeAttr(ex.korean);
    const wrapped = '<abbr title="' + escKorean + '">' + escToken + '</abbr>';
    const at = html.indexOf(escToken);
    if (at === -1) continue;
    html = html.slice(0, at) + wrapped + html.slice(at + escToken.length);
  }
  return html;
}

function renderJargonMarkdown(text, opts) {
  const { text: raw, expansions } = expandJargon(text, opts);
  if (expansions.length === 0) return raw;
  expansions.sort((a, b) => b.token.length - a.token.length);
  let md = raw;
  for (const ex of expansions) {
    const replacement = ex.token + ' (' + ex.korean + ')';
    const at = md.indexOf(ex.token);
    if (at === -1) continue;
    md = md.slice(0, at) + replacement + md.slice(at + ex.token.length);
  }
  return md;
}

module.exports = { DICTIONARY, expandJargon, renderJargonHtml, renderJargonMarkdown };
