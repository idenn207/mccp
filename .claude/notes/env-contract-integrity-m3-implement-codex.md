# Implement-Codex — env-contract-integrity M3 (라운드 캡 기계 강제)

> plan 본문(`.claude/plans/env-contract-integrity-m3.plan.md`)은 **편집하지 않는다.**
> `mccp-plan-codex/env-contract-integrity.json`이 그 plan의 `plan_hash`를 봉인했고,
> `/mccp:pr` 2.5.8·2.5.9가 그 hash를 재계산하므로 본문을 고치면 이번 사이클의 PR이
> staleness guard에 막힌다(§3.11 guard 2 · M2 사이클 선례).

## Codex Implementation Review

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (`MCCP_GATE_ROUND_CAP=3`이지만 CLAUDE.md §3.16이 1라운드를 기본으로 못박는다)
- classification: `ok` · durationMs 55266 · structured verdict `needs-attention` → `CODEX_VERDICT=divergent`
- 합치 결론: 봉인·원장·두 chokepoint라는 골격에는 이견이 없다. 세 지적은 전부 **강제의 견고성**을
  겨냥한다 — 단일 봉인 파일의 동시성, 원장 mutation의 lock kill switch, 열화 상태의 조용한 fail-open.
  하나(F2)는 그 자리에서 흡수하고 둘(F1·F3)은 절반을 흡수한 뒤 구조 변경분을 backlog로 이연한다.

### YAGNI Triage

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| F1 저장소 단위 단일 봉인이 동시 게이트를 오키잉 | HIGH | ACCEPT_NOW (부분) + DEFER_TO_BACKLOG (잔여) | 봉인 스키마에 `gate_id`·`decision_id`를 **명시 필드로** 넣고(Codex가 "underspecified"라 지적한 부분) 만료를 `codex-policy.MAX_SEAL_AGE_MS`로 결속한다. 완전한 run-scoped 봉인 정체성은 `codex-policy`·`REVIEW_DIR`과 공유하는 축이라 M3 범위 밖 — §3.13.3이 같은 성질을 이미 "동시 게이트는 worktree를 나눠 돌린다(§3.8)"로 규정했다 |
| F2 원장 mutation이 `MCCP_EVIDENCE_CONFLICT_GUARD` kill switch를 상속 | HIGH | ACCEPT_NOW | 전면 수용. `guardedReadModifyWrite(..., {mode:'enforce'})`를 무조건 넘긴다. 캡 원장에서 직렬화는 하드닝이 아니라 정확성이다 — lost update는 라운드를 **적게** 세어 캡을 fail-open시킨다. `santa/ledger.js`가 같은 함정을 이미 문서화했고 test가 `off` 상속 하에서 동시 기록을 단언한다 |
| F3 열화 상태(부재·만료·판독불가)의 조용한 fail-open | HIGH | ACCEPT_NOW (부분) + DEFER_TO_BACKLOG (잔여) | 흡수하는 핵심은 **가시성**이다("warnings are easy to miss"가 이 지적의 가장 강한 절). `meta.round_ledger_count`를 «원장을 상의하지 못함 = `null`» / «상의함 = 정수(0 포함)»로 갈라 열화가 stderr가 아니라 **receipt에** 남게 한다. 구조적 fail-closed(managed-run enrollment)는 이연 — 손상된 봉인 하나가 R1까지 거부하면 그 게이트는 리뷰를 **0회** 받고 divergent로 접히며, 그것은 캡 강제가 막으려는 것보다 큰 해다 |

- Deferred to backlog: 2 → `.claude/plans/codex-findings-backlog.md`
- Open Questions: 없음 (auto-CRITICAL 카탈로그 해당 없음 — 보안 경계 변경·원자적 상태 파괴·schema 파괴 모두 부재. present-only 3필드는 additive)
- Codex session 참조: `<git-dir>/mccp/tmp/codex-out.json`

### 흡수가 구현에 남기는 계약

1. `review-rounds/ledger.js`의 모든 mutation은 `{mode:'enforce'}`를 **무조건** 넘긴다 (F2).
2. 봉인 본문은 `{schema_version, gate_id, decision_id, cap, pinned, pinned_by, mode, sealed_at}`로
   정체성을 명시한다 (F1).
3. `meta.round_ledger_count`는 `integer | null`이고 `null`은 "강제가 돌지 못했다"를 뜻한다 (F3).

### Security Reviewer

> security-reviewer skipped (operator policy, **not** unavailable): 이 세션의 운영자 지시가
> "Do not call the AgentTool unless the user requested it"이고 사용자는 subagent 리뷰를 요청하지
> 않았다. 도구가 없거나 실패한 것이 아니므로 auto-fallback 문구를 쓰지 않는다. receipt에
> `security_skipped=true`로 정직하게 봉인하며, 그 결과 이 receipt는 non-approving이 되어
> `/mccp:pr` validator가 fail-closed로 처리한다 — 즉 건너뛴 대가를 게이트가 실제로 치른다.
> 대상 표면은 path containment(`assertContained` + `SLUG_RE`) · 파일 mode `0o600` ·
> traversal 방어이며, 전부 `santa/ledger.js`의 하드닝된 선례를 그대로 미러한다.

### Design Review

> impeccable silent-skip: `skill_available=true` · `design_signal=false` · reason `no-signal`.
> 이는 backlog에 이미 HIGH로 적재된 실측 축이다 — pre-EXECUTE detector는 깨끗한 worktree에서
> tracked diff를 보므로 "이제부터 바꿀 파일"을 구조적으로 볼 수 없다. receipt에
> `impeccable_silent_skip=true`로 stamp한다(게이트 시점 관측).
