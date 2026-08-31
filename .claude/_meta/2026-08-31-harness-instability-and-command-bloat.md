# 하네스 구조 불안정성과 명령 본문 비대화 — 대범위 메타 분석

**Status**: active
**Date**: 2026-08-31
**Topic**: 하네스 구조 불안정성과 명령 본문 비대화 — 대범위 메타 분석

## Premises

| # | 참조 | 시점 | 무엇을 전제하는가 |
|---|---|---|---|
| 1 | plugins/mccp/commands/plan.md | d1db647 | 3,044줄 / 184,130바이트로 이 저장소의 CLAUDE.md(119,295B)보다 크다. bash fence 내부 1,610줄 중 주석이 587줄(36%)이고, 실효 기본값(`multi-agent`)에서 도달 불가한 codex 전용 구간이 816줄이다 |
| 2 | plugins/mccp/commands/work.md | d1db647 | `:715`가 `dispatch-fleet-partitions.json`을 참조하는데 그 파일을 쓰는 지점이 저장소 전체에 0건이다 — prep은 `dispatch-partitions.json`(`:224`)을 쓴다. 파일명 불일치 하나로 merge-apply escape 재확인이 조용히 미실행된다 |
| 3 | plugins/mccp/scripts/lib/plan-review/quorum.js | d1db647 | `:27` `DEFAULT_ROLES_MIN=3` 같은 default 리터럴이 코드에 실재하는데 env 색인은 미선언으로 표시한다. `MCCP_GATE_ROUND_CAP`을 읽는 코드가 `plan-review/` 전체에 0건이다 |
| 4 | plugins/mccp/scripts/lib/plan-review/corpus.js | d1db647 | 패널 레코드 집계 오라클. 실행하면 측정 가능 37건 중 quorum의 M·K가 binding이었던 건이 0이고 severity 게이트가 29건이다 — 손잡이는 무력하고 실제 승인 규칙은 severity다 |
| 5 | plugins/mccp/scripts/lib/env-contract/registry.js | d1db647 | 164 항목(`MCCP_*` 135 + 비-MCCP 29). `:194` 부근이 `MCCP_CONTEXT_MONITOR_COST_MODE`의 값으로 `off`를 선언한다 |
| 6 | plugins/mccp/scripts/hooks/ecc-context-monitor.js | d1db647 | `:60-65`의 파서가 전제 5의 `off`를 인식하지 않는다 — 이 저장소 운영자가 `.claude/settings.json`에 설정 중인 값이 무동작이다. registry에서 코드 방향으로의 역방향 검증이 0이라 잘못 전사된 enum이 "기계 검증된 거짓"으로 산다 |
| 7 | plugins/mccp/scripts/lib/msw-metrics/a3-instruction-cost.js | d1db647 | `measureA3`가 `claudePath`·`statePath`·`memoryIndexPath`만 받는다 — 명령 본문 11,080줄이 지시 비용 분모 밖이다 |
| 8 | plugins/mccp/scripts/lib/instruction-contract/lint.js | d1db647 | `:60` 부근이 before-state를 `:CLAUDE.md`로 하드코딩한다 — 이 저장소의 유일한 검증된 relocation ledger 기제가 CLAUDE.md 전용이고, 그보다 큰 `plan.md`는 사거리 밖이다 |
| 9 | .github/workflows/gitignore-drift.yml | d1db647 | CI가 실행하는 test는 `pr-phase-guard` · `pr-phase-lock-f11` · `gitignore-provision` 3개다. 저장소의 test 파일은 346개다(0.9%). workflow 파일은 2개이며, 이 파일 `:25-27`이 merge 차단은 외부 branch protection 설정이라고 스스로 제한한다 |
| 10 | plugins/mccp/scripts/receipt/validate-cmd.js | d1db647 | `pr.md:1301`·`:1318`이 "validators cross-check" PR body를 두 번 주장하는데 해당 코드가 0건이다 — `gh pr view` 호출이 `scripts/` 전체에서 hook test 2파일뿐이다 |
| 11 | plugins/mccp/scripts/lib/pr-phase-helpers/body-builder.js | d1db647 | require 지점이 자기 자신과 자기 test 2건뿐이고 `commands/*.md`에서의 참조가 0건이다 — 소비처를 헤더에 명시한 미배선 코드다 |
| 12 | plugins/mccp/scripts/state/state-writer.js | d1db647 | `:576` 부근이 lock 획득 실패 시 "proceeding without lock"으로 진행한다. 같은 fail-open 패턴이 5개 writer(`session-ledger.js:290` · `loop-counter.js:152` · `completion-ledger/store.js:204` · `meta-research.js:296`)에 잔존하며, 그중 completion-ledger는 git-tracked 감사 corpus의 writer다 |
| 13 | plugins/mccp/scripts/lib/evidence-audit.js | d1db647 | 현 corpus 판정이 `state=incomplete` · comparable 25 · unverifiable 19 · coverage 0.568 · exit 4다. baseline이 상시 비영점이라 20번째 dangling이 신호를 만들지 못하고, 이 도구는 어떤 hook·게이트에도 배선돼 있지 않다 |
| 14 | .claude/plans/codex-findings-backlog.md | d1db647 | 790줄 / 데이터 행 756. severity 분포는 CRITICAL 57 · HIGH 230 · MEDIUM 294 · LOW 106이고 흡수 마커는 32건(약 4.2%)이다. 소유자·기한·재등재 감지 키가 없어 같은 결함(백틱 미제거)이 최소 4회 재등재됐다 |
| 15 | docs/gate-design.md | d1db647 | 1,307줄 / `## ` 섹션 13개 — 회고 주석의 이전 목적지가 실재하고 이미 CLAUDE.md가 앵커로 참조하는 패턴이 확립돼 있다 |
| 16 | CLAUDE.md | d1db647 | 1,103줄 / 119,295바이트. M4 ship 시점(`f976b53`, 2026-08-10) 90,163바이트에서 21일 만에 감축분 68,850B의 42.3%인 29,132B가 재성장했다 — 성장 래칫이 없다 |

