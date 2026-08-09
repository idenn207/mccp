# Implementation Report: multi-session-work-loop M4 — 예산 감축

**Plan**: [.claude/plans/multi-session-work-loop-m4.plan.md](../../plans/multi-session-work-loop-m4.plan.md)
**Branch**: `v1.23.2-multi-session-m4` · **Version**: `1.23.1 → 1.23.5` (아래 "버전 순서" 참조 — 브랜치 이름은 착수 시점 표기라 그대로 둔다)
**Date**: 2026-08-09

## Summary

A3(상시 지시문 점유율) 측정 기판을 복구해 재현 가능한 baseline을 만들고, CLAUDE.md를 절반으로 줄이되 그 감축이 **삭제가 아니라 이전**임을 기계 증명했다. B3(활성 축 수)는 분모를 정직화했고 은퇴는 0건이다.

plan이 예고한 대로 두 축 모두 **측정 기판이 죽어 있었고**, 그중 하나는 plan이 적은 것보다 더 나빴다:

- **A3는 두 겹으로 죽어 있었다.** `spawn('python3')` 하드코딩이 이 플랫폼에서 WindowsApps 스텁으로 풀려 항상 `baseline-unavailable`이었고, 그와 **독립적으로** `computeMetrics`가 `measureA3`를 아예 호출하지 않았다(import 후 재export만). 인터프리터를 고쳤어도 대시보드에는 여전히 A3가 없었을 것이다.
- **B3 producer는 아티팩트를 한 번도 남기지 못했다.** `session-start.js:733`이 `writeSnapshot`에 `opts`를 넘기지 않아 `stateDir`이 cwd 상대로 풀렸고, 리더는 repoRoot 고정이다. M3가 `msw-events`에 대해 닫은 CL-5와 동일 결함이며 그 수정 주석이 같은 `try` 블록 12줄 위에 있다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large (범위 내) |
| Files Changed | 22 | 33 (25 modified · 8 created) |
| A3 감축률 | ≥ 50% (byte 추정 51.4%, "토큰은 더 높을 공산") | 구현 시점 **총 49.3%** · CLAUDE.md 성분 **50.2%** → ship 시점 **총 43.8%** · CLAUDE.md **45.3%** (아래 "ship 직전 base 이동") |
| B3 분모 | ~94 | 구현 시점 **94** (raw 104) → ship 시점 **96** (raw 106) · 명명된 제외 10 (rebase가 승계한 main 신규 토글 2개) |
| 은퇴 건수 | 0 | **0** |

### 목표 미달을 정직 보고한다 (분할하지 않음)

**총 감축률 49.3%로 목표 50%에 0.7pp 미달**이다. plan은 "토큰 감축률이 51.4%(byte)보다 **높게** 나올 공산이 크다"고 예측했으나 실제로는 **낮게** 나왔다. 원인 셋:

1. **분모에 불변 성분이 있다.** A3 분자는 CLAUDE.md + MEMORY.md 인덱스 + STATE.md 주입 블록이다. STATE.md 블록(892토큰)은 감축 대상이 아니라 전후 동일하므로 총 비율을 희석한다. CLAUDE.md 성분만 보면 **50.2%로 목표를 넘는다**.
2. **포인터를 되돌려 넣었다.** 이전은 삭제가 아니므로 원위치에 헤딩과 목적지 포인터가 남는다(약 1.5KB).
3. **한국어 밀집 프리미엄은 실재했으나 작았다.** CLAUDE.md는 byte 기준 49.7%, 토큰 기준 50.2% 감축 — 프리미엄 +0.5pp로, 위 두 요인을 상쇄하기엔 부족했다.

대형 코호트 제약상 분할하지 않고 미달을 그대로 보고한다.

### ship 직전 base 이동 (PR #118 머지 후 rebase, 2026-08-09)

구현이 끝난 뒤 `origin/main`이 PR #118(codex-intent-context M1, `1.23.4`)을 머지했고, 이 브랜치를 그 위로 rebase했다. main은 그 사이 CLAUDE.md에 **8,819B**를 더했다 — §3.13 신설(codex-intent-context 계약) · §3.7 하위절(병렬 브랜치 version 충돌) · §4 토글 2개. 앞의 둘은 상주 지시라 그대로 승계했고(§3.13은 relocation ledger에 `S3.13`으로 신규 분류 — `on-demand`/분류만, 근거 (b) 불성립), 토글 2개는 이번 주기 이전 대상인 S4.2를 따라 `docs/ENVIRONMENT.md` §11로 함께 옮겼다.

