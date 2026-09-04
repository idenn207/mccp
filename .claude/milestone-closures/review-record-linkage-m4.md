# Milestone Closure — review-record-linkage-m4

## Milestone
- ID         : review-record-linkage-m4
- Name       : review-round-structure
- Plan       : .claude/plans/review-record-linkage-m4.plan.md
- Status     : done
- Closed at  : 2026-09-04T02:23:15.978Z
- Closed by  : /mccp:milestone-close (run_id=3c922128-a8bc-4833-afbc-4800073fdc36)

## Acceptance Condition

운영자가 Phase 2 안내에 따라 다음 condition을 제시했다 (verbatim):

```
M4 plan Task 1-9 complete, validation 202/202 green, panel record
measurement.rounds is an integer >= 1, --check-round-structure exit 0 with
present>=1, frozen baseline byte-identical, version-declaration-guard ok,
or stop after 10 turns
```

이 절은 *충족해야 할 조건*을 적는 자리이지 충족됐다는 주장이 아니다(closure README 형식 규약).
조건별 판정은 아래 `## Goal Loop Result`가 갖는다.

## Goal Loop Result

verdict=done. 운영자 응답 (mask 통과, hit 0건 · 원문 무변경):

```
goal-done:M4 acceptance 6절 전부 실측 충족, guard 결함 2건 이연
```

### 라이브 `/goal` loop이 arming됐는지는 관측되지 않았다

`goal-detect`는 `availability=available` ∧ `goal_signal=true` ∧
`signal_ref={"row":4,"name":"review-round-structure","plan":".claude/plans/review-record-linkage-m4.plan.md","status":"in-progress"}`
를 냈고, 운영자는 안내대로 `/goal <condition>` 텍스트를 다음 turn에 제출했다. 다만 세션 쪽에서
`◎ /goal active` indicator나 native command 확장 블록이 관측되지 않았으므로, **small fast
model이 실제로 평가를 돌렸다고 주장하지 않는다.** M3 closure와 같은 관측이다.

대신 조건의 6개 절은 전부 기계로 측정 가능한 명제였고, 아래 값은 평가 모델의 판단이 아니라
**이 세션이 직접 실행한 명령의 출력**이다. 격리 lock은 실제로 enter/exit했고(`ok:true` →
`cleared:true`), 그 사이 heartbeat 1회를 넣었다. guard는 lock 활성 중 실제로 3회 BLOCK을
발화했다 — 아래 `## Deviation` 절이 그 셋을 갖는다.

### 측정 시점 — 전부 lock 진입 **이전**이다

이것이 이 closure가 M3와 갈라지는 지점이라 명시한다. `goal-phase-guard.js`의 Bash 분류는
default-deny이고(`:173-178`) allowlist(`:76-87`)에 `node --test`도 임의 프로젝트 스크립트도
없으므로, **owner 세션은 lock 안에서 acceptance를 기계 검증할 수 없다.** 그래서 6절은 전부
lock 진입 전 turn에서 측정했다.

그 값들이 lock 기간 중 낡지 않았다는 근거는 guard 자신이다 — 같은 hook이 Edit/Write/MultiEdit/
NotebookEdit를 전면 DENY하고(`:340-344`) Bash mutate 경로도 막으므로, 측정과 판정 사이에 저장소를
바꿀 수 있는 경로가 이 세션에 없었다. lock exit(`cleared:true`) 이후에야 쓰기가 열렸다.

### 조건 6절 — 전부 실측 충족

| # | 절 | 판정 | 근거 (실행 출력) |
|---|---|---|---|
| 1 | `Task 1-9 complete` | PASS | M4 report `## Tasks Completed` 9행 전부 "Complete" |
| 2 | `validation 202/202 green` | PASS | plan Validation 1+2단계 9파일 재실행 → `tests 202 · pass 202 · fail 0 · duration_ms 45454.5476` (`MCCP_CODEX_DISABLED=1 --test-concurrency=2`) |
| 3 | `measurement.rounds integer >= 1` | PASS | `.claude/reviews/plan-review-review-record-linkage-m4.md` `## Measurement` → `"rounds": 1` |
| 4 | `--check-round-structure exit 0, present>=1` | PASS | `state=ok since=52e11d7b78afda…` · `in_scope=1 present=1 not_enrolled=0 absent=0` · `exit=0`. **vacuous pass 아님** — 분모 1건이 실재한다 |
| 5 | `frozen baseline byte-identical` | PASS | `git diff --stat -- docs/review-record-linkage/frozen-baseline.md` 출력 0줄 |
| 6 | `version-declaration-guard ok` | PASS | `ok: no version declaration on this branch (merge-base with origin/main = 1.34.4)` · exit 0 (UI5) |
| — | `or stop after 10 turns` | 미발동 | 2 turn 안에 6절 전부 충족 |

