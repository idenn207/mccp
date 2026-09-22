# Plan: halt-step-recording (orchestrator-step-wiring M2)

**Source PRD**: `.claude/prds/orchestrator-step-wiring.prd.md`
**Selected Milestone**: M2 — halt-step-recording (이 PRD의 마지막 milestone)
**Complexity**: Medium

## Summary

`/mccp:work`가 멈춘 지점을 기록해, A1이 하락했을 때 "어느 phase가 막았나"에 답할 수 있게 한다.
producer(`auto-chain.recordStep` → STATE.md `chain_progress`)는 이미 구현돼 있으나 `work.md`에
호출자가 0건이라 이 저장소의 `chain_progress`는 **한 번도 채워진 적이 없다** — 현재 STATE.md에
그 키 자체가 없고, 코드베이스 전체에 소비자도 0건이다. M2는 그 배선을 넣되 산문 지시가 아니라
**정적 test가 강제하는 배선**으로 넣고, 기록을 `/mccp:work` 진입 배너에 붙여 소비 회로까지 닫는다.
쓰기는 halt가 일어난 worktree의 STATE.md에 하고, **읽기는 저장소 전체를 순회**해 UI4의 집계
경계를 producer 변경 없이 만족시킨다. 기록 경로의 어떤 실패도 체인을 멈추지 않는다.

## User Intent

<!-- PRD의 사용자 확인 범위(Scope · 집계 경계 · 완주 정의 · 못박는 결정 4건 · Out of scope)와
     이 호출에서 나온 것만 옮긴다. 저자 근거는 ## Design Decisions 소유. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | `/mccp:work`가 멈춘 step을 기록해 A1 하락 시 어느 phase가 막았는지 답해지게 한다 | direction |
| UI2 | 기록 실패는 `/mccp:work` 체인을 멈추지 않는다. 실패를 조용히 삼키지 않고 loud stderr로 표면화한다 | constraint |
| UI3 | 완주의 정의를 바꾸지 않는다. PR 번호 생성 시점 그대로이며 새 완주 producer를 만들지 않는다 | exclusion |
| UI4 | 집계 경계는 저장소 전체다 | constraint |
| UI5 | `plugins/mccp/commands/work.md:224` 와 `:715` 의 파일명 불일치는 이 PRD 밖이다 | exclusion |
| UI6 | halt의 원인 분류와 자동 진행은 C9 소유다. 여기서는 어느 step에서 멈췄다까지만 기록한다 | exclusion |
| UI7 | 이벤트 corpus 를 git-tracked 로 승격할지는 이 PRD 가 단독으로 정하지 않는다 | exclusion |
| UI8 | M2 는 값이 신뢰 가능해진 뒤에 온다. M1 이 먼저 착지해야 착수한다 | direction |
| UI9 | A2 나 A4 같은 다른 forward-only 지표의 배선은 이 PRD 가 다루지 않는다 | exclusion |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 계측 CLI 계약 | `plugins/mccp/scripts/lib/msw-metrics/cli.js:266-310` | 전체를 try/catch 로 감싸 **어떤 실패에도 exit 0 + 빈 stdout**, 사유는 stderr, 절대경로 미노출(F9) |
| 계측 CLI 계약 | `plugins/mccp/scripts/lib/plan-review/cli.js:1515` (`always exit 0`) | 판정이 아니라 관측이므로 게이트를 막을 권한이 없다 |
| 배너 fold 규칙 | `plugins/mccp/commands/work.md:117-137` | `spawnSync(..., {timeout:3000})` 자식 프로세스 경계 · 빈 출력이면 배너 생략 · 실패는 한 줄로 표면화 |
| worktree 순회 | `plugins/mccp/scripts/derive/sources/worktrees.js:27,313-347` | `execFileSync('git', [고정 argv], {cwd, timeout, stdio 잠금})` · cap · 오류는 `mask.scrubAbsPaths` 후 노출 |
| worktree STATE.md 읽기 | `plugins/mccp/scripts/derive/sources/worktrees.js:163-195` | `parseStateMd` 로 파싱하고 부재/파손/버전불일치를 **구분**해 보존(F3) |
| 명령 본문 정적 강제 | `plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js:58-189` | fence 추출은 `command-body/blocks` 오라클 · recorder 가 분기의 마지막 문장이 될 수 없다(F1) · recorder 가 stderr 를 버리지 않는다(F3) · 표와 실제 배선의 양방향 일치 |
| present-only 필드 | `plugins/mccp/scripts/state/state-writer.js:309-320`, §3.2 `dep_check_at` mirror | set 된 경우에만 직렬화 — 부재가 곧 "모름" |
| 한 줄 정규화 | `plugins/mccp/scripts/state/fix-task.js:52-58` (`oneLineExcerpt`) | CR/LF 전부 접고 200자 상한. 새로 만들지 않고 재사용 |
| shell-state 독립 | `plugins/mccp/commands/work.md:213` | fence 간 상태는 shell var 가 아니라 `$GITDIR/*` 아티팩트로 self-derive |

## Design Decisions

**DD1 — 쓰기는 worktree-local `chain_progress`, 읽기는 저장소 전체 순회.** 두 축을 나눈다.

*쓰기*: PRD Evidence 가 두 채널을 명시적으로 갈라 놓았고(*"두 경로는 만나지 않는다"*) 지표 4 의
측정도 `chain_progress` 또는 `auto-chain.log.jsonl` 대조로 지정돼 있다. producer 를 공유 corpus 로
옮기면 새 KIND + `A1_AXIS_KINDS` 확장 + 마이그레이션이 따라붙는다 — M1 이 치른 비용이고, PRD
Open Question 2 자신이 *"전자는 producer를 바꾸고 후자는 reader를 바꾼다. 배포 위험이 다르다"*
라고 그 차이를 적어 두었다. 게다가 STATE.md 는 git-tracked(§3.2)라 `.git/mccp/msw-events`(clone 을
넘지 못한다)보다 오히려 내구성이 높다 — Open Question 3 이 걱정한 축이다.

*읽기*: 그러나 쓰기만 바꾸지 않고 끝내면 UI4(집계 경계=저장소 전체)와 정면으로 어긋나고, M1 이
A1 에서 없앤 "derive 를 돌린 디렉토리가 값을 정한다"가 halt 축에서 그대로 재현된다. 그래서
`last-halt` reader 가 `git worktree list --porcelain` 을 순회해 각 worktree 의 STATE.md 를 읽고
**저장소 전체에서 가장 최근의 halt 1건**을 고른다. 순회 로직은 새로 만들지 않고
`worktrees.js` 의 검증된 형태(고정 argv · timeout · cap · `scrubAbsPaths`)를 그대로 쓴다.
경계는 `git worktree list` 가 보고하는 목록으로 한정한다(PRD Risk 표의 완화 그대로).

**DD2 — work_unit 은 best-effort 이고 null 이 될 수 있다.** `deriveDecisionId('mccp:work', …)`는
`mccp:work` 가 `PLAN_PATH_COMMANDS` 에도 `BRANCH_BASED_COMMANDS` 에도 없어 **항상 `'default'`**를
돌려준다(실측: PRD 경로를 인자로 줘도 `default`). 그 값을 work_unit 으로 봉인하면 A1 corpus 와
조인되지 않는 쓰레기 키가 생긴다. 해소 순서는 `--work-unit` 명시 → STATE.md `task_fingerprint`
→ `null` 이다. `task_fingerprint` 는 실측상 A1 이 쓰는 것과 같은 형태(`orchestrator-step-wiring-m1`)라
조인이 성립한다. 추정으로 채우지 않고 모르면 키를 비운다 — M2 가 답해야 하는 주된 질문은
work_unit 이 아니라 **step** 이다.

**`'unknown'` 은 값이 아니라 부재다** (L2 architect HIGH 흡수). 2순위가 그냥 "필드를 읽는다"이면
이 규칙은 실제로는 한 번도 발동하지 않는다 — `task_fingerprint` 는 `state-writer.js:120` 의
`emptyState` 가 리터럴 `'unknown'` 으로 채우고 `state-injector.js:23` 의 `REQUIRED_FRONTMATTER_KEYS`
에 들어 있어 **실제 STATE.md 에서 결코 부재하지 않는다.** 즉 fingerprint 가 아직 세팅되지 않은
세션에서 recorder 는 `work_unit='unknown'` 을 봉인하게 되고, 그것은 DD2 가 `'default'` 를 거부한
바로 그 쓰레기 키다. 그래서 2순위의 수용 조건은 **비어있지 않고 `'unknown'` 이 아닐 것**이며,
그 둘은 `null` 로 접힌다. Task 5(5) 의 test 도 "둘 다 없을 때"가 아니라 **`'unknown'` 이 실린
STATE.md** 를 fixture 로 써야 한다 — 그것이 실서비스에서 실제로 발생하는 유일한 경로다.

**DD3 — 지표 4 는 런타임 비율이 아니라 사이트 커버리지로 측정한다.** "멈춘 `/mccp:work` 중 어느
step인지 기록된 비율"의 분모에는 **독립 관측원이 없다** — halt 를 세는 유일한 기록이 곧 이 기록이라
런타임 비율은 정의상 100% 이거나 측정 불가다. 그래서 분모를 `work.md` 의 halt 종료 지점 전수로
잡고(정적 오라클이 열거한다) 분자를 recorder 를 동반한 지점 수로 잡는다. 이 값은 test 가 매 실행
강제하므로 회귀가 불가능하고 산문으로 남지 않는다. 런타임 축은 별도로 **halt 1회 유발**을
acceptance 에 둔다 — 커버리지가 100%여도 경로가 실제로 도는지는 그것만이 증명한다.

**DD4 — 산문 halt 2건은 감추지 않고 `enforcement: prose` 로 열거한다.** `work.md` 의 halt 중
Phase 0 dirty-tree STOP(`:34`)과 Phase 2.T Step 1 실패(`:166`)는 fenced bash 가 아니라 산문 지시다
(각각의 fence 는 `git status` 만 돌리고 판정과 정지는 산문에 있다). 정적 test 는 fence 만 볼 수
있으므로 이 둘은 기계적으로 강제되지 않는다. 표에서 빼면 커버리지가 거짓으로 100%가 되므로,
표에 남기되 강제 수단이 다르다는 것을 **표 자신이 말하게** 한다 — §3.17 evidence-debt 래칫과
같은 형태다(부채를 숨기지 않고 열거해서 갚게 만든다).

**DD5 — recorder 는 절대 분기의 마지막 문장이 아니다.** `|| true` 로 fail-open 하는 호출이 분기의
마지막이면 그 분기가 exit 0 을 물려받아 **halt 가 통과로 읽힌다**.
`plan-review-command-body.test.js` F1 이 pin 한 실측 결함이 정확히 이것이므로 가설이 아니다.
모든 halt 분기는 recorder 뒤에 명시 `exit` 로 끝나고, 정적 test 가 그것을 강제한다.

**DD6 — fail-open 은 `|| true` 가 아니라 CLI 계약으로 만든다.** `recordChainProgress` →
`applyLocked` 에는 **실제 throw 경로**가 있다(`state-writer.js:677-687`
`MCCP_JOURNAL_DEGRADED_UNRECORDED`, 그리고 `if (writeError) throw writeError`). 즉 fail-open 은
가정이 아니라 방어해야 하는 조건이다. `record-halt` 는 전체를 try/catch 로 감싸 **어떤 실패에도
exit 0**을 보장하고, 셸 쪽 `|| true` 는 belt-and-suspenders 로만 둔다. 동시에
`auto-chain.js:247` 의 `catch { /* state-writer optional; fall through */ }` 는 **완전히 침묵**하는데
이는 UI2 의 "조용히 삼키지 않는다"를 위반하므로 loud stderr 를 더한다.

**DD7 — 입력은 enum·정규식·길이로 좁힌다.** `record-halt` 의 값은 셸 문자열에서 와서 STATE.md
frontmatter 의 block scalar 안 JSON 으로 직렬화된다. `--step` 은 체인 step enum
(`detect`·`plan_prd`·`plan`·`implement`·`verify`·`commit`·`pr`), `--site` 는 `^[a-z0-9][a-z0-9.-]{0,39}$`,
`--reason` 은 `oneLineExcerpt`(CR/LF 접기 + 200자)로 좁힌다. 열거 밖 값은 **거부가 아니라 기록
생략 + loud stderr** 다 — 인자 실수가 halt 경로를 바꾸면 그것은 계측이 아니라 게이트다(UI2).
`--receipt-path` 는 이 축에서 쓰지 않으므로 노출하지 않는다(경로 인자를 안 만들면 경로 검증
문제도 안 생긴다).