그 결과 **ship되는 트리의 A3는 구현 시점보다 크다**: CLAUDE.md 79,971B → 87,528B, 총 23,165 → 25,644 토큰. 감축률은 43.8%(CLAUDE.md 성분 45.3%)로 내려간다.

이 차이를 감추지 않기 위해 baseline은 **재봉인하지 않았다**. `msw-metrics/cli.js`의 `--emit`은 기존 baseline 덮어쓰기를 거부하며("감축 후 baseline을 덮으면 비교 대상이 조용히 바뀌어 감축 주장이 반증 불가능해진다"), 그 설계대로 `--emit-after`로 **after만** 재측정했다. `a3-baseline.json`의 `before`는 여전히 `7fe48d9`에 봉인돼 있고 `after.git_head`는 `280b9ef`다 — 두 값의 base가 다르다는 사실이 아티팩트 안에서 그대로 읽힌다.

분모를 ship 직전 base(`origin/main`, CLAUDE.md 167,832B)로 잡으면 이번 PR의 이전량은 **83,077B(49.5%)**, 순감축은 **80,304B(47.8%)**다. 어느 분모로 재도 **목표 50%에는 미달**이며, 미달 폭이 rebase로 넓어졌다는 사실을 포함해 그대로 보고한다.

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | A3 측정 기판 복구 (BLOCKER) | 완료 | probe + in-process tokenizer 버전 + STATE 성분 교정. `status:'computed'` 획득 |
| 2 | 최소 지시 계약 확정 | 완료 | 24개 절 전수 분류. **분류 ≠ 이전** 규칙 명문화 |
| 3 | relocation ledger + reachability lint | 완료 | 4중 검사 + 부정 fixture 4종 + traversal 방어 |
| 4 | CLAUDE.md 감축 실행 | 완료 (목표 미달 보고) | 159,013 → 79,971B. §3 변경 0줄 |
| 5 | B3 분모 정직화 | 완료 | 제외 분류표 10건(file:line) · 분기 203(구현 시점 199) · 이중 분모 |
| 6 | B3 producer clock-start | 완료 | 호출부를 지나는 회귀 test로 검증 |
| 7 | 파생·대시보드 표면 | 완료 | A3 배선 + C2·C3(+B1·C1) 라벨 정정 + collapse |
| 8 | 릴리스 의무 + PRD 동기 | 완료 | plugin.json · footer 2 · CHANGELOG · PRD |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static / syntax | Pass | 변경 모듈 `node --check` 전수 |
| Unit tests | Pass | 신규 29건 (a3 4 · instruction-contract 16 · toggle/metrics 9) |
| Full regression | Pass (증분 0) | 3479 tests · 3465 pass · fail 8 · skip 6. 실패 8건이 **baseline 8건과 이름까지 동일** |
| Mechanical gate | Pass | `derive/cli.js metrics-assert --fixtures` exit 0 |
| Reachability lint | Pass | C1·C2·C3·C4 전부 pass |
| 삭제 검증 (§3.5.1) | Pass | `git diff --diff-filter=D origin/main...HEAD` 공집합 |

### Baseline 대조

착수 전 baseline은 **8건 실패**였다(plan은 M3 회고 기준 6건을 예상했으나 실측 8건). 구현 후에도 동일한 8건이며 **M4 기인 신규 실패는 0**이다.

구현 중 한 번 9건으로 늘었는데, 추가된 1건은 **사전 존재하던 flaky test**였다: `hash-ledger-exclusion.test.js`의 `baseReceipt()`가 ms 해상도 `meta.created_at`을 찍고 그 필드가 hash에 포함돼, 두 호출이 밀리초 경계를 걸치면 실패한다(유휴 상태에서 2000쌍 중 1건 재현). M4가 테스트를 29건 늘려 병렬 부하가 오르자 발현 확률이 올라간 것이다. 테스트 쪽이 틀렸으므로 `created_at`을 고정해 고쳤다(고친 뒤 2000쌍 0건).

### Design Grounding

