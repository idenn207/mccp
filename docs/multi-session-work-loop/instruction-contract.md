# 최소 지시 계약 — CLAUDE.md 절별 분류 (M4)

> PRD Open Question **"최소 지시 계약"**에 대한 직접 응답이다. "무엇이 상주해야 하는가"를 감축 *전에* 확정해, 감축이 사후 합리화가 되는 경로를 막는다.
>
> 본 문서의 §3 표는 **relocation ledger의 SoT**다. [instruction-contract/ledger.js](../../plugins/mccp/scripts/lib/instruction-contract/ledger.js)가 이 표를 파싱하고 [lint.js](../../plugins/mccp/scripts/lib/instruction-contract/lint.js)가 4중 검사를 돌린다. 코드에 목록을 중복 정의하지 않는다 — 분류를 바꾸려면 여기를 고쳐야 한다.

## 1. 분류 기준 (먼저 명문화 — 사후 조정 방지)

**RESIDENT (상주 필수)** 는 3중 AND다. 셋을 모두 만족할 때만 상주한다.

- **(a) 되돌리기 어려움** — 위반이 즉시·되돌리기 어려운 손해를 낸다.
- **(b) 강제기 부재** — 이를 잡는 코드 강제기(hook·게이트·lint)가 없다.
- **(c) 선행 지식** — 요청 시 로드로는 이미 늦다. 행동 *직전에* 알고 있어야 한다.

**ON-DEMAND** 는 (a)(b)(c) 중 하나라도 불성립일 때다. 목적지 파일과 anchor를 지정한다.

**RETIRE** 는 지시가 아닌 것 — 이력·중복이다.

### 판정 시 주의 두 가지

**분류 ≠ 이전.** 어떤 절을 ON-DEMAND로 분류했다는 것은 "상주할 자격이 없다"는 판정이지 "이번 주기에 옮긴다"가 아니다. M4가 실제로 옮기는 것은 §1.4와 §4 운영 토글 **둘뿐**이며(운영자 결정 2026-08-09), §3의 행동 규칙은 한 줄도 건드리지 않는다. 나머지 ON-DEMAND 행은 목적지 없이 **분류만** 기록되고, 준수 회귀를 측정할 수단이 생긴 뒤(M8 이후) 재검토한다. 이 구분을 흐리면 "분류했으니 옮겨도 된다"가 되어, 측정 없는 감축을 금지한 A3 논리를 스스로 어긴다.

**(a)의 해석 — "되돌리기 어려움"은 사건당 비용이지 빈도가 아니다.** 다만 *산출물이 이미 사용자에게 전달된 뒤에야 위반이 드러나는* 규칙은 전달 자체가 비가역 단계이므로 (a)를 만족한다(§0이 이 경우다).

## 2. 이번 주기 요약

| 항목 | 값 |
|---|---|
| 분류 대상 절 | 26 (`##` 7 · `###` 19) |
| RESIDENT | 16 |
| ON-DEMAND (이번 주기 이전) | 2 |
| ON-DEMAND (분류만 · 이전 이연) | 8 |
| RETIRE | 0 |
| 이전 대상 합계 | 83,077B (167,832B의 49.5%) |

