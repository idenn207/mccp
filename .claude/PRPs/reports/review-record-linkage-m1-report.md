# Implementation Report: review-record-linkage M1 — linkage-baseline-parser

**Plan**: [.claude/plans/review-record-linkage-m1.plan.md](../../plans/review-record-linkage-m1.plan.md)
**PRD**: [.claude/prds/review-record-linkage.prd.md](../../prds/review-record-linkage.prd.md)
**Branch**: `review-record-linkage` · **Version**: `1.33.7` (§3.7 patch)

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
| 4 | 집계 회귀 test | 완료 | 17 pass — `archive/` 포함 픽스처 |
| 5 | 동결 문서 + 바이트 일치 test | 완료 | 4 pass — 도구를 실제 spawn해 비교 |
| 6 | 게이트 무접촉 · PRD 행 · version 4면 | 완료 | `i18n-surface` 10 pass |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| 계약 (dep-free · 복제 금지) | Pass | `require` 0 · `isPanelRecord`/`PANEL_SIGNATURE_RE` 미export · `parseRecord` 소비 확인 |
| 신규 test | Pass | linkage-defs 14 · linkage-audit 17 · frozen-baseline 4 |
| 인접 회귀 | Pass | plan-review-corpus 33 · evidence-audit 22 |
| version 4면 | Pass | i18n-surface 10 |
| 라이브 완주 | Pass | 아래 Acceptance 참조 |
| Design Grounding | N/A | 2.5.5b `design_signal=false` (rendered surface 0) → capture 미발생 → Phase 3.7 no-op |

## Acceptance — 라이브 완주 산출물

`node plugins/mccp/scripts/lib/linkage-audit.js --frozen-only` 실제 실행 결과:

| # | 요구 | 실측 |
|---|---|---|
| 1 | `undated_at_baseline` = 0, `baseline.state` = ok | **0 / ok** |
| 2 | 동결 블록 ↔ 라이브 출력 바이트 일치, `post_baseline` 부재 | **일치 · 부재** (test가 spawn해 검증) |
| 3 | `round_structure.selected` = 0, controls 5개 동봉 | **0/37** · A=0 B=4 C=20 D=22 E=28 (분모 50) |
| 4 | `ship_eligibility` 전건 `undecidable` + 사유 | **71 undecidable**, 사유 1종 |
| 5 | `linkage` 양방향 각 0, 산문 `receipt_hash`가 계상되지 않음 | **0/0/0**, 오탐 가드 test 통과 |
| 6 | 해소 불가 ref → exit 3 (`unresolved`), ok 아님 | **exit 3** 확인 |
| 7 | 게이트 파일 diff 0 (corpus.js 포함) | **0** |

**건수 정정 기록**: plan 초안은 "패널 레코드 47건"이라 적었으나 수집 범위가
`archive/`를 포함하므로 실제는 51건이고, 이 사이클 자신의 리뷰 레코드 1건이
경계 이후로 가 `pre_baseline`은 **50**이다. 리뷰어가 이 모순을 잡아 acceptance를
리터럴 대신 등식으로 바꿨고, 라이브 완주가 그 등식을 만족했다.

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/plan-review/linkage-defs.js` | CREATED | +211 |
| `plugins/mccp/scripts/lib/linkage-audit.js` | CREATED | +538 |
| `plugins/mccp/scripts/lib/tests/linkage-defs.test.js` | CREATED | +232 |
| `plugins/mccp/scripts/lib/tests/linkage-audit.test.js` | CREATED | +329 |
| `plugins/mccp/scripts/lib/tests/linkage-frozen-baseline.test.js` | CREATED | +101 |
| `docs/review-record-linkage/frozen-baseline.md` | CREATED | +211 |
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

흡수한 HIGH 총 12건(plan L2 10 + Codex 2), backlog 이연 24건.

## Next Steps

- [ ] `origin/main` 머지 후 §3.7 version 재계산 (현재 1.33.7 선언, origin/main은 1.33.6)
- [ ] `/mccp:pr` — plan-receipt staleness에 대한 문서화된 우회 + 사유 필요
- [ ] M3 `bidirectional-link` 착수 시: `classifyLink`는 **경로 안전성 게이트가 아니다** —
      `path.resolve` containment check를 반드시 별도로 더할 것 (security S3)
- [ ] M2는 **dropped** — 상류 선점 확인됨. MVP는 M1 단독
