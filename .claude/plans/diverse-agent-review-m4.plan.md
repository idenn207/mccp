# Plan: diverse-agent-review #4 — 통과 경로 실증 + 지표 부채 상환

**Source PRD**: `.claude/prds/diverse-agent-review.prd.md`
**Selected Milestone**: #4 — 통과 경로 실증 + 지표 부채 상환
**Complexity**: Medium

## Summary

M1은 계기를 배송했지만 **한 번도 눈금을 읽지 못했다**. 저장소 receipt 40개 중 `review_verdict`를 가진 것은 0건이고, 라이브 1회는 `divergent`로 착지해 통과 경로가 관측되지 않았다. 원인은 우연이 아니라 구조다 — wall-clock stamp가 `5.6b`의 receipt write 블록 안에만 있고, 차단된 실행은 그 앞에서 HALT하므로 **오래 걸린 실행일수록 기록될 확률이 낮다**(survivorship bias가 계기에 내장). 더해 plan 게이트 receipt는 `.gitignore:31`상 worktree-only라 §3.8 cleanup마다 소멸한다.

이 milestone은 세 축을 닫는다. **축 A(계측)** — 측정 표면을 receipt에서 `.claude/reviews/`의 리뷰 기록으로 옮긴다. 그 디렉터리는 이미 git-tracked이고(`.gitignore:111` 주석이 스스로를 "the DURABLE record"라 부른다), `5.2h`는 이미 통과·차단 양 경로에서 실행된다. 다만 지금은 **LLM이 손으로 타이핑하는 markdown**이라 측정치를 담을 수 없다 — 결정적 오라클(`record.js`)이 아티팩트에서 생성하도록 바꾸고, 5.2의 **모든** HALT 지점을 그 생성기를 거치게 한다. **축 B(발화)** — 발화 불가능하던 budget 게이트를 살린다(`workflows/plan-review.js:155`의 조건이 읽는 `minRemaining`을 유일한 producer인 `cli.js:334` payload가 emit하지 않아 항상 0). **축 C(실증)** — 패널 통과 경로를 실제로 1회 완주시키고, "라이브 완주"를 plan 템플릿의 acceptance 항목으로 명문화한다.