> **base 이동 반영 (PR #118 머지 후 rebase)**: 위 수치는 `origin/main`(`280b9ef`, CLAUDE.md 167,832B) 기준이다. 착수 시점 base(`7fe48d9`, 159,013B) 기준으로는 81,815B / 51.4%였다. 차이는 M4가 만든 것이 아니라 그 사이 main이 CLAUDE.md에 더한 8,819B다 — §3.13(신설) · §3.7 하위절(병렬 브랜치 version 충돌) · §4 토글 2개. 앞의 둘은 상주로 남고(§3.13은 아래 표에 S3.13으로 신규 분류), 토글 2개는 이번 주기 이전 대상인 S4.2를 따라 `docs/ENVIRONMENT.md` §11로 함께 옮겼다. 분류 대상 절이 24 → 25로 는 것도 §3.13 한 건 때문이다.

**RETIRE가 0인 이유**를 명시한다. §1.4와 §4 토글은 성격상 "이력"과 "중복"이라 RETIRE 후보였지만, 둘 다 **목적지가 있다**(`docs/milestone-ledger.md` · `docs/ENVIRONMENT.md`). 목적지 없이 사라지는 절은 이번 주기에 하나도 없다 — 그것이 G2("삭제가 아니라 이전")의 내용이고, lint C4가 기계로 강제한다.

## 3. Relocation Ledger (기계 판독 대상 — 표 형식 고정)

- `Disposition` ∈ `resident` · `on-demand` · `retire`
- `Dest File` / `Dest Anchor` / `Resident Pointer` 는 미지정 시 `-`
- `Heading` 은 CLAUDE.md의 헤딩 텍스트와 **정확히 일치**해야 한다(lint가 집합 대조에 사용)
- 목적지가 지정된 행만 C1·C2·C3 검사를 받는다. 목적지 없는 행이 CLAUDE.md에서 사라지면 C4가 실패한다

| ID | Heading | Disposition | Dest File | Dest Anchor | Resident Pointer | 근거 |
|---|---|---|---|---|---|---|
| S0 | 0. 응답 언어 (Response Language) | resident | - | - | - | (a) 잘못된 언어의 응답은 전달된 뒤에야 드러나고 전달은 비가역 · (b) 강제기 없음 · (c) 모든 응답의 첫 토큰 이전에 알아야 함 |
| S1 | 1. 이 프로젝트는 무엇인가 | resident | - | - | - | 컨테이너 절. 하위 절을 개별 판정하며 자체 산문은 방향 제시용 소량 |
| S1.1 | 1.1 출처 (Fork Lineage) | on-demand | - | - | - | (a) 불성립 — 귀속·라이선스 이력이지 행동 규칙이 아니다. SoT는 NOTICE. 이번 주기 미이전(분류만) |
| S1.2 | 1.2 핵심 가치: Multi-Model Dual Reviewer | resident | - | - | - | (a) plan 경로 축약이 dedupe를 불발시키고 dual-review 우회로 이어질 수 있음 · (b) 경로 표기를 잡는 강제기 없음 · (c) plan 작성 시점 이전에 알아야 함 |
| S1.3 | 1.3 자동화 파이프라인 (v0.1 receipt chain) | resident | - | - | - | (c) 어느 명령으로 진입할지 고르기 전에 필요한 chain 지도. 2.0%로 저렴 |
| S1.4 | 1.4 v0.2 자동 게이트 레이어 (receipt chain 위) | on-demand | docs/milestone-ledger.md | 자동 게이트 레이어 milestone 이력 | docs/milestone-ledger.md | (a) 불성립 — milestone별 ship 이력이지 지시가 아니다. 37,353B(23.5%)로 단일 최대 성분. **이번 주기 이전** |
| S2 | 2. Repository Layout (요약) | resident | - | - | - | (c) 파일을 찾기 전에 필요한 지도. 1.2%로 저렴 |
| S3 | 3. 작업 관행 (Working Conventions) | resident | - | - | - | 행동 규칙이 밀집한 컨테이너 절 |
| S3.1 | 3.1 게이트와 receipt를 우회하지 마세요 | resident | - | - | - | (a) 게이트 우회는 dual-review를 소급 복구 불가 · (b) 우회 의도 자체를 잡는 강제기 없음 · (c) 게이트 진입 전에 알아야 함 |
| S3.2 | 3.2 STATE.md 연속성 | resident | - | - | - | (a) STATE.md 직접 편집은 스키마·lock을 깨고 세션 연속성을 손실 · (b) 직접 편집을 막는 강제기 없음 · (c) 편집 직전에 알아야 함 |
| S3.3 | 3.3 Codex 의존 작업의 실패 모드 (v0.2.2 fail-closed matrix) | on-demand | - | - | - | (c) 불성립 — 14행 진단표는 실패가 발생한 *뒤* 참조한다. 상세 SoT는 docs/gate-design.md. 이번 주기 미이전(분류만) |
| S3.4 | 3.4 코드 스타일 / 컨벤션 | resident | - | - | - | (c) 모든 편집의 매 줄에 적용되며 0.4%로 저렴 |
| S3.5 | 3.5 커밋·PR | resident | - | - | - | (a) §3.5.1 머지 삭제 사고는 파일 소실이며 발견이 늦으면 복구가 어렵다(PR #110 실측) · (b) 강제기 없음 · (c) 머지 해소 직전에 알아야 함 |
| S3.6 | 3.6 Atomic state locks (`pr-phase.lock` + `quarantine.lock` + `evidence write lock`) | on-demand | - | - | - | (c) 불성립 — lock 내부 구조는 lock을 건드릴 때 참조한다. 7,684B(4.8%). 이번 주기 미이전(분류만) |
| S3.7 | 3.7 Plugin version bump (`plugin.json`) — 빈번한 누락 axis | resident | - | - | - | (a) 누락 시 사용자 캐시가 갱신 안 돼 머지 후에도 옛 동작 · (b) 강제기 없음(자동화는 미구현 부채로 명시) · (c) PR 작성 시점에 알아야 함 |
| S3.8 | 3.8 Worktree 경로 컨벤션 (`.worktrees/<branch-suffix>/`) | resident | - | - | - | (a) sibling worktree는 gitignore 보호 밖이라 산출물이 parent repo로 새고 envelope 라우팅이 어긋남 · (b) 강제기 없음 · (c) worktree 생성 직전에 알아야 함 |
| S3.9 | 3.9 디자인 surface 변경 시 SKILL first-step + critique retry loop (v1.3.0-m2) | on-demand | - | - | - | (b) 불성립 — critique loop과 grounding lint가 기계로 강제한다. 7,967B(5.0%). 이번 주기 미이전(분류만) |
| S3.10 | 3.10 Stage-aware impeccable command routing (v1.13.0 M1) | on-demand | - | - | - | (b) 불성립 — routing oracle이 기계 판정한다. 7,074B(4.4%). 이번 주기 미이전(분류만) |
| S3.11 | 3.11 완료 PRD/plan 아카이브 (`archived/` 관례 + `/mccp:archive-complete`) (v1.20.15) | on-demand | - | - | - | (b) 불성립 — archive-complete command가 판정·트랜잭션을 소유한다. 이번 주기 미이전(분류만) |
| S3.12 | 3.12 증거 내구성 계약 (Evidence durability contract) (v1.22.4 — durable-evidence-substrate Phase A) | resident | - | - | - | (a) 무단 재봉인은 ledger 결속을 dangling으로 만들고 중복 엔트리를 낳음(E4) · (b) sanctioned 도구 밖 writer를 막는 강제기 없음 · (c) receipt를 쓰기 직전에 알아야 함 |
| S3.13 | 3.13 Plan-Codex 의도 컨텍스트 게이트 (v1.23.1 — codex-intent-context M1) | on-demand | - | - | - | (b) 불성립 — 구조 가드·adjudication 커버리지·receipt 미작성이 전부 기계 판정이다(위반 시 `/mccp:prp-implement` 진입 자체가 막힌다). 이번 주기 미이전(분류만) |
| S3.13.1 | 3.13.1 오심(mislabelling) 탐지 (v1.23.9 — codex-intent-context M1.5) | on-demand | - | - | - | (b) 불성립 — S3.13과 같은 축의 후속 milestone이고 판정이 전부 기계적이다(리뷰어 `INTENT:` 계약 파싱 · 비대칭 대조 · receipt 미작성). 이번 주기 미이전(분류만) |
| S3.13.2 | 3.13.2 심판 컨텍스트 분리 (v1.30.1 — codex-intent-context M2) | on-demand | - | - | - | (b) 불성립 — S3.13·S3.13.1과 같은 축의 후속 milestone이고 판정이 전부 기계적이다(whitelist projection · 도구 부재 · 유효성 probe · schema 페어링). 배경 문서는 `docs/codex-intent-context/arbiter-separation.md`가 이미 소유한다. 이번 주기 미이전(분류만) |
| S3.13.3 | 3.13.3 hybrid L3 배선 (v1.31.0 — codex-intent-context M3) | on-demand | - | - | - | (b) 불성립 — 배선이 전부 기계 판정이다(`plan-codex-runner` 0회 등장·`hybrid_without_l3` 소비·nonce 대조·아티팩트 순서를 command-body test와 l3 test가 단언한다). 상세는 `docs/gate-design.md#hybrid-l3-wiring`이 소유한다. 이번 주기 미이전(분류만) |
| S3.14 | 3.14 (임시) 리뷰 finding 수용 임계 — HIGH 이상만 흡수 | resident | - | - | - | (a) 성립 — 매 리뷰 판정마다 적용되는 행위 규칙이고, 부재 시 세션마다 수용 임계가 달라진다. **임시 절**: quorum.js가 bare verdict=fail을 FAIL 심각도로 합성하지 않게 되면 절과 이 행을 함께 삭제한다 |
| S3.15 | 3.15 단일통과 토글 (v1.27.3 — review-loop-bypass M1) | on-demand | - | - | - | (b) 불성립 — 파서·완화 자격·양방향 schema 불변식이 전부 기계 판정이고, 세 게이트가 공유 오라클을 읽는지도 정적 test가 단언한다. 산문으로 남는 라운드 루프는 절이 상주해도 강제되지 않는다(절 자신이 그렇게 적고 있다). 이번 주기 미이전(분류만) |
| S3.16 | 3.16 리뷰는 1라운드가 기본이다 — plan 완성도보다 적용 후 결과 (2026-08-18) | resident | - | - | - | (a) 성립 — 라운드를 늘리는 비용이 사이클마다 반복 지불되고, 실측(santa-evidence-diversity M1 plan 1건에 8시간·패널 6라운드 + Plan-Codex 2라운드)에서 *수정이 다음 라운드의 표적이 되는 전이*가 재현됐다 · (b) `MCCP_GATE_ROUND_CAP=1`이 Codex 캡만 강제하고 패널 라운드·재리뷰 판단은 강제기 없음 · (c) 리뷰 결과를 triage하는 시점에 알아야 함 |
| S3.17 | 3.17 impeccable 탐지 계약 (v1.31.1 — impeccable-detection-contract M1) | on-demand | - | - | - | (b) 불성립 — 두 불변식이 모두 기계 판정을 갖는다. plugin/bare 네임스페이스 분리는 `impeccable-resolve.test.js`의 "bare invocation equals the literal name mccp command bodies call"이 단언하므로, M3가 재배선 없이 project-local 사본을 지우면 그 test가 red가 된다. 모호성 처리는 "ambiguous winner is reported as unknown, not guessed"가 `source`·`path`·`version` 셋의 null을 고정한다. 상세는 `docs/gate-design.md#impeccable-detection`이 소유한다. 이번 주기 미이전(분류만) |
| S4 | 4. 자주 쓰는 명령 (Cheat Sheet) | resident | - | - | - | (c) 명령 이름을 고르기 전에 필요한 색인. 이전 후에는 색인과 포인터만 남는다 |
| S4.1 | Generic-receipt quarantine runbook (v0.2.8 Task 2.6.5) | on-demand | - | - | - | (c) 불성립 — quarantine 실패가 발생한 뒤 따라가는 런북이다. 이번 주기 미이전(분류만) |
| S4.2 | 운영 토글 (환경 변수) | on-demand | docs/ENVIRONMENT.md | 3. 운영 토글 색인 (canonical) | docs/ENVIRONMENT.md | (b) 불성립 — 각 토글은 자기 소비처 오라클이 parse·검증한다. 44,462B(28.0%)이며 docs/ENVIRONMENT.md와 **중복**이다(PRD Evidence가 지목한 그 중복). **이번 주기 이전** |
| S5 | 5. 모르거나 막힐 때 | resident | - | - | - | (c) 막혔을 때 어디를 볼지의 포인터 색인. 1.3%로 저렴 |

## 4. 이 계약이 보증하지 **않는** 것

이전된 지시가 **도달 가능**하고 **어느 절도 조용히 사라지지 않았음**은 lint가 기계 검증한다(G2). 그러나 **"옮긴 뒤에도 LLM의 준수율이 유지되는가"는 M4가 측정하지 못한다.**

PRD의 A3 방어 규칙은 감축 전후 B1·C1 회귀 검사를 요구하지만 두 지표 모두 오늘 산출 불가다(`computeB1`은 무조건 `insufficient`, C1은 live source 미배선). 따라서 M4는 **도달성·보존만** 검증하고 준수는 **미측정으로 정직 기록**한다. 이것이 §1의 "분류 ≠ 이전" 규칙을 §3에 엄격히 적용하는 이유다 — 준수를 못 재는 동안에는 행동 규칙 절을 옮기지 않는다.