plan `## Acceptance`의 나머지 항목도 같은 실행에서 확인됐다 — `classifyRoundStructure`의
자기신고 면제 부재 · 원장 **파일 부재**에서 `rounds`가 `null`이고 `0`이 아님 · `buildReviewRecord`
never-throw · `cli.js record` 전 경로 exit 0이 전부 단위 test의 명시 단언으로 green이다
(`M4 Task 4 (b): an ABSENT ledger file is null, never 0` 등).

경계 강제의 **역방향**(경계 이후 `absent`를 심으면 비영점)은 이 세션이 직접 재현하지 않았다.
fixture test가 기계 단언하고, 라이브에서도 Task 8 재생성 **전** 같은 명령이 `exit 1 · absent=1`
이었다고 M4 report `## Validation Results` 3b행이 기록한다 — 즉 근거는 test + 선행 관측이지
이 closure 세션의 실행이 아니다.

### `Status: done`이 뜻하지 않는 것 — 미충족인 채 남는 4건

`done`은 「M4의 Task·Validation·동결 불변식·라이브 실값이 실측으로 확인됐다」는 뜻이다.
「plan이 적은 모든 문언이 이 문서가 쓰이는 순간 충족돼 있었다」는 뜻이 **아니다.**

1. **ship receipt가 아직 없다.** `.claude/receipts/mccp-pr-codex/review-record-linkage-m4.json`
   부재. milestone-close는 chain에서 `/mccp:pr` **앞**이므로 정상 순서다. 현재 게이트 완주는
   `mccp-plan-codex`(verdict `divergent`, `MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion`으로
   봉인 · §3.15) + `mccp-implement-codex`까지다.
2. **cross-model 심사 0회.** 이 milestone에서 Codex는 한 번도 발화하지 않았다. same-model
   패널 4관점(4/4 fail, R1 전건 흡수)이 그것을 대신하지 않는다. codex 사용량 한도는
   2026-09-07 재설정 예정이며, dedupe가 닫혀 있으므로 `/mccp:pr`에서 PR-Codex가 실제로 발화한다.
3. **상류 plan receipt 2건이 stale이다.** 아래 A/B 절 참조 — 이 closure가 만든 것이 아니다.
4. **지표 2(층간 링크율)는 여전히 라이브 0건이다.** M3 closure의 미충족 1번이 그대로 남는다 —
   M4는 지표 3(내용층 라운드 구조)을 닫았지 지표 2를 닫지 않는다. 이 사이클의 상류
   `mccp-plan-codex` receipt에 `meta.plan_path`가 없어(설치 캐시 1.33.6에서 게이트가 돌았다)
   경로 앵커가 legacy로 판정한다. **첫 라이브 링크 ship은 다음 사이클**이다.

## Deviation — goal-phase guard 결함 3건 (전부 이번 실행이 실측)

`plugins/mccp/scripts/hooks/goal-phase-guard.js`(실행된 것은 설치 캐시 1.33.6 사본).
셋 다 **거짓 차단**이며 fail-closed 방향이라 안전하지만, 명령이 자기 plan의 Validation을
goal-phase 안에서 실행하지 못하게 만든다. 수정은 이 milestone 범위 밖이라 backlog로 이연한다.

