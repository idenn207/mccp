# Implementation Report: santa-loop 실체화 — M1 (모듈 골격 + 캡 강제)

- **Plan**: [.claude/PRPs/plans/archived/santa-loop-materialize-m1.plan.md](../plans/archived/santa-loop-materialize-m1.plan.md) (D6은 *구현 시점에* archived 안 함을 기록한 것 — PRD 전 milestone 종료 후 2026-08-16 `/mccp:archive-complete`로 이동됨)
- **PRD**: [.claude/prds/archived/santa-loop-materialize.prd.md](../../prds/archived/santa-loop-materialize.prd.md) M1
- **Branch**: `santa-loop-materialize` · **Version**: 1.23.7 → 1.23.8
- **게이트 기록**: [.claude/notes/santa-loop-materialize-m1-implement-codex.md](../../notes/santa-loop-materialize-m1-implement-codex.md)

## Summary

`/mccp:santa-loop`은 이 milestone 이전까지 **백킹 코드가 0**이었다. 라운드 수는 아무도 세지 않았고, 캡은 산문 한 줄(`Maximum 3 iterations`)이 유일한 근거였다. M1은 결정 로직을 `plugins/mccp/scripts/lib/santa/` 4개 모듈로 내리고 `santa-loop.md`를 thin caller로 만들었다. 라운드는 gitignored 원장에 기록되고, 캡은 `begin-round`가 **리뷰어 발화 직전**에 판정해 exit 12로 거부한다.

**판정 규칙의 내용은 바꾸지 않았다.** `gate.js`는 현 산문 표를 1:1로 옮겼고 `envelope 0건 → NAUGHTY` 경로도 CLI 경유로 도달 가능한 채 남겼다.

## 이 milestone이 달성하지 **않은** 것

숨기지 않고 먼저 적는다. 셋 다 plan이 사전에 명시한 것이며 구현 중 새로 생긴 미달이 아니다.

1. **PRD Success Metrics 1행의 절반 미달.** "라운드 수가 상태 파일에 기록되고 **receipt에 봉인**"에서 앞 절반만 냈다. 봉인은 `mccp-santa-review` GATE_ID를 신설하는 **M2 소유**다. PRD M1 행에 같은 문장을 실었다.
2. **캡은 *인덱스 경계*에서만 구속되며, 두 가지를 막지 못한다.** `record`·`verdict`는 `begin-round`가 **연 적 없는 인덱스**를 거부하므로 거부를 무시하고 리뷰어를 띄워도 그 인덱스로는 원장에 못 들어가고 verdict도 안 나온다. 막지 못하는 것 (a) **리뷰어 토큰 소모** — 리뷰어 기동은 LLM 행위라 셸로 추출할 대상이 없다. (b) **마지막 FINAL 인덱스 재사용** — `record --round <cap-1>`은 통과한다(D9). M1은 둘 중 어느 것도 막았다고 주장하지 않는다.
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
| 신규 unit/CLI test | Pass | 54 tests · 51 pass · **0 fail** · 3 skip(POSIX 전용) — code-review H1·H2 회귀 2건 포함 |
| 회귀 — `receipt/tests` | Pass | 554 tests · 553 pass · 0 fail · 1 skip |
| 회귀 — `renderer/tests` | Pass | 672 tests · 0 fail (version 4면 동기 검증 포함) |
| 산문 캡 잔존 0 — **`plugins/mccp/` 사본 한정** | Pass (범위 내) | `Maximum 3 iterations` · `ESCALATE ==` 둘 다 0. **repo 전역은 Pass가 아니다** — tracked 사본 `.claude/commands/santa-loop.md:124,162`에 산문 캡이 남아 있다(D11) |
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

**D8 — `## Output` 섹션이 무변경이 아니다 (Acceptance 미달, 의도적).** Acceptance는 "rubric 표와 Output 섹션은 diff 무변경"이라 적었으나 `Iterations: [N]/3` → `[N]/[cap]` 한 줄을 바꿨다. 캡이 `MCCP_SANTA_ROUND_CAP`으로 설정 가능해진 이상 `3`을 리터럴로 두면 **출력이 거짓을 보고한다**(cap=1로 돌려도 `/3`으로 인쇄). 산문 캡 제거의 목적과 정면으로 충돌하므로 문면을 지키는 대신 값을 고쳤다. rubric 표는 실제로 무변경이다. 해당 acceptance 항목은 **체크하지 않은 채로 둔다**.