축 A는 배선을 **늘리지 않고 옮긴다** — LLM이 타이핑하던 리뷰 기록이 단위 test 사거리 안의 CLI 호출로 대체되므로, PRD Risks의 "#5 이전에는 배선 추가를 최소화" 제약과 같은 방향이다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | Codex를 완전히 제거하지 않는다 — hybrid opt-in으로 존속시킨다 | exclusion |
| UI2 | 모든 게이트를 동시에 전환하지 않는다 — 점진적으로 간다 | exclusion |
| UI3 | 산출 이력이 0인 지표는 "달성"이 아니라 forward-only로 적는다 | constraint |
| UI4 | L3 자동 트리거 임계 튜닝은 이번 실측 확보 전에 착수하지 않는다 | constraint |
| UI5 | 회귀 test는 수정 전 실패를 실측한 것만 인정한다 | constraint |
| UI6 | 게이트 배선 오라클 추출 전까지 배선 추가를 최소화한다 | constraint |
| UI7 | receipt schema version bump 없이 present-only 필드로 처리한다 | exclusion |
| UI8 | milestone 표의 행 순서가 곧 실행 순서이며 next pending 선택도 이를 따른다 | direction |
| UI9 | Gemini 등 다른 외부 모델을 도입하지 않는다 | exclusion |
| UI10 | wall-clock이 차단 경로에서도 기록돼 survivorship bias가 제거돼야 한다 | direction |
| UI11 | 라이브 완주를 acceptance 항목으로 명문화한다 | direction |
| UI12 | 발화 불가였던 budget 게이트가 실제로 발화해야 한다 | direction |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 예산 파서 | `plugins/mccp/scripts/lib/plan-fanout/budget.js:101` | `parseFanoutMinPerAgent(env)` — 양의 정수만 수용, 비정상 값은 default + loud warn |
| 예산 환산 | `plugins/mccp/scripts/lib/plan-fanout/budget.js:156` | `minRemaining = minPerAgent * FLEET_SIZE` 를 결과 객체에 실어 소비처로 전달 |
| 순수 오라클 + CLI seam | `plugins/mccp/scripts/lib/plan-review/quorum.js:134` | `decideQuorum(opts)` 순수 함수 · CLI는 아티팩트 read/write만 담당 |
| CLI exit 계약 | `plugins/mccp/scripts/lib/plan-review/cli.js:10` | `0 pass · 1 plan defect · 2 misuse · 12 block` — "평가 불가"와 "결함"을 분리 |
| 샌드박스 스크립트 행위 test | `plugins/mccp/scripts/lib/tests/plan-review-workflow-port.test.js:33` | 소스를 읽어 `extractFunction`으로 함수를 뽑아 harness에서 실행 (`require` 불가 파일의 런타임 검증) |
| 아티팩트 경유 IPC | `plugins/mccp/commands/plan.md:923` | 블록 간 값은 `$VAR`가 아니라 `REVIEW_DIR` 하위 파일로 — 셸 상태는 fence를 넘지 못함 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/plan-review/record.js` | CREATE | 리뷰 기록 markdown + `## Measurement` 블록을 아티팩트에서 결정적으로 생성하는 순수 오라클 (축 A) |
| `plugins/mccp/scripts/lib/plan-review/budget.js` | CREATE | `parsePanelBudget` / `panelMinRemaining` — fan-out budget 미러 (축 B) |
| `plugins/mccp/scripts/lib/plan-review/cli.js` | UPDATE | `record` 서브커맨드 추가 · `emit-workflow-args` payload에 `minRemaining` emit (축 A·B) |
| `plugins/mccp/scripts/workflows/plan-review.js` | UPDATE | budget skip 반환에 실측 `remaining`/`minRemaining` 포함 (축 B) |
| `plugins/mccp/commands/plan.md` | UPDATE | 5.2h를 CLI 호출로 대체 · 5.2의 모든 HALT를 record 경유로 · PRD 템플릿 acceptance 항목 (축 A·C) |
| `plugins/mccp/scripts/lib/tests/plan-review-record.test.js` | CREATE | record 오라클 회귀 (통과/차단/아티팩트 결손 3경로) |
| `plugins/mccp/scripts/lib/tests/plan-review-budget.test.js` | CREATE | `parsePanelBudget` 경계값 회귀 |
| `plugins/mccp/scripts/lib/tests/plan-review-cli-emit.test.js` | UPDATE | `minRemaining` emit 회귀 — 현재 이 파일에 관련 단언이 0건 |
| `plugins/mccp/scripts/lib/tests/plan-review-workflow-port.test.js` | UPDATE | budget 분기를 런타임 실행으로 검증 (`node --check` 대체) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.23.5 → 1.23.6` (§3.7 patch — PRD 미완료) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 (§3.7 5면) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | footer version 단언 2개 동기 |
| `CHANGELOG.md` | UPDATE | `[1.23.6]` 항목 + versioning note 갱신 |
| `.claude/prds/diverse-agent-review.prd.md` | UPDATE | milestone #4 status `pending → in-progress` + Plan 셀 |
| `CLAUDE.md` | UPDATE | §4에 `MCCP_PLAN_REVIEW_BUDGET` 토글 1행 |

## Tasks

### Task 1: 리뷰 기록을 오라클이 생성하게 한다

`record.js`는 `REVIEW_DIR` 아티팩트를 입력으로 받아 markdown 전체를 반환하는 **순수 함수** `buildReviewRecord({mode, l1, l2, l3, decision, reservation, startedAtMs, nowMs, planPath, haltStage})` 를 export한다. 산출 markdown은 현행 `5.2h` 포맷(제목·Verdict·Quorum·Layers·Findings 표·Refutation 표)을 유지하되 **`## Measurement`** 섹션을 추가한다 — 그 안에 fenced ```json 블록으로 `{verdict, source, layers, quorum:{responded,required,roles,of}, wall_clock_ms, halt_stage, reviewed_plan_hash, plan_path, recorded_at}` 를 싣는다. 하나의 파일이 사람이 읽는 서사와 집계 가능한 레코드를 동시에 갖게 하는 것이 목적이다.

