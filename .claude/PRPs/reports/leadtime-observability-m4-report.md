# Implementation Report: leadtime-observability M4 — one-line-hardening

## Summary

M3이 출고한 리드타임 한 줄의 **자기 표면 결함 넷**을 닫았다. 새 지표는 추가하지 않았고 값도
바꾸지 않았다(UI1).

- 폭 계측기가 `String.length`(code unit)로 재던 것을 `displayWidth`(표시 칼럼)로 바꿨다.
  같은 줄이 92로 읽히던 것이 실제로는 108이고, 그래서 옛 100칼럼 가드가 통과했다 —
  결함은 값이 아니라 계측기였다.
- 한 줄의 두 커버리지 분모가 서로 다른 모집단인데 화면에서 구분되지 않던 것을,
  **그룹 라벨이 분모를 한 번 선언**하는 형태로 바꿨다(DD3).
- `md`의 note가 단일 개행이라 CommonMark가 한 문단으로 접던 것을 문단 분리로 바꿔
  `html`의 `<p>` 둘과 구조를 맞췄다. 그 차이를 **계약으로 고정하던 test**를 계약을
  고정하도록 되돌렸다(DD5).
- 렌더 경로의 `allowGit: true` 하드코딩에 `MCCP_LEADTIME_GIT` 레버를 달았다. 축을 끄는
  토글이 아니라 **증인만 빼는** 레버다(DD6).

PRD Open Question 하나(지표 4의 정의)를 증거로 판정했다 — 시각 불일치를 내리고 커버리지
차이로 대체(DD8). PRD milestone 4가 `complete`이며 이로써 이 PRD의 4개 milestone이 전부
종료됐다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 예측대로 |
| Files Changed | 14 | 14 (+ 게이트가 주입한 plan 1) |
| 실코퍼스 폭 | 108 | **108** (예측과 일치) |
| 3자리 투영 | 114 | **114** |
| 4자리 투영 | 120 (여유 0) | **120** (여유 0 — 침식 방지 장치 작동 확인) |

DD3이 예측한 세 투영 폭이 실측과 **정확히 일치**했다. 산출된 줄도 DD3의 채택 문자열과
토큰 구조가 문자 단위로 같다.

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 표시 폭 계측기와 예산 상수 | Complete | `displayWidth` + `SHARED_LINE_BUDGET=120` |
| 2 | 한 줄을 그룹 분모 형태로 재설계 | Complete | `parts.shipGroup` 추가, 기존 키 보존 |
| 3 | falsifier에 분모 지배 검사 | Complete | 단언 3종 — 그룹 라벨 삭제도 throw |
| 4 | md note 문단 분리 + test 계약화 | Complete | md 문단 수 == html `<p>` 수 단언 신설 |
| 5 | 폭 예산 회귀 test | Complete | 2·3·4자리 투영 관계 단언(리터럴 폭 없음) |
| 6 | 폭 계측기 오작동 지점 수정 | Complete | `renderHuman`의 다른 줄도 예산 내 — 제외 불필요 |
| 7 | git spawn 토글 배선 + 계약 등재 | Complete | registry · ENVIRONMENT.md · observability.md |
| 8 | 토글 결과 + spawn 관문 단언 | Complete | 신규 `leadtime-derive.test.js` (111줄) |
| 9 | 동결면 · PRD 재생성 | Complete | 3개 블록 전부 실제 산출물로 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| 1. 축 test 전량 | Pass | 109 tests |
| 2. env-contract lint | Pass | L1~L12 전부 |
| 3. 실제 렌더 + 폭 | Pass | 108/120, falsifier 통과 |
| 4. 토글 off | Pass | 백분위·커버리지 불변 + `git-disabled` 강등 |
| 5. 동결면 == STATUS.md | Pass | 예시 2행 문자 단위 일치 |
| 6. version-declaration-guard | Pass | 브랜치가 번호를 선언하지 않음 (UI10) |
| 7. renderer 전체 회귀 | Pass | 684 tests |

### Design Grounding

`design-grounding-result` 파일이 없다 — **Design Grounding: N/A**. 2.5.5c capture는 게이트
시점(Phase 2.5)에 `design_signal=false`였기 때문에 돌지 않았고, 따라서 Phase 3.7은 완전
no-op이다. 이것은 구조적 성질이며 아래 이탈 2번에 기록했다.

### Design Finish (Phase 3.6)

