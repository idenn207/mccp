# Implementation Report: 세션 컨텍스트 예산 정리 (CLAUDE.md + auto-memory)

## Summary

세션마다 자동 주입되는 두 표면(`CLAUDE.md` · auto-memory 인덱스 `MEMORY.md`)에서 **아카이브 성격의
서사를 이미 그것을 소유한 문서로 이전**했다. 삭제가 아니라 이전이며, 파괴적 변경은 0건이다.

주입 합계가 **50,049 → 20,369 토큰**으로 줄어 200k 창 점유가 **25.0% → 10.2%** 가 됐다.
plan의 목표(약 22,100 토큰 / 11.1%)를 상회했다.

| 축 | 기준선 | 결과 | 목표 | 판정 |
|---|---|---|---|---|
| `CLAUDE.md` 토큰 | 45,357 | **18,576** | ≤20,000 | PASS |
| `MEMORY.md` 토큰 | 3,393 | **523** | ≤800 | PASS |
| 주입 합계 / 200k 창 | 25.0% | **10.2%** | <12% | PASS |
| `CLAUDE.md` 바이트 | 160,920 | **65,595** | ≤70,000 | PASS |
| `MEMORY.md` 바이트 | 11,009 | **1,827** | ≤2,500 | PASS |

> **측정 기준은 커밋된 산출물(`11410c1`)이다.** 이 표의 초판은 구현 도중 측정한 값을 실었고,
> 그 뒤 `CLAUDE.md`에 60 B가 더 들어간 뒤 재측정되지 않아 여섯 수치가 어긋나 있었다
> (santa-loop R1에서 양 리뷰어가 독립적으로 적발 — 아래 「Post-ship 재검증」). 위 값은
> 커밋물을 다시 재어 정정한 것이다. `state_block`(STATE.md)은 세션마다 변하므로 주입 합계는
> 본질적으로 ±수십 토큰 흔들린다 — 합계를 고정 수치로 인용하지 말 것.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 산술 충돌 1건(아래 Deviations) 외에는 plan대로 |
| Confidence | santa-loop 6R 미수렴, 사람 판단으로 착지 | plan의 실측 수치가 **전부 정확**했다(§1.4 37,353 · §4 44,462 · 4섹션 34,459 · ceiling 250 → 문턱 180 · env 56/57 · RULE-KEEP 17 · 혼합 9) |
| Files Changed | 8 repo + 4 repo-외 | 8 repo + 4 repo-외 (일치) |

