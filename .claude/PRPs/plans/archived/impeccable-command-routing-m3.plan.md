# Plan: Stage-Aware impeccable Command Routing — M3 (System commands + a11y auto-invoke)

**Source PRD**: `.claude/prds/impeccable-command-routing.prd.md`
**Selected Milestone**: M3 — System 명령(document/extract) wiring + a11y-architect routing-only → 실제 auto-invoke 전환
**Complexity**: Medium

## Summary
M1(core routing 6 commands) + M2(extended Refine/Simplify catalogue + content selection)가 SHIPPED된 위에 M3은 두 축을 닫는다. **Axis A**: impeccable System 군의 `document`/`extract`를 routing 카탈로그에 recommend-only로 wiring(M2의 distill/clarify/mood 명령과 동일한 경량 surfacing 패턴). **Axis B**: PR 게이트의 a11y 처리를 "count만 세고 버리는" routing-only에서 실제 `mccp:a11y-architect` Task() auto-invoke로 전환한다. **트리거는 PR diff의 design surface 존재(`renderingSurface`)이며 Codex finding 유무가 아니다** — Codex는 design-scope preamble로 a11y를 억제당하므로(Codex R1 F1) finding 기반 트리거는 starve된다. a11y-architect는 변경된 diff를 **직접** WCAG 2.2 관점에서 review하고(Codex가 surface한 `a11y_findings` 배열은 보조 입력), 그 결과는 PR body `## Accessibility Review` 섹션에 inject된다. review-only 불변식은 codex-runner가 이미 lock을 release한 뒤이므로(Codex R1 F2) **a11y 전용 pr-phase lock window**를 pr.md가 새로 획득해 mutations finalizer로 mechanical 보증한다. receipt stamp는 `finalize-receipt.js`가 `--a11y-auto-invoked`를 forward하도록 확장해 audit trail을 닫는다(Codex R1 F3).

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Naming | `plugins/mccp/scripts/lib/impeccable-routing.js:42` | `MOOD_COMMANDS` frozen array + `entry(command, stage, callForm, signal)` 팩토리. System 명령도 같은 entry 형태로 추가. |
| Routing table | `impeccable-routing.js:76-104` | `STAGE_ROUTING.{implement,pr}` + `PLAN_GUIDE`. recommend-only base는 harden/optimize/onboard(pr), distill/clarify(implement) 행을 그대로 미러. |
| Output filter | `plugins/mccp/scripts/lib/codex-result-filter.js:94-117` | `filterDesignFindings`가 a11y/design 분리. a11y만 별도 배열로 노출하도록 확장 (현재는 count만). |
| Lib→command 경계 | `plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js:206-211` | lib는 `spawnSync`만 — Agent/Task 호출 불가. 실제 a11y-architect invoke는 **pr.md command body**가 codex-result.json을 읽고 수행. |
| Receipt present-only field | `plugins/mccp/scripts/receipt/schema.js:538-578` | `impeccable_routing_mode`/`impeccable_commands_routed` 처럼 present-only boolean/array. legacy receipt는 변경 없이 validate. |
| Receipt write 배선 | `plugins/mccp/scripts/receipt/write.js:211` | `args['codex-design-scope-excluded'] === true` CLI flag → meta 필드. 신규 flag도 동형. |
| Agent invoke (review-only) | `commands/pr.md:376-410` (codex-runner → `## Codex Review` inject) | Codex 결과를 PR body 섹션에 inject하는 review-only 패턴. a11y-architect도 동일 — 본문 command가 Edit/Write 안 함. |
| Tests | `plugins/mccp/scripts/lib/tests/impeccable-routing.test.js`, `codex-result-filter.test.js`, `receipt/tests/impeccable-routing-fields.test.js` | `node --test` native runner. table-driven assert. |

