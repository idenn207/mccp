# Plan: v1.3.0 디자인 게이트 — Mechanical Enforcement + 재발 방지

**Worktree**: `.worktrees/v1.3.0-prd-status-roll/` (branch `chore/v1.3.0-prd-status-roll`)
**Source**: 사용자 free-form 요구 (PRD 없음). v1.3.0 cycle close 후 회고에서 디자인 검사 누락 가설 검증.
**Complexity**: Medium-Large (4 enforcement axis + dogfood 검증. 단일 milestone 권장 X — M1~M4 분할).

## Summary

v1.3.0 dashboard surface(M3 STATUS.md/status.html)가 "기능적으로는 작동"하지만 디자인 게이트가 한 번도 trigger되지 않은 **3겹 silent failure**가 receipt + plan 산출물로 확정됐다. 이 plan은 (1) silent skip을 receipt에 노출(Axis D), (2) 디자인 생성 단계에서 `frontend-design-direction` SKILL을 강제 first-step 로드(Axis A), (3) impeccable critique → fail-시 재생성 루프(Axis B), (4) 출력 제약 4개 mechanical lint(Axis C), (5) 다음 디자인-touching milestone에서 실제 trigger 회귀 확인(검증 dogfood)을 묶는다.

## 원인분석 — receipt 기반 검증 (사용자 요구: "내 말 신뢰 전에 검증")

### Smoking gun

| Source | Field/Pattern | Value | 의미 |
|---|---|---|---|
| `mccp-plan-codex/v1-3-0-observability-m1-derive-engine.json` | `meta.impeccable_skipped` | `false` | "skip 안 했다" 주장 |
| `mccp-plan-codex/v1-3-0-observability-m2-briefing-stamp.json` | 동일 | `false` / `null` | 동일 |
| `mccp-implement-codex/v1-3-0-observability-m2-briefing-stamp.json` | 동일 | `false` / `null` | 동일 |
| `mccp-pr-codex/v1-3-0-observability-m2-briefing-stamp.json` | 동일 | `false` / `null` | 동일 |
| `.claude/plans/v1-3-0-*.plan.md` | `## Design Critique` 섹션 | **0건** | impeccable critique 실제로 미수행 |
| `.claude/plans/v1-3-0-*.plan.md` 존재 | — | **M1/M6 둘뿐** | M0/M2/M3/M4/M5는 sub-plan 산출물 부재 |

### 3겹 원인

1. **Detector blind spot — `.js`/`.ts` 미인식**
   `plugins/mccp/scripts/lib/impeccable-detect.js:33` `UI_EXTENSIONS = ['.tsx','.jsx','.vue','.svelte','.astro','.css','.scss','.html']`. v1.3.0 M3는 HTML/CSS를 **생성**하는 generator 코드(`plugins/mccp/scripts/lib/renderer/*.js`)를 변경 — generator 자체는 `.js`라 `findDesignSignalInDiff` / `findDesignSignalInArtifact`의 file-extension 매칭에서 0건 hit.

2. **Artifact gap — sub-plan 부재**
   M0/M2~M5는 milestone 단위 sub-plan 본문 없이 PRD 본문 fold + 인라인 작업으로 진행. `findDesignSignalInArtifact(planPath)`가 호출돼도 본문 부재 → keyword(`## Design Direction`) 미매치 → signal 0.

3. **Silent skip의 unobservability — receipt가 거짓말**
   `plan.md Phase 5.0` decision tree: `SKILL_AVAIL=1 SIGNAL=0` 경로는 *"Sub-step skip silently — plan declares no design surface"*. receipt는 `impeccable_skipped=false`로 기록 (왜냐하면 skip 신호를 forward할 export 라인이 없음). **skip 자체가 receipt에 흔적이 없어** 운영자가 알 길이 없다.

