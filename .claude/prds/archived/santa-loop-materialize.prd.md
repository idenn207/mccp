# santa-loop 실체화 (P0)

> 우산: [review-loop-trust.prd.md](../review-loop-trust.prd.md) — 승계 불변식 I3·I4·I6
> **이 PRD는 선행이다.** P1·P2·P3는 이것이 끝나야 병렬 착수할 수 있다.

## Problem

`/mccp:santa-loop`은 **199행 산문이고 백킹 코드가 0**이다(`plugins/mccp/scripts/lib/santa*` 부재). 그래서 두 가지가 동시에 성립한다.

1. **캡이 지켜지지 않는다** — `Maximum 3 iterations`가 산문에만 있고 라운드 카운터도 상태 파일도 없어, 실사용에서 15~20라운드가 나온다. 지킬 코드가 없어서 안 지켜지는 것이다.
2. **모든 개선이 한 파일로 몰린다** — 판정 계약(P1)·증거 다양성(P2)·델타 리뷰(P3)가 전부 같은 199행 파일을 고쳐야 해서 병렬 작업이 불가능하다.

방치 비용: 후속 3개 PRD가 직렬화되거나, 병렬로 강행했다가 PR #110류의 머지 사고(파일 9개·2144줄 소실)를 재현한다.

## Evidence

- `ls plugins/mccp/scripts/lib/ | grep santa` → **0건**. [santa-loop.md](../../../plugins/mccp/commands/santa-loop.md) 199행 전체가 산문이며 실행되는 것은 `git diff`·`codex exec`·`git push` 뿐.
- receipt 149건 중 santa-loop 발행분 **0** — `GATE_IDS`에 없음([schema.js](../../../plugins/mccp/scripts/receipt/schema.js)).
- 충돌 실측(부록 §3.1): P1은 Step 3·4, P2는 Step 1·3, 원장·캡은 Step 5 — **P1·P2가 Step 3에서 정면 충돌**.
- 추출 선례가 이미 확립돼 있음 — `plan.md` → `plan-review/cli.js`·`orchestration-runaway.js`, `work.md` → `work-orchestrator.js`.
- **`review_source='multi-agent'` 편입이 안전하다는 코드 근거** — [review-verdict.js](../../../plugins/mccp/scripts/lib/review-verdict.js) `CROSS_MODEL_SOURCES = ['codex','hybrid']`가 multi-agent를 배제하고, [dedupe.js](../../../plugins/mccp/scripts/receipt/dedupe.js) `codexConverged = crossModelConverged`가 이를 강제한다. diverse-agent-review M1이 이미 봉인함.
- **produces-only GATE_ID 선례** — `mccp-implement-verify`가 "no command lists it in `requires_preceding`" 패턴으로 이미 존재([schema.js](../../../plugins/mccp/scripts/receipt/schema.js) 주석).

## Users

- **Primary**: santa-loop을 실행하는 mccp 운영자 — 캡 미준수로 라운드가 무한정 늘 때. 그리고 **P1·P2·P3를 구현하려는 자기 자신** — 파일 충돌 없이 병렬 착수하려 할 때.
- **Not for**: 게이트 receipt chain의 승인 경로 — 이 receipt는 감사 앵커일 뿐 어떤 게이트도 통과시키지 않는다.

## Hypothesis