## Files to Change
| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/impeccable-routing.js` | UPDATE | `SYSTEM_COMMANDS` frozen set + `document`/`extract` entry를 `STAGE_ROUTING.implement`·`.pr`·`PLAN_GUIDE`에 recommend-only로 추가. export에 `SYSTEM_COMMANDS`. |
| `plugins/mccp/scripts/lib/codex-result-filter.js` | UPDATE | `filterDesignFindings` 반환에 `a11yFindings`(드롭된 a11y finding 배열) 추가 — **보조 입력**(kill-switch off 등으로 a11y가 leak했을 때). 기존 `a11yRoutedCount`는 유지(= `a11yFindings.length`). EMPTY_RESULT/identity-path도 동기화. |
| `plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js` | UPDATE | emit 결과에 `a11y_findings`(배열) 추가 surface(보조 입력). `renderingSurface`(PR diff에 UI ext 존재 여부)도 함께 surface해 pr.md가 트리거 판단에 사용 — finding 기반이 아닌 surface 기반 트리거(Codex R1 F1). |
| `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js` | UPDATE | `deriveCodexFlags`(또는 신규 argv flag)가 `--a11y-auto-invoked`를 forward + `write_flags_used`에 노출 — receipt가 실제로 stamp됨을 검증 가능하게(Codex R1 F3). |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | present-only `meta.a11y_auto_invoked: boolean` validator + skeleton default(false) 추가. |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | `--a11y-auto-invoked` CLI flag → `meta.a11y_auto_invoked` 배선. |
| `plugins/mccp/commands/pr.md` | UPDATE | Phase 2.5.6 이후 a11y auto-invoke 단계 추가: `renderingSurface=true`(PR diff에 design surface) && `MCCP_A11Y_AUTO_INVOKE!=0` 시 **a11y 전용 pr-phase lock 획득** → `Task(mccp:a11y-architect)` review-only 호출(diff 직접 audit, `a11y_findings` 보조 입력) → lock exit + mutations finalizer(편집 시 hard-stop) → `## Accessibility Review` PR body inject → finalize-receipt에 `--a11y-auto-invoked` forward. kill switch 문서화. |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | Stage-aware routing 표에 `system` 단계(document/extract recommend) 한 줄 추가 — implement 게이트에서 surfacing. (a11y auto-invoke는 PR 게이트 전용 — 본 게이트는 routing 카탈로그만.) |
| `plugins/mccp/scripts/lib/tests/impeccable-routing.test.js` | UPDATE | document/extract가 모든 모드/게이트에서 recommend로 resolve됨을 assert. |
| `plugins/mccp/scripts/lib/tests/codex-result-filter.test.js` | UPDATE | `a11yFindings` 배열 정확성(count==length, design finding 미포함, impeccable 미가용 시 빈 배열) assert. |
| `plugins/mccp/scripts/receipt/tests/impeccable-routing-fields.test.js` | UPDATE | `a11y_auto_invoked` present-only validate + legacy receipt 무영향 assert. |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump `1.13.0 → 1.14.0` (M3 milestone ship, §3.7 의무). |
| `.claude/prds/impeccable-command-routing.prd.md` | UPDATE | M3 row `pending → in-progress` + Plan 셀 경로 기록(이 plan write 시 적용). |
| `CHANGELOG.md` | UPDATE | `[1.14.0]` 행 추가. |
| `CLAUDE.md` | UPDATE | §3.10에 M3 sub-section(System 명령 + a11y auto-invoke + `MCCP_A11Y_AUTO_INVOKE` 토글) 추가. |

## Tasks

### Task 1: System 명령(document/extract) routing wiring
- **Action**: `impeccable-routing.js`에 `const SYSTEM_COMMANDS = Object.freeze(['document', 'extract']);` 추가. `STAGE_ROUTING.implement`·`STAGE_ROUTING.pr`·`PLAN_GUIDE` 각각에 `entry('document', 'system', 'recommend', null)` + `entry('extract', 'system', 'recommend', null)` append. `module.exports`에 `SYSTEM_COMMANDS` 추가.
- **Mirror**: harden/optimize/onboard(pr) + distill/clarify(implement) recommend-only 행. `resolveCallForm` downgrade-only 로직상 recommend base는 모든 모드에서 recommend 유지 → invoke 위험 0, content signal 불필요.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/impeccable-routing.test.js`

### Task 2: codex-result-filter — a11y findings 배열 노출
- **Action**: `filterDesignFindings`가 a11y로 분류된 finding을 별도 `a11yFindings` 배열에 push(드롭은 그대로 유지 — review 표면에서는 제거). 반환 객체에 `a11yFindings` 추가. `a11yRoutedCount`는 `a11yFindings.length`와 동치 유지. impeccable 미가용 identity-path·findings 빈 배열·`EMPTY_RESULT` 모두 `a11yFindings: []` 동기화.
- **Mirror**: 기존 `droppedFindings`/`a11yRoutedCount` 누적 루프(`:98-110`). 신규 배열은 같은 루프 안에서 push.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/codex-result-filter.test.js`

