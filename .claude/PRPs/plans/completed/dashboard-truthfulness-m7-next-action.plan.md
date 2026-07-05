# Plan: Dashboard Truthfulness M7 — 다음-행동 진실성 + 잘림 제거

**Source PRD**: `.claude/prds/dashboard-truthfulness.prd.md`
**Source feedback**: 사용자 육안 피드백 2026-06-25 (status.html 스크린샷) — 핵심 기능(다음 행동 추천)이 hollow + 설명 잘림
**Selected Milestone**: M7 (신규 row) — 다음-행동 진실성 + 잘림 제거
**Complexity**: Medium

## Summary

대시보드의 **핵심 기능 = "다음 진행사항을 정확히 알려주고 추천"** 인데, 현재 구현은 (1) STATE.md `Next Step`의 첫 `/mccp:*` 토큰을 그대로 echo해 stale/hollow `/mccp:resume`(handoff 신호 없으면 noop인 복구 메타-명령)를 추천하고, (2) Hero 설명을 verbose Summary 에세이로 채워 220자에서 문장 중간에 자른다. M7은 **다음-행동을 in-progress 마일스톤의 실제 게이트 frontier에서 derive**(④)하고, **Hero 설명·진행중 위젯의 잘림을 제거**(⑤)한다. ④의 frontier 정확성은 **ledger-aware 파이프라인 decision-state**(①)가 전제 — `converged-frontier`가 ledger 완료를 반영해야 "다음=PR" 같은 판단이 truthful해진다.

> ②(lifecycle 스코핑)·③(글자-ID strip)는 M8로 분리(사용자 결정 2026-06-25). 결정 보존: v0.4.0 8행→dropped, Status SSoT + PRD별 그룹 + 드로어.

## 근본 원인 (코드 추적 확정)

| 증상 | 원인 | 파일:라인 |
|---|---|---|
| 다음=`/mccp:resume` (hollow) | `resolveNextAction` step 1이 STATE.md `Next Step` 첫 `/mccp:*` 토큰을 verbatim echo. stale STATE.md가 `/mccp:resume`를 담아 → 진짜 frontier 추론(step 2)을 가림. resume는 handoff 없으면 noop인 복구 메타-명령. | `parsers/next-action.js:98-108` (extractCommand 우선) + `:61` (제네릭 CMD_PURPOSE) |
| Hero 설명 문장 중간 `…` 잘림 | subtext가 verbose plan Summary를 220자 hard-cut(`slice(0,219)+'…'`) + CSS 4줄 clamp 이중 | `verdict.js:142` (maxLen 220) + `intent-extractor.js:41` + `html.js:313` (line-clamp:4) |
| 진행중 위젯명 `…` 잘림 | 공간 남는데 단일행 ellipsis clip | `html.js:327` (`.hw-list li` nowrap/ellipsis) |

## User Decisions (2026-06-25)

- M7 범위 = **핵심 집중**: ④(다음-행동)+⑤(잘림)+①(ledger 파이프라인, ④ 전제). ②③은 M8.
- 잘림 정책: **"그만 잘라"** — 다음 진행사항 설명은 완결돼야 함(진행 판단 가능하도록). 완전성 > 시각 밀도 clamp.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Ledger 완료 판정 | `parsers/decision-state.js:173-207` (`isMilestoneClosed`) | decision_id/plan_basename + `verdict==='converged'` close. ①이 그대로 재사용. |
| decision-state 소비 | `parsers/decision-state.js:133-147` (`deriveDecisionState`) | receipt→Map<decisionId, {nodes, state, activeStage}>. ④가 frontier 추출에 소비. |
| next-action 추론 | `parsers/next-action.js:86-152` (`resolveNextAction`) | source 태깅 + executable/copyText 분리 + cleanArg 정규화. ④가 frontier-derive 단계 삽입. |
| 명령→용도 설명 | `parsers/next-action.js:60-76` (`describeAction`/`CMD_PURPOSE`) | planIntent 우선 + 명령 제네릭 폴백. frontier source가 planIntent 사용. |
| Hero subtext | `verdict.js:137-146` + `parsers/intent-extractor.js` | freshInProgress→label(h1)+intent(subtext). cap만 완화. |
| 위젯 잘림 정책 | `html.js:185,439,480` (.pipe-id ellipsis + title 툴팁) | 잘림 필요한 곳만 ellipsis. hw-list는 공간 있어 wrap으로 전환. |