**`--reason` 은 저장 전에 `mask.scrubAbsPaths` 를 통과한다** (L2 security MEDIUM 흡수). 이 값은
휘발성 stderr 가 아니라 **git-tracked STATE.md**(§3.2) 안 `chain_progress` 에 영구히 실린다. 그런데
배선 대상 halt 메시지들이 이미 절대경로를 보간한다 — 예를 들어 fleet 예약 halt 는 `$GITDIR`
(= `git rev-parse --git-path mccp/tmp`, worktree 안 절대경로)를 문장에 넣는다. 그대로 실으면
§3.12 가 `meta.cwd` 때문에 sanctioned 재봉인 도구까지 만들어야 했던 것과 같은 계열의
durable-artifact 절대경로 유출이다. 순서는 `scrubAbsPaths` → `oneLineExcerpt` 다(스크럽이 길이를
바꾸므로 절삭이 뒤여야 200자 계약이 성립한다).

**`--reason` 은 control character 와 ANSI escape 도 제거한다** (security S1 흡수). 위 두 함수는
각각 경로 토큰과 CR/LF·길이만 본다 — ESC·BEL·NUL 은 어느 쪽도 걸러내지 않는다. `JSON.stringify`
가 저장 시 `` 로 이스케이프하므로 **디스크의 STATE.md 는 깨지지 않지만**, 소비 지점의
`JSON.parse` 가 그것을 원문자로 되돌리고 배너는 Task 4 (3) 대로 **인용부호 없이** 출력한다.
즉 위험한 것은 저장이 아니라 **재생**이다. 그리고 DD1 이 읽기를 저장소 전체로 넓혔으므로 한
worktree 에 실린 오염된 한 줄이 다른 모든 worktree 의 진입마다 재생된다(보존 상한 없음 — DD10).

좁히기 순서는 **`scrubAbsPaths` → `stripAnsi` → C0/C1/DEL 제거 → `oneLineExcerpt`** 다.
`stripAnsi` 는 새로 만들지 않고 `plugins/mccp/scripts/lib/utils.js:543` 을 재사용한다(CSI·OSC·charset·bare-ESC 처리).
그것이 다루지 않는 잔여 C0(BEL·NUL 등)·C1·DEL 만 별도로 제거하되 **``·`
` 은 남긴다** —
`oneLineExcerpt` 가 그 둘을 공백으로 접어 단어 경계를 보존하므로, 여기서 먼저 지우면 `"a
b"` 가
`"ab"` 로 붙는다. 절삭(`oneLineExcerpt`)이 마지막인 이유는 위와 같다: 앞선 제거가 길이를 바꾸므로
200자 계약은 최종 문자열 기준이어야 한다.

**repo-root 봉쇄 가드** (L2 security HIGH 흡수). `findRepoRoot`(`work-orchestrator.js:252-261`)는
`.git` 조상이 없으면 **`cwd` 를 그대로 돌려준다**. 가드가 없으면 비-repo 디렉토리에서 부른
`record-halt` 가 거기에 `.claude/state/STATE.md` 를 **새로 만들고** 평범한 성공으로 exit 0 한다 —
계측이 남의 디렉토리를 오염시키고, 더 나쁘게는 그 exit 0 이 fail-open 의 증거로 오독된다.
그래서 mirror 대상인 `msw-metrics/cli.js:308-314`(주석이 "security review S5"로 같은 처방을 적어
두었다)와 똑같이 **해소된 root 에 `.claude` 또는 `.git` 마커가 있을 때만 기록**하고, 없으면
아무것도 쓰지 않고 loud stderr + exit 0 으로 끝낸다(거부도 fail-open 방향이다).

**DD8 — canonical 호출 표면은 `work-orchestrator.js` 하나다.** `record-step` 은 `auto-chain.js`
와 `work-orchestrator.js` 양쪽에 거의 동일하게 노출돼 있는데, `work.md` 는 이미 `classify`(`:90`)와
`next-step`(`:204`)을 `work-orchestrator.js` 로만 부른다. `record-halt` 도 거기 둔다 — 명령 본문이
두 CLI 표면을 섞기 시작하면 어느 쪽이 계약인지가 흐려진다. `auto-chain.js` 의 `record-step` 은
무변경으로 남긴다(공용 producer 로 계속 쓰인다).

**DD9 — 새 환경 토글을 만들지 않는다.** recorder 는 실패 시 이미 무해하므로 kill switch 가 답할
질문이 없고, 토글 하나는 registry + `env-contract/lint.js` L1~L10 + `ENVIRONMENT.md` + 상세
문서를 함께 부른다. 끄고 싶은 상태와 recorder 가 아무것도 못 쓰는 상태는 결과가 같다 — 배너가
사라지고 체인은 그대로 돈다.

**DD10 — `chain_progress` 에 보존 상한을 두지 않는다.** halt 는 체인을 멈추고 다음 `/mccp:work`
는 `fix-task.md` 가 남아 있으면 시작을 거부하므로 브랜치당 halt 는 수십 건 규모다.
`state-journal/record.js:87` 의 `MAX_LINE_BYTES`(256KiB)는 그보다 훨씬 위이고 초과는 **조용한
절단이 아니라 시끄러운 강등**이다. 상한을 새로 넣으면 M5 가 세운 무손실 계약
(`plugins/mccp/scripts/lib/tests/state-journal-integrity.test.js:150`)의 경계를 건드리므로 넣지 않고 Risks 에 성장 축으로 남긴다.

**DD11 — UI5 경계는 산문이 아니라 pin 으로 지킨다.** halt 사이트 하나(`3.wp.no-return`)가 UI5 가
지목한 fleet 회수 분기와 **같은 if 블록 안**에 있다. 즉 "건드리지 말자"는 다짐만으로는 부족하다.
정적 test 가 prep-parallel 의 `rm -f` 대상 파일명 목록과 그 분기의
`[ ! -d "$GITDIR/dispatch-fleet-results" ]` 검사를 **리터럴로 pin** 해, 배선 편집이 그 두 지점을
우발적으로 바꾸면 red 가 된다. 이것이 UI5 를 기계적으로 만드는 유일한 방법이다.

**pin 의 앵커는 리터럴이지 줄 번호가 아니다** (L2 LOW 2건 흡수). 초판은 이 경계를 `:224`/`:715`
로 서술했는데 실측은 `:223`(`rm -f` 줄)과 `:713`(디렉토리 검사)이고 `:715` 는 주석 줄이었다.
게다가 recorder 를 삽입하면 그 아래 줄 번호가 전부 밀리므로, 번호로 pin 하면 **이 milestone 자신의
변경에 스스로 깨진다.** 그래서 좌표가 아니라 문자열을 pin 한다 — 서술도 번호를 빼고 다시 썼다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/state/state-writer.js` | UPDATE | `recordChainProgress` 가 present-only 3필드(`halt_site`·`reason`·`work_unit`)를 보존 |
| `plugins/mccp/scripts/lib/auto-chain.js` | UPDATE | `recordStep` 이 새 필드를 통과시키고, 침묵 catch 에 loud stderr 를 더한다 (DD6) |
| `plugins/mccp/scripts/lib/work-orchestrator.js` | UPDATE | `record-halt`(producer) + `last-halt`(repo-wide reader) 서브커맨드, 둘 다 항상 exit 0 |
| `plugins/mccp/commands/work.md` | UPDATE | halt 사이트 표 + **11개** fenced halt 배선 + 산문 2건 지시 + 진입 배너 한 줄 |
| `plugins/mccp/scripts/derive/sources/worktrees.js` | UPDATE | 스캔 timeout 과 worktree cap 을 export — reader 가 리터럴 복제 대신 import 하도록 (L2 architect MEDIUM) |
| `plugins/mccp/scripts/lib/tests/work-halt-record.test.js` | CREATE | producer/reader 단위 test — fail-open(throw 포함) · present-only · enum/정규식 · work_unit 해소 순서 · repo-wide 순회 |
| `plugins/mccp/scripts/lib/tests/work-command-body.test.js` | CREATE | `work.md` 배선의 정적 강제 + UI5 pin |
| `plugins/mccp/scripts/state/tests/state-writer.test.js` | UPDATE | present-only 필드의 존재/부재 양쪽 단언 |
| `plugins/mccp/scripts/lib/tests/work-orchestrator.test.js` | UPDATE | 신규 서브커맨드가 기존 `classify`/`next-step` 계약을 깨지 않음 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump (§3.7 — PRD 종료 milestone) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 (4면) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 (4면) |
| `CHANGELOG.md` | UPDATE | 새 항목 + `currently` 노트 (4면) |
| `.claude/prds/orchestrator-step-wiring.prd.md` | UPDATE | M2 행 `pending` → `in-progress` + Plan 셀 |

## Tasks

### Task 1: `recordChainProgress` 가 halt 맥락을 보존한다
- **Action**: `state-writer.js:719-741` 의 `log.steps.push({...})` 에 present-only 3필드를 더한다 —
  `halt_site` · `reason` · `work_unit`. **값이 있을 때만 키를 넣는다**(부재 = 모름). 기존 4필드
  (`step`/`status`/`receipt_path`/`ts`)의 직렬화는 한 글자도 바꾸지 않는다.
- **Mirror**: §3.2 `dep_check_at` present-only 관례 · 기존 `entry.receipt_path || entry.receiptPath || null` 형태
- **Validate**: `MCCP_CODEX_DISABLED=1 node --test plugins/mccp/scripts/state/tests/state-writer.test.js`

### Task 2: `recordStep` 의 침묵 catch 를 시끄럽게 만든다
- **Action**: `auto-chain.js:242-247` 의 `catch { /* state-writer optional; fall through */ }` 에
  loud stderr 한 줄을 더한다(무엇이 실패해 fallback 으로 내려갔는지). 새 필드 3종을 fallback
  JSONL 경로에도 동일하게 실어 두 경로의 레코드 모양을 맞춘다. **동작(fall-through)은 무변경** —
  침묵만 없앤다. UI2 가 요구하는 것은 정지가 아니라 표면화다.
- **Mirror**: `state-writer.js:686-690` 의 degraded 경고 형식
- **Validate**: Task 5 의 단위 test 가 두 경로를 각각 단언

### Task 3: `record-halt` producer — 관측이지 게이트가 아니다
- **Action**: `work-orchestrator.js` 에 `record-halt --step <s> --site <id> [--reason <t>] [--work-unit <slug>]`.
  순서는 **(1) repo-root 봉쇄 가드 → (2) 입력 좁히기 → (3) work_unit 해소 → (4) 기록**이다.
  (1) 해소된 root 에 `.claude`/`.git` 마커가 없으면 아무것도 쓰지 않고 거부한다(DD7 — 없으면
  남의 디렉토리에 STATE.md 를 새로 만들고 평범한 성공으로 끝난다). (2) DD7 의 enum/정규식/길이,
  `reason` 은 `mask.scrubAbsPaths` → `utils.stripAnsi` → C0/C1/DEL 제거 → `oneLineExcerpt` 순
  (security S1 흡수 — ``·`
` 은 마지막 단계가 접도록 남긴다). (3) DD2 순서이며 `'unknown'` 은 부재로
  접는다. (4) `autoChain.recordStep(repoRoot, {step, status:'halted', halt_site, reason, work_unit})`.
  **전체를 try/catch 로 감싸 어떤 실패에도 `return 0`** — `applyLocked` 의 실제 throw 경로(DD6)가
  여기서 멈춘다. 사유는 stderr 한 줄(절대경로 미노출). 인자 누락·열거 밖 값도 exit 0 + stderr.
- **Mirror**: `msw-metrics/cli.js:266-310`(마커 가드 + 어떤 실패에도 exit 0) · `fix-task.js#oneLineExcerpt`
- **Validate**: `MCCP_CODEX_DISABLED=1 node --test plugins/mccp/scripts/lib/tests/work-halt-record.test.js`

