# Changelog

All notable ship milestones for **my-claude-code-plugin (mccp)** are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

> **Note on versioning**: the project ship tag (e.g. `v1.0.0`) and the inner plugin manifest (`plugins/mccp/.claude-plugin/plugin.json` — currently `1.34.2`) are intentionally decoupled. Plugin semver tracks the mccp namespace's internal API surface; project ship tags track W-VERDICT-gated milestones bundled across the repo.

## [1.34.2] — 2026-09-02

> **§3.7**: `1.34.1 → 1.34.2` (**patch** — review-record-linkage PRD의 단일
> milestone M1이고 PRD 종료 축이 아니다). 이 번호는 **두 번 재상향됐다**: 브랜치는
> 1.33.8을 선언했으나 origin/main이 그사이 1.33.7과 1.34.1을 발행했다. §3.7이
> 머지 해소 시점과 `/mccp:pr` 진입 직전 두 번 재계산을 의무화하는 이유가 이
> 사이클에서 실측됐다 — 첫 계산은 산출 당시 이미 stale이었다.

### Added

- **review-record-linkage M1 — linkage-baseline-parser (정의 고정 milestone)**:
  `plan-review/linkage-defs.js`(순수 · dep-free · `require` 0건)가 세 판정 기준을
  코드로 소유하고, `linkage-audit.js`(read-only · LLM-free · standalone,
  `evidence-audit.js` 형태 미러)가 그것을 소비해 과거 코퍼스를 동결 보고한다.
  **쓰기 0건 · 게이트 배선 무접촉**(receipt/write·cli·schema·hash ·
  plan-review/record·corpus · 게이트 본문 3종 diff 공집합, 기계 확인).
  - D1 라운드 구조 = `measurement.rounds` 정수 ≥ 1. 5개 후보 중 **오늘 값이 가장
    낮은**(0/42) 정의를 골랐고, 대조값 5종이 `ROUND_STRUCTURE_CONTROLS`로 코드에
    상주해 매 실행마다 함께 출력된다(기준 게이밍의 직접 반증).
  - D2 리뷰 대상 ship = 3값이며 경계 트리의 75건은 **전건 `undecidable`**.
    `plan_hash` 75/75 · `meta.command` 상수 75/75 · `resolution.review_verdict`
    0/75 · 상류 plan receipt는 git에 한 번도 tracked된 적 없음 — 판정 수단이
    없다는 관측이지 0이 아니다. "패널 레코드가 있으면 리뷰 대상"은 분모를 분자로
    정의하므로 명시 거부했다.
  - D3 층간 링크 = **구조적 위치**에서만(receipt `meta.review_record_path` ↔
    레코드 `measurement.receipt_hash`). 양방향 각 0이고 **분모는 `null`**이다
    (아래 PR-Codex R1 흡수 참조). 그 조인이 파일명 관례라는 사실과 그로 인한
    구조적 천장(`filename_convention.match` 27/75)을 `linkage.join` ·
    `join_note`가 매 실행마다 함께 싣는다.
- **PR-Codex R1 흡수 — 지표 2의 분모가 자격 집합이 됐다(UI2).** 초판은
  `classifyShipEligibility`로 자격을 판정해 놓고 링크 분모로는 `pre.ships.length`를
  썼다. 같은 실행이 75건 전건을 `undecidable`로 판정하므로 동결 산출물이
  `undecidable: 75`와 `denominator: 75`를 나란히 실었고, 읽는 사람이 `0/75`를 유효
  링크율로 오독할 수밖에 없는 표면이었다. 이제 분자는 **자격 집합 위에서만** 세고
  분모는 그 크기이며, 집합이 비면 `null`이다 — `0`은 "리뷰 대상이 없다"는 **판정**,
  `null`은 "판별 수단이 없다"는 **관측**이라는 구분이 D2가 `undecidable`을 0으로
  접지 않는 것과 같은 형태다(DD2). `linkage.scope` · `linkage.coverage`가 그 사실을
  기계로 나르고, human render는 비율 대신 `RATE NOT COMPUTABLE`을 인쇄한다.
  **이 분모는 어느 test도 고정하지 않고 있었다**(실측 `denominator` 단언 0건) —
  자격 0건·자격 2건 양방향 회귀 test 2건을 추가했다.
- `docs/review-record-linkage/frozen-baseline.md` — `--frozen-only` 출력을 **축자
  동결**하고 그 위에 정의 선택 근거를 적은 앵커 문서. `linkage-frozen-baseline.test.js`가
  도구를 실제로 spawn해 바이트 비교하므로 동결이 산문이 아니다.

### Changed

- `.claude/prds/review-record-linkage.prd.md` — **M2 `rounds-channel`을 `dropped`로
  판정**했다. `env-contract-integrity M3`가 그 outcome을 이미 출시했음을 기계
  확인했다: `write.js`가 round ledger에서 `resolution.rounds`를 파생하고(gate 무관),
  증분 채널이 둘 실재하며(`codex-invoke.js` · `plan-review/cli.js`), 세 게이트
  본문이 전부 round 정책을 seal한다. 이 PRD 자신의 M1 게이트가
  `resolution.rounds: 3`을 봉인한 것이 end-to-end 실증이다. **MVP는 M1 단독**이 된다.
  같은 커밋에서 M2 dropped 주석을 Delivery Milestones 표 **아래로** 옮겼다 — 표
  중간의 blockquote가 파서 3종(`archive-complete/scan.js` · `renderer/parsers/plan-body.js` ·
  `goal-detect.js`)을 2행에서 끊어, `archive-complete`가 M3·M4가 pending인 PRD를
  `archivable: true`로 판정하고 있었다.

### Notes

- **동결은 트리다 — 파티션이 아니다.** 초판은 살아 있는 작업 트리를 자기신고
  타임스탬프로 pre/post 파티션했고, santa-loop 라운드 0에서 두 리뷰어가 독립적으로
  그 설계가 자기 주장을 만족하지 못함을 보였다: 경계 커밋이 이 브랜치의 조상이
  아니라 트리가 달랐고(그 ref의 트리는 ship 75건, 도구는 71건을 셌다), 그 차이가
  어느 카운터에도 없이 `state: "ok"`로 보고됐다. 이제 멤버십을 고정 SHA의 트리가
  정한다(`git ls-tree -r` + `git show <ref>:<path>`). 그 결과 병합 드리프트 ·
  `measurement.recorded_at` 가변성 · `filename_convention` 미스코프가 함께 닫혔다.
  - 초판이 이 자리에 적었던 "ship 71/71 선행, 기계 확인"은 **삭제했다** — 실측하면
    그 ref의 트리는 75건이라 거짓이었고, 멤버십이 날짜와 무관해진 지금은 그 문장이
    참이어야 할 이유도 없다. 경계 ref는 전체 40-hex SHA로 고정했다.
  - `undated_at_baseline` → `unreadable_at_baseline`. 날짜가 멤버십을 정하지 않으므로
    "날짜 없음"은 더는 결손이 아니고, 남는 결손은 읽기/파싱 실패뿐이며 그것은
    건수가 아니라 **파일명으로** 실린다. 코퍼스 전역 `undated`는 개념째 사라졌다 —
    `--json` 출력에 그 키가 없다.
  - `--frozen-only`의 `baseline.state`가 이제 blind · read_error · parse_failure를
    반영한다. 초판은 그 셋을 전역 `state`에만 실어, 코퍼스를 통째로 못 본 실행이
    `ok` + exit 0 + 전 필드 0인 블록을 내보냈다.
- plan 게이트는 패널 3라운드 후 §3.15 단일통과(`deferred_to_prd_completion`)로
  종결했고, `resolution.review_verdict`는 **`divergent` 그대로 봉인**됐다.
  구현 후 `/mccp:santa-loop`을 2라운드 돌려 라운드 0의 blocking 13건을 전부
  흡수했다(라운드 1에서 재발 0건). 루프는 `patch_chasing`으로 종료돼
  `mccp-santa-review` receipt가 `divergent` + `santa_model_degraded: true`
  (`same_family` — codex 사용량 한도로 리뷰어 B가 opus fallback)로 봉인됐다.
  라운드 1의 잔여 지적은 이 커밋이 흡수했고 패널은 재발화하지 않았다.

## [1.34.1] — 2026-09-01

> **§3.7**: `1.34.0 → 1.34.1` (**patch** — multi-session-work-loop PRD의 단일
> milestone M10). base가 `1.33.6`인데 `1.34.1`을 선언하는 것은 **번호 갭이 아니라
> 같은 PR 안에서의 순서 유지**다 — M9(`1.34.0`)와 M10(`1.34.1`)은 원래 두 PR로
> 나뉘어 있었으나 PR #164 하나로 합쳐졌고, 두 항목은 그 PR 안에서 M9 → M10 순으로
> 착지한다. M10이 이 PRD의 마지막 milestone이지만 minor가 아닌 이유는 M9가 (당시
> PRD 종료로 판단해) 이미 `1.34.0` minor를 소비했고, M10은 그 뒤에 신설된 milestone
> 하나이기 때문이다. §3.7의 "애매하면 patch가 보수적 default"를 따른다.

### Added

- **multi-session-work-loop M10 — 부채 정산과 종결 경로.** 세 원장(backlog 936 ·
  findings 레지스트리 178 · fix-task 1)을 단일 인벤토리로 정규화해 **분모 1115건을
  봉인**하고(`docs/multi-session-work-loop/debt-inventory.json`), 그 전건에 처분을
  기록하는 append-only 원장(`debt-dispositions.jsonl`)을 붙였다. 각 처분 줄은
  `inventory_sha256`에 결속되므로 봉인을 지우고 다시 만든 경우가 조용히 통과하지
  않는다. 완료 판정은 [m10-coverage-gate.js](plugins/mccp/scripts/lib/msw-metrics/m10-coverage-gate.js)의
  exit 0이다(봉인 결속 · 처분 완전성 · 의도 위반 레코드 · flip 교차검증 4축).
- **처분 어휘 6종과 승격 억제의 분리.** `fixed`·`obsolete`·`superseded`·`duplicate`만
  SessionStart 승격을 억제하고 `deferred`·`rejected`는 억제하지 않는다 — 레지스트리의
  `RESOLVING_CLOSURE_TYPES`가 코드로 세운 경계를 그대로 미러한다. plan은 이 구분 없이
  "처분된 finding을 목록에서 내린다"고 적었고 L2 세 관점(architect·security·invariant)이
  각각 HIGH를 냈다: 미수정 CRITICAL이 `deferred`만으로 다음 세션 목록에서 사라지면
  M7 불변식이 모든 게이트가 green인 채로 꺼지고, C1은 승격을 보지 않으므로 탐지 수단이
  없다. 억제는 fail-open이다(원장 부재·판독 불가 → 아무것도 억제하지 않음).
- **`debt-deferred-{critical,high,minor}.md`** — 983건의 이연이 무엇을 왜 판정하지
  못했는지 적는 successor 3종. successor는 실재만으로 부족하고 **봉인 digest를 본문에
  담아야** 한다(M9 gate가 자기 소스에서 지목한 "커밋된 정적 파일은 영원히 참" 함정 차단).
- **`intent-violation-ledger.json`** — 선언과 실제가 어긋난 6축. `declaration-corrected`
  항목은 파일 실재가 아니라 **문장 실재**로 검증된다.

### Changed

- `derive/sources/backlog.js`가 `closed_count`/`open_count`/`resolved_count`를 낸다.
  4열 스키마와 표 본문은 무변경이다(`rowId`가 행 본문 해시라 한 글자만 바뀌어도 모든
  처분 결속이 끊긴다). `closed`는 **처분됨**이지 해소됨이 아니며, 그 구분을 위해
  `resolved_count`가 따로 있다. `splitRow`·`isRowShaped`·`rowId`·`COLUMNS` export.
- CLAUDE.md §3.16에 라운드 계수의 한계를 명시(`IV1`) — 캡은 `(게이트, decision)`으로
  강제되지만 dispatch 원장의 `round_index`는 같은 plan hash 안에서만 증가하므로,
  plan을 고쳐 재실행한 라운드는 **원장에서 라운드로 보이지 않는다**.

### Fixed

- **C2 귀속 줄이 미측정을 "0건"으로 보고하던 문제** (`renderer/sections/msw-metrics.js`).
  같은 파일 A3·B3는 `typeof === 'number'` 가드를 쓰는데 이 줄만 `|| 0`이라, 비숫자가
  문자열 연결에 그대로 실릴 수 있었고 더 나쁘게는 **읽지 못한 값이 0으로 단정**됐다.
  없는 값은 `?`로 낸다. 실제 0은 여전히 0이다. (M10 인벤토리에서 still-valid로 남은
  CRITICAL 1건의 실수정.)

### Measured

- C1은 `computed 0/178`로 **불변**이다. 처분 1115건이 레지스트리를 오염시키지 않았음이
  실증됐다 — `computeC1`이 work-unit 귀속 검사 없이 계산하므로, 다른 작업 단위의 finding을
  닫으면 정의상 분자가 아닌 것이 분자로 계상된다. 그래서 처분은 레지스트리 **밖**에 쌓는다.
- 처분 분포: `deferred` 983 · `superseded` 111 · `duplicate` 19 · `fixed` 1 · `obsolete` 1.
  **backlog는 미해소 목록이 아니라 판정 이력이 섞인 원장**이다 — CRITICAL 65행을 전건
  읽은 결과 대다수가 이미 판정된 기록(triage·기각·흡수)이었고 어떤 기계 원장도 그것을
  기록한 적이 없었다. M10이 겨냥한 비대칭은 "부채가 안 고쳐진다"보다 **"고친 사실이
  기계가 읽을 수 있는 흔적을 남기지 않는다"** 쪽이 크다.
- 판정 범위는 **CRITICAL 우선**이며 운영자 결정이다. 봉인 분모가 plan 추정(~800 · 개별
  판정 대상 37)이 아니라 1115건 · 448건으로 확인된 뒤 정해졌다. HIGH 이하는 이연이고
  그 사실은 successor 문서가 그대로 적는다.

## [1.34.0] — 2026-08-27

> **§3.7**: `1.33.7 → 1.34.0` (**minor** — multi-session-work-loop PRD 전체
> 종료. M9가 마지막 milestone이고 M1~M8은 이미 ship됐다). 4면(plugin.json ·
> html.js page-foot · markdown.js derived 줄 · 이 파일의 currently 노트) 동기 완료.
>
> **PR 진입 직전 재계산(§3.7 (b))**: 분기 시점의 base는 `1.33.1`이었으나 그 뒤
> main이 `1.33.2`~`1.33.7`을 발행했다(머지 2회 사이에도 두 번 더 전진했다). 목표 `1.34.0`은 **충돌하지 않으므로
> 그대로 둔다** — 상향이 필요한 것은 이미 발행된 번호와 겹칠 때뿐이고,
> 이 항목은 minor 자리에 있어 main의 patch 행진과 서로 어긋나지 않는다.

### multi-session-work-loop M9 — 아카이브 조건 충족

M4·M5·M8이 status 셀 안에 남긴 미충족 인정 조건을 판정해 닫거나 증거와 함께 개정하고,
PRD를 아카이브 가능한 상태로 만든다.

- **A3 측정 경로 복구** — tiktoken import 실패 시 자식이 먼저 죽어 stdin write가 broken
  pipe에 떨어지는데, 그 비동기 `error` 이벤트에 리스너가 없어 프로세스가 죽었다
  (`Error: write EOF`). 리스너를 등록해 크래시를 분류 가능한 rejection으로 바꾸고,
  "인터프리터 부재"(`baseline-unavailable`)와 "토크나이저 부재"(`error`)를 분리했다.
- **C1 종결 producer** — 패널 경로가 finding을 열기만 하고 닫지 않아 라운드마다 영구 open이
  쌓였다(12 → 24 → 66). backlog 적재를 `deferred` 종결로 기록한다. `deferred`는 RESOLVING이
  아니라 폐쇄율을 부풀리지 못한다. 열린 적 없는 항목(합성 `verdict=fail` 행)은 유령 레코드를
  만들지 않도록 skip한다.
- **M7 미판정 12건 판정** — 전부 ship된 계획에 대한 지적이라 현재 코드에서 실현 여부를 확인했다.
  fixed 4 · invalidated 1 · deferred 7. C1이 **0/66 → 5/66**으로 이 PRD 최초의 비영점
  폐쇄율을 냈다.
- **C2/C3 귀속 기계화** — `pr.md`가 빈 리터럴 두 개를 하드코딩하고 산문으로 채우라고 해
  emit이 한 번도 발화한 적이 없었다. `mccp-state findings-unattributed` 파생으로 교체.
- **A2 조사** — 후보 4종 실측. 분자(토큰 회계)는 접근 가능하나 분모(창 크기)를 하네스도
  저장소도 노출하지 않으며, 유일한 상수(200,000)를 적용하면 최근 세션 5건 전부 잔여가
  음수다. `forward-only` 유지 + 인정 조건 개정.
- **m9-coverage-gate** — 술어를 평가만 하면 보고서일 뿐이라, PRD에서 실제로 정본화된 행을
  읽어 그 행의 술어와 교차 검증하고 하나라도 거짓이면 비영점으로 답한다.
- **PRD 정본화 + 순환 해소** — M9의 완료 판정이 `/mccp:archive-complete` 성공으로
  **정의**돼 있어 §3.11 C3와 순환했다(M9가 in-progress인 한 아카이브 거부, 아카이브가
  성공해야 M9 flip). 완료 판정을 "술어 통과 ∧ status 정본화"로 옮기고 라이브 완주는
  그 **검증**으로 격하했다. `scan.js`가 `archivable: true`(9/9)를 보고한다.
- **history-leak-scan allowlist 4번째 항목** — M9 스냅샷(`m9-after.json`)이 backlog를
  파생 캡처하면서 이미 면제된 2번 항목의 줄을 두 번째 경로로 **그대로 복사**했다.
  allowlist는 경로별로 평가되므로(설계대로) 그 복사본이 pre-push 게이트를 차단했다.
  같은 고유 인용(`history-leak-scan.js:90`)을 키로 스냅샷 경로 한 줄만 면제한다 —
  두 항목이 같은 키를 쓰므로 그 finding이 재작성되면 **함께** 만료되고, 같은 바이트를
  가진 sibling 스냅샷은 여전히 차단된다(회귀 test가 두 성질을 함께 단언).
- **PR-Codex R1 지적 2건 흡수 (PR #164)** — 두 HIGH 모두 실재로 확인돼 수정했다.
  - **F2 · `a3Ok` 술어** — 정책 문서의 *존재*만 보던 술어가 A3의 미산출 **사유**를
    대조하지 않아, 토크나이저 부재든 무관한 회귀든 같은 문을 지났다. 정책이 sanctioned로
    설명하는 미산출은 정확히 둘(`error`+tiktoken · `insufficient`+봉인쌍 staleness)이므로
    그 둘을 분류로 대조하고 나머지는 거부한다. 정책 파일은 필요조건으로 남되 충분조건이
    아니게 됐다. gate가 *분류*를, `msw-metrics.test.js`가 *동작*(크래시 대신 정직한
    미산출)을 소유하는 분업을 코드에 명시했다.
  - **F1 · UI7·UI8 미이행** — 두 제약이 plan의 User Intent 표에만 있고 이행 기록 없이
    M9가 정본화됐다. status를 되돌리는 대신 미이행을 실제로 닫았다:
    `m9-final-review-scope.md`가 부모/자식 관계를 실측하고(선언된 자식 PRD **0건**,
    유일 참조는 선례 인용), 활성 PRD 전량의 처분과 최종 검토자의 판단 3가지를 적는다.
    PRD M9 행 Outcome에 포인터를 걸어 결속을 유지하고, 게이트가 이를 놓친 이유
    (`MCCP_PLAN_REVIEW=multi-agent`의 intent 축 carve-out)를 `## 순서의 근거`에 남겼다.
## [1.33.7] — 2026-09-01

> **§3.7**: `1.33.6 → 1.33.7` (**patch** — release-channel-separation PRD의 단일 milestone
> M1이고 PRD 종료 축이 아니다). 이 bump는 4면 동기 의무일 뿐 아니라 **M1의 계측
> 도구**다 — main이 이 번호로 앞서 나갔는데 사용자 설치 version이 `1.33.6`에 머무는
> 것이 채널 분리가 실제로 작동했다는 증거다(성공 지표 3). 4면(plugin.json ·
> html.js page-foot · markdown.js derived 줄 · 이 파일의 `currently` 노트)을 함께
> 맞췄고 `i18n-surface.test.js`가 재검증한다. 병합 시점 origin/main이 `1.33.6`이었고
> sibling worktree 하나가 `1.34.0`(minor)을 선언 중이라 patch 자리가 비어 있었다.

### Changed

- **release-channel-separation M1 — channel-pin**: `.claude-plugin/marketplace.json`의
  plugin `source`가 상대 경로 `"./plugins/mccp"`에서 `git-subdir` + `url` + `path` +
  `ref: release`로 전환됐다. **`sha`는 pin하지 않는다**(UI5) — 릴리스가 manifest 편집이
  아니라 `release` 브랜치를 fast-forward하는 행위가 되도록 하기 위함이다. 공식
  marketplace 코퍼스 291건 중 `ref` 사용 84건은 **전부** `sha`를 함께 pin하므로
  (`oracle/netsuite-suitecloud-sdk`의 `ai-plugins-dist` 포함) 이 형태는 스키마가
  허용하되 선례가 없는 쪽이다. 그 차이가 라이브 검증을 이 마일스톤의 핵심 산출물로
  만든다.
- 그 결과 **main 머지가 plugin 본문을 배포하는 일이 끝났다.** 다만 닫히는 표면은
  하나지 둘이 아니다 — `known_marketplaces.json`의 mccp 항목에는 `ref`가 없어
  marketplace clone은 계속 main을 추종하므로, `marketplace.json` 자체의 편집은 여전히
  머지 즉시 사용자에게 도달한다. 그 잔여는 사용자의 재등록을 요구하므로 M3 소유다.
- `README.md` 설치 절과 `CLAUDE.md` §3.7에 채널 사실과 **번호 소유자 이전**을 기록했다.
  §3.7의 major/minor/patch 판정 기준 자체는 불변이다(UI8).

### Added

- `release` 브랜치(`647dfec` = v1.33.6)와 롤백 좌표 태그 `mccp--v1.33.6`을 origin에
  생성했다. UI5가 `sha` pin을 포기한 대가를 태그가 갚는다 — 브랜치가 움직여도 되돌릴
  지점이 남는다.

## [1.33.6] — 2026-09-01

> **§3.7**: `1.33.5 → 1.33.6` (**patch** — diverse-agent-review PRD의 단일 milestone
> M5이고 PRD 종료 축이 아니다). **§3.7 "forward-only 상향"의 8번째 재발이다** — 이
> 항목은 작성 시점에 `1.33.3`을 선언했고 그때는 비어 있었으나, `/mccp:pr` 진입 직전
> `origin/main`을 병합하자 main이 env-contract-integrity M1~M3을 `1.33.3` · `1.33.4` ·
> `1.33.5`로 이미 발행한 상태였다. `1.33.3`은 **정면 충돌**(헤딩 중복)이므로 발행된
> 번호를 불가침으로 두고 미머지인 이쪽만 발행 최대치 위로 밀었다.
>
> 직전 기록(1.33.5)이 "재계산 시점은 (a) 머지 해소 때와 (b) `/mccp:pr` 진입 직전 두
> 번"이라 적어 두었고, 이 항목은 그 (b)가 실제로 값을 바꾼 사례다 — 작성 시점의
> 예측치로 고정했다면 CHANGELOG에 `## [1.33.3]` 헤딩이 둘 생겼을 것이다.
>
> 4면(plugin.json · html.js page-foot · markdown.js derived 줄 · 이 파일의 `currently`
> 노트)을 함께 맞췄고 `i18n-surface.test.js`가 재검증한다.

### Added

- `plugins/mccp/scripts/lib/command-body/` — 게이트 배선 seam lint 오라클 4모듈.
  `blocks.js`가 저장소에 넷 있던 셸 블록 추출기를 정본화하고(유일하게 옳던
  `command-tmp-worktree-safe.test.js:39`를 승격), `rules.js`가 실측에서 도출한 seam 규칙
  S1/S2/S3를 순수 함수로 구현하며, `debt.js`가 기존 위반 18건을 `(file, rule, textDigest)`
  키로 열거하고 `SEAM_DEBT_CEILING` 래칫을 로드 시점 throw로 강제하고, `lint.js`가
  `run(repoRoot)` + `--json` CLI를 낸다.
- test 3종 — 추출기 계약(dedented closer·미종료 블록·EOF fixture), 규칙별 **변이 test**
  (합성 위반에 red 1건 / 위반만 제거한 짝에 green 0건), 실코퍼스 + 부채 래칫 양방향.

### Changed

- `plan-review-command-body.test.js` · `review-single-pass-command-body.test.js` — 자체
  추출기를 제거하고 정본 오라클을 소비한다. 기존 단언은 축자 보존했고, F1 lookahead의 블록
  종결 판정을 0칼럼 fence 정규식에서 오라클의 `{start, end}`로 옮겼다(들여쓴 닫는 fence를
  못 보면 lookahead가 블록을 넘어가 **fail-open을 막는 단언 안에 새 fail-open이 생긴다**).
  모수를 갖는 단언에 비공허 짝을 추가했다(assert 46 → 48 · 42 → 42).

### Fixed

- `/mccp:code-review` 로컬 리뷰 흡수 6건 (모두 M5 신규 코드 내부 — 게이트 본문 무편집 유지).
  - **H1** — S2의 분기 종결자 집합이 `fi`+블록 끝뿐이라 **같은 if/else의 반쪽을 놓쳤다**
    (`prp-implement.md:1410`은 등재, 구조가 동일한 `:1408`은 불가시). 종결자는 실측 열거가
    아니라 의미 클래스이므로 `else`·`elif`·`done`·`esac`·`;;`로 넓히고 첫 토큰으로 판정한다
    (`done < "$f"`). 실측 S2 5 → 8, `SEAM_DEBT_CEILING` 15 → 18 — 배선이 나빠진 게 아니라
    규칙이 넓어진 것이다.
  - **M1** — `stripLexical`이 인용 구분자 heredoc(`<<'EOF'`, 코퍼스 8건)을 감지하지 못했다.
    `scrubQuotes`가 구분자를 지운 뒤 감지해서 본문이 코드로 스캔됐고, 본문의 `$VAR`가 유령
    read가 되어 S1이 죽은 캡처를 놓쳤다. 인용 구분자는 원시 줄에서 먼저 받는다(인용 없는
    `<<EOF`는 홑따옴표 안 데이터일 수 있어 정제 줄 판정 유지). 실코퍼스 결과는 수정 전후
    동일 — 활성 사례가 0이었을 뿐 잠재는 실재했다. 함께, 놓치는 방향이 "언제나 위반을 더
    보고하는 쪽"이라던 주석은 **S1에 대해 거짓**이라 정정했다.
  - **M2** — `ASSERT_BASELINE`에 코드 소비처가 없어, 나란한 `SEAM_DEBT_CEILING`이 짝 단언으로
    기계 강제되는 동안 baseline만 강제가 없었다(유일 대조가 plan 본문 셸 스니펫이고 그 plan은
    §3.11대로 archived/로 간다). 두 파일의 `assert.` 수를 세어 대조하는 단언 추가.
  - **M3/L1/L2** — 문서 §4의 자기모순 문장 정정 + 알려진 한계 표로 확장 · backlog 5행의 누락된
    선행 파이프 복원 · `lint.js` CLI에 repo-root 탐색 추가(하위 디렉토리 실행이 코퍼스 오류로
    오진되던 문제)와 readdir 실패 시 중복 메시지 제거.

### Notes

- **게이트 본문은 한 줄도 바뀌지 않았다** — `plugins/mccp/commands/` diff가 공집합이고 그것이
  이 milestone의 기계적 acceptance 조건이다(UI2). 오라클이 찾은 18건은 전부
  `.claude/plans/codex-findings-backlog.md`로 이연했다.
- 이 lint은 어떤 CI에도 hook에도 등재되지 않는다 — 강제 지점은 사이클의 `## Validation`이며
  §3.17이 `env-contract/lint.js`에 대해 명시한 것과 같은 천장이다.
- 도출 근거·sizing 실측·미채택 규칙(blanket cross-fence)은
  [docs/diverse-agent-review/gate-wiring-oracle.md](docs/diverse-agent-review/gate-wiring-oracle.md).

## [1.33.5] — 2026-08-31

> **§3.7**: `1.33.4 → 1.33.5` (**patch** — env-contract-integrity PRD의 M3 하나이고
> PRD에는 M4~M6이 남아 있다). 4면(plugin.json · html.js page-foot · markdown.js
> derived 줄 · 이 파일의 `currently` 노트)을 함께 맞췄고 `i18n-surface.test.js`가
> 재검증한다.
>
> **§3.7 "forward-only 상향"의 7번째 재발이고, 이번에는 세 항목이 함께 밀렸다.** 이
> 브랜치가 `origin/main`을 마지막으로 병합한 시점(`19f6dd1`)의 main은 `1.32.6`이었으나
> 그 뒤 main이 54커밋을 더 발행해 최대치가 `1.33.2`가 됐다. 발행된 번호는 불가침이므로
> 미머지인 이쪽 세 항목을 전부 위로 밀었다.
>
> | 이 브랜치 항목 | 머지 전 | 충돌 종류 | 착지 |
> |---|---|---|---|
> | M1 | `1.32.7` | **정면 충돌** — main이 `83ed37a`에서 santa-delta-review에 같은 번호를 발행했다(`## [1.32.7] — 2026-08-25`). 병합하면 헤딩이 둘 생긴다 | `1.33.3` |
> | M2 | `1.32.8` | **역행** — 발행된 최대치 `1.33.2`보다 낮다 | `1.33.4` |
> | M3 (이 항목) | `1.33.4` | main이 `1.33.2`를 발행해 이 번호가 M2 자리로 밀렸다 | `1.33.5` |
>
> 셋은 서로 다른 축이므로 **하나로 합치지 않았다**. 직전 기록이 잡아 둔 목표값(M1
> `1.33.2` · M2 `1.33.3`)조차 그 사이 main이 `1.33.2`를 발행해 한 칸씩 더 밀렸다 —
> §3.7이 재계산 시점을 (a) 머지 해소 때와 (b) `/mccp:pr` 진입 직전 **두 번**으로
> 규정한 이유가 이것이다. (b)는 아직 남아 있다.

### Added

- **라운드 캡의 기계적 강제** — 캡은 그동안 판정만 있고 강제가 없었다. `effectiveRoundCap`은
  정확한 수를 돌려주고 세 게이트가 그 오라클을 실제로 불렀지만, 라운드를 여는 것은 LLM이 읽는
  산문이라 초과를 막는 장치가 없었다(실측 15+ 라운드, 그런데 receipt는 `rounds: 1`을 봉인).
  M3은 캡을 **리뷰어 발화 지점**에서 강제한다.
  - `plugins/mccp/scripts/lib/review-rounds/{ledger,seal,cli}.js` — 라운드 수의 단일 출처
    (`<repoRoot>/.claude/state/review-rounds/<gate-id>__<decision-slug>.json`, `0o600`,
    gitignored, decision slug 키잉)와 게이트 진입 봉인
    (`<git-dir>/mccp/tmp/review-rounds-seal.json`, 수명은 `codex-policy.MAX_SEAL_AGE_MS`
    재사용). 판정은 `santa/counter.js#decideRound`를 **재사용**한다(복제하지 않는다).
  - **두 chokepoint** — `codex-invoke.js` spawn 직전과 `plan-review/cli.js
    emit-workflow-args` 직전. 둘 다 이미 필수이고 fail-closed로 배선된 자리라 새 chokepoint를
    만들지 않는다. 패널 쪽은 args 파일을 쓰기 **전**에 판정하므로 거부된 라운드가
    `workflow-args.json`을 남기지 않는다.
  - 신규 classification `round-cap-reached`(15번째, 두 번째 비-실패 값) — `blocking=false` ·
    `advisory=false` · `durationMs=0` · spawn 0회. `plan`·`prp-implement`는 `divergent`로
    매핑하므로 cross-gate dedupe가 열리지 않는다.
- **`MCCP_ROUND_LEDGER`** (`enforce` | `observe`, 기본 `enforce`) — `off`는 없다. 끄는 것은
  M3 이전 동작을 요청하는 것이고 그것이 결함 자체이며, `observe`가 이미 비차단 + 전량 기록을
  준다. 불량값은 `enforce`로 **fail-closed**(`MCCP_GATE_ROUND_CAP`의 fail-open과 방향이
  반대인 것이 의도다 — 모드의 오타가 강제를 통째로 끄는 조용한 kill switch가 되면 안 된다).
- **receipt present-only 3필드** — `meta.round_ledger_count`(진짜 수, 0 포함 / `null`은 원장을
  읽지 못함) · `meta.round_cap`(`null`이면 봉인 부재 = 강제가 돌지 않았고 옆의 count는 정본이
  아님) · `meta.round_cap_pinned_by`. `makeSkeleton` 미포함(§3.12 hash 안정성)이되 hash **안**에
  있다 — hash 밖의 감사 필드는 서명되지 않은 필드다.

### Changed

- **`resolution.rounds`가 리터럴을 그만둔다** — 원장 count가 1 이상이면 거기서 파생한다
  (0이면 legacy `1` 유지: `schema.js`가 `rounds >= 1`을 요구하므로 0을 쓰려면 완화가 필요하고
  그것은 별개 축이다). 명시 `--resolution-file`이 원장과 다른 수를 실으면 **exit 12**로
  fail-closed하며 두 수를 모두 출력한다 — 조용히 원장을 채택하면 "저자가 다른 수를 믿고
  있었다"는 관측 가능한 사건이 사라진다.
- **리뷰가 아닌 Codex 호출은 예산을 쓰지 않는다** — `briefing/invoke.js`(receipt 요약)와
  `plan-review/cli.js l3`(패널이 이미 과금한 pass의 3번째 층)가 `invokeAdversarialReview`를
  transport로만 재사용한다. 면제는 `opts.notAReviewRound`이고 **opt-out**(선언을 잊은 리뷰는
  여전히 세어진다) · **프로그래매틱 전용**(`parseCliArgs`가 닫힌 allowlist라 셸 호출자는 자기에게
  면제를 발급할 수 없다). 이 배선이 없으면 요약 하나가 캡 1인 decision의 예산을 전부 먹고
  hybrid는 기본 캡에서 매번 산술로 멎는다.
- **`.claude/settings.json`의 `MCCP_GATE_ROUND_CAP`을 `3` → `1`로** (G7 종결). CLAUDE.md
  §3.16은 "캡 1 고정, 이미 settings.json에 설정"이라 적었으나 실제 값은 `3`이었다. 캡이 산문일
  때는 무해한 오기였지만 M3이 강제하는 순간 "운영자가 기대하는 캡"과 "강제되는 캡"의 불일치가
  된다. 사람의 판정으로 **문서가 정본**이 됐다.
- CLAUDE.md §3.3의 classification 표(14종 → 15종)와 §3.15의 "주장하지 않는 것"을 정정.
  후자는 "기계화된 것은 캡 계산뿐"이라 적고 있었고 M3 이후 거짓이다.

## [1.33.4] — 2026-08-25

> **§3.7**: `1.33.3 → 1.33.4` (**patch** — env-contract-integrity PRD의 M2 하나이고
> PRD에는 M3~M6이 남아 있다). 4면(plugin.json · html.js page-foot · markdown.js
> derived 줄 · 이 파일의 `currently` 노트)을 함께 맞췄고 `i18n-surface.test.js`가
> 재검증한다.
>
> **두 항목을 함께 상향했다 — §3.7 "forward-only 상향"의 6번째 재발.** 머지 해소
> 시점(2026-08-25) `origin/main`은 `1.32.6`이고, 이 브랜치가 미머지로 들고 있던 두
> 번호는 **모두 충돌 또는 역행**이었다: M1의 `1.30.2`는 main의 다른 PRD
> (diverse-agent-review milestone #7)와 헤딩이 겹쳤고, M2의 `1.32.3`은 발행된
> 최대치 `1.32.6`보다 낮았다. 발행된 번호는 불가침이므로 미머지인 이쪽 두 항목만
> 각각 한 칸씩 밀어 M1 `1.32.7` · M2 `1.32.8`에 착지했다 — 서로 다른 축이라 하나로
> 합치지 않는다. **그 `1.32.8`은 실제로 잠정값이었다** — 다음 머지(2026-08-31)에서
> main의 최대치가 `1.33.2`가 되어 이 항목은 `1.33.4`로 한 칸 더 밀렸다(7번째 재발,
> `[1.33.5]` 항목의 표 참조).

### Changed

- **환경변수 계약의 어긋난 값 12건 수리** — M1이 격리표로 «보이게» 만든 8건을 전부
  코드 쪽 사실에 맞췄다. `MCCP_PLAN_REVIEW`에서 존재하지 않던 `off`를 제거하고,
  santa 4종(`_SEVERITY_GATE`·`_TERMINATOR`·`_ADJUDICATION_GATE`·`_LEDGER_SUPPRESSION`)을
  실제 어휘 `enforce|off` + 기본값 `enforce`로, `MCCP_HOOK_PROFILE`을
  `minimal|standard|strict` + 기본값 `standard`로, `MCCP_STATE_JOURNAL`을
  `enforce|shadow|off`로, `MCCP_SESSION_LEDGER_SCOPE`를 `global|repo|hybrid`로
  정정했다(문서의 `host`는 코드에 없고 `VALID_SCOPES`가 정본). 기본값이 채워진 7건은
  `status`가 `undocumented-default` → `active`로 올라갔다.
- **격리표 전량 배수** — `vocabulary.js`의 `QUARANTINE`이 공집합이 됐다. DD3-ii의
  배수 규칙이 양방향이라 수리와 삭제는 **한 커밋 불변식**이다(어느 순서로 나눠도 중간
  상태가 red). 규칙 자체는 `lint.test.js`의 합성 격리 fixture가 계속 고정한다 —
  표가 비었다고 규칙 test를 지우면 다음에 격리가 생겼을 때 배수가 살아 있는지 알 수 없다.
- **`MCCP_CONTEXT_MONITOR_COST_MODE`의 어휘를 실제 파서에 맞췄다** — 문서가 가르치던
  `off`·`observe`·`enforce`는 **셋 다 파서에 존재한 적이 없고** 어느 값을 넣어도
  `directive`로 동작했다. canonical 2값(`directive`|`notify`) + 별칭 3종
  (`notification`·`info`·`informational`) 구조로 정정했다. 비용 경고 억제는 별도 축인
  `MCCP_CONTEXT_MONITOR_COST_WARNINGS`가 이미 소유한다.
- **`MCCP_BRIEFING`에서 `always` 제거** — `cost-guard.js`가 `=== 'off'` 한 값만
  비교했으므로 `always`는 조용히 `auto`로 흘렀다. 어휘 상수 승격과 함께 열거 밖 값에
  loud warn을 붙였다(판정 자체는 불변).
- **kind 오기 2건** — `MCCP_PLAN_REVIEW_QUORUM`은 `<M>of<N>` 형식이라 `int` →
  `string`(기본값 `3of4`), `MCCP_AUTO_CHAIN_SKIP_PR`은 정확히 `1`만 보므로 `bool` →
  `bypass-flag`. 후자로 `bypass-flag` 집합이 셋에서 넷이 됐고, §2의 «그 셋» 서사를
  «파싱 계약이 같다»로 정정했다(게이트 약화는 그 셋의 공통 성질이었을 뿐 kind의 정의가 아니다).
- **`LIST_MEMBER_POLICY` 단일 소유 이전** — `doctor.js`에 있던 표를 `vocabulary.js`로
  옮기고 없던 4건을 채워 list 9개를 완비했다. `doctor.js`는 재-export가 아니라 require로
  읽어, 두 소비처가 같은 표를 본다는 사실이 import 그래프에 남는다.
- **저장소 자신의 설정 수리** — `.claude/settings.json`의
  `MCCP_SANTA_SEVERITY_GATE: "high"`를 `"enforce"`로(오늘 warn 후 default로
  되돌아가므로 동작은 불변, 선언만 정직해진다), 무효값이던
  `MCCP_CONTEXT_MONITOR_COST_MODE: "off"`를 제거했다. `doctor` 경고가 2건 → 0건이 된다.

### Added

- **어휘 상수 승격 6건** — `MCCP_STOP_LOOP`(`stop-review-loop.js#STOP_LOOP_VALUES`) ·
  `MCCP_GOAL_FEATURE`·`MCCP_ULTRACODE_FEATURE`(각 `#FEATURE_VALUES`) ·
  `MCCP_EVIDENCE_CONFLICT_GUARD`(`#GUARD_MODE_VALUES`) ·
  `MCCP_BRIEFING`(`#BRIEFING_VALUES`) ·
  `MCCP_CONTEXT_MONITOR_COST_MODE`(`#COST_MODE_VALUES`). 전부 «같은 판정, 다른 표현»이며
  레지스트리가 결속할 대상이 생겼다. 어휘 gap은 13건 → **7건**.
- **L11 — 값별 결과 · 멤버 어휘의 기계 대조.** enum 27개 앵커의 `**값별 결과**` 블록에서
  줄의 키 집합을 뽑아 레지스트리 `values`와 **양방향** 비교하고, list 9개 앵커의
  `**멤버 어휘**` 블록이 어휘 출처와 `LIST_MEMBER_POLICY` 문장을 그대로 싣는지 대조한다.
  파싱 규격(섹션 경계 · 블록 경계 · fence 제외 · 항목 줄 형식)을 코드 옆에 명시했고,
  블록 부재 · 항목 0줄 · 블록 중복 · 대상 집합 공집합을 전부 problem으로 둬 vacuous-pass를
  닫았다. 산문을 스캔하지 않는 이유는 실측이다 — 값 토큰의 본문 등장을 세면 오늘 이미
  대부분 통과해 아무것도 강제하지 못한다.
- **상세 문서에 값별 결과 27 + 멤버 어휘 9 블록** — 제거된 값마다 «이것을 원했다면 오늘
  무엇을 쓰는가»를 함께 남겼다(조용한 삭제는 운영자에게 «내가 쓰던 게 사라졌다»만 남긴다).

### Fixed

- 수리로 깨진 사용 예시 5건(`MCCP_HOOK_PROFILE` `full` · `MCCP_PLAN_REVIEW` `off` ·
  `MCCP_PLAN_REVIEW_QUORUM` `"1"` · `MCCP_AUTO_CHAIN_SKIP_PR` `on` ·
  `MCCP_CONTEXT_MONITOR_COST_MODE` `off`)과 색인 12행을 함께 맞췄다.
- `docs/ENVIRONMENT.md` §2의 list 불량값 처리 줄 — «빈 목록» 한 줄이 실측에 반증됐다.
  파서마다 다르고(수용 / 전체 무효 / 조용한 폐기), 분리자가 `path.delimiter`인 것도 있다.

### 주장하지 않는 것

- **문서만 알던 값을 구현하지 않았다.** `MCCP_PLAN_REVIEW=off` · `MCCP_BRIEFING=always` ·
  `MCCP_SANTA_ADJUDICATION_GATE=warn`은 계약에서 제거됐을 뿐이며, 그 기능이 필요하다는
  판단은 게이트 의미를 바꾸는 별개 변경이다.
- **파서 이원화를 고치지 않았다.** `MCCP_WORK_MERGE_STRATEGY`(정본이 셸 비교, JS는 mirror)와
  `MCCP_SESSION_START_CONTEXT`(disable 별칭 집합)는 승격이 **틀린 처방**임이 실측으로
  밝혀져 승격 대신 gap 사유를 정정했다. gap이 13 → 7로만 준 이유가 이것이다 — 사유가 참인
  것이 목적이고 수를 줄이는 것은 목적이 아니다.
- **값 서술의 정확성을 기계로 보장하지 않는다.** L11이 강제하는 명제는 «선언된 각 값에 한
  줄이 있고, 선언에 없는 값의 줄은 없다»까지다. 그 줄이 코드와 맞는지는 사람이 읽어야 한다.

---

## [1.33.3] — 2026-08-21

> **§3.7**: `1.33.2 → 1.33.3` (**patch** — env-contract-integrity PRD의 M1 하나이고
> PRD에는 M2~M6이 남아 있다). 4면(plugin.json · html.js page-foot · markdown.js
> derived 줄 · 이 파일의 `currently` 노트)을 함께 맞췄고 `i18n-surface.test.js`가
> 재검증한다.
>
> **두 번 상향됐다 — §3.7 "forward-only 상향"의 5·6번째 재발.** 처음에는 `1.30.1`로
> 적혔고 근거는 "origin/main과 이 브랜치가 모두 `1.30.0`"이었다. 그 사이 main이
> `9c6c836 feat(v1.30.1): codex-intent-context M2 (#151)`로 `1.30.1`을 **먼저 발행**해
> `1.30.2`로 밀렸고, 그 `1.30.2`마저 main의 다른 PRD 항목(`## [1.30.2] — 2026-08-21`,
> diverse-agent-review milestone #7)과 겹쳐 머지 해소 시점에 `1.32.7`로 다시 밀렸다.
> §3.7이 재계산 시점을 (a) 머지 해소 때와 (b) `/mccp:pr` 진입 직전 **두 번**으로
> 규정한 이유가 이것이다 — 충돌 창은 브랜치를 딴 시점이 아니라 머지와 PR 사이에도
> 열려 있다. 상향 후 4면 + PR title을 다시 맞췄다. **그 뒤 세 번째로 밀렸다** —
> 2026-08-31 머지에서 main의 `1.32.7`(santa-delta-review)과 정면 충돌해
> `1.33.3`에 착지했다(7번째 재발, `[1.33.5]` 항목의 표 참조).

---

### Added — 환경변수 계약 무결성 M1: 계약 대조 + 설정 진단

lint L1~L9는 전부 green이면서 «문서가 가르치는 값이 코드에 없는» 어긋남을 하나도
보지 못했다. 아홉 검사가 계약 **내부**(레지스트리 ↔ 색인 ↔ 상세)의 정합만 보고,
레지스트리의 `values`가 코드의 수용 집합과 결속돼 있지 않았기 때문이다. 결속이 없으니
존재하지 않는 값이 레지스트리에 들어가면 세 표면에 **일관되고 권위 있게** 복제된 뒤
green으로 보고됐다.

- **L10 — 어휘 결속** ([lint.js](plugins/mccp/scripts/lib/env-contract/lint.js)).
  enum은 `values`와 코드 어휘가 집합 동일해야 하고, list는 어휘가 지정·해석되는지까지
  본다(DD9 — 여기서 동일성을 요구하면 M1이 M2의 문서화 작업을 끌어온다). 켠 첫 실행에서
  **8건이 실제로 붉어졌다**.
- **정적 추출 + 파생자 + 격리표**
  ([vocabulary.js](plugins/mccp/scripts/lib/env-contract/vocabulary.js)). 어휘는 소스
  텍스트에서 읽고 `require`하지 않는다(DD1 — 감사 대상을 부팅하는 lint는 자기가 감사하는
  상태를 바꾼다). 3형태: `'path#CONST'` 정적 추출 22건 · `{derive}` 파생자 1건
  (`hook-ids` — `MCCP_DISABLED_HOOKS`의 어휘는 dispatcher와 `hooks.json` 두 소스의
  합집합이라 한 상수로 표현할 수 없다) · `null` + `vocabularyGap` 명시 열거 13건.
  **빈 배열을 성공으로 돌려주지 않는다** — 빈 집합은 집합 비교에서 "모든 값이 불일치"가
  되어 조용한 red를 만든다.
- **격리는 배수된다(DD3-ii)**. L10은 격리되지 않은 불일치뿐 아니라 **격리 항목이 더 이상
  어긋나지 않아도** 실패한다. 후자가 없으면 격리표는 영구 면죄부가 되어 M2가 수리해도
  아무도 지우지 않는다. 관측된 어긋남이 적어 둔 것과 다를 때도 실패한다 — 옛 격리가 형태가
  바뀐 다른 결함을 덮지 못하게.
- **`env-contract` CLI** — `list` · `explain` · `doctor`
  ([cli.js](plugins/mccp/scripts/lib/env-contract/cli.js)). 셋 다 호출 시점에 레지스트리에서
  파생하며 자체 표를 갖지 않는다(새 선언원 0개). `doctor`는 3계층 settings가 **선언한 값**과
  프로세스가 **실제로 받은 값**을 나란히 놓는다
  ([settings-layers.js](plugins/mccp/scripts/lib/env-contract/settings-layers.js) +
  순수 오라클 [doctor.js](plugins/mccp/scripts/lib/env-contract/doctor.js)).
- **CI 착지 게이트** ([env-contract-drift.yml](.github/workflows/env-contract-drift.yml)).
  `lint.js`는 그전까지 hook·CI·settings 어디에서도 호출되지 않았다(호출처 0건, 실측).
  L10을 추가하는 것만으로는 아무것도 차단되지 않으므로, `gitignore-drift.yml`을 mirror한
  PR 워크플로를 함께 놓았다. paths 필터가 넓은 것은 의도다 — L10의 결정 입력은 어휘 ref가
  가리키는 소스 파일 전체이고, 좁히면 GitHub이 워크플로를 건너뛰어 게이트가 dead code가 된다.

**격리된 8건** (전부 M2 소관): `MCCP_PLAN_REVIEW`의 `off`(코드에 없어 `codex`로
fallback — 리뷰 없음을 기대한 운영자가 정반대를 받는다) · santa 4종
(`SEVERITY_GATE`·`TERMINATOR`·`ADJUDICATION_GATE`·`LEDGER_SUPPRESSION` — 코드는 전부
`enforce|off` 2상태인데 문서가 다른 어휘를 가르친다. 이 저장소의 `.claude/settings.json`이
실제로 무효값 `MCCP_SANTA_SEVERITY_GATE=high`를 쓰고 있다) · `MCCP_HOOK_PROFILE`(겹치는
값이 `minimal` 하나뿐이고 코드의 실제 기본값 `standard`는 문서에 없다) ·
`MCCP_STATE_JOURNAL`(3상태를 boolean으로 축약) · `MCCP_SESSION_LEDGER_SCOPE`(`host` ↔
`hybrid`).

**PRD의 차단성 Open Question이 답해졌다**: 설정 병합은 **깊은 병합**이고 충돌 시 프로젝트가
이긴다(1회 실측 — Windows · 2계층). PRD가 "실사용 3번째 사례의 유력 설명"으로 적었던 «얕은
대체» 가설은 **반증됐다**. `doctor`의 *탐지*는 이 답에 의존하지 않도록 설계했다(DD7) —
병합 규칙이 바뀌면 내놓는 *설명*이 낡을 뿐 탐지는 유효하다.

**주장하지 않는 것**: `doctor`는 게이트가 아니다(DD6·UI13 — hook 등록 0건, receipt 0건,
어떤 게이트도 이 종료코드를 읽지 않는다). CI 워크플로가 보장하는 것은 «lint가 돌고 drift에서
붉어진다»까지이고, 그 red가 머지를 막는 것은 branch protection이라 저장소 파일로 표현할 수
없다. 어긋난 값 자체의 수리는 M2, 라운드 캡의 기계 강제는 M3다.

### Fixed — ship 직전 `/mccp:code-review` 흡수 (HIGH 3 · MEDIUM 2 · LOW 3)

- **CI의 test step이 고정된 Node 20에서 반드시 실패했다.** `node --test`의 glob 해석은
  **22.6.0에서 추가**됐는데 워크플로는 `node-version: '20'`을 고정하면서 인용된 glob을
  넘겼다 — 로컬 Node 20.11.0으로 재현: `Could not find '…\*.test.js'` + exit 1. 같은
  Node 20에서 셸이 펼친 경로를 주면 test는 전부 통과하므로 코드가 아니라 인용이
  문제였다. 이 파일의 존재 이유가 "lint만 돌면 L10이 no-op이 돼도 green"을 막는
  것인데 그 절반이 매 실행 죽었다. → `shell: bash` + 비인용 glob. windows 러너의 기본
  셸 pwsh는 네이티브 명령에 glob을 펼치지 않으므로 인용을 벗기는 것만으로는 부족하고,
  `shell: bash`가 두 OS를 같은 인자 목록으로 고정한다. node-version 상향 대신 이 길을
  고른 이유는 저장소가 표방하는 하한이 Node 20(§3.4)이라 그 하한에서 도는 것이 CI의
  일이기 때문이다.
- **version 충돌** — 위 §3.7 노트 참조. `1.30.1 → 1.30.2` 한 칸 상향.
- **`.claude/settings.json`의 리뷰 게이트 완화가 무기록이었다.**
  `MCCP_PLAN_REVIEW_ROLES_MIN`이 `5 → 1`로 바뀌었는데 plan·PRD·CHANGELOG·report·STATE.md
  어디에도 언급이 없었고, 이 PRD(환경변수 계약 무결성)의 범위 밖 정책 변경이다. 이전 값
  `5`는 `quorum.js:97`의 `n > MAX_OF(4)` 분기에 걸려 loud warn 후 기본값 `3`으로
  떨어지던 **무효값**이었으므로 실효 변화는 3 → 1, 즉 승인 패널이 단일 관점 하나로
  수렴할 수 있는 상태였다. → 무효값을 고치되 실효 동작을 보존하는 `3`으로 되돌렸다.
- **`doctor`가 하네스 밖에서 정상 저장소를 고장난 것으로 보고했다.** `settings.json`의
  `env`는 Claude Code가 spawn한 프로세스에만 주입되므로, 평범한 터미널에서 돌리면
  선언된 토글 **전부**가 `not-received` error가 되어 error 21건 + exit 1이 나왔다(실측).
  CLAUDE.md 치트시트와 `docs/ENVIRONMENT.md`가 둘 다 평범한 셸 명령으로 제시하는
  도구이므로 첫 사용자가 그 오탐을 먼저 만난다. → `detectHarness`(`CLAUDECODE` ·
  `CLAUDE_CODE_ENTRYPOINT`)로 맥락을 읽어, 표지가 없으면 N건의 error 대신
  `env-delivery-unverifiable` **info 1건**으로 묶고 이유를 말한다. 미지정 기본값은
  `harness:true`다 — 낮추는 쪽이 기본이 되면 진짜 미도달이 조용히 접힌다. 판정하는
  이름(`MCCP_*`)을 표지로 쓰지 않는 것은 자기 입력으로 자기 엄격도를 고르지 않기 위함.
- **L10의 격리 배수(DD3-ii)가 `list` kind에 적용되지 않았다.** `e.kind === 'list'` 분기가
  «불일치가 사라졌는가»·«기록된 형태와 같은가» 두 검사보다 **먼저** return하는데
  `seenQuarantine`에는 이미 등재된 뒤라, list 토글을 격리하면 검사 없이 통과하는 영구
  면죄부가 됐다. `vocabulary.test.js`는 list 격리를 명시 허용하고 있어 test와 lint가
  서로 어긋나 있었다(오늘 8건이 전부 enum이라 잠재 상태). → 격리는 **enum 전용**임을
  양쪽에서 강제한다. list는 `values`가 null이라 비교할 문서 어휘가 없고, 비교할 수
  없으면 배수도 성립하지 않는다.
- **LOW 3건** — `parseFlags`가 명령마다 안 받는 플래그(`list --all`)와 잉여 위치 인자를
  조용히 무시했다(오탈자를 exit 2로 되돌리는 `validateChoice`의 태도와 불일치) →
  `COMMAND_FLAGS` 화이트리스트 + 위치 인자 수 검사. · `hook-ids` 파생자의 `\bid:`가
  앵커 없이 주석·타 객체의 `id:`까지 잡아 어휘가 상위 집합이 될 수 있었다(상위 집합은
  진짜 오타에 경고를 안 내는 fail-open) → 줄머리 앵커 `/^[ \t]*id:/gm`, 실측 26건 불변
  (dispatcher 8 + hooks.json 18). · `doctor`가 사용자 홈 절대경로를 stdout에 실었다 →
  `~/`·`./`로 접는다(§3.12가 receipt `meta.cwd`에서 막은 것과 같은 형태의 누출).

**이 수정이 남긴 커버리지 공백**: L10의 list-격리 분기는 `QUARANTINE`과 `kind`가 둘 다
모듈 상수라 fixture로 발화시킬 수 없어 직접 test가 없다. 기계적으로 강제되는 것은
`vocabulary.test.js`의 enum 단언이고, lint 쪽 분기는 그 위의 두 번째 벨트다.

---

## [1.33.2] — 2026-08-31

> **§3.7**: `1.33.1 → 1.33.2` (**patch** — diverse-agent-review PRD의 단일 milestone
> M11이고 PRD 종료 축이 아니다). 진입 직전 재계산했다(§3.7 실측 4회 재발): `origin/main`이
> `1.33.1`, 미머지 sibling이 `1.33.4`(env-contract-integrity)와 `1.34.0`(msw M9)을
> 선언하므로 `1.33.2`는 비어 있다.

### Added

- **diverse-agent-review M11 — 패널 승인 품질 감사.** #8이 "승인이 발급되는가"에 답한
  뒤에야 물을 수 있게 된 질문 — **그 승인은 옳았는가** — 에 답한다. 새 read-only ·
  LLM-free · standalone 오라클
  [`plan-review/approval-audit.js`](plugins/mccp/scripts/lib/plan-review/approval-audit.js)가
  승인 레코드마다 **승인 이후 다른 생산자가 남긴 결함 증거**를 결속해 dossier를 낸다.
  M8 `corpus.js`가 세운 분업 그대로 **도구는 세고 결속하며 판정은 문서가 한다** — 출력에
  `false_approve` 류의 판정 필드가 없음을 회귀 test가 고정한다.
- **회귀 test 24건** — [`plan-review-approval-audit.test.js`](plugins/mccp/scripts/lib/tests/plan-review-approval-audit.test.js).
  blind · 구조적 공집합 vs 부재 · 해시 체제 · `unauditable` 격리 · 경로 탈출(읽기 0회를
  io 스텁으로 단언) · coverage 항등식 · quorum 모순 · slug 귀속 · durability.
- **판정 문서** — [`docs/diverse-agent-review/approval-quality-audit.md`](docs/diverse-agent-review/approval-quality-audit.md)가
  도구 출력을 축자 동결하고 그 위에서 G1(앵커)·G2(사거리)·G3(독립 기록) 세 관문으로 판정한다.

### Observed (판정 milestone — 동작 게이트 코드 0줄 변경)

- **답은 "미탐 없음"이 아니다.** 감사 가능한 **4건 전부**에서 미탐이 나왔다(5건 중 1건은
  리뷰된 본문이 복구 불가라 `unauditable`). **비율은 산출하지 않는다** — 표본 4, O3 생존
  편향 방향 불명, 코퍼스 커버리지 하한.
- **미탐 유형이 무작위가 아니다.** 11건이 다섯 유형으로 접히고 셋이 반복된다:
  `Files to Change` 누락 3 · plan 내부 모순 3 · **저장소에 대한 낡은 사실 2 — 같은 오류가
  두 패널을 각각 통과했다**. 앞의 둘과 셋째는 성질이 다르다(전자는 저장소 대조 축, 후자
  C2는 plan 본문만 읽어도 판정 가능한 사거리 **안**의 미탐).
- **cross-model 채널은 어느 승인도 근거짓지 못한다.** ship receipt가 해시로 결속된 4건은
  전부 ship 시점에 Codex가 꺼져 있었다
  (`meta.codex_disabled=true` · `codex_verdict='skipped'` · `findings=[]`). 나머지 1건은
  그 본문을 봉인한 receipt가 **아예 없어** `absent`이며, 그쪽 0은 Codex에 대해 아무것도
  말하지 않는다 — 두 사유를 한 칸에 접으면 receipt 부재를 receipt의 관측으로 읽게 된다.
  5건 어느 것도 Codex 관측을 내지 않았으므로 도구가 `can_ground_absence=false`로 보고하고,
  어떤 판정도 그 채널에 기대지 않는다.
- **`.claude/reviews/` 재현성은 측정으로 답했다** — `durability_summary.untracked = 0`.
  plan L2 패널의 CRITICAL 2건이 세운 전제("worktree-only라 감사 재현 불가")는 실측상
  거짓이다(`.gitignore:154`가 무시하는 것은 `.claude/state/plan-review/`이고 같은 주석이
  `.claude/reviews/`를 DURABLE로 지목한다).

### Fixed

- **이름이 아니라 해시로 증인을 귀속한다.** 레코드 파일명에서 slug를 뽑으면 **다른 plan의
  ship receipt**가 증인으로 붙는 함정이 이 코퍼스에 실재한다(`impeccable-detection-contract`
  → `plan_hash` `sha256:c7d1d27d…` vs 레코드의 `sha256:887fc89d…`). 도구는 전 ship
  receipt를 `plan_hash`로 색인해 일치하는 것만 인정하고, 나머지 채널은 원리상 slug
  귀속뿐이므로 `slug_claimed`로 표기한다. **plan DN10의 "본문이 승인 후 바뀌었다"는 이
  잘못된 결속의 산물이었고, 정직한 서술은 `no_ship_receipt`다** — 문서가 그 정정을 적는다.
- **경로 검증은 읽기 전에, 원본에 대해.** `measurement.plan_path`는 마크다운에서 파싱한
  신뢰되지 않은 입력이다. 정본 `isRepoRelativeEvidencePath`를 재사용하되 그 위에 세 층을
  얹었다 — 선행 대시 거부(실측: `('--all')` · `('-n')`이 정본을 통과해 **git 옵션 주입**이
  된다) · Windows 예약 장치명 거부(실측: `('CON')`이 통과하고 win32에서 읽으면 stdin
  대기 정지) · `realpathSync` 봉쇄. 모든 git 호출에 `--` 구분자.

### Notes

- 정본 `isRepoRelativeEvidencePath`의 두 구멍(선행 대시 · 예약 장치명)은 형제 호출자
  `review_proof.dispatch_evidence[]`에도 열려 있으나, 그 파일은 게이트 경로 소유물이라
  UI5(#5 오라클 추출 전 배선 확대 금지)에 걸려 **원장으로 이연**했다. M11은 자기 사거리만 닫았다.
- 처방(리뷰어에게 저장소 대조 요구 · `Files to Change` 완전성 기계 검사 · plan 내부 모순
  lint)은 전부 게이트 배선이라 **#5 뒤**다. 관측 milestone은 관측만 한다.

## [1.33.1] — 2026-08-26

> **§3.7**: `1.33.0 → 1.33.1` (**patch** — diverse-agent-review PRD의 단일
> milestone M8이고 PRD 종료 축이 아니다). **초판은 `1.32.9`를 선언했으나 재상향했다**:
> 이 브랜치가 사는 동안 origin/main이 `1.32.7`(santa-delta-review)과
> `1.33.0`(multi-session-work-loop M8)을 발행해 1.32.x 자리가 이미 지나갔다. §3.7의
> forward-only 규칙대로 발행된 번호는 불가침이므로 미머지 쪽인 이 항목만 위로 민다.
> 4면(plugin.json · html.js page-foot · markdown.js derived 줄 · 이 파일의
> `currently` 노트)을 함께 맞췄고 `i18n-surface.test.js`가 재검증한다.

### Added

- **diverse-agent-review M8 — 패널 quorum 캘리브레이션 재검토 (판정 milestone)**:
  `plan-review/corpus.js` — `.claude/reviews/`의 패널 레코드를 집계하는 read-only ·
  LLM-free · standalone 오라클(`evidence-audit.js` 형태 미러). **게이트 배선은 한
  바이트도 바뀌지 않았다**(UI6 — 사전 파일 9종 diff 공집합, 기계 확인).
  임계값을 갖지 않으며(DN11 · UI11) 세는 것은 도구가, 판정은 문서가 한다.
- `docs/diverse-agent-review/quorum-calibration.md` — 도구 출력을 **축자 동결**하고
  그 위에 판정 4개를 적은 앱커 문서(재현 명령 포함).

### Changed

- **통과 경로 wall-clock 지표가 미산출 → 산출로 전환**됐다 — 근거는 새 데이터
  수집이 아니라 **집계 범위 정정**이다. converged 5건 중 4건이 M7 tip에 이미
  존재했으므로 #6·#7의 "표본 0"은 부재가 아니라 자기 PRD의 실행만 센 범위의
  산물이었다. 과거 판정이 어느 범위에서 옳았는지를 PRD 칸 안에 함께 남겼다(감추면
  그것이 골대 이동이 된다). 차단 경로 행은 무변경(UI8).
- PRD `.claude/prds/diverse-agent-review.prd.md` — #8 complete · **#11 신설**(승인
  품질 false-approve 감사) · Evidence에 M8 실측 문단 · Open Questions 3항 갱신.

### Fixed

- **단일통과 완화 측정이 구조적으로 0을 보던 결함** — 초판은 완화 카운트를
  `pass_path.single_pass_tainted` 하나로만 두었는데 그 필드는 **converged 레코드만**
  필터한다. `decide.js:338`은 완화를 언제나 `'divergent'`로 봉인하므로(§3.15
  "converged 위장 없음") 그 값은 어떤 코퍼스에서도 0이고, 실코퍼스의 완화 **14건**이
  출력 어디에도 나타나지 않았다 — 그러면서 그 0이 문서·PRD에서 UI9 충족의 *실측
  근거*로 인용됐다. **아래 F6과 정확히 같은 형태의 오류**(잘못된 소스에서 얻은 구조적
  0)라 같은 처방을 적용한다: verdict와 무관하게 세는 `single_pass` 축을 신설하고,
  기존 필드는 지우지 않고 그 봉인의 **회귀 가드**로 의미를 정정했다. 문서·PRD의 UI9
  문장은 "관측했다"에서 "상류 불변식이 보장하고 코퍼스에 반례가 없다"로 좁혔고,
  판정 3에는 "차단 30건 중 14건은 작업을 멈추지 않았다"를 명시했다. 도구 헤더에
  **"구조적 0을 관측으로 착각하지 않는다"** 절을 두어 두 사례를 한 규칙으로 묶었고
  회귀 test 3건이 고정한다.
- **F6 기여도 측정이 구조적으로 0을 보던 결함** — `record.js#findingRows`는 실패
  리뷰어가 finding을 **하나도 안 냈을 때만** 합성 `FAIL` 행을 쓴다. 그 행만 세면
  MEDIUM만 낸 실패 리뷰어가 관측되지 않아 F6 기여도가 항상 0으로 보고된다(실측:
  코퍼스 전체 합성 행 0건). 정본 소스는 `## Refutation attempted` 표이며,
  예비 실측과 이 milestone 초판이 함께 0으로 본 원인이 이것이다. 정정 후 판정은
  **1건**(`archive/plan-review-followup-R12.md`)이며 회귀 test가 고정한다.

## [1.33.0] — 2026-08-25

> **§3.7**: `1.32.7 → 1.33.0` (**minor** — M8은 multi-session-work-loop PRD의 **마지막
> milestone**이라 PRD 전체 종료 축이다). base는 이 브랜치가 사는 동안 `1.32.2` →
> `1.32.6` → `1.32.7`로 두 번 이동했으나 `1.33.0`이 그 위이므로 재상향은 불필요하다. 4면 동기: `plugin.json` · `renderer/html.js`
> page-foot · `renderer/markdown.js` derived 줄 · 이 파일의 `currently` 노트.
> `renderer/tests/i18n-surface.test.js`는 기대값을 `plugin.json`에서 파생하므로
> 동기 대상이 아니라 검증 수단이다(green 확인).
>
> **설치 캐시 지연**: 실 세션의 hook은 `~/.claude/plugins/cache/mccp/mccp/<version>/`
> 에서 돌고 현재 캐시 최고 버전은 `1.32.6`이다. 이 릴리스의 producer가 실제 세션에서
> 자동 발화하려면 머지 후 `claude plugin update`가 필요하다(DD10).

### multi-session-work-loop M8 — 측정 부채 상환

**뿌리는 한 줄이었다.** `observer-sessions.resolveSessionId()`가 이 하네스에 존재하지
않는 `CLAUDE_SESSION_ID`만 읽어 빈 문자열을 반환했고, 그 falsy 값이
`session-start.js`/`session-end.js`의 M2 계측 블록 **전체**를 실행되지 않게 했다.
A1 착수 · A2 종료 · B3 사용이력 producer가 같은 이유로 전부 죽어 있었다.

#### Added
- `plugins/mccp/scripts/lib/session-identity.js` — 세션 id 우선순위 체인
  (`MCCP_SESSION_ID` → `CLAUDE_CODE_SESSION_ID` → `CLAUDE_SESSION_ID`)의 단일 진실원.
  **체인만 옮기고 정규화는 각 소비처에 남긴다**(DD1) — `evidence-lock`은 `null`,
  `observer-sessions`는 빈 문자열, `orchestration-runaway`는 `'unknown'`을 반환하며
  호출자들이 그 차이에 의존한다.
- `plugins/mccp/scripts/lib/msw-metrics/m8-coverage-gate.js` — 승인 emit 지점
  레지스트리(**7개**) + 정적 lint + `--acceptance` opt-in 판정.
- `mccp-state msw-event emit` 서브커맨드 — `--kind`를 `task_completed | remediation_pr`
  **두 종으로 고정**하고 `--work-unit`/`--gate-decision-id`를 canonical `SLUG_RE`,
  `--finding-id`를 16자 hex(`FINDING_ID_RE`), `--pr-number`를 부호없는 정수로
  검증한다. `remediation_pr`은 `--pr-number`와 `--finding-id`를 **둘 다 요구한다**.
  착수(`task_started`)와 세션 수명 이벤트는 이 셸 경로로 쓸 수 없다 — A1의
  **분모**는 hook만 쓴다.
- `docs/multi-session-work-loop/m8-{before,after,assertion-manifest,audit-sample}.json`.

### Fixed
- **A1 분모의 계약 위반 시정**(DD3): `measurement-design.md` §A1(FROZEN)은 분모를
  "착수 이벤트가 기록된 **작업 단위** 전수"로 고정했는데 코드는 `session_start`를 가진
  **세션 수**를 세고 있었다. 계약 변경이 아니라 코드가 계약을 어기고 있던 것의 시정이다.
- **A2 세션 바인딩**(DD6): `context-state` 스냅샷이 `session_id`를 보존하고,
  `session-end.js`는 그 귀속과 신선도를 **둘 다** 통과한 값만 stamp한다. M2 정직성
  강등이 명시했던 복원 조건을 충족시킨 것이지 강등을 되돌린 것이 아니다.
- **B3 집합 등식**(DD7): 분모 집합과 분자 우주(`TOGGLE_DEFAULTS`)의 양방향 차집합이
  공집합이 됐다(116 = 116). 분모에만 있던 7개는 `TOGGLE_EXCLUSIONS`와 규범 문서에
  **명시로** 추가했고(자동 파생 아님 — UI7), 분자에만 있던 `CODEX_DEDUPE_AT_PR`은
  `MCCP_` 접두 규약으로 제외했다. **은퇴 0건**(UI6 · UI14).
- **claimed-computable lockstep 복구**: `derive/cli.js`의 목록에 M7이 승격한 C1이
  빠져 있어 산문 계약이 이미 깨져 있었다. 두 목록의 집합 동일성을 test로 단언해
  lockstep을 산문에서 기계로 옮겼다.
- **경로 주입 방어**(security review R1 흡수): `findings-registry.appendFindings`와
  `writeDegradedMarker`가 `workUnit`을 canonical `SLUG_RE`로, `msw-events.appendEvent`가
  `sessionId`를 파일명 안전 토큰으로 검증한다. 셋 다 타입 검사만 하고 그 값을
  `path.join`에 넘기고 있었다.

### Changed
- `mccp-implement-codex` receipt에 `pr_number` · `gate_decision_id` allowlist 추가.
- 대시보드 병기 축 3줄 추가(`A1 커버리지:` · `A2 상세:` · `C2/C3 귀속:`) — 값 셀과
  상태 컬럼은 **무변경**이고 신규 collapse·색 클래스는 0개다(DD11). collapse 줄
  순서가 **지표 id 순**으로 결정적이 됐다.

### 로컬 리뷰 흡수 (`/mccp:code-review`, 커밋 전)
- **A1 완주 emit이 셸 경계에서 죽어 있었다**(H1·H2): `pr.md` Phase 5.1이
  `DECISION_SLUG`을 상속에 기댔는데 fenced block은 각자의 셸이라 그 값은 항상
  비어 있었다 — `-n` 가드가 걸려 A1 분자가 **매 사이클 결정적으로 skip**됐다.
  같은 파일 2.5.8 · 2.5.9 · Phase 3이 이미 재도출하고 있었고 5.1만 빠져 있었다.
  이제 `DECISION_SLUG`·`PR_NUMBER`를 그 블록 안에서 뽑고, 귀속 emit도 같은 블록에
  넣어 앞 블록 변수 상속을 없앴다.
- **C2/C3 귀속 삼각의 우변이 writer만 있고 reader가 없었다**(H3):
  `derive/sources/findings.js`는 findings-registry 이벤트에서 `remediation_pr`을
  찾는데 그 필드를 쓰는 producer가 **0개**였고, `pr.md`가 쓰는 msw-event
  `remediation_pr`은 `finding_id`가 없어 어떤 finding에도 결속되지 않았다 —
  대시보드의 `해소 PR 연결 N건`이 **어떤 주기로도 0을 벗어날 수 없는** 상태였다.
  msw-events allowlist에 `finding_id`를 더하고 reader가 그 레코드를 조인한다.
  레지스트리에 `finding_closed`로 쓰는 대안은 `closure_type` enum을 통과해 C1의
  해소 계상을 오염시키므로 배제했다.
- **A1 분모의 granularity 혼입**(M3): `mccp:plan-prd`는 PRD basename을 슬러그로
  내는데 PRD는 작업 단위가 아니라 그 상위다(UI1). 착수로 세면 완주 기록을 영영
  못 받는 유령 work_unit이 분모에 남는다 — `NON_WORK_UNIT_COMMANDS`로 제외했다.
- `SLUG_RE` 리터럴 복제 제거(M1) · `session-hooks-no-llm` 가드를 수신자 무관
  `.readState(` 로 확대(M2) · `CLAUDE_SESSION_ID`를 가리키던 낡은 주석·로그 정정(L2).

### 인정 조건 (정직한 미달)
- **A1은 이 주기 안에 `computed`에 도달하지 못한다.** 완주 신호는 이 milestone
  자신의 `/mccp:pr`에서 처음 발화한다(구조적 순환). 소급 backfill은 §A1이 금지한다.
- **A2는 표본 0건이다.** 원인은 M8 밖이다 — session-bridge의 `context_remaining_pct`
  자체가 `null`이고, 전역 `context-current.json`은 11일 전 다른 세션의 `tool_count`라
  out-of-order 가드가 write를 건너뛴다. 표본을 지어내지 않았다.
- **B3만 `forward-only → computed`로 전환됐다**(20/116).

## [1.32.7] — 2026-08-25

> **§3.7**: `1.32.6 → 1.32.7` (**patch** — axis close. 새 milestone이 아니라
> santa-delta-review PRD의 마지막 Open Question을 실측으로 닫는 변경이고, 코드
> 표면은 test 상수 하나와 문서다). 4면(plugin.json · html.js page-foot ·
> markdown.js derived 줄 · 이 항목 + currently 노트) 동기 완료.
> **번호를 한 번 상향했다**: 이 항목은 원래 `1.32.6`으로 작성됐으나
> origin/main이 그 번호를 codex-disabled-round-invariant M1에 먼저 발행했다
> (merge `e458f0c`). §3.7 forward-only에 따라 발행된 번호는 불가침이므로
> 미머지인 이쪽을 `1.32.7`로 밀었다.

### Fixed

- **pre-push 유출 게이트가 이 브랜치를 막았다 — 정직한 예외로 풀었다.**
  `history-leak-scan.js`의 `DEFAULT_ALLOWLIST`에 세 번째 항목을 더했다.
  대상은 `codex-findings-backlog.md`의 한 행으로, hook-trace에 대한 L2 security
  finding을 **기각하면서 그 근거로 실제 관측된 절대경로를 인용**한다. 그 인용이
  곧 반박이라 지우면 기각이 보여주지 않는 측정을 주장하게 된다 — 두 번째 항목이
  이 scanner 자신의 오탐 보고에 대해 이미 해소한 것과 같은 구속이다. 마커는 finding
  digest(`22877fd2`)라 그 한 행에만 걸리고, 행이 재작성되면 면제가 자동 소멸한다
  (fail-closed). 디렉토리 단위 면제가 아니므로 다른 파일·다른 행의 유출은 그대로 잡힌다.

### Measured

- **santa 델타 리뷰 Layer 2(라이브 리뷰어 비교) 완주** — M2 plan Task 3이 세션 운영
  제약으로 미실행이던 축을 그대로 실행했다. 같은 합성 fixture · 같은 CLI · 두
  모드(`off`·`enforce`) 각각 blind + bundled 레인 완주. 관측
  **`fullFindings=3` · `deltaFindings=2`(1건 하락)**. 잃은 것은 Class C(fix가 건드리지
  않아 경로째 드롭된 파일)의 결함이고, Layer 1이 containment 손실을 예측한 그 계층이
  탐지 손실로 실현됐다. **Class B의 핵심 질문은 답해지지 않았다** — 그 결함은 full
  스코프에서도 미발견이라 관측이 질문에 도달하지 못했다.
- 사전 등록(`PREREGISTRATION.md`)을 **리뷰어 발화 이전에** 동결했다 — 상위 규칙 인용 ·
  실행 구성 · finding→결함 id 대조 알고리즘(plan 승인 패널이 `미지정`으로 지적한
  L2 id=77fbb4db) · 비결정성 처리 · 실행 증명. 결과를 보고 규칙을 고치지 않았다.
- **이탈 1건을 기록했다**: Reviewer B의 `codex exec -m gpt-5.4`가 사용량 한도로 두 모드
  모두 실패해 `santa-loop.md`가 규정한 Claude fallback으로 **대칭** 전환했다. 델타 축
  비교는 교란되지 않으나 cross-model 독립성은 달성되지 않았다.

### Changed

- `santa-detection-coverage.test.js` — `LAYER2_EVIDENCE`가 `null`에서
  `{fullFindings: 3, deltaFindings: 2}`로 교체됐다. `decideDefaultFlip` 판정이
  `layer2-absent` → **`layer2-degraded`**. **`MCCP_SANTA_DELTA_SCOPE`의 default는
  `off`로 무변경** — 값이 아니라 사유가 바뀌었고, 그 둘을 다른 토큰으로 나눠 둔 이유가
  이 자리다. `scope-delta.js`·`registry.js` 코드 변경 0건.
- `docs/environment/review.md` · `commands/santa-loop.md` — default `off`의 근거를
  「미상」에서 「실측 하락」으로 교체(M2가 남긴 미래 시제 문언 정정).
- PRD Open Question 6건이 전부 해소됐고, **M3 DD10의 아카이브 보류가 해제**됐다 —
  보류 사유는 "default를 묶는 미상이 활성 표면에서 사라진다"였고 미상이 실측으로
  대체됐으며 잔여 한계는 아카이브가 옮기지 않는 `docs/` 파일이 소유한다.

### Added

- `docs/santa-loop/detection-rate-layer2.md` — 측정 기록(주장하지 않는 것 · 사전 등록 ·
  이탈 · Layer 1 재현 · Layer 2 관측 · 규칙 적용 · 닫은 것과 닫지 않은 것 · 재현 절차).
- `docs/santa-loop/layer2-evidence/` — 원시 산출물 13건(리뷰어 판정 JSON 4 · 조립
  프롬프트 4 · 매처 결과 · 매처 · fixture 빌더 · 사전 등록). 머신-로컬 절대경로는
  placeholder로 치환했다.
- backlog 2행 — Class B 미답(MEDIUM) · cross-model 미달성(LOW).


## [1.32.6] — 2026-08-25

> **§3.7**: `1.32.2 → 1.32.6` (**patch** — codex-disabled-round-invariant PRD의
> 단일 milestone M1이고 PRD 종료 축이 아니다). **번호를 한 번 상향했다**: origin/main은
> `1.32.2`이지만 미머지 sibling worktree가 `1.32.3`·`1.32.5`·`1.33.0`을 이미 선언해
> 1.32.x 최대치 위인 `1.32.6`에 착지한다. 4면(plugin.json · html.js page-foot ·
> markdown.js derived 줄 · 이 파일의 `currently` 노트)을 함께 맞췄고
> `i18n-surface.test.js`가 재검증한다.

### Fixed

- **`MCCP_CODEX_DISABLED`가 R1에만 적용되고 escalation 라운드에서 무시되던 결함**
  (실측 2026-08-25). 이 토글은 `codex-invoke.js`의 spawn 직전 short-circuit 한 곳에서만
  honor됐고, 그것은 *호출 1건에 대한 분류*이지 게이트 전체에 걸리는 정책이 아니었다.
  게이트가 R1에서 존중한 뒤 "1회성 설정이라 소진됐다"고 판단해 R2를 위해 `0`으로 되돌리고
  Codex를 호출했다 — Codex 사용량이 소진돼 토글을 켠 운영자가 라운드마다 의도치 않은
  호출을 지불했다.

### Added

- `plugins/mccp/scripts/lib/codex-policy.js` — 게이트 진입 시 정책을
  `<git-dir>/mccp/tmp/codex-policy.json`에 봉인하고 `봉인 OR env`로 판정하는 오라클.
  `seal`/`read`/`clear` CLI, spawn 없는 worktree-safe git-dir 해소(`.git`이 파일인 경우
  `gitdir:` 포인터를 따라간다), write 후 read-back 검증. `MAX_SEAL_AGE_MS`(6h)는 export되어
  test가 값을 직접 단언한다.

### Changed

- **1차 방어** `codex-invoke.js` — spawn 직전 판정이 env 단독에서 `봉인 OR env`로 바뀌었다.
  이 함수는 세 게이트의 모든 Codex 호출이(즉흥으로 구성된 R2 호출을 포함해) 예외 없이
  지나는 유일한 chokepoint라, 정책을 라운드 불변으로 만들 수 있는 유일한 지점이다. 반환
  형태·14종 classification·`blocking`/`advisory` 계약은 무변경. 정책 모듈이 로드되지 않거나
  판독이 throw하면 **fail-open**으로 env 단독 강등 + loud stderr — 깨진 require가 전 사용자의
  Codex를 조용히 끄는 쪽이 훨씬 큰 해악이다.
- **2차 방어** `review-single-pass.js#effectiveRoundCap(env, opts)` — `opts.codexDisabled`
  (미주입 시 env)를 읽어 캡을 1로 pin한다. 반환에 `pinnedBy`·`note` 추가; `reason`은
  single-pass 전용이라는 의미가 무변경이다(두 축이 같은 필드를 쓰면 stderr가 잘못된 원인을
  보고한다). 이 층은 캡 블록이 실행될 때만 걸리므로 부분 기계다.
- **3차 방어** plan·prp-implement·pr 세 명령 본문 — 게이트 진입 봉인 블록, 캡 판독의 정책
  주입, 그리고 해제 금지 조항. `pr.md`가 산문에서 하드코딩하던 `MCCP_GATE_ROUND_CAP` 참조를
  오라클 산출 `$ROUND_CAP`으로 교정. **이 층은 강제되지 않는다** — 정적 test는 조항의 존재만
  고정하고 이행은 주장하지 않는다(§3.15).
- `docs/environment/gates.md`·`CLAUDE.md` §3.3 — 이 토글이 진짜 1회성 형제들
  (`MCCP_SKIP_RECEIPT`·`MCCP_PR_SKIP_CODEX_REVIEW`)과 같은 부류로 읽히던 어휘를 정정하고
  봉인 계약(보장 범위 1회 게이트 실행 · 부재는 env fallback · **판독 불가는 부재가 아니라**
  이상 상태 · 6h 상한)을 서술.
## [1.32.5] — 2026-08-25

> **§3.7**: `1.32.4 → 1.32.5` (**patch** — M3는 santa-delta-review PRD의 셋째
> milestone이고 **PRD 전체 완료가 아니다**. Layer 2(라이브 리뷰어 비교)가 여전히
> 미실행이라 PRD Open Question이 열려 있고, 그러므로 §3.7의 보수적 default인
> patch를 취한다). 4면(plugin.json · html.js page-foot · markdown.js derived 줄 ·
> 이 파일의 `currently` 노트)을 함께 맞추고 `i18n-surface.test.js`가 재검증한다.
>
> **병렬 브랜치 충돌 재해소(§3.7 — 이 사이클에서 세 번째)**: M3의 `git merge origin/main`
> 시점 재계산에서 `origin/main`이 **`1.30.2`를 diverse-agent-review M7에 이미 발행**했고
> (`c9e941c`) 천장이 `1.32.2`까지 올라가 있었다. 발행된 번호는 불가침이므로 미머지 항목만
> 체일링 위로 민다 — M1 `1.30.2 → 1.32.3` · M2 `1.30.3 → 1.32.4` · M3 `1.32.5`.
> 두 항목을 하나로 합치지 않는다(서사가 뭉개진다). 날짜 역전은 정상이다 — version
> 순서가 정본이다.

### Fixed — santa 델타 리뷰 M3: 사이클 잔여 마감 (backlog · fix-task · 부수 정정)

- **`derive/sources/backlog.js`** — GFM은 leading/trailing pipe를 **선택**으로 두는데
  파서가 둘 다를 필수로 요구해 443행 중 **272행을 경고 없이 버렸다**. 데이터가 아니라
  파서를 고친다(DD1). 느슨해지는 축과 조이는 축을 같은 커밋에 둔다 — date 셀을
  엄격한 ISO 일치로 좁혀 산문 줄이 행으로 오인되는 표면을 닫는다. `invalid_count`의
  리터럴 `0` 반환을 제거하고 `degraded`를 그 값에서 파생시킨다(DD2). finding 셀 안의
  파이프도 꼬리가 보존된다 — 첫 파이프에서 잘리던 조용한 손실이다.
  실측: 181 → 453행 · `invalid_count` 0 · 대시보드 이월 finding rail 69 → 135.
- **`santa/detection-corpus.js` `compareCoverage`** — 전건이 형태 이탈이면 `full=0, delta=0`이라
  `degraded=false`가 되어 **측정 실패가 "손실 없음"으로 읽혔다**. `degraded`의 정의를 넓히지
  않고 그 옆에 `measured` + 닫힌 enum `degradedReason`을 둔다(DD3 — `FLIP_DECISIONS`가
  ABSENT를 DEGRADED와 따로 둔 것과 같은 수단). `totals.unknown`을 색인이 아니라 양측
  records 배열에서 세고(delta 쪽 이탈이 한 번도 안 세어졌다), id 없는 레코드를
  `unmatched`에 `side:'unindexable'`로 남긴다(DD4). 기존 필드 무변경 · M2의 21건 green 유지.
- **`lib/tests/helpers/gate-env.js`** (신규) — 게이트 정책 env가 test 스위트를 상시 red로
  만들지 않게 한다. 저장소 자신의 `settings.json`이 `MCCP_REVIEW_SINGLE_PASS`를 켜 둔 탓에
  전 스위트 **51건 전부**가 그 한 축에서 나왔다 — santa-loop-cap 25/28 · santa-adjudication
  68/22 · santa-lanes 76/1. 요건은 «53/0 재현»이 아니라 **«env 유무와 무관하게 같은 결과»**
  이다(DD5) — 세 파일 모두 두 조합에서 53/0 · 90/0 · 77/0으로 동일. 적용 대상은
  **실측으로 red인 파일**로 한정했다.
- **`lib/hook-trace.js` `resolveRepoRoot`/`toRepoRelative`** (신규) — 두 hook이 `event.cwd`를
  그대로 저장소 루트로 써서 하위 디렉토리의 실패 호출 하나가 shard를 산란시켰다(실측).
  더 나쁜 것은 shard와 `.end` 마커가 **다른 디렉토리로 갈리는 것**이다 — 다음 세션의
  `scanCrashAlerts`가 거짓 crash alert를 낸다(v1.20.5가 닫은 실패 모드가 cwd 표류로 재개).
  **판정은 한 자리**이고(DD6-1) fail-open을 유지하며(DD6-2) 사용자 표면은 repo-relative로
  접는다(DD6-3, §3.12 관례). 「표면 절대경로 0건」은 git 해석 성공 경로에 한정된 주장이다.
- **`plan-conflict-detector.js` + `commands/prp-implement.md`** — 같은 결함의 양끝이라
  한 커밋이다(DD7). `normalizePath`가 백틱을 안 벗겨 plan 표의 모든 경로가 영구
  미매칭했고, 명령 본문이 두 점 diff(`origin/main..HEAD`)를 넘겨 발산 브랜치에서
  base 쪽 변경까지 보고했다. **항상 발화하는 가드는 꺼진 가드와 같다.**
  실측(M3 plan 기준): unplanned 270 → 41 → 32. 잔여 32는 오발화가 아니라
  이 브랜치가 M1·M2 커밋을 함께 지고 있어서다 — 가드가 처음으로 *참인 것을 보고*한다.

### Known limits (주장하지 않는 것)

- **M3는 탐지율을 검증하지 않았다.** 닫은 것은 *사이클이 남긴 부채*이지 *PRD의 측정 축*이
  아니다. `MCCP_SANTA_DELTA_SCOPE` default는 `off` 그대로이고 델타 스코프 로직은 무변경이다.
- **Plan-Codex가 M3에서 발화하지 않았다.** `mccp-plan-codex/santa-delta-review-m3` receipt가
  부재하고 plan의 `## Codex Adversarial Review`가 placeholder다. 실제로 발화한 리뷰는
  L2 다관점 패널 3라운드뿐이고, Implement-Codex도 `MCCP_CODEX_DISABLED=1` env 정책으로
  skip됐다. 근거와 사유는 `.claude/notes/santa-delta-review-m3-implement-codex.md`에
  기록했다(§3.16 — 라운드를 늘리지 않고 문서화된 우회 + 사유 기록).
- **plan의 acceptance 명령 한 건이 결함이었다.** 두 점 diff 판정 grep의
  `origin/[^ ]+\.\.[^.]`는 `[^ ]+`가 여분의 점을 삼켜 **세 점 표기도 매칭**하므로 고쳐도
  0이 되지 않는다. `[^ .]+`로 정정했고(실측: 두 점 fixture 1 · 세 점 fixture 0) 그 정정을
  report와 backlog에 기록했다. plan 본문은 receipt가 봉인해 수정하지 않는다.

---

## [1.32.4] — 2026-08-21

> **§3.7**: `1.32.3 → 1.32.4` (**patch** — M2는 santa-delta-review PRD의 둘째
> milestone이고, **PRD 전체 완료가 아니라서 minor가 아니다**. M2는 Layer 1만
> 배송했고 Layer 2가 미실행이라 PRD의 M2 행이 `in-progress`로 남는다 — plan
> Task 6이 "PRD 전 milestone 완료이므로 minor"라고 적은 전제가 성립하지 않으므로
> §3.7의 보수적 default인 patch를 취한다). 4면(plugin.json · html.js page-foot ·
> markdown.js derived 줄 · 이 파일의 `currently` 노트)을 함께 맞추고
> `i18n-surface.test.js`가 재검증한다.
>
> **병렬 브랜치 충돌 해소(§3.7 실측 5회째)**: 진입 시점 재계산에서 `origin/main`이
> 이미 `1.30.1`을 **다른 축**(codex-intent-context M2, `9c6c836`)에 발행한 것이
> 확인됐다. 발행된 번호는 불가침이므로 이 브랜치의 미머지 항목을 각각 한 칸씩
> 밀었다 — M1 `1.30.1 → 1.30.2`, M2가 `1.30.3`. 두 항목은 서로 다른 축이므로
> 합치지 않는다. M1 커밋 메시지(`feat(v1.30.1)`)는 이미 기록된 history라 그대로
> 두고, 정본은 이 파일과 manifest다. **`/mccp:pr` 진입 직전에 한 번 더
> 재계산한다** — 이 충돌이 정확히 그 재계산이 잡아낸 것이다.

---

### Added — santa 델타 리뷰 M2: 탐지율 보존 검증 (Layer 1)

- **`plugins/mccp/scripts/lib/santa/detection-corpus.js`** (신규 순수 oracle) —
  계층화 결함 corpus와 커버리지 판정. `DEFECT_CLASSES`는 결함을 **위치로** 4계층
  (`A_IN_FIX` · `B_SAME_FILE_OUT_OF_RANGE` · `C_DROPPED_PATH` · `D_ALWAYS_SCOPE`)으로
  닫고, `buildCorpus()`가 파일 내용과 결함 좌표를 **데이터로** 낸다(fs·git·시각·env
  미접촉). 좌표는 anchor 문자열로 역산하므로 줄이 밀려도 조용히 어긋나지 않는다.
  `coverageOf` / `compareCoverage`는 어떤 입력에도 던지지 않는다 — 던지는 측정
  도구는 측정을 중단시키고, 중단된 측정은 "하락 없음"과 구별되지 않는다.
- **`decideDefaultFlip`** — 사전 등록 규칙(`DECISION_RULE`, plan DD3 축자 동결)의
  기계적 적용. **Layer 2 증거 부재는 거짓이 아니라 미상이고 미상은 flip 근거가
  아니다**(`layer2-absent`). `layer2-degraded`와 별도 토큰이라 "재봤더니 하락"과
  "안 재봤다"가 사후에 구별된다.
- **`plugins/mccp/scripts/lib/tests/santa-detection-coverage.test.js`** (신규 21건) —
  실제 git fixture + 실제 `scope-delta`/`scope-always` CLI를 `off`·`enforce` 두 모드로
  지나는 Layer 1 회귀. 사전 등록 기대치를 동결한다: 델타는 A를 범위로 지목하고, B는
  경로를 유지한 채 범위 밖이며, C는 경로째 드롭되고, D는 두 모드 모두 스코프 안이다
  (상시 스코프 면제). 계층 합산 `full=4 · delta=3 · lost=1`.
- **default 판정은 코드에 묶인다** — "배송된 default는 이 저장소가 기록한 Layer 2
  증거와 정합한다" test가 `LAYER2_EVIDENCE`와 실제 `DELTA_SCOPE_DEFAULT`를
  `decideDefaultFlip`으로 대조하므로, 측정 없이 default를 뒤집으면 스위트가 붉어진다
  (plan 승인 패널 L2 id=6116eeb8 · 5fb50bd9 흡수).

### Changed

- **`MCCP_SANTA_DELTA_SCOPE`의 default는 `off`로 유지된다** — 규칙을 그대로 적용한
  결과이지 판단이 아니다. `scope-delta.js` · `docs/environment/review.md` ·
  `plugins/mccp/commands/santa-loop.md`의 "M2가 뒤집는다"류 미래 시제를 실측 결과로
  교체했다(plan DD7).
- **PRD `santa-delta-review` M2 행은 `in-progress`** — Layer 2(라이브 리뷰어 비교)가
  미실행이라 milestone Outcome인 "탐지율 비교"가 아직 성립하지 않는다. `complete`로
  적는 것은 과대 주장이다(UI5). Open Question "탐지율 fixture를 어디서 얻는가"는
  해소(합성 + 계층화)하고, Layer 2 완주를 신규 Open Question으로 남겼다.

### Notes

- **이 milestone은 탐지율 보존을 주장하지 않는다.** 배송된 Layer 1이 인증하는 명제는
  "리뷰어에게 보일 기회가 있다"(containment)이고 "리뷰어가 찾는다"(detection)가
  아니다. fixture는 합성 N=1이며 계층당 결함 1건이다. 한계와 재현 절차:
  `.claude/notes/santa-delta-review-m2.md`.

---

## [1.32.3] — 2026-08-20

> **§3.7**: `1.32.2 → 1.32.3` (**patch** — M1은 santa-delta-review PRD 2 milestone
> 중 첫째라 PRD 전체 완료 축이 아니다). 4면(plugin.json · html.js page-foot ·
> markdown.js derived 줄 · 이 파일의 `currently` 노트)을 함께 맞추고
> `i18n-surface.test.js`가 재검증한다. **원래 `1.30.1`로 작성했으나 `origin/main`이
> 그 번호를 codex-intent-context M2(`9c6c836`)에 먼저 발행했기에 forward-only
> 상향으로 재동기했다** — 발행된 번호는 불가침이고 미머지 브랜치의 항목만 위로
> 민다(§3.7). 상향 시점은 M2 사이클의 `/mccp:prp-implement` Task 6 재계산이다.

---

### Added — santa 델타 리뷰 M1: 델타 스코프 계산 + 상태 단언 금지 가드

- **`plugins/mccp/scripts/lib/santa/scope-delta.js`** (신규 순수 oracle) — `parseDeltaScope`
  (`MCCP_SANTA_DELTA_SCOPE`, enum `enforce`/`off`, **default `off`**) · `narrowScope` ·
  `expandRanges`(±20줄 문맥 + 병합) · `renderScopeLines` · `assertNoStatusAssertion` ·
  닫힌 사유 enum `NO_NARROW` 4종 · 금지 패턴 2목록 · `deltaCoverageFrom` ·
  공유 술어 `isValidScopeRecord`. fs·git·시각을 모르고 외부 의존 0건.
- **`cli.js` 하위명령 `scope-delta`** — anchor를 호출자에게 받지 않고
  `.claude/state/santa-loop/tmp/<decision>/round-<r>-fix-rev.txt`를 자체 열거한다.
  **`--round`가 없다** — anchor 집합이 이미 라운드의 답이므로 UI3(라운드 1
  미적용)이 별도 검사가 아니라 `no-anchor` passthrough로 성립한다.
- **`lanes --ranges-file`** — 대상 경로 줄이 `- path:12-40, 88-95`로 렌더된다.
  데이터는 JSON 객체라 `assertSafeGraph` + 크기 상한 + 키 `toRepoRelative` 정규화를
  거친다(implement-gate security CRITICAL-1 · HIGH-2 · HIGH-3 흡수).
- **`begin-round --scope-*` 스칼라 4종** — 계측을 JSON 파일로 받지 **않는다**.
  원장에 durable하게 앜는 값이라 prototype pollution 경로를 설계로 제거한다.
- **receipt 계측 2종** — `meta.santa_delta_rounds` · `meta.santa_delta_paths_dropped`
  (present-only 비음 정수). **kill switch와 무관하게** stamp하므로 `off` 실행도
  `0`을 남기고, 필드 부재(M1 이전)와 관측된 0이 구별된다.

### Changed

- `santa-loop.md` Step 1이 `scope-delta`를 **`scope-always` 앞에** 호출한다 — UI4의
  상시 스코프 면제가 조건 분기가 아니라 **순서**로 성립한다.
- `scope-always`는 이제 좁혀진 스코프(`scope-narrowed.json`)를 받는다.

### Known limits (주장하지 않는 것)

- **탐지율 보존을 주장하지 않는다.** M1은 *스코프가 얼마나 줄었는가*를 재고,
  *줄여도 결함을 놓치지 않는가*는 재지 않는다 — 후자는 M2 소유다.
- 계측 2종은 **위조 저항을 주장하지 않는다**(DD11) — 값은 호출자 선언이고 CLI가
  git으로 재도출하지 않는다. 근거는 이 필드를 읽는 게이트가 없다는 것이다.
- 패턴 denylist는 **완결성을 주장하지 않는다**. 1차 통제는 `renderScopeLines`에
  서술 인자가 없다는 구조 분리다.

---
## [1.32.2] — 2026-08-21

> **§3.7**: `1.32.1 → 1.32.2` (**patch** — M7은 multi-session-work-loop PRD의 단일
> milestone이고 M8이 아직 pending이라 PRD 종료 축이 아니다). **번호를 세 번 상향했다**:
> 구현 시점에는 origin/main·브랜치가 모두 `1.30.0`이라 `1.30.1`을 잡았고, `/mccp:pr`
> 진입 직전 재계산에서 origin/main이 이미 `1.30.1`(codex-intent-context M2)과
> `1.30.2`(diverse-agent-review M7)를 발행해 `1.30.3`으로 밀었다. PR #154가 열린 뒤
> origin/main이 `1.31.0`(codex-intent-context M3)부터 `1.32.1`(impeccable-detection-contract
> M1~M6)까지 발행해, base를 머지하는 이번이 **세 번째 재계산**이다. 발행된 번호는 불가침으로
> 두고 미머지 브랜치 쪽만 밀어 `1.32.2`에 착지한다. 4면(plugin.json · html.js page-foot ·
> markdown.js derived 줄 · 이 파일의 `currently` 노트)을 함께 맞췄고
> `i18n-surface.test.js`가 재검증한다. 날짜는 작성일 그대로 둔다 — §3.7대로 version 순서가
> 정본이고 날짜 역전은 정상이다.

### Added

- **multi-session-work-loop M7 — 세션 경계 피드백 루프** (C1이 `forward-only` →
  `computed`). 한 세션에서 제기된 finding이 세션 경계를 넘지 못하고 사라지는 통로를
  닫는다. 게이트를 추가하지 않고 LLM 호출도 늘리지 않으며(UI3), 새로 만든 것은
  관측·전달 층뿐이다.
- `plugins/mccp/scripts/state/findings-registry.js` — append-only finding 레지스트리.
  git-tracked(`.claude/state/findings/<work_unit>.jsonl`)이라 worktree 정리 뒤에도
  살아남고, `merge=union` 선언으로 병렬 worktree 병합이 한쪽 append를 조용히 버리지
  않는다. **batch가 1급 API**이고 순차 append 공개 경로를 두지 않는다 — 두면
  "말미 k개 유실"이 되돌아온다.
- `plugins/mccp/scripts/derive/sources/findings.js` + `SOURCE_SCANNERS.findings` —
  C1의 producer. 전 샤드를 스캔하며 `type_separation` 계약을 **스캔 결과에서 파생**한다
  (하드코딩하면 계약 검사가 항진명제가 된다).
- `plugins/mccp/scripts/lib/msw-metrics/c1-coverage-gate.js` — 두 표면(`.claude/reviews/` ·
  `.claude/state/findings/`)에 **서로 다른 승인 writer 집합**을 건 정적 lint + 런타임
  falsifier + DD10 co-presence + `merge=union` 적용 검사, 그리고 수용 조건 5축을
  재판정하는 opt-in `--acceptance` 모드.
- 승격 경로 — `handoff-items.js`가 미해소 CRITICAL·HIGH를 4번째 항목 유형 `finding`으로
  열거하고, `state-injector.js`가 `## Open Findings` 블록으로 표면화한다. 임계는
  상수이고 env 토글이 아니다(UI7).

### Changed

- `computeC1`의 유형 분리 무결성 검사 정정 — 이전 추론 `(deferred + downgraded +
  rejected) > 0`은 **모든 finding이 실제로 고쳐진 작업 단위를 `invalid`로 판정**했다.
  즉 M7이 성공할수록 C1이 무효가 되는 구조였다. 이제 소스의 `type_separation` 계약을
  검사하며, 미선언(`type_separation_undeclared`)과 합 초과(`type_separation_violated`)를
  서로 다른 사유로 구분한다. `open_count`·`deferred_rate`를 함께 보고한다.
- `intent-context.js` — sanitizer 4종(`escapeReferenceText` · `trimDanglingEscape` ·
  `anyTokenMixedScript` · `looksDirective`)을 `module.exports`에 추가. 승격 표면이
  §3.13이 이미 배송한 주입 경계를 **재사용**하기 위한 전제이며 판정 로직은 무변경이다.
- 대시보드 C1 행이 폐쇄율과 이연률을 **분리 표기**한다. 단일 폐쇄율만 보이면 이연으로
  100%를 만드는 경로가 표면에서 사라져 UI5의 유형 분리가 렌더 층에서 무너진다.
- `assertion-manifest-check.js`의 `REQUIRED_IDS`가 **milestone별로 분리**됐다. 평면
  목록이면 M6 manifest는 C1 id가 없어서, M7 manifest는 B1 id가 없어서 서로를 영구히
  붉힌다. 미등록 milestone은 fail-closed다.

### Fixed (`/mccp:code-review` local review 흡수 — HIGH 4 · MEDIUM 4 · LOW 3)

커밋 전 로컬 리뷰가 낸 11건을 전량 흡수했다. HIGH 셋은 **이 milestone의 자기 방어 논리가
실제로는 반대 방향으로 작동하거나 정상 입력에서 오탐**하던 것이고, 넷째는 무관한 게이트
약화가 diff에 섞여 있던 것이다. 각 항목은 실측으로 재현한 뒤 회귀 단언을 붙였다.
manifest 하한(32)은 넓히지 않았다 — 하한은 상한이 아니고, plan의 `## Assertion Roster`는
`plan_hash`로 봉인돼 있어 편집하면 §3.11 가드 2가 그 사이클의 PR을 막는다.

- **`.claude/settings.json`의 `MCCP_PLAN_REVIEW_ROLES_MIN` 변경을 되돌렸다.** `5 → 1`이
  들어가 있었는데, `5`는 `MAX_OF(4)` 초과라 loud warn 후 기본값 `3`으로 폴백하던 값이므로
  **실효 하한이 3에서 1로** 떨어져 L2 패널 quorum이 단일 역할로 충족 가능해지는 변경이었다.
  plan의 `Files to Change`·CHANGELOG·설계 문서 어디에도 선언이 없고 M7 범위와도 무관하다.
  게이트 강도 조정은 별도 축이며 근거와 함께 선언되어야 한다.
  **rebase 후 정정(2026-08-21)**: origin/main이 `v1.30.2`(diverse-agent-review M7,
  커밋 `c9e941c`)에서 같은 `5 → 1`을 **의도적으로 발행**했다. 본 브랜치를 그 위로
  rebase하면서 트리의 값은 main의 `1`이다 — 재-revert하지 **않는다**(머지가 다른 PR의
  결정을 조용히 되돌리는 것이 정확히 §3.5.1이 금지하는 바다). 따라서 이 항목이 소유하는
  것은 “선언 없는 게이트 약화를 이 diff에서 걸러냈다”이고, 현재 값의 근거는 main의 `v1.30.2`다.
- **DD3 비재발 종결의 오차 방향을 정정했다.** 매칭 실패는 분모만 늘리는 것이 아니라
  prior를 `fixed`로 **닫는다**(분자 +1). 즉 2차 키를 *끄는* 세 제약이 C1을 **부풀리는**
  방향으로 작동했고, 그것은 UI5가 조작 경로로 지목한 방향이다(실측: 참값 `0/1`이 `1/2`로
  보고). 이제 같은 리뷰어 축과 대조가 성립할 때만 종결하고, 대조 불가는 **판정을 보류**한다.
  통상 경로(빈 수렴 라운드)는 그대로 종결하므로 지표는 죽지 않는다.
- **coverage gate 런타임 falsifier의 오탐을 닫았다.** 표면(`record.js`)과 emit
  (`plan-review/cli.js`)의 포함 조건이 달라, claim 없는 리뷰어 출력이나 내용이 같은 중복
  행에서 유실이 없는데도 *"events were lost"* 로 **오진하며 차단**했다(실측: 행 3 · 이벤트
  2 · fold 1 → exit 1). 표면 쪽도 emit 술어와 `finding_id` fold를 따르게 했다. 반대 방향
  사각(다른 게이트의 finding이 패널 유실을 가림)도 같은 줄에서 닫았다.
- **`appendFindings`가 `kind` 검증을 `seq` 할당보다 먼저 한다.** 뒤에 있어서 호출자 버그가
  번호를 소진한 뒤 아무것도 쓰지 않아, 디스크 실패와 구분되지 않는 구멍을 마커 없이 남기고
  그 샤드를 **영구히** `degraded`로 만들었다(evict·재작성 금지 계약상 비가역 → `--acceptance`
  영구 실패).
- `findings-registry.js`의 리터럴 NUL 바이트 2개를 `\0` 이스케이프로 바꿨다. 해시 구분자는
  그대로 U+0000이라 committed 샤드의 `finding_id`는 불변이고, `file(1)`·grep·ripgrep이
  이 모듈을 binary로 건너뛰던 것이 해소됐다(이 저장소는 grep 기반 감사에 의존한다).
- Plan-Codex emit이 finding 배열 첨자를 `round`로 싣던 것을 제거했다. `seal.js`는 같은
  필드에 진짜 라운드 번호를 싣고 reader는 둘을 구분하지 않는다.
- **test 4종이 주변 `MCCP_REVIEW_SINGLE_PASS`를 중화한다.** 저장소 자신의 tracked
  settings 때문에 **기본 개발 환경에서** `santa-loop-cap` 28건 · `santa-adjudication` 22건 ·
  `santa-lanes` 1건 · `receipt/tests/review-single-pass-fields` 2건이 붉어져, 실제 회귀와
  env 잡음을 구분할 수 없었다(각 파일 단독 `env -u` 실행은 0 fail 로 격리 확인). 마지막
  파일은 **토글이 꺼져 있을 때**를 단언하는 test 를 갖고 있어 ambient 값이 새면 그 단언이
  기본 환경에서 성립할 수 없었다. 축을 켜서 보는 test 는 스스로 값을 설정했다가 되돌린다.
- `codex-findings-backlog.md`에서 선행 `|`가 빠져 4열 파서(`derive/sources/backlog.js`)에
  잡히지 않던 행 1건을 정정했다(§3.15 "4열 고정" 계약). 정정 후 137행 · `invalid_count: 0`.
- 승격 블록의 `source` 경로도 코드 스팬으로 감싼다(`cited_path`만 감싸면 방어가 반쪽) ·
  `normalizeCitedPath`가 `repoRoot` 부재 시 트리 밖 상대경로도 placeholder로 접는다 ·
  `eventToJsonLine`의 상한 초과 분기가 `truncated` 키만 더해 줄을 **키우던** 것을 실제
  절삭으로 고쳤다(필드 캡 때문에 여전히 도달 불가한 분기이나, 도달 시의 계약을 맞춘다).

## [1.32.1] — 2026-08-24

> **§3.7**: `1.32.0 → 1.32.1` (**patch** — PRD 안의 단일 milestone(M6) ship이다. minor가
> 아닌 이유는 새 기능이 아니라 기존 표면의 개선이기 때문이고, `1.32.0`이 «PRD 종료»라
> 적었던 것은 위 정정대로 사실이 되지 못했다). 병렬 브랜치 충돌 점검(착수 시점):
> `origin/main`이 `1.31.0`이고 sibling worktree `env-contract-integrity`는 `1.30.0`에 머문
> 문서 전용 브랜치라 `1.32.1` 자리가 비어 있다. 4면(plugin.json · html.js page-foot ·
> markdown.js derived 줄 · 이 파일의 `currently` 노트)을 함께 맞췄다.
> **PR 진입 직전 재계산 필수.**

**impeccable-detection-contract M6 — 이연 정리와 질문 종결 (patch, `1.32.0 → 1.32.1`)** —
새 능력은 없다. 게이트가 발화하는 대상도 판정 결과도 바뀌지 않고, 바뀌는 것은 **잘못된 입력을
거부하는 자리**와 **거짓으로 적혀 있던 주장**뿐이다.

### Added

- `EVIDENCE_DEBT_CEILING` (`env-contract/evidence-debt.js`) — 래칫의 **증가** 방향을 가시화한다.
  로드 시점에 `length <= CEILING`을 throw로 강제하고 test가 `CEILING === length`를 짝으로
  단언하므로, 이름을 늘리려면 상수를 올리는 별도 편집이 필요하고 그 사실이 diff에 숫자로 남는다.
  금지가 아니라 가시화다 — 숫자는 상한이지 정원이 아니고 신원은 여전히 이름 목록이 갖는다.
- `L10_REVERSE_SURFACE_POLICY` (`env-contract/lint.js`) — L10 역방향 전용 표면 정책.
  `env-contract/value.js`를 역방향에**만** 더하고 나머지 6개 파일을 **이름과 사유로** 열거한다
  (mirror: `toggle-snapshot.js`의 `TOGGLE_EXCLUSIONS`). 표는 강제된다 — 그 디렉토리에 분류되지
  않은 `.js`가 생기면 L10이 붉다. 단 디렉토리 자체가 없는 root는 «적용 대상 없음»이지 실패가
  아니다.

### Changed

- `receipt/schema.js` — `meta.impeccable_commands_routed[]` 항목이 정확히
  `command`/`call_form`/`status` 셋만 갖도록 강제한다. 여분 키는 producer와 consumer가 어긋난
  신호이므로 정규화하지 않고 **거부**한다. present-only 계약은 유지(`null`/`undefined` 무검사).
  legacy 예외는 두지 않는다 — 착수 전 실측이 저장소 전체에서 비정규 키 0건을 봉인했고, 예외가
  곧 위조된 entries 파일의 통로다.
- `receipt/write.js` — 최초 write 경로가 `--impeccable-commands-routed-file`을
  `path.resolve(cwd, ...)`로 정규화한 뒤 읽고, 각 항목을 `canonicalRoutedEntry`로 통과시켜
  `null`이면 throw한다(restamp 경로 `:1223-1231`과 같은 문형). **부재는 여전히 조용하다** —
  파일이 없으면 `null`("기록하지 않음")이고, *있는데 형식이 틀린* 경우만 막는다.
- `commands/prp-implement.md` — `isSurface`의 죽은 `.claude/cache/` 항을 두 곳(2.5.5b ·
  Phase 3.6)에서 제거하고 왜 지웠는지·무엇이 남는지를 그 자리에 적었다. 그 분기는 파일 집합이
  tracked diff ∪ non-ignored untracked이고 `.gitignore:131`이 그 경로를 양쪽에서 배제하므로
  참이 될 수 없었다.
- `env-contract/measure-evidence.js` — 로컬 `WINDOW`/`hasName`을 지우고 `lint`가 re-export하는
  `EVIDENCE_WINDOW`/`nameAppears`를 쓴다. **재는 자와 강제하는 자가 하나**여야 창을 넓히는
  변경이 한 쪽만 고쳐지지 않는다. export 이름은 유지해 기존 호출자 계약을 깨지 않는다.
  통합 전후 A/B/C 동일(A 115 · B 24 · C 5 · not-consumed 19).
- `env-contract/scan.js` — `isExcluded`가 경로 substring(`indexOf('env-contract') !== -1`)
  대신 실제 디렉토리 앵커를 쓴다. 오늘 이 변경이 고치는 파일은 **0건**이고(디렉토리 밖에 그
  substring을 가진 파일이 없다) 막는 것은 미래의 조용한 면제다.
- `docs/environment/external.md` — `IMPECCABLE_NO_UPDATE_CHECK`와
  `IMPECCABLE_LIVE_DEBUG_EVENTS`의 «기본값» 표기가 색인(`off`)과 상세(«미설정»)에서 달라
  보였는데, **둘은 다른 질문에 답한 것**이었다. registry의 DD2가 `bool`/`bypass-flag`의
  `default`와 `polarity`를 «같은 사실의 두 표기»로 못박으므로 색인의 `off`는 벤더가 설정하는
  값이 아니라 **극성**(미설정 시 동작)이다. 그래서 색인·registry는 그대로 두고 상세 쪽 문구를
  «`off` (= 미설정 시 동작. 벤더는 설정하지 않으므로 원문도 unset)»으로 명확히 했다.
  처음에는 반대 방향으로(색인을 `—`로) 고쳤다가 `registry.test.js`의 DD2 단언이 그것을
  붉혀 방향을 바로잡았다 — 그 test가 이 축의 정답을 알고 있었다.

### Fixed

- **거짓 주석 3면.** `MCCP_PLAN_REVIEW_`(끝이 밑줄)가 «경계 일치로는 원리상/절대 A가 될 수
  없다»는 주장이 `measure-evidence.js` · `evidence-debt.js` · `docs/gate-design.md`에 있었고
  실행이 반증한다(`nameAppears('MCCP_PLAN_REVIEW_ 뒤에 공백', ...)` → `true`). 참인 문장으로
  바꿨다: 그 이름은 코드에서 **항상 다른 이름의 접두사로만** 나타나므로 표면에서 A가 되지
  않으며, 그것은 정규식의 원리가 아니라 **관측된 성질**이다.
- **`.claude/state/fix-task-applied.md`의 fingerprint 드리프트** — `task_fingerprint`가
  `…-m4`인데 `decision_id`와 originating receipt는 `…-m5`였다.
- **Task 3의 부작용 1건** — `prp-implement.md`에 주석을 넣으며 행이 밀려
  `IMPECCABLE_FORCE_OVERRIDE_REASON`의 registry evidence(`:702`)가 창 밖으로 나갔다. 실제 read
  site(`:713`)로 옮겼다. impeccable 축 이름이라 면제 목록에 넣을 수 없고(그것이 M5의 설계다)
  옮기는 것이 유일한 해소다.
- **`/mccp:code-review` 지적 7건 전건 흡수 (ship 직전).** §3.14는 HIGH만 즉시 흡수하도록
  정하지만 사용자 판단으로 MEDIUM·LOW까지 함께 닫았다.
  - **HIGH — `evidence-name.js` 헤더가 M6이 바꾼 자기 동작을 부정하고 있었다.** 그 파일은 L10의
    판정 코어인데 헤더는 «substring 제외» · «그 디렉토리를 영원히 못 본다» · «2차 검사는
    backlog에 있다»를 유지했다 — 셋 다 Task 6 이후 거짓이고, 마지막 것은 backlog가 같은 축을
    `[해소 v1.32.1 M6 — Task 6]`으로 표시한 것과 정면 충돌한다. 「거짓 주석 3면 정정」을 내건
    milestone이 **네 번째 면**을 자기 코어에 남겼다. 잔여(그 디렉토리의 *다른* 파일이 장래에
    env를 읽는 경우)도 함께 명시했다.
  - **MEDIUM — 두 벌 키 목록에 일치 단언이 없었다.** `write.js`(producer)와 `schema.js`
    (validator)의 `ROUTED_ENTRY_KEYS`는 require 순환 때문에 복제가 정당하지만, **단언 없는**
    복제는 Task 5가 `measure-evidence.js`에서 지운 결함과 같은 형태다. 양쪽이 상수를 export하고
    test가 대조한다.
  - **MEDIUM — backlog 표가 빈 줄로 두 조각이었다.** M6이 등재한 이연 4건이 헤더 없는 표가 되어
    렌더에서 표 밖으로 나갔다(`derive/sources/backlog.js`는 빈 줄을 건너뛰므로 파싱 292건은
    무영향 — 렌더만 깨졌다). 같은 파일에서 자기 셀에 리터럴 파이프를 담아 **스스로 잘리던** 행도
    HTML 엔티티로 고쳤다(파서 원인은 여전히 미해소 — 그 행이 기술하는 그대로다).
  - **MEDIUM — 주석의 예시가 검사 범위 밖이었다.** `scan.js`·`gate-design.md`가 substring 제외의
    예로 `docs/env-contract-notes.md`를 들었으나 `walkSurfaces`는 `scripts/`·`commands/`만 걷는다.
    범위 안의 예시로 바꿨다.
  - **LOW — 정책표 화석 방지가 한 방향뿐이었다.** `L10_REVERSE_SURFACE_POLICY`는 *새* 파일만
    붉혔고, 열거된 `include:false` 파일이 디스크에서 사라져도 조용했다(읽지 않으므로). 이제
    부재도 problem이다 — `EVIDENCE_DEBT`의 축소 래칫과 같은 형태.
  - **LOW — CHANGELOG 헤딩 날짜**를 실제 ship 일자로 맞췄다.

### Docs

- `docs/gate-design.md#impeccable-detection` — M6 절 추가, 래칫 두 방향의 강제 수단 정정,
  L10 범위 문단 갱신, A/B/C 절의 «원리상» 주장 정정.
- `CLAUDE.md` §3.17 — 상주 불변식 한 문단(래칫 두 방향 + L10 범위). 나머지는 gate-design.
- `.claude/prds/impeccable-detection-contract.prd.md` — Open Questions 3건을 근거와 함께 닫고,
  잔여가 있는 항목은 잔여를 명시했다(hook 이중 등록의 **라이브** 관측은 CLI 동시 설치 환경이
  필요해 남긴다 — 위 판정은 구성 판정이지 라이브 측정이 아니다).
- `.claude/notes/impeccable-detection-contract-m6.md` — 착수 전 실측 5건과 Open Questions
  측정의 **방법 · 관측 · 판정할 수 없는 것**.

## [1.32.0] — 2026-08-23

> **v1.32.1 정정**: 아래 «M5가 마지막 milestone이고 PRD 전체가 종료된다»는 서술은 그 시점의
> 계획이었고 사실이 되지 못했다. M1~M5가 자기 축의 이연을 backlog에 쌓아 두었고 PRD가 연 채로
> 둔 질문이 3건 남아 있어, 그것들을 닫는 M6이 `1.32.1`로 추가됐다. 원문은 그대로 둔다.
>
> **§3.7**: `1.31.4 → 1.32.0` (**minor** — M5는 impeccable-detection-contract PRD의
> **마지막** milestone이고 M1~M4가 이미 ship됐으므로 PRD 전체가 종료된다. 같은 PRD의
> patch 누적(`1.31.1`~`1.31.4`)이 여기서 다음 minor로 정리된다). 병렬 브랜치 충돌 점검:
> `origin/main`이 `1.31.0`이고, 유일한 sibling worktree `env-contract-integrity`는
> `1.30.0`에 머문 문서 전용 브랜치(`.claude/_meta/` · PRD 4파일)라 `1.32.0` 자리가 비어
> 있고 파일 겹침도 없다. 4면(plugin.json · html.js page-foot · markdown.js derived 줄 ·
> 이 파일의 `currently` 노트)을 함께 맞췄고, `i18n-surface.test.js`는 manifest에서
> 기대값을 파생하므로 고칠 리터럴이 없다. **PR 진입 직전 재계산 필수.**

**impeccable-detection-contract M5 — 문서·계약 드리프트 정리 (minor, `1.31.4 → 1.32.0`)** —
M1~M4가 탐지·판정·이름·발화를 고쳤다면, M5는 **그 사실들을 적어 둔 곳**을 고친다. 그리고
같은 드리프트가 다시 조용히 생길 수 없게 그 질문을 lint에 넣는다.

### Added

- `env-contract/evidence-name.js` — L10의 순수 판정 코어. 정방향(evidence 행 ±2 창 안에 그
  이름이 있는가) · 역방향(`not-consumed`이면 런타임 표면에 그 이름이 **없어야** 한다) ·
  래칫(열거된 이름만 면제하되 고쳐졌는데 남아 있어도 붉다)을 한 순수 함수로 판정한다.
  `lint.run()`에 주입 지점이 없어 fixture registry로 래칫을 단위 test할 수 없었기 때문에
  분리했다 — `evidenceLexicalProblem`·`rawComparisonHits`가 이미 같은 이유로 export돼 있다.
- `env-contract/evidence-debt.js` — 비-impeccable 잔여 **29건**의 이름 + 소유 축. 숫자 상한이
  아니라 이름 목록인 이유는 숫자가 신원을 감추기 때문이다(하나 고치고 하나 깨뜨리면 숫자는
  그대로다). **로드 시점에 자기 검증하고 위반이면 throw한다** — 배열 아님 · 형식 오류 · 중복 ·
  registry 미등재 · `^(MCCP_)?IMPECCABLE_` 매칭. 이 저장소의 test는 어떤 CI도 돌리지 않으므로
  test에만 있는 불변식은 커밋을 막지 못한다.
- `env-contract/measure-evidence.js` — A/B/C 재측정 스크립트(read-only, `--json`). 노트의
  수치가 문서 안의 숫자가 아니라 재현 가능한 출력이 되게 한다. **경계 일치**를 써서
  `MCCP_PLAN_REVIEW_L3`가 적힌 행이 `MCCP_PLAN_REVIEW`를 인증하는 접두사 충돌을 배제한다.
- `env-contract/lint.js` **L10** — 위 코어를 `run()`에 배선. 래칫 로더는 fail-closed이고,
  실패 시 면제 집합이 빈 집합이 되어 정방향 검사가 전부 그대로 판정된다.
- `env-contract/tests/evidence-debt.test.js` — 래칫 양방향 · `not-consumed` 역방향 ·
  로더 실패 · vacuous 가드 · 접두사 충돌 12 test. `lint.test.js`에 L10 음성 fixture 2건 추가
  (하나는 **L8이 통과하는 상태에서** L10만 붉어지는 것을 보여 두 검사의 차이를 고정한다).

### Changed

- `env-contract/registry.js` — status에 `not-consumed` 추가. `IMPECCABLE_*` 19종이 그 status로
  가고 evidence는 read site 대신 `docs/environment/external.md`의 자기 절을 가리킨다. 근인은
  부주의가 아니라 **만족 불가능한 스키마**였다: evidence 계약이 read site를 요구하는데 이
  부류에는 read site가 존재하지 않아(M3가 벤더 사본을 지웠으므로 impeccable 본문도 가리킬 수
  없다) 무관한 한 줄이 19번 적혔다. `L7`은 status로 분기하지 않으므로 이 19종은 **여전히**
  사용 예시를 요구받는다 — 조용히 검사 밖으로 나가지 않게 하려는 명시적 결정이다.
- `env-contract/registry.js` — B-class 4건의 evidence를 실제 read site로
  (`impeccable-routing.js` 118→164 · 127→173 · `impeccable-detect.js` 301→319 ·
  `prp-implement.md` 224→702). `MCCP_IMPECCABLE_SKILL`은 `string` → **`enum`**
  (`available` · `missing`) — `impeccable-detect.js:322-330`이 그 둘 밖의 값을 WARNING과 함께
  버리므로, "impeccable skill 이름"이라는 옛 설명대로 쓰면 아무 일도 일어나지 않았다.
- `docs/environment/external.md` — 19개 절의 자기모순 해소(헤더가 "기본값 없음"이라 적으면서
  같은 절의 보존 표는 구체값을 적고 있었다 → 이제 **벤더 관측**임을 명시하고 원문과 같은 값을
  싣는다) · `<사유를 한 문장으로>` 템플릿 오염을 실값으로 · **거짓 셸 예시 제거**(그 변수는
  impeccable 프로세스가 읽으므로 `/mccp:*` 앞에 붙여도 아무 일도 일어나지 않는다) ·
  `IMPECCABLE_VERSION`의 거짓 주장에 **정정 줄**을 덧붙임(보존 원문은 지우지 않는다 — 고쳐
  쓰면 아카이브가 아니게 된다).
- `docs/environment/review.md` · `docs/ENVIRONMENT.md` — `MCCP_IMPECCABLE_SKILL`을 enum으로
  동기하고, 이 override가 **외부에 따로 설치한 경우를 위한 장치**임을 명시. 공식 채널
  설치자에게 env 설정을 요구하는 것은 의도된 사용법이 아니라 결함이다.
- `CLAUDE.md` §1.1 — impeccable을 번들하지 않는 **근거**를 정정. "mccp 본문이
  `Skill(impeccable, ...)`을 그대로 호출하므로"는 v1.31.3(M3) 이후 거짓이다(실측: 그 리터럴
  7건은 전부 주석·test이며 명령 본문 0건). 결론은 유지하되 근거는 "vendor하면 사용자가 설치한
  채널과 **다른 본문**을 열게 되어 M3의 계약이 깨진다"로 바꿨다.

### Fixed

- `plan-review/cli.js` — `MCCP_PLAN_REVIEW_TEST_INVOKE`를 registry에 등재하자(origin/main
  `b111dca`에서 상속된 L1 red) 그 이름이 L9의 boolean 집합에 들어가 raw 비교 한 줄이 붉어졌다.
  `parseBool`로 옮겼고 bypass-flag 분기가 `raw === '1'`이라 **바이트 단위로 동일**하다.
  plan은 "1행 등재 · 런타임 무변경"을 예상했으나 실제로는 한 줄이 더 필요했고, 그 사실을
  숨기지 않는다.

## [1.31.4] — 2026-08-23

> **§3.7**: `1.31.3 → 1.31.4` (**patch** — M4는 impeccable-detection-contract PRD의
> 네 번째 milestone이고 PRD는 M5가 남아 여전히 in-progress다). 병렬 브랜치 충돌 점검:
> `origin/main`이 `1.31.0`, 이 브랜치의 미머지 항목이 `1.31.1`(M1)·`1.31.2`(M2)·
> `1.31.3`(M3)이라 `1.31.4` 자리가 비어 있다. 4면(plugin.json · html.js page-foot ·
> markdown.js derived 줄 · 이 파일의 `currently` 노트)을 함께 맞췄고,
> `i18n-surface.test.js`는 manifest에서 기대값을 파생하므로 고칠 리터럴이 없다.
> **PR 진입 직전 재계산 필수** — 병렬 브랜치가 그 사이 자리를 가져갈 수 있다.

**impeccable-detection-contract M4 — 게이트 발화 정합 (patch, `1.31.3 → 1.31.4`)** —
M1~M3이 탐지를 정직하게 만들고 이름을 바로잡았다면, M4는 **그 이름으로 무엇을 부르는가**를
다룬다. 세 축을 닫는다: 완주 불가능한 발화를 빼고, 발화가 0인 단계에 자리를 주고, 오라클 밖에서
일어나던 발화를 오라클 안으로 들여 기록되게 한다.

### Changed

- `impeccable-routing.js` — implement 게이트의 `shape`가 `background` → `recommend`로 강등된다.
  벤더가 자기 메타데이터(`command-metadata.json`)에 "Runs a **required** multi-round discovery
  interview"라 적었고, `context.mjs:1121`의 `BUILD_INIT_REQUIRED`는 비대화형 실행에서 "structured
  simulated user"로 인터뷰를 대신하라고 한다 — 즉 게이트가 조용히 실패하는 것이 아니라 **제품
  진실을 지어내어 사용자 저장소에 PRODUCT.md를 쓴다**. 카탈로그에서 빼지 않고(UI5) call form만
  내렸다. 부작용을 숨기지 않는다: 이후 `resolveCallForm`은 `background`를 **절대 반환하지 않는다**.
  `schema.js`의 enum과 명령 본문 표는 **남긴다**(좁히면 과거 receipt 해석이 바뀌고, `background`는
  정당한 미래 base다) — 대신 test가 전수 조합에서 도달 불가를 단언해, 다시 도달 가능해지는 날
  붉어지게 한다.
- `impeccable-routing.js` — 테이블에 `phase` 축(`pre`/`finish`)이 생긴다. `clarify`·`distill`이
  `recommend`/pre에서 `invoke`/finish로 옮겨가고, `polish`·`harden`·`optimize`가 finish 엔트리로
  신설된다(implement 16 → 19, pre 14 + finish 5). **새 callForm이 아니라 phase인 이유**: `'finish'`
  callForm을 만들면 `resolveCallForm`·`selectByDiffSignals`·receipt schema의 닫힌 enum이 전부 따라
  움직인다. phase는 기존 내부 메타(`signal`)의 형제라 공개 반환에서 strip되고 **schema를 한 줄도
  건드리지 않는다**. plan·prd·pr 테이블은 전 엔트리가 `pre`이므로 세 게이트 출력은 바이트 동일하다.
- `prp-implement.md` Phase 3.6 — 하드코딩된 `clarify`/`distill`/`polish` 나열을 오라클 호출
  (`phase:"finish"`)로 교체하고, 산출 diff로 `renderingSurface`·`diffSignals`를 재계산한 뒤
  2.5.5b와 동일한 callForm 처리표로 `{command, call_form, status}`를 누적한다. 2.5.5b는
  `phase:"pre"`를 명시한다. **duplicate-call 불변식이 산문에서 필터로 옮겨졌다** — 엔트리는 정확히
  한 phase에만 속하므로 두 패스가 같은 명령을 부를 수 없고, test가 두 집합의 교집합이 공집합임을
  단언한다. 이전에는 두 목록을 손으로 맞췄고 이미 어긋나 있었다(Phase 3.6이 `polish`를 불렀는데
  implement 테이블에는 그 엔트리가 아예 없었다).
- `CLAUDE.md` §3.10 — 라우팅되는 것처럼 읽히던 stage→command 나열을 걷어내고(그 표는 오라클이
  소유한다) M4 문단으로 대체. 상세는 `docs/gate-design.md`가 소유한다.

### Added

- `receipt/write.js` `restampRoutedCommands` + `receipt/cli.js restamp-routed` — finish 패스는
  2.5.6 receipt write **이후**에 도는데 유일한 사후 restamp(`restampGroundingVerdict`)가 grounding
  한 키만 건드려서, 실제 발화가 receipt에 **기록될 경로가 구조적으로 없었다**. 이 restamp가 그
  경로다. `restampGroundingVerdict`를 미러한 field-preserving 형태이고 **schema 변경은 0**이다.
  - **restamp 간 append-only, dedupe 없음** — duplicate-call 불변식이 깨져 한 명령이 양쪽 패스에서
    발화하면 receipt에 두 번 보이는 것이 그 drift 신호다. 합치면 이 필드의 존재 이유가 사라진다.
  - **한 restamp 안에서는 멱등**(Codex Implement-R1 F1) — 같은 restamp의 **재시도**가 두 번째
    이력을 위조하면 안 된다. 판별자는 canonical 항목형 tail match이고, 판정은 `updateReceipt`의
    **임계구역 안**에서 이뤄진다(락 밖이면 검사와 쓰기 사이에 꼬리가 바뀔 수 있다 — §3.12가 막는
    lost-update와 같은 부류). 불확실하면 append한다: 중복은 보이고 복구 가능하지만 진짜 두 번째
    패스를 삼키면 기록이 사라진다.
  - **게이트는 `mccp-implement-codex` 하나로 제한**한다. `store.js#assertNoTrackedOverwrite`가
    이미 tracked ship receipt 재봉인을 거부하므로 §3.12 불변식은 이 제한 없이도 지켜졌지만, 락
    안에서 시도한 뒤 거부하는 형태였다 — 문 앞에서 이름을 대는 편이 낫다.
  - **항목 키가 정확히 셋이 아니면 거부**한다. `schema.js`는 세 필수 필드를 검증하되 여분 키를
    금지하지 않으므로 writer가 막는다. 조용히 정규화하지 않는다 — 예상 밖 키는 producer와
    consumer가 어긋났다는 뜻이고, 버리면 caller가 믿는 것과 다른 receipt가 봉인된다.
- `impeccable-routing.js` `INTERVIEW_REQUIRED_COMMANDS` — 벤더가 인터뷰로 막는 명령 집합
  (`shape`/`init`/`teach`). `teach`는 4.1.1 `command-metadata.json`의 23개 카탈로그에 **없지만**
  `context.mjs`의 차단 문장은 부른다(벤더 측 불일치). 그래도 집합에 두는 이유는 목적이 "미래에
  카탈로그가 넓어질 때 인터뷰형 명령이 조용히 발화하지 않게 막는 것"이기 때문이다. mccp 카탈로그와의
  **오늘 교집합은 `shape` 하나**.
- test — `impeccable-routing.test.js`에 전수 조합(gate × mode × renderingSurface × phase ×
  designIntentActive × intentCommands = 128) 위의 M4 metric(인터뷰형 명령 발화 0) · `background`
  도달 불가 · phase 필터 무해성(plan/prd/pr 명시 배열 pin) · 0-발화 단계 tally가 정확히
  `{discovery, system}` · phase 미유출 · 미지 phase가 빈 목록임을 추가. `restamp-routed.test.js`
  신설(14건 — append/멱등/인접 필드 보존/digest 재봉인/키 거부/게이트 거부). `impeccable-guard.test.js`에
  **짝 단언** 추가: 본문이 `phase:"finish"`를 부르는 것과 `restamp-routed`를 부르는 것이 **같은 값**
  이어야 한다(반쪽 착지 차단, M3 선례).

### Fixed

- Phase 3.6의 발화가 receipt에 기록되지 않던 결함. `impeccable_commands_routed`는 pre 패스만 담고
  있었고, 오라클은 `clarify`/`distill`을 `recommend`로 답하며 `polish`는 아예 미등재였다 — receipt가
  실제 발화를 **덜** 보고했다.
- 발화가 0이던 `harden` 단계. `harden`·`optimize`는 산출된 코드를 손보는 성질이라 finish 자리를 준다.
  `onboard`은 "없던 표면을 새로 짓는" 명령이라 **제외**하고 recommend로 남긴다 — 이 구분이 단계를
  열되 scope 확장은 막는 선이다.

**`/mccp:code-review` 흡수 9건** (같은 사이클, ship 전) — 위 배선이 처음 착지했을 때 **실행되지
않는 상태**였다. 리뷰가 그것을 잡았고 전건 흡수했다.

- Phase 3.6.5의 두 `node` 호출이 여는 따옴표 없이 `cli.js"`로 닫혀 있었다. `bash -n`이 두 블록
  모두 `unexpected EOF`로 거부하므로 restamp는 **한 번도 실행될 수 없었고**, 그 사이클의 발화는
  다시 기록되지 못했다 — M4가 닫으려던 바로 그 갭이다. 라이브에서 관측된 "restamp 3회 실패"는
  plugin cache가 pre-M4(1.31.0)라는 것만으로 귀속돼 있었으나, 이 결함은 cache를 갱신해도 남는다.
- Phase 3.6.2가 `$SIGNAL`·`$DESIGN_INTENT_ACTIVE`를 2.5.5b에서 **셸 변수로 물려받으려** 했다.
  두 갈래로 틀린다: 셸 상태는 도구 호출 경계를 넘지 못해 빈 문자열이 되고(그러면 오라클이
  `skipped:true`로 **아무것도 라우팅하지 않은 채 정상 종료**한다), 설령 살아남아도 `SIGNAL`은
  sub-phase 3.5.0의 ultracode probe가 **이미 덮어쓴** 값이다. 같은 파일이 Phase 3.7에서 이미
  self-derive로 닫아 둔 함정이라, 그 패턴을 그대로 따라 `FINISH_*` 이름으로 재도출한다.
- 3.6.1의 잔존 조건("rendering surface가 있을 때만")이 3.6.2의 서술과 모순됐다. `renderingSurface`는
  게이트 조건이 아니라 **오라클 입력**이다 — control-plane-only diff에서는 finish 행이 `recommend`로
  강등되고 그 사실이 기록되는데, 게이트로 쓰면 그 기록마저 사라진다.
- `restamp-routed`가 빈 entries 배열에서 receipt 존재를 확인하지 않고 exit 0을 냈다. 호출부는 exit 0을
  "기록됨"으로 읽으므로 **대상이 아예 없는 restamp가 성공으로 보고**됐다. 이제 부재는 `RECEIPT_NOT_FOUND`이고,
  두 no-op(`no-entries` · `already-recorded`)은 `reason`으로 갈라져 로그에서 구분된다.
- `ROUTING_PHASES`가 소비처 0이었다. 오타난 phase는 두 패스 모두에서 필터링돼 그 명령이 **조용히
  사라지므로**(런타임에 아무것도 던지지 않는다) 테이블 전수 검증으로 그 실패를 가시화한다.
- 나머지: `--git-dir` → `--git-path`(파일 내 worktree-safe 관례와 통일) · `background` 행이 현재
  도달 불가임을 표에 명시 · Phase 3.6/3.7 사이 `---` 복원.
- **그물 보강** — 위 첫 항목은 기존 짝 단언(리터럴 존재 검사)을 그대로 통과했다. grep 형태의 가드가
  구조적으로 못 보는 부류라, `prp-implement.md`의 모든 self-contained bash fence를 `bash -n`으로
  파싱하는 test를 추가한다(플레이스홀더 `<...>` fence는 제외 — 문서 관례이지 결함이 아니다).
  결함을 재주입해 red가 나는 것까지 확인했다.

### Known limitations

- **UI12를 문자 그대로 달성하지 않는다.** discovery(벤더 인터뷰 요구)와 system(v1.13.0 M3의
  deliberate-operator 결정)은 발화 0으로 남는다. M4는 UI12를 "모든 단계가 발화하거나, 발화 0인
  단계는 증거와 함께 기록되고 test로 고정된다"로 읽고 그렇게 착지했다.
- **restamp 실패는 receipt만으로 탐지할 수 없다.** fail-open을 유지하되(advisory phase의 성질을
  M4가 바꾸지 않는다) 재시도 3회 · entries 산출물 보존 + 복구 명령 출력 · `fix-task.md` 인계 ·
  REPORT 기록으로 **시끄럽고 복구 가능한** 소실로 만든다. 검증기가 요구할 수 있는 receipt 내 상태를
  만들려면 present-only meta 필드가 필요하고 그것은 "schema 변경 0" 제약 밖이다(Codex Implement-R1 F2).
- **finish 5종의 발화 비용은 실제로 는다**(3종 → 5종). 전부 advisory·fail-open이고 3.6.1의 3중
  gate가 그대로 걸린다. 비용이 문제면 `MCCP_IMPECCABLE_ROUTING_MODE=hybrid`가 evaluate만 남긴다 —
  **새 토글을 추가하지 않는다**.

## [1.31.3] — 2026-08-23

> **§3.7**: `1.31.2 → 1.31.3` (**patch** — M3는 impeccable-detection-contract PRD의
> 세 번째 milestone이고 PRD는 M4·M5가 남아 여전히 in-progress다). 병렬 브랜치 충돌 점검:
> `origin/main`이 `1.31.0`, 이 브랜치의 미머지 항목이 `1.31.1`(M1)·`1.31.2`(M2)라
> `1.31.3` 자리가 비어 있다. 4면(plugin.json · html.js page-foot · markdown.js derived 줄 ·
> 이 파일의 `currently` 노트)을 함께 맞췄고, `i18n-surface.test.js`는 manifest에서
> 파생하므로 고칠 리터럴이 없다.
> **target은 `/mccp:pr` 직전에 한 번 더 재계산한다**(§3.7 실측 4회 재발).

**impeccable-detection-contract M3 — 섀도잉 해소 (patch, `1.31.2 → 1.31.3`)** — M1은 오라클을
만들고 M2는 소비처를 배선했다. 둘 다 **다중 사본이 공존할 때 무엇이 실제로 열리는가**를
사용자에게 말하지 않았다. M3는 승자가 아닌 소스를 1급 사실로 보고하고, 호출부를 재배선하고,
이 저장소의 구버전 사본을 없앤다.

### Added

- `plugins/mccp/scripts/lib/impeccable-detect.js` — `resolveImpeccable()` 반환에 `eclipsed`
  배열이 생겼다. 정의는 하나다: *승자가 정해졌을 때, 열거된 소스 중 승자 행이 아닌 전부.*
  승자는 **그것을 고른 분기에서 객체 identity로 포착**해 제외한다 — `source`+`invocation`+`path`
  3-필드 비교가 아니다. 같은 트리를 가리키는 레지스트리 항목 둘은 그 삼중값이 동일하므로
  필드 비교는 **양쪽 다** 승자로 보고 `eclipsed`를 비운다(두 본문이 있는데 가려진 것이 없다고
  말하는 셈). `shadowed:true`면 `eclipsed`는 **빈 배열**이고, 그것은 "정리할 것이 없다"가
  아니라 **"무엇이 정리 대상인지 판정할 수 없다"** 는 뜻이다. 버전은 비교하지 않는다(UI6).
- `plugins/mccp/scripts/lib/impeccable-cleanup.js` (신규) — `plan`(읽기 전용) /
  `apply --source <project|user> --confirm`. 거부 규칙 여덟이 **전부 코드에** 있고 닫힌
  `REASONS` enum으로 답한다. 경로 봉쇄는 **앵커와 대상 사이의 조상만** 검사한다 — 앵커 자신이
  심볼릭 링크인 것은 거부하지 않는다(macOS `/tmp`, Windows junction 개발 드라이브 같은 정상
  설치를 전부 막으면서 아무것도 얻지 못한다: 기대 부모와 대상이 같은 링크를 통과해 동일하게
  해소되므로 봉쇄가 유지된다). `git rm`은 `execFileSync` + `--` 구분자로만 부르고 셸을
  경유하지 않는다. 성공 판정은 명령의 종료코드가 아니라 **재-resolve로 증명한 부재**다.
- `plugins/mccp/scripts/lib/dep-check.js` — `impeccableEclipsedNotice()` ·
  `impeccableEclipsedRows()` · `safePath()`. 배너 문장이 hook이 아니라 여기 사는 이유는 hook에
  자체 test가 없고 이 모듈에는 있기 때문이다. `safeLabel`은 경로에 쓸 수 없어(구분자·틸드·64자
  상한) 경로 전용 규칙을 따로 뒀다 — 제어문자를 제거하고 길이를 제한하되 나머지는 그대로 둔다.
- `plugins/mccp/commands/setup.md` Phase 3.5 — 다른 사본을 보고하고, **실제로 가능할 때만**
  정리를 제안한다. `shadowed`면 제거 선택지를 아예 보이지 않는다(규칙 6이 거부할 행동을 권하는
  화면이 된다).

### Changed

- **호출부 재배선 (4개 본문 + alias 2개).** `plan.md` · `prp-implement.md` · `pr.md` ·
  `code-review.md`가 더 이상 이름을 하드코딩하지 않는다. detect 블록이 `impeccable_invocation`을
  뽑아 `[mccp:impeccable] call-form:` **한 줄**을 stderr로 내고, 본문은 그 줄이 나르는 이름을
  부른다. 셸 변수가 아니라 그 줄이 carrier인 이유는 셸 상태가 도구 호출 경계를 넘지 못하기
  때문이다. **그 줄이 없으면 이름을 추정하지 않고** 기존 `SKILL_AVAIL=0` 행으로 간다.
  이로써 plugin 채널 설치도 env 우회 없이 디자인 게이트를 발화시킨다(UI1).
- **`.claude/skills/impeccable/` (79 파일) 제거 — 재배선과 동일 커밋.** 지우기만 하면 bare
  소스가 사라져 전 게이트가 `unknown_skill`로 떨어진다. `impeccable-guard.test.js`의 짝 단언이
  *사본 존재*와 *본문의 bare 리터럴 존재*를 하나의 등식으로 묶어 반쪽 착지를 붉힌다.
- `docs/environment/external.md` — 사라진 사본을 가리키던 링크 앵커 5곳을 코드 텍스트로 풀고,
  IMPECCABLE_\* 구간 머리에 측정 기준을 한 줄 적었다. plugin cache 경로로 다시 링크하지
  **않는다** — 머신과 버전에 묶인 경로라 다음 사용자에게 거짓이 된다.

### Fixed

- `impeccable-resolve.test.js`의 "bare invocation equals the literal name mccp command bodies
  call"이 **배선이 아니라 산문을 검사하고 있었다.** 재배선으로 모든 리터럴이 사라져도
  `plan-prd.md`의 문장 하나(impeccable을 부르지 **않는다**고 적은 줄) 때문에 green으로
  남았을 것이다. 이제 오라클이 내는 **필드 이름**과 본문이 읽는 필드 이름을 양쪽에서 단언한다.

### Known limitations

- **`removable`은 어떤 구성에서도 빈다 — 삭제 경로는 현재 도달 불가다.** bare 소스가 항상
  이기므로 bare 사본은 승자(규칙 1)이거나 둘 중 하나(규칙 6)이고, 남는 eclipsed 행은
  plugin뿐인데 규칙 2가 그것을 거부하며, env override는 승자를 판정 불가로 만든다(규칙 7).
  규칙을 완화하지 않았고 — 각각 안전 근거가 있다 — 대신 setup 화면이 그 사실에 정직하며
  `no configuration this oracle can produce makes a copy removable` test가 이 성질을 고정한다.
  그래서 rule 3·4·5·8과 사후 검증은 end-to-end로 도달할 수 없다: 봉쇄 술어는 `_internals`로
  직접 단언하고, 나머지는 오라클의 해소 순서가 바뀌어 도달 가능해지는 날 위 test가 red로
  알리면 그때 end-to-end 커버를 되살린다.
- **`impeccable-guard.test.js`는 어떤 CI도 돌리지 않는다.** `.github/workflows/`에 등재된
  test는 셋뿐이다. 짝 단언의 실제 강제 지점은 이 사이클의 `## Validation`이 돌리는 로컬
  test이며, "커밋 시점 강제"가 아니다. CI 등재는 backlog.
- **check↔delete TOCTOU 창은 좁혔을 뿐 닫지 않았다.** 삭제 직전 realpath 재확인이 있지만
  마지막 확인과 syscall 사이는 열려 있다(Windows에 `O_NOFOLLOW` 상당이 없다). 규칙 7 이후
  이 창에 도달하는 경로가 없다는 점이 완화지, 창이 닫힌 것은 아니다.

### Fixed — 로컬 code-review 흡수 (같은 사이클)

- **HIGH · env override가 rule 1을 무력화해 실제로 열리는 본문을 삭제했다** —
  `impeccable-cleanup.js`. `MCCP_IMPECCABLE_SKILL=available`이 만드는 승자는 `path:null`이라
  어느 사본이 답하는지 주장하지 않는데, rule 1은 `winner.source === source` 비교뿐이라
  `'env' !== 'project'`로 통과했다. 그 결과 bare 사본이 `removable`에 올라 실제로 삭제됐고
  (임시 저장소에서 재현), 사후 검증조차 그것을 잡지 못했다 — 같은 override가 본문이 사라진
  뒤에도 `available:true`를 보고하기 때문이다. rule 7(승자가 디스크 본문을 지목하지 않으면
  거부)을 추가했다. rule 6이 `shadowed`에 대해 내린 판단과 같은 상태를 같은 방식으로 닫는다.
- **MEDIUM · SessionStart의 eclipsed 배너가 사실상 1회성이었다** — `session-start.js`.
  게이트가 `!within24h` 단독인데 `dep_check_at`은 dep-check가 도는 **모든** 세션에서 갱신되므로,
  하루 안에 세션을 한 번이라도 열면 시계가 리셋돼 배너가 다시 뜨지 않았고 사본이 늘거나 줄어도
  반응하지 않았다. 자체 축 `dep_check_eclipsed`(present-only)를 두고 missing 배너와 같은
  `(키 동일 ∧ 24h 이내)` 규칙으로 바꿨다 — `dep_check_missing`을 공유하지 않는 이유는 그것이
  eclipsed 상태를 "누락 의존성"으로 읽히게 만들기 때문이다.
- **MEDIUM · shadowed 배너가 plugin 사본까지 "같은 이름에 답하는 사본"으로 셌다** —
  `dep-check.js`. plugin은 `<pluginName>:<skillDirName>`으로 등록돼 다른 이름에 답하므로
  모호성의 당사자가 아니다. `bareSourceCount()`로 bare 행만 센다(3-copy 설치에서 3 → 2).
- **MEDIUM · rule 4 주석이 코드·test와 정반대를 서술했다** — 주석은 "`--confirm`을 빠뜨리면
  `--dry-run`이어도 거부된다"고 했으나 코드는 dry-run을 먼저 답하고 test도 그렇게 단언한다.
  동작이 아니라 주석을 고쳤다(dry-run은 아무것도 지우지 않으므로 승인할 대상이 없다).
- **MEDIUM · plan이 지목한 경로와 apply가 지우는 경로가 갈라질 수 있었다** —
  `applyCleanup`은 삭제 대상을 앵커에서 파생하는데 `planCleanup`은 설정된 skill 디렉터리를
  읽는다. 출하된 호출자는 override를 넘기지 않아 실제 도달은 불가였지만, 파괴적 함수에서 둘이
  갈라질 수 있는 구조를 rule 8로 닫았다.
- **MEDIUM · dep-check 주석 블록이 잘못된 함수 위에 있었다** — notice 설명 문단이
  `impeccableEclipsedRows` 위에 붙고 정작 `impeccableEclipsedNotice`는 무주석이었다.
- **LOW** · `code-review.md`의 "call-form rule below"가 실제로는 위였다 ·
  `assertReachableWithoutLinks`가 루프에서 이미 얻은 `lstat`을 버리고 재호출해, 그 찰나의
  경합이 닫힌 `REASONS` 대신 raw ENOENT로 샜다.

## [1.31.2] — 2026-08-22

> **§3.7**: `1.31.1 → 1.31.2` (**patch** — M2는 impeccable-detection-contract PRD의
> 두 번째 milestone이고 PRD는 아직 in-progress다). 병렬 브랜치 충돌 점검: `origin/main`이
> `1.31.0`, 미머지 `santa-delta-review`·`multi-session-work-loop-m7`이 `1.30.3`,
> `diverse-agent-review-m7`이 `1.30.2`라 `1.31.2` 자리가 비어 있다. 4면(plugin.json ·
> html.js page-foot · markdown.js derived 줄 · 이 파일의 `currently` 노트)을 함께 맞췄고,
> `i18n-surface.test.js`는 manifest에서 파생하므로 고칠 리터럴이 없다.
> **target은 `/mccp:pr` 직전에 한 번 더 재계산한다**(§3.7 실측 4회 재발).

**impeccable-detection-contract M2 — setup·경고 정합 (patch, `1.31.1 → 1.31.2`)** — M1이 만든
`resolveImpeccable()` 오라클을 소비처 셋에 실제로 연결한다. M1은 오라클을 만들고 아무도 부르지
않게 뒀고, M2는 그 자리를 채운다.

### Added

- `plugins/mccp/scripts/lib/dep-check.js` — `checkImpeccable(options)`. 본문 **안에서**
  `require('./impeccable-detect')`를 부른다(`impeccable-detect`가 `dep-check`를 top-level로
  require하므로 순환이다). `dep-check` 헤더가 선언한 "Never throws" 계약에 따라 그 require를
  try/catch로 감싸 **fail-closed sentinel**(`available:false`)을 돌려준다 — 관대한 방향으로
  실패하면 깨진 require가 조용한 디자인 리뷰 skip이 된다. `checkAll()`은 기존 4키를 그대로 둔
  채 `impeccable` 키를 얹는 엄격한 상위집합이 되고 `repoRoot`를 전달한다. CLI printer에
  `impeccable skill` 행이 생기고, 그 행에 들어가는 version·source·invocation은 화이트리스트로
  소독된다(SKILL.md frontmatter는 사용자가 설치한 파일이고 이 값은 터미널에 도달한다).
- `plugins/mccp/scripts/lib/tests/setup-command-body.test.js` — 삭제된 설치 명령이 산문으로
  되돌아오는 것과 Phase 3이 다시 PATH probe를 읽는 것을 리터럴로 고정한다.
- `plugins/mccp/scripts/hooks/tests/session-start-dep-check.test.js` — hook을 실제로 spawn한다.
  env 축(`MCCP_IMPECCABLE_SKILL`) 양방향은 배선을 싸게 확인하고, **env 없이** 중첩 cwd +
  redirect된 HOME으로 도는 케이스가 `repoRoot` 전달 자체를 검증한다(그 전달을 제거하면 red가
  되는 것을 변이 검사로 확인했다).

### Changed

- `plugins/mccp/scripts/hooks/session-start.js` — missing 배너의 판정이
  `impeccable_cli.installed`에서 `impeccable.available`로 옮겨졌고 `checkAll`에
  `{ repoRoot: injectorRepoRoot || undefined }`를 전달한다. npm이 아닌 채널로 설치한 사용자를
  24시간마다 "미설치"로 부르던 오탐이 닫힌다.
- `plugins/mccp/commands/setup.md` — Phase 3 전면 재작성. `checkImpeccable().available === true`면
  Phase 전체를 skip하고(설치된 사용자에게 다시 묻지 않는다), 미해소일 때만 3선택지를 한 번 묻는다.
  설치 명령은 Task 0에서 **실측한** 형태다(`claude plugin marketplace add pbakaus/impeccable` →
  `claude plugin install impeccable@impeccable`, 그리고 `npx impeccable install`). 설치 직후
  재-`dep-check`와 Phase 1 표 갱신이 의무이고, plugin 채널이 `impeccable:impeccable`로 등록되는
  반면 mccp가 bare 이름을 부른다는 사실을 그 자리에서 출력한다. frontmatter는
  `Bash(npx:*)`가 아니라 `Bash(npx impeccable:*)`로 좁혔다.
- `plugins/mccp/scripts/lib/gitignore-provision.js` + `.gitignore` — `.impeccable/` 극성 교체
  (`!design.json` → `!config.json`). 근거는 impeccable 자신의 `reference/hooks.md`다:
  per-developer override와 설치 동의 값은 **gitignored** `config.local.json`에 살고 `config.json`은
  팀 공유 커밋 대상이다. drift lint가 양방향이라 두 파일이 한 단위로 움직인다.
- 문서 4면(`docs/gate-design.md` · `README.md` · `NOTICE` · `CLAUDE.md`) — 삭제된 설치 명령
  서술을 채널 중립으로 교체. `docs/gate-design.md`에 `#### setup·경고 정합 (M2)` 절이 생겨
  4채널 표와 그 채널이 오늘 발화하지 않는 이유, pollution 보고가 정상인 이유를 소유한다.

### Fixed

- `setup.md` Phase 6이 "impeccable missing → `/mccp:impeccable` will refuse"라고 적고 있었다.
  그 명령은 존재하지 않는다(이 plugin은 22개 명령을 배포하고 그 중에 없다). 실제 귀결로 교체:
  plan은 lenient라 통과하고 implement·pr은 `impeccable_skipped`로 차단되며 탈출은
  `MCCP_FORCE_PR_WITHOUT_IMPECCABLE`이다.

### 주장하지 않는 것

- **호출부를 재배선하지 않는다.** plugin 단독 설치는 여전히 `unknown_skill`로 떨어진다. M2가
  바꾸는 것은 그 사실을 **말하는지 여부**이지 사실 자체가 아니다 — 재배선은 M3가 project-local
  사본 제거와 단일 커밋으로 수행한다.
- **섀도잉을 사용자에게 표면화하지 않는다.** `shadowed`는 dep-check JSON과 CLI printer에
  나타나지만 배너도 setup 분기도 그것으로 행동을 바꾸지 않는다.
- **PRD Success Metric 1을 M2가 달성한다고 주장하지 않는다.** 이 저장소에서는 project 사본 덕에
  이미 참이지만, plugin 단독 설치자에게는 M3까지 거짓이다.

## [1.31.1] — 2026-08-22

> **§3.7**: `1.31.0 → 1.31.1` (**patch** — M1은 impeccable-detection-contract PRD의
> 첫 milestone이고 PRD는 아직 in-progress다). 병렬 브랜치 충돌 점검: `origin/main`이
> `1.31.0`이고 미머지 `diverse-agent-review-m7`은 `1.30.2`라 patch 자리가 비어 있다.
> 4면(plugin.json · html.js page-foot · markdown.js derived 줄 · 이 파일의 `currently`
> 노트)을 함께 맞췄고, `i18n-surface.test.js`는 manifest에서 파생하므로 리터럴 동기가
> 필요 없다. **target은 `/mccp:pr` 직전에 한 번 더 재계산한다**(§3.7 실측 4회 재발).

**impeccable-detection-contract M1 — 정직한 탐지 (patch, `1.31.0 → 1.31.1`)** — `probeSkillAvailable`가 돌려주던 boolean 하나를 `resolveImpeccable()` 오라클로 대체한다. 설치원을 전부 열거하고, 각 설치원의 `version`을 SKILL.md frontmatter에서 실제로 판독하고, **`Skill(...)` 호출이 실제로 열게 될 본문 하나**를 지목한다.

### 무엇이 틀려 있었나

세 가지가 동시에 틀려 있었고, 셋 다 같은 방향으로 틀렸다 — 탐지가 실재를 못 보는 쪽으로.

- **하드코딩 키 불일치.** `IMPECCABLE_PLUGIN_KEY = 'impeccable@anthropics'`인데 default 설치의 실측 키는 `impeccable@impeccable`이다. 레지스트리 키는 `<pluginName>@<marketplaceName>` 규약이라 marketplace 절반이 다르면 통째로 빗나간다. **완전히 설치된 plugin 4.1.1이 모든 게이트에서 보이지 않았다.**
- **project 채널 부재.** `<repoRoot>/.claude/skills/impeccable/`은 조회 대상이 아니었다. 이 저장소가 3.5.0 사본을 그 자리에 두고 있는데도 탐지는 없다고 답했다.
- **빈 디렉토리를 설치로 계수.** `~/.claude/skills/impeccable`은 디렉토리 존재만 확인했다 — 열릴 본문이 없는데 있다고 답하는 것이다.

이 결함은 이번 사이클 자신의 게이트에서 세 번 재현됐다(PRD Design Direction · plan-codex · implement-codex 전부 `skill-missing`).

### boolean이 답할 수 없던 질문

mccp 명령 본문은 전부 bare `Skill(impeccable, ...)`를 부르는데 plugin 채널의 skill은 `<pluginName>:<skillDirName>`으로 등록된다. "설치돼 있다"와 "우리가 부르는 이름이 해소된다"는 다른 사실이고, 전자만 답하면 탐지가 true인데 호출이 `unknown_skill`로 떨어지는 상태를 만들 수 있다. 그래서 `invocation`이 1급 반환값이다.

### 모호하면 답하지 않는다

bare 소스가 둘이면(project + user) 어느 본문이 해소되는지는 측정된 바 없다. 그때 `shadowed:true`로 두고 `source` · `path` · `version`을 **전부** `null`로 답한다. 이 오라클의 약속이 "실제로 열릴 본문 하나를 지목한다"이므로 둘 중 하나를 고르는 것은 오라클이 할 수 있는 가장 해로운 일이다. 이름(`invocation`)만은 양쪽이 공유하므로 남는다. Implement-Codex F3가 초안의 공백(`source`·`path`를 정하지 않고 남김)을 지적해 흡수했다.

### Added

- `plugins/mccp/scripts/lib/impeccable-detect.js` — `resolveImpeccable()` 오라클(4소스 열거 · 접두어 매칭 · frontmatter version 유계 판독 · 모호성 처리), `readFrontmatterVersion()`, `resolve` CLI 서브커맨드(`--json`).
- `plugins/mccp/scripts/lib/tests/impeccable-resolve.test.js` — 채널 조합 매트릭스 22건.

### Changed

- `detect()`는 기존 키의 의미를 그대로 둔 채 6필드(`impeccable_invocation` · `_source` · `_version` · `_path` · `_sources` · `_shadowed`)를 얹는 **엄격한 상위집합**이다. 게이트 본문의 분기는 한 줄도 바뀌지 않는다 — M1은 분기의 **입력만** 참으로 만든다.
- `probeSkillAvailable`는 `resolveImpeccable().available`을 돌려주는 얇은 래퍼로 남아 호출부 4곳이 무변경이다.
- **동작 변경**: project·user 채널이 디렉토리가 아니라 `SKILL.md` 존재를 요구한다. plan 게이트는 lenient라 무영향이고 implement·pr에서만 막히며, 탈출구는 `MCCP_IMPECCABLE_SKILL=available`이다.
- `plugins/mccp/scripts/lib/tests/impeccable-detect.test.js` — fixture를 실측 키 `impeccable@impeccable` + 실재 install tree로 교정하고, 신설 project 채널이 개발자의 실제 checkout을 읽지 않도록 `repoRoot`·`projectSkillDir`을 주입해 격리했다(2건은 그 누출 덕에 통과하고 있었다).
- `plugins/mccp/scripts/lib/env-contract/registry.js` — `MCCP_IMPECCABLE_SKILL` consumer 앵커 `:135 → :301`.

### Security

- 디스크에서 읽은 skill 디렉토리 이름은 `^[A-Za-z0-9_-]+$`를 통과해야만 `path.join`과 `invocation`에 쓰인다.
- skill 디렉토리는 `lstat`으로 심볼릭 링크를 거부한다(열거와 판독 사이 재지정 창).
- `SKILL.md`는 `isFile()`을 통과해야만 열린다 — FIFO가 놓이면 판독이 영원히 블록되고 게이트가 원인 불명 timeout으로 죽는다.
- 보고되는 `path`는 repo 내부면 repo-relative, 밖이면 홈 축약이다(§3.12 E7과 같은 이유 — M2·M3가 이 값을 receipt로 올린다).

### code-review 흡수

`/mccp:code-review`가 낸 MEDIUM 2 · LOW 4를 같은 사이클에서 전부 닫았다.

- **거부된 `--plan` 경로가 상위집합 계약을 깨고 있었다.** `detect()`는 세 곳에서 반환하는데 path-traversal 조기 반환만 6필드를 빠뜨렸다 — 바로 위에서 "엄격한 상위집합"이라 선언한 것이 그 분기에서 거짓이었다는 뜻이다. 거기서는 소비자가 `impeccable_source`의 `null`(측정했고 모른다)과 `undefined`(묻지도 않았다)를 구분할 수 없는데, 이 저장소는 다른 곳에서 그 구분에 의미를 싣는다(§3.13 "키 부재 = 모름"). 세 반환이 이제 `resolutionFields()` 하나를 거치므로, 나중에 분기가 늘어도 목록을 베껴 옮기다 빠뜨릴 자리가 없다.
- **그 6필드에 test가 0건이었고**, 그래서 위 누락이 리뷰까지 살아남았다. 분기별 필드 존재와 오라클 값 일치를 단언하는 2건을 추가했다. 헬퍼를 되돌리면 `path-traversal branch (reason=path-traversal) is missing impeccable_invocation`으로 실제 red가 된다.
- `IMPECCABLE_PLUGIN_KEY`가 코드에서 쓰이지 않으면서 export만 남아 있었다. 값이 실측과 다른 `impeccable@anthropics`라 외부 소비자를 오도할 수 있어 제거했다.
- `MCCP_IMPECCABLE_SKILL`에 `available`/`missing` 밖의 값이 오면 조용히 무시했다. 오타를 낸 운영자는 의도한 것의 반대를 얻고도 읽을 것이 없었다 — 이제 loud warn 후 실제 소스를 probe한다.
- `impeccable-resolve.test.js` 1B의 `skip` 표현식이 양쪽 다 falsy라 **아무것도 skip하지 않으면서 skip하는 것처럼 읽혔다.** 제거했고, 플랫폼 차이는 symlink 호출 자리에서 이미 처리된다.
- `.claude/settings.json`에서 `MCCP_REVIEW_SINGLE_PASS`를 제거했다. §3.15가 정한 것은 **작업 단위** opt-in인데 프로젝트 설정에 상주시키면 상시가 된다. 대가는 실측됐다 — 그 값이 살아 있는 세션에서는 `review-single-pass-fields.test.js` 2건이 붉고 `env -u` 후에는 25건 전량 통과한다. 즉 그 토글은 receipt에 주석을 남기는 데 그치지 않고 **test 판정을 뒤집는다**. 파일에서 지워도 **이미 뜬 세션의 `process.env`에서는 사라지지 않으므로**, 이 사이클의 커밋·PR은 `env -u`로 감싸 실행했다.

### 주장하지 않는 것

- **호출부를 고치지 않는다.** plugin 단독 설치에서 `available:true`가 나와도 명령 본문은 여전히 bare 이름을 부른다. 결과는 M1 전후가 같다(양쪽 다 `impeccable_skipped`로 귀결) — 재배선은 M3가 project-local 사본을 지울 때 반드시 함께 해야 하는 전제이고, `impeccable-resolve.test.js`가 그 순간 red가 된다.
- **다중 bare 소스 우선순위는 여전히 미측정이다.** 위 규칙은 그 질문을 회피하는 것이지 답하는 것이 아니다.

## [1.31.0] — 2026-08-21

> **§3.7**: `1.30.1 → 1.31.0` (**minor** — M3는 codex-intent-context PRD의 **최종
> milestone**이고, 이로써 PRD 전 milestone(M1 · M1.5 · M2 · M3)이 적용·종료된다).
> 병렬 브랜치 충돌 점검: 미머지 `diverse-agent-review-m7`이 `1.30.2`를 선점하고 있어
> patch 자리는 이미 좁다 — minor 자리는 충돌하지 않는다. 4면(plugin.json ·
> html.js page-foot · markdown.js derived 줄 · 이 파일의 `currently` 노트)을 함께
> 맞췄고, `i18n-surface.test.js`는 manifest에서 파생하므로 리터럴 동기가 필요 없다.
> **target은 `/mccp:pr` 직전에 한 번 더 재계산한다**(§3.7 실측 4회 재발).

**codex-intent-context M3 — hybrid L3 배선 복구 (minor, `1.30.1 → 1.31.0`)** — `MCCP_PLAN_REVIEW=hybrid`는 오라클(`decide.js`)·스키마·receipt 필드가 M1에 전부 실렸는데도 **실행 경로가 죽어 있었다.** M3는 배선만 고친다 — 발화 대상의 자동 판정은 `diverse-agent-review` PRD 소관으로 남긴다.

### 무엇이 죽어 있었나

`plan.md` 5.2f Step 1은 "5.2z의 Codex 블록을 *verbatim* 실행하라"고 지시했다. 그런데 그 블록이 띄우는 것은 `plan-codex-runner.js`이고, 그것의 임무는 `mccp-plan-codex` receipt를 쓰는 것이다 — 그리고 패널 경로에서는 5.6b가 같은 receipt를 쓴다. 결과는 둘 중 하나였고 어느 쪽도 hybrid가 아니었다: runner가 경합에서 이겨 L1/L2 proof가 생기기 전에 receipt를 봉인하거나, `$CODEX_STDOUT`이 애초에 설정되지 않아(hybrid는 그것이 대입되는 5.2z 블록에 진입하지 않는다) 5.2f가 `invoked:false`를 쓰고 `decide`가 `unavailable`로 접는 — 즉 **항상 HALT하는 모드**.

### 이중 writer는 순서가 아니라 부재로 닫혔다

순서를 보장하려면 hybrid에서도 runner를 띄운 뒤 완료를 기다려야 하고, 그러면 receipt writer가 둘인 상태 자체는 유지된다. L3를 receipt를 쓰지 않는 전용 서브커맨드 `plan-review/cli.js l3`로 분리하면 hybrid에서 runner가 **존재하지 않으므로** 순서 요건이 사라진다. 남는 것은 "5.2f의 fenced bash에 `plan-codex-runner`가 0회 등장한다"는 정적 단언 하나이고, 그것은 test 하나에 걸린 방어가 아니라 구조다.

`l3`는 receipt·adjudication·lock을 갖지 않는다. `invoked:false`도 exit 0이고, **아티팩트를 쓰지 못한 경우에만** exit 12다 — 그 경우 `decide`는 어차피 fail-closed지만 사유를 "L3가 안 돌았다"로 잘못 말하게 되므로, 정확한 원인을 그 자리에서 올린다. 차단 권한은 `decide` 단독이다.

### 레코드를 셸이 조립하지 못하게 했다

옛 Step 2는 `printf '{"invoked":true,"verdict":"%s"...}' "$L3_VERDICT"`로 JSON을 만들었다. fence를 넘은 셸 변수는 비어 있는 것이 정상이므로 `"verdict":""`가 그대로 파일에 실렸다 — `REVIEW_VERDICT_VALUES`가 금지하는 값이고, `decide.js`가 하류에서 방어해야 했던 바로 그 값이다. 신규 순수 오라클 `buildL3Record`는 그것을 **구성할 수 없다**: `classification==='ok' ∧ blocking≠true ∧ exit===0`일 때만 verdict를 뽑고, enum 밖이면 `verdict` 키 **없이** `invoked:false`로 접는다.

`verdict:'unavailable'`도 쓰지 않는다. 둘 다 fail-closed지만 후자는 "Codex가 말했고 그 말이 unavailable이었다"를 주장한다 — companion의 어휘는 `approve` | `needs-attention`뿐이라 그런 발화는 없었다. 판독 불가한 payload도 같은 이유로 `invoked:false`로 접힌다.

### 아티팩트 4종 · nonce · 조기 HALT

- **순서가 계약이다.** `codex-verdict` → `codex-class` → `l3-findings.json` → `l3.json` 순으로 쓰고 poll은 `l3.json` 하나만 본다. 네 번의 tmp+rename은 네 번의 원자 연산이지 한 번이 아니므로, 마지막에 쓰인 파일의 존재가 나머지 셋의 존재를 함의하게 만드는 것이 유일하게 얻을 수 있는 보장이다. 하나라도 실패하면 exit 12이고 `l3.json`은 남지 않는다(회귀 test가 `codex-class` 자리에 디렉토리를 놓아 실제로 재현한다). bridge 2종은 hybrid에서 **읽는 쪽이 없다**(5.6b가 `l3.json`에서 읽고 `mode=codex`는 이 서브커맨드를 부르지 않는다) — 유지 사유는 DD5의 파일명 계약과 평문 trace이고, all-or-nothing이 지키는 것은 소비자가 아니라 `l3.json`이 완주를 뜻한다는 사실이다.
- **stale 판별은 레코드 안의 `run_nonce`**다. `l3.json`의 이름은 고정이라(5.2z와 달리 이 커맨드는 자기 파일명을 소유하지 않는다) 판별자가 본문에 실려야 한다. nonce·deadline·pid는 전부 아티팩트로 남는다 — poll은 나중 fence의 블록이고, 자기 deadline을 재도출하는 poll은 재진입마다 시계를 되감아 영원히 timeout하지 못한다.
- **`MCCP_PLAN_REVIEW=hybrid` 단독 설정이 에이전트 0개로 멈춘다.** `MCCP_PLAN_REVIEW_L3` 기본값이 `off`라 mode만 켠 운영자는 매번 확정된 HALT에 도달했고, M3 이전에는 L2 패널을 전부 지불한 **뒤에** 도달했다. 신규 5.2a-0이 `mode.json`의 `hybrid_without_l3`를 읽어 5.2b(예약) **앞에서** 멈춘다. 새 정책이 아니라 이미 결정된 결과를 앞당기는 것이라 예약 반환도 없다.
- **승격 사실 봉인은 신규 필드 없이** `meta.review_l3_reason`으로 한다. `write.js`가 이미 받는데 5.6b가 forward하지 않아, 모든 hybrid receipt가 "L3가 발화했다"만 기록하고 무엇을 보았는지는 기록하지 않았다 — boolean 하나로는 structured `approve`와 free-text fallback을 구분할 수 없다.

### ship 직전 code-review 흡수 (2026-08-21)

- **`--invoke-module`이 Codex 없이 `converged`를 주조했다 (HIGH).** L3 test seam이 production 게이트 바이너리에 그대로 열려 있었고, `{classification:'ok', stdout:'{"result":{"verdict":"approve"}}'}`를 돌려주는 대역 하나면 `verdict-source=structured`인 `converged`가 나온다 — 진짜 Codex 승인과 바이트 동일하고, hybrid는 `CROSS_MODEL_SOURCES` 원소라 그 값이 `/mccp:pr`의 cross-gate dedupe를 연다. 주석은 이것을 *"a TEST SEAM, not a policy seam"* 이라 적고 있었고 근거로 든 enum 검사는 **어휘만** 제약한다(누가 말했는지는 아니다). test 이름도 *"cannot approve what the real one could not"* 였는데 실제로는 enum 밖 값 하나만 넣고 있었다. → `MCCP_PLAN_REVIEW_TEST_INVOKE=1` 없이는 `EX_BLOCK`, 주석을 사실로 정정, test는 **양쪽을 다 단언**한다(대역이 실제로 `converged`를 만든다는 것 + 게이트가 그것을 막는다는 것). §3.13.2대로 이것이 위조를 불가능하게 만들지는 않는다 — 없앤 것은 *표식 없는* 주조 경로다.
- **5.6b가 poll의 nonce 판정을 물려받고 있었다.** `l3.json`은 이름이 고정이고 poll은 앞선 fence의 블록이라, 그 사이 세 번째 실행이 레코드를 갈아치울 수 있다. verdict와 `review_l3_reason` 양쪽 read가 **직접 재대조**한다(불일치·부재 → 빈 값 → flag drop, fail-closed). 이전 문언의 "by construction"은 과장이었고 3면에서 정정했다.
- **poll의 TOCTOU가 완주한 실행을 `died-without-record`로 오판할 수 있었다.** 자식은 `l3.json`을 rename한 **뒤** 종료하므로 그 사이에 떨어진 probe는 파일도 프로세스도 못 본다. `kill -0` 실패 분기가 결론 전에 파일을 다시 확인한다 — 창은 마이크로초지만 대가는 끝난 900s Codex 호출의 폐기다.
- **문서 정정 3건** — (a) `plan.md` 5.2f Step 1이 *"5.6b is unchanged — it still reads `codex-verdict`"* 라고 적어 같은 파일 5.6b의 F1 흡수와 정면으로 모순됐다. (b) bridge 2종은 hybrid에서 읽는 쪽이 **없는데** all-or-exit-12 규칙과 순서 계약의 근거가 그 소비 관계를 인용하고 있었다 — 근거를 `l3.json`의 완주 의미 쪽으로 다시 세웠다. (c) 출하 4면(CLAUDE.md · gate-design.md · CHANGELOG · cli.js 주석 + test 이름)이 "아티팩트 3종"이라 적는데 코드는 4종을 쓴다(`l3-findings.json`이 라이브 실행 후 추가되며 내부 산출물만 갱신됐다).
- **`writePrivate`가 EEXIST에서 자기가 만들지 않은 파일을 unlink**했다 — `'wx'`를 넣은 취지의 정반대다. 그 경우만 정리를 건너뛴다.
- **이연 2건** — `parseArgs`가 `--`로 시작하는 값을 플래그로 오인하는 것(전역 파서라 blast radius가 이 diff 밖) · `santa-loop-cap.test.js`가 프로젝트 자신의 `MCCP_REVIEW_SINGLE_PASS` 설정 아래에서 27건 red인 것(변경 목록 밖). 둘 다 [backlog](.claude/plans/codex-findings-backlog.md) 등재.

### 주장하지 않는 것

- **어떤 plan이 L3를 받을지는 여전히 사람이 env로 정한다.** 신호 기반 자동 판정 오라클은 만들지 않았다(UI2·UI3).
- **Codex를 다른 벤더로 교체하지 않았고**, 리뷰어 독립성은 완화까지만이다(UI7).
- **라이브 완주 상태는 PRD와 report에 그대로 적는다** — 초록 test를 완주로 바꿔 부르지 않는다.
## [1.30.2] — 2026-08-21

> **§3.7**: `1.30.0 → 1.30.2` (**patch** — diverse-agent-review PRD의 단일 milestone #7이며
> PRD 전체는 미완료다). **한 칸이 아니라 두 칸 올린 이유**: 진입 시점 재계산에서 `1.30.1`을
> 미머지 형제 워크트리 **3개**(`codex-intent-context-m2` · `multi-session-work-loop-m7` ·
> `santa-delta-review`)가 이미 선점하고 있었다(origin/main은 `1.30.0`). §3.7의 forward-only
> 상향에 따라 현재 아무도 주장하지 않는 번호를 잡는다. **이 번호는 `/mccp:pr` 진입 직전 다시
> 재계산해야 한다** — 위 3개 중 둘 이상이 먼저 머지되면 `1.30.2`도 밀린다. 4면(plugin.json ·
> html.js page-foot · markdown.js derived 줄 · 이 파일의 `currently` 노트)을 함께 맞췄고
> `i18n-surface.test.js`가 재검증한다.

---

### Changed — diverse-agent-review #7: budget 게이트 라이브 발화 **관측(음성)**

**동작 코드는 0줄 바꿨다.** 이 milestone이 소유하는 것은 관측과 그 기록이다.

#4는 budget 게이트를 *구조적 도달 불가*에서 벗어나게 했고 #6은 그것을 관측하지 못했다. #7은
라이브 발화를 관측하려 했고 — **관측하지 못했다.** 얻은 것은 발화가 아니라 **발화 불가의 원인**이다.

- **B1 (실측)** — agent를 하나도 쓰지 않는 프로브로 `Workflow` primitive가 주입하는 값을 직접
  읽었다: `budget.total = null` · `spent() = 102789` · `remaining() = **Infinity**`.
  `plan-review.js:161`의 `budget.total && remaining < minRemaining`은 따라서 `false`다.
  **`remaining()`이 `0`이 아니라 `Infinity`로 퇴화한다**는 것이 핵심이다 — 좌항 단락평가를
  걷어내도 부등식이 거짓이므로 `MCCP_PLAN_REVIEW_BUDGET`을 포함한 **threshold 쪽 어떤 값으로도
  이 게이트를 발화시킬 수 없다**.
- **B2 (실측)** — 운영자가 turn 프롬프트 본문에 `+200k`를 실은 채 `/mccp:plan`을 실행했으나
  `budget.total`은 `null`이었다. 패널은 정상 발화해 agent 4개를 spawn했고(`412,349` tokens)
  `l2.json`은 `skipped:false` · `coverage:4`이며 budget-skip 반환에만 실리는
  `remaining`/`minRemaining` 키가 **없다**. 배선 결손이 아니다(`fleetKeys` 4개 반영 확인 →
  args가 객체로 파싱됐고 형제 키 `minRemaining=600000`도 도달). plan DN9가 "harness 계약"으로
  단언한 전달 경로를 **실측이 반증했다**.
- **B3** — 게이트↔fan-out 비대칭은 **미관측**. 부족 상황 자체가 성립하지 않아 어느 쪽도 budget
  분기에 들어가지 않았다(UI10 — 인접 측정을 목표 측정으로 승격하지 않는다).

같은 turn의 L2 패널이 이 결함을 **먼저 지목했다** — `test/HIGH`: *"there is no test in this
repository that verifies the Workflow harness actually extracts `+200k` from the prompt and sets
`budget.total`."* 라이브 실행이 그 지적을 실측으로 확인했다.

### 산출물

- `.claude/reviews/plan-review-diverse-agent-review-m7-budget.md` — 관측 레코드 고정(O3의 slug
  공유 덮어쓰기에서 분리). provenance 주석에 `plan_sha256_before`·`observed_after`·관측 조건을
  축자로 남기고 `## Measurement` 블록은 **바이트 무변경**(M6 D3).
- `.claude/PRPs/reports/diverse-agent-review-m7-report.md` — B1~B3 근거 · 관측 조건 축자 ·
  agent 0 spawn 증명의 3층과 **그 한계** · 승인자 기록 · `l2.json` 전문 · Acceptance 대조.
- `.claude/prds/diverse-agent-review.prd.md` — Evidence `M7 실측` 절 · `#7 complete` ·
  **`#10` 신설**(라이브 발화 축 이관) · Success Metrics 통과 경로 행 forward-only 유지 ·
  Open Questions 2건 추가.

### 정직성 노트

- **`#7`은 미달을 이관하면서도 `complete`다** — #6과 같은 규칙(판정을 바꾸지 않고 사유를
  갱신한다). 소유하는 것은 "발화시켰다"가 아니라 **"실측으로 확정했다"**이다. 다만 사유의 종류가
  세 번째로 달라졌다: #4·#6은 선행 조건이 milestone 밖(머지된 런타임)이라 **시간이 해소했고**,
  #7은 전달 경로가 **저장소 밖**이라 시간이 해소하지 않는다. 그래서 #10의 Outcome은
  "발화시킨다"가 아니라 **"전달 경로가 존재하는지 먼저 확정한다"**이다.
- **통과 경로 지표는 이번에도 미산출**이다(네 번째 사유). 이 turn의 패널도 승인하지 않았고
  (`divergent`, 관점 4 중 pass 2) 진행은 단일통과 토글이 냈다 — **토글이 낸 진행은 승인이
  아니므로** wall-clock `482,116 ms`는 차단 경로 표본이다.
- **plan Validate 3건이 이 결과로는 충족 불가**이며(Task 2(a) · Task 3 DN8 · Task 4의
  `"reason":"budget"` 축자 요구) 문구를 조정해 통과시키지 않았다. 그중 Task 3 DN8은 **선재
  결함**이다 — `hasNum` 정규식이 "How measured" 셀이 아니라 행 전체를 스캔해 Target 열의
  `"10분"`을 관측치로 오인하며, HEAD 시점 PRD에서도 그렇다(실측). 상세는 보고서 Acceptance 대조.
- 미흡수 blocking findings는 유실되지 않았다 — 5.2g2가 `codex-findings-backlog.md`에 신규 3건
  (CRITICAL 1 · HIGH 2)을 기계 적재했다(중복 2건 skip).

---

## [1.30.1] — 2026-08-16

> **§3.7**: `1.30.0 → 1.30.1` (**patch** — M2는 codex-intent-context PRD의 단일
> milestone ship이다). 원래 `1.23.10`으로 작성했으나 main이 그 번호를
> multi-session-work-loop M5(#132)에 이미 발행했기에 **forward-only 상향**으로
> 재동기했다 — 발행된 번호는 불가침이고 미머지 브랜치의 항목만 위로 민다. 4면
> (plugin.json · html.js page-foot · markdown.js derived 줄 · 이 파일의 `currently`
> 노트)을 `1.30.1`로 함께 맞췄고, `i18n-surface.test.js`는 manifest에서 파생하므로
> 리터럴 동기가 필요 없다. 날짜(2026-08-16)는 작성일 그대로 둔다 — version 순서가
> 정본이다(§3.7 "날짜 역전은 정상").

**codex-intent-context M2 — 심판 컨텍스트 분리 (patch, `1.30.0 → 1.30.1`)** — M1은 판정 **누락**을 닫았고 M1.5는 **오심**을 반증 가능하게 만들었다. 둘 다 남긴 것이 하나 있다: **심판이 여전히 저자였다.** `commands/plan.md` 5.5a에서 adjudication을 쓰는 것은 plan을 작성한 바로 그 세션이고, 그 세션은 자기 설계 근거를 전부 들고 있다. M2는 그 판정을 저자 컨텍스트를 상속하지 않는 fresh subagent로 옮긴다.

### 분리는 "안 알려준다"가 아니라 "열 수 없다"다

- **`agents/intent-arbiter.md` CREATE** — `tools: [Write]` **단독**. 초안은 arbiter에게 `Read`를 주고 awaiting 파일 하나만 읽게 하면 저자 정당화에 도달할 경로가 없다고 적었는데 **거짓이었다**: `plan-codex-runner.js`가 그 아티팩트에 `plan_path`를 이미 싣고 있어, `Read`를 가진 arbiter는 거기서 경로를 꺼내 plan의 `## Design Decisions`를 그대로 읽는다. 필드 하나를 지워 막는 것도 부족하다 — 경로를 몰라도 추측이 가능하고, runner에 새 필드가 추가될 때마다 같은 누출이 다시 열린다. 그래서 **능력을 제거**한다.
- **`lib/intent-arbiter.js` CREATE** — 순수 오라클 4종(fs/process/clock 없음). `buildArbiterProjection`이 `ARBITER_PROJECTION_KEYS` **whitelist**로만 투영한다(blacklist가 아니라 whitelist인 것이 핵심 — runner에 새 필드가 생겨도 자동으로 새어 들어오지 않는다). 항목 안쪽(`findings[]` · `intent_items[]`)도 같은 규칙으로 좁힌다: 최상위만 검사하면 구현이 awaiting 항목을 통째로 복사해도 통과한다. `buildArbiterTaskPrompt`는 **awaiting 경로도 plan 경로도 인자로 받지 않으며**, frozen 템플릿이 plan의 섹션명을 문구로도 부르지 않는다 — 정규식 test는 최종 문자열만 보므로, 템플릿이 구조를 이름으로 부르면 test는 통과하면서 anchoring 힌트가 새어 나간다.
- **대가를 정직하게 적는다**: 데이터가 저자 세션을 경유하므로 저자가 투영을 조작할 수 있다. 그러나 finding 조작은 M1의 `finding_digest` 대조에서 죽고, `intent_items` 조작은 새 구멍이 아니다(`## User Intent` 표는 애초에 저자가 쓴다). M2가 겨냥하는 것은 적대적 저자가 아니라 **anchoring과 sycophancy**다.

### 강등은 채널을 갖고, 그 채널은 실패 원인을 가리지 않는다

- **요구 모드는 명령 본문이 정하고 runner는 인자로만 받는다** — `MCCP_INTENT_ARBITER`는 `plan.md` 5.2z에서만 읽히고 `--arbiter-mode`로 전달된다. 두 프로세스가 각자 env를 해석하면 서로 다른 답을 낼 수 있고, 그때 봉인값은 어느 쪽 사실도 아니게 된다. `plan-codex-runner.js` 소스에 그 변수 **이름이 0회 등장**함을 e2e가 스캔으로 단언한다.
- **그 모드는 runner를 통해 다시 내려온다** — 모드를 정하는 5.2z와 그것으로 분기하는 5.5a 사이에는 Codex 호출과 triage가 있고 셸 상태는 도구 호출을 건너 살아남지 않는다. `$ARBITER_MODE`만은 **디스크 어디에서도 복구되지 않아**(`$AWAITING`·`$RUN_NONCE`는 nonce-named 파일이 실재한다) 잃어버린 본문의 추정이 `author`로 떨어지면 강등 기록 없이 저자가 판정하고 runner는 `subagent`를 봉인한다 — 일어나지 않은 분리를 주장하는 receipt다. 그래서 runner가 자신이 해석한 값을 `$AWAITING`의 `arbiter_mode`로 싣고 5.5a가 거기서 읽으며, 5.2z 계산에는 `|| echo "subagent"` fallback을 둔다. 그 필드는 **arbiter에게 도달하지 않는다**(whitelist 미포함) — blacklist였다면 배제 목록도 함께 고쳐야 했을 자리다.
- **arbiter 프롬프트 파일은 `0600`으로 쓰이고 runner가 지운다** — awaiting과 같은 findings·constraints를 담는데 명령 본문이 쓰므로 ambient umask로 떨어지고, 정리를 산문에 맡기면 건너뛰어진다. 경로는 `paths()`가 소유한다(`intent-arbiter-prompt-<nonce>.txt`).
- **판정은 존재 검사가 아니라 유효성 probe다** — `[ -f ]`는 문법이 깨진 JSON을 통과시키고, 그러면 runner가 기본 30분 타임아웃을 다 쓰고서야 `incomplete`로 죽는다. probe는 `parseAdjudicationFile`을 돌려 exit 0/1만 내며(stdout 비움, 사유는 stderr), probe 자체가 죽어도 비영점이라 자동으로 "무효"로 떨어진다 — "판정 불가"를 "유효"로 접으면 강등이 조용히 꺼진다. **검증이 publish보다 먼저** 온다: staged 파일을 무조건 옮기면 runner에게 파손된 읽기를 건네게 되어 강등 대신 `incomplete`로 죽는다.
- **강등 원인을 열거하지 않는다** — 에이전트 미등록·도구 거부·에러·취소·성공 반환 후 산출 부재·파손이 전부 같은 분기다. 초안은 `agent type not found` 하나만 다뤄 나머지가 전부 타임아웃으로 떨어졌다.
- **강등 쓰기는 create-exclusive** — `link(2)`(원자적 + `EEXIST`)를 우선하고 `openSync(…, 'wx')`를 이식성 fallback으로 둔다. `EEXIST`면 **재-probe**해 늦게 도착한 arbiter 산출이 유효하면 강등을 **취소**한다(무조건 덮어쓰면 실제로 일어난 분리를 지우고 `author`로 기록한다). 재-probe와 조건부 쓰기는 **한 프로세스** 안에서 이뤄진다 — 셸 두 단계로 나누면 그 사이가 다시 창이 된다.
- **강등에 신규 재구성 함수는 0개** — 판정 내용은 M1과 동일하게 저자 LLM이 기존 5.5a 절차로 작성한다. default verdict를 채우는 코드를 두면 강등이 곧 **자동 승인**이 되어 M1이 막은 "기록 없는 수용"이 부활한다. 불완전한 강등 산출은 M1 규칙이 그대로 `incomplete`로 죽인다.

### 봉인 2필드 — 증명이 아니라 기록

`meta.intent_arbiter`(`subagent|author`|null) + `meta.intent_arbiter_degraded_reason`. present-only(`makeSkeleton` 미포함 — tracked ship corpus hash 무손상)이고 **carve-out을 만들지 않는다**: hash 밖의 감사 필드는 서명되지 않은 필드이고 `validate-cmd`의 receipt-tamper 검사가 그 편집을 지나친다. runner는 파일을 누가 썼는지 관측할 수 없으므로 봉인되는 값은 "subagent가 썼다"가 아니라 **"이 실행이 요구한 심판 모드와 관측된 강등"** 이다. 페어링(사유는 강등이 **적용됐을 때만**)은 `schema.js` 검증 함수 안에서 강제한다 — test에만 있으면 런타임 수용 경로가 스키마상 불가능한 receipt를 그대로 받는다. `author`인데 강등 기록이 실려 오면 **모순**(강등할 것이 없다)이라 `incomplete`로 죽는다.

### 반입 결함 2건 — 같은 함수, 같은 커밋

`intent-claims.js#stripQuotedStructures`가 CommonMark HTML block start condition 7종 중 셋(`<?`·`<!LETTER`·`<![CDATA[`)을 놓쳐 그 안의 `INTENT:` 줄을 진짜 주장으로 셌고(fail-open, backlog HIGH), `stripHtmlComments`가 라인 상태 기계 **밖의** 전체-텍스트 선처리라 fence 안의 `<!--` 예시가 **뒤따르는 진짜 주장**을 삼켰다(false block, backlog MEDIUM). 방향이 반대인 두 결함이지만 원인은 하나 — 인용 판정이 한 상태 기계 안에 있지 않았다. 주석을 fence·blockquote와 같은 루프 안으로 옮기고 남은 종류를 한 번에 구현했다. 주석만은 **줄 선두에 앵커하지 않는다**(CommonMark와 의도적 불일치): 줄 중간에서 열린 주석도 렌더된 화면에서는 뒤가 보이지 않으므로, 선두로 좁히면 아무에게도 보인 적 없는 주장이 만들어진다.

### 잔여 (부정하지 않는다)

- **기본 모드에서 intent 축은 여전히 skip된다.** `MCCP_PLAN_REVIEW` 미설정 → `multi-agent` → `write.js`의 패널 carve-out이 intent 게이트를 *만족*이 아니라 *skip*으로 처리한다. 이 milestone의 게이트 실행이 그 사실을 실증했다. 귀속이 diverse-agent-review PRD이고 수정 방향이 또 하나의 대형 축이라 M3 후보로 남긴다. 잔여의 안전 논증은 intent 축에 기대지 않는다 — 패널 승인은 cross-gate dedupe를 만족하지 못하므로 terminal `/mccp:pr`에서 PR-Codex가 반드시 발화한다.
- **심판 판단의 품질은 이번 사이클에서 반증 불가다.** 배선(투영 · runner↔receipt 관통 · 본문 분기)은 test로 고정했지만 실제 subagent의 판정 품질은 머지 후 라이브 완주로 이연한다.

## [1.30.0] — 2026-08-19

> **§3.7**: `1.29.2 → 1.30.0` (**minor** — M3은 santa-evidence-diversity PRD의 마지막
> milestone이라 PRD 전체 완료 축이다). 4면(plugin.json · html.js page-foot ·
> markdown.js derived 줄 · 이 파일의 `currently` 노트)을 함께 맞췄다. 진입 시점
> 재계산에서 origin/main은 `1.29.0`이고 이 브랜치가 `1.29.1`이므로 `1.30.0`이
> 양쪽보다 앞섰다. **2026-08-20 재동기 확인**: main이 `1.29.1`을 발행(#149)하고
> 이 브랜치의 M2 항목이 `1.29.2`로 밀린 뒤에도 `1.30.0`은 여전히 양쪽보다 앞서므로
> **이 번호는 상향하지 않는다**. 4면(plugin.json · footer 2면 · 이 파일의 `currently`
> 노트)은 `1.30.0`으로 유지되며 `i18n-surface.test.js`가 재검증한다.

---

### Added — santa 증거 다양성 M3: degrade 차단

`codex`도 `gemini`도 없는 머신에서 Reviewer B는 두 번째 Claude Opus로 떨어진다. 그 조합의
NICE는 이종 조합의 NICE와 **어느 표면에서도 구분되지 않았다** — 라운드 판정도, 봉인
verdict도, receipt도 같은 값을 냈다. M3은 원장에 이미 있는 리뷰어 `model` 문자열에서
계열을 분류하고 봉인 층에서 `converged`를 `degraded`로 좁혀 push를 막되, 감사되는 사람
승인 경로를 남긴다. **리뷰어 수는 늘지 않고**(I5) 라운드 판정(`gate.js`, P1 소유·동결)은
무접촉이다 — 바뀌는 것은 *같은 NICE가 어떤 이름으로 봉인되는가* 하나다.

- `plugins/mccp/scripts/lib/santa/model-diversity.js` — P2 소유 신규 순수 oracle.
  `familyOf`(4값 — `anthropic`/`openai`/`google`/`unknown`) · `parseDegradeGate`(env 1종,
  default `enforce`, 불량값 loud warn 후 발화 쪽 fail-open) ·
  `parseDegradeAck`(strict `validateReason`에 위임, 부재와 거부를 `rejectedBecause`로 구분) ·
  `diversityFrom`(FINAL 라운드 하나만 보는 순수 집계). 외부 require는
  `receipt/lib/force-override-reason` 하나이고 그것은 `gate.js`가 이미 지고 있어 santa
  모듈군의 외부 의존 목록은 **0건 증가**다.
- **`familyOf`는 매치된 계열이 정확히 1이 아니면 `unknown`을 낸다** — 0건도, 2건 이상도.
  security-reviewer가 제안한 precedence 표는 채택하지 않았다: precedence는
  `claude-gpt-bridge` 같은 다중매치 문자열에 *어떤 계열이든 하나를* 주고, 그 하나가 상대
  리뷰어와 다르면 곧바로 이종 판정을 산다. "모르겠다가 승인을 사지 못하게 한다"가 이
  축의 원칙이므로 모호함은 unknown으로 접힌다. 미등재 모델의 처방은 게이트 완화가 아니라
  카탈로그 1줄 추가다.
- `santa/seal.js` — `deriveVerdict`가 제3값 `degraded`를 낸다(우선순위 `divergent` >
  `degraded` > `converged` — 기존 두 절은 무변경이고 그 **아래에** 절을 더한다).
  `renderReport`에 계열 1줄, `seal()` 반환에 `degraded`·`degradeReason`·`degradeAck` 3키
  추가. `exitReason` 투영 술어를 `=== 'converged'`에서 `!== 'divergent'`로 일반화했다 —
  verdict가 2값이던 동안 두 술어는 같았고 `degraded`가 처음으로 그 둘을 가른다(degraded
  라운드는 **수렴했다**).
- **`degraded`는 receipt 어휘에 들어가지 않는다.** `REVIEW_VERDICT_VALUES`는
  `receipt/schema.js`의 `CODEX_VERDICT_VALUES`와 공유되므로 거기에 값을 더하면 santa와
  무관한 codex 축·`pr-ship-gate`·dedupe·대시보드가 전부 새 값을 만난다. 대신 `seal()` 안
  **한 곳**에서 `divergent`로 사영하고(둘 다 비승인이라 사영이 넓히지 않는다) degrade라는
  사실은 present-only 필드가 진다. `degraded`라는 이름은 `seal` stdout ·
  `.claude/reviews/` 리포트 · Step 5.5 정지 메시지에만 나타난다.
- `receipt/write.js` + `receipt/schema.js` — present-only 5필드
  (`santa_model_families` 비음 정수 · `santa_model_degraded`/`santa_degrade_ack` **`true`만** ·
  `santa_degrade_reason` 2값 열거 · `santa_degrade_ack_reason` 비어있지 않은 문자열) +
  **ack ↔ ack_reason 양방향 불변식**. `makeSkeleton` 미등록이라 이 축을 쓰지 않는 receipt의
  canonical hash는 무변동이다(§3.12).
- `santa/cli.js` — `record --model`의 PATH 재도출 대조. `openai`/`google` 계열을 선언했는데
  `codex`/`gemini`가 PATH에 없으면 `SANTA_MODEL_UNAVAILABLE`로 exit 2이고 라운드는 열린 채
  남는다(신규 exit code 0건). 외부 프로세스를 띄우지 않고 `PATH` 분해 + `statSync().isFile()`
  로 확인하며 Windows는 `PATHEXT`를 함께 시도한다.
- `commands/santa-loop.md` — Step 3 Reviewer B fallback 문단에 "그 경고가 이제 봉인
  verdict를 바꾼다" 한 문단, Step 5.5의 `SEAL_VERDICT` 분기를 3갈래로(**`degraded`를 먼저
  검사** — `!= converged`가 앞서면 degraded가 divergent 메시지로 흡수되어 처방이 사라진다),
  Output 블록의 verdict/Result 줄, Notes 5항목.

### 이 milestone이 주장하지 않는 것

- **위조 방지가 아니다.** PATH 대조가 막는 것은 *설치되지 않은 CLI의 모델명을 참칭하는*
  경로뿐이다. codex가 설치돼 있는데 Claude fallback을 쓰고 `gpt-5.4`라고 적는 것은 막지
  못한다 — 셸에서 어느 모델이 응답했는지 확인할 방법이 없다. M1이 `--lane`에 대해 적은
  것과 **같은 천장**이고 검증은 결과 분포에 맡긴다(PRD 지표 5).
- **ack는 verdict를 재작성하지 않는다.** `MCCP_SANTA_DEGRADE_ACK`(strict 사유)는 push를
  열 뿐이고 봉인은 `degraded` 그대로다. codex 미설치 머신에서는 모든 실행이 degraded라
  ack가 상주 설정이 되는데, ack가 verdict를 바꾸면 degraded 실행 수가 영구히 0이 되어
  "degrade 가시화" 지표가 측정 대상을 잃는다. 그대로 두면 상주 ack 아래에서도 비율이
  계속 세어지고, 그 비율이 곧 "이 머신에 codex를 설치할 이유"의 실측이다.
- **의도적 비활성과 미가용의 구분은 봉인되지 않는다.** 봉인되는 `santa_degrade_reason`은
  projection에서 파생 가능한 두 값(`same_family`/`unknown_model`)뿐이다. 봉인 시점에 PATH를
  다시 훑은 값은 리뷰어가 실제로 돈 시점과 어긋날 수 있고, receipt는 그것을 라운드의
  사실처럼 보여준다. 그 구분은 Step 5.5의 **정지 메시지**가 운영자 안내로만 설명한다.
- **블라인드 레인 `off`의 UI3 미충족은 M3 범위가 아니다.** 처방이 다르기 때문이다(모델
  degrade는 "codex를 설치하라", 레인 degrade는 "`off`를 그만 쓰라"). 한 verdict에 묶으면
  운영자가 받은 정지 메시지가 어느 처방을 가리키는지 흐려진다. PRD Open Question의 남은
  후보는 신규 milestone 하나로 좁혔다.

### Changed

- `docs/ENVIRONMENT.md` §11 — `MCCP_SANTA_DEGRADE_GATE`(`enforce` default / `off`) ·
  `MCCP_SANTA_DEGRADE_ACK` 등재. `off`는 **verdict 강등만** 끄고 관측 3필드는 그대로
  stamp된다 — 부재("이 축이 없던 시절")와 관측된 0/false는 다른 상태이므로 kill switch가
  관측까지 끄면 `off` 실행이 M3 이전 실행과 구분되지 않는다.
- `docs/santa-loop/ownership.md` — 소유권 표 신규 행 + P2 M3 export 계약 + "P2 M3이 연 P0
  파일과 근거" 표(열지 **않은** 경계 포함).
- 회귀 test: `santa-lanes.test.js` M3 블록 23건 신규(총 70건) ·
  `santa-review-gate.test.js` 8건 신규(총 25건) · `santa-loop-cap.test.js` 2건 신규(총 56건,
  모듈 집합 · receipt-free · require allowlist 3목록 확장). **단언 삭제 0건.**
  `santa-seal.test.js`의 fixture 모델명을 `m-a`/`m-b`(플레이스홀더 → `unknown` → degrade)에서
  `opus`/`gpt-5.4`로 정직하게 바꿨다 — 그 test들이 애초에 말하려던 상태가 "두 **이종**
  리뷰어"이고, 단언을 지우거나 게이트를 끄는 대신 fixture를 실재에 맞추는 쪽이다.

## [1.29.2] — 2026-08-19

> **§3.7**: `1.28.2 → 1.29.2` (patch — PRD 3 milestone 중 두 번째 ship). 4면
> (plugin.json · html.js page-foot · markdown.js derived 줄 · 이 파일의 `currently`
> 노트) + `docs/ENVIRONMENT.md`의 토글 라벨을 함께 맞췄다.
>
> **재계산 이력**: 당초 `1.28.3`으로 적었으나 `/mccp:prp-commit` 직전 재계산에서
> origin/main이 이미 `1.29.0`(review-loop-bypass M2, `1fc8657`)까지 나간 것이
> 확인됐다 — 그대로 두면 머지 시 plugin.json이 **뒤로 가고** `claude plugin update`의
> 캐시 디렉토리가 설치본보다 낮아져 §3.7이 bump을 강제하는 이유 자체가 무효화된다.
> forward-only로 `1.29.1`에 착지. M1의 `1.28.2`는 main과 충돌하지 않고 머지 후에도
> version 내림차순이 성립하므로 그대로 뒀다.
>
> **재상향 (2026-08-20, PR #150 오픈 후 main 재동기)**: `1.29.1`은 결국 main이
> 가져갔다 — PR #149(environment-doc-uniformity)가 같은 번호로 먼저 발행됐다
> (`8d3e9cf`). §3.7 forward-only대로 **이미 발행된 번호는 불가침**이므로 미머지
> 쪽인 이 항목을 `1.29.2`로 한 칸 밀었다. 두 항목은 서로 다른 축이라 합치지 않는다.
> 이것이 §3.7이 기록한 **네 번째 병렬 브랜치 version 충돌**이며, 충돌이 브랜치를 딴
> 시점이 아니라 **PR을 연 뒤에도 열려 있다**는 실측이다(PR #150은 이미 오픈 상태였다).

### Added — santa 증거 다양성 M2: 상시 스코프 + 정합 rubric

- `plugins/mccp/scripts/lib/santa/scope-always.js` — P2 소유 신규 순수 oracle.
  `parseAlwaysScope`(env 1종, default `enforce`, 불량값 loud warn 후 발화 쪽 fail-open) ·
  `sourcePrdFrom`(plan이 **스스로 선언한** Source PRD를 링크/평문 두 형태로 추출하고 plan
  상대 표기를 repo 상대로 환원) · `mergeScope`(diff 순서 보존 + 상시 항목 append + 정규화
  posix 경로 기준 중복 제거 + `MAX_ALWAYS_PATHS`(40) 초과 시 `truncated` 수 산출) ·
  `CONSISTENCY_RUBRIC`(UI4·UI5 고정 문구 — `DO_NOT_TRUST_NARRATIVE`와 같은 취급). 외부
  require는 builtin `path` 하나뿐이라 santa 모듈군의 외부 의존 목록은 **0건 증가**다.
- `santa/cli.js` — `scope-always` subcommand 추가(`--paths-file` **필수**. 전 검증 통과 후
  1회만 `out()`하므로 실패 시 stdout에 부분 JSON을 내지 않는다). 발견 단계(`pairs` ·
  `unresolved`)는 CLI가 소유한다 — oracle은 `fs`를 모른다(DD2).
- `commands/santa-loop.md` — Step 1이 `scope-always`를 호출해 `$SCOPE_PATHS_JSON`을
  **교체**하고(생산자는 여전히 Step 1 하나 — M1 DD11) `added`·`pairs`·`unresolved`·
  `truncated`를 stderr로 표면화한다. Step 2가 `$CONSISTENCY_RUBRIC_ROW`를 verbatim 덧붙이고,
  Step 3이 rubric 전문을 파일로 써 `lanes --rubric-file`로 넘긴다 — M1이 만들어 두고
  호출자가 쓰지 않던 자리이며 **블라인드 리뷰어가 정합 행을 받는 유일한 경로**다.
  `TMPDIR_SANTA` 정의를 최초 사용처(Step 1)로 올리고 Step 3·record 블록의 주석을 맞췄다.
- 회귀 test: `santa-lanes.test.js` M2 블록 23건 신규(총 47건) — env 방향 · Source PRD 추출
  · **보안 경계** · 병합 순서/중복/절삭 · 고정 rubric 어구 · CLI 7키 계약 · #125 회귀 2건.
  `santa-loop-cap.test.js`는 모듈 집합 · receipt-free · require allowlist 3목록을 넓혔다
  (단언 삭제 0건).

### Fixed — `/mccp:code-review` Local Mode 흡수 (HIGH 2 · MEDIUM 4 · LOW 2)

- **정합 rubric 행이 조용히 미전달될 수 있었다**(HIGH). Step 3의 heredoc이 quoted라
  파라미터 전개가 꺼져 있는데 지시문은 "`$CONSISTENCY_RUBRIC_ROW`를 verbatim 복사"였다 —
  산문이 요구하는 동작을 그 자리의 메커니즘이 수행할 수 없다. 실측: 변수명이 리터럴로 남은
  rubric도 `lanes`가 exit 0으로 통과시키고 `## Rubric` 섹션까지 정상이라, DD5가 "한 축"이라
  못 박은 그 축의 **절반이 미전달인데 어떤 기계적 신호로도 구분되지 않았다**. 이제 셸이
  `printf`로 행을 덧붙이고 `grep -qF 'working tree'`로 착지를 확인한 뒤에만 리뷰어를 띄운다.
- **`$TMPDIR_SANTA`를 Step 3이 스스로 선언하지 않았다**(MEDIUM). `mkdir -p`가 덮는 것은
  디렉토리 부재이지 빈 변수가 아니다 — 실측상 `mkdir -p ""`는 실패하지만 상태가 가려지고
  paths 파일이 파일시스템 루트에 떨어진다(M1이 이미 흡수한 결함의 방향만 뒤집힌 재발).
  idempotent 상수라 두 번 치르는 비용이 0이므로 Step 3에 재선언했다.
- **후보 상한이 경로 상한과 같아 `pairs`가 스코프 밖 파일을 가리킬 수 있었다**(MEDIUM).
  후보 1개가 경로 2개를 내므로 40 후보 → 최대 80 경로 → `mergeScope`가 40으로 절삭한다.
  실측 30쌍 입력에서 `pairs=30 added=40 truncated=20`이 나왔고 10쌍이 스코프 밖이었다 —
  rubric은 "target paths에 열거된 쌍"을 대조하라 지시하므로 그 쌍은 **검토되지 않은 채
  개수만 보고된다**. `MAX_ALWAYS_CANDIDATES`를 `MAX_ALWAYS_PATHS`의 절반으로 내려 CLI
  경로에서 절삭이 구조적으로 발생하지 않게 했다.
- **`off` + 빈 diff가 파싱 실패로 오진됐다**(MEDIUM). `paths` 부재(생산자 고장)와 빈 배열
  (Step 1이 이미 정상으로 규정한 "변경 없음")은 다른 사실인데 한 분기가 둘을 삼켜, 정지가
  두 단계 앞으로 오고 일어나지 않은 파싱 실패를 보고했다. `absent`/`empty`/`ok` 3상태로
  분리하고 `empty`는 exit 0으로 조용히 끝낸다.
- **`off`와 `enforce`가 서로 다른 스코프를 냈다**(MEDIUM). `off`가 `diffPaths`를 날것으로
  통과시켜, 이탈 형태를 접는 `enforce`와 갈렸다 — kill switch가 *무엇이 검토되는가*를
  아무도 선언하지 않은 방향으로 바꾼다. 이제 두 모드가 같은 병합을 태우고 차이는 "상시
  항목이 붙는가" 하나다. 정규화로 사라진 경로는 `mergeScope`가 `dropped`로 내고 CLI가
  stderr로 표면화한다(JSON 7키 계약은 무변경 — 이것은 정상 수치가 아니라 입력 오류 신호다).
- **`pairs[].plan`과 `paths`의 표기가 갈릴 수 있었다**(LOW). 후보 수집이 백슬래시만 바꿔
  `./x.plan.md`를 살려 뒀다. `toRepoRelative`를 export해 발견 단계가 oracle과 같은 규칙으로
  접는다(export 8 → 9).
- PRD Open Questions의 리스트가 빈 줄 하나로 두 블록으로 쪼개져 있었다(LOW).

### Changed

- `.claude/prds/santa-evidence-diversity.prd.md` — Scope MVP (2)의 네 글롭
  (`.claude/PRPs/**` · `.claude/prds/**` · `*plan*.md` · `*PRD*.md`)을 **decision 범위의
  관계 폐포**로 정정했다. 결정을 내린 것은 논증이 아니라 실측이다: 이 저장소에서 그 글롭은
  `.claude/PRPs/**` 267 파일 / 6997 KB · repo 전역 `*plan*.md` 191 파일이고, 번들 리뷰어가
  받는 것은 경로가 아니라 **내용**이라 7 MB를 넣으면 Risk 2가 즉시 발화한다 — 결과는 "더
  많이 보게 했더니 아무것도 못 보게 됐다"다. 폐포는 약 70 KB이고 #125 회귀가 요구하는 최소
  집합과 일치한다. Open Question 2건(무관 PRD 유입 · P3 델타 경계)에 해소 표시를 달았다.
- `docs/santa-loop/ownership.md` — P2 M2 export 계약 표 + 연 파일 근거(변경 프로토콜 4) +
  **P3가 소비할 계약**(상시 대상은 델타 축소에서 면제 — DD6/UI8) 한 문단.

### Known limits

- **receipt는 이 축을 봉인하지 않는다**(DD7). 상시 스코프는 라운드 단위 사실인데
  `ledger.beginRound`의 라운드 형태는 P0 동결 시그니처라 필드 추가가 P0 재개 사유이고,
  리뷰어 envelope로 우회하면 값이 **호출자 선언**이 되는데 `--lane`과 달리 CLI가 Step 1의
  판단을 재현할 수 없어 검증 불가능한 필수 플래그가 된다. 그래서 관측 표면은 Step 1의
  stderr 출력 · 블라인드 프롬프트 본문 · 회귀 test 셋뿐이고, **상시 축이 조용히 0건을 낸
  실행은 receipt만 봐서는 M1 시절 실행과 구분되지 않는다**. PRD Open Question으로 등재했다.
- **회귀 fixture가 증명하는 것은 스코프이지 포착이 아니다.** 리뷰어가 "plan은 4개라 하는데
  PRD는 7개"라는 불일치를 실제로 잡는지는 LLM 행위라 셸로 단언할 대상이 없다. test가 닫는
  것은 그 앞 단계 — 관계의 한쪽만 스코프에 드는 구조적 불가능 상태다. test 이름과 주석에
  그 구분을 명시했다.
- **폐포가 좁아 놓치는 변종**(형제 milestone plan 간 불일치 등)이 있을 수 있다. 그것이
  나오면 넓힘의 근거가 되는 실측이지 지금 넓힐 근거가 아니다 — 반대 방향의 실측이 7 MB다.
## [1.29.1] — 2026-08-19

**환경변수 문서 최신화 + 값 규약 통일 (단일 plan ship → patch bump, 1.29.0 → 1.29.1)** — `docs/ENVIRONMENT.md`는 두 가지가 동시에 낡아 있었다. 문서가 코드를 따라가지 못했고(실 토글 117개 중 22개 미등재, 문서에만 있는 이름 10개, ship된 축 둘이 `🚧 예정`), 값의 어휘가 토글마다 달랐다(production 코드에 boolean 파싱 규약 **8종** 공존 — 같은 저장소에서 `MCCP_SUBSCRIPTION=true`는 무시되고 `MCCP_ORCHESTRATION_USD_BOMB=true`는 켜졌다). 문서만 고치면 문서가 거짓말을 하므로 두 축을 한 단위로 닫았다.

- **선언을 하나로 만들었다.** [env-contract/registry.js](plugins/mccp/scripts/lib/env-contract/registry.js)가 157개 이름의 kind·values·default·polarity·status·domain·evidence를 단일 선언한다. `state/toggle-snapshot.js`의 `TOGGLE_DEFAULTS` 리터럴(56개)은 이 표에서 **파생**으로 바뀌어 세 번째 진실원이 사라졌고, 실측되던 `defaults_conflicts` 1건이 그 자리에서 해소됐다.
- **규약은 둘이고 그 경계에 검사 가능한 기준이 있다.** `bool`은 `on`/`off`를 가르치고 `1`·`true`·`yes`·`enabled`를 함께 받는다. `bypass-flag`는 `MCCP_SKIP_RECEIPT`·`MCCP_CODEX_DISABLED`·`MCCP_ALLOW_CODEX_UNAVAILABLE` **정확히 3개**이며 수용 집합이 이전과 **바이트 단위로 동일**하다 — 잠들어 있던 `=true`는 이 milestone 이후에도 여전히 무시된다. 소속 기준은 «활성화가 리뷰 게이트를 약화하는가»이지 이름에 `DISABLE`이 들어가는지가 아니다.
- **문서는 레지스트리의 투영이 됐다.** 색인 1장(99,040 B → 27,297 B) + 도메인 상세 8장. 상세의 모든 토글 앵커는 `settings.json`에 그대로 붙여 넣을 수 있는 사용 예시를 갖고, 그 JSON은 실제로 파싱되며 값이 레지스트리 어휘에 속하는지까지 검사된다.
- **삭제가 아니라 이전이다.** 축약 이전 문서에서 토글을 언급하는 실질 줄 150개가 전부 목적지 문서에 줄 단위로 보존되며, 그 사실을 정규화 대조가 기계로 확인한다(고아 0).
- **9개 fail-closed 검사.** [env-contract/lint.js](plugins/mccp/scripts/lib/env-contract/lint.js)가 레지스트리 ↔ 런타임 ↔ 색인의 삼각 정합, 상세 링크의 **앵커까지** 해석, 은퇴 이름의 런타임 부재, 사용 예시 3검사, `evidence`의 어휘 검사(절대경로·`..` 거부)를 fs 실재 확인보다 **먼저** 수행하는 순서, 그리고 `env-contract/` 밖의 raw boolean 비교 **0건**을 강제한다. 마지막 검사는 이관 누락과 새 우회 경로를 같은 축으로 닫으며, 직접 비교뿐 아니라 load-time 별칭 포획과 구조분해까지 본다.
- **동작 변경이 0인 곳과 아닌 곳을 나눠 적는다.** `bypass-flag` 3개는 변경 0이다. `bool`로 넓어진 토글에서는 이전에 무시되던 `yes`·`true`·`enabled`가 이제 유효하다 — 예컨대 `MCCP_SUBSCRIPTION=yes`나 `MCCP_ORCHESTRATION_USD_BOMB=enabled`가 그렇다. 어느 것도 리뷰 게이트를 열지 않지만, 그런 값이 이미 설정돼 있던 환경에서는 동작이 달라진다.

## [1.29.0] — 2026-08-19

**review-loop-bypass M2 — 미흡수 지적 회수 (PRD 최종 milestone → minor bump, 1.28.1 → 1.29.0)** — M1의 단일통과 토글이 떨어뜨리는 `quorum.blockingFindings`가 이제 `.claude/plans/codex-findings-backlog.md`에 **기계적으로 적재**된다. 그리고 그 적재는 완화의 부수효과가 아니라 **전제조건**이다 — 적재할 수 없으면 완화하지 않는다(`5.2g2` → `EX_BLOCK`). 부수효과로 두면 조용히 실패했을 때 남는 것이 정확히 M1이 만든 부채(지적은 사라지고 receipt는 통과를 기록)이고, 그것을 막는 것이 M2의 존재 이유다.

- **소비 경로를 새로 만들지 않았다.** `derive/sources/backlog.js:7`이 이미 이 표를 파싱하고 `renderer/sections/status-grid.js:179`가 '이월 finding'으로 표면화한다. M2가 채운 것은 그 파이프의 **비어 있던 입구**다 — 이 파일에 쓰는 코드는 저장소 전체에 0건이었고 지금까지 전부 LLM이 산문 지시에 따라 손으로 append했다.
- **적재 대상은 `blockingFindings` 정확히 그 집합이다.** 토글이 실제로 떨어뜨리는 것이 그 배열이므로 적재 대상과 완화 대상이 같아야 "유실 0"이 산술로 성립한다. `l2.json`은 **적재원으로 읽지 않는다**(같은 사실의 출처가 둘이 되면 어느 쪽이 정본인지 오라클이 답할 수 없다) — non-blocking **카운트**로만 읽고, 읽을 수 없으면 0이 아니라 `null`이다. severity `UNKNOWN`·`FAIL`도 함께 적재한다: **적재는 판정이 아니다.**
- **HALT는 UI6과 충돌하지 않는다.** M1의 DD2가 그은 선과 같은 선이다 — 완화 대상은 `divergent`(보았고 결함을 찾았다) 하나이고 `unavailable`(인증할 수 없었다)은 완화하지 않는다. "결함을 기록할 수 없었다"는 후자다. **퇴로는 새 env가 아니라 토글을 끄는 것**이며(M2는 토글을 하나도 추가하지 않았다 — 적재를 끄는 스위치는 곧 유실을 켜는 스위치다), 그 경우 원래의 비수렴 HALT로 돌아가 저자가 리뷰 기록에서 흡수한다. 최악의 실패 모드가 "토글이 도움이 안 된다"이지 "지적이 사라진다"가 아니다.
- **소비자 파서 계약을 깨지 않는다.** 열은 정확히 4개다 — `backlog.js:6`의 헤더 정규식이 그 4열을 리터럴로 고정하므로 5번째 열을 만들면 파서가 표 전체를 못 찾아 기존 40여 행이 **한꺼번에** 사라진다. 파이프는 HTML 수치 참조로 치환하고(마크다운은 파이프로 렌더하고 파서는 분할하지 않는다), 절단은 **이스케이프 이전** raw 텍스트에 적용해 미완성 엔티티를 남기지 않으며 UTF-16 서로게이트 경계를 깨지 않는다. 왕복 test는 `s.ok`가 아니라 **원시 데이터 행 수 = 파싱된 항목 수**를 단언한다 — 파서가 셀 수 미달 행을 조용히 `continue`로 버리기 때문에 `s.ok`만 보는 검사는 깨진 행을 통과로 읽는다.
- **경로는 오라클이 강제한다.** 기존 22행이 전부 repo-relative였던 것은 관례일 뿐 강제가 아니었다. `deriveBacklogRows`가 `repoRoot`를 받아(plan의 원래 서명에 없던 인자 — L2 security가 지목한 자기모순: `appendRows`는 받는데 렌더링하는 쪽이 못 받았다) `path.relative` + 구분자 `/` 통일을 적용하고, 저장소 밖 경로는 절대경로 대신 자리표시자로 떨어뜨린다. `write.js#normalizeReceiptCwd`가 E7을 닫을 때 쓴 규약 그대로다.
- **전체 rewrite를 하지 않는다.** 중복 스캔은 read지만 쓰기는 `appendFileSync` **단일 호출**이다 — append-only 원장이라 read-modify-write가 애초에 불필요하고, 하지 않으면 동시 writer가 서로의 append를 덮어쓸 창 자체가 없다. 남는 중복 1행 가능성은 유실이 아니며 loud stderr로 관측된다. 멱등 키는 `reviewed_plan_hash`·perspective·severity·raw claim의 sha256이고 **`review_proof.reviewed_plan_hash` 하나에서만** 온다: plan을 다시 해싱하면 리뷰어가 읽은 본문이 아니라 지금 디스크에 있는 본문의 해시가 되어 DD13이 봉인한 바인딩과 다른 값으로 키잉된다. 부재하면 추론하지 않고 `EX_BLOCK`이다.
- **강제 등급의 정직한 천장** — 세 축이 나눠 덮으며 어느 하나도 나머지를 대신하지 않는다. 순수 오라클(행 파생·이스케이프·digest)은 단위 test가, CLI 배선(`decision.json`을 읽고 · 행을 파생하고 · `backlog.json`을 쓰고 · 정확한 종료코드를 내는 것)은 **`spawnSync`로 프로세스를 실제로 띄우는** test가, 게이트가 실제로 멈추는지는 라이브 발화가 담당한다. plan.md 정적 단언이 잡는 것은 **배선 누락과 위치 drift뿐**이다 — 셸 인용 실수·종료코드 미검사·결과를 무시하는 호출은 전부 통과한다. help 텍스트 grep은 명령이 존재한다는 것조차 증명하지 않으므로 Validate로 쓰지 않았다.

- **자기 코드리뷰 6건을 같은 버전 안에서 흡수했다** — 미출시 상태라 별도 patch로 미루지 않았다. 모두 한 계열이다: **작성자가 스스로 선언한 파서 계약보다 느슨했던 자리들**. (1) 절단면의 서로게이트 가드가 보존되는 마지막 문자(`end - 1`)가 아니라 **버려지는** 문자를 검사해, 쌍이 절단면에 걸치면 고아 high surrogate가 남아 원장에 U+FFFD로 기록됐다. 기존 test는 쌍을 가드가 불필요하게 발화하는 무해한 정렬에 두었고 검사도 JS 문자열의 U+FFFD를 봤는데 고아 서로게이트는 utf8 인코딩 시점에야 치환되므로, 파손된 출력에도 통과했다 — 이제 절단면 전후 6개 정렬을 쓸며 **바이트 왕복**으로 잰다. (2) 4셀 중 `finding_cell` 하나만 이스케이프해 `severity`·`date`·경로 셀은 원문이 그대로 실렸다. `severity`는 리뷰어 산출물에서 오므로 파이프는 열을 밀고 개행은 **위조 행을 통째로 삽입**한다(현재는 `quorum.js#normalizeSeverity`가 enum을 닫아 도달하지 못하지만, 그 닫힘은 이 모듈 밖의 사정이라 계약이 아니다). (3) 빈 date 셀을 허용해, `backlog.js:43`이 그 행을 조용히 버리므로 **파일에는 있으나 어느 소비자도 못 읽는** 행이 만들어질 수 있었다 — M2가 닫으려는 유실과 같은 형태라 헤더 부재와 같은 강도로 throw한다. (4) 중복 스캔이 append 이전 스냅샷만 봐서 **같은 실행 안의** 동일 digest 2건이 둘 다 실렸고, 이후 재실행이 둘 다 건너뛰어 중복 쌍이 영구화됐다. (5) repo 밖 자리표시자가 꺾쇠 토큰이라 GFM이 raw HTML 태그로 삼켜 출처 셀이 화면에서 빈 칸으로 렌더됐다. (6) `id=` 무력화의 대체 문자열이 소문자 고정이라 원문 `ID=`가 기록에서 대소문자가 바뀌었다. 여섯 건 모두 회귀 test를 동반하며, 그 test들은 수정 이전 모듈에 대고 **7건이 붉어지는 것으로** 실효를 확인했다.

> **§3.7 forward-only 점검 (14번째)**: main이 `1.28.1`(M1)에 머물러 있어 `1.29.0`이 여전히 앞서므로 상향이 필요 없었다. 동기 4면(`plugin.json` · `renderer/html.js` page-foot · `renderer/markdown.js` derived 줄 · 본 CHANGELOG의 `currently` 노트)을 함께 갱신하고 `i18n-surface.test.js`로 재검증했다.

> **§3.7 forward-only 상향 (13번째 재발)**: 이 항목은 원래 `1.27.3`이었다. milestone-close를
> 진행하는 사이 main이 `1.27.2` → `1.28.0`을 발행해 `1.27.3`이 main 최대치보다 뒤로 밀렸으므로,
> 발행된 번호는 불가침이라는 원칙대로 미머지인 이쪽을 `1.28.1`로 올렸다. 동기 4면(plugin.json ·
> renderer/html.js page-foot · renderer/markdown.js derived 줄 · 본 CHANGELOG의 `currently` 노트와
> 이 항목의 bump 서술)을 함께 갱신하고 `i18n-surface.test.js`로 재검증했다.

## [1.28.2] — 2026-08-18

> **§3.7 forward-only 상향 (13번째 재발, 이번엔 실제 상향)**: plan은 `1.28.0 → 1.28.1`을
> 적었으나 `/mccp:pr` 직전 재계산에서 main이 이미 `1.28.1`을 발행한 것이 확인됐다. 발행된
> 번호는 불가침이므로 한 칸 올려 `1.28.2`에 착지한다. 4면(plugin.json · html.js page-foot ·
> markdown.js derived 줄 · 이 파일의 `currently` 노트)을 함께 맞췄다.

### Added — santa 증거 다양성 M1: 블라인드 레인

- `plugins/mccp/scripts/lib/santa/lanes.js` — P2 소유 신규 순수 oracle. `parseBlindLane`
  (env 1종, default `a`, 불량값 loud warn 후 발화 쪽 fail-open) · `assignLanes`(DD2 배정
  표 3행 — `a`는 A blind, `b`는 B blind, `off`는 전원 bundled) · `buildBlindPrompt`
  (**파일 내용을 실을 인자가 없다** — 번들 누출을 사후 검사가 아니라 인자 부재로 막는다) ·
  `laneCoverageFrom`(집계, 어떤 입력에도 미throw) · `blindIdsFrom`.
- `santa/cli.js` — `lanes` subcommand 추가(`--paths-file` **필수**, 빈 배열도 거부. 실패 시
  stdout에 부분 JSON을 내지 않는다) + `record --lane blind|bundled` **필수**화. 선언값은
  `parseBlindLane`→`assignLanes`로 재도출해 대조하고 불일치는 exit 2(`SANTA_LANE_MISMATCH`).
- `santa/seal.js` — `project`에 lane 투영(legacy envelope는 `null`), 라운드 표에 레인 열,
  라운드 ≥ 1이면 집계 정수 2종을 stamp. **값이 0이어도 생략하지 않는다** — 부재는 "레인 축
  이전(모름)"이고 0은 "관측된 0"이라 서로 다른 상태다.
- `receipt/write.js` · `receipt/schema.js` — `meta.santa_blind_records` ·
  `meta.santa_blind_rounds` present-only 비음 정수 2종. `makeSkeleton` **미등록**이라
  git-tracked ship corpus(§3.12)의 canonical hash가 무변동이다.
- `commands/santa-loop.md` — Step 1이 스코프를 `$SCOPE_PATHS_JSON`으로 고정(M2 상시 스코프의
  단일 접속점), Step 3이 `lanes`를 호출해 `$BLIND_ID` **하나로** 분기한다. 호출 실패·파싱
  실패는 리뷰어를 띄우지 않는다 — 이 축의 고장은 M1 이전과 똑같아 보이는 정상 실행으로
  위장되기 때문이다.
- 회귀 test: `santa-lanes.test.js` 신규 23건 + `santa-loop-cap.test.js`(모듈 집합 ·
  receipt-free · require allowlist · envelope golden 확장) + `santa-seal.test.js` 5건 +
  `santa-review-gate.test.js` 4건.

### Known limits

- `--lane`은 **선언이지 관측이 아니다**(DD4). 커맨드 본문이 블라인드라 적고 번들을 건네도
  셸이 그것을 볼 수 없다. M1은 위조 방지를 주장하지 않으며, 검증은 PRD가 정한 결과 분포
  (두 레인이 동시에 놓친 항목 비율)가 맡는다.
- `MCCP_SANTA_BLIND_LANE=off`로 블라인드 0건 라운드가 무기한 성립하는 것을 **어느 milestone도
  막지 않는다**. M3의 Scope는 Reviewer B 부재 fallback이라 이 경우를 다루지 않는다 — PRD
  Open Question으로 등재했고 소유자 결정은 M1 밖이다.

## [1.28.1] — 2026-08-18

**review-loop-bypass M1 — 단일통과 토글 (PRD 첫 milestone → patch bump, 1.28.0 → 1.28.1)** — `MCCP_REVIEW_SINGLE_PASS`(고정 enum 3종: `scope_too_small` · `deadline_pressure` · `deferred_to_prd_completion`)가 켜지면 `/mccp:plan`의 L2 승인 패널이 1회만 발화하고 quorum 비수렴이 진행을 차단하지 않으며, 세 게이트의 Codex 라운드 캡이 `MCCP_GATE_ROUND_CAP`과 무관하게 1로 고정되고, `/mccp:santa-loop`은 라운드를 열지 않는다. **리뷰를 없애는 것이 아니라 반복을 없앤다** — 지적은 `l2.json`과 `.claude/reviews/plan-review-<slug>.md`에 그대로 남는다.

- **새 verdict 값을 만들지 않았다** (PRD Open Question 3의 답). `resolution.review_verdict`는 실제 `divergent`를 그대로 봉인하므로 대시보드 · `evidence-audit` · ship gate가 전부 정직하게 비승인으로 읽고 cross-gate dedupe도 열리지 않는다. 토글이 바꾸는 것은 **명령 본문이 HALT하는가** 하나이고 receipt가 주장하는 내용은 무변경이다. `converged`로 위장하면 §3.12의 완료 판정 키 신뢰가 깨지므로, 위장하지 않는 것이 그 문제에 대한 답이다.
- **완화되는 경로는 정확히 하나** — `decideReview`의 `quorum.passed !== true` 반환. L1 실패 · L2 부재/판독 불가 · `responded=0` · budget skip · DD13 plan hash 불일치 · hybrid인데 L3 미수렴은 토글이 켜져 있어도 전부 HALT한다(`divergent`=보고 결함을 찾았다 / `unavailable`=인증할 수 없었다). 이 보장은 검사 목록이 아니라 **코드 순서**로 성립한다 — 완화 분기가 나머지 차단 분기보다 뒤에 있다. hybrid는 그 순서로 보장되지 않아(hybrid 블록이 quorum 통과 경로에만 있다) 완화 자격에 L3 수렴 전제를 직접 싣는다.
- **receipt 2필드는 서로 다른 축이다** — `meta.review_single_pass_reason`(토글이 *설정*됐다는 env ambient 주석, 명시 우선) 대 `meta.review_single_pass_bypassed_verdict`(실제로 *적용*됐다는 명시 전용 감사 축). §3.12의 `codex_disabled` 대 `codex_disabled_at_pr`과 같은 구분이며, ambient에서 적용 사실을 추론하면 위조 탐지 분기가 구조적으로 도달 불가가 된다. schema가 양방향으로 강제한다 — 정방향의 자격 verdict는 비수렴 전체가 아니라 `divergent` 하나이고, 역방향의 판별자는 source 이름이 아니라 **proof 구조**다(`multi-agent`는 `layers.l2` 비수렴, `hybrid`는 거기에 `layers.l3='converged'`). 두 축 모두 완화 형태에 플래그를 요구하고 그 밖에는 금지한다: 요구만 두면 DD2가 완화 금지로 명시한 L3 이견이 진짜 우회처럼 봉인되고, source 이름에 결속하면 L1이 무너진 정직한 기록(§3.3 수동 복구)조차 일어나지 않은 우회를 주장해야 한다 — 후자는 command-body 산문을 schema가 볼 수 있다고 가정한 결과였다.
- **UI5 측정의 해시 축을 봉인했다** — dispatch 로그는 `hash-plan`(신규 subcommand = `planAwareMarkdownHash`)으로 keying한다. 이전에는 `hash-markdown`(raw)으로 적었는데 대조 상대인 Measurement 블록은 plan 축의 **structural** 해시를 담고 있어, 두 값은 모든 구조 정규화가 no-op인 동안만 우연히 일치했다. Acceptance 체크박스가 한 번 체크되는 순간 R0 항목만 매칭돼 **재발화 2회가 단일 라운드로 통과**한다(실측 재현). 회귀 test는 두 해시가 갈리는 fixture로 그 fail-open 자체를 고정하고, CLI 표면(`hash-plan` ≡ `planAwareMarkdownHash`)까지 대조한다.
- **`MCCP_GATE_ROUND_CAP`의 production 오라클이 처음 생겼다** — `round-budget.test.js`의 test-local `parseCap`이 유일한 구현이던 상태를 끝내고 `lib/review-single-pass.js#effectiveRoundCap`으로 추출했다(그 test 파일 헤더가 예고하던 extraction). 토글이 켜지면 캡 값과 무관하게 1을 반환한다(PRD Open Question 2의 답 — 토글이 상위 정책, 캡은 그 아래 조정값).
- **santa-loop은 `begin-round`에서 거부한다** (PRD Open Question 5의 답). PRD의 전제 하나를 정정했다 — santa-loop은 세 게이트가 발화시키는 것이 아니라 사람이 직접 부르는 독립 명령이므로 구현 지점은 게이트 본문이 아니라 santa CLI다. `ledger.beginRound` **이전**에 거부해 원장 미변경 · 캡 미소모이고, 신규 exit code 없이 exit 2 + `SANTA_SINGLE_PASS_ACTIVE`로 구분한다(12는 `cap_reached` 전용).
- **UI5 관측 표면** — `.claude/state/plan-review/dispatch-log-<slug>.jsonl`(순수 append-only, purge 대상 아님)에 L2 발화마다 한 줄이 쌓이고 `review-single-pass.js assert-single-round`가 "현재 plan hash 항목 1건 ∧ `round_index` 0 ∧ `halt_stage` null"을 단언한다. `halt_stage`는 마지막 실행 상태만 담아 재발화를 구분하지 못하므로 로그가 그 구분을 준다. 진입 purge를 두면 재발화가 자기 흔적을 지워 측정이 fail-open이 되므로 두지 않았다.
- **강제 등급의 정직한 천장** — 기계화된 것은 캡 계산과 그 test, `pr.md`가 codex-runner 자식에 export하는 **고정된** 캡, receipt 봉인, 그리고 세 명령 본문이 리터럴이 아니라 공유 오라클을 읽는지의 정적 test 넷이다. 마지막 것이 막는 것은 **배선 누락**(PRD Risk 5)이지 LLM이 산문을 어기는 경우가 아니다. L2 비용은 여전히 1회분 발생하고, 미흡수 지적의 backlog 자동 회수는 M2 소유다.

## [1.28.0] — 2026-08-18

> **§3.7 forward-only 점검 (12번째 재발, 이번엔 상향 불필요)**: 이 항목을 쓰는 사이 main이
> `1.27.2`를 발행했다. minor bump가 준 여유 덕에 `1.28.0`이 여전히 main 최대치보다 앞서므로
> 번호를 밀지 않았다 — 상향이 필요 없었던 첫 사례다. 병합 후 CHANGELOG는 `1.28.0` → `1.27.2`
> → `1.27.1` 순으로 내림차순을 유지한다. 그럼에도 `/mccp:pr` 직전에 **다시** 재계산한다
> (§3.7이 요구하는 두 시점 중 두 번째).

**santa-adjudication M3 — patch-chasing terminator + 캡 정책 (PRD 3 milestone 전부 완료 → minor bump, 1.27.2 → 1.28.0)** — santa-loop은 스스로 끝나지 않았다. 라운드 N의 수정이 라운드 N+1의 1급 표적이 되는 구조라, #124의 6라운드 실측에서 **라운드 4~6은 전부 직전 라운드가 넣은 코드**를 겨눴고 원 산출물의 불변식은 라운드 3에서 이미 전부 강제된 뒤였다. M1이 severity 축을, M2가 판정 원장을 놓았으므로 남은 축은 루프가 스스로 끝나는 조건 하나다. M3은 라운드 2 이후(0-based index ≥ 1) 살아남은 blocking이 **전부** 직전 라운드의 패치를 겨눌 때 종료하고, 그 사유를 원장과 receipt 양쪽에 봉인한다.

**종료의 소재는 마커 하나다 — 두 번째 채널을 만들지 않았다.** P0는 이미 "루프가 왜 끝났는가"를 담는 자리를 갖고 있었다(`beginRound`가 캡 거부 시점에 쓰는 `{reason, at, rounds}`). `patch_chasing`은 **같은 마커에 다른 reason으로** 들어가며 결속 규칙·멱등 규칙·라운드 개설 시 삭제 규칙을 전부 상속한다. 종료가 두 곳에 살면 소비자(`seal`·리포트·receipt·`status`)마다 어느 쪽을 볼지 골라야 하고 고르는 순간 갈린다. `exit_reason`은 이제 정확히 3값이다 — 부재(자연 수렴 또는 진행 중) · `cap_reached` · `patch_chasing` — 이고 앞 둘의 배타는 발화 조건의 `capAllowsAnotherRound` 항이 유지한다(캡이 이미 끝낼 run을 terminator가 주장하지 않는다). 따라서 PRD의 "자연 종료 비율"은 `cap_reached` 대 나머지로 읽힌다.

**대상 판정은 리뷰어의 자기 선언이 아니라 집계 단계의 파일·라인 대조다.** 리뷰어가 선택 필드 `locations`를 채우면 집계 단계가 그것을 `git show --unified=0 <직전 패치 rev>`의 hunk 범위와 대조해 `round_n_patch` / `preexisting` / `unknown` 셋 중 하나를 **계산**한다. 입력(`locations`)과 계산 결과(`targets`)를 이름부터 가르는 것이 요점이고, 대조할 수 없는 항목은 전부 `unknown` → 미발화 쪽으로 떨어진다. **직전 패치의 앵커는 추측하지 않고 호출자가 준다** — 커맨드 본문 Step 5가 자기 라운드로 `round-$ROUND-fix-rev.txt`를 쓰고 Step 4.5가 `round-$((ROUND-1))`을 읽으며, 경로에 decision slug가 들어가 병렬 루프의 교차오염을 구조적으로 막는다. 라운드 0에서는 플래그를 **아예 넘기지 않는다**(빈 문자열도 아니다) — 빈 문자열은 같은 미발화로 가더라도 사유가 "불량 rev"로 잘못 기록돼 "정상 미발화 vs 입력 이상"의 구분이 무너진다.

**이 분류가 완벽하지 않다는 것을 지표로 관측하되 임계로 덮지 않는다.** 직전 라운드가 손댄 파일에서 리뷰어가 **처음으로** 발견한 실재 결함은 `round_n_patch`로 분류된다 — patch-chasing의 정의와 겹치기 때문이고, PRD Risks 행이 Medium/High로 사전 등재한 오분류다. 특히 `locations`에 `line`이 없으면 파일 단위 일치만으로 성립하는데, 라인을 **요구**하면 대부분의 지적이 `unknown`이 되어 terminator가 사실상 죽으므로 그 반전은 채택하지 않았다(implement 게이트에서 Codex가 같은 축을 HIGH로 지적했고, 기전은 정확하나 처방은 근거를 붙여 기각했다 — 대신 그가 함께 권고한 end-to-end negative test를 받았다). 남는 방어는 셋이다: **전량 조건**(하나라도 다른 파일을 겨누면 미발화) · 미해결 항목의 터미널·리포트 열거 · `off` 재개. 오발화의 대가가 승인이 아니라 **한 라운드 이른 종료 + 사람이 읽는 목록**이라는 점이 이 선택의 근거다 — santa verdict는 게이트 승인이 아니다(PRD UI3).

**읽기와 쓰기가 같은 상수에서 파생된다 — 절반짜리 변경은 배송 불가였다.** 종료 사유 열거를 쓰기 쪽만 넓히면 마커 직후의 첫 `read()`가 `SANTA_LEDGER_CORRUPT`로 던져 원장이 통째로 안 읽힌다. `assertTerminationMarker`와 신규 `ledger.terminate`가 `TERMINATION_REASONS` 하나를 공유하고, 그 상수는 `counter.REASONS.CAP_REACHED` + `terminator.EXIT_REASON.PATCH_CHASING`의 합이다. 같은 축으로 `seal.js#buildProof`의 `capReached` 술어를 종료 일반으로 일반화했다 — 하지 않으면 `patch_chasing` 종료가 `layers.l1='converged'`로 봉인돼 **receipt가 승인하지 않은 게이트의 승인을 주장**한다. 세 파일(ledger·seal·schema)의 정합은 산문 약속이 아니라 Validation의 정적 검사가 잰다.

**판정과 봉인 사이가 원자적이지 않았다 — PR 게이트가 잡았고 그 자리에서 닫았다.** `check-termination`은 lock 없이 읽어 판정한 뒤 별도 호출로 마커를 쓰는데, `terminate`가 평가된 라운드를 인자로 받지 않아 lock 안에서 *그 시점의* `rounds.length`에 결속했다. 그 사이 다른 프로세스가 `begin-round`로 라운드를 열면 종료가 **평가된 적 없는** 라운드에 봉인되고 이후 라운드 개설이 그 마커에 막힌다 — 사유가 거짓이 되고 미평가 작업이 잘린다. 이제 호출자가 판정 좌표(`expectedRounds`·`expectedRound`)를 **필수로** 넘기고 `terminate`가 lock 안에서 재확인해, 어긋나면 쓰지 않고 stdout도 종료를 주장하지 않는다(`reason='stale-decision'`). 기본값을 두지 않은 것이 요점이다 — 두면 옛 호출자가 조용히 옛(취약) 경로를 탄다. 같은 축으로 `lastFinalRound`를 `ledger.js`로 올려 좌표 검증과 판정 대상 선택이 한 술어를 보게 했다. 커버리지 89 신설. 같은 게이트의 두 번째 라운드는 **절단된 증거**를 잡았다: `normalizeLocations`가 상한 20에서 순회를 멈추므로 잘려 나간 뒤쪽의 patch 밖 location이 보이지 않게 되고, 오차의 방향이 발화 쪽 한 방향이라 전량 조건이 막아야 할 것을 통과시켰다. 판정 층이 상한 초과를 `unknown`으로 읽는다(정규화는 무변경 — 항목 63의 경계 유지). 커버리지 90 신설.

**판정은 한 oracle, 배선은 두 지점.** 판정은 순수 모듈 `terminator.js`(디스크·git·시각을 모르고 env는 파서 1종만 읽는다), I/O는 `cli.js`, 배선은 `check-termination`(Step 4.5)과 `begin-round` 선검사 둘뿐이다. 후자는 마커 **조회**라 git이 필요 없다. `MCCP_SANTA_TERMINATOR=off`는 그 두 자리를 함께 끄고 이미 결속된 마커를 지나 라운드를 열어 준다(재개 경로) — 셋째 판정 자리가 생기지 않도록 커맨드 본문이 env **값을 해석하는 것**을 Validation이 정적으로 금지한다(이름 언급은 허용). `begin-round`의 거부는 `ledger.beginRound` **이전**이라 **캡이 소모되지 않는다**.

**PRD의 캡 이름·범위 불일치를 닫았다 — 코드가 정본이다.** `MCCP_SANTA_ROUND_CAP`(1~10, default 3)을 유지하고 PRD 문언 `MCCP_SANTA_MAX_ROUNDS`(1~5)를 폐기했다. 코드 변경은 0이고 근거는 셋이다: (1) 이름을 바꾸면 기존 `settings.json`이 조용히 무시된 채 default 3으로 fail-open하고 그 사고는 로그에 **아무것도 남기지 않는다**, (2) 범위를 좁히면 6~10을 쓰던 설정이 캡이 **낮아지는** 방향으로 무효화돼 진행 중인 루프가 즉시 종료된다, (3) 넓은 상한의 비용이 M3에서 사라진다 — 캡은 이제 안전망이고 1차 종료 조건은 terminator이며 상한 도달은 `exit_reason='cap_reached'`로 관측된다.

env 1종 추가: `MCCP_SANTA_TERMINATOR`(default `enforce`). **이 축은 default가 덜 엄격한 쪽**이라는 점이 M1·M2의 두 토글과 다르다 — `off`가 라운드를 더 돌리므로 리뷰를 더 받는다. 그럼에도 `enforce`가 default인 것은 M3이 닫는 결함이 "루프가 끝나지 않는다"이고 오타가 그 결함을 되살리면 안 되기 때문이다. 커버리지 61~87(27 항목) 신규 + implement 게이트 흡수분 88 · 전량 green.
## [1.27.2] — 2026-08-17

**multi-session-work-loop M6 — 진행 상태 기계 판정 (B1) (PRD 8 milestone 중 1 → patch bump, 1.27.1 → 1.27.2)** — `computeB1`은 M2 이래 `insufficient('independent evidence source unavailable')` 상수를 반환해 왔고, 그래서 이 PRD는 **자기 자신의 status drift를 보지 못했다**(M2 행이 `complete`인데 지표 산출은 0건이었고 사람이 손으로 찾아야 했다). M6은 문서 status와 **문서에서 파생되지 않은** 증거를 대조하는 판정 오라클을 배송해 B1을 `computed`로 뒤집고, 대시보드와 `/mccp:archive-complete`가 **같은 오라클**을 공유하게 만든다. 실측 전환: `insufficient` → `computed` **drift 1건 / 분모 39** (원시 41 · 비정규 2 분모 제외 · 증거 미확정 30 · 실제 대조 9행).

> **§3.7 forward-only 상향 — 이 항목 하나에서 두 번 일어났다 (11번째 · 12번째 재발)**: 1차는 착수 시점이다. plan은 `1.23.11`을 지정했으나 그때 main이 이미 `1.26.2`였고(브랜치가 102 커밋 뒤처져 있었다) 발행된 번호는 불가침이므로 `1.26.3`으로 상향했다 — 그 편차는 plan Risks 표가 사전 승인한 항목이다. 2차는 PR 시점이다. closure가 기록한 관측치는 main `1.27.0`이었으나 `/mccp:pr` 진입 시 재확인하니 `1.27.1`까지 가 있어(PR #142 이후 한 칸 더) `1.27.2`로 다시 상향했다. **1.26.3은 main의 어느 번호와도 중복되지 않았으므로 이 2차 상향은 중복 회피가 아니다** — `claude plugin update`가 캐시 디렉토리를 version으로 결정하는 이상, 이미 `1.27.1`이 설치된 환경에 `1.26.3` manifest를 내보내면 업데이트가 다운그레이드/no-op이 되어 §3.7이 막으려는 바로 그 실패가 난다. 그래서 규칙은 "중복 금지"가 아니라 **"발행분보다 위"** 로 읽어야 한다. 브랜치명(`v1.24.0-…`)과 version이 어긋나는 것도 같은 계열이며 §3.7이 규칙(단일 milestone = patch)이므로 규칙을 따랐다.

**문서를 증거의 투영으로 만들어 닫지 않는다 — 그것이 이 milestone의 유일한 설계 결정이다.** status를 자동으로 증거에 맞춰 써 넣으면 두 소스가 의존 관계가 되어 drift가 구조적으로 0이 되고, 계약의 무결성 검사(`동일 소스 파생이면 그 주기의 B1은 무효`)에 의해 지표 자체가 무효가 된다. 0이 된 숫자는 개선이 아니라 측정의 파괴다. M6이 만드는 것은 판정과 가시화이며 교정은 사람이 승인하는 기존 명령에 남는다.

**독립성의 1차 통제는 lint가 아니라 타입 경계다.** 오라클(`b1-status-drift.js`)은 문서 status를 **받지 않고** 자체 I/O도 **하지 않는다** — receipt 판독·git 조회는 전부 주입된 5필드 `evidence` 객체로만 들어온다. 그래서 "몰래 PRD를 다시 읽는" 구현이 애초에 존재할 수 없다. 정적 lint 4축은 그 경계를 지키는 **2차** 통제이고, 간접 의존(별칭 require·동적 require·이름 바꾼 status 전달)은 잡지 못한다 — 이 순서를 뒤집어 읽으면 없는 보증을 믿게 되므로 설계 문서 비보증 절에 명시했다.

**오라클은 주입값의 출처를 볼 수 없으므로 생산자를 하나로 만들었다.** `fs.existsSync`도 `git cat-file`도 똑같이 boolean 하나를 낸다. 런타임 검증이 원리상 불가능하므로 증거 구성 I/O를 `b1-evidence-builder.js` 단일 모듈로 뽑고, derive source와 `archive-complete/scan.js`가 **둘 다 그것만** 호출한다. lint 축 (iv)가 `receiptPresent`의 생성이 builder 밖 0건임을, 그리고 builder가 `cat-file`을 **쓰고** `existsSync`/`ls-files`를 **쓰지 않음**을 정적으로 고정한다. test는 출력을, lint는 수단을 본다.

**`shipped`는 "PR이 났는가"이지 "Codex가 승인했는가"가 아니다.** mccp는 audited override로 divergent인 채 ship하는 경로를 정식으로 가지며 직전 M5가 그 경로로 ship됐다. `codex_verdict`를 ship 전제로 걸면 정상 ship이 drift로 오계상되므로 판정식에서 빼고 병기 필드로 강등했다. ship의 기계적 증거는 receipt의 **존재 그 자체**다 — terminal `/mccp:pr`의 ship gate가 no-ship 시 finalize `exit 12`로 receipt를 쓰지 않기 때문이다.

**`receiptPresent`는 커밋 도달성이다.** `git ls-files --error-unmatch`는 index를 보므로 `git add`만 한 파일에도 exit 0을 낸다(실측 확인). staged-only receipt는 worktree 삭제와 함께 사라져 §3.12의 내구성 계약을 만족하지 못하므로 `git cat-file -e HEAD:<path>`만 쓴다. `HEAD`를 쓰는 이유는 묻는 것이 *"증거가 내구적인가"*이지 *"머지됐는가"*가 아니기 때문이고, plan 파일 도달성이 default-ref를 쓰는 것은 **질문이 다르기** 때문이다.

### Added

- `plugins/mccp/scripts/lib/msw-metrics/b1-status-drift.js` — 순수 판정 오라클. `adjudicateMilestone` · `decisionFromBasename` · `isDrift`. verdict 3종(`shipped`/`not-shipped`/`undetermined`)이고 **부재를 판정으로 바꾸지 않는다**(`evidence-audit.js` E1의 동형).
- `plugins/mccp/scripts/lib/msw-metrics/b1-evidence-builder.js` — 증거 구성의 **유일한 I/O 지점**. `fs`를 require하지 않아 워킹트리 상태가 판정에 새어들 수 없다. default-ref는 `origin/HEAD` → `origin/main` → **조회 실패**이며 로컬 `HEAD`로 폴백하지 않는다(폴백하면 미머지 브랜치가 default branch로 오판돼 `not-shipped` 방향 drift가 통째로 증발한다).
- `plugins/mccp/scripts/lib/msw-metrics/b1-independence-lint.js` — 독립성 정적 lint 4축 + CLI. 주석은 스캔하지 않는다(금지 패턴을 *설명하는* 주석에 걸리면 lint가 문서화를 벌한다).
- `plugins/mccp/scripts/derive/sources/milestone-evidence.js` — 활성 PRD 행 열거 + 분모 규약 + 행별 판정 전수(`adjudications`). `derive/index.js`에 `milestone_evidence`로 등록.
- `plugins/mccp/scripts/lib/msw-metrics/assertion-manifest-check.js` + `docs/multi-session-work-loop/m6-assertion-manifest.json` — 단언 ↔ test 기계 대조. `REQUIRED_IDS` **28종**(초판 21 + local review 흡수 7)을 대조기에 하드코딩해 "manifest에서 id를 빼면 통과"를 막고, `missing-from-manifest`와 `absent-in-tests`를 서로 다른 실패로 열거한다. 실재 판정은 **`test()` 호출 앵커** 기준이다. 대조기 자신도 test된다(`echo ok && exit 0`짜리 대조기가 나머지 전부를 무력화하는 것이 이 축의 급소다).
- `docs/multi-session-work-loop/status-adjudication-design.md` — 보증 G1~G4 · 위협 모델 · **비보증 13항**.
- `docs/multi-session-work-loop/m6-before.json` · `m6-after.json` · `m6-audit-sample.json` — 전환 전후 스냅샷(동일 스키마·동일 앵커)과 UI14 감사 표본.
- 신규 회귀 test 56건 — `b1-status-drift.test.js`(8) · `b1-independence-lint.test.js`(10) · `milestone-evidence.test.js`(13) · `assertion-manifest-check.test.js`(8) + `scan.test.js`(9)·`msw-metrics.test.js`(5)·`msw-metrics-render.test.js`(3) 증분.

### Changed

- `computeB1` — 상수 `insufficient` 반환을 source 소비로 교체. 사다리는 `computeA4` 미러(무결성 위반을 producer 부재보다 **먼저** 판정): `degraded || !independence_ok` → `invalid` · `denominator === 0` → `insufficient` · 그 외 → `computed`. **`value`는 언제나 `null`이고 `numerator`에 건수가 실린다**(UI4 — 비율을 넣으면 분모가 큰 저장소에서 drift가 작아 보이는 왜곡이 생긴다).
- `renderer/sections/msw-metrics.js` — B1을 `1건 (대조 9/39)` 형태로 렌더한다. 맨 `0건`은 "drift 없음"으로 읽히지만 실제로는 "대조한 범위에서 0건"이라 커버리지 단서가 값 옆에 붙는다. drift 상세는 **기존** 공유 collapse 안의 `<p class="muted">` 한 줄이며 **새 collapse를 열지 않는다** — B1은 `computed ∧ numerator===0`일 때 `extraRows`로 밀리므로 그 안에서 또 collapse를 열면 2단 중첩 disclosure가 된다. 상위 3건 + `(+N건)` 절삭 병기(절삭은 항상 보인다). milestone 이름의 볼드 마커 누출은 `renderProseHtml`(H10+H16)이 닫는다.
- `archive-complete/scan.js` — `collectDriftEvidence`의 **판정 축**을 공유 오라클로 교체. ledger는 판정에서 내려오고 `ledger(ref only):` 참고 인용으로만 병기된다(UI3). 오라클 실패는 **fail-closed** — 이전 `catch`는 `driftSuspect:false`를 돌려 예외가 "drift 없음"으로 읽혔고, 이제 `undetermined` + `warnings` → `degraded:true`가 된다. `isArchivable`(C2·C3·C4)과 `classifyMilestones`는 **무변경**이다.
- `docs/multi-session-work-loop/measurement-instrumentation.md` — B1 행을 producer 명시 + 전환 조건으로 갱신.

### Fixed

- **Plan 셀이 `.plan.md`가 아닌 행이 `not-shipped`로 오계상되던 결함** (구현 중 실측 발견, 위양성 3건). `plan-body.js#extractPlanPath`는 렌더러용이라 `.plan.md` 링크를 못 찾으면 *괄호 안 아무 것이나* 돌려준다(`:85-86`). `review-loop-trust.prd.md`의 세 행이 자식 **PRD** 링크(`archived/santa-loop-materialize.prd.md`)를 물고 들어와 있지도 않은 receipt를 조회한 뒤 drift로 잡혔다. join key 가드(`.plan.md` 접미사 ∧ repo-root 앵커)를 추가해 확정 불가를 `undetermined`로 둔다 — 확정 불가를 판정으로 접는 것이 E1 위반이다.
- **plan이 아카이브로 이동하면 `not-shipped`로 오계상되던 결함**. 정확 경로 조회가 빗나가면 basename으로 한 번 더 본다 — 아카이브 chore(§3.11)가 지나간 모든 milestone이 drift로 잡히는 것은 측정하려는 drift가 아니라 링크의 낡음이다.
- **PRD 기준 상대 링크를 거부해 커버리지를 조용히 깎던 결함** (위 join key 가드의 과잉 교정). 이 repo의 PRD는 두 관례를 섞어 쓴다 — 백틱 셀은 repo-root 기준이고 마크다운 링크는 **PRD 파일 기준 상대**(`../plans/x.plan.md`)다. `..`를 무조건 거부하니 5행이 대조에서 빠졌고 **하필 `multi-session-work-loop` PRD 자신의 milestone들**이 그 대상이었다(B1이 존재하는 이유가 정확히 그 PRD의 자기 drift를 보는 것이라 가장 나쁜 자리다). PRD 디렉토리 기준으로 정규화한 뒤 `.claude/` 앵커를 재검사한다. **대조 6행 → 9행**, drift는 1건 그대로.

#### local review 흡수 (HIGH 2 · MEDIUM 3 · LOW 1)

- **오라클을 공유해도 *입력*을 공유하지 않으면 두 표면은 같은 질문에 다른 답을 낸다** (HIGH). 초판은 판정 오라클과 증거 builder만 공유하고 join key 정규화는 derive source 안에만 두었다. `archive-complete/scan.js`는 `classifyMilestones`의 원문 plan 셀을 그대로 넘겨, 실측으로 **같은 39행 중 5행에서 판정이 갈렸다** — 자식 PRD 링크를 문 4행이 여기서 `not-shipped`로 확정됐고(derive는 `undetermined`), 상대 경로 1행은 `../plans/…`가 그대로 git pathspec이 되어 조회가 깨졌다. `resolvePlanReference`를 builder로 올려 단일 소유로 만들고, 그 위에 **builder 백스톱**(미정규 입력은 git 조회 전 `readError` → `undetermined`)을 두었다. 호출자가 규율을 잊어도 *적극적 오판*은 구조적으로 나올 수 없다 — 규율은 기계 장치가 아니다. **실측 divergence 5건 → 0건**(비교 25행).
- **`duplicateKey: false` 하드코딩으로 충돌 검출이 이 경로에서만 무력했다** (MEDIUM). derive source는 활성 PRD 전체를 가로질러 중복 `decision_id`를 검출해 충돌 행 **전부**를 강등하는데, `scan.js`는 상수 `false`를 넘겨 같은 receipt를 가리키는 두 행에 모두 `shipped`를 냈다. "첫 행/마지막 행 채택 금지" 규칙이 우회되던 자리다. 전역 2-pass 검출로 교체.
- **git 배관을 행마다 재구축하던 성능 회귀** (MEDIUM). `resolveDefaultRef`(rev-parse)와 `buildPlanIndex`(전체 `ls-tree`)가 행마다 재실행돼 `scan()`이 **862ms → 3,201ms**로 3.7배 느려졌다. builder는 처음부터 두 값을 주입받는 seam을 갖고 있었고 derive source는 그것을 쓰고 있었다 — 이 호출자만 쓰지 않았다. 스캔당 1회로 hoist하되 **lazy**라 판정할 행이 없으면 git을 아예 부르지 않는다. **481ms**(기준선보다도 빠르다 — 행별 `git log` 약증거 조회가 함께 줄었다).
- **단언 대조기를 주석 한 줄로 우회할 수 있었다** (MEDIUM). `body.indexOf(title)`는 파일 어디든 그 문자열이 있으면 통과이므로 **주석만으로 필수 단언 전부를 "존재"** 하게 만들 수 있었다 — 이 모듈 서문이 지목한 급소가 한 층 아래에 남아 있던 셈이다. `test()`/`it()` 호출 앵커로 교체했다. 여전히 *그 test가 무엇을 단언하는지*는 보지 않으며 그 한계는 비보증 절이 소유한다.
- **lint의 주석 제거기가 정규식 리터럴에 눈멀 수 있었다** (LOW). 초판은 정규식을 추적하지 않으면서 "대상 4파일에 `//`·`/*`를 담은 정규식이 없다"는 관측에 기댔는데, 그것은 대상 파일이 바뀌면 **조용히 깨지는** 전제다 — 오라클에 `/https?:\/\//` 하나만 추가되면 그 줄부터가 주석으로 접혀 축 (ii)·(iii)가 통째로 눈이 먼다. **감사자가 눈머는 실패는 통과처럼 보인다.** 직전 토큰 휴리스틱으로 정규식을 추적하되 애매한 자리는 나눗셈으로 접는다(보수적 방향).
- **`.claude/reviews/plan-review-multi-session-work-loop.md`가 덮어써져 M5 round-9 기록이 소실됐다** (HIGH). 9라운드 추이표·운영자 종료 결정(2026-08-12)·round-8 findings 전문을 담은 169줄이 M6 판본 53줄로 대체됐다. `-m5.md`는 **다른 초기 런**이라 대체본이 아니다. 복원했고 M6 리뷰는 `-m6.md`에 둔다 — 그쪽이 `m6-audit-sample.json`의 `plan_file_hash` 앵커와 일치하는 정본이다.
- 흡수로 닫힌 축 7개를 단언 매니페스트에 등재했다(`REQUIRED_IDS` 21 → 28). `REQUIRED_IDS`는 하한이지 상한이 아니므로 구현 중 닫힌 축은 게이트가 된다.

## [1.27.1] — 2026-08-17

> **§3.7 forward-only 상향 (11번째 재발)**: 이 항목은 원래 `1.26.3`으로 작성됐으나, 브랜치가 미머지인 사이 main이 `1.27.0`(session-process-reclaim M1+M2+M3 — PRD 전 milestone 완료이므로 minor)을 발행해 브랜치 번호가 main 최대치보다 뒤로 밀렸다. 발행된 번호는 불가침이므로 본 항목만 앞으로 밀어 `1.27.1`이 됐다. 두 항목은 서로 다른 축이라 합치지 않았고, 날짜 역전(1.27.1이 08-17, 1.27.0이 08-14)은 version 순서가 정본이므로 그대로 둔다.

**santa-adjudication M2 — 판정 원장 (PRD 3 milestone 중 2 → patch bump, 1.27.0 → 1.27.1)** — santa-loop은 라운드마다 fresh reviewer를 띄우는데, 초기화되는 것이 산출물만이 아니라 **판정 기록**이었다. 운영자가 라운드 N에서 기각한 지적이 라운드 N+1에 그대로 재등장해 다시 blocker로 계수됐고, 실측으로 receipt 149건의 `resolution.rejected` 총합이 **0**이었다 — 기각이 어디에도 남지 않았다. M2는 P0가 만들어 두고 소비자가 0이던 `ledger.entries`에 판정 행 스키마를 채우고, 그 원장을 **집계 단계에만** 주입한다(리뷰어는 fresh 유지 — 주입 지점은 `cli.js#cmdVerdict` 하나이고, 커버리지 47이 Step 3 블록에 원장 토큰이 없음을 절 경계 단위로 단언한다).

**기각 보존율을 지시가 아니라 능력으로 만든다.** "기각을 원장에 적으세요"를 산문으로 두면 M1 이전과 같은 상태이므로, `begin-round`가 `ledger.beginRound` **이전에** coverage를 검사한다 — 마지막 FINAL 라운드의 effective blocking 전건에 그 라운드의 판정 행이 없으면 `SANTA_ADJUDICATION_INCOMPLETE`(exit 2)로 거부하고, 검사가 mutation보다 앞서므로 **캡이 소모되지 않는다**. 탈출구는 env가 아니라 원장 안에 둔다: `skipped` 한 행이면 라운드가 열리되 그 지적은 계속 blocking이라 회피가 공짜가 아니다.

**억제는 `decideAdjudicatedVerdict`의 optional 입력이고 한 항만 좁힌다.** `resolved`가 부재하면 M1의 7키가 값까지 동일하고 반환에 `suppressed`·`niceBySuppression` 둘만 붙는다(커버리지 33이 M1 7키 값 동일성 + 키 집합 9개를 함께 고정한다). 좁아지는 것은 `noBlocking` 하나뿐이라 강화 축 둘(`distinctIds >= 2` · `allPass`)은 어느 값에서도 그대로다. `byReviewer`는 **원시값 그대로** 남는다 — 억제 이후 값으로 바꾸면 강등 비율의 분모가 사라지기 때문이다.

**판정은 다음 라운드부터 효력을 갖는다(`entry.round < N`).** 이 결속이 없으면 M2가 스스로 우회를 만든다: blocking을 `absorbed`로 기록하고 **같은 라운드**의 `verdict`를 다시 부르면 리뷰 없이 NICE에 도달해 seal·push된다. 라운드 자신의 판정은 자기 자신을 지우지 못하며, 부수 효과로 FINAL 라운드의 재계산이 결정적이 되어 `verdict` 재호출이 mutation 없이 같은 JSON을 돌려준다(갈리면 `SANTA_VERDICT_UNSTABLE`).

**`absorbed` 재등장은 억제하되 가장 크게 표면화한다.** 운영자가 "고쳤다"고 기록했는데 수정이 불충분하면 fresh reviewer가 같은 지적을 다시 내고 M2가 그것을 지운다 — 실재 결함이 통과하는 경로다. 부정하지 않고 셋으로 다룬다: `evidence`가 `validateReason(strict)`를 지나고(`"fixed"`는 거부), 재등장이 `absorbed-rereported`로 분류되어 Step 4가 "당신의 수정이 듣지 않았을 수 있다"를 터미널에 찍으며, `reopened` 한 줄로 되돌아간다. **그럼에도 이것을 "안전하다"고 말하지 않는다** — 수정이 실제로 듣는지는 검증하지 않으며 그 검증은 PRD가 비용을 이유로 미결에 둔 축이다.

**issue 동일성은 정규화 claim이고 그 한계를 지표로 관측한다.** `issueIdOf = sha256(normalizeClaim(claim))[0:12]`이며 라운드 *안*의 dedupe와 **같은 함수**를 쓴다(다르면 "한 라운드에서는 같은 지적인데 다음 라운드에서는 다른 지적"이 성립한다). 이 키는 패러프레이즈에 뚫리는데 fuzzy matcher를 발명하지 않는다 — 임계값에 방어할 근거가 없고 잘못 합쳐진 두 지적은 **실재 결함을 지우는** 방향으로 틀린다. 대신 `carryOver`의 `resolvedAbsent`·`newBlocking` 쌍이 그 패턴을 노출하고(식별은 주장하지 않는다), 커버리지 58이 그 실패 모드를 산문의 경고가 아니라 **고정된 기대값**으로 둔다.

**필드가 사라지면 게이트가 꺼지는 대신 막는다.** `issueId`가 유실되면 `resolved.get(undefined)`가 늘 `undefined`라 억제는 어차피 0건이 되지만, 조용히 0건이 되는 것과 명시적으로 거부하는 것은 다르다 — 전자는 정상 동작과 구별되지 않는다. `coverageOf`는 그 행을 `missing`에 담아 `covered:false`를 내고 `decideAdjudicatedVerdict`는 `effective`에 남기며 loud warn한다(커버리지 56이 생산 지점의 build-time 가드, 60이 runtime 가드 — 둘은 대체재가 아니다).

**M1이 이관한 판정 lifecycle 3종도 함께 착지한다** — `record`는 OPEN 라운드에서만 · 같은 `id` 중복 거부 · 라운드 verdict 1회. 앞 둘은 M2에서 위생을 넘어 **coverage 게이트의 전제**가 된다: FINAL 라운드에 리뷰어가 더 붙으면 판정한 blocking 집합과 검사하는 집합이 갈린다. 셋 다 CLI 수준 검사라 **TOCTOU를 주장하지 않으며**(P0 동결 함수에 술어를 lock 안으로 주입할 자리가 없다) 순차 오용을 막는 위생으로만 주장한다.

**P0 파일은 열지 않았다.** `ledger.js`·`seal.js`·`counter.js` 무접촉이고 Validation이 그것을 기계로 대조한다. `receipt` 스키마도 무변경이다 — `meta.santa_entries`는 P0가 이미 present-only 정수로 봉인했고 M2가 하는 일은 그 값을 처음으로 0이 아니게 만드는 것뿐이다. 판정 내역은 gitignored 원장에만 살며, 그래서 **M2가 주장하는 보존은 "한 리뷰 루프 안에서"다**(워크트리를 지우면 판정도 함께 사라진다 — 세션 간 내구성은 backlog).

env 2종 추가: `MCCP_SANTA_ADJUDICATION_GATE`(coverage 선검사, `off`는 덜 엄격) · `MCCP_SANTA_LEDGER_SUPPRESSION`(억제, `off`는 M1 등가로 **더** 엄격하며 대조군 도구이기도 하다). 커버리지 26~60(35 항목) 신규 · 전량 green.
## [1.27.0] — 2026-08-14

**session-process-reclaim M1+M2 — 세션 프로세스 레지스트리 + SessionEnd 회수 (PRD 전 milestone 완료 → minor bump)** — mccp는 자신을 시작한 명령보다 오래 사는 프로세스를 여럿 띄운다(dashboard 서버, detached plan-codex-runner, handoff `claude` 세션). 누가 그것들을 소유하는지 기록하는 곳이 없었고, 그래서 안전하게 거둘 방법도 없었다. M1이 레지스트리를, M2가 SessionEnd 회수를 추가한다.

설계를 지배하는 단일 지표는 PRD의 **오살 0**이다 — 다른 세션·다른 repo·다른 호스트·다른 사용자의 프로세스를 죽이지 않는 것. 그래서 판정은 전부 fail-closed이고, **주장이 아니라 test**다: 주입한 killer가 받은 pid 집합을 기대 집합과 정확히 일치시킨다.

**단, 이것은 목표이지 증명된 절대치가 아니다.** 소유권 축(세션·repo·호스트·reuse·lifetime)은 결정적으로 닫히지만, 프로세스 정체 축에는 유계 잔여가 남는다 — OS가 PID를 재할당했고 ∧ 새 프로세스가 우리 등록 시각의 허용 오차 안에서 시작했고 ∧ 그것이 node로 **같은 절대 스크립트 경로**를 실행 중일 때. 단위 test로 재현할 수 없는 창이므로 "무관한 프로세스가 죽는 경로는 없다"고 주장하지 않는다. 아래 *명시 잔여* 참조.

### Added
- `plugins/mccp/scripts/lib/session-processes.js` — 레지스트리(`register`/`registerFailure`/`list`/`unregister`/`collectSiblingReuse`) + 소유권 판정(`isReclaimableBy`, 13행 표) + 정체 probe(`probeProcess`/`normPath`) + 회수(`reclaimSession`) + SessionStart 고아 스윕(`scanForeignOrphans`). 파일당 1 프로세스 레이아웃이라 read-modify-write도 lock도 없다.
- test 4종 — 레지스트리·판정표 전수·오살 0·소스 스캔 회귀(등록 누락 0 · kill 지점 유일 · 반환값 소비 강제).
- `MCCP_RECLAIM_OUTLIVES` · `MCCP_RECLAIM_BUDGET_MS` · `MCCP_RECLAIM_IDENTITY_TOLERANCE_MS`(상향만) → `docs/ENVIRONMENT.md` §11.

### Changed
- `dashboard-server.js` · `plan-codex-runner.js` — 부팅 자기등록 + 정상 종료 시 unregister. `session-spawner.js` — win32 handoff 자식을 부모가 등록(자식은 자기등록을 못 한다).
- `session-end-marker.js` — 마커·observer **뒤에** 회수. 반환값을 읽어 미완료를 stderr로 표면화하고, `output`은 무변경(UI8).
- `session-start-trace-injector.js` — 종료된 세션의 고아를 보고. live PID는 **세기만** 하고(UI1), 죽은 PID의 레코드 파일만 지운다(PRD `:78` 무한 성장 차단). `.unreclaimed.json`·`.failed.json`은 보존한다 — 처리는 증거 인멸이 아니다.
- `plugins/mccp/.claude-plugin/plugin.json` `1.23.7 → 1.27.0` + renderer footer 2면 동기. PRD 전 milestone(M1+M2) 완료이므로 §3.7 기준 **minor**다. 브랜치는 `1.24.0`을 목표했으나 `origin/main`이 그 번호를 **meta-research-command M1**에 발행한 뒤 `1.25.x`·`1.26.0`(santa-loop-materialize M2)·`1.26.1`(gate-guard-integrity M3)까지 연달아 소비했으므로 forward-only로 계속 밀어 **minor 한 칸 위**인 `1.27.0`에 착지한다 — 이미 발행된 번호는 불가침이고 미머지 브랜치만 민다. 같은 충돌의 **7번째 실측 재발**이며, 이번엔 M3 base 머지 도중에 또 한 칸(1.26.0 → 1.26.1) 밀린 것이 관측됐다(§3.7).

### Fixed
- `dashboard-server.test.js` — `tmpRepo()`가 `os.tmpdir()`의 8.3 단축명(`…\ADMINI~1\…`)을 그대로 써서 `attachWatch`의 `fs.watch`가 libuv assertion(`!_wcsnicmp`, `src/win/fs-event.c`)으로 **test 프로세스 전체를 abort**시키고 있었다. 그 뒤 19개 test가 조용히 실행되지 않고 있었다(선재 결함). realpath 한 줄로 13 → 33 test가 실제로 돈다.

### Security (santa-loop R1 — cross-model 심사에서 발견)
- **레지스트리 루트를 통한 경로 탈출을 봉인했다.** 봉인이 세션 디렉토리를 레지스트리 루트에 대해서만 검사해, 루트 **자체**가 링크면 그 검사가 공허하게 통과했다. `.claude/state/session-processes`를 외부 디렉토리로 미리 만들어 두면 레코드가 repo 밖에 기록됐고 — 실측 재현됐다. win32에서 디렉토리 **junction**은 elevation이 필요 없어서, "symlink는 권한이 필요하다"는 원 코드의 전제가 이 결함을 가려 주고 있었다. 이제 봉인이 repo 경계까지 올라가고, 회수는 탈출한 레지스트리를 만나면 **전량 거부**한다(`complete:false`, kill 0). 파일을 지우는 고아 스윕도 루트와 세션 디렉토리를 각각 재검사한다.
- `MCCP_RECLAIM_BUDGET_MS`를 hook timeout 아래로 **clamp**한다(상한 9000ms, 하향은 자유). 넘기면 sweep이 hook timeout에서 중도 사살되고, 그때 사라지는 것이 부분 sweep의 유일한 증거인 `.unreclaimed.json`이다.
- dashboard **reuse 등록 실패가 조용했다**. reuse 레코드는 소유 세션에게 "다른 세션이 아직 쓰고 있다"고 알리는 유일한 신호이므로, 실패하면 소유자의 `in_use_by_live_session` 가드가 사라지고 `MCCP_RECLAIM_OUTLIVES=1`에서 사용 중인 서버가 SIGTERM된다. 빌리는 쪽에서 복구할 수 없으므로 결과까지 명시해 표면화한다.
- **읽기/삭제 경로가 session 디렉토리를 봉인하지 않았다.** 회수는 레지스트리 루트만 검사했고, 등록 후 `<registry>/<sid>`가 repo 밖 링크로 바뀌면 그 레코드를 근거로 kill하고 repo 밖 파일을 unlink했다 — 실측 재현. 이제 두 층을 함께 검사하며(`containedSessionDir`), 진입 시 1회가 아니라 **매 write/unlink 직전에 재검증**한다(TOCTOU는 좁혔을 뿐 닫지 않았다 — Node 동기 fs에 fd-상대 API가 없다).
- **SessionEnd hook에 새 blocking 실패 모드를 만들었다가 되돌렸다.** `reclaimOwnedProcesses`의 `require`가 `try` 밖에 있어, 회수 스택의 모듈 로드 실패가 `run()` 밖으로 throw됐다 — `async:true / timeout:10`으로 non-blocking을 계약한 hook에서. 기존 test는 전부 `deps.reclaimSession`을 주입해 require를 단락시키므로 구조적으로 못 잡았고, 새 test는 실제 로드를 깨뜨린다.
- **SessionEnd가 env 세션 id를 payload보다 우선했다.** payload의 `session_id`는 Claude Code가 "지금 끝나는 세션"을 지목한 값이고 env는 ambient라 stale하거나 다른 곳에서 상속될 수 있다. 둘이 어긋나면 회수가 **끝나지도 않은 세션**을 대상으로 돌아 그 세션의 프로세스를 죽인다 — 이 설계 전체가 막으려는 오살이다. payload 우선으로 뒤집고, 불일치는 stderr로 명명한다.
- **회수가 env-only 세션 id 게이트 뒤에서 통째로 건너뛰어졌다.** SessionEnd 페이로드에 종료 세션 id가 있는데도 env가 비면 조기 반환해, 그 세션의 프로세스가 영구 등록 상태로 남았다. observer cleanup은 env 키에 묶인 채 두고 회수만 페이로드로 fallback한다.
- **읽을 수 없는 형제 증거가 가드를 지웠다.** `collectSiblingReuse`가 파싱 실패를 건너뛰어, 살아있는 borrower의 reuse 레코드가 손상되면 소유자가 사용 중인 dashboard를 죽이고 `complete:true`로 보고했다. 판정표에 13번째 행 `sibling_evidence_unreadable`을 `in_use_by_live_session` **앞**에 추가했다. 단, 파싱되는 비-reuse 레코드는 `incomplete`로 치지 않는다 — 그러지 않으면 훗날 스키마 bump 한 번에 회수가 통째로 얼어붙는다.

### Security (santa-loop R8 — 두 리뷰어가 독립적으로 R7의 미봉을 다시 잡았다)
- **정체 검증이 `node`라는 **낱말**을 인터프리터의 증거로 받아들이고 있었다.** `isExecutedScript`의 `.some()`은 "script 토큰 앞 어딘가에 node 토큰이 있는가"만 물어서, node를 데이터로 언급만 하는 명령줄이 통과했다 — `grep node <exec_path>` · `echo node <exec_path>`. PID 재할당 ∧ 시작시각이 허용치 안이면 `owned_session_scoped`에 도달해 **무관한 프로세스에 SIGTERM**을 보낸다. 실물 재현: 살아 있는 `cmd.exe`(`cmd /c ping -n 20 127.0.0.1 & rem node <exec_path>`)를 실제 pid로 probe하니 옛 규칙이 MATCH를 냈다. **이 결함은 R7이 이미 알고 있었고, 대응은 고치는 대신 코드에 `KNOWN DEFECT` 주석을 다는 것이었다** — 그러면서 같은 커밋의 security review는 이 축을 `PASS — no mis-kill path found`로 적었다.
- 토큰 규칙으로는 닫히지 않는다. `nohup node <path>`(반드시 매치)와 `grep node <path>`는 **같은 토큰 열**이다. 판별자는 **실행 이미지**뿐이다 — `probeProcess`가 `execImage`를 함께 반환하고(win32 `Win32_Process.ExecutablePath` · Linux `/proc/<pid>/exe` · 그 외 POSIX `ps -o comm=`), `isReclaimableBy`가 **부재 → `identity_unverifiable`**(command line 단독 판정으로 흘러내리지 않는다) · **비-node → `identity_mismatch`**로 가른다. `isExecutedScript`는 토큰 축만 답하도록 분리했다.
- win32 probe 출력을 **`|` 구분 단일 라인**으로 바꿨다. 필드마다 한 줄씩 찍으면 `ExecutablePath`나 `CommandLine`이 빈 경우(access-denied·커널 프로세스에서 실제로 발생) 뒤 필드가 한 줄씩 밀려 **파서가 이미지 자리에서 command line을 읽는다**.
- 회귀 test가 결함을 실제로 잡는지 확인했다 — HEAD(수정 전) worktree에 새 test를 얹으면 `identity 3g`가 `owned_session_scoped`를, `identity 3h`가 fall-through를 드러내며 fail한다. `identity 3i`(실제 launch shape 6종)는 양쪽에서 pass라 오조임이 아니다.

### Security (PR-Codex — ship gate에서 발견, HIGH)
- **신호 전달을 종료로 오인하고 있었다.** `reclaimSession`이 `process.kill(pid,'SIGTERM')`이 반환하자마자 pid를 `reclaimed[]`에 넣고 레코드를 unlink했다. 그 반환은 신호가 **전달**됐다는 뜻일 뿐 프로세스가 죽었다는 뜻이 아니다 — POSIX에서 SIGTERM은 catch·ignore 가능하고 종료가 길어질 수도 있다. 신호를 무시한 프로세스는 (a) 레코드가 지워져 **추적 불가**가 되고 (b) hook은 **회수 성공으로 보고**했다. 즉 이 모듈이 존재하는 이유인 회수·관측 보장이 가장 조용한 방식으로 깨졌다. 주변 코드가 오히려 이것이 실수임을 보여준다 — `EPERM`은 성공으로 접지 않고 `ESRCH`는 따로 처리하는데, 유독 성공 경로만 확인 없이 낙관했다.
- 이제 종료를 **확인한 뒤에만** 보고한다. 신호 후 레코드를 유지한 채 남은 예산 안에서 `isAlive`를 폴링하고, 확인된 경우에만 `dropRecord`한다. 마감 시각까지 살아 있으면 **fresh probe**로 정체를 재검증한다(`probeMemo`는 신호 이전 값이라 의도적으로 우회) — 정체 불일치면 원 프로세스는 사라지고 OS가 pid를 재할당한 것이므로 `pid_recycled`로 **확인된 종료**, 일치하면 `termination_timeout`, 검증 불가면 `termination_unverified`다. 뒤 둘은 레코드를 **보존**한다.
- 정체 비교는 `identityVerdict`로 추출해 kill 판정과 종료 확인이 **같은 규칙**을 쓰게 했다. 사본이 둘이면 갈라질 수 있고, 확인 쪽이 느슨해지면 "OS가 pid를 재활용했다"가 거짓 "확인된 종료"로 둔갑한다 — 이 경로가 막으려는 거짓말과 같은 부류다.
- 죽지 않는 프로세스 하나가 sweep 전체를 굶기지 않도록 레코드당 확인 상한(`TERM_CONFIRM_MAX_MS`, 1000ms)을 두고, 그 위에 sweep 예산이 다시 상한을 건다. probe 예약 규칙(worst case를 감당 못 하면 시작하지 않는다)은 확인 probe에도 그대로 적용된다.
- 회귀 test 5종(`13a`~`13e`). `13a`는 구 코드에서 **반드시 실패한다** — 구 코드는 신호를 무시하는 프로세스를 `reclaimed=[4242]` + 레코드 삭제로 처리했다. 기존 하네스가 이 결함을 구조적으로 못 잡은 이유도 함께 고쳤다: `recorder()`의 `isAlive`가 언제나 `true`였다(= 모든 happy-path 케이스가 사실은 **SIGTERM을 무시하는 프로세스**를 모델링하고 있었다). 이제 signal된 pid는 죽은 것으로 답하고, 무시하는 프로세스는 그것을 의도하는 케이스에서만 나온다.

### Security (PR-Codex R2 — 첫 수정 뒤 재실행에서 두 건이 더 나왔다)
- **reuse 가드에 check-to-kill 경쟁이 있었다 (HIGH).** 형제 sweep은 `isReclaimableBy` 안에서 **정체 probe보다 먼저** 돈다. 그 probe는 win32에서 최대 5초를 태운다. 그 사이에 다른 세션이 dashboard를 빌려 reuse 레코드를 등록하면, **5초 전에 만든 판단**으로 SIGTERM이 나간다 — `MCCP_RECLAIM_OUTLIVES=1`에서 사용 중인 서버가 죽는다. 코드 주석은 sweep이 "immediately before the kill decision … FRESHEST world state"라고 적고 있었는데, 실제로는 kill이 아니라 **probe** 직전이었다. 이제 신호 **직전에** 다시 묻는다(`siblingHoldReason`으로 추출해 판정표와 재검사가 같은 규칙을 쓴다). TOCTOU를 닫지는 않는다 — 그건 공유 lock이라야 한다 — 그러나 5초 구멍은 TOCTOU 잔여가 아니라 실제로 질 수 있는 경주였다. sweep 호출은 후보당 1회 → 2회가 되고, 예산이 그 위에 상한을 건다.
- **검사에 실패해서 남긴 레코드가 '깨끗한 sweep'으로 보고됐다 (MEDIUM).** `identity_unverifiable`·`sibling_evidence_unreadable`은 `skipped[]`에만 들어갔고 `complete`는 `true`로 남았다. 그런데 SessionEnd 소비자는 `complete`/`unreclaimed`/`writeFailures`/`budgetExceeded`만 보므로 **`skipped[]`는 아무도 읽지 않는다** — 살아 있는 detached runner가 남았는데 hook은 성공을 보고했다. 이 레지스트리가 드러내려던 바로 그 degraded 상태가 가장 조용히 숨겨진 것이다. `unverified[]`를 신설해 "확인 실패"만 담고(정책 제외 — 다른 호스트·다른 repo·outlives·handoff — 는 제외한다: 매 세션 울리는 경보는 곧 무시되는 경보다) hook 경고 조건에 넣었다.
- 회귀 test 4종(`14a`~`14d`). `14a`는 probe가 도는 **동안** 빌림이 발생하도록 stub을 짜 실제 창을 재현한다. `11c`는 계약 변경(후보당 sweep 1회 → 2회)을 반영해 갱신했다 — 원래 의도인 "스냅샷 캐싱 금지"는 그대로다(캐싱하면 여전히 1이 나온다).

### 명시 잔여 (주장하지 않는 것)
- §D11의 ms 단위 TOCTOU와 §D15의 유계 오살 창(PID 재할당 ∧ 시작시각 델타 < 허용치 ∧ **이미지의 basename이 `node`/`nodejs`** ∧ command line의 첫 script 토큰이 우리 절대경로)은 **단위 test로 재현할 수 없다**. "무관한 프로세스가 죽는 경로는 없다"고 주장하지 않는다.
- §D15 축 1은 이제 **두 질문**이다: 우리 경로가 첫 script 토큰과 **등가**인가(토큰 축) · 실행 **이미지**가 node 인터프리터인가(이미지 축). `node other.js <path>` · `<path>.bak` 는 토큰 축이, `tail -f <path>` · `grep node <path>` · `echo node <path>` 는 이미지 축이 거부한다. 남은 것은 **상대 경로 기동**이 `identity_mismatch`로 읽히는 것(fail-closed — 회수를 놓칠 뿐이고, mccp의 두 기동 형태는 모두 절대 경로다). 상대 토큰을 재anchor하려면 suffix 매칭을 허용해야 하는데, 그것이 바로 전체경로 규칙이 막으려던 basename 충돌이다. **R2~R7 동안 이 줄은 잔여가 상대 경로 기동 하나뿐이라고 적었으나 그때는 거짓이었다** — 위 R8 항목 참조.
- **실행 이미지를 주지 않는 플랫폼에서는 회수가 통째로 멈춘다.** `identity_unverifiable`이라 오살 방향은 아니지만, 커버리지가 0이 되는 것을 "안전하다"로 덮지 않는다. win32·Linux는 실측했고 macOS는 `etimes` 부재로 이미 probe가 `null`이라 변화 없다. 그 외 POSIX는 `ps -o comm=`에 의존하며 이 저장소에서 검증되지 않았다.
- reuse 레코드 증가는 **부분적으로만** 닫혔다. 소유 세션이 죽었음이 증명된 것(같은 호스트 ∧ 정수 `session_pid` ∧ 그 pid 죽음)은 회수되는데, 이는 `isSiblingLive`가 **이미** "사용 중 아님"으로 읽던 집합과 정확히 같아 어떤 회수 판정도 바뀌지 않기 때문이다. `session_pid`가 null이거나 다른 호스트인 레코드는 **남긴다** — 그것을 지우면 "쓰고 있는지 알 수 없다"가 "아무도 안 쓴다"로 바뀌어 kill을 승인하게 된다. 유계 증가보다 그쪽이 비싸다.
- **`.failed.json` · `.unreclaimed.json`은 영구 보존된다** — 그래서 그 두 종류만 남은 디렉토리는 지워지지 않는다. 감사 표면을 없애는 것이 "다음 SessionStart가 처리한다"를 증거 인멸로 바꾸기 때문에 의도한 선택이고, 따라서 레지스트리는 **실패 건수만큼** 자란다. 무제한 증가를 막았다고 주장하지 않는다.
- **`MCCP_RECLAIM_BUDGET_MS`는 hard wall-clock cap이 아니라 레코드 단위 granularity의 예산이다.** 루프는 각 레코드 직전에 경과를 보고, probe는 worst case를 예약하고, 형제 스윕은 같은 deadline을 물려받아 초과 시 fail-closed로 끊는다. 루프 진입 전 자기 디렉토리 `list()` 1회는 예산 밖이다(크기가 자기 등록 프로세스 수라 실질 상수). 정확한 경계는 `docs/ENVIRONMENT.md` 참조.
- `MCCP_RECLAIM_OUTLIVES=1`에서 **세션 식별자가 없는 borrower는 보호되지 않는다**. reuse 레코드를 쓸 디렉토리를 정할 수 없고, 합성 id로도 우회 불가다 — reuse의 liveness는 `session_pid`가 정하는데 재사용 경로에서 살아있는 주체가 바로 그 식별 불가능한 Claude 세션이기 때문이다. 이는 토글의 의미에 포함된 한계이며 `docs/ENVIRONMENT.md`에 근거까지 적었다. 기본값 0이 오늘의 동작이다.
- 과거·타 세션의 **live** 고아 프로세스는 감지·보고까지만 한다(kill 없음).

롤백: `rm -rf .claude/state/session-processes/` (gitignored·working-tree 전용).

### M3 — 출하 + 잔여 정리 (같은 minor에 포함)

M1+M2는 **구현이 끝났고 출하되지 않았다.** `origin/main`에 `session-processes.js`가 없었고 PR도 0건이었으므로, PRD의 Hypothesis는 main에 없는 코드로는 검증될 수 없었다. M3는 그 출하를 막던 것들을 닫는다.

- **PRD 1차 지표를 처음으로 관측했다.** M1+M2의 검증은 전량 단위 test였는데, 그것들은 주입한 killer가 받은 pid 집합을 대조하므로 *판정 로직*은 증명하지만 *프로세스가 실제로 죽는지*는 증명하지 않는다. 신규 `tests/manual/session-process-reclaim-smoke.js`가 실물 자식을 띄우고 실제 `reclaimSession`을 부른 뒤 `isPidAlive(pid) === false`를 bounded poll로 확인한다. **표본 1건이며 비율로 옮겨 적지 않는다.** `tests/manual/` 하위인 것이 곧 CI 상시 suite 미편입 보장이다(글롭 `tests/*.test.js`가 디렉토리 구분자를 넘지 않는다). 하네스 조정 2건이 해석 범위를 좁힌다 — 자식을 `node -e`가 아니라 파일로 띄우고(`-e`는 `__filename`이 `[eval]`이라 §D15 축 1이 인위적으로 어긋난다), `MCCP_RECLAIM_IDENTITY_TOLERANCE_MS`를 상향했다. 따라서 이 관측은 **기본 허용치에서의 정체 판정 정확도를 말하지 않는다**.
- **회수 처리량 천장을 없앴다 — 지표를 재고 나서야 보인 결함.** win32 probe는 `powershell.exe`로 `Get-CimInstance Win32_Process`를 **레코드마다 동기 호출**했고, 유휴 머신에서도 3.2~3.7s가 걸린다(측정). `guardedProbe`는 감당 못 할 probe를 시작하지 않으므로(`elapsed > budgetMs − probeTimeoutMs`) 기본값에서 probe 시작 창이 `6000 − 5000 = 1000ms`뿐이었고, **두 번째 레코드부터 굶었다** — 자식 3개 등록 시 1개만 회수하고 2개 누수(`budget_exceeded`), 문서화된 상한 `MCCP_RECLAIM_BUDGET_MS=9000`으로 올려도 2개가 천장이었다. PRD가 겨냥한 대상(dashboard · plan-codex-runner · handoff)은 흔히 2개 이상이므로 Hypothesis가 win32에서 절반만 성립하고 있었던 것이다. **비용이 pid 수가 아니라 호출 횟수에 붙는다**는 측정(1 pid 3.4s · 3 pid 3.9s)에 따라 신규 `probeProcesses`가 sweep당 **1회** 호출로 전 pid를 조회하고 `reclaimSession`이 그것으로 memo를 채운다. 같은 조건 재측정: 3개 → 3개 회수·0 누수, 6개 → 6개 회수·0 누수(4.1s). 대안은 전부 막혀 있었다 — `Get-WmiObject`(3.1s) · DCOM `CimSession`(3.3s) · `wmic`(3.0s)이 모두 같은 자리이고, 유일하게 빠른 `Get-Process`(0.6s)는 Windows PowerShell 5.1에서 CommandLine을 주지 않는데 그것이 §D15 축 1의 재료다. **주입 seam은 보존된다** — `probeProcess`를 주입한 호출자는 배치를 타지 않으므로 기존 stub 계약이 그대로다. §D11 freshness도 무영향이다(배치가 선반입하는 것은 살아 있는 pid에 대해 변하지 않는 정체값이고, liveness·형제 reuse는 여전히 레코드마다 kill 직전에 다시 읽는다).
- **`.claude/state/session-processes/`를 `MCCP_IGNORE_BLOCK`에 canonical로 등재했다.** M1+M2가 이 저장소 `.gitignore`에만 넣고 provisioner 목록에는 넣지 않아, main의 setup-gitignore drift lint가 이번 머지에서 처음 만나 red가 됐다. `REPO_ONLY`가 아닌 이유는 `santa-loop/`와 같다 — 플러그인이 설치된 어느 저장소에서나 자라므로 대상 저장소가 첫 사용에 커밋한다. 그리고 이 레코드는 **살아 있는 PID + 절대 `exec_path`**를 담아, 커밋되면 모든 clone에 stale PID가 배포되고 SessionEnd 회수 경로가 그것을 kill 후보로 평가한다 — 노이즈가 아니라 오살 벡터다.
- **이 코드가 받은 첫 security 심사.** `Task(security-reviewer)` 결과 CRITICAL/HIGH/MEDIUM 0건, LOW 1건(`writePrivate`의 rename 실패 시 tmp 잔존)이고 그 LOW는 코드로 무해함을 확인했다 — 레지스트리를 읽는 세 지점 전부(`list` · `collectSiblingReuse` · `scanForeignOrphans`)가 `.json` 접미사로 필터하는데 tmp는 `.tmp`라 회수 판정에 구조적으로 도달할 수 없다.
- 잔여 정리: 정체 축 7케이스 전부 `identity N` 라벨화(구현 test 이름과 1:1) · `dashboard-server.test.js`의 pid 산술 포트 4줄을 `freePort()`로(그 backlog 행은 2줄이 이미 전환됐다고 적었으나 실측은 4줄 전부 미전환) · `DIR_MODE`/`FILE_MODE`의 owner-only 주장을 "POSIX 한정 · 생성 시에만"으로 좁힘(**동작 무변경**) · backlog에 해소 3건 + 신규 이연 10건 등재.
- **cross-model 심사는 여전히 0회다.** plan-codex는 L2 패널 R1~R14가 전 라운드 divergent로 끝나 `MCCP_SKIP_INTENT_GATE` audited override로 진입했고(verdict `incomplete`를 봉인 — 세탁하지 않으므로 cross-gate dedupe는 fail-closed로 남고 PR-Codex가 반드시 발화한다), implement-codex는 `MCCP_CODEX_DISABLED=1` env 정책으로 `skipped`다. 감사 대조가 가능한 유일한 cross-model 기록은 ship receipt다.


## [1.26.2] — 2026-08-17

**santa-adjudication M1 — severity contract + 게이트 재배선 (PRD 3 milestone 중 1 → patch bump, 1.26.1 → 1.26.2)** — `/mccp:santa-loop`의 verdict 게이트는 리뷰어가 낸 `verdict` 문자열 하나만 읽었다. `critical_issues`가 비어 있어도 `FAIL`이면 NAUGHTY였고, 그래서 문구·네이밍 선호가 blocker와 같은 무게로 라운드를 하나 더 태웠다. M1은 판정 입력을 **병합·중복제거된 blocking 건수**로 바꾸고, blocking의 자격을 `failure_scenario`를 실제로 쓸 수 있는가에 못박는다.

> **§3.7 forward-only 상향 (10번째 재발)**: 이 항목은 원래 `1.26.1`로 작성됐으나, 브랜치가 미머지인 사이 main이 같은 번호를 gate-guard-integrity M3(PR #140, `103a940`)에 발행했다. 발행된 번호는 불가침이므로 본 항목만 한 칸 밀어 `1.26.2`가 됐다. 두 항목은 서로 다른 축이라 합치지 않았고, 날짜 역전(1.26.2가 08-17, 1.26.1이 08-16)은 version 순서가 정본이므로 그대로 둔다.

**완화만 넣으면 게이트가 순수하게 약해지므로 같은 milestone에서 `{A,B}` 완전성을 함께 닫는다.** backlog 2026-08-13 HIGH가 "P1의 1순위"로 이관한 우회다 — `record --id A`를 두 번 넣으면 A envelope 2개가 쌓이고 둘 다 PASS면 NICE가 나왔다. 이제 NICE는 distinct id가 2 이상일 때만이며, 이 규칙은 `MCCP_SANTA_SEVERITY_GATE` 값과 무관하게 항상 적용된다. 같은 규칙이 이미 한 층 위(`seal.js#deriveVerdict`)에 있어 게이트가 NICE를 내고 봉인이 divergent를 내던 **불일치**가 있었고, M1이 두 층을 정합시킨다.

**그리고 같은 클래스의 불일치를 다른 축에 새로 열었다가 같은 사이클에서 닫았다**(code-review H1, HIGH). 완화의 정의가 "리뷰어의 `verdict` 문자열을 보지 않는다"인데 `seal.js`의 `deriveVerdict`·`buildProof`는 FINAL 라운드 리뷰어 **전원 PASS**를 계속 요구했다. 그래서 MEDIUM만 낸 `FAIL`이 있는 라운드 — 이 milestone이 통과시키려고 만든 바로 그 라운드 — 는 게이트에서 NICE를 받고 봉인에서 divergent가 됐다. 실측 결과는 Step 5.5의 `exit 1`(push 차단) · git-tracked receipt의 `divergent` · `fix-task.md`의 `divergent_unresolved` 에스컬레이션이었고, `quorum.passed:false` + `verification_verdict:'converged'`라는 자기모순 proof(`review-verdict.js`가 구조적으로 거부하는 조합)까지 함께 나왔다. 즉 M1의 1순위 경로가 end-to-end로 **도달 불가**였다. 두 절을 제거했다 — "더 엄격한 쪽이 이긴다"는 두 층이 **같은 질문**에 답할 때만 미덕이고, 리뷰어의 verdict 문자열은 이제 어느 층에서도 판정 입력이 아니다. 커버리지 25가 `{A,B}` 축만 대조하고 있었던 것이 이 구멍을 통과시킨 이유이며, 같은 항목이 완화 경로 입력을 함께 받도록 확장됐다.

**계약을 지키지 못한 라운드는 완화를 받지 못한다 — 이것이 이 milestone의 유일한 실질 방어다.** 라운드마다 `contract ∈ {full, partial}`을 파생하고 `full`일 때만 완화한다. 규칙은 **대체가 아니라 누적**이다: `full`의 NICE 조건이 `blocking === 0 ∧ distinct ≥ 2`이고 `partial`·`off`는 거기에 `allPass`가 **더** 붙는다. 대체로 두면 비구조화 finding 하나가 다른 리뷰어의 blocking을 지우는 우회가 생긴다(L2 R5 invariant CRITICAL이 잡은 설계 결함 — 초안은 이 지점에서 틀려 있었다).

**동결 함수는 한 글자도 바뀌지 않았다.** `gate.decideVerdict`의 시그니처·반환 3필드·계약 문언은 그대로이고, 판정은 신규 export `decideAdjudicatedVerdict`가 한다 — 완화 자격을 얻지 못하면 그 함수가 동결 함수에 **위임**한다. `docs/santa-loop/ownership.md`의 갱신은 그래서 변경 기록이 아니라 **추가 기록**이다(§변경 프로토콜 2·4).

### Added

- `gate.decideAdjudicatedVerdict` / `analyzeReviewers` / `classifyFinding` / `parseSeverityGate` — 순수 export 4종. 신규 모듈 0개(소유권 표에 없는 경로를 만들지 않기 위해 `gate.js` 안에 둔다).
- envelope에 `findings[]` 추가 — `{claim, severity, failureScenario, evidence, structured}`. 저장 위치는 **gitignored 원장**(`.claude/state/santa-loop/<slug>.json`)뿐이고 receipt에는 집계 정수 4종만 실린다. receipt schema·`SCHEMA_VERSION` 무변경.
- `MCCP_SANTA_SEVERITY_GATE=enforce|off` (`docs/ENVIRONMENT.md` §11). **`off`가 `enforce`보다 엄격하다** — 끄는 것은 완화 한 축뿐이고 강화 축 둘은 어느 값에서도 살아 있다.
- `cli.js verdict`의 stdout JSON에 `contract`·`blocking`·`mismatches`·`byReviewer` 추가(기존 3필드는 유지 — 교체가 아니다). `santa-loop.md` Step 4가 이 넷을 터미널에 출력한다. `byReviewer`는 강등 이력의 분모(`findings - blocking`)이고, PRD Open Question이 미결로 둔 지표의 두 항이 정확히 이것이다 — `analyzeReviewers`가 이미 세고 있었는데 판정 반환에서 떨어져 배송 경로에 소비자가 없었다(code-review L1).
- 회귀 test 25항목 — `plugins/mccp/scripts/lib/tests/santa-adjudication.test.js`. `[N]` 커버리지 id를 Validation 스크립트가 기계 대조하며, 각 항목에 assert가 하나 이상 있는지까지 검사한다.

### Fixed

- **실질성 하한의 단위를 문자 수에서 표시폭으로** (code-review M1). `validateReason`의 `MIN_LENGTH`(30)는 영어 override 사유용으로 보정된 값이라, 같은 정보량을 한글·CJK로 쓴 시나리오("빈 배열에서 첫 원소를 읽어 크래시한다" = 21자)가 하한 미달로 강등됐다. 방향이 fail-open이라(blocking이 remark가 되고, 완화와 겹치면 CRITICAL을 낸 FAIL 리뷰어가 있는 라운드가 NICE가 된다) 그대로 둘 수 없었다 — 게이트의 엄격도가 리뷰어가 고른 **언어**에 달리는 것은 방어할 근거가 없다. 규칙을 재구현하는 대신 전각 코드포인트를 2로 세어 같은 검증기에 먹인다: 길이 축 하나만 스크립트 중립이 되고 단어 수·1-token 금칙·URL-only·filler는 원본 그대로이며, **순수 ASCII에는 항등**이라 영어 경로의 판정은 한 건도 바뀌지 않는다(항등과 29/30자 경계를 test가 단언한다).
- **강등된 finding의 `severity`가 지워지던 것** (code-review M2). `failureScenario`는 UI7대로 원문 보존인데 `severity`만 `null`이 되어, claim이 상한을 넘긴 CRITICAL이 원장에서 "severity를 안 낸 finding"과 구별되지 않았다. 어휘 안의 값은 보존한다 — `classifyFinding`이 `structured === true`를 함께 요구하므로 무게는 새지 않는다.
- **Step 4가 `verdict`의 비영점 exit에 분기하지 않던 것** (code-review M3). exit 75(원장 lock 경합)면 stdout이 비어 파싱이 전부 throw하고 `$VERDICT`가 빈 문자열이 되는데, 산문의 분기는 NICE/NAUGHTY 둘뿐이라 정의된 동작이 없었다 — 라운드가 FINAL로 전이되지도 않은 상태다. Step 3·5.5와 같은 형태의 분기를 넣고, 그 존재(캡처 → 분기 → 종료가 첫 파싱보다 앞)를 test가 강제한다.
- **병합된 blocking 행이 최초 관측 severity를 유지하던 것** (code-review L2). A가 HIGH, B가 CRITICAL로 같은 지적을 내면 보고서가 HIGH를 보여줬다. 판정은 이 값을 보지 않지만 보고는 본다 — 높은 쪽을 남긴다.
- **`.claude/state/orchestration-runaway.json.debt/`가 gitignore되지 않던 것** (code-review L3). 카운터의 **형제 디렉토리**(`getDebtDir`가 경로에 `.debt`를 덧붙인다)라 `.claude/state/orchestration-runaway.json` 항목도 `*.lock` glob도 닿지 않았고, `git add -A` 한 번이면 세션 로컬 예약 상태가 커밋됐다. canonical block(`gitignore-provision.js`)과 이 저장소 `.gitignore` **양쪽**에 등재했다 — 한쪽만 고치면 drift 게이트가 red다.

### Changed

- `santa-loop.md` Step 3에 구조화 `critical_issues` 스키마와 severity contract를 싣고, Step 4를 blocking 건수 판정으로, Step 5의 "Fix every flagged issue"를 blocking 전건으로 좁혔다. **FAIL-first 문장("Your job is to find problems, not to approve.")은 무변경**이고 회귀 test가 그 문자열을 파일에서 직접 단언한다 — 추가되는 것은 완화 지시가 아니라 **증명 의무**다.
- `gate.js` 머리말의 "env를 모른다"를 "판정 함수는 env를 모르고 파서만 안다"로 좁혔다(`counter.js` 동형).
- `santa-gate.test.js`는 **단언 코드에 diff가 없다.** 리뷰어 1명 PASS가 NICE를 내는 단언은 그대로이며(그 함수가 동결이므로), 바뀐 것은 그것이 "의도된 미봉"이 아니라 "위임 대상 함수의 현행 동작"임을 밝히는 문언뿐이다.
- `santa-loop-cap.test.js` 3항목 — envelope·stdout deepEqual에 신규 필드를 반영하고, `record --id A` 2회 라운드의 기대 verdict를 NICE → NAUGHTY로 갱신했다(그 단언이 "P1이 이 규칙을 넣으면 함께 갱신하라"고 스스로 지시한 자리다). 의존 allowlist에 `../../receipt/lib/force-override-reason` 1줄을 승인 기록으로 추가 — 실질성 규칙을 베껴 적으면 원본이 바뀔 때 두 사본이 갈리고 그 갈림은 어떤 test도 잡지 않는다.

## [1.26.1] — 2026-08-16

**gate-guard-integrity M3 — 잔여 종료 (단일 milestone → patch bump, 1.26.0 → 1.26.1)** — M1·M2가 ship된 뒤 이 PRD가 저장소에 남긴 잔여물을 실측으로 확인하고 닫는다. 착수 시점 재확인(Task 0)에서 15행 중 **2행이 이미 해소돼 제거**됐고(아래 Observed), 나머지 13행을 처리했다.

### Fixed

- **C6 — `commands/pr.md` 2.5.8의 validate callsite가 리터럴 placeholder였다.** 세 게이팅 callsite 중 `:235`(**Phase 1.6 preflight** — 2.5.7이 아니다. 2.5.7은 finalize-receipt **write** 단계이고 그쪽 `--plan "<plan path or PR title>"`는 receipt subject를 이름 짓는 placeholder로 의도된 것이며 validate callsite가 아니다)와 `:961`(2.5.9 ship-gate)만 실변수를 넘기고, `:899`(2.5.8 chain-check)는 `--plan <plan path>`를 그대로 두고 있었다. 그런데 2.5.9의 주석은 *"2.5.8's code-review chain-check **also passes** `--plan`"* 이라고 **이미 그렇다고 주장**하고 있었다 — 의도를 서술한 문장이 코드로 읽히던 자리다. `CHAIN_PLAN_PATH="${PR_PLAN_PATH:-.claude/plans/${DECISION_SLUG}.plan.md}"`로 2.5.9와 동형화했다. 실패 모드는 정확히 서술한다: 미치환 `<plan path>`는 bad argument가 아니라 bash **SYNTAX ERROR**(`<`가 리다이렉션을 연다)이고, 조용해지는 경로는 본문을 실행하는 LLM이 `--plan` 줄을 통째로 빠뜨릴 때다 — 그때 `validate-cmd.js`가 staleness 전체를 `if (opts.planPath)` 안에 두므로 error도 warning도 없이 skip된다. **그 마지막 경로는 M3이 닫지 않았고** backlog로 이관했다.
- **C2 — `commands/prp-implement.md` Phase 5의 아카이브 지시가 자기 chain을 차단했다.** 무조건 `mv <plan> …/completed/`를 `/mccp:archive-complete` 위임으로 교체하고 세 축의 근거를 본문에 적었다 — (a) §3.11 C2 위반(미완료 PRD의 plan이 어느 스캔에도 안 잡혀 소실) (b) v1.23.5가 복원한 가드 2가 `--plan` 경로 부재를 `stale`로 잡아 **자기 PR을 막는다**(부재 경로 → stale 2건 실측) (c) 목적지 `completed/`는 §3.11·`apply.js`·`milestone-history.js` 어느 스캔도 보지 않는다. 보고 문구 3곳도 정정했고 `CLAUDE.md` §3.11에 아카이브 소유권을 명문화했다.
- **C3 — `receipt/dedupe.js#parsePlanFiles`가 제목과 표 사이 프로즈 1줄에 깨졌다.** 전진 루프를 "공백만 skip"에서 "첫 `|` 시작 줄까지 전진(단 `HEADING_RE`에서 중단)"으로 바꿨다. 표는 여전히 명시적으로 요구되므로 fail-closed는 불변이다. 증상이 조용했던 이유: 파싱 실패는 planned 파일 전량을 residual로 떨어뜨려 cross-gate dedupe가 그냥 발화하지 않게 만든다(안전하지만 최적화가 사라지고 사유가 안 보인다).
- **C1 — 저장소 트리 안 고정경로 test fixture 2곳.** `lib/tests/msw-events.test.js`와 `lib/tests/toggle-snapshot.test.js`의 fixture를 `os.tmpdir()` `mkdtemp`로 옮기고 고정 sessionId도 실행별 고유값으로 바꿨다. `.gitignore`에 `plugins/mccp/scripts/.test-*/` 안전망 추가. 동시 3개 실행 9/9×3 간섭 0, 실행 후 트리 오염 0.

### Added

- **C4 — `lib/suite-determinism.js`가 per-run 실패 이름을 보존한다.** `per_run` 매핑이 `failing`을 떨어뜨려 "어느 실행에서 어느 이름이 갈렸는지"를 사후 조회할 수 없었고, 그것이 OQ5를 진단하지 못한 직접 원인이다. 이름은 이미 수집돼 있었으므로 수집 로직 변경은 없다. 순수 함수 `toPerRun`으로 분리해 판정 불변(`diffRuns` 무변경)을 단위 test로 단언한다 — **진단 정보만 늘고 verdict는 움직이지 않는다.**
- **`validate-callsite-lint`에 값 규칙(rule 2) 추가.** 그 파일 헤더가 *"only flag presence is asserted"* 로 **자기 공백을 명시**하고 있었고 C6이 정확히 그 공백을 통과했다. 신규 규칙은 `basename === 'pr.md'`인 validate callsite에 한해 `--plan` 값이 shell 변수(`"$…`)일 것을 단언한다. 파일 단위 경계가 필수인 이유는 실측됐다 — `commands/plan.md`에 정당한 placeholder callsite가 2곳 있어 전역 적용 시 즉시 red다. 비공허성은 A/B로 확인: 수정 전 `pr.md`에서 rule 1은 통과하고 rule 2만 `pr.md:879`에서 실패한다.

### Changed

- `.claude/prds/gate-guard-integrity.prd.md` — M3 행 추가 · Open Questions 1~3을 M1 plan의 판정 인용과 함께 `[x]`로 정정(재작성이 아니라 인용) · Evidence의 `pr.md:202`·`:856` 행 인용에 각주(원문 보존, 현재 위치 병기).
- `docs/ENVIRONMENT.md` — test-only env 2종(`MCCP_PERF_INJECT_QUADRATIC` · `MCCP_TEST_SESSION_START_PATH`) 등재. 둘 다 **비공허성 증명용 주입 통로**이며 production 경로에 분기가 없다.
- `CHANGELOG.md` — `## [1.23.9]`가 `## [1.23.5]` 아래 놓여 있던 것을 `[1.23.10]`과 `[1.23.8]` 사이로 **무손실 이동**(블록 sha256 동일, 총 줄수 유지).
- `.claude/plans/codex-findings-backlog.md` — C5(b2-coverage-gate) 해소 표기 + C2·C3 흡수 표기 + 신규 4행(OQ5 이관 · Task 4 잔여 축 · CHANGELOG 선재 붕괴 · Task 10 post-merge). 기존 98행 전건 보존(소실 0).

### Observed

- **Task 0에서 2행이 이미 해소돼 제거됐다.** (1) **A2**(Stop-loop 상태 파일 커밋) — main의 `fix-task-applied.md`가 `setup-gitignore-m1`(2026-08-14)로 로컬(`multi-session-work-loop-m5`, 2026-08-13)보다 최신이고 `fix-task.md`는 main에서 이미 삭제됐다. 로컬 dirty를 커밋하면 main을 되돌리는 회귀다. (2) **B5**(CLAUDE.md §3.7 "동기 대상 5면") — main의 `:325`가 이미 "4면"으로 정정돼 있고 `renderer/tests/i18n-surface.test.js`가 동기 대상이 아니라 **검증 수단**임을 명시한다.
- **`evidence-audit`는 git 인덱스가 아니라 파일시스템을 읽는다.** plan Task 1은 A1 커밋 후 `unverifiable` 1 감소를 기대했으나 19에서 움직이지 않았다 — untracked 상태에서도 그 ledger 엔트리는 이미 계수되고 있었기 때문이다. 성립하는 두 기준(`state ≠ inconsistent` ∧ `hash_bound === comparable`, 16===16)은 커밋 전후 모두 성립한다. 커밋의 실효는 감사 수치가 아니라 **§3.12 내구성**(worktree 삭제 후에도 대조 성립)이다.
- **CHANGELOG에 M3 표적 밖 선재 붕괴가 3건 더 있다.** `origin/main` 기준 역전 2건(`Unreleased → 1.9.0`, `1.4.0 → 1.4.1`) + `1.9.0` 중복 1건이며 전부 2026-06대 이력이다. `1.9.0` 중복은 단순 이동으로 못 고친다(어느 블록이 실제 1.9.0인지는 당시 이력 판단). backlog로 이관.

### 커밋 전 로컬 리뷰 흡수 (2026-08-16, `/mccp:code-review` Local Review Mode)

M3 구현분에 대해 커밋 전 리뷰를 돌려 HIGH 1 · MEDIUM 3 · LOW 4를 **전건 흡수**했다. 세 건은 M3 자신의 수정이 새로 연 축이다.

- **HIGH — `prp-implement.md`의 C2 대체 지시가 repo-relative 경로를 실행했다.** `node plugins/mccp/scripts/lib/archive-complete/scan.js`는 그 파일의 나머지 node 호출 24건과 달리 mccp 모노레포 내부 경로였다. 이 본문은 **사용자 저장소**에서 도는 명령이라 설치된 전 사용자에게 `Cannot find module`이다. `${CLAUDE_PLUGIN_ROOT}`로 정정.
- **MEDIUM — C3의 "never a pass" 주장이 fence 앞에서 성립하지 않았다.** `## Files to Change` 섹션 안 ``` fence에 예시 표가 있으면 새 전진 루프가 그것을 진짜 표로 채택했다. A/B 실측: 예시 첫 열이 glob이면 `files=['docs/**']`가 나와 실제 diff를 삼키고 `skip_safe=true`가 될 수 있다 — **dual-review 우회**다. 또 `HEADING_RE`(`/^#{1,6}\s+/`)가 fence 안 bash 주석 `# …`에도 걸려 섹션을 비어 있다고 보고했다. 스캔을 fence 인식으로 바꾸고(미종료 fence는 EOF까지 → fail-closed) 회귀 3케이스를 추가했다. 들여쓰기 코드블록은 **의도적으로 제외** — 문단 문맥이 필요하고, 이 섹션의 들여쓴 `|` 줄은 코드 예시보다 들여쓴 실제 표일 가능성이 높다.
- **MEDIUM — C6이 stale 차단을 새로 도달 가능하게 만든 블록이 슬러그를 상속하고 있었다.** fence마다 별도 셸일 수 있어 `DECISION_SLUG`가 비면 `.claude/plans/.plan.md` → 읽기 불가 → `stale` → `ok=false`로 **정상 ship이 막힌다**. 2.5.8·2.5.9 두 블록에서 슬러그를 자체 파생하도록 고쳤다(derive-decision은 (command,args)에 결정적이라 이미 in-scope면 no-op). A/B: HEAD에서는 게이팅 블록 3개 중 **2개가 상속**, 수정 후 0개.
- **MEDIUM — `PR_PLAN_PATH`는 "Phase 2 DISCOVER가 설정한다"고 적혀 있었으나 plugin 전체에 할당이 0건이다.** 실제로는 운영자가 직접 export하는 선택적 override이고, 미설정이 기본이라 결정적 fallback이 유효 경로다. 2.5.8·2.5.9 주석을 실제 동작에 맞게 정정했다(동작 변경 없음 — 거짓 주장만 제거).
- **MEDIUM — 신규 주석 3곳이 Phase 1.6을 "2.5.7 precheck"으로 오기했다.** 하필 2.5.7은 리터럴 placeholder를 가진 곳이라, 주장을 따라간 독자가 반례를 만난다. `pr.md`·lint 헤더·본 CHANGELOG 3곳 정정.
- **LOW ×4** — (a) fixture 회수가 성공 경로에서만 이뤄져 실패 시 `mkdtemp` 디렉토리가 누적됐다(msw-events는 파일 단위 `test.after` 등록, toggle-snapshot은 `try/finally`). (b) `toPerRun`이 배열은 방어하면서 원소는 deref했다 — 진단 투영이 throw하면 진단 자체가 사라지므로 구멍은 "관측 없음"으로 보고한다. (c) rule 2가 값의 **모양**만 본다는 한계가 헤더의 "does NOT check" 목록에 없었다(등재 + rule 3으로 슬러그 축만 기계화). (d) `prp-implement.md` Artifacts 줄이 plan 경로를 `.claude/plans/`로 하드코딩했다 — §3.11상 `.claude/PRPs/plans/`도 활성 소스다.
- **`validate-callsite-lint` rule 3 추가** — `pr.md`에서 게이팅 callsite를 담은 bash 블록은 `DECISION_SLUG`를 **자기 블록에서 파생**해야 한다(주석 처리된 할당은 불인정). 값의 shape만 보는 rule 2가 구조적으로 못 보는 축이고, C6이 그 축을 열었으므로 가드가 함께 간다.

## [1.26.0] — 2026-08-14

**santa-loop-materialize M2 — receipt 편입 + 소유권 표 (PRD 전 milestone 종료 → minor bump, 1.25.2 → 1.26.0)** — M1이 원장에 기록만 하던 라운드·집계를 **receipt에 봉인**한다. 새 produces-only GATE_ID `mccp-santa-review`(phase=`review`)가 신설되고, `/mccp:santa-loop`이 종료할 때 `seal`이 집계 리포트를 렌더해 그것을 subject로 receipt를 쓴다. M1까지 santa-loop은 자기가 무엇을 했는지 receipt chain에 한 줄도 남기지 않았다.

**봉인은 두 종료 경로 모두에서 일어난다.** NICE 경로는 새 Step 5.5(push **이전**)에서, 캡 도달 경로는 `begin-round`가 exit 12로 거부하는 분기 안에서 봉인한다. 후자는 Step 5.5·Step 6에 애초에 도달하지 않으므로, 그 분기를 산문에서 **실행 가능한 bash 블록으로 전환**하고 `exit "$BEGIN_EXIT"`를 마지막 문장으로 못박았다. 75(lock 경합)·2(사용 오류)는 종료가 아니라 실패이므로 봉인하지 않는다.

**dual-review는 우회되지 않는다.** santa receipt는 `resolution.review_source='multi-agent'`를 **schema가 gate_id 기준으로 강제**하고(`codex`·`hybrid`·부재 전부 REJECT), `multi-agent`는 `CROSS_MODEL_SOURCES` 밖이라 `isCrossModelCorroborated`가 언제나 false다 — 즉 santa 승인 두 건으로 `/mccp:pr`의 PR-Codex를 skip시킬 수 없다. 이 gate_id 기준 `resolution` 제약은 이 repo에 처음 생기는 형태이고, 검사가 `if (reviewPresent.length > 0)` 가드 **바깥**에 놓여야 review triple이 통째로 없는 receipt도 거부된다.

**리뷰어 본문은 리포트로 새지 않는다.** `.claude/reviews/`는 git-tracked이므로 `seal`이 먼저 투영해 `raw`(`checks`·`suggestions` 전문)를 경계에서 소거하고, `renderReport`는 그것을 실을 인자를 갖지 않는다. canary 문자열 test가 그 경계를 고정한다.

### Added

- `plugins/mccp/scripts/lib/santa/seal.js` — 집계 → 결정적 리포트 렌더 → review proof 구성 → receipt write. 순수 함수 3(`project`/`renderReport`/`buildProof`) + I/O 1. 원장 mutation 0.
- `mccp-santa-review` GATE_ID + `PHASE_FROM_GATE['mccp-santa-review']='review'`. `ALIAS_MATRIX`는 무변경이라 어떤 command preflight·cross-gate dedupe·PR chain에도 진입하지 않는다.
- `meta.santa_rounds` / `santa_entries` / `santa_cap` / `santa_exit_reason` — 전부 present-only이며 `makeSkeleton` 미등록이라 미행사 receipt의 canonical hash가 무변동이다.
- `santa cli seal` subcommand. 신규 exit code 0개 — 기존 catch-all이 `SANTA_*`를 2로, lock 경합을 75로 매핑한다.
- `docs/santa-loop/ownership.md` — P1·P2·P3 소유 파일 9개(교집합 ∅) + M1 동결 시그니처 + 변경 프로토콜. 공유 표면(`santa-loop.md`·`cli.js`)은 누구에게도 배정하지 않고 조정 대상으로 분리했다.
- 회귀 test 2파일 17항목 — `santa-review-gate.test.js`(1~7) · `santa-seal.test.js`(8~17). test 이름의 `[N]` 규약을 커버리지 감사가 기계 대조한다.

### Changed

- `ledger.js`에 순수 파생 2종 추가(`reviewersFrom` · `aggregateFrom`). 기존 `readReviewers`/`aggregate`가 이들에 **위임**하므로 시그니처·동작 무변경이다. 봉인이 원장을 **한 번만** 읽게 하려는 것 — 라운드별 재읽기는 lock 없는 N+2회 읽기라 그 사이 mutation이 끼면 동시에 존재한 적 없는 상태가 영구 봉인된다(Implement-Codex R1 F1).
- `seal`은 `aggregateFrom`에 `state.cap`을 **명시 전달**한다. `aggregate`의 env 폴백을 타면 라운드를 실제로 게이트한 cap이 아니라 봉인 시점 env가 `santa_cap`에 실려 receipt가 원장을 오기한다.
- 원장 state에 `terminated` 마커 추가(additive, `schema_version` 1 유지). `beginRound`가 거부될 때 `{reason, at, rounds}`로 채워지고, 이미 같은 사유·같은 라운드 수로 종료된 원장은 재기록하지 않는다 — `at`이 호출마다 밀리면 **최초 거부 시각**이라는 감사값이 사라진다. `rounds`는 관측 시점의 라운드 수로, 마커를 **그 상태에 결속**한다.
- `parseState`가 `terminated`도 `rounds`/`entries`와 같은 계층에서 검증한다(`null` 또는 `{reason:'cap_reached', at:<ISO>, rounds:<int>}`). 검증이 없으면 손상된 마커가 receipt write까지 흘러가 `SCHEMA_INVALID`로 터지고, 운영자가 받는 진단이 원장 손상이 아니라 receipt를 가리킨다.

### Fixed

- **마지막 허용 라운드의 수렴이 divergent로 오봉인되고 그대로 push되던 결함**(PR-Codex F1, HIGH). `aggregateFrom`이 `rounds.length >= cap` **산술**로 종료를 되짚었는데, 그 술어는 캡 *도달*(마지막 허용 라운드가 열림)과 다음 `begin-round`의 *거부*를 구분하지 못한다. 그래서 캡을 정확히 채운 라운드가 NICE로 수렴해도 `exitReason='cap_reached'`가 서고 `seal.js`가 이를 무조건 `divergent`로 굳혔다. 이제 `exitReason`은 거부 시점에 기록된 `state.terminated` 마커에서만 나온다 — 마커 부재는 "거부가 관측된 적 없음"이며 그것이 legacy 원장의 정직한 읽기다. 완화로 구멍이 생기지 않는 이유: 진짜 캡 소진은 반드시 non-NICE 최종 라운드로 끝나므로 `deriveVerdict`의 `fin.verdict !== 'NICE'` 절이 이미 잡는다.
- **`santa-loop.md` Step 5.5가 `SEAL_EXIT`만 보고 sealed verdict를 보지 않던 결함**(같은 F1의 세 번째 축). 봉인은 exit 0으로 성공하면서 `divergent`를 기록할 수 있으므로, 종료 코드에만 분기하면 "수렴하지 않았다"고 적힌 receipt 위에서 push가 일어난다. `$SEAL_JSON.verdict != converged`면 `exit 1`로 push를 막는 분기를 추가했고, 그 분기의 존재를 `santa-loop-cap.test.js`가 slice 단위로 강제한다(plan Validation 2c는 `SEAL_EXIT` 분기 **수**만 세므로 이 축을 보지 않는다).
- **거부 마커가 판정을 영구 낙인으로 만들던 결함**(code-review H1, HIGH — F1 교정이 도입한 것을 같은 사이클에서 닫는다). 마커는 "거부가 관측됐다"는 사실인데 판정이 필요로 하는 것은 "루프가 수렴 없이 끝났는가"이고, 둘은 갈린다. ① **이미 수렴해 봉인된 slug에 `/mccp:santa-loop`를 재진입**하면 Step 3의 정상 캡 거부가 마커를 써서, 재봉인이 converged receipt를 divergent로 **덮어썼다**. ② 캡을 상향해(`MCCP_SANTA_ROUND_CAP` 1..10, 문서화된 운영 경로) 루프를 재개하면 그 뒤의 수렴까지 종료로 읽혔다. 셋을 함께 닫았다 — `deriveVerdict`는 마커를 **입력으로 받지 않고**(라운드에서만 판정), `beginRound`는 라운드를 열 때 마커를 **지우며**, `aggregateFrom`은 현재 라운드 수에 **결속된** 마커만 종료로 읽는다. 마커의 몫은 판정이 아니라 "왜 끝났는지"이고 그 투영(`수렴 = 캡이 끝낸 것이 아니다`)은 `seal()`이 한다. 구멍이 생기지 않는 근거는 F1과 같다: 진짜 캡 소진은 반드시 non-NICE 최종 라운드로 끝난다(NICE는 루프의 종료 조건이고, 거부는 항상 FINAL 라운드 뒤에만 온다).
- **거부가 원장의 `cap`을 env 값으로 덮어쓰던 결함**(code-review M1, MEDIUM). 마커 도입으로 거부 분기가 write를 하게 되면서, 다른 세션이 더 낮은 `MCCP_SANTA_ROUND_CAP`으로 진입해 거부만 받아도 원장의 cap이 그 값으로 바뀌고 봉인이 `santa_cap`에 **라운드를 게이트한 적 없는 값**을 실었다 — `seal.js` 머리말이 막는다고 적은 오기 그 자체다. `state.cap` 갱신을 허용 분기로 옮겼다(거부는 항상 라운드 1건 이상 뒤에 오므로 그 시점 cap은 이미 기록돼 있다).
- 회귀 test 8항목 추가 — `[18]`(마지막 허용 라운드 NICE가 converged를 낸다, 옛 산술 파생에서 실패함을 실증) · `[19]`(수렴 후 재진입 거부가 봉인을 강등하지 않는다) · `[20]`(결속되지 않은 마커는 종료로 읽지 않는다) + 종료 마커 5건(거부가 결속된 마커를 기록한다 · 재거부 멱등 · 라운드 재개 시 clear · 거부가 cap을 안 덮는다 · 손상 마커는 원장 계층에서 잡힌다). 기존 `[15]`는 fixture가 거부를 **명시**하도록, `[16]`은 종료가 라운드 수·env 어느 쪽으로도 만들어지지 않음을 단언하도록 갱신했다.
- **M1이 `.gitignore`에 추가한 `.claude/state/santa-loop/`가 canonical drift lint에 미분류로 남아 CI를 red로 만들던 결함**(PR #139 CI 실측). `gitignore-provision.js`의 drift lint는 저장소 `.gitignore`의 모든 항목이 `MCCP_IGNORE_BLOCK`(대상 저장소로 배송되는 정본) 또는 `REPO_ONLY` 중 하나로 분류될 것을 요구하는데 M1이 어느 쪽에도 넣지 않았다. **canonical로 분류했다** — santa 원장은 `/mccp:santa-loop`이 도는 **모든** 설치 저장소에서 decision slug마다 한 파일씩 자라는 per-session 런타임 상태이고(`plan-review/`·`session-ledgers/`와 같은 범주), 원장은 증거가 아니라 라운드 카운터의 작업 상태다(배송된 것은 receipt가 봉인한다). `REPO_ONLY`로 뒀다면 대상 저장소가 첫 사용에서 원장을 커밋하게 된다.
- **pre-push history-leak gate가 자기 자신에 대한 버그 리포트를 유출로 오탐해 정당한 push를 막던 결함.** `history-leak-scan.js`의 `DEFAULT_ALLOWLIST`에 `.claude/plans/codex-findings-backlog.md` 항목을 추가했다. 그 파일의 한 줄이 이 스캐너의 URL-scheme 오탐을 **보고하면서 증거로** 드라이브 문자 경로 클래스와 문제의 매치 문자열을 축자 인용하는데, 스캐너가 그 인용을 잡는다. 탐지기에 대한 버그 리포트는 탐지기가 무엇을 매치하는지 이름을 부를 수 있어야 하며, 이는 바로 위 fixture 항목이 존재하는 이유와 같은 범주다(fixture는 게이트가 잡는다는 것을 증명하려고 리터럴을 embed해야 한다). **marker는 old-repo 이름이 아니라 그 줄에만 있는 인용(`history-leak-scan.js:90`)으로 잡았다** — 이름으로 키를 잡으면 그것을 언급하는 미래의 모든 backlog 줄이 면제되고, 이 파일은 임의의 finding이 누적되는 곳이라 통째로 사각지대가 된다. 그 줄이 재작성되면 면제가 소멸해 게이트가 다시 발화한다(allowlist가 실패해야 할 방향). 회귀 test 1건 — 인용이 있는 줄은 억제되고 인용 없이 같은 이름을 담은 뒷줄은 **여전히 잡힌다**를 함께 단언한다. 오탐 자체(URL scheme)는 이미 lookbehind로 닫혀 있었고(실측: 진짜 `https://…` URL은 매치되지 않는다), 남아 있던 것은 리포트의 인용문뿐이다.
- `plugin.json` · `renderer/html.js` page-foot · `renderer/markdown.js` derived 줄 · 상단 note의 `currently` — `1.26.0` 동기. **버전은 §3.7 forward-only 상향으로 두 항목 모두 올렸고, 그 상향을 두 번 했다**(8·9번째 재발) — 이 브랜치는 M1에 `1.23.8`, M2에 `1.23.9`를 선언했으나 그 사이 main이 `1.23.8`(diverse-agent-review M4)을 발행하고 `1.25.0`까지 나아가 M1을 `1.25.1`, M2를 `1.26.0`으로 밀었다. 그 뒤 PR을 올리기 전에 main이 **같은 `1.25.1`을 diverse-agent-review M6**(PR #138)에 발행해 M1이 다시 중복이 됐고, 발행된 번호는 불가침이므로 미머지 항목인 M1만 한 칸 더 밀어 `1.25.2`가 됐다. M2는 **PRD 전 milestone 종료**라 minor 축이고 `1.26.0`이 여전히 main 최대치(`1.25.1`)보다 앞서므로 무변경이다. 날짜는 작성 시점 그대로 두었다 — version 순서가 정본이다.

## [1.25.2] — 2026-08-13

**santa-loop-materialize M1 — 모듈 골격 + 캡 강제 (단일 milestone → patch bump, 1.25.1 → 1.25.2)** — `/mccp:santa-loop`의 결정 로직을 산문에서 코드로 내린다. 이전까지 이 명령은 **백킹 코드가 0**이었다: 라운드 수는 아무도 세지 않았고 캡("Maximum 3 iterations")은 산문 한 줄이 유일한 근거였다. 이제 라운드는 gitignored 원장에 기록되고 캡은 `begin-round`가 **리뷰어 발화 직전**에 판정해 exit 12로 거부한다.

**판정 규칙의 내용은 바꾸지 않는다**(동작 보존). `gate.js`는 현 산문 표(둘 다 PASS → NICE · 하나라도 FAIL → NAUGHTY)를 1:1로 옮겼고, envelope 0건 → NAUGHTY 경로도 CLI 경유로 **도달 가능한 채** 남겼다. severity 축·종료 조건·판정 lifecycle은 전부 P1 소유다.

**강제 등급을 정직하게 적는다.** 캡은 지시가 아니라 **기록 경계**에서 구속된다 — `record`·`verdict`가 **`begin-round`가 연 적 없는 인덱스**를 거부하므로(exit 2), 거부를 무시하고 리뷰어를 띄워도 그 출력은 원장에 들어가지 못하고 verdict도 나오지 않는다. 이 축은 CLI test로 관측 가능하다. **막지 못하는 것은 둘이다.** (1) 캡 초과 라운드의 리뷰어가 실제로 발화해 토큰을 소모하는 것 — 리뷰어 기동은 LLM 행위라 셸로 추출할 대상이 없다. (2) **마지막(이미 FINAL) 라운드 인덱스를 재사용**하는 경로 — `record --round <cap-1>`은 여전히 통과한다. `record`를 `OPEN` 라운드로 한정하는 규칙은 판정 lifecycle이라 P1 소유로 이연했고(아래 "의도적으로 열어 둔 구멍"과 같은 축), 그 결과 캡은 **인덱스 경계**에서 구속되지 실행 횟수 전체를 봉인하지는 않는다. M1은 둘 중 어느 것도 막았다고 주장하지 않는다.

**PRD 1순위 지표의 절반은 미달이다.** "라운드 수가 상태 파일에 기록되고 **receipt에 봉인**"에서 앞 절반만 낸다 — 봉인은 `mccp-santa-review` GATE_ID를 신설하는 M2 소유다. 이 미달은 PRD M1 행과 구현 보고서에 그대로 적혀 있다.

**의도적으로 열어 둔 구멍이 하나 있다.** `record --id A`를 두 번 넣으면 A envelope가 2개 쌓이고 둘 다 PASS면 NICE가 나온다 — 리뷰어 하나로 dual-review가 우회 가능하다. 초안은 이것을 라운드 상태 기계로 닫았으나, 봉인 패스 Codex F0이 그 규칙들이 사용자 제약(판정 내용은 P1 소유) 위반임을 지적해 되돌렸다. 현재 M1은 receipt를 발행하지 않아 이 verdict가 어떤 게이트도 통과시키지 않으며, P1이 이 자리를 채우기 전까지 M1 산출물을 실운용에 쓰지 않는 것이 전제다. backlog HIGH + P1 1순위로 등재돼 있다.

### Added
- `plugins/mccp/scripts/lib/santa/counter.js` — 순수 캡 oracle. `parseCap`(`MCCP_SANTA_ROUND_CAP`, default 3, 허용 1..10, 불량값은 loud fail-open) + `decideRound({roundsSoFar, cap})`. 디스크 미접촉. 거부 시 `roundIndex`를 `null`로 돌려 호출자가 그 값으로 `record`를 시도할 수 없게 한다.
- `plugins/mccp/scripts/lib/santa/ledger.js` — 라운드 수의 **단일 출처**. 상태 파일 `.claude/state/santa-loop/<decision-slug>.json`(gitignored · `0o600`). mutation 3종은 `receipt/evidence-lock.js#guardedReadModifyWrite`로 감싸 read까지 임계구역 안에 둔다(밖에 두면 lost update가 닫히지 않고, 라운드가 **적게** 세어져 캡이 fail-open된다). `beginRound`는 **멱등** — 마지막 라운드가 OPEN이면 append 없이 그 index를 반환한다(재시도·중복 호출·동시 호출이 리뷰 없이 캡을 태우는 것을 막는다). 손상 JSON·`schema_version` 불일치는 **throw**이지 빈 상태 폴백이 아니다(폴백하면 손상 파일 하나가 캡을 0으로 리셋해 루프가 무제한이 된다).
- `plugins/mccp/scripts/lib/santa/gate.js` — verdict 판정. 순수 함수 + frozen interface 주석. `round`/`cap`은 받되 P0에서는 쓰지 않는다(P1의 종료 조건 자리를 미리 동결해 시그니처 변경 비용을 없앤다).
- `plugins/mccp/scripts/lib/santa/cli.js` — subcommand 5종(`resolve-decision`·`begin-round`·`record`·`verdict`·`status`). exit code를 **예외까지 전량 매핑**한다: 0 / 12 `cap_reached` 전용 / 75 `EVIDENCE_LOCK_UNAVAILABLE`(일시적 경합 — 2로 뭉뚱그리면 산문이 영구 실패로 오독한다) / 2 그 외 + catch-all. CLI JSON stdout은 전부 camelCase.
- `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` · `santa-gate.test.js` — 54 test(Windows에서 POSIX mode·symlink 3건 skip). 거의 전부 CLI 또는 실제 자식 프로세스를 지난다(순수 oracle만 보면 배선 결함을 놓친다는 이 repo의 실측 교훈).

### Changed
- `plugins/mccp/commands/santa-loop.md` — thin caller로 축약. Step 0의 3분기 판정 → `resolve-decision` 1회(산문에는 `warning` 출력만 잔류), Step 3 진입점에 `begin-round`, 리뷰어 응답 → `record`, Step 4 → `verdict`. **rubric 표는 무변경** — 산문이 적합한 영역이다. `## Output`은 한 줄 바꿨다(`Iterations: [N]/3` → `[N]/[cap]`): 캡이 `MCCP_SANTA_ROUND_CAP`으로 설정 가능해진 이상 리터럴 `3`은 cap=1로 돌려도 `/3`을 인쇄해 **출력이 거짓을 보고**한다. Notes에는 강제 등급과 slug 스코프 2줄을 더했다. 리뷰어 프롬프트와 출력 JSON 계약도 무변경이며, `id`/`model` 부여와 `critical_issues` → `criticalIssues` 변환은 CLI가 흡수한다.
- `plugins/mccp/scripts/receipt/decision.js` — `BRANCH_PREFIX_RE` export **1줄만** 추가(`SLUG_RE`는 이미 export돼 있었다). `BRANCH_BASED_COMMANDS`는 **무변경**이고 test가 그것을 단언한다 — santa를 그 Set에 넣으면 `/mccp:pr` 전용 `lastImplementReceiptSlug` fallback이 딸려 와, receipt를 발행하지 않는 santa에서는 `receiptExistsForSlug`가 항상 false라 원장이 **다른 decision의 slug** 아래로 들어간다.
- `.gitignore` · `docs/ENVIRONMENT.md` §11 — 원장 디렉토리 무시, `MCCP_SANTA_ROUND_CAP` 등재.

### Fixed
- `santa/ledger.js#canonicalPath` — 구현 중 실측한 이식성 결함. Windows에서 `git rev-parse --show-toplevel`은 긴 경로를 돌려주는데 호출자 경로는 8.3 단축명일 수 있고 **`fs.realpathSync`는 단축명을 확장하지 않아**, 같은 디렉토리가 두 철자를 갖고 `assertContained`의 prefix 비교가 실패한다 — **정상 호출이 traversal로 오판**됐다. `fs.realpathSync.native`로 양쪽을 정규화해 해소하고 회귀 test를 붙였다. 공유 모듈 `path-containment.js`는 손대지 않았다(pr-phase-lock·quarantine migration과 공유하는 표면).
## [1.25.1] — 2026-08-14

**diverse-agent-review M6 — 설치된 런타임에서 패널 실측 (단일 milestone → patch bump)** — 동작을 바꾸는 코드 변경은 **0줄**이다. 이 milestone의 산출물은 문서와 **측정 기록**이며, 코드 diff는 version 리터럴 3건(`plugin.json` · `renderer/html.js` page-foot · `renderer/markdown.js` derived 줄) 동기뿐이다.

M6의 원래 목표는 "패널 승인 경로 1회 완주"였다. 그 목표를 향해 게이트를 **4회 라이브로 완주 시도**했고 결과는 승인이 아니라 **데이터**였다 — PRD의 지표 정직성 규칙(UI3)이 요구하는 대로 관측된 것을 관측된 대로 적는다.

### Observed

- **O1 — 패널은 4회 라이브 실행에서 승인을 0건 발급했다.** 매 라운드 직전 findings를 전량 흡수한 뒤 재제출했고, L1은 4회 모두 `converged`(violations 0)였으므로 막은 것은 mechanical 층이 아니라 L2다. findings 24 → 8 → 7 → 19건, 관점 단위로는 **16회 중 `pass` 2회**. R3→R4에서 findings가 역전했는데 그 사이 변경은 표면을 *줄이려는* 구조 재편이었다 — 재편이 새 표면을 만들었다.
- **O2 — 차단 경로 wall-clock은 4회 모두 목표(10분) 이내였다.** `307,578` · `342,767` · `321,954` · `280,209` ms(평균 약 313초). 다만 이는 차단 경로 수치이며 통과 경로 지표를 대신하지 않는다(UI10 — 인접 측정을 목표 측정으로 승격하지 않는다). 증거 강도도 균일하지 않아 R4만 파일로 남고 R1–R3은 세션 관측이다.
- **O3 — 계측 표면이 라운드 축적을 지원하지 않는다(M4 계측의 남은 절반).** 레코드 경로 slug가 PRD 경로에서 파생돼 `cmdRecord`가 무조건 덮어쓰므로 재실행이 이전 기록을 지운다 — 4회를 돌렸고 잔존 레코드는 1건이다. M4가 이것을 못 본 이유는 게이트를 한 번만 돌렸기 때문이다.

### Changed

- `.claude/prds/diverse-agent-review.prd.md` — #6 Outcome을 관측 결과로 재정의하고 `complete`. 통과 경로 지표는 **forward-only 유지**(표본 0), 차단 경로 행에 4회 수치 기입, Evidence에 O1~O3. 미달·신규 축을 **#7**(budget 라이브 발화) · **#8**(quorum 캘리브레이션) · **#9**(계측 재실행 편향, #5 이후)로 신설.
- `.claude/reviews/plan-review-diverse-agent-review-m6-r4-blocked.md` — O3의 덮어쓰기에서 살아남은 유일한 레코드를 파일명으로 고정(측정 블록은 생성된 그대로 무변경).
- `.claude/PRPs/reports/diverse-agent-review-m6-report.md` — 근거 · provenance · 승인자 기록.

> **version**: 이 항목은 번호를 두 번 옮겼다. plan이 지정한 `1.23.9`는 2026-08-10에 이미 발행돼 `1.23.12`로 올렸고, 그 뒤 main이 `1.24.0`(meta-research-command M1)과 `1.25.0`(setup-gitignore M1)을 연속 발행하면서 `1.23.12`는 **중복이 아니라 역행**이 됐다 — 그대로 머지하면 `plugin.json`이 내려간다. §3.7 forward-only 상향에 따라 발행된 `1.25.0`에서 한 칸 올린 `1.25.1`이다(단일 milestone ship이므로 patch 축). 앞선 선례들이 전부 같은 번호를 두 브랜치가 주장한 **중복**이었던 것과 달리, 이번은 base가 앞질러 가 이 브랜치의 선언이 **하향**이 된 경우다 — 탐지 신호도 CHANGELOG 헤딩 중복이 아니라 헤딩 **순서 이탈**이었다.

## [1.25.0] — 2026-08-13

**setup-gitignore M1 — `/mccp:setup` gitignore 프로비저닝 (PRD 전 milestone 종료 → minor bump, 1.24.0 → 1.25.0)** — 다른 프로젝트에 mccp를 설치한 사용자가 첫 커밋에서 런타임 산출물(receipt·lock·hook-trace shard·derive cache)을 함께 커밋하던 문제를 닫는다. `/mccp:setup`에 **Phase 5**를 신설해 정본 무시 규칙 30줄을 대상 저장소 `.gitignore`에 marker 블록으로 멱등 병합한다. **정본에는 프로비저너 자신의 부산물(`.gitignore.lock`·`.gitignore.bak`·`.gitignore.*.tmp`)도 포함된다** — 런타임 산출물을 git 밖에 두는 것이 목적인 도구가 자기 산출물만 예외로 두면 `.bak`(실행 직전 파일의 축자 사본)이 `git status`에 영구 잔존한다. **ship receipt(`mccp-pr-codex`)는 negation 규칙으로 추적 대상에 남는다** — §3.12 증거 내구성 계약이 설치 산출물에서도 성립해야 하며, 줄 순서가 뒤바뀌면 negation이 무력화되므로 인덱스 부등식 + `git check-ignore` + **실제 `git add` 후 `ls-files --stage`** 3층으로 단언한다(`check-ignore`는 "무시되지 않음"까지만 증명해 PRD의 "tracked 확인"에 미달).

**marker 바깥 줄을 구조적으로 보존하는 것이 이 milestone의 설계 중심이다.** `create`는 `'wx'` 배타 생성, `append`는 append-only(`'a'`) — 기존 바이트를 읽고 다시 쓰지 않으므로 유실될 대상 자체가 없다(UI2가 방어의 결과가 아니라 구조적 성질). 정본이 바뀌면 `update`가 **marker 구간만** 치환하고 바깥 줄은 `planMerge`가 그대로 옮긴다(`.bak` + `sourceHash` 재검사 + `<target>.<pid>.<rand>.tmp`). `<target>.lock`(60초 lease + PID 생존 tri-state)은 **전 쓰기 경로**를 직렬화한다 — `append`에서 빠지면 병렬 writer가 각자 블록을 붙여 파일이 영구 `damaged`가 된다.

`git rev-parse` nonzero를 **3갈래로 가른다**: git의 표준 부정 진단에 매칭될 때만 `not-a-git-repo`(정상 skip, exit 0)이고, dubious ownership·저장소 손상·오호출은 `git-error`(exit 1), spawn 실패는 `git-unavailable`(exit 1)이다. 뭉개면 "규칙 미설치인데 성공 보고"라는 fail-open이 된다. stderr 판정이 번역에 깨지지 않도록 spawn 시 `LC_ALL=C`를 고정한다.

정본과 이 repo `.gitignore`의 **양방향 drift lint**를 전용 워크플로 `.github/workflows/gitignore-drift.yml`(matrix에 `windows-latest` 포함 — CRLF 완화가 주장이 아니라 실행이 되는 조건)로 등록한다. **보증 범위는 "대상 파일이 바뀐 PR에서 lint가 실행되고 drift면 red"까지다** — 그 red가 머지를 막는 것은 branch protection 설정이라 repo 파일로 표현할 수 없고, `ROLLOUT-1`로 명시된 미완료 배포 전제로 남는다. **탐지 경계도 함께 명시한다**: 두 등식은 집합 *비교*이므로 어떤 경로가 정본과 repo `.gitignore` **양쪽 모두에 없으면** 두 집합이 그대로여서 초록이다. 즉 강제되는 것은 "한쪽에 들어온 항목은 다른 쪽에도 분류될 것"이지 "코드가 쓰는 모든 런타임 경로가 어딘가에 선언될 것"이 아니다 — 후자를 닫으려면 producer 쪽 인벤토리가 필요하고 그건 별도 축으로 이연했다.

### Added
- `plugins/mccp/scripts/lib/gitignore-provision.js` — 정본 블록(`MCCP_IGNORE_BLOCK` 30 entries) + `REPO_ONLY`(21, 제외 사유 동봉) + 순수 merge 오라클(`planMerge`) + `locateManagedBlock` 엄격 3-state 판정 + advisory lock + 오염 스캔 + CLI. `reason`은 **폐쇄 enum 8종**이며 비-`ProvisionError` 예외는 전부 `internal-error`로 매핑된다(Implement-Codex F1 흡수 — OS/Node별 메시지가 프로토콜 값으로 새는 것을 차단).
- `plugins/mccp/scripts/lib/tests/gitignore-provision.test.js` — 84 tests. merge 의미론 · 손상 marker 4케이스 · `spawnSync` 6행 판정표(스텁) · 실제 write E2E · 동시성(중간 편집 주입 · 병렬 writer · lease 만료 · 회수 신원 재검증 · tmp 고유성) · drift lint(양방향 4단언) · `setup.md` 계약 16항목 · 워크플로 트리거 lint의 **단일 소유처**.
- `.github/workflows/gitignore-drift.yml` — drift 전용 게이트. `paths` 필터를 lint의 판정 입력과 같은 집합으로 두어 스텝이 죽은 코드가 되지 않게 한다. matrix의 `windows-latest`가 보증하는 것은 **write/lock/symlink 경로의 플랫폼 동등성**이다 — checkout 바이트가 LF인 것은 `.gitattributes`(`* text=auto eol=lf`)가 이미 정하므로 러너 EOL 설정으로 얻는 보증이 아니다(그 사실 자체를 test가 단언한다).

### Changed
- `plugins/mccp/commands/setup.md` — Phase 5(gitignore 프로비저닝) 신설, 기존 최종 보고를 Phase 6으로 이동. `--skip-gitignore` 플래그 + `Bash(git:*)` 권한 추가. exit-code 전파와 "exit 0 + 판독 불가 stdout도 실패"가 본문 bash에 코드로 고정된다. **flag는 셸 변수로 명시 대입한다** — 미대입 `${DRY_RUN:+--dry-run}`은 빈 문자열로 전개돼 "탐지 전용" 실행이 실제 write가 되며, 계약 lint 13번이 "bash fence가 보간하는 변수는 같은 파일에서 대입될 것"으로 이 결함군 전체를 고정한다(기존 `MCCP_TMP` 단항 규칙의 일반화).
- **정본에 `.claude/state/journal/`을 추가했다 (origin/main 병합 중 drift lint가 실측 검출).** main의 multi-session-work-loop M5가 이 repo `.gitignore`에 그 줄을 넣었고, 병합 직후 "모든 repo 항목은 정본 또는 REPO_ONLY로 분류될 것" 등식이 red가 됐다 — 이 lint가 존재하는 이유 그대로의 발화다. M5 저널은 `state-writer.update()`가 **모든** mccp 세션에서 만드는 per-session 산출물이므로 REPO_ONLY(이 repo 사정)가 아니라 정본이며, 이로써 정본은 29 → 30줄이 된다. plan 문서의 `29개` 표기는 계획 시점 기록이라 소급 편집하지 않는다.
- **오염 스캔의 소유처가 셸에서 프로비저너로 이동했다.** `git ls-files -i -c --exclude-standard`는 이제 `provision()`이 **자신이 해석한 repo root**에 대해 실행하고 결과를 `pollution:{ok,files}`로 반환한다. setup.md가 직접 실행하던 시절엔 스캔이 호출자 cwd 스코프여서, 하위 디렉토리에서 실행하면 그 하위 트리만 훑고 그 부분 결과를 깨끗한 결과와 **같은 모양으로** 보고했다.
- `plugins/mccp/.claude-plugin/plugin.json` · `renderer/html.js` page-foot · `renderer/markdown.js` derived 줄 — `1.25.0` 동기. 상단 note의 `currently` 값이 `1.23.6`에 멈춰 있던 선재 drift도 함께 정정. **버전은 §3.7 forward-only 상향으로 `1.24.0`에서 한 칸 올렸다** — 이 브랜치는 원래 `1.24.0`을 선언했으나 병렬 브랜치 meta-research-command M1이 먼저 머지되며 main이 그 번호를 발행했다(7번째 재발). 발행된 번호는 불가침이고, 이 항목은 PRD 전 milestone 종료라 patch가 아니라 minor 축이므로 `1.25.0`이 한 칸이다.
- **`--force-update` 동의 게이트를 철회하고 `update`를 기본 동작으로 바꿨다 (PR-Codex F1, HIGH).** 정본 블록이 바뀌면 이전에는 `action:'update-required'`만 보고하고 쓰지 않았는데, **블록에 plugin version이 박혀 있어** 버전 bump만으로 기존 설치 전부가 영구히 그 상태가 됐다. `/mccp:setup`은 그 플래그를 스스로 주지 않으므로 사용자가 수동으로 CLI를 돌리기 전까지 낡은 규칙에 머물렀고, 그동안 setup은 **성공을 보고**했다 — 즉 "정본 규칙을 멱등 병합한다"는 약속이 첫 업그레이드 이후 조용히 성립하지 않았다. 게이트의 **범위가 어긋나 있었다**: 동의가 보호하려던 것은 *사용자의 줄*인데 `update`가 치환하는 것은 *도구가 소유한 marker 구간*뿐이고 바깥 줄은 구조적으로 보존된다(인덱스 부등식 test가 이미 단언). `--force-update` 플래그와 `update-required` action을 **제거**했다. `.bak`·`sourceHash` 재검사·tmp+rename·lock은 그대로 `update` 경로에 적용된다 — 철회한 것은 동의 요구이지 복구 수단이 아니다.
- **`update`가 블록 바깥 줄의 개행을 정규화하던 문제 (PR-Codex F3, HIGH).** `planMerge`가 `split(/\r?\n/)` 후 단일 `eol`로 rejoin해, 혼합 개행 파일이 통째로 정규화돼 돌아왔다 — 관리 블록 **바깥**, 즉 사용자 바이트까지. 명시 플래그 뒤에 있을 땐 견딜 만했지만 F1로 기본 실행이 되면서 정본이 바뀔 때마다 조용히 사용자 내용을 건드리게 됐다. 이제 원문에 대해 오프셋 스플라이스를 수행해 바깥 각 줄이 **자신의 terminator를 그대로** 유지하고, END marker의 terminator를 그대로 이어 붙여 미종결 마지막 줄이 없던 개행을 얻지 않는다.
- **블록 안에 "여기 줄은 교체된다" 경고 2줄을 넣었다 (PR-Codex F5, HIGH — REJECTED_BY_DESIGN + 피해 완화).** marker 사이 줄이 `update`에서 교체되는 것은 관리 블록의 정의이지 결함이 아니며(Plan-Codex 이력 F15에서 이미 같은 축을 기각), 임의 in-block 줄을 보존하면 블록이 유지 불가능해진다. 다만 `--force-update` 철회로 그 교체가 일반 실행에서 일어나게 됐으므로, "managed by"만으로는 편집하려는 사람에게 도달하지 않는다. 경고를 블록 **안에** 실어 그 사람에게 닿게 하고, 이미 편집한 경우의 복구는 `.bak`이 맡는다.
- **`--dry-run`이 실제 줄을 보여주지 않던 문제 + update 문구 (PR-Codex F4·F6, MEDIUM).** 줄 수만 보고했는데, `update`가 기본 실행이 된 이상 dry-run은 무엇이 바뀌는지 미리 볼 **유일한** 수단이라 내용을 감추면 preview가 아니다. 이제 줄을 출력한다. 또한 `addedLines`는 update에서 *전체 교체 블록*이라 "N줄 추가"는 추가를 과장하고 제거를 감춘다 — action별로 문구를 갈라 update는 "기존 블록을 N줄로 **교체**, 바깥 줄 유지, 교체 전 파일은 `.bak`"으로 보고한다.
- **블록 교체가 `.gitignore`의 파일 mode를 바꾸던 문제 (PR-Codex F7, MEDIUM).** `rename()`은 inode를 교체하므로 대상이 tmp의 mode를 물려받는데, tmp는 쓰기 중 world-readable이 되지 않도록 의도적으로 `0600`이다. 그 mode가 교체를 넘어 살아남으면 사용자의 `0644` `.gitignore`가 조용히 owner-only가 되어 공유 checkout이나 서비스 계정이 읽지 못한다. 이제 대상의 mode를 읽어 rename 직전에 tmp에 복원한다 — 하드닝은 그것이 필요한 창(쓰기 구간)만 덮고 그 뒤로 남지 않는다.
- **append 부분 실패가 파일을 영구 파손 상태로 남기던 문제 (PR-Codex F8, HIGH).** `writeFileSync`는 짧은 쓰기를 재시도하지만 도중에 진짜로 실패하면(ENOSPC·quota·I/O) 이미 쓴 바이트는 남는다. 그 바이트에는 orphan BEGIN marker가 들어 있어 **이후 모든 실행이 `marker-damaged`로 죽고** 수동 복구를 요구한다 — 일시적 디스크 부족이 영구히 막힌 파일이 된다. 이제 실패 시 append 이전 길이로 되돌려 실패를 디스크상 no-op으로 만든다(그래야 "다시 실행하세요"가 참이 된다). 롤백은 **전적으로 descriptor 위에서** 이뤄지며, 여기서 플랫폼이 갈린다. 경로 기반 truncate는 close와 truncate 사이에 다른 프로세스가 `.gitignore`를 원자적으로 교체하면 **새 파일을 자르므로** 배제했다. `O_APPEND`를 버리고 명시 오프셋에 쓰면 Windows에서도 fd truncate가 되지만, 그 경우 `fstat`과 write 사이에 끼어든 writer의 바이트를 **덮어쓴다** — 실패 경로를 정리하려고 **성공 경로를 손상시키는** 맞바꿈이라 되돌렸다. 따라서 `O_APPEND`를 유지한다: 모든 chunk가 원자적으로 실제 끝에 붙어 동시 append를 절대 덮어쓰지 않는다. 대가는 `O_APPEND` fd의 `ftruncate`가 Windows에서 EPERM이라 **그 플랫폼에서는 롤백이 불가능**하다는 것이고, 우회하는 대신 오류 메시지가 "롤백되지 않았으니 marker 사이를 직접 지우고 재실행하라"고 정확히 말한다. POSIX는 롤백하고 Windows는 보고한다 — test가 두 계약을 각각 단언한다.
- **오염 스캔을 정본 규칙 범위로 한정했다 (PR-Codex F2, MEDIUM).** `git ls-files -i -c --exclude-standard`는 저장소의 **전체** ignore 설정을 평가하므로, 사용자의 기존 `.gitignore`나 `.git/info/exclude`·global ignore로 이미 무시되던 tracked 파일까지 "이번 프로비저닝이 새로 무시하게 된 파일"로 보고하고 `git rm --cached`를 권했다 — 이 도구가 건드린 적 없는 파일을 untrack하도록 안내하는 것이며, UI4가 범위 밖으로 뺀 두 채널을 뒷문으로 끌어들였다. 이제 정본 패턴만 담은 임시 exclude 파일을 `-X`로 넘겨(`--exclude-standard` 없이) **우리 규칙이 무시하는 것만** 보고한다.

### Fixed
- **advisory lock 회수 경쟁** — 두 프로세스가 같은 stale lock을 동시에 회수 가능으로 판정하면, 느린 쪽의 `unlink`가 빠른 쪽이 방금 만든 **신규 lock**을 지워 둘 다 임계구역에 들어갔다. 판정 시점의 신원 `(token, mtimeMs)`을 unlink 직전 재검증한다. heartbeat가 mtime을 갱신하는 것 자체가 "회수하지 말라"는 신호이므로 token 단독 비교로는 부족하다.
- **lock 대기의 busy-wait** — `while (Date.now() < until) {}`가 대기 전체(기본 10초, env로 상향 가능) 동안 코어 하나를 100% 점유했다. 주석이 근거로 든 "milliseconds long"은 임계구역 길이이지 대기 길이가 아니다. `Atomics.wait` 기반 동기 sleep으로 교체.
- `MCCP_GITIGNORE_LOCK_WAIT_MS=0`(대기 없이 즉시 실패)이 `|| LOCK_WAIT_MS`에 걸려 10초 기본값으로 되돌아가던 문제. 명시적 지시가 그 반대로 해석됐다.
- `--repo`가 값 없이(또는 `--repo --json`으로) 주어지면 조용히 cwd로 폴백하거나 `--json`이라는 이름의 디렉토리를 대상으로 삼았다 — 둘 다 **호출자가 지정하지 않은 저장소에 쓰는** 경로다. 이제 usage 오류(exit 2).
- `plugin.json` 판독이 repo 해석보다 먼저라, non-git 디렉토리에서 manifest가 손상되면 문서화된 skip(exit 0) 대신 exit 1이 났다.
- `applyMerge`가 미인식 action을 whole-file rewrite 경로로 흘려보낼 수 있던 fallthrough를 명시 거부로 바꿨다(도달 불가였던 `update-required` 분기 제거).
- **`--dry-run`이 하지 않은 쓰기를 보고하던 문제.** dry run은 실제 실행과 **같은 action**(`create`/`append`)을 반환한다 — 그게 preview의 정의다 — 는데 Phase 5 본문이 action만 보고 분기해 "`.gitignore` 갱신됨"을 출력했다. 실측: 빈 저장소에서 `--dry-run`이 `action=create` · `dryRun=true` · `addedLines=59`를 반환하고 파일은 생성되지 않았는데 본문은 갱신을 보고했다. 게다가 계약이 요구한 "추가된 줄 수 보고"와 "`--dry-run`은 `addedLines`를 출력"을 본문이 **한 번도 이행하지 않았고**(`addedLines`를 읽는 코드가 없음), dry run에서 `pollution`이 null인 것을 "검사 실패"로 오인해 WARNING까지 냈다. `dryRun` 분기 + `addedLines` 소비로 셋을 함께 닫았다. 이는 같은 사이클이 이미 고친 `${DRY_RUN:+--dry-run}` HIGH와 **같은 결함군의 반대편**(호출 측이 아니라 보고 측)이다.
- **계약 lint를 14 → 16항목으로 확장**해 위 결함군을 기계적으로 고정했다. 두 신규 항목은 **속성 접근(`.addedLines` / `.dryRun`)에 앵커링**한다 — bash fence의 주석이 그 필드명을 언급하므로 단순 단어 매칭은 본문이 아무것도 읽지 않아도 초록이 된다(실측으로 확인 후 정정).
- **블록 교체의 rename 직전 재검사.** hash 검사와 `renameSync` 사이에 `.bak` 쓰기 + tmp 쓰기가 들어 있어, 창이 **파일 쓰기 두 번**만큼 넓었다. 교체 직전 재검사로 창을 syscall 몇 개 수준으로 줄인다. **경쟁을 닫지는 못한다** — "변경되지 않았을 때만 교체"하는 원자적 rename이 portable하게 존재하지 않으므로, 협조하지 않는 writer는 남은 틈에 여전히 끼어들 수 있다. 직렬화의 본체는 advisory lock이고 이건 비협조 writer에 대해 남아 있던 마지막 값싼 축소다. 첫 검사를 비활성화해도 이 재검사가 같은 시나리오를 잡는 것을 변이로 확인했다(=죽은 코드 아님).
- **drift 게이트가 `.gitattributes` 변경에 발화하지 않던 문제.** 테스트가 `.gitattributes`의 `* text=auto eol=lf` 고정을 단언하는데 워크플로 `paths` 필터에는 그 파일이 없었다 — 즉 그 파일만 바꾸는 PR은 자신을 지키는 단언을 **한 번도 실행하지 않고** LF 보증을 은퇴시킬 수 있었다. 필터가 "정확히 lint의 판정 입력"이라던 워크플로 자신의 주석과도 어긋난다. `paths`에 추가하고, 트리거 lint가 그 항목을 요구하도록 함께 고정했다.
- **`REPO_ONLY`의 역방향 단언 부재.** drift lint는 "정본 → repo" 방향만 강제하고 "`REPO_ONLY` 각 행이 실제로 이 repo에 존재하는가"는 검사하지 않았다. `REPO_ONLY`는 "이 repo가 carry하지만 배포하지 않는 항목"으로 문서화돼 있으므로, repo가 그 줄을 버리면 그 행은 **없는 파일에 대한 주장**이 되고 나중에 결정의 증거로 읽힌다. 현재 21행 전부가 실재함을 실측한 뒤(위반 0) 그 상태를 단언으로 고정했다.
- **빈 `.gitignore`가 없는 `.gitignore`와 다른 바이트를 만들던 문제.** 파일이 없으면 `create`가 블록으로 시작하는 파일을 쓰지만, 파일이 있고 비어 있으면 `append`가 앞에 빈 줄을 하나 붙였다 — 같은 종료 상태를 서술하는 두 경로가 관리 블록 **바깥에** 아무도 쓰지 않은 줄을 두고 갈렸다. 빈 줄은 사용자 내용과 블록을 띄우기 위한 구분자이므로 띄울 내용이 없을 때는 생성하지 않는다(내용이 있을 때 구분자가 유지되는 것도 함께 단언한다 — 반대 방향 과잉교정 차단).

### Security
- `.gitignore` 대상이 **symlink면 거부**한다(`reason:'symlink-target'`, exit 1, 파일 무변경). Node `fs`는 기본적으로 링크를 따르므로 append와 블록 교체가 임의 파일에 쓸 수 있었다. 안전 경계를 계산해 허용하지 않고 거부를 택한 것은 허용 판정 로직 자체가 새 공격면이기 때문(security-reviewer S1).
- **거부 범위를 결정적 write 경로 전체로 확장했다** — 이전에는 대상 `.gitignore`만 검사해 `.gitignore.bak`이 무방비였다. `.bak`은 경로가 대상만큼 결정적이라 동일하게 사전 배치가 가능하고 기본 `'w'` 쓰기는 링크를 따르므로, `.gitignore.bak -> ~/.bashrc`를 심어두면 블록 교체 시 사용자의 `.gitignore`(공격자가 repo-write를 가졌다면 그 줄 내용까지 통제 가능)가 그 파일에 얹혔다. 저장소 쓰기 권한이 저장소 **밖 임의 경로에 대한 임의 내용 쓰기**로 확대되는 경로다. 이제 `.bak`도 lstat으로 거부하고, 검사와 쓰기 사이의 창은 unlink + `'wx'` 배타 생성으로 닫는다(그 사이 다시 심긴 링크는 따라가는 대신 생성이 실패한다). tmp도 같은 이유로 `'wx'`로 바꿨다 — pid + nonce라 사전 배치가 비현실적이므로 이쪽은 하중을 받는 절반이 아니라 값싼 절반이다.
- **append 경로의 symlink TOCTOU를 `O_NOFOLLOW`로 닫았다.** lstat은 check-then-use라 검사와 `appendFileSync` 사이에 대상이 symlink로 교체될 수 있었고, `'a'`는 링크를 따른다. `fs.openSync(target, APPEND_FLAGS)`로 바꿔 **open 자체가 거부**하게 했다(`ELOOP` → `reason:'symlink-target'`) — 창을 좁히는 것과 닫는 것의 차이다. Windows는 이 상수를 정의하지 않아 lstat 단독으로 강등되며(그쪽은 symlink 생성 자체가 권한/개발자 모드를 요구한다), 따라서 이 가드의 실증은 CI의 `ubuntu-latest`가 소유한다.
- lock 경로도 symlink면 **명시 거부**한다. 배타 생성이 이미 링크를 따르지 않아(O_EXCL은 링크에서 EEXIST) 쓰기 노출은 애초에 없었지만, EEXIST가 이 루프에서는 "다른 writer가 점유 중"이라는 신호라 가드가 없으면 lease를 다 소진한 뒤 **존재하지 않는 live writer**를 탓하며 실패했다. 고친 것은 오류 계약이지 쓰기 노출이 아니다.
- lock · tmp · `.bak`을 `0o600`으로 생성한다. `.bak`은 사용자 파일의 축자 사본이고 tmp는 기본 모드에서 world-readable이었다(S2·S3).

## [1.24.0] — 2026-08-14

**meta-research-command M1 — 메타 조사 커맨드 (PRD 전 milestone 완료 → minor bump)** — `/mccp:*` 21개가 전부 *만들기*와 *점검* 축이라, "이 문제의 근인이 무엇이고 어떤 선택지가 있는가"를 조사해 남기는 축이 비어 있었다. 그 작업은 이미 네 번 반복됐고(`.claude/_meta/` 수작업 산출물 5종), 절차가 문서화돼 있지 않아 산출물의 품질과 형식이 매번 달랐다. 더 나쁜 것은 **전제의 유효기간을 표시할 자리가 없었다**는 점이다 — `diverse-agent-review-analysis.md` §1.3의 4축 경고는 M1 ship으로 무효화됐으나 그 사실이 6일간 문서에 반영되지 않았다.

**보증하는 것은 셋뿐이고 그 이상을 주장하지 않는다** — (1) 조사 골격이 phase로 고정된다 · (2) 산출물이 **무엇을 근거로 어느 시점 코드를 보고** 판정했는지를 기재하고 그 참조 경로의 실존이 기계 검증된다 · (3) 모든 산출물이 색인에서 1홉 도달한다. **조사 품질은 강제하지 않는다** — PRD Risk 1이 이미 인정한 한계이며 커맨드 본문에 명시했다.

### Added

- `plugins/mccp/commands/meta-research.md` — 5 phase 고정(SCAFFOLD → EVIDENCE → PRIOR ART → PRECEDENT → VERDICT+REGISTER). Phase 4의 세 호출은 `lint --pre-register` → `register` → `lint`(전체) **순서가 계약**이며 stop-at-first-failure다. 순서가 뒤집히면 lint 실패 시 색인에 무효 문서를 가리키는 **고아 항목**이 남고 `register`는 원자 치환이라 되돌릴 지점이 없다.
- `plugins/mccp/scripts/lib/meta-research.js` — `scaffold` / `register` / `lint` 3 subcommand. lint 4검사: **L1** 파일명 · **L2** 필수 구성요소 7개(검사 지점 9개 — 헤더 블록을 1개로 세되 3키 각각 검사) · **L3** 전제 명시(≥1행 · 시점 셀이 sha 또는 ISO 날짜 · 참조 경로 실존 + 저장소 내부) · **L4** 색인 1홉 + 중복 행 검출(`DUPLICATE_INDEX_ROW`).
- `plugins/mccp/scripts/lib/tests/meta-research.test.js` — **45건**. T0 왕복 · 커맨드 골격 계약 · 부정 27 · 긍정 3 · 컨테인먼트 회귀 2 · 동시성 2 · 면제 1 · 실 repo 회귀 1 · EOL 보존 2 · 색인 경계 2 · lone-CR 1 · 색인 중복 2. (표시 수는 `node --test`가 세는 실제 case 수이며 loop 생성 케이스를 포함한다 — Codex santa R2 MEDIUM 흡수: 이전 판은 라운드 1에서 test를 4건 늘리고도 `38`을 그대로 뒀다.)
- `.claude/_meta/README.md` `## 색인` 표 — 기계 앵커 신설 + legacy 5종 백필. 기존 주제별 서술 절은 보존한다(역할이 다르다).

### 설계상 중요한 것

- **scaffold 산출물은 태어날 때 lint red다.** `## Premises` 표가 데이터 행 0개로 생성되어 L3에 걸린다. "빈 전제를 허용하고 나중에 채운다"는 곧 안 채운다는 뜻이므로, red를 기본값으로 두면 Phase 4가 통과할 유일한 길이 전제를 실제로 적는 것이 되고 PRD primary 지표(전제 명시 100%)가 소망이 아니라 기계 조건이 된다.
- **적용 범위 분기 — L1/L2/L3는 규격 문서에만, L4는 전수.** legacy 5종은 규격 이전에 쓰였고 소급 개작하면 인바운드 링크 6개가 깨진다(그중 3종은 날짜 접두 파일명도 아니라 L1 전수 적용 시 영구 red). 면제 술어는 `**Status**` 헤더 한 축뿐이며, 면제된 문서는 `exempt[]`에 파일명 + 사유로 **열거**된다 — 조용한 면제가 아니다. **L4는 전수로 남으므로 발견 가능성 지표는 무손상**이다.
- **`repoRoot`는 CLI 표면을 갖지 않는다.** `--repo-root` 플래그가 있으면 이후의 모든 봉쇄가 호출자가 고른 루트에 상대적이 되어 `assertContained`가 지키는 대상 자체를 인자로 옮길 수 있다. 이 모듈은 **파일을 쓰므로**(scaffold가 문서를, register가 README를) 루트가 인자면 범위 이동이 아니라 **쓰기 방향 재지정**이다. `impeccable-detect.js`는 `--repo-root`를 노출하지만 읽기 전용 detector라 선례가 아니다 — 차이는 취향이 아니라 읽기/쓰기다.
- **색인 중복 행은 관용이 아니라 복구 대상이다.** `register`가 첫 행만 갱신하던 시절에는, 손으로 편집돼 같은 문서를 두 번 실은 README가 서로 다른 상태/날짜를 주장한 채 남고 L4는 `Set` 위에서 판정하므로 **green으로 보였다**. 이제 `register`가 나머지 행을 제거하고, `lint`는 다중 집합으로 판정해 `DUPLICATE_INDEX_ROW`를 낸다 — 다음 register를 기다리지 않고 드러난다.
- **문서 파싱은 lone-CR(`\r`)에도 성립한다.** 헤더 파싱은 JS의 multiline `^`/`# Changelog

All notable ship milestones for **my-claude-code-plugin (mccp)** are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

가 CR에 앵커되므로 원래 동작했는데 섹션 검출만 `/\r?\n/`로 갈라, classic-Mac 개행 문서가 **한 줄**로 읽혀 정상 문서가 `MISSING_COMPONENT` 6건 + `PREMISES_EMPTY`로 오탐됐다(실측). 헤더가 통과하고 섹션만 실패했기 때문에 증상이 "규격 미달 문서"로 보여 원인이 가려졌다.
- **register 동시성은 "봉쇄"가 아니라 "완화"다.** lock을 획득한 경로에서만 lost update가 없고, 미획득 경로에서는 경고 후 진행하므로 여전히 가능하다. 색인은 감사 corpus가 아니라 발견 보조물이므로 CLAUDE.md §3.6의 fail-open 쪽에 속한다(fail-closed면 stale lock 하나가 조사 작업을 멈춘다). 유실은 조용하지 않다 — 다음 `lint --all`이 `NOT_INDEXED`로 자기 검출한다.
- **`aliases.js` 등재는 게이트가 아니다.** `produces: []` · `requires_preceding: []` 빈 spec으로 등재해 hook이 이 커맨드를 명시 인식하게 하되 `GATE_IDS`는 무변경이다. 회귀 test가 등재 사실이 아니라 **빈 배열**을 단언한다 — 등재만 확인하면 나중에 게이트가 실려도 green이기 때문이다.

### Changed

- `plugins/mccp/.claude-plugin/plugin.json` `1.23.7 → 1.24.0` + renderer footer 2면 동기. PRD의 유일한 milestone이 완료되므로 §3.7 기준 **minor**다. base는 `1.23.7`이지만 `origin/main`이 이미 `1.23.11`을 소비했으므로 `1.24.0`은 forward-only로 유효하다.
- `CLAUDE.md` §4 cheat sheet에 `/mccp:meta-research` + `lint --all` 등재.

## [1.23.11] — 2026-08-14

**gate-guard-integrity M2 — 신호 신뢰도 (단일 milestone → patch bump)** — "전수 실행 결과가 실행마다 동일한가"를 **말할 수 있게** 만들고, 외부 의존 스모크 테스트가 도달 불가일 때 **참인 사유로** skip하게 한다. 착수 전 실측 4회가 plan의 형태를 바꿨다: PRD·STATE가 지목한 flaky 4건은 **한 번도 발화하지 않았고**, 실제로 갈라진 것은 그 목록에 없던 항목이었다. 즉 고정된 flaky 목록을 수리하는 계획은 성립하지 않으며, "실행마다 동일"이라는 진술은 **관측 없이는 참·거짓을 말할 수 없다**.

**이 milestone은 목표를 달성하지 못했고, 그 사실을 자기 산출물로 측정했다.** 통제된 비교(같은 harness·같은 머신, 각 10회)에서 수정 전 스위트는 **10/10 완전히 동일**했고 수정 후는 **8/10**이다. 유입된 비결정 2건(`dedupe.test.js:123` · `worktrees-source.test.js:344`, 각 ≈10%/run)은 이 변경이 수정한 어느 파일에도 속하지 않으며, 세 차례 재현 시도(16× 동시 · 3배 부하 · 15× 순차)가 **전부 실패**해 메커니즘을 확정하지 못했다. 추정으로 채우지 않고 PRD Open Question으로 승계한다. **PRD Milestone 2는 지표 충족이 아니라 운영자의 명시적 수용 판정으로 `complete`가 됐다** — PRD Scope가 "비결정적 간섭의 근본 해소"를 범위 밖으로 못박고 "재현 조건 확정까지만"이라 규정했고, 그 확정은 달성됐다. 다만 `after.tap` 단일 실행이 네 델타 기준을 전부 충족한다는 사실을 통과 근거로 삼지 **않았다** — 8/10의 green을 성공으로 읽는 것이 이 PRD가 지목한 결함 형태 자체이기 때문이다.

닫힌 것은 분명하다 — **축 C**(`b2-coverage-gate` 상시 red 2건)는 10회 전부에서 사라졌고(`alwaysFailing: []`), **축 B**(거짓 skip 사유)는 문자열 A/B로 대체됐다.

### Added
- `plugins/mccp/scripts/lib/suite-determinism.js` — N회 전수 실행의 실패 집합을 대조하는 결정성 harness. 순수층 `diffRuns(runs)` → `{stable, unionFailing, alwaysFailing, sometimesFailing}` + 실행층(`--runs N --json --repo-root`). **관측만 한다** — 재시도로 green을 만들거나 스위트를 수정하지 않는다. `stable`은 fail-closed다: 1회 관측은 안정성의 근거가 아니고(`insufficient-runs`), 요약 헤더가 없는 잘린 TAP은 "실패 0건"이 아니라 `incomplete-tap`이며, 실패 **이름**이 같아도 pass/fail 카운트가 움직이면 divergence다(조건부 skip이 pass↔skip을 오가는 형태는 이름 집합에 흔적을 남기지 않는다).
- `plugins/mccp/scripts/lib/perf-scaling.js` — `judgeScaling({small,large,slack})` 순수 오라클. `ratio ≤ linearRatio × slack`(기본 2), **`small.ms=0`은 fail-closed**(`unmeasurable`) — 0으로 나눠 Infinity를 만들거나 "빠르니 통과"로 읽으면 분해능 아래로 내려간 순간 이 축이 조용히 꺼진다. 오라클을 `lib/`가 소유하는 것도 계약이다(`.test.js`가 export하면 소비 경로가 test 실행 부수효과에 묶인다).
- `plugins/mccp/scripts/lib/codex-reachability.js` — `classify({env, invokeResult, registryProbe})` 도달 가능성 오라클. **precedence는 env policy > classification**: `MCCP_CODEX_DISABLED=1`이면 `invokeResult`가 무엇이든 `{reachable:false, kind:'env-policy'}`다(env가 켜졌다는 것은 companion이 spawn되지 않았다는 뜻이고, 그 판정은 하위 계층의 정직성과 무관하게 성립해야 한다). 표 밖 classification은 **도달 성공으로 읽지 않는다**(fail-closed → `transport`).
- `plugins/mccp/scripts/receipt/store.js` `quarantineReceipt()` + `isWithinReceiptsDir()` — 승인된 격리 helper와 그 봉쇄 술어. 술어를 따로 export하는 이유는 stub 관측만으로는 `realpath` 로직 버그가 잡히지 않기 때문이다. 봉쇄는 `path.resolve` → `path.relative`(세그먼트 단위 `..` 검사) → **가장 가까운 실재 조상의 `realpathSync`** 재검사이며, source·destination **양쪽**에 적용한다. suffix는 helper **경계에서** 검증한다 — 호출부 검증은 helper 검증을 대체하지 못한다.
- test: `lib/tests/{suite-determinism,perf-scaling,codex-reachability}.test.js` · `receipt/tests/store-quarantine.test.js` (신규 29건) + 기존 파일에 5건. 부정 케이스를 **스위트 안**에 둔 것이 설계다 — bash 스니펫에만 두면 `node --test` 게이트 밖이라 "자동 탐지"가 "문서화된 의도"로 약해진다.

### Changed
- `plugins/mccp/scripts/derive/tests/perf-budget.test.js` — 절대 `elapsed < 1000ms`를 **자기 정규화 스케일링 비**로 대체. 옛 단언은 derive의 비용과 **머신 경합**을 함께 재서, 코드가 한 줄도 안 바뀌어도 부하가 높으면 발화했다. 3배 부하 실측이 그것을 확인한다 — **옛 단언 3/3 실패, 새 단언 3/3 통과**이면서 주입된 O(n²)는 여전히 기각(ratio 45.29 > 20). 이 쌍이 함께 있어야 "완화가 아니라 대체"가 증명된다. 주입 스위치 `MCCP_PERF_INJECT_QUADRATIC`의 소비 지점은 **이 파일의 `runDerive` 헬퍼 한 곳뿐**이며 production `derive/`로 새지 않았음을 역방향 grep이 검사한다. 비율 축이 못 보는 상수 배수 폭증에는 경합보다 한참 위의 느슨한 절대 상한(30s)을 **별개 축**으로 뒀다.
- `plugins/mccp/scripts/lib/tests/a3-instruction-cost.test.js` — `measureA3()` 5개 호출부에 명시 fixture `repoRoot` 전달. 미전달 시 `a3-instruction-cost.js:477`이 `process.cwd()`의 **라이브** `.claude/state/STATE.md`를 읽는다(세션 hook이 갱신하는 가변 파일). A/B: repoRoot 없이 7943B(cwd=repo) vs 111B(cwd=fixture) → 명시 후 111B/111B로 불변. temp CLAUDE.md도 fixture 안으로 옮겼다 — 전수 병렬 실행 중 저장소 트리에 파일을 쓰는 것 자체가 제거 대상 간섭이다.
- `plugins/mccp/scripts/hooks/session-start.js` — fail-open 계약을 **원인과 무관하게** 강제. 이 hook은 `main().catch(… exitCode = 0)`로 "어떤 실패에도 exit 0"을 선언하지만, **module-scope throw는 그 catch가 구조적으로 못 잡는다** — 실측된 divergence(`exit 1` + stderr 완전 공백)와 형태가 일치한다. module-scope require를 `safeRequire`로 감싸고 `uncaughtException`/`unhandledRejection`/`exit` 3중 가드를 건다(hook 진입점일 때만 등록 — module로 require될 때 남의 프로세스 종료 코드를 건드리지 않는다). **강제는 조용하지 않다**: 고정 marker `FAIL-OPEN-FORCED`를 stderr에 남기고 `runSessionStart`가 그것을 파싱해, 정상 경로 test 6건이 marker **부재**를 단언한다 — 프로덕션에서는 막히지 않고 테스트에서는 그 사건이 계속 보인다(종료 코드 하나에 두 요구를 싣지 않는다).
- `plugins/mccp/scripts/lib/plan-codex-runner.js` — `:248`의 직접 `fs.renameSync`를 store helper 위임으로 교체. helper는 throw하지 않으므로 **반환값을 반드시 검사**한다(무시하면 격리 실패가 조용히 지나가면서 lint는 통과하는 fail-open drift). `{ok:false}`면 기존 FATAL stderr 메시지를 그대로 낸다. `fs.renameSync(` 호출부 **2 → 1**(남는 1건은 marker atomic write).
- `plugins/mccp/scripts/lib/msw-metrics/b2-coverage-gate.js` — `MUTATION_ENTRYPOINTS`에 `store.js#quarantineReceipt` **1행 추가만**(diff `+1/-0`). 승인 writer 면제가 파일 단위(`:324`)라 store에 들어간 새 mutating 함수는 축 A·B 어느 쪽으로도 스캔되지 않는다 — 레지스트리 등록이 그 면제를 책임지게 하는 유일한 보완 통제다. `APPROVED_WRITERS` · `APPROVED_PREFIXES` · `WRITE_CALL_RE` · `ANY_WRITE_CALL_RE`는 **무변경**(가드 미약화의 기계적 증거).
- `plugins/mccp/scripts/lib/tests/codex-companion-smoke.test.js` — `shouldSkip()`을 도달 가능성 오라클로 대체. 이전 판정은 `MCCP_CODEX_DISABLED` 축을 **보지 않아** companion이 호출된 적조차 없는데 "JSON 계약이 non-JSON으로 드리프트했다"고 보고했다. A/B: `real codex --json contract appears to be non-JSON` → `env-policy: MCCP_CODEX_DISABLED=1 — codex-invoke short-circuits before spawn`. 도달 **성공 후** 계약 드리프트 skip은 사유가 이미 참이므로 현행 유지.
- `plugins/mccp/.claude-plugin/plugin.json` `1.23.7 → 1.23.11` + renderer footer 2면. plan은 `1.23.8`을 적었으나 그 사이 `origin/main`이 1.23.8을 발행했고 미머지 worktree 2개(`codex-intent-context`·`v1.24.0-multi-session-m5`)가 이미 1.23.9를 선언했다 — §3.7 forward-only + 3자 충돌 회피로 두 칸 상향. 같은 축의 **6번째 실측 재발**이다.

## [1.23.10] — 2026-08-14

**multi-session-work-loop M5 — 상태 진실원 이전 (단일 milestone → patch bump)** — 세션 간 진실의 원천을 **되돌릴 수 없는 요약 문서(STATE.md)에서 질의 가능한 append-only 저널로 옮기고**, STATE.md를 그 저널의 **파생 투영물**로 강등한다. GROUND 결과 PRD가 적은 것보다 한 칸 나빴다: `state-writer.update()`는 read-modify-write 전체 덮어쓰기이고 락은 실패 시 **경고만 남기고 그대로 쓴다**(last-writer-wins) — 저널이 없으므로 덮어쓴 내용에는 **복구 경로가 존재하지 않았다**. 게다가 M5가 의존하는 A4의 producer는 프로덕션에서 아티팩트를 **한 건도** 남긴 적이 없었다(`*.handoff-items.json` = main + worktree 6개 전체 0건). 원인은 CL-5 경로 결함의 **4번째 재발**이며 M4의 수정 주석이 같은 `try` 블록 8줄 위에 있었다.

보증 범위는 정확히 다섯이며 그 이상을 주장하지 않는다 — **G1** 정상 모드의 모든 상태 변형이 손실 없이 append됨(degraded 구간은 제외이며 그 제외가 마커·loud stderr·`journal verify` 비영점 exit 세 곳에 동시에 드러남) · **G2** 닫힌 작업 단위는 지연·재생 기록으로 되살아나지 않음(저널이 유실된 뒤에도 — genesis 부트스트랩이 git-tracked `completion-ledger`에서 tombstone을 재수집) · **G3** STATE.md 소비 계약 불변(렌더 **byte-identical** · `mergeState`/`renderState` 재구현 0) · **G4** 이력이 질의 가능하고 압축이 투영을 손상시키지 않음 · **G5** A4 분자가 경계 스코프로 파생됨. **G5의 `computed` 전환은 미확인이다** — 배포(`claude plugin update`) + 새 세션 1회가 필요하고 이 사이클은 수행하지 않았으므로, §G5 조건성이 사전 고정한 미달 처리를 그대로 밟는다(`computed` 주장 금지 · `measurement-instrumentation.md` A4 행 `forward-only` 유지 · PRD M5 status를 순정 `complete`로 적지 않음).

### Added
- `plugins/mccp/scripts/lib/state-journal/{record,order,project,retention,index,single-writer-lint}.js` — 레코드 스키마(bounded allowlist + `content_hash`) · 재생 방어 판정 오라클(순수, 부작용 0) · 투영 reduce(`fs`/`child_process`/`net`/`os` import 0) · 보존 정책 · facade · 5축 정적 lint.
- `plugins/mccp/scripts/state/journal-store.js` — `O_APPEND` append · malformed per-line 격리 + 카운트 · 원자 tmp+rename checkpoint · genesis 부트스트랩 · `completion-ledger` tombstone seed.
- `plugins/mccp/scripts/lib/msw-metrics/a4-boundary-restore.js` + `derive/sources/session-journal.js` — A4 분자를 저널 `prev_session_id` 경계에서 파생. self-credit이 **구조적으로 불가능**하다(경계는 `prev !== cur`일 때만 성립).
- `state/cli.js journal query|verify|checkpoint [--reseed]` — `verify`는 5축(content_hash 전수 · malformed 라인 · degraded 마커 · 투영↔디스크 일치 · ledger seed 무결성)이며 하나라도 실패하면 비영점 exit.
- 회귀 **67건** + `docs/multi-session-work-loop/m5-assertion-manifest.json`(단언 ↔ test 제목 기계 대조, absent 0 강제).

### Changed
- `state-writer.js` — `update()`가 저널 append → 재투영 경유로 재배선. **공개 시그니처·렌더 바이트 불변.** `recordChainProgress`도 같은 임계구역(`applyLocked`)을 거치게 해 `writeStateAtomic` 호출부가 저장소 전체에서 **하나**가 됐다(lint 축 1이 그 사실을 검사).
- `hooks/session-{start,end}.js` — CL-5 4번째 재발 수정 **3곳**(열거·기록·복원). `resolveHandoffRoot`를 거치므로 `projectRoot=''`가 cwd 상대로 접히는 구멍(M3·M4 수정에도 잠재)이 닫혔고, 해소 실패는 마커 + msw-event **2채널**로 셀 수 있게 남는다.
- `docs/ENVIRONMENT.md` §11 — 신규 토글 **정확히 1개** `MCCP_STATE_JOURNAL=enforce|shadow|off` 등재(운영 계약 4축: 수동 전용 · 프로세스 수명 · **마커 > 토글** · `shadow`는 쓰기 경로만 되돌림).

### Fixed
- **`completion-ledger` 엔트리 스키마 오독** — 최초 구현이 top-level `decision_id`를 읽어 실측 32건 전부가 `corrupt`로 계상됐다(실제 스키마는 `{schema_version, entry:{…}}`). 조용히 0건을 seed했다면 G2가 성립한다고 오독됐을 자리이며, **DD11이 요구한 corrupt 카운터가 이 결함을 드러냈다**. 수정 후 27개 distinct 작업 단위가 seed된다.
- **`created_at` 재파생** — 재투영이 매번 replay 시각으로 `created_at`을 덮어써 "이 상태가 처음 만들어진 시각"이 호출마다 미래로 밀렸다. 레코드의 `ts`를 결정론적 앵커로 고정(기존 회귀 `read-modify-write preserves unspecified fields`가 검출).
- **`work_unit` 한 칸 밀림** — 해석이 기존 frontmatter만 읽어 작업 단위를 바꾸는 바로 그 변형이 *이전* 단위로 기록됐다. patch를 frontmatter보다 먼저 본다.
- **lint 인자 추출이 CL-5 형태를 통과** — 순진한 `\(([^)]*)`가 `fn(process.cwd())`의 첫 `)`에서 끊겨 잡아야 할 형태 바로 그것을 놓쳤다. 괄호 균형 스캔으로 교체.

### Fixed (PR-Codex R1 — 첫 cross-model 발화가 잡은 실결함 3건)

이 milestone은 Plan-Codex·Implement-Codex가 `MCCP_CODEX_DISABLED=1`로 미발화했고 L2 패널은 11라운드 divergent라 **cross-model 검증을 한 번도 받지 못한 채** ship 직전까지 왔다(plan 잔여 8이 예고한 상태). `/mccp:pr`에서 env를 해제해 PR-Codex를 실제로 발화시키자 첫 라운드에 HIGH 3건이 나왔고, 셋 다 실결함으로 확인돼 **override 없이 수정**했다. 공통 형태가 같다 — 단위 test가 *강등 분기*나 *작은 입력*만 시험해 통과했고 **프로덕션 경로·권위 경로는 한 번도 확인되지 않았다**.

- **C1 — 프로덕션 레코드가 안정적인 session epoch을 받지 못했다.** `state-writer`가 `ledgerRead` 없이 `journalApply`를 불러 `resolveIdentity`가 언제나 `ts-fallback`으로 떨어졌다 → `session_epoch`이 세션의 `created_at`이 아니라 **그 update의 write 시각**. 판정 ③(같은 seq는 큰 epoch 승리)이 사실상 "나중에 append한 쪽이 승리"가 되어 **되살아난 오래된 세션이 늦게 쓰면 이긴다** — UI5가 M5의 차단 요구사항으로 건 재생 방어가 그 지점에서 뒤집혔다. 기본값을 실제 `session-ledger.readLedger`로 두고(세션당 per-process 메모) test만 주입하게 바꿨다. 회귀는 프로덕션 형태로 단언한다.
- **C2 — 손상 레코드가 투영을 구동했다.** 해시 검증이 `journal verify`에만 있어, 파싱되는 손상·변조 레코드가 **투영을 구동한 뒤에야** 보고됐다(DD6.3이 명시한 격리가 비어 있었다). 이제 `readRecords`가 read 경로에서 격리하고 `verify`는 그 격리 목록을 읽는다(걸러진 `records`를 재검하면 언제나 0건이라 검사가 무력해진다). **checkpoint는 격리로 해소되지 않으므로**(투영의 base 그 자체 — 버리면 STATE.md가 통째로 리셋된다) 해시 불일치 시 degraded로 강등하고, 부트스트랩이 손상 checkpoint를 *부재*로 착각해 새 genesis로 덮어쓰던 경로(증거 인멸)도 함께 닫았다.
- **C3 — 큰 patch가 조용히 잘리거나 버려졌다.** patch 문자열 8192자 절단 + 라인 16KiB 초과 시 `patch: null` 치환. enforce 모드에서 투영이 권위이므로 **`update()`가 성공을 반환하면서** `chain_progress`·`next_chunk`를 잃는 경로였다(G1·UI4 동시 위반). patch 절단을 전면 제거하고, 표현 불가능한 경우는 절단이 아니라 **append 실패 → degraded**로 처리한다. 그 구간에서 값은 STATE.md 직접 경로가 온전히 보존한다. 식별자성 스칼라의 256자 상한은 유지(절단이 의미를 바꾸지 않는 축).

회귀 7건 추가(`state-journal-integrity.test.js`) — 전부 프로덕션/권위 경로 형태이며, 되돌리면 실패한다.

### Fixed (최종 라운드 — 리뷰 가능성 blocker) · Known-open (audited override로 ship)

shipping HEAD에 대한 최종 PR-Codex 라운드가 4건을 반환했다(CRITICAL 1 · HIGH 2 · MEDIUM 1). 운영자 결정으로 **`MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE` audited override로 ship**하며, receipt는 실제 `divergent` verdict를 **재작성하지 않고 그대로 봉인**한다(cross-gate dedupe fail-closed 유지 → 다음 `/mccp:pr`에서 PR-Codex 재발화).

**즉시 수정한 것 (MEDIUM, 리뷰 가능성 blocker)** — `order.js`·`index.js`·`a4-boundary-restore.js`에 **리터럴 NUL 바이트**가 들어가 git이 세 파일을 **바이너리로 취급**했다(`git diff --numstat` = `-  -`). 순서 오라클·facade·A4 지표, 즉 리뷰어가 가장 봐야 할 세 파일이 diff에서 보이지 않는 상태였다. 6자 이스케이프로 치환해 소스는 순수 ASCII 텍스트, 런타임 구분자는 그대로 U+0000이다(치환 후 단언). 로직 변경 0.

**미해소 3건 — backlog 이관** (`.claude/plans/codex-findings-backlog.md`, 2026-08-14): ① **CRITICAL** `kind=tombstone`을 쓰는 **프로덕션 writer가 없다** → G2의 tombstone 축이 사실상 test 전용이며, 잔여 1b가 적은 것보다 한 칸 더 나쁘다(저널 수명 *안*의 방어도 decision-slug 축에만 성립) ② **HIGH** A4가 투영이 거부한 레코드(`admit-superseded`/`admit-post-tombstone`, 감사 목적 잔존)를 경계로 계상 → UI9 위반 가능 ③ **HIGH** `journal verify`가 `baseIndex` 없이 재투영해 production과 다른 오라클로 판정.

### Fixed (PR-Codex R3 — CRITICAL: 작업 단위가 바뀌면 옛 patch가 새 상태를 덮어썼다)

R2 흡수 후 3라운드에서 **CRITICAL** 1건. 실측 재현했다: `taskFingerprint`를 바꿔 `A#1 → A#2 → B#1` 순으로 쓰면 STATE.md가 `B#1`이 아니라 **`A#2`** 를 렌더한다 — 최신 write가 더 오래된 것에게 덮인다. 작업 단위가 바뀔 때마다 발생하므로 예외가 아니라 정상 사용 경로다.

원인은 **plan의 두 조항이 서로 모순된 것**이다 — I6은 "`seq`는 work_unit별로 1부터", Task 3은 "`records.filter(admit).sort(by seq).reduce(...)`". seq가 work_unit별인데 전역으로 정렬하면 새 단위의 `seq:1`이 이전 단위의 `seq:2` 앞으로 밀린다. 구현이 후자를 충실히 따랐고, 회귀가 단일 work_unit만 써서 모순을 드러내지 못했다.

**판정(admission) 순서와 재생(replay) 순서를 분리**했다: 판정은 그대로 work_unit별 인덱스를 쓰고, 재생은 **append 순서**(파일 순서 — `O_APPEND`가 보장하는 실제 직렬화 순서)로 접는다. 지연 레코드도 파일 순서대로 처리하면 그 시점 high-water와 대조돼 정확히 `admit-superseded`로 떨어지므로 G2는 무손상이다. 회귀 2건 추가(작업 단위 전환 · 3개 단위 교차). 누적 회귀 **79건**.

### Fixed (PR-Codex R2 — 병합 트리 재발화가 잡은 실결함 2건)

R1 흡수 후 `origin/main`(#131)을 병합한 최종 트리로 PR-Codex를 **다시** 돌렸다. R1의 3건은 재발하지 않았고 **새 축 2건**이 나왔다. 둘 다 실결함이라 역시 override 없이 수정했다. R1과 같은 형태의 사각이 다시 확인된다 — 회귀가 *산출물*(상태)만 대조하고 *메커니즘*(순서 메타·자동 발화)은 대조하지 않았다.

- **D1 (HIGH) — 압축이 재생 방어에 필요한 순서 인덱스를 버렸다.** `compact()`가 상태와 전역 `through_seq`만 봉인하고 활성 세그먼트를 회전시켰는데, 투영 입력은 활성 세그먼트만 읽는다 → 압축 직후 admission 인덱스가 **빈 상태로 시작**한다. 압축 이전 시점의 stale writer가 옛 `(work_unit, seq)`를 append하면 high-water도 tombstone도 없어 그대로 `admit`되어 **닫힌 상태가 되살아난다 — G2가 압축 한 번에 무력해진다.** checkpoint에 `order_index`(work_unit별 high-water + 경계 seq 점유자 + tombstone)를 싣고 `buildOrderIndex`가 그것을 먼저 복원하도록 했다. 회전된 세그먼트의 journal-only tombstone도 살아남는다.
- **D2 (MEDIUM) — 보존 정책이 export만 되고 한 번도 발화하지 않았다.** `enforceLimits`의 호출부가 **0개**여서 256KB 활성 세그먼트 상한·90일 압축 트리거·64MB 경고가 정상 사용에서 전혀 동작하지 않았다(plan Task 5가 명시한 "상한 초과 시 자동 발화" 축이 통째로 비어 있었다). write 경로에 배선했고, 호출자가 읽은 레코드를 재사용해 hot path 이중 read를 피한다. 압축 실패는 강등이 아니라 loud warn이다 — append는 이미 성공했고 저널은 온전하다.

회귀 3건 추가(압축 후 지연 레코드 거부 · 회전된 tombstone 유효 · CLI 없이 write 경로만으로 상한 발화). 누적 회귀 **77건**.

### Security
- 사전 `security-reviewer` 실발화 — findings **7건**(CRITICAL 0 · HIGH 3 · MEDIUM 3 · LOW 1) 전건 트리아지. 신규 축 2건 흡수: **프로토타입 오염**(`JSON.parse`가 `__proto__`를 own 속성으로 만들고 `Object.assign` source로 쓰이면 `Object.prototype` setter가 발동 — allowlist 키별 대입 + `sanitizePatch`로 차단, 저널 라인·ledger 엔트리 양쪽 회귀 fixture) · **seq 충돌 잔여 정밀화**(락 fail-open 구간의 동시 append는 결정론적으로 해소되나 **진 쪽의 patch는 투영되지 않는다** — 레코드는 잔존·질의 가능. 즉 그 구간은 "손실 없음"이 아니라 "손실이 기록으로 남음"). 구현 불변식 3건: checkpoint rename **이후에만** 세그먼트 회전(부분 압축 tail 유실 차단) · `--reseed`가 폐기 범위를 새 genesis에 봉인(파괴를 막지는 않되 이력에 남김) · malformed 라인 > 0에서 `verify` 비영점 exit(truncation 은폐 차단). 1건은 사실 오류로 기각(`verify`가 투영↔디스크 일치를 이미 검사), DEFER 0건.
## [1.23.9] — 2026-08-10

**codex-intent-context M1.5 — 오심(mislabelling) 탐지 (patch — 단일 milestone ship, §3.7)** — M1(1.23.4)은 **누락**을 닫았다: 모든 Codex finding이 명시 판정을 받지 않으면 receipt가 써지지 않는다. 그러나 저자가 모든 finding을 `intent_conflict:'none'`으로 찍으면 커버리지 검사는 전부 통과하므로 M1은 **오심**을 막지 못했고 PRD 1차 지표(UI10)는 동어반복으로 남았다. M1.5는 리뷰어에게 per-finding `INTENT:` 계약을 부과하고 리뷰어 주장과 저자 판정을 **비대칭 대조**한다. 상세 계약은 CLAUDE.md §3.13.

> **버전 주의(§3.7 forward-only)**: plan은 `1.23.5`를 가정했으나 main이 그 사이 `1.23.8`(diverse-agent-review M4)까지 진행해 `1.23.9`로 상향했다. 같은 축의 **7번째 재발**이며, 이 사이클에서만 `1.23.8` → `1.23.9`로 한 번 더 밀렸다(main 기준 rebase 시점). §3.7의 pre-PR version freshness check 자동화 근거가 계속 누적된다. 같은 커밋에서 **중복된 `## [1.23.4]` 헤딩 1건을 제거**했다 — PR #118이 이미 발행한 항목을 다음 세션이 "누락분"으로 오인해 다시 추가한 것으로, main에 있는 항목이 정본이다.

### Added
- `plugins/mccp/scripts/lib/intent-claims.js` — 리뷰어 주장 파서 + 비대칭 대조 순수 오라클(fs/process/clock 없음). finding의 `title`+`body`+`recommendation`을 **하나의 텍스트**로 이어붙여 라인 선두 앵커 `INTENT:`를 스캔하고, 매칭이 **정확히 1건이 아니면** `unclaimed`로 접는다. 인용 구조 5종(백틱/틸드 fence · **4칼럼 이상** 들여쓰기 · blockquote · HTML `<pre>`/`<code>`/`<blockquote>`)은 스캔 **전에** 제거된다 — 들여쓰기는 문자가 아니라 **칼럼**으로 재므로(탭 = 다음 4칼럼 탭스톱) 공백+탭 혼합 선두도 코드로 걸러진다. 대조는 DD3 6분류(`agree-none`/`agree-conflict`/`id-mismatch`/`reviewer-only`/`author-only`/`unclaimed`)이며 blocking 규칙은 단 하나다 — "리뷰어가 지목한 id를 저자가 지목하지 않았다".
- `docs/codex-intent-context/reviewer-contract-compliance.md` — Task 0 실측 기록(하네스·회차별 raw·4축 결과·결정 근거·한계·재현 입력 전문). 하니스는 세션 scratchpad에만 존재하므로 fixture 표와 focus 원문을 문서 안에 적어 재건이 전사(transcription)로 끝나게 했다.

### Changed
- `plugins/mccp/scripts/lib/intent-context.js` — verdict 2종 추가(`inconclusive` · `mislabel_unresolved`, PASS 집합은 **불변**) · `intent_dispute_reason` 계약(기존 strict `validateReason` 재사용 — 1-token은 **부재로 취급**) · `decideIntentGate`가 신규 `comparison` 옵션을 M1 규칙 **전부 통과 후** 소비 · `deriveIntentGateDecision`에 `advisoryActive` **별개 입력** · `isIntentChainAllowed`의 warn 분기(`classifyIntentMeta` **앞**에 배치 — 뒤에 두면 영영 도달 불가) · `parseMislabelMode` + 명명 상수 `DEFAULT_MISLABEL_MODE`.
- `plugins/mccp/scripts/lib/codex-invoke.js` — `INTENT_MISLABEL_CONTRACT` 문단을 **조건부**로만 부착(`opts.mislabelContract === true`). reference 블록 **뒤에** 놓아 계약 본문의 "위 reference 블록" 지시가 실제로 성립하게 했다. 미요청 시 focus는 v1.23.4와 **byte-identical**.
- `plugins/mccp/scripts/lib/plan-codex-runner.js` — 순서가 불변식이다: ⓪ mode를 **Codex 호출보다 먼저** 해석 → ① 메모리 payload에서 claims 파싱(지역 변수) → ② awaiting에 투영(**출력 전용**) → ③ adjudication 대기 → ④ **①의 지역 변수**로 대조. awaiting을 다시 읽는 코드는 추가하지 않았다.
- `plugins/mccp/scripts/receipt/schema.js` · `write.js` — present-only **6필드**(`intent_mislabel_mode` · `intent_reviewer_contract` · `intent_claim_counts` · `intent_claims_digest` · `intent_mislabel_disputes` · `intent_mislabel_audit`). `makeSkeleton` 미포함 — §3.12 tracked ship corpus의 `receipt_hash` 무손상. `intent_claim_counts`는 **닫힌 키 집합 + 분할 불변식**으로 검증하고, audit 배열 상한은 `ADJUDICATION_LIMITS.ITEMS`(1000)와 같아 **truncation 분기가 존재하지 않는다**(조용한 절삭은 감사 표면을 무력화하므로 선택지가 아니다). 그 위에 **집계 ↔ 증거 ↔ verdict 대조**를 얹었다 — 분할 불변식은 `reviewer_only`를 `author_only`로 옮기는 편집을 그대로 통과시키므로, 분류별 tally 일치 · audit 삭제 금지 · dispute 수 일치 · 계약값의 counts 파생 가능성 · verdict 함의(`preserved`⇒full ∧ 미해소 0 / `inconclusive`⇒non-full / `mislabel_unresolved`⇒미해소 ≥1)를 schema가 검증한다. **위조 방지가 아니라**(파일 전체를 다시 쓰면 모순 없는 거짓을 쓸 수 있다) *증거를 남긴 채 결론만 바꾼* receipt와 producer drift를 닫는 것이다. 같은 축으로 `intent_gate_force_override_reason`은 override가 실제 적용됐을 때만 봉인된다(§3.13.1).
- `plugins/mccp/scripts/receipt/validate-cmd.js` — blocking intent verdict별 **개별 복구 문구**. 이전에는 어떤 verdict든 M1 문구 하나("모든 finding에 명시 판정")만 내보내, 실제 문제가 *리뷰어 불응*일 때 운영자를 엉뚱한 파일로 보냈다.
- `plugins/mccp/commands/plan.md` — 5.5a에 `intent_dispute_reason` 행 + `reviewer_claim` 대조 지시, 5.4a verdict 분기에 신규 2종 복구 지시.
- `plugins/mccp/.claude-plugin/plugin.json` `1.23.8 → 1.23.9` + renderer footer(html/markdown) 동기(§3.7 5면). i18n 단언 2건은 main이 plugin.json 파생으로 전환해 리터럴 편집이 불필요해졌다.

### Notes — 이 milestone이 달성하지 **않은** 것

- **오심을 *교정*하지 않는다.** 저자 라벨을 **반증 가능(falsifiable)** 하게 만들 뿐이다. 양쪽이 모두 `none`이면 여전히 아무것도 탐지되지 않는다 — 다만 그 `none`이 한 당사자의 무검증 라벨이 아니라 독립된 두 당사자의 합의다.
- **강제되는 명제는 "오심 0"이 아니라 "기록 없는 수용 0"**이며, 그것도 `enforce`에 한한다. `warn`으로 내리면 차단이 없어 저자가 무시하고 진행할 수 있다.
- **기본값 `enforce`는 실측값이지만 표본이 좁다.** Task 0(리뷰어 계약 준수율 production-경로 실측)을 2026-08-13에 수행했다 — 10회, finding 50건 전부 유효 주장, 리뷰 단위 `full` 도달률 **100%**, 심어둔 충돌 40/40 정확 지목, 날조 0건, `inconclusive` 오탐 0건. 사전 선언 규칙(≥95%)이 `DEFAULT_MISLABEL_MODE = 'enforce'`를 정했고 PRD Milestone 1.5가 `complete`로 올라간다. 정지 규칙의 두 조건(5회 만장일치 종료 · 경계 10%p 이내 10회 연장)이 이 결과에서 충돌하므로 **연장을 실제로 수행**해 해소했다 — 6~10회차에서 하나라도 non-`full`이 나왔다면 90%로 떨어져 `warn`이 유지됐을 것이다. 다만 그 10회는 **단일 fixture 반복**이며 각 결정이 제약 하나씩만 위반하는 쉬운 표본이다 — 실제 plan에서 준수가 떨어지면 비용은 `inconclusive` 차단으로 즉시 나타나고, 그때의 복구는 임계 하향이 아니라 `MCCP_INTENT_MISLABEL=warn` + 실제 plan 재측정이다. 한계 전체는 `docs/codex-intent-context/reviewer-contract-compliance.md`.
- **쿼터 메시지의 복구 시각은 확정 시각이 아니었다.** 2026-08-09 차단 시 companion이 "try again at Aug 16th"를 반환했으나 실제로는 2026-08-13에 이미 가용했다. 같은 형태로 막히면 인용된 시각을 기다리기 전에 1-token probe로 재확인하는 편이 싸다.
- `intent_dispute_reason`은 새로운 고무도장 통로가 될 수 있다 — M1의 `intent_override_reason`과 동형이며, 부정하지 않는다. 남용은 `intent_mislabel_disputes` 비율로 관측되고, 그 비율이 높으면 그것이 곧 M2(심판 분리)의 근거다.
- Plan-Codex · Implement-Codex 모두 `MCCP_CODEX_DISABLED=1`로 **미발화**했다. santa-loop R1~R3(Opus + GPT-5.4)이 22건을 흡수했으나 **cap 이후 수정분(#19~#22 + A 채택 3건)은 어느 리뷰어의 검증도 받지 않았다** — 이는 Codex 승인이 아니다.
## [1.23.8] — 2026-08-09

**diverse-agent-review M4 — 통과 경로 실증 + 지표 부채 상환 (patch)** — M1은 계기를 배송했지만 **한 번도 눈금을 읽지 못했다**. 저장소 receipt 40개 중 `review_verdict`를 가진 것은 0건이었고, 원인은 우연이 아니라 구조였다: wall-clock stamp가 `5.6b`의 receipt write 안에만 있고 차단된 실행은 그 앞에서 HALT하므로 **오래 걸린 실행일수록 기록될 확률이 낮았다**(survivorship bias가 계기에 내장). 게다가 plan 게이트 receipt는 `.gitignore:31`상 worktree-only라 §3.8 cleanup마다 소멸한다.

### 축 A — 측정 표면을 옮긴다 (`.claude/reviews/`, git-tracked)

- **`lib/plan-review/record.js` CREATE** — `REVIEW_DIR` 아티팩트에서 리뷰 기록 markdown 전체를 결정적으로 생성하는 순수 오라클. M1의 5.2h 포맷(제목·Verdict·Quorum·Layers·Findings 표·Refutation 표)을 그대로 재현하되 fenced ```json `## Measurement` 블록을 추가한다 — `{verdict, source, layers, quorum, wall_clock_ms, halt_stage, granted, reviewed_plan_hash, plan_path, recorded_at}`. **결손 내성이 설계 요구**다: 차단은 5.2 어느 단계에서든 일어나므로 `l2`/`decision`이 없는 조합이 정상 입력이고, 없는 축은 `null`로 적고 `halt_stage`가 어디서 멈췄는지 말한다. **측정 불가는 `null`이지 `0`이 아니다** — 0은 "게이트가 즉시 끝났다"는 거짓 측정이고, M1 수치를 못 쓰게 만든 침묵의 0과 같은 부류다.
- **`cli.js record` 서브커맨드** — 아티팩트를 읽어 `.claude/reviews/plan-review-<slug>.md`를 쓰고 **항상 exit 0**. 다른 모든 서브커맨드는 "이 plan을 승인해도 되는가"에 답하므로 미상 입력이 차단이어야 하지만, 이것은 "무슨 일이 있었는가"에 답한다 — 게이트를 막을 수 있는 계측은 처음 오작동하는 순간 삭제되는 계측이다. 대신 모든 degradation은 loud stderr([[feedback-loud-fail-open]]): exit 0은 "막지 않았다"이지 "다 괜찮았다"가 아니다. slug는 파일 경로에 이어붙므로 repo-내부 출처여도 sanitize한다(`../../etc/passwd` → `etc-passwd`).
- **`commands/plan.md` 5.2 전 HALT를 계측 경유로** — 이전에 5.2h에 도달하는 차단 경로는 **판정 계열뿐**(5.2a exit 1 → 5.2e, 5.2e `DECIDE_EXIT=12`)이었고 **인프라 계열**(5.2b 예약 거부 · 5.2c emit/pin 실패 · 5.2d reconcile 아티팩트 판독 실패 · 5.2e proof 추출 실패 · 5.2f `mode.json` 판독 실패 · 5.2g proof 검증 실패)은 5.2h 이전에 exit해 측정치가 어디에도 남지 않았다. 이제 **9곳 전부** 각 stop 블록 직전 1행 호출이 들어간다. 동시에 5.2h의 **손으로 타이핑하던 markdown이 같은 CLI 호출 1행으로 대체**된다 — 순증 배선이 아니라 치환이고, 결과적으로 이 층의 지시문은 줄어든다.
  - *자기 리뷰 흡수*: 초안은 5.2d·5.2f 두 stop을 빠뜨린 채 heading이 "every stop"이라 단언했다. 둘 다 **패널이 발화한 뒤**의 stop이라 정확히 이 축이 되찾겠다던 느린 표본이고, 단언이 배선보다 넓으면 이 milestone의 주제 자체가 무너진다. 이제 stage enum(plan.md heading · `cli.js` usage)이 닫힌 9개 집합이고, heading이 "새 stop을 추가하면 여기도 추가하라"고 명시한다.

### 축 A 보강 — 계측이 스스로에 대해서도 정직하게

- **`cell()`이 백슬래시를 파이프보다 먼저 이스케이프한다**(`record.js`) — 파이프만 이스케이프하면 `a\|b`가 `a\\|b`가 되어 마크다운이 백슬래시 1개 + **살아있는 구분자**로 렌더하고 행이 쪼개진다. 이스케이프를 논하는 바로 그 입력에서 깨지는 형태였다. evidence 인용에 Windows 경로·정규식이 들어오므로 이론적 경계가 아니다.
- **`--review-dir`도 `resolveContained`를 거친다**(`cli.js record`) — 이 파일의 다른 모든 경로 인자가 지키는 규약에서 유일하게 면제돼 있었다. 위반은 **차단하지 않는다**(exit 0 계약 유지): 읽기를 거부하고, 모든 축을 absent로 적고, `### Recording degradations`에 사유를 남긴다. 기본 디렉토리로 조용히 fallback하는 것이 최악이다 — 호출자가 지목하지 않은 실행을 기록하게 된다.

### 축 B — 발화 불가였던 budget 게이트를 살린다

`workflows/plan-review.js:132`가 `input.minRemaining`을 읽고 `:155`가 그것으로 발화를 막는데, 유일한 producer인 `cli.js` payload에 그 키가 **없어서** 값은 항상 0이었고 `budget.remaining() < 0`은 구조적으로 도달 불가였다. 게이트가 실행될 수 없는 소스로 한 milestone을 보냈다.

- **`lib/plan-review/budget.js` CREATE** — `parsePanelBudget`(`MCCP_PLAN_REVIEW_BUDGET`, default 150000, 비정상 → default + loud warn) + `panelMinRemaining`. `plan-fanout/budget.js`의 `parseFanoutMinPerAgent`를 미러한다(라이브 패널이 초안의 `parseRolesMin` 인용을 정정했다 — 그것은 `"MofN"` 문자열 파서다). **fail-open 방향이 유의미하다**: 읽을 수 없는 값은 default로 가고 **절대 0으로 가지 않는다**. 0은 게이트를 완화하는 게 아니라 꺼버린다.
- `cli.js`가 **fleet을 `--granted`로 상한한 뒤** `minRemaining`을 emit한다(순서가 유의미 — 예약이 2를 줬는데 4인분 예산을 요구하면 감당 가능한 패널을 건너뛴다). workflow의 budget skip 반환은 실측 `remaining`/`minRemaining`을 실어 "예산 부족"과 "패널 크래시"를 구분 가능하게 한다.
- **`decide`가 skip을 skip이라고 말한다** — *자기 리뷰 흡수*. 초안은 위 숫자를 반환값에만 실었고 소비처가 `record.js`뿐이었다. `cmdDecide`는 `results:[]`만 보고 `decideQuorum` → `responded:0` → **"L2 fired but no reviewer responded usably"**를 발행했다. 오라클은 주어진 입력에 대해 옳았고 세계에 대해 거짓이었다 — 패널은 발화하지 않았다. 게다가 5.2e stop은 그 문구와 함께 복구 경로 3개(codex 강등 · 새 세션 · agent cap 상향)를 출력하는데 **어느 것도 토큰 부족을 못 고친다**. 이 결함이 이제 중요한 이유는 M4가 이 분기를 도달 불가에서 **도달 가능**으로 바꿨기 때문이다. 이제 `cmdDecide`가 `skipped===true`를 먼저 분기해 사유와 관측 `remaining`/`minRemaining`, 그리고 **실제로 듣는 복구 축**(턴 예산 상향 · `MCCP_PLAN_REVIEW_BUDGET` 하향 · `MCCP_PLAN_REVIEW=codex`)을 reason에 싣는다. verdict는 불변(`unavailable`, fail-closed) — 넓힌 것이 아니라 **사유만 참으로** 만들었다. skip은 L1 실패와 마찬가지로 plan 해시 없이 판정 가능하므로 DD13 `--plan` 요구보다 앞에 둔다. plan.md 5.2e는 이제 generic 목록을 **덮어쓰지 말고** `reason`을 그대로 출력하라고 지시한다.

### 축 C — 검증을 실측으로 대체한다

라이브 패널이 이 축의 초안을 반려한 사유가 정확히 **검증 공허함**이었다(`node --check`는 문법만 보는데 acceptance는 런타임 동작을 요구 · 기존 emit test에 `minRemaining` 단언 0건). UI5에 따라 **수정 전 실패를 먼저 실측**했다 — 신규 단언 5건이 fix 전 fail, 후 전량 green(23/23).

- `plan-review-workflow-port.test.js`가 budget 분기를 **실행**한다. 분기가 top-level script body라 `extractFunction`으로 못 뽑으므로 ESM `export` 키워드만 제거하고 스크립트 전체를 `AsyncFunction`으로 돌린다 — `args`/`budget`/`log`/`phase`/`parallel`/`agent`를 Workflow 런타임과 같은 모양의 sandbox global로 주입. `budget.total` 미설정 시 무발화(기존 동작)를 함께 고정한다.
- `plan-review-record.test.js` CREATE(통과·늦은 차단·이른 차단 3경로 + 표 파괴 방어 + slug 탈출 방어), `plan-review-budget.test.js` CREATE(경계값 전수).
- `commands/plan.md`의 PRD Artifact Output 템플릿 `## Acceptance`에 **라이브 완주 항목**을 추가한다(UI11). M1의 shipped plan은 소급 편집하지 않는다 — `plan_hash`로 봉인된 이력이고 지나간 milestone의 acceptance를 고쳐도 앞으로에는 아무 힘이 없다. 전방으로 작용하는 자리는 템플릿이다.

> **Task 5(패널 통과 경로 라이브 완주)는 미달로 기록한다.** 플러그인 캐시가 `1.23.4`까지만 있어 M1의 패널 경로와 `review-*` agent 4종이 런타임에 존재하지 않는다. `claude plugin update` 후 **새 세션**이 선행 조건이며(agent 레지스트리는 세션 시작 시 구축), 그 전까지 통과 경로는 관측되지 않았다. UI3에 따라 미산출을 달성으로 적지 않는다.

버전 `1.23.7 → 1.23.8`(§3.7 patch · 병렬 브랜치 충돌 6번째 재발 — main이 1.23.6(gate-guard-integrity M1)·1.23.7(MSW M4)을 선점해 두 칸 상향. PRD 미완료, milestone #5·#1.5·#2·#3 pending).

## [1.23.7] — 2026-08-09

**multi-session-work-loop M4 — 예산 감축 (단일 milestone → patch bump)** — 작업이 시작되기도 전에 소진되는 컨텍스트(A3)를 절반으로 줄이고, 토글 축(B3)의 분모를 정직하게 만든다. GROUND 결과 PRD가 적은 상황보다 나빴다: **두 축 모두 측정 기판이 죽어 있었다.** A3는 `spawn('python3')` 하드코딩이 이 플랫폼에서 WindowsApps 스텁으로 풀려 항상 `baseline-unavailable`이었고, 그마저 `computeMetrics`가 `measureA3`를 **호출조차 하지 않았다**(import 후 재export만). B3는 `session-start.js`가 스냅샷 경로를 cwd 기준으로 풀어 M2 이후 `*.env-snapshot.json`이 **단 한 건도** 기록되지 않았고, 빈 corpus 위에서 `computed 0%`를 내보내고 있었다.

보증 범위는 정확히 셋이며 그 이상을 주장하지 않는다 — **G1** A3 전후 값이 동일 방법으로 재현 가능하게 측정됨 · **G2** 감축이 삭제가 아니라 이전임이 기계 검증됨 · **G3** B3 분모가 정직해지고 그 정직화가 감축으로 위장되지 않음. **"옮긴 뒤에도 지시 준수율이 유지되는가"는 측정하지 못한다** — PRD가 M4에 건 B1·C1 회귀 검사는 두 지표의 producer가 없어 산출 불가이며, 이 미충족은 숨기지 않고 기록한다. 토글 **은퇴는 0건**이다(사용 이력이 0이면 "이력 0인 것만 은퇴"가 96개 전부를 대상으로 만들어 무의미하므로 M8 이후로 이연).

### Added
- `plugins/mccp/scripts/lib/msw-metrics/cli.js` — A3 baseline 아티팩트 emitter. `a3 --emit`(BEFORE · 기존 파일 덮어쓰기 거부)·`--emit-after`(감축 후 값을 같은 문서의 `after`로 기록)·`--print`. 커밋 아티팩트에는 user-level `MEMORY.md`의 content digest를 **절대 담지 않는다**(security S5 — repo 밖 파일을 git 이력에 지문화하고, fresh clone에서 재현 불가라 G1과 모순).
- `docs/multi-session-work-loop/a3-baseline.json` — 재현 가능한 A3 전후 측정 아티팩트(성분별 bytes·sha256·tokens · tokenizer{tool,encoding,version,version_source} · git HEAD · 방법 caveat).
- `docs/multi-session-work-loop/instruction-contract.md` — 최소 지시 계약(PRD Open Question 직접 응답). RESIDENT 3중 AND 기준을 **먼저** 명문화하고 CLAUDE.md 25개 절 전수를 분류(resident 15 · on-demand 10 · retire 0). **분류 ≠ 이전**을 규칙으로 못박아, 준수를 측정할 수 없는 동안 §3 행동 규칙은 분류만 하고 옮기지 않는다.
- `plugins/mccp/scripts/lib/instruction-contract/{ledger.js,lint.js}` — ledger 순수 파서 + 4중 reachability 검사(C1 목적지 존재 · C2 anchor 존재 · C3 상주 포인터 · C4 무목적지 소실 0), fail-closed. C4는 명세보다 강하게 **목적지 있는 on-demand 또는 retire만** 사라질 수 있게 한다(목적지 없는 on-demand의 소멸은 이전이 아니라 삭제다). 문서가 공급하는 `dest_file`은 열기 **전에** 어휘 검사(절대·`..`·UNC·드라이브 거부) 후 realpath 봉쇄(security S3).
- `docs/milestone-ledger.md` — CLAUDE.md §1.4 milestone 이력 전문 이전 목적지.
- `plugins/mccp/scripts/derive/sources/instruction-cost.js` — A3 derive 소스. **커밋 아티팩트를 읽을 뿐 tokenizer를 절대 돌리지 않는다**(derive는 매 render trigger마다 ~1s 예산). CLAUDE.md를 재해시해 stale이면 `insufficient`로 강등 — 낡은 값을 현재값으로 내놓지 않는다.

### Changed
- `plugins/mccp/scripts/lib/msw-metrics/a3-instruction-cost.js` — `python3` 하드코딩을 인터프리터 probe로 교체(`python3`→`python`→`py -3`, **exit code + stdout 마커**로 판정해 "Python was not found" 스텁을 구조적으로 배제 · `shell:false` 명시). `execSync('pip show tiktoken')` 제거 — tokenizer 버전을 **`enc.encode`를 실행한 그 프로세스 안에서** 취득한다(다른 pip을 볼 수 있어 "버전 pin으로 재현성 확보" 조항이 실제로는 지켜지지 않았다). STATE.md 성분이 **frontmatter가 아니라 실제 주입 블록**을 재도록 교정. `findMemoryFiles`가 symlink를 건너뛰고 realpath 봉쇄(security S4).
- `CLAUDE.md` **167,832 → 87,528바이트(-47.8%)** — §1.4 milestone 이력 → `docs/milestone-ledger.md`, §4 운영 토글 산문 → `docs/ENVIRONMENT.md` §11. 두 절 모두 헤딩과 포인터는 제자리에 남는다(이전이지 삭제가 아니다). **§3 행동 규칙은 한 줄도 바뀌지 않았다.** 분모는 ship 직전 base인 `origin/main`(`280b9ef`)이다 — 착수 base(`7fe48d9`, 159,013B) 기준으로는 79,971B/-49.7%였고, 그 사이 main이 §3.13 신설 등으로 CLAUDE.md에 8,819B를 더했다(§3.13·§3.7 하위절은 상주로 승계, 신규 토글 2개는 §11로 함께 이전).
- `docs/ENVIRONMENT.md` — §11 "운영 토글 레퍼런스 (canonical)"로 CLAUDE.md §4 흡수. PRD Evidence가 지목한 파일 간 중복 해소이며, 파일 **내부** 중복(§1~§7의 옛 서술)은 잔여로 명시.
- `plugins/mccp/scripts/state/toggle-snapshot.js` — 명명된 제외 분류표 `TOGGLE_EXCLUSIONS`(shell-local 1 · browser-global 3 · dynamic-key-prefix 2 · test-only 4, 항목마다 file:line 근거). `*.test.js` 파일 제외(설계 규칙은 요구했으나 디렉토리만 걸러 왔다). `scanSurfaceDetailed`가 제외 **전/후 두 분모**를 함께 낸다(106 → 96 · 구현 시점 104 → 94였고 rebase로 승계한 main의 신규 토글 2개가 분모에 들어왔다). 상대 `stateDir`에 loud warn. 초안의 "하네스 내부 변수" 제외 후보 3건은 set·read 양쪽이라 **철회**하고 기록으로 남김.
- `plugins/mccp/scripts/derive/sources/toggle-usage.js` — 자체 스캐너를 폐기하고 `toggle-snapshot`으로 통일(두 구현의 `*.test.js` 제외 여부가 서로 달랐다). `operation_branch_count`를 **분모 표면 위에서** 계산(203) — 분자 위에서 세면 토글을 은퇴시켜도 값이 안 변해 반-조작 병기 목적을 달성하지 못한다. `snapshot_corpus_present` 신설.
- `plugins/mccp/scripts/lib/msw-metrics/index.js` — `computeA3` 신설 + `computeMetrics` 배선 + `METRIC_IDS`에 A3 추가. `computeB3`의 `operation_branch_count > 100 → invalid` 규칙 **제거**(measurement-design.md에 없는 절대 임계이며, 분기를 올바로 세면 199라 정확히 계산했다는 이유로 invalid가 된다) → 계약이 규정한 fold 탐지는 직전 주기 쌍이 없어 `forward-only`로 정직 표기. 빈 corpus는 `computed 0%`가 아니라 `forward-only`.
- `plugins/mccp/scripts/hooks/session-start.js` — `writeSnapshot`에 repoRoot 기반 `stateDir` 전달(**CL-5와 동일 결함**이 같은 `try` 블록 12줄 아래에서 재발한 것). M8이 쓸 사용 이력 축적의 시계를 지금 시작시킨다.
- `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js` — `METRICS_ORDER`에 A3 추가 + `METRICS_META.A3` 신설. **C2·C3 라벨 오배정 정정**(둘 다 A3의 정의를 담고 있어 A3가 `computed`가 되는 순간 대시보드가 "게이트 헛발화율 = 산출됨"을 표시하게 된다). 같은 결함군인 **B1·C1 라벨도 정정**. 값 셀은 지표 정의 그대로의 단일 수치를 유지하고 병기 수치(A3 감축률 · B3 제외 전/후 분모 · 분기 수)는 `<details>` collapse로.
- `docs/multi-session-work-loop/measurement-design.md` — §B3 제외 분류표 본문화(규칙상 이름을 적을 때만 유효). §A3 tokenizer 버전 기록 출처를 명시 **개정**(분모·산출식·무결성 검사는 불변 — 바뀐 것은 버전 문자열의 출처뿐).
- `plugins/mccp/scripts/derive/cli.js` · `lib/msw-metrics/fixture.js` · `lib/tests/msw-metrics-acceptance.test.js` — claimed-computable에 **A3 명시 승격**(silent promotion을 막는 목록이므로 편집이 정식 경로). B3는 유지하되 **live는 corpus가 쌓일 때까지 forward-only**임을 기록.
- `plugins/mccp/.claude-plugin/plugin.json` `1.23.1 → 1.23.7` + renderer footer 2면 동기. 브랜치 base는 `1.23.1`이지만 착수 이후 `origin/main`이 `1.23.2`(PR #117)·`1.23.3`·`1.23.4`(PR #118 codex-intent-context M1)·`1.23.5`(PR #120 diverse-agent-review M1)를 모두 소비했으므로 §3.7 forward-only reconcile로 **네 칸 상향**한다 — plan이 적은 `1.23.2`를 그대로 쓰면 CHANGELOG에 같은 버전 항목이 둘 생기고 매니페스트가 후퇴한다. 이 재조정은 같은 브랜치에서 **두 번** 더 발생했다(PR #118 머지 후 `1.23.4` 선점 → `1.23.5`, PR #120 머지 후 `1.23.5` 선점 → `1.23.6`) — 같은 축의 **5번째 실측 재발**이며, 병렬 브랜치가 같은 base에서 버전을 선언하는 한 구조적으로 반복된다.
- `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` — footer version 단언을 리터럴 pin에서 **`plugin.json` 파생**으로 교체. §3.7이 열거하는 "동기 대상 5면" 중 이 테스트 2건은 bump마다 손으로 고쳐야 하는 항목이었는데, 그러면 drift를 잡는 가드가 아니라 bump 자체에서 실패하는 장애물이 된다. main이 도입한 footer 줄 anchor(plan 파생 milestone 라벨 오매칭 회피)는 그대로 유지한다.

### Notes — santa-loop round 1 흡수 (dual-review)

Reviewer A(Opus)는 G1·G2·G3를 모두 PASS로 통과시켰고, **Reviewer B(codex GPT-5.4)만** 세 보증 각각에서 실제 구멍을 찾았다. 지적 6건 중 5건을 확인해 흡수하고 1건은 실측으로 반증했다. (Reviewer A가 올린 critical 6건 중 5건은 선재 실패의 오귀속이었다 — `origin/main` 트리에서 같은 테스트가 이름·개수까지 동일하게 실패함을 대조로 확인했다.)

- `msw-metrics/cli.js` — `--force`가 봉인된 baseline을 **흔적 없이** 덮어썼다. 덮어쓰기 거부 가드의 목적("비교 대상이 조용히 바뀌면 감축 주장이 반증 불가능해진다")을 플래그 하나가 되돌리고 있었다. 재봉인 경로는 유지하되 교체 대상의 정체를 `reseal_history`에 누적 기록하고, **읽을 수 없는 이전 기록 위로는 재봉인을 거부**한다. 순수 함수 `buildResealHistory`로 분리해 tokenizer 없이도 회귀 검증된다.
- `instruction-contract/lint.js` C4 — **신뢰할 수 있는 "감축 전 헤딩 집합"이 없었다.** 구현이 ledger 행만 순회해, CLAUDE.md와 ledger **양쪽에서 동시에** 지워진 절은 순회할 행 자체가 없어 조용히 통과했다 — G2가 금지한다고 선언한 바로 그 손실이다. strict pass를 추가해 before 집합을 git(`a3-baseline.json`이 pin한 커밋 — 감축률과 증명이 같은 anchor를 공유)에서 가져와 `before − after ⊆ ledger(retire ∪ 목적지 있는 on-demand)`를 강제한다. before-ref를 못 구하면 **fail-closed**이며, `--allow-missing-before`로만 약한 검사로 내려가고 그 사실이 출력·stats(`c4_strict`)에 남는다.
- `instruction-contract/lint.js` C3 — 포인터 검사가 `resident_pointer`가 **있을 때만** 돌아, 열을 비우면 검사가 사라졌다. 목적지를 선언한 행은 포인터가 **필수**가 되고, 포인터가 그 목적지를 실제로 지목하는지도 함께 본다.
- `state/toggle-snapshot.js` — 제외 목록이 JS 하드코딩이고 규범 문서(`measurement-design.md` §B3)를 읽는 코드가 없었다. 문서가 "집행부는 `TOGGLE_EXCLUSIONS`이며 이 표와 1:1"이라 선언만 하고 아무도 대조하지 않아, **코드만 고쳐도 분모가 바뀌는** 상태였다(G3의 "이름을 적을 때만 유효"가 기계 장치가 아니었다). `crossCheckExclusions`가 양방향 drift와 class 불일치를 잡고, 표를 못 읽는 것도 drift로 친다("검사 불가"가 "검사 통과"로 읽히지 않도록).
- `derive/sources/toggle-usage.js` — `snapshot_files_read++`가 `JSON.parse` **앞**에 있어 전부 손상된 corpus가 `snapshot_corpus_present=true`로 통과했고, B3가 그 위에서 자신 있게 `computed 0%`를 냈다. 바로 위 주석이 막는다고 설명하는 그 패턴이다. 존재 판정을 **파싱 성공** 기준으로 바꾸고, 파일은 있는데 하나도 파싱 안 되면 `degraded`로 표면화한다.
- **반증 1건**: "입력 부재 시 가짜 0 baseline을 봉인한다"는 지적은 CLAUDE.md 없는 디렉토리에서 emitter를 실제로 돌려 반증했다 — `refusing to write artifact: status=baseline-unavailable`로 거부하고 아티팩트를 만들지 않는다.
- `a3-instruction-cost.js` — `MCCP_A3_READ_USER_MEMORY` 판정이 truthy라 `=0`이 opt-in을 **켜고** 있었다. 문서가 적은 `=1` 계약대로 `1`/`true`/`yes`/`on`만 수용한다.
- `CHANGELOG.md` — `## [1.23.4]` 헤딩이 둘이었다(같은 ship에 대해 PR #118이 하나, 후속 `be88e5c`가 파일 최상단만 보고 하나 더). 이 PR이 만든 것은 아니나 §3.7의 "헤딩 중복 = CHANGELOG 깨짐"이라 하나로 병합했다 — 어느 쪽도 상대를 포함하지 않아(파일 목록 vs santa-loop 회고) 승자를 고르지 않고 양쪽 Notes를 모두 보존했다.

### Notes — santa-loop round 2 흡수

Reviewer A(Opus)는 이번엔 baseline 대조를 지정받아 11개 기준 전부 PASS·critical 0을 냈고, **Reviewer B(codex)만** 다시 4건을 올렸다. 3건 흡수, 1건 반증, 1건은 운영자 판단으로 backlog.

- `instruction-contract/lint.js` C3 — round 1의 강화가 여전히 **문서 전체 substring**이었다. `docs/ENVIRONMENT.md`는 CLAUDE.md에 2번 나오므로 §4가 자기 포인터를 통째로 잃어도 §1.4 쪽 언급 때문에 통과했다(실측 재현). 이제 각 행의 **자기 섹션 본문**(heading부터 동급 이상 다음 heading까지)만 검색하고, routed 행이 heading stub조차 잃으면 그 자체로 실패한다 — 포인터가 "다른 어딘가"에서 발견되는 것은 그 섹션에서의 귀로가 아니다.
- `derive/sources/toggle-usage.js` — round 1이 만든 제외표 대조가 **계산만 되고 버려지고 있었다.** test 하나만 빨개질 뿐 런타임 분모는 그대로 나갔고, 그 test를 지우면 신호가 사라진다. drift를 분모를 내는 자리에서 `degraded`로 전파하고, `--scan-denominator`도 제외 전/후를 함께 내며 drift 시 **비영점 exit**한다.
- `msw-metrics/a3-instruction-cost.js` — CLAUDE.md 부재가 fail-closed이긴 했으나 **TypeError가 계약을 대신하고** 있었다(round 1에서 이 경로를 "반증"으로 판정한 근거가 그 크래시였다). 누군가 그 성분을 방어적으로 초기화하는 순간 조용히 0-토큰 baseline 봉인으로 뒤집히므로, 요구사항을 명시 거부로 적었다.
- **반증 유지**: "가짜 0 baseline을 봉인할 수 있다"는 결론은 CLAUDE.md 없는 트리 + STATE.md만 있는 트리 두 경우 모두에서 재현되지 않았다(artifact 미생성).
- **backlog 이연**: tracked plan의 홈 절대경로. repo 전역 관례(main archived plan 약 30개)이고 비밀이 아니며, 고치면 receipt `plan_hash`가 stale해져 게이트가 본 적 없는 본문에 재봉인해야 한다 — 운영자가 되돌리기를 선택했고 신규 유입 차단 + 일괄 sweep으로 이연했다.

신규 test 5건(섹션 범위 C3 2 · drift 전파 1 · 명시 거부 1 · routed stub 1). round 1의 healthy fixture는 "routed 행의 heading이 사라진" 모양이었는데 이는 실제 repo(routed=2, removed=0)와 다르고 정확히 이번에 닫은 구멍이라, fixture를 실제 관례에 맞췄다.
### Notes — santa-loop round 4 흡수 (렌더 층 평탄화)

Reviewer A는 PASS(critical 0, 되돌림 검사까지 수행), **Reviewer B만** 3건을 올렸다. 그중 하나가 이 사이클에서 가장 중요한 발견이다.

- **렌더 층이 `invalid`을 숨기고 있었다 (다섯 번째 재발).** `renderMswMetrics`가 `computed` 지표가 하나도 없으면 섹션 전체를 `null`로 반환한다 — exclusion drift로 B3가, 아티팩트 손상으로 A3가 `invalid`가 되면 대시보드는 실패를 보여주는 대신 **아무것도 보여주지 않는다**. round 4가 지표 층에서 없앤 confidently-wrong 평탄화가 한 층 밖에서 그대로 부활한 것이다. 게다가 `msw-metrics-render.test.js`가 **`status:'invalid'`인 B3가 null로 렌더되는 것을 명시 단언**해 그 동작을 고정하고 있었다(이 저장소가 반복해서 겪은 "test가 버그를 정답으로 고정"). 이제 `!hasComputed && !hasInvalid`일 때만 숨긴다 — baseline 미형성(insufficient/forward-only)은 조용히 넘어가되 **무결성 위반은 반드시 표면화**한다. test는 둘로 갈라 각각을 단언한다.
- **evidence가 형식만 통과하면 됐다.** `x.js` 같은 값도 정규식을 만족했다. 실재 검증을 추가했는데 처음엔 오탐 8건이 났다 — 문서 관례가 repo-root가 아니라 `plugins/mccp/scripts/` 상대였다. 기준 경로 후보(repo-root · scripts · plugin)를 모두 시도해 실 repo는 `ok=true`, 조작한 경로는 정확히 1건만 검출된다. glob은 디렉토리로 검증한다.
- **A3 freshness 범위를 공개한다.** 분자는 3성분인데 repo에서 검증 가능한 것은 `claude_md` 하나뿐이다(STATE.md는 세션 휘발성, memory digest는 미커밋 — S5). 이는 의도된 한계이므로 로직은 유지하고, `freshness_scope`와 `numerator_components`를 지표가 함께 발행해 "현재 점유율"이 무엇에 대해 신선한지 읽는 쪽이 알 수 있게 했다. 넣지 않으면 매 세션 stale이 되어 지표가 무용해진다.

신규 test 3건(누적 29건).

### Notes — santa-loop round 5 흡수 (여섯 번째 층, 그리고 사슬의 끝)

- **라이브 대시보드에 metrics 섹션이 아예 없었다.** A3를 대시보드에 처음 올린 milestone이 정작 그 섹션이 사라진 대시보드를 만들고 있었다. main 병합으로 CLAUDE.md가 바뀌어 A3 아티팩트가 stale → `insufficient`가 됐는데, round 4의 게이트는 `invalid`만 살리고 `insufficient`는 그대로 숨겼다. 실측: `A3 insufficient(stale) · B3 forward-only → 섹션 NULL · verdict muted`. **"측정된 적 있으나 낡음"과 "측정된 적 없음"은 다른 사실**이고, 전자는 실행 가능한 지시(`--emit-after` 재실행)다. 지표가 `stale`을 실어 나르고 · 섹션이 stale이면 렌더하고 · verdict가 해결 방법까지 amber로 표시하도록 세 층에서 갈랐다.
- **headline verdict가 `metrics`를 한 번도 읽지 않았다.** `computeVerdict`는 `sources`·`warnings`만 본다. M4가 만든 두 `invalid` 경로는 source에 `degraded`를 함께 세워 둔 덕에 이미 도달하고 있었지만(실측: 둘 다 amber), **source는 멀쩡한데 metric만 invalid**한 경우(A1의 unit-spike·timestamp-inversion — 선재 경로)는 침묵했다. 지목된 두 경로만이 아니라 그 모양 전체를 닫았다. degraded source가 있으면 더 구체적인 그쪽 메시지가 이기고, `forward-only`/`computed`는 건드리지 않는다.

**감축률 42.2%로 하락 (두 번째 base 이동).** santa-loop 진행 중 main이 PR #120을 머지했고 이 브랜치가 병합했다. after는 `280b9ef`(25,644 토큰) → `b1fe03f`(**26,377**)로 이동해 감축률이 43.8% → **42.2%**가 됐다(CLAUDE.md 성분 45.25%). **before는 두 차례 모두 `7fe48d9`/45,646 토큰에 봉인 유지** — 분모를 바꿔 수치를 지키는 대신 분자가 커진 사실을 보고한다. 목표 50% 미달 폭이 커진 원인은 M4가 아니라 병렬 ship이 상시 지시문을 다시 늘리고 있다는 것이며, **이 현상 자체가 M4가 측정하려던 대상**이다.

신규 test 3건(누적 35건).

### Notes — santa-loop round 5b (C3 세 번째 지적 수용)

Reviewer B가 세 라운드 연속 같은 지점을 지적했다: **C3가 substring만 본다.** round 4에서 섹션 범위로 좁혔지만 그 안에서는 여전히 substring이라, 무관한 문장이나 같은 경로를 담은 코드 샘플이 검사를 만족시켰다. 이번엔 판단을 접고 **읽는 사람이 따라갈 수 있는 형태** — 목적지를 target으로 갖는 markdown 링크 — 를 요구한다. 링크 텍스트는 경로가 아니어도 된다(따라갈 수 있게 만드는 것은 target이다). fixture 4곳이 산문 포인터를 쓰고 있어 실제 관례에 맞췄고, "산문은 실패 / 링크는 통과"를 양방향 test로 고정했다.

같은 라운드의 나머지 2건은 새 결함이 아니다 — headline/title consumer 지적은 리뷰어가 직전 커밋 이전 트리를 읽은 것이고(현재 MD H1·HTML title 양쪽 모두 `지표 무효`를 싣는다, 실측 확인), plan 절대경로는 운영자가 되돌리기 + backlog로 이미 결정한 항목이다(3회째 재지적).

## [1.23.6] — 2026-08-09

**Gate guard integrity M1 — fail-open이어야 할 자리가 아니었던 가드 3개 복원 (patch — bug fix/axis close)** — 세 가드가 서로 다른 파일·서로 다른 원인으로 무력화돼 있었고, 셋 다 "fail-closed여야 할 자리가 fail-open"이라는 같은 형태였다. green을 만드는 것이 아니라 **신호를 복원**하는 것이 목적이므로 어떤 테스트도 skip/삭제/완화하지 않았다. 세 가드 모두 수정 전 코드에서 신규 테스트가 실제로 red임을 A/B로 확인했다(비공허성).

- **G1 — hook fail-open 무력화**: `receipt-prompt.js`·`receipt-skill.js`의 `receipt-mode`·`extract-plan-path` **4곳**이 무방비 top-level `require`였다. 로드 실패가 `main()`이 존재하기도 전에 module scope에서 프로세스를 죽여, 파일 스스로 명문화한 fail-open 불변식(*"A buggy gate is worse than no gate"*)이 **한 번도 실행되지 못했다**. PRD는 `extract-plan-path` 2곳만 지목했으나 실측상 4곳. 게다가 기존 테스트는 broken-root fixture에 `receipt-mode.js`를 **일부러 복사해 넣어** 결함이 발화하지 못하게 막고 있었다(green 유지용 우회). 방어 IIFE + export shape 검사로 감싸고, 실패를 **null fallback이 아니라** 기존 G1 경로(`g1Allow` — systemMessage + exit 0)로 라우팅한다. `extract-plan-path`를 null로 떨어뜨리면 `--plan`이 **조용히** 사라져 아래 G2의 실패 모드를 hook 안에 재생산하기 때문이다.
- **G2 — staleness 강제 부재**: `pr.md`의 validate callsite 2곳이 `--plan`을 넘기지 않아 validator가 plan을 **재해싱하지 않았고**, 그래서 `stale`이 발화할 수 없었다 — 게이트 이후 plan이 바뀌어도 무통과. 두 callsite의 효력은 **서로 다르다**: `2.5.9` ship-gate read-back은 Phase 2 DISCOVER 이후라 plan 경로가 실재하고 aggregate `ok`로 gate하므로 **실질 복원 locus**이고, Phase 1.6 preflight는 Phase 2 이전이라 slug 파생 경로로 **validator 스코핑만 교정**한다(이 지점은 `blocking`만 읽고 부재 plan은 `stale`로 떨어지므로 오탐 차단 불가 — fail-safe). lint는 **플래그 존재만** 검사해 치환 경로가 비어도 green이므로, lint와 별개로 A/B 재현을 수행했다: 게이트 후 plan에 구조적 변경 → `--plan` 있음 `ok=false`/`stale=2` · 없음 `ok=true`/`stale=0`.
- **G3 — 표준 설치에서 ship proof 위조 분기 도달 불가**: `SKIP_PROOF_META_KEYS`가 ambient `meta.codex_disabled`를 ship proof로 인정했다. 이 저장소는 `codex_disabled`(env 유래 **정직한 주석**)와 `codex_disabled_at_pr`(**명시 PR-step 축**)을 의도적으로 분리해 두었고 — `pr-codex-dedupe.test.js:113-118`이 그 계약을 주석까지 달아 단언한다 — 그 구분을 무너뜨린 쪽이 proof 집합이었다. `MCCP_CODEX_DISABLED=1`이 사용자 `settings.json`에 있는 **표준 설치**에서는 write가 매 receipt에 이 필드를 찍으므로, **증거 없는 skip이 예외 없이 증거를 얻어** F2 위조 탐지 분기가 구조적으로 죽어 있었다.

### Fixed
- `plugins/mccp/scripts/hooks/receipt-prompt.js` / `receipt-skill.js` — 무방비 require 4곳 방어화 + export shape 검사. 실패는 `g1Allow`로 loud 라우팅(조용한 null fallback 금지).
- `plugins/mccp/commands/pr.md` — Phase 1.6(스코핑 교정, slug 파생) · 2.5.9(실 staleness 강제)에 `--plan` forward.
- `plugins/mccp/scripts/lib/pr-ship-gate.js` — `SKIP_PROOF_META_KEYS`에서 `'codex_disabled'` **제거**(`'codex_disabled_at_pr'` 유지). ship proof는 caller가 **주장한 것만** 인정한다.
- `plugins/mccp/scripts/receipt/write.js` — `codex_skip_reason` precedence **반전**: 명시 `--codex-skip-reason` > env canonical(fallback). 기존 동작은 ambient env가 audited 사유를 14자 canonical로 덮어써, `codex_skipped_at_pr=true`가 발동시키는 strict validator(≥30자)에 걸리는 **자기 schema가 거부하는 receipt**를 생산했다 — env가 켜진 환경에서 audited escape 경로가 아예 사용 불가였다. `:236` env-stamp은 **무변경**(관찰 계층인 `codex-runner.js:234-238`의 반대 precedence도 의도적으로 유지 — 관찰자는 env가 canonical, 기록자는 caller 주장을 덮으면 안 된다).
- `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js` — `codex_outcome==='disabled'` 분기 신설(부재였음), `--codex-disabled-at-pr` + canonical `--codex-skip-reason` 명시 forward. **ship-gate 수정과 단일 커밋 불변식**: 이것 없이 proof 제거만 착지하면 운영자의 `MCCP_CODEX_DISABLED` ship 경로가 **조용히** 끊긴다(receipt는 써지고 gate만 막힘). 회귀 테스트가 이 half-landing을 기계적으로 잡는다(실증: fix C만 되돌리면 3건 red).

### Changed
- `plugins/mccp/scripts/hooks/tests/g1-patch.test.js` — fixture의 `receipt-mode.js` **우회 복사 제거** + 모듈별 격리 fixture 신설(실 트리 복사 후 대상 1개만 삭제). **positive control** 포함 — 아무것도 제거하지 않은 fixture가 `ModuleLoadError`를 내지 **않음**을 먼저 단언해, 두 부재 케이스가 우연한 다른 로드 실패로 통과하는 것을 차단한다. 3 → 8 케이스.
- `plugins/mccp/scripts/lib/tests/pr-ship-gate.test.js` — `skipped WITH disabled policy (codex_disabled) → ship` 단언을 **반전**. 이 테스트는 결함을 정답으로 고정하고 있었다(테스트가 버그를 봉인한 4번째 사례).
- `plugins/mccp/scripts/lib/tests/pr-phase-helpers/finalize-receipt.test.js` — `MCCP_CODEX_DISABLED=1`을 **명시적으로 켠 채** unproven skip이 exit 12임을 단언(env 중화 금지 — 결함은 env가 켜져야만 나타나므로 끄면 버그를 통과시킨다) + `outcome='disabled'` ship 경로 + write 프로세스에 env가 **없는** 경우까지. 26 → 31 케이스.
- `plugins/mccp/scripts/receipt/tests/codex-disabled-precedence.test.js` — NEW. precedence 단위 회귀 6건.
- `plugins/mccp/.claude-plugin/plugin.json` `1.23.3 → 1.23.6` + renderer footer(html/markdown) 동기. **forward-only 2회**: plan은 1.23.4를 목표했으나 #118이 main에서 그 번호를 선점해 1.23.5로 올렸고, 그 사이 #120(diverse-agent-review M1)이 머지되며 1.23.5마저 선점해 1.23.6으로 재상향했다. 같은 충돌의 5번째 재발이다(§3.7 — 이미 발행된 번호는 불가침, 미머지 브랜치만 민다).
- `CLAUDE.md` §3.3 / §4 — PR ship proof가 `codex_disabled_at_pr`(명시) 축임을 문서화.

> **미포함 (의도적)**: `plugins/mccp/scripts/receipt/tests/pr-codex-dedupe.test.js`는 **무변경**. plan R1에서 한 리뷰어가 이 테스트를 "버그를 정답으로 고정한 것"으로 지목했으나 검증 결과 그 반대였다 — 이 테스트가 두 축의 **옳은 계약**을 지키고 있고, 무너뜨린 쪽은 proof 집합이었다. 수정 A는 이 테스트를 통과시킨 채 성립한다(diff 0으로 확인).
## [1.23.5] — 2026-08-09

### Reconciled with origin/main (#118 codex-intent-context M1)

#118은 `mccp-plan-codex` receipt의 writer를 `plan-codex-runner.js` 단독으로 좁히고, PRD-모드 plan에 대해 **프로그래매틱 `intentDecision`을 강제**한다(위조 방지를 위해 `--intent-*` CLI 플래그는 의도적으로 0건). panel 경로는 Codex를 호출하지 않아 runner가 존재하지 않으므로, 머지만 하면 **이 milestone의 default mode가 PRD-driven plan에서 receipt를 아예 쓸 수 없었다**.

해소는 새 예외를 발명하지 않고 **main 자신의 DD1(free-form) carve-out을 미러링**한다. `write.js#stampIntentDecision`이 `resolution.review_source === 'multi-agent'`를 보고 `intent_gate_verdict='skipped'` + 신규 proof `intent_skip_proof='codex_not_invoked'`를 stamp한다. 이것이 판단이 아니라 **기계적 사실**인 이유: review triple은 all-or-nothing(DD11)이고, proof는 구조 검증을 통과했으며, `multi-agent`와 `codex_verdict`를 동시에 담은 receipt는 이미 거부된다 — 따라서 "Codex가 발화하지 않았다"는 봉인 대상 receipt 자체가 증명한다.

- **경계는 좁게 유지된다.** `hybrid`는 L3 발화 = Codex 발화이므로 carve-out 대상이 아니라 계속 fail-closed(에러 메시지가 그 이유를 명시한다). review 축이 없는 bare write도 그대로 차단된다.
- **dedupe는 무변경.** DD2가 panel 승인을 cross-model 확증에서 이미 배제하므로 이 intent stamp는 PR-Codex skip을 사지 못한다 — 즉 carve-out이 `/mccp:pr`의 안전판을 건드리지 않는다.
- `plan.md`는 writer 소유권을 mode로 분기한다: `mode=codex` → runner(5.2z)가 write, panel → 5.6b가 write. main이 top-level에 둔 placeholder 검사는 **codex 분기 안으로** 옮겼다 — 5.1은 모든 mode에 placeholder를 붙이지만 그것을 교체하는 5.3은 codex 전용이라, 그대로 두면 default mode가 매번 HALT하거나 작성자가 실재하지 않는 Codex 섹션을 지어내게 된다.
- 신규 `plan-review-intent-carveout.test.js`가 carve-out · 경계(hybrid/bare) · DD2 불변 · 두 skip-proof 목록의 lockstep을 고정하고, 변이 검증(carve-out 무력화 → 3/6 실패, enum 되돌림 → 4/6 실패)으로 실효성을 확인했다. 전체 스위트 실패는 `origin/main` 베이스라인 8건과 **정확히 일치**한다(본 브랜치가 만든 회귀 0).

> **알려진 갭 — M1.5.** 패널은 `<user_intent_reference>` 주입을 받지 않고, 자기 findings를 user intent에 대해 adjudicate하지 않는다. panel run에서 intent gate는 **만족된 것이 아니라 skip된 것**이다. backlog에 기록했다.

버전은 §3.7 forward-only로 `1.23.1 → 1.23.5`(main이 1.23.4를 선점). 병렬 브랜치 version 충돌은 이 저장소에서 4번째 재발이다.

**diverse-agent-review M1 — `/mccp:plan` 승인을 cross-model 단일 판정에서 L1+L2 합성 판정으로 (patch)** — `/mccp:plan` 게이트의 승인 발급자를 Codex 단독(호출당 10~15분, 최근 사이클에서 timeout·app-server crash·사용량 초과로 3회 연속 미가용)에서 **L1 mechanical backbone + L2 다관점 refute 패널**로 전환한다. 승인 표면은 `resolution.codex_verdict` 옆에 present-only `review_verdict`/`review_source`/`review_proof` 3필드를 신설하고, 판정을 읽던 소비처는 단일 helper `resolveEffectiveVerdict`로 통일한다(v1.22.5 M1 `receipt-convergence.js` 수술과 동형).

**dual-review는 제거가 아니라 이동이다.** cross-gate dedupe의 skip 술어를 "converged **∧ source ∈ {codex, hybrid}**"로 좁혀 multi-agent 승인이 dedupe를 구조적으로 만족하지 못하게 했다(DD2) — 그 결과 plan 게이트가 패널로 승인돼도 terminal `/mccp:pr`에서 PR-Codex가 **반드시 발화**한다. 반복되는 plan 작성에서 10~15분 대기만 사라지고 cross-model 안전판은 ship 지점에 그대로 남는다.

### Added
- `plugins/mccp/scripts/lib/review-verdict.js` — 승인 판독 SSoT. `resolveEffectiveVerdict(resolution) → {verdict, source, axis, proofFailed}`(우선순위 `review_verdict` > `codex_verdict`) + `isReviewProofStructurallyValid` + `isCrossModelCorroborated`(DD2 술어). **DD11**: `review_*` 중 하나라도 present이면 review 축이 판정을 소유하고 `codex_verdict`로 **fallback하지 않는다** — 부분 stamp가 `source='codex'`로 읽혀 dedupe를 통과하던 유일한 구멍을 닫는다. `dispatch_evidence` 경로 불변식은 POSIX 절대경로·드라이브 문자·UNC·backslash·`..`·비정규 세그먼트를 거부한다(§3.12 `v1.22.4-cwd-rebind` 유출 선례 재발 방지).
- `plugins/mccp/scripts/lib/plan-review/l1-check.js` — L1 mechanical gatekeeper(LLM-free). 검사 C1~C7(필수 섹션·repo-root full 경로·action↔실존·per-task Validate·Source PRD·`path:line` 인용 실존·markdown 구조 정합). **throw하지 않는다** — 내부 실패는 `inconclusive`로 반환돼 "위반을 찾았다"(divergent)와 "검사하지 못했다"(unavailable)가 분리된다. 인용 base는 1-depth 동적 탐색(플랜이 규정한 정적 4개로는 자기 자신의 `verify.js:44-52` 인용을 해결하지 못함이 실측됐다).
- `plugins/mccp/scripts/lib/plan-review/{perspectives,quorum,decide,cli}.js` + `plugins/mccp/scripts/workflows/plan-review.js` + `plugins/mccp/agents/review-{architect,security,test,invariant}.md` — refute-framed 4관점 패널. 승인은 **증거 부재로만** 도출되며(`refutationAttempted` 필수 필드), read-only는 프롬프트가 아니라 frontmatter `tools: [Read, Grep, Glob]` **도구 부재**로 보증한다. quorum은 M(응답 수)과 K(고유 역할 수)를 별 축으로 강제해 한 역할의 중복 응답이 다양성을 위장하지 못하게 한다.
- L3 계측 meta 3필드(`review_l3_invoked`/`review_l3_reason`/`review_wall_clock_ms`) — 전부 `hash.js` carve-out에 **넣지 않았다**(DD6). briefing_*이 carve-out된 이유(봉인 *후* stamp되어 자기 자신을 해시할 수 없음)가 여기엔 적용되지 않으며, 계측을 봉인 밖에 두면 감사 서사를 흔적 없이 바꿀 수 있다.

### Changed
- `receipt/schema.js` — `review_*` present-only 검증 + **DD11 all-or-nothing**(부분 triple은 schema invalid) + 모순 거부(`review_source='multi-agent'` ∧ `codex_verdict` present). 구조 오라클은 Task 1 것을 **재사용**해 write-side와 read-side가 "유효한 proof"에 대해 갈라질 수 없게 했다.
- `receipt/write.js` — `review_*` stamping + 두 hard invariant를 **디스크 도달 전에** 집행: all-or-nothing과 **DD13 bind**(`review_proof.reviewed_plan_hash !== plan_hash` → exit 12). 복구는 재봉인이 아니라 **L2 재실행**임을 stderr가 명시한다(검증 대상이 바뀌었으면 검증 결과는 무효 — v1.22.6 M2가 subject_hash mismatch를 stale이 아니라 tamper로 승격시킨 것과 같은 계열).
- `receipt/dedupe.js` — `codexConverged` → `crossModelConverged`(기존 이름은 별칭 유지). `convergence` 블록이 `review_verdict`/`review_source`를 함께 노출해, multi-agent 승인이 "receipt 누락"이 아니라 "cross-model 미확증"으로 감사에 드러난다.
- `lib/receipt-convergence.js` · `lib/pr-ship-gate.js` · `lib/completion-ledger/{index,store}.js` · `lib/evidence-audit.js` · `derive/sources/receipts.js` — 판정을 helper로 통일. **DD8**: terminal ship은 cross-model 확증을 요구하므로 `converged ∧ source='multi-agent'`는 `multi-agent-unproven-at-terminal`로 no-ship(M1에서는 도달 불가 경로이나 방어적으로 닫음). ledger `VALID_PROVENANCE`에 `multi-agent`/`hybrid` **additive 확장**(미확장 시 `writeEntry`가 신규 엔트리를 거부).
- `commands/plan.md` Phase 5.2 — mode 분기(5.2a L1 → 5.2b 예약 → 5.2c Workflow → 5.2d commit → 5.2e decide → 5.2f L3 → 5.2g verify-proof). **`MCCP_PLAN_REVIEW=codex`는 5.2z로 v1.23.0 경로를 그대로 보존**한다. Workflow 실패는 fan-out과 **의도적으로 반대** — 게이트이므로 조용한 인라인 강등 없이 `decide`가 exit 12로 HALT한다. `--codex-verdict` forward 여부는 오라클의 `forwardCodexVerdict` 불리언 **하나만** 읽으며 셸에서 mode와 L3 결과를 AND하지 않는다(v1.22.3 M3 4라운드 결함 형태 회피).

### Fixed (post-implementation `/mccp:code-review` — 게이트 배선 결함 8건)
구현 검증이 전부 단위 수준이라 **command body ↔ 오라클 seam**이 한 번도 실행되지 않았고, 결함이 전부 그 층에 몰려 있었다. 오라클 자체는 견고했다.
- **default 경로가 완주 불가였다 (3건).** `MCCP_TMP`가 5.2z(codex 경로) 블록 안에서만 정의돼 panel 모드에서는 전 sub-step이 unset 변수로 파일을 읽고 썼다 · Bash 블록 간 셸 상태가 보존되지 않아(5.2c의 `Workflow` 툴 호출이 블록을 강제 분리) `$RES_ID`·`$REVIEW_VERDICT`·`$REVIEW_SOURCE`·`$FORWARD_CODEX`·`$REVIEW_STARTED_AT`가 소비 시점에 전부 비어 있었다 — 특히 5.6에서 review triple이 **조용히 미전달**돼 패널이 발급한 승인이 receipt에 한 글자도 남지 않은 채 성공 handoff가 출력됐다 · workflow args payload에 `fleetKeys`가 아예 없어 `workflows/plan-review.js`의 degrade 분기가 **매 실행** 발화, 패널이 영구히 리뷰어 1명이라 quorum을 만족할 수 없었다. → 전 블록이 `REVIEW_DIR`(repo 루트 하위 `.claude/state/plan-review/`)를 재파생하고 필요한 값을 **아티팩트에서 재read**한다(§3.9 shell-state 독립 규칙을 승인 자체에 적용). `emit-workflow-args`가 `fleetKeys`를 emit한다.
- **문서화된 default quorum `3of4`가 실질 `4of4`였다.** `isReviewProofStructurallyValid`가 `perspectives.length === quorum.of`를 요구해, 4명 중 3명이 응답한 정상 통과가 proof 구조 검증에서 탈락 → `resolveEffectiveVerdict`가 `unavailable`로 강등하고 schema가 write를 거부했다. M<N quorum의 존재 이유가 무력화된 상태. → 바인딩을 **관측치**(`responded`)로 옮기고 `responded ∈ [required, of]` · `roles ≤ responded` 경계를 추가. 기존 test는 이 결함을 `perspectives length must equal quorum.of`라는 이름으로 **정답으로 고정**하고 있었다(이 저장소에서 4번째 목격) — 교체했다.
- **worktree에서 evidence 경로가 repo-relative가 아니었다.** `path.relative(cwd, "$(git rev-parse --git-dir)/…")`가 linked worktree에서 `../../.git/worktrees/…`를 내고(git-dir이 working tree 바깥), Windows에서는 backslash가 남았다(`.replace(/\\\\/g,"/")`가 백슬래시 **2개**를 매칭). 둘 다 `isRepoRelativeEvidencePath`가 거부 → 모든 converged proof가 구조 무효, 5.2g가 무조건 HALT. CLAUDE.md §3.8이 worktree를 강제하므로 예외가 아니라 기본 경로였다. → 아티팩트를 repo 루트 하위로 옮기고 evidence를 **리터럴 repo-relative 문자열**로 기록(계산 제거).
- **예약보다 많은 agent를 띄울 수 있었다.** `clampForRunaway`는 headroom이 모자라면 `n: remaining`을 주는데, 5.2b는 `granted==0`에서만 HALT하고 5.2c는 granted와 무관하게 `fleet_keys`(항상 4)로 발화, 5.2d는 `--actual $RES_GRANTED`로 commit했다 — "모든 agent launch는 기록된다" 불변식의 새 구멍. → `emit-workflow-args --granted`가 fleet을 상한하고(테스트 가능한 오라클 안에서), `--actual`은 실제 emit된 `fleet.length`, quorum 미충족 grant는 **spend 전에** exit 12.
- **`hybrid`는 receipt를 쓸 수 없었다 (구조적).** 5.3의 `## Codex Adversarial Review` 주입이 `plan_hash`를 바꾸므로(section 추가는 정규화되지 않음 — 실측) `write.js`의 DD13 bind가 반드시 exit 12. `multi-agent`는 반대로 5.6 Step A가 존재할 수 없는 Codex 섹션을 `grep -q … || exit 1`로 요구했다(또는 LLM이 빈 섹션을 지어내 **일어나지 않은 Codex 리뷰를 주장하는 plan**을 남긴다). → **plan body 동결 불변식**을 명문화: `emit-workflow-args`부터 receipt write까지 plan은 편집 금지, panel 모드는 5.3을 건너뛰고 Step A는 mode-aware로 decision 아티팩트를 검증한다.
- **패널의 findings가 전량 폐기됐다.** `review_proof.perspectives`는 `{perspective, verdict}`만 남기고 claim·evidence는 어디에도 도달하지 않아, 차단당한 작성자가 손에 쥐는 게 없었다. → 신규 5.2h가 `.claude/reviews/plan-review-<slug>.md`에 findings·refutation 표를 쓴다(**plan body가 아니라 sibling 파일** — plan에 쓰면 위 동결 불변식을 깬다).
- **proof가 임계값을 관측치 자리에 기록했다.** `quorum.roles`에 `rolesMin`이 들어가, `ROLES_MIN=2`에서 4개 역할이 응답해도 봉인된 proof는 `roles: 2`를 주장했다 — 증거 기록이 자기 증거를 과소 진술. → 관측 `roles`를 기록하고, `perspectives`를 quorum이 센 것과 **동일 술어**로 필터(느슨한 필터 탓에 malformed 결과가 배열에 섞여 자기정합성이 깨질 수 있었다).
- **작은 fail-open 3건.** `hybrid`의 L3 `ran` 판정이 verdict enum을 검사하지 않아 `verdict:""`(unset 셸 변수를 printf한 결과)를 "L3가 돌았다"로 받았다 · `MCCP_PLAN_REVIEW_ROLES_MIN`이 `of`와 교차 검증되지 않아 K>N인 **통과 불가능한** quorum이 조용히 성립했다 · `--granted 2.5`가 `parseInt`로 조용히 `2`가 됐다(`reconcile --actual`이 이미 닫은 부류). → 각각 enum 교집합 · panel 크기로 clamp + loud warn · digits-only 검증.
- renderer footer(`html.js`/`markdown.js`)를 `v1.23.1`로 동기화(§3.7 — plugin.json만 bump하고 빠뜨린 surface drift).

### Fixed (santa-loop R1 — dual-review 흡수 4건)
`/mccp:santa-loop` 1라운드에서 Claude Opus와 Codex GPT-5.4가 **양쪽 FAIL**. 두 리뷰어가 공통으로 짚은 1건 + 각자만 짚은 3건을 흡수했다(양쪽이 제기한 9건 중 4건은 실코드 대조로 **기각** — 아래 Notes).

- **L2 패널 발화가 기록 불가능했다** (agent cap **under-count**). 5.2c의 `Workflow` 호출이 곧 launch 지점인데 debt marker를 pin하지 않았고, 5.2d의 reconcile은 종료코드를 검사하지 않았다. 컨트롤러가 mid-flight로 죽거나 reconcile이 실패하면 예약이 pending으로 남고 lease가 그것을 "띄운 적 없음"으로 prune한다 — 실제로 뜬 리뷰어 최대 4명이 누적 카운터에서 증발한다. **같은 파일 Phase 2.5.2의 fan-out이 이미 이 창을 닫아 놓았고**(주석에 근거까지 적혀 있다), 신규 경로에 적용되지 않았을 뿐이다. → Workflow 호출 **전** `mark-debt` pin, pin 실패는 **HALT**(fan-out은 인라인으로 강등하지만 게이트는 인라인 등가물이 없다 — 5.2b가 거부된 예약에 대해 이미 정한 철학). reconcile 실패는 HALT하지 않고 경고 후 진행한다(리뷰어는 이미 떴고, pin이 그것을 안전하게 만든다).
- **5.2h가 차단된 결정에서 도달 불가였다.** 1080행은 "divergent/unavailable에도 이 기록을 쓰라"고 지시하지만 5.2e가 먼저 HALT하고 5.2h는 문서상 뒤에 온다 — **차단된 작성자가 근거를 못 본다는, 5.2h가 추가된 바로 그 이유**가 그대로 재생산됐다(직전 `/mccp:code-review` 라운드의 수정이 순서 때문에 무효화된 형태). → 5.2e의 HALT를 "5.2h를 먼저 실행한 뒤" 정지로 바꾸고, 5.2h에 "문서 순서는 실행 순서가 아니다"를 명문화.
- **proof 추출 실패가 묵살됐다** (양쪽 리뷰어 공통 지적). `2>/dev/null || true`가 실패를 삼켰고, 삭제가 write **뒤**에 있어 unlink가 실패하는 경우 이전 라운드의 converged proof가 살아남아 5.6의 `-f` 검사를 통과했다 — 자기 것이 아닌 결정에 봉인된다. → 순서를 뒤집어 `rm -f`를 **먼저**, 추출 실패는 exit 12. 승인 기록이 0인 receipt에 성공을 출력하던 경로(5.6이 이미 한 번 고친 silent-omission 계열)도 함께 닫힌다.
- **non-converged proof가 `dispatch_evidence` 경로 검증을 우회했다** (§3.12 leak). schema가 converged일 때만 구조 불변식을 요구했는데, 그 완화가 **경로 형태까지** 덮었다. 두 불변식은 다른 질문에 답한다 — "승인하기에 충분한가"(verdict 의존) vs "이 문자열을 receipt에 봉인해도 되는가"(**절대 아님**). 승인 축은 read-side 오라클이 leaking proof를 `unavailable`로 강등해 이미 안전했고(테스트가 그렇게 단정한다), **유출 축**에서 divergent verdict가 유일한 무방비 문이었다. → 경로 검증을 verdict와 무관하게 상시 적용, 완화는 quorum·layers 구조에만. 회귀 test는 거부 4종(drive letter·posix 절대·backslash traversal·`..` 세그먼트)과 **과교정 방지**(실패한 quorum을 가진 깨끗한 non-converged proof는 여전히 기록 가능)를 함께 봉인.

### Fixed (santa-loop R2 — codex verdict가 블록 경계를 못 넘고 있었다)
R2에서 Claude Opus가 단일 critical로, R1에서 Codex GPT-5.4가 이미 지적했던 축에 **서로 다른 리뷰어가 두 라운드에 걸쳐 독립 수렴**했다. R1에서는 "선재 결함이므로 backlog 이연"으로 판단했는데, 추적해 보니 **결함이 하나가 아니라 둘**이었고 그중 하나는 본 커밋이 새로 만든 것이었다.

- **`hybrid` 모드가 구조적으로 항상 HALT했다.** 5.2f는 `$CODEX_VERDICT`를 읽어 `l3.json`을 쓰는데, 그 변수는 5.2z에서 설정되고 5.2f는 **문서상 5.2z보다 앞**에 있으며 어차피 별 fenced block이다. 셸 상태는 블록을 넘지 않으므로 실제로 기록되는 값은 `"verdict":""` — 바로 아래 문단이 *'never `"verdict":""`'*라고 금지한 그 값이다. decide의 enum 검사가 이를 "L3 미발화"로 읽어 `hybrid`는 요청해도 언제나 `unavailable`로 착지했다(fail-closed라 위험하지는 않으나 모드 자체가 죽어 있었다).
  - **R2의 수정은 이 결함을 절반만 닫았고, R2 기록은 그것을 과장했다 (santa-loop R3에서 적발 — 정정).** 아티팩트 경유로 바꾼 것은 *산출물의 정직성*(`"verdict":""` → `{"invoked":false}`)이지 hybrid의 동작이 아니었다. hybrid 분기는 5.2a → … → **5.2f** → 5.2e로 **5.2z를 건너뛰므로**, 아티팩트를 *쓰는* 코드가 그 경로에서 한 번도 실행되지 않는다 — 읽기만 아티팩트로 옮겼을 뿐 쓰기 쪽을 확인하지 않은 것이다. hybrid는 여전히 매 실행 `invoked:false` → `unavailable` → HALT였다. R3에서 5.2f를 2단계로 명문화해 닫았다: **Step 1은 5.2z의 wrapper 블록을 실제로 실행**(그 블록 끝에서 아티팩트를 persist)하고 5.3으로 넘어가지 않는다, Step 2가 아티팩트를 읽어 `l3.json`을 쓰며 아티팩트 부재 시 "Codex가 말하지 않기로 한 것"이 아니라 **배선 버그**임을 loud warn한다.
- **`codex` 롤백 경로의 receipt에 `codex_verdict`가 누락됐다 (선재, 그러나 본 milestone의 지정 안전밸브).** 5.6의 `[ -n "${CODEX_VERDICT:-}" ]`가 항상 거짓이라 `--codex-verdict`가 조용히 빠졌다 — Codex가 실제로 발화한 실행인데 receipt는 그 사실을 기록하지 않는다. cross-gate dedupe가 부재에 fail-close하므로 **안전 측**이고 v1.23.0 이전부터 그랬지만(`git show`로 확인), DD7이 이 경로를 "이미 검증된 기존 경로"로 지정해 놓은 이상 그 경로가 거짓 감사 기록을 낳는 상태로 두는 것은 milestone 자체의 전제를 무르게 한다. 이연 판단을 철회하고 흡수했다.
- **수정은 하나다** — 두 결함의 근본 원인이 같기 때문이다: verdict를 셸 변수로 블록 간 운반. 5.2z가 파생 즉시 `$REVIEW_DIR/codex-verdict` 아티팩트로 **persist**하고(Phase 5.4의 `divergent` override도 아티팩트를 재기록), 5.2f와 5.6은 아티팩트에서 **재read**한다. 5.6은 아티팩트 부재 시 기존 셸 변수로 fallback해 추적하지 않은 경로의 회귀를 막는다. 5.2f는 아티팩트가 없으면 빈 verdict를 지어내지 않고 `{"invoked":false}`를 쓴다.
- **그 수정이 새로 만드는 위험도 같은 라운드에서 닫았다.** 아티팩트는 gitignored 디렉토리에 남으므로 이전 실행분이 다음 실행의 receipt에 봉인될 수 있다 — 감사 결함 하나를 다른 것으로 바꾸는 셈이다. Phase 5.2 진입 블록이 per-run 아티팩트 9종을 **선제 purge**한다(각 소비처가 이미 부재에 fail-close하므로 purge는 안전 방향).
- 배선은 합성 실측으로 확인했다(오라클 단위 test가 아니라 **블록 경계 재현**): stale purge 후 5.6이 빈 값을 읽음 · 5.2z→5.6 아티팩트 전달 성립 · **수정 전 코드가 같은 조건에서 플래그를 실제로 떨굼(결함 재현)** · 아티팩트 부재 시 5.2f가 금지된 빈 verdict를 쓰지 않음.

같은 라운드에서 Codex GPT-5.4가 별도 2건을 짚었고 둘 다 흡수했다.

- **DD3 게이트키퍼가 실제 경로에서 dead code였다.** `decide.js:159-166`은 DD3를 정확히 구현한다 — L1이 위반을 찾으면 L2를 보기도 **전에** `divergent` + "L2 was not fired"로 착지한다. 그런데 `cli.js`의 `cmdDecide`가 오라클을 부르기 **전에** `--l2-file`을 무조건 읽고 막았다. DD3가 발동하는 유일한 경로(L1 실패 → 5.2c 미실행 → l2.json 부재)에서 답은 `divergent`가 아니라 `unavailable`("L2 produced no readable result")이었다. 두 값은 교환 가능하지 않다 — 전자는 "게이트가 돌았고 당신 플랜에 위반이 있다, 여기 목록"이고 후자는 "게이트를 돌리지 못했다"다. receipt가 **다른 사건**을 기록했고 L1 위반 목록은 작성자에게 영영 닿지 않았다. → L1이 converged가 아니면 L2를 요구하지 않고 오라클로 단락. `inconclusive`("검사 못 함")는 여전히 `unavailable`이고 converged L1은 여전히 readable L2를 **요구**한다 — 넓히는 수정이 아니라 L1이 이미 답한 질문을 L2에 되묻지 않는 수정이다.
- **Workflow가 던진 경로에서 유령 launch가 영구 commit됐다.** 5.2c는 Workflow throw/미가용을 허용하고 그때 리뷰어가 0명일 수 있는데, 5.2d는 **계획된** fleet 크기로 무조건 reconcile했다(commit된 항목은 만료되지 않으므로 영구). Codex의 진단은 옳았으나 처방("0으로 commit")은 이 저장소가 이미 기각한 답이다 — 리뷰어가 실제로 떴는데 반환만 유실된 경우 **under-count**가 되고, cap이 절대 틀리면 안 되는 방향이 바로 그쪽이다. → fan-out Phase 2.5.3의 규칙을 그대로 적용: `l2.json`이 없으면 **아예 답하지 않는다**. 예약은 pending으로 남고 5.2c의 debt marker가 그것을 pin한다. "모름"은 모름으로 두고 보수적으로 둔다.
- **회귀 test는 CLI 통합 수준으로 작성했다** — 이 결함은 오라클 test로는 원리상 못 잡는다(`decideReview`는 한 번도 틀린 적이 없다). 그리고 test가 **수정 전 코드에서 실제로 실패하는지 실측**했다: 6개 중 정확히 2개 실패(결함을 짚는 것들), 나머지 4개는 양쪽에서 통과(불변식 보존 확인용). 이 저장소가 반복 목격한 "test가 버그를 정답으로 고정"을 구조적으로 배제한다.

### Fixed (santa-loop R3 — 패널 fail-open 외 2건)
R3에서도 양쪽 FAIL. Codex가 3건을 짚었고 전부 흡수했다(R2에서 backlog로 이연했던 1건 포함 — 두 라운드 연속 재지적이라 철회).

- **패널 fail-open (HIGH, 실측 재현).** 패널 실행이 `decision.json` 손상으로 triple을 못 실으면 5.6의 all-or-nothing 가드가 **부분 stamp를 무-stamp로** 바꾸고, 패널 모드에는 forward할 `codex_verdict`도 없다. receipt는 `write.js`의 `defaultResolution`이 넣은 `converged: true`만 지닌 채 착지하고, `resolveEffectiveVerdict`가 `axis:'none'`을 답해 `receipt-convergence.js:45`의 엄격한 review 분기를 **건너뛰며**, 48행 `resolution.converged === true`가 답이 된다 — **아무것도 승인하지 않은 실행이 converged로 읽힌다.** 이 milestone이 5.6에서 이미 한 번 고친 silent-omission과 같은 계열이다.
  - **첫 수정 시도는 틀렸고 테스트 스위트가 잡았다.** "`mccp-plan-codex`는 무조건 verdict 축을 요구"로 만들었더니 e2e dogfood chain 포함 **약 30개가 깨졌다** — verdict 없는 plan receipt는 advisory·skipped·수동 복구 경로에서 평범하다. 근거로 삼았던 "디스크 receipt 2개 모두 축 보유"는 n=2였고 일반화가 성립하지 않았다.
  - **채택한 형태는 좁다**: 신규 present-only `--review-mode`가 패널 실행임을 **선언**할 때만 triple을 요구한다. `mode.json`은 Phase 5.2 진입 시 기록돼 하류가 오염시킬 수 없으므로, `decision.json`이 못 미더울 때 여전히 믿을 수 있는 유일한 사실이다. 플래그 미지정·`codex`는 **기존 동작 그대로**(회귀 0). 이 검사의 한계는 "호출자가 플래그를 빠뜨리면 못 잡는다"이고, 그래서 5.6이 write **전에** 같은 조건으로 HALT한다 — 두 층 모두 단독으로는 불충분하다.
- **`quorum.roles`가 관측치 자리에 floor였다.** `>= q.roles`라 4개 역할이 응답해도 `roles:1`로 봉인됐다. `roles`는 `quorum.js:156`이 usable 결과에서 센 **관측치**이고 `perspectives`도 `decide.js:217`의 **같은 `isUsableResult` 필터**로 만들어지므로 정직한 producer는 둘이 어긋난 상태를 생성할 수 없다 → 정확 일치로 전환. 과소보고는 승인을 과대주장하지 않아 무해해 보이지만, proof는 durable 감사 기록이고 **자기 자신과 불일치해도 되는 기록은 증거가 아니다**(같은 필드에 `rolesMin`을 쓰던 앞선 사례에 이은 임계값-관측치 혼동 2회차). 교정 과정에서 기존 fixture 11곳이 **생성 불가능한 상태**(4 perspectives + `roles:3`)를 단정하고 있었고, 그중 여럿은 의도한 축이 아닌 이유로 통과 중이었다(예: `quorum.of must be >= required`가 roles에서도 실패).
- **`--plan`/`--prd` 경로 미검증.** 리뷰어는 `isRepoRelativeEvidencePath` 미러를 제안했으나 **다른 불변식**이다 — 그 술어는 receipt에 *봉인될* 문자열용이라 리터럴 자체가 산출물이지만, `--plan`은 읽을 파일이고 필요한 속성은 **봉쇄(containment)**다. 문자열이 repo-relative일 것을 요구하면 repo 내부를 가리키는 정상 절대경로를 거부해 기존 흐름이 깨진다. resolve 후 root 내부인지 판정하는 방식으로 구현하고(`cmdL1`의 `--repo-root` 패턴을 emit/decide로 확장), 회귀 test가 "repo 내부 절대경로는 여전히 통과"를 함께 봉인한다.
- 회귀 test 8개는 **수정 전 코드에서 정확히 4개가 실패**함을 실측했다(결함당 1개 + containment 특정성). 나머지 4개는 양쪽에서 통과하는 불변식 보존 가드다.

### Fixed (santa-loop R4/R5 — DD2 척추의 구멍 + bind 무력화)
R4는 split(A FAIL·B FAIL), R5도 split(**A PASS**·B FAIL). 두 라운드에서 4건을 흡수하고 3건을 실측으로 기각했다.

- **`hybrid`가 L3 없이도 cross-model 확증으로 읽혔다 (R5, DD2 척추).** `isCrossModelCorroborated`가 `source ∈ {codex, hybrid}`만 보고 `review_proof.layers.l3`는 보지 않았다 — `hybrid` + `layers.l3: null`이 구조적으로 유효하고 확증으로 판정됐다(실측). producer는 이 모양을 만들 수 없지만(`decide.js:237`이 L3 미발화 hybrid를 `multi-agent`로 강등) **이 술어가 읽는 것은 receipt**이고, receipt는 자신을 쓴 프로세스보다 오래 산다. 그 오라클을 거치지 않은 무엇(다른 writer·손 복구본·부분 마이그레이션)이 `hybrid`를 주장하면 dedupe가 terminal PR-Codex를 건너뛴다 — **same-model 패널이 cross-model로 도장 찍히고, 미루기로 한 그 검사가 영영 실행되지 않는다.** milestone이 "cross-model은 제거가 아니라 ship 지점으로 이동"이라 말하는 근거가 정확히 이 술어다. → 읽기 측(확증 술어)과 쓰기 측(schema) 양쪽에서 `hybrid ∧ converged ⇒ layers.l3 === "converged"` 요구.
- **테스트 3개가 그 결함을 정답으로 고정하고 있었다** (이 저장소 5번째 목격, R5 Codex 지적). `hybrid` positive 케이스들이 `layers.l3: null` fixture를 썼다 — 즉 **결함이 있어야 통과하는** 테스트였고, 고치면 회귀처럼 보였을 것이다. fixture에 실제 hybrid 실행이 남길 L3 layer를 주고, 각 위치에 빠져 있던 negative 케이스(L3 없는 hybrid는 확증 아님)를 추가했다.
- **`MCCP_PLAN_REVIEW_L3=0`이 실제로 L3를 막지 못했다 (R5).** CLI가 `mode.json`에 `fires.l3`를 emit하는데 `plan.md`가 읽지 않았고, mode 표는 `hybrid`에서 5.2f를 무조건 실행했다 — 문서화된 kill switch가 산문에만 존재했다(§4는 "Codex 사용량 소진 시 mode를 건드리지 않고 L3만 끌 수 있어야 한다"고 그 존재 이유까지 적어 두었다). → 5.2f에 Step 0을 신설해 `fires.l3`를 읽고, false면 `{"invoked":false}`를 기록한 뒤 wrapper를 건너뛴다. `mode.json` 판독 실패는 `0`으로 착지한다 — 알 수 없는 정책이 Codex 호출을 조용히 지출해서는 안 된다.
- **DD13 bind가 `--plan` 누락·해시 실패로 조용히 꺼졌다 (R4).** `decide.js:197`은 `currentPlanHash`가 비어 있으면 비교 자체를 건너뛰는데, `cmdDecide`가 `--plan`을 선택 인자로 두고 해싱 예외도 `null`로 흡수했다. bind는 "리뷰어를 띄운 뒤 plan을 편집"이라는 **본 PRD가 실제로 겪은 실패**에 대한 답인데, 플래그 하나 빠지면 무력화되는 bind는 bind가 아니다. → CLI에서 fail-closed(오라클이 아니라 — R3에서 오라클을 넓게 손대 30개를 깬 전례를 반복하지 않는다).
- **containment가 승인한 파일과 L1이 읽는 파일이 달랐다 (R4, R3 수정의 버그).** `resolveContained`는 repo root 기준으로 검증하는데 `cmdL1`이 **raw argv**를 넘겼고 `l1-check.js:224`는 `nodePath.resolve()`로 **cwd 기준** 재resolve했다. repo 루트가 아닌 cwd에서는 서로 다른 파일이다 — **후속 read를 구속하지 않는 검사는 검사가 아니다.** → `contained.abs`를 넘기고, 심볼릭 링크 회피도 `realpathSync` 대조로 닫았다(R5 재지적).

#### 기각 3건 (실측 반증)
- **"읽기 측을 조여 `axis:'none'`을 비-converged로"** (R4·R5 반복 지적) — 추적된 receipt **35개 중 22개가 verdict 축 없이 `converged: true`**다(`codex_verdict`가 생긴 v1.20.3 이전 ship receipt 전부). 조이면 그 22개가 소급 무효화돼 §3.12가 보존하려는 durable corpus의 ledger 대조가 깨진다. 이 fallback은 결함이 아니라 **떠받치는 구조**이고, 그래서 패널 쪽 수정이 producer에 살아야 한다. 리뷰어는 그 사실을 고정한 회귀 test를 "fail-open을 축복한다"고 읽었으므로 test 주석에 22/35 실측을 박아 뒀다.
- **"`--plan`의 절대경로를 선차단하라"** — `isRepoRelativeEvidencePath` 미러 제안이지만 **다른 불변식**이다. 그 술어는 receipt에 *봉인될* 문자열용이라 리터럴 자체가 산출물이고, `--plan`은 읽을 파일이라 필요한 속성은 **봉쇄**다. 문자열 모양을 요구하면 repo 내부를 가리키는 정상 절대경로를 거부해 기존 흐름이 깨진다(회귀 test가 이를 고정).
- **"`quorum.roles`와 `perspectives`가 어긋날 수 있다"** — 한 리뷰어가 제기했다가 **스스로 철회**했다. 둘 다 `isUsableResult` 동일 필터 산출이다.

### Fixed (santa-loop R6 — 아티팩트 배선의 마지막 셸-상태 유실)
양쪽 FAIL. 4건 흡수. 셋은 **앞선 라운드의 내 수정이 남긴 것**이고, 그 사실 자체가 이 층의 성질을 말한다 — `commands/plan.md`는 LLM이 실행하는 마크다운이라 단위 테스트가 닿지 않고, 매 수정이 새 셸 배선을 더한다.

- **`mode.json` 판독 실패 하나가 가드 두 개를 동시에 무장해제했다 (HIGH).** 5.6이 mode를 못 읽으면 `--review-mode` 플래그를 조용히 빼고, 사전 HALT도 mode 값이 있어야 걸리므로 함께 침묵한다. 그 조합에서 패널 실행은 verdict 축이 **하나도 없는** receipt를 봉인하고, `resolveEffectiveVerdict`가 `axis:'none'`을 답해 `receipt-convergence.js:48`의 `resolution.converged === true`가 판정을 가져간다 — 승인을 하나도 발급하지 않은 실행이 `converged`로 읽힌다. R5 기록은 이 가드의 한계를 "플래그를 빠뜨리는 호출자"라고 적었지만, **명령 자신이 읽기 실패마다 빠뜨리고 있었다.** → `mode.json`은 Phase 5.2 진입에서 모든 모드에 대해 생성되므로, receipt-write 시점의 부재는 first-run이 아니라 고장이다. exit 12.
- **`CODEX_CLASS`가 블록 경계에서 유실돼 L3 기록이 매번 `reason:"unknown"`이었다.** 성공한 hybrid 실행이 "왜 L3가 돌았는지 모른다"고 기록했다 — 알고 있었는데도. R2가 verdict에 대해 고친 것과 **완전히 같은 형태**를 같은 커밋에서 재생산한 것이다(`${CODEX_CLASS:-unknown}`은 5.2z 블록의 변수를 5.2f 블록에서 읽는다). → classification도 verdict 옆에 persist하고 5.2f가 아티팩트에서 읽는다.
- **`mode.json` 판독 실패가 "정책상 L3 비활성"으로 기록됐다.** Step 0의 catch가 `0`으로 떨어져 `reason:"MCCP_PLAN_REVIEW_L3=0 — L3 disabled by policy"`를 썼다 — 확립된 적 없는 원인을 감사 기록에 넣는다. → tri-state(`-1`)로 "정책이 아니라고 함"과 "판단할 수 없음"을 분리하고, 후자는 HALT.
- **`codex-verdict` 쓰기가 실패를 검사하지 않았다.** 이 아티팩트는 블록 경계를 넘는 **유일한 운반체**라 사본이 없다. 종료코드 검사에 더해 **read-back 검증**을 넣었다 — 디스크가 가득 찬 상태에서 open은 성공하고 write가 조용히 비는 경우는 종료코드만으로 못 잡는다.
- **도달 불가능한 fallback 제거.** R2가 "회귀 방지"로 넣은 `${CODEX_VERDICT:-}` 셸 fallback은 5.2z가 fence 뒤라 **구조적으로 절대 발화할 수 없었다**. 잡을 수 없는 안전망은 없는 것보다 나쁘다 — 있지도 않은 2차 방어선이 있다고 읽힌다. 그것을 "유지된다"고 적은 낡은 주석도 함께 지웠다.

#### 이 사이클을 여기서 닫는 이유 (정직한 잔여)
santa-loop 6라운드에서 **20건 흡수 · 7건 기각**했고 회귀 스위트는 1781개 중 선재 실패 1건(§3.9 문서화된 fixture 부재)만 남는다. 알려진 미해결 fail-open은 없다. 다만 흡수한 20건 중 **6건이 앞선 라운드의 내 수정이 만든 것**이었고, 그중 셋이 같은 셸-상태 유실 형태였다. 근본 원인은 개별 실수가 아니라 구조다 — 게이트 배선이 단위 테스트가 닿지 않는 마크다운에 살아 있고, 매 수정이 새 배선을 더한다. **`commands/plan.md` Phase 5.2의 셸 배선을 테스트 가능한 오라클로 추출하는 것**을 후속 축으로 남긴다(이번 사이클에서 오라클 자체는 6라운드 내내 견고했고 결함은 전부 그 둘레의 seam에 몰렸다 — 어디를 고쳐야 하는지가 이미 측정됐다).

### Notes
- **santa-loop R1에서 기각한 4건.** 리뷰어 지적을 액면 수용하지 않고 실코드로 재현한 결과: (a) "5.2c의 `l2.json` write가 코드블록에 없다" → `Workflow` 결과는 LLM에 반환되지 셸로 파이프될 수 **없고**, 925행이 명시 지시하며 부재 시 5.2e가 fail-closed. (b) "5.2g의 `&&`가 exit 12를 삼킨다" → 셸 의미론 오독이다. 좌변이 참이면 우변의 종료코드가 곧 복합문의 종료코드다. (c) "quorum test가 `responded ≤ of`를 미검증" → `responded`는 `usable.length`로 **파생**되는 관측치라 초과값이 입력될 수 없다. (d) "`plan-review-decide.test.js:273-281`이 유출 결함을 정답으로 고정한다" → 리뷰어가 275행에서 읽기를 멈췄다. 281-282행이 정확히 반대를 단정한다(read-side 오라클이 `unavailable`로 강등 + `proofFailed:true`). 다만 이 확인이 위 4번째 흡수를 **강화**했다 — 승인 축의 방어가 증명되면서 유출 축의 공백이 분리돼 드러났다.
- **backlog로 이연한 1건 (santa-loop R2, Codex).** `plan-review/cli.js`와 `receipt/write.js`가 `--plan`/`--prd`/`--design-doc` 경로를 `path.resolve`로 그대로 받고(절대/UNC/`..` 거부 없음), `commands/plan.md`가 `<plan path>` 자리표시자를 큰따옴표 셸 문자열에 직접 보간한다 — command substitution 페이로드가 실행 가능하다. 실재하는 표면이지만 (a) 본 커밋이 만든 것이 아니라 `plan.md` 전반의 기존 패턴이고, (b) 위협 모델이 "운영자가 자기 저장소에서 자기가 입력한 경로"이며, (c) **본 milestone의 안전 논증이 이 축에 기대지 않는다** — 플랜 경로를 통제하는 자는 이미 플랜 내용을 통제하므로 `reviewed_plan_hash`/L1이 새로 무르게 되는 것이 없다. R2에서 세운 이연 기준(선재성이 아니라 *이번 변경이 그 결함에 기대는가*)을 그대로 적용한 결과다. 공용 repo-relative 경로 validator 도입은 별 사이클.
- **R1의 "backlog 이연" 판단은 R2에서 철회했다.** R1은 `$CODEX_VERDICT` 셸 상태 단절을 선재 결함으로 보고 이연했다. 사실 자체는 맞았지만(`git show`로 확인 — 의존은 v1.23.0 이전부터 존재) 결론이 틀렸다: 추적해 보니 같은 근본 원인의 **신규** 인스턴스가 5.2f에 있었고(`hybrid` 상시 HALT), 선재 쪽도 하필 DD7이 안전밸브로 지정한 경로였다. 위 R2 항목에서 흡수. 교훈은 "선재인가"가 이연의 충분조건이 아니라는 것 — **그 결함이 이번 변경이 기대는 전제인지**를 함께 봐야 한다.
- **DD7 — 미상 값은 `codex`로 떨어진다.** `parseMergedVerifyMode`가 미상 값을 가장 엄격한 신규 모드로 보내는 것과 **반대 방향**이다: 이 축의 실패 모드는 "검증이 꺼짐"이 아니라 "**승인 발급자 오인**"이고, 그때 안전한 착지는 더 엄격한 신규 경로가 아니라 **이미 검증된 기존 경로**다. 미설정은 opt-out이 아니므로 신규 default(`multi-agent`)를 받는다.
- **DD10 no-render 계약** — derive projection에는 `review_verdict`/`review_source`가 추가되지만 **어떤 renderer section도 이 두 필드를 읽지 않는다**(mechanical 확인: renderer 파일 변경 0). 사용자가 본 적 없는 세 번째 verdict 어휘를 예고 없이 화면에 올리지 않는다 — 표시 설계는 별도 디자인 사이클.
- **이 사이클의 Codex는 `MCCP_CODEX_DISABLED=1` 정책으로 미발화**했고 receipt는 `codex_verdict='skipped'`로 정직하게 봉인됐다. 게이트 내 적대 검토는 `Task(security-reviewer)` 1회(CRITICAL 0, HIGH 2 — 둘 다 플랜 DD11/DD13이 이미 규정한 구현-정확성 요구로 흡수)이며 **cross-model이 아니다**.

### Notes — santa-loop round 4 흡수 (cap 초과, 운영자 결정)

3라운드 상한에서 escalate했고 운영자가 속행을 선택했다. Reviewer B가 R3에서 올린 6건 중 **같은 결함군 2건 + 1건**을 닫았다.

- **`computeA3`·`computeB3`가 생산자 신호를 평탄화하고 있었다 (R3-1 + R3-5).** 이 루프에서 같은 모양이 층만 바꿔 **세 번** 재발한 축이다: R1은 대조를 만들었고, R2는 그 결과를 source에 `degraded`로 전파했고, R3는 그 `degraded`를 **지표를 발행하는 소비자가 읽지 않는다**는 것이었다. 이제 `computeA3`는 손상(`degraded`/`error`)을 `artifact_present` 판정 **앞에서** 먼저 보고 `status:'invalid'`로 내며(A1의 "무결성 위반은 producer 부재보다 먼저" 선례), `computeB3`는 `exclusion_doc_ok !== true`면 분모를 발행하지 않는다. 부재·판독불가·손상은 서로 다른 사실이고, drift난 분모는 문서가 승인한 분모가 아니다.
- **제외표 대조가 evidence 열을 보지 않았다 (R3-4).** token·class만 맞으면 근거가 비어 있거나 지어낸 행도 통과했다 — §B3이 요구하는 "항목마다 file:line 근거"보다 약한 게이트다. 이제 evidence 셀이 실제 소스 위치(`path.js:123`)를 담아야 하며, glob(`commands/*.md`)은 라인 없이 허용한다(근거가 "모든 command body"라 단일 라인이 가리킬 수 없다).
- **인터프리터 probe가 tiktoken import 가능성을 확인하지 않았다 (R3-2).** 첫 Python 3을 채택하므로 여러 설치가 있는 머신에서 tiktoken을 가진 인터프리터를 지나칠 수 있었다. 이제 probe가 한 프로세스에서 버전과 `import tiktoken`을 함께 답하고, tiktoken을 가진 후보가 우선한다. 어디에도 없으면 기존 loud `baseline-unavailable`을 실제 인터프리터 기준으로 유지한다.
- **유지 판정 (R3-3)**: C3가 코드펜스 안 언급도 포인터로 인정한다. 더 조이면 인라인 코드로 적은 정상 포인터를 오탐하고, "섹션이 목적지를 명시한다"는 검사 목적은 이미 충족한다. **해당 없음 (R3-6)**: plan의 홈 절대경로는 운영자가 되돌리기 + backlog로 이미 결정한 항목이다.

신규 test 6건은 helper가 아니라 **발행 층(`computeMetrics`)** 에 건다 — Codex가 "현재 test는 helper에서 멈추고 A3/B3를 실제로 발행하는 소비자 경로를 건드리지 않는다"고 지적한 지점이다. 손상·drift가 `invalid`로 뒤집히는지와, **정상 경로가 새 게이트에 걸리지 않는지**를 함께 단언한다.

새 게이트가 seeded acceptance fixture를 깨뜨렸고, 그것이 논점을 그대로 실증했다 — 그 fixture는 R2가 도입한 `snapshot_files_parsed`조차 갖고 있지 않았다. **fixture가 producer의 실제 출력 모양보다 뒤처져 있었는데 소비자 층 test가 없어 아무도 그 격차를 보지 못했다.** 게이트를 느슨하게 푸는 대신 fixture가 대조 결과를 명시하도록 고쳤다.

## [1.23.4] — 2026-08-09

**codex-intent-context M1 — 의도 표면화 + 판정 커버리지 + 측정 인프라 (단일 milestone → patch bump)** — `/mccp:plan`의 Plan-Codex 게이트는 리뷰어(out-of-process Codex)에게 **사용자 대화 의도를 전달할 채널이 없었고**, finding 수용 판단이 어디에도 기록되지 않았다. M1은 세 축을 닫는다: **(L1)** plan의 구조화된 `## User Intent` 표를 하드닝해 리뷰어 focus에 주입 · **(L2-A)** 모든 finding이 명시 판정을 받도록 mechanical 완전성 강제 · **(M)** receipt `meta.intent_*` 10 필드로 측정 인프라 확립.

강제는 **단일 장수(long-lived) 프로세스** `plan-codex-runner.js`가 소유한다 — Codex 호출·adjudication 대기·판정·receipt write가 한 프로세스 안에서 일어나므로 리뷰와 write 사이에 판정 입력 파일이 **존재하지 않는다**(DD3). 감사 envelope는 디스크에 남기되 **절대 재read하지 않으며**, 이를 회귀 test가 강제한다(변조해도 verdict 불변).

> **M1은 UI10(의도-충돌 finding의 silent-accept 0건)을 달성하지 않는다.** 저자가 모든 finding을 `intent_conflict:'none'`으로 표시하면 커버리지 검사는 전부 통과한다 — M1은 **누락**을 막고 **오심**은 막지 못한다. 오심 탐지(리뷰어 per-finding `INTENT:` 계약 + 비대칭 대조)는 **M1.5**가 소유한다(Plan-Codex F1 흡수 — 초안의 UI10 달성 주장 철회).

### Added
- `plugins/mccp/scripts/lib/intent-context.js` — L1+L2-A 단일 pure 오라클. 섹션 파싱(DD7 구조 가드 8종) · reference 합성(DD8 이스케이프 표 + 300자 상한) · adjudication 완전성 판정 · **소비처별 출력**(`runtimeAllowed`/`chainAllowed`/`dedupeApproved` — 단일 `pass` 없음, Implement-R1 F3).
- `plugins/mccp/scripts/lib/plan-codex-runner.js` — 단일 장수 프로세스. per-decision lease lock(host-aware tri-state) + `meta.intent_run_nonce` 봉인으로 marker 유실 크래시를 markerless 복구(Implement-R1 F5).
- `plugins/mccp/scripts/lib/markdown-table.js` — 중립 공유 표 리더. `parseTableRows`의 **완전 계약**(`withMeta` + `{cells,resolved,meta}`)을 이관하고 마커 스트리퍼는 주입식이라 dep-free(Implement-R1 F4). renderer와 게이트가 둘 다 import — escaped-pipe 행 드롭 버그의 재발명·게이트→대시보드 의존 역전 양쪽을 차단.
- 테스트 4본 — `intent-context.test.js`(30) · `plan-codex-runner.test.js`(17) · `intent-gate-fields.test.js`(12) · `validate-cmd-intent-gate.test.js`(11).

### Changed
- `receipt/schema.js` — `meta.intent_*` **10 present-only 필드**. `makeSkeleton` 미포함(`pr_codex_force_override` 선례) — §3.12 git-tracked ship corpus의 hash 안정성 보존 + DD2의 "키 부재 = 모름"을 의미 있게 유지. `intent_adjudication_counts.by_verdict`는 **open map**이며 검증은 합계 불변식(Codex F2 — 닫힌 키 집합은 신규 verdict 추가 시 과거 receipt를 소급 invalid로 만든다).
- `receipt/write.js` — runner 결정을 stamp만 하고 판정하지 않는다. `intentDecision`은 **프로그래매틱 non-null 객체 전용**: `cli.js parseFlags`는 문자열/`true`/배열만 만들 수 있으므로 타입 가드가 CLI 위조 경로를 **구조적으로** 닫는다(Implement-R1 F2 — intent CLI 플래그 0건). free-form plan(`**Source PRD**:` 부재)은 DD1의 mechanical proof로 `skipped`.
- `receipt/validate-cmd.js` — canonical read-back. 무결성 검사(schema→subject/receipt-tamper→staleness) **이후**에 배치돼 변조 receipt의 intent 필드는 읽히지 않음. `blocking[].kind='intent_gate_incomplete'` + 키 부재는 `warning.kind='intent_gate_unknown'`(DD2).
- `receipt/dedupe.js` — **공유 `codexConverged`는 불변**(DD9 — 손대면 out-of-scope implement receipt가 항상 unknown이 되어 전 dedupe 사망). plan 축에만 `intent_approved` 추가.
- `lib/codex-invoke.js` — `--intent-reference-file` + `composeFocus` 3-part 결정적 순서(design → intent → base). 판독 실패는 **spawn 전 exit 2**(classification enum 14종 보존).
- `commands/plan.md` — `## User Intent` 필수 섹션 + Phase 1.5 CAPTURE · Phase 5.2 runner detached 실행 · 5.5a adjudication 작성 · 5.6 marker 4-state 판정 · 5.4a `[MCCP-INTENT-GATE-STOP]`.
- `commands/prp-implement.md` — Phase 0.0 복구가 `mccp-plan-codex`를 **blind write하지 않는다**(Codex F1 — 없으면 informational allow-path가 불투명한 exit 12로 깨진다).
- `commands/pr.md` + `pr-phase-helpers/codex-runner.js` — L1만 forward(fail-open). L2-A는 plan 단계 소유.

### Notes
- **운영 토글 1건**: `MCCP_SKIP_INTENT_GATE="<substantive reason>"` — mechanical HALT만 해제하며 **verdict를 세탁하지 않는다**. receipt는 실제 blocking verdict를 봉인한 채 `meta.intent_gate_force_override=true`와 ship되므로 cross-gate dedupe는 fail-closed를 유지한다(DD6).
- **dedupe 동작 변화**: legacy plan-codex receipt(intent 키 부재)는 더 이상 dedupe되지 않아 PR-Codex가 한 번 더 돈다. 의도된 fail-closed 대가 — "키를 빼면 공짜 skip"이라는 유인을 0으로 만든다.
- **DD4-1은 "안정 잔여" 형태로 강제된다**: plan이 요구한 "write 직전 재대조 = 리뷰 시점 **전체** digest"는 실제 흐름에서 성립할 수 없다 — 게이트 자신이 Phase 5.1에서 `## Codex Adversarial Review` placeholder를 넣고 5.3에서 그것을 교체한 뒤에야 receipt가 쓰이므로, 문자 그대로 강제하면 성공하는 모든 게이트가 abort한다. 따라서 `intent-context.js#stableBodyDigest`가 **게이트가 스스로 쓰는 섹션만 이름으로 제외**하고 나머지(`## User Intent` 표 · Codex가 읽은 Tasks/DD)를 byte-동일성으로 요구하며, 불일치 시 **write 없이** `incomplete`로 차단한다. `intent_plan_digest`는 실제 봉인되는 본문의 digest로 stamp되고 write 후 재검증된다(DD4-2). 초안 구현은 이 불가능성을 발견하고 경고 stderr로 강등해 바인딩을 강제하는 것이 아무것도 남지 않았고, santa-loop R1의 외부 리뷰어가 그 지점을 짚어 현재 형태로 교정됐다.
- **M1은 UI10(의도-충돌 finding의 silent-accept 0건)을 달성하지 않는다.** 저자가 모든 finding을 `intent_conflict:'none'`으로 표시하면 커버리지 검사는 전부 통과한다. M1은 **누락**을 막고 **오심**은 막지 못하며, 오심 탐지(리뷰어 per-finding `INTENT:` 계약)는 M1.5 소유다.
- santa-loop 6라운드로 22건을 흡수했고 **그중 16건은 Codex(GPT-5.4)만 포착**했다(Opus는 R3·R5·merge 라운드에서 PASS). santa-loop Reviewer B는 `codex exec` 직접 호출이라 wrapper 게이트가 env policy로 죽어도 cross-model 검증을 얻는다.
- PR-Codex는 `MCCP_CODEX_DISABLED=1`로 미발화했다 — ship gate는 `skipped` + proof로 통과했으며 이는 **Codex 승인이 아니다**.

## [1.23.3] — 2026-08-06

**Red test suite 복원 M1 — 시한폭탄 테스트 + fixture 전제 교체 (patch — bug fix/axis close)** — pre-existing 상시 red 테스트 2건을 각각의 실제 원인에 맞게 해소한다. (1) `verdict-label.test.js`의 audit-timeline 케이스 — renderer/index.js가 renderAuditTimeline에 undefined를 하드코딩해 함수의 clock 폴백(Date.now())이 항상 발동, 픽스처의 2026-07-01 타임스탬프가 현재(2026-08-06)와 35일 벌어져 7일 필터로 제외됨 → 회귀 가드 케이스 추가(F2 — 주입 clock이 실제로 지배하는지 검증). (2) `design-critique-loop-e2e.test.js`의 fixture 케이스 F — .gitignore가 .claude/cache/를 보호해 fixture를 커밋 불가하면서도 repo 존재 assert가 구조적으로 충족 불가능 → repo-존재 검증에서 test-time 합성 + detector 검증으로 교체(실제 계약 = detector가 whitelist 경로를 인식하는지, fixture 파일의 물리적 존재가 아님).

### Changed
- `plugins/mccp/scripts/lib/renderer/index.js` — audit-timeline에 `opts.now` 전달 (하드코딩 undefined 제거)
- `plugins/mccp/scripts/lib/renderer/tests/verdict-label.test.js` — F2 회귀 가드 추가(7일 경계 — 같은 model을 서로 다른 clock으로 render해 output 차이 검증)
- `plugins/mccp/scripts/lib/tests/design-critique-loop-e2e.test.js` — 케이스 F 교체(fixture 합성 + plan의 whitelist 경로 인식 검증)
- `plugins/mccp/.claude-plugin/plugin.json` `1.23.2 → 1.23.3`(patch — bug fix/axis close, §3.7) + renderer footer(html/markdown) 동기.

### Fixed — PR-Codex R1 흡수 (HIGH, goal-detect 경로 반환)

`goal-detect.js`의 plan 존재 확인 루프는 `[repoRoot, prdDir]`(또는 `./`·`../` 셀이면 역순) 두 base를 순회하며 존재하는 후보에서 멈추지만, **어느 base가 매칭됐는지 버리고 원본 셀 문자열을 그대로 `signal_ref.plan`으로 반환**했다. 유일한 소비처 `milestone-close.md`는 그 값을 `PLAN_PATH`로 직접 쓰며 repo root 기준으로 해석하므로, 검출이 승인한 파일과 명령이 편집하는 파일이 **서로 다를 수 있었다** — 예컨대 bare 셀 `x.plan.md`가 `<prdDir>/x.plan.md`로 매칭되면 downstream은 `<repoRoot>/x.plan.md`를 가리켜, 같은 이름의 다른 파일이 있으면 조용히 엉뚱한 plan을 stamp/close하고 없으면 dead-end가 된다. 즉 `plan-missing` 정지였어야 할 것이 `goal_signal=true`로 바뀌며 milestone provenance가 오염된다.

이제 실제로 존재 확인을 통과한 후보를 **repo-relative canonical 경로**로 정규화해 반환한다(신규 `toRepoRelative`). 검출과 변형이 항상 같은 파일을 지목한다.

- `plugins/mccp/scripts/lib/goal-detect.js` — 매칭된 base를 추적해 canonical 경로 emit
- `plugins/mccp/scripts/lib/tests/goal-detect.test.js` — **기존 S11c·S11d가 결함을 정답으로 고정하고 있었다**(raw 셀 `'../plans/m2.plan.md'` · `'./sibling.plan.md'`를 기대). 두 단언을 canonical 경로로 정정하고, 충돌 회귀 2건(S11h prdDir 매칭 · S11i repo-root fallback)을 추가. 수정을 되돌리면 4건 전부 실패함을 A/B로 확인(공허하지 않음).

## [1.23.2] — 2026-07-31

**`/mccp:milestone-close` detector false-negative 수정 (patch — axis close)** — `/mccp:milestone-close`를 실제 PRD에 처음 돌리자 Phase 1 DETECT가 `reason=plan-missing`으로 STOP했다. plan 파일은 **존재**했다 — `goal-detect.js`가 실제 PRD 표의 plan 셀을 해석하지 못한 것이다. 서로 **독립적으로 치명적인** 결함 2건이 겹쳐 있었다: (1) `extractPlanPath`가 markdown link `[label](path)`만 처리하고 **inline-code 백틱을 제거하지 않아** `` `.claude/plans/x.plan.md` `` 가 백틱째로 경로 해석에 흘러갔고, (2) plan 경로를 **`prdDir` 기준**으로 resolve해 repo-root 상대 표기(`.claude/prds/` + `.claude/plans/…`)가 원리상 절대 맞지 않았다. 백틱만 제거해도 여전히 `plan-missing`, resolve base만 바꿔도 여전히 `plan-missing` — 둘 다 고쳐야 `goal_signal=true`가 된다. 기존 테스트가 이 버그를 정답으로 고정하고 있던 것은 **아니다**: 모든 fixture가 PRD를 repoRoot에 직접 두어 `prdDir === repoRoot`였고, 그래서 resolution base가 **한 번도 실행되지 않았다**(under-coverage). 회귀 테스트는 PRD를 `.claude/prds/` 하위에 두는 실제 배치로 바꿔 두 축을 각각 재현한다.

### Changed
- `plugins/mccp/scripts/lib/goal-detect.js` — `extractPlanPath`가 inline-code fence를 먼저 벗기고(백틱 안의 markdown link도 처리) 그 다음 link/bare를 해석. plan 경로 해석은 단일 base가 아니라 **후보 base 목록**(`planResolutionBases`): bare 경로는 repoRoot 우선·prdDir fallback, `./`·`../` 접두는 문서 상대이므로 prdDir 우선·repoRoot fallback. `path-traversal`은 **모든** base에서 repo를 벗어날 때만 발급하고, 안전하지만 부재인 경우는 `plan-missing`으로 유지(두 reason의 의미 보존).
- `plugins/mccp/scripts/lib/tests/goal-detect.test.js` — S11a~S11g 추가. PRD를 `.claude/prds/` 하위에 배치해 base 축을 실제로 행사: 백틱+bare 조합(결함 1+2), bare 단독(결함 2), 백틱 안 markdown link, `./` 상대 경로 무회귀, 백틱 감싼 `—`, 실제 부재(`plan-missing`), 전 base traversal(`path-traversal`). 미수정 코드(cache 1.22.7) A/B로 신규 테스트가 공허하지 않음을 확인.
- `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` — markdown footer 검증을 bare `/v1\.x\.y/`에서 footer 줄 anchor로 교체(html 쪽이 이미 흡수한 교훈 — plan 파생 milestone 라벨이 body에서 우연히 매칭됨).
- `plugins/mccp/.claude-plugin/plugin.json` `1.23.1 → 1.23.2`(patch — bug fix/axis close, §3.7) + renderer footer(html/markdown) 동기.

## [1.23.1] — 2026-08-06

**multi-session-work-loop M3 — 증거 충돌 소거 (단일 milestone → patch bump)** — receipt write가 세션 간에 조용히 덮이는 경로를 구조적으로 닫고, 같은 작업 단위를 두 세션이 동시에 잡는 상황을 감지·차단한다. grounding 결과 PRD의 "동시 쓰기 보호 없음"은 실제보다 **더 나빴다**: `store.js#writeReceipt`는 lock이 없는 데 더해 **원자성도 없었고**(최종 경로 직접 `writeFileSync`), `assertNoTrackedOverwrite`는 read-then-write TOCTOU이며 그 보호마저 git-tracked ship receipt에만 적용돼 실제 대다수인 plan/implement receipt는 완전 무보호였다. store 밖 read-modify-write writer도 둘 더 있었다.

보증 범위는 정확히 셋이며 그 이상을 주장하지 않는다 — **G1** live 세션 간 동일 작업 단위 중복 점유 불가 · **G2** stale·부활 holder의 write-time 거부(tombstone TTL 내) · **G3** 모든 덮어쓰기는 보고되거나 감사에서 검출됨. 무조건적 상호배제는 파일시스템 원자 CAS를 요구하고 `rename`은 advisory lock에 대한 CAS가 아니므로, 확인과 rename 사이의 창은 원리상 닫히지 않는다. 덮인 writer가 이미 성공을 반환했을 수 있다는 잔여와 tombstone TTL 만료 후 replay fence lapse는 **명시된 잔여**이며 전역 단조 순번(M5) 없이 닫히지 않는다.

### Added
- `plugins/mccp/scripts/receipt/evidence-lock.js` — fail-closed 짧은 임계구역 + 원자 write. 메커니즘은 `session-ledger.js#withLedgerLock`(O_EXCL + bounded retry + stale reclaim) 미러, **실패 정책만 반전**(fail-soft → throw). 공개 API는 전 구간을 소유하는 `guardedWrite`/`guardedReadModifyWrite` **둘뿐**이고 raw lock context는 test-only(Implement-Codex R1 F3 — caller가 `assertOwned`를 빠뜨려도 정적 커버리지는 통과하는 형태를 API 차원에서 제거). lease(5s)는 PID liveness와 **무관하게** 적용(`pr-phase-lock` tri-state 미차용 — ms 단위 임계구역에서 lease 초과는 작업 중이 아니라 고장이고, tri-state + fail-closed는 영구 stall class를 만든다). rename retry 루프 **안에서도** heartbeat + 소유 재확인(R1 F5).
- `plugins/mccp/scripts/state/evidence-claim.js` — 작업 단위(=decision slug) 점유 레지스트리. holder 정체 `{session_id, host, session_pid}`이고 `session_pid`는 `process.pid`가 **아니라** `CLAUDE_PID`(cli.js가 write마다 새 프로세스라 process.pid면 같은 세션의 두 번째 write가 거부된다). live 판정은 자기완결 `last_touch` TTL(ledger PID 축은 이 아키텍처에서 무효라 미사용). **모든 claim mutation을 per-slug lock으로 직렬화**(R1 F2 — `O_EXCL`은 생성 원자성만 증명하고, evidence lock 키가 `(gate, slug)`라 게이트가 다르면 같은 stale claim을 둘 다 승계할 수 있었다). 승계자가 tombstone을 쓰므로 `releaseClaim` 호출 누락이 정확성을 깨지 않는다.
- `plugins/mccp/scripts/lib/msw-metrics/b2-coverage-gate.js` — B2 flip을 종속시키는 반증 가능 gate. **primary = 런타임 파일시스템 변형 감사**(receipts 트리 사전/사후 `path → {receipt_hash, mtime, size}` 스냅샷 → 모든 hash 변경이 대응 guard 이벤트를 갖는지 pre/post hash 양쪽 + ts ±30s로 판정), 보조 = 정적 lint + entrypoint 레지스트리. **런타임 관측 아티팩트 없이는 `ok:false`(indeterminate)**를 반환한다(R1 F4 — 정적 축만으로 통과하면 primary를 한 번도 관측하지 않고 `computed`로 뒤집힌다).
- `docs/multi-session-work-loop/evidence-conflict-design.md` — 점유 모델 · 충돌 taxonomy 4종과 B2 계상 규칙 · caller별 실패 정책 비대칭 · lease 근거 · coverage gate 명세 · M3/M5 경계 · **위협 모델 명시**(적대적 위조자는 범위 밖).

### Changed
- `plugins/mccp/scripts/receipt/store.js` — `writeReceipt`가 guarded write를 경유하고 `assertNoTrackedOverwrite` 재검이 **lock 안**으로 이동(TOCTOU 폐쇄). 신규 `updateReceipt`가 기존 receipt의 read-modify-write를 한 임계구역에 담아 caller가 조합을 잊을 수 없게 한다. 출력 바이트 불변(§3.12).
- `plugins/mccp/scripts/lib/briefing/index.js` · `lib/completion-ledger/index.js` — 직접 `writeFileSync` 제거, read까지 임계구역 안으로. 실패 정책은 `writeReceipt`와 **의도적 비대칭**(carve-out 필드만 건드리므로 fail-open + loud skip).
- `plugins/mccp/scripts/receipt/write.js` — `restampGroundingVerdict`가 `updateReceipt` 경유(이 restamp는 `receipt_hash`를 재계산하므로 lost update가 stale seal을 되살릴 수 있었다).
- `plugins/mccp/scripts/state/msw-events.js` — ALLOWED_FIELDS에 `work_unit`·`conflict_kind`·`holder_session`·`pre_hash`·`post_hash`·`claim_epoch`·`target`·`event_id` 추가(**추가만** — 기존 필드·cap·malformed 격리 불변). **CL-5**: 경로를 cwd 상대에서 명시 repoRoot 해석으로 교정(`opts.dir` > `opts.repoRoot` > walk-up > 레거시) + 두 hook caller가 repoRoot 전달. `event_id` append 시점 부여(R1 F6 — 이중 위치 스캔의 dedupe 키).
- `plugins/mccp/scripts/derive/sources/session-activity.js` — dead read(`kind==='conflict'|'collision'`, producer 부재) 제거 → 신규 taxonomy. `collision_producer_present`를 `evidence_guard_active`에서 파생(**충돌 건수와 독립** — M2가 요구한 independent signal). 구·신 위치 이중 스캔 + `event_id` dedupe.
- `plugins/mccp/scripts/lib/msw-metrics/index.js` — `computeB2` flip: producer-present ∧ coverage gate 통과 시 `computed`(분자 = `overwrite_observed`, 분모 = `concurrent_pairs`), 분모 0 → `invalid`, 그 외 → `forward-only` 유지. `prevented`는 병기하되 **분자 미계상**(계상하면 방어가 잘 될수록 지표가 나빠진다).
- `plugins/mccp/scripts/derive/cli.js` · `lib/msw-metrics/fixture.js` — claimed-computable에 B2 복귀 + fixture가 compute 경로를 실증.
- `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js` — expanded 슬라이스를 index 순서에서 **의사결정 우선순위**로(B2가 index 4라 `TOP_EXPANDED=3` collapse에 묻히던 문제). `METRICS_META.B2` 라벨을 `overwrite_observed` 의미로 갱신. 값 셀은 `n/N` 단일 지표, `prevented`는 collapse 상세, 신규 색 클래스 0, 신규 문자열 em-dash 0.
- `plugins/mccp/scripts/hooks/session-start.js` — 다른 live 세션 점유 작업 단위를 `<system-reminder>`로 통보(**advisory** — 차단 없음, fail-loud-open). 소스는 `listClaims()` **단독**(ledger PID 축 미사용).
- `plugins/mccp/commands/work.md` — Step 0 조기 점유 확인 + enforcement locus를 같은 문장 안에서 구분하는 안내.
- `plugins/mccp/.claude-plugin/plugin.json` `1.23.0 → 1.23.1` + renderer footer 2면 동기 + `.gitignore`(`evidence-claims/` **선행** 등록) + `CLAUDE.md` §3.6(세 번째 lock)·§4(토글 1개).

### Fixed (pre-ship code review)

`/mccp:code-review` 로컬 리뷰가 잡은 지적을 같은 milestone 안에서 흡수. 보증 G1~G3 구조는 무변경이고, 전부 reader·lint·분류 축의 국소 수정이다.

- **소스의 리터럴 NUL 제거** — `derive/sources/session-activity.js`의 `legacyKeyOf` 구분자가 원시 U+0000 문자였다. git이 파일을 **바이너리로 취급**해 텍스트 diff가 사라졌고(리뷰 불가), 머지 충돌은 hunk 단위 해소가 불가능해져 §3.5.1이 금지한 "한쪽 트리 통째로 취함" 형태를 강제했다. 6문자 이스케이프 시퀀스로 교체 — 런타임 문자열 값은 동일하고 소스는 순수 ASCII가 된다.
- **정적 lint 실효화** — `b2-coverage-gate.js`의 패턴이 리터럴 `receipts`(복수)만 봐서 **실제 writer 형태를 하나도 못 잡았다**: 이 milestone이 제거한 두 writer(`writeFileSync(receiptPath, …)` · `writeFileSync(p, JSON.stringify(receipt, …))`)와 승인 writer 자신의 형태까지 전부 통과했고 저장소 전체 스캔이 위반 0을 보고했다. 즉 store.js가 "현재 알려진 caller" 한정의 근거로 삼은 guardrail이 실재하지 않았다. `/receipt/i` 단수 + `receiptPath()` 파생 경로 축을 추가하고, 주석 줄은 검사에서 제외(금지 형태를 문서에 적는 것이 위반이 되던 문제), 감사자 자신은 명시 예외(그 예외의 전제 — receipt 경로에 쓰지 않음 — 은 test가 고정). 실재했던 writer 형태 4종을 회귀로 pin.
- **예방을 사고로 계상하던 B2 분자 교정** — `evidence_overwrite_observed`가 rename **전** 검출(`base-hash-changed`·`lock-lost-before-rename`)에도 붙었는데, enforce에서 그 경로는 write를 **거부**한다. 차단된 경합이 분자에 들어가 **방어가 잘 될수록 지표가 나빠지는** 역인센티브가 생겼다(설계가 `prevented`를 분자에서 뺀 이유와 같은 성질). kind를 **검출 시점**으로 결정 — pre + enforce → `prevented`, warn(막지 않음) → `observed`, post(이미 착지) → 항상 `observed`.
- **dead read 제거** — reader가 `work_claim_denied` kind를 셌으나 그것을 emit하는 producer가 없어 `claim_denied_count`가 구조적으로 0이었다(제거한 `conflict`/`collision`과 같은 결함이 한 필드 옆에서 재발). claim 거부는 `evidence_conflict_prevented` + claim-fence `conflict_kind`로 나가므로 그 discriminator에서 파생하도록 교체.
- **분모 0 판정** `invalid` → `insufficient` — 이 모듈에서 `invalid`는 데이터 모순(unit spike·timestamp inversion·type separation)을 뜻하고 렌더러 최우선 버킷에 오른다. "겹친 세션이 아직 없다"는 부재이지 모순이 아니며, 그대로 두면 **1인 세션 저장소**(가장 흔한 구성)에 상시 무결성 오탐이 뜬다. 같은 파일 C1의 선례와 정합.
- **잔여 정리** — `updateReceipt`의 gate-dir symlink 검사를 lock 획득 **앞**으로(검사 전에 junction을 통해 lock 파일이 worktree 밖에 쓰이던 defense-in-depth 축소) · `completion-ledger`의 dead import · `evidence-claim`의 도달 불가 `presentedEpoch` 분기 · `write.js`가 git-tracked `fix-task-applied.md`에 절대 Windows 경로를 기록하던 것을 repo-relative로.

## [1.23.0] — 2026-07-25

**무결성 통일 cycle M3 — terminal `/mccp:pr` non-approving mechanical hard-stop 재설계 (PRD 종료 → minor bump)** — M1이 durable corpus의 verdict-SoT를 세우고 M2가 독립 무결성 4축을 닫았지만, **terminal `/mccp:pr` 게이트 자체는 여전히 non-approving PR-Codex 결과(`resolution.codex_verdict='divergent'` 등)를 mechanical하게 막지 못했다** — 파서는 복구됐으나 terminal 게이트에서 audit-only였다(backlog 2026-07-21 HIGH). M3은 이 gap을 닫는다: no-ship verdict(`divergent`/`critical`/`unavailable`/absent)를 낸 pr-codex receipt는 push/`gh pr create` **전에** mechanical HALT되고, 유일한 우회는 audited override env `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE="<reason>"`다. override는 verdict를 `converged`로 **재작성하지 않는다** — receipt는 실제 divergent verdict를 봉인한 채 `meta.pr_codex_force_override=true`와 함께 auditable하게 ship된다(§3.12 봉인 + dedupe fail-closed 무손상). 이 축의 즉시 흡수 시도가 8라운드 비수렴 루프의 직접 원인이었어서 우회 표면(env opt-out·lock·crash-window·session key·absent-verdict·re-entrancy)을 plan 단계 §Design Decisions(DD1~DD7)에서 선제 설계로 닫았다. Implement-Codex는 이번 환경에서 실작동해(R0 probe만 timeout, 실 review는 라운드당 ~8분) M3 ship-gate를 **cross-model 4라운드 적대 리뷰**했고, R1~R3의 core fail-open 5건을 fail-closed로 흡수(아래 Absorbed 참조) 후 R4 F6(defense-in-depth)만 DEFER_TO_BACKLOG했다. Implement-Codex receipt는 §3.12 dogfood대로 **divergent 봉인**(F6 미해소 정직 반영). integrity-unification PRD 전체 완료 → §3.7 minor bump.

### Added
- `plugins/mccp/scripts/lib/pr-ship-gate.js` — 단일 pure 오라클 `deriveShipDecision(receipt, {forceOverrideActive})` → `{ship, blockingVerdict, absent, overrideActive, reason}`. `receipt-convergence.js#isDivergentVerdict`(M1 공유 헬퍼) 재사용 + `unavailable`/absent fail-closed 추가. 이중 enforcement locus(finalize runtime primary + validate-cmd canonical)가 **같은 오라클을 공유**해 판정 drift를 구조적으로 차단(DD2). `EX_SHIP_BLOCKED=12` export(codex-invoke blocking exit 정합).
- `plugins/mccp/scripts/lib/tests/pr-ship-gate.test.js` — 파티션 전건(converged/skipped→ship · divergent/critical/unavailable/absent→no-ship) + override가 verdict 재작성 안 함(blockingVerdict 보존) + null-safety 17건.

### Changed
- `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js` — **runtime 1차 강제**(primary spine). `--pr-codex-force-override-reason` accept+forward → write가 `meta.pr_codex_force_override` stamp. write 성공 후 `gate==='mccp-pr-codex'`이면 방금 쓴 receipt 재read → `deriveShipDecision` → no-ship이면 `[MCCP-GATE-STOP]` stderr + **exit 12** 반환(pr.md HALT). finalize는 write 경로 자체라 LLM이 누락 불가(DD2). 재read 실패는 fail-closed.
- `plugins/mccp/scripts/receipt/validate-cmd.js` — **canonical/외부 표면**(defense-in-depth). preceding-gate 루프 후 `isPrTerminal && opts.checkShipVerdict` gated self-verdict gate: `mccp-pr-codex` receipt를 **verdict를 신뢰하기 전** schema+subject/receipt tamper 재검(4종 fail-closed blocking kind — `pr_codex_nonconverged`·`subject-tamper`·`receipt-tamper`·`ship-gate-schema-invalid`) 후 `deriveShipDecision`(env OR meta override 존중) → no-ship+override 미활성 → `blocking.kind='pr_codex_nonconverged'`, override 활성 → `warning.kind='pr_codex_force_override'`. **flag 미전달 시 전체 skip** → 조기 preflight(1.6)·표준 code-review 무영향(DD4 re-entrancy·DD5 historical 자동 충족).
- `plugins/mccp/scripts/receipt/schema.js` · `write.js` · `cli.js` — `meta.pr_codex_force_override`(bool default false) + `_reason`(string|null, override=true 시 strict `validateReason` REJECT — impeccable 패턴 mirror) present-only 배선 + `validate --check-ship-verdict` 옵션. `receipt_hash` carve-out 무변경(override 결정은 verdict와 함께 tamper-protected). 기존 git-tracked ship corpus는 present-only라 unchanged.
- `plugins/mccp/commands/pr.md` — Phase 0.4 override preflight(0.1/0.2 mirror, 0.3 mutex와 독립) · 2.5.4 line 480 노트 갱신("이제 M3 ship gate가 divergent verdict를 mechanical HALT") · 2.5.7 override forward + `FINALIZE_EXIT==12` ship-block 분기 · Phase 2.5.9 self-gate read-back(`--check-ship-verdict`) — 단일 kind가 아니라 **aggregate `ok===false`로 HALT**(4종 ship-gate blocking kind 전부 존중 + validate 출력 parse 실패도 fail-closed) · Phase 4 `## PR-Codex Override` inject.
- `plugins/mccp/.claude-plugin/plugin.json` `1.22.6 → 1.23.0`(minor — integrity-unification PRD 종료) + renderer footer(html/markdown) 동기 + `CLAUDE.md`/`integrity-unification-m1.plan.md`(M3 in-progress)/`codex-findings-backlog.md`(2026-07-21 HIGH ABSORBED, row 보존).

### Tests
- `lib/tests/pr-phase-helpers/finalize-receipt.test.js` — M3 runtime e2e 7건(divergent→exit12+GATE-STOP · approve→0 · skipped→0 · unavailable→exit12 · override→0+meta stamp+verdict 봉인 · 나쁜 reason write REJECT · plan gate 미발화). `receipt/tests/validate-cmd.test.js` — self-gate 12건(divergent/absent→block · converged/skipped→ok · meta/env override→warning · 나쁜 reason 미우회 · **flag 없으면 무영향**(re-entrancy) · non-terminal 미발화 · pre-write no-op) + ship-gate 무결성 2건(**위조 divergent→converged**=receipt-tamper block으로 silent ship 차단 · schema-invalid enum=ship-gate-schema-invalid block). `receipt/tests/schema.test.js` · `write.test.js` — override 필드 valid/invalid-reason REJECT·round-trip·verdict 봉인 12건.

### Absorbed (Implement-Codex R1 — cross-model, 2 HIGH → fail-closed)
- **F1 (validate-cmd.js)** — `--check-ship-verdict` self-gate에서 `readReceipt`가 `null`(receipt 부재)을 반환하면 read-error만 block하고 null은 comment-only no-op라 `ok===true`로 통과했다. checkShipVerdict는 **POST-finalize read-back(pr.md 2.5.9)에서만** 세팅되므로 receipt 부재는 anomaly → 신규 blocking kind `ship-gate-receipt-missing`으로 fail-closed(pr.md는 이미 `ok===false` 게이트라 무변경, DD4/DD5 무손상 — flag 없는 조기 preflight는 미발화).
- **F2 (pr-ship-gate.js)** — `deriveCodexFlags`가 `codex_outcome ∈ {skipped(reason), deduped, disabled}`를 verdict `skipped`로 매핑하는데, ship-gate가 `skipped`를 무조건 approving으로 취급해 위조/malformed `{codex_outcome:"skipped"}`(reason 없음)이 Codex 승인·증거 없이 ship될 수 있었다. `deriveShipDecision`이 이제 `skipped` verdict를 sanctioned proof 마커(`codex_skipped_at_pr`/`codex_dedupe_at_pr`/`codex_disabled[_at_pr]`) 존재 시에만 ship 허용, 부재 시 `blockingVerdict='skipped-unproven'`로 fail-closed. 정규 skip/dedupe/disabled 경로(전부 proof 마커 stamp)는 무변경.
- 회귀 test 6건 추가/전환(pr-ship-gate skipped proof/unproven/override, finalize skipped-with-reason/deduped/unproven-exit12, validate-cmd skipped-dedupe-ok/skipped-unproven-block, missing-receipt-block).

### Absorbed (Implement-Codex R2 — cross-model, 2 HIGH → fail-closed)
- **F3 (finalize-receipt.js)** — runtime primary 게이트가 receipt 재read 후 schema/subject_hash/receipt_hash 검증 없이 바로 `deriveShipDecision`을 신뢰했다. write 후 corruption/replacement이 non-approving verdict을 converged로 뒤집으면 primary가 exit 0 반환하고, markdown 2.5.9 read-back(skip 가능)에만 의존했다. finalize가 이제 `deriveShipDecision` **전에** validate-cmd와 동일한 schema+subject+receipt hash 검증을 수행하고 mismatch 시 `EX_SHIP_BLOCKED` — 두 locus 모두 tamper에 self-sufficient.
- **F4 (finalize-receipt.js + validate-cmd.js)** — self-gate가 `decisionId`로만 receipt를 로드하고 finalize write에 bind하지 않아, 같은 decision의 **stale converged receipt**(옛 `head_sha`)가 현재 미리뷰 HEAD를 ship 인증할 수 있었다. 두 locus가 이제 `receipt.head_sha`를 현재 `git rev-parse HEAD`와 대조 → 불일치 시 신규 kind `ship-gate-stale-head`로 fail-closed(head_sha는 subject 필드라 tamper-보호됨; git 실패 시 sub-check만 skip). 정규 flow(finalize→read-back 동일 HEAD)는 무영향.
- 회귀 test 2건(validate-cmd stale-head block; finalize 정규 경로가 F3/F4 false-block 없이 여전히 ship) + `sealReceipt` fixture를 실 HEAD로 전환.

### Absorbed (Implement-Codex R3 — cross-model, 1 HIGH → fail-closed)
- **F5 (finalize-receipt.js + validate-cmd.js + cli.js + pr.md)** — R2 F4의 head_sha binding으로는 부족했다: 공격자/동시 `/mccp:pr`이 **같은 decision·같은 head_sha의 converged receipt**를 write와 re-read 사이에 swap하면 head 체크·self-consistency를 통과해 divergent write를 shadow하고 ship됐다. 정합의 유일한 방법은 이번 write가 봉인한 **정확한 receipt_hash** 대조. finalize가 write CLI(pr-codex는 non-quiet)가 반환한 `receipt_hash`를 붙잡아 re-read와 대조 → 불일치 시 `EX_SHIP_BLOCKED`(runtime primary가 write에 self-bind). 추가로 finalize가 sealed hash를 emit → pr.md 2.5.7이 캡처 → 2.5.9 read-back에 `--expected-receipt-hash`로 forward → validate-cmd가 신규 kind `ship-gate-hash-mismatch`로 defense-in-depth 재bind. 정규 flow(동일 receipt)는 무영향.
- 회귀 test 2건(validate-cmd expected-hash match→ok / mismatch→block). finalize 정규 경로가 non-quiet 전환·binding 후에도 여전히 ship(happy-path가 binding 가드).

### Deferred (Implement-Codex R4 — 1 HIGH → backlog, defense-in-depth)
- **F6 (dedupe skip proof 미재검증)** — `pr-ship-gate.js#hasSkipProof`가 `codex_dedupe_at_pr===true`를 `skipped` verdict의 충분 증거로 신뢰하지만 ship gate가 plan/implement receipt의 현재 convergence·residual을 재검증하지 않는다. 실제 flow에선 Phase 2.5.2 `evaluateForDedupe`(v1.20.3 fail-closed)가 dedupe 플래그 세팅 전에 이미 검증하므로 F6은 그 upstream 검증의 ship-시점 재검증(defense-in-depth)이고 exploit은 codex-result.json 파일 위조(단일 사용자 위협모델 밖)를 요구한다. 완전 fix(검증가능 sealed dedupe proof — plan/implement hash·verdict·head/base·residual digest 봉인 후 재검증)는 새 스키마+배선이 필요한 후속 milestone 규모라 `codex-findings-backlog.md`(2026-07-30 HIGH)로 이연. M3 core(non-approving mechanical hard-stop) 무손상.
- Implement-Codex receipt(`mccp-implement-codex/integrity-unification-m3`)는 최종 raw verdict(needs-attention)를 **divergent로 봉인** — cross-gate dedupe fail-closes → M3 코드가 `/mccp:pr` PR-Codex를 실제로 받게 됨(§3.12 dogfood). 4라운드 triage 상세는 `.claude/notes/integrity-unification-m3-implement-review.md`.

### Note
- briefing hang(2026-07-21 HIGH, exit-127)은 M3 scope 밖(PR-gate operability, verdict-SoT 아님)이나 dogfood를 막으므로 implement/test 시 `MCCP_BRIEFING=off`로 우회(문서화된 §4 토글 — 요약 stamp만 끔, 리뷰 무약화). pre-existing 실패 2건(`verdict-label` · `design-critique-loop-e2e` fixture)은 별도 cycle baseline.

## [1.22.6] — 2026-07-24

**무결성 통일 cycle M2 — 독립 무결성 fixes** — M1이 durable corpus를 지키는 tightly-coupled 3축을 닫았다면, M2는 서로 다른 trust boundary에 흩어진 **서로 독립적인** 국소 결함 4건을 닫는다(롤백·호환성 위험이 M1과 분리되므로 별도 milestone; 각 Task 자기완결 회귀 test, 순서 불변식 없음). Implement-Codex는 환경 Codex companion `exit-nonzero`(~20s crash)로 **advisory** 진행(운영자 승인, M1 #110 선례) → receipt `codex_verdict='unavailable'` 봉인 → PR-Codex 별도 발화. security-reviewer agent가 security-sensitive 두 축(leak-scan · subject-tamper)을 독립 검토해 SOUND 확인(Codex 부재 부분 보완). M3(terminal `/mccp:pr` non-approving mechanical hard-stop 재설계)는 별건.

### Changed
- `plugins/mccp/scripts/receipt/validate-cmd.js` · `receipt/preflight.js` — subject_hash mismatch를 `result.stale`→`result.blocking` `kind:'subject-tamper'`로 승격(Task 1). receipt_hash receipt-tamper 블록과 대칭 — `subjectHash`는 SUBJECT_FIELDS self-consistency seal이라 mismatch=서명-후-변조(tamper)이지 plan staleness(별도 plan_hash 비교)가 아니고, stale→"regenerate STALE" 힌트가 tamper 증거를 파괴하던 subject-side 잔여(M1이 `receipt_hash`에 대해 이미 닫은 것과 동일 잠복 결함)를 닫는다. preflight는 subject-tamper에 "Do NOT regenerate" INTEGRITY 힌트 + TAMPER 라벨 확장.
- `plugins/mccp/scripts/lib/history-leak-scan.js` — allowlist를 `oid→paths[]`로 확장(Task 2, R5-F3). `git rev-list --objects`는 blob당 first-path 1개만 방출하므로(실측 — 플랜의 "다중경로 방출" 가정 정정) range 커밋 `git ls-tree -r`로 전 경로를 증강하고 allowlist를 **경로별**로 판정. 같은 blob이 allowlisted fixture 경로 + non-allowlisted real 경로에 도달할 때 real leak을 더 이상 억제하지 않는다(pre-push secret/path backstop 복구). ls-tree 실패는 fail-closed(cat-file scan-error 계약 미러).
- `plugins/mccp/scripts/lib/briefing/invoke.js` — raw `!!res.converged`를 `receipt-convergence#isConvergedVerdict(res)`로 교체(Task 4) + import 추가. divergent/critical ship이 briefing 요약에 "converged: true"로 오기되던 M1 Task 1b sweep의 마지막 raw 소비처를 정합(derive projection은 M1이 이미 교정).
- `plugins/mccp/.claude-plugin/plugin.json` `1.22.5 → 1.22.6` + renderer footer(html/markdown) 동기.

### Tests
- `receipt/tests/validate-cmd.test.js` — subject-tamper 회귀 2건(stale→blocking flip · receipt-tamper pre-empt). `lib/tests/history-leak-scan.test.js` — 다중경로 회귀 2건(non-allowlisted sibling leak 보고 + all-allowlisted 억제 regression-0). `lib/tests/codex-review-payload.test.js` — 실-producer envelope 회귀 4건(Task 3 verify-and-close). `lib/briefing/tests/invoke.test.js` — divergent/critical ship "converged: false" 회귀 4건.

### Note
- Task 3(`parseReviewPayload`)은 **코드 변경 없음** — 현 `.stdout`→`.result.verdict` 파서가 실-producer 응답을 정상 파싱함을 실측·회귀 fixture로 봉인(verify-and-close, "통과했다≠검사했다" drift 방지). backlog 3행(2026-07-08 subject_hash · 2026-07-22 parseReviewPayload · 2026-07-23 R5-F3) ABSORBED 표식(row 보존).

### Fixed (Codex divergent absorption, 2026-07-25 — PR #113)
Codex quota 회복 후 M2 diff에 실제 adversarial-review 재실행 → verdict `needs-attention`(divergent) 2건. 로컬 code-review(Claude leg)가 놓친 것을 cross-model이 잡음. 운영자 결정 = 둘 다 수정.
- **F2 [MEDIUM]** — tamper 메시징이 `preflight.js`(CLI)에만 있고 실제 슬래시-명령 enforcement 표면인 `receipt-prompt.js`(UserPromptExpansion)·`receipt-skill.js`(Skill)는 여전히 generic `INVALID` + 항상 "Write missing receipt"를 출력(tamper receipt regenerate/overwrite 유도 = 증거 파괴). 신규 shared formatter [`receipt/block-format.js`](plugins/mccp/scripts/receipt/block-format.js)(`entryLabel`/`tamperGuidanceLines`/`hasTamper`/`blockDetailLines`)로 **3개 표면 통일** — 어디서나 `TAMPER` 라벨 + "Do NOT regenerate", "Write missing receipt"는 `missing.length>0`일 때만. hook `additionalContext`도 tamper 시 INTEGRITY 분기. hook은 fail-open optional require.
- **F1 [HIGH→실질 MED]** — `history-leak-scan.js`의 `byOid`가 `rev-list --objects base..HEAD`(base 도달 객체 제외)로만 seed되어, base에 이미 존재하는 leaking blob과 동일 콘텐츠를 non-allowlisted 새 경로에 추가하면 미스캔 → `ok` 오보고. **2회 정련**: R1의 순-diff(`git diff --raw base..HEAD`)는 Codex 재리뷰가 ancestor-only 잔여(중간 커밋 복사→HEAD 전 삭제)를 지적해 불충분 → R2에서 **base-tree map(`git ls-tree -r <base>`) + 전-커밋 ls-tree walk**로 교체. 각 range 커밋의 전체 트리를 순회하며 NEW blob 또는 base 미발행 `(oid,path)`의 OLD blob을 fold-in → 삭제된 중간-커밋 경로까지 포착(F-H ancestor-leak 보증 완전화). base map 실패 fail-closed.
- **F3 [MEDIUM]** (Codex R3) — `history-leak-scan.js`의 `resolveBase()`가 null(opts.base·origin/main·origin/master·main·master 전부 부재)이면 `scanRange`가 `ok:true`로 silent pass — unclassified range를 empty range처럼 통과시켜 bare CI checkout에서 HEAD를 미스캔 publish(fail-open). `ok:false` + scan-error로 fail-closed 전환(F1 R2가 표방한 fail-closed 계약 완성). pre-existing이나 흡수.
- **F4 [HIGH]** (Codex R4) — `buildLeakPatterns()`가 repo-root를 case-sensitive RegExp로 컴파일 → Windows(case-insensitive fs)에서 `X:\parent\repo`와 `x:\parent\repo`가 동일 위치인데 방출 casing만 탐지, 다른 casing 같은 경로 leak이 backstop 통과. drive-letter(Windows) root는 `i` 플래그로 컴파일(POSIX는 case-sensitive라 그대로), old-repo drive-letter 패턴은 항상 `i`. 본 환경이 Windows라 실제 dev 플랫폼 우회. pre-existing이나 흡수.
- **F5 [HIGH]** (Codex R5, F4 self-inflicted) — F4 설명 주석/report가 실제 workspace root를 리터럴 예시로 embed했고, F4가 켠 case-insensitive 매칭이 그 줄을 자기-소스 leak으로 탐지 → pre-push 스캔 실패(실측 3 leak). 예시를 전부 synthetic(`X:\parent\repo`)으로 교체 + 실제-root로 컴파일한 패턴이 소스에 0-match임을 단언하는 회귀 test. leaky blob은 F4 커밋(unpushed HEAD)에만 있어 `git commit --amend`로 rewrite(F1 R2 ancestor-leak 보증을 자기 자신에 dogfood, force-push 불필요).
- Tests: `receipt/tests/block-format.test.js`(신규 8) · `hooks/tests/receipt-prompt-tamper.test.js`(신규 3) · `preflight.test.js`(+1 subject-tamper) · `lib/tests/history-leak-scan.test.js`(+5: F1 base-blob-new-path · F1 R2 ancestor-only-deleted-before-HEAD · F3 unresolved-base-fail-closed · F4 windows-case-variant · F5 self-source-no-leak) + 실 pre-push 스캔 leaks=0. Codex 수렴 loop 5+라운드(#1 F1H+F2M → #2 F1 ancestor-only → #3 F3 → #4 F4 → #5 F5 자기-leak), 매 라운드 실제 결함 정확히 좁힘(F3/F4는 pre-existing 하드닝, F5는 스캐너 self-dogfood). 버전은 1.22.6 유지(미머지 M2에 리뷰 흡수).

## [1.22.5] — 2026-07-24

**무결성 통일 cycle M1 — verdict-SoT + hash 무결성 core** — durable-evidence-substrate(#110)가 ship receipt를 git-tracked 감사 corpus로 승격했으나, completion-ledger 승인 술어가 여전히 `resolution.converged`(always-true, "writer finalized" ≠ "Codex approved")를 1차 게이트로 읽어 **거짓 승인이 durable corpus에 영구 기록되는 상태가 진행 중**이었다. M1은 corpus를 지키는 tightly-coupled 3축(ledger 승인 술어 · stage-guard write-side · audit read-side)을 verdict SoT=`resolution.codex_verdict`, 무결성=`receiptHash` 재계산+schema validate로 통일한다. Implement-Codex는 환경 Codex companion timeout(570s)으로 **advisory** 진행(운영자 승인) — cross-model 적대 검토는 plan-codex `divergent` 봉인 → dedupe fail-closed로 `/mccp:pr`(PR-Codex)에 이연. M2(leak-scan·subject_hash·parser fixture)·M3(terminal gate 재설계)는 별건.

### Added
- `plugins/mccp/scripts/lib/receipt-convergence.js` — codex_verdict-first 수렴 read 헬퍼(`isConvergedVerdict`/`isDivergentVerdict`). `codex_verdict ∈ {divergent, critical}`이면 `resolution.converged`가 true여도 **절대 converged 아님**. `resolution.converged`를 직접 읽던 모든 소비처(semantic + display)가 이 한 곳으로 통일.
- `plugins/mccp/scripts/migrations/v1.22.5-ledger-verdict-repair.js` — 기존 ledger 엔트리를 ship receipt와 대조 재판정해 `verdict_provenance`(`codex-verdict`/`legacy-unknown`/`superseded`)를 stamp. idempotent · `--dry-run` · **cardinality-invariant(never drop)** · in-place body edit(receipt_hash·파일명 불변, no-rehash §3.12). 실측: 28 엔트리 → 9 codex-verdict + 19 legacy-unknown + 0 superseded, 28→28 불변.
- 테스트 4종 — `migrations/tests/v1.22.5-ledger-verdict-repair.test.js`(분류 오라클·cardinality·idempotency·superseded 보존·no-rehash) · `lib/tests/receipt-convergence.test.js`(헬퍼 + derive projection + escalate 회귀) + 기존 evidence-stage-guard/evidence-audit/completion-ledger 테스트에 신규 케이스 추가.

### Changed
- `plugins/mccp/scripts/lib/completion-ledger/index.js` — 승인 술어를 **codex_verdict-first**로 교체(Task 1). `resolution.converged`는 신뢰 키에서 은퇴. NEW append = `converged`(∧ actionable≠true)·`skipped`·`unavailable`만; `divergent`/`critical`/absent는 fail-closed skip. **운영자 승인 deviation**(plan의 converged-only 초안 대비): `skipped`(dedupe happy-path)·`unavailable` append 유지 — dedupe는 plan+implement 둘 다 converged일 때만 발화하므로 PR ship이 `skipped`가 되고, 이를 제외하면 가장 잘 리뷰된 결정이 corpus에서 누락된다.
- `plugins/mccp/scripts/lib/completion-ledger/store.js` — 엔트리 스키마에 `verdict_provenance`(present-only enum) 추가.
- `plugins/mccp/scripts/lib/evidence-stage-guard.js` — `validateContent`(PURE)가 hash tamper 검증 후 `schema.validate` + `gate_id==='mccp-pr-codex'` + `phase==='pr'` + 파일명 slug↔`decision_id` 일치를 fail-closed 강제(Task 2, R5-F1).
- `plugins/mccp/scripts/lib/evidence-audit.js` — `hash_bound` 집계가 declared-hash 일치에 더해 `receiptHash` 재계산 + `schema.validate`를 요구(Task 3, R5-F2, Task 2와 대칭). 실측 corpus 불변(hash_bound 9, state incomplete).
- `plugins/mccp/scripts/derive/sources/receipts.js` · `receipt/status.js` · `derive/sources/worktrees.js` · `lib/escalate-detector.js` — `resolution.converged` 직접 읽기를 codex_verdict-aware로 이전(Task 1b). projection source(receipts.js) 수정으로 decision-state·audit-timeline·snapshot이 자동 상속. 실측: divergent ship 3건이 이제 `converged=false`로 표시.
- `plugins/mccp/.claude-plugin/plugin.json` `1.22.4 → 1.22.5` + renderer footer(html/markdown) 동기.

## [1.22.4] — 2026-07-22

**내구 증거층 봉인 — 감사 가능성 복구 (Phase A)** — worktree 삭제 워크플로에서 ship receipt 증거가 소실돼, 교차 세션 감사가 정반대 결론에 도달하는 2차 결함(E1: 대조 대상 부재를 "이상 없음"으로 보고)을 닫는 독립 chore. 핵심 분리: **receipt는 참(`codex_verdict: divergent`를 정직 기록)이고 ledger가 거짓(그것을 `converged`로 뒤집음)** — 따라서 receipt 추적은 지금 가능하고(오히려 술어 결함을 증명), ledger 소급 정정은 술어 수정(별건 E2) 뒤 Phase B로 미룬다. Codex adversarial review는 4라운드에서 수렴(needs-attention→approve).

### Added
- `plugins/mccp/scripts/lib/evidence-audit.js` — ledger↔receipt 대조 감사 도구. `comparable===0`이면 절대 `ok`/`clean`을 반환하지 않고 `state='blind'` + CLI 비영점 exit(E1이 만든 결함의 정확한 반대). 조인 키는 `entry.decision_id`(raw ledger files, no dedup), `entry.receipt_hash`↔`receipt.receipt_hash` 결속은 `hash_bound`로 별도 보고(E4). read-only · LLM-free. main 실측 재현: `comparable=10 · ok=7 · false_positive=3 · unverifiable=19 · hash_bound=10`.
- `plugins/mccp/scripts/receipt/store.js#writeReceipt` — **덮어쓰기 HALT 가드**(Codex R3/R4 F1). git-tracked ship receipt를 다른 hash로 덮어쓰려 하면 fail-closed(정본을 교체하는 유일한 경로에 앵커 → 모든 호출자 커버). 탈출구: 정당한 재-ship은 **새 decision slug**. untracked·멱등 재작성·신규 decision은 무영향.
- 테스트 3종 — `lib/tests/evidence-audit.test.js`(blind 계약 고정) · `receipt/tests/overwrite-guard.test.js`(rebase 미경유 같은-slug 반복을 writer 직접 호출로 재현) · `receipt/tests/cwd-normalization.test.js`(신규 정규화 + carve-out 부재).

### Changed
- `plugins/mccp/scripts/receipt/write.js` — **신규** receipt의 `meta.cwd`를 repo-relative로 정규화(`.`/상대경로, repo 밖은 `<outside-repo>` placeholder). 기존 33건은 읽지도 쓰지도 않으며 `hash.js`에 `meta.cwd` carve-out을 추가하지 않아 기존 해시 불변(E4).
- `.gitignore` — ship receipt(`mccp-pr-codex`)를 감사 대조 corpus로 git-tracked 전환(`.claude/receipts/*` + `!.../mccp-pr-codex/` 선별 해제). plan/implement receipt는 여전히 working-tree only. 부트스트랩 미검토 기본값(commit `375157d`) 대체.
- `plugins/mccp/commands/pr.md` — HEAD_SHA passthrough(F2-a: Phase 2.5 캡처값을 Phase 4가 재계산 없이 사용 → evidence-commit의 HEAD 이동에도 body-file 조회 성립) + receipt-only evidence-commit(Phase 3 push 직전, `mccp-pr-codex/` 한 경로만, `--amend` 금지, `completion-ledger/` 혼입 거부 — E6) + **rebase fail-closed HALT**(자동 재진입 금지 — HEAD 재작성이 ledger↔receipt 결속을 끊음, F2).
- ship receipt **clean 12건** git-tracked(내용 무변경). 유출 21건(구 저장소명 노출)은 Phase B rebind 후 추적(E7 — 감사 기여 0, 비가역 이력 공개 회피).
- `CLAUDE.md` — merge-commit 정책 + 증거 내구성 계약(재봉인 금지 근거 + `resolution.converged` 비신뢰 명시).
- `plugin.json` `1.22.3 → 1.22.4` + renderer footer×2.

### Follow-up — PR-Codex No-ship 흡수 (같은 1.22.4, PR 전 마감)

Phase A의 dogfood PR-Codex(R1 No-ship, 3 actionable)가 내구성 메커니즘 자체의 3결함을 표면화 → 첫 PR 전 흡수(버전 bump 없음 — 1.22.4를 완성). plan-gate는 6라운드 비수렴(`divergent` 봉인), Implement-Codex R1도 No-ship(3 HIGH 전부 ACCEPT_NOW·흡수).

- **F2** — `evidence-audit.js`가 comparable pair면 `state='ok'`/exit 0을 냈다(모순 노출 실패). graduated states로 교체: `inconsistent`(exit 3, `false_positive>0` OR `hash_bound<comparable`) · `incomplete`(exit 4, `unverifiable>0`) + 사다리 문서화. **Implement-Codex IF1**: agreement 검사를 total로(`verdictsAgree` — advisory/skipped ledger verdict도 corroborate 요구, 이전엔 무검증 통과). 실측 corpus는 `inconsistent`/exit 3(19 dangling + 3 false_positive 정직 노출).
- **F1** — `scripts/migrations/v1.22.4-cwd-rebind.js`(CREATE) — 33 tracked receipt의 절대 `meta.cwd`를 redact + 재해시하고 bound된 **git-tracked** ledger 9건을 **원자적으로 재키잉**(`## 3.12` 유일 sanctioned 재봉인). fail-closed lock(withLedgerLock fail-open을 flip) + TOCTOU re-read + new-ledger→receipt→unlink-old ordering + self-contained post-apply invariant scan(index 비의존) + explicit planned-set staging(`git add -A` 금지, E6 제외) + **exact-manifest gate**(정확히 M/D/A + blob content hash — concurrent-recreate 삭제 누락 포착). 16 test.
- **F3** — `pr.md` Phase 3 evidence-commit을 fail-loud-open → **fail-closed**(commit 실패 시 push 차단) + F1 pre-stage 절대-cwd 가드.
- **F-H/F-I** — `scripts/lib/history-leak-scan.js`(CREATE) — pre-push 전-blob HISTORY-leak 게이트: `origin/<base>..HEAD`의 모든 신규 blob(조상 커밋 포함)을 repo-root anchored·separator-flexible 패턴으로 스캔(receipt JSON의 double-backslash 형까지) + line/fixture-specific allowlist(directory-wide 금지). 10 test. 게이트가 tracked corpus의 latent fixture leak(`cwd-normalization.test.js`)을 표면화 → synthetic 경로로 정정.
- `CLAUDE.md` §3.12 — v1.22.4 cwd-rebind을 유일 sanctioned 재봉인으로 문서화(다른 writer는 no-rehash 불변식 유지).

## [1.22.3] — 2026-07-15

**Workflow-orchestration live-activation — M3 (operational USD firing-block 은퇴)** — M2의 firing-preview를 실제 dogfood 환경에 돌린 결과 **핵심 발화 실패 지점**이 표면화됐다: 정규 cost-state가 sticky critical(`$186.92` + `hard_ceiling_reached`)이면 M1이 default를 반전했어도 병렬·fan-out이 **전부 미발화**(`hard-ceiling`)였다. M1의 fail-open은 cost-state **부재**에서만 green을 가정하므로 **존재하는 critical**은 못 뚫었고, 그래서 M2 live 관찰(row A/B)도 비어 있었다. M3은 운영자 철학(비용<품질, cost gate는 환각 최소화 목적이지 절감 아님)을 USD-blocking 표면 전반에 일관 관철하되, Codex R1(No-ship, 2 HIGH + 2 MEDIUM)을 흡수해 "USD를 그냥 은퇴하고 agent-count cap에만 맡긴다"는 순진한 설계를 **다층 대체 backstop**으로 교체했다.

### Changed
- `implement-dispatch/budget.js` · `plan-fanout/budget.js` — **operational USD를 발화 blocker에서 은퇴**. `hard_ceiling_reached` skip은 `usdBomb` opt-in에서만 발동하고, `AUTODISABLE_TIERS_DEFAULT`가 `{critical}`→**empty**로 바뀐다. 명시적 `MCCP_{WORK_PARALLEL,PLAN_FANOUT}_AUTODISABLE_TIER` override는 두 default보다 항상 우선(불변). merge-strategy·single-partition·budget gate는 **무변경**(구조적 안전 보존).
- `implement-dispatch/budget.js` · `plan-fanout/budget.js` — **runaway clamp를 전 run 경로에 적용**(Codex F2). 기존엔 fail-open(telemetry 부재) 경로 전용이었으나, operational USD가 더 이상 metered 경로도 막지 않으므로 agent-count cap이 양쪽의 primary backstop이 된다. clamp는 N을 **낮추기만** 하므로 far-from-cap 세션은 무영향.
- `auto-chain.js` — `checkCostTelemetry`의 hard_ceiling abort를 **catastrophic-USD abort로 정렬**(Codex F3). 발화는 auto-chain gate 이전이라, 오라클만 열고 commit→pr abort를 남기면 stall이 뒤로 밀릴 뿐이다. telemetry-integrity trigger(missing/unreadable/stale)와 `chain_aborted`·kill-switch·receipt·previous-step trigger는 **불변** — 신뢰할 수 없는 신호는 지출액과 직교하므로 보수적으로 유지.
- `commands/work.md` · `commands/plan.md` — 오라클 호출에 `usdBomb`+`catastrophicUsd` forward. **read-then-bump 폐기** → 원자 `reserveWorkers` 위임(별도 `bumpCounter` 제거 — reserve가 이미 카운트). 발화 로그를 "operational USD 비차단 · catastrophic-USD/원자 runaway-cap backstop"으로 갱신.
- `orchestration-preview.js` — `usdBomb`+`catastrophicUsd`를 env 파싱해 양 오라클에 forward(실발화와 drift 구조 차단). runaway는 **read-only `clampForRunaway` 유지** — 관측이 세션 headroom을 소비하면 안 되므로 `reserveWorkers`는 정적으로 금지(test가 mechanical 검증). `oracle_run`/`effective_fire` 분리 불변(M2 F1) 유지.

### Added
- `orchestration-runaway.js#reserveWorkers` — **원자 check-and-bump**(Codex F2). 단일 lock 임계구역에서 `readCounter` → clamp → bump를 수행해 read-then-bump TOCTOU를 봉인한다(재진입/동시 dispatch가 동일 pre-bump 값을 관측해 각자 full fleet을 grant하던 결함). lock 고갈 시 **`granted=0` fail-closed**(`reason='lock-exhausted'`, PR-Codex R1 F1 4라운드) — 기록할 수 없는 launch는 cap 관점에서 fail-open이므로 허가하지 않는다. cap 도달 시 **`granted=0`**(`reason='cap-exhausted'`, PR-Codex R1 F1 5라운드). 순차 reserve 회귀: cap 8 · 요청 4 → `[4,4,0,0,0]`, 누적 총량 8(=cap).
- `orchestration-runaway.js#parseCatastrophicUsd` — `MCCP_ORCHESTRATION_CATASTROPHIC_USD`(default **500**), operational $100과 **분리된 대체 bomb detector**(Codex F1). $186은 통과, 진짜 폭주 비용은 차단. loud fail-open parse.
- `orchestration-runaway.js#parseUsdBomb` — `MCCP_ORCHESTRATION_USD_BOMB`(default **off**, 표준 `1|true|yes|on`), M1 USD bomb-detector를 전 표면(fleet·fanout·auto-chain)에서 정확 복원하는 back-compat kill switch. **unknown non-empty → off + loud warn**(Codex F4 — rollback path라 오타로 조용히 비활성되면 안 됨).
- REASONS `CATASTROPHIC_USD`(양 오라클) · `LOCK_EXHAUSTED`(runaway).

### Verified
- **Mechanical firing-open A/B**(LLM 0): 동일한 seeded sticky 상태($186.92 critical + hard_ceiling)에서 실 CLI로 — `usd_bomb` off(M3 default) → `fleet.run=true reason=ok-run` + `effective_fire.parallel_fires=true`, `usd_bomb=1`(M1 등가) → `run=false reason=hard-ceiling`. `CATASTROPHIC_USD=100` → `catastrophic-usd` skip(대체 bomb 유효). preview는 상태 미기록(read-only 유지).
- `docs/workflow-orchestration/live-activation-observations.md` — `preview-ref (M3)` row + §4.1 **live-완주 경로** 표. claim을 "firing-open + catastrophic 미만 시 live-완주 가능"으로 정직화(live 완주 관찰은 여전히 operator row A/B). build 시점 ambient cost-state가 이미 green으로 리셋돼 있었다는 사실도 정직 기록 — ambient preview는 M3 delta를 입증하지 못하므로 seeded A/B를 쓴 이유.

### Fixed — PR-Codex R1 5라운드 흡수 (2건 전부 ACCEPT_NOW, backlog 이연 0)

4라운드와 **같은 규칙, 인접한 구멍**이다. 4라운드는 `reserveWorkers`의 lock-고갈 분기를 닫고 cap이 지켜진다고 믿었으나, 같은 함수의 **cap-도달** 분기는 열려 있었다. M3이 operational USD를 은퇴시키며 이 카운터를 유일한 구조적 backstop으로 승격시켰으므로, cap 안의 구멍은 곧 M3 헤드라인이 거짓이라는 뜻이다.

- **F1 — cap이 도달 후 전혀 강제되지 않았다** (HIGH). `clampForRunaway`에 0을 반환하는 분기가 없어 cap 초과 시 항상 floor 1을 주고, `reserveWorkers`가 이를 조건 없이 누적·기록했다. 실측(cap=4): `launched`가 5,6,7,8,9…로 **상한 없이** 증가. cap이 아니라 병렬도 throttle이었다. → clamp를 **headroom-aware**로 전환(`remaining===0` → `n:0` + 신규 `cap-exhausted`; `0<remaining<requestedN` → `n:remaining`으로 기존 floor보다 정확). `reserveWorkers`는 `n===0`에 **write 없이** `granted:0`·`reservationId:null` 반환. floor의 명분("파이프라인을 완전히 막지 않는다")은 호출자의 **인라인 fallback**이 제공한다(인라인은 agent 미발화 → cap 미소비, 4라운드가 검증한 전제).
- **F2 — fan-out reconcile 실패가 실제 launch를 카운터에서 지웠다** (HIGH). 3회 재시도 실패 시 경고만 남기고 진행 → 예약이 pending 잔존 → lease가 prune → **떴던 agent가 증발**. 당시 주석은 잔여를 "conservative over-count until the lease resolves it"이라 적었으나, lease는 오차를 해소하는 게 아니라 **안전한 over-count를 위험한 under-count로 뒤집는다**(cap이 절대 틀리면 안 되는 방향). lease 만료 건전성의 명시 전제("fan-out은 호출 후 전 경로 명시 commit")가 깨진 지점이다. → reconcile CLI가 `actual>0`·미commit 시 **lock-free debt 마커**(`orchestration-runaway.json.debt/<id>.json`)를 자동 기록하고, `readCounter`·`reconcileReservation`이 해당 항목을 만료 대상에서 제외한다. 마커가 lock-free여야 하는 이유는 debt를 낳는 유일한 상황이 곧 lock 획득 실패라 순환이기 때문. 마커는 기존 pending을 **고정**할 뿐 카운트를 더하지 않아 이중 계산이 없고, 뒤늦은 reconcile이 commit하며 청소한다. `work.md`는 route가 launch **전** 경계라 HALT로 충분해 debt가 불필요(의도된 비대칭).
- **테스트가 버그를 정답으로 고정하고 있었다.** `reserveWorkers: sequential reserves cannot amplify past the cap`(cap 8 → 누적 11) · `end-to-end: … cannot exceed cap amplification`(cap 8 → 누적 11) · `F2: cost-state absence CANNOT bypass the cap`(cap 8 → 누적 12)이 전부 통과 중이었다. 셋 다 per-dispatch `granted`만 보고 **누적 총량**을 보지 않았다 — 이름이 약속한 불변식을 아무도 assert하지 않았다. 이제 총량을 assert한다.
- **pure oracle을 고친 이유**: read-only 불변식은 *mutate 금지*이지 *공식 고정*이 아니다. preview만 floor 1을 유지하면 발화가 거부될 상황에서 "1개 뜬다"고 보고하는 **false green-light**가 되고, 이는 M2 Codex F1이 `effective_fire`로 막으려던 바로 그 유형이다. 실측으로 preview(`run:false`/`cap-exhausted`) ↔ reserve(`granted:0`/`cap-exhausted`) 일치 확인. preview의 read-only(무-bump·무-write)는 그대로 — 정적/디스크 test 유지 통과.

### Fixed — PR-Codex R1 6라운드 + Implement-Codex R1 7라운드 + PR-Codex R1 5라운드(PR 게이트) 흡수 (전건 ACCEPT_NOW, backlog 이연 0)

4·5·6라운드가 전부 `reserveWorkers` **안팎의** 구멍을 닫는 동안, 진짜 결함은 **그 함수가 불리는 범위**였다. Implement-Codex가 흡수 설계 자체를 CRITICAL로 반려하며 그 층을 열었다.

- **6R F1 — caller가 5라운드의 새 zero-grant 이유를 소비하지 않았다** (HIGH). 5라운드는 `cap-exhausted`를 신설하고 오라클 3층(`orchestration-runaway`→`budget`→`route`)을 전부 고쳤지만 `work.md:253`의 **리터럴 비교**(`= "lock-exhausted"`)는 그대로 뒀다. 결과: cap 도달 시 denial 아티팩트 미작성 → `reserveDenied=false` → task route → `reservationId:null`인 미기록 worker. 4라운드가 닫은 누수가 5라운드가 만든 문으로 되돌아왔다. → 술어를 **구조적·이유-비특정**으로 전환: `run===false ∧ runawayReason != null`. `runawayReason`은 budget 오라클에서 `runawayClamp`가 실제로 돈 경우에만 세팅되므로(skip 기본값 null) 이 조합이 곧 "예약 시도 → granted 0"이며, 세 번째 이유가 생겨도 구멍이 안 열린다. `plan.md`의 동일 리터럴도 같은 술어로 정렬(그쪽은 `FANOUT_RUN=0`이 이미 호출을 막아 메시지 구체성 문제였다).
- **7R F1 — cap이 단일 worker를 한 번도 세지 않았다** (**CRITICAL**). 예약은 `resolveFleet`의 주입 clamp 안에서만 일어나고, `resolveFleet`은 work.md의 4중 가드(`ISOLATE≠0 ∧ PARALLEL≠off ∧ merge-strategy=worktree-merge ∧ partitions`) 뒤에서만 실행된다. 그런데 Step 3.route는 **무조건** 돌며 `task`/`workflow-single`을 반환하고 둘 다 worker를 실제로 spawn한다 — 예약 없이. 즉 **cap은 병렬 fleet만 세어 왔다**. A/B 실측(cap=4, 9회 호출): BEFORE 9개 spawn·`counter.launched`=**0**(카운터가 한 번도 안 움직임) / AFTER 4개 spawn·counter=4. 6라운드 fix-task의 sweep 기준 (c)"예약 미시도 = cap 미소비"는 **정확히 거꾸로**였다(실제로는 기록 없이 cap 소비) — cap 소비를 정하는 건 예약 시도 여부가 아니라 **route**다. → 예약을 **공통 pre-launch 경계(Step 3.route)로 이동**. fleet 예약 부재 ∧ 신규 순수 오라클 `route.js#requiresReservation($ROUTE)` 참이면 `orchestration-runaway.js reserve --n 1`, `granted:0`이면 `ROUTE=inline` 강등(기록 불가능한 launch 금지), 아니면 `--actual 1` 즉시 commit 후 launch. commit 실패는 HALT(route가 pre-launch 경계라 중단해도 un-spawn할 게 없다). `route.test.js`가 ROUTES enum **전수**를 검증해 5→6라운드의 "새 enum 값 + 미갱신 소비처" 실패 형태를 구조적으로 막는다.
- **7R F2 — started 마커는 컨트롤러 사망 시 무의미하다** (HIGH). 6라운드 초안은 pre-Workflow "started" 마커 + 사후 `markDebt`였는데, `readCounter`는 **debt 마커만** 존중하므로 사후 핸들러만 읽는 마커는 정확히 그 핸들러를 놓쳤을 때(=창이 열리는 바로 그 순간) 무효다. → **Workflow 호출 직전에 진짜 debt 마커를 pin**(신규 `mark-debt` CLI). pin 실패 시 **Workflow 미호출**(인라인 Pattern Grounding — fan-out은 GROUND 보강이라 plan 미차단). 창이 사라지고 신규 메커니즘도 불필요하다(5라운드 debt 재사용). Codex 대안 `actual=granted` commit은 **거부** — commit은 `open[]`을 떠나 영구가 되어 실제로 안 떴을 때 되돌릴 수 없다(4라운드가 default 제거로 막은 "영구 유령").
- **debt decay — 7라운드가 도입, PR-Codex R1(5라운드 PR 게이트)이 반려 → 제거** (**HIGH**). 7R F2 pin이 pending을 lease로부터 **영구** 고정하자, 초안은 자기중독을 우려해 `MCCP_ORCHESTRATION_DEBT_DECAY_HOURS`(6h, `cost-state.js#decayIfStale` 미러) 시간축 decay로 마커를 늙혀 pin을 놓게 했다. PR-Codex가 반려: **모든** debt 마커는 fan-out이 Workflow 호출 **직전**에 찍으므로, 컨트롤러 death 후에도 마커가 남아 있다는 것 자체가 그 agent들이 **실제로 떴다는 증거**다. 그 마커를 aging-out하면 `readCounter`가 still-open 예약을 lease-expire해 **실 launch를 차감** → cap **under-count**(operational USD 은퇴 후 유일 backstop이 하필 over-permissive 방향으로 뚫림 — 이 PR이 닫으려던 바로 그 bypass 재개). → `readDebtIds`의 mtime decay 제거 + `parseDebtDecayHours`·`ENV/DEFAULT_DEBT_DECAY_HOURS` 삭제, pin을 5라운드 **영구** 동작으로 복원. 영구 pin이 남기는 자기중독은 **bounded**다(우려처럼 "영구"가 아니다): counter가 session-keyed(`readCounterRaw`가 다른 `CLAUDE_SESSION_ID`에 fresh 반환)라 다음 세션이 리셋하고, dead-controller 사건당 ≤fleetSize(≤4)/`MAX_AGENTS`만 소진 — bounded·self-resetting **liveness** 비용이 safety cap을 절대 우회 안 하는 것의 정당한 대가다. 회귀 test(Codex 권고): fan-out launch → 컨트롤러 death(reconcile 전) → 시간 경과 → cap이 그 agent를 **여전히 카운트** + 다른 session은 fresh.

### Unchanged
- dual-review·receipt chain 무손상 — firing 오라클·auto-chain은 gate 값 조정만. read-only fan-out + workflow-외곽 게이트 invariant · commit/PR 격리 · cross-gate dedupe · receipt anchor 무변경.
- briefing/handoff의 USD 축은 **독립·불변**(`AUTODISABLE_TIERS_DEFAULT`는 각 budget 모듈 로컬 — 소비처 격리).

## [1.22.2] — 2026-07-14

**Workflow-orchestration live-activation — M2 (firing-preview 도구 + 관찰 프로토콜)** — M1이 발화를 구조적으로 반전·배선했으나 실제 LLM-runtime 발화가 **관찰된 적 없던** gap을 닫는 후속 milestone. live `/mccp:work` 완주는 재귀·고비용이라 관찰을 두 축으로 분리: (1) **저비용 firing-preview 도구** — 현재 env·cost-state·runaway 카운터로 "지금 무엇이 발화할지"를 Step 3와 **동일 oracle**을 read-only 재사용해 **LLM 소비 0**으로 판정, (2) **operator-executed live 완주**(prp-implement 밖, 재귀 회피)의 관찰 기록·프로토콜. 핵심 correctness — oracle `run`은 component signal일 뿐 실발화는 `resolveWorkRoute` route + caller-gate 합성 `effective_fire`로 판정해 "oracle run == 발화" false green-light를 구조 차단(ISOLATE=0/partition N=1/runaway degraded → run:true여도 parallel_fires:false).

### Added

- **`orchestration-preview.js`** — 순수 `previewFiring(opts)` + `require.main` CLI(`--plan`/`--prd`/`--json`). Step 3 oracle(`resolveFanout`/`resolveFleet`/`resolveWorkRoute`/`parseMergedVerifyMode`/runaway `readCounter`)을 read-only 조합해 fan-out·병렬·verify·route·runaway 발화 스냅샷 산출. `oracle_run`(원자료)과 `effective_fire`(route 합성)를 분리 출력 + `caller_gates.*_assumed` 투영 라벨. **read-only 불변식** — counter-bump 미import/호출, cost-state·STATE.md 미write.
- **`lib/tests/orchestration-preview.test.js`** (신규 12) — env matrix(cost-failopen 발화 / off·0 opt-out / `COST_FAIL_OPEN=0` fail-closed 복원 / near-cap degraded clamp) + caller-gate matrix(isolate=0·N=1·opt-out에서 `parallel_fires:false`) + preview 서브객체 == 직접 oracle 호출 byte-정합 + read-only 불변식(temp HOME/state에 runaway·cost-state·STATE.md 3파일 시드 후 CLI 실행 → 전부 mtime/내용 불변 + 모듈 counter-bump 정적 부재).
- **`docs/workflow-orchestration/live-activation-observations.md`** — per-cycle 관찰 ledger(표) + live-dogfood 프로토콜(scope-최소 target·**2개 named row 필수**: default 발화 ∧ `MCCP_WORK_IMPLEMENT_PARALLEL=off` opt-out·재귀 회피 경계·검증 절차) + 단일 사용자 baseline 신뢰도 caveat.

### Changed

- **`plugin.json`** `1.22.1`→`1.22.2` (단일 milestone patch, §3.7). renderer footer(`html.js`·`markdown.js`) + `i18n-surface.test.js` assert 동기.

## [1.22.1] — 2026-07-14

**Workflow-orchestration live-activation — M1 (발화 조건 반전 + 검증 harness)** — workflow-orchestration PRD가 배선은 완성했으나 실제 LLM-runtime 발화가 관찰된 적 없고 cost-state fail-closed가 dogfood 발화를 구조적으로 막던 gap을 닫는다(후속 live-activation PRD의 첫 milestone). fan-out(`MCCP_PLAN_FANOUT`)·병렬 implement(`MCCP_WORK_IMPLEMENT_PARALLEL`)를 **default 발화**로 반전(단일은 명시적 opt-out)하고, cost-state 부재 시 `COST_STATE_UNKNOWN` fail-closed skip을 **fail-open(green 가정)**으로 뒤집는다. 폭주 방지는 구조적 per-dispatch 상한(fixed fleetSize=4 / `MCCP_WORK_PARALLEL_MAX`) + USD critical/`hard_ceiling` bomb-detector + **cost-state 독립 누적 worker-launch 절대 상한**으로 재정의(notice/warning tier autoDisable 제거 — 운영자 철학상 $50/$80은 폭탄 아님). 실제 LLM 발화 없이 seed→mark→collect→reconcile 배선을 관측하는 저비용 검증 harness(합성 git-worktree e2e) 추가.

### Added

- **`orchestration-runaway.js`** (Codex F2) — cost-state와 **독립적인** catastrophic-runaway 최후 안전판. 순수 `clampForRunaway({requestedN, launchedSoFar, env})`(fail-open 경로 N을 degraded=1로 clamp) + 세션 키 누적 worker-launch 카운터(`readCounter`/`bumpCounter`, `cost-state.js` `wx` O_EXCL lock + atomic tmp+rename mirror) + 절대 env cap `MCCP_ORCHESTRATION_MAX_AGENTS`(default 24, loud fail-open parse). telemetry 부재가 cap을 우회 못 함.
- **`implement-dispatch/route.js`** (Codex F3) — `/mccp:work` Step 3 route 결정(inline/task/workflow-single/workflow-parallel)을 인라인 markdown 트리에서 순수 함수 `resolveWorkRoute`로 승격. work.md bash가 단일 SoT로 호출 → 발화 route가 mechanical 테스트 대상.
- **테스트** — `lib/tests/orchestration-runaway.test.js`(신규 12) + `implement-dispatch/tests/route.test.js`(신규 12, env 조합 전수) + `implement-dispatch/tests/dispatch-wiring-harness.test.js`(신규 3 — 합성 git-worktree seed→mark→collect→reconcile e2e + F1 no-leak + merge/rollback patch smoke, LLM 0회).

### Changed

- **`plan-fanout/budget.js`·`implement-dispatch/budget.js`** — `parseFanoutMode`/`parseParallelMode` default off→**on**(opt-out via `off`/`0`). `resolveFanout`/`resolveFleet`에 `costFailOpen`(default true → `cost-state` null이면 green 가정 run + `COST_FAILOPEN` reason; `MCCP_ORCHESTRATION_COST_FAIL_OPEN=0`이면 기존 `COST_STATE_UNKNOWN` fail-closed 정확 복원) + `hard_ceiling_reached` bomb-detector skip + tier autoDisable를 **critical-only**로 narrow + fail-open 경로 전용 injected `runawayClamp`. merge-strategy·single-partition·budget-cap gate 불변.
- **`commands/work.md`** — Step 3.prep-parallel `PARALLEL` default `:-0`→`:-1`(단일 opt-out 축). Step 3.route를 `resolveWorkRoute` oracle 호출로 승격. `costFailOpen`+runaway counter forward + 발화 로그. **`MCCP_WORK_IMPLEMENT_WORKFLOW` default 미변경**(Codex F1 — opt-out은 `PARALLEL=off/0` 단일 축으로 legacy Task 경로 정확 복원).
- **`commands/plan.md`** — Phase 2.5 fan-out default on + `costFailOpen`+runaway forward + 발화/opt-out 로그.
- **`plugin.json`** `1.22.0 → 1.22.1`(단일 milestone = patch, §3.7) + `renderer/html.js`·`markdown.js` footer `v1.22.1` sync.

## [1.22.0] — 2026-07-12

**Time-based cost decay (`MCCP_COST_STATE_DECAY_HOURS`)** — cost-model-subscription PRD **M3, 최종 milestone → PRD 전체 종료(minor bump)**. "한 번 튄 가상 비용($314.50 sticky)이 5개 자동화를 영구·전역으로 잠그는" 문제의 잔존 근원을 시간 축으로 닫는다. M2가 "신규 추정을 정확하게" 만들었으니 M3는 "오래된 추정이 스스로 사라지게" 만든다. 종량제·구독권 공통으로, 3일 전 다른 프로젝트의 $314가 오늘 작업을 막지 않는다. decay 비활성(`=0`) 시 M2 동작과 판정 byte-identical(회귀 0).

### Added

- **`cost-state.js` Axis 1** — 명시적 `readStateRaw`(raw)/`readState`(decayed)/`readStateOrThrow`(raw, auto-chain 전용) 3-API 분리(Codex F1) + pure `decayIfStale(state, mtimeMs, nowMs, decayMs)` + `parseDecayMs(env)` env SoT(default 6h · `=0` kill switch · fail-open). mtime > decay 창이면 `readState()`가 green view 반환 → tier 소비처(fleet/fanout/briefing/breakpoint)가 **코드 변경 0**으로 decay 획득. `writeStateMerged`는 명시적 write-side decay로 stale floor를 리셋해 monotonic MAX 계승을 끊는다.
- **`state-writer.js` Axis 2 substrate** — `abort_owner`(enum `cost|dispatch|null`)+`cost_abort_at` provenance frontmatter(present-only 직렬화, `dep_check_at` mirror). `dispatch_chain_aborted` 이벤트가 `abort_owner='dispatch'` set + stale cost marker clear(F3 안정적 ownership — `last_event` guard 폐기).
- **`ecc-context-monitor.js` Axis 2** — STATE.md producer가 subscription-aware SET(구독권은 USD가 아니라 `evaluateOverflow` context 축에서만 `chain_aborted` set, F2) + `chain_aborted` set 시 `abort_owner='cost'`+`cost_abort_at` stamp + 신규 **decay-clear**(4중 stable AND) + **legacy sweep**(marker 없는 cost-origin flag). **Codex Impl-R1 흡수** — IF1: legacy sweep가 `NON_COST_ABORT_EVENTS`(`plan_conflict_escalated`/`dispatch_chain_aborted`) denylist로 plan-conflict hard-stop 오clear 방지; IF2: stale bridge context를 signal-unknown으로 처리해 오래된 telemetry의 영구 halt 차단.
- **테스트** — `lib/tests/cost-state.test.js`(신규 18) + `state/tests/state-writer.test.js`(+4) + `hooks/tests/ecc-context-monitor.test.js`(+10, IF1/IF2 포함) + `lib/tests/auto-chain.test.js`(+3, F1 divergence·self-heal·F2 통합).

### Changed

- **`plugin.json`** `1.21.2 → 1.22.0`(PRD 최종 milestone 완료 = minor, §3.7) + `renderer/html.js`·`markdown.js` footer `v1.22.0` sync.
- **`CLAUDE.md`** §4 `MCCP_COST_STATE_DECAY_HOURS` 토글 + §1.4 표 M3 row(cost-model-subscription PRD 완결) + §3.2 STATE.md `abort_owner`/`cost_abort_at` present-only 필드.

### Fixed

- **auto-chain fail-safe divergence는 의도적·문서화·테스트됨** — auto-chain은 `readStateOrThrow`(raw)+`isStale(1h)` stale-abort 유지(mid-chain telemetry 1h+ 낡으면 보수적 pause). sticky 버그(fresh 파일의 hard_ceiling)는 write-side decay가 첫 tool write에 floor를 리셋해 해소하고 >6h gap 후 첫 write가 파일을 fresh·low로 만들어 자기치유(decay 창 6h ≫ auto-chain 1h라 활성 세션 무발화).

## [1.21.2] — 2026-07-10

**Harness-cost accuracy (`harness-cost-<sid>.json` writer)** — cost-model-subscription PRD M2. 부풀려진 가상 비용의 정확도 근원을 두 축으로 닫는다. **Axis A** — 번들 statusline 이 매 렌더마다 harness 실비(`cost.total_cost_usd`)를 per-session 캐시로 흘려보내는 **writer 를 배선**(소비 측 cost-tracker · ecc-context-monitor 는 이미 완비, 생산 측 공백을 채움). **Axis B** — `ecc-context-monitor.js` 의 로컬 `50/80/100` 하드코딩을 `cost-thresholds.js#getHandoffCostThresholds()` 로 통일해 `MCCP_HANDOFF_THRESHOLDS_USD` env override 가 tier · `hard_ceiling` · **STATE.md abort 채널**(`session_end_imminent`/`chain_aborted`) 전부에 도달. writer 미설치 커스텀 statusline 은 transcript-sum fallback 유지 — **회귀 0**.

### Added

- **`plugins/mccp/scripts/lib/harness-cost.js`** — dep-free 공용 계약. private `readHarnessCostRecord` 단일 validator(finite · 음수 · `[0,maxAge]` age 경계, stale·future 모두 reject) 위의 얇은 adapter `readHarnessCost`(number) / `readHarnessCostMeta`({cost_usd, ts}) + best-effort atomic `writeHarnessCost`.
- **`docs/harness-cost-contract.md`** — `harness-cost-<sid>.json` 스키마 + 커스텀 statusline opt-in chaining 스니펫(비강제) + fallback=transcript-sum 명시(OQ3 답변).
- **테스트** — `lib/tests/harness-cost.test.js`(round-trip · stale/future/corrupt/negative · F4 parity · tmp leak) + `hooks/tests/ecc-statusline.test.js`(writer 호출/무호출/격리 · F3 display) + `hooks/tests/ecc-metrics-bridge.test.js`(cost_sample_ts bump-on-change).

### Changed

- **`ecc-statusline.js`** — `renderStatusline`/`extractHarnessCost` 추출 + harness-cost writer 배선(별도 try/catch, 출력 절대 불차단) + **F3** 표시 소스를 live harness cost 우선(부재 시 bridge fallback).
- **`ecc-context-monitor.js`** — **Axis A** harness-preferred cost(`resolveSessionCost`) + **F1** freshness guard(harness ts vs `bridge.cost_sample_ts`, epoch초 동일단위 — 폐기된 `last_timestamp` ISO 비교 대체) + **Axis B/F2** 로컬 상수 제거·전 usage 를 `>=` per-call threshold 로 통일(tier · hardCeiling · STATE.md).
- **`ecc-metrics-bridge.js`** — **F1** cost 값 변경 시에만 numeric `cost_sample_ts`(epoch초) stamp.
- **`cost-tracker.js`** — inline `readHarnessCost` 를 lib import 로 대체(byte-identical dedupe, `os` require 제거).
- Implement-Codex R1: HIGH 1(freshness guard) + MEDIUM 3(comparator · statusline 렌더 · 단일 validator) 전건 구현-시점 흡수 → converged.

## [1.21.1] — 2026-07-10

**구독권 비용 모델 opt-in (`MCCP_SUBSCRIPTION`)** — cost-model-subscription PRD M1. 정액 구독권 사용자를 위해 5개 자동화 소비처(resolveFanout · resolveFleet · shouldSkipBriefing · auto-chain · breakpoint-detector)가 USD cost-state/tier 게이트를 우회하도록 하고, 폭주 방지는 metrics bridge의 `context_remaining_pct` + `tool_count`(context overflow) 축으로 대체한다. flag 미설정 시 5개 소비처 **판정 byte-identical** — 종량제 회귀 0. (원 구현은 1.20.16이었으나 main이 1.21.0(#99)을 선점해 §3.7 forward-reconcile로 1.21.1 상향.)

### Added

- **`plugins/mccp/scripts/lib/subscription.js`** — subscription oracle(pure/dep-free). `isSubscriptionMode`(1|on) + `parseOverflowThresholds`(context 35/25 기본, tool 축 default-off·opt-in) + `evaluateOverflow`(green/warning/critical, 신호 부재 → fail-open green). frozen REASONS.
- **`plugins/mccp/scripts/lib/context-state.js`** — context-current.json 스냅샷(read/write/isStale). latest-wins(non-monotonic) + `context_ts` stamp + **out-of-order older-샘플 reject**(tool_count 우선 — Codex F2, stale-high write가 최신 critical을 은폐하는 경로 차단).
- **테스트** — `lib/tests/subscription.test.js` + `lib/tests/context-state.test.js`(oracle/snapshot 단위) + 5개 소비처 subscription-path 테스트(overflow critical skip · fail-open · 구조 게이트 보존). 전체 스위트 green.

### Changed

- **5개 소비처** — `plan-fanout/budget.js`·`implement-dispatch/budget.js`·`briefing/cost-guard.js`·`auto-chain.js`·`state/breakpoint-detector.js`에 `MCCP_SUBSCRIPTION` 분기(USD 축만 overflow로 대체, 구조 게이트·다른 abort trigger 불변). 전면 **fail-open**(신호 부재 → 진행 — Codex F1 사용자 수용).
- **`hooks/ecc-context-monitor.js`** — L238 cost-write 블록에 격리 try/catch로 context-current.json best-effort stamp(subscription 무관 항상 write — Codex F3 정직화: 판정 byte-identical + 1회 telemetry write, 실패는 hook 진행 무영향).
- **`commands/plan.md`·`commands/work.md`** — resolveFanout/resolveFleet 호출에 `subscriptionMode` + `contextStateRead` 주입.
- **`hooks/session-start.js`** — subscription 활성 시 1줄 관측 배너(stderr, 종량제 무발화).
- **`.claude-plugin/plugin.json`** — `1.21.0 → 1.21.1`(단일 milestone patch, §3.7 — main 1.21.0 선점 반영).
- **`CLAUDE.md`** — §4에 `MCCP_SUBSCRIPTION` + `MCCP_SUBSCRIPTION_OVERFLOW_*` 토글 문서화.

### Notes

- plan-codex R1: Codex verdict=needs-attention(HIGH 2 + MED 1). F1(fail-open 시 비싼 소비처 runaway guard 부재) 사용자 결정으로 수용(문서화된 위험 — fanout `MCCP_PLAN_FANOUT=on` 별도 opt-in + fleet `worktree-merge` gate로 N=1). F2(out-of-order)·F3(byte-identical) plan 흡수. Implement-Codex는 cross-gate dedupe 수렴.
- 신호 신뢰도 + calibrated 2차 임계(tool/turn) + session sticky-critical은 M2 harness-cost 축으로 이연(`.claude/plans/codex-findings-backlog.md`).

## [1.21.0] — 2026-07-09

**workflow-orchestration M4 — 병렬 활성화 (worktree-merge live).** PRD `workflow-orchestration`의 마지막 milestone. M2b/M3가 build+unit-test로 완비하되 cost hard-ceiling으로 미실측이던 **live harness 상관(Workflow worktree↔dispatchId)**을 Task 0 live dogfood로 empirical 입증하고, `merge_strategy` default를 `disable-parallel`→`worktree-merge`로 flip해 N-worker 병렬 implement를 해금한다. PRD 전체 완료 → minor bump. cost guard 3중(PARALLEL=1 opt-in · cost-state fail-closed · tier autoDisable)은 무변경 — default flip은 구조적 merge_strategy gate만 열 뿐 비용/opt-in gate는 유지.

### Added

- **`plugins/mccp/scripts/lib/dispatch-envelope.js` `seedEnvelope(envelopePath, opts)`** — worker-side idempotent envelope seed. Task 0(run wf_1f689994-fb8)가 입증: fresh `isolation:'worktree'` worker는 `.claude/state/dispatches/`가 gitignored라 parent placeholder 미복사 → 부재 시 terminal `mark`가 ENOENT. seed가 부재 시 pending envelope를 atomic 생성(존재 시 no-op — 마킹된 terminal 절대 미clobber)해 collect-worktrees가 worktree를 envelope 파일명으로 correlate하게 한다.
- **`plugins/mccp/scripts/lib/dispatch-cli.js` `seed-envelope` 서브커맨드 + `resolveEnvelopePathForWorktree`** — worker가 first-step으로 자기 worktree에 seed. Codex F2: repo-relative envelope 경로를 CWD가 아니라 worktree 루트(`git rev-parse --show-toplevel`) 기준 resolve + 하위 assert(subdir CWD·`..` escape 방어). `buildImplementWorkerBasePrompt`가 partition worker에게 seed first-step 주입.

### Changed

- **reconcile terminal envelope worktree-read (Task 2)** — `cmdReconcileFleet`이 `--worktree-map` 제공 시 각 worker terminal envelope를 `<worktree>/.claude/state/dispatches/<id>.envelope.json`에서 읽는다(worker가 in-worktree seed→mark하므로 parent placeholder는 stale pending 잔존 → parent read는 오탐 mismatch). map 부재 시 parent fallback(단일/back-compat).
- **merge-apply patches-out rollback hole 폐쇄 (Codex F1)** — `cmdMergeApply`가 apply 성공 후 `patches-out` write 실패 시 이미 적용된 patch를 `rollbackApplied`로 즉시 역적용해 parent를 복원("merge-apply 실패=parent clean" 계약 실장; patch-scoped only, F4 — 광범위 checkout/clean 금지).
- **collectChangedFiles `--untracked-files=all` (live dogfood-surfaced)** — default `--porcelain`가 untracked 신규 디렉토리를 `dir/`로 축약해 file-level partition과 false partition-escape → `-uall`로 개별 파일 열거(worktree-merge collectWorkerDiff와 일치).
- **`plugins/mccp/commands/work.md`** — Step 3.prep-parallel `MCCP_WORK_MERGE_STRATEGY` default `disable-parallel`→`worktree-merge`. gate-parallel reconcile worktree-envelope read 문서화. 활성화 노트로 갱신.
- **`plugins/mccp/scripts/lib/implement-dispatch/budget.js`** — Decision-order 주석을 M4 default flip에 동기(상수 `ENABLING_MERGE_STRATEGY='worktree-merge'` 무변경).
- **`CLAUDE.md` §1.4 + §4 / PRD Delivery Milestones / renderer footer** — v1.21.0 동기. PRD M4 complete + M2/M3 gated 축 종료.

### Tests

- `plugins/mccp/scripts/lib/tests/dispatch-cli.test.js` — seed-envelope(생성/no-op/terminal 미clobber/reject) · F2 worktree-root resolve(subdir·escape·absolute passthrough) · worker prompt seed first-step(partition 有/단일 無) · reconcile worktree-read(pending parent → ok, no false mismatch) · merge-apply F1 patches-out 실패 rollback(parent clean) · collectChangedFiles `-uall`(신규 디렉토리 파일 열거). 전체 회귀 그린.

## [1.20.15] — 2026-07-09

**신규 command `/mccp:archive-complete`** — 직전 세션(`v1.20.14`)에서 **수동** 수행한 "완료 PRD/plan을 `archived/`로 이동 + status drift 정정 + 대시보드 재렌더" 흐름을 재사용 가능한 human-gate command로 제품화한다. `/mccp:dashboard-audit`의 레이어 분리(agent 평가 ↔ 결정적 scan/apply)를 미러하되, 비파괴 마커 대신 **파일 이동 + status flip**을 수행한다. 핵심 정확성 기준은 **PRD 전체가 완료(전 milestone complete/dropped)일 때만 그 plan을 archive**하는 dangling-active-PRD 불변식(C2).

### Added

- **`plugins/mccp/scripts/lib/archive-complete/scan.js`** — 결정적 스캐너(read-only, LLM-free). 활성 PRD의 `## Delivery Milestones`를 **원시 행 단위로 전부 열거**해 `rawRowCount === complete + dropped` fail-closed 등식으로 archivable 판정(Codex F1 — 비정규 status 행이 분모서 증발하는 오분류 차단). plan↔PRD 인덱스(`scanPlans` source_prd 매칭) + drift 증거(ledger > receipt > git 우선순위, advisory).
- **`plugins/mccp/scripts/lib/archive-complete/apply.js`** — 원자 archive 트랜잭션(Codex F2). preflight-all(하나라도 실패면 mutation 0) → operation journal(`.claude/state/archive-journal/<id>.json`, git-tracked audit anchor — Codex F3) → status flip(content-hash CAS) + `git mv` → **적용 중 어떤 실패든 전량 rollback**. PRD + 그 모든 활성 plan을 하나의 원자 단위로만 이동(C2 단독 이동 거부). collision: 내용 동일 skip / 상이 `<name>.legacy.md` 보존(데이터 손실 0).
- **`plugins/mccp/commands/archive-complete.md`** — 6-phase human-gate command body(SCAN→EVALUATE→PROPOSE+HUMAN-GATE→APPLY→RENDER+VERIFY→OUTPUT). `${CLAUDE_PLUGIN_ROOT}` 경로(버전 하드코딩 없음).
- **테스트** — `tests/scan.test.js`(11) + `tests/apply.test.js`(10): archivable 판정·C2·비정규 status·drift 증거·git mv 중간 실패 rollback·CAS·idempotent·collision-legacy.

### Changed

- **`CLAUDE.md`** — §3에 `archived/` 아카이브 관례 subsection 신설(C1~C4 불변식 + `milestone-history.js` 하드코딩 스캔 경로 + `/mccp:archive-complete` 포인터).
- **`.claude-plugin/plugin.json`** — `1.20.14 → 1.20.15`(신규 command = patch). 양 footer(html/markdown) `v1.20.15` + `i18n-surface.test.js` assertion 동기.

### Notes

- Implement-Codex는 cross-gate dedupe로 수렴(plan-codex가 F1/F2/F3 3 findings 전부 R1 흡수 — 신규 implement-time 결정 0). 파일 이동 chore라 `mccp-*-codex` 게이트 receipt는 발행하지 않는다(human-gate + git history + operation journal이 review — D3).
- `parseTableRows`/`findSection`은 plan-body.js에서 export되지 않아 scan.js에 self-contained 포트(enumerate.js `scanInProgressRows` 로컬-표-스캔 패턴 미러) — plan-body.js를 건드리지 않아 cross-gate dedupe 무손상.

## [1.20.14] — 2026-07-09

완료 PRD/plan 아카이브 정리 + 아카이브 폴더명 `archived/`로 통일 (housekeeping chore). 활성 `.claude/prds/`·`.claude/plans/`에 완료됐지만 남아 대시보드 활성 스캔에 잡히던 drift를 종결한다. **behavior 변경 0 — 파일 이동 + 폴더 rename + status drift 정정 + 렌더 재검증(derive degraded 0, renderer 회귀 0).**

### Changed

- **아카이브 폴더명 통일 (`complete`/`completed` → `archived`)** — `.claude/prds/complete/` → `.claude/prds/archived/`, `.claude/PRPs/plans/completed/` → `.claude/PRPs/plans/archived/`. `milestone-history.js` 3 경로(archived-PRD 스캔 + plan git-time/summary fallback 2) + 주석 + 테스트 5파일(milestone-history·four-part-rendering·enumerate·deep-research-detect·ultracode-detect) 동기. 레거시 `.claude/plans/archive/`도 통합(내용 상이 중복 1건은 `-legacy` 접미사 보존, 데이터 손실 0).
- **완료 PRD 5건 아카이브** — `audit-remediation-followup`·`work-context-isolation`·`v0-3-4-test-env-hygiene`·`v1-1-0-observability-surface-ii`·`v0-4-0-orchestrator` → `.claude/prds/archived/`. 완료 plan 12건 → `.claude/PRPs/plans/archived/`.
- **status drift 정정** — `v0-3-4-test-env-hygiene`(M1 `pending → complete`, 실제 v0.3.4 ship됨) · `workflow-orchestration`(M2 `in-progress → complete` + M4 `pending` 행 추가, **active 유지**).
- **`v0-4-0-orchestrator` superseded 마커** — MVP 척추(spawn axis B/C + metric axis A)가 v1.1.0 notify+resume / cost USD tier 유지로 실증 기각·대체됨을 상단 명시 + axis H 외 9축 `dropped` 정리.
- **`.claude-plugin/plugin.json`** — `1.20.13 → 1.20.14`. 양 footer(html/markdown) `v1.20.14` + `i18n-surface.test.js` assertion 동기.

### Notes

- `workflow-orchestration` PRD는 active 유지 — derive에 전용 PRD source가 없어 PRD는 활성 plan의 `source_prd`로만 discovery되므로, 그 M1~M3 완료 plan은 `.claude/plans/`에 보존(archive 시 dangling active PRD가 되어 대시보드에서 소실).
- 사전 존재 실패 1건(`verdict-label metric F1` — renderer verdict 어휘)은 본 변경과 무관(clean HEAD `34df7b1`에서도 fail) — 별도 이슈.

## [1.20.13] — 2026-07-08

문서 정합화 (**CLAUDE.md ↔ 코드 drift 종결**, audit-remediation P6). 감사 A(Haiku 광범위)/B(Opus 심화)가 지목한 CLAUDE.md 드리프트 8지점을 실제 동작에 정합화한다 — **behavior 변경 0**. 유일한 코드 touch는 `codex-invoke.js` **주석** classification enum(`parse-error` 누락 보정)이고 나머지는 전부 문서 정정이다. 감사가 1.20.2 기준이라 P2~P5(1.20.5~1.20.11)가 일부 드리프트를 이미 고쳤을 수 있어, 각 지점을 현재 CLAUDE.md에 **재대조(staleness guard)**한 뒤에만 편집했다(B#16 §3.2 advisory-lock은 이미 정확 → verified-noop). cross-gate dedupe로 Implement-Codex 수렴(plan-codex `converged` 승계). 버전은 #92(1.20.8)·#94(1.20.9)·#95(1.20.10)·#93(1.20.11)·#96(1.20.12) 순차 점유로 1.20.13 상향(origin/main #96 M3가 1.20.12 선점 → forward-only reconcile per §3.7).

### Changed

- **`CLAUDE.md`** — 8지점 정정: §3.3을 strict 14값 codex-invoke classification 표(`registry-malformed` 추가 + `tempfail`을 classify.js 계층 별도 note로 이동)로 재구성 · §1.4/§5 derive "7 source" → "9 source"(ledger·worktrees 추가) · §1.3에 v1.3.1 informational allow-path 단서(terminal PR hard-block 유지) · §3.6 락 모델을 `pr-phase.lock`(hash+stdin-pipe) ↔ `quarantine.lock`(raw-token/advisory) 분리 + no-token legacy release **잔여 리스크 정직 서술**("양쪽 공통"·"무해" 단정 제거) · §3.9 design-critique enum full form(`ESCALATE_NEXT_ROUND`/`DIVERGENT_UNRESOLVED`) + 미커밋 fixture 서술 정정 · §3.2 SessionEnd `.end` marker(v1.20.5 fail-loud-open) 문서화 · §1.4 stop-loop을 자동 재시도 아닌 bounded 실패 카운터(`MAX_COUNT=2`)로 정정 · §4 runbook item 5 quarantine=hash 오기재 정정.
- **`plugins/mccp/scripts/lib/codex-invoke.js`** — 주석 header classification enum에 `parse-error` 추가 → 주석 = §3.3 표 = 실제 생산값 **14종** 동일 집합. 로직 무변경(comment-only).
- **`.claude-plugin/plugin.json`** — `1.20.12 → 1.20.13`. 양 footer(html/markdown) `v1.20.13` + `i18n-surface.test.js` assertion 동기.

### Deferred

- quarantine `releaseLock` **no-token legacy 경로 hardening**(제거 / test-gate)을 `.claude/plans/codex-findings-backlog.md`에 이연 (PRD out-of-scope — Codex F2; P6은 문서만 정정).

## [1.20.12] — 2026-07-08

workflow-orchestration **M3** (verify 네이티브화 — worktree-merge substrate + aggregate adversarial-verify, honest-degradation patch). M3은 PRD의 두 축을 닫되 **정직하게 부분 종료**한다: **(A) verify 네이티브화** — 통합 diff를 worker 밖에서 1회 cross-model(Codex) adversarial review하는 `Step 3.verify` 스테이지를 `/mccp:work`에 **필수 pipeline 스테이지**로 장착(PRD Open Question 1(c)의 척추 답). worker 안(per-worker Implement-Codex) + workflow 외곽(/mccp:pr PR-Codex) 사이의 통합 verify 층으로, per-partition 리뷰가 놓치는 cross-cut 회귀(public API·import graph·shared config)를 test보다 깊은 LLM 판정으로 잡는다. **(B) worktree-merge substrate** — worktree→parent collect/apply/patch-scoped rollback lib + dispatch-cli 서브커맨드를 build + unit-test로 완비. **Task 0 spike honest degradation (DD7)**: git 메커니즘(enumerate·diff·apply·reverse-apply·rollback-safety)은 **합성 실측으로 입증**(agent spawn 0)했으나, live harness 상관(Workflow worktree↔dispatchId)은 **cost hard-ceiling($314.50, critical)으로 미실측** → `merge_strategy=disable-parallel` 유지, 병렬은 계속 gated. **핵심(Codex R1 F2/DD6)**: aggregate verify는 **단일·병렬 양 경로** commit 전 발화하므로, 병렬이 gated여도 verify-네이티브화가 **단일 경로에서 실제 runtime 가치**를 갖는다(Axis A ⊥ Axis B). **Codex R1 4H 흡수**: F1(A2 artifact-격리 미비 → Mechanism 1 primary·A2 금지), F2(verify 양-경로 발화), F3(합성 `<slug>-merged` decision → 실제 gate `mccp-implement-verify` produces-only, non-invasive), F4(광범위 checkout/clean rollback → **patch reverse-apply**만, dirty feature branch data-loss 회피). **DD2 cross-model 불변식**: invoker는 여전히 Codex — "adversarial-verify" 패턴은 worker 밖 독립 검증 구조만 차용, same-model skeptic 치환 아님(dual-review 무손상). plugin.json `1.20.11 → 1.20.12`(degraded patch — verify ship + 병렬 gated) + 양 footer(html/markdown) + i18n-surface 테스트 동기. 신규 회귀 0(implement-dispatch oracle 114 + dispatch-cli 47 + receipt merged-verify 11 green).

### Added

- **`scripts/lib/implement-dispatch/verify.js`** — aggregate adversarial-verify 순수 oracle: `buildVerifyFocus`(통합 cross-partition diff → Codex focus 텍스트) + `decideMergedVerify`(codex json → `converged`→pass / `divergent`·`critical`→HALT / `unavailable`×mode / `skipped` block 판정, `codex-bridge.parseVerdict`/`detectCriticalCategory` 재사용) + `parseMergedVerifyMode`(off/warn/enforce, default enforce loud fail-closed).
- **`scripts/lib/implement-dispatch/worktree-merge.js`** — worktree→parent collect+apply+rollback: `buildWorktreeMap`(dispatchId↔worktree 상관, 누락/중복 fail-closed) · `collectWorkerDiff`(tracked ∪ untracked diff) · `assertPathsClean`(pre-apply clean assert, F4) · `applyDisjointDiffs`(all-or-nothing check→apply + patch 기록) · `rollbackApplied`(patch-scoped `git apply -R`, F4 — 사전 dirty·untracked 보존).
- **`scripts/lib/implement-dispatch/tests/{verify,worktree-merge}.test.js`** — 32 신규 oracle 테스트(verify 20 + worktree-merge 12, real-git 통합 rollback-safety 포함).
- **`scripts/receipt/tests/merged-verify-fields.test.js`** — 11 신규(신규 gate round-trip + merged_verify enum/reject + tamper-protection + non-invasive preflight).
- **`scripts/lib/tests/dispatch-cli.test.js`** — M3 서브커맨드 테스트(collect-worktrees / merge-apply dry-run+apply+rollback / F2 escape / pre-apply-dirty HALT / verify-decide 5-verdict / verify-focus) 추가.

### Changed

- **`scripts/lib/dispatch-cli.js`** — 5 신규 서브커맨드: `collect-worktrees`(worktree map emit, missing/ambiguous fail-closed) · `merge-apply`(F2 subset + pre-apply clean assert + patch 기록) · `rollback-apply`(patch reverse-apply) · `verify-focus` · `verify-decide`.
- **`scripts/receipt/{schema,write,aliases,cli}.js`** — 신규 produces-only gate `mccp-implement-verify`(phase=implement, non-invasive — 어떤 command chain에도 미진입) + present-only `meta.merged_verify_verdict`(enum)/`meta.merged_verify_rounds`(int) + `--merged-verify-verdict`/`--merged-verify-rounds` 플래그. `receipt_hash`에 포함(tamper-protected). migration 불필요.
- **`commands/work.md`** — Step 3.verify 공유 스테이지(모든 implement 경로 commit 전 aggregate verify, DD6 단일 경로 발화) + Step 3.gate-parallel의 broad checkout/clean rollback을 patch reverse-apply(F4)로 교체 + collect-worktrees/merge-apply 배선(활성화 계약, 현행 disable-parallel gated). `MCCP_WORK_MERGED_VERIFY` 축 문서화.
- **`.claude-plugin/plugin.json`** — `1.20.11 → 1.20.12`. 양 footer(html/markdown) `v1.20.12` 동기.
- **`CLAUDE.md`** — §1.4 표 1행(M3) + §4 토글(`MCCP_WORK_MERGED_VERIFY`).

## [1.20.11] — 2026-07-08

worktree gitdir tmp resolve (**재발 부채 종결**, 단일 patch). worktree에서 `.git`은 `gitdir:` 포인터 **파일**이라 리터럴 `.git/mccp/tmp`에 `mkdir -p`하면 `ENOTDIR`로 깨진다(§3.8). `pr.md`·`dashboard-audit.md`·`pr-body.js`는 이미 고쳐졌으나 `work.md`·`resume.md`·`plan.md`·`prp-implement.md`에 잔여 리터럴이 남아 CLAUDE.md §3.8 권장 worktree에서 `/mccp:work`·`/mccp:resume`·`/mccp:plan`·`/mccp:prp-implement`가 깨졌다(CHANGELOG:535 기준 "누적 8+ cycle 반복 결함"). 이번에 mechanical 재발 방지 테스트와 함께 종결한다. **Fix Invariant (Codex F1 흡수)**: 모든 fresh Bash 블록은 `$MCCP_TMP`/`$GITDIR`를 블록 시작부에서 재도출하고, tmp로 write/redirect 하기 **전에 같은 블록에서** `mkdir -p`한다 — shell redirect(`2> "$MCCP_TMP/x"`)는 파일은 만들어도 부모 dir은 못 만들어 clean worktree에서 `No such file or directory`로 실패하고, gate skip/dedupe 경로가 앞선 phase의 mkdir을 우회하면 dir 없는 채 진입할 수 있다. cross-gate dedupe로 Implement-Codex 수렴(plan-codex `converged` 승계). 버전은 #92(1.20.8)·#94(1.20.9)·#95(1.20.10) 순차 점유로 1.20.11 상향(origin/main 위로 rebase).

### Changed

- **`commands/work.md`** — Step 0 Classification 블록의 리터럴 `.git/mccp/tmp`(mkdir + `work-classify.stderr` redirect)를 worktree-safe `GITDIR=$(git rev-parse --git-path mccp/tmp)` + in-block `mkdir`으로 이전. Step 3(prep/W/gate)은 v1.20.7에서 이미 `git rev-parse --git-path mccp/tmp`로 마이그레이션됨.
- **`commands/resume.md`** — Phase 0 DETECT 블록 `mkdir -p .git/mccp/tmp` → `MCCP_TMP="$(git rev-parse --git-dir)/mccp/tmp"` + mkdir (pr.md:404 mirror).
- **`commands/plan.md`** — Phase 5.2 Codex 블록 mkdir + `codex-invoke.stderr` redirect를 block-head `MCCP_TMP` 재도출로 이전.
- **`commands/prp-implement.md`** — Phase 2.5.3 Codex 블록 mkdir + `codex-invoke.stderr` redirect를 `GITDIR=$(git rev-parse --git-dir)`(파일 내 Phase 2.5.5b line 445 패턴 mirror)로 이전. **Phase 7 auto-chain 블록**(분리된 fresh shell)은 Fix Invariant대로 자체 `GITDIR` 재도출 + `mkdir -p "$GITDIR/mccp/tmp"`를 `auto-chain.stderr` redirect 직전에 추가.
- **`.claude-plugin/plugin.json`** — `1.20.10 → 1.20.11`. 양 footer(html/markdown) `v1.20.11` 동기.

### Added

- **`scripts/lib/tests/command-tmp-worktree-safe.test.js`** — 2축 재발 방지. 축 A(static): `commands/*.md` 실행 Bash 라인(mkdir/redirect target)에 리터럴 `.git/mccp/tmp` 부재 assert(화이트리스트: pr.md 설명 주석·산문 `<gitdir>` 표기). 축 B(usability, Codex F1): 실제 임시 worktree를 `git worktree add`로 만들고 gitdir-resolved `mkdir -p "$(git rev-parse --git-dir)/mccp/tmp"` 후 redirect 성공을 실행 대조(`.git`가 file인지 assert로 worktree 확증) — 리터럴 부재만으로 못 잡는 "dir 미생성 redirect" 결함을 실증.

## [1.20.10] — 2026-07-08

workflow-orchestration **M2b** (N-worker parallel implement scaffold, 단일 patch). M2a가 놓은 단일 `Workflow agent()` seam을 `parallel(fleet.map(...))`으로 확장하는 **완전한 병렬 스캐폴드**를 세운다 — partition oracle(서로소 file-set 분할·dependency-aware collapse), fleet budget oracle(`resolveFleet` — `resolveFanout` 미러 + merge_strategy 구조 gate), N-way `mergeVerdicts`(per-worker `deriveVerdict` + fail-closed 집계 + `partition-escape` verdict), `dispatch-cli` fleet 서브커맨드(`prepare-fleet` / fleet `emit-workflow-args` / N-way `reconcile`), Workflow `parallel` seam, work.md Step 3 병렬 wiring. **Task 0 spike 실측**: `isolation:'worktree'` 변경은 parent worktree에 자동 전파되지 않고(별도 디렉토리 + 별도 branch + uncommitted) 오케스트레이터에 worktree collect API가 없음 → **merge_strategy=`disable-parallel`** 확정. 병렬 실행은 안전하게 **N=1로 gate off**(default `MCCP_WORK_IMPLEMENT_PARALLEL=0` + `MCCP_WORK_MERGE_STRATEGY=disable-parallel`)되어 M2a 단일-worker 동작이 무변화로 유지된다 — 활성화는 worktree-merge 입증을 전제로 후속 milestone에 이연. **Codex Plan-R1 2H+2M 흡수**: F1(집계가 merge-back 후 실행 → 부분 적용) → verdict-before-merge 순서 불변식(격리 worktree 결과만으로 판정, parent는 clean → 부분 적용 0). F2(prompt-only disjointness) → 실제-diff subset 강제 + 신규 `partition-escape` verdict + dependency-aware collapse. F3(fallback 미배선) → machine-readable `merge_strategy` flag → `resolveFleet` 소비. F4(merged-diff 미검증) → post-merge integrated `node --test` 게이트(단일 merged-diff adversarial review는 M3 이연, backlog). 자체 IPC 부분 폐기(Workflow가 worker liveness 소유 → heartbeat/reclaim/watcher redundant, envelope는 attribution·reconcile 아티팩트로 존속). plugin.json `1.20.9 → 1.20.10`(#94 audit P5가 1.20.9 선점 → M2b가 그 위로 rebase되며 1.20.10으로 상향; #92 P4는 1.20.8) + 양 footer(html/markdown) + i18n-surface 테스트 동기. dual-review 무손상 · 신규 회귀 0(oracle 120 테스트 green).

### Added
- `plugins/mccp/scripts/lib/implement-dispatch/partition.js` — `partitionPlan` 서로소 partition oracle(union-find + shared-output serialize + maxWorkers cap) + `partitionFromPlanText`(plan markdown → partition 파생).
- `plugins/mccp/scripts/lib/implement-dispatch/budget.js` — `resolveFleet` fleet 비용/merge_strategy oracle(`resolveFanout` 미러).
- `plugins/mccp/scripts/lib/implement-dispatch/tests/{partition,budget}.test.js` — 45 신규 oracle 테스트.

### Changed
- `plugins/mccp/scripts/lib/implement-dispatch/result-schema.js` — `mergeVerdicts` N-way fail-closed 집계 + `partition-escape` verdict + `checkPartitionEscape`(`deriveVerdict` 불변).
- `plugins/mccp/scripts/lib/dispatch-cli.js` — `prepare-fleet` + fleet-aware `emit-workflow-args` / N-way `reconcile`(실제-diff subset) + partition-scope worker prompt(단일 경로 back-compat).
- `plugins/mccp/scripts/workflows/implement-dispatch.js` — 단일 `agent()` → `parallel(fleet.map(...))` seam + budget pre-guard + `isolation:'worktree'`(단일 경로 불변).
- `plugins/mccp/commands/work.md` — Step 3.prep-parallel / 3.WP / 3.gate-parallel + `MCCP_WORK_IMPLEMENT_PARALLEL` 하위 축(merge_strategy gated).

## [1.20.9] — 2026-07-08

audit-remediation P5 (receipt_hash tamper-detect 실연결, 단일 patch). `write.js`는 receipt 저장 시 `subject_hash`와 `receipt_hash`를 **둘 다** 봉인하지만 `validate-cmd.js`는 `subject_hash`만 재계산·비교하고 `receipt_hash`는 저장만 될 뿐 검증되지 않았다. `subject_hash`는 `SUBJECT_FIELDS`(task_id/phase/gate_id/plan_hash/…)만 커버하므로 서명 후 `findings`·`resolution`·`meta` 변조(특히 P1이 복구한 dual-review 무결성 필드 `resolution.codex_verdict`)가 탐지되지 않던 gap을 닫는다. `validate-cmd.js`에 `receiptHash()` 재계산·비교를 기존 `subject_hash` 블록 그대로 미러링 — write/validate가 동일 `hash.js#receiptHash()`를 호출하므로 `briefing_*`·`ledger_write_skipped`·self carve-out parity가 구조적으로 보장된다. **Codex R1 F1 흡수**: mismatch를 `stale`이 아닌 `blocking(kind='receipt-tamper')`로 분류 — stale은 `preflight.js`의 "regenerate STALE" 복구 가이드를 받아 변조 receipt를 재생성(덮어쓰기)해 tamper 증거를 소실시키므로, 전용 `TAMPER` 라벨 + 조사 지시(재생성 금지) 복구 라인을 받는다. 게이팅 강도는 stale과 동일(hard+soft 차단, off만 bypass). 신규 `kind:'receipt-tamper'`는 `classify.js`가 tempfail만 특수 처리하므로 일반 blocking(exit 2)으로 취급된다. 현존 `.claude/receipts/` 전수 sweep mismatch=0으로 오탐 부재 경험적 확인. dual-review·receipt chain 무손상. plugin.json `1.20.8 → 1.20.9` + 양 footer(html/markdown) + i18n-surface 테스트 동기(surface drift 0). PRD P2/P3/P4 in-progress drift도 complete로 정합(P5 PR fold).

### Added
- `validate-cmd.js` — subject_hash 블록 직후 `receiptHash()` 재계산·비교. mismatch 시 `result.blocking.push({kind:'receipt-tamper'})` + `continue`. `receiptHash` import 추가.
- `validate-cmd.test.js` — tamper 탐지(findings·`resolution.codex_verdict`·`meta.command`) + subject-우선 회귀 + 오탐 방지(briefing/ledger carve-out·grounding restamp) 6 테스트.
- `preflight.test.js` — tamper-only 시 `TAMPER` 라벨 + 조사 라인 surface + "regenerate STALE" 부재 검증.

### Changed
- `preflight.js` — blocking 라벨에 `receipt-tamper` → `TAMPER` (tempfail 미러) + 전용 복구 라인(재생성 금지·조사 지시, Codex R1 F1).
- `validate-cmd.test.js` — 기존 `meta.advisory` 테스트가 subject_hash만 재서명하던 것을 receipt_hash도 재봉인하도록 정정(정당 advisory receipt 시뮬레이션, tamper 오탐 회피).

## [1.20.8] — 2026-07-08

audit-remediation P4 (dispatch·work-isolation 강건화, **재스코프**). 원 P4 plan(1.20.6 base)은 격리 implement 위임의 `pending` collapse를 `cmdMerge`에 F1(pending-split graceful-degrade) + F2(receipt anchoring 검증)로 닫으려 했으나, 병렬 진행된 **#91(v1.20.7 workflow-orchestration M2a)이 같은 서브시스템을 `deriveVerdict`/`cmdReconcile`(3자 reconcile: return ∧ envelope ∧ store)로 재작성하며 원 P4의 핵심을 이미 대체**했다: (1) pending은 `reconcile-mismatch`로 **fail-closed HALT**(의도적 — Step 3.gate double-worker 위험 차단), (2) anchoring은 `deriveVerdict`의 F3 post-hoc store 검증(marker + 3-flag == expectedAnchor → `unanchored` HALT). `cmdMerge`는 work.md가 `cmdReconcile`로 이관하며 dead-path가 됐다. 따라서 P4를 #91 model 위로 재스코프해 **잔여 additive delta만** 착지: (B#6) `prp-implement.md` Phase 2.5.6 receipt-write exit-code 미표면화(exit 12=`DISPATCH_MARKER_MISSING_FIELDS` 은폐)를 loud surface + Phase 3 EXECUTE 진입 전 hard-stop, (B#13) dispatch-worker 3-flag attribution doc를 `deriveVerdict`/Step 3.gate anchor 검증 참조로 갱신. F1 graceful-degrade는 `/mccp:resume` 복구 경로가 이미 커버 + #91의 fail-closed 의도와 정합하지 않아 폐기(F2는 #91 F3와 완전 중복이라 폐기). #91이 `prp-implement.md`를 미변경했으므로 B#6 hunk는 clean 적용. dual-review·receipt chain 무손상. plugin.json `1.20.7 → 1.20.8` + 양 footer(html/markdown) + i18n-surface 테스트 동기(surface drift 0). PRD P4/P5/P6 cascade 1.20.8/1.20.9/1.20.10 정정(#91=1.20.7 점유 반영).

### Added
- `prp-implement.md` Phase 2.5.6 — `WRITE_EXIT=$?` capture + non-zero면 `[MCCP-GATE-STOP]` surface(exit 12 vs 1 보존) + Phase 3 진입 전 exit (B#6). PreToolUse hook-block과 disjoint(hook 차단 시 node 미실행 → guard 무발화).

### Changed
- `prp-implement.md` Phase 2.5.6 — dispatch-worker 3-flag attribution doc block 추가/정정(B#13). 미forward는 이제 controller Step 3.gate `deriveVerdict` F3가 `unanchored` verdict로 HALT하는 mechanical backstop이 받침(구 서술의 `cmdMerge` 참조 → `deriveVerdict`/Step 3.gate로 갱신).

### Superseded (by #91, v1.20.7)
- 원 P4 F1(`cmdMerge` pending-split) — #91 `deriveVerdict` rule (3)이 pending을 fail-closed `reconcile-mismatch`로 처리. graceful-degrade 폐기.
- 원 P4 F2(`cmdMerge` anchoring 검증) — #91 `deriveVerdict` F3 post-hoc store anchor 검증과 완전 중복. 폐기.

## [1.20.7] — 2026-07-07

workflow-orchestration **M2a** (single-worker Workflow 이전, 단일 patch). `/mccp:work` Step 3의 implement 격리 위임 채널을 `Task`에서 `Workflow` primitive의 `agent()`로 **등가 이전**할 수 있게 한다(병렬화 전 — M2b가 `parallel`로 확장할 seam). 핵심은 회수 판정을 **반환값 ∧ envelope ∧ receipt-store 3자 reconciliation**(`deriveVerdict`)으로 통일한 것으로, 기존 envelope-only `merge`를 Workflow·Task **양 경로**에서 대체한다. **Codex Plan-R1 3 HIGH 흡수**(plan-codex 수렴 cross-gate dedupe): F1(Workflow 호출 후 fallback이 경쟁 worker 생성) → pre-invocation 경계 + `started` 표식 후 fail-closed HALT(두 번째 worker 미생성). F2(반환값 단독 SSoT가 envelope 불일치 통과) → 3자 reconciliation hard gate(status·receipt slug 집합·envelope pending 불일치 시 non-ok HALT). F3(attribution de-anchor로 dual-review 무력화) → post-hoc anchor 검증 gate(marker + 3-플래그 == `expectedAnchor` 아니면 `unanchored` HALT). default-off `MCCP_WORK_IMPLEMENT_WORKFLOW` kill switch로 3-state(인라인 / Task-격리 / Workflow-격리); Workflow 미가용은 fail-open으로 Task 경로 유지. dual-review 무손상 — Implement-Codex는 worker 컨텍스트 불변, receipt 3-플래그 anchor, PR cross-gate dedupe 무변경. plugin.json `1.20.6 → 1.20.7` + 양 footer(html/markdown) 동기.

### Added

- **`scripts/lib/implement-dispatch/result-schema.js`** — `IMPLEMENT_RESULT_SCHEMA`(agent StructuredOutput) + `deriveVerdict({result, envelope, receiptStore, expectedAnchor})` pure oracle. verdict ∈ `ok|failed|invariant-violation|reconcile-mismatch|unanchored|result-unreadable`, first-match fail-closed(invariant-first — F1 leak은 반환값 단독으로 최우선 감지, un-maskable). `tests/result-schema.test.js` 22건.
- **`scripts/workflows/implement-dispatch.js`** — 얇은 Workflow 스크립트(`export const meta` 순수 리터럴 + 단일 `agent(workerPrompt, {agentType, schema})` → `{result, dispatchId}`). 샌드박스 `require` 부재로 `IMPLEMENT_RESULT_SCHEMA` self-contained 포트. `parallel`/`isolation` 미사용(M2a 단일).

### Changed

- **`scripts/lib/dispatch-cli.js`** — `buildImplementWorkerBasePrompt`에 structured 반환 계약 추가(envelope mark 병존). 신규 `emit-workflow-args`(prepare 결과 → Workflow `args` + `expectedAnchor` 재-emit) + `reconcile`(통합 F1/F2/F3 게이트, Workflow `--result-file` / Task `--from-envelope` 자동 판별) 서브커맨드. `tests/dispatch-cli.test.js` 회귀 그린 + 신규 케이스(총 29건).
- **`commands/work.md`** — Step 3를 3-state로 재구성(3.prep 공유 / 3.route pre-invocation 경계 / 3.W Workflow 경로 + started 표식 / 3.I Task 경로 / 3.gate 통합 reconcile). 모든 tmp 경로 worktree-safe `git rev-parse --git-path`(§3.9 — `.git/` hardcode 제거). `allowed-tools`에 `Workflow` 추가.
- **`.claude-plugin/plugin.json`** — `1.20.6 → 1.20.7`. PRD Delivery Milestones: M1 `in-progress → complete`(PR #87 머지 stale 정정), M2 `pending → in-progress`.

## [1.20.6] — 2026-07-07

audit-remediation P3 (atomic-lock PID-reuse race, PRD `audit-remediation-followup` milestone 3/5). holder crash 후 OS가 그 PID를 무관한 프로세스에 재사용하면 `tryReclaimStaleLock`의 same-host 분기가 `isPidAlive`만 검사해 재사용 PID를 live holder로 오판 → mtime과 무관하게 NEVER reclaim → lock이 재사용 프로세스 종료까지 stuck(B#2, HIGH). 동일 버그가 **5개 lock 구현에 복제**되어 있었다. same-host 분기에 mtime-freshness를 tiebreaker로 결합: `alive PID + fresh mtime`만 보호하고 `alive PID + stale mtime`은 재사용 imposter로 간주해 reclaim. live holder는 문서화된 heartbeat(§3.6)가 mtime을 fresh하게 유지하므로 계속 보호된다. 이 변경은 R6-F2가 도입한 "same-host+alive → mtime 무관 보호" 계약을 의도적으로 뒤집으며, CLAUDE.md §3.6이 이미 문서화한 `(PID dead) OR (mtime > TTL)` 정책에 코드를 **재정합**시킨다. **Codex Plan-R1 3 finding 흡수**: F1(HIGH) heartbeat 없는 lock에 blanket 적용 시 느린-정상 holder를 imposter로 오인 reclaim 위험 → "Lock heartbeat 분류" 표 + Task 5 GATING으로 heartbeat-tier별 처리(renderer/trigger는 holder≪lease 입증 + live+fresh→protect 회귀로 criterion ii 적용, 제외 0건). F2(HIGH) caller pre-gate(pr-phase-guard `!isPidAlive` + cmdDetectStale `same-host-live-pid` early-return)가 tiebreaker 우회 → 필수 제거·위임(goal/ultracode cmdDetectStale 동형 전수 조정). F3(MEDIUM) heartbeat 독립성 → Task 5 분류가 per-lock file:line 근거로 gating. plugin.json `1.20.5 → 1.20.6` + 양 footer(html/markdown) + i18n-surface 테스트 동기(surface drift 0). 게이트: Implement-Codex cross-gate dedupe(plan-codex 수렴, 새 implement-time 결정 0) — codex_verdict 미stamp라 PR-Codex가 실제 diff 재검토.

### Fixed
- **B#2** atomic-lock PID-reuse race — `pr-phase-lock`/`quarantine`/`goal-phase-lock`/`ultracode-phase-lock`/`renderer/trigger` 5개 lock의 same-host reclaim 분기에 `&& !mtimeStale` tiebreaker 결합(`alive PID + stale mtime` = PID-reuse imposter → reclaim, `alive PID + fresh mtime` = live holder → protect).
- **B#2 caller** `pr-phase-guard.js` `sameHost && !isPidAlive` pre-gate 제거 → `tryReclaimStaleLock` 위임(imposter를 hook 경로에서 reclaim). `pr-phase-lock`/`goal`/`ultracode` `cmdDetectStale`의 `same-host-live-pid` early-return을 alive+mtime 조합(`same-host-live-pid-fresh` protect / `same-host-stale-imposter` reclaim)으로 교체.

### Changed
- lock 주석 블록 5곳을 새 tiebreaker 정책(§3.6 정합)으로 정정. `dispatch-controller`(3×TTL 완화책 기보유)·`session-ledger`(자체 PID-reuse guard)는 이미 안전해 스코프 제외.
- 회귀 테스트 5개 lock 파일 + `pr-phase-guard`에 `alive+fresh→protect` / `alive+stale→reclaim(imposter)` / `dead→reclaim` / `cross-host→mtime-only` 계약 커버(R6-F2 test (a) 계약 갱신 포함).

## [1.20.5] — 2026-07-06

audit-remediation P2 (session-continuity silent-failure, PRD `audit-remediation-followup` milestone 1/5). hook 레이어가 SessionEnd `.end` marker를 조용히 누락하던 root cause를 **fail-loud-open**으로 닫는다. `session-end-trace.js`가 hook-trace 모듈 로드 실패 시 marker 없이 return하던 결함(B#4, 30+ 세션 누락의 근본원인)을 hook-trace 독립 `writeDegradedEndMarker`(fs 직접 write + sessionId path-token self-검증)로 보장하고, `markSessionEndResilient`가 main/runSync 양 경로에서 폴백 + loud stderr로 관측화(B#5). `session-end-marker.js` 중첩 catch도 wholesale 실패 시 degraded marker 시도. `session-end.js`(Stop per-turn)가 idle 대화 세션 lease를 `renewLease`로 heartbeat해 `LEASE_LIVE_MS(10분)` false crash 방지(B#10). `loop-counter.js`/`state-writer.js` `tryAcquire`의 fd 누수를 try/finally로 차단(B#17). CLAUDE.md §3.2 state-lock "atomic"→"advisory" 문서 정정(B#16). **Codex Implement-R1 2 finding 흡수**: F1(HIGH) Stop heartbeat가 `process.cwd()` 대신 event.cwd/session_id 사용(multi-worktree no-op 방지). F2(MEDIUM) degraded marker가 `<sid>.lease`도 release해 evictLRU 24h stuck 방지. plugin.json `1.20.4 → 1.20.5` + 양 footer(html/markdown) 동기. 게이트: Implement-Codex cross-gate dedupe(plan-codex D1-D5 수렴, 새 implement-time 결정 0) — codex_verdict 미stamp라 PR-Codex가 실제 diff 재검토.

### Added
- `session-end-trace.js` — `writeDegradedEndMarker(repoRoot, sessionId)` (hook-trace 독립 `.end` marker + lease release, fail-open) + `markSessionEndResilient(repoRoot, sessionId, ht)` (ht 폴백 + loud stderr) export.

### Fixed
- **B#4** SessionEnd marker silent-failure — hook-trace 로드 실패 시 degraded marker 보장 (`.end` 존재로 crash-alert 억제).
- **B#5** 실패 은폐 — `session-end-trace`/`session-end-marker`가 degraded 경로를 loud stderr로 표면화 (generic `run-with-flags` runner는 fail-open 계약 보존).
- **B#10** idle 대화 세션 false crash — `session-end.js` Stop per-turn `renewLease` heartbeat (event.cwd/session_id).
- **B#17** `loop-counter.js`/`state-writer.js` `tryAcquire` fd 누수 — write/close try/finally.

### Changed
- **B#16** CLAUDE.md §3.2 — STATE.md state-lock "atomic lock" → "advisory lock (fail-soft ~1s, last-writer-wins)" 문서 정정.

## [1.20.4] — 2026-07-05

workflow-orchestration M1 (plan fan-out MVP, 단일 patch). `/mccp:plan`의 GROUND(Pattern Grounding)를 **read-only 다관점 병렬 fan-out**으로 강화한다 — architect/security/test/explorer 4관점을 **전용 read-only agent**(`fanout-*`, tools: Read/Grep/Glob)로 `Workflow` primitive `agent()`에 병렬 spawn → pure 스크립트가 synthesize → plan body에 `## Multi-Perspective Fan-out` 섹션 주입. write/edit/bash **도구 부재**로 파일 변형·receipt write가 구조적으로 불가 → 기존 Codex dual-review·receipt chain은 무손상이며(fan-out 결과는 `plan_hash`에 포함돼 review됨), PRD "receipt attribution" Open Question은 M1에서 발생하지 않아 M2로 자연 이연. **Codex Plan-R1 3 finding 흡수**: F1(HIGH) read-only 미강제(`security-reviewer`/`tdd-guide`가 write-capable) → 전용 read-only agent 도구 부재로 mechanical 강제. F2(HIGH) budget hard ceiling 미강제(`budget`은 read-only라 설정 불가) → 정직 재서술: fleetSize 고정+`effort:'low'` 구조적 상한 + `budget.remaining()` 사전 skip + cost-state 없으면 skip(고비용 fail-closed) + `shouldSkipForBudget` smoke. F3(MEDIUM) command-body가 opt-in 아님 → `MCCP_PLAN_FANOUT` default off 명시 opt-in + CLAUDE.md 별도 문서화. 비용: default-off + cost-tier autoDisable(notice+) + fleetSize 4 고정. Workflow 샌드박스에 `require` 부재 → workflow 스크립트는 oracle의 self-contained 포트(oracle 3종은 tested reference + `budget.resolveFanout`은 caller-side 게이트로 실사용). plugin.json `1.20.2 → 1.20.4` + 양 footer(html/markdown) 동기(surface drift 0). 게이트: Implement-Codex cross-gate dedupe(plan-codex 수렴, 새 implement-time 결정 0).

### Added

- **`scripts/lib/plan-fanout/{perspectives,budget,synthesize}.js`** — pure/dep-free oracle 3종. perspectives(4 read-only agent 카탈로그 + `PERSPECTIVE_SCHEMA` + `buildPerspectivePrompt`), budget(`parseFanoutMode` default-off + `resolveFanout` mode×PRD×cost-tier 결정트리 + `shouldSkipForBudget` 예산 predicate, briefing/cost-guard mirror), synthesize(관점 결과 → severity-ranked `## Multi-Perspective Fan-out` 마크다운, 부분/전부-null fallback sentinel). 각 `tests/*.test.js` 총 31건.
- **`scripts/workflows/plan-fanout.js`** — Workflow 스크립트(`export const meta` 순수 리터럴 + budget 사전 가드 + `parallel` fan-out + synthesize). 샌드박스 `require` 부재로 oracle의 self-contained 포트(catalog/prompt/schema/synthesize).
- **`agents/fanout-{architect,security,test,explorer}.md`** — 4 전용 read-only agent(`tools: [Read, Grep, Glob]`, Prompt Defense Baseline mirror). write/edit/bash 부재 = read-only mechanical 강제(Codex F1).

### Changed

- **`commands/plan.md`** — Pattern Grounding 뒤 `## Phase 2.5 — MULTI-PERSPECTIVE FAN-OUT` 추가(resolveFanout run/skip 오라클 → Workflow 호출 지시 → markdown 주입 or 인라인 fallback, fail-open).
- **`.claude-plugin/plugin.json`** — `1.20.2 → 1.20.4`.
- **`scripts/lib/renderer/{html,markdown}.js`** — footer version `v1.20.2 → v1.20.4` 동기(§3.7 surface drift 0).
- **`CLAUDE.md`** — §1.4 표 1행(plan fan-out) + §4 `MCCP_PLAN_FANOUT`/`MCCP_PLAN_FANOUT_BUDGET`/`MCCP_PLAN_FANOUT_AUTODISABLE_TIER` 토글.
- **`.claude/prds/workflow-orchestration.prd.md`** — Delivery Milestones M1 `pending → in-progress` + Plan cell(`/mccp:plan`이 생성 시 기록).

## [1.20.3] — 2026-07-05

P1 — Codex dual-review 무결성 복구 (cross-gate dedupe false-skip, 단일 patch). cross-gate dedupe가 PR-step Codex를 skip할지 결정할 때 실제 Codex verdict가 아니라 receipt-write 시 **항상 `true`로 default되는 `resolution.converged`**를 검사하던 결함을 닫는다. plan/implement Codex가 divergent(non-critical) 판정을 내려도 양쪽 receipt에 `converged=true`가 기록되어 PR-Codex가 조용히 skip되고 dual-review invariant가 무력화되던 경로였다. **설계 결정 Option B(fail-closed)**: `converged`를 재사용하지 않고 신규 필드 `resolution.codex_verdict`(enum `converged|divergent|critical|unavailable|skipped`)를 추가한다 — `converged`("작성자가 findings 처리를 확정")와 "Codex가 approve했다"의 의미를 분리(B#11). dedupe skip 조건은 이제 `residual empty` **AND** plan-codex `codex_verdict==='converged'` **AND** implement-codex `codex_verdict==='converged'`; 어느 하나라도 미충족(구 receipt의 필드 부재 포함)이면 fail-closed로 skip 안 함(= PR-Codex 실행). 무테스트였던 `evaluateForDedupe`에 회귀 테스트 6건 신설. **Codex Plan-R1 2 HIGH 흡수**: F1 stale `CODEX_DEDUPE_AT_PR` env 우회(`pr.md` Phase 2.5.2 진입 시 hard-reset + 현재 `skip_safe===true`에서만 재-export) · F2 design-critique `$VERDICT` 변수 재사용 위험(command body가 `$CODEX_VERDICT` **전용 변수**로 도출, 재사용 금지). receipt_hash 봉인: `codex_verdict`는 `resolution`에 들어가 subject_hash(정체성) 불변 + receipt_hash 자동 봉인, 구 receipt는 필드 부재로 bit-identical. plugin.json `1.20.2 → 1.20.3` + 양 footer(html/markdown) + i18n 스냅샷 테스트 동기.

### Added

- **`scripts/receipt/tests/dedupe.test.js`** — `evaluateForDedupe` 회귀 6건(무테스트 critical 경로): `codexConverged` fail-closed(legacy `converged=true`가 verdict 부재 시 converged 아님) · 양쪽 converged + residual 없음 → skip_safe=true · 한쪽 divergent → false · 한쪽 codex_verdict 부재 → false(fail-closed) · plan receipt 부재 → false · residual 존재 → false. `buildReceipt`+`writeReceipt`로 write→read→dedupe 전체 경로 실증.
- **`scripts/lib/tests/pr-phase-helpers/finalize-receipt.test.js`** — `codex_outcome → codex_verdict` 매핑 테스트(invoked→converged, disabled/skipped/deduped→skipped, unknown→forward 없음).

### Changed

- **`scripts/receipt/schema.js`** — `resolution.codex_verdict` optional enum 추가(present-only, 부재 허용). `CODEX_VERDICT_VALUES` export.
- **`scripts/receipt/write.js`** — `--codex-verdict` 인자 수용 → resolution에 반영(미전달 시 필드 omit → fail-closed). receipt_hash 봉인 경로 유지.
- **`scripts/receipt/dedupe.js`** — `evaluateForDedupe` convergence 검사를 `codex_verdict==='converged'` 기반 fail-closed로 변경(`codexConverged` helper 신설). convergence 블록이 raw `codex_verdict`도 노출.
- **`scripts/lib/pr-phase-helpers/finalize-receipt.js`** — `deriveCodexFlags`가 `codex_outcome`→`--codex-verdict` forward(PR-codex receipt audit 완결성).
- **`scripts/receipt/cli.js`** — `write` help에 `--codex-verdict` 노출.
- **`commands/plan.md`** + **`commands/prp-implement.md`** — Codex invoke 뒤 `$CODEX_VERDICT` 전용 변수 도출(codex-bridge.parseVerdict, disabled→skipped/advisory→unavailable) + receipt-write에 `--codex-verdict` forward(design-critique `$RECEIPT_VERDICT`와 분리).
- **`commands/pr.md`** — Phase 2.5.2 진입 시 stale `CODEX_DEDUPE_AT_PR` hard-reset(unset) + 현재 `skip_safe===true`에서만 재-export(Codex R1 F1). convergence 설명을 codex_verdict 기준으로 갱신.
- **`.claude-plugin/plugin.json`** — `1.20.2 → 1.20.3`.
- **`scripts/lib/renderer/{html,markdown}.js`** + **`tests/i18n-surface.test.js`** — footer version `v1.20.2 → v1.20.3` 동기(surface drift 0).

## [1.20.2] — 2026-07-04

work-context-isolation M1 (implement 스텝 격리 위임, 단일 patch). `/mccp:work` Step 3의 인라인 `Skill(mccp:prp-implement)` 호출을 **격리된 단일 worker `Agent` 위임**으로 교체한다 — worker가 파일 탐색·edit·validate 루프·Implement-Codex 게이트·receipt write를 자기 컨텍스트에서 수행하고, 메인(controller) 세션은 envelope 요약(변경 파일·receipt path·verdict)만 회수해 메인 피크 컨텍스트를 얇게 유지한다(implement 스텝의 최대 컨텍스트 누적원 격리). 메커니즘은 신규 발명이 아니라 dispatch-controller substrate(v1.2.0-m1 — `prepareDispatch`/`mergeEnvelopes`/envelope schema/3-flag attribution)를 single-worker로 재사용. Task 0 spike로 self-contained worker prompt를 실증(subagent가 nested `Skill(mccp:prp-implement)`에 의존하지 않고 자기 Bash로 게이트/receipt/envelope 계약을 구동 — 위임 shape `prepare→Agent→merge` 불변). **Codex Plan-R1 3 finding 흡수**: F1(HIGH) worker의 Phase 7 auto-chain이 격리 안에서 commit/PR → 되돌릴 수 없는 external state change → worker prompt commit/PR 금지 guardrail + merge가 `mccp-pr-codex` receipt 유입 시 `invariant-violation` HALT. F2(HIGH) 동기 단일 worker가 15분 초과 시 다른 validate-cmd가 envelope stale-reclaim → 성공 FS + 실패 envelope 짝남 → `skipHeartbeat:true`로 heartbeat 미생성(reclaim 대상 제외, orphan 없음). F3(MEDIUM) 절대 envelope path를 `--ipc-envelope-path`로 forward 시 receipt schema(`ENVELOPE_PATH_RE`) fail-closed → repo-relative `ipcEnvelopePath` 별도 emit + receipt write→validate round-trip 테스트. `MCCP_WORK_ISOLATE_IMPLEMENT=0` kill switch(인라인 fallback) + prepare 실패 시 자동 fallback. standalone `/mccp:prp-implement`엔 미적용(격리 locus는 work.md 오케스트레이터 한정). 게이트: Implement-Codex cross-gate dedupe(plan-codex 수렴, 새 implement-time 결정 0). plugin.json `1.20.1 → 1.20.2` patch bump + 양 footer(html/markdown) + i18n 스냅샷 테스트 동기(version drift 0).

### Added

- **`scripts/lib/dispatch-cli.js`** — dispatch-controller lib의 thin CLI wrapper. `prepare-single`(1-worker `prepareDispatch` + self-contained implement worker prompt, 절대 `envelopePath`(로컬 read) + repo-relative `ipcEnvelopePath`(receipt flag) 별도 emit, `skipHeartbeat:true`) · `merge`(terminal envelope read + `mergeEnvelopes([env])` → `{verdict, receiptsAdded, findings, failedWorkers, invariantViolations}`, F1 `mccp-pr-codex` receipt 유입 감지) · `mark`(worker-side envelope 전이 — `dispatch-envelope.markStatus` thin passthrough).
- **`scripts/lib/tests/dispatch-cli.test.js`** — 18건: parseFlags 미러, F3 repo-relative ipc path의 `ENVELOPE_PATH_RE` 정합 + 절대경로 거부, prepare-single dry-run/live, F2 no-heartbeat→reclaimStale 무반응, mark/merge verdict enum, F1 invariant-violation, F3 receipt write→validate round-trip(git 샌드박스 + `MCCP_DISPATCH_CONTEXT=1`, repo-relative accept / absolute fail-closed).

### Changed

- **`commands/work.md`** — Step 3 재작성(인라인 Skill → prepare-single→Task→merge 격리 위임) + frontmatter `allowed-tools`에 `Task` 추가 + `MCCP_WORK_ISOLATE_IMPLEMENT` kill switch + `next-step` HALT preflight 보존 + merge `verdict != ok`(특히 `invariant-violation`) HARD halt Forbidden 항목.
- **`.claude-plugin/plugin.json`** — `1.20.1 → 1.20.2`.
- **`scripts/lib/renderer/{html,markdown}.js`** + **`tests/i18n-surface.test.js`** — footer version `v1.20.1 → v1.20.2` 동기(surface drift 0).
- **`.gitignore`** — `.claude/state/dispatches/`(envelope IPC working-tree 상태) 제외 추가.
- **`CLAUDE.md`** — §1.4 게이트 표 work implement isolation 1행 + §4 `MCCP_WORK_ISOLATE_IMPLEMENT` 토글.

## [1.20.1] — 2026-07-02

dashboard-audit enumerate scope·정렬 근본 결함 수정 (단일 patch). `stale-audit/enumerate.js` 의 두 결함을 닫는다: (1) 정렬 `kindRank[kind] || 9` 가 milestone rank `0` 을 falsy 단락으로 `9` 로 뒤집어 in-progress 마일스톤(가장 stale 한 은퇴 후보)을 리스트 맨 뒤로 밀던 버그 → nullish `?? 9` 로 rank 0 보존, (2) enumerate scope 가 `derive/sources/plans.js` 미표시 디렉토리(`.claude/PRPs/plans/completed/`)를 superset 으로 포함해 대시보드에 뜨지 않는 무효 항목을 audit 대상 앞쪽에 채우던 scope drift → derive `PLAN_DIRS`(SSoT) 를 그대로 재사용해 `enumerate == derive scope` 로 정합. 두 결함이 겹쳐 audit 이 "대시보드에 실제로 뜨는 항목"을 올바른 우선순위로 노출하지 못했다(증상: 위험 해결 마크가 대시보드에 반영 안 됨 — completed/ 오탐 소스). 게이트: Implement-Codex cross-gate dedupe(plan-codex 수렴, 새 implement-time 결정 0). plugin.json `1.20.0 → 1.20.1` patch bump + 양 footer(html/markdown) + i18n 스냅샷 테스트 동기(version drift 0).

### Fixed

- **`scripts/lib/stale-audit/enumerate.js`** — 정렬 comparator `kindRank` lookup 을 `|| 9` → `?? 9` (양변). milestone(rank 0)이 unknown-kind fallback `9` 로 뒤집히지 않고 맨 앞 유지. enumerate scope 를 `require('../../derive/sources/plans').PLAN_DIRS` 로 단순화 — completed/ 아카이브 concat 제거(derive 미표시 → 마킹 무효). 주석을 "audit 대상 = 대시보드 표시 항목(derive scope SSoT)" 로 정정.

### Added

- **`scripts/lib/stale-audit/tests/enumerate.test.js`** — 회귀 2건: (a) in-progress 마일스톤이 risk/oq 보다 앞(정렬 nullish), (b) `.claude/PRPs/plans/completed/` fixture 가 enumerate 에 안 잡힘(scope 정합).

## [1.20.0] — 2026-07-01

dashboard-readability M3 (PRD 마지막 milestone → minor) — 판정 어휘 사용자 친화화. 대시보드 전 섹션에 흩어진 dual-review 판정 라벨을 사용자 친화 어휘로 일관 치환한다: `수렴→통과`, `진행→진행 중`, `divergent`/`미수렴→보류`. HIGH 리스크(사용자 노출 site 일부 누락)를 막기 위해 세 어휘를 단일 소스 모듈(`parsers/verdict-label.js`, `VERDICT` frozen 맵)로 뽑아 5개 렌더 파일(`sections/pipeline.js` · `sections/audit-timeline.js` · `sections/status-grid.js` · `parsers/drawer-detail.js` · `parsers/next-action.js`)이 이를 소비하게 하고, 렌더 출력(`r.md`/visible `r.html`)의 잔여 `수렴`/`미수렴`/`divergent` 0 을 강제하는 metric 테스트를 추가한다. 아이콘(✓/◐/⚠)·톤(low/med/high)·CSS class·decision-state enum(`converged`/`blocked`)은 불변(코드값 변경 없음, PRD Design Direction — 텍스트 라벨 스왑만). `next-action.js` 는 plan-frontier description 의 모순 어휘(`plan 게이트 수렴 진행 중`)도 `plan 게이트 진행 중`으로 정정. **Codex R1 2 finding 흡수**: F1(HIGH, ACCEPT_NOW) — metric 이 `<script>` 전부 strip 하면 사용자-클릭 드로어 데이터(`<script type="application/json" id="drawer-data">`)의 stale 어휘가 grep 전에 제거돼 false-negative → Task 8 재설계로 흡수(application/json 보존 + `#drawer-data` JSON 파싱해 receipt/worktree verdict 필드 직접 단언 + 드로어 detail fixture). F2(MEDIUM, DEFER_TO_BACKLOG) — renderer-only audit 이 비-대시보드 emitter(`state/fix-task.js:63`·`hooks/stop-review-loop.js:357` 의 `Codex divergent`) 누락 → PRD scope=대시보드(renderer) 명시 한정 + backlog 이월. 게이트: Implement-Codex cross-gate dedupe(plan-codex 수렴, 새 implement-time 결정 0) · design silent-skip(produced diff 가 렌더러 `.js` 소스 = control-plane, 렌더 출력은 gitignore). plugin.json `1.19.2 → 1.20.0` minor bump + 양 footer + 스냅샷/metric 테스트 동기(version drift 0).

### Added

- **`scripts/lib/renderer/parsers/verdict-label.js`** — 판정 어휘 SSoT. `VERDICT = Object.freeze({ PASS:'통과', IN_PROGRESS:'진행 중', HOLD:'보류' })` + 내부 enum(`converged`/`active`/`divergent`/`blocked`)→라벨 매핑 헤더 주석. 5개 렌더 파일이 유일 소비처.
- **`scripts/lib/renderer/tests/verdict-label.test.js`** — (a) VERDICT 값 단위 + (b) `buildReceiptDetail`/`buildWorktreeDetail` verdict 필드 직접 단언(false-negative 차단) + (c) 통제 model `renderStatus` metric(`r.md` 구 어휘 0 + 신 어휘 present) + (d) F1 — `r.html` style/실행 script strip 후 `#drawer-data` 보존 + JSON 파싱해 receipt/worktree verdict 필드 새 어휘 단언.

### Changed

- **`scripts/lib/renderer/sections/pipeline.js`** — `NODE_MARK.done`/`converged-frontier` label → `VERDICT.PASS`, `.active` → `VERDICT.IN_PROGRESS`, `STAGE_CONVERGED`(계획/구현/PR 통과) + 게이트 통과 fallback 을 `VERDICT` 참조로. foot-stat `진행`(완료/차단 병렬 count 라벨)은 판정 어휘 아님 → 불변.
- **`scripts/lib/renderer/sections/audit-timeline.js`** — conv 3분기(blocked→`VERDICT.HOLD`, converged→`VERDICT.PASS R{n}`, else→`VERDICT.IN_PROGRESS R{n}`) + `mdMark`(⚠ 보류) + sr-only(보류). `convText`→`buildReceiptDetail` 전달로 드로어 `판정` 행 자동 정합.
- **`scripts/lib/renderer/parsers/drawer-detail.js`** — `buildReceiptDetail` 기본 conv + `buildWorktreeDetail` 게이트 행 `(미수렴)/(수렴)` → `(보류)/(통과)` 를 `VERDICT` 참조로.
- **`scripts/lib/renderer/parsers/next-action.js`** — blocked prose/description(`Codex 미수렴` → `Codex 보류`) + plan-frontier description 모순 어휘 제거(`plan 게이트 수렴 진행 중` → `plan 게이트 진행 중`).
- **`scripts/lib/renderer/sections/status-grid.js`** — 차단 셀 툴팁 `미수렴` → `보류`(`VERDICT.HOLD`).
- **`scripts/lib/renderer/html.js`** — emit 되는 `<style>` CSS 주석 `게이트 수렴했으나` → `게이트 통과했으나`(full-HTML grep 오염 제거) + footer `v1.19.2 → v1.20.0`.
- **`scripts/lib/renderer/markdown.js`** — derived 줄 footer `v1.19.2 → v1.20.0` 동기.
- **`scripts/lib/renderer/tests/{pipeline,timeline-chart,i18n-surface,drawer,markdown-equivalence}.test.js`** — 렌더 라벨 단언 새 어휘로 갱신(`구현/계획 수렴`→`통과`, `수렴 R1`→`통과 R1`, `진행 R1`→`진행 중 R1`, `divergent`→`보류`, footer 버전 4곳). briefing_summary/요약 receipt 데이터 문자열은 유지(라벨 아님).
- **`plugins/mccp/.claude-plugin/plugin.json`** — `version` `1.19.2` → `1.20.0`(§3.7 PRD 마지막 milestone minor bump).

## [1.19.2] — 2026-06-30

dashboard-readability M2 — 위험·질문 리스트 평탄화 + 출처/시각 메타. 위험·질문 패널을 PRD 그룹 chrome(`<details class="prd-group">`) 없이 **전체 평탄 `<ul class="stack-list">`** 로 렌더해, 사용자가 켠 정렬(위험도순·시간순)이 그룹 경계에 가리지 않게 한다. 그룹용 "모두 펼치기/접기" 토글을 제거하고, 각 항목 **상단**에 출처 plan 문서명(작은 회색 `.meta-cue`/`.mono`) + 출처 plan 의 최근 활동 시각(사람이 읽기 쉬운 형식, >60일은 절대일자)을 표시한다. 필터(PRD/plan)·정렬·탭(미해결/해결됨/보관됨) 축은 전부 보존 — `data-prd`/`data-plan`/`data-sev`/`data-ord` 속성 유지, `groupByPrd` 는 filterOptions 수집 전용으로만 잔존. **Codex R1 2 finding 흡수**: F1(HIGH) — flat 렌더를 `groupByPrd` 버킷 순서에서 flatten 하면 earlier-PRD low-sev 가 later-PRD CRITICAL 앞에 와 전역 severity 순서가 깨짐 → 이미 `bySev` 정렬된 `active`/`resolved`/`historical` 배열에서 *직접* 방출 + `prdKeyFor` per-item lookup. F2(MED) — 공유 `formatRelativeTime` 절대일자화가 무관 시각 표면을 변동 → opt-in `{absoluteAfterDays}` 파라미터로 default byte-identical(기존 caller blast radius 0) + threaded `now` 결정성. 게이트: Implement-Codex cross-gate dedupe(plan-codex 수렴) · design silent-skip(produced diff 가 렌더러 `.js` 소스 = control-plane, 렌더 출력은 gitignore). plugin.json `1.19.1 → 1.19.2` patch bump + 양 footer + 스냅샷 테스트 동기(version drift 0).

### Added

- **`scripts/lib/renderer/parsers/prd-group.js`** — `prdKeyFor(item, planPrd)` + `prdMetaFor(item, planPrd)` 단일-item export(`groupByPrd` 의 per-item 분기 로직 추출, DRY). flat 렌더가 각 항목 `data-prd` 부여 + filterOptions 수집에 재사용(Codex F1).
- **`scripts/lib/renderer/parsers/plan-body.js`** — `planActivity` Map(canonicalPlanPath → lastActivityMs, **전 plan**) 빌드 + `parsePlanBody` return 추가(현 `lastActivityMs` 는 in-progress staleness 에만 쓰고 버려짐). `planPrd` loop 동형.
- **`scripts/lib/renderer/tests/risks-source-time.test.js`** — 위험 항목 출처 라벨 + 시각 + flat 구조(no `prd-group`) + **cross-PRD 정렬 보존**(Codex F1, html·md 양쪽) 단언.

### Changed

- **`scripts/lib/renderer/format-utils.js`** — `formatRelativeTime(isoOrDate, now, opts)` opt-in `opts.absoluteAfterDays` bin(같은 연도 `M월 D일`, 다른 연도 `YYYY년 M월 D일`). opts 미전달 시 `N일 전` 경로 byte-identical(blast radius 0).
- **`scripts/lib/renderer/sections/risks.js` · `open-questions.js`** — 그룹 chrome 제거 → 항상 flat `<ul>`(html·md). 항목 상단 출처+시각 meta-cue(OQ `metaCueParts` 동형). `opts` 인자 수용(now 결정성). `groupByPrd` 는 filterOptions 전용.
- **`scripts/lib/renderer/index.js`** — `renderRisks`/`renderOpenQuestions` 호출에 `opts` 전달(now thread).
- **`scripts/lib/renderer/client/explore.js`** — "모두 펼치기/접기" 토글 블록 + `.prd-group` 의존 dead 머신(`refreshGroups`/`ex-first-visible`/`prd-count` 갱신) 제거. 정렬은 단일 `.stack-list` 전체 적용. 탭 카운트/빈상태/정렬/검색/세션 바 보존.
- **`scripts/lib/renderer/html.js`** — emit-gate dead `hasPrdGroups`(now-always-false) 제거(`.li-item`/explore-bar/session-bar 축이 gate 유지). `.prd-group`/`.prd-sum`/`.prd-label`/`.prd-count`/`.prd-toggle`/`.ex-first-visible` CSS dead rule 제거. footer `v1.19.1 → v1.19.2`.
- **`scripts/lib/renderer/markdown.js`** — derived 줄 footer `v1.19.1 → v1.19.2` 동기.
- **`plugins/mccp/.claude-plugin/plugin.json`** — `version` `1.19.1` → `1.19.2`(§3.7 milestone PR patch bump).

## [1.19.1] — 2026-06-30

dashboard-readability M1 — codex adversarial review timeout 근거 확정 + 문서 정정. codex-invoke 기본 timeout 이 "2분"이라는 의심을 코드 대조로 종결: 실제 `DEFAULT_TIMEOUT_MS = 900_000`(15분, `codex-invoke.js:54` + 근거 주석 47–53)이고 프로덕션 기본/call-site 어디에도 120s/2분 값은 없다(유일한 `120000` 매칭은 `codex-invoke.test.js:367` parseCliArgs flag-보존 픽스처 — 기본값 아님). 따라서 **codex timeout 동작 코드 변경 0**. 실제와 어긋난 표면은 `CLAUDE.md` §3.3 fail-closed classification 표의 `timeout` 행("90s 초과")뿐 → 코드(900s/15분)와 일치하도록 한 줄 정정. render-lock "90s"(`CLAUDE.md` 126/654)·lock-reclaim "90s" mtime 은 codex-timeout 과 무관하므로 보존. §3.7 milestone PR 관행에 따라 `plugin.json` `1.19.0 → 1.19.1` patch bump + 양 footer + 스냅샷 테스트 동기(version drift 0). 게이트: Implement-Codex cross-gate dedupe(plan-codex 수렴, doc-only 변경) · design silent-skip(rendered UI surface 부재).

### Changed

- **`CLAUDE.md` §3.3** — fail-closed classification 표 `timeout` 행 원인 셀 `90s 초과` → `900s(15분) 초과`. 코드 상수 `DEFAULT_TIMEOUT_MS = 900_000` 과 일치. 다른 셀/행 불변.
- **`plugins/mccp/.claude-plugin/plugin.json`** — `version` `1.19.0` → `1.19.1` (§3.7 milestone PR patch bump).
- **footer 동기** — `renderer/html.js`(page-foot) + `renderer/markdown.js`(derived 줄) `v1.19.0` → `v1.19.1`. `renderer/tests/i18n-surface.test.js` footer 스냅샷 테스트 동반 갱신.

## [1.19.0] — 2026-06-30

dashboard-interactivity M4 — 대시보드 액션 버튼(obsolete 닫힌 루프, **안 F mode-gated**). PRD 마지막 milestone → 닫힌 루프 완성 → minor. 드로어 위험/질문을 **"제외(obsolete)"** 버튼으로 직접 처리해 소스 `.md` 에 비파괴 해결 마커를 기록하고 렌더가 collapse 하는 act-loop 을 추가한다. 단 서버를 영구 writer 로 만들지 않는다 — POST 라우트는 기본 **미존재**이고 `/mccp:dashboard --write` 로 띄운 프로세스 수명 동안만 활성(평상시 read-only 불변). (1) **item-id SSoT**(`stale-audit/item-id.js`) — ref→opaque 16자 id(sha256 of kind+source+anchor+norm(text)), 렌더러(embed)와 서버(re-enumerate)가 공유. source separator 정규화(win32 backslash ↔ enumerate forward-slash 합치) + anchor 는 oq=lineNumber·risk=ordinal(렌더러가 risk lineNumber 부재 → 양측 공유 parse-order ordinal). browser 는 경로 미수신 — 서버가 re-enumerate 로 id→ref 역매핑. (2) **렌더러**(`drawer-detail.js`) — plan-출처 미해결 risk/oq 드로어 detail 에 `resolveId` 부여(STATE.md OQ·resolved·집계 항목 제외), DRAWER_SCRIPT 가 `hidden` 버튼 방출(기본 cache 무동작; write-mode `data-mccp-write` 로 노출). 중립 톤 버튼(P2: red/accent 회피). (3) **서버**(`dashboard-server.js`) — `--write` 플래그 + 프로세스 nonce + POST `/__mccp_resolve`(write-mode only) + serve-time `resolve-action.js`+nonce 주입(cache byte-pristine). **F2 mode-aware identity** — PID/identity `writeEnabled` 비트 + reuse 모드 일치 강제(default 가 writer 재사용/writer 가 read-only 재사용 차단). (4) **POST 핸들러 검증 체인**(fail-closed) — **F1 Host allowlist**(loopback only, 비-loopback → / · POST 모두 reject = DNS-rebinding 차단) + **F1 Origin/Referer**(구성 origin 기준, req.host 미신뢰) + nonce + body cap(8KiB) + reason strict(≥2 token) + re-enumerate id→ref + `.claude/**/*.md` containment + apply.js 위임. **F3 엄격 결과** — `applied==1 & 0 error/abort/skip` 만 success(no-exception summary 의 skipped/aborted/errored 를 거짓 성공으로 안 봄). (5) **클라이언트**(`renderer/client/resolve-action.js`) — write-mode 주입 시 버튼 노출 + reason prompt + 확인 + nonce 동봉 fetch + a11y live-region. (6) **F4 단일 render-after-write** — POST 성공 후 `triggerRender(debounce off)` + cache mtime advance 검증(invisible durable write 차단). 신규 write 엔진/reload 경로 발명 0 — apply.js(CAS/lock) · SSE · render trigger 재사용. **Codex plan-gate 4 ACCEPT_NOW 흡수**(F1 Host-gating/DNS-rebinding · F2 PID reuse mode-aware · F3 apply summary 엄격 · F4 단일 render API) + id content-only 전환 REJECT_YAGNI(ordinal anchor 가 duplicate-text 안전가드). 게이트: Implement-Codex cross-gate dedupe(plan+implement 수렴) · 14 보안 invariant + item-id 8 테스트 green. plugin.json `1.18.21 → 1.19.0` + 양 footer + i18n-surface.test.js 동기.

## [1.18.22] — 2026-06-29

design-grounding — impeccable 디자인 방향을 produced diff에 mechanical하게 강제(advisory → mechanical, [[feedback-impeccable-full-delegation]] 해석 A). 기존 `prp-implement`의 critique loop(Phase 2.5.5b)은 EXECUTE *이전*에 plan/방향만 보고 produced diff는 절대 보지 못한다. "신규 LLM 호출 0" 제약상 critique을 post-EXECUTE 재실행할 수 없으므로, **방향 캡처 → EXECUTE 소비 → 결정적(LLM-free) grounding lint**의 3-step으로 그 gap을 닫는다. critique의 divergent-block(§3.9)은 그대로 두고 그 위에 **별도 locus**의 post-produce mechanical 게이트를 얹는다(중복 아님). main #75(interactivity M3)가 같은 `prp-implement.md`에 advisory `Phase 3.6 DESIGN FINISH`를 추가했으므로, 본 mechanical 게이트는 그 **뒤**의 `Phase 3.7 DESIGN GROUNDING VERIFY`로 배치 — polish가 코드를 편집한 *최종* diff를 grounding이 lint. Codex Implement-R1 4 findings 흡수: **F1**(HIGH) — H17(nested-card)은 added-line 버킷에서 DOM open-tag stack 없이 enforce 불가 + `class=` 매처가 JSX `className=` miss → blocking 서브셋을 `GROUNDING_RULE_IDS=['H15']`(line-local-safe)로 좁히고 H17은 renderer full-HTML lint이 계속 소유. **F2**(HIGH) — worktree dirty 시 baseline diff가 EXECUTE delta가 아님 → capture 시점 pre-EXECUTE rendered 버킷 스냅샷 후 verify에서 per-bucket line-set 차감. **F3**(MED) — write.js가 fresh skeleton overwrite라 plain re-write가 `design_critique_*` drop → `restampGroundingVerdict` field-preserving helper(read existing → verdict만 mutate → 양 hash 재계산). **F4**(MED) — capture 기대됐으나 read 실패 시 enforce가 no-op로 강등 → `decideGrounding({readFailed})`가 enforce에서 `inconclusive` block + atomic artifact write. 추가로 bare `.md` rendered 포함이 command-doc(`####` 다수)에 H15 오발화하는 plan 잠재결함 발견 → rendered md는 `.claude/cache/*.md`만 scope. 모든 artifact 경로는 `git rev-parse --git-path`(worktree-safe, F1) — `.git/` hardcode 0. verdict enum 5종(`grounded`/`anchor_clean`/`inconclusive`/`violations`/`skipped`). 신규 LLM 호출 0. plugin.json `1.18.21 → 1.18.22`(main #75와 병렬 cycle로 1.18.21 선점 → forward reconcile, §3.7) + 양 footer.

### Added

- **`scripts/lib/design-grounding.js`** — 신규 순수 lib(LLM-free): `parseGroundingMode`(off/warn/enforce, default enforce) · `extractRenderedSurfaceFromDiff`(unified diff added line → css/html/md 버킷, generic `.md` 제외) · `captureDirection`(atomic temp+rename, pre-EXECUTE 버킷 스냅샷) · `readDirection`(null fail-open) · `lintProducedDiff`(delta 차감 후 `runRules(GROUNDING_RULES)` + signal-consistency) · `decideGrounding`(5-verdict enum + `readFailed` inconclusive). output-constraints `runRules`/`GROUNDING_RULES` + impeccable-routing `extractDiffSignals` 재사용.
- **`scripts/lib/tests/design-grounding.test.js`** — 25 test(parseMode/extract/subtract/capture-read round-trip/atomic/fail-open/lint/decide 5-verdict/end-to-end).
- **`scripts/receipt/tests/design-grounding-fields.test.js`** — 9 test(captured/verdict round-trip + present-only legacy + restamp field-preservation F3 + unknown additive meta 보존).
- **receipt meta** `design_grounding_captured`(gate-time bool) + `design_grounding_verdict`(post-EXECUTE enum) — present-only, migration 불필요. `cli.js restamp-grounding` verb.

### Changed

- **`scripts/lib/renderer/output-constraints.js`** — 룰 반복을 `runRules(input, rules)`로 추출 + `runOutputConstraints`는 위임(behavior-preserving). `GROUNDING_RULE_IDS=['H15']` + `GROUNDING_RULES` export(H17 제외 — F1). 기존 83 test 무회귀 + 동등성 단언 3 추가.
- **`scripts/receipt/{schema,write,cli}.js`** — grounding 2-field present-only validation + skeleton + parse + `restampGroundingVerdict`(read existing → verdict만 mutate → subject/receipt hash 재계산 → validate → write, F3). verdict는 receiptHash carve-out 안 함(tamper-protected).
- **`commands/prp-implement.md`** — Phase 2.5.5c(trigger 시 capture + `--design-grounding-captured` forward) · Phase 3 per-task 시작에 Design Grounding Constraints consume 블록 · 신규 **Phase 3.7 DESIGN GROUNDING VERIFY**(main #75의 advisory Phase 3.6 DESIGN FINISH 뒤; baseline+tracked+untracked produced-diff, lint+decide, enforce block→fix-task+bounded retry, pass→restamp) · Phase 5 REPORT grounding verdict surface. consume/verify/restamp + 2.5.6 forward 게이트 조건은 비영속 `DESIGN_GROUNDING_CAPTURED` shell flag가 아니라 **capture 아티팩트(restamp는 result JSON) 존재 + `$ARGUMENTS` 재파생 slug로 self-derive**(shell-state 독립, separate Bash invocation에서 mechanical 게이트가 silent no-op 되지 않도록, [[feedback-loud-fail-open]]).
- **`skills/frontend-design-direction/SKILL.md`** — Output Constraints에 produced-diff H15 grounding lint 명문화.
- **`scripts/lib/renderer/{html,markdown}.js`** + `i18n-surface.test.js` — footer `v1.18.21 → v1.18.22` 동기화.
- **`CLAUDE.md`** — §3.9 하단 "Produced-diff grounding lint" sub-section(3-step 계약 + scope + verdict enum + shell-state-독립 게이트 조건) + §4 토글 catalogue에 `MCCP_DESIGN_GROUNDING=off|warn|enforce`(default enforce, fail-closed) 추가.

## [1.18.21] — 2026-06-29

dashboard-interactivity M3 — impeccable 검증 워크플로 강화(렌더러가 아닌 **세 게이트 명령 본문 `.md`** 대상). grounding 결과 pr.md(2.5.1)는 2026-06-03 Sprint 3(`29ded48`)부터 이미 `critique`+`audit` 양쪽을 호출 중이라, 실제 gap 은 (1) code-review.md 가 critique 단독, (2) prp-implement 에 layout 선행은 있으나 clarify·distill "마무리" 부재, (3) audit 가 advisory 임이 본문에 framing 안 됨이었다. (1) **code-review.md 2.5.2** — `\|1\|1\|no\|` 행을 `critique`+`audit` 동시 호출(pr.md:310 미러)로, reuse-first 행은 양쪽 findings 재사용, audit advisory(code-reviewer gate lenient — critique retry loop §3.9 만 divergent blocking) 명시. (2) **prp-implement.md** — 2.5.5b stage-aware routing 에 pre/post 타이밍 framing(layout 은 pre-implementation 선행 invoke / clarify·distill·polish 은 produced code 미존재로 이 pass 미invoke / audit advisory / critique 단독 blocking) + **신규 Phase 3.6 DESIGN FINISH (simplify + polish)** — Phase 3 EXECUTE 이후 produced diff 대상 `clarify`+`distill`+`polish` 각 1회 invoke(advisory→REPORT). `polish` 는 순서상 마지막 = **구현 최종 검증**(이전엔 implement 라우팅 테이블 부재 + pr 는 review-only 라 적용 불가 = 어디서도 발화 못 하던 gap 을 닫음). routing oracle(`impeccable-routing.js`)·critique loop·receipt write 불변 — clarify/distill/polish 는 finish 단계에서만 invoke(2.5.5b 미invoke → 중복 0). (3) **pr.md 2.5.1** — audit 가 advisory(review-only — PR body `## Design Review` surface, 게이트 미차단; Phase 1.6 critique chain-check 만 blocking)임을 1줄 명시(`29ded48` since, code-review.md 와 framing 동형, 기능 변경 0). **Codex F1(HIGH)** — 원안은 clarify·distill 을 routing 테이블 callForm 승격(recommend→invoke)으로 처리하려 했으나 routing 은 Phase 3 EXECUTE *이전* 게이트(line 173)라 produced code 미존재 시 no-op. 흡수: routing 승격 폐기 + 신규 Phase 3.6 post-EXECUTE finish 단계가 produced diff 대상 invoke. polish 는 plan-Codex review *이후* 사용자 지시로 Phase 3.6 에 추가(동일 decision-set, dedupe envelope 보존). receipt 397 / impeccable-routing 27(oracle 불변) / renderer 639 PASS, 0 회귀. 게이트: Implement-Codex cross-gate dedupe(plan+implement 수렴) · impeccable silent-skip(`no-signal`, pre-impl UI surface 부재) · security 미트리거 · a11y skip(`rendering_surface=false`). plugin.json `1.18.20 → 1.18.21` + 양 footer + i18n-surface.test.js 단언 동기.

## [1.18.20] — 2026-06-28

dashboard-interactivity M2 — 개요 진행 중 마일스톤 패널 + 드로어 위험/질문 네비. 개요(`route-overview`)가 hero + widget-grid 만 보여주고 worktree 별 진행 정보는 활동·기록 route 의 멀티세션 표에만 있던 gap 을, derive `worktrees` source(이미 worktree 별 `milestone_hint`/`active`/`current_gate`/`last_activity` 산출)를 **재스캔 없이** 재사용해 닫는다. (1) **개요 패널** — `renderActiveMilestones`(html.js) 가 worktree 별 진행 마일스톤을 컴팩트 리스트로 노출. 상태는 `dot`(색 채널) + statusLabel 텍스트(비색 채널) **이중 인코딩**(색 단독 의미 금지, Sam 페르소나) + 게이트 + 상대시각 + 마일스톤 title(2줄 clamp, 전문은 드로어). `OVERVIEW_CAP=3` 상한 + 초과분은 활동·기록 route foot 링크(silent cap 금지 — total/shown 보존). (2) **overview projection** — `renderMultiSession` 이 in-progress worktree projection(`result.overview`)을 추가 방출. 3중 eligibility gate: `active`(14일 freshness) AND (`milestone_hint` OR `current_gate`) AND NOT just-shipped(`mccp-pr-codex` 수렴 = 마일스톤 *완료*). 단일 healthy worktree early-return 을 projection 계산 **뒤로 이동**(healthy-single 도 eligible 마일스톤이 있으면 개요 패널은 방출, 표 패널만 hidden — Codex F2 MEDIUM 흡수). (3) **드로어 네비 칩** — `.d-nav` + DRAWER_SCRIPT `navFilter` 로 마일스톤 드로어에서 위험/질문 route 이동 + 해당 PRD 필터 자동 적용. `groupByPrd` 검증 prdKey 에만 부여(죽은 버튼 0). near-monochrome 칩(중립 토큰만, 강조색은 `:focus-visible`). 드로어 키는 `ms:ov` 네임스페이스(표 `wt:` 와 분리 — H18 중복-id 회피). (4) **plain-text 동등** — markdown.js 가 색 채널 없는 STATUS.md 에 icon(◐) + statusLabel 을 함께 실어 상태를 비색 채널로 보존. **Codex F1(HIGH)** — `worktreeStatusKind !== 'idle'` 단독은 stale STATE.md / 이미 ship 된 마일스톤을 "진행중"으로 오판정(PRD "거짓 진행중" Risk 재현). `active` freshness gate + just-shipped 제외로 worktrees source 가 이미 제공하는 freshness + closure 신호를 채택. 전부 read-only 렌더 변경(신규 스캔·서버 mutation·correlation 재설계 0). renderer 639 PASS, 0 회귀. 게이트: critique 34/40 CONVERGED · audit 19/20 Excellent · PR-Codex R1 0 actionable(`lock_exit_ok` + `mutations=[]`) · security 미트리거(순수 renderer, escapeHtml) · a11y skip(`rendering_surface=false`). plugin.json `1.18.19 → 1.18.20` + 양 footer. PR #74(squash `1978a25`).

### Added

- **`scripts/lib/renderer/html.js`** — `renderActiveMilestones` 개요 패널(worktree 별 dot + statusLabel 이중 인코딩, `OVERVIEW_CAP=3` + foot 링크, 2줄 clamp title) + `.am-*` CSS(full-width border-top hairline, side-stripe 아님) + `.d-nav`/`.d-nav-btn` 드로어 네비 칩 CSS + DRAWER_SCRIPT `navFilter`(route 이동 + PRD 필터 dispatch).
- **`scripts/lib/renderer/markdown.js`** — `## 대시보드` 에 진행 중 마일스톤 plain-text 동등본(icon + statusLabel 비색 채널 보존, em-dash 없음 H10/H16).
- **`scripts/lib/renderer/tests/dashboard-overview.test.js`** (신규) + **`multi-session.test.js`**·**`i18n-surface.test.js`** — overview projection / 3중 eligibility gate / 네비 칩 prdKey 검증 / plain-text 동등 / graceful hide 커버.

### Changed

- **`scripts/lib/renderer/sections/multi-session.js`** — `renderMultiSession` 이 overview projection(`result.overview`) + `ms:ov` 드로어 detail 추가 방출. eligibility 3중 gate + healthy-single early-return 을 projection 뒤로 이동(Codex F2). `prdKeyFromHint`(milestone_hint 의 `.claude/prds/*.prd.md` 경로 → prdSlug, 위험/질문 data-prd 와 정확 매칭).
- **`scripts/lib/renderer/index.js`** — `renderMultiSession` 에 `planBody` 전달(네비 prdKey 를 실제 위험/질문 그룹과 대조 검증).
- **`html.js`**/**`markdown.js`** 멀티세션 표 패널 gating 을 `!!multiSession` → `multiSession.html`/`multiSession.md` 존재로 교체(개요는 `multiSession.overview` 독립 소비). 양 footer `v1.18.19 → v1.18.20`. **`plugin.json`** `1.18.19 → 1.18.20`(patch — 단일 milestone, §3.7).

## [1.18.19] — 2026-06-27

dashboard-interactivity M1.2 — 드로어 prose 렌더 시각 다듬기 + 리스트 강조 혼란 제거. M1이 깐 block-level prose 렌더(`renderProseBlockHtml`) 위에서 세 시각 결함을 닫는다: (1) **heading 위계** — `##` 가 `<p class="d-h"><strong>` 평면 강등돼 본문과 위계가 약하던 문제를, 내부 `<strong>` 제거 + styled `.d-h`(weight 650 / `--ink` / margin)로 교체. 차별화 축은 size 가 아니라 weight·color·margin 이며 `font-size: 0.8rem`(≤ `.d-sec h3`)로 묶어 prose 헤딩이 섹션 라벨보다 커지는 위계 역전을 차단(Critique F1). literal h4+ 0(H15 무발화). (2) **문단 soft break** — 단일 줄바꿈이 공백으로 합쳐져 의도된 줄 구조(완화 단계·OQ 하위 라인)가 사라지던 문제를, per-line `renderInline` 후 `<br>` join 으로 보존. md 경로(`renderProseBlockMd`)는 `\n` 유지 → HTML `<br>` ≡ md `\n` 평문 동등. (3) **리스트 강조 중립화** — 드로어 밖 위험/질문 리스트의 `**bold**` 가 흰(`--ink`) vs 회(`--ink-2`) 대비로 '확인/미확인' 상태 토글로 오인되던 문제를, `.li-q strong` 을 본문 동색(`--ink-2`/weight 600)으로 중립화하고 loud 강조 렌더는 드로어(`.d-prose strong` 신규)로 집중. **Codex F-C1(HIGH)**: soft break 가 inline 마커를 orphan 하면 literal/entity 마커가 잔존(H16 누출)하는데, 단순 parity 검사는 double-backtick code span·markdown link straddle 을 miss → **render-then-validate gate** 로 교체. 후보 `<br>` 출력을 H16 카탈로그 5종(bold `**`/`__`, single backtick, entity backtick, md-link)으로 스캔해 잔존 0 이면 채택, 아니면 known-good space-join baseline 으로 fallback — PROSE_TOKEN 문법 전체 커버로 raw 마커 누출 구조적 0. 전부 read-only 렌더/CSS 변경(신규 저장소·서버 mutation·마커 cap 확장 0). renderer 전체 스위트 green + design-lint H1-H19 clean, 0 회귀. plugin.json `1.18.18 → 1.18.19` + 양 footer.

### Changed

- **`scripts/lib/renderer/format-utils.js`** — `renderProseBlockHtml` heading 분기에서 내부 `<strong>` 제거(`.d-h` 가 CSS 로 weight 보유, 이중 인코딩 해소) + 문단 분기를 per-line `renderInline` + `<br>` join 으로 교체. 신규 module-private `hasResidualMarker`(H16 카탈로그 5종 + `<code>`/`<pre>`·Python dunder carve-out)로 render-then-validate gate 구현 — 마커 straddle 시 space-join fallback(Codex F-C1).
- **`scripts/lib/renderer/html.js`** — `.d-prose p.d-h` styled heading 위계(font-size 0.8rem ≤ `.d-sec h3`, weight 650, `--ink`, margin) + `.d-prose strong` loud(`--ink`) 신규 + `.li-q strong` 중립화(`--ink`→`--ink-2`, weight 650→600). footer `v1.18.18 → v1.18.19`.
- **`scripts/lib/renderer/tests/format-utils.test.js`** — heading 단언을 styled `.d-h`(no `<strong>`)로 갱신 + soft-join 을 `<br>` 기대로 갱신 + 신규 4종(balanced multi-line `<br>` 채택 / bold·double-backtick·md-link straddle fallback) 단언.
- **`markdown.js`** footer `v1.18.18 → v1.18.19`. **`plugin.json`** `1.18.18 → 1.18.19` (patch — 단일 milestone, §3.7).

## [1.18.18] — 2026-06-27

dashboard-interactivity M1 — 드로어 prose inline → block-level 렌더(`renderProseBlockHtml`) + plan summary 전문. 우측 상세 드로어가 plan summary·완화책을 단일 join 줄이 아니라 구조적 prose(문단·리스트·fenced code·blockquote·GFM table)로 표시. `extractPlanSummary` 전문 + render budget(`MAX_BLOCKS` cap — 단일 섹션의 DOM 폭주 방지, Codex F1 흡수) + resolved 위험 해결 사유/시각 row. escape-then-render SSoT 보존(모든 텍스트 경로가 `renderInline`/`esc` 로 종단 — raw passthrough 0, malformed 구조는 inline `<p>` 로 fail-open degrade). plugin.json `1.18.17 → 1.18.18` + 양 footer. (CHANGELOG row 는 본 M1.2 cycle 에서 소급 기록 — M1 commit 누락 gap 닫음.)

## [1.18.17] — 2026-06-26

dashboard-data-exploration M3 — 검색 wiring + 멀티세션 잔여축(PRD ③의 마지막 마일스톤). 세 표면을 닫는다: (1) **형태만 있던 사이드바 검색**을 실제 `<form role="search">` + `<input type="search">`로 wiring — 문서 전역 `.li-item`을 헤더/요약(`.li-main`) 텍스트로 **cross-route 동시 좁힘**(150ms debounce, 단축키 0·kbd "F" 제거), 매칭 페이지를 nav-link 뱃지 + 전역 `aria-live` live-region("전체 N개 일치 · 위험 8 · 질문 2")으로 surface. (2) 검색(`_hs`)과 M2 explore-bar 필터(`_hf`)를 **AND 합성** — 한 `.li-item`의 가시성 = `!(_hf || _hs)`, 두 컨트롤러가 각자 reason expando 만 set 하고 공유 `recompute`가 `hidden`을 합성(독립 필터 AND 표준 패턴, 경쟁 0). (3) **멀티세션 잔여축** — `#route-activity` 멀티세션 테이블에 진행상태·worktree 필터 + 진행순 정렬 바를 full 구현(행 `data-status`/`data-worktree`/`data-progress-rank`(blocked3>degraded2>active1>idle0)/`data-activity-ord`). 작업범위순 정렬은 PRD 명시대로 보류('PRD 기준 진행도' 재기획 전까지 미노출). JS-off 시 검색 입력·컨트롤 숨김 + 전체 항목·행 손실 없이 가시(PE 불변), STATUS.md 평문 동등. **Codex Plan-F1(MEDIUM)**: 검색 `<form>`은 `type="search"`라도 Enter 시 native submit → 검색 컨트롤러가 `submit` → `e.preventDefault()` 바인딩 + `action`/`method` 미지정으로 route·필터·검색 상태 손실 차단. **Codex Plan-F2(MEDIUM)**: M2 `explore.js:65` `if (!EX || !bars.length) return`이 `.explore-bar` 부재 시 검색 wiring 을 막던 갭 → guard 를 `if (!EX) return`으로 낮추고 검색을 bars 와 독립 실행. **Codex Implement-IF1(MEDIUM)**: `data-js="on"`을 EX 확인 *뒤*로 이동 — `EXPLORE_SORT_JS` 누락 시 `.js-only` 컨트롤(검색 폼 포함)이 보이지만 inert 가 되는 dead-UI + Enter-navigate 회귀 차단. **Codex Implement-IF2(MEDIUM)**: 세션 바가 `.explore-bar.js-only` 재사용 → M2 `wireBar` 루프가 이중 바인딩(행 컨트롤러 경쟁 + 무관 `.li-item` 카운트 + 세션 sort 를 무효 `severity`로 reset)하던 갭 → `:not([data-explore-scope="session"])`로 소유권 분리. pure `textMatch`(NFC·대소문자·빈=전체) + `compareItems` progress mode + `matchFilter` status/worktree 축을 UMD 모듈에 누적(M2 표면 무변경). renderer 590 PASS(신규 explore-search 12 + explore-sort 8 추가) + design-lint H1-H19 clean, 0 회귀. plugin.json `1.18.16 → 1.18.17` + 양 footer.

### Added

- **`scripts/lib/renderer/tests/explore-search.test.js`** (신규, 12 test) — 검색 `<form>`/`<input type=search>` 마크업·`.js-only`·`role=search`·aria·kbd 제거 + live-region + `.nav-search-count` 슬롯 + 멀티세션 바(`data-explore-scope=session`) + 행 `data-status`/`data-worktree`/`data-progress-rank`/`data-activity-ord` + emit gate 확장(검색 타겟만 있어도 explore `<script>` emit) + no-JS degrade + H16 `data-worktree` carve-out + H19 network 0 + **F1**(폼 action 부재 + submit→preventDefault) + **F2**(guard 비-`bars.length` 종속) + **IF1**(data-js EX 뒤 set) + **IF2**(세션 바 소유권 분리).

### Changed

- **`scripts/lib/renderer/parsers/explore-sort.js`** — `compareItems`에 `progress` mode(`data-progress-rank` desc + `data-activity-ord` asc tie-break) + `matchFilter`에 `status`/`worktree` 축(M2 prd/plan 위 AND 누적) + 신규 순수 `textMatch(haystack, needle)`(NFC normalize·lowercase·빈 needle=전체). UMD 유지, M2 표면 불변.
- **`scripts/lib/renderer/client/explore.js`** — 가시성 reason 모델(`_hf`/`_hs` expando + 공유 `recompute`) 로 M2 `apply()` 리팩터(검색 빈 값이면 M2 동일 동작) + **검색 컨트롤러**(전역 `.li-item` 순회 → `.li-main` 텍스트 매칭 → nav 뱃지 + live-region + route별 빈 상태) + **멀티세션 바 컨트롤러**(`<tr>` status/worktree 필터 + 진행순 `<tbody>` 재배열). IF1(data-js EX guard 뒤) + IF2(M2 바 `:not(session)`, 세션 바 `[session]` 소유권 분리). DOM-only(H19 clean).
- **`scripts/lib/renderer/sections/multi-session.js`** — `<tr>`에 `data-status`/`data-worktree`(안정 키)/`data-progress-rank`(KIND_META `rank` SSoT)/`data-activity-ord`(recency index) 부여 + 섹션 반환에 `filterOptions: { statuses, worktrees }`(present-only·결정적 순서) 노출. md 무변경.
- **`scripts/lib/renderer/html.js`** — 사이드바 `.search` div → `<form class="search js-only" role="search">` + `<input type="search">`(kbd "F" 제거) + 전역 sr-only live-region + nav-link `.nav-search-count` 슬롯. `buildSessionBar({options})`(buildExploreBar chrome 재사용 — 진행상태/worktree select + 진행순 정렬) + 멀티세션 패널 head 통합 + emit gate 를 `hasSearchTargets || hasPrdGroups || exploreBarRendered || sessionBarRendered`로 확장. 검색/세션 바 CSS(neutral). 필터 option label `plainLabel`(inline code/bold 마커 strip — `<option>` text 의 `&#96;` entity-backtick H16 차단). footer `v1.18.16 → v1.18.17`.
- **`scripts/lib/renderer/parsers/plan-body.js`** — `extractPrdLabel`이 PRD H1 inline code/bold 마커를 strip(prd-group `<summary>` label 의 entity-backtick H16 차단 — 실데이터 plan H1 의 `` `id` `` 포함 시). 라벨은 display-only(prdKey 는 path 파생 — 매칭 무영향).
- **output-constraints.js H16** — attribute strip carve-out 두 사이트에 `data-status`/`data-worktree`/`data-progress-rank`/`data-activity-ord` 추가(`data-worktree` 브랜치명 `_` paired-underscore false-positive 차단). H19 는 확장 explore.js + explore-sort.js 자동 cover.
- **`markdown.js`** footer `v1.18.16 → v1.18.17`. **`plugin.json`** `1.18.16 → 1.18.17` (patch — PRD ③의 마지막 마일스톤, §3.7).

## [1.18.16] — 2026-06-26

dashboard-data-exploration M2 — 필터 + 정렬. M1이 깐 PE 토대(`data-prd` + `[data-js="on"]` reveal hook + `client/explore.js`) 위에서, 위험·질문 라우트에 **필터(PRD축·plan축, AND 조합)** + **정렬(위험도순·시간순)** 컨트롤 바를 추가한다. 컨트롤은 `.js-only`라 JS 비활성 시 사라지고 전체 항목이 손실 없이 보인다(PE 불변). 사용자 결정으로 진행상태/worktree 필터·진행순/작업범위순 정렬은 M2 제외(전자는 멀티세션 표면 후속, 후자는 미기획). pure 필터/정렬 로직(`compareItems`/`matchFilter`)을 **UMD 모듈(`parsers/explore-sort.js`)** 로 분리 — node 단위 테스트와 browser inline 엔진이 single-source 공유(drift 0). **Codex F1(HIGH)**: `data-ord`(시간순 키)를 severity 정렬 *이전* 원본 parse chronology(`_chronoIndex`/`_mergedIndex`)에서 파생 — render 방출 순으로 주면 "시간순"이 severity 순서를 인코딩해 정렬이 무효가 되는 버그를 차단. **Codex F2(HIGH)**: inline script emit gate를 `.prd-group` OR `.explore-bar`로 확장 — flat fallback 섹션(단일 그룹 → `.prd-group` 부재)에서도 컨트롤 wiring 동작. **Codex F3**: 한 `.li-item` 집합당 활성 컨트롤러 1개. **배치는 impeccable critique + 사용자 확정으로 panel-header 통합 단일 canonical** — 각 컨트롤 바가 자기 위험·질문 패널의 `panel-head`(제목·count 줄) 우측에 통합돼 컨트롤이 제어 대상 리스트 바로 위에 산다(scope=배치 일치). 초기 *전역 사이드바 배치* 는 scope↔placement 불일치(5 route 중 2개만 제어 + inert chrome), 위험·질문 옵션 결합으로 인한 cross-route 빈 상태, nav 무게감, 키보드 탭순서가 필터를 페이지 nav 보다 먼저 통과하는 비용으로 폐기 — dual-path 토글(`MCCP_EXPLORE_CONTROL_PLACEMENT`)도 함께 제거. 각 패널 바는 자기 route 옵션만 소비(옵션 결합 0). 컨트롤은 neutral 토큰만(강조색 예산 0, focus-visible outline 제외) + native `<select>`/`<button>`(키보드 기본) + `aria-live="polite"` 결과 수 + 빈 상태 메시지. 정렬 scope는 `.stack-list` 단위(그룹 경계 보존). **필터 polish 2건**: (1) 빈 상태·결과 수를 라우트 전역이 아닌 **활성 탭 패널 scope**로 한정(비활성 탭 매칭이 활성 탭의 빈 상태를 가리던 문제) + `.tab-radio` change 리스너로 탭 전환 동기화; (2) 특정 PRD 필터 시 첫 그룹이 `hidden`돼도 `.prd-group:first-of-type`(DOM 기준)이 숨은 그룹에 남아 둘째 가시 그룹에 stray hairline 이 생기던 문제를, 엔진이 **부모별 첫 가시 그룹**에 `ex-first-visible` 클래스를 부여해 보정. renderer 569 PASS(신규 explore-sort 9 + explore-controls 12) + design-lint H1-H19 clean, 0 회귀. plugin.json `1.18.15 → 1.18.16` + 양 footer.

### Added

- **`scripts/lib/renderer/parsers/explore-sort.js`** (신규) — 필터/정렬 pure 로직 단일 진실. `compareItems(a, b, mode)`(severity desc + ord tie-break / time asc / 잘못된 mode fail-open) + `matchFilter(desc, filters)`(PRD ∧ plan AND, sentinel 동등 매칭, 빈 필터=전체). UMD 가드(node `module.exports` + browser `window.__mccpExplore`) — 부수효과 0 · DOM 미접근 · network primitive 0(H19 clean).
- **`scripts/lib/renderer/tests/explore-sort.test.js`** (신규, 9 test) — 정렬 안정성·tie-break·문자열 강제·fail-open + AND 필터·sentinel·빈 필터·UMD 노출.
- **`scripts/lib/renderer/tests/explore-controls.test.js`** (신규, 10 test) — 컨트롤 바 마크업·`data-*` 속성·aria·`.js-only` + **panel-head 통합**(위험·질문 각 패널 head 에 바 1개씩 · 사이드바 바 부재 · scope=route) + no-JS degrade + H16/H19 clean + **F1 chronology≠severity** + **F2 flat 섹션 explore emit**.

### Changed

- **`scripts/lib/renderer/sections/{risks,open-questions}.js`** — `.li-item`에 `data-plan`(plan 필터 안정 키 — canonical plan path, STATE.md OQ는 `__global__` sentinel) · `data-sev`(RANK 0~4 정렬 키) · `data-ord`(**severity 정렬 이전** 원본 parse chronology, Codex F1) 추가. 섹션 반환에 `filterOptions: { prds:[{key,label}], plans:[{key,label,prdKey}] }`(중복 제거·결정적 순서) 노출 — html.js 컨트롤 빌더가 소비.
- **`scripts/lib/renderer/client/explore.js`** — M2 필터/정렬 엔진 추가(M1 토글 보존). 각 `.explore-bar`의 select/reset wiring → `window.__mccpExplore`로 `.li-item` 가시성(`hidden`) 토글 + 그룹 내(`.stack-list`) 재정렬 + `.prd-count` 갱신 + 빈 상태 + **결과 수는 패널 탭(미해결/완화/해결)의 `.tab-count` 를 갱신**(미해결 18→8, `updateTabCounts`) + `.explore-count`(`.sr-only`) live-region 으로 스크린리더 announce. 단일 컨트롤러 불변(scope=route `closest('.route')` — 패널 head 통합이라 자기 route 항목만 제어, F3). DOM-only(H19 clean).
- **`scripts/lib/renderer/html.js`** — `buildExploreBar({scope,options})` 컨트롤 바 빌더(`.explore-bar.js-only` — `.ex-filters`(PRD·plan) + 정렬 + 초기화, option label 은 `normalizeProse` 통과해 PRD H1 em-dash 가 H10 위반 안 되게). **`renderPanel` 에 `opts.tools` 추가 — 바를 위험·질문 패널 `panel-head`(→ `panel-head-tools`) 우측에 통합** + 결과 수(`.explore-count`)를 제목 옆 status zone 에 emit, 각 패널이 자기 route `filterOptions` 만 소비(옵션 결합 0). 전역 사이드바 배치 + `MCCP_EXPLORE_CONTROL_PLACEMENT`/`parseExplorePlacement`/`globalExploreOptions` dual-path 제거. `EXPLORE_SORT_JS` 모듈-로드 inline(EXPLORE_JS *앞*). emit gate를 `.prd-group` OR `.explore-bar`로 확장(F2). **컨트롤 형태 UI/UX(GitHub·Linear·Vercel 레퍼런스)**: `.ex-select` PRD·plan 폭 고정(`12rem` — 패널 간 일관성) + focus `outline-offset:1px`+gap `0.5rem`(인접 침범 방지) + 필터군↔정렬 분리 + **한 줄 고정(`flex-wrap:nowrap` — 2-tier 방지)** + **초기화 항상 노출** + **결과 수는 패널 탭 `.tab-count` 갱신**(별도 텍스트 0, `.explore-count` 는 `.sr-only` live-region). footer `v1.18.15 → v1.18.16`.
- **output-constraints.js H10·H16** — attribute strip carve-out에 `data-plan` + `value` 추가. M1 `data-prd` 선례 — `__global__`/`__unknown__` sentinel이 select `<option value>` + `data-plan`에서 bold-underscore false-positive를 내나 렌더 prose 아님(attribute value는 markdown 미렌더). H19는 확장 explore.js + 신규 explore-sort.js를 자동 스캔(추가 변경 없이 cover).
- **`markdown.js`** footer `v1.18.15 → v1.18.16`. **`plugin.json`** `1.18.15 → 1.18.16` (patch — PRD ③의 단일 M2, §3.7).

## [1.18.15] — 2026-06-26

dashboard-data-exploration M1 — PRD-수준 그룹핑 + Progressive-Enhancement 토대. 대시보드의 고-volume 항목 리스트(위험·미해결 질문)를 소속 PRD별 접힘 그룹(`<details class="prd-group">`)으로 묶어, 여러 PRD가 동시 진행될 때 "어느 PRD의 위험/질문인가"를 한눈에 분리한다. 그룹은 native `<details>`로 렌더되어 **JS 없이도 완전 동작**(graceful degrade 구조적 보장) — 항목마다 `data-prd` 속성 + `<html data-js="on">` 마커를 박아 M2(필터/정렬)·M3(검색)이 소비할 PE 토대를 깐다. PRD provenance 키는 **canonical plan path**(basename 아님 — archive/worktree 동명 plan 충돌 회피, Codex F2), `data-prd`는 **prdPath 파생 prdKey**(라벨 slug 아님 — 동일 H1 라벨 두 PRD 분리, Codex F2). source 미상/STATE.md는 "프로젝트 전역"(`__global__`), 매핑 실패는 "출처 미상"(`__unknown__`) 버킷 — 항목 절대 누락 0(fail-open). 단일 PRD/그룹이면 기존 flat 동작 보존(구분할 PRD 없음 → 그룹 chrome 생략), 2+ 그룹일 때만 그룹 disclosure + md 그룹 헤더 + explore.js 토글 노출. DESIGN.md "JS 0" invariant를 **routing-한정 + 데이터 탐색 PE 허용**으로 개정 + stale "3 route" → 실제 5 route 정정. **신규 H19**(Codex F1 — HIGH): inline `<script>` 본문의 런타임 network primitive(fetch/XHR/WebSocket/EventSource/sendBeacon/remote import/외부 URL 리터럴) 검출 — H13(외부 src)이 못 막는 raw-mode 데이터 유출 경로를 mechanical 차단(`application/json` 데이터 스크립트는 제외). 그룹 chrome은 neutral 토큰만(강조색 예산 0). 그룹핑은 위험의 **미해결·해결됨·보관됨** 세 탭과 질문의 **미해결·해결됨** 두 탭 전부에 동형 적용 — 미해결(primary)은 그룹별 top-3 캡, 해결됨·보관됨(secondary)은 외곽 collapse 뒤 전 항목 평문(삼중 중첩 회피). **단일 그룹 표출 규칙**: 단일 그룹이라도 **실제 PRD 소속이면 헤더 표시**(어느 PRD인지 정보 가치 — 한 PRD에만 미해결 질문이 몰려도 그룹 라벨이 보임), `프로젝트 전역`/`출처 미상` 단독 fallback만 flat(disambiguation 정보 없는 chrome 노이즈 회피). renderer 548 PASS(신규 prd-grouping 14) + design-lint H1-H19 clean, 0 회귀. plugin.json `1.18.14 → 1.18.15` + 양 footer.

### Added

- **`scripts/lib/renderer/parsers/prd-group.js`** (신규) — `groupByPrd(items, planPrd)` 순수 그룹핑 헬퍼(부수효과 0, dep-free) + `canonicalPlanPath`(plan-body 와 공유) + `prdSlug`. 결정적 그룹 순서(prdKey 사전순, `__global__`·`__unknown__` 끝) + fail-open 단일 그룹(null planPrd/빈 입력).
- **`scripts/lib/renderer/client/explore.js`** (신규) — PE 토대 client 스크립트(DOM-only, network primitive 0 — H19 1차 검증 대상). `<html data-js="on">` 마커(M2/M3 control reveal hook) + 2+ PRD 그룹 클러스터당 "모두 펼치기/접기" 토글. html.js 가 jQuery 패턴 미러로 모듈-로드 read+inline(외부 src 0 — H13).
- **`scripts/lib/renderer/tests/prd-grouping.test.js`** (신규, 14 test) — groupByPrd 순서/버킷/fail-open + 충돌 케이스(동명 basename·동일 H1 라벨·source_prd 부재·STATE.md OQ) + multi-PRD html `.prd-group`+`data-prd` + STATUS.md 그룹 라벨 평문 동등 + no-JS degrade + H19 drift/carve-out + **미해결·해결됨·보관됨 전 탭 그룹핑**(위험·질문 동형, secondary 평문 도달성) + **단일 실제 PRD 헤더 표시 / 단일 fallback flat** 분기.
- **output-constraints.js H19** — inline `<script>` 본문 network-primitive 가드(Codex F1). `runOutputConstraints`가 이미 받는 composed html 에 자연 확장, H13(외부 src)과 직교.

### Changed

- **`scripts/lib/renderer/parsers/plan-body.js`** — `parsePlanBody` 반환에 `planPrd: Map(canonicalPlanPath → { prdPath, prdLabel, prdKey })` 추가. `extractPrdLabel`(PRD H1, 표시 전용) + `derivePrdKey`(prdPath 파생 안정 식별자) 헬퍼.
- **`scripts/lib/renderer/sections/{risks,open-questions}.js`** — 미해결·해결됨·보관됨(위험)·미해결·해결됨(질문) **모든 탭 패널**을 PRD별 `<details class="prd-group">` 그룹으로(각 `.li-item`에 `data-prd` — secondary 탭 항목도 동일 부여). 단일 그룹은 **실제 PRD면 헤더 표시**(`shouldShowGroups` — prdKey가 `__global__`/`__unknown__` sentinel 이 아니면 단일이라도 그룹 chrome), fallback 단독만 flat. 패널 빌더(`panelInnerHtml`/`mdFromRendered`)를 세 버킷이 공유 — 미해결은 그룹별 top-3 캡(primary 압축), 해결됨·보관됨은 캡 없이 전 항목 평문(secondary 외곽 collapse 뒤 삼중 중첩 회피·no-JS 도달성).
- **`scripts/lib/renderer/html.js`** — `client/explore.js` 모듈-로드 inline + `.prd-group` 존재 시 `<script>` emit. `.prd-group`/`.prd-sum`/`.prd-count`/`.prd-toggle` neutral-token CSS + `[data-js="on"]` reveal hook. footer `v1.18.14 → v1.18.15`.
- **output-constraints.js H10·H16** — `data-prd` 머신 속성을 attribute strip 에 추가(`__global__`/`__unknown__` sentinel 이 bold-underscore 처럼 보이나 렌더 prose 아님 — 기존 title/alt/aria-label carve-out 동일 원칙).
- **`markdown.js`** footer `v1.18.14 → v1.18.15`. **`DESIGN.md`/`docs/v1.3.0-observability/DESIGN.md`** — JS-0 invariant routing-한정 개정 + Progressive Enhancement 절 + stale route 수(3→5) 정정.
- **`plugin.json`** `1.18.14 → 1.18.15` (patch — PRD ③의 단일 M1, §3.7).

## [1.18.14] — 2026-06-26

dashboard-multi-session M2 — 멀티세션 대시보드 섹션(UI consumer). M1이 ship한 derive `model.sources.worktrees`(live cross-worktree 진행 모델)를 소비하는 신규 전용 렌더 섹션 `sections/multi-session.js`를 추가해, 그동안 데이터 레이어만 있고 소비자가 없던 worktree 진행을 대시보드에 노출한다. worktree당 1행(진행 요약 + 차단 강조 + self 마커) + 행 클릭 시 우측 드로어 상세(`wt:` kind) + STATUS.md plain-text 동등본. 기존 `active-sessions.js`(세션 존재 축, v1.4.0)는 무손상 — 신규 섹션은 진행 축으로 병치한다. **Graceful hide(분리 규칙)**: scan off → null, healthy 단일 worktree → null(공통 경로 조용), 그러나 **0-item degraded scan**(Codex Plan-F1) **또는 단일 degraded/blocked self**(Codex Impl-F1)는 loud 노출 — verdict generic collapse가 actionable 진단을 잃지 않게 섹션이 직접 scrubbed error/차단 사유를 보존(loud-fail-open). **상태 kind**(blocked > degraded > active > idle)는 기존 `.s-*` 색 cascade 재사용(신규 CSS 색 클래스 0) + 색은 상태 셀 span에만 + 색+아이콘+텍스트 3중(WCAG non-color severity). 차단=red(≤1 강조), degraded=amber로 분리. **드로어 detail-id는 ordinal-우선**(`wt:<ordinal>:<path>`, Codex Impl-F3) — masked path(`<outside-repo:basename>`) collapse에도 충돌 0·leak 0. per-worktree scrubbed `item.error`를 진행셀/드로어/STATUS.md에 노출(Codex Impl-F2). Codex Implement-R1 3 finding(Impl-F1/F2/F3 모두 MEDIUM·ACCEPT_NOW·R1 흡수). multi-session 18 신규 + drawer 4 신규 test, renderer 526 + derive 114 PASS, design-lint clean(H4 side-stripe 회피 — self는 비-색 bg tint만), 0 회귀. **Local-review hardening**: 진행 셀 `plainSummary`(truncate가 raw 마커 페어를 분리해 `**`가 HTML 누출되던 H16 위반 차단 — bold/code 서식은 드로어 detail full prose에서 보존) + self worktree `.` dangling dot 제거(cwd-relative path → 마커만 표기) + 상태·활동 컬럼 `nowrap`(좁은 컬럼 공백 줄바꿈 방지·영역 확보). plugin.json `1.18.13 → 1.18.14`(main #66 truthfulness M8이 1.18.13 선점 → §3.7 forward-reconcile) + 양 footer. PRD M2 row → complete.

### Added

- **`scripts/lib/renderer/sections/multi-session.js`** (신규) — `renderMultiSession(model, formatUtils, options)` — worktree당 1행 테이블 + `worktreeStatusKind` oracle(blocked>degraded>active>idle, `.s-*` 재사용) + self 마커 + 4-way graceful hide + per-worktree error surface + STATUS.md md(테이블 + per-worktree 인라인 detail).
- **`scripts/lib/renderer/tests/multi-session.test.js`** (신규, 15 test) — graceful hide(scan off / healthy single) / 2+ 테이블 / self / 차단 강조 / degraded 행 보존 / 드로어 detail / escape / masked path verbatim / md↔html 동등 / Plan-F1(0-item degraded notice) / Impl-F1(unhealthy single 렌더) / Impl-F2(scrubbed error surface) / Impl-F3(동일 basename ordinal 충돌 0).

### Changed

- **`scripts/lib/renderer/parsers/drawer-detail.js`** — `detailId` `wt` case(ordinal-우선 안정 키, Impl-F3) + `buildWorktreeDetail(item, formatUtils, opts)` 빌더(경로/브랜치/HEAD/게이트/receipts/활동/차단 사유/오류 row + 진행 section, Impl-F2 error 보존).
- **`scripts/lib/renderer/{index,markdown,html}.js`** — `multiSession` 섹션 3-point 배선(`sections` 배열 9번째 append + 양쪽 destructure + 활동 route 패널 맨 앞 span2 + 앵커 + `DRAWER_SCRIPT` KIND map `wt:'worktree'` + drawerMap 집계 + `panelIcon` `ic-branch` + `.multi-session tr.self` 비-색 bg tint).
- **`scripts/lib/renderer/tests/drawer.test.js`** — `wt:` ordinal-keyed detailId 가드 + `buildWorktreeDetail` 빌더 + KIND map 라벨 + 멀티세션 drawerMap 합류 회귀(4 신규).
- **`docs/v1.3.0-observability/dashboard-surface.md`** §2.6 — 멀티세션 섹션 read-side 소비 계약(소스·graceful-hide·상태 kind·드로어 `wt:` kind).
- **`plugins/mccp/.claude-plugin/plugin.json`** — `1.18.13 → 1.18.14` + `html.js`/`markdown.js` footer `v1.18.14` 동기화 (main #66이 1.18.13 선점 → §3.7 forward-reconcile).

## [1.18.12] — 2026-06-25

dashboard-multi-session M1 — Worktree 진행 스캐너(데이터 레이어). 작업이 대부분 git worktree에서 병렬로 일어나는데 대시보드는 자신이 실행된 단일 worktree 시야에 갇혀 다른 worktree의 진행(마일스톤·게이트·차단)을 보지 못하던 사각지대를, `git worktree list --porcelain` 열거 → 각 worktree의 **working-tree** `.claude/`(STATE.md + receipts)를 직접 read하는 신규 derive count-source `worktrees`로 닫는다(gitignore-agnostic — 미커밋 진행까지 실시간). read-only · LLM-free · dep-free · loud fail-open. M2(UI 섹션)는 본 source를 소비할 뿐 M1은 데이터 레이어만. **spawn-free 계약 보존**: derive()는 perf budget상 spawn-free라 git 호출을 host-version `allowGit` 선례를 mirror한 opt-in gate 뒤에 둠 — bare derive(validate/run/perf-budget)는 OFF(scanned:false, spawn 0), render caller(`cli.js render` + `renderer/trigger.js`)만 `worktreeScan:true` opt-in. **Codex F1**(기능 영구 invisible 차단 — render 경로 배선) + **F2**(실패 error 문자열의 sibling/parent outside-root 절대경로 leak 차단 — `mask.scrubAbsPaths`) + **F3**(`readState` emptyState-swallow로 corrupt STATE가 absent 위장 → diagnostic `existsSync`+`parseStateMd`로 missing↔unparseable 구분, degraded 행 보존) 3 finding을 plan에서 흡수(cross-gate dedupe). `MCCP_MULTI_SESSION_SCAN=1|0`(force/kill) · `MCCP_WORKTREE_SCAN_CAP`(default 20, no silent cap) · `MCCP_WORKTREE_ACTIVE_DAYS`(default 14) 토글. MODEL_VERSION 'v1' 불변(additive). **Local-review hardening**: cap truncation이 self worktree(멀티세션 뷰의 anchor 행)를 떨어뜨리지 않도록 self-retention swap 추가 + `scrubAbsPaths` privacy regex의 6 엣지(posix-abs / win-drive / UNC / error-embedded / URL-preserved / relative-fragment-preserved)를 직접 단위 테스트로 격리. worktrees-source 20 신규 + mask scrubAbsPaths 6 신규 + schema-drift worktrees guard 추가, derive 114 + renderer 503 PASS, perf-budget/no-new-deps 무수정 green, 0 회귀. plugin.json `1.18.11 → 1.18.12` + 양 footer. PRD M1 row → complete.

### Added

- **`scripts/derive/sources/worktrees.js`** (신규) — `scanWorktrees`(gate + spawn facade) + `parseWorktreePorcelain`(순수 파서) + `deriveWorktreeProgress`(diagnostic STATE read + receipt 투영) + `isSelfWorktree`/`normalizeWorktreePath`(win32 8.3 short-name 확장 위해 `fs.realpathSync.native` 우선).
- **`scripts/derive/mask.js`** — `scrubAbsPaths(str, repoRoot)` export 신규(문자열 내 outside-root 절대경로/드라이브/UNC를 `<outside-repo:basename>`로 치환, URL/상대경로 fragment 보존) + `applyPathMask`에 worktrees items[].path/self_path 마스킹 + error/warning scrub.
- **`scripts/derive/tests/worktrees-source.test.js`** (신규, 20 test) — 파서 fixture / gate off no-op / gate on items / self-match / fail-open degrade / cap·truncated / **cap truncation self-retention(review M2)** / 마스킹 / outside-root leak 부재(F2) / corrupt STATE 행 보존(F3) / render 경로 opt-in vs bare off(F1).
- **`docs/v1.3.0-observability/schema-surface.md`** §13 — worktrees source의 read-side schema surface(필드·gate·fail-open·authority·scrub) 문서화.

### Changed

- **`scripts/derive/index.js`** — `SOURCE_SCANNERS`에 `worktrees: (root, opts) => scanWorktrees(root, opts)` 등록(opts threaded).
- **`scripts/derive/model.js`** — `emptyModel().sources.worktrees` count-source 선언 + `validateShape` `required`/`countSources`에 추가 + MODEL_VERSION 주석 additive 줄.
- **`scripts/derive/cli.js`** (`cmdRender`) + **`scripts/lib/renderer/trigger.js`** — render 진입점이 `derive(..., { worktreeScan: true })` opt-in 전달(Codex F1). `cmdRun`/bare derive는 off 유지.
- **`scripts/derive/tests/schema-drift.test.js`** — worktrees count-source drift guard 추가(ledger mirror).
- **`scripts/derive/tests/mask.test.js`** — `scrubAbsPaths` 직접 단위 테스트 6 추가(review M3 — privacy regex 엣지를 applyPathMask end-to-end에서 분리).
- **`scripts/derive/sources/worktrees.js`** (`scanWorktrees`) — cap truncation 전 self worktree를 retained slice에 보장하는 swap(review M2 — anchor 행 drop 방지, cap≥2에서 is_main 순서 보존).
- **`scripts/lib/renderer/html.js`** + **`scripts/lib/renderer/markdown.js`** — footer v1.18.12.
- **`.claude/prds/dashboard-multi-session.prd.md`** — M1 row → complete.

## [1.18.11] — 2026-06-25

dashboard-truthfulness M7 — 다음-행동 진실성 + 잘림 제거. 대시보드의 핵심 기능(다음 진행사항 추천)이 hollow `/mccp:resume`(handoff 없으면 noop인 복구 메타-명령)를 echo하고 Hero 설명이 문장 중간에서 `…` 잘리던 결함을, 다음-행동을 in-progress 마일스톤의 실제 게이트 frontier에서 derive하고 잘림을 제거해 닫는다. 콘솔 셸 계약(oklch 토큰·드로어·비-색 마커·카드 비중첩) 불변 — 신규 시각 시스템·색 토큰 0. **④ 다음-행동 frontier-primary(Codex R1 F1)**: `next-action.js` `resolveNextAction` 재정렬 — in-progress plan의 decision-state frontier(첫 non-done 노드: impl→`/mccp:prp-implement <planPath>`, pr→`/mccp:pr`)를 STATE.md echo보다 **먼저** 평가. STATE.md substantive 명령은 freshness-gated fallback(plan-path 인자가 현재 in-progress와 일치할 때만) — 다른 cycle을 가리키는 stale 명령이 frontier를 가리지 못한다. `HOLLOW_COMMANDS`(resume/trace/receipt-*) 필터. **genuine handoff only(Codex R1 F3)**: `/mccp:resume`는 STATE.md `last_event==='handoff_spawn'`(resume dispatcher가 honor하는 신호)일 때만 추천 — `resume_state==='in-flight'` 단독은 비추천. **① ledger-aware decision-state(Codex R1 F2)**: `decision-state.js` `buildDecisionState`에 freshness-guarded ledger 승격(`ledgerCloseFresh`) — 완료-ledger가 decision_id+plan_basename+plan_file_hash로 PROVABLY 매칭될 때만 converged-frontier→done 승격(bundled-PR 마일스톤 정직 ✓표기). same-slug 편집·partial ledger over-claim 차단(heavy coverage는 backlog defer). **⑤ 잘림 제거**: `intent-extractor.js` 첫 완결 문장(mid-word `…` 없이 종결부호까지, run-on만 단어 경계 soft-cut) → Hero subtext가 220자 hard-cut 대신 완결 문장. `html.js` `.verdict-sub` line-clamp 4→6(generous safety net) + `.hw-list li` nowrap/ellipsis → 2줄 wrap(긴 마일스톤명 전체 노출). 사용자 "그만 잘라"(완전성 > 시각 밀도, 2026-06-25). Codex Plan-Codex R1(2 HIGH+1 MEDIUM — frontier-primary 재정렬·ledger freshness-guard·handoff predicate 정렬로 흡수) + Implement-Codex cross-gate dedupe. design-critique CONVERGED. renderer 499(decision-state 11 + next-action 재작성 16 신규) + derive 87 PASS, 0 회귀. plugin.json `1.18.10 → 1.18.11` + 양 footer. PRD M6 row → complete, M7 row(in-progress) 추가.

### Changed

- **`scripts/lib/renderer/parsers/next-action.js`** — frontier-primary 재정렬 + `HOLLOW_COMMANDS` 필터 + `frontierCommand`/`stateCommandFresh` + handoff_spawn-only resume. source enum: `resume-state`/`gate-frontier`/`in-progress-plan`/`state-fresh`/`in-progress-plan-stale`/`prose`/`idle`.
- **`scripts/lib/renderer/parsers/decision-state.js`** — `buildDecisionState`/`deriveDecisionState`에 ledgerItems/planHashes opts + `ledgerCloseFresh`(strict decision+basename+hash) freshness-guarded 승격.
- **`scripts/lib/renderer/parsers/plan-hashes.js`** (신규) — `planHashesFromModel` Map<decisionId, currentPlanHash> (plan-body.js mirror, fail-open).
- **`scripts/lib/renderer/parsers/intent-extractor.js`** — `firstSentence`/`shapeIntent` + `complete` 모드(첫 완결 문장, mid-word `…` 없음).
- **`scripts/lib/renderer/verdict.js`** — Hero subtext intent `{ maxLen: 220 }` → `{ complete: true }`.
- **`scripts/lib/renderer/sections/{pipeline,status-grid}.js`** — `deriveDecisionState`에 ledger/planHashes 전달 + status-grid에 `decisionState`/`hasHandoffSignal` ctx 주입 + nextStep cell handoff_spawn 정렬.
- **`scripts/lib/renderer/html.js`** — `.verdict-sub` line-clamp 6 + `.hw-list li` 2줄 wrap + footer v1.18.11.
- **`scripts/lib/renderer/markdown.js`** — footer v1.18.11.
- **`.claude/prds/dashboard-truthfulness.prd.md`** — M6 row → complete, M7 row(in-progress) 추가.

## [1.18.10] — 2026-06-25

dashboard-truthfulness M6 — Vercel 카드 재구성 + Hero/파이프라인 진실성(branch 커밋 `97eb796`의 CHANGELOG backfill). 위젯 4종(진행중/차단/이월/위험)을 hero-panel 밖 Vercel식 2컬럼 개별 카드 + 아래-화살표 확장으로 분해(비중첩 H17). Hero h1을 마일스톤명 + 요약 subtext로(verbose Summary 잘림 1차 해소) + next-action "무엇을 하는지" 설명. impl 게이트 수렴≠완료 진실성 — `converged-frontier` 신규 상태(receipt-only supersession): downstream 게이트 receipt 존재 또는 terminal pr-codex converged일 때만 done-green, 그 외 최신 converged 비-terminal frontier는 "게이트 수렴·다음 대기". 라벨 정합(미해결 위험·게이트 파이프라인·미해결 질문·개요로 → 위험·파이프라인·질문·대시보드로) + 마일스톤 lifecycle 토글을 위험·질문과 동일 buildTabs로 통일. 콘솔 셸·route 식별자 불변. plugin.json `1.18.9 → 1.18.10` + 양 footer.

## [1.18.9] — 2026-06-25

dashboard-truthfulness M5b — 표현/Hero 의미론 정합(데이터 의미론 #1·#3·#4·#5·#6·#7). M5a(#2 진행중 진실성)에 이어 사용자 육안 검토로 드러난 나머지 표현 결함을 닫는다. 콘솔 셸 계약(oklch 토큰·드로어·비-색 마커·카드 비중첩, PR #57~#63) 불변 — 신규 시각 시스템·신규 색 토큰 0. **위험/차단 정합(#3+#7)**: rail '미해결 위험'을 backlog HIGH/CRIT(이전 소스)에서 **위험 섹션과 동일 소스**(plan body risks active=미마커)로 통일 → rail(45)==섹션(45)==nav 뱃지(45) 정합. backlog HIGH/CRIT은 '**이월 finding**'(deferred) 셀로 분리 명명. '차단' 셀에 의미 툴팁("Codex 검토 N건 미수렴 · 사람 개입 필요", 0건은 "검토 충돌 없음" empty-state). 위험 섹션 자체의 historical-risk lifecycle scope는 M6 backlog 이월(Codex F4). **Hero 재설계(#4)**: `verdict.js` 우선순위 재정렬 — fresh in-progress plan을 backlog-deferred보다 앞으로(Hero h1="현재 작업: {intent/slug}", backlog는 '이월 finding' 셀로만 노출=숨김 아닌 이동). 요약체 cap(72 codepoint, 잘림은 드로어/route 위임). **verdict 라벨 분화(#1)**: `HERO_STATUS` neutral(in-progress 진행 톤)='진행 중' / muted(idle)='대기' 분리(이전 둘 다 '대기'). **hero-version 줄 제거(#5)**: hero 표면 version 줄(html `.hero-version` + md `versionMd`) 제거 — footer page-foot가 이미 version 노출(중복 제거). version 객체는 return shape에 유지(F2 reproducible). **더보기→route 전체보기 링크(#6)**: 위험/질문/타임라인 섹션을 전용 route(`#route-risks`/`#route-questions`/`#route-activity`)에서 **full mode**로 렌더(캡 없이 전체 항목, 더보기 `<details>` 제거) → overflow 항목이 target route HTML에 실존(도달성, Codex F2). overview hero 위험 위젯은 top-3 + "전체 보기 (+N)" route 링크. md는 top-N + `<details>` 접힘 유지(plain-text 도달성). Codex Plan-Codex(3 HIGH) + Implement-Codex(2 HIGH) cross-gate dedupe(decision-set이 M5a에서 수렴, M5b 신규 implement-time 결정 0). 585 test PASS(20개 디자인 변경 회귀 갱신), 0 기능 회귀. plugin.json `1.18.8 → 1.18.9` + 양 footer. PRD M5 row → complete(진행중=0 truthful end-state).

### Changed

- **`scripts/lib/renderer/sections/status-grid.js`** — 미해결 위험 = plan body risks active(severity 내림차순 top-N) / 이월 finding 셀(backlog HIGH/CRIT 분리) / 차단 셀 툴팁 / versionMd 제거. 5 cells(진행중/차단/이월/위험/다음).
- **`scripts/lib/renderer/verdict.js`** — fresh in-progress 우선 재정렬(Hero h1 "현재 작업") + `capIntent`(72 codepoint cap, 한글 안전).
- **`scripts/lib/renderer/html.js`** — `HERO_STATUS` neutral='진행 중'/muted='대기' 분화 / heroWidget 4종(차단 툴팁+empty-state, 위험 route 링크) / hero-version 줄·CSS 제거 / hero-widgets 2x2 그리드 + `.hw-more`/`.hw-overflow` CSS / footer v1.18.9.
- **`scripts/lib/renderer/sections/{risks,open-questions,audit-timeline}.js`** — route full mode(html 전체 항목, 더보기 `<details>` 제거; md `<details>` 유지).
- **`scripts/lib/renderer/markdown.js`** — footer v1.18.9.
- **`.claude/prds/dashboard-truthfulness.prd.md`** — M5 row in-progress → complete.
- **`docs/v1.3.0-observability/dashboard-surface.md`** — §2.5 데이터 의미론 정합 문서화.

## [1.18.8] — 2026-06-25

dashboard-truthfulness M5a — 진행중 진실성(데이터 의미론 #2). 대시보드 "진행 중" 카운트가 현실과 어긋나던 결함을 닫는다(M5 전체 7결함 중 #2를 M5a로 분리 ship, 표현/Hero Task 2~7은 M5b 후속 — 비용·세션 범위, 사용자 결정). **근본 원인 2층**: (1) `parseDeliveryMilestones`가 Plan 셀에서 `(...)` 마크다운 링크만 추출 → **backtick bare-path PRD**(dashboard-truthfulness 등)의 모든 마일스톤을 in-progress 집계에서 누락(현재 작업 비표시) — `extractPlanPath` 재사용으로 Complete/Lifecycle 파서와 일관화. (2) 다수 옛 cycle PRD의 stale `in-progress` 마커 노출. **코드 3축**: 완료 자동감지 `isMilestoneClosed`(terminal receipt converged + exact decision_id + **plan_hash freshness** OR completion-ledger converged; generic/legacy/stale/모호 매핑 fail-closed — Codex Implement-F1: receipt에 is_stale 플래그 없음, freshness 신호는 plan_hash) + plan-body.js override 레이어 + 활동기반 신선도 가드(`MCCP_DASHBOARD_STALE_DAYS` 기본 14). **데이터 정리** 8 PRD row(v0.3.5/v0.4.0 axis H/v1.4.2-m1·m2/v0.3.6/v1.0.1-axis-k-m2/serve-refresh/console-redesign-m4 → complete + dashboard-truthfulness M4→complete·M5 추가). git-commit-time이 bulk commit 오염 + STATE.md task_fingerprint(cycle-prefix 없음)로 cycle/activity 가드 모두 무력 → 데이터 정리가 유일 신뢰 메커니즘. **결과 진행 중 = 1건(M5)**. Codex Plan-Codex(3 HIGH: OR 완료감지/route 도달성/PRD double in-progress) + Implement-Codex(2 HIGH: plan_hash 상관/PRD 데이터) 흡수. 신규 `completion-detect.test.js` 15케이스(F1 negative e/f/g/h) + 585 test PASS(renderer 466 + derive/stale-audit 105 + 14 기존), 0 회귀. plugin.json `1.18.7 → 1.18.8` + 양 footer. M5b는 `1.18.9` 예정.

### Changed

- **`scripts/lib/renderer/parsers/plan-body.js`** — `parseDeliveryMilestones` backtick bare-path 추출(extractPlanPath 재사용) + parsePlanBody 완료 override(plan_hash-fresh terminal receipt OR ledger) + 활동기반 신선도 가드(`MCCP_DASHBOARD_STALE_DAYS`).
- **`scripts/lib/renderer/parsers/decision-state.js`** — `isMilestoneClosed` helper(terminal-gate/exact decision/plan_hash freshness OR ledger, fail-closed). `TERMINAL_GATES` export.
- **`scripts/lib/renderer/sections/status-grid.js`** — in-progress 카운트 fresh only(stale 제외·muted 별도 표기). footer v1.18.8.
- **`.claude/prds/*.prd.md`** (8 PRD) — stale in-progress → complete 데이터 정리.

### Added

- **`scripts/lib/renderer/tests/completion-detect.test.js`** — 15 케이스(isMilestoneClosed F1 negative + parseDeliveryMilestones bare-path + parsePlanBody override/staleness).

## [1.18.7] — 2026-06-25

dashboard-truthfulness M4 — 메인 표현 정리(타임라인 더보기 · 위험/질문 복사 대칭). 데이터는 M1~M3에서 이미 truthful — M4는 메인 흐름의 *표현* 비대칭/잡음 셋을 닫는다. (1) **타임라인 더보기** — `audit-timeline.js`가 상위 20행만 렌더하고 나머지는 `+N older` muted 각주로만 노출(접근 불가)이던 것을, risks/OQ의 `top-N + <details class="more">+N 더보기` 패턴을 타임라인에 적용 — 상위 `TIMELINE_EXPANDED`(8) expanded `<ol>` + 나머지(cap 내)를 접힘으로 *접근 가능*하게. Codex R1 F1 흡수: `isLast`는 전체 capped 시퀀스 기준 단일 계산(글로벌 마지막 행만 connector 생략, 마지막 expanded 행은 collapsed 남으면 connector 유지) + 각주(archived/older/mask/gap/was_stale)를 두 `<ol>` 밖 별도 `<ul class="audit-notes">` valid-list 컨테이너로 이동. detailMap은 접힘 무관 모든 렌더 행 적재(H18 trigger==detail). (2) **OQ 메인 = 복사 버튼만** — `open-questions.js`의 verbose `inline-prompt`(`<code>{전체 명령}` + 버튼)를 경량 `li-action`(복사 버튼만)으로 교체. 전체 명령 텍스트는 드로어 `detail.action` + STATUS.md `renderDetailMd`에 불변 보존. (3) **위험 메인 복사 버튼 추가** — `risks.js`가 이미 빌드한 `ap`(drawer action용)를 메인 `li-action` 복사 버튼으로도 노출 → 위험/질문 메인 affordance 대칭(severity → 본문 → meta-cue → 복사 버튼). 복사 버튼 클릭이 드로어를 열지 않는 것은 기존 `.copy-btn` 제외 가드(`html.js` DRAWER_SCRIPT)가 이미 커버 — 신규 코드 0, 테스트로 고정. 신규 시각 시스템·신규 색 토큰 0(콘솔 셸 계약 PR #57~#63 불변), 복사 인프라(`data-copy`/`#ic-copy`/`COPY_SCRIPT`/드로어 가드) 전부 재사용. impeccable critique CONVERGED(4 Output Constraints 충족 — 복사 버튼 neutral `.copy-btn` 토큰 재사용·강조색 0, 더보기가 Constraint 4 직접 충족). plugin.json `1.18.6 → 1.18.7` patch bump(Codex R1 F2 — PRD 미완 상태 minor 시기상조; PRD 완전 종료 시 minor 정리는 별도 hot-fix) + 양 footer. PRD M3 row stale-status 정리(in-progress → complete, #63 ship 반영). 565 test PASS(renderer 460 + derive 87 + stale-audit 18), 0 회귀. H16 advisory는 truncated `relatedOpenQuestion` cue의 기존 cross-section 부채(base 동일, M4 신규 마커 0). **시각-검토 후속 진실성 2건**(사용자 피드백 2026-06-25): (a) 게이트 파이프라인이 PR 미생성(pr 노드 receipt 없음)인데도 "PR 검토 중"을 표기하던 거짓 신호를, active stage 의 node status 가 `missing`(미시작)이면 "PR 대기"/"구현 대기", `active`(in-progress receipt)면 "PR 검토 중"/"구현 중"으로 구분(`pipeline.js#statusOf`). (b) 타임라인 decision_id 가 `tail(…,24)`로 공유 prefix 를 잘라 "lness-m4-…"처럼 단어 중간이 깨지던 것을 full id + `title` 툴팁 + CSS ellipsis(prefix 유지, `.pipe-id` 동형)로 정정(`audit-timeline.js` + `.audit-dec`).

### Changed

- **`scripts/lib/renderer/sections/audit-timeline.js`** — `TIMELINE_EXPANDED=8` 더보기 분할(상위 N expanded `<ol>` + 나머지 `<details class="more">+N 더보기` 접힘). 각주를 `<ul class="audit-notes">` 별도 컨테이너로 이동(Codex R1 F1). `renderRow`가 target 배열(expanded|collapsed)로 push, isLast/ordinal 글로벌 시퀀스 기준. `TIMELINE_EXPANDED` export. (시각-검토) decision_id full 표시 + `title`(tail 중간잘림 제거).
- **`scripts/lib/renderer/sections/pipeline.js`** — (시각-검토) `statusOf` 가 active stage node status 로 대기(missing)/진행(active) 구분 — "PR 검토 중" 거짓 신호 제거.
- **`scripts/lib/renderer/sections/open-questions.js`** — 메인 `inline-prompt`(`<code>` + 버튼) → `li-action`(복사 버튼만). 전체 명령은 드로어/STATUS.md에 불변 보존.
- **`scripts/lib/renderer/sections/risks.js`** — 메인 `li-action` 복사 버튼 추가(OQ와 동일 markup·aria-label, `ap.fullText` 재사용).
- **`scripts/lib/renderer/html.js`** — `.inline-prompt` CSS → `.li-action`(우측 정렬·neutral, `.copy-btn` 토큰 재사용). `.audit-notes` 컨테이너 CSS(muted 톤). footer v1.18.7.
- **`scripts/lib/renderer/markdown.js`** — footer v1.18.7.
- **`docs/v1.3.0-observability/dashboard-surface.md`** — 타임라인 더보기 + 위험/질문 복사 대칭 surface 문서화.
- **`.claude/prds/dashboard-truthfulness.prd.md`** — M3 row in-progress → complete(stale-status 정리, Codex R1 F2).

### Tests

- `audit-timeline-snapshot.test.js` — 더보기(top-N + `<details>`) + boundary connector(글로벌 마지막만 connector 생략) + 각주 순서(collapsed 뒤 `<ul class="audit-notes">`) + cap 초과 `+N older` 공존 + detailMap 전 행 적재.
- `four-part-rendering.test.js` / `a11y-aria-labels.test.js` / `section-fidelity.test.js` — OQ 메인=복사 버튼만(`<code>` 미노출) + 위험 메인 복사 버튼(대칭, 고정 aria-label) + anatomy `inline-prompt → li-action`.
- `drawer.test.js` — 복사 버튼 클릭 ≠ 드로어 open 가드(markup-level, 신규 코드 0).
- `markdown-equivalence.test.js` — 타임라인 더보기 html↔md 정보 동등(접힘 행 양쪽 보존).
- `output-constraints.test.js` — M4 surface(더보기·li-action·audit-notes) design-lint clean(신규 위반 0).

## [1.18.6] — 2026-06-25

dashboard-truthfulness M3-b — 위험·질문 진실성 *표현*(탭·전용 nav·뱃지). M3-a(해결 마커 + 결정적 render)가 *데이터*를 truthful하게 만들었으나 *표현*이 여전히 오해를 유발했다(사용자 피드백 2026-06-25): 위험 패널의 트레일링 "해결됨 243건" 큰 숫자가 메인 흐름에서 "위험 250개" 착시, OQ 패널의 "해결됨 30건"이 ~40 미해결 착시. M3-b는 그 표현 gap을 닫는다. (1) **active/완화됨 CSS-only 탭** — `parsers/tabs.js` 순수 빌더(hidden radio + flex `order` + 인접 `:checked + label + panel` 형제 선택자, JS 0). 위험/OQ 패널의 트레일링 `해결됨 N건 <details>`를 폐기하고 `미해결`(default-checked) · `완화됨`/`해결됨` 탭으로 분리 — 큰 resolved 숫자는 탭 label의 neutral 뱃지에만 노출(메인 흐름 제거). resolved 0이면 탭 없이 미해결 직접 노출. (2) **전용 route 분리** — 단일 `route-attention`(위험·질문)을 `route-risks` + `route-questions`로 split + 좌측 nav를 `위험`(ic-alert) + `미해결 질문`(ic-help) 2 entry로 + 각 nav-link에 active count 뱃지(neutral, 0이면 미표시). CSS :target routing/topbar-title/active-state 규칙 + tb-title 동반 갱신. (3) **정중한 empty state** — `발견된 위험이 없습니다.` / `미해결 질문이 없습니다.`. (4) **apply.js lock fail-closed**(Codex M3-b F4) — `withFileLock` lock 획득 실패 시 fail-open(경고 후 진행)이던 것을 fail-closed(편집 폐기·aborted 반환)로 — lost-update 1차 방어가 lock 보유, content-hash CAS는 2차. STATUS.md plain-text 동등은 탭 → `완화됨/해결됨 N건` 접힘 매핑(drawer-detail SSoT 불변). impeccable critique CONVERGED(4 Output Constraints 충족, 신규 강조색 0, raw marker 누출 0; 정식 a11y는 PR 단계 a11y-architect). code-review 후속(비블로킹): `enumerate.js` loud-fail-open 완성(stderr만 떴고 구조적 `degraded`/`warnings` 신호는 죽어있던 것 — read/parse 실패가 `warnings[]`에도 누적되도록 `pushWarn` wiring) + CHANGELOG versioning note stale 버전(`1.17.0 → 1.18.6`) 정정. plugin.json `1.18.5 → 1.18.6` patch bump + 양 footer. 557 test PASS(renderer 452 + derive 87 + stale-audit 18), 0 회귀.

### Added

- **`scripts/lib/renderer/parsers/tabs.js`** — CSS-only 탭 빌더(순수 함수, JS 의존 0). `buildTabs(spec, formatUtils)` — radio+label+panel triple, default-checked, neutral count 뱃지, escapeHtml/escapeAttr, fail-open(빈 탭 → `''`). risks/open-questions 단일 SSoT 공유.
- **테스트** — `tabs.test.js` 신규(triple 구조·default-checked·count 뱃지·escape·fail-open) + `apply.test.js` lock 선점 fail-closed 회귀(write 0 + aborted).

### Changed

- **`scripts/lib/renderer/sections/{risks,open-questions}.js`** — 트레일링 `해결됨 N건 <details>` → active/완화됨(해결됨) 탭(`buildTabs`). resolved 큰 숫자는 탭 label 뱃지에만. empty state 정중화. `activeCount` 반환(nav 뱃지 입력). md는 plain-text `완화됨/해결됨 N건` 접힘 동등.
- **`scripts/lib/renderer/html.js`** — `route-attention` → `route-risks` + `route-questions` 분리. nav-rail `위험·질문` 단일 → `위험` + `미해결 질문` 2 entry + neutral count 뱃지. `.tabs`/`.tab`/`.tab-panel`/`.tab-radio`/`.tab-count` CSS(강조색 0, flat). CSS :target routing/topbar-title 동반 갱신. footer v1.18.6.
- **`scripts/lib/renderer/markdown.js`** — footer v1.18.6.
- **`scripts/lib/stale-audit/apply.js`** — `withFileLock` fail-closed(Codex M3-b F4) + `lockMaxRetries` 테스트 seam.
- **`scripts/lib/stale-audit/enumerate.js`** — loud-fail-open 완성(code-review M1): `warn()`가 stderr만 쓰고 `warnings[]`/`degraded`는 죽어있던 half-wiring을 `pushWarn(warnings, msg)`로 닫음 — read/parse 실패가 구조적 `degraded=true` 신호로도 surface. `enumeratePlan`/`enumeratePrd`에 `warnings` sink thread. `enumerate.test.js` read-실패 회귀 1건 추가.
- **`docs/v1.3.0-observability/dashboard-surface.md`** — active/resolved 탭 + 전용 route + 섹션 뱃지 문서화.

## [1.18.5] — 2026-06-25

dashboard-truthfulness M3 — 위험·질문 은퇴 + 마일스톤 lifecycle (평가 기반 소스 최신화). M3의 본질을 *render-side 추정 은퇴*에서 **평가 기반 소스 최신화(해결 마커)**로 재설계한다(사용자 결정 2026-06-24). 세 부분: (1) **비파괴 해결 마커 컨벤션 + 결정적 render** — 위험/OQ 라인 끝(trailing)에 `<!--mccp:resolved reason="…" at="…"-->` 마커를 달면 render가 메인에서 빼고 "해결됨 N건" 접힘으로만 노출(되돌리기 가능). resolved 신호는 **마커뿐** — bare `[x]` 체크박스나 milestone status 추정은 은퇴 안 함(Codex 재설계 F1, "explicit row-level closed marker"). 마커는 **셀 split 이전 라인 단위로 추출·제거**해 표 phantom 셀 0 + reason의 `|`/`"`/`-->` escape(Codex 재설계 F2). 컨벤션을 *문서화*하는 plan 본문(prose 안 backtick 마커 언급)이 거짓 은퇴되지 않도록 reader는 trailing 마커만 인정. (2) **`/mccp:dashboard-audit` 재사용 명령** — agent가 active(미마커) 항목을 현재 구조와 대조해 `live|resolved|obsolete` 평가(증거 인용 필수, 불확실 시 live 보수), 제안 테이블 human-gate 승인 후 결정적 applier가 소스 `.md`에 마커 삽입. applier는 per-file lock + content-hash compare-and-swap(rename 직전 재-read, 불일치 abort) + 파일당 1 트랜잭션 batch + idempotent + 편집 후 재-parse 무손상 검증(Codex 재설계 F3 lost-update 방지). 평가(추론)는 명령에만, render는 결정적 마커 reader — derive/render의 read-only·LLM-free·결정성 불변. (3) **마일스톤 lifecycle** — `VALID_STATUSES`에 `dropped` 추가 + pending/dropped를 마일스톤 패널 default-off `<details>` 토글(비-색 ◌ 예정 / ⊘ 폐기 이중표기)로 노출 + audit가 stale in-progress 마일스톤 status 최신화("진행중=실제"). lifecycle 파싱은 완료-기록 early-return 앞(Codex 재설계 F3 — lifecycle-only PRD도 렌더). plugin.json `1.18.4 → 1.18.5` patch bump + 양 footer 동기화. 548 test PASS(renderer 446 + derive 87 + stale-audit 15), 0 회귀.

### Added

- **`scripts/lib/renderer/parsers/resolution-marker.js`** — 순수 마커 컨벤션. `RESOLVED_TRAILING_RE`(trailing-anchored) + `isResolved`/`extractMeta`/`stripLineMarker`(셀 split 이전 전처리) + `stripMarker`(display) + `escapeMarkerReason`(`|`/`"`/`-->` 제거) + `buildMarker`. fail-open.
- **`scripts/lib/renderer/parsers/resolution-classify.js`** — `annotateResolution(planBody)` risk/OQ resolved flag 정규화·전파 seam(마커 기준만, 추정 0). index.js dedupe 직후 wiring.
- **`scripts/lib/stale-audit/{enumerate,apply,index,locate}.js`** — 결정적 stale-audit lib. enumerate(active 항목 + 안정 ref) + apply(비파괴 마커 삽입, F3 lock + hash CAS + batch + 재-parse 검증 + 오매칭 skip) + locate(enumerate↔apply 라인 위치 정합) + facade.
- **`commands/dashboard-audit.md`** — `/mccp:dashboard-audit` 재사용 명령(enumerate → evaluate(agent, 증거) → propose+human-gate → apply → render).
- **테스트** — resolution-marker(trailing/메타-케이스/escape) + resolution-classify(전파·fail-open) + milestone-lifecycle(토글·완료0·비-색 마커) + stale-audit enumerate/apply(F3 hash-mismatch abort·batch·idempotency·재-parse·오매칭).

### Changed

- **`scripts/lib/renderer/parsers/plan-body.js`** — `parseTableRows` withMeta(행끝 마커 셀 split 이전 strip) + `parseOpenQuestions`/`parseRisks` resolved flag(마커만) + `VALID_STATUSES`에 `dropped` + `parseDeliveryMilestonesLifecycle` 신설(pending/dropped, 링크 무요구). 기존 반환 키 불변(additive).
- **`scripts/lib/renderer/index.js`** — dedupe 직후 `annotateResolution` wiring(try/catch fail-open).
- **`scripts/lib/renderer/sections/{risks,open-questions}.js`** — active(미해결) 메인 + resolved 트레일링 `<details>`("해결됨 N건") 분할. 드로어 detail 유지(H18 trigger==key 카운트 보존). 마커 display 누출 0(stripMarker). STATE.md OQ는 항상 active.
- **`scripts/lib/renderer/sections/milestone-history.js`** — lifecycle(pending/dropped) 수집을 완료-기록 early-return 앞으로 + default-off 토글 렌더(비-색 ◌/⊘). 완료0·lifecycle-only PRD도 렌더(Codex F3).
- **`scripts/lib/renderer/html.js`** — `.ms-life-mark`/`.ms-lifecycle` 비-색 텍스트 마커 CSS(신규 색 토큰 0). footer v1.18.5.
- **`scripts/lib/renderer/markdown.js`** — footer v1.18.5.
- **`docs/v1.3.0-observability/dashboard-surface.md`** — 해결 마커 컨벤션 + audit 명령 surface + lifecycle 토글 문서화.
- **`.claude/prds/dashboard-truthfulness.prd.md`** — M2 complete + M3 in-progress + Plan cell + MVP/메트릭 문구를 "평가 기반 소스 최신화(해결 마커)"로 갱신(ledger-스냅샷-은퇴 → 마커-기반-은퇴 재설계 반영).

## [1.18.4] — 2026-06-24

dashboard-truthfulness M2 — 개요 → '대시보드' 재구성 + 호스트 버전 / 위젯 / 다음 command. 콘솔 셸의 첫 route(`#route-overview`)를 카운트-only hero에서 **호스트 프로젝트의 현재 상태를 명시하는 '대시보드'**로 재구성한다. (1) 라우트/네비/탭/STATUS.md 섹션을 '개요'→'대시보드'로 재명명(route id·`data-route` 식별자 불변, 표시 텍스트만). (2) 버전을 플러그인 self-version이 아닌 **호스트 프로젝트 신호**(host meta→CHANGELOG→git tag→최신 plan cycle→미상 사다리)에서 derive — provenance를 snapshot 안에 박기 위해 **derive 레이어 additive `model.host_version` 필드**로 stamp하고 렌더러는 snapshot만 소비(Codex R1 F2). derive 는 spawn-free 계약 유지를 위해 git-tag rung을 `allowGit:false`로 skip(rung 자체는 injection으로 보존). (3) 진행중·차단·위험을 카운트가 아닌 **항목 이름**으로 나열(top-3 + `+N 더보기` 접힘). (4) '다음 행동'을 STATE.md `Next Step`에서 추출한 실행가능 `/mccp:*` **full command line**(인자 포함, 필수-인자 검증, 미충족 시 prose-only — Codex R1 F1) + 복사 버튼으로. 렌더 데이터 조립은 `status-grid.js` 한 곳에 집중하고 html/markdown 컴포저는 산출 cell만 읽는다 — STATUS.md plain-text 동등본 불변. Codex Plan-Codex R1 3 findings absorbed: F1(next-action full command line + `REQUIRES_ARG` 검증 + in-progress 폴백 resolved path), F2(host-version derive 레이어 이동 → snapshot provenance 재현 가능, MODEL_VERSION 'v1' 불변), F3(host meta first + CHANGELOG source-라벨 폴백 + plan-cycle framing + `source` 항상 노출). plugin.json `1.18.3 → 1.18.4` patch bump + 양 footer 동기화.

### Added

- **`scripts/derive/host-version.js`** — `resolveHostVersion` 5단 폴백 사다리(host meta → CHANGELOG → git-tag(opt-in) → plan-cycle → 미상), loud fail-open, dep-free. derive 시점 stamp → `model.host_version` snapshot.
- **`scripts/lib/renderer/parsers/next-action.js`** — `resolveNextAction` STATE.md `Next Step` blob → full command line(인자 포함) + `REQUIRES_ARG` 검증 + resume/in-progress 추론 폴백. 순수 함수(model-only).
- **테스트** — host-version(폴백 사다리 각 단 + meta↔CHANGELOG disagreement + spawn-free 계약) + next-action(full command/필수-인자/폴백/마커 정리) + dashboard-overview(named-widget 이름 노출·top-N·접힘 + version snapshot + next-action + STATUS.md 동등본) + schema-drift host_version 가드.

### Changed

- **`scripts/derive/{index,model}.js`** — `model.host_version` additive top-level 필드 wire(derive 조립 + emptyModel + validateShape present-only). MODEL_VERSION 'v1' 불변.
- **`scripts/lib/renderer/sections/status-grid.js`** — dashboard 데이터 조립 일원화: count cell에 named `items` + `version`(host_version snapshot 소비) + `nextAction`(STATE.md) 산출. `md`/`html`/`cells` 키 불변(기존 소비자 호환).
- **`scripts/lib/renderer/html.js`** — '개요'→'대시보드' 재명명(route 식별자 불변) + `renderHeroPanel`을 host-version 줄 + named-widget(top-3 + 접힘) + STATE.md next-action 복사로 재구성(axis-legend 대체) + hero-widget CSS(신규 색 토큰 0). footer v1.18.4. copy-btn label fix — '복사'를 `.cb-label` span으로 감싸 copied 시 `::after`가 append('복사 복사됨') 아닌 replace('복사됨')하도록 수정(drawer 동적 버튼 포함).
- **`scripts/lib/renderer/markdown.js`** — `## 현황`→`## 대시보드`(anchor 포함) + grid.md가 version·named-widget·next-action plain-text 동등 노출. footer v1.18.4.
- **`docs/v1.3.0-observability/{dashboard-surface,schema-surface}.md`** — 대시보드 재구성 surface(§2.1) + `model.host_version` additive 스키마(§12) 문서화.

## [1.18.3] — 2026-06-24

dashboard-truthfulness M1 — 완료 이력 영속화 레지스터 (**foundation — 데이터 레이어 primitive**). `/mccp:pr` 게이트 수렴(pr-codex receipt write) 직후, **git-tracked로 의도된** one-file-per-entry 디렉토리(`.claude/state/completion-ledger/<id>.json`)에 완료 요약 1건을 append하는 epilogue + derive `ledger` source + `milestone-history.js`의 durable fallback(live receipt → ledger → git time → "날짜 미상")을 깔아둔다. receipt는 gitignore + worktree-local이라 merge + `git worktree remove` 후 사라지지만(post-merge amnesia), 레지스터 디렉토리는 git-tracked라 **commit된 엔트리는 worktree 제거 후에도 살아남고** milestone-history가 이를 durable history로 읽는다. **알려진 한계(M1 범위 밖, 후속 milestone)**: 엔트리 write는 `/mccp:prp-commit` **이후**의 `/mccp:pr` epilogue에서 일어나므로 worktree에 *미커밋* 상태로 남는다 — 엔트리를 같은 PR 흐름 안에서 git에 commit하는 **commit-wiring이 아직 없어**, 단일-milestone-ship 후 즉시 cleanup하는 §3.8 표준 흐름에서는 엔트리가 아직 영속화되지 않는다. 본 M1은 write/read/schema primitive까지를 닫고, end-to-end post-merge 생존(commit-wiring)은 후속 axis로 분리한다. **데이터 레이어 전용** — UI/렌더 마크업 무변경(렌더러는 레지스터를 읽기만). Codex Plan-Codex R1 3 findings absorbed: F1(dirty/detached 시 clean-tree gate로 안전 skip + `meta.ledger_write_skipped` 진단 stamp — 재현 불가 commit_sha 방지), F2(단일 배열 대신 one-file-per-entry → distinct 파일명으로 cross-worktree merge 충돌 0, session-ledger 패턴 완전 미러), F3(레지스터 항목 존재가 authoritative 완료 신호 — receipt meta는 diagnostic-only, 소비자는 meta flag가 아닌 항목을 읽음). `receipt_hash` carve-out 계승(briefing 선례) — ledger stamp가 tamper-detect digest 무력화 안 함. plugin.json `1.18.2 → 1.18.3` patch bump + 양 footer 동기화.

### Added

- **`scripts/lib/completion-ledger/store.js`** — one-file-per-entry 저장소(lock+atomic+strict validate, F2) + `isLedgerAppendSafe` clean-tree git-safety gate(F1, allowlist: completion-ledger/STATE.md/cache/receipts).
- **`scripts/lib/completion-ledger/index.js`** — `triggerLedgerAppend` facade(gate-gating + verdict/version 해석 + diagnostic skip stamp, briefing facade 미러, loud fail-open).
- **`scripts/derive/sources/ledger.js`** — `scanLedger` count-source(read-only surface) + `derive/index.js`·`model.js` 등록(additive, MODEL_VERSION v1 불변).
- **receipt schema** `meta.ledger_write_skipped`(present-only boolean, F3 diagnostic) + `hash.js` carve-out.
- **`scripts/lib/renderer/parsers/plan-body.js`** `extractRisksAndOpenQuestions` — ship-time Risks/OQ 스냅샷(M3 은퇴 매칭 입력).
- **테스트** — completion-ledger store(19)/facade + derive ledger-source + hash-ledger-exclusion carve-out + milestone-history headline 회귀(merge+worktree 제거 시뮬) + plan-body 스냅샷 + schema-drift ledger 가드.

### Changed

- **`scripts/receipt/write.js`** — epilogue에 ledger append 와이어(briefing 다음, render-trigger 이전; lazy-require + outer try `(allow)`).
- **`scripts/lib/renderer/sections/milestone-history.js`** — `pickLedgerEntry` durable fallback(live receipt → ledger → git time → 날짜 미상).
- **`docs/v1.3.0-observability/schema-surface.md`** — §11 completion ledger source + `meta.ledger_write_skipped` present-only 행.

## [1.17.0] — 2026-06-23

dashboard 콘솔 셸 + self-contained 타이포 (M3 후속) — [1.16.0]의 다크 콘솔 위에 **좌측 사이드바 앱 셸**을 얹어 멀티페이지 콘솔을 완성한다. **사이드바**(244px sticky): 프로젝트 스위처 + 검색 affordance(현재 `aria-hidden` 시각 placeholder) + 아이콘 page nav(`.nav-link` active = 배경·굵기·아이콘 복합 신호) + 차단 `.pin-alert`. **topbar**(52px sticky): 브레드크럼 + 중앙 page-title(`:has()` 토글) + freshness dot, stale 시 하단 hairline 앰버 전환. nav 레일·상단 status-strip은 폐기하고 status 4축은 개요 hero 인라인 메타로만 유지. **타이포**: vendored `PretendardVariable.woff2`(2.0MB, OFL-1.1)를 base64-inline `@font-face`로 self-contained 임베드 — 외부 fetch 0(`data:` URI는 네트워크 surface 아님 → H13 외부-fetch invariant 통과), woff2 누락 시 system 스택 graceful degrade. **DESIGN.md**: `/impeccable document`로 frontmatter(토큰) + 디자인 시스템 서술 포맷 재작성, `html.js` OKLCH_DARK/LIGHT 토큰과 1:1 정합. **H13 재정의**(docs/v1.3.0-observability/DESIGN.md): font-family banlist → 외부-fetch invariant(로컬 family-name 참조 + vendored data: URI 임베드 허용). lint carve-out(H3 셸 클래스 superset)·H2 content-max(≤1080px) 셸 디자인 정합. 데이터 소스·derive·receipt 스키마 불변(read-side 시각 레이어만). plugin.json `1.16.0 → 1.17.0` minor bump.

## [1.16.0] — 2026-06-23

dashboard 레이아웃 재설계 (M3) — `status.html`을 디자인 스킬 없이 만들어진 평면적 단일컬럼에서 **다크 파이프라인 콘솔**로 재설계한다(impeccable shape→craft 워크플로, 사용자가 미학 방향 신규 탐색 + H-invariant 자유 수정에 confirm). **레이아웃**: 좌측 섹션 nav 레일(작동 plain anchor) + 우측 목적 있는 비중첩 카드 2D(Vercel 대시보드 베이스 — card-in-card 금지가 깔끔함의 규율). **theme**: 다크 default(차분 dev 다크, low-chroma), light는 `prefers-color-scheme: light` opt-in. **정보 위계 3단계**: verdict 배너(primary) → header status 4축 ribbon(status) → 카드(detail), heading ≤3. **반응형**: 구조적 collapse — ≤720px에서 nav 레일이 가로 스크롤 인덱스로, 카드 단일 컬럼 stack, 가로 테이블 `overflow-x:auto`(product.md: 구조 변경이지 fluid 타이포 아님). 컴포넌트 클래스(`.pipe-*`/`.tl-*`/`.oq-item`/`.severity-tag`/`.s-*`/`.milestone-*`)는 섹션 모듈 contract라 보존 — 변경은 토큰·컨테이너·카드·반응형으로 한정. 데이터 소스·derive·receipt 스키마 불변(read-side 시각 레이어만). PRODUCT.md anti-refs 준수(hero-metric/AI-cream/Bloomberg 형광 다크 회피). **H-invariant 개정**: H1(light→다크 default + light opt-in), H2(720px 단일컬럼 → `--content-max` ≤820 콘텐츠 폭), H3(무카드 → 목적 있는 카드 carve-out), 신규 **H17(카드 중첩 금지 — DOM-aware stack scan, 임의 block 태그 `card` token nesting 검출)**. H4/H6/H7(side-stripe·hero-metric·glassmorphism 금지) 유지. Codex Plan-Codex needs-attention 3 finding R1 absorbed: F1(테스트 일괄 갱신이 회귀 마스킹 → Task 7 2-bucket 분리: behavior 동결 + design 변경허용), F2(H17이 `<section class="card">`만 잡아 좁음 → DOM/CSS-aware 확장), F3(M3가 inert M4 affordance 노출 → nav는 작동 anchor만, drawer/active/터미널-prompt 동작은 M4). M4(우측 Drawer 상세 + nav active-추적 + Tailwind `설명|터미널` prompt)는 본 콘솔 셸 위에 후속. renderer 323(+11: 반응형 6, H17 5) + derive 68 = 391 test PASS, 0 regression. plugin.json `1.15.0 → 1.16.0` minor bump.
stage-aware impeccable command routing (M3) — 두 축으로 PRD를 닫음. **Axis A (System 명령 wiring)**: impeccable System 군의 `document`(DESIGN.md 생성)·`extract`(재사용 토큰/컴포넌트 추출)를 routing 카탈로그에 `system` stage + recommend-only base로 추가 — 모든 게이트·모드에서 recommend(heavyweight 생성 명령은 deliberate operator step). `craft`/`live`/`init`/`detect`/`hooks`는 out-of-scope 유지. **Axis B (a11y-architect auto-invoke)**: PR 게이트의 a11y 처리를 "count만 세고 버리는" routing-only에서 실제 `mccp:a11y-architect` Task() auto-invoke로 전환. 트리거는 PR diff의 rendered design surface 존재(`rendering_surface`)이며 Codex finding 유무가 아님 — a11y-architect가 diff를 직접 WCAG 2.2 관점에서 review하고 결과는 PR body `## Accessibility Review` 섹션에 inject. review-only 불변식은 **a11y 전용 pr-phase lock window** + mutations finalizer로 mechanical 보증(편집 시 hard-stop). kill switch `MCCP_A11Y_AUTO_INVOKE=0`. Codex Plan-Codex R1 3 findings absorbed: F1(a11y 트리거가 design-scope preamble로 starve → finding 기반에서 `rendering_surface` 기반으로 전환), F2(codex-runner가 이미 lock exit하므로 전용 a11y-review lock window 신규 획득), F3(`finalize-receipt.js#deriveCodexFlags`에 `--a11y-auto-invoked` forward + `write_flags_used` 노출). plugin.json `1.13.0 → 1.16.0` — main(1.15.0, PR #53)과 forward-only reconcile per CLAUDE.md §3.7.

### Added

- **`scripts/lib/impeccable-routing.js`** — `SYSTEM_COMMANDS = Object.freeze(['document', 'extract'])` + `STAGE_ROUTING.implement`·`.pr`·`PLAN_GUIDE`에 system stage recommend-only entry + export.
- **receipt schema** `meta.a11y_auto_invoked`(present-only boolean) — a11y-architect가 PR 게이트에서 실제 auto-invoke됐는지 audit.
- **테스트** — impeccable-routing(System 명령 게이트×모드 recommend + SYSTEM_COMMANDS frozen), codex-result-filter(a11yFindings 배열 동치/identity/empty/EMPTY_RESULT), impeccable-routing-fields(a11y_auto_invoked round-trip/present-only/non-boolean reject/legacy), finalize-receipt(--a11y-auto-invoked forward).

### Changed

- **`scripts/lib/codex-result-filter.js`** — `filterDesignFindings` 반환에 `a11yFindings` 배열(보조 입력) 추가, `a11yRoutedCount === a11yFindings.length` 동치 보증. 4개 반환 경로 + `EMPTY_RESULT` 동기화.
- **`scripts/lib/pr-phase-helpers/codex-runner.js`** — emit에 `a11y_findings`(보조 입력) + `rendering_surface`(PR diff UI ext 존재, 모든 codexOutcome에서 계산) surface. `computeRenderingSurface(base, cwd)` 헬퍼(UI/cache regex).
- **`scripts/lib/pr-phase-helpers/finalize-receipt.js`** — `deriveCodexFlags`가 `a11y_auto_invoked===true` 시 `--a11y-auto-invoked` forward.
- **`scripts/receipt/schema.js` · `write.js`** — `a11y_auto_invoked` present-only validator + skeleton default(false) + `--a11y-auto-invoked` arg 배선.
- **`commands/pr.md`** — Phase 2.5.6c(a11y-architect review-only auto-invoke, 전용 lock window, mutations hard-stop) + Phase 4 `## Accessibility Review` inject.
- **`commands/prp-implement.md`** — routing 표에 System stage(document/extract recommend) note + a11y는 PR 게이트 전용 명시.

### M1 + M2 (bundled in PR #55 — originally tagged 1.13.0 on-branch; reconciled to 1.16.0 at merge since main independently shipped 1.13.0/1.14.0/1.15.0)

stage-aware impeccable command routing (M1) — 디자인 게이트가 impeccable의 `critique` 단일 호출에 갇혀 있던 것을, 디자인 라이프사이클 단계(discovery→refine→evaluate→harden→polish)에 impeccable 명령을 매핑하는 순수 routing oracle로 확장. 핵심 6개 명령(shape/layout/typeset/audit/harden/polish + 기존 critique) + 모드 토글(auto/hybrid/recommend, default auto) + receipt audit 2필드. 게이트 배치: plan/plan-prd는 `## Design Routing Guide` recommend-only 기록, prp-implement은 실제 stage-aware 라우팅(shape background-best-effort + layout/typeset refine + audit evaluate), pr은 polish/audit/harden recommend-only(review-only invariant). `craft`(기능 chain)·`live`(실시간 브라우저)는 비대화형 게이트와 부적합으로 제외. Codex Plan-Codex R1 4 findings absorbed: F1(`designIntentActive` 입력으로 audited MCCP_DESIGN_INTENT_REASON escape hatch 보존), F2(critique은 routing 일반 명령으로 흡수하지 않고 기존 `decideCritique` retry loop + `design_critique_verdict` divergent blocking 유지), F3(`impeccable_commands_routed`를 structured `{command, call_form, status}` outcome 배열로 — 실패/unknown-skill을 정직히 기록, loud fail-open), F4(`renderingSurface` selector로 control-plane-only signal의 refine/discovery fan-out 차단; auto 기본값은 사용자 product 결정으로 유지, cost-tier auto-downgrade+SLO는 M2 defer). plugin.json `1.12.0 → 1.13.0` minor bump per CLAUDE.md §3.7.

### Added

- **`scripts/lib/impeccable-routing.js`** — stage-aware routing oracle. 순수·무의존. `STAGE_ROUTING` gate→command 테이블 + `parseRoutingMode(env)` + `routeCommands({gate, mode, designSignal, designIntentActive, renderingSurface})`. 모드 변환은 downgrade-only(recommend base는 invoke로 승격 안 됨 → pr gate review-only 보존). F1/F4 absorption 입력 포함.
- **`scripts/lib/tests/impeccable-routing.test.js`** — 12 test (모드 변환, 게이트별 매핑, F1 designIntentActive trigger, F4 renderingSurface degrade, pr review-only, plan guide-only).
- **`scripts/receipt/tests/impeccable-routing-fields.test.js`** — 5 test (mode+structured 배열 라운드트립, present-only legacy, invalid mode/enum/malformed reject).

### Changed

- **`scripts/receipt/schema.js`** — `impeccable_routing_mode`(enum auto|hybrid|recommend|null) + `impeccable_commands_routed`(structured `{command, call_form, status}` 배열|null) present-only 검증 + 기본값 2필드. legacy receipt 무변경 통과.
- **`scripts/receipt/write.js`** — `--impeccable-routing-mode` + `--impeccable-commands-routed-file`(JSON 배열 채널, mirror findings-file) arg→meta 매핑.
- **`scripts/receipt/cli.js`** — write usage 줄에 신규 2 플래그 표기.
- **`commands/prp-implement.md`** — design gate에 stage-aware routing 단계(critique loop 앞단, critique 제외) + receipt forward.
- **`commands/plan.md` · `commands/plan-prd.md`** — `## Design Routing Guide` recommend-only 기록(plan은 `--impeccable-routing-mode` forward).
- **`commands/pr.md`** — Phase 1.6에 polish/audit/harden recommend-only stderr 줄(invoke 없음).

### M2 — Extended Refine/Simplify 카탈로그 + content 선별 휴리스틱

M1의 routing oracle에 Extended 카탈로그 10개(animate/colorize/bolder/quieter/overdrive/delight refine · adapt/distill/clarify simplify · optimize/onboard harden)를 추가하고, auto 모드 fan-out 비용을 **content 기반 positive-presence 선별**로 제어. content-detectable 명령(animate←motion, colorize←color, typeset←typography, adapt←responsive)은 `extractDiffSignals`가 diff에서 해당 signal을 positive로 잡았을 때만 auto invoke; 못 잡으면 recommend 강등. mood/direction 명령(bolder/quieter/overdrive/delight)은 diff 감지 불가 → recommend-only base, 4중 AND audited intent(`MCCP_IMPECCABLE_INTENT_COMMANDS`)에서만 invoke 승격. Codex 2-round(Plan F1/F2/F3 + Implement [0]/[1]) absorbed: Plan-F1(signal 추출이 untracked 새 UI 파일 포함 + zero-signal fail-open omission, all-false forward 금지), Plan-F2(정규식이 Tailwind utility/CSS-in-JS camelCase 커버), Plan-F3(mood intent 승격 경로), Implement-[0](detector/renderingSurface/extractDiffSignals 일관 tracked+untracked 파일셋 + greenfield trigger gap 문서화), Implement-[1](routeCommands 반환 schema 안정화 — 내부 `signal` 메타데이터 strip). Receipt schema 무변경(`command` open string). plugin.json bump은 PR merge 시 main(1.15.0)과 forward-only reconcile.

- **`scripts/lib/impeccable-routing.js`** — `STAGE_ROUTING` 확장(implement 14 / pr 5 / plan·prd guide 18) + `MOOD_COMMANDS`/`SIGNAL_KINDS` + `extractDiffSignals(text)`(pure regex classifier) + `selectByDiffSignals(commands, diffSignals)`(positive-presence narrow) + `parseIntentCommands(env)` + `routeCommands`에 `diffSignals`/`intentCommands` 입력 + 반환 schema 안정화.
- **`scripts/lib/tests/impeccable-routing.test.js`** — 13 신규 case(content 선별, mood recommend-only + 4중 AND 승격/비-승격, simplify 단계, backward-compat fail-open, extractDiffSignals CSS/Tailwind/CSS-in-JS fixtures, schema 안정성). 총 25 test PASS.
- **`commands/prp-implement.md`** — routing 블록을 tracked+untracked rendered-surface 단일 셋 기반으로 재작성(RENDERING_SURFACE + extractDiffSignals 일관 도출 + zero-signal fail-open omission) + intentCommands forward + greenfield trigger gap 문서화.
- **`commands/plan.md`** — `## Design Routing Guide` 예시 표에 simplify 단계 + 확장 refine/harden 행 추가(실제 rows는 routeCommands 동적 생성).

## [1.15.0] — 2026-06-23

dashboard 마일스톤 기록 정확성 + 용어 통일 (M2 잔여) — "마일스톤 기록" 섹션의 두 결함을 닫는다. **용어**: 섹션 제목·앵커를 "이정표"→"마일스톤"으로 통일(markdown.js 앵커+heading, html.js h2 — id `milestone-history`는 영어라 불변). **정확성**: 완료 마일스톤 10건이 전부 "날짜 미상"으로 표시되던 근본 원인 4개를 수정 — (A) `derive/sources/plans.js`의 Source PRD 추출이 마크다운-링크만 매칭해 평문/백틱 경로 PRD discovery 누락(`SOURCE_PRD_PLAIN_RE` + `extractSourcePrd`), (B) `parseDeliveryMilestonesComplete`가 Plan 셀 첫 괄호 `(report: …)`를 잡아 plan 대신 report basename 추출(`extractPlanPath` — `.plan.md` 우선), (C) receipt가 working-tree 전용(gitignored)이라 과거 사이클 ship receipt 부재 → `pickShipReceipt` null → completedAt=null(git commit 시점 fallback `resolveGitCommitTime`). 결과: 마일스톤 섹션 날짜 미상 10→0, dashboard 자기 M1 표시 복원. Codex Plan-Codex R1 2 HIGH absorbed: F1(평문 source_prd가 렌더러 plan-dir 기준 resolve로 이중 경로 → `resolvePrdRef` dual-path 해석 + wrapper strip), F2(git fallback basename 재구성이 `.claude/PRPs/plans/completed/` archived plan 미발견 → directory-preserving planPath + completed/ archive basename 최종 후보). Implement-Codex cross-gate dedupe. 모두 read-side 렌더링·상관 로직 — receipt/derive 스키마 불변. renderer 312 + derive 68 = 380 test PASS. plugin.json `1.14.0 → 1.15.0` minor bump per CLAUDE.md §3.7. PRD M3~M6(레이아웃·길찾기·필터·스타일)는 impeccable shape→craft→audit 워크플로로 진행 예정(PRD Design Direction 명문화).

## [1.14.0] — 2026-06-22

dashboard 활동 로그 step-chart (M2) — 진행 현황 대시보드(`status.html`)의 audit-timeline 섹션을 평범한 `<ul>` 텍스트 로그에서 **시간순 세로 step-chart rail**로 변환. 각 receipt가 세로 connector 위 상태 노드 마커(✓ 수렴 / ◐ 진행)로 표시돼 활동 흐름을 형태·색으로 즉시 스캔할 수 있다(GitHub Actions job-run timeline 미학). **데이터 로직(snapshot read, MAX_ROWS caps, 정렬, footnote, briefing, md 출력)은 일절 변경 없이 시각 레이어만 재구성** — 회귀 위험 최소화. 세로 connector는 `.tl-rail::before` background 라인(`border-left` 미사용 → H4 회피), 노드 마커 `.tl-node`만 원형 pill(H3 carve-out 추가). design critique 1 finding absorbed: emphasis 반전 — 20행 timeline에서 converged(흔한 상태)는 quiet(`.tl-done` muted), pending(예외/개입 후보)만 loud(`.s-stale`), accent는 노드에 미사용 → viewport당 accent ≤ 1 보존(M1 pipeline의 converged=accent와 의도적 divergence, cardinality 차이). Codex Plan-Codex R1 1 HIGH + 1 MEDIUM absorbed: F1(STATE.md `chain_aborted`/`session_end_imminent` true 잔재가 in-progress chain short-circuit → state-writer reconcile), F2(`<span class="tl-body">`가 flow content `<blockquote>` wrap = non-conforming HTML → `<div>` 전환 + containment 구조 검증 test). Implement-Codex cross-gate dedupe. plugin.json `1.13.0 → 1.14.0` minor bump per CLAUDE.md §3.7. (M3 GitHub Actions 전체 비주얼 리프레시는 후속 cycle.)

### Added

- **`scripts/lib/renderer/tests/timeline-chart.test.js`** — 8 test (rail wrapper / converged-quiet·pending-loud 노드 매핑 / briefing blockquote containment(Codex F2) / md 동치 / escape / footnote tl-note 비-step).

### Changed

- **`scripts/lib/renderer/sections/audit-timeline.js`** — `renderRow` HTML을 step-chart 구조(`<li class="tl-step">` + `.tl-node` 마커 + `<div class="tl-body">`)로 재구성, wrapper `<ol class="timeline tl-rail">`, footnote li → `.tl-note`. 2-상태 노드 map(NODE_TL). 데이터 로직·md 출력 불변.
- **`scripts/lib/renderer/html.js`** — `.tl-rail`/`.tl-step`/`.tl-node`/`.tl-body`/`.tl-note` CSS(세로 connector `::before` background 라인, 노드 pill, emphasis 반전 색). `PIPELINE_SCRIPT`에 `.tl-step` hover/focus enhancement 추가(vendored jQuery 재사용, 외부 src 0).
- **`scripts/lib/renderer/output-constraints.js`** — `H3_CARVEOUT`에 `tl-node` 추가(노드 마커 한정 carve-out). H4는 background 라인이라 carve-out 불필요.
- **`docs/v1.3.0-observability/DESIGN.md`** — H3 carve-out 행에 `tl-node` + v1.14.0 활동 step-chart design intent 절(세로 rail / emphasis 반전 / 항목 수 상한 근거).
- **`scripts/lib/renderer/tests/{output-constraints,render-integration,audit-timeline-snapshot}.test.js`** — tl-node carve-out narrow 검증 + timeline rail 합성 HTML 포함 + footnote class 회귀 갱신.

## [1.13.0] — 2026-06-22

dashboard 게이트 파이프라인 chart (M1) — 진행 현황 대시보드(`status.html`)에 receipt를 `decision_id`별로 묶어 게이트 진행(plan-codex → implement-codex → pr-codex)을 보여주는 가로 파이프라인 스테퍼 신규 섹션 추가. 기존엔 게이트 스테이지 수렴 상태가 audit-timeline 텍스트 로그에만 흩어져 있어 "이 decision이 지금 어느 단계인가"를 한눈에 못 봤다. 신규 `pipeline.js`가 verdict 다음에 decision별 노드 흐름(✓ 수렴 / ◐ 진행 / ○ 대기)을 렌더한다. 미학 리드는 GitHub Actions 절제(중립 base + 상태색, 신규 강조색 0, 기존 OKLCH 토큰 재사용). baseline은 inline SVG/CSS(JS 없이도 상태 표시) — 외부 script URL 0(self-contained 유지). Codex Plan-Codex R1 2 HIGH + 1 MEDIUM absorbed: F1(canonical 정규화 — `gate_id`∥`gate`, `mccp-*` 만 매핑, `(decision,gate)`별 최신 receipt로 retry false→true 수렴 반영), F2(CDN third-party JS trust-boundary 침범 → vendored-inline 전환으로 raw 데이터 exfiltration 차단), F3(status-aware collapse — 미수렴 decision은 절대 collapse 안 함, `attention→active→complete` 정렬, top-3 + 상태별 카운트). design critique 2 rounds converged. Implement-Codex cross-gate dedupe. plugin.json `1.12.0 → 1.13.0` minor bump per CLAUDE.md §3.7. (M2 활동 로그 step chart / M3 GitHub Actions 전체 리프레시는 후속 cycle.)

### Added

- **`scripts/lib/renderer/sections/pipeline.js`** — 게이트 스테이지 파이프라인 섹션. canonical gate 정규화 + `(decision,gate)`별 최신 선택 + status-aware collapse + 색+아이콘+sr-only 병행(a11y) + 전체 escape. baseline 마크업(JS 무관).
- **`scripts/lib/renderer/tests/pipeline.test.js`** — 10 test (정규화/retry 수렴/collapse/escape/a11y 등).

### Changed

- **`scripts/lib/renderer/html.js`** — `<section id="pipeline">` 조립 + `.pipe-*` CSS(pipe-node pill / pipe-edge 수평 라인, border-left 미사용).
- **`scripts/lib/renderer/index.js`** — `renderPipeline` safeSection wire (grid 다음).
- **`scripts/lib/renderer/markdown.js`** — `## 게이트 파이프라인` 섹션 + anchor (텍스트 표현).
- **`scripts/lib/renderer/output-constraints.js`** — H3 carve-out에 `pipe-node` 추가.
- **`scripts/lib/renderer/tests/four-part-rendering.test.js`** — sections positional fixture 8요소로 갱신.
- **`PRODUCT.md`** / **`DESIGN.md`** — `/impeccable init` 셋업(PRODUCT.md 원칙 6 + 루트 DESIGN.md 신규).
- **`commands/pr.md`** — worktree-safe tmp dir 수정. `/mccp:pr` Phase 2.5.3가 `codex-result.json`/stderr를 literal `.git/mccp/tmp`에 쓰던 탓에 worktree에서 `.git`이 gitdir 포인터 *파일*일 때 `mkdir: Not a directory`로 깨지던 결함 차단 — `MCCP_TMP="$(git rev-parse --git-dir)/mccp/tmp"`로 진짜 gitdir resolve (누적 8+ cycle 반복 결함). 설명 prose의 `.git/mccp/tmp/` 참조도 `<gitdir>/mccp/tmp/`로 정정.
## [1.12.1] — 2026-06-22

detector probeAvailability 재설계 — 세 built-in 기능 detector(`deep-research-detect.js`/`ultracode-detect.js`/`goal-detect.js`)의 `probeAvailability()`가 `~/.claude/commands/*.md`·`~/.claude/skills/*/` filesystem을 probe하던 구조적 오류를 제거했다. built-in slash command는 user-level command/skill 파일을 남기지 않으므로 이 probe는 기능 활성 여부를 영원히 관측할 수 없었다. 공식 문서로 확정한 실제 활성화 신호로 교체: deep-research/ultracode는 동적 워크플로우 신호(`disableWorkflows`/`enableWorkflows`/env `CLAUDE_CODE_DISABLE_WORKFLOWS`)를 공유하고, goal은 별개 축인 hooks 신호(`disableAllHooks`/`allowManagedHooksOnly`)로 판정한다. 신규 공용 헬퍼 `settings-signal.js`가 managed+user+project 3-level 머지(우선순위 project > user > managed)를 수행한다. Codex Plan-Codex R1 absorbed: F1 HIGH(enterprise managed 정책 fail-open → managed 경로 OS별 읽기 추가 + managed present-but-unreadable 시 `unknown` 강등), F3 MEDIUM(goal/workflows 비대칭 근거 → 각 기능의 공식 활성화 모델 차이 본문화), F2 MEDIUM(런타임 게이트 버전/trust 체크 → backlog DEFER). Implement-Codex cross-gate dedupe. plugin.json `1.12.0 → 1.12.1` patch bump per CLAUDE.md §3.7.

### Added

- **`scripts/lib/settings-signal.js`** — 3-level settings 머지 공용 헬퍼. `readMergedSettings`(managed+user+project, fail-loud parse via settings-writer) + `workflowsEnabled(opts)` tristate + `hooksGoalEnabled(opts)` tristate(F1+F3 absorption — managed 포함, 미확인 시 unknown) + `MANAGED_SETTINGS_PATHS` OS 상수.
- **`scripts/lib/tests/settings-signal.test.js`** — 17 test (머지 우선순위 4 + workflows tristate 6 + hooks tristate 6 + OS path 1).

### Changed

- **`scripts/lib/deep-research-detect.js`** / **`ultracode-detect.js`** — `probeAvailability`가 filesystem probe 대신 `settings-signal.workflowsEnabled()` 위임. env override(`MCCP_DEEP_RESEARCH_SKILL`/`MCCP_ULTRACODE_FEATURE`) 최우선 유지. 옵션 시그니처 `{projectRoot,userPath,projectPath,managedPath}` 주입 가능.
- **`scripts/lib/goal-detect.js`** — `probeAvailability`가 `settings-signal.hooksGoalEnabled()` 위임. goal은 default-on이라 hook-disable 신호 부재 = 활성. env override(`MCCP_GOAL_FEATURE`) 최우선 유지.
- **3 detect 테스트 파일** — filesystem probe 케이스(S1d/S8c/S8d/S9 등)를 settings 신호 케이스로 교체.

## [1.12.0] — 2026-06-22

dashboard serve + refresh commands — `.claude/cache/status.html` 대시보드를 localhost로 띄우는 `/mccp:dashboard`와 캐시를 다시 굽는 `/mccp:dashboard-refresh` 추가. 기존엔 `derive/cli.js render` 수동 실행 + 파일 직접 열기 + 자주 stale한 캐시라는 3단 마찰이 있었다. `/mccp:dashboard`는 띄우기 직전 자동 render → dep-free Node `http` 서버를 `127.0.0.1`에 bind → 브라우저 자동 오픈 → `.claude/cache/` watch로 status 변경 시 SSE live-reload. 캐시 `status.html`은 byte-pristine 유지(reload `<script>`는 서빙 시점 on-the-fly 주입). Codex Plan-Codex R1 2 findings absorbed: F1(PID 파일을 repo/cache scope — `{pid,host,port,started_at,repoRoot,statusPath}` 기록 + same-host·live-PID·repoRoot·statusPath 4중 일치 시만 재사용 → worktree 간 stale PID로 다른 checkout 서버 URL 반환 차단), F2(포트 +1 silent fall-forward 제거 → 우리 서버면 identity probe로 재사용, foreign이면 loud 충돌 + `--port` 요구 → bookmark 안정성 보존). Implement-Codex cross-gate dedupe. plugin.json `1.11.0 → 1.12.0` minor bump per CLAUDE.md §3.7.

### Added

- **`scripts/lib/dashboard-server.js`** — dep-free localhost 대시보드 서버. 고정 라우트(`/` reload 주입 + `/__mccp_reload` SSE + `/__mccp_identity` JSON, 그 외 404 — `req.url`→파일 매핑 없어 path-traversal surface 0). `startServer`/`createServer`/`injectReloadScript`/`isReusablePid` 등 export. fs.watch + watchFile 폴백 live-reload, 브라우저 오픈/watch는 loud fail-open.
- **`commands/dashboard.md`** — `/mccp:dashboard` (render → background 서버 → URL/PID/stop 보고).
- **`commands/dashboard-refresh.md`** — `/mccp:dashboard-refresh` (`derive/cli.js render` wrap, 서버 무관).
- **`scripts/lib/tests/dashboard-server.test.js`** — 13 test (reload 주입, 라우트, identity JSON, SSE, 404, missing-status 안내, PID roundtrip + repo scope, isReusablePid 3중 AND, 127.0.0.1 bind, our-server 재사용).

## [1.11.0] — 2026-06-22

v1.4.2 dashboard overhaul — Milestone 3 ship (a11y WCAG 2.2 AA + 잔여 OQ 명문화). PRD §M3 두 축을 단일 PR로 정리. (a) semantic landmark + skip-link (clip-based sr-only / focus-visible explicit) + footer role=contentinfo + main id=tabindex=-1 + status-strip 1 tab stop(group label dynamic 4축 aria-label, cell non-focusable + icon aria-hidden) + severity-tag aria-label "위험도: 한글" + copy-btn aria-label "다음 액션 복사" + WCAG AA contrast lint(OKLCH → sRGB → luminance dep-0 oracle) + severity color-only 금지 lint, (b) PRD §Open Questions OQ-a~g 7건을 M1/M2 채택 default로 본문화. Codex Plan-Codex R1 4 findings(F4 status-cell unreachable / F5 severity drift / F6 contrast oracle / F7 skip-link clip-based) + impeccable critique F1/F2/F3 모두 plan body absorbed → Implement-Codex cross-gate dedupe. plugin.json `1.10.0 → 1.11.0` minor bump per CLAUDE.md §3.7 (M3 milestone ship → minor).

### Added

- **`parsers/severity-meta.js`** — single source severity 메타데이터. 5 enum × 4 필드 (`visible` English / `srLabel` 한글 / `icon` emoji / `className` s-prefix) + `severityMeta(sev)` lookup + `severityTagHtml(sev, escapeHtml)` 통일 render helper. mixed-language drift 차단(F5 absorption).
- **`parsers/oklch-contrast.js`** — W3C CSS Color Module Level 4 §16.4 정합 dep-0 변환기. `oklchToOklab` → `oklabToLinearSrgb` → `linearSrgbTosRgb` → `sRGBtoLuminance` → `contrastRatio` 5-stage pipeline. `contrastRatioOKLCH(fg, bg)` convenience export. independent oracle로 false-pass 차단(F6 absorption).
- **`tests/oklch-conformance.test.js`** — 11 test. 변환 단계별 ε ≤ 0.005 tolerance + gamma boundary + 21:1 black/white reference + bg-light/bg-dark luminance bounds.
- **`tests/a11y-contrast.test.js`** — 8 production case strict `>=` (ε 없음). light + dark × {ink ≥ 7, muted ≥ 4.5, accent ≥ 3 large, blocked ≥ 4.5}. token L 조정 권장 fail message.
- **`tests/a11y-landmarks.test.js`** — 9 test. main/footer landmark + skip-link sr-only/focus-visible + clip-based pattern + offscreen -9999px 폐기 invariant + h1 단일 + raw alert role.
- **`tests/a11y-aria-labels.test.js`** — 9 test. severity-meta 5 enum 4 필드 + 한글 fallback("미상") + severityTagHtml 통합 invariant(aria-label 한글 + visible 영어 + icon hidden) + status-strip group tabindex/aria-label/현황 4축 prefix + 심각도 legacy mixed-language 0건.
- **`tests/a11y-severity-non-color.test.js`** — 5 test. severity-tag 추출(중첩 span 인식) + 4 sev × 2 surface(OQ/Risks) 모두 icon AND text 동시 보유 invariant.
- **html.js CSS** — `.sr-only` (clip-path inset 50%) + `.skip-link:focus-visible` (fixed top/left, accent bg, z-index 11) + `details summary:focus-visible` + `.status-strip:focus-visible` + severity-tag `font-weight: 600` (색 약시 보조) + `main:focus { outline: none }`.
- **html.js markup** — `<a class="skip-link sr-only" href="#main">본문 바로가기</a>` after `<body>` + `<main id="main" tabindex="-1">` + `<footer role="contentinfo">` + `<code lang="en">.claude/</code>` + status-strip `tabindex="0"` + dynamic aria-label `현황 4축: <label1> <value1> · <label2> <value2> · …` + cell `<span class="icon" aria-hidden="true">`.

### Changed

- **`sections/open-questions.js`** — `severityTagHtml` import (severity-tag 본문 단축). copy-btn에 `aria-label="다음 액션 복사"` 추가(한글 전용 고정).
- **`sections/risks.js`** — 동일 — `severityTagHtml` + copy-btn `aria-label="다음 액션 복사"`. SEVERITY_ICON local map 제거.
- **`sections/milestone-history.js`** — `<time datetime="<ISO>">` semantic 시간 wrap (날짜 미상은 fallback).
- **html.js LAYOUT** — `header .status-strip .cell:focus-visible` 룰 제거(cell non-focusable). `header .status-strip:focus-visible` 신규 룰로 교체.
- **`.claude/prds/v1-4-2-dashboard-overhaul.prd.md`** §Open Questions OQ-a~g 7건에 "**결정 (v1.4.2-M3)**: …" sub-bullet append (M1/M2 채택 default 본문화). §Risks "design direction anchor 4 위반" 행 mitigation column에 M3 lint 4종 mechanize 추가. §Design Direction Acceptance criteria 5 a11y 항목 `[x]` 체크. M3 row in-progress → complete.
- **plugin.json version bump** `1.10.0 → 1.11.0`.

### Deviations from plan

- **status-grid.js 변경 0건** — plan §Files to Change에 status-grid.js UPDATE가 명시되었으나, status-grid의 `html` 출력은 dashboard 어디에도 surface되지 않음(html.js는 `grid.cells`만, markdown.js는 `grid.md`만 사용). 실제 strip은 html.js의 `renderStripCell`이 담당하며 본 PR에서 같은 파일이 이미 a11y 적용 받음. status-grid.js 수정은 dead code 변경이라 skip.
- **aria-label line count vs occurrence count** — plan validation `grep -c 'aria-label' .claude/cache/status.html` ≥ 7은 line-count 가정. compact HTML(한 줄에 다수 aria-label)에서 line count = 3으로 보이나 실제 occurrence는 5건(strip 1 + 위험도 2 + 다음 액션 복사 2). 정성 invariant는 모두 통과.
- **design-gate H3/H4 carve-out (main merge resolution)** — main에서 merge한 v1.3.0 design-gate `output-constraints.js` H3(card-less) + H4(stripe-less) absolute-ban rule이 v1.4.2 4-part OQ/Risks 컴포넌트(severity-tag pill + action-prompt code chip + meta-cue stripe + skip-link + copy-btn + raw-alert banner) design intent와 정면 충돌. selector-aware carve-out으로 해결 — `findSelectorContext()` helper + `H3_CARVEOUT`/`H4_CARVEOUT` regex(severity-tag/action-prompt/skip-link/copy-btn/s-secret/[role="alert"] + blockquote/meta-cue) 적용. carve-out selector 매칭 hit는 ignore, 일반 layout chrome의 카드/스트라이프는 여전히 absolute-ban. DESIGN.md H3/H4 row에 carve-out 명문화. 281/281 test PASS.

## [1.10.0] — 2026-06-21

v1.4.2 dashboard overhaul — Milestone 2 ship (content + actionability). PRD §M2 5축을 단일 PR로 정리. (3) jargon expand — static whitelist 기반 `<abbr title>` / markdown parenthetical. (4) cross-section dedupe — OQ ↔ Risks 의미 overlap에 `> 동일 OQ 참조` cue. (5) milestone history — PRD complete row + `mccp-pr-codex` receipt cross-ref로 새 section `<section id="milestone-history">`. (6) intent extraction — plan/PRD `## Hypothesis`/`## Summary` 1줄을 verdict suffix + status-grid `next` tooltip에 부착. (9) actionability — OQ/Risks 4-part component (severity tag + item text + `> 왜:` meta-cue + action prompt code + `[복사]` button). plugin.json `1.9.0 → 1.10.0` minor bump per CLAUDE.md §3.7 (M2 milestone ship → minor).

### Added

- **`parsers/jargon-dictionary.js`** — 37-entry static whitelist (gate name / env var / command / concept / file path 식별자). `expandJargon(text, opts) → { text, expansions }` pure function + `renderJargonHtml` (escapeHtml 적용 후 `<abbr title>` wrap) + `renderJargonMarkdown` (parenthetical). longer-key-first sort + first-occurrence-only invariant via `opts.seen` Set. span overlap guard로 `/mccp:plan-prd` 안 `/mccp:plan` 이중 expand 방지. 6 fixture test.
- **`parsers/intent-extractor.js`** — `extractIntent(body)` + `extractIntentFromPath(absPath, opts)` pure functions. PRD body 우선순위 `## Hypothesis → ## Problem → ## Summary` 첫 non-empty line. 60자 cap + `…` suffix. fsRead 주입 가능. 5 fixture test.
- **`parsers/action-prompt.js`** — `buildActionPrompt(item, kind)` severity-routed static template. CRITICAL/HIGH → `/codex:rescue`, MEDIUM → `/mccp:plan`, LOW/UNKNOWN → `/mccp:plan-prd`. risk kind는 `리스크 완화: <risk> — 제안 mitigation: <mit>` arg 합성. quote escape + 200자 cap. 8 fixture test.
- **`parsers/cross-section-dedupe.js`** — F3 absorption. token Dice coefficient + threshold 0.30 (plan spec Jaccard 0.45는 size-imbalance에 약함 — Dice가 더 robust). marker regex `\*\*[A-Za-z0-9_.\- ]+\*\*` (dot variant 포함). 한국어 postposition strip(`이/가/을/를/은/는/의/도/로/와/과/에` + `으로/에서/하면/하는` 등). risk+mitigation 결합 tokenize. Risks row에 `relatedOpenQuestion` + `_dedupeScore` mutation, OQ는 변경 없음. 7 fixture test (real PRD OQ-a/Risk-1, OQ-f/Risk-2 absorption fixture 포함).
- **`sections/milestone-history.js`** — `renderMilestoneHistory(model, formatUtils, planBody, opts)`. PRD `## Delivery Milestones` complete row + `mccp-pr-codex` receipt cross-ref. F2 absorption — `r.gate_id || r.gate` 양쪽 호환(derive normalize 출력은 `gate`). 5 expanded + `<details>` collapse. dedup by planBasename + completedAt desc sort. 날짜 미상 fallback.
- **4-part component** in `sections/open-questions.js` + `sections/risks.js` — severity tag (🔴 CRITICAL / 🟠 HIGH / 🟡 MEDIUM / ⚪ LOW) + item text(jargon expand 적용) + `<blockquote class="meta-cue">왜:` + `<div class="action-prompt"><code>...</code><button class="copy-btn" data-copy>...` + (Risks only) `<aside class="related-oq">동일 OQ 참조: ...`. 3 expanded + `<details>` collapse. F1 absorption — `data-copy`은 `escapeHtml`만 (escapeAttr URL-encode 회피로 slash command 복사 가능).
- **`parsers/plan-body.js`** line-aware `parseOpenQuestions` — 시그니처 `string[]` → `Array<{text, lineNumber, headingPath, oqHeadingLineNumber}>`. heading stack 유지로 OQ item이 어느 heading 아래 있었는지 추적. `parseDeliveryMilestonesComplete(prdBody) → Array<{name, planBasename}>` helper export.
- **Copy button JS** in `html.js` — inline event delegation 한 줄. `navigator.clipboard.writeText` + `data-copied="1"` 1.5s 토글 + `::after content: '✓복사됨'`.
- **Intent surface** — `verdict.js` step 9/10 verdict text suffix `next: <slug> — <intent>`. `sections/status-grid.js` next cell `<code title="<intent>">` tooltip. extractor exception swallow → fail-open.
- **CSS** — `.severity-tag` + `.oq-item` / `.risk-item` dashed-border separator + `.meta-cue` blockquote + `.action-prompt` flex-wrap(F2 absorption — 200+ char prompt 안전 wrap + button overflow 방지) + `.copy-btn` focus-visible 2px outline + `.related-oq` aside + `.milestone-history` list-none + WCAG AA `abbr` + `details summary` color(F1 absorption).
- **5 new test files**: `jargon-dictionary.test.js` (6) + `intent-extractor.test.js` (5) + `action-prompt.test.js` (8) + `cross-section-dedupe.test.js` (7) + `four-part-rendering.test.js` (10 — F1/F2 absorption fixture 포함).

### Changed

- **`renderer/index.js`** — milestone-history section wire-up + cross-section dedupe call. sections 배열 6→7 element. opts pass-through 확장 (status-grid + verdict + milestone-history 모두 fsRead/cwd 주입 가능).
- **`renderer/markdown.js`** — `## 이정표 기록` section + 4-part sub-list 변환 + anchor 추가.
- **`renderer/html.js`** — `<section id="milestone-history">` + COPY_SCRIPT inline + 11 신규 CSS 룰.
- **`renderer/verdict.js`** — `computeIntentForNextPlan` 추가, step 9/10 intent suffix.
- **`renderer/sections/status-grid.js`** — next cell intent tooltip + cells schema에 `intent` 필드.
- **`renderer/sections/open-questions.js`** — 4-part 재작성 (raw bullet list → severity-routed component).
- **`renderer/sections/risks.js`** — 4-part 재작성 (table → list).
- **`tests/sections.test.js`** — 4 test 4-part 형식 정합 update (옛 `+N more` / `no risks surface` → `+N 더보기` / `미해결 위험 없음`).
- **`tests/plan-body-parser.test.js`** — `parseOpenQuestions` metadata 객체 형식 검증.
- **`.claude/prds/v1-4-2-dashboard-overhaul.prd.md`** Delivery Milestones row 2: Status `pending → in-progress` + Plan cell `[v1-4-2-dashboard-overhaul-m2.plan.md](...)`.
- **plugin.json version bump** `1.9.0 → 1.10.0`.

### Deviations from plan

- `parsers/cross-section-dedupe.js` — plan spec의 Jaccard 0.45 threshold가 실제 v1.4.2 PRD OQ-a/Risk-1, OQ-f/Risk-2 데이터에서 size-imbalance(짧은 risk text vs 긴 OQ text)로 매칭 실패. Dice coefficient + threshold 0.30 + risk+mitigation 결합 tokenize로 변경. F3 absorption 의도(real PRD overlap catch)는 그대로 충족. `JACCARD_THRESHOLD` export는 backwards-compat 별칭으로 유지.

## [1.9.0] — 2026-06-21

v1.4.2 dashboard overhaul — Milestone 1 ship (layout / i18n / staleness / 시각 위계). PRD §M1 4축(staleness guard + i18n surface label + status hoist + UX 시각 위계)을 단일 PR로 정리. M2(content + actionability)는 별도 milestone으로 분리. plugin.json `1.8.0 → 1.9.0` minor bump per CLAUDE.md §3.7 (M1 milestone ship → minor; v1.4.0-m3 PR #49가 main에서 1.7.0→1.8.0을 이미 차지했으므로 rebase 후 한 칸 위로 조정).

### Added

- **`computePlanStaleness(plan, model)` + `extractCyclePrefix(slug)`** in `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` — pure helpers. STATE.md `task_fingerprint`의 cycle prefix(`v\d+-\d+-\d+`)와 plan basename cycle prefix를 매칭해 `'fresh' | 'stale' | 'unknown'` 산출. mtime 의도적 제외(worktree rebase noise). `parsePlanBody` 반환에 `planStaleness: Map<basename, 'fresh'|'stale'|'unknown'>` 추가 — in-progress plan에만 entry 보장.
- **Staleness-aware verdict** in `plugins/mccp/scripts/lib/renderer/verdict.js` — step 9 (backlog + in-progress) + step 10 (in-progress only) 분기 추가. 모든 in-progress plan이 stale이면 tone `amber` + text `다음 미정 (stale)` / `다음 미정 (in-progress plan stale)`. `unknown` 또는 entry 부재는 보수적으로 fresh 처리(backwards-compat).
- **`formatPlanLabel(basename)`** in `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` — cycle prefix 추출 + 본문 단축(`'v1-4-2-dashboard-overhaul-m1' → 'v1.4.2 · dashboard overhaul m1'`). 30자 초과 시 ellipsis. stale plan 시 `<span class="stale-label">` 분기로 `<code>` 부적합(스크린 리더 monospace 오독) 회피 — impeccable F2 absorption.
- **Sticky header strip hoist** in `plugins/mccp/scripts/lib/renderer/html.js` — `<header>` 안에 brand(`mccp 상태`) + status-strip(4 cell role="group") + meta(`마지막 갱신 · stale-suffix`) 통합. `<section id="status">` main 본문 제거. accent invariant CSS — `.status-strip .cell:first-of-type`만 `var(--accent)` 적용. `body[data-stale="1"]` 토글로 stale suffix surface.
- **3 new test files**: `tests/staleness-guard.test.js` (10 fixtures — extractCyclePrefix + computePlanStaleness 4가지 시나리오 + parsePlanBody integration + computeVerdict 4 분기) + `tests/i18n-surface.test.js` (10 — html/md Korean h2 presence + English anti-pattern absence + 헤더 brand + footer + v1.9.0 version) + `tests/header-hoist.test.js` (11 — header DOM hoist + 4 cells + 본문에서 section#status 제거 + sticky CSS + accent invariant + stale fixture data-stale attr + span.stale-label 분기).

### Changed

- **i18n surface labels** — section `<h2>` 한글화 (`타임라인` / `미해결 질문` / `위험` / `워커` / `최근 활동`). HTML 본문에서 verdict section의 `<h2>`는 제거하고 `<h1 class="verdict">` 단독으로 surface(헤딩 depth 1→2 jump 회피 + header strip "현황"과의 redundant naming 차단 — impeccable F1 absorption). footer 한글화(`v1.4.2 · <code>.claude/</code> 통합 derive`). markdown.js는 STATUS.md `## 현황` anchor 보존(F3 absorption — M4 trigger의 generic invariant + 외부 text consumer 호환).
- **plugin.json version bump** `1.8.0 → 1.9.0`.
- **`.claude/state/STATE.md` task_fingerprint** `v1-3-0-cycle-close-ready → v1-4-2-dashboard-overhaul` (`state-writer.js` API) — bootstrap chicken-egg 해소. staleness rule이 ship된 시점에 본 plan이 fresh로 판정되려면 fingerprint update가 동일 PR에 들어가야 함(Codex F1 absorption — 4-file atomic bundle).
- **`.claude/prds/v1-4-2-dashboard-overhaul.prd.md`** Delivery Milestones row 1: Status `pending → in-progress` + Plan cell `[v1-4-2-dashboard-overhaul-m1.plan.md](../plans/v1-4-2-dashboard-overhaul-m1.plan.md)`. Row 2(M2)는 그대로.

## [1.8.1] — 2026-06-21

v1.4.x patch — privacy + invariant polish on top of M3 ship. PRD §85(cross-repo contamination risk) + §87(invariant 강화) + §69(M1 session-ledger primitive) + §43(M2 metric — branch name이 STATE.md/logging inject 경로) audit가 검출한 axis 2개를 single PR로 처리. plugin.json `1.8.0 → 1.8.1` patch bump per CLAUDE.md §3.7. No schema/api break.

### Added

- **`session-ledger.js#isValidGitBranch(name)`** — git ref-format rule helper. Total function (`null → true`, non-string → false, never throws). 10 reject rules: length 1-255, leading-dot, double-dot, whitespace, control-char (0x00-0x1F + 0x7F), `@{`, consecutive `/`, trailing `/`, `.lock` suffix, `~^:?*[`.
- **`session-ledger.js#liftLegacyBranch(ledger, sourcePath)`** — read-side branch lift (Codex R1 F1 + R2 F1 absorption). In-memory only — wonky `git_branch` → `null` 강등 + module-level `WARNED_LEGACY_BRANCH_PATHS` Set memo로 per-process per-sourcePath 1회 stderr WARN cap (R2 F3 absorption). 호출 site 4개: `readLedger`, `listLedgers`, `updateLedgerHeartbeat`, `finalizeLedger` 모두 `read → lift → validate` 순서 invariant.
- **`derive/sources/receipts.js` `cwd` field emit** — receipts source가 `meta.cwd`를 surface (v0.2.x-era receipts 없는 키는 `pick()` undefined 처리, additive-only). derive/mask.js receipts cwd mask key와 짝이 활성화됨.
- **`derive/mask.js#safeTrailingSegment(input)` + `isOutsideRoot(input, repoRoot)`** — platform-independent helper 2개 (Codex R2 F2 absorption). 양쪽 slash kind 양쪽 normalize → 마지막 non-empty segment → drive-prefix / empty / `.` / `..` / separator-containing → `_` 대체. POSIX host에서 Windows-drive/UNC 입력도 leak-free.
- **`maskPath()` outside-root placeholder** — `<outside-repo:basename>` 변환. Sibling worktree / parent dir / cross-drive / UNC / restored receipts from other repos 모두 raw segment leak 0.
- **세션-ledger 11개 + mask 7개 새 test** — 5 write-side negative + 1 write-side positive + 1 helper-total + 2 read-side lift + 1 WARN cardinality + 6 maskPath case + 1 outside-root no-separator-leak invariant.

### Changed

- **`session-ledger.js#validate()`** — `git_branch !== null` 블록 안에 `isValidGitBranch` strict rule 추가. createLedger 경로(write-side)만 strict reject. v2 schema version은 유지 (backward-compat — 기존 valid v2 ledger 모두 통과).
- **`session-ledger.js` read paths** — `readLedger`/`listLedgers`/`updateLedgerHeartbeat`/`finalizeLedger` 4개 모두 JSON parse → liftV1 → **liftLegacyBranch** → validate 순서. invalid v2 ledger silent drop 방지 (Codex R2 F1 absorption — discovery surface 보존).
- **`derive/mask.js#maskPath()`** — 기존 `path.relative(root, p)`이 `..` 시작 시 absolute leak하던 결함 차단. `isOutsideRoot()` 3축 detection (Windows-drive cross-drive / UNC / POSIX `path.isAbsolute` + relative `..`) → `<outside-repo:safeTrailingSegment>` placeholder.
- **plugin.json version bump** `1.8.0 → 1.8.1`.

## [1.8.0] — 2026-06-20

v1.4.0 multi-session — Milestone 3 ship (friction zero). M2(PR #46, `33600ac`)가 cross-session discovery 완성한 위에 (1) self/other 시각 구분, (2) friction-telemetry append-only sidecar primitive, (3) full-cycle 2-worktree dogfood protocol을 얹어 PRD §M3 metric("한 cycle 내 2~5 worktree 병렬 cycle을 reconciliation 질문 없이 완주") 달성. plugin.json `1.7.0 → 1.8.0` minor bump per CLAUDE.md §3.7.

### Added

- **`derive/sources/state.js#item.self_session_id` + `item.self_resolution`** (contracted additive-only surface) — env → cwd-match → null deterministic resolution chain. `self_resolution` 4 enum(`resolved` / `resolved-by-cwd` / `env-missing` / `unresolved`) **항상 emit** — Codex Implement R1 F3 absorption (silent null fallback forbidden). Schema-surface §10 등록. resolution chain helper `resolveSelfSessionId(ledgers, options)`도 export.
- **`renderer/sections/active-sessions.js` self/other 시각 구분** — `self_session_id` 매칭 row의 첫 칼럼이 `**this worktree** \`<id>\``(md) / `<tr class="self"><td><strong>this worktree</strong> <code>…</code></td>`(html)로 시각 구분. set이 아니거나 매칭 0건이면 M2 ship 동작 그대로(graceful degrade).
- **`plugins/mccp/scripts/lib/friction-telemetry.js`** — append-only sidecar primitive. `recordBannerInjected({sessionId, projectBranch, cwd?})` 단일 public API. `<repo>/.claude/state/m3-friction-events.jsonl` 1줄 JSONL append. **No in-band cap** — Codex Implement R1 F1 absorption(concurrent SessionStart에서 read-modify-write rewrite가 telemetry event loss를 일으켰던 axis 제거). worktree `.git` file/directory 양쪽 인식. Loud fail-open(stderr WARN + ALLOW + never throw).
- **6 friction-telemetry test cases** — round-trip / no-repo WARN / concurrent 2-process loss-0 regression / CRLF+LF mix / appendFileSync EACCES no-throw / worktree `.git` file detection.
- **7 derive state-source test cases** — `resolveSelfSessionId` 4 enum × 5 case + `collectActiveSessionLedgers` env surface + `scanState` STATE.md absent + env set surface.
- **3 renderer self-marker test cases** — null/match-one/stale-no-match.
- **`docs/v1.4.0-multi-session/m3-friction-metric.md`** — single-purpose explainer. §1 sidecar schema, §2 user-side friction taxonomy 4 카테고리, §3 cycle-end aggregation, §4 dogfood pass criteria 5건, §5 retention deferral.

### Changed

- **`session-start.js`** — `summarizeOtherActiveLedgers`가 실제 banner를 push한 경우에만 `frictionTelemetry.recordBannerInjected` 호출. M2 ship된 banner inject 로직 자체는 무변경. try/catch 외피 + stderr WARN으로 telemetry 실패가 hook을 throw시키지 않도록 보장.
- **`docs/v1.3.0-observability/schema-surface.md`** — §10 신설 "Self session identity surface (v1.4.0-m3)" 2 field + 4 enum + resolution chain documented. additive-only invariant 유지.
- **`docs/v1.4.0-multi-session/state-md-narrowing.md`** — §3 끝에 v1.4.0-m3 self/other 식별 1 단락 추가. STATE.md frontmatter는 여전히 untouched.
- **`.claude/plans/codex-findings-backlog.md`** — row 2(2026-06-19 MEDIUM F4 heartbeat) Finding 칼럼에 `**ABSORBED in v1.4.0-m2 (PR #46)**` 마킹 추가(audit trail 보존). row 3(2026-06-20 LOW F1 sidecar offline retention) 신규 append — v1.5.x cycle 또는 quarterly review 후보.
- **`.gitignore`** — `.claude/state/m3-friction-events.jsonl` 1줄 추가. measurement는 worktree-local.
- **plugin.json version bump** `1.7.0 → 1.8.0`.

## [1.7.0] — 2026-06-19

v1.4.0 multi-session — Milestone 2 ship (cross-session discovery). M1(PR #43, `c071a54`)이 ship한 session-ledger primitive 위에 (1) heartbeat schema v2, (2) SessionStart discovery surface, (3) STATUS.md `## Active Sessions` 섹션 3축을 얹어 PRD §M2 metric("새 worktree 시작 후 첫 5턴 안에 manual reconciliation 질문 0회") 달성. plugin.json `1.6.0 → 1.7.0` minor bump per CLAUDE.md §3.7.

### Added

- **`last_seen_at` (v2 schema)** in `plugins/mccp/scripts/state/session-ledger.js` — ISO8601, required for v2. `createLedger`가 `created_at`으로 anchor, `updateLedgerHeartbeat`가 매 갱신마다 `nowIso()`로 progress. v1 ledger 발견 시 read-only in-memory lift(`liftV1`), 다음 heartbeat/finalize 시점에 disk 파일이 자연스럽게 v2로 rewrite.
- **`updateLedgerHeartbeat({sessionId, projectContext, scopeOverride?, timestamp?})`** — scope-aware, atomic, lock-protected last_seen_at refresh. **hybrid all-or-nothing invariant** (Codex Implement R1 F1 absorption): scope=hybrid 양쪽 path 중 일부만 update 성공하면 `ok=false` + errors에 실패 path 기록. missing-ledger는 `ok=true, noop=true` (idempotent).
- **`listLedgers` host-aware tri-state active filter** (Codex Implement R1 F1+F2 absorption) — hybrid dedupe는 newest `last_seen_at` wins(stale v1이 fresh v2를 가리지 않음). active 분류: cross-host는 heartbeat freshness만으로 판정, same-host는 `(pidIsLive AND fresh heartbeat)` 양쪽 필요. PID alive 단독 + stale heartbeat = PID-reuse 의심 → inactive. 24h fallback TTL은 v2에서 **제거**(false-immortal source).
- **`summarizeOtherActiveLedgers` in `plugins/mccp/scripts/hooks/session-start.js`** — SessionStart 첫 system-reminder에 `Other active mccp sessions in this project:` 블록 inject. 모든 field cap + 1024-char per-block hard budget(Codex Implement R1 F3 absorption — 8000-char SessionStart cap의 13% 이내). `cwd`는 `derive/mask.js#applyPathMask` 재사용으로 username/머신 경로 normalize.
- **`plugins/mccp/scripts/lib/renderer/sections/active-sessions.js`** — M3 renderer에 `## Active Sessions` 섹션 추가. 5-column 표(세션 / 브랜치 / 위치 / 호스트 / 시작). 0건이면 graceful hide. `escapeHtml` 사용으로 angle-bracket payload self-injection 차단.
- **17 new test cases**: `session-ledger.test.js` (4 schema v2 + 6 heartbeat + 6 tri-state + 2 finalize ordering + 1 invariant) + `active-sessions.test.js` (3 render + 1 escape + 1 formatAge boundary).

### Changed

- **`session-start.js`** — `createLedger` 직후 `updateLedgerHeartbeat` 호출로 resume/clear/compact 재시작 시점 last_seen_at re-anchor. discovery banner는 `summarizeActiveInstincts` push 직후 위치.
- **`session-end.js`** — `finalizeLedger` 직전에 `updateLedgerHeartbeat` 1회 호출. ended_at > last_seen_at > created_at 순서 보장(crash-vs-clean 종료 구분 가능). `finalizeLedger` 자체도 endedAt < last_seen_at일 때 +1ms로 자동 보정.
- **`docs/v1.4.0-multi-session/session-ledger-schema.md`** — v1 → v2 schema doc bump. §2에 `last_seen_at` row + §3 Public API에 `updateLedgerHeartbeat`/`pidIsLive`/`liftV1` symbol + `DEFAULT_HEARTBEAT_TTL_MS` (5분, 24h fallback removed) + tri-state filter 본문화. §6 "Deferred to M2" → "M2 Done · M3 Deferred" 재분류.
- **`renderer/index.js` + `markdown.js` + `html.js`** — 6번째 section(`active-sessions`) wire-up. anchors 목록 + section composer destructure 모두 갱신. 기존 5 section 동작 회귀 0.
- **plugin.json version bump** `1.6.0 → 1.7.0`.

## [Unreleased] — v1.4.0 automation modernization axis C (M3)

v1.4.0 PRD `automation-modernization` Milestone 3 ship — Anthropic native `/goal` completion-condition loop integration via cooperative guide pattern. M1+M2+M3 누적으로 PRD M4 (integration template doc) 별도 milestone 불필요 결정 → row status `dropped`. plugin.json version bump은 PR ship 시점 main HEAD 기준으로 결정 (CLAUDE.md §3.7) — 본 entry는 `[Unreleased]`로 두고 PR squash 시 `[X.Y.Z] — YYYY-MM-DD` 로 갱신.

### Added

- **`/mccp:milestone-close <milestone-id-or-prd-path>`** — 신규 slash command. Anthropic native `/goal` loop를 cooperative guide 패턴으로 wrapping해 milestone 종료 acceptance를 mccp receipt chain 안에 anchor한다. Phase 0 PREFLIGHT(working-tree + cost-tier) → Phase 1 DETECT(`goal-detect.js`) → Phase 2 LOCK ENTER + COOPERATIVE GUIDE → Phase 3 WAIT(grammar) → Phase 4 LOCK EXIT + closure-doc write + plan-body provenance stamp → Phase 5 (option B, 신규 gate 없음).
- **`plugins/mccp/scripts/lib/goal-detect.js`** + tests — mode-aware probe (mode=`milestone-close`). PRD `Delivery Milestones` table row parsing + 휴리스틱 (Status=in-progress AND Plan cell filled AND plan file exists). `fs.realpathSync` 기반 symlink path-traversal guard (S2 security absorption). env override `MCCP_GOAL_FEATURE={available|missing|unknown}`. 15 test scenarios + 1 symlink skip (Windows).
- **`plugins/mccp/scripts/lib/goal-phase-lock.js`** + tests — multi-turn isolation lock CLI. lock file `.claude/state/goal-phase.lock`, sidecar token `<gitdir>/mccp/tmp/goal-token-<run-id>.dat` (mode 0o600 per S1 security absorption). lease default 90s (vs M2's 60s — multi-turn `/goal` loop tolerance). ultracode-phase-lock v0.2.8 hardened 1:1 mirror (token authority split + host-aware tri-state reclaim + H2 sidecar mkdir-before-lock + F8 symlink containment). `milestone_id` + `owner_session_id` lock body fields. 17 test scenarios (lifecycle + race + tri-state reclaim + multi-turn heartbeat sim + sidecar mode + sidecar mkdir EACCES) + 1 Windows skip.
- **`plugins/mccp/scripts/hooks/goal-phase-guard.js`** + tests — PreToolUse hook. lock 활성 중 default-deny on mccp write tools + Bash mutating commands + mccp:* Skill invocations (incl. `mccp:milestone-close`). F2 fail-CLOSED on malformed lock. **F3 STRICT non-owner policy (M3 absorption)**: `event.session_id ≠ lock.owner_session_id` 시 read-only ALLOW만 (Read/Grep/Glob/ToolSearch + git read-only Bash + lock lifecycle Bash), 단 Edit/Write/MultiEdit/NotebookEdit/Skill mccp:* 는 session 무관 항상 DENY (closure-doc anchor invariant 보존). F4 MultiEdit deny matrix 포함. S3 Bash policy는 fail-closed whitelist-only. 31 test scenarios.
- **`.claude/milestone-closures/`** — git-tracked closure document 디렉토리. 4-section spec (`## Milestone` / `## Acceptance Condition` / `## Goal Loop Result` / `## Provenance`). 본 디렉토리 파일은 직접 편집 금지 — `/mccp:milestone-close` 출력물. mutation 시 다음 `/mccp:pr` validate에서 plan_hash mismatch로 detect.
- **`docs/automation-modernization/integration-template.md`** §3 layer 4 axis C 셀 + §5 matrix axis C 셀 (option B 채택) + §6 anti-pattern (Stop-hook leakage during multi-turn native loop) + §9 M3 reference (placeholder → reference 전환) + §10 audit checklist 2개 추가 (Stop-hook isolation + Multi-turn lock lease sizing). Status mark `M1+M2-validated → M1+M2+M3-validated`. PRD Open Q §3 결정 stamp.

### Changed

- **`plugins/mccp/scripts/hooks/stop-review-loop.js`** — ~20-line inline freshness validation 추가 (Codex impl-codex R1 F2 absorption — presence-only check는 stale/forged lock에 trivially bypassable). 추가 위치: `modeFromEnv` + `repoRoot` resolve 후, `gitDiffEmpty` 호출 직전. Tri-state freshness = host + pid + mtime < 90s lease (§3.6 host-aware reclaim policy mirror). suppress 시 `[mccp:stop-review-loop] suppressed: goal-phase lock active` stderr + pass-through allow. 기존 함수/decision tree 무변경, backward-compat 보장 (기존 13 시나리오 회귀 0 + 신규 4 시나리오 추가). `os` import 추가.
- **`plugins/mccp/hooks/hooks.json`** — PreToolUse 배열에 `mccp:goal-phase-guard:pre` entry 추가 (matcher `Edit|Write|MultiEdit|NotebookEdit|Bash|Skill`, pr-phase-guard + ultracode-phase-guard와 병렬 등록). Stop 배열 무변경 (stop-review-loop.js 본문 수정으로 처리).
- **`.claude/prds/v1-4-0-automation-modernization.prd.md`** — M2 row Status `in-progress → complete` (PR #42 ship 후 stale 정리), M3 row Status `pending → in-progress` + Plan cell 연결, M4 row Status `pending → dropped` (M1+M2+M3 누적으로 충족 결정, 2026-06-19). Open Questions 3개 모두 결정 stamp.
- **`.claude/milestone-closures/README.md`** — closure document spec + git-tracked invariant 명시.

### Security absorptions (security-reviewer R1)

- **S1 CRITICAL**: sidecar token file mode 0o600 mechanically enforced by `fs.openSync(sp, 'w', 0o600)` in `goal-phase-lock.js#cmdEnter`. POSIX test `fs.statSync(sidecarPath).mode & 0o777 === 0o600` verified.
- **S2 HIGH**: `goal-detect.js#validatePathSafety` uses `fs.realpathSync` for both repoRoot AND target before `path.relative` containment check — symlink-pointing-outside-repo rejected with `reason=path-traversal`. Test covers symlink scenario (POSIX, skipped on Windows).
- **S3 HIGH**: `goal-phase-guard.js` Bash policy is fail-closed whitelist-only — every command segment must match `BASH_ALLOW_PATTERNS`, else DENY. `bash -c "node ..."` wrappers, mixed slashes, env-var expansion all fall through to default-deny.
- **S4 MEDIUM (doc)**: Stop hook short-circuit fail-open invariant explicit — `JSON.parse` 실패(0-byte 포함) → catch → fall-through to existing decision tree (forged-empty lock = normal-stop, not suppress).
- **S5 MEDIUM (best-effort)**: closure-doc write applies `derive/mask.js#applySecretMask` to `Goal Loop Result` section before write (5-regex catalogue reuse: sk-key, aws-key, private-key-block + bearer, password-eq). README spec forbids raw paste.
- **S6 MEDIUM (doc)**: H2 sidecar mkdir-before-lock invariant — `mkdirSync(path.dirname(sp))` MUST be invoked BEFORE `openSync(p, 'wx')` so mkdir failure (EACCES/ENOSPC/race) doesn't orphan a lock without provable ownership channel. Test covers EACCES mock → exit 19 + lock not created.

## [1.9.0] — 2026-06-22

v1.3.0 design-gate M3 follow-up — H15(heading depth ≤ 3) + H16(unrendered markdown literal) mechanical lint rules. Parent M3 plan(`v1-3-0-design-gate-m3-output-constraints.plan.md`)의 partial Axis C deferral 약속을 닫는다. RULES length 14 → 16. PR #45 stacked ship 모드 (M3 lint + M3 follow-up 단일 PR로 묶음). plugin.json `1.7.0 → 1.9.0` (Codex Implement-Codex R1 F1 absorption — main이 v1.4.x cycle로 1.8.1까지 진행, race 회피로 1.8.0 skip 1.9.0 직행).

### Added

- **DESIGN.md H15 spec** — Heading depth ≤ 3. h1(verdict) + h2(section) + h3(sub-section) 허용, h4+ 금지. PRD §Design Direction line 149 "(a) 정보 위계 3단계" mirror. Lint: HTML body `<h([4-9])` 카운트 == 0 AND markdown은 backtick + tilde 양쪽 fenced-code-block strip 후 CommonMark ATX `^ {0,3}#{4,6}\s` 카운트 == 0.
- **DESIGN.md H16 spec** — NO unrendered markdown literal in HTML body. 6 패턴 catalog: bold-asterisk, bold-underscore (dunder strip), inline-backtick raw, entity-encoded backtick/asterisk/underscore (leading-zero + uppercase + named entity variant 모두), md-link, MD0xx lint code. carve-out: `<code>`/`<pre>`/HTML attribute + Python dunder 15종 whitelist(`__init__`/`__name__`/`__main__`/`__file__`/`__doc__`/`__str__`/`__repr__`/`__call__`/`__enter__`/`__exit__`/`__all__`/`__slots__`/`__dict__`/`__iter__`/`__len__`).
- **`plugins/mccp/scripts/lib/renderer/output-constraints.js` H15 + H16 rules** — RULES array에 push. severity `invariant` / `absolute-ban`. Codex Implement-Codex R1 4 finding absorption: F1 version skip-to-1.9.0, F2 tilde fence strip, F3 dunder 10→15 expansion, F4 entity variants permissive.
- **`output-constraints.test.js` 22 test 추가** — H15 6건(pass+html-fail+md-fail+indented-fail+backtick-fenced-pass+tilde-fenced-pass) + H16 16건(pass+5 fail pattern+carve-out+raw backtick+entity decimal+hex+leading-zero+upper-hex+named+entity-asterisk pair+3 dunder pass+expanded dunder pass+non-dunder fail+pre carve-out). 총 68/68 pass. (plan target 47, R1 absorption으로 expansion)
- **`design-invariants.test.js` drift fixture** — H15+H16 violation 강제 검출 sanity. 16-rule end-to-end는 `design_constraint_violations === []` assertion으로 자동 회귀 0.

### Changed

- **`output-constraints.js` 헤더 주석** — "H1-H14" → "H1-H16", "all 14 rules" → "all 16 rules".
- **`DESIGN.md` line 54-55** — "H1–H14 are the mechanical lint target" → "H1–H16 ... all 16 grep-based checks".
- **plugin.json version bump** `1.7.0 → 1.9.0` — minor jump skipping 1.8.x to avoid race with main(1.8.1, v1.4.x cycle parallel merge). PR #45 squash + rebase 시 conflict resolve 단순화.

### Codex Implement-Codex R1 absorption

4 finding (HIGH×1 + MEDIUM×3) 모두 R1 ACCEPT_NOW + plan body + implementation 양쪽 fully resolved (R2 미escalate, `MCCP_GATE_ROUND_CAP=1`):

- **F1 (HIGH)** Planned version bump 1.8.0 already behind main 1.8.1 → non-monotonic release risk. Task 8 override: 1.9.0 직접 bump.
- **F2 (MEDIUM)** H15 fence strip은 triple-backtick만 → tilde + 긴 backtick fence false-positive. Task 3 override: 두 fence 종류 모두 strip + tilde fence pass test 추가.
- **F3 (MEDIUM)** H16 dunder whitelist 10종 너무 좁음 — repo skill docs에 `__all__`/`__slots__`/`__dict__` 다수 존재. Task 4 override: 15종으로 확장 + expanded dunder pass test 추가.
- **F4 (MEDIUM)** H16 entity coverage 좁음 — `&#96;`/`&#x60;` exact만, `&#096;`/`&#X60;`/`&grave;` + entity-encoded `*`/`_` bypass. Task 4 override: 3 entity variant 모두 cover (leading-zero + upper-hex + named entity) + paired entity-asterisk/underscore + 4 test 추가.

### Acceptance summary

- ✓ RULES.length 16 + H15/H16 ID 정합
- ✓ output-constraints.test.js 68/68 pass
- ✓ design-invariants.test.js 5/5 pass (포함 drift fixture)
- ✓ DESIGN.md spec rows 추가 + "H1–H16" 갱신
- △ Task 7 m3-redux dry-run: H10 14건 + H16 16건 advisory by-design. H16 entity-backtick 15건은 `format-utils.js#escapeHtml`(M3 plan Codex R1 F4 XSS 방어)이 backtick → `&#96;` escape하는 의도된 동작 + markdown inline code(`` ` ``)가 `<code>` wrap 없이 escape만 됨. H10이 user content em-dash로 advisory by-design인 것과 동형. **Follow-up axis**: markdown inline code → `<code>` wrap (별도 plan).

## [1.6.2] — 2026-06-20

v1.3.0 design-gate enforcement M2 ship — SKILL first-step + critique retry loop. M1이 silent-skip을 *관측*만 했던 axis를 M2가 *positive enforcement*로 닫음: design surface plan/implement/PRD는 (1) `frontend-design-direction` SKILL의 새 `## Output Constraints` 섹션을 Phase 진입 즉시 Read, (2) impeccable critique을 bounded retry loop(`MCCP_DESIGN_CRITIQUE_MAX_RETRY` default 2)으로 돌리고, (3) PR step은 critique invoke 자체 제거 + chain-check만 (prior receipt verdict='divergent' 발견 시 BLOCK). 4 Codex Plan-Codex R1 HIGH finding 모두 plan body에 fully absorbed (F1 3-axis trigger / F2 oracle UNKNOWN=fail / F3 PR-scope chain-check / F4 pre-ship dogfood gate). plugin.json `1.6.1 → 1.6.2` patch bump per CLAUDE.md §3.7.

### Added

- **`plugins/mccp/scripts/lib/design-critique-decide.js`** — Pure-function oracle. `SEVERITY_ALIASES` + `normalizeSeverity` (lowercase / `P0` / `P1` / `blocker` / missing → fail-closed UNKNOWN) + `parseRetryCap` (env-driven, range 0-3, default 2) + `decideCritique({findings,round,cap}) → 'CONVERGED'|'ESCALATE_NEXT_ROUND'|'DIVERGENT_UNRESOLVED'`. dep-free. Codex R1 F2 absorption — `findings=null` → DIVERGENT (caller 책임).
- **`plugins/mccp/scripts/lib/tests/design-critique-decide.test.js`** — 9 fixture (기본 6 + F2 absorption 3: lowercase normalize / missing+null+P1 alias / parse-fail fail-closed).
- **`plugins/mccp/scripts/receipt/tests/validate-cmd-design-critique.test.js`** — 5 fixture A-E covering chain-check + audited escape + legacy compat (회귀 0).
- **`plugins/mccp/scripts/lib/tests/design-critique-loop-e2e.test.js`** — 6 fixture pre-ship dogfood (M2 acceptance gate). `MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL=0|1` 양 시나리오 + receipt rounds/verdict stamp + chain-check BLOCKs PR + fixture file presence (F4 absorption).
- **`.claude/cache/test-fixture-status.html`** — 합성 design-surface fixture (1줄). 좁은 whitelist (axis b)가 positive로 인식하는 synthetic artifact.
- **`plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` 섹션** — 4 rule (정보 위계 3단계 / 강조색 화면당 1개 / raw markdown marker 금지 / 한 화면 항목 수 상한). critique loop fail/M3 lint mechanical 검증의 anchor.
- **Receipt schema 4 신규 meta field** (additive — schema_version 유지): `design_critique_rounds: int|null` + `design_critique_verdict: 'converged'|'divergent'|'skipped'|null` + `design_intent_reason: string|null` + `pr_design_chain_skip_reason: string|null`. 두 reason field는 strict reason validator (M1 `IMPECCABLE_FORCE_OVERRIDE_REASON` 룰 mirror).
- **Receipt CLI 4 신규 플래그**: `--design-critique-rounds <N>` / `--design-critique-verdict <enum>` / `--design-intent-reason <text>` / `--pr-design-chain-skip-reason <text>`.
- **CLAUDE.md §3.9** — "디자인 surface 변경 시 SKILL first-step + critique retry loop" 신설. 3-axis trigger + 4 출력 제약 + bounded retry + PR scope chain-check + 자기-적용 dogfood 명시. §4 cheat sheet에 4 env 토글 추가.

### Changed

- **`plugins/mccp/scripts/lib/impeccable-detect.js`** — `DESIGN_SURFACE_PATHS`에 design-gate control-plane 3 path 추가 (좁은 확장, F1 absorption): `impeccable-detect.js` / `design-critique-decide.js` / `skills/frontend-design-direction/`. `commands/*.md` 전체는 overshoot 회피로 제외. detector 자기-적용 의무 + 본 plan 자기-재현 차단.
- **`plugins/mccp/scripts/receipt/validate-cmd.js`** — (a) lenient surface: plan/implement gate에서 `design_critique_verdict='divergent'`이면 `warnings[].push(kind='design_critique_divergent')`. (b) chain-check (F3 absorption): terminal `mccp:pr` / `mccp:prp-pr` validate 시 prior receipt verdict 검증, divergent 발견 시 `blocking[].push(kind='design_critique_chain_divergent')`. `MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN` audited escape (strict reason validator) 활성 시 advisory mode (warning으로 강등).
- **`plugins/mccp/commands/plan.md`** — Phase 5.0 입구에 3-axis trigger preflight (`SKILL_AVAIL` × `SIGNAL` × `DESIGN_INTENT_ACTIVE`) + SKILL Read 강제 stderr signal. Phase 5.0 SIGNAL=1 분기를 retry loop으로 확장 (`decideCritique` + Edit 명시 섹션만 + cap 도달 시 DIVERGENT). 5.6 receipt-write에 4 신규 flag forward.
- **`plugins/mccp/commands/prp-implement.md`** — Phase 2.5.5b에 plan.md와 동일한 3-axis trigger + retry loop mirror. Edit target은 plan body 대신 산출 code/diff. cap 도달 시 fix-task.md append + receipt verdict stamp (downstream PR chain-check BLOCK).
- **`plugins/mccp/commands/plan-prd.md`** — Phase 4.0에 동일 3-axis trigger + critique loop wire (PRD body 재생성). plan-prd는 receipt 미작성이므로 verdict는 observational, 다운스트림 `/mccp:plan`이 derived plan에서 verdict 전파.
- **`plugins/mccp/commands/pr.md`** — Phase 1.6 신설: design-critique chain-check preflight 명시. PR scope는 critique retry loop **비활성** (`MCCP_DESIGN_CRITIQUE_MAX_RETRY` 무시) + chain-check이 prior receipt verdict 검증. divergent 발견 시 STOP exit 1 (gh 호출 전, receipt 미작성). audited escape `MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN` 활성 시 advisory mode. 2.5.7 receipt-write에 `--pr-design-chain-skip-reason` forward.
- **`plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js`** — `--pr-design-chain-skip-reason` flag forward.
- **plugin.json version bump** `1.6.1 → 1.6.2` — patch jump per CLAUDE.md §3.7 (M2 단독 ship, M3 별도 cycle).

### Codex Plan-Codex R1 absorption

4 HIGH finding 모두 plan body에 fully resolved (R2 미escalate, `MCCP_GATE_ROUND_CAP=1`):

- **F1** (SKILL first-step still depends on detector false-negative) → 3-axis trigger (detector / 좁은 whitelist / audited override) + impeccable-detect.js DESIGN_SURFACE_PATHS 3 path 확장.
- **F2** (decideCritique uppercase exact match silently CONVERGED) → SEVERITY_ALIASES + normalizeSeverity + UNKNOWN=fail-closed + 9 fixture 회귀.
- **F3** (PR-scope verdict=divergent warning-only) → PR scope critique invoke 제거 + chain-check 강제 + `MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN` audited escape.
- **F4** (Task 10 retroactive-confirm gap) → pre-ship gate로 승격, 합성 fixture + `MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL=0|1` e2e test.

## [1.6.0] — 2026-06-19

v1.3.0 observability surface II — Milestone 6 ship (cycle close). Generic interface validation — derive + snapshot + renderer가 mccp 외 repo에서 graceful한지 4 fixture로 검증하고, "어떤 source가 optional이며 어떤 fallback이 보장되는가" contract을 본문화. M5 PR #41(`d12e82d`) 직후 cycle close. plugin.json `1.5.0 → 1.6.0` minor bump per CLAUDE.md §3.7 milestone-PR checklist. 새 기능 / 새 schema field 없음.

### Added

- **`plugins/mccp/scripts/derive/tests/generic-interface.test.js`** — 4 fixture × derive smoke. Fixture A (empty repo, 2-branch strict vs default), B (mccp-owned STATE.md only), B-foreign (외부 STATE.md frontmatter graceful reset), C (non-mccp gate_id `foo-gate`/`bar-gate` receipts with mccp-extension fields absent), D (degraded foreign repo: malformed JSON + unsupported STATE frontmatter + envelope `additionalProperties:false` 위반 + POSIX symlink with meta-derived sentinel strings). Codex Plan-Codex R1 F3+F4 absorption.
- **`plugins/mccp/scripts/lib/snapshot/tests/snapshot-generic.test.js`** — Fixture B/C/idempotence/retention 4 case. 외부 cwd에서 snapshot writer가 throw 없이 동작 + `briefing_*` null projection + 30-day eviction + same-UTC-day idempotent.
- **`plugins/mccp/scripts/lib/renderer/tests/renderer-generic.test.js`** — Fixture A/B/C/D 4 case × `renderStatus` → 6-section invariant + verdict 결정 + audit-timeline `gate_id` raw label fallback.
- **`docs/v1.3.0-observability/generic-interface.md`** — generic interface contract spec. §1 Optional sources, §2 mccp-extension fields (5 카테고리 13 field, 외부 repo에서 null projection), §3 Non-mccp gate names, §4 What is NOT generic (path shape / STATE schema ownership / degraded-surface-is-graceful / parseability minimum). Codex R1 F3 absorption — degraded surface가 contract의 일부.
- **`.claude/plans/notes/v1-3-0-m6-audit.md`** — 5 axis × {fixture / contract / patch} deterministic audit matrix. axis 1 security sub-axis 1건 patch (receipt file-level symlink guard) + 나머지 4 axes는 fixture/contract column으로 결정.
- **5번째 case in `plugins/mccp/scripts/receipt/tests/store-readreceipt-symlink.test.js`** — safe gate dir + symlinked `<decision>.json` → `UNSAFE_RECEIPT_FILE` throw 검증. POSIX 전용 (Windows admin 권한 필요로 skip).

### Changed

- **`plugins/mccp/scripts/receipt/store.js`** — `readReceipt` 가 file-level `isPlainFile` guard 통과 후에만 `fs.readFileSync`. envelopes.js:14-19 패턴 미러. 코드 리뷰에서 발견된 axis 1 security sub-axis 패치 — gate-dir level guard (v0.2.8 Task 2.6.5a/b)는 이미 있었지만 file level은 없었고, generic-interface §4.3의 "no external dereference" 보장이 receipts 측에서 미강제였음. Fixture D의 sentinel JSON을 `meta.created_at` + `meta.command` + `decision_id`까지 포함하도록 강화하여 진짜 invariant assertion으로 전환. **security-reviewer absorption (HIGH × 2)**: (1) `Error.message`에서 filesystem path 제거 — derive model 직렬화 시 directory enumeration leak 방지. path은 `err.path` field에 보존. (2) `existsSync → lstat → readFileSync` 3-syscall TOCTOU race를 `existsSync → lstat → open(O_NOFOLLOW) → fstat → read from fd → close` atomic 패턴으로 close. POSIX는 `O_NOFOLLOW`로 mid-syscall symlink swap reject + Windows는 정적 `isPlainFile` + `isSafeGateDir` 가 primary defense.
- **`docs/v1.3.0-observability/generic-interface.md`** §4.3 — symlink dereference 보장 cite를 envelopes (`isPlainFile`) + receipts (`isPlainFile`+`isSafeGateDir` 2축) 양축으로 정밀화. 원본은 envelopes의 guard만 인용하여 generalization gap 존재.
- **`docs/v1.3.0-observability/schema-surface.md`** — §9 cross-link to `generic-interface.md` 추가. read-side schema surface는 변경 없음.
- **PRD M6 row** `pending → in-progress` (PR merge 시 `complete`로 자동 전환, M5 PR #41 패턴 동일).
- **plugin.json version bump** `1.5.0 → 1.6.0` — minor jump per CLAUDE.md §3.7.

## [1.5.0] — 2026-06-19

v1.3.0 observability surface II — Milestone 5 ship (PR #41, squash `d12e82d`). Daily snapshot + 30-day audit timeline + Codex R1 absorption. M4가 plugin.json bump을 누락한 결과 (1.4.1 그대로 유지) 본 entry가 ship trail 백필로 추가됨 (v1.6.0 PR가 동시 백필 처리).

### Added

- **`plugins/mccp/scripts/lib/snapshot/index.js`** — daily snapshot writer. `.claude/cache/snapshots/YYYY-MM-DD.json` (`snapshot-v1` schema) + 30-day retention with Codex R1 F3 skew guards (future-dated files NOT evicted + cutoff > last-render aborts retention). always-mask invariant — `model.masked=false` 인 경우에도 snapshot payload는 masked. `gate_id + decision_id + receipt_hash` 3축 dedup identity (F2 absorption) — re-issued receipt(briefing restamp / dedupe attribution) 는 distinct event로 분리.
- **`receipt_hash` surface in `plugins/mccp/scripts/derive/sources/receipts.js`** — M5 dedup identity의 read-side anchor. v0.2.x-era receipt는 `null` projection.
- **30-day audit timeline read path** in `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` — snapshot history를 timeline section에 surface. snapshot 미존재 시 `최근 7일 활동 없음` graceful fallback.
- **`docs/v1.3.0-observability/snapshot-schema.md`** — canonical `snapshot-v1` JSON shape + filename-anchored retention + write-eligibility vs retention split (F4 absorption).

### Changed

- **plugin.json version bump** `1.4.1 → 1.5.0` — minor jump per CLAUDE.md §3.7. M4 PR #39 (refresh trigger + privacy guard)가 plugin.json bump을 누락한 결과, M5 bump이 M4 + M5 두 milestone을 동시 surface.
- **`docs/v1.3.0-observability/schema-surface.md`** §8 추가 — snapshot schema cross-link.
- **PRD M5 row** `in-progress → complete`.

## [1.4.0] — 2026-06-18

Minor bump on top of v1.3.1. Cycle close for the v1.3.0 observability surface II line — v1.3.0-m3 (STATUS.md + HTML renderer) ships as the final milestone, and the version jump signals the open follow-up axes (H1/M1/M2/M3/L1-4 from the M1 audit trail) consolidate into the v1.4.x patch cycle that follows. ship: PR #37, squash `9c7336b`.

### Added

- **`plugins/mccp/scripts/lib/renderer/*`** — derive model + M2 briefing fields → `.claude/cache/STATUS.md` + `status.html`. 6-section deterministic verdict(11-step priority chain) + briefing surface + worker fanout graceful hide. Codex R1 absorbed 4 findings (F1 M3-local `parsers/plan-body.js` so M1 surface stays immutable; F2 outer `safeFallback` outer-catch so `renderStatus` never throws; F3 verdict step 7.5 controller_active fallback for envelope-missing case; F4 `escapeHtml`/`escapeAttr` + 4 payload test) + impeccable P1/P2/P3 absorbed. Pure function of derive model, no new runtime deps.
- **`docs/v1.3.0-observability/dashboard-surface.md`** — canonical spec for the M3 dashboard surface (6-section structure + verdict priority chain + status triple + graceful-hide rules + fail-open invariant + HTML injection boundary). `docs/v1.3.0-observability/schema-surface.md §7` cross-links here as the authoritative M3 anchor.
- **`derive/cli.js render`** subcommand — `node plugins/mccp/scripts/derive/cli.js render` writes `.claude/cache/STATUS.md` + `.claude/cache/status.html`. M4 (refresh triggers) and M5 (snapshots) own scheduling; M3 owns the surface only.
- **PRD M3 row** flipped from `in-progress` → `complete` in `.claude/prds/v1-3-0-observability-surface-ii.prd.md`.

### Changed

- **plugin.json version bump** `1.3.1 → 1.4.0` — minor jump per the Last Decision recorded in the v1.3.0 cycle memory. The v1.3.x hotfix patch line closes with PR #36, and the v1.4.x cycle absorbs the follow-up axes (H1 `origin_url` mask + M1 `scanPlans.invalid_count` + M2 backlog↔plan basename match + M3 `derive/index.js` catch-block degraded flag + L1-L4 audit items). CLAUDE.md §3.7 milestone PR mandatory checklist enforced.
- **CLAUDE.md** auto-gate table updated with the M3 row + §5 entry 7 added for `plugins/mccp/scripts/lib/renderer/index.js`.

## [1.4.1] — 2026-06-19

axis A of the v1.4.0 automation-modernization cycle — cooperative integration of Anthropic native `/deep-research` into `/mccp:plan-prd` Phase 2.5 without re-implementing the native feature, with mechanical chain-of-custody anchor riding on the existing `plan_hash`. plugin.json bump `1.4.0 → 1.4.1` per CLAUDE.md §3.7 milestone-PR checklist (rebased onto v1.4.0 baseline from M3 PR #37).

### Added

- **`plugins/mccp/scripts/lib/deep-research-detect.js`** — mode-aware detection probe. Tristate availability (`available | missing | unknown`, default `unknown` to prevent phantom guidance) with env override `MCCP_DEEP_RESEARCH_SKILL`. AND-gated research_signal heuristic: evidence-gap signal (`Assumption — needs validation via` marker OR empty `## Evidence` section) **AND** research-trigger keyword (`spec`, `standard`, `research`, `표준`, `외부`, `리서치`). First-class `--stdin` entry for pre-disk PRD body. Path-traversal guard mirrors `impeccable-detect.js`.
- **`plugins/mccp/scripts/lib/tests/deep-research-detect.test.js`** — 24 tests covering tristate env override × default branches, false-positive fixture (current evidence-rich PRD), Assumption marker / empty Evidence signal paths, `--stdin` parser path, mode-mismatch (M1 is `prd`-only), env vs filesystem precedence, and AND-gate enforcement.
- **`docs/automation-modernization/integration-template.md`** — pattern doc explicitly marked `M1-experimental`. Custody anchor option matrix (a/b/c/d) deliberately leaves axis-specific decisions open; M1 chooses option (b) (body inject + plan-body provenance hash), but M2/M3 are free to pick different options. Anti-pattern §6 calls out "first-axis lock-in" as a structural risk.
- **Phase 2.5 EXTERNAL_RESEARCH** in `plugins/mccp/commands/plan-prd.md` — cooperative guide prompt fires only on `availability=available + research_signal=true`. Dedicated response grammar `paste:<content>` / `skip-research:<reason>` / `failed-research:<reason>`, explicitly separated from Phase 0 `skip` / `you decide` tokens.
- **§4.0b external research inject** in `plugins/mccp/commands/plan-prd.md` — writes `## References` section into PRD body via node-based regex replace-in-place (idempotent across re-runs of `/mccp:plan-prd` on the same PRD), with `<!-- Auto-injected from /deep-research at <ISO> -->` marker. `failed-research:` response writes an audit-trail body, not a zero-info placeholder. User-pasted content flows through `process.argv` so `$(...)` / backticks / quotes in deep-research output are inert (no shell expansion).
- **`## External Research Provenance` stamping** in `plugins/mccp/commands/plan.md` Phase 4.5 — chain-of-custody mechanical anchor. When the plan input is a `.prd.md` and the PRD has a `## References` section, `/mccp:plan` sha256-digests the References content and appends `## External Research Provenance` to the plan body. The plan body itself is hash-anchored by `plan-codex` receipt's `plan_hash`, so any later PRD `## References` mutation will mismatch on the next `/mccp:plan` validate. Idempotent — re-runs replace the prior provenance section in place.

### Changed

- **plugin.json version bump** `1.4.0 → 1.4.1` — patch bump on top of the v1.4.0 baseline shipped by M3 PR #37. axis A is the first patch of the v1.4.x cycle. ship: PR #38, squash `e7fc8de`, 2026-06-19.

### Code-review absorbed (pre-PR self-review)

- **Idempotent `## References` inject** (was MEDIUM M-1) — `plan-prd.md` Phase 4.0b switched from `cat <<EOF >> "$PRD_PATH"` (append-only) to a node regex replace-in-place. Mirrors plan.md Phase 4.5's provenance pattern, so the CHANGELOG / integration-template idempotency claim now matches the implementation.
- **`<original /mccp:plan input>` placeholder** (was MEDIUM M-2) — `plan.md` Phase 4.5 switched from `PRD_PATH="$1"` (bash positional arg, never populated for slash-command-body interpretation) to the `<placeholder>` convention used throughout the rest of the command body. Without this fix Phase 4.5 silently no-op'd because the case match always fell through to `*) PRD_PATH="" ;;`.

### Out of scope (explicit deferrals)

- New receipt fields for external research (option c in custody matrix). Deferred to M2/M3 re-evaluation. Receipt schema is invariant for this milestone.
- `/deep-research` invocation by mccp itself. CLAUDE.md §1.4 Principle (`mccp는 native 기능을 재구현하지 않는다`) is preserved — invocation stays in user turns.
- PRD Open Question §3 (`integration template doc은 M4 별도 milestone으로 할 것인가?`). Deliberately not decided in M1; revisited at v1.4.0 cycle close after M2/M3 ship.

## [1.3.1] — Unreleased

Patch cycle on top of v1.3.0-m1 — informational receipt-prompt hook + Phase 0 auto-recovery. Targets the recurring 4-step hand-recovery whenever a previous session crashes mid-/mccp:plan and leaves the receipt unwritten.

### Changed

- **`receipt-prompt.js` partition logic.** When `commandName ∈ {mccp:plan, mccp:prp-implement, mccp:resume}` AND `result.missing.length>0 && stale.length===0 && blocking.length===0 && open_critical.length===0`, the hook now emits structured `additionalContext` per `plugins/mccp/scripts/hooks/lib/receipt-context-schema.js` and ALLOWs the prompt. Stale, blocking, and open_critical results stay hard-block (R2-F1 integrity invariant preserved). Terminal/mutating commands (`mccp:pr`, `mccp:code-review`) stay hard-block regardless (R2-F2 absorption).
- **Five validate-call callsites** (`plan.md:380`, `prp-implement.md:295`, `pr.md:539`, `code-review.md:128`, `resume.md:199`) now forward `--decision ${DECISION_SLUG} --plan <plan path>` explicitly. The CLI's silent fallback to `decisionId='default'` was the mechanical root cause of the recurring v0.2.8 generic-receipt quarantine misfire (STATE.md `Open Questions` line 49, three milestones running).
- **`MCCP_RECEIPT_GATE_MODE`** kept as a legacy advanced-debug toggle; the new default behavior supersedes its `hard` setting for the recoverable subset. Removal deferred one soak cycle (v1.4.x).

### Added

- **`plugins/mccp/scripts/hooks/lib/receipt-context-schema.js`** — single source of truth for the informational `mccp_receipt_gate` payload shape. Pure data, no I/O. Exports `RECOVERABLE_ALLOW_LIST`, `isRecoverable`, `computeMustNotProceed`, `buildAdditionalContext`.
- **Phase 0 auto-recovery body** in `plan.md` + `prp-implement.md`. Reads the injected `mccp_receipt_gate` context, asserts the missing-only invariant + auto-CRITICAL absence + plan body completeness, writes the missing receipt(s), re-runs `validate-cmd` with the explicit slug/plan, and proceeds. Any failure stops the response. `code-review.md` is NOT given this body (R2-F2 absorption).
- **`plugins/mccp/scripts/lint/tests/validate-callsite-lint.test.js`** — static guard scanning every `plugins/mccp/commands/*.md` bash fence. Fails CI if any `validate --command` call is missing `--decision` or `--plan` (R2-F3 absorption). Mechanical regression for Task 1.
- **`plugins/mccp/scripts/hooks/tests/receipt-context-schema.test.js`** — 11 unit tests on the schema lib.
- **`plugins/mccp/scripts/hooks/tests/receipt-prompt-informational.test.js`** — 5 spawn-based hook tests covering: recoverable+missing → ALLOW+context, terminal /mccp:pr → BLOCK, terminal /mccp:code-review → BLOCK, recoverable+stale → BLOCK, `MCCP_RECEIPT_GATE_MODE=hard` does not regress informational path.

### Out of scope (explicit deferrals)

- Atomic finalizer state machine (Codex MED 0.88) — prevents *occurrence*; this patch prevents *recurrence*. Separate milestone.
- Receipt JSON → derive-from-plan/git replacement — Codex HIGH 0.93 REJECT preserved.
- Recovery for stale/blocking/open_critical paths — by design, requires human triage.

## [1.2.0-m1] — Unreleased

Orchestrator cycle Stage 2 Milestone 1 (project tag: `v1.2.0-m1`) — foundation IPC for multi-worker fanout. Pilot (M2) + lifecycle hardening (M3) deferred to backlog continuation.

### Added

- **dispatch-envelope schema (Draft-07)** at `plugins/mccp/scripts/lib/dispatch-envelope.js` with explicit `worker_exit_status` enum (`pending` nonterminal + `ok`/`failure`/`timeout`/`crashed` terminal) — Codex F2 absorption from Implement-Codex review made the nonterminal state schema-valid before the controller writes the placeholder. Envelope location pinned to `<parent_cwd>/.claude/state/dispatches/<uuid>.envelope.json` (next to `STATE.md`; lifecycle clarity wins over receipt-chain integration).
- **dispatch-controller** (`plugins/mccp/scripts/lib/dispatch-controller.js`) — `prepareDispatch({workers, controllerSessionId, parentCwd})` writes placeholder envelopes + heartbeats and returns worker prompts; `mergeEnvelopes([envelope1, …])` is a pure aggregator. The controller never calls `Agent` itself (lib code can't); the caller (slash-command body) invokes Agent in parallel and feeds back the collected envelopes.
- **dispatch-watcher** (`plugins/mccp/scripts/lib/dispatch-watcher.js`) — hybrid `fs.watch` (Monitor) + `setInterval` polling. Polling is binding (cross-platform), `fs.watch` is opportunistic latency reducer. `MCCP_ORCHESTRATOR_POLL_MS` env override (default 500ms).
- **worktree-sync** (`plugins/mccp/scripts/lib/worktree-sync.js`) — atomic worktree → parent envelope move with EXDEV cross-device fallback. `cleanupWorktree({keep|remove})`.
- **Receipt schema 4 new optional `meta.*` fields** (`controller_context_marker_present`, `dispatched_by_controller_session_id`, `worker_dispatch_id`, `ipc_envelope_path`) with marker-gated all-or-nothing invariant — `marker=true → require all 3`, `marker=false → forbid all 3`. Codex Adversarial Review F2 absorption: a partial state would have allowed silent total attribution loss. Existing v0.2.x receipts (marker=undefined + 3 fields=undefined) pass validation unchanged (backward compat).
- **`mccp-receipt write` CLI flags** — `--dispatched-by-controller-session`, `--worker-dispatch-id`, `--ipc-envelope-path`. Marker detection via `MCCP_DISPATCH_CONTEXT=1` env OR the supplied envelope path existing on disk; fail-closed exit 12 (`DISPATCH_MARKER_MISSING_FIELDS`) when marker is detected but flags are missing.
- **validate-cmd envelope integrity check** (Codex F3 absorption) — when a receipt carries `meta.ipc_envelope_path`, the validator loads the envelope and asserts `envelope.dispatch_id === receipt.meta.worker_dispatch_id` AND `envelope.receipts_added ⊇ ['<gate_id>/<decision_id>']`. Mismatch surfaces as `blocking[].kind="envelope-mismatch"`.
- **`v1.2.0-dispatch-fields` migration** (`plugins/mccp/scripts/migrations/v1.2.0-dispatch-fields.js`) — additive (no-op for existing receipts); writes marker `.claude/receipts/.migrations/v1.2.0-dispatch-fields.json` with `noop=true` + `state=complete`.
- **STATE.md 3 new events + 2 patch fields** — `dispatch_started`, `dispatch_envelope_received`, `dispatch_chain_aborted` events survive the unknown-downgrade branch; `controller_session_id` (UUID, conditional emit) + `active_dispatch_count` (int, conditional emit).
- **Heartbeat + `reclaimStale`** (Codex F4 absorption) — `prepareDispatch` writes `<uuid>.heartbeat` per worker; caller is responsible for in-loop mtime refresh (lib can't run forever). `reclaimStale({envelopeDir, ttlMs=300000})` applies a host-aware tri-state policy mirroring `pr-phase-lock.js`: same-host + pid-alive = never reclaim, same-host + pid-dead = reclaim, cross-host = mtime-only with TTL. `validate-cmd.js` boot calls reclaim opportunistically (fail-open).
- **Full-cycle smoke** (`plugins/mccp/scripts/lib/tests/dispatch-fullcycle-smoke.test.js`, Codex F1 absorption) — 4-row regression for caller↔controller contract: both-ok / 1-failure / 1-timeout / 1-malformed envelope. No real Agent calls; fixture-driven only. PR ship gate.
- **Docs trio** at `docs/v1.2.0-orchestrator/` — `architecture.md`, `envelope-schema.md`, `operator-runbook.md`.

### Deferred to backlog (M2/M3)

- M2 pilot vertical (`/mccp:code-review` PR mode fanout, `MCCP_ORCHESTRATOR_PILOT` flag) — needs measurement of wall-time + finding count + dual-review overlap ratio over a soak period.
- M3 case 6 (stale envelope GC, 24h TTL) — deferred until M2 dogfood signals how often stale envelopes accumulate.
- Real Agent E2E test (M2 pilot).
- Receipt → controller chain auto re-link (Stage 3+).
- `session-spawner.js` removal (deprecation cycle, Stage 2 M2 or Stage 3).
- Windows native inotify analog (`ReadDirectoryChangesW`) — polling fallback covers correctness; latency improvement in M2 watcher hardening.

## [1.1.0] — Unreleased

Orchestrator cycle Stage 1 (v1.1.0-s1).

### Fixed

- `receipt-prompt` hook의 review-mode bypass 가드가 canonical `'mccp:code-review'` 이름만 literal 매칭하던 결함을 수정. catalog가 광고하는 `/mccp:review-pr ↔ /mccp:code-review` alias 관계를 enforcement layer도 인지하도록 `REVIEW_BYPASS_COMMANDS` Set으로 normalize. `--standalone`과 Local Review Mode 두 bypass 분기 모두 alias 호출에서 정상 동작. 사용자 증상은 `/mccp:review-pr 27 --standalone`이 phantom `mccp-pr-codex` MISSING block을 일으키고 decision-slug가 branch fallback(`v1-1-0-orchestrator-s1`)으로 떨어지던 것 — surface/enforcement desync (axis L과 같은 *symmetry* 결함 카테고리). PR #27 receipt 검증 중 발견. (`plugins/mccp/scripts/hooks/receipt-prompt.js`, regression+alias 양 케이스 테스트 `receipt-prompt-alias-bypass.test.js` 추가)

## [1.0.1] — Unreleased

First patch cycle after v1.0.0 ship. Cherry-picks axis K from the W-VERDICT §7 roadmap (C3 — cross-platform `pr-phase.lock` hardening — M1 only; M2 reproduction matrix deferred to a separate plan), extends with axis K2 to close a parallel receipt-gate false-negative discovered during axis K1 dogfood (`/mccp:pr` MISSING receipt despite the chain already converged on disk), and lands axis P — hook layer tidy (A/C/D/E축) plus a hard-cut rename of all user-facing `ECC_*` env vars to `MCCP_*` so that mccp users running an additional ECC plugin install can configure each plugin independently.

### Breaking — `ECC_*` env var hard-cut rename (axis P)

mccp no longer reads any `ECC_*` env var for its own hooks. Backward-compat aliases are **not** provided — an alias is the exact source of cross-plugin collision this rename exists to eliminate. ECC origin (`ECC_ROOT`) and the install-tree-internal `ECC_DISABLED_MCPS` remain unchanged (install tree is out-of-scope of axis P; a separate cleanup axis will revisit it).

| Old (removed) | New | Surface |
|---|---|---|
| `ECC_HOOK_PROFILE` | `MCCP_HOOK_PROFILE` | hook profile selection |
| `ECC_DISABLED_HOOKS` | `MCCP_DISABLED_HOOKS` | per-hook kill switch |
| `ECC_SKIP_OBSERVE` | `MCCP_SKIP_OBSERVE` | observer recursion gate |
| `ECC_GATEGUARD` | `MCCP_GATEGUARD` | GateGuard fact-force opt-out |
| `ECC_HOOK_ID` | `MCCP_HOOK_ID` | runner→child hook id inject |
| `ECC_PLUGIN_ROOT` | `MCCP_PLUGIN_ROOT` | plugin root resolution (CLAUDE_PLUGIN_ROOT fallback) |
| `ECC_HOOK_INPUT_TRUNCATED` | `MCCP_HOOK_INPUT_TRUNCATED` | upstream stdin truncation flag |
| `ECC_HOOK_INPUT_MAX_BYTES` | `MCCP_HOOK_INPUT_MAX_BYTES` | per-hook stdin cap |
| `ECC_OBSERVE_RUNNER_TIMEOUT_MS` | `MCCP_OBSERVE_RUNNER_TIMEOUT_MS` | observe-runner child timeout |
| `ECC_SESSION_ID` | `MCCP_SESSION_ID` | explicit session id override |
| `ECC_SESSION_RETENTION_DAYS` | `MCCP_SESSION_RETENTION_DAYS` | session record retention |
| `ECC_SESSION_START_CONTEXT` | `MCCP_SESSION_START_CONTEXT` | SessionStart context inject toggle |
| `ECC_SESSION_START_MAX_CHARS` | `MCCP_SESSION_START_MAX_CHARS` | SessionStart context cap |
| `ECC_SESSION_RECORDING_DIR` | `MCCP_SESSION_RECORDING_DIR` | canonical-session recording dir |
| `ECC_QUALITY_GATE_FIX` | `MCCP_QUALITY_GATE_FIX` | quality-gate auto-fix mode |
| `ECC_QUALITY_GATE_STRICT` | `MCCP_QUALITY_GATE_STRICT` | quality-gate strict mode |
| `ECC_GOVERNANCE_CAPTURE` | `MCCP_GOVERNANCE_CAPTURE` | governance capture toggle (now off by default at the hooks.json layer too — axis C) |
| `ECC_CONTEXT_MONITOR_COST_WARNINGS` | `MCCP_CONTEXT_MONITOR_COST_WARNINGS` | cost warning surface |
| `ECC_CONTEXT_MONITOR_COST_MODE` | `MCCP_CONTEXT_MONITOR_COST_MODE` | cost message tone control |
| `ECC_MCP_HEALTH_STATE_PATH` | `MCCP_MCP_HEALTH_STATE_PATH` | mcp-health state file path |
| `ECC_MCP_CONFIG_PATH` | `MCCP_MCP_CONFIG_PATH` | MCP config path override |
| `ECC_MCP_RECONNECT_COMMAND` | `MCCP_MCP_RECONNECT_COMMAND` | mcp-health reconnect command |
| `ECC_MCP_HEALTH_FAIL_OPEN` | `MCCP_MCP_HEALTH_FAIL_OPEN` | mcp-health fail-open mode |
| `ECC_GH_SHIM` | `MCCP_GH_SHIM` | gh CLI shim path |

Preserved (axis P does **not** rename):

- `ECC_ROOT` — points at the ECC origin marketplace. User-set, mccp does not own.
- `ECC_DISABLED_MCPS` — read only by `plugins/mccp/scripts/lib/install/apply.js` (install tree). Install tree is out-of-scope of axis P and is tracked as a separate cleanup axis.
- `ECC_OBSERVER_*` (in `plugins/mccp/skills/continuous-learning-v2/agents/observer-loop.sh`) — owned by the v2 skill; will move with the skill's mccp-native migration.
- `configure-ecc` skill name + `'ecc'` install-time namespace constant — install tree identity, intentional.

Migration: replace any `ECC_X=...` line in your `.claude/settings.json`, `.claude/settings.local.json`, or shell profile with `MCCP_X=...`. There is no automatic alias.

### Removed (axis P)

- `plugins/mccp/scripts/hooks/pre-write-doc-warn.js` — pure shim; `hooks.json` calls `doc-file-warning.js` directly already.
- `plugins/mccp/scripts/hooks/auto-tmux-dev.js` — Windows no-op + only caller (`bash-hook-dispatcher.js PRE_BASH_HOOKS`) also removed.
- `plugins/mccp/scripts/hooks/insaits-security-wrapper.js` + `insaits-security-monitor.py` — InsAIts company-internal policy hook, not relevant in personal mccp install.
- `plugins/mccp/scripts/hooks/post-bash-pr-created.js` — `/mccp:pr` gate already owns the single PR-creation path.
- `hooks.json` registrations removed (scripts kept for v2 reference / standalone use): `pre|post:observe:continuous-learning` (v1 deprecated, v2 lives as a separate skill), `pre|post:governance-capture` (opt-in default off → every tool call paid 2 no-op spawns), `post:session-activity-tracker` (metrics unified through `mccp-metrics-bridge`), `post:edit:design-quality-check` (mccp is a backend CLI plugin; frontend drift warning is always a false positive), `post:edit:console-warn` (Stop's `check-console-log` covers the same surface in batch), `pre:edit-write:suggest-compact` (same role as `strategic-compact` skill), `mccp:stop:auto-handoff` (cost notify reclassified as noise per the `feedback-cost-not-stop-signal` rule).
- `mccp-context-monitor.js` (renamed from `ecc-context-monitor.js`) is retained as a script but its `hooks.json` Stop registration is unaffected — only the cost-warning surface is governed by `MCCP_CONTEXT_MONITOR_COST_WARNINGS`.

### Changed (axis P)

- `plugins/mccp/scripts/hooks/bootstrap.js` (new) — single entry point that resolves `CLAUDE_PLUGIN_ROOT` once (env → standard plugin paths → cache directory walk) and delegates to `plugin-hook-bootstrap.js`. Replaces ~30 inline `node -e "..."` bootstraps in `hooks.json`. Total `hooks.json` command character count reduced from ~36k to ~3.6k (**~90% reduction**); the file remains valid JSON.
- `pre|post:mcp-health-check` `matcher` narrowed from `"*"` (every tool) to `"^mcp__"` (MCP tool invocations only).
- `gateguard-fact-force.js` scope limited to repo-critical paths (`scripts/lib/**`, `commands/**`, `hooks/**`). Generic file edits (docs, ad-hoc scripts, plans) no longer trigger the fact-force gate.
- `quality-gate.js` reduced to syntax-only fast-fail (`node --check` / `gofmt -l` / `python -c "ast.parse(...)"`) per edit. Full lint/typecheck/formatter rewrite continues to run from Stop hooks where it can be batched per session. Per-edit budget target: <500 ms.

### Fixed

- **axis K1** — `pr-phase-guard` hook now reclaims orphan locks left by crashed PR helpers (same-host + dead PID), eliminating Linux/macOS self-trap when `/mccp:pr` is re-invoked after a helper crash. The hook reuses `pr-phase-lock.js`'s host-aware tri-state policy (`isPidAlive` + `tryReclaimStaleLock`), so live PIDs are never disturbed (`NEVER reclaim` invariant). Cross-host orphan locks fall through to the existing block path. Silent recovery is prevented by a state-file marker (`<root>/.claude/state/pr-phase-lock-stale-reclaimed.json`) that `finalize-receipt.js` consumes on the next PR cycle, stamping `meta.pr_phase_lock_stale_reclaimed_at_hook=true` on the receipt. See [docs/v0.2-state-schema.md §4.5](docs/v0.2-state-schema.md) for the marker contract.
- **axis K2** — `deriveDecisionId` (`scripts/receipt/decision.js`) now augments a valid BRANCH_BASED_COMMAND slug with the matching plan-codex receipt slug when the branch slug is a strict prefix of exactly one existing plan receipt. Closes the false-negative where `/mccp:pr` on branch `v1.0.1-axis-k` derived slug `v1-0-1-axis-k` while `/mccp:plan` had written its receipt under `v1-0-1-axis-k-pr-phase-guard-pid-alive` — receipt-gate reported MISSING even though the chain was converged on disk. Ambiguous (2+) or zero prefix-matches fall through unchanged (regression-safe). v0.3.6 Task 5 fallback chain still wires for invalid-branch-slug cases.

### Added

- `meta.pr_phase_lock_stale_reclaimed_at_hook` — additive optional boolean field on receipt schema; default `false`. Existing receipts pass schema validation unchanged (no migration script required).
- `--pr-phase-lock-stale-reclaimed-at-hook` flag on `node plugins/mccp/scripts/receipt/cli.js write` — forwarded by `finalize-receipt.js` when a stale-reclaim marker is consumed.
- `findReceiptSlugByBranchPrefix(branchSlug, cwd)` exported helper on `scripts/receipt/decision.js` — used by axis K2 augmentation; skips `.legacy` / `.bak` sidecars to avoid historical receipt pollution.
- Test axes 11.1–11.5 (PID liveness fixtures incl. Windows escape-path preservation) + 12.1–12.4 (marker shape, idempotency, finalize-receipt round-trip, corrupt-marker handling) in `plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js` — 9 new tests, 0 regressions on existing axes 1–10.
- 7 axis K2 tests in `scripts/receipt/tests/decision.test.js` (single-prefix augment, exact-match no-augment, ambiguous-multi no-augment, no-match / absent-dir no-augment, legacy/bak sidecars ignored, integration via `deriveDecisionId('mccp:pr',...)`, PLAN_PATH_COMMANDS invariant — only BRANCH_BASED commands are augmented). 0 regressions on existing 42 decision tests.

### Verified

- **axis K M2** — Linux + macOS cross-platform reproduction passing via GitHub Actions matrix (`.github/workflows/axis-k-m2-cross-platform.yml` × `ubuntu-latest` + `macos-latest`). Deterministic fixture (`axis-k-m2-reproduce.mjs`) exercises the real `pr-phase-lock` module's `tryReclaimStaleLock` + `isPidAlive` on each runner, asserting same-host + dead-PID orphan locks are reclaimed with canonical 5-key marker (`reclaimed_at` / `former_run_id` / `former_pid` / `former_host` / `reason`). Windows PowerShell escape path regression-free — `hooks.json` PreToolUse matchers contain no `PowerShell` substring (statically asserted by `axis-k-m2-windows-regression.mjs` on both Linux + macOS runners). F11 sealed-channel `lockBody` schema unchanged — `pr-phase-lock-f11.test.js` 15/15 PASS on both OS. W11 rubric audit row 4d recovered from `Type E (5) + NS=5` to `Type ≤C (≤3) + NS ≤2` per `.claude/audit/v1.0.1-axis-k-m2-rubric.md` re-measurement; W-VERDICT §2 BLOCKING tally 1 → 0 (single-row STOP_RELEASE source closed).

## [1.0.0] — 2026-06-15

First W-VERDICT-gated release. Ship recommendation derived from synthesis of 11 worktree dogfood audits ([W-VERDICT §7 Cherry-pick Roadmap](.claude/audit/v1.0.0-release-verification-verdict.md#7-cherry-pick-roadmap-pre-tag-vs-post-tag)) classified as **CONDITIONAL** with two pre-tag requirements (C1 + C2). Both shipped; C3 (cross-platform `pr-phase.lock` hardening) deferred to v1.0.x axis K.

### Pre-tag conditions met (C1 + C2)

- **C1** — PR [#20](https://github.com/idenn207/mccp/pull/20) `fix(v1.0.0): preflight.js writeBlockReason() recovery surface` (commit `e892d27`). Absorbs W11 audit 11j+11k MEDIUM → LOW; partially resolves W4 4a (receipt write read-first failure hint absence).
- **C2** — PR [#21](https://github.com/idenn207/mccp/pull/21) `docs(v1.0.0): demote MCCP_AUTO_CHAIN_SKIP_PR to LLM-observed` (commit `8d6504c`). Resolves W10 F-W10-1 doc-vs-code drift by demoting CLAUDE.md §4 "live" label to "LLM-observed" (W-VERDICT §6 axis M).

### Severity tally (post-C1+C2)

| Tier | Pre-W-VERDICT | Post-ship | Δ |
|---|---|---|---|
| BLOCKING | 1 | 1 | 0 (env-conditional; Linux/macOS true-BLOCKING deferred to v1.0.x axis K) |
| HIGH | 8 | **7** | **−1** (C2 axis M demote) |
| MEDIUM | 13 | 12 | −1 (C1 11j/11k MED → LOW) |
| LOW | 12 | 14 | +2 (C1 absorption) |
| PASS / INFO / NTH | 60+ | 60+ | — |

### Known Issues (release notes — non-blocking on Windows)

- **W4 4d** `pr-phase.lock` self-trap on `/mccp:pr` re-entry. Windows workaround: invoke `node plugins/mccp/scripts/lib/pr-phase-lock.js detect-stale` via PowerShell tool (outside `pr-phase-guard.js` PreToolUse hook scope). Linux/macOS escalate via process kill + new session. Permanent fix: v1.0.x axis K (`pid_alive` validation + auto-release).
- **W4 4a** Receipt write read-first failure surface. Manual `rm <receipt>` + write re-run. C1 patch resolves the `writeBlockReason()` recovery surface; full symmetry across all classifications is v1.0.x axis L.
- **W7 docs/v0.2-*** prefix (`docs/v0.2-architecture.md`, `docs/v0.2-state-schema.md`) gives a stale first impression post-tag. v1.0.x axis N housekeeping (rename + content sync).
- **W6 STATE.md frontmatter** regression (`task_fingerprint` synthetic patch + `last_event` precedence drift). Observability-only — dual-reviewer chain does not consume STATE.md frontmatter (grep-verified).
- **W1 F-W1-1** `/mccp:work` classification metadata leakage. `.claude/audit/*` and similar metadata trigger full-chain when user intent is trivial. Workaround: explicit `--trivial` override.

### Ship history (chronological)

| PR | Commit | Title | Surface |
|---|---|---|---|
| [#20](https://github.com/idenn207/mccp/pull/20) | `e892d27` | `fix(v1.0.0): preflight.js writeBlockReason() recovery surface` | C1 — W11 11j+11k MEDIUM → LOW |
| [#21](https://github.com/idenn207/mccp/pull/21) | `8d6504c` | `docs(v1.0.0): demote MCCP_AUTO_CHAIN_SKIP_PR to LLM-observed` | C2 — W10 F-W10-1 HIGH demote (HIGH 8→7) |

### Supporting artifacts

- [.claude/audit/v1.0.0-release-verification-verdict.md](.claude/audit/v1.0.0-release-verification-verdict.md) — synthesis verdict
- [.claude/audit/v1.0.0-*.md](.claude/audit/) — 11 individual worktree audit ledgers (baseline, codex-backoff, impeccable, receipts, handoff, state-continuity, docs-sync, dual-reviewer, goal-loop, env-matrix, fallback-ux)
- [.claude/plans/v1-0-0-release-verification.plan.md](.claude/plans/v1-0-0-release-verification.plan.md) — verification plan + acceptance rules
- [.claude/plans/v1-0-0-preflight-recovery-surface.plan.md](.claude/plans/v1-0-0-preflight-recovery-surface.plan.md) — C1 patch plan

### Post-merge manual step

```bash
git checkout main && git pull
git tag v1.0.0
git push origin v1.0.0
```

The CHANGELOG entry above commits as part of the release notes PR; the annotated tag is created manually post-merge.

---

*Prior ship history (v0.2.x – v0.4.0) lives in commit history and PRs (`git log --grep "v0\\."`). v1.0.0 marks the first release-verification-gated milestone where a synthesized verdict (`.claude/audit/v1.0.0-release-verification-verdict.md`) and a documented Cherry-pick Roadmap gated the tag decision.*
