# Plan: 계측 재실행 편향 해소 (diverse-agent-review M9)

**Source PRD**: `.claude/prds/diverse-agent-review.prd.md`
**Selected Milestone**: #9 — 계측 재실행 편향 해소
**Complexity**: Medium

## Summary

`cli.js record`는 매 실행 `.claude/reviews/plan-review-<slug>.md`를 **무조건 덮어쓴다**
(`plugins/mccp/scripts/lib/plan-review/cli.js:1153` `fs.writeFileSync`). slug는 PRD 경로
파생이라 한 PRD의 모든 milestone과 모든 라운드가 그 한 파일을 공유하고, 그래서 #6은 4회를
돌리고 디스크에 1건을 남겼다(O3). 저장소 이력이 그 손실을 직접 잰다 — 레코드 56개 중
10개가 2회 이상 커밋됐고 **커밋된 덮어쓰기만 23회**다(`plan-review-diverse-agent-review.md`
5회 · `plan-review-impeccable-detection-contract.md` 5회). 세션 안에서만 일어난 덮어쓰기는
이 숫자에 아예 들어가지 않으므로 23은 하한이다.

M9는 **덮어쓰기 전에 나가는 레코드를 보존**한다. 새 이름 체계도, 새 소비처도, 새 토글도
만들지 않는다 — `cmdRecord`가 canonical을 쓰기 직전에 기존 파일을 `.claude/reviews/archive/`로
**복사**하고, 복사하지 못하면 **덮어쓰지 않는다**. 축적 표면을 새로 발명하지 않는 이유는
`plugins/mccp/scripts/lib/plan-review/corpus.js:103-106`이 이미 `.claude/reviews/`와
`.claude/reviews/archive/` **두 경로**를 코퍼스 소스로 읽고 있고, 소속 판별자가 파일명이
아니라 첫 줄 `# Plan Review Panel —` 이기 때문이다(`corpus.js:211`). 축적 지점은 이미
저장소 안에 있고 아무도 그리로 쓰지 않았을 뿐이다.

> **"아카이브가 자동으로 코퍼스가 된다"는 `corpus.js`에 대해서만 참이다** (R0 invariant/LOW
> 흡수). `approval-audit.js:172`의 `REVIEW_DIR`는 `.claude/reviews` 하나이고 `:588`의
> `io.readDir(REVIEW_DIR)`는 **비재귀**라 `archive/` 하위를 열거하지 않는다 — M11이 세운
> false-approve 감사는 아카이브로 밀려난 레코드를 보지 못한다. 이것은 M9가 만드는 결함이
> 아니라 **M9가 바꾸지 않는 한계**다(오늘은 그 레코드가 아예 없으므로 감사 대상도 아니다).
> 감사 도구의 열거 범위 확장은 판정 도구의 표본 우주를 바꾸는 일이라 별도 축으로 이연한다.

**게이트 본문은 한 줄도 바뀌지 않는다.** 아카이브 판별자는 나가는 레코드의 내용에서
파생되므로 12개 `record` 호출부가 라운드를 알 필요가 없다. 이것이 #9를 #5 뒤에 둔 이유의
실현이다(UI1·UI2) — 배선을 늘려 해결할 수 있었던 문제를 배선을 늘리지 않고 `cmdRecord`
안으로 넣는다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | #9는 #5의 오라클 추출 뒤에 착수한다 | direction |
| UI2 | 배선을 늘리는 작업이므로 seam 패턴을 재생산하지 않는다 | constraint |
| UI3 | 같은 결정에 대한 재실행이 이전 레코드를 덮어쓰지 않아 수렴 과정이 축적된다 | constraint |
| UI4 | 레코드를 이름으로 결속하지 않으며 귀속은 해시가 한다 | constraint |
| UI5 | receipt schema version bump은 하지 않는다 | exclusion |
| UI6 | 모든 게이트를 동시에 전환하지 않는다 | exclusion |
| UI7 | 소급 복구가 불가능한 것을 복구했다고 적지 않고 산출 0인 지표는 forward-only로 표기한다 | constraint |
| UI8 | 머지·배포 뒤에만 관측 가능한 항목은 이 milestone의 acceptance가 아니다 | constraint |
| UI9 | 단위 test 통과를 경로 작동과 등치하지 않고 라이브 완주를 acceptance로 요구한다 | constraint |
| UI10 | 리뷰는 1라운드가 기본이고 미해소 항목은 backlog로 이연한다 | direction |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 순수/부작용 분리 | `plugins/mccp/scripts/lib/plan-review/cli.js:1140` | 순수 모듈(`record.js`)은 `fs` import 0건을 유지하고 I/O는 `cli.js` 경계에서만 한다 (DD6) |
| 경로 위생 | `plugins/mccp/scripts/lib/plan-review/record.js:70` | `sanitizeSlug` — 식별자가 아닌 것은 "가깝다"가 아니라 다른 파일이다. `-{2,}`를 접으므로 `--`는 슬러그 안에 존재할 수 없다 |
| fail-open 계약 | `plugins/mccp/scripts/lib/plan-review/cli.js:1069` | `record`는 어떤 실패에도 exit 0이고 degradation을 stderr로 시끄럽게 낸다 — 계측이 게이트를 죽이지 않는다 |
| 부재 ≠ 0 | `plugins/mccp/scripts/lib/plan-review/record.js:283` | 관측하지 못한 축은 null로 적는다. 보존 여부도 같은 규약을 따른다 |
| 해시 귀속 | `plugins/mccp/scripts/lib/plan-review/approval-audit.js:41` | ship receipt 귀속은 파일명이 아니라 `plan_hash` ↔ `reviewed_plan_hash`. 파일명은 정체성이 아니다 |
| 코퍼스 소속 판별 | `plugins/mccp/scripts/lib/plan-review/corpus.js:211` | 판별자는 첫 줄 H1이지 파일명이 아니다 — 그래서 아카이브가 자동으로 코퍼스가 된다 |
| test 규약 | `plugins/mccp/scripts/lib/tests/plan-review-record.test.js:16` | `node:test` + `runCli`를 tmp repo에서 직접 호출 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/plan-review/record.js` | UPDATE | 순수 `archiveRecordPath(slug, stampIso, digestHex)` + 보존 계약 주석. `fs` import는 계속 0건 |
| `plugins/mccp/scripts/lib/plan-review/cli.js` | UPDATE | `cmdRecord`가 canonical 쓰기 **전에** 나가는 레코드를 아카이브하고, 실패하면 덮어쓰지 않는다 |
| `plugins/mccp/scripts/lib/tests/plan-review-record.test.js` | UPDATE | 축적 · 보존실패 · 순수성 · 코퍼스 가시성 케이스 추가 |
| `docs/diverse-agent-review/record-accumulation.md` | CREATE | 보존 계약 · 파일명이 정체성이 아닌 이유 · 운영 런북 · 주장하지 않는 것 |
| `CLAUDE.md` | UPDATE | §3.12(증거 내구성 계약)에 3~5줄 포인터 — 아카이브는 자동 정리하지 않는다 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.33.6 → 1.33.7` (§3.7 patch — PRD 미종료의 단일 milestone) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 (4면 중 2면) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 (4면 중 3면) |
| `CHANGELOG.md` | UPDATE | `## [1.33.7]` 항목 + `currently` 노트 (4면 중 4면) |
| `.claude/prds/diverse-agent-review.prd.md` | UPDATE | row #9 status `pending → in-progress` + Plan 셀 |

