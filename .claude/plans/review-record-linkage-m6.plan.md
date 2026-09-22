# Plan: review-record-linkage M6 — deferred-ledger-closure

**Source PRD**: `.claude/prds/review-record-linkage.prd.md`
**Selected Milestone**: 6 — deferred-ledger-closure
**Complexity**: Medium

## Summary

M6는 이 PRD가 남긴 원장을 판정한다. 경계 `c9c8d22`에서 실측한 판정 대상은 backlog 131행 ·
fix-task escalation 1건 · PRD Open Questions 5건이고, 각 항목이 **정확히 하나의 명시 판정과
근거**를 받는다. 판정은 C11 `closure-accounting`의 레코드 형태·식별자·**수용 술어**로 기록되며,
M6 자신의 봉인에 대해 `validateDisposition` 을 완전히 통과한다. 재봉인 시 재작성이 필요한 것은
결속 축 2개(`inventory_sha256` · `deferred` 의 successor 본문 sha)뿐이다 — 재판정은 필요 없다.

새 파서 모듈은 만들지 않는다 — PRD가 코드 변경을 §3.14 임계 흡수분으로 한정했고, 분모의
정의는 이미 `debt-inventory.js`가 소유한다. backlog 표에는 열을 추가하지 않는다.

**2026-09-22 개정 — 순서와 경계가 바뀌었다.** M7(라이브 발화)이 M6 구현보다 **먼저** 완주한다
(DD13). OQ5 판정과 PRD의 M7 행 갱신이 M7의 실값(`--check-live-linkage` 종료코드)을 입력으로
받기 때문이다. 그래서 분모의 경계도 `c9c8d22` 고정에서 **구현 시점에 M7 브랜치를 병합한 뒤의
HEAD**로 옮긴다(DD8 개정) — 그래야 이 PRD의 마지막 사이클이 남긴 원장 행까지 판정된다.
아래 본문의 수치(131 · 132 · FAIL 17 · 114 · findings 215 · 347)는 `c9c8d22`에서의 **참고
실측**이고, 확정값은 Task 0이 새 경계에서 다시 잰다. 사람이 필요했던 결정 — 판정의 검토 ·
Open Questions 판정 · 게이트 이탈 — 은 Fable × Codex 이중 리뷰(HSR)가 대신한다(DD15). 절차는
M7 plan DD11이 소유하고 이 plan은 판정점의 선택지만 더한다. 실행 순서는 `## 실행 런북`이
소유한다. 이 개정 자체도 HSR이 검토했다 — 판정점 `P0`는 `object`였고 제안했던 M6 plan
재게이트(`P0-M6CAP`)는 `halt`로 판정돼 철회했다(DD14).

**현재 상태: 구현 착수 불가 — 사람 판정 H1 대기 (2026-09-22).** HSR `P1`의 두 리뷰어가 보였듯
plan receipt가 없으면 M6는 **구현 진입부터** 막혔다(DD14 정정). 그 판정 H2는 사람이 내렸다 —
비승인 `divergent` receipt를 audited override로 발행했다(DD14 H2). 남은 것은 H1이다: M7은
`P1-M7PATH` = `halt`로 ship 경로가 정해지지 않았다(DD13). `## 실행 런북`은 H1 뒤에 실행된다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 이 마일스톤의 decision slug 는 review-record-linkage-m6 이다 | constraint |
| UI2 | backlog 판정 범위는 M5 의 73행 스냅샷이 아니라 현재 전량 재측정 결과다 | direction |
| UI3 | 측정 전에 origin/main 을 병합해 최신 코드 위에서 잰다 | constraint |
| UI4 | 작업 브랜치는 m7b 가 아니라 이 마일스톤 전용 브랜치여야 한다 | constraint |
| UI5 | 과거 ship receipt 는 소급 재봉인하지 않고 사이드카도 만들지 않는다 | exclusion |
| UI6 | 계측 정의는 산문이 아니라 파서 코드가 소유한다 | constraint |
| UI7 | 코드 변경은 HIGH 와 CRITICAL 흡수분에 한정한다 | constraint |
| UI8 | backlog 표에 상태 열을 추가하지 않는다 | exclusion |
| UI9 | 리뷰 품질 향상과 리뷰어 변경과 새 게이트 추가는 이 PRD 밖이다 | exclusion |
| UI10 | 각 항목은 해소 이연 무효 중 하나로 명시 판정되고 근거가 파일에 남는다 | direction |
| UI11 | 사람이 필요한 답변과 검토는 fable 과 codex 의 이중 리뷰로 대체한다 (2026-09-22) | direction |
| UI12 | M6 와 M7 이 둘 다 complete 될 수 있는 경로를 이 plan 이 설계한다 (2026-09-22) | direction |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 판정 레코드 | `docs/multi-session-work-loop/debt-dispositions.jsonl` | 한 줄이 한 판정 — item_id · disposition · evidence · successor · duplicate_of · note · inventory_sha256 · disposed_at |
| 내용 주소 신원 | `plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js:170` | 행을 줄번호가 아니라 `backlog:<hash>`로 식별해 파일이 자라도 신원이 흔들리지 않음 |
| 수용 술어 | `plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js:507` | 판정 유효성을 저자가 재정의하지 않고 `validateDisposition` 을 그대로 호출 |
| 분류 서술 | `docs/review-record-linkage/deferred-triage.md` | 세는 규칙을 먼저 못박고, 자기 이전 수치의 오류를 지우지 않고 정정 |
| 동결 보고 | `docs/review-record-linkage/frozen-baseline.md` | 경계 이전은 개선 대상이 아니라 기준선으로 보고 |
| 스냅샷 산출물 | `.claude/_meta/data/2026-09-08-closure-baseline.json` | 재현 command 를 산출물 안에 동봉 |
| 마일스톤 종결 | `.claude/milestone-closures/review-record-linkage-m4.md` | `/mccp:milestone-close` 산출 형식 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `docs/review-record-linkage/closure-inventory.json` | CREATE | 경계 OID에서 뽑은 판정 분모 스냅샷 + 재현 command |
| `docs/review-record-linkage/closure-dispositions.jsonl` | CREATE | 항목별 판정 — C11 레코드 형태, C11 item_id |
| `docs/review-record-linkage/closure.md` | CREATE | 판정 근거 서술 · 3분할 보고 · Open Questions 5건 · fix-task 1건 |
| `docs/review-record-linkage/deferred-triage.md` | UPDATE | M5의 73행 스냅샷과 M6 재측정(131)의 관계를 정정 |
| `.claude/prds/review-record-linkage.prd.md` | UPDATE | M6 status · Open Questions 판정 · 재측정 note |
| `CHANGELOG.md` | UPDATE | Unreleased 항목 |
| `docs/review-record-linkage/frozen-baseline.md` | UPDATE | M7 라이브 실값 — ship 이후에만 존재하는 값이라 M7 브랜치가 운반할 수 없다 (Task 7). 동결 블록은 바이트 불변 |
| `.claude/PRPs/reports/review-record-linkage-m7-report.md` | UPDATE | M7 완주 실값과 완주 경로(헤드리스 `--plugin-dir` 하위 세션) (Task 7) |
| `docs/review-record-linkage/hsr-decisions.jsonl` | UPDATE | HSR 판정 기록 (DD15). plan 단계의 P0가 만들었으므로 CREATE가 아니다 |

§3.14 흡수가 필요한 항목이 나오면 그 대상 파일은 Task 5가 확정하고 보고서에 열거한다. 이 표에
미리 적지 않는 이유는 판정 전에는 대상이 없기 때문이고, 없는 파일을 적으면 L1 C3가 옳게 막는다.

## Design Decisions

**DD1 — 판정을 C11의 `debt-dispositions.jsonl`에 직접 쓰지 않는다.** 기계로 확인했다: 이 PRD
귀속 backlog 131행이 **전부** 봉인 분모(1115) 밖이고, `appendDispositions`가 봉인 인덱스에 없는
item_id를 all-or-nothing으로 거부한다(`plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js:495`).
재봉인 경로는 C11 M2가 소유하며 `pending`이다. 그래서 M6는 같은 레코드 형태로 자기 파일에 쓴다.
두 번째 원장을 만드는 것이 아니라, **한 원장에 넣을 수 없는 동안 같은 모양으로 대기시키는 것**이다.

**DD2 — 식별자는 이관되지만 결속 필드는 재작성된다. "재키잉 없이 흡수"는 거짓이다.**
R0 패널 4관점 전원이 이 축을 지목했고 인용을 직접 열어 확인했다 — 옳다. 정확한 사실은 셋이다:
(a) writer 가 `inventory_sha256: doc.inventory_sha256` 을 스탬프하고
(`plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js:544`), (b) `verify` 는 그 값이 봉인
문서와 다른 줄을 `boundMismatch` 로 떨궈내며 fold 에서도 제외한다(`:597` · `:607`), (c)
`deferred` 의 `successor` 는 **그 파일 본문이 봉인 sha 문자열을 담아야** 통과한다(`:484`).
미래의 재봉인 해시를 미리 적는 것은 원리상 불가능하다.

