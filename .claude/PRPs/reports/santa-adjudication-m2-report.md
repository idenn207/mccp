# Implementation Report: santa-adjudication M2 — 판정 원장

## Summary

`ledger.entries`(P0가 만들어 두고 소비자가 0이던 배열)에 판정 행 스키마를 채우고, 그 원장을
**집계 단계에만** 주입했다. 세 축이 착지했다: 판정 행을 쓰는 유일한 writer(`adjudicate`),
종결된 issue를 **다음** 라운드의 blocking 계수에서 빼는 suppression, 미판정 blocking이 남은
채로는 다음 라운드가 열리지 않는 begin-round coverage 게이트. 여기에 M1이 이관한 판정
lifecycle 3종이 함께 붙었다.

리뷰어는 fresh를 유지한다 — 주입 지점은 `cli.js#cmdVerdict` 하나이고, 커버리지 47이
`santa-loop.md` Step 3 블록에 원장 토큰(`adjudicate`·`entries`·`suppressed`)이 **없음**을 절
경계 단위로 단언한다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 설계는 plan이 확정했고 구현은 그 이식이었다 |
| Files Changed | 10 (plan `Files to Change`) | 12 (아래 이탈 1건) |
| 커버리지 항목 | 26~60 (35개) | 35개 신규 · 총 60/60 green |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `adjudication.js` 신규 순수 모듈 | 완료 | export 6종. `foldFailure`가 `kind` 태그를 요구하도록 배치(아래 이탈 2) |
| 2 | `gate.js` — `issueIdOf` · `resolved` 축 | 완료 | 신규 export 5종. `decideVerdict` 무변경 |
| 3 | `cli.js` — `adjudicate` · verdict 배선 · 선검사 | 완료 | subcommand 1 + 기존 3에 선검사 |
| 4 | `santa-loop.md` — 판정 기록 단계 | 완료 | Step 3 거부 분기 · Step 4 출력 · Step 5 신설 |
| 5 | 회귀 test 26~60 | 완료 | 60/60 green |
| 6 | 문서 · 버전 · PRD | 완료 | ownership · ENVIRONMENT · 1.26.3 · CHANGELOG · PRD Open Question |
| 7 | 실 경로 1회 완주 | **미착수** | 아래 「미완료」 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| 단위 + CLI 회귀 | Pass | `santa-adjudication` 60/60 · `santa-gate` 10/10 · `santa-loop-cap` 48/48(skip 3) · `santa-seal` 13/13 · `santa-review-gate` 12/12 |
| 커버리지 계약 | Pass | `coverage 60/60 (bound derived from the plan table)` — 상한을 plan 표에서 파생, 각 항목 assert ≥1 |
| 동결 함수 + export | Pass | `decideVerdict` 반환 3필드 유지 · gate 6 + adjudication 6 export |
| 소유권 교집합 ∅ | Pass | `ledger.js`·`seal.js`·`counter.js` 무접촉 |
| §3.5.1 삭제 검증 | Pass | `--diff-filter=D` 0건 |
| version surface 동기 | Pass | `plugin.json`·html footer·markdown footer·CHANGELOG = 1.26.3, `i18n-surface` 10/10 |

### Design Grounding (v1.18.22)

N/A (no design trigger) — `impeccable-detect`가 `design_signal:false` · `silent_skip:true`
(`reason=no-signal`)를 냈다. M2는 CLI·JSON 표면만 만들고 렌더 표면을 만들지 않으므로
Phase 2.5.5c capture와 Phase 3.7 verify는 전부 no-op이다.

## Files Changed

