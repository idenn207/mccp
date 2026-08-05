# Red Test Suite Restore

## Problem

mccp의 테스트 스위트가 상시 red 상태다. 게이트 chain(stop-loop, `/mccp:prp-implement` validation loop, `/mccp:work` Step 3 통합 test)이 모두 "테스트 통과"를 진행 신호로 소비하는데, 그 신호가 이미 오염돼 있다. 결과적으로 **새로 도입된 회귀와 오래된 기존 red를 구분할 수 없다** — 전체 실행 결과가 red인 것은 항상 참이므로 정보량이 0이다.

방치 비용은 누적된다. red가 상수인 동안 각 cycle은 "이 실패가 내가 방금 만든 것인가"를 매번 수동으로 재판정해야 하고, 그 판정을 건너뛰면 실제 회귀가 기존 red에 섞여 조용히 통과한다.

## Evidence

이번 세션(2026-07-31)에 실측한 값이다. 추정이 아니다.

- `node --test "plugins/mccp/scripts/lib/renderer/tests/*.test.js"` → **tests 667 / pass 666 / fail 1**.
  실패 케이스: `verdict-label.test.js` 의 `verdict-label metric (F1) — #drawer-data 파싱: receipt/worktree verdict 필드 새 어휘` — `AssertionError: receipt detail 3건 / 0 !== 3`.
- `node --test "plugins/mccp/scripts/lib/tests/design-critique*.test.js"` → **tests 15 / pass 14 / fail 1**.
  실패 케이스: `design-critique-loop-e2e.test.js` — `AssertionError: expected synthetic fixture at .claude/cache/test-fixture-status.html`.
- **두 실패 모두 pre-existing**임을 A/B로 확인했다. 작업 중이던 워크트리 변경을 `git stash`로 제거하고 HEAD 파일로 동일 테스트를 재실행했을 때 실패가 동일하게 재현됐다(`tests 7 / pass 6 / fail 1`). 즉 현재 cycle이 만든 회귀가 아니다.
- 두 번째 실패는 **테스트 쪽 전제가 프로젝트 계약과 어긋난 사례**다. `CLAUDE.md` §3.9는 해당 합성 fixture를 두고 *"커밋물이 아니라 필요 시 test-time에만 쓰이는 임시 합성 파일이며 현재 tracked 상태가 아니다 — dogfood는 env 경로만으로 성립하므로 fixture 존재에 의존하지 않는다"* 고 명시한다. 그런데 테스트는 그 파일의 존재를 assert한다.
- 프로젝트 상태 기록(`.claude/state/STATE.md` Open Questions)이 이 두 건을 *"pre-existing 실패 2건 … 별도 cycle 유지"* 로 이미 적어 두고 있다 — 즉 인지된 채 여러 cycle을 넘어왔다.

## Users

- **Primary**: mccp 게이트 chain을 직접 돌리는 운영자 본인. 매 cycle `node --test` 결과를 회귀 판정에 쓴다.
- **Not for**: CI 파이프라인·외부 기여자. 현재 이 저장소는 CI에서 테스트를 강제하지 않고 외부 기여자도 없으므로, 이들을 위한 요구사항은 이 PRD의 대상이 아니다.

## Hypothesis

We believe **red 상태인 기존 테스트 2건의 제거**가 **`node --test` 전체 결과를 다시 이진 신호로 되돌려** **mccp 게이트를 돌리는 운영자**에게 회귀 판정 능력을 복원할 것이다.

We'll know we're right when **전체 테스트 스위트의 fail 수가 0이 되고, 이후 cycle에서 회귀가 도입되는 즉시 red로 드러난다**.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| 전체 스위트 fail 수 | 0 | `node --test` 를 전 테스트 경로에 대해 실행한 뒤 `ℹ fail` 값 |
| 회귀 판정에 드는 수동 확인 | 0회 | red 발생 시 stash A/B 재현 없이 곧바로 신규 회귀로 판정 가능 |
| 기존 통과 케이스 회귀 | 0건 | 수정 전후 pass 수 비교 — 감소가 없어야 함 |

## Scope

**MVP** — 위 두 실패 케이스를 각각의 **실제 원인에 맞게** 해소해 전체 스위트를 green으로 만든다. 두 실패는 성격이 다르므로 원인 판정이 선행되어야 한다: 하나는 프로덕션 파싱 경로와 테스트 기대 중 어느 쪽이 틀렸는지 아직 미확정이고, 다른 하나는 프로젝트 계약(§3.9)에 비추어 테스트 전제가 틀린 것이 유력하다.

**Out of scope**

