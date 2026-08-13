# Diverse-Agent Review — cross-model 의존 전환

## Problem
mccp의 plan/implement/pr 게이트는 dual-review를 위해 Codex(외부 cross-model) 리뷰에 의존한다. 이 리뷰가 게이트당 **평균 10-15분 blocking**이고 자주 미가용이라, 반복 plan 작성과 연속 milestone ship에서 대기가 누적되고 review 공백이 생긴다. 방치 비용: 운영 속도 저하 + Codex 미인증/companion 실패 시 dual-review 안전망 붕괴(receipt skip).

> 상세 설계 근거는 `.claude/meta/` 3문서 참조: [diverse-agent-review-analysis.md](../meta/diverse-agent-review-analysis.md)(논문+사례+R2 결론) · [converged-redefinition-design.md](../meta/converged-redefinition-design.md)(verdict 재정의 + 소비처 계승) · [verification-layer-design.md](../meta/verification-layer-design.md)(L1/L2/L3 3층 verification).

## Evidence

**문제 실재(PRD 최초 작성 시)**
- **정량 pain**: Codex adversarial review 게이트당 평균 10-15분 blocking (운영자 실측). 반복·연속 ship 시 대기 누적.
- **미가용 빈도**: durable-evidence-substrate cycle `implement-codex advisory로 막힘`, 최근 `/mccp:pr` cache stale + exit 127, companion `exit-nonzero` advisory 강등 반복 (프로젝트 기록).
- **학술 근거(지지)**: [Correlated Errors, ICML 2025 (arXiv:2506.07962)](https://arxiv.org/abs/2506.07962) — 350+ LLM, 두 모델이 둘 다 틀리면 60%가 같은 답(cross-model 합의 = 공유 맹점) · [More Agents (arXiv:2402.05120)](https://arxiv.org/abs/2402.05120) · self-consistency +17.9% · [Verification-Aware Planning (arXiv:2510.17109)](https://arxiv.org/html/2510.17109).
- **학술 근거(주의)**: [Temperature·Persona (arXiv:2507.11198)](https://arxiv.org/abs/2507.11198) — same-model persona 상관 0.4 vs cross-model 0.08. model diversity의 blind-spot 회피 가치는 남음 → hybrid opt-in 근거.
- **타사 사례**: Claude Code PR review 자체가 same-model 5병렬로 **<1% false positive** (Anthropic 프로덕션 — same-model 다관점이 충분한 품질을 낸다는 직접 증거) · Devin Fusion(frontier+sidekick) = hybrid 선례 · mccp의 Opus↔Codex는 "가장 진전된 cross-model 사례"로 평가.
- **기존 인프라**: plan-fanout(4 read-only 관점) · mccp-implement-verify(verify.js) · Stop-loop(lint→typecheck→test→e2e) 이미 존재 → 재조합 문제.

**M1 ship 후 자기 실측 (2026-08-09 추가)**
- **패널이 실제로 작동했다 — 라이브 1회 완주**: `plan-review-followup` plan 대상 실행이 `divergent` via `multi-agent`로 착지(quorum 4응답 / 4역할, L1 converged · L2 divergent · L3 미발화). 패널이 잡은 것은 실재 결함이었다 — 발화 불가능한 budget 게이트(consumer가 읽는 임계 필드를 producer가 emit하지 않아 조건이 구조적으로 도달 불가)와 공허한 Task validation(`node --check`는 문법만 검사하는데 acceptance는 런타임 동작을 요구). 산출물 [plan-review-plan-review-followup.md](../reviews/plan-review-plan-review-followup.md). 그 plan이 draft로 남은 이유는 미착수가 아니라 **패널이 반려했기 때문**이다.
- **지표는 산출되지 않았다 — 계기에 survivorship bias가 내장**: wall-clock·L3 stamp는 receipt write 블록 안에 있고 receipt는 **통과 경로에서만** 기록된다. 차단된 실행은 그 앞에서 HALT하므로 구조적으로 계측 대상에서 빠진다 — 즉 리뷰가 오래 걸릴수록(=측정하려는 바로 그 현상) 기록될 확률이 낮다. 저장소 receipt 39개 중 `review_verdict` 보유 **0건**. 더해 plan 게이트 receipt는 `.gitignore`상 worktree-only라 §3.8 cleanup마다 소멸 → 집계 코퍼스가 존재하지 않는다.
- **결함은 오라클이 아니라 그 둘레에 몰렸다**: post-ship `/mccp:code-review` 8건 + `/mccp:santa-loop` 6라운드 흡수 20건 = **28건이 전부 command-body seam**(단위 test가 원리상 닿지 않는 markdown 배선). 오라클 자체는 6라운드 내내 견고했다. 흡수 20건 중 **6건은 앞선 라운드의 내 수정이 만든 것**이고 그중 3건은 동일한 셸-상태 형태 — 개별 실수가 아니라 구조 신호.
- **비대칭 포착이 hybrid 존속을 자기 실증**: santa-loop 6라운드에서 Codex 단독 적발 7건 / Opus 단독 적발 3건. 어느 한쪽만 돌렸으면 나머지는 ship됐다. "Codex 완전 제거"를 out of scope로 둔 판단(R2 hybrid 채택)이 외부 논문이 아니라 이 저장소 실측으로 뒷받침됐다.

**M4 ship 후 자기 실측 (2026-08-09 추가)**
- **차단 경로 계측이 실제로 작동한다 — 합성 아닌 실측 1회**: M4 구현 직후 실제 `cli.js mode → l1 → decide → record` 체인을 이 저장소의 M4 plan 자신에 대해 돌렸다. L1이 `C3_CREATE_EXISTS` 4건으로 divergent(구현이 끝난 뒤라 CREATE 대상이 이미 존재 — L1이 제 일을 한 것이다) → `decide` exit 12 → `record`가 [plan-review-diverse-agent-review-m4-postimpl-l1.md](../reviews/plan-review-diverse-agent-review-m4-postimpl-l1.md)를 남겼고 `## Measurement`에 `halt_stage:"5.2e"` · `wall_clock_ms:43984`(정수) · `verdict:"divergent"`가 기록됐다. **M1이라면 이 실행은 아무것도 남기지 않았다** — receipt write에 도달하지 못했기 때문이다. 이 파일은 슬러그로 스스로를 post-implementation L1 실행이라 밝히며, 게이트의 승인 기록이 아니다.
- **통과 경로는 이번에도 관측되지 않았다**: 구현 시점의 사유는 플러그인 캐시가 `1.23.4`에 머물러 `mccp:review-{architect,security,test,invariant}` 4종이 세션 agent 레지스트리에 없다는 것이었다(캐시 `agents/` 실측 0건 · 워크트리에는 4건 존재). UI3에 따라 미산출로 적는다 — M4는 계측 결손을 닫았지 통과 경로를 관측하지 못했다.
- **그 차단 사유는 이후 해소됐고, 미관측 사유는 다른 것으로 바뀌었다 (2026-08-13 santa-loop 실측)**: 캐시는 `1.23.6`·`1.23.7`로 진행했고 두 버전 모두 `review-*` 4종을 갖는다. installed는 `1.23.7`이며 agent 4종은 세션 레지스트리에 **등록돼 있다** — 위 문단이 지목한 런타임 선행 조건은 더 이상 차단 요인이 아니다. 남은 사유는 **installed 트리에 M4의 산출물이 없다**는 것이다: `1.23.7/scripts/lib/plan-review/`는 `cli.js·decide.js·l1-check.js·perspectives.js·quorum.js`뿐이고 이 브랜치의 `record.js`·`budget.js`가 없다. 따라서 지금 라이브 완주를 돌리면 receipt triple은 봉인되지만(그 배선은 M1 소유다) **M4가 만든 계측은 한 줄도 실행되지 않는다** — clause 1의 문면은 충족되나 M4의 증거는 아니다. 두 리뷰어(Opus·Codex GPT-5.4)가 이 구분에 독립적으로 수렴했다. 완주 자체는 PR #126 머지를 기다릴 필요가 없다 — 이 브랜치의 버전을 로컬에 설치하고 새 세션을 열면 된다.
- **budget 게이트는 이제 발화 가능하다(런타임 실증)**: `plan-review-workflow-port.test.js`가 shipped workflow 소스를 `AsyncFunction`으로 실행해 `remaining < minRemaining`에서 agent 0개 spawn + 실측 `remaining`/`minRemaining` 반환을 단언한다. M1에서는 producer가 키를 emit하지 않아 이 분기가 **구조적으로 도달 불가**였다. 라이브 `/mccp:plan`에서의 발화는 통과 경로와 함께 미관측.
- **그 "발화 가능"은 clause 3을 충족하지 않는다 — 판정 확정 (2026-08-13 santa-loop)**: 두 리뷰어가 여기서 갈렸다. Opus는 도달 불가를 도달 가능으로 바꾼 것이 clause의 취지라 보아 충족으로 읽었고, Codex GPT-5.4는 위 문장이 스스로 "라이브 발화는 미관측"이라 적는 이상 시뮬레이션을 "실제로 발화"의 증거로 쓸 수 없다며 미충족으로 읽었다. **운영자가 후자로 판정했다** — clause 3은 라이브 `/mccp:plan`에서의 실제 발화를 요구한다. 따라서 M4의 미충족 clause는 1개(승인 경로)가 아니라 **2개(승인 경로 + budget 라이브 발화)**이며, 둘 다 같은 선행 조건(이 브랜치 버전 설치 + 새 세션)을 공유하므로 한 번의 라이브 완주가 양쪽을 동시에 관측할 수 있다. UI5가 "수정 전 실패를 실측한 것만 회귀로 인정"한다고 적은 것과 같은 종류의 기준을 acceptance에도 적용한 것이다 — **실행 가능함은 실행됨이 아니다.**
- **UI5(수정 전 실패 실측)를 지켰다**: 신규 단언 5건이 fix **전** 실패(23개 중 5 fail)하는 것을 먼저 관측하고 기록한 뒤 구현했다 — 적용 후 23/23 green. M1의 "공허한 validation" 반려 사유를 같은 형태로 반복하지 않기 위한 절차다.

## Users
- **Primary**: mccp를 운영하며 `/mccp:plan`·`/mccp:prp-implement`·`/mccp:pr` 게이트를 매번 통과해야 하는 단일 운영자(skypark207). trigger: 게이트 진입 시 Codex 리뷰 대기.
- **Not for**: 팀 협업 다중 사용자 시나리오 — 현재 개인용 plugin monorepo.

## Hypothesis
We believe **diverse-agent 다관점 리뷰 + 계층적 verification(L1 deterministic backbone / L2 self-consistency / L3 hybrid opt-in)으로 `converged`를 재정의**하는 것이 **게이트 리뷰 대기(10-15분)를 크게 줄이면서 blind-spot 안전판과 dual-review 불변식을 보존**하는 데 유효하다 — for **mccp 운영자**.
We'll know we're right when **통과 경로 게이트 실행의 wall-clock이 실측으로 10분 이내이면서, `converged` 봉인이 여전히 fail-closed(proof 없으면 no-ship)·tamper-protect·provenance를 유지하고 기존 dedupe/ship-gate 회귀가 0**일 때.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| plan 게이트 wall-clock (통과 경로) | 실측 1회 이상 ≤ 10분 | **M4 미산출 (forward-only)** — 계측 표면은 `.claude/reviews/*.md` `## Measurement`로 이전 완료. 구현 시점 미실행 사유는 캐시가 `1.23.4`(패널 경로·`review-*` agent 미등록)였다는 것이고, 그 사유는 해소됐다(캐시 `1.23.7` + agent 등록). 남은 사유는 installed 트리에 M4의 `record.js`·`budget.js`가 없어 지금 돌리면 M4 계측이 실행되지 않는다는 것 — 이 브랜치 버전 설치 + 새 세션이 선행 조건 |
| plan 게이트 wall-clock (차단 경로) | 계측 도달 (M1에서 구조적 미계측) | **M4 달성** — `cli.js record`가 5.2의 HALT **9곳 전부**(5.2a·5.2b·5.2c-emit·5.2c-pin·5.2d·5.2e·5.2e-proof·5.2f·5.2g)에서 실행되고, 합성 fixture 실측으로 `halt_stage:"5.2b"` + 정수 `wall_clock_ms`(7841ms) 확인. 표면은 receipt(worktree-only)가 아니라 git-tracked `.claude/reviews/` |
| `converged` 봉인 무결성 | proof 없으면 no-ship, 회귀 0 | dedupe/ship-gate 회귀 test |
| dual-review 불변식 | 무손상 | 기존 게이트 test suite green |
| L3(cross-model) 발동 비율 | **forward-only** — M1 미산출, 코퍼스 확보 후 주장 | receipt L3-stamp 집계 |
| git-tracked ship corpus hash | 무변경 | present-only 필드 hash 안정성 test |

> **지표 정직성 규칙**: 산출 이력이 0인 지표는 "달성"이 아니라 `forward-only`로 적는다. M1은 계기를 배송했으나 통과 경로가 한 번도 관측되지 않아 headline 두 지표가 미산출이었다 — 이 사실을 status로 감추지 않고 Evidence와 이 표에 명시한다(선례: multi-session-work-loop M2 measurement-honesty downgrade).
>
> **M4 갱신**: 차단 경로 지표는 달성됐다(계측 표면이 receipt에서 git-tracked `.claude/reviews/`로 이전, 전 HALT 경유). 통과 경로 지표는 **여전히 미산출**이며 그렇게 적는다 — M4는 계측 결손을 닫았지 통과 경로를 관측하지 못했다. 선행 조건(`claude plugin update` → 새 세션)은 코드 변경으로 충족할 수 없는 런타임 조건이라 milestone 안에서 해소되지 않았다.
>
> **2026-08-13 santa-loop 갱신**: 위 선행 조건은 **여전히 유효하되 내용이 바뀌었다**. 막고 있던 것은 agent 미등록이었고 그것은 해소됐다(캐시 `1.23.7`, agent 4종 등록). 지금 막는 것은 installed 트리에 M4 산출물이 없다는 것이며, 해소는 이 브랜치 버전 설치 + 새 세션으로 가능하다(PR #126 머지 불필요). **stale한 사유로 milestone을 판정하지 않기 위해 사유를 갱신하되 판정은 바꾸지 않는다** — 미산출은 미산출이다.

## Scope
**MVP (M1, 배송 완료)** — plan-codex 게이트 하나를 **multi-agent(L1+L2)로 전환**. `review_verdict`/`review_source`/`review_proof` verdict 재정의를 배선하고, 기존 소비처(dedupe·ship-gate·ledger·convergence)를 단일 helper로 계승. L3(Codex)는 **수동 opt-in** + **발동 계측 stamp**. plan은 코드 diff가 없어 L1은 "plan 내부 일관성 mechanical check", 무게중심은 L2(다관점 self-consistency).

**Out of scope**
- Codex **완전 제거** — hybrid opt-in으로 존속 (blind-spot 안전판). *이유*: correlated-errors 근거 + M1 santa-loop 비대칭 포착 실측(Codex 단독 7건).
- **모든 게이트 동시 전환** — 점진적(MVP는 plan-codex 1개).
- **Gemini 등 다른 외부 모델 도입** — 이 머신 미설치 + scope 팽창.
- **receipt schema version bump** — present-only 필드라 불필요.

## Delivery Milestones
<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->
<!-- 행 순서 = 실행 순서. # = 고정 식별자 (아래 note 참조). -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | plan-codex multi-agent 전환 (MVP) | plan 게이트가 diverse-agent L1+L2로 `converged`를 발급 · Codex 수동 opt-in · dedupe/ship-gate 회귀 0 · 계기 배선(지표 산출은 #4 소관) | complete | `.claude/plans/diverse-agent-review-m1.plan.md` |
| 4 | 통과 경로 실증 + 지표 부채 상환 | 패널이 승인을 발급하는 경로가 1회 완주해 receipt에 review triple이 봉인됨 · wall-clock이 **차단 경로에서도** 기록돼 survivorship bias 제거 · 발화 불가였던 budget 게이트가 실제로 발화 · "라이브 완주"가 acceptance 항목으로 명문화 | in-progress | `.claude/plans/diverse-agent-review-m4.plan.md` |
| 5 | 게이트 배선 오라클 추출 | 게이트 승인 배선이 단위 test 사거리 안으로 이동 — seam 결함이 ship 후 리뷰가 아니라 test로 잡힘 | pending | — |
| 1.5 | 패널 intent adjudication | 패널이 user intent를 입력으로 받고 자기 findings를 그에 대해 판정 · panel run에서 intent gate가 *skip*이 아니라 *satisfied* | pending | — |
| 2 | L3 자동 트리거 | 불확실성(A: L2 divergent/quorum 경계) ∨ 위험영역(B: auth·API·migration·schema·gate-self·ledger) ∨ ship지점(C: terminal PR) 신호 시 cross-model 자동 발동 · **#4 실측**으로 조건 튜닝 · 과발동↔지연 균형 관측 | pending | — |
| 3 | implement-verify 3층 확장 | `mccp-implement-verify`를 L1(강한 test/typecheck backbone)+L2+L3로 generalize · 코드 diff 게이트의 verification 가치 극대화 | pending | — |

> **번호는 정체성, 순서는 표 위치.** CHANGELOG 1.23.5와 CLAUDE.md §1.4가 이미 "M2=L3 자동 트리거 · M3=implement-verify 3층 확장 · M1.5=패널 intent 편입"을 그 이름으로 참조하는 ship 기록이라, 재번호는 그 기록을 거짓으로 만든다. 대신 행 순서를 실행 순서로 쓴다 — `/mccp:plan`의 "next pending" 선택도 이 순서를 따른다.

> **#1.5를 #5 뒤에 둔 이유.** intent 편입은 게이트 배선을 *더 늘리는* 작업이고, M1 실측이 "흡수 20건 중 6건은 앞선 라운드 수정이 만든 것, 3건은 같은 셸-상태 형태"를 보였다. 추출 전에 배선을 늘리면 그 패턴을 그대로 재생산한다. 다만 그동안 panel run의 intent gate는 *skip* 상태로 남는다 — 정직하게 stamp되긴 하나 #118이 세운 커버리지에 대한 후퇴이므로, 이 후퇴를 더 못 기다리겠다고 판단되면 순서를 뒤집을 수 있다.

## Open Questions

**M1이 답한 것 (기록 보존)**
- [x] L1/L2 각 층의 정확한 구성 → L1은 mechanical check 7종(필수 섹션·repo-root full 경로·action↔실존·per-task Validate·Source PRD·인용 실존·markdown 정합), L2는 refute-framed 4관점(architect/security/test/invariant). 승인은 **증거 부재로만** 도출(`refutationAttempted` 필수).
- [x] quorum 파라미터 → default `3of4` + 고유 역할 K=3, M≥2 강제. proof 바인딩은 임계값이 아니라 **관측치**(`responded`)에 — 임계값을 관측치 자리에 적으면 증거가 자기 증거를 과소 진술한다.
- [x] `review_proof` 위조 방지 강도 → all-or-nothing 부분 stamp 거부 + `reviewed_plan_hash` bind(리뷰 후 plan 편집 시 승인 무효, 복구는 재봉인이 아니라 재실행) + evidence 경로 불변식은 verdict와 무관하게 상시 적용.

**미해결**
- [ ] 목표 10분 달성 실측 — 통과 경로가 아직 한 번도 관측되지 않았다. 차단 경로 wall-clock까지 포함해야 "게이트가 얼마나 걸리는가"에 답이 된다 (#4)
- [ ] L3 자동 트리거 조건 임계값 — "L2 divergent" 판정 기준, risk-signal 파일 패턴. #4 실측 전까지 근거 없는 임계를 날조하지 않는다 (#2)
- [ ] self-consistency 샘플 수 — M1은 역할 다양성(4역할 × 1샘플)만 diversity 축으로 썼다. 동일 질문 N회 독립 샘플 majority의 비용 대비 값 미확인
- [ ] 지표 코퍼스의 내구성 — plan 게이트 receipt가 worktree-only라 ship마다 소멸한다. 단발 실측으로 충분한가, 아니면 내구 표면이 필요한가 (#4에서 판단)
- [ ] 패널 승인의 실제 품질 — 라이브 1회는 `divergent`(반려)였다. 승인을 발급한 경우의 false-approve 비율은 표본 0

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 게이트 배선이 단위 test 사거리 밖(markdown seam)이라 결함이 ship 후에야 드러남 | **High (실증)** | High | M1 실측 28건이 전부 이 층 — #5 오라클 추출이 정면 대응, #4가 라이브 완주를 acceptance로 승격해 "단위 test 통과 = 경로 작동"의 오등식을 차단 |
| 결함 수정이 새 결함을 만듦 (배선을 고칠 때마다 배선이 늘어남) | **High (실증)** | Medium | santa-loop 20건 중 6건이 이 형태 — #5 이전에는 배선 추가를 최소화하고(#1.5를 뒤로), 수정 시 회귀 test는 **수정 전 실패를 실측**한 것만 인정 |
| 지표 코퍼스 부재 → "측정했다"는 착각 위에 튜닝 (confidently-wrong) | **High (실증)** | High | 산출 0인 지표는 `forward-only`로 표기 · #2 임계 튜닝은 #4 실측 전 착수 금지 · 선례(MSW B3)를 명시적으로 참조 |
| same-model L2가 correlated → self-approval (작성자=리뷰어 blind spot 재도입) | Medium (**미실증** — 승인 발급 표본 0) | High | L1 deterministic backbone을 gatekeeper로 앞세움 + `review_proof` fail-closed(역할 다양성·독립 verification 강제) + L3 hybrid 안전판 ([verification-layer §7](../meta/verification-layer-design.md)) |
| panel run에서 intent adjudication이 skip돼 커버리지 후퇴가 상시화 | Medium | Medium | skip은 조용하지 않고 proof와 함께 stamp됨(감사 가능) + #1.5가 소유 · 후퇴가 길어지면 순서 재조정 |
| L3 자동 트리거 과발동 → 10-15분 지연으로 회귀 | Medium | Medium | #4 실측 확보 후에만 임계 결정 + risk-signal(mechanical, L2 독립)로 트리거 상관 완화 |
| `converged` 재정의가 dedupe/ship-gate 불변식 손상 | Low | High | `resolveEffectiveVerdict` 단일 helper로 소비처 계승 + 회귀 test ([converged §4](../meta/converged-redefinition-design.md)) |
| 기존 git-tracked ship corpus의 receipt_hash 변경(재봉인 사고) | Low | High | present-only 필드 + skeleton 미materialize(§3.12 no-rehash) + hash 안정성 test |

---
*Status: M1 배송 완료 · 나머지 milestone은 요구사항 단계. 구현 계획은 /mccp:plan.*
*Co-created with user on 2026-08-06. Revised 2026-08-09 (M1 ship 후 실측 반영 — 지표 정직화 + milestone 4건 추가).*
