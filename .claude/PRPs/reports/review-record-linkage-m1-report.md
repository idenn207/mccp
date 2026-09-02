# Implementation Report: review-record-linkage M1 — linkage-baseline-parser

**Plan**: [.claude/plans/review-record-linkage-m1.plan.md](../../plans/review-record-linkage-m1.plan.md)
**PRD**: [.claude/prds/review-record-linkage.prd.md](../../prds/review-record-linkage.prd.md)
**Branch**: `review-record-linkage` · **Version**: `1.34.2` (§3.7 patch — origin/main 이 1.33.7 과 1.34.1 을 연속 발행해 두 번 재상향)

## Summary

세 판정 기준 — "라운드 구조 보유" · "리뷰 대상 ship" · "층간 링크" — 을 파서 코드로
고정하고, 그 정의로 C1 이전 코퍼스를 동결 보고한다. 쓰기 0건 · read-only · LLM-free ·
게이트 배선 무접촉(기계 확인).

M1은 값을 개선하지 않는다. 무엇을 세는지 고정하고 오늘 값을 반증 가능하게 남긴다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files created | 5 (2 lib + 3 test) + 1 doc | 동일 |
| Files updated | 4 (version 4면) + PRD | 동일 |
| 게이트 배선 diff | 공집합 | **공집합 (확인)** |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `linkage-defs.js` 순수 정의 | 완료 | `require` 0건 · `isPanelRecord` 미export |
| 2 | `linkage-audit.js` 수집·집계·ladder | 완료 | `corpus.parseRecord` 소비(재구현 0줄) |
| 3 | 술어 회귀 test | 완료 | 14 pass — 긍정 픽스처 + ReDoS 벽시계 상한 포함 |
| 4 | 집계 회귀 test | 완료 | 22 pass — `archive/` 포함 픽스처 + santa-loop 회귀 4건 |
| 5 | 동결 문서 + 바이트 일치 test | 완료 | 4 pass — 도구를 실제 spawn해 비교 |
| 6 | 게이트 무접촉 · PRD 행 · version 4면 | 완료 | `i18n-surface` 10 pass |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| 계약 (dep-free · 복제 금지) | Pass | `require` 0 · `isPanelRecord`/`PANEL_SIGNATURE_RE` 미export · `parseRecord` 소비 확인 |
| 신규 test | Pass | linkage-defs 14 · linkage-audit **24** · frozen-baseline 4 (PR-Codex R1 흡수 후 재측정) |
| 인접 회귀 | Pass | plan-review-corpus 33 · evidence-audit 22 |
| version 4면 | Pass | i18n-surface 10 |
| 라이브 완주 | Pass | 아래 Acceptance 참조 |
| Design Grounding | N/A | 2.5.5b `design_signal=false` (rendered surface 0) → capture 미발생 → Phase 3.7 no-op |

## Acceptance — 라이브 완주 산출물

`node plugins/mccp/scripts/lib/linkage-audit.js --frozen-only` 실제 실행 결과:

| # | 요구 | 실측 |
|---|---|---|
| 1 | `unreadable_at_baseline` = 0, `baseline.state` = ok | **0 / ok** |
| 2 | 동결 블록 ↔ 라이브 출력 바이트 일치, `post_baseline` 부재 | **일치 · 부재** (test가 spawn해 검증) |
| 3 | `round_structure.selected` = 0, controls 5개 동봉 | **0/42** · A=0 B=4 C=21 D=23 E=32 (분모 55) |
| 4 | `ship_eligibility` 전건 `undecidable` + 사유 | **75 undecidable**, 사유 1종 |
| 5 | `linkage` 양방향 각 0, 산문 `receipt_hash`가 계상되지 않음 | **0/0/0**, 오탐 가드 test 통과 |
| 6 | 해소 불가 ref → exit 3 (`unresolved`), ok 아님 | **exit 3** 확인 |
| 7 | 게이트 파일 diff 0 (corpus.js 포함) | **0** |

