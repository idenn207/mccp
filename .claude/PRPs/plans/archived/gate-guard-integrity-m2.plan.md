# Plan: Gate Guard Integrity — 신호 신뢰도 (M2)

**Source PRD**: `.claude/prds/gate-guard-integrity.prd.md`
**Selected Milestone**: 2 — 신호 신뢰도
**Complexity**: Medium

## Summary

전수 실행 결과를 실행 간 동일하게 만들고, 외부 의존 스모크 테스트가 도달 불가일 때 **참인 사유로** skip하게 한다. 여기에 사용자 지시로 `b2-coverage-gate` 상시 red 2건 해소를 더한다. 세 축 모두 M1과 같은 방법론을 따른다 — **가드가 막아야 할 것을 실제로 막는지의 직접 재현**이 유일한 검증 근거다.

## 착수 전 실측 (2026-08-12, 이 worktree · HEAD=3eabab2 = origin/main)

PRD Evidence는 2026-08-08~09 실측이고 그 사이 M1이 ship됐다. **재측정 결과 PRD가 서술한 상태와 세 가지가 다르다.** 이 차이가 본 plan의 실질 기여다.

| 항목 | PRD/STATE 서술 | 2026-08-12 실측 (전수 4회) |
|---|---|---|
| 전수 실행 | fail 8 (M1 후 3) | **tests 3869 / pass 3861 / fail 2 / skipped 6** (317초/회) — 4회 중 3회 |
| 비결정 2건 | `hook-caps:206` · `dedupe:306` (M1 리포트 D절) | **넷 다 미재현** — 이 2건도, STATE.md가 지목한 `a3-instruction-cost`·`perf-budget`도 |
| 비결정 자체 | 재현 조건 미확정 | **run 4에서 포착됨** — 기존 목록에 없던 신규 1건 |
| 잔여 fail 귀속 | `b2-coverage-gate` 2건은 PR #118 소관 | **#118은 이미 머지됐고(HEAD가 origin/main) red는 그대로** — 재귀속이 실측으로 반증됨 |

```
run 1  pass 3861  fail 2   run 2  pass 3861  fail 2   run 3  pass 3861  fail 2
run 4  pass 3860  fail 3   ← divergence

상시 2건 (4회 전부):
  b2-coverage-gate.test.js — "static lint passes on the real repo (approved writers only)"
  b2-coverage-gate.test.js — "full gate: covered observation on the real repo passes every axis"
  → unapproved receipt writer: plugins/mccp/scripts/lib/plan-codex-runner.js:248
                               "fs.renameSync(receiptPath, dest);" (axis=write-call-args)

run 4 단독 1건:
  plugins/mccp/scripts/hooks/tests/session-start-bootstrap.test.js:101
  "session-start does NOT rotate fix-task when truncation cuts mid-body"
  → AssertionError: "session-start must still exit 0; stderr=" · expected 0, actual 1
  → duration_ms 1042 (15s spawn timeout 아님) · stderr 완전 공백
```

**이 실측이 plan의 형태를 바꾼다.** 고정된 flaky 목록을 수리하는 계획은 성립하지 않는다 — 기존 목록은 4회 전부 미재현이고, 실제로 흔들린 것은 그 목록에 없던 항목이다. 대신 (a) 재현 장치를 1급 산출물로 만들고, (b) 결합 **메커니즘 계층**을 구조적으로 제거하며, (c) 포착된 1건을 그 첫 대상으로 삼는다.

### 포착된 divergence는 테스트 잡음이 아니라 fail-open 계약 위반이다

`session-start.js:1100-1102`는 `main().catch(err => { …; process.exitCode = 0; })`로 **어떤 실패에도 exit 0**을 자기 계약으로 선언한다. run 4는 그 프로세스가 **exit 1 + stderr 완전 공백**으로 죽은 것을 잡았다. 이는 M1이 복원한 G1(가드 1)과 **같은 형태** — hook이 자기 실패에 사용자를 막지 않아야 하는데 조용히 죽는다. 즉 이 flake는 프로덕션에서 세션 시작이 실패하는 경로이기도 하다.

배제한 가설 1건: `state/toggle-snapshot.js:515`의 `process.exitCode = scanDenominator(…)` module-scope 부수효과. `session-start.js:27`이 이 모듈을 top-level require하므로 유력했으나, **`:512`의 `require.main === module` 가드 안에 있어 require 시 실행되지 않음**을 확인했다. 원인은 미확정이며 그 확정이 Task 2c다.

### 축 B의 결함은 실측으로 재현됨

```
$ node --test plugins/mccp/scripts/lib/tests/codex-companion-smoke.test.js
ok 1 # SKIP real codex --json contract appears to be non-JSON; v0.2.4 followup
```

**이 사유는 거짓이다.** `MCCP_CODEX_DISABLED=1`(사용자 전역 `~/.claude/settings.json`)이 켜져 있어 `codex-invoke.js:182-192`가 spawn 직전 short-circuit하며 `{ok:true, stdout:'', classification:'disabled'}`를 반환한다. 테스트의 `shouldSkip()`(`:33-51`)은 **`MCCP_CODEX_DISABLED`를 보지 않으므로** 도달했다고 판단하고, 빈 stdout에서 brace를 못 찾아 "companion의 JSON 계약이 드리프트했다"고 보고한다. 실제로는 **companion이 호출된 적이 없다**. PRD가 지목한 "skip 판정이 실제 도달성과 어긋난다"가 정확히 이것이다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | `b2-coverage-gate` 상시 red 2건을 이 milestone 범위에 포함한다 | direction |
| UI2 | Phase 5 검토 게이트는 multi-agent 리뷰 패널로 수행한다 | direction |
| UI3 | 외부 Codex 서비스의 한도와 가용성 자체는 다루지 않는다 | exclusion |
| UI4 | 테스트 병렬 실행 구조를 재설계하지 않는다 | exclusion |
| UI5 | skip이나 삭제나 주석 처리로 green을 만들지 않는다 | constraint |
| UI6 | lint 검사 범위를 넓히거나 새 lint를 추가하지 않는다 | exclusion |
| UI7 | 가드 패턴 전수 감사는 수행하지 않는다 | exclusion |
| UI8 | 성공 지표는 fail 감소이면서 동시에 pass 수 비감소여야 한다 | constraint |
| UI9 | `MUTATION_ENTRYPOINTS`에 새 helper를 등록하는 것은 허용한다 | exception |

## Open Questions — 판정

### OQ4. 비결정 2건의 간섭 원인은 무엇인가 → **원인 지목 불가. 재현 장치 부재가 이 축의 진짜 결함이다**

4회 전수 실행 중 3회가 동일했고 1회가 갈라졌다. PRD가 지목한 2건도, STATE.md가 나중에 지목한 다른 2건도 **한 번도 발화하지 않았다**. 대신 그 목록에 없던 `plugins/mccp/scripts/hooks/tests/session-start-bootstrap.test.js:101`이 1회 발화했다. 즉 flaky는 **고정 집합이 아니고** 드물며 부하 의존적이다 — "실행마다 동일"이라는 진술은 **관측 없이는 참·거짓을 말할 수 없다**.

그래서 판정은 원인 지목이 아니라 세 갈래다.

1. **재현 장치를 만든다.** N회 실행의 실패 집합을 기계적으로 대조하는 harness가 없으면 이 milestone의 성공 지표 자체가 검증 불가능한 문장이다. M1이 "가드가 통과시켰다"를 믿지 않고 부정 케이스를 직접 재현한 것과 같은 이유다.
2. **결합 메커니즘을 구조적으로 제거한다.** 원인을 못 잡아도 *결합 자체*는 정적으로 열거된다. 아래 두 종이 실재한다.

| 메커니즘 | 실측 위치 | 왜 경합에 종속되나 |
|---|---|---|
| 절대 wall-clock 예산 | `derive/tests/perf-budget.test.js:61` `elapsed < 1000` | 전수 병렬 실행은 코어 수를 초과해 프로세스를 띄운다. 이 단언은 **derive의 비용 + 머신 경합**을 함께 잰다 |
| 라이브 세션 상태 읽기 | `lib/tests/a3-instruction-cost.test.js` 의 `measureA3()` 5회 호출(`:26,70,92,131,257`)이 `repoRoot` 미전달 → `a3-instruction-cost.js:477` `injector.readState(process.cwd())` | 실제 저장소의 `.claude/state/STATE.md`를 읽는다. 이 파일은 세션 hook이 갱신하는 **가변** 파일이다 |

3. **포착된 1건의 원인을 확정한다.** 이것만은 추정이 아니라 실측 대상이 있다. 다만 **재현이 선행 조건**이며, 1/4 확률로만 나타나므로 harness가 없으면 착수 자체가 불가능하다 — Task 1이 Task 2c의 선행인 이유다.

**측정으로 판정할 잔여 3건** — 아래는 wall-clock에 의존하지만 예산이 넉넉하다. harness N회에서 흔들리지 않으면 **손대지 않는다**(근거 없는 변경 금지).

- `lib/tests/plan-codex-runner.test.js:223` — `< 20000ms`
- `migrations/tests/v0.2.8-generic-receipt-quarantine.test.js:433` — `< LEASE_TTL_MS / 2`
- `receipt/tests/receipt-write-concurrency.test.js:176` — `< 3000ms` (셋 중 가장 빡빡함)

### OQ-B. 스모크 테스트의 skip 판정을 어디까지 고치나 → **도달 가능성 축만. contract-drift skip은 보존**

UI3이 외부 서비스 가용성 자체를 범위 밖으로 지정했다. 따라서 고치는 것은 *판정의 정확성*뿐이다.

- **도달 불가**(env 정책 · 미설치 · 미인증 · transport 실패) → 그 **참인 사유**로 skip.
- **도달 성공 후 계약 드리프트** → 현행 유지(skip + `v0.2.4 followup` 주석). 이 사유는 이미 참이므로 손댈 이유가 없다. 이것을 fail로 승격하는 것은 새 red를 만드는 별개 판단이다.

`MCCP_CODEX_DISABLED=1`을 도달 불가로 분류하는 것이 **누락된 단 하나의 축**이며, 그 누락이 거짓 사유를 만들었다.

### OQ-C. `b2-coverage-gate` red를 어떻게 닫나 → **위반 코드를 계약 안으로 옮긴다. lint는 한 줄도 고치지 않는다**

세 후보를 검토했다.

| 후보 | 판정 |
|---|---|
| `APPROVED_WRITERS`에 `plan-codex-runner.js` 추가 | **기각** — 파일 전체를 면제해 가드를 넓게 약화한다. 이 PRD가 복원하려는 것과 정반대 방향 |
| lint 정규식을 좁혀 격리 rename을 write로 안 보기 | **기각** — dest가 소비 경로가 아님을 정적으로 증명할 수 없다. rename은 receipt를 소비 경로로 **옮기는** 데도 쓰인다 |
| `store.js`에 승인된 격리 helper 추가 후 runner가 위임 | **채택** |

채택 근거는 세 가지다.

- `store.js`는 이미 `APPROVED_WRITERS` 원소(`b2-coverage-gate.js:38`)이므로 **lint 계약 무변경**으로 위반이 사라진다 (UI6 준수).
- 발화 조건이 정확히 `WRITE_CALL_RE = /(…|renameSync|…)\s*\([^)]*receipt/i`이고, runner의 `receiptPath`는 **helper 호출이 아니라 지역 변수명**이다(`plan-codex-runner.js`에 `receiptPath(` 호출 0건 — 실측). 따라서 write 동사와 같은 줄에서 그 이름이 사라지면 축 A가 해제되고, 축 B(`receipt-path-helper`)는 애초에 성립하지 않는다.
- 격리는 receipt를 소비 경로에서 **치우는** 동작이다. 그것을 승인된 receipt 계층이 소유하는 것이 의미상 옳다.

**`MUTATION_ENTRYPOINTS`에는 등록한다** (UI9 — 초안의 "등록하지 않는다"를 뒤집는다).

초안은 등록을 UI6이 배제한 "검사 범위 확대"로 읽고 미등록을 택했다. L2 invariant 리뷰어가 이를 CRITICAL로 지목했고, 실측해 보니 지적이 옳다.

- `staticLint`는 승인 writer를 **파일 단위로 통째 면제**한다 — `b2-coverage-gate.js:324` `if (APPROVED_WRITERS.indexOf(rel) !== -1) continue;`. 즉 `store.js`에 들어간 함수는 축 A·B 어느 쪽으로도 스캔되지 않는다. 위반을 그리로 옮기는 것이 축 C의 방법인데, 그 목적지가 무검사 구역이라면 **레지스트리가 그 면제를 책임지게 하는 유일한 보완 통제**다.
- 등록은 **탐지 범위를 넓히지 않는다**. `entrypointRegistry`(`:347-359`)는 열거된 `(file, fn)` 쌍의 **존재만** 확인한다 — 파일도 패턴도 늘지 않고, "이 함수가 계속 존재해야 한다"는 단언 하나가 붙을 뿐이다. 방향은 강화 일방이다.
- 미등록이 실패를 유발하지 않는다는 초안의 실측은 **코드에 대해서는 참**이다(missing만 검사). 그러나 같은 파일 `:52` 주석은 계약을 `목록 밖 = 실패, 목록에 있는데 부재 = 실패`로 **선언**한다. 코드와 선언이 어긋나 있고, 초안은 그 틈을 근거로 삼았다. 선언된 계약을 지키는 쪽이 이 PRD의 목적("이미 존재하는 계약이 지켜지지 않는 것을 다룬다")과 일치한다.