- 테스트를 `skip`·삭제·주석 처리해 green을 만드는 것 — 신호를 복원하는 게 목적인데 신호원을 없애면 목적과 정반대다. red를 숨기는 어떤 형태의 조치도 이 PRD의 성공이 아니다.
- 프로덕션 동작 변경 — 원인이 프로덕션 쪽으로 판명되더라도 이번 범위는 **해당 실패를 설명하는 최소 수정**까지다. 인접 리팩터링은 별건.
- CI에서의 테스트 강제 도입 — 별개의 인프라 축이며 Users에서 제외했다.
- 나머지 테스트 표면의 커버리지 확대 — 본 PRD는 red 제거이지 커버리지 향상이 아니다.

## Delivery Milestones

<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | 테스트 신호 복원 | `node --test` 전체 실행이 fail 0으로 통과해, 이후 red가 곧 신규 회귀를 의미하게 된다 | in-progress | `.claude/plans/red-test-suite-restore-m1.plan.md` |

## Open Questions

- [ ] `#drawer-data` 실패의 원인이 **프로덕션 렌더러**인가 **테스트 기대**인가? receipt detail이 0건으로 파싱된다는 것은 드로어 데이터가 실제로 비어 있다는 뜻일 수도, 테스트가 낡은 어휘를 기대한다는 뜻일 수도 있다. 전자면 사용자에게 보이는 대시보드 결함이므로 심각도가 올라간다.
- [ ] 합성 fixture 실패를 테스트가 **스스로 fixture를 생성**하도록 고칠 것인가, **부재 시 skip**하도록 고칠 것인가? §3.9는 "dogfood는 env 경로만으로 성립한다"고 하므로 후자가 계약에 더 가깝지만, 그러면 해당 e2e 경로가 평시에 한 번도 실행되지 않는 문제가 남는다.
- [ ] 이 두 건 외에 다른 red가 남아 있는가? 본 PRD는 renderer 스위트와 design-critique 스위트만 실측했고 전 테스트 경로를 전수 실행하지 않았다.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `#drawer-data` 원인이 프로덕션 렌더러라 수정 범위가 테스트 밖으로 번진다 | Medium | Medium | 원인 판정을 먼저 수행하고, 프로덕션 수정이 필요하면 "실패를 설명하는 최소 수정"으로 한정. 범위 초과 시 별건으로 분리 |
| green을 빨리 만들려는 압력으로 테스트를 무력화(skip/삭제)한다 | Medium | High | Out of scope에 명시적으로 금지. 성공 지표를 "fail 0"이 아니라 "fail 0 **이면서 pass 수 비감소**"로 정의해 무력화를 지표가 잡도록 함 |
| fixture 부재 시 skip으로 처리하면 해당 e2e 경로가 영구 미실행이 된다 | High | Low | Open Question으로 남겨 `/mccp:plan` 단계에서 결정. skip을 택할 경우 그 사실을 테스트 이름·주석에 드러내 은폐가 아니게 함 |
| 전수 실행을 안 한 탓에 다른 red가 남아 Success Metric이 미달한다 | Medium | Low | MVP 착수 시 전 테스트 경로 1회 전수 실행으로 baseline 확정 |

## Design Direction

`impeccable-detect --mode prd` 는 `design_signal=true` 를 반환했다(`skill_available=true`). 다만 이는 **파일명 문자열 매칭에 의한 false positive** 다 — 신호원은 Evidence 절에 *인용된* 두 문자열(`.claude/cache/test-fixture-status.html`, renderer 테스트 glob)이며, 본 PRD 의 범위에는 렌더 surface 변경이 없다(대상은 테스트 파일 2개).

따라서 stage-aware routing 표는 생략한다 — 이 PRD 에 적용 가능한 impeccable 명령이 하나도 없어 표를 싣는 것은 노이즈다. 검출이 발화한 사실 자체는 여기 기록해 silent-skip 이 되지 않게 한다(loud-fail-open).

`/mccp:plan` 이 PRD 파생 plan 에 대해 검출을 **재수행**하며, 그 단계의 verdict 가 `mccp-plan-codex` receipt 에 stamp 되어 chain 의 정본이 된다. plan 단계에서 실제 렌더 surface 가 등장하면(예: `#drawer-data` 원인이 프로덕션 렌더러로 판명돼 `html.js` 가 대상이 되는 경우) 그때 critique retry loop 이 정상 발화한다.

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-07-31.*

<!--
Co-creation note: Problem / Users / Hypothesis 세 필드는 사용자가 제시안을 검토하고
"그대로"로 확정했다 (Assumption 아님). Evidence 는 본 세션 실측값이다. Scope /
Open Questions / Risks 는 사용자가 명시적으로 위임("해당 PRD의 판단은 claude가
진행해줘")한 범위에서 작성자가 판단해 작성했다.

Why now: 이 두 red 는 실제 gap 이면서, 동시에 workflow-orchestration live-activation
M2 의 live 완주 관찰(row A — default firing) 대상으로 선택된 변경이다. 관찰 vehicle
로 쓰인다는 사실이 요구사항을 바꾸지는 않는다 — 위 Success Metrics 는 관찰과 무관하게
테스트 신호 복원만으로 판정된다.
-->
