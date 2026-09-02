# 남은 open issue 4건(#127·#128·#129·#130) 통합 처분 조사

**Status**: active
**Date**: 2026-08-31
**Topic**: 남은 open issue 4건(#127·#128·#129·#130) 통합 처분 조사

## Premises

| # | 참조 | 시점 | 무엇을 전제하는가 |
|---|---|---|---|
| 1 | plugins/mccp/commands/plan.md | d1db647 | `:503`의 Task별 `**Validate**: {command that proves correctness}`가 자유 문자열이고, `:505-508`의 `## Validation` 블록에 셸 규율 요구가 없으며, `:514-518`의 Acceptance가 상수 boilerplate 4줄이다 |
| 2 | plugins/mccp/scripts/lib/plan-review/l1-check.js | d1db647 | 검사 9종 중 경로 축(C2 `:294-324` · C3 `:326-336` · C5 `:350-357` · C6 `:359-373`)만 fs 대조 content 검사이고, Validate 축 C4(`:339-348`)는 정규식 존재 검사뿐이다. 모듈 계약은 `:20` "NEVER throws" + `:11-14` 3-verdict + LLM-free이며 `:5`대로 L2를 short-circuit하는 게이트키퍼다 |
| 3 | plugins/mccp/commands/santa-loop.md | d1db647 | `:921-926` Step 6이 seal 성공 + 양 리뷰어 PASS만으로 `git push -u origin HEAD`를 실행하고 사람 단계가 없다. `:455-468` 리뷰어 반환 스키마는 verdict/checks/critical_issues/suggestions 4키뿐이고, `:492`가 스코프 밖 관측을 suggestions로 보내라고 명시한다 |
| 4 | plugins/mccp/scripts/lib/plan-review/perspectives.js | d1db647 | `:53-56` REVIEW_SCHEMA가 `additionalProperties: false`라 미선언 키가 거부된다 — 신규 버킷은 스키마 개정 없이는 실을 수 없다 |
| 5 | plugins/mccp/scripts/lib/santa/gate.js | d1db647 | `:245-246` `issueIdOf`가 claim 텍스트 해시를 키로 쓰고, `:235` 주석이 "이 키는 패러프레이즈에 뚫린다(DD5)"를 자인한다 |
| 6 | plugins/mccp/scripts/lib/santa/ledger.js | d1db647 | `:20` 원장이 `.claude/state/santa-loop/<decision-slug>.json`이며 gitignored·0o600이다 — 판정·suppression·라운드 카운터가 decision 경계를 넘지 못한다 |
| 7 | plugins/mccp/scripts/lib/plan-review/quorum.js | d1db647 | `:175-181`이 bare `verdict='fail'`을 `severity:'FAIL'` blocking finding으로 합성한다 — CLAUDE.md §3.14의 해제 조건이 아직 충족되지 않았다 |
| 8 | .claude/prds/diverse-agent-review.prd.md | d1db647 | milestone #1.5(패널 intent adjudication)가 pending이고, PRD가 배선 증설을 #5(게이트 배선 오라클 추출) 뒤로 미루는 이유를 "seam 결함 재생산"으로 명시한다 |
| 9 | .gitignore | d1db647 | `:117-118`이 `ECC/`를 무시하고, 그 트리가 워킹 트리와 HEAD 양쪽에 실존하지 않는다 — CLAUDE.md §2의 "참고용/diff용 보존" 서술이 현재 거짓이다 |
| 10 | plugins/mccp/scripts/lib/state-store/index.js | d1db647 | require가 MODULE_NOT_FOUND로 실패한다(sql.js 미설치, 저장소에 package.json 없음) — 완전 휴면 코드다 |
| 11 | .claude/_meta/2026-08-12-prd-decomposition-addendum.md | 2026-08-12 | 판정 3a: PRD 병렬 가능성을 정하는 것은 논리적 묶음이 아니라 파일 소유권이다 |
| 12 | CLAUDE.md | d1db647 | §3.11 C2 — PRD는 전 milestone이 complete/dropped일 때만 아카이브된다. §3.16 — 리뷰는 1라운드가 기본이고 캡을 1로 되돌리면 그 판단이 기계적으로 강제된다 |

## Evidence

### 조사 방법

`origin/main` d1db647(v1.33.1)에서 분기한 전용 worktree `.worktrees/meta-research-consolidation`에서 read-only로 수행했다. 6개 open issue 전부를 이슈별 감사 에이전트 + 독립 회의론자 2인(인용 검증 축 · 의도 검증 축)으로 판정하고, 남은 4건에 대해 4개 렌즈(생성 계약 · 수용 권한 · 상류 델타 · 공통 근인 검정)를 병렬 투입했다. Codex(`gpt-5.6-sol`, `model_reasoning_effort=xhigh`, `--sandbox read-only`)가 같은 트리를 독립 재탐색해 하네스 축을 별도로 조사했다.

### 이미 닫은 2건

| 이슈 | 판정 | 근거 |
|---|---|---|
| #155 impeccable 탐지 | FULLY_RESOLVED, 반박 0/2 | `impeccable-detect.js:62-63`이 하드코드 리터럴을 prefix 패턴으로 교체(`:263-264` 매칭). `resolveImpeccable()`가 invocation/source/version/path/sources/shadowed/eclipsed 반환. `setup.md`에 `npm install -g impeccable` 0건. 배너가 PATH probe 대신 skill resolution을 읽음(`session-start.js:1083`) |
| #137 plan-codex 0 findings | MOSTLY_RESOLVED, 반박 0/2 | `plan-review/decide.js:60` `DEFAULT_MODE = 'multi-agent'` — 기본 plan 게이트가 Codex를 부르지 않으므로 전제가 소멸. `plan-codex-runner.js:449`가 스킵 판정 이전에 finding을 git-tracked 레지스트리에 기록 |

#137은 잔여 4건(implement 전용 skip 토글 · `codex_raw_finding_count` · implement-Codex finding 미기록 · opt-in 경로 재탐색 보장이 외부 companion 의존)의 행선지를 close 코멘트에 명시하고 닫았다.

### 남은 4건의 실측

**#127 — plan 산출물 계약.** 전제 1·2 그대로다. 이슈 제기 이후 `plan.md:518`에 라이브 완주 요구 1줄이 추가돼 부분 전진했으나(`:521-525`가 "The last item is not boilerplate"로 그 의도를 명시) per-task gate 매핑은 없고, 8층위 결함 분류는 저장소 어디에도 없다(대상 3파일 grep 0건). 명령 본문 전체에 `set -euo pipefail`이 **0건**이며, `.claude/plans/codex-findings-backlog.md`에 acceptance 계약 결함이 CRITICAL 2건 포함 23행 이상 침전돼 있다 — 6개 PRD에 걸쳐 반복됐다.

**#128 — 상시 불변식 주입 채널.** `out_of_scope` 문자열이 저장소 전체(워크트리 5곳 포함) **0건**이다. 버킷을 만들려면 두 리뷰 시스템 최소 10파일을 관통해야 한다: 패널 경로는 `perspectives.js` REVIEW_SCHEMA(전제 4) → `quorum.js` `isUsableResult`/`decideQuorum` → `record.js` → `backlog-append.js`(현재 `quorum.blockingFindings` 고정 적재, `:210-212`) → `cli.js` findings emit, santa 경로는 `santa-loop.md` 스키마 → `gate.js` `analyzeReviewers` → `adjudication.js` → `agents/code-reviewer.md`.

**#129 — ECC 상류 델타.** 중심 전제(santa-* PRD 진행 중이니 지금 포팅이 싸다)가 사멸했다 — santa-* PRD 4종이 전부 `.claude/prds/archived/`에 있다. 더 결정적으로 **대조 원본이 디스크에 없다**(전제 9). 잔여 6건 중 4건은 할 가치가 없다고 판정됐다(아래 Verdict).

**#130 — santa-loop 무인 push.** 가장 위험했던 결합은 닫혔다 — terminator(`santa-loop.md:762-787`)가 escalation + exit 1로 Step 6에 도달하지 않고, Step 5.5 seal 게이트(`:857-905`)가 non-converged를 차단한다. 그러나 핵심 전제는 그대로다: `:926`이 여전히 `git push -u origin HEAD`를 실행하고, `SANTA_AUTO_PUSH`는 저장소 전체 0건이며, 브랜치 가드가 없어 main에서 돌리면 main을 push한다(CLAUDE.md §3.5의 "main 직접 push 금지"는 산문뿐). 이슈가 요청한 A/B/C 결정 자체가 아직 내려지지 않았다.

## Prior Art

**미조사.** 외부 문헌 조사를 이 사이클에서 수행하지 않았다. 이슈 #137 본문이 인용한 문헌 6편(MAD · Self-MoA · PoLL · self-preference · ensemble · CriticGPT)은 리뷰어 이질성 축의 근거이며 본 조사의 처분 판정에는 사용하지 않았다 — 판정 근거는 전부 저장소 코드 실측이다.

## Precedent

- [2026-08-12-review-loop-meta-analysis.md](2026-08-12-review-loop-meta-analysis.md) — 운영자 제기 8항목 중 4개만 단일 결함(계측 부재)으로 묶고 나머지는 분리했다. 본 조사가 같은 패턴에 도달했다: 4건 중 3건이 혼성 축을 공유하고 1건(#129)은 다른 성격이다.
- [2026-08-12-prd-decomposition-addendum.md](2026-08-12-prd-decomposition-addendum.md) — 전제 11. 본 조사의 그룹핑 판정이 이 선례를 직접 적용한 결과다. 이 문서의 전제는 여전히 유효하다(P0 실체화 완료 후 P1·P2·P3가 실제로 병렬 ship됨).
- [2026-08-22-impeccable-plugin-channel-migration.md](2026-08-22-impeccable-plugin-channel-migration.md) — #155의 조사 문서. 그 축이 이번에 종결됐으므로 **Status를 갱신할 것을 제안한다**(이 커맨드는 남의 문서를 임의로 고치지 않는다).

## Verdict

### 1. 단일 PRD는 성립하지 않는다

사용자 목표("남은 issue를 한번에 처리할 수 있는 PRD")를 문자 그대로 PRD 1개로 옮기면 세 가지가 반증한다.

1. **파일 소유권이 이슈 경계와 어긋난다**(전제 11). #127의 착지 파일(`plan.md` 템플릿 절 + `l1-check.js`)은 나머지 셋과 공유 파일이 0개인 반면, #128의 santa 절반과 #130은 `santa-loop.md` 한 파일에서 충돌한다(`:455-468` 스키마 vs `:921-926` push).
2. **인질 비용**(전제 12, §3.11 C2). #129는 전제가 죽었고 backlog 압력 0행, #130은 결정 1건 + 소규모 diff다. 이 둘을 milestone 행으로 넣으면 backlog 압력이 최대인 #127의 종결이 죽은 조사와 즉결 결정에 묶인다. `review-loop-trust` umbrella가 자식 7개 ship 후에야 아카이브되는 현행 관측이 그 비용의 실물이다.
3. **기존 PRD와의 중복**(전제 8). #128의 패널 절반은 `diverse-agent-review` #1.5와 메커니즘·주입 지점이 동일하다. 신규 PRD로 만들면 같은 채널을 두 번 만들고 그 PRD 자신의 순서 규칙을 위반한다.

**공통 근인은 3+1이다.** #127·#128·#130은 "게이트 계약이 토큰만 검사한다 — L1 C4는 Validate 줄의 *존재*를, seal은 verdict *문자열*을, 리뷰어 스키마는 4키 *형태*만 보고, 내용(그 명령이 실제로 게이트인가)과 권한(그 출시를 누가 승인하는가)은 어디서도 검사되지 않는다"는 축을 공유한다. #129는 이 축에 들어가지 않는다 — 전제가 죽은 upstream triage 부채이고 잔여 6건의 성격이 제각각이다.

### 2. 제안 형태 — PRD 2개 + 편입 1건 + 본 문서로 종결 1건

**PRD A `plan-artifact-contract` (#127 단독, #129-1 프레임 흡수) — 최우선**

소유: `plugins/mccp/commands/plan.md`(PRD Artifact Output 절 `:451-525` 한정) · `plugins/mccp/scripts/lib/plan-review/l1-check.js` + 그 test.

| M | 이름 | Outcome |
|---|---|---|
| 1 | 템플릿 계약 강화 + loop-design-check 5규율 프레임 흡수 | Validate 줄이 '게이트 계약'으로 재정의된다 — per-task acceptance 매핑, counterfactual 요구(성공만이 아니라 실패도 증명), 8층위 결함 분류표. 스킬 파일 포크가 아니라 저작 계약으로 흡수 |
| 2 | `l1-check.js` C4 내용화 | 상수/placeholder Validate 거부 · Validation 블록 기초 lint · Acceptance 상수 boilerplate 검출. NEVER-throws + 3-verdict + LLM-free 계약 유지. 리뷰어 표면 무접촉 |
| 3 | live 완주 + 오탐 측정 | 실제 plan 1건에 적용해 false-positive/negative를 기록하고 검사 강도를 확정 |

**§3.16과의 긴장을 PRD 본문에 명시할 것.** 이 PRD는 라운드 증설이 아니라 §3.16이 스스로 선호한 "기계 강제" 방향이므로 상보물이다 — 그 논증을 적지 않으면 자기 정책에 기각된다.

**PRD B `santa-surface-acceptance` (#130 + #128의 santa 절반) — PRD A와 병렬 착수 가능**

소유: `plugins/mccp/commands/santa-loop.md` · `scripts/lib/santa/{gate,adjudication,seal}.js` · `agents/code-reviewer.md` + santa test.

| M | 이름 | Outcome |
|---|---|---|
| 1 | #130 결정 기록 + push human-gate + 브랜치 가드 | A/B/C 결정이 기록되고, Step 6 앞에 `archive-complete`식 human-gate와 current-branch 가드(main이면 HALT)가 붙는다. **env 토글 무신설** — human-confirm 형태면 registry 등재 의무가 없어 `env-contract-integrity`와의 충돌이 원천 회피된다 |
| 2 | santa 리뷰어 `out_of_scope_observations[]` 버킷 | 스키마에 판정-무관 버킷 추가 · `:492`의 suggestions 계약 정리 · `gate.js` 파싱하되 blocking 미계수 · `adjudication.js` 판정 의무 면제 명시 |
| 3 | dedup 키 결정 기록 | claim-text 키(전제 5) → file+evidence 키 교체 여부 결정. **원장 코퍼스가 현재 0파일이라 지금만 마이그레이션 비용이 0**이고, santa 첫 실사용으로 원장이 쌓이면 창이 닫힌다. 채택이든 기각이든 결정 기록이 산출물 |

M1 → M2 → M3은 **직렬 강제**다 — 셋 다 같은 파일을 공유하므로 브랜치를 나누면 CLAUDE.md §3.5.1의 PR #110형 머지 사고를 재현한다.

**편입 — #128의 패널 절반은 `diverse-agent-review` #1.5로**

동일 메커니즘(상시 컨텍스트를 리뷰어 입력으로 주입 + finding을 그에 대해 판정), 동일 주입 지점(`buildRefutePrompt`). 그 PRD의 순서 규칙(#5 오라클 추출 뒤)을 승계한다. invariant store 위치는 `.claude/state/findings/`를 `multi-session-work-loop-m9`가 점유 중이므로 그 브랜치 머지 후 결정한다.

**종결 — #129는 본 문서로 닫는다**

| 잔여 | 처분 | 근거 |
|---|---|---|
| 1. `loop-design-check` 포크 | **프레임 흡수** (PRD A M1) | 원본 트리가 디스크에 부재(전제 9). 5규율의 미충족 절반이 정확히 #127·#130 잔여와 동치 |
| 2. 크기 분류기 2단 → 4단 | **기각** | 근원 증상(라운드 폭주)이 코드 캡 + `MCCP_REVIEW_SINGLE_PASS`로 봉인됨(round 분포 1:148 / 2:1). mis-sized run 기록 0건 |
| 3. state-store SQLite 포트 | **기각 · dead-code 은퇴 후보** | 전제 10대로 완전 휴면. 집계 질의는 `corpus.js`·`evidence-audit`·derive가 담당. receipt를 SQLite로 옮기면 §3.12 증거 내구성 계약(git-tracked diffable JSON + no-rehash + 파일명 결속)과 정면 충돌 |
| 4. `REFUTE_MIN_CONFIDENCE` | **원리 채택 · 숫자 기각** | 원리(불확실한 반증은 blocker를 강등 못 한다)는 quorum unknown-severity fail-closed로 이미 구현. 숫자 임계는 `gate.js:237`의 저장소 신조("임계값을 발명하면 방어할 근거가 없는 숫자가 생긴다")와 배치 |
| 5. evidence-snippet dedup 키 | **타이밍 창 → PRD B M3** | 전제 5. 실측 중복 사례 0건이나 원장 0파일 창이 지금만 열려 있음 |
| 6. `epic-*` + github-coordination | **기각** | 단일 사용자 저장소라 다중 행위자 claim 경쟁 전제가 없고, in-repo substrate를 MSW가 이미 출시. 남은 실측 고통(§3.7 버전 충돌 3회 · §3.5.1 머지 드롭)은 git-merge 축이라 이 모델이 풀어주지 않는다 |

**동봉할 정정**: CLAUDE.md §2의 "ECC/ ← 원본 ECC fork tree (참고용/diff용 보존)"는 현재 거짓이다(전제 9). 재fetch 수요가 확인된 항목이 0건이므로 서술 정정을 권고한다.

### 3. 착수 순서

```
즉시 병렬:  PRD A (#127)  ||  PRD B M1 (#130)      ← 파일 완전 분리
그 다음:    PRD B M2 → M3                          ← 동일 파일 직렬 강제
그 뒤:      diverse-agent-review #5 → #1.5 (+ #128 패널 절반 편입)
지금:       본 문서 등재 + #129 종결 + CLAUDE.md §2 정정
```

**in-flight 충돌 판정: 0건.** 회피된 충돌 3건 — (a) `SANTA_AUTO_PUSH` 토글 무신설로 `env-contract-integrity` 회피, (b) #128 패널 절반 이연으로 `multi-session-work-loop-m9`의 `.claude/state/findings/` 회피, (c) PRD A의 소유 파일을 `l1-check.js`로 한정해 `diverse-agent-review`의 패널 기계(`quorum.js` · `perspectives.js` · `agents/review-*.md`) 회피. `quorum.js:175-181` 합성 재설계와 CLAUDE.md §3.14 은퇴도 같은 이유로 그쪽에 라우팅한다.

## Open Questions

- **#130의 A/B/C 결정 자체.** 본 조사는 결정이 기록될 자리(PRD B M1 · `santa-loop.md` Step 6 · 필요시 `docs/gate-design.md`)까지만 지목할 수 있다. 토글 없는 human-confirm(권고, 충돌 최소) vs 토글(env-contract-integrity 착지 대기) 택일은 운영자 몫이다.
- **#128 패널 절반의 편입 형태.** `diverse-agent-review` #1.5의 Outcome을 "intent + standing invariants"로 확장할지, 별도 #1.6을 신설할지는 그 PRD 소유 세션과의 조율이 필요하다.
- **invariant store의 위치.** `.claude/state/invariants/` 신설 vs `findings-registry` kind 확장 — `multi-session-work-loop-m9` 머지 후 결정한다.
- **#127 Validate content 검사의 강도 상한.** 상수/placeholder 거부까지인가, 셸 규율 lint까지인가, dry-run 실행까지인가. L1의 LLM-free·NEVER-throws 계약 안의 비용·부작용 판단은 PRD A M3 실측 후 확정한다.
- **`santa-loop.md` 978행 재비대.** addendum P0 당시 199행에서 thin caller가 목표였는데 978행이 됐다. PRD B가 이 파일을 건드리기 전에 2차 추출이 선행돼야 하는지는 별도 판단 축이다.
- **`/mccp:work` 실행 중 `plan.md` Phase 4 "WAITING FOR CONFIRMATION"의 실제 생존 여부.** `work.md:139`의 무인 계약과 산문 충돌이라 라이브 full-chain 1회 완주 로그 없이는 단정할 수 없다. "수용 권한" 축을 여는 날의 첫 실측 항목이다.
