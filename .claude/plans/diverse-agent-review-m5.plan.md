# Plan: 게이트 배선 오라클 추출 (diverse-agent-review M5)

**Source PRD**: `.claude/prds/diverse-agent-review.prd.md`
**Selected Milestone**: #5 — 게이트 배선 오라클 추출
**Complexity**: Medium

## Summary

게이트 승인 배선은 `plugins/mccp/commands/*.md` 안의 셸 블록에 산다. 그 아래 오라클은
전부 단위 test로 덮여 green인데 **호출하는 markdown은 덮이지 않고, 게이트는 거기서
작동한다** — M1 실측이 "code-review 8 + santa-loop 20 = 28건 전부 command-body seam"이다.
현재 방어는 test 파일 4개에 흩어진 임시 정규식이고, 셸 블록 추출기가 서로 다른 구현으로
**최소 네 벌** 존재한다. 그중 셋(`plan-review-command-body.test.js:26` ·
`review-single-pass-command-body.test.js:30` · `impeccable-guard.test.js:270`)은 fence 를
0칼럼에 고정해 들여쓴 fence 13개를 못 보고, 넷째(`command-tmp-worktree-safe.test.js:39`)는
이미 들여쓰기와 `sh`/`shell` 태그를 처리한다 — 즉 **정답이 이미 저장소 안에 있는데 공유되지
않는 것**이 문제다. 정본화는 새 구현을 발명하는 것이 아니라 넷째를 승격하는 일이다.

M5는 그 방어를 **순수 오라클 하나로 추출**한다 — 정본 블록 추출기 + 실측으로 sizing된
seam 규칙 3종 + 열거된 부채 래칫. 규칙은 발명하지 않고 **실제 결함 이력에서만** 도출하며,
각 규칙이 자기 클래스를 실제로 잡는다는 것을 **변이 test**(합성 위반 본문을 먹여 red를
확인)로 증명한다 — "단위 test 통과 ≠ 경로 작동"이 이 milestone이 닫으려는 바로 그
실패이므로, 규칙이 통과한다는 사실만으로는 규칙이 작동한다는 증거가 되지 않는다.

