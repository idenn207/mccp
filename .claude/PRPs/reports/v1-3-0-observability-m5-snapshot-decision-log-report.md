# Implementation Report: v1.3.0 Milestone 5 — Daily Snapshot + Decision Log

## Summary

M5 closes v1.3.0의 temporal gap. M4가 live `STATUS.md`/`status.html`을 ~5초 안에 sync 하는 surface라면, M5는 *어제와 그 이전*의 archive layer를 추가한다:

- `.claude/cache/snapshots/YYYY-MM-DD.json` — UTC 일별 frozen JSON snapshot, filename-anchored 30일 retention.
- M4 `triggerRender` 직후 piggyback write (별도 hook/cron 없음).
- `audit-timeline.js`가 live receipts가 7–30일 band에 sparse 할 때 snapshot rows를 ⌛ 보관 plate로 merge — PM이 quarantine/rotation 이후에도 30일 의사결정 흐름을 추적 가능.

Codex Implement-Codex R1에서 4개 finding을 ACCEPT_NOW absorption: F1 (receipt_hash 식별자 추가 + dispatched_by_controller_session_id 정확한 이름), F2 (trigger.js `let model` hoist), F3 (`.last-render.json render_at` 필드 — `derived_at` 가정 정정), F4 (eviction 절차를 write eligibility로부터 분리). 모두 plan body 본문에 contract으로 박힌 뒤 implement-time에서 한 줄씩 정정.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium (1 new lib + 1 trigger integration + 1 derive source add + 1 audit-timeline section extension + 1 doc + 5 tests; 6–10h) | 정확히 일치. 7 files changed + 5 files created. R1 absorption 흡수로 mechanical 수정 추가됨 (receipt_hash 노출, model hoist, render_at 정정, eviction 분리). |
| Confidence | n/a | High — 모든 ACCEPT_NOW finding이 plan-level contract으로 정정 가능했음. R2 escalate 미발화. |
| Files Changed | 7 plan-declared | 7 modified + 5 new (snapshot lib + tests + docs) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | R1 absorption — plan body amend + Codex Implementation Review section inject | ✓ Complete | F1-F4 4개 absorption box inline |
| 0b | mccp-implement-codex receipt write + plan-codex re-anchor | ✓ Complete | plan body amend으로 plan_hash 변경 → plan-codex refresh |
| 0c | receipt_hash 노출 — derive/sources/receipts.js | ✓ Complete | F1 absorption. additive 변경, MODEL_VERSION 'v1' 유지 |
| 1 | snapshot writer module — lib/snapshot/index.js | ✓ Complete | writeSnapshotIfNeeded(model, opts) facade. F3 skew guards + F4 분리 + always-mask. |
| 1 tests | snapshot.test.js 12 paths | ✓ Complete | 모든 path 통과 (write/idempotence/short-circuit/eviction/inject/mask/skew × 2 + 내부 함수) |
| 2 | trigger.js wire | ✓ Complete | F2 absorption — `let model` hoist + lazy require + try/catch |
| 2 test | trigger.test.js path j | ✓ Complete | 11/11 regression + path j (snapshot 생성 확인) |
| 3 | audit-timeline.js 30일 read path + cap split | ✓ Complete | MAX_ROWS_LIVE=20 / archived=10. de-dup gate+decision+receipt_hash. missing-day footnote 추가 (F1) |
| 3 tests | audit-timeline-snapshot.test.js 7 paths | ✓ Complete | baseline/merge/de-dup/corrupt-skip/internal |
| 4 | renderer/index.js snapshotsDir 자동 resolve | ✓ Complete | masked mode에서는 opts.snapshotsDir 명시 필요 — trigger.js + cli.js 모두 전달 |
| 5 | MODEL_VERSION decision | ✓ Complete (skip-with-rationale) | additive surface — 'v1' 유지가 convention. 본문 코멘트로 M1-M5 누적 명시. |
| 6 | docs/v1.3.0-observability/snapshot-schema.md | ✓ Complete | snapshot-v1 schema + retention + skew guards + de-dup + always-mask + read path 모두 문서화 |
| 6b | schema-surface.md §8 cross-link | ✓ Complete | M5 surface freeze 등록 |
| 7 | plugin.json version bump | ✓ Complete | 1.4.0 → 1.5.0 (M5 minor ship) |
| smoke | CLI render + 30일 eviction + 14일 merge | ✓ Complete | 모두 정상 작동. CLI에 snapshot wire 추가 |

Deviations from plan:

- **Task 5 (MODEL_VERSION)**: plan body는 `1.0.4 → 1.0.5` semver convention 가정. 실제 코드는 `'v1'` 단일 token. M2/M3/M4 모두 additive로 bump 안 함. M5도 동일 — comment 추가로 audit trail만.
- **CLI snapshot write 추가**: plan validation에서 `node ... cli.js render`가 snapshot을 produce해야 한다고 명시했음. CLI는 원래 read-only/render-only 였음. M5에서 `cmdRender` 마지막에 `writeSnapshotIfNeeded` 명시 호출 추가. trigger.js와 양립 — CLI는 manual smoke / 별도 driver, trigger.js는 자동 hook 경로.
- **snapshotsDir CLI 명시 전달**: renderer/index.js auto-resolve가 masked mode (`m.repo_root === '<repo>'`)에서 null fallback. CLI는 cwd를 알고 있으므로 명시 전달 (`{ snapshotsDir: path.join(cwd, '.claude', 'cache', 'snapshots') }`).
- **rowKey separator**: spaces → `|` (Write tool encoding 우연으로 null byte issue 발생 후 안전한 token 선택).

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | ✓ Pass | Node 24 native (no TS/lint) — module load 검증 + 의도된 surface export 확인 |
| Unit Tests | ✓ Pass | snapshot 12/12, audit-timeline-snapshot 7/7, sections 13/13 (cap test updated), trigger 11/11 (path j added), derive 34/34 |
| Build | n/a | Pure Node, no build step |
| Integration | ✓ Pass | CLI render → 오늘 snapshot write + 30일 retention eviction + 14일 archived row merge (footnote 정확) |
| Edge Cases | ✓ Pass | empty short-circuit + retention | future-dated 보호 | last-render skew abort | corrupt JSON silent skip | always-mask invariant | always-mask이 idempotent |

