# Plan: multi-session-work-loop M10 — 부채 정산과 종결 경로

**Source PRD**: `.claude/prds/multi-session-work-loop.prd.md`
**Selected Milestone**: M10 — 부채 정산과 종결 경로 (본 plan이 PRD에 **신설**한다)
**Complexity**: Large

## Summary

이 PRD는 M7이 findings 레지스트리를, review-loop-bypass M2가 backlog 자동 적재를 만들어
**발견을 기계화**했다. 종결은 기계화하지 않았다. 실측: backlog 801행 중 757행이 2026-08 한
달에 쌓였고(패널 서명 598행) 흡수 표기는 54행뿐이며, findings 레지스트리는 open 74건이고
C1은 `computed 5/93`(5.4%)이다.

M10은 그 부채를 **처분**한다. 지표를 움직이지 않는다 — 그 구분이 이 plan의 중심이다(아래
`## 이 milestone이 하지 않는 것`). 세 원장(backlog · findings 레지스트리 · fix-task)을 단일
인벤토리로 정규화해 **분모를 봉인**하고, 별도 append-only 원장에 전건 처분을 기록하며,
still-valid CRITICAL/HIGH를 수정하고, "선언과 실제가 어긋난" 축을 수정하거나 선언을 실제에
맞게 정정한다. 완료 판정은 `m10-coverage-gate.js`의 exit 0이다(M8·M9 gate 선례).

## 이 milestone이 하지 않는 것 (L2 R1 흡수 — architect F1·F2, invariant F1, security F1)

**C1을 올리지 않는다. findings 레지스트리에 `finding_closed`를 쓰지 않는다.**

초안은 "M10이 74건을 고쳐도 C1이 안 움직이니 cross-work-unit 종결 CLI를 만들자"고 했다.
**그 전제가 틀렸다.** C1의 동결된 분자 정의는 "**같은 작업 단위 안에서** 해소된 finding 수"
(`docs/multi-session-work-loop/measurement-design.md` §C1 · PRD `## Success Metrics` C1)인데
`computeC1`(`plugins/mccp/scripts/lib/msw-metrics/index.js:729-741`)은 `closedFindings /
allFindings`를 work-unit 귀속 검사 **없이** 계산한다. 따라서 M10이 `review-loop-trust`의
finding을 닫으면 정의상 분자가 아니어야 할 종결이 분자로 계상된다 — PRD 무결성 규칙 C1이
지목한 "해소로 계상" 그 자체다.

저장소는 이미 같은 판단을 코드에 적어 두었다:

> `plugins/mccp/scripts/state/cli.js:496-498` — "Already-attributed ids come from the
> msw-events sidecar … (writing `finding_closed` into the registry instead would pass
> through the `closure_type` enum and **pollute C1**)."

초안은 그 주석과 정반대 방향으로, 심지어 **같은 파일에** writer를 신설하려 했다. §3.13이
세운 "intent 결정은 CLI 표면을 갖지 않는다"(셸 호출자가 게이트 없이 승인 필드를 stamp할 수
있으므로)는 선례와도 반대다.

따라서:

- **C1이 5.4%인 것은 계측 결함이 아니라 사실이다.** findings가 자기 작업 단위 안에서 해소되지
  않았다는 뜻이고, 레지스트리는 그 진실을 기록한다. M10은 그것을 지우지 않는다.
- M10의 처분은 **레지스트리 밖의 별도 원장**(`debt-dispositions.jsonl`)에 쌓인다. 이는
  `state/cli.js:496-498`이 이미 택한 "사이드카에 쓰고 레지스트리에 쓰지 않는다"와 **정렬**된다.
- Acceptance에서 "C1 numerator 증가"를 **삭제**했다. 완료 판정이 지표를 미는 행위와 같아지면
  그것이 곧 조작이다(invariant F2).
- **`findings-registry.js`는 아예 손대지 않는다** (L2 R2 흡수 — architect F3, test F4,
  invariant F1). 초안 2판은 "승격 필터만 손댄다"고 했으나 그 locus가 틀렸다: `isPromotable`
  (`findings-registry.js:790-797`)은 **인자 1개 순수 술어**이고 실제 필터·상한은
  `handoff-items.js:133-145`가 적용하며, `c1-feedback-loop.test.js:616-625`가 레지스트리
  소스에 `process.env`가 **0회** 등장함과 `isPromotable(finding)`의 1-arg 호출 형태를
  **고정**한다. 원장 읽기를 그 안에 넣으면 순수 술어에 IO가 생기고 그 test가 red가 된다.
  억제는 이미 `cwd`를 받는 `handoff-items.js#enumerateOpenFindings`에서 한다.

## 이 milestone의 술어가 보증하지 않는 것 (L2 R2 흡수 — invariant F4)

gate가 실제로 강제하는 것은 다음 넷이다.

1. 봉인 분모의 **전건**이 처분 줄을 갖는다(`open:0`).
2. 모든 처분 줄이 그 봉인(`inventory_sha256`)에 결속돼 있고 분모 안의 id를 가리킨다.
3. `fixed`·`obsolete`·`superseded`·`rejected`는 형식 검증을 통과한 evidence를 갖고,
   `deferred`는 **실재하는** successor 경로를 갖는다.