**N/A (design trigger 미발화)** — Phase 2.5.5b detector가 `skill_available=1 / design_signal=0`을 반환했다. 게이트는 EXECUTE **전**에 평가되는데 그 시점 diff에는 UI 확장자 파일이 없었기 때문이며, 이는 문서화된 구조적 blindness다. 따라서 2.5.5c capture · Phase 3.6 · Phase 3.7이 모두 no-op이었고 receipt에 `impeccable_silent_skip=true / reason=no-signal`로 정직 기록됐다.

Task 7이 실제로는 렌더 표면(`renderer/sections/msw-metrics.js` → STATUS.md · status.html)을 바꾸므로, 자동 게이트 대신 수동으로 anchor를 확인했다: 산출된 STATUS.md의 heading depth > 3 **0건**(H15), 신규 렌더 문자열 em-dash **0건**(구분자는 `·`와 괄호), 값 셀 단일 수치 유지, `TOP_EXPANDED=3` 불변.

## Files Changed

| File | Action |
|---|---|
| `plugins/mccp/scripts/lib/msw-metrics/a3-instruction-cost.js` | UPDATED |
| `plugins/mccp/scripts/lib/msw-metrics/cli.js` | CREATED |
| `plugins/mccp/scripts/lib/msw-metrics/{index,fixture}.js` | UPDATED |
| `plugins/mccp/scripts/lib/instruction-contract/{ledger,lint}.js` | CREATED |
| `plugins/mccp/scripts/derive/sources/instruction-cost.js` | CREATED |
| `plugins/mccp/scripts/derive/{index,cli}.js` | UPDATED |
| `plugins/mccp/scripts/derive/sources/toggle-usage.js` | UPDATED |
| `plugins/mccp/scripts/state/toggle-snapshot.js` | UPDATED |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATED |
| `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js` | UPDATED |
| `plugins/mccp/scripts/lib/renderer/{html,markdown}.js` | UPDATED (footer) |
| `CLAUDE.md` | UPDATED (-49.7%) |
| `docs/milestone-ledger.md` | CREATED |
| `docs/ENVIRONMENT.md` | UPDATED (§11 흡수) |
| `docs/multi-session-work-loop/{instruction-contract.md,a3-baseline.json}` | CREATED |
| `docs/multi-session-work-loop/{measurement-design,measurement-instrumentation}.md` | UPDATED |
| `plugins/mccp/.claude-plugin/plugin.json` · `CHANGELOG.md` · PRD | UPDATED |
| 테스트 5파일 | UPDATED/CREATED |

### plan의 Files to Change 대비 추가된 파일 (근거)

| File | 왜 추가됐나 |
|---|---|
| `derive/sources/instruction-cost.js` · `derive/index.js` | Task 7.1("`computeMetrics`가 `measureA3`를 호출")의 구현 결정. `measureA3`는 **async**이고 `computeMetrics`는 **동기**이며, 다른 모든 지표는 `model.sources.*`를 읽는다. derive에서 tokenizer subprocess를 돌리면 매 render trigger마다 ~1s가 붙어 렌더 예산을 초과하므로, 기존 아키텍처대로 소스를 신설하고 커밋 아티팩트를 읽게 했다 |
| `lib/msw-metrics/fixture.js` · `lib/tests/msw-metrics-acceptance.test.js` | A3의 claimed-computable 승격. 해당 목록의 주석이 "편집이 승격의 정식 경로"로 규정 |
| `receipt/tests/hash-ledger-exclusion.test.js` | 위 flake 수정 |
| `lib/renderer/tests/i18n-surface.test.js` | footer 버전을 리터럴 `v1.23.1`로 박아 둬 bump마다 깨진다. 기대값을 `plugin.json`에서 **파생**하도록 바꿔, 이 테스트가 bump 자체가 아니라 원래 잡으려던 **동기화 drift**에 반응하게 했다(의도적 desync로 실패 재현 확인) |

## Deviations from Plan

