# Implementation Report: santa 델타 리뷰 M3 — 사이클 잔여 마감

**Plan**: `.claude/plans/santa-delta-review-m3.plan.md` (`plan_hash` `sha256:74e77fbd…`)
**Branch**: `santa-delta-review` · **Version**: `1.32.5`
**Date**: 2026-08-25

## Summary

M1·M2가 배송되는 동안 이 사이클이 **관측했지만 닫지 않은 것들**을 마감했다 — backlog 65행 전건 처리,
fix-task 2건 방출, 부수 결함 5축 수정, origin/main 머지와 version 충돌 해소.

**M3는 탐지율을 재지 않았고 `MCCP_SANTA_DELTA_SCOPE`의 default를 건드리지 않았다.** 델타 스코프 로직
(`scope-delta.js` · `scope-always.js` · `lanes.js`)은 **무접촉**이며 그 사실을 acceptance가 빈 `git diff`로 단언한다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 21 (`Files to Change`) | 19 planned + 1 계획 밖(`env-contract/registry.js`) |
| Version | `1.30.5` 예상 | **`1.32.5`** — DD8이 예고한 대로 전제가 무너졌다 |
| Tasks | 8 | 8 (+2 부수 커밋) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 백로그 파서가 행을 조용히 버리지 않게 한다 | 완료 | 181 → 453행 · `invalid_count` 실제 계수 · finding 꼬리 보존(계획 밖 1축, 아래 Deviations) |
| 2 | `compareCoverage`가 미측정을 무손실로 읽히지 않게 한다 | 완료 | `measured` + `degradedReason` 추가 · 양측 unknown 계수 · `unindexable` |
| 3 | 게이트 정책 env가 스위트를 상시 red로 만들지 않게 한다 | 완료 | 대상 파일이 1개가 아니라 **3개**였다(아래 Deviations) |
| 4 | hook-trace 루트를 git toplevel에 앵커 | 완료 | 판정 단일화 + fail-open + repo-relative 표면 |
| 5 | plan-conflict 가드가 처음으로 참을 말하게 한다 | 완료 | 백틱 + 두 점 diff 2자리 · **plan의 판정 명령 결함 발견**(아래) |
| 6 | version 충돌 forward-only 해소 + 4면 동기 | 완료 | 머지 커밋이 곧 이 task의 커밋이다 |
| 7 | backlog 전건 처리 | 완료 | 65행: 흡수 4 · 이연 61 · 미처리 0 (기계 판정) |
| 8 | fix-task 방출 · PRD · report 마감 | 완료 | 이 문서 + PRD M3 `complete` + Layer 2 OQ 유지 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Task 1 | 통과 | `backlog-source.test.js` 8/8 신규 |
| Task 2 | 통과 | `santa-detection-coverage.test.js` 26/26 (기존 21 + 신규 5) |
| Task 3 | 통과 | 세 파일 × env 두 조합 = **동일 결과**, fail 0 |
| Task 4 | 통과 | `hook-trace-root-anchor.test.js` 3/3 + 기존 hook-trace 소비처 38/38 |
| Task 5 | 통과 | `plan-conflict-detector.test.js` 13/13 (기존 10 + 신규 3) |
| Task 6 | 통과 | `i18n-surface.test.js` 10/10 · CHANGELOG 헤딩 중복 0(신규분) |
| Task 7 | 통과 | 대장 대조 `node -e` exit 0 |
| 델타 축 회귀 | 통과 | 4 suite 154/154 |
| env-contract lint | 통과 | L1~**L10** 전부 (L10은 머지가 가져온 신규 검사) |
| instruction-contract lint | 통과 | C1~C4 |
| derive suite | 통과 | 135/135 |
| hooks suite | **289/290** | 1건은 **main 승계** — 아래 Issues |

### Design Grounding (v1.18.22)

**N/A (no design trigger).** `impeccable-detect.js`가 `design_signal=false`(reason=`no-signal`)를 냈고
Phase 2.5.5c 캡처가 일어나지 않아 Phase 3.7은 완전 no-op이다. 이것 자체가 이연된 backlog 항목의
재현이다 — `Files to Change`에 `renderer/html.js`·`markdown.js`(둘 다 `DESIGN_SURFACE_PATHS` 원소)가
있는데도 detector가 EXECUTE **이전** diff를 보므로 자기 계획에 구조적으로 눈감는다.

## Files Changed