**게이트 본문은 한 줄도 고치지 않는다.** M5는 추출·계측 milestone이고, 발견된 결함의
수정은 배선 변경이라 UI2 대로 뒤로 남긴다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 게이트 승인 배선이 단위 test 사거리 안으로 이동해야 한다 — seam 결함이 ship 후 리뷰가 아니라 test로 잡혀야 한다 | direction |
| UI2 | 배선을 늘리기 전에 추출한다 — 추출 전에 배선을 늘리면 같은 seam 패턴을 그대로 재생산한다 | constraint |
| UI3 | 근거 없이 임계값이나 리뷰어 프롬프트를 손보지 않는다 | constraint |
| UI4 | 리뷰는 1라운드를 기본으로 하고, 라운드를 늘려 plan을 다듬지 않는다 | direction |
| UI5 | 리뷰 finding은 HIGH와 CRITICAL만 그 자리에서 흡수하고 나머지는 backlog로 이연한다 | constraint |
| UI6 | Codex 완전 제거는 하지 않는다 — hybrid opt-in으로 존속한다 | exclusion |
| UI7 | receipt schema version bump은 하지 않는다 | exclusion |
| UI8 | 게이트 경로를 실제로 1회 완주하고 산출물을 확인한다 — 단위 test 통과는 경로 작동의 증거가 아니다 | constraint |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Lint 오라클 구조 | `plugins/mccp/scripts/lib/env-contract/lint.js:245` | `run(repoRoot)` 가 `{ok, checks}` 반환, 규칙별 `fail(check, problems)`, `--json` CLI + 비영점 exit |
| 열거된 부채 + 상한 래칫 | `plugins/mccp/scripts/lib/env-contract/evidence-debt.js:107` | `EVIDENCE_DEBT_CEILING` 상수 + 로드 시점 `assertShape` throw + test 가 상한과 길이를 짝으로 단언 |
| 순수 오라클 + CLI seam | `plugins/mccp/scripts/lib/plan-review/quorum.js:134` | 판정은 순수 함수, CLI 는 아티팩트 read/write 만 |
| 셸 블록 추출 (승격 대상 — 유일하게 옳은 사본) | `plugins/mccp/scripts/lib/tests/command-tmp-worktree-safe.test.js:39` | `/^\s*```(\w*)/` — 들여쓰기 허용 + `bash`/`sh`/`shell` 태그. Task 1 이 요구하는 계약을 이미 만족하므로 여기서 승격한다 |
| 셸 블록 추출 (이전 대상 1) | `plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js:26` | `bashBlockLines()` — 0칼럼 고정 |
| 셸 블록 추출 (이전 대상 2) | `plugins/mccp/scripts/lib/tests/review-single-pass-command-body.test.js:30` | `bashBlocks(src)` — 0칼럼 고정 + 반환 형태가 위와 다르다 |
| 셸 블록 추출 (이전하지 않음) | `plugins/mccp/scripts/lib/tests/impeccable-guard.test.js:270` | 0칼럼 고정이나 **다른 축**(impeccable 탐지 계약)이라 이 milestone 의 blast radius 밖. 존재만 기록하고 건드리지 않는다 |
| test 러너·명명 | `plugins/mccp/scripts/lib/tests/plan-review-l1.test.js` | `node --test`, `node:test` + `node:assert/strict` |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/command-body/blocks.js` | CREATE | 정본 셸 블록 추출기 — `command-tmp-worktree-safe.test.js:39` 를 승격하고 0칼럼 고정 사본 2벌을 대체한다 |
| `plugins/mccp/scripts/lib/command-body/rules.js` | CREATE | seam 규칙 S1/S2/S3 순수 함수 |
| `plugins/mccp/scripts/lib/command-body/debt.js` | CREATE | 열거된 기존 위반 + `SEAM_DEBT_CEILING` 래칫 + `ASSERT_BASELINE`(Validation 3b 가 읽는 커밋된 baseline) |
| `plugins/mccp/scripts/lib/command-body/lint.js` | CREATE | `run(repoRoot)` + `--json` CLI |
| `plugins/mccp/scripts/lib/tests/command-body-blocks.test.js` | CREATE | 추출기 계약 + 두 사본과의 차이 고정 |
| `plugins/mccp/scripts/lib/tests/command-body-rules.test.js` | CREATE | 규칙별 변이 test — 합성 위반에 red, 합성 정상에 green |
| `plugins/mccp/scripts/lib/tests/command-body-lint.test.js` | CREATE | 실코퍼스 실행 + 부채 래칫 양방향 |
| `plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js` | UPDATE | 자체 추출기를 제거하고 오라클을 소비 — 기존 단언은 축자 보존 |
| `plugins/mccp/scripts/lib/tests/review-single-pass-command-body.test.js` | UPDATE | 동일 |
| `docs/diverse-agent-review/gate-wiring-oracle.md` | CREATE | 규칙 도출 근거·sizing 실측·미채택 규칙과 그 이유 |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | 오라클이 찾은 실결함을 증거와 함께 이연 |
| `.claude/prds/diverse-agent-review.prd.md` | UPDATE | #5 행 status 와 Plan 셀 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version `1.33.2` 에서 `1.33.3` 으로 (PRD 내 단일 milestone = patch) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `CHANGELOG.md` | UPDATE | 1.33.3 항목 |

**`plugins/mccp/commands/` 의 어떤 파일도 이 목록에 없다.** 게이트 본문 무편집이 이
milestone 의 기계적 acceptance 조건이며(UI2), Validation 이 그 diff 가 공집합임을 확인한다.

## Tasks

### Task 1: 정본 블록 추출기 (`command-body/blocks.js`)

- **Action**: `extractBlocks(src)` 가 `{lang, start, end, lines}` 배열을 반환한다. 여는 fence 는
  선행 공백을 허용하고, 닫는 fence 는 같은 들여쓰기 폭 이상을 요구한다. `bashBlocks(src)` 는
  `lang` 이 bash 인 것만 거르는 얇은 래퍼. 들여쓴 fence 13건(plan 2 · pr 1 · prp-implement 8 ·
  santa-loop 2)이 **이전 대상 두 사본에서 불가시**이므로 이것이 실질 차이다. 승격 대상
  (`command-tmp-worktree-safe.test.js:39`)은 이미 그것을 처리하므로 새로 발명할 계약이 아니라
  옮겨 오는 계약이다.
