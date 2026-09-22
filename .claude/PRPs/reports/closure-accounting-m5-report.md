# Implementation Report: closure-accounting M5 — residual-repair

## Summary

M1~M4가 남긴 결함·이연·열린 질문을 닫았다. closure 계기가 소유한 결함 다섯(여러 줄 code span 마커 ·
m10 봉인 축 대조 부재 · 리포트의 조상 오라클 이중 호출 · 떨어질 판정 수 비가시 · reseal lock 소유권)과
backlog 이연 넷(1005 소비처 연속성 · 1829 표 test · 1845 handoff degraded · 1828/1851 emitter 호출
도달성)을 코드와 test로 닫았다. 여기에 CI json artifact와 동적 summary fence(OQ2 · 1852)를 더했다. 타 소유 실측
결함 6건은 file:line 증거째 backlog 새 행으로 넘겼다. 재봉인 없음 · 판정 append 없음 · 새 임계 없음 · 게이트 없음.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Confidence | — | 계획대로. 구현 시점 결정 1건(빈 줄 정의)과 게이트 이탈 1건 |
| Files Changed | 20 (+ 게이트 산출물 5) | 20 코드·문서 + 게이트 산출물 5 (`cli.test.js` · 이 report 신규) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | 전제 확인 | [done] | main이 앞서 있어 plan 산출물 커밋 `c8e0021` → `origin/main` 병합 `48069da`(충돌 3건, backlog 양쪽 보존 · 삭제 0). 함수 6종 `typeof` 확인. 기준값 저장 — `open`은 main의 ci-full-suite-m5 dispose로 1740 → 1738 |
| 1 | 문단 backtick 규칙 | [done] | Deviated — 빈 줄은 `trim()`이 아니라 `/^[ \t]*$/` (아래) |
| 2 | m10 봉인 축 대조 | [done] | |
| 3 | 조상 깊이 단일 호출 · `sealed_not_live_disposed` | [done] | 기존 `(m5)`를 verify mock으로 전환(DD3 결과) |
| 4 | `formatTable` test | [done] | gap의 `Count`·`Percentage` null도 `n/a`로(M4 L1 규칙을 gap 절까지) |
| 5 | lock nonce | [done] | |
| 6 | 소비처 연속성 | [done] | 비공허 대조를 test 안에 둠(승계 줄을 옛 sha로 치환 → `closed_count` 0) |
| 7 | handoff degraded | [done] | catch 경로는 `degraded:true`(throw는 가장 심한 판독 불가) |
| 8 | R9 | [done] | |
| 9 | CI artifact · fence | [done] | |
| 10 | backlog 6행 | [done] | 날짜는 실제 append 일자 `2026-09-22`(plan은 `2026-09-15`로 적음) |
| 11 | 문서 · PRD · M4 report · CHANGELOG | [done] | PRD M5 행 `complete` — 머지 전 `/mccp:milestone-close`로 전환(2026-09-22, `.claude/milestone-closures/closure-accounting-m5.md`) |
| 12 | 라이브 완주 · 보고서 | [partial] | (a)~(c) 첨부. (d) PR run artifact는 PR을 연 뒤 이 절에 채운다 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | 저장소에 type-check·lint 스크립트 없음(`package.json` 부재). 변경 모듈 `require` 로드 확인 |
| Unit Tests | [done] Pass | Validation 1: 200/200 · Validation 2 (cwd 독립): 50/50 |
| Build | N/A | 빌드 단계 없음 |
| Integration | [done] Pass | Validation 3~8 전건 exit 0(아래 원문) |
| Edge Cases | [done] Pass | 변경 모듈을 require하는 test 15파일 291건: 290 pass · 1 fail(`M8-B3-SET-EQUALITY` — 변경 전 HEAD worktree에서도 같은 fail, backlog 선재 red) |

### Validation 원문 (2026-09-22)

```
== 3
  Sealed not live: 11 (1 with a disposition — dropped at the next re-seal)
== 4
m10 exit 1, seal.producer_agrees true seal.ok true
== 5
invalid 0 {"docs/multi-session-work-loop/debt-deferred-minor.md":627,"docs/multi-session-work-loop/debt-deferred-high.md":312,"docs/multi-session-work-loop/debt-deferred-critical.md":31}
== 6
reseal plan exit 0
== 7
ok: no version declaration on this branch (merge-base with origin/main = 1.34.4)
no deletions
== 8
backlog ok
```

(a) 라이브 표 (`closure report`):

