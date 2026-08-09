# Plan: 세션 컨텍스트 예산 정리 (CLAUDE.md + auto-memory)

**Source PRD**: (없음 — free-form `/mccp:plan` 입력)
**Branch**: `chore/context-budget-cleanup` (worktree `.worktrees/context-budget-cleanup/`, base `origin/main` @ `77ceba2`)
**Complexity**: Medium
**Review**: santa-loop 3라운드 전부 NAUGHTY (R1 Opus 4/10·GPT-5.4 9/10 → R2 8/10·9/10 → R3 8/10·9/10). **상한 도달 → 사용자 에스컬레이션.** 검증된 지적은 전량 흡수했고 미해소 항목은 아래 §미해소에 열거한다. push 안 함.

## Summary

세션마다 자동 주입되는 두 표면 — `CLAUDE.md`(160,920 B / 849줄)와 auto-memory 인덱스 `MEMORY.md`(10,537 B / 16 항목 — 이 파일은 auto-memory 시스템이 세션 중에도 갱신하므로 값이 흔들린다. 2026-08-09 실측) — 이 지시문이 아니라 **아카이브**로 자라났다. 둘 다 "무엇을 결정해야 하는가"보다 "어떻게 여기까지 왔는가"를 더 많이 싣고 있고, 그 기록은 이미 `CHANGELOG.md`(318,378 B / 77 버전)·`docs/`·git history·PRD status 표가 소유한다.

이 plan은 **삭제가 아니라 이전(relocate)** 을 원칙으로 두 표면을 압축한다. 규칙·트리거·복구 절차는 CLAUDE.md에 남기고, 그 규칙이 어느 라운드에서 왜 나왔는지의 서사는 이미 존재하는 문서로 옮긴다. auto-memory는 **인덱스만** 정규화하고 memory 본문 파일은 **한 건도 삭제하지 않는다**(사용자 결정 2026-08-09).

목표는 **토큰 축이 1차, 바이트가 2차**다(사용자가 토큰으로 말했고, 레포에 이미 토큰 계측기가 있다):

| 축 | 현재 | 목표 |
|---|---|---|
| `CLAUDE.md` 토큰 | 45,357 | **≤20,000** (-56%) |
| `MEMORY.md` 토큰 | 3,393 | **≤800** (-76%) |
| 주입 합계 / 200k 창 | 50,049 = **25.0%** | 약 22,100 = **11.1%** |
| `CLAUDE.md` 바이트 | 160,920 | ≤70,000 (-56%) |
| `MEMORY.md` 바이트 | 10,537 | ≤2,500 |

**파괴적 변경 0건.**

> **"이전했다"는 주장이 아니라 검사다.** R1 리뷰의 핵심 지적이 정확히 이것이었다 — 키워드 6개 존재와 행 수(24)는 원문이 통째로 뭉개져도 통과한다. 그래서 본 개정은 **Validation 8(고아 줄 검사)** 를 중심 게이트로 둔다: `git diff`가 CLAUDE.md에서 지운 모든 실질 줄이, 목적지 문서 어딘가에 정규화 일치로 도착했음을 기계로 확인하고, 하나라도 도착하지 못하면 실패한다. 나머지 검사는 그 위의 보조 게이트다.

## 실측 진단

### CLAUDE.md — 6개 섹션이 파일의 72.3%

| 섹션 | 바이트 | 비중 | 성격 |
|---|---|---|---|
| §4 「운영 토글 (환경 변수)」 | 44,462 | 27.6% | env **정의 56개**. 서술이 라운드별 finding 고고학 |
| §1.4 「v0.2 자동 게이트 레이어」 표 | 37,353 | 23.2% | **24행** milestone 출하 로그 = CHANGELOG 중복 |
| §3.12 증거 내구성 계약 | 11,734 | 7.3% | 규칙 + 3개 milestone 서사 누적 |
| §3.9 design critique | 7,967 | 5.0% | |
| §3.6 atomic state locks | 7,684 | 4.8% | |
| §3.10 impeccable routing | 7,074 | 4.4% | |
| 나머지 | 44,646 | 27.7% | 대체로 실제 지시문 |

> **수치 정정(R2 자체감사).** 초안은 §4=35,509 · §1.4=31,381 · §3.12=11,005이라 적었다. 그 측정이 heading **레벨**을 무시하고 다음 `###`까지 잘라 인접 섹션을 삼킨 결과다(§1.4는 §2 머리를, §4 토글은 §5를, §3.12는 §4 앞부분을 흡수). 위 표는 레벨 인지 측정이며 Validation 6이 **같은 함수**를 쓴다 — 진단과 검증이 다른 자로 재던 불일치를 제거했다.

### 토큰 실측 (사용자가 말한 단위)

사용자는 "claude.md 75k, 메모리 5k"라 했다. 레포에 이미 있는 계측기 [msw-metrics/a3-instruction-cost.js](plugins/mccp/scripts/lib/msw-metrics/a3-instruction-cost.js)와 같은 인코딩(tiktoken `o200k_base`)으로 실측한 값:

| 주입 표면 | 토큰 | 바이트 | B/token |
|---|---|---|---|
| `CLAUDE.md` | **45,357** | 160,920 | 3.55 |
| `MEMORY.md` 인덱스 | **3,393** | 10,537 | 3.11 |
| `.claude/state/STATE.md` 전체 | 1,299 | 4,267 | 3.28 |
| **합계** | **50,049** | 175,724 | — |

**200k 컨텍스트 창의 25.0%가 첫 토큰을 쓰기 전에 소비된다.** 사용자 추정(75k+5k=80k)보다는 낮지만 결론은 오히려 선명하다 — 문제는 과장이 아니라 실재한다.

목표는 **역산이 아니라 적산**이다(R2 Reviewer B F1이 초안의 역산을 산술 모순으로 적발). 섹션 예산에서 더해 올린다: 6,000(§1.4) + 6,000(§4 토글) + 12,000(4섹션) + 44,646(나머지, 손대지 않음) = **68,646 B** → 천장 **≤70,000 B**. 실측 비율 3.55 B/token으로 환산해 **≤20,000 토큰**. 주입 합계 50,049 → 약 22,100 토큰, 창 점유 **25.0% → 11.1%**.