4. CRITICAL/HIGH 중 `fixed`가 **≥ 1**.

**보증하지 않는 것**: 무엇이 still-valid인지의 판정 자체. 착수 상한(findings open 37건 +
backlog CRITICAL/HIGH 미흡수 260행) 중 1건만 고치고 나머지를 전건 `deferred`로 밀어도 gate는
exit 0을 낸다. 임의 비율 임계를 세우지 않는 이유는 방어할 근거가 없기 때문이고(M1.5가 같은
이유로 이분법을 택했다), 대신 **대량 이연을 보이게** 만든다 — CRITICAL/HIGH의 `deferred`는
항목마다 successor를 쓰며, 하나의 successor에 N건이 몰리면 `debt-inventory.md`가 그 수를
집계해 표면화한다. 그 위는 감사 표본(PRD 규칙)이 사람 눈으로 본다. **막지 못하는 것을
막는다고 적지 않는다.**

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | backlog나 fix-task 또는 구현에 수정이 필요한 것, 발견된 문제사항, 의도대로 흘러가지 않은 동작을 분석하고 수정하는 마일스톤을 PRD에 추가한다 | direction |
| UI2 | 이 작업은 origin/main 기준 새 브랜치에서 진행한다 | constraint |
| UI3 | PR #164는 그대로 두거나 drift 수준으로만 바꾸고, 이 작업이 끝나면 PR을 override로 다시 쓰면서 두 PR을 한 번에 머지한다 | direction |
| UI4 | 범위는 분류에 더해 의도 위반 축 수정과 CRITICAL/HIGH 수정까지다 | constraint |
| UI5 | 이번이 이 PRD의 최종 수정이며 이후 발견되는 backlog는 수정 없이 진행될 가능성이 높다 | direction |
| UI6 | 이번에 확실하고 빡세게 잡아야 한다 | direction |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 완료 술어 gate | `plugins/mccp/scripts/lib/msw-metrics/m9-coverage-gate.js:1-27` | 산문이 아니라 exit code로 답하는 read-only gate. 위협 모델을 파일 상단에 한정해 적고, `evaluateGate` → `runCli` → `process.exit` 구조 |
| 술어 교차 검증과 **그 구멍** | `m9-coverage-gate.js:303-317` | 미-flip 행은 `checked:false`로 **건너뛴다**. Task 9가 flip 전/후 2회 실행을 의무화하는 근거 |
| 정적 파일 실재 술어의 함정 | `m9-coverage-gate.js:161-166` | "정책 문서의 *존재*는 미산출을 설명하지 않는다 … 커밋된 정적 파일이라 한 번 착지하면 영구히 참이고". Task 7 술어가 이 형태로 접히지 않게 하는 근거 |
| 분모 봉인 | `docs/multi-session-work-loop/large-cohort-registry.md` (M1) · `a3-baseline.json` 재봉인 거부 | 착수 전 불변 입력만 pin. **처분은 별도 파일에** 쌓아 봉인 본문을 불변으로 유지 |
| 사이드카에 쓰고 레지스트리에 안 쓴다 | `plugins/mccp/scripts/state/cli.js:496-498` | 지표를 오염시키는 쓰기를 피하는 기존 판단. 처분 원장이 그대로 따른다 |
| 경로 정규화 — **재사용한다** | `plugins/mccp/scripts/state/findings-registry.js:164` · export `:817` | `normalizeCitedPath(value, repoRoot)`는 **필드명과 무관**하고 이미 export돼 있으며 절대경로(`:174`)와 `..` traversal(`:176`, `:182`)을 모두 `OUTSIDE_REPO`로 접는다. 초안 2판이 "`cited_path`에 하드코딩돼 재사용 불가"라 적은 것은 **오인용**이었다 — 하드코딩된 것은 `:449`의 *호출 지점*뿐이다. 두 벌을 만들지 않는다 |
| 승격 필터 locus | `plugins/mccp/scripts/state/handoff-items.js:133-145` | `cwd`를 받아 `readAll` → `isPromotable` 필터 → severity 정렬 → 상한. 레지스트리는 순수하게 남는다 |
| 순수성 pin | `plugins/mccp/scripts/lib/tests/c1-feedback-loop.test.js:616-625` | 레지스트리 소스에 `process.env` 0회 + `isPromotable(finding)` 1-arg 형태를 고정. 이 test가 locus 선택을 강제한다 |
| 소스 스캐너 fail-soft | `plugins/mccp/scripts/derive/sources/backlog.js:48-58` | throw하지 않고 `{ok:false, error}` 반환. 부재는 `{ok:true, count:0}`이지 오류가 아니다 |
| 테스트 위치·명명 | `plugins/mccp/scripts/lib/tests/msw-m9-producers.test.js` | `msw-m<N>-producers.test.js`. Node native runner |

## Files to Change

<!-- §3.7 dedupe: repo-root full 경로. 축약 경로는 planned matcher를 불발시킨다. -->