| File | Action |
|---|---|
| `plugins/mccp/scripts/derive/sources/backlog.js` | UPDATE |
| `plugins/mccp/scripts/derive/tests/backlog-source.test.js` | CREATE |
| `plugins/mccp/scripts/lib/santa/detection-corpus.js` | UPDATE |
| `plugins/mccp/scripts/lib/tests/santa-detection-coverage.test.js` | UPDATE |
| `plugins/mccp/scripts/lib/tests/helpers/gate-env.js` | CREATE |
| `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` | UPDATE |
| `plugins/mccp/scripts/lib/tests/santa-adjudication.test.js` | UPDATE (계획 밖 — Deviations) |
| `plugins/mccp/scripts/lib/tests/santa-lanes.test.js` | UPDATE (계획 밖 — Deviations) |
| `plugins/mccp/scripts/lib/hook-trace.js` | UPDATE |
| `plugins/mccp/scripts/hooks/post-tool-use-failure.js` | UPDATE |
| `plugins/mccp/scripts/hooks/session-end-trace.js` | UPDATE |
| `plugins/mccp/scripts/hooks/tests/hook-trace-root-anchor.test.js` | CREATE |
| `plugins/mccp/scripts/lib/plan-conflict-detector.js` | UPDATE |
| `plugins/mccp/commands/prp-implement.md` | UPDATE |
| `plugins/mccp/scripts/lib/tests/plan-conflict-detector.test.js` | UPDATE |
| `plugins/mccp/scripts/lib/env-contract/registry.js` | UPDATE (계획 밖 — 머지 회귀 정정) |
| `.claude/plans/codex-findings-backlog.md` | UPDATE |
| `.claude/prds/santa-delta-review.prd.md` | UPDATE |
| `plugins/mccp/.claude-plugin/plugin.json` · `renderer/html.js` · `renderer/markdown.js` · `CHANGELOG.md` | UPDATE (4면 동기) |
| `.claude/notes/santa-delta-review-m3.md` · `…-m3-implement-codex.md` | CREATE |
| `.claude/PRPs/reports/santa-delta-review-m3-report.md` | CREATE |

## Deviations from Plan

1. **Task 1이 계획에 없던 축을 하나 더 닫았다 — finding 셀의 꼬리 보존.**
   plan은 (a) pipe 선택 (b) date 엄격화 (c) `invalid_count` 실제 계수만 지시했다. 그러나 파서가
   첫 4셀만 구조분해해 **finding 안의 `|` 이후를 조용히 잘라내고** 있었고, 사이클 행 중 1건
   (`codex-findings-backlog.md:544`)이 정확히 그 형태라 Task 7이 붙일 `ABSORBED` 마커가 파서에
   보이지 않았을 것이다. 같은 결함 계열(조용한 손실)이고 Task 7의 기계 판정이 그것에 의존하므로 함께 닫았다.
   origin/main이 2026-08-23에 같은 결함을 독립 관측해 backlog에 적재해 둔 것도 확인했다.

2. **Task 3의 적용 대상이 1개가 아니라 3개였다.**
   plan의 Action은 `santa-loop-cap.test.js`만 명시했으나 DD5는 «실측으로 red인 파일»을 기준으로 삼는다.
   실측 결과 red인 파일은 셋이었다 — `santa-loop-cap`(28) · `santa-adjudication`(22) · `santa-lanes`(1),
   합 51 = 전 스위트 실패 총량. DD5의 기준을 따랐고, 붉지 않은 나머지 11개 env-상속 파일은 건드리지 않았다.

3. **`env-contract/registry.js`가 `Files to Change` 밖인데 바뀌었다.**
   머지가 가져온 신규 lint L10이 이 브랜치에서만 실패했다(main에서는 통과). M1이 `santa/lanes.js`에
   주석을 넣어 `ENV_BLIND_LANE`이 26→32행으로 밀렸는데 registry evidence가 `:26`으로 남은 것이다.
   **이 브랜치가 만든 회귀**라 같은 사이클에서 닫았다.

4. **version이 `1.30.5`가 아니라 `1.32.5`다.** DD8이 «번호를 미리 확정하지 않는다»고 적은 그대로,
   머지 시점 재계산에서 전제가 무너졌다 — `origin/main`의 천장이 `1.32.2`였고 `1.30.2`는 이미
   diverse-agent-review M7에 발행돼 있었다. forward-only로 M1 `1.32.3` · M2 `1.32.4` · M3 `1.32.5`.

5. **Task 6의 커밋이 머지 커밋이다.** version 결정이 곧 충돌 해소이므로 분리할 수 없다.

## Issues Encountered

### plan의 acceptance 판정 명령 1건이 결함이었다

Task 5 Validate와 acceptance (d)가 쓰는 `grep -cE 'git diff --name-only origin/[^ ]+\.\.[^.]'`는
`[^ ]+`가 여분의 점을 삼킬 수 있어 **세 점 표기도 매칭**한다. 즉 고쳐도 0이 되지 않으며 그 명령으로는
「두 점 0건」을 판정할 수 없다(수정 완료 후에도 카운트 2 — 실측).