> **초안의 60,000 B는 달성 불가능한 수치였다.** 같은 task set으로는 24,000(예산 3종) + 44,646(나머지) = 68,646 B가 하한인데 목표를 60,000으로 적었다 — 계획이 자기 산술과 모순이었고, 거기서 파생된 16,900 토큰 목표도 함께 거짓이었다. 나머지 44,646 B를 더 깎는 것은 §0·§1.1~1.3·§2·§3.1~3.5·§3.7·§3.8·§3.11·§5로 대부분 실제 지시문이라 **본 plan의 범위 밖**이다.

> **A3 계측기는 현재 Windows에서 불능이며 이 plan은 그것을 고치지 않는다.** `a3-instruction-cost.js`는 가용성은 `pip show tiktoken`으로 확인하면서 실제 토큰화는 `python3`을 하드코딩해 spawn한다. 이 머신에는 `python`(3.13.3) + tiktoken 0.13.0이 있고 `python3`은 없어 `baseline_unavailable`로 떨어지며, 이것이 잔존 red 7건 중 `a3-instruction-cost.test.js`가 빨간 이유다. 그 결함은 STATE.md대로 **gate-guard-integrity PRD가 승계한 잔존 red**에 속하므로 본 plan은 모듈을 건드리지 않고, Validation 10이 같은 인코딩으로 **독립 측정**만 한다.

> **A3와 동일 분해가 아니다(R3 Reviewer B 적발).** A3의 `state_block`은 STATE.md의 **frontmatter 블록**(`^---
…
---`)만 뽑는데 Validation 10은 STATE.md **파일 전체**를 센다. 따라서 위 표의 1,299 토큰은 A3 수치와 직접 비교할 수 없는 **상한**이다. 본 plan의 수용 기준은 `CLAUDE.md`와 `MEMORY.md` 두 축뿐이고 STATE는 맥락 정보이므로 판정에 영향은 없지만, "같은 3-컴포넌트 분해"라는 초안의 주장은 **거짓이었고 철회한다**.

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
| **주입비용 계측** | [msw-metrics/a3-instruction-cost.js](plugins/mccp/scripts/lib/msw-metrics/a3-instruction-cost.js) | CLAUDE.md·MEMORY 인덱스·STATE 블록의 **토큰**을 재고 200k 창 대비 비율을 내는 전용 계측기가 이미 존재. Validation 10이 같은 인코딩(`o200k_base`)을 쓴다(3번째 컴포넌트는 분해가 다름 — 아래 주석) — R1 시점 plan은 이 자산을 못 보고 바이트 대용치를 새로 발명했다(자체감사 적발) |

## Files to Change

| File | Action | Why |
|---|---|---|
| `CLAUDE.md` | UPDATE | §1.4 표 축약 · §4 토글 표 축약 · §3.6/3.9/3.10/3.12 서사 이전 |
| `docs/milestone-log.md` | CREATE | §1.4 **24행**을 **원문 그대로** 이전받는 목적지 |
| `docs/ENVIRONMENT.md` | UPDATE | env 56개 전체 서술 이전 + stale 상태 마커 정합화 |
| `docs/gate-design.md` | UPDATE | §3.6 lock 모델 · §3.9/§3.10 critique·routing 상세 이전받음 |
| `docs/multi-session-work-loop/evidence-conflict-design.md` | UPDATE | §3.12 milestone 서사(M1/M2/M3) 이전받음 |
| `.claude/state/memory-baseline.json` | CREATE | repo 밖 memory 17파일의 이름·바이트·sha256 baseline (Validation 5b가 대조) |
| `.claude/state/relocation-exceptions.txt` | CREATE | Validation 8이 읽는 "의도적 재작성" 등재부. 형식 `<정규화 원문 줄>  # reason: <사유>`. 삭제 줄의 5% 상한. 비어 있어도 파일은 존재해야 한다(부재 시 예외 0으로 취급) |
| `.claude/plans/context-budget-cleanup.plan.md` | CREATE | 본 plan |

> **repo 밖 (git 미추적).** 아래 memory 표면은 `C:/Users/skypark207/.claude/projects/c---project-my-mccp/memory/` 에 있어 git이 추적하지 않는다. `plan_hash`·cross-gate dedupe·`git diff`가 이 절반을 **볼 수 없다**. 초안은 "바이트 카운트로 자립"이라 적었으나 그건 과장이었다(R1 B-F9) — 바이트만으로는 내용 변조를 못 잡는다. 그래서 baseline manifest에 **sha256을 넣고** 무편집 대상 12파일은 해시 동일성으로 검증한다.

| Path (repo 밖) | Action | Why |
|---|---|---|
| `memory/MEMORY.md` | UPDATE | 16개 항목 전부 한 줄 hook으로 정규화(byte 기준) |
| `memory/{integrity-unification-m3, multi-session-work-loop-m3, workflow-orchestration-m1, cost-model-subscription-remediation}.md` | UPDATE | stale PR 상태만 **추가 전용** 정정 |
| 나머지 12파일 | 무편집 | sha256 동일성 검증 대상 |
| `memory-snapshot-2026-08-09/` (형제 디렉토리) | CREATE(완료) | **복구 경로**. 17파일 사본 + baseline 해시 17/17 일치 검증 완료. repo 밖 편집이 잘못되면 여기서 되돌린다(U2 해소) |

## Tasks

### Task 0: repo 밖 memory baseline 캡처 (다른 모든 작업보다 먼저)

- **Action**: memory 디렉토리를 **한 글자도 건드리기 전에** `.claude/state/memory-baseline.json`을 만든다. Validation 5b의 유일한 진실 원천이므로 편집 이후에 캡처하면 그 검사가 자기 자신을 승인하게 된다(R2 B-F7 — 초안은 이 캡처를 어느 task에도 배정하지 않았다).
- **스키마(고정)**:
  ```json
  { "captured_at": "YYYY-MM-DD",
    "file_count": 17,
    "files": { "<name>.md": { "bytes": <int>, "sha256": "<hex64>" } } }
  ```
- **Action(명령)**: `.md` 파일 전수를 정렬 순회하며 바이트와 sha256을 기록. git-tracked이므로 이후 어떤 세션에서도 대조 가능하다.
- **Validate**: `file_count === 17` ∧ 모든 항목이 `bytes` + `sha256` 보유 ∧ 실제 디렉토리와 파일명 집합 일치.

### Task 1: §1.4 milestone 표를 `docs/milestone-log.md`로 이전