### Task 4: `last-halt` reader — 저장소 전체에서 가장 최근 halt 1건
- **Action**: `work-orchestrator.js last-halt [--json]`.
  1. `execFileSync('git', ['worktree','list','--porcelain'], {cwd: repoRoot, timeout: 3000, stdio:['ignore','pipe','ignore']})`
     → `worktrees.js#parseWorktreePorcelain` 으로 목록화(고정 argv, 셸 보간 없음).
  2. 각 worktree 의 `.claude/state/STATE.md` 를 `parseStateMd` 로 읽어 `chain_progress` 의
     `status === 'halted'` 항목을 모으고, `ts` 기준 **전역 최신 1건**을 고른다.
  3. **출력 포맷은 여기가 canonical 이다**(Task 9 는 이 절을 가리키기만 한다 — 두 곳에 적으면
     드리프트한다). 정확히 한 줄, 필드 순서 고정:

     ```
     직전 halt: step=<enum> site=<slug> (<ISO-8601>) reason=<text>[ · worktree=<basename>]
     ```

     - `step` 은 DD7 enum(`detect`·`plan_prd`·`plan`·`implement`·`verify`·`commit`·`pr`) 중 하나.
     - `site` 는 Task 6 표의 slug 그대로(원문 유지 — 사람이 표와 대조한다).
     - `reason` 은 `oneLineExcerpt` 산출물이라 CR/LF 가 없고 공백·`=`·구두점은 보존된다.
       **인용부호를 두르지 않는다.** 그 결정은 **`reason` 에 control character 가 남아있지 않음을
       전제로 한다**(security S1 흡수) — 전제를 세우는 것은 DD7 의 좁히기이고, 이 줄은 그것을
       소비할 뿐이다. reader 는 자신이 읽은 레코드에 대해 그 전제를 다시 강제한다: 구버전
       recorder 가 쓴 기존 레코드에는 그 좁히기가 적용된 적이 없으므로, 출력 직전 같은
       `stripAnsi` + C0/C1/DEL 제거를 한 번 더 통과시킨다(쓰기 시점 좁히기만으로는 **이미
       디스크에 있는** 레코드를 되돌릴 수 없다). 배너에서는 **80자**로 한 번 더 줄인다(저장된 레코드는
       200자 그대로 — 화면 상한과 기록 상한은 다른 축이다).
     - `· worktree=<basename>` 는 **halt 가 일어난 worktree 가 현재 worktree 와 다를 때만**
       붙인다. 같은 곳이면 붙이지 않는다(같다는 정보는 답의 일부가 아니다).
  4. 항목 부재 · `chain_progress` 부재 · JSON 파손 · STATE.md 부재 · git 실패 · 타임아웃은
     전부 **빈 stdout + exit 0**, 사유는 stderr 1줄(`scrubAbsPaths` 통과).
  5. **절삭은 침묵할 수 없다** (L2 architect MEDIUM 흡수). worktree 목록이 cap 을 넘어 잘리면
     `scanWorktrees` 처럼 "행이 몇 개 빠졌다"로 끝나지 않는다 — 전역 **최댓값**을 고르는 질의라
     절삭은 빈 출력이 아니라 **다른 worktree 의 더 오래된 halt 를 정답인 양** 내놓는다. 그래서
     절삭이 발생하면 halt 줄을 내지 않고 `halt 배너 생략: worktree 목록 절삭(n/총)` 을 낸다.
     "저장소 전체에서 가장 최근"(UI4)을 보장할 수 없으면 그렇게 말한다.
  6. **해소된 halt 를 영원히 주장하지 않는다** (L2 invariant MEDIUM 흡수). `chain_progress` 는
     append-only 이고 해소 상태를 쓰는 경로가 없으므로, 단순히 "마지막 halted 항목"을 고르면
     한 번 막힌 뒤로는 **모든 진입에 무기한 같은 줄**이 뜬다 — Task 9 가 전제한 "평소 미표시"가
     최초 halt 이후로 거짓이 된다. 그래서 후보는 그 worktree `chain_progress` 의 **마지막 항목이
     halted 일 때만** 이다. 뒤에 어떤 step 이든 기록됐다면 그 halt 는 지나간 것으로 본다.
     타임스탬프를 배너에 싣는 이유도 같다 — 신선도를 사람이 판정할 수 있어야 한다.

  **상한과 timeout 은 `worktrees.js` 에서 import 한다 — 리터럴 복제 금지.** 초판은 "그 값을 그대로
  쓴다(새 상수 도입 금지)"라고만 적었는데 그것은 **실행 불가능한 지시**였다(L2 architect MEDIUM):
  `SCAN_TIMEOUT_MS`(3000)와 cap 관련 값은 모듈 지역이고 `module.exports` 에 없다. 그래서 구현은
  리터럴 복제(=금지한 새 상수, drift 시작점)밖에 할 수 없었다. 해소는 `worktrees.js` 가 그 둘을
  **export 하도록 한 줄 넓히는 것**이고, 그래서 그 파일이 Files to Change 에 들어간다. 재사용을
  주장하려면 재사용 가능해야 한다.
- **Mirror**: `plugins/mccp/scripts/derive/sources/worktrees.js:27,313-347,163-195` · `msw-metrics/cli.js` 의 출력·실패 형태
- **Validate**: 같은 test 파일 — 2개 worktree fixture 에서 전역 최신이 선택되는지 단언

### Task 5: producer/reader 단위 test (CREATE)
- **Action**: `work-halt-record.test.js`.
  (1) present-only — 3필드 미지정 시 **키가 없다**, 지정 시 값이 실린다.
  (2) fail-open — `recordChainProgress` 가 throw 하도록 stub 했을 때 exit 0 + stderr 비어있지 않음.
  (3) fallback 경로 — state-writer 를 못 찾을 때 JSONL 에 같은 모양이 쌓이고 stderr 가 시끄럽다.
  (4) DD7 — 열거 밖 `--step`, 정규식 밖 `--site`, 200자 초과 `--reason`, CR/LF 포함 `--reason`.
  (5) DD2 — `--work-unit` 명시 / `task_fingerprint` fallback / **`task_fingerprint:'unknown'` 이
      실린 STATE.md 에서 키가 부재**. 세 번째가 핵심이다: `'unknown'` 은 `emptyState` 기본값이자
      필수 frontmatter 키라 **실서비스에서 발생하는 유일한 경로**이고, "둘 다 없을 때"만 보는
      test 는 그것을 구조적으로 못 본다(L2 architect HIGH).
  (6) reader — 항목 없음 · 파손 JSON · STATE.md 부재 · 2-worktree 전역 최신 선택 · 전부 exit 0.
  (7) **봉쇄 가드** — `.claude`/`.git` 마커가 없는 디렉토리에서 부르면 **아무 파일도 만들지 않고**
      exit 0 + 비어있지 않은 stderr. 부작용 부재를 파일시스템으로 단언한다(L2 security HIGH).
  (8) **scrub** — 절대경로가 든 `--reason` 이 `chain_progress` 에 들어갈 때 스크럽된다.
      순서 회귀도 본다: 스크럽 후 절삭이므로 200자 계약이 스크럽 결과 기준으로 성립한다.
  (9) **supersession** — halted 뒤에 다른 step 이 기록되면 `last-halt` 는 그 halt 를 내지 않는다.
      해소 개념이 없는 append-only 원장에서 배너가 과거 halt 를 무기한 주장하지 않게 하는 축이다.
  (10) **절삭** — worktree 수가 cap 을 넘으면 halt 줄 대신 생략 사유를 낸다(빈 답이 아니라
      "보장 불가"라고 말한다).
  (11) **control character** (security S1 흡수) — ESC·OSC·BEL·NUL 이 든 `--reason` 이
       (a) `chain_progress` 에 저장될 때 raw control byte 를 갖지 않고, (b) `last-halt` 출력에도
       나타나지 않는다. 그리고 (c) **좁히기를 거치지 않은 레코드를 직접 심은** STATE.md 에서도
       `last-halt` 출력이 깨끗하다 — (c) 가 없으면 reader 측 강제를 검증하는 것이 없고, 구버전
       레코드가 그대로 재생되는 경로가 열린 채로 남는다.
- **Mirror**: `plugins/mccp/scripts/lib/tests/session-activity.test.js` 의 fixture repo 구성 방식
- **Validate**: 위 명령

### Task 6: `work.md` — halt 사이트 표를 본문에 상주시킨다
- **Action**: Phase 2.F 앞에 halt 사이트 표를 둔다. 아래는 `command-body/blocks` 오라클로 실측
  열거한 전수이며, 구현 시 재실행해 대조한다.

  | site | step | 위치 | enforcement |
  |---|---|---|---|
  | `0.dirty-tree` | `detect` | Phase 0 working tree check | **prose** |
  | `2t.commit` | `commit` | Phase 2.T Step 1 실패 | **prose** |
  | `3.preflight` | `implement` | `next-step` HALT | shell |
  | `3.route.fleet` | `implement` | fleet 예약 미commit | shell |
  | `3.route.single` | `implement` | 단일 worker 예약 미commit | shell |
  | `3.gate.no-return` | `implement` | Workflow 결과 회수 실패 | shell |
  | `3.gate.args` | `implement` | reconcile args 재생성 실패 | shell |
  | `3.gate.verdict` | `implement` | reconcile verdict != ok | shell |
  | `3.wp.no-return` | `implement` | fleet 결과 회수 실패 | shell |
  | `3.wp.collect` | `implement` | worktree collect 실패 | shell |
  | `3.wp.verdict` | `implement` | fleet verdict != ok | shell |
  | `3.merge` | `implement` | merge-apply 실패 | shell |
  | `3.verify` | `verify` | merged-verify block | shell |

- **Mirror**: `plan.md` 5.2a 의 enforcement 표(강제 수단을 표가 말한다)
- **Validate**: Task 8 의 정적 test 가 표 ↔ 배선을 양방향 대조

### Task 7: `work.md` — 13개 halt 지점 배선 (shell 11 + prose 2)
- **분모 정정** (L2 invariant HIGH · architect/security/test 중복 지적 흡수): 초판은 같은 숫자를
  네 곳에서 `10`·`12`로 적었는데 Task 6 표의 `enforcement: shell` 행은 **11개**이고 실측
  `plugins/mccp/commands/work.md` 의 비영점 `exit` 도 **11건**(`:210`·`:495`·`:553`·`:631`·`:643`·
  `:659`·`:716`·`:724`·`:743`·`:756`·`:825`)이다. `10/10` 을 문자 그대로 만족시키면 사이트 1건이
  미배선인 채 지표 4 가 100% 로 읽힌다 — 커버리지 게이트의 분모가 자기 plan 안에서 두 값을
  가지면 그 게이트는 아무것도 강제하지 않는다. 이 절·Files to Change·Validation 8·Acceptance 를
  **11** 로 통일했다.