| File | Action | 요지 |
|---|---|---|
| `plugins/mccp/scripts/lib/santa/adjudication.js` | CREATED | +330. 행 스키마 · fold · coverage · carryOver · env 파서 2종 |
| `plugins/mccp/scripts/lib/santa/gate.js` | UPDATED | `issueIdOf`·`widthNormalized`·`lastBefore`·`DISPOSITIONS`·`SUPPRESSING` export, 병합 행 `issueId`, `resolved` 축 |
| `plugins/mccp/scripts/lib/santa/cli.js` | UPDATED | `adjudicate` · coverage 선검사 · 단일 스냅샷 verdict · record lifecycle |
| `plugins/mccp/commands/santa-loop.md` | UPDATED | Step 3/4/5 |
| `plugins/mccp/scripts/lib/tests/santa-adjudication.test.js` | UPDATED | 26~60 신규 + 항목 18 키 집합 확장 |
| `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` | UPDATED | **이탈 1** — 아래 |
| `docs/santa-loop/ownership.md` · `docs/ENVIRONMENT.md` | UPDATED | 추가 기록 · env 2종 등재 |
| `plugin.json` · `CHANGELOG.md` · `renderer/{html,markdown}.js` | UPDATED | 1.26.2 → 1.26.3 (4면 동기) |
| `.claude/prds/santa-adjudication.prd.md` | UPDATED | DD15 P2 접속 계약 Open Question 신설 |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | security-reviewer MEDIUM/LOW 2건 |
| `.claude/notes/santa-adjudication-m2-implement-gate.md` | CREATED | Implement-Codex 게이트 기록 |

## Deviations from Plan

**1. `santa-loop-cap.test.js`를 편집했다 (plan `Files to Change` 밖).**
plan Task 3의 Validate가 그 스위트를 green으로 요구하는데, M2가 명세한 동작 변경이 그 파일의
세 단언을 **필연적으로** 거짓으로 만든다: (a) `verdict` stdout 키 집합 deepEqual — M2가 5필드를
더한다(Task 3 (2)), (b) `record --id A` 두 번이 성공한다는 단언 — 그 주석 자체가 "id 중복 거부는
milestone 2 소유"라고 적고 있다(DD14), (c) santa 디렉토리 파일 목록 — `adjudication.js`가 늘었다.
추가로 의존 allowlist에 `./adjudication`·`crypto` 두 줄을 더했는데, 그 test의 주석이
"들어와야 한다면 여기 한 줄이 그 승인 기록"이라고 명시한 절차 그대로다. 세 단언 모두 **강화
방향으로** 갱신했다(파일 목록·receipt-free 목록에 신규 모듈을 함께 넣었다).
`plan-conflict-detector` 판정은 `conflict:false`.

**2. `foldEntries`의 `kind` 검사 위치.** plan Task 1은 "`kind` 부재 행은 스키마 검증에 넘긴다 →
미달이면 malformed"라 적고 커버리지 31은 "`kind` 부재 행은 `malformed`가 된다"고 적는다. 둘이
동시에 참이려면 스키마가 태그를 **요구**해야 하므로, `foldFailure`가 `kind === 'adjudication'`을
검사한다(`buildEntry`의 입력 검사에는 넣지 않는다 — 그 함수는 태그를 스스로 붙인다).

**3. `lastBefore`를 export했다.** plan Task 2는 "gate.js 모듈 지역 헬퍼 — export하지 않는다"고
적었으나, 그 문장의 근거로 든 것은 **순환 회피**(adjudication에 두면 gate ← adjudication)뿐이다.
`adjudication.carryOverOf`가 같은 선택 규칙("종결된 issue"의 정의)을 필요로 하므로, export하지
않으면 규칙을 베껴야 하고 그것은 plan Task 1이 `validateReason`에 대해 금지한 바로 그 형태다
(원본이 바뀌면 두 사본이 갈리고 어떤 test도 잡지 않는다). 순환은 여전히 없다(adjudication → gate
단방향). 커버리지 59는 그대로 `decideAdjudicatedVerdict` 경유로 잰다.

**4. `decideAdjudicatedVerdict`가 `module.exports.analyzeReviewers`를 호출한다.** 커버리지 60 (b)가
요구하는 `issueId` 유실 runtime 가드는 정상 경로에서 도달 불가다(생산 지점이 그 필드를 **항상**
채운다). 직접 호출로 두면 그 가드는 **반증 불가능한 방어 코드**가 되므로, M1 항목 21이
`cli.js → gate.decideVerdict`를 모듈 객체 경유로 spy한 것과 같은 seam을 한 줄 만들고 코드에
근거를 적었다.

