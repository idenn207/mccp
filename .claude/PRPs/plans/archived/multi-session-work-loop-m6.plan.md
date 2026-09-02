# Plan: Multi-Session Work Loop M6 — 진행 상태 기계 판정 (B1)

**Source PRD**: `.claude/prds/multi-session-work-loop.prd.md`
**Selected Milestone**: M6 — 진행 상태 기계 판정
**Complexity**: Medium

## 착수 전 producer 의존성 선언 (PRD Risks 필수 항목)

PRD Risks 표는 *"milestone 착수 시 이 milestone이 의존하는 지표의 producer가 프로덕션에서
산출하는가를 GROUND 필수 항목으로 검사하고, 아니면 그 사실을 plan 상단에 명시한다"* 를 요구한다.
실측 결과는 다음과 같다.

| 축 | 프로덕션 산출 여부 | 판정 |
|---|---|---|
| **B1** (본 milestone 소관) | **없음** — `msw-metrics/index.js:353` `computeB1`이 무조건 `insufficient('independent evidence source unavailable')` 반환 | M6이 **직접 배송**한다. M8 소관이 아니다(M8 목록은 A1·A2·B3·C2·C3) |
| 독립 증거 corpus (`mccp-pr-codex` ship receipt) | **있음** — git-tracked 46건 (`git ls-files .claude/receipts/`) | §3.12 durable-evidence-substrate가 이미 닫음. 전향 수집 대기 불필요 |
| 문서 status corpus (PRD `## Delivery Milestones`) | **있음** — 활성 PRD 본문 | 파서 3종 기존(`plan-body.js` `parseDeliveryMilestones*`) |
| A1·A2·B3·C2·C3 producer | 없음 (M8 소관) | M6은 **의존하지 않는다** |
| A4 producer | M5 배송, `computed` 전환 미확인 | M6은 **의존하지 않는다** |

**따라서 M6은 M3·M4가 겪은 "자기 producer를 즉석에서 떠안는" 패턴에 해당하지 않는다** — B1
producer는 처음부터 M6의 outcome 그 자체다. 그리고 A4와 달리 **입력 corpus가 이미 전부 존재하므로
`computed` 전환이 이번 사이클 안에서 관측 가능하다**(A4는 hook 발화 + 새 세션이 필요해 미확인으로
남았다). 이 차이가 Acceptance의 라이브 실측 항목을 실행 가능하게 만든다.

## Summary

`computeB1`은 M2 이래 "독립 증거 소스 없음"으로 상수 `insufficient`를 반환해 왔고, 그 결과 이 PRD는
**자기 자신의 status drift를 보지 못했다**(PRD Evidence: M2 행이 `complete`인데 지표 산출은 0건이었고
사람이 손으로 찾아야 했다). M6은 문서 status와 **문서에서 파생되지 않은** 증거를 대조하는 판정
오라클을 배송해 B1을 `computed`로 뒤집고, 그 판정을 대시보드와 기존 drift 교정 명령이 **같은 오라클**로
공유하게 만든다.

핵심 설계 결정 하나를 먼저 밝힌다: **B1은 문서를 증거의 투영으로 만들어 닫지 않는다.** status를 자동으로
증거에 맞춰 써 넣으면 두 소스가 의존 관계가 되어 drift가 구조적으로 0이 되고, 계약의 무결성 검사
(`동일 소스 파생이면 그 주기의 B1은 무효`)에 의해 지표 자체가 무효가 된다. M6이 만드는 것은 **판정과
가시화**이며, 교정은 사람이 승인하는 기존 명령에 남는다.

## User Intent

<!-- USER-STATED constraints only — PRD 본문이 운영자와 공동 작성된 요구사항이므로 그 진술을 옮긴다.
     저자 정당화(왜 이렇게 설계했는가)는 여기 넣지 않는다. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 이번 주기에 게이트 강도는 그대로 유지하고 Codex 이중 검사와 증거 chain과 dual-review 불변식을 조정하지 않는다 | exclusion |
| UI2 | 작업 단위 정의는 PRD milestone 하나가 plan 하나이자 PR 하나이며 착수 후 재정의하거나 세분화하지 않는다 | constraint |
| UI3 | B1의 독립 증거 판정 소스로 completion-ledger를 쓰지 않는다 | exclusion |
| UI4 | B1은 불일치 비율이 아니라 불일치 건수의 절대값으로 보고하고 목표는 0건이다 | constraint |
| UI5 | 두 소스의 독립성을 지표 산출 시점에 검증하고 동일 소스에서 파생된 것으로 확인되면 그 주기의 B1은 무효로 한다 | constraint |
| UI6 | 지표가 프로덕션에서 computed로 뒤집히는 것만 완료 판정 근거이며 코드가 존재한다는 사실은 근거가 아니다 | constraint |
| UI7 | 계측 경로에 추가 LLM 호출을 도입하지 않고 이벤트 기록은 구조화 데이터로만 남긴다 | exclusion |
| UI8 | 지표는 숫자로만 존재하지 않고 기존 대시보드 표면에서 추세와 함께 조회 가능해야 한다 | direction |
| UI9 | 상태 모델을 손댈 때 기존 소비처가 변경 없이 동작하도록 파생 뷰를 유지한다 | constraint |
| UI10 | milestone 완료 여부를 사람이 아니라 증거가 판정하게 한다 | direction |
| UI11 | drift 교정 전용 명령이 상시 필요하지 않게 한다 | direction |
| UI12 | 환경 토글과 증거 메타 필드의 단조 증가를 억제하고 새 축 도입을 최소화한다 | constraint |
| UI13 | 팀 협업과 다중 사용자 동기화와 외부 프로젝트 대조군은 이번 주기에서 다루지 않는다 | exclusion |
| UI14 | 지표 산출값은 감사 표본으로 사람이 직접 확인해 대조할 수 있어야 한다 | constraint |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 지표 compute 계약 | `plugins/mccp/scripts/lib/msw-metrics/index.js:278-351` (`computeA4`) | 무결성 위반(`invalid`)을 producer 부재(`forward-only`)보다 **먼저** 판정. source `degraded` → `invalid`, 경계 0 → `insufficient`, 정상 → `computed` |
| 분모 정직화 병기 | `plugins/mccp/scripts/lib/msw-metrics/index.js:486-503` (`computeB3` `coReport`) | `raw_surface_count`/`excluded_count`를 값 옆에 병기해 "명시 제외"가 "감축"으로 읽히지 않게 함 |
| 경계 스코프 분자 | `plugins/mccp/scripts/lib/msw-metrics/a4-boundary-restore.js` + `derive/sources/session-journal.js` | 순수 오라클(계산) ↔ derive source(관측) 2층 분리. source가 `a4` 하위 객체를 실어 `computeA4`가 소비 |
| 결정적 스캔 ↔ 추론 분리 | `plugins/mccp/scripts/lib/archive-complete/scan.js:1-19` | 결정적 판정은 모듈이, 평가는 command agent가. loud fail-open(throw 안 함) + `warnings` 싱크 |
| fail-closed 행 열거 | `plugins/mccp/scripts/lib/archive-complete/scan.js:92-148` | `rawRowCount` 분모 + 버킷 합 등식. 비정규 status 행이 분모에서 증발하는 오분류(F1) 차단 |
| 증거 join 규약 | `plugins/mccp/scripts/lib/evidence-audit.js:1-50` | `decision_id` 1차 키. 대조 대상 0이면 절대 `ok` 반환 금지(`state='blind'`) — 부재는 결함 부재가 아니다 |
| verdict 해석 | `plugins/mccp/scripts/lib/receipt-convergence.js` `isConvergedVerdict` | `resolution.converged`(always-true)가 아니라 `resolution.codex_verdict`로 판정 (§3.12) |
| derive source 계약 | `plugins/mccp/scripts/derive/sources/session-journal.js` | `{ ok, degraded, error, producer_coverage, ... }` per-source fail-open. `derive/index.js`에 등록 |
| 대시보드 렌더 제약 | `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js:104-140` | `STATUS_META` 색 클래스 1개 · 정렬 우선순위 함수 · `forward-only`는 값 `-` |
| 테스트 | `plugins/mccp/scripts/lib/tests/msw-metrics.test.js` · `plugins/mccp/scripts/lib/tests/a4-boundary-restore.test.js` (node native `node --test`) | msw-metrics 계열 test는 모듈별 `tests/`가 아니라 **`lib/tests/` 평면**에 산다. describe/it + `assert/strict`, fixture는 tmpdir |
| 단언 ↔ test 기계 대조 | `docs/multi-session-work-loop/m5-assertion-manifest.json` | 설계 문서 단언마다 test 제목을 매핑하고 absent 0을 강제 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/msw-metrics/b1-status-drift.js` | CREATE | 독립 증거 판정 오라클 + drift 대조. 순수 함수(주입된 reader만 사용), `completion-ledger` import 0 |
| `plugins/mccp/scripts/lib/msw-metrics/b1-evidence-builder.js` | CREATE | **증거 구성의 유일한 I/O 지점** — receipt 커밋 도달성 + git 도달성 조회. source와 `scan.js`가 둘 다 이것만 호출해 출처를 구조적으로 보장 (R7 invariant HIGH ×2) |
| `plugins/mccp/scripts/lib/msw-metrics/b1-independence-lint.js` | CREATE | 독립성의 **정적** 집행부 — 판정 경로가 문서 status 셀·ledger를 읽지 않음 + `receiptPresent` 생성이 builder 밖 0건임을 소스 스캔으로 단언 (M5 `single-writer-lint.js` 미러) |
| `plugins/mccp/scripts/derive/sources/milestone-evidence.js` | CREATE | 활성 PRD 행 열거 + 증거 조회 + drift 목록/카운트를 통합 모델에 노출 |
| `plugins/mccp/scripts/derive/index.js` | UPDATE | `milestone_evidence` source 등록 (미등록이면 `computeB1`이 영구 `insufficient`) |
| `plugins/mccp/scripts/lib/msw-metrics/index.js` | UPDATE | `computeB1`을 source 소비로 교체. `invalid` > `insufficient` > `computed` 우선순위 + 병기 필드 |
| `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js` | UPDATE | B1을 **건수**로 렌더(비율 아님) + drift 상세를 `coReportDetails`의 단일 muted 줄로 병기(상위 3건 `·` 연결 + `(+N건)` 절삭 표기, **새 `<details>` 미도입**) |
| `plugins/mccp/scripts/lib/archive-complete/scan.js` | UPDATE | `collectDriftEvidence`의 **판정 축**을 공유 오라클로 교체. ledger는 판정에서 내리고 참고 인용으로만 병기 |
| `plugins/mccp/scripts/lib/tests/b1-status-drift.test.js` | CREATE | 오라클 단위 + **status 변조 불변성**(독립성 반증 test) |
| `plugins/mccp/scripts/lib/tests/b1-independence-lint.test.js` | CREATE | 정적 lint가 위반 형태를 실제로 잡는지(음성 대조 포함) |
| `plugins/mccp/scripts/lib/tests/msw-metrics.test.js` | UPDATE | `computeB1` 사다리(`invalid` > `insufficient` > `computed`) + 병기 필드 회귀 |
| `plugins/mccp/scripts/lib/tests/msw-metrics-render.test.js` | UPDATE | B1 건수 렌더 + 상위 3건/`(+N건)` 절삭 + **`<details>` 개수 불변** + 인라인 마커·em-dash 정규화 회귀 |
| `plugins/mccp/scripts/derive/tests/milestone-evidence.test.js` | CREATE | source 계약 + degraded fail-open + 아카이브 제외 병기 |
| `plugins/mccp/scripts/lib/archive-complete/tests/scan.test.js` | UPDATE | ledger 강등 후에도 archivable 판정(C2·C3·C4)이 **불변**임을 회귀로 고정 |
| `docs/multi-session-work-loop/status-adjudication-design.md` | CREATE | 보증/비보증 · 독립성 논증 · 위협 모델 · 판정 사다리. M5 `state-truth-source-design.md` 미러 |
| `docs/multi-session-work-loop/m6-assertion-manifest.json` | CREATE | **Acceptance의 기계 판독 사본** — 요구 단언 ↔ test 제목 매핑(absent 0 강제) |
| `plugins/mccp/scripts/lib/msw-metrics/assertion-manifest-check.js` | CREATE | manifest 대조기. `REQUIRED_IDS` 17종 하드코딩 + 누락 id 종류별 열거 후 비영점 exit (M5 매니페스트 계약 미러) |
| `plugins/mccp/scripts/lib/tests/assertion-manifest-check.test.js` | CREATE | **대조기 자신의 test** — 무력한 대조기(항상 exit 0)가 Validation을 통과시키는 것을 막는다 |
| `docs/multi-session-work-loop/m6-before.json` | CREATE | Task 0 전환 전 스냅샷 + 앵커(`commit_sha`·`plan_file_hash`) |
| `docs/multi-session-work-loop/m6-after.json` | CREATE | Task 9 전환 후 스냅샷. before와 **동일 스키마·동일 앵커** |
| `docs/multi-session-work-loop/m6-audit-sample.json` | CREATE | UI14 감사 표본 결과(기계 판독 형식). 부재/표본 미달/앵커 불일치는 Validate 차단 |
| `docs/multi-session-work-loop/measurement-instrumentation.md` | UPDATE | B1 행을 producer 명시 + 전환 조건으로 갱신 |
| `.claude/prds/multi-session-work-loop.prd.md` | UPDATE | M6 행 `pending` → `in-progress` + Plan 셀 링크 (착수 시) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.23.10` → `1.23.11` (단일 milestone ship = patch, §3.7) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 (§3.7 5면 동기) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | version 단언 2개 동기 |
| `CHANGELOG.md` | UPDATE | `[1.23.11]` 항목 + `currently` 노트 갱신 |

## Tasks

### Task 0: 착수 실측 스냅샷 — B1 전환 전 상태를 봉인
- **Action**: `node plugins/mccp/scripts/derive/cli.js run --json`을 실행해 현재 10개 지표의
  `{id, status, invalid_reason}`을 `docs/multi-session-work-loop/m6-before.json`으로 봉인한다.
  B1이 `insufficient`임을 이 파일이 증명해야 이후 "전환했다"는 주장이 반증 가능해진다.
- **앵커를 함께 봉인한다 (L2 invariant MEDIUM 흡수)**: 스냅샷 단독은 *언제·어느 트리에서* 잰 값인지를
  말하지 않아 "전환했다"의 증거로 약하다. `{ metrics, anchor: { commit_sha, plan_file_hash, measured_at,
  plugin_version } }` 형태로 감싼다. Task 9의 `m6-after.json`도 **동일 스키마**로 쓰고, 두 앵커의
  `plan_file_hash`가 다르면 대조가 성립하지 않으므로 Validate에서 차단한다.
- **`plan_file_hash` 계산은 명시된 한 줄이다 (R3 test MEDIUM 흡수)**: "receipt의 `plan_hash` 기법 차용"은
  구현 지시가 아니었다. **정의**: `sha256(plan 파일 바이트, CRLF→LF 정규화 후)`의 hex, prefix 없음.
  emitter는 다음을 그대로 쓴다 — `crypto.createHash('sha256').update(fs.readFileSync(planPath,'utf8')
  .replace(/\r\n/g,'\n'),'utf8').digest('hex')`. receipt의 `plan_hash`를 **재사용하지 않는 이유**는
  그것이 receipt 스키마에 묶인 값이라 여기서 끌어오면 §3.12 no-rehash 계약과 얽히기 때문이다.
  여기 필요한 것은 "두 스냅샷이 같은 plan을 설명하는가" 하나뿐이므로 독립된 로컬 정의로 충분하다.
- **증거 corpus의 규모도 앵커에 봉인한다 (R4 invariant MEDIUM 흡수)**: 이 plan 상단은 "git-tracked
  46건"을 producer 의존성 근거로 적었으나 그 수는 어디서도 검증되지 않는다. 앵커에
  `tracked_receipt_count`(= `git ls-files .claude/receipts/mccp-pr-codex/ | wc -l`)를 넣어 before/after
  양쪽에 봉인한다. **이 수는 게이트가 아니라 관측이다** — 값이 달라도 차단하지 않고, 달라졌다는
  사실이 보고서에 드러나게만 한다(사이클 중 새 ship이 나면 정상적으로 늘어난다). 46이라는 숫자에
  판정을 걸면 그 자체가 새로운 취성이 된다.
  - **여기서 `git ls-files`를 쓰는 것은 `receiptPresent`의 판정식과 무관하다** — 이쪽은
    *"corpus가 대략 얼마나 되는가"* 라는 관측이고 게이트가 아니므로 index 기준으로 충분하다.
    판정에 쓰이는 `receiptPresent`만이 커밋 도달성(`git cat-file -e HEAD:`)을 요구한다(Task 3 · R7).
    같은 명령이 두 곳에 나오는 것은 혼동이 아니라 **질문이 다름**이다.