**D9 — DD11의 강제 등급이 문면보다 좁다 (code-review MEDIUM, 문서 축).** Acceptance·`santa-loop.md`·`CHANGELOG`·본 보고서가 "거부를 무시하고 리뷰어를 띄워도 원장에 들어가지 못하고 verdict도 안 나온다"라고 적었는데, 이는 **`begin-round`가 연 적 없는 인덱스**에만 성립한다. 캡 도달 후 **마지막(이미 FINAL) 라운드 인덱스를 재사용**하면 `record`·`verdict`가 통과한다(실측: cap=1에서 `record --round 0` exit 0 → `verdict --round 0` NICE, `status`는 `rounds:1`로 과소 보고). 코드 쪽은 의도대로다 — `ledger.js`가 "`record`는 OPEN에서만"을 P1 소유로 명시 이연했다. 따라서 결함은 **문서가 코드보다 강하게 주장하는 쪽**이며, 해당 acceptance 항목은 **체크하지 않은 채로 둔다**. 문안 정정 또는 `verdict !== null` 거부(P1 경계)는 후속 소관.

**D10 — code-review가 HIGH 2건을 잡아 수정했다 (ship 직전).**
- **H1** `santa-loop.md`의 CLI 경로가 repo-relative(`plugins/mccp/…`)였다. plugin은 `~/.claude/plugins/cache/mccp/mccp/<ver>/`에 설치되고 cwd는 사용자 프로젝트 루트이므로 **이 repo 밖에서는 node가 MODULE_NOT_FOUND(exit 1)로 죽는다**. Step 3의 "비영점 exit → 리뷰어 미발화" 규칙과 맞물려 santa-loop이 **모든 설치 사용자에게 영구히 cap reached로 보이는** 상태였다(exit 1은 문서화된 map 0/12/75/2에도 없어 진단 불가). `${CLAUDE_PLUGIN_ROOT}` 앵커로 수정 + `SANTA=` 대입을 검사하는 회귀 test 신설. **M1의 캡 강제가 dogfood 환경에서만 참이던 것을 실환경으로 넓힌 수정이다.**
- **H2** `cli.js#requireRound`가 `Number('') === 0`이라 빈/공백 `--round`를 **round 0으로 조용히 해석**했다. 이 값은 가설이 아니라 `santa-loop.md` Step 3의 roundIndex 추출이 파싱 실패 시 내보내는 값(`catch{…("")}`)이다 — begin-round가 죽은 라운드의 리뷰어 출력이 round 0에 적재되고 verdict까지 났다(실측). `Number()` 이전 거부 + 회귀 test 신설.

**D11 — 캡 강제는 `plugins/mccp/` 사본 한정이다. tracked 사본이 하나 더 있고 거기엔 산문 캡이 남아 있다.** santa-loop round 1의 Reviewer B가 잡았다. `.claude/commands/santa-loop.md`(175행, git-tracked)가 별도로 존재하며 `Maximum 3 iterations`(:124)와 `Iterations: [N]/3`(:162)를 그대로 갖는다 — 즉 비-namespace `/santa-loop`은 여전히 백킹 코드 0의 산문 캡으로 돈다. M1의 "산문 캡 잔존 0"은 plan의 `Files to Change`가 지목한 `plugins/mccp/commands/santa-loop.md`만 검증했다.

**해당 acceptance 항목의 미체크 사유는 둘이다 — D8과 D11.** 그 한 줄이 두 요구를 묶고 있다: "결정 로직 잔존 0"(D11 소관 — plugin 사본에서만 참) + "Output 섹션은 diff 무변경"(D8 소관 — 실제로 변경됨). 앞의 것을 D8로만 귀속하면 stale 사본 문제가 문면상 사라지므로, 두 사유를 함께 적는다. plan 본문의 그 줄 자체는 **고치지 않는다** — 텍스트를 바꾸면 `plan_hash`가 이동해 `mccp-plan-codex` receipt가 stale이 되고 §3.12 체인이 끊긴다(체크박스 상태만 hash-중립이다). 대신 범위 한정어를 PRD Success Metrics 행과 M1 Outcome 셀, 그리고 위 Validation Results 행에 넣었다.

