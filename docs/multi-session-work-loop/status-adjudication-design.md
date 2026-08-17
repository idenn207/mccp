# 진행 상태 기계 판정 (B1) — 설계

> multi-session-work-loop **M6**. 문서 status 와 **문서에서 파생되지 않은** 증거를
> 대조하는 판정 오라클, 그 독립성의 집행 구조, 그리고 **보증하지 않는 것**.
>
> 관련: [measurement-design.md](measurement-design.md) §B1 ·
> [measurement-instrumentation.md](measurement-instrumentation.md) ·
> [m6-assertion-manifest.json](m6-assertion-manifest.json) (아래 각 보증의 기계 대조본)

---

## 0. 무엇을 만들었나

`computeB1` 은 M2 이래 상수 `insufficient('independent evidence source unavailable')` 을
반환해 왔다. 그 결과 이 PRD 는 **자기 자신의 status drift 를 보지 못했다** — M2 행이
`complete` 인데 지표 산출은 0건이었고 사람이 손으로 찾아야 했다.

M6 이 만드는 것은 **판정과 가시화**다. 교정은 만들지 않는다.

핵심 결정 하나를 먼저 밝힌다: **문서를 증거의 투영으로 만들어 B1 을 닫지 않는다.**
status 를 자동으로 증거에 맞춰 써 넣으면 두 소스가 의존 관계가 되어 drift 가 구조적으로
0 이 되고, 계약의 무결성 검사(*"동일 소스 파생이면 그 주기의 B1 은 무효"*)에 의해 지표
자체가 무효가 된다. 0 이 된 숫자는 개선이 아니라 **측정의 파괴**다.

### 층 구조

| 층 | 모듈 | 책임 | I/O |
|---|---|---|---|
| 판정 | [b1-status-drift.js](../../plugins/mccp/scripts/lib/msw-metrics/b1-status-drift.js) | 순수 오라클. `evidence` → verdict | **없음** |
| 증거 구성 | [b1-evidence-builder.js](../../plugins/mccp/scripts/lib/msw-metrics/b1-evidence-builder.js) | **유일한** 증거 생산자 + **join key 정규화**(`resolvePlanReference`) | git only (`fs` 미사용) |
| 관측 | [milestone-evidence.js](../../plugins/mccp/scripts/derive/sources/milestone-evidence.js) | PRD 행 열거 + 분모 규약 + 대조 | fs + builder |
| 집행 | [b1-independence-lint.js](../../plugins/mccp/scripts/lib/msw-metrics/b1-independence-lint.js) | 위 경계의 **2차** 정적 통제 | 소스 스캔 |
| 소비 | `computeB1` · `renderer/sections/msw-metrics.js` · `archive-complete/scan.js` | 사다리 · 렌더 · 아카이브 힌트 | — |

---

## 1. 판정 사다리

오라클 시그니처는 **문서 status 를 받지 않는다**. 받을 수 없는 값에는 반응할 수 없다 —
이것이 독립성의 **1차** 통제다(lint 가 아니다, §4 참조).

```
adjudicateMilestone({ planBasename, planPath, evidence })
  → { verdict, source, evidence_ref, codex_verdict, reason }
```

`evidence` 는 **정확히 5필드**이며 여분 키도 누락도 거부한다.

| 필드 | 타입 | 의미 |
|---|---|---|
| `receiptPresent` | `boolean` | ship receipt 가 **커밋에 도달 가능**(`git cat-file -e HEAD:<path>`) |
| `receiptVerdict` | `string \| null` | `resolution.codex_verdict` 원문. **판정 미사용 · 병기 전용** |
| `gitReachable` | `boolean \| null` | plan 파일이 default branch 에 도달. `null` = 조회 실패 |
| `readError` | `string \| null` | 조회 중 오류. non-null 이면 `undetermined` |
| `duplicateKey` | `boolean` | `decision_id` 가 다른 행과 충돌 |

판정 순서(먼저 걸리는 것이 이긴다):

