# Codex 비활성 정책의 라운드 불변성 (codex-disabled-round-invariant)

## Problem

`MCCP_CODEX_DISABLED=1`은 운영자가 "이 환경에서 Codex를 부르지 않는다"고 선언하는 **영구 정책**이다. 그런데 이 선언은 게이트의 첫 라운드(R1)에서만 지켜지고, escalation 라운드(R2 이상)에서는 무시된다. 실행 모델이 이 플래그를 "R1에서 소진된 1회성 설정"으로 오판해 스스로 `0`으로 되돌리고 Codex를 호출하기 때문이다.

비용은 정확히 이 운영자가 피하려던 것이다 — 사용량 한도가 소진돼 Codex를 끈 사람이, 게이트를 한 번 돌릴 때마다 의도하지 않은 유료 호출을 최대 `MCCP_GATE_ROUND_CAP - 1`회 더 지불한다. 그리고 그 호출은 실패하거나(한도 초과) 무의미하게 성공하며, 어느 쪽이든 정책 선언이 기계적으로 무력하다는 사실을 남긴다.

## Evidence

실측 보고 1건(사용자, 2026-08-25) + 저장소 코드 근거 5건. 전부 반증 가능한 file:line이다.

- **E1 — 정책 honor 지점이 단 하나다.** `plugins/mccp/scripts/lib/codex-invoke.js:213`의 `invokeAdversarialReview`가 spawn 직전 short-circuit해 `classification='disabled'`를 반환한다. 이것은 **호출 1건에 대한 분류**이지 게이트 전체에 걸리는 라운드 불변 정책이 아니다. 그 함수를 다시 부르지 않는 경로에는 정책이 존재하지 않는다.
- **E2 — escalation 경로에 코드가 없다.** `plugins/mccp/commands/plan.md:2196`과 `plugins/mccp/commands/prp-implement.md:316`의 R2 지시는 fenced code block이 아니라 산문 한 줄이다: "If escalate triggers, run R2 with focus restricted to the unresolved item(s)." wrapper를 다시 타라는 지시도, disabled 여부를 읽으라는 지시도 없다. 실행 모델이 호출 형태를 즉흥으로 구성한다.
- **E3 — 라운드 루프의 유일한 기계적 입력이 정책을 모른다.** 세 게이트가 공유하는 `plugins/mccp/scripts/lib/review-single-pass.js:91`의 `effectiveRoundCap`은 `MCCP_REVIEW_SINGLE_PASS`만 읽고 `MCCP_CODEX_DISABLED`는 읽지 않는다. 이 저장소 `.claude/settings.json`은 `MCCP_GATE_ROUND_CAP=3`이라, 정책이 켜져 있어도 산문은 "최대 3라운드 반복"으로 읽힌다.
- **E4 — 어휘가 오판을 유도한다.** `plugins/mccp/scripts/lib/env-contract/registry.js:100`이 이 토글을 `kind='bypass-flag'`로 선언해, 진짜 1회성 escape들과 같은 부류에 넣는다. 같은 부류의 형제들은 문서에서 명시적으로 1회성이다 — `docs/environment/gates.md:71` "일회성 bypass (한 호출만)", `plugins/mccp/commands/pr.md:88` "intended for **one-shot** use". 그리고 `docs/environment/gates.md:186`의 `MCCP_CODEX_DISABLED` 절은 형제들과 **동일한** "한 호출에만 적용하려면 셸에서 앞에 붙인다" 보일러플레이트를 물려받는다. 영구 정책이라는 사실은 색인 표의 한 줄("Codex 호출 영구 skip")에만 있다.
- **E5 — 해제 금지 조항이 어디에도 없다.** 저장소 전체에 "게이트가 `MCCP_CODEX_DISABLED`를 스스로 해제해서는 안 된다"는 문장이 0건이다. 오판을 반증할 근거가 실행 모델에게 주어진 적이 없다.
- **E6 — 동형 결함의 선례.** `CLAUDE.md` §3.15가 이미 인정한다: "plan·prp-implement의 라운드 루프는 여전히 LLM이 읽는 산문이라 기계화된 것은 캡 계산뿐". user memory `round-cap-is-prose-not-enforced`는 캡이 1로 고정된 상태에서 R13까지 돈 실측을 기록한다. 산문 라운드 루프가 기계적 사실을 지키지 못한 것은 이번이 처음이 아니다.

