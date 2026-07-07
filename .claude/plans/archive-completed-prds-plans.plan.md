# Plan: 완료 PRD/plan 아카이브 + milestone-history 이력 복원

> Retrospective descriptor (chore). 이 작업은 정식 `/mccp:plan` 게이트 없이
> 직접 수행된 housekeeping이며, 본 문서는 PR-Codex 게이트의 receipt chain을
> 정직하게 anchor하기 위한 사후 기술서입니다. Codex adversarial review는
> 실제 diff에 대해 수행되어 converged(R1, actionable finding 0).

## 문제 정의

`.claude/prds/` 와 `.claude/PRPs/plans/` 에 완료된 PRD 17개와 그에 속한
완료 plan, 그리고 오래 전 shipped된 orphan plan(v0.2~v1.3 design-gate 등)이
활성 아티팩트와 뒤섞여 누적됐다. derive/enumerate 가 비재귀 스캔이므로
완료 항목이 활성 스캔에 그대로 잡혀:

- STATUS.md 가 483KB 로 비대해지고,
- 완료 plan 의 resolved 위험/질문이 활성 카운트를 부풀리고,
- 대시보드 4축(진행/차단/위험/다음)의 신호 대 잡음비가 나빠졌다.

## 변경 개요

### 1. 아카이브 이동 (`chore(artifacts)`)

- 완료 PRD 17개 → `.claude/prds/complete/`
- 그에 속한 완료 plan → 기존 대시보드-인지 아카이브 `.claude/PRPs/plans/completed/`
- 오래 전 shipped orphan plan 도 함께 이관
- 중복이던 `v1-3-0-observability-m1-derive-engine` / `v1-4-0-multi-session-m3-friction-zero` plan 은 `completed/` 사본이 이미 존재(내용 동일, resolved 마커만 상이)해 `.claude/plans/` 중복본을 `git rm`
- `deep-research-detect.test.js` 의 archived-PRD fixture 참조를 새 위치로 갱신

유지: 미완료 PRD 4개(work-context-isolation, v0-4-0-orchestrator,
v0-3-4-test-env-hygiene, v1-3-0-observability-surface-ii) + 그 plan,
`mccp-roadmap.plan.md`(living roadmap), `codex-findings-backlog.md`(backlog
소스), 오늘자 audit 작업(p1-codex-dedupe, dashboard-audit-scope-sort-fix).

비재귀 스캔이므로 `completed/`·`complete/` 하위는 자동으로 대시보드 활성
표시에서 빠진다 — STATUS.md 483KB→27KB, derive 경고 0, derive/renderer/
stale-audit 테스트 전부 green.

### 2. milestone-history 이력 복원 (`feat(dashboard)`)

archive 이동으로 완료 PRD가 derive 활성 스캔에서 빠지면서 대시보드
'마일스톤 기록'(완료 이력) 섹션이 비었다. `milestone-history.js` 가
`.claude/prds/complete/` 를 직접 추가 스캔해 완료 마일스톤을 이력
타임라인에 복원한다.

- per-PRD 처리(완료 행 + dropped lifecycle)를 `processPrd()` 로 추출해
  active-plan 경로와 아카이브 스캔이 공유. `seenPrd` 로 중복 처리 방지.
- 아카이브 plan 의 git-time/summary 는 기존 `completed/` fallback candidate
  로 해석 — 별도 배선 불필요.
- 활성 표면(진행중/위험/질문/status-grid)은 derive 활성 plan 만 소비하므로
  아카이브 항목이 활성 카운트로 새지 않는다. 완료 이력만 복원, 활성 오염 0.
- 디렉토리 부재/read 실패는 loud fail-open(throw 안 함, 이력만 축소).

## Files to Change

| File | Change |
|---|---|
| `plugins/mccp/scripts/lib/renderer/sections/milestone-history.js` | 아카이브 스캔 + processPrd 추출 |
| `plugins/mccp/scripts/lib/renderer/tests/milestone-history.test.js` | archived-scan 테스트 추가 |
| `plugins/mccp/scripts/lib/renderer/tests/four-part-rendering.test.js` | null-case hermeticity |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | footer 버전 어서션 동기화 |
| `plugins/mccp/scripts/lib/renderer/html.js` | footer 버전 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | footer 버전 |
| `plugins/mccp/.claude-plugin/plugin.json` | version bump |
| `plugins/mccp/scripts/lib/tests/deep-research-detect.test.js` | fixture 경로 |
| `.claude/prds/**`, `.claude/PRPs/plans/**`, `.claude/plans/**` | 아카이브 이동 |
| `CHANGELOG.md`, `CLAUDE.md` | 릴리스 기록 |

## 검증

- renderer 테스트 green(archived-scan 신규 테스트 + null-case 수정 포함)
- STATUS.md 마일스톤 기록 섹션 이동 전 수준 복원, 활성 위험/질문 벌크 정리 유지
- derive 경고 0

## Open Questions

- 아카이브된 마일스톤의 렌더 시각이 ship 시점이 아니라 아카이브-이동 커밋의
  git-time 에서 파생됨(모두 "방금"). 완료 이력 타임라인의 연대기 정확도를
  위해 ship-date 파생을 후속 개선 후보로 남긴다. (severity LOW — advisory)
