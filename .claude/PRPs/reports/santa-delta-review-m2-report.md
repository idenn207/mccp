# Implementation Report: santa 델타 리뷰 M2 — 탐지율 보존 검증

- **Plan**: `.claude/plans/santa-delta-review-m2.plan.md` (`plan_hash` = `sha256:60931158…`, 미편집)
- **Branch**: `santa-delta-review`
- **Decision slug**: `santa-delta-review` (plan basename 축이 아니라 PRD/브랜치 축)
- **Version**: `1.30.2 → 1.30.3` (patch)
- **Status**: 부분 배송 — Layer 1 착지, **Layer 2 미실행**

## Summary

M1은 스코프를 좁혔고 *얼마나 줄었는가*를 쟀다. M2는 그 축소가 *결함을 놓치게 하는가*를
재려 했고, **두 층 중 한 층만 배송했다.**

- **Layer 1 (결정적 containment)** — 착지. 계층화 합성 corpus를 실제 git fixture에 심고
  실제 CLI를 `off`·`enforce` 두 모드로 지나는 회귀 21건이 CI에 상주한다.
- **Layer 2 (라이브 리뷰어 비교)** — **미실행.** 세션 운영 지시가 명시 요청 없는
  서브에이전트 발화를 금지해 리뷰어 레인이 구조적으로 발화 불가였다.

그 결과 `MCCP_SANTA_DELTA_SCOPE`의 default는 `off`로 남는다. 이는 판단이 아니라
**사전 등록 규칙의 기계적 적용**이며, 그 적용이 산문이 아니라 코드로 강제된다.

## 적용된 판정 (DD3)

규칙 원문(plan DD3 · `detection-corpus.js#DECISION_RULE`에 축자 동결):

> corpus 전체(4계층 합산)에서 델타의 Layer 2 발견 수가 full 대비 단 1건이라도 적으면 default를 뒤집지 않는다. 같거나 크면 뒤집는다.

**적용**: 규칙의 전건은 "델타의 **Layer 2** 발견 수가 full과 같거나 크다"이다. Layer 2가
실행되지 않았으므로 그 비교는 거짓이 아니라 **미상**이고, 미상은 flip 근거가 아니다.
`decideDefaultFlip({layer2: null})` → `{flip: false, reason: 'layer2-absent'}`.
따라서 `DELTA_SCOPE_DEFAULT`는 `'off'`로 유지된다.

**규칙은 결과에 맞춰 수정되지 않았다.** 위 인용은 plan 본문 DD3의 문장과 축자 일치하며,
그 일치는 `santa-detection-coverage.test.js`의 `DD3 — 규칙 문장은 plan 본문과 축자
일치하고 상수로 동결된다`가 단언한다.

## 계층별 측정치 (Layer 1)

fixture: 합성 corpus, 결함 4건(계층당 1건). fix 커밋이 `src/parser.js:16-17`을 바꿔
`patchRangesFrom`이 `[16,17]`을 내고 `CONTEXT_LINES`(20) 확장 뒤 `[1,37]`이 된다.
스코프 축소 실측 `before=3 → after=1`.

| id | 계층 | full (`off`) | delta (`enforce`) | containment |
|---|---|---|---|---|
| D1 | `A_IN_FIX` | `path-unrestricted` | `in-range` | 유지 |
| D2 | `B_SAME_FILE_OUT_OF_RANGE` | `path-unrestricted` | `path-kept-out-of-range` | 유지 |
| D3 | `C_DROPPED_PATH` | `path-unrestricted` | `path-dropped` | **손실** |
| D4 | `D_ALWAYS_SCOPE` | `path-unrestricted` | `path-unrestricted` | 유지 |

계층 합산 `full=4 · delta=3 · lost=1` · `unmatched=0` · `unknown=0`.

**읽는 법**: 이것은 탐지율이 아니라 containment다. 인증되는 명제는 "리뷰어에게 보일
기회가 있다"이지 "리뷰어가 찾는다"가 아니다(DD2). 그래서 `inScope`(경로 포함)와
`inRange`(범위 안)를 별도 필드로 뒀다 — 둘을 접으면 Layer 1이 자기가 인증할 수 없는
명제를 단언하게 된다.

**두 가지가 확인됐다.**

1. **손실은 Class C 하나로 국소화된다.** 산술이다 — fix가 건드리지 않은 파일은
   `paths = diffPaths ∩ keys(ranges)`에서 제거된다. plan DD3이 미리 예측한 결과다.
