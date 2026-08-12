# 내부 모델 리뷰가 cross-model이 잡는 것을 반복해서 놓치는 이유

**기록 시각**: 2026-08-12 · **대상**: `diverse-agent-review` M4, 브랜치 `diverse-agent-review-m2`
**계기**: 운영자 관찰 — "santa-loop 내부 agent 6개는 못 잡았는데 cross-model은 두 번 다 실재 결함을 검출했다."

---

## 0. 결론 먼저

관찰은 사실이고, 원인은 **리뷰어의 태도가 아니라 구조**다. 다만 운영자 가설(내부 = 긍정 검토 / cross = 공격적 검토)은 이 데이터로는 **기각된다**. 내부 리뷰어 6명은 3라운드 내내 FAIL을 냈고 승인한 적이 없다. 그들은 열심히 찾았고 — **같은 곳을 찾았다**.

실제 원인은 세 겹이다.

1. **cross-model이 애초에 돌지 않았다.** santa-loop의 Reviewer B(Codex)는 R1에서 usage limit으로 실패했고, 루프는 경고 없이 Claude fallback으로 계속됐다. R2·R3는 Codex를 재시도조차 하지 않았다. 이름은 dual-model인데 실체는 same-model × 6이었다.
2. **같은 모델 6개는 표본 6개가 아니다.** 오류가 상관되어 있어 n을 늘려도 검출 확률이 거의 오르지 않는다. 실측이 그것을 보여준다 — 6개가 한 축을 6번 확인했고, 다른 축은 6번 다 보지 않았다.
3. **관측 채널이 동일했다.** 6명 모두 같은 rubric·같은 파일 목록·**같은 구현 서사**를 받았다. cross-model은 서사 없는 diff를 받았다. 독립성은 컨텍스트 격리가 아니라 입력 다양성에서 온다.

---

## 1. 실제로 무엇이 돌았는가 (실측)

| 라운드 | Reviewer A | Reviewer B | 모델 다양성 |
|---|---|---|---|
| santa R1 | `code-reviewer` (Opus) | Codex `gpt-5.4` 시도 → **usage limit 실패** → `code-reviewer` fallback | **없음** |
| santa R2 | `code-reviewer` (Opus) | `general-purpose` (Opus) | **없음** |
| santa R3 | `code-reviewer` (Opus) | `general-purpose` (Opus) | **없음** |
| PR-Codex R1 | — | Codex (`env -u MCCP_CODEX_DISABLED`로 강제 발화) | 있음 |
| PR-Codex R2 | — | Codex | 있음 |
| PR-Codex R3 | — | Codex | 있음 |

Codex 실패 원문 (백그라운드 출력 말미):

```
ERROR: You've hit your usage limit. Upgrade to Pro ... or try again at Aug 16th, 2026 6:07 AM.
```

이 실패는 334KB 출력의 **맨 끝**에 있었다. 리뷰어를 백그라운드로 띄운 뒤 결과를 읽을 때까지 강등 사실이 표면화되지 않았다.

부수 관찰: R2·R3의 Reviewer B는 `general-purpose`였다. `santa-loop.md:128`은 fallback으로 `code-reviewer`를 지정한다. 다양성을 잃은 자리에 **리뷰 전문화까지 없는** agent가 들어갔다.

---

## 2. 검출 결과 대조

### 내부 6 agent가 잡은 것 (3건 + 부수 1건)

| # | 결함 | 검출자 | 축 |
|---|---|---|---|
| 1 | 5.2b·5.2c-emit이 recorder 호출을 산문에만 의존 | B 단독 | 산문↔배선 불일치 |
| 2 | 5.2a가 자기 stage 토큰을 명시하지 않음 | A 단독 | 산문↔배선 불일치 |
| 3 | 5.2g를 근거 없이 `directed`로 분류 (R1 수정이 만든 회귀) | B 단독 | 산문↔배선 불일치 |
| — | `[ -f proof.json ] && verify-proof`가 부재와 실패를 같은 비-0 exit로 뭉갬 | **리뷰어 아님** — 3번을 고치다 발견 | 실행 의미론 |

**R3은 두 리뷰어 모두 새 결함 0건**으로 끝났다. 그 직후 PR-Codex가 3건을 냈다.

### cross-model이 잡은 것 (3라운드 6건)

