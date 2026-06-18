# Plan: v1.4.0 axis A — `/deep-research` → `/mccp:plan-prd` integration

**Source PRD**: `.claude/prds/v1-4-0-automation-modernization.prd.md`
**Selected Milestone**: M1 — axis A (deep-research → plan-prd)
**Complexity**: Medium

## Summary

`/mccp:plan-prd`가 Phase 2 GROUND 단계에서 외부 조사가 도움될 신호(빈 Evidence section + `Assumption — needs validation via` 마커 + research-trigger 키워드 — keyword 단독은 미흡, **evidence-gap과 조합될 때만** signal=true)를 mode-aware probe로 검출하고, **availability tri-state(`available | missing | unknown`)** 평가 결과가 `available`(=env-confirmed)일 때만 사용자에게 `/deep-research <query>`를 직접 실행하도록 안내한다. 사용자는 dedicated response grammar(`paste:<content>` / `skip-research:<reason>` / `failed-research:<reason>`)로 답하고, `paste:` 응답만이 PRD 본문 `## References` section을 작성한다. **chain-of-custody anchoring은 mechanical: `/mccp:plan` 명령이 PRD body의 `## References` content를 sha256으로 digest해 plan body 신규 섹션 `## External Research Provenance`에 stamp하며, 이 plan body 자체는 plan-codex receipt의 plan_hash로 anchored — PRD body 변조 시 plan validate가 재호출되면 mismatch가 detect됨**. native `/deep-research` 자체는 mccp 내부에서 호출하지 않는다(Principle 위반). probe + injection 양축은 `impeccable-detect.js` / `## Design Direction` inject과 동일한 mechanic을 mirror한다. **M1은 단일 axis 표본 — integration template doc는 `M1-experimental` 명시로 cross-axis invariant 잠금을 회피하며, PRD Open Question §3(점진 누적 vs 별도 M4)은 본 plan에서 결정하지 않고 M2/M3 ship 시 재평가한다**.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Mode-aware detection probe (JSON, env override, tristate availability, classification enum) | `plugins/mccp/scripts/lib/impeccable-detect.js:1-73` | 동일 shape `{ availability:"available"|"missing"|"unknown", research_signal, signal_files, mode, reason }`; env override `MCCP_DEEP_RESEARCH_SKILL=available|missing|unknown`; reason enum ∈ {ok, command-missing, no-signal, path-traversal, unknown-default} |
| Availability probe with tristate (env > filesystem > **default=unknown**) | `impeccable-detect.js:51-73` (`probeSkillAvailable`) | impeccable과 다른 부분: native command는 manifest 없음 + filesystem probe도 weak — default를 **`unknown`** 으로 두고, `unknown` 분기는 안내 prompt 미발사(silent skip). prompt는 `available` 일 때만. env override가 1순위 |
| Path traversal guard (F-Sec-2) | `impeccable-detect.js:17-22, 42-44` | `--plan` 또는 `--stdin` 경로 인자가 repo root 안인지 검증, traversal 시 `reason=path-traversal` + `research_signal=false` + exit 0 |
| Section append into artifact body | `plan-prd.md:105-127` (`## Design Direction`) | Skill/probe 결과를 PRD body 새 섹션으로 append, idempotent re-run 시 기존 섹션 replace |
| **Plan-body provenance hash anchor for chain-of-custody** | (신규 패턴 — M1 도입) | `/mccp:plan`이 PRD body `## References` content를 sha256 digest → plan body 신규 섹션 `## External Research Provenance`에 `sha256 = …` + ISO timestamp + source PRD path stamp. plan body가 plan-codex receipt의 plan_hash에 anchored → PRD body 변조 시 다음 validate 호출에서 mismatch detect. **mutable PRD body에 audit-trail을 두면서도 mechanical custody 보장** |
| Co-creation pause for user round-trip (Phase 2.5 dedicated grammar) | `plan-prd.md:16-28` (Phase 0 CO-CREATION) | mechanism은 mirror하지만 **response grammar는 분리** — Phase 0의 `skip`/`you decide` 토큰과 충돌 회피, Phase 2.5는 `paste:` / `skip-research:` / `failed-research:` 3종 grammar 전용 |
| node test runner + tmp dir fixture + **stdin parser test + false-positive PRD fixture** | `plugins/mccp/scripts/lib/tests/impeccable-detect.test.js` | 동일 구조 — `node:test` + `node:fs/promises` + `os.tmpdir()`. M1 신규: stdin-fed PRD body parsing + 기존 PRD를 fixture로 사용한 false-positive rate 측정 |
| Receipt schema invariant (no new fields) | `docs/v1.3.0-observability/schema-surface.md`, `plugins/mccp/scripts/receipt/schemas/*.json` | M1은 receipt 스키마 손대지 않음 — custody anchor는 plan body 내부 + 기존 plan_hash 메커니즘 재사용. receipt-validate가 mechanical block |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/deep-research-detect.js` | CREATE | mode-aware probe (`prd` only for M1) — tristate availability + AND-gated research_signal + signal_files + reason. `--plan` + `--stdin` 양축 first-class. native command이므로 manifest 검출 불가 → default `unknown`(phantom 안내 회피) |
| `plugins/mccp/scripts/lib/tests/deep-research-detect.test.js` | CREATE | impeccable-detect.test.js mirror — 시나리오 8종(아래 Task 2). false-positive fixture는 repo 내 기존 PRD(`.claude/prds/v1-4-0-automation-modernization.prd.md`) 직접 사용 |
| `plugins/mccp/commands/plan-prd.md` | UPDATE | Phase 2 GROUND 직후 새 sub-phase 2.5 EXTERNAL_RESEARCH 추가 (detect → guide → wait → inject). Phase 4 GENERATE에 References 섹션 자동 inject 로직. **availability=available일 때만 prompt, response grammar `paste:` / `skip-research:` / `failed-research:` 3종 분리** |
| `plugins/mccp/commands/plan.md` | UPDATE | Phase 4 WRITE 직후(Phase 5 PLAN-CODEX GATE 직전) 단계에 PRD body `## References` content sha256 digest → plan body `## External Research Provenance` stamp 로직 추가. PRD에 References 부재 시 stamp 자체 skip(silent). custody anchor의 mechanical hook |
| `docs/automation-modernization/integration-template.md` | CREATE | M1이 ship한 detect→guide→inject 패턴 명세 — **상태 마크 `M1-experimental` 명시, cross-axis receipt invariant 잠금 제거**. M2/M3 ship 시 backward-compatible 갱신. PRD Open Question §3는 본 plan에서 결정 안 함 |
| `.claude/prds/v1-4-0-automation-modernization.prd.md` | UPDATE | M1 row status pending → in-progress, Plan 셀에 본 plan 경로 |
| `CHANGELOG.md` | UPDATE | v1.4.0 신규 row 추가 — M1 ship 시점에 plugin.json bump 결정과 함께 |

