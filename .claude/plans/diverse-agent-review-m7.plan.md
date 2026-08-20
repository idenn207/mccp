# Plan: diverse-agent-review #7 — budget 게이트를 라이브로 발화시킨다

**Source PRD**: `.claude/prds/diverse-agent-review.prd.md`
**Selected Milestone**: #7 — budget 게이트 라이브 발화 관측
**Complexity**: Small

## Summary

M4는 budget 게이트를 **구조적 도달 불가**에서 벗어나게 했고(producer가 `minRemaining`을 emit하지 않아 `remaining < 0`이 어떤 값으로도 참이 될 수 없던 상태), 그것을 test harness에서 실행해 보였다. 운영자는 그 실증을 **미충족**으로 판정했다 — "실행 가능함은 실행됨이 아니다"(UI5). #6은 게이트를 4회 라이브로 돌렸으나 budget 축은 관측하지 못했다(그 4회는 예산 목표가 없는 turn이었다).

이 milestone은 **라이브 `/mccp:plan` turn에서 budget 게이트가 실제로 발화하는 것을 관측**하고, agent 0개 spawn + 실측 `remaining`/`minRemaining`을 증거로 고정한다.

발화 조건은 코드가 정한다 — `plugins/mccp/scripts/workflows/plan-review.js:161`은 `budget.total && budgetRemaining < minRemaining`이다. **첫 항이 이 milestone의 전부를 결정한다**: 예산 목표가 없는 turn에서 `budget.total`은 `null`이므로 게이트는 어떤 잔량에서도 발화하지 않는다. 따라서 라이브 관측의 유일한 경로는 **예산 목표를 실은 turn**이고, 그것은 코드가 아니라 운영자가 발행한다. 이 plan은 그 turn의 조건을 결정적으로 도출하고, 산출된 증거를 O3의 덮어쓰기에서 분리해 고정한다.

**동작 코드는 0줄 바꾼다**(UI6). 이 milestone이 소유하는 것은 관측과 그 기록이다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | Codex를 완전히 제거하지 않는다 — hybrid opt-in으로 존속시킨다 | exclusion |
| UI2 | 모든 게이트를 동시에 전환하지 않는다 — 점진적으로 간다 | exclusion |
| UI3 | 산출 이력이 0인 지표는 달성이 아니라 forward-only로 적는다 | constraint |
| UI4 | receipt schema version bump 없이 present-only 필드로 처리한다 | exclusion |
| UI5 | 실행 가능함은 실행됨이 아니다 — 시뮬레이션을 라이브 발화의 증거로 쓰지 않는다 | constraint |
| UI6 | 게이트 배선 오라클 추출 전까지 배선 추가를 최소화한다 | constraint |
| UI7 | milestone 표의 행 순서가 곧 실행 순서이며 next pending 선택도 이를 따른다 | direction |
| UI8 | 머지·배포된 뒤에만 관측 가능한 항목은 그 milestone의 것이 아니다 | direction |
| UI9 | 회귀 test는 수정 전 실패를 실측한 것만 인정한다 | constraint |
| UI10 | 인접 측정을 목표 측정으로 승격하지 않는다 | constraint |
| UI11 | Gemini 등 다른 외부 모델을 도입하지 않는다 | exclusion |
| UI12 | budget 게이트가 라이브로 발화해 agent 0개 spawn과 실측 잔량이 남아야 한다 | direction |

## Preconditions — 이번에는 런타임이 막지 않는다 (실측 2026-08-16)

#4·#6의 이관 사유는 매번 "설치된 런타임에 그 코드가 없다"였다(UI8). 이번에는 그렇지 않다 — 아래는 이 저장소·이 머신에서 실측한 것이다.

| 축 | 실측값 |
|---|---|
| installed plugin | `1.25.1` (`installed_plugins.json`, `lastUpdated` 2026-08-16) |
| 설치 트리 ↔ 워크트리 | `workflows/plan-review.js` · `plan-review/budget.js` · `plan-review/record.js` **바이트 동일** (`diff -q` 3건 무출력) |
| `cli.js mode` | `mode=multi-agent` · `fires.l1/l2=true`, `l3=false` · `quorum 3of4` · `roles_min=3` · `fleet_keys=[architect, security, test, invariant]` |
| `derive-decision` | `--command mccp:plan --args .claude/prds/diverse-agent-review.prd.md` → `diverse-agent-review` |
| env | `MCCP_CODEX_DISABLED=1` · `MCCP_PLAN_REVIEW` 미설정(→ multi-agent) · `MCCP_PLAN_REVIEW_BUDGET` 미설정(→ 기본 150000) |

즉 **UI8의 순환은 이 milestone에 없다**. 관측 대상 코드가 이미 설치돼 있으므로 머지 전에 관측이 성립한다.

### 발화 조건의 결정적 도출