**건수 정정 기록 (santa-loop R0 이후 재작성)**: plan 초안은 "패널 레코드 47건"이라
적었고, 이 보고서의 초판은 그것을 `archive/` 포함 51건 → 경계 이후 1건 제외 → **50**
으로 정정했다. 그 계산 전체가 은퇴했다 — 셋 다 *작업 트리를 날짜로 가른* 수치였고,
santa-loop 라운드 0 이 그 파티션 자체를 결함으로 판정했다. 멤버십이 경계 트리로
바뀐 뒤의 실측은 **ship 75 · 레코드 55 · D1 분모 42** 이고, 이 값들은 `git ls-tree`
실측과 직접 대조된다. acceptance 를 리터럴 대신 등식으로 바꾼 판단은 유효했고,
바뀐 것은 등식이 평가되는 코퍼스다.

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/plan-review/linkage-defs.js` | CREATED | +211 |
| `plugins/mccp/scripts/lib/linkage-audit.js` | CREATED | +578 |
| `plugins/mccp/scripts/lib/tests/linkage-defs.test.js` | CREATED | +232 |
| `plugins/mccp/scripts/lib/tests/linkage-audit.test.js` | CREATED | +370 |
| `plugins/mccp/scripts/lib/tests/linkage-frozen-baseline.test.js` | CREATED | +101 |
| `docs/review-record-linkage/frozen-baseline.md` | CREATED | +248 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | version |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | page-foot version |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | derived 줄 version |
| `CHANGELOG.md` | UPDATED | 새 항목 + `currently` 노트 |
| `.claude/prds/review-record-linkage.prd.md` | UPDATED | M1 in-progress · **M2 dropped** · Evidence 정정 |

## Deviations from Plan

1. **`--frozen-only`의 `undated` 범위 축소 (Codex F2 흡수, 계획 대비 설계 변경)**.
   계획은 전역 `undated` 건수·파일명을 동결 블록에 실으라 했으나, 그것은 경계에
   속하지 않는 전역 수치라 경계 밖 파일 하나로 동결 바이트가 바뀐다. `baseline
   tree` 범위로 좁힌 `undated_at_baseline`으로 교체하고 state를 둘로 분리했다.
   test가 그 불변성을 직접 단언한다.
2. **`--frozen-only`의 종료 코드를 `baseline.state`로 변경**. 내용 바이트에서 제거한
   결합을 종료 코드로 되돌리지 않기 위함 — 계획에 없던 한 줄이지만 DD7의 같은 논리다.
3. **Validation 1번 grep이 부정확**. 계획은
   `grep -c "isPanelRecord|Plan Review Panel" linkage-defs.js` 가 0이어야 한다고
   적었으나, 그 파일은 **부재 이유를 주석으로 설명**하므로 3건이 걸린다. 의도는
   "재구현 금지"이고 정본은 Task 3이 명시한 **export 부재 단언**이다(그 test는
   통과). 산문 쪽 grep 라인이 계획에 남아 있다 — plan은 receipt에 봉인돼 수정하지
   않았다.

### 4. plan의 동결 설계가 통째로 대체됐다 (santa-loop R0)

**plan은 `plan_hash`로 봉인돼 있어 고칠 수 없다. 그래서 무엇이 대체됐는지가 여기
남는다** — 이 절이 없으면 다음 마일스톤이 plan을 읽고 은퇴한 설계를 구현한다.

santa-loop 라운드 0에서 두 리뷰어가 독립적으로, plan의 DD5(날짜 원천 3행 표) ·
DD7(`undated_at_baseline`) 위에 선 "살아 있는 작업 트리를 자기신고 타임스탬프로
pre/post 파티션" 설계가 **자기 주장을 만족하지 못함**을 실측으로 보였다. 경계
커밋이 이 브랜치의 조상이 아니라 트리가 달랐고(`647dfec`의 트리는 ship 75건,
도구는 71건을 셌다), 그 차이가 어느 카운터에도 없이 `state: "ok"`로 보고됐다.

| plan이 지시한 것 | 실제 shipped |
|---|---|
| DD5 날짜 원천 3행 (`meta.created_at` · `measurement.recorded_at` · `git log --diff-filter=A --follow`) | **전부 삭제.** 날짜가 아무것도 결정하지 않는다 |
| DD7 동결 필드 `undated_at_baseline` | `unreadable_at_baseline` (트리에 있는데 읽거나 파싱하지 못한 것) |
| `DEFAULT_BASELINE_REF = '647dfec'` (축약) | 전체 40-hex SHA |
| "ship receipt 71건 전부가 이 시각보다 앞선다, 기계 확인" | **거짓이었다.** 그 ref의 트리는 75건이다 |
| Task 4의 `undated` test 4건 · origin/main 도달성 단언 | `undated` 개념 부재로 미작성. 도달성은 **HEAD 기준**으로 작성(아래 5번) |
| Acceptance 1 (`undated_at_baseline` 읽기) · 4 (`71건 전건`) | 필드명·분모가 바뀌어 그대로는 평가 불가 |

**plan의 `## User Intent` UI9("MVP는 M1과 M2")도 현재 PRD와 어긋난다.** PRD가 M2를
`dropped`로 판정하고 MVP를 M1 단독으로 좁혔기 때문이다(상류 `env-contract-integrity
M3`가 M2의 outcome을 이미 출시). UI9는 봉인 당시 사용자 진술로 정확했고, 바뀐 것은
그 뒤의 상류 사실이다 — 그러나 plan만 읽는 사람은 M2를 살아 있는 것으로 보므로 이
줄이 그 오독을 막는다.

