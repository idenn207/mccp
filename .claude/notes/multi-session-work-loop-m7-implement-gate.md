# multi-session-work-loop M7 — implement-gate notes

> plan 본문(`.claude/plans/multi-session-work-loop-m7.plan.md`)은 `mccp-plan-codex`
> receipt가 `plan_hash`(`sha256:f6bfde5a…`)로 봉인한 대상이라 게이트 산출물을 본문에
> 주입하지 않는다(santa-evidence-diversity M1~M3 · santa-adjudication M1~M3 선례).
> `/mccp:prp-implement` Phase 2.5.4가 허용하는 대체 자리에 기록한다. 본문을 편집하면
> receipt가 stale이 되어 `/mccp:pr`이 §3.11 guard 2에 막힌다.

## Codex Implementation Review

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review`
  (fail-closed Bash wrapper, v0.2.2) → `classification=disabled` · `blocking=false` ·
  `durationMs=0`
- **Codex skipped per `MCCP_CODEX_DISABLED=1`** — v0.3.5 first-class skip. spawn 직전
  short-circuit이라 Codex는 발화하지 않았고 advisory mode(`MCCP_ALLOW_CODEX_UNAVAILABLE`)도
  필요 없다.
- 라운드 수: 0 (호출 자체가 skip). 라운드 캡은 `MCCP_REVIEW_SINGLE_PASS=deadline_pressure`가
  `MCCP_GATE_ROUND_CAP=3`과 무관하게 **1로 고정**했다(§3.15 — 토글이 상위 정책).
- `resolution.codex_verdict = 'skipped'`. **cross-gate dedupe는 fail-closed 유지** —
  `dedupe.js#evaluateForDedupe`가 `converged` 외 어떤 값에도 skip을 허용하지 않으므로
  `/mccp:pr`에서 PR-Codex가 ship 시점에 실제로 발화한다.
- 합치 결론: **cross-model 축이 이번 사이클에 발화하지 않았다.** 아래 Security Reviewer가
  그 자리를 대신하지 않는다 — 다른 축이다. 이 한계를 주장하지 않고 그대로 기록한다.

### 2.5.1 cross-gate dedupe — 미적용

plan의 `## Codex Adversarial Review`는 Phase 5.1이 넣은 **placeholder 그대로**다
(`MCCP_PLAN_REVIEW=multi-agent`에서는 Phase 5.3 주입이 스킵되고 plan이 동결되므로 정상).
`합치 결론` 줄이 없어 2.5.1의 전제가 성립하지 않는다 → dedupe 미적용, 게이트 정상 진입.

### 2.5.2 implement-time 결정 (plan이 선약정하지 않은 것)

1. 레지스트리 파일 I/O 형태 — `fs.appendFileSync` 단일 write(batch N줄) · `seq`를 파일 끝에서 재계산
2. `finding_id` 정규화 절단 길이와 sha256 앞 16자 관용구
3. derive source 반환 shape의 필드명 고정
4. coverage gate의 정적 스캔 축 재사용 범위(b2 3축 중 어느 것을 승계할지)
5. 승격 항목의 주입 렌더 형태(`## Open Findings` 블록 문면)

### Security Reviewer

- 호출: `Task(mccp:security-reviewer)` — 실행됨. auto-fallback 없음 → `security_skipped` 미stamp.
- 대상: DD9 주입 경계 · DD4 경로 정규화 · Task 1 lock-free append · Task 7 coverage gate.

| # | Severity | 지적 | 처리 |
|---|---|---|---|
| S1 | CRITICAL | `intent-context.js`의 sanitizer 4종이 `module.exports`에 없어 DD9의 "재사용"이 실행 불가 | **ACCEPT_NOW** — Task 5가 export를 연다(이미 plan 범위). 구현으로 흡수 |
| S2 | HIGH | 미검증 리뷰어 텍스트가 `state-injector` 경유로 다음 세션 프롬프트에 도달. sanitize 여부를 단언하는 test 부재 | **ACCEPT_NOW** — `C1-PROMOTE-SANITIZED`가 호출 여부와 그 귀결을 단언 |
| S3 | HIGH | `.gitattributes`에 `merge=union` 부재 → 병렬 worktree 병합이 한쪽 append를 조용히 버림 | **ACCEPT_NOW** — Task 1이 선언 + `C1-MERGE-UNION`(단언) + `C1-GATE-MERGE-UNION`(게이트) |
| S4 | HIGH | Task 2·3 동시 착지가 post-commit 게이트로만 강제됨 | **ACCEPT_NOW** — Task 2의 test가 `SOURCE_SCANNERS.findings`를 직접 단언(pre-commit 축). 두 Task를 한 커밋으로 착지 |
| S5 | MEDIUM | 호출자가 사전 정규화하면 "단일 초크 포인트"가 사실이 아님 | **DEFER_TO_BACKLOG** — Task 7 `APPROVED_REGISTRY_WRITERS`가 직접 write는 막지만 *사전* 정규화는 정적으로 못 본다. §3.14대로 이연 |
| S6 | MEDIUM | 리뷰어 주장 severity와 프레임워크 판정이 갈릴 때 어느 값을 기록하는지 미명세 | **DEFER_TO_BACKLOG** — 구현 결정을 기록으로 고정한다: **생산 게이트가 낸 값을 그대로 기록한다**(`l2.json` / codex finding의 `severity`). 그 외의 severity는 존재하지 않으므로 선택지가 하나뿐이고, 리뷰어 인플레이션은 이 레지스트리가 아니라 게이트 쪽 축이다 |

- Deferred to backlog: 2 → `.claude/plans/codex-findings-backlog.md`
- Open Questions: 없음 (§0 auto-CRITICAL 카탈로그 해당 0건 — secret 노출 · 데이터 손실 ·
  비가역 마이그레이션 · auth 우회 · 외부 목적지 변경 · crypto 키 어디에도 걸리지 않는다.
  S1의 CRITICAL은 "export 누락"이며 그것은 이미 plan Task 5의 작업 항목이다)

### Design Review

- `impeccable-detect.js detect --mode implement` → `skill_available=true` ·
  `design_signal=false` · `reason=no-signal` · `silent_skip=true`.
- 게이트 진입 시점의 diff가 비어 있어 detector가 렌더러 표면을 보지 못한다(Task 6이
  `renderer/sections/msw-metrics.js`를 건드리지만 그것은 EXECUTE의 산출물이다). plan의
  `## Design Critique`가 이미 R0~R1로 `CONVERGED` 판정을 봉인했고, 이 시점 gap은
  santa-evidence-diversity M2가 기록한 것과 같은 형태의 선재 한계다.
- receipt forward: `--impeccable-silent-skip --impeccable-silent-skip-reason "no-signal"`.
  M1 계약대로 informational warning이며 강제 아님. `IMPECCABLE_FORCE_OVERRIDE_REASON` 미설정.
- routing / critique retry loop / 2.5.5c grounding capture: **미실행**(트리거 미발화).
  따라서 Phase 3.7 DESIGN GROUNDING VERIFY도 no-op이다.
