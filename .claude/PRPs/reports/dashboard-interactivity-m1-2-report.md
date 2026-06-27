# Implementation Report: Dashboard Interactivity — M1.2 prose 렌더 시각 다듬기 + 리스트 강조 혼란 제거

## Summary

M1이 깐 block-level prose 렌더(`renderProseBlockHtml`) 위에서 세 시각 결함을 닫았다: (1) 드로어 prose `##` heading을 평면 `<p class="d-h"><strong>`에서 styled `.d-h`(내부 `<strong>` 제거 + CSS weight/color/margin 위계)로 교체, (2) 문단 내 soft break를 `<br>`로 보존(render-then-validate gate로 마커 누출 차단), (3) 드로어 밖 위험/질문 리스트의 `**bold**`를 본문 동색(`--ink-2`)으로 중립화하고 loud 강조는 드로어(`.d-prose strong`)로 집중. 전부 read-only 렌더/CSS 변경 — 신규 저장소·서버 mutation·마커 cap 확장 0.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small | Small (확인) |
| Confidence | (Codex R1 흡수로 수렴) | 정합 — 회귀 0 |
| Files Changed | 6 | 7 (i18n-surface.test.js version bump 동반) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | heading styled `.d-h` 위계 (F1) | [done] Complete | format-utils heading 분기 `<strong>` 제거 + html.js `.d-prose p.d-h` (0.8rem ≤ `.d-sec h3`, weight 650, --ink, margin) |
| 2 | 문단 soft break `<br>` 보존 (F2 + Codex F-C1) | [done] Complete | render-then-validate gate(`hasResidualMarker`) — H16 5종 스캔, 마커 straddle 시 space-join fallback |
| 3 | 리스트 강조 중립화 + drawer loud | [done] Complete | `.li-q strong` --ink→--ink-2/650→600 + `.d-prose strong` 신규. widget-card white-strong 부재 확인 |
| 4 | version bump + footer + CHANGELOG | [done] Complete | plugin.json/html.js/markdown.js 1.18.19 3-surface 동기 + CHANGELOG 1.18.19(M1.2) + 누락 1.18.18(M1) gap-closer |
| 5 | impeccable audit/polish 자기-적용 + 회귀 | [done] Complete | audit 20/20 Excellent, divergent 0 → 보정 불요. polish no-op |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | [done] Pass | (JS, lint 미구성 프로젝트 — node 구문 검증으로 대체) |
| Unit Tests | [done] Pass | renderer 스위트 621/621 (신규 format-utils 4건) |
| Build | [done] N/A | 빌드 단계 없는 plugin |
| Integration | [done] Pass | `derive/cli.js render` 실제 산출 + design_constraint_violations: [] |
| Edge Cases | [done] Pass | 4종 straddle(bold/single+double backtick/md-link) fallback + balanced multi-line `<br>` 채택 |

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/format-utils.js` | UPDATE | +55 / heading 분기 + 문단 `<br>` + `hasResidualMarker` |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | +18 / `.d-prose p.d-h`·`.d-prose strong`·`.li-q strong`·footer |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | +1/-1 / footer |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | +1/-1 / 1.18.19 |
| `plugins/mccp/scripts/lib/renderer/tests/format-utils.test.js` | UPDATE | +41 / heading·soft-join 갱신 + 4 신규 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | +2/-2 / footer 버전 테스트 |
| `CHANGELOG.md` | UPDATE | +17 / 1.18.19 + 1.18.18 |

## Deviations from Plan

1. **i18n-surface.test.js 동반 갱신** — plan Files to Change에 미기재. footer 버전 문자열(`/v1\.18\.18/`)을 하드코딩한 테스트라 version bump의 기계적 동반 변경. 1줄 정규식 갱신.
2. **CHANGELOG에 1.18.18(M1) row 소급 추가** — plan Task 4는 1.18.19 row만 지정. M1 커밋이 plugin.json/footer는 bump했지만 CHANGELOG row를 빠뜨린 gap을 발견 → 같은 PRD/PR(#72)에서 ship되므로 version drift(1.18.17→1.18.19 hole) 회피 위해 동반 기록.
3. **Plan 미archive** — 일반 커맨드 본문은 `completed/`로 이동을 지시하나, plan-codex/implement-codex receipt가 `.claude/plans/dashboard-interactivity-m1-2.plan.md` 경로+hash로 chain을 anchor하므로, PR-step chain-check 전 이동 시 validate 깨짐. repo 실제 관행(plan은 in-place 유지 + PR 후 ledger fold)대로 보존.
4. **Implement-Codex gate dedupe** — plan에 완결된 `## Codex Adversarial Review`(R1 absorption, 신규 implement-time 결정 0) 존재 → 2.5.1 cross-gate dedupe 적용(Codex 재호출 skip). 부수적으로 dedupe용 섹션 주입이 plan hash를 바꿔 stale된 plan-codex receipt를 현재 hash로 refresh(design-critique verdict=converged 보존).

## Issues Encountered

- **plan-codex receipt staleness** — `## Codex Implementation Review` 섹션 주입이 plan hash를 변경 → plan-codex receipt stale. `/mccp:receipt-write`로 plan-codex receipt를 현재 hash에 refresh(verdict/critique 필드 보존)해 복구. 재실행 대신 복구(§3.1).
- **[기존, 본 변경 무관] drawer detail-id collision 경고** — `dashboard-interactivity` / `dashboard-interactivity-m1-2` 두 plan-codex receipt가 같은 sha256으로 충돌("안정 키 약함 — 조사 필요"). derive/drawer-detail 안정 키 약점으로 M1.2 prose 변경과 무관. 별도 조사 항목.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `tests/format-utils.test.js` | +4 (신규), 2 갱신 | balanced multi-line `<br>` 채택 / bold·double-backtick·md-link straddle space-join fallback / heading styled `.d-h` no-`<strong>` / soft-join `<br>` |

## impeccable Audit (Task 5)

| Dimension | Score | |
|---|---|---|
| Accessibility | 4 | `--ink-2` 중립화 strong AA 통과(dark 8.75–9.80:1, light 10.02–10.86:1). `<br>` SR line-break 정상 |
| Performance | 4 | 순수 CSS+string, render-then-validate regex는 MAX_BLOCKS 한정 |
| Responsive | 4 | fixed width 0, rem 기반 |
| Theming | 4 | 전부 design token, dark+light |
| Anti-Patterns | 4 | near-monochrome 보존, accent ≤1, AI tell 0 |
| **Total** | **20/20** | **Excellent** |

- divergent 0 → 명시 섹션 보정 불요.
- **[P3 latent]** `.d-h`(weight 650) vs `.d-sec h3`(600) 동일 size/color에 weight만 근접 — variable font snap 시 유사 가능. 현재 receipt 데이터에 `##` 0건이라 latent. plan이 대안 명시(`.d-sec h3`~0.9rem 상향). 실데이터에서 모호해지면 적용.

## Next Steps

- [ ] `/mccp:prp-commit` 으로 커밋
- [ ] `/mccp:pr` 로 PR (M1·M1.2 동일 branch — PR #72에 누적)