We believe **santa-loop의 결정 로직을 `scripts/lib/santa/` 모듈로 추출하고 `mccp-santa-review` produces-only receipt를 신설하는 것**이 **캡을 기계적으로 강제하고 후속 3개 축의 파일 소유권을 분리하는 데** 유효하다 — for **mccp 운영자 겸 구현자**.
We'll know we're right when **santa-loop 실행이 라운드 카운터를 상태 파일에 남기고 캡 도달 시 코드가 정지시키며, P1·P2·P3의 변경 대상 파일 집합이 서로 겹치지 않을 때**.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| **[primary] 라운드 계측** | 실행마다 라운드 수가 상태 파일에 기록되고 receipt에 봉인 | 상태 파일 + `mccp-santa-review` receipt 대조 |
| 캡 기계적 강제 | 캡 초과 시도가 코드로 정지 (산문 의존 0) | 캡 초과 회귀 test |
| **파일 소유권 분리** | P1·P2·P3의 예상 변경 파일 교집합 = ∅ | P0 종료 시 산출하는 소유권 표 |
| `plugins/mccp/commands/santa-loop.md` 축약 | 결정 로직 잔존 0 (rubric·출력 포맷은 잔류 허용). **범위는 plugin 사본 한정** — 별도 tracked 사본 `.claude/commands/santa-loop.md`는 M1 `Files to Change` 밖이고 산문 캡이 남아 있다(M1 보고서 D11) | 코드 리뷰 |
| dedupe/ship-gate 회귀 | 0 — multi-agent verdict가 cross-model로 계수되지 않음 | 기존 회귀 test + 신규 negative test |

## Scope

**MVP** — (1) `scripts/lib/santa/` 에 라운드 카운터 + 원장 I/O + 게이트 판정의 **골격**을 두고, (2) `santa-loop.md`가 그것을 호출하는 thin caller가 되며, (3) `mccp-santa-review` GATE_ID를 produces-only로 신설해 라운드 수와 원장 집계를 봉인한다. **판정 규칙의 내용(severity 정의·종료 조건)은 P1 소유** — P0는 그것이 들어갈 자리와 인터페이스만 만든다.

**Out of scope**

