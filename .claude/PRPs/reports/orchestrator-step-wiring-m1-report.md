# Implementation Report: metric-boundary-unification (orchestrator-step-wiring M1)

**Plan**: `.claude/plans/orchestrator-step-wiring-m1.plan.md`
**PRD**: `.claude/prds/orchestrator-step-wiring.prd.md` (M1)
**Branch**: `orchestrator-step-wiring`
**Plugin version**: 1.34.1 → **1.34.3** (§3.7 forward-only 재계산 — 아래 Deviations 참조)

## Summary

A1(무인 완주율)이 읽는 이벤트 corpus를 worktree-local에서 **git common dir 공유 위치**로 올려
어느 위치에서 derive를 돌려도 같은 값이 나오게 했다. 공유 위치 해소는 `repoRoot/.git` **하나만**
보는 파생 구조(DD7)이며 walk-up이 없다. 이동 대상은 A1 축 3 kind(`task_started` ·
`task_completed` · `task_ship_sealed`)로 한정되고(DD8 KIND 경계), 나머지 kind는 worktree-local에
그대로 남아 B2·taxonomy 축이 v1.33.6 동작을 유지한다. 분모 granularity는 producer가
`work_unit_kind`를 기록하고 reader가 PRD 단위를 분모·분자 양쪽에서 제외해 정합화했다. 값은
`/mccp:work` 진입 배너로 노출되고, A1 라벨을 계산 단위(작업 단위)에 맞춰 정정했다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 구현 자체는 계획대로. 비용은 리뷰 라운드(패널 R0/R1 + santa R0 + Codex R0/R1)에 쏠렸다 |
| Files Changed | 24행 (Files to Change) | 23개 (21 UPDATE + 2 CREATE) — 계획 표의 `state/cli.js`는 **변경 불필요**로 판명 |
| Tests | 신규 1파일 + 4파일 확장 | 신규 18 test + 기존 4파일 확장. msw 축 전량 142 pass |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 공유 위치 해소 — repoRoot 파생, spawn-free, walk-up 없음 (DD7) | 완료 | `commonDirOf` + `resolveEventsDir(opts.kind)` KIND 경계. 공유 경로에서 `evictLRU` 미호출, cap 초과는 loud stderr. 토글 열거 밖 값은 off + warn |
| 2 | reader가 공유 위치를 읽는다 (`di > 0`) | 완료 | `candidates` 순서 `[local, shared, legacy-cwd]`. 기존 `canonical()`·`seenDirs`·`legacyKeyOf` dedupe 골격 재사용 |
| 3 | 1회 마이그레이션 (idempotent · dry-run · marker) | 완료 | `migrations/msw-events-common-dir.js` (309행). 컨테인먼트 기준은 repo-root가 아니라 **common dir**. A1 축 kind만 복사, 원본 미삭제 |
| 4 | granularity 필드 (producer) | 완료 | `ALLOWED_FIELDS`에 `work_unit_kind` · `emitTaskStarted`가 인자 축(PRD 경로 토큰)으로 판정 |
| 5 | granularity 필터 (reader) | 완료 | 분모 제외 + **분자에도 동일 필터**(A1 > 100% 차단). 진단 3종 추가 |
| 5a | A2 분모를 관측된 세션으로 (`sessions_local`) | 완료 | `computeA2`가 `sessions_local.length`를 읽고, 필드 부재 시 `sessions`로 fallback(구 producer 호환) |
| 5b | `m8-coverage-gate`가 해소기를 거친다 | 완료 | `evaluateAcceptance`가 kind별 `resolveEventsDir` 조회 (`m8-coverage-gate.js:183`) |
| 6 | A1 라벨 정정 | 완료 | `METRICS_META` A1 `name='작업 단위 완주율'`. test는 `name`에만 건다(`desc`는 dead field) |
| 7 | work 진입 배너 | 완료 | `msw-metrics/cli.js a1` (+`--repo-root`) · `work.md`가 `execFileSync(timeout:3000)` 경계로 호출 |
| 8 | 회귀 test | 완료 | `msw-a1-boundary.test.js` 18 test — (1)~(11) 전항 커버 + 확장 |
| 9 | env 등록 + 문서 + version 동기 | 완료 | `registry.js:183` · `ENVIRONMENT.md:137` · `orchestration.md:513` · 4면 version 동기 |

## Validation Results

