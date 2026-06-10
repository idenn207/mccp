# Implementation Report: v0.4.0 Axis H — Plan-Implement Verify Layer

## Summary

`/mccp:prp-implement` Phase 3 EXECUTE에서 plan과 실제 test/validation 결과가 충돌할 때 silent "corrected approach로 계속" 경로를 봉쇄했다. 충돌 감지 시 3-step escalation:

1. `fix-task.md` (verdict='plan_conflict') — 사용자 escalation 제시
2. `STATE.md.chain_aborted=true` (event='plan_conflict_escalated') — auto-chain 정지 (`auto-chain.js shouldAbort()` 자연 honor)
3. Implement receipt meta `plan_conflict_escalated=true` — advisory audit stamp

PRD Open Question §1 ("axis H의 정확한 escalation surface")에 대한 답이 채택되었다: **fix-task.md + STATE.md.chain_aborted 하이브리드** (askUserQuestion은 비동기성 문제로 미채택).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium (예상 부합) |
| Tasks | 10 | 10 완료 |
| Files Changed | 6 UPDATE + 5 CREATE + 2 conditional | 6 UPDATE + 5 CREATE (PRD M1 행은 plan 단계에서 이미 갱신됨, codex-findings-backlog는 DEFER 없음) |
| New Tests | 4 신규 파일 (5+1+2+3 시나리오) | 4 신규 파일, **22 테스트 케이스 모두 PASS** |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `plan-conflict-detector.js` 작성 | Complete | 3 conservative signal (signature-drift / file-expansion / fake-pass) + CLI mode |
| 2 | `plan-conflict-detector.test.js` 5 scenarios | Complete | 5 plan-spec 시나리오 + 5 helper assertions, 10/10 PASS |
| 3 | `fix-task.js` `plan_conflict` verdict 분기 | Complete | `deriveTitle`/`deriveWhy`/`deriveNextActions` 3 곳 patch (4-line 각) |
| 4 | `fix-task-plan-conflict.test.js` | Complete | 1 시나리오 PASS, originating_receipts YAML 형식 검증 포함 |
| 5 | `state-writer.js` VALID_EVENTS에 `plan_conflict_escalated` 추가 | Complete | 1줄 추가 + 주석 |
| 6 | `state-writer-plan-conflict-event.test.js` | Complete | 4 시나리오 PASS (plan-spec 2개 + chain_aborted 보존 + VALID_EVENTS 멤버십) |
| 7 | `receipt/schema.js` advisory field 추가 | Complete | validate + makeSkeleton 양쪽 patch |
| 8 | `schema-plan-conflict.test.js` + CLI flag | Complete | 7 시나리오 PASS (schema 4 + write round-trip 2 + skeleton 1) |
| 9 | `prp-implement.md` Phase 3 Handling Deviations 재작성 | Complete | CONFLICT=0/1 분기 + 3-step escalation 명세 + `[MCCP-PLAN-CONFLICT-STOP]` block |
| 10 | PRD Delivery Milestones M1 row | No-op | plan 단계에서 이미 `in-progress` + plan path 갱신됨 — Phase 5 deviation note 참조 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis (syntax) | Pass | node -c 4종 파일 SYNTAX OK |
| New Tests (22 cases) | Pass | 4 신규 파일 모두 0 fail |
| Affected-Module Regression (121 tests) | Pass | fix-task / state-writer / schema / write / validate-cmd / impeccable-skipped / security-skipped |
| Full Suite Regression (1003 tests) | Pass on relevant scope | 997 pass / 3 fail / 3 skipped. **3 fail은 `g1-patch.test.js` (receipt-prompt/skill hook)** — main 브랜치에서도 동일 실패 (실험 검증) → pre-existing, axis H 변경 무관 |
| Receipt Validate (chain) | Pass | `/mccp:prp-implement` validate ok=true (implement-codex + plan-codex receipt 양쪽 작성 후) |

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/plan-conflict-detector.js` | CREATED | +220 |
| `plugins/mccp/scripts/lib/tests/plan-conflict-detector.test.js` | CREATED | +130 |
| `plugins/mccp/scripts/state/fix-task.js` | UPDATED | +14 / -0 (3 분기) |
| `plugins/mccp/scripts/state/tests/fix-task-plan-conflict.test.js` | CREATED | +55 |
| `plugins/mccp/scripts/state/state-writer.js` | UPDATED | +5 / -0 (VALID_EVENTS + 주석) |
| `plugins/mccp/scripts/state/tests/state-writer-plan-conflict-event.test.js` | CREATED | +75 |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATED | +14 / -0 (validate + skeleton) |
| `plugins/mccp/scripts/receipt/write.js` | UPDATED | +4 / -0 (meta wire-up) |
| `plugins/mccp/scripts/receipt/cli.js` | UPDATED | +0 / -0 (help line만 +1 토큰) |
| `plugins/mccp/scripts/receipt/tests/schema-plan-conflict.test.js` | CREATED | +95 |
| `plugins/mccp/commands/prp-implement.md` | UPDATED | +60 / -7 (Handling Deviations 재작성) |
| `.claude/plans/v0-4-0-axis-h-plan-implement-verify.plan.md` | UPDATED | +12 / -1 (`## Codex Implementation Review` section 추가) |

