# Implementation Report: 세션 컨텍스트 예산 정리 (CLAUDE.md + auto-memory)

## Summary

세션마다 자동 주입되는 두 표면(`CLAUDE.md` · auto-memory 인덱스 `MEMORY.md`)에서 **아카이브 성격의
서사를 이미 그것을 소유한 문서로 이전**했다. 삭제가 아니라 이전이며, 파괴적 변경은 0건이다.

주입 합계가 **50,049 → 20,382 토큰**으로 줄어 200k 창 점유가 **25.0% → 10.2%** 가 됐다.
plan의 목표(약 22,100 토큰 / 11.1%)를 상회했다.

| 축 | 기준선 | 결과 | 목표 | 판정 |
|---|---|---|---|---|
| `CLAUDE.md` 토큰 | 45,357 | **18,560** | ≤20,000 | PASS |
| `MEMORY.md` 토큰 | 3,393 | **523** | ≤800 | PASS |
| 주입 합계 / 200k 창 | 25.0% | **10.2%** | <12% | PASS |
| `CLAUDE.md` 바이트 | 160,920 | **65,535** | ≤70,000 | PASS |
| `MEMORY.md` 바이트 | 11,009 | **1,827** | ≤2,500 | PASS |

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
| 1 | §1.4 → `docs/milestone-log.md` | Complete | 24행 **원문 그대로** 이전, CLAUDE.md에 잔류 18행. 37,353 → 3,420 B |
| 2 | §4 → 요약 표 + `docs/ENVIRONMENT.md` | Complete | 56행 표 잔류(+`CODEX_DEDUPE_AT_PR` 1행), 전수 원문 이전, stale 마커 3건 정정. 44,462 → 5,532 B. **형식 1건 이탈**(아래) |
| 3 | §3.6/3.9/3.10/3.12 서사 이전 | Complete | 34,459 → 11,937 B. 순수 규칙 17줄 **전수 잔류**(V13), 원문 전문은 목적지에 축자 보존 |
| 4 | `MEMORY.md` 정규화 | Complete | 16항목 전부 한 줄 hook(최대 137 B), PR 상태 제거. 11,009 → 1,827 B |
| 5 | stale 상태 비파괴 정정 | Complete | 3파일에 한 줄 append(삭제 0). 4번째 파일은 본문이 이미 정확해 회귀 가드로만 검증(plan R6-1) |
| 6 | 이전 완결성 기계 검증 | Complete | plan의 Validation 블록을 **원문 그대로 추출**해 16개 검사로 분리 실행 |

## Validation Results

plan의 `## Validation` 블록을 손으로 옮기지 않고 **파일에서 그대로 추출**해(이스케이프 손상 방지)
검사별로 분리 실행했다.

| # | 검사 | Status | 실측 |
|---|---|---|---|
| 0 | baseline manifest 자체 검증 | PASS | file_count 17 · 스키마 위반 0 · 파일명 집합 일치 |
| 1 | 표면 예산(바이트) | PASS | CLAUDE.md 65,535 · MEMORY.md 1,827 |
| 2 | env 양방향 집합 동일 | PASS | table 56 · docs 57 · 양방향 누락 0 · 은퇴 토글 표에 없음 |
| 3 | milestone 행 이전 | PASS | source 24 = dest 24 · 행 전체 불일치 0 · 중복 0 · 잔류 18 |
| 4 | 불변식 키워드 6종 소속 섹션 잔존 | PASS | 이탈 0 |
| 5 | MEMORY.md 줄 상한·링크·PR상태 | PASS | 16행 · over-160B 0 · dead link 0 · PR상태 0 |
| 5b | memory 비파괴 불변식 | PASS | 소실 0 · 축소 0 · 정정줄 누락 0 · 정체성 상실 0 (drift 4건은 본 작업 편집분) |
| 6 | 섹션별 예산 | PASS | §1.4 3,420 · §4 5,532 · 4섹션 11,937 |
| 7 | 사용성(default·앵커·링크 해석) | PASS | 표 56행 · default 빈 행 0 · 깨진 링크 0 · 없는 앵커 0 · stale 마커 0 |
| 8 | **이전 완결성(고아 줄)** | PASS | 삭제 실질 줄 217 ≥ 문턱 180 · **고아 0** · 예외 사용 **0**/상한 11 |
| 9 | 회귀(신규 실패) | PASS | 신규 실패 0. 잔존 red 7건은 baseline과 정확히 동일 |
| 10 | **토큰 축** | PASS | claude_md 18,560 · memory_index 523 · TOTAL 20,382 = 10.2% |
| 11 | 의도치 않은 파일 삭제 | PASS | 삭제 0 |
| 11b | 미추적 잡파일 | PASS | 최초 실행에서 **1건 검출**(아래) → 정리 후 0 |
| 12 | 질량 보존 | PASS | 감소 95,385 B · 목적지 증가 133,685 B · 보존율 **140.2%** (≥90%) |
| 13 | 규범 잔류 | PASS | BASE 순수 규칙 17줄 · CLAUDE.md 이탈 **0** |

**Validation 11b가 실제로 일을 했다.** plan이 예측한 대로(R4 실측) Validation 9가 돌린
`a3-instruction-cost.test.js`가 `python3` 부재로 중단되며 `temp-claude-test5.md`를 남겼고,
gitignore 대상이 아니라 `git add -A` 한 번이면 repo에 들어올 상태였다. 가드가 잡아 정리했다.

## Files Changed

| File | Action | 바이트 |
|---|---|---|
| `CLAUDE.md` | UPDATED | 160,920 → 65,535 (**-95,385**) |
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

## Next Steps

- [ ] `/mccp:code-review` 또는 `/mccp:prp-commit` → `/mccp:pr`
- [ ] PR 머지 후 CLAUDE.md §3.11 런북대로 plan을 `.claude/PRPs/plans/archived/`로 수동 은퇴
- [ ] backlog의 `plan-conflict-detector` 백틱 결함(HIGH) 처리 — 1줄 수정 + 회귀 test
- [ ] 병렬 worktree 5개에서 CLAUDE.md rebase 시 **압축본을 base로 취하고 상대 브랜치의 신규 §만 재적용**(plan Risks)
