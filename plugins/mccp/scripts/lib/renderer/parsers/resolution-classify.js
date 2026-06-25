'use strict';

// Dashboard Truthfulness M3 — 해결 상태 전파 (pure, read-side, LLM-free).
//
// parsePlanBody 의 파서(plan-body.js)가 raw 라인에서 감지한 `resolved` flag 를
// 각 risk/OQ 항목에 **정규화·전파**한다. 추론(status/ledger 추정) 0 — resolved 는
// 오직 명시 마커(`<!--mccp:resolved-->`)에서만 나온다(Codex 재설계 F1). 평가는
// `/mccp:dashboard-audit` agent 명령 전용이고, 이 함수는 결정적 마커 reader 일 뿐.
//
// index.js dedupe 직후 wiring. fail-open(throw 안 함) — 손상 입력은 원본 반환.

function annotateResolution(planBody) {
  if (!planBody || typeof planBody !== 'object') return planBody;
  try {
    if (Array.isArray(planBody.risks)) {
      for (const r of planBody.risks) {
        if (r && typeof r === 'object') {
          r.resolved = !!r.resolved;
          // M8 — 출처 plan lifecycle flag 방어적 정규화(resolved 미러). dedupe
          // (dedupOQAndRisks Object.assign)가 보존하나 undefined→false 보장.
          r.sourceClosed = !!r.sourceClosed;
        }
      }
    }
    // STATE.md OQ 는 planBody.openQuestions 에 없다(섹션이 model.sources.state 에서
    // 직접 머지) — 따라서 source 없는 STATE.md 질문은 본 함수가 닿지 않아 항상 active.
    if (Array.isArray(planBody.openQuestions)) {
      for (const q of planBody.openQuestions) {
        if (q && typeof q === 'object') q.resolved = !!q.resolved;
      }
    }
  } catch (_) { /* fail-open — 결정성/무해 유지 */ }
  return planBody;
}

module.exports = { annotateResolution };
