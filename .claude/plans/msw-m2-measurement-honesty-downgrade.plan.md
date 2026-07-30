# Plan: MSW M2 measurement-honesty downgrade (B2/A4/A2 → forward-only)

**Source**: free-form (`/mccp:plan`) · 근거 `.claude/reviews/pr-114-r3-codex-findings.md`
**Gate origin**: Codex R3 cross-model NO-SHIP (2 HIGH + 1 MEDIUM), 전부 실코드 재현 검증
**Complexity**: Small (국소 정합 변경 · 신규 producer/flag 없음)
**Revision**: Plan-Codex R1/R2/R3 흡수 — **B2/A4/A2 전부 C1-패턴**(claimedComputable 제거), A2 producer null-emit

> **⚠️ 정정 (re-R3 F0, 2026-07-26)**: 본 plan 작성 시점 결정은 claimed-computable = `[A1, B3]`였으나,
> 이후 **재-R3 F0에서 A1도 forward-only로 강등**됐다 — production에 `task_completed` KIND 이벤트를 emit하는
> live producer가 없어(session-end는 `session_end` KIND + `task_completed:false` 필드만 방출) 실 derive에선
> A1이 항상 forward-only다(B2를 제거한 PF2 논리 동일 적용). **최종 shipped 계약은 claimed-computable = `[B3]`만**이다.
> 정본은 `derive/cli.js`(`claimedComputable = [B3]`) + `msw-metrics-acceptance.test.js`(`CLAIMED_COMPUTABLE = [B3]`).
> 아래 본문은 이 정정을 반영해 `[B3]`로 갱신됐다.

## Summary

Codex R3가 확인한 measurement-honesty 결함 3건(B2 collision producer 부재, A4 self-credit,
A2 stale/cross-session context 귀속)을 닫는다. **세 metric 전부 C1-패턴으로 강등**한다:
claimedComputable에서 **제거**(`[B3]`만 잔류 — re-R3 F0에서 A1도 동일 강등), `computeB2/A4/A2`는 **무조건 forward-only**,
validity flag·fixture 주입 **없음**(masquerade 회피). 추가로 A2 오염원을 막기 위해 producer
(`session-end.js`)가 검증 불가 context%를 `null`로 emit해 append-only 로그 오염을 **중단**한다.

실 producer(collision 감지 + 독립 presence marker)/boundary-scan/session-tag 구현은 후속 milestone 이연.
목표: 재-R3 시 Codex 수렴.

## 설계 근거 — 왜 넷(A1/A2/A4/B2) 다 C1-패턴이고 B3만 claimed인가 (Plan-Codex R1/R2/R3 + re-R3 F0 흡수)

`fixture.js:8-9,43-44` + `derive/cli.js:210-213` 확립 규칙 + Plan-Codex R1(PF1/PF2/PF3)·R2(PR2)·R3(2건):

- **claimed-computable 자격 = "computed를 정직하게 낼 수 있는가"** — 여기엔 **computed-ZERO**도 포함된다.
  - **A1 (작성 시점 유지 → re-R3 F0에서 제거)**: 작성 시점엔 `completions_producer_present`가 `task_completed`
    **KIND 이벤트 존재**로 live flip(session-activity.js:76-78)하므로 claimed로 뒀으나, production엔 그 KIND를
    emit하는 live producer가 없어(session-end는 `session_end` KIND + `task_completed:false`만 방출) 실 derive에선
    항상 forward-only다. B2를 제거한 PF2 논리를 동일 적용해 재-R3 F0에서 claimedComputable에서 **제거**했다
    (flag가 live-derivable이라 producer 배선 시 재편입 가능). fixture만 flag를 주입해 compute 경로를 실증한다.
  - **B3 (유지)**: toggle-usage 실 source가 배선돼 실 값 산출.
  - **B2 (제거)**: collision 감지 pass가 production에 없다. flag를 "collision 이벤트 관측"으로 도출하면(초안 R2 수정)
    사실상 `collision_events_count>0`과 동치라, **producer가 배선됐지만 collision이 0인 정당한 `computed 0/N`을 못 낸다**(R3-F0).
    독립 presence marker(collision 없이도 "감지 pass가 돌았다"는 신호)를 만드는 것 = producer를 만드는 것 = out of scope.
    → 독립 신호가 생기기 전까지 forward-only + claimedComputable 제거(R2/R3 권고).
  - **A4 (제거)**: scanner가 현재 세션 self-credit(오염된 계산, ≠미배선). fixture flag 주입 = masquerade(PF1). claimed 계약(null numerator 거부) 위반(PF2).
  - **A2 (제거)**: scanner가 unverified stamp 수용(오염). 동일 이유 + producer가 오염값을 계속 기록(PF3) → null-emit로 원천 차단.