따라서 이 plan 이 주장하는 것은 **약한 명제**로 좁혀진다: **판정의 내용**(`item_id` ·
`disposition` · `evidence` · `duplicate_of` · `note`)은 그대로 이관되고, **결속 축 2개**
(`inventory_sha256` · `deferred` 의 `successor` 본문 sha)는 재봉인 주체가 재작성한다. 이관
비용은 재판정이 아니라 **필드 재작성 131행**이고, 그 작업은 C11 M2 소유다. 초판의
"재키잉이 필요 없다"는 문장은 item_id 축만 보고 결속 축을 보지 않은 오류였다.

**DD3 — 새 파서 모듈을 만들지 않는다(UI7).** 분모의 정의는 이미 출시된 `debt-inventory.js`가
소유하고, M6는 그 API를 **산출물에 동봉된 재실행 가능 명령**으로 호출한다. C11 자신이
`2026-09-08-closure-baseline.json`으로 같은 패턴을 썼다. M6는 일회성 종결이지 상시 계기가
아니므로(상시 계기는 C11 소유) 새 상주 코드가 필요 없다.

**DD4 — 판정 enum은 C11의 6종을 쓴다** — `fixed` · `obsolete` · `superseded` · `duplicate` ·
`rejected` · `deferred`. PRD의 3분류는 그 위의 집계 축으로 **정의**한다: 해소 = `fixed`,
이연 = `deferred`, 무효 = `obsolete`·`superseded`·`duplicate`·`rejected`. 3종 enum을 새로 만들면
이관 시 매핑이 필요해지고, 그 매핑을 검증하는 것은 아무것도 없다.

**DD5 — `deferred`를 종결로 접지 않는다.** C11 결정 2가 정확히 이것을 금지한다(오늘 봉인 원장
1115건 중 983건이 `deferred`다). `closure.md`는 해소·이연·무효를 항상 나란히 적고 합계 하나로
"종결률"을 만들지 않는다. M6가 낼 `fixed` 수가 작을 것을 미리 인정한다 — backlog란 원래 그렇다.

**DD6 — `findings` 원장 215건은 M6 범위 밖이다.** PRD의 M6 행이 명명한 것은 backlog ·
Open Questions · fix-task 셋이다. 제외를 **수치와 함께** 기록한다(귀속 총 347 중 findings 215) —
조용히 빼면 M5가 정정한 79와 같은 종류의 수치가 하나 더 생긴다.

**DD7 — FAIL 17행은 개별 판정하지 않고 일괄 `rejected`한다.** M5가 이미 증거로 적었다:
`quorum.js`가 bare `verdict='fail'`을 합성한 것이라 개별 판정은 같은 지적을 두 번 세는 것이다.
§3.14 해제 조건이 충족되면 그때 일괄 정리한다. M5는 14행이라 적었고 지금은 17행이다 — M7
사이클이 3행을 더 낳았다.

**DD8 — 경계는 고정 OID 하나다 (2026-09-22 개정: 어느 OID인가).** 원리 — 모든 수치를 한
트리에서 읽는다 — 는 그대로다. C11 PRD가 자기 Evidence 절에서 실증했듯(2487 → 2504 → 2514) 이
값은 한 사이클 안에서도 움직이므로, 경계를 고정하지 않으면 acceptance가 재현되지 않는다.

바뀐 것은 **값**이다. 초판은 `c9c8d22`(plan 작성 시점의 HEAD)였는데, M7이 M6 구현보다 먼저
완주하게 되면서(DD13) 그 값은 이 PRD의 마지막 사이클(M7 ship 구간)이 남긴
행을 빠뜨린다. UI3("측정 전에 origin/main을 병합해 최신 코드 위에서 잰다")도 측정 시점의
최신을 뜻한다. 그래서 경계는 **런북 B0 직후의 HEAD**(M7 브랜치와 origin/main을 병합한 커밋)이고,
Task 0이 그 OID를 `closure-inventory.json`의 `boundary_oid`에 봉인한다.

경계를 산출물이 선언하면 자기참조가 되므로(DD10이 닫은 형태) 검사 0이 **구현 시점의 HEAD와
같은지**를 본다. 구현(런북 B1)은 커밋하지 않으므로 그 시점의 HEAD가 곧 B0 직후의 커밋이다.
초판 개정은 "m7b tip ≤ 경계 ≤ HEAD" 범위 조건이었는데, HSR P0의 두 리뷰어가 그 범위 안의 옛
커밋을 골라 최근 행을 빼는 반례를 보였다(Codex HIGH · Fable HIGH) — 범위는 선택을 막지 못한다.
동등 조건은 그 창을 없앤다. 대가는 재검증 시점이다: 검사 0은 B1 안에서만 판정되고, 그 뒤의
재검증은 검사 1의 재계산이 맡으며 "그때 최신이었는가"는 B1의 출력이 보고서에 인용되는 것으로만
남는다. 로컬 브랜치 ref에 기대지 않으므로 M7 브랜치가 지워진 클론에서도 성립한다.
"구현은 커밋하지 않는다"도 산문으로 두지 않는다(P1 Fable HIGH — 하위 세션이 행을 지운 커밋을
올린 뒤 그 HEAD를 경계로 봉인하면 동등 조건이 무력해진다): B1 하위 세션의 deny 목록에
`Bash(git commit:*)`를 더하고, B2가 `boundary_oid`를 오케스트레이터가 B0 직후 기록한 OID와 대조한다.
`c9c8d22`는 참고 실측의 출처로만 남는다.


**DD9 — 원장은 C11 자신의 수용 술어로 검증한다.** 패널이 옳게 지적했듯 C11 의 수용 규칙은
enum 멤버십이 아니라 `validateDisposition` 이고(`debt-inventory.js:507-516`), `appendDispositions`
는 한 줄만 미달해도 **전량 거부**한다(`:551-555`). enum + `note` 길이만 보는 검사는 131행을
전부 green 으로 통과시키고 흡수 시점에 통째로 튕기게 만든다. 그래서 Validation 이 `di.validateDisposition`
을 직접 호출한다(`:907` 로 export 돼 있다). 이때 `inventorySha` 로 **M6 자신의 봉인 sha** 를
넘기므로, `deferred` 의 successor 문서가 M6 의 sha 를 본문에 담으면 그 축까지 실제로 통과한다 —
즉 원장은 **자기 봉인에 대해 완전히 유효**하고, 재봉인 시 바뀌는 것은 DD2 가 명시한 두 필드뿐이다.
결과적으로 `deferred` 는 `successor` 필수, 나머지 4종은 `classifyEvidence(..., allowBarePath:false)`
를 통과하는 `evidence` 필수, `duplicate` 는 `duplicate_of` 필수다.

**DD10 — 분모는 고정 OID 에서 재계산해 대조한다.** 초판의 검사 1은 `console.log` 뿐이라 어떤
입력에도 exit 0 이었고 `process.cwd()` 의 현재 트리를 읽었다. 그러면 저자가 131행 중 20행만 담은
inventory 를 써도 커버리지가 100% 로 보고된다 — 실패 방향이 over-permissive 다. 고쳐서
`git show <OID>` 로 고정 트리를 읽어 `inventoryHash` 를 재계산하고 산출물의 `inventory_sha256`
및 항목 수와 **비교해 비영점 exit** 한다.

**DD11 — 분모의 원소는 `backlog` 와 `fix-task` 둘 다이고, Open Questions 는 원장에 들어가지 않는다.**
초판은 분모를 `source==='backlog'` 로 뽑으면서 acceptance 로 fix-task 1건의 판정을 요구해,
그 레코드를 같은 JSONL 에 쓰면 커버리지 검사가 `extra≥1` 로 실패하는 자기모순이었다. 분모를
두 source 로 넓혀 해소한다(131 + 1 = **132**). Open Questions 5건은 inventory 의 원소가 아니므로
(세 원장 어디에도 없다) PRD 본문에서 판정하고 JSONL 에는 넣지 않는다 — 넣으면 C11 이 모르는
item_id 가 생겨 흡수가 영구히 불가능해진다.

**DD12 — 행과 item 은 같은 수가 아닐 수 있다.** `buildInventory` 는 byte-identical 행을 한
item_id 로 접고 그 사실을 `identical_rows_collapsed` 로만 센다(`debt-inventory.js:326-335`,
주석이 백로그가 실제로 그런 행을 담는다고 명시). 그래서 이 plan 은 **item 을 회계 단위로 고정**하고
"행" 이라는 말을 수치에 쓰지 않는다. 접힘이 실제로 일어났는지는 Task 0 이 그 필드를 산출물에
기록해 드러낸다 — 조용히 사라지지 않게 하는 것이 목적이다.