## Files to Change

| File | Action | Why |
|---|---|---|
| `parsers/decision-state.js` | UPDATE | ① `buildDecisionState(decisionId, receipts, ledgerItems)` + `deriveDecisionState(receipts, ledgerItems)` + ledger-close 시 converged-frontier/missing-pr 노드 done 승격(`isMilestoneClosed` 재사용). |
| `sections/pipeline.js` | UPDATE | ① `model.sources.ledger.items` 추출해 `deriveDecisionState`에 전달. |
| `parsers/next-action.js` | UPDATE | ④ `HOLLOW_COMMANDS`(resume/trace/receipt-*) 필터 + **gate-frontier derive 단계** + genuine-handoff-only resume + 완전 설명. |
| `sections/status-grid.js` | UPDATE | ④ `resolveNextAction` ctx에 `decisionState`(deriveDecisionState(receipts,ledger)) + `hasHandoffSignal`(STATE.md handoff frontmatter) 주입. |
| `verdict.js` | UPDATE | ⑤ subtext maxLen 220 cap 제거(문장 중간 `…` 금지) — full intent. |
| `parsers/intent-extractor.js` | UPDATE | ⑤ 무인자/관대 cap 시 first-block 완결 반환(hard `…` 없음). |
| `html.js` | UPDATE | ⑤ Hero subtext line-clamp(313) 완화/제거 + `.hw-list li`(327) wrap 전환 + footer version 동기. |
| `markdown.js` | UPDATE | ⑤ md next-action 설명 완결(plain) + footer version 동기. |
| `.claude/prds/dashboard-truthfulness.prd.md` | UPDATE | M6 `in-progress`→`complete` + M7 row(신규, in-progress) 추가. |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version `1.18.10`→`1.18.11`. |
| `parsers/tests/decision-state.test.js` | UPDATE | ① ledger-close 승격 + 부재 시 frontier 유지. |
| `sections/tests/pipeline.test.js` | UPDATE | ① ledger decision ✓완료. |
| `parsers/tests/next-action.test.js` | UPDATE | ④ hollow resume 필터 / frontier-derive(impl→implement, pr→pr) / genuine handoff만 resume / 완전 설명. |
| `tests/render-integration.test.js` (또는 status-grid/verdict test) | UPDATE | ④ wiring + ⑤ Hero subtext·위젯 잘림(`…`/ellipsis) 부재 단언. |
| `CHANGELOG.md` | UPDATE | v1.18.11 row. |

## Tasks

### Task 1: ① decision-state.js — ledger-aware converged-frontier 승격 (freshness-guarded)
> **Codex R1 F2 흡수 (over-claim guard)**: ledger 승격은 freshness/coverage 검증을 통과할 때만 `done`. same-slug 편집 plan이나 partial bundled ledger가 unfinished gate를 `done`으로 위장하는 over-claim 차단. heavy coverage(terminal-gate fanout / commit-ancestry)는 backlog defer — M7은 cheap guard만.
- **Action**: `buildDecisionState`/`deriveDecisionState`에 `ledgerItems` 인자 추가. converged-frontier 계산(line 97-103) 직후 **freshness guard 통과 시에만** converged-frontier 노드 + (frontier 뒤) missing terminal pr 노드를 `done` 승격 → `state='done'`. freshness guard:
  1. `isMilestoneClosed({decisionId, receipts, ledgerItems}).via==='ledger'` AND
  2. ledger 엔트리가 **decisionId AND plan basename 둘 다** 매칭(둘 중 하나만 매칭은 승격 금지) AND
  3. ledger 엔트리에 `plan_file_hash`(또는 동등 필드)가 있고 현재 plan 파일이 존재하면 **hash 일치**할 때만(불일치=plan이 편집/재오픈됨 → 승격 금지, receipt-derived frontier 유지). hash 필드 부재 시 under-claim(승격 안 함이 아니라 *frontier 유지*가 안전 default — 즉 hash 검증 불가하면 보수적으로 history-only).