| # | Check | Status | Evidence |
|---|---|---|---|
| 1 | msw 축 test 10파일 | Pass | tests 142 / pass 142 / fail 0 |
| 1b | 도달성 + KIND 경계 + cross-root 경로 동일성 | Pass | 3 root 전부 A1 = `mccp/.git/mccp/msw-events`, B2는 root별 분리. exit 0 |
| 2 | env 계약 lint L1~L10 | Pass | 10/10 ok |
| 3 | surface version 동기 (4면 drift) | Pass | `i18n-surface.test.js` 10/10 |
| 4 | 마이그레이션 idempotency | Pass | apply `new_lines=9` → 재 dry-run `new_lines=0`, `invalid=0` |
| 5 | 위치 독립성 라이브 실측 | Pass | 3 위치 전부 `27.3% (6/22 · status=computed)`, 기계 판정 exit 0 |
| 6 | 배너 경량 경로 비용 | Pass | 0.224s (derive 전체 2.28s 대비) |
| 7 | 토글 양방향 실효 | Pass | off → worktree-local, on → `.git/mccp/msw-events`, 두 값 상이 |

추가 회귀 확인(계획 Validation 밖 · 변경 모듈 커버리지):

| Suite | Status |
|---|---|
| `pr-phase-helpers/finalize-receipt.test.js` + `hooks/tests/receipt-prompt-*.test.js` (4) | Pass — 43/43 |
| `renderer/tests/*.test.js` 전량 | Pass — 672/672 |

### Design Grounding

**N/A (no design trigger).** 게이트 시점 detector가 `design_signal=0` · `reason=no-signal` →
`impeccable_silent_skip=true`로 receipt에 정직하게 기록됐다. plan 단계의 `design_signal=true`는
*예정된* 렌더러 변경에 근거했고 게이트 시점 tracked diff에는 rendered surface가 없었다. 따라서
Phase 2.5.5c capture가 없고 Phase 3.7은 완전 no-op이다.

## Acceptance 지표 실측

| 지표 | 요구 | 실측 | 판정 |
|---|---|---|---|
| 1 — 위치 독립성 | 세 위치에서 같은 A1 | 3/3 `27.3% (6/22)` | **충족** |
| 2 — status | `computed` (not `forward-only`) | `status=computed` | **충족** |
| 3 — unknown 정합 | `work_unit_kind_unknown_count`가 마이그레이션된 레거시 착수 수와 일치 | `unknown=22` = `task_startups_count=22` (전건이 레거시) | **충족**(전반부). 후반부는 아래 참조 |
| 5 — 소비 지점 노출 | `/mccp:work` 라이브 1회에서 배너 출력 | 아래 참조 | **부분** |

부수 실측: `prd_granularity_excluded_count=0` (계획이 예고한 대로 이번 사이클에서 **구조적으로 0** —
완료 조건이 아니다) · `completion_without_startup=1` (A1 > 100% 차단이 실제로 1건을 잡았다) ·
`sessions=58` 대 `sessions_local=10` (Task 5a가 없었다면 A2 분모가 58로 붕괴했을 것) · `invalid_count=0`.

지표 4(halt 지점 기록률)는 M1 acceptance가 아니다 — M2 소유(UI4 · G7).

### 지표 3 후반부 · 지표 5가 이 사이클에서 완결되지 않는 이유

둘 다 **새 producer 코드가 실행되어야** 관측되는데, hook과 명령 본문은 worktree가 아니라
`~/.claude/plugins/cache/mccp/mccp/<version>/`에서 로드된다. 현재 설치 캐시는 **1.33.6**이므로
지금 `/mccp:work`를 돌리면 배너가 없는 옛 `work.md`가 열리고, 새 착수 이벤트도 `work_unit_kind`
없이 기록된다. 즉 이 두 항목은 머지 + `claude plugin update` 이후에야 라이브로 관측 가능하다
(§3.7이 기술한 cache 해소 구조 그대로다).

이번 사이클에서 얻을 수 있는 가장 강한 증거는 확보했다 — **새 `work.md`의 배너 블록을 그대로
(verbatim) 이 빌드에 대해 실행**했고 다음 줄이 출력됐다:

```
[mccp:work] A1 작업 단위 완주율 27.3% (6/22 · status=computed)
```

