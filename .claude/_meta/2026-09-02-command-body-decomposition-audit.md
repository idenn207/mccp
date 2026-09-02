# 명령 본문 분해 — 컨텍스트 엔지니어링 관점 다관점 감사

**Status**: active
**Date**: 2026-09-02
**Topic**: 명령 본문 분해 — 컨텍스트 엔지니어링 관점 다관점 감사

이 문서는 우산 PRD [harness-wiring-integrity](../prds/harness-wiring-integrity.prd.md)의
자식 **C8 `command-body-diet`** 를 위한 근거 corpus다. 선행 조사
[2026-08-31-harness-instability-and-command-bloat.md](2026-08-31-harness-instability-and-command-bloat.md)가
"방향 5 — 명령 본문 다이어트"를 **유일하게 진짜로 열려 있는 축**으로 판정했고, 이 문서는 그 축만
따로 떼어 컨텍스트 엔지니어링 관점에서 재조사한 것이다.

**착수 게이트는 이 문서가 열지 않는다.** 우산 PRD의 결정 3번이 C8의 착수를 C5 머지 + 선행조건
2건 충족 이후로 못박았고, 이 조사는 그 게이트를 앞당기지 않는다. 여기서 하는 일은 게이트가
열렸을 때 즉시 쓸 수 있는 측정과 제약 목록을 남기는 것뿐이다.

## Premises

