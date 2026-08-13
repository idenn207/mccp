# 리뷰 루프 메타 분석 — 운영자 제기 7항목 + GitHub issue #124·#125

> 작성일: 2026-08-12 · 브랜치 `docs/meta-analysis-2026-08` · worktree `.worktrees/meta-analysis`
> 입력: 운영자 제기 항목 0·1·1.5·2·3·4·5·6 + [#124](https://github.com/skypark207/my-claude-code-plugin/issues/124) · [#125](https://github.com/skypark207/my-claude-code-plugin/issues/125)
> 성격: **메타 분석** — 개별 항목의 해법이 아니라 항목들 사이의 공통 원인·상호 모순·선후 의존을 판정한다.
> 관련 선행 문서: [`.claude/_meta/` 선행 3문서](./) 3종(diverse-agent-review 분석 · converged 재정의 · verification layer)

---

## 0. 한 줄 결론

제기된 8항목 중 **4개(2·3·6 + #124·#125)는 서로 다른 증상이 아니라 하나의 결함**이다 — **리뷰 루프에 판정 원장(ledger)도 severity 축도 계측도 없다.** 나머지는 독립 위생 항목(0·1·5)과 이미 60% 착지한 항목(4)이다.

가장 중요한 발견은 **항목 3의 "Codex 80% 환각" 이 현재 계측으로는 참·거짓을 판정할 수 없다**는 것이다. 그리고 문헌은 그 수치가 **타당하다고 지지하는 동시에, 그 원인을 리뷰어에서 제거하려는 시도가 더 큰 실패 모드를 부른다고 경고**한다.

---

## 1. 실측 — 계측 부재의 증거

`.claude/receipts/` 전수(149건) 집계:

| 지표 | 값 | 의미 |
|---|---|---|
| receipt 총수 | 149 | — |
| **`findings[]` 총합** | **3** | 리뷰어가 낸 지적이 사실상 기록되지 않음 |
| **`resolution.rejected` 총합** | **0** | **기각 판정이 corpus 전체에 단 1건도 없음** |
| `resolution.accepted` 총합 | 4 | — |
| `deferred_findings_count` 총합 | 1 | — |
| round 분포 | `{1: 148, 2: 1}` | 게이트 루프는 사실상 1라운드 고정 |
| **duration 필드 보유 receipt** | **0** | **wall-clock 계측 필드가 스키마에 아예 없음** |
| codex_verdict 분포 | `converged 26 · divergent 14 · unavailable 3 · skipped 10 · null 96` | — |

여기서 세 가지가 즉시 따라온다.

1. **항목 3은 현재 반증 불가능하다.** "FAIL 중 환각 80%" 를 검증하려면 `제기된 finding` ÷ `기각된 finding` 이 필요한데, 분자는 3, 분모는 0이다. 운영자가 대화 안에서 내린 기각 판정은 **어디에도 남지 않고 증발**했다. 체감이 틀렸다는 뜻이 아니라, **체감밖에 없다**는 뜻이다.
2. **항목 2의 "1시간" 도 귀속 불가능하다.** receipt 스키마에 duration이 없으므로 어느 phase가 시간을 먹었는지 사후 판정할 근거가 없다. `meta.created_at` 단일 타임스탬프뿐이다.
3. **운영자가 아프다고 말하는 루프는 receipt를 남기는 루프가 아니다.** 게이트 루프는 `MCCP_GATE_ROUND_CAP` 기본 1로 148/149가 1라운드다. 15~20라운드가 나오는 것은 **santa-loop** 인데, santa-loop은 `GATE_IDS` 에 없어 **receipt를 아예 발행하지 않는다**([santa-loop.md](../../plugins/mccp/commands/santa-loop.md) 199행 전체가 산문 — 카운터·상태파일·백킹 스크립트 0). #124 원인 3과 정확히 일치.

> **메타 결론 A** — 아픈 두 루프(santa-loop 반복 · Codex 판정 신뢰)가 **정확히 계측이 0인 두 지점**이다. 우연이 아니다. 계측되지 않는 것은 개선되지 않고, 개선되지 않으므로 아프다.

---

## 2. 항목 3 재구성 — "Codex 불신" 은 두 개의 다른 도구를 하나로 뭉친 것이다

운영자는 "codex" 를 단일 주체로 지목하지만, 코드상 **경로가 둘이고 성능 이력이 정반대**다.

| | 게이트 Codex | santa-loop Reviewer B |
|---|---|---|
| 호출 | `codex-invoke.js` → `codex-companion.mjs` | `codex exec --sandbox read-only -C "$(pwd)"` |
| 증거 접근 | 호출자가 만든 **스냅샷/포커스 파일** | **저장소 전체 자기 재탐색** |
| 타임아웃 | 900s(`DEFAULT_TIMEOUT_MS`) | CLI 기본 |
| 실측 평판 | 운영자 체감 환각 ~80% | **#125에서 동일모델 4인스턴스 × 12라운드가 못 찾은 결함을 1라운드에 포착** |

#125의 핵심 문장을 그대로 옮기면 — *"codex 가 이긴 이유는 모델이 달라서가 아니다. 저장소 전체를 자기 루프로 재탐색했기 때문."*

> **메타 결론 B** — 항목 3의 불신 대상은 **모델(멀티모델 전략)이 아니라 증거 공급 방식(스냅샷 주입)** 이어야 한다. 같은 codex가 스냅샷을 받으면 환각하고 디스크를 받으면 이긴다. **"멀티 모델에 대한 불신" 이라는 프레이밍 자체가 오귀속**이며, 이 프레이밍으로 항목 4를 밀면 잘못된 축을 최적화하게 된다.

---

## 3. 문헌 대조 — 80%는 타당하다. 그러나 처방은 정반대다

### 3.1 수치는 문헌과 일치한다

중립 조건에서 LLM 리뷰어 precision은 **29.0%(Claude 3.5 Haiku) ~ 42.4%(Gemini 2.0 Flash)** — 즉 **오탐이 58~71%** ([Measuring and Exploiting Confirmation Bias in LLM-Assisted Security Code Review](https://arxiv.org/html/2603.18740v1)). 일부 기법은 precision 10% 미만([Utilizing Precise and Complete Code Context](https://arxiv.org/pdf/2411.03079)). curl이 AI 제보로 bug bounty를 영구 폐쇄하고 HackerOne이 2026-03 IBB를 중단한 것도 같은 축.

**운영자의 80% 체감은 과민이 아니라 문헌 범위 안이다.** 이건 확정해도 된다.

### 3.2 그런데 그 오탐을 만드는 프레이밍이 훨씬 큰 위험을 막고 있다

같은 논문의 비대칭 결과가 결정적이다.

- 취약 코드를 "안전하다" 고 프레이밍하면 탐지율이 **16~93%p 하락**. GPT-4o-mini는 97.2% → 3.6%로 붕괴.
- **false negative 편향이 false positive 편향을 4~114배 초과**한다.
- 겉보기 precision이 88.9%로 *올라가면서* 실제 탐지는 3.2%에 그치는 **precision paradox** — "조용해졌다" 가 "정확해졌다" 로 오독된다.

santa-loop 리뷰어 프롬프트의 `"Your job is to find problems, not to approve"`([santa-loop.md:94](../../plugins/mccp/commands/santa-loop.md)) 는 오탐의 **원인**이 맞다. 하지만 그것은 4~114배 더 큰 실패 모드를 막는 **의도된 거래**다.

> **메타 결론 C** — **리뷰어를 온화하게 만들어 항목 3을 해결하려는 모든 시도는 금지**다. precision paradox 때문에 개선처럼 보이면서 실제로는 탐지 붕괴다. 오탐은 **리뷰어 상류가 아니라 판정 하류**에서 — severity 게이트 + 판정 원장으로 — 걸러야 한다. 이것이 정확히 #124 제안 1·2·3이며, 본 메타 분석은 그 제안을 **문헌 근거로 승인**한다.

### 3.3 처방의 이름은 이미 문헌에 있다

[Refute-or-Promote (arXiv:2604.19049)](https://arxiv.org/pdf/2604.19049) — 적대적 stage-gated 다중 에이전트 리뷰. 각 finding이 **refute 역할 에이전트의 비판을 통과해야만 승격**되고, 통과 못 하면 다음 단계로 전파되지 않는다. mccp에 이미 있는 `mccp:review-*` 4종 refutation reviewer가 정확히 이 패턴이며([plan.md L2 approval panel](../../plugins/mccp/commands/plan.md)), **santa-loop에는 이 층이 없다.**

---

## 4. 항목 6 — 델타 리뷰: 방향은 옳고, 문구 하나가 치명적이다

운영자 제안: *"이번 구현(1)이 pass면 다음 리뷰 때 검토 미진행. 수정 내역(2)만 리뷰."*

### 4.1 지지 근거

- SmartBear: 리뷰 효과성이 **400 LOC 초과 시 70% 미만**, 200 LOC 이하 80~90%, 1,000 LOC 이상 50% 미만.
- Google 수백만 건 분석: 100 LOC 미만은 중앙값 턴어라운드 **1시간 미만**, 100~500 LOC는 4시간.
- 인지 부하·decision fatigue 문헌 일치([A Roadmap for Modern Code Review](https://arxiv.org/html/2405.18216v2), [Towards debiasing code review support](https://arxiv.org/pdf/2407.01407)).

→ **스코프 축소 자체는 문헌이 강하게 지지**한다. 항목 2(시간)에도 직접 기여한다.

### 4.2 그러나 — 구현 문구가 §3.2의 함정을 그대로 밟는다

"이 부분은 이전 라운드에서 **pass 했다**" 를 리뷰어에게 알리는 순간, 그것은 **bug-free framing** 이다. 위 논문의 16~93%p 탐지 붕괴가 바로 이 입력으로 발생한다. 즉 **델타 리뷰를 소박하게 구현하면 항목 6이 항목 3을 악화**시킨다.

> **메타 결론 D** — 델타 리뷰는 **기계적 스코프 제한**으로만 구현하고 **인식론적 주장을 절대 싣지 않는다.**
>
> - 허용: `"다음 hunk만 검토하라: <file>:<line-range>"` (범위 지정)
> - **금지**: `"나머지는 이미 승인됐다 / pass 했다 / 문제없다"` (상태 단언)
>
> 이 구분은 #124·#125 어디에도 없는 **본 메타 분석의 신규 판정**이며, 항목 6 구현 시 최우선 불변식이다. 논문의 완화책(metadata redaction 68.75% 회복, 명시적 debiasing instruction 93.75~100% 회복)도 같은 방향 — **리뷰어에게 이전 판정을 숨겨라.**
>
> 반면 **판정 원장은 리뷰어가 아니라 게이트(집계 단계)가 읽는다** — #124 제안 3의 "리뷰어는 fresh, 원장은 persistent" 가 정확히 이 분리다. #125 제안 5(원장에서 지적 문구 제거, ID·결론만)는 같은 위험을 다른 각도에서 이미 감지한 것이다.

---

## 5. 항목 4 — 이미 60% 착지했고, 남은 미결 변수의 답이 #125 안에 있다

운영자가 "논문 참고해서 다관점 agent 방안" 을 요청했으나, **그 작업은 이미 진행 중**이다.

- [diverse-agent-review-analysis.md](./diverse-agent-review-analysis.md) — 논문 8편 + 타사 11개 사례 + R2(하이브리드) 결론.
- [.claude/prds/diverse-agent-review.prd.md](../prds/diverse-agent-review.prd.md) — **M1 status = `complete`** (plan-codex 게이트를 L1+L2 multi-agent로 전환, Codex는 opt-in 강등). M2(L3 자동 트리거)·M3(implement-verify 3층)은 `pending`.
- 코드: `mccp:fanout-*` 4종(GROUND) + `mccp:review-*` 4종(L2 승인 패널) 이 이미 라이브.

PRD의 미결 질문 중 하나가 **"quorum 파라미터 — N(관점 수)/M(통과 임계)/K(최소 역할 종류)"** 인데, **#125가 그 답을 이미 인용**하고 있다:

[Multi-Agent Code Verification via Information Theory](https://arxiv.org/html/2511.16708) — 한계 정보이득 단조감소(submodularity). 에이전트 2·3·4의 기여가 **+14.9%p / +13.5%p / +11.2%p**, 그 이후 평탄.

> **메타 결론 E** — **N=4가 knee point**다. 현행 fanout 4관점 · review 패널 4관점은 **이미 문헌 최적**이며, 늘릴 근거가 없다. 항목 4는 "관점을 더 늘리자" 가 아니라 **"4관점의 증거 경로를 분기시키자"**(#125 제안 4)로 재정의해야 한다. 같은 모델 인스턴스를 늘리는 것은 [Are Diversity Metrics Measuring Diversity?](https://arxiv.org/html/2607.20768v1) 대로 중복도만 올린다.
>
> 보강: same-model persona 다양성의 오류 상관 ≈ 0.4 vs cross-model ≈ 0.08([arXiv:2507.11198](https://arxiv.org/abs/2507.11198)). → **model diversity를 완전 폐기하지 말 것.** 기존 문서의 R2(하이브리드) 결론이 여전히 유효하며, 항목 3의 불신을 근거로 Codex를 제거하는 것은 §2 메타 결론 B에 의해 **오귀속 기반 결정**이 된다.

---

## 6. 항목 1.5 — 제안된 chain은 지금 적용하면 문제를 2배로 만든다

제안: `meta search → plan-prd → plan → santa-loop → implement → code-review → prp-commit → santa-loop → pr`

santa-loop이 **2회** 삽입된다. 그런데 santa-loop은 현재:

- 라운드 캡이 **강제되지 않음**(산문에만 "Maximum 3", 카운터 없음 — #124 원인 3, 본 분석 §1에서 코드로 재확인)
- severity 축 **없음** — 문구·네이밍 선호가 criterion FAIL → NAUGHTY (#124 원인 1)
- 판정 원장 **없음** — 기각 항목이 매 라운드 재등장 (#124 원인 2)
- 라운드당 리뷰어 2명(Opus + codex xhigh), 비용이 라운드 수에 **선형**
- 리뷰 스코프가 delta가 아니라 고정 → **라운드 N의 수정이 라운드 N+1의 1급 표적**(#124 실측: 6라운드 중 4~6은 전부 직전 라운드가 넣은 코드)

> **메타 결론 F — 선후 의존이 강제된다.** #124(캡 강제 + severity contract + 판정 원장 + patch-chasing terminator)가 **먼저 착지하지 않은 상태에서 항목 1.5를 적용하면**, 발산하는 루프를 파이프라인에 2회 삽입하는 것이 되어 항목 2(시간)와 항목 3(불신)이 동시에 악화된다. **1.5는 #124 이후로 게이트**되어야 한다.
>
> 추가 판정: 두 santa-loop의 **역할이 달라야 한다.** implement 직후 = 코드 정합성, pr 직전 = ship 불변식. 같은 rubric을 두 번 돌리면 두 번째는 §4.2의 delta 문제를 정면으로 맞는다.

---

## 7. 항목 2 — 원인은 직렬화가 아니다

운영자 가설은 "동시 작업 / 순서 변경" 이지만, 코드 실측은 다른 곳을 가리킨다.

`/mccp:plan` PRD 모드 1회가 이미 발화하는 것:

| Phase | 발화 | 병렬 여부 |
|---|---|---|
| 2.5 fan-out | `mccp:fanout-*` **4 agent** | 병렬(`effort:'low'`) |
| 3.9 design-critique | retry loop **최대 3라운드** | 직렬 |
| 5.2 L2 승인 패널 | `mccp:review-*` **4 agent** | 병렬(Workflow) |
| 5 Plan-Codex | codex **1회, 최대 900s** | 직렬·blocking |

**이미 4-way 병렬이 두 구간에서 돌아 총 8 agent가 발화한다.** 각 구간 내부는 병렬이므로 병렬도를 더 올려도 wall-clock은 거의 안 줄고, 남은 직렬 구간은 (a) 두 병렬 구간 사이의 phase 순서, (b) codex 900s 단일 호출, (c) **라운드 반복**이다. 이 중 (a)는 게이트 의미상 순서를 바꿀 수 없다(GROUND가 승인 패널보다 먼저여야 함).

또한 [codex-invoke.js:66](../../plugins/mccp/scripts/lib/codex-invoke.js)의 900s는 **Bash 도구 상한 600s를 초과**한다(CLAUDE.md §3.13이 이미 인지 — plan-codex-runner를 detached + marker poll로 우회). 즉 codex 호출은 구조적으로 "기다릴 수밖에 없는" 구간이다.

> **메타 결론 G** — 항목 2의 지렛대 순서는 **① 계측 추가(duration 필드) → ② 라운드 캡 강제(#124) → ③ 델타 스코프(항목 6) → ④ 병렬도**다. 병렬도가 마지막인 이유는 이미 8-way이기 때문. **①이 없으면 ②③④의 효과를 측정할 수 없어 또다시 체감으로 돌아간다.**

---

## 8. 항목 5 — 백그라운드 프로세스 미회수 (독립 · 실재 확인)

코드로 확인됨.

| 위치 | 동작 |
|---|---|
| [dashboard-server.js:510-514](../../plugins/mccp/scripts/lib/dashboard-server.js) | `spawn(..., {stdio:'ignore', detached:true})` + `child.unref()` |
| [session-spawner.js:163-171](../../plugins/mccp/scripts/state/session-spawner.js) | `{detached:true, stdio:'ignore'}` + `unref()` |
| [plan-codex-runner.js](../../plugins/mccp/scripts/lib/plan-codex-runner.js) | codex 900s > Bash 600s 회피용 **detached runner** + marker poll |
| [hooks.json:344-356](../../plugins/mccp/hooks/hooks.json) `SessionEnd` | `session-end-marker.js` **단 1개**, `async:true` |
| `session-end-marker.js` | observer cleanup만 — **`process.kill` 호출 0건** |

→ SessionEnd는 **마커만 쓰고 자식 프로세스를 회수하지 않는다.** `unref()`는 부모가 먼저 종료할 수 있게 할 뿐 자식을 죽이지 않으므로, 운영자 관찰이 정확하다.

부분적 완화는 존재한다 — dashboard-server는 `.dashboard-server.pid` + `pidAlive()`로 재기동 시 중복을 감지하고, plan-codex-runner는 lease lock + `pidAlive`로 orphan을 판정한다. 즉 **PID 추적 기반 인프라는 이미 있고, 그것을 SessionEnd에 연결하는 회수기가 없을 뿐**이다.

> **메타 결론 H** — 항목 5는 설계 위험이 없는 **국소 결함**이다. 리뷰 루프 작업과 **의존 관계가 전혀 없으므로 병렬로 즉시 처리 가능**. 다만 3세션 연속 `.end` 마커 누락(본 세션 SessionStart 경고)이 관측되고 있어, 회수기 부재와 마커 누락이 같은 SessionEnd 경로에 있다는 점은 함께 볼 가치가 있다.

---

## 9. 항목 0·1 — 위생 항목 (독립)

**항목 0 (setup의 gitignore).** [setup.md](../../plugins/mccp/commands/setup.md) 5개 Phase 어디에도 `.gitignore` 축이 없다(Detect / codex / impeccable / codex:setup chain / report). 반면 이 repo의 `.gitignore`는 mccp 런타임 산출물 항목만 **약 20종**을 담고 있다 — `.claude/receipts/*`(+ ship receipt 예외 3줄) · `.claude/state/*.lock` · `loop-counter.json` · `orchestration-runaway.json` · `**/.claude/state/hook-trace/` · `hook-caps.json` · `.claude/cache/` · `.claude/state/dispatches/` · `.worktrees/` 등. **신규 사용자는 이걸 스스로 재발명할 수 없다.** 이 repo가 dogfood로 누적한 지식이 `/mccp:setup` 표면에 전혀 노출돼 있지 않다.
→ 판정: **실재하는 온보딩 결함.** 위험 낮음, 가치 명확. `.gitignore` 병합은 멱등(이미 있는 줄은 skip)으로 설계 가능해 setup의 idempotent 계약과 충돌하지 않는다.

**항목 1 (메타 정보 서칭 커맨드 + `_meta/` 저장).** 현재 `/mccp:*` 21개 커맨드 중 조사·기록 축은 **0개**다. `.claude/_meta/` 3문서는 전부 수작업 산출물이며, 본 문서도 마찬가지다. 즉 **패턴은 이미 3회 반복됐는데 도구가 없다**(diverse-agent-review 분석 · converged 재정의 · verification layer + 본 문서 = 4회).
→ 판정: **YAGNI를 넘긴 반복.** 다만 `.claude/_meta/`(기존) 와 `.claude/_meta/`(신규 지시) 가 **분기**했다. 둘 중 하나로 통일하지 않으면 대시보드 스캔과 상호 참조가 갈라진다 — **디렉토리 결정이 커맨드 설계보다 먼저**다.

---

## 10. 종합 — 의존 그래프와 권장 순서

```
[독립 · 즉시 착수 가능]
  항목 0  setup gitignore          ── 위험 낮음, 온보딩 가치
  항목 5  백그라운드 회수          ── 국소, 리뷰 루프와 무관
  항목 1  _meta 디렉토리 통일      ── 커맨드 설계 전 선결

[임계 경로 — 순서 강제]
  ①  계측 추가                     receipt duration + santa 라운드 카운터
       │                           (없으면 ②③④ 효과를 측정 불가 · §1, §7)
       ▼
  ②  #124 착지                     severity contract · 판정 원장 · 캡 강제
       │                           · patch-chasing terminator
       │                           (§3 문헌이 이 처방을 승인 · §6이 선후를 강제)
       ▼
  ③  #125 착지                     블라인드 레인 · plan/PRD 상시 스코프
       │                           · Reviewer B 부재 시 NICE 금지
       │                           (§2 — 항목 3의 진짜 축)
       ▼
  ④  항목 6  델타 리뷰             단, 메타 결론 D 불변식 필수
       │                           (기계적 스코프 O / pass 단언 X)
       ▼
  ⑤  항목 1.5 chain 변경           ②③④ 이후에만 안전 (§6)

[별도 트랙 — 이미 진행 중]
  항목 4  diverse-agent review     M1 complete · M2/M3 pending
                                   N=4가 knee (§5) → 관점 수 증설 금지
                                   증거 경로 분기로 재정의
```

### 재판정된 항목

| 항목 | 운영자 프레이밍 | 메타 판정 |
|---|---|---|
| 2 | "동시 작업/순서 변경으로 해결" | 이미 4-way 병렬 × 2구간. **라운드 수와 계측 부재가 원인** |
| 3 | "멀티 모델 불신" | **증거 공급 방식(스냅샷) 문제**. 모델 축 오귀속 (§2) |
| 4 | "관점 agent를 늘리자" | **N=4가 이미 최적**. 늘릴 게 아니라 **증거 경로를 분기** (§5) |
| 6 | "pass면 다음 리뷰 생략" | 방향 옳음. **"pass했다"를 리뷰어에게 말하면 탐지 16~93%p 붕괴** (§4.2) |
| 1.5 | "chain에 santa-loop 2회 삽입" | #124 **이전에 하면 문제 2배** (§6) |

---

## 11. 남은 미결 — 사람이 정해야 할 것

1. **`.claude/_meta/` vs `.claude/_meta/` 통일** — 본 문서는 지시대로 `_meta/`에 썼으나 선행 3문서는 `meta/`에 있다. 항목 1 커맨드 설계의 선결 조건.
2. **santa-loop을 receipt 체계에 넣을 것인가** — ~~가장 큰 미결~~ → **해소됨(2026-08-12).** [부록 §2](2026-08-12-prd-decomposition-addendum.md)가 뒤집었다: [diverse-agent-review-analysis.md](./diverse-agent-review-analysis.md) §1.3의 4축 경고는 그 문서가 작성된 뒤 ship된 diverse-agent-review M1이 `CROSS_MODEL_SOURCES = ['codex','hybrid']`로 **코드에 봉인**해 전부 닫혔다. 판정: `review_source='multi-agent'` · produces-only 감사 앵커로 **넣는다**.
3. **항목 3의 80%를 실측으로 전환할 것인가** — ①(계측)만 넣으면 다음 사이클부터 실수치가 나온다. 그 전까지 Codex 전략 변경 결정을 **보류할지** 여부.
4. **#124 제보자가 PR을 올리겠다고 했다** — 직접 구현 vs 제안 수용의 선택.

---

## Sources

**본 분석에서 신규 인용:**
- [Measuring and Exploiting Confirmation Bias in LLM-Assisted Security Code Review (arXiv:2603.18740)](https://arxiv.org/html/2603.18740v1) — bug-free framing 16~93%p 탐지 붕괴 · FN 편향이 FP 편향의 4~114배 · precision paradox · redaction 68.75% / debiasing instruction 93.75~100% 회복
- [Refute-or-Promote: Adversarial Stage-Gated Multi-Agent Review (arXiv:2604.19049)](https://arxiv.org/pdf/2604.19049) — refute 게이트 통과 시에만 finding 승격
- [Utilizing Precise and Complete Code Context to Guide LLM in Automatic False Positive Mitigation (arXiv:2411.03079)](https://arxiv.org/pdf/2411.03079) — 일부 기법 precision 10% 미만
- [A Roadmap for Modern Code Review (arXiv:2405.18216)](https://arxiv.org/html/2405.18216v2) · [Towards debiasing code review support (arXiv:2407.01407)](https://arxiv.org/pdf/2407.01407) — 인지 부하·편향
- [Incremental Changes in Code Reviews (HackerOne/PullRequest)](https://www.pullrequest.com/blog/incremental-changes-in-code-reviews-a-strategy-for-efficiency-and-clarity/) · [Code Review Best Practices That Scale (Augment)](https://www.augmentcode.com/guides/code-review-best-practices-that-scale) — SmartBear 400 LOC 임계 · Google 100 LOC 턴어라운드

**issue에서 승계 인용:** [Correlated Errors ICML 2025 (2506.07962)](https://arxiv.org/pdf/2506.07962) · [Multi-Agent Code Verification via Information Theory (2511.16708)](https://arxiv.org/html/2511.16708) — 에이전트 2·3·4 한계이득 +14.9/+13.5/+11.2%p · [Are Diversity Metrics Measuring Diversity? (2607.20768)](https://arxiv.org/html/2607.20768v1) · [The Deliberative Illusion (2606.03032)](https://arxiv.org/pdf/2606.03032) · [Emergence of Biased Consensus (2608.02827)](https://arxiv.org/html/2608.02827) · [Codified Context (2602.20478)](https://arxiv.org/html/2602.20478v1)

**선행 mccp 문서:** [diverse-agent-review-analysis.md](./diverse-agent-review-analysis.md) (논문 8편 + 타사 11사례) · [.claude/prds/diverse-agent-review.prd.md](../prds/diverse-agent-review.prd.md)

**코드 근거:** `santa-loop.md`(199행 산문, 백킹 스크립트 0) · `codex-invoke.js:66`(900s) · `hooks.json:344`(SessionEnd 단일 훅) · `session-end-marker.js`(kill 0건) · `dashboard-server.js:510` · `session-spawner.js:163` · `plan.md`(fan-out 4 + L2 패널 4) · `.gitignore`(mccp 런타임 20종) · `.claude/receipts/` 149건 전수 집계