> 본 plan 파일 자신은 이 표에 넣지 않는다 — 이미 디스크에 있으므로 L1의 `C3_CREATE_EXISTS`에
> 걸리고, Task 0의 이관은 파일 *변경*이 아니라 worktree 이동이다(M9 plan 선례와 동일).

| File | Action | Why |
|---|---|---|
| `.claude/prds/multi-session-work-loop.prd.md` | UPDATE | M10 행 신설 + Evidence 실측 추가 + `### 순서의 근거` §M10 |
| `plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js` | CREATE | 세 원장 정규화 · 분모 봉인 · 처분 원장 writer · `--verify`(`unmatched_dispositions` 포함) |
| `plugins/mccp/scripts/lib/msw-metrics/m10-coverage-gate.js` | CREATE | M10 완료 술어 (exit code) |
| `plugins/mccp/scripts/derive/sources/backlog.js` | UPDATE | `splitRow`/`isRowShaped`/`rowId` **export** + backlog-출신 항목의 open/closed 분리. **4열 스키마 불변** |
| `plugins/mccp/scripts/state/handoff-items.js` | UPDATE | 승격 억제 — 처분된 `finding_id`를 SessionStart 목록에서 내린다. **fail-open** |
| `docs/multi-session-work-loop/debt-inventory.json` | CREATE | 봉인된 분모 (불변) |
| `docs/multi-session-work-loop/debt-dispositions.jsonl` | CREATE | 처분 원장 (append-only, 각 줄이 봉인에 결속) |
| `docs/multi-session-work-loop/debt-inventory.md` | CREATE | 처분 어휘·규칙·한계·이연 집계 |
| `docs/multi-session-work-loop/intent-violation-ledger.json` | CREATE | Task 7 `IV1`~`IV5`의 기계 판정 레코드 |
| `plugins/mccp/scripts/lib/tests/msw-m10-producers.test.js` | CREATE | Task 2~8 회귀 (억제 양방향 포함) |
| `CLAUDE.md` | UPDATE | 처분 원장 신설 기록 + §3.14 해제 조건 재판정 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump (§3.7 — PR 직전 재계산) |
| `CHANGELOG.md` | UPDATE | 신규 항목 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | footer version 동기 (§3.7 4면) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | footer version 동기 (§3.7 4면) |

## Tasks

### Task 0: 브랜치 분리 (UI2)