**Out of file changes (this milestone only)**:
- `plugin.json` version bump은 PR ship 시점 main HEAD 기준으로 결정 (PRD risk #7) — plan은 결정 시점만 명시, 값 자체는 PR 단계.
- receipt schema (`plugins/mccp/scripts/receipt/schemas/*.json`) 무수정 — invariant.
- STATE.md frontmatter / envelope schema 무수정.

## Tasks

### Task 1: `deep-research-detect.js` probe library (tristate availability + stdin first-class)

- **Action**: `plugins/mccp/scripts/lib/deep-research-detect.js`를 신규 작성. exports `detect({ mode, plan, body, repoRoot, ... }) → { availability:"available"|"missing"|"unknown", research_signal, signal_files, mode, reason }`. 두 가지 입력 경로 모두 first-class: `--plan <path>` 와 `--stdin`(PRD-body draft를 stdin pipe로 받음 — Phase 2.5가 PRD write 전에 호출). `probeAvailability()` 내부 함수는 env override(`MCCP_DEEP_RESEARCH_SKILL=available|missing|unknown`) > best-effort filesystem probe(`~/.claude/commands/deep-research.md` 또는 user-level skill dir 존재 → `available`, 명백한 부재 신호 → `missing`) > **default = `unknown`** (native command는 manifest 검출 불가 — 잘못된 default true는 PRD risk "phantom 안내 금지"를 위반). `research_signal` heuristic은 다음 두 조건의 **AND**: (1) **evidence-gap 신호 ≥1** — (a) `Assumption — needs validation via` 마커, (b) `## Evidence` 섹션이 비어있거나 `TBD —` 토큰만 포함, **AND** (2) research-trigger keyword ≥1 (`spec`, `표준`, `standard`, `외부`, `research`, `리서치` — 단어 경계). evidence-rich + keyword만으로는 signal=false (false-positive 완화 — Codex R1 F2). CLI entries: `detect --mode prd --plan <path> --json` + `detect --mode prd --stdin --json`(stdin은 PRD body raw).
- **Mirror**: `impeccable-detect.js:25-73` 의 JSON shape + classification enum + path traversal guard
- **Validate**: (a) `node plugins/mccp/scripts/lib/deep-research-detect.js detect --mode prd --plan .claude/prds/v1-4-0-automation-modernization.prd.md --json` → 현 evidence-rich PRD는 signal=false(keyword만 있고 Assumption/empty evidence는 없음); (b) `MCCP_DEEP_RESEARCH_SKILL=available cat <Assumption-fixture> | node plugins/mccp/scripts/lib/deep-research-detect.js detect --mode prd --stdin --json` → availability=available + research_signal=true + exit 0

### Task 2: `deep-research-detect.test.js` node test fixtures (stdin + false-positive coverage)

- **Action**: `plugins/mccp/scripts/lib/tests/deep-research-detect.test.js`를 신규 작성. 다음 8 시나리오 커버 —
  1. availability env override `available` / `missing` / `unknown` 3 path 각각
  2. PRD body가 evidence-rich + keyword(`research`) → `research_signal=false` (false-positive 회피 검증; fixture = 현 repo의 `.claude/prds/v1-4-0-automation-modernization.prd.md` 직접 read)
  3. PRD body가 `Assumption — needs validation via` 마커 + keyword → `research_signal=true`
  4. PRD body가 `## Evidence\n\nTBD — needs validation via user research` 단독 → `research_signal=true`
  5. `--plan` 경로 traversal 시도(`../../etc/passwd` 등) → `reason=path-traversal` + `research_signal=false` + exit 0
  6. `--stdin` 입력 path — fixture body를 stdin pipe로 주입, `--plan` 미지정에서 정상 동작
  7. mode=plan/implement/pr/review 시 mode-mismatch → `reason=mode-mismatch` + exit 0
  8. 환경 변수와 CLI flag 동시 지정 시 env override가 1순위
- **Mirror**: `plugins/mccp/scripts/lib/tests/impeccable-detect.test.js` 의 fixture/setup/teardown + `child_process.spawnSync` stdin 패턴
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/deep-research-detect.test.js` → 8/8 통과 + tap output에 fail/skip 없음. 별도로 `node --test plugins/mccp/scripts/lib/tests/impeccable-detect.test.js plugins/mccp/scripts/lib/tests/deep-research-detect.test.js` regression sweep 통과

### Task 3: `plan-prd.md` Phase 2.5 EXTERNAL_RESEARCH (response grammar 분리, availability 게이트)

- **Action**: `plugins/mccp/commands/plan-prd.md`의 Phase Map 표에 Phase 2.5 행 추가. Phase 2 GROUND 본문 직후 다음 절차 명세 추가 —
  1. 사용자가 evidence를 응답한 직후 자동으로 in-memory PRD body draft를 stdin pipe로 detect에 주입: `cat <body-tempfile> | node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/deep-research-detect.js detect --mode prd --stdin --json`. (PRD가 디스크에 있다면 `--plan` 대안 사용.)
  2. **분기 매트릭스(2축)**:
     | availability | research_signal | Action |
     |---|---|---|
     | `available` | true | 안내 prompt 발사 (step 3) |
     | `unknown` 또는 `missing` | * | silent skip — prompt 미발사 (phantom 안내 금지) |
     | `available` | false | silent skip |
  3. 안내 prompt(`available` + signal 동시): `"외부 조사가 도움될 수 있어 보입니다. 다음 turn에서 '/deep-research <조사 질문>'을 실행해 주세요. 다음 응답 grammar 중 하나로 답해 주세요: 'paste: <결과 본문>' / 'skip-research: <사유>' / 'failed-research: <사유>'. 다른 토큰은 무시되고 prompt가 다시 출력됩니다."` (response grammar는 Phase 0의 `skip`/`you decide`와 명시적으로 분리됨 — Codex R1 F4 absorption).
  4. **WAIT for user response**. 응답 토큰이 grammar(`paste:` / `skip-research:` / `failed-research:`)에 미부합이면 prompt 재출력, auto-answer 금지.
  5. 응답 처리:
     - `paste:<content>` → Phase 4 GENERATE의 PRD body inject 단계에서 `## References` section을 신규 추가/replace. 형식: `## References\n\n<!-- Auto-injected from /deep-research at <ISO> -->\n\n<content>\n`. idempotent.
     - `skip-research:<reason>` → PRD body에 `## References` 신규 생성 안 함. plan-prd 보고 message에 `External research: skipped — <reason>` 한 줄 포함.
     - `failed-research:<reason>` → PRD body에 `## References` 섹션을 작성하되 본문은 `> deep-research attempted but failed: <reason>` 한 줄(audit trail이 빈 placeholder가 안 되도록 — Codex R1 F4 audit). plan-prd 보고 message에 동일 신호 표시.
- **Mirror**: `plan-prd.md:16-28` (CO-CREATION pause mechanism) + `plan-prd.md:105-127` (impeccable detection + body section append) + `plan.md:5.0` (probe → branch → annotate)
- **Validate**: dry-run으로 (a) availability=unknown(default) → prompt 미발사 + Phase 3로 정상 진행, (b) `MCCP_DEEP_RESEARCH_SKILL=available` + Assumption-marker PRD draft → prompt 출력 + `paste:<content>` 응답으로 `## References` injection 확인, (c) `MCCP_DEEP_RESEARCH_SKILL=available` + `skip-research:no-internet` 응답 → 섹션 미생성 + 보고 message에 skip 신호. PRD-end-to-end 수동 dogfood로 검증(별도 시각 cycle).

### Task 4: `docs/automation-modernization/integration-template.md` 초안 (M1-experimental 마크)

- **Action**: 새 디렉토리 `docs/automation-modernization/` 생성, 그 안에 `integration-template.md`를 다음 골격으로 작성. 본문 첫 줄에 **`> Status: M1-experimental — single-axis sample (axis A only). Cross-axis receipt schema invariants are intentionally NOT defined until M2 (ultracode) and M3 (/goal) ship and their custody surfaces are independently reviewed.`** 표기.
  - **Pattern name**: "Cooperative native-feature guide pattern"
  - **When to use**: Anthropic이 ship한 native automation 기능을 mccp chain에 audit-trail이 남도록 통합해야 할 때. **각 axis마다 custody 모델 독립 평가 필요** — receipt schema 손대지 않는 모델 vs 새 receipt 필드 vs envelope 확장 등 옵션은 axis-specific (Codex R1 F5 absorption).
  - **3 layer breakdown (axis-A 실증)**: (1) detection probe(`<feature>-detect.js`) — env override + tristate availability + AND-gated signal heuristic, (2) cooperative guide turn — dedicated response grammar(`paste:` / `skip-research:` / `failed-research:`) + WAIT, (3) injection — 결과를 mccp artifact body의 dedicated section + (선택) plan-body provenance hash로 anchor
  - **Custody anchor option matrix (axis별 선택)**:
    | Option | Pros | Cons | axis A 채택 여부 |
    |---|---|---|---|
    | PRD/plan body inject only | receipt schema 무손상 | body는 mutable, 변조 detect 못 함 | ✗ 단독 사용 안 함 |
    | body inject + plan-body provenance hash | receipt 무손상 + plan_hash가 mechanical anchor 제공 | inject가 plan stage 이후라 PRD-only mutation은 다음 plan 호출까지 detect 안 됨 | ✓ axis A 채택 (M1 실증) |
    | 새 receipt 필드(`meta.external_research_*`) | strict mechanical custody | schema bump + migration + cross-axis 잠금 risk | ✗ M1 보류 — M2/M3 평가 시 재고려 |
  - **Anti-pattern**: native feature를 mccp가 자체 재구현(Principle 위반) / mccp가 native command를 자동 invoke 시도(불가능 + dual-review 무력화) / 첫 axis의 custody 모델을 cross-axis invariant로 잠금(M5 risk).
  - **M1 reference**: 본 plan + `deep-research-detect.js` + `plan-prd.md` Phase 2.5 + `plan.md` Phase 4.5 provenance hash
  - **M2/M3 placeholder**: 후속 axis ship 시 본 doc에 reference 추가 + custody option matrix 재평가. **PRD Open Question §3 (점진 누적 vs 별도 M4)는 본 doc 작성 시점에 결정하지 않음** — M2/M3가 ship되면 그 시점에 cycle close 직전 결정 (Codex R1 F5 absorption)
- **Mirror**: 기존 `docs/v0.2-architecture.md` / `docs/gate-design.md` markdown 톤 — section-numbered, table-heavy, rationale-first
- **Validate**: `test -f docs/automation-modernization/integration-template.md && grep -q "M1-experimental" docs/automation-modernization/integration-template.md && grep -q "axis-specific" docs/automation-modernization/integration-template.md`

### Task 5: PRD M1 row 갱신

- **Action**: `.claude/prds/v1-4-0-automation-modernization.prd.md`의 Delivery Milestones 표 1번 row만 변경 — `Status` 셀 `pending → in-progress`, `Plan` 셀 `— → .claude/plans/v1-4-0-m1-deep-research.plan.md`. M2/M3/M4 row는 손대지 않음.
- **Mirror**: `plan.md` input mode 명세 ("update only the selected row from pending to in-progress")
- **Validate**: `grep -E '^\| 1 \|' .claude/prds/v1-4-0-automation-modernization.prd.md`가 `in-progress` 토큰과 plan 경로 둘 다 포함

### Task 6: CHANGELOG.md 신규 row

- **Action**: `CHANGELOG.md` 상단에 v1.4.0 row 추가 (실제 version 토큰은 PR ship 시점 main HEAD 기준 결정 — `v1.4.0 OR v1.4.1 OR v1.5.0` 후보 표기 OK). content: `axis A — /deep-research integration via plan-prd Phase 2.5 (tristate-availability detect + grammar-separated cooperative guide + ## References inject + plan-body provenance hash anchor) + M1-experimental integration template draft`. PRD risk #7 (version race) 명시.
- **Mirror**: 기존 CHANGELOG.md row 톤
- **Validate**: `head -30 CHANGELOG.md`가 `axis A` + `deep-research` + `integration-template` 모두 포함

### Task 7: `/mccp:plan` provenance-hash stamping (chain-of-custody mechanical anchor — Codex R1 F1)

- **Action**: `plugins/mccp/commands/plan.md`의 Phase 4 WRITE 본문 마지막 단계(=Phase 5 PLAN-CODEX GATE 진입 직전)에 다음 단계 추가 —
  1. plan input이 PRD 경로(`.prd.md`로 끝남)일 때만 실행. free-form/non-PRD plan input은 skip.
  2. PRD body에서 `## References` section을 정규식 추출 (다음 `## ` heading 또는 EOF 까지). 없으면 silent skip — plan body에도 `## External Research Provenance` 미작성.
  3. 추출된 References content를 sha256 digest 계산 (Node `crypto.createHash('sha256').update(content, 'utf8').digest('hex')`).
  4. plan body 마지막에 신규 section append: `## External Research Provenance\n\n- Source PRD: <PRD path>\n- References section sha256: <hex>\n- Stamped at: <ISO>\n- Anchor: plan body content is hash-anchored by plan-codex receipt; any post-stamp PRD mutation in ## References will mismatch on next /mccp:plan validate.\n`.
  5. idempotent — re-run 시 기존 `## External Research Provenance` section을 통째로 replace.
  6. Phase 5.6 receipt-write는 변경 없이 plan body 전체를 plan_hash 계산 input으로 사용 (기존 메커니즘 — 추가 작업 0).
- **Mirror**: `plan.md` 본문의 Phase 5.0 / 5.1 inject mechanic + `plan-prd.md:105-127` section append idempotence
- **Validate**: (a) `## References` 없는 PRD → plan body에 provenance section 미생성, (b) `## References` 있는 PRD → plan body 끝에 provenance section append + sha256 hex가 References content 기반으로 계산, (c) References 수정 후 `/mccp:plan` 재실행 → provenance section의 sha256이 다른 값으로 replace (idempotent + freshness), (d) plan-codex receipt-validate가 plan body 변경에 따른 새 plan_hash로 작성됨

## Validation

```bash
# Task 1+2: probe library + tests (stdin + false-positive)
node plugins/mccp/scripts/lib/deep-research-detect.js detect --mode prd --plan .claude/prds/v1-4-0-automation-modernization.prd.md --json
# Expect: research_signal=false (현 PRD는 evidence-rich)
echo '## Evidence\n\nAssumption — needs validation via user research\n\nSome research keyword.' | \
  MCCP_DEEP_RESEARCH_SKILL=available node plugins/mccp/scripts/lib/deep-research-detect.js detect --mode prd --stdin --json
# Expect: availability=available + research_signal=true
node --test plugins/mccp/scripts/lib/tests/deep-research-detect.test.js

# Task 3: plan-prd command body — dry-run dogfood (manual, 별도 cycle)
# (a) availability=unknown(default) → prompt 미발사
# (b) MCCP_DEEP_RESEARCH_SKILL=available + Assumption PRD → prompt 출력
# (c) paste:<content> 응답 → ## References inject
# (d) skip-research:<reason> 응답 → 섹션 미생성
# (e) failed-research:<reason> 응답 → 섹션 작성 + "attempted but failed" 본문

# Task 4: integration template doc (experimental scope + axis-specific custody)
test -f docs/automation-modernization/integration-template.md && \
  grep -q "M1-experimental" docs/automation-modernization/integration-template.md && \
  grep -q "axis-specific" docs/automation-modernization/integration-template.md

# Task 5: PRD M1 row
grep -E '^\| 1 \|.*in-progress.*v1-4-0-m1-deep-research\.plan\.md' \
  .claude/prds/v1-4-0-automation-modernization.prd.md

# Task 6: CHANGELOG
head -30 CHANGELOG.md | grep -E 'axis A' && \
  head -30 CHANGELOG.md | grep -E 'deep-research' && \
  head -30 CHANGELOG.md | grep -E 'integration-template'

# Task 7: provenance-hash stamping (manual dogfood + receipt re-validate)
# (a) PRD without ## References → no provenance section in plan body
# (b) PRD with ## References → plan body가 ## External Research Provenance + sha256 hex 포함
# (c) PRD ## References 수정 후 /mccp:plan 재호출 → sha256 hex 변경됨
node plugins/mccp/scripts/receipt/cli.js validate --command mccp:prp-implement
# Expect: plan-codex receipt valid (plan_hash가 변경된 plan body 반영)

# Full regression sweep
node --test plugins/mccp/scripts/lib/tests/impeccable-detect.test.js \
              plugins/mccp/scripts/lib/tests/deep-research-detect.test.js

# Receipt schema invariant (mechanical guard)
node plugins/mccp/scripts/receipt/cli.js validate --command mccp:plan-prd 2>&1 || true
# Expect: receipt schema reject 없음 — custody anchor는 plan body 내부 변경만
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `/deep-research`의 정확한 native invocation 방식이 Claude Code v2.1.x 사이에서 mid-cycle 변경 | 중 | Task 1 작업 시작 직전 공식 docs WebFetch로 spec 재확인(PRD risk #1) — spec 변경 시 detect.js의 probe target + plan-prd prompt 텍스트만 갱신. probe shape + 3-layer 패턴은 invariant |
| native command 가용성 false-positive로 phantom 안내 발사 (Codex R1 F2) | 낮음 → 중 | Tristate default `unknown` + AND-gated signal + env override 1순위로 mitigation 적용. test 시나리오 8개로 false-positive rate 측정. 잔여 false-positive는 사용자가 `skip-research:<reason>`로 graceful close |
| plan body provenance hash와 PRD body가 시점적으로 불일치 (사용자가 PRD `## References`를 plan 호출 후 수정) | 중 | provenance section 본문에 "any post-stamp PRD mutation in ## References will mismatch on next /mccp:plan validate" 명시 + sha256 mismatch 시 validate가 mechanical block. detect는 다음 plan 호출 또는 receipt-validate 호출 시점이라 즉시는 아님 — 이는 axis A의 명시적 trade-off (full real-time anchor는 새 receipt 필드 필요, M1 보류) |
| Phase 2.5 응답 grammar(`paste:` / `skip-research:` / `failed-research:`)가 사용자에게 학습 비용 | 낮음 | prompt 텍스트에 3종 grammar를 explicit하게 inline 명시. 미부합 응답 시 prompt 재출력 (silent fail 회피). 학습 비용 1회 — M2/M3에서도 동일 grammar 패턴 재사용 |
| Phase 2.5 stdin path가 first-class지만 Phase 0 CO-CREATION 흐름과 race | 낮음 | Phase 2.5는 Phase 2 evidence 응답 직후 단일 step — Phase 0 question set은 이미 종료된 상태. stdin pipe로 body draft 주입은 in-memory 단일 호출, race surface 0 |
| integration template doc가 1-axis 표본으로 작성된 채로 M2/M3 cycle에 forking | 중 | doc 첫 줄 `M1-experimental` mark + custody option matrix가 axis별 독립 평가 강제 + `Anti-pattern` 섹션에 "첫 axis custody 모델을 cross-axis invariant로 잠금" 명시 (Codex R1 F5 absorption). M2 진입 시 doc audit는 mandatory |
| PRD M1 row 갱신이 다른 worktree와 race | 낮음 | M3는 cycle-close 상태(MEMORY.md `mccp-v1.3.0-cycle.md` 기록). v1.4.0 PRD는 이번 worktree에서만 active. main에 다른 PRD PR이 들어오면 rebase 시 PRD body 충돌만 — mechanical rebase로 해소 |
| 사용자가 `failed-research:` 응답 시 PRD에 placeholder section만 남음 → 정보량 0 | 낮음 | section 본문에 사유 + ISO timestamp 포함하도록 강제. Codex R1 F4 absorption — `paste:` 없이도 audit trail은 "attempted but failed at X with reason Y" 형태로 의미 있는 record |

## Acceptance

- [ ] Task 1-7 모두 완료
- [ ] Validation 블록의 모든 명령 exit 0
- [ ] `node --test` 신규 + 기존 test 모두 통과(regression 0) — 특히 false-positive fixture(evidence-rich PRD)에서 `research_signal=false` 검증
- [ ] receipt schema 무변경 — `mccp:receipt-validate`가 v1.4.0 작업 후에도 모든 gate 통과(PRD Success Metric 2). custody anchor는 plan body 내부 + 기존 plan_hash 메커니즘에만 의존
- [ ] PRD M1 row가 `in-progress` + 본 plan 경로 명시
- [ ] integration template doc가 `M1-experimental` 마크 + axis-specific custody option matrix + 3-layer breakdown + Anti-pattern lock-in 경고 포함
- [ ] `/mccp:plan`이 PRD with `## References`에서 plan body `## External Research Provenance` 자동 stamp + sha256 hex anchor
- [ ] response grammar(`paste:` / `skip-research:` / `failed-research:`) 3종이 Phase 0 `skip`/`you decide`와 명시적으로 분리됨 (plan-prd.md 본문에 grammar 표 inline)
- [ ] mccp의 자체 native 기능 재구현 0 — `/deep-research` invocation은 사용자 turn에만 위임(PRD Principle invariant)

## Design Critique

> impeccable critique applied 2026-06-19. PRODUCT.md(`register=product`)의 PM 콘솔 UI(dashboard / `status.html` / `STATUS.md`)와 본 plan의 변경 surface는 disjoint — 본 plan은 (1) Node.js detection probe library, (2) slash command `.md` 본문 spec, (3) 내부 docs/automation-modernization markdown 추가만 다루며 UI element / visual hierarchy / cognitive load 평가 대상 0. Nielsen heuristics + persona walkthrough + browser visualization 모두 비-적용. impeccable Skill availability=ok, critique decision = **not-applicable for backend-tooling plan** (Skill returned, but surface absent). 향후 axis(M2 ultracode, M3 /goal) 중 PM 콘솔 UI 변경을 동반하면 그 plan에서 critique 재평가.

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.2.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2) with `--impeccable-available` (design scope excluded)
- 라운드 수: 1 (R1만, MCCP_GATE_ROUND_CAP=1 default)
- 합치 결론: needs-attention(R1) → R1 absorption 5/5 적용 완료 → R2 skip (cap=1 + ACCEPT_NOW 항목 모두 plan body 수정으로 self-attest 해소)
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1: `## References` body-only audit trail does not satisfy receipt-chain custody | HIGH | ACCEPT_NOW | PRD Success Metric 2(receipt chain custody)와 정면 충돌. mechanical anchor가 필요. Task 7 신설 + Summary/Patterns/Files/Acceptance 갱신으로 plan-body provenance hash anchor 도입 (PRD body는 mutable이지만 plan body는 plan_hash로 anchored) |
  | F2: Default-true availability + broad keyword signal creates blocking false positives | HIGH | ACCEPT_NOW | PRD risk "phantom 안내 금지"와 정면 충돌. Task 1 갱신 — tristate(`available|missing|unknown`) + default `unknown` + AND-gated signal (evidence-gap AND keyword). Task 2에 false-positive fixture(현 evidence-rich PRD) 명시 |
  | F3: Phase 2.5 depends on an untested stdin path before the PRD exists | MEDIUM | ACCEPT_NOW | Task 1 CLI contract에 `--stdin`을 first-class entry로 격상 + Task 2 시나리오 6에 stdin parser test 추가. plan-prd Phase 2.5 step 1이 stdin 경로를 default로 사용 |
  | F4: Inserted WAIT contract overloads Phase 0 `skip`/`continue` semantics | MEDIUM | ACCEPT_NOW | Task 3 갱신 — Phase 2.5 전용 response grammar(`paste:` / `skip-research:` / `failed-research:`) 3종 도입, Phase 0의 `skip` 토큰과 명시적으로 분리. `continue` 토큰 폐기. `failed-research:`는 audit trail이 빈 placeholder가 되지 않도록 사유 + timestamp 본문 강제 |
  | F5: Integration template freezes an M1-only rule before M2/M3 prove it | MEDIUM | ACCEPT_NOW | Task 4 갱신 — doc 첫 줄 `M1-experimental` mark + custody option matrix(axis별 독립 평가) + Anti-pattern 섹션에 "첫 axis custody 모델을 cross-axis invariant로 잠금" 명시. PRD Open Question §3는 본 plan에서 미결정으로 유지 |
- Deferred to backlog: 0 — 5건 모두 ACCEPT_NOW (CRITICAL/HIGH 미해소 0건 → R2 escalate 조건 미충족)
- Open Questions: 없음 — Auto-CRITICAL 카테고리(secret exposure, data loss, irreversible migration, auth bypass, external destination change, crypto key handling) 해당 finding 0건
- Codex session 참조: threadId `019edb52-96a6-7d70-94da-5135a0e947ce` (codex-invoke v0.2.2 wrapper, durationMs=207590, exit 0, blocking=false)
