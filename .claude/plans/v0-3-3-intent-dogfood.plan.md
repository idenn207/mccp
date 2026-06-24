# Plan: v0.3.3 — Intent-Driven E2E Dogfood (Milestone 6)

**Status**: 🚧 **IN PROGRESS** (plan created 2026-06-09, Codex permanent-bypass advisory)
**Plugin version**: 0.3.2 → **0.3.3**
**Parent roadmap**: [mccp-roadmap.plan.md](mccp-roadmap.plan.md) §Milestone 6
**Complexity**: Medium (1 test fix + 1 fresh-session dogfood pass + 1 observation report + 3 docs sync)

---

## Summary

v0.3.0/0.3.1/0.3.2의 자동화 backbone(auto-handoff + `/mccp:work` + escalate)이 unit test는 통과하지만 fresh session에서 single-entry로 PR까지 end-to-end dogfood된 적이 없음. 사용자가 "**처음 의도대로**(설계대로 아님)"이라 표현한 axis — *user-experienced intent ≠ unit-tested design* — 를 검증.

작고 격리된 실제 bug (PR #11 review L2: [stop-review-loop.test.js:194 env leak](../../plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js#L180-L199))를 dogfood subject로 채택해서 `/mccp:work "fix L2 test env leak"` 한 줄로 PR까지 흐르는 전체 chain을 observe + categorize + drift 흡수.

본 milestone의 산출물은 *fix 자체*가 아니라 *e2e observation report* — fix는 부산물.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Sub-plan markdown structure | [v0-3-1-mccp-work.plan.md](v0-3-1-mccp-work.plan.md) §Files/Tasks/Acceptance | YAML header + Summary + Patterns + Files + Tasks + Validation + Risks + Acceptance + Design Critique + Codex Adversarial Review |
| Test env save/restore | [pr-phase-lock.test.js](../../plugins/mccp/scripts/lib/tests/pr-phase-lock.test.js) `restoreEnv()` 패턴 (search for `process.env.<NAME>` save/restore in existing tests) | `const prev = process.env.X; try { ... } finally { if (prev === undefined) delete process.env.X; else process.env.X = prev; }` |
| Dogfood report structure | [.claude/PRPs/reports/v0-3-0-auto-handoff-report.md](../PRPs/reports/v0-3-0-auto-handoff-report.md) | Decision summary + per-gate verdict capture + drift list + recommendation |
| Loud fail-open observation | [feedback-loud-fail-open](C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/feedback-loud-fail-open.md) | 모든 hook의 stderr/systemMessage를 *signal*로 기록 (필터하지 않음) |
| MCCP_CODEX_DISABLED handling | [feedback-codex-permanent-bypass](C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/feedback-codex-permanent-bypass.md) + [feedback-codex-runner-disabled-blind](C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/feedback-codex-runner-disabled-blind.md) | Codex gate는 `verdict='skipped'` 단계에서 기록만 + `/mccp:pr`은 `MCCP_PR_SKIP_CODEX_REVIEW="<reason>"` 자동 적용 |
| Docs drift sync | [v0-2-6 housekeeping pattern](v0-2-6-housekeeping.plan.md) | 큰 변경 후 STATE/roadmap/CLAUDE.md 3축 동기화 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js` | UPDATE | PR #11 L2 fix — `MCCP_CODEX_DISABLED` save/restore wrapper. 영향 받는 test path(들)에 try/finally 적용. |
| `.claude/PRPs/reports/v0-3-3-intent-dogfood-report.md` | CREATE | E2E observation report — gate verdict 캡처, drift list, intent-gap finding |
| `.claude/state/STATE.md` | UPDATE | fingerprint `v0-2-8-task-2-6-1-followup` → `v0-3-3-intent-dogfood`, Goal/Plan/Done/Next 갱신 |
| `.claude/plans/mccp-roadmap.plan.md` | UPDATE | Status Snapshot에 v0.3.3 ship row 추가, Active 표에서 Milestone 5를 ✅ shipped로 갱신, Milestone 6 entry 추가, Acceptance에 M6 한 줄 |
| `CLAUDE.md` | UPDATE | §1.4 자동 게이트 layer 표의 S10b/S11/S12 status를 모두 ship으로 갱신 (현재 S11/S12가 미구현 표기) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `"version": "0.3.2"` → `"0.3.3"` |
| `.claude/plans/v0-3-3-intent-dogfood.plan.md` | UPDATE | (본 plan — implementation 시 status field만 갱신, content는 immutable) |

## Tasks

### Task 1: PR #11 L2 fix — `MCCP_CODEX_DISABLED` env-leak isolation

- **Action**: [stop-review-loop.test.js:180-199](../../plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js#L180-L199) "path 7: enforce + STOP_LOOP_CODEX=1 + critical → block + escalate" test에 env save/restore wrapper 적용. 같은 file의 다른 test도 grep으로 점검 — `MCCP_CODEX_DISABLED`를 명시적으로 set/unset해야 하는 다른 path가 있으면 동일 패턴 적용.
- **Mirror**: 같은 repo의 기존 lock 관련 test들이 사용하는 env save/restore 패턴 (`pr-phase-lock.test.js` 등) — `try { ... } finally { restore }`
- **Validate**:
  ```powershell
  # 1) bare shell — 영향 없어야 함
  node --test plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js
  # 2) MCCP_CODEX_DISABLED 오염된 shell — 그래도 13/13 PASS여야 함 (현재는 path 7만 FAIL)
  $env:MCCP_CODEX_DISABLED='1'; node --test plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js; Remove-Item env:MCCP_CODEX_DISABLED
  ```

### Task 2: Fresh-session `/mccp:work` dogfood pass

- **Action**: 새 Claude Code 세션을 시작(이전 컨텍스트 격리)하고 정확히 다음 한 줄을 입력:
  ```
  /mccp:work "fix stop-review-loop.test.js MCCP_CODEX_DISABLED env leak"
  ```
  - **PRECONDITION**: Task 1 fix는 *적용하지 말고* 새 세션에서 처음부터 진행 — orchestrator의 trivial 분류, plan 게이트 진입, implement 단계, commit, pr까지 *Claude가 자체적으로* 처리하도록 함.
  - **OBSERVE**: 각 phase 진입 시점의 (a) 현재 phase 이름, (b) 호출된 slash command, (c) gate verdict (codex_disabled로 skip되더라도 기록), (d) STATE.md 변경, (e) systemMessage/stderr emission, (f) 사용자 입력이 필요했던 시점 (있었다면)
  - **DO NOT INTERVENE**: 만약 chain이 멈추거나 잘못된 방향으로 가면 *그것이 finding* — 멈춘 위치 + 이유 기록 후 멈춰서 보고
- **Mirror**: 본 dogfood 자체가 새 패턴 — 기존 e2e fixture 없음. observation discipline은 [feedback-loud-fail-open](C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/feedback-loud-fail-open.md) 원칙
- **Validate**: subjective — Task 3의 report가 ≥1 intent-gap finding을 담아야 함. finding 0건이면 dogfood가 약했다는 신호 (혹은 chain이 진짜로 완벽 — 둘 중 어느 쪽인지 report에서 변호)

### Task 3: Observation report 작성

- **Action**: `.claude/PRPs/reports/v0-3-3-intent-dogfood-report.md` 생성. 다음 구조:
  ```markdown
  # Report: v0.3.3 Intent-Driven E2E Dogfood
  ## Dogfood subject
  ## Chain timeline (phase × verdict × emission)
  ## Findings
  ### intent-gap (CRITICAL — user-facing 의도 위반)
  ### friction (HIGH — 의도는 맞으나 user effort 과다)
  ### drift (MEDIUM — docs/STATE/code 비정합)
  ### noise (LOW — false-positive emission, cosmetic)
  ## Drift absorbed in this milestone
  ## Deferred to v0.3.4 / v0.4.0 backlog
  ## Codex-disabled handling assessment
  ```
- **Mirror**: [v0-3-0-auto-handoff-report.md](../PRPs/reports/v0-3-0-auto-handoff-report.md) 구조 + audit-trail 톤
- **Validate**:
  ```powershell
  Test-Path .claude/PRPs/reports/v0-3-3-intent-dogfood-report.md
  Select-String -Path .claude/PRPs/reports/v0-3-3-intent-dogfood-report.md -Pattern '^### (intent-gap|friction|drift|noise)' | Measure-Object | Select-Object -ExpandProperty Count
  # 기대: ≥4 (4개 categorization heading 모두 존재)
  ```

### Task 4: Drift 흡수 — STATE.md + roadmap + CLAUDE.md

- **Action**: Task 3 report의 `## Drift absorbed in this milestone` 섹션에 listed된 항목을 실제로 sync.
  - **STATE.md**: fingerprint를 `v0-3-3-intent-dogfood`로, Goal/Done/Next를 v0.3.3 컨텍스트로 갱신. (본 plan 작성 시점에 이미 partial — Task 4에서 dogfood 결과 반영 추가 sync)
  - **roadmap**: Milestone 5 (v0.3.2)를 ✅ shipped로 갱신 (현재 🚧 in-progress 표기), Milestone 6 (v0.3.3) entry 추가 (본 plan 작성 시 이미 추가됨 — Task 4에서 ship row로 승격)
  - **CLAUDE.md §1.4 자동 게이트 layer 표**: S10b/S11/S12 status가 "S10b ship / S11 미구현 / S12 미구현"으로 stale. 실제 ship 상태로 갱신.
- **Mirror**: [v0-2-6 housekeeping](v0-2-6-housekeeping.plan.md) 의 3축 동기 패턴
- **Validate**:
  ```powershell
  # STATE.md fingerprint 일치
  Select-String -Path .claude/state/STATE.md -Pattern '^task_fingerprint: v0-3-3-intent-dogfood' -Quiet
  # roadmap M6 entry 존재
  Select-String -Path .claude/plans/mccp-roadmap.plan.md -Pattern '\*\*Milestone 6\*\* \| v0.3.3' -Quiet
  # CLAUDE.md S11/S12 status 갱신
  Select-String -Path CLAUDE.md -Pattern 'S11 ship|S12 ship' | Measure-Object | Select-Object -ExpandProperty Count
  # 기대: ≥2
  ```

## Validation

```powershell
# 1) L2 fix verification (env-clean + env-polluted)
node --test plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js
$env:MCCP_CODEX_DISABLED='1'; node --test plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js; Remove-Item env:MCCP_CODEX_DISABLED

# 2) Full repo test suite — regression 없음 확인
node --test plugins/mccp/scripts/**/tests/*.test.js

# 3) Report + drift sync 존재 확인
Test-Path .claude/PRPs/reports/v0-3-3-intent-dogfood-report.md
Select-String -Path .claude/state/STATE.md -Pattern '^task_fingerprint: v0-3-3-intent-dogfood' -Quiet
Select-String -Path .claude/plans/mccp-roadmap.plan.md -Pattern '\*\*Milestone 6\*\* \| v0.3.3' -Quiet

# 4) plugin.json bump
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"  # 기대: 0.3.3
```

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `MCCP_CODEX_DISABLED=1` shell에서 Codex 게이트 short-circuit이 chain을 false-green으로 흘려보냄 | Medium | Medium | Task 3 report `## Codex-disabled handling assessment` 섹션에서 each gate의 verdict + reason 명시 캡처. `verdict='skipped'`도 valid signal로 기록. user-facing intent("Codex 없어도 chain은 user에게 진행 상황 공개해야 함")가 honored인지 검증. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| Trivial path (`/mccp:prp-commit` 직행)가 자동 분기로 선택되어 full chain dogfood가 안 됨 | Medium | High | dogfood subject (L2 fix)는 `.test.js` 파일 변경 — extension whitelist `{md,txt,json,yaml,yml}` 위반이므로 보수적 default로 full chain. Trivial 분기되면 그 자체가 work-orchestrator 결함 finding. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| E2E 발견 항목이 너무 많아 v0.3.3 scope 폭주 | Medium | Medium | Report는 *categorize만*, fix는 v0.3.4/v0.4.0으로 분리. 본 milestone은 *관찰 + drift 흡수* 두 가지만. categorization 4분류 (intent-gap/friction/drift/noise) 중 *drift만* 이번에 흡수. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| Dogfood 도중 chain이 멈추거나 사용자 입력을 요구함 → milestone scope 외 hand-fixing 발생 | Medium | High | 멈춘 위치는 *finding으로 기록*하고 milestone scope 외 fix는 v0.3.4로 defer. 본 milestone은 "관찰" — 멈춤 자체가 가치 있는 데이터. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| Task 1 fix를 dogfood 전에 미리 적용하면 dogfood subject가 사라짐 | Low | High | Task 순서를 명시: Task 2(dogfood)가 Task 1(fix) *앞에* 와야 함. dogfood가 chain의 일부로 fix를 적용하게 해야 의미 있음. **Task 1은 dogfood가 stuck했을 때의 fallback** — 정상 진행 시 chain이 자체 적용. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| `MCCP_PR_SKIP_CODEX_REVIEW` reason validator(SCHEMA REJECT, 1-token banlist, <30자, <3단어)가 dogfood 도중 reject되어 chain 차단 | Low | Medium | [feedback-codex-runner-disabled-blind](C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/feedback-codex-runner-disabled-blind.md)에 따라 본 milestone에서 사용할 표준 reason: `"v0.3.3 dogfood — MCCP_CODEX_DISABLED permanent bypass per user memory feedback-codex-permanent-bypass"` (≥30자, ≥3단어, banlist 회피) |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->

## Acceptance

- [ ] Task 1 적용 — `MCCP_CODEX_DISABLED=1` shell에서도 `stop-review-loop.test.js` 전체 PASS
- [ ] Task 2 dogfood pass 완료 — fresh-session에서 `/mccp:work` 단일 입력으로 PR 생성까지 도달 (멈춰도 멈춘 위치는 report에 기록)
- [ ] Task 3 report 작성 — 4개 categorization heading (intent-gap/friction/drift/noise) 모두 존재, ≥1 intent-gap 또는 friction finding (없으면 dogfood 강도 변호 문단 필수)
- [ ] Task 4 drift 흡수 — STATE.md fingerprint = `v0-3-3-intent-dogfood`, roadmap M5 = ✅ shipped + M6 = ✅ shipped row, CLAUDE.md §1.4 표의 S10b/S11/S12 모두 ship 상태
- [ ] `plugin.json` version = `0.3.3`
- [ ] Full repo test suite PASS (regression 없음)
- [ ] v0.3.3 PR 본문에 `## Intent Validation Report` 섹션 inject (Task 3 report의 요약본)
- [ ] PR-Codex 게이트: `MCCP_CODEX_DISABLED=1` 환경에서 `verdict='skipped'` + reason 기록 (advisory mode receipt write 또는 `MCCP_PR_SKIP_CODEX_REVIEW` 자동 적용, 둘 중 하나 — 결정은 chain orchestrator에 위임)

---

## Design Critique

> impeccable unavailable, skipped (auto-fallback): skill-missing

(impeccable Skill 미등록 — plan-codex는 lenient gate이므로 `meta.impeccable_skipped=true` warning으로 처리. 본 plan은 process/dogfood plan으로 UI/디자인 surface 없음 — `design_signal=false`도 일치.)

## Codex Adversarial Review

> Codex unavailable, skipped (auto-fallback): user-permanent-bypass

- **호출**: 미수행 — `MCCP_CODEX_DISABLED=1` 영구 설정 (사용자 memory [feedback-codex-permanent-bypass](C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/feedback-codex-permanent-bypass.md))
- **이유**: `codex-bridge.parseCodexResult`가 `verdict='unavailable'`로 short-circuit. `MCCP_RECEIPT_GATE_MODE=off`로 receipt 게이트 미강제. R1 (default cap=1) 진행 불가 — 기록만 남김.
- **합치 결론**: n/a (라운드 0)
- **YAGNI Triage**: n/a
- **Open Questions**: 본 milestone의 self-referential 특성 — *e2e dogfood plan을 dogfood 없이 plan하는 것* — 자체가 한계. dogfood 결과가 본 plan의 task 분배를 invalidate할 수 있음. mitigation: Task 3 report가 본 plan의 task 자체에 대한 retro도 포함 (`## Plan retro: did the 4 tasks capture what dogfood actually needed?`).
- **Codex session 참조**: 없음