- ledger 부재/guard 미통과 시 기존 동작 불변(frontier 유지 = under-claim 허용, Open Questions의 명시 stance).
- **Mirror**: `isMilestoneClosed`(:173-207) 재사용 — plan-body/milestone-history와 완료 판정 단일화. hash 비교는 receipt `plan_hash` 비교 패턴 재사용.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/parsers/tests/decision-state.test.js` — (a) full-match+hash-match → 승격, (b) **same-slug edited plan(hash 불일치) → 미승격(frontier 유지, F2 회귀)**, (c) partial ledger(basename mismatch) → 미승격, (d) ledger 부재 → 기존 수렴 유지.

### Task 2: ① pipeline.js — ledger 전달
- **Action**: `renderPipeline`에서 ledger 추출 후 `deriveDecisionState(receipts, ledgerItems)`.
- **Mirror**: `milestone-history.js:128` ledger 추출.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/sections/tests/pipeline.test.js`

### Task 3: ④ next-action.js — gate-frontier derive + hollow 필터 + frontier-primary 재정렬 (CORE)
> **Codex R1 F1+F3 흡수 (재정렬)**: frontier를 **PRIMARY**로 올리고, STATE.md substantive 명령은 *freshness-gated fallback*으로 강등. handoff predicate는 기존 dispatcher 의미(`handoff_spawn`)에 정렬. 이유: STATE.md가 다른 cycle을 가리켜도(현 worktree가 그 사례) stale-but-substantive 명령이 frontier를 가리는 핵심 실패를 차단.
- **Action**: `resolveNextAction` 재구성(우선순위 순):
  1. **genuine handoff만 resume (F3 정렬)**: `ctx.hasHandoffSignal` = STATE.md `last_event==='handoff_spawn'`일 때만 `/mccp:resume`(source='resume-state', executable, 설명 '중단된 핸드오프 이어가기'). `resume_state==='in-flight'` 단독·`resume_dispatching`·stale dispatch는 **executable 추천 금지** — 필요 시 비-executable status 텍스트로만. (기존 dispatcher `state-resumption.dispatch`와 동일 semantics.)
  2. **gate-frontier derive (CORE, 이제 PRIMARY)**: in-progress plan basename→decisionId→`ctx.decisionState.get(id)`의 frontier(첫 non-done 노드). `frontier.short` → 명령: `impl`→`/mccp:prp-implement <planPath>`, `pr`→`/mccp:pr`, `plan`→plan 계속(prose). 설명=`ctx.planIntent`(구체) 우선. source='gate-frontier', executable. **이 단계가 STATE.md echo보다 먼저 평가됨.**
  3. **STATE.md substantive 명령 — freshness-gated fallback (F1 흡수)**: `extractCommand` 결과가 `HOLLOW_COMMANDS`(`mccp:resume`,`mccp:trace`,`mccp:receipt-status`,`mccp:receipt-validate`,`mccp:receipt-write`)가 아니고 executable이며, **추가로 freshness 검증을 통과**할 때만 채택. freshness = 명령의 plan-path 인자(있으면)가 현재 in-progress plan 집합(`ctx.plans` 중 status='in-progress')의 한 path와 일치 OR decisionId가 `ctx.decisionState`의 active(비-done) 엔트리와 일치. 불일치(=다른/종료 cycle 지시) 시 **executable 추천 금지** — stale로 간주해 무시(또는 비-executable status). source='state-fresh'.
  4. frontier·STATE.md 모두 부재/불충족 → 기존 in-progress-plan 폴백.
  5. prose/idle.