| # | 참조 | 시점 | 무엇을 전제하는가 |
|---|---|---|---|
| 1 | plugins/mccp/commands/plan.md | d8aa0d5 | 3,083줄 / 187,041바이트. 코드펜스가 1,835줄(59.5%)이고 그중 `#` 주석이 633줄이라 실제 셸은 1,202줄이다. `node .../scripts/` 호출 지점은 59곳 |
| 2 | plugins/mccp/commands/plan.md:670 | d8aa0d5 | `## Phase 5 — PLAN-CODEX GATE` 한 절이 670-3083 = 2,414줄로 파일의 78.3%다. 그 안의 `### 5.2 — REVIEW GATE`(:939-2208)만 1,270줄 |
| 3 | plugins/mccp/commands/plan.md:1441 | d8aa0d5 | `5.2f`는 hybrid 전용, `5.2z`(:1913) · `5.3`(:2209) · `5.6`(:2643)은 `mode=codex ONLY`다. 이 저장소 설정(`MCCP_PLAN_REVIEW=multi-agent`)에서 합 662줄(21.5%)이 도달 불가다 |
| 4 | plugins/mccp/commands/work.md:121 | d8aa0d5 | `Phase 2.T TRIVIAL`(16줄)과 `Phase 2.F FULL`(:137, 674줄)이 상호배타다. 어느 실행이든 최소 79%가 사문이다 |
| 5 | plugins/mccp/commands/prp-implement.md:445 | d8aa0d5 | opt-in 2블록(`2.5.5b` 275줄 + `3.5 ULTRACODE`(:920) 230줄 = 505줄, 26.4%)이 상시 주입된다 |
| 6 | plugins/mccp/commands/plan.md:529-586 | d8aa0d5 | `## Example Usage` 58줄이 이 저장소와 무관한 가상 기능 계획서 전문이며, 바로 위 `:451-528`의 실제 산출 스키마와 경쟁하는 역방향 few-shot이다 |
| 7 | plugins/mccp/scripts/lib/tests/round-cap-command-body.test.js:72-127 | 9947efd | seal 배선을 정적 단언한다 — `sealing.length === 1` · 자기 gate id 사용 · `--decision "$ROUND_SLUG"` 형태 · `seal < invoke` · plan.md는 `seal < L2 launch`. 본문에서 seal을 빼면 5개 단언이 red다 |
| 8 | plugins/mccp/scripts/lib/review-rounds/seal.js:21-31 | 9947efd | 저자가 분해형 설계(정체성을 CLI 인자로 전달)를 명시 검토하고 기각했다. 기각 사유가 "산문이 지시해야만 작동하는 배선"이며, 그래서 정체성을 봉인이 나르고 그 봉인은 "명령 본문의 고정된 위치"에 있어야 한다 |
| 9 | plugins/mccp/scripts/lib/codex-invoke.js:307-313 | 9947efd | 봉인이 없으면 예외가 아니라 `inert{allowed:true}`를 반환한다. 라운드 캡 강제의 실패 방향이 fail-OPEN이다 |
| 10 | plugins/mccp/scripts/lib/env-contract/registry.js | 9947efd | `commands/*.md`의 줄번호를 evidence로 **정확히 12건** pin한다(plan.md 1 · plan-prd.md 1 · pr.md 6 · prp-implement.md 2 · work.md 2). `env-contract/evidence-name.js:45`가 `EVIDENCE_WINDOW = 2`이고 이 lint는 CI(`env-contract-drift.yml`)가 돌린다 |
| 11 | plugins/mccp/scripts/lib/command-body/debt.js:54 | 9947efd | seam 부채 18건이 `(file, rule, textDigest)`로 결속되고 `SEAM_DEBT_CEILING = 18`이 배열 길이와 짝 단언이다(`:50` 주석). `command-body/lint.js:9-10`은 스스로 "어떤 CI workflow 에도 어떤 hook 에도 등재되지 않는다"고 적는다 |
| 12 | plugins/mccp/commands/pr.md:978 | 9947efd | `FINALIZE_RECEIPT_HASH`가 fence 905-979에서 대입되고 `:1103`의 소비처는 fence 1044-1124다. 셸 상태는 fence를 넘지 못하므로 `${VAR:+--expected-receipt-hash ...}`는 항상 빈 확장이다 |
| 13 | plugins/mccp/scripts/workflows/plan-review.js:183-193 | 9947efd | L2 패널 `agent()` 옵션이 `agentType` · `effort:'low'` · `label` · `phase` · `schema`뿐이고 파일 전체에 `model` 문자열이 0건이다. `plugins/mccp/agents/review-architect.md:5`의 `model: opus` 선언은 이 경로에 도달하지 않는다 |
| 14 | plugins/mccp/scripts/receipt/aliases.js | 9947efd | ALIAS_MATRIX 등재는 8개(`plan-prd` · `plan` · `prp-implement` · `pr` · `prp-pr` · `code-review` · `review-pr` · `meta-research`)뿐이다. `receipt/validate-cmd.js:136`이 미등재 명령을 `out-of-scope`로 반환하며 `result.ok`는 초기값 true다 |
| 15 | .claude/state/review-rounds/mccp-plan-codex__release-channel-separation-m1.json | 9947efd | `review-rounds/cli.js status`가 `rounds_so_far: 3` · `seal.found: false` · `reason: "absent"`를 보고한다. `MCCP_GATE_ROUND_CAP=1` 설정 하의 실측이다 |
| 16 | .claude/receipts/ | 9947efd | receipt 78건 중 `meta.round_cap`을 보유한 것은 3건뿐이다. 나머지 75건은 봉인 부재 = 캡 강제 미작동 상태에서 작성됐다 |
| 17 | .github/workflows/env-contract-drift.yml | 9947efd | workflow 3개가 `node --test`를 4곳에서 호출한다. `plugins/mccp` 아래 `*.test.js`는 360개(4.41MB)이고 저장소에 `package.json`이 없다 |
| 18 | plugins/mccp/scripts/hooks/receipt-skill.js | 9947efd | 게이트 밖 중복 트리가 `.claude/commands` 7 · `.claude/skills` 47 · `.claude/agents` 49개 상주한다. 이 hook과 `hooks/hooks.json`의 UserPromptExpansion matcher가 `^mccp:` 접두만 보므로 bare 이름 호출은 receipt 게이트 사거리 밖이다 |

## Evidence

### 조사 방법

`main` d8aa0d5에서 read-only 다관점 워크플로를 실행했다 — 20 에이전트 / 4.03M 토큰 / 46분,
에러 0. 구성은 4 phase다.