- **Action**: shell 11건은 각 종료 **앞에** 한 줄:

  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/work-orchestrator.js" record-halt \
    --step <step> --site <site> --reason "<한 줄>" 1>/dev/null || true
  ```

  stdout 만 버리고 **stderr 는 보존**한다(UI2 · F3 mirror). 모든 분기는 recorder 뒤에 명시 `exit`
  로 끝난다(DD5). `|| { echo …; exit 13; }` 인라인 형태(`:643`·`:724`·`:756`)는 그 중괄호 **안**에
  recorder 를 넣는다. prose 2건은 산문 지시에 같은 호출을 명시한다.
- **UI5 경계**: `3.wp.no-return` 은 UI5 가 지목한 fleet 회수 분기와 같은 if 블록 안에 있다.
  추가하는 것은 `exit 13` 앞 한 줄뿐이고, `[ ! -d "$GITDIR/dispatch-fleet-results" ]` 검사와
  prep-parallel 의 `rm -f` 목록은 **한 글자도 건드리지 않는다**. Task 8(f) 가 이를 리터럴로 pin 한다.
- **Mirror**: `plan.md` 5.2 의 `record --halt-stage` 배치(분기 안에서 기록하고 분기가 exit 한다)
- **Validate**: Task 8 정적 test

### Task 8: 정적 wiring test (CREATE)
- **Action**: `work-command-body.test.js` — 8개 단언. fence 추출은 `command-body/blocks` 오라클을
  쓴다(로컬 복제 금지 — 들여쓴 fence 와 `sh`/`shell` 태그를 놓친다).
  (a) 모든 bash 블록에서 **비영점 `exit`** 은 같은 블록 안 앞선 `record-halt` 를 갖는다.
  (b) 어떤 `record-halt` 호출도 stderr 를 버리지 않는다(`2>/dev/null` · `2>&1` 금지).
  (c) 어떤 `record-halt` 도 실패 분기의 마지막 문장이 아니다 — 뒤에 명시 `exit` 가 온다.
  (d) 사이트 표의 `enforcement: shell` 행 집합 == 실제 배선된 `--site` 집합(**양방향**).
  (e) `--site` 값은 유일하고 `--step` 값은 DD7 enum 안에 있다.
  (f) **UI5 pin** — prep-parallel 의 `rm -f` 대상 파일명 4종(`dispatch-fleet-args.json` ·
      `dispatch-partitions.json` · `dispatch-fleet-prepare.json` · `dispatch-cap-denied.json`)과
      fleet 회수 분기의 `[ ! -d "$GITDIR/dispatch-fleet-results" ]` 검사를 **리터럴로** 단언한다.
      배선 편집이 그 두 지점을 바꾸면 red. **줄 번호로 pin 하지 않는다** — recorder 삽입이 그
      아래 줄을 전부 밀어내므로 번호 기반 단언은 자기 변경에 스스로 깨진다(L2 LOW 2건이 지적한
      대로 초판의 `:224`/`:715` 는 실제로도 `:223`/`:713` 이었고, `:715` 는 주석 줄이었다).
  (g) **배너 pin** (L2 test HIGH 흡수) — `last-halt` 호출이 bash 블록 안에 **정확히 1건** 존재하고,
      A1 배너 블록 **뒤에** 오며, A1 과 같은 fold 형태(`spawnSync` + `timeout`)를 쓴다. 이것이
      없으면 지표 5 는 이 plan 안에서 반증 불가다 — Task 9 의 Validate 는 사람 눈 확인이라
      배너가 이후 편집으로 사라져도 red 가 되는 것이 아무것도 없었다. plan 자신이 "산문 지시가
      아니라 정적 test 가 강제하는 배선"이라고 선언한 이상, 그 선언은 배너에도 적용돼야 한다.
      (실측 확인: 현재 `plugins/mccp/scripts/` 어디에도 M1 이 넣은 A1 배너를 pin 하는 test 가
      없다 — 선례도 미보호이므로 이 단언이 그 축의 첫 보호다.)
  (h) **커버리지 분모 pin** — 사이트 표의 `enforcement: shell` 행 수 == 실측 비영점 `exit` 수.
      두 값이 갈리면 red. 초판이 같은 숫자를 네 곳에서 다르게 적은 사고를 기계가 잡는다.
- **Mirror**: `plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js:58-189`
- **Validate**: `MCCP_CODEX_DISABLED=1 node --test plugins/mccp/scripts/lib/tests/work-command-body.test.js`

### Task 9: `work.md` Phase 0 — 배너 한 줄
- **Action**: A1 배너 블록(`plugins/mccp/commands/work.md:117-137`) **바로 뒤**에 `last-halt` 한 줄을 같은 fold 규칙으로
  붙인다(`spawnSync` · `timeout:3000`). A1 과 halt 를 같은 화면에서 읽는 것이 PRD 지표 4 가
  지정한 소비 행동이다. **출력 포맷은 Task 4 (3) 이 소유한다** — 여기 다시 적지 않는다.
- **부재와 실패를 구분한다**(A1 선례의 정확한 재적용):
  - **halt 없음**(정상 · 대부분의 실행) → 줄을 아예 내지 않는다. 조용한 것이 맞다.
  - **읽기 실패**(타임아웃 · 비영점 · git 실패 · 파손) → `halt 배너 생략: <사유>` 한 줄을 남긴다.
    `plugins/mccp/commands/work.md:110-116` 이 A1 에 대해 세운 근거("조용히 사라지지는 않는다")가 여기에도 그대로
    적용된다 — 지표가 왜 없어졌는지 전달되지 않으면 계측 부채가 조용히 쌓인다.
  - 이 구분이 없으면 두 오류 중 하나를 반드시 저지른다: halt 가 없을 뿐인데 매 실행 경고를
    내거나(노이즈), 읽기가 깨졌는데 아무 말도 안 하거나(침묵). Assessment A 는 후자를 권했고
    그 근거로 A1 선례를 들었는데, A1 선례는 정확히 반대를 말한다(`plugins/mccp/commands/work.md:110-116`).
- **위계 이탈을 명시한다**(anchor 1): 이 줄은 primary action 이 아니라 **진단 보조**이고 한 줄에
  최대 5개 필드가 실린다. 앵커 1(정보 위계 3단계)을 문자 그대로 만족하지 않으며, 그 사실을
  숨기지 않고 여기 적는다. 완화 장치는 셋이다 — 필드 순서가 위계를 따르고(step·site = 무엇이
  막았나 → 시각 = 지금 것인가 → reason·worktree = 세부), `reason` 이 배너에서 80자로 잘리고,
  halt 는 저빈도 사건이라 이 줄이 평소에는 아예 없다. 라이브 dogfood 에서 halt 가 잦아 이 줄이
  상시 표시되면 (step, site) 로 줄이고 나머지는 `/mccp:trace` 로 미루는 것이 다음 수다.
- **Mirror**: `plugins/mccp/commands/work.md:117-137` verbatim 구조
- **Validate**: 그 블록을 그대로(verbatim) 실행해 출력 확인 — halt 있음 · halt 없음 · 읽기 실패
  세 경우를 각각 한 번씩 본다

### Task 10: halt 1회 유발 (경로 작동 증명)
- **Action**: 실제 halt 를 1회 유발해 (1) `chain_progress` 에 `status:'halted'` 항목이 생기고
  (2) 배너가 그 줄을 낸다는 것을 확인한다. 가장 싸게 유발되는 지점은 `3.preflight` 다 —
  `next-step` 이 halt 를 내도록 만들면 되고 외부 부작용이 없다.
- **주의**: hook 과 명령 본문은 worktree 가 아니라 `~/.claude/plugins/cache/mccp/mccp/<version>/`
  에서 로드된다(§3.7). 캐시가 이 버전을 갖기 전에는 **새 `work.md` 블록을 verbatim 실행**하는
  것까지가 이 사이클에서 가능한 최강 증거이며, 그것을 "라이브 완주"로 주장하지 않는다 —
  M1 이 같은 경계에서 지표 5 를 **부분**으로 남긴 선례를 그대로 따른다.
- **Validate**: `chain_progress` 항목 + 배너 출력 캡처

### Task 11: version · CHANGELOG · PRD 표 · 4면 동기
- **Action**: `plugin.json` bump(§3.7 — 이 PRD 의 **마지막** milestone 이므로 minor 축, 현재
  `1.34.4` 기준 잠정 `1.35.0`). **번호를 미리 확정하지 않는다** — base 머지 시점과 `/mccp:pr` 진입
  직전 두 번 재계산한다(§3.7 forward-only. 이 브랜치에서 M1 이 이미 3회 재상향을 실측했다).
  4면 동기: `plugin.json` · `renderer/html.js` page-foot · `renderer/markdown.js` derived 줄 ·
  `CHANGELOG.md`(`currently` 노트 + 항목 본문). PRD 의 M2 행을 `in-progress` + Plan 셀로 갱신.
- **Validate**: `MCCP_CODEX_DISABLED=1 node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

## Validation

