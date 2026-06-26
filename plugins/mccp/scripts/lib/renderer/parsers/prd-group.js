'use strict';

// Dashboard Data Exploration M1 — PRD-수준 그룹핑 순수 헬퍼.
// risks/open-questions 의 active 항목을 소속 PRD별 버킷으로 분배한다.
// 부수효과 없는 순수 함수, dep-free. plan-body.js 의 planPrd 맵 빌드와
// `canonicalPlanPath` 를 공유한다(circular dep 회피 — plan-body 가 이 모듈을 require).

const GLOBAL_KEY = '__global__';
const UNKNOWN_KEY = '__unknown__';
const GLOBAL_LABEL = '프로젝트 전역';
const UNKNOWN_LABEL = '출처 미상';

// plan path → repo-root-relative + forward-slash 정규화. **basename 아님**:
// archive/worktree 간 동명 plan 충돌 회피(Codex F2). plan-body.js 가 planPrd 를
// 이 함수로 키잉하고, groupByPrd 가 item.source 를 같은 함수로 정규화해 조회한다.
// (risks/OQ 항목은 source: p.path 를 그대로 들고 오므로 동일 입력 → 동일 키.)
function canonicalPlanPath(p) {
  if (p == null) return '';
  let s = String(p).trim();
  if (!s) return '';
  s = s.replace(/\\/g, '/');      // 윈도우 separator 정규화
  s = s.replace(/^\.\//, '');     // leading ./ 제거
  s = s.replace(/\/{2,}/g, '/');  // 중복 slash 축약
  return s;
}

// 라벨/경로 → HTML attribute-safe slug. prdKey 는 plan-body 가 normalized prdPath
// 에서 파생하므로 본 함수는 그 파생 1군데(plan-body)와 fallback 버킷 식별에 쓰인다.
function prdSlug(label) {
  return String(label == null ? '' : label)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'prd';
}

// items: risk/OQ 객체 배열(각 .source 보유). planPrd: Map(canonicalPlanPath →
// { prdPath, prdLabel, prdKey }). 반환: 결정적 순서의 [{ prdKey, prdLabel, items }].
//   - source === 'STATE.md' 또는 부재 → __global__ "프로젝트 전역"
//   - source 가 plan path 이나 planPrd 미등록(source_prd 없음·PRD unreadable) → __unknown__ "출처 미상"
//   - 그 외 → 매핑된 PRD 그룹(prdKey = prdPath 파생 안정 식별자, 라벨 slug 아님)
// fail-open: planPrd 가 Map 아님(null/undefined)·빈 입력은 단일 fallback 그룹
// (항목 누락 0 — 조용한 오귀속보다 단일 그룹이 truthfulness 측면에서 안전).
function groupByPrd(items, planPrd) {
  const list = Array.isArray(items) ? items : [];
  if (!(planPrd instanceof Map)) {
    return list.length
      ? [{ prdKey: GLOBAL_KEY, prdLabel: GLOBAL_LABEL, items: list.slice() }]
      : [];
  }

  const buckets = new Map(); // prdKey → { prdKey, prdLabel, items }
  function bucketFor(key, label) {
    if (!buckets.has(key)) buckets.set(key, { prdKey: key, prdLabel: label, items: [] });
    return buckets.get(key);
  }

  for (const item of list) {
    const src = item && item.source;
    let key;
    let label;
    if (!src || src === 'STATE.md') {
      key = GLOBAL_KEY;
      label = GLOBAL_LABEL;
    } else {
      const entry = planPrd.get(canonicalPlanPath(src));
      if (entry && entry.prdKey) {
        key = entry.prdKey;
        label = entry.prdLabel || entry.prdKey;
      } else {
        key = UNKNOWN_KEY;
        label = UNKNOWN_LABEL;
      }
    }
    bucketFor(key, label).items.push(item);
  }

  // 결정적 순서 — 실 PRD 그룹은 prdKey 사전순, __global__·__unknown__ 은 끝(각각 2·3 rank).
  const rankOf = (k) => (k === GLOBAL_KEY ? 2 : (k === UNKNOWN_KEY ? 3 : 1));
  const arr = Array.from(buckets.values());
  arr.sort((a, b) => {
    const ra = rankOf(a.prdKey);
    const rb = rankOf(b.prdKey);
    if (ra !== rb) return ra - rb;
    return a.prdKey < b.prdKey ? -1 : (a.prdKey > b.prdKey ? 1 : 0);
  });
  return arr;
}

module.exports = {
  groupByPrd,
  canonicalPlanPath,
  prdSlug,
  GLOBAL_KEY,
  UNKNOWN_KEY,
  GLOBAL_LABEL,
  UNKNOWN_LABEL,
};