**결손 내성이 이 오라클의 핵심 요구다.** 차단은 5.2 어느 단계에서든 일어나므로 `l2`/`decision`/`l3`가 없는 조합이 정상 입력이다. 없는 축은 `null`로 적고 `halt_stage`가 어디서 멈췄는지 말한다 — 추정하지 않는다.

- **Action**: `record.js` CREATE (순수, 의존 없음, throw 없음) + `cli.js`에 `record` 서브커맨드 추가. 서브커맨드는 아티팩트를 읽어 `.claude/reviews/plan-review-<slug>.md` 를 쓰고 **항상 exit 0** — 계측 실패가 게이트를 막으면 안 되지만 조용해서도 안 되므로 모든 degradation은 loud stderr(`[[feedback-loud-fail-open]]`). `--slug`/`--plan`/`--halt-stage`/`--review-dir` 플래그.
- **Mirror**: `quorum.js:134`의 순수 오라클 + CLI 분리 · `cli.js:98`의 `readJsonOrBlock` 결손 처리
- **Validate**: `node --test "plugins/mccp/scripts/lib/tests/plan-review-record.test.js"` — 통과 경로(전 아티팩트 존재)·차단 경로(`decision.json`만, `l2.json` 없음)·전면 결손(`started-at`만) 3케이스에서 markdown이 생성되고 `## Measurement` JSON이 파싱 가능하며 `wall_clock_ms`가 정수임을 단언

### Task 2: 5.2의 모든 HALT를 계측 경유로 바꾼다

현재 `5.2h`에 도달하는 차단 경로는 **판정 계열뿐**이다(5.2a exit 1 → 5.2e, 5.2e `DECIDE_EXIT=12`). **인프라 계열**(5.2b 예약 거부 · 5.2c `emit` exit 12 / pin 실패 · 5.2g proof 검증 실패)은 5.2h 이전에 exit하므로 측정치가 어디에도 남지 않는다. UI10이 요구하는 "차단 경로에서도"는 이 계열을 포함해야 성립한다.

각 HALT 지점에서 stop 블록을 출력하기 **직전**에 `cli.js record --halt-stage <5.2b|5.2c-emit|5.2c-pin|5.2e|5.2g|5.2a>` 를 1행 호출한다. 동시에 `5.2h`의 손으로 쓰던 markdown 블록을 같은 CLI 호출 1행으로 대체한다 — 순증 배선이 아니라 **치환**이며, 결과적으로 이 층의 코드량은 줄어든다(UI6).

- **Action**: `commands/plan.md` 5.2a/5.2b/5.2c/5.2e/5.2g의 HALT 앞에 record 호출 삽입 · 5.2h 본문을 CLI 호출 + 산출 경로 안내로 교체 · 5.2h 서두에 "이 섹션은 통과·차단 전 경로에서 실행된다"는 기존 불변식 문장 유지
- **Mirror**: `commands/plan.md:923` — 값은 아티팩트 경유(`started-at`가 이미 파일인 이유와 동일)
- **Validate**: `node plugins/mccp/scripts/lib/plan-review/cli.js record --review-dir <합성 fixture dir> --slug tmp-halt-check --plan .claude/plans/diverse-agent-review-m4.plan.md --halt-stage 5.2b` 를 `l2.json` 부재 fixture로 실행해 exit 0 + 산출 파일의 `## Measurement`에 `"halt_stage":"5.2b"`와 정수 `wall_clock_ms`가 있는지 확인

### Task 3: budget 게이트를 실제로 발화시킨다

`workflows/plan-review.js:132`가 `input.minRemaining`을 읽고 `:155`가 그것으로 발화를 막는데, 유일한 producer인 `cli.js:334` payload에 그 키가 없어 값은 항상 0이고 조건은 구조적으로 도달 불가다. `plan-fanout`은 같은 자리에 정상 배선을 갖고 있으므로 대칭을 복원한다.