**DD13 — M7이 M6 구현보다 먼저 완주하고, M7의 ship 이후 산출물은 M6가 운반한다 (2026-09-22).**
근거는 둘이다. (a) OQ5(chore ship 판별)의 답은 M3의 `meta.plan_review_expected`인데 그 생산자가
라이브에서 한 번도 발화하지 않아 반증 불가였다(PRD Open Questions 머리말). M7의 exit 0이 그것을
처음 발화시키므로, M7 뒤에 판정하면 `이연`이 아니라 `해소`로 판정할 증거가 생긴다. (b) M7 plan
Task 5의 PRD 행 · frozen-baseline 라이브 절 · 보고서 실값은 ship 이후에만 존재하는 값인데, ship
뒤 m7b에 커밋하면 ship receipt가 `ship-gate-stale-head`가 되고 tracked receipt는 재봉인할 수
없다(§3.12). 그래서 셋은 Task 7로 이 plan이 운반한다.

M7이 `halt`로 끝나도 M6 구현은 진행한다 — 원장 판정은 M7의 성패와 독립이고, 그 경우 OQ5는
M7 plan을 successor로 하는 `이연`이 된다. 다만 **M6 ship은 M7 ship 뒤에만** 한다(런북 B4): 이
브랜치는 m7b를 포함하므로, M7 없이 M6를 ship하면 M6 PR이 M5·M7 코드를 대신 싣고 M7 plan의
UI5·UI6이 정한 ship 단위가 무너진다.

M7의 ship 경로는 HSR 판정점 `P1-M7PATH`가 **`halt`로 판정했다** — 후보 `review-record-linkage-m7c`는
채택되지 않았고(본문은 `.claude/notes/review-record-linkage-m7c-candidate.md`) M7은 사람의 판정 H1을
기다린다. 사람이 `-m7c`를 택하면 아래 값이 그대로 맞고, 다른 경로를 택하면 `M7_SLUG`만 바뀐다. 이 plan의
검사와 Task는 `M7_SLUG=review-record-linkage-m7c`로 쓰며, `halt`인 경우 그 슬러그의 강제 뷰는
`unresolved`(3)를 내므로 검사 13이 PRD M7 행을 `in-progress`로 요구해 여전히 정합한다.

**DD14 — M6 plan 게이트는 다시 돌리지 않는다 (2026-09-22 · HSR `P0-M6CAP` = `halt`).** 이 DD의
초판(같은 날)은 캡 1→2로 한 라운드 더 돌자고 적었다. 두 리뷰어가 기각했고 근거는 둘이다 —
(a) 그 env 조합(`MCCP_REVIEW_SINGLE_PASS` + 캡 2)은 single-pass가 캡을 1로 고정해
(`plugins/mccp/scripts/lib/review-single-pass.js:117`) 원장 1인 슬러그의 다음 라운드를 거부하는
no-op이다. (b) 이탈이 사는 것이 작다: "R0 흡수 재검증"은 같은 초판이 finding을 plan에 흡수하지
않는다고 못박아 결과가 plan을 바꾸지 못하고, 슬러그 fallback은 B1이 implement receipt를 쓰는
순간 `receiptExistsForSlug`가 참이 되어 저절로 해소된다(Fable HIGH — `plugins/mccp/scripts/receipt/decision.js:159`).
남는 것은 M6 ship의 링크 앵커 하나인데, 그것은 이 PRD의 지표 값이지 M6의 outcome(원장 판정)이 아니다.

**정정 (HSR `P1` — Codex HIGH · Fable CRITICAL, 2026-09-22 실측으로 확인): 아래 문단의 전제는
틀렸다.** "soft 모드라 누락은 막지 않는다"는 **hook 계층**에서만 참이다. 명령 본문이 부르는 CLI
`validate`는 `MCCP_RECEIPT_GATE_MODE`를 읽지 않고 `ok`에 `missing.length === 0`을 무조건 요구한다
(`plugins/mccp/scripts/receipt/validate-cmd.js:870`) — 실측: `validate --command mccp:pr --decision
review-record-linkage-m6`가 soft·hard 모두 `missing` 2건 · `ok:false`. 그래서 plan receipt 없는
M6는 (a) prp-implement Phase 0.0 step 4가 `mccp-plan-codex` 누락에 `[MCCP-INTENT-GATE-STOP]`으로
멈추고(`plugins/mccp/commands/prp-implement.md:56`), (b) 설령 지나도 `/mccp:pr` 2.5.9가 같은 `ok`로
HALT한다. **구현도 ship도 불가능하다.** CLAUDE.md §1.2의 soft 설명과 CLI 동작의 불일치는
backlog로 넘긴다.

Fable이 문서화된 복구 후보를 하나 제시했다 — `MCCP_SKIP_INTENT_GATE="<사유>"` 아래 `cli.js write
--gate mccp-plan-codex --decision review-record-linkage-m6 …`로 plan receipt를 수동 발행하면
`intent_gate_verdict=incomplete` + `force_override`로 봉인되어 체인이 열리고 dedupe는 닫힌 채
남으며, `review_source`가 비어 링크는 여전히 undecidable이다(CLAUDE.md §3.3 복구 4번 · §3.16
우회 목록). 그러나 그것은 DD11 규칙 2의 **새 메커니즘**이라 흡수가 아니라 새 답변형 판정점이어야
하고, 이 plan 단계는 판정점을 더 열지 않았다 — **사람의 판정 H2**다(보고서).

**H2 판정 (2026-09-22 · 사람).** plan 게이트 R1은 `round-cap-reached`(1/1)로 5.2c에서 멈췄다 —
패널도 Codex도 발사되지 않았다(`.claude/reviews/plan-review-review-record-linkage-m6-r1-halt.md`).
사람이 위 복구 후보를 택했다: `MCCP_SKIP_INTENT_GATE` 아래 `cli.js write --codex-verdict divergent`.
review 축은 proof가 없어 비어 있고, `divergent`는 cap 도달의 문서화된 매핑이다(plan.md 5.2z DD4 —
`unavailable`이 아니다). receipt는 `intent_gate_verdict=incomplete` · `force_override=true`를
봉인하므로 체인은 열리고 dedupe는 닫힌 채 남는다 — PR-Codex가 반드시 발화한다. 전역 규칙의
"receipt 없음" 조항에서 지시로 이탈한 것이고, 흡수가 재리뷰되지 않았다는 사실과 함께 backlog에
적었다. 이 receipt는 **이 본문의 해시**에 묶이므로 이후의 plan 편집은 그것을 stale로 만든다(런북 B1).

아래는 정정 이전의 서술이다. 무엇이 왜 달라졌는지가 함께 남도록 지우지 않는다.

그래서 M6는 plan receipt 없이 구현·ship한다. 결과를 정직하게 적는다:

- M6 ship은 상류 앵커가 없어 `link_anchor_unresolved`로 접히고 링크 감사에서 **undecidable**이다.
  undecidable은 분모에서 빠질 뿐 분모를 `null`로 만들지 않는다(`linkage-audit.js:392`의
  `eligibleShips.length`). 그 사실을 보고서가 적는다 — 이 PRD의 마지막 ship이 자기 지표의 분모
  밖이라는 것.
- 이 저장소는 `MCCP_RECEIPT_GATE_MODE=soft`라 누락 plan receipt는 체인을 막지 않는다(CLAUDE.md §1.2).
  이 plan receipt의 부재는 CLAUDE.md 전역 규칙의 "receipt 없음 — cap 도달, 반영분 미재검증"이고,
  그 반영분(R0 흡수 + 2026-09-22 개정)을 사람 대신 검토한 것이 HSR `P0`·`P1`이다.
- plan receipt가 없으므로 plan을 동결할 이유도 없다. implement 리뷰 절은 명령 본문대로 plan에
  들어가고, implement receipt는 그 뒤의 해시에 묶인다.

**DD15 — 판정의 검토와 Open Questions 판정은 HSR이 한다 (UI11).** 리뷰어 구성 · 기계 판정 ·
권한 상한 · 기록 위치는 M7 plan DD11이 소유하고 여기서 다시 정의하지 않는다. 이 plan이 더하는
것은 판정점의 **선택지와 순서**뿐이다.

- `M6-DISP` (검토형 · Task 3b): 두 리뷰어가 판정 원장 전체를 읽고 이의를 `item_id` 단위로 낸다.
  **비-`deferred` 판정은 두 리뷰어 어느 쪽도 그 item에 이의를 내지 않았을 때만 선다.** 이의가
  하나라도 있으면 그 item은 `deferred`로 내려가고 이의 원문이 `note`에 인용된다. 재판정 라운드는
  없고, 그것은 산문이 아니라 검사 12가 강제한다 — `M6-DISP` 기록이 **정확히 한 줄**이 아니면
  실패다(P0 Fable HIGH: 한 줄만 읽으면 두 번째 실행으로 이의를 지울 수 있었다). 리뷰어 출력이
  계약(`verdict` ∈ {`approve`,`object`} · `objections` 배열)을 어기면 그 리뷰어는 **전 item에
  이의**를 낸 것으로 센다(P0 Codex HIGH: `{}`가 이의 0건으로 읽혔다). 이 규칙은 원장을 과하게
  **닫는** 방향만 막고 과하게 **여는** 방향은 막지 않는데, 그것이 의도다 — DD5가 `deferred`를
  종결로 접지 않으므로 과하게 연 원장은 정직하고, 과하게 닫은 원장은 거짓이다. fix-task 1건도
  원장의 원소이므로 여기 포함된다. FAIL 버킷 item이 이의로 `deferred`가 되는 것은 허용된다 —
  검사 5는 "`rejected` 또는 이의로 내려간 `deferred`"를 받는다(P0 Codex HIGH: 두 규칙이 충돌했다).