대신 축 C의 합격 증명을 **정밀화**한다 — "`b2-coverage-gate.js` diff가 비어 있음"에서 "**레지스트리 1행 추가 외 변경 0**"으로. `APPROVED_WRITERS` · `APPROVED_PREFIXES` · `WRITE_CALL_RE` · `ANY_WRITE_CALL_RE` 무변경이 가드 미약화의 기계적 증거다(§Validation).

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 진단 CLI | `plugins/mccp/scripts/lib/evidence-audit.js` | `require.main === module` + `--json` + 나쁜 상태에서 비영점 exit + read-only · LLM-free. CLAUDE.md §3.12가 이 형태를 문서화 |
| 순수 오라클 분리 | `plugins/mccp/scripts/lib/design-critique-decide.js` `decideCritique` | 판정 로직을 부수효과 없는 함수로 떼어내 단위 테스트 가능하게 함 |
| classification enum 소비 | `plugins/mccp/scripts/lib/codex-invoke.js:14-22` 주석 헤더 | 14종 enum을 주석과 1:1로 유지. 소비처는 enum 이름을 그대로 씀 |
| 승인 writer facade | `plugins/mccp/scripts/receipt/store.js:170` `writeReceipt` | fs 접근을 store 안에 가두고 호출부는 helper만 부름 |
| 테스트 fixture 격리 | `plugins/mccp/scripts/lib/tests/a3-instruction-cost.test.js:163` `fs.mkdtempSync(path.join(os.tmpdir(), 'a3-state-'))` | **같은 파일 안에 이미 올바른 형태가 있다** — `:185,197`은 명시 `repoRoot`를 넘긴다 |
| 부정 케이스 직접 재현 | `plugins/mccp/scripts/hooks/tests/g1-patch.test.js` (M1 산출물) | 수정 전 코드에서 fail → 수정 후 pass를 A/B로 증명 |

## Files to Change

repo-root 상대 full 경로 (CLAUDE.md §1.2 dedupe matcher 요구사항).

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/suite-determinism.js` | CREATE | 축 A — N회 전수 실행의 실패 집합을 대조하는 harness + 순수 `diffRuns()` 오라클 |
| `plugins/mccp/scripts/lib/tests/suite-determinism.test.js` | CREATE | 축 A — `diffRuns()` 부정 케이스(합성 TAP으로 divergence 검출 단언) |
| `plugins/mccp/scripts/lib/perf-scaling.js` | CREATE | 축 A — `judgeScaling` 순수 오라클(비율 판정). test 파일이 아니라 lib이 소유 |
| `plugins/mccp/scripts/lib/tests/perf-scaling.test.js` | CREATE | 축 A — `judgeScaling` 부정 케이스(합성 측정치, wall-clock 비의존) |
| `plugins/mccp/scripts/derive/tests/perf-budget.test.js` | UPDATE | 축 A — 절대 wall-clock을 자기 정규화 스케일링 비로 대체 + `runDerive` shim이 주입 스위치를 읽음 |
| `plugins/mccp/scripts/lib/tests/a3-instruction-cost.test.js` | UPDATE | 축 A — `measureA3()` 5회 호출에 명시 fixture `repoRoot` 전달(라이브 STATE.md 결합 제거) |
| `plugins/mccp/scripts/hooks/tests/session-start-bootstrap.test.js` | UPDATE | 축 A(Task 2c) — **신규 test 2건 추가**(이름은 Task 2c가 확정, 공통 리터럴 `fail-open contract`) + `runSessionStart` 진단 강화(`signal`·`error`·종료 코드 출처). **재현 실패해도 착지** |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATE | 축 A(Task 2c-A) — fail-open 계약을 **원인과 무관하게** 강제(최종 exit 지점 + module-scope require 방어). 조건부가 아니다 |
| `plugins/mccp/scripts/lib/codex-reachability.js` | CREATE | 축 B — 도달 가능성 순수 오라클(`MCCP_CODEX_DISABLED` 축 포함) |
| `plugins/mccp/scripts/lib/tests/codex-reachability.test.js` | CREATE | 축 B — 오라클 부정 케이스 |
| `plugins/mccp/scripts/lib/tests/codex-companion-smoke.test.js` | UPDATE | 축 B — `shouldSkip()`을 오라클로 대체. 거짓 사유 제거 |
| `plugins/mccp/scripts/receipt/store.js` | UPDATE | 축 C — 승인된 `quarantineReceipt` helper 추가 |
| `plugins/mccp/scripts/lib/plan-codex-runner.js` | UPDATE | 축 C — `:248` 직접 rename을 store helper 위임으로 교체 |
| `plugins/mccp/scripts/lib/tests/plan-codex-runner.test.js` | UPDATE | 축 C — **위임 관측 단언 1건 추가**(helper stub 호출 여부). 정적 grep으로 대체 불가 |
| `plugins/mccp/scripts/receipt/tests/store-quarantine.test.js` | CREATE | 축 C — helper 부정 케이스 |
| `plugins/mccp/scripts/lib/msw-metrics/b2-coverage-gate.js` | UPDATE | 축 C(UI9) — `MUTATION_ENTRYPOINTS`에 `quarantineReceipt` **1행 추가만**. 승인 목록·정규식 무변경이 합격 조건 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | §3.7 patch bump `1.23.7 → 1.23.8` (단일 milestone) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | §3.7 footer version 동기 (`:1419`) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | §3.7 footer version 동기 (`:163`) |
| `CHANGELOG.md` | UPDATE | 릴리스 기록. **forward-only** — 병렬 worktree 4개 존재, PR 직전 `origin/main` 재확인 |
| `.claude/prds/gate-guard-integrity.prd.md` | UPDATE | Milestone 2 행 `pending → in-progress` + Plan 셀 (plan 작성 시점 적용) |

> **`b2-coverage-gate.js`의 변경은 레지스트리 1행으로 상한이 고정된다**(UI9). 축 C의 성패 판정은 "diff가 비어 있음"이 아니라 **"그 1행 외 변경 0"**이다 — `APPROVED_WRITERS` · `APPROVED_PREFIXES` · `WRITE_CALL_RE` · `ANY_WRITE_CALL_RE` 중 하나라도 움직이면 가드를 약화시킨 것이고, 그 판정은 §Validation의 diff 검사가 기계적으로 내린다 (UI6).
> **의도적 미포함**: `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` — footer 단언이 이미 `plugin.json` 파생으로 통합돼 하드코딩 version이 없다(실측).

## Tasks

### Task 0: baseline 봉인 (선행, 파괴 없음)

- **Action**: Task 1~7 착수 **전에**(= Task 0 안에서) 전수 실행을 **1회 측정**해 `B = {pass, fail, failing[], skipped[]}`를 report에 표로 **봉인**하고, **그 실행의 원본 TAP을 `.claude/PRPs/reports/` 하위에 함께 보존**한다. 위 실측(`{3861, 2, 6}` × 4회)은 이 plan의 **증거**이지 `B`가 아니다 — `B`의 값은 이 문서가 아니라 Task 0의 출력이 정한다.
- **"재측정"이라는 말을 쓰지 않는다** (L2 3인 동시 지적 흡수 — test CRITICAL · security MEDIUM · invariant MEDIUM). 초안은 같은 동작을 "재측정"이라 불렀고, 그 단어가 Acceptance의 "이후 갱신되지 않았다"와 정면으로 충돌해 **문서가 스스로를 부정**했다. 정확한 서술은 이렇다:
  - `B`의 **측정은 정확히 1회**다 — Task 0에서, Task 1~7 착수 **전에**.
  - 그 1회가 이 plan의 2026-08-12 증거값과 다른 값을 낼 수 있다. 그것은 "갱신"이 아니라 **처음이자 유일한 측정**이며, 차이와 사유는 report에 적는다.
  - Task 1~7 진행 중에는 **어떤 이유로도 두 번째 측정을 하지 않는다.** 두 번째 측정이 필요하다고 판단되면 그것은 Task 0을 다시 여는 것이고, **plan을 고쳐 게이트를 다시 받아야 하는 사건**이다.
- **목표 이동 방어는 문서가 아니라 보존된 TAP이다** (security MEDIUM 지적 흡수): 통제 수단이 "report에 남긴다" 뿐이면 감사만 가능하고 억제되지 않는다. `B`의 원본 TAP을 **`.claude/PRPs/reports/gate-guard-integrity-m2-baseline.tap`** 으로 커밋하면 Task 7의 회귀 대조가 **그 파일과** 대조하므로, 중간에 다른 측정으로 갈아끼우면 대조 대상이 커밋 이력에 남는다. 경로를 고정하는 이유는 §Validation의 전제 점검이 **그 파일을 기계적으로 검사**하기 때문이다 — "기계적 방어"라 적고 기계를 두지 않으면 그것도 문서일 뿐이다(L2 invariant 지적 흡수).
  - **존재 검사만으로는 교체를 막지 못한다** (L2 architect MEDIUM 지적 흡수): 파일이 있기만 하면 통과하므로 중간에 다시 측정해 덮어써도 게이트가 모른다. 그래서 Task 0은 TAP의 **sha256을 report 본문에 함께 적고**, §Validation이 파일을 다시 해시해 그 값과 **대조**한다. 불일치는 "봉인 이후 baseline이 바뀌었다"는 뜻이며 비영점 exit이다. report는 커밋되므로 해시를 함께 고치면 diff에 남는다 — 은폐가 불가능해지는 것이 아니라 **은폐가 기록에 남는다**는 것이 이 통제의 성질이다.
  - **형식 검증도 봉인 시점에 한다** (L2 invariant 지적 흡수): 비어있지 않은지만 보면 깨진 TAP도 봉인된다. TAP 요약 헤더 3종이 있는 것으로는 부족하고 **값이 정수로 파싱되는지**까지 본다 — `# pass abc`는 헤더 존재 검사를 통과하지만 델타 계산의 피감수로 쓸 수 없다. 헤더 3종 각각이 `^# (tests|pass|fail) [0-9]+$` 형태여야 한다.
  - **해시 봉인은 *일치*를 증명하지 *순서*를 증명하지 않는다 — 그래서 git 조상 관계를 쓴다** (L2 invariant HIGH ×4 흡수, 이번 라운드에서 가장 실질적인 지적). sha256 대조는 "봉인 이후 파일이 바뀌었는가"만 답한다. implement가 **Task 1~7을 먼저 돌리고 나중에** baseline을 측정해 적어도 해시는 맞으므로 통과한다 — 즉 "착수 전에 측정했다"는 **시간 속성**이 기계적으로 미검증인 채였다. 지적이 옳다. 순서는 커밋 이력으로 증명한다:
    - `B`의 TAP은 **자기 커밋 하나로 먼저 커밋**한다(Task 산출물과 같은 커밋에 섞지 않는다).
    - §Validation이 그 커밋이 **Task 1 산출물 생성 커밋의 조상**임을 `git merge-base --is-ancestor`로 확인한다. 조상이 아니면 순서가 뒤집힌 것이고 비영점 exit이다.
    - 같은 검사가 **재측정도 닫는다**: TAP 파일을 건드린 커밋이 **정확히 1개**여야 한다(`git log -- <tap>`의 행 수 = 1). 두 번째 측정은 반드시 두 번째 커밋을 남기므로, 이 등식이 "측정은 한 번뿐"을 기계적으로 강제한다. sha256은 그 위에서 working tree 변조를 잡는 보조 축으로 남는다.
  - **seal 줄은 report에 정확히 1개여야 한다** (L2 invariant MEDIUM 흡수): 여러 개면 `head -1`이 조용히 첫 줄을 취해, 재봉인이 일어났는데도 옛 해시로 대조하는 창이 생긴다. 개수를 세어 1이 아니면 실패한다.
- **harness 실행은 `B`를 쓰지 않는다** (L2 architect HIGH 지적 흡수). Task 1의 `--runs 10`이 전수를 10회 돌리지만, 그 출력은 `{stable, unionFailing, alwaysFailing, sometimesFailing}`이며 **`B`의 어느 필드도 갱신하지 않는다**. `B`는 `.tap` 파일 하나로 봉인돼 있고 harness는 그 파일을 읽지도 쓰지도 않는다. 두 도구의 산출물이 서로 다른 파일에 있다는 것이 이 경계의 기계적 형태다.
- **수정 전 skip 사유도 여기서 봉인한다**: Task 5의 A/B 대조 대상이므로, Task 0이 `codex-companion-smoke.test.js`의 현재 SKIP 줄 원문을 report에 함께 적는다(현재 값: `real codex --json contract appears to be non-JSON; v0.2.4 followup`).
- **측정 도구는 Task 1에 의존하지 않는다** (L2 invariant "시간 역설" 지적 흡수): `B`는 **오늘 트리에 이미 있는** `node --test --test-reporter=tap "plugins/mccp/scripts/**/*.test.js"` 1회 출력으로 봉인한다. Task 1의 `suite-determinism.js`는 그 같은 명령을 N회 돌려 **실행 간 차이**를 보는 도구이지 baseline 측정기가 아니다. 두 도구의 역할이 다르므로 Task 0 → Task 1 순서에 순환이 없다 — 위 `## 착수 전 실측`의 4회 관측도 harness 없이 이 명령만으로 얻었다.
- **Mirror**: M1 plan의 `## 실측 근거` 표
- **Validate**: report(`.claude/PRPs/reports/gate-guard-integrity-m2-report.md`)에 `B` 표가 존재하고 각 행이 실제 명령 출력에서 왔으며, `baseline.tap sha256: <64자 hex>` 봉인 줄이 함께 있다(§Validation 전제 점검이 이 줄을 읽어 재해시 대조한다)
- **봉인 규칙 (L2 invariant CRITICAL 흡수)**: `B`는 **Task 1~7 착수 전에 한 번만** 측정해 확정하고 이후 갱신하지 않는다. 합격 기준(§Validation)은 전부 `B`에 대한 **델타**이므로, 작업 중 `B`를 다시 쓰면 기준이 결과를 따라가 무의미해진다. 기준은 언제나 **봉인된 `B` 하나 + 보존된 그 TAP**이다.
- **Gate**: 재측정에서 flaky가 **발화하면** — 그 실행의 TAP을 보존하고 Task 2의 표적을 실측 기반으로 재지정한다. 발화하지 않으면 OQ4 판정대로 메커니즘 제거만 수행한다. 어느 경우든 `B`는 그대로 봉인 상태로 남는다

### Task 1: 축 A — 결정성 harness

