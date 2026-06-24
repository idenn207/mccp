# Plan: mccp v0.3.6 — Codex/impeccable Scope Split + STATE.md Noise Elimination + derive-decision Slug Fix

**Source PRD**: `.claude/prds/v0-3-6-codex-scope-state-noise.prd.md`
**Selected Milestone**: 3축 묶음 (Milestones 1–3 of PRD `Delivery Milestones`)
**Complexity**: Medium

## Summary

v1.0 release 직전 mccp의 운영 신뢰도 3축 (Codex/impeccable reviewer scope 명확화, STATE.md content-hash skip, derive-decision branch normalize + plan-path fallback)을 단일 sprint로 묶어 implement. 각 축은 독립 implement + receipt + test 가능하며, PR은 sub-commit 분리 형태로 review 부담 분산. PRD가 진단한 축 3 hypothesis ("plan-path slug 추출 부재")는 **Phase 2 GROUND에서 부정확한 진단으로 판명** — 진짜 원인은 `decision.js:91`의 `slugFromBranch`가 dot/underscore를 normalize하지 않고 `SLUG_RE` 매치 실패 시 즉시 null 반환하는 것. plan에서 진단을 정정해 반영함.

## PRD-vs-Reality Diagnosis Correction (축 3)

| 항목 | PRD Hypothesis | 코드 검증 결과 |
|---|---|---|
| 트리거 조건 | `/mccp:pr` mode with plan-path arg | `BRANCH_BASED_COMMANDS.has('mccp:pr')` → plan-path arg 자체를 받지 않음 (`decision.js:23-28`) |
| Actual root cause | plan-path slug 추출 부재 | `slugFromBranch`가 dot/underscore normalize 부재 → `v0.3.6-...` branch에서 SLUG_RE 매치 실패 → `null` → 'default' |
| Fix scope (정정) | plan-path 인자 추출 | (a) branch normalize 추가 + (b) `mccp:pr` mode에 plan-path fallback (또는 implement-receipt fallback chain) |