- **severity 축 정의 · patch-chasing terminator** — P1 소유. P0는 gate 함수의 시그니처만 확정.
- **블라인드 레인 · 스코프 확장** — P2 소유.
- **델타 스코프 계산** — P3 소유.
- **`requires_preceding` 등재** — 어떤 command도 santa receipt를 선행 조건으로 요구하지 않는다. 체인 차단 위험 0을 유지.
- **rubric 문안 개선** — 산문이 적합한 영역. 축약 대상 아님.

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | 모듈 골격 + 캡 강제 | santa-loop이 라운드를 코드로 세고 캡에서 정지한다. 산문 캡 의존 종료. **Success Metrics 1행의 절반은 미달** — 라운드 수가 상태 파일에 기록되는 것까지는 냈으나 **receipt 봉인은 M2 소유**(`mccp-santa-review` GATE_ID 신설)라 M1에 없다. 캡의 강제 등급도 정직하게 좁힌다: `record`·`verdict`가 **`begin-round`가 연 적 없는 인덱스**를 거부하므로 그 인덱스로는 원장에 못 들어가지만, 두 가지는 막지 못한다 — (a) **리뷰어 토큰 소모**(리뷰어 기동은 LLM 행위), (b) **마지막 FINAL 인덱스 재사용**(`record --round <cap-1>`은 통과 — `record`를 OPEN 라운드로 한정하는 규칙은 판정 lifecycle이라 P1 소유). 또한 이 강제는 **`plugins/mccp/` 사본 한정**이다 — 별도 tracked 사본 `.claude/commands/santa-loop.md`는 여전히 산문 캡이다(D11). **Ship 근거**: commit `5384473` — santa test 54(51 pass·3 POSIX skip·0 fail) · receipt 회귀 554(553 pass·0 fail) · 산문 캡 잔존 0 · 원장 gitignore 확인 | complete | [santa-loop-materialize-m1.plan.md](../../PRPs/plans/archived/santa-loop-materialize-m1.plan.md) |
| 2 | receipt 편입 + 소유권 표 산출 | 라운드·원장 집계가 `mccp-santa-review`에 봉인되고, P1·P2·P3가 소유할 파일 경계가 문서로 확정됨. **M1이 미달로 남긴 Success Metrics 1행의 나머지 절반이 닫힌다** — produces-only GATE_ID `mccp-santa-review`(phase=`review`)가 두 종료 경로 **모두**에서 봉인한다: NICE는 push **이전** Step 5.5, 캡 도달은 `begin-round` exit 12 분기 안(그 경로는 Step 5.5·6에 도달하지 않는다). `meta.santa_rounds`/`santa_entries`/`santa_cap`/`santa_exit_reason` 4종은 present-only + `makeSkeleton` 미등록이라 미행사 receipt의 canonical hash가 무변동이다. **dual-review 우회 없음** — `review_source='multi-agent'`를 schema가 `gate_id` 기준으로 강제하고 `multi-agent`는 `CROSS_MODEL_SOURCES` 밖이라 santa 승인으로 `/mccp:pr`의 PR-Codex를 skip시킬 수 없다. 소유권은 [ownership.md](../../../docs/santa-loop/ownership.md)가 P1 4 · P2 3 · P3 2 경로로 확정(교집합 ∅) + M1 동결 시그니처 + 변경 프로토콜. **미달 1건은 정직하게 이연** — PR-Codex F2(MEDIUM): santa 4종이 전부 present-only 가드라 집계를 통째로 뺀 santa receipt도 schema를 통과한다(UI1 봉인이 강제되지 않음). §3.14대로 [backlog](../../plans/codex-findings-backlog.md)에 등재했다. 영향이 제한적인 이유는 현 유일 producer `seal.js`가 두 값을 항상 `aggregate`에서 채우기 때문이며, 닫히지 않은 것은 *손으로 쓴/다른 producer의* receipt를 schema가 못 잡는다는 점이다. **Ship 근거**: commit `a2e7cb6`(본 구현) + `73d7884`(PR-Codex F1 HIGH + code-review H1 흡수) — **아래 수치는 ship 대상 HEAD에서 재측정한 것**이며 구현 리포트의 중간 스냅샷이 아니다 — santa 4파일 **85**(82 pass·3 POSIX skip·**0 fail**) · receipt 스위트 614(613 pass·**0 fail**) · receipt corpus 51건 **invalid 0** · `santa-loop.md` 배선 5축 exit 0 · 소유권 구조 검사 exit 0 · 커버리지 감사 16/16(**감사가 본 extra는 `[17]`·`[18]`까지**다 — `[19]`·`[20]`과 종료 마커 test는 같은 커밋의 code-review 흡수분으로 나중에 추가됐고 감사를 재실행하지 않았다. 리포트가 적은 santa test 79도 그 추가 **이전** 스냅샷이라 위 85와 갈린다). **plan 4(실 원장 왕복)는 미실행**이며 이것이 이 milestone의 유일한 미수행 validation이다 — 원장이 UI4대로 gitignored라 워크트리 갱신 중 소실됐고, 없는 원장에 `seal`을 돌리면 이 decision에 divergent를 주장하는 **실** receipt가 생기므로 의도적으로 건너뛰었다(그 경로는 test `[14]` missing-ledger가 덮는다). | complete | [santa-loop-materialize-m2.plan.md](../../PRPs/plans/archived/santa-loop-materialize-m2.plan.md) |

## Open Questions

