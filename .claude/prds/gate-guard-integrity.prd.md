# Gate Guard Integrity — 가드가 가드하지 않는다

## Problem

mccp는 결함을 사람이 아니라 기계가 잡도록 여러 겹의 가드를 둔다. hook은 자기 자신이 깨져도 사용자 작업을 막지 않도록 fail-open해야 하고, terminal 게이트는 plan이 게이트 이후 바뀌면 stale로 잡아야 하며, "증거 없는 skip은 ship 불가"는 전용 테스트가 지켜야 한다.

실측 결과 **이 세 가드가 모두 조용히 무력화돼 있다.** 각각은 독립된 버그가 아니라 같은 형태다 — fail-closed여야 할 지점이 fail-open돼 있고, 그 사실을 알려줄 장치가 바로 그 무력화된 가드 자신이다. 그래서 아무도 알려주지 않았다.

방치 비용은 침묵이다. 가드가 통과시켰다는 사실이 더 이상 "검사했다"를 의미하지 않는데, 파이프라인은 계속 그것을 진행 신호로 소비한다. 가드 중 하나(G1 fail-open)는 **약 2개월간** 깨진 채였고, 그것을 잡도록 만들어진 테스트가 그 2개월 내내 red를 내고 있었으나 스위트 전체가 상시 red라 신호가 묻혔다.

## Evidence

2026-08-08~09 실측이다. 추정이 아니며, 전부 읽기 전용 재현으로 확인했다.

- **세 가드 모두 부정 케이스에서 발화하지 않는다.** 전수 실행 `node --test "plugins/mccp/scripts/**/*.test.js"` → `tests 3366 / pass 3352 / fail 8`. 이 8건을 개별 실행·환경 분리·동시 실행 세 축으로 분해하면 성격이 셋으로 갈린다.

- **가드 1 — hook fail-open 파손 (3건).** `receipt-prompt.js:70` · `receipt-skill.js:105`가 `extract-plan-path`를 **최상위·무방비로 require**한다. 모듈이 없으면 fail-open 핸들러가 설치되기 *전에* 던져 프로세스가 `exit 1` + stdout 공백으로 죽는다. 재현 스택이 그 행을 정확히 지목한다. 같은 파일 바로 아래 `receiptContext` require는 방어 패턴을 쓰며 *"Module-scope require so a failed load in main() can't itself throw"* 라고 이유까지 주석에 적어 둔다 — **패턴은 이미 확립돼 있고 그 한 줄만 따르지 않는다.**

- **회귀 시점이 특정된다.** 이 테스트는 `9ea48b1`(v0.2.7, 2026-06-05)에 생성돼 당시 통과했고, 문제의 require는 `8cc9ac5`(v0.2.8)로 **그 이후** 추가됐다. v0.2.8이 불변식을 깨뜨렸고 상시 red가 그것을 감췄다.

- **가드 2 — terminal 게이트의 staleness 미검출 (1건).** `pr.md:202`(preflight)와 `pr.md:856`(ship-gate read-back)이 validate 호출에 `--plan`을 넘기지 않는다. `validate-cmd.js:296`의 staleness 검사는 `--plan` 존재에 **조건부**다. 즉 `/mccp:pr`의 두 지점에서 plan이 게이트 이후 변경돼도 stale로 잡히지 않는다. 저장소 자체의 lint(`validate-callsite-lint`)가 이 계약을 명문화하고 있으며, 위반자는 **그 계약을 어긴 `pr.md` 자신**이다.

- **가드 3 — ship-gate 가드 테스트가 표준 설치에서 반전된다 (2건).** 테스트 헬퍼가 앰비언트 `MCCP_CODEX_DISABLED`를 중화하지 않는다. 이 변수가 켜져 있으면 write 경로가 skip 사유를 15자짜리 canonical 값으로 덮어써 길이 검증에 걸리고, 동시에 disabled 표식을 자동 stamp하는데 그 표식이 ship proof marker로 계산된다. 결과적으로 **증거 없는 skip이 증거를 얻어 통과**한다. 변수 하나만 제거하면 **26/26 통과**로 확인했다. 하필 이 변수는 CLAUDE.md §4상 `/mccp:setup` Phase 4가 **자동으로 써 두는 값**이라, 가드가 무력화되는 조건이 기본 설치 절차와 일치한다.

- **본 결함들은 특정 브랜치의 산물이 아니다.** `origin/main`(7fe48d9)에서 새 worktree를 만들어 해당 테스트만 실행하면 `tests 7 / pass 3 / fail 4`로 가드 1·2가 그대로 재현된다.

