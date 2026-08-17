# Implement-Gate Record — multi-session-work-loop M6

> `/mccp:prp-implement` Phase 2.5의 게이트 기록. **plan 본문이 아니라 이 노트에 둔다** —
> 2.5.4가 지시하는 plan 본문 주입은 plan hash를 바꿔 상위 `mccp-plan-codex` receipt를 즉시
> stale로 만든다. 본 cycle에서도 실측으로 재현했다(주입 후 `validate` exit 2,
> `receipt_plan_hash sha256:e2338ca5…` ↔ `current_plan_hash sha256:16a38ae7…`). 선례는
> `gate-guard-integrity-m3-implement-gate.md`이며 같은 근거로 plan hash를 보존한다.

- plan: `.claude/plans/multi-session-work-loop-m6.plan.md`
- decision: `multi-session-work-loop-m6`
- branch: `v1.24.0-multi-session-m6` (base `origin/main` @ `767a2c7`, v1.26.2)

## Codex Implementation Review

> Codex skipped per `MCCP_CODEX_DISABLED=1` (env-level policy, first-class)

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` →
  `classification=disabled` · `blocking=false` · `advisory=false` · `durationMs=0`
  (spawn 직전 short-circuit)
- 라운드 수: 0
- 합치 결론: **없음 — implement 단계에서 cross-model 검증을 획득하지 못했다.** plan 게이트와
  같은 공백을 승계한다. `CODEX_VERDICT='skipped'`로 receipt에 봉인되며, cross-gate dedupe는
  `converged` 외 모든 값에서 fail-closed이므로 `/mccp:pr`의 PR-Codex는 그대로 발화한다.
- YAGNI Triage: 해당 없음 (finding 0건 — Codex 미발화)
- Deferred to backlog: 0
- Open Questions: 없음
- Codex session 참조: 없음 (env-level skip)

## 착수 시 실측 편차 (구현 시작 전 확정)

| # | 항목 | 계획 | 실측 | 처리 |
|---|---|---|---|---|
| D1 | base 트리 | `c5b2e04` (M5 ship) | `origin/main`이 102 커밋 앞섬 (`767a2c7`) | Task 0 착수 **전** fast-forward 병합. HEAD가 main의 조상이라 고유 커밋 0 — 충돌 없음 |
| D2 | plugin version | `1.23.10 → 1.23.11` | main이 이미 `1.26.2` | `1.26.2 → 1.26.3`. §3.7 forward-only 상향(7번째 재발). plan Risks 표가 이 편차를 사전 승인 |
| D3 | 활성 PRD 수 | 1개 (분모 작음) | 9개 | B1 분모가 실질화됐다. Risks의 "활성 PRD가 1개뿐이라 분모가 작다"(낮음)가 자연 해소 |

D1을 Task 0보다 먼저 처리한 이유는 앵커 불변식이다 — 병합을 Task 0 뒤로 미루면 활성 PRD가
1개에서 9개로 늘면서 `anchor.prd_milestone_rows`가 before/after 간에 어긋나고, Validation §3이
`denominator incommensurable`로 throw해 Task 0 재실행이 강제된다.

## Security Reviewer

> security-reviewer unavailable, skipped (auto-fallback): 이 세션은 subagent(Task tool) 발화를
> 금지하는 harness 정책 아래에서 동작하므로 `Task(mccp:security-reviewer)`를 호출할 수 없다.

이 축은 **fail-closed로 남긴다** — receipt에 `security_skipped=true`가 실리고 `validate-cmd`가
implement·pr 게이트에서 이를 blocking으로 취급하므로 `/mccp:pr`은 이 상태로 통과하지 못한다.
게이트를 조용히 approving으로 만들지 않기 위한 의도된 결과다.

공격면은 실재한다 — 파생 `decision_id`가 git 인자와 receipt 경로 성분으로 들어간다. plan의 L2
패널 `security` 관점이 R4·R5·R6·R8 4회 연속 PASS로 이 축을 대조했고(경로 traversal · receipt
경로 주입 · git 인자 분리 `--` · evidence 스키마 신뢰 경계 · `receiptPresent` 신뢰),
구현은 그 판정을 따른다. 그러나 **plan 리뷰는 produced code 리뷰가 아니므로** 이 fallback을
대체하지 않는다.

## Design Review

- 트리거: axis (c) `MCCP_DESIGN_INTENT_REASON` audited override (strict validator `ok:true`).
  axis (a) detector는 `design_signal=false`(EXECUTE 전이라 diff에 렌더 표면 0건) — 문서화된
  pre-EXECUTE detector 맹점이며 override가 그 escape다.
- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md`
  `## Output Constraints` Read 완료
- 라우팅: mode `auto` · `renderingSurface=false` → refine/discovery 전부 `recommend` 강등.
  `audit`은 `invoke`로 라우팅됐으나 대조할 produced diff가 없어 `skipped`로 정직 기록하고
  Phase 3.6(post-EXECUTE)으로 이연했다.
- critique retry loop: **Phase 3.6으로 이연**. implement 스코프의 Edit 대상은 produced code/diff인데
  EXECUTE 전에는 그것이 존재하지 않아 이 시점의 critique 라운드는 공허하다. plan 단계 critique이
  이미 누적 4라운드 `CONVERGED`로 4개 제약을 Task 5 본문에 못박았고, 그 위에
  (i) Phase 3.6 clarify/distill/polish + audit,
  (ii) Phase 3.7 produced-diff grounding lint(H15, `enforce`),
  (iii) Task 5의 detector 비의존 회귀 단언 4축(`msw-metrics-render.test.js`)이 얹힌다.
  receipt에는 `design_critique_verdict`를 **stamp하지 않는다** — 돌지 않은 라운드를 `converged`로
  적으면 위조다. 부재는 `/mccp:pr`을 막지 않으며(오직 `divergent`만 막는다), 실제 판정은
  Phase 3.7이 `design_grounding_verdict`로 restamp한다.
- 설계 방향 봉인: `design-direction--multi-session-work-loop-m6.json`
  (baseline `767a2c7` · output constraints 4 · required signals 0 — 제어면 변경이라
  enforce 모드의 inconclusive-on-absence 경로를 켜지 않는다)