## Evidence

### 조사 방법

`origin/main` d1db647(v1.33.1)에서 분기한 전용 worktree에서 read-only로 수행했다. 서로를 모르는 10개 렌즈(반복 결함 고고학 · fail-closed 규율 · 상태·락·증거 내구성 · env 토글 census · 산문 대 강제 격차 · 비용 대비 검증 수익 · `plan.md` 전수 판독 · 나머지 4대 명령 본문 · 분해 기제 · hook 계층)를 병렬 투입하고, 각 렌즈의 findings를 인용 검증자가 적대적으로 재검증했다(기각분은 제거). 별도로 Codex(`gpt-5.6-sol`, `xhigh`, `--sandbox read-only`)가 같은 트리를 독립 재탐색해 하네스 축과 명령 본문 축을 각각 조사했다. 아래 수치는 두 계열이 독립적으로 산출한 것이며, 충돌 지점은 그대로 기록한다.

### A. 강제 피라미드의 최전선이 산문이다

강제의 상층(오라클·스키마·락)은 정교한 fail-closed 기계지만 최종 단은 전부 산문이다.

- terminal ship gate의 `exit 12`는 `pr.md` 본문 블록이 호출해야만 실행된다.
- `git push`를 보는 유일한 hook은 리마인더 두 줄 후 exit 0이고(`plugins/mccp/scripts/hooks/pre-bash-git-push-reminder.js:12-19`), `gh pr create`를 막는 hook은 없다.
- 명령 본문의 규범 마커(절대/반드시/MUST/금지/항상/NEVER)는 22파일에 64건인데, 그중 상당수의 유일한 강제 수단이 그 문장 자체다.
- test 346개 중 CI가 도는 것은 3개(전제 9). "단일 커밋 불변식" 같은 짝 단언이 커밋 시점에 기계 검증되지 않는다.

이 이음매에서 "선언은 참, 실행은 0"이 반복 생산됐다 — hybrid L3 죽은 배선, 캡 1 아래 R13 실측, cost STOP 구조적 발동 불가, `dispatch_chain_aborted`의 production emitter 0건, 전제 10의 거짓 강제 주장, 전제 11의 미배선 코드, 전제 2의 파일명 오타 하나로 죽은 escape 재확인.