- **Action**: `plugins/mccp/scripts/lib/suite-determinism.js`를 만든다. 두 층으로 나눈다.
  - 순수층 `diffRuns(runs)` — `[{pass, fail, failing:[name]}]`를 받아 `{stable, unionFailing, alwaysFailing, sometimesFailing}` 반환. I/O 없음.
  - 실행층 — `--runs N`(default 3)만큼 전수 TAP을 돌려 파싱하고 순수층에 넘긴다. `--json` 출력, `sometimesFailing`이 비지 않으면 **비영점 exit**.
- **Mirror**: `evidence-audit.js`의 CLI 형태 · `design-critique-decide.js`의 순수 오라클 분리
- **Validate**: `node plugins/mccp/scripts/lib/suite-determinism.js --runs 3 --json` → `stable:true` + exit 0
- **부정 케이스 (필수)**: `suite-determinism.test.js`가 **합성 TAP 입력**으로 `diffRuns`를 검증한다 — 실행마다 다른 실패 집합을 주면 `stable:false` + `sometimesFailing`에 그 이름이 담긴다. 실제로 흔들리는 fixture 테스트를 스위트에 추가하지 **않는다**(신규 flake 유입 금지)
- **금지**: harness가 스위트를 수정하거나 재시도로 green을 만드는 것. 관측만 한다

### Task 2: 축 A — 결합 메커니즘 제거 (2종)

- **Action (2a) `perf-budget.test.js`**: 절대 `elapsed < 1000ms`를 **자기 정규화 측정**으로 바꾼다. 같은 fixture repo에서 receipt 수만 N=10 / N=100으로 바꿔 두 번 derive하고, 비용 비율이 상한(예: 선형 대비 여유 계수) 이내임을 단언한다. 두 측정이 **같은 경합을 받으므로 경합이 상쇄**된다.
  - **판정을 순수 오라클로 분리한다**: `judgeScaling({small:{n,ms}, large:{n,ms}, slack})` → `{ok, ratio, linearRatio, reason}`. 시간 측정은 test가 하고 **판정은 I/O 없는 함수**가 한다.
  - **판정 규칙을 여기서 고정한다** (L2 test MEDIUM 지적 흡수 — 초안은 인터페이스만 주고 알고리즘을 구현 재량에 맡겼다): `linearRatio = large.n / small.n`, `ratio = large.ms / small.ms`, `ok = ratio <= linearRatio * slack`. `slack`의 기본값은 **2**로 두되(선형의 2배까지 허용) 그 값을 상수로 노출해 근거와 함께 주석에 적는다. 이 규칙에서 N=10→100의 선형은 `ratio≈10 ≤ 10*2`로 통과하고 2차는 `ratio≈100 > 20`으로 기각된다 — 아래 부정 케이스가 정확히 그 두 점이다. `small.ms`가 0이면(측정 분해능 미만) `{ok:false, reason:'unmeasurable'}`로 **fail-closed** 처리한다. 0으로 나누어 무한대를 만들거나 통과시키지 않는다. 이렇게 해야 부정 케이스가 wall-clock 없이 in-suite로 단언된다(아래 참조). `design-critique-decide.js`의 `decideCritique` 분리와 같은 형태다.
  - **오라클의 소재지를 여기서 고정한다**: `judgeScaling`은 **`plugins/mccp/scripts/lib/perf-scaling.js`가 export**한다. test 파일에서 export하지 않는다 — `.test.js`를 프로덕션 모듈처럼 require하는 것은 소비 경로를 test 실행 부수효과에 묶는다. `perf-budget.test.js`는 이 모듈을 require해 쓰고, 오라클 자신의 부정 케이스는 **`plugins/mccp/scripts/lib/tests/perf-scaling.test.js`**가 소유한다. 위치는 `design-critique-decide.js`(순수 오라클) + `lib/tests/`(그 test)의 기존 배치를 그대로 따른다.
  - **`MCCP_PERF_INJECT_QUADRATIC`의 소비 지점은 `perf-budget.test.js` 안의 derive 호출 shim이다** (L2 test HIGH 지적 흡수 — 초안은 "shim 안에서"까지만 적고 그 shim이 무엇인지 말하지 않았다). 구체적으로: 이 test는 derive를 직접 호출하지 않고 지역 헬퍼 **`runDerive(fixtureRoot, n)`** 를 통해 호출하며, 그 헬퍼가 **함수 진입부에서 `process.env.MCCP_PERF_INJECT_QUADRATIC === '1'`을 읽어** 참이면 `n²`에 비례하는 바쁜 대기를 수행한 뒤 실제 derive에 위임한다. **production `derive/` 코드에는 이 스위치가 들어가지 않는다** — 프로덕션 경로에 test 전용 분기를 심는 것은 이 PRD가 복원하려는 신뢰의 반대 방향이며, §Validation의 역방향 grep이 그 경계를 기계적으로 검사한다.
  - **부정 케이스는 두 층**이다: (i) in-suite — `judgeScaling`에 합성 2차 측정치(`{n:10,ms:10},{n:100,ms:1000}`)를 직접 먹여 `ok:false`를 단언한다. wall-clock에 의존하지 않으므로 이 단언 자체는 결정적이다. (ii) 통합 — `MCCP_PERF_INJECT_QUADRATIC=1` 실행에서 test가 실제로 FAIL한다(§Validation). (i)이 오라클을, (ii)가 배선을 증명한다
- **Action (2b) `a3-instruction-cost.test.js`**: `measureA3()` 호출 5곳(`:26,70,92,131,257`)에 명시 `repoRoot`(임시 fixture)를 넘긴다. 같은 파일 `:163,185,197`이 이미 올바른 형태다.
- **Mirror**: (2a) 없음 — 저장소에 자기 정규화 성능 단언 선례가 없다. **없다고 명시하고 새로 만든다**. (2b) 같은 파일 `:163` `mkdtempSync` fixture
- **Validate**:
  - (2a) 인위적 O(n²) 지연을 주입한 derive에서 **새 단언이 실패**함을 1회 재현. 이것 없이는 "완화"와 구별되지 않는다
  - (2b) 수정 **전** 코드에서 라이브 `.claude/state/STATE.md`를 바꾸면 측정값이 바뀌고, 수정 **후**에는 불변임을 1회 재현
- **금지 (UI5)**: 예산 상수를 키우는 것 · `t.skip`으로 우회하는 것 · 단언을 지우는 것. 대체 단언은 **원 단언이 잡으려던 회귀를 여전히 잡아야** 하며 그 증명이 위 Validate다
- **범위 제한 (UI4)**: 실행기 옵션(`--test-concurrency` 등)이나 격리 구조는 건드리지 않는다. 테스트 본문만 고친다

### Task 2c: 축 A — 포착된 divergence의 원인 확정 (`session-start` exit 1)

> **계약 강제는 원인 확정을 기다리지 않는다.** 초안은 "원인 미확정이면 진단 강화만 착지"였고 L2 invariant 리뷰어가 이를 CRITICAL로 지목했다 — 그 경로는 hook이 **계약을 위반한 채로** milestone을 닫는다. 지적이 옳다. fail-open은 "어떤 경로로든 exit 0"이라는 **전칭 명제**이므로, 어느 경로가 깨뜨렸는지 몰라도 강제할 수 있다. M1의 G1이 정확히 그 형태였다. 따라서 이 Task는 **6a(계약 강제, 무조건 착지) + 6b(원인 확정, 재현 조건부)** 로 나뉜다.

- **선행**: 6b만 Task 1 harness에 의존한다. **6a는 선행 없음**
- **Action (2c-A · 무조건 착지) — 원인과 무관한 계약 강제**: `session-start.js`가 **어떤 경로로도** 비영점으로 끝나지 않게 한다.
  - 종료 직전 최종 지점(`process.on('exit')`)에서 `process.exitCode`가 0이 아니면 0으로 되돌리고 **그 사실을 loud stderr로 표면화**한다. 조용한 강제는 금지 — 이 PRD Risk 1이 "조용히 통과"가 아니라 "메시지 + 통과"로 복원을 정의했다
  - module-scope require 12개(`:23-34`)를 M1의 G1 패턴(방어 IIFE + loud 라우팅)으로 감싼다. module-scope throw는 `main().catch`(`:1100-1102`)가 **구조적으로 못 잡는** 유일한 축이며, 관측된 "exit 1 + stderr 공백"과 형태가 일치한다
  - **정당한 fail-closed 경로를 덮어쓸 위험은 없다** (L2 test 지적에 대한 실측 반증): `session-start.js` 전체에서 exit code를 대입하는 지점은 **`:1102` `process.exitCode = 0;` 단 한 곳**이다(`grep -nE "process\.exit\(|exitCode"` 결과 1행). 즉 이 hook에는 의도적으로 비영점을 세우는 경로가 애초에 존재하지 않으므로, `process.on('exit')`의 0 강제가 삼킬 수 있는 "정당한 실패 신호"가 없다. 이 사실을 test 단언으로 고정한다 — 미래에 누가 비영점 exit을 도입하면 그 단언이 먼저 깨져 사람이 판단하게 된다
- **2c-A가 2c-B의 관측면을 가리지 않게 한다** (L2 architect 지적 흡수 — 가장 날카로운 축이었다). `process.on('exit')`가 exit 1을 0으로 바꾸면 bootstrap test가 통과하고, 그 flake는 harness의 `sometimesFailing`에서 **사라진다**. 계약 강제와 원인 진단이 같은 관측면(종료 코드)을 쓰기 때문이다. 그래서 강제 경로는 **관측 가능한 흔적을 남긴다**:
  - 강제가 발동하면 stderr에 고정 marker `[mccp:session-start] FAIL-OPEN-FORCED原exit=<N>`를 쓴다(`原exit`은 덮이기 전 값).
  - `runSessionStart`가 자식 stderr에서 그 marker를 파싱해 결과 객체에 싣고, **정상 경로 test들은 marker 부재를 단언**한다. 즉 강제가 발동한 실행은 여전히 **test 실패로 나타나며** harness의 `sometimesFailing`에 잡힌다.
  - 결과적으로 프로덕션에서는 사용자가 막히지 않고(exit 0), 테스트에서는 그 사건이 계속 보인다. 두 요구가 종료 코드 하나를 공유하지 않게 **신호를 분리**한 것이다.
- **Action (2c-B · 재현 조건부) — 원인 확정**: harness로 재현되면 원인을 지목하고 그 경로를 직접 고친다. 착수 순서: (1) 발화 실행의 TAP + 자식 stderr 보존 → (2) `runSessionStart`가 `r.signal` · `r.error` · 종료 코드 출처를 assertion 메시지에 싣게 한다(**현재 `stderr=`만 찍어 빈 문자열을 보여준 것이 진단을 막았다**) → (3) 지목된 경로 수정
- **Mirror**: M1의 G1 복원 — `hooks/receipt-prompt.js:27-30` 방어 IIFE + `hooks/receipt-skill.js:58-74` `g1Allow` loud 라우팅
- **Validate**: 아래 2c-A · 2c-B 두 항을 **모두** 만족해야 한다. 2c-A는 무조건, 2c-B는 재현 시.
- **Validate (2c-A · 부정 케이스 필수)**: 모듈 하나를 지운 broken fixture root로 `session-start.js`를 spawn해 **수정 전 exit 1 → 수정 후 exit 0 + stderr에 메시지**를 A/B로 확인한다. `g1-patch.test.js`의 fixture 기법을 그대로 쓴다. 이 재현은 관측된 flake와 **독립**이므로 flake가 안 잡혀도 성립한다
- **신규 test의 이름을 여기서 확정한다** (L2 invariant "존재하지 않는 test를 Acceptance가 참조한다" 지적 흡수). 현재 `session-start-bootstrap.test.js`의 test는 6건(`:40,46,60,77,92,101`)이고 그중 어느 것도 broken-module 축을 다루지 않는다 — 실측 확인. Task 2c는 다음 이름의 test **2건을 신규 추가**한다:
  - `session-start exits 0 with a loud message when a module-scope require is broken (fail-open contract)`
  - `session-start.js declares exactly one exit-code assignment (fail-open contract has no legitimate non-zero path)`
  §Validation의 `--test-name-pattern`은 두 이름이 공유하는 리터럴 `fail-open contract`를 쓴다. 그 패턴이 0건을 매칭하면 **Task 2c가 미완인 것**이며, 그 사실이 명령 출력으로 드러난다
- **이름 매칭만으로는 stub을 못 거른다 — 그래서 A/B를 기계화한다** (L2 test HIGH 지적 흡수). `test('fail-open contract …', () => {})` 빈 stub도 개수 검사를 통과한다는 지적이 옳다. 두 test는 **spawn 대상 스크립트 경로를 주입받는다**. 소비 지점을 여기서 고정한다(L2 test CRITICAL 지적 흡수 — 초안은 "신규 env가 그 통로다"까지만 적고 누가 읽는지 말하지 않았다): 현재 `plugins/mccp/scripts/hooks/tests/session-start-bootstrap.test.js:18`이 `const SESSION_START = path.resolve(__dirname, '..', 'session-start.js')`로 **하드코딩**하고 있으므로, 그 상수를 **`process.env.MCCP_TEST_SESSION_START_PATH || path.resolve(__dirname, '..', 'session-start.js')`** 로 바꾼다. 즉 읽는 주체는 `runSessionStart`가 쓰는 그 경로 상수이고, env 미설정 시 동작은 **현행과 완전히 동일**하다(기존 6개 test 무영향). 그러면 §Validation이 `git show HEAD:…/session-start.js`를 임시 경로에 꺼내 **수정 전 코드에 대고 같은 두 test를 돌릴 수 있고, 그때 반드시 FAIL해야 한다**. 수정 전에도 pass하면 그 test는 계약을 단언하지 않는 stub이며, 그 판정이 명령 exit code로 나온다
- **두 번째 test(exit-code 대입 1곳)의 소유자도 이 파일이다** (L2 test MEDIUM 지적 흡수 — 초안은 Acceptance에만 적고 어느 test가 소유하는지 말하지 않았다). 이 test는 `session-start.js` 원문을 읽어 `process.exitCode` 대입과 `process.exit(` 호출을 세고, **0이 아닌 값을 세우는 지점이 0건**임을 단언한다
- **Validate (2c-B)**: 재현된 조건에서 수정 전/후 exit 코드 A/B + harness 재실행에서 `sometimesFailing` 비움
- **2c-B 재현 실패 시 (명시 경로)**: 원인을 추정으로 채우지 **않는다**. 미확정 사실과 관측 횟수를 report에 남기고 **PRD Open Questions에 미해소 항목으로 승계**한다. 단 2c-A는 착지했으므로 **계약 위반 자체는 남지 않는다** — 이것이 초안과의 결정적 차이다
- **금지 (UI4·UI5)**: 재시도(retry)로 green을 만드는 것 · 이 테스트만 직렬 실행하도록 격리하는 것 · exit code를 조용히 0으로 덮는 것

