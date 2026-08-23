---
state_version: 1
task_fingerprint: impeccable-detection-contract-m4
created_at: 2026-06-03T18:51:31.328Z
updated_at: 2026-08-23T07:48:47.029Z
last_event: stop_loop_pass
last_event_at: 2026-08-23T07:48:47.029Z
unsafe_checkpoint: false
confirm_required: false
session_end_imminent: true
chain_aborted: false
last_pr_url: https://github.com/idenn207/mccp/pull/71
dep_check_at: 2026-08-23T07:48:46.957Z
dep_check_missing: impeccable
escalate_pending: true
escalate_pending_decision_id: impeccable-detection-contract-m4
---
## Goal
impeccable-detection-contract M4 — 게이트 발화 정합. 구현 완료(v1.31.4), commit/PR 대기.

## Plan
- PRD: `.claude/prds/impeccable-detection-contract.prd.md` — M1·M2·M3·**M4 complete**, M5(문서 드리프트) pending
- plan: `.claude/plans/impeccable-detection-contract-{m1,m2,m3,m4}.plan.md` — 넷 다 봉인됨(plan_hash). **편집 금지**
- 게이트 산출물·라이브 증거: `.claude/notes/impeccable-detection-contract-{m1,m2,m3,m4}.md`
- 구현 보고: `.claude/PRPs/reports/impeccable-detection-contract-m4-report.md`
- version 1.31.4 (patch — PRD 내 단일 milestone). 4면 동기 완료. branch impeccable-detection-contract

## Done
- M1 (3d38358, v1.31.1) 정직한 탐지 / M2 (87c6acb·0433538, v1.31.2) 판정 권한 일원화 / M3 (66aaa19, v1.31.3) 섀도잉 해소
- **M4 (미커밋, v1.31.4) 게이트 발화 정합** — 8 task 전부 착지
- M4/T1 UI10 재확인 실측 — `shape`는 벤더 메타데이터상 **조건 없이** required interview. **정정**: `teach`는 4.1.1의 23개 카탈로그에 없다(차단 프로즈만 부름) — 집합 유지 근거는 미래 카탈로그 확장 방어
- M4/T2 `INTERVIEW_REQUIRED_COMMANDS` 신설 + implement `shape` background→recommend. `background`는 오라클 전체 **도달 불가**가 됐으나 enum 유지(과거 receipt 해석 보존) — test가 전수 128조합에서 고정
- M4/T3 테이블 `phase` 축(pre/finish). implement 16→19(pre 14 + finish 5). `clarify`/`distill` finish 이동 + `polish`/`harden`/`optimize` 신설. `onboard`은 "없던 표면을 새로 짓는" 성질이라 제외. plan/prd/pr 출력 바이트 동일
- M4/T4 `restampRoutedCommands` + `cli.js restamp-routed` — append-only(중복=drift 신호) ∧ **restamp 내 멱등**(tail match, 락 **안**). 게이트 `mccp-implement-codex` 한정, 여분 키 거부, 경로 resolve
- M4/T5 prp-implement 재배선 — 2.5.5b `phase:"pre"` 명시 · Phase 3.6 전면 교체(오라클 구동 → 처리 → restamp) · 낡은 문단 정정. **duplicate-call 불변식이 산문에서 phase 필터로 이동**
- M4/T6 test — routing +11(전수 128조합) · restamp-routed 14 신규 · guard 짝 단언 4(`phase:"finish"` ⟺ `restamp-routed`)
- M4/T7 gate-design `#### 게이트 발화 정합` · CLAUDE.md §3.10(낡은 stage→command 나열 제거) · CHANGELOG 1.31.4 · 4면 동기 · PRD milestone 4 complete · backlog 5건 이연
- M4/T8 라이브 — finish 오라클 5종 `invoke` → `impeccable:impeccable`로 전부 완주(어느 것도 멎지 않음) → restamp 착지. receipt에 finish 5건, `shape` non-recommend 0건, 재생 시 `noop:true`
- 검증: V1 37/37 · V2 14/14 · V3 16/16 · V4 81/81 · **V5 682(681 pass·0 fail)** · V6 10/10 · V7 C1~C4 pass · V8 매트릭스 일치
- 리뷰 산출: Codex R1 divergent(HIGH 2건 전건 흡수) · security-reviewer 4건 흡수 + 2건 PASS 독립 확인(F3 HIGH→MEDIUM 증거 정정) · backlog 5건 이연

## In Progress


## Next Step
`/mccp:prp-commit` (scratch 파일 0건 확인) → `/mccp:pr`. PR 진입 직전 §3.7 version 재계산 필수(origin/main 1.31.0, 로컬 1.31.4). PR 진입 시 슬러그 분리 결정 필요 — Open Questions 1번.

## Last Decision
plan-codex receipt가 base 슬러그에 실려 있어(`/mccp:plan`이 PRD 경로로 호출된 결과) implement가 도출한 `-m4`에서 missing이었다. plan 본문 해시가 receipt의 `reviewed_plan_hash`와 동일함을 실측 확인해 "게이트는 이 본문에 실제로 돌았다"를 입증한 뒤, 사용자 승인 하에 §3.16의 감사 우회로 진행했다 — 재실행은 동일 본문·동일 리뷰어라 새 정보 없이 파일명만 얻고 약 16분을 재지불한다. receipt 파일명 변경은 §3.12 no-rehash·§3.16 위조 금지라 하지 않았다. 사유는 notes 첫 절에 감사 앵커로 기록.

## Open Questions
- **[PR 차단 예상] chain이 슬러그로 갈려 있다.** `-m4`에는 implement-codex만, base에는 plan-codex만 있어 두 receipt가 공존하는 슬러그가 없다. `/mccp:pr`은 인자 없이 base를 도출하므로 implement-codex missing으로 본다(실측 exit 2). 선택지: (a) 감사 우회 + 사유 기록, (b) base 슬러그에 implement-codex 추가 발행(중복이지 위조는 아니나 감사 표면이 흐려짐), (c) `/mccp:plan`을 plan 경로로 재실행(패널 약 16분). **사용자 결정 사항.**
- 설치된 plugin cache가 1.31.0(pre-M1)이라 `${CLAUDE_PLUGIN_ROOT}` 경유 호출은 옛 술어로 돈다. 이번 사이클의 `restamp-routed`는 그 cache에 없어 **실제로 3회 실패**했고(fail-open 경로가 설계대로 복구), STATE.md의 `dep_check_missing: impeccable`도 그 옛 술어가 남긴 stale 값이었다(현재 측정으로 정정). 머지 후 `claude plugin update` 필요
- 디자인 게이트 트리거는 EXECUTE 이전에 평가되므로, 디자인 화이트리스트 파일을 편집하는 milestone은 자기 pre-EXECUTE 트리거를 구조적으로 켤 수 없다(2.5.5b false → EXECUTE 후 true). §3.9가 인정한 성질의 같은 계열이며 M4가 만든 것이 아니다
- `receipt/tests/`가 `write()` 1회당 60초(briefing LLM 타임아웃 소진, 실측 61,036ms). 신규 test는 `MCCP_BRIEFING=off`로 11초. 기존 test는 그대로 — backlog 기록
- (main 승계 red 54건) santa-loop-cap 28 · santa-adjudication 22 · review-single-pass-fields 2 · santa-lanes 1 · session-processes-reclaim 1. **M4가 만든 red는 0**
- (cleanup) `.worktrees/m3-baseline` · `.worktrees/review-loop-bypass-m2` 잔존

## Last Updated
2026-08-23T07:48:47.029Z