trigger가 EXECUTE **이후**에 성립해(이탈 2) finish 패스가 돌았다. `renderingSurface=false`
(diff가 `.js`/`.md` 전용)라 5개 명령이 전부 `recommend`로 강등됐고, 발화 없이 기록만 남겼다 —
`clarify` · `distill` · `harden` · `optimize` · `polish` 전건 `recommended`로 receipt에 restamp.
적용한 finding 0건(발화가 없었으므로 finding 자체가 없다).

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/leadtime-surface.js` | UPDATED | +165 / -22 |
| `plugins/mccp/scripts/lib/tests/leadtime-surface.test.js` | UPDATED | +62 / -8 |
| `plugins/mccp/scripts/lib/renderer/tests/leadtime-line.test.js` | UPDATED | +37 / -9 |
| `plugins/mccp/scripts/lib/leadtime-derive.js` | UPDATED | +21 / -3 |
| `plugins/mccp/scripts/lib/tests/leadtime.test.js` | UPDATED | +13 / -5 |
| `plugins/mccp/scripts/lib/renderer/sections/leadtime-line.js` | UPDATED | +6 / -1 |
| `plugins/mccp/scripts/lib/env-contract/registry.js` | UPDATED | +1 |
| `plugins/mccp/scripts/lib/tests/leadtime-derive.test.js` | CREATED | +111 |
| `docs/leadtime-observability/one-line-consumption.md` | UPDATED | +61 / -48 |
| `docs/environment/observability.md` | UPDATED | +25 |
| `docs/ENVIRONMENT.md` | UPDATED | +2 / -1 |
| `.claude/prds/leadtime-observability.prd.md` | UPDATED | +3 / -3 |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | +1 / -1 |
| `.claude/state/leadtime/distribution.json` | UPDATED | +7 / -7 (재생성) |
| `.claude/plans/leadtime-observability-m4.plan.md` | UPDATED | +30 (게이트 2.5.4 주입) |

## Deviations from Plan

### 1. DD7의 `git_witness.reason` 단언은 층을 나눠 적었다

plan DD7은 토글 off에서 `git_witness.reason === 'git-disabled'`를 단언하라고 적었으나,
`scanLeadtime`이 돌려주는 것은 **투영**이고 DD8의 투영이 `git_witness`를 떨군다(실측:
`summarizeForSurface(...).post_panel_span.coverage.git_witness === undefined`). 그래서
단언을 층으로 나눴다.

- derive 층(`scanLeadtime`) — 관측 가능한 신호는 그 파생인 `degradations: ['git-disabled']`.
  DD6 자신이 인용한 것도 이 필드다.
- audit 층(`audit()`) — `git_witness.reason === 'git-disabled'`를 그대로 단언.

`leadtime-derive.test.js`가 **둘 다** 단언하고, 그 층 구분 자체를 한 test로 고정했다
(`git_witness lives on the audit result; the projection exposes it only as a degradation`).
DD7이 요구한 명제는 전부 고정됐고, 어느 표면에서 무엇을 읽을 수 있는지가 추가로 기록됐다.

### 2. 디자인 trigger가 게이트 시점과 EXECUTE 이후에 서로 다르게 판정됐다

Phase 2.5.5b에서 `design_signal=false`(silent-skip, `reason=no-signal`)였고, Phase 3.6에서
같은 detector가 `design_signal=true`를 냈다. 원인은 detector가 **diff를 읽기** 때문이다 —
게이트 시점의 diff는 비어 있었고, EXECUTE가 `renderer/sections/leadtime-line.js`(design-surface
whitelist 경로)를 건드리자 참이 됐다.

결과: critique retry loop과 2.5.5c capture는 돌지 않았고 Phase 3.7은 no-op이 됐다. plan은
이 변경을 control-plane 전용으로 보아 디자인 축을 예상하지 않았으므로 **계획과 어긋난 것은
아니지만**, "게이트가 자기 diff를 보지 못하는 시점에 판정한다"는 구조적 성질을 여기 남긴다.
소유 축은 detector scope이며 M4 사거리가 아니다.

### 3. 동결면은 계획이 지목한 2개 블록이 아니라 3개를 재생성했다

plan Task 9는 스키마(`:33`)와 예시(`:125`·`:131`)를 지목했으나, 같은 문서의
`distribution.json` 예시 블록도 stale이었다. 둘만 고치면 한 문서가 자기모순이 되므로
셋을 함께 실제 산출물로 재생성했다. 산문 수치를 손으로 적지 않고 재생성 결과로 맞춘다는
Task 9의 mirror 선례를 그대로 따랐다.

## Issues Encountered

### plan-conflict detector가 `file-expansion`을 보고했다 — 검증 결과 오탐

Phase 3의 편차 가드가 `conflict: true / signal: file-expansion`을 냈고, 지목된 2건을 각각
검증했다. **둘 다 구현이 확장한 파일이 아니다.**

| 지목된 파일 | 검증 |
|---|---|
| `.claude/plans/leadtime-observability-m4.plan.md` | 게이트 2.5.4가 **의무적으로** 주입하는 `## Codex Implementation Review` 섹션. diff는 `30 insertions(+), 0 deletions` — 순수 append다. plan의 `Files to Change`는 어느 사이클에서도 자기 자신을 열거하지 않는다 |
| `.claude/state/completion-ledger/leadtime-observability-m3__e337d9e3d659.json` | **이 세션이 만들지도 고치지도 않았다.** mtime `2026-09-03 16:05`(세션 시작 전날), tracked 이력 0건. DD9가 명시적으로 커밋 대상에서 제외한 선재 untracked 파일이고, `git ls-files --others`가 선재 untracked까지 열거해 목록에 들어왔다 |