이 3겹 layered failure가 *단일 환경 변수로 못 막히는* 이유 — `MCCP_IMPECCABLE_SKILL=available`로 강제해도 detector가 `design_signal=false`라 Skill 호출 자체를 만들지 않음.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Hook detection | `plugins/mccp/scripts/lib/impeccable-detect.js:36-44` (`hasUiExtension`, `isDesignPlanPath`) | extension + path-pattern 매칭. 확장 시 동일 함수 시그니처 유지. |
| Skill 호출 decision tree | `plugins/mccp/commands/plan.md:355-366` (Phase 5.0) | `SKILL_AVAIL × SIGNAL` 2D 매트릭스. 새 silent-surface field는 receipt-write CLI에 `--impeccable-silent-skip` 등으로 forward. |
| Receipt meta 신규 필드 | `plugins/mccp/scripts/receipt/cli.js` + `schema.js` | 기존 `meta.impeccable_skipped`/`meta.impeccable_skip_reason` 쌍 패턴. additive only — schema_version bump 없이 추가. |
| Loud fail-open 로깅 | `plugins/mccp/scripts/state/state-writer.js:93-95` | `process.stderr.write('[mccp:impeccable] silent-skip reason=no-signal ...')` prefix. |
| SKILL first-step 강제 inject | `plugins/mccp/commands/plan-prd.md:181-185` | `## Design Direction` 자동 inject 패턴. plan.md/prp-implement.md에 mirror. |
| Output constraint lint | `plugins/mccp/scripts/lib/renderer/verdict.js` (11-step priority chain) | deterministic rule chain — 같은 스타일로 4 출력 제약을 priority chain으로 정렬. |
| Dogfood test fixture | `plugins/mccp/scripts/derive/tests/*.test.js` + `tests/v1-3-0-baseline.test.js` (M0) | node:test + fixture skeleton. receipt 4개 + plan body fixture로 silent-skip 회귀 케이스 추가. |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/impeccable-detect.js` | UPDATE | (1) `DESIGN_SURFACE_PATHS` 화이트리스트 7개(`scripts/lib/renderer/`, `scripts/lib/briefing/`, `scripts/derive/`, `scripts/hooks/render-trigger-session-start.js`, `scripts/receipt/write.js`, `.claude/cache/STATUS.md`, `.claude/cache/status.html`) — Codex F3 absorption. (2) `findDesignSignalInDiff`와 `findDesignSignalInArtifact` **양쪽**에 path-prefix 매칭 — Codex F1 absorption. (3) `detect()` return에 `silent_skip: bool` + `silent_skip_reason: str` 추가. |
| `plugins/mccp/scripts/receipt/cli.js` | UPDATE | `--impeccable-silent-skip` + `--impeccable-silent-skip-reason` 플래그 추가. |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | `meta` block에 `impeccable_silent_skip: bool` + `impeccable_silent_skip_reason: str|null` 2개 신규 필드 추가 (additive — schema_version 유지). |
| `plugins/mccp/scripts/receipt/validate-cmd.js` | UPDATE | M1 Task 5 (Codex F2 absorption): strict-gate(`mccp-implement-codex`, `mccp-pr-codex`)에 `meta.impeccable_silent_skip=true` → blocking 처리. `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` audited escape 동일 적용. |
| `plugins/mccp/commands/plan.md` | UPDATE | (1) Phase 5.0 decision tree의 `SKILL_AVAIL=1 SIGNAL=0` 경로 — silent skip 대신 receipt forward (`--impeccable-silent-skip --impeccable-silent-skip-reason "no-signal"`). (2) Phase 1 ANALYZE 단계에 frontend-design-direction SKILL **first-step load** 명시 (디자인 surface 변경 plan일 때). (3) 출력 제약 4개를 Phase 4 WRITE 본문 규칙으로 inject. |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | Phase 2.5.5 decision tree에 동일 silent-skip surface 패치. 산출물이 design surface path 화이트리스트에 hit하면 SKILL first-step `view` 강제. |
| `plugins/mccp/commands/pr.md` | UPDATE | Phase 1.6 decision tree에 silent-skip surface 동일 패치. |
| `plugins/mccp/commands/plan-prd.md` | UPDATE | Phase 5 (impeccable) decision tree에 silent-skip surface 동일 패치. |
| `plugins/mccp/skills/frontend-design-direction/SKILL.md` | UPDATE | "출력 제약 4개" 섹션 추가 — (a) 정보 위계 3단계 (primary action → status → detail), (b) 강조색 화면당 1개, (c) markdown 아닌 실제 HTML/컴포넌트(MD0xx 노출 금지), (d) 한 화면 항목 수 상한 (Open Questions 상위 3개 + 나머지 접기). 기존 ECC salvage 본문은 보존. |
| `plugins/mccp/scripts/lib/renderer/output-constraints.js` (NEW) | CREATE | M3 dashboard renderer 출력 제약 lint. 4개 rule deterministic priority chain. fail-open invariant (lint 실패가 render 차단하지 않음 — stderr warn). |
| `plugins/mccp/scripts/lib/renderer/index.js` | UPDATE | 산출 직후 `output-constraints.js` 호출. 위반 시 `meta.design_constraint_violations` 필드를 derive에 surface. |
| `plugins/mccp/scripts/lib/tests/impeccable-detect-design-surface.test.js` (NEW) | CREATE | 회귀 fixture: (1) `.js` 파일이 design surface whitelist에 있을 때 signal=true, (2) silent skip이 receipt에 surface, (3) Skill 호출 path 정확성. |
| `plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js` (NEW) | CREATE | 출력 제약 4 rule 각각 + 위반 시 violation surface 검증. |
| `.claude/plans/v1-3-0-design-gate-mechanical-enforcement.plan.md` | CREATE | (이 파일) |
| `CLAUDE.md` | UPDATE | §3.5+ 신규 절: "디자인 surface 변경 시 SKILL first-step + impeccable critique loop". 출력 제약 4개 명시. |

## Tasks

### M1 — Silent-skip surface + detector 확장 + validator semantics (Codex R1 F1+F2+F3 absorption: M1을 self-sufficient wedge로 확장)

> **Codex R1 absorption note**: 원안에서 Task 4(detector 확장)는 M2로 분리했지만, R1이 (a) plan-mode detection이 `findDesignSignalInArtifact` 경로라 Task 4가 거기에도 적용 안 되면 M1 ship 후에도 SIGNAL=0 가능 (HIGH F1), (b) silent_skip 필드를 surface해도 validator가 *strict gate에서 blocking으로* 처리 안 하면 M1이 approving fail-open window 생성 (HIGH F2), (c) whitelist가 `derive/`, `hooks/render-trigger-session-start.js`, `receipt/write.js`를 누락 (MEDIUM F3) 지적. 세 finding 모두 ACCEPT_NOW — M1에 **detector 양방향 확장 + validator extension + whitelist 확장**을 bundle해 wedge를 self-sufficient하게 함. M2 scope에는 SKILL first-step 강제 + critique loop만 남김.

#### Task 1: Receipt schema에 silent-skip 2 필드 추가
- **Action**: `schema.js` `meta` block에 `impeccable_silent_skip: bool` + `impeccable_silent_skip_reason: string|null` 추가. additive — schema_version 유지. `cli.js`에 `--impeccable-silent-skip` + `--impeccable-silent-skip-reason` 플래그 + write path forward.
- **Mirror**: 기존 `impeccable_skipped` / `impeccable_skip_reason` 쌍 패턴.
- **Validate**: `node plugins/mccp/scripts/receipt/cli.js write --gate mccp-plan-codex --decision test --plan test.md --impeccable-silent-skip --impeccable-silent-skip-reason "no-signal" --quiet`가 valid receipt 작성 + 두 필드 stamped.

#### Task 2: impeccable-detect에 silent-skip surface
- **Action**: `detect()` return에 `silent_skip: bool` + `silent_skip_reason: str|null` 추가. SKILL_AVAIL=1 + SIGNAL=0 조합일 때 `silent_skip=true, silent_skip_reason='no-signal'`.
- **Mirror**: 기존 `reason` enum (ok/skill-missing/no-signal/mode-mismatch/path-traversal).
- **Validate**: `node plugins/mccp/scripts/lib/impeccable-detect.js detect --mode plan --plan <empty-body-plan> --json | jq '.silent_skip'` → `true`.

#### Task 3: 4 command 본문에 silent-skip forward 패치
- **Action**: `plan.md` / `prp-implement.md` / `pr.md` / `plan-prd.md` 의 impeccable decision tree에서 silent-skip 경로일 때 receipt-write에 `--impeccable-silent-skip` forward. stderr loud warn 추가 (`[mccp:impeccable] silent-skip reason=no-signal · design surface declared 안 됨`).
- **Mirror**: `plan.md:362` `--impeccable-skipped --impeccable-skip-reason` forward 패턴.
- **Validate**: 빈 plan body로 `/mccp:plan` 실행 후 mccp-plan-codex receipt에 `impeccable_silent_skip=true` 확인.

#### Task 4: Design surface path 화이트리스트 — **두 detection 경로 모두** 적용 (Codex F1+F3 absorption)
- **Action**: `impeccable-detect.js`에 `DESIGN_SURFACE_PATHS` 신설 + Codex F3 확장:
  ```js
  const DESIGN_SURFACE_PATHS = [
    'plugins/mccp/scripts/lib/renderer/',
    'plugins/mccp/scripts/lib/briefing/',
    'plugins/mccp/scripts/derive/',
    'plugins/mccp/scripts/hooks/render-trigger-session-start.js',
    'plugins/mccp/scripts/receipt/write.js',
    '.claude/cache/STATUS.md',
    '.claude/cache/status.html',
  ];
  function hasDesignSurfacePath(filePath) { ... }
  ```
- **Codex F1 absorption**: 새 `hasDesignSurfacePath`를 `findDesignSignalInDiff` AND `findDesignSignalInArtifact` 양쪽에 모두 적용. 후자의 경우 plan body의 `## Files to Change` 표 셀(`` `path` `` backtick)을 정규식으로 추출해 path-prefix 매칭. 단순 `.tsx|.jsx|.vue|...` extension regex와 OR로 결합.
- **Mirror**: `hasUiExtension` 함수 시그니처 + `findDesignSignalInArtifact:124` fileTableMatches regex pattern.
- **Validate**:
  - Fixture A (diff mode): `M3 renderer 파일 (`plugins/mccp/scripts/lib/renderer/index.js`) staged` → `design_signal=true`
  - Fixture B (plan mode, F1 회귀): plan body `## Files to Change` 표에 `plugins/mccp/scripts/lib/renderer/index.js` 명시 → `findDesignSignalInArtifact` 가 path 추출 → `design_signal=true`
  - Fixture C (overshoot 안전 마진): `plugins/mccp/scripts/state/state-writer.js` 변경 → `design_signal=false` (whitelist 부재)
  - Fixture D (cache target diff): `.claude/cache/STATUS.md` 변경 → `design_signal=true` (Codex F3)