1. **Ground 5** — 명령 해부 · 게이트 기계 경계 · 하네스 로딩 계약 · 확장면 인벤토리 · 상주 컨텍스트
2. **Diagnose 7** — 컨텍스트 엔지니어링 · 지시 준수 · 분해 아키텍처 · **적대적 반증** · 운영 불변식 ·
   문서-코드 드리프트 · **Codex 외부 채널**(`codex:codex-rescue`)
3. **Verify 7** — 각 렌즈의 findings를 독립 검증자가 반증 시도(파이프라인, 배리어 없음)
4. **Critic 1** — 7 렌즈 전부가 놓친 축 · 과잉 진단 색출 · 상반 처방 판정 · 우선순위

적대적 렌즈에는 "리팩토링이 성능을 올린다"는 전제 자체를 무너뜨리는 임무를 명시 부여했다.
산출 83 findings의 판정은 **CONFIRMED 48 / PLAUSIBLE 34 / REFUTED 1**이고, 위 `## Premises`의
7번 이하는 전부 이 세션에서 **재검증한 것만** 실었다.

### A. 문제는 크기가 아니라 구성비다

5개 거대 명령 8,381줄의 상호배타 분류(E는 A~D 위에 겹치는 오버레이):

| 파일 | 총줄 | A 실행지시 | B 셸/노드 | C 리뷰 회고서사 | D 산출물 템플릿 | E 조건부 도달 |
|---|---:|---:|---:|---:|---:|---:|
| plan.md | 3,084 | 929 (30.1%) | 1,431 (46.4%) | 463 (15.0%) | 261 (8.5%) | 1,132 (36.7%) |
| prp-implement.md | 1,913 | 800 (41.8%) | 725 (37.9%) | 192 (10.0%) | 196 (10.2%) | 971 (50.8%) |
| pr.md | 1,552 | 448 (28.9%) | 636 (41.0%) | 282 (18.2%) | 186 (12.0%) | 519 (33.4%) |
| work.md | 853 | 227 (26.6%) | 424 (49.7%) | 143 (16.8%) | 59 (6.9%) | 349 (40.9%) |
| santa-loop.md | 979 | 414 (42.3%) | 453 (46.3%) | 55 (5.6%) | 57 (5.8%) | 231 (23.6%) |
| 합계 | 8,381 | **2,818 (33.6%)** | 3,669 (43.8%) | 1,135 (13.5%) | 759 (9.1%) | 3,202 (38.2%) |

**매 게이트 실행이 지불하는 토큰의 2/3가 실행지시가 아니다.** 그리고 감축의 표적은 총량이 아니라
C와 E다 — A를 줄이는 것은 게이트를 지우는 것이고, B는 목적지가 다르다(아래 C절).

C(회고 서사)의 문제는 크기가 아니라 **아무 도구도 검증하지 않는다**는 것이다. 이미 자기 정정이
누적됐다 — `plan.md:2884`가 "The shell fallback that used to sit here ... could never fire.
A safety net that cannot catch anything is worse than none"라 적고, `pr.md:1061`이 `v1.23.5`의
진술을 `v1.25.2 C6`로 정정한다. 서사는 코드와 독립적으로 낡고, 낡았다는 사실은 다음 리뷰
라운드에서만 발견된다.

### B. 적대적 렌즈가 살아남긴 제약 5건 — 순진한 분해가 깨는 것

이 절이 이 조사의 실질이다. 아래는 "쪼개면 좋아진다"를 공격하라고 붙인 렌즈가 낸 것 중
검증을 통과한 것이며, C8의 설계 제약이 된다.

1. **`seal`은 본문에서 빼면 안 된다** (전제 7 · 8 · 9). 세 렌즈(decomposition · codex · reliability)가
   독립적으로 "seal을 hook으로 승격하라"고 처방했고 **셋 다 전제 7의 정적 test를 파손 목록에서
   빠뜨렸다** — 같은 모델 계열의 blind spot이 교차 검증으로도 안 걸린 실례다. 실패 방향이
   fail-OPEN(전제 9)이라 분해가 §3.16의 유일한 기계 장치를 무증상으로 끈다.
   대안: **`plan.md`의 seal 블록을 Phase 5 안이 아니라 파일 선두로 이동한다.** test의 단언이
   `seal < invoke` · `seal < L2 launch` 순서이므로 앞으로 옮기면 두 단언이 모두 보존되고,
   절삭 · 요약 양쪽에 강해진다. 삭제가 아니라 이동이다.
