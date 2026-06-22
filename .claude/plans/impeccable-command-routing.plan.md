# Plan: Stage-Aware impeccable Command Routing (M1)

**Source PRD**: .claude/prds/impeccable-command-routing.prd.md
**Selected Milestone**: M1 — Core routing engine + 6 commands
**Complexity**: Large

## Summary
mccp 디자인 게이트가 impeccable의 `critique` 단일 호출에 갇혀 있던 것을, 디자인 라이프사이클 단계(discovery→refine→evaluate→harden→polish)에 impeccable 명령을 매핑하는 **순수 routing oracle**로 확장한다. M1은 oracle(`impeccable-routing.js`) + 핵심 6개 명령(shape/layout/typeset/audit/harden/polish + 기존 critique) + 모드 토글(auto/hybrid/recommend) + receipt audit 2필드를 출고하고, 3개 게이트(plan/plan-prd는 guide-only, prp-implement은 실제 라우팅, pr은 recommend)에 wiring한다.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Pure oracle | `plugins/mccp/scripts/lib/design-critique-decide.js:40` | dep-free 결정 함수 + enum 반환 + `parseRetryCap(env)` env 파서 |
| Detector | `plugins/mccp/scripts/lib/impeccable-detect.js:247` | `detect()` JSON 반환 + classification enum + strict gate(`=== true`) |
| Skill fallback | `plugins/mccp/commands/plan.md:476` | `Skill(impeccable,...)` unknown_skill → skipped 폴백 |
| Receipt schema | `plugins/mccp/scripts/receipt/schema.js:204` | present-only optional meta 필드 + mutex invariant + 기본값 block |
| Receipt write | `plugins/mccp/scripts/receipt/write.js:167` | `args['flag-name']` → `meta.field` 매핑 (boolean/string/array) |
| Tests | `plugins/mccp/scripts/lib/tests/impeccable-detect.test.js` | `node --test` + 명시적 입력/enum 단언 |

## Files to Change
| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/impeccable-routing.js` | CREATE | routing oracle — stage→command 테이블 + `parseRoutingMode(env)` + `routeCommands({gate,mode,designSignal})` |
| `plugins/mccp/scripts/lib/tests/impeccable-routing.test.js` | CREATE | oracle 단위 테스트 (모드 변환, 게이트별 매핑, fallback) |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | `impeccable_routing_mode` + `impeccable_commands_routed` present-only 검증 + 기본값 2필드 |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | `--impeccable-routing-mode` + `--impeccable-commands-routed` arg→meta 매핑 |
| `plugins/mccp/scripts/receipt/cli.js` | UPDATE | write usage 줄에 신규 플래그 표기 |
| `plugins/mccp/scripts/receipt/tests/impeccable-routing-fields.test.js` | CREATE | schema/write 라운드트립 테스트 |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | design gate에 routing 단계 추가 — shape(background-best-effort)→layout/typeset(refine)→critique+audit(마무리 1회). receipt forward |
| `plugins/mccp/commands/plan.md` | UPDATE | Phase 5.0에 routing **guide** 기록(어떤 단계에 어떤 명령 — recommend-only, invoke 안 함) |
| `plugins/mccp/commands/plan-prd.md` | UPDATE | Phase 4.0에 routing guide 기록(plan.md mirror) |
| `plugins/mccp/commands/pr.md` | UPDATE | 최종 단계 polish/audit/harden **recommend** 줄 출력 (invoke 안 함 — review-only invariant 보존) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version 1.12.0 → 1.13.0 |
| `CLAUDE.md` | UPDATE | §3.9에 stage-aware routing 서브섹션 + §4 운영 토글에 `MCCP_IMPECCABLE_ROUTING_MODE` |
| `CHANGELOG.md` | UPDATE | [1.13.0] 행 추가 |

## Tasks

### Task 1: routing oracle (`impeccable-routing.js`)
- **Action**: 순수·무의존 모듈 작성.
  - `ROUTING_MODES = ['auto','hybrid','recommend']`, `EVALUATE_COMMANDS = ['critique','audit']`.
  - `STAGE_ROUTING` 테이블: gate → ordered `[{command, stage, callForm}]`.
    - `implement`: shape(discovery, background) · layout(refine, invoke) · typeset(refine, invoke) · critique(evaluate, invoke) · audit(evaluate, invoke)
    - `pr`: polish(polish, recommend) · audit(evaluate, recommend) · harden(harden, recommend)
    - `plan` / `prd`: 전 단계 guide(callForm=recommend)
  - `parseRoutingMode(env)` — `MCCP_IMPECCABLE_ROUTING_MODE` 읽어 enum 검증, 미지정/오류 시 `'auto'`.
  - `routeCommands({gate, mode, designSignal, designIntentActive, renderingSurface})` → `{commands: [{command, stage, callForm}], mode, skipped}`.
    - **(Codex R1 F1 absorption)** trigger 조건은 `designSignal === true || designIntentActive === true`. 둘 다 false면 `{commands: [], skipped: true}` (strict gate, mirror impeccable-detect). 이로써 detector false-negative + `MCCP_DESIGN_INTENT_REASON` audited override(axis c)가 routing을 통과 — 기존 `DESIGN_INTENT_ACTIVE` escape hatch 보존.
    - **(Codex R1 F4 absorption — selector guard)** `renderingSurface` 입력: diff에 실제 렌더링 확장자(UI ext / STATUS.md·status.html 출력)가 있으면 `true`, control-plane-only 화이트리스트 hit(예: `receipt/write.js`만 변경, 렌더 surface 없음)이면 `false`. `renderingSurface !== true`면 `auto`에서도 refine군(layout/typeset) + discovery(shape)를 `recommend`로 강등하고 evaluate군(critique/audit)만 실제 호출 형태 유지 — coarse 신호의 무경계 fan-out 차단. auto 기본값 자체는 유지(사용자 product 결정).
  - 모드 변환: `auto` → callForm 그대로 / `hybrid` → EVALUATE_COMMANDS만 invoke 유지, 나머지 `recommend` / `recommend` → 전부 `recommend`. background는 auto + renderingSurface=true에서만 유지, 그 외 recommend로 강등.
- **Mirror**: `design-critique-decide.js` (enum + env 파서 + 순수성).
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/impeccable-routing.test.js`