- **Mirror**: `command-tmp-worktree-safe.test.js:39` 의 fence 정규식(`/^\s*```(\w*)/`)과
  `plan-review-command-body.test.js:26` 의 상태 추적 루프를 합쳐 옮긴다.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/command-body-blocks.test.js` —
  들여쓴 fence 가 포함되고, 비-bash fence(markdown/json/regex/jsonc)가 제외되며, 언어 태그가
  없는 fence 가 bash 블록을 열지 않음을 단언.

### Task 2: seam 규칙 3종 (`command-body/rules.js`)

- **Action**: 순수 함수 3개. 각 규칙은 블록 배열을 받아 `{file, line, rule, text, why}` 배열을 낸다.
  - **S1 — 캡처된 exit 는 자기 캡처 이후 같은 블록에서 읽혀야 한다.** `X_EXIT=$?` 캡처
    지점 **이후로** 같은 블록에서 한 번도 읽히지 않으면 위반. **"이후"가 술어의 일부이고
    장식이 아니다** — `plugins/mccp/commands/prp-implement.md:991-998` 은 하나의 들여쓴
    fence 안에서 `:992` 가 `$ENTER_EXIT` 를 읽은 **뒤** `:996` 이 재캡처하므로, "같은
    블록에서 한 번도 참조되지 않으면"이라는 넓은 문면으로는 `:996` 이 위반이 아니게 되고
    아래 열거한 부채 집합과 규칙 출력이 첫날부터 어긋난다.
    실측(이 술어 기준): 캡처 32건 중 **5건 위반** — `plugins/mccp/commands/prp-implement.md:984`,
    `plugins/mccp/commands/prp-implement.md:996`, `plugins/mccp/commands/prp-implement.md:1787`,
    `plugins/mccp/commands/prp-implement.md:1810`, `plugins/mccp/commands/santa-loop.md:281`.
    셸 상태는 fence 를 넘지 못하므로 다음 블록의 비교는 빈 값과 대조되어 **분기가 죽는다.**
    santa-loop 도 같은 형태다 — `plugins/mccp/commands/santa-loop.md:293-294` 에 `$BEGIN_EXIT`
    를 읽는 **실제 셸 분기가 존재하지만 다른 fence** 라, 결함은 "분기 부재"가 아니라
    cross-fence 상태 소실이다.
  - **S2 — 비차단 호출은 분기 종결자가 될 수 없다.** 비차단 접미사로 끝나는 명령 뒤의 첫
    유효 줄이 `fi` 이거나 블록 끝이면 위반. 분기의 exit status 가 항상 0 이 되어 **실패한
    검사가 통과로 읽힌다.** 헬퍼 본문은 호출부가 exit 하면 면제 — 기존 F1 이 쓰는 escape 를
    그대로 계승한다. 실측 후보 **7건**: `plugins/mccp/commands/plan.md:1252`(헬퍼 본문 — escape 적용 예상) ·
    `plugins/mccp/commands/pr.md:1398` · `plugins/mccp/commands/prp-implement.md:181` · `plugins/mccp/commands/prp-implement.md:1410` · `plugins/mccp/commands/santa-loop.md:517` ·
    `plugins/mccp/commands/work.md:60` · `plugins/mccp/commands/work.md:782`. escape 적용 후 잔존 수가 부채 상한이 된다.
  - **S3 — loud-fail-open 호출은 stderr 를 버릴 수 없다.** exit 0 을 계약으로 갖는 계측
    호출이 stderr 를 폐기하면 위반 — 그 호출의 유일한 신호 채널이 사라진다. 실측 후보
    **5건**: `plugins/mccp/commands/dashboard-audit.md:21` · `plugins/mccp/commands/milestone-close.md:32` · `plugins/mccp/commands/plan.md:1997` ·
    `plugins/mccp/commands/plan.md:2638` · `plugins/mccp/commands/work.md:316`.

  세 규칙의 후보를 전부 file:line 으로 열거하는 이유는, 열거가 없으면 부채 상한을 **사후에
  맞출 수 있어** `Validation` 의 "debt 길이가 상한과 같다"가 언제나 green 이 되기 때문이다.
  열거된 앵커가 규칙 출력과 어긋나면 그 자체가 red 다.
- **Mirror**: `quorum.js:134` — 판정은 순수 함수, I/O 없음.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/command-body-rules.test.js`.

### Task 3: 변이 test — 규칙이 실제로 잡는지 증명

- **Action**: 규칙마다 (a) 그 클래스를 위반하는 **합성 본문**에 정확히 1건을 보고하고,
  (b) 위반만 제거한 짝 본문에 0건을 보고함을 단언한다. 합성 본문은 실제 결함 이력의 형태를
  그대로 쓴다.
- **Mirror**: `plan-review-command-body.test.js` 가 결함마다 근거 주석을 남기는 형식.
- **Validate**: 같은 test 파일. **짝 단언이 없으면 규칙은 공허하게 green 일 수 있고**, 그것이
  M1 이 8건을 배송한 방식이다.

### Task 4: 부채 래칫 (`command-body/debt.js`)

- **Action**: 위 실측 위반을 `{file, line, rule, textDigest, why}` 로 **열거**하고 `SEAM_DEBT_CEILING`
  상수를 둔다. **`textDigest` 는 장식이 아니다** — 위치에만 결속하면 같은 파일·같은 줄에 같은
  규칙 클래스의 **다른** 위반이 들어설 때 면제가 그대로 승계된다. 커맨드 본문이 편집되면
  줄번호가 통째로 밀리는데(#9·#1.5 가 그 편집을 예고한다) 그 대량 재번호가 바로 신규 위반이
  조용히 흡수되는 지점이다. 규칙이 이미 `text` 를 산출하므로 버리지 않고 결속에 쓴다.
- **Action (cont.)**: `SEAM_DEBT_CEILING`
  상수를 둔다. 로드 시점 `assertShape` 가 길이 상한을 throw 로 강제하고, test 가 상한과 길이의
  일치를 짝으로 단언한다 — 항목을 늘리려면 **상수를 올리는 별도 편집**이 필요하고 그 숫자가
  diff 에 남는다. 반대 방향(고쳐졌는데 목록에 남음)도 실패로 보고해 화석을 막는다.
- **Action (cont. — `ASSERT_BASELINE`)**: 같은 모듈이 `{ '<test 파일명>': <assert 호출 수> }`
  를 export 한다. Validation 3b 가 이 값과 대조하므로 baseline 은 **커밋된 데이터**여야 하고
  산문 문서에 적힌 숫자여서는 안 된다 — 문서의 숫자는 비교되지 않으므로 그 검사는 실패할 수
  없는 게이트가 된다. 값은 Task 6a 가 교체 **전에** 측정해 채운다.
- **Mirror**: `env-contract/evidence-debt.js:107` 의 상한 + 로드시 강제 형태 축자.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/command-body-lint.test.js`.

### Task 5: `lint.js` run() + CLI

- **Action**: `run(repoRoot)` 가 `{ok, checks, debt, filesRead, filesExpected}` 를 반환한다.
  부채에 열거된 위반은 problems 에서 제외하되 **별도 `debt` 배열로 보고**한다(감춤이 아니라 분리).
  **부분 코퍼스는 zero-case 와 같은 무게로 실패한다** — `filesRead !== filesExpected` 이면
  problem 을 적는다. `filesExpected` 는 `plugins/mccp/commands/*.md` 의 실제 glob 개수이고,
  하드코딩 상수가 아니다(상수면 그 자체가 저장소 낡은 사실이 된다). 파일 0개만 막는 zero-case
  가드는 **부족하다**: 22개 중 5개만 읽어도 check 3개가 전부 통과해 게이트가 초록으로 보이는데,
  커맨드 파일이 개명·이동되면 정확히 그 형태로 seam 커버리지가 조용히 줄어든다.
  `env-contract/lint.js` 의 "read failure is drift, not a pass" 를 zero-case 로만 계승하면
  그 규칙을 절반만 가져온 것이다.
- **Mirror**: `env-contract/lint.js:245` 의 run 구조, `env-contract/lint.js:586` 의 exports/CLI.
- **Validate**: `node plugins/mccp/scripts/lib/command-body/lint.js --json` 이 exit 0 이고 check
  3개가 전부 통과이며 debt 길이가 상한과 같고 **`filesRead === filesExpected`** 다.

### Task 6: 기존 test 2개를 오라클 소비로 이전

- **Action (6a — 교체 전에 delta 를 먼저 잰다)**: 두 파일을 건드리기 **전에**, 신·구 추출기를
  같은 입력에 돌려 (i) bash 로 분류되는 줄 집합의 차이와 (ii) 각 기존 단언의 **모수 크기**
  변화를 측정해 `docs/diverse-agent-review/gate-wiring-oracle.md` 에 기록한다. S1·S2·S3 는
  실측으로 sizing 했으면서 이 축만 재지 않으면, 교체가 무엇을 바꾸는지 모른 채 교체하는 것이다.
  같은 단계에서 두 파일의 **assert 호출 수를 세어 `debt.js` 의 `ASSERT_BASELINE` 에 커밋**한다
  — 문서에만 적으면 Validation 3b 가 비교할 대상이 없다.
- **Action (6b — 교체 대상은 추출기 함수 하나가 아니라 fence 가정 전부다)**: 자체 추출기를
  삭제하고 `command-body/blocks` 를 require 하되, **같은 파일에 남은 다른 0칼럼 fence 가정도
  함께 옮긴다.** `plan-review-command-body.test.js:59` 의 F1 스캔은 블록 종결자를 자체
  정규식으로 판정하는데, 추출기만 넓히면 F1 루프가 **처음으로** 들여쓴 블록을 스캔하면서
  그 블록의 끝을 인식하지 못한다 — 들여쓴 닫는 fence(예:
  `plugins/mccp/commands/prp-implement.md:998`)가 매칭되지 않아 12줄 lookahead 가 블록을 넘어가
  뒤따르는 산문이나 다른 블록의 `exit N`·`}` 에서 해소된다. 그러면 **fail-open 을 막는 바로 그
  단언 안에 새 fail-open 이 생기고 화면상 green 이다.** 옮긴 뒤 각 스캔은 블록 경계를
  `blocks.js` 가 준 `{start, end}` 로만 판정하고 자체 정규식으로 재판정하지 않는다.
  **기존 단언은 한 건도 지우거나 완화하지 않는다.**
- **Action (6c — 조용한 통과 차단)**: `plan-review-command-body.test.js` 의 `sectionLines()`/
  `splitBash()` 는 `bashBlockLines()` 를 **prose/bash 판별자**로 쓴다(`:271-291`). 더 넓은
  추출기를 주입하면 지금 prose 로 분류된 줄이 bash 로 넘어가고, **prose 만 스캔하는 단언**
  (`:315-319`)의 모수에서 사라져 그 단언이 공허하게 green 이 된다 — 그 파일 자신의 주석
  `:264-269` 가 이 실패를 "a LINT THAT SILENTLY PASSES" 로 지목한다. 따라서 모수를 갖는
  단언마다 **모수 비공허 단언을 짝으로 추가**한다(`env-contract/lint.js` 의 "would pass
  vacuously" 가드와 같은 형태). 이 짝이 없으면 green 도 test 개수도 그대로인 채 방어가
  사라지므로 어떤 사후 검사로도 탐지되지 않는다.
- **Action (6d — delta ≠ 0 일 때의 정직한 선택지)**: 넓어진 커버리지가 새 위반을 드러내면
  **`debt.js` 등재만으로는 해소되지 않는다** — 두 파일의 단언은 `assert.deepEqual(offenders, [])`
  형태이고 면제 훅이 없어(`:64`, `:78`, `:93`, `:246`, `:304`) 부채는 신규 `lint.js` 만
  소비한다. 선택지는 셋뿐이고 전부 기록한다: (1) 그 단언에 **증거를 명시한 개별 면제**를 추가,
  (2) 그 단언만 구 추출기 유지(이전 범위 축소), (3) 그 위반이 실결함이면 backlog 이연.
  **단언 완화는 선택지가 아니다** — 그것이 이 파일들이 막는 fail-open 클래스 자체다.
- **Mirror**: 두 파일의 기존 test 이름과 근거 주석을 보존한다.
- **Validate**: 두 파일이 green 이고, **파일별 `assert` 호출 수가 이전 전보다 줄지 않는다.**
  test 개수는 지표가 아니다 — 한 test 안에 단언이 여럿이라(`:39-60`) 단언을 지우거나 느슨하게
  바꿔도 개수는 불변이고, 그것이 red 를 만났을 때 가장 값싼 해소책이다.

### Task 7: 미채택 규칙을 근거와 함께 기록

- **Action**: `docs/diverse-agent-review/gate-wiring-oracle.md` 에 규칙별 sizing 실측과
  **채택하지 않은 규칙**을 적는다. 핵심은 blanket cross-fence 변수 규칙 — "블록 A 에서 대입되고
  블록 B 에서 대입 없이 읽히는 변수"는 명세상 정확히 이 milestone 이 겨냥하는 결함 형태지만
  실측 **283건**(plan 76 · santa-loop 84 · prp-implement 43 · pr 25 · resume 24 · milestone-close 15 ·
  work 9 · meta-research 3 · plan-prd 3 · code-review 1)이라 lint 이 아니라 노이즈다. 다수가
  정당하다(본문이 재도출을 지시하거나 placeholder 치환을 전제한다). 근거 없이 임계를 만들지
  않고(UI3) **미채택으로 기록**하며, S1 은 그 중 판정 가능한 부분집합만 좁혀 취한 결과다.
- **Mirror**: PRD #7 이 "발화가 아니라 발화 불가의 원인"을 산출물로 남긴 형식.
- **Validate**: 문서에 적은 sizing 수치를 **재측정으로 대조**한다 — 신규 오라클의
  `--json` 출력에서 얻은 S1/S2/S3 위반 수와 문서 표의 수가 일치하고, 미채택 규칙의 283건이
  문서에 파일별 내역과 함께 남아 있을 것.

  > **이 자리에 `cli.js l1 --plan <이 plan>` 을 두지 않는다.** L1 의
  > `ACTIONS_REQUIRING_ABSENCE = ['CREATE']`(`plugins/mccp/scripts/lib/plan-review/l1-check.js:69`)
  > 는 CREATE 대상이 **존재하면** `C3_CREATE_EXISTS` 를 낸다(`:334`). 이 plan 은 CREATE 행이
  > 7개이므로 구현이 끝난 시점에는 그 7건이 전부 위반으로 잡혀 원리상 통과할 수 없다.
  > L1 은 **plan 승인 시점의 게이트**이고 실제로 그 시점에 exit 0 으로 통과했다 — 구현 후
  > 다시 돌리는 것은 범주 오류다. 이 PRD 는 같은 함정을 이미 한 번 밟았다(PRD Evidence:
  > "L1이 `C3_CREATE_EXISTS` 4건으로 divergent(구현이 끝난 뒤라 CREATE 대상이 이미 존재)").

### Task 8: version 4면 동기 + PRD/CHANGELOG

- **Action**: `plugins/mccp/.claude-plugin/plugin.json` 을 `1.33.3` 으로, `html.js:1419` page-foot,
  `markdown.js:163` derived 줄, `CHANGELOG.md` 항목, PRD #5 행 status 와 Plan 셀. **PR 진입 직전
  §3.7 대로 재계산**한다 — 병렬 브랜치가 같은 번호를 선점할 수 있다.
- **Mirror**: CLAUDE.md §3.7 의 동기 4면 규칙.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` —
  기대값을 `plugin.json` 에서 파생하므로 footer 누락을 red 로 잡는다.

## Validation

```bash
# 1. 신규 오라클이 실코퍼스 전체를 읽고 3개 check 를 낸다.
#    filesRead === filesExpected 를 함께 검사한다 — 부분 코퍼스에서 공허하게 green 이
#    되는 것이 이 lint 의 가장 값싼 실패 모드다.
node plugins/mccp/scripts/lib/command-body/lint.js --json \
  | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));const k=Object.keys(j.checks||{});if(k.length!==3)process.exit(1);if(!j.ok)process.exit(1);if(!j.filesExpected||j.filesRead!==j.filesExpected)process.exit(1);console.log("checks="+k.join(",")+" read="+j.filesRead+"/"+j.filesExpected+" debt="+(j.debt||[]).length)'