- **왜 flag/fixture 주입을 아예 안 하나**: 오염되거나 producer-부재인 metric에 fixture flag를 주입하면 "고쳐지지 않은 코드"를
  위장(C1 masquerade, fixture.js:43-44). 셋 다 forward-only는 numerator null이고 claimedComputable은 null을 거부하므로,
  목록에서 빼는 것이 production computability를 정직히 대표한다(PF2). 전용 회귀 test가 claimed-computable gate 대신 커버.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| C1-패턴 forward-only(B2/A4/A2용) | `plugins/mccp/scripts/lib/msw-metrics/index.js` computeC1 (≈L294-308) | source-check 후 **무조건** forward-only, claimedComputable 제외, fixture 미주입 |
| claimedComputable 정책 | `plugins/mccp/scripts/derive/cli.js:210-220` | 실 production producer로 computed(zero 포함) 가능한 metric만 유지(B3). 오염/부재/미배선(A1 포함)은 제거 |
| producer null-emit(A2) | `plugins/mccp/scripts/hooks/session-end.js:353-365` | 검증 불가 신호는 값 대신 null emit — 오염 샘플 기록 금지 |
| Tests | `plugins/mccp/scripts/lib/tests/msw-metrics.test.js` · `msw-metrics-acceptance.test.js` · `msw-derive-sources.test.js` | `node --test`, per-metric status/numerator 단언 |

## Files to Change
| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/msw-metrics/index.js` | UPDATE | computeB2·computeA4·computeA2를 source-check 후 **무조건 forward-only**(C1형, 각 오염/부재 사유). B2의 denominator-zero invalid·collision rate 계산 경로는 제거(비청구 metric엔 불필요) |
| `plugins/mccp/scripts/derive/cli.js` | UPDATE | `claimedComputable = [B3]` (B2·A2·A4·A1 제거 — re-R3 F0). 사유 주석(PF2·R3-F0) |
| `plugins/mccp/scripts/hooks/session-end.js` | UPDATE | (PF3) `context_remaining_pct: null` emit — 검증 불가 latent-wins 값 기록 중단. 사유 주석 |
| `plugins/mccp/scripts/lib/msw-metrics/fixture.js` | UPDATE | 주석 갱신(claimed=`[B3]`) + A1 `completions_producer_present` flag 제거 → A1도 fixture서 forward-only. **어느 downgraded metric도 flag 주입 없음**(A1 compute-path는 전용 unit test가 실증). 기존 데이터는 무해하게 잔류 |
| `plugins/mccp/scripts/lib/tests/msw-metrics.test.js` | UPDATE | B2/A4/A2 forward-only, A4 self-credit·A2 stale/cross-session·A2 producer-boundary 회귀 test |
| `plugins/mccp/scripts/lib/tests/msw-metrics-acceptance.test.js` | UPDATE | claimedComputable=`[B3]` 반영, A1/A2/A4/B2 non-claimed·forward-only 확인 |
| `plugins/mccp/scripts/lib/tests/msw-metrics-render.test.js` | UPDATE(필요 시) | B2/A4/A2 forward-only 렌더 확인 |

> `session-activity.js`/`handoff-items.js` scanner는 **flag 변경 불필요**(C1-패턴은 무조건 forward-only라 producer flag 없음). `plugin.json`은 이미 `1.22.7`(미ship M2). renderer는 A1/C1 forward-only 렌더 재사용 → 신규 코드 불요.

## Tasks

### Task 1: computeB2·computeA4·computeA2 무조건 forward-only (C1-패턴)
- **Action**: 각 함수에서 source-unavailable 체크 뒤 **즉시** `return {…status:'forward-only', numerator:null, denominator:<의미있는 분모 or null>, integrity_ok:true, invalid_reason:<사유>}`.
  - B2: `denominator: concurrentPairs`, 사유 `'no live collision producer (production emits only session_start/session_end; computed-zero needs an independent producer-presence signal)'`. 기존 denominator-zero invalid·rate 계산 경로 제거.
  - A4: `denominator: itemsLeft`, 사유 `'restore rate not boundary-scoped (scanner self-credits current-session handoff items)'`. denominator-shrink/computed 경로 미도달.
  - A2: `denominator: (sessions.length||null)`, 사유 `'context% not session-bound/freshness-verified'`.
- **Mirror**: computeC1 (무조건 forward-only)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/msw-metrics.test.js`

