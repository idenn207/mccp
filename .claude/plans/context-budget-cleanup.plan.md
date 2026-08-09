# Plan: 세션 컨텍스트 예산 정리 (CLAUDE.md + auto-memory)

**Source PRD**: (없음 — free-form `/mccp:plan` 입력)
**Branch**: `chore/context-budget-cleanup` (worktree `.worktrees/context-budget-cleanup/`, base `origin/main` @ `77ceba2`)
**Complexity**: Medium
**Review**: santa-loop R1 NAUGHTY(Opus FAIL 4/10 · GPT-5.4 FAIL 9/10) → 본 개정이 흡수분

## Summary

세션마다 자동 주입되는 두 표면 — `CLAUDE.md`(160,920 B / 849줄)와 auto-memory 인덱스 `MEMORY.md`(10,537 B / 16 항목 — 이 파일은 auto-memory 시스템이 세션 중에도 갱신하므로 값이 흔들린다. 2026-08-09 실측) — 이 지시문이 아니라 **아카이브**로 자라났다. 둘 다 "무엇을 결정해야 하는가"보다 "어떻게 여기까지 왔는가"를 더 많이 싣고 있고, 그 기록은 이미 `CHANGELOG.md`(318,378 B / 77 버전)·`docs/`·git history·PRD status 표가 소유한다.

이 plan은 **삭제가 아니라 이전(relocate)** 을 원칙으로 두 표면을 압축한다. 규칙·트리거·복구 절차는 CLAUDE.md에 남기고, 그 규칙이 어느 라운드에서 왜 나왔는지의 서사는 이미 존재하는 문서로 옮긴다. auto-memory는 **인덱스만** 정규화하고 memory 본문 파일은 **한 건도 삭제하지 않는다**(사용자 결정 2026-08-09).

목표는 **토큰 축이 1차, 바이트가 2차**다(사용자가 토큰으로 말했고, 레포에 이미 토큰 계측기가 있다):

| 축 | 현재 | 목표 |
|---|---|---|
| `CLAUDE.md` 토큰 | 45,357 | **≤16,900** (-63%) |
| `MEMORY.md` 토큰 | 3,393 | **≤800** (-76%) |
| 주입 합계 / 200k 창 | 50,049 = **25.0%** | 약 19,000 = **9.5%** |
| `CLAUDE.md` 바이트 | 160,920 | ≤60,000 |
| `MEMORY.md` 바이트 | 10,537 | ≤2,500 |

**파괴적 변경 0건.**

> **"이전했다"는 주장이 아니라 검사다.** R1 리뷰의 핵심 지적이 정확히 이것이었다 — 키워드 6개 존재와 행 수 27은 원문이 통째로 뭉개져도 통과한다. 그래서 본 개정은 **Validation 8(고아 줄 검사)** 를 중심 게이트로 둔다: `git diff`가 CLAUDE.md에서 지운 모든 실질 줄이, 목적지 문서 어딘가에 정규화 일치로 도착했음을 기계로 확인하고, 하나라도 도착하지 못하면 실패한다. 나머지 검사는 그 위의 보조 게이트다.

## 실측 진단

### CLAUDE.md — 상위 2개 섹션이 파일의 41.6%

| 섹션 | 바이트 | 비중 | 성격 |
|---|---|---|---|
| §4 「운영 토글 (환경 변수)」 | 33,971 | 21.1% | env **정의 56개**. 서술이 라운드별 finding 고고학 |
| §1.4 「v0.2 자동 게이트 레이어」 표 | 29,808 | 18.5% | 27행 milestone 출하 로그 = CHANGELOG 중복 |
| §3.12 증거 내구성 계약 | 8,460 | 5.3% | 규칙 + 3개 milestone 서사 누적 |
| §3.9 design critique | 6,622 | 4.1% | |
| §3.6 atomic state locks | 5,888 | 3.7% | |
| §3.10 impeccable routing | 5,745 | 3.6% | |
| 나머지 | 70,426 | 43.8% | 대체로 실제 지시문 |

> **수치 정정(R2 자체감사).** 초안은 §4=35,509 · §1.4=31,381 · §3.12=11,005이라 적었다. 그 측정이 heading **레벨**을 무시하고 다음 `###`까지 잘라 인접 섹션을 삼킨 결과다(§1.4는 §2 머리를, §4 토글은 §5를, §3.12는 §4 앞부분을 흡수). 위 표는 레벨 인지 측정이며 Validation 6이 **같은 함수**를 쓴다 — 진단과 검증이 다른 자로 재던 불일치를 제거했다.

### 토큰 실측 (사용자가 말한 단위)

사용자는 "claude.md 75k, 메모리 5k"라 했다. 레포에 이미 있는 계측기 [msw-metrics/a3-instruction-cost.js](plugins/mccp/scripts/lib/msw-metrics/a3-instruction-cost.js)와 같은 인코딩(tiktoken `o200k_base`)으로 실측한 값:

| 주입 표면 | 토큰 | 바이트 | B/token |
|---|---|---|---|
| `CLAUDE.md` | **45,357** | 160,920 | 3.55 |
| `MEMORY.md` 인덱스 | **3,393** | 10,537 | 3.11 |
| SessionStart STATE 블록 | 1,299 | 4,267 | 3.28 |
| **합계** | **50,049** | 175,724 | — |

**200k 컨텍스트 창의 25.0%가 첫 토큰을 쓰기 전에 소비된다.** 사용자 추정(75k+5k=80k)보다는 낮지만 결론은 오히려 선명하다 — 문제는 과장이 아니라 실재한다.

바이트 목표를 이 축으로 환산하면: CLAUDE.md ≤60,000 B ≈ **≤16,900 토큰**(-63%), MEMORY.md ≤2,500 B ≈ **≤800 토큰**(-76%). 주입 합계는 50,049 → 약 19,000 토큰, 창 점유 **25.0% → 9.5%**.