- **Mirror**: 기존 source 태깅·executable·describeAction 구조 유지(재정렬 + freshness 술어 삽입). freshness 매칭은 `ctx.plans`/`ctx.decisionState` 기존 주입 데이터만 사용(신규 source 0).
- **Validate**: (a) hollow `/mccp:resume` blob → frontier-derive로 빠짐, (b) **stale substantive 명령(다른 cycle plan-path)이 담긴 STATE.md → frontier가 우선, stale 명령 미채택(F1 회귀)**, (c) impl-frontier→implement / pr-frontier→pr, (d) `last_event==='handoff_spawn'`만 resume / `resume_state==='in-flight'` 단독은 비-resume(F3 회귀). `node --test .../next-action.test.js`

### Task 4: ④ status-grid.js — decisionState + hasHandoffSignal 주입
- **Action**: `resolveNextAction` 호출부(line 213-219)에 `decisionState: deriveDecisionState(receiptsItems, ledgerItems)` + `hasHandoffSignal` 추가. status-grid에 decision-state require 추가. (receipts/ledger는 model.sources에서 이미 접근.)
- **Mirror**: 기존 ctx(plans/planStatuses/planStaleness/planIntent) 패턴.
- **Validate**: 통합 렌더 후 next-action chip이 frontier 기반 명령(`/mccp:prp-implement <m7-plan>` 등) 노출, `/mccp:resume` 미노출(handoff 신호 부재 시).

### Task 5: ⑤ Hero 설명 잘림 제거
- **Action**: `verdict.js:142` subtext `maxLen: 220` 제거(또는 매우 큰 값) → intent-extractor가 first-block 완결 반환(hard `…` 없음). `html.js:313` Hero subtext `-webkit-line-clamp: 4` 제거/완화(전체 wrap 노출). intent-extractor가 무인자 cap 시 `…` append 안 하도록 가드.
- **Mirror**: `html.js:801` "line-clamp(잘림 대신)" 주석 의도 — 잘림 대신 wrap.
- **Validate**: 렌더 후 Hero subtext에 `…` 미존재 + 완결 문장. design-lint H 위반 0.

### Task 6: ⑤ 진행중 위젯 잘림 제거
- **Action**: `html.js:327` `.hw-list li`의 `white-space: nowrap` + `text-overflow: ellipsis`를 wrap(`white-space: normal`, 최대 2줄 정도)으로 — 공간 있을 때 이름 전체 노출.
- **Mirror**: 잘림 필요한 .pipe-id(긴 decision)와 달리 위젯은 짧아 wrap 적합.
- **Validate**: 렌더 후 위젯 마일스톤명 전체 표기(`m6 ver…` 아님).

### Task 7: 버전·footer·PRD·CHANGELOG
- **Action**: `dashboard-truthfulness.prd.md` M6→complete + M7 row(`다음-행동 진실성 + 잘림 제거`, in-progress, 본 plan). `plugin.json` 1.18.10→1.18.11. `html.js`/`markdown.js` footer 1.18.11. CHANGELOG v1.18.11.
- **Mirror**: §3.7 patch bump + footer 동기.
- **Validate**: version drift 0 grep.

## Validation