**단, 이것은 santa 고유 결함이 아니라 repo 전역 조건이다.** `.claude/commands/` 7개 전부가 `plugins/mccp/commands/`와 diverged이고 전부 `bc18572 feat: 개발용 ECC Plugin 주입` 한 커밋에 동결돼 있다 — `plan.md` 200행 vs **2067행** · `prp-implement.md` 385 vs 1618 · `code-review.md` 289 vs 484 · `prp-pr.md` 184 vs 49 · `plan-prd.md` 160 vs 396 · `prp-commit.md` 112 vs 114 · `santa-loop.md` 175 vs 232. 즉 M1이 만든 drift가 아니라 M1이 **드러낸** 선재 drift다.

**M1에서 고치지 않는다.** 7개 동기화는 plan 범위 밖이고, 삭제/동기화 중 무엇이 맞는지는 이 사본들을 의도적으로 주입한 운영자의 결정이다(특히 `prp-pr.md`는 `.claude` 쪽이 **더 길어** 단순 stale이 아닐 수 있다). backlog에 등재하고 PRD M1 Outcome에 강제 범위를 명시하는 것으로 닫는다.

## M1 완료 판정 (2026-08-14)

PRD `Delivery Milestones` M1 행을 `in-progress` → **`complete`**로 확정했다. 근거는 commit `5384473` + 위 Validation Results 전 항목 Pass다.

**Acceptance 원장: 29항목 중 26 체크 · 3 미체크.** 미체크는 누락이 아니라 **plan 문면 그대로는 미달**이라는 정직한 표시다 — 각각 D2(외부 의존 4개 vs "정확히 3개") · D9(DD11 강제 등급) · **D8+D11**(`## Output` 무변경 아님 **그리고** "결정 로직 잔존 0"이 plugin 사본 한정). 체크박스 상태는 `hash.js#normalizeCheckboxes`가 정규화하므로 `plan_hash`(`sha256:f5bf1cae…`)는 **불변**이고 receipt 체인은 무손상이다(편집 전후 실측 일치).

**실측 출력 (재현 명령 + 그 자리에서 나온 값).** 아래는 기대치 재진술이 아니라 2026-08-14에 이 워크트리에서 실제로 나온 출력이다 — santa-loop round 0의 Reviewer B가 자기 샌드박스에 `node`가 없어 재현하지 못했고, 그래서 "숫자를 다시 적지 말고 실제 출력을 붙이라"고 요구한 항목이다.

```
$ node --test .../santa-loop-cap.test.js .../santa-gate.test.js
tests 54 | pass 51 | fail 0 | skipped 3        (skip 3 = POSIX 전용: 0600 · self-repair · symlink)

$ node --test plugins/mccp/scripts/receipt/tests/*.test.js
tests 554 | pass 553 | fail 0 | skipped 1

$ node .../instruction-contract/lint.js --claude CLAUDE.md --ledger .../instruction-contract.md
rows=25 resident=15 on-demand=10 retire=0 routed=2 removed=0 c4=strict@7fe48d92
  C1 pass · C2 pass · C3 pass · C4 pass                                            (exit 0)

$ grep -n "Maximum 3 iterations" plugins/mccp/commands/santa-loop.md   → no match
$ git status --short | grep santa-loop                                 → no match (gitignored)
$ git diff --diff-filter=D --name-only origin/main...HEAD              → (empty)

$ node -e "…planAwareMarkdownHash('.claude/plans/santa-loop-materialize-m1.plan.md')"
BEFORE  sha256:f5bf1caeb0973f8cb1ecf130abab69295e9b6373660d48946639f3f192edc97d
AFTER   sha256:f5bf1caeb0973f8cb1ecf130abab69295e9b6373660d48946639f3f192edc97d   (unchanged)
```