> **A3 계측기는 현재 Windows에서 불능이며 이 plan은 그것을 고치지 않는다.** `a3-instruction-cost.js`는 가용성은 `pip show tiktoken`으로 확인하면서 실제 토큰화는 `python3`을 하드코딩해 spawn한다. 이 머신에는 `python`(3.13.3) + tiktoken 0.13.0이 있고 `python3`은 없어 `baseline_unavailable`로 떨어지며, 이것이 잔존 red 7건 중 `a3-instruction-cost.test.js`가 빨간 이유다. 그 결함은 STATE.md대로 **gate-guard-integrity PRD가 승계한 잔존 red**에 속하므로 본 plan은 모듈을 건드리지 않고, Validation 10이 같은 인코딩으로 **독립 측정**만 한다.

**env 개수 정정(R1 Reviewer A F1).** 초안은 "55개"라 적었다. 원 측정 정규식이 `^MCCP_[A-Z_]+=`라 숫자를 포함한 이름(`MCCP_A11Y_AUTO_INVOKE`)을 놓친 결과다. 실측:

- **정의 줄 56개** (`^MCCP_[A-Z0-9_]+=`)
- **본문 고유 식별자 57개** — 57번째 `MCCP_ORCHESTRATION_DEBT_DECAY_HOURS`는 §4가 **삭제됐다고 서술한 은퇴 토글**이며 정의가 없다.

이 구분이 검증에 직접 영향을 준다: 본문 전체를 정규식으로 훑는 검사는 은퇴 토글까지 "문서화하라"고 요구해 영구히 실패하거나 존재하지 않는 토글의 문서를 만들게 한다. 따라서 Validation 2는 **요약 표 행**만 대상으로 하고 은퇴 목록을 명시적으로 제외한다.

env 개별 항목 실측 — 상위 2개가 7,653 B로 §4의 24%:

| env | 바이트 |
|---|---|
| `MCCP_ORCHESTRATION_MAX_AGENTS` | 4,761 |
| `MCCP_ORCHESTRATION_RESERVATION_LEASE_MS` | 2,892 |
| `MCCP_WORK_MERGED_VERIFY` | 1,250 |
| `MCCP_DESIGN_GROUNDING` | 1,123 |
| `MCCP_COST_STATE_DECAY_HOURS` | 1,077 |
| (나머지 51개) | 20,589 |

`MCCP_ORCHESTRATION_MAX_AGENTS` 항목 하나가 4,761 B다. 운영자가 이 토글을 만질 때 필요한 건 *default 24 · 초과 시 granted 0 · 인라인 fallback* 세 줄이고, 나머지는 그 세 줄이 왜 그런지의 증명이다.

### MEMORY.md — 인덱스가 요약이 아니라 본문

- 16개 항목 중 **byte 기준 16개 전부가 160 B 초과**(char 기준으로는 15개 — 한글 1.19~1.85 B/char이라 두 축이 갈린다). 최대 1,356 B.
- memory 계약은 `- [Title](file.md) — hook` **한 줄**을 요구한다.
- **stale 4건 실측**: 인덱스가 `OPEN`이라 주장하는 PR #102·#107·#115·#116이 gh 확인 결과 전부 `MERGED`.
- **분류 혼선**: 16개 중 9개가 PRD/milestone **사이클 상태**다. memory 계약이 금지한 "repo가 이미 기록하는 것"이며 PR 머지 순간 stale이 된다.

### 이전 목적지 실측

| 목적지 | 현재 | 상태 |
|---|---|---|
| `docs/ENVIRONMENT.md` | 22,575 B, MCCP_/CLAUDE_ 식별자 38개 | **stale** — 56개에 못 미치고 `## 5. mccp Auto-handoff (S10b, 🚧 미구현)`처럼 ship된 항목을 미구현으로 표기 |
| `docs/gate-design.md` | 19,005 B | 사용 가능 |
| `docs/multi-session-work-loop/evidence-conflict-design.md` | 존재 | §3.12 서사 목적지 |
| `docs/milestone-log.md` | 없음 | Task 1이 생성 |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 상세 문서 분리 | [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) | env 상세의 기존 목적지가 이미 존재 — 신규 디렉토리 신설 없이 흡수 |
| 이력 아카이브 | [CHANGELOG.md](CHANGELOG.md) | 77개 버전 항목이 milestone 서사를 이미 소유 |
| 규칙 승격 | [CLAUDE.md](CLAUDE.md) §3.5.1 | memory → CLAUDE.md 승격 시 memory 본문에 승격 사실을 남기는 관행 |
| 완료 산출물 은퇴 | [CLAUDE.md](CLAUDE.md) §3.11 | `archived/` 이동 + 비재귀 스캔으로 활성 표면에서 제외 |
| 요약 후 포인터 | [CLAUDE.md](CLAUDE.md) §5 | 한 줄 + 경로 포인터 형식 |
| **주입비용 계측** | [msw-metrics/a3-instruction-cost.js](plugins/mccp/scripts/lib/msw-metrics/a3-instruction-cost.js) | CLAUDE.md·MEMORY 인덱스·STATE 블록의 **토큰**을 재고 200k 창 대비 비율을 내는 전용 계측기가 이미 존재. Validation 10이 같은 인코딩(`o200k_base`)·같은 3-컴포넌트 분해를 따른다 — R1 시점 plan은 이 자산을 못 보고 바이트 대용치를 새로 발명했다(자체감사 적발) |

## Files to Change

| File | Action | Why |
|---|---|---|
| `CLAUDE.md` | UPDATE | §1.4 표 축약 · §4 토글 표 축약 · §3.6/3.9/3.10/3.12 서사 이전 |
| `docs/milestone-log.md` | CREATE | §1.4 27행을 **원문 그대로** 이전받는 목적지 |
| `docs/ENVIRONMENT.md` | UPDATE | env 56개 전체 서술 이전 + stale 상태 마커 정합화 |
| `docs/gate-design.md` | UPDATE | §3.6 lock 모델 · §3.9/§3.10 critique·routing 상세 이전받음 |
| `docs/multi-session-work-loop/evidence-conflict-design.md` | UPDATE | §3.12 milestone 서사(M1/M2/M3) 이전받음 |
| `.claude/state/memory-baseline.json` | CREATE | repo 밖 memory 17파일의 이름·바이트·sha256 baseline (Validation 5b가 대조) |
| `.claude/plans/context-budget-cleanup.plan.md` | CREATE | 본 plan |

