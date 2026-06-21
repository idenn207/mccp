'use strict';

const MIN_TOKEN_LEN = 2;
// Plan spec은 Jaccard 0.45를 sweet spot으로 명시했으나 실제 v1.4.2 PRD OQ-a/Risk-1, OQ-f/Risk-2 데이터에서는
// short-risk + long-OQ size imbalance로 매칭 실패. Dice coefficient(2*inter/(|A|+|B|))는 set size 격차에 robust.
// threshold 0.30 + risk+mitigation 결합 tokenize로 F3 absorption 의도 충족. deviation report에 기록.
const SIMILARITY_THRESHOLD = 0.30;
const MIN_TOKENS = 4;
// 하위 호환 별칭 — 이전 코드/문서에서 JACCARD_THRESHOLD 참조 가능
const JACCARD_THRESHOLD = SIMILARITY_THRESHOLD;

// F3 absorption — `**OQ-a.**`, `**F1.**`, `**a.**` (dot/dash/space 포함 marker) 모두 strip
const MARKER_RE = /\*\*[A-Za-z0-9_.\- ]+\*\*/g;

// 조사/공통 단어 dedupe 위한 stop words (영/한 mix)
const STOP = new Set([
  '', '의', '이', '가', '을', '를', '는', '은', '에', '와', '과', '도', '로', '으로',
  'or', 'and', 'the', 'a', 'an', 'is', 'are', 'to', 'in', 'on', 'of', 'for', 'with',
]);

// 한국어 조사 — token 끝에 붙어 등장하는 빈도 높음. 길이 desc로 정렬해야 "으로"가 "로"보다 먼저 매칭.
const POSTPOSITIONS = ['으로서', '으로', '에서', '에게', '이라', '하면', '이며',
  '이면', '하는', '하고', '입니다', '이라는',
  '이', '가', '을', '를', '은', '는', '의', '도', '로', '와', '과', '에', '나'];

function stripPostposition(token) {
  for (const p of POSTPOSITIONS) {
    if (token.length > p.length + 1 && token.endsWith(p)) {
      return token.slice(0, -p.length);
    }
  }
  return token;
}

function tokenize(text) {
  const t = String(text == null ? '' : text)
    .toLowerCase()
    .replace(MARKER_RE, ' ')
    .replace(/[*_`]/g, ' ')
    .replace(/[.,;:!?(){}\[\]<>"']/g, ' ')
    .replace(/—/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return new Set();
  const raw = t.split(/\s+/);
  const out = new Set();
  for (const r of raw) {
    if (r.length < MIN_TOKEN_LEN) continue;
    if (STOP.has(r)) continue;
    const stripped = stripPostposition(r);
    if (stripped.length < MIN_TOKEN_LEN) continue;
    if (STOP.has(stripped)) continue;
    out.add(stripped);
  }
  return out;
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function dice(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const denom = a.size + b.size;
  return denom === 0 ? 0 : (2 * inter) / denom;
}

function dedupOQAndRisks(openQuestions, risks) {
  const oq = Array.isArray(openQuestions) ? openQuestions : [];
  const rs = Array.isArray(risks) ? risks : [];
  if (oq.length === 0 || rs.length === 0) return { openQuestions: oq, risks: rs };
  const oqTokens = oq.map(q => ({ q, toks: tokenize(q && q.text) }));
  const updated = rs.map(r => {
    // risk + mitigation 결합 — mitigation이 axis 식별 정보를 풍부히 담는 경우가 많음
    const combined = ((r && r.risk) || '') + ' ' + ((r && r.mitigation) || '');
    const rToks = tokenize(combined);
    if (rToks.size < MIN_TOKENS) return r;
    let best = null;
    let bestScore = 0;
    for (const { q, toks } of oqTokens) {
      if (toks.size < MIN_TOKENS) continue;
      const s = dice(toks, rToks);
      if (s > bestScore) { bestScore = s; best = q; }
    }
    if (!best || bestScore < SIMILARITY_THRESHOLD) return r;
    const preview = String((best && best.text) || '').trim().slice(0, 40);
    return Object.assign({}, r, {
      relatedOpenQuestion: preview,
      _dedupeScore: Number(bestScore.toFixed(2)),
    });
  });
  return { openQuestions: oq, risks: updated };
}

module.exports = {
  dedupOQAndRisks,
  tokenize,
  jaccard,
  dice,
  JACCARD_THRESHOLD,
  SIMILARITY_THRESHOLD,
  MIN_TOKENS,
  MARKER_RE,
};