1. 스키마 위반 → `undetermined` (`evidence-schema-invalid`)
2. plan 링크 부재 → `undetermined` (`no-plan-link`)
3. `duplicateKey` → `undetermined` (`duplicate-decision-id`) — **receipt 조회보다 먼저**
4. `readError` → `undetermined` (`evidence-read-error`)
5. `receiptPresent` → **`shipped`**
6. `gitReachable === null` → `undetermined` (`git-query-failed`)
7. `gitReachable === true` → `undetermined` (`evidence-gap`) — plan 은 main 에 있는데 receipt 가 없다
8. 그 외 → **`not-shipped`**

### G1 — `shipped` 는 "PR 이 났는가" 이지 "Codex 가 승인했는가" 가 아니다

mccp 는 `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE` audited override 로 divergent 인 채
ship 하는 경로를 **정식으로** 갖는다 — 직전 M5 가 그 경로로 ship 됐다
(`pr_codex_force_override=true`). `codex_verdict` 를 ship 전제로 걸면 그런 행이 `shipped`
가 아니게 되어 **정상 ship 을 drift 로 오계상**한다.

ship 의 기계적 증거는 **receipt 의 존재 그 자체**다: terminal `/mccp:pr` 의 ship gate 는
no-ship 시 finalize 에서 `exit 12` 로 멈춰 receipt 를 쓰지 않으므로(§1.2 M3), git-tracked
ship receipt 가 있다는 것은 그 게이트를 통과했다는 뜻이다. `codex_verdict` 는 병기되어
감사에서 보이되 분자를 바꾸지 않는다(B3 `coReport` 병기 패턴).

> 대조: `B1-SHIPPED-ON-DIVERGENT`

### G2 — `receiptPresent` 는 **커밋 도달성**이다

`git cat-file -e HEAD:<path>` 의 성공 여부로만 판정한다.

- `fs.existsSync` 는 untracked 사본도 통과시킨다.
- `git ls-files --error-unmatch` 는 **index** 를 보므로 `git add` 만 하고 커밋하지 않은
  파일에도 exit 0 을 낸다(실측 확인). staged-only receipt 는 worktree 삭제와 함께
  사라지므로 §3.12 가 규정한 *"worktree 삭제 후에도 대조가 성립"* 을 만족하지 않는다.

`HEAD` 를 쓰고 default branch 를 쓰지 않는 이유는 여기서 묻는 것이 *"증거가 내구적인가"*
이지 *"머지됐는가"* 가 아니기 때문이다. plan 파일 도달성이 default-ref 를 쓰는 것은
**질문이 다르기** 때문이지 혼동이 아니다.

> 대조: `B1-GIT-TRACKED` · `B1-RECEIPT-COMMITTED`

### G3 — default-ref 는 `origin/HEAD` → `origin/main` → **조회 실패**

로컬 `HEAD` 로 폴백하지 **않는다**. 폴백하면 미머지 브랜치의 작업물이 "default branch 에
있다" 로 오판돼 `not-shipped` 방향의 drift 가 통째로 증발한다. 둘 다 실패하면
`gitReachable:null` → `undetermined` 다.

plan 파일이 정확 경로에서 안 보이면 **basename 으로 한 번 더** 본다 — 아카이브
chore(§3.11)가 plan 을 `.claude/PRPs/plans/archived/` 로 옮겨도 그 작업 단위가 default
branch 에 도달했다는 사실은 변하지 않는다. 이 fallback 이 없으면 아카이브가 지나간 모든
milestone 이 `not-shipped` 로 오계상된다 — 측정하려는 drift 가 아니라 링크의 낡음이다.

> 대조: `B1-GIT-FALLBACK`

### G4 — `decision_id` 충돌은 fail-closed이며 범위는 **전역**이다

`decision_id = planBasename - '.plan.md'` 에는 **PRD 성분이 없으므로** 서로 다른 두 PRD 가
같은 basename 을 선언해도 같은 receipt 를 가리킨다. 따라서 중복 검출은 활성 PRD **전체를
가로질러** 증거 조회 **이전에** 돌고, 충돌한 행 **전부**를 `undetermined` 로 강등한다.
첫 행/마지막 행 채택은 금지다 — 어느 쪽이 옳은지 증거가 말해주지 않으므로 임의 선택은
오판을 확정하는 것이다.