- **분모의 통약성도 앵커에 봉인한다 (R6 invariant MEDIUM 흡수 — 실결함)**: `plan_file_hash` 하나로는
  before/after가 **같은 분모를 설명한다**를 보증하지 못한다. B1의 `denominator`는 활성 PRD
  `## Delivery Milestones` 표의 행 수에서 나오고, 그 표는 **plan을 한 글자도 건드리지 않고** 바뀔 수
  있다(M7 행 추가·타 PRD 등장). 그러면 `denominator`가 5→6으로 달라진 채 앵커 대조를 통과해
  `insufficient → computed` 전환이 서로 다른 모집단 위에서 주장된다. 앵커에
  `prd_milestone_rows`(= 활성 `.claude/prds/*.prd.md` **비재귀** 스캔의 `## Delivery Milestones` 원시
  행 수 합계, Task 3의 `raw_row_count`와 동일한 세는 법)를 넣고 **Validation §3이 before/after 일치를
  검사해 불일치 시 throw**한다. `plan_file_hash`와 달리 이것은 **게이트**다 — 통약 불가한 두 수를
  나란히 놓고 "전환했다"고 말하는 것은 측정이 아니다. 복구는 Task 0 재실행이다(아래).
- **Task 0 재실행은 허용하되 기록한다 (R4 invariant LOW 흡수)**: before 앵커는 구현자가 Task 0을 다시
  돌려 갱신할 수 있고 이는 의도된 복구 경로다(위 "앵커 대조는 사후적이다"). 다만 재실행하면 `anchor`의
  `measured_at`·`commit_sha`가 바뀌므로, **구현 보고서에 재실행 사실과 사유를 적는 것**을 Acceptance
  항목으로 둔다. 불변식으로 막을 수 없는 것을 막은 척하지 않고, 흔적이 남게 한다.
  - **이 기록은 기계적으로 강제되지 않으며, 그렇게 남긴다 (R6 invariant MEDIUM — 비보증으로 흡수)**:
    before 스냅샷은 in-place 덮어쓰기라 재실행하면 원본이 사라지고, Validate는 "재실행했는지"를 알
    방법이 없다(재실행한 앵커와 처음부터 그 값이었던 앵커는 구별 불가능하다). 강제하려면 세대별
    스냅샷 보존과 그 자체의 무결성 검사가 필요한데, 이는 M6이 만드는 지표보다 큰 기판이라
    **UI12(축 최소화)에 정면으로 반한다**. 따라서 이 항목은 **사람의 보고 규율**이고 게이트가
    아니다 — `status-adjudication-design.md` 비보증 절에 그렇게 적는다. 막을 수 없는 것을 막은 척하지
    않는 것이 이 plan의 기조다.
- **앵커는 자기 자신을 검증한다 (R3 invariant MEDIUM 흡수 — 실결함)**: 초안 Validate는 필드 *존재*만
  봤다. 그러면 기록된 해시가 실제 파일과 다를 수 있고, before/after를 같은 가짜 값으로 맞추면
  편집을 숨긴 채 통과한다. Validate는 **디스크의 plan 파일을 다시 해싱해 `anchor.plan_file_hash`와
  일치**하는지 확인한다. 이것으로 위조가 불가능해지는 것은 아니지만(둘 다 다시 쓰면 그만) —
  §3.12가 이미 인정한 한계다 — **편집을 잊고 넘어가는 정직한 실수**는 확실히 잡힌다.
- **Mirror**: M4의 `a3-baseline.json` 봉인 패턴 — emitter가 재봉인을 거부해 주장을 반증 가능하게 유지.
- **Validate**:
  ```bash
  node -e "
    const fs=require('fs'), crypto=require('crypto');
    const j=require('./docs/multi-session-work-loop/m6-before.json');
    if (j.metrics.B1.status !== 'insufficient')
      throw new Error('B1 already flipped — baseline invalid');
    if (!j.anchor || !j.anchor.commit_sha || !j.anchor.plan_file_hash)
      throw new Error('anchor missing');
    if (typeof j.anchor.prd_milestone_rows !== 'number')
      throw new Error('anchor.prd_milestone_rows missing — before/after denominators would be incommensurable');
    const live = crypto.createHash('sha256')
      .update(fs.readFileSync('.claude/plans/multi-session-work-loop-m6.plan.md','utf8')
        .replace(/\r\n/g,'\n'),'utf8').digest('hex');
    if (live !== j.anchor.plan_file_hash)
      throw new Error('anchor.plan_file_hash does not match the plan on disk — re-run Task 0');"
  ```

### Task 1: 독립 증거 판정 오라클 (`b1-status-drift.js` — `adjudicateMilestone`)
- **Action**: **순수** 함수 `adjudicateMilestone({ planBasename, planPath, evidence })`
  → `{ verdict, source, evidence_ref, codex_verdict, reason }`.
  `verdict ∈ { shipped, not-shipped, undetermined }`.
  - `shipped`: `mccp-pr-codex/<decision_id>.json`이 **git-tracked**로 존재하고 스키마상 판독된다.
  - `not-shipped`: 위 receipt 부재 ∧ plan 파일이 default branch에서 도달 불가.
  - `undetermined`: plan 링크 부재 · receipt 판독 실패 · git 조회 실패 · **basename 충돌**(아래).
    **`not-shipped`로 뭉개지 않는다**(부재는 결함 부재가 아니다 — `evidence-audit.js` E1 규칙의 동형).
- **`shipped`는 "PR이 났는가"이지 "Codex가 승인했는가"가 아니다 (R2 architect MEDIUM 흡수 — 실결함)**:
  초안은 `shipped`의 전제로 `resolution.codex_verdict`가 ship verdict일 것을 요구했다. **틀렸다.**
  B1의 문서 status `complete`는 *그 작업 단위가 ship됐다*는 뜻이고, mccp는 `MCCP_FORCE_PR_WITHOUT_
  CODEX_CONVERGENCE` audited override로 **divergent인 채 ship하는 경로를 정식으로 갖는다** — 바로 앞
  milestone인 M5가 그 경로로 ship됐다(`pr_codex_force_override=true`). 초안 규칙대로면 그런 행은
  `shipped`가 아니게 되어 **정상 ship을 drift로 오계상**한다. ship 여부의 기계적 증거는 **receipt의
  존재 그 자체**다 — terminal `/mccp:pr`의 ship gate는 no-ship 시 finalize에서 `exit 12`로 멈춰
  receipt를 쓰지 않으므로(§1.2 M3), git-tracked ship receipt가 있다는 것은 그 게이트를 통과했다는 뜻이다.
  `codex_verdict`는 **`shipped` 판정에서 빠지고 `codex_verdict` 필드로 병기**되어 감사에서 보이되
  분자에는 영향을 주지 않는다(B3 `coReport` 병기 패턴). 이 구분은 `status-adjudication-design.md`의
  보증 절에 "판정 질문은 ship 여부이지 승인 품질이 아니다"로 명시한다.
- **`evidence` 객체 스키마 (형식 명세 — R2 architect·security MEDIUM 흡수)**: 오라클↔source 경계는
  이름 나열이 아니라 계약이어야 한다. 정확히 다음 5필드이며 그 외 키는 **거부**한다(오라클이
  `undetermined` + `reason:'evidence-schema-invalid'`를 반환):

  | 필드 | 타입 | 의미 |
  |---|---|---|
  | `receiptPresent` | `boolean` | `mccp-pr-codex/<decision_id>.json`이 **커밋에 도달 가능**(`git cat-file -e HEAD:<path>`로 확인 — Task 3 참조). 워킹트리 존재만으로는 `false`이고 **index 등재(staged-only)만으로도 `false`** 다 — §3.12가 ship receipt를 git-tracked로 규정한 근거가 worktree 삭제 후에도 대조가 성립하는 것이므로, 커밋되지 않은 사본은 감사 corpus가 아니다 |
  | `receiptVerdict` | `string \| null` | `resolution.codex_verdict` 원문. 열거 밖 값이나 부재는 `null`. **판정에 쓰이지 않고 병기 전용** |
  | `gitReachable` | `boolean \| null` | plan 파일이 default branch에서 도달 가능. `null` = 조회 실패(→ `undetermined`) |
  | `readError` | `string \| null` | 위 조회 중 발생한 오류 메시지. non-null이면 `undetermined` |
  | `duplicateKey` | `boolean` | 같은 PRD 안에서 `decision_id`가 중복됨(→ `undetermined`) |

  **검증 책임은 오라클에 있다**(source가 아니라). source는 관측만 하고, 오라클이 스키마를 확인한 뒤
  판정한다 — 검증을 주입 측에 두면 "잘못된 evidence를 만든 source"와 "그것을 믿은 오라클"의 책임이
  섞이고, 오라클 단위 test가 malformed 입력을 직접 먹여볼 수 없게 된다.
- **`decision_id` 파생 규칙 (명시 — L2 invariant/security 흡수)**: `decision_id = planBasename`에서
  후행 `.plan.md`를 대소문자 무시로 제거한 문자열이며, 이는 `archive-complete/scan.js`
  `decisionFromBasename`(`replace(/\.plan\.md$/i, '')`)과 **동일 규칙**이다.
  - **`scan.js`에서 import하지 않고 오라클 안에 재구현한다 (R2 architect LOW 흡수)**: `scan.js`는
    `fs`·`child_process`를 직접 require하므로(`:21-23`) 이를 import하면 오라클의 순수성 주장이
    전이 의존으로 깨진다. 대신 한 줄 정규식을 재구현하고, **두 구현이 동치임을 test로 고정**한다
    (동일 입력 집합에 대해 출력 일치). lint는 **직접 require만** 검사하며(전이 추적 안 함) 그
    범위 한계를 비보증 절에 적는다 — 그래서 import 회피가 규율이 아니라 test로 지켜진다.
- **basename 유일성은 fail-closed다 (security MEDIUM 흡수)**: `decision_id`는 파생 키이므로 서로 다른
  두 milestone 행이 같은 basename을 선언하면 **같은 receipt를 가리켜 verdict가 조용히 복제**된다.
  Task 3의 열거 단계가 PRD **내부**에서 `decision_id` 중복을 먼저 검출하고, 충돌한 행 **전부**를
  `undetermined`로 강등 + `warnings`에 사유를 싣는다. 첫 행을 채택하는 방식은 금지한다 — 어느 쪽이
  옳은지 증거가 말해주지 않으므로 임의 선택은 오판을 확정하는 것이다.
- **git 도달성 판정 기법 (명시 — security LOW 흡수)**: `git ls-tree -r --name-only <default-ref> -- <planPath>`
  의 출력 비어있음 여부로 판정하고, `<default-ref>`는 `origin/HEAD`를 resolve하되 실패 시 `origin/main`,
  그것도 실패하면 **조회 실패로 간주해 `undetermined`** 다(로컬 `HEAD`로 폴백하지 않는다 — 미머지
  브랜치의 작업물을 "default branch에 있다"고 오판한다). `planPath`는 `/` 구분자로 정규화한다.
  `execFileSync` 실패·비영점 exit은 전부 `undetermined`이며 **절대 `not-shipped`가 아니다**.
- **입력 제한 + 순수성이 계약이다**: 함수 시그니처는 문서 status를 **받지 않는다**. 나아가 이 함수는
  **자체 I/O를 하지 않는다** — receipt 판독·git 조회는 호출자가 주입하는 위 `evidence` 객체로만
  들어온다. 그래서 "몰래 PRD를 다시 읽는" 구현 자체가 불가능하고(security LOW 흡수), Task 2a의
  test가 위조 불가능해진다.
  I/O는 Task 3의 source가 담당한다(순수 오라클 ↔ 관측 source 2층 분리 — `a4-boundary-restore.js` 미러).
- **Mirror**: `evidence-audit.js` join 규약(`decision_id` 1차 키) + `archive-complete/scan.js#decisionFromBasename`.
  (`receipt-convergence.js#isConvergedVerdict`는 **판정에 쓰지 않는다** — 위 ship 판정식 참조. 병기
  필드를 해석해 읽고 싶은 소비처가 있으면 그쪽에서 쓴다.)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/b1-status-drift.test.js` — 최소 단언 **7종**:
  basename 충돌 → 양쪽 `undetermined` · git 조회 실패(`gitReachable:null`) → `undetermined` ·
  `readError` non-null → `undetermined` · 스키마 밖 키 주입 → `undetermined`+`evidence-schema-invalid` ·
  **필수 필드 누락 → `undetermined`+`evidence-schema-invalid`**(아래) ·
  **`receiptVerdict:'divergent'` + `receiptPresent:true` → `shipped`**(ship 판정식 회귀) ·
  `decisionFromBasename` 동치
- **스키마 거부는 양방향이다 (R6 test MEDIUM 흡수 — 실결함)**: 초안 Validate는 *"스키마 밖 키 주입"*
  만 요구해 **여분 키**만 덮었다. 그런데 위 표는 *"정확히 다음 5필드"* 라고 적었으므로 **누락**도 같은
  거부 대상이다. 한쪽만 test하면 4필드짜리 evidence를 오라클이 그대로 먹고 `undefined`를 `false`로
  읽어 — `receiptPresent:undefined`가 `not-shipped`로 접히는 식으로 — **부재를 판정으로 바꾼다**.
  이것은 `evidence-audit.js` E1("부재는 결함 부재가 아니다")의 정확한 위반이다. 5필드 각각을 하나씩
  뺀 5개 입력이 전부 `undetermined`+`evidence-schema-invalid`임을 단언한다(필드별 루프 1건으로 족하다).

### Task 2: 독립성의 기계적 검증 — 변조 불변성 test + 정적 lint

**먼저 무엇이 불변이고 무엇이 변해야 하는지 분리한다** (L2 test/HIGH 흡수). 초안은 "verdict 집합이
동일함"이라고만 적어 두 층을 뭉갰다. status를 뒤집으면 **drift 판정은 반드시 바뀌어야 한다** — 그것이
지표의 존재 이유다. 불변이어야 하는 것은 그 아래층인 **증거 verdict**뿐이다. 한쪽만 단언하는 test는
논리적으로 성립하지 않으므로 **양방향**으로 고정한다.

- **Action** (2a, 반증 test — 2단 단언):
  1. **증거층 불변**: 실제 PRD 본문과, `## Delivery Milestones`의 모든 status 셀을 프로그램적으로
     뒤집은 사본(`complete↔pending` 등)을 각각 Task 3 열거에 통과시켜, 행별
     `(decision_id, evidence_verdict)` 쌍의 집합이 **정확히 동일**함을 단언한다. 하나라도 달라지면
     증거 판정이 문서에 의존한다는 뜻이다. **`decision_id` 추출도 동일해야 하므로 같은 단언에
     포함한다** — basename 추출이 status 셀 위치에 영향받으면 join이 어긋난다(security 흡수).
  2. **판정층 가변**: `drift_count`/`drift_items`는 **달라져야 한다**. 이 단언이 없으면 오라클이
     상수를 반환해도 1번이 통과한다(무의미한 불변성).
     - **이 단언은 실 PRD가 아니라 합성 fixture에서 돌린다 (R3 test MEDIUM 흡수 — 공허한 통과 차단)**:
       실 PRD의 행이 전부 `undetermined`이거나 status를 뒤집어도 drift 범주가 안 바뀌면
       (예: `complete`→`dropped`인데 증거가 이미 `not-shipped`) **반전이 0건이라 test가 공허하게
       통과**한다. fixture는 `shipped` 증거 + `pending` status 행 하나를 반드시 포함해 뒤집으면
       drift가 확실히 반전되게 구성하고, **fixture 자체가 ≥1 반전을 갖는지 test가 먼저 단언**한다
       (fixture 건전성 가드 — 없으면 fixture가 조용히 퇴화해도 아무도 모른다).
     - 1번(증거층 불변)은 실 PRD와 합성 fixture **둘 다**에서 돌린다 — 실 PRD는 프로덕션 형태를,
       fixture는 경계 조합을 각각 덮는다.