### B. 핵심 가치가 실측상 꺼져 있다

`§1.2`가 선언한 cross-model dual review의 실제 운용:

| 지표 | 값 |
|---|---|
| ship receipt corpus (git-tracked `mccp-pr-codex`) | 71건 |
| `codex_verdict` 분포 (필드 보유 49건) | converged **7** / divergent 9 / skipped 33 (legacy 무필드 22) |
| 마지막 converged | 2026-07-08 ~ 07-14 구간에 7건 전부 집중 |
| 이후 6주 ship | `codex_disabled_at_pr` 25 · audited skip 14 · force override 5 |
| cross-gate dedupe 실측 발화 | **0건** |
| plan 게이트 L3(Codex) 발화 | **0 / 37** |
| receipt 전수 findings·round | **85 / 85** 가 `findings=[]`, `round=1` (실제로 R6까지 돈 receipt 포함) |

동시에 dogfood 설정은 전방위 완화다 — `soft` mode · 패널 정족수 3→1 · 서브에이전트 haiku · gateguard 2훅 off · 비용 임계 10배. CLAUDE.md는 그중 `soft` 하나만 자인한다. 완화 채널이 축별로 독립(env · settings · hook disable)이라 **합성 상태를 아무도 설계하지 않았고 렌더하는 표면도 없다**. `MCCP_DISABLED_HOOKS`는 "for local debugging"으로 도입돼(`36fb0d5`, 2026-06-17) 2.5개월 영구화됐고 diff에 사유가 없다.

결론: 이 저장소가 자기 게이트에 대해 수집한 모든 실측 — 패널 라운드, quorum 캘리브레이션, ship corpus — 은 **완화 조합 위의 측정**이다.

### C. 감사 채널이 자기신고다

기록자와 피감사자가 같은 프로세스이고 필드가 성공 방향 기본값으로 채워진다. 실사고 3건이 이미 있다(`resolution.converged` always-true, ambient `codex_disabled`를 proof로 인정, completion-ledger 승인 술어 실오류율 30%). 지금도 열려 있는 것:

- `schema.js` skeleton의 `security_skipped:false` — 게이트를 조용히 생략하면 "수행됨" 형상이 된다. 무신고는 통과가 기본이다.
- intent 축이 닫은 CLI 위조 표면(`--intent-*` 0건)이 codex 축에는 열려 있다 — `write.js`가 `--codex-verdict`를 무검증 stamp하므로 셸 한 줄로 Codex 발화 없이 dedupe가 열린다.
- 전제 13의 evidence-audit가 상시 exit 4 baseline이고 미배선이다.
- 우회 사유문이 보일러플레이트 재사용이다 — `'permanent'` 9건, `'token cap'` 6건. 형식 통과 장치가 됐다.

### D. 리뷰 경제에 수렴 장치가 없다

- 패널 wall-clock: 측정 가능 37건 합계 **12.14시간**, 중앙값 8.0분, 최대 **427.4분**.
- quorum 손잡이 M·K는 평가된 29건 **전부 non-binding**(전제 4). K를 3→1로 낮춘 자연 실험에서도 승인 빈도 불변. 유지비만 남은 장식이다.
- 패널 verdict: converged 5 / divergent 31. 차단 32건 중 **16건(50%)이 단일통과로 우회**됐다.
- MSW M7은 최소 12라운드에 blocking 7→8→5→9→11→2로 비수렴, 종착은 `deadline_pressure` bypass였다. r1~r5 레코드는 덮어쓰기로 소실됐다.
- 그 findings의 종착지인 backlog는 흡수율 약 4.2%(전제 14)다. 탐지에는 계속 지불하는데 탐지→수리 전환이 안 된다.
- timeout이 전형의 5배다 — codex 900s, adjudication 30분. 실패 경로마다 세션이 그만큼 잠긴다.

### E. 명령 본문 비대화 (운영자 개인 질의 축)

**규모** — 22파일 11,080줄, top-5(`plan` · `prp-implement` · `pr` · `santa-loop` · `work`)가 8,244줄로 74%. `plan.md`는 전제 1대로 CLAUDE.md보다 크다. 성장 궤적은 297줄(2026-06-03) → 811 → 1,364 → 2,342 → 3,044로 3개월 10배이고, 커밋 56회다.