```bash
node --test plugins/mccp/scripts/lib/renderer/parsers/tests/decision-state.test.js
node --test plugins/mccp/scripts/lib/renderer/parsers/tests/next-action.test.js
node --test plugins/mccp/scripts/lib/renderer/sections/tests/pipeline.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/        # 전체 renderer 회귀
node --test plugins/mccp/scripts/derive/tests/              # derive 회귀

# 통합 — 실제 렌더 후 핵심기능 육안 가드
node plugins/mccp/scripts/derive/cli.js render
#  → next-action: handoff 신호 없으면 /mccp:resume 미노출, frontier 기반 구체 명령 노출
#  → Hero subtext: '…' 없음, 완결 문장
#  → 진행중 위젯: 마일스톤명 전체(ellipsis clip 없음)

grep -rn "1\.18\.10" plugins/mccp/scripts/lib/renderer/ plugins/mccp/.claude-plugin/   # 잔재 0
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| ④ frontier-derive가 잘못된 다음명령 추천(decisionId↔plan 매핑 오류) | 중 | decisionId=plan basename slug 정확 매칭, 부재 시 기존 in-progress-plan 폴백(회귀 안전). frontier 없으면 idle. negative test(매핑 실패→폴백). |
| ④ STATE.md substantive 명령이 stale이어도 echo (Codex F1) | 중 | **frontier-primary 재정렬(Task 3)**: frontier가 STATE.md echo보다 먼저 평가됨. STATE.md substantive는 freshness-gate(plan-path/decisionId가 현재 in-progress 집합과 일치) 통과 시에만 채택, 불일치=stale 무시. 회귀 test(b)로 다른-cycle STATE.md→frontier 우선 단언. |
| ① ledger 승격 over-claim — same-slug 편집/partial ledger가 unfinished gate를 done 위장 (Codex F2) | 중 | freshness guard(decisionId+basename full-match + plan_file_hash 일치)로 승격 제한. hash 검증 불가 시 history-only(under-claim safe default). 회귀 test(b)(c). |
| ④ resume 추천 완전 제거가 정당한 handoff 케이스 누락 | 저 | genuine handoff 신호(resume_state/handoff_spawn) 경로 보존 — 그때만 resume. |
| ⑤ clamp 제거가 verbose intent로 Hero 과대 | 중 | intent-extractor는 first-block(첫 의미 단락)만 반환 — 무한장 아님. 위젯은 2줄 cap. design-lint 통과 확인. 사용자 "그만 잘라" 우선. |
| ⑤ Hero/위젯 CSS 변경이 기존 레이아웃/테스트 회귀 | 중 | render-integration의 subtext/위젯 단언 갱신 + 전체 renderer 회귀 가드. |
| 버전 footer drift | 중 | Task 7 footer 동기 + grep 가드(§3.7). |

## Acceptance

- [ ] ④ handoff 신호 없을 때 next-action이 `/mccp:resume` 미추천 + in-progress 마일스톤 frontier 기반 구체 명령(impl→implement, pr→pr) 추천 + 완전 설명 (next-action.test green)
- [ ] ④ genuine handoff 신호 시에만 `/mccp:resume` 추천 — `last_event==='handoff_spawn'`만 executable, `resume_state==='in-flight'` 단독·`resume_dispatching`은 비-resume (Codex F3 회귀 단언)
- [ ] ④ **frontier-primary**: stale substantive STATE.md 명령(다른/종료 cycle plan-path)이 있어도 frontier가 우선, stale 명령 미채택 (Codex F1 회귀 단언)
- [ ] ① **ledger 승격 freshness-guard**: same-slug 편집(hash 불일치)·partial ledger(basename mismatch) → 미승격(frontier 유지), full-match+hash-match만 done 승격 (Codex F2 회귀 단언)
- [ ] ⑤ Hero 설명에 문장 중간 `…` 부재(완결) + 진행중 위젯 마일스톤명 전체 노출
- [ ] ① ledger 엔트리 decision이 파이프라인 ✓완료(frontier 정확성 확보), 미보유는 수렴 유지
- [ ] 전체 renderer + derive 0 회귀, 실제 render 핵심기능 가드 통과
- [ ] plugin.json 1.18.11 + footer drift 0
- [ ] Patterns mirrored (`isMilestoneClosed`/`deriveDecisionState`/`resolveNextAction`/`describeAction` 재사용)

## Open Questions

- [x] (① 경계, non-blocking) bundled-PR ledger coverage — PR #64는 m4 slug 1개 ledger만 보유. 파이프라인은 m4만 완료 표기(m5/m6 수렴 유지). *표시* 정합만 M7, ledger *생성* 완전성은 M1 commit-wiring 부채. under-claim 허용. <!--mccp:resolved reason="M7 SHIPPED PR #64 (v1.18.11) — *표시* 정합 완료(frontier-primary 재정렬 + ledger freshness-guard). under-claim stance 코드 구현됨: ledger 부재/guard 미통과 시 frontier 유지(decision-state.js Task 1, 본 plan line 66 명시 stance). bundled-PR ledger *생성* 완전성(번들 PR이 decision_id 1건만 entry 생성 — M1 triggerLedgerAppend Task 4 설계)은 M1 commit-wiring 경계 부채로, OQ 본문이 명시한 'under-claim 허용'이 settled decision이라 non-blocking·별도 작업 불요." at="2026-06-30T10:21:40Z"-->

- [x] (④ 경계) STATE.md content-staleness — STATE.md가 다른 cycle을 가리킬 때(현재 worktree처럼) substantive 명령도 stale 가능. M7은 hollow 필터 + frontier-derive로 robust화하되, STATE.md freshness 자체(task_fingerprint↔실제 branch/plan 대조 경고)는 별도 axis 후보. <!--mccp:resolved reason="M7-scope SHIPPED PR #64 (v1.18.11) — next-action이 hollow command freshness-gated 필터 + frontier-primary 재정렬로 stale STATE.md에 robust(M1 PRD OQ line 80 출시 확인). 잔여 'STATE.md freshness 자체 경고'는 OQ 명시대로 별도 axis: v1.4.2 dashboard-overhaul M1 staleness-guard(plan-body.js, plan basename cycle ID↔task_fingerprint 일치→stale plan 표시)로 substantially 흡수 + backlog 2026-06-19 STATE.md staleness axis와 동일 family로 tracked. 경계 settled, non-blocking." at="2026-06-30T10:26:47Z"-->
- [x] (④ 경계) PR-already-open 인지 — pr-frontier에서 `/mccp:pr` 추천 시 이미 열린 PR(STATE.md last_pr_url) 감지는 범위 밖(gh 의존). 향후 refinement. <!--mccp:resolved reason="M7-scope SHIPPED PR #64 (v1.18.11) — pr-frontier가 /mccp:pr 추천(next-action.js Task 3 step 2). PR-already-open 감지는 OQ 본문 명시대로 gh 의존 → M7 의도적 범위 밖(경계 결정 settled, local-only derive 불변). 향후 refinement은 backlog 2026-06-19 STATE.md staleness axis(last_pr_url vs gh pr list 비교)와 동일 family로 tracked. non-blocking." at="2026-06-30T10:26:47Z"-->

## Design Critique

- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` 4 앵커 Read 완료.
- critique 대상: status.html(mccp PM 콘솔) Task 5/6 design surface 결정(Hero subtext 잘림 제거 + 진행중 위젯 wrap).
- 라운드 수: 1
- verdict: **CONVERGED** (decideCritique 오라클, HIGH/CRITICAL 0)
- PRODUCT.md 정합: Calm·Decisive·Compact + "Quiet by default, loud on demand". 사용자 명시 결정 "완전성 > 시각 밀도 clamp"(2026-06-25)가 compact 압박보다 우선 → 잘림 제거는 register 위배 아님.