> 대조: `B1-DUP-DECISION` · `B1-EQ-BASENAME`

---

## 2. 분모 규약 — 두 종류의 미확정을 구분한다

| 축 | 필드 | 분모 |
|---|---|---|
| 문서 status 가 비정규 (`complete (조건 미충족: …)`) | `noncanonical_status_count` | **제외** — 비교할 좌변이 없다 |
| status 는 정규인데 증거가 `undetermined` | `undetermined_evidence_count` | **포함** — 좌변은 있고 우변을 못 구했다 |

증거 미확정을 분모에서 빼면 *"증거를 못 구할수록 분모가 줄어 drift 율이 좋아 보이는"*
경로가 열린다. 그래서 그 행은 **분모에는 있으나 분자에는 없다**. 이 비대칭이 정직한
표기다 — 대조 실패를 "일치" 로도 "불일치" 로도 세지 않으면서 커버리지 구멍은 분모 대비로
드러난다.

항등식 `raw_row_count = denominator + noncanonical_status_count` 를 source 가 자체 검증하고
어긋나면 `degraded:true` 로 올린다(archive-complete 버킷 합 등식 미러).

**drift 판정식**: `doc_status ∈ {complete, dropped}` ↔ `not-shipped` 이면 drift ·
`doc_status ∈ {pending, in-progress}` ↔ `shipped` 이면 drift · `undetermined` 는 어느 쪽도
아니다.

`computeB1` 사다리: `degraded || !independence_ok` → `invalid` · `denominator === 0` →
`insufficient` · 그 외 → `computed`(`numerator = drift_count`, **`value = null`**).
값에 비율을 넣지 않는 것이 계약이다(UI4 — 건수의 절대값, 목표 0건).

> 대조: `B1-LADDER-DEGRADED` · `B1-LADDER-INDEPENDENCE` · `B1-LADDER-EMPTY` · `B1-LADDER-COMPUTED`

---

## 3. 독립성의 논증

계약이 요구하는 것은 **verdict 의 독립**이지 identity 의 독립이 아니다. 증거 조회에 필요한
decision slug 는 PRD 행의 Plan 셀에서 오므로 *"문서 파생"* 이라는 반론이 가능하지만, 어느
milestone 인지 모르면 대조 자체가 불가능하다. 반증 가능하게 만드는 것은 **양방향** 단언이다:

- **증거층 불변** — status 를 프로그램적으로 뒤집어도 `(decision_id, evidence_verdict)` 쌍의
  집합이 **정확히 동일**해야 한다. 하나라도 달라지면 증거 판정이 문서에 의존한다.
- **판정층 가변** — 같은 변조에서 `drift_count`/`drift_items` 는 **반드시 반전**되어야 한다.
  이 단언이 없으면 상수를 반환하는 오라클도 위를 통과한다(무의미한 불변성).

판정층 단언은 **합성 fixture** 에서 돌린다. 실 PRD 의 행이 전부 `undetermined` 이거나
뒤집어도 drift 범주가 안 바뀌면 반전이 0건이라 test 가 **공허하게 통과**하기 때문이며,
fixture 가 실제로 ≥1 반전을 갖는지 test 가 먼저 단언한다(건전성 가드). 증거층 단언은 실
PRD 와 fixture **양쪽**에서 돈다.

> 대조: `B1-MUTATION-EVIDENCE` · `B1-MUTATION-DRIFT` · `B1-FIXTURE-SANITY`

### 생산자 유일성 — 오라클이 못 하는 검증의 대체

오라클은 순수 함수라 주입된 `receiptPresent` 의 **출처를 볼 수 없다**: `fs.existsSync` 도
`git cat-file` 도 똑같이 boolean 하나를 낸다. 런타임 검증이 원리상 불가능하므로, 대신
**다른 생산자가 존재하지 않게** 한다 — 증거 구성 I/O 를 `b1-evidence-builder.js` 단일
모듈로 뽑고, derive source 와 `archive-complete/scan.js` 가 **둘 다 그것만** 호출한다.
Task 1 이 오라클에서 I/O 를 없애 "몰래 PRD 를 읽는 구현" 을 불가능하게 만든 것과 같은
수법이다: 규율 대신 경로를 없앤다.

