# Plan: v1.3.0 Milestone 6 — Generic Interface Validation

**Source PRD**: [.claude/prds/v1-3-0-observability-surface-ii.prd.md](../prds/v1-3-0-observability-surface-ii.prd.md)
**Selected Milestone**: M6 (Generic interface 검증 — mccp 외 repo `.claude/` graceful fallback + reference impl dogfood)
**Complexity**: Small

## Summary

v1.3.0 cycle의 마지막 milestone. M0~M5에서 derive engine + snapshot writer + STATUS.md/HTML renderer + refresh trigger + privacy guard surface가 *mccp repo dogfood 1개*에서만 검증된 채 ship됐다. M6는 **새 기능을 추가하지 않고** (1) mccp 외 repo에서 derive/render/snapshot이 정말 graceful한지 audit + 3가지 fixture로 smoke 검증하고, (2) M6 발견된 fallback 누락을 mechanical patch로 닫고, (3) "어떤 source가 optional이며 어떤 fallback이 보장되는가" generic-interface contract을 본문화한다. cycle close 후 다른 repo에 mccp가 installed될 때의 reference impl 보장이 deliverable.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `plugins/mccp/scripts/derive/sources/*.js` | source 모듈은 `scan<Source>(repoRoot, opts)` → `{ ok, count, items, invalid_count, degraded, error }` shape |
| Errors | `plugins/mccp/scripts/derive/index.js:46-67` | `!fs.existsSync(.claude)` short-circuit + `opts.strict` low warning. throw 금지 (per [[feedback-loud-fail-open]]) |
| Tests | `plugins/mccp/scripts/derive/tests/envelope-absent.test.js`, `mccp-fixture.test.js` | tmpdir + `helpers.tmpRepo` + Node `node:test` runner. fixture는 minimum `.claude/` subset 만 생성 |
| Docs | `docs/v1.3.0-observability/schema-surface.md`, `dashboard-surface.md`, `snapshot-schema.md` | `docs/v1.3.0-observability/` 하위 markdown 1 파일 = 1 surface. PRD ↔ code 매핑 cross-link |
| Plugin bump | `CLAUDE.md §3.7` | minor (1.5.0 → 1.6.0) — milestone ship. branch 이름의 `-m6` suffix는 plugin.json에 안 들어감 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/derive/tests/generic-interface.test.js` | CREATE | 3 fixture × derive smoke (empty / minimal-state-only / non-mccp-gate-names) |
| `plugins/mccp/scripts/lib/snapshot/tests/snapshot-generic.test.js` | CREATE | 외부 cwd에서 snapshot writer가 throw 없이 동작 + retention/skew/idempotence 유지 검증 |
| `plugins/mccp/scripts/lib/renderer/tests/renderer-generic.test.js` | CREATE | 3 fixture × renderStatus → 6-section 출력 + verdict 결정 + envelope hide 그대로 동작 |
| `docs/v1.3.0-observability/generic-interface.md` | CREATE | "어떤 source는 optional, 어떤 fallback이 보장되는가" contract. PRD M6 outcome 본문화 |
| `docs/v1.3.0-observability/schema-surface.md` | UPDATE | §9 추가 — generic-interface.md cross-link |
| `plugins/mccp/scripts/derive/sources/*.js` (필요 시) | UPDATE | Task 0 audit에서 발견된 fallback 누락 mechanical 패치 (예상 0~3 파일) |
| `plugins/mccp/scripts/lib/renderer/sections/*.js` (필요 시) | UPDATE | gate_id가 mccp-* 외 값일 때 display label fallback (예상 0~1 파일) |
| `.claude/prds/v1-3-0-observability-surface-ii.prd.md` | UPDATE | M6 row Status `pending → in-progress` + Plan 셀에 이 plan 경로. PR merge 시 `complete`로 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.5.0 → 1.6.0` minor bump (CLAUDE.md §3.7 mandatory) |
| `CHANGELOG.md` | UPDATE | v1.6.0 row 추가 — M6 generic-interface validation ship |

## Tasks

### Task 0: Audit evidence matrix — semantic assumption 5 axis (Codex R1 F2 absorption)

> **Note**: 본 task는 grep one-pass가 아니라 5 axis × 3 column deterministic matrix이다. *audit evidence 자체는 skip 불가* — Task 4 patch만 조건부.

- **Action**: 다음 5 axis에 대해 각각 (a) fixture assertion으로 cover, (b) documented non-generic contract으로 inverse declare, (c) required patch 중 정확히 하나로 매핑한다. 결과 matrix는 `.claude/plans/notes/v1-3-0-m6-audit.md`에 저장.

  | # | Axis | 조사 대상 | 결정 column 후보 |
  |---|---|---|---|
  | 1 | **Source path shape** | `derive/sources/*.js`가 가정하는 `.claude/<subdir>/...` 경로 hardcoded layout (예: `state/dispatches`, `plans/*.plan.md`, `receipts/<gate>/<decision>.json`) | fixture assertion (Fixture C 가 검증) / contract (path shape는 mccp 표준) |
  | 2 | **Status / event enums** | `TERMINAL_STATUSES`(`['ok','failure','timeout','crashed']`), receipt `gate_id` 정형 패턴, STATE.md `VALID_EVENTS` (resume_dispatching/_dispatched 등) | fixture assertion (Fixture C/D 가 외부 enum 값 검증) / patch (renderer가 외부 enum도 graceful display) |
  | 3 | **STATE schema version** | `state-writer.js`가 가정하는 frontmatter `schema_version`, mccp 외 자동화가 다른 schema를 적었을 때 derive `sources/state.js` 동작 | fixture assertion (Fixture B 가 minimal schema 검증) / contract (mccp만 자체 schema 작성, 외부는 read-only graceful) |
  | 4 | **Snapshot identity fields** | `projectReceipt` 의 mccp-extension 필드 13개 (briefing_summary/_token_count/_invocation_count, codex_skipped_at_pr/_skip_reason/_dedupe_at_pr, ipc_envelope_path, dispatched_by_controller_session_id, worker_dispatch_id 등). 외부 receipt에 누락 시 null fallback 정상 작동 검증 | fixture assertion (Fixture C 검증) |
  | 5 | **Renderer source presence** | `renderStatus`의 verdict step priority chain (11 step) + section render 각각이 source missing/degraded일 때 graceful display | fixture assertion (Fixture A/B/C/D 모두 검증) / patch (가장 발견 가능성 높음 — gate_id 임의 string 표시, mccp-extension 필드 null 표시) |

- **Mirror**: `docs/v1.3.0-observability/schema-surface.md`의 §-numbered + table 패턴
- **Validate**: audit 노트 파일이 5 axis × {fixture link / contract declaration / patch file:line} mapping을 명시. *모든 axis가 결정 column 1개씩 채워져야 함*. patch column이 1개라도 있으면 Task 4 진행, 0개면 Task 4만 skip-with-rationale.

### Task 1: Fixture 4종 작성 — Generic interface smoke (Codex R1 F3+F4 absorption)

- **Action**: `plugins/mccp/scripts/derive/tests/generic-interface.test.js` 파일 안에 4 fixture를 helpers의 `tmpRepo` 패턴으로 생성:
  - **Fixture A — empty** (F4 absorption: 2-branch assertion):
    - (a) `derive(tmpRepo, { strict: true })` 호출 → `model.warnings`에 source `derive`, severity `low`, message가 `'no .claude/ directory at '`로 시작하는 entry 1건. `model.sources`는 `emptyModel`이 초기화한 zeroed defaults (각 source `count:0` 또는 `item:null`).
    - (b) default mode `derive(tmpRepo)` (strict 미지정) → warning 0건. sources zeroed defaults는 동일. m0_capability 응답 있음.
  - **Fixture B — minimal-state-only**: `.claude/state/STATE.md`에 mccp 외 자동화가 작성했을 법한 frontmatter(`schema_version: 'v1'`, `session_id: '<uuid>'` 만). receipts/plans/envelopes 디렉토리 없음. `derive` 결과: state source만 `item` 채워지고 나머지 source는 zeroed.
  - **Fixture C — non-mccp-gate-names**: `.claude/receipts/foo-gate/decision-1.json` + `.claude/receipts/bar-gate/decision-2.json`. receipt schema는 derive read-side 필드(`gate_id`, `decision_id`, `created_at`, `meta.command`)만 채우고 mccp-extension 필드(briefing_*, codex_*, ipc_envelope_path, dispatched_by_controller_session_id, worker_dispatch_id)는 전부 비움. assert: receipts source `ok:true, count:2`, projection의 mccp-extension 필드 모두 null fallback. snapshot/render 통과.
  - **Fixture D — degraded foreign repo** (F3 absorption): 다음 4 degradation을 동시에 포함:
    - (i) `.claude/receipts/baz-gate/broken.json` — malformed JSON (truncated `{ "gate_id": "baz-`)
    - (ii) `.claude/state/STATE.md` — unsupported frontmatter (`format_version: 99`, mccp가 모르는 schema)
    - (iii) `.claude/state/dispatches/invalid.envelope.json` — additionalProperties:false에 걸리는 unknown top-level key
    - (iv) (POSIX only) symlink receipt — `.claude/receipts/sym-gate/decision.json` 이 외부 path를 가리킴; Windows에서는 unreadable file으로 대체. assert: `derive` no throw, `sources.receipts.degraded:true`, `sources.envelopes.degraded:true`, warnings emit, symlink dereference로 외부 path 읽지 않음 (외부 path는 fixture가 미리 검증한 sentinel string을 가지고 있고 derive 결과에 그 sentinel이 들어가면 fail).

- **Mirror**: `envelope-absent.test.js` + `mccp-fixture.test.js`의 tmpRepo + writeJson + cleanup + symlink 처리는 `process.platform === 'win32'` 분기.
- **Validate**: `node --test plugins/mccp/scripts/derive/tests/generic-interface.test.js` 4 fixture 모두 derive 성공 + no throw + assertion 통과.

### Task 2: Snapshot writer generic smoke

- **Action**: `plugins/mccp/scripts/lib/snapshot/tests/snapshot-generic.test.js` — Fixture B/C에서 만든 model을 `writeSnapshotIfNeeded(model, { repoRoot: tmpRepo })`로 호출. Empty(receipts=0, envelopes=0)이면 `written:false, evicted:[]`. Non-empty receipts(mccp 외 gate)면 `written:true` + 파일 내용에 `briefing_*` null + `gate_id: 'foo-gate'` 그대로 projection.
- **Mirror**: `plugins/mccp/scripts/lib/snapshot/tests/snapshot.test.js`의 tmpdir + opts injection 패턴
- **Validate**: `node --test plugins/mccp/scripts/lib/snapshot/tests/snapshot-generic.test.js` 모든 path 통과.

### Task 3: Renderer generic smoke

- **Action**: `plugins/mccp/scripts/lib/renderer/tests/renderer-generic.test.js` — Fixture A → renderer가 verdict `"no .claude/ directory"` 또는 동급 graceful 문장 + STATUS.md 작성. Fixture B → STATE 1줄만 surface + 나머지 섹션 0 raw. Fixture C → audit-timeline에 mccp 외 gate_id가 그대로 표시 (display label fallback이 동작).
- **Mirror**: `plugins/mccp/scripts/lib/renderer/tests/integration.test.js`의 derive → render chain
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/renderer-generic.test.js` 모두 통과 + 출력 STATUS.md는 invariant(6 section header 존재, verdict 1줄) 유지.

### Task 4: 발견된 fallback 누락 mechanical patch (조건부 — F2 absorption)

- **Action**: Task 0 audit matrix의 "required patch" column이 ≥1 axis에서 채워진 경우에만 진행. 예상 패치: (a) renderer audit-timeline.js가 `gate_id` 값을 display할 때 mccp prefix가 없으면 raw label 그대로 표시, (b) verdict step priority chain에서 mccp-specific gate 이름 비교를 일반 string 비교로 대체, (c) snapshot projection의 mccp-extension 필드 null fallback이 빠진 곳 채우기. 모든 axis가 fixture assertion / contract column으로 결정됐다면 본 task만 `skip-with-rationale`로 closure — Task 0 audit evidence는 절대 skip되지 않는다.
- **Mirror**: 기존 `applySecretMask`/`applyPathMask`처럼 graceful default 패턴
- **Validate**: 패치 후 Task 1/2/3 재실행 → 통과 + Task 0 matrix의 patch column 가리키는 file:line이 새 fixture assertion으로 cover됨.

### Task 5: docs/v1.3.0-observability/generic-interface.md

- **Action**: 새 문서 작성. 4 섹션:
  - **§1 Optional sources** — `.claude/` 자체 또는 7 sources 각각이 없을 때 derive 동작 (Fixture A 결과 본문화).
  - **§2 mccp-extension fields** — `briefing_*`, `codex_*`, `ipc_envelope_path`, `dispatched_by_controller_session_id`, `worker_dispatch_id` 5 카테고리. 외부 repo에선 모두 null. snapshot/render 출력에 어떻게 graceful 표시되는지 line-by-line 예시.
  - **§3 Non-mccp gate names** — receipts의 `gate_id`가 임의 string일 때 derive + render 동작 (Fixture C 결과).
  - **§4 What is NOT generic** — mccp가 의도적으로 가정하는 contract (예: receipt JSON parseable, STATE.md UTF-8). 그 외 schema는 강제 안 함을 명시.
- **Mirror**: `docs/v1.3.0-observability/schema-surface.md`의 §-numbered + table 패턴
- **Validate**: 문서를 worktree 외 임의 mccp-installed empty repo 1곳에서 cross-read하여 contract 명확성 확인 (smoke — 사용자가 시각적 검토).

### Task 6: schema-surface.md cross-link + PRD M6 row + plugin.json + CHANGELOG

- **Action**:
  - `docs/v1.3.0-observability/schema-surface.md` §9 신설 — generic-interface.md cross-link 1줄.
  - `.claude/prds/v1-3-0-observability-surface-ii.prd.md` M6 row의 Status `pending → in-progress` + Plan 셀에 본 plan 경로. PR merge 시 자동 `complete` 전환 (M5 PR #41 패턴과 동일).
  - `plugins/mccp/.claude-plugin/plugin.json` version `1.5.0 → 1.6.0`.
  - `CHANGELOG.md` 새 row — v1.6.0 / 2026-06-19 / M6 generic-interface validation ship.
- **Mirror**: M5 PR #41 (d12e82d)의 동일 4-file 마무리 패턴
- **Validate**: `git diff --stat` 결과가 위 4 파일 + Task 1~5 산출물 외 없음.

### Task 7: Cycle close housekeeping

- **Action**: PR body 작성 시 v1.3.0 cycle 전체 (M0~M6) close 명시. 후속 worktree cleanup 권장 (`git worktree remove .worktrees/v1.3.0-observability-m6`)을 PR body Test plan 마지막 줄에 안내.
- **Mirror**: M5 report의 cycle close 톤
- **Validate**: PR body 본문에 "v1.3.0 cycle CLOSE" 문구 1회 + worktree cleanup 안내 1회 포함.

## Validation

```bash
# Worktree에서 실행 (cwd가 .worktrees/v1.3.0-observability-m6/이어야 함)
cd .worktrees/v1.3.0-observability-m6

# Generic interface 4 fixture smoke (Fixture A 2-branch + B + C + D)
node --test plugins/mccp/scripts/derive/tests/generic-interface.test.js
node --test plugins/mccp/scripts/lib/snapshot/tests/snapshot-generic.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/renderer-generic.test.js

# 회귀 — M1-M5 기존 테스트는 그대로 통과해야 함
node --test plugins/mccp/scripts/derive/tests/
node --test plugins/mccp/scripts/lib/renderer/tests/
node --test plugins/mccp/scripts/lib/snapshot/tests/

# F1 absorption — Installed-plugin end-to-end smoke (PRD outcome 검증)
# 1) Empty foreign repo: derive run + render + snapshot 전 chain
mkdir -p /tmp/mccp-m6-foreign-empty && cd /tmp/mccp-m6-foreign-empty
node ~/.claude/plugins/cache/mccp/mccp/1.6.0/scripts/derive/cli.js run --json   # exit 0 + warning 1건
node ~/.claude/plugins/cache/mccp/mccp/1.6.0/scripts/derive/cli.js render        # STATUS.md + status.html 생성, verdict graceful 1줄
ls .claude/cache/snapshots/ 2>/dev/null || echo "(no snapshots — empty repo expected)"

# 2) Non-mccp foreign repo with state + receipts (Fixture C 시뮬레이션)
mkdir -p /tmp/mccp-m6-foreign-mixed && cd /tmp/mccp-m6-foreign-mixed
mkdir -p .claude/state .claude/receipts/foo-gate
echo -e '---\nschema_version: v1\nsession_id: 00000000-0000-0000-0000-000000000000\n---\n' > .claude/state/STATE.md
echo '{"schema_version":"v1","gate_id":"foo-gate","decision_id":"d1","meta":{"created_at":"2026-06-19T00:00:00Z","command":"/test"}}' > .claude/receipts/foo-gate/d1.json
node ~/.claude/plugins/cache/mccp/mccp/1.6.0/scripts/derive/cli.js run --json   # exit 0, receipts.count=1, briefing_* null
node ~/.claude/plugins/cache/mccp/mccp/1.6.0/scripts/derive/cli.js render        # STATUS.md audit-timeline에 foo-gate raw label
test -s .claude/cache/STATUS.md && grep -q "foo-gate" .claude/cache/STATUS.md   # gate_id raw display

# 3) mccp-repo dogfood (reference impl 회귀)
cd /path/to/my-claude-code-plugin   # 또는 worktree main repo
node ~/.claude/plugins/cache/mccp/mccp/1.6.0/scripts/derive/cli.js run --json   # 기존 mccp 동작 그대로
node ~/.claude/plugins/cache/mccp/mccp/1.6.0/scripts/derive/cli.js render        # 6 section + worker fanout 정상

# plugin.json + CHANGELOG sanity
grep '"version": "1.6.0"' plugins/mccp/.claude-plugin/plugin.json
grep -E '^\| 1\.6\.0' CHANGELOG.md
```

> Installed-plugin smoke 3종(foreign-empty / foreign-mixed / mccp-dogfood)은 사용자가 수동 실행하는 acceptance gate. Task 1~3 unit fixture가 통과해도 이 3 smoke가 통과하지 않으면 M6 close 불가 (F1 absorption invariant).

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Task 0 audit가 비어있어 보이지만 사실 미세 hardcoded 가정 누락 — 외부 repo dogfood에서만 발견 | Medium | Task 1~3 smoke fixture 3종 + 사용자가 v1.4.x 첫 외부 repo install 때 빠른 회귀 확인 |
| Renderer audit-timeline이 mccp 외 gate_id를 raw label로 표시하면 UX 정보량 낮음 (verdict 1줄 영향) | Low | display label fallback은 graceful이 핵심이지 예쁨이 아님. impeccable Acceptable 톤 유지 (telegraphic) |
| Fixture C (non-mccp gate names) test가 mccp internal validator schema invariant와 충돌 | Low | receipt validator는 read-side에서 unknown gate_id 허용 (v1.2.0-m1 'unknown-field permissive' 가정). 충돌 시 receipt schema doc에 명시적으로 추가 |
| plugin.json bump을 잊어 cache directory가 1.5.0 stuck (CLAUDE.md §3.7 빈번한 누락 axis) | Medium | Task 6에 명시 + PR title에 v1.6.0 박음 + PR 제출 전 `git diff plugins/mccp/.claude-plugin/plugin.json` 확인 |
| v1.3.0 cycle close 후 v1.4.x cycle 진입 시 STATE.md drift (이 cycle도 chore roll PR 필요해질 가능성) | Medium | M6 PR merge 직후 STATE.md roll commit을 같은 cycle에 포함하거나 별도 chore PR 즉시 작성 (CLAUDE.md §3.7 hot-fix 절차) |
| scope creep — audit 중 발견된 fallback 누락이 단순 patch 이상의 design 변경 요구 | Low | Task 4 default는 mechanical patch만. design 변경 필요 시 별도 backlog axis로 defer (codex-findings-backlog.md 1줄) |

## Acceptance

- [ ] Task 0 audit evidence matrix가 `.claude/plans/notes/v1-3-0-m6-audit.md`에 5 axis 모두 결정 column 1개씩 매핑 완료 (F2 absorption)
- [ ] Task 1~3 generic smoke 4 fixture (A 2-branch + B + C + D) 모두 통과 (F3+F4 absorption)
- [ ] M1~M5 기존 테스트 회귀 0 (snapshot 12/12, audit-timeline-snapshot 7/7, sections 13/13, trigger 11/11, derive 34/34)
- [ ] Task 4 patches가 Task 0 matrix의 "required patch" column file:line을 모두 close (skip-with-rationale은 patch column 0개일 때만)
- [ ] **F1 absorption — installed-plugin end-to-end smoke 3종 통과**:
  - [ ] foreign-empty: derive run + render + snapshot graceful (no `.claude/` from outside)
  - [ ] foreign-mixed: non-mccp gate_id가 STATUS.md audit-timeline에 raw label로 표시 + briefing_* null fallback
  - [ ] mccp-repo dogfood: M3~M5 surface 회귀 없음 (reference impl 보장)
- [ ] `docs/v1.3.0-observability/generic-interface.md` 4 섹션 모두 작성됨 — §4 contract은 "degraded surface가 graceful의 일부"로 명시 (F3 absorption)
- [ ] `docs/v1.3.0-observability/schema-surface.md` §9 cross-link
- [ ] PRD M6 row Status in-progress + Plan 셀 본 plan 경로
- [ ] plugin.json 1.5.0 → 1.6.0 + CHANGELOG row 추가
- [ ] PR body에 "v1.3.0 cycle CLOSE" + worktree cleanup 안내
- [ ] Patterns mirrored, not reinvented (graceful fallback 패턴 + tmpRepo helper + docs/§ table 패턴)

## Codex Adversarial Review

- 호출: `node ${PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1
- 합치 결론: R1 verdict=needs-attention → 4 findings 모두 R1 absorption으로 plan body amend, ACCEPT_NOW × {HIGH, CRITICAL} 잔여 0 → R2 미발화
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 External validation = empty-repo CLI smoke만 (PRD outcome 'reference impl dogfood' 미증명) | HIGH | ACCEPT_NOW | Validation 섹션 + Acceptance에 installed-plugin end-to-end smoke (non-mccp repo derive→render→snapshot 전 chain) + mccp-repo dogfood 양축 명시. plan body §Validation, §Acceptance 재작성. |
  | F2 Task 0 grep-only audit이 semantic assumption(source path shape, status/event enums, STATE schema version, snapshot identity, renderer source presence)을 miss할 위험 | HIGH | ACCEPT_NOW | Task 0를 deterministic "audit evidence matrix"로 재구성. 5 axis × {fixture assertion / documented non-generic contract / required patch}. Task 4 skip 조건은 patch에 한정 — audit evidence는 강제 진행. |
  | F3 Fixture set이 malformed/degraded foreign `.claude` (invalid JSON, unsupported STATE frontmatter, symlink/unreadable receipts) 미커버 | MEDIUM | ACCEPT_NOW | Fixture D 추가 — degraded foreign repo. assert: no throw + 명시적 `degraded:true` surface + warning emit + 외부 path read 없음. generic-interface.md §4 "What is NOT generic"에서 parseability 제외 정책 제거, 대신 "degraded surface가 contract"로 재정의. |
  | F4 Fixture A assertion이 현재 derive `opts.strict` 게이트와 모순 (empty `.claude/` 없어도 default mode는 warning emit 안 함, sources는 zeroed default로 초기화) | MEDIUM | ACCEPT_NOW | Fixture A을 2-branch로 분리 — (a) `derive(tmpRepo, { strict: true })` 호출로 low warning 1건 assert, (b) default mode 호출로 zeroed source defaults + no warning assert. plan body §Task 1 재작성. |

- Deferred to backlog: 0 → `.claude/plans/codex-findings-backlog.md`
- Open Questions: 없음 (4 findings 모두 R1 absorption으로 plan body amend, 외부 dependency 없음, scope creep 0)
- Codex session 참조: threadId `019edeab-0ed9-76f1-8aec-331d151929f5`, classification=ok, durationMs=328904

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.