| Constraint | 판정 | 근거 |
|---|---|---|
| ① 정보 위계 3단계 | PASS | heading depth 미변경. Hero/위젯 구조 유지. |
| ② 강조색 화면당 1개 | PASS | accent 토큰 추가 0. `html.js:316-318` 주석의 기존 강조색 규율(상태색=dot+count 한정) 보존. |
| ③ raw markdown marker 금지 | PASS | `intent-extractor.js:36` `truncate()`가 이미 `[*_\`]` strip. cap만 완화돼도 marker 누출 경로 없음. |
| ④ 한 화면 항목 수 상한 | PASS | 위젯 top-N + card-expand `<details>` 유지. li wrap은 *개별* 잘림 해소이지 항목 수 증가 아님. |

### Implement 가이드 (MEDIUM/LOW — 비차단, CONVERGED 유지)

- **(MEDIUM, Task 5)** cap **완전 제거**는 `firstNonEmptyLine`이 Summary 첫 줄 전체를 반환하므로(본 M7 plan Summary 첫 줄은 ~400자 단일 문단), line-clamp까지 제거하면 400자 Hero가 됨. 사용자 "완전성"은 *문장 완결*이지 *문단 dump*가 아님. 권장: maxLen을 **매우 큰 값 대신 sentence/clause 경계 절단**(첫 종결 `.`/`。`/`·` 또는 first sentence)으로 완결시키고, `html.js:313` line-clamp는 **제거 대신 relaxed(예: 3~4줄)** 유지해 CSS safety net 보존. mid-sentence `…`는 0이되 Hero는 Calm 유지.
- **(LOW, Task 5)** markdown-strip(`truncate`의 `replace`) 경로가 html.js subtext와 markdown.js next-action 설명 **양 surface**에서 모두 타도록 보장. Summary에 inline-link(`[x](y)`)/HTML entity가 있으면 추가 strip 고려.
- **(LOW, Task 6)** `.hw-list li` wrap 전환 시 2줄 cap을 `white-space: normal` 단독이 아니라 `-webkit-line-clamp: 2`(+`display:-webkit-box`)로 **명시**해 긴 마일스톤명이 다줄 폭주하지 않게.