| # | 항목 | 처리 |
|---|---|---|
| D1 | plan: "`operation_branch_count`는 하드코딩 0" | **사실 아님** — `estimateOperationBranches(usedToggles, …)`로 계산되며, 0인 이유는 분자 집합이 비어서다. 목표(0이 아닌 의미 있는 분기 수)는 유지하되 수정 방향이 다르다: 반-조작 병기는 **분모 표면** 위에서 세야 은퇴 시 값이 움직인다. 분자 기준이면 은퇴해도 불변이라 병기 목적을 달성 못 한다 |
| D2 | (plan 미기재) `computeB3`의 `operation_branch_count > 100 → invalid` | measurement-design.md에 **없는 규칙**이다. 계약의 B3 무결성 검사는 fold 탐지("토글 수는 줄었는데 분기는 그대로")이지 절대 임계가 아니다. D1을 올바로 고치면 분기 합이 199가 되어 B3가 **정확히 계산했다는 이유로 `invalid`로 퇴행**한다. 절대 임계를 제거하고 fold 탐지는 직전 주기 쌍 부재로 `forward-only` 정직 표기 |
| D3 | plan: 값 셀 "A3는 감축률" | **감축률이 아니라 점유율**로 렌더했다. A3의 정의는 점유율이므로, "상시 지시문 점유율"이라는 라벨 아래 감축률을 넣으면 이번 Task가 C2·C3에서 고친 라벨/값 불일치를 새로 만든다. 감축률은 collapse 상세로 |
| D4 | (plan 미기재) B1·C1 라벨도 오배정 | F1과 동일 결함군이라 함께 정정. B2는 M3가 근거를 남기고 의도적으로 개명한 것이라 유지, A1·A4·B3는 같은 지표의 다른 표현이라 유지 |
| D5 | (plan 미기재) 빈 corpus 위의 `computed 0%` | B3에 `snapshot_corpus_present` 게이트 추가(A1·B2 선례). producer 부재와 사용 0은 다른 사실이며, 후자로 표기하면 M2가 강등시킨 confidently-wrong 패턴이다 |
| D6 | plan: A3 STATE 성분 | 기존 구현이 **frontmatter**를 재고 있었다(주입되는 것은 body). 측정 기판 복구 범위로 보고 교정 |
| D7 | plan Files to Change에 없는 `state-injector` 의존 | 수정하지 않았다. export된 순수 reader만 재사용하고 wrapper 형태 2개만 국소 mirror(`inject()`는 side effect가 있어 read-only 측정에 부적합) |

## Issues Encountered

- **게이트 자기모순 (2.5.4 ↔ 2.5.7)**: Phase 2.5.4가 의무적으로 plan 본문에 `## Codex Implementation Review`를 주입하는데, 그 편집이 상위 `mccp-plan-codex` receipt의 `plan_hash`를 stale로 만들어 2.5.7 validate가 exit 2로 막힌다. 추가된 내용은 게이트가 스스로 작성한 감사 기록뿐이고 Tasks/Files/Acceptance는 불변이므로, verdict(`skipped`)를 그대로 둔 채 현재 본문에 재anchor했다. 구조적 문제이므로 backlog 후보로 기록한다.
- **plan-codex receipt slug 불일치**: `/mccp:plan`이 `multi-session-work-loop` slug로 기록했으나 `derive-decision`은 `multi-session-work-loop-m4`를 낸다. plan hash가 정확히 일치함을 확인한 뒤(게이트가 이 본문에 실제로 돌았다는 증거) 올바른 slug로 복구했다.
- **자체 오염 검출**: Task 1이 도입한 probe 마커 `MCCP_PY_OK`가 B3 분모 정규식에 걸려 분모가 103 → 104로 늘었다. 제외 목록에 넣지 않고 마커 이름을 `PYPROBE_OK`로 바꿔 원인을 제거했다.
- **조용히 skip되던 검사 발견**: 새로 쓴 `instruction-contract.test.js`의 repo-coverage 검사가 repoRoot 경로를 4단계로 계산해(`plugins/`에 도달) 존재 가드에 걸려 **통과하면서 아무것도 검사하지 않고** 있었다. 5단계로 고치고 가드를 assert로 바꿨다.

## 보증 범위와 명시 잔여

plan의 G1~G3 표가 단일 기준이며 그 밖의 표현은 쓰지 않는다.

| # | 보증 | 검증 |
|---|---|---|
| G1 | A3 전후 값이 동일 방법으로 재현 가능하게 측정됨 | `a3-baseline.json` `status:'computed'` · `tokenizer.version_source='tokenizing-process'` · 성분별 sha256 |
| G2 | 감축이 삭제가 아니라 이전임이 기계 검증됨 | lint C1~C4 pass · 부정 fixture 4종이 각각 실패 재현 |
| G3 | B3 분모가 정직해지고 감축으로 위장되지 않음 | 제외 전/후 분모 병기(ship 시점 106 / 96 · 구현 시점 104 / 94) · 항목별 file:line · 분기 203 · **은퇴 0건** |