---

## 4. 정적 lint 는 **2차** 통제다

`b1-independence-lint.js` 4축:

| 축 | 대상 | 검사 |
|---|---|---|
| (i) | 오라클 · builder · source · `scan.js` 의 **drift 증거 구간** | `completion-ledger` require 0 |
| (ii) | **오라클 모듈만** | `fs`/`child_process` require 0 |
| (iii) | **오라클 모듈만** | 문서 status 리터럴 0 |
| (iv) | `scripts/` 전역 | `receiptPresent` 생성/대입이 builder 밖 0건 + builder 가 `cat-file` 을 **쓰고** `existsSync`/`ls-files` 를 **쓰지 않음** |

- (ii)·(iii)이 오라클 전용인 이유: builder 는 I/O 가 본업이라 같은 축으로 묶으면 존재할 수
  없다.
- `scan.js` 가 **구간** 대상인 이유: ledger 는 판정에서 내려왔지만 **참고 인용**으로는
  남으므로 module-level require 가 정당하다. 구간 마커
  (`b1-independence:region-start`/`-end`)가 없으면 그 자체를 위반으로 본다.
- (iv)가 **양성·음성 둘 다** 보는 이유: 출력 단언(test)은 *"이 구현이 틀렸다"* 를 잡지만
  *"이 구현이 맞다"* 를 증명하지 못한다 — 하드코딩 목록·캐시 조회 같은 제3의 구현도
  `false` 를 낼 수 있다. 명령 문자열을 정적으로 고정하면 그 간극이 닫힌다. test 는 출력을,
  lint 는 수단을 본다.
- lint 는 **주석을 보지 않는다**. 금지 패턴을 *설명하는* 주석에 걸리면 lint 가 문서화를
  벌하게 되고, 저자는 규칙을 설명하지 않는 쪽으로 학습한다.

음성 fixture 4종이 각각 비영점 exit 함을 test 가 단언한다 — 잡지 못하는 lint 는 통과 사실
자체가 무의미하다.

> 대조: `B1-LINT-NEG-LEDGER` · `B1-LINT-NEG-FS` · `B1-LINT-NEG-STATUS` · `B1-LINT-NEG-EVIDENCE-SOURCE`

---

## 5. 위협 모델

| 위협 | 통제 | 잔여 |
|---|---|---|
| 저자가 status 를 고쳐 drift 를 없앤다 | 없음 — **의도된 동작**이다. 문서를 고치는 것이 교정이고, 증거가 그것을 확인한다 | 증거 없이 고치면 반대 방향 drift 로 나타난다 |
| 구현이 status 를 몰래 읽어 verdict 를 맞춘다 | 오라클 타입 경계(1차) + lint 축 (ii)(iii)(2차) + 변조 불변성 test | 별칭 require·동적 require·이름 바꾼 status 전달은 **정적으로 안 잡힌다** |
| `fs.existsSync` 로 receipt 존재를 판정해 untracked 사본이 shipped 가 된다 | builder 단일 생산자 + lint 축 (iv) 양성/음성 + `B1-GIT-TRACKED` | 없음(경로가 하나뿐) |
| index 확인으로 staged-only receipt 가 shipped 가 된다 | `cat-file -e HEAD:` + `B1-RECEIPT-COMMITTED` | 없음 |
| 두 milestone 이 같은 basename 으로 verdict 를 복제 | 전역 중복 검출 → 전부 `undetermined` | 어느 행이 옳은지 **판정하지 않는다** |
| plan 링크가 `.plan.md` 가 아니어서 엉뚱한 receipt 를 조회 | join key 가드(`.plan.md` ∧ repo-root 앵커) → `no_plan` · builder 백스톱(미정규 입력은 조회 전 `readError`) | 링크가 낡았다는 사실은 B1 이 말하지 않는다 |
| 두 표면(대시보드 · `archive-complete`)이 같은 행에 다른 답을 낸다 | 오라클·builder **에 더해 join key 정규화까지** 단일 소유(`resolvePlanReference`) + 두 표면 실측 대조 0 divergence | 소비 방식의 차이는 남는다 — `archive-complete` 는 `shipped` 에서만 발화한다 |
| 로컬 `HEAD` 폴백으로 미머지 작업물이 default branch 로 오판 | 폴백 금지 + 호출 인자 단언 | 없음 |
| 감사 표본을 성의 없이 고른다 | 없음 | **명시 비보증** (§6) |