**패널 리뷰가 지적한 정정을 반영한다** — 초안은 검증 패턴으로 `parseRolesMin`을 인용했으나 그것은 `"MofN"` 문자열 파서다. 수치 임계의 올바른 미러는 `parseFanoutMinPerAgent`(`Number.isFinite` + 양수)다.

- **Action**: `budget.js` CREATE — `parsePanelBudget(env)`(`MCCP_PLAN_REVIEW_BUDGET`, default 150000, 비정상 → default + loud warn) + `panelMinRemaining(env, fleetLength)`. `cli.js`가 **fleet을 `--granted`로 상한한 뒤** `minRemaining = parsePanelBudget(env) * fleet.length` 를 payload에 emit(예약으로 줄어든 실제 발화 수를 반영해야 하므로 순서가 유의미). `workflows/plan-review.js`의 budget skip 반환에 `minRemaining`/`remaining` 실측치를 실어 `decide`의 `reason`이 예산 부족을 특정할 수 있게 한다.
- **Mirror**: `plan-fanout/budget.js:101,156`
- **Validate**: `node --test "plugins/mccp/scripts/lib/tests/plan-review-budget.test.js"` — default·0·음수·비정수·문자열 입력에서 반환값과 warn 발생을 단언

### Task 4: 패널이 지적한 "공허한 validation"을 실측 test로 대체한다

라이브 패널이 이 축의 초안을 반려한 사유가 정확히 검증 공허함이었다(`node --check`는 문법만 보는데 acceptance는 런타임 동작을 요구 · 기존 emit test에 `minRemaining` 단언 0건). UI5에 따라 **수정 전 실패를 먼저 실측**한 test만 회귀로 인정한다.

- **Action**: `plan-review-cli-emit.test.js`에 `minRemaining`이 payload에 존재하고 `fleet.length`에 비례하며 `--granted`로 상한된 fleet을 반영하는지 단언 추가. `plan-review-workflow-port.test.js`에 `extractFunction` 패턴으로 budget 분기를 **실행**해 `budget.total` 미설정 시 무발화(기존 동작 보존)·`remaining < minRemaining` 시 skip 반환이 실측 `remaining`을 담는지 단언 추가.
- **Mirror**: `plan-review-workflow-port.test.js:33` — `require` 불가 샌드박스 스크립트의 행위 검증 기법
- **Validate**: Task 3 적용 **전에** 두 test 파일을 실행해 새 단언이 실패하는 것을 확인하고 그 출력을 기록 → 적용 후 `node --test "plugins/mccp/scripts/lib/tests/plan-review-*.test.js"` 전량 green

### Task 5: 통과 경로를 실제로 1회 완주시킨다

**선행 조건이 있다.** 현재 플러그인 캐시는 `~/.claude/plugins/cache/mccp/mccp/`에 `1.23.4`까지만 있어 M1의 패널 경로(5.2a–5.2h)와 `review-*` agent 4종이 **런타임에 존재하지 않는다**. `commands/plan.md:1034`가 이 실패 모드를 이미 문서화한다 — agent 레지스트리는 세션 시작 시 구축되므로 `claude plugin update` 후 **새 세션**이 필요하다.

- **Action**: 버전 bump 반영 후 `claude plugin update` → 새 세션 → `MCCP_PLAN_REVIEW` 미설정(default `multi-agent`) 상태로 이 저장소의 plan 하나를 대상으로 `/mccp:plan`을 완주시킨다. `review_verdict='converged'`가 발급되면 receipt에 review triple이 봉인되고 `.claude/reviews/`에 `## Measurement`가 남는다. `divergent`로 착지하면 그것도 **차단 경로 계측의 실측**이므로 기록하되 통과 경로 항목은 미달로 남긴다 — UI3에 따라 미산출을 달성으로 적지 않는다.
- **Mirror**: `.claude/reviews/plan-review-plan-review-followup.md` — M1의 라이브 1회가 남긴 기록 포맷
- **Validate**: `node -e "const fs=require('fs');const m=fs.readFileSync('.claude/reviews/plan-review-<slug>.md','utf8').match(/\`\`\`json\n([\s\S]*?)\n\`\`\`/);const j=JSON.parse(m[1]);if(!Number.isInteger(j.wall_clock_ms))process.exit(1);console.log(j.verdict,j.source,j.wall_clock_ms)"` 로 측정 레코드를 읽어 PRD Success Metrics 표에 실측치를 기입