> **repo 밖 (git 미추적).** 아래 memory 표면은 `C:/Users/skypark207/.claude/projects/c---project-my-mccp/memory/` 에 있어 git이 추적하지 않는다. `plan_hash`·cross-gate dedupe·`git diff`가 이 절반을 **볼 수 없다**. 초안은 "바이트 카운트로 자립"이라 적었으나 그건 과장이었다(R1 B-F9) — 바이트만으로는 내용 변조를 못 잡는다. 그래서 baseline manifest에 **sha256을 넣고** 무편집 대상 12파일은 해시 동일성으로 검증한다.

| Path (repo 밖) | Action | Why |
|---|---|---|
| `memory/MEMORY.md` | UPDATE | 16개 항목 전부 한 줄 hook으로 정규화(byte 기준) |
| `memory/{integrity-unification-m3, multi-session-work-loop-m3, workflow-orchestration-m1, cost-model-subscription-remediation}.md` | UPDATE | stale PR 상태만 **추가 전용** 정정 |
| 나머지 12파일 | 무편집 | sha256 동일성 검증 대상 |

## Tasks

### Task 1: §1.4 milestone 표를 `docs/milestone-log.md`로 이전

- **Action**: 27행(29,541 B)을 **원문 그대로** 신규 `docs/milestone-log.md`에 옮긴다. CLAUDE.md에는 잔류 대상만 한 줄씩(모듈 · 역할 · 상세 포인터).
- **잔류 판정은 기계 규칙이다**(R1 A-F8 / B-F10 — 초안의 "이번 세션에 필요한가"는 재현 불가였다). 다음 2조건을 **모두** 만족하는 행만 CLAUDE.md에 한 줄로 남는다:
  1. 그 행이 인용한 **primary path가 현재 repo에 실재**한다 (`git ls-files`로 확인).
  2. 같은 서브시스템(= primary path의 디렉토리)을 다루는 행 중 **가장 최신 version**이다. 선행 milestone 행은 후속에 흡수된 것으로 보고 log로만 보낸다.
- 두 조건은 스크립트로 판정 가능하며 판정 결과(잔류/이전 27행 분류표)를 `docs/milestone-log.md` 머리말에 기록해 재현성을 남긴다.
- **Validate**: Validation 3 — 27행 first-column 키가 source와 destination에서 **집합 동일**(개수가 아니라 정체성).

### Task 2: §4 운영 토글을 요약 표로 축약, 상세는 `docs/ENVIRONMENT.md`로

- **Action**: CLAUDE.md는 `| env | default | 한 줄 효과 | 상세 |` 4열 표만 유지(**56행**). 각 env의 full 서술은 `docs/ENVIRONMENT.md`의 env별 앵커(`### MCCP_X`)로 옮기고 표의 `상세` 열이 그 앵커를 가리킨다.
- **불변식**: `default` 값과 kill-switch 동작은 **CLAUDE.md에 남는다**. 운영자가 토글을 끄려 할 때 문서를 열지 않아도 되어야 한다. 옮기는 것은 *왜 그 default인가* 뿐이다.
- **은퇴 토글 처리**: `MCCP_ORCHESTRATION_DEBT_DECAY_HOURS`는 표에 **넣지 않는다**(정의가 없음). 은퇴 서술은 `docs/ENVIRONMENT.md`의 "Retired" 절로 옮긴다.
- **목적지 정합화가 선행 조건**: `docs/ENVIRONMENT.md`는 38개만 다루고 ship된 항목을 `🚧 미구현`으로 표기 중이다. 이전은 "옮기기 + 정합화"이며, stale 문서로 옮기면 "옮겼다"가 "묻었다"가 된다.
- **Validate**: Validation 2 — 표 56행 ↔ ENVIRONMENT.md 앵커 **양방향 집합 동일**, 은퇴 토글 표 부재, 표의 각 행에 default 토큰 존재(Validation 7 usability).

### Task 3: §3.6 / §3.9 / §3.10 / §3.12 서사 이전

- **Action**: 네 섹션(26,715 B — 레벨 인지 실측)에서 규칙만 남기고 서사를 목적지로 옮긴다 — §3.6/§3.9/§3.10 → [docs/gate-design.md](docs/gate-design.md), §3.12 → [docs/multi-session-work-loop/evidence-conflict-design.md](docs/multi-session-work-loop/evidence-conflict-design.md).
- **분류도 기계 규칙이다**(R1 B-F8). 문장 단위로:
  - **잔류(규칙)** — 규범 표지(`하라`/`한다`/`금지`/`필수`/`must`/`never`)를 포함하거나, default 값을 명시하거나, 복구 절차를 서술하는 문장.
  - **이전(서사)** — version 표지(`vN.N.N`), 라운드 표지(`R1`/`R2`/`N라운드`), finding id(`F1`~`F9`), PR 번호를 포함하는 문장. 단 위 잔류 조건과 동시에 해당하면 **잔류가 우선**한다(규칙이 version을 인용할 수 있으므로).
- **보존 의무 키워드 6종**(Acceptance와 동일 — 초안은 3개만 적어 불일치였다, R1 B-F6): `no-rehash` · `ownership_token_hash` · `Output Constraints` · `--diff-filter=D` · `forward-only` · `codex_verdict`. 단 **키워드 존재는 증거가 아니다**(R1 B-F4) — 진짜 증거는 Validation 8이고, Validation 4는 해당 키워드가 **원래 소속 섹션 안에** 남아 있는지까지 확인한다.
- **Validate**: 네 섹션 합 ≤ 12,000 B(Validation 6) + Validation 4 + Validation 8.

