---
status: draft
---

# Plan: plan-review 잔여 부채 2건 (dead budget gate + dry-run acceptance)

**Source PRD**: `.claude/prds/diverse-agent-review.prd.md`

## Summary

diverse-agent-review M1 ship 직후 `/mccp:code-review`가 남긴 잔여 부채 두 건을 닫는다. 둘은 서로 독립이고 공통 축이 없다 — 하나는 **발화할 수 없는 게이트**이고, 하나는 **없어서 결함 8건을 통과시킨 acceptance 항목**이다.

**축 A — budget 게이트가 죽어 있다.** `plugins/mccp/scripts/workflows/plan-review.js:126`은 `budget.total && budget.remaining() < minRemaining`으로 패널 발화를 막는다. 그런데 `minRemaining`은 `input.minRemaining`에서 오고, 이 값을 만드는 유일한 producer인 `plugins/mccp/scripts/lib/plan-review/cli.js:220`의 payload에는 그 키가 **없다**. 따라서 `minRemaining`은 항상 0이고 조건은 절대 참이 되지 않는다. `plan-fanout`은 같은 자리에 `MCCP_PLAN_FANOUT_BUDGET`(관점당 최소 토큰 × fleetSize)을 갖고 있으므로 대칭이 있다.

**축 B — acceptance에 live 경로 확인이 없다.** M1의 검증은 전량 단위 테스트 + `node --check`였고, 그 결과 command body ↔ 오라클 seam 결함 8건이 통과했다. 그 층은 정의상 단위 테스트가 닿지 않는다. acceptance에 "multi-agent 경로 1회 완주"를 명문화해야 M2/M3에서 같은 종류가 다시 샌다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/plan-review/cli.js` | UPDATE | payload에 `minRemaining` emit (축 A) |
| `plugins/mccp/scripts/workflows/plan-review.js` | UPDATE | budget skip 사유를 log에 명시 (축 A) |
| `plugins/mccp/scripts/lib/tests/plan-review-cli-emit.test.js` | UPDATE | `minRemaining` 산출 회귀 test (축 A) |
| `.claude/plans/diverse-agent-review-m1.plan.md` | UPDATE | Acceptance에 dry-run 항목 추가 (축 B) |

## Tasks

### Task 1: budget 임계를 payload에 실어 게이트를 살린다

`MCCP_PLAN_REVIEW_BUDGET`(default 150000, `MCCP_PLAN_FANOUT_BUDGET` 미러)을 파싱해 `minRemaining = budget × fleet.length`로 환산하고 `emit-workflow-args` payload에 넣는다. fleet이 예약으로 상한된 뒤 계산해야 실제 발화할 리뷰어 수를 반영한다.

- **Action**: `cli.js`에 `parsePanelBudget(env)` 추가 후 payload에 `minRemaining` 필드 emit. 비정상 값은 default + loud warn (`parseRolesMin` 패턴).
- **Validate**: `node --test "plugins/mccp/scripts/lib/tests/plan-review-cli-emit.test.js"`

### Task 2: budget skip이 조용하지 않게 한다

현재 skip 경로는 `skipped: true, reason: 'budget'`를 반환하고 끝난다. 게이트에서 이건 `decide`가 `responded === 0`으로 `unavailable` HALT하는 결과가 되는데, 운영자에게는 "패널이 왜 안 떴는지"가 로그에만 남는다.

- **Action**: skip 반환에 `minRemaining`/`remaining` 실측치를 포함해 `decide`의 `reason`이 예산 부족임을 특정할 수 있게 한다.
- **Validate**: `node --check plugins/mccp/scripts/workflows/plan-review.js`

### Task 3: acceptance에 live 경로 완주를 명문화한다

- **Action**: `diverse-agent-review-m1.plan.md`의 `## Acceptance`에 "multi-agent 경로를 실제로 1회 완주하고 receipt에 review triple이 봉인됨을 확인" 항목을 추가한다.
- **Validate**: `node plugins/mccp/scripts/lib/plan-review/cli.js l1 --plan .claude/plans/diverse-agent-review-m1.plan.md` 가 새 항목으로 인해 새로운 위반을 만들지 않는지 확인

## Validation

```bash
node --test "plugins/mccp/scripts/lib/tests/plan-review-*.test.js"
node --check plugins/mccp/scripts/workflows/plan-review.js
```

## Risks

| Risk | Mitigation |
|---|---|
| 임계값을 근거 없이 정하면 정상 실행을 막는 새 게이트가 된다 | `MCCP_PLAN_FANOUT_BUDGET`의 검증된 150000을 그대로 미러하고, `budget.total` 미설정 시 게이트는 여전히 무발화(기존 동작 보존) |
| budget skip이 승인처럼 읽힐 수 있다 | skip은 `results: []`를 반환하므로 `decide`가 `unavailable`로 HALT — 게이트가 조용히 통과하는 경로는 없음 |
| 축 B가 문서 변경뿐이라 실효가 없을 수 있다 | acceptance 항목은 M2 게이트가 실제로 읽는 문서에 들어가며, 이번 사이클의 결함 8건이 근거로 함께 기록됨 |

## Acceptance

- [ ] `emit-workflow-args` payload에 `minRemaining`이 존재하고 `fleet.length`에 비례한다
- [ ] `budget.total` 미설정 시 패널 발화 동작이 변경 전과 동일하다
- [ ] budget skip 반환이 실측 `remaining`을 포함한다
- [ ] `diverse-agent-review-m1.plan.md` Acceptance에 dry-run 항목이 있다