- **위조 불가성의 근거는 test가 아니라 Task 1의 타입 경계다**: 오라클은 자체 I/O를 하지 않으므로
  "PRD를 몰래 읽는 구현"이 애초에 존재할 수 없다. test는 그 경계가 유지되는지를 **확인**할 뿐이고,
  경계 자체는 2b lint가 정적으로 지킨다. test 격리 요구(파일 읽기 금지)는 오라클 test에 한해
  **주입된 `evidence` 객체만 쓰는 형태**로 강제한다.
- **Action** (2b, 정적 lint): `b1-independence-lint.js`가 판정 경로 파일
  (`b1-status-drift.js` + `b1-evidence-builder.js` + `derive/sources/milestone-evidence.js`의 증거
  조회 구간 + `archive-complete/scan.js`의 drift 증거 구간)을 스캔해 다음을 단언하고 위반 시 비영점
  exit 한다 — (i) `completion-ledger` require 0, (ii) **오라클 모듈의** `fs`/`child_process` require
  0(순수성 — builder는 I/O가 본업이므로 **이 축의 대상이 아니다**), (iii) 오라클 모듈이 status 문자열
  리터럴(`'complete'`/`'pending'`/`'in-progress'`/`'dropped'`)을 **하나도 포함하지 않음**,
  (iv) **`receiptPresent`의 생성/대입이 `b1-evidence-builder.js` 밖에 0건**이고, builder의 receipt
  존재 판정이 **`cat-file` 명령을 쓰며**(양성) **`fs.existsSync`도 `ls-files`도 쓰지 않음**(음성)
  (R7 invariant HIGH ×2 · R8 test MEDIUM 흡수).
  - **명령 자체를 고정하는 이유 (R8 test MEDIUM)**: Task 3의 stub test는 *출력*(`false`)만 보므로
    제3의 구현(하드코딩 목록·캐시 조회 등)도 통과시킨다. 출력 단언은 "이 구현이 틀렸다"를 잡지만
    "이 구현이 맞다"를 증명하지 못한다. 명령 문자열을 정적으로 고정하면 그 간극이 닫힌다 —
    test(출력)와 lint(수단)가 서로 다른 것을 보므로 둘 다 필요하다.
  - **음성 fixture는 이 4축에 1:1로 둔다** — tmpdir에 (i) `require('../completion-ledger/store')`를 넣은
    사본, (ii) `require('fs')`를 넣은 사본, (iii) `if (status === 'complete')`를 넣은 사본,
    (iv) `receiptPresent: fs.existsSync(p)`를 넣은 `scan.js` 사본을 각각 만들어 lint가 **넷 다 비영점
    exit**함을 단언하고, 원본에서는 exit 0임을 단언한다. 잡지 못하는 lint는 통과 사실 자체가 무의미하다.
  - **(iv)가 왜 lint여야 하는가**: 오라클은 순수 함수라 주입된 `receiptPresent`의 **출처를 볼 수
    없다**(`fs.existsSync`도 `git cat-file`도 boolean 하나를 낸다). 런타임에 확인할 방법이 없으므로
    **생산자가 하나뿐임을 정적으로** 고정하는 것이 유일한 기계 장치다. 이 축이 빠지면 §3.12
    git-tracked 불변식은 `scan.js` 경로에서 다음 편집자가 되돌릴 수 있는 관례로 강등된다.
  - **lint의 한계를 문서에 적는다 (invariant MEDIUM 흡수)**: 정적 스캔은 **간접 의존**(별칭 require,
    동적 `require(var)`, 호출자가 status를 다른 이름으로 실어 넘김)을 잡지 못한다. lint는 2차 통제이고
    **1차 통제는 Task 1의 타입 경계 + 2a의 양방향 단언**이다. 이 순서를 `status-adjudication-design.md`의
    비보증 절에 명시한다 — lint를 1차 통제로 읽으면 없는 보증을 믿게 된다.
- **Action** (2c, compute-time): source가 `independence_ok:false`를 실으면 `computeB1`은 `invalid`.
  계약이 "그 주기의 B1은 무효"라고 적었으므로 `insufficient`(부재)가 아니라 `invalid`(위반)다.