| 라운드 | # | 결함 | 축 |
|---|---|---|---|
| R1 | F1 (high) | recorder가 `\|\| true`라 브랜치 종결자로 쓰이면 실패한 검사가 exit 0 — 무효 proof가 receipt에 봉인 가능 | exit status 전파 |
| R1 | F2 (med) | `parsePanelBudget`이 floor **전에** 검증 → `0 < n < 1`이 0 반환, 게이트가 완화가 아니라 **꺼짐** | 경계값 |
| R1 | F3 (med) | recorder 8개 호출 전부 stderr를 `/dev/null`로 — 유일한 degradation 채널 폐기 | 오류 표면화 |
| R2 | F1 (med) | `DECIDE_EXIT`를 캡처하고 분기하지 않음 → 차단된 실행이 `halt_stage: null`로 기록 (측정 대상의 반전) | 제어흐름 fall-through |
| R3 | F1 (high) | budget skip이 `l2.json`을 쓰는데 5.2d가 `fleet.length`로 `ACTUAL_N`을 유도 → 유령 실행 4건을 회계에 커밋 | 상태 정합성 |
| R3 | F2 (med) | 리뷰어가 `verdict:"fail"` + 빈 findings면 기록에 "None — all reviewers passed" | 기록 정직성 |

**6건 전부 실행 의미론 또는 상태 정합성이다. 내부 리뷰어의 3건은 전부 문서 일관성이다.** 두 집합의 교집합은 공집합이다.

그리고 R1 F1과 R2 F1은 **santa-loop 수정이 만든 회귀**다. 커밋 `39d1719`가 명시한다: "F1 is a regression this branch introduced while fixing the santa-loop rounds."

---

## 3. 결정적 대조 — rubric이 지목했는데도 놓쳤다

이것이 "프롬프트를 더 공격적으로"가 해법이 아니라는 증거다. santa-loop 프롬프트(`santa-reviewer-b.txt`)는 이미 최대치로 적대적이었다:

> "Your job is to FIND PROBLEMS, not to approve. A rubber-stamp is a failed review."
> "Do not trust the report's self-assessment. Verify its claims against the code."

그리고 놓친 축을 **문자 그대로 지목**하고 있었다:

| cross-model이 잡은 것 | 프롬프트가 이미 요구한 문장 | 결과 |
|---|---|---|
| R1 F2 (0<n<1 → 0) | rubric #1: "`parsePanelBudget`/`panelMinRemaining` behave at every boundary (empty, 0, negative, NaN, **float**, huge, non-string)" | 6명 전원 놓침 |
| R1 F3 (stderr 폐기) | rubric #3: "**No silent swallowing**: every degraded axis is named on stderr AND in the written record" | 6명 전원 놓침 |
| R1 F1 (exit 0 회귀) | rubric #3: "Exit contracts are honored exactly" | 6명 전원 놓침 |
| R2 F1 (DECIDE_EXIT 미분기) | rubric #4: "Check that the recorder call sites are **reachable**" | 6명 전원 놓침 |
| R3 F1 (유령 회계) | rubric #6: "The new budget gate cannot newly block a run that previously worked" | 6명 전원 놓침 |

프롬프트에 축을 적는 것으로는 그 축을 보게 만들지 못한다. **rubric은 주의를 배분하지 않는다 — 서사가 배분한다.**

---

## 4. 원인

### C1. 모델 다양성이 0으로 붕괴했는데 루프가 그대로 진행됐다 (fail-open)

`santa-loop.md:127-128`이 규정한다 — 외부 CLI가 없으면 Claude agent를 띄우고 "Log a warning that both reviewers share the same model family". 경고만 하고 통과다.

더 정확히는, **스펙이 이 실패 모드를 아예 다루지 않는다.** fallback 조건은 `only if neither codex nor gemini is installed` — 즉 *미설치*다. 실제로 일어난 일은 "설치돼 있고, 호출됐고, **소진으로 실패**"였다. 스펙에 없는 상태이므로 실행자가 그때그때 판단했고, R1은 fallback을, R2·R3은 재시도 없이 `general-purpose`를 골랐다. 분기 없는 지점은 정책이 아니라 즉흥이 채운다.

그 결과 "santa-loop 3라운드 통과"가 STATE.md와 PRD에 **cross-model 검토를 받은 것처럼** 기록됐다. 실제로는 한 번도 받지 않았다.