### Task 6: 라이브 완주를 템플릿 acceptance로 명문화하고 버전을 동기화한다

M1의 shipped plan을 소급 편집하지 **않는다** — 그 문서는 `plan_hash`로 봉인된 이력이고, 지나간 milestone의 acceptance를 고쳐도 앞으로의 milestone에는 아무 힘이 없다. 전방으로 작용하는 자리는 `commands/plan.md`의 PRD Artifact Output 템플릿이다.

- **Action**: 템플릿 `## Acceptance`에 `- [ ] 게이트를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)` 추가. §3.7 5면 version 동기(`plugin.json`·`html.js`·`markdown.js`·`i18n-surface.test.js`·`CHANGELOG.md`) + CLAUDE.md §4에 `MCCP_PLAN_REVIEW_BUDGET` 1행 + PRD milestone #4 status 갱신.
- **Mirror**: CLAUDE.md §3.7 "동기 대상 5면"
- **Validate**: `node --test "plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js"` green + `grep -rn "1\.23\.6" plugins/mccp/.claude-plugin/plugin.json plugins/mccp/scripts/lib/renderer/html.js plugins/mccp/scripts/lib/renderer/markdown.js CHANGELOG.md` 가 4면 모두 hit

## Validation

```bash
# 오라클 + seam 회귀 (신규 2 + 기존 전량)
node --test "plugins/mccp/scripts/lib/tests/plan-review-*.test.js"

# verdict 소비처 무손상 (dedupe · ship-gate · corpus hash)
node --test "plugins/mccp/scripts/lib/tests/review-verdict*.test.js"
node --test "plugins/mccp/scripts/receipt/tests/*.test.js"

# 버전 5면 동기
node --test "plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js"

# 문법 (행위 검증의 대체가 아니라 보조)
node --check plugins/mccp/scripts/lib/plan-review/record.js
node --check plugins/mccp/scripts/lib/plan-review/budget.js
node --check plugins/mccp/scripts/workflows/plan-review.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 계측 코드가 게이트를 막는다 (측정하려다 승인 경로를 깨뜨림) | Medium | `record` 서브커맨드는 **항상 exit 0** + throw 금지 · 호출부는 stop 블록 출력 직전이라 실패해도 차단 판정 자체는 불변 · degradation은 loud stderr |
| markdown 생성기가 5.2h 산출을 회귀시킨다 | Medium | 현행 포맷을 그대로 재현하는 것을 test 단언으로 고정 · M1 라이브 산출물(`.claude/reviews/plan-review-plan-review-followup.md`)을 기대 포맷 fixture로 사용 |
| 새 budget 게이트가 정상 실행을 막는 신규 차단이 된다 | Medium | `budget.total` 미설정 시 무발화(기존 동작 보존)를 test로 고정 · 임계는 검증된 fan-out 값 150000을 그대로 미러(근거 없는 신규 임계 금지) |
| 캐시가 1.23.4라 라이브 완주가 불가능하다 | **High (실측)** | Task 5가 `claude plugin update` + 새 세션을 선행 조건으로 명시 · 미충족 시 Task 5는 미달로 기록하고 나머지 축은 독립적으로 완료 |
| 통과 경로가 이번에도 관측되지 않는다 | Medium | UI3에 따라 미산출을 forward-only로 기록 — 차단 경로 계측은 축 A만으로 이미 성립하므로 milestone이 전부 무산되지는 않음 |
| `## Measurement` 블록이 receipt schema를 건드린다는 오해 | Low | 이 블록은 `.claude/reviews/` markdown 안에만 존재 — receipt schema·`receipt_hash`·git-tracked ship corpus 전부 무변경(UI7) |
| 배선 수정이 새 배선 결함을 만든다 (M1에서 6/20 재발) | Medium | 축 A는 순증이 아니라 **치환**(LLM 타이핑 → CLI 1행) · 신규 로직은 전부 순수 오라클 쪽에 두어 단위 test 사거리 안에 배치 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 차단 경로(5.2b/5.2c/5.2e/5.2g) 중 최소 1개에서 `.claude/reviews/` 기록이 생성되고 `wall_clock_ms`가 정수로 남는다 (UI10)
- [ ] `emit-workflow-args` payload에 `minRemaining`이 존재하고 `--granted`로 상한된 `fleet.length`에 비례한다 (UI12)
- [ ] `budget.total` 미설정 시 패널 발화 동작이 변경 전과 동일하다
- [ ] 신규 회귀 test가 수정 **전** 실패하는 것을 실측하고 그 출력을 기록했다 (UI5)
- [ ] 패널 통과 경로를 1회 완주해 receipt에 review triple이 봉인됨을 확인 — 미달 시 PRD에 forward-only로 기록 (UI11, UI3)
- [ ] `plugin.json` 포함 §3.7 5면 version이 `1.23.6`으로 동기
- [ ] receipt schema·`receipt_hash`·git-tracked ship corpus 무변경 (UI7)