- `M6-OQ1`~`M6-OQ5` (답변형 · Task 4): 선택지 `이연` → `해소` → `무효`. `무효`가 가장 강한
  주장(질문 자체의 기각)이라 가장 허용 쪽에 둔다.
- `P0-M6CAP` (답변형 · plan 단계): DD14의 캡 1→2 이탈 — **`halt`로 판정됐다**.

## Tasks

### Task 0: 경계를 고정하고 분모를 봉인한다
- **Action**: 경계 OID(런북 B0 직후의 HEAD — DD8 개정)의 트리를 `git archive`로 꺼내 그 위에서
  `buildInventory`를 돌린다(현재 워크트리가 아니라 — DD10). `c9c8d22`의 값(131 · 132 · FAIL 17)은
  `closure.md`에 참고 실측으로 나란히 적어 경계 이동이 무엇을 더했는지 드러낸다. 원소는 `source ∈ {backlog, fix-task}` 중 이 PRD 귀속분이며
  (DD11), backlog 귀속 규칙은 M5의 것을 승계한다 — `coords.source_plan`이 `review-record-linkage`를
  포함하는가. 산출물 `closure-inventory.json`에 `boundary_oid` · `inventory_sha256` · `items` ·
  재현 command · `identical_rows_collapsed`(DD12)를 함께 봉인한다.
- **Mirror**: `.claude/_meta/data/2026-09-08-closure-baseline.json`의 재현 command 동봉 형식
- **Validate**: `## Validation` 검사 0(경계 = 구현 시점의 HEAD) · 검사 1 — 고정 OID에서 재계산한 해시·항목 수·`boundary_oid`가 산출물과 일치, 불일치 시 비영점 exit

### Task 1: 두 귀속 규칙이 같은 값을 내는지 기록한다
- **Action**: 열 기준 규칙과 줄 전체 grep 규칙의 값을 **둘 다** 산출해 `closure.md`에 나란히
  적는다. 현재 실측은 둘 다 131이고 차이가 0인데, 그 이유는 inventory item이 finding 본문을
  담지 않고 `claim_digest`만 담기 때문이다(구조적으로 오염 불가). 이 대조가 없으면 "M5가
  경고한 오류를 피했다"는 주장이 반증 불가능하다.
- **Mirror**: `docs/review-record-linkage/deferred-triage.md`의 정의별 값 대조표
- **Validate**: `closure.md`에 두 값과 그 차이가 적혀 있고 재현 command가 함께 있다

### Task 2: FAIL 버킷을 일괄 판정한다 (`c9c8d22` 참고 실측 17행)
- **Action**: `severity=FAIL` item 에 `rejected` 판정을 공유 사유 하나로 붙인다. 사유는 §3.14
  해제 조건 대기이며 개별 판정이 이중 계수임을 명시한다. 각 item 은 개별 레코드를 갖되 `note`가
  같은 근거를 가리킨다. `rejected` 는 `classifyEvidence(..., allowBarePath:false)` 를 통과하는
  `evidence` 가 필수이므로(DD9) `path:line` 형태로 §3.14 조항을 지목한다. 수치는 "17행"이 아니라
  분모에서 조인해 나오는 값이다(DD12 — 행과 item 은 같은 수가 아닐 수 있다).
- **Mirror**: `docs/review-record-linkage/deferred-triage.md`의 (d) 버킷 논거
- **Validate**: `## Validation` 검사 5 — 분모에서 `severity=FAIL` 인 item 을 `item_id` 로 조인해 전건이 `rejected` 인지 확인(비영점 exit)

### Task 3: 나머지 item을 판정한다 (`c9c8d22` 참고 실측 114행)
- **Action**: FAIL 을 뺀 나머지 item 을 주제별로 묶어 각각 하나의 판정과 근거를 붙인다.
  이미 해소 마커를 가진 것은 `superseded`, 다른 축이 소유하는 것은 `deferred`, 전제가 사라진
  것은 `obsolete`. **C11 수용 술어를 만족시키는 것이 형식 요건이다**(DD9) — `deferred` 는
  `successor` 가 실재하는 파일이어야 하고 그 파일 본문이 M6 의 `inventory_sha256` 을 담아야 하므로
  `docs/review-record-linkage/closure.md` 가 그 sha 를 축자로 싣고 successor 로 쓰인다.
  묶음은 서술의 단위일 뿐이고 **레코드는 항상 item 단위**다 — 묶어서 한 줄로 적으면 커버리지
  검사가 통과하면서 개별 항목이 사라진다.
- **Mirror**: `docs/multi-session-work-loop/debt-dispositions.jsonl`의 한 줄 한 판정 형식
- **Validate**: `## Validation` 검사 2(집합 일치) 와 검사 3(`validateDisposition` 전건 통과) 이 둘 다 exit 0

### Task 3b: 판정 원장을 Fable × Codex가 검토한다 (판정점 `M6-DISP`)
- **Action**: Task 3까지의 원장(`closure-dispositions.jsonl`) · 분모(`closure-inventory.json`) ·
  `closure.md`를 packet으로 묶어 M7 plan DD11의 두 리뷰어에 보낸다. 출력 계약은
  `{"verdict":"approve|object","findings":[…],"objections":[{"item_id":"…","claim":"…","evidence":"path:line"}]}`.
  DD15 규칙대로 이의가 있는 비-`deferred` item을 `deferred`로 내리고(successor는 `closure.md`)
  이의 원문을 `note`에 인용한다. 두 원문 출력과 결과를 `hsr-decisions.jsonl`에 한 줄로 봉인한다.
  Task 5는 이 Task **뒤에** 돈다 — 내려간 item의 코드를 고치지 않기 위해서다.
- **Mirror**: M7 plan DD11 · `plugins/mccp/commands/santa-loop.md:532`의 Reviewer B 호출
- **Validate**: `## Validation` 검사 11(HSR 재계산) · 검사 12(이의가 있는 item에 비-`deferred` 판정 0건) · 내린 뒤에도 검사 2·3이 exit 0

### Task 4: Open Questions 5건과 fix-task 1건을 판정한다
- **Action**: PRD의 Open Questions 다섯을 각각 해소·이연·무효로 판정하고 근거를 PRD 본문에
  적는다. 판정은 저자가 아니라 HSR 판정점 `M6-OQ1`~`M6-OQ5`가 내린다(DD15 — 답변형 packet에는
  저자 권고를 넣지 않는다). packet에 싣는 증거: 3번은 `docs/review-record-linkage/frozen-baseline.md`의
  실재, 1·2·4번은 M2가 dropped된 뒤 상류가 답을 가진 위치(M2 검증 산출물), 5번은 **M7의
  `--check-live-linkage --decision review-record-linkage-m7c` 종료코드**(DD13 · `M7_SLUG`) — exit 0이면
  `meta.plan_review_expected`가 라이브에서 처음 발화했다는 증거이고, 아니면 여전히 반증 불가라
  M7 plan을 successor로 둔다. fix-task 항목 `fix-task:review-record-linkage-m3`는 원장의 원소라
  Task 3·3b에서 판정되며, 소유 축이 M7(escalation decision이 `review-record-linkage-m7b`)이라는
  사실을 근거에 싣는다.
- **Mirror**: `docs/review-record-linkage/deferred-triage.md`의 (a) 버킷 — 행마다 근거를 따로 적음
- **Validate**: `## Validation` 검사 14(PRD 판정 문구 = HSR 결과) · fix-task item 이 검사 2·3 을 통과한다

### Task 5: HIGH 와 CRITICAL 중 이 사이클이 흡수할 것을 확정한다
- **Action**: `fixed` 판정을 받은 항목만 코드를 고친다(UI7). 판정이 먼저이고 코드가 나중이다 —
  반대로 하면 "고칠 수 있는 것을 골라 판정"이 되어 원장이 코드에 맞춰진다. 흡수 대상이 0건일
  수 있고 그것은 실패가 아니다. 흡수한 항목은 파일과 함께 보고서에 열거한다.
- **Mirror**: CLAUDE.md §3.14의 증거 첨부 기각 규율
- **Validate**: `## Validation` 검사 10 — 변경된 plugin 코드 디렉토리에서 test 를 도출해 실행(변경 0이면 빈 범위가 정상)