```
DENOMINATOR GAP
  Count:           531
  Percentage:      15.8%
  Net change:      520 (live − sealed; may be negative)
  Sealed not live: 11 (1 with a disposition — dropped at the next re-seal)
```

(b) 라이브 m10: `seal.producer_agrees: true` · `seal.ok: true` · `ancestor_bound_lines` 1115 · `mismatched_lines` 0 ·
게이트 exit 1(사유 `dispositions.open` 1738 — M4 설계대로).

(c) 불변식: Task 0 기준값과 동일 — `invalid_dispositions` 0 → 0, `deferrals_by_successor` {627, 312, 31} → 동일.
live successor 3개의 마커 문단 backtick 0개(Task 1 규칙에 걸리지 않음).

(d) PR run artifact — **미확보**. PR을 연 뒤
`gh api repos/idenn207/mccp/actions/runs/<id>/artifacts --jq '.artifacts[].name'`로 `closure-report`를 확인해 이 절에 채운다.

### 비공허성 mutation (전부 실측 — 되돌린 뒤 원본 복원 `cmp` 확인)

| 변경 | red가 된 단언 |
|---|---|
| Task 1 문단 backtick 검사 무력화(`if (false)`) | `(t5)` (`msw-m10-producers.test.js:802`) |
| Task 1 빈 줄 판정을 `trim()`으로 | `(t11)` NBSP 반례 (`:823`) |
| Task 2 `ok`에서 `agrees` 제거 | `off.ok === false` (`msw-reseal.test.js:573`) |
| Task 3 `sealAncestry` 직접 호출 복원 | `(m5)` · `(d1)` · `(d2)` |
| Task 5 nonce 비교 제거 | `(n1)` release 거절 (`msw-reseal.test.js:806`) |
| Task 6 승계 줄 sha 치환 | test 안의 대조 단언(`closed_count` 0) |
| Task 7 `degraded` 필드 제거 | `C1-PROMOTE-DEGRADED` |
| Task 8 `plan-codex-runner.js:599` 호출 주석 처리 | `(R9)` — `['emitAdjudicationOutcomes']` |
| Task 9 fence를 리터럴 ```` ``` ````로 | `(w8)` — "longer than the longest run in the report (4): 3" |

### Design Grounding

N/A (no design trigger) — `impeccable-detect --mode implement` → `design_signal:false` · `no-signal`. silent-skip을 receipt에 기록했다.
Phase 3.6 finish 라우팅과 3.7 grounding은 no-op이다.

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js` | UPDATED | +30 / -27 |
| `plugins/mccp/scripts/lib/msw-metrics/m10-coverage-gate.js` | UPDATED | +19 / -2 |
| `plugins/mccp/scripts/lib/msw-metrics/reseal.js` | UPDATED | +14 / -2 |
| `plugins/mccp/scripts/lib/closure/report.js` | UPDATED | +24 / -11 |
| `plugins/mccp/scripts/lib/closure/cli.js` | UPDATED | +25 / -3 |
| `plugins/mccp/scripts/state/handoff-items.js` | UPDATED | +17 / -1 |
| `.github/workflows/closure-report.yml` | UPDATED | +20 / -2 |
| `plugins/mccp/scripts/lib/tests/msw-m10-producers.test.js` | UPDATED | +52 |
| `plugins/mccp/scripts/lib/tests/msw-reseal.test.js` | UPDATED | +111 |
| `plugins/mccp/scripts/lib/closure/tests/report.test.js` | UPDATED | +106 / -33 |
| `plugins/mccp/scripts/lib/closure/tests/cli.test.js` | CREATED | +107 |
| `plugins/mccp/scripts/lib/tests/c1-feedback-loop.test.js` | UPDATED | +34 |
| `plugins/mccp/scripts/lib/tests/findings-producer-reachability.test.js` | UPDATED | +71 |
| `scripts/tests/closure-report-workflow.test.js` | UPDATED | +71 |
| `docs/multi-session-work-loop/debt-inventory.md` | UPDATED | +76 / -6 |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | +7 (append only, `-\|` 0) |
| `.claude/PRPs/reports/closure-accounting-m4-report.md` | UPDATED | +6 (정정 한 단락, 원문 보존) |
| `CHANGELOG.md` | UPDATED | +20 |
| `.claude/prds/closure-accounting.prd.md` | UPDATED | plan 게이트 커밋 `c8e0021`(M5 행 · OQ 2건) |
| `.claude/PRPs/reports/closure-accounting-m5-report.md` | CREATED | 이 파일 |

`plugins/mccp/.claude-plugin/plugin.json` 무변경(§3.7 — guard exit 0).