### Task 3: 축 A — 잔여 timing 단언 3건 측정 판정

- **Action**: OQ4의 "측정으로 판정할 잔여 3건"을 Task 1 harness N회 결과와 대조한다. `sometimesFailing`에 등장하지 **않으면 손대지 않고** report에 목록만 남긴다. 등장하면 Task 2와 같은 원칙(자기 정규화 + 부정 케이스 증명)으로 교정한다
- **Mirror**: Task 2a
- **Validate**: report에 3건 각각의 판정(변경/무변경)과 근거 실측이 남는다
- **금지**: 흔들린 적 없는 단언을 "안전하게" 완화하는 것 — 근거 없는 신호 약화다

### Task 4: 축 B — 도달 가능성 오라클

- **Action**: `plugins/mccp/scripts/lib/codex-reachability.js`가 **`classify`라는 이름의 순수 함수 하나를 export**한다(L2 architect 지적 흡수 — 초안은 함수명을 Action에 적지 않아 프로덕션 인터페이스가 Validation 코드로만 암묵 정의됐다). 시그니처는 `classify({env, invokeResult, registryProbe})` → `{reachable, kind, reason}`. `kind` enum: `env-policy` · `not-installed` · `unauthenticated` · `transport` · `reached`.
  - **`registryProbe`는 선택 인자다** (L2 architect HIGH 지적 흡수 — 3개 입력을 적어 놓고 Validation은 2개만 넘겨 필수/선택/미사용이 불명이었다). 판정 순서가 `env` → `invokeResult`이고 그 둘만으로 모든 `kind`가 결정되므로, `registryProbe` **부재는 정상 경로**이며 오라클은 그것으로 인해 다른 답을 내지 않는다. 존재할 때만 `not-installed`를 **호출 이전에** 앞당겨 판정하는 데 쓰인다(정적 조건이라 spawn 없이 알 수 있다). 즉 이 인자는 *같은 답을 더 일찍* 주는 용도이지 답을 바꾸는 축이 아니며, 그 성질을 test가 단언한다 — 같은 입력에 `registryProbe` 유무만 달리해 `{reachable, kind}`가 동일함을 확인한다.
  - `env.MCCP_CODEX_DISABLED === '1'` → `{reachable:false, kind:'env-policy'}` — **현재 누락된 단 하나의 축**
  - `classification`이 `disabled` / `registry-*` / `plugin-not-installed` / `install-path-stale` / `companion-*` / `not-authenticated` / `timeout` / `spawn-enoent` / `exit-nonzero` / `stdout-empty` → 도달 불가 + 대응 `kind`
  - `classification === 'ok'` → `{reachable:true, kind:'reached'}`
- **Mirror**: `codex-invoke.js:14-22`의 enum 주석 헤더 — 이름을 그대로 쓰고 새 이름을 만들지 않는다
- **precedence를 명시한다 — env policy가 classification보다 우선한다** (L2 security HIGH 지적 흡수). 초안의 (a)/(b)는 우선순위를 규정하지 않아 충돌 시 동작이 미정이었다. 규칙은 하나다: **`env.MCCP_CODEX_DISABLED === '1'`이면 `invokeResult`가 무엇이든 `{reachable:false, kind:'env-policy'}`**. `codex-invoke.js:182-192`상 이 env에서는 실제로 `classification='disabled'`가 오지만, **오라클은 그 사실에 의존하지 않는다** — env가 켜져 있다는 것은 companion이 spawn되지 않았다는 뜻이고, 그 판정은 하위 계층의 정직성과 무관하게 성립해야 한다(방어적 중복, fail-closed).
- **Validate**: `codex-reachability.test.js`가 부정 케이스를 단언한다.
  - (a) `env.MCCP_CODEX_DISABLED='1'` + `invokeResult={ok:true, classification:'ok'}` → `reachable=false, kind='env-policy'`. **실재하지 않는 조합을 일부러 넣는 것**이며, 그것이 precedence 규칙을 단언하는 유일한 방법이다
  - (b) `env.MCCP_CODEX_DISABLED` **미설정** + `classification='ok'` → `reachable=true, kind='reached'`
  - (c) `env` 미설정 + `classification='totally-new-enum'`(표 밖) → `reachable=false, kind='transport'` (fail-closed)
  - (d) **14종 enum 전수 커버리지** (L2 test MEDIUM 지적 흡수 — 초안은 3케이스만 두어 `registry-missing`·`companion-version-mismatch` 등이 도달 성공으로 잘못 매핑돼도 잡지 못했다): `codex-invoke.js:14-22` 주석 헤더의 **14개 값을 배열로 열거한 table-driven test**를 둔다. `'ok'`만 `reachable=true`이고 **나머지 13개는 전부 `reachable=false`**이며 각자 위 `kind` 표의 값을 갖는다. 열거 배열은 주석 헤더와 1:1이어야 하고, 개수가 14가 아니면 test가 먼저 실패한다 — enum이 늘어났는데 오라클이 모르는 상태를 그 단언이 잡는다
- **주의**: `codex-invoke.js`의 14종 enum과 **표를 벗어난 값**이 오면 오라클은 `reachable=false`로 fail-closed 처리하되 `kind='transport'`로 표시한다. 미지의 값을 도달 성공으로 읽으면 안 된다

### Task 5: 축 B — 스모크 테스트의 skip 사유 정직화

- **Action**: `codex-companion-smoke.test.js`의 `shouldSkip()`(`:33-51`)을 Task 4 오라클 호출로 대체한다. 정적 조건(registry 존재 등)은 `registryProbe`로 넘기고, 호출 후 결과는 `invokeResult`로 넘긴다. skip 메시지는 오라클의 `reason`을 그대로 쓴다.
  - 호출 **후** 도달 성공(`reached`)인데 stdout이 JSON이 아니면 → 현행 유지(contract-drift skip). 그 사유는 이미 참이다 (UI3)
- **Mirror**: 같은 파일의 기존 `t.skip('smoke skipped: ' + reason)` 형태
- **Validate**: skip은 유지되되 사유가 `env-policy` 계열로 바뀐다. A/B 대조를 report에 남긴다.
- **env를 전역 상태에 의존하지 않는다** (L2 test HIGH 지적 흡수 — 초안의 "현재 환경 그대로"는 `MCCP_CODEX_DISABLED`가 이미 전역에 설정돼 있음을 가정했고, 그 가정이 깨진 사용자에게는 Validation이 다른 것을 재게 된다). §Validation은 그 명령에 **`MCCP_CODEX_DISABLED=1`을 인라인으로 명시**해 전역 설정 여부와 무관하게 같은 조건을 만든다. 반대편(미설정) 경로는 실제 spawn 비용 없이 **Task 4 오라클의 table-driven test**가 덮는다 — 그 test는 `process.env`가 아니라 주입된 `env` 객체를 읽으므로 애초에 전역 상태와 무관하다.
- **A/B를 실행 가능한 문자열 단언으로 고정한다** (L2 test MEDIUM 지적 흡수 — 초안의 `grep -a "SKIP"`은 skip의 *존재*만 보고 *사유*를 보지 않았다). Task 0에서 **수정 전 skip 사유 원문을 캡처해 report에 봉인**하고(현재 값: `real codex --json contract appears to be non-JSON; v0.2.4 followup`), Task 5 이후 §Validation이 같은 명령의 SKIP 줄에 대해 **(i) `non-JSON`이 없을 것 · (ii) `env-policy`가 있을 것** 두 조건을 동시에 요구한다. 둘 중 하나라도 어긋나면 비영점 exit
- **불변식 (UI5)**: 전수 실행의 `skipped` 수가 **6에서 늘지 않는다**. 이 축은 skip의 *사유*를 고치는 것이지 skip을 늘리는 것이 아니며, 늘어났다면 그것이 "skip으로 green 만들기"의 신호다

### Task 6: 축 C — 승인된 격리 helper (사용자 지시로 범위 포함)

- **Action (6a)**: `plugins/mccp/scripts/receipt/store.js`에 `quarantineReceipt(receiptFilePath, suffix)`를 추가한다. 파일 부재 시 no-op, 존재 시 `<path>.invalid-<suffix>`로 rename, 결과를 객체로 반환(throw 안 함 — 호출부의 FATAL 메시지 계약 보존).
  - **`suffix`를 helper 경계에서 직접 검증한다** (L2 security 지적 흡수). 현재 `plan-codex-runner.js:55`의 `SAFE_TOKEN_RE`는 **호출부에만** 있어, `store.js`가 승인 writer로 다른 호출자에게 노출되는 순간 검증 없는 경로가 열린다. 신뢰 경계는 helper 자신이어야 한다 — 호출부 검증은 helper 검증을 대체하지 못한다. 위반 시 rename하지 않고 실패를 반환한다(fail-closed).
  - `receiptFilePath`도 `receiptsDir(repoRoot)` 하위임을 확인한다. 승인 writer가 임의 경로를 rename하는 primitive가 되면 안 된다.
  - **검사 대상은 source와 destination 둘 다다** (L2 security MEDIUM 지적 흡수 — 초안의 "target"이 단수형이라 어느 쪽인지 모호했다). `receiptFilePath`(source)와 `<path>.invalid-<suffix>`(destination) **양쪽 모두** 아래 봉쇄 검사를 통과해야 rename한다. suffix 검증이 destination을 이미 좁히지만, 두 검사는 서로를 대체하지 않는다 — source가 봉쇄 밖이면 destination도 밖이고, suffix가 안전해도 source가 심볼릭 링크면 destination이 밖으로 나간다.
  - **봉쇄 검사의 알고리즘을 여기서 고정한다** (L2 security MEDIUM 지적 흡수 — 초안은 "하위임을 확인"만 적어 `startsWith` 같은 순진한 구현을 허용했다). 순서는 (1) 양쪽을 `path.resolve`로 절대화 → (2) `path.relative(receiptsDir, target)`이 **빈 문자열이 아니고, `..`로 시작하지 않으며, `path.isAbsolute`가 아님**을 요구 → (3) **부모 디렉토리를 `fs.realpathSync`로 해소한 뒤 (2)를 재검사**한다. (2)만으로는 `receipts/` 안의 symlink가 밖을 가리키는 경우를 통과시키고, 대상 파일 자신은 rename 대상이라 `realpath`를 걸 수 없으므로 **부모 기준**이다. `store.js:25-36`이 이 저장소가 TOCTOU·`O_NOFOLLOW`를 이미 의식하고 있음을 보여주므로, 문자열 비교 수준의 구현은 이 계층의 기존 수준에 못 미친다.
- **Action (6b)**: `plan-codex-runner.js`의 `quarantineReceipt`(`:241-255`)가 `fs.renameSync(receiptPath, dest)` 대신 store helper에 위임하게 한다. 지역 변수 `receiptPath`가 **write 동사와 같은 줄에 남지 않게** 한다 — 그 결합이 `WRITE_CALL_RE`의 발화 조건이다.
  - **호출부는 반환값을 반드시 검사한다** (L2 invariant MEDIUM 지적 흡수 — 가장 날카로운 축이었다). helper는 throw하지 않고 결과 객체를 돌려주므로(호출부의 FATAL 메시지 계약을 보존하기 위해), **반환값을 무시하면 격리 실패가 조용히 지나간다** — 그리고 lint는 여전히 통과한다. 즉 "위임했다"가 "격리됐다"를 의미하지 않게 되는 fail-open drift다. 따라서 위임 후 `result.ok`가 거짓이면 기존과 **동일한 FATAL stderr 메시지**(`could not quarantine the mis-sealed receipt at … Remove it by hand before re-running`)를 내보내고, 실패 사유를 그 메시지에 싣는다. 성공/실패 어느 쪽도 throw하지 않는 현행 계약은 유지한다.
  - 이 요구는 **관측으로 단언한다**: 위임 관측 test가 helper stub을 `{ok:false, reason:'…'}`로 만들었을 때 runner가 FATAL 메시지를 stderr에 낸다는 것까지 확인한다. 호출 여부만 보는 단언은 이 결함을 통과시킨다.
