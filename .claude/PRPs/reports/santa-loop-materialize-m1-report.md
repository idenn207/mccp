# Implementation Report: santa-loop 실체화 — M1 (모듈 골격 + 캡 강제)

- **Plan**: [.claude/plans/santa-loop-materialize-m1.plan.md](../../plans/santa-loop-materialize-m1.plan.md) (**archived 안 함** — 아래 D6)
- **PRD**: [.claude/prds/santa-loop-materialize.prd.md](../../prds/santa-loop-materialize.prd.md) M1
- **Branch**: `santa-loop-materialize` · **Version**: 1.23.7 → 1.23.8
- **게이트 기록**: [.claude/notes/santa-loop-materialize-m1-implement-codex.md](../../notes/santa-loop-materialize-m1-implement-codex.md)

## Summary

`/mccp:santa-loop`은 이 milestone 이전까지 **백킹 코드가 0**이었다. 라운드 수는 아무도 세지 않았고, 캡은 산문 한 줄(`Maximum 3 iterations`)이 유일한 근거였다. M1은 결정 로직을 `plugins/mccp/scripts/lib/santa/` 4개 모듈로 내리고 `santa-loop.md`를 thin caller로 만들었다. 라운드는 gitignored 원장에 기록되고, 캡은 `begin-round`가 **리뷰어 발화 직전**에 판정해 exit 12로 거부한다.

**판정 규칙의 내용은 바꾸지 않았다.** `gate.js`는 현 산문 표를 1:1로 옮겼고 `envelope 0건 → NAUGHTY` 경로도 CLI 경유로 도달 가능한 채 남겼다.

## 이 milestone이 달성하지 **않은** 것

숨기지 않고 먼저 적는다. 셋 다 plan이 사전에 명시한 것이며 구현 중 새로 생긴 미달이 아니다.

1. **PRD Success Metrics 1행의 절반 미달.** "라운드 수가 상태 파일에 기록되고 **receipt에 봉인**"에서 앞 절반만 냈다. 봉인은 `mccp-santa-review` GATE_ID를 신설하는 **M2 소유**다. PRD M1 행에 같은 문장을 실었다.
2. **캡 초과 라운드의 리뷰어 토큰 소모는 막지 못한다.** 캡은 *기록 경계*에서 구속된다 — `record`·`verdict`가 `begin-round`를 거치지 않은 라운드를 거부하므로, 산문이 거부를 무시하고 리뷰어를 띄워도 출력이 원장에 못 들어가고 verdict도 안 나온다. 하지만 리뷰어 기동 자체는 LLM 행위라 셸로 추출할 대상이 없어 **토큰은 실제로 쓰인다**. M1은 그것을 막았다고 주장하지 않는다.
3. **dual-review 우회 경로가 열린 채 남는다.** `record --id A`를 두 번 넣으면 A envelope가 2개 쌓이고 둘 다 PASS면 NICE가 나온다. 초안은 라운드 상태 기계로 이것을 닫았으나 봉인 패스 Codex F0이 그 규칙들이 사용자 제약(판정 내용은 P1 소유) 위반임을 지적해 되돌렸다. **test가 이 사실을 명시적으로 고정**해 두었다(`UI11 — [의도된 미봉]`), 그래서 P1이 닫을 때 조용히 지나칠 수 없다. backlog HIGH + P1 1순위 등재 완료.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 15 | 15 계획분 전부 + 게이트 산출물 5 (아래 D1) |
| 외부 의존 | "정확히 3개" (Acceptance) | **4개** — plan 내부 모순, D2 |
| 신규 test | 2 파일 | 2 파일 / **52 test** (49 pass · 3 skip · 0 fail) |
| Codex 라운드 | cap=1 | R1 + **R2 보충** (D4) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `santa/counter.js` 순수 캡 oracle | 완료 | `parseCap` 1..10, 0 불허(조용한 kill switch 방지). 거부 시 `roundIndex=null` |
| 2 | `santa/ledger.js` 원장 디스크 계층 | 완료 | 구현 중 이식성 결함 1건 발견·수정(D3), R2가 lock 결함 1건 발견·수정(D5) |
| 3 | `santa/gate.js` verdict 동결 | 완료 | 순수·frozen interface. `round`/`cap`은 받되 미사용(P1 자리) |
| 4 | `santa/cli.js` facade | 완료 | exit 0/2/12/75 전량 매핑. `--state-dir` **미채택**(D5-security) |
| 5 | `santa-loop.md` thin caller 축약 | 완료 | 산문 캡·3분기 판정 잔존 0. rubric·Output·Notes 무변경 |
| 6 | 배선 + 릴리스 표면 | 완료 | `decision.js` diff **1줄**, 4면 version 동기 |
| 7 | test 2종 | 완료 | 거의 전부 CLI 또는 실제 자식 프로세스 경유 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| 문법 검사 | Pass | `node --check` 4/4 |
| 신규 unit/CLI test | Pass | 52 tests · 49 pass · **0 fail** · 3 skip(POSIX 전용) |
| 회귀 — `receipt/tests` | Pass | 554 tests · 553 pass · 0 fail · 1 skip |
| 회귀 — `renderer/tests` | Pass | 672 tests · 0 fail (version 4면 동기 검증 포함) |
| 산문 캡 잔존 0 | Pass | `Maximum 3 iterations` · `ESCALATE ==` 둘 다 0 |
| instruction-contract lint | Pass | rows=25 · C1~C4 pass |
| 의도치 않은 삭제 (§3.5.1) | Pass | `git diff --diff-filter=D origin/main...HEAD` → **0건** |
| plan-conflict detector | 형식상 conflict=1 → **실질 0** | D1 |
| Design Grounding | N/A | 2.5.5b `design_signal=0` → capture 없음 → Phase 3.7 no-op |