## Deviations from Plan

본 작업은 axis H가 enforce하려는 silent-absorption 방지를 dogfood해야 하므로, 모든 deviation을 명시적으로 기록한다.

### Deviation 1 — Test 디렉토리 경로

- **WHAT**: Plan은 테스트 위치를 `plugins/mccp/tests/lib/`, `plugins/mccp/tests/state/`, `plugins/mccp/tests/receipt/`로 명시했으나, 실제 repo 구조는 `plugins/mccp/scripts/<area>/tests/`. 신규 4 테스트는 실제 구조에 정합하도록 작성됨.
- **WHY**: 기존 22개 테스트 파일 모두 `scripts/<area>/tests/` 컨벤션 사용 — 새 위치를 만들면 test-runner 호출이 분리되어 휴리스틱이 깨짐. 또한 신규 디렉토리 생성은 plan에 명시되지 않은 file expansion (axis H의 Signal 2 false-positive 가능). 실제 컨벤션 추종이 plan 의도와 정합.
- **plan-conflict-detector 자기검증**: Signal 2 (file-expansion) 시뮬레이션 시 unplanned=4, threshold>=2 → conflict=true. 만약 axis H가 이미 wired 됐다면 escalate trigger. axis H의 첫 번째 실시간 시범 — 본 deviation을 사용자에게 명시 보고 (현 deviation note가 그 채널).

### Deviation 2 — Task 10 (PRD M1 row) no-op

- **WHAT**: Plan은 PRD M1 row를 `pending`→`in-progress`로 갱신하라 명시했으나, plan-stage에서 이미 갱신 완료 상태 (`git status`에 PRD 'M'으로 표시되어 있었음).
- **WHY**: `/mccp:plan` 또는 prior session에서 plan path를 PRD에 사전 stamp하는 패턴이 이미 적용됨. 작업 누락이 아니라 이중 작업 회피.
- **확인**: M1 row 본문 검증 결과 `in-progress` + 정확한 plan path 존재.

### Deviation 3 — Loop warning false positive

- **WHAT**: Task 3 진행 중 PostToolUse hook이 "LOOP WARNING: Tool 'Edit' called 3 times with same parameters" 경고. 실제로는 3개의 다른 함수(`deriveTitle`/`deriveWhy`/`deriveNextActions`)를 차례로 patch한 것.
- **WHY**: Hook의 동일성 판정이 file_path 단독으로 trigger되는 듯. 무해. 보고만.

## Issues Encountered

### Issue 1 — `parseFilesToChange` regex bug (Phase 3 발견 → 즉시 수정)

- 첫 구현이 m flag + `$` lookahead 사용 → `$`이 EOL에서 매치되어 빈 캡처. Line-by-line parsing으로 재작성. Phase 4 test가 즉시 발견 (validation loop 가치 검증).

### Issue 2 — `extractFilesFromText` regex가 bare filename 미매칭

- 첫 구현이 directory prefix `+` 요구로 `helpers.js`(prefix 없음) 누락. `+` → `*`로 fix.

두 이슈 모두 Phase 4 Level 1/2에서 즉시 surface → 즉시 수정 → 다음 단계 진입. Plan의 "validation 루프가 실수를 조기에 잡는다" 원칙이 작동.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/lib/tests/plan-conflict-detector.test.js` | 10 cases | 5 plan-spec scenarios + 5 helper assertions (parseFilesToChange / isInPlan / matchesFakePass / detectFromFileExpansion empty-plan) |
| `plugins/mccp/scripts/state/tests/fix-task-plan-conflict.test.js` | 1 case | `plan_conflict` verdict end-to-end (title/why/nextActions/failures/originatingReceipts YAML) |
| `plugins/mccp/scripts/state/tests/state-writer-plan-conflict-event.test.js` | 4 cases | VALID_EVENTS membership + semantic write 확인 (mtime delta) + typo fallback + chain_aborted preservation |
| `plugins/mccp/scripts/receipt/tests/schema-plan-conflict.test.js` | 7 cases | Schema 4-axis (true/false/absent/wrong-type) + makeSkeleton default + write CLI round-trip 2 |
| **Total** | **22** | **All passing** |

## Next Steps

- [ ] `/mccp:code-review` — 변경 코드 multi-perspective review
- [ ] `/mccp:prp-commit` — 자연어 파일 타겟팅 커밋 (changes scope: axis H scope만)
- [ ] `/mccp:pr` — Codex disabled + impeccable skip(skill-missing) 자동 honor 후 PR 생성

### v0.4.0 Roadmap 진척

| Milestone | Status | Plan |
|---|---|---|
| M1 (H — plan-implement verify) | **implement-complete** — PR 대기 | `v0-4-0-axis-h-plan-implement-verify.plan.md` |
| M2 (I — next-session 1-liner) | pending | — |
| M3+ | pending | — |

> Phase 7 AUTO-CHAIN은 이번 세션에서는 사용자 컨펌 후 단계별 진행 권장 — full chain trigger 전에 `/mccp:code-review` 1회 권장.