### Task 3: codex-runner — a11y_findings + rendering_surface surface
- **Action**: `codex-runner.js`에서 (1) `filtered.a11yFindings`를 캡처해 emit 결과에 `a11y_findings: a11yFindings`(보조 입력) 추가, (2) PR diff(`git diff <base>...HEAD --name-only`)에 UI ext 존재 여부를 `rendering_surface: boolean`으로 emit — pr.md의 a11y 트리거 판단 source(Codex R1 F1: finding 기반이 아닌 surface 기반). `disabled`/`skipped`/`deduped` 경로에서는 `a11y_findings=[]` 초기화하되 `rendering_surface`는 diff 기준으로 계산. 기존 `a11y_routed_to_impeccable` boolean 유지.
- **Mirror**: `designFindingsDropped`/`a11yRoutedToImpeccable` 캡처 라인(`:209-211`) + emit 객체(`:245-248`). UI ext regex는 prp-implement.md routing block(`\.(tsx|jsx|vue|svelte|astro|css|scss|html)$` + `.claude/cache/(STATUS.md|status.html)`)를 그대로 재사용.
- **Validate**: `node -e "require('./plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js')"` (load smoke) + codex-runner 통합 테스트(있으면)에 `--impeccable-available` 경로에서 `rendering_surface`가 diff 따라 토글됨을 assert(Codex R1 F1 e2e 보강).

### Task 4a: receipt schema + write — a11y_auto_invoked 필드
- **Action**: `schema.js` validateMeta에 `if (m.a11y_auto_invoked !== undefined) req(typeof === 'boolean', ...)` 추가 + `makeSkeleton` meta에 `a11y_auto_invoked: false`. `write.js`에 `a11y_auto_invoked: args['a11y-auto-invoked'] === true` 배선.
- **Mirror**: `a11y_routed_to_impeccable` validator(`schema.js:354-356`) + skeleton(`:642`) + write 배선(`write.js:211`).
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/impeccable-routing-fields.test.js`

### Task 4b: finalize-receipt.js — --a11y-auto-invoked forward (Codex R1 F3)
- **Action**: `deriveCodexFlags(codexResult)`에 `if (codexResult.a11y_auto_invoked === true) flags.push('--a11y-auto-invoked');` 추가(`a11y_routed_to_impeccable` 분기 바로 아래, `:116`). pr.md가 codex-result.json에 `a11y_auto_invoked:true`를 기록하면 finalizer가 자동 forward + `write_flags_used`에 노출돼 receipt stamp 여부가 검증 가능해진다.
- **Mirror**: `deriveCodexFlags`의 `--a11y-routed-to-impeccable` 분기(`finalize-receipt.js:116-117`).
- **Validate**: `node --test plugins/mccp/scripts/lib/pr-phase-helpers/` (finalize-receipt 테스트 존재 시) + `deriveCodexFlags({a11y_auto_invoked:true})`가 `--a11y-auto-invoked` 포함 + `write_flags_used`에 노출 assert.

### Task 5: pr.md — a11y-architect auto-invoke (review-only, 전용 lock window) + PR body inject
- **Action**: pr.md Phase 2.5.6(codex-runner 결과 read) 직후, **Phase 2.5.7(finalize-receipt) 이전** 신규 sub-step "2.5.6c — a11y review":
  1. `A11Y_AUTO=$([ "${MCCP_A11Y_AUTO_INVOKE:-1}" != "0" ] && echo 1 || echo 0)` + codex-result.json의 `rendering_surface`/`a11y_findings` read.
  2. `A11Y_AUTO=1` && `rendering_surface=true`이면 **a11y 전용 pr-phase lock을 새로 enter**(codex-runner는 이미 lock exit함 — Codex R1 F2 보강). lock window 안에서 `Task(subagent_type=mccp:a11y-architect)`를 **review-only 지시**(변경된 diff 파일을 직접 WCAG 2.2 관점에서 audit + `a11y_findings` 보조 입력으로 평가, remediation은 제안만, **파일 편집 절대 금지**)로 호출.
  3. lock exit + mutations finalizer 실행 — a11y-architect가 편집을 시도했으면 `mutations[]` 비어있지 않음 → `[MCCP-GATE-STOP]` hard-stop(review-only invariant breach).
  4. agent 출력을 PR body `## Accessibility Review` 섹션으로 inject(`## Codex Review` 패턴 동형). `rendering_surface=false` 또는 `A11Y_AUTO=0`이면 섹션 생략 + Task 미invoke.
  5. finalize-receipt 호출 시 `A11Y_INVOKED=1`이면 codex-result.json에 `a11y_auto_invoked:true`가 담겨 finalize-receipt가 `--a11y-auto-invoked`를 자동 forward(Task 4b 참조).