**flake 1건 관찰(선재).** 첫 `receipt/tests` 전체 실행에서 `receipt-write-concurrency.test.js`가 `EVIDENCE_CLAIM_DENIED`로 1건 실패했다. 단독 실행 3/3 통과, 전체 재실행 0 fail. STATE.md에 이미 기록된 "실행마다 다른 파일이 흔들리는" 선재 flake(test-runner 병렬 실행 × claim fence)와 일치하며 본 변경과 무관하다 — 본 변경은 `receipt/` 아래에서 `decision.js` export 1줄만 건드린다.

## Deviations from Plan

**D1 — plan-conflict detector가 `conflict=true`를 냈으나 실질 위반은 0.** detector는 "plan defines 15 files; diff has **20 unplanned**"이라고 보고했다 — 즉 **하나도 매칭하지 못했다**. backlog 2026-08-09 HIGH에 등재된 `parseFilesToChange` 백틱 미제거 결함의 재현이다. 백틱을 벗겨 재계산하니 **15/15 계획 파일이 전부 매칭**되고 미계획은 5건인데, 전부 게이트가 만든 산출물이다(`codex-findings-backlog.md` append · `STATE.md`/`fix-task*.md` · 2.5.4의 notes 대상). 소스 코드 확장 0 → minor deviation 경로로 진행.

**D2 — 외부 의존이 3개가 아니라 4개다 (plan 내부 모순).** Acceptance는 "외부 의존 **정확히 3개**"라 적었으나 그 목록이 `lib/path-containment.js`를 빠뜨렸다. DD3 본문은 그것을 **명시적으로 요구**하며, R6 Codex F0이 바로 그 호출의 인자 의미를 고쳐 놓은 자리다. 셋으로 줄이려면 traversal 심층 방어를 버려야 하므로 **4개로 구현**했다. test가 허용 목록을 4개로 고정한다.