**보증하지 않는 것 — "옮긴 뒤에도 지시 준수율이 유지되는가"는 측정하지 못했다.** PRD가 M4에 건 인정 조건("감축 전후 B1·C1 회귀 검사 통과")은 `computeB1`이 무조건 `insufficient`이고 C1은 live findings source 미배선이라 **입력이 존재하지 않는다**. M4는 도달성·보존만 기계 검증했다. 이 미충족은 PRD M4 행 status와 PR 본문에 명시한다.

기타 잔여:

- **live B3는 corpus가 쌓일 때까지 `forward-only`다.** Task 6이 producer를 고쳤으므로 다음 세션 1회 후 `computed`로 뒤집힌다. fixture는 compute 경로를 실증한다.
- **`docs/ENVIRONMENT.md` 내부 중복** — §1~§7의 옛 서술과 새 §11이 일부 토글을 이중 설명한다. 파일 간 중복(M4 목표)은 해소했고 파일 내부 통합은 별도 주기 소관이다.
- **A3의 `MEMORY.md` 성분은 Windows에서 탐색되지 않는다** — 경로 glob이 `/` 구분자를 가정한다. opt-in이 기본 off라 이번 baseline에는 영향이 없고, 켜도 조용히 0이 되는 잠복 결함으로 기록한다.
- **`MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL`이 제외 목록과 `TOGGLE_DEFAULTS`에 동시 존재** — `scanSurfaceDetailed`가 `defaults_conflicts`로 표면화한다. numerator 정합은 M8 소관.
- **버전 순서 — 예고한 역전이 실제로 일어나 `1.23.4`로 상향 (2026-08-09, 커밋 전 코드리뷰에서 검출)**. 착수 시점 `origin/main`은 `1.23.1`이라 `1.23.2`가 맞았으나, 그 사이 sibling 브랜치가 먼저 머지되며 `origin/main`이 `1.23.2`(PR #117 — red test suite 복구)와 `1.23.3`을 **둘 다 소비**했다. `1.23.2`를 유지하면 CHANGELOG에 같은 버전 항목이 둘 생기고(`origin/main`에 이미 `## [1.23.2] — 2026-07-31` 존재) 매니페스트가 후퇴한다. §3.7 forward-only reconcile로 두 칸 상향했고, `plugin.json` · CHANGELOG 헤더 · renderer footer 2면을 함께 동기했다. 로컬 `feat/codex-intent-context`가 `1.23.4`를 선언 중이나 **미push**이며 santa-loop 비수렴 상태라, 먼저 착지하는 쪽이 번호를 갖는다 — 그쪽이 앞서면 그때 다시 상향한다(M3 CL-3와 같은 처리).

## santa-loop round 1 — dual-review 흡수

PR 생성 후 `/mccp:santa-loop`를 돌렸다. **Reviewer A(Opus)는 G1·G2·G3를 전부 PASS로 통과시켰고, Reviewer B(codex GPT-5.4)만 세 보증 각각에서 실제 구멍을 찾았다.** [[memory: multi-session-work-loop M2]]·[[integrity-unification M3]]에 이어 asymmetric catch가 다시 재현됐다.

### Reviewer A 판정은 실측으로 대부분 반증됐다

Reviewer A는 critical 6건 중 5건을 "M4가 새로 깨뜨린 테스트"로 올렸다(`finalize-receipt.test.js` 2건 · `validate-callsite-lint` + `pr.md --plan` 2건 · "보고서의 zero-new-failures 주장은 거짓" 1건). 지적된 4개 파일을 이 브랜치는 **하나도 건드리지 않았고**, `origin/main`을 detached worktree로 뽑아 대조한 결과 같은 테스트가 **이름·개수·실패 assertion까지 동일하게** 실패했다. 전체 스위트로도 확인했다 — `origin/main` 3717 tests / fail 9, 브랜치 3746 tests / fail 8, **브랜치에만 있는 실패 0건**(브랜치가 1건 적은 것은 `perf-budget` 타이밍 테스트가 main 실행에서만 튄 것). baseline 대조 없이 "지금 빨간색이니 이번 변경 탓"으로 귀속한 오탐이다.

### Reviewer B 지적 6건 — 5건 확인·흡수, 1건 반증

| # | 지적 | 판정 | 처리 |
|---|---|---|---|
| B1 | `cli.js` `--force`가 봉인 baseline을 흔적 없이 덮어씀 | 확인 | `reseal_history` 누적 기록 + 읽을 수 없는 이전 기록 위 재봉인 거부. `buildResealHistory` 순수 함수 분리(tokenizer 없이 회귀 검증) |
| B2 | C4에 신뢰할 수 있는 before 헤딩 집합 없음 → 양쪽에서 동시에 지운 절 탐지 불가 | 확인 | strict pass 추가(before를 `a3-baseline.json` pin 커밋에서 git으로 취득). before-ref 부재는 **fail-closed**, `--allow-missing-before`로만 강등되며 `c4_strict`로 표면화 |
| B3 | C3가 `resident_pointer` 있을 때만 동작(열 비우면 검사 소멸) | 확인 | 목적지 선언 행은 포인터 **필수** + 포인터가 그 목적지를 지목하는지 대조 |
| B4 | 제외표가 JS 하드코딩, 규범 문서를 읽는 코드 0 | 확인 | `crossCheckExclusions` 양방향 drift + class 불일치 + "표 읽기 실패도 drift" |
| B5 | 입력 부재 시 가짜 0 baseline 봉인 | **반증** | CLAUDE.md 없는 디렉토리에서 emitter 실행 → `refusing to write artifact: status=baseline-unavailable`, 아티팩트 미생성. 다만 거부가 명시 체크가 아니라 TypeError 변환이라 메시지가 불투명한 것은 사실 |
| B6 | 손상 스냅샷이 corpus 존재로 계수됨 → 빈 corpus 위 confidently-wrong 0% | 확인 | 존재 판정을 **파싱 성공** 기준으로. 파일은 있는데 전부 실패하면 `degraded` |

부수로 문서 drift 2건(`measurement-instrumentation.md`의 "B3만 claimed-computable" · `MCCP_A3_READ_USER_MEMORY` truthy 판정이 `=0`을 opt-in으로 해석)과 main 승계 `CHANGELOG.md` `[1.23.4]` 헤딩 중복을 함께 닫았다.

### 이 라운드가 바꾼 보증의 강도

G2는 **명세대로 복원됐다** — plan의 C4는 원래 "감축 전 헤딩 집합 − 감축 후 ⊆ ledger"였는데 구현에 before 집합이 없어 명세보다 약했다. G3의 "이름을 규범 문서에 적을 때만 유효"는 관례에서 **기계 검사**가 됐다. G1은 재봉인 경로가 감사 가능해졌다.

신규 test 15건(instruction-contract 6 · toggle-snapshot 4 · derive-sources 2 · a3 3). 전 fixture는 **부정 방향**으로 각각 red를 재현한 뒤 채택했다.

## Plan 아카이브 미수행 (의도)

Phase 5의 기본 절차는 plan을 `completed/`로 옮기는 것이나 **수행하지 않았다.** receipt의 `plan_hash`가 `.claude/plans/multi-session-work-loop-m4.plan.md` 경로에 anchor돼 있어 지금 옮기면 `/mccp:pr`의 chain validate가 깨진다. 저장소 관례도 동일하다(M1~M3 plan 모두 `.claude/plans/`에 잔류하며, 완료 아카이브는 §3.11의 `/mccp:archive-complete`가 PRD 전체 완료 시점에 소유한다).

## Next Steps

- [ ] `/mccp:prp-commit` → `/mccp:pr` (PR 본문에 B1·C1 인정 조건 미충족 명시 — plan Acceptance 항목)
- [x] PR 직전 `origin/main` plugin.json 재확인 후 필요 시 버전 상향 — `1.23.3` 확인 → `1.23.4`로 상향 완료
- [ ] `origin/main`이 M4 base(`7fe48d9`) 이후 여러 커밋 앞서 있으므로 머지·리베이스 시 **§3.5.1 삭제 검증 필수** (`git diff --diff-filter=D --name-only origin/main...HEAD`)
- [ ] merge 후 `claude plugin update` → `1.23.4` 캐시 확인
- [ ] 다음 세션 1회 후 `.claude/state/*.env-snapshot.json` 생성 확인 (B3가 `computed`로 뒤집히는지)