- **Action (6c · UI9)**: `b2-coverage-gate.js`의 `MUTATION_ENTRYPOINTS`(`:53-57`)에 `{ file: 'plugins/mccp/scripts/receipt/store.js', fn: 'quarantineReceipt' }` **1행을 추가한다**. 승인 writer 면제가 파일 단위(`:324`)이므로, 레지스트리 등록이 그 면제 아래 들어간 새 mutating 함수를 책임지게 하는 유일한 보완 통제다(위 OQ-C 참조). 이 파일에서 그 외 어느 줄도 건드리지 않는다.
- **Mirror**: `store.js:170` `writeReceipt`의 facade 형태 · runner의 기존 stderr 메시지(무변경 유지) · 레지스트리 기존 3행의 형태
- **봉쇄 판정을 직접 test할 수 있게 분리해 export한다** (L2 test HIGH 지적 흡수 — 초안은 stub 관측으로만 검증해, `realpathSync` 로직에 버그가 있어도 stub이 통과하면 잡히지 않았다). `store.js`가 순수 술어 **`isWithinReceiptsDir(repoRoot, candidatePath)` → boolean**을 함께 export하고, `quarantineReceipt`는 source·destination 양쪽에 그것을 호출한다. 술어가 export되면 알고리즘 자체를 직접 단언할 수 있다.
- **Validate**: `store-quarantine.test.js` — 정상 경로(격리 후 원 경로 부재 + `.invalid-<suffix>` 존재) · 부재 파일 no-op · **부정 케이스 3종**: `suffix`에 path separator(`../`, `/`, `\`) · `suffix`에 NUL/제어문자 · `receiptFilePath`가 `receiptsDir` 밖 → 셋 다 rename 미수행 + 실패 반환
- **Validate (봉쇄 술어 직접)**: `isWithinReceiptsDir`를 stub 없이 직접 호출해 단언한다 — (a) `receiptsDir` 하위 정상 경로 → `true`, (b) `..`로 탈출하는 경로 → `false`, (c) **`receiptsDir` 안에 만든 symlink가 바깥 디렉토리를 가리킬 때 그 하위 경로 → `false`**. (c)가 `realpathSync` 부모 재검사를 실제로 검증하는 유일한 케이스이며, 문자열 비교 구현은 여기서 통과하지 못한다. symlink 생성이 불가한 환경(권한 없는 Windows)에서는 `t.skip`하되 **사유를 그 환경 조건으로 명시**한다 — 이 축은 skip 사유가 참이어야 하는 것이 milestone 주제 자체다
- **핵심 검증 — 이름 기반 grep을 쓰지 않는다** (L2 test "변수명만 바꿔도 통과한다" 지적 흡수). 초안의 `grep … [^)]*receipt` 는 `receiptPath`를 `p`로 바꾸기만 해도 통과하고, 이 파일에는 정당한 fs write가 7곳 더 있어(`:69,77,78,108,136,147,557,558` — 실측) "fs 호출 0건" 형태의 검사도 성립하지 않는다. 대신 세 축을 **동시에** 요구한다.
  1. **(1급)** runner의 `quarantineReceipt` 본문이 store helper를 **실제로 호출**함을 test가 단언한다 — helper를 stub해 호출 여부와 인자를 **관측**한다. 정적 문자열 검사가 아니므로 변수명·주석·래핑 어느 것으로도 만족시킬 수 없다
  2. **(보조)** `plan-codex-runner.js`의 `fs.renameSync(` 호출부가 **2 → 1**로 줄고, 남는 1건이 marker용 atomic write helper(`:78` `fs.renameSync(tmp, file)`)임. **이 검사의 한계를 명시한다**(L2 test MEDIUM 지적 흡수): `grep`은 문자열 매칭이라 주석 속 `renameSync`나 `renameSync_backup` 같은 이름이 개수를 오염시킬 수 있다. 그래서 패턴을 `fs\.renameSync\s*\(` 호출 형태로 좁히고 매칭 줄을 **출력해 눈으로 확인**하되, **판정 권한은 1급인 (1)과 `b2-coverage-gate.test.js` 2건에 둔다**. (2)는 회귀 조기 경보이지 합격 판정자가 아니다
  3. `git diff -- …/b2-coverage-gate.js` 가 **레지스트리 1행 추가만** 담고, `APPROVED_WRITERS` · `APPROVED_PREFIXES` · `WRITE_CALL_RE` · `ANY_WRITE_CALL_RE` 는 무변경
  이 셋이 모두 성립한 채로 `b2-coverage-gate.test.js` 2건이 pass한다.
- **금지 (UI6)**: `APPROVED_WRITERS` / `APPROVED_PREFIXES` / lint 정규식 **어느 것도** 고치지 않는다. `MUTATION_ENTRYPOINTS`는 UI9가 허용한 **1행 추가만** 예외이며, 기존 3행의 수정·삭제는 여전히 금지다

### Task 7: 회귀 대조 + 릴리스

- **Action**: 수정 전후 전수 실행을 동일 조건으로 대조하고, `plugin.json` 1.23.7 → 1.23.8, footer 2면(`html.js:1419` · `markdown.js:163`) 동기, CHANGELOG(forward-only), PRD Milestone 2 행을 `complete`로 갱신한다.
- **Mirror**: CLAUDE.md §3.7 milestone PR 의무 체크리스트 · §3.7 병렬 브랜치 forward-only 상향
- **Validate**: 아래 Validation 블록 전부
- **주의**: 활성 worktree가 4개 더 있다(`codex-intent-context` · `diverse-agent-review-m2` · `v1.24.0-multi-session-m5` · `verify-main-baseline`). §3.7상 version 충돌이 이 저장소에서 4회 재발했으므로 PR 직전 `origin/main` 재확인이 의무다

## Validation

> **부정 케이스 명령이 여기 없으면 그 Task는 검증되지 않은 것이다.** L2 test 리뷰어가 HIGH 4건으로 지목한 것이 이 결함이다 — Task 본문은 A/B 재현을 요구하는데 Validation은 `node --test <file>`만 적어, "대체 단언이 원래 잡던 회귀를 여전히 잡는가"가 **실행 가능한 형태로 존재하지 않았다**. 아래 `[NEG]` 블록이 그 대응이며, 각 블록은 **비영점 exit(=단언이 발화)** 를 기대한다.

### 이 절의 실행 시점 계약 — forward reference는 결함이 아니라 산출물 목록이다

L2 두 라운드가 반복해서 CRITICAL로 지목한 것이 이 절의 명령들이 **오늘 실행되지 않는다**는 사실이다. 그 관찰 자체는 참이며 여기 계약으로 못박는다. plan은 무엇을 만들고 무엇으로 검증할지를 규정하고, 그 파일들의 생성은 `/mccp:prp-implement`가 소유한다 — 이 경계는 `/mccp:plan` → `/mccp:prp-implement` 분리 자체의 전제다. 이 기준을 완화 요구로 읽으면 안 되는 이유는 반대 방향에 있다: **명령이 실행 불가 상태로 남으면 그것이 해당 Task 미완의 기계적 증거**이고, 그래서 아래 표가 "누가 이 전제를 만드는가"를 1:1로 고정한다.

| 아래 명령이 요구하는 전제 | 만드는 Task | 오늘 상태 (실측) | 부재 시 의미 |
|---|---|---|---|
| `lib/suite-determinism.js` + `diffRuns` export | Task 1 | 없음 | Task 1 미완 |
| `lib/tests/suite-determinism.test.js` | Task 1 | 없음 | Task 1 미완 |
| `lib/perf-scaling.js` + `judgeScaling` export | Task 2a | 없음 | Task 2a 미완 |
| `lib/tests/perf-scaling.test.js` | Task 2a | 없음 | Task 2a 미완 |
| `store.js`의 `isWithinReceiptsDir` export | Task 6a | 없음 | Task 6a 미완 — 봉쇄 알고리즘 직접 검증 불가 |
| `MCCP_PERF_INJECT_QUADRATIC` 주입 스위치 (**소비처: `perf-budget.test.js` 자신**) | Task 2a | 없음(`grep -rn` 0건) | Task 2a 미완 — 대체 단언이 완화인지 대체인지 판별 불가 |
| `fail-open contract` 이름의 test 2건 | Task 2c | 없음(현 6건 `:40,46,60,77,92,101`) | Task 2c 미완 |
| `MCCP_TEST_SESSION_START_PATH` spawn 경로 주입 | Task 2c | 없음 | Task 2c 미완 — stub 방지 A/B 불가 |
| `lib/codex-reachability.js` + `classify` export | Task 4 | 없음 | Task 4 미완 |
| `lib/tests/codex-reachability.test.js` | Task 4 | 없음 | Task 4 미완 |
| `receipt/tests/store-quarantine.test.js` | Task 6a | 없음 | Task 6a 미완 |
| `quarantine.*delegat` 이름의 runner test | Task 6b | 없음 | Task 6b 미완 |
| `MUTATION_ENTRYPOINTS`의 `quarantineReceipt` 행 | Task 6c | 없음(현 3행 `:53-57`) | Task 6c 미완 |

**오늘 이미 실행 가능한 것**은 baseline 측정(`node --test`, Task 0) · 기존 test 파일 실행 · `git diff` 검사 · `renameSync` 호출부 검사다. 즉 이 절은 전부가 미래형이 아니라, **오늘 실행되는 축이 baseline을 고정하고 미래형 축이 델타를 검증하는** 2층 구조다.

**부정 케이스의 1급 소재지는 스위트다** (L2 invariant HIGH 지적 흡수). 초안은 `[NEG]`를 전부 bash 스니펫에 두었고, 리뷰어는 그것이 `node --test` 게이트 밖이라 "자동 탐지"가 "문서화된 의도"로 약화된다고 지적했다. 옳다. 그래서 각 부정 케이스를 **순수 오라클 + in-suite 단언**으로 먼저 두고, bash는 오라클로 표현할 수 없는 **통합 재현만** 남긴다.

| 부정 케이스 | in-suite 단언 (1급, `node --test` 게이트 안) | bash 통합 재현 (보조) |
|---|---|---|
| divergence 검출 | `suite-determinism.test.js` — 합성 TAP → `stable:false` | 없음(오라클로 충분) |
| 성능 회귀 검출 | `perf-budget.test.js` — `judgeScaling`에 합성 2차 측정치 → `ok:false` | `MCCP_PERF_INJECT_QUADRATIC=1` 실행 FAIL(배선 증명) |
| fail-open 계약 | `session-start-bootstrap.test.js` 2건(broken fixture · exit-code 대입 0건) | 수정 전 스크립트 대상 A/B(**stub 방지**) |
| 도달 가능성 fail-closed | `codex-reachability.test.js` (a)(b)(c) 3케이스 | skip 사유 문자열 A/B |
| 격리 helper 경계 | `store-quarantine.test.js` 부정 3종 + runner 위임 관측 | `git diff` 상한 검사 |

**경계 — 이 절이 소유하지 않는 것.** 이 표가 닫지 못하는 것이 하나 남는다: **implement가 이 명령들을 실제로 돌렸는지를 강제하는 기계**가 plan에는 없다. 그것은 plan 문서의 결함이 아니라 **소유권의 위치**다 — 실행 강제는 `/mccp:prp-implement`의 validation loop과 `mccp-implement-codex` receipt가 소유하며, plan은 *무엇을 돌려야 하는가*를 규정하는 데서 범위가 끝난다. 이 문서가 그 이상을 주장하면 그것이야말로 이 PRD가 지목한 "통과 신호의 존재가 검사를 의미하지 않는다"의 재생산이다. `mccp-implement-codex` receipt는 report의 Acceptance 체크에 anchoring될 뿐, 개별 `[NEG]`의 exit code를 게이트하지 않는다. 이것은 plan 문서의 권한 밖이며(게이트 강제는 `/mccp:prp-implement` 커맨드 본문이 소유한다), **해소했다고 주장하지 않는다**. 완화는 두 가지다 — (i) 부정 케이스를 위 표대로 스위트 안으로 옮겼으므로 전수 실행 한 번이 대부분을 강제하고, (ii) 남은 통합 재현 3건은 report에 출력 원문을 싣는 것을 Acceptance 항목으로 둔다.

```bash
# ── 전제 점검 (선행) — "파일 없음"과 "단언 실패"를 구분한다 ───────────
# L2 test MEDIUM 흡수: 아래 블록들은 미존재 파일을 require하므로, Task가
# 미완이면 `Cannot find module`로 죽는다. 그것은 회귀가 아니라 미완이며,
# 두 실패를 같은 종료 코드로 뭉개면 원인 진단이 막힌다. 먼저 전제를 세고
# 무엇이 없는지 이름으로 보고한 뒤, 하나라도 없으면 여기서 멈춘다.
MISSING=0
for f in \
  plugins/mccp/scripts/lib/suite-determinism.js \
  plugins/mccp/scripts/lib/tests/suite-determinism.test.js \
  plugins/mccp/scripts/lib/perf-scaling.js \
  plugins/mccp/scripts/lib/tests/perf-scaling.test.js \
  plugins/mccp/scripts/lib/codex-reachability.js \
  plugins/mccp/scripts/lib/tests/codex-reachability.test.js \
  plugins/mccp/scripts/receipt/tests/store-quarantine.test.js ; do
  [ -f "$f" ] || { echo "[TASK-INCOMPLETE] 전제 파일 없음: $f"; MISSING=$((MISSING+1)); }
done
grep -rqn "MCCP_PERF_INJECT_QUADRATIC" plugins/mccp/scripts/derive/tests/perf-budget.test.js \
  || { echo "[TASK-INCOMPLETE] 주입 스위치 미배선: perf-budget.test.js"; MISSING=$((MISSING+1)); }
grep -rqn "MCCP_TEST_SESSION_START_PATH" plugins/mccp/scripts/hooks/tests/session-start-bootstrap.test.js \
  || { echo "[TASK-INCOMPLETE] spawn 경로 주입 미배선: session-start-bootstrap.test.js"; MISSING=$((MISSING+1)); }
# 문자열 존재로는 부족하다 — 주석이나 깨진 구문에도 걸린다(L2 test MEDIUM 흡수).
# 모듈을 실제로 로드해 레지스트리 배열의 원소인지를 구조로 확인한다.
node -e '
  const g=require("./plugins/mccp/scripts/lib/msw-metrics/b2-coverage-gate.js");
  const hit=(g.MUTATION_ENTRYPOINTS||[]).some(e=>e && e.fn==="quarantineReceipt"
    && /receipt\/store\.js$/.test(String(e.file)));
  process.exit(hit?0:1);
' 2>/dev/null \
  || { echo "[TASK-INCOMPLETE] MUTATION_ENTRYPOINTS에 store.js#quarantineReceipt 항목이 없다(구조 검사)"; MISSING=$((MISSING+1)); }
# 봉인 baseline TAP — "기계적 방어"라 적었으면 기계가 있어야 한다(L2 invariant 흡수).
BASE_TAP=.claude/PRPs/reports/gate-guard-integrity-m2-baseline.tap
[ -s "$BASE_TAP" ] \
  || { echo "[TASK-INCOMPLETE] 봉인 baseline TAP 부재: $BASE_TAP"; MISSING=$((MISSING+1)); }
REPORT=.claude/PRPs/reports/gate-guard-integrity-m2-report.md
if [ -s "$BASE_TAP" ]; then
  # (a) 형식 — 헤더 존재만으로는 부족하다. 값이 정수로 파싱돼야 델타의 피감수가 된다.
  for h in tests pass fail; do
    grep -aqE "^# $h [0-9]+$" "$BASE_TAP" \
      || { echo "[FAIL] 봉인 TAP의 '# $h' 가 없거나 정수가 아니다 — 델타 계산 불가"; MISSING=$((MISSING+1)); }
  done

  # (b) seal 줄은 정확히 1개. 여러 개면 head -1 이 조용히 옛 해시를 취해
  #     재봉인이 일어났는데도 통과하는 창이 생긴다(L2 invariant MEDIUM 흡수).
  NSEAL=$(grep -acE "baseline\.tap sha256: [0-9a-f]{64}" "$REPORT" 2>/dev/null || echo 0)
  [ "${NSEAL:-0}" = "1" ] \
    || { echo "[FAIL] report의 baseline seal 줄이 ${NSEAL}개 — 정확히 1개여야 한다"; MISSING=$((MISSING+1)); }

  # (c) 변조 — working tree 의 TAP 이 봉인 해시와 일치하는가(보조 축).
  SEALED=$(grep -aoE "baseline\.tap sha256: [0-9a-f]{64}" "$REPORT" 2>/dev/null | head -1 | awk '{print $NF}')
  ACTUAL=$(node -e 'const c=require("crypto"),f=require("fs");process.stdout.write(c.createHash("sha256").update(f.readFileSync(process.argv[1])).digest("hex"))' "$BASE_TAP")
  [ -n "$SEALED" ] || { echo "[TASK-INCOMPLETE] report에 'baseline.tap sha256: <hex>' 봉인 줄이 없다"; MISSING=$((MISSING+1)); }
  [ -z "$SEALED" ] || [ "$SEALED" = "$ACTUAL" ] \
    || { echo "[FAIL] baseline TAP이 봉인 이후 변경됨 (sealed=$SEALED actual=$ACTUAL)"; MISSING=$((MISSING+1)); }

  # (d) **순서** — 위 (c)는 일치만 증명한다. "Task 1~7 착수 전에 측정했다"는
  #     시간 속성이므로 커밋 이력으로만 증명된다(L2 invariant HIGH ×4 흡수).
  #     Task 1~7을 먼저 돌리고 나중에 baseline 을 써도 (c)는 통과하기 때문이다.
  BASE_COMMITS=$(git log --format=%H -- "$BASE_TAP" | wc -l)
  [ "${BASE_COMMITS:-0}" = "1" ] \
    || { echo "[FAIL] baseline TAP을 건드린 커밋이 ${BASE_COMMITS}개 — 측정은 한 번뿐이어야 한다(재측정 흔적)"; MISSING=$((MISSING+1)); }
  BASE_COMMIT=$(git log --format=%H --diff-filter=A -- "$BASE_TAP" | tail -1)
  TASK_COMMIT=$(git log --format=%H --diff-filter=A -- plugins/mccp/scripts/lib/suite-determinism.js | tail -1)
  if [ -n "$BASE_COMMIT" ] && [ -n "$TASK_COMMIT" ]; then
    git merge-base --is-ancestor "$BASE_COMMIT" "$TASK_COMMIT" \
      && echo "[OK] 봉인 커밋이 Task 1 산출물 커밋의 조상 — 순서 증명됨" \
      || { echo "[FAIL] 봉인이 Task 산출물보다 뒤에 왔다 — baseline이 착수 후 상태를 쟀다"; MISSING=$((MISSING+1)); }
  else
    echo "[TASK-INCOMPLETE] 봉인/Task 산출물 커밋을 찾을 수 없어 순서를 증명할 수 없다"; MISSING=$((MISSING+1))
  fi
fi
# 주입 스위치의 역방향 격리 — production derive/ 로 새지 않았는가(L2 invariant 흡수).
LEAK=$(grep -rl "MCCP_PERF_INJECT_QUADRATIC" plugins/mccp/scripts/derive/ 2>/dev/null | grep -v "/tests/" | wc -l)
[ "${LEAK:-0}" = "0" ] \
  || { echo "[FAIL] 주입 스위치가 production derive/ 로 누출됨($LEAK 파일) — test 전용 계약 위반"; MISSING=$((MISSING+1)); }
[ "$MISSING" = "0" ] || { echo "전제 $MISSING건 미충족 — 이는 회귀가 아니라 Task 미완이다."; exit 1; }
echo "[OK] 전제 전부 충족 — 아래 실패는 단언 실패로 읽는다"

# ── 축 A: 결정성 harness ─────────────────────────────────────────────
# runs=10. 관측된 flake는 4회 중 1회(p≈0.25)이므로 3회로는 놓칠 확률이
# (1-0.25)^3 ≈ 42%다. 10회면 미포착 확률 (0.75)^10 ≈ 5.6%. 이 산술을
# report에 그대로 적는다 — "안정적"이 아니라 "N회에서 미관측"이 결론이다.
node plugins/mccp/scripts/lib/suite-determinism.js --runs 10 --json
node --test plugins/mccp/scripts/lib/tests/suite-determinism.test.js

# [NEG] harness가 divergence를 실제로 잡는가 — 합성 TAP 2개(실패 집합 상이)를
#       diffRuns에 직접 먹여 stable=false + sometimesFailing 비지 않음을 요구
#       4필드를 전부 단언한다 — 2개만 보면 나머지가 누락/오류여도 통과한다(L2 test 흡수).
node -e '
  const {diffRuns}=require("./plugins/mccp/scripts/lib/suite-determinism");
  const r=diffRuns([
    {pass:10,fail:1,failing:["t-always"]},
    {pass:9,fail:2,failing:["t-always","t-x"]}
  ]);
  const eq=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
  const bad=[];
  if(r.stable) bad.push("stable should be false");
  if(!eq(r.sometimesFailing,["t-x"])) bad.push("sometimesFailing="+JSON.stringify(r.sometimesFailing));
  if(!eq(r.alwaysFailing,["t-always"])) bad.push("alwaysFailing="+JSON.stringify(r.alwaysFailing));
  if(!eq(r.unionFailing,["t-always","t-x"])) bad.push("unionFailing="+JSON.stringify(r.unionFailing));
  if(bad.length){console.error(bad.join(" | "));process.exit(1);}
  console.log("[NEG-OK] diffRuns 4필드 전부 정확: stable/union/always/sometimes");
'

# ── 축 A: 결합 메커니즘 (Task 2a / 2b) ───────────────────────────────
node --test plugins/mccp/scripts/derive/tests/perf-budget.test.js
node --test plugins/mccp/scripts/lib/tests/a3-instruction-cost.test.js

# [NEG] 2a — 주입된 O(n^2) 회귀에서 새 단언이 FAIL해야 한다.
#       MCCP_PERF_INJECT_QUADRATIC 은 이 plan이 **신설을 지시**하는 test-only
#       주입 스위치다(Task 2a). 오늘의 트리에는 없으며, Task 2a가 만들지
#       않으면 이 블록은 실행 불가 상태로 남고 그 자체가 Task 미완의 증거다.
#       이 명령이 exit 0이면 대체 단언은 완화이지 대체가 아니다.
MCCP_PERF_INJECT_QUADRATIC=1 node --test plugins/mccp/scripts/derive/tests/perf-budget.test.js \
  && { echo "[NEG-FAIL] 주입 회귀를 못 잡음 — 대체 단언 기각"; exit 1; } \
  || echo "[NEG-OK] 주입된 O(n^2)에서 단언 발화"

# [NEG] 2a 오라클 — 위 통합 재현은 wall-clock에 의존한다. 판정 자체는 합성
#       측정치로 결정적으로 단언한다(1급, 스위트 안). 선형이면 ok, 2차면 not ok.
node -e '
  const {judgeScaling}=require("./plugins/mccp/scripts/lib/perf-scaling");
  const lin=judgeScaling({small:{n:10,ms:10},large:{n:100,ms:100}});
  const quad=judgeScaling({small:{n:10,ms:10},large:{n:100,ms:1000}});
  if(!lin.ok||quad.ok){console.error({lin,quad});process.exit(1);}
  console.log("[NEG-OK] judgeScaling: linear ok, quadratic rejected");
'
# 오라클 자신의 부정 케이스는 스위트가 소유한다(1급). 위 node -e 는 그 단언이
# 실제로 존재하는지 확인하는 통합 재현이다.
node --test plugins/mccp/scripts/lib/tests/perf-scaling.test.js

# [NEG] 2b — 라이브 STATE.md 결합 A/B. **git-tracked 파일을 건드리지 않는다.**
#       결합의 정체는 "repoRoot 미전달 → process.cwd() 를 읽는다"이므로,
#       라이브 파일을 변조할 필요 없이 cwd 를 바꾸는 것만으로 증명된다.
#       (초안은 .claude/state/STATE.md 에 append 후 복원하는 파괴적 프로브였고
#        L2 test 리뷰어가 크래시 시 복원 실패를 지적했다 — 수용.)
PROBE=$(mktemp -d) && mkdir -p "$PROBE/.claude/state" \
  && printf -- '---\nschema_version: v1\n---\n\n## Goal\nprobe fixture\n' > "$PROBE/.claude/state/STATE.md"
node -e 'const{measureA3}=require(process.argv[1]+"/plugins/mccp/scripts/lib/msw-metrics/a3-instruction-cost");
  measureA3({claudePath:process.argv[1]+"/CLAUDE.md",readUserMemory:false})
    .then(r=>console.log("cwd=repo   state_block bytes:",r.components.state_block&&r.components.state_block.bytes))' "$PWD"
( cd "$PROBE" && node -e 'const{measureA3}=require(process.argv[1]+"/plugins/mccp/scripts/lib/msw-metrics/a3-instruction-cost");
  measureA3({claudePath:process.argv[1]+"/CLAUDE.md",readUserMemory:false})
    .then(r=>console.log("cwd=fixture state_block bytes:",r.components.state_block&&r.components.state_block.bytes))' "$PWD" )
rm -rf "$PROBE"
# 수정 전: 두 값이 다르다 → measureA3 가 cwd(=라이브 저장소)에 종속된다는 증명.
# 수정 후: 테스트가 fixture repoRoot 를 명시하므로 cwd 와 무관해진다 —
#          그 사실을 test 본문 단언으로 고정한다(프로브는 진단용, 단언은 test 소유).

# ── 축 A: Task 2c — fail-open 계약 강제 (원인과 독립) ────────────────
node --test plugins/mccp/scripts/hooks/tests/session-start-bootstrap.test.js

# [NEG] 2c-A — 모듈이 깨진 fixture root에서 session-start가 exit 0 + loud 메시지.
#       수정 전에는 exit 1 + stderr 공백이었음을 A/B로 남긴다.
#       패턴은 Task 2c가 신설하는 test 2건이 공유하는 리터럴이다. 오늘의 트리에는
#       이 이름의 test가 없으며(현재 6건: :40,46,60,77,92,101 — 실측), 0건 매칭은
#       "검사가 통과했다"가 아니라 **Task 2c 미완의 증거**다. 그래서 개수를 센다.
NEG_2CA=$(node --test --test-reporter=tap \
  plugins/mccp/scripts/hooks/tests/session-start-bootstrap.test.js \
  --test-name-pattern "fail-open contract" 2>/dev/null | grep -ac "^ok ")
[ "${NEG_2CA:-0}" -ge 2 ] \
  && echo "[NEG-OK] fail-open contract test $NEG_2CA건 발화" \
  || { echo "[NEG-FAIL] fail-open contract test가 2건 미만($NEG_2CA) — Task 2c 미완"; exit 1; }

# [NEG] 2c-A stub 방지 — 위 개수 검사는 test **이름**만 본다. 빈 stub도 통과한다.
#       수정 전 스크립트를 꺼내 같은 두 test를 그것에 대고 돌린다. 반드시 FAIL이어야
#       하며, pass하면 그 test는 계약을 단언하지 않는 껍데기다.
PRE=$(mktemp -d)
git show HEAD:plugins/mccp/scripts/hooks/session-start.js > "$PRE/session-start.js"
MCCP_TEST_SESSION_START_PATH="$PRE/session-start.js" \
  node --test plugins/mccp/scripts/hooks/tests/session-start-bootstrap.test.js \
  --test-name-pattern "fail-open contract" \
  && { echo "[NEG-FAIL] 수정 전 코드에서도 통과 — test가 stub이다"; rm -rf "$PRE"; exit 1; } \
  || echo "[NEG-OK] 수정 전 코드에서 FAIL — test 본문이 계약을 실제로 단언한다"
rm -rf "$PRE"

# [NEG] 2c-A는 "exit 0"만이 아니라 "exit 0 + loud stderr"를 요구한다. 종료 코드만
#       보면 조용한 강제(이 PRD Risk 1이 금지한 형태)가 통과한다(L2 test 흡수).
#       test 본문이 marker 문자열을 단언하는지 소스에서 확인하고, broken fixture
#       실행의 실제 stderr에 marker가 나타나는지도 본다.
grep -q "FAIL-OPEN-FORCED" plugins/mccp/scripts/hooks/tests/session-start-bootstrap.test.js \
  && echo "[OK] test가 loud marker를 단언한다" \
  || { echo "[NEG-FAIL] test가 stderr marker를 단언하지 않는다 — 조용한 강제가 통과한다"; exit 1; }
grep -q "FAIL-OPEN-FORCED" plugins/mccp/scripts/hooks/session-start.js \
  && echo "[OK] 강제 경로가 marker를 emit한다" \
  || { echo "[NEG-FAIL] session-start.js가 marker를 emit하지 않는다"; exit 1; }

# ── 축 B: 도달 가능성 ────────────────────────────────────────────────
node --test plugins/mccp/scripts/lib/tests/codex-reachability.test.js

# [NEG] precedence — env policy가 classification을 이긴다. 실재하지 않는 조합
#       (DISABLED=1 + classification 'ok')을 일부러 먹여 규칙 자체를 단언한다.
#       초안은 이 케이스를 Task 4 본문에만 적고 실행 가능한 형태로 두지 않았다.
node -e '
  const o=require("./plugins/mccp/scripts/lib/codex-reachability");
  const r=o.classify({env:{MCCP_CODEX_DISABLED:"1"},invokeResult:{ok:true,classification:"ok"}});
  if(r.reachable||r.kind!=="env-policy"){console.error("got",r);process.exit(1);}
  console.log("[NEG-OK] env policy > classification (reachable=false kind=env-policy)");
'
# [NEG] 미지 classification을 도달 성공으로 읽지 않는가 (fail-closed)
node -e '
  const o=require("./plugins/mccp/scripts/lib/codex-reachability");
  const r=o.classify({env:{},invokeResult:{ok:true,classification:"totally-new-enum"}});
  if(r.reachable||r.kind!=="transport"){console.error("got",r);process.exit(1);}
  console.log("[NEG-OK] unknown classification → reachable=false kind=transport");
'

# [NEG] skip 사유 A/B — 존재가 아니라 **문자열**을 본다. 초안은 grep "SKIP"만 해서
#       사유가 거짓인 채로도 통과했다. 수정 전 사유(Task 0이 report에 봉인)는
#       "real codex --json contract appears to be non-JSON; v0.2.4 followup".
#       SKIP 줄이 여러 개일 수 있으므로 **개수까지 고정**한다 — "어느 한 줄에
#       env-policy가 있고 어느 한 줄에 non-JSON이 없다"는 서로 다른 줄로도 성립해
#       엉뚱한 test가 옳은 사유로 skip되는 것을 통과시킨다(L2 test LOW 흡수).
#       env를 인라인으로 명시한다 — 전역 설정에 의존하면 사용자마다 다른 것을
#       재게 된다(L2 test HIGH 흡수). 미설정 경로는 Task 4 오라클의 table-driven
#       test가 주입 env로 덮으므로 여기서 spawn 비용을 치를 필요가 없다.
SKIPLINES=$(MCCP_CODEX_DISABLED=1 node --test --test-reporter=tap \
  plugins/mccp/scripts/lib/tests/codex-companion-smoke.test.js 2>/dev/null | grep -a "SKIP")
echo "$SKIPLINES"
NSKIP=$(printf '%s\n' "$SKIPLINES" | grep -ac "SKIP")
[ "${NSKIP:-0}" = "1" ] \
  || { echo "[NEG-FAIL] SKIP 줄이 $NSKIP개 — 단일 줄을 전제로 한 대조가 성립하지 않는다. 대상을 명시하도록 Validation을 좁혀라"; exit 1; }
printf '%s\n' "$SKIPLINES" | grep -q "non-JSON" \
  && { echo "[NEG-FAIL] 거짓 사유가 그대로 남아 있다 — Task 5 미완"; exit 1; } || true
printf '%s\n' "$SKIPLINES" | grep -q "env-policy" \
  && echo "[NEG-OK] 그 한 줄의 사유가 env-policy로 정직화됨" \
  || { echo "[NEG-FAIL] 사유에 env-policy가 없다 — 오라클이 배선되지 않았다"; exit 1; }

# ── 축 C: 가드 미약화 증명이 합격 조건의 일부 ────────────────────────
node --test plugins/mccp/scripts/receipt/tests/store-quarantine.test.js

# [NEG] 봉쇄 술어를 stub 없이 **직접** 호출한다(L2 test HIGH 흡수). stub 관측만
#       하면 realpath 로직이 틀려도 통과한다. symlink 케이스가 문자열 비교
#       구현을 걸러내는 유일한 축이다.
node -e '
  const path=require("path"), fs=require("fs"), os=require("os");
  const {isWithinReceiptsDir}=require("./plugins/mccp/scripts/receipt/store");
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"qz-"));
  const rdir=path.join(root,".claude","receipts"); fs.mkdirSync(rdir,{recursive:true});
  const outside=fs.mkdtempSync(path.join(os.tmpdir(),"qz-out-"));
  const ok=isWithinReceiptsDir(root, path.join(rdir,"g","a.json"))===true;
  const esc=isWithinReceiptsDir(root, path.join(rdir,"..","..","evil.json"))===false;
  let sym=null;
  try { fs.symlinkSync(outside, path.join(rdir,"link"), "junction");
        sym=isWithinReceiptsDir(root, path.join(rdir,"link","a.json"))===false; }
  catch(e){ console.error("[SKIP] symlink 생성 불가(권한): "+e.code); }
  if(!ok||!esc||sym===false){ console.error({ok,esc,sym}); process.exit(1); }
  console.log("[NEG-OK] 봉쇄 술어 직접 검증: 정상=true, 탈출=false, symlink="+(sym===null?"skipped":"false"));
'
node --test plugins/mccp/scripts/lib/tests/b2-coverage-gate.test.js

# (1·보조) fs.renameSync 호출부 개수. 착수 전 2건(:78 marker atomic write ·
#     :248 receipt 격리), 착지 후 1건(:78만). **판정 권한은 아래 (3)에 있다** —
#     이것은 문자열 매칭이라 주석·유사 이름에 오염될 수 있으므로 조기 경보다.
#     그래서 패턴을 호출 형태로 좁히고 매칭 줄을 출력해 눈으로 확인한다.
grep -nE "fs\.renameSync\s*\(" plugins/mccp/scripts/lib/plan-codex-runner.js
RS=$(grep -cE "fs\.renameSync\s*\(" plugins/mccp/scripts/lib/plan-codex-runner.js)
[ "$RS" = "1" ] && echo "[OK] fs.renameSync 호출부 1건 — 위 출력이 (tmp, file)인지 확인" \
  || { echo "[FAIL] fs.renameSync 호출부 $RS건 — receipt 격리가 아직 runner에 남아 있다"; exit 1; }

# (2) 승인 목록·정규식 무변경. 레지스트리 1행 추가 외의 변경이 있으면 실패.
git diff -- plugins/mccp/scripts/lib/msw-metrics/b2-coverage-gate.js
GUARD_TOUCHED=$(git diff -U0 -- plugins/mccp/scripts/lib/msw-metrics/b2-coverage-gate.js \
  | grep -cE "^[+-][^+-].*(APPROVED_WRITERS|APPROVED_PREFIXES|WRITE_CALL_RE|ANY_WRITE_CALL_RE)")
[ "${GUARD_TOUCHED:-0}" = "0" ] && echo "[OK] 승인 목록·정규식 무변경" \
  || { echo "[FAIL] 가드 정의가 $GUARD_TOUCHED 줄 변경됨 — UI6 위반"; exit 1; }
ADDED=$(git diff -U0 -- plugins/mccp/scripts/lib/msw-metrics/b2-coverage-gate.js | grep -c "^+[^+]")
REMOVED=$(git diff -U0 -- plugins/mccp/scripts/lib/msw-metrics/b2-coverage-gate.js | grep -c "^-[^-]")
[ "${ADDED:-0}" = "1" ] && [ "${REMOVED:-0}" = "0" ] \
  && echo "[OK] 레지스트리 1행 추가만(+1/-0)" \
  || { echo "[FAIL] diff가 +$ADDED/-$REMOVED — 1행 추가 상한 초과"; exit 1; }

# (3·1급) 위임이 실제로 일어나는가 — 정적 문자열이 아니라 호출 관측으로 단언한다.
#     helper를 stub해 호출 여부와 인자를 본다. 변수명·주석·래핑으로는 만족 불가.
#     이 단언은 store-quarantine.test.js 가 아니라 runner 쪽 test가 소유한다.
#     **호출 여부만 보면 안 된다**(L2 invariant MEDIUM 흡수): helper는 throw하지
#     않으므로 반환값을 무시해도 "위임했다"는 통과한다 — 격리 실패가 조용히
#     지나가는 fail-open drift다. stub을 {ok:false}로 만든 경로에서 runner가
#     FATAL stderr를 내는지까지 같은 test군이 단언한다.
node --test plugins/mccp/scripts/lib/tests/plan-codex-runner.test.js \
  --test-name-pattern "quarantine.*(delegat|failure)"
DELEG=$(node --test --test-reporter=tap plugins/mccp/scripts/lib/tests/plan-codex-runner.test.js \
  --test-name-pattern "quarantine.*(delegat|failure)" 2>/dev/null | grep -ac "^ok ")
[ "${DELEG:-0}" -ge 2 ] \
  && echo "[OK] 위임 관측 $DELEG건(호출 + 실패 처리)" \
  || { echo "[FAIL] 위임 관측이 $DELEG건 — 호출과 실패 처리 둘 다 단언돼야 한다"; exit 1; }

# ── 전수 회귀 대조 — before/after 동일 조건. 실패 "이름"까지 대조한다 ──
node --test --test-reporter=tap "plugins/mccp/scripts/**/*.test.js" 2>/dev/null > /tmp/after.tap
grep -aE "^# (tests|pass|fail|skipped)" /tmp/after.tap
grep -aE "^not ok " /tmp/after.tap | sed 's/^not ok [0-9]* - //'   # baseline 2건과 이름 대조

# 삭제 사고 검증 (CLAUDE.md §3.5.1)
git diff --diff-filter=D --name-only origin/main...HEAD
```

**합격 기준 — Task 0이 봉인한 baseline에 대한 상대값이다.** 초안은 `fail 2 / pass 3861 / skipped 6`을 절대 리터럴로 적었고, L2 invariant 리뷰어가 CRITICAL로 지목했다: Task 0이 implement 시점 **재측정**을 허용하므로, 재측정으로 baseline이 움직이면 고정 리터럴은 충족 불가능해지거나 무의미해진다. 지적이 옳다. 기준을 델타로 재정의한다.

| 지표 | 기준 (Task 0 봉인 baseline `B` 대비) | 왜 |
|---|---|---|
| `b2-coverage-gate` 2건 | **0** — 이름 단위 대조 | 축 C 해소. 개수가 아니라 **그 두 이름**이 사라져야 한다 |
| `fail` | `B.fail`에서 축 C 2건을 뺀 값 **이하** | 축 C 외의 신규 red 유입 0 |
| `pass` | `B.pass` **이상** | UI8 — 무력화로 fail을 줄이는 경로 차단 |
| `skipped` | `B.skipped` **이하** | UI5 — skip으로 green 만들기 차단 |

2026-08-12 실측치 `{pass 3861, fail 2, skipped 6}`는 **증거이지 `B`가 아니다**. `B`는 Task 0의 **단 한 번의 측정**이 정하며, 그 값이 위 증거와 다르면 차이와 사유를 report에 적는다 — 이는 갱신이 아니라 최초 확정이다. 확정 이후 `B`는 움직이지 않고, 움직이려면 plan을 고쳐 게이트를 다시 받아야 한다(Task 0).

harness `--runs 10`이 `stable:true`인 것은 **"결정적임의 증명이 아니라 10회 관측에서 divergence 없음"**이다 — 미포착 확률 약 5.6%를 report에 명시한다.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **포착된 1건이 재현되지 않아 원인을 확정할 수 없다** | **High** (4회 중 1회 = 25%) | Task를 2c-A(계약 강제, 무조건 착지)와 2c-B(원인 확정, 조건부)로 분리. **2c-A는 원인을 몰라도 성립**하므로 재현 실패해도 계약 위반이 남지 않는다. 2c-B는 미확정을 그대로 적고 PRD로 승계하며, 추정으로 원인을 채우는 것은 금지 |
| harness `--runs 10`이 25% 사건을 놓친다 | Medium (미포착 ≈ 5.6%) | 확률을 report에 명시하고 "결정적"이라 적지 않는다. 2c-A가 계약을 이미 강제하므로 미포착의 대가가 "계약 위반 잔존"이 아니라 "원인 미상"으로 한정된다 |
| **다른 flake가 남아 있는데 N회 관측이 그것을 못 본다** | **High** (기존 지목 4건이 4회 전부 미재현) | 주장 범위를 관측 횟수로 명시 한정한다 — "N회 관측에서 divergence 없음"이라 적고 "결정적"이라 적지 않는다. harness를 상시 도구로 남겨 이후 발화 시 즉시 포착 |
| Task 2a의 대체 단언이 원래 잡던 회귀를 못 잡는다 → 완화와 구별 불가 | Medium | 부정 케이스(O(n²) 주입)에서 **실패함**을 1회 재현하는 것을 Task 2의 Validate로 못박음. 재현 실패 시 대체안 자체를 기각 |
| 축 C 수정이 lint를 우회하는 형태가 된다(변수명만 바꿔 정규식 회피) | Medium | 판정 기준을 "lint diff 없음 + 테스트 pass"가 아니라 **"직접 fs 접근이 승인 계층으로 실제 이동했는가"**로 둔다. `plan-codex-runner.js`에 receipt 경로 대상 `fs.*` 호출이 0건임을 grep으로 확인 |
| `store.js`에 함수를 추가해 기존 소비처가 영향받는다 | Low | 신규 export만 추가하고 기존 함수 무변경. `receipt/tests/` 전체가 회귀 검증 |
| 축 B 수정이 skip 범위를 넓혀 실패를 숨긴다 | Medium | `skipped` 수 6 유지를 합격 기준에 포함. 오라클은 미지 classification을 **도달 성공으로 읽지 않는다**(fail-closed) |
| version 충돌 (병렬 worktree 4개, 이 저장소에서 4회 재발) | **High** | forward-only 상향 + PR 직전 `origin/main` 재확인 + `CHANGELOG.md` 헤딩 중복 검사 |
| Task 3에서 흔들린 적 없는 단언을 예방적으로 완화한다 | Medium | Task 3에 명시 금지. 무변경 판정도 report에 근거와 함께 남긴다 |
| **이 milestone도 M2 자신의 검증 수단(테스트 스위트)에 의존한다** | Medium | M1과 같은 방법 — 각 수정마다 **수정 전 코드에서의 부정 케이스 재현**을 의무화한다. "테스트가 통과했다"가 아니라 "막아야 할 것을 막는다"를 본다 |

## Acceptance

- [ ] Task 0의 baseline `B`가 Task 1~7 착수 **전에 단 한 번 측정**돼 봉인됐고, 그 실행의 **원본 TAP이 산출물로 보존**됐으며, 이후 두 번째 측정이 없었다
- [ ] `suite-determinism.js`가 존재하고 `--runs 10 --json`이 동작하며, `diffRuns()` 부정 케이스가 합성 TAP으로 단언됐다 (`[NEG-OK]`). **이 항목은 결정성을 주장하지 않는다** — `stable:true`는 "10회 관측에서 divergence 미발견"이고 미포착 확률 약 5.6%가 report에 함께 적혔다(L2 invariant LOW 지적 흡수: 본문은 둘을 구분하는데 Acceptance 문장이 동치로 읽혔다). 최종 판정자는 아래 전수 회귀 대조다
- [ ] `perf-budget` 대체 단언이 **주입된 O(n²) 회귀에서 실패함**이 재현됐다 — §Validation의 `MCCP_PERF_INJECT_QUADRATIC=1` 블록이 `[NEG-OK]`를 냈다
- [ ] `a3-instruction-cost.test.js`가 라이브 `.claude/state/STATE.md`를 더 이상 읽지 않는다 — §Validation의 A/B 프로브 출력(before/after)이 report에 있고 원본이 복원됐다
- [ ] **2c-A는 무조건 착지했다** — Task 2c가 이름을 확정한 `fail-open contract` test 2건이 실재하고(패턴 매칭 ≥2), broken fixture root에서 `session-start`가 exit 0 + loud stderr이며, 수정 전 exit 1과 A/B 대조가 남았다. 즉 원인 미확정이어도 **계약 위반은 남지 않는다**
- [ ] `session-start.js`의 exit-code 대입이 **1곳뿐**임이 test 단언으로 고정됐다 — `process.on('exit')` 강제가 삼킬 정당한 실패 신호가 없음의 근거이며, 미래에 비영점 경로가 생기면 이 단언이 먼저 깨진다
- [ ] 2c-B: 원인 확정 + A/B, **또는** 미확정 사실·관측 횟수가 report에 있고 PRD Open Questions에 승계됐다 (추정으로 채우지 않았다)
- [ ] 잔여 timing 단언 3건 각각의 판정(변경/무변경)과 근거가 report에 남았다
- [ ] `MCCP_CODEX_DISABLED=1`인 **현재 환경 그대로** 스모크 테스트의 skip 사유가 참이다 (수정 전 거짓 사유와 A/B 대조 기록)
- [ ] 미지 classification이 도달 성공으로 읽히지 않는다 (`[NEG-OK]` fail-closed)
- [ ] `quarantineReceipt`가 **helper 경계에서** `suffix`·경로를 검증하고, 부정 케이스 3종이 rename 미수행 + 실패 반환으로 단언됐다
- [ ] `b2-coverage-gate.js`의 diff가 **`MUTATION_ENTRYPOINTS` 1행 추가만**(+1/-0)이고 `APPROVED_WRITERS`·`APPROVED_PREFIXES`·정규식 2종이 무변경인 채로 해당 테스트 2건이 pass한다
- [ ] `plan-codex-runner.js`의 `renameSync` 출현이 **2 → 1**로 줄었고, 남은 1건이 marker atomic write(`(tmp, file)`)다 — 변수명 rename으로는 만족할 수 없는 형태로 검증됐다
- [ ] runner의 격리 경로가 store helper를 **실제로 호출**하고, helper가 `{ok:false}`를 반환할 때 **FATAL stderr를 낸다**는 것까지 stub 관측으로 단언됐다 — 호출 여부만 보는 단언은 반환값 무시(fail-open drift)를 통과시킨다
- [ ] `classify`가 **함수명으로 명시**됐고 `registryProbe` 부재가 정상 경로임이(같은 입력에 유무만 달리해 `{reachable, kind}` 동일) 단언됐다
- [ ] 봉인 TAP의 **sha256이 report에 정확히 1줄** 적혔고 재해시 대조를 통과했으며, 헤더 3종이 **정수 값과 함께**(`^# (tests|pass|fail) [0-9]+$`) 존재한다
- [ ] **순서가 커밋 이력으로 증명됐다** — baseline TAP을 건드린 커밋이 **정확히 1개**이고, 그 커밋이 Task 1 산출물 생성 커밋의 **조상**이다(`git merge-base --is-ancestor`). 해시 일치는 변조만 잡고 순서는 잡지 못하므로 이것이 "착수 전 1회 측정"의 유일한 기계적 증거다
- [ ] `MUTATION_ENTRYPOINTS` 등록이 **문자열 grep이 아니라 모듈 로드 후 배열 원소 검사**로 확인됐다
- [ ] `judgeScaling`이 **`lib/perf-scaling.js`**에서 export되고(`.test.js` require 아님) 그 부정 케이스를 `lib/tests/perf-scaling.test.js`가 소유한다
- [ ] `MCCP_PERF_INJECT_QUADRATIC`의 소비 지점이 `perf-budget.test.js`의 **`runDerive` 헬퍼 진입부**임이 코드로 확인된다
- [ ] `plugins/mccp/scripts/hooks/tests/session-start-bootstrap.test.js:18`의 경로 상수가 `process.env.MCCP_TEST_SESSION_START_PATH || <현행 resolve>`로 바뀌었고, **env 미설정 시 기존 6개 test가 무영향**이다
- [ ] `isWithinReceiptsDir`가 export돼 **stub 없이 직접** 단언됐다 — 정상 `true` · `..` 탈출 `false` · **symlink 탈출 `false`**(생성 불가 환경은 사유 명시 skip)
- [ ] 스모크 skip 사유 검증이 **전역 env에 의존하지 않는다**(명령에 `MCCP_CODEX_DISABLED=1` 인라인 명시)
- [ ] §Validation "실행 시점 계약" 표의 **11개 전제**가 전부 생성됐다 — 전제 점검 preamble이 `[OK] 전제 전부 충족`을 냈다(부재는 회귀가 아니라 Task 미완으로 구분 보고됐다)
- [ ] `fail-open contract` test 2건이 **수정 전 스크립트에서 FAIL**한다 — 이름 매칭만으로는 거를 수 없는 stub이 아님이 A/B로 증명됐다
- [ ] `judgeScaling` 오라클이 합성 2차 측정치를 **결정적으로 기각**한다 (wall-clock 비의존, 스위트 안)
- [ ] `MCCP_PERF_INJECT_QUADRATIC`의 소비처가 **`perf-budget.test.js` 자신**이고 production `derive/` 코드에 test 전용 분기가 들어가지 않았다
- [ ] 도달 가능성 오라클의 **precedence**(env policy > classification)가 실재하지 않는 조합으로 단언됐다
- [ ] 스모크 skip 사유 A/B가 **문자열 단언**으로 검증됐다 — `non-JSON` 부재 + `env-policy` 존재 동시 충족
- [ ] `quarantineReceipt`의 경로 봉쇄가 `path.relative` + **부모 `realpath` 재검사**로 구현됐다(문자열 `startsWith` 아님)
- [ ] 통합 재현 3건(O(n²) 주입 · 수정 전 A/B · skip 사유 A/B)의 **출력 원문**이 report에 실렸다 — 스위트가 강제하지 못하는 축의 유일한 증거다
- [ ] 봉인 TAP이 `.claude/PRPs/reports/gate-guard-integrity-m2-baseline.tap`에 **존재**하고 전제 점검이 그것을 확인했다
- [ ] `MCCP_PERF_INJECT_QUADRATIC`이 production `derive/`(tests 제외)에 **0건**임이 역방향 grep으로 확인됐다
- [ ] 2c-A의 강제가 **조용하지 않다** — `session-start.js`가 `FAIL-OPEN-FORCED` marker를 emit하고 `session-start-bootstrap.test.js`가 그 marker를 단언한다(정상 경로는 marker 부재를 요구하므로 강제 발동이 여전히 test 실패로 보인다)
- [ ] 도달 가능성 오라클이 `codex-invoke.js`의 **14종 enum 전수**에 대해 table-driven으로 단언됐고, `'ok'` 외 13종이 모두 `reachable=false`다
- [ ] `judgeScaling`의 규칙(`ratio ≤ linearRatio × slack`, `small.ms=0`은 fail-closed)이 명시됐고 선형 통과·2차 기각이 합성 입력으로 단언됐다
- [ ] `quarantineReceipt`가 **source와 destination 양쪽** 모두에 봉쇄 검사를 적용한다
- [ ] `diffRuns` **4필드 전부**가 부정 케이스에서 단언됐다 (`stable`·`unionFailing`·`alwaysFailing`·`sometimesFailing`)
- [ ] 라운드별 리뷰 이력이 plan 본문이 아니라 `.claude/reviews/plan-review-gate-guard-integrity-m2.md`에 있다 (Phase 5.2h 규정)
- [ ] 전수 실행이 §Validation의 4개 델타 기준(**`B` 대비**)을 동시에 만족하고, 실패 **이름**까지 대조됐다
- [ ] `plugin.json` 1.23.8 + footer 2면 + CHANGELOG + PRD Milestone 2 행 갱신
- [ ] 어떤 테스트도 skip·삭제·주석 처리되지 않았다
- [ ] "결정적"이라는 무조건 주장 대신 **관측 횟수 + 미포착 확률(약 5.6% @ 10회)** 이 report에 적혔다

## Codex Adversarial Review

이 plan의 승인은 Codex가 아니라 **L1+L2 리뷰 패널**이 발행한다 (`MCCP_PLAN_REVIEW` 미설정 → `multi-agent`, 사용자가 이 경로를 명시 선택 — UI2).

- Codex 미발화: `MCCP_CODEX_DISABLED=1`이 사용자 전역 `~/.claude/settings.json`에 있고 한도가 2026-08-16까지 소진 상태다. codex 경로를 택했다면 `codex-invoke.js:182-192`가 spawn 직전 short-circuit해 **검토 0건짜리 통과 receipt**만 남았을 것이다 — 이 PRD가 지목한 "통과 신호의 존재가 검사가 일어났음을 의미하지 않는다"의 정확한 재현이다. 그래서 패널을 택했다.
- **cross-model 확증은 이 cycle에서도 미획득**이다. 패널 4인은 전부 Claude 계열이므로 컨텍스트·관점 격리는 얻되 **모델 다양성은 얻지 못한다**. M1도 같은 공백을 명시했고 본 milestone도 그것을 획득했다고 주장하지 않는다.
- 패널의 판정·근거·finding 전문은 `.claude/reviews/plan-review-<slug>.md`에 남는다.
- YAGNI Triage: Codex finding 0건(미발화)이므로 triage 대상 없음. backlog 이연 0건.

## Design Critique

`impeccable-detect --mode plan` → `skill_available=true` · `design_signal=true` · `reason=ok`.
`signal_files`: `design-critique-decide.js` · `derive/tests/perf-budget.test.js` · `renderer/html.js` · `renderer/markdown.js` · `renderer/tests/i18n-surface.test.js`.

- rounds: 1 (R0에서 종료) · verdict: **CONVERGED** (`decideCritique({round:0, cap:2})`)
- findings: 0
- round 3·4 준비 편집 이후 **매 라운드 재실행**했고 결과는 매번 동일하다. 개정이 추가한 것은 산문·표·bash 블록이며 렌더 surface 변경은 여전히 version 문자열 하나다. H15 anchor(heading depth ≤ 3)는 매 라운드 실측으로 확인했다 — 이 문서의 `####` 출현 **0건**(`#`/`##`/`###`만 사용).

발화는 오탐이 아니라 실 hit이다 — 본 plan이 `renderer/html.js:1419`와 `renderer/markdown.js:163`의 footer version을 실제로 바꾼다. 다만 **렌더 surface에 대한 변경 내용은 version 문자열 치환 하나**이며, SKILL의 4 Output Constraints 어디에도 저촉되지 않는다.

| Output Constraint | 판정 |
|---|---|
| 정보 위계 3단계 (heading depth ≤ 3) | 위반 없음 — footer는 heading이 아니고, 이 plan 문서 자체도 최대 깊이 3 |
| 강조색 화면당 1개 | 위반 없음 — 색·토큰 변경 0 |
| raw markdown marker 금지 | 위반 없음 — 치환 대상이 `v1.23.7` → `v1.23.8` 리터럴 |
| 한 화면 항목 수 상한 | 위반 없음 — list-of-N 렌더 로직 무변경 |

`signal_files` 중 `design-critique-decide.js`와 `i18n-surface.test.js`는 **변경 대상이 아니다** — 전자는 Patterns to Mirror의 인용, 후자는 Files to Change의 의도적 미포함 사유로 등장했을 뿐이다. 검출기가 경로 언급만으로 발화하는 것은 설계대로이며, 그 사실을 여기 적어 둔다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더 UI가 없어 **호출하지 않고** 체크리스트로만 기록한다. 본 milestone의 렌더 surface 변경이 version 문자열 하나이므로, implement의 `renderingSurface` selector는 refine/discovery를 recommend로 강등할 가능성이 높다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Multi-Perspective Fan-out

**skipped** — 이번 세션의 명시 지시("워크플로우·에이전트는 사용자 요청 시에만")에 따라 Phase 2.5 fan-out을 호출하지 않았다. 사용자가 승인한 것은 Phase 5 **검토 패널**이며 GROUND fan-out은 아니다. 커맨드가 규정한 fail-open 경로인 인라인 Pattern Grounding으로 GROUND를 수행했고(위 `## Patterns to Mirror` + `## 착수 전 실측`), runaway 예약은 발생하지 않았다(reserve 미호출 → 카운터 소비 0).

GROUND의 실질은 fan-out 대신 **전수 실행 4회 실측**이 담당했다 — 이 milestone의 대상이 테스트 스위트 자신이므로, 읽기 관점 4개보다 실행 관측 4회가 더 강한 근거다.

## Review History

라운드별 판정·finding 전문·흡수/반증 기록은 **`.claude/reviews/plan-review-gate-guard-integrity-m2.md`** 가 소유한다. 커맨드 Phase 5.2h가 그 기록을 plan 본문이 아니라 sibling 아티팩트에 두라고 규정하기 때문이며(plan 본문 편집은 `reviewed_plan_hash` 바인딩을 깨뜨린다), 흡수의 *결과*는 각 Task·OQ 안에 인라인 근거로 남아 있다.