## Deviations from Plan

1. **Task 1 빈 줄 정의** — plan은 `trim() === ''`로 적었다. 구현은 `/^[ \t]*$/`(CommonMark 정의)로 했다. JS `trim()`은
   NBSP만 있는 줄도 빈 줄로 보지만 CommonMark는 그 줄로 문단을 끊지 않는다. 그래서 3줄 이상 걸친 span의 가운데
   묶음이 backtick 없이 남아 마커가 노출된다 — 과다 제거 방향이 아니다. security-reviewer S1(HIGH)이 독립적으로
   같은 반례를 냈고 `(t11)`이 고정한다.
2. **게이트 이탈 — read-back validate stale** — `mccp-plan-codex` stale 1건으로 2.5.7이 exit 2였다. 문서화된 우회가
   이 validate에는 없어, 사용자 판정(2026-09-22 "이탈 기록 후 진행")으로 진행했다. 상세는 plan `## Gate Deviation`.
3. **plan Files to Change에 게이트 산출물 5행 추가** — plan-conflict-detector가 `file-expansion`을 냈다. 표 밖 파일 5개는
   전부 게이트가 쓰는 산출물(plan 자신 · 리뷰 기록 · findings shard · STATE.md · fix-task-applied.md)이었고, 구현 파일은
   0개였다. 명령이 허용하는 "plan 수정" 경로로 `GATE` 행을 명시했고 재판정은 `conflict:false`다. `/mccp:pr`의 dedupe
   매칭(diff ⊆ planned)도 이 행 덕에 맞는다.
4. **Task 10 날짜** — `2026-09-15` 대신 실제 append 일자 `2026-09-22`.
5. **Task 3 기존 test 전환** — `(m5)`는 `sealAncestry` mock을 쓰고 있었다. DD3로 깊이의 출처가 verify가 됐으므로
   verify mock으로 바꿨다(단언 의미 — 0 · N · null · 필드 부재 null — 은 유지).

## Issues Encountered

- **main 선행** — plan은 트리 == `origin/main`을 전제했으나 main이 27파일 앞서 있었다. plan 산출물을 먼저 커밋하고 병합했다.
  backlog 충돌은 main 행 → 이 브랜치 행 순서로 양쪽 보존했고, state 파일 2개는 이 worktree 쪽을 택했다. §3.5.1 삭제 검증 0건.
- **escalation 경고 재발(MF3)** — implement receipt(`codex_verdict=divergent`)가 `escalate_pending: closure-accounting-m5`와
  fix-task(`rounds >= 3` 문구 — MF4)를 다시 걸었다. 해제 기계는 타 소유라 M5는 고치지 않는다(DD9). backlog 새 행에 재현째 적었다.
- **Implement-Codex R1** — `needs-attention` → `divergent`. 유일 finding(HIGH)은 Task 1이 고치는 결함 자체였고,
  Codex는 "구현 전이라 결정을 검증할 수 없다"고 적었다. 구현 후 코드에 대한 cross-model 리뷰는 `/mccp:pr`의 PR-Codex가 맡는다
  (dedupe는 plan·implement 양쪽이 converged가 아니므로 열리지 않는다).

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `msw-m10-producers.test.js` | 1 (`(t5)`~`(t11)` + 줄 수 보존) | 문단 backtick 규칙 · CommonMark 빈 줄 · 비용 고정 |
| `msw-reseal.test.js` | 3 | 봉인 축 대조 (a)~(d) · lock nonce (n1)~(n3) · 소비처 연속성 |
| `closure/tests/report.test.js` | 5 신규 + `(m5)` 전환 | `(d1)` `(d2)` `(s1)`~`(s3)` |
| `closure/tests/cli.test.js` | 4 | `(c1)`~`(c4)` |
| `c1-feedback-loop.test.js` | 1 | `(p1)` ENOTDIR degraded · `(p2)` 양성 대조 |
| `findings-producer-reachability.test.js` | 2 | `(R9)` · `(R9b)` |
| `closure-report-workflow.test.js` | 2 | `(w7)` artifact step · `(w8)` fence 행동 |

## Next Steps

- [ ] `/mccp:code-review`
- [ ] `/mccp:pr` — `mccp-plan-codex` stale이 terminal 게이트에서도 걸린다. 사유를 담은 감사 우회 + PR 본문 `## Gate Deviation`
- [ ] PR run의 `closure-report` artifact 이름을 위 (d)에 채우기
- [x] PRD M5 행 `complete` — 머지 전 `/mccp:milestone-close`에서 전환 (2026-09-22)