### 5. 경계 ref 도달성 · ref 주입 · 레코드 결손 (santa-loop R1)

- **도달성**: 초판은 도달성을 `origin/main` 기준으로 확인했으나, 동결 바이트를
  커밋하는 것은 **이 브랜치**다. 단독 클론에서 경계 객체가 없어 도구가 exit 3으로
  죽었다. origin/main을 머지해 `647dfec`를 HEAD의 조상으로 만들었고, test가 이제
  **HEAD 기준** 도달성을 단언한다.
- **ref 주입**: `--baseline-ref '--output=<file>'`가 git 옵션으로 파싱돼 실제로
  파일을 만들었다 — "쓰기 0건"이 표제인 도구에서. ref 형태 검증 + 전 호출부
  `--end-of-options` 두 겹으로 막고 회귀 test를 걸었다.
- **레코드 결손**: `## Measurement` JSON이 깨진 패널 레코드가 분모에서 조용히
  빠지면서 `unreadable_at_baseline`은 `files: []`를 유지했다 — "부재 ≠ 0"을 담당하는
  필드가 잃어버린 코퍼스에 대해 결손 0을 인증한 것이다. 이제 그 레코드가 이름으로
  실리고 `baseline.state`가 사유와 함께 `degraded`가 된다.

## Issues Encountered

1. **`linkage-defs.js:168`의 공백 문자가 NUL 바이트로 기록됨**(파일이 binary로
   탐지). 경로 형태 검사의 공백 거부가 발화하지 않았고 test가 그것을 잡았다. 의도한
   공백 검사보다 나은 형태 규칙(`/[\s\u0000-\u001f]/` — 공백 + 제어문자 전체)으로
   교체했고, 세 파일 전체를 제어문자 스캔해 다른 손상이 없음을 확인했다.
2. **test 픽스처의 비결정성**. `git log --format=%cI`는 초 해상도인데 픽스처의 두
   커밋이 같은 초에 만들어져 `add_commit < baseline` 비교가 거짓이 됐다(2건 red).
   `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE`로 커밋 시각을 명시 고정해 해소했다 —
   구현 결함이 아니라 픽스처 결함이었다.
3. **상류 plan receipt가 `stale`**. `/mccp:prp-implement` 2.5.4가 plan 본문에
   `## Codex Implementation Review` 주입을 지시하므로 plan 게이트의 `plan_hash`가
   반드시 어긋난다. 아카이브된 shipped plan 전부가 같은 주입 섹션을 갖고 있어
   **모든 사이클이 거친 구조적 상태**임을 확인했고, implement receipt는 현재 body에
   정확히 결속돼 있다. plan 게이트 4라운드는 캡(3) 소진으로 불가능하다 — PR 진입 시
   문서화된 우회가 필요하다.

## Gate Record

| Gate | Verdict | 비고 |
|---|---|---|
| plan L1 | converged | violations 0 |
| plan L2 (패널 3라운드) | **divergent** | §3.15 단일통과 `deferred_to_prd_completion`로 종결. verdict는 divergent 그대로 봉인 → cross-gate dedupe 미개방 |
| Implement-Codex R1 | **divergent** (needs-attention) | HIGH 2 + MEDIUM 1 **전건 ACCEPT_NOW 흡수** |
| security-reviewer | **CRITICAL/HIGH 0** | MEDIUM 3 흡수 · LOW 1 이연 |
| impeccable (implement) | silent-skip | `design_signal=false` (rendered surface 0) |
| **PR-Codex R1** | **divergent** (needs-attention) | HIGH 2 + MEDIUM 1. HIGH 1건(F1) **흡수**(아래 6번), 나머지 2건은 사용자 소유 범위·버전 결정이라 이연 |
| PR security-reviewer | **CRITICAL/HIGH 0** | git 호출 5곳 전수 가드 확인 · ReDoS 벽시계 상한 실측 · DD6 절대경로 0건. MEDIUM 1 이연 |
| PR impeccable (critique A+B) | **CRITICAL/HIGH 0** | rendered surface 변경이 version 문자열 2줄뿐. detector 48건 전부 `advisory`·전부 선재 |