### Task 2: oracle 테스트
- **Action**: 케이스 — (a) auto/implement/renderingSurface=true → 5개 명령 + shape=background, (b) hybrid/implement → critique/audit invoke, layout/typeset/shape recommend, (c) recommend/* → 전부 recommend, (d) designSignal=false & designIntentActive=false → skipped, (e) parseRoutingMode 미지정→auto / 오타→auto / 'hybrid'→hybrid, (f) pr gate → polish/audit/harden 전부 recommend(어느 모드든 invoke 없음), **(g) F1: designSignal=false + designIntentActive=true → NOT skipped (routing 통과)**, **(h) F4: auto/implement/renderingSurface=false → layout/typeset/shape는 recommend로 강등, critique/audit만 invoke 유지**.
- **Mirror**: `impeccable-detect.test.js`.
- **Validate**: 테스트 통과.

### Task 3: receipt schema + write 필드
- **Action**:
  - `schema.js`: present-only 검증 — `impeccable_routing_mode`(string ∈ ROUTING_MODES 또는 null), **(Codex R1 F3 absorption)** `impeccable_commands_routed`(배열 또는 null). 각 원소는 **structured object** `{command:string, call_form:'invoke'|'background'|'foreground-fallback'|'recommend', status:'invoked'|'recommended'|'failed'|'unknown-skill'|'skipped'}` — intent가 아니라 per-command outcome 기록. enum 위반 시 reject. 기본값 block에 `impeccable_routing_mode: null`, `impeccable_commands_routed: null` 추가.
  - `write.js`: `impeccable_routing_mode: args['impeccable-routing-mode'] || null`. `impeccable_commands_routed`는 `--impeccable-commands-routed-file <path>`(JSON 배열) 로 받음 — comma-separated 문자열로는 structured object를 표현 못 하므로 file 채널(mirror `findings-file` 패턴, write.js:121).
  - `cli.js`: write usage 줄 갱신.
- **Mirror**: `design_critique_verdict` 필드 패턴(schema.js:502) + `findings-file` JSON 채널(write.js:121).
- **Note (F3 strict-gate semantics, M1 scope)**: M1은 `status='failed'`/`'unknown-skill'`을 receipt에 **정직히 기록**(loud fail-open)하되 게이트 blocking으로 승격하지 않음 — auto 모드 명령 실패의 strict-gate 차단은 outcome 데이터가 쌓인 뒤 M2 결정. critique의 divergent blocking은 Task 5에서 기존 경로 그대로 유지(별개).
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/impeccable-routing-fields.test.js` + 기존 `schema.test.js` 회귀.

### Task 4: schema/write 라운드트립 테스트
- **Action**: write로 2필드 stamp → 파일 read → schema validate pass. legacy 미stamp receipt도 pass(present-only) 확인. 잘못된 mode 값 reject 확인.
- **Validate**: 통과.

### Task 5: prp-implement.md routing wiring
- **Action**: design gate에서 routing 단계를 삽입하되 **기존 critique 경로를 보존**:
  1. trigger 행은 기존과 동일하게 `SKILL_AVAIL=1 & (SIGNAL=1 OR DESIGN_INTENT_ACTIVE=1)` — **(F1)** designIntentActive를 oracle에 그대로 전달.
  2. `MODE=$(node -e parseRoutingMode)` + `renderingSurface` 판정(diff에 UI ext/STATUS·status.html 출력 있으면 1, control-plane-only면 0).
  3. `routeCommands({gate:'implement', mode:MODE, designSignal:SIGNAL, designIntentActive:DESIGN_INTENT_ACTIVE, renderingSurface})` → 명령 리스트.
  4. **(Codex R1 F2 absorption)** `critique`은 routing 리스트의 일반 명령으로 흡수하지 **않는다**. critique은 기존 `decideCritique` retry loop(prp-implement.md:363) 전용 핸들러를 그대로 호출 — finding 파싱·edit/retry·`design_critique_rounds`/`design_critique_verdict` receipt forward 모두 유지. PR step chain-check의 `divergent` blocking 불변식 보존.
  5. critique을 제외한 명령(shape/layout/typeset/audit)만 callForm별 처리: `invoke` → `Skill(impeccable, "<command> <slug>")` / `background` → background Agent 시도(불가 시 `foreground-fallback` + loud stderr) / `recommend` → stderr 권장 줄. 각 명령 결과를 **(F3)** `{command, call_form, status}` 구조로 `ROUTED_JSON` 배열에 누적(성공=invoked/recommended, 실패=failed, unknown_skill=unknown-skill).
  6. 2.5.6 receipt-write에 `--impeccable-routing-mode "$MODE" --impeccable-commands-routed-file "$ROUTED_JSON_FILE"` forward (기존 design-critique forward와 병존).
- **Mirror**: 기존 critique retry loop(prp-implement.md:363) + receipt forward(:430) + `findings-file` 채널.
- **Validate**: prp-implement.md를 `MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL` 류 dogfood로 수동 검증 + receipt 필드(critique verdict + routed outcomes 양쪽) 확인.

### Task 6: plan.md / plan-prd.md routing guide
- **Action**: 두 게이트의 design 섹션(SKILL_AVAIL=1 & SIGNAL=1)에서 **invoke 없이** routing guide만 plan/PRD body의 `## Design Routing Guide` 섹션에 기록 — 단계별 권장 명령 표(shape→[implement]→layout/typeset→critique/audit→harden→polish). plan 단계엔 실제 UI가 없으므로 recommend-only(PRD 결정 반영). receipt forward는 mode만(`--impeccable-routing-mode`), commands_routed는 빈 값(guide는 실제 호출 아님).
- **Mirror**: plan.md Phase 5.0 design 섹션.
- **Validate**: plan 생성 시 `## Design Routing Guide` 섹션 출현 확인.

### Task 7: pr.md recommend
- **Action**: 최종 단계에 polish/audit/harden **recommend 줄**만 출력(stderr + PR body 비-mutating note). review-only invariant 보존 — pr.md는 Edit/Write로 디자인 명령 invoke 안 함(§1.2 PR-phase guard). routing mode가 recommend로 강제됨을 명시.
- **Mirror**: pr.md 기존 design chain-check(§3.9 PR step).
- **Validate**: pr 생성 시 recommend 줄 확인.

### Task 8: 문서 + 버전
- **Action**: CLAUDE.md §3.9에 "stage-aware routing" 서브섹션(stage→command 표 + 모드 + 게이트별 호출 형태) + §4에 `MCCP_IMPECCABLE_ROUTING_MODE=auto|hybrid|recommend` (default auto). CHANGELOG [1.13.0] 행. plugin.json 1.12.0→1.13.0.
- **Validate**: `node -e "require('./plugins/mccp/.claude-plugin/plugin.json').version"` = 1.13.0.

## Validation
```bash
cd "C:/_project/my/my-claude-code-plugin/.worktrees/v1.13.0-impeccable-command-routing"
node --test plugins/mccp/scripts/lib/tests/impeccable-routing.test.js
node --test plugins/mccp/scripts/receipt/tests/impeccable-routing-fields.test.js
node --test plugins/mccp/scripts/receipt/tests/schema.test.js
node --test plugins/mccp/scripts/lib/tests/impeccable-detect.test.js
# 전체 회귀
node --test plugins/mccp/scripts/**/tests/*.test.js 2>&1 | tail -20
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| `background` shape 호출이 비대화형 게이트에서 불안정 | High | oracle은 callForm=background 선언만, 명령 body는 best-effort + foreground/recommend 폴백 + loud stderr. M1은 폴백 경로가 정답 |
| critique 중복 호출(기존 loop + routing 리스트) | Medium | routing 리스트의 critique이 단일 진실 — 기존 loop를 evaluate 단계로 흡수, 별도 호출 제거 |
| pr.md에서 invoke 시 PR-phase guard와 충돌 | Medium | pr은 recommend-only 강제(oracle이 pr gate를 전부 recommend로) — invoke 경로 없음 |
| 신규 schema 필드가 기존 receipt 깨뜨림 | Low | present-only(undefined pass) + legacy 회귀 테스트(Task 4) |
| routing이 design-gate control-plane 건드려 자기-재현 | Low | impeccable-routing.js는 DESIGN_SURFACE_PATHS 미포함(oracle은 디자인 surface 아님) — detector가 .js를 디자인으로 안 봄 |

## Acceptance
- [ ] oracle + 2 테스트 파일 통과 (Task 1,2,4)
- [ ] receipt 2필드 schema/write 라운드트립 + legacy 회귀 (Task 3,4)
- [ ] prp-implement 실제 routing wiring + receipt forward (Task 5)
- [ ] plan/plan-prd guide-only + pr recommend-only (Task 6,7)
- [ ] 전체 테스트 회귀 PASS
- [ ] CLAUDE.md + CHANGELOG + plugin.json 1.13.0 (Task 8)
- [ ] Patterns mirrored, not reinvented

## Design Critique

- 트리거: SKILL_AVAIL=1 + SIGNAL=1 (signal_files: `plugins/mccp/scripts/receipt/write.js` — DESIGN_SURFACE_PATHS 화이트리스트 자기-적용 hit)
- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` 4개 Read 완료
- 평가: 본 M1 plan은 렌더링 design surface(.tsx/.css/.html/STATUS.md/status.html 출력)를 도입하지 않음 — 변경은 routing oracle(JS) + command-body wiring(MD) + receipt schema. 4개 Output Constraints(heading depth ≤3 / accent ≤1 / raw md marker / list-of-N) 위반 finding 0.
- verdict: **CONVERGED** (round 0/2, design-surface finding 없음)
- 비고: design_signal은 receipt write.js 화이트리스트 hit에 의한 mechanical self-application. 실제 visual surface 부재로 heavy impeccable skill spawn 생략(category match 판단).

## Codex Adversarial Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2) · `--impeccable-available` (design-scope preamble 적용)
- 라운드 수: 1 (cap=1; R1 absorption이 ACCEPT_NOW HIGH 2건을 plan 내에서 완결 → R2 미escalate)
- 합치 결론: wrapper classification=`ok` (blocking=false) — 게이트 통과. 내부 verdict=`needs-attention`, 4 findings 전부 plan에 absorb.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 audited design-intent override 경로 누락 | HIGH | ACCEPT_NOW | oracle에 `designIntentActive` 입력 추가 + `designSignal \|\| designIntentActive` trigger + `design_intent_reason` forward 보존 (Task 1·2·5) |
  | F2 critique 흡수 시 convergence blocking 손실 | HIGH | ACCEPT_NOW | critique을 routing 일반 명령으로 흡수하지 않고 기존 `decideCritique` retry loop 전용 핸들러 유지 + `design_critique_verdict` divergent blocking 보존 (Task 5) |
  | F3 receipt가 intent만 기록 | MEDIUM | ACCEPT_NOW | `impeccable_commands_routed`를 structured `{command, call_form, status}` 배열로 — 실패/unknown-skill을 정직히 기록(loud fail-open). strict-gate 승격은 M2 (Task 3) |
  | F4 auto 기본값이 coarse signal에 unbounded | MEDIUM | ACCEPT_NOW(partial) | auto 기본값은 사용자 product 결정이라 유지. 단 `renderingSurface` selector로 control-plane-only signal의 refine/discovery fan-out 차단 (Task 1·2). cost-tier auto-downgrade + per-command timeout/SLO 측정은 M2 DEFER |
- Deferred to backlog: 0 (4건 전부 ACCEPT_NOW absorb; F4의 cost-tier/SLO sub-item은 M2 milestone scope로 명시 — backlog 파일 아님)
- Open Questions: F4 cost-tier auto-downgrade + command-level budget/SLO 측정 — severity MEDIUM, M2 milestone에서 결정 (본 M1 blocking 아님)
- Codex session 참조: threadId 019eefe1-31cf-74a0-8b8f-e62ca119f3db

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (4 findings F1-F4 R1-absorbed). No new implement-time decisions detected — implementation is a mechanical translation of the plan (oracle module API, structured receipt fields, command-body wiring all pre-committed in the plan body). `git diff --name-only` ⊆ plan `Files to Change` (no implement-time file expansion). Cross-gate dedupe applied.

### Design Review

- 트리거: SKILL_AVAIL=1 + SIGNAL=1 (signal_files: `plugins/mccp/scripts/receipt/write.js` — DESIGN_SURFACE_PATHS 자기-적용 hit, renderingSurface=0 control-plane-only)
- 평가: implement diff는 routing oracle(JS) + receipt schema + command-body(MD) 변경뿐 — 렌더링 design surface(.tsx/.css/.html/STATUS·status.html 출력) 0. 4 Output Constraints 위반 finding 0.
- verdict: **CONVERGED** (round 0/2)