#### Task 5: validate-cmd에 silent-skip informational warning + audited-escape mutex guard (Codex F2 부분 absorption — strict-gate blocking은 M2로 deferred)
- **재검토 결과 (code-review absorption)**: 원안의 strict-gate blocking은 backend-only plan(`design_signal=false` + `skill_available=true`)에서도 fire — 즉 비-UI cycle 전체(v1.0.1/v1.1.0/v1.2.0 등)가 /mccp:pr에서 차단됨. silent_skip=true는 detector가 "design surface intended 안 함" 과 "design surface missed"를 구분 못 한다는 한계의 표면일 뿐, blocking 의도와 곧바로 연결되지 않음. 추가로 `impeccable_silent_skip + impeccable_force_override` schema mutex 때문에 audited escape path(`MCCP_FORCE_PR_WITHOUT_IMPECCABLE`)가 schema reject로 봉쇄됨 (receipt write 자체 실패, 회복 경로 없음).
- **Action**:
  - `plugins/mccp/scripts/receipt/validate-cmd.js` — `impeccable_silent_skip=true`는 strict/lenient 무관하게 `warnings[]`만 push. blocking 분기 제거. M2에서 SKILL first-step + critique loop가 wired된 후 strict-gate 승격 재평가.
  - 4 command body (`plan.md` / `prp-implement.md` / `pr.md` / `plan-prd.md`) 의 silent_skip forward 분기에 `[ -z "${IMPECCABLE_FORCE_OVERRIDE_REASON:-}" ]` guard 추가. force-override path 활성 시 silent_skip flag suppress해 schema mutex와 충돌 방지.
  - `finalize-receipt.js` defense-in-depth — `impeccable-silent-skip` 도 `impeccable-force-override(-reason)` 동시 set이면 suppress.
  - `plan.md` + `prp-implement.md` WRITE 블록의 `eval` 패턴을 bash array(`WRITE_FLAGS=(...)`)로 교체 — `pr.md`와 정합화 + quoting 안전성 확보 (M1 cleanup, code-review M1 finding).