- `plugins/mccp/scripts/lib/cli.js`가 아니라 `plugins/mccp/scripts/lib/plan-review/cli.js:347`이 `minRemaining`의 유일한 producer이며, 값은 `panelMinRemaining(env, fleet.length)`이다.
- `plugins/mccp/scripts/lib/plan-review/budget.js:86` — `perReviewer × fleetLength`. 기본 `perReviewer=150000`, `fleet.length`는 예약이 granted한 수(정상 4, quorum 하한 3).
- 따라서 **minRemaining ∈ {450000(fleet 3), 600000(fleet 4)}**.
- 발화하려면 `budget.total`이 truthy이면서 `budget.remaining() < minRemaining`이어야 한다. 예산 목표 `+200k`는 두 경우 모두에서 부등식을 만족하며, 동시에 turn이 Phase 1~5.2에 도달하기에 충분한 여유를 남긴다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 증거 파일 고정 | `.claude/reviews/plan-review-diverse-agent-review-m6-r4-blocked.md` | slug 공유 덮어쓰기(O3)에서 레코드를 분리하고 실행 성격을 파일명에 박는다 |
| provenance 주석 | 같은 파일의 H1 + 고정 사유 주석 | 측정 블록은 바이트 무변경으로 두고 파일 정체성만 주석으로 밝힌다 (M6 D3) |
| 관측 결과의 기록 | `.claude/PRPs/reports/diverse-agent-review-m6-report.md` | 관측이 미달을 확정하는 것도 산출물이며, 증거 강도를 provenance 열로 구분한다 |
| 지표 정직성 | `.claude/prds/diverse-agent-review.prd.md` | 산출 0인 지표는 forward-only로 적고 status로 감추지 않는다 |
| version 동기 | `CLAUDE.md` | §3.7 — `plugin.json`을 정본으로 두고 렌더러 footer 2면을 맞춘다 |
| 게이트 승인 부재의 기록 | `.claude/plans/diverse-agent-review-m6.plan.md` | 패널이 승인하지 않았을 때 어떤 경로로 구현했는지를 보고서가 소유한다 (M6 DN2) |

인라인 Pattern Grounding으로 수집했다 — Phase 2.5 fan-out은 이번 실행에서 발화하지 않았고, 커맨드가 정의한 fail-open 경로가 이 표다.

## Design Notes

**DN1 — 관측 turn은 운영자가 발행한다. 그것을 자동화하려는 시도가 M6의 실측 실패였다.** `budget.total`은 turn의 예산 지시에서만 생기고(`plan-review.js:161`의 첫 항), 그 지시는 `/mccp:prp-implement`가 만들 수 있는 것이 아니다. M6의 R3→R4에서 findings가 7→19로 역전한 원인이 정확히 "운영자 수동 절차를 없애려는 구조 재편"이었다 — 표면을 줄이려는 재편이 새 표면을 만들었다. 이 plan은 그 교훈을 적용해 수동 절차를 **없애지 않고 정확히 규정**한다: 무엇을 입력하고, 무엇을 기대하고, 무엇을 캡처하는지.

**DN2 — 관측 turn의 기대 결과는 HALT다. 그것이 성공이다.** budget skip은 `plugins/mccp/scripts/lib/plan-review/cli.js:435`에서 `unavailable`로 fail-closed 판정되고 `decide`가 exit 12를 낸다. 즉 이 관측은 **차단 경로**를 하나 더 만든다 — receipt는 쓰이지 않고 그 turn의 plan draft는 승인받지 못한다. 이것은 결함이 아니라 게이트의 설계이며, 관측이 끝난 뒤 plan 본문을 바이트 단위로 되돌리는 것(Task 2)이 이 turn을 비파괴로 만든다.

**DN3 — 관측 turn은 이 plan 본문을 덮어쓴다. 되돌림은 주장이 아니라 sha256으로 증명한다.** `/mccp:plan`은 PRD 모드에서 Phase 4가 plan 아티팩트를 다시 쓴다. 관측 turn도 예외가 아니므로 `.claude/plans/diverse-agent-review-m7.plan.md`가 새 draft로 바뀐다. 되돌리지 않으면 직전에 봉인된 `mccp-plan-codex` receipt가 `planAwareMarkdownHash` 불일치로 즉시 stale이 되고, 복구는 재봉인이 아니라 게이트 재실행이다(M6 I2가 같은 형태로 실측). 그래서 관측 **전** sha256을 고정 레코드의 provenance 주석에 박고, 되돌린 뒤 같은 값이 나오는 것을 Validate가 강제한다.

