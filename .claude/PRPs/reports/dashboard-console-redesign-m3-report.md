# Implementation Report: Dashboard Console Redesign — M3 우측 상세 드로어 + 드로어 derive 추출

## Summary

승인된 `dashboard-sample.html`의 우측 native `<dialog>` 드로어를 실 렌더러에 이식했다. 미해결 질문·위험·타임라인(receipt)·마일스톤 항목을 클릭/Enter/Space로 열면 derive 실데이터 상세(제목·sev 태그·rows·sections·다음 액션)가 우측 overlay로 표시된다. 인덱스 매핑을 안정 키(`data-detail-id`)로 교체하고, 부재 필드는 placeholder 없이 graceful degrade한다. receipt/derive 스키마는 무확장(chain-of-custody 무손상) — 마일스톤 요약만 plan `## Summary` read-side 추출.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large (확인) |
| Files Changed | 13 | 13 변경 + 2 신규 (drawer-detail.js, drawer.test.js) |
| Tests | drawer.test.js 신설 + 회귀 0 | renderer 365 (was 351, +13 drawer +1 fidelity), derive 68 — 회귀 0 |
| 스키마 확장 | 0 (read-side) | 0 (확인) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | drawer-detail.js — 안정 키 + 4종 빌더 + serializer | 완료 | textContent/innerHTML 경계, 유니코드 escape(LS/PS는 JS line-terminator라 ` ` escape 사용) |
| 2 | 섹션 모듈 4종 — data-detail-id + details Map | 완료 | OQ/위험/타임라인/마일스톤 |
| 3 | plan-body.js — risk ordinal + extractPlanSummary | 완료 | OQ ordinal fallback + 마일스톤 요약 read-side |
| 4 | html.js — 드로어 CSS/마크업/JS/JSON 집계/ic-x | 완료 | footer v1.18.0→v1.19.0 |
| 5 | output-constraints.js — H7/H3 carve-out + H18 | 완료 | RULES 17→18 |
| 6 | drawer.test.js + 테스트 갱신 + plugin.json + DESIGN.md | 완료 | 13 신규 + 4 기존 갱신 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | Pass | 전 모듈 로드(테스트 통과로 증명) |
| Unit Tests | Pass | renderer 365 + derive 68 = 433 green |
| Build | N/A | 순수 JS, 빌드 단계 없음 |
| Integration | Pass | `derive/cli.js render` → status.html에 dialog 1 + 293 trigger + drawer-data, `design_constraint_violations: []` |
| Edge Cases | Pass | graceful degrade(필드 부재) / 중복 키 hard-fail(H18) / XSS payload escape / details 0건 미emit |

## Files Changed

| File | Action | 핵심 |
|---|---|---|
| `parsers/drawer-detail.js` | CREATE | 안정 키 + 4 빌더 + addDetail 충돌 hard-fail + serializeDetails |
| `sections/{open-questions,risks,audit-timeline,milestone-history}.js` | UPDATE | data-detail-id + details Map + detail 빌드 |
| `parsers/plan-body.js` | UPDATE | risk/OQ ordinal + extractPlanSummary |
| `html.js` | UPDATE | 드로어 CSS + dialog 마크업 + DRAWER_SCRIPT + JSON 집계 + ic-x + v1.19.0 |
| `output-constraints.js` | UPDATE | H7 ::backdrop carve-out + H3 drawer carve-out + H18 신설 |
| `tests/drawer.test.js` | CREATE | 13 acceptance test |
| `tests/{console-shell,output-constraints,section-fidelity,timeline-chart}.test.js` | UPDATE | markup/rule-count 동기 |
| `plugin.json` | UPDATE | 1.18.0 → 1.19.0 |
| `DESIGN.md` | UPDATE | Detail Drawer 컴포넌트 + H3/H7/H18 근거 |
| `.claude/prds/dashboard-console-redesign.prd.md` | UPDATE | M2 complete 정정 + M3 in-progress |

## Deviations from Plan

- **risks.js relatedOpenQuestion 렌더 수정(계획 외 1줄)**: 실데이터 렌더 시 H16(raw `**bold**` 누출)이 `relatedOpenQuestion` cue에서 발생 — `escapeHtml` → `renderProseHtml`로 교체. Output Constraint 3 정합, 본 M3 plan의 OQ 텍스트가 trigger한 기존 코드 결함.
- **plan 아카이브 연기**: prp-implement Phase 5는 plan을 `completed/`로 이동하라 하나, PR 게이트가 receipt의 `plan_hash`로 plan을 readback 검증하므로 이동 시 staleness 발생. PR merge 후 worktree cleanup 단위로 아카이브.

## Issues Encountered

- **U+2028/U+2029 serializer**: LS/PS는 JS 소스에서 line-terminator라 정규식 리터럴(`/ /`)에 직접 넣으면 파싱 실패. ` `/` ` escape 시퀀스로 해결. 일반 공백 오치환 가드 테스트 추가.
- **`.git` worktree 파일**: Codex tmp 경로 `.git/mccp/tmp`가 worktree에서 파일(디렉토리 아님)이라 실패 → scratchpad 사용([[feedback-pr-worktree-gh-first]]).

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `tests/drawer.test.js` | 13 | 빌더 REQUIRED/OPTIONAL, 안정 키, 충돌 hard-fail, serializer escape, dialog markup, H18 등식+중복, reduced-motion, 0건 degrade |
| `tests/section-fidelity.test.js` | +1 | 섹션 data-detail-id 안정 키 + details Map |

## Next Steps

- [ ] `/mccp:pr`로 PR 생성 (PR 전 사용자 시각 확인 필수 — `.claude/cache/status.html` ↔ `dashboard-sample.html` 드로어 대조)
- [ ] PR merge 후 PRD M3 row complete + plan 아카이브 + worktree cleanup