### Task 6: 3분할을 정직하게 보고한다
- **Action**: `closure.md`에 해소·이연·무효를 나란히 적는다. 단일 "종결률"을 만들지 않는다.
  DD6대로 findings 215건 제외를 수치와 함께 적고, M5의 73행이 M6의 131행과 어떻게 다른지
  (스냅샷 시점 · M7 사이클 유입)를 `deferred-triage.md`에 정정으로 남긴다.
- **Mirror**: C11 PRD 결정 2 — 판정과 해소와 수정을 한 수로 접지 않음
- **Validate**: `## Validation` 검사 6 — 해소·이연·무효 3분할의 합이 분모와 일치(비영점 exit) · 검사 4가 결속 재작성 축의 선언을 확인

### Task 7: M7의 ship 이후 산출물을 운반한다 (DD13)
- **Action**: 런북 B0에서 병합한 M7 결과로 셋을 갱신한다 — (1) PRD M7 행 status:
  `linkage-audit.js --check-live-linkage --decision review-record-linkage-m7c`가 exit 0이면
  `complete`, 아니면 `in-progress` 유지. (2) `docs/review-record-linkage/frozen-baseline.md`의
  **라이브 절에만** M7 실값(동결 블록은 바이트 불변). (3) `.claude/PRPs/reports/review-record-linkage-m7-report.md`에
  네 값을 명령·출력째로 싣고, **완주 경로가 헤드리스 `--plugin-dir` 하위 세션이었다**는 사실과
  그 사이클의 HSR 판정을 적는다(`docs/dogfood-install.md:113`의 의무). M7이 `halt`로 끝났다면
  그 지점과 HSR 기록을 적고 complete로 선언하지 않는다(M7 plan DD9).
- **Mirror**: M7 plan Task 5
- **Validate**: `## Validation` 검사 13(M7 종료코드 ↔ PRD M7 행) · `node plugins/mccp/scripts/lib/linkage-audit.js --frozen-only`가 문서의 동결 블록과 0줄 diff

## 실행 런북 (B0~B6 · 2026-09-22)

**현재 실행 불가 — 사람 판정 H1(M7 ship 경로)이 먼저다** (H2는 판정됐다 — DD14). H1이 내려진
뒤, M7 ship이 끝나면 같은 오케스트레이터가 이어서 돈다. 하위 세션의 호출 형태 · deny 목록 · `CONSTRAINTS` ·
`permission_denials` 대조는 후보 notes(`.claude/notes/review-record-linkage-m7c-candidate.md`)의 것을 그대로 쓴다. plan 동결도 그대로 적용한다 — plan receipt가 이 본문의 해시에 묶였다(DD14 H2).

| 단계 | 주체 | 무엇 | 통과 조건 (디스크) |
|---|---|---|---|
| B0 | 오케스트레이터 | `git checkout review-record-linkage-m6` → `git merge review-record-linkage-m7c`(`P1-M7PATH`가 `halt`면 `review-record-linkage-m7b`) → `git merge origin/main`(§3.5.1 삭제 검사). `hsr-decisions.jsonl`이 add/add 충돌하면 M7 쪽이 m6 쪽 줄의 상위집합일 때만 M7 쪽을 취하고, 아니면 `halt` | 삭제 0 |
| B1 | 하위 세션 | `/mccp:prp-implement .claude/plans/review-record-linkage-m6.plan.md` · deny 목록(후보 notes K5 — plan 동결 포함)에 `Bash(git commit:*)` 추가 · 제약 추가: "Task 3b·4의 판정은 M7 plan DD11 절차로만 낸다. 구현 중에는 커밋하지 않는다(검사 0이 경계 = HEAD를 본다). Phase 2.5.4의 리뷰 절은 plan이 아니라 `.claude/notes/review-record-linkage-m6-implement-codex.md`에 쓴다(plan 편집은 plan receipt를 stale로 만든다 — DD14 H2)" | 검사 0~13 exit 0 · implement receipt 실재 |
| B2 | 오케스트레이터 | `closure-inventory.json`의 `boundary_oid` = B0 직후 기록한 OID = 현재 HEAD · `validate --command mccp:pr --decision review-record-linkage-m6 --plan <this>`의 **`ok:true`**(`missing` 포함 — DD14 정정) · `derive-decision --command mccp:pr --args ""` → `review-record-linkage-m6` · M7 PR 실재(`gh pr list --head review-record-linkage-m7c --state all`) | 셋 다 — 아니면 `halt`(DD13) |
| B3 | 오케스트레이터 → 하위 세션 | B1 산출물을 명시 경로로 커밋 → `/mccp:pr` | PR 생성. 비승인이면 M7 plan DD11의 `R-PR`·`R-SEC`와 같은 선택지·같은 상한 |
| B4 | 사람 | merge — **M7 → M6 순서** | — (HSR 권한 밖) |

## Validation