- **Action**: **24행**(§1.4 전체 37,353 B 중 표 본문)을 **원문 그대로** 신규 `docs/milestone-log.md`에 옮긴다. CLAUDE.md에는 잔류 대상만 한 줄씩(모듈 · 역할 · 상세 포인터).
- **잔류 판정은 기계 규칙이다**(R1 A-F8 / B-F10 — 초안의 "이번 세션에 필요한가"는 재현 불가였다). 다음 2조건을 **모두** 만족하는 행만 CLAUDE.md에 한 줄로 남는다:
  1. 그 행이 인용한 **primary path가 현재 repo에 실재**한다 (`git ls-files`로 확인).
  2. 같은 서브시스템(= primary path의 디렉토리)을 다루는 행 중 **가장 최신 version**이다. 선행 milestone 행은 후속에 흡수된 것으로 보고 log로만 보낸다.
- 두 조건은 스크립트로 판정 가능하며 판정 결과(잔류/이전 24행 분류표)를 `docs/milestone-log.md` 머리말에 기록해 재현성을 남긴다.

#### 잔류 manifest — 24행 전수 판정 (U1 해소)

리뷰어 양측이 3라운드 내내 "기계 규칙"이 여전히 해석 여지를 남긴다고 지적했다. 24행은 열거 가능한 크기이므로 **규칙을 서술하는 대신 판정 결과를 그대로 싣는다**. 구현자는 해석하지 않고 이 표를 따른다.

판정 축은 **계보 승계**다 — 같은 서브시스템을 뒤 milestone이 흡수했으면 앞 행은 log로만 간다(내용은 `docs/milestone-log.md`에 원문 보존되므로 소실 아님).

| # | 행 | 판정 | 근거 |
|---|---|---|---|
| 1 | Stop-loop | **잔류** | 독립 서브시스템, 후속 흡수 없음 |
| 2 | STATE.md continuity | **잔류** | 독립, §3.2가 참조 |
| 3 | Auto-handoff | **잔류** | 독립, §4 토글이 참조 |
| 4 | `/mccp:work` | **잔류** | 진입점 |
| 5 | dual-reviewer escalate | **잔류** | 독립 |
| 6 | Codex disabled honor | **잔류** | §3.3 classification 표가 의존 |
| 7 | Codex/impeccable scope split | **잔류** | 독립 |
| 8 | dispatch-controller (Stage 2 M1) | **잔류** | IPC substrate — 15~20이 그 위에 얹힌 것이지 대체가 아님 |
| 9 | v1.3.0 schema baseline | 이전 | 문서 freeze 자체가 산출물이고 그 문서가 §5에 이미 등재 |
| 10 | derive engine (m1) | **잔류** | 독립 모듈, §5 등재 |
| 11 | briefing stamp (m2) | **잔류** | 독립 모듈 |
| 12 | STATUS.md + HTML renderer (m3) | **잔류** | 독립 모듈, §5 등재 |
| 13 | Refresh trigger + privacy guard (m4) | **잔류** | 독립 모듈 |
| 14 | cwd-mask + branch-validation polish | 이전 | patch 흡수분, 별도 표면 없음 |
| 15 | work implement isolation (1.20.2 M1) | 이전 | 20이 승계 |
| 16 | plan fan-out (1.20.4 M1) | **잔류** | 별도 축(plan GROUND), 승계 아님 |
| 17 | single-worker Workflow 이전 (1.20.7 M2a) | 이전 | 18→20이 승계 |
| 18 | N-worker parallel scaffold (1.20.10 M2b) | 이전 | 20이 승계(default flip) |
| 19 | aggregate verify + worktree-merge substrate | **잔류** | verify는 병렬과 직교(⊥) 축 |
| 20 | 병렬 활성화 worktree-merge live (1.21.0 M4) | **잔류** | implement-dispatch 계보의 최신 |
| 21 | cost-state time-based decay (1.22.0 M3) | **잔류** | 독립, §3.2·§4가 참조 |
| 22 | orchestration live-activation (1.22.1 M1) | 이전 | 23이 승계(default·USD 축 재정의) |
| 23 | orchestration operational-USD 은퇴 (1.22.3 M3) | **잔류** | orchestration 계보의 최신 |
| 24 | orchestration firing-preview (1.22.2 M2) | **잔류** | 독립 도구(read-only preview), §4가 참조 |

**잔류 18행 · 이전 6행.** 잔류 행은 CLAUDE.md에 `| 모듈 | 한 줄 역할 | [상세](docs/milestone-log.md#앵커) |` 형식 한 줄로 남는다 — 18행 × 약 120 B ≈ 2,200 B로 §1.4 예산 6,000 B 안에 여유 있게 들어간다. 24행 전부의 원문은 `docs/milestone-log.md`에 보존되므로 **이전 6행도 소실이 아니다**.

- **Validate**: Validation 3 — §1.4로 범위를 좁힌 **24행이 행 전체(row payload) 그대로** source↔destination 일치. first-column 키만 비교하면 행 내용이 뭉개져도 통과한다.

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

#### 작동 예시 — §3.6 evidence write lock 한 문단 (U1 잔여 완화)

규칙을 서술만 하면 구현자마다 다르게 자른다는 지적이 3라운드 내내 나왔다. 전수 열거는 34,459 B라 비현실적이므로 **한 문단을 실제로 갈라 보인다**. 나머지는 이 패턴을 따른다.

원문(§3.6):

> **실패 정책이 fail-closed**입니다. `session-ledger.js#withLedgerLock`은 획득 실패 시 경고만 남기고 lock 없이 진행하는데(last-writer-wins), 그 동작이 PRD가 구조적 취약으로 지목한 결함 자체라 여기서는 **throw**합니다(`EVIDENCE_LOCK_UNAVAILABLE` — 에러에 lock 경로·잔여 lease·복구 지침·kill switch 포함). 단 **caller별 비대칭은 의도적**입니다: `writeReceipt`는 fail-closed, hash-carved 메타 stamper 2건(briefing · completion-ledger 진단)은 fail-open + loud skip.

**CLAUDE.md 잔류** — 현재 계약과 복구 정보만:

