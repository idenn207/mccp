# work 컨텍스트 초과 문제 — 진단 + 해결책 (context firewall)

> 작성 2026-07-04. `/mccp:work`가 full chain 진행 중 컨텍스트(200k~300k 토큰) / cost hook
> 임계를 넘어 중간에 멈추거나 hand-off를 요구해 "처음부터 끝까지 한 번에"가 실현
> 불가능해지는 문제에 대한 진단과 권고. **구현은 미착수 — 방향 확정용 결정 노트.**

> **정정 (2026-07-04)**: 본 노트의 "Codex 리뷰 비격리" 주장(§2.2, §4 A 권고 1번)은 코드
> 검증 결과 **오류**입니다. Codex는 `codex-invoke.js`가 `codex-companion.mjs`를 별도
> 서브프로세스로 spawn하고 출력을 shell 변수로 캡처(Claude stdout 미노출)하므로 **이미
> 컨텍스트 격리**되어 있습니다. 실제 최대 누적원은 **implement 스텝 body(파일 읽기·diff·
> 테스트)의 `Skill()` 인라인**입니다. 정정·확정판 = `.claude/prds/work-context-isolation.prd.md`
> (이 노트를 입력으로 `/mccp:plan-prd`로 co-create). 이 노트는 사고 과정 기록으로 보존.

---

## 0. TL;DR

- 뿌리는 "세션 관리"가 아니라 **누적**이다: `work.md`가 5개 스텝을 전부 `Skill()`
  인라인으로 호출 + Codex 리뷰 출력이 격리 없이 본문에 주입 → 모든 것이 **메인 세션
  한 컨텍스트**에 선형 누적된다.
- 지금까지 시도한 멀티세션 / 서브에이전트 세션 관리 / auto-new-session(spawn)은 전부
  "찬 뒤 이어가기" 레이어라 per-session 토큰을 못 줄인다. spawn은 이 환경에서 죽어 있다
  (`claude` 바이너리 not on PATH).
- 해결책: **A. context firewall(heavyweight 스텝을 `Agent` 격리, 요약만 반환)** 주축 +
  **B. checkpoint/resume 안전망(notify 전제, spawn 미사용)**. A는 토큰 축, B는 달러 축.

---

## 1. 두 한계는 서로 다른 축이다 (오진 교정)

사용자 표현("context 크기가 넘어가면 cost hook 발생")은 두 한계를 하나로 묶었지만 실제로는 분리된다:

| 한계 | 트리거 | 성격 | 올바른 처방 |
|---|---|---|---|
| 컨텍스트 윈도우 (200k~300k **토큰**) | 누적 토큰 | 하드 기술 한계 | **격리** — 토큰이 애초에 안 들어오게 |
| cost hook ($50/$80/$100 **달러**) | 누적 비용 | 예산 가드레일 | **세션 리셋** — 새 세션은 cost=0 |

상관은 있으나(긴 단일 세션이 둘을 동시 누적) 처방이 다르다. **격리(A)는 토큰을, resume(B)는 달러를 잡는다. 둘 다 필요하다.**

---

## 2. 근본 원인 (file:line 근거)

### 2.1 5개 스텝 전부 `Skill()` 인라인

- `plugins/mccp/scripts/lib/work-orchestrator.js` 3-10줄: 오케스트레이터는 슬래시 명령을
  실행 못 하고, 각 스텝은 *"Claude's command body"* — 즉 **메인 세션 하나** 안에서 실행.
- `plugins/mccp/commands/work.md` Phase 2.F:
  - Step 1 (112줄): `Skill(mccp:plan-prd, ...)`
  - Step 2 (116줄): `Skill(mccp:plan, ...)`
  - Step 3 (133줄): `Skill(mccp:prp-implement, ...)`
  - Step 4 (137줄): `Skill(mccp:prp-commit, ...)`
  - Step 5 (141줄): `Skill(mccp:pr)`
- `Skill`은 서브에이전트를 만들지 않는다 → 5개 스텝 출력이 **한 윈도우에 선형 누적**.

### 2.2 Codex 리뷰 — 격리됨 (정정: 원래 "비격리"로 오판했던 항목)