- **Mirror**: `impeccable_force_override`의 audit warning 경로 (`validate-cmd.js` 의 force-override check) — silent_skip도 동일한 warning surface.
- **Validate**:
  - Fixture A: silent_skip receipt → `validate-cmd --command mccp:prp-implement` exit 0 + `warnings[].kind='impeccable_silent_skip'` (M1 informational)
  - Fixture B: backend-only plan (state-writer.js 만 변경) → silent_skip=true → validate-cmd warnings only, NOT blocking (false-positive 회귀 차단)
  - Fixture C: `IMPECCABLE_FORCE_OVERRIDE_REASON` set + silent_skip detection → receipt에 silent_skip flag 미stamp, force_override flag만 stamp → schema accept → /mccp:pr 통과 (audited escape 회복 경로)
  - Fixture D: silent_skip 미설정 (정상 critique) → 기존 동작 회귀 0

**M1 ship 후 (재절충 반영) — silent failure가 receipt에 surface (M2가 audit artifact로 활용) + detector가 양방향 경로(artifact + diff)에서 design surface 인식 + validator는 informational warning만 emit. strict-gate blocking은 M2 SKILL first-step + critique loop 위에 안전하게 얹음. backend-only cycle 회귀 0.**

---

### M2 — SKILL first-step 강제 + critique loop (Axis A + B 잔여)

#### Task 6: plan/prp-implement Phase 1 ANALYZE에 SKILL first-step `view` 강제
- **Action**: design surface 변경 plan일 때 Phase 1 진입 즉시 `Read("plugins/mccp/skills/frontend-design-direction/SKILL.md")` 강제 + Phase 4 WRITE 본문 규칙에 4개 출력 제약 inject.
- **Mirror**: 기존 Phase 5.0 inject 패턴.
- **Validate**: design surface touching plan 작성 시 plan body에 `Skill loaded: frontend-design-direction (first-step)` 흔적 + 4 출력 제약 mention.

#### Task 7: impeccable critique → fail 시 재생성 루프
- **Action**: plan.md Phase 5.0가 `Skill(impeccable, "critique")` 결과를 받아 fail (critique severity ∈ {HIGH, CRITICAL}) 시 plan body 재생성 sub-task (max 2회 bounded retry, `MCCP_DESIGN_CRITIQUE_MAX_RETRY=2` env).
- **Mirror**: `MCCP_GATE_ROUND_CAP=1|2|3` (v0.2.9 YAGNI gate) bounded retry.
- **Validate**: 의도적으로 위계 무너진 plan body 생성 → critique fail → 재생성 trigger → 통과 또는 cap 도달 시 `Open Questions: DIVERGENT_UNRESOLVED` 명시.

**M2 ship 후 — design surface 변경 시 SKILL 자동 로드 + critique이 game-the-system 못 하게 retry loop로 boxed.**

---

### M3 — 출력 제약 mechanical lint (Axis C)

#### Task 7: `output-constraints.js` 4 rule deterministic chain
- **Action**: `plugins/mccp/scripts/lib/renderer/output-constraints.js` 신규 — (a) 정보 위계 3단계 (heading depth ≤ 3 in primary surface), (b) 강조색 화면당 1개 (HTML accent color 클래스 use count ≤ 1), (c) markdown raw 렌더 금지 (`**MEDIUM**` 등 unrendered marker 검출), (d) 한 화면 항목 수 상한 (Open Questions 섹션 ≤ 3 + collapse marker).
- **Mirror**: `verdict.js`의 11-step priority chain — deterministic, fail-open.
- **Validate**: `node plugins/mccp/scripts/derive/cli.js render` 산출 `.claude/cache/status.html`에 4 rule pass.