> `plugins/mccp/commands/plan.md`는 **변경 대상이 아니다.** 그 사실이 Validation 5번의
> 단언이며, 이 milestone이 UI2를 지켰다는 유일한 기계적 증거다.

## Tasks

### Task 1: 순수 아카이브 경로 빌더 (`record.js`)

- **Action**: `archiveRecordPath(slug, stampIso, digestHex)` 추가 →
  `.claude/reviews/archive/plan-review-<sanitizeSlug(slug)>--<stamp>--<digest12>.md`
  - `<stamp>`: ISO를 `-` · `:` · `.` 제거로 압축한 `YYYYMMDDTHHMMSSsssZ`. 압축 결과가
    `^\d{8}T\d{6}\d{0,3}Z$`가 아니면 `undated`. 절대 throw하지 않는다.
  - `<digest12>`: `^[0-9a-f]{12,64}$`의 앞 12자. 아니면 `nodigest`.
  - 구분자가 `--`인 이유는 장식이 아니다 — `sanitizeSlug`가 `-{2,}`를 접으므로 `--`는
    슬러그 안에 **존재할 수 없고**, 그래서 경계가 모호해지지 않는다.
  - `REVIEW_ARCHIVE_DIR` 상수도 함께 export한다(`cli.js`가 mkdir에 쓴다).
  - **퇴화 이름은 이름이 아니다** — `isDegenerateArchiveName(p)`를 함께 export한다
    (`undated` 또는 `nodigest`가 들어갔는지 판정하는 순수 술어). 이 함수는 순수성을 위해
    총함수로 남지만, 그 결과를 **쓸 수 있는 이름으로 취급하는 것은 caller의 몫이 아니다**:
    Task 2는 퇴화 이름을 보존 실패로 처리한다.

> **퇴화 fallback은 내용 파생이 아니므로 충돌한다** (R0 security/LOW + test/MEDIUM 흡수).
> `undated` · `nodigest`는 **내용과 무관한 상수**라, 둘 다 걸린 서로 다른 두 레코드는
> `plan-review-<slug>--undated--nodigest.md` 하나를 공유한다. Task 2 단계 2의 "이름이
> 내용 파생이므로 목적지가 같으면 바이트도 같다"는 근거가 그 경로에서만 거짓이 되고,
> 특례 분기가 없으면 **M9가 없애려는 유실이 아카이브 안에서 재현된다**. 그래서 순수
> 함수는 총함수로 두되(경로 빌더가 throw하면 계측이 게이트를 죽인다) **caller가 그
> 이름으로 쓰지 않는다** — 아래 Task 2가 그것을 보존 실패로 접는다.
- **Mirror**: `record.js`의 `sanitizeSlug` / `reviewRecordPath` — 같은 총함수 규약.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/plan-review-record.test.js`
  (순수성 케이스: 비문자열 · traversal · 빈 입력 전부 throw 없이
  `.claude/reviews/archive/` 안에 머문다)

> **파일명은 정체성이 아니다(UI4).** 이 이름에 milestone이나 라운드 번호를 넣지 않는다.
> A7이 실측한 함정이 정확히 그것이다 — `plan-review-impeccable-detection-contract.md`의
> 이름으로 receipt를 끌어오면 **다른 plan의 봉인**이 이 승인의 증거로 계수된다. 정체성은
> 레코드 안(`plan_path` · `reviewed_plan_hash` · `recorded_at`)에 있고, 파일명이 하는 일은
> **충돌하지 않는 것** 하나다. 파일명에 milestone을 넣으면 다음 도구가 그것을 읽고 싶어지고,
> 그 순간 A7을 다시 지불한다.

### Task 2: 덮어쓰기 전 보존 (`cmdRecord`)

- **Action**: `cmdRecord`의 실행 순서를 다음으로 바꾼다. **보존이 빌드보다 먼저**다 —
  그래야 보존 결과를 `extraDegradations`로 넘겨 **레코드 자신이 직전 레코드의 운명을
  기록**할 수 있다. 빌드 후에 보존하면 그 사실을 적을 자리가 사라진다.
  1. slug → canonical target 확정
  2. **보존은 이동이 아니라 복사다.** target이 존재하면 → 바이트를 읽어 sha256 계산 →
     stamp 결정(나가는 레코드의 `## Measurement` `recorded_at` → 파싱 실패 시 파일
     mtime → 그것도 실패 시 현재 시각) → `archiveRecordPath(...)`로 이름 도출 →
     **퇴화 이름이면 즉시 보존 실패**(Task 1) → 아카이브 디렉토리 `mkdir -p` →
     `copyFileSync`로 `<archive>/<name>.<pid>.<rand>.tmp`에 쓴 뒤 `renameSync`로 원자
     publish. **canonical은 이 단계에서 절대 삭제하지 않는다.**
     이름이 내용 파생이므로 목적지가 이미 있다면 바이트가 동일하다 — 덮어써도 무해하고
     그래서 특례 분기를 두지 않는다(퇴화 이름은 위에서 이미 걸러졌다).
  3. `buildReviewRecord(..., extraDegradations: [...보존 degradation])`
  4. `emitPanelFindings` (기존 위치 · 기존 의미 유지)
  5. canonical 쓰기 — **단, 2에서 보존이 실패했으면 쓰지 않는다.** 이때 **아무 곳에도
     쓰지 않는다**: canonical은 직전 레코드를 그대로 담고, 이번 실행의 레코드는 디스크에
     남지 않으며, loud degradation이 두 사실을 다 말한다. exit은 `EX_OK`.
  6. stdout에 `archivedPath`(없으면 `null`) 추가 — 기존 키는 그대로다(가산 변경).