mccp는 이 원칙을 다른 곳에서 이미 확립했다 — `docs/ENVIRONMENT.md:407` (`MCCP_PLAN_REVIEW_L3`):

> `mode=hybrid ∧ L3 미발화`는 `hybrid`가 **아니므로** verdict `unavailable`(HALT) … "요청했다"와 "일어났다"를 구분하지 않으면 dedupe가 없는 cross-model 확증을 인정한다.

**santa-loop에만 이 원칙이 빠져 있다.**

### C2. 같은 모델 n개는 표본 n개가 아니다

PRD가 이미 인용한 근거 — same-model 상관 0.4 vs cross-model 0.08 (arXiv 2507.11198) · cross-model 합의도 60% 공유 맹점 (arXiv 2506.07962).

검출 확률은 `1-(1-p)^6`이 아니라 거의 `p`에 머문다. M1 실측이 같은 것을 보였다: santa-loop 6라운드에서 **Codex 단독 7건 / Opus 단독 3건**. 어느 한쪽만 돌렸으면 나머지는 그대로 ship됐다.

### C3. 입력이 동일했고, 서사가 먼저 주입됐다

프롬프트의 두 번째 섹션이 "## What the milestone claims to do"다. 리뷰어는 **구현자의 서사를 먼저 읽고** 검토에 들어간다. 서사가 "9개 HALT를 전부 계측 경유하게 했다"면 리뷰어는 "9개가 맞나"를 센다 — 그리고 실제로 그것만 셌다. 세 건 모두 그 축이다.

cross-model은 rebased diff만 받았다. 서사가 없으니 "이 라인이 무엇을 하는가"를 묻는다. `|| true`로 끝나는 브랜치를 보면 그 브랜치의 exit status를 묻는다.

**서사를 주는 것은 검증 대상을 정해주는 대신 탐색 범위를 그것으로 가둔다.**

### C4. 라운드 간 앵커링은 리뷰어가 아니라 코드에 남는다

`santa-loop.md:145`는 "fresh reviewers (no memory of previous rounds)"로 앵커링을 막는다. 리뷰어의 기억은 리셋되지만 **직전 라운드의 처방은 코드에 남는다**. R1 리뷰어가 "inline record 하라"고 했고, 구현자가 `record … || true`를 브랜치 끝에 붙였다. R2·R3 리뷰어에게 그 코드는 **리뷰어가 원하는 모양**을 하고 있다.

누적 실측: M1에서 흡수 20건 중 6건, M4에서 6건 중 2건이 직전 라운드 수정의 회귀. **합 8건 — 단일 최대 결함 카테고리다.**

### C5. FAIL 할당량이 조기에 충족된다

rubric은 8개 축 전부에 PASS/FAIL을 요구하고 verdict는 "either FAIL → NAUGHTY"다. 한 축에서 FAIL이 확정되면 **verdict는 이미 결정**되고 나머지 축을 더 파는 한계효용이 0이다.

"rubber-stamp is a failed review"는 **결함 1건을 찾으라**는 압력이지 **전부 찾으라**는 압력이 아니다. 가장 싼 결함 — grep으로 확인 가능한 문서 대조 — 이 그 압력을 흡수한다.

### C6. markdown command body는 "문서"로 읽힌다

결함이 전부 `plan.md`(markdown 안의 shell)와 `budget.js` 경계값에 있었다. Claude 리뷰어는 markdown을 문서로 읽어 표·산문 일관성을 잘 잡지만, 안의 shell을 **실행 트레이스로 시뮬레이션하지 않는다**.

PRD 메모리가 이미 확립한 사실: code-review 8 + santa-loop 20 = **28건 전부 command-body seam** — 단위 test가 원리상 못 닿는 markdown 배선.

---

## 5. 운영자 가설에 대한 판정

| 가설 | 판정 | 근거 |
|---|---|---|
| 내부 agent가 "긍정 검토"를 한다 | **기각** | 3라운드 내내 FAIL. escalate로 종료. 승인 편향의 흔적 없음 |
| cross-model이 "공격적 검토"를 한다 | **부분 인정 — 단 톤이 아니라 구조** | Codex가 더 적대적인 게 아니라, 서사 없는 diff를 받아서 라인 의미론을 묻는다 |
| 문제가 반복된다 | **인정, 4회차** | M1(4회) → M4. `[[integrity-unification-m3]]`·`[[multi-session-work-loop-m2]]`와 같은 패턴 |