**지금까지의 "추출"은 감축이 아니었다** — 추출 커밋 3건이 전부 `plan.md` 순증이다: `7ce8857` +363/-9 · `ec57467` +246/-53 · `0480afe` +262/-43. 로직은 옮겼는데 본문에 서사를 더 붙였다.

**구성** (두 계열의 독립 분류)

| 축 | Codex 계열 | 렌즈 계열 |
|---|---|---|
| 역사·회귀 설명 | 3파일 1,308줄 (20.4%) | 5파일 bash 주석 1,286줄, 대부분이 라운드 회고(`R1 F3` · `santa-loop R3` · `7th round`) |
| 즉시 안전 삭제 가능 | 약 71줄 | — |
| 도달 불가 | 2줄 (`background` action) | `plan.md`의 약 36%(~1,100줄, codex 816 + hybrid ~260) |
| 중복 | ≥30자 동일 줄 672 출현 | 파일 쌍 동일 라인 plan↔prp-implement 157 · prp-implement↔pr 83 · plan↔pr 82 |

두 계열의 "도달 불가" 수치가 갈리는 것은 정의 차이다 — Codex는 **오라클이 반환할 수 없는** action만 셌고, 렌즈는 **현재 기본값에서 진입하지 않는** 경로를 셌다. 후자에 대해 검증자가 정정을 냈다: codex 경로는 판독 불가 fallback(DD7)이자 패널 예산 고갈 시 본문이 권하는 복구 경로이므로 **죽은 텍스트가 아니라 상주 비용을 내는 비상 경로**다. 처방이 다르다 — 삭제가 아니라 모드별 분리 로딩이다.

**팽창 엔진 셋**

1. **shell 상태가 fence를 못 넘는 아키텍처**가 halt마다 보일러플레이트를 강제한다 — `REVIEW_DIR` 재파생 18회, `MCCP-GATE-STOP` 40회. halt 수에 선형 비례한다.
2. **본문의 changelog 겸직** — provenance 마커가 `plan.md` 25 · `pr.md` 16건. 회고가 실행 문서 안에 산다.
3. **감축 장치의 부재** — CLAUDE.md에는 relocation ledger + lint + baseline이 생겼는데 그보다 큰 `plan.md`에는 예산·래칫이 0이고, 그 lint조차 전제 8대로 사거리 밖이다. 전제 16대로 CLAUDE.md 자신도 래칫이 없어 감축분의 42.3%를 21일 만에 도로 먹었다. 그리고 전제 7대로 명령 본문은 애초에 지시 비용 분모에 없다.

**검증 사각** — inline `node -e`가 5대 본문에 240건이다. JS in bash in markdown의 3중 중첩이라 어떤 unit test도 닿지 않는다.

**여지** — 4대 블록→CLI 치환 후보(fan-out resolve 144줄 · 5.6 seal 248줄 · preflight 4연속 ~130줄 · RECOVER 중복 89줄×2)만으로 약 525줄 순감, 회고 주석의 `gate-design.md` 앵커 이전으로 약 575줄, 모드별 분리 로딩으로 약 1,100줄. 보수적으로도 `plan.md`를 절반 이하로 만들 수 있고, 줄어드는 것이 정확히 "주석 달린 미검증 glue"라 위험 총량도 함께 준다.

### F. env 계약의 역방향 검증이 0이다

registry 164 항목, 런타임 표면 분모 117, `MCCP_*` 고유 토큰 190. 모든 검사가 registry를 참으로 가정하므로 registry→코드 방향 검증이 없다. 실증 3건: 전제 5·6의 무동작 값(**운영자 자신이 설정 중**), `MCCP_HOOK_PROFILE`의 선언값 3개 중 2개를 파서가 기각, `MCCP_BRIEFING`의 `'always'`가 코드에 0회. enum 전수 스윕은 미측정이고 후보만 8건이다.

사용 이력 기반 은퇴는 구조적으로 불가하다 — env-snapshot 6개에서 `used_toggle_count`가 20/117이고 그중 15는 `settings.json` 정적, 4는 internal, ad-hoc 사용 기록은 **0건**이다. escape류는 SessionStart 단발 캡처에 원리상 안 잡힌다. 86일에 117개 표면이 단방향으로 늘었다.