### Task 4: MEMORY.md 인덱스를 한 줄 hook으로 정규화

- **Action**: 전 항목을 `- [Title](file.md) — <한 줄 hook>` 형식으로 재작성, 항목당 **≤ 160 바이트**(char 아님 — 한글은 1.19~1.85 B/char이라 char 검사는 목표보다 느슨하다, R1 A-F5/B-F5). PR 번호·머지 여부는 **제거**한다(git이 소유하는 값이라 인덱스에 실리면 구조적으로 다시 stale해진다).
- **hook 작성 기준**: "언제 이 memory를 꺼내야 하는가"만 적는다. 결론·수치는 본문 소관.
- **Validate**: Validation 5 — `Buffer.byteLength(line,'utf8') ≤ 160` 전 항목 + 파일 ≤ 2,500 B + 링크 무결성.

### Task 5: stale memory 상태 주장 비파괴 정정 — **삭제 없음**

> **결정(2026-08-09)** — 초안은 사이클 상태 memory 9건(~88 KB)을 증류 후 삭제하려 했다. 사용자가 **삭제 없음**을 선택해 철회한다. 근거: (1) 세션 주입 대상은 인덱스뿐이라 삭제가 예산을 줄이지 않는다, (2) repo 밖이라 되돌릴 수 없다.

- **Action**: 파일은 **전부 보존**한다. stale해진 상태 주장만 각 본문에 **한 줄 추가**로 정정한다(기존 문장 삭제 금지). gh 실측 4건:

| 파일 | 잘못된 주장 | 실측 | 추가할 줄 |
|---|---|---|---|
| `integrity-unification-m3.md` | "PR #115 OPEN" | MERGED 2026-07-30 | `> 상태(2026-08-09): PR #115 MERGED.` |
| `multi-session-work-loop-m3.md` | "PR #116 OPEN" | MERGED 2026-08-08 | `> 상태(2026-08-09): PR #116 MERGED.` |
| `workflow-orchestration-m1.md` | "M3=PR #107 OPEN" | MERGED 2026-07-21 | `> 상태(2026-08-09): PR #107 MERGED.` |
| `cost-model-subscription-remediation.md` | "PR #102 OPEN" | MERGED 2026-07-14 | `> 상태(2026-08-09): PR #102 MERGED.` |

- **증류본은 만들지 않는다** — 원본이 남으므로 중복이다. recall 가능성은 Task 4의 hook이 유지한다.
- **Validate**: Validation 5b — 17파일 전수 존재, 무편집 12파일은 **sha256 동일**, 편집 4파일은 바이트 증가만, `MEMORY.md`만 감소 허용.

### Task 6: 이전 완결성 기계 검증 스크립트 작성

- **Action**: Validation 8의 고아-줄 검사를 `scripts/verify-relocation.js`가 아니라 **plan의 Validation 블록 안에 완성된 형태로** 둔다(초안은 "집합 비교 스크립트를 돌린다"고만 적고 스크립트를 명시하지 않았다 — R1 B-F8). 아래 Validation 8이 그 스크립트다.
- **판정**: `git diff`가 CLAUDE.md에서 지운 줄 중 정규화 길이 ≥ 40인 것 전부에 대해, 그 정규화 80자 prefix가 목적지 문서 union(잔류 CLAUDE.md 포함)에 존재해야 한다. 하나라도 없으면 실패 + 고아 목록 출력.
- **왜 이게 핵심인가**: 행 수·키워드·바이트는 원문이 뭉개져도 통과한다. 고아 검사만이 "지운 것이 도착했다"를 직접 검사한다.

## Validation

> 이 블록은 **Git Bash**에서 실행한다(레포의 다른 Validation 블록과 동일 규약). PowerShell에서는 `node -e` 부분만 따로 실행하라.

