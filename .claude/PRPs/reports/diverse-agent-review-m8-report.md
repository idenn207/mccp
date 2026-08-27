# Implementation Report: diverse-agent-review M8 — 패널 quorum 캘리브레이션 재검토

**Plan**: `.claude/plans/diverse-agent-review-m8.plan.md`
**PRD**: `.claude/prds/diverse-agent-review.prd.md` (milestone #8)
**Branch**: `diverse-agent-review-m8` · **Version**: `1.32.6 → 1.32.9` (patch)
**Date**: 2026-08-26

## Summary

#8은 배선 milestone이 아니라 판정 milestone이었다. 산출은 세 가지다 — 코퍼스 집계
오라클([corpus.js](../../../plugins/mccp/scripts/lib/plan-review/corpus.js)), 그 출력을 축자
동결하고 판정 4개를 적은 문서([quorum-calibration.md](../../../docs/diverse-agent-review/quorum-calibration.md)),
그리고 그 판정을 반영한 PRD 갱신.

**결론: `3of4`와 K는 튜닝할 손잡이가 아니었다.** 기본값을 하나도 바꾸지 않았고 그것이
결론이다. 게이트 배선 diff는 공집합이다(UI6).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 9 | 9 |
| 코퍼스 규모 | 35건 | 35건 (패널 레코드 48건 중 측정 가능 35건) |
| converged | 5건 | 5건 |
| M/K binding | 0건 | 0건 (모수 27건) |
| **F6 단독 차단 레코드** | **0건 (DN7 예비 실측)** | **1건 — 판정 정정 (UI10)** |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 코퍼스 집계 오라클 + standalone CLI | 완료 | 6축 전부. 설계 2건이 실행 중 변경됨 — 아래 Deviations |
| 2 | 회귀 test | 완료 | 30 test (plan 요구 7 케이스 + 코퍼스 경계·pass_path·k_split·read error·임계 부재) |
| 3 | 실측 동결 + 판정 문서 | 완료 | `--json` 출력 축자 인용, 바이트 동일성 기계 확인 |
| 4 | PRD 갱신 | 완료 | #8 complete · #11 신설 · Evidence · Success Metrics · Open Questions 3항 |
| 5 | milestone 보고서 | 완료 | 이 문서 |
| 6 | version bump 4면 동기 | 완료 | target을 §3.7대로 **재계산**: 잠정 1.32.9 → 실측 후에도 1.32.9 |

## 판정 4개 (전부 도구 출력에 앵커)

### 1. 승인 경로는 존재한다

`pass_path.count = 5` · `hash_bound = 5` · `single_pass_tainted = 0`. 5건 전부
`reviewed_plan_hash` 봉인이 있고 단일통과 토글 흔적이 없으며 quorum이 실제로 만족돼
통과했다(UI9 충족). wall-clock: `499,741` · `779,328` · `357,124` · `363,402` ·
`382,180` ms — 중앙값 6.4분, 5건 중 4건이 10분 이내.

**5/35를 승인 확률로 부르지 않는다** — O3 생존 편향의 방향이 불분명하고 커버리지가
48건 중 35건이라 하한이다(DN8 · UI7 · UI8).

### 2. M과 K는 승인 임계가 아니었다

차단 30건 중 quorum이 실제 평가된 **27건**에 대해 `m_binding = 0` · `k_binding = 0` ·
`findings_binding = 27`. 나머지 3건은 quorum 도달 전 halt(L1 2건 · budget 1건)라 모수에서
제외했다 — 분모에 넣으면 무력성 주장이 공짜로 강해진다.

**자연 실험이 같은 방향을 독립적으로 가리킨다**: `794c4de`(2026-08-20T16:36:03Z)로 갈린
K=3 구간 25건 중 converged 4건, K=1 구간 10건 중 1건. **손잡이를 실제로 돌렸는데 지표가
반응하지 않았다.**

### 3. 실제 승인 규칙은 severity 게이트다

27건 전부가 `findings_binding`. 관점별 통과율은 고르지 않다(invariant 10/33,
security 22/33)나 **임계 과잉으로 읽지 않는다** — 실패 리뷰어 64건 중 52건이 실물
CRITICAL/HIGH를 동반했다. 기본값 무변경(DN6 · UI4).

### 4. F6 기여도는 1건 — 예비 실측 정정

`fail_reviewer_instances = 64` · `solo_fail_reviewer_instances = 12` ·
`records_flipped_if_f6_removed = **1**`. 해당 레코드는
`archive/plan-review-followup-R12.md`(3/3 응답·3 roles로 M·K 만족, 두 실패 리뷰어의
finding이 전부 MEDIUM). **M8은 CLAUDE.md §3.14를 해제하지 않는다** — 근거만 제공하며,
그 근거는 "0이라 안전하다"가 아니라 "1이고 그 1건을 지목할 수 있다"이다.

## Validation Results

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | `corpus.js --json` 완주 | Pass | `state=ok` `records=35` exit 0 |
| 2 | `plan-review-corpus.test.js` | Pass | 30/30 |
| 3 | `plan-review-*.test.js` 전체 (UI6) | Pass | 323 test — 322 pass · 0 fail · 1 skip |
| 4 | `i18n-surface.test.js` (4면 동기) | Pass | 10/10 |
| 5 | 이 plan 자신에 대한 L1 | **divergent (예상됨)** | 아래 참조 |
| 6 | 삭제 파일 0건 (§3.5.1) | Pass | 빈 출력 |
| 7 | 게이트 배선 diff 공집합 (UI6) | Pass | 빈 출력 — **범위 확대 적용**, 아래 참조 |

### Validation 5 — L1 divergent는 예상된 post-EXECUTE 결과다

```
C3_CREATE_EXISTS: plugins/mccp/scripts/lib/plan-review/corpus.js (line 130)
C3_CREATE_EXISTS: plugins/mccp/scripts/lib/tests/plan-review-corpus.test.js (line 131)
```

L1은 **구현 이전** 검사이고 CREATE 대상이 방금 생성됐으므로 이 코드가 나오는 것이 정상이다.
코퍼스 자신이 같은 선례를 보존한다 —
`.claude/reviews/plan-review-diverse-agent-review-m4-postimpl-l1.md`가 M4의 동일한
post-implementation L1 기록이다. 결함이 아니다.

### Validation 7 — plan이 열거한 7개에서 12개로 확대했다

plan L2 패널의 invariant/HIGH(`583ffbeb`)가 "Validation #7의 파일 목록이 결정에 영향 주는
파일을 누락한다(budget.js · l3.js)"를 지적했다. **흡수해 범위를 넓혔다** — plan 본문은
receipt에 hash 봉인돼 있어 수정할 수 없으므로(§3.16) 여기 기록한다. 실제 검사 대상은
`origin/main`에 존재하는 `plan-review/` **전 9파일**(`backlog-append.js` ·
`budget.js` · `cli.js` · `decide.js` · `l1-check.js` · `l3.js` · `perspectives.js` ·
`quorum.js` · `record.js`) + `workflows/plan-review.js` + `commands/plan.md` +
`receipt/schema.js` = 12개다.

지적이 명시하지 않은 `perspectives.js`(패널 역할 정의 = K의 실체)와
`backlog-append.js`(M2 완화의 전제조건)도 같은 원리로 포함했다. 출력은 빈 집합이다.

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/scripts/lib/plan-review/corpus.js` | CREATE | 집계 오라클 + standalone CLI |
| `plugins/mccp/scripts/lib/tests/plan-review-corpus.test.js` | CREATE | 30 test |
| `docs/diverse-agent-review/quorum-calibration.md` | CREATE | 판정 문서 (축자 동결) |
| `.claude/prds/diverse-agent-review.prd.md` | UPDATE | #8 complete · #11 신설 |
| `.claude/PRPs/reports/diverse-agent-review-m8-report.md` | CREATE | 이 문서 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.32.6 → 1.32.9` |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version |
| `CHANGELOG.md` | UPDATE | `[1.32.9]` heading + `currently` 노트 |
| `.claude/notes/diverse-agent-review-m8.md` | CREATE | 게이트 산출물 (plan 봉인으로 인한 우회) |

## Deviations from Plan

### D1 — 코퍼스 경계를 3분류로 나눴다 (plan Task 1 미명시)

plan은 `blind`/`degraded`/`ok` 사다리만 규정했다. 실행해 보니 `.claude/reviews/`에는 다른
생산자의 문서 28건(PR · santa-loop · local · security 리뷰)과 M4 이전 패널 레코드 13건이
섞여 있어, 전부 parse failure로 세면 `state`가 **영구히 `degraded`**가 됐다(초판 실측:
`parse_failures=41`).

그래서 판별자를 파일명이 아니라 `record.js:317`이 언제나 쓰는 첫 줄 서명
`# Plan Review Panel — `으로 두고 셋으로 나눴다: `out_of_corpus`(28) ·
`pre_measurement`(13, 이름 전건 출력) · `parse_failures`(0, 이것만 degraded). 근거는
편의가 아니라 **신호 보존**이다 — 항상 켜진 degraded는 진짜 손상을 가린다. 대신
`coverage.counts_are_lower_bound`가 하한성을 매 출력에 싣는다.

### D2 — F6 소스를 Findings 합성 행에서 Refutation 표로 바꿨다 (결함 수정)

초판은 plan Task 1이 적은 대로 `## Findings`의 합성 `FAIL` 행을 셌고 **전 코퍼스에서 0**을
보고했다. `record.js#findingRows`가 finding 0건일 때만 그 행을 쓰기 때문에, MEDIUM만 낸
실패 리뷰어(= F6이 실제로 짊어진 사례)가 구조적으로 관측되지 않았다.

정본 소스는 모든 리뷰어의 verdict가 실리는 `## Refutation attempted` 표다. 수정 후
`solo_fail_reviewer_instances`가 0 → 12, `records_flipped_if_f6_removed`가 0 → 1이 됐고,
회귀 test `F6 is read from the Refutation table, not from synthetic FAIL rows in Findings`가
이를 고정한다. **DN7의 예비 판정을 UI10대로 갱신한 근거가 이것이다.**

### D3 — `quorum_evaluated_blocked` 축을 추가했다

plan은 `binding_axis`에 M/K/findings 3축만 규정했다. quorum에 도달하기 전 halt한 3건을
차단 30건의 분모에 넣으면 "M·K binding 0건"이 실제보다 강하게 읽히므로, 모수를 별도 축으로
분리해 27건임을 명시했다.

### D4 — 게이트 산출물을 plan이 아니라 `.claude/notes/`에 적었다

명령 본문 Phase 2.5.4는 `## Codex Implementation Review`를 plan 본문에 주입하라고 지시하나,
plan은 `mccp-plan-codex` receipt에 `plan_hash`로 봉인돼 있고 구조 해시는 새 섹션을 정규화하지
않는다(체크박스·PR placeholder·status 토큰만 정규화). 주입하면 이 사이클의 receipt가 즉시
stale이 되어 `/mccp:pr` guard 2가 자기 PR을 막는다. M4 선례(`.claude/notes/impeccable-detection-contract-m4.md`)대로
notes 경로에 적었다.

### D5 — plan-codex receipt slug 정합 (게이트 진입 조건)

`/mccp:plan`이 PRD 경로로 진입해 receipt를 `diverse-agent-review`로 봉인했고
`/mccp:prp-implement`는 `diverse-agent-review-m8`을 도출해 chain이 끊겼다. 두 slug의
`plan_hash`·`subject_hash`가 동일해 **리뷰는 이 plan 본문 그대로에 대해 실제로 수행됐음**이
확인됐다. 파일명 변경(§3.16 위조 금지 · §3.12 no-rehash) 대신 `MCCP_SKIP_INTENT_GATE`
audited override로 **동일 verdict를 축자 미러**했다(`divergent` · `multi-agent` · 원본 proof ·
single-pass 플래그 동반). verdict가 `divergent`로 남으므로 cross-gate dedupe는 열리지 않고
terminal `/mccp:pr`에서 PR-Codex가 발화한다. 상세는
[notes](../../notes/diverse-agent-review-m8.md).

## Issues Encountered

- **plan L2 패널 미흡수 HIGH 3건** — `MCCP_REVIEW_SINGLE_PASS=deadline_pressure`가 backlog로
  기계 적재했고, 세 건 모두 구현에서 흡수했다(§3.14). `286471ae`(ad-hoc 실측 재현 불가) →
  도구가 6축 전부 재도출 + 출력 축자 동결. `22e3dcb0`(실코퍼스 주장 반증 불가) → test는
  파서·분류만 고정하고 실코퍼스 반증은 동결 출력이 담당함을 문서에 명시. `583ffbeb`
  (Validation #7 누락) → 위 Validation 7 참조.
- **Codex 미발화** — `MCCP_CODEX_DISABLED=1` 운영자 정책. `codex-policy seal` 후
  `classification=disabled` · `CODEX_VERDICT=skipped` · round cap 1로 pin
  (`pinnedBy=codex-disabled`).
- **impeccable silent-skip** — `design_signal=false`(렌더 표면 없음). 3-axis trigger 전부
  미발화이므로 critique loop · stage routing · design-grounding 모두 미진입.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/lib/tests/plan-review-corpus.test.js` | 30 | 파서 3표 · 이스케이프 역변환 순서 · blind 규칙(비율 키 부재) · binding 3축 독립 + 교차검증 conflict · unknown 미접힘 · F6 refutation 소스 · 코퍼스 경계 3분류 · pass_path UI9 · k_split unresolved · read error · 임계값 부재 |

## 부수 관측 (plan Task 5 요구)

1. **`MCCP_GATE_ROUND_CAP` drift (선재)** — `.claude/settings.json`은 `"3"`인데
   CLAUDE.md §3.16은 "이미 1로 설정"이라 적는다. 이번 범위 밖이라 backlog 1줄로 이연한다.
   (실효는 없었다 — 이번 사이클은 `MCCP_CODEX_DISABLED`가 cap을 1로 pin했다.)
2. **O3 실물 사례** — `.claude/reviews/plan-review-santa-adjudication.md`의 `plan_path`가
   `.claude/plans/santa-adjudication-m2.plan.md`를 가리킨다. 레코드 slug가 PRD 경로 파생이라
   후속 milestone의 실행이 이전 레코드를 덮어쓴 것이며, 35건이 하한인 이유가 이것이다(#9 소관).
3. **승인 경계에 가장 가까웠던 레코드** — `plan-review-santa-adjudication.md`가 3/3 응답 ·
   3 distinct roles로 통과했다. 기록 시각(2026-08-17)이 K=1 도입(2026-08-20) 이전이라 당시
   rolesMin은 3이었고, K가 하나만 더 높았다면 binding이 됐을 유일한 사례다. 그래도 실제로는
   binding이 아니었다.

## Acceptance 대조 (문구 조정 없이)

- [x] All tasks complete — 6/6
- [x] Validation passes — 7축 전부 (V5는 예상된 post-EXECUTE divergent, 위 참조)
- [x] Patterns mirrored, not reinvented — `evidence-audit.js` state 사다리 ·
      `quorum.js` 인자 주입 순수 오라클 · `plan-review-quorum.test.js` 러너·명명
- [x] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 — `quorum-calibration.md` 안의
      `corpus.js --json` 축자 인용, `state=ok`(≠`blind`) · `records=35`(≥30).
      **손으로 옮겨 적지 않았음을 기계 확인**: 임베드 블록이 라이브 출력과 바이트 동일
- [x] 판정 4개가 전부 도구 출력에 앵커 — 각 판정이 `pass_path` · `binding_axis` +
      `k_split` · `perspectives` + `severity_histogram` · `f6` 필드를 직접 인용
- [x] PRD Success Metrics 통과 경로 행이 **범위 정정임을 그 칸 안에서 밝히고** 갱신됨 —
      "이 갱신의 근거는 새 데이터 수집이 아니라 집계 범위 정정이다(DN9)" + 이전 판정이
      옳았던 범위 보존
- [x] 게이트 배선 diff 공집합 — plan의 7개가 아니라 **12개**로 확대 검사(위 Validation 7)
- [x] 삭제 파일 0건 (§3.5.1)
- [x] 기본 quorum 값과 severity 게이트를 바꾸지 않았음을 diff로 확인 — `quorum.js` 무변경
- [x] version 4면 동기 + `i18n-surface.test.js` green — `1.32.9`, 10/10

## Next Steps

- [ ] `/mccp:prp-commit` → `/mccp:pr` (진입 직전 §3.7 version 재계산 의무 — sibling이
      `1.32.7`·`1.32.8`·`1.33.0`을 보유 중이라 다시 밀릴 수 있다)
- [ ] PRD 다음 milestone: #11(승인 품질 감사) → #5(오라클 추출) → #9