```bash
# 1. 변경 모듈 단위 test
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/lib/tests/work-halt-record.test.js \
  plugins/mccp/scripts/lib/tests/work-command-body.test.js \
  plugins/mccp/scripts/lib/tests/work-orchestrator.test.js \
  plugins/mccp/scripts/state/tests/state-writer.test.js

# 2. 인접 회귀 — state journal 이 성장하는 chain_progress 를 여전히 무손실로 통과시킨다
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/lib/tests/state-journal-integrity.test.js \
  plugins/mccp/scripts/lib/tests/state-journal-projection.test.js \
  plugins/mccp/scripts/derive/tests/worktrees-source.test.js

# 3. 명령 본문 공용 lint (S1~S3) — 새 줄이 기존 seam 규칙을 어기지 않는지
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/lib/tests/command-body-lint.test.js \
  plugins/mccp/scripts/lib/tests/command-body-rules.test.js \
  plugins/mccp/scripts/lib/tests/command-body-blocks.test.js

# 4. 4면 version drift
MCCP_CODEX_DISABLED=1 node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 5. env 계약 — 신규 토글 0건이므로 무변경이어야 한다 (DD9)
node plugins/mccp/scripts/lib/env-contract/lint.js

# 6. producer/reader 왕복 — **격리된 fixture repo 에서**, 그리고 출력을 단언한다.
#
# L2 invariant MEDIUM 흡수: 초판은 개발 저장소의 git-tracked STATE.md 에 합성 halt
# ("validation smoke")를 쓰고 정리하지 않았다. chain_progress 는 해소 개념이 없으므로
# 그 한 줄이 이후 모든 배너의 "직전 halt" 로 고착되고 커밋까지 된다 — 지표 4 의 관측
# corpus 를 스모크가 오염시킨다. 그래서 임시 repo 를 만들어 거기서만 왕복한다.
#
# L2 test MEDIUM 흡수: 초판은 두 CLI 를 부르기만 했는데, 둘 다 계약상 "어떤 실패에도
# exit 0 + 빈 stdout" 이라 프로듀서·리더가 완전히 망가져도 통과했다. 이제 출력 문자열을
# 단언하므로 실제로 실패할 수 있다.
node -e '
  const fs=require("fs"), os=require("os"), path=require("path");
  const {execFileSync,spawnSync}=require("child_process");
  const cli=path.resolve("plugins/mccp/scripts/lib/work-orchestrator.js");
  const repo=fs.mkdtempSync(path.join(os.tmpdir(),"mccp-halt-"));
  execFileSync("git",["init","-q",repo]);
  fs.mkdirSync(path.join(repo,".claude","state"),{recursive:true});
  spawnSync(process.execPath,[cli,"record-halt","--step","implement","--site","3.preflight",
    "--reason","roundtrip fixture"],{cwd:repo,encoding:"utf8"});
  const r=spawnSync(process.execPath,[cli,"last-halt"],{cwd:repo,encoding:"utf8"});
  const out=(r.stdout||"").trim();
  if(r.status!==0) throw new Error("last-halt exit="+r.status);
  if(!/step=implement/.test(out)||!/site=3\.preflight/.test(out))
    throw new Error("roundtrip lost the record: "+JSON.stringify(out));
  console.log("roundtrip ok:",out);
'

# 7. fail-open 실증 — **기록이 진짜로 불가능한 상태**에서 exit 0 이고 stderr 가 시끄럽다.
#
# L2 security HIGH 흡수: 초판은 cwd=os.tmpdir() 로 불렀는데, findRepoRoot 는 .git 조상이
# 없으면 cwd 를 그대로 돌려주므로 그 호출은 실패하지 않았다 — tmpdir 에 STATE.md 를
# 새로 만들고 **평범한 성공으로** exit 0 했다. 즉 fail-open 을 증명한 적이 없다.
# 이제 두 가지를 각각 본다: (a) repo-root 마커가 없으면 아무것도 쓰지 않고 거부하는가,
# (b) 진짜 쓰기 실패(경로가 파일로 점유됨)에서도 exit 0 + 비어있지 않은 stderr 인가.
node -e '
  const fs=require("fs"), os=require("os"), path=require("path");
  const {execFileSync,spawnSync}=require("child_process");
  const cli=path.resolve("plugins/mccp/scripts/lib/work-orchestrator.js");
  const run=(cwd)=>spawnSync(process.execPath,
    [cli,"record-halt","--step","implement","--site","3.preflight"],{cwd,encoding:"utf8"});

  // (a) 마커 없는 디렉토리 — 거부하고 아무것도 만들지 않는다.
  const bare=fs.mkdtempSync(path.join(os.tmpdir(),"mccp-bare-"));
  const a=run(bare);
  if(a.status!==0) throw new Error("(a) must fail-open, got exit "+a.status);
  if(!(a.stderr||"").trim()) throw new Error("(a) refused silently — UI2 requires loud stderr");
  if(fs.existsSync(path.join(bare,".claude")))
    throw new Error("(a) created .claude/ outside a repo — containment guard missing");

  // (b) 진짜 쓰기 실패 — .claude/state 자리를 파일이 점유해 mkdir 이 EEXIST/ENOTDIR.
  const repo=fs.mkdtempSync(path.join(os.tmpdir(),"mccp-ro-"));
  execFileSync("git",["init","-q",repo]);
  fs.mkdirSync(path.join(repo,".claude"),{recursive:true});
  fs.writeFileSync(path.join(repo,".claude","state"),"not a directory");
  const b=run(repo);
  if(b.status!==0) throw new Error("(b) must fail-open, got exit "+b.status);
  if(!(b.stderr||"").trim()) throw new Error("(b) swallowed the failure — UI2 violated");
  console.log("fail-open ok — (a) refused+silent-free, (b) exit 0 with loud stderr");
'

# 8. halt 사이트 커버리지 (지표 4 · DD3) — 출력이 아니라 **판정**이다. shell 11/11.
#
# L2 test MEDIUM + LOW 흡수: 초판은 개수를 console.log 로 찍기만 하고 기대값과 비교하지도
# 비영점 종료하지도 않아, "커버리지 실측"이라는 이름표가 붙은 채 어떤 불일치도 통과했다.
node -e '
  const fs=require("fs");
  const blocks=require("./plugins/mccp/scripts/lib/command-body/blocks");
  const src=fs.readFileSync("plugins/mccp/commands/work.md","utf8");
  let exits=0, recs=0;
  blocks.bashBlocks(src).forEach(b=>b.lines.forEach(l=>{
    if(/\bexit\s+[1-9]/.test(l)) exits++;
    if(/record-halt/.test(l)) recs++;
  }));
  // 사이트 표의 enforcement:shell 행 수와도 대조한다(Task 8(h) 와 같은 등식).
  const plan=fs.readFileSync(".claude/plans/orchestrator-step-wiring-m2.plan.md","utf8");
  // 표 행은 Task 6 의 bullet 안이라 2칸 들여쓰기돼 있고, site slug 에는 `-` 가 들어간다
  // (`3.wp.no-return`). 둘 중 하나라도 빠뜨리면 rows=0 이 되어 이 검사가 조용히 무력해진다 —
  // 실제로 초안 정규식이 그랬고, 아래 값은 실측(shell 11 · prose 2)으로 확인했다.
  const rows=(plan.match(/^ *\| `[0-9a-z.-]+` \| `[a-z_]+` \|[^|]*\| shell \|$/gm)||[]).length;
  if(rows===0) throw new Error("site-table matcher matched nothing — the check itself is broken");
  console.log("nonzero exits="+exits+" record-halt="+recs+" shell rows="+rows);
  if(exits!==recs) throw new Error("coverage gap: "+recs+"/"+exits+" halt sites wired");
  if(rows!==exits) throw new Error("table/wiring denominator drift: table="+rows+" exits="+exits);
'

# 9. 삭제 검증 (§3.5.1) — 머지가 다른 PR 의 신규 파일을 지우지 않았는지
git diff --diff-filter=D --name-only origin/main...HEAD
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `chain_progress` 는 이 저장소에서 **한 번도 실행된 적 없는 경로**다(STATE.md 에 키 부재, 코드베이스에 소비자 0건). 잠재 결함이 M2 에서 처음 드러난다 | **높음** | Task 5 가 lock 재진입·journal 투영·present-only·fallback 을 실제 fixture repo 에 대해 돌리고, Task 10 이 halt 1회를 유발한다 |
| `applyLocked` 의 실제 throw 경로가 recorder 를 통해 `/mccp:work` 를 멈춘다 (UI2 위반) | **높음** | DD6 — CLI 가 전체를 try/catch 하고 항상 exit 0. Validation 7 이 그것을 실증한다. `\|\| true` 는 이중 방어일 뿐 1차 방어가 아니다 |
| recorder 가 `\|\| true` 로 끝나 halt 분기가 exit 0 을 물려받아 **halt 가 통과로 읽힌다** | 중 | DD5 + Task 8(c). `plan-review-command-body.test.js` F1 이 pin 한 실측 결함이라 가설이 아니다 |
| UI5 가 격리한 `:224`/`:715` 를 배선 편집이 우발적으로 넘는다 — `3.wp.no-return` 이 같은 if 블록 안이라 실재하는 위험이다 | 중 | DD11 + Task 8(f) 리터럴 pin. 다짐이 아니라 red 로 막는다 |
| 산문 halt 2건이 기계 강제 밖이라 커버리지가 실제보다 높게 읽힌다 | 중 | DD4 — 표에 `enforcement: prose` 로 열거하고 지표 4 분모에 포함한다. 숨기지 않는다 |
| worktree 순회 reader 가 다른 저장소·중첩 worktree를 잘못 포함한다 | 낮음 | 경계를 `git worktree list --porcelain` 목록으로만 한정(PRD Risk 표의 완화 그대로) + `worktrees.js` 의 timeout·cap 을 그대로 재사용 |
| `chain_progress` 가 git-tracked frontmatter 라 halt 마다 STATE.md 가 바뀌어 commit 노이즈·worktree 간 충돌이 는다 | 중 | halt 는 체인을 멈추고 `fix-task.md` 가 다음 실행을 막으므로 빈도가 낮다(DD10). 성장은 `MAX_LINE_BYTES` 에서 조용한 절단이 아니라 시끄러운 강등으로 끝난다 |
| work_unit 이 `null` 인 기록이 많아 A1 과의 조인이 실제로는 안 된다 | 중 | DD2 의 2순위(STATE.md `task_fingerprint`)가 실측상 A1 과 같은 형태다. 그래도 비면 **비운다** — 추정 키가 corpus 를 오염시키는 것이 더 나쁘다 |
| `work.md` 를 건드려 C10(같은 파일 소유)과 충돌 | **낮음** | 착수 전 확인 완료: C10 은 우산 그룹 2 이고 의존이 `C2 · C5` 다(우산 `:143`) — 이 자식이 끝나야 착수된다. `.claude/prds/` 에 C10 PRD 파일이 **아직 없음**을 실측했다 |
| 병렬 브랜치가 같은 version 번호를 선점 | 중 | §3.7 forward-only. 번호를 미리 확정하지 않고 base 머지 시점과 `/mccp:pr` 직전 두 번 재계산(Task 11) |
| plugin cache 가 구버전이라 라이브 `/mccp:work` 에서 새 본문이 열리지 않는다 | **높음** | 구조적 제약이다(§3.7). Task 10 이 verbatim 실행까지를 증거로 삼고 "라이브 완주"를 주장하지 않는다 — M1 선례 그대로 |

## Deferred (보고만 하고 고치지 않는다)

접지 중 실측한 인접 결함 3건. 전부 M2 의 가설과 무관하고 **동작 변경**이라 backlog 로 이연한다.

- `plugins/mccp/commands/work.md:205` 의 `--decision "$DECISION_SLUG"` 는 **항상 빈 값**이다. `DECISION_SLUG` 는 `:787`
  에서야 정의되는데 그 사이에 fence 경계가 여럿 있고 shell state 는 fence 를 넘지 못한다(본문
  `:213` 이 스스로 그 계약을 적어 두었다). 고치면 `next-step` 이 처음으로 실제 slug 를 받아
  receipt 검증 결과가 달라진다.
- `plugins/mccp/commands/work.md:45` 의 `WORK_SLUG` 는 `deriveDecisionId` 가 `mccp:work` 를 두 분류 어디에도 넣지 않아
  **항상 `'default'`** 다. 그 결과 `:52` 의 점유 경고 필터(`c.slug === slug`)가 실질적으로
  매칭되지 않는다. 고치면 경고가 새로 발화하기 시작한다.
- 공유 corpus 로의 halt kind 승격(DD1 이 이연한 축) — 새 KIND + `A1_AXIS_KINDS` 확장 +
  마이그레이션이 따라붙고, UI7 이 corpus 의 내구성 결정을 이 PRD 밖으로 뺐다.

## Acceptance

- [ ] Task 1~11 전부 완료
- [ ] Validation 1~9 전부 통과
- [ ] 패턴을 재발명하지 않고 mirror — fence 추출은 `command-body/blocks`, 한 줄 정규화는 `fix-task.js#oneLineExcerpt`, worktree 순회는 `worktrees.js` 의 argv·timeout·cap·scrub 형태
- [ ] **지표 4 (커버리지 · DD3)**: 사이트 표의 `shell` 행 **11/11** 이 배선되고, 정적 test 가 표 ↔ 배선 양방향 일치(Task 8(d))와 표 ↔ 실측 exit 수 등식(Task 8(h))을 함께 강제한다. `prose` 2건은 표에 열거되어 분모에 남는다(총 13)
- [ ] **지표 5 (소비 지점)**: `/mccp:work` 진입에 halt 줄이 A1 줄과 함께 표시되고, **Task 8(g) 가 그 배너를 pin 한다** — 사람 눈 확인만으로는 이 항목을 주장하지 않는다
- [ ] **UI2 (fail-open)**: Validation 7 의 두 갈래가 각각 실증한다 — (a) repo 마커 부재 시 **아무것도 쓰지 않고** 거부 + loud stderr, (b) 진짜 쓰기 실패에서 exit 0 + 비어있지 않은 stderr. 더해 정적 test 가 recorder 가 분기의 마지막 문장이 아님을 강제한다
- [ ] **보안 S1 (control character)**: `--reason` 의 좁히기가 ESC/OSC/BEL/NUL 을 제거하고, **쓰기와
      읽기 양쪽**에서 강제된다(Task 5 (11) 의 (a)(b)(c) 세 단언). 좁히기를 거치지 않은 기존
      레코드도 배너에서 깨끗하게 나온다
- [ ] **UI4 (집계 경계)**: `last-halt` 가 서로 다른 두 worktree 의 halt 중 전역 최신을 고르는 것이 단위 test 로 단언되고, **cap 절삭 시에는 답 대신 생략 사유를 낸다**(Task 4 (5))
- [ ] **UI5 (경계 불가침)**: Task 8(f) pin 이 green 이고, `git diff` 상 prep-parallel `rm -f` 목록과 `dispatch-fleet-results` 검사 문자열이 무변경이다(줄 번호가 아니라 리터럴로 확인한다)
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 — **halt 를 1회 유발해** `chain_progress` 항목과 배너 출력을 캡처한다. 캐시 버전 경계 때문에 라이브 `/mccp:work` 가 불가하면 그 사실과 verbatim 실행 증거를 보고서에 **부분**으로 남기고 충족으로 주장하지 않는다

## Gate Record — 이 plan 은 receipt 없이 진행한다

<!-- 실행 주체가 반드시 읽을 것. 이 절이 없으면 다음 게이트가 "receipt 가 왜 없지?"를
     사고로 오인한다. -->

**L2 리뷰 패널: `divergent` (quorum 3/4 미충족 — 4개 관점 전원 `fail`).** 전체 기록은
`.claude/reviews/plan-review-orchestrator-step-wiring-m2.md` (git-tracked, halt_stage `5.2e`,
findings 원문 + Measurement 블록 포함). 리뷰된 plan 해시는
`sha256:61fe03997fe8beade6c171a863bf3aec8f78d6d32e60449c6fff7b889c34c15b` 이다.

**findings 16건(HIGH 4 · MEDIUM 7 · LOW 5)을 전부 흡수했다 — 이연 0건.** 흡수 위치는 각 절에
`(L2 <관점> <severity> 흡수)`로 표시했다. HIGH 4건 요약:

| 관점 | 지적 | 흡수 위치 |
|---|---|---|
| architect | `task_fingerprint` 는 `'unknown'` sentinel 로 **항상 존재**하므로 DD2 의 "모르면 비운다"가 발동하지 않는다 | DD2 후단 · Task 5(5) |
| security | repo-root 봉쇄 가드 부재 — 비-repo cwd 에서 STATE.md 를 새로 만들고 exit 0. Validation 7 이 fail-open 을 증명한 적이 없다 | DD7 후단 · Task 3 · Validation 7 재작성 |
| test | 지표 5(배너)를 red 로 만들 test 가 0건 — plan 자신의 "정적 test 가 강제" 명제가 배너에만 미적용 | Task 8(g) |
| invariant | 커버리지 분모가 plan 안에서 11 대 10 으로 갈려 "10/10 = 100%" 가 미배선 1건을 안고 green 이 된다 | Task 7 분모 정정 · Task 8(h) · Validation 8 · Acceptance |