**DN4 — 관측은 Task 순서상 맨 앞이어야 한다. L1이 CREATE 행을 실존으로 검사하기 때문이다.** `plugins/mccp/scripts/lib/plan-review/l1-check.js:333`은 CREATE 대상이 이미 존재하면 `C3_CREATE_EXISTS`로 divergent를 낸다. 이 plan의 산출물을 먼저 만들면 관측 turn이 그리는 새 draft의 CREATE 행이 실존과 충돌해 **L1에서 막히고 L2가 아예 발화하지 않는다** — 그러면 budget 축은 관측되지 않는다. M4가 자기 plan을 사후 검사했을 때 정확히 이 형태로 `C3_CREATE_EXISTS` 4건을 맞았다. 따라서 산출물 생성 전에 관측을 끝낸다.

**DN5 — "agent 0개 spawn"의 증명 구조와 그 한계.** 세 층으로 주장한다. (a) `l2.json`이 `skipped:true, reason:"budget", coverage:0, results:[]`를 담는다 — 워크플로 자신의 반환값이다. (b) 배송된 소스에서 budget 조기 반환(`plan-review.js:161`)이 `phase('Refute')`와 유일한 `agent()` 호출(`plan-review.js:185`)보다 **앞선다** — 그래서 그 분기를 탄 실행은 agent를 만들 수 없다. 이것은 인덱스 비교로 기계 검증한다. (c) 5.2d의 skip 분기가 예약을 `--actual 0`으로 reconcile한다. **한계**: 이 셋 중 어느 것도 프로세스 외부에서 spawn 수를 직접 센 것이 아니다. (b)가 구조적 함의를 제공하고 (a)가 그 분기를 탔음을 증명하는 조합이며, 그 이상을 주장하지 않는다.

**DN6 — 예산 목표를 낮추는 것은 시뮬레이션이 아니다.** UI5가 금지하는 것은 **실행 경로의 대체**다(test harness가 워크플로 소스를 추출해 실행하는 것). 예산 목표는 이 게이트가 존재 이유로 삼는 바로 그 입력이며, 그것을 실제로 낮춘 turn에서 프로덕션 경로가 그대로 실행된다. 무엇을 어떤 값으로 설정했는지는 보고서가 축자로 남긴다 — 조건을 숨기고 발화만 보고하는 것이 부정직이지, 조건을 밝히고 발화시키는 것은 아니다. **`MCCP_PLAN_REVIEW_BUDGET`은 기본값 그대로 둔다**: 게이트 자신의 임계를 건드리지 않고 turn 쪽 조건만 만족시키는 편이 관측으로서 더 강하다.

**DN7 — 이 plan이 게이트 승인을 못 받을 수 있다(M6 실측).** #6은 4회 라이브에서 승인 0건이었고 관점 단위로 16회 중 pass 2회였다. 승인이 나지 않으면 receipt가 없어 `/mccp:prp-implement`가 시작되지 않는다. 그때의 경로는 M6 DN2와 같다 — `MCCP_PLAN_REVIEW=codex` 폴백이며, 현 환경의 `MCCP_CODEX_DISABLED=1` 때문에 `codex_verdict='skipped'`가 봉인된다. `skipped`는 `converged`가 아니므로 cross-gate dedupe는 fail-closed로 남고 terminal `/mccp:pr`에서 PR-Codex가 발화한다 — cross-model 검증은 제거되는 것이 아니라 ship 지점으로 이동한다. **어느 경로를 탔든 보고서 `## 승인자 기록`이 그것을 적는다.**

**DN8 — 통과 경로 지표는 이 milestone이 주장하지 않되, 관측되면 숨기지도 않는다.** PRD Success Metrics의 통과 경로 행은 현재 forward-only이고 그 관측은 #8에 의존한다. 만약 **이 plan 자신의 게이트**가 승인으로 끝났다면 그 순간 통과 경로가 1회 관측된 것이므로 Task 3이 실측치를 기입한다(UI3은 미관측을 달성으로 적는 것을 금할 뿐, 관측된 것을 지우라고 하지 않는다). 승인이 나지 않았다면 행은 forward-only 그대로 두고 사유를 갱신한다. **어느 쪽이든 #8은 닫히지 않는다** — 1회 승인은 캘리브레이션이 아니다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `.claude/reviews/plan-review-diverse-agent-review-m7-budget.md` | CREATE | budget 발화 관측 레코드를 slug 공유 덮어쓰기(O3)에서 분리해 고정 |
| `.claude/PRPs/reports/diverse-agent-review-m7-report.md` | CREATE | B1~B3의 근거 · 관측 조건 축자 · provenance · 승인자 기록 |
| `.claude/prds/diverse-agent-review.prd.md` | UPDATE | #7 status + Outcome 확정 · Evidence에 "M7 실측" · Success Metrics 갱신 · Open Questions |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.25.1 → 1.25.2` (§3.7 patch — PRD 전체는 미완료) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `CHANGELOG.md` | UPDATE | `[1.25.2]` 항목 + versioning note의 `currently` 갱신 |