### Task 2: claimedComputable = [B3] (PF2·R3-F0·re-R3 F0)
- **Action**: `derive/cli.js:214-220`에서 A2·A4·B2·A1 제거 → `[B3_TOGGLE_AXES]`. 주석: A2/A4는 오염 source, B2는 독립 producer-presence 신호 부재라 computed-zero 불가 → C1과 함께 제외. A1은 flag가 live-derivable이나 production에 task_completed KIND producer가 없어 실 derive에선 forward-only → 동일 PF2 논리로 제거(re-R3 F0). producer 배선 시 재편입 가능.
- **Validate**: `node plugins/mccp/scripts/derive/cli.js metrics-assert --fixtures --json` (exit 0)

### Task 3: session-end.js context% null-emit (PF3)
- **Action**: `session-end.js:353-357` — `contextRemainingPct`를 **항상 null**로 emit(session-bound freshness 검증 경로 부재). 주석: "unverified latest-wins context를 A2 샘플로 기록 금지(PF3). session-bound 검증(후속) 시 실값 emit." session_end 이벤트 다른 필드 불변.
- **Mirror**: fail-loud-open producer 관례
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/msw-metrics.test.js` (producer-boundary test)

### Task 4: fixture 주석 갱신 (flag 주입 없음)
- **Action**: `fixture.js` 상단 주석을 claimed=`[B3]`로 갱신 + "A1/A2/A4/B2 모두 forward-only, fixture 미주입(masquerade 회피)". **A1의 `completions_producer_present` flag도 제거**(re-R3 F0 — downgraded·non-claimed metric에 forcing flag 잔존은 masquerade). A1 compute-path는 전용 unit test(`msw-metrics.test.js` 'A1: work completion rate computes value')가 자체 model로 실증.
- **Validate**: metrics-assert --fixtures exit 0 (claimed B3만 compute; A1/A2/A4/B2 모두 fixture서 forward-only)

### Task 5: 회귀 test (Codex R3 next_steps 반영)
- **Action**: msw-metrics.test.js / msw-derive-sources.test.js / acceptance —
  (a) 실-corpus·fixture 양쪽에서 B2/A4/A2=`forward-only`,
  (b) **A4 self-credit**(현재 세션 sidecar만 있는 모델 → forward-only, computed 100% 아님),
  (c) **A2 stale/cross-session**(unverified → forward-only),
  (d) **A2 producer-boundary**(session-end null-emit → 로그에 오염값 미기록),
  (e) claimedComputable=`[B3]`; A1/A2/A4/B2 non-claimed 확인,
  (f) B3는 fixture·실 derive 양쪽 `computed`; A1은 양쪽 `forward-only`(compute-path는 전용 unit test가 자체 model로 실증).
- **Validate**: 4개 `node --test` + metrics-assert

## Validation
```bash
node --test plugins/mccp/scripts/lib/tests/msw-metrics.test.js
node --test plugins/mccp/scripts/lib/tests/msw-metrics-acceptance.test.js
node --test plugins/mccp/scripts/lib/tests/msw-metrics-render.test.js
node --test plugins/mccp/scripts/lib/tests/msw-derive-sources.test.js
node plugins/mccp/scripts/derive/cli.js metrics-assert --fixtures --json   # exit 0 (claimed=[B3])
node plugins/mccp/scripts/derive/cli.js run --json > /dev/null             # 실 derive 무크래시
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| A2/A4/B2 제거가 gate 회귀 미탐지 | Med | (b)(c)(d) 전용 회귀 test가 A4 self-credit·A2 stale·A2 producer-boundary를 직접 잠금 — claimedComputable 대신 전용 test 커버 |
| session-end null-emit가 다른 소비처 파손 | Low | `context_remaining_pct`는 A2 전용. producer-boundary test로 확인. 다른 event 필드 불변 |
| B2 forward-only가 concurrent-pairs 관측까지 죽임 | Low | denominator에 `concurrentPairs` 유지 — 병행성 관측 보존, rate만 미주장 |
| 재-R3(diff)가 또 다른 결함 발견 | Med | 재-R3 수렴이 최종 acceptance. 미수렴 시 재triage |