- **나머지 2건은 성격이 다르다.** 개별 실행 통과(14/14, 24/24), 둘만 동시 실행 통과(38/38), 환경 분리 전수에서도 통과했고 전수 병렬 실행에서만 실패한다. 비결정적 간섭이며 원인 미확정이다.

- **환경 분리 시 새로 드러나는 1건이 있다.** 외부 의존 스모크 테스트의 "도달 불가 시 skip" 판정이 실제 도달성과 어긋나, 평소에는 skip돼 보이지 않다가 조건이 바뀌면 실패로 나타난다.

## Users

- **Primary**: mccp 게이트 chain을 직접 돌리는 운영자 본인. 매 cycle "가드가 통과시켰다"를 진행 신호로 소비하며, 그 신호가 참인지를 스스로 검증할 수단이 현재 없다.
- **Not for**: CI 파이프라인·외부 기여자. 이 저장소는 CI에서 테스트를 강제하지 않고 외부 기여자도 없다.

## Hypothesis

We believe **무력화된 세 가드를 각자의 부정 케이스에서 실제로 발화하도록 복원하는 것**이 **"가드가 통과시켰다"를 다시 검증 가능한 진술로 되돌려** **mccp 게이트를 직접 돌리는 운영자**에게 기계적 신뢰를 회복시킬 것이다.

We'll know we're right when **각 가드가 발화해야 하는 조건에서 실제로 발화함이 테스트로 증명되고, 그 증명이 표준 설치 환경(기본 env 포함)에서도 성립한다**.

## Success Metrics

