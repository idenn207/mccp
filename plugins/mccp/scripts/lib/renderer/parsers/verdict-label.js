'use strict';

// Dashboard Readability M3 — 판정 어휘 SSoT(single source of truth).
// dual-review 게이트 판정 라벨을 사용자 친화 어휘로 통일한다. 5개 렌더 파일
// (pipeline / audit-timeline / drawer-detail / next-action / status-grid)이 이
// frozen 맵만 참조해 잔여 `수렴`/`미수렴`/`divergent` 0 을 SSoT 로 강제한다.
//
// 매핑(내부 enum → 사용자 라벨):
//   converged           → PASS(통과)
//   active / first-round → IN_PROGRESS(진행 중)
//   divergent / escalated 미수렴 / blocked → HOLD(보류)
//
// 아이콘(✓/◐/⚠)·톤(low/med/high)·CSS class·decision-state enum(`blocked`/
// `converged`)은 각 섹션이 그대로 유지한다 — 이 모듈은 사용자 노출 텍스트 라벨만
// 소유(코드값 변경 없음, PRD Design Direction).
const VERDICT = Object.freeze({ PASS: '통과', IN_PROGRESS: '진행 중', HOLD: '보류' });

module.exports = { VERDICT };