```bash
# 1) 표면 바이트 예산 (작업 후에만 통과 — 작업 전 실패가 정상)
node -e "
const fs=require('fs');
const c=fs.statSync('CLAUDE.md').size;
const m=fs.statSync('C:/Users/skypark207/.claude/projects/c---project-my-mccp/memory/MEMORY.md').size;
console.log('CLAUDE.md',c,c<=60000?'OK':'FAIL(>60000)');
console.log('MEMORY.md',m,m<=2500?'OK':'FAIL(>2500)');
process.exit((c<=60000&&m<=2500)?0:1);
"

# 2) env 양방향 집합 동일성 — 요약 표 56행 ↔ ENVIRONMENT.md 앵커 (은퇴 토글 제외)
node -e "
const fs=require('fs');
const RETIRED=new Set(['MCCP_ORCHESTRATION_DEBT_DECAY_HOURS']);
const table=new Set([...fs.readFileSync('CLAUDE.md','utf8')
  .matchAll(/^\|\s*\\\`(MCCP_[A-Z0-9_]+)\\\`/gm)].map(m=>m[1]));
const docs=new Set([...fs.readFileSync('docs/ENVIRONMENT.md','utf8')
  .matchAll(/^#{2,4}\s*\\\`?(MCCP_[A-Z0-9_]+)\\\`?/gm)].map(m=>m[1]));
const a=[...table].filter(n=>!docs.has(n));
const b=[...docs].filter(n=>!table.has(n)&&!RETIRED.has(n));
const r=[...table].filter(n=>RETIRED.has(n));
console.log('table',table.size,'(기대 56) docs',docs.size);
console.log('table→docs 누락',a); console.log('docs→table 누락',b); console.log('표에 남은 은퇴 토글',r);
process.exit((table.size!==56||a.length||b.length||r.length)?1:0);
"

# 3) milestone 행 정체성 — 개수가 아니라 first-column 키 집합 동일
#    (R2 자체감사: 목적지 부재 시 크래시하던 것을 깨끗한 FAIL로 교체)
node -e "
const fs=require('fs'),cp=require('child_process');
const DST='docs/milestone-log.md';
if(!fs.existsSync(DST)){console.log('FAIL: '+DST+' 없음 (Task 1 미완)');process.exit(1)}
const key=t=>[...t.matchAll(/^\|\s*\*\*(.+?)\*\*/gm)].map(m=>m[1].trim());
const src=key(cp.execSync('git show origin/main:CLAUDE.md',{encoding:'utf8',maxBuffer:1e8}));
const dst=key(fs.readFileSync(DST,'utf8'));
const miss=src.filter(k=>!dst.includes(k)), dup=dst.filter((k,i)=>dst.indexOf(k)!==i);
console.log('source rows',src.length,'(기대 27) dest rows',dst.length);
console.log('미도착',miss); console.log('중복',dup);
process.exit((src.length!==27||miss.length||dup.length)?1:0);
"

# 4) 불변식 키워드가 '원래 소속 섹션 안에' 살아있는가 (파일 어딘가가 아니라)
#    (R2 자체감사: 이전 판은 다음 heading을 레벨 무관하게 잘라 하위 #### 내용을
#     섹션 밖으로 밀어냈고, 멀쩡한 키워드 4개를 '소실'로 오판했다. 레벨 인지로 교체)
node -e "
const fs=require('fs');const lines=fs.readFileSync('CLAUDE.md','utf8').split(/\r?\n/);
let fence=false;const h=[];
lines.forEach((l,i)=>{if(/^\`\`\`/.test(l))fence=!fence;
  const m=!fence&&l.match(/^(#{2,4})\s/); if(m)h.push({i,lvl:m[1].length,t:l.trim()})});
function sec(n){for(let k=0;k<h.length;k++){ if(!h[k].t.includes(n))continue;
  let end=lines.length; for(let j=k+1;j<h.length;j++){if(h[j].lvl<=h[k].lvl){end=h[j].i;break}}
  return lines.slice(h[k].i,end).join('\n');} return '';}
const need=[['3.12','no-rehash'],['3.6','ownership_token_hash'],['3.9','Output Constraints'],
            ['3.5.1','--diff-filter=D'],['3.7','forward-only'],['3.12','codex_verdict']];
const lost=need.filter(([s,k])=>!sec(s).includes(k));
console.log('섹션 밖으로 이탈/소실:',lost);
process.exit(lost.length?1:0);
"

# 5) MEMORY.md — 바이트 기준 줄 상한 + 링크 무결성 (char 아님)
node -e "
const fs=require('fs'),p='C:/Users/skypark207/.claude/projects/c---project-my-mccp/memory/';
const idx=fs.readFileSync(p+'MEMORY.md','utf8');
const rows=idx.split(/\r?\n/).filter(l=>l.trim().startsWith('- ['));
const over=rows.filter(l=>Buffer.byteLength(l,'utf8')>160);
const dead=[...idx.matchAll(/\]\(([^)]+\.md)\)/g)].map(m=>m[1]).filter(f=>!fs.existsSync(p+f));
const pr=rows.filter(l=>/#\d{2,}|MERGED|OPEN/.test(l));
console.log('rows',rows.length,'over-160B',over.length,'dead links',dead,'PR상태 잔존',pr.length);
over.slice(0,5).forEach(l=>console.log('  OVER',Buffer.byteLength(l,'utf8'),'B:',l.slice(0,50)));
process.exit((over.length||dead.length||pr.length)?1:0);
"

# 5b) 비파괴 불변식 — baseline manifest(sha256) 대조. 삭제 0건 + 무편집 파일 무변조
node -e "
const fs=require('fs'),crypto=require('crypto');
const p='C:/Users/skypark207/.claude/projects/c---project-my-mccp/memory/';
const base=JSON.parse(fs.readFileSync('.claude/state/memory-baseline.json','utf8'));
const EDIT=new Set(['integrity-unification-m3.md','multi-session-work-loop-m3.md',
  'workflow-orchestration-m1.md','cost-model-subscription-remediation.md']);
const gone=[],tampered=[],shrunk=[];
for(const [f,b] of Object.entries(base.files)){
  if(!fs.existsSync(p+f)){gone.push(f);continue}
  const buf=fs.readFileSync(p+f);
  const h=crypto.createHash('sha256').update(buf).digest('hex');
  if(f==='MEMORY.md') continue;                       // 인덱스는 축소가 목표
  if(EDIT.has(f)){ if(buf.length<b.bytes) shrunk.push(f); }   // 추가 전용
  else if(h!==b.sha256) tampered.push(f);                     // 무편집 12파일
}
const now=fs.readdirSync(p).filter(f=>f.endsWith('.md')).length;
console.log('baseline',base.file_count,'now',now,'| 삭제',gone,'| 무편집 변조',tampered,'| 축소',shrunk);
process.exit((gone.length||tampered.length||shrunk.length||now!==base.file_count)?1:0);
"

# 6) 섹션별 바이트 예산 — 전체 크기만으로는 '의도한 자리'가 줄었는지 못 본다
#    (R2 자체감사: 진단 표와 같은 레벨 인지 측정으로 통일. 이전 판은 인접 섹션을 삼켜
#     §1.4를 31,381로, §4를 35,509로, §3.12를 11,005로 과다 계상했다)
node -e "
const fs=require('fs');const lines=fs.readFileSync('CLAUDE.md','utf8').split(/\r?\n/);
let fence=false;const h=[];
lines.forEach((l,i)=>{if(/^\`\`\`/.test(l))fence=!fence;
  const m=!fence&&l.match(/^(#{2,4})\s/); if(m)h.push({i,lvl:m[1].length,t:l.trim()})});
function size(n){for(let k=0;k<h.length;k++){ if(!h[k].t.includes(n))continue;
  let end=lines.length; for(let j=k+1;j<h.length;j++){if(h[j].lvl<=h[k].lvl){end=h[j].i;break}}
  return lines.slice(h[k].i,end).join('\n').length;} return -1;}
const s14=size('1.4'), s4=size('운영 토글');
const four=['3.6','3.9','3.10','3.12'].map(size);
const sum4=four.reduce((a,b)=>a+b,0);
console.log('§1.4',s14,'(기준선 29808 → <=6000) §4토글',s4,'(33971 → <=6000)');
console.log('4섹션합',sum4,'(26715 → <=12000)',four);
process.exit((s14>0&&s14<=6000&&s4>0&&s4<=6000&&four.every(x=>x>0)&&sum4<=12000)?0:1);
"

# 7) 사용성 게이트 — 작아진 게 아니라 '여전히 쓸 수 있는' 지시문인가
#    (R2 자체감사: 표가 아직 없으면 rows=0 → 공허하게 PASS하던 것을 56행 요구로 차단)
node -e "
const fs=require('fs');const c=fs.readFileSync('CLAUDE.md','utf8');
const rows=[...c.matchAll(/^\|\s*\\\`(MCCP_[A-Z0-9_]+)\\\`\s*\|([^|]*)\|/gm)];
const noDefault=rows.filter(m=>!/default|기본|없음/i.test(m[2])).map(m=>m[1]);
const anchors=['/mccp:work','/mccp:plan','/mccp:pr','/codex:setup','MCCP_RECEIPT_GATE_MODE'];
const lostAnchor=anchors.filter(a=>!c.includes(a));
const stale=(fs.readFileSync('docs/ENVIRONMENT.md','utf8').match(/🚧\s*미구현|🚧\s*예정/g)||[]).length;
console.log('env 표 행수',rows.length,'(>=56 필요) | default 없는 행',noDefault);
console.log('사라진 운영 앵커',lostAnchor,'| ENVIRONMENT stale 마커',stale);
process.exit((rows.length<56||noDefault.length||lostAnchor.length||stale>0)?1:0);
"

# 8) ★핵심★ 이전 완결성 — 지운 줄이 전부 목적지에 도착했는가 (고아 0건)
#    (R2 자체감사: 작업 전에는 삭제 0 → 고아 0 → 공허 PASS였다. 실질 압축이
#     일어났음을 함께 요구해 '아직 안 했음'과 '완벽히 했음'을 구분한다)
node -e "
const fs=require('fs'),cp=require('child_process');
const del=cp.execSync('git diff -U0 origin/main -- CLAUDE.md',{encoding:'utf8',maxBuffer:1e8})
  .split(/\r?\n/).filter(l=>l.startsWith('-')&&!l.startsWith('---')).map(l=>l.slice(1));
const norm=s=>s.replace(/[\s|*\`\[\]()#>·—-]/g,'');
const dests=['CLAUDE.md','docs/milestone-log.md','docs/ENVIRONMENT.md','docs/gate-design.md',
  'docs/multi-session-work-loop/evidence-conflict-design.md']
  .filter(f=>fs.existsSync(f)).map(f=>norm(fs.readFileSync(f,'utf8'))).join('|SEP|');
const orphans=del.map(norm).filter(k=>k.length>=40).filter(k=>!dests.includes(k.slice(0,80)));
console.log('삭제된 줄',del.length,'(>=400 필요 — 공허 PASS 차단) | 고아',orphans.length);
orphans.slice(0,15).forEach(o=>console.log('  ORPHAN:',o.slice(0,90)));
process.exit((del.length<400||orphans.length)?1:0);
"

# 9) 회귀 — 절대 green이 아니라 baseline 대비. 이 레포는 착수 시점에 이미 red 7건이며
#    (gate-guard-integrity PRD 승계분) 문서 변경이 그 수를 늘리지 않았는지만 본다.
#    (R2 자체감사: 이전 판은 절대 green을 요구해 내 작업과 무관하게 항상 실패했다)
node --test $(find plugins/mccp/scripts -name '*.test.js' | tr '\n' ' ') 2>&1 \
  | grep -E '^✖ ' | grep -v '^✖ failing tests' | sed -E 's/ \([0-9.]+ms\)$//' | sort -u > /tmp/mccp-red-now.txt
cat > /tmp/mccp-red-base.txt <<'BASE'
✖ receipt-prompt: module-load error emits systemMessage + allows (G1)
✖ receipt-skill: module-load error emits systemMessage + allows (G1)
✖ receipt-prompt: no session_id → G1 allows + emits systemMessage without trace path
✖ plugins\mccp\scripts\lib\tests\a3-instruction-cost.test.js
✖ M3 finalize: skipped WITH audited reason → exit 0 (proven skip ships)
✖ M3 finalize: skipped WITHOUT reason (unproven) → exit 12 (fail-closed) [F2]
✖ validate-callsite-lint: every validate call in command bodies forwards --decision AND --plan
BASE
echo "신규 실패(baseline에 없던 것):"; comm -13 <(sort -u /tmp/mccp-red-base.txt) /tmp/mccp-red-now.txt

# 10) 토큰 축 — 사용자가 말한 단위. a3-instruction-cost.js와 같은 o200k_base 인코딩.
#     (모듈 자체는 python3 하드코딩으로 Windows에서 불능 — gate-guard-integrity 소관)
node -e "
const fs=require('fs');
fs.writeFileSync('/tmp/a3in.json', JSON.stringify({
  claude_md: fs.readFileSync('CLAUDE.md','utf8'),
  memory_index: fs.readFileSync('C:/Users/skypark207/.claude/projects/c---project-my-mccp/memory/MEMORY.md','utf8'),
  state_block: fs.existsSync('.claude/state/STATE.md')?fs.readFileSync('.claude/state/STATE.md','utf8'):''
}),'utf8');
"
python -c "
import tiktoken, json, sys
enc = tiktoken.get_encoding('o200k_base')
d = json.load(open('/tmp/a3in.json', encoding='utf-8'))
n = {k: len(enc.encode(v)) for k, v in d.items()}
tot = sum(n.values())
for k, v in n.items(): print('%-14s %7d tok' % (k, v))
print('%-14s %7d tok = %.1f%% of 200k (baseline 50049 = 25.0%%)' % ('TOTAL', tot, tot/2000.0))
ok = n['claude_md'] <= 16900 and n['memory_index'] <= 800
print('VERDICT', 'OK' if ok else 'FAIL (claude_md<=16900, memory_index<=800)')
sys.exit(0 if ok else 1)
"

# 11) §3.5.1 삭제 검증 의무
git diff --diff-filter=D --name-only origin/main...HEAD
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **정보 손실** — 서사가 없어지면 다음 사이클이 같은 결함을 다시 유도 | High | 원칙을 *삭제*가 아니라 *이전*으로 고정하고, **Validation 8**이 지운 줄의 도착을 전수 검사한다. §1.4에서 CLAUDE.md 밖으로 나가는 행도 `docs/milestone-log.md`에 원문 보존되므로 순수 제거는 어디에도 없다 |
| **"이전"이 실은 "매장"** — docs로 옮겼는데 아무도 안 읽으면 삭제와 같다 | Medium | CLAUDE.md 잔류 줄이 **반드시 포인터를 동반**하고(§5 형식), Validation 7이 운영 앵커 5종 잔존을 확인한다. 다만 "읽힘"은 기계로 증명 불가 — 이건 잔여 리스크로 남는다 |
| **병렬 worktree 충돌** — 활성 worktree 5개가 CLAUDE.md 보유 | High | "빨리 랜딩"은 통제가 아니다(R1 B-F9). 실제 통제: (1) 착수 전 `git -C <각 worktree> status --short CLAUDE.md`로 미커밋 편집 유무를 전수 확인, (2) 랜딩 후 각 worktree에서 즉시 rebase하며 CLAUDE.md 충돌은 **압축본을 base로 취하고 상대 브랜치의 신규 §만 재적용**, (3) §3.5.1 `--diff-filter=D` 검증 |
| **§3.7 지침과의 외견상 충돌** | Medium | 규칙 자체는 전부 CLAUDE.md 잔류. 옮기는 것은 규칙의 *도출 과정*뿐임을 §5 포인터에 명시 |
| **repo 밖 절반을 게이트가 못 봄** | Medium | baseline manifest의 **sha256**으로 무편집 12파일 무변조를 증명(바이트만으로는 변조를 못 잡음). MEMORY.md·편집 4건은 방향 제약(감소/증가)으로 검증 |
| ~~바이트 감축 ≠ 토큰 감축~~ | — | **해소(R2)** — Validation 10이 `o200k_base`로 **토큰을 직접** 잰다. 대용치 논쟁이 사라졌고 수용 기준이 사용자가 말한 단위와 같아졌다 |
| **목표치가 임의적** | Low | 60,000 B는 §1.4·§4·4섹션 상한(6,000+6,000+12,000)과 잔류 70,426 B에서 역산됐고, 토큰 목표 16,900은 그 바이트를 실측 비율 3.55 B/token으로 환산한 값이다. Validation 6이 **자리별로** 강제하므로 전체 수치만 맞추는 편법이 통하지 않는다 |
| **A3 계측기가 Windows에서 불능** | Medium | 본 plan은 고치지 않는다 — `python3` 하드코딩 결함은 STATE.md대로 gate-guard-integrity PRD가 승계한 red 7건에 속한다. Validation 10이 같은 인코딩으로 독립 측정해 이 plan의 수용 판정은 그 결함에 의존하지 않는다 |

## Acceptance

- [ ] **`CLAUDE.md` ≤ 16,900 토큰 · `MEMORY.md` ≤ 800 토큰** (현 45,357 / 3,393) — Validation 10 **(1차 기준)**
- [ ] 주입 합계 200k 창 점유 25.0% → 10% 미만 — Validation 10
- [ ] `CLAUDE.md` ≤ 60,000 B (현 160,920 B) — Validation 1
- [ ] §1.4 ≤ 6,000 B · §4 토글 ≤ 6,000 B · §3.6+3.9+3.10+3.12 ≤ 12,000 B — Validation 6
- [ ] `MEMORY.md` ≤ 2,500 B, 전 항목 ≤ 160 **바이트**, PR 상태 0건 — Validation 5
- [ ] memory 17파일 전수 존재 · 무편집 12파일 **sha256 동일** · 편집 4파일 바이트 비감소 — Validation 5b
- [ ] milestone 27행 first-column 키가 source↔`docs/milestone-log.md` **집합 동일**, 중복 0 — Validation 3
- [ ] env 표 **56행** ↔ `docs/ENVIRONMENT.md` 앵커 **양방향 동일**, 은퇴 토글 표 부재 — Validation 2
- [ ] 불변식 키워드 6종이 **원래 소속 섹션 안에** 잔존 — Validation 4
- [ ] 운영 앵커 5종 잔존 · 표의 모든 env 행에 default 표기 · `ENVIRONMENT.md` stale 마커 0건 — Validation 7
- [ ] **삭제된 줄 고아 0건** — Validation 8 (핵심 게이트)
- [ ] **신규** 테스트 실패 0건(baseline red 7건은 pre-existing, gate-guard-integrity 소관) — Validation 9
- [ ] `--diff-filter=D` 의도치 않은 삭제 0건 — Validation 11

## Open Questions

- ~~memory 삭제 승인 범위~~ — **해소(2026-08-09)**: 사용자가 "삭제 없음, 인덱스만 정리"를 선택.
- **`docs/milestone-log.md` 신설 vs CHANGELOG 흡수** — CHANGELOG.md가 같은 내용을 버전 축으로 이미 소유한다. 별도 파일 대신 병합하면 파일 수는 줄지만 "모듈 → 역할" 조회축이 사라진다. 현 plan은 신설을 택했다.
- **"읽힘"은 증명 불가** — Validation 7이 운영 앵커 잔존까지는 보지만, 옮겨진 docs를 실제로 참조하는지는 기계로 확인할 수 없다. 이전이 매장으로 변질되는지는 다음 사이클의 실사용에서만 드러난다.

## Codex Adversarial Review

> Codex skipped per `MCCP_CODEX_DISABLED=1` (env-level policy, first-class skip)

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review` (v1.23.3 wrapper, background + exit marker)
- 결과: `{"ok":true,"classification":"disabled","blocking":false,"advisory":false,"durationMs":0}`
- **출처: 사용자 레벨 `~/.claude/settings.json`** — 프로젝트 `.claude/settings.json`에는 이 키가 없다. 초안은 프로젝트 설정이라 적었고 그건 오류였다(santa-loop R1 Reviewer B F1이 적발; Reviewer A는 못 잡음).
- 라운드 수: 0 · `resolution.codex_verdict`: `skipped`

