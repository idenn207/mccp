# Diverse-Agent Review — cross-model 의존 전환

## Problem
mccp의 plan/implement/pr 게이트는 dual-review를 위해 Codex(외부 cross-model) 리뷰에 의존한다. 이 리뷰가 게이트당 **평균 10-15분 blocking**이고 자주 미가용이라, 반복 plan 작성과 연속 milestone ship에서 대기가 누적되고 review 공백이 생긴다. 방치 비용: 운영 속도 저하 + Codex 미인증/companion 실패 시 dual-review 안전망 붕괴(receipt skip).

> 상세 설계 근거는 `.claude/meta/` 3문서 참조: [diverse-agent-review-analysis.md](../_meta/diverse-agent-review-analysis.md)(논문+사례+R2 결론) · [converged-redefinition-design.md](../_meta/converged-redefinition-design.md)(verdict 재정의 + 소비처 계승) · [verification-layer-design.md](../_meta/verification-layer-design.md)(L1/L2/L3 3층 verification).

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
- **그 "발화 가능"은 clause 3을 충족하지 않는다 — 판정 확정 (2026-08-13 santa-loop)**: 두 리뷰어가 여기서 갈렸다. Opus는 도달 불가를 도달 가능으로 바꾼 것이 clause의 취지라 보아 충족으로 읽었고, Codex GPT-5.4는 위 문장이 스스로 "라이브 발화는 미관측"이라 적는 이상 시뮬레이션을 "실제로 발화"의 증거로 쓸 수 없다며 미충족으로 읽었다. **운영자가 후자로 판정했다** — clause 3은 라이브 `/mccp:plan`에서의 실제 발화를 요구한다. 이 판정으로 #4의 미충족 clause는 2개가 됐고, 둘 다 같은 선행 조건(설치된 런타임)을 공유한다 — 그래서 둘을 함께 **#6으로 이관**했다(아래 milestone note 참조). 한 번의 라이브 완주가 양쪽을 동시에 관측한다. UI5가 "수정 전 실패를 실측한 것만 회귀로 인정"한다고 적은 것과 같은 종류의 기준을 acceptance에도 적용한 것이다 — **실행 가능함은 실행됨이 아니다.**
- **UI5(수정 전 실패 실측)를 지켰다**: 신규 단언 5건이 fix **전** 실패(23개 중 5 fail)하는 것을 먼저 관측하고 기록한 뒤 구현했다 — 적용 후 23/23 green. M1의 "공허한 validation" 반려 사유를 같은 형태로 반복하지 않기 위한 절차다.

**M6 실측 (2026-08-14 추가)** — 선행 조건은 해소돼 있었다(캐시 `1.23.8`에 `record.js`·`budget.js` 존재 · `mccp:review-*` 4종 레지스트리 등록 · `cli.js mode` → `multi-agent` quorum 3of4, 전부 실측). **막힌 것은 런타임이 아니라 승인이었다.**

