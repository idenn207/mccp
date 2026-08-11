'use strict';

// intent-claims — codex-intent-context M1.5의 오심(mislabelling) 탐지 오라클.
//
// M1은 누락을 닫았다: 모든 finding이 명시 판정을 받아야 receipt가 써진다. 그러나
// 저자가 전부 `intent_conflict:'none'`으로 찍으면 커버리지 검사는 통과하므로 M1은
// 오심을 보지 못한다. M1.5는 리뷰어에게 per-finding `INTENT:` 계약을 부과하고
// 리뷰어 주장과 저자 판정을 **비대칭 대조**해, 리뷰어가 지목한 id를 저자가 지목하지
// 않은 finding에 명시 응답을 강제한다.
//
// 순수성: fs / process / clock 없음 (intent-context.js 미러). 모든 I/O는 runner 소유.
//
// 계약 채널이 자유 텍스트인 이유는 companion의 finding 스키마가 **외부 plugin 소유**라
// 필드를 추가할 수 없기 때문이다(UI5). 자유 텍스트를 판정 채널로 쓰는 이상 위조·오인은
// 파싱 규칙의 정밀도로 막는 것이 아니라 **모호성을 전부 `unclaimed`로 접어서** 막는다.

const MAX_CLAIM_SCAN_CHARS = 64 * 1024;

// DD1 — 라인 선두 앵커만 인정한다. 산문 중간의 "UI3" 언급은 구조적으로 매칭 불가.
// 선행 공백 0~3칸은 허용하되(마크다운 목록 안의 정상 주장), 4칸 이상은 아래
// stripIndentedCode가 코드 블록으로 걷어낸다 — 마크다운의 코드 블록 임계와 같다.
const CLAIM_ANCHOR_RE = /^[ \t]*INTENT:[ \t]*(\S.*)$/gm;

const CLAIM_ID_RE = /^UI\d+$/;

// 스캔 대상 필드. title+body+recommendation을 "\n" 하나로 이어붙인 **단일 텍스트**를
// 본다 — 필드별 독립 주장을 허용하면 "정확히 1건" 규칙이 성립하지 않는다.
const SCAN_FIELDS = ['title', 'body', 'recommendation'];

const CLAIM_STATUS = ['claimed', 'unclaimed'];

// DD3 — 6분류. blocking 규칙은 단 하나다: "리뷰어가 지목한 id를 저자가 지목하지 않았다".
const CLASSIFICATIONS = [
  'agree-none',
  'agree-conflict',
  'id-mismatch',
  'reviewer-only',
  'author-only',
  'unclaimed',
];

// 명시 응답(라벨 정정 또는 dispute)이 필요한 분류. author-only는 포함하지 않는다 —
// 저자가 사용자에 더 가까우므로 과다 라벨은 안전 방향이다.
const NEEDS_RESPONSE = ['reviewer-only', 'id-mismatch'];

const COMPLIANCE_VALUES = ['full', 'partial', 'absent'];

// ---------------------------------------------------------------------------
// 인용 구조 제거 (DD1)
// ---------------------------------------------------------------------------
//
// stripper는 완전할 수 없고, **그래서 1차 통제가 아니다**. 놓친 인용이 *추가* 매칭을
// 만들면 "정확히 1건" 규칙이 그 finding을 `unclaimed`로 접어 fail-closed로 끝난다.
// stripper가 실제로 막는 유일한 케이스는 진짜 주장이 없는 finding에 인용문 1건만
// 살아남아 **거짓 주장**이 되는 것이고, 아래 4단계는 그 표면을 좁힌다.
//
// 과다 제거는 안전한 방향이다: 진짜 주장을 지우면 0건 → `unclaimed` → fail-closed.

// HTML 블록은 여러 줄에 걸치므로 라인 스캐너보다 먼저 통째로 걷어낸다.
const HTML_BLOCK_RE =
  /<(pre|code|blockquote)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