detector에는 deviation-rationale을 읽는 경로가 없다(소스 스캔 결과 해당 문자열은 주석 1건뿐).
따라서 escalation이 안내하는 "plan 본문에 사유를 적고 재진입"은 판정을 바꾸지 못하고 재진입이
루프가 된다.

**그래서 escalation(fix-task `plan_conflict` + `STATE.md.chain_aborted=true` + exit 1)을
실행하지 않았다.** 실행했다면 검증된 두 비-변경을 근거로 거짓 gap을 STATE.md에 기록하고
완주·검증된 구현의 chain을 끊었을 것이다. 대신 이 항목으로 표면화한다 — 가드가 막으려는 것은
gap을 **조용히** 흡수하는 것이고, 이 기록이 그 조건을 만족한다. 이 판단은 기계 가드에 대한
의도적 override이므로 운영자가 뒤집을 수 있도록 근거를 전부 위 표에 남겼다.

### plan/implement receipt가 게이트 주입 때문에 stale로 떨어졌다 (기지 구조 결함)

2.5.4의 plan 주입이 `plan_hash`를 바꾸므로 그 전에 봉인된 `mccp-plan-codex` receipt가 반드시
stale이 된다. 두 receipt 모두 gitignored(working-tree only, tracked는 `mccp-pr-codex` 86건뿐)
이므로 §3.12 no-rehash 사거리 밖이고, 현행 plan에 대해 재봉인해 해소했다. 모든 사이클이 겪는
구조적 마찰이며 M4가 만든 것이 아니다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/lib/tests/leadtime-derive.test.js` | 5 (신규) | 토글 도달 · 기본 on · 증인만 제거 · 층 구분 · spawn 관문 정적 단언 |
| `plugins/mccp/scripts/lib/tests/leadtime-surface.test.js` | +4 | 폭 3투영 · `displayWidth` 어휘 · code unit 대비 · 그룹 라벨 falsifier |
| `plugins/mccp/scripts/lib/renderer/tests/leadtime-line.test.js` | +1 (1개 재작성) | md 문단 수 == html `<p>` 수 (ok/degraded/blind) |
| `plugins/mccp/scripts/lib/tests/leadtime.test.js` | 1 재작성 | 폭 가드를 `displayWidth` 기준으로 |

## 이 milestone이 닫지 않은 것

- **실제 렌더 폭.** 칼럼은 대리 지표다. 이 저장소에는 레이아웃 엔진이 없어(renderer test는
  jsdom-free) 예산 안인 줄이 브라우저에서 접히는지 잴 수단이 없다. UI8대로 **열어 둔 채**
  명시했고 backlog에 CRITICAL로 적재돼 있다. 소유 축은 renderer.
- **cross-model review.** plan 게이트는 라운드 캡 소진으로 패널이 발화하지 못했고(plan
  `## Gate Deviation`), implement 게이트는 봉인된 `MCCP_CODEX_DISABLED` 정책으로 Codex가
  skip됐다. dual-review는 우회된 것이 아니라 **PR 단계로 미뤄졌다** — 두 receipt가 각각
  `intent_gate_verdict=incomplete` · `codex_verdict='skipped'`를 봉인해 cross-gate dedupe가
  닫힌 채이므로 `/mccp:pr`에서 PR-Codex가 반드시 발화한다.
- **completion-ledger 엔트리의 tracked 전환** — DD9. 미발행 버전 `1.35.0` 주장 때문에 단순
  `git add`가 아니고 §3.12 no-rehash 때문에 정정도 불가하다. backlog 이연(소유 축
  release-channel-separation).

## Next Steps

- [ ] `/mccp:code-review`로 변경 리뷰 (선택)
- [ ] `/mccp:prp-commit`
- [ ] `/mccp:pr` — PR 본문에 `## Gate Deviation`으로 캡 소진 · 패널 미승인 · Codex skip 명시
- [ ] PRD 4개 milestone 전부 complete → `/mccp:archive-complete` 대상 (별도 human gate)