**receipt 를 쓰지 않는 이유는 절차 회피가 아니라 구조다.** `write.js:610` 의 DD13 bind 는
`review_proof.reviewed_plan_hash` 를 **디스크에서 다시 계산한 해시**와 대조한다. 위 흡수가
plan 본문을 바꿨으므로 그 대조는 반드시 실패한다 — 즉 *"findings 를 고치는 것"* 과
*"이 리뷰에 묶인 receipt 를 봉인하는 것"* 은 이번 실행에서 양립 불가능하다. 그리고
`(mccp-plan-codex, orchestrator-step-wiring-m2)` 의 라운드 캡 1 이 이미 소진돼(§3.16, 이 저장소
기본값) 고친 본문으로 패널을 다시 돌리는 경로도 없다. 캡 상향은 §3.16 이 열거한 우회 목록에
없으므로 택하지 않았다.

**그래서 사용자 판단으로 "plan 을 고치고 receipt 는 포기"를 택했다**(2026-09-03). 대가와 보상은
이렇다 — 잃는 것은 plan→implement receipt chain 링크 하나이고(이 저장소는
`MCCP_RECEIPT_GATE_MODE=soft` 라 누락 receipt 는 통과한다), 남는 것은 git-tracked 리뷰 기록과
**결함이 제거된 plan** 이다. ship 시 PR-Codex 는 cross-gate dedupe 가 열리지 않으므로 정상
발화한다 — dual-review 가 우회되지 않는다.

**다음 단계가 할 일**: `/mccp:prp-implement .claude/plans/orchestrator-step-wiring-m2.plan.md` 는
`mccp-plan-codex` receipt 부재를 informational allow-path 로 통과할 것이다. 그것이 정상이며,
PR 본문에 이 절을 근거로 인용할 것.

## Multi-Perspective Fan-out

<!-- Auto-injected by /mccp:plan Phase 2.5 fan-out (read-only). -->
<!-- 편집 1건 고지: L1 C6(citation 해소)이 축약 인용을 거부하므로, 이 절 안의
     `<file>:<line>` 인용 21건을 repo-root full 경로로 **기계 치환**했다(축약 basename
     앞에 `plugins/mccp/commands/` 같은 소유 디렉토리를 덧붙였다). 치환은 CITATION_RE 매치
     지점의 파일명 부분에만 적용됐고 문장·판정·severity 는 에이전트 산출 그대로다. -->

<!-- 아래 지적들은 이 fan-out 라운드가 **plan 초안 이전**에 관측한 것이다. HIGH 4건
     (집계 경계 재분열 · fail-open throw 경로 · UI5 인접 편집 · producer 무-test)은
     위 Design Decisions 와 Tasks 에 흡수됐고, 나머지는 그 절들이 답하거나 명시적으로
     이연했다. 원문을 지우지 않는 이유는 무엇이 제기됐고 어떻게 처리됐는지가 함께
     남아야 하기 때문이다. -->

**Coverage**: 4/4 perspectives (architect, security, test, explorer) · spent ~59k.

### Findings (severity-ranked)