- **Mirror**: `cli.js`의 DD6 주석 — I/O는 `cli.js`에, 순수 판정은 `record.js`에.
- **Validate**: Task 3의 T1 · T2 · T4가 이 순서를 직접 단언한다.

> **왜 rename이 아니라 copy인가 (R0 invariant/HIGH 흡수).** 초안은 `renameSync`로 옮긴 뒤
> canonical을 새로 썼다. 그 사이에서 write가 실패하면(EACCES · ENOSPC · 프로세스 kill)
> `.claude/reviews/plan-review-<slug>.md`가 **존재하지 않게 된다** — 기존 write는 실패 시
> 그냥 `EX_OK`로 반환하므로(`cli.js:1153-1160`) 그 소실이 조용하다. rename의 원자성은
> **단일 연산의 성질이지 2연산 시퀀스의 성질이 아니다**. 그리고 그 소실은 단순한 불편이
> 아니라 **앵커 소실**이다 — `approval-audit.js:385`의 앵커 해소와 `:588`의 열거가 모두
> canonical 경로를 먼저 보므로, PRD A1이 `unauditable`이라 부른 상태를 신규 코드가 만들게
> 된다.
>
> 복사는 그 창을 **없앤다**: 2단계가 끝난 시점에도 canonical은 여전히 존재하고, 5단계가
> 실패해도 canonical은 직전 레코드를 담은 채 남는다. 대가는 "복사 성공 + write 실패"에서
> 같은 바이트가 canonical과 아카이브에 동시에 존재하는 것인데, 이름이 내용 파생이라
> **다음 성공 실행이 같은 이름으로 다시 복사해 덮어쓰므로 자기 치유**한다(파일 수 불변).
> 앵커 소실과 일시적 중복은 같은 급의 사고가 아니다.
>
> **보존 실패 시 이번 레코드를 아카이브에 쓰지 않는 이유 (R0 architect/HIGH + test/HIGH
> 흡수).** 초안은 그 경우 이번 레코드를 `archiveRecordPath(...)`에 쓰라고 했는데, 그
> 목적지가 **방금 실패한 바로 그 디렉토리**다. T4가 구성하는 시나리오(아카이브 자리에
> 파일을 두어 mkdir 실패)에서는 그 write도 반드시 실패하므로 "이번 레코드가 유일 경로에
> 존재한다"는 어떤 구현으로도 만족될 수 없었다 — plan 내부 모순이고, M11이 유형화한
> 미탐 형태(`plan 내부 모순` 3건) 그대로다. 구현자는 그 test를 조용히 약화시켜 통과시키게
> 된다. 그래서 그 분기는 **아무것도 쓰지 않는다**로 접는다: 보존이 실패했다는 것은 그
> 디렉토리가 고장났다는 뜻이고, 그때 지켜야 할 것은 *이번* 레코드가 아니라 *이미 존재하는*
> 레코드다.

> **아카이브 목적지 경로는 `record.js`가 만든다 — `cli.js`에 인라인하지 마라**
> (R0 invariant/MEDIUM + test/MEDIUM 흡수). `c1-coverage-gate.js:35-38`의
> `APPROVED_SURFACE_WRITERS`에는 `record.js`와 `santa/seal.js`만 있고 `cli.js`는 **없다**.
> 그 게이트는 한 홉 taint다(`:104-130`): `path.join(root,'.claude','reviews',…)` 같은 RHS가
> 변수를 오염시키고, `TAINT_DEST_TARGET_RE`(`:73-75`)가 `copyFileSync(src, DEST)` ·
> `renameSync(src, DEST)`의 **목적지 변수**를 잡는다. cli.js가 오늘 통과하는 유일한 이유는
> 경로 리터럴이 `record.js` 안에 있기 때문이다.
>
> 따라서 구현 제약은 하나다: **목적지는 `record.js#archiveRecordPath`가 돌려준 문자열을
> `path.join(root, rel)`한 것이어야 하고, `cli.js` 안에서 `'.claude','reviews'`를 조립하면
> 안 된다.** 이 제약을 지키면 허용 목록을 넓힐 필요가 없다 — 넓히는 것은 초크 포인트를
> 늘리는 일이라 그 게이트의 주장 자체를 약화시킨다. Validation 11이 이것을 기계로 확인한다.

> **보존 실패 시 덮어쓰지 않는 것이 이 milestone 전체다.** 실패해도 덮어쓰면 남는 것은
> "가끔 보존되는 아카이브"이고, 가끔 보존되는 아카이브는 없는 것보다 나쁘다 — 코퍼스가
> 관측 부재와 보존 실패를 구분하지 못하게 되기 때문이다. `record`의 exit 0 계약은
> 유지된다: 실패는 게이트를 막지 않고, 시끄럽게 기록될 뿐이다.
>
> **보존을 끄는 토글은 만들지 않는다.** 보존을 끄는 스위치는 유실을 켜는 스위치다
> (§3.15 M2가 backlog 적재에 대해 세운 것과 같은 선).

### Task 3: 축적을 반증 가능하게 만드는 test