## Prior Art

**미조사.** 외부 문헌 조사를 이 사이클에서 수행하지 않았다. 판정 근거는 전부 저장소 코드·산출물 실측이다. 리뷰어 이질성 축의 문헌 근거는 [diverse-agent-review-analysis.md](diverse-agent-review-analysis.md)가 이미 보유하며 본 조사는 그것을 재사용하지도 갱신하지도 않았다.

## Precedent

- [2026-08-12-review-loop-meta-analysis.md](2026-08-12-review-loop-meta-analysis.md) — receipt 149건 전수로 **계측 부재**를 단일 근인으로 지목했다. 본 조사는 계측이 그 뒤 실제로 생겼음을 확인하되(전제 4의 corpus 오라클 · toggle-snapshot · evidence-audit · env-contract lint), **계측이 붙었는데도 그 계측 결과를 소비하는 회로가 없다**는 한 겹 안쪽을 지목한다. 그 문서의 전제는 무효화되지 않았고 다음 층이 열린 것이다.
- [2026-08-12-prd-decomposition-addendum.md](2026-08-12-prd-decomposition-addendum.md) — 파일 소유권이 병렬 가능성을 정한다는 판정. 아래 방향들의 PRD 분할에 그대로 적용한다.
- [2026-08-31-remaining-issue-disposition.md](2026-08-31-remaining-issue-disposition.md) — 같은 날 수행한 자매 조사. 남은 issue 4건의 처분을 다루며, 그 PRD A(`plan-artifact-contract`)가 본 문서 방향 1의 부분집합이다. 두 문서는 중복이 아니라 입구가 다르다 — 저쪽은 이슈에서, 이쪽은 저장소 전수에서 출발했고 방향 1에서 만난다.
- [diverse-agent-review-analysis.md](diverse-agent-review-analysis.md) — Status가 "부분 무효"다. 본 조사의 B절 실측(L3 발화 0/37, converged 7/71)이 그 문서의 하이브리드 결론에 대한 **사후 관측**이므로 Status 갱신을 제안한다.

## Verdict

**한 문장**: mccp의 강제 피라미드는 상층(오라클·스키마·락)은 정교한 fail-closed 기계지만 최전선(push · PR 생성 · 라운드 집행 · CI · 핵심 cross-model 리뷰)은 산문과 완화된 설정 위에 서 있어 "게이트가 존재한다"는 참이고 "게이트가 출하 강도로 돌고 있다"는 거짓인 상태가 기본 운용이 됐다 — 그리고 그 gap을 가장 정직하게 측정·기록해 온 것 역시 이 저장소 자신이다.

### 개선 방향 (우선순위 순)

| # | 방향 | 무엇을 닫는가 | 비용 | 핵심 위험 |
|---|---|---|---|---|
| 1 | **강제 최전선의 기계화** — 산문 chokepoint를 도구·CI 계층으로 이관 | A절 전부. markdown 산문 / Node 코드 / test 3계층의 이음매에 링커·타입체커가 없다 | 큼 | — |
| 2 | **실효 게이트 강도의 단일 표면** — 재점화 또는 재선언 | B절. 완화 조합의 합성 상태가 렌더되지 않는다 | 렌더는 저비용, 재정렬은 판단 비용 | 강도를 올리면 방향 4 미해결 시 8시간/plan 발산 재발 |
| 3 | **감사 채널의 판별력 복구** — 자기신고에서 생산자-검증으로 | C절 | 중간 | CLI 봉쇄가 수동 복구 UX를 좁히면 운영자가 더 큰 우회로 밀린다 |
| 4 | **리뷰 경제 재설계** — 라운드 기억 · 장식 손잡이 제거 · backlog 회수 루프 | D절 | 중간~큼 | 라운드 기억 주입이 리뷰어 독립성(§3.13의 구조 분리 원칙)과 긴장 |
| 5 | **명령 본문 다이어트** — 예산 · relocation ledger · 블록→CLI 치환 | E절 | 큼, 그러나 분할 가능 | fence 병합·산문 이전은 현행 정적 test가 못 잡는 파손 클래스 |
| 6 | **공유 기판 단일화** — 경로 정규화 · 락 정책 · STATE 스코프 · fail-open 계수 | 전제 12·13, cwd-상대 결함 재발 | 중간 (신설보다 수렴) | 경로 모듈 치환의 회귀 표면이 넓다 |
| 7 | **env 계약의 역방향 검증과 표면 래칫** | F절 | 작음~중간 | 봉인 arming 자체가 산문이라 방향 1 없이는 반쪽 |