핵심 재정의: **승인 편향(approval bias)이 아니라 탐지 동형성(detection homomorphism)이다.** 프롬프트를 더 다그쳐도 같은 결과가 나온다 — 이미 최대치였다.

---

## 6. 개선안

### I1. Codex 강등을 fail-closed로 (최우선 — C1)

`santa-loop.md` Step 3을 고친다. Reviewer B가 외부 CLI로 뜨지 못하면 **verdict를 발급하지 않는다**.

- 실패를 분류한다: `usage-limit` / `not-authenticated` / `not-installed`. `usage-limit`은 retry-after 시각을 즉시 표면화하고 루프를 HALT(escalate).
- 운영자가 명시적으로 진행을 택하면(`--allow-same-model`) 진행하되, **최종 리포트·커밋 메시지·STATE.md에 `model_diversity: none`을 stamp**한다. 지금은 이 stamp가 없어서 "3라운드 통과"가 cross-model 검토를 받은 것처럼 읽혔다.
- 선례가 이미 있다 — `MCCP_PLAN_REVIEW_L3`의 "요청했다 ≠ 일어났다" 원칙(§C1 인용)을 santa-loop에 그대로 적용하면 된다.

### I2. 최소 1명은 서사 없이 diff만 본다 (C3)

- Reviewer 중 한 명은 `git diff <base>...HEAD`만 받는다. plan·report·"What the milestone claims to do" 없음.
- 나머지는 현행대로 서사 포함 — 두 입력의 **비대칭 자체가 다양성**이다.
- 실증: cross-model이 정확히 이 조건이었고 6건을 잡았다.

### I3. rubric을 리뷰어별로 분할한다 (C5)

8축 전부를 모두에게 주지 말고 나눈다.

- **Reviewer A** = 실행 의미론 전담: exit status 전파 · 제어흐름 fall-through · 경계값 · 상태/회계 정합성
- **Reviewer B** = 일관성 전담: 산문↔배선 · 문서 대조 · 버전 동기

추가로, **"이 축에서 결함 0건"을 주장하려면 무엇을 어떻게 확인했는지 재현 가능한 절차(명령 또는 라인 인용)를 요구**한다. PASS 사유를 산문으로 쓰게 하면 "코드를 읽었고 문제없어 보인다"가 통과한다.

### I4. 리뷰어가 못 보는 것은 test로 고정한다 (C6) — 이미 착수됨

커밋 `39d1719`가 `plan-review-command-body.test.js`를 추가했다(recorder가 브랜치 종결자가 아님 · stderr 미폐기 · 표↔셸 일치). 방향이 맞고, PRD milestone **#5(게이트 배선 오라클 추출)**가 소유한 축이다.

이번 findings에서 직접 도출되는 확장 후보:

- 캡처된 `*_EXIT` 변수는 반드시 분기에 쓰여야 한다 (R2 F1)
- `l2.json`을 읽는 회계 경로는 `skipped` 필드를 반드시 분기해야 한다 (R3 F1)
- `Math.floor` 결과를 반환하는 파서는 floor **후** 검증해야 한다 (R1 F2)

**리뷰어를 더 다그치는 것보다 싸다.** 28건 전부 command-body seam이라는 실측이 이 우선순위를 지지한다.

### I5. 직전 라운드의 수정을 다음 라운드의 명시적 대상으로 (C4)

현행 "no memory"는 앵커링을 막지만 **회귀 검출도 막는다**. 절충: R≥2의 리뷰어에게 직전 라운드의 수정 diff를 별도 섹션으로 제시하고 "이 수정이 새 결함을 만들었는가"를 전용 질문으로 준다. 처방의 **출처**는 숨기되(앵커링 회피) 변경의 **최신성**은 표면화한다.

근거: 누적 8건이 이 카테고리다(§C4).

### I6. cross-model 발화 지점 — PRD milestone #2를 앞당길 근거가 확보됐다

현재 배치는 의도적이다 — plan 게이트는 multi-agent, cross-model은 terminal `/mccp:pr`로 **이동**(`ENVIRONMENT.md:404`). 되돌리자는 게 아니다.

다만 이번 실측이 보여준 비용: 실행 의미론 결함이 ship 직전에야 발견됐고, 그 사이 santa-loop 3라운드 + 수정 2회가 소모됐으며 **그 수정 자체가 회귀 2건을 낳았다**.