- **Action**: `plan-review-record.test.js`에 케이스를 추가한다. 모든 케이스는 tmp repo에서
  `runCli(['record', ...])`를 실제로 돌린다.
  - **T1 (변이 test)** — 2회 연속 record → canonical은 2회차, 아카이브는 정확히 1건이고
    그 바이트가 1회차 출력과 **완전히 같다**. 이 test는 반드시 **변경 전 코드에서 붉어야
    한다**(오늘은 아카이브가 0건). 그 실측 출력을 test 주석에 적는다 — 수정 전 실패를
    실측하지 않은 회귀 test는 인정하지 않는다는 것이 이 PRD의 Risks 행이다.
  - **T2** — 3회 → 아카이브 2건, 셋 다 서로 다르고 어느 것도 유실되지 않는다.
  - **T3** — 같은 바이트를 두 번 아카이브해도 파일이 늘지 않는다(이름이 내용 파생).
  - **T4 (핵심 불변식 — 보존 실패)** — 아카이브 디렉토리 자리에 **파일**을 만들어 mkdir을
    실패시킨다 → canonical이 **여전히 직전 바이트**이고 · **새 파일이 하나도 생기지 않으며**
    (`.claude/reviews/` 트리 전체 스냅샷 비교) · exit이 `EX_OK`이고 · degradation이 두
    사실(직전 레코드 유지 · 이번 레코드 미기록)을 다 말한다.
    이 단언은 이제 **도달 가능**하다 — 초안은 같은 시나리오에서 "이번 레코드가 유일 경로에
    존재"를 요구했는데 그 경로가 방금 실패한 디렉토리라 원리상 만족 불가였다(R0 HIGH 2건).
  - **T4b (핵심 불변식 — canonical 소실 없음)** — 아카이브 복사는 성공시키되 canonical
    write를 실패시킨다(canonical을 read-only로 만들거나 fs를 stub) → canonical이 **여전히
    존재**하고 그 바이트가 직전 레코드다. rename 기반 초안에서는 이 경로가 canonical을
    삭제했으므로, 이 test는 그 회귀를 영구히 막는 앵커다.
  - **T5** — `archiveRecordPath` 순수성: `../../etc/passwd` · `''` · `null` · 비-ISO stamp ·
    비-hex digest 어느 것도 throw하지 않고 결과가 `.claude/reviews/archive/`를 벗어나지 않는다.
  - **T5b (퇴화 이름 거부)** — stamp·digest가 모두 퇴화하는 입력에서 `archiveRecordPath`는
    이름을 돌려주지만 `isDegenerateArchiveName`이 `true`이고, `cmdRecord`는 그 이름으로
    **쓰지 않고 보존 실패로 접는다**. 즉 서로 다른 두 레코드가
    `--undated--nodigest.md` 하나를 두고 덮어쓰는 일이 일어나지 않는다.
  - **T6** — canonical이 패널 레코드가 **아닌** 손으로 쓴 문서여도 파괴하지 않고 아카이브한다
    (오늘은 조용히 파괴된다 — 이것도 변경 전 붉어야 한다).
  - **T7 (경로 작동)** — 같은 tmp repo에 `corpus.aggregate`를 돌려 `panel_records`가
    실행 횟수만큼 는다. 축적이 **존재**하는 것과 분석 도구가 그것을 **읽는** 것은 다른
    사실이고, T7이 후자를 단언한다.
- **Mirror**: `plan-review-record.test.js`의 tmp-repo + `runCli` 규약.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/plan-review-record.test.js`

### Task 4: 문서 (`docs/diverse-agent-review/record-accumulation.md`)

- **Action**: 이 PRD의 문서 규약(`approval-quality-audit.md` · `gate-wiring-oracle.md` ·
  `quorum-calibration.md`)을 따라 4절로 쓴다.
  1. **결함과 그 크기** — 레코드 56개 / 2회 이상 커밋된 것 10개 / 커밋된 덮어쓰기 23회.
     23이 **두 겹으로 하한**인 이유(한 커밋에 여러 실행이 접힘 · 미커밋 덮어쓰기 불가시).
  2. **계약** — canonical = 최신 1건 · archive = 모든 초과분, **바이트 동일**, 자동 정리 없음.
     보존 실패 시 덮어쓰지 않는다.
  3. **왜 이름을 바꾸지 않았는가** — canonical 경로에 의존하는 소비처 3곳을 파일:줄로 열거
     (`plugins/mccp/scripts/lib/msw-metrics/c1-coverage-gate.js:327` 역파생 ·
     `plugins/mccp/scripts/state/handoff-items.js:156` 정파생 포인터 ·
     `plugins/mccp/scripts/lib/review-single-pass.js:167` dispatch-log 결속). 그리고 A7.
  4. **주장하지 않는 것 / 런북** — 아래 절과 같은 목록 + milestone별 레코드 찾는 법
     (아카이브 파일들의 `plan_path` 필드를 grep) + 수동 정리 절차.
- **Validate**: 문서의 모든 수치가 Validation 8번의 재측정과 일치한다.

### Task 5: CLAUDE.md §3.12 포인터

- **Action**: §3.12(증거 내구성 계약)에 3~5줄. 담을 것은 셋뿐이다 — 리뷰 레코드는
  덮어쓰기 전에 `.claude/reviews/archive/`로 보존된다 · 아카이브는 **자동 정리하지 않는다**
  (정리 스위치 = 유실 스위치) · 상세는 Task 4 문서.
- **Mirror**: §3.12의 기존 문단 밀도 — 계약과 금지만, 구현 서술 없음.
- **Validate**: Validation 9번(instruction-contract lint).

### Task 6: version 4면 동기 + PRD/CHANGELOG

- **Action**: `plugin.json` `1.33.6 → 1.33.7` · `renderer/html.js` page-foot ·
  `renderer/markdown.js` derived 줄 · `CHANGELOG.md`의 `currently` 노트와 새 항목.
  PRD row #9을 `in-progress` + Plan 셀에 이 파일 경로.
- **Mirror**: §3.7 4면 동기 + 직전 항목(1.33.6)의 서술 형식.
- **Validate**: Validation 7번(4면 대조 + `i18n-surface.test.js`).

> **번호는 `/mccp:pr` 진입 직전에 다시 계산한다.** §3.7의 forward-only 상향은 이 저장소에서
> **8회** 재발했고 직전 사례(M5)가 바로 "머지 해소와 PR 진입 사이에 main이 번호를 발행한"
> 경우다. `1.33.7`은 작성 시점의 값이지 확정값이 아니다.

## Validation

```bash
# 1. 신규 + 기존 record test (T1·T6은 변경 전 코드에서 붉어야 한다 — 그 실측을 먼저 남긴다)
node --test plugins/mccp/scripts/lib/tests/plan-review-record.test.js

# 2. 게이트 배선 무손상 — plan-review + single-pass + verdict suite 전체
node --test plugins/mccp/scripts/lib/tests/plan-review-*.test.js \
            plugins/mccp/scripts/lib/tests/review-single-pass*.test.js \
            plugins/mccp/scripts/lib/tests/review-verdict*.test.js

# 3. 코퍼스 도구 무변경 + 상태 유지. 기준선은 실측이다(구현 전 캡처):
#    state=ok · panel_records=55 · sources=[.claude/reviews 76, .claude/reviews/archive 7]
#    구현 후 증가분은 이 사이클이 실제로 돌린 실행 수와 같아야 한다 — 그 외의 증가는 중복이다.
node plugins/mccp/scripts/lib/plan-review/corpus.js --json > /tmp/mccp-corpus.json
node -e "const j=require('/tmp/mccp-corpus.json'); if (j.state !== 'ok') { console.error('corpus state=' + j.state); process.exit(1); } console.log(j.coverage.panel_records, JSON.stringify(j.sources));"