| # | 관측 | 위치 | 근거 |
|---|---|---|---|
| 1 | `git merge-base`가 deny된다 | `BASH_DENY_PATTERNS` `:59` `/\bgit\s+merge\b/` | read-only인 `git merge-base origin/main HEAD`가 매치. allowlist `:77`에도 `merge-base`가 없어 이중 차단. **plan 자신의 Validation 3단계 명령**이 goal-phase 안에서 실행 불가 |
| 2 | owner 세션은 acceptance를 기계 검증할 수 없다 | `classifyBashCommand` `:173-178` default-deny + allowlist `:76-87` | allowlist가 git-read · gh-read · `ls/pwd/echo/cat` · `goal-phase-lock.js` · `goal-detect.js`뿐. 모든 plan의 `## Validation`은 `node`로 구성되는데 `^\s*node` 항목이 그 둘 말고 없고, env-prefix 형태(`MCCP_CODEX_DISABLED=1 node --test …`)는 어차피 `^\s*node`에 걸리지 않는다. guard 헤더 `:33-36`이 적은 대로 `/goal` 평가자는 같은 `session_id`에서 돌므로 `owner-session-match` → 전면 enforcement |
| 3 | 개행이 segment 구분자가 아니다 | `splitSegments` `:109-135` | `;` · `&&` · `\|\|`만 분리하고 `\n`은 `buf`에 그대로 누적. 따라서 여러 줄 명령은 **한 segment**가 되어, 모든 줄이 allowlist를 만족해도 첫 줄 형태 하나로 전체가 판정된다. 실측: `SIDECAR=…` + `ls` + `goal-phase-lock.js exit` 3줄이 한 blob으로 deny됐고, 같은 exit를 단일 줄로 다시 부르니 통과했다 |

2번은 단순 버그로 단정하지 않는다 — guard의 선언된 목적(`:10-14`)은 mccp **write** 차단인데
구현은 read까지 default-deny한다. 그 폭이 의도인지 과잉인지는 이 closure가 판정하지 않고,
관측과 그 대가(측정을 lock 밖으로 밀어내야 한다)만 기록한다.

## Deviation — 명령 본문 Phase 4의 mask snippet은 여전히 잘못된 함수를 가리킨다

M3 closure가 이미 기록한 결함이 무수정으로 남아 있음을 재확인한다. `milestone-close.md`
Phase 4 step 3은 `applySecretMask(...).text`를 지시하지만 그 함수는 derive **model** 객체를
받아 model을 반환하며 `.text`를 갖지 않는다(`derive/mask.js:185`). 문자열용 함수는
`maskSecrets(text) -> {masked, hits}`다. 본 closure도 M3와 같이 `maskSecrets`를 사용했다 —
hit 0건, 원문 무변경.

Phase 0의 cost-tier probe(`cost-state.js get-tier`)도 M3 때와 동일하게 **무출력 + exit 0**이다
(CLI entrypoint가 없는 순수 모듈이라 subcommand를 해석하지 않는다). 명령 본문의
`|| echo "green"` fallback이 exit 0 때문에 발동하지 않으므로 tier가 빈 문자열로 흐른다.
이 정밀한 형태는 **새 관측이 아니다** — backlog가 이미 두 번 등재했고(`:233` MSW M6 ·
`:334` review-loop-bypass M2) 후자가 exit 0 때문에 fallback이 타지 않는다는 것까지 적었다.
여기서는 그 결함이 무수정으로 재현됐다는 사실만 확인한다. 본 실행은 green으로 진행했다.

## Deviation — 명령 본문 Phase 4의 closure-doc heredoc이 이 셸에서 파싱 실패한다

Phase 4 step 3의 `cat > "$CLOSURE_PATH" <<EOF … EOF` 형태를 그대로 시도하면
Git Bash에서 `unexpected EOF while looking for matching '` 로 죽는다(quoted delimiter
`<<'EOF'`로 바꿔도 동일). 본 closure는 Write 도구로 작성했다. 위 guard 결함 3번(개행이
segment 구분자가 아님)과 뿌리가 같은 축인지는 확인하지 않았다 — 이 실패는 lock **exit
이후**에 났으므로 guard와 무관하다. 같은 backlog 항목에 묶어 이연한다.

## Milestone Closure Provenance stamp — A/B 실측

M3 선례를 따라 stamp 이전/이후를 측정했다.

- **measurement A (stamp 이전)** — `stale` **2건**(`mccp-plan-codex` · `mccp-implement-codex`),
  `missing` 0 · `blocking` 0 · `open_critical` 0.

| gate | receipt가 봉인한 plan_hash | A 시점 현재 hash |
|---|---|---|
| `mccp-plan-codex` | `sha256:b39fca3d…` | `sha256:a19769eb…` |
| `mccp-implement-codex` | `sha256:6fda9927…` | `sha256:a19769eb…` |