- **Mirror**: codex-runner → `## Codex Review` inject 흐름(`pr.md:376-410`) + pr-phase-lock enter/exit + mutations finalizer 패턴(`pr.md:407` 인근 codex-runner 내부 호출). a11y-architect는 mccp agent 목록에 존재(Read/Grep/Glob/Write/Edit — 단 review-only 지시 + lock guard backstop).
- **Validate**: pr.md 구조 lint(`grep -q "## Accessibility Review" plugins/mccp/commands/pr.md`) + regression: a11y phase에서 write-capable action을 강제하면 PR command가 hard-stop함을 검증(Codex R1 F2 권고). dogfood 시 review-only breach 0(mutations[] empty).

### Task 6: prp-implement.md — system 단계 surfacing 한 줄
- **Action**: Stage-aware routing 표(`prp-implement.md:401` 인근)에 `system` 단계 document/extract가 recommend로 라우팅됨을 명시(routing 오라클이 자동 포함하므로 처리 로직 변경 불필요 — 표/주석만 보강).
- **Mirror**: 기존 callForm 처리 표.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/impeccable-routing.test.js` (오라클이 document/extract를 implement 게이트에서 recommend로 반환 확인).

### Task 7: 문서 + version bump
- **Action**: plugin.json `1.13.0→1.14.0`, CHANGELOG `[1.14.0]` 행, CLAUDE.md §3.10 M3 sub-section(System 명령 + a11y auto-invoke + `MCCP_A11Y_AUTO_INVOKE=0|1` 토글 cheat-sheet), PRD M3 row `in-progress`(plan write 시 적용).
- **Mirror**: §3.10 M2 sub-section 작성 톤.
- **Validate**: `node -e "require('./plugins/mccp/.claude-plugin/plugin.json').version==='1.14.0'||process.exit(1)"`

## Validation
```bash
# 전체 영향 테스트 (baseline 60 → 신규 케이스 추가분 포함 all green)
node --test plugins/mccp/scripts/lib/tests/impeccable-routing.test.js \
             plugins/mccp/scripts/lib/tests/codex-result-filter.test.js \
             plugins/mccp/scripts/receipt/tests/impeccable-routing-fields.test.js
# 오라클 스모크 — document/extract recommend in all gates/modes
node -e "const r=require('./plugins/mccp/scripts/lib/impeccable-routing');
for(const g of ['implement','pr','plan']){const o=r.routeCommands({gate:g,mode:'auto',designSignal:true,renderingSurface:true});
const d=o.commands.filter(c=>['document','extract'].includes(c.command));
if(d.length!==2||d.some(c=>c.callForm!=='recommend'))throw new Error(g+' '+JSON.stringify(d));}
console.log('system-commands OK');"
# codex-result-filter a11yFindings 동치
node -e "const f=require('./plugins/mccp/scripts/lib/codex-result-filter');
const r=f.filterDesignFindings({findings:[{category:'a11y',text:'aria missing'},{category:'color',text:'low contrast'},{category:'logic',text:'bug'}]},{impeccableAvailable:true});
if(r.a11yFindings.length!==r.a11yRoutedCount||r.a11yFindings.length!==1)throw new Error(JSON.stringify(r));
if(r.filteredFindings.length!==1)throw new Error('filtered');console.log('a11yFindings OK');"
# version
node -e "require('./plugins/mccp/.claude-plugin/plugin.json').version==='1.14.0'||process.exit(1)"
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| **(Codex R1 F1)** a11y 트리거가 starve — Codex가 preamble로 a11y 억제 → finding 0 → auto-invoke 미발화 | High→Low | 트리거를 finding 기반에서 **`rendering_surface`(PR diff design surface) 기반**으로 전환. a11y-architect가 diff를 직접 audit(Codex finding 불요). codex-runner 통합 테스트가 `--impeccable-available` 경로에서 surface 토글 검증. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| **(Codex R1 F2)** a11y Task가 lock window 밖에서 실행 → review-only guard 무력 → 편집 미검출 | High→Low | codex-runner가 이미 lock exit하므로 pr.md가 **a11y 전용 pr-phase lock**을 새로 enter → Task → exit + mutations finalizer. write 강제 regression이 hard-stop 검증. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| **(Codex R1 F3)** `--a11y-auto-invoked`가 finalize-receipt 경로로 안 흘러 receipt 미stamp | Medium→Low | `finalize-receipt.js#deriveCodexFlags`에 forward 분기 추가(Task 4b) + `write_flags_used` 노출로 stamp 검증 가능. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| auto-invoke가 PR latency/비용 증가 | Medium | `MCCP_A11Y_AUTO_INVOKE=0` kill switch(default 1). `rendering_surface=false`면 invoke skip. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| document/extract를 invoke로 잘못 라우팅(비대화형 게이트에서 생성 명령 폭주) | Low | recommend-only base + resolveCallForm downgrade-only → 모든 모드에서 recommend. content signal 없음. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| codex-runner 결과 schema 변경이 finalize-receipt.js와 불일치 | Low | `a11y_findings`/`rendering_surface`/`a11y_auto_invoked`는 additive — 기존 consumer 무영향. finalize-receipt는 Task 4b로 명시적 forward. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| a11y_auto_invoked 필드가 기존 receipt validate 깨뜨림 | Low | present-only(undefined 허용) + skeleton default false. legacy receipt 무영향 테스트. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->