# 4. M5 오라클 — seam lint green (본문 무변경이므로 반드시 green이어야 한다)
node plugins/mccp/scripts/lib/command-body/lint.js

# 5. 게이트 본문 diff 공집합 (빈 출력이 통과 — UI2의 유일한 기계적 증거)
git diff --stat origin/main...HEAD -- plugins/mccp/commands/

# 6. §3.5.1 — 이 브랜치가 삭제하는 파일이 없다 (빈 출력이 통과).
#    아카이브는 rename이 아니라 "canonical 수정 + 신규 파일 추가"로 커밋되므로
#    여기에 D가 잡히면 그것은 보존이 아니라 유실이다.
git diff --diff-filter=D --name-only origin/main...HEAD

# 7. version 4면 동기 — 3면이 plugin.json과 같은 값을 갖는지 기계로 대조
node -e "const fs=require('fs'); const v=require('./plugins/mccp/.claude-plugin/plugin.json').version; let bad=0; [['plugins/mccp/scripts/lib/renderer/html.js','page-foot'],['plugins/mccp/scripts/lib/renderer/markdown.js','derived'],['CHANGELOG.md','currently']].forEach(function(p){ if (!fs.readFileSync(p[0],'utf8').includes(v)) { console.error('version drift: ' + p[0] + ' lacks ' + v + ' (' + p[1] + ')'); bad=1; } }); process.exit(bad);"
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 8. 문서 수치 재측정 — Task 4가 인용한 56 / 10 / 23이 지금도 그 값인지 다시 잰다
tot=0; files=0; multi=0
for f in $(git ls-files .claude/reviews/ | grep '/plan-review-'); do
  n=$(git log --oneline -- "$f" | wc -l); files=$((files+1)); tot=$((tot+n-1))
  if [ "$n" -gt 1 ]; then multi=$((multi+1)); fi
done
echo "record files=$files  multi-commit=$multi  committed overwrites=$tot"

# 9. CLAUDE.md 상주 계약 (Task 5로 §3.12를 건드린 경우)
node plugins/mccp/scripts/lib/instruction-contract/lint.js \
  --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md

# 10. 라이브 완주 (UI9) — 단위 test가 아니라 실제 경로가 낸 산출물을 본다.
#     이 사이클 자신의 게이트 재실행이 그 산출물을 만든다: 아카이브에 slug
#     diverse-agent-review의 보존 레코드가 1건 이상 생기고, canonical은 최신 실행이다.
#     **개수만 출력하면 0건에서도 성공으로 읽힌다** — 임계 비교로 비영점 exit 한다.
n=$(ls -1 .claude/reviews/archive/plan-review-diverse-agent-review--*.md 2>/dev/null | wc -l)
echo "preserved records: $n"
[ "$n" -ge 1 ] || { echo "FAIL: 라이브 완주 산출물이 0건 — 경로가 돌지 않았다"; exit 1; }

# 11. finding 표면 writer 게이트 — M9는 `.claude/reviews/`에 신규 write verb를 추가하므로
#     이 게이트가 이 milestone의 직접 사거리 안이다. `cli.js`는 APPROVED_SURFACE_WRITERS에
#     없으므로(c1-coverage-gate.js:35-38), 목적지 경로를 cli.js 안에서 조립하면 붉어진다.
#     green이 곧 "경로 조립이 record.js에 남아 있다"의 기계적 증거다.
node plugins/mccp/scripts/lib/msw-metrics/c1-coverage-gate.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 보존이 실패했는데 덮어쓰기가 진행돼 유실이 남는다 | Low | Task 2 단계 5가 구조적으로 막고 T4가 그것을 단언한다. degradation은 레코드 본문에도 실린다(보존을 빌드보다 먼저 하는 이유) |
| 아카이브 파일명이 다음 도구의 정체성 앵커가 된다 | **Medium (실증 — A7)** | 이름에 milestone·라운드를 넣지 않는다. 문서 §3이 그 금지와 이유를 명시하고 소비처 3곳을 파일:줄로 열거해 이름 결속의 대가를 적어 둔다 |
| 코퍼스 수치가 커져 M8의 발행된 숫자와 어긋난다 | **High (의도된 결과)** | forward-only다(UI7). M8의 35건은 "결정당 1건"의 스냅샷이고 M9 이후는 "실행당 1건"이다. 소급 변경은 없다 — 과거 손실은 원리상 복구 불가(O3)이며 그 사실을 문서가 그대로 적는다 |
| 추적 파일이 실행마다 늘어 PR diff와 저장소가 커진다 | Medium | 레코드는 10~30KB 마크다운이고 §3.12가 이미 tracked 증거 코퍼스를 받아들인다. 자동 정리는 하지 않고(유실 스위치) 수동 런북만 문서화한다 |
| 한 worktree에서 `/mccp:plan` 두 개가 겹치면 아카이브가 엇갈린다 | Low | 새 결함이 아니다 — `REVIEW_DIR` 전체가 이미 singleton이라 동시 실행은 §3.8대로 worktree를 나눈다. 복사 후 tmp→`rename` publish가 원자적이라 이 축에서 **유실은 없고** 순서만 흔들린다 |
| 보존 실패 분기에서 canonical은 직전 실행을 담는데 `emitPanelFindings`는 이번 실행을 레지스트리에 append해, 레코드와 레지스트리가 다른 실행을 가리킨다 | **Medium (실증 — R0 invariant/MEDIUM)** | 흡수하지 않고 backlog 이연(§3.14 MEDIUM). 이 축은 M9가 만드는 것이 아니라 **드러내는** 것이다 — 오늘도 canonical write가 실패하면 같은 불일치가 생기고(`cli.js:1153-1160`), M9는 그 분기를 더 자주 도달 가능하게 만들 뿐이다. degradation이 stderr와 레코드 본문 양쪽에 남으므로 조용하지 않다 |
| 아카이브가 코퍼스에 섞여 `k_split` 전후 비교가 편향된다 — 아카이브로 밀리는 것은 구조적으로 '나중 라운드에 대체된' 레코드(대개 divergent)이고 시간상 split 이후에 몰린다 | **Medium (실증 — R0 invariant/MEDIUM)** | backlog 이연. Risks의 "수치가 커진다" 행은 **개수**만 다뤘고 이 행이 **분포**를 다룬다. `corpus.js`는 dedupe도 체제 태그도 갖지 않으므로(`:676-710`) M8 수치의 도구 재현성이 M9 이후 상실된다 — 그 복구는 코퍼스 도구에 체제 축을 넣는 별도 작업이다 |
| `plugins/mccp/commands/plan.md:1123`의 "writes the record, and always exits 0" 서술이 보존 실패 분기에서 부정확해지는데, 그 파일은 Files to Change에서 제외돼 고칠 경로가 없다 | Low (R0 architect/MEDIUM) | backlog 이연. `always exits 0`은 **여전히 참**이고(Task 2 단계 5가 `EX_OK`), 부정확해지는 것은 "writes"의 무조건성뿐이다. 본문을 건드리면 UI2의 유일한 기계적 증거(Validation 5 diff 공집합)를 잃으므로, 이 사이클에서는 정확성보다 그 증거를 택하고 그 선택을 여기 적는다 |
| `record`의 exit 0 계약이 새 I/O로 깨진다 | Low | 모든 신규 경로가 try/catch 안이고 실패는 degradation이다. T4가 실패 경로에서 `EX_OK`를 직접 단언한다 |
| `git diff --diff-filter=D`가 아카이브를 삭제로 잡아 §3.5.1 검사를 오염시킨다 | Low | canonical 경로는 같은 커밋에서 새 내용으로 다시 존재하므로 D가 아니라 M이다. Validation 6이 매 사이클 그것을 확인한다 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)
      — 확인 대상 산출물: `.claude/reviews/archive/plan-review-diverse-agent-review--*.md`가
      **1건 이상** 존재하고, 그 바이트가 이 사이클 직전 canonical과 동일하며,
      `.claude/reviews/plan-review-diverse-agent-review.md`가 최신 실행을 담는다.
      이 셋은 **이 브랜치 안에서** 관측된다 — 머지도 `claude plugin update`도 필요하지
      않다(UI8). 게이트가 `${CLAUDE_PLUGIN_ROOT}` 캐시를 부르므로 라이브 확인이 설치본을
      요구한다면, 대신 저장소 코드로 `node plugins/mccp/scripts/lib/plan-review/cli.js record
      --slug diverse-agent-review --plan <이 plan>`을 실제 저장소에서 2회 돌려 같은 세
      산출물을 확인한다(같은 코드 경로, 설치 의존 없음).