**이 plan은 mccp의 Codex 게이트를 받지 않았다.** 대신 사용자 지시로 **santa-loop**(적대적 dual-review)를 대체 실행했다.

### santa-loop R1 — NAUGHTY

| Reviewer | Model | Verdict | FAIL |
|---|---|---|---|
| A | Claude Opus (`code-reviewer`) | FAIL | 4/10 |
| B | Codex GPT-5.4 (`codex exec --sandbox read-only`) | FAIL | 9/10 |

**양쪽 공통**: Validation char↔byte 축 오류 · 행 수 검사가 원문 충실성 미증명 · Task 1/3 판정 기준 재현 불가 · env 검사 단방향

**A 단독**: env 개수 오류(55 → 실제 정의 56)

**B 단독**: `settings.json` 출처 허위 · Files to Change가 `evidence-conflict-design.md` 누락 · Risk 행에 철회된 삭제 서술 잔존 · Task 3 키워드 3 vs Acceptance 6 불일치 · Validation 7(구)이 **파일 내부 삭제에 공허** · 섹션별 바이트 검증 부재 · 17파일 불변 검증 부재 · 사용성 게이트 부재 · baseline이 해시 없는 하드코딩 · "land fast"/"바이트로 자립" 과장

**R2가 흡수한 것**: 위 전부. 가장 큰 구조 변경은 **Validation 8(고아 줄 전수 검사)** 신설 — R1 이전에는 "이전했다"를 증명하는 검사가 하나도 없었고 행 수·키워드·바이트는 원문이 뭉개져도 통과했다. 부수적으로 baseline manifest에 sha256을 넣고, Task 1/3의 주관적 판정을 기계 규칙으로 교체하고, 섹션별 예산·사용성 게이트를 추가했다.