2. **CI가 명령 본문의 줄번호 12개를 ±2 창으로 고정한다** (전제 10). 정책이 "창을 넓히지 말라"로
   못 박혀 완화 경로도 닫혀 있다. 분해는 12건 전부를 재-pin하게 만들고 그 재-pin은 커밋마다
   반복된다.
3. **seam 부채 18건이 textDigest로 결속돼 있다** (전제 11). `debt.js`의 주석이 대량 재번호를
   "신규 위반이 조용히 흡수되는 지점"으로 스스로 지목한다. 분해는 정의상 대량 재번호이므로
   18건이 화석화하는데, **그것을 잡을 lint가 CI에 없다.**
4. **명령 본문 텍스트에 결속된 test가 8개 있고 일부는 heading regex로 절을 찾는다.**
   `plan-review-command-body.test.js:332`가 `/^#### 5\.2f — /` 형태다. 절 제목 변경도 파손이다.
5. **skill로 옮기면 검증 공백이 그대로 이동한다.** skill 본문도 마크다운이라 test · lint · syntax
   check 대상이 아니다. 그리고 이 저장소는 "본문이 skill 이름을 추정하면 조용히 전면 실패한다"를
   이미 실측했다(CLAUDE.md §3.17의 impeccable 사건) — 분해는 그 실패 클래스를 곱한다.

### C. 목적지 3분기 규칙 — 상반 처방의 해소

"bash를 접어도 소용없다"(적대적 · codex)와 "접으면 절감된다"(decomposition · drift)는 상충이
아니라 **목적지 구분 누락**이었다. 판정 근거는 주입 성질의 차이다.

| 목적지 | 컨텍스트 주입 | 대상 | 비고 |
|---|---|---|---|
| `scripts/lib/*.js` (node CLI) | **0** — 본문엔 호출 한 줄 | 결정적 셸, env 판정, 아티팩트 조립 | 적대적 렌즈의 반대 논거가 적용되지 않는 유일한 목적지 |
| skill | **호출 시 전량 주입 + 턴 상주** | 판단이 필요한 산문 | "안 부르면 0"이 성립하는 **조건부 절에만**. 선행조건: 진입점 `allowed-tools`에 `Read` 필요 |
| `docs/` | **0** — Read로만 | 역사 · 회고 · 라운드 판정 서사(C 1,135줄) | 이전 목적지가 `docs/gate-design.md`로 이미 실재 |

이 규칙이 선행 조사의 "감축 단위는 블록에서 CLI 치환만"이라는 안전 조건과 정합한다 — 그 조사가
금지한 것은 **산문을 문서로 이전하는 것**이었고, 이 표는 그 금지를 목적지 축으로 정밀화한다.
C(회고 서사)는 산문이지만 **의무를 나르지 않는 산문**이라 `docs/` 이전이 가능하고, 판단을
나르는 산문(A)은 이전 대상이 아니다. 그 구분을 기계가 판정할 수단은 아직 없다 — 아래 Open
Questions 1번.

### D. 리팩토링과 무관하게 지금 깨져 있는 것

감사의 부산물이며 C8을 기다릴 이유가 없는 항목들이다.