**5. Step 3 거부 분기에서 escalation 출력을 exit 12 가지 안으로 옮겼다.** exit 2 분기를 더하면서
"어느 분기가 ESCALATION을 찍는가"를 정해야 했는데, 기존 배치는 exit 75(일시적 lock 경합)에도
"round cap reached"를 찍어 운영자에게 거짓 진단을 준다. `exit "$BEGIN_EXIT"`가 블록의 마지막
문장이라는 load-bearing 성질은 보존했다.

## Issues Encountered

**게이트 진입 자체가 막혀 있었다** — `mccp-plan-codex/santa-adjudication-m2` receipt 부재.
조사 결과 게이트는 실제로 돌았고(multi-agent 패널 `converged`, quorum 3/3, `reviewed_plan_hash`가
현재 plan과 일치) slug만 어긋나 있었다: 이전 세션이 `/mccp:plan`을 **PRD 경로**로 호출해
`santa-adjudication`에 봉인됐고, `/mccp:prp-implement <plan>`은 **plan 경로**로
`santa-adjudication-m2`를 파생한다. 사용자 승인 후 `.claude/state/plan-review/proof.json`(봉인된
실제 증거)을 `plan.md` Phase 5.6b와 **동일한 write 경로**로 `-m2` slug에 재기록했다. 결과 receipt는
원본과 `decision_id`·`receipt_hash`·`created_at` 3개 필드만 다르다. 상세는
`.claude/notes/santa-adjudication-m2-implement-gate.md`.

**M1 항목 18의 키 집합 단언**이 M2의 stdout 추가로 red가 됐다. 항목 18은 그 자체가
"교체가 아니라 추가"를 재는 단언이므로 M2의 5필드를 목록에 넣어 갱신했다(plan Task 5의
"M1 1~25 무변경"에 대한 유일한 예외이고, 값 축 하위 호환은 커버리지 33이 따로 진다).

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `santa-adjudication.test.js` | 35 신규 (26~60) | 파서 2 · 행 스키마 4 · fold 3 · suppression 6 · coverage 2 · CLI 배선 10 · 문서 1 · receipt 1 · 관측 3 · runtime 가드 3 |

## 미완료 — Task 7 (실 경로 1회 완주)

Acceptance (A)·(B)가 이 Task에 달려 있고 **아직 돌리지 않았다**. 두 부분 모두 실제
`/mccp:santa-loop` 실행이 필요하다(합성 리뷰어 JSON 금지 — 종자는 리뷰 *대상*에 두고 리뷰어
출력은 실물을 쓴다).

- **(A)** 이 저장소에서 santa-loop 1회 완주 → `begin-round` coverage 선검사 통과 · `verdict`
  stdout에 M2 키 · seal receipt `meta.santa_entries` = 원장 `entries` 길이
- **(B)** 별도 워크트리 scratch 브랜치에서 DD13 라운드 결속을 **되돌린** 종자 결함을 실제
  리뷰어에게 보이고(`--decision santa-adjudication-m2-probe`), 거부 → 판정 → 재개 → 억제를 관측

메커니즘 자체는 fixture repo를 지나는 커버리지 41~46·49·55가 이미 덮고, 실제 CLI 왕복 스모크도
통과했다(coverage 거부 시 캡 미소모 · DD13 자기-suppression 차단 · 다음 라운드 억제 → NICE ·
FINAL 재계산 바이트 불변). 남은 것은 **"실경로에서도 관측됐다"는 사실 하나**이고, plan과
Acceptance가 같은 문장으로 "(B)가 체크되지 않으면 milestone은 `complete`가 아니며 PRD
Milestone 2 행을 `complete`로 바꾸지 않는다"고 못박았다 — 그래서 PRD는 `in-progress`로 둔다.

## Next Steps

- [ ] Task 7 (A)·(B) — `/mccp:santa-loop` 실 경로 완주 + probe
- [ ] `/mccp:prp-commit` → `/mccp:pr`
- [ ] PRD Milestone 2 행은 Task 7 (B) 관측 이후에만 `complete`로 전환