> evidence write lock은 획득 실패 시 **throw**한다(fail-closed). 에러 `EVIDENCE_LOCK_UNAVAILABLE`이 lock 경로·잔여 lease·복구 지침·kill switch를 포함한다. **caller별 비대칭은 의도적** — `writeReceipt`는 fail-closed, 메타 stamper 2건(briefing · completion-ledger)은 fail-open + loud skip. 배경: [상세](docs/gate-design.md#evidence-write-lock)

**gate-design.md 이전** — 왜 그 정책이 됐는지:

> `session-ledger.js#withLedgerLock`은 획득 실패 시 경고만 남기고 lock 없이 진행한다(last-writer-wins). v1.23.1 multi-session-work-loop M3은 그 동작 자체를 PRD가 구조적 취약으로 지목한 결함으로 보고 정책을 뒤집었다.

판정 근거: 앞 두 문장은 *현재 무엇을 하는가*(throw·비대칭)라 잔류, 마지막은 *어떤 milestone이 왜 바꿨는가*(v1.23.1·PRD 판단)라 이전. **한 문장이 양쪽에 걸치면 쪼개고, 쪼갤 수 없으면 잔류**한다 — 규칙이 사라지는 것보다 서사가 남는 편이 덜 해롭다.

- **포인터 의무**: 서사를 덜어낸 각 섹션은 목적지로 가는 링크를 **반드시 남긴다** — `[상세](docs/gate-design.md#앵커)` 형식. Validation 7이 링크 대상 파일 실재 + 앵커 실재까지 확인하므로 죽은 포인터는 통과 못 한다. 이전이 매장으로 변질되는 것을 막는 유일한 기계적 장치다.
- **Validate**: 네 섹션 합 ≤ 12,000 B(Validation 6) + Validation 4 + Validation 7(포인터 해석) + Validation 8 + Validation 12(질량 보존).

### Task 4: MEMORY.md 인덱스를 한 줄 hook으로 정규화

- **예산 긴장 주의**: 16항목 × 160 B = 2,560 B > 총량 상한 2,500 B다. 두 제약을 동시에 만족하려면 **평균 ≤150 B**여야 하고 상한을 다 쓰는 항목이 몇 개 이상이면 총량에서 걸린다(R3 A 적발). 160 B는 개별 상한일 뿐 목표치가 아니다.
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
- **판정**: `git diff`가 CLAUDE.md에서 지운 줄 중 **형식 잡음이 아닌 전부**에 대해, 정규화된 **줄 전체**가 목적지 4개 문서의 줄 집합에 있어야 한다(잔류 CLAUDE.md는 pool에 넣지 않는다 — 안 옮기고 남겨둔 것을 "도착"으로 세면 검사가 무의미해진다). 의도적 재작성은 `.claude/state/relocation-exceptions.txt`에 사유와 함께 등재하며 삭제 줄의 5%를 넘을 수 없다.
- **왜 이게 핵심인가**: 행 수·키워드·바이트는 원문이 뭉개져도 통과한다. 고아 검사만이 "지운 것이 도착했다"를 직접 검사한다.

## Validation

```bash
# 이 블록은 Git Bash에서 실행한다. 비교 기준은 헤더에 고정한 base 커밋이며
# 움직이는 ref(origin/main·HEAD)를 쓰지 않는다 — R2 B-F6이 재현성 결함으로 적발.
BASE=77ceba2
MEM=C:/Users/skypark207/.claude/projects/c---project-my-mccp/memory

# 1) 표면 예산 — 바이트(작업 후에만 통과. 작업 전 실패가 정상)
node -e "
const fs=require('fs');
const c=Buffer.byteLength(fs.readFileSync('CLAUDE.md','utf8'),'utf8');
const m=Buffer.byteLength(fs.readFileSync(process.argv[1]+'/MEMORY.md','utf8'),'utf8');
console.log('CLAUDE.md',c,c<=70000?'OK':'FAIL(>70000)');
console.log('MEMORY.md',m,m<=2500?'OK':'FAIL(>2500)');
process.exit((c<=70000&&m<=2500)?0:1);
" "$MEM"

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

# 3) milestone 행 이전 — §1.4로 범위를 좁히고 first-column이 아니라 '행 전체'를 대조
#    (R2 B-F5: 이전 판은 CLAUDE.md 전역의 아무 bold 표나 매칭했고, 키만 비교해
#     행 내용이 통째로 뭉개져도 통과했다)
node -e "
const fs=require('fs'),cp=require('child_process');
const BASE=process.argv[1], DST='docs/milestone-log.md';
if(!fs.existsSync(DST)){console.log('FAIL: '+DST+' 없음 (Task 1 미완)');process.exit(1)}
function sec14(txt){
  const L=txt.split(/\r?\n/); let fence=false,s=-1,e=L.length,lvl=0;
  for(let i=0;i<L.length;i++){ if(/^\`\`\`/.test(L[i]))fence=!fence; if(fence)continue;
    const m=L[i].match(/^(#{2,4})\s/); if(!m)continue;
    if(s<0 && L[i].includes('1.4')){s=i;lvl=m[1].length;continue}
    if(s>=0 && m[1].length<=lvl){e=i;break} }
  return s<0?'':L.slice(s,e).join('\n');
}
const norm=r=>r.replace(/\s+/g,' ').trim();
const rows=t=>[...t.matchAll(/^\|\s*\*\*.+\$/gm)].map(m=>norm(m[0]));
const src=rows(sec14(cp.execSync('git show '+BASE+':CLAUDE.md',{encoding:'utf8',maxBuffer:1e8})));
const dstAll=rows(fs.readFileSync(DST,'utf8'));
const miss=src.filter(r=>!dstAll.includes(r));
const dup=dstAll.filter((r,i)=>dstAll.indexOf(r)!==i);
console.log('§1.4 source rows',src.length,'(기대 24) | dest rows',dstAll.length);
console.log('행 전체가 일치하지 않는 것',miss.length); miss.slice(0,5).forEach(r=>console.log('  MISS:',r.slice(0,80)));
console.log('중복',dup.length);
process.exit((src.length!==24||miss.length||dup.length)?1:0);
" "$BASE"

# 4) 불변식 키워드가 '원래 소속 섹션 안에' 살아있는가 (레벨 인지 슬라이스)
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

# 5) MEMORY.md — 바이트 기준 줄 상한 + 링크 무결성 + PR 상태 부재
node -e "
const fs=require('fs'),p=process.argv[1]+'/';
const idx=fs.readFileSync(p+'MEMORY.md','utf8');
const rows=idx.split(/\r?\n/).filter(l=>l.trim().startsWith('- ['));
const over=rows.filter(l=>Buffer.byteLength(l,'utf8')>160);
const dead=[...idx.matchAll(/\]\(([^)]+\.md)\)/g)].map(m=>m[1]).filter(f=>!fs.existsSync(p+f));
const pr=rows.filter(l=>/#\d{2,}|MERGED|OPEN/.test(l));
console.log('rows',rows.length,'over-160B',over.length,'dead links',dead,'PR상태 잔존',pr.length);
over.slice(0,5).forEach(l=>console.log('  OVER',Buffer.byteLength(l,'utf8'),'B:',l.slice(0,50)));
process.exit((over.length||dead.length||pr.length)?1:0);
" "$MEM"

# 5b) 비파괴 불변식 — baseline manifest(sha256) 대조
node -e "
const fs=require('fs'),crypto=require('crypto'),p=process.argv[1]+'/';
const base=JSON.parse(fs.readFileSync('.claude/state/memory-baseline.json','utf8'));
const EDIT=new Set(['integrity-unification-m3.md','multi-session-work-loop-m3.md',
  'workflow-orchestration-m1.md','cost-model-subscription-remediation.md']);
const gone=[],tampered=[],shrunk=[];
for(const [f,b] of Object.entries(base.files)){
  if(!fs.existsSync(p+f)){gone.push(f);continue}
  const buf=fs.readFileSync(p+f);
  if(f==='MEMORY.md') continue;
  if(EDIT.has(f)){
    // append-only 증명: 새 파일의 앞 b.bytes 바이트가 baseline 해시와 일치해야 한다.
    // '바이트가 안 줄었다'만 보면 같은 길이의 파괴적 재작성이 통과한다(R3 B).
    if(buf.length<b.bytes){ shrunk.push(f); }
    else if(crypto.createHash('sha256').update(buf.subarray(0,b.bytes)).digest('hex')!==b.sha256)
      tampered.push(f+' (append-only 위반)');
  }
  else if(crypto.createHash('sha256').update(buf).digest('hex')!==b.sha256) tampered.push(f);
}
const now=fs.readdirSync(p).filter(f=>f.endsWith('.md')).length;
console.log('baseline',base.file_count,'now',now,'| 삭제',gone,'| 무편집 변조',tampered,'| 축소',shrunk);
process.exit((gone.length||tampered.length||shrunk.length||now!==base.file_count)?1:0);
" "$MEM"

# 6) 섹션별 예산 — UTF-8 바이트로 측정 (R2 B-F1: 이전 판은 .length=문자 수였고
#    진단표가 그걸 '바이트'라 표기해 §4를 44,462가 아닌 33,971로 과소 계상했다)
node -e "
const fs=require('fs');const lines=fs.readFileSync('CLAUDE.md','utf8').split(/\r?\n/);
let fence=false;const h=[];
lines.forEach((l,i)=>{if(/^\`\`\`/.test(l))fence=!fence;
  const m=!fence&&l.match(/^(#{2,4})\s/); if(m)h.push({i,lvl:m[1].length,t:l.trim()})});
function size(n){for(let k=0;k<h.length;k++){ if(!h[k].t.includes(n))continue;
  let end=lines.length; for(let j=k+1;j<h.length;j++){if(h[j].lvl<=h[k].lvl){end=h[j].i;break}}
  return Buffer.byteLength(lines.slice(h[k].i,end).join('\n'),'utf8');} return -1;}
const s14=size('1.4'), s4=size('운영 토글');
const four=['3.6','3.9','3.10','3.12'].map(size);
const sum4=four.reduce((a,b)=>a+b,0);
console.log('§1.4',s14,'B (기준선 37353 → <=6000) | §4토글',s4,'B (44462 → <=6000)');
console.log('4섹션합',sum4,'B (34459 → <=12000)',four);
process.exit((s14>0&&s14<=6000&&s4>0&&s4<=6000&&four.every(x=>x>0)&&sum4<=12000)?0:1);
"

# 7) 사용성 — 작아진 게 아니라 '여전히 쓸 수 있는' 지시문인가
#    (R2 B-F5: default 열을 'default|기본|없음' 단어로 판정하던 것을 폐기 —
#     실제 default는 24·observe·1 같은 값이라 멀쩡한 표를 떨어뜨렸다. 이제 비어있지
#     않은지만 본다. A-R2: 포인터가 실제로 해석되는지도 확인)
node -e "
const fs=require('fs');const c=fs.readFileSync('CLAUDE.md','utf8');
const rows=[...c.matchAll(/^\|\s*\\\`(MCCP_[A-Z0-9_]+)\\\`\s*\|([^|]*)\|/gm)];
const emptyDefault=rows.filter(m=>!m[2].trim()).map(m=>m[1]);
const anchors=['/mccp:work','/mccp:plan','/mccp:pr','/codex:setup','MCCP_RECEIPT_GATE_MODE'];
const lostAnchor=anchors.filter(a=>!c.includes(a));
// 포인터 해석: CLAUDE.md가 가리키는 docs/*.md#anchor 가 실재하고 그 앵커가 있는가
const links=[...c.matchAll(/\]\((docs\/[^)#]+\.md)(#([^)]+))?\)/g)];
const badLink=[], badAnchor=[];
for(const [,f,,anc] of links){
  if(!fs.existsSync(f)){ badLink.push(f); continue; }
  if(anc){ const slugs=[...fs.readFileSync(f,'utf8').matchAll(/^#{1,6}\s+(.+)\$/gm)]
      .map(m=>m[1].toLowerCase().replace(/[^\w가-힣 -]/g,'').trim().replace(/\s+/g,'-'));
    if(!slugs.includes(anc.toLowerCase())) badAnchor.push(f+'#'+anc); }
}
const stale=(fs.readFileSync('docs/ENVIRONMENT.md','utf8').match(/🚧\s*미구현|🚧\s*예정/g)||[]).length;
console.log('env 표 행수',rows.length,'(>=56) | default 빈 행',emptyDefault);
console.log('사라진 운영 앵커',lostAnchor,'| 깨진 링크',badLink,'| 없는 앵커',badAnchor.slice(0,5));
console.log('ENVIRONMENT stale 마커',stale);
process.exit((rows.length<56||emptyDefault.length||lostAnchor.length||badLink.length||badAnchor.length||stale>0)?1:0);
"

# 8) ★핵심★ 이전 완결성 — 지운 줄이 목적지에 '정확히' 도착했는가
#    (R2/A-R2: 이전 판은 80자 prefix 부분문자열 매칭이라 꼬리가 잘리거나 뭉개져도
#     통과했다. 이제 정규화된 '줄 전체'가 목적지 줄 집합에 있어야 한다.
#     40자 문턱은 폐기했다 — CLAUDE.md에는 40자 미만 실질 줄이 118개 있고 그중에는
#     'main 직접 push 금지' 같은 규칙이 섞여 있어 문턱이 곧 사각지대였다(R3 A).
#     이제 형식 잡음(표 구분선·코드펜스·8자 미만·문자 없음)만 제외한다.
#     의도적으로 재작성한 줄은 추적되는 예외 파일에 사유와 함께 등재해야 하고
#     예외는 삭제 줄의 5%를 넘을 수 없다 — 예외가 검사를 삼키지 못하게)
node -e "
const fs=require('fs'),cp=require('child_process');
const BASE=process.argv[1];
const norm=s=>s.replace(/\s+/g,' ').trim();
const del=cp.execSync('git diff -U0 '+BASE+' -- CLAUDE.md',{encoding:'utf8',maxBuffer:1e8})
  .split(/\r?\n/).filter(l=>l.startsWith('-')&&!l.startsWith('---')).map(l=>norm(l.slice(1)));
const DEST=['docs/milestone-log.md','docs/ENVIRONMENT.md','docs/gate-design.md',
  'docs/multi-session-work-loop/evidence-conflict-design.md'];
const pool=new Set();
for(const f of DEST) if(fs.existsSync(f))
  fs.readFileSync(f,'utf8').split(/\r?\n/).forEach(l=>pool.add(norm(l)));
const EXC='.claude/state/relocation-exceptions.txt';
const exc=new Set(fs.existsSync(EXC)?fs.readFileSync(EXC,'utf8').split(/\r?\n/)
  .filter(l=>l.trim()&&!l.startsWith('#')).map(norm):[]);
const NOISE=l=>l.length<8||!/[가-힣A-Za-z]/.test(l)||/^\|[\s|:-]*\|?$/.test(l);
const substantive=del.filter(l=>!NOISE(l));
const orphans=substantive.filter(l=>!pool.has(l)&&!exc.has(l));
const excUsed=substantive.filter(l=>!pool.has(l)&&exc.has(l)).length;
const cap=Math.ceil(substantive.length*0.05);
console.log('삭제 실질 줄',substantive.length,'(>=400 필요) | 고아',orphans.length,
            '| 예외 사용',excUsed,'/ 상한',cap);
orphans.slice(0,10).forEach(o=>console.log('  ORPHAN:',o.slice(0,90)));
process.exit((substantive.length<400||orphans.length||excUsed>cap)?1:0);
" "$BASE"

# 9) 회귀 — baseline(red 7건, gate-guard-integrity 소관) 대비 '신규' 실패만 판정
#    (R2 B-F5: 이전 판은 출력만 하고 exit code를 내지 않아 절대 실패하지 않았다)
#    (R3 자체감사: 고정 baseline 집합 차이만 보면 순서 의존 실패가 거짓 회귀로 잡힌다 —
#     실측으로 hash-briefing-exclusion이 그 경우였다. 격리 재현을 요구한다)
node --test $(find plugins/mccp/scripts -name '*.test.js' | tr '\n' ' ') 2>&1 \
  | grep -E '^✖ ' | grep -v '^✖ failing tests' | sed -E 's/ \([0-9.]+ms\)$//' | sort -u > /tmp/mccp-red-now.txt
cat > /tmp/mccp-red-base.txt <<'BASE_EOF'
✖ receipt-prompt: module-load error emits systemMessage + allows (G1)
✖ receipt-skill: module-load error emits systemMessage + allows (G1)
✖ receipt-prompt: no session_id → G1 allows + emits systemMessage without trace path
✖ plugins\mccp\scripts\lib\tests\a3-instruction-cost.test.js
✖ M3 finalize: skipped WITH audited reason → exit 0 (proven skip ships)
✖ M3 finalize: skipped WITHOUT reason (unproven) → exit 12 (fail-closed) [F2]
✖ validate-callsite-lint: every validate call in command bodies forwards --decision AND --plan
BASE_EOF
NOVEL=$(comm -13 <(sort -u /tmp/mccp-red-base.txt) /tmp/mccp-red-now.txt)
echo "baseline에 없던 실패:"; echo "$NOVEL"
# 플레이키 재현 확인 — 이 스위트는 순서 의존 실패가 관측됐다(실측: hash-briefing-exclusion이
# 전체 실행에서만 빨갛고 격리 실행에서는 통과). 고정 baseline 집합 차이만으로 회귀를
# 선언하면 거짓 경보가 난다. 신규 실패는 해당 파일을 단독 실행해 재현될 때만 회귀로 친다.
REGRESSED=""
while IFS= read -r line; do
  [ -z "$line" ] && continue
  NAME=$(echo "$line" | sed -E "s/^✖ //")
  FILE=$(grep -rl -F "$NAME" plugins/mccp/scripts --include=*.test.js 2>/dev/null | head -1)
  if [ -z "$FILE" ]; then REGRESSED="$REGRESSED
(파일 미상) $NAME"; continue; fi
  if node --test "$FILE" >/dev/null 2>&1; then
    echo "  플레이키(격리 실행 통과, 회귀 아님): $NAME"
  else
    REGRESSED="$REGRESSED
$NAME"
  fi
done <<< "$NOVEL"
[ -z "$REGRESSED" ] || { echo "FAIL: 재현된 신규 회귀:$REGRESSED"; exit 1; }

# 10) 토큰 축 — a3-instruction-cost.js와 같은 o200k_base.
#     (R2 B-F: 이전 판은 CLAUDE/MEMORY/STATE 원문을 /tmp 파일로 썼다. 그건 A3 모듈이
#      지키는 no-raw-persistence 경계를 이 plan이 인용하면서 스스로 위반한 것이라
#      임시 파일을 없애고 stdin 파이프로 넘긴다 — 원문은 디스크에 남지 않는다)
node -e "
const fs=require('fs');
process.stdout.write(JSON.stringify({
  claude_md: fs.readFileSync('CLAUDE.md','utf8'),
  memory_index: fs.readFileSync(process.argv[1]+'/MEMORY.md','utf8'),
  state_block: fs.existsSync('.claude/state/STATE.md')?fs.readFileSync('.claude/state/STATE.md','utf8'):''
}));
" "$MEM" | python -c "
import tiktoken, json, sys
enc = tiktoken.get_encoding('o200k_base')
d = json.load(sys.stdin)
n = {k: len(enc.encode(v)) for k, v in d.items()}
tot = sum(n.values())
for k, v in n.items(): print('%-14s %7d tok' % (k, v))
print('%-14s %7d tok = %.1f%% of 200k (baseline 50049 = 25.0%%)' % ('TOTAL', tot, tot/2000.0))
ok = n['claude_md'] <= 20000 and n['memory_index'] <= 800
print('VERDICT', 'OK' if ok else 'FAIL (claude_md<=20000, memory_index<=800)')
sys.exit(0 if ok else 1)
"

# 11) §3.5.1 삭제 검증 의무 — 출력만 하지 말고 실제로 실패시킨다 (R2 B-F: 이전 판은
#     삭제가 있어도 exit 0이었다)
DELETED=$(git diff --diff-filter=D --name-only "$BASE"...HEAD)
echo "삭제된 파일:"; echo "$DELETED"
[ -z "$DELETED" ] || { echo "FAIL: 의도치 않은 파일 삭제"; exit 1; }

# 12) 질량 보존 — CLAUDE.md가 덜어낸 만큼이 목적지 문서에 실제로 쌓였는가.
#     줄 단위 검사(8)의 집계 축 보완: 목적지가 자라지 않았는데 원본만 줄었다면
#     '이전'이 아니라 '삭제'다.
#     임계 90%의 근거(U4): V8이 줄 단위 '정확 일치'를 이미 강제하므로 옮겨진 내용은
#     바이트 그대로 도착한다. 100%에서 깎이는 몫은 (a) 예외 등재분 최대 5%,
#     (b) 목적지에 새로 붙는 heading·앵커 정도다. 90%는 그 둘을 더한 값이며
#     초안의 70%처럼 임의로 고른 수치가 아니다.
node -e "
const fs=require('fs'),cp=require('child_process');
const BASE=process.argv[1];
const B=f=>{try{return Buffer.byteLength(fs.readFileSync(f,'utf8'),'utf8')}catch{return 0}};
const wasB=f=>{try{return Buffer.byteLength(cp.execSync('git show '+BASE+':'+f,{encoding:'utf8',maxBuffer:1e8,stdio:['pipe','pipe','ignore']}),'utf8')}catch{return 0}};
const DEST=['docs/milestone-log.md','docs/ENVIRONMENT.md','docs/gate-design.md',
  'docs/multi-session-work-loop/evidence-conflict-design.md'];
const shed=wasB('CLAUDE.md')-B('CLAUDE.md');
const gained=DEST.reduce((a,f)=>a+(B(f)-wasB(f)),0);
const ratio=shed>0?gained/shed:0;
console.log('CLAUDE.md 감소',shed,'B | 목적지 증가',gained,'B | 보존율',(ratio*100).toFixed(1)+'% (>=90% 필요)');
process.exit((shed>0&&ratio>=0.90)?0:1);
" "$BASE"
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
| ~~목표치가 임의적~~ | — | **해소(R3)** — 초안은 목표에서 역산했고 그 산술이 불가능했다(R2 B-F1). 이제 **적산**이다: 6,000 + 6,000 + 12,000 + 44,646(손대지 않는 나머지) = 68,646 B → 천장 70,000 B, 실측 3.55 B/token으로 ≤20,000 토큰. Validation 6이 **자리별로** 강제하므로 전체 수치만 맞추는 편법이 통하지 않는다 |
| **A3 계측기가 Windows에서 불능** | Medium | 본 plan은 고치지 않는다 — `python3` 하드코딩 결함은 STATE.md대로 gate-guard-integrity PRD가 승계한 red 7건에 속한다. Validation 10이 같은 인코딩으로 독립 측정해 이 plan의 수용 판정은 그 결함에 의존하지 않는다 |

## Acceptance

- [ ] Task 0 baseline이 **memory 편집 전에** 캡처됨 · `file_count === 17` · 전 항목 `bytes`+`sha256`
- [ ] **`CLAUDE.md` ≤ 20,000 토큰 · `MEMORY.md` ≤ 800 토큰** (현 45,357 / 3,393) — Validation 10 **(1차 기준)**
- [ ] 주입 합계 200k 창 점유 25.0% → 12% 미만 — Validation 10
- [ ] `CLAUDE.md` ≤ 70,000 B (현 160,920 B) — Validation 1
- [ ] §1.4 ≤ 6,000 B · §4 토글 ≤ 6,000 B · §3.6+3.9+3.10+3.12 ≤ 12,000 B — Validation 6 (**UTF-8 바이트**, 기준선 37,353 / 44,462 / 34,459)
- [ ] `MEMORY.md` ≤ 2,500 B, 전 항목 ≤ 160 **바이트**, PR 상태 0건 — Validation 5
- [ ] memory 17파일 전수 존재 · 무편집 12파일 **sha256 동일** · 편집 4파일 바이트 비감소 — Validation 5b
- [ ] §1.4 **24행**이 `docs/milestone-log.md`에 **행 전체 그대로**(first-column만이 아니라) 도착, 중복 0 — Validation 3
- [ ] env 표 **56행** ↔ `docs/ENVIRONMENT.md` 앵커 **양방향 동일**, 은퇴 토글 표 부재 — Validation 2
- [ ] 불변식 키워드 6종이 **원래 소속 섹션 안에** 잔존 — Validation 4
- [ ] 운영 앵커 5종 잔존 · env 표 default 열 전부 non-empty · **CLAUDE.md의 docs 링크가 파일·앵커까지 해석됨** · `ENVIRONMENT.md` stale 마커 0건 — Validation 7
- [ ] **삭제된 줄이 목적지에 정규화 줄-단위로 정확히 도착**, 고아 0건, 예외 사용 ≤ 5% — Validation 8 (핵심 게이트)
- [ ] **질량 보존** — CLAUDE.md 감소분의 **90% 이상**이 목적지 문서 증가로 나타남 — Validation 12
- [ ] **격리 재현되는** 신규 테스트 실패 0건(baseline red 7건은 pre-existing, gate-guard-integrity 소관. 순서 의존 플레이키는 회귀로 치지 않음) — Validation 9
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

### santa-loop R2 — NAUGHTY

| Reviewer | Verdict | FAIL |
|---|---|---|
| A (Claude Opus) | FAIL | 8/10 (criterion 1·2는 PASS로 전환 — R1 사실오류 해소 확인) |
| B (Codex GPT-5.4) | FAIL | 9/10 |

**B가 잡은 것 — plan의 헤드라인 수치를 무너뜨린 2건**:

1. **목표 60,000 B가 산술적으로 불가능**했다. 같은 task set의 하한은 24,000(예산 3종) + 44,646(나머지) = 68,646 B다. 계획이 자기 산술과 모순이었고, 거기서 환산한 16,900 토큰 목표도 함께 거짓이었다. → 역산을 폐기하고 **적산**으로 재도출(≤70,000 B / ≤20,000 토큰).
2. **진단표 전체가 바이트가 아니라 문자 수**였다. Validation 6이 `.length`(chars)를 쓰면서 "바이트"라 표기했고, 한글 1.20~1.39 B/char이라 §4를 44,462가 아닌 33,971로 **과소** 계상했다. → `Buffer.byteLength`로 교체, 진단표 전량 재측정. 실제로는 6개 섹션이 파일의 **72.3%**(초안 주장 41.6%)로, 압축 여지가 오히려 더 컸다.

**B의 나머지 유효 지적**: V11(`--diff-filter=D`)과 V9(신규 회귀)가 **출력만 하고 exit code를 내지 않아 절대 실패하지 않음** · V3이 §1.4로 범위를 안 좁혀 CLAUDE.md 전역 bold 표를 매칭 · V7의 default 열 판정이 `default|기본|없음` **단어**를 요구해 `24`·`observe` 같은 실제 값을 떨어뜨림 · 검증이 움직이는 ref(`origin/main`)를 써서 재현 불가 · **V10이 CLAUDE/MEMORY/STATE 원문을 `/tmp` 파일로 씀** — plan이 인용하며 존중한다던 A3의 no-raw-persistence 경계를 스스로 위반 · Task 0(baseline 캡처)이 어느 task에도 미배정.

**A의 유효 지적**: V8의 80자 prefix 부분문자열 매칭이 꼬리 절단·뭉갬을 통과시킴 · 압축 섹션의 포인터가 실제로 해석되는지 미검증 · 목적지 증가가 무제한.

**A의 무효 지적 3건**(검증 후 기각): V2 정규식 이스케이프가 깨졌다 → 합성 표로 `table 2` 매칭 확인, 정상 · 판정 기준의 "양쪽 표지 동시" 케이스 미정의 → plan에 "잔류가 우선" 이미 명시 · "land fast"가 통제가 아님 → 이미 3개 구체 통제로 교체했고 A가 그 **교체 문구를 인용하며** 미교체라 주장. 리뷰어 지적을 검증 없이 받았으면 멀쩡한 정규식을 "고칠" 뻔했다.

**R3가 흡수한 것**: 위 유효분 전량 — 목표 재도출 · 바이트 단위 교정 · V3 범위·행전체 대조 · V7 non-empty + **링크·앵커 해석 검증** · V8 **정규화 줄-전체 정확 일치 + 감사되는 예외 파일(≤5% 상한)** · V9/V11 exit assertion · V10 **stdin 파이프(원문 디스크 미기록)** · base 커밋 고정 · Task 0 신설 · **Validation 12 질량 보존**(CLAUDE.md 감소분의 70% 이상이 목적지 증가로 나타나야 함) · Task 3 포인터 의무.


## 미해소 (santa-loop 3라운드 상한 도달)

santa-method는 3라운드 안에 양쪽 NICE가 아니면 push를 금지하고 사람에게 넘기도록 규정한다. 세 라운드 모두 NAUGHTY였고, **검증에 성공한 지적은 전부 흡수**했으나 다음은 남는다.

| # | 미해소 항목 | 성격 | 왜 이번에 안 닫았나 |
|---|---|---|---|
| U1 | Task 1·3의 판정 규칙이 여전히 **휴리스틱** — "primary path", "가장 최신 version", 규범표지 vs version표지 문장 분류 | 설계 | 두 리뷰어가 3라운드 내내 지적했고 옳다. 진짜 해법은 B의 제안대로 **잔류 대상을 행/문장 단위로 전부 열거한 manifest**인데, 그건 사실상 구현 작업을 plan 안에서 미리 수행하는 것이라 별도 판단이 필요하다 |
| U2 | repo 밖 memory에 **복구 경로 없음** — sha256은 탐지이지 복원이 아니다 | 안전 | 삭제를 없앴고 편집 4건은 append-only로 증명하지만, 사고가 나면 되돌릴 스냅샷이 없다. 실제 사본을 뜨려면 사용자 판단 필요(개인 memory 복제) |
| U3 | **의미 보존 미증명** — V8은 줄 단위 정확 일치라, 옮긴 뒤 목적지에서 다듬는 정상 편집을 고아로 잡는다 | 설계 잔여 | 그 압력이 5% 예외 상한으로 몰린다. 완전 해법은 span 단위 manifest(U1과 동일 축) |
| U4 | Validation 12의 **70% 임계는 임의값** | 임의성 | 근거 있는 값을 고르려면 실제 이전을 한 번 해봐야 한다 |
| U5 | MEMORY.md hook이 **운영 경고를 떨어뜨릴 수 있음** | 잔여 | 본문에는 남지만 인덱스만 읽는 세션은 놓친다. hook 문구 설계로 완화할 뿐 기계 보증은 불가 |
| U6 | A3 계측기의 `python3` 하드코딩 | **의도적 이연** | gate-guard-integrity PRD가 승계한 red 7건 소속. 남의 PRD 범위를 조용히 침범하지 않는다 |

### 3라운드에서 배운 것

- **리뷰어 지적을 검증 없이 받으면 멀쩡한 코드를 고친다.** R2·R3에서 Reviewer A가 제기한 정규식 파손·섹션 경계·tautology 주장 5건은 재현 시도에서 전부 반증됐다. 반대로 R3에서 Reviewer B가 "V3 정규식이 깨졌다"고 한 것도 기전은 틀렸지만, 그걸 확인하려 실제로 돌려본 덕에 **진짜 결함**(§1.4는 24행인데 27로 세고 있었다 — §1.1 Fork Lineage 표 3행을 함께 잡았다)이 드러났다. 틀린 지적도 옳은 곳을 가리킬 수 있다.
- **실행되지 않은 검사는 검사가 아니다.** V3·V7의 정규식은 세 라운드 동안 한 번도 실행된 적이 없었다(조기 반환). 리뷰어 둘 다 코드를 읽었을 뿐이고, 결함은 합성 입력을 만들어 돌려본 뒤에야 나왔다.
- **자기 산술을 검산하지 않으면 헤드라인이 거짓이 된다.** 60,000 B 목표는 이 plan 자신의 예산 합계보다 작았고, 진단표는 바이트라 적힌 문자 수였다.