**방향 1이 rank 1인 이유**: 나머지 여섯 방향의 수리 자체가 결국 배선이라, 이 방향이 서지 않으면 나머지 수리도 같은 방식(선언은 참, 실행은 0)으로 죽는다. hybrid L3와 budget 게이트가 이미 그렇게 죽은 채 출하됐다.

**방향 5의 안전 조건** — 감축 단위는 **블록→CLI 치환만**이다. 선행 조건 둘: (a) 전제 8의 lint before-state 파라미터화(한 줄), (b) 본문별 relocation ledger. 이 둘 없이 산문을 문서로 이전하는 것은 금지다 — 현행 정적 test는 green인 채로 nonce 가드와 산문 의무가 죽는 파손을 못 잡는다. 회고 주석의 이전 목적지는 전제 15로 이미 실재하고, 상한 래칫은 `EVIDENCE_DEBT_CEILING`(상수 + 짝 test) 선례를 그대로 쓴다.

### 렌즈 간 모순 (봉합하지 않고 기록한다)

- `MCCP_GATE_ROUND_CAP=3`을 한 렌즈는 "게이트 완화"로, 검증자는 "리뷰 허용량 증가"로 읽었다. §3.16의 실무 기본(1라운드)에서 보면 **"1라운드 정책의 기계 강제 해제"** 라는 제3의 독법이 정확하다.
- 한 렌즈는 receipt를 "내용 0바이트 껍데기"로 판정했는데, 다른 렌즈는 바로 그 corpus를 전수 계수해 B절 표를 복원했다. receipt는 "리뷰가 무엇을 찾았나"는 안 나르지만 "무엇이 skip·override됐나"는 정직하게 나른다 — 감사 가치가 0이 아니라 절반이고, 그 절반이 이번 분석의 최고 증거원이었다.
- "추출 커밋마다 본문 순증"과 "처방은 다시 추출"은 모순이 아니라 **구분 요구**다. 지금까지는 "로직 이동 + 본문 서사 추가"였고 필요한 것은 "블록→호출 치환"이라는 다른 연산이다. 이 구분 없이 PRD를 쓰면 궤적이 반복된다.
- hook의 fail-open을 두 렌즈는 "합리적 trade-off"로 수용하고 한 렌즈는 "PRD가 구조적 취약으로 지목한 결함 자체"로 인용한다. 가를 기준은 **실패가 계수·가시화되는가**인데, 그 기준을 명시 적용해 두 판정을 통일한 렌즈는 없다.
- CLAUDE.md의 코드-행동 주장은 스팟체크 10건 중 10건 정확했는데, 같은 조사가 명령 본문에서는 거짓 강제 주장(전제 10)을 확정했다. 모순이 아니라 **사각의 지도**다 — 자기교정 lint의 대상이 CLAUDE.md뿐이라 다음 거짓 주장도 `commands/*.md`에서 생길 확률이 높고 그것을 잡을 lint는 현재 0건이다.

### 실제로 건강한 것

정직하려면 이것도 적어야 한다.