#### Task 8: renderer에 lint 통합 + violation surface
- **Action**: `renderer/index.js`가 render 직후 `runOutputConstraints(out)` 호출, violation 시 `meta.design_constraint_violations: ['rule_b_multi_accent', ...]` 배열을 derive model에 surface. fail-open — render 차단 X.
- **Mirror**: derive `degraded` flag (`F3 loud-fail-open`).
- **Validate**: M3 renderer 산출 `.html`이 lint 통과 + violation 강제 주입 fixture에서 `design_constraint_violations` 비어있지 않음.

---

### M4 — Workflow guidance + 검증 dogfood (Axis E + 사용자 요구 "실제 적용 시 디자인 검증")

#### Task 9: Proactive ↔ Default workflow guidance를 plan.md/prp-implement.md prompt에 명시
- **Action**: design surface plan일 때 Phase 1 ANALYZE에 "탐색 단계 = Proactive (대안 레이아웃 ≥2 제안)" 명시. Phase 2 GROUND 진입 즉시 "구현 단계 = Default" 전환 명시.
- **Mirror**: 기존 `Phase Map` 표 + `Forbidden during Phase 5` 패턴.
- **Validate**: dogfood — 다음 design-touching milestone(예: v1.3.0 후속 housekeeping 또는 v1.4.x patch) plan 작성 시 Phase 1에 ≥2개 대안 레이아웃 surface.

#### Task 10: CLAUDE.md §3 신규 절 — "디자인 surface 변경 시 SKILL first-step + impeccable critique loop"
- **Action**: §3.5 직후에 §3.9 추가. 4 출력 제약 + Proactive/Default workflow + `DESIGN_SURFACE_PATHS` 화이트리스트 + env 토글 (`MCCP_DESIGN_CRITIQUE_MAX_RETRY`, `MCCP_DESIGN_CONSTRAINTS_ENFORCE`).
- **Mirror**: §3.7 (plugin.json bump), §3.8 (worktree 컨벤션) — 룰 + 왜 + 언제 어떻게 + hot-fix 절차.
- **Validate**: CLAUDE.md grep으로 §3.9 신설 확인 + 4 출력 제약 명시.

#### Task 11: 검증 dogfood — silent-skip 회귀 + 새 detector + critique loop end-to-end
- **Action**: `tests/v1-3-0-design-gate-dogfood.test.js` 신규.
  - Fixture A: 빈 plan body → silent_skip=true → receipt surface
  - Fixture B: M3 renderer touch (`plugins/mccp/scripts/lib/renderer/index.js`) diff → design_signal=true → SKILL 호출 강제
  - Fixture C: fail critique → 재생성 retry → 통과
  - Fixture D: 출력 제약 위반 plan body → constraint violations surface
- **Mirror**: `derive/tests/run-integration.test.js` (M1 dogfood fixture 패턴).
- **Validate**: `node --test plugins/mccp/scripts/**/*.test.js` 4 fixture 모두 pass + 회귀 0.

#### Task 12: 실제 디자인 검증 dogfood — 다음 milestone에서 trigger 확인
- **Action**: 다음 design-touching milestone (예: v1.3.0 STATUS.md UX 개선 또는 v1.4.x dashboard hotfix) 진입 시 receipt 직접 확인 — `impeccable_silent_skip=false` + `impeccable_skipped=false` + `## Design Critique` 본문 존재.
- **Mirror**: v1.3.0 cycle의 retrospective audit 패턴.
- **Validate**: post-M4 첫 design-touching cycle close 후 receipt 4건 (plan/implement/pr-codex + code-reviewer) 모두 surface 정상.

## Validation