# 2. 신규 test 3종 (변이 test 포함)
node --test plugins/mccp/scripts/lib/tests/command-body-blocks.test.js plugins/mccp/scripts/lib/tests/command-body-rules.test.js plugins/mccp/scripts/lib/tests/command-body-lint.test.js

# 3. 이전된 기존 test 2종이 여전히 green
node --test plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js plugins/mccp/scripts/lib/tests/review-single-pass-command-body.test.js

# 3b. 단언이 조용히 약해지지 않았다. **비교하고 비영점 exit 한다** — 숫자만 찍는 검사는
#     실패할 수 없는 게이트이고, 그것이 이 plan 이 막으려는 클래스 자체다. baseline 은
#     산문이 아니라 `command-body/debt.js` 의 `ASSERT_BASELINE` 로 커밋된다(Task 6a 가
#     교체 전에 기록). 세는 방법도 `grep -c` 가 아니다 — 그것은 매치 '줄 수'라 한 줄에
#     단언이 둘이면 완화가 보이지 않고 주석 안의 `assert.` 도 함께 센다.
node -e '
  const fs=require("fs");
  const {ASSERT_BASELINE}=require("./plugins/mccp/scripts/lib/command-body/debt");
  let bad=0;
  Object.keys(ASSERT_BASELINE).forEach(function(f){
    const src=fs.readFileSync("plugins/mccp/scripts/lib/tests/"+f,"utf8");
    const n=src.split(/\r?\n/)
      .filter(function(l){return !/^\s*(\/\/|\*|\/\*)/.test(l);})
      .reduce(function(a,l){return a+((l.match(/\bassert\.[a-zA-Z]/g)||[]).length);},0);
    const want=ASSERT_BASELINE[f];
    if(n<want){bad++;console.error("WEAKENED "+f+": "+n+" < baseline "+want);}
    else console.log(f+": assert="+n+" (baseline "+want+")");
  });
  process.exit(bad?1:0);