- `codex-invoke.js`가 `codex-companion.mjs`를 **별도 서브프로세스로 spawn**하고,
  `plan.md` 556줄이 `CODEX_STDOUT=$(...)`로 **shell 변수 캡처**(Claude stdout 미노출) +
  shell 변수는 Bash 호출 간 non-persist. Codex 트랜스크립트(수만 토큰)는 companion
  프로세스에서 소멸하고, 메인 세션엔 YAGNI triage용 **소량 findings 요약**만 진입.
- ∴ Codex는 이미 컨텍스트 격리됨 — **누적 원인 아님**. 수정 대상에서 제외.

### 2.3 결과

PR 스텝 도달 시 컨텍스트 = PRD 전문 + plan 전문 + Codex R1/R2 + implement diff +
implement-Codex + commit + PR-Codex + 중간 파일 읽기 전부. 200k~300k는 구조적 필연.
v0.2 dogfood에서 실제 관측(`mccp-v0.2-continuation.md` 85-89줄: 세션 $109 vs 실링 $100).

---

## 3. 왜 이전 시도들이 실패했나

- **멀티세션 / 서브에이전트 세션 관리**: "찬 뒤 이어가기" 레이어라 per-session 토큰 미감소.
  스텝 결과가 부모로 흘러들면 부모가 다시 누적.
- **auto-new-session (spawn)**: `session-spawner.js` 140·248줄이
  `spawnSync('claude','--version')`로 바이너리 probe → PATH에 없으면 `notify`로 강등
  (`fallback_reason='claude-binary-not-found'`). 이 환경 SessionStart에도
  `claude --version probe failed (ENOENT)`. IDE-launched 세션은 거의 항상 실패.
  근본적으로 spawn은 "새 프로세스 시작"이지 "작업을 더 작게"가 아니다.
- **공통 오진**: 전부 *세션 축*을 건드렸고 *누적 축*을 안 건드렸다.

---

## 4. 해결책

### A. Context firewall — heavyweight 스텝을 `Agent`로 격리 (토큰 축, 주축)

`Skill`(인라인) 대신 `Agent`/`Task`(격리 컨텍스트)로. 서브에이전트가 분석·리뷰를 수행하고
산출물은 디스크(PRD/plan 파일·receipt·diff)에 쓴 뒤 **압축 요약만** 반환. 메인 컨텍스트는
스텝당 ~50k+ → ~1-2k. mccp는 이미 모든 것을 디스크 영속화(STATE.md·receipt·plan)하므로
다음 스텝은 컨텍스트가 아니라 **디스크에서** 읽는다 → 서브에이전트 경계 비용 ≈ 0.

**정직한 한계**: 스텝 전체(Edit/Write + receipt write + pr-phase lock + git push)를 통째로
서브에이전트에 넣는 건 non-trivial(서브에이전트는 슬래시 명령/락/push를 메인 세션처럼 못 다룸).
현실적 형태 = **분석·리뷰(컨텍스트 비용의 대부분)는 서브에이전트 위임, 실제 mutation은
메인 스레드에 얇게 유지**. PR 스텝이 격리 난이도 최상(gh·실브랜치·락), plan-prd·plan·
implement·모든 Codex 리뷰는 격리 쉬움.

### B. Checkpoint + seamless resume (달러 축, 안전망)

격리해도 한 스텝(R2 Codex 붙은 대형 implement)이 한 윈도우 초과 가능 → 자연 체크포인트까지
실행 → resume 마커 영속화 → 새(가벼운) 세션에서 재파생 0으로 이어가기. 기계는 이미 존재
(STATE.md `handoff_spawn`, `state-resumption.js` dispatch 테이블, fix-task 보존).

간극 두 가지:
- **spawn 미사용 확정** — `notify` + 원-키 `/mccp:resume`. auto-spawn에 의존하지 말 것
  (§3 참조: 이 환경에서 죽음).
- **체크포인트 세분화** — 현재 resume는 명령 단위로 거칢. "PRD 완료, plan 완료, implement
  task 3 진행 중" 수준으로 잘게 떠서 새 세션이 끝난 작업을 skip하게.

### 종합 권고 (우선순위 순 — 향후 구현 착수 시 이 순서)

1. **implement 스텝 body를 격리 컨텍스트로 위임.** 최대 누적원(파일 읽기·diff·테스트 출력).
   오케스트레이터가 요약(변경 파일·receipt path·verdict)만 회수. ~~Codex 격리~~는 취소 —
   이미 서브프로세스 격리됨(상단 정정 참조).
