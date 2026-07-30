# PR Review: #114 — feat(msw): v1.22.7 multi-session-work-loop M2 measurement instrumentation

**Reviewed**: 2026-07-26
**Author**: idenn207 (self-review → posted as comment)
**Branch**: v1-22-6-multi-session-m2 → main
**Decision**: APPROVE (with comments) — ⚠️ 단, PR-Codex 최종 R3 cross-model 검증은 여전히 pending

## Summary

M2 계측 코드 자체는 건전하며, 이 code-review는 특히 **PR-Codex R1/R2 6건 수정이 새 결함/회귀/corruption을 유발하지 않았는지**를 검증했다 — 유발 없음(NUL 0, MSW 59/59, derive 114/114, fixture 게이트 exit 0). 신규 finding은 diff 위생 1(MEDIUM) + 일관성 2(LOW)로 모두 비차단. **중대 caveat**: 본 리뷰는 same-model(Claude↔Claude)이라 R3 cross-model(Codex) 재검증을 대체하지 못한다 — PR-Codex receipt는 정직하게 `divergent`(R3 환경상 미완주)로 봉인돼 있고, merge 전 또는 환경 복구 후 `/mccp:pr` 재실행으로 최종 수렴이 필요하다.

## Findings

### CRITICAL
None

### HIGH
None — R1/R2 6건 수정(handoff leak·A1 forward-only·B2 span·B2 라벨·A2 렌더·C1 masquerade) 전부 재검토 결과 정확하고 test로 잠김. `session-activity.js#spanOf`(F3)·`computeA1` 순서(invalid→forward-only→compute)·`formatValue` p50/p95 분기 모두 correct. 편집 파일 corruption(NUL) 0.

### MEDIUM
- **M1 (diff 위생)** `.claude/state/` 런타임 아티팩트가 feature diff에 포함됨 — `STATE.md`, `fix-task-applied.md`, `pr-phase-lock-stale-reclaimed.json`. §3.2상 git-tracked이지만 M2 기능 내용이 아니라 세션 런타임 상태다. 특히 `pr-phase-lock-stale-reclaimed.json`은 transient lock-reclaim 마커라 feature PR에 들어갈 이유가 없다. 권고: 후속 정리 커밋에서 제외하거나, 최소한 reviewer가 인지. (기능/정확성 영향 없음)

### LOW
- **L1 (일관성)** `A1`이 `metrics-assert` claimedComputable 목록에 남아 있으나 실 corpus에선 forward-only(producer 부재)다. fixture가 `completions_producer_present:true`를 주입해 compute 경로를 실증하는 구조 — C1(source 자체 부재)과 달리 A1은 실 source(session_activity)가 있어 정당하나, "claimed-computable인데 실 corpus 미산출"이라는 mild 불일치. Codex R2가 A1 forward-only fix를 수용했으므로 LOW.
- **L2 (shape 일관성)** `computeA1` forward-only 분기는 `denominator: startupCount`(non-null)를 반환하나 C1/C2/C3 forward-only는 `denominator: null`이다. A1이 startups를 실제로 알기에 무해하지만 forward-only 형태가 metric 간 불일치.

## Cross-gate dedupe note

PR-Codex(R1+R2)가 이미 6건을 발화·수렴 처리했고 본 code-reviewer는 그 수렴 영역을 재도전하지 않음(수정 검증에 집중). PR-Codex 최종 verdict는 `divergent`이나 이는 **미해결 코드 결함이 아니라 R3 재검증의 환경상 미완주** 때문 — 6건은 모두 addressed.

## Validation Results

| Check | Result |
|---|---|
| Type check | Skipped (JS 프로젝트, tsc 미적용) |
| Lint | Skipped (no lint script) |
| Tests (MSW) | Pass — 59/59 |
| Tests (derive) | Pass — 114/114 |
| Tests (renderer) | Pass — 666/667 (1 pre-existing `verdict-label`, MSW 무관) |
| metrics-assert fixture 게이트 | Pass — exit 0 |
| NUL-byte scan (changed .js) | Pass — 0 |
| history-leak scan | Pass — 0 leaks |

## Files Reviewed

State/derive/msw-metrics/renderer 프로덕션 코드(state 3 + derive sources 3 + msw-metrics 4 + renderer 4 + hooks 2) + tests + docs + evidence receipt. 총 41 files (Added/Modified). R1/R2 수정 파일(session-activity.js·msw-metrics/index.js·renderer/sections/msw-metrics.js·fixture.js·cli.js·.gitignore) 집중 재검토.