## Users

- **Primary**: Codex 사용량 한도 소진·미인증·미설치 상태에서 `MCCP_CODEX_DISABLED=1`을 설정해 두고 mccp 게이트 체인을 계속 쓰는 운영자. 이 저장소의 소유자가 그 사용자이며 `~/.claude/settings.json`에 이 플래그를 영구 설정해 두고 있다.
- **Not for**: Codex가 정상 가동 중인 사용자. 이들에게 이 PRD의 산출물은 무동작이어야 한다 — 플래그가 꺼져 있으면 기존 라운드 정책이 한 글자도 바뀌지 않는다.

## Hypothesis

**Codex 비활성 정책을 게이트 진입 시점에 아티팩트로 봉인하고, 라운드 캡 오라클이 그 정책을 읽게 만들면**, 실행 중 env가 어떻게 바뀌든 **선언한 라운드 이후로 Codex가 호출되지 않게** 된다.

옳았음을 아는 방법: `MCCP_CODEX_DISABLED=1` 하에서 게이트를 완주시켰을 때 **Codex spawn이 0회**이고, receipt의 verdict가 `skipped`이며, 라운드 캡이 `MCCP_GATE_ROUND_CAP` 값과 무관하게 1로 보고된다. 반대로 플래그가 꺼진 상태에서는 세 게이트의 라운드 동작이 변경 전과 바이트 단위로 동일하다.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| 정책 하 Codex spawn 횟수 | 0 | `MCCP_CODEX_DISABLED=1`로 게이트 완주 후 `codex-invoke` stderr/durationMs 관측 |
| 라운드 캡 보고값 (정책 on, `MCCP_GATE_ROUND_CAP=3`) | `cap=1`, `pinned=true`, 사유 식별 가능 | 캡 오라클 단위 test |
| 정책 off 시 기존 동작 회귀 | 0건 | 기존 `review-single-pass` test 전건 green |
| env 중도 변조 내성 | 봉인 후 env를 `0`으로 바꿔도 정책 유지 | 봉인 아티팩트 기반 회귀 test |
| 해제 금지 조항 도달성 | 세 게이트 본문 모두에 존재 | 정적 test (본문 스캔) |

## Scope

**MVP** — 정책을 게이트 진입 시 아티팩트로 봉인하고, 공유 라운드 캡 오라클이 그 봉인을 읽어 캡을 1로 pin하며, 세 게이트 본문이 해제 금지를 명시하고, 문서가 이 토글을 영구 정책으로 다시 서술한다. 회귀 test가 정책 on/off 양쪽을 고정한다.

**Out of scope**

- **산문 라운드 루프 자체의 기계화** — `plan`·`prp-implement`의 라운드 반복이 LLM 산문인 구조는 그대로 둔다(§3.15가 이미 인정한 별도 축). 이번에 닫는 것은 "정책이 그 루프에 도달하지 못한다"이지 "루프가 산문이다"가 아니다.
- **`bypass-flag` kind의 분리** — 영구 정책과 1회성 escape를 registry `kind` 수준에서 가르는 것은 pin된 kind 집합을 건드려 파급이 크다. 이번에는 어휘와 문서만 정정하고, kind 재분류는 필요가 재확인되면 별도로 다룬다.
- **Codex 외 리뷰어로의 대체** — 정책이 켜졌을 때 다른 모델을 대신 부르는 것은 dual-review 계약 변경이다. 이번 범위는 "부르지 않는다"를 지키는 것까지다.
- **`MCCP_ALLOW_CODEX_UNAVAILABLE` 등 진짜 1회성 escape의 의미 변경** — 이들은 실제로 1회성이며 손대지 않는다.
- **santa-loop의 `MCCP_SANTA_ROUND_CAP`** — 별도 캡 축이고 Codex 라운드 루프가 아니다.