| # | 결함 | 전제 | 성격 |
|---|---|---|---|
| D1 | `--expected-receipt-hash` receipt-swap 방어가 항상 소실 | 12 | `${VAR:+--flag}` 형태라 플래그째 조용히 사라지고 validate는 exit 0 이므로 `SHIP_OK=1`이 된다. "산문이었다"가 아니라 **작동하는 것처럼 보이는 코드**다 |
| D2 | design 축(§3.9 critique · §3.10 routing · a11y)이 receipt에 흔적 0/78 | — | 원인 동일(cross-fence). §3.9가 선언한 "divergent면 gh 호출 전 BLOCK"이 구조적으로 도달 불가. **미재검증** — 감사 렌즈의 전수 집계에 의존 |
| D3 | 라운드 캡이 78건 중 3건에서만 관측되고, 캡 1인데 원장에 3라운드 | 15, 16 | §3.16이 "이제 강제된다"고 선언한 직후의 마일스톤이 3배 초과. 봉인 TTL 6시간이라 긴 세션에서 조용히 만료 |
| D4 | 적대적 리뷰 패널이 haiku × `effort:'low'`로 돈다 | 13 | agent frontmatter의 `model: opus`가 무시된다. 게이트를 양방향으로 오염(거짓 차단 · 거짓 통과) |
| D5 | `/mccp:work` · `/mccp:prp-commit` · `/mccp:santa-loop` · `/mccp:resume`가 receipt 게이트 사거리 밖 | 14 | 문서상 단일 entry(`/mccp:work`)와 실제 커밋을 만드는 명령이 preflight 미적용 |
| D6 | 게이트 없는 중복 트리 상주 | 18 | `/plan` 오타 하나가 receipt 게이트 전면 우회. `.claude/skills/frontend-design-direction/SKILL.md`에는 §3.9 판정 앵커 `## Output Constraints`가 없다 |
| D7 | CI가 360 test 중 4개만 돌리고 `package.json`이 없다 | 17 | B절 2 · 3의 안전망이 실재하지 않는다. `ci-full-suite`(C3)가 소유 |
| D8 | 컨텍스트 비용 계측기가 죽어 있다 | — | `msw-metrics/a3-instruction-cost.js`가 `tiktoken unavailable`. 인터프리터는 있음(Python 3.14.7). **이 문서의 모든 토큰 수치가 손 환산인 이유** |

D1 · D4는 C8을 기다릴 것 없이 즉시 처리 가능한 소품이고, D7은 이미 C3가 소유한다.
D2 · D5 · D6은 소유 축이 미정이다.

### E. 이 조사가 주장하지 않는 것

정직하려면 적어야 한다.

- **하네스 로딩 계약은 확정하지 못했다.** 컨텍스트 엔지니어링 · Codex 렌즈의 CRITICAL 5건이
  "compaction이 skill 본문을 5,000 token에서 절삭한다"는 명제 위에 서 있었는데, 그 렌즈가 인용한
  `docs/context-window.md` · `docs/skills.md`는 **존재하지 않는 파일**이다. 확증도 반증도 불가라
  전부 등급을 내렸고 이 문서에 싣지 않았다. skill 지연 로드의 실제 절감액은 **미측정**이다.
- **모든 토큰 수치는 3.6자/token 손 환산이다**(D8). 절감 목표를 숫자로 약속하기 전에 A3를
  살려야 한다.
- **"81% 감축" 류의 총계는 폐기했다.** 그 처방이 신설하는 skill · CLI의 순증을 계상하지 않은
  수치였다. 이동인지 절감인지 판정 불가한 값을 목표로 쓰지 않는다.
- **시간축 오독 3건을 제거했다.** 강제 기능 도입 *이전* receipt의 필드 부재를 위반 증거로
  승격시킨 주장들이다. present-only 스키마에서 "키 부재 = 모름"(CLAUDE.md §3.12).
  유일한 REFUTED가 그중 하나다.

## Prior Art

**미조사.** 이 조사는 저장소 내부 근거와 Codex 외부 채널만으로 수행했고, LLM 컨텍스트 엔지니어링
(progressive disclosure · lost-in-the-middle · 지시 준수 저하)에 대한 **외부 문헌 조사를 하지
않았다.**

하네스 계약 축에서 문헌 조사를 시도한 흔적은 있으나 **실패로 판정한다** — 담당 렌즈가 공식 문서를
인용했다고 제시한 경로 3건이 실재하지 않는 파일이었다(E절). 조사하지 않은 것을 조사한 것처럼
비워 두지 않기 위해 여기 명시한다.