### R2 자체감사 — Validation을 실제로 실행해서 나온 것

리뷰어 지적을 반영한 뒤 Validation 블록을 **추출해 그대로 돌렸다**. 검사 자체에서 결함 6건이 더 나왔다. 두 리뷰어 중 누구도 이걸 지적하지 못했다 — 둘 다 코드를 *읽었지* *실행하지* 않았기 때문이다.

| # | 결함 | 조치 |
|---|---|---|
| 1 | V3이 `docs/milestone-log.md` 부재 시 **ENOENT로 크래시** (실패가 아니라 예외) | `existsSync` 가드 → 깨끗한 FAIL |
| 2 | V4의 섹션 슬라이스가 heading **레벨을 무시**해 하위 `####` 내용을 섹션 밖으로 밀어냄 → 멀쩡한 키워드 4개를 "소실"로 **오판** | 레벨 인지 슬라이스로 교체, 실행 결과 오탐 0 |
| 3 | 진단표 수치가 **과다 계상** — 같은 레벨 무시 버그로 §1.4가 §2를, §4가 §5를, §3.12가 §4 앞부분을 삼킴 | 31,381→29,808 · 35,509→33,971 · 11,005→8,460로 정정하고 V6이 **같은 함수**를 쓰게 통일 |
| 4 | V7이 표가 없으면 `rows=0` → **공허하게 PASS** | `rows>=56` 요구 추가 |
| 5 | V8이 삭제가 없으면 고아 0 → **공허하게 PASS**(= 미착수와 완료를 구분 못 함) | `del>=400` 실질 압축 요구 추가 |
| 6 | V9가 **절대 green**을 요구 — 이 레포는 착수 시점에 이미 red 7건이라 내 작업과 무관하게 영구 실패 | baseline 7건 명시 + **신규 실패만** 판정 |