- **O1 — 패널은 4회 라이브 실행에서 승인을 0건 발급했다**: 대상은 M6 plan 자신이며, 매 라운드 직전 findings를 전량 흡수한 뒤 재제출했다. L1은 4회 모두 `converged`(violations 0)였으므로 막은 것은 mechanical 층이 아니라 **L2**다. R1 findings 24건 / 전원 `fail` · R2 8건 / `invariant` **pass**, architect 무응답 · R3 7건 / `invariant` **pass** · R4 19건 / 전원 `fail`. 관점 단위로는 **16회 중 `pass` 2회**. R3→R4에서 findings가 7→19로 **역전**했는데 그 사이 변경은 운영자 수동 절차를 없애려는 구조 재편이었다 — **표면을 줄이려는 재편이 새 표면을 만들었다**(Risks의 "결함 수정이 새 결함을 만듦"이 plan 층에서 재현). 이 수치는 승인 품질(false-approve 비율)에 답하지 않는다. 답하는 것은 그 앞의 질문이다 — **승인이 발급되는가**. 표본 4에서 답은 아니오다(→ #8).
- **O2 — 차단 경로 wall-clock은 4회 모두 목표(10분) 이내였다**: `307,578` · `342,767` · `321,954` · `280,209` ms, 평균 약 313초(5.2분) · 최대 5.7분. 차단 경로는 패널 4개 발화 + 판정까지를 포함하므로 통과 경로가 이보다 크게 느릴 이유는 없다 — 그러나 **이는 차단 경로의 수치이며 통과 경로 지표를 대신하지 않는다**(UI3·UI10). **증거 강도는 균일하지 않다**: R4(`280,209`)만 [plan-review-diverse-agent-review-m6-r4-blocked.md](../reviews/plan-review-diverse-agent-review-m6-r4-blocked.md)에 파일로 남아 있고 R1–R3은 각 라운드 `cli.js record` stdout의 세션 관측이다. 그 이유가 O3이며, 소급 복구는 원리상 불가능하다.
- **O3 — 계측 표면은 라운드 축적을 지원하지 않는다 (M4 계측의 남은 절반)**: 레코드 경로는 `.claude/reviews/plan-review-<decision_slug>.md`이고 slug는 **PRD 경로**에서 파생된다(`derive-decision --args .claude/prds/diverse-agent-review.prd.md` → `diverse-agent-review`, 실측). `cmdRecord`는 그 경로에 무조건 덮어쓰므로 **같은 결정에 대한 재실행은 이전 기록을 지운다** — 4회를 돌렸고 디스크에 남은 레코드는 1건이다. M4는 계측을 *통과 경로 편향*에서 구했지만(차단 경로도 기록되게) **재실행 편향**은 남겨뒀다: 한 결정에 대해 마지막 실행만 남으므로 수렴 과정 — 즉 #6이 실제로 생산한 데이터 — 은 축적되지 않는다. M4가 스스로를 검증할 때 이것이 안 보인 이유는 그 milestone이 게이트를 **한 번만** 돌렸기 때문이다. 수정은 배선 변경이라 #6 범위 밖이며 **#9**로 이관한다(UI6).

**M7 실측 (2026-08-21 추가)** — 선행 조건은 이번에도 해소돼 있었다(installed `1.30.0` = 워크트리 · `workflows/plan-review.js` 포함 5개 파일 `diff -q` 무출력 · `cli.js mode` → `multi-agent` quorum 3of4 · agent 4종 등록, 전부 실측). **막힌 것은 게이트가 아니라 게이트로 가는 입력이었다.**

- **B1 — 발화 조건의 첫 항이 전부를 결정하고, 그 항은 저장소 밖에서 온다**: [plan-review.js:161](../../plugins/mccp/scripts/workflows/plan-review.js)은 `budget.total && budgetRemaining < minRemaining`이다. agent를 하나도 쓰지 않는 프로브로 이 turn의 `budget`을 **직접 쟀다** — `total = null`(typeof `object` · truthy `false`) · `spent() = 102789` · `remaining() = **Infinity**`. 따라서 표현식은 `false`다. 핵심은 `total`이 null일 때 `remaining()`이 `0`이 아니라 **`Infinity`로 퇴화**한다는 것이다: 단락평가를 걷어내도 `remaining < minRemaining`은 거짓이므로 `MCCP_PLAN_REVIEW_BUDGET`을 포함해 **threshold 쪽 어떤 값으로도 이 게이트를 발화시킬 수 없다**. 프로브는 agent 0개 · 토큰 0 · 15ms이며 저장소 밖 스크래치에서 돌았다. 이는 M4의 `AsyncFunction` 시뮬레이션과 다른 종류의 증거다 — 워크플로 소스를 추출해 실행한 것이 아니라 **프로덕션 `Workflow` primitive가 주입하는 값 자체**를 읽었다.
- **B2 — 라이브 발화는 관측되지 않았다. 실패한 것은 게이트가 아니라 plan이 단언한 전달 경로다**: 운영자가 turn 프롬프트 본문에 `+200k`를 실은 채 `/mccp:plan`을 실행했고(M7 plan DN9가 규정한 **유일한** 입력), `MCCP_PLAN_REVIEW_BUDGET`은 건드리지 않았다(DN6). 그런데도 `budget.total`은 `null`이었다. 패널은 정상 발화해 agent **4개**를 spawn했고(`subagent_tokens 412,349`) 반환된 `l2.json`은 `skipped:false` · `coverage:4`이며 budget-skip 반환에만 실리는 `remaining`/`minRemaining` 키가 **없다** — 워크플로 자신이 그 분기를 타지 않았다고 말한다. **배선 결손이 아니다**: `fleetKeys` 4개가 그대로 반영됐고(1-reviewer 강등 로그 없음) 형제 키 `minRemaining=600000`도 도달했으므로 M4가 닫은 producer 결함의 재발이 아니다. #4가 만든 도달 가능성은 유효하되 **그 문을 여는 열쇠가 저장소 안에 없다**.
- **B3 — 게이트↔fan-out 비대칭은 관측되지 않았다**: 대조하려던 것은 "같은 부족 상황에서 fan-out은 fail-open으로 진행하고 패널은 fail-closed로 HALT한다"인데, **부족 상황 자체가 성립하지 않았다**(`budget.total=null`이면 어느 쪽도 budget 분기를 타지 않는다). Phase 2.5 fan-out은 이번 실행에서 발화하지 않았고 인라인 Pattern Grounding으로 강등됐다. 미관측으로 적는다 — 인접한 두 실행을 대조 관측으로 승격하지 않는다(UI10).
- **부수 확정 — 패널이 이 결함을 먼저 지목했다**: 같은 turn의 L2 `test/HIGH` finding 원문이 *"there is no test in this repository that verifies the Workflow harness actually extracts `+200k` from the prompt and sets `budget.total`. The only place `budget.total` is set in code is in the unit test mock"*였다. 라이브 실행이 그 지적을 실측으로 확인했다 — **패널의 예측과 라이브 관측이 같은 지점에서 만난 첫 사례**다. 다만 이것이 O1을 뒤집지는 않는다: 패널은 이번에도 승인하지 않았고(`divergent`, 관점 4 중 `pass` 2), 진행은 단일통과 토글(`deadline_pressure`)이 냈다. **이번 turn의 관점 단위는 4회 중 `pass` 2회**(architect · security)이며, M6의 16회 누계와 합산하지 않는다 — 그 사이 M7 round 1이 한 번 더 돌았고 그 판을 이 자리에서 재검증하지 않았다.
- **판정 — 미달 축은 #10으로 이관한다**: #7이 소유하는 것은 "budget 게이트를 라이브로 발화시켰다"가 아니라 **"왜 이 경로로는 발화시킬 수 없는지를 실측으로 확정했다"**이다. 산출물은 [plan-review-diverse-agent-review-m7-budget.md](../reviews/plan-review-diverse-agent-review-m7-budget.md)(관측 레코드 고정 · `## Measurement` 바이트 무변경)와 [m7 보고서](../PRPs/reports/diverse-agent-review-m7-report.md)다. **동작 코드는 0줄 바꿨다**(UI6).

**M8 실측 (2026-08-26 추가)** — 이번에는 선행 조건이 아니라 **집계 범위**가 문제였다. `.claude/reviews/`의 코퍼스는 이미 판정에 충분했고, #6·#7이 "표본 0"으로 적은 것은 데이터 부재가 아니라 세는 범위가 이 PRD 자신의 게이트 실행으로 좁혀져 있었기 때문이다. 판정은 read-only·LLM-free 집계 도구([corpus.js](../../plugins/mccp/scripts/lib/plan-review/corpus.js))가 재도출하며 원자료는 [quorum-calibration.md](../../docs/diverse-agent-review/quorum-calibration.md)에 축자 동결돼 있다. **동작 게이트 코드는 0줄 바꿨다**(UI6 — 사전 파일 9종 diff 공집합, 기계 확인).

- **Q1 — 승인 경로는 존재한다**: `pass_path.count = 5`. 5건 전부 `reviewed_plan_hash` 결속이 있고(`hash_bound = 5`), 5건 전부 quorum이 실제로 만족돼 통과했다. wall-clock 중앙값 6.4분. **다만 5/35를 승인 확률로 부르지 않는다** — O3 생존 편향의 방향이 불분명하고 커버리지가 48건 중 35건이라 모든 수치가 하한이다(DN8 · UI7 · UI8). **UI9는 충족되나 그 근거는 관측이 아니다**: `single_pass_tainted = 0`은 `decide.js:338`이 완화를 언제나 `divergent`로 봉인하므로 어떤 코퍼스에서도 구조적으로 0이다(§3.15). 그 필드는 관측이 아니라 그 봉인의 회귀 가드이며, 완화가 실제로 몇 번 일어났는지는 별도 축 `single_pass`가 센다 — **14건**(전부 divergent).
- **Q2 — M과 K는 승인 임계가 아니었다**: 차단 30건 중 quorum이 실제 평가된 27건에 대해 `m_binding = 0` · `k_binding = 0` · `findings_binding = 27`. 나머지 3건은 quorum 도달 전 halt라 모수에서 제외했다(분모에 넣으면 무력성 주장이 공짜로 강해진다). `quorum.js`의 세 사유가 독립 누적이고 `passed`가 `reasons.length === 0`이므로, 두 손잡이가 한 번도 binding이 아니었다면 어떻게 돌려도 승인 빈도는 움직이지 않는다.
- **Q2b — K는 이미 돌아갔고 지표는 움직이지 않았다 (자연 실험)**: `MCCP_PLAN_REVIEW_ROLES_MIN=1`이 tracked settings에 들어간 `794c4de`(2026-08-20T16:36:03Z)로 코퍼스가 자연 분할된다 — K=3 구간 25건 중 converged 4건, K=1 구간 10건 중 1건. **손잡이를 실제로 돌렸는데 지표가 반응하지 않았다.** `k_binding = 0`과 독립적으로 같은 방향을 가리키는 유일한 관측 증거다.
- **Q3 — 실제 승인 규칙은 severity 게이트다**: 27건 전부가 `findings_binding`이다. 관점별 통과율은 고르지 않으나(invariant 10/33 pass, security 22/33) **이를 임계 과잉으로 읽지 않는다** — 실패 리뷰어 인스턴스 64건 중 52건이 실물 차단 finding을 동반했다. 리뷰어는 실제로 결함을 찾은 것이고, 승인 빈도를 올리려 severity 게이트를 손보는 것은 UI4가 금지하는 축의 변형이다. **기본값 무변경**(DN6). **단 문장은 좁혀 읽어야 한다**: `single_pass.records = 14`이므로 차단 30건 중 14건(47%)은 게이트가 `divergent`를 봉인하고도 단일통과 토글로 작업이 진행됐다. severity 게이트는 *verdict를 결정하는* 규칙이지 항상 *작업을 멈추는* 규칙이 아니며, 이 코퍼스에서 둘은 30건 중 16건에서만 일치했다.
- **Q4 — F6 기여도는 0이 아니라 1이다 (예비 실측 정정)**: plan의 DN7은 "F6 단독으로 막힌 레코드 0건"을 시사했으나 도구의 판정은 **1건**이다(`archive/plan-review-followup-R12.md` — 3/3 응답·3 roles로 M·K 만족, 두 실패 리뷰어의 finding이 전부 MEDIUM). 리뷰어 인스턴스 단위로는 12건에서 F6이 유일한 차단 사유였다. 예비 실측과 이 milestone의 **초판 구현이 함께 0으로 본 이유**는 `record.js#findingRows`가 finding 0건일 때만 합성 `FAIL` 행을 쓰기 때문이다 — 그 행만 세면 MEDIUM만 낸 실패 리뷰어가 구조적으로 관측되지 않는다(코퍼스 전체 합성 행 0건). 정본 소스는 `## Refutation attempted` 표이며 회귀 test가 이 결함을 고정한다. **UI10대로 증거가 바뀌었으므로 판정을 갱신했다.**
- **판정 — #8은 답했고 #11을 연다**: #8이 소유하는 것은 "quorum을 튜닝했다"가 아니라 **"튜닝할 손잡이가 아니었음을 실측으로 확정했다"**이다. `3of4`도 K도 severity 게이트도 바꾸지 않았고 그것이 결론이다. 남은 질문(승인 **품질** = false-approve 비율)은 converged 5건의 사후 감사를 요구하는 별개 관측 작업이라 **#11**로 이관한다. **M8은 CLAUDE.md §3.14를 해제하지 않는다** — 해제는 운영자 판정이고, M8이 제공하는 것은 그 근거("0이라 안전하다"가 아니라 "1이고 그 1건을 지목할 수 있다")다.

## Users
- **Primary**: mccp를 운영하며 `/mccp:plan`·`/mccp:prp-implement`·`/mccp:pr` 게이트를 매번 통과해야 하는 단일 운영자(skypark207). trigger: 게이트 진입 시 Codex 리뷰 대기.
- **Not for**: 팀 협업 다중 사용자 시나리오 — 현재 개인용 plugin monorepo.

## Hypothesis
We believe **diverse-agent 다관점 리뷰 + 계층적 verification(L1 deterministic backbone / L2 self-consistency / L3 hybrid opt-in)으로 `converged`를 재정의**하는 것이 **게이트 리뷰 대기(10-15분)를 크게 줄이면서 blind-spot 안전판과 dual-review 불변식을 보존**하는 데 유효하다 — for **mccp 운영자**.
We'll know we're right when **통과 경로 게이트 실행의 wall-clock이 실측으로 10분 이내이면서, `converged` 봉인이 여전히 fail-closed(proof 없으면 no-ship)·tamper-protect·provenance를 유지하고 기존 dedupe/ship-gate 회귀가 0**일 때.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| plan 게이트 wall-clock (통과 경로) | 실측 1회 이상 ≤ 10분 | **M8 달성 (2026-08-26) — 5건 관측, 중앙값 6.4분, 5건 중 4건이 10분 이내** (`499,741` · `779,328` · `357,124` · `363,402` · `382,180` ms). 5건 전부 `reviewed_plan_hash` 결속이 있고 `MCCP_REVIEW_SINGLE_PASS` 흔적이 **없다**. 다만 **UI9 충족의 근거는 이 관측이 아니라 상류 불변식**이다 — `decide.js:338`이 완화를 언제나 `divergent`로 봉인하므로 `single_pass_tainted`는 어떤 코퍼스에서도 구조적으로 0이고(§3.15), 이 코퍼스는 그 불변식에 반례가 없음을 확인해 줄 뿐이다. 완화 자체는 별도 축 `single_pass`가 세며 **14건**(전부 divergent)이다. 원자료는 [quorum-calibration.md](../../docs/diverse-agent-review/quorum-calibration.md)에 `corpus.js --json` 축자 인용으로 동결. **이 갱신의 근거는 새 데이터 수집이 아니라 집계 범위 정정이다**(DN9): 지표 이름은 "plan 게이트 wall-clock"이지 "이 PRD의 게이트 실행"이 아닌데, #6·#7은 자기 PRD의 실행만 세어 표본 0을 봤다. 실제로는 그 5건 중 **4건이 이미 M7 tip(`11f7dc2`)에 존재**했다 — 즉 #6·#7 시점에도 코퍼스에는 있었고 세지 않았을 뿐이다. **이전 판정은 그 범위에서 옳았다**: "이 PRD의 게이트 실행에서 승인 0건"은 지금도 참이다(아래 이력 보존). 골대를 옮기지 않기 위해 무엇이 바뀌었는지를 이 칸 안에 적는다 — 바뀐 것은 목표도 데이터도 아니고 **무엇을 세는가**다. 차단 경로 행은 손대지 않는다(UI8). **이력(범위 정정 이전)**: 미산출 (forward-only) — #6에서 4회 시도, 승인 0건(O1) — 표본이 0이므로 달성으로 적지 않는다(UI3). 선행 조건은 해소돼 있었다: 캐시 `1.23.8`에 `record.js`·`budget.js`가 있고 `mccp:review-*` 4종이 세션 레지스트리에 등록돼 있으며 `cli.js mode`가 `multi-agent`(quorum 3of4)를 반환한다(실측). **막은 것은 런타임이 아니라 승인이었다** — 관점 단위 16회 중 `pass` 2회. 승인 경로 관측은 #8의 캘리브레이션 판정에 의존한다. **M7(2026-08-21)에서도 미산출** — 그 turn의 패널 역시 승인하지 않았고(`divergent`, 관점 4 중 `pass` 2) 진행은 단일통과 토글이 냈다. 토글이 낸 진행은 승인이 아니므로 통과 경로 표본으로 세지 않는다 |
| plan 게이트 wall-clock (차단 경로) | 계측 도달 (M1에서 구조적 미계측) | **M4 달성 · #6에서 4회 실측** — `307,578` · `342,767` · `321,954` · `280,209` ms(평균 약 313초=5.2분, 최대 5.7분)로 4회 모두 통과 경로 목표(10분) 이내. 다만 이는 **차단 경로 수치이며 통과 경로 지표를 대신하지 않는다**(UI3·UI10 — 인접 측정을 목표 측정으로 승격하지 않는다). 증거 강도는 균일하지 않다: R4(`280,209`)만 [plan-review-diverse-agent-review-m6-r4-blocked.md](../reviews/plan-review-diverse-agent-review-m6-r4-blocked.md)에 파일로 남고 R1–R3은 세션 관측이다(사유는 O3, 표기는 DN4). 표면은 receipt(worktree-only)가 아니라 git-tracked `.claude/reviews/`. **M7에서 2회 추가**(`458,271` · `482,116` ms) — 둘 다 목표 이내이나 같은 이유로 통과 경로 칸으로 옮겨 적지 않는다. 후자는 [plan-review-diverse-agent-review-m7-budget.md](../reviews/plan-review-diverse-agent-review-m7-budget.md)에 파일로 남고 전자는 세션 캡처다(사유는 여전히 O3) |
| `converged` 봉인 무결성 | proof 없으면 no-ship, 회귀 0 | dedupe/ship-gate 회귀 test |
| dual-review 불변식 | 무손상 | 기존 게이트 test suite green |
| L3(cross-model) 발동 비율 | **forward-only** — M1 미산출, 코퍼스 확보 후 주장 | receipt L3-stamp 집계 |
| git-tracked ship corpus hash | 무변경 | present-only 필드 hash 안정성 test |

> **지표 정직성 규칙**: 산출 이력이 0인 지표는 "달성"이 아니라 `forward-only`로 적는다. M1은 계기를 배송했으나 통과 경로가 한 번도 관측되지 않아 headline 두 지표가 미산출이었다 — 이 사실을 status로 감추지 않고 Evidence와 이 표에 명시한다(선례: multi-session-work-loop M2 measurement-honesty downgrade).
>
> **M4 갱신**: 차단 경로 지표는 달성됐다(계측 표면이 receipt에서 git-tracked `.claude/reviews/`로 이전, 전 HALT 경유). 통과 경로 지표는 **여전히 미산출**이며 그렇게 적는다 — M4는 계측 결손을 닫았지 통과 경로를 관측하지 못했다. 선행 조건(`claude plugin update` → 새 세션)은 코드 변경으로 충족할 수 없는 런타임 조건이라 milestone 안에서 해소되지 않았다.
>
> **2026-08-13 santa-loop 갱신**: 위 선행 조건은 **여전히 유효하되 내용이 바뀌었다**. 막고 있던 것은 agent 미등록이었고 그것은 해소됐다(캐시 `1.23.7`, agent 4종 등록). 지금 막는 것은 installed 트리에 M4 산출물이 없다는 것이며, 해소는 이 브랜치 버전 설치 + 새 세션으로 가능하다(PR #126 머지 불필요). **stale한 사유로 milestone을 판정하지 않기 위해 사유를 갱신하되 판정은 바꾸지 않는다** — 미산출은 미산출이다.
>
> **이관 (같은 날, Outcome 개정)**: 그 선행 조건이 (= 머지된 main)를 요구하는 이상, 이 항목은 머지 전 milestone이 소유할 수 없다. 통과 경로 지표는 **#6 소관**으로 옮겼다. #4는 자기가 실제로 배송한 것(차단 경로 계측 · 계측 표면 이전 · budget 도달 가능 · acceptance 명문화)으로 complete다.
>
> **M6 갱신 (2026-08-14)**: 선행 조건은 해소됐고 게이트는 **4회 라이브로 완주 시도**됐다. 그런데도 통과 경로는 여전히 미산출이다 — 이번에는 런타임이 아니라 **승인이 나지 않아서**다(O1). 사유가 세 번째로 바뀌었으나 판정은 바꾸지 않는다: 표본 0은 달성이 아니다. 차단 경로 수치가 4건 확보돼 목표 이내임이 보였지만 그것을 통과 경로 칸으로 옮겨 적지 않는다 — 인접 측정을 목표 측정으로 승격하는 것이 정확히 UI10이 금지하는 형태다. **관측이 미달을 확정하는 것도 milestone의 산출물이다**: #6은 "완주했다"가 아니라 "4회 완주 시도의 결과가 이것이다"를 소유한다.
>
> **M7 갱신 (2026-08-21)**: 통과 경로는 **네 번째 사유로도 미산출**이다. 순서대로 — 캐시에 agent 미등록(#4) → installed 트리에 M4 산출물 부재(#4 후반) → 승인이 나지 않음(#6) → **이번에는 승인이 나지 않은 데 더해, 관측하려던 축(budget) 자체가 저장소 밖 입력에 막혔다**(#7 B1). 판정은 네 번 모두 같다: 표본 0은 달성이 아니다. M7이 차단 경로 수치를 2건 더 얹었지만 그것 역시 통과 경로 칸으로 옮기지 않는다 — 네 번 반복해도 UI10은 같은 것을 금지한다.
>
> **M7이 추가한 규칙**: 단일통과 토글(`MCCP_REVIEW_SINGLE_PASS`)이 낸 진행은 **승인이 아니다**. 토글은 `divergent`를 `divergent` 그대로 봉인하고 라운드만 없앤다(CLAUDE.md §3.15). 따라서 그 turn의 wall-clock은 통과 경로 표본이 아니라 차단 경로 표본이며, 이것을 혼동하면 이 표의 headline 지표가 조용히 자기 자신을 충족시킨다.

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
| 4 | 차단 경로 계측 + 지표 부채 상환 | wall-clock이 **차단 경로에서도** 기록돼 survivorship bias 제거 · 계측 표면이 worktree-only receipt에서 git-tracked `.claude/reviews/`로 이전 · budget 게이트가 **구조적 도달 불가**에서 벗어나 런타임 실행으로 확인 · "라이브 완주"가 acceptance 항목으로 명문화 | complete | `.claude/plans/diverse-agent-review-m4.plan.md` |
| 6 | 설치된 런타임에서 패널 실측 | 설치된 런타임에서 패널을 **4회 라이브 실측**하고 그 결과를 milestone 산출물로 확정 — 승인 0건(O1) · 차단 경로 wall-clock 4회 모두 목표 이내(O2) · 계측 표면의 **재실행 편향** 발견(O3) · 미달 축과 신규 축을 #7·#8·#9로 이관 | complete | `.claude/plans/diverse-agent-review-m6.plan.md` |
| 7 | budget 게이트 라이브 발화 관측 | 라이브 `/mccp:plan`에서 budget 게이트가 실제로 발화해 agent 0개 spawn + 실측 `remaining`/`minRemaining`이 남음 — 시뮬레이션은 라이브 발화의 증거가 아니다(UI10). #4에서 도달 가능해졌고 #6이 관측하지 못한 축. **관측 결과는 발화가 아니라 발화 불가의 원인이었다** — `budget.total=null` · `remaining()=Infinity`를 직접 실측해 threshold 쪽 어떤 값으로도 발화 불가임을 확정(B1). 라이브 발화 축은 #10으로 이관 | complete | `.claude/plans/diverse-agent-review-m7.plan.md` |
| 8 | 패널 quorum 캘리브레이션 재검토 | `3of4` + K=3의 적정성을 **35건 코퍼스 실측으로 판정** — 승인 경로는 **존재한다**(converged 5건, 전부 hash 결속·단일통과 토글 미사용). quorum이 평가된 차단 27건 중 M·K가 binding이었던 것은 **0건**이고, K를 3→1로 실제로 낮춘 자연 실험에서도 승인 빈도가 움직이지 않았다 — **손잡이는 무력하고 실제 승인 규칙은 severity 게이트다**. F6 기여도는 예비 실측의 0건이 아니라 **1건**으로 정정됐다(UI10). 기본값 무변경 · 게이트 배선 diff 공집합. 승인 **품질**은 #11로 이관 | complete | `.claude/plans/diverse-agent-review-m8.plan.md` |
| 11 | 패널 승인 품질 감사 (false-approve) | #8이 확정한 converged 5건을 사후 감사해 **승인이 옳았는가**를 판정 — 각 승인 plan을 그 시점 코퍼스와 대조해 패널이 놓친 실물 결함이 있었는지 본다. #8 이전에는 표본 0이라 질문 자체가 성립하지 않았다. 관측 작업이므로 배선 추가가 아니고 #5 앞에 둘 수 있다 | pending | — |
| 5 | 게이트 배선 오라클 추출 | 게이트 승인 배선이 단위 test 사거리 안으로 이동 — seam 결함이 ship 후 리뷰가 아니라 test로 잡힘 | pending | — |
| 9 | 계측 재실행 편향 해소 | 같은 결정에 대한 재실행이 이전 레코드를 덮어쓰지 않아 수렴 과정이 축적됨(O3) — 레코드 경로 slug가 PRD 경로 파생이라 한 PRD의 모든 milestone·모든 라운드가 한 파일을 공유한다. 배선 변경이므로 **#5의 오라클 추출 뒤에** 착수한다(UI6) | pending | — |
| 10 | budget 게이트 전달 경로 확정 | `budget.total`을 세우는 전달 경로가 **존재하는지 먼저 확정**하고, 존재하면 그때 라이브 발화를 관측한다 — #7 실측으로 turn 프롬프트의 `+200k`가 `total`을 세우지 못하고 `remaining()`이 `Infinity`로 퇴화함이 확정됐다(B1). 저장소 코드로 닿지 않는 축이므로 harness 계약 확인이 선행하며, 존재를 모르는 채 "발화시킨다"를 acceptance로 적으면 #4가 맞았던 순환을 형태만 바꿔 반복한다 | pending | — |
| 1.5 | 패널 intent adjudication | 패널이 user intent를 입력으로 받고 자기 findings를 그에 대해 판정 · panel run에서 intent gate가 *skip*이 아니라 *satisfied* | pending | — |
| 2 | L3 자동 트리거 | 불확실성(A: L2 divergent/quorum 경계) ∨ 위험영역(B: auth·API·migration·schema·gate-self·ledger) ∨ ship지점(C: terminal PR) 신호 시 cross-model 자동 발동 · **#6 실측**으로 조건 튜닝 · 과발동↔지연 균형 관측 | pending | — |
| 3 | implement-verify 3층 확장 | `mccp-implement-verify`를 L1(강한 test/typecheck backbone)+L2+L3로 generalize · 코드 diff 게이트의 verification 가치 극대화 | pending | — |

> **번호는 정체성, 순서는 표 위치.** CHANGELOG 1.23.5와 CLAUDE.md §1.4가 이미 "M2=L3 자동 트리거 · M3=implement-verify 3층 확장 · M1.5=패널 intent 편입"을 그 이름으로 참조하는 ship 기록이라, 재번호는 그 기록을 거짓으로 만든다. 대신 행 순서를 실행 순서로 쓴다 — `/mccp:plan`의 "next pending" 선택도 이 순서를 따른다.

> **#6이 생긴 이유 — acceptance가 순환이었다 (2026-08-13).** #4의 원래 Outcome은 "패널 승인 경로 1회 완주"와 "budget 게이트 실발화"를 담았고, 그 plan의 Task 5는 충족 절차를 `claude plugin update → 새 세션`으로 적었다. 그런데 이 플러그인은 git-source라 `claude plugin update`는 **머지된 main**을 당긴다. 운영자의 규칙("milestone이 complete돼야 PR을 올린다")과 곱하면 complete → merge → 설치 → complete의 **순환**이 된다 — 머지된 아티팩트로만 충족되는 조건이 머지 전 milestone의 완료 조건에 들어간 것이다.
>
> **이 PRD는 같은 정정을 이미 한 번 했다.** #1 행이 "계기 배선(지표 산출은 **#4 소관**)"이라 적는다 — 계기를 만든 milestone에서 지표 산출을 떼어낸 기록이다. #4는 그 교훈을 절반만 적용했다: 지표를 받아왔으나 그 지표가 **설치된 런타임을 전제**한다는 것을 계산에 넣지 않았다. 따라서 #6으로의 이관은 골대 이동이 아니라 같은 구조적 이유에 같은 정정을 반복하는 것이다.
>
> **이후 milestone에 적용할 규칙**: acceptance 항목이 *이 브랜치가 머지·배포된 뒤에만* 관측 가능하면 그 항목은 이 milestone의 것이 아니다. "만들었다"와 "설치된 채로 관측했다"는 다른 milestone이 소유한다.
>
> **#1.5를 #5 뒤에 둔 이유.** intent 편입은 게이트 배선을 *더 늘리는* 작업이고, M1 실측이 "흡수 20건 중 6건은 앞선 라운드 수정이 만든 것, 3건은 같은 셸-상태 형태"를 보였다. 추출 전에 배선을 늘리면 그 패턴을 그대로 재생산한다. 다만 그동안 panel run의 intent gate는 *skip* 상태로 남는다 — 정직하게 stamp되긴 하나 #118이 세운 커버리지에 대한 후퇴이므로, 이 후퇴를 더 못 기다리겠다고 판단되면 순서를 뒤집을 수 있다.
>
> **#7·#8·#9가 생긴 이유 — #6은 목표를 낮춘 것이 아니라 관측을 적었다 (2026-08-14).** #6의 원래 Outcome은 clause 3개(패널 승인 경로 완주 · budget 라이브 발화 · 통과 경로 wall-clock 기입)였고, 게이트를 4회 라이브로 완주 시도한 결과는 **승인이 아니라 데이터**였다(O1~O3). 세 clause 중 어느 것도 "달성"으로 적지 않는다 — 통과 경로는 표본 0이라 forward-only로 남고(UI3), budget 라이브 발화는 **#7**로(UI13), 새로 열린 quorum 캘리브레이션은 **#8**로, 계측 재실행 편향은 **#9**로 간다. #6이 소유하는 것은 **그 셋을 실측으로 확정한 것**이다.
>
> 이것은 #4 → #6 이관과 같은 형태이며 같은 규칙을 따른다: **판정을 바꾸지 않고 사유를 갱신한다.** 다만 사유의 종류가 달라졌다 — #4·#6의 이관은 *선행 조건*(머지된 런타임)이 milestone 밖에 있다는 이유였고, 이번은 선행 조건이 해소된 뒤 **실행이 실제로 무엇을 산출했는가**가 이유다. 전자는 acceptance 설계의 정정이고 후자는 관측 결과다. 그래서 #6은 미달을 이관하면서도 `complete`다.
>
> **#9를 #5 뒤에 둔 이유**는 #1.5와 같다 — 계측 배선을 늘리는 작업이므로 오라클 추출 전에 착수하면 같은 seam 패턴을 재생산한다(UI6). #7·#8은 배선 추가가 아니라 관측·판정이므로 #5 앞에 둔다.
>
> **#7이 확정한 것과 #10이 생긴 이유 — 사유의 종류가 세 번째로 달라졌다 (2026-08-21).** #7의 Outcome은 "budget 게이트가 실제로 발화해 agent 0개 spawn + 실측 `remaining`/`minRemaining`이 남음"이었다. 관측을 실행한 결과는 **발화가 아니라 발화 불가의 원인**이었다 — agent를 쓰지 않는 프로브로 `budget.total = null` · `remaining() = Infinity`를 직접 재고, 그로부터 `MCCP_PLAN_REVIEW_BUDGET`을 포함한 **threshold 쪽 어떤 값으로도 발화시킬 수 없음**이 따라 나온다(B1). 라이브 발화 축은 **#10**으로 이관한다.
>
> 이관 규칙은 #4 → #6 → #7과 같다(**판정을 바꾸지 않고 사유를 갱신한다**). 달라진 것은 사유의 종류다. #4·#6은 선행 조건(머지된 런타임)이 milestone **밖**에 있다는 것이었고 **시간이 해소했다**. #7이 만난 것은 전달 경로가 **저장소 밖**이라는 것이며 **시간이 해소하지 않는다** — `budget.total`은 harness가 turn 프롬프트에서 등록하는 값이고 이 저장소의 어떤 코드도 그것을 만들 수 없다. M7 plan의 DN9는 그 경로를 "harness 계약"으로 단언했는데 **실측이 그 단언을 반증했다**. 그래서 #10의 Outcome은 "발화시킨다"가 아니라 **"발화시킬 수 있는 전달 경로가 존재하는지 먼저 확정한다"**로 적는다.
>
> **#7은 미달을 이관하면서도 `complete`다** — #6과 같은 이유다. 소유하는 것은 "발화시켰다"가 아니라 **"실측으로 확정했다"**이며, 관측이 미달을 확정하는 것도 milestone의 산출물이다. #7이 이번에 닫은 것은 B1이고, 그것은 계획했던 것보다 강한 형태로 닫혔다(임계 손잡이가 무력하다는 것까지 포함).
>
> **#8이 확정한 것과 #11이 생긴 이유 — 이번 사유는 네 번째 종류다: 집계 범위 (2026-08-26).** 앞선 이관들의 사유는 셋이었다. #4·#6은 선행 조건이 milestone **밖**(머지된 런타임)이었고 시간이 해소했다. #7은 전달 경로가 **저장소 밖**이었고 시간이 해소하지 않는다. **#8이 만난 것은 그 어느 쪽도 아니다** — 데이터는 처음부터 저장소 안에 있었고 선행 조건도 해소돼 있었다. 막고 있던 것은 **무엇을 세는가**였다. converged 5건 중 4건이 이미 M7 tip에 존재했으므로, #6·#7이 본 "표본 0"은 부재가 아니라 자기 PRD의 실행만 센 범위의 산물이다.
>
> 그래서 이번 갱신은 골대 이동이 아니다 — 목표(≤10분)도 데이터도 그대로이고 집계 범위만 지표 이름이 원래 말하던 것으로 되돌렸다. **감추면 그때 골대 이동이 되므로** 그 사실과 "이전 판정이 어떤 범위에서 옳았는지"를 Success Metrics 칸 안에 함께 남긴다(DN9). 차단 경로 행은 손대지 않았다(UI8).
>
> **#11은 미달의 이관이 아니라 질문의 승격이다.** #6·#7·#10의 이관은 "하려던 것을 못 했다"였지만, #8은 하려던 것을 했다 — 그 결과 **이전에는 물을 수 없던 질문**이 물을 수 있게 됐다. "승인 품질(false-approve 비율)"은 승인 표본이 0인 동안 성립하지 않는 질문이었고, 이제 5건이 있으므로 성립한다. 관측 작업이라 배선을 늘리지 않으므로 #7·#8과 같이 #5 앞에 둔다(UI6).
>
> **#8도 `complete`다** — 다만 앞의 둘과 이유가 다르다. #6·#7은 미달을 확정해서 complete였고, #8은 **묻던 것에 실제로 답해서** complete다. 답은 "튜닝했다"가 아니라 "튜닝할 손잡이가 아니었다"이며, 기본값을 하나도 바꾸지 않은 것이 결론 그 자체다.

## Open Questions

**M1이 답한 것 (기록 보존)**
- [x] L1/L2 각 층의 정확한 구성 → L1은 mechanical check 7종(필수 섹션·repo-root full 경로·action↔실존·per-task Validate·Source PRD·인용 실존·markdown 정합), L2는 refute-framed 4관점(architect/security/test/invariant). 승인은 **증거 부재로만** 도출(`refutationAttempted` 필수).
- [x] quorum 파라미터 → default `3of4` + 고유 역할 K=3, M≥2 강제. proof 바인딩은 임계값이 아니라 **관측치**(`responded`)에 — 임계값을 관측치 자리에 적으면 증거가 자기 증거를 과소 진술한다.
- [x] `review_proof` 위조 방지 강도 → all-or-nothing 부분 stamp 거부 + `reviewed_plan_hash` bind(리뷰 후 plan 편집 시 승인 무효, 복구는 재봉인이 아니라 재실행) + evidence 경로 불변식은 verdict와 무관하게 상시 적용.

**미해결**
- [x] 목표 10분 달성 실측 — **M8이 답했다 (2026-08-26)**: 통과 경로 5건 관측, 중앙값 6.4분, 5건 중 4건이 10분 이내(최대 13.0분). 5건 전부 hash 결속이 있고 단일통과 토글 흔적이 없다. **답이 나온 이유는 새 실행이 아니라 집계 범위 정정**이다 — 그 5건 중 4건은 M7 tip에 이미 존재했다. 이전 판정("이 PRD의 게이트 실행에서 표본 0")은 그 범위에서 여전히 참이며 Success Metrics 칸에 이력으로 보존했다(DN9)
- [ ] L3 자동 트리거 조건 임계값 — "L2 divergent" 판정 기준, risk-signal 파일 패턴. 근거 없는 임계를 날조하지 않는다. **#6의 실측은 이 질문에 답하지 않았다** — 통과 경로 표본이 0이라 과발동↔지연 균형을 볼 수 없다 (#2)
- [ ] self-consistency 샘플 수 — M1은 역할 다양성(4역할 × 1샘플)만 diversity 축으로 썼다. 동일 질문 N회 독립 샘플 majority의 비용 대비 값 미확인
- [ ] 지표 코퍼스의 내구성 — **O3으로 갱신**: worktree-only 소멸에 더해, 레코드 경로 slug가 PRD 경로 파생이라 **재실행이 이전 라운드를 덮어쓴다**. 4회 실행에 잔존 1건이라 수렴 과정 자체가 코퍼스가 되지 못한다. 단발 실측으로 충분한가가 아니라 **누적이 가능한가**가 질문이 됐다 (#9)
- [ ] **`budget.total`을 세우는 전달 경로가 존재하는가** — M7 실측: turn 프롬프트 본문의 `+200k`로는 `null`이었고 `remaining()`은 `Infinity`로 퇴화한다. 따라서 threshold 쪽 어떤 값으로도(`MCCP_PLAN_REVIEW_BUDGET` 포함) budget 게이트를 발화시킬 수 없다(B1). 이것이 harness 사양인지 결함인지, 다른 전달 형태가 있는지는 **미확인**이며 관측 표본은 1이다. 저장소 코드로 닿지 않는 축이라 근거 없이 절차를 날조하지 않는다 (#10)
- [ ] **`remaining()`의 무예산 반환값이 `Infinity`라는 사실의 파급** — `plan-review.js:161`은 좌항 `budget.total` 단락평가로 안전하지만, `remaining()`만 읽고 분기하는 소비처가 생기면 무예산 turn을 "무한 예산"으로 읽는다. 현재 그런 소비처가 있는지 전수 확인하지 않았다
- [ ] 패널 승인의 실제 품질 — **M8로 갱신: 앞당겨졌던 질문이 답해졌으므로 원래 질문으로 돌아온다.** "승인이 발급되는가"는 예이고(converged 5건, 전부 hash 결속·토글 미사용), 이제 false-approve 비율을 물을 표본이 있다. 각 승인 plan을 그 시점 코퍼스와 대조해 패널이 놓친 실물 결함이 있었는지 보는 사후 감사가 필요하다 (#11)
- [ ] **quorum 손잡이는 무력한데 승인 빈도는 왜 낮은가** — M8 실측: M·K가 binding이었던 차단 레코드 0건, K를 3→1로 실제로 낮춘 자연 실험에서도 승인 빈도 무변화. 즉 실제 승인 규칙은 severity 게이트 단독이다. 그런데 실패 리뷰어 64건 중 52건이 실물 CRITICAL/HIGH를 동반했으므로 이것이 **과잉 차단인지 정직한 탐지인지는 severity 판정의 정확도에 달려 있고, 그 정확도는 아직 측정된 바 없다**. #11의 사후 감사가 반대 방향(false-approve)을 보므로 이 질문(false-block)은 그 대칭축으로 남는다. 근거 없이 임계를 내리지 않는다(UI4 · UI11)
- [ ] **F6이 단독으로 막은 1건을 어떻게 처리할 것인가** — M8 실측: `archive/plan-review-followup-R12.md`가 그 사례다(3/3 응답·3 roles로 M·K 만족, 두 실패 리뷰어의 finding이 전부 MEDIUM). CLAUDE.md §3.14의 해제 조건은 정확히 이 합성 동작을 겨냥하는데, 실측은 F6이 **무해하지도(1건 단독 차단) 지배적이지도(27건 중 26건은 F6 없이도 차단) 않다**고 말한다. 해제는 운영자 판정이고 이 PRD 소관이 아니다 — M8은 근거만 제공한다

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 게이트 배선이 단위 test 사거리 밖(markdown seam)이라 결함이 ship 후에야 드러남 | **High (실증)** | High | M1 실측 28건이 전부 이 층 — #5 오라클 추출이 정면 대응, #4가 라이브 완주를 acceptance로 승격해 "단위 test 통과 = 경로 작동"의 오등식을 차단 |
| 결함 수정이 새 결함을 만듦 (배선을 고칠 때마다 배선이 늘어남) | **High (실증)** | Medium | santa-loop 20건 중 6건이 이 형태 — #5 이전에는 배선 추가를 최소화하고(#1.5를 뒤로), 수정 시 회귀 test는 **수정 전 실패를 실측**한 것만 인정 |
| 지표 코퍼스 부재 → "측정했다"는 착각 위에 튜닝 (confidently-wrong) | **High (실증)** | High | 산출 0인 지표는 `forward-only`로 표기 · #2 임계 튜닝은 #4 실측 전 착수 금지 · 선례(MSW B3)를 명시적으로 참조 |
| same-model L2가 correlated → self-approval (작성자=리뷰어 blind spot 재도입) | Medium (**미실증** — 승인 발급 표본 0) | High | L1 deterministic backbone을 gatekeeper로 앞세움 + `review_proof` fail-closed(역할 다양성·독립 verification 강제) + L3 hybrid 안전판 ([verification-layer §7](../_meta/verification-layer-design.md)) |
| panel run에서 intent adjudication이 skip돼 커버리지 후퇴가 상시화 | Medium | Medium | skip은 조용하지 않고 proof와 함께 stamp됨(감사 가능) + #1.5가 소유 · 후퇴가 길어지면 순서 재조정 |
| L3 자동 트리거 과발동 → 10-15분 지연으로 회귀 | Medium | Medium | #6 실측 확보 후에만 임계 결정 + risk-signal(mechanical, L2 독립)로 트리거 상관 완화 |
| `converged` 재정의가 dedupe/ship-gate 불변식 손상 | Low | High | `resolveEffectiveVerdict` 단일 helper로 소비처 계승 + 회귀 test ([converged §4](../_meta/converged-redefinition-design.md)) |
| 기존 git-tracked ship corpus의 receipt_hash 변경(재봉인 사고) | Low | High | present-only 필드 + skeleton 미materialize(§3.12 no-rehash) + hash 안정성 test |

---
*Status: #1·#4·#6·#7·#8 배송 완료 · 다음은 #11(승인 품질 감사) → #5(오라클 추출) → #9 · 나머지는 요구사항 단계. 구현 계획은 /mccp:plan.*
*Co-created with user on 2026-08-06. Revised 2026-08-09 (M1 ship 후 실측 반영 — 지표 정직화 + milestone 4건 추가). Revised 2026-08-14 (M6 실측 반영 — Outcome을 관측 결과로 재정의 + #7·#8·#9 신설). Revised 2026-08-26 (M8 실측 반영 — 통과 경로 지표를 집계 범위 정정으로 산출 전환 + quorum 손잡이 무력성 확정 + #11 신설).*