---

## 6. 보증하지 않는 것

- **문서 status 를 자동 교정하지 않는다.** 교정하면 두 소스가 의존 관계가 되어 지표가
  무효가 된다. 교정은 사람이 승인하는 기존 명령(`/mccp:dashboard-audit` ·
  `/mccp:archive-complete`)에 남는다.
- **receipt 가 유실된 과거 작업 단위는 `undetermined`** 이며 `not-shipped` 로 단정하지
  않는다. §3.12 이전 구간은 receipt 가 git-tracked 가 아니었다. 부재는 결함 부재가 아니다
  (`evidence-audit.js` E1 의 동형).
- **판정은 "PR 이 났는가" 이지 "milestone 이 잘 됐는가" 가 아니다.** 품질을 말하지 않는다.
- **`shipped` 는 승인 품질을 말하지 않는다.** audited override 로 divergent 인 채 ship 된
  작업 단위도 `shipped` 다. `codex_verdict` 병기가 그 사실을 감사에 남길 뿐이다.
- **정적 lint 는 독립성의 증명이 아니다.** 2차 통제이며 간접 의존(별칭 require · 동적
  `require(var)` · 호출자가 status 를 다른 이름으로 전달)을 잡지 못한다. **1차 통제는
  오라클의 타입 경계**다. 이 순서를 뒤집어 읽으면 없는 보증을 믿게 된다.
- **정적 lint 는 전이 의존을 추적하지 않는다** — 직접 require 만 본다. 오라클이 `scan.js`
  를 import 하지 않는 규율은 lint 가 아니라 **동치 test**(`B1-EQ-BASENAME`)가 지킨다.
- **lint 의 주석 제거기는 정규식 리터럴을 *추적한다*** — 다만 `regex` 와 나눗셈의 구별은
  직전 토큰 휴리스틱이라 완전하지 않다. 애매한 자리(`}` 뒤 등)는 **나눗셈으로 접는다**:
  그쪽이 보수적 방향이라 오판이 lint 를 *눈멀게* 하지 않고 기껏해야 정규식 안의 텍스트를
  코드로 보게 할 뿐이다. (초판은 정규식을 아예 추적하지 않으면서 "스캔 대상 4파일에 정규식
  안 `//`·`/*` 가 없다" 는 관측에 기댔다. 그것은 대상 파일이 바뀌면 **조용히 깨지는** 전제였고
  — 오라클에 `/https?:\/\//` 하나만 추가되면 그 줄부터가 주석으로 접혀 축 (ii)·(iii)가 통째로
  눈이 먼다 — 감사자가 눈머는 실패는 통과처럼 보이므로 local review L1 에서 닫았다.)
- **단언 대조기는 test 제목이 `test()` 호출의 인자로 실재하는지까지만 본다.** 그 test 가
  *무엇을 단언하는지* 는 보지 않는다 — 정적 대조로 답할 수 있는 질문이 아니다. 빈 body 의
  `test('B1-…: …', () => {})` 는 여전히 통과한다. (초판은 파일 전체 substring 이라 **주석 한
  줄로 필수 단언 전부를 "존재"** 하게 만들 수 있었고, 그 우회는 local review M3 에서 닫혔다.)
- **감사 표본의 수행 자체는 강제되지 않는다.** 강제되는 것은 (i) 기록 없이 완료를 주장하지
  못함, (ii) 기록된 불일치가 게이트를 통과하지 못함 두 가지까지다. 표본을 성의 없이 고르는
  것은 막지 못한다.