`node --test <dir>/` 형태는 **Node 24에서 동작하지 않는다** — 디렉토리를 모듈로 해석해 `MODULE_NOT_FOUND`로 죽고 `fail 1`처럼 보인다. plan의 Validation 블록이 그 형태로 적혀 있으므로 `<dir>/*.test.js` glob으로 실행해야 한다.

**santa-loop 3라운드 판정 (2026-08-14) — 이 완료 처리 자체를 `/mccp:santa-loop`에 걸었다.** 캡(3)이 소진돼 `begin-round`가 exit 12 `cap_reached`로 정지시켰다. 즉 M1이 만든 캡이 **M1 자신의 완료 판정에서 실제로 발화**했다.

| R | A(opus) | B(gpt-5.4) | 흡수 |
|---|---|---|---|
| 0 | PASS | FAIL | CHANGELOG가 `## Output` 무변경을 주장(실제 변경) + 같은 문장이 DD11 강제 등급을 코드보다 강하게 서술 → CHANGELOG·`santa-loop.md`·`ENVIRONMENT.md` 3면을 인덱스 경계 기준으로 정정. 실측 출력 첨부(B의 샌드박스에 `node` 부재). `.claude/cache/status.html` 지적은 **기각** — untracked이고 인용된 행은 마일스톤 status가 아니라 receipt/게이트 파생이다 |
| 1 | PASS | FAIL | PRD M1 Outcome과 보고서 "달성하지 않은 것" 2면에 같은 과장이 남아 있었다 → 정정. **`.claude/commands/santa-loop.md` 발견** — tracked 사본에 산문 캡 잔존, 나아가 `.claude/commands/` 7개 전부가 `bc18572`에 동결된 stale 스냅샷 → D11 + backlog |
| 2 | **FAIL** | **FAIL** | 양쪽이 같은 결함으로 수렴: acceptance "산문 캡 잔존 0"에 범위 한정어가 없고, Validation 행이 무조건 Pass로 적혀 D11과 직접 모순. **캡 도달로 미해소 상태에서 escalate** |

**A는 R0·R1에서 CHANGELOG 모순과 stale 사본을 둘 다 놓쳤고 B가 잡았다** — 모델 다양성이 값을 낸 지점이다. R2에서는 A가 "미체크 사유가 D8로 잘못 귀속됐다"는 더 정밀한 형태로 같은 결함에 도달했다.

**캡 escalate 후 운영자 결정으로 문안 범위 한정을 택했다**(대안: 사본 삭제 / M1 되돌림). 그에 따른 정정 3건 — PRD Success Metrics 행 · PRD M1 Outcome 셀 · 위 Validation Results 행 — 은 **캡 소진 후 적용됐으므로 리뷰어 재검증을 거치지 않았다**. R2의 두 지적을 그대로 반영한 것이지 새 주장을 넣은 것은 아니다.

**원장 기록 누락 1건.** R2의 Reviewer B envelope는 JSON 추출이 codex 출력에 에코된 프롬프트 템플릿을 집어 실패했고, 그 뒤 라운드가 FINAL이 됐다. 이미 FINAL인 인덱스에 `record`를 다시 넣는 것은 D9가 문서화한 구멍 자체라 **쓰지 않았다** — 원장은 R2에 A만 담고 있다. B의 FAIL은 세션 기록이 근거이며, A가 독립적으로 FAIL했으므로 verdict(NAUGHTY)는 영향받지 않는다. **이 사건 자체가 D9의 실사용 증거다**: 판정 lifecycle 부재가 원장 정확도를 떨어뜨린다는 것을 P1이 닫아야 할 이유로 기록한다.

**"complete"가 주장하는 것은 M1 행의 Outcome뿐이다** — 라운드를 코드로 세고 캡에서 정지하며 산문 캡 의존이 끝났다는 것. PRD **Success Metrics 1순위의 절반(receipt 봉인)은 여전히 미달**이고 그것은 M2 소유다. M1 행 Outcome 셀이 그 미달을 그대로 싣고 있으며 이 완료 처리가 그것을 지우지 않는다.

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
