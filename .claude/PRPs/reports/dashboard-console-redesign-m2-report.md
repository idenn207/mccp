# Implementation Report: Dashboard Console Redesign M2 — 섹션 콘텐츠 + derive 실데이터

## Summary

M1 콘솔 셸 위에서 hero + 5 섹션(OQ/위험/파이프라인/타임라인/마일스톤)의 내부 마크업을
승인 `dashboard-sample.html` 의 class anatomy 로 충실 이식하고, 모든 더미 자리를 derive
실데이터로 채웠다. 핵심 3축: (1) 마크업 fidelity 리맵, (2) prose 렌더 파이프라인으로
H10(em-dash) + H16(raw marker) 데이터-driven 해소(룰 본체 불변), (3) 공유
`deriveDecisionState` helper 로 is-block/is-bad/active 를 시간순 단일 SSoT 파생.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large (확정) |
| Files Changed | 14 | 26 (계획 14 + 헬퍼 3: severity-meta/markdown/action-prompt + section-fidelity 신규 + 테스트 마이그레이션 다수) |
| 신규 파일 | 2 (decision-state, section-fidelity) | 2 |

헬퍼 3개(severity-meta sevBadge / markdown verdict 정규화 / action-prompt cleanArg)는
Task 1/3/4 prose 파이프라인·sev 배지의 직접 구현부 — 계획 범위 내 분해.

## Tasks Completed

| # | Task | Status |
|---|---|---|
| 1 | prose 파이프라인 (renderProseHtml/Md, 재귀 inline + GFM 이중백틱 + MD0xx 중성화) | 완료 |
| 1.5 | 공유 deriveDecisionState (4종 fixture 검증) | 완료 |
| 2 | hero 샘플 fidelity (hero-status + verdict + action-prompt + axis-legend) | 완료 |
| 3 | 미해결 질문 (stack-list/li-item/sev/meta-cue/inline-prompt) | 완료 |
| 4 | 위험 (li-item/sev/meta-cue mit + panel-foot foot-link) | 완료 |
| 5 | 파이프라인 (pipe-id/pipe-stages/node-mark/pipe-status + foot-stat, deriveDecisionState 소비) | 완료 |
| 6 | 타임라인 (audit-row/audit-rail/audit-node is-ok·is-bad/audit-head/audit-meta) | 완료 |
| 7 | 마일스톤 (ms-check/ms-text/ms-file/ms-when) | 완료 |
| 8 | 섹션 CSS 이식 + 토큰(--bad/--bad-dim/--warn-dim/--mono) + ic-copy | 완료 |
| 9 | 테스트 마이그레이션(11 파일) + section-fidelity.test.js 신규 | 완료 |
| 10 | DESIGN.md M2 근거 + plugin.json 1.18.0 | 완료 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (node syntax) | Pass | 전 모듈 require/render 무오류 |
| Unit Tests | Pass | renderer 350/350, derive 68/68 |
| design_constraint_violations | Pass | `[]` (H10/H16/H3/H9 전부 해소, md 출력 + MD0xx 포함) |
| old-class grep (source) | Pass | renderer source/html.js 구조 class 0 (prose 데이터 내 클래스명 언급은 li-q 렌더 콘텐츠) |
| old-class grep (html attr) | Pass | 생성 status.html deprecated class **속성** 0 |
| self-contained | Pass | status.html 외부 fetch(@import/http) 0 |
| 더미 데이터 | Pass | v2.4.0/auth-session-rotation 등 샘플 더미 grep 0 (전부 derive 유래) |

## H10/H16 데이터-driven 해소 (핵심)

production render 초기: H10 em-dash 115 + H16 19(bold 8 + entity-backtick 11) → 모두 0.

- `renderProseHtml`: normalizeProse → inline-markdown(code/bold/link, **bold 내부 중첩
  코드 재귀 렌더** + **GFM 이중 백틱**) → MD0xx `<code>` 중성화 → escape.
- `action-prompt.cleanArg`: 복사 명령 인자의 마커/em-dash/MD0xx 강등 (data-copy 는 H16
  carve-out 밖 → 마커 누출 차단).
- verdict.text 정규화(html `<title>` + hero h1 + md header/body) + 섹션 템플릿
  separator ` — ` → `·`.

## is-block/is-bad/active 파생 (Codex F1)

`parsers/decision-state.deriveDecisionState` — (decision, gate)별 latest(created_at desc,
round desc)를 골라 done/active/blocked/missing 노드 + decision-level 상태 판정. divergent
(round≥2 미수렴)=blocked, 첫 라운드 미수렴=active(in-progress). 4종 fixture(active retry /
retry 후 수렴 superseded / multi-gate / divergent)로 가드. pipeline·timeline 단일 SSoT.

## Deviations from Plan

- 헬퍼 3 파일(severity-meta sevBadge / markdown.js verdict 정규화 / action-prompt cleanArg)
  추가 — prose 파이프라인·sev 배지의 직접 구현부로, Task 1/3/4 범위 내. 스키마 확장 0(계획대로).
- a11y-severity-non-color.test.js: severity-tag(emoji+text) → sample `.sev`(text + aria-label)
  contract 로 마이그레이션. 시각은 user-approved sample 디자인. non-color 보증은 **텍스트 라벨**
  로 유지(이모지 중복 제거).
- 위험 섹션 inline copy-btn 제거(sample fidelity — 위험은 mitigation cue 만, action prompt 없음).

## 사용자 육안 검증 (필수 — 미완)

이 환경은 브라우저 스크린샷 불가. `.claude/cache/status.html` 을 사용자가 직접 열어
승인 `.claude/cache/dashboard-sample.html` 과 섹션 대조 필요. PR 전 게이트.

## Next Steps

- [ ] 사용자 status.html 육안 대조 (vs dashboard-sample.html)
- [ ] `/mccp:prp-commit` → `/mccp:pr`
- [ ] PRD M2 row complete + worktree cleanup