```bash
# M1 — Silent-skip surface
node plugins/mccp/scripts/receipt/cli.js write \
  --gate mccp-plan-codex --decision test --plan /tmp/empty.md \
  --impeccable-silent-skip --impeccable-silent-skip-reason no-signal --quiet
node plugins/mccp/scripts/receipt/cli.js validate --command mccp:prp-implement

# M2 — Detector + SKILL first-step
node plugins/mccp/scripts/lib/impeccable-detect.js detect \
  --mode implement --json | jq '.design_signal, .signal_files'

# M3 — Output constraints
node plugins/mccp/scripts/derive/cli.js render
grep -c 'design_constraint_violations' .claude/cache/STATUS.md

# M4 — Dogfood end-to-end
node --test plugins/mccp/scripts/lib/tests/impeccable-detect-design-surface.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js
node --test tests/v1-3-0-design-gate-dogfood.test.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Detector overshoot — `.js` 전부를 design surface로 보면 모든 mccp 작업이 critique trigger → cost 폭주 + 노이즈 | HIGH (Task 4 잘못 짜면) | path whitelist만, extension 무차별 포함 금지. Task 4의 `DESIGN_SURFACE_PATHS`는 명시적 prefix만. test fixture로 negative case (`scripts/state/*.js`) 회귀. |
| Output constraint lint false-positive — 기존 산출물에 rule violation이 이미 존재 → M3 ship 즉시 violation 폭주 | MEDIUM | Task 8: fail-open invariant — lint 위반이 render 차단하지 않음. violation은 `meta.design_constraint_violations` array surface만, downstream gate가 *blocking으로 잡지 않음* (advisory level). |
| Retry loop infinite — critique fail → 재생성 → 또 fail | MEDIUM | Task 6: bounded retry (default 2회) + cap 도달 시 `DIVERGENT_UNRESOLVED` 명시. `MCCP_DESIGN_CRITIQUE_MAX_RETRY=0`로 kill switch. |
| Schema additive 변경에도 기존 receipt validate가 깨지는 silent regression | LOW | Task 1: additive only, schema_version 유지. fixture로 legacy receipt (silent_skip 필드 없음) validate pass 확인. |
| silent_skip strict-gate blocking이 backend-only plan에서도 fire → 비-UI cycle 전체 /mccp:pr에서 차단 | HIGH (재검토에서 확정) | M1 ship 단계에서 strict-gate blocking 분기를 informational warning으로 downgrade (code-review absorption). M2에서 SKILL first-step + critique loop wire 후 detector에 design-suspect discriminator 도입 또는 강제 SKILL 호출 후에만 strict-gate 승격. |
| `impeccable_silent_skip + impeccable_force_override` schema mutex가 audited escape 봉쇄 → 회복 경로 없음 | HIGH (재검토에서 확정) | 4 command body + finalize-receipt.js에서 `IMPECCABLE_FORCE_OVERRIDE_REASON` 활성 시 silent_skip flag suppress. defense-in-depth로 helper가 한 번 더 차단. |
| SKILL first-step 강제(M2)가 design surface 아닌 plan에도 trigger → 무관한 plan에 노이즈 inject | MEDIUM | M2 Task: `design_signal=true` 일 때만 강제. detector의 surface_path 매칭에 hang on — Task 4 정확성에 dependent. |
| v1.3.0-prd-status-roll worktree branch가 `chore/...` 라 milestone PR 머지에 적절한지 모호 | LOW | M1만 본 worktree에 squash, M2~M4는 별도 branch로 분리해 cycle 분할. user 확인 필요. |

## Acceptance

- [ ] M1 (Codex F1+F2+F3 absorbed): (a) receipt 4 gate 모두 `impeccable_silent_skip`/`impeccable_silent_skip_reason` 필드 surface, (b) 빈 plan body fixture에서 `silent_skip=true` 회귀 test pass, (c) `findDesignSignalInArtifact` plan-mode 회귀 fixture pass (F1), (d) `validate-cmd`가 strict-gate에서 `impeccable_silent_skip=true`를 blocking으로 처리 (F2), (e) whitelist 7 path 모두 detect (F3)
- [ ] M2: design surface plan에서 `Skill loaded: frontend-design-direction (first-step)` 흔적 + critique fail 시 retry loop trigger
- [ ] M3: `output-constraints.js` 4 rule pass + `.claude/cache/status.html` lint 통과 + violation surface 정확성 (현재 critique에서 발견한 P1 4건 모두 lint hit해야 함)
- [ ] M4: CLAUDE.md §3.9 신설 + dogfood fixture 4개 pass + 다음 milestone에서 실제 design critique 본문 surface 확인
- [ ] 회귀 0: 기존 derive/renderer/receipt test (~150+ cases) 모두 pass
- [ ] `plugin.json` minor bump (예: 1.6.0 → 1.7.0) — M1~M4 통합 ship 시점에만 (각 milestone별 patch bump 별도 결정)

## Open Questions

다음 결정은 사용자 confirmation 필요 (Phase 4 WRITE 직후, Phase 5 게이트 진입 전):

1. **Milestone 분할 수용 여부** — 단일 PR로 M1~M4 일괄 ship vs M1만 본 worktree squash + M2~M4를 후속 cycle로 분리. 본 plan 권장은 **분리** (M1이 가장 mechanical wedge + 즉시 v1.3.0 retrospective audit 가능; M2~M4는 검증 dependency 크기).
2. **Detector overshoot 안전 마진** — `DESIGN_SURFACE_PATHS` 초기 set. **Codex R1 F3 absorption 반영 후 7개**: `scripts/lib/renderer/`, `scripts/lib/briefing/`, `scripts/derive/`, `scripts/hooks/render-trigger-session-start.js`, `scripts/receipt/write.js`, `.claude/cache/STATUS.md`, `.claude/cache/status.html`. status.html lifecycle 전체(producer + trigger + cache target)를 보호. Risk 표의 "detector overshoot" 항목은 Fixture C(`scripts/state/state-writer.js` 변경 → signal=false)로 회귀 차단.
3. **출력 제약 enforcement 강도** — fail-open advisory only (권장, M3 Task 8) vs blocking gate. fail-open이면 violation이 존재해도 ship 가능 — 운영자가 dashboard에서 trend로 확인. blocking이면 violation 0건이 ship 조건 → 초기 false-positive 폭주 위험.
4. **Worktree 적합성** — `chore/v1.3.0-prd-status-roll`은 STATE.md roll housekeeping용이었음. design-gate enforcement는 별도 branch (`v1-3-0-design-gate-m1-silent-skip` 등)로 빼는 게 squash hygiene 측면에서 더 깨끗. 사용자가 "여기서 해도 될 것 같다"고 했으나 PR scope mixing은 reviewer 부담 — 권장: **새 branch로 분리**.

---

## Design Critique

> Target resolution: detector가 plan body 안의 `.claude/cache/status.html` 언급(reference)을 design_signal로 잡았다. 본 plan은 backend/mechanical wiring 문서지만, plan의 Task 7~8(출력 제약 lint)이 정확히 status.html에 적용될 룰이므로 critique 대상을 worktree의 `.claude/cache/status.html` (v1.3.0 M3 산출물, 24KB) 로 routing. detector overshoot risk를 본 plan이 자기 자신에서 발현한 메타 사례.

**Verdict**: status.html이 PRODUCT.md의 명시적 anti-references(side-stripe, em-dash)를 여러 곳에서 위반. v1.3.0 cycle의 silent design-gate skip이 이걸 통과시킨 직접 결과. 본 plan의 Task 7~8 lint rule baseline에 그대로 매핑.

### Heuristics (status.html 산출물, n/a 제외)

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3/4 | data-stale + 60s threshold 정합. |
| 2 | Match Real World | 4/4 | 한국어 PM voice 텔레그래픽 정합. |
| 3 | User Control | 1/4 | checkbox disabled, OQ filter/dismiss 0. |
| 4 | Consistency | 3/4 | OKLCH 토큰 일관. 다만 side-stripe pattern이 4곳에서 일관되게 잘못. |
| 5 | Error Prevention | n/a | read-only surface. |
| 6 | Recognition | 4/4 | severity = color + icon + text 이중. 색맹 안전. |
| 7 | Flexibility | 1/4 | keyboard shortcut 0, OQ filter 0. |
| 8 | Aesthetic/Minimalist | 2/4 | side-stripe 노이즈 + OQ 7개 wall이 "Calm · Compact" 침해. |
| 9 | Error Recovery | n/a | read-only. |
| 10 | Help/Docs | 2/4 | footer 1줄. cell detail 진입 약속 미구현. |
| **Total** | | **20/32** | PRODUCT.md 목표 28+ 미달 |

### Anti-Patterns Verdict

**LLM**: PRODUCT.md anti-ref 3종 중 "SaaS hero-metric"을 부분 답습. Status grid 4-cell이 big-number+small-label 미니어처 패턴. tabular-nums + 1.65rem이라 full hero-metric까진 안 갔지만 decorative side-stripe 5건이 카드 노이즈로 SaaS 톤 발화.

**Detector (detect.mjs)**:
- 5× side-tab accent border (line 152/325/326/327/328): `border-left: 3px solid var(--accent|sev-*)`. impeccable Absolute ban "Side-stripe borders. Never intentional." 직접 위반. PRODUCT.md "Calm" 모순.
- 1× overused-font (Inter, line 70): 한국어 primary인데 Inter first fallback, Pretendard 두 번째. saturated AI-default.
- 1× em-dash overuse (12회): PRODUCT.md M4 absorption "no em dash" 직접 위반.

### Priority Issues

#### [P1] Side-stripe accent border 5건 (Absolute ban + "Calm" voice 위반)
- **Why**: AI-generated UI의 가장 인식 가능한 tell. anti-ref "SaaS hero-metric" lane 강화, 사용자 emotional goal *안도감*에 역행.
- **Fix**: `.verdict / .open-questions[data-sev] / .risks tbody tr[data-tone] / .worker-fanout tbody tr.s-*` 전부 (a) `border-left` 제거 + 이미 정의된 `--sev-*-bg` background tint만 유지, 또는 (b) leading severity-pill로 시각 코드 이동.
- **Task 매핑**: 본 plan Task 7 `output-constraints.js` rule (a) 정보 위계 3단계에 `side_stripe_count > 0 → violation` 추가. Task 8 violation surface에 `side_stripe_border_count` field 추가.

#### [P1] Em-dash 12회 (PRODUCT.md "no em dash" 직접 위반)
- **Why**: v1.3.0-m4 absorption commit이 "no em dash" 룰을 명시했는데 renderer가 그걸 어김. 룰 인지 안 한 증거.
- **Fix**: renderer에서 `—` → `·` 또는 ` / ` 일괄 교체. raw em-dash 검출 unit test 추가.
- **Task 매핑**: Task 7 rule (c) "markdown raw 렌더 금지"를 확장해 `em_dash_count > 2 → violation`.

#### [P2] Open Questions 7개 모두 visible (plan 출력 제약 #4 직접 위반)
- **Why**: plan 자체가 명시한 "상위 3개 + 나머지 접기"를 v1.3.0 dashboard가 어김. cognitive load 2/8 fail (chunking + minimal choices) — moderate level. PRODUCT.md "60초 안에 4축 식별" success metric 침해.
- **Fix**: `sections/open-questions.js`가 severity desc 정렬 후 top-3만 expanded, 나머지 `<details><summary>+N more</summary>...</details>` collapse.
- **Task 매핑**: Task 7 rule (d) "Open Questions visible ≤3 + collapse marker" mechanical lint. 본 plan body 자체도 이 룰 적용 필요 (현재 OQ 4개 visible — 본 critique을 1개 추가하면 5개).

#### [P2] Inter font first-fallback (한국어 primary 모순)
- **Why**: 한국어 primary 프로젝트인데 Inter가 첫 fallback, Pretendard 두 번째. saturated AI-default.
- **Fix**: line 70 font-family 순서 swap → Pretendard first. 또는 Inter 제거.
- **Task 매핑**: Task 7 rule (e) "non-Korean primary font when register=ko"로 추가 검토.

#### [P3] Keyboard accelerator 부재 (Persona Alex)
- **Why**: PM 일일 dashboard인데 keyboard nav 0. 사용자가 power user 본인.
- **Fix**: 본 plan scope 외. v1.4.x 후속 axis로 backlog.

### Persona Red Flags

**Alex (Power User · PM 본인)**: Open Questions 7개 wall로 60초 안에 4축 식별 어렵다. Keyboard navigation absent.
**Sam (Accessibility)**: `:focus-visible` style 미정의 — keyboard tab 시 focus indicator invisible. WCAG 2.4.7 fail 위험. role/aria-label/contrast 이중 표기는 적절.

### Minor Observations

- `.audit-timeline > li code`가 accent + bg tint으로 link/inline-code 시각 충돌 가능. 의도면 OK.
- `--shadow-1` dark mode에서 거의 invisible. 의도된 mute라면 OK.
- Footer `· v1.3.0-m3 renderer` version 노출은 약간 engineer-voice. audit trail 의도면 OK.

### Plan body 자체에 대한 추가 발견 (메타 critique)

- 본 plan body의 `## Open Questions` 섹션이 **4개 visible** — 본 plan Task 7 rule (d) (≤3 + collapse) 룰을 *plan body 자체*에 적용하면 위반. dogfood 시 Task 7이 plan body도 검사 대상에 포함하면 self-consistency 확보.
- 본 plan body의 `## Files to Change` 표가 14 row로 길지만 grouping(M1/M2/M3/M4)이 ## Tasks에만 있고 Files 표에는 없음 — 위계 가독성 약함. minor.

### Questions to Consider

- Side-stripe 제거 시 severity 코드는 background tint만으로 충분? — `--sev-*-bg` 토큰 정의돼 있어 답: 충분. icon+pill+bg 3중 코드라 side-stripe redundant.
- OQ ≤3 + collapse의 기본값이 expanded vs collapsed? — PRODUCT.md "Quiet by default" → 3개 expanded + 나머지 collapsed default.
- 본 critique의 4개 P1/P2 finding을 본 plan(Task 7~8)이 lint로 잡지 못하면 Task 자체가 미흡. lint rule을 critique finding 1:1 매핑 권장.

### Trend
First run for this target, no trend yet.

---

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.2.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2 · `--impeccable-available` flag 적용 · classification=ok · durationMs 324s)
- 라운드 수: 1 (cap=1, 모든 ACCEPT_NOW finding이 R1 absorption으로 plan body에 fully resolved → R2 trigger 조건 미충족)
- 합치 결론: needs-attention → R1 absorption 후 ship-ready. Codex 핵심 지적 3개 모두 M1 scope 확장으로 흡수.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1: Plan-mode detector blind spot (`findDesignSignalInArtifact` extension-only) | HIGH (0.91) | ACCEPT_NOW | M1 wedge가 자기 자신을 못 막는 4번째 layer. Task 4를 `findDesignSignalInDiff`와 `findDesignSignalInArtifact` 양쪽에 적용 + M2에서 M1으로 이동. |
  | F2: M1-only approving silent-skip window (validator semantics 부재) | HIGH (0.86) | ACCEPT_NOW | silent_skip을 receipt에 surface만 하고 validator가 무시하면 wedge가 wedge가 아님. M1에 Task 5(validate-cmd 확장) 추가 — strict-gate에서 `impeccable_silent_skip=true`를 blocking으로. |
  | F3: Whitelist misses cache-producing pipeline (`derive/`, `hooks/render-trigger-session-start.js`, `receipt/write.js`) | MEDIUM (0.78) | ACCEPT_NOW | 합리적 확장. status.html lifecycle 전체(producer + trigger + cache target) 보호. 7 path로 확장 + Fixture C로 overshoot 회귀 차단. |
- Deferred to backlog: 0 → `.claude/plans/codex-findings-backlog.md` 미증가
- Open Questions: 4건 (plan body 본문 참조) — auto-CRITICAL catalog 6종(secret/data-loss/migration/auth/external-dest/crypto) hit 0
- Codex session 참조: threadId `019ee2dd-04c6-7c23-8847-3d0e5d4d2b23`

### R1 absorption note

세 finding 모두 *plan body 수정으로 fully resolve*되었으므로 R2 escalate 조건(`MCCP_GATE_ROUND_CAP=1` cap + 미해소 ACCEPT_NOW HIGH/CRITICAL 잔존)을 충족하지 않음. M1 scope가 Task 1-3에서 Task 1-5로 확장됐고, M2 scope에서 Task 4가 빠짐 (이미 M1으로 이동). M3/M4는 task 번호 7-12 그대로 유지(원안 task 번호 충돌 없음).

---

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.

- Scope: M1 only (Tasks 1-5, user-confirmed 2026-06-20). Files to Change (M1 subset) ⊆ plan Files to Change ✓.
- Codex 호출 skip 사유: Phase 2.5.1 dedupe (Plan-Codex R1 absorption이 implement-time decision을 모두 사전 픽스 — 새 abstraction/external dep/concurrency 0건).