- [ ] T1·T6이 **변경 전 코드에서 실제로 붉은 것을 실측**했고 그 출력이 test 주석에 있다
- [ ] `plugins/mccp/commands/plan.md` diff가 공집합이다

## 주장하지 않는 것

- **과거 손실은 복구되지 않는다.** 23회의 덮어쓰기로 사라진 레코드는 원리상 복구 불가다
  (O3). M9는 forward-only이고, 문서는 그것을 "고쳤다"가 아니라 "여기서부터 쌓인다"로 적는다.
- **재실행 빈도나 수렴 속도를 측정하지 않는다.** 축적이 가능해질 뿐, 그 코퍼스로 무엇을
  판정할지는 별도 축이다. 여기서 비율을 내면 표본 1부터 시작하는 숫자를 발행하게 된다.
- **milestone 구분을 파일명에 넣지 않는다.** 구분은 레코드 안의 `plan_path` ·
  `reviewed_plan_hash`로 되고, 그것이 A7이 확정한 유일하게 안전한 결속이다.
- **어떤 CI·hook에도 등재되지 않는다.** §3.17이 `env-contract/lint.js`에 대해, #5가
  `command-body/lint.js`에 대해 이미 인정한 것과 같은 천장이다 — 강제 지점은 사이클의
  `## Validation`이다.
- **동시 실행을 지원하게 만들지 않는다.** 한 worktree의 병렬 `/mccp:plan`은 M9 전에도
  후에도 미지원이다(§3.8).
- **`record` 호출부를 늘리지 않는다.** 12개 호출부와 11개 halt stage는 그대로다.

## Design Critique

- detector: `design_signal=true` · `skill_available=true` · reason `ok` · call form `impeccable`
- 발화 사유: `Files to Change`가 `plugins/mccp/scripts/lib/renderer/html.js`와
  `renderer/markdown.js`를 담아 `DESIGN_SURFACE_PATHS` whitelist에 걸렸다.
- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` 4항 Read 완료.
- 라운드: 1 (`round=0`, cap 2) · verdict: **CONVERGED** (`decideCritique({findings:[],round:0,cap:2})`)
- findings: 0. 판정 근거를 앵커별로 적는다 — 이 milestone이 그 표면에서 바꾸는 것은
  **version 문자열 리터럴 두 개**뿐이고 구조·색·마커·목록 중 어느 것도 건드리지 않는다.

| Output Constraint | 이 변경에 대한 판정 |
|---|---|
| 정보 위계 3단계 (heading depth <= 3) | 영향 없음 — `<footer>` 안 문자열 치환. 신규 heading 0 |
| 강조색 화면당 1개 | 영향 없음 — color token 미변경 |
| raw markdown marker 금지 | 영향 없음 — `markdown.js`의 `_..._`는 markdown 표면(STATUS.md)의 정상 마크업이고 HTML로 새지 않는다. 형태 불변, 숫자만 바뀐다 |
| 한 화면 항목 수 상한 | 영향 없음 — list-of-N 섹션 미변경 |

> **plan 단계에서 impeccable 명령을 실제로 호출하지 않는다(§3.10).** 이 시점에는 렌더된 UI가
> 없고, 없는 화면에 대한 critique은 판정이 아니라 추측이다. 위 판정은 산출될 diff의 성질
> (문자열 리터럴 2개)에 대한 것이며, 렌더된 표면에 대한 실제 검사는 `/mccp:prp-implement`
> Phase 3.7의 produced-diff grounding lint(H15)가 소유한다.

## Design Routing Guide

routing mode: `auto` (effective at implement stage). plan 단계는 전 행 recommend이며 실제
라우팅은 implement에서 일어난다. 이 milestone의 rendering surface는 version 리터럴뿐이라
아래 대부분은 발화하지 않을 것으로 예상된다 — 표는 예측이 아니라 오라클 출력이다.

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

## Review Round 0 — L2 패널 판정과 triage

**verdict `divergent` · source `multi-agent` · quorum 4/3 응답 · 4 roles · passed=false ·
wall-clock 401,624 ms(6.7분, 차단 경로) · halt_stage `5.2e`.**
reviewed_plan_hash `sha256:43c2c867…` — 아래 흡수로 본문이 바뀌었으므로 그 해시는 이제
**이 본문을 가리키지 않는다**. 레코드는 `.claude/reviews/plan-review-diverse-agent-review.md`.

패널이 실재 결함을 찾았다. 특히 HIGH 2축은 **독립된 세 리뷰어가 같은 형태를 지목**했고,
그중 하나는 M11이 유형화한 미탐 형태(`plan 내부 모순`) 그대로였다.

| # | 관점/심각도 | 지적 | 처리 |
|---|---|---|---|
| 1 | architect·test / **HIGH** (security MEDIUM 중복) | T4가 구성하는 시나리오에서 Task 2 단계 5의 폴백 목적지도 반드시 실패하므로 "이번 레코드가 유일 경로에 존재"는 어떤 구현으로도 만족 불가 — plan 내부 모순 | **흡수** — 폴백을 없애고 "아무것도 쓰지 않는다"로 접음. T4를 도달 가능한 단언으로 재작성 |
| 2 | invariant / **HIGH** | rename→write 순서라 write 실패 시 canonical이 소실된다. 원자성은 단일 연산의 성질이지 2연산 시퀀스의 성질이 아니며, 결과는 `approval-audit` 앵커 소실(PRD A1의 `unauditable`) | **흡수** — rename을 **copy**로 교체해 창 자체를 제거. T4b 회귀 앵커 추가 |
| 3 | invariant·test / MEDIUM | `.claude/reviews/` writer 게이트(`c1-coverage-gate.js:35-38`)의 허용 목록에 `cli.js`가 없어, 목적지 경로를 cli.js에 인라인하면 게이트가 붉어진다 | **흡수**(구현 제약 + Validation 11) — 허용 목록을 넓히지 않고 경로 조립을 `record.js`에 유지 |
| 4 | test MEDIUM · security LOW | `undated`/`nodigest` 퇴화 이름은 내용 파생이 아니라 서로 다른 두 레코드가 한 파일을 덮어쓴다 | **흡수** — `isDegenerateArchiveName` + caller가 보존 실패로 접음. T5b 추가 |
| 5 | invariant / LOW | 아카이브는 `approval-audit`(비재귀 `REVIEW_DIR`) 사거리 밖이라 "자동으로 코퍼스가 된다"는 `corpus.js`에만 참 | **흡수**(Summary 정정) + 확장은 backlog |
| 6 | test / LOW | Validation 10이 개수만 출력하고 임계 비교가 없어 0건에서도 성공으로 읽힌다 | **흡수** — 비영점 exit 추가 |
| 7 | invariant / MEDIUM | 보존 실패 분기에서 레코드와 finding 레지스트리가 다른 실행을 가리킨다 | **이연**(§3.14) — backlog + Risks 행 |
| 8 | invariant / MEDIUM | 아카이브가 코퍼스에 섞여 `k_split` 전후 분포가 편향되고 M8 수치의 도구 재현성이 상실된다 | **이연** — backlog + Risks 행 |
| 9 | architect / MEDIUM → LOW | `plugins/mccp/commands/plan.md:1123`의 record 계약 서술이 보존 실패 분기에서 부정확해진다 | **이연** — `always exits 0`은 여전히 참이라 강등. 본문을 고치면 UI2 증거를 잃는다 |

> **라운드를 늘리지 않는다(§3.16 · UI10).** 캡은 1이고 R0에서 소진됐다. 위 흡수는 그 1라운드의
> triage 결과이며, 흡수 후 재리뷰가 아니라 진행이 기본이다. 이연 4건은 전부 증거와 함께
> [codex-findings-backlog.md](codex-findings-backlog.md)에 append됐다 — 조용히 버린 것은 없다.

> **이 레코드 자체가 M9의 문제를 실증한다.** 5.2e의 halt 기록은
> `.claude/reviews/plan-review-diverse-agent-review.md`를 **덮어썼다** — 그 파일이 직전에
> 담고 있던 것은 M5 사이클의 레코드였다. 즉 이 milestone은 자기가 고치려는 결함을 자기
> 승인 게이트에서 한 번 더 지불하면서 계획됐다.

## 게이트 상태와 진행 근거 (§3.16)

**이 plan에 대한 `mccp-plan-codex` receipt는 작성되지 않았다.** 게이트는 R0에서
`divergent`로 차단됐고(`decide` exit 12), 그 판정은 정직한 것이었다 — 지적 6건 중 2축이
실재 HIGH였고 전부 흡수됐다. 흡수로 본문이 바뀌었으므로 R0의 `reviewed_plan_hash`
`sha256:43c2c867…`는 더 이상 이 본문을 가리키지 않고, DD13 결속상 그 proof로 receipt를
봉인하는 것은 **불가능하며 시도해서도 안 된다**(리뷰어가 읽지 않은 본문에 대한 승인 주장이
된다). 현재 본문 해시는 여기 인용하지 않는다 — 해시를 본문에 적는 순간 그 값이 본문의
일부가 되어 스스로를 반증하므로, 그 자리에 적힌 어떤 값도 항상 stale이다(이 자리에 있던
`sha256:54b0b611…`가 실측 `sha256:0518e2d9…`와 어긋난 것이 그 증명이다). 확정 값은
`node plugins/mccp/scripts/receipt/cli.js hash-plan <이 파일>`로 그 시점에 잰다.

**두 번째 패널을 발화하지 않는다 — 다만 그것을 막는 것은 기계가 아니라 결정이다.**
이 자리에는 "라운드 원장이 `rounds_so_far=1 / cap=1`이라 `emit-workflow-args`가 기계적으로
거부한다"고 적혀 있었고, **거짓이다.** 원장은 `.claude/state/review-rounds/mccp-plan-codex__<slug>.json`으로
**슬러그별로 분리**되는데, R0는 PRD 경로로 호출돼 슬러그 `diverse-agent-review`에
기록됐고(`rounds_so_far=1`), 이 plan 경로로 호출하면 `derive-decision`이
`diverse-agent-review-m9`를 내며 그 원장은 **`rounds_so_far=0`** 이다(2026-09-01 실측).
즉 같은 결정에 대한 재리뷰가 인자를 바꾸는 것만으로 예산을 새로 받는다.

그러므로 재발화를 막는 근거는 캡이 아니라 §3.16과 UI10이다 — "고쳐야 할 것이 실재하면
고치되, 그 다음은 재리뷰가 아니라 진행이다". 운영자가 이 사이클에서 그 경로를 명시
확인했다(2026-09-01). 캡 구멍 자체는 M9 사거리 밖이라 backlog로 이연했다.

> 이 구멍은 M9의 논지와 **같은 형태**다 — 정체성을 내용이 아니라 *인자에서 파생된 이름*에
> 결속했기 때문에 생긴다. M9가 레코드 파일명에 대해 세우는 규칙(UI4: 이름은 정체성이
> 아니고 귀속은 해시가 한다)을 라운드 원장은 아직 따르지 않는다.

**따라서 진행 근거는 다음과 같이 기록된다.**

- 우회한 것: plan 게이트 receipt (미작성). 이 저장소는 `MCCP_RECEIPT_GATE_MODE=soft`
  opt-in이라 누락 receipt는 비-terminal 게이트를 통과한다 — **stale/blocking/critical은
  여전히 차단된다**(CLAUDE.md §1.2).
- 우회하지 않은 것: 리뷰 자체. 패널은 실제로 발화했고 판정은 `divergent` 그대로
  `.claude/reviews/plan-review-diverse-agent-review.md`에 봉인됐다. **승인으로 위장하지
  않았다** — cross-gate dedupe는 열리지 않으므로 terminal `/mccp:pr`에서 PR-Codex가
  반드시 발화한다.
- 유실한 것: 없다. 이연 4건은 전부 증거와 함께 backlog에 append됐다.
- 남는 위험: **수정된 본문(HIGH 2건의 설계 변경 포함)은 어떤 리뷰어도 읽지 않았다.**
  rename→copy는 설계 변경이고 그 변경 자체는 미검증이다. 그 검증은 이 사이클에서
  단위 test(T4·T4b·T5b)와 하류 게이트(implement-verify · PR-Codex)가 나눠 맡는다 —
  plan 리뷰가 아니라 **적용 후 결과**로 판단한다는 것이 §3.16의 취지 그대로다.

## Codex Implementation Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2) · `--impeccable-available` (design-scope preamble 적용)
- 라운드 수: 1 (`MCCP_GATE_ROUND_CAP=1`, 2.5.0에서 봉인 · `mode=enforce`)
- classification: `ok` · blocking: false · durationMs 60,456 · verdict source `structured`
- 합치 결론: **`divergent`** — Codex `result.verdict='needs-attention'`, HIGH 1건. 그 finding의
  중심 메커니즘 주장은 실측으로 반증됐으나 함정의 **형태**는 실재해 흡수했다.
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — 내용 파생 목적지가 이미 있을 때 publish가 Windows 재시도를 영구 실패에 가둔다 | HIGH | ACCEPT_NOW (부분) | "renameSync가 기존 파일 위에서 흔히 EEXIST/EPERM"은 **반증**(win32 Node v24.19.0 실측: 정상 파일 위 rename 성공). 그러나 read-only 목적지에서는 `EPERM` 실측되고, **이름이 내용 파생이라 재시도가 매번 같은 목적지를 겨냥**하므로 preserve 영구 실패 → canonical 영구 미갱신 형태는 실재. 멱등 short-circuit + tmp 보장 정리로 흡수 |

- Deferred to backlog: 0
- Open Questions: 없음 — F1이 R1 안에서 완전 해소돼 escalate 조건 (b)가 성립하지 않는다.
- Codex session 참조: threadId `01a05b67-7989-72e1-b7b5-e919e1d69ad7`

### F1 흡수의 실측 근거와 구현 변경

실측(win32, Node v24.19.0):

| 연산 | 결과 |
|---|---|
| `renameSync(tmp, 기존 정상 파일)` | **성공** (덮어씀) |
| `renameSync(tmp, 기존 read-only 파일)` | **실패 `EPERM`** |
| `copyFileSync(src, 기존 파일)` | 성공 |

따라서 plan Task 2 단계 2의 "덮어써도 무해하므로 특례 분기를 두지 않는다"는 **정상 경로에서는
참**이다. 거짓이 되는 것은 목적지가 read-only이거나 다른 프로세스가 잡고 있을 때이고, 그때
plan이 세운 "이름이 내용 파생"이라는 성질이 **불리하게 작용한다** — 재시도가 새 목적지를
고르지 않고 실패한 그 목적지를 영원히 다시 겨냥한다. Codex가 지목한 T4b 후속 경로가 정확히
그 형태다: 아카이브 성공 → canonical write 실패 → canonical은 직전 바이트 유지 → 다음 실행이
**같은 바이트에서 같은 stamp·digest**를 도출 → 같은 목적지 → publish 실패 → 보존 실패 규칙이
canonical write를 또 억제.

그래서 단계 2에 분기를 **하나** 더한다. plan 문면("특례 분기를 두지 않는다")을 따르지 않는
유일한 지점이며, 계약(canonical 무소실 · 보존 실패 시 무기록 · `EX_OK` · 이름은 내용 파생)은
전부 불변이다.

- **멱등 short-circuit** — 목적지가 이미 존재하고 그 바이트가 나가는 레코드와 **완전히 같으면**
  보존은 이미 끝난 것으로 보고 rename을 시도하지 않는다. 위 시나리오의 2회차가 여기서 성공으로
  빠져나가므로 canonical write가 진행되고 갇힘이 풀린다. 바이트 비교는 digest 12자(48비트)에
  기대던 가정을 **검사로 바꾼다** — plan의 "목적지가 같으면 바이트도 같다"가 근거였던 자리다.
- **tmp 보장 정리** — publish 실패·멱등 skip 어느 경로에서도 tmp를 unlink한다(best-effort).
  Codex 지적 중 조건 없이 유효한 부분이며, 없으면 실패마다 `.tmp`가 아카이브 디렉토리에 쌓인다.
- **바이트가 다른데 목적지가 존재하는 경우는 보존 실패로 접는다.** 이름이 내용 파생이므로 이
  분기는 digest 충돌에서만 도달하며 사실상 불가능하지만, 도달했다면 그것은 서로 다른 두
  레코드가 한 파일을 두고 다투는 상황이라 M9가 없애려는 유실 그 자체다 — 덮어쓰지 않는다.
- **T4c 추가** — 위 시나리오를 그대로 재현하는 회귀 앵커: 아카이브 성공 + canonical write 실패
  → 재실행 → canonical이 갱신되고 아카이브 파일이 **늘지 않는다**. Codex의 `next_steps`가 요구한
  "retry after partial success" 커버리지이며, T4b(canonical 무소실)와 축이 다르다.