PRD milestone #2(L3 자동 트리거)의 조건 B(위험영역)에 **`gate-self`가 이미 있다**. 이번 변경은 정확히 게이트 자신을 고치는 변경이었다. #2를 실행 순서에서 앞당길 근거가 이번 실측으로 마련됐다.

### I7. usage limit을 운영 리스크로 다룬다 (C1의 하위)

cross-model이 실행 의미론의 유일한 검출기인데, 그것이 소진되면 검출력이 0이 된다. 실측 limit은 Aug 16까지였다.

- santa-loop 진입 시 Codex 가용성을 **선제 probe**한다(1토큰 요청). 지금은 리뷰어를 백그라운드로 띄우고 334KB 출력 끝에서야 알았다.
- 스펙에 있는 대안(`gemini`)은 미설치다. **실질 이중화가 없다** — 설치하거나, 없다는 사실을 I1의 HALT 조건에 반영한다.

---

## 7. 이후 경과 (2026-08-12 갱신)

이 절은 처음 "PR-Codex R3의 2건이 미수정"이라고 적혔다. 그 시점 기준으로는 사실이었고, 이후 둘 다 수정됐다. 초안 서술을 남겨 두면 문서가 스스로 stale해지므로 결과로 대체한다.

- **R3 F1 (high)** — budget skip이 `l2.json`을 쓰는데 5.2d가 `fleet.length`로 `ACTUAL_N`을 유도 → 유령 실행 4건을 회계에 커밋. 수정 `8d030a3`.
- **R3 F2 (medium)** — `verdict:"fail"` + 빈 findings 배열이면 기록이 "None — all reviewers passed"라고 쓴다. 차단된 경로에 대한 **거짓 운영자 대면 기록**. 수정 `8d030a3`.
- **R4 F1 (medium)** — 발화 이전 halt(5.2b·5.2c-emit·5.2c-pin)가 예약을 반납하지 않아 lease window(기본 10분) 동안 존재하지 않은 리뷰어 몫으로 cap을 점유. 수정 `e99dd54`.

**R3·R4는 모두 M4의 Axis B(budget 게이트 발화)가 만든 신규 결함이고, 방향이 서로 반대다.** R3은 실행하지 않은 4개를 회계에 **더했고**, R4는 실행하지 않은 4개를 **빼지 않았다**. 죽어 있던 분기를 살리면 그 분기의 회계가 양방향으로 새로 검증 대상이 된다는 것 — 이것이 이 milestone이 남긴 가장 이전 가능한 교훈이다.

부수 확인: 이 두 건 모두 내부 리뷰어가 아니라 cross-model이 잡았다. §2의 축 편중(내부 = 산문↔배선, cross = 실행 의미론·회계)이 라운드가 늘어도 유지된다는 실측이 하나 더 쌓인 셈이다.

---

## 8. 증거 출처

| 주장 | 출처 |
|---|---|
| Codex usage limit 실패 | `…/0d757483-…/tasks/bekqatg7h.output` 말미 |
| 6 agent 구성 (code-reviewer ×4, general-purpose ×2, codex 성공 0) | 세션 `56c88f00-…` transcript의 Agent/Bash 호출 |
| 내부 흡수 3건 + A/B 단독 라벨 | `.claude/state/STATE.md` (핸드오프 시점 기록) |
| PR-Codex R1/R2/R3 findings | `.git/worktrees/diverse-agent-review-m2/mccp/tmp/codex-result.json` + 세션 `e1ae0718-…` |
| F1이 santa-loop 수정의 회귀 | 커밋 `39d1719` 본문 |
| rubric 원문 | `…/56c88f00-…/scratchpad/santa-reviewer-b.txt` |
| same-model 상관 0.4 / cross 0.08 | PRD 인용 (arXiv 2507.11198, 2506.07962) |
| M1 비대칭 실측 (Codex 7 / Opus 3) | `diverse-agent-review` PRD memory |

---

## 9. 한 문장 요약

**같은 모델 6개에게 같은 서사와 같은 rubric을 주는 것은 리뷰를 6번 하는 것이 아니라 한 번 하는 것이다. dual-review의 값은 리뷰어 수가 아니라 관측 채널의 비대칭에서 나오고, santa-loop은 그 비대칭이 사라졌을 때 멈추지 않는다.**