**D3 — 이식성 결함 발견·수정 (`canonicalPath`).** Windows에서 `git rev-parse --show-toplevel`은 긴 경로를, 호출자는 8.3 단축명을 줄 수 있는데 **`fs.realpathSync`는 단축명을 확장하지 않는다**. 같은 디렉토리가 두 철자를 갖게 되어 `assertContained`의 prefix 비교가 실패하고 **정상 호출이 traversal로 오판**됐다(실측: `receipt=…ADMINI~1…, gate=…Administrator…`). `fs.realpathSync.native`로 양쪽을 정규화해 해소하고 회귀 test를 붙였다. 공유 모듈 `path-containment.js`는 무변경(pr-phase-lock·quarantine migration과 공유하는 표면).

**D4 — Implement-Codex를 2라운드 돌렸다 (cap=1 초과).** R1은 **아무것도 리뷰하지 못했다** — Phase 2.5가 EXECUTE보다 앞이라 전 파일이 CREATE인 milestone에서 리뷰 대상 diff가 비어 있고, 리뷰어는 focus로 준 6개 결정 대신 "구현이 없다"만 반환했다(HIGH, conf 1.0). 그 권고를 그대로 수행해 Phase 4 직후 실제 diff에 대해 R2를 발화했다. 게이트 자체의 구조 결함으로 backlog HIGH 등재(수정 후보 3안 포함).

**D5 — R2가 캡 불변식 위의 HIGH를 찾았고 흡수했다.** `mutate`가 `{env}`만 넘기고 `mode`를 명시하지 않아, 상속된 `MCCP_EVIDENCE_CONFLICT_GUARD=off`만으로 원장이 **lock 없이** read-modify-write됐다. 그러면 동시 `begin-round` 둘이 같은 pre-state를 읽고 각자 허가를 받은 뒤 write가 하나로 붕괴한다 — 리뷰어는 두 번 도는데 `rounds.length`는 하나만 늘어 **캡이 fail-open**된다. `mode:'enforce'` 명시로 상속 env를 무시하게 했고, 회귀 test를 붙인 뒤 **수정을 되돌리면 red가 되는 것까지 실측 확인**했다. R2를 돌리지 않았다면 이 상태로 ship됐다.

**D5-security — `--state-dir` CLI 플래그를 만들지 않았다.** 2.5.2에서 test 주입용으로 제안했으나 security-reviewer가 HIGH로 지목했다: 그 플래그 하나가 repo-root 앵커링과 `assertContained`를 **동시에** 무력화한다. 대신 `--cwd`만 두었다 — repo-root 탐색 기점일 뿐이라 어떤 값을 줘도 결과 경로는 그 repo의 `.claude/state/santa-loop/` 안이다. 프로그래매틱 `statePath`/`stateDir`는 Task 2 명세대로 JS API에 남되 CLI 표면이 없다(선례: CLAUDE.md §3.13). test는 tmpdir에 실제 `git init` repo를 만들어 정상 경로를 그대로 지난다 — 방어 장치를 우회하지 않는다.

**D6 — plan을 `completed/`로 archive하지 않았다.** command body Phase 5는 archive를 지시하지만 CLAUDE.md §3.11 C2가 **PRD 전체 완료 시에만** 이동하라고 규정한다(미완료 PRD의 plan을 옮기면 어느 대시보드 스캔에도 안 잡혀 PRD가 소실된다). 이 PRD는 M2가 pending이므로 이동하지 않았다. 프로젝트 instruction이 generic command body를 override한다.

**D7 — Codex 리뷰 섹션을 plan 본문이 아니라 `.claude/notes/`에 썼다.** 2.5.4가 plan 본문에 섹션을 주입한 직후 2.5.7 read-back이 `stale`로 떨어졌다 — 주입이 상위 `mccp-plan-codex` receipt의 `plan_hash`를 깨뜨렸고, 재진입해도 같은 주입이 반복되므로 **영구 교착**이다. `git show HEAD:<plan>`을 재해싱하니 receipt 봉인값과 **정확히 일치**해 귀책이 100% 게이트임을 실측했다. 2.5.4가 이미 허용하는 대체 목적지(`.claude/notes/<topic>.md`)로 옮겨 해소했다 — plan diff 0 · 체인 무손상 · **bypass 0건**(`MCCP_SKIP_RECEIPT` 미사용). backlog HIGH 등재.

## Issues Encountered