- **basename 충돌 행은 `undetermined`** 이며 어느 행이 옳은지 **판정하지 않는다**.
- **앵커 대조는 사후적이다.** Task 0 스냅샷 이후 Task 9 이전에 plan 이 편집되면
  `plan_file_hash` 불일치로 **차단은 되지만 예방은 되지 않는다**. 예방하려면 구현 기간 내내
  plan 을 동결해야 하는데, 구현 중 plan 정정은 정상 작업이라 동결이 더 나쁜 규칙이다.
  재측정으로 해소한다.
- **Task 0 재실행 여부는 기계적으로 탐지되지 않는다.** before 스냅샷은 in-place
  덮어쓰기이므로 재실행해 갱신된 앵커와 처음부터 그 값이었던 앵커는 **구별 불가능**하다.
  "재실행 사실을 보고서에 적는다" 는 **사람의 규율**이고 Validate 가 검사하지 않는다.
  세대별 스냅샷 보존으로 강제할 수는 있으나 그 기판이 M6 이 만드는 지표보다 커져 UI12(축
  최소화)에 정면으로 반한다.
- **`tracked_receipt_count` 로 아무것도 판정하지 않는다.** 앵커에 봉인만 하고 Validate 는
  읽지도 대조하지도 **않는다** — 사이클 중 새 ship 이 나면 정상적으로 늘어나므로 일치를
  요구하면 정상 동작이 차단된다. 소비처는 구현 보고서이며, 읽을거리는 값이 아니라 변화량이다.
- **drift 를 0 으로 만들지 않는다.** M6 의 완료 판정은 `computed` 전환이지 목표치 달성이
  아니다. `drift_count > 0` 은 지표가 **작동한다는 증거**이지 실패가 아니다.

---

## 7. 렌더 표면

B1 은 **건수**로 렌더된다(`5건`). 증거 미확정 행이 있으면 값 옆에 커버리지 단서를 붙인다
(`5건 (대조 6/39)`) — 맨 `0건` 은 "drift 없음" 으로 읽히지만 실제로는 "대조한 범위에서
0건" 이고, 그 둘은 다른 진술이다.

drift 상세는 **기존** 공유 collapse(`<details class="msw-metrics-extra">`) 안의
`<p class="muted">` 한 줄이다. 새 collapse 를 열지 않는다 — `decisionPriority` 상 B1 이
`computed` ∧ `numerator===0` 이면 우선순위 2라 `extraRows` 로 밀리고, 그 안에서 또
collapse 를 열면 **2단 중첩 disclosure** 가 되어 Output Constraint 4 와 PRODUCT.md 원칙 3
("quiet by default, loud on demand")이 둘 다 거부하는 형태가 된다. 상위 3건 + `(+N건)`
절삭 병기로 상한을 지키되 절삭은 **항상 보인다**.

drift 전용 accent 토큰을 신설하지 않고 행의 기존 `STATUS_META` 클래스를 재사용한다.
milestone 이름은 PRD 표 셀에서 그대로 오고 그 셀은 관례상 볼드 마커를 포함하므로, HTML
면의 마커 누출은 `renderProseHtml`(H10 em-dash + H16 인라인 마커 정규화)이 닫는다.
markdown 면은 자기 마커가 정당하므로 H10 만 적용한다.

detector 미설치 환경에서도 4개 제약 중 3개가 게이트로 남도록, detector 에 의존하지 않는
단언을 `msw-metrics-render.test.js` 에 둔다.

> 대조: `B1-RENDER-CONSTRAINTS`

---

## 8. `archive-complete` 와의 단일 오라클

`collectDriftEvidence` 의 **판정 축**을 같은 오라클로 교체했다. 이전에는 ledger 를 강증거로
먼저 보고 `fs.existsSync` 로 receipt 존재를 판정해, 대시보드와 이 명령이 **서로 다른
오라클로 같은 질문에 답하는** 상태였다. ledger 는 이제 참고 인용으로만 병기되고
`driftSuspect` 를 결정하지 않는다(UI3).

실패는 **fail-closed** 다. 이전 구현은 `catch` 에서 `driftSuspect:false` 를 돌려 오라클
예외가 "drift 없음" 으로 읽혔다. 이제 `evidence_verdict:'undetermined'` 를 싣고 `scan()` 이
`warnings` → `degraded:true` 로 올린다.