> 이 plan 파일 자신은 표에 없다 — L1이 CREATE 행을 실존으로 검사하므로(DN4) 이미 존재하는 파일을 CREATE로 적으면 게이트가 자기 plan을 반려한다. `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`도 없다: 기대 version을 `plugin.json`에서 파생하므로 수정 대상이 아니라 검증 수단이다(M6 D5). `plugins/mccp/commands/` · `plugins/mccp/scripts/lib/plan-review/` · `plugins/mccp/scripts/workflows/`는 **한 줄도 바꾸지 않는다**(UI6) — 신규 test 파일도 만들지 않는다. 이 milestone은 동작을 바꾸지 않으므로 새 test는 수정 전 실패를 가질 수 없고, UI9가 그런 test를 회귀로 인정하지 않는다. 필요한 기계 검증은 Validate 블록의 인라인 단언이 수행한다.

## Tasks

### Task 1: 관측이 덮어쓰기 전에 이 게이트 자신의 레코드를 확보한다

O3 때문에 `.claude/reviews/plan-review-diverse-agent-review.md`는 이 PRD의 모든 실행이 공유하며 무조건 덮어써진다. 관측 turn이 그 파일을 지우기 전에 저장소 **밖** 스크래치로 복사한다 — 저장소에 파일을 만들면 Task 2의 L1이 `C3_CREATE_EXISTS`로 막힌다(DN4).

- **Action**: `.claude/reviews/plan-review-diverse-agent-review.md`(이번 `/mccp:plan` 실행이 남긴 레코드)를 `$(git rev-parse --git-path mccp/tmp)/m7-gate-record.md`로 복사하고, 그 `## Measurement` JSON을 콘솔에 전사해 세션에 남긴다. 파일이 없으면(mode=codex 폴백으로 진입한 경우) 그 사실 자체를 기록하고 넘어간다 — 없는 레코드를 만들지 않는다.
- **Mirror**: `.claude/reviews/plan-review-diverse-agent-review-m6-r4-blocked.md`의 고정 동기(O3, M6 DN3)
- **Validate**:

```bash
node -e "
const fs=require('fs'), cp=require('child_process');
const dir=cp.execSync('git rev-parse --git-path mccp/tmp').toString().trim();
const S=dir+'/m7-gate-record.md';
const live='.claude/reviews/plan-review-diverse-agent-review.md';
if(!fs.existsSync(S)){
  if(fs.existsSync(live)) throw new Error('live record exists but was not captured to '+S);
  console.log('no gate record produced (codex-mode fallback) — recorded as absent, not fabricated');
  process.exit(0);
}
const md=fs.readFileSync(S,'utf8');
const i=md.indexOf('# Plan Review Panel');
if(i<0) throw new Error('captured file is not a review record');
const m=md.slice(md.indexOf('Measurement')).match(/[\`]{3}json\r?\n([\s\S]*?)\r?\n[\`]{3}/);
if(!m) throw new Error('no measurement json fence in the captured record');
const j=JSON.parse(m[1]);
console.log('captured gate record: verdict='+j.verdict+' halt_stage='+j.halt_stage+' wall_clock_ms='+j.wall_clock_ms);
"
```

### Task 2: budget 게이트를 라이브로 발화시키고 증거를 고정한다

이 milestone의 본체다. **저장소 산출물을 하나도 만들기 전에** 실행한다(DN4).

- **Action**: 네 단계로 나뉜다.
  1. **관측 전 고정** — 이 plan의 sha256을 계산해 기록하고, 본문 사본을 `$(git rev-parse --git-path mccp/tmp)/m7-plan-before.md`에 둔다(DN3).
  2. **운영자 turn 발행** — 운영자가 **예산 목표 `+200k`를 실은 새 turn**에서 `/mccp:plan .claude/prds/diverse-agent-review.prd.md`를 실행한다. `MCCP_PLAN_REVIEW_BUDGET`은 건드리지 않는다(DN6). 기대 결과는 5.2e HALT이며 stop 메시지가 `remaining`/`minRemaining`을 이름으로 부른다.
  3. **캡처** — 그 turn이 남긴 `.claude/state/plan-review/l2.json` · `decision.json`과 `.claude/reviews/plan-review-diverse-agent-review.md`를 읽어 `l2.json` 전문을 보고서용으로 보존하고, 레코드를 `.claude/reviews/plan-review-diverse-agent-review-m7-budget.md`로 고정한다. H1을 파일명에 맞추고 provenance 주석에 `plan_sha256_before: <hex>`와 관측 조건(예산 목표 값 · `MCCP_PLAN_REVIEW_BUDGET` 미설정)을 적되 **`## Measurement` 블록은 바이트 무변경**으로 둔다(M6 D3).
  4. **되돌림** — 1단계 사본으로 plan 본문을 복원하고 sha256이 일치하는지 확인한다.
- **Mirror**: `.claude/reviews/plan-review-diverse-agent-review-m6-r4-blocked.md` (고정 + provenance 주석 + 측정 블록 무변경)
- **Validate**:

