# Plan: live-integrity-repair (orchestrator-step-wiring M4)

**Source PRD**: `.claude/prds/orchestrator-step-wiring.prd.md`
**Selected Milestone**: M4 — live-integrity-repair
**Complexity**: Small

## Summary

M1~M3는 머지됐다(PR #189 · #192). 그런데 이 PRD의 표제 가설 — *세 위치에서 derive를 돌리면
같은 A1이 나온다* — 이 **오늘 라이브에서 다시 깨져 있다.** 같은 코드(이 worktree의 소스)로
`--repo-root`만 바꿔 재면 main `3/15` · c2 `3/15` · c3 `3/14`다(2026-09-14 실측). 그리고 그
사실을 알려 주는 표면이 어디에도 없다 — 배너는 셋 다 `status=computed`다.

원인은 둘이고 서로 독립이다.

1. **설치 cache(`1.33.6`)가 M1 배선을 갖지 않아** hook이 A1 이벤트를 여전히 worktree-local에
   쓴다. 마이그레이션 dry-run이 아직 공유 위치로 오지 않은 A1 줄 **40건**을 보고한다. 근본
   해소는 릴리스 컷(C0 소관)이지만, **그 사이 값이 위치에 따라 갈린다는 사실이 읽히는 자리에서
   보이지 않는 것**은 이 PRD의 결함이다(Risks 첫 줄 "계측 부채"의 재발).
2. **테스트가 실 공유 corpus를 오염시킨다.** `receipt-prompt-submit.test.js`의 (d)가 hook을
   `cwd: process.cwd()` · `session_id: 's1'`로 띄워 `<git-common-dir>/mccp/msw-events/s1.jsonl`에
   가짜 `task_started`를 쓴다. 실측 6건(2026-09-11 ~ 2026-09-14), work_unit은 테스트를 돌린
   브랜치에서 파생된 슬러그다(`c3-ci-full-suite` · `ci-full-suite-m4`). 전수 스위트를 돌릴 때마다
   A1 분모에 유령 작업 단위가 붙는다.

나머지 두 건은 절대경로 누출이다 — `record-halt`가 `work_unit`을 좁히지 않고 git-tracked
`STATE.md`에 쓰고, `a1` CLI의 실패 경로가 "절대경로를 흘리지 않는다"는 주석 바로 아래에서
`err.message`를 그대로 낸다.

M4는 이 네 건만 고치고, backlog · fix-task의 이 PRD 축 잔여를 **근거와 함께 처분**한다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 이 PRD 관련 backlog · fix-task · 의도대로 동작하지 않는 기능을 수정하는 계획을 작성한다 | direction |
| UI2 | PRD에 마일스톤을 추가한다 | direction |
| UI3 | 이 PRD는 계측과 표시만 바꾸며 게이트 판정을 건드리지 않는다 (PRD Users · Not for) | constraint |
| UI4 | 계측 기록 실패는 체인을 멈추지 않으며 조용히 삼키지 않고 loud stderr로 표면화한다 (PRD 결정 3) | constraint |
| UI5 | 완주의 정의를 바꾸지 않는다 — PR 번호 생성 시점 그대로다 (PRD 결정 1) | exclusion |
| UI6 | 이벤트 corpus의 git-tracked 승격과 A1 목표치 설정은 다루지 않는다 (PRD Out of scope) | exclusion |

## Triage — backlog · fix-task · 라이브 관측

전 항목을 2026-09-14 현재 코드에 대조했다. **재현되지 않는 것은 고치지 않는다.**

### M4가 고치는 것

| # | 출처 | 결함 (재현 근거) | Task |
|---|---|---|---|
| F1 | **신규 (라이브 관측)** | 테스트가 실 공유 corpus에 가짜 착수를 쓴다 — `plugins/mccp/scripts/hooks/tests/receipt-prompt-submit.test.js:54-55`가 `cwd: process.cwd()` · `session_id: 's1'`로 hook을 띄우고, `plugins/mccp/scripts/hooks/receipt-prompt.js:233-238`이 `repoRoot: event.cwd`로 append한다. 공유 `s1.jsonl` 6줄 전부 `session_id=s1` · `producer=receipt-prompt` | 1 · 2 |
| F2 | backlog 2026-09-01 (M1 L2 R1 invariant, 지속 가드) · 2026-09-07 HIGH (설치 cache 배포 간극) | 위치 의존성이 재발해도 신호가 없다. 같은 코드로 세 위치 `3/15 · 3/15 · 3/14`, 셋 다 `status=computed`. 마이그레이션 dry-run `new_lines: 40` | 3 |
| F3 | backlog 2026-09-08 MEDIUM (`record-halt --work-unit`) | `plugins/mccp/scripts/lib/work-orchestrator.js:634-636`이 `resolveWorkUnit` 결과를 `narrowReason`/`safeField` 없이 `entry.work_unit`에 싣는다. 같은 파일 `:631-633`의 `reason`은 좁힌다 | 4 |
| F4 | backlog 2026-09-08 LOW (`a1` catch) | `plugins/mccp/scripts/lib/msw-metrics/cli.js:346-350`의 주석이 "F9 — 절대경로를 흘리지 않는다"인데 `err.message`를 그대로 쓴다. 형제 reader `work-orchestrator.js:639-646`은 `scrubAbsPaths`를 지난다 | 5 |

### 재현되지 않아 닫는 것 (코드 변경 0)

| 출처 | 판정 | 근거 |
|---|---|---|
| backlog 2026-09-01 MEDIUM (`plugins/mccp/scripts/derive/sources/findings.js:37` 직접 경로) · fan-out architect/explorer 재지적 | **obsolete** — 결함이 아니다 | `remediation_pr`는 A1 축 kind가 아니므로 writer가 worktree-local로 보낸다(`plugins/mccp/scripts/state/msw-events.js:254` `A1_AXIS_KINDS` · `:481` 라우팅). reader `plugins/mccp/scripts/derive/sources/findings.js:37,49`가 local을 읽는 것은 M1 DD8 경계와 일치한다. `resolveEventsDir`로 바꾸면 오히려 kind 없는 호출이 된다 |
| backlog 2026-09-04 · 2026-09-11 MEDIUM (`goal-detect.js` 복수-fence Plan 셀) | **resolved** | 커밋 `d436721`이 첫 fence 토큰 추출을 넣었다(`plugins/mccp/scripts/lib/goal-detect.js:169-180`) |

### fix-task

`.claude/state/fix-task.md`는 **없다.** 남은 것은 `fix-task-applied.md` 하나이며 이 PRD 축이 아니다:
`decision_id: ci-full-suite` · 원천 receipt `.claude/receipts/mccp-plan-codex/ci-full-suite.json`
(`resolution.codex_verdict='divergent'`, `rounds: 3`)의 에스컬레이션이다. 처분은 ci-full-suite
PRD(c3 worktree) 소관이다. 다만 그 파일이 드러낸 결함 하나는 기록한다 — `task_fingerprint`가
**다른 작업 단위**(`orchestrator-step-wiring-m3-rev2`)로 찍혔다. 한 worktree가 두 작업 단위의
세션을 호스팅하면 stop-loop writer가 STATE.md의 fingerprint와 receipt의 decision을 섞는다.
escalation 수명주기 축으로 backlog에 등재한다(Task 6).

### 이연 (소유 축 · 사유)

| 항목 | 소유 축 | 이연 사유 |
|---|---|---|
| round-cap 원장이 PRD 슬러그에 묶임 · `MCCP_CODEX_DISABLED`가 패널 캡까지 pin · prp-implement 2.5.4가 plan receipt를 구조적으로 stale화 · `pr.md` 3.0/3.1 순서 | 게이트 기계 | UI3 — 게이트 판정 변경이다 |
| `/mccp:milestone-close` Phase 4 mask 스니펫 | milestone-close 본문 | UI3 밖. 단 **새 사실**을 backlog에 추가한다: `applySecretMask`는 문자열 입력을 그대로 반환하므로(`plugins/mccp/scripts/derive/mask.js:185-186`, 실측 `typeof r === 'string'`) `.text`를 고쳐도 **아무것도 마스킹되지 않는다** — 크래시가 아니라 S5 마스킹 불변식 자체의 부재다 |
| `m8-coverage-gate.js:190`의 `commonDirOf` 조용한 null | m8-coverage-gate | 실패 방향이 거짓 경보(보수적)이고 라이브 발생 0건 |
| spike 가드 영구 dormant · 기준선 생기면 모든 증가에 발화 · 규범 문서의 "mechanical enforcement" | msw-metrics A1 | M3 DD2가 기준선 producer를 만들지 않기로 확정 — 입력이 없어 도달 불가 |
| 공유 corpus 무상한 동기 스캔 | session-activity | M3 DD6 — 오늘 규모에서 100MB 경고선과 세 자릿수 배 차이 |
| `a1 --json` 부재 · `invalid_reason` 배너 토큰 · `last-halt` LOW 3건 · 마이그레이션 symlink LOW 3건 · degradation 경고 test 공백 | 각 표기/진단 축 | §3.14 MEDIUM·LOW. `invalid_reason`은 긴 문장이라 한 줄 예산에 들어갈 코드 enum이 먼저 필요하다 |
| `derive/tests/mask.test.js` red | B3/toggle_usage | A1 축 밖(UI6와 같은 PRD Out of scope의 "다른 지표"). CI는 `.github/test-suite-exclusions.json` 3행으로 제외 중 |
| 설치 cache가 M1을 갖지 않음 | C0 릴리스 컷 | 근본 해소는 배포다. M4는 그 사이의 **가시성**만 책임진다(Task 3) |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 실패 메시지 좁히기 | `plugins/mccp/scripts/lib/work-orchestrator.js:639-646` | catch 안에서 `require('../derive/mask').scrubAbsPaths(msg, process.cwd())`, 그 require가 실패하면 `'unreportable'` |
| write-time 좁히기 | `plugins/mccp/scripts/lib/work-orchestrator.js:355-357` | `safeField(value, deps, repoRoot)` — `narrowReason`과 같은 3단계, 빈 값이면 `''` |
| present-only 결과 필드 | `plugins/mccp/scripts/lib/msw-metrics/index.js:191-192` | `spike_guard` — 결과에 싣고 배너가 토큰으로 내보낸다 |
| 이벤트 동일성 키 | `plugins/mccp/scripts/migrations/msw-events-common-dir.js:53` | `keyOf` — `event_id`가 있으면 id, 없으면 `legacyKeyOf`. reader의 `legacyKeyOf`(`plugins/mccp/scripts/derive/sources/session-activity.js:216`)와 동형 |
| 실제 git 레이아웃 fixture | `plugins/mccp/scripts/lib/tests/msw-a1-boundary.test.js:33-70` | `mkFixture` · `addWorktree` · `sharedDirOf` · `localDirOf` · `writeLine` |
| 배너 CLI test | `plugins/mccp/scripts/lib/tests/msw-a1-boundary.test.js:736-750` | `spawnSync(process.execPath, [A1_CLI, 'a1', '--repo-root', fx.main])` 후 stdout 정규식 |
| record-halt test | `plugins/mccp/scripts/lib/tests/work-halt-record.test.js:179-197` | `mkRepo` + `run(repo, ['record-halt', ...])` + `readChainProgress(repo).steps[0]` |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/hooks/tests/receipt-prompt-submit.test.js` | UPDATE | (d)가 임시 git 저장소를 cwd로 쓰고, 실 저장소 공유 corpus에 흔적이 남지 않음을 단언한다 (Task 1) |
| `plugins/mccp/scripts/derive/sources/session-activity.js` | UPDATE | 이 위치에서만 보이는 A1 이벤트 수(`a1_local_only_events`)를 산출한다 (Task 3) |
| `plugins/mccp/scripts/lib/msw-metrics/index.js` | UPDATE | `computeA1` 결과에 `local_only_events`를 싣는다 (Task 3) |
| `plugins/mccp/scripts/lib/msw-metrics/cli.js` | UPDATE | 이 위치에만 있는 A1 이벤트가 있을 때 조치를 담은 둘째 줄 (Task 3) · 실패 경로 절대경로 좁히기 (Task 5) |
| `plugins/mccp/scripts/lib/work-orchestrator.js` | UPDATE | `record-halt`의 `work_unit`을 쓰기 전에 좁힌다 (Task 4) |
| `plugins/mccp/scripts/lib/tests/msw-a1-boundary.test.js` | UPDATE | Task 3 · Task 5 반증 test |
| `plugins/mccp/scripts/lib/tests/work-halt-record.test.js` | UPDATE | Task 4 반증 test |
| `.claude/prds/orchestrator-step-wiring.prd.md` | UPDATE | M4 행 추가 (이 plan 작성 시점) · 착지 후 status 갱신 |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | 처분 기록 — 해소·obsolete 표식과 신규 행 3건 (Task 6) |

## Design Decisions

**DD1 — 범위는 이 PRD의 계측·표시 축이다.** UI3가 게이트 판정 변경을 배제하므로, backlog에서
가장 무거운 HIGH 여럿(round-cap 키잉 · prp-implement stale · `pr.md` 순서)은 **실재하는 결함이지만**
이연 표로 보낸다. 그것들을 여기서 고치면 이 PRD의 정체가 바뀐다.

**DD2 — 위치 의존성은 탐지하고, 자동 치유하지 않는다.** 대안 셋을 버렸다.
(a) reader가 모든 worktree를 순회 — M1 DD1이 기각했다(경계가 `git worktree list`의 우연이 된다).
(b) reader가 마이그레이션을 부수효과로 실행 — reader는 읽기 전용이어야 하고, 마이그레이션은
abort·marker·lock을 갖는 명시적 도구다. (c) writer에서 교정 — 문제의 writer는 설치 cache라 이
브랜치의 코드가 닿지 않는다. 남는 것은 **값이 읽히는 자리에서 그 값이 사적 데이터를 포함한다고
말하는 것**이다. 한계는 Risks에 적는다: 사적 데이터가 **없는** 위치(예: 오늘의 c3)는 남의 잔여를
볼 수 없으므로 신호가 뜨지 않는다. 그것은 M1 DD1의 구조적 대가이고, 두 위치 중 한 곳이라도
신호를 띄우면 운영자는 마이그레이션을 돌린다.

**DD3 — 위치 의존 수(`a1_local_only_events`)는 작업 단위가 아니라 이벤트 키로 센다.** 작업 단위로 세면 같은 단위가
공유에도 있을 때 0이 되어, 완주 이벤트만 사적인 경우(분자만 갈림)를 놓친다. 키는 마이그레이션의
`keyOf`와 동형이라, **마이그레이션이 옮기는 것과 신호가 세는 것이 같다** — 마이그레이션 직후
신호가 사라지는 것이 그 동형의 검증이다.

**DD4 — 공유 위치가 해소되지 않으면 필드는 `null`이다.** 비-git 디렉토리나 해소 실패에서는 "모든
이벤트가 local"이 참이지만 비교 대상이 없어 의미가 없다. 해소 실패는 이미 `degraded`가 표시한다.
해소는 됐는데 공유 디렉토리가 **아직 없으면** 공유 집합이 빈 것이므로 local A1 이벤트 전부가
local-only다 — 그것이 정확한 신호다.

**DD8 — 위치 의존 신호는 첫 줄 토큰이 아니라 조건부 둘째 줄이다** (design-critique R0 흡수). 원안은 첫 줄에
` · local-only=N` 토큰을 붙였는데, 그것은 엔지니어 용어이고 운영자에게 **다음 행동**을 주지 않는다 — 같은
결함을 `spike-guard=dormant`가 이미 backlog에 올렸다(2026-09-11 impeccable critique MEDIUM). 이 신호는
상수가 아니라 **조치가 필요한 예외**이므로 PRODUCT.md의 "quiet by default, loud on demand"대로 평소에는
없고, 뜰 때는 한국어 한 줄로 무엇이 틀어졌는지와 무엇을 돌리면 수렴하는지를 함께 말한다. 첫 줄의 한 줄
예산은 그대로 지킨다.

**DD5 — 오염은 테스트에서 고치고 writer 휴리스틱을 넣지 않는다.** "UUID가 아닌 session id를
거부"는 오늘 데이터에서는 맞지만, Codex 하네스의 session id 형식을 실측한 적이 없어 추측이다.
오염의 생산자는 테스트 하나이고 그것을 고치는 것이 root cause다.

**DD6 — 오염 데이터는 삭제하지 않고 격리한다.** `s1.jsonl`을 공유 디렉토리 아래
`.quarantine/`로 옮긴다. reader는 `.jsonl` 파일만 읽고(`plugins/mccp/scripts/derive/sources/session-activity.js:224`) 하위 디렉토리를
보지 않으므로 효과는 삭제와 같고, 되돌릴 수 있다. 전 줄이 테스트 서명과 일치할 때만 옮긴다.

**DD7 — 게이트 decision slug는 plan 경로에서 파생한다(`orchestrator-step-wiring-m4`).** 명령 인자
원문은 PRD 경로 + 자유 텍스트라 PRD 슬러그(`orchestrator-step-wiring`)로 해소되는데, 그 원장은 M1
본문이 이미 3/1을 썼고, `/mccp:prp-implement <plan>`은 plan 경로에서 `-m4`를 파생해 receipt를 찾는다.
새 milestone의 새 본문이므로 `-m4`가 리뷰 예산의 정직한 단위다 — 같은 본문을 재키잉한 M3의 `-rev2`와
다르다. 이 선택은 `## Gate Notes`에 남긴다.

## Tasks

### Task 1: 테스트가 실 공유 corpus에 쓰지 않게 한다

- **Action**: `receipt-prompt-submit.test.js`의 (d)에서 hook 입력의 `cwd`를 `fs.mkdtempSync`로 만든
  임시 디렉토리(`git init` 수행)로 바꾸고, `session_id`를 실행마다 유일한 값
  (`'test-' + process.pid + '-' + crypto.randomUUID().slice(0, 8)`)으로 바꾼다. 기존 단언
  (exit 0 · `not routed` 부재)은 유지한다. 새 단언: 실 저장소의
  `path.join(<git rev-parse --git-common-dir>, 'mccp', 'msw-events', sid + '.jsonl')`이 **존재하지
  않는다.** 같은 파일 (a)(b)는 `session_id`가 없어 emit하지 않으므로 손대지 않는다.
- **Mirror**: 같은 파일 `:113`의 `fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-plan-'))`.
- **Validate**: `MCCP_CODEX_DISABLED=1 node --test plugins/mccp/scripts/hooks/tests/receipt-prompt-submit.test.js`
  green. **반증**: `cwd`만 `process.cwd()`로 되돌리면 새 단언이 red여야 한다(되돌린 실행이 남긴
  `test-*.jsonl`은 확인 후 지운다).

### Task 2: 이미 들어간 오염을 격리한다 (1회성 데이터 작업)

- **Action**: 아래 스니펫으로, `s1.jsonl`의 **모든 줄**이 `session_id==='s1'` ·
  `producer==='receipt-prompt'` · `kind==='task_started'`일 때만 `<shared>/.quarantine/s1-2026-09-14.jsonl`로
  옮긴다. 한 줄이라도 다르면 아무것도 옮기지 않고 exit 1. 옮기기 전후 세 위치의 `a1` 배너를 기록한다.
- **Mirror**: DD6.
- **Validate**:

```bash
SHARED="$(git rev-parse --path-format=absolute --git-common-dir)/mccp/msw-events"
node -e '
  const fs=require("fs"),path=require("path");
  const dir=process.argv[1], src=path.join(dir,"s1.jsonl");
  if(!fs.existsSync(src)){console.log("absent — nothing to quarantine");process.exit(0);}
  const lines=fs.readFileSync(src,"utf8").split(/\r?\n/).filter(Boolean);
  const bad=lines.filter(l=>{try{const e=JSON.parse(l);return !(e.session_id==="s1"&&e.producer==="receipt-prompt"&&e.kind==="task_started");}catch(_){return true;}});
  if(bad.length){console.error("refusing: "+bad.length+" line(s) do not match the test signature");process.exit(1);}
  fs.mkdirSync(path.join(dir,".quarantine"),{recursive:true});
  fs.renameSync(src,path.join(dir,".quarantine","s1-2026-09-14.jsonl"));
  console.log("quarantined "+lines.length+" line(s)");
' "$SHARED"
```

### Task 3: 이 위치에서만 보이는 A1 이벤트를 배너가 말하게 한다

- **Action**:
  1. `session-activity.js`의 스캔 루프에서, **dedupe `continue`보다 앞에서** A1 축 kind
     (`mswEvents.A1_AXIS_KINDS`) 이벤트의 키(DD3 — `event_id` 또는 `legacyKeyOf`)를 디렉토리 종류별
     Set에 넣는다(`dirIsShared`면 shared, 아니면 local). 루프 뒤
     `result.a1_local_only_events = sharedDir ? |local − shared| : null`. 스켈레톤에 `null` 기본값을 둔다.
     A1 분자·분모 계산은 **건드리지 않는다**.
  2. `computeA1` 결과에 `local_only_events`를 싣는다(스캔 값이 숫자일 때만 — present-only).
  3. `cli.js` a1: 첫 줄(`A1 작업 단위 완주율 …`)은 **바꾸지 않는다.** `local_only_events > 0`일 때만
     stdout에 **둘째 줄**을 낸다 — `A1 값이 위치마다 다를 수 있음: 이 위치에만 N건 · 수렴: scripts/migrations/msw-events-common-dir.js`
     (DD8). 경로는 plugin-root 상대라 절대경로가 아니다. `work.md`는 a1의 stdout 전체를 그대로 출력하므로
     (`plugins/mccp/commands/work.md:117-135`) 명령 본문은 수정하지 않는다.
- **Mirror**: `index.js:191-192` present-only · `migrations/msw-events-common-dir.js:53` 키.
- **Validate**: (`msw-a1-boundary.test.js`에 추가, 실제 git fixture):
  - (a) local에만 있는 `task_started`(event_id 있음) 1건 → 필드 1, stdout 둘째 줄에 `이 위치에만 1건`과
    `msw-events-common-dir.js`, 첫 줄은 기존 정규식 그대로.
  - (b) **판별자**: 같은 event_id가 local·shared 양쪽에 있으면 필드 0, stdout이 **정확히 한 줄** —
    "local A1 이벤트를 전부 센다"는 구현이 여기서 red가 된다.
  - (c) **판별자**: local의 `session_start`는 세지 않는다 — kind를 거르지 않는 구현이 red.
  - (d) event_id 없는 레거시 이벤트가 legacy 키로 양쪽에 같으면 0.
  - (e) 필드가 A1의 `numerator` · `denominator` · `value`를 바꾸지 않는다 — (a)의 fixture에서 필드
    도입 전과 같은 값.
  - (f) 공유 위치가 해소되지 않는 비-git 디렉토리에서 필드는 `null`이고 stdout은 한 줄이다.

### Task 4: `record-halt`가 `work_unit`을 좁혀서 쓴다

- **Action**: `work-orchestrator.js:634-636`에서 `resolveWorkUnit(...)` 결과를
  `safeField(..., deps, repoRoot)`에 통과시킨 뒤 비어 있지 않을 때만 `entry.work_unit`에 싣는다.
- **Mirror**: 바로 위 `:631-633`의 `reason`.
- **Validate**: (`work-halt-record.test.js`에 추가): `--work-unit "/home/someone/private/leaked-unit"` →
  STATE.md `chain_progress`의 `work_unit`에 `/home/someone`이 없다. `--work-unit $'a\x1b[31mb'` →
  ESC가 없다. 기존 `(5) --work-unit wins when given`(`explicit-slug` 원형 보존)이 green으로 남아
  슬러그 조인 키가 바뀌지 않음을 함께 증명한다.

### Task 5: `a1` 실패 경로가 절대경로를 흘리지 않는다

- **Action**: `cli.js:346-350`의 catch를 `work-orchestrator.js:639-646` 형태로 바꾼다 — 메시지를
  `scrubAbsPaths(msg, process.cwd())`로 좁히고, 그 require마저 실패하면 `'unreportable'`. 주석 F9를
  코드와 일치시킨다. exit 0(fail-open, UI4)과 `[mccp:a1] failed` 접두는 유지한다.
- **Mirror**: `work-orchestrator.js:639-646`.
- **Validate**: (`msw-a1-boundary.test.js`에 추가): `--require <preload>`로 `session-activity` 모듈 로드를
  가로채 `new Error('boom at ' + fx.main)`을 던지게 한 뒤 `a1`을 spawn — exit 0, stderr에
  `[mccp:a1] failed`가 있고 `fx.main` 문자열이 **없다**. 반증: 수정 전 코드에서 같은 test가 red.

### Task 6: 처분을 기록한다

- **Action**:
  1. PRD `## Delivery Milestones`의 M4 행 — 착지 후 `complete`와 report 링크.
  2. backlog 기존 행에 인라인 표식(`**[RESOLVED → orchestrator-step-wiring M4 Task N]**` 선례: 2026-09-07
     m8-coverage-gate 행): `record-halt --work-unit`(→ Task 4) · `a1` catch(→ Task 5) · M1 L2 지속 가드와
     설치 cache 간극(→ Task 3, **근본 해소는 C0 릴리스 컷**이라 가시화까지만) · `plugins/mccp/scripts/derive/sources/findings.js:37`(→ obsolete,
     근거 `msw-events.js:481`) · `goal-detect` 2행(→ resolved `d436721`).
  3. 신규 행 3건: (i) receipt-prompt-submit test 오염(→ Task 1·2로 해소, 재발 방지 단언 위치 명시)
     (ii) milestone-close mask가 문자열을 마스킹하지 않음(이연 표의 새 사실) (iii) stop-loop fix-task의
     fingerprint·decision 교차 오염(`fix-task-applied.md` 증거).
- **Mirror**: backlog 4열 표 형식(`derive/sources/backlog.js`가 헤더를 리터럴로 고정).
- **Validate**: `node plugins/mccp/scripts/derive/cli.js run --json`의 backlog source가 `invalid: 0`.

## Validation

```bash
# 1. 단위·회귀 (Codex 비활성 필수 — CLAUDE.md §3.4)
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/hooks/tests/receipt-prompt-submit.test.js \
  plugins/mccp/scripts/lib/tests/msw-a1-boundary.test.js \
  plugins/mccp/scripts/lib/tests/work-halt-record.test.js \
  plugins/mccp/scripts/lib/tests/msw-metrics.test.js \
  plugins/mccp/scripts/lib/tests/msw-metrics-b2.test.js \
  plugins/mccp/scripts/lib/tests/msw-metrics-acceptance.test.js \
  plugins/mccp/scripts/lib/tests/msw-events-path.test.js \
  plugins/mccp/scripts/lib/tests/work-command-body.test.js

# 2. 가드
node scripts/version-declaration-guard.js
node plugins/mccp/scripts/lib/env-contract/lint.js

# 3. 라이브 — 코드를 고정하고 위치만 바꾼다. 세 root가 전부 실재해야 하며,
#    하나라도 출력이 비면 실패다(M3 Validation 3이 조용히 vacuous로 접힌 전례).
ROOTS="$(git rev-parse --path-format=absolute --git-common-dir)/.. $PWD $(git worktree list --porcelain | awk '/^worktree /{print $2}' | grep c3-ci-full-suite)"
for r in $ROOTS; do
  out=$(node plugins/mccp/scripts/lib/msw-metrics/cli.js a1 --repo-root "$r")
  [ -n "$out" ] || { echo "EMPTY banner for $r"; exit 1; }
  echo "$(basename "$r"): $out"
done
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Task 3의 키 수집을 dedupe `continue` **뒤**에 두면 공유 쪽 키가 영원히 비어 전 local 이벤트가 local-only로 잡힌다 | 중 | Validate (b)가 정확히 그 순서 오류를 red로 만든다 |
| 사적 데이터가 없는 위치는 남의 잔여를 볼 수 없어 신호가 뜨지 않는다 (오늘 c3) | 확실 (구조적) | DD2 — M1 DD1의 대가. 한 위치라도 신호가 뜨면 마이그레이션을 돌리고, 근본 해소는 C0 릴리스 컷. 이 한계를 report에 그대로 적는다 |
| Task 2가 공유 corpus를 건드린다 | 낮음 | 전 줄 서명 일치 전제 · 삭제 아닌 격리 · 되돌림 = `mv` 1회 |
| `safeField`가 정상 슬러그를 바꿔 A1 조인 키가 갈린다 | 낮음 | 기존 test (5)가 `explicit-slug` 원형을 단언한다. 슬러그 문자 집합에는 경로·control·200자 초과가 없다 |
| 설치 cache가 `1.33.6`이라 hook은 여전히 옛 코드를 돈다 — 이 브랜치의 수정이 hook 경로에 닿지 않는다 | 확실 | Task 3·5는 CLI를 직접 실행해 검증하고, hook 경로(Task 1)는 test가 워크트리 소스를 띄운다. dogfood는 `docs/dogfood-install.md`의 `--plugin-dir` |
| 라이브 검증에서 A1 값이 세 위치에서 **여전히** 갈린다 | 확실 (마이그레이션 전) | M4의 성공 조건은 "갈리지 않는다"가 아니라 "갈리면 사적 데이터를 가진 위치의 배너가 말한다"다. 마이그레이션 후 수렴은 별도 관측으로 기록한다 |

## Gate Notes

- **decision slug**: DD7대로 이 plan의 게이트는 `orchestrator-step-wiring-m4`로 봉인한다. PRD 슬러그
  원장(`mccp-plan-codex__orchestrator-step-wiring`)은 M1 본문의 3라운드로 캡 1을 이미 넘었고, 그
  예산은 이 본문의 것이 아니다.
- **L1 1차 실행 후 형식 정정 (L2 발화 전)**: L1이 11건을 냈다 — `**Validate** (` 표기 3건(정규식이 `**Validate**:`를 요구) · 축약 경로 인용 8건. 인용은 **fan-out이 합성한 섹션에도** 있었다(파일명만 적은 줄 번호 인용). 내용은 바꾸지 않고 인용 경로만 repo-root 전체 경로로 펼쳤고, `.claude/`·`.github/` 같은 점-디렉토리 인용은 `:N` 대신 `LN` 표기로 바꿨다 — `l1-check.js`의 `normalizePath`가 선행 점을 떼어 전체 경로여도 해소에 실패하기 때문이다(실측: 점-디렉토리 경로가 선행 점 없는 경로로 해소된다). 두 도구 결함은 backlog에 등재한다. 재실행 L1은 violation 0.
- **리뷰 모드**: `MCCP_PLAN_REVIEW=hybrid` · `MCCP_PLAN_REVIEW_L3=1` · `MCCP_GATE_ROUND_CAP=1`(`.claude/settings.json`).
  §3.16대로 1라운드 triage 후 진행한다.

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)
  - [ ] Validation 3을 **Task 2 전 · Task 2 후 · 마이그레이션(`node plugins/mccp/scripts/migrations/msw-events-common-dir.js`) 후** 세 번 돌려 배너 출력 전부를 report에 붙인다. 기대: 마이그레이션 전에는 사적 A1 이벤트를 가진 위치에 `이 위치에만 N건` 둘째 줄이 뜨고, 마이그레이션 후에는 세 위치 모두 한 줄이다
  - [ ] Task 2 후 분모가 유령 작업 단위만큼 줄었음을 수치로 기록한다(격리 전후 차이)
  - [ ] Task 1 test를 한 번 돌린 뒤 실 공유 디렉토리에 `test-*.jsonl`이 **없음**을 `ls`로 확인한다
  - [ ] `record-halt --work-unit "/home/x/leak"`를 임시 저장소에서 실행해 STATE.md 원문에 `/home/x`가 없음을 확인한다

## Multi-Perspective Fan-out

<!-- Auto-injected by /mccp:plan Phase 2.5 fan-out (read-only). -->

**Coverage**: 4/4 perspectives (architect, security, test, explorer) · spent ~64k.

### Findings (severity-ranked)

- **[HIGH][architect]** PRD orchestrator-step-wiring의 Delivery Milestones 표(M1/M2/M3) 전부가 이미 status=complete이고, STATE.md goal/last commit(ad6b6a4, e7f1855)도 M3가 goal-acceptance로 이미 close된 상태를 보여준다. 그런데 이 fan-out 프롬프트는 '(draft plan not yet written)'으로 신규 plan 작성을 전제한다 — 이 PRD 안에 남은 미완료 milestone/scope 자체가 없다. — PRD L83-87 Delivery Milestones 표 3행 모두 Status='complete'; STATE.md L20 'PRD M3는 머지 전까지 in-progress' + L12 last_pr_url PR #174 + git log 'e7f1855 chore(milestone): close orchestrator-step-wiring M3 via goal acceptance'
- **[HIGH][architect]** 현재 브랜치(c2-orchestrator-step-wiring)에 8개 검증된 미푸시 커밋이 남아있고 stale anchor가 미해소인 채로 escalate_pending=true(decision=ci-full-suite) 상태다. 새 plan을 이 위에 얹으면 게이트/receipt 경계(어느 decision slug에 속하는지)가 모호해질 구조적 위험이 있다. — STATE.md frontmatter L16-17 'escalate_pending: true / escalate_pending_decision_id: ci-full-suite' + '## Next Step: 다음 사이클이 anchor 축을 소유한다. 이 브랜치는 검증된 작업 8커밋을 담은 채 미푸시 상태로 남는다.'
- **[HIGH][test]** Decision 3 (fail-open instrumentation) has no explicit test convention named in the PRD for verifying 'loud stderr, chain never blocked' — this is a critical regression-risk surface (a bug here could silently either mask failures or block the entire /mccp:work chain) yet the PRD only cites prior producer behavior as precedent, not a test file. — PRD line 68: '실패는 조용히 삼키지 않고 loud stderr로 표면화한다... 기존 producer 2종이 이미 이 형태다(receipt-prompt.js:201의 fail-open catch)' — no test file cited for this invariant specifically.
- **[HIGH][explorer]** PRD orchestrator-step-wiring's all three milestones (M1/M2/M3) are already marked complete, with M3 shipped via PR #174 (STATE.md last_pr_url). A new plan for this PRD without a specific new milestone/backlog item risks re-doing already-shipped work. — PRD .claude/prds/orchestrator-step-wiring.prd.md L83-87 Delivery Milestones table — all rows Status=complete; .claude/state/STATE.md L12 last_pr_url=https://github.com/idenn207/mccp/pull/174; .claude/state/STATE.md L20 'PRD M3는 머지 전까지 in-progress' but goal text implies closure
- **[HIGH][explorer]** `recordStep`/auto-chain.js writes to a channel (STATE.md chain_progress / auto-chain.log.jsonl) that is explicitly a different, non-overlapping channel from the A1 event corpus. Any plan proposing to wire halt-step data into A1 must NOT merge these channels — PRD already forecloses that design. — PRD Evidence bullet: '`recordStep`은 A1과 다른 채널이다.' auto-chain.js:240-254 writes state-writer.recordChainProgress vs derive/sources/session-activity.js:184-192 reads .claude/state/msw-events/*.jsonl — 'the two paths never meet'
- **[MEDIUM][architect]** PRD가 Out of scope로 명시 이연한 항목(plugins/mccp/commands/work.md:224 ↔ :715 파일명 불일치, A1 목표치 설정, corpus git-tracked 승격, halt 원인 분류/자동진행)들이 신규 plan의 잠재 범위 후보인데, 그중 하나(work.md 동일 파일 소유 충돌)는 C10과의 경계 문제로 우산 PRD 차원의 소유권 재확인 없이 착수하면 이 자식 PRD의 '결정 4' 경계를 넘는다. — PRD L69 결정 4 '이 수정은 미실행이던 merge-apply escape를 실행시킨다 — 계측 추가와 배포 위험 계급이 다르다' + Risks 표 마지막 행 'M2의 record-step 배선이 work.md를 건드려 C10(같은 파일 소유)과 충돌한다'
- **[MEDIUM][architect]** M1이 채택한 집계 경계 설계(A1 축 3개 kind만 git common dir로 승격, 나머지는 worktree-local 유지)는 이미 findings.js 소비처가 그 분리를 우회해 직접 경로를 하드코딩하는 결함을 낳았고 backlog에 이연돼 있다 — 신규 milestone/plan이 이 corpus를 건드리면 같은 leaky-boundary 패턴을 다시 밟을 위험이 구조적으로 남아있다. — .claude/plans/codex-findings-backlog.md L1297 'producer 경로를 공유 위치로 옮기면 derive/sources/findings.js:37이 path.join(repoRoot, ".claude/state/msw-events")로 직접 경로를 구성해 resolveEventsDir를 거치지 않으므로 remediation_pr 조인이 조용히 실명한다'
- **[MEDIUM][architect]** 위치 독립성(A1 3값→1값)은 '일회성'으로만 성립한다고 STATE.md 자신이 기록한다 — 설치 cache가 여전히 로컬에 쓰이므로 새 이벤트 누적 시 재차 갈라질 수 있고, 재수렴 수단은 수동 migration 재실행뿐이다. 이는 경계 설계가 정상상태 불변식이 아니라 1회성 마이그레이션에 의존하는 구조적 약점이다. — STATE.md L48 'Open Questions: 위치 독립성은 성립하나 일회성이다 — 설치 cache 가 여전히 로컬에 쓰므로 새 이벤트가 쌓이면 재차 갈린다. 재수렴은 migrations/msw-events-common-dir.js 재실행(idempotent)'
- **[MEDIUM][security]** session_id used directly as filename (`${sessionId}.jsonl`) is gated by SESSION_ID_RE allowlist regex before path.join — this is the correct pattern and already closes path traversal, but is worth mirroring exactly in any new step-recording (M2 halt-step) code path this PRD's plan may touch, since CLAUDE.md 3.18 explicitly calls out that raw session ids from other env vars are unsanitized. — plugins/mccp/scripts/state/msw-events.js:45 SESSION_ID_RE and :503-505 validation before path.join at :539; CLAUDE.md §3.18 warns resolveRawSessionId is not itself a sanitizer and lists evidence-lock/observer-sessions/orchestration-runaway as the sanctioned choke points — any new halt-step producer must be added to that same sanitize discipline, not just reuse resolveRawSessionId directly
- **[MEDIUM][test]** PRD Success Metric 2 explicitly declares no target threshold for repo-wide A1, and metric 4 ('halt 지점 기록률') only requires production after M2 lands — but the PRD gives no falsifiable numeric acceptance for either. A downstream plan risks writing a 'Validate: run derive and eyeball the number' step that is not a real proof. — PRD lines 49, 51: '목표치는 정하지 않는다' (metric 2) and 'M2 착지 후 산출된다' (metric 4) — both lack a concrete pass/fail oracle beyond existence-of-value.
- **[MEDIUM][test]** Since all three milestones (M1/M2/M3) are marked complete with existing plans and reports, the fan-out is being run against a PRD with no live draft plan — the validation lens has nothing concrete to check task-by-task 'Validate' steps against. This is itself a meta-gap: the plan to review may not exist yet, or the fan-out target is unclear (new milestone? re-scope? audit?). — PRD Delivery Milestones table (lines 83-87): all three rows show Status=complete. Task prompt states 'Draft plan: (draft plan not yet written)'.
- **[MEDIUM][explorer]** A1 metric aggregation-boundary machinery already exists end-to-end (shared git-common-dir routing for exactly 3 kinds) — any new plan touching A1/event aggregation must reuse this, not build a new aggregator. — plugins/mccp/scripts/state/msw-events.js:254 `A1_AXIS_KINDS = new Set(['task_started','task_completed','task_ship_sealed'])`; :481 routing `if (!A1_AXIS_KINDS.has(opts.kind)) return { dir: local, shared: false }`; :91 `work_unit_kind` field already defined
- **[MEDIUM][explorer]** A known deferred bug exists: derive/sources/findings.js constructs the events dir path directly instead of via the shared resolveEventsDir helper, so remediation_pr joins silently go stale for shared-corpus consumers. If a new milestone touches derive/findings, this should be fixed via reuse of resolveEventsDir rather than a parallel path-construction. — backlog line 2026-09-01 MEDIUM: '`derive/sources/findings.js:37`이 `path.join(repoRoot, ".claude/state/msw-events")`로 직접 경로를 구성 ... resolveEventsDir를 거치지 않으므로 ... fix는 findings.js가 같은 해소기를 쓰게 하는 것.'
- **[LOW][security]** MSW event corpus is now written to git-common-dir (shared across worktrees) for A1_AXIS_KINDS — this widens the write surface from single-worktree to a location shared by all worktrees/sessions of the repo, but the boundary-validation logic (commonDirInfoOf) is structural only (HEAD file + gitdir marker checks), not permission/ownership checks. A hostile or misconfigured linked worktree (e.g. from a compromised parallel session per CLAUDE.md multi-worker orchestration) could append crafted events into the shared corpus that downstream A1/B2/findings derive logic trusts. — plugins/mccp/scripts/state/msw-events.js:420-468 (commonDirInfoOf) validates structure of .git/commondir but does not validate write permissions or the identity of the writing process; SHARED_SUBPATH at :253 is a single shared JSONL directory for A1_AXIS_KINDS across all worktrees
- **[LOW][security]** sanitizeField truncates and strips \n\r\t but does not defend against other JSONL-line-breaking or control characters (e.g. other unicode line separators U+2028/U+2029, or NUL), leaving a narrow log/record injection surface into the shared multi-consumer corpus that feeds A1/B2/findings taxonomy. — plugins/mccp/scripts/state/msw-events.js:170-172 `str = str.replace(/[\n\r\t]/g, ' ')` — no handling of U+2028/U+2029 or NUL bytes before JSON.stringify + newline-delimited append
- **[LOW][security]** PRD Evidence explicitly documents an unresolved data-integrity/denominator-pollution issue: PRD-named vs milestone-named work_unit slugs collide in the aggregation denominator (31% of startup rows), and this PRD's own Open Questions record that legacy startups are left as 'unknown' rather than retroactively fixed — any follow-on plan should not silently re-attempt retroactive backfill of trust-sensitive classification fields, since that would fabricate provenance for historical records. — PRD lines 94-98 (Open Question 1 / M1 DD3): 'unknown 통' + '소급 부여하지 않는다 — 없는 정밀도를 지어내지 않기 위해서다'
- **[LOW][security]** Fail-open is an explicit, PRD-mandated design decision (Decision 3) for all instrumentation failures on the /mccp:work hot path — this is a deliberate trust/availability tradeoff (measurement can be silently degraded rather than block execution) and any new halt-step or banner-consumption code the plan adds must preserve loud-stderr-on-failure, not swallow errors, to avoid becoming an unobserved blind spot in the gate chain. — PRD line 68: '기록 실패는 체인을 멈추지 않는다 (fail-open)... 실패는 조용히 삼키지 않고 loud stderr로 표면화한다'; mirrored in code comments at msw-events.js:279-282, :302
- **[LOW][test]** The PRD's core testable claim ('same A1 in 3 different locations: main repo, gated worktree, fresh empty worktree') is exactly the kind of assertion the existing regression test already encodes structurally (fixture-based git layout), so any plan that re-derives this from scratch instead of extending msw-a1-boundary.test.js risks a weaker/duplicate oracle. — PRD line 42 ('서로 다른 세 곳...같은 A1이 나오고') mirrors plugins/mccp/scripts/lib/tests/msw-a1-boundary.test.js:5-10 which already asserts (a) same shared dir resolution, (b) axis isolation, (c) `.git` ancestor containment, (d) fail-open on failure.
- **[LOW][test]** Open Question 5 (label-audit scope) explicitly leaves 'other metrics with the same mislabeling' unchecked, and Risk row 5 relies on 'no option to expose with wrong label' as its mitigation — but no test enumerates which other renderer sections use the same computeXxx-vs-label pattern, so future drift is unguarded. — PRD lines 113-116: 'A1 라벨만 정정했다... 범위를 넓히면... 별도 축이다... 미확인 잔여를 남기며'.
- **[LOW][test]** The 'work_unit_kind unknown bucket persists forever, never backfilled' decision (Open Question 1 / DD3) has no stated regression test ensuring the 'unknown' bucket doesn't silently grow and distort the denominator over time — a legitimate edge case (growing unknown-kind pollution) is untested per PRD text. — PRD lines 94-98: '레거시 착수는 unknown으로 잔류하며 소급 부여하지 않는다... 그 잔류가 분모에 남는다는 사실은 backlog에 등재돼 있다' — backlog registration is not a test.
- **[LOW][explorer]** Migration pattern for moving event corpus to shared location already exists and is idempotent (migrations/msw-events-common-dir.js) — reuse this rather than writing new migration logic for any follow-on corpus changes. — .claude/state/STATE.md L48 '재수렴은 migrations/msw-events-common-dir.js 재실행(idempotent)'
- **[LOW][explorer]** The label-mismatch fix pattern (msw-metrics.js renderer label vs computeA1 denominator) was scoped to A1 only by explicit decision; PRD records this as a known-incomplete audit (other metrics may have same drift) — a new plan should not assume other labels were already checked. — PRD Open Questions: 'A1의 표시 라벨을 정정하는 범위 → A1 라벨만 정정했다(M1). 같은 종류의 어긋남이 다른 지표에도 있는가의 전수 점검은 실시하지 않았다.'

### Meta-gaps

- 이 fan-out이 어떤 신규 milestone/axis를 계획하려는지 draft plan도 PRD Delivery Milestones도 지정하지 않는다 — 플래너 세션은 먼저 '이 PRD에 남은 범위가 실제로 있는가'를 확인해야 하고, 없다면 이 fan-out 자체가 잘못된 PRD를 가리키고 있을 가능성을 배제해야 한다.  _(architect)_
- PRD가 명시 이연한 5개 backlog 항목(stale anchor 2건, 문서 부채 2건, plan Validation vacuous 검증 1건) 중 무엇이 이번 plan의 대상인지 draft가 없어 알 수 없다 — 구조 경계(어느 파일/모듈을 건드리는지)를 결정하기 전에 그 매핑이 필요하다.  _(architect)_
- A1_AXIS_KINDS 승격 설계와 findings.js 우회 결함 사이의 관계처럼, 이 PRD의 milestone 산출물이 이미 다른 소비처(B2, A2, findings)와 경계를 공유하는데 그 전체 소비처 지도가 어느 문서에도 한곳에 정리돼 있지 않다.  _(architect)_
- PRD/Evidence does not address what happens if the shared git-common-dir corpus grows unbounded from many worktrees writing concurrently (per-file cap exists at msw-events.js:198-211 but is per-file, not per-shared-directory; no cross-worktree disk-quota or retention discussion) — plan should specify a retention/rotation policy for the shared A1 corpus now that it survives worktree deletion (Open Question 3 answer).  _(security)_
- No explicit mention in PRD of concurrent-writer race handling for the shared common-dir JSONL files (multiple worktrees appending to the same directory/file) — draft plan should specify whether existing atomic-append/lock patterns from §3.6 (evidence write lock) apply here or whether JSONL append is assumed atomic-enough (need file-level O_APPEND guarantee confirmation for the shared path).  _(security)_
- The plan (not yet written) should state explicitly which lens covers the M2/M3 already-shipped code's residual findings (if any were deferred to codex-findings-backlog.md) — this fan-out was invoked with source PRD only and no draft plan; recommend the planning session confirm whether this cycle is actually re-opening this already-'complete' PRD (all 3 milestones marked complete) or whether the PRD path was passed in error.  _(security)_
- PRD has no draft plan to review at fan-out time — the test lens cannot evaluate task-level 'Validate' steps; only PRD-level testability can be assessed.  _(test)_
- No PRD-level acceptance criteria specify HOW the 'value displayed at /mccp:work entry' (metric 5) will be mechanically verified beyond 'live 1회' (a single manual observation) — this is not a repeatable regression check.  _(test)_
- PRD does not name which existing test file(s) a downstream plan should extend for the fail-open invariant (Decision 3) — leaves an implementer free to invent a new, possibly weaker, test.  _(test)_
- No draft plan exists yet, and the PRD itself shows zero open (non-complete) milestones — the planning session needs to clarify what new scope is being planned: a net-new M4, or closeout of backlog items tied to this PRD (multiple deferred L2 items reference orchestrator-step-wiring-m1.plan.md).  _(explorer)_
- The PRD's own 'Out of scope' section explicitly excludes several adjacent axes (A2/A4/B2 wiring, git-tracked corpus promotion, halt-cause classification/auto-progression owned by C9) — any new plan must confirm it isn't silently picking up out-of-scope work belonging to sibling umbrella children (C9, C10).  _(explorer)_
- Risk table flags a live cross-command conflict risk: 'M2의 record-step 배선이 work.md를 건드려 C10(같은 파일 소유)과 충돌한다' — plan should check current C10 status before touching commands/work.md again.  _(explorer)_

### Patterns to mirror

- msw-events.js의 kind별 axis 분리 설계(A1_AXIS_KINDS만 공유 승격, 나머지 worktree-local 유지) — 새 축을 추가할 때 이 분리 원칙을 따르고 전체를 공유 위치로 올리지 말 것 (plugins/mccp/scripts/state/msw-events.js)  _(architect)_
- resolveEventsDir 같은 단일 해소기를 두고 모든 소비처가 그것을 거치게 하는 패턴 — 직접 path.join 하드코딩을 피해야 한다는 반면교사가 이미 backlog에 실측돼 있음 (derive/sources/findings.js:37 회귀 사례)  _(architect)_
- PRD가 '완주 정의 변경 0'을 결정 1로 못박아 diff를 늘리지 않은 것처럼, 이미 안정된 계약(예: plugins/mccp/commands/pr.md:1427의 완주 시점)은 재정의하지 않고 그대로 재사용하는 최소-diff 원칙  _(architect)_
- plugins/mccp/scripts/state/msw-events.js:55-84 ALLOWED_FIELDS allowlist + sanitizeField() truncation/newline-strip before any event is persisted — mirror this allowlist-first serialization pattern for any new step-recording (halt-step) event fields the plan introduces.  _(security)_
- plugins/mccp/scripts/state/msw-events.js:45,503-505,539 SESSION_ID_RE regex-gate immediately before path.join for filename construction — canonical defense against path traversal via session id; any new file-naming code touching session/decision identifiers must gate the same way (see also CLAUDE.md §3.18 sanitizeSessionId choke points).  _(security)_
- plugins/mccp/scripts/state/msw-events.js:341-346,420-468 structural git-dir validation (HEAD file + commondir marker check) explicitly chosen over path-containment assertContained() because the latter is structurally false for worktree common dirs — document this rationale if the plan touches any other worktree-boundary code, to avoid reviewers re-proposing the broken containment check.  _(security)_
- PRD Decision 3 (fail-open + loud stderr) as the house pattern for non-critical instrumentation on hot paths — reuse this framing rather than inventing a new failure-handling scheme for M2/M3 follow-on work.  _(security)_
- plugins/mccp/scripts/lib/tests/msw-a1-boundary.test.js — builds real git-layout fixtures (main .git dir + worktree .git file + commondir) rather than hand-rolled expected structures, explicitly to exercise the real producer code path (comment at :12-14: '손수 만든 기대 형태로 통과시키면 실 producer 경로를 검증하지 못한다').  _(test)_
- state/msw-events.js A1_AXIS_KINDS + routing (:254, :419) as the seam for axis isolation — any new plan touching event kinds should verify against this test rather than re-deriving isolation logic.  _(test)_
- CLAUDE.md §3.14/3.16 pattern: severity-based finding absorption (HIGH/CRITICAL only) with explicit backlog append for MEDIUM/LOW — downstream plan's Codex/panel review should follow this triage convention rather than blocking on every finding.  _(test)_
- plugins/mccp/scripts/state/msw-events.js:254,481 — A1_AXIS_KINDS allowlist + routing pattern for shared vs local event storage; extend this set rather than introducing a parallel storage mechanism if new kinds need cross-worktree visibility.  _(explorer)_
- commands/pr.md:1427 — existing task_completed emission pattern via `state/cli.js --kind task_completed`; mirror this call form for any new completion-adjacent event rather than inventing a new emitter API.  _(explorer)_
- hooks/receipt-prompt.js:191,201 — existing fail-open instrumentation pattern (try/catch around emit, loud stderr on failure) that PRD decision 3 explicitly requires new instrumentation to match.  _(explorer)_
- migrations/msw-events-common-dir.js — idempotent migration pattern already proven for corpus relocation; reuse structure for any further corpus-boundary changes.  _(explorer)_
- derive/sources/session-activity.js:184-192 — canonical scan-and-aggregate implementation for A1; any new metric reading the same corpus should follow its resolveEventsDir usage, not findings.js's known-broken direct path join.  _(explorer)_

### Fan-out 처분 (저자)

fan-out은 draft plan 없이 PRD만 보고 돌았으므로 HIGH·MEDIUM 대부분이 "남은 범위가 무엇인가"라는
메타 질문이다. 이 plan의 Triage가 그 답이다. 사실 주장만 대조한다.

| 지적 | 판정 | 근거 |
|---|---|---|
| HIGH architect/explorer — 전 milestone complete, 신규 범위 없음 | 수용 — 그래서 M4를 **추가**한다 | Triage F1~F4는 전부 M3 머지 이후 라이브에서 재현된 것이다 |
| HIGH architect — 미푸시 8커밋 · stale anchor 위에 새 plan | **기각 — 전제가 낡았다** | `STATE.md`의 서술은 2026-09-11 시점이다. M3는 PR #189 · #192로 머지됐다(`gh pr list --head c2-orchestrator-step-wiring`). `escalate_pending: ci-full-suite`는 다른 PRD의 결정이다(Triage fix-task) |
| HIGH test — fail-open(UI4) 검증 test 관례가 명명되지 않았다 | 수용 | Task 5 Validate가 exit 0 + loud stderr를 함께 단언하고, Task 1은 hook fail-open 경로를 건드리지 않는다 |
| MEDIUM architect/explorer — `plugins/mccp/scripts/derive/sources/findings.js:37` 직접 경로 | **기각** | Triage "재현되지 않아 닫는 것" 첫 행 |
| MEDIUM architect — 위치 독립성이 일회성 | 수용 | Task 3 |
| LOW security — `sanitizeField`가 U+2028/U+2029를 거르지 않는다 | 이연 | §3.14 LOW. 같은 계열의 `oneLineExcerpt` 행이 이미 backlog에 있다 |

## Design Critique

`[mccp:impeccable] call-form: Skill(impeccable:impeccable, ...)` · 대상 표면: `msw-metrics/cli.js a1` 터미널 출력
(`/mccp:work` 진입 배너). Method: dual-agent (Assessment A 설계 리뷰 · Assessment B detector). 브라우저 시각화는
n/a(터미널 출력). 비대화형 게이트라 critique snapshot 저장과 후속 질문은 생략했다 — Questions skipped: non-interactive gate.

| Round | 판정 | 내용 |
|---|---|---|
| R0 | `ESCALATE_NEXT_ROUND` | Assessment B: `cli.js` · `work.md` detector exit 0, finding 0. Assessment A: HIGH 2 · MEDIUM 2 · LOW 1. HIGH #1(`local-only=N`이 엔지니어 용어이고 다음 행동이 없다) **흡수** → DD8(조건부 둘째 줄, 한국어 + 수렴 명령). HIGH #2(토큰 순서) **증거로 기각**(원문 원칙과 배치가 일치, backlog 2026-09-14). MEDIUM #3·LOW #5는 #1 흡수로 함께 해소, MEDIUM #4는 backlog |
| R1 | `CONVERGED` | A 재평가: #1·#3 해소 확인, Output Constraints 4종 통과. 잔여 MEDIUM 1(신호 비대칭이 배너에 설명되지 않음) → backlog, LOW 1(#2 순서)은 토큰 제거로 축 소멸 |

## Design Routing Guide

routing mode: auto (effective at implement stage). At implement the design gate routes these stage-appropriate impeccable commands; here they are a checklist only.

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

## Gate Record

### 1라운드 결과 (2026-09-14, hybrid · 캡 1)

| 층 | 판정 | 비고 |
|---|---|---|
| L1 | converged | 1차 실행 11건은 형식(Validate 표기 · 인용 경로) — 정정 후 0건. Gate Notes 참조 |
| L2 | converged | 4/4 pass (architect · security · test · invariant). HIGH 이상 0건 |
| L3 (Codex) | **divergent** | raw `needs-attention` · HIGH 1 · MEDIUM 1 (`.claude/state/plan-review/l3-findings.json`) |
| decide | **divergent · exit 12** | "L1+L2 converged but L3 (Codex) returned divergent" · halt_stage `5.2e` · 기록 `.claude/reviews/plan-review-orchestrator-step-wiring-m4.md` |

**receipt는 쓰이지 않았다.** hybrid 경로의 receipt는 수렴 proof를 요구하므로 divergent를 converged로 봉인할
수단이 없고, 그렇게 하지도 않는다. §3.16대로 재리뷰하지 않는다 — 원장 `mccp-plan-codex__orchestrator-step-wiring-m4`
는 1/1이다. `/mccp:prp-implement`는 이 저장소의 `MCCP_RECEIPT_GATE_MODE=soft`에서 missing-only receipt를
정보성 ALLOW로 통과하며, cross-gate dedupe가 열리지 않으므로 `/mccp:pr`에서 PR-Codex가 반드시 발화한다.

### triage (§3.14)

| # | 출처 | 심각도 | 처분 | 근거 |
|---|---|---|---|---|
| L3-F1 | Codex | HIGH | **흡수** (아래) | slug 일관성 — 이번 실행은 이미 `-m4`로 일관됐지만 plan이 **재진입 방법**을 적지 않았다 |
| L3-F2 | Codex | MEDIUM | backlog | Task 2 격리 목적지가 고정 이름이라 재실행 시 첫 격리본을 덮는다. 구현 시 no-clobber 적용 권고 |
| L2 test | panel | MEDIUM | backlog | Task 1이 "hook이 임시 저장소에 여전히 emit한다"는 양성 증거를 요구하지 않는다 |
| L2 LOW ×5 | panel | LOW | backlog | architect(수렴 경로가 plugin-root 상대) · security(격리 서명 3필드) · test(Validate (e) 고정 oracle 부재 · Task 2 Validate가 검사가 아니라 동작) · invariant(공유 판독 불가 시 local-only 과보고 — loud 방향) |

**L3-F1 흡수 — 이 gate의 단위는 plan 경로다.** 이번 실행에서 slug를 쓰는 네 지점은 전부 `orchestrator-step-wiring-m4`
였다: 라운드 봉인(`key=mccp-plan-codex__orchestrator-step-wiring-m4`) · dispatch 원장(`decision: orchestrator-step-wiring-m4`) ·
리뷰 기록(`plan-review-orchestrator-step-wiring-m4.md`) · `/mccp:prp-implement`의 조회 키. 결함은 실행이 아니라 문서에
있었다 — 명령 본문은 slug를 `$ARGUMENTS` 원문에서 파생하므로 이 plan을 PRD 경로로 다시 부르면 PRD 슬러그로 돌아간다.
**재진입은 반드시 `/mccp:plan .claude/plans/orchestrator-step-wiring-m4.plan.md`로 한다.** 명령 본문 쪽 구조 결함(새
milestone을 PRD 경로로 부르면 원장이 PRD 슬러그에 묶인다)은 기존 backlog HIGH(round-cap 원장 PRD 슬러그 키잉)와 같은
축이며 UI3 밖이다.

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
