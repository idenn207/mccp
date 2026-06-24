# Implementation Report: Dashboard Console Redesign — M4 (STATUS.md plain-text 동등본)

## Summary

`drawer-detail` SSoT의 detail 객체를 plain-text markdown으로 렌더하는 단일 함수
`renderDetailMd`를 추가하고, 4개 섹션(OQ·위험·타임라인·마일스톤)의 md가 항목 헤더
바로 아래에 그 상세를 2-space 인라인 중첩으로 펼치도록 했다. 이로써 HTML 드로어에만
살아 있던 상세(위험 영향·가능성, receipt hash, 마일스톤 plan Summary 등)가 STATUS.md
plain-text 소비자(SSH/스크린리더)에게도 정보 동등하게 노출된다. Codex F1(prose raw 보존
→ strip 휴리스틱 0)·F2(section-only 필드 무손실 + field-key omit)를 빌더 raw 보존과
serialize md-only 제외로 흡수했다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium (escaping 회귀 1건 — serialize md-only 제외로 해소) |
| Files Changed | 13 (조건부 포함) | 12 (output-constraints.js 미수정 — H10/H16 md 경로 무충돌, DESIGN.md 별도 파일 부재) |
| Codex round | 1 (cross-gate dedupe) | dedupe 적용 (plan-codex converged, hash 일치) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `renderDetailMd` SSoT 추가 | 완료 | rows(mono backtick)/sections(proseText)/action + omit/omitSections/indent |
| 2 | 빌더 prose raw 보존 (F1+F2) | 완료 | `titleText` + sections triple `[h3,proseHtml,proseText]` + `relatedOpenQuestion`/`line` 행 SSoT 흡수 |
| 3 | OQ·Risk md 일원화 | 완료 | 요약 cue 제거 → `header + renderDetailMd` (이중 표기 0, 손실 0) |
| 4 | 마일스톤·receipt md 인라인 | 완료 | timeline=receipt hash, milestone=plan 요약 신규 노출 (헤더 중복 omit) |
| 5 | markdown.js 구조 + version 동기 | 완료 | foot v1.18.2, anchor 구조 유지(최소 변경) |
| 6 | 회귀 가드 테스트 | 완료 | `markdown-equivalence.test.js` CREATE(15) + integration/four-part assertion 동기 |
| 7 | lint·plugin bump·문서 동기 | 완료 | plugin.json 1.18.1→1.18.2, 양 surface foot 동기, output-constraints 무수정(무충돌) |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static / lint | Pass | design-lint(H1-H18) clean — H10 em-dash/H16 raw marker md 경로 위반 0 |
| Unit Tests | Pass | renderer 381/381 (신규 16) + derive 68/68, 회귀 0 |
| Build | N/A | Node 스크립트(번들 없음) |
| Integration | Pass | `renderStatus` full-model md/html 동등 + drawer-data ↔ md 정보 동등 |
| Edge Cases | Pass | 0건 섹션 graceful degrade, malformed detail 빈 문자열, serialize md-only 제외 |

## Files Changed

| File | Action | 요지 |
|---|---|---|
| `parsers/drawer-detail.js` | UPDATED | `renderDetailMd` 추가 + 4 빌더 raw 보존 + `serializeDetails` md-only 제외(`stripMdOnly`) |
| `sections/open-questions.js` | UPDATED | md 일원화(출처/섹션/line/관련결정/action 인라인) |
| `sections/risks.js` | UPDATED | md 일원화(영향/가능성/관련결정/완화책/관련질문 인라인 — 이전 md 누락 행 노출) |
| `sections/audit-timeline.js` | UPDATED | receipt hash md 인라인(헤더 중복 omit) |
| `sections/milestone-history.js` | UPDATED | plan 요약 md 인라인(plan/ship omit) |
| `markdown.js` / `html.js` | UPDATED | foot version 1.18.2 동기 |
| `.claude-plugin/plugin.json` | UPDATED | 1.18.1 → 1.18.2 |
| `tests/markdown-equivalence.test.js` | CREATED | M4 동등본 회귀 가드(15) |
| `tests/integration.test.js`, `tests/four-part-rendering.test.js`, `tests/i18n-surface.test.js` | UPDATED | 중첩 detail 행 + v1.18.2 assertion 동기 |

## Deviations from Plan

- **output-constraints.js 미수정**: 조건부였음 — md 경로 신규 lint(H10/H16)가 detail
  인라인에서 깨지지 않음을 확인(production render design-lint clean). carve-out 불요.
- **DESIGN.md 미수정**: 이 PRD에 별도 DESIGN.md 파일이 없음. 평면화 결정·동등 계약은
  plan body §41-49(핵심 설계 결정)에 이미 기록됨 — 중복 회피.
- **plan 미archive**: M1~M3 plan이 모두 `.claude/plans/`에 잔존(PRD 셀 참조 유지)하는
  기존 패턴 따름. M4가 PRD 최종 milestone이나 PR 전 archive는 PRD 셀 stale 유발 →
  PR/PRD-close 시점으로 이연.
- **신규 회귀 1건 해소**: risk 완화책 proseText(raw backtick)가 drawer-data JSON으로
  누출돼 escaping.test 위반 → `serializeDetails`가 md-only 필드(titleText/proseText)를
  직렬화에서 제외(`stripMdOnly`)하도록 보강(드로어 JS는 proseHtml만 소비).

## Issues Encountered

- `node --test <dir>`이 Node 24에서 디렉토리 미지원 → glob 패턴(`tests/*.test.js`) 사용.
- production STATUS.md grep "placeholder/TODO" 매칭은 false positive — 실제 plan
  prose("placeholder 금지", "graceful degrade")가 그 단어를 *논의*하는 정상 derive
  콘텐츠. M4가 실데이터를 surface한 증거. 합성 모델 정밀 검증(test 4)은 0건 통과.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `markdown-equivalence.test.js` | 15 | renderDetailMd 단위 + 빌더 raw 보존 + 섹션 동등 + full-render 정보 동등/placeholder 0/degrade |
| `four-part-rendering.test.js` | +1 | risk detail 인라인(영향/가능성/완화/관련질문) |
| `integration.test.js` | +3 assert | 중첩 detail 행 인라인 |

## Next Steps

- [ ] `/mccp:prp-commit`로 커밋 (PR 전 사용자 `.claude/cache/status.html` 시각 확인 권장)
- [ ] `/mccp:pr` — M4가 PRD 최종 milestone(1~4) → PR 시 PRD M4 complete 전환 + worktree cleanup
- [ ] plugin.json 1.18.2 동기 (cache `claude plugin update`)