## Design Routing Guide

routing mode: auto (effective at implement stage). plan 단계는 렌더 UI가 없어 invoke 0 — 아래는 implement gate가 stage별로 라우팅할 impeccable 명령 체크리스트(여기선 권장만).

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

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.18.6/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (R1 absorption이 plan-level에서 완결 → R2 escalation 조건 (b) 미충족)
- 합치 결론: Codex verdict=needs-attention 3건(HIGH·HIGH·MEDIUM). 전부 truthfulness 핵심 축(stale 명령 추천 / 미완 gate done 위장)으로 정당 → R1에서 plan 재설계로 흡수(frontier-primary 재정렬 + ledger freshness-guard + handoff predicate 정렬). heavy ledger coverage만 backlog defer.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — stale substantive STATE.md 명령이 frontier보다 우선 | HIGH | ACCEPT_NOW | 현 worktree(STATE.md가 pipeline-chart cycle 지시)에서 실제 재현되는 핵심 truthfulness 실패. Task 3 **frontier-primary 재정렬** + STATE.md freshness-gate로 흡수. 회귀 test(b). |
  | F2 — ledger 승격이 freshness/coverage 없이 over-claim | HIGH | ACCEPT_NOW(cheap) + DEFER_TO_BACKLOG(heavy) | cheap guard(decisionId+basename full-match + plan_file_hash 일치)는 Task 1 흡수. terminal-gate coverage + commit-ancestry 검증은 YAGNI for M7(under-claim safe) → backlog. |
  | F3 — handoff predicate가 hollow resume 재추천 가능 | MEDIUM | ACCEPT_NOW | 기존 dispatcher `state-resumption.dispatch` 의미(`last_event==='handoff_spawn'`만 actionable)에 정렬 — cheap correctness. Task 3 step 1 흡수. |
- Deferred to backlog: 1 → `.claude/plans/codex-findings-backlog.md` (F2 heavy coverage)
- Open Questions: 없음 (auto-CRITICAL 0 — secret/data-loss/auth/migration 무관, read-only derive)
- Codex session 참조: threadId `019efd4f-428a-7a82-a5bf-6a8dd711406c`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.

- 근거: plan-codex round(이 세션)가 frontier-primary 재정렬·ledger freshness-guard·handoff predicate 정렬·hollow filter를 adversarial review하고 F1/F2/F3 3건을 plan 본문에 흡수 완료. 구현은 흡수된 plan을 그대로 실행 — file layout/abstraction/dep/concurrency 신규 결정 0.
- 구현 범위: `Files to Change` 목록으로 한정(implement-time file expansion 없음).
- cost-tier critical(briefing tier-critical skip) — redundant Codex 재호출 회피가 dedupe 취지와 정합.