원인은 구조적이며 모든 shipped 사이클이 겪는다(`/mccp:prp-implement` 2.5.4의 plan 주입 +
R1 흡수 8축이 plan 본문을 바꿨다). **stale은 stamp가 만드는 것이 아니라 stamp 이전에 이미
존재한다** — 즉 선례 두 건(santa-adjudication-m1 · session-process-reclaim-m3)이 stamp를
회피한 근거가 여기서는 성립하지 않는다. 그래서 이 closure는 M3와 같이 **stamp를 싣는다**.
그 결과 closure 본문 변조가 다음 게이트의 `plan_hash` 대조에서 드러나는 option B custody
anchor가 실제로 작동한다.

- **measurement B (stamp 직후)** — `stale` **2건**(동일 gate 2종) · `missing` 0 ·
  `blocking` 0 · `open_critical` 0. **새로 생긴 blocking 종류 0건.** 변한 것은
  `current_plan_hash` 값뿐(`sha256:a19769eb…` → `sha256:3329513e…`)이며 stale 판정 자체는
  A와 동일하다.

  B는 **첫 stamp 직후**에 측정했고, 그 직후 이 문단을 쓰는 편집이 closure 본문을 다시 바꾸므로
  stamp를 한 번 더 갱신한다(README의 idempotent REPLACE 규약). 따라서 plan의 최종
  `current_plan_hash`는 위에 인용한 B 시점 값보다 한 번 더 나아가 있다 — 인용값은 B를 측정한
  그 순간의 실제 출력이지 최종 상태가 아니다. B가 주장하는 것은 특정 hash 값이 아니라
  **stale 판정의 종류와 개수가 A와 같다**는 것이고, 그 명제는 재-stamp 이후에도 유지된다
  (재-stamp는 같은 섹션을 REPLACE할 뿐 새 gate를 만들지 않는다).

## 종료 이후에도 남는 일

M4가 닫혀도 사라지지 않는 항목이다.

1. **`/mccp:prp-commit`** — 이 closure 문서 · plan stamp · PRD 표 flip을 커밋.
2. **`/mccp:pr` 진입 전 `export PR_PLAN_PATH=.claude/plans/review-record-linkage-m4.plan.md`** —
   기본 파생 `.claude/plans/review-record-linkage.plan.md`는 실재하지 않아 2.5.7이 HALT한다.
   슬러그도 `--decision review-record-linkage-m4`로 고정할 것(브랜치명 fallback 함정).
3. **PR 본문에 `## Gate Deviation`** — 상류 plan/implement receipt staleness 2건을 명시 기록
   (M4 report `## Next Steps` 3번과 같은 항목).
4. **backlog 적재 완료 — 신규 4건.** goal-phase guard 결함 3건(`git merge-base` deny ·
   default-deny가 in-lock 검증을 막음 · 개행 미분리) + closure heredoc 파싱 실패 1건을
   `.claude/plans/codex-findings-backlog.md`에 append했다(2026-09-04 행 4개).
5. **backlog 재적재 안 함 — 기존 2건.** mask snippet(`:197` · `:234`)과
   cost-tier probe(`:233` · `:334`)는 이미 등재돼 있고 무수정 상태다. 이 closure는
   재현을 확인했을 뿐 중복 행을 만들지 않는다.
6. **PRD 전체 완료 → `/mccp:archive-complete`** — M4가 이 PRD의 마지막 milestone이다
   (M1 complete · M2 dropped · M3 complete · M4 complete). 단 **PR 머지 이후**에 사람이
   수행한다(§3.11 C2 — archive는 milestone 시점이 아니다).
7. **다음 사이클에서 지표 2 라이브 링크 완주 확인** — 위 미충족 4번.

## Provenance
- Lock run_id        : 3c922128-a8bc-4833-afbc-4800073fdc36
- Lock owner session : 1f84bb0c-49c5-4446-a400-837daddf7fee
- Plan source        : .claude/plans/review-record-linkage-m4.plan.md
- Detection signal   : {"row":4,"name":"review-round-structure","plan":".claude/plans/review-record-linkage-m4.plan.md","status":"in-progress"}
- mccp version       : 1.34.4