```bash
# 0. 경계 OID — 구현 시점의 HEAD와 같아야 한다 (DD8 개정 — 범위 조건은 P0에서 반증됐다)
#    B1 안에서만 판정한다. 구현은 커밋하지 않으므로 그때의 HEAD가 B0 직후의 커밋이다.
BOUNDARY=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync("docs/review-record-linkage/closure-inventory.json","utf8")).boundary_oid||"")')
test -n "$BOUNDARY" && test "$BOUNDARY" = "$(git rev-parse HEAD)" \
  && echo "boundary == HEAD: $BOUNDARY" || { echo "boundary != HEAD (DD8)"; exit 1; }

# 1. 분모 결속 — 고정 OID 에서 재계산해 산출물과 대조한다. 불일치면 비영점 (DD10)
node -e '
const fs=require("fs"), cp=require("child_process"), os=require("os"), path=require("path");
const di=require("./plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js");
const oid=process.argv[1];
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"m6-"));
cp.execSync("git archive "+oid+" | tar -x -C "+tmp,{stdio:"ignore",shell:"/bin/bash"});
const built=di.buildInventory(tmp);
const RE=/review-record-linkage/i;
const mine=(built.items||[]).filter(i=>(i.source==="backlog"||i.source==="fix-task")
  && RE.test(i.source==="backlog"?String((i.coords||{}).source_plan||""):i.item_id));
const recomputed=di.inventoryHash(mine);
const doc=JSON.parse(fs.readFileSync("docs/review-record-linkage/closure-inventory.json","utf8"));
const okHash=doc.inventory_sha256===recomputed;
const okCount=(doc.items||[]).length===mine.length;
const okOid=doc.boundary_oid===oid;
// P1 Codex HIGH — the sealed items themselves must hash to the sealed sha and carry exactly the
// recomputed item_id set; comparing only the sha string let a swapped item slip through.
const okItems=di.inventoryHash(doc.items||[])===doc.inventory_sha256;
const want=new Set(mine.map(i=>i.item_id)), have=new Set((doc.items||[]).map(i=>i.item_id));
const okSet=want.size===have.size&&[...want].every(k=>have.has(k));
console.log("recomputed:",recomputed,"| sealed:",doc.inventory_sha256);
console.log("count recomputed:",mine.length,"| sealed:",(doc.items||[]).length);
console.log("hash_match:",okHash,"count_match:",okCount,"oid_match:",okOid,"items_hash:",okItems,"id_set:",okSet);
if(!okHash||!okCount||!okOid||!okItems||!okSet) process.exit(1);
' "$BOUNDARY"

# 2. 커버리지 — 분모와 판정 원장의 item_id 집합이 정확히 일치 (누락·중복·외부 0)
node -e '
const fs=require("fs");
const inv=JSON.parse(fs.readFileSync("docs/review-record-linkage/closure-inventory.json","utf8"));
const want=new Set(inv.items.map(i=>i.item_id));
const got=new Map();
fs.readFileSync("docs/review-record-linkage/closure-dispositions.jsonl","utf8")
  .split("\n").filter(Boolean).forEach(l=>{const r=JSON.parse(l);got.set(r.item_id,(got.get(r.item_id)||0)+1);});
const missing=[...want].filter(k=>!got.has(k));
const extra=[...got.keys()].filter(k=>!want.has(k));
const dup=[...got].filter(([,n])=>n>1).map(([k])=>k);
console.log("denominator:",want.size,"disposed:",got.size,"missing:",missing.length,"extra:",extra.length,"dup:",dup.length);
if(missing.length||extra.length||dup.length){console.error(JSON.stringify({missing,extra,dup},null,2));process.exit(1);}
'

# 3. C11 수용 술어 — enum 이 아니라 validateDisposition 자체를 부른다 (DD9)
#    inventorySha 는 M6 자신의 봉인이므로 deferred 의 successor 축까지 실제로 판정된다.
node -e '
const fs=require("fs");
const di=require("./plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js");
const inv=JSON.parse(fs.readFileSync("docs/review-record-linkage/closure-inventory.json","utf8"));
const index=new Map(inv.items.map(i=>[i.item_id,i]));
const rows=fs.readFileSync("docs/review-record-linkage/closure-dispositions.jsonl","utf8")
  .split("\n").filter(Boolean).map(l=>JSON.parse(l));
const bad=[];
for(const r of rows){
  const v=di.validateDisposition(process.cwd(), r, index, inv.inventory_sha256);
  if(!v.ok) bad.push({item_id:r.item_id, disposition:r.disposition, reason:v.reason});
}
console.log("rows:",rows.length,"| validateDisposition failures:",bad.length);
if(bad.length){console.error(JSON.stringify(bad.slice(0,10),null,2));process.exit(1);}
'

# 4. 결속 축의 재작성 필요성을 원장이 스스로 선언하는가 (DD2)
node -e '
const fs=require("fs");
const inv=JSON.parse(fs.readFileSync("docs/review-record-linkage/closure-inventory.json","utf8"));
const rows=fs.readFileSync("docs/review-record-linkage/closure-dispositions.jsonl","utf8")
  .split("\n").filter(Boolean).map(l=>JSON.parse(l));
const wrong=rows.filter(r=>r.inventory_sha256!==inv.inventory_sha256);
const doc=fs.readFileSync("docs/review-record-linkage/closure.md","utf8");
const declares=doc.includes("inventory_sha256")&&doc.includes("successor");
console.log("rows bound to the M6 seal:",rows.length-wrong.length,"/",rows.length,
            "| closure.md declares the re-key axis:",declares);
if(wrong.length||!declares) process.exit(1);
'

# 5. FAIL 버킷 — rejected 이거나, M6-DISP 이의로 내려간 deferred 다 (Task 2 · DD15)
node -e '
const fs=require("fs");
const parse=raw=>{try{const s=String(raw);return JSON.parse(s.slice(s.indexOf("{"),s.lastIndexOf("}")+1))}catch(_){return null}};
const inv=JSON.parse(fs.readFileSync("docs/review-record-linkage/closure-inventory.json","utf8"));
const disp=fs.readFileSync("docs/review-record-linkage/hsr-decisions.jsonl","utf8").split("\n").filter(Boolean).map(l=>JSON.parse(l)).filter(d=>d.point==="M6-DISP");
const obj=new Set(); let all=false;
if(disp.length===1) for(const r of ["fable","codex"]){const p=parse(disp[0].reviewers[r].raw);
  if(!p||!["approve","object"].includes(p.verdict)||!Array.isArray(p.objections)) all=true; else p.objections.forEach(o=>obj.add(o.item_id));}
const rows=new Map(fs.readFileSync("docs/review-record-linkage/closure-dispositions.jsonl","utf8").split("\n").filter(Boolean).map(l=>{const r=JSON.parse(l);return [r.item_id,r];}));
const failItems=inv.items.filter(i=>i.severity==="FAIL").map(i=>i.item_id);
const bad=failItems.filter(k=>{const r=rows.get(k);if(!r)return true;if(r.disposition==="rejected")return false;return !(r.disposition==="deferred"&&(all||obj.has(k)));});
console.log("FAIL items:",failItems.length,"| neither rejected nor objection-deferred:",bad.length);
if(bad.length) process.exit(1);
'

# 6. 3분할 회계 — 해소·이연·무효의 합이 분모와 같은가 (Task 6 · DD5)
node -e '
const fs=require("fs");
const inv=JSON.parse(fs.readFileSync("docs/review-record-linkage/closure-inventory.json","utf8"));
const rows=fs.readFileSync("docs/review-record-linkage/closure-dispositions.jsonl","utf8")
  .split("\n").filter(Boolean).map(l=>JSON.parse(l));
const RESOLVED=["fixed"], DEFERRED=["deferred"], VOID=["obsolete","superseded","duplicate","rejected"];
const n=k=>rows.filter(r=>k.includes(r.disposition)).length;
const a=n(RESOLVED), b=n(DEFERRED), c=n(VOID);
console.log("해소(fixed):",a,"| 이연(deferred):",b,"| 무효:",c,"| sum:",a+b+c,"| denominator:",inv.items.length);
if(a+b+c!==inv.items.length) process.exit(1);
'

# 7. C11 원장 무손상 — 봉인 자체가 판정 기준이다 (DD1 · UI5)
node plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js verify --json \
  | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log("seal_intact:",j.seal_intact,"disposed:",j.disposed,"open:",j.open);if(!j.seal_intact||j.open!==0)process.exit(1);'
git diff --quiet HEAD -- docs/multi-session-work-loop/debt-dispositions.jsonl docs/multi-session-work-loop/debt-inventory.json \
  && echo "C11 ledger untouched by the working tree" || { echo "C11 ledger was modified — DD1 violated"; exit 1; }

# 8. backlog 표가 4열을 유지하는가 (UI8)
node -e '
const fs=require("fs");
const l=fs.readFileSync(".claude/plans/codex-findings-backlog.md","utf8").split("\n");
const h=l.find(x=>/^\|\s*Date\s*\|\s*Severity\s*\|\s*Source plan\s*\|\s*Finding\s*\|\s*$/.test(x));
console.log("4-column header intact:", Boolean(h)); if(!h)process.exit(1);
'

# 9. 버전 선언 금지 (§3.7)
node scripts/version-declaration-guard.js --base origin/main

# 10. 회귀 — 이 사이클이 실제로 건드린 파일의 축을 돌린다 (Task 5)
#     하드코딩하지 않고 변경된 파일에서 도출한다.
CHANGED=$(git diff --name-only origin/main...HEAD -- 'plugins/mccp/**/*.js' | sed 's#/[^/]*$##' | sort -u)
if [ -z "$CHANGED" ]; then echo "no plugin code changed — regression scope is empty (expected when every item is deferred)";
else for d in $CHANGED; do ls "$d"/tests/*.test.js 2>/dev/null; done | sort -u | tr '\n' ' ' \
  | xargs -r env MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2; fi

# 11. HSR 기록 — 판정점 목록을 스크립트 안에 고정하고, 필수 판정점 · 판정점당 한 줄 · packet sha256 ·
#     결과 재계산을 대조한다 (M7 plan DD11 규칙 4). 기록이 스스로 적은 선택지 순서는 믿지 않는다.
#     -m7c plan 검사 7은 같은 스크립트를 HSR_REQUIRED 만 바꿔 돈다.
HSR_REQUIRED="${HSR_REQUIRED:-P0,P0-M7CAP,P0-M6CAP,P1,P1-M7PATH,M6-DISP,M6-OQ1,M6-OQ2,M6-OQ3,M6-OQ4,M6-OQ5}" node -e '
const fs=require("fs"),crypto=require("crypto");
const OQ=["이연","해소","무효"], RV=["object","approve"];
const CATALOG={"P0":["review",RV],"P0-M7CAP":["answer",["halt","regate"]],"P0-M6CAP":["answer",["halt","regate"]],
  "P1":["review",RV],"P1-M7PATH":["answer",["halt","fresh-slug"]],
  "R-PR":["answer",["halt","absorb-rerun","absorb-rerun-armed"]],"R-SEC":["answer",["halt","absorb-rerun"]],
  "M6-DISP":["review",RV],"M6-OQ1":["answer",OQ],"M6-OQ2":["answer",OQ],"M6-OQ3":["answer",OQ],"M6-OQ4":["answer",OQ],"M6-OQ5":["answer",OQ]};
const parse=raw=>{try{const s=String(raw);return JSON.parse(s.slice(s.indexOf("{"),s.lastIndexOf("}")+1))}catch(_){return null}};
const blocking=p=>(p&&Array.isArray(p.findings)?p.findings:[]).some(f=>/^(CRITICAL|HIGH)$/.test(f.severity)&&f.evidence&&f.failure_scenario);
const bad=[], seen={};
fs.readFileSync("docs/review-record-linkage/hsr-decisions.jsonl","utf8").split("\n").filter(Boolean).forEach((l,k)=>{
  const d=JSON.parse(l), cat=CATALOG[d.point], at="line "+(k+1)+" "+d.point;
  seen[d.point]=(seen[d.point]||0)+1;
  if(!cat){bad.push(at+": not in catalog");return;}
  const [kind,opts]=cat;
  if(d.kind!==kind||JSON.stringify(d.options)!==JSON.stringify(opts)) bad.push(at+": kind/options differ from catalog");
  if(typeof d.packet!=="string"||crypto.createHash("sha256").update(d.packet).digest("hex")!==d.packet_sha256) bad.push(at+": packet missing or sha256 mismatch");
  const f=parse(d.reviewers&&d.reviewers.fable&&d.reviewers.fable.raw), c=parse(d.reviewers&&d.reviewers.codex&&d.reviewers.codex.raw);
  let want;
  if(kind==="review") want=(f&&c&&f.verdict==="approve"&&c.verdict==="approve"&&!blocking(f)&&!blocking(c))?"approve":"object";
  else { const i=p=>{const ch=p&&((p.answers&&p.answers[d.point])||p.choice);const x=opts.indexOf(ch);return x<0?0:x;}; want=opts[Math.min(i(f),i(c))]; }
  if(d.outcome!==want) bad.push(at+": recorded "+d.outcome+" != recomputed "+want);
});
Object.entries(seen).filter(([,n])=>n>1).forEach(([p,n])=>bad.push(p+": "+n+" lines (must be one)"));
process.env.HSR_REQUIRED.split(",").filter(p=>!seen[p]).forEach(p=>bad.push(p+": required but absent"));
console.log("hsr points:",Object.keys(seen).length,"| problems:",bad.length); if(bad.length){console.error(bad.join("\n"));process.exit(1);}'

# 12. 이의가 있는 item은 비-deferred로 남지 않았다 (DD15 · Task 3b)
#     M6-DISP 는 정확히 한 줄이어야 하고, 계약을 어긴 리뷰어 출력은 전 item 이의로 센다 (P0 Fable · Codex HIGH)
node -e '
const fs=require("fs");
const parse=raw=>{try{const s=String(raw);return JSON.parse(s.slice(s.indexOf("{"),s.lastIndexOf("}")+1))}catch(_){return null}};
const recs=fs.readFileSync("docs/review-record-linkage/hsr-decisions.jsonl","utf8").split("\n").filter(Boolean)
  .map(l=>JSON.parse(l)).filter(d=>d.point==="M6-DISP");
if(recs.length!==1){console.error("M6-DISP records:",recs.length,"(must be exactly 1)");process.exit(1);}
const obj=new Set(); let all=false;
for(const r of ["fable","codex"]){const p=parse(recs[0].reviewers[r].raw);
  if(!p||!["approve","object"].includes(p.verdict)||!Array.isArray(p.objections)) all=true; else p.objections.forEach(o=>obj.add(o.item_id));}
const rows=fs.readFileSync("docs/review-record-linkage/closure-dispositions.jsonl","utf8").split("\n").filter(Boolean).map(l=>JSON.parse(l));
const bad=rows.filter(r=>r.disposition!=="deferred"&&(all||obj.has(r.item_id)));
console.log("objected items:",all?"ALL (contract-violating reviewer output)":obj.size,"| non-deferred despite objection:",bad.length);
if(bad.length){console.error(JSON.stringify(bad.map(r=>r.item_id)));process.exit(1);}'

# 13. M7 종료코드 ↔ PRD M7 행 (DD13 · Task 7)
node plugins/mccp/scripts/lib/linkage-audit.js --check-live-linkage --decision "${M7_SLUG:-review-record-linkage-m7c}" >/dev/null 2>&1; M7=$?
node -e '
const m7=Number(process.argv[1]);
const row=require("fs").readFileSync(".claude/prds/review-record-linkage.prd.md","utf8").split("\n").find(l=>/^\|\s*7\s*\|/.test(l))||"";
const status=(row.split("|")[4]||"").trim();
console.log("m7 exit:",m7,"| PRD M7 status:",status);
if((m7===0)!==(status==="complete"))process.exit(1);' "$M7"

# 14. PRD Open Questions 의 판정이 HSR 결과와 같다 (Task 4 · P1 Codex HIGH)
#     n번째 체크박스 줄이 M6-OQn 의 결과를 "판정: <결과>" 로 담고, 이연이면 체크하지 않는다.
node -e '
const fs=require("fs");
const hsr=new Map(fs.readFileSync("docs/review-record-linkage/hsr-decisions.jsonl","utf8").split("\n").filter(Boolean)
  .map(l=>JSON.parse(l)).filter(d=>/^M6-OQ[1-5]$/.test(d.point)).map(d=>[d.point,d.outcome]));
const prd=fs.readFileSync(".claude/prds/review-record-linkage.prd.md","utf8").split("\n");
const start=prd.findIndex(l=>/^## Open Questions/.test(l));
const oq=prd.slice(start).filter(l=>/^- \[[ x]\] /.test(l)).slice(0,5);
const bad=[];
for(let n=1;n<=5;n++){const o=hsr.get("M6-OQ"+n), line=oq[n-1]||"";
  if(!o){bad.push("M6-OQ"+n+": no HSR record");continue;}
  if(!line.includes("판정: "+o)) bad.push("M6-OQ"+n+": PRD line lacks 판정: "+o);
  if((o==="이연")!==line.startsWith("- [ ] ")) bad.push("M6-OQ"+n+": checkbox state disagrees with "+o);}
console.log("OQ cross-check problems:",bad.length); if(bad.length){console.error(bad.join("\n"));process.exit(1);}'
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `deferred` 대량 판정이 "종결"로 인용된다 — 이 저장소의 실측 base rate가 88.2%다 | **높음** | DD5. `closure.md`가 해소·이연·무효를 항상 따로 싣고 단일 종결률을 만들지 않는다. Validation 검사 2가 합계 일치만 보고 비율을 보지 않는 것도 같은 이유다 |
| 판정 원장이 C11에 흡수되지 못하고 영구 사이드카가 된다 | 중 | DD9 — Validation 검사 3이 C11 자신의 `validateDisposition` 을 호출해 **M6 봉인에 대해 전건 유효**함을 강제한다. 재봉인 시 재작성이 필요한 것은 DD2가 명시한 결속 축 2개뿐이고, 그 재작성은 C11 M2 소유다. 이 plan은 흡수 자체를 약속하지 않는다 |
| 분모가 사이클 중에 움직여 acceptance가 재현되지 않는다 (C11이 2487→2514로 실증) | **높음** | DD8·DD10 — 고정 OID(런북 B2의 커밋). 검사 1이 `git archive` 로 그 트리를 꺼내 재계산하고 산출물과 **대조해 비영점 exit** 하며, 검사 0이 그 OID를 m7b tip과 HEAD 사이로 묶는다. 초판의 "두 번 돌려 같은 값"은 정의상 항상 참이라 아무것도 반증하지 않았다 |
| M7이 `halt`로 끝난다 (2026-09-22) | 중 | DD13 — M6 구현은 진행하고 OQ5는 M7 plan을 successor로 하는 `이연`. M6 ship은 B4에서 멈춘다 — M6 PR이 M5·M7 코드를 대신 싣지 않게 |
| `M6-DISP` 이의 규칙이 원장 대부분을 `deferred`로 내린다 | 중 | 의도된 방향이다(DD15) — 과하게 연 원장은 정직하고 과하게 닫은 원장은 거짓이다. `closure.md`가 해소·이연·무효를 나란히 싣는다(DD5) |
| 헤드리스 하위 세션이 위장 성공한다 | 중 | M7 런북의 디스크 대조 3종을 B 단계에도 그대로 적용한다. 자기 보고는 판정 근거가 아니다 |
| 판정이 형식만 채우고 근거가 비어 통과한다 | 중 | 근거의 정의를 자유 텍스트 `note` 가 아니라 C11 의 `evidence`(경로 실재까지 판정) 로 옮겼다(DD9·검사 3). 다만 이것은 여전히 **형식 검사이지 품질 검사가 아니다** — 성의 없는 근거를 막는 장치는 리뷰뿐이다 |
| M7이 in-progress라 같은 PRD의 두 마일스톤이 동시에 원장을 건드린다 | 중 | M7의 축은 라이브 링크 실값이고 원장을 쓰지 않는다. M7 사이클이 낳은 backlog 행은 이 분모에 **포함**되며(UI2) 그 사실을 `closure.md`에 적는다 |
| 판정 뒤 backlog에 새 행이 쌓여 커버리지가 즉시 깨진다 | **높음** | 깨지는 것이 정상이다 — 스냅샷 의미론이고 C11이 그 갱신을 소유한다. `closure.md`가 이 한계를 봉인 문구로 적는다. M6는 상시 100%를 약속하지 않는다 |
| `/mccp:pr`이 이 브랜치에서 `review-record-linkage-m7b` 슬러그를 파생한다 (실측 — 구현 receipt fallback) | 중 | B1이 `mccp-implement-codex/review-record-linkage-m6.json`을 쓰면 `receiptExistsForSlug`가 참이 되어 해소된다(DD14). B2가 `derive-decision --command mccp:pr`의 값을 확인하고 어긋나면 `halt` |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)
- [ ] 분모가 경계 OID 에서 재계산한 값과 해시·개수·OID 세 축으로 일치하고, 경계가 구현 시점의 HEAD 와 같다 (검사 0·1)
- [ ] 판정 원장의 item_id 집합이 분모와 **정확히** 일치한다 — 누락 0 · 중복 0 · 분모 밖 0 (검사 2)
- [ ] 전건이 C11 의 `validateDisposition` 을 M6 봉인에 대해 통과한다 (검사 3)
- [ ] 원장이 전건 M6 봉인에 결속돼 있고, `closure.md` 가 재봉인 시 재작성될 두 축을 선언한다 (검사 4)
- [ ] `severity=FAIL` item 이 조인 기준으로 전건 `rejected` 다 (검사 5)
- [ ] 해소·이연·무효 3분할의 합이 분모와 일치하고 단일 종결률을 만들지 않는다 (검사 6)
- [ ] Open Questions 5건이 PRD 본문에서 각각 판정 문구를 갖는다
- [ ] `fix-task:review-record-linkage-m3` 1건이 분모의 원소로서 판정됐다 (DD11)
- [ ] C11 의 `debt-dispositions.jsonl`·`debt-inventory.json` 이 **무변경**이고 `verify` 가
      `seal_intact: true` · `open: 0` 을 유지한다 (검사 7)
- [ ] backlog 표가 4열을 유지한다 (검사 8)
- [ ] findings 원장 제외분이 경계에서 잰 수치와 함께 기록됐다 (DD6 — `c9c8d22` 참고값 215)
- [ ] `plugin.json` version 선언 0건 (검사 9)
- [ ] M6 ship 의 링크 판정과 그 이유가 보고서에 있다 — 상류 plan receipt 는 review 축 없이 override 로 봉인됐다 (DD14 H2)
- [ ] HSR 판정 전건이 원문 출력과 함께 기록되고 재계산으로 일치하며(검사 11), 이의가 있는 item 에 비-`deferred` 판정이 0건이다 (검사 12)
- [ ] PRD M7 행이 M7 의 `--check-live-linkage` 종료코드와 정합한다 (검사 13)
- [ ] PRD Open Questions 다섯 줄이 각각 HSR `M6-OQn` 의 결과를 `판정: <결과>` 로 담고, `이연` 은 체크하지 않는다 (검사 14)
- [ ] M6 ship 이 M7 ship 뒤에 일어났다 (런북 B4)

**라이브 완주가 산출해야 할 것**: 검사 1~7 이 이 워크트리에서 실제로 exit 0 을 내고 그 출력이
보고서에 인용된다. 새 상주 코드를 만들지 않으므로(DD3) 단위 test 는 이 마일스톤에 없다 —
acceptance 는 **산출된 실값**이지 test 통과가 아니다. 검사 3 이 그 실값의 중심이다: C11 이
스스로 정의한 수용 술어가 이 원장을 받아들이는가.

## Open Questions

- M6의 판정 원장이 C11 M2의 재봉인에 실제로 흡수되는지는 M2가 착지해야 확인된다. 이 plan은
  **흡수 가능한 형태**를 보장할 뿐 흡수를 보장하지 않는다. M2가 다른 신원 규약을 택하면
  이 원장은 재키잉이 필요하고, 그 비용은 131행이다
- `findings` 원장 215건(DD6 제외분)의 소유 축이 미정이다. C11의 분모 문제로 보이지만 C11 PRD가
  그 부분집합을 명시적으로 다루지는 않는다

## External Research Provenance

- Source PRD: .claude/prds/review-record-linkage.prd.md
- References section sha256: 6285d0d8018061d14bd81f59fab68b7c3fcdd25580472eb34dd5b2f6449f5647
- Stamped at: 2026-09-08T08:55:39.127Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## Design Critique

⚠️ DEGRADED: single-context (Assessment A 서브에이전트 미실행)

- 트리거: `impeccable-detect.js` `design_signal=true`, `signal_files=["<keyword:design>"]` — 이 plan의
  `## Design Decisions` 제목이 키워드로 걸린 것이고 **렌더링 surface 변경은 0건**이다.