## Acceptance
- [ ] All tasks complete
- [ ] `node --test` 3개 파일 all green (baseline 60 + 신규 케이스)
- [ ] document/extract가 implement/pr/plan 게이트 모든 모드에서 recommend로 resolve
- [ ] codex-result-filter `a11yFindings.length === a11yRoutedCount`, design finding 미포함, impeccable 미가용 시 빈 배열
- [ ] pr.md a11y auto-invoke가 review-only(편집 0) + `## Accessibility Review` inject + receipt `a11y_auto_invoked` stamp
- [ ] plugin.json 1.14.0, CHANGELOG/CLAUDE.md/PRD 갱신
- [ ] Patterns mirrored, not reinvented

## Design Critique

- Trigger: SKILL_AVAIL=1 · SIGNAL=1 (design-gate control-plane 자기-적용, §3.9 axis b — signal_files=`plugins/mccp/scripts/receipt/write.js` 외 routing/filter control-plane)
- Round: 1
- Verdict: **converged**
- 결론: 본 plan은 rendered design surface(status.html/STATUS.md 등)를 도입하지 않는 control-plane 변경(routing 오라클 + output filter + receipt schema + command-body wiring). 4개 Output Constraint(정보 위계 3단계 / 강조색 1개 / raw markdown 금지 / 항목 수 상한)는 rendered UI에 적용되며 본 plan 범위 밖. a11y auto-invoke 전환은 디자인 파이프라인 강화 방향이라 design-quality 회귀 아님. actionable HIGH/CRITICAL finding 0.

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2) — `--impeccable-available`, timeout 900s
- 라운드 수: 1 (R1 absorption으로 수렴 — 3 finding 모두 plan 재설계로 해결, R2 불요)
- 합치 결론: Codex verdict=`needs-attention` (class=ok, blocking=0). 초기 Axis B 설계(Codex finding 기반 a11y 트리거 + 단순 Task 호출)는 (1) preamble starvation, (2) lock window 밖 실행, (3) finalize-receipt 미경유 3가지로 e2e가 깨졌다. 세 finding 모두 ACCEPT_NOW로 흡수해 Axis B를 surface 기반 트리거 + 전용 lock window + finalize-receipt forward로 재설계.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 a11y 트리거가 preamble로 starve | HIGH | ACCEPT_NOW | 트리거를 `rendering_surface` 기반으로 전환 + a11y-architect가 diff 직접 audit (Summary/Task 3/Task 5/Risks 반영) |
  | F2 review-only guard가 Task를 안 덮음 | HIGH | ACCEPT_NOW | a11y 전용 pr-phase lock window + mutations finalizer (Task 5 재설계) |
  | F3 `a11y_auto_invoked` finalize-receipt 미경유 | MEDIUM | ACCEPT_NOW | `finalize-receipt.js` Files to Change + Task 4b 신설 |
- Deferred to backlog: 0
- Open Questions: 없음 (3 finding 모두 R1에서 흡수, DIVERGENT_UNRESOLVED 아님)
- Codex session 참조: threadId `019ef07a-5eae-7123-93b1-6adf0d1c3975`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (3 findings F1/F2/F3 absorbed in R1 — a11y trigger redesign, dedicated lock window, finalize-receipt forward). No new implement-time decisions detected beyond the revised plan's Files to Change. Cross-gate dedupe applied.