## Design Critique

- 트리거: `impeccable-detect` `design_signal=true` (axis a) — `renderer/html.js`·`renderer/markdown.js`·`renderer/tests/i18n-surface.test.js`
- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` Read 완료
- 라운드: 1 (`MCCP_DESIGN_CRITIQUE_MAX_RETRY=2`, R0에서 종료) · verdict **CONVERGED**
- Assessment B(결정적 detector): `detect.mjs --json .claude/cache/status.html` → 2건, 둘 다 **기존 표면**이며 이 plan이 도입하지 않는다
  - `em-dash-overuse` (warning) — 렌더 본문 7건. PRODUCT.md의 한국어 텔레그래픽 보이스가 `·`와 `—`를 구분자로 쓰는 데서 오는 누적분
  - `numbered-section-markers` (advisory) — `06/10/11/12`. milestone 식별자라 금칙의 자체 예외("실제 sequence일 때 번호는 자리를 얻는다")에 해당
- Assessment A(4 Output Constraints 대조) — 이 plan의 렌더 표면 변경은 footer version 리터럴 2건뿐이다
  - 정보 위계 3단계: heading 미변경 → PASS
  - 강조색 화면당 1개: 색·토큰 미변경 → PASS
  - raw markdown marker 금지: `html.js`는 `<code lang="en">`로 정상 마크업, `markdown.js`는 plain-text 동등본이 의도된 표면 → PASS
  - 한 화면 항목 수 상한: 리스트 렌더링 미변경 → PASS (collapse는 renderer 소유이지 plan 저자 소유가 아님)
- HIGH/CRITICAL 0건 → `decideCritique` CONVERGED

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더 UI가 아직 없으므로 **호출하지 않고 체크리스트만** 기록한다.

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

> Codex skipped per `MCCP_CODEX_DISABLED=1` (env-level policy)

- 호출: `plan-codex-runner.js` (codex-intent-context M1 — 리뷰·판정·receipt write를 한 프로세스가 소유)
- classification: `disabled` — v0.3.5 first-class skip. spawn 직전 short-circuit이라 Codex 프로세스는 시작되지 않았다.
- 라운드 수: 1 · findings 0건 → adjudication 불필요
- `resolution.codex_verdict`: `skipped` · `meta.codex_disabled=true` · `meta.intent_skip_proof='codex_disabled'`
- YAGNI Triage: 해당 없음 (findings 0)
- Deferred to backlog: 0
- Open Questions: 없음 — 단, **이 게이트는 cross-model 확증이 아니다**. `skipped`는 승인이 아니라 "리뷰가 일어나지 않았음"의 정직한 기록이며, cross-gate dedupe는 `converged`가 아닌 값에 fail-closed이므로 terminal `/mccp:pr`에서 PR-Codex가 실제로 발화한다.
- 적대적 검토 미수행 축(외부 한도 복구 후 재판정 대상): 축 A의 측정 표면 선택(`.claude/reviews/` vs 신규 내구 receipt 클래스) · 계측 CLI의 무조건 exit 0이 은폐할 수 있는 실패 · budget 임계 150000 미러의 패널 적합성