- 호출 형태: `Skill(impeccable:impeccable, "critique …")` (오라클 해소값, plugin 4.2.2)
- Assessment B (결정적 탐지기): `impeccable detect --json` 을 plan 파일과 이 plan 이 쓰는
  `docs/review-record-linkage/` 양쪽에 실행 → 둘 다 `[]` · exit 0.
- Assessment A (디자인 리뷰 서브에이전트): **미실행**. 사유 셋 — 대상에 마크업·뷰어블 surface 가
  없고, 탐지기가 양쪽에서 0건을 냈으며, 이 세션이 이미 `catastrophic-usd` 비용 티어다.
  playbook 이 요구하는 대로 은폐하지 않고 배너로 표기한다.
- 판정: `decideCritique(findings=[], round=0, cap=2)` → **CONVERGED** (rounds=1)
- 4 Output Constraints 대조: 이 plan 은 렌더 surface 를 만들지 않으므로 H15(heading depth ≤ 3) 만
  적용 가능하며 본문의 최대 depth 는 `###` 다. 나머지 셋(강조색·raw marker·항목 수 상한)은
  뷰포트가 없어 판정 대상이 아니다.

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->

## Review Absorption (R0)

R0 L2 패널(4관점 · 전원 `fail` · findings 17 · blocking 12)의 판정은
`.claude/reviews/plan-review-review-record-linkage-m6.md` 가 소유한다. 라운드 원장은
`mccp-plan-codex__review-record-linkage-m6` 1/1 이고 **재리뷰하지 않는다**(§3.16).
인용은 전건 직접 열어 확인했고 **정확했다** — 아래는 무엇이 바뀌었는지의 기록이다.