**Pre-existing failures (M5 unrelated)**:
- `hooks/tests/g1-patch.test.js` 3 tests — module-load fail-open path. main commit 779ee1a stash 검증으로 회귀 아님 확인.
- `receipt/tests/hash-briefing-exclusion.test.js` "different briefing values hash identically" — full sweep에서만 fail, isolation 통과. test pollution (env leak) 추정. M5 코드와 무관.

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/snapshot/index.js` | CREATE | +287 |
| `plugins/mccp/scripts/lib/snapshot/tests/snapshot.test.js` | CREATE | +233 |
| `plugins/mccp/scripts/lib/renderer/tests/audit-timeline-snapshot.test.js` | CREATE | +186 |
| `docs/v1.3.0-observability/snapshot-schema.md` | CREATE | +109 |
| `plugins/mccp/scripts/derive/sources/receipts.js` | UPDATE | +6 |
| `plugins/mccp/scripts/derive/model.js` | UPDATE | +7 |
| `plugins/mccp/scripts/derive/cli.js` | UPDATE | +18 (snapshot integration + snapshotsDir 명시 전달) |
| `plugins/mccp/scripts/lib/renderer/index.js` | UPDATE | +17 |
| `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` | UPDATE | +157 |
| `plugins/mccp/scripts/lib/renderer/trigger.js` | UPDATE | +28 |
| `plugins/mccp/scripts/lib/renderer/tests/trigger.test.js` | UPDATE | +41 (path j 추가) |
| `plugins/mccp/scripts/lib/renderer/tests/sections.test.js` | UPDATE | +7 (cap MAX_ROWS_LIVE=20 expected 갱신) |
| `docs/v1.3.0-observability/schema-surface.md` | UPDATE | +4 (§8 추가) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | +1 / -1 (1.4.0→1.5.0) |
| `.claude/prds/v1-3-0-observability-surface-ii.prd.md` | UPDATE | +2 / -2 (M5 row pending→complete 전환은 PR merge에서) |
| `.claude/plans/v1-3-0-observability-m5-snapshot-decision-log.plan.md` | UPDATE (R1 absorption) | inline (Codex Implementation Review + absorption box) |

## Deviations from Plan

위 "Deviations" 절 참조. 핵심: (1) MODEL_VERSION 'v1' 유지 (additive convention), (2) CLI에 snapshot writer 추가 + snapshotsDir 명시 전달 (smoke validation 만족 위해), (3) rowKey separator `|` 채택.

## Issues Encountered

| 이슈 | 원인 | 처리 |
|---|---|---|
| Write tool null byte 우연 | 큰 single-line Write 시 일부 공백이 null byte로 인코딩됨 | 별도 fix script로 normalize. rowKey separator는 `|`로 변경하여 재발 방지 |
| validate-cmd default slug fallback | STATE.md open question 재현 — `--plan` 없이 호출 시 `default` slug + v0.2.8 quarantine fail | 우회로 `--decision` + `--plan` 명시 전달. axis는 mechanical 1-line patch 후보 (v1.5.x 또는 v1.6.x cycle) |
| worktree `.git/` hardcode (5번째 hit) | `mkdir .git/mccp/tmp`가 sibling worktree에서 `Not a directory` | `git rev-parse --git-dir`로 실제 worktree git-dir 해결 후 사용 |
| Codex companion stdout-empty (R1 first call) | infra 결함 — 198s 지속 후 exit 0 + empty buffer | 즉시 retry → 302s에 정상 응답 |
| plan-codex receipt stale (plan_hash drift) | implement-codex가 plan body에 review 섹션 inject → plan_hash 변경 | plan-codex receipt refresh (write 재실행, 새 hash anchor) — 의도된 자동화 |

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/lib/snapshot/tests/snapshot.test.js` | 12 | write / idempotence / empty-short-circuit / eviction / fs-throw / always-mask / future-date guard / last-render skew guard / 내부 함수 4 |
| `plugins/mccp/scripts/lib/renderer/tests/audit-timeline-snapshot.test.js` | 7 | baseline / merge / de-dup / corrupt-skip / rowKey / readSnapshotRows / MAX_ROWS_LIVE |
| `plugins/mccp/scripts/lib/renderer/tests/trigger.test.js` (path j) | 1 | trigger 성공 후 오늘 snapshot 생성 확인 |
| 합계 신규 path | 20 | + 기존 110 regression 모두 green |

## Next Steps

- [ ] `/mccp:code-review` — 변경 코드 multi-perspective review
- [ ] `/mccp:prp-commit` — 변경 commit (M5 + receipt + plan 본문)
- [ ] `/mccp:pr` — PR 작성 (Codex Implementation Review section + Security Reviewer override 없음 — security-sensitive 영역 아님)
- [ ] PRD `Delivery Milestones` row 5 `in-progress → complete` (PR merge 시점)
- [ ] M5 ship 후 v1.3.0 cycle close 또는 M6 (generic-interface validation) 진입 결정
- [ ] STATE.md open question 처리: validate-cmd default slug fallback 우회 — mechanical 1-line patch axis (별도 patch PR 또는 v1.5.1 hot-fix)