| Metric | Target | How measured | Actual (2026-08-10 실측) |
|---|---|---|---|
| 무력화된 가드 수 | 3 → 0 | 각 가드의 부정 케이스를 재현해 발화 여부 확인 | **3 → 0** — 수정 전 코드에 신규 테스트를 돌려 G1 7 fail · G2 `ok=true/stale=0`(가드 사망) · G3 7+1+2 fail을 각각 확인 후 복원 |
| 부정 케이스 테스트 보유 | 3/3 | 가드마다 "발화해야 하는 조건"을 직접 단언하는 테스트 존재 | **3/3** — `g1-patch`(10) · `validate-callsite-lint`(4) + 2.5.9 stale 1회 재현 · `finalize-receipt`(31)/`pr-ship-gate`(28)/`codex-disabled-precedence`(6) |
| 표준 설치 환경에서의 유효성 | 통과 | env를 인위적으로 제거하지 않은 상태에서 가드 테스트가 제 임무 수행 | **통과** — `MCCP_CODEX_DISABLED=1`을 켠 채 위 6개 파일 전부 pass |
| 전수 실행 fail 수 | 8 → 2 | `node --test` 전 경로. 잔여 2는 Milestone 2 대상 | **7 → 3** — 착수 시 실측 baseline은 8이 아니라 **7**이었고(원 target의 분모가 달랐다), 본 milestone이 표적한 **6건은 전부 해소**. 최종 3건 중 M1 귀속은 **0건**(`b2-coverage-gate` 2건은 `plan-codex-runner.js` 소유 — M1 커밋이 이 파일을 한 번도 건드리지 않음, PR #118 소관 / `perf-budget` 1건은 timing-flaky = Milestone 2 축) |
| 기존 통과 케이스 회귀 | 0건 | 수정 전후 pass 수 비교 — 감소가 없어야 함 | **0건** — pass 3444 → **3794** (증가분에는 main 머지분 포함) |

## Scope

**MVP** — 위 세 가드를 각각의 실제 원인에 맞게 복원해, 부정 케이스에서 발화함을 테스트로 증명한다. 세 건은 별개 버그가 아니라 "fail-closed여야 할 것이 fail-open됐다"는 동일 인과이므로 한 단위로 닫는다.

**Out of scope**

- **외부 Codex 한도·가용성 대응** — 스모크 테스트의 도달 가능성 판정 정확성만 다루고, 외부 서비스 가용성 자체는 이 PRD의 문제가 아니다. (사용자 지정)
- **가드 패턴 전수 감사** — 다른 hook·명령 본문에 같은 형태의 무방비 지점이 더 있는지 전수로 찾는 것. 지목된 곳을 고치는 것과 전면 감사는 비용이 다르며, 후자는 본 가설을 검증하는 데 필요하지 않다. 전수 감사가 필요하다는 근거가 생기면 별건.
- **lint 계약 확대** — 검사 범위를 넓히거나 새 lint를 추가하는 것. 본 PRD는 **이미 존재하는 계약이 지켜지지 않는 것**을 다룬다. 계약 자체가 부족하다는 판단은 별개 문제다.
- **테스트 병렬 실행 구조 재설계** — 비결정적 간섭의 근본 해소. Milestone 2는 재현 조건 확정까지만 다루며, 격리 구조를 손보는 것은 범위 밖이다.
- **red를 숨기는 형태의 해소** — skip·삭제·주석 처리로 green을 만드는 것. 신호를 복원하는 게 목적인데 신호원을 없애면 목적과 정반대다.

## Delivery Milestones

<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | 가드 복원 | hook이 자기 실패에도 사용자를 막지 않고, terminal 게이트가 plan 변경을 stale로 잡으며, ship-gate 가드가 표준 설치 환경에서도 증거 없는 skip을 막는다 | complete | `.claude/plans/gate-guard-integrity.plan.md` |
| 2 | 신호 신뢰도 | 전수 실행 결과가 실행마다 동일해지고, 외부 의존 테스트가 도달 불가 시 정직하게 skip된다 | complete | `.claude/plans/gate-guard-integrity-m2.plan.md` |

### Milestone 2 완료 판정 (2026-08-14) — **잔여를 명시한 채 운영자 수용**

v1.23.10으로 ship. **Outcome 문장의 전반부("전수 실행 결과가 실행마다 동일")는 달성되지 않았고, 그 사실을 지우지 않는다.** 여기서 `complete`는 지표 충족이 아니라 **운영자의 명시적 수용 판정**이며, 근거는 PRD Scope가 "테스트 병렬 실행 구조 재설계 — 비결정적 간섭의 근본 해소"를 **범위 밖**으로 못박고 "Milestone 2는 **재현 조건 확정까지만** 다룬다"고 규정한 것이다. 재현 조건 확정은 달성됐다 — 그 도구가 없었다면 아래 표의 오른쪽 열을 알 수조차 없었다.

판정 근거는 이 milestone이 만든 harness의 통제된 비교다 — 같은 도구·같은 머신으로 수정 전(`3eabab2`)과 수정 후(`6c23b54`)를 각 10회 돌렸다.

| | 수정 전 | 수정 후 | 판정 |
|---|---|---|---|
| `stable` | **true** (10/10 동일) | **false** (8/10) | 목표 미달 — 이 변경이 비결정성을 유입시켰다 |
| `alwaysFailing` | `b2-coverage-gate` 2건 | **[]** | 축 C 해소 |
| skip 사유 정직성 | 거짓(`non-JSON`) | 참(`env-policy`) | 축 B 해소 |

닫힌 것: **축 B**(스모크 skip 사유) · **축 C**(`b2-coverage-gate` 상시 red 2건, 10회 전부 미발화). 축 A의 산출물(결정성 harness · 결합 제거 2종 · fail-open 계약 강제)도 전부 착지했고 각각 부정 케이스로 검증됐다 — 특히 3배 부하에서 **옛 `perf-budget` 절대 단언은 3/3 실패, 새 비율 단언은 3/3 통과**하면서 주입된 O(n²)는 여전히 기각한다.

닫히지 않은 것: **"전수 실행 결과가 실행마다 동일"이라는 Outcome 문장 자체.** 유입된 비결정 2건(`receipt/tests/dedupe.test.js:123` · `derive/tests/worktrees-source.test.js:344`, 각 ≈10%/run)의 메커니즘은 세 차례 재현 시도(16× 동시 · 3배 부하 · 15× 순차)에도 확정하지 못했다. 추정으로 채우지 않고 아래 Open Question으로 승계한다.

상세·재현 명령·출력 원문은 `.claude/PRPs/reports/gate-guard-integrity-m2-report.md`.

### Milestone 1 완료 판정 (2026-08-10)

v1.23.6으로 ship됨 — PR #121, merge commit `69fe06b`. 위 Success Metrics의 `Actual` 열이 판정 근거다. 판정은 santa-loop 2인 독립 검토를 거쳤고, 지적 중 반증된 5건과 수용된 4건의 내역은 구현 리포트에 남긴다.

**status를 `complete`로 두는 것이 아카이브를 유발하지 않는다.** `archive-complete/scan.js` 오라클에 flip 전후를 직접 통과시켜 확인했다 — 두 경우 모두 `archivable=false`이고 사유만 `pending=1, in-progress=1` → `pending=1`로 바뀐다. CLAUDE.md §3.11 **C2**("PRD 전체 완료 시에만 이동")가 그대로 지켜지므로, 미완료 PRD의 plan이 옮겨져 소실되는 경로는 열리지 않는다.

**미획득 항목 — cross-model adversarial review (부채로 기록, 닫힌 게이트가 아님).** 이 milestone은 plan · implement · PR 세 게이트 **전부**에서 `resolution.codex_verdict='skipped'`다(`MCCP_CODEX_DISABLED=1`이 사용자 전역 설정에 있고 Codex 한도가 소진). 완료 판정을 위해 2026-08-10에 돌린 santa-loop에서도 Codex는 한도 소진(2026-08-16까지)으로 **검토를 수행하지 못했고**, 규정대로 Claude 폴백 2인으로 진행해 컨텍스트 격리만 확보했다 — **모델 다양성은 이 축에서도 획득되지 않았다**. 따라서 OQ2의 3부 수정(A/B/C) 설계와 OQ3의 callsite 비대칭 판정은 여전히 단일 모델 판단이다.

이 부채가 `complete` 판정을 무효화하지 않는 이유는 이 PRD 자신이 Risks 마지막 행에 적어 둔 것과 같다 — 검증의 근거는 "가드가 통과시켰다"가 아니라 **"가드가 막아야 할 것을 실제로 막는지의 직접 재현"**이며, 그 재현은 수정 전 코드에 대한 A/B로 세 축 모두 확보됐다. cross-model 확증은 그와 별개 축이고, 여기서 그것을 **획득했다고 주장하지 않는다**.

## Open Questions

- [ ] 가드 1을 복원할 때 모듈 부재 시의 올바른 동작은 **ALLOW(fail-open)** 인가, 아니면 이웃 코드가 택한 **보수적 기본값으로 강등**인가? 두 선택은 "설치가 깨졌을 때 사용자를 막지 않는다"와 "검사 없이 통과시키지 않는다" 사이의 트레이드오프다. 테스트는 전자를 기대하지만 그 기대가 지금도 옳은지는 재확인이 필요하다.
- [ ] 가드 3의 근본 해법이 **테스트가 환경을 중화**하는 것인가, 아니면 **write 경로가 명시 인자와 환경 정책을 구분**하는 것인가? 전자는 테스트만 고치고 끝나지만, 환경이 명시 인자를 덮는 혼선이 프로덕션에 그대로 남는다. 후자는 프로덕션 의미론을 건드리므로 영향 범위 판정이 선행돼야 한다.
- [ ] 가드 2를 복원하면 지금까지 통과하던 흐름이 stale로 막히기 시작한다 — 이는 의도된 동작이지만, 기존 receipt 중 몇 건이 즉시 stale 판정되는지 사전 측정이 필요하다. 대량이면 이행 경로가 별도로 필요하다.
- [x] 비결정적 2건의 간섭 원인이 무엇인가? 전수 병렬에서만 재현되므로 재현 자체가 첫 과제다.
  → **질문 자체가 반증됐다** (M2, 2026-08-14). 지목된 2건(`hook-caps:206`·`dedupe:306`)은 전수 4회 + harness 10회 + baseline 1회, **총 15회 관측에서 한 번도 발화하지 않았다**. flaky는 **고정 집합이 아니며**, "비결정적 2건"이라는 전제가 틀렸다. 재현 장치(`lib/suite-determinism.js`)는 만들어졌고 그것이 아래 신규 질문을 낳았다.
- [ ] **M2가 유입시킨 비결정 2건의 메커니즘은 무엇인가?** (2026-08-14 신규) `receipt/tests/dedupe.test.js:123` `parsePlanFiles fails closed when table separator is missing` · `derive/tests/worktrees-source.test.js:344` `scanWorktrees: truncation retains the self worktree (anchor not dropped)`. 각 ≈10%/run. 통제된 10 vs 10 비교에서 **수정 전은 10/10 결정적**이었으므로 귀속은 M2다. 재현 시도 3종(16× 동시 · 3배 부하 · 15× 순차) **전부 실패** — 부하 단조 증가형이 아니다. 두 테스트의 본문 로직은 결정적이고 비결정의 소재는 git 하위 프로세스를 spawn하는 fixture 쪽으로 좁혀지지만, **실패 메시지를 포착하지 못했으므로 원인으로 지목하지 않는다**.
- [ ] **부하 민감 테스트·고정 경로 fixture를 별도 milestone으로 다룰 것인가?** (2026-08-14 신규) 이번 진단이 드러낸 것: `lib/tests/msw-events.test.js:12-14`의 `getTempDir`가 **저장소 트리 안 고정 경로**(`plugins/mccp/scripts/.test-msw-events/`, `.gitignore` 밖)를 쓰고 `sessionId`도 고정이라 동시 실행 시 서로 충돌한다. 정상 단일 실행에서는 문제가 없으나, 이 클래스(고정 경로 fixture · git-heavy fixture · stress test)가 스위트의 비결정 표면이다. 현 PRD Scope는 "테스트 병렬 실행 구조 재설계"를 **범위 밖**으로 명시하므로 이 축은 M2에서 닫을 수 없다.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 가드 1 수정이 hook을 과도하게 관대하게 만들어 진짜 설치 손상을 조용히 넘긴다 | Low | Medium | 복원의 정의를 "조용히 통과"가 아니라 "사용자에게 보이는 메시지 + 통과"로 고정. 부정 케이스 테스트가 메시지 존재까지 단언 |
| 가드 2 복원이 기존 흐름을 광범위하게 막는다 | Medium | Medium | Open Question으로 사전 측정 지정. 측정 결과가 대량이면 MVP에서 분리 판단 |
| 가드 3을 테스트 쪽만 고쳐 프로덕션의 동일 혼선이 잔존한다 | Medium | Medium | Open Question으로 판정을 plan 단계에 명시 위임. 테스트만 고치는 선택을 하더라도 그 사실과 남는 위험을 기록 |
| 세 가드를 한 cycle에 고쳐 회귀 원인 분리가 어려워진다 | Low | Low | 세 축이 서로 다른 파일·다른 실패 조건이라 테스트가 독립적으로 실패한다. 각 축의 부정 케이스를 개별 검증 |
| green을 빨리 만들려는 압력으로 테스트를 무력화한다 | Medium | High | Out of scope에 명시 금지. 성공 지표를 "fail 감소"가 아니라 "fail 감소 **이면서 pass 수 비감소**"로 정의해 지표가 무력화를 잡도록 함 |
| 이 PRD 자체가 다루는 것이 가드이므로, 수정의 검증도 같은 깨진 가드에 의존한다 | Medium | High | 각 가드는 **부정 케이스 직접 재현**으로 검증한다 — 가드를 통과시켰다는 사실이 아니라, 가드가 막아야 할 것을 실제로 막는지를 본다 |

## Design Direction

`impeccable-detect --mode prd`는 `skill_available=true` · `design_signal=false`(`reason=no-signal`)를 반환했다. 본 PRD의 범위에 렌더 surface가 없다 — 대상은 hook 실패 경로, 게이트 인자 전달, 테스트 환경 격리이며 사용자에게 보이는 화면 변경이 0이다. 따라서 stage-aware routing 표는 싣지 않는다. 적용 가능한 impeccable 명령이 하나도 없는데 표를 싣는 것은 노이즈다.

검출이 발화하지 않았다는 사실 자체를 여기 기록해 silent-skip이 관측 불가능해지지 않게 한다(loud-fail-open). `/mccp:plan`이 PRD 파생 plan에 대해 검출을 **재수행**하며, 그 단계의 verdict가 `mccp-plan-codex` receipt에 stamp되어 chain의 정본이 된다. plan 단계에서 실제 렌더 surface가 등장하면 그때 critique retry loop이 정상 발화한다.

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-08-09.*

<!--
Co-creation note: 문제 프레이밍("가드가 가드하지 않는다" — A·B·C를 단일 인과로 묶고
D·E를 별도 milestone으로), MVP 경계(A+B+C 전부), Out of scope의 "Codex 한도·가용성
대응" 항목은 사용자가 직접 선택했다. 나머지 Out of scope 항목과 Risks / Open
Questions는 사용자가 명시적으로 위임한 범위에서 작성자가 판단해 작성했다.

Evidence는 2026-08-08~09 세션 실측이다. 재현 절차·A/B·귀속 판정의 전체 기록은
red-test-suite-restore M1 리포트(커밋 cefc937)에 있다. 본 PRD는 그 리포트가
"기록만" 하고 범위 밖으로 넘긴 항목을 요구사항으로 승격한 것이다.

Why now: 가드 1은 약 2개월간 깨진 채였고 그것을 잡을 테스트가 내내 red였다.
red-test-suite-restore M1이 스위트를 읽을 수 있는 상태로 되돌리자 비로소 이 결함들이
분리 가능해졌다 — 즉 지금이 이 문제를 볼 수 있게 된 첫 시점이다.
-->