```bash
node -e "
const fs=require('fs'), crypto=require('crypto');
const P='.claude/plans/diverse-agent-review-m7.plan.md';
const F='.claude/reviews/plan-review-diverse-agent-review-m7-budget.md';
if(!fs.existsSync(F)) throw new Error('pinned budget record missing: '+F);
const md=fs.readFileSync(F,'utf8');

// (a) 관측 레코드가 budget 발화를 담는가 — 수치는 레코드 자신이 소유한다
const m=md.slice(md.indexOf('Measurement')).match(/[\`]{3}json\r?\n([\s\S]*?)\r?\n[\`]{3}/);
if(!m) throw new Error('no measurement json fence');
const j=JSON.parse(m[1]);
if(j.verdict!=='unavailable') throw new Error('budget skip must be fail-closed unavailable, got '+j.verdict);
if(j.halt_stage!=='5.2e') throw new Error('expected halt_stage 5.2e, got '+j.halt_stage);
if(!Number.isInteger(j.wall_clock_ms)) throw new Error('wall_clock_ms not an integer: '+j.wall_clock_ms);
const l2=String(j.layers&&j.layers.l2||'');
const b=l2.match(/^skipped \(budget: remaining (\d+) < (\d+)\)$/);
if(!b) throw new Error('layers.l2 does not record a live budget skip: '+l2);
const rem=Number(b[1]), min=Number(b[2]);
if(!(rem<min)) throw new Error('recorded numbers do not satisfy the firing condition: '+rem+' < '+min);
if(min!==450000 && min!==600000) throw new Error('minRemaining outside the derived set {450000,600000}: '+min);

// (b) 배송된 워크플로에서 budget 조기 반환이 모든 agent 호출보다 앞선다 (DN5b)
const wf=fs.readFileSync('plugins/mccp/scripts/workflows/plan-review.js','utf8');
const iBudget=wf.indexOf(\"reason: 'budget'\");
const iPhase=wf.indexOf(\"phase('Refute')\");
const iAgent=wf.indexOf('agent(');
if(iBudget<0||iPhase<0||iAgent<0) throw new Error('workflow source shape changed — re-derive the 0-spawn argument');
if(!(iBudget<iPhase && iBudget<iAgent)) throw new Error('budget return no longer precedes the panel launch');

// (c) plan 본문이 관측 전 바이트로 복원됐다 (DN3)
const want=(md.match(/plan_sha256_before:\s*([0-9a-f]{64})/)||[])[1];
if(!want) throw new Error('pinned record carries no plan_sha256_before');
const got=crypto.createHash('sha256').update(fs.readFileSync(P)).digest('hex');
if(got!==want) throw new Error('plan body not restored: '+got+' != '+want);

console.log('live budget firing: remaining '+rem+' < minRemaining '+min+' · halted 5.2e in '+j.wall_clock_ms+'ms · plan restored');
"
```

### Task 3: PRD에 관측을 기입하고 #7을 확정한다

- **Action**: **Evidence**에 `M7 실측` 절을 추가해 세 관측을 근거와 함께 적는다 — **B1** 발화 조건(`budget.total` 부재 시 어떤 잔량에서도 미발화, 그래서 관측은 예산 목표를 실은 turn에서만 가능하다) · **B2** 실측 발화(`remaining`/`minRemaining` 수치 · agent 0 spawn의 3층 증명과 DN5의 한계) · **B3** 게이트 대비 fan-out의 비대칭(같은 부족 상황에서 fan-out은 fail-open으로 진행하고 패널은 fail-closed로 HALT한다 — 관측 turn이 둘을 동시에 보였다면 그 사실을, 아니면 관측되지 않았음을 적는다). **milestone #7** status를 `complete`로 바꾸고 Plan 셀에 이 plan 경로를 적는다. **Success Metrics**: 통과 경로 행은 DN8의 조건부 규칙을 따른다 — 이 plan의 게이트가 승인으로 끝났으면 그 wall-clock 실측치를 적고, 아니면 forward-only를 유지하되 사유를 갱신한다. **Open Questions**의 "목표 10분 달성 실측" 항목에 이번 관측이 답하지 **않는다**는 사실을 한 줄로 남긴다(차단 경로가 하나 더 늘었을 뿐이다).
- **Mirror**: 같은 PRD의 "M6 실측 (2026-08-14 추가)" 절 구조와 #4 → #6 이관 note의 어법
- **Validate**:

```bash
node -e "
const fs=require('fs');
const prd=fs.readFileSync('.claude/prds/diverse-agent-review.prd.md','utf8');
const lines=prd.split(/\r?\n/);
const ev=prd.slice(prd.indexOf('## Evidence'), prd.indexOf('## Users'));
if(ev.indexOf('M7')<0) throw new Error('Evidence carries no M7 section');
for(const k of ['B1','B2','B3']) if(ev.indexOf(k)<0) throw new Error('Evidence does not carry '+k);
if(!/minRemaining/.test(ev)) throw new Error('Evidence does not name the observed threshold');

const rowOf=n=>lines.find(l=>new RegExp('^\\\\|\\\\s*'+n+'\\\\s*\\\\|').test(l));
const m7=rowOf(7);
if(!m7) throw new Error('milestone #7 row not found');
if(!/complete/.test(m7)) throw new Error('#7 not marked complete');
if(!/diverse-agent-review-m7\.plan\.md/.test(m7)) throw new Error('#7 Plan cell not filled');
for(const n of [8,5,9]) if(!/pending/.test(rowOf(n)||'')) throw new Error('#'+n+' must stay pending — this milestone does not close it');

// DN8 — 통과 경로 행은 관측과 일치해야 한다. 둘 다 강제한다.
const pass=lines.find(l=>l.includes('plan 게이트 wall-clock (통과 경로)'));
if(!pass) throw new Error('Success Metrics pass-path row not found');
const rec='.claude/reviews/plan-review-diverse-agent-review-m7-gate.md';
const approved=fs.existsSync(rec) && /\"verdict\": \"converged\"/.test(fs.readFileSync(rec,'utf8'));
const hasNum=/[0-9][0-9,]*\s*(ms|초|분)/.test(pass);
if(approved && !hasNum) throw new Error('a pass path WAS observed — the row must carry it (DN8)');
if(!approved && hasNum) throw new Error('no pass path observed — the row must stay forward-only (UI3)');
if(!approved && !/forward-only/.test(pass)) throw new Error('unobserved pass path must read forward-only');
console.log('PRD updated: #7 complete · pass-path row consistent with observation (approved='+approved+')');
"
```

### Task 4: 보고서에 조건과 증거와 승인자를 기록한다

- **Action**: `.claude/PRPs/reports/diverse-agent-review-m7-report.md`에 필수 절을 둔다 — `## Summary` · `## 선행 조건`(installed `1.25.1` · `diff -q` 3건 · `cli.js mode` 출력 전사 — UI8의 순환이 이번엔 없다는 근거) · `## 관측 조건`(발행한 예산 목표 값과 `MCCP_PLAN_REVIEW_BUDGET`을 건드리지 않았다는 사실을 **축자로**, DN6) · `## B1`·`## B2`·`## B3` · `## agent 0 spawn 증명`(DN5의 3층과 **그 한계**) · `## 승인자 기록`(이 plan이 패널 승인으로 구현됐는지 codex 폴백이었는지, DN7) · `## 한계` · `## Acceptance 대조`. Task 2가 보존한 `l2.json` 전문을 fenced JSON으로 싣는다.
- **Mirror**: `.claude/PRPs/reports/diverse-agent-review-m6-report.md` 구조 (Assessment vs Reality + provenance 구분 + Acceptance 대조 표)
- **Validate**:

```bash
node -e "
const fs=require('fs');
const md=fs.readFileSync('.claude/PRPs/reports/diverse-agent-review-m7-report.md','utf8');
for(const h of ['## Summary','## 선행 조건','## 관측 조건','## B1','## B2','## B3','## agent 0 spawn 증명','## 승인자 기록','## 한계','## Acceptance 대조'])
  if(md.indexOf(h)<0) throw new Error('report missing required section: '+h);
const cond=md.slice(md.indexOf('## 관측 조건'), md.indexOf('## B1'));
if(!/MCCP_PLAN_REVIEW_BUDGET/.test(cond)) throw new Error('관측 조건 must state what the panel threshold was set to');
const proof=md.slice(md.indexOf('## agent 0 spawn 증명'), md.indexOf('## 승인자 기록'));
if(!/한계|직접 세|외부에서/.test(proof)) throw new Error('the 0-spawn section must state its limit (DN5)');
if(!/\"reason\": ?\"budget\"/.test(md)) throw new Error('report does not carry the verbatim l2.json evidence');
console.log('report OK');
"
```

### Task 5: version과 CHANGELOG를 동기한다

- **Action**: `plugin.json`을 `1.25.2`로 올리고 `html.js` page-foot·`markdown.js` derived 줄을 같은 값으로 맞춘 뒤 CHANGELOG에 `[1.25.2]` 항목과 versioning note의 `currently` 값을 갱신한다. 항목 본문은 **동작 코드 0줄에 관측·기록 milestone**임을 밝히고 관측 조건을 한 줄로 남긴다. 병렬 브랜치가 `1.25.2`를 선점했으면 §3.7 forward-only로 한 칸 올리고 5면을 다시 맞춘다.
- **Mirror**: `CLAUDE.md` §3.7 version 동기 + forward-only 상향
- **Validate**:

```bash
node --test "plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js"
node -e "
const fs=require('fs');
const v=require('./plugins/mccp/.claude-plugin/plugin.json').version;
if(!/^1\.25\.[2-9][0-9]*$/.test(v)) throw new Error('plugin.json not bumped past 1.25.1: '+v);
for(const f of ['plugins/mccp/scripts/lib/renderer/html.js','plugins/mccp/scripts/lib/renderer/markdown.js'])
  if(!fs.readFileSync(f,'utf8').includes('v'+v)) throw new Error(f+' footer version stale (want v'+v+')');
const cl=fs.readFileSync('CHANGELOG.md','utf8');
if(cl.indexOf('## ['+v+']')<0) throw new Error('CHANGELOG missing ['+v+'] heading');
if((cl.match(new RegExp('^## \\\\['+v.replace(/\\./g,'\\\\.')+'\\\\]','gm'))||[]).length>1) throw new Error('duplicate ['+v+'] heading — parallel-branch collision');
if(cl.indexOf('currently \`'+v+'\`')<0) throw new Error('versioning note currently value stale');
console.log('version surfaces synced at '+v);
"
```

## Validation

```bash
# Task 1-5 각 절의 Validate 블록이 정본이며 순서대로 실행한다.
# Task 2는 운영자 turn을 포함하므로 그 절의 절차를 먼저 완료해야 나머지가 성립한다.
# 아래는 그 위에 얹는 전역 불변식이다.

# UI6 — 게이트 배선 변경 0줄. 신규 test 파일도 없다(UI9 — 수정 전 실패를 가질 수 없는 test는 회귀가 아니다).
git diff --stat origin/main -- plugins/mccp/commands/ plugins/mccp/scripts/lib/plan-review/ plugins/mccp/scripts/workflows/

# UI4 — receipt schema · git-tracked ship corpus 무변경
git diff --stat origin/main -- plugins/mccp/scripts/receipt/ .claude/receipts/mccp-pr-codex/

# §3.5.1 — 이번 브랜치가 삭제하는 파일이 없는지 (머지 사고 검출)
git diff --diff-filter=D --name-only origin/main...HEAD

# 커밋된 신규 blob의 절대경로 누출
node plugins/mccp/scripts/lib/history-leak-scan.js

# 전량 회귀 — 동작 코드를 바꾸지 않으므로 전부 green이어야 한다
node --test "plugins/mccp/scripts/lib/tests/plan-review-*.test.js"
node --test "plugins/mccp/scripts/receipt/tests/*.test.js"
node --test "plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 관측 turn이 L1에서 막혀 L2가 발화하지 않고 budget 축이 미관측으로 끝난다 | **High (M4에서 실측 — `C3_CREATE_EXISTS` 4건)** | DN4 — 저장소 산출물 생성 **전에** Task 2를 실행한다. L1 divergence는 agent를 쓰지 않으므로 재시도가 저렴하다 |
| 관측 turn이 이 plan 본문을 덮어써 `mccp-plan-codex` receipt가 stale이 된다 | **High (설계상 — Phase 4가 항상 다시 쓴다)** | DN3 — 관측 전 sha256 + 사본, 관측 후 복원. Task 2 Validate (c)가 일치를 강제한다 |
| 예산 목표가 없는 turn에서 관측을 시도해 게이트가 발화하지 않는다 | Medium | `plan-review.js:161`의 첫 항이 `budget.total`이다 — Task 2가 `+200k`를 절차의 필수 입력으로 못박고 보고서가 그 값을 축자로 남긴다 |
| 예약이 3으로 degrade해 minRemaining이 450000이 되어 부등식이 달라진다 | Low | `+200k`는 450000·600000 양쪽에서 성립한다. Validate가 `minRemaining ∈ {450000,600000}`을 강제해 예상 밖 값이면 실패한다 |
| 조건을 밝히지 않고 발화만 보고해 관측이 조작으로 읽힌다 | Medium | DN6 — 보고서 `## 관측 조건`이 예산 목표 값과 `MCCP_PLAN_REVIEW_BUDGET` 미변경을 축자로 남기고, Task 4 Validate가 그 절의 존재를 강제한다 |
| "agent 0개 spawn"을 증명보다 강하게 주장한다 | Medium | DN5 — 3층 증명과 그 한계를 함께 적고, Task 4 Validate가 한계 문장의 부재를 실패로 처리한다 |
| 관측 레코드가 다음 실행에 덮어써진다 (O3) | **High (실측 — 4회 중 3건 소멸)** | Task 2가 캡처 직후 고정한다. 고정 파일명이 실행 성격(`-m7-budget`)을 밝힌다 |
| 이 plan이 패널 승인을 받지 못한다 | **High (M6 실측 — 16회 중 pass 2회)** | DN7 — `MCCP_PLAN_REVIEW=codex` 폴백이 문서화된 복구 경로이며 아무것도 세탁하지 않는다. 보고서 `## 승인자 기록`이 실제 경로를 남긴다 |
| 병렬 브랜치가 `1.25.2`를 선점한다 | **Medium (7회 재발)** | §3.7 forward-only 상향 · Task 5 Validate가 heading 중복과 5면 drift를 검출 |
| 통과 경로 지표를 이 milestone이 슬쩍 주장한다 | Medium | DN8 — Task 3 Validate가 관측 여부와 행 내용의 **양방향** 일치를 강제한다(관측했는데 안 적어도, 관측 못 했는데 적어도 실패) |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동) — **본 milestone은 라이브 `/mccp:plan` turn에서 budget 게이트가 발화해 `.claude/reviews/…-m7-budget.md`가 `layers.l2 = "skipped (budget: remaining R < M)"`를 담는 것으로 이를 충족한다**
- [ ] 고정 레코드가 `verdict: "unavailable"` ∧ `halt_stage: "5.2e"` ∧ 정수 `wall_clock_ms` ∧ `remaining < minRemaining`을 담고, `minRemaining`이 도출된 집합 {450000, 600000} 안에 있다
- [ ] 배송된 `plugins/mccp/scripts/workflows/plan-review.js`에서 budget 조기 반환이 `phase('Refute')`와 모든 `agent(` 호출보다 앞선다는 것이 인덱스로 검증됐다 (DN5b)
- [ ] 관측 후 `.claude/plans/diverse-agent-review-m7.plan.md`의 sha256이 관측 전 값과 일치한다 (DN3)
- [ ] 보고서 `## 관측 조건`이 발행한 예산 목표와 `MCCP_PLAN_REVIEW_BUDGET` 미변경을 축자로 담는다 (DN6)
- [ ] 보고서 `## agent 0 spawn 증명`이 3층 근거와 **그 한계**를 함께 담는다 (DN5)
- [ ] 보고서 `## 승인자 기록`이 이 plan이 실제로 어떤 경로로 구현됐는지 적는다 (DN7)
- [ ] PRD Evidence가 B1·B2·B3을 각각 근거와 함께 담고, milestone #7이 `complete`이며 #8·#5·#9는 `pending`으로 남는다
- [ ] PRD Success Metrics 통과 경로 행이 실제 관측과 일치한다 — 승인이 관측됐으면 수치를, 아니면 forward-only를 담는다 (DN8, UI3)
- [ ] `plugins/mccp/commands/` · `plugins/mccp/scripts/lib/plan-review/` · `plugins/mccp/scripts/workflows/` 변경 0줄, 신규 test 파일 0건 (UI6, UI9)
- [ ] receipt schema · `receipt_hash` · git-tracked ship corpus 무변경 (UI4)
- [ ] `plugin.json` `1.25.2` + `html.js`/`markdown.js` footer 동기, `i18n-surface.test.js` green