## Delivery Milestones

<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | 정책이 라운드 불변이 된다 | `MCCP_CODEX_DISABLED=1`을 설정한 운영자가 게이트를 돌리면, 실행 중 env가 어떻게 바뀌든 첫 라운드 이후 Codex가 호출되지 않는다. 세 게이트 본문이 이 플래그의 해제를 금지하고, 문서가 이 토글을 1회성 escape가 아니라 영구 정책으로 서술한다. | in-progress | `.claude/plans/codex-disabled-round-invariant-m1.plan.md` |

M1은 **단일 커밋 불변식**이다. 봉인 아티팩트만 착지하고 그것을 읽는 쪽이 없으면 정책은 여전히 도달하지 못하고, 캡 pin만 착지하고 봉인이 없으면 env 변조에 그대로 뚫린다. 문서 정정은 오판의 어휘적 원인이라 같은 단위에 속한다.

## Open Questions

- [ ] 봉인 아티팩트가 없을 때(구버전 경로·아티팩트 write 실패) 캡 오라클은 env로 fallback해야 하는가, 아니면 정책 미확정으로 보수적 판정해야 하는가. `review-single-pass.js`의 기존 규약은 두 방향이 공존한다 — `parseSinglePass`는 불량값에 fail-closed, `parseRoundCap`은 fail-open. 어느 얼굴을 따를지는 plan에서 결정한다.
- [ ] `MCCP_REVIEW_SINGLE_PASS`와 `MCCP_CODEX_DISABLED`가 동시에 켜지면 둘 다 cap을 1로 pin한다. 값은 같지만 `reason`이 하나뿐이라 어느 쪽이 pin했는지 로그에 남지 않는다. 우선순위를 정할지 사유를 합성할지 결정 필요.
- [ ] 봉인 아티팩트의 수명·경로가 기존 `.claude/state/plan-review/` 계약과 충돌하지 않는지. `/mccp:plan` 5.2 진입이 그 디렉토리를 통째로 purge하므로 봉인 시점이 purge보다 뒤여야 한다.
- [ ] `pr.md`는 이미 캡을 자식 프로세스에 export해 기계적으로 강제한다. 이 게이트에도 봉인이 필요한지, 회귀 test만으로 충분한지.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 캡 pin이 Codex 라운드가 아닌 다른 루프까지 좁힌다 | 낮음 | 높음 | `effectiveRoundCap` 소비처는 세 게이트의 Codex 라운드뿐임이 확인됨(plan.md:2203, prp-implement.md:325, pr.md:557). 패널·santa 캡은 별도 축. 소비처 집합을 test로 고정한다. |
| 정책 off 사용자에게 회귀 | 낮음 | 높음 | 플래그가 꺼져 있으면 오라클이 기존 경로를 그대로 반환하도록 하고, 기존 test 전건을 무수정으로 통과시키는 것을 acceptance로 둔다. |
| 봉인 아티팩트가 stale하게 남아 다음 실행을 오염 | 중간 | 중간 | 저장소의 기존 nonce/purge 규약을 따른다. 이 위험은 Open Question 3과 같은 결정에 묶인다. |
| 산문 금지조항이 지켜지지 않는다 | 중간 | 낮음 | 산문은 강제되지 않는다는 것이 §3.15·memory의 실측이다. 그래서 A축(기계적 pin)이 주 방어이고 B축은 보조다. 금지조항의 **존재**만 정적 test로 고정하고, 이행은 주장하지 않는다. |
| Codex 비활성 상태라 이 PRD의 게이트 체인 자체가 cross-model 리뷰를 못 받는다 | 확실 | 중간 | plan 게이트는 `MCCP_PLAN_REVIEW=multi-agent`의 L2 패널로 리뷰되고, PR 게이트는 정직하게 `skipped` verdict를 봉인한다. 리뷰 부재를 수렴으로 위장하지 않는다. |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-08-25.*