function stripHtmlBlocks(text) {
  // 개행으로 치환해 라인 구조를 보존한다 — 앞뒤 줄이 이어붙어 없던 앵커가
  // 생기는 일을 막는다.
  return text.replace(HTML_BLOCK_RE, '\n');
}

const FENCE_OPEN_RE = /^[ ]{0,3}(`{3,}|~{3,})/;
const BLOCKQUOTE_RE = /^[ ]{0,3}>/;
const INDENTED_CODE_RE = /^(?: {4,}|\t)/;

// 백틱/틸드 fence · blockquote · 4칸 들여쓰기 코드 블록을 라인 단위로 제거한다.
// fence는 상태 기계로 처리한다 — 여는 fence와 **같은 문자**의 같거나 더 긴 fence만
// 닫는 것으로 인정하며, 닫히지 않은 fence는 문서 끝까지 삼킨다(마크다운 동작).
function stripQuotedStructures(text) {
  const lines = stripHtmlBlocks(text).split('\n');
  const out = [];
  let fenceChar = null;
  let fenceLen = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (fenceChar) {
      const close = line.match(FENCE_OPEN_RE);
      if (close && close[1][0] === fenceChar && close[1].length >= fenceLen) {
        fenceChar = null;
        fenceLen = 0;
      }
      out.push('');
      continue;
    }

    const open = line.match(FENCE_OPEN_RE);
    if (open) {
      fenceChar = open[1][0];
      fenceLen = open[1].length;
      out.push('');
      continue;
    }

    if (BLOCKQUOTE_RE.test(line) || INDENTED_CODE_RE.test(line)) {
      out.push('');
      continue;
    }

    out.push(line);
  }

  return out.join('\n');
}

// ---------------------------------------------------------------------------
// 리뷰어 주장 파싱
// ---------------------------------------------------------------------------

function joinScanText(finding) {
  const f = (finding && typeof finding === 'object') ? finding : {};
  const parts = [];
  for (let i = 0; i < SCAN_FIELDS.length; i++) {
    const v = f[SCAN_FIELDS[i]];
    // parseReviewPayload는 finding 필드의 **형태를 보장하지 않는다**
    // (codex-review-payload.js:48-59). 비문자열·부재는 빈 문자열로 강제한다 —
    // String(v)로 강제하면 객체가 "[object Object]"가 되어 없던 텍스트가 생긴다.
    parts.push(typeof v === 'string' ? v : '');
  }
  return parts.join('\n');
}

function collectAnchors(text) {
  const re = new RegExp(CLAIM_ANCHOR_RE.source, 'gm');
  const found = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    found.push(m[1].trim());
    if (found.length > 2) break; // 2건 초과는 이미 unclaimed — 더 셀 이유가 없다
  }
  return found;
}

function knownIds(sectionItems) {
  const set = Object.create(null);
  const items = Array.isArray(sectionItems) ? sectionItems : [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const id = it && typeof it === 'object' ? it.id : it;
    if (typeof id === 'string' && id) set[id] = true;
  }
  return set;
}

function classifyToken(rawToken, ids) {
  const token = String(rawToken == null ? '' : rawToken).trim();
  if (!token) return { status: 'unclaimed', claim: null, reason: 'empty-token' };
  if (token === 'none') return { status: 'claimed', claim: 'none', reason: null };
  // 콤마 목록은 주장으로 세지 않는다. 저자 라벨 `intent_conflict`가 단일 문자열이라
  // (intent-context.js:617-623) 집합 대 스칼라 비교를 정의해야 하는데, 그 복잡도는
  // M1.5가 사는 값이 아니다.
  if (/[,;]/.test(token)) return { status: 'unclaimed', claim: null, reason: 'comma-list' };
  if (!CLAIM_ID_RE.test(token)) return { status: 'unclaimed', claim: null, reason: 'bad-token' };
  // 섹션에 없는 id(dangling)는 `unclaimed`. 토큰만 폐기하면 폐기 = 주장 소멸이므로
  // `none`으로 접히고, 그러면 탐지가 **조용히 꺼진다**.
  if (!ids[token]) return { status: 'unclaimed', claim: null, reason: 'unknown-id' };
  return { status: 'claimed', claim: token, reason: null };
}

// parseReviewerClaims({ findings, sectionItems }) → { total, claimed, unclaimed, claims }
//
// 유일한 입력은 호출자가 **메모리에 들고 있는** findings다(DD2). 이 모듈에는 디스크를
// 읽는 경로가 존재하지 않는다.
function parseReviewerClaims(opts) {
  const o = opts || {};
  const findings = Array.isArray(o.findings) ? o.findings : [];
  const ids = knownIds(o.sectionItems);
  const claims = [];
  let claimed = 0;

  for (let i = 0; i < findings.length; i++) {
    const text = joinScanText(findings[i]);
    let entry;

    if (text.length > MAX_CLAIM_SCAN_CHARS) {
      // 상한 위반은 예외가 아니라 verdict다 (intent-context.js의 원칙 미러).
      entry = { status: 'unclaimed', claim: null, reason: 'text-too-large' };
    } else {
      const anchors = collectAnchors(stripQuotedStructures(text));
      if (anchors.length === 0) {
        entry = { status: 'unclaimed', claim: null, reason: 'no-anchor' };
      } else if (anchors.length !== 1) {
        // 2건 이상이면 어느 것이 진짜인지 알 수 없다. 첫 줄을 고르지 **않는다**.
        entry = { status: 'unclaimed', claim: null, reason: 'multiple-anchors' };
      } else {
        entry = classifyToken(anchors[0], ids);
      }
    }

    if (entry.status === 'claimed') claimed += 1;
    claims.push({
      finding_index: i,
      status: entry.status,
      claim: entry.claim,
      reason: entry.reason,
    });
  }

  return {
    total: findings.length,
    claimed: claimed,
    unclaimed: findings.length - claimed,
    claims: claims,
  };
}

// ---------------------------------------------------------------------------
// 비대칭 대조 (DD3)
// ---------------------------------------------------------------------------

function indexAdjudications(adjudications) {
  const byIndex = Object.create(null);
  const items = Array.isArray(adjudications) ? adjudications : [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || typeof it !== 'object') continue;
    if (!Number.isInteger(it.finding_index)) continue;
    byIndex[it.finding_index] = it;
  }
  return byIndex;
}

function authorConflictOf(item) {
  if (!item) return null;
  const c = item.intent_conflict;
  return typeof c === 'string' && c ? c : null;
}

function classifyPair(reviewerClaim, authorConflict) {
  if (reviewerClaim === null) return 'unclaimed';
  const authorSaysNone = authorConflict === 'none' || authorConflict === null;
  if (reviewerClaim === 'none') return authorSaysNone ? 'agree-none' : 'author-only';
  if (authorSaysNone) return 'reviewer-only';
  // 초안은 여기서 id 불일치까지 통과시켰다. 그러면 M1.5는 conflict-vs-none만
  // 탐지하면서 "라벨 비대칭을 탐지한다"고 주장하게 된다.
  return reviewerClaim === authorConflict ? 'agree-conflict' : 'id-mismatch';
}

// compliance는 **계측값**이고 판정은 이분법이다(DD5). `partial`을 통과시키면 20건 중
// 1건만 주장해도 게이트가 "탐지 축이 작동했다"와 구분 없이 통과한다 — M1의 구멍을
// 리뷰어 쪽으로 옮긴 것에 지나지 않는다. 임의 임계(80% 등) 대신 이분법을 택한 이유는
// 방어할 근거 없는 숫자를 만들지 않기 위해서다.
function deriveCompliance(total, claimed) {
  if (total === 0) return 'absent';
  if (claimed === total) return 'full';
  return claimed === 0 ? 'absent' : 'partial';
}

// compareIntentClaims({ claims, adjudications }) → 분류 + 집계 + compliance
//
// `claims`는 parseReviewerClaims의 반환값(또는 그 `.claims` 배열)을 받는다.
function compareIntentClaims(opts) {
  const o = opts || {};
  const parsed = Array.isArray(o.claims) ? { claims: o.claims } : (o.claims || {});
  const claims = Array.isArray(parsed.claims) ? parsed.claims : [];
  const byIndex = indexAdjudications(o.adjudications);

  const counts = {
    total: claims.length,
    claimed: 0,
    unclaimed: 0,
    agree_none: 0,
    agree_conflict: 0,
    id_mismatch: 0,
    reviewer_only: 0,
    author_only: 0,
    reviewer_conflict: 0,
    author_conflict: 0,
  };
  const entries = [];
  const needsResponse = [];

  for (let i = 0; i < claims.length; i++) {
    const c = claims[i] || {};
    const idx = Number.isInteger(c.finding_index) ? c.finding_index : i;
    const reviewerClaim = c.status === 'claimed' ? c.claim : null;
    const item = byIndex[idx] || null;
    const authorConflict = authorConflictOf(item);
    const classification = classifyPair(reviewerClaim, authorConflict);

    if (reviewerClaim === null) counts.unclaimed += 1;
    else counts.claimed += 1;
    if (reviewerClaim && reviewerClaim !== 'none') counts.reviewer_conflict += 1;
    if (authorConflict && authorConflict !== 'none') counts.author_conflict += 1;

    switch (classification) {
      case 'agree-none': counts.agree_none += 1; break;
      case 'agree-conflict': counts.agree_conflict += 1; break;
      case 'id-mismatch': counts.id_mismatch += 1; break;
      case 'reviewer-only': counts.reviewer_only += 1; break;
      case 'author-only': counts.author_only += 1; break;
      default: break; // 'unclaimed'는 counts.unclaimed가 이미 센다
    }

    const disputeReason = item && typeof item.intent_dispute_reason === 'string'
      ? item.intent_dispute_reason : null;

    const entry = {
      finding_index: idx,
      classification: classification,
      reviewer_claim: reviewerClaim,
      author_conflict: authorConflict,
      dispute_reason: disputeReason,
      unclaimed_reason: reviewerClaim === null ? (c.reason || null) : null,
    };
    entries.push(entry);
    if (NEEDS_RESPONSE.indexOf(classification) !== -1) needsResponse.push(entry);
  }

  return {
    compliance: deriveCompliance(counts.total, counts.claimed),
    counts: counts,
    entries: entries,
    needsResponse: needsResponse,
  };
}

// 합계 불변식. 6분류는 finding 하나당 정확히 하나이므로 분할(partition)이고,
// reviewer_conflict / author_conflict는 그 분할과 교차하는 별개 계측이라 합계에
// 들어가지 않는다. schema가 같은 식을 검증한다(Task 7).
function claimCountsInvariantOk(counts) {
  if (!counts || typeof counts !== 'object') return false;
  const keys = [
    'total', 'claimed', 'unclaimed', 'agree_none', 'agree_conflict',
    'id_mismatch', 'reviewer_only', 'author_only',
    'reviewer_conflict', 'author_conflict',
  ];
  for (let i = 0; i < keys.length; i++) {
    const v = counts[keys[i]];
    if (!Number.isInteger(v) || v < 0) return false;
  }
  if (counts.claimed + counts.unclaimed !== counts.total) return false;
  const partition = counts.agree_none + counts.agree_conflict + counts.id_mismatch
    + counts.reviewer_only + counts.author_only + counts.unclaimed;
  return partition === counts.total;
}

module.exports = {
  MAX_CLAIM_SCAN_CHARS: MAX_CLAIM_SCAN_CHARS,
  CLAIM_ANCHOR_RE: CLAIM_ANCHOR_RE,
  CLAIM_STATUS: CLAIM_STATUS,
  CLASSIFICATIONS: CLASSIFICATIONS,
  NEEDS_RESPONSE: NEEDS_RESPONSE,
  COMPLIANCE_VALUES: COMPLIANCE_VALUES,
  stripQuotedStructures: stripQuotedStructures,
  parseReviewerClaims: parseReviewerClaims,
  compareIntentClaims: compareIntentClaims,
  claimCountsInvariantOk: claimCountsInvariantOk,
};