'

# 4. 게이트 배선 무손상 — plan-review suite 전체
node --test plugins/mccp/scripts/lib/tests/plan-review-l1.test.js plugins/mccp/scripts/lib/tests/plan-review-decide.test.js plugins/mccp/scripts/lib/tests/plan-review-quorum.test.js plugins/mccp/scripts/lib/tests/plan-review-record.test.js

# 5. 게이트 본문 diff 공집합 (빈 출력이 통과 — UI2)
git diff --stat origin/main...HEAD -- plugins/mccp/commands/

# 6. CLAUDE.md 3.5.1 — 이 브랜치가 삭제하는 파일이 없어야 한다 (빈 출력이 통과)
git diff --diff-filter=D --name-only origin/main...HEAD

# 7. version 4면 동기
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 8. 문서의 sizing 수치가 재측정과 일치한다 (Task 7)
#    구현 후 `cli.js l1 --plan <이 plan>` 은 두지 않는다 — CREATE 행 7개가 전부
#    C3_CREATE_EXISTS 로 잡혀 원리상 통과 불가다(Task 7 주석 참조). L1 은 plan 승인
#    시점의 게이트이고 그 시점에 이미 exit 0 으로 통과했다.
node plugins/mccp/scripts/lib/command-body/lint.js --json \
  | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));const d=(j.debt||[]).length;console.log("debt="+d)'

