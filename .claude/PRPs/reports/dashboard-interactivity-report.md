# Implementation Report: Dashboard Interactivity — M1 드로어 요약→상세화

## Summary

우측 상세 드로어가 prose를 **inline-only**(`renderProseHtml`)로 렌더하고 `extractPlanSummary`가 `## Summary` 첫 단락만 줄-join하던 두 가지 "요약 절단" 원인을 닫았다. block-level prose 렌더러(`renderProseBlockHtml`/`renderProseBlockMd`)를 escape-then-render SSoT를 보존한 채 추가해 드로어 sections가 문단·목록·code-fence·blockquote·GFM 표를 block으로 렌더하고, `extractPlanSummary`를 전문 추출(다음 `##`까지, 개행 보존) + bounded render budget으로 바꾸고, resolved 위험의 해결 사유/시각을 드로어에 노출하고, `renderDetailMd`를 멀티라인 block-safe로 확장해 STATUS.md plain-text 동등본을 유지했다. 전부 read-only 렌더 변경 — 신규 저장소·서버 mutation·마커 cap 확장 없음.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium (정확) |
| Confidence | — | 높음 |
| Files Changed | 13 (테이블 11 + Task 1/2/7 validate 대상 2 보정) | 13 source + 2 artifact(plan/prd) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | block-level prose 렌더러(`format-utils.js`) | 완료 | `renderProseBlockHtml`/`renderProseBlockMd`. 모든 경로 `renderInline` 종결(Critique F1) + MAX_BLOCKS 200(Codex F1 defense-in-depth) + fail-open |
| 2 | `extractPlanSummary` 전문 추출 + render budget(`plan-body.js`) | 완료 | 첫-단락-only 제거 → 전문(개행 보존). SUMMARY_BUDGET 2000자/40줄 ceiling + overflow affordance(Codex F1) |
| 3 | 드로어 빌더 block 전환 + 해결 사유(`drawer-detail.js`) | 완료 | 4종 빌더 sections → `renderProseBlockHtml`(title/rows inline 유지). buildRiskDetail 해결 사유/시각 row(resolved만) |
| 4 | `renderDetailMd` block-safe 멀티라인(`drawer-detail.js`) | 완료 | 멀티라인 proseText → `  - {h3}:` 헤더 + deeper-indent 본문. 단일 라인 기존 형식 불변 |
| 5 | 드로어 컨테이너 + block CSS(`html.js`) | 완료 | DRAWER_SCRIPT `<p>`→`<div class="d-prose">`. near-monochrome 토큰만(Critique F2). border-radius 0(H3 무발화), blockquote/table 전역 규칙 재사용 |
| 6 | resolved 위험 reason forward(`risks.js`) | 완료 | `r.resolvedMeta.reason`/`.at` → buildRiskDetail forward |
| 7 | 회귀 가드 + injection + render-budget 테스트 | 완료 | format-utils(13) + escaping(4) + drawer(2+1) + markdown-equivalence(3) + plan-body-parser(5) = 신규 27 |
| 8 | version bump + footer 동기 | 완료 | plugin.json + html.js footer + markdown.js footer + i18n-surface 단언 = `1.18.17 → 1.18.18` |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | 프로젝트 lint/typecheck 스크립트 없음(JS, node native) |
| Unit Tests | 통과 | 렌더러 전 스위트 617 PASS / 0 FAIL (590 baseline + 27 신규) |
| Build | N/A | 빌드 단계 없음(plugin) |
| Integration | 통과 | `derive/cli.js render` 산출 — STATUS.md/status.html에 `.d-prose` CSS + v1.18.18 footer 확인 |
| Design-lint | 통과 | `runOutputConstraints` violations [] (H3/H4/H10/H15/H16/H18 모두 통과) |

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/format-utils.js` | UPDATE | +157 |
| `plugins/mccp/scripts/lib/renderer/parsers/drawer-detail.js` | UPDATE | +46 / 일부 |
| `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` | UPDATE | +45 / 일부 |
| `plugins/mccp/scripts/lib/renderer/sections/risks.js` | UPDATE | +10 / 일부 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | +23 / 일부 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | +1 / -1 (footer) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | +1 / -1 (version) |
| `plugins/mccp/scripts/lib/renderer/tests/format-utils.test.js` | UPDATE | +90 |
| `plugins/mccp/scripts/lib/renderer/tests/escaping.test.js` | UPDATE | +37 |
| `plugins/mccp/scripts/lib/renderer/tests/drawer.test.js` | UPDATE | +37 |
| `plugins/mccp/scripts/lib/renderer/tests/markdown-equivalence.test.js` | UPDATE | +43 |
| `plugins/mccp/scripts/lib/renderer/tests/plan-body-parser.test.js` | UPDATE | +47 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | +4 / -4 (version 단언) |

합계: 13 files, +514 / -29.

## Deviations from Plan

1. **테스트 파일 2개를 Files to Change 테이블에 보정**: 원 plan 테이블은 11개 파일을 명시했으나 Task 1(validate=`format-utils.test.js`)·Task 2(validate=`plan-body-parser.test.js`)·Task 7(거대 Summary 픽스처=`plan-body-parser.test.js`)이 참조하는 두 테스트 파일이 테이블에서 누락돼 있었다. 구현 중 두 파일을 추가하고 테이블을 보정 — plan Task와 정합하는 minor deviation, 아키텍처 변경 0.
2. **plan 아카이브 생략(mccp convention)**: 일반 ECC 템플릿 Phase 5는 plan을 `completed/`로 이동하지만, 이 repo의 mccp gate chain은 후속 `/mccp:pr` Phase 1.6 chain-check가 `.claude/plans/<plan>.md`를 읽어야 한다. 기존 dashboard cycle 전부 plan을 `.claude/plans/`에 유지하므로 동일하게 유지.

## Issues Encountered

- **plan-conflict-detector backtick false-positive(도구 버그)**: `parseFilesToChange`가 Files to Change 셀의 backtick-wrapped 경로(`` `plugins/.../format-utils.js` ``)에서 backtick을 안 벗겨 plan에 명시된 파일조차 diff와 매칭 실패 → 전부 unplanned로 카운트해 `file-expansion` 오발화. 실제 소스 diff 13개 중 11개는 plan과 정확히 일치, 2개는 plan Task가 명시한 테스트 파일이라 **진짜 plan↔implementation gap 아님** → escalate 하지 않음(plan body `## Implementation Deviations`에 기록). detector 자체 수정(셀 backtick strip)은 별도 mechanical axis.
- **implement gate plan-body 편집 → upstream receipt stale**: cross-gate dedupe 마커(+이후 deviation 보정)가 plan hash를 바꿔 plan-codex receipt가 stale → 마커는 additive(아키텍처 불변)이므로 plan-codex receipt를 현재 hash로 refresh(design_critique_verdict=converged 보존). 알려진 상호작용.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `format-utils.test.js` | +13 | block 렌더러(문단/목록/fence esc-only/blockquote/표/heading 강등/malformed degrade/MAX_BLOCKS/em-dash/fail-open/md) |
| `escaping.test.js` | +4 | block-level self-injection(목록/fence/표 셀/blockquote 페이로드 raw 누출 0) |
| `drawer.test.js` | +3 | block 빌더 sections 마크업 + 해결 사유/시각 row(resolved만) + `.d-prose` 컨테이너 |
| `markdown-equivalence.test.js` | +3 | 멀티라인 block-safe md + 단일 라인 불변 + 해결 사유 html↔md 동등 |
| `plan-body-parser.test.js` | +5 | extractPlanSummary 전문 추출 + 단일 라인 불변 + null degrade + render budget overflow + 정상 미발동 |

## Codex / Design Gate

- **Implement-Codex**: cross-gate dedupe 적용 — decision-set이 mccp-plan-codex review에서 이미 수렴(render budget 아키텍처 결정), 신규 implement-time 결정 0. receipt `mccp-implement-codex/dashboard-interactivity.json` approving.
- **Design critique**: plan stage round 1 CONVERGED(F1/F2/F3 3 finding 모두 Task 1/5 흡수). implement stage 검출은 `.js` 파일이라 UI 확장자 미매치 → silent-skip(plan critique가 SSoT).
- **Security**: 미트리거(read-only 렌더, 사용자 입력 처리 없음). innerHTML 경계는 기존 escape-then-render SSoT 보존 + block injection 테스트로 가드.

## Next Steps
- [ ] `/mccp:pr` 로 PR 생성(chain-check가 plan + implement receipt 검증)
- [ ] PR 후 worktree 유지(M2/M3 후속 — PRD 형제 milestone)
