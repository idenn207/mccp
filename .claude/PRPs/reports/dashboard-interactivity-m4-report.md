# Implementation Report: Dashboard Interactivity M4 — 대시보드 액션 버튼 (obsolete 닫힌 루프)

## Summary

대시보드 드로어의 위험/질문을 **"제외(obsolete)"** 버튼으로 직접 처리해 소스 `.md`에
비파괴 해결 마커를 기록하고 렌더가 collapse하는 닫힌 루프를 구현했다. 서버를 영구
writer로 만들지 않는 **안 F mode-gated** 설계: POST 라우트는 기본 미존재이고
`/mccp:dashboard --write` 세션 수명 동안만 활성화된다. 평상시 대시보드는 read-only
불변. 쓰기는 opaque item-id(경로 미수신) + Host allowlist(DNS-rebinding) + Origin +
프로세스 nonce + repoRoot containment + fail-closed `apply.js` 위임으로 닫았다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large (서버 최초 mutation route + 보안 표면 + 다중 subsystem) | Large — 일치 |
| Confidence | plan-gate Codex R1 수렴(4 ACCEPT_NOW) | 흡수 4축 모두 구현·테스트로 검증 |
| Files Changed | 9 (CREATE 3 / UPDATE 6) | 13 touched (CREATE 3 / UPDATE 7 + PRD + report) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | item-id SSoT (`item-id.js`) | [done] | risk anchor=ordinal (deviation — 아래) |
| 2 | 렌더러 inert data-id + 버튼 markup | [done] | drawer-detail.js resolveId + DRAWER_SCRIPT 버튼 + CSS |
| 3 | 서버 `--write` 게이트 + nonce + mode-aware identity (F2) | [done] | writeEnabled 비트 + reuse 모드 일치 |
| 4 | POST 핸들러 검증 체인 (fail-closed) + Host gating (F1) + 엄격 결과 (F3) | [done] | 9-step chain |
| 5 | 클라이언트 wiring (`resolve-action.js`) | [done] | 버튼 노출 + reason prompt + nonce fetch + a11y live-region |
| 6 | 단일 render-after-write API (F4) | [done] | triggerRender debounce off + cache mtime advance 검증 |
| 7 | 문서 + 버전 + CHANGELOG | [done] | dashboard.md `--write` 섹션 + plugin.json 1.19.0 + 양 footer |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | [done] Pass | `node --check` resolve-action.js + 전 모듈 load OK (no lint config) |
| Unit Tests | [done] Pass | item-id 8 + stale-audit 26 + renderer 639 |
| Build | [done] N/A | pure Node, no build step |
| Integration | [done] Pass | dashboard-server 32 (실제 HTTP + apply + render) + render CLI e2e |
| Edge Cases | [done] Pass | 14 보안 invariant + duplicate-text + mode transition |

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/stale-audit/item-id.js` | CREATED | +64 |
| `plugins/mccp/scripts/lib/stale-audit/tests/item-id.test.js` | CREATED | +~130 |
| `plugins/mccp/scripts/lib/renderer/client/resolve-action.js` | CREATED | +101 |
| `plugins/mccp/scripts/lib/dashboard-server.js` | UPDATED | +336 / -? |
| `plugins/mccp/scripts/lib/renderer/parsers/drawer-detail.js` | UPDATED | +21 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | +16 (DRAWER_SCRIPT 버튼 + CSS + footer) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | footer 동기 |
| `plugins/mccp/scripts/lib/tests/dashboard-server.test.js` | UPDATED | POST 회귀 19 테스트 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATED | version 단언 동기 |
| `plugins/mccp/commands/dashboard.md` | UPDATED | `--write` 모드/보안/reversibility 섹션 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | 1.18.21 → 1.19.0 |
| `CHANGELOG.md` | UPDATED | `[1.19.0]` row |
| `.claude/prds/dashboard-interactivity.prd.md` | UPDATED | M4 status → complete (PRD 종료) |

## Deviations from Plan

1. **item-id risk anchor = ordinal (not lineNumber)**. Task 1은 `lineNumber`를 anchor로
   명세했으나, 렌더러(drawer-detail.js)는 risk의 lineNumber를 보유하지 않는다
   (`parseRisks`는 행 번호를 버리고, 오직 enumerate만 `findRisksTableLine`으로 계산).
   렌더러를 risk lineNumber로 채우려면 derive 레이어(plan-body.js, Files to Change 밖)를
   확장해야 하므로, **양측(렌더러 derive·enumerate)이 공유하는 parse-order ordinal**을
   risk anchor로 채택했다. plan의 *의도*(positional anchor → duplicate-text 안전 +
   stale 시 re-validation 강제)는 보존된다 — `oq=lineNumber, risk=ordinal`. test 14
   (duplicate-text → 서로 다른 id) green으로 안전가드 확인. computeItemId은 source
   separator도 정규화(win32 backslash ↔ enumerate forward-slash 합치)해 플랫폼 독립.

2. **plan을 `.claude/PRPs/plans/completed/`로 이동하지 않음**. 생성 ECC Phase 5는
   plan 아카이빙을 명세하나, 본 프로젝트는 plans를 `.claude/plans/`에 유지하고
   completion-ledger 커밋으로 폴딩하는 컨벤션(이전 M1~M3 plan 모두 `.claude/plans/`
   잔존, PRD 표가 그 경로를 참조). 이동 시 PRD plan-link가 깨지므로 생략.

## Issues Encountered

- **cross-gate dedupe가 plan-codex receipt를 stale로 만듦**: dedupe 노트
  (`## Codex Implementation Review`)를 plan body에 기록하면서 plan hash가 바뀌어
  mccp-plan-codex receipt의 hash binding이 stale이 됐다. additive 노트(architectural
  결정 무변경)이므로 plan-codex receipt를 현재 hash로 re-bind(`design_critique_verdict`
  등 필드 보존)해 해소. 알려진 재발 부채(dedupe stale).

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `stale-audit/tests/item-id.test.js` | 8 | 결정성·1글자-변경·separator 정규화·duplicate-text·anchor-kind·norm·렌더-서버 합치 |
| `tests/dashboard-server.test.js` (추가) | 19 | route presence·Origin/nonce/id/containment/reason reject·DNS-rebinding Host·body cap·happy(risk/oq)·F3 strict·F4 render-after-write·duplicate-text·mode transition |

## Next Steps

- [ ] Code review via `/mccp:code-review` (또는 PR 게이트가 통합)
- [ ] Create PR via `/mccp:pr` (PR-Codex + design/security 게이트 + completion-ledger 폴딩)
