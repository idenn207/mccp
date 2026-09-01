# Implementation Report: leadtime-observability M1 — wall-clock-aggregate

## Summary

패널 벽시계(`panel_span`)를 코퍼스 전건에서 읽어 분포로 내는 read-only · LLM-free ·
standalone 도구 `plugins/mccp/scripts/lib/leadtime.js`를 새로 두었다. 새 계측은 심지
않았다 — 값은 이미 레코드마다 `measurement.wall_clock_ms`로 있었고, 그것을 읽는 유일한
소비처(`corpus.js`의 `pass_path`)가 converged만 필터하고 있었을 뿐이다.

실측 판정: **`pass_path` 보고는 분포를 33배 과소보고하고 있었다.** converged 5건은
max 13.0분인데 전체 39건은 max 427.4분(7.12시간)이다. 미관측은 측정 부재가 아니라
집계 부재였다.

`corpus.js`는 `module.exports`에 2줄이 추가됐을 뿐 본문·출력이 무변경이고, 그 사실을
`corpus.aggregate` 바이트 동결 test가 기계적으로 강제한다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small | Small — 신규 407 LOC + test 349 LOC + 문서 565줄 |
| Files Changed | 9 | 9 (CREATE 4 · UPDATE 5) |
| 측정 가능 레코드 | 37 / 50 | **39 / 52** — 이 사이클의 게이트 실행 2건이 코퍼스에 들어왔다 |
| 라운드 | plan R1 · implement R1 | 동일 (§3.16) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `leadtime.js` — 오라클 + 수집 + CLI | 완료 | `read_error` 축 추가(L2 invariant/HIGH 흡수) · `normalizePlanPath` 추가(L2 security/MEDIUM + Codex F1 흡수) |
| 2 | 회귀 test + `corpus.js` 출력 동결 | 완료 | 19 test. 동결 리터럴은 실행 출력에서 생성해 넣었다(손으로 쓴 리터럴 0) |
| 3 | `docs/leadtime-observability/panel-span.md` | 완료 | 동결 블록을 스크립트로 주입 후 라이브 stdout과 **바이트 일치** 재확인 |
| 4 | version 4면 동기 + CHANGELOG | 완료 | `1.33.1 → 1.33.8`. **PR 직전 재계산 필요** (아래 Deviations) |
| 5 | PRD 갱신 | 완료 | milestone 1 `complete` · Open Question 1 결론 · Evidence 한 줄 추가 |

## Validation Results

| # | 항목 | 결과 |
|---|---|---|
| 1 | 라이브 완주 + 계약 | pass — `state=ok n=39/52 p50=7.6min max=7.12h` (**리터럴 37 대신 관계 단언**, 아래 Deviations) |
| 2 | 사람이 읽는 출력에 커버리지 동반 (UI3) | pass |
| 3 | `leadtime.test.js` | pass 19 / fail 0 |
| 4 | `corpus.js` 무변경 | pass 33 / fail 0 · 실코퍼스 `--json` exit 0 |
| 5 | plan-review suite 전체 (UI7) | pass 325 / fail 0 / skipped 1 |
| 6 | version 4면 (`i18n-surface`) | pass 10 / fail 0 |
| 7 | plan L1 | 위반이 **정확히 3개 CREATE 대상**뿐(`C3_CREATE_EXISTS`) — post-EXECUTE의 필연 상태 |
| 8 | 삭제 파일 (§3.5.1) | 빈 출력 = pass |
| 9 | 게이트 배선 diff 공집합 | 빈 출력 = pass |
| 10 | `corpus.js` 변경 범위 | `module.exports` 안 5줄(코드 2 + 주석 3)뿐 |

### Acceptance

- [x] All tasks complete
- [x] Validation passes
- [x] Patterns mirrored, not reinvented — `corpus.js` 헤더 구조 · state ladder ·
      `aggregate/audit/main` 3층 분리 · CLI 인자 처리, 파일 위치는 `evidence-audit.js`
- [x] 게이트/경로 1회 완주 + 라이브 산출물 3종 확인
      — (a) exit 0 · `coverage.measurable === panel_span.n === 39` · `panel_span_missing=0`
      · (b) 동결 블록 ↔ 라이브 stdout **바이트 일치**(18698자)
      · (c) 같은 출력에 `converged` p50(6.4분)과 전체 p50(7.6분)이 함께 나온다
- [x] `corpus.js --json` 키 집합 유지 — missing 0 · extra 0
- [x] PRD Open Question 1 결론 기록 + milestone 1 행 `complete`

### Design Grounding

**N/A (no design trigger).** Phase 2.5.5b 탐지가 `design_signal=false`(pre-EXECUTE diff에
렌더 표면 0건)라 capture가 발화하지 않았고 Phase 3.7은 완전 no-op이다.

### Design Finish (Phase 3.6)