정정: `origin/[^ .]+\.\.[^.]`. 반증 실측 — 두 점 fixture 1 · 세 점 fixture 0 · 현재 본문 **0**.
`plan-conflict-detector.test.js`의 정적 단언도 같은 형태를 쓰고, 정규식이 아무것도 못 잡는 상태로 굳지
않도록 두 fixture 문자열을 같은 test 안에서 함께 단언한다.

**plan 본문은 고치지 않았다** — implement receipt가 `plan_hash`를 봉인했고 편집하면 `/mccp:pr`의
staleness 가드에 막힌다(§3.11 guard 2). 정정 기록은 이 report와 노트, backlog가 갖는다.

### 선재 red 1건 (main 승계)

`hooks/tests/ecc-context-monitor.test.js`의
`Axis B (f): default thresholds → $85 emits COST WARNING` 1건이 실패한다. 이 브랜치는 cost 축을
전혀 건드리지 않았고, test·subject·`harness-cost.js` 세 파일이 **origin/main과 byte 동일**이다.
env 유무와도 무관하다(두 조합 모두 실패). **이 브랜치가 만든 것이 아니며 M3 범위 밖**이라 backlog로 이연한다.

### 머지 충돌 9건

전부 파일 단위로 해소했고 `--ours` 통짜 취함은 쓰지 않았다. **§3.5.1 검증: 삭제 0건** —
`git diff --diff-filter=D --name-only origin/main...HEAD`가 빈 출력이고, `origin/main`의 tracked 파일 중
머지 인덱스에서 사라진 것도 집합 대조로 0건이다. 상세는 노트 §3.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `derive/tests/backlog-source.test.js` | 8 (신규) | GFM pipe 4형태 동일 파싱 · 불량 행 계수 · 산문 미오인 · finding 꼬리 보존 · 반환 형태 불변 |
| `lib/tests/santa-detection-coverage.test.js` | +5 | `measured=false` · 양측 unknown · `unindexable` · 신규 필드가 추가일 뿐임 |
| `hooks/tests/hook-trace-root-anchor.test.js` | 3 (신규) | 루트 한 곳(shard + `.end`) · 표면 절대경로 0건(git 성공 경로) · 비-git fallback 미던짐 |
| `lib/tests/plan-conflict-detector.test.js` | +3 | 백틱 매칭 · unplanned 오발화 부재 · 본문 두 점 diff 0건(정적) |

## 이 milestone이 주장하지 않는 것

- **M3는 탐지율을 검증하지 않았다.** 닫은 것은 *사이클이 남긴 부채*이지 *PRD의 측정 축*이 아니다.
  `MCCP_SANTA_DELTA_SCOPE` default는 `off` 그대로다.
- **Layer 2는 여전히 미실행이다.** PRD Open Question으로 열려 있다. M1·M2·M3가 모두 `complete`라
  `scan.js`는 이 PRD를 archivable로 판정하겠지만 **아카이브는 보류한다**(DD10) — 옮기면 그 질문이
  활성 표면에서 사라진다.
- **cross-model adversarial review를 받지 않았다.** Plan-Codex는 M3에서 발화한 적이 없고
  (`mccp-plan-codex/santa-delta-review-m3` receipt 부재 · plan의 `## Codex Adversarial Review`가
  placeholder), Implement-Codex도 `MCCP_CODEX_DISABLED=1`로 skip됐다. 실제로 발화한 리뷰는
  L2 다관점 패널 3라운드뿐이다. 사유는 §3.16(라운드를 늘리지 않고 문서화된 우회 + 사유 기록)이며
  `.claude/notes/santa-delta-review-m3-implement-codex.md`에 기록했다.
- **security-reviewer가 발화하지 않았다.** 세션 운영 제약(UI9)이 서브에이전트 발화를 금지하므로
  receipt에 `security_skipped=true`를 정직하게 봉인했다. Task 4의 `toRepoRelative`가 경로 탈출 축을
  건드리므로 카테고리를 낮춰 회피하지 않았다 — 그 값은 `/mccp:pr`에서 blocking으로 남는다.
- **hook 표면 절대경로 0건은 git 해석 성공 경로에 한정된 주장이다.** 비-git fallback에서는 원본
  절대경로가 그대로 나가며, 그것은 결함이 아니라 DD6-3이 명시한 잔여다(`..` 사슬이 더 나쁘다).

## Next Steps

- [ ] `/mccp:pr` — **진입 직전 §3.7 version 재계산 필수**(이 사이클에서만 세 번째 충돌)
- [ ] Layer 2 완주 — 서브에이전트 발화가 허용된 세션에서. 그 전까지 PRD 아카이브 보류