이것은 배선(CLI · 파싱 · fold 규칙 · 타임아웃 경계)이 실제로 작동함을 보이지만, 계획이 요구한
"라이브 진입 1회"와 **같지 않다**. 계획의 문구("`work.md`를 고쳤다는 것만으로는 이 항목을 주장할
수 없다")를 존중해 **충족으로 주장하지 않고 부분으로 남긴다.** 머지 후 plugin update 시점에
`/mccp:work` 1회로 지표 3 후반부와 지표 5를 함께 확인한다.

## Files Changed

23개 — 21 UPDATE + 2 CREATE (+1316 / -43).

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/state/msw-events.js` | UPDATE | +214 / -8 |
| `plugins/mccp/scripts/derive/sources/session-activity.js` | UPDATE | +99 / -10 |
| `plugins/mccp/scripts/lib/msw-metrics/cli.js` | UPDATE | +61 / -1 |
| `plugins/mccp/scripts/lib/msw-metrics/m8-coverage-gate.js` | UPDATE | +37 / -12 |
| `plugins/mccp/scripts/lib/msw-metrics/index.js` | UPDATE | +18 / -2 |
| `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js` | UPDATE | +9 / -1 |
| `plugins/mccp/scripts/hooks/receipt-prompt.js` | UPDATE | +8 / -0 |
| `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js` | UPDATE | +14 / -2 |
| `plugins/mccp/scripts/lib/env-contract/registry.js` | UPDATE | +3 / -2 |
| `plugins/mccp/commands/work.md` | UPDATE | +24 / -0 |
| `plugins/mccp/scripts/migrations/msw-events-common-dir.js` | CREATE | 309 |
| `plugins/mccp/scripts/lib/tests/msw-a1-boundary.test.js` | CREATE | 376 |
| `plugins/mccp/scripts/lib/tests/session-activity.test.js` | UPDATE | +21 / -0 |
| `plugins/mccp/scripts/lib/tests/msw-events-path.test.js` | UPDATE | +14 / -0 |
| `plugins/mccp/scripts/lib/tests/msw-metrics-render.test.js` | UPDATE | +14 / -0 |
| `plugins/mccp/scripts/lib/tests/msw-m8-producers.test.js` | UPDATE | +10 / -0 |
| `docs/environment/orchestration.md` | UPDATE | +31 / -0 |
| `docs/ENVIRONMENT.md` | UPDATE | +1 / -0 |
| `CHANGELOG.md` | UPDATE | +49 / -1 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | +1 / -1 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | +1 / -1 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | +1 / -1 |
| `.claude/prds/orchestrator-step-wiring.prd.md` | UPDATE | +1 / -1 |

게이트 산출물(`.claude/plans/orchestrator-step-wiring-m1.plan.md` · `codex-findings-backlog.md` ·
`.claude/state/**` · `.claude/reviews/**` · `.claude/receipts/**`)은 구현 diff가 아니라 리뷰 기록이라
위 표에서 제외했다.

## Deviations from Plan

1. **`plugins/mccp/scripts/state/cli.js` 무변경** — 계획의 Files to Change는 이 파일을 완주(분자)
   producer로 올렸다(L2 CRITICAL 흡수의 산물). 실제로는 `msw-event emit`이 이미
   `appendEvent(sid, event, { repoRoot: resolveCwd(flags) })` 형태로 부르고 있어(`:445`), DD7이
   `resolveEventsDir`를 repoRoot 파생 구조로 바꾼 순간 **호출부 수정 없이 공유 위치에 착지**한다.
   계획이 요구한 성질(분자가 공유 위치에 도달)은 `msw-a1-boundary.test.js` (1) 도달성 단언이 직접
   검증하며 그 test가 green이다. 파일을 안 고친 것이 아니라 **고칠 필요가 없음이 test로 증명됐다.**

2. **version target이 1.33.8이 아니라 1.34.3** — 계획은 base 1.33.1 · origin/main 1.33.7을 전제로
   잠정 1.33.8을 골랐다. implement 시점 실측에서 origin/main은 **1.34.1**이었고 sibling
   `c1-review-record-linkage`가 **1.34.2**를 선언 중이었다. 발행 번호는 불가침이므로 그 위로 밀되
   예측 가능한 충돌을 한 칸 피해 1.34.3에 착지했다(§3.7 forward-only). 4면 동기 후
   `i18n-surface.test.js` green 확인. **`/mccp:pr` 진입 직전 한 번 더 재계산해야 한다** — 세 브랜치
   중 어느 것이든 그 사이 머지되면 target이 또 밀린다.

3. **마이그레이션 파일명에서 버전 제거** — 초안이 `v1.33.7-...`을 파일명·marker·Validation 명령에
   하드코딩했는데 번호가 밀리면 `Cannot find module`로 죽고 idempotency 검사가 **조용히 실행되지
   않는다**. 축 이름을 쓰는 `msw-events-common-dir.js`로 바꿨고, 위 2번이 실제로 번호를 두 칸
   밀었으므로 이 정정이 없었다면 Validation 4가 vacuous하게 통과했을 것이다.

## Issues Encountered

1. **Implement-Codex R0의 CRITICAL은 범주 오류였다** — 리뷰어가 "요청한 구현이 target diff에
   없다"를 CRITICAL로 냈고 그 사실 주장 3건(`resolveEventsDir` kind 미배선 · `computeA2`가
   `sessions.length` · CLI가 `a3` 단독)은 직접 확인 결과 **전부 참**이었다. 그러나 이 게이트는
   EXECUTE **이전**에 돌므로 그것이 정상 상태다. `REJECT_YAGNI`로 기각하고 파생 축(implement 게이트가
   Codex에 *결정 텍스트*를 target으로 넘길 플래그가 없다)을 backlog에 남겼다.

2. **security-reviewer의 HIGH 처방 하나는 채택하지 않았다** — S1의 `assertContained(root, common)`는
   이 축에서 **항상 거짓**이다(worktree의 common dir은 worktree root의 하위가 아니다). 그 규칙을
   쓰면 공유 위치가 어떤 worktree에서도 성립하지 않아 milestone이 통째로 무력화된다. 실제로
   성립하는 불변식인 **구조 검증**(`HEAD` 존재 ∧ (`objects` ∨ `refs`) 존재)으로 대체했다. 나머지
   S2~S8(경로 정규화 · git 자신에게 묻기 · trim · argv 검증 · 크기 상한 · symlink · per-line 격리)은
   전부 흡수했다.

3. **세션 중단 후 재진입** — 이전 세션이 Phase 3.6까지 마치고 SessionEnd marker 없이 종료됐다
   (`hook-trace` stale lease). 이번 실행은 receipt·코드·PRD 상태를 실측해 잔여(Phase 4 재검증 ·
   Phase 5 REPORT)를 이어받았다. Phase 2.5 게이트는 재실행하지 않았다 — receipt가 이미 존재하고
   round 원장이 2라운드를 기록하고 있어 재호출은 캡을 소모할 뿐 새 정보를 주지 않는다(§3.16).

4. **plan receipt staleness (구조적)** — `mccp-plan-codex/orchestrator-step-wiring-m1`이 stale이다
   (`47a53275…` 대 현재 `f46d192d…`). implement 중 plan 본문에 version 재계산 결과를 기록하면서
   hash가 바뀐 것이고, 이 저장소의 모든 사이클이 겪는 구조적 조건이다.
   `validate --command mccp:prp-implement`는 `stale 1 · blocking 0 · open_critical 0`을 낸다.
   `/mccp:pr` 진입 시 guard 2가 이를 잡으므로 그 시점에 문서화된 복구(prior gate 재실행 또는
   audited 우회 + 사유 기록)를 적용해야 한다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `msw-a1-boundary.test.js` (신규) | 18 | 도달성 · 위치 독립성 · 조상 격리 · 경로 불변 · KIND 경계 · worktree 삭제 내성 · legacy dedupe · granularity · A1 ≤ 100% · producer 술어 · 직렬화 보존 · fail-open loud-once · CLI exit 0 계약 · 토글 양방향 · A2 분모 오염 + B2 불변 · A2 fallback · sealed root 일치 · m8 acceptance |
| `session-activity.test.js` (확장) | +1 | repo 내부 fixture가 조상 git dir로 해소되지 않음 |
| `msw-events-path.test.js` (확장) | +1 | 공유 위치 해소 케이스 (기존 격리 단언 무변경) |
| `msw-metrics-render.test.js` (확장) | +1 | 새 A1 `name` 단언 + 옛 `name` 부재 단언 |
| `msw-m8-producers.test.js` (확장) | +1 | `acc.ok` 직접 단언 (기존 `:294`는 `Array.isArray`만 봐서 게이트가 뒤집혀도 green이었다) |

## Next Steps

- [ ] `/mccp:prp-commit` — 구현 커밋
- [ ] `/mccp:pr` 진입 **직전** version target 재계산 (§3.7 — 1.34.3이 여전히 유효한지)
- [ ] `/mccp:pr` — guard 2 staleness 복구 판단 필요 (Issues 4)
- [ ] 머지 + `claude plugin update` 후 `/mccp:work` 1회 — 지표 3 후반부 · 지표 5 라이브 확인