- **[HIGH][architect]** M2(halt-step-recording)의 유일하게 실재하는 producer(`recordStep`)는 STATE.md `chain_progress`(worktree-local, per-worktree file) 또는 fallback `.claude/state/auto-chain.log.jsonl`에 쓴다 — 둘 다 M1이 A1을 위해 이미 폐기한 '집계 경계 = derive를 돌린 디렉토리' 패턴 그대로다. M1 Task 3가 msw-events를 git common dir(SHARED_SUBPATH)로 옮겨 이 문제를 정확히 해결했는데, M2가 같은 이관 없이 record-step을 그냥 배선하면 halt 기록도 A1과 동일한 3값 분열을 재현한다. — plugins/mccp/scripts/lib/auto-chain.js:240-254 (recordStep — stateWriter.recordChainProgress 또는 auto-chain.log.jsonl fallback); plugins/mccp/scripts/migrations/msw-events-common-dir.js:4-20 (M1이 이미 이 패턴을 '집계 경계를 저장소 전체로 올린다'는 이름으로 해결); PRD 결정 2 — '집계 경계는 저장소 전체다'
- **[HIGH][security]** PRD Decision 3 mandates fail-open + loud-stderr for recording failures, but the same recordChainProgress->applyLocked call chain the plan wires into work.md has a genuine throw path (MCCP_JOURNAL_DEGRADED_UNRECORDED). If work.md invokes record-step synchronously without try/catch or exit-code tolerance, this becomes a hard stop violating the fail-open acceptance criterion. — PRD Scope 결정 3 (fail-open mandate); plugins/mccp/scripts/state/state-writer.js:677-687 throw path inside applyLocked
- **[HIGH][security]** PRD explicitly scopes the plugins/mccp/commands/work.md:224 vs :715 filename-mismatch fix out-of-scope because fixing it activates a dormant 'merge-apply escape' path. This is a live, named execution-path risk sitting adjacent to the exact file the plan will edit for record-step wiring; the plan must not touch those lines even incidentally. — PRD Scope 결정 4 및 Out of scope: 'plugins/mccp/commands/work.md:224/:715 파일명 불일치 — 결정 4. 같은 실패 모드지만 동작 변경이다.'
- **[HIGH][test]** recordStep (auto-chain.js:240-254), the core producer M2 will wire into work.md, has zero existing test coverage — no test file references recordStep or the record-step CLI subcommand at all. — Grep for 'recordStep|record-step' across plugins/mccp/scripts/lib/tests returned no files; auto-chain.test.js (read in full header) only covers shouldAbort triggers, not recordStep/runCli record-step path.
- **[HIGH][test]** recordStep has two divergent write paths (state-writer.recordChainProgress success path vs. JSONL sidecar fallback via bare try/catch swallow) that are both untested; a plan task 'wire record-step into work.md' must specify which path is asserted and cover both, otherwise a silent fallback regression (e.g. state-writer API renamed) would pass CI unnoticed. — auto-chain.js:242-247 — 'try { ... } catch { /* state-writer optional; fall through */ }' then falls to JSONL append at :249-253
- **[HIGH][test]** PRD Decision 3 mandates fail-open + loud-stderr-on-failure for the halt-recording path ('실패는 조용히 삼키지 않고 loud stderr로 표면화한다'), but the current catch block at auto-chain.js:247 is fully silent (bare comment, no stderr write) — the M2 plan must add and test a loud-failure path, since the existing pattern it claims to mirror does not actually satisfy the new PRD requirement. — PRD line 68: '기록 실패는 체인을 멈추지 않는다 (fail-open)... 실패는 조용히 삼키지 않고 loud stderr로 표면화한다' vs auto-chain.js:247 catch block has no stderr emission
- **[HIGH][explorer]** record-step is already wired end-to-end (CLI subcommand → auto-chain.recordStep → state-writer.recordChainProgress → STATE.md chain_progress render/parse). M2 does not need to build this producer; it needs to (a) call it from work.md's HALT branches and (b) build the reader that surfaces chain_progress to A1/halt-phase reporting. — plugins/mccp/scripts/lib/work-orchestrator.js:318-333 (record-step CLI delegates to autoChain.recordStep) + plugins/mccp/scripts/lib/auto-chain.js:240-254 (recordStep writes via state-writer.recordChainProgress or fallback auto-chain.log.jsonl) + plugins/mccp/scripts/state/state-writer.js:718-742 (recordChainProgress: append-only steps[] into STATE.md frontmatter chain_progress, already lock-safe via withStateLock)
- **[HIGH][explorer]** chain_progress currently has zero consumers in the codebase outside state-writer.js itself and its tests — no derive source, no renderer section, no msw-metrics reads it. A draft plan proposing a new storage schema for halt-step recording would be reinventing an already-shaped, already-persisted structure. — Grep for 'chain_progress' across plugins/mccp returns only: scripts/state/tests/state-writer.test.js, scripts/state/state-writer.js, scripts/lib/tests/state-journal-integrity.test.js, scripts/lib/tests/state-journal-projection.test.js, scripts/lib/state-journal/record.js, scripts/lib/auto-chain.js — no derive/, no renderer/, no msw-metrics/ hits.
- **[MEDIUM][architect]** work.md는 이미 700행이 넘는 단일 파일로 최소 8곳의 독립적인 exit 13 halt 지점(preflight, gate, reconcile, collect, merge, verify 등)을 갖는데, 각각 ad-hoc echo 메시지만 있고 halt-step을 기록하는 공통 헬퍼/스키마가 없다. M2가 이 5+ 지점 각각에 record-step 호출을 개별 삽입하면 셸 스크립트 중복이 선형으로 늘고, 각 지점의 step 이름·status enum이 표류할 구조적 위험이 있다. — plugins/mccp/commands/work.md:210,631,659,716,743,825 (독립 exit 13 halt 지점들, 공통 record 헬퍼 없음)
- **[MEDIUM][architect]** PRD 자신의 Risk 표가 M2 착수 전 'C10이 같은 work.md를 소유하는 접점'을 명시적으로 경고했다 — work.md는 orchestrator-step-wiring(C2)뿐 아니라 harness-wiring-integrity 우산의 C10도 건드리는 공유 파일이다. M2 plan은 C10의 현재 상태(pending인지 in-progress인지)를 착수 전에 확인하지 않으면 같은 파일에 대한 머지 충돌/구조적 재작업 위험이 있다. — PRD Risks 표: 'M2의 record-step 배선이 work.md를 건드려 C10(같은 파일 소유)과 충돌 | 중 | 낮음 | ... M2 착수 시 C10 상태를 먼저 확인한다'
- **[MEDIUM][architect]** PRD Out-of-scope가 명시한 plugins/mccp/commands/work.md:224/:715 파일명 불일치는 '미실행이던 merge-apply escape를 실행시킨다'는 배포 위험 등급 차이로 격리했는데, M2가 halt-step 기록을 위해 같은 파일 근처(merge/collect/reconcile halt 블록)를 편집하면 그 경계를 실수로 넘을 구조적 위험이 있다 — plan은 편집 대상 라인을 그 두 지점과 명시적으로 분리해야 한다. — PRD 결정 4: 'plugins/mccp/commands/work.md:224 ↔ :715의 파일명 불일치는 C2 밖이다 ... 그 수정은 미실행이던 merge-apply escape를 실행시킨다'
- **[MEDIUM][architect]** 지표 4(halt 지점 기록률)의 소비처(누가 어떻게 chain_progress/auto-chain.log.jsonl을 읽어 '어느 phase가 막았는지'를 보여줄지)가 PRD에 정의되어 있지 않다 — A1처럼 msw-metrics/cli.js a1 같은 전용 reader + /mccp:work 배너 노출이 필요한데, M1의 소비 회로(Task 7 A1 배너)를 halt-step에도 그대로 mirror할지, 아니면 별도 표면(fix-task.md만)으로 충분한지가 plan 단계 결정으로 남아 있다. — PRD Success Metrics #4 '어떻게 측정: chain_progress 또는 auto-chain.log.jsonl 대조' — 소비 지점(#5와 달리) 명시 없음; Open Questions #4 '값이 읽히는 화면이 어디여야 하는가'
- **[MEDIUM][security]** record-step's entry payload (step/status/receipt-path, and any future halt-reason field) flows unsanitized from CLI flags into STATE.md frontmatter via recordChainProgress -> applyLocked -> YAML serialization. No field allowlist/validator is visible before merge into frontmatter parsed by many downstream tools. — plugins/mccp/scripts/lib/auto-chain.js:240-254 recordStep passes entry straight through; plugins/mccp/scripts/state/state-writer.js:719 recordChainProgress -> applyLocked
- **[MEDIUM][security]** PRD Open Question 2 (shared write location vs reader-side worktree enumeration) is unresolved and has real security asymmetry: writing to a shared location introduces a new multi-writer contention/race surface, while reader-side enumeration only adds read-only fan-out. The plan should not silently pick the write-side option without addressing concurrent-writer races, mirroring the dedup-by-event_id pattern already used for M1 cross-location events. — PRD line 91 (Open Question 2); plugins/mccp/scripts/derive/sources/session-activity.js:169-195 (dedup logic for cross-location events)
- **[MEDIUM][security]** PRD Risk table explicitly flags M2's record-step wiring touching work.md as a potential collision surface with sibling PRD C10 (same file ownership) — a change-coordination/trust-boundary concern the plan must verify before editing rather than after. — PRD Risks table: 'M2의 record-step 배선이 work.md를 건드려 C10(같은 파일 소유)과 충돌한다 | 중 | 낮음 | ... M2 착수 시 C10 상태를 먼저 확인한다'
- **[MEDIUM][test]** No draft plan exists yet (input explicitly states 'draft plan not yet written'), so no task-level Validate steps can be assessed for this fan-out round. All findings below are pre-emptive gaps the eventual M2 plan must close, derived from PRD scope + current codebase test conventions. — Prompt input: 'Draft plan: (draft plan not yet written)'
- **[MEDIUM][test]** Success Metric #4 ('halt 지점 기록률') and Metric #5 ('소비 지점 노출 — /mccp:work 라이브 1회') are both defined as manual/live-observation checks, not automated assertions — the plan needs an explicit non-automatable validation step (live dogfood run) distinct from unit tests, or these acceptance criteria will be silently skipped in a CI-only validation loop. — PRD lines 51-52: '어떻게 측정: chain_progress 또는 auto-chain.log.jsonl 대조' / '/mccp:work 라이브 1회'
- **[MEDIUM][test]** The PRD's Out-of-scope explicitly excludes fixing the plugins/mccp/commands/work.md:224 vs :715 filename mismatch, but does not clarify whether M2's new record-step wiring must touch both locations or just one — untested ambiguity risks the plan wiring only one of the two divergent halt/entry points, leaving the other silently uninstrumented. — PRD line 69 & Decision 4 (lines 69, 105): '`plugins/mccp/commands/work.md:224` ↔ `:715`의 파일명 불일치는 C2 밖이다'
- **[MEDIUM][test]** work.md currently has zero record-step invocations and only two orchestrator CLI calls (classify at :90, next-step at :165); the plan must specify exactly which of the 5 sequential steps (line 178) get record-step calls on halt, and a regression test analogous to existing grep-based command-body assertions (see impeccable-guard.test.js pattern in CLAUDE.md §3.17) should scan work.md for record-step call count to prevent silent removal in future edits. — plugins/mccp/commands/work.md:178 ('Five sequential steps... halt if halt:true'), grep of 'record-step|next-step|chain_progress' in work.md returned only next-step references at :201/:204/:883, no record-step
- **[MEDIUM][explorer]** work.md never calls record-step at any of its HALT/STOP exit points (Phase 2.F pre-flight exit 13, Step 3.route's [MCCP-GATE-STOP] exit 1 paths). This is the exact gap the PRD's Evidence section names ('work.md에 record-step이 0회'), and it's the wiring the plan must add — but the HALT sites already carry the step name and reasons[] needed to record it. — plugins/mccp/commands/work.md:201-212 (NS/$HALT check writes fix-task.md and exit 13 but never calls work-orchestrator.js record-step) and plugins/mccp/commands/work.md:491-496,548-554 ([MCCP-GATE-STOP] exit 1 blocks) — none invoke record-step. work-orchestrator.js:180-229 nextStep() already returns {step, halt, reasons} with the exact step name and structured reasons needed as record-step's --step/--status payload.
- **[MEDIUM][explorer]** CLAUDE.md Risks table flags that M2's record-step wiring touching work.md may collide with C10 (also owns work.md) — the plan should check C10 status before landing edits to work.md, per the PRD's own mitigation note. — PRD Risks table row: 'M2의 record-step 배선이 work.md를 건드려 C10(같은 파일 소유)과 충돌한다 | 중 | 낮음 | ... M2 착수 시 C10 상태를 먼저 확인한다'
- **[LOW][architect]** recordStep과 next-step(halt 판정)의 소비 경계가 명시되지 않았다 — auto-chain.js와 work-orchestrator.js 양쪽이 거의 동일한 record-step CLI 서브커맨드(parseFlags·usage text 중복)를 노출하는데, work.md는 이미 work-orchestrator.js를 통해 next-step/classify를 부르고 있어 M2가 어느 CLI 표면(auto-chain.js 직접 vs work-orchestrator.js 경유)을 canonical 호출 경로로 삼을지가 plan에 명시돼야 한다. — plugins/mccp/scripts/lib/auto-chain.js:310-330 (record-step) vs plugins/mccp/scripts/lib/work-orchestrator.js:318-330 (record-step, autoChain.recordStep 위임); plugins/mccp/commands/work.md:90,204 (work-orchestrator.js만 부름)
- **[LOW][security]** Fallback path (state-writer.recordChainProgress unavailable) appends raw JSON via fs.appendFileSync to .claude/state/auto-chain.log.jsonl with no schema/size validation, an unbounded entry could bloat/corrupt this file that M2's halt-recording consumer will parse. — plugins/mccp/scripts/lib/auto-chain.js:248-253
- **[LOW][security]** Existing cross-worktree aggregation (scanWorktrees) establishes the safe pattern for repo-wide event collection: execFileSync with fixed argv (no shell interpolation), path scrubbing via mask.scrubAbsPaths before surfacing errors, hard cap and timeout. Any M2 cross-worktree halt-step aggregation should reuse this pattern rather than re-deriving worktree discovery. — plugins/mccp/scripts/derive/sources/worktrees.js:333-347 (execFileSync, cwd pinned, timeout, stdio locked); :401-403 mask.scrubAbsPaths applied to all surfaced errors
- **[LOW][test]** session-activity.js (A1 producer, already shipped in M1) has an existing test file (session-activity.test.js) that should be mirrored in style/fixture approach for any new M2 halt-metric derive logic, but the plan has not yet identified this as the pattern to follow. — plugins/mccp/scripts/lib/tests/session-activity.test.js exists and is the sibling producer test for the same derive/sources family M2 will extend
- **[LOW][explorer]** The A1 banner wiring pattern in work.md Phase 0 (spawnSync with timeout, fail-open collapse of any failure to a one-line stderr summary, loud-not-silent degradation) is the exact convention M2's halt-phase banner should mirror — it is a very recent (same-PRD, M1) precedent in the same file. — plugins/mccp/commands/work.md:117-137 (A1_LINE block using spawnSync + timeout:3000 + explicit 'A1 배너 생략: <reason>' fallback, called from msw-metrics/cli.js cmdA1 which itself fail-opens per exit 0 always with reason on stderr, cli.js:297-340)
- **[LOW][explorer]** auto-chain.log.jsonl fallback path exists as a secondary/legacy channel when state-writer is unavailable — a plan should not treat this as the primary read target since it's explicitly a fallback ('state-writer optional; fall through') and STATE.md chain_progress is the intended durable channel. — plugins/mccp/scripts/lib/auto-chain.js:240-253 — try/catch require of state-writer, on failure appends to .claude/state/auto-chain.log.jsonl instead

### Meta-gaps

- plan 부재 상태라 M2의 record-step 삽입 지점(정확히 어느 halt 5-8곳인지) 목록이 아직 확정되지 않았다 — plan 작성 시 work.md의 halt 인벤토리를 명시적으로 열거해야 중복/누락을 막는다.  _(architect)_
- halt-step 데이터의 저장 위치(STATE.md chain_progress vs 신규 shared corpus)를 M1의 msw-events-common-dir 패턴과 정합화할지에 대한 명시적 결정이 PRD에 없다 — Open Question들이 A1 축만 다루고 halt-step 축의 aggregation boundary는 다루지 않는다.  _(architect)_
- C10과의 work.md 소유권 경계(어느 라인/섹션이 C2 소유이고 어느 것이 C10 소유인지)가 문서화되어 있지 않다.  _(architect)_
- PRD does not specify who/what determines the halt 'step'/'reason' string surfaced in chain_progress -- if any part is derived from user-provided feature descriptions or LLM free-form output rather than a fixed enum of orchestrator step names, the plan needs an explicit allowlist/enum to prevent frontmatter/YAML injection or unbounded strings reaching STATE.md.  _(security)_
- No mention of validating or bounding the --receipt-path argument passed to record-step -- if later used in a path.join or file read without validation it becomes a path-traversal surface; plan should state whether receipt-path is trusted-internal-only.  _(security)_
- PRD Open Question 3 defers git-tracked promotion of the event corpus but does not address whether promoting halt-step records to git-tracked would leak internal file paths/error messages/session detail -- mask.scrubAbsPaths exists for worktree-scan errors but is not mentioned for chain_progress entries.  _(security)_
- No threat model for concurrent /mccp:work invocations racing to write halt-step data to the same STATE.md/chain_progress -- plan should confirm reuse of the existing withStateLock advisory-lock path and state its fail-soft/last-writer-wins implications per CLAUDE.md §3.6.  _(security)_
- PRD Open Question 2 (집계를 어떻게 성립시킬 것인가 — producer vs reader change) is unresolved and directly affects testability: a producer-side change (write to shared location) needs hook-path integration tests, a reader-side change (worktree traversal) needs derive-path tests with multiple fixture worktrees. The plan must pick one before task-level Validate steps can be written.  _(test)_
- No fixture/mock convention is specified anywhere in the PRD for simulating multiple worktrees or a halted /mccp:work chain — this is a nontrivial testability gap since 'halt at step N' requires simulating partial chain execution deterministically.  _(test)_
- The PRD's acceptance evidence for M1 already relied on live repo directory measurements ('전부 2026-09-01 저장소 직접 실측') rather than automated tests; the plan risks repeating this pattern for M2 (manual live-run 'exhibits' instead of deterministic node --test coverage) unless explicitly called out.  _(test)_
- No mention of what happens to record-step's write when repoRoot resolution fails (findRepoRoot) or when .claude/state is unwritable — untested failure mode adjacent to the fail-open mandate.  _(test)_
- No draft plan file exists yet at this stage — this PRD is scoped to M1 (already complete) vs M2 (halt-step-recording, still pending); the fan-out prompt inputs referenced a generic PRD but the actionable milestone is M2 specifically, which the plan must make explicit.  _(explorer)_
- PRD doesn't specify which reader consumes chain_progress once populated (dashboard? work.md banner? derive source?) — Open Question 4 in the PRD leaves this open, and a plan needs to name the concrete insertion point (e.g., a new derive/sources/chain-progress.js, or direct read in work.md banner) rather than leaving it implicit.  _(explorer)_
- PRD doesn't reconcile whether record-step should be called synchronously inline in the Bash HALT block (risking added latency at every halt) or asynchronously/best-effort — the plan should specify fail-open call semantics explicitly, mirroring decision 3 (fail-open) already committed in the PRD.  _(explorer)_

### Patterns to mirror

- msw-events-common-dir.js의 idempotent + marker + resumable + '원본 삭제 안 함(back-compat read)' 마이그레이션 패턴 — plugins/mccp/scripts/migrations/msw-events-common-dir.js:1-20  _(architect)_
- A1 배너의 fail-open 원칙(타임아웃/비영점/빈 stdout을 전부 '배너 없음'으로 접되 조용히 사라지지 않고 이유를 stderr 한 줄로 남김) — plugins/mccp/commands/work.md:99-136  _(architect)_
- 새 소비 지점을 milestone acceptance에 명시적으로 못박는 패턴(PRD 결정 문서에서 Risk#1 → Success Metric #5로 직결) — PRD Risks 표 1행 + Success Metrics #5  _(architect)_
- plugins/mccp/scripts/derive/sources/worktrees.js:333-347 -- execFileSync with fixed argv array (no shell string interpolation), pinned cwd, explicit timeout, stdio locked to ['ignore','pipe','ignore'] for any future cross-worktree git spawn.  _(security)_
- plugins/mccp/scripts/derive/sources/worktrees.js:401-403 and :344 -- mask.scrubAbsPaths applied to every error/path string before it can be surfaced in derive output or logs.  _(security)_
- plugins/mccp/scripts/state/state-writer.js:624-716 -- single critical-section writer (applyLocked under withStateLock) is the only STATE.md mutation path; any new halt-step writer must go through update()/recordChainProgress(), not a direct fs write, per CLAUDE.md §3.2 and the single-writer-lint invariant.  _(security)_
- plugins/mccp/scripts/hooks/receipt-prompt.js:201 (referenced in PRD line 68) -- fail-open catch pattern for instrumentation failures that must never block the gated chain, the precedent the plan's fail-open acceptance criterion should mirror verbatim.  _(security)_
- plugins/mccp/scripts/lib/tests/auto-chain.test.js:15-29 freshHome() pattern — isolates HOME/USERPROFILE via mkdtempSync + restore() for filesystem-touching tests; M2's recordStep tests should mirror this to avoid polluting the real .claude/state.  _(test)_
- session-activity.test.js — sibling derive-source test file structure to follow for any new halt-step derive logic.  _(test)_
- CLAUDE.md §3.17 impeccable-guard.test.js pattern — grep-based structural assertion pairing disk-state and command-body-literal presence; recommended for asserting work.md actually contains N record-step calls (prevents doc/behavior drift).  _(test)_
- CLAUDE.md §3.16 — 1-round review default; per project convention, do not expect/plan multi-round plan-review iteration for M2's Codex gate.  _(test)_
- plugins/mccp/commands/work.md:117-137 — spawnSync+timeout+fail-open-to-stderr-summary banner pattern (already used for A1); reuse this shape for a halt-step banner rather than inventing a new failure-collapse convention.  _(explorer)_
- auto-chain.js:240-254 recordStep() try/catch-with-fallback pattern for fail-open producer writes.  _(explorer)_
- state-writer.js:718-742 recordChainProgress() append-only steps[] under withStateLock — the concurrency-safe write path to reuse verbatim rather than writing chain_progress directly.  _(explorer)_
- work-orchestrator.js:180-229 nextStep()'s {step, halt, reasons[]} return shape already carries everything record-step needs as arguments — no new halt-classification logic required.  _(explorer)_


## Design Critique

<!-- v1.3.0-m2 critique retry loop. detector: skill_available=1 design_signal=1 reason=ok
     (signal_files 가 `renderer/html.js` · `renderer/markdown.js` 를 지목 — §3.7 4면 version
     동기 대상이라 실제 rendered surface 는 아니지만, detector 가 오라클이므로 우회하지 않고
     loop 을 돌렸다). cap=2, 총 2회 invoke. -->

**verdict `CONVERGED` (round 1/2, 2 invocations).** `decideCritique` 오라클 판정.

R0 는 impeccable `critique` 플레이북의 hard invariant 대로 Assessment A(design review)와
Assessment B(detector + mechanical evidence)를 **격리된 sub-agent 2개**로 병렬 실행했다.
R1 은 흡수분 검증 1회이며 **단일 assessment 이므로 degraded 다** — 그 사실을 여기 적는다:
`⚠️ DEGRADED: single-context (round-1 verification of absorbed edits only)`.

평가 대상 rendered surface 는 하나다 — `/mccp:work` 진입 배너의 halt 한 줄. 나머지 변경은
control-plane(Node CLI · test · markdown)이라 렌더링 표면이 없다. 브라우저 검사는 **타깃이
viewable 하지 않아** 생략했고(URL 없음 · 서버 없음), 그 사유를 감춘 것이 아니라 여기 적는다.

| 앵커 | R1 판정 | 근거 |
|---|---|---|
| 정보 위계 3단계 | **이탈 — 명시적으로 기록** | 배너 한 줄에 최대 5필드. Task 9 가 이탈을 선언하고 완화 3종(필드 순서가 위계를 따름 · `reason` 80자 절삭 · halt 저빈도라 평소 미표시)을 명시. plan 문서 자체의 heading depth 는 최대 3으로 충족(B 실측: `#`1 / `##`11+ / `###`14) |
| 강조색 화면당 1개 | n/a | 단색 터미널 출력. ANSI 강조 토큰 0개 |
| raw markdown marker 금지 | 통과 | 렌더 대상은 평문 한 줄. plan 문서의 `**` 264개 = 132쌍 전부 닫힘, code fence 짝 맞음(B 실측) |
| 한 화면 항목 수 상한 | n/a | 배너는 단일 레코드(가장 최근 halt 1건)이고 list-of-N 이 아니다. plan 문서는 rendered surface 가 아니라 downstream 파서 입력이다(PRD 의 같은 판단을 상속) |

detector(`detect.mjs`)는 plan 파일과 `work.md` 양쪽에 **exit 0(clean)** 이었다.

**R0 흡수 (CRITICAL 1 + HIGH 4, §3.14 임계)**

| # | severity | 지적 | 처리 |
|---|---|---|---|
| 1 | CRITICAL | Task 9 에 출력 포맷 명세가 없다(예시는 Summary 에만) | 흡수 — 포맷 계약을 **Task 4 (3)** 에 canonical 로 신설(필드 순서 · ISO-8601 · 배너 80자 절삭 · 비인용 · 조건부 `worktree=`). Task 9 은 가리키기만 한다. A 는 Task 9 에 적으라 했으나 포맷의 소유자는 CLI(Task 4)이고 두 곳에 적으면 드리프트한다 |
| 2 | HIGH | 앵커 1 위계 위반에 완화 서술이 없다 | 흡수 — Task 9 에 이탈 선언 + 완화 3종 + 라이브에서 halt 가 잦으면 (step, site) 로 줄인다는 다음 수 |
| 3 | HIGH | `worktree=` 접미 조건이 Task 9 에 없다 | 흡수 — Task 4 (3) 에 "halt worktree ≠ 현재 worktree 일 때만" |
| 4 | HIGH | fallback 동작 미명세 | **관측 수용 · 처방 기각.** 아래 참조 |
| 5 | HIGH | `step` enum 이 배너 명세에서 안 보인다 | 흡수 — Task 4 (3) 에 7종 열거 |

**#4 의 처방을 채택하지 않은 근거.** A 는 "실패해도 아무 줄도 내지 말라"고 했고 그 근거로 A1
선례를 들었는데, 그 선례는 정반대를 말한다 — `plugins/mccp/commands/work.md:110-116` 이
A1 배너에 대해 **"다만 조용히 사라지지는 않는다"** 를 세우고 실패 시 `A1 배너 생략: <사유>`
한 줄을 남기게 했다. 그대로 받으면 읽기가 깨져도 침묵하게 되어 이 milestone 이 닫으려는
계측 부채를 스스로 만든다. 그래서 흡수한 규칙은 **부재(halt 없음 → 무출력)와 실패(읽기 깨짐
→ 한 줄)를 가르는** 형태다. 기각 근거는 backlog 에 file:line 과 함께 남겼다(§3.14 의무).

**이연 (MEDIUM 2 · LOW 1 → `.claude/plans/codex-findings-backlog.md`)** — slug→설명 매핑,
두 줄 배너 근거의 Summary 명시, 그리고 위 #4 부분 기각 기록. `reason` 이스케이프(MEDIUM)는
#1 의 포맷 명세 안에 한 절로 함께 들어가므로 별도 이연하지 않고 흡수했다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 recommend-only 이며 **발화 0건**이다.
아래는 하류 게이트가 참조할 체크리스트일 뿐 이 게이트가 호출한 명령이 아니다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` |
| refine | `/impeccable typeset` |
| refine | `/impeccable animate` |
| refine | `/impeccable colorize` |
| refine | `/impeccable bolder` |
| refine | `/impeccable quieter` |
| refine | `/impeccable overdrive` |
| refine | `/impeccable delight` |
| simplify | `/impeccable adapt` |
| simplify | `/impeccable distill` |
| simplify | `/impeccable clarify` |
| evaluate | `/impeccable critique` |
| evaluate | `/impeccable audit` |
| harden | `/impeccable harden` |
| harden | `/impeccable optimize` |
| harden | `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` |
| system | `/impeccable extract` |

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->

## Codex Implementation Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (cap=1, mode=enforce, pinned-by=codex-disabled)
- 결과: `classification=disabled` · `blocking=false` · `durationMs=2` — spawn 직전 short-circuit.
- 합치 결론: **Codex skipped per `MCCP_CODEX_DISABLED=1`** (운영자 영구 정책, 1회성 escape 아님).
  이 축의 cross-model review 는 발화하지 않았고, receipt 는 `codex_verdict='skipped'` 로 그
  사실을 그대로 봉인한다. cross-gate dedupe 는 열리지 않으므로 `/mccp:pr` 에서 PR-Codex 가
  정상 발화한다 — dual-review 가 우회되지 않는다.

### Implement-time decisions (2.5.2, Codex 미발화 상태로 열거)

이 plan 이 미리 못박지 않아 구현 시점에 정해지는 결정 4건. Codex 가 꺼져 있어 반박을 받지
못했으므로 **열거 자체를 감사 흔적으로 남긴다**.

| # | 결정 | 채택 | 근거 |
|---|---|---|---|
| I1 | `worktrees.js` export 확대 범위 | `SCAN_TIMEOUT_MS` · `DEFAULT_CAP` 2개만 추가 | Task 4 가 필요로 하는 최소 표면. `parseCap` 은 env 해석까지 묶여 있어 reader 의 축이 아니다 |
| I2 | repo-root 마커 가드 위치 | `work-orchestrator.js` 안 지역 헬퍼 | mirror 대상 `msw-metrics/cli.js:308-314` 도 지역 구현이다. 공용화는 호출자 1건에 대한 조기 추상화 |
| I3 | `record-halt`/`last-halt` 인자 파싱 | `work-orchestrator.js` 의 기존 `parseArgs` 재사용 | 같은 파일의 `classify`/`next-step` 이 이미 그것을 쓴다. DD8(단일 표면)의 연장 |
| I4 | 배너 fold 코드 형태 | `work.md:117-137` A1 블록 verbatim 복제 후 서브커맨드만 교체 | Task 9 의 Mirror 지시 그대로. Task 8(g) 가 "A1 과 같은 fold 형태" 를 단언하므로 형태 이탈은 red |

- YAGNI Triage: n/a — Codex 미발화로 finding 0건.
- Deferred to backlog: 0
- Open Questions: 없음 (auto-CRITICAL 해당 없음)
- Codex session 참조: n/a (`classification=disabled`, spawn 없음)

### Security Reviewer

- 호출: `Task(security-reviewer, "review proposed implementation: input validation, path traversal / containment, durable-artifact leakage")`
- 결과: **HIGH 1건 · ACCEPT_NOW 흡수**. 지시한 다른 5개 표면(`--site` 컨텍스트 탈출 · YAML block scalar
  탈출 · worktree 순회 경로 조작 · always-exit-0 은폐 · symlink)은 근거와 함께 **결함 없음**으로
  기각됐다(리뷰어가 각각의 반증 근거를 코드 인용으로 남겼다).

| # | Severity | Verdict | 지적 |
|---|---|---|---|
| S1 | HIGH | ACCEPT_NOW | `--reason` 이 터미널 control character / ANSI escape 를 필터 없이 통과시켜 git-tracked STATE.md 에 영구 보존되고, 배너가 저장소 전체에서 매 진입마다 unescaped 로 재생한다 |

**S1 은 독립 반증으로 확인됐다**(액면 수용 아님). 실측:

```
oneLineExcerpt(scrubAbsPaths("verdict=\x1b]0;PWNED\x07\x1b[2J\x1b[1;31mFAKE OK\x1b[0m"))
  → raw ESC 잔존 = true
JSON.stringify(...)  → on-disk 안전 = true      (컨테이너는 깨지지 않는다)
JSON.parse(...)      → raw ESC 복원 = true      (소비 지점에서 원상 복구된다)
```

즉 **저장은 안전하고 재생이 위험한** 형태다. `oneLineExcerpt` 의 정규식은 `/[\r\n]+/g` 하나뿐이고
(`fix-task.js:52-58`), `scrubAbsPaths` 는 경로 토큰만 본다(`mask.js:87-91`). DD7 이 선언한 좁히기
파이프라인이 정확히 그 둘뿐이라 이 축은 plan 어디에서도 다뤄지지 않았다. L2 패널 HIGH 4건과 R0
critique 5건 어디에도 등장하지 않으며, Codex 는 `disabled` 로 발화하지 않았다 — **어느 리뷰 축도
이 gap 을 거르지 않았다.**

전파 범위가 넓은 이유는 DD1 이 읽기를 저장소 전체로 넓혔기 때문이다: 한 worktree 에 한 번 실린
오염된 `reason` 은 그 worktree 가 다음 step 을 기록하기 전까지(Task 5(9) supersession) **다른 모든
worktree** 의 `/mccp:work` 진입마다 재생된다. `chain_progress` 는 보존 상한이 없고(DD10) git-tracked 다.

**MCCP-GATE-STOP 을 내지 않는 이유**: 명령 본문 2.5.5 는 HIGH 보안 finding 에 STOP 을 지시하지만,
그 규칙이 막는 것은 *결함을 안은 채 Phase 3 로 넘어가는 것*이다. §3.14 는 HIGH 를 **그 자리에서
흡수**하라고 정하고 §3.16 은 라운드를 늘리지 말라고 정한다. S1 은 아래 4곳 흡수로 제안 구현에서
제거되므로, 남은 것은 STOP 이 보호할 결함이 아니다. 흡수 위치는 DD7 후단 · Task 3 (2) · Task 4 (3) ·
Task 5 (11) 이며, 각 절에 `(security S1 흡수)` 로 표시했다.