| 문제 | 해소 |
|---|---|
| 게이트가 자기 체인을 stale로 만듦 | D7 — 대체 목적지 사용, bypass 없음 |
| Windows 8.3 단축명 ↔ git 긴 경로 불일치 | D3 — `realpathSync.native` 정규화 + 회귀 test |
| 상속 env가 원장 lock을 무력화 | D5 — `mode:'enforce'` 명시 + 되돌림 검증된 회귀 test |
| `node --test <dir>` 가 디렉토리를 모듈로 해석 (Node 24/Windows) | glob(`tests/*.test.js`)으로 호출 |
| `html.js` 치환 중 후행 공백 1개 유실 | 즉시 복원, diff는 version 리터럴 1개뿐임을 확인 |

## Files Changed

| File | Action | 비고 |
|---|---|---|
| `plugins/mccp/scripts/lib/santa/counter.js` | CREATED | 순수 oracle |
| `plugins/mccp/scripts/lib/santa/ledger.js` | CREATED | 원장 · 라운드 수 단일 출처 |
| `plugins/mccp/scripts/lib/santa/gate.js` | CREATED | frozen interface |
| `plugins/mccp/scripts/lib/santa/cli.js` | CREATED | subcommand 5종 |
| `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` | CREATED | CLI 레벨 |
| `plugins/mccp/scripts/lib/tests/santa-gate.test.js` | CREATED | 동작 보존 |
| `plugins/mccp/commands/santa-loop.md` | UPDATED | thin caller |
| `plugins/mccp/scripts/receipt/decision.js` | UPDATED | export **1줄**. `BRANCH_BASED_COMMANDS` 무변경(test가 단언) |
| `.gitignore` · `docs/ENVIRONMENT.md` | UPDATED | 원장 무시 · `MCCP_SANTA_ROUND_CAP` 등재 |
| `plugin.json` · `renderer/html.js` · `renderer/markdown.js` · `CHANGELOG.md` | UPDATED | version 4면 동기 (1.23.8) |
| `.claude/prds/santa-loop-materialize.prd.md` | UPDATED | M1 행에 미달 명시 |
| `.claude/notes/santa-loop-materialize-m1-implement-codex.md` | CREATED | 게이트 기록 (D7) |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | HIGH 2건 신규 등재 |

## Tests Written

| Test File | Tests | 커버 |
|---|---|---|
| `santa-loop-cap.test.js` | 42 | 캡 강제 · DD11 기록 경계 · DD12 멱등(연속·동시) · envelope round-trip · 입력 검증 8종 · traversal 12값 × 5 subcommand · 손상 원장 · repo-root 앵커 · escalate 3분기 · lock 75 · mode 0600+repair(POSIX) · camelCase · 산문 배치 · `BRANCH_BASED_COMMANDS` 불변 · exit code 전파 · R2 F1 회귀 |
| `santa-gate.test.js` | 10 | verdict 4조합 + envelope 0건 + frozen param + 순수성 + 어휘 봉인 + [의도된 미봉] 고정 |

**3건은 Windows에서 skip된다** — `0600` mode · mode self-repair · repo 밖 symlink 차단. POSIX 전용 분기라 주 개발 플랫폼에서 **미검증**이다. R1은 이 항목을 못 봤고 R2도 언급하지 않았으므로 **열린 위험으로 남긴다**.

## Next Steps

- [ ] `/mccp:santa-loop` — STATE.md `escalate_pending`이 이 decision을 가리키고 있고, Codex 양 라운드 verdict가 `divergent`다
- [ ] `/mccp:prp-commit` → `/mccp:pr` — plan-codex가 `divergent`라 cross-gate dedupe는 fail-closed, PR-Codex가 반드시 재발화한다
- [ ] merge 시 `1.23.8` 선점 확인 — sibling worktree 4개가 같은 base(`1c5220a`)에 있다. 충돌 시 §3.7 forward-only로 상향하고 4면 + PR title 동기
- [ ] P1(판정 계약) — dual-review 우회 경로가 1순위