이 정정은 v0.3.6 sprint 안에서 fix가 가능하며 PRD의 의도(자동 chain dedupe 발동)를 그대로 달성. plan 본문 task 분해는 정정된 진단을 따름.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming (migration) | `plugins/mccp/scripts/migrations/v0.2.6-impeccable-fields.js` | `vX.Y.Z-purpose.js` |
| Naming (receipt meta) | `state-writer.js:263` (`dep_check_at`, `dep_check_missing`) | snake_case + conditional emit when set |
| Errors | `codex-invoke.js:45-51` (`CodexInvokeError` with `reason` enum) | single class + enum-style classification |
| Tests | `plugins/mccp/scripts/receipt/tests/decision.test.js` | node --test, describe/it, fixture-driven |
| Atomic write | `state-writer.js:377-388` | tmp + renameSync |
| Field gating (receipt schema) | `state-writer.js:264-270` (escalate_pending) | conditional emit + invariant guard |
| Migration idempotence | `migrations/v0.2.4-security-fields.js` + `v0.2.8-generic-receipt-quarantine.js` | `--dry-run` 옵션 + marker 파일 |
| Wrapper short-circuit | `codex-invoke.js:141-151` (MCCP_CODEX_DISABLED first-class skip) | early return before resource acquisition |
| Branch normalize | `decision.js:91` (`branch.replace(BRANCH_PREFIX_RE, '').toLowerCase()`) | 동일 함수에 chain 추가 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/impeccable-detect.js` | UPDATE | Task 0 — user-level skill directory probe (`~/.claude/skills/impeccable`) 추가 |
| `plugins/mccp/scripts/lib/tests/impeccable-detect.test.js` | UPDATE | Task 0 — user-level probe tests |
| `plugins/mccp/scripts/lib/codex-invoke.js` | UPDATE | design-scope exclusion preamble + impeccable-aware focus prefix |
| `plugins/mccp/scripts/lib/codex-result-filter.js` | CREATE | output-level design-keyword filter, called by codex-runner / commands |
| `plugins/mccp/scripts/lib/tests/codex-invoke.test.js` | UPDATE | impeccable 가용/미가용 prompt branching tests |
| `plugins/mccp/scripts/lib/tests/codex-result-filter.test.js` | CREATE | keyword matching + finding stash + a11y routing tests |
| `plugins/mccp/scripts/state/state-writer.js` | UPDATE | `update()` 안에 content-hash compare → equal 시 disk write skip |
| `plugins/mccp/scripts/state/tests/state-writer.test.js` | UPDATE | content-equal skip, last_event change still writes, frontmatter normalize edge cases |
| `plugins/mccp/scripts/receipt/decision.js` | UPDATE | (a) `slugFromBranch` dot/underscore normalize, (b) `mccp:pr` mode에 plan-path / implement-receipt fallback chain |
| `plugins/mccp/scripts/receipt/tests/decision.test.js` | UPDATE | dot-branch normalize, plan-path fallback, implement-receipt fallback, generic default 회귀 |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | `meta.codex_design_scope_excluded`, `meta.design_findings_dropped`, `meta.a11y_routed_to_impeccable` validators |
| `plugins/mccp/scripts/receipt/write.js` (또는 cli.js write path) | UPDATE | 위 3 field auto-stamp logic |
| `plugins/mccp/scripts/migrations/v0.3.6-codex-scope-fields.js` | CREATE | receipt schema migration (idempotent + `--dry-run`) |
| `plugins/mccp/scripts/migrations/tests/v0.3.6-codex-scope-fields.test.js` | CREATE | migration tests |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `version: 0.3.5 → 0.3.6` |
| `CLAUDE.md` | UPDATE | §1.4 v0.3.6 ship row + §3.3 design-scope honor 추가 + §4 (필요 시) 새 토글 |
| `.claude/plans/mccp-roadmap.plan.md` | UPDATE | v0.3.6 entry thin-index 등록 |
| `.claude/state/STATE.md` | 자동 | hook이 sprint 진행 따라 갱신 (수동 편집 금지) |

## Tasks

### Task 0: impeccable-detect user-level skill directory probe — 축 1 prerequisite

- **Action**: `impeccable-detect.js::probeSkillAvailable`에 user-level skill directory probe 추가. 현재 함수는 `installed_plugins.json`만 조회하지만 (line 47-62 주석에 "if a future user-level skill directory becomes the canonical install target, extend probeKeys here." 명시 — 미구현 상태), `~/.claude/skills/impeccable` directory 존재 + `isDirectory()` 검사를 plugin-manifest 검사 직후 추가. env override (`MCCP_IMPECCABLE_SKILL=available|missing`)는 기존대로 가장 위 precedence 유지. marketplace skill directory (`~/.claude/plugins/marketplaces/*/skills/impeccable`)는 별도 — 본 task scope 외 (사용자가 user-level 명시 설치한 경우만 인식).
- **Mirror**: `impeccable-detect.js:49-62` (기존 plugin manifest probe), `codex-invoke.js:53-89` (`resolveCodexInstallPath` 의 disk existence + path resolution 패턴)
- **Why this is Task 0**: 축 1 (Codex prompt design-scope preamble + output filter)이 효과를 보려면 detection이 정확해야 함. user-level 설치 사용자(현재 본인 환경)에게 detection이 false-negative였던 점은 축 1 wire-up의 전제조건. v0.3.6 sprint kickoff 시점 plan/PRD의 "본 환경 impeccable 미설치" 가정이 detection bug에서 비롯됐음을 plan-time에 발견.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/impeccable-detect.test.js -- --filter "user-level skill"` — (1) `~/.claude/skills/impeccable` 존재 시 skill_available=true, (2) directory 없음 시 false, (3) plugin manifest + user-level 동시 존재 시 true (양쪽 OR), (4) env override가 모든 probe보다 우선

### Task 1: Codex prompt design-scope exclusion preamble — 축 1a

- **Action**: `codex-invoke.js::invokeAdversarialReview`에서 `env.MCCP_CODEX_DISABLED` 체크 직후, `opts.impeccableAvailable === true`이면 focus 문자열 앞에 `[design-domain exclusion preamble]` block을 prepend. preamble은 명시적으로 "다음 finding 카테고리는 emit하지 마세요: visual design, color, typography, micro-interaction, animation, spacing aesthetic, brand consistency. accessibility findings은 impeccable a11y-architect에 routing되므로 본 review 결과에 포함하지 마세요." 형태. CLI 진입점에 `--impeccable-available` flag 추가하여 caller가 전달.
- **Mirror**: `codex-invoke.js:141-151` (env-driven early decision branching), `codex-invoke.js:169-173` (focus argument assembly)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/codex-invoke.test.js -- --filter "design-scope preamble"` — impeccable=true 시 focus에 preamble 포함, impeccable=false 시 무변경, a11y instruction 명시 검증

### Task 2: Codex output-level design-keyword filter — 축 1b

- **Action**: 신규 `plugins/mccp/scripts/lib/codex-result-filter.js` 모듈 작성. exports: `filterDesignFindings(codexResultJson, { impeccableAvailable })`. impeccable 가용 시 finding[].category / finding[].text에서 design domain keyword 매칭 (case-insensitive, word-boundary): `visual design`, `\bcolor\b`, `\btypography\b`, `\bspacing\b`, `\banimation\b`, `\bmicro-interaction\b`, `\bbrand\b`. 매칭된 finding을 stash → 반환값 `{ filteredFindings: [...], droppedFindings: [...], a11yRoutedCount: N }`. a11y 관련 키워드 (`a11y`, `accessibility`, `wcag`, `aria`, `keyboard navigation`)는 별도 카운터로 분리해 routing. caller(codex-runner, commands/plan.md, prp-implement.md, pr.md)에서 filter 결과를 receipt meta로 stamp.
- **Mirror**: `codex-invoke.js:116-127` (`makeFail` style — explicit return shape), `codex-invoke.js:14-22` (classification enum comment style)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/codex-result-filter.test.js` — design finding drop count, a11y routing count, non-design finding pass-through, impeccable=false 시 no-op identity, malformed input graceful

### Task 3: Receipt schema 확장 (codex scope audit fields) — 축 1c

- **Action**: `plugins/mccp/scripts/receipt/schema.js`에 신규 meta fields 추가: `codex_design_scope_excluded: bool`, `design_findings_dropped: number (≥0)`, `a11y_routed_to_impeccable: bool`, `dropped_findings_digest: string?` (sha256 of joined finding texts, audit용). validator에서 새 field는 optional → backward-compat. write.js auto-stamp: codex-result-filter 결과에서 자동 derive해 receipt write 시 inject.
- **Mirror**: `state-writer.js:264-270` (`escalate_pending` conditional emit), `migrations/v0.2.6-impeccable-fields.js` (이전 schema 확장 패턴)
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/schema.test.js` (해당 테스트 파일이 없으면 신규 생성) — 신규 field 받아들임, 누락 시도 통과 (optional), bool/number 타입 검증

### Task 4: STATE.md content-hash skip on update() — 축 2

- **Action**: `state-writer.js::update`에서 readState → mergeState 직후, `existing`과 `merged`의 (a) body 전체 + (b) frontmatter에서 `updated_at`/`last_event_at`/`created_at` 제외한 모든 field를 normalized JSON 으로 stringify → sha256 비교. equal하면 writeStateAtomic skip + 함수가 `existing` 반환 (mtime 미변경). `last_event` 변경은 content 변경으로 간주 → write 정상 진행. CRLF/LF normalize는 기존 `normalizeLines` 활용.
- **Mirror**: `state-writer.js:436-443` (`update` 함수 구조 그대로 유지하되 writeStateAtomic 직전에 skip 결정 분기), `codex-invoke.js:141-151` (early-return 패턴)
- **Validate**: `node --test plugins/mccp/scripts/state/tests/state-writer.test.js` — (1) 동일 body + 동일 frontmatter (timestamp 제외) 시 mtime 미변경 + fs.writeFileSync 호출 0회, (2) `last_event` 변경 시 write 정상 동작, (3) body 변경 시 write 정상 동작, (4) `dep_check_*` 갱신 시 write 정상 동작

### Task 5: derive-decision branch normalize + plan-path fallback — 축 3

- **Action**: `decision.js`에 두 변경:
  1. `slugFromBranch`에 dot/underscore normalize 추가 — `branch.replace(BRANCH_PREFIX_RE, '').toLowerCase().replace(/[._]+/g, '-')` (예: `v0.3.6-codex-...` → `v0-3-6-codex-...`). SLUG_RE 매치 검증은 normalize 이후로 이동.
  2. `BRANCH_BASED_COMMANDS` (mccp:pr/prp-pr/code-review/review-pr) 모드에서 `slugFromBranch` null 반환 시 `opts.planPath` fallback → `slugFromPlanArg(commandArgs)` fallback → implement-receipt latest decision_id fallback (별도 helper) → 'default'. fallback chain 진입 시 stderr warn `[mccp:decision] branch slug invalid; fell back to <method>`.
- **Mirror**: `decision.js:81-96` (`slugFromBranch` 본체), `decision.js:98-127` (`deriveDecisionId` precedence chain)
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/decision.test.js` — (1) `v0.3.6-foo` branch → `v0-3-6-foo` slug, (2) `feat/bar_baz` branch → `bar-baz`, (3) `mccp:pr` mode + dot branch + plan-path arg → plan-path slug 우선, (4) `mccp:pr` mode + invalid branch + no plan-path + implement receipt 있음 → receipt slug, (5) 모든 fallback 실패 → 'default' + stderr warn

### Task 6: Receipt migration v0.3.6-codex-scope-fields — 축 1 cross-cut

- **Action**: 신규 `migrations/v0.3.6-codex-scope-fields.js` 작성. 기존 receipt들의 meta에 `codex_design_scope_excluded: false` (default), `design_findings_dropped: 0`, `a11y_routed_to_impeccable: false`를 backfill. idempotent — 이미 field가 있으면 skip. `--dry-run` 옵션 (v0.2.8-generic-receipt-quarantine.js 패턴). marker 파일 `.claude/receipts/.migrations/v0.3.6-codex-scope.json` 작성.
- **Mirror**: `migrations/v0.2.6-impeccable-fields.js` (마이그레이션 구조), `migrations/v0.2.8-generic-receipt-quarantine.js` (marker pattern + lock)
- **Validate**: `node migrations/v0.3.6-codex-scope-fields.js --dry-run` → activeReceipts 정상 detect, `node migrations/v0.3.6-codex-scope-fields.js` → marker complete state, 재실행 idempotent

### Task 7: CLAUDE.md + plugin.json + roadmap thin-index — cross-cut

- **Action**:
  - `plugin.json` version `0.3.5 → 0.3.6`
  - `CLAUDE.md §1.4` 자동 게이트 표에 v0.3.6 row 추가 — "Codex/impeccable scope split: codex-invoke.js preamble inject + codex-result-filter output drop + receipt meta audit. impeccable 가용 시 자동 발동, 미가용 시 no-op."
  - `CLAUDE.md §3.3` Codex classification 표는 변경 없음 (`disabled` row 유지). §3.4 design-scope honor 별도 short 절 추가 (선택)
  - `CLAUDE.md §4` 신규 토글 추가: `MCCP_CODEX_DESIGN_SCOPE_HONOR=0` (default 1) — kill switch for the design exclusion preamble + filter (디버그 용도)
  - `.claude/plans/mccp-roadmap.plan.md`에 v0.3.6 entry 등록 (thin-index 1줄)
- **Mirror**: 이전 milestone들의 STATE.md/CLAUDE.md ship 패턴 (v0.3.5 commit의 docs sync diff)
- **Validate**: `git diff CLAUDE.md plugin.json .claude/plans/mccp-roadmap.plan.md` 시각 검토

### Task 8: codex-runner / commands fanout — 축 1 wire-up

- **Action**: `codex-invoke` caller 3곳 (codex-runner, commands/plan.md Phase 5, commands/prp-implement.md Phase 2.5, commands/pr.md Phase 3.5)에서:
  1. impeccable-detect 결과 (`skill_available`)을 `--impeccable-available` flag로 codex-invoke에 전달
  2. codex 응답 받은 후 `codex-result-filter`로 design finding 필터링
  3. filter 결과를 receipt meta로 stamp
  - `pr.md` Phase 0.3 3-way mutex은 v0.3.5에서 이미 구현 — 변경 없음. Phase 3.5 review-only invariant 유지.
- **Mirror**: `pr.md` Phase 0.3 mutex 절 (v0.3.5에서 wire), `codex-invoke.js:14-22` 호출 컨벤션 주석
- **Validate**: end-to-end dogfood — `/mccp:work` chain을 시작해 plan-codex 게이트가 impeccable 가용/미가용 양 모드로 정상 동작하는지 확인. self-test로는 본 v0.3.6 sprint 자체가 dogfood subject (현재 환경은 impeccable 미가용 = no-op 경로)

## Validation

```bash
# 단위 test 일괄 실행 (Windows PowerShell)
node --test plugins/mccp/scripts/lib/tests/codex-invoke.test.js
node --test plugins/mccp/scripts/lib/tests/codex-result-filter.test.js
node --test plugins/mccp/scripts/state/tests/state-writer.test.js
node --test plugins/mccp/scripts/receipt/tests/decision.test.js
node --test plugins/mccp/scripts/receipt/tests/schema.test.js
node --test plugins/mccp/scripts/migrations/tests/v0.3.6-codex-scope-fields.test.js

# 전체 회귀 (full suite)
node --test plugins/mccp/scripts

# Migration dry-run + 실제 run + 재실행 idempotence
node plugins/mccp/scripts/migrations/v0.3.6-codex-scope-fields.js --dry-run
node plugins/mccp/scripts/migrations/v0.3.6-codex-scope-fields.js
node plugins/mccp/scripts/migrations/v0.3.6-codex-scope-fields.js  # 재실행 → no-op

# STATE.md noise validation (수동)
node -e "require('./plugins/mccp/scripts/state/state-writer').update(process.cwd(), { event: 'precompact' });" ; git status --porcelain .claude/state/STATE.md
# 첫 호출 후 1번째: clean (content unchanged면 mtime 미변경) ← Task 4 작동 검증

# derive-decision branch normalize 검증 (현재 sprint branch에서)
node plugins/mccp/scripts/receipt/cli.js derive-decision --command mccp:pr
# → 기대: v0-3-6-codex-scope-state-noise (이전: default)
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Codex가 design exclusion preamble 무시하고 발화 | M | Task 2 output filter가 backstop. receipt audit으로 noncompliance rate 추적. dogfood 후 keyword 리스트 tune. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| keyword filter false-positive로 valid finding drop | L | `dropped_findings_digest` (sha256 of joined texts) receipt에 stash → 사용자 audit. keyword를 word-boundary regex로 좁힘. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| content-hash가 의도된 frontmatter 갱신을 skip | M | hash 대상 명시 — `updated_at`/`last_event_at`/`created_at`만 제외, 나머지 frontmatter는 hash 포함. tests로 갱신 결정 fault matrix 보장. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| derive-decision normalize가 기존 valid slug에 의도치 않은 영향 | L | normalize는 dot/underscore만 → hyphen. 기존 valid slug (alphanumeric+hyphen)는 idempotent. tests로 회귀 보호. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| implement-receipt fallback이 stale slug 반환 | M | receipt mtime + decision_id 비교. 1시간 이상 stale이면 fallback skip + stderr warn (별도 spike — Task 5에 포함 가능 여부 plan-codex 게이트에서 확인). |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| receipt schema migration이 production receipt 손상 | L | `--dry-run` 필수 + marker 파일 + idempotent + 기존 v0.2.x 마이그레이션 패턴 mirror. backup 권장 (PR body에 명시). |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| 3축 묶음 commit이 review 부담 증가 | M | 축당 sub-commit 분리 (Task 1+2+3+6 → 축 1 commit, Task 4 → 축 2 commit, Task 5 → 축 3 commit, Task 7+8 → cross-cut commit). PR description에 sub-commit 매핑. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| v1.0 release 일정 지연 | M | 각 축이 독립 implement 가능 — 부분 ship 가능. 축 2(STATE.md noise)가 가장 cost-clear → v1.0 first 우선순위. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->

## Codex Implementation Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (source path, v0.3.5 first-class skip wrapper)
- 라운드 수: 0 (영구 bypass — wrapper short-circuit)
- 합치 결론: skipped (auto-fallback): codex_disabled
- Classification: `disabled` (`blocking=false`, `advisory=false`, `durationMs=0`)
- YAGNI Triage: n/a (Codex 미발화 — finding 0)
- Deferred to backlog: 0
- Open Questions: n/a
- Codex session 참조: n/a (skipped)

### Security Reviewer

> security-reviewer skipped — sprint scope (codex-invoke prompt builder, state-writer write API, derive-decision argument parsing) does not touch auth/crypto/secrets/input-validation/SQL/cmd-injection/SSRF/path-traversal/privilege-escalation surfaces. sha256 in Task 4 is content-hash compare only (no secret).

### Design Review

> impeccable available (user-level skill detected) + no design surface in implementation → silent skip per Phase 2.5.5b decision tree row 2.

**Update during implementation**: Task 0 fix (probeSkillAvailable user-level directory probe) corrected the initial false-negative. Detection now returns `skill_available=true, design_signal=false, reason=no-signal` instead of the prior `skill-missing`. Receipt stamps `impeccable_skipped=false` — PR step is NOT blocked by impeccable. Earlier plan body comment about `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` audited escape is moot for this sprint.

## Acceptance

- [ ] All 8 tasks complete
- [ ] Validation passes (full test suite + migration dry-run + 실제 run + idempotent 재실행)
- [ ] Patterns mirrored: snake_case meta field naming, conditional emit, atomic write, fail-closed wrapper short-circuit
- [ ] STATE.md gets clean `git status` after content-equal update (manual)
- [ ] derive-decision returns `v0-3-6-codex-scope-state-noise` on current sprint branch (manual)
- [ ] receipt schema accepts new fields (test) + migration idempotent
- [ ] Codex result design-keyword filter drops design finding + stash digest (test)
- [ ] CLAUDE.md / plugin.json / roadmap thin-index updated
- [ ] 3-axis commits prepared (축 1 / 축 2 / 축 3 / cross-cut) for sub-commit PR
- [ ] PRD `Delivery Milestones` row 1–3 status: pending → in-progress (현재 plan path 기록)

## Design Critique

> impeccable unavailable, skipped (auto-fallback): skill-missing

plan body scope is backend/tooling (codex-invoke prompt builder, state-writer write API, derive-decision argument parsing). 축 (1) Codex/impeccable scope split이 design 영역의 *권한 경계*를 다루지만 design *작업 자체*가 아님. design surface signal=false. plan-codex 게이트는 lenient — `meta.impeccable_skipped=true`로 receipt에 warning 기록.

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (source path, v0.3.5 first-class skip wrapper)
- 라운드 수: 0 (영구 bypass — wrapper short-circuit)
- 합치 결론: skipped (auto-fallback): codex_disabled
- Classification: `disabled` (`blocking=false`, `advisory=false`, `durationMs=0`)
- Cache mismatch note: cache 경로 `~/.claude/plugins/cache/mccp/mccp/0.3.4/`가 v0.3.5 short-circuit 코드를 받기 전. command body 표준 호출 경로 (`CLAUDE_PLUGIN_ROOT`)가 cache를 가리키므로 v0.3.5 wrapper 효과 못 봄. **본 sprint에 별도 LOW finding으로 추가** — plugin cache invalidation gap.
- YAGNI Triage: n/a (Codex 미발화 — finding 0)
- Deferred to backlog: 0
- Open Questions: 
  - CACHE_GAP — plugin cache 0.3.4가 v0.3.5 wrapper 코드 미수신. user-side reload trigger 또는 cache invalidation mechanism 검토 필요. v0.3.6 sprint open question에 추가.
- Codex session 참조: n/a (skipped)