- [ ] **원장/카운터의 git-tracked 여부** — `STATE.md`(tracked, 연속성) vs `loop-counter.json`(gitignored, 세션 로컬) 선례가 갈린다. 권장: **본문 gitignored + 집계값만 receipt에 봉인** — 계측 분모는 살고 라운드마다의 diff 노이즈는 없다.
- [ ] **`santa-loop.md` 축약 폭** — 199행 중 어디까지 모듈로 내릴지. 결정 로직은 전부, rubric·출력 포맷은 잔류가 기본선.
- [ ] **receipt의 `decision_id`** — santa-loop은 plan 없이도 호출된다. decision slug를 무엇으로 삼을지(현 스코프 해시 / 브랜치명 / escalate_pending_decision_id 승계).
- [ ] **기존 escalate_pending 경로와의 접속** — Step 0이 이미 STATE.md의 `escalate_pending`을 읽는다. 모듈화 시 이 경로를 그대로 둘지 모듈로 흡수할지.
- [ ] **(M2) `review_proof.layers.l1`에 santa 캡 게이트를 매핑하는 것이 타당한가** — 그 필드의 원래 의미는 plan-review의 기계 lint이고 santa에는 그것이 없다. M2는 M1의 캡·인덱스 가드(리뷰어 발화 **전에** 기계가 라운드를 승인)를 같은 역할로 보고 `'converged'`를 채운다. 과잉 해석으로 판명되면 `seal.js#buildProof` 한 함수만 바뀐다.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| P0가 길어져 P1·P2·P3 전부를 막는 단일 병목이 된다 | Medium | High | MVP를 골격+캡으로 좁히고 판정 내용은 전부 P1에 남긴다. day0 병렬 H1·H2·H3가 대기 시간을 흡수 |
| 인터페이스를 잘못 확정해 P1·P2가 재작업 | Medium | High | Milestone 2의 산출물에 **소유권 표 + 함수 시그니처**를 명시적으로 포함. 변경 시 P0 재개(자식이 임의 변경 금지) |
| **`mccp-santa-review`가 `converged`를 발급해 dual-review가 우회된다** | Low | Critical | I4 — `review_source='multi-agent'` 고정. `CROSS_MODEL_SOURCES`가 코드로 거부하지만, **negative 회귀 test를 신설**해 이 경로가 열리면 즉시 red |
| GATE_ID 추가가 기존 receipt validate를 깨뜨린다 | Low | High | additive enum 확장 + 기존 149건 corpus 전수 validate를 acceptance에 포함 |
| 산문→모듈 이전 중 기존 동작이 조용히 바뀐다 | Medium | Medium | P0는 **동작 보존 리팩터링**이 원칙 — 캡 강제 외에 판정 결과를 바꾸지 않는다. 이전 전후 동일 입력 verdict 비교 test |

---
*Status: 전 milestone complete — M1 (v1.25.1) · M2 (v1.26.0). **배송 상태는 "브랜치 착지"까지다**: 두 milestone 모두 브랜치 `santa-loop-materialize`에만 있고, **PR은 아직 없으며**(M3 ship gate가 PR-Codex `divergent`로 차단했고 그 F1은 `73d7884`에서 흡수됨) main 머지도 미완이다. 남은 일 4건 — `/mccp:prp-commit` → `/mccp:pr` 재실행 · PR 시 PR-Codex 실제 발화 확인(santa/multi-agent 어느 쪽도 cross-model 미인정) · `/mccp:santa-loop` end-to-end test 부재(승인 라운드 MEDIUM, 미해소) · PR-Codex F2(MEDIUM, backlog 이연). 전 행이 `complete`이므로 이 PRD는 `/mccp:archive-complete`에 **즉시 archivable로 잡힌다**. 이 문장은 원래 "위 4건이 닫히기 전에 아카이브하지 말 것"이었으나, **2026-08-16 사용자 승인으로 아카이브를 먼저 착지시키고 PR을 뒤이어 올리는 순서**를 택했다(아카이브 커밋이 그 PR에 함께 실린다 — `7a16d7e` setup-gitignore 선례). 따라서 **아카이브 시점에 잔여 2건이 열린 채였다**: `/mccp:pr` 미실행(PR 0건 — `gh pr list --head santa-loop-materialize` 실측) · PR-Codex 미발화(ship receipt `mccp-pr-codex/santa-loop-materialize-m2.json` 부재). 이 둘은 후속 PR 사이클에서 닫힌다. 후속 P1·P2·P3는 [ownership.md](../../../docs/santa-loop/ownership.md)의 경계로 병렬 착수 가능하다. Delivery Milestones 표가 정본이다.*
*Co-created with user on 2026-08-12.*
