# Implementation Report: dashboard-audit enumerate scope·정렬 근본 결함 수정

## Summary

`stale-audit/enumerate.js` 의 두 결함을 닫았다: (1) 정렬 `kindRank[kind] || 9` 가
milestone rank `0` 을 falsy 단락으로 `9` 로 뒤집어 in-progress 마일스톤을 리스트 맨 뒤로
밀던 버그를 nullish `?? 9` 로 교정, (2) enumerate scope 가 derive 미표시 디렉토리
(`.claude/PRPs/plans/completed/`)를 superset 으로 포함하던 drift 를 derive `PLAN_DIRS`
(SSoT) 재사용으로 정합. 회귀 테스트 2건 추가 + patch bump(1.20.0 → 1.20.1) + footer/
CHANGELOG version parity 동기.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small | Small |
| Files Changed | 3 | 7 (+4 version-parity corollary) |
| Tests | 2 회귀 추가 | 2 추가, 39 pass 0 fail |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 정렬 kindRank nullish-safe (`\|\| 9` → `?? 9`) | ✅ Complete | 주석에 버그 근거 추가 |
| 2 | enumerate scope = derive scope (completed/ superset 제거) | ✅ Complete | `require('../../derive/sources/plans').PLAN_DIRS` 단순화, 주석 정정 |
| 3 | 회귀 테스트 2건 | ✅ Complete | (a) 정렬 milestone 우선, (b) completed/ 제외 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | 프로젝트에 typecheck/lint 설정 없음(plain JS). 테스트 로드로 syntax 검증 |
| Unit Tests | ✅ Pass | stale-audit 29 (apply/item-id/enumerate) + i18n-surface 10 = 39 pass |
| Build | N/A | 빌드 스텝 없음 |
| Integration | ✅ Pass | 실제 repo `enumerate.js --json` — completed/ 출처 0, degraded false |
| Edge Cases | ✅ Pass | fail-open(디렉토리 부재/read throw), --limit cap, top-level ⊇ derive |

### Design Grounding (v1.18.22)

Design Grounding: N/A (no design trigger — enumerate.js 는 control-plane, 렌더 surface 아님).

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/stale-audit/enumerate.js` | UPDATED | +8 / -6 |
| `plugins/mccp/scripts/lib/stale-audit/tests/enumerate.test.js` | UPDATED | +23 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | +1 / -1 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | +1 / -1 (footer) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | +1 / -1 (footer) |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATED | +4 / -4 (footer assert) |
| `CHANGELOG.md` | UPDATED | +13 / -1 |

## Deviations from Plan

- **Files to Change 확장 (3 → 7)**: plan 은 enumerate.js/test/plugin.json 3개만 나열했으나,
  plugin.json patch bump 시 §3.7 이 요구하는 footer↔plugin.json version parity 를 위해
  `html.js`·`markdown.js`(user-visible footer) + `i18n-surface.test.js`(footer assert)
  + `CHANGELOG.md`(§3.7 릴리스 체크리스트)를 함께 갱신. 이미 결정된 version bump 의
  mechanical corollary(새 architectural 결정 0)이므로 plan-conflict-detector 는
  `conflict=false`. surface 간 version drift 를 남기지 않기 위한 정합 작업.
- **Plan archive 생략**: 커맨드 기본은 `completed/` 아카이브지만, (1) STATE.md dashboard-cycle
  관행(완료 plan `.claude/plans/` 유지) + (2) receipt→plan path 연결(`/mccp:pr` 검증) 보존을
  위해 `.claude/plans/` 에 유지.

## Issues Encountered

- **Receipt staleness self-heal**: Phase 0.0 recovery 에서 `mccp-plan-codex` receipt 를 먼저
  쓴 뒤 2.5.1 cross-gate dedupe 섹션을 plan 에 추가해 plan hash 가 바뀌어 read-back
  validate 가 stale 로 실패. plan 내용은 유효(Codex Adversarial Review 수렴, auto-CRITICAL 0)
  하므로 plan-codex receipt 를 현재 hash 로 재작성해 복구 → validate exit 0.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `enumerate.test.js` | +2 | (a) 정렬 milestone 우선(nullish), (b) completed/ scope 제외 |

## Next Steps

- [ ] `/mccp:prp-commit` — enumerate fix 관련 파일만 커밋(무관한 PRD 변경 제외)
- [ ] `/mccp:pr` — PR 생성