- **자기교정 문서 규율이 작동한다.** CLAUDE.md 코드-행동 주장 스팟체크 10/10 정확, PRD 41건 중 15건이 자기정정 명시. 이번 분석 증거의 절반이 저장소 자신의 자인에서 나왔다는 것이 그 규율의 증명이다.
- **측정 인프라가 실재하고 자기 기계를 겨눈다.** 전제 4의 corpus 오라클이 quorum 손잡이의 non-binding을 **스스로 계측해 보고했다**. 자기 손잡이를 장식이라고 판정하는 저장소는 드물다.
- **fail-closed 오라클 코어의 코드 품질.** codex-invoke 14종 enum이 주석과 1:1 정합, ship gate의 no-ship 집합, evidence-lock의 실패 정책 반전과 그 이유의 명문화, intent 축의 CLI 표면 봉쇄. 문제는 이 계층이 아니라 그 위·아래 이음매다.
- **검증된 분해·격리 기제가 이미 사내에 있다.** `l3` 무권한 서브커맨드("이중 writer는 부재로 닫는다"), `intent-arbiter`의 `tools:[Write]` 능력 제거형 격리, detached runner의 nonce 봉인, 공유 오라클 + 배선 test, extract-and-execute e2e 패턴. 감축·기계화 방향의 부품을 새로 발명할 필요가 없다.
- **이연 원장은 "조용히 버리지 않는다"를 달성했다.** 756행 보존, 파서가 건너뛴 행을 `invalid_count`로 계수하도록 이미 수리. 미달성은 회수 루프이지 보존이 아니다.
- **사고를 계약으로 승격하는 회로가 있다.** 머지 파일 드롭 → §3.5.1 삭제 검증 의무, env 해제 사고 → `codex-policy.js` 봉인, CL-5 → session-identity 단일 체인 + 스캔 test. 재발 방지가 산문에 그치지 않고 기계까지 간 사례가 축마다 최소 1건씩 있다 — **이 회로를 축 1개가 아니라 계급 전체에 일반화하는 것**이 위 방향들의 요지다.

## Open Questions

- **방향 2의 갈래 선택은 운영자 결정이다.** codex token cap이 영구 정책이라면 (a) cross-model 발화를 terminal PR 1점으로 집중하고 재원을 fan-out 4→2~3 축소분에서 마련하거나, (b) §1.2 선언을 "조건부 cross-model"로 정정한다. 조사는 어느 쪽도 대신 고를 수 없다 — 다만 실측상 이미 (b)의 상태이고 문서만 아니라고 말하는 중이라, 위험은 정직화가 아니라 현상 유지 쪽에 있다.
- **fail-open 정당성의 통일 기준.** "실패가 계수·가시화되는가"를 기준으로 채택할지, 계층별 재량을 유지할지가 미결이다. 채택하면 205라인 / 98파일의 fail-open 분기 전수에 계수 의무가 붙는다.
- **enum 역방향 lint(L11)의 면제 목록 관리.** 의도적 legacy 어휘(`notify`/`notification` 류 하위호환)를 오검출하므로 면제가 필요한데, 그 면제 목록이 또 화석화되지 않으려면 래칫이 필요하다 — `EVIDENCE_DEBT_CEILING`이 같은 문제를 이미 풀었으므로 그 형태의 재사용 여부만 정하면 된다.
- **명령 본문 예산의 분모 정의.** 전제 7대로 A3 분모에 본문이 없다. 넣으면 M4가 봉인한 baseline(`a3-baseline.json`, 159,013B)의 의미가 바뀌므로, 별도 지표로 세울지 분모를 확장할지 결정이 필요하다. 확장은 봉인 재작성이라 `multi-session-work-loop` 축의 동의가 선행이다.
- **모드별 분리 로딩의 기제.** `plan.md`의 codex 816줄 + hybrid 260줄을 조건부로 로드할 수단이 Claude Code에 있는지 미확인이다. 없다면 방향 5의 최대 항목(~1,100줄)이 성립하지 않고 남는 것은 블록 치환 525줄 + 앵커 이전 575줄이다.
- **`santa-loop.md`의 재비대.** `2026-08-12-prd-decomposition-addendum.md`의 P0 당시 199줄이었고 thin caller가 목표였는데 978줄이다. 추출을 했는데 본문이 5배가 된 것이 E절 "추출은 감축이 아니었다"의 가장 선명한 사례인지, 다른 요인이 있는지 미분석이다.
- **완결성 비평 미완.** 본 조사의 마지막 단계(어느 디렉토리를 아무 렌즈도 읽지 않았는가)가 세션 중단으로 미완료다. 확인되지 않은 사각으로 `plugins/mccp/skills/` 47종 · `plugins/mccp/agents/` · `docs/` 하위 다수가 남는다.