C8 착수 시 필요한 외부 확인 2건: (a) slash command · skill · subagent · hook의 로딩 시점과
토큰 비용에 대한 **공식 계약**, (b) compaction이 각 표면을 어떻게 처리하는가. 둘 다 이 조사의
결론을 바꾸지는 않지만(C절 3분기 규칙은 "주입 0 대 주입 있음"만 쓰므로 절삭 규칙과 무관하다)
절감액 추정의 정밀도를 정한다.

## Precedent

**1. [2026-08-31-harness-instability-and-command-bloat.md](2026-08-31-harness-instability-and-command-bloat.md)
— 상위 조사. 판정이 어긋나지 않고 좁혀진다.**

그 조사가 "방향 5 명령 본문 다이어트 = 유일하게 진짜로 열려 있는 축"으로 판정했고 안전 조건
둘을 걸었다: (a) `instruction-contract/lint.js`의 before-state 파라미터화, (b) 본문별 relocation
ledger. 이 조사는 그 조건을 **약화하지 않고 정밀화한다** — C절의 3분기 규칙이 "산문 이전 금지"를
목적지 축으로 나누고, B절이 그 조사에 없던 제약 5건(정적 test · CI 앵커 12건 · seam 부채 18건 ·
heading regex test · skill 검증 공백)을 추가한다.

**전제가 무효화된 것은 없다.** 그 조사의 전제 1(plan.md 3,044줄 / bash 주석 587줄 / codex 전용
816줄)은 d1db647 시점이고 이번은 d8aa0d5 시점이라 수치가 다르나 **같은 방향으로 커졌다**
(3,044 → 3,083줄). 전제 9(test 346개 중 CI 3개)도 이번 실측(360개 중 4개)과 정합한다.
따라서 그 문서의 `**Status**` 갱신을 제안할 근거는 없다.

**2. 우산 PRD [harness-wiring-integrity](../prds/harness-wiring-integrity.prd.md) C8 — 이 조사의
목적지.**

C8이 이미 색인에 있고 착수 게이트(C5 머지 + 선행조건 2건)가 결정 3번으로 못박혀 있다.
이 조사는 그 게이트를 **열지 않는다**. 우산이 금지한 것은 "plan 생성"이고 이 문서는 조사이며,
자식 PRD는 게이트 이후 착수를 명시한 채로 작성한다.

**3. `instruction-contract` M4 — 감축이 되돌려진 선례.**

CLAUDE.md를 686줄로 줄인 뒤 20일 만에 1,147줄로 복귀했다. 상위 조사의 전제 16이 같은 사건을
"감축분 68,850B의 42.3%가 재성장, 성장 래칫이 없다"로 기록한다. **C8이 상한 래칫 없이 감축만
하면 같은 궤적을 반복한다.** 래칫 선례는 이 저장소에 이미 있다 —
`EVIDENCE_DEBT_CEILING`(상수 + 짝 test)과 `SEAM_DEBT_CEILING`(전제 11)이 같은 형태다.

**4. 검증된 분해 기제가 이미 사내에 있다.** `plan-review/cli.js l3`의 무권한 서브커맨드
("이중 writer는 부재로 닫는다") · `intent-arbiter`의 `tools:[Write]` 능력 제거형 격리 ·
detached runner의 nonce 봉인. C8은 부품을 새로 발명할 필요가 없다.

## Verdict

**한 문장**: 명령 본문의 병은 길이가 아니라 **구성비와 검증 부재**다 — 8,381줄 중 실행지시는
33.6%뿐이고, 나머지의 대부분(C 13.5% + E 38.2%)은 어떤 도구도 읽지 않는 서사이거나 이 저장소
설정에서 영구히 실행되지 않는 경로다. 그런데 **그 본문을 순진하게 쪼개면 라운드 캡 강제가
fail-OPEN으로 꺼지고 CI 앵커 12건과 seam 부채 18건과 heading-regex test가 동시에 깨진다.**
즉 C8은 "줄이기"가 아니라 **"무엇을 어느 목적지로 옮기면 안 되는지 아는 상태에서 옮기기"** 다.

### C8이 채택해야 할 설계 결정

