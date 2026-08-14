# 부록 — PRD 분해 선행 분석 (결정 3건 확정)

> 작성일: 2026-08-12 · 본편: [2026-08-12-review-loop-meta-analysis.md](2026-08-12-review-loop-meta-analysis.md)
> 목적: 운영자 결정 3건을 확정하고, **병렬 PRD 분해가 안전한지**를 파일 소유권 수준에서 판정한다.
> 계기: 본편 §11 미결 1·2 + "멀티 PRD로 병렬 작업" 요구.

---

## 1. 결정 확정

| # | 운영자 결정 | 상태 |
|---|---|---|
| 1 | `.claude/_meta/` 로 통일 | 확정 — 이관 범위 §4 |
| 2 | santa-loop ↔ receipt 체계 (Claude 판단) | **확정 — §2. 본편 §11의 유보를 뒤집는다** |
| 3 | #124 제안 수용, 운영자가 구현 | 확정 — PRD가 구현 계약을 정의 |

---

## 2. 결정 2 — santa-loop을 receipt 체계에 **넣는다**. 단 `review_source='multi-agent'` 로.

본편 §11은 이 질문을 "가장 큰 미결" 로 유보했다. 근거는 [diverse-agent-review-analysis.md](./diverse-agent-review-analysis.md) §1.3의 4축 경고(dedupe 무력화 · ship gate 거짓 증명 · ledger provenance 오염 · DD2 위반)였다.

**그 경고는 2026-08-06 작성분이고, diverse-agent-review M1이 그 사이 ship되면서 4축이 전부 닫혔다.** 코드로 확인:

[review-verdict.js](../../plugins/mccp/scripts/lib/review-verdict.js)
```js
const SOURCES              = ['codex', 'multi-agent', 'hybrid'];
const CROSS_MODEL_SOURCES  = ['codex', 'hybrid'];        // 'multi-agent' 부재
const REVIEW_VERDICT_VALUES= ['converged','divergent','critical','unavailable','skipped'];
const MIN_QUORUM_REQUIRED  = 2;
```

[dedupe.js:370-390](../../plugins/mccp/scripts/receipt/dedupe.js)
```js
// "Codex said converged" → "a CROSS-MODEL reviewer said converged" 로 확장.
// A multi-agent panel approval is not evidence that Codex ever spoke,
// so it must NOT satisfy the skip.
const codexConverged = crossModelConverged;   // source ∈ {codex, hybrid} 강제
```

→ **multi-agent verdict는 구조적으로 cross-model 증명이 될 수 없다.** `isCrossModelCorroborated`가 `hybrid` 조차 `review_proof.layers.l3 === 'converged'` 를 실물 확인하고, 아니면 거부한다. 4축이 코드로 봉인돼 있다.

### 2.1 그래서 무엇을 넣는가 — 원장과 receipt는 **다른 물건**이다

| 산출물 | 성격 | 시점 | 소비자 |
|---|---|---|---|
| **adjudication ledger** | 루프 **내부** 작업 상태 | 매 라운드 | 다음 라운드의 **집계 단계**(리뷰어 아님 — 본편 메타 결론 D) |
| **santa receipt** | 루프 **종료** 감사 앵커 | 1회 | 계측 · 대시보드 |

#124가 요구하는 것은 **원장**이다(라운드 카운터 + ABSORBED/REJECTED 행). receipt는 그 원장의 **집계값을 봉인**하는 별개 층이다.

**그리고 이 두 번째 층이 본편 §1의 계측 공백을 정확히 메운다.** 본편에서 항목 3("Codex 환각 80%")이 반증 불가능한 이유는 `rejected` 총합이 corpus 전체에 0이기 때문이었다. 원장의 `REJECTED(reason)` 행이 바로 그 **없어진 분모**다. → **#124 원장 = 항목 3 계측기.** 두 항목이 하나의 산출물로 만난다.

### 2.2 새 GATE_ID의 선례가 이미 있다

[schema.js:14-19](../../plugins/mccp/scripts/receipt/schema.js) `mccp-implement-verify` 주석:

> *produces-only, written by the /mccp:work Step 3 controller ... **Non-invasive to command preflight (no command lists it in `requires_preceding`)** — its runtime enforcement is work.md's verify-decide HALT, this receipt is the audit anchor.*

→ **"produces-only 감사 앵커" 패턴이 이미 존재**한다. santa receipt는 이 선례를 그대로 따른다: 어떤 command도 `requires_preceding`에 넣지 않으므로 체인 차단 위험 0, 순수 계측·감사용.