## Acceptance
- [ ] Task 1-5 완료
- [ ] 6개 validation pass (metrics-assert --fixtures exit 0, claimed=[B3])
- [ ] 실 derive·fixture 양쪽: A1/A2/A4/B2=`forward-only`, B3=`computed`; A1 compute-path는 전용 unit test가 실증
- [ ] A4 self-credit·A2 stale·A2 producer-boundary 회귀 test가 결함 재현 잠금
- [ ] 패턴 재발명 없음 (B2/A4/A2 = C1 미러)
- [ ] 재-R3 Codex 수렴 (별도 `/mccp:pr` 재실행 acceptance)

## Design Critique

- verdict: **converged** (rounds=1)
- 근거: impeccable-detect `design_signal=true`이나 `signal_files` 전부 backend derive-source(rendered UI ext 0).
  metric status 값만 변경, 렌더는 기존 A1/C1 forward-only 경로 재사용(renderer 신규 코드 0). impeccable skill
  스코프("Not for backend-only or non-UI tasks") 밖 → 4 Output Constraints 평가 대상 부재. 정직 converged.

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2) — 워크트리 스크립트(cache 1.22.5 stale)
- 라운드 수: R1 + R2 + R3 (+ R4 재검증 예정)
- 합치 결론: R1 NO-SHIP(3 HIGH) → R2 NO-SHIP(1 HIGH) → R3 NO-SHIP(1 HIGH+1 MED) → 본 개정판이 B2를 C1-패턴으로 단순화해 전건 흡수
- YAGNI Triage:
  | Finding | Round | Sev | Verdict | 해결 |
  |---|---|---|---|---|
  | PF1 A4/A2 fixture 플래그 masquerade | R1 | HIGH | ACCEPT_NOW | A4/A2 → C1-패턴(claimedComputable 제거, fixture 미주입) |
  | PF2 claimedComputable가 production forward-only 은폐 | R1 | HIGH | ACCEPT_NOW | 오염/부재 metric 제거 → R1시 `[A1,B3]`, re-R3 F0서 A1도 제거 → `[B3]` |
  | PF3 A2가 오염 샘플 계속 기록 | R1 | HIGH | ACCEPT_NOW | session-end.js context% null emit |
  | PR2 B2 하드코딩 false → live 경로 부재 | R2 | HIGH | ACCEPT_NOW | (R3에서 심화) — B2도 C1-패턴으로 |
  | R3-F0 B2 flag가 collision-positivity 조건부 → computed-zero 불가 | R3 | HIGH | ACCEPT_NOW | B2 claimedComputable 제거·무조건 forward-only(독립 producer-presence 신호는 out-of-scope milestone) |
  | R3-F1 B2 forward-only 분기가 denominator-zero invalid보다 앞섬 | R3 | MED | ACCEPT_NOW | B2 무조건 forward-only(C1)라 flag 분기 자체가 소멸 — ordering 이슈 무효화 |
- Deferred to backlog: 0 (전건 plan 개정 흡수; 실 producer/boundary/session-tag/독립 presence marker 구현은 원래 out-of-scope milestone 이연)
- Open Questions: 없음 (R4 재검증으로 수렴 확인 예정)
- Codex session 참조: thread(plan-R1/R2/R3) — R4로 수렴 확인