**같은 감사에서 나온 별건 — 레포에 이미 토큰 계측기가 있었다.** [msw-metrics/a3-instruction-cost.js](plugins/mccp/scripts/lib/msw-metrics/a3-instruction-cost.js)가 CLAUDE.md·MEMORY 인덱스·STATE 블록의 토큰을 재고 200k 창 대비 비율까지 낸다. R1 시점 plan은 이걸 못 보고 바이트 대용치를 발명했고, 리뷰어 둘 다 "바이트가 토큰의 대용치로 타당한가"는 물었지만 "이미 있는 도구를 왜 안 쓰나"는 묻지 않았다. 이제 Patterns to Mirror에 등재하고 Validation 10이 같은 인코딩을 쓴다 — 덕분에 수용 기준이 사용자가 말한 단위와 일치하고 "바이트≠토큰" 리스크가 해소됐다.

부수 발견: 그 모듈은 가용성은 `pip show tiktoken`으로 확인하면서 실제 토큰화는 **`python3`을 하드코딩**해 spawn한다. 이 Windows 머신에는 `python`(3.13.3)+tiktoken 0.13.0이 있고 `python3`이 없어 영구 `baseline_unavailable`이며, 이것이 red 7건 중 하나의 원인이다. **본 plan은 고치지 않는다** — gate-guard-integrity PRD가 승계한 잔존 red이고, 남의 PRD 범위를 조용히 침범하는 것보다 명시적으로 넘기는 게 맞다.