| 축 | 지적 (관점/심각도) | 이 라운드의 처리 |
|---|---|---|
| A. DD2 반증 | architect HIGH · security MEDIUM · test HIGH+MEDIUM · invariant HIGH | DD2 **재작성**. "재키잉 없이 흡수"를 철회하고 결속 축 2개(`inventory_sha256` · `deferred` successor 본문 sha)의 재작성 필요를 명시. 근거 `debt-inventory.js:544` · `:597` · `:484` |
| B. 수용 술어 미검사 | architect HIGH · security MEDIUM · test HIGH · invariant HIGH | DD9 신설 + 검사 3이 `di.validateDisposition` 을 직접 호출. enum·note 검사로는 131행이 green 통과 후 `appendDispositions` all-or-nothing 에 전량 거부됨(`:551-555`) |
| C. 분모 자기참조 | security HIGH · test HIGH · invariant HIGH | DD10 신설 + 검사 1이 고정 OID 를 `git archive` 로 꺼내 재계산·대조하고 **비영점 exit**. 초판 검사 1은 `console.log` 뿐이라 어떤 입력에도 exit 0 이었다 |
| D. 행 대 item 신원 | architect MEDIUM | DD12 신설. 회계 단위를 item 으로 고정하고 `identical_rows_collapsed` 를 산출물에 기록 |
| E. fix-task 대 `extra=0` 자기모순 | architect MEDIUM | DD11 신설. 분모를 `source ∈ {backlog, fix-task}` 로 넓혀 해소(132). Open Questions 는 inventory 원소가 아니므로 PRD 에서 판정 |
| F. Validate 라인에 기계 명령 부재 | test MEDIUM | Task 0·2·3·4·5·6 의 Validate 를 전부 `## Validation` 의 번호 검사로 교체 |
| G. 회귀 범위 하드코딩 | test MEDIUM | 검사 10 이 변경된 plugin 디렉토리에서 test 를 **도출**한다 |
| H. 근거의 정의가 `note` | invariant MEDIUM | 근거 축을 C11 의 `evidence` 로 이전(검사 3). `note` 는 부가 서술로 남김 |
| I. 검사 5 의 base 의존 | security LOW | C11 무손상 판정을 `origin/main` diff 에서 `HEAD` diff 로 바꿔 병합 갱신에 흔들리지 않게 함 |

**미흡수 0건.** 이 라운드의 17건은 전부 위 9축 중 하나로 처리됐으므로 backlog 이연분이 없다.
다만 그 흡수가 재리뷰되지 않았다는 사실은 2026-09-22 R1 cap 도달 때 backlog 1행(HIGH)으로
적었다 — 이연된 finding이 아니라 미검증 흡수와 게이트 이탈의 기록이며, M6 분모의 원소가 된다.

> **2026-09-22 — 아래 "재리뷰하지 않는다"는 유지된다.** 같은 날의 개정 1차가 DD14로 그것을
> 번복하려 했으나 HSR 판정점 `P0-M6CAP`가 `halt`로 기각했다(DD14). R0 흡수와 2026-09-22 개정을
> 사람 대신 검토한 것은 HSR `P0`·`P1`이다 (`docs/review-record-linkage/hsr-decisions.jsonl`).
> 같은 날 R1은 cap(1/1)으로 5.2c에서 멈췄고, 사람의 판정 H2로 비승인 receipt가 발행됐다(DD14 H2).

**주장하지 않는 것**: 흡수된 plan 은 **재리뷰되지 않았다.** 승인 receipt 는 없다 — 2026-09-22 에
발행된 `mccp-plan-codex/review-record-linkage-m6` 은 `codex_verdict=divergent` ·
`intent_gate_verdict=incomplete` 의 비승인 기록이다(DD14 H2). `reviewed_plan_hash`
`sha256:cad26f0e…` 는 흡수 **이전**의 본문을 가리킨다. 즉 위 처리의 정확성은 이 라운드가
보증하지 않으며, 검증은 구현 단계의 `## Validation` 실행과 하류 게이트가 맡는다.