흡수한 HIGH 총 13건(plan L2 10 + Implement-Codex 2 + PR-Codex 1), backlog 이연 31건.

### 6. PR-Codex R1 F1 흡수 — 지표 2의 분모 (UI2)

`linkage-audit.js`가 `classifyShipEligibility`로 자격을 판정해 놓고 링크 분모로는
`pre.ships.length`(75)를 썼다. 같은 실행이 75건 전건을 `undecidable`로 판정하므로
동결 산출물이 `undecidable: 75`와 `denominator: 75`를 나란히 실었고, 그것은 UI2의
후반부("그 판별을 M1이 파서로 정의한다")를 위반한다. 실제 대가는 숫자 오류가 아니라
**`0/75`를 유효 링크율로 읽을 수밖에 없는 표면**이었다.

| 축 | 이전 | 이후 |
|---|---|---|
| 분자 모집단 | 전체 ship | **자격(`eligible`) 집합** |
| 분모 | `pre.ships.length` | 자격 집합 크기, 비면 **`null`** |
| 신규 필드 | — | `linkage.scope` · `linkage.coverage{eligible, not_eligible, undecidable, rate_computable, note}` |
| human render | `… / 75` | `RATE NOT COMPUTABLE, no ship is decidably review-eligible (75 undecidable)` |

`0`(리뷰 대상이 없다는 **판정**)과 `null`(판별 수단이 없다는 **관측**)의 구분은 D2가
`undecidable`을 0으로 접지 않는 것과 같은 형태다(DD2).

**이 분모는 어느 test도 고정하지 않고 있었다** — 실측으로 `linkage-audit.test.js`의
`denominator` 단언 0건을 확인했다. 즉 초판 동작은 회귀 보호 없이 통과 중이었다. 회귀
test 2건을 양방향으로 추가했다: 자격 0건이면 `denominator===null` ∧ `≠ships` ∧ human
표면이 비율 미인쇄, 자격 2건이면 `denominator===2` ∧ `<ships` ∧ 분자가 그 위에서만
계상. 동결 블록과 D3 산문·그 정합 test도 함께 갱신했다(byte test는 재생성으로 통과).

검증: 116 pass / 0 fail (linkage-audit **24** · linkage-defs 14 · frozen-baseline 4 ·
plan-review-corpus 계열 42 · evidence-audit 22 · i18n-surface 10).

## Next Steps

- [x] `origin/main` 머지 후 §3.7 version 재계산 — 두 번 상향해 **1.34.2**에 착지(origin/main은 1.34.1). 4면 동기 완료, `i18n-surface` 10/10
- [x] PR-Codex R1 F1(UI2 분모) 흡수 — 위 6번
- [x] **UI12 판정 (사용자, 2026-09-02) — 1.34.2 유지, 적용은 이연.** 발동 조건은 충족됐다(C0 = `release-channel-separation` M1이 PR #170으로 착지). 그러나 C0 M1 **이후의** CLAUDE.md §3.7이 feature 브랜치 bump를 "dogfood 빌드 번호"로 여전히 정상 기술하며 4면 동기를 요구하고, 우산 PRD 결정 1의 강제 기구와 "CHANGELOG를 릴리스 컷까지 미확정으로 누적하는 형태"는 C0 M2·M3(pending) 소관이라 **철회의 착지점이 정의되지 않았다**. 지금 철회하면 CHANGELOG가 미정의 상태로 떨어진다. UI12는 **폐기가 아니라 이연**이며, C0 M2·M3이 착지점을 정의한 뒤 적용한다
- [x] **UI9 판정 (사용자, 2026-09-02) — M2 dropped 유지 + 검증 산출물.** 저자 판단을 acceptance 대조로 대체했다: [review-record-linkage-m2-upstream-verification.md](review-record-linkage-m2-upstream-verification.md). A~D 네 명제 전부 충족이고 결정적 증거는 이 PRD 자신의 plan 게이트가 봉인한 `resolution.rounds: 3`(= `round_ledger_count: 3`)이다. UI9는 **폐기가 아니라 충족**으로 읽는다
- [ ] `/mccp:pr` 재실행 — plan-receipt staleness는 여전히 구조적이므로 문서화된 우회 + 사유 필요
- [ ] M3 `bidirectional-link` 착수 시: `classifyLink`는 **경로 안전성 게이트가 아니다** —
      `path.resolve` containment check를 반드시 별도로 더할 것 (security S3)
- [ ] M2는 **dropped** — 상류 선점 확인됨. MVP는 M1 단독