`isArchivable`(C2·C3·C4 fail-closed 등식)과 `classifyMilestones` 는 **무변경**이다.

### 오라클 공유만으로는 부족했다 (local review H2)

초판은 오라클과 builder 를 공유하되 **입력** 은 각자 만들었다 — 이 경로는 `classifyMilestones`
의 원문 plan 셀을 그대로 넘겼고 derive source 만 join key 를 정규화했다. 그 비대칭이 실측으로
**같은 39행 중 5행에서 두 표면의 판정을 갈랐다**: 자식 PRD 링크를 문 4행이 여기서
`not-shipped` 로 확정됐고(derive 는 `undetermined`), PRD 기준 상대 경로 1행은 `../plans/…`
가 그대로 git pathspec 이 되어 조회가 깨졌다.

교훈은 `receiptPresent` 때와 **같다**: 판정을 공유해도 *입력* 을 공유하지 않으면 두 표면은
같은 질문에 다른 답을 낸다. 그래서 `resolvePlanReference` 도 builder 로 올려 단일 소유로
만들고, 그 위에 **builder 백스톱**(미정규 입력은 git 조회 전에 `readError` 로 접힘)을 두었다 —
호출자가 규율을 잊어도 *적극적 오판*(`not-shipped`)만은 구조적으로 나올 수 없다. 규율은 기계
장치가 아니다.

같은 라운드에서 git 배관(default ref 해석 · plan index 구축)도 **스캔당 1회**로 hoist 했다.
행마다 재실행하던 초판은 실측 862ms → 3,201ms 였고, hoist 후 481ms 다. builder 는 처음부터
두 값을 주입받는 seam 을 갖고 있었고 derive source 는 그것을 쓰고 있었다 — 이 호출자만 쓰지
않았다. 배관은 **lazy** 라 판정할 행이 없으면 git 을 아예 부르지 않는다.

> 대조: `B1-ARCHIVE-DEGRADED` · `B1-ARCHIVE-INVARIANT` · `B1-ARCHIVE-JOINKEY` ·
> `B1-ARCHIVE-JOINKEY-REL` · `B1-ARCHIVE-DUPKEY` · `B1-ARCHIVE-PLUMBING` · `B1-ARCHIVE-NOGIT`

---

## 9. 단언 ↔ test 의 기계 대조

Validation 은 `node --test <디렉토리>` 라 *"돌린 test 가 통과했다"* 만 말하고 *"요구한
test 가 있다"* 는 말하지 않는다. [m6-assertion-manifest.json](m6-assertion-manifest.json) 이
그 간극을 닫는다 — `assertion-manifest-check.js` 가 `REQUIRED_IDS` **28종**(초판 21 + local
review 흡수 7)을 하드코딩하고, (1) manifest 가 그것을 전부 담는지 (2) 각 `test_title` 이
`test_file` 에 실재하는지를 서로 다른 실패로 구분해 열거한 뒤 비영점 exit 한다. manifest 에서
id 를 빼는 것으로 우회할 수 없다. `REQUIRED_IDS` 는 **하한이지 상한이 아니다** — 구현 중
닫힌 축은 여기에 추가돼 게이트가 된다(흡수 7종이 그 경로로 들어왔다).

실재 판정은 **`test()` 호출 앵커** 기준이다. 초판은 파일 전체 substring 이라 주석 한 줄로
필수 단언 전부를 "존재" 하게 만들 수 있었다 — 그 우회가 열려 있으면 이 대조기가 게이트화한
나머지 Acceptance 항목도 함께 무력해진다(local review M3). 다만 앵커는 *제목이 실재한다*
까지만 말하고 *그 test 가 무엇을 단언하는지* 는 말하지 않는다(§6).

대조기 자신도 test 된다(`assertion-manifest-check.test.js`) — `echo ok && exit 0` 짜리
대조기가 위 모든 것을 무력화하는 것이 이 축의 급소이기 때문이다. 그 test 는 manifest 에
넣지 **않는다**: 자기 참조 순환이 되고, 대조기가 죽으면 그 사실도 못 잡는다.