| # | 결정 | 근거 |
|---|---|---|
| 1 | 목적지는 셋이고 판정 기준은 **주입 성질**이다 — 결정적 셸은 node CLI, 회고 서사는 `docs/`, 판단 산문은 이전 대상이 아니다 | C절 |
| 2 | `seal`은 본문에 남긴다. `plan.md`의 seal 블록은 **삭제가 아니라 파일 선두로 이동**한다 | B절 1 |
| 3 | 착수 전 선행조건에 **`command-body/lint.js`의 CI 등재**를 추가한다 — 분해의 가장 넓은 안전망이 지금 아무도 안 돌린다 | B절 3 |
| 4 | 감축과 함께 **상한 래칫**을 건다(`*_CEILING` 상수 + 짝 test 선례) | Precedent 3 |
| 5 | 절감 목표를 숫자로 약속하기 전에 **A3를 살린다**(D8). 그 전의 모든 수치는 근사로 표기한다 | E절 |
| 6 | skill 목적지를 쓰려면 진입점 `allowed-tools`에 `Read`를 먼저 넣어야 한다 — `work.md:4` · `resume.md:4`에 없다 | C절 표 |

### 우선순위 (절감 대비 파손위험)

착수 게이트 이후 순서다. 0번과 1번은 게이트와 무관하게 지금 가능하다.

0. **A3 계측 복구**(D8) — 5분, 위험 0. 이하 모든 숫자의 선행 조건.
1. **중복 트리 정리**(D6) — 위험 사실상 0, receipt 게이트 우회를 함께 닫는다.
2. `plan.md:529-586 Example Usage` 삭제 — 참조 test · lint · 앵커 0건.
3. `mode=codex` 전용 절을 모드 분기 뒤로(전제 3, 662줄) — `plan-command-marker-states.test.js`의
   `'### 5.6 — Await the runner'` 슬라이스와 **같은 커밋**이어야 한다.
4. 코드펜스 회고 주석을 `docs/`로(전제 1, plan.md 633줄) — seam 부채 digest 재계산 동반.
5. 결정적 tail 블록을 node CLI로 — `${VAR:+--flag}` 소실 패턴(D1)을 CLI 인자로 옮기지 말고
   **아티팩트 직접 읽기 + fail-closed**로 전환할 것.

## Open Questions

1. **"의무를 나르는 산문"과 "회고 서사"를 기계가 가를 수 있는가.** C절의 3분기 규칙은 사람이
   판정하는 것을 전제한다. 판정을 틀리면 `docs/`로 나간 문장이 실은 게이트 의무였다는 사실이
   다음 게이트 실행에서야 드러난다. 상위 조사가 요구한 "본문별 relocation ledger"가 이 판정을
   기록하는 자리인지, 아니면 별도 기제가 필요한지 미결.
2. **D2(design 축 receipt 흔적 0/78)의 소유 축이 미정이다.** C1 `review-record-linkage`가
   "기록되지 않는 게이트"를 다루므로 그쪽 후보이나, 원인이 cross-fence 셸 상태 소실이라
   C8의 표적과 같은 실패 클래스다. 중복 소유 또는 누락 위험.
3. **D5(`/mccp:work` 등 4개 명령의 ALIAS_MATRIX 미등재)를 C8이 다루는가.** 본문 다이어트와
   무관하나, 얇아진 본문이 게이트 밖에 있으면 감축이 우회를 쉽게 만든다.
4. **skill 목적지의 실제 절감액이 미측정이다**(E절). 절감이 0에 가깝다면 3분기 규칙의 두 번째
   행은 실질적으로 폐기되고 목적지는 CLI와 docs 둘로 줄어든다. A3 복구 후 재판정 대상.
5. **D4(패널 haiku)를 고치면 §3.14 임시 규칙의 해제 조건이 바뀌는가.** §3.14는 `quorum.js`의
   bare `verdict='fail'` 합성을 해제 조건으로 걸었는데, 거짓 차단의 원인 일부가 리뷰어 모델
   등급이라면 두 축이 얽힌다.