# 9. backlog parity — debt.js 의 각 항목이 backlog 에 대응 행을 갖는지 **기계로** 대조한다.
#    Acceptance 가 요구하는 대조를 산문으로 두면 §3.15 가 세운 선례(적재 불가면 진행 불가)를
#    계승했다고 말할 수 없다.
node -e '
  const fs=require("fs");
  const {SEAM_DEBT}=require("./plugins/mccp/scripts/lib/command-body/debt");
  const bl=fs.readFileSync(".claude/plans/codex-findings-backlog.md","utf8");
  const miss=SEAM_DEBT.filter(function(d){return bl.indexOf(d.file+":"+d.line)===-1;});
  miss.forEach(function(d){console.error("NOT IN BACKLOG "+d.file+":"+d.line);});
  if(miss.length)process.exit(1);
  console.log("backlog parity ok ("+SEAM_DEBT.length+" rows)");
'
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 새 규칙이 기존 위반을 대량 발견해 suite 가 붉어진다 | High | 실측으로 사전 sizing 완료(S1 5건 · S2 7건 · S3 5건). 283건짜리 blanket 규칙은 **채택하지 않는다**(Task 7). 남는 것은 Task 4 부채에 열거되고 상한이 diff 에 숫자로 남는다 |
| 부채 목록이 lint 을 무력화한다 — 전부 면제하면 green 이 무의미 | Medium | 변이 test(Task 3)가 규칙의 탐지력을 부채와 **무관하게** 증명한다. 면제 키는 **`(file, rule, textDigest)`** 이고 `line` 은 사람이 찾아가기 위한 **비결속 메타데이터**다 — 그래야 #9·#1.5 가 커맨드 본문을 편집해 줄번호가 밀려도 부채가 통째로 무효화되지 않는다. 고쳐진 항목이 목록에 남으면 red |
| 추출기 교체로 커버리지가 넓어져 기존 test 가 새로 붉어진다 | Medium | Task 6a 가 **교체 전에** delta 를 측정한다. `debt.js` 등재는 이 두 파일에 대해 해소책이 **아니다**(면제 훅이 없어 신규 lint 만 부채를 소비한다) — Task 6d 가 실제 선택지 셋을 열거하고, 단언 완화는 그 목록에 없다 |
| 추출기 교체가 prose 전용 단언의 모수를 비워 **조용히 green** 이 된다 | Medium | Task 6c — 모수를 갖는 단언마다 비공허 짝 단언을 붙인다. 이 실패는 green 도 test 개수도 바꾸지 않으므로 사후 검사로는 원리상 못 잡고, 짝 단언이 유일한 방어다 |
| red 를 만난 구현자가 단언을 완화해 해소한다 | Medium | Validation 3b 가 test 개수가 아니라 **assert 호출 수**를 baseline 과 대조한다 — 한 test 안에 단언이 여럿이라 개수는 완화에 대해 불변이다 |
| 오라클이 잡은 5건이 실제 게이트 결함인데 고치지 않고 이연한다 | High | **의도**다 — UI2 가 추출 전 배선 변경을 금한다. backlog 에 파일·줄과 왜 죽은 분기인지를 적어 이연하고 PR 본문에 명시한다. 고치는 것은 별개 축이다 |
| version 1.33.3 을 병렬 브랜치가 선점한다 | Medium | CLAUDE.md §3.7 — 머지 해소 시점과 PR 진입 직전 두 번 재계산, 4면 재동기 |
| 규칙 3종이 28건 seam 결함 중 일부만 덮는다 | High | 사실이며 주장하지 않는다. M5 는 "seam 결함을 없앴다"가 아니라 **"이 세 클래스가 test 사거리 안으로 들어왔다"**를 주장한다. 커버리지 하한을 문서에 명시한다 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)