> **판정 2** — santa-loop receipt를 신설한다. `gate_id: 'mccp-santa-review'` · `review_source: 'multi-agent'` · produces-only(`requires_preceding` 등재 금지) · 역할은 **원장 집계값 봉인**이지 하류 게이트 승인이 아니다. dedupe·ship-gate는 `CROSS_MODEL_SOURCES` 덕에 **코드 변경 없이** 이를 자동 거부한다.

---

## 3. 병렬 PRD 안전성 — **소박한 "이슈당 1 PRD" 는 위험하다**

### 3.1 충돌 실측

세 축이 손대야 하는 파일:

| 축 | `santa-loop.md` | `santa-method/SKILL.md` | 기타 |
|---|---|---|---|
| 원장·캡 (#124 원인 3) | Step 5 | Phase 4 | — |
| severity·게이트 (#124 원인 1·2) | **Step 3·4** | `santa_verdict()` | — |
| 증거 다양성 (#125) | **Step 1·3**, 5.3 | L11 주장문 | — |

**세 축 전부가 `santa-loop.md` 를 고치고, 두 축이 Step 3에서 정면 충돌한다.** 그 파일은 **199행**이다.

이 repo는 오래 산 브랜치 머지가 파일을 조용히 지운 실측 사고를 보유하고 있다(CLAUDE.md §3.5.1, PR #110 — 9파일 2144줄 소실). 199행 파일을 worktree 3개가 동시에 재작성하면 **#110의 재현 조건 그 자체**다.

> **판정 3a** — "#124 = PRD 1, #125 = PRD 2" 로 나누는 것은 **금지**. 파일 소유권이 겹친다.

### 3.2 그런데 진짜 원인은 다른 데 있다 — santa-loop에는 **코드가 없다**

```
plugins/mccp/scripts/lib/santa*   →  존재하지 않음
plugins/mccp/commands/santa-loop.md  →  199행, 전부 산문
```

#124 원인 3("`MAX_ITERATIONS = 3` 은 산문/의사코드에만 있고, 라운드 카운터도 상태 파일도 없다")은 **버그가 아니라 아키텍처 상태의 서술**이다. 캡이 안 지켜지는 이유는 캡을 지킬 코드가 없어서다.

그리고 모든 수정이 한 산문 파일로 몰리는 이유도 같다 — **분기할 모듈이 없다.**

repo에는 이미 command→lib 추출 선례가 확립돼 있다: `plan.md` → `plan-review/cli.js`·`orchestration-runaway.js`, `work.md` → `work-orchestrator.js`.

> **판정 3b (핵심)** — **santa-loop 실체화(prose → module)가 병렬화의 enabling 조건**이다. 결정 로직을 `scripts/lib/santa/` 로 추출하면 (a) 캡이 기계적으로 강제되고(#124 원인 3 자동 해결), (b) 이후 축들이 **서로 다른 모듈 파일**을 소유해 진짜 병렬이 된다.
>
> 즉 분해 순서는 "이슈별" 이 아니라 **"실체화 먼저, 그 다음 모듈별 병렬"** 이다.

### 3.3 결과 — 소유권 매트릭스

```
[선행 1건 — 이것만 직렬]
  P0  santa-loop 실체화        scripts/lib/santa/{ledger,counter,gate}.js 신설
                              + santa-loop.md 를 thin caller 로 축약
                              + schema.js 에 mccp-santa-review GATE_ID
                              ⇒ 이후 축들의 파일 충돌을 구조적으로 제거

[P0 이후 — 진짜 병렬 (모듈 소유권 분리)]
  P1  판정 계약 (#124)         owns santa/gate.js · santa/severity.js
  P2  증거 다양성 (#125)       owns santa/scope.js · santa/reviewers.js
  P3  델타 리뷰 (항목 6)       owns santa/delta.js  ← 메타 결론 D 불변식 필수
                              (P1 원장 스키마에 의존 — 인터페이스만)

[P0 과도 무관 — day 0 부터 병렬]
  H1  setup gitignore (항목 0)      owns commands/setup.md + 신규 lib
  H2  메타 커맨드 + _meta 통일 (1)  owns 신규 commands/ + .claude/meta→_meta
  H3  세션 프로세스 회수 (항목 5)   owns hooks/session-end-*.js + hooks.json

[별도 트랙 — 진행 중]
  D   diverse-agent-review M2/M3    (N=4 knee 확정 — 관점 증설 금지)
```

동시 착수 가능 수: **day 0에 4개**(P0 + H1 + H2 + H3), P0 종료 후 **최대 6개**.

항목 1.5(chain 변경)는 P1·P2·P3 전부 종료 후 — 본편 메타 결론 F.

---

## 4. 결정 1 — `_meta` 이관 범위 (실측)

`.claude/meta/` → `.claude/_meta/` 이관 **완료**(2026-08-12, 본 사이클에서 실행). 대상 3파일 + 인바운드 링크 **6개 / 2파일**:

| 참조 파일 | 링크 수 |
|---|---|
| `.claude/prds/diverse-agent-review.prd.md` | 4 (L6 ×3, L62, L64) |
| `.claude/plans/diverse-agent-review-m1.plan.md` | 2 (L77, L190) |

`.claude/audit/`·`PRPs/plans/archived/` 의 `_meta` 문자열 히트는 **전부 무관**이다 — receipt validator의 `blocking[].gate_id === '_meta'` 센티널이며 디렉토리와 무관. **이관 시 치환 대상 아님**(오치환 주의).

`.gitignore` 확인 결과 옛 경로·새 경로 어느 쪽도 무시 대상이 아니다 — 둘 다 git-tracked. 실행은 `git mv` 3회 + 링크 6개 치환.

**치환 시 주의(실측 함정)** — `.claude/audit/`·`PRPs/plans/archived/` 의 `_meta` 히트는 receipt validator의 `blocking[].gate_id === '_meta'` **센티널**이며 디렉토리와 무관하다. 경로 패턴(`../meta/`)으로만 치환할 것. 본 사이클에서 문자열 단위 치환이 산문 문장까지 바꾼 사례가 있었다.

→ 이관 자체는 완료됐으므로 **H2의 잔여 범위는 메타 조사 커맨드 신설뿐**이다. MVP가 그만큼 더 축소된다.

---

## 5. PRD 작성 시 반드시 승계할 불변식

각 PRD 본문에 **명시적으로** 실어야 하는, 본 메타 분석이 생산한 제약:

1. **P2 — 리뷰어를 온화하게 만들지 말 것.** FN 편향이 FP 편향의 4~114배. 오탐은 리뷰어 상류가 아니라 판정 하류에서 거른다. (본편 메타 결론 C)
2. **P3 — "pass 했다"를 리뷰어에게 절대 말하지 말 것.** bug-free framing은 탐지율 16~93%p를 붕괴시킨다. 기계적 스코프(`이 hunk만`)는 허용, 상태 단언은 금지. (본편 메타 결론 D)
3. **P1 — 원장은 리뷰어가 아니라 집계 단계가 읽는다.** 리뷰어는 fresh, 원장은 persistent. (#124 제안 3 + 위 2번의 필연적 귀결)
4. **P0/P1 — santa verdict는 `review_source='multi-agent'`.** `codex`/`hybrid` 참칭 금지. dedupe·ship-gate는 코드로 이미 거부하지만, PRD가 명시하지 않으면 구현자가 `converged`를 그냥 쓸 유인이 있다.
5. **D — 관점 수를 늘리지 말 것.** N=4가 knee(한계이득 +14.9/+13.5/+11.2%p 이후 평탄). 다양성은 **증거 경로**로 낸다. (본편 메타 결론 E)
6. **전체 — 계측이 먼저다.** duration 필드·원장 집계 없이 착지한 개선은 다시 체감으로만 평가된다. (본편 §1)

---

## 6. 남은 미결 (PRD 단계에서 결정)

- **santa 원장의 git-tracked 여부** — `STATE.md`(tracked, 연속성) vs `loop-counter.json`(gitignored, 세션 로컬) 두 선례가 갈린다. 계측 분모를 살리려면 최소한 **집계값은** 살아남아야 하는데, 원장 원문까지 tracked 하면 라운드마다 diff 노이즈가 생긴다. → 권장: **원장 본문 gitignored + 집계값을 receipt에 봉인**(§2.1의 2층 구조가 이 문제를 이미 푼다).
- **P0의 santa-loop.md 축약 폭** — thin caller 로 어디까지 줄일지. 199행 중 rubric·출력 포맷은 산문이 적합할 수 있다.
- **항목 1.5 chain의 santa-loop 2회 역할 분리** — implement 직후 = 코드 정합성 / pr 직전 = ship 불변식. 같은 rubric 재실행은 금지(본편 §6).