post-EXECUTE 재도출에서 `design_signal=true`(html.js·markdown.js version 문자열 동기)지만
`renderingSurface=false`(변경 파일에 `.tsx/.css/.html` 0건)라 오라클이 finish 5종
(`clarify`·`distill`·`harden`·`optimize`·`polish`)을 전부 `recommend`로 강등했다. 이것이
control-plane 전용 diff의 정직한 답이며, 5건 전부 `impeccable_commands_routed`에 restamp됐다
(적용/이연할 finding 0건).

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/leadtime.js` | CREATED | +407 |
| `plugins/mccp/scripts/lib/tests/leadtime.test.js` | CREATED | +349 |
| `docs/leadtime-observability/panel-span.md` | CREATED | +565 |
| `.claude/notes/leadtime-observability-m1-implement-gate.md` | CREATED | 게이트 산출물 |
| `plugins/mccp/scripts/lib/plan-review/corpus.js` | UPDATED | +5 (export만) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | version |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | page-foot version |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | derived 줄 version |
| `CHANGELOG.md` | UPDATED | `currently` 노트 + `## [1.33.8]` 항목 |
| `.claude/prds/leadtime-observability.prd.md` | UPDATED | milestone · OQ1 · Evidence |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | §3.14 이연 5행 |

## Deviations from Plan

1. **Task 1 Validate의 리터럴 `37`을 쓰지 않고 관계 단언으로 대체했다.**
   L2 test/HIGH(`53ebdb3a`)가 지적한 대로 그 리터럴은 **이미 거짓**이었다 — 이 PRD의
   게이트 실행 자체가 코퍼스에 레코드를 추가하므로 검증이 자기 자신 때문에 실패한다.
   실측으로 확인했다(37→39, 50→52). 대체 단언: `state==='ok'` ∧
   `coverage.measurable === panel_span.n` ∧ `panel_span_missing === 0` ∧ `n > 0` ∧
   `panel_records >= measurable`. **plan 본문은 고치지 않았다** — 두 receipt가
   `plan_hash: 674cbfd4…`로 봉인하고 있어 편집하면 `/mccp:pr` staleness 가드에 막힌다.

2. **게이트 산출물을 plan 본문이 아니라 `.claude/notes/…-implement-gate.md`에 기록했다.**
   같은 이유(hash 봉인). Phase 2.5.6 Step A가 "plan **or notes** path"를 허용한다.
   multi-session-work-loop M7 · gate-guard-integrity M3 선례.

3. **계획에 없던 `read_error` 축과 `normalizePlanPath`를 추가했다.**
   전자는 L2 invariant/HIGH(`3fe37119`) 흡수 — 없으면 디렉토리 읽기 실패가 분모까지 줄여
   커버리지가 100%로 접힌다(fail-open). 후자는 L2 security/MEDIUM + Codex F1 흡수 —
   `record.js:314`가 호출자 문자열을 무정규화로 봉인하므로 절대경로가 커밋 문서로 샐 수
   있다(§3.12 `meta.cwd` 선례와 동형). 오늘 코퍼스의 `plan_path` 25종은 전부 이미
   repo-relative라 **대체 0건**이다 — 가드이지 정정이 아니며 문서에 그렇게 적었다.

4. **문서의 PRD 결정 2 귀속을 정정했다.** 초안이 `panel_span`이라는 이름을 결정 2에
   귀속시켰으나 결정 2가 이름 지은 축은 M2의 `post_panel_span`이다(L2 architect/LOW).
   C7이 인용할 1차 근거라 오귀속이 전파되므로 그 자리에서 고쳤다.

5. **version은 `1.33.8`이지만 확정이 아니다.** origin/main이 `1.33.6`을 발행했고 미머지
   형제가 `1.33.7`·`1.34.0`을 선점했다. plan Task 4가 요구한 대로 **base 머지 시점과
   `/mccp:pr` 진입 직전에 재계산해야 한다**. 이 브랜치는 아직 base를 머지하지 않았으므로
   CHANGELOG에 `1.33.2`~`1.33.6` 항목이 없다 — 머지가 복원한다.

## Issues Encountered

- **동결 test 리터럴을 처음에 손으로 추측해 써서 실패했다.** `corpus.aggregate`의 실제
  키 순서·필드가 달랐다. 실행 출력을 생성해 스크립트로 주입하는 방식으로 교체했다 —
  동결 블록도 같은 원칙으로 주입 후 바이트 일치를 재검증했다(손으로 옮긴 값 0).

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/lib/tests/leadtime.test.js` | 19 | 부재 규칙 3종 · `read_error` 사다리 · nearest-rank 경계(n=1·n=2·p0·p100) · `plan_path` 정규화 4종 · 층화 키 · UI3 커버리지 동반 · `corpus.aggregate` 바이트 동결 · 추가 export 실재 |

## Gate Record

| 게이트 | verdict | 비고 |
|---|---|---|
| `mccp-plan-codex/leadtime-observability-m1` | `divergent` (multi-agent) | L2 quorum 3 미달(test·invariant fail). `MCCP_REVIEW_SINGLE_PASS=scope_too_small` 완화, verdict는 위장 없이 봉인. HIGH 2건은 이 구현이 전부 흡수 |
| `mccp-implement-codex/leadtime-observability-m1` | `divergent` (Codex `needs-attention`) | Codex F1의 전제(빈 diff = 결함)는 범주 오류로 기각, 요구사항 5종은 전량 흡수. cross-gate dedupe는 fail-closed 유지 → `/mccp:pr`에서 PR-Codex가 실제로 발화한다 |

미흡수 MEDIUM 2 · LOW 3은 §3.14대로 증거와 함께 backlog에 이연했다.

## Next Steps

- [ ] `/mccp:prp-commit`
- [ ] base(origin/main) 머지 + **version 재계산** (§3.7 forward-only)
- [ ] `/mccp:pr` — PR-Codex가 반드시 발화한다(dedupe 미충족)