- **Action**: `git worktree add .worktrees/msw-m10 -b multi-session-work-loop-m10 origin/main` 후 본 plan 파일을 그 worktree로 옮긴다. 이후 모든 Task는 그 worktree에서 수행한다.
- **Mirror**: CLAUDE.md §3.8 — worktree는 항상 repo 루트 `.worktrees/` 하위.
- **주의**: `origin/main`의 PRD에는 **M9 행이 없다**(M9 행은 미머지 PR #164에만 존재 — commit `8cb6469`). 따라서 이 브랜치의 밀스톤 표는 1~8 다음에 10이 오는 **번호 갭** 상태가 된다. 의도된 과도 상태이며 Task 9가 병합 시 해소한다.
- **Validate**: `git -C .worktrees/msw-m10 rev-parse HEAD` 가 `origin/main` HEAD와 일치. `scan.js --json`이 갭 상태에서도 파싱에 실패하지 않는다.

### Task 1: PRD에 M10 신설 (UI1)

- **Action**: 세 곳을 편집한다.
  1. `## Delivery Milestones` 표에 10행 추가 — Status `in-progress`, Plan 셀은 본 plan 경로.
  2. `## Evidence` → `### 신뢰 축`에 2026-08-31 실측 추가: backlog 801행(2026-08만 757 · 패널 서명 598) · 흡수 표기 54행 · findings open 74(CRITICAL 11 · HIGH 26) · C1 `computed 5/93`. **발견은 기계화, 종결은 미기계화**라는 비대칭과 **C1을 소급 종결로 올리지 않는다**는 판단을 함께 명시한다.
  3. `### 순서의 근거`에 §M10 추가 — 왜 M9 뒤인가, 그리고 **M10 신설이 이 PRD의 아카이브를 의도적으로 다시 연다**는 사실(§3.11 C3의 `rawRowCount === complete + dropped`가 다시 거짓이 된다).
- **Mirror**: M8·M9 행 신설 선례(`48b2f05`, `8cb6469`) — 행 추가와 근거를 같은 커밋에.
- **Validate**: `node plugins/mccp/scripts/lib/archive-complete/scan.js --json` 이 `archivable:false` + `inProgress:1`(M10 자기 행)을 보고한다. 이 거부는 **의도된 것**이다.

### Task 2: 분모 봉인 — 처분과 **분리된** 인벤토리

초안은 봉인 파일에 처분을 써 넣으면서 재봉인을 거부한다고 적어 **자기모순**이었다(R1 invariant F3). 두 파일로 나눈다.

- **Action**: `debt-inventory.js seal`이 세 소스를 정규화해 **불변 분모**를 만든다.
  - **소스 A** — `.claude/plans/codex-findings-backlog.md`: `plugins/mccp/scripts/derive/sources/backlog.js`의 `splitRow`/`isRowShaped`를 **재사용**한다. 두 함수는 현재 `module.exports = { scanBacklog }`(`:103-105`)로 미노출이라 **export를 넓히는 것이 Task 4의 일부**다(파서 두 벌 금지).
  - **소스 B** — `.claude/state/findings/*.jsonl`: `readShard` fold 결과의 `state === 'open'`.
  - **소스 C** — `.claude/state/fix-task.md` / `fix-task-applied.md`.
  - **item identity는 소스별 native id를 접두로 갖는 합성키다** (R2 흡수 — architect F2, test F3). 초안 2판은 backlog 4-cell 행에서만 성립하는 `rowId`를 "단 하나의 구현"이라 적어 소스 B·C의 항목에 id가 없었다. 정정: `item_id = "<source>:<native>"` —
    - `backlog:<rowId(cells)>` — `rowId`는 `sha256(date|severity|source|finding)` 앞 16자이고 위 스캐너가 export하는 **단 하나의 구현**이다.
    - `findings:<finding_id>` — `deriveFindingId`(`findings-registry.js:201-211`)가 이미 만든 값. work_unit·gate·perspective·severity를 담으므로 소스 B의 native id로 그대로 쓴다.
    - `fix-task:<task_fingerprint>` — frontmatter의 기존 필드.
  - **중복 해소**: `claimDigestOf`(`findings-registry.js:218`)로 A의 Finding 셀을 정규화해 B와 대조. 매칭되면 한 항목으로 접되 **두 좌표를 모두 보존**하고, 실패는 `unmatched`로 남긴다. `claimDigestOf`는 claim만 해시하므로 **여기(인벤토리 dedupe)에만** 쓰고 억제 키로는 쓰지 않는다(R2 security F2 — 그러면 다른 work-unit의 CRITICAL이 함께 사라진다).
  - **봉인**: `debt-inventory.json`에 `items[]`(id·severity·source 좌표) + `inventory_sha256` + 소스별 원본 sha256을 쓴다. **생성 시각·커밋 sha는 봉인 본문 밖 `meta` 블록**에 두고 `inventory_sha256`은 `items[]`만 덮는다(R1 test F5). 존재하는 봉인 파일에 대한 재작성은 **거부**한다.
  - **evidence 정규화는 `normalizeCitedPath`를 재사용한다** (R2 흡수 — architect F1). 그 함수는 필드명과 무관하고 이미 export돼 있으며 절대경로와 `..` traversal을 모두 `OUTSIDE_REPO`로 접는다 — 초안 2판이 "재사용 불가"라 적은 것은 오인용이었다. `debt-inventory.js`는 형식 판별만 하고 경로 성분은 그 함수에 넘긴 뒤 `OUTSIDE_REPO`면 **거부**한다. 허용 형식 4종:
    | 형식 | 쓰이는 곳 |
    |---|---|
    | `<repo-relative path>:<line>` | evidence |
    | 40-hex commit sha | evidence |
    | `#<PR번호>` | evidence |
    | `<repo-relative path>` (줄 번호 없음) | `--successor` 전용 |
    4번째 형식이 없으면 `--successor`가 어느 형식에도 맞지 않아 `deferred`가 사용 불가가 되거나 정규화를 우회한다(R2 security F1).
- **Validate**: `seal --json`을 두 번 실행 → 두 번째는 exit 비영점. `inventory_sha256`이 `items[]`만으로 재계산 가능. 절대경로·`../` evidence는 거부. 세 소스 각각에 대해 `item_id` 접두가 부여됨.

### Task 3: 처분 원장 + 승격 억제 (레지스트리 무변경)

- **Action**:
  - `debt-inventory.js dispose --item <item_id> --disposition <enum> --evidence <ref> [--successor <path>]`가 `docs/multi-session-work-loop/debt-dispositions.jsonl`에 append한다. 어휘 6종: `fixed` · `obsolete` · `superseded` · `duplicate` · `rejected` · `deferred`.
  - **각 줄은 봉인에 결속된다** (R2 invariant F5) — `inventory_sha256`을 필드로 싣는다. 봉인을 지우고 다시 만든 경우 기존 처분 줄이 **다른 분모를 인증하는** 일이 없도록, gate 축 1이 결속 불일치를 red로 잡는다. 존재 검사만으로는 그 경로가 보이지 않는다.
  - **evidence 요구**: `fixed`·`obsolete`·`superseded`·`rejected`는 형식 검증을 통과한 `--evidence` 필수. `duplicate`는 접힌 상대 `item_id`. `deferred`는 **`--successor` 필수**이며 실재하는 경로여야 한다.
  - **승격 억제는 `handoff-items.js#enumerateOpenFindings`에서 한다** (R2 흡수 — architect F3, test F4, invariant F1). 그 함수는 이미 `cwd`를 받으므로 원장 경로를 알 수 있고, `findings-registry.js`는 **한 줄도 바뀌지 않는다**. 매칭 키는 `claimDigestOf`가 아니라 **`finding_id`**다 — `item_id`의 `findings:` 접두를 벗기면 그대로 나온다(R2 security F2).
  - **억제는 fail-open이다.** 원장이 부재·파손·판독 불가면 **아무것도 억제하지 않는다**. 과다 억제는 live CRITICAL을 세션 경계에서 지우는 방향이라 M7이 세운 불변식을 조용히 끄고, C1은 승격을 보지 않으므로 그 사고를 감지할 수 없다(R2 invariant F1). 판독 실패는 loud stderr로 표면화한다.
- **왜 CLI인데 §3.13 선례에 걸리지 않는가 — 정정** (R2 흡수 — security F3): 초안 2판은 "이 원장은 어떤 게이트의 승인 축도 아니다"라고 적었으나 **거짓이었다.** Task 8 축 2가 바로 이 원장을 읽어 M10 완료를 판정한다. 정직한 서술은 이렇다 — 이 원장은 **M10 자신의 완료 축이지만 어떤 지표의 분자도 아니고 다른 게이트의 승인 축도 아니다.** §3.13이 막은 것은 *Codex를 부르지 않고 승인 verdict를 stamp하는 것*이고, 여기서 위조 가능한 것은 M10의 자기 완료 선언뿐이며 그것은 M8·M9 gate가 이미 인정한 위협 모델(우발적 미승인 flip만 겨냥, repo write 권한자는 범위 밖)과 같은 층이다. **그 사실을 숨기지 않는다.**
- **Validate**:
  - `dispose` 후 `derive` C1이 이전과 **동일**(레지스트리 미오염).
  - **억제 양방향 test** (R2 test F2): (a) 처분된 finding이 승격 목록에서 **사라진다**, (b) 처분되지 않은 open CRITICAL이 **여전히 승격된다**, (c) 원장이 파손됐을 때 (b)가 유지된다(fail-open). (a)만 있으면 과다 억제 결함이 green으로 통과한다.
  - `deferred`인데 `--successor` 파일이 없으면 exit 비영점. 형식 밖·`OUTSIDE_REPO` evidence는 거부.

### Task 4: backlog open/closed 분리 (4열 스키마 불변)

- **Action**: `derive/sources/backlog.js`가 처분 원장을 읽어 **backlog-출신 항목**(`item_id` 접두 `backlog:`)의 `closed_count`·`open_count`를 더한다.
  - **`unmatched_dispositions`는 여기가 아니라 `debt-inventory.js --verify`가 센다** (R2 흡수 — invariant F3). 그 카운터는 *봉인 분모*와 대조하는 술어인데 이 스캐너는 backlog 4열 행만 알아서 소스 B·C의 처분 줄을 전부 "없는 id"로 읽는다 — 여기 두면 gate 축이 구조적으로 통과 불가가 되고, 편한 해소는 "못 맞춘 줄 무시"이며 그것이 금지 대상이다. 봉인 파일을 아는 모듈이 센다.
  - **표 본문은 편집하지 않는다** — `rowId`가 본문 해시라 한 글자만 바뀌어도 기존 처분이 어느 행도 가리키지 않는다(R1 invariant F5). 기존 54행의 `ABSORBED`/`RESOLVED` 산문은 **읽기만** 하고 Task 5가 `superseded` 처분으로 승격한다.
  - `splitRow`·`isRowShaped`·`rowId`를 export한다(Task 2가 재사용).
- **Validate**: 처분 원장 부재 시 `scanBacklog`의 **기존 키 값이 전부 불변**이고 신규 키는 `closed_count:0`·`open_count === count`다. 초안 2판의 "바이트 동일"은 신규 키를 항상 싣는 Action과 모순이었다(R2 architect F4). 원장 1줄 추가 시 `open_count` 1 감소.

### Task 5: 인벤토리 전건 처분 (UI4 · UI6)

- **Action**: 봉인 분모의 **모든** item에 처분을 붙인다. 기계 우선, 나머지 개별.
  - **기계 처분 1 — `duplicate`**: Task 2가 접은 중복.
  - **기계 처분 2 — `superseded`**: 본문에 `ABSORBED`/`RESOLVED` 표기가 있는 54행.
  - **기계 처분 3 — `obsolete` 후보**: 인용한 `file:line`/심볼이 현재 트리에 없으면 후보 표시. **자동 확정하지 않는다** — 경로 이동과 삭제를 구분할 수 없다.
  - **개별 판정**: 남은 항목. CRITICAL/HIGH는 6종 중 하나이며 evidence/successor 규칙이 그대로 적용되고, `deferred`는 **항목마다** successor를 쓴다.
  - **MEDIUM/LOW 일괄 이연**: UI5대로 하나의 successor를 공유하는 일괄 `deferred`를 허용하되 `debt-inventory.md`가 successor별 건수를 집계해 표면화한다.
- **봉인 이후의 신규 부채는 분모 밖이다** (R2 흡수 — invariant F2). M10 자신의 게이트가 §3.15 5.2g2 경로로 backlog에 새 행을 쌓으므로, gate가 `open:0`을 낼 때 라이브 `open_count`는 0이 아닐 수 있다. 이는 결함이 아니라 **스냅샷 의미론**이다 — `meta.sealed_at_commit`이 그 경계를 명시하고 `debt-inventory.md`가 "이 분모는 그 커밋 시점의 부채이며 이후 증가분은 다음 주기 소관"이라고 적는다. 적지 않으면 같은 괴리를 만드는 milestone이 된다.
- **Validate**: `debt-inventory.js --verify`가 `open:0` · `unmatched_dispositions:0` · 봉인 결속 일치 · 전건 evidence/successor 규칙 충족을 보고.

### Task 6: still-valid CRITICAL/HIGH 수정 (UI4)

- **Action**: Task 5가 still-valid로 남긴 CRITICAL/HIGH를 수정한다. 착수 시점 상한은 findings open 37건(CRITICAL 11 · HIGH 26) + backlog CRITICAL/HIGH 미흡수 260행 중 still-valid로 남은 것.
- **한계**: 위 `## 이 milestone의 술어가 보증하지 않는 것`이 소유한다. 그 절을 여기서 되풀이하지 않는다.
- **Validate**: 각 수정에 회귀 test 동반. `MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 <touched test files>` 전건 통과.

### Task 7: 선언과 실제가 어긋난 축 — **레코드로 기계화**

초안은 "수정 커밋 또는 문서 정정 커밋 중 정확히 하나"를 gate가 검사한다고 적었으나, 거울로 삼은 m9 gate의 술어는 `fileExists`/`prdContains`뿐이라 **커밋 종류를 구분할 수단이 없다**(R1 test F2, invariant F6). 산문을 레코드로 바꾼다.

`docs/multi-session-work-loop/intent-violation-ledger.json`에 5개 항목을 고정 id로 기록한다 —
`{id, resolution: 'fixed'|'declaration-corrected', evidence, asserted_text?}`.

| id | 무엇이 어긋났는가 | 실측 근거 |
|---|---|---|
| `IV1` | 라운드 계수가 plan 편집 뒤 재발화를 못 본다. `plan.md` 5.2c의 dispatch 원장은 `round_index`를 **같은 plan hash 안에서만** 센다 | `.claude/state/plan-review/dispatch-log-multi-session-work-loop.jsonl` — 패널이 3회 이상 발화했는데 hash가 매번 달라 전부 `round_index:0` |
| `IV2` | 한 receipt 안에서 `resolution.converged:true`와 `resolution.codex_verdict:'divergent'`가 동시에 봉인된다 | `.claude/receipts/mccp-pr-codex/multi-session-work-loop-m9.json` — 세 소비처(fix-task · ship gate · dashboard)가 한 파일에서 서로 다른 답을 얻는다 |
| `IV3` | intent 축이 기본 모드에서 skip된다(`MCCP_PLAN_REVIEW` 미설정 → `multi-agent` → 패널 carve-out) | PRD `### 순서의 근거` UI7·UI8 항목. **귀속이 `diverse-agent-review` PRD**이므로 M10은 수정하지 않고 이관 사실을 기록한다 → `declaration-corrected` |
| `IV4` | §3.14 임시 규칙의 해제 조건이 미충족이다 | `plugins/mccp/scripts/lib/plan-review/quorum.js:176-182` — bare `verdict === 'fail'`을 `severity:'FAIL'` blocking finding으로 여전히 합성 |
| `IV5` | fix-task 대기분이 종결되지 않았다 | `.claude/state/fix-task-applied.md` — M9 PR-Codex divergent 에스컬레이션 |

gate가 검사하는 것:
1. 5개 id 전건 존재 + `resolution`이 enum 안.
2. `fixed`면 `evidence`가 형식 검증을 통과하고 지목한 파일이 실재하며, 커밋 sha면 **HEAD에서 도달 가능**할 것.
3. `declaration-corrected`면 `asserted_text`가 지목 문서에 **실제로 존재**할 것 — 파일 실재가 아니라 **내용 대조**다(m9 gate가 R1 F2로 고친 "정적 파일 실재 = 영구 참"의 재도입 차단).

**정직한 한계**: 이 술어는 *정정이 실제와 맞는지*를 판정하지 못한다. 그것은 사람이 본다.

- **Validate**: `node plugins/mccp/scripts/lib/msw-metrics/m10-coverage-gate.js` 축 3이 `IV1`~`IV5` 전건에 대해 `ok:true`를 보고한다. 한 항목의 `asserted_text`를 지목 문서에서 지우면 축 3이 red로 뒤집힌다(내용 대조가 실제로 작동함을 보이는 음성 test).

### Task 8: m10-coverage-gate.js

- **Action**: 4축.
  1. **봉인 실재·불변·결속** — `debt-inventory.json`이 있고 `inventory_sha256`이 `items[]`로 재계산해 일치하며, **모든 처분 줄의 `inventory_sha256`이 그 값과 같을 것**.
  2. **처분 완전성** — `debt-inventory.js --verify` 출력을 읽어 `open:0` · `unmatched_dispositions:0` · evidence/successor 규칙 전건 충족 · CRITICAL/HIGH `fixed` ≥ 1.
  3. **의도 위반 레코드** — Task 7의 3개 검사.
  4. **술어 교차 검증** — PRD에서 실제로 `complete`가 된 M10 행을 읽어 위 셋과 대조. m9 gate와 달리 축 1~3은 flip 여부와 무관하게 평가되므로, 축 4가 더하는 것은 **"flip이 실제로 일어났는가"** 한 가지다(R2 architect F5 — 동어반복이라는 지적을 받아들여 축 4의 역할을 이렇게 좁혀 적는다).
- **위협 모델**: M8·M9 gate와 동일하게 한정해 적는다 — 우발적 미승인 flip만 겨냥하고, repo write 권한을 가진 위조자는 원리상 범위 밖이다.
- **Validate**: 조건 미충족에서 exit 1, 충족 후 exit 0.

### Task 9: 재측정 · status 정본화 · 병합 정합 (UI3)

- **Action**:
  1. `derive` 재실행. **C1은 이동하지 않아야 정상**이다(Task 3 불변식) — 값과 함께 그 사실을 기록한다.
  2. **gate를 flip 전에 1회, flip 후에 1회 돌린다.** m9 gate 계열은 미-flip 행을 `checked:false`로 건너뛰므로(`m9-coverage-gate.js:309-313`) flip 전 실행만으로는 축 4가 평가되지 않는다(R1 invariant F4). 순서: flip 전 exit 0(축 1~3) → PRD M10 행 `complete` → flip 후 exit 0(축 4 포함).
  3. §3.7 4면 동기(`plugin.json` · `renderer/html.js` · `renderer/markdown.js` · `CHANGELOG.md`). version target은 **PR 직전 재계산**(§3.7 forward-only; `origin/main` 1.33.2 · 미머지 PR #164가 1.34.0 선점 중).
  4. 병합 정합: 두 PR을 함께 머지할 때 M9 행이 M10 행 **위에** 삽입돼 표가 1~10이 되는지 확인하고 번호 갭 주석을 제거한다. §3.5.1대로 `git diff --diff-filter=D --name-only origin/main...HEAD`로 **의도치 않은 삭제 0건**을 확인한다.
- **Validate**: 아래 `## Validation` #2가 flip 전/후 2회 모두 exit 0.

## Validation

```bash
# 1. 봉인 결정성 + 재봉인 거부 (본문에 시각이 없으므로 해시 비교가 성립한다)
node plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js seal --json
node plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js seal --json   # exit 비영점 기대
node plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js --verify

# 2. M10 완료 술어 — flip 전 1회, PRD flip 후 1회 (둘 다 exit 0)
node plugins/mccp/scripts/lib/msw-metrics/m10-coverage-gate.js

# 3. 지표 불변 확인 — C1은 움직이지 않아야 한다
MCCP_CODEX_DISABLED=1 node plugins/mccp/scripts/derive/cli.js run --json

# 4. 회귀 — 편집한 파일의 자기 suite와 그 소비처를 함께 돈다 (R2 test F1)
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/lib/tests/msw-m10-producers.test.js \
  plugins/mccp/scripts/lib/tests/msw-metrics.test.js \
  plugins/mccp/scripts/lib/tests/c1-feedback-loop.test.js \
  plugins/mccp/scripts/lib/tests/findings-registry.test.js \
  plugins/mccp/scripts/lib/tests/msw-derive-sources.test.js \
  plugins/mccp/scripts/hooks/tests/auto-handoff.test.js \
  plugins/mccp/scripts/state/tests/

# 5. CLAUDE.md 절 소실 검증 (§1.4 — 이전과 삭제를 가르는 유일한 기계 장치)
node plugins/mccp/scripts/lib/instruction-contract/lint.js \
  --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md

# 6. 아카이브 판정 — M10 in-progress 동안 archivable:false 가 정상
node plugins/mccp/scripts/lib/archive-complete/scan.js --json

# 7. 삭제 사고 검증 (§3.5.1)
git diff --diff-filter=D --name-only origin/main...HEAD

# 8. version 4면 동기
node plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **801행 전건 처분이 한 작업 단위를 초과한다** | 높음 | 기계 처분 3종을 먼저 적용해 개별 판정 대상을 줄이고, MEDIUM/LOW는 successor를 공유하는 일괄 `deferred`를 허용(UI5). 분모는 Task 2가 봉인하므로 사후 축소가 불가 |
| **전건 `deferred`로 밀어 gate를 통과한다** | 높음 | `deferred`는 실재하는 successor 필수 + CRITICAL/HIGH `fixed` ≥ 1 + successor별 건수 집계로 대량 이연이 보인다. 그래도 판정 자체는 못 막으며 `## 이 milestone의 술어가 보증하지 않는 것`이 그 사실을 소유한다 |
| **승격 억제가 과다 작동해 live CRITICAL이 세션 경계에서 사라진다** | 높음 | 매칭 키를 `finding_id`로 고정(claim 해시 아님) · fail-open · 억제 **양방향** 회귀 test. C1은 승격을 보지 않으므로 C1 불변 단언만으로는 이 사고를 못 잡는다는 것이 test 설계의 전제 |
| **처분 원장이 C1을 오염시킨다** | 중 | 레지스트리에 `finding_closed`를 **쓰지 않는다**. `findings-registry.js`는 파일 자체가 무변경이고 `c1-feedback-loop.test.js:616-625`가 그 순수성을 계속 고정한다 |
| **evidence·successor가 절대경로/`..`를 git 이력에 싣는다** | 중 | `normalizeCitedPath`를 재사용하고 `OUTSIDE_REPO` 반환 시 거부. 두 벌을 만들지 않으므로 한쪽만 뒤처지는 일이 없다 |
| **봉인을 지우고 다시 만들어 기존 처분이 다른 분모를 인증한다** | 중 | 처분 줄마다 `inventory_sha256` 결속 + gate 축 1이 불일치를 red로. 존재 검사만으로는 안 보인다 |
| **두 PR 동시 머지 시 밀스톤 표 충돌로 M9 행이 소실** | 중 | §3.5.1 실측 사고(PR #110)와 동형. Task 9가 `--diff-filter=D` 검증을 의무화하고, 표 충돌은 행 단위로 해소(양쪽 행 보존) |
| **gate가 flip 전에만 돌아 축 4가 평가되지 않는다** | 중 | Task 9가 flip 전/후 2회를 의무화하고 Validation #2에 명시 |
| **번호 갭(1~8, 10)이 파서를 깨뜨린다** | 중 | `scan.js`·`b1-status-drift.js`는 행 번호를 검증하지 않는다. Task 0의 Validate가 사전 확인 |
| **M10 신설이 PRD 아카이브를 되돌린다** | 낮음 | 의도다. 부채가 남은 PRD를 활성 스캔에서 빼는 것이 오히려 이 PRD가 없애려는 drift다. §순서의 근거에 기록 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)
  - 라이브 완주가 반드시 남겨야 할 산출물: (1) `docs/multi-session-work-loop/debt-inventory.json`이 존재하고 `inventory_sha256`이 `items[]`로 재계산해 일치, (2) `debt-inventory.js dispose`를 **실제로 호출**해 만든 줄이 `debt-dispositions.jsonl`에 있고 전건이 그 봉인에 결속되며 그중 CRITICAL/HIGH `fixed`가 ≥1건, (3) 그 호출 **전후 `derive` C1이 동일**(레지스트리 미오염 증명), (4) `m10-coverage-gate.js`가 PRD flip **전·후 각각** exit 0
- [ ] `open` 잔존 0 · `unmatched_dispositions` 0 · 봉인 결속 불일치 0
- [ ] 승격 억제 양방향 test 3종(사라짐 · 미처분 CRITICAL 유지 · 파손 시 fail-open)이 통과
- [ ] `intent-violation-ledger.json`의 `IV1`~`IV5`가 전건 `resolution`을 갖고 gate 축 3을 통과
- [ ] PRD M10 행이 `complete`로 정본화되고 gate 축 4가 그 flip을 확인

## Design Critique

- 탐지: `design_signal=true` — whitelist hit (`plugins/mccp/scripts/derive/sources/backlog.js` · `plugins/mccp/scripts/lib/renderer/html.js` · `plugins/mccp/scripts/lib/renderer/markdown.js`). skill `impeccable` 4.0.4 (user 채널) 해소.
- 라운드: R0 1회 (cap 2). verdict **CONVERGED**. L2 흡수로 본문이 바뀐 뒤에도 렌더 표면 축은 불변이라 재판정 대상이 아니다.
- 판정 근거 — 4개 Output Constraints 대조:
  - **정보 위계 3단계 (H15)**: 본 plan 본문에 depth ≥ 4 heading **0건**. PASS.
  - **강조색 화면당 1개**: rendered surface에 더하는 것은 `html.js:1419` `page-foot`의 version 리터럴과 `markdown.js:163` derived 줄의 version 리터럴 **둘뿐**이다(§3.7 4면 동기 의무). accent token 신설 0건. PASS.
  - **raw markdown marker 금지**: 신규 rendered surface 0건. backlog 스캐너가 얻는 것은 `closed_count`·`open_count` **스칼라**이고 markdown을 나르지 않는다. PASS.
  - **한 화면 항목 수 상한**: 본 plan은 renderer의 섹션 구성을 바꾸지 않는다. PASS.
- **전방 주의(이번 판정 대상 아님)**: Task 4가 만드는 open/closed 분리를 뒤에 어떤 사이클이 대시보드의 새 `list-of-N` 섹션으로 표면화한다면, 그 섹션은 상위 3개 expanded + 나머지 `<details><summary>+N more</summary>` 규칙을 따라야 한다.

## Design Routing Guide

routing mode: auto (implement 단계에서 유효). plan 단계는 rendered UI가 아직 없어 **호출하지 않고 체크리스트로만** 기록한다.

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

## External Research Provenance

- Source PRD: .claude/prds/multi-session-work-loop.prd.md
- References section sha256: 1aaa7924f4e1ebed8993b242c00788e1c0ad84319463ff89f3a29625b33aa880
- Stamped at: 2026-08-31T08:57:13.347Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