2. **오케스트레이터가 매 스텝 사이 체크포인트** → 세션이 죽어도 `/mccp:resume`가 정확히 다음
   스텝 착지. `notify` 전제.
3. **classify 시점 윈도우 초과 예측**(full + source signature + 파일 N개) → 그러면
   "이 작업은 2-3 체크포인트로 나눠 자동 재개됩니다" 선포. $100에서 조용히 죽는 것보다 정직.
4. (선택) plan-prd/plan/implement 분석 파트도 순차 Agent 격리 — 여력 될 때.

> `/mccp:strategic-compact`(스텝 경계 압축)는 임시방편일 뿐. 반응적·손실적. 격리는 토큰이
> 애초에 안 들어오게 하므로 우월.

---

## 5. 재정의된 불변식

`work`의 가치는 "한 세션"이 아니라 **"한 명령, 사람이 중간 감시 불필요"**. 앞을 버리고 뒤를
지킨다 → "한 명령; 세션을 넘나들며 자리 안 잃고 자동 재개".

---

## 6. 상태

- **결정**: 방향 A(주축) + B(안전망) 확정. 구현 미착수.
- **다음 진입**: 구현 착수 시 §4 종합 권고 1번(Codex 격리)부터. PRD 정식화가 필요하면
  `/mccp:plan-prd`로 A+B 두 축을 milestone화.

---

## 7. Task 0 spike 결과 — worker-prompt 형태 확정 (M1 구현, 2026-07-04)

`.claude/plans/work-context-isolation.plan.md` Task 0의 세 위험을 실제 `Agent`(general-purpose,
이 환경 subagent = Haiku)로 실측했다. 실측 절차: `dispatch-cli.js prepare-single`로 placeholder
envelope + worker prompt 생성 → 격리 worker Agent 런칭 → worker가 자기 Bash로 envelope 전이 →
controller `dispatch-cli.js merge`로 요약 회수.

| 위험 | 실측 결과 | 근거 |
|---|---|---|
| (a) subagent가 nested `Skill(mccp:prp-implement)` 호출 가능? | worker 자가보고 "YES" (단 slash-command Skill은 도구 목록에 노출돼도 실제 호출은 harness 버전 의존 — 비신뢰) | subagent self-report |
| (b/c) subagent Bash가 envelope/receipt 계약 구동 가능? | **YES** — `dispatch-cli.js mark` exit 0, envelope `pending→ok` 전이 성공 | 실제 Agent 실행 |
| round-trip (prepare→Agent→merge) | **YES** — merge가 `{verdict:ok, receiptsAdded:[mccp-implement-codex/spike-probe.json], nextAction:"..."}` 회수 | controller 육안 |

### 확정: **self-contained worker prompt**

worker는 nested Skill에 의존하지 않고 프롬프트가 지정한 대로 prp-implement 계약(Phase 2.5~4)을
자기 Bash/Read/Edit로 직접 구동한다. 근거:

- 위임 shape(`prepare → Agent → merge`)는 nested-Skill 가용 여부와 **무관하게 불변** — worker-prompt
  내용만 self-contained로 고정(plan §17 예측대로).
- self-contained는 harness 버전에 안 흔들리고 hook-compatible(worker의 Bash receipt write가
  3 attribution 플래그로 self-enforcing — 누락 시 receipt CLI fail-closed exit 12).
- nested Skill이 실제로 가용해도 self-contained 프롬프트는 그대로 동작(상위 호환).

### Task 4 측정 지점 (baseline/after)

`MCCP_WORK_ISOLATE_IMPLEMENT`로 두 번 돌려 메인(controller) 세션 피크 컨텍스트를 비교한다:

- **baseline** (`=0`): implement가 인라인 `Skill(mccp:prp-implement)` — 파일 읽기·diff·테스트
  출력이 전부 메인 컨텍스트에 누적.
- **after** (`=1`, default): implement가 격리 worker Agent에서 실행 — 메인엔 `merge` 요약
  (verdict·receiptsAdded·nextAction, ~1~2k 토큰)만 진입.
- **관측 지점**(MVP, 육안/수동): Step 3 직후 controller 컨텍스트에 유입된 텍스트량 — 격리 경로는
  `[mccp:work] implement merge verdict=ok` 한 줄 + merge JSON 요약뿐이고, 인라인 경로는 worker의
  전체 EXECUTE/VALIDATE 트랜스크립트가 그대로 누적된다. 무거운 계측은 도입하지 않음.