plan이 6라운드에 걸쳐 다듬은 수치는 구현 중 실측과 **한 건도 어긋나지 않았다.** 반대로
plan이 못 잡은 것은 §4 표 형식의 산술 충돌 하나였고, 그것은 리뷰어 둘 다 여섯 라운드 동안
계산해 보지 않은 자리였다(plan이 스스로 기록한 "자기 산술을 검산하지 않으면 헤드라인이
거짓이 된다"의 다섯 번째 사례).

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | memory baseline 캡처 | Complete | Task 4/5 **직전** 재캡처(R4 지침). 이전 baseline 대비 3파일이 auto-memory에 의해 제자리 재작성돼 있었다(`MEMORY.md` 10,537→11,009 · `codex-intent-context-m1.md` 6,409→7,908 · `diverse-agent-review-prd.md` 4,406→5,246) — 재캡처의 근거가 실측으로 확인됨 |
| 1 | §1.4 → `docs/milestone-log.md` | Complete | 24행 **원문 그대로** 이전, CLAUDE.md에 잔류 18행. 37,353 → 3,426 B |
| 2 | §4 → 요약 표 + `docs/ENVIRONMENT.md` | Complete | 56행 표 잔류(+`CODEX_DEDUPE_AT_PR` 1행 — V2/V7은 정의상 `MCCP_`만 세므로 56), 전수 원문 이전, stale 마커 3건 정정. 44,462 → 5,533 B. **형식 1건 이탈**(아래) |
| 3 | §3.6/3.9/3.10/3.12 서사 이전 | Complete | 34,459 → 11,990 B (예산 12,000 — **잔여 여유 10 B**). 순수 규칙 17줄 **전수 잔류**(V13), 원문 전문은 목적지에 축자 보존 |
| 4 | `MEMORY.md` 정규화 | Complete | 16항목 전부 한 줄 hook(최대 137 B), PR 상태 제거. 11,009 → 1,827 B |
| 5 | stale 상태 비파괴 정정 | Complete | 3파일에 한 줄 append(삭제 0). 4번째 파일은 본문이 이미 정확해 회귀 가드로만 검증(plan R6-1) |
| 6 | 이전 완결성 기계 검증 | Complete | plan의 Validation 블록을 **원문 그대로 추출**해 16개 검사로 분리 실행 |

## Validation Results

plan의 `## Validation` 블록을 손으로 옮기지 않고 **파일에서 그대로 추출**해(이스케이프 손상 방지)
검사별로 분리 실행했다.

| # | 검사 | Status | 실측 |
|---|---|---|---|
| 0 | baseline manifest 자체 검증 | PASS | file_count 17 · 스키마 위반 0 · 파일명 집합 일치 |
| 1 | 표면 예산(바이트) | PASS | CLAUDE.md 65,595 · MEMORY.md 1,827 |
| 2 | env 양방향 집합 동일 | PASS | table 56 · docs 57 · 양방향 누락 0 · 은퇴 토글 표에 없음 |
| 3 | milestone 행 이전 | PASS | source 24 = dest 24 · 행 전체 불일치 0 · 중복 0 · 잔류 18 |
| 4 | 불변식 키워드 6종 소속 섹션 잔존 | PASS | 이탈 0 |
| 5 | MEMORY.md 줄 상한·링크·PR상태 | PASS | 16행 · over-160B 0 · dead link 0 · PR상태 0 |
| 5b | memory 비파괴 불변식 | PASS(실행 시점) | 소실 0 · 축소 0 · 정정줄 누락 0 · 정체성 상실 0 (drift 4건은 본 작업 편집분). **사후 제3자 갱신으로 현재는 FAIL** — 아래 「Post-ship 재검증」 |
| 6 | 섹션별 예산 | PASS | §1.4 3,426 · §4 5,533 · 4섹션 11,990 |
| 7 | 사용성(default·앵커·링크 해석) | PASS | 표 56행 · default 빈 행 0 · 깨진 링크 0 · 없는 앵커 0 · stale 마커 0 |
| 8 | **이전 완결성(고아 줄)** | PASS | 삭제 실질 줄 217 ≥ 문턱 180 · **고아 0** · 예외 사용 **0**/상한 11 |
| 9 | 회귀(신규 실패) | PASS | 신규 실패 0. 잔존 red 7건은 baseline과 정확히 동일 |
| 10 | **토큰 축** | PASS | claude_md 18,576 · memory_index 523 · state_block 1,270 · TOTAL 20,369 = 10.2% |
| 11 | 의도치 않은 파일 삭제 | PASS | 삭제 0 |
| 11b | 미추적 잡파일 | PASS | 최초 실행에서 **1건 검출**(아래) → 정리 후 0 |
| 12 | 질량 보존 | PASS | 감소 95,325 B · 목적지 증가 133,685 B · 보존율 **140.2%** (≥90%) |
| 13 | 규범 잔류 | PASS | BASE 순수 규칙 17줄 · CLAUDE.md 이탈 **0** |

**Validation 11b가 실제로 일을 했다.** plan이 예측한 대로(R4 실측) Validation 9가 돌린
`a3-instruction-cost.test.js`가 `python3` 부재로 중단되며 `temp-claude-test5.md`를 남겼고,
gitignore 대상이 아니라 `git add -A` 한 번이면 repo에 들어올 상태였다. 가드가 잡아 정리했다.

## Files Changed

| File | Action | 바이트 |
|---|---|---|
| `CLAUDE.md` | UPDATED | 160,920 → 65,595 (**-95,325**) |
| `docs/milestone-log.md` | CREATED | +42,963 |
| `docs/ENVIRONMENT.md` | UPDATED | 22,575 → 77,149 (+54,574) |
| `docs/gate-design.md` | UPDATED | 19,005 → 42,858 (+23,853) |
| `docs/multi-session-work-loop/evidence-conflict-design.md` | UPDATED | 33,194 → 45,489 (+12,295) |
| `.claude/state/memory-baseline.json` | CREATED | +2,612 |
| `.claude/state/relocation-exceptions.txt` | CREATED | +1,537 |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | +1,814 (신규 finding 1건) |
| `.claude/plans/context-budget-cleanup.plan.md` | UPDATED | Codex Implementation Review 섹션 주입 |
| `memory/MEMORY.md` (repo 밖) | UPDATED | 11,009 → 1,827 |
| `memory/{integrity-unification-m3, workflow-orchestration-m1, cost-model-subscription-remediation}.md` (repo 밖) | UPDATED | 각 +39 (한 줄 append) |

## Deviations from Plan

### D1 — §4 요약 표에서 per-row `상세` 앵커 열을 뺐다 (형식 이탈, 예산 충돌)

plan Task 2는 `| env | default | 한 줄 효과 | 상세 |` **4열**을 지정하면서 Validation 6으로
§4 ≤ 6,000 B를 요구한다. **이 둘은 산술적으로 동시에 성립하지 않는다.**

56행 전부에 `[상세](docs/ENVIRONMENT.md#<env_name_lowercase>)`를 달면, default와 효과를 각
1바이트로 줄여도 하한이 **5,702 B**다(고정 47 B × 56 + 이름 2회 반복 1,535 × 2). 실제 값을 넣은
실측은 **7,718 B**로 예산을 1,718 B 초과한다. 앵커는 짧게 만들 수 없다 — Validation 2가
`docs/ENVIRONMENT.md`의 절 제목이 `MCCP_` 이름으로 시작할 것을 요구하므로 slug에 항상
전체 이름이 들어간다.

**택한 해법**: 3열(`env | default | 효과 · kill-switch`)로 두고, 앵커 규약을 섹션 도입부에
**한 번** 명시했다 — "각 항목의 전체 서술은 `docs/ENVIRONMENT.md`의 **동명 절 `### <ENV_NAME>`**".
그 도입부 링크는 실제 해석되는 링크라 Validation 7이 파일·앵커까지 검증한다. 결과 5,532 B.

**보존된 것**: plan이 이 표의 *불변식*으로 명시한 것은 "default 값과 kill-switch 동작은
CLAUDE.md에 남는다 — 운영자가 토글을 끄려 할 때 문서를 열지 않아도 되어야 한다"이며, 이는
그대로 지켰다(Validation 7이 default 열 non-empty를 56행 전수 확인). 잃은 것은 경로 문자열
56회 반복(3,383 B = §4 예산의 56%)뿐이다.

**mandated detector 실행 결과**: `plan-conflict-detector.js`는 `conflict=true`를 반환했으나
그 근거(`file-expansion`)가 **detector 자체 결함**임을 확인했다(아래 D2). 백틱을 벗기고 재판정하면
unplanned 0 · signature-drift false · fake-pass false로 **세 signal 모두 미발화**다. 따라서
명령 본문의 "minor deviation" 경로(WHAT/WHY 기록 후 진행)를 따랐다.

### D2 — `plan-conflict-detector.js`의 `file-expansion` signal이 오탐 (backlog 등재)

`parseFilesToChange`가 `## Files to Change` 표 첫 열의 **백틱을 벗기지 않는다.** mccp plan
관례가 경로를 `` `CLAUDE.md` ``로 감싸므로 planFiles가 ``["`CLAUDE.md`", …]``로 저장되고
`isInPlan('CLAUDE.md', …)`가 세 분기 전부 실패해 **false**를 반환한다. 실측으로 이 사이클의
변경 4파일이 전부 plan에 명시돼 있는데 detector는 "5 unplanned"라 보고했다.

영향이 작지 않다 — 명령 본문은 CONFLICT=1에서 `fix-task.md` write + `STATE.md.chain_aborted=true`
+ exit 1로 chain을 멈추도록 규정하므로, **백틱 표를 쓰는 모든 plan이 정상 구현 중에 오탐
escalation을 맞는다.** 본 plan은 문서 압축 범위라 detector 코드를 고치지 않고
`.claude/plans/codex-findings-backlog.md`에 HIGH로 등재했다(수정안 포함).

### D3 — 혼합 9줄에 예외를 쓰지 않았다 (plan보다 엄격한 방향)

plan Task 3은 혼합 9줄(M1~M9)을 문장 단위로 쪼개면 원본이 고아가 되므로 예외 등재가
필요하다고 보았다(상한 11~12). 구현은 **목적지가 원본 섹션 전문을 축자 보존**하는 경로를
택해 혼합 9줄의 원본도 목적지에 그대로 남게 했고, CLAUDE.md에는 그 9줄의 규칙 절반만 새로
작성해 남겼다. 결과 **예외 0건**이며, 이는 plan이 R4에서 명시적으로 인정한 더 엄격한
상태다("부재는 예외 0으로 취급되어 고아 허용치가 사라지므로 더 엄격해진다").
`.claude/state/relocation-exceptions.txt`는 이 경위를 기록한 주석만 담고 생성했다.

### D4 — plan 아카이브를 하지 않았다

명령 본문 Phase 5는 plan을 `.claude/PRPs/plans/completed/`로 이동하라고 한다. **하지 않았다**:

1. CLAUDE.md §3.11이 완료 산출물의 목적지를 `.claude/PRPs/plans/archived/`로 규정하고,
   source PRD가 없는 **orphan plan**(본 plan은 free-form 입력)은 **수동 `git mv` + 사람 판단**으로
   은퇴시키라고 명시한다. 프로젝트 instruction이 기본 동작을 override한다.
2. 지금 옮기면 `mccp-implement-codex` receipt의 `plan_path`가 해석되지 않아 후속 `/mccp:pr`의
   plan_hash 검증이 깨진다.

PR 머지 후 §3.11 런북대로 은퇴시키는 것이 맞다.

## Issues Encountered

| 문제 | 해결 |
|---|---|
| plan 게이트 섹션 주입으로 `mccp-plan-codex` receipt가 stale | receipt README가 지정한 복구 경로(게이트 재실행 + fresh receipt). Codex는 `MCCP_CODEX_DISABLED=1` short-circuit이라 재실행이 동일한 `skipped` verdict를 냄을 실측 후 재발행 |
| §1.4 intro를 blockquote(`> `)로 옮겨 정규화 불일치 → V8 고아 1건 | 축자(prefix 없이)로 수정. V8이 정확히 이 종류를 잡으라고 있는 검사다 |
| `gen-env.js` 재실행이 `ENVIRONMENT.md`에 이중 append | 생성기를 `git checkout -- <dest>` 선행으로 idempotent화 |
| 생성기가 이미 압축된 CLAUDE.md를 읽어 실패 | §1.4/§3.x 생성기를 **BASE 커밋**(`git show 77ceba2:CLAUDE.md`)에서 읽도록 변경 — 재실행 안전 |
| §3.x 1차 결과가 예산 12,000 B를 252 B 초과 | authored 산문을 규칙만 남도록 압축(11,937 B). 필수 잔류(규칙 17줄 6,176 + 헤딩 347 = 6,523 B)는 손대지 않음 |
| V4가 `ownership_token_hash` 이탈 검출 | §3.6 authored 도입부에 등가 길이로 삽입(예산 여유 12 B였으므로 다른 문구를 함께 축약) |
| V11b가 테스트 잡파일 검출 | `temp-claude-test5.md` 제거 |

## Tests Written

없음 — 본 사이클의 변경은 전부 문서와 상태 파일이고 실행 코드는 0줄이다. 검증은 plan이
정의한 **16개 기계 게이트**가 담당하며, 그중 8개(V2·V3·V4·V6·V7·V8·V12·V13)가 이 변경의
정확성을 직접 판정한다.

## Post-ship 재검증 (santa-loop R1 — 구현물 대상 첫 리뷰)

plan은 6라운드 리뷰를 받았지만 그 라운드들은 전부 **plan 문서**를 봤다. 구현물 자체는
리뷰된 적이 없어 dual-review를 한 번 더 돌렸다 — Reviewer A(Claude Opus) · Reviewer B
(Codex GPT-5.4). 양쪽 FAIL. 지적 7건 중 **3건이 검증을 통과**했고 4건은 실측 반증했다.

### 흡수 3건

| # | 결함 | 출처 | 조치 |
|---|---|---|---|
| S1 | **report의 실측 수치 6개가 stale.** 구현 도중 측정한 뒤 `CLAUDE.md`에 60 B가 더 들어갔고 재측정하지 않았다. 실질적 귀결은 숫자 정정이 아니라 **4섹션 예산 여유가 63 B가 아니라 10 B**라는 것이다 — 그 섹션들을 다음에 건드리는 사람이 V6를 즉시 깬다 | A + B **독립 일치** | 커밋물 기준으로 전량 재측정·정정 + 측정 기준 명시 + 여유 10 B를 Task 3 행에 표면화 |
| S2 | **V5b가 지금 hard-fail한다** — `diverse-agent-review-prd.md` 5,246 → 4,356 B | A | 아래 귀속 판정 후 기록. 코드/문서 수정 없음 |
| S3 | **backlog가 같은 결함을 두 번 싣는다** — 2026-07-15 MEDIUM과 2026-08-09 HIGH가 동일 `plan-conflict-detector` 백틱 근본원인 | 자체 검산(리뷰어 둘 다 놓침) | 양쪽에 상호참조 추가. 항목을 합치지는 않았다 — 신규 항목은 "latent"였던 것이 **실제 발화**했다는 새 증거를 싣는다 |

### S2 귀속 — 파괴가 아니라 제3자 갱신

V5b는 축소를 보수적으로 hard-fail한다. 실측 귀속:

| 증거 | 값 |
|---|---|
| 본 작업이 편집한 4파일 mtime | `18:40:49` |
| `diverse-agent-review-prd.md` mtime | **`20:40:43`** (2시간 뒤) |
| `originSessionId` | 본 세션이 아닌 별개 세션 |
| `name:` 정체성 앵커 | 온전 |
| 내용 | 파괴가 아니라 **갱신** — `M1 구현 완료, 미push` → `M1 MERGED(PR #120, v1.23.5)` |

이 파일은 본 plan의 편집 대상이 **아니다**(Task 4/5는 `MEMORY.md` + 3파일). auto-memory가
해소된 "미해소 — 재개 시 최우선" 블록을 걷어내며 줄어든 것이다. plan이 U8로 등재한
원리적 한계가 그대로 실현됐다 — **제3자가 소유한 표면에 "안 줄어듦"을 요구하는 검사는
안정적일 수 없다.** baseline은 정의상 시점 캡처이므로 재캡처하지 않았다: 지금 다시 뜨면
본 작업이 편집한 4파일에 대한 무파괴 증거가 함께 지워진다.

**머지 후 V5b를 다시 돌리는 사람에게** — 이 한 건의 축소는 기대된 상태다. 파괴로 오독하지
말고 `memory-snapshot-2026-08-09/`와 mtime을 먼저 대조하라(plan V5b 실패 메시지의 절차).

### 기각 4건 (실측 반증)

- **A: "주입 합계가 6.3% 과대보고(20,382 → 실제 19,099)"** → A가 `state_block`을 뺐다. plan의 V10은 `claude_md`+`memory_index`+`state_block` **3개**를 잰다. 재실행 결과 18,576+523+1,270 = **20,369**로 report와 13토큰 차(STATE.md 변동분)다. A 자신이 적은 19,099 = 18,576+523이 누락을 그대로 드러낸다.
- **A: "삭제 실질 줄 223"** → V8 재실행 실측 **217**로 report와 정확히 일치.
- **A: "report가 축소 0을 허위 주장"** → V5b 실행 시점에 참이었다. 축소는 그로부터 2시간 뒤 제3자가 만들었다.
- **B: "env 표가 57행인데 report는 56행이라 오계수"** → V2/V7은 정의상 `MCCP_` 접두만 센다(56). 나머지 1행 `CODEX_DEDUPE_AT_PR`은 **B가 근거로 인용한 바로 그 줄**(`:38`)이 괄호로 명시한다.

### 판단 유보 1건

**B: "커밋된 plan에 절대 홈 경로 `C:/Users/skypark207/…`가 새로 들어간다"** — 사실이다. 다만
BASE(`77ceba2`)의 아카이브 plan 20개+가 이미 같은 패턴을 담고 있어 **이 변경이 만든 노출이
아니다.** repo는 public이지만 커밋 author email이 이미 같은 정체성을 싣는다. 본 사이클의
차단 사유로 삼지 않고 backlog에 등재했다 — plan의 Validation 블록이 재현성을 위해 그 경로에
실제로 의존하므로("이번 변경이 그 결함에 기대는가" 기준) 무시할 항목은 아니다.

### 재실행한 게이트 (커밋물 기준)

V2 · V3 · V4 · V6 · V7 · V8 · V12 · V13 **전부 PASS**. V8은 고아 0 · 삭제 217 ≥ 문턱 180,
V13은 순수 규칙 17줄 이탈 0 — 이 변경의 두 핵심 불변식(무엇도 사라지지 않았다 · 규칙은
CLAUDE.md를 떠나지 않았다)은 리뷰 후에도 유지된다.

## Next Steps

- [ ] `/mccp:code-review` 또는 `/mccp:prp-commit` → `/mccp:pr`
- [ ] PR 머지 후 CLAUDE.md §3.11 런북대로 plan을 `.claude/PRPs/plans/archived/`로 수동 은퇴
- [ ] backlog의 `plan-conflict-detector` 백틱 결함(HIGH) 처리 — 1줄 수정 + 회귀 test
- [ ] 병렬 worktree 5개에서 CLAUDE.md rebase 시 **압축본을 base로 취하고 상대 브랜치의 신규 §만 재적용**(plan Risks)