라이브 완주가 산출해야 하는 것 (UI8 — 산출물을 명시한다):

- `node plugins/mccp/scripts/lib/command-body/lint.js --json` 이 `plugins/mccp/commands/*.md`
  **전부**를 읽고 exit 0 과 check 3개, debt 배열을 stdout 으로 낸다. 판정은 산문의 숫자가 아니라
  **`filesRead === filesExpected`** 이며 `filesExpected` 는 glob 실측이다 — 현재 그 디렉토리에는
  `.md` 가 **22개** 있고 그중 **20개**가 bash 블록을 갖는다(둘 다 실측). 여기에 리터럴 수를 적으면
  그 자체가 다음 사이클의 낡은 사실이 되므로 acceptance 는 glob 대조로 표현한다.
- 변이 test 가 규칙 3종 각각에 대해 **red 1건 / green 1건**을 실제로 보고한다.
- `git diff --stat origin/main...HEAD -- plugins/mccp/commands/` 가 **공집합**이다.
- 이전된 기존 test 2종의 **assert 호출 수**가 Task 6a 가 기록한 baseline 보다 줄지 않는다
  (test 개수는 단언 완화에 대해 불변이라 지표가 아니다).
- 이연한 seam 결함이 `.claude/plans/codex-findings-backlog.md` 에 **실제로 적재**됐다 —
  `debt.js` 의 각 항목이 backlog 에 대응 행을 갖는지 대조한다(§3.15 `assert-backlog-parity`
  선례: 적재할 수 없으면 진행하지 않는다). 이연은 "고치지 않는다"이지 "기록하지 않는다"가 아니다.