- **Mirror**: `plugins/mccp/scripts/lib/state-journal/single-writer-lint.js` (5축 정적 lint + 음성 대조).
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/b1-independence-lint.test.js`
  && `node --test plugins/mccp/scripts/lib/tests/b1-status-drift.test.js`
  && `node plugins/mccp/scripts/lib/msw-metrics/b1-independence-lint.js`

### Task 3: derive source `milestone-evidence.js`
- **Action**: 활성 `.claude/prds/*.prd.md`(**비재귀** — `archived/`는 자연 제외)를 열거하고, 각 PRD의
  `## Delivery Milestones`를 `archive-complete/scan.js`와 **동일한 rawRow 등식**으로 분류한 뒤 행마다
  Task 1 오라클을 호출해 대조한다. 산출:
  ```
  { ok, degraded, error, independence_ok, producer_coverage:'milestone-evidence',
    denominator, drift_count, drift_items:[{prd,milestone,doc_status,evidence_verdict,evidence_ref}],
    undetermined_count, no_plan_count, archived_excluded_count, raw_row_count, warnings }
  ```
- **분모 규약 — 두 종류의 `undetermined`를 구분한다 (R2 test MEDIUM 흡수)**: 초안은 "비정규 status 행"과
  "증거가 `undetermined`인 행"을 같은 `undetermined_count`에 섞어 분모 소속이 모호했다. 둘은 **다른
  축**이므로 분리한다:

  | 축 | 필드 | 분모 소속 |
  |---|---|---|
  | 문서 status가 비정규 (`complete (인정 조건 미충족: …)`) | `noncanonical_status_count` | **제외** — 비교할 좌변이 없다 |
  | 문서 status는 정규인데 증거가 `undetermined` | `undetermined_evidence_count` | **포함** — 좌변은 있고 우변을 못 구한 것이며, 빼면 "증거를 못 구할수록 분모가 줄어 drift율이 좋아 보이는" 경로가 열린다 |

  즉 `denominator` = 정규 status 활성 행 전수이고, 그 안에서 증거가 `undetermined`인 행은 **분모에는
  있으나 분자(drift)에는 없다**. 이 비대칭이 정직한 표기다 — 대조 실패를 "일치"로도 "불일치"로도 세지
  않으면서 커버리지 구멍은 분모 대비 비율로 드러난다. `raw_row_count`를 병기해 제외분이 항상 보이게
  한다(B3 `raw_surface_count` 미러). 세 수의 항등식 `raw_row_count = denominator + noncanonical_status_count`
  를 source가 자체 검증하고 어긋나면 `degraded:true`로 올린다(archive-complete 버킷 합 등식 미러).
- **drift 판정식**: `doc_status ∈ {complete, dropped}` ↔ `evidence=not-shipped` 이면 drift.
  `doc_status ∈ {pending, in-progress}` ↔ `evidence=shipped` 이면 drift. `undetermined`는 어느 쪽도 아니다.
- **basename 충돌 검출은 증거 조회보다 먼저 돌고, 범위는 PRD가 아니라 전역이다 (R4 invariant MEDIUM 흡수)**:
  `decision_id = planBasename`에는 **PRD 성분이 없으므로** 서로 다른 두 PRD가 같은 basename을 선언해도
  같은 receipt를 가리킨다. PRD 단위로만 집계하면 그 조합이 통과해 두 milestone이 조용히 같은 증거를
  받는다. 따라서 집계는 **활성 PRD 전체를 가로질러** 한 번에 하고, 중복 키를 공유한 행 **전부**를
  (PRD가 다르더라도) `undetermined`로 강등한 뒤 `warnings`에 `duplicate decision_id "<id>" shared by
  N rows across M prd(s)`를 싣는다. 첫 행 채택·마지막 행 채택 모두 금지다(Task 1 참조).
- **I/O는 여기서만 한다**: receipt 존재·verdict 판독과 git 도달성 조회는 이 source가 수행해 Task 1
  오라클에 `evidence` 객체로 **주입**한다. 조회가 throw하면 그 행만 `undetermined`로 두고 전체는
  계속 진행한다(per-source fail-open) — 다만 조회 계층 자체가 죽으면(`git` 미존재 등) `degraded:true`로
  올려 `computeB1`이 `invalid`을 내게 한다.
- **`receiptPresent`는 커밋 도달성이다 — index 확인도 `fs.existsSync`도 아니다 (R7 security CRITICAL
  흡수 — 실결함)**: `git cat-file -e HEAD:.claude/receipts/mccp-pr-codex/<decision_id>.json`의 성공
  여부로 판정한다(비영점 exit = 미커밋 = `false`). `git` 호출 실패는 그 행의 `readError`로 실어
  `undetermined`가 되게 한다.
  - **초안의 `git ls-files --error-unmatch`는 틀렸다.** 그것은 **index(staging area)** 를 보므로
    `git add`만 하고 커밋하지 않은 파일에도 exit 0을 낸다. 실측으로 확인했다 — 임시 repo에서
    커밋된 파일과 staged-only 파일에 각각 걸었을 때 **둘 다 exit 0**이었고, `git cat-file -e HEAD:<path>`
    는 전자만 통과하고 후자를 비영점으로 거부했다.
  - **왜 CRITICAL인가**: §3.12가 ship receipt를 git-tracked로 규정한 근거는 *"worktree 삭제 후에도
    ledger↔receipt 대조가 성립"* 이다. staged-only receipt는 커밋되지 않았으므로 worktree가 사라지면
    **함께 사라진다**. index 확인으로 `shipped`를 내주면 이 지표는 *다음 세션에 판정이 뒤집히는*
    증거 위에 서게 되고, 그것은 감사 corpus의 정의를 무너뜨리는 바로 그 실패다. 커밋 도달성만이
    §3.12가 말한 내구성과 같은 뜻이다.
  - **`HEAD`를 쓰고 default branch를 쓰지 않는 이유**: 여기서 묻는 것은 *"증거가 내구적인가"* 이지
    *"머지됐는가"* 가 아니다. 커밋은 브랜치 ref와 object store에 살아 worktree 삭제를 견딘다.
    (plan 파일 도달성이 default-ref를 쓰는 것은 **다른 질문**이라 그렇다 — 그쪽은 "이 작업 단위가
    default branch에 도달했는가"를 묻는다. 두 검사의 ref가 다른 것은 혼동이 아니라 질문이 다름이다.)
  - plan/implement receipt는 working-tree only라 **이 경로에 잡히지 않는 것이 정상**이다.
- **Mirror**: `derive/sources/session-journal.js` per-source fail-open 계약.
- **Validate**: `node --test plugins/mccp/scripts/derive/tests/milestone-evidence.test.js` — 최소 단언 **5종**:
  중복 basename fixture → 양쪽 `undetermined` + warning 1건 · `raw_row_count` 항등식 위반 →
  `degraded:true` · 조회 계층 사망(git 미존재 stub) → `degraded:true` ·
  **커밋 도달성 확인의 동작 test (R3 test MEDIUM · R7 security CRITICAL 흡수)**: git 조회기를
  주입 가능하게 만들고(`opts.gitQuery`) **두 음성 케이스를 각각** 단언한다 —
  (a) *untracked stub* → `receiptPresent:false`(워킹트리에 파일이 **존재하는데도**) ·
  (b) ***staged-but-uncommitted* stub → `receiptPresent:false`**. (a)만으로는 `fs.existsSync`
  구현만 걸러지고 `git ls-files` 구현은 통과한다 — (b)가 index 확인과 커밋 도달성을 갈라놓는
  유일한 케이스이며, 정적 lint는 이 차이를 못 본다. ·
  **default-ref fallback 시퀀스 동작 test (R6 test MEDIUM 흡수)** — 아래.
- **fallback 시퀀스는 규정이 아니라 단언이어야 한다 (R6 test MEDIUM 흡수)**: Task 1이
  `origin/HEAD` → `origin/main` → **조회 실패(`undetermined`)** 순서를 상세히 규정했지만 어느
  Acceptance/Validate 항목도 그것을 요구하지 않았다 — 규정만 있고 게이트가 없으면 구현이 로컬 `HEAD`로
  폴백해도 아무도 모르고, 그 순간 **미머지 브랜치의 작업물이 "default branch에 있다"로 오판**돼
  `not-shipped`가 조용히 사라진다(이 milestone이 세려는 drift의 한쪽 방향 전체가 증발한다).
  `opts.gitQuery` 주입으로 3분기를 각각 단언한다 — (a) `origin/HEAD` 해석 성공 → 그 ref로 조회 ·
  (b) `origin/HEAD` 실패 ∧ `origin/main` 성공 → `origin/main`으로 조회 · (c) 둘 다 실패 →
  `gitReachable:null` → `undetermined`이며 **로컬 `HEAD`를 조회하지 않는다**(호출 인자 검사).

### Task 4: `computeB1` 배선 + derive 등록
- **Action**: `derive/index.js`에 source를 등록하고 `computeB1(model)`을 다음 사다리로 교체한다 —
  `degraded || !independence_ok` → `invalid` · `denominator === 0` → `insufficient` · 그 외 → `computed`
  (`numerator = drift_count`, `value = null`). **`value`에 비율을 넣지 않는다**(UI4: 건수가 계약이다).
  병기 필드: `undetermined_evidence_count` · `noncanonical_status_count` · `no_plan_count` ·
  `archived_excluded_count` · `raw_row_count` · `evidence_source` · `independence_ok`.
- **Mirror**: `computeA4`의 invalid-우선 사다리 + `computeB3`의 `coReport` 병기.
- **Validate**: 사다리 분기를 명시 test로 고정한다(R2 test LOW 흡수).
  `node --test plugins/mccp/scripts/lib/tests/msw-metrics.test.js` 안에 `computeB1` describe 블록을 두고
  분기당 최소 1건씩 단언한다 — (a) `degraded:true` → `invalid` · (b) `independence_ok:false` → `invalid`
  (a와 별개 단언: 둘이 OR로 묶여 있어 하나만 test하면 나머지 분기가 미검증으로 남는다) ·
  (c) `denominator:0` → `insufficient` · (d) 정상 → `computed` ∧ `value === null` ∧ 병기 7필드 존재.
  이어서 `node --test plugins/mccp/scripts/lib/tests/` 로 msw-metrics 계열 전체.

### Task 5: 대시보드 표면 (UI8 · §3.9 출력 제약)
- **Action**: `msw-metrics.js` 렌더러에서 B1을 **`N건`** 으로 표기(퍼센트 금지)하고, drift 항목은
  `coReportDetails`가 반환하는 **단일 muted 줄**로 낸다 — 상위 3건을 `·`로 잇고 절삭분은 같은 줄
  끝에 `(+N건)`으로 병기한다(예: `B1 상세: drift 5건 · <a> · <b> · <c> (+2건)`).
  `undetermined_count`가 0이 아니면 값 옆에 커버리지 단서를 붙인다 — 0건이 "drift 없음"이 아니라
  "대조한 범위에서 0건"임을 독자가 알 수 있어야 한다(UI14 감사 표본 대조 가능성).
- **drift 목록은 새 `<details>`를 열지 않는다 (R0 F1 흡수 — 실결함)**: 초안은 "상위 3개 펼침 +
  나머지 `<details><summary>+N more</summary>`"였는데, 렌더러에는 **이미** 단일 공유 collapse
  (`<details class="msw-metrics-extra">`, `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js:396`)가 있다. `decisionPriority`상 B1이
  `computed` ∧ `numerator===0`이면 우선순위 2라 `invalid`·drift-positive 지표 3개 뒤로 밀려
  `extraRows`에 떨어지고(`:378-382`), 그 안에서 또 `<details>`를 열면 **2단 중첩 disclosure**가
  된다. 제약 4와 PRODUCT.md 원칙 3("quiet by default, loud on demand")이 둘 다 거부하는 형태다.
  따라서 B1 상세는 A3·B3와 **동일 계층**(`coReportDetails` 반환 배열의 한 원소)에 두고 새 collapse를
  만들지 않는다. 상위 3건 상한은 유지되며 절삭분은 `(+N건)`으로 **항상 보인다** — 조용한 절삭이
  아니다.
- **drift 목록의 구조적 위치 (R0 F2 흡수)**: 이 섹션은 `<tr><td>×4</tr>` compact 4-컬럼 표이므로
  `<td>` 안에 `<ul>`이나 중첩 표를 넣지 않는다(컬럼 리듬 붕괴). 렌더 형태는 A3·B3 선례와 동일하게
  HTML 면은 `<p class="muted">` 한 줄, markdown 면은 `<details>` 안 단락 한 줄이다.
- **4개 Output Constraints를 이 Task가 지켜야 할 형태로 고정한다** (§3.9 critique R0 흡수 — M6은 M5와
  달리 **신규 렌더 표면을 실제로 도입**하므로 4개 제약이 전부 유효 사거리 안에 있다):
  - **H15(정보 위계 3단계)** — drift 목록은 기존 metric row **안쪽**의 목록/표로만 렌더하고
    `<h4>` 이상 heading을 **0개** 추가한다. `<details><summary>`는 heading이 아니므로 depth에
    계상되지 않는다. Phase 3.7 produced-diff grounding lint(`enforce`)가 이 축을 정적 차단하므로
    위반은 implement 단계에서 hard block된다.
  - **강조색 1개** — drift 상태 전용 accent 토큰을 **신설하지 않는다**. 행의 기존 `STATUS_META`
    클래스(`ok`/`warn`/`muted`) 하나를 재사용한다. `drift_count > 0`을 붉은 뱃지로 따로 칠하면
    같은 viewport에 2번째 강조가 생겨 B2·A3 행의 위계를 무너뜨린다.
  - **raw markdown marker 금지** — drift 항목의 milestone 이름은 PRD 표 셀에서 그대로 온다. 그 셀은
    이 repo 관례상 **`**진행 상태 기계 판정**` 처럼 볼드 마커를 포함**하므로, `stripAxisIdPrefix`만
    거치면 렌더 표면에 `**`가 그대로 누출된다. 인라인 마커(`**`/`_`/백틱)를 제거하는 정규화를
    렌더 직전에 적용하고 회귀 test로 고정한다. **신규 문자열의 em-dash도 금지**다(R0 F3 흡수) —
    `msw-metrics.js`가 M3 F4에서 확립한 house rule(`구분자는 '·'와 괄호만`, `:186-200` 주석)이
    있고 drift 상세 줄은 신규 문자열이므로 그 규칙의 적용 대상이다.
  - **항목 수 상한** — 상위 3건 + `(+N건)` 절삭 병기가 이 축이다. **새 collapse를 열지 않는 것**이
    규칙의 일부다(위 F1 흡수) — 상한을 지키려고 2단 disclosure를 만들면 같은 제약을 반대편에서
    위반한다.
- **디자인 게이트 주의**: renderer 변경은 `impeccable-detect`의 design surface에 걸리므로 §3.9
  critique retry loop이 implement 단계에서도 발화한다. 이는 우회 대상이 아니라 예상 비용이다.
- **Validate**: `node plugins/mccp/scripts/derive/cli.js render` 후 `.claude/cache/STATUS.md`에 B1 행 확인
  && `node --test plugins/mccp/scripts/lib/tests/msw-metrics-render.test.js`
  && impeccable detector가 **신규** HIGH/CRITICAL 0건 (선재 2건은 아래 Design Critique에 기록).
  detector 경로는 **하드코딩하지 않는다** — `impeccable-detect.js`가 이미 소유한 해석기를 쓴다:
  ```bash
  DETECT_MJS=$(node -e "
    const p=require('path'), fs=require('fs'), os=require('os');
    const c=[p.join(os.homedir(),'.claude','skills','impeccable','scripts','detect.mjs'),
             p.join(os.homedir(),'.claude','plugins','marketplaces','mccp','.claude','skills','impeccable','scripts','detect.mjs')];
    const hit=c.find(x=>fs.existsSync(x));
    if(!hit){process.stderr.write('impeccable detector not installed — skipping (advisory)\n');process.exit(0)}
    process.stdout.write(hit);")
  [ -n "$DETECT_MJS" ] && node "$DETECT_MJS" --json .claude/cache/status.html
  ```
  detector 미설치는 **advisory skip**이다(§3.9의 `SKILL_AVAIL=0` 행과 동형) — 이 축은 게이트가 아니라
  관측이므로 없다고 Task를 막지 않는다.
- **detector가 없어도 4개 제약 중 3개는 게이트로 남는다 (R3 test LOW 흡수)**: advisory skip을 그대로 두면
  detector 미설치 환경에서 이 Task의 디자인 검사가 **전부** 사라진다. 그래서 detector에 의존하지 않는
  단언을 `msw-metrics-render.test.js`에 둔다 — 렌더 산출 문자열에 대해 (i) 신규 `<h4>`~`<h6>` /
  CommonMark `#### ` 이상 **0건**(H15) · (ii) drift 목록이 새 accent 클래스를 도입하지 않고 행의 기존
  `STATUS_META` 클래스만 씀 · (iii) 인라인 마커(`**`/`_`/백틱) **0건** ∧ 신규 문자열 em-dash **0건** ·
  (iv) drift 상세가 **새 collapse를 도입하지 않음** — 개수와 **배치**를 둘 다 단언한다(R6 invariant
  MEDIUM 흡수): **(iv-a)** 렌더 산출의 `<details>` 개수가 B1 배선 전후로 동일 · **(iv-b)** drift 줄이
  기존 `msw-metrics-extra` **안의 `<p class="muted">`로** 렌더된다(위치 단언) · **(iv-c)** collapse
  유사 위젯 신규 0건 — `display:none` · `hidden` 속성 · `aria-expanded` · 신규 class 중
  `collapse`/`accordion`/`toggle` 계열 · 상위 3건 + `(+N건)` 절삭 병기.
  **개수만 세면 우회된다** — `<div>`+CSS로 접거나 두 번째 top-level `<details>`를 숨겨 두면 개수
  단언은 통과하면서 2단 disclosure가 되살아난다. 위치 단언이 없으면 (iv)는 "같은 수의 collapse를
  다른 자리에 만들지 말라"가 아니라 "collapse 총량만 맞춰라"가 된다.
  detector는 이 위에 얹는 **추가** 관측이지 유일 검사가 아니다.

### Task 6: 단일 오라클로 통합 — `archive-complete/scan.js` ledger 강등 (UI3 · UI11)
- **Action**: `collectDriftEvidence`의 **판정 축**을 Task 1 오라클로 교체한다. 현재는 ledger를 강증거로
  먼저 보고 `driftSuspect`를 올리는데, 계약이 ledger를 판정 소스에서 배제했으므로 두 표면이 서로 다른
  오라클로 같은 질문에 답하는 상태다. ledger 인용은 **참고 증거로 병기**만 하고 `driftSuspect`를
  결정하지 않는다.
- **증거는 `scan.js`가 직접 만들지 않는다 — 공유 builder를 호출한다 (R7 invariant HIGH ×2 흡수 —
  실결함)**: 오라클을 얹는 것만으로는 부족하다. 오라클은 순수 함수라 주입된 `evidence`의 **스키마와
  타입만** 보고 **출처는 볼 수 없다** — `receiptPresent`는 어느 쪽에서 와도 그냥 boolean이다. 현행
  `scan.js`는 `fs.existsSync`로 receipt 존재를 보는데(`plugins/mccp/scripts/lib/archive-complete/scan.js`
  의 기존 구현), Task 6이 "오라클을 호출하라"만 적으면 그 `fs.existsSync` 값이 그대로 evidence에 실려
  오라클을 **스키마 통과**로 지나간다. 그러면 두 표면이 같은 오라클을 쓰면서 **서로 다른 증거 정의**로
  답하게 되고, §3.12 git-tracked 불변식이 이 경로로 조용히 무효가 된다.
  - **구조적 해소**: 증거 구성 I/O를 `plugins/mccp/scripts/lib/msw-metrics/b1-evidence-builder.js`
    단일 모듈로 뽑고, `derive/sources/milestone-evidence.js`와 `archive-complete/scan.js`가 **둘 다
    이것만** 호출한다. 규율이 아니라 **구성 지점이 하나뿐이라서** 출처가 보장된다 — 오라클이 못 하는
    검증을 "다른 생산자가 존재하지 않음"으로 대체하는 것이다(Task 1이 I/O를 없애 위조를 불가능하게
    만든 것과 같은 수법).
  - **lint 4번째 축**: `b1-independence-lint.js`가 `receiptPresent` **대입/생성이 builder 밖에 0건**
    임을 정적으로 단언하고, builder가 receipt 존재 판정에 `fs.existsSync`를 쓰지 않음을 단언한다.
    음성 fixture는 (iv) `scan.js` 사본에 `receiptPresent: fs.existsSync(...)`를 심어 비영점 exit
    확인이다. 이 축이 없으면 위 구조는 다음 편집자가 되돌릴 수 있는 관례일 뿐이다.
  - **`b1-evidence-builder.js`는 오라클이 아니다** — I/O를 하므로 lint의 순수성 축(ii)은 오라클
    모듈에만 걸고 builder에는 걸지 않는다. 두 모듈을 같은 축으로 묶으면 builder가 존재할 수 없다.
- **불변 유지**: `isArchivable`(C2·C3·C4 fail-closed 등식)과 `classifyMilestones`는 **손대지 않는다**.
  바뀌는 것은 advisory drift 힌트 축 하나뿐이다.
- **오라클 실패는 fail-closed다 (L2 invariant MEDIUM 흡수)**: 현행 `collectDriftEvidence`는 `catch`에서
  증거를 `null`로 두고 `driftSuspect:false`를 반환한다 — 이 축에 오라클을 얹으면 **오라클 예외가
  "drift 없음"으로 읽히는** fail-open 강등이 생긴다. 따라서 오라클 호출 실패 시
  `driftSuspect:false`가 아니라 **`evidence_verdict:'undetermined'` + `evidence:'oracle failed: <msg>'`**
  를 싣고, `scan()`은 그 사실을 `warnings`에 올려 `degraded:true`가 되게 한다. `/mccp:archive-complete`
  command body는 `degraded` PRD에 대해 이미 보수적으로 동작하므로 판정 강도는 유지된다.
  이 분기는 `scan.test.js`에 **오라클이 throw하는 stub**으로 회귀 고정한다.
- **Mirror**: `scan.js` 헤더가 이미 선언한 "결정적 스캔 ↔ 추론 분리" 레이어 계약.
- **Validate**: `node --test plugins/mccp/scripts/lib/archive-complete/tests/`
  && `node plugins/mccp/scripts/lib/archive-complete/scan.js --json`이 실 repo에서 비throw

### Task 7: 설계 문서 + 단언 매니페스트
- **Action**: `docs/multi-session-work-loop/status-adjudication-design.md`에 보증(G1~G4)·**비보증**·위협
  모델·판정 사다리를 적는다. 최소한 다음을 명시적으로 **주장하지 않는다**고 적을 것:
  - 문서 status를 자동 교정하지 않는다(교정하면 두 소스가 의존 관계가 되어 지표가 무효가 된다).
  - receipt가 유실된 과거 작업 단위는 `undetermined`이며 `not-shipped`로 단정하지 않는다.
  - 판정은 "PR이 났는가"이지 "milestone이 잘 됐는가"가 아니다.
  - **정적 lint는 독립성의 증명이 아니다** — 2차 통제이며 간접 의존(별칭·동적 require·이름을 바꾼
    status 전달)을 잡지 못한다. 1차 통제는 Task 1의 타입 경계다(L2 invariant 흡수).
  - **감사 표본의 수행 자체는 강제되지 않는다** — 강제되는 것은 (i) 기록 없이 완료를 주장하지 못함,
    (ii) 기록된 불일치가 게이트를 통과하지 못함 두 가지까지다. 표본을 성의 없이 고르는 것은 막지
    못한다(L2 test · R2 invariant 흡수).
  - basename 충돌 행은 `undetermined`이며, 어느 행이 옳은지 **판정하지 않는다**.
  - **`shipped`는 승인 품질을 말하지 않는다** — audited override로 divergent인 채 ship된 작업 단위도
    `shipped`다. `codex_verdict` 병기가 그 사실을 감사에 남기지만 drift 분자를 바꾸지 않는다.
  - **정적 lint는 전이 의존을 추적하지 않는다** — 직접 require만 본다. `scan.js` 미import 규율은
    lint가 아니라 동치 test가 지킨다.
  - **앵커 대조는 사후적이다 (R2 invariant LOW 흡수)** — Task 0 스냅샷 이후 Task 9 이전에 plan이
    편집되면 `plan_file_hash` 불일치로 **차단은 되지만 예방은 되지 않는다**. 예방하려면 구현 기간
    내내 plan을 동결해야 하는데, 구현 중 plan 정정은 정상 작업이라(본 게이트에서도 두 번 했다)
    동결이 더 나쁜 규칙이다. 재측정으로 해소한다 — Task 0을 다시 돌려 새 앵커로 봉인한다.
  - **Task 0 재실행 여부는 기계적으로 탐지되지 않는다 (R6 invariant MEDIUM 흡수)** — before 스냅샷은
    in-place 덮어쓰기이므로, 재실행해 갱신된 앵커와 처음부터 그 값이었던 앵커는 **구별 불가능**하다.
    Acceptance의 "재실행 사실을 보고서에 적는다"는 **사람의 규율**이고 Validate가 검사하지 않는다.
    세대별 스냅샷 보존으로 강제할 수는 있으나 그 기판이 M6이 만드는 지표보다 커져 UI12에 반한다.
  - **`tracked_receipt_count`는 게이트가 아니다 (R6 invariant LOW 흡수)** — 앵커에 봉인되지만
    Validate가 읽지도 대조하지도 **않는다**. 사이클 중 새 ship이 나면 정상적으로 늘어나므로 일치를
    요구하면 정상 동작이 차단된다. 소비처는 구현 보고서이며, 읽을거리는 값이 아니라 변화량이다.
    이 필드를 게이트로 오독하면 없는 보증을 믿게 되므로 여기 명시한다.
- **Action (R4 test HIGH ×3 흡수 — 이 Task가 Acceptance를 실제 게이트로 만든다)**:
  `m6-assertion-manifest.json`이 **Acceptance가 요구하는 단언 전수**를 `{ id, assertion, test_file,
  test_title }` 로 열거하고, 대조 스크립트가 각 `test_file`에서 `test_title`을 찾아 **하나라도 없으면
  비영점 exit** 한다(absent 0 강제). M5의 `m5-assertion-manifest.json`과 동일 계약.
  - **왜 이것이 필요한가**: Acceptance는 `decisionFromBasename` 동치 · `receiptPresent` git-tracked 동작 ·
    lint 음성 fixture 3종 · `computeB1` 4분기 · Task 2a fixture 건전성 가드 같은 **개별 단언**을
    요구하는데, Validation은 `node --test <디렉토리>`라 그중 어느 것이 빠져도 통과한다. 즉 지금까지
    Acceptance의 그 항목들은 **사람이 읽고 지키는 규율**이었지 게이트가 아니었다. manifest가 그
    간극을 닫는 유일한 기계 장치다.
  - **필수 id 21종은 대조기에 하드코딩한다 (R5 test MEDIUM 흡수)**: manifest에 있는 것만 검사하면
    "manifest에서 id를 빼면 통과"가 되어 강제가 무의미하다. `assertion-manifest-check.js`는
    `REQUIRED_IDS` 상수를 갖고 **manifest가 그 21개를 전부 담고 있는지 먼저 확인**한 뒤 각 항목의
    test 존재를 검사한다. 두 검사는 서로 다른 실패다(`missing-from-manifest` vs `absent-in-tests`).
  - **아래 표가 manifest의 정본 매핑이다 (R6 test MEDIUM 흡수)**: 초안은 id와 의미만 적고 각 단언이
    **어느 test 파일에 사는지**는 적지 않아, 구현자가 Acceptance 절과 Tasks 절을 교차 참조해
    `test_file`을 추론해야 했다. 추론으로 채운 manifest는 검증 대상이 아니라 **또 하나의 추측**이고,
    틀리면 대조기가 엉뚱한 파일에서 제목을 찾다 `absent-in-tests`로 실패해 원인이 단언 누락인지
    매핑 오류인지 구분되지 않는다. 3열로 확장해 이 표 하나에서 manifest를 그대로 옮겨 적게 한다.

    | id | 무엇을 단언하는가 | `test_file` |
    |---|---|---|
    | `B1-EQ-BASENAME` | 오라클 재구현과 `scan.js#decisionFromBasename`이 동일 입력에서 동일 출력 | `plugins/mccp/scripts/lib/tests/b1-status-drift.test.js` |
    | `B1-EVIDENCE-SCHEMA` | 여분 키 주입 **∧ 필수 5필드 각각의 누락** → `undetermined`+`evidence-schema-invalid` | `plugins/mccp/scripts/lib/tests/b1-status-drift.test.js` |
    | `B1-SHIPPED-ON-DIVERGENT` | `receiptVerdict:'divergent'` ∧ `receiptPresent:true` → `shipped` | `plugins/mccp/scripts/lib/tests/b1-status-drift.test.js` |
    | `B1-MUTATION-EVIDENCE` | status 변조 시 `(decision_id, evidence_verdict)` 집합 불변 | `plugins/mccp/scripts/lib/tests/b1-status-drift.test.js` |
    | `B1-MUTATION-DRIFT` | 같은 변조에서 `drift_count`/`drift_items`는 반전 | `plugins/mccp/scripts/lib/tests/b1-status-drift.test.js` |
    | `B1-FIXTURE-SANITY` | 위 fixture가 ≥1 반전 행을 실제로 갖는다 | `plugins/mccp/scripts/lib/tests/b1-status-drift.test.js` |
    | `B1-GIT-TRACKED` | 워킹트리 존재 ∧ untracked stub → `receiptPresent:false` | `plugins/mccp/scripts/derive/tests/milestone-evidence.test.js` |
    | `B1-RECEIPT-COMMITTED` | **staged-but-uncommitted stub → `receiptPresent:false`** (index 확인과 커밋 도달성을 가르는 유일 케이스) | `plugins/mccp/scripts/derive/tests/milestone-evidence.test.js` |
    | `B1-GIT-FALLBACK` | `origin/HEAD` → `origin/main` → `undetermined` 3분기 ∧ 로컬 `HEAD` 미조회 | `plugins/mccp/scripts/derive/tests/milestone-evidence.test.js` |
    | `B1-DUP-DECISION` | 전역 `decision_id` 중복 → 관련 행 전부 `undetermined` + warning | `plugins/mccp/scripts/derive/tests/milestone-evidence.test.js` |
    | `B1-LINT-NEG-LEDGER` · `B1-LINT-NEG-FS` · `B1-LINT-NEG-STATUS` · `B1-LINT-NEG-EVIDENCE-SOURCE` | lint 음성 fixture **4축**이 각각 비영점 exit (4번째 = builder 밖 `receiptPresent` 생성) | `plugins/mccp/scripts/lib/tests/b1-independence-lint.test.js` |
    | `B1-LADDER-DEGRADED` · `B1-LADDER-INDEPENDENCE` · `B1-LADDER-EMPTY` · `B1-LADDER-COMPUTED` | `computeB1` 4분기 | `plugins/mccp/scripts/lib/tests/msw-metrics.test.js` |
    | `B1-ARCHIVE-DEGRADED` | 오라클 throw stub → `degraded:true` + `warnings` ≥1 | `plugins/mccp/scripts/lib/archive-complete/tests/scan.test.js` |
    | `B1-ARCHIVE-INVARIANT` | archivable 판정이 변경 전후 동일 | `plugins/mccp/scripts/lib/archive-complete/tests/scan.test.js` |
    | `B1-RENDER-CONSTRAINTS` | 신규 h4+ 0 · 신규 accent 클래스 0 · 인라인 마커 0 ∧ 신규 em-dash 0 · **신규 collapse 0(개수 ∧ 배치)** ∧ 상위 3건 + `(+N건)` 절삭 병기 | `plugins/mccp/scripts/lib/tests/msw-metrics-render.test.js` |

    위 표는 일부 칸을 `·`로 묶어(lint 4 · ladder 4) **행 수가 21보다 적어 보인다**. 세는 수고를
    없애기 위해 `REQUIRED_IDS`를 그대로 옮겨 적을 수 있는 **평면 열거**를 함께 둔다(R8 test HIGH
    흡수 — 리뷰어가 "21개가 어디에도 열거돼 있지 않다"고 읽었다. 실제로는 표에 전부 있었지만,
    묶인 표기가 그 오독을 유발했다면 표기 쪽을 고치는 것이 맞다):

    ```
    B1-EQ-BASENAME  B1-EVIDENCE-SCHEMA  B1-SHIPPED-ON-DIVERGENT  B1-MUTATION-EVIDENCE
    B1-MUTATION-DRIFT  B1-FIXTURE-SANITY  B1-GIT-TRACKED  B1-RECEIPT-COMMITTED
    B1-GIT-FALLBACK  B1-DUP-DECISION  B1-LINT-NEG-LEDGER  B1-LINT-NEG-FS
    B1-LINT-NEG-STATUS  B1-LINT-NEG-EVIDENCE-SOURCE  B1-LADDER-DEGRADED
    B1-LADDER-INDEPENDENCE  B1-LADDER-EMPTY  B1-LADDER-COMPUTED  B1-ARCHIVE-DEGRADED
    B1-ARCHIVE-INVARIANT  B1-RENDER-CONSTRAINTS
    ```

    21개다. 대조기의 `REQUIRED_IDS` 길이도 21이어야 하며, 이 목록과 위 표의 id 집합과
    `REQUIRED_IDS`가 셋 다 일치하지 않으면 그 자체가 위반이다.
    구현 중 단언이 늘면 manifest에 **추가**한다(`REQUIRED_IDS`는 하한이지 상한이 아니다).
  - **manifest 스키마 (형식 명세 — R5 test MEDIUM 흡수)**: `m5-assertion-manifest.json`을 미러한다.
    ```json
    { "milestone": "multi-session-work-loop-m6",
      "contract": "docs/multi-session-work-loop/status-adjudication-design.md",
      "assertions": [
        { "id": "B1-EQ-BASENAME",
          "assertion": "오라클 재구현이 scan.js#decisionFromBasename과 동치",
          "test_file": "plugins/mccp/scripts/lib/tests/b1-status-drift.test.js",
          "test_title": "B1-EQ-BASENAME: decisionFromBasename equivalence" } ] }
    ```
    **`test_title`이 계약이다** — 대조기는 그 문자열을 `test_file`에서 리터럴로 찾으므로, test 제목은
    manifest에 적힌 그대로 써야 한다. 제목을 `id: ` 접두로 시작하게 강제해(`^B1-[A-Z-]+: `) 표현 차이로
    매칭이 깨지는 것을 없앤다(R5 test LOW 흡수).
  - **대조기 CLI 계약**: `--manifest <path>` 필수. exit 0 = 전부 충족 · exit 1 = 위반(누락 id ·
    manifest 밖 필수 id · `test_file` 부재 · `test_title` 미발견을 **종류별로 stderr에 열거**) ·
    exit 2 = 사용 오류(manifest 판독 불가·스키마 위반). 침묵 통과 금지 — 검사한 id 수를 stdout에 낸다.
  - **대조기 자신도 test된다 (R5 test MEDIUM 흡수)**: `echo ok && exit 0`짜리 대조기도 Validation을
    통과시킨다는 것이 이 축의 급소다. `plugins/mccp/scripts/lib/tests/assertion-manifest-check.test.js`가
    tmpdir fixture로 (i) 필수 id 하나를 뺀 manifest → exit 1 · (ii) `test_title`이 파일에 없는 manifest →
    exit 1 · (iii) 정상 manifest → exit 0 을 단언한다. **이 test 자체를 manifest에 넣지 않는다** —
    자기 자신을 검사 대상으로 삼으면 순환이 되고, 대조기가 죽으면 그 사실도 못 잡는다. 대신
    Validation §1에 포함되는 일반 test로 둔다.
- **Action**: `docs/multi-session-work-loop/status-adjudication-design.md`의 각 보증에 manifest id를
  달아 문서 단언 ↔ test가 양방향으로 추적되게 한다.
- **Validate**:
  `node plugins/mccp/scripts/lib/msw-metrics/assertion-manifest-check.js --manifest docs/multi-session-work-loop/m6-assertion-manifest.json`
  가 exit 0 이고, `node --test plugins/mccp/scripts/lib/tests/assertion-manifest-check.test.js`가
  **대조기의 두 실패 경로**(필수 id 누락 · `test_title` 미발견)에서 비영점 exit임을 단언한다.

### Task 8: 릴리스 메타 동기 (§3.7)
- **Action**: `plugin.json` `1.23.10 → 1.23.11`, `renderer/html.js` page-foot, `renderer/markdown.js`
  derived 줄, `renderer/tests/i18n-surface.test.js` 단언 2개, `CHANGELOG.md` 신규 항목 + `currently` 노트.
  **5면 전부** 동기한다.
- **Validate**: `grep -rn "1\.23\.10" plugins/mccp/scripts/lib/renderer/ plugins/mccp/.claude-plugin/ CHANGELOG.md`가
  stale 잔여 0

### Task 9: 라이브 전환 실측 (UI6 — 완료 판정의 유일 근거)
- **Action**: 실 repo에서 `node plugins/mccp/scripts/derive/cli.js run --json`을 돌려
  `B1.status === 'computed'`와 정합한 `numerator`/`denominator`를 확인하고, 결과를
  `docs/multi-session-work-loop/m6-after.json`으로 봉인한다. Task 0의 `m6-before.json`과 대조해
  **전환 자체를 증거로 남긴다**.
- **Action**: 산출된 `drift_items`를 **사람이 직접 표본 대조**한다(UI14). `min(3, drift_count)`건을 골라 실제 receipt/git과 대조한다(drift가 0건이면 표본도 0건이며 이는 정상이다 — Validate의 `need` 계산과 같은 식이다, R5 test LOW 흡수). 결과는 산문이 아니라 **기계 판독 가능한 형태**로
  `docs/multi-session-work-loop/m6-audit-sample.json`에 남긴다 —
  `{ anchor, samples:[{ decision_id, automated_verdict, human_verdict, agreed, note }], agreed_count, sampled_count }`.
  `agreed:false`가 1건이라도 있으면 그 사실을 report에 적고 **해당 주기 B1을 무효로 표기**한다
  (PRD "감사 표본" 규칙 — 불일치 시 다음 주기까지 무효 처리). **이 무효화는 Validation §3이 `throw`로
  강제한다** — 경고만 남기고 exit 0으로 통과시키면 "사람이 반증해도 게이트는 통과"가 되어 UI14가
  요구하는 대조가 장식이 된다(R2 invariant/CRITICAL 흡수).
- **감사 표본은 test로 강제할 수 없고, 그 사실을 숨기지 않는다 (L2 test MEDIUM 흡수)**: 사람의 판단이
  분자이므로 자동 게이트로 만들 수 없다. 대신 **아티팩트의 존재와 형식은 기계 검사한다** — 파일 부재 ·
  `sampled_count < min(3, drift_count)` · `anchor.plan_file_hash` 불일치는 Validate에서 비영점 exit이다.
  즉 "감사를 했는가"는 강제할 수 없어도 "감사 기록 없이 완료를 주장하는 것"은 막는다. 이 한계는
  `status-adjudication-design.md` 비보증 절에 적는다.
- **주의**: `drift_count`가 0이 아니어도 milestone은 완료다. B1의 목표치(0건)는 **파이프라인 운영의**
  목표이지 M6의 수용 조건이 아니다 — M6의 수용 조건은 "판정이 기계화되고 `computed`로 뒤집혔는가"다.
  실제로 M6 자신의 PRD 행이 `pending`인 채 ship되면 그 행이 drift로 잡히며, 그것이 지표가 작동한다는
  증거다.
- **Validate**: 아래 Validation §3 블록 (전환 · 앵커 대조 · 감사 표본 형식 3축)

## Validation

```bash
# 1. 신규/변경 test 전수
node --test plugins/mccp/scripts/lib/tests/
node --test plugins/mccp/scripts/derive/tests/
node --test plugins/mccp/scripts/lib/archive-complete/tests/
node --test plugins/mccp/scripts/lib/renderer/tests/

# 1b. Acceptance가 요구하는 개별 단언이 실제로 존재하는지 (R4 test HIGH ×3 흡수)
#     위 디렉토리 실행은 "돌린 test가 통과했다"만 말하고 "요구한 test가 있다"는 말하지
#     않는다. manifest 대조가 그 간극을 닫는다 — 누락 id가 있으면 비영점 exit.
node plugins/mccp/scripts/lib/msw-metrics/assertion-manifest-check.js \
  --manifest docs/multi-session-work-loop/m6-assertion-manifest.json

# 2. 독립성 정적 lint (비영점 exit = 위반)
node plugins/mccp/scripts/lib/msw-metrics/b1-independence-lint.js

# 3. B1 라이브 전환 + 앵커 대조 + 감사 표본 형식 (UI6 · UI14 — 완료 판정의 유일 근거)
#    m6-after.json 은 Task 0 과 동일한 { metrics, anchor } 스키마로 쓴다.
node -e "
  const b=require('./docs/multi-session-work-loop/m6-before.json');
  const a=require('./docs/multi-session-work-loop/m6-after.json');
  const s=require('./docs/multi-session-work-loop/m6-audit-sample.json');
  if (a.metrics.B1.status !== 'computed')
    throw new Error('B1 not computed: ' + a.metrics.B1.invalid_reason);
  if (b.anchor.plan_file_hash !== a.anchor.plan_file_hash)
    throw new Error('anchor mismatch — before/after describe different plans');
  // R6 invariant/MEDIUM — plan_file_hash 만으로는 '같은 분모'를 보증하지 못한다. B1 의
  // denominator 는 PRD ## Delivery Milestones 행 수에서 나오고 그 표는 plan 을 건드리지 않고
  // 바뀔 수 있으므로(M7 행 추가·타 PRD 등장), 위 검사만 통과한 채 5→6 으로 달라진 두 모집단
  // 위에서 'insufficient → computed 전환'이 주장될 수 있다. 통약 불가한 두 수의 대조는 측정이
  // 아니다. 복구는 Task 0 재실행(같은 표 상태에서 baseline 을 다시 봉인).
  if (b.anchor.prd_milestone_rows !== a.anchor.prd_milestone_rows)
    throw new Error('denominator incommensurable — PRD milestone rows changed ' +
      b.anchor.prd_milestone_rows + ' -> ' + a.anchor.prd_milestone_rows + '; re-run Task 0');
  // tracked_receipt_count 는 여기서 의도적으로 대조하지 않는다 (R6 invariant/LOW). 사이클 중
  // 새 ship 이 나면 정상적으로 늘어나므로 같기를 요구하면 정상 동작이 게이트에 걸린다. 이 필드는
  // 관측이며, 소비처는 구현 보고서다 — 값이 아니라 '얼마나 달라졌는가'가 읽을거리다.
  const need = Math.min(3, a.metrics.B1.numerator);
  if ((s.sampled_count || 0) < need)
    throw new Error('audit sample too small: ' + s.sampled_count + ' < ' + need);
  if (s.anchor.plan_file_hash !== a.anchor.plan_file_hash)
    throw new Error('audit sample anchored to a different plan');
  console.log('B1 drift=' + a.metrics.B1.numerator + '/' + a.metrics.B1.denominator +
    ' undetermined_evidence=' + a.metrics.B1.undetermined_evidence_count +
    ' audited=' + s.agreed_count + '/' + s.sampled_count);
  // R2 invariant/CRITICAL — 감사 불일치는 THROW 다. 초안은 console.warn 이어서 exit 0 으로
  // 통과했고, 그것이 곧 '지표를 무효로 표기한다'는 Action 을 게이트가 강제하지 않는
  // fail-open 이었다. 이 축의 요지가 '자동 산출값을 사람이 반증할 수 있어야 한다'(UI14)인데
  // 반증이 나와도 통과한다면 검사 자체가 장식이다.
  if (s.agreed_count !== s.sampled_count)
    throw new Error('audit disagreement (' + s.agreed_count + '/' + s.sampled_count +
      ') — B1 is INVALID for this cycle; record the disagreement and do not claim the flip');"

# 4. 대시보드 표면 (UI8)
node plugins/mccp/scripts/derive/cli.js render
grep -n "진행 상태 drift" .claude/cache/STATUS.md

# 5. 기존 표면 무손상 (UI9)
node plugins/mccp/scripts/lib/archive-complete/scan.js --json > /dev/null
node plugins/mccp/scripts/lib/evidence-audit.js --json > /dev/null

# 6. 전체 스위트 — 신규 red 0 (사전 존재 red는 아래 Risks 참조)
node --test plugins/mccp/scripts/
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **join key를 통한 독립성 누수** — 증거 조회에 필요한 decision slug가 PRD 행의 Plan 셀에서 오므로 "문서 파생"이라는 반론이 가능하다 | 높음 | 계약이 요구하는 것은 **verdict의 독립**이지 identity의 독립이 아니다(어느 milestone인지 모르면 대조 자체가 불가능하다). 이 논증을 설계 문서에 명시하고, Task 2a의 **양방향** 단언(증거층 불변 ∧ 판정층 가변)이 "verdict가 status에 반응하지 않는다"를 반증 가능하게 고정한다 |
| **basename 중복이 verdict를 조용히 복제** — 두 milestone 행이 같은 plan basename을 선언하면 `decision_id`가 충돌해 같은 receipt를 가리킨다 | 중 | Task 3이 증거 조회 **전에** PRD 내부 중복을 검출하고 충돌 행 전부를 `undetermined` + warning으로 강등한다. 첫 행/마지막 행 채택 금지 — 임의 선택은 오판을 확정한다 |
| **정적 lint가 간접 의존을 못 잡아 없는 보증을 믿게 됨** — 별칭 require·동적 require·호출자가 status를 다른 이름으로 전달하는 경로는 소스 스캔으로 안 잡힌다 | 중 | lint를 **2차** 통제로 명시하고 1차는 Task 1의 타입 경계(오라클 I/O 0)로 둔다. 이 순서를 `status-adjudication-design.md` 비보증 절에 적어 lint 통과를 독립성 증명으로 오독하지 않게 한다 |
| **오라클 예외가 `archive-complete`에서 "drift 없음"으로 읽힘** — 현행 `collectDriftEvidence`의 `catch`가 `driftSuspect:false`를 반환한다 | 중 | Task 6이 실패를 `undetermined` + `warnings`로 올려 `degraded:true`가 되게 바꾸고, throw하는 stub으로 회귀 고정한다 |
| **감사 표본은 자동 강제가 불가능** — 분자가 사람의 판단이라 게이트로 만들 수 없다 | 중 | "감사를 했는가"는 강제하지 않되 **"감사 기록 없이 완료를 주장하는 것"은 막는다** — 아티팩트 부재·표본 수 미달·앵커 불일치를 Validate가 비영점 exit으로 차단. 한계는 비보증 절에 명시 |
| **비정규 status 행의 처리가 지표를 왜곡** — drift로 세면 정직한 주석이 벌받고, 조용히 빼면 커버리지 구멍이 숨는다 | 높음 | 분자·분모 어디에도 넣지 않고 `undetermined_count`로 분리 계수 + `raw_row_count` 병기 + 대시보드에 커버리지 단서 노출(Task 3·5) |
| **receipt 유실 구간이 `not-shipped`로 오판정** — receipt는 과거에 git 미추적이었고 §3.12 이전 작업 단위는 증거가 없다 | 중 | `undetermined`를 3번째 상태로 두고 `not-shipped`와 분리. `evidence-audit.js`의 "부재는 결함 부재가 아니다"(E1) 규칙을 그대로 계승 |
| **`archive-complete` 회귀** — ledger 강등이 archivable 판정을 바꾸면 아카이브 도구가 오작동 | 중 | `isArchivable`/`classifyMilestones` 무변경을 명시 불변식으로 두고, 기존 test를 회귀로 고정(Task 6) |
| **renderer 변경이 design critique loop을 발화** — §3.9 트리거로 사이클 비용이 늘어난다 | 중 | 우회하지 않는다. Task 5를 마지막 코드 Task로 두어 loop이 안정된 본문 위에서 돌게 한다 |
| **브랜치명 `v1.24.0`과 §3.7 patch 규칙(`1.23.11`)의 불일치** | 중 | §3.7이 규칙(단일 milestone = patch, M7·M8 미완이므로 minor 아님)이므로 `1.23.11`을 따르고 이 편차를 PR 본문에 명시한다. 병렬 브랜치 version 충돌은 forward-only 상향으로 해소(§3.7 6번째 재발 이력) |
| **사전 존재 red 상속** — `b2-coverage-gate` 2건(#118 소관) · `perf-budget` 병렬 flake | 중 | M6에서 고치지 않는다. 착수 시 red 목록을 봉인하고 "신규 red 0"만 수용 조건으로 삼는다 |
| **`drift_count > 0`을 실패로 오독** | 중 | Task 9 주의 항목 + Acceptance 문구로 분리. 목표치 0건은 파이프라인의 목표이지 milestone의 수용 조건이 아니다 |
| **활성 PRD가 1개뿐이라 분모가 작다** | 낮음 | 절대 건수 지표라 비율 왜곡은 없다. 분모와 제외분을 항상 병기해 표본 크기를 독자가 알게 한다 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)
      — **구체적으로**: `node plugins/mccp/scripts/derive/cli.js run --json`이 실 repo에서
      `B1.status === 'computed'`를 반환하고, `docs/multi-session-work-loop/m6-after.json`이
      `m6-before.json`의 `insufficient`와 대조되며, `derive/cli.js render`가 만든
      `.claude/cache/STATUS.md`에 B1 행이 **건수**로 나타난다. 세 산출물이 전부 없으면 미완이다.
- [ ] `b1-independence-lint.js`가 exit 0이고, 위반 fixture **4종** 전부에서 비영점 exit임을 test가
      단언한다(4번째 = `receiptPresent` 생성이 `b1-evidence-builder.js` 밖에 있는 `scan.js` 사본)
- [ ] **`receiptPresent`가 커밋 도달성으로 판정된다** — *staged-but-uncommitted* stub에서 `false`임을
      단언한다(R7 security CRITICAL 흡수). untracked stub만 덮으면 `fs.existsSync` 구현만 걸러지고
      `git ls-files`(index) 구현은 통과하는데, staged-only receipt는 worktree 삭제와 함께 사라지므로
      §3.12의 내구성 계약을 만족하지 않는다
- [ ] **증거 구성 지점이 `b1-evidence-builder.js` 단 하나다** — `derive/sources/milestone-evidence.js`와
      `archive-complete/scan.js`가 둘 다 그것만 호출하고, lint 축 (iv)가 이를 정적으로 고정한다
      (R7 invariant HIGH ×2 흡수 — 오라클은 순수 함수라 주입값의 **출처를 볼 수 없으므로**, 런타임
      검증이 불가능하고 생산자 유일성만이 기계 장치다)
- [ ] Task 2a 변조 불변성 test가 **실 PRD와 합성 fixture 양쪽**에서 통과하고, fixture 건전성 가드
      (≥1 반전 행 존재)가 함께 단언된다
- [ ] **`decisionFromBasename` 동치 test가 존재하고 통과한다** — `scan.js`의 구현과 오라클의 재구현이
      동일 입력 집합에서 같은 출력을 낸다. 이 단언이 없으면 join key가 두 표면에서 갈라져도 아무도
      모른다(R3 invariant/HIGH 흡수 — 이전에는 Task 1 Validate와 L2 기록에만 있고 Acceptance에는 없었다)
- [ ] **`receiptPresent`의 git-tracked 동작 test가 존재하고 통과한다** — 워킹트리 존재 ∧ untracked
      stub에서 `false`(R3 test MEDIUM 흡수)
- [ ] **`evidence` 스키마 거부가 양방향으로 단언된다** — 여분 키 주입 ∧ **필수 5필드 각각의 누락**이
      전부 `undetermined`+`evidence-schema-invalid`(R6 test MEDIUM 흡수 — 한쪽만 덮으면 4필드짜리
      evidence의 `undefined`가 `false`로 접혀 부재가 판정으로 바뀐다)
- [ ] **default-ref fallback 3분기가 단언된다** — `origin/HEAD` → `origin/main` → `undetermined`이며
      **로컬 `HEAD`로 폴백하지 않음**을 호출 인자로 확인한다(R6 test MEDIUM 흡수 — 폴백하면 미머지
      브랜치가 default branch로 오판돼 `not-shipped` 방향의 drift가 통째로 증발한다)
- [ ] **Task 0/9 앵커의 `prd_milestone_rows`가 before/after 동일하다** — 불일치는 Validation §3이
      throw로 차단한다(R6 invariant MEDIUM 흡수 — `plan_file_hash`는 분모의 통약성을 말하지 않는다)
- [ ] **`computeB1` 사다리 4분기가 각각 단언된다** — `degraded` · `independence_ok:false` ·
      `denominator:0` · 정상(`value === null` + 병기 7필드)
- [ ] `drift_items` **`min(3, drift_count)`건**을 사람이 receipt/git과 직접 대조하고 결과를
      `docs/multi-session-work-loop/m6-audit-sample.json` + **구현 보고서
      `.claude/PRPs/reports/multi-session-work-loop-m6-report.md`의 `## 감사 표본` 절** 양쪽에
      기록한다(UI14 · R3 test LOW 흡수 — 기록 위치를 정하지 않으면 어떤 도구도 확인할 수 없다).
      `drift_count`가 0이면 표본도 0건이며 그것이 정상이다 — Validate의 `need` 계산과 같은 식이고,
      "항상 3건"으로 읽으면 drift 0인 건강한 상태에서 게이트가 막힌다(R5 test LOW 흡수)
- [ ] `archive-complete`의 archivable 판정이 변경 전후로 동일하다(회귀 test)
- [ ] **`archive-complete`가 오라클 실패를 `degraded:true`로 표면화한다** — throw stub에서
      `driftSuspect:false`가 아니라 `evidence_verdict:'undetermined'` + `warnings` ≥1 + `degraded:true`
      임을 단언한다(R4 invariant MEDIUM 흡수 — "판정 불변"만으로는 fail-open 강등을 못 잡는다)
- [ ] Task 0/9 앵커가 **디스크의 plan 파일을 재해싱한 값과 일치**한다(필드 존재 검사가 아니라)
- [ ] **`m6-assertion-manifest.json` 대조가 absent 0으로 통과한다** — 위 Acceptance 항목들이 요구하는
      개별 단언이 실제로 test에 존재함을 기계가 확인한다. 이 항목이 없으면 나머지 Acceptance 항목은
      게이트가 아니라 규율이다(R4 test HIGH ×3 흡수)
- [ ] Task 0을 재실행했다면 그 사실과 사유가 구현 보고서에 기록돼 있다(R4 invariant LOW 흡수).
      **이 항목은 사람의 보고 규율이고 게이트가 아니다** — before 스냅샷이 in-place 덮어쓰기라
      재실행 여부를 기계가 구별할 수 없다. 강제하려면 세대별 보존 기판이 필요하고 그것은 UI12에
      반한다(R6 invariant MEDIUM — 비보증으로 흡수, 비보증 절에 명시)
- [ ] **대조기 자신의 test가 존재하고 통과한다** — 필수 id 누락 manifest·미발견 `test_title`에서 각각 비영점 exit임을 단언한다. 이 항목이 없으면 무력한 대조기가 위 모든 Acceptance 항목을 무력화한다(R5 test MEDIUM 흡수)
- [ ] `plugin.json`·html footer·markdown derived·i18n test 단언·CHANGELOG 5면 version 동기
- [ ] 전체 스위트에서 **신규** red 0 (사전 존재 red 목록은 착수 시 봉인)
- [ ] Validate/Task 명령에 머신 고유 절대경로 호출이 **0건** — `grep -nE 'node +"[A-Za-z]:/' .claude/plans/multi-session-work-loop-m6.plan.md`
      (아래 L2 흡수 기록에 남은 경로 인용 2건은 *발견 내용의 서술*이지 실행 명령이 아니므로 이 패턴에 걸리지 않는다)

## L2 Review — R1 흡수 기록

첫 라운드 패널(architect·security·test·invariant, quorum 3/4) 판정은 **divergent**였다
(`architect` pass · 나머지 3 fail, blocking 4건). 기록: `.claude/reviews/plan-review-multi-session-work-loop.md`
(halt_stage `5.2e`, wall-clock 604s). 13건 전부를 **수용**했고 기각은 0건이다 — 설계를 뒤집는 지적은
없었고 전부 *plan이 구현 단계로 미룬 결정*을 앞당기라는 요구였다.

| 출처 | Severity | Finding | 흡수 |
|---|---|---|---|
| test | **HIGH** | Task 2a 변조 불변성 test가 논리적으로 성립하지 않는다 — status를 뒤집으면 drift 판정은 **반드시** 바뀌므로 "verdict 집합 동일"은 그대로 쓸 수 없다 | Task 2a를 **2단 양방향 단언**으로 재작성: 증거층(`decision_id`, `evidence_verdict`)은 불변 · 판정층(`drift_count`/`drift_items`)은 **반전되어야 함**. 후자가 없으면 상수 반환 오라클도 통과한다 |
| test | MEDIUM | Task 5 Validate에 `C:/Users/skypark207/…` 하드코딩 — 다른 머신에서 실행 불가 | detector 경로를 `os.homedir()` 기반 후보 탐색으로 교체 + 미설치는 advisory skip. Acceptance에 절대경로 0건 검사 추가 |
| test | MEDIUM | Task 9 감사 표본에 강제 수단도 실패 처리도 없다 | 결과를 `m6-audit-sample.json`으로 기계 판독 형식화하고, **아티팩트 부재·표본 미달·앵커 불일치**를 Validate 비영점 exit으로 차단. "감사 여부"는 강제 불가임을 비보증 절에 명시 |
| security | MEDIUM | PRD 내 plan basename 중복 시 `decision_id` 충돌로 verdict가 조용히 복제 | Task 3이 증거 조회 **전에** 중복 검출 → 충돌 행 전부 `undetermined` + warning. 임의 채택 금지 |
| security | MEDIUM | Task 2a 명세가 불완전해 위양성 통과 가능 (오라클이 몰래 파일을 읽어도 통과) | Task 1에서 오라클의 **자체 I/O를 0으로** 고정(증거는 주입). 위조 구현이 존재 불가해지고 2b lint가 `fs`/`child_process` require 0을 정적 단언 |
| security | LOW | git 도달성 확인 기법 미명시 | `git ls-tree -r --name-only <default-ref>` + `origin/HEAD`→`origin/main` 순 resolve, 실패는 **`undetermined`**(로컬 `HEAD` 폴백 금지) |
| security | LOW | 오라클 순수성 요구가 test에 없다 | 위 Task 1 타입 경계 + 2b lint 축 (ii)로 이관 |
| invariant | MEDIUM ×2 | Task 6 오라클 실패가 fail-open 강등을 만든다 / `decision_id` 파생 규칙 미명시 | Task 6에 실패 → `undetermined` + `degraded:true` 명시(throw stub 회귀) · Task 1에 `decisionFromBasename` 동일 규칙 명시 |
| invariant | MEDIUM | 2b lint가 간접 의존을 못 잡는다 | lint를 **2차** 통제로 격하하고 1차는 타입 경계임을 비보증 절에 명시 |
| invariant | MEDIUM | Task 0/9 스냅샷에 anchoring이 없다 | 두 스냅샷을 `{ metrics, anchor }` 스키마로 통일하고 `plan_file_hash` 불일치를 Validate가 차단 |
| invariant | MEDIUM | 음성 test fixture 형태 미정의 | 2b의 3축에 1:1 대응하는 fixture 3종을 명시(ledger require · `fs` require · status 리터럴) |
| invariant | MEDIUM | 오라클 구현이 없어 검증 사각 | 이 축은 **plan이 닫을 수 없다**(구현은 `/mccp:prp-implement` 소관). plan이 할 수 있는 것은 검증을 사전 고정하는 것이고, 위 흡수가 그것이다 |

`architect`는 pass였고 인용 정확성(computeA4 사다리 · rawRowCount 등식 · evidence-audit blind 규칙 ·
`codex_verdict` 의미)을 전수 대조한 뒤 구조적 결함 미발견을 보고했다.

## L2 Review — R2 흡수 기록

2라운드도 **divergent**였다(blocking 5건). HIGH는 사라졌으나 **CRITICAL 1건**과 설계상 실결함 1건이
새로 나왔다. 8건 전부 수용, 기각 0건.

| 출처 | Severity | Finding | 흡수 |
|---|---|---|---|
| invariant | **CRITICAL** | 감사 표본 불일치가 게이트를 통과한다 — Action은 "B1 무효 표기"를 요구하는데 Validation은 `console.warn` 후 exit 0 | Validation §3을 **`throw`** 로 교체. 사람이 반증해도 통과하면 UI14 대조가 장식이다 (test MEDIUM 중복 지적과 동일 축) |
| architect | MEDIUM | **`shipped` 판정이 "PR이 났는가"와 "Codex가 승인했는가"를 혼동한다** — `codex_verdict`를 ship 전제로 걸면 audited override로 divergent인 채 ship된 작업 단위가 drift로 오계상된다 | **실결함 인정.** ship 판정식에서 `codex_verdict`를 **제거**하고 병기 필드로 강등. 근거: 직전 M5가 정확히 그 경로로 ship됐고(`pr_codex_force_override=true`), terminal ship gate가 no-ship 시 finalize `exit 12`로 receipt를 쓰지 않으므로 **receipt 존재 자체가 ship 증거**다 |
| architect · security | MEDIUM ×2 | `evidence` 객체가 이름 나열뿐이라 오라클↔source 경계가 계약이 아니다 (`receiptPresent`가 파일 존재인지 git-tracked인지도 불명) | 5필드 **형식 표**로 명세하고 그 외 키는 거부(`evidence-schema-invalid` → `undetermined`). **검증 책임을 오라클에 둔다** — 주입 측에 두면 오라클 test가 malformed 입력을 직접 먹여볼 수 없다 |
| test | MEDIUM | 증거가 `undetermined`인 행의 **분모 소속이 불명** | 두 축을 분리: 비정규 status(`noncanonical_status_count`)는 분모 **제외**, 증거 미확정(`undetermined_evidence_count`)은 분모 **포함·분자 제외**. 후자를 빼면 "증거를 못 구할수록 성적이 좋아지는" 경로가 열린다. 항등식을 source가 자체 검증 |
| invariant | MEDIUM | `receiptPresent`의 git-tracked 확인이 Task 3에 명시되지 않아 `fs.existsSync`로 구현될 수 있다 | `git ls-files --error-unmatch`로 명시. §3.12가 ship receipt를 git-tracked로 규정한 이유가 worktree 삭제 후 대조이므로 untracked 사본은 corpus가 아니다. **[R7에서 무효화됨 — `git ls-files`는 index를 보므로 staged-only도 통과한다. 현행 판정식은 `git cat-file -e HEAD:<path>`(커밋 도달성)이며 Task 3이 정본이다.]** |
| test | LOW | `computeB1` 사다리 3분기의 test 위치·단언이 미지정 | `msw-metrics.test.js`에 describe 블록 + 분기당 단언 명시. **`degraded`와 `independence_ok`를 별개 단언으로** 쪼갬(OR로 묶여 하나만 test하면 나머지가 미검증) |
| architect | LOW | `decisionFromBasename` 재사용 요구 ↔ lint의 `fs`/`child_process` require 0 요구가 충돌(`scan.js:21-23`이 둘 다 require) | `scan.js`를 **import하지 않고** 정규식 재구현 + **동치 test**로 고정. lint는 직접 require만 검사하며 그 범위 한계를 비보증 절에 명시 |
| invariant | LOW | 앵커 대조가 사후적이라 예방이 안 된다 | 한계로 수용·기록. 예방하려면 구현 기간 plan 동결이 필요한데 구현 중 plan 정정은 정상 작업이라 동결이 더 나쁜 규칙이다. 재측정으로 해소 |

## 이 milestone이 주장하지 않는 것

- **drift를 0으로 만들지 않는다.** 판정과 가시화를 만들 뿐이고, 교정은 사람이 승인하는 기존 명령
  (`/mccp:dashboard-audit`·`/mccp:archive-complete`)에 남는다. 자동 교정은 두 소스를 의존 관계로 만들어
  지표를 무효화하므로 **의도적으로 하지 않는다**.
- **milestone의 품질을 판정하지 않는다.** 증거가 답하는 질문은 "이 작업 단위가 ship됐는가"이지
  "잘 됐는가"가 아니다.
- **§3.12 이전 증거 공백을 메우지 않는다.** 그 구간은 `undetermined`로 남으며, 그것이 정직한 표기다.
- **B1 목표치(0건) 달성을 주장하지 않는다.** M6의 완료 판정은 `computed` 전환이다(UI6).
- **Task 0 재실행을 탐지하지 않는다.** before 스냅샷이 in-place 덮어쓰기라 재실행 앵커와 원래 앵커가
  구별 불가능하다. 보고서 기록은 규율이지 게이트가 아니다(R6 invariant 흡수).
- **`tracked_receipt_count`로 아무것도 판정하지 않는다.** 앵커에 봉인만 하고 Validate는 읽지 않는다 —
  사이클 중 증가가 정상이므로 일치를 요구하면 정상 동작을 막는다(R6 invariant 흡수).

## Design Critique

- 트리거: axis (a) detector positive — `design_signal=true`, `signal_files` 10개
  (`renderer/sections/msw-metrics.js` · `renderer/html.js` · `renderer/markdown.js` ·
  `renderer/tests/i18n-surface.test.js` ·
  `derive/index.js` · `derive/sources/{session-journal,milestone-evidence}.js` 외)
- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` Read 완료
- 라운드: **누적 4** (1회차 R0→R1 · 2회차 R0→R1) · cap 2 · **최종 verdict `CONVERGED`**
- **M5와 다른 점**: M5는 신규 렌더 표면을 도입하지 않아 4개 제약이 전부 무영향이었다. **M6은 B1 metric
  row에 drift 상세라는 신규 표면을 실제로 도입**하므로 4개 제약이 모두 유효 사거리 안에 있다.

### 1회차 (Task 5 제약 명문화)

- Assessment A — R0 findings **3건, 전부 HIGH, 전부 `Task 5` 지목**:
  | # | Severity | Finding | R1 해소 |
  |---|---|---|---|
  | F1 | HIGH | drift 목록이 `<h4>` 이상 heading을 도입하면 H15(정보 위계 3단계) 위반이고, Phase 3.7 produced-diff grounding lint가 `enforce`로 hard block한다 | Task 5에 "신규 heading 0개 · 기존 row 안쪽 목록/표로만" 명문화 |
  | F2 | HIGH | `drift_count > 0`을 전용 accent로 칠하면 같은 viewport에 2번째 강조가 생겨 강조색 1개 제약 위반 | Task 5에 "drift 전용 accent 토큰 신설 금지 · 기존 `STATUS_META` 클래스 재사용" 명문화 |
  | F3 | HIGH | drift 항목의 milestone 이름은 PRD 표 셀에서 오는데 그 셀은 관례상 볼드 마커를 포함하므로(`**진행 상태 기계 판정**`) `stripAxisIdPrefix`만 거치면 렌더 표면에 `**`가 누출된다 — raw markdown marker 금지 위반 | Task 5에 인라인 마커 정규화 + 회귀 test 요구 명문화 |
- 4번째 제약(한 화면 항목 수 상한)은 이 회차에서 *"Task 5가 이미 top-3 + `<details>` 접기를 명시"* 로
  finding 없음 처리했다. **그 판정이 2회차에서 뒤집혔다** — 아래.

### 2회차 (게이트 slug 정정 재진입 — 렌더러 소스 대조)

1회차는 4번째 제약을 **plan 문면만 보고** 통과시켰고 `msw-metrics.js` 현재 구조를 대조하지 않았다.
대조하니 실결함이 나왔다.

- Assessment A — R0 findings **3건** (HIGH 1 · MEDIUM 2), 전부 `Task 5` 지목:
  | # | Severity | Finding | 근거 | R1 해소 |
  |---|---|---|---|---|
  | F1 | **HIGH** | "drift 항목 top-3 + `<details>`"가 렌더러에 **이미 있는** 단일 공유 collapse(`<details class="msw-metrics-extra">`)와 충돌한다. `decisionPriority`상 B1이 `computed` ∧ `numerator===0`이면 우선순위 2라 `extraRows`로 밀리고, 그 안에서 또 collapse를 열면 **2단 중첩 disclosure**가 된다 — 제약 4와 PRODUCT.md 원칙 3이 둘 다 거부 | `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js:130-148, 361-409` | drift 상세를 A3·B3와 **동일 계층**(`coReportDetails` 원소)으로 이동. 상위 3건 `·` 연결 + `(+N건)` 절삭 병기, **새 `<details>` 미도입** |
  | F2 | MEDIUM | drift 목록의 **구조적 위치** 미지정. `<tr><td>×4</tr>` compact 표의 `<td>`에 `<ul>`을 넣으면 컬럼 리듬이 깨진다. house pattern은 `<p class="muted">` 한 줄이다 | `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js:201-236, 405-407` | HTML `<p class="muted">` 한 줄 · markdown은 `<details>` 안 단락 한 줄로 명문화 |
  | F3 | MEDIUM | 인라인 마커 정규화가 `**`/`_`/백틱만 다루고, 이 파일이 M3 F4에서 확립한 **신규 문자열 em-dash 금지**(`구분자는 '·'와 괄호만`)가 빠졌다. drift 상세 줄은 신규 문자열이다 | `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js:186-200` | 제약 3 항목에 em-dash 금지 추가 + 회귀 단언에 반영 |
- R0 흡수가 만든 **내부 모순 2건**을 같은 회차에서 해소했다 — `Files to Change` 86행·91행이 옛
  "top-3/`<details>` 접기" 서술을 유지하고 있었다(M5 회고에서 L2 패널이 놓친 실패 유형). 매니페스트
  `B1-RENDER-CONSTRAINTS`도 새 단언 2축(em-dash 0 · `<details>` 개수 불변)을 포함하도록 넓혔다 —
  **id는 신설하지 않았다**(17종 유지, UI12).
- Assessment B (detector, `detect.mjs --json .claude/cache/status.html`): findings **2건, 둘 다 이 plan이
  도입한 것이 아니다** — 생성 아티팩트의 **선재** 상태이며 M5 사이클과 동일 항목이다.
  - `em-dash-overuse` (warning) — 본문 em-dash 29개. 소스가 한국어 `.claude/` 산출물이라 파생 결과
  - `numbered-section-markers` (advisory) — `06, 08, 09, 10, 11, 12`. milestone 번호이므로 오탐 공산이 높음
  - 둘 다 HIGH/CRITICAL 아니고 plan 섹션을 지목할 수 없으므로(critique invariant) actionable에 넣지 않고
    관측으로 기록한다. Task 5의 Validate는 **신규** HIGH/CRITICAL 0건만 요구한다
- 결론: 2회차 R1 재critique에서 4개 제약 전부 재대조, plan-actionable findings **0건** → `CONVERGED`
  (`decideCritique({round:1, cap:2})` 확인). 1회차와 달리 이번 판정은 **plan 문면이 아니라 렌더러
  소스와 대조**한 결과다 — 그 차이가 F1(실결함)을 드러냈다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더 UI가 없어 **어떤 impeccable 명령도
invoke하지 않으며**, 아래는 implementer용 체크리스트다. M6은 M5와 달리 렌더 표면을 실제로 도입하므로
implement 단계에서 `renderingSurface` selector가 refine/discovery를 강등하지 **않을** 공산이 크다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->

## External Research Provenance

- Source PRD: .claude/prds/multi-session-work-loop.prd.md
- References section sha256: 1aaa7924f4e1ebed8993b242c00788e1c0ad84319463ff89f3a29625b33aa880
- Stamped at: 2026-08-15T03:23:35.252Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## L2 Review — R3 흡수 기록

3라운드는 **architect·security PASS**, test·invariant FAIL이었다(blocking 3건). findings는
13 → 8 → 7로, 통과 관점은 1 → 0 → 2로 움직였다. 7건 전부 수용, 기각 0건.

| 출처 | Severity | Finding | 흡수 |
|---|---|---|---|
| invariant | **HIGH** | `decisionFromBasename` 동치 test를 R2 기록과 Task 1 Validate에는 적었으나 **Acceptance에 없다** — 구현이 그 test를 빠뜨리거나 다른 이름으로 두면 join key 분기가 탐지되지 않는다 | Acceptance에 독립 항목으로 승격. "Validation passes" 같은 포괄 문구는 특정 단언을 강제하지 못한다 |
| invariant | MEDIUM | 앵커가 **자기 자신을 검증하지 않는다** — Task 0 Validate는 필드 존재만 보고 실제 파일 해시와 대조하지 않아, before/after를 같은 가짜 값으로 맞추면 편집이 숨는다 | Validate가 **디스크 plan을 재해싱해 대조**. 위조 자체를 막지는 못하지만(§3.12가 인정한 한계와 동형) **편집을 잊은 정직한 실수**는 확실히 잡는다 |
| test | MEDIUM | `plan_file_hash` 계산 방법이 "receipt의 `plan_hash` 기법 차용"뿐이라 호출할 함수·명령이 없다 | **한 줄로 정의**: `sha256(CRLF→LF 정규화한 파일 텍스트)` hex. receipt의 `plan_hash`를 끌어오지 **않는** 이유(§3.12 no-rehash와 얽힘)까지 명시 |
| test | MEDIUM | `git ls-files` 사용을 **동작으로** 검증하는 test가 없어 `fs.existsSync` 구현으로 조용히 대체될 수 있다(정적 lint는 이 차이를 못 봄) | `opts.gitQuery` 주입 + *워킹트리 존재 ∧ untracked* stub에서 `receiptPresent:false` 단언. **[R7에서 보강됨 — untracked stub만으로는 `git ls-files`(index) 구현이 통과한다. *staged-but-uncommitted* stub이 추가돼야 index 확인과 커밋 도달성이 갈라진다. Task 3이 정본이다.]** |
| test | MEDIUM | Task 2a 판정층 단언이 **공허하게 통과**할 수 있다 — 실 PRD 행이 전부 `undetermined`거나 status를 뒤집어도 drift 범주가 안 바뀌면 반전 0건 | 판정층 단언을 **합성 fixture**로 옮기고, **fixture가 ≥1 반전을 갖는지 test가 먼저 단언**(건전성 가드). 증거층 단언은 실 PRD와 fixture 양쪽에서 |
| test | LOW | 감사 표본 기록 **위치**가 미지정이라 외부 도구가 확인할 수 없다 | `m6-audit-sample.json` + 구현 보고서 `## 감사 표본` 절 **양쪽**으로 고정 |
| test | LOW | detector 미설치 시 Task 5의 디자인 검사가 **전부** 사라진다 | detector 비의존 단언 3종을 `msw-metrics-render.test.js`에 둠(신규 h4+ 0건 · 신규 accent 클래스 0건 · 인라인 마커 0건). detector는 그 위에 얹는 추가 관측 |

`architect`는 인용 정확성·증거 경계·독립성 3층·archive-complete 보존·baseline 유효성·M7/M8 seam
호환을 대조한 뒤 pass했고, `security`는 경로 traversal(basename-only 추출)·receipt 경로 주입·
evidence 스키마 신뢰 경계·git index 검증을 공격한 뒤 pass했다.

## L2 Review — R4 흡수 기록

4라운드도 **architect·security PASS**(2연속), test·invariant FAIL. 9건 전부 수용, 기각 0건.
이번 라운드는 산발적 지적이 아니라 **하나의 구조적 결함**으로 수렴했다.

### 지배적 지적 — Acceptance는 게이트가 아니었다 (test HIGH ×3 + MEDIUM ×2, invariant MEDIUM ×1)

Acceptance는 `decisionFromBasename` 동치 · `receiptPresent` git-tracked 동작 · lint 음성 fixture 3종 ·
`computeB1` 4분기 · fixture 건전성 가드 같은 **개별 단언**을 요구하는데, Validation은
`node --test <디렉토리>`라 그중 어느 것이 빠져도 통과한다. 즉 R1~R3에서 흡수한 항목 상당수가
**사람이 읽고 지키는 규율**로만 존재했고 기계가 확인하지 않았다.

역설적인 것은 **답이 이미 plan 안에 있었다**는 점이다 — Task 7이 `m6-assertion-manifest.json`
(단언 ↔ test 제목 대조, absent 0)을 명명해 놓고 **Validation 절에 배선하지 않았다**. R4는
그 미배선을 정확히 지목했다. 흡수: manifest에 Acceptance 요구 단언 17개 id를 열거하고,
`assertion-manifest-check.js`를 Validation §1b에 **차단 명령**으로 배선했다.

### 나머지

| 출처 | Severity | Finding | 흡수 |
|---|---|---|---|
| invariant | MEDIUM | **cross-PRD basename 충돌 미검출** — `decision_id`에 PRD 성분이 없어 다른 두 PRD가 같은 basename을 쓰면 같은 receipt를 가리키는데, 검출 범위가 PRD 단위였다 | 집계 범위를 **활성 PRD 전역**으로 확대. PRD가 달라도 충돌 행 전부 `undetermined` |
| invariant | MEDIUM | plan 상단의 "git-tracked 46건"이 어디서도 검증되지 않는다 | 앵커에 `tracked_receipt_count` 봉인. **관측이지 게이트가 아니다** — 46에 판정을 걸면 그 자체가 새 취성이 된다(사이클 중 새 ship이 나면 정상적으로 늘어난다) |
| invariant | MEDIUM | archive-complete의 `degraded` fail-closed가 Acceptance에서 미검증 — "판정 불변"만으로는 fail-open 강등을 못 잡는다 | throw stub에서 `degraded:true` + `warnings` ≥1을 단언하는 Acceptance 항목 신설 |
| invariant | LOW | Task 0 재실행으로 before 앵커를 리셋할 수 있어 불변식이 침식된다 | 재실행은 의도된 복구 경로라 막지 않되, **재실행 사실과 사유를 보고서에 기록**하는 것을 Acceptance로. 막을 수 없는 것을 막은 척하지 않는다 |
| test | MEDIUM | 앵커 창(Task 0~9 사이 편집)은 사후 탐지뿐 | 이미 비보증으로 명시된 항목이며 위 재실행 기록 항목이 흔적을 남긴다 |

`architect`는 코드 인용 3건(`computeB1:353-357` · `decisionFromBasename:152-154` · `classifyMilestones`
버킷 등식)을 실파일로 대조하고 오라클 순수성·5필드 스키마·2층 분리·archive-complete seam·derive 등록
패턴을 확인한 뒤 pass했다. `security`는 `decision_id` path traversal · evidence 스키마 경계 · git 인자
분리(`--`) · receipt 위조(git-tracked 요구) · M5 override 경로를 공격하고 **end-to-end 공격 경로 없음**을
보고하며 pass했다(특히 "receipt가 존재하면 shipped" 판정이 override 경로와 정합함을 코드로 확인).

## L2 Review — R5 흡수 기록

5라운드는 **security·invariant PASS**, test FAIL, `architect`는 **세션 한도로 사망**(결함이 아니라
환경 실패 — 3/4 응답이라 quorum 3을 충족할 수 없었다). 차단 findings는 **1건**까지 줄었고,
그 1건이 낸 5개 지적은 전부 **R4에서 내가 도입한 `assertion-manifest-check.js`의 계약 미명세**였다.
5건 전부 수용, 기각 0건.

R4가 "Acceptance가 게이트가 아니다"를 manifest 배선으로 닫았는데, **그 manifest 자체가 같은 결함을
그대로 물려받았다** — 대조기의 CLI·스키마·필수 id 강제를 정하지 않았으므로 `echo ok && exit 0`짜리
대조기가 Validation을 통과시킨다. 지적이 정확하다.

| Severity | Finding | 흡수 |
|---|---|---|
| MEDIUM | 대조기가 "manifest에 있는 것"만 검사하면 **manifest에서 id를 빼는 것으로 우회**된다 | `REQUIRED_IDS` 17종을 **대조기에 하드코딩**. `missing-from-manifest`와 `absent-in-tests`를 **다른 실패**로 구분해 열거 |
| MEDIUM | manifest JSON 스키마가 미명세 | `m5-assertion-manifest.json` 미러로 `{milestone, contract, assertions[{id, assertion, test_file, test_title}]}` 명시 + 예시 |
| MEDIUM | **대조기 자신이 무력해도 아무도 모른다** | `assertion-manifest-check.test.js` 신설 — 필수 id 누락·`test_title` 미발견에서 각각 exit 1임을 단언. **이 test는 manifest에 넣지 않는다**(자기 참조 순환이 되고 대조기가 죽으면 그 사실도 못 잡는다) |
| LOW | `test_title` 문자열이 미지정이라 표현 차이로 매칭이 깨진다 | 제목을 `^B1-[A-Z-]+: ` 접두로 강제. **manifest의 `test_title`이 계약**이고 test가 그것을 따른다 |
| LOW | Acceptance의 "최소 3건"과 Validate의 `min(3, numerator)`가 어긋나 읽힌다 | Acceptance를 `min(3, drift_count)`로 통일. **drift 0이면 표본 0이 정상** — "항상 3건"으로 읽으면 건강한 상태에서 게이트가 막힌다 |

`security`는 10개 축(경로 traversal · evidence 스키마 주입 · 절대경로 유출 · git 인자 주입 ·
`receiptPresent` 신뢰 · cross-PRD 충돌 · verdict 해석 · 오라클 I/O 경계 · 감사 우회 · status 문자열
은닉)을 공격한 뒤 end-to-end 공격 경로 없음으로 pass. `invariant`는 앵커 경로·fail-open 게이트
4종·archive-complete 불변식·B1 전환 가능성을 추적한 뒤 pass.

## L2 Review — R6 흡수 기록

6라운드도 **architect·security PASS**(3연속), test·invariant FAIL. 7건(MEDIUM 6 · LOW 1) 중
**5건 기계 승격 · 2건 비보증 명시**. 기각 0건.

이번 라운드는 게이트 slug 정정 재진입에서 돌았고, 앞선 5라운드와 findings 성격이 다르다.
R1~R5는 *설계의 빈틈*을 짚었는데 R6은 **"본문에 규정은 있으나 Acceptance/Validate가 기계적으로
요구하지 않는다"** 한 계열로 수렴했다 — 즉 이 plan이 매니페스트로 닫겠다고 선언한 간극이
아직 남아 있던 자리들이다.

| 출처 | Severity | Finding | 처리 |
|---|---|---|---|
| test | MEDIUM | `evidence` 스키마가 *"정확히 5필드"* 인데 Validate는 **여분 키**만 요구하고 **누락**은 미요구 | **기계 승격** — 5필드 각각을 뺀 입력이 전부 `undetermined`+`evidence-schema-invalid`임을 단언. 누락을 놓치면 `undefined`가 `false`로 접혀 `receiptPresent` 부재가 `not-shipped` 판정으로 바뀐다(E1 위반) |
| test | MEDIUM | git 도달성 fallback(`origin/HEAD` → `origin/main` → `undetermined`)이 상세히 규정됐으나 필수 단언 목록에 없음 | **기계 승격** — `opts.gitQuery` 주입으로 3분기 단언 + **로컬 `HEAD` 미조회**를 호출 인자로 확인. 폴백하면 미머지 브랜치가 default branch로 오판돼 `not-shipped` 방향 drift가 통째로 증발한다 |
| test | MEDIUM | 매니페스트 17종을 채우려면 Acceptance와 Tasks를 교차 참조해야 하고 정본 매핑이 한 곳에 없음 | **기계 승격** — id 표를 3열(`id`·단언·`test_file`)로 확장해 **그 표가 manifest의 정본**임을 명시. 추론으로 채운 manifest는 검증 대상이 아니라 또 하나의 추측이다 |
| invariant | MEDIUM | `plan_file_hash`만 앵커라 **PRD 표 행 수**가 바뀌면 before/after `denominator`가 통약 불가(5→6)인데 통과 | **기계 승격** — 앵커에 `prd_milestone_rows` 추가 + Validation §3이 before/after 불일치를 throw. `plan_file_hash`와 달리 이것은 게이트다 |
| invariant | MEDIUM | `<details>` 개수 불변 단언이 **개수만** 보고 배치는 안 봄 — `<div>`+CSS나 숨긴 두 번째 top-level collapse로 우회 가능 | **기계 승격** — (iv)를 3분할: 개수 불변 · drift 줄이 기존 `msw-metrics-extra` 안 `<p class="muted">`라는 **위치 단언** · collapse 유사 위젯(`display:none`·`hidden`·`aria-expanded`·collapse 계열 class) 신규 0 |
| invariant | MEDIUM | Task 0 재실행 기록이 사람의 보고서 읽기에만 의존하고 before 스냅샷은 in-place 덮어쓰기라 원본 복구 불가 | **비보증 명시** — 재실행 앵커와 원래 앵커는 구별 불가능하다. 강제하려면 세대별 보존 기판이 필요한데 그것이 M6의 지표보다 커져 UI12에 정면으로 반한다. Acceptance 항목에 "게이트가 아니다"를 병기하고 비보증 절 2곳에 기록 |
| invariant | LOW | `tracked_receipt_count`가 앵커에 있으나 Validate가 읽지도 설명하지도 않음 | **비보증 명시** — 사이클 중 새 ship이 나면 정상적으로 늘어나므로 일치를 요구하면 정상 동작이 차단된다. Validation §3에 "의도적으로 대조하지 않는다"를 주석으로 남기고 비보증 절에 기록 |

**왜 2건은 승격하지 않았나.** 둘 다 "기계화 가능하지만 그 대가가 지표보다 큰" 축이다. R6이 짚은
나머지 5건은 단언 한 줄~한 블록으로 닫히는 반면, Task 0 재실행 탐지는 스냅샷 세대 보존 + 그 자체의
무결성 검사를 요구하고 `tracked_receipt_count` 대조는 **정상 동작을 오탐**한다. plan이 이미
`## 이 milestone이 주장하지 않는 것`과 비보증 절을 운영하고 있으므로, 막을 수 없거나 막으면 안 되는
것은 거기에 적는 것이 이 문서의 기조다 — 없는 보증을 믿게 하는 쪽이 더 나쁘다.

`architect`는 독립성 2층 구조(순수 오라클 / I/O source)·evidence 5필드 계약·`decisionFromBasename`
동치·사다리 패턴·`shipped`=receipt-존재 판정식·변조 test 양방향 설계·패턴 미러링·문서 status 미교정
11축을 대조한 뒤 pass했고, `security`는 R4·R5와 동일한 10축 공격 모델에서 end-to-end 경로 없음으로
pass했다(3연속).

## L2 Review — R7 흡수 기록

7라운드는 **architect PASS**(4연속), security·invariant FAIL, **test는 malformed**(구조화 출력 미호출,
coverage 3/4). 3건 전부 수용, 기각 0건. R6과 달리 findings가 **하나의 실결함**으로 수렴했다 —
`receiptPresent`의 증거 출처.

| 출처 | Severity | Finding | 흡수 |
|---|---|---|---|
| security | **CRITICAL** | `receiptPresent`를 `git ls-files --error-unmatch`로 판정하는 것은 **index(staging area)** 확인이라 `git add`만 하고 커밋하지 않은 파일도 통과한다. staged-only receipt는 worktree 삭제와 함께 사라지므로 §3.12가 규정한 *"worktree 삭제 후에도 대조가 성립"* 을 만족하지 못한다 | `git cat-file -e HEAD:<path>`(커밋 도달성)로 교체. `HEAD`를 쓰는 이유는 여기서 묻는 것이 *"증거가 내구적인가"* 이지 *"머지됐는가"* 가 아니기 때문 — plan 파일 도달성이 default-ref를 쓰는 것과 **질문이 다르다** |
| invariant | HIGH | Task 6이 `scan.js`의 증거 구성 방법을 규정하지 않아, 현행 `fs.existsSync`가 그대로 남아도 막히지 않는다 | 증거 구성 I/O를 `b1-evidence-builder.js` **단일 모듈**로 뽑고 source·`scan.js`가 둘 다 그것만 호출 |
| invariant | HIGH | 오라클은 스키마·타입만 보고 **출처를 볼 수 없다** — `fs.existsSync`와 `git cat-file`이 똑같이 boolean을 내므로 잘못된 출처가 조용히 통과한다 | 런타임 검증이 원리상 불가능하므로 **생산자 유일성**을 lint 축 (iv)로 정적 고정: `receiptPresent` 생성이 builder 밖 0건 + builder가 `fs.existsSync` 미사용. 음성 fixture 4번째 추가 |

**CRITICAL은 실측으로 확인하고 흡수했다.** 임시 repo에서 커밋된 파일과 staged-only 파일에
`git ls-files --error-unmatch`를 각각 걸었더니 **둘 다 exit 0**이었고, `git cat-file -e HEAD:<path>`는
전자만 통과하고 후자를 비영점으로 거부했다. 리뷰어의 주장이 문헌이 아니라 이 repo의 git 동작으로
성립한다는 것을 확인한 뒤에 판정식을 바꿨다.

**세 findings는 같은 구멍의 세 면이다.** 초안은 증거 출처를 *문장으로* 규정하고(Task 3), 그 규정이
닿지 않는 두 번째 소비처를 만들었으며(Task 6), 그 사이를 이을 유일한 후보인 오라클은 순수 함수라
출처를 볼 수 없다. 그래서 흡수도 세 면을 한꺼번에 닫는다 — 판정식을 고치고(security), 구성 지점을
하나로 만들고(invariant 1), 그 유일성을 정적으로 고정한다(invariant 2). Task 1이 오라클에서 I/O를
없애 "몰래 PRD를 읽는 구현"을 불가능하게 만든 것과 같은 수법이다: 규율 대신 **다른 경로가 존재하지
않게** 한다.

**`REQUIRED_IDS` 19 → 21** (`B1-RECEIPT-COMMITTED` · `B1-LINT-NEG-EVIDENCE-SOURCE`).
lint 음성 fixture 3축 → 4축. `Files to Change`에 `b1-evidence-builder.js` CREATE 추가.

**test 관점이 이번 라운드를 리뷰하지 못했다** — 에이전트가 구조화 출력을 호출하지 않아 결과가
`null`이었고 `coverage`가 3/4로 떨어졌다. quorum은 responded 3 · roles 3으로 계산됐으므로 판정 자체는
성립하지만, **R6에서 승격한 test 축 3건(스키마 양방향 · fallback 3분기 · manifest 정본 매핑)은 이번
라운드에 검증되지 않았다**. 다음 라운드에서 test가 정상 응답하면 그 축들이 처음으로 대조된다.

## L2 Review — R8 흡수 기록

8라운드는 **architect·security·invariant PASS (3/4)**, test 단독 FAIL. architect는 5연속,
security는 R7 CRITICAL 수정을 **직접 재검증한 뒤** pass로 돌아섰고("`git cat-file -e HEAD:` correctly
rejects staged-only files"), invariant도 R7 흡수(단일 builder + lint 축 iv)를 확인하고 pass로 돌아섰다.
findings 4건 중 **3건이 하나의 미해소 모순**이었고, 1건은 오독이었다.

| 출처 | Severity | Finding | 처리 |
|---|---|---|---|
| test | MEDIUM ×2 + (HIGH의 일부) | **`evidence` 스키마 표(Task 1)가 여전히 `git index에 존재(git ls-files로 확인)`** 라고 적고 있어 Task 3의 정정(`git cat-file -e HEAD:`)과 정면으로 어긋난다. 표가 보통 정본으로 읽히므로 구현자가 어느 쪽을 따를지 모호하다 | **수용 — 실결함, R7 흡수의 누락이다.** 스키마 표를 커밋 도달성으로 정정하고 *"index 등재(staged-only)만으로도 `false`"* 를 명시. 과거 흡수 기록 2건(R2·R3)에는 **supersession 마커**를 달았다 — 기록은 역사이므로 지우지 않고 무효화만 표시한다 |
| test | MEDIUM | staged-uncommitted stub test는 **출력만** 보므로 제3의 구현(하드코딩 목록 등)도 통과시킨다. 명령 자체는 검증되지 않는다 | **수용** — lint 축 (iv)에 양성/음성 명령 단언 추가: builder가 `cat-file`을 **쓰고** `fs.existsSync`·`ls-files`를 **쓰지 않음**. test는 출력을, lint는 수단을 본다 |
| test | **HIGH** | *"필수 21종이 어디에도 열거돼 있지 않아 완전성을 검증할 수 없다"* | **오독 — 표에 21종이 전부 있다.** 프로그램적으로 확인했다(표 블록에서 distinct id 추출 → 21). 다만 `·`로 묶은 칸(lint 4 · ladder 4) 탓에 **행 수가 21보다 적어 보이는** 것은 사실이고, 리뷰어가 그래서 오독했다면 고칠 곳은 표기다. `REQUIRED_IDS`로 그대로 옮길 수 있는 **평면 열거 블록**을 추가했다 |

**"오독이었다"로 끝내지 않은 이유.** 리뷰어가 틀렸다고 판정하고 넘어갈 수도 있었다 — 21종은 실제로
표에 있었다. 그러나 이 게이트의 독자는 리뷰어만이 아니라 구현자이고, 같은 표기가 같은 오독을
한 번 더 만들면 그때는 manifest가 잘못 채워진다. 대조기의 `REQUIRED_IDS`는 사람이 손으로 옮겨 적는
상수이므로, **세는 수고가 필요한 표기는 그 자체가 결함**이다. 반박은 기각하되 표기는 고쳤다.

**수렴 신호.** 통과 관점이 2 → 2 → **3**으로 늘었고(R6·R7·R8), 차단 findings는 7 → 3 → 4건이지만
R8의 4건 중 3건은 **같은 한 줄**(스키마 표)에서 나왔고 1건은 오독이다. 즉 실질 미해소 축은
R6 7개 → R7 1개(증거 출처) → R8 1개(그 흡수의 전파 누락)로 줄고 있다. R7이 만든 누락을 R8이
잡았다는 사실 자체가 패널이 회귀를 탐지하고 있다는 증거다.