## Design Critique

- 트리거: `impeccable-detect --mode plan` → `design_signal=true` (axis a) · `skill_available=true` · `signal_files=[plugins/mccp/scripts/lib/renderer/html.js, plugins/mccp/scripts/lib/renderer/markdown.js, plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js]`
- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` Read 완료
- 라운드: 1 (`MCCP_DESIGN_CRITIQUE_MAX_RETRY` 기본 2 — R0에서 종료) · verdict **CONVERGED** (`decideCritique({findings: [], round: 0, cap: 2})` 실측)
- Assessment A — 이 plan이 도입하는 렌더 표면 변경은 footer version 리터럴 2건뿐이다 (`plugins/mccp/scripts/lib/renderer/html.js:1419` page-foot · `plugins/mccp/scripts/lib/renderer/markdown.js:163` derived 줄). 세 번째 signal 파일은 기대값을 `plugin.json`에서 파생하므로 수정 대상이 아니다.
  - 정보 위계 3단계(H15): heading 미변경 → PASS
  - 강조색 화면당 1개: 색·토큰 미변경 → PASS
  - raw markdown marker 금지: `markdown.js`의 `_derived from …_`은 markdown 표면 자신의 문법이고 `html.js`는 `<code lang="en">`로 정상 마크업 → PASS
  - 한 화면 항목 수 상한: 리스트 렌더링 미변경 → PASS (collapse는 renderer 소유이지 plan 저자 소유가 아님)
- HIGH/CRITICAL 0건 → 재편집 없이 종료. Phase 3.7 produced-diff grounding lint은 구현 시 version 리터럴만 바뀌므로 H15 앵커에 걸릴 added 줄이 없다.
- Persistence: `.impeccable/critique/` 스냅샷 write는 생략 — `Files to Change`에 없는 저장소 아티팩트를 게이트 도중 만들지 않는다(M1·M4·M6 선례와 동일).

## Design Routing Guide

routing mode: `auto` (effective at implement stage). 이 plan은 렌더 UI를 만들지 않으므로 plan 단계에서는 어떤 impeccable 명령도 호출하지 않는다 — 아래는 구현자를 위한 체크리스트다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->