## 주장하지 않는 것

- **자동 발동 지점을 만들지 않는다.** 신규 lint 과 test 는 어떤 CI workflow 에도 어떤 hook
  에도 등재되지 않는다 — `.github/workflows/` 에는 `axis-k-m2-cross-platform.yml` ·
  `gitignore-drift.yml` 2건뿐이고 합쳐 test 3개만 돌리며, `.claude/settings.json` 에 hooks
  블록이 없다. 따라서 이 오라클은 **사람이 `## Validation` 을 돌릴 때만 돈다.** 이는 CLAUDE.md
  §3.17 이 `env-contract/lint.js` 에 대해 "어떤 CI 도 돌리지 않으므로 강제 지점은 사이클의
  `## Validation` 이다"라고 이미 명시한 것과 같은 천장이다. 리뷰어 둘이 독립적으로 이 축을
  지목했고 반박하지 않는다 — UI1 의 "test 사거리 안으로 이동"이 뜻하는 것은 **단위 test 가
  원리상 닿을 수 있게 됐다**이지 **자동으로 돈다**가 아니다. 발동 지점 배선은 그 자체로 배선
  추가라 UI2 대로 #5 뒤 축이다.
- **28건 seam 결함을 없앴다고 주장하지 않는다.** 규칙 3종이 덮는 것은 세 클래스뿐이고,
  가장 큰 형태(blanket cross-fence)는 실측 283건이라 미채택했다(Task 7).
- **발견한 결함을 고치지 않는다.** S1/S2/S3 가 찾은 것은 backlog 로 이연한다(UI2).
  그중 `plugins/mccp/commands/prp-implement.md:984`/`:996` 은 ultracode phase lock 획득 실패 경로라 **서식 오류와
  같은 무게가 아니다** — 이연 행에 그 severity 를 구분해 적는다.

## Design Critique

detector가 design_signal=true를 낸 근거는 `signal_files` 3건이고, 그 전부가
`plugins/mccp/scripts/lib/renderer/` 경로 whitelist 히트다. 실제 design-surface delta는
`html.js:1419` page-foot 문자열과 `markdown.js:163` derived 줄의 **version 리터럴 2개**이며,
§3.7이 요구하는 4면 동기의 두 면이다. 렌더 표면에 새 구조·색·목록·heading을 추가하지 않는다.

R0 critique — SKILL.md `## Output Constraints` 4개 anchor 대조:

| Anchor | 판정 | 근거 |
|---|---|---|
| 정보 위계 3단계 (heading depth ≤ 3) | pass | footer 문자열 변경은 heading을 만들지 않는다. 이 plan 본문 자체의 최대 depth도 3(`###`)이다 |
| 강조색 화면당 1개 | pass | color·highlight token 미변경 |
| raw markdown marker 금지 | pass | 기존 문자열 안의 version 리터럴 치환뿐이라 새 marker가 렌더 표면에 도달하지 않는다 |
| 한 화면 항목 수 상한 | pass | 렌더 표면에 list-of-N 섹션을 추가하지 않는다 |

verdict **CONVERGED** (round 0/2, `decideCritique` 오라클 판정 · rounds=1).

이 판정이 주장하지 않는 것: 대시보드의 기존 디자인 품질. 이 loop은 **이 plan이 도입하는
delta**만 대조하며, delta는 version 리터럴 2개다.

## Design Routing Guide

routing mode: auto (implement 단계에서 유효). plan 단계는 렌더된 UI가 없어 어떤 impeccable
명령도 호출하지 않고 체크리스트로만 기록한다.

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