2. **Class B는 containment가 보존된다.** 이것이 M2의 미지수였다(plan DD3: "그렇다면 왜
   재는가 — Class B가 미지수이기 때문이다"). 경로가 남으므로 "범위는 절단이 아니라
   포인터"라는 M1의 설계 근거가 그 계층에서 성립한다.

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 계층화 corpus + 순수 oracle | 완료 | `detection-corpus.js` — 4계층 닫힌 enum · anchor 역산 좌표 · 미던지는 판정 3종 |
| 2 | Layer 1 결정적 containment 회귀 | 완료 | 신규 test 21건. 사전 등록 기대치 전건 성립 |
| 3 | Layer 2 라이브 리뷰어 비교 | **미실행** | 세션 제약. 사유·대안 검토·귀결을 노트 3장에 기록 |
| 4 | 사전 등록 규칙 적용 + default 판정 | 완료 | `off` 유지 + `decideDefaultFlip`이 그 판정을 기계화 |
| 5 | 문서 4면 + PRD 갱신 | 완료 | DD7 미래 시제 2자리 교체. registry/ENVIRONMENT는 무변경(아래 D2) |
| 6 | version 4면 동기 | 완료 | patch로 정정 + §3.7 충돌 해소(아래 D1) |
| 7 | report | 완료 | 이 문서 |

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 14 | 12 계획분 + 6 계획 외(전부 아래에 사유 기재) |
| 신규 test | 미명시 | 21건 |
| default flip | "가장 가능성 높은 결론은 default off 유지" | off 유지 (예측 적중, 단 사유가 다르다 — Class C가 아니라 Layer 2 부재) |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| 신규 축 | 통과 | `santa-detection-coverage.test.js` 21/21 |
| 델타 축 회귀 | 통과 | 6개 suite 231건 (아래 "환경 주의" 참조) |
| env 계약 | 통과 | `env-contract/lint.js` L1~L9 전부 ok |
| instruction 계약 | 통과 | C1~C4 pass, `rows=29 resident=17` |
| version 4면 | 통과 | `i18n-surface.test.js` 10/10 |
| 전체 스위트 | 통과 | 아래 표 |

### 환경 주의 — baseline red의 정체

이 저장소 환경 그대로 전체 스위트를 돌리면 **2482건 중 53 fail**이다. 그러나
`MCCP_REVIEW_SINGLE_PASS`(이 저장소 `settings.json`이 `deadline_pressure`로 켜 둔 값)만
지우면 대부분 통과한다 — `santa-loop-cap.test.js` 단독 실측 **29 fail → 1 fail**.

원인은 코드 결함이 아니라 상호작용이다: `begin-round`는 단일통과 구간에서 라운드를 열지
않으므로(review-loop-bypass M1 DD5) 원장을 실제로 여는 test는 `withoutSinglePass` 격리가
필요한데, 일부 test만 그것을 갖는다. **상시 red는 새 red를 묻는다** — 이번 사이클에서도
신규 회귀를 구별하려고 clean baseline을 따로 받아야 했다. HIGH로 backlog 등재.

M2 신규 test는 `withoutSinglePass`를 쓰므로 이 축의 영향을 받지 않는다.

plan이 "전체"로 지정한 스코프는 `plugins/mccp/scripts/lib/tests/*.test.js`다.

| 실행 | tests | pass | fail | skipped |
|---|---|---|---|---|
| baseline — 저장소 환경 그대로 (착수 전) | 2482 | 2415 | **53** | 14 |
| baseline — `MCCP_REVIEW_SINGLE_PASS` 제거 (착수 전, `santa-loop-cap` 단독) | 56 | 52 | **1** | — |
| M2 변경 후 — 격리 실행 | 2503 | 2488 | **1** | 14 |
| 그 1건(모듈 열거 배선) 수정 후 — 해당 3 suite | 92 | 89 | **0** | 3 |

**신규 test 기여는 정확히 21건**(2503 − 2482)이고, M2가 만든 신규 red는 **1건**이었다 —
`santa/` 모듈 열거 단언에 신규 모듈을 등재하지 않은 배선 누락이며, 그 test가 스스로
문서화한 확장 규약대로 한 줄 추가해 해소했다(D3). 그 외 신규 red 0건.

착수 전 53건은 전부 위의 환경 상호작용이고 M2와 무관하다. 그 사실을 확인한 절차 자체가
이 사이클의 비용이었다 — 상시 red를 걷어내지 않으면 "신규 red 1건"을 말할 수 없다.

## Deviations from Plan

### D1 — version이 minor가 아니라 patch이고, §3.7 충돌을 해소했다

plan Task 6은 "PRD 전 milestone 완료이므로 minor"라고 적었다. **그 전제가 성립하지
않는다** — Layer 2 미실행이라 PRD의 M2 행이 `complete`가 아니다. §3.7의 판단
휴리스틱("이 변경이 PRD의 마지막 milestone인가?" → NO면 patch, "애매하면 patch가 보수적
default")대로 patch를 취했다.

동시에 §3.7 병렬 브랜치 충돌이 **실측 5회째로 재발**했다. 진입 시점 재계산에서
`origin/main`이 이미 `1.30.1`을 **다른 축**(codex-intent-context M2, `9c6c836`)에 발행한
것이 확인됐다. 발행된 번호는 불가침이므로 이 브랜치의 미머지 항목을 각각 한 칸씩 밀었다:

- M1: `1.30.1 → 1.30.2` (CHANGELOG 헤딩 + 본문 + M1 report/notes의 대상 버전)
- M2: `1.30.3` (신규 항목)

4면(`plugin.json` · `html.js` page-foot · `markdown.js` derived 줄 · CHANGELOG `currently`
노트)을 `1.30.3`으로 맞췄고 `i18n-surface.test.js`가 재검증했다. M1 커밋
메시지(`feat(v1.30.1)`)는 이미 기록된 history라 그대로 뒀다 — 정본은 CHANGELOG와
manifest다. **`/mccp:pr` 진입 직전에 한 번 더 재계산해야 한다**(§3.7 두 번째 시점).

### D2 — `registry.js`와 `docs/ENVIRONMENT.md`를 바꾸지 않았다

plan Files to Change에 둘 다 있으나 **default가 바뀌지 않았으므로 동기할 것이 없다.**
registry의 default는 `off` 그대로이고 한 줄 서술("default가 형제와 반대 — off")도 여전히
정확하다. `env-contract/lint.js`가 코드 default ↔ registry ↔ 색인 정합을 검사하며
L1~L9 전부 통과한다. 계획된 파일을 **바꾸지 않은** 것이지 범위를 넘은 것이 아니다.

### D3 — M1 test 2건을 갱신했다 (계획 외, 그러나 plan이 요구한 결과)

- `santa-delta-command-body.test.js` — M1이 `does **not** claim detection is preserved`를
  본문에 고정해 뒀는데, **DD7이 정확히 그 문장을 교체하라고 지시한다.** 그 짝인 "M2 owns
  that measurement and flips the default if it holds"까지 함께 두면 본문이 이미 지나간
  미래를 가리킨다. 단언을 M2 판정으로 옮겼다 — **완화가 아니라 이동이다**: 새 단언은
  본문이 (1) default를 `off`로 두었다고 명시하고 (2) 잰 것이 *도달 범위이지 발견이
  아님*을 명시해야 통과하므로, "탐지율이 보존됐다"는 문장은 여전히 통과하지 못한다.
- `santa-loop-cap.test.js` — `santa/` 모듈 열거 단언에 `detection-corpus.js`를 추가.
  이것은 그 test가 **문서화한 확장 규약**이다("새 모듈은 여기 한 줄로 승인되고, 동시에
  아래 receipt-free 목록에도 들어간다"). 신규 모듈은 receipt-free 쪽에도 넣었다 — M2는
  측정 결과를 receipt에 전혀 봉인하지 않는다(DD6).

### D4 — 게이트 산출물이 plan 본문이 아니라 notes에 있다

plan 본문은 `mccp-plan-codex`가 `sha256:60931158…`로 봉인했으므로 편집하면 stale이 되어
`/mccp:pr`이 §3.11 guard 2에 막힌다. `## Codex Implementation Review`는
`.claude/notes/santa-delta-review-m2-implement-codex.md`에 뒀다 — M1 · santa-evidence-diversity
M1/M2 · santa-adjudication M1~M3 선례.

### D5 — 게이트 진입 slug 불일치를 override로 해소했다

hook이 plan basename 축으로 `santa-delta-review-m2`를 파생해 "`mccp-plan-codex` receipt
없음"을 보고했으나, `mccp-plan-codex/santa-delta-review.json`의 `reviewed_plan_hash`가 M2
plan 해시와 **정확히 일치**한다. 게이트 누락이 아니라 슬러그 축 불일치이므로 receipt를
위조하지 않고 `--decision santa-delta-review` 명시 override(precedence 1위)로 해소했다.
`validate --command mccp:prp-implement --decision santa-delta-review --plan <M2 plan>` →
`ok:true`. M1과 같은 처리.

### D6 — 계획 외 파일 편집 6건

| 파일 | 사유 |
|---|---|
| `.claude/plans/codex-findings-backlog.md` | Phase 2.5.4가 `DEFER_TO_BACKLOG` 적재를 의무화 (4건 등재) |
| `.claude/notes/santa-delta-review-m2-implement-codex.md` | D4 |
| `plugins/mccp/scripts/lib/tests/santa-delta-command-body.test.js` | D3 |
| `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` | D3 |
| `.claude/PRPs/reports/santa-delta-review-m1-report.md` | D1 version 상향 |
| `.claude/notes/santa-delta-review-m1.md` | D1 version 상향 |

`plan-conflict-detector`는 명령 본문이 넘기는 두 점 diff(`origin/main..HEAD`)로는
`conflict:true · 74 unplanned`를 내지만 그 목록은 이 브랜치가 건드린 적 없는 main 쪽
파일이 대부분이다(발산한 브랜치에서 두 점 diff가 main의 추가를 변경으로 센다). 같은
검출기에 **이 사이클의 실제 변경 집합**을 넘기면 `conflict:false`다. 호출부 결함으로
backlog 등재.

## Files Changed

| File | Action | 비고 |
|---|---|---|
| `plugins/mccp/scripts/lib/santa/detection-corpus.js` | CREATED | 순수 oracle + corpus 데이터 |
| `plugins/mccp/scripts/lib/tests/santa-detection-coverage.test.js` | CREATED | Layer 1 회귀 21건 |
| `.claude/notes/santa-delta-review-m2.md` | CREATED | 실측 기록 + 한계 |
| `.claude/notes/santa-delta-review-m2-implement-codex.md` | CREATED | 게이트 산출물 |
| `.claude/PRPs/reports/santa-delta-review-m2-report.md` | CREATED | 이 문서 |
| `plugins/mccp/scripts/lib/santa/scope-delta.js` | UPDATED | default 근거 주석(판정 유지, 동작 무변경) |
| `docs/environment/review.md` | UPDATED | DD7 문언 정정 + M2 판정·실측 |
| `plugins/mccp/commands/santa-loop.md` | UPDATED | DD7 문언 정정 (Notes 6항목) |
| `.claude/prds/santa-delta-review.prd.md` | UPDATED | M2 `in-progress` + OQ 해소 1 · 신규 1 |
| `CHANGELOG.md` | UPDATED | `[1.30.3]` 신규 + `[1.30.1]→[1.30.2]` 상향 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | `1.30.3` |
| `plugins/mccp/scripts/lib/renderer/{html,markdown}.js` | UPDATED | footer version 동기 |
| (계획 외 6건) | UPDATED | D6 표 참조 |

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `santa-detection-coverage.test.js` | 21 | 순수 oracle 7 · DD3 규칙/flip 판정 6 · Layer 1 containment 6 · UI1 금지 축 2 |

**단언 삭제 0건.** 기존 단언 2건은 삭제가 아니라 이동·확장이다(D3).

## 이 milestone이 주장하지 않는 것

- **탐지율 보존을 검증했다고 주장하지 않는다.** 배송된 Layer 1이 인증하는 명제는
  containment("리뷰어에게 보일 기회가 있다")이고 detection("리뷰어가 찾는다")이 아니다.
- **fixture는 합성 N=1이고 계층당 결함 1건이다.** 계층별 수치는 비율이 아니라 개수이며
  1/1을 100%로 읽으면 안 된다. 실측 fixture는 여전히 없다(원장 rejected 0건).
- **Class B의 containment 보존이 "리뷰어가 범위 밖을 본다"를 뜻하지 않는다.** 그것이
  Layer 2의 핵심 질문이고 미실행이다.
- **`CONTEXT_LINES`(20)의 타당성은 재지 않았다.** Class B 결함을 hunk에서 45줄 떨어뜨려
  심었으므로 경계 근처(21~25줄) 거동은 표본에 없다.
- **default가 `off`인 한 이 축은 여전히 dark ship 위험을 갖는다.** M1의 계측 2종이 그것을
  관측 가능하게 만들 뿐 발화를 보장하지 않는다.

## Next Steps

- [ ] `/mccp:prp-commit`
- [ ] `/mccp:pr` — **진입 직전 §3.7 version 재계산 필수**(D1의 충돌이 재발할 수 있다)
- [ ] Layer 2 완주 — 서브에이전트 발화가 허용된 세션에서 Task 3을 돌리고
      `LAYER2_EVIDENCE` 상수를 실측치로 교체 (PRD Open Question)
- [ ] backlog 4건 triage
