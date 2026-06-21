# Implementation Report: v1.3.0 design-gate M3 follow-up (H15 + H16)

## Summary

Parent M3 plan(`v1-3-0-design-gate-m3-output-constraints.plan.md`)의 partial Axis C deferral 약속을 닫음. DESIGN.md에 H15(heading depth ≤ 3) + H16(unrendered markdown literal) spec 2 row 추가, `output-constraints.js` RULES array 14 → 16 확장, 22 신규 test, plugin.json `1.7.0 → 1.9.0` minor bump. 본 cycle은 **PR #45 stack 모드** (사용자 명시 override, "여기서 진행해줘") — 별도 worktree 분리 대신 chore/v1.3.0-prd-status-roll branch에 H15+H16 누적.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small | Small (R1 absorption으로 H15+H16 catalog 확장이 추가됐지만 mechanical) |
| Confidence | High | High — 214 tests pass, 0 fail |
| Files Changed | 7 (plan body 포함) | 7 (plan + design + code + 2 test + plugin.json + CHANGELOG) |
| Codex implement-time findings | 0 (plan 가정 dedupe) | 4 (HIGH×1 + MEDIUM×3, 모두 R1 absorbed) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | PR #45 merge preflight | **SKIPPED** | 사용자 명시 override — PR #45 stack 모드. plan body `## Codex Implementation Review` 의 "Stacking note" 섹션에 결정 audit. |
| 1 | DESIGN.md H15 spec row | ✓ Complete | line 53(H14) 직후 row 추가 + line 54-55 "H1–H16" 갱신 |
| 2 | DESIGN.md H16 spec row | ✓ Complete | H15 row 직후. Codex F3/F4 R1 absorption으로 dunder 15종 + entity variant 3종 명시 |
| 3 | output-constraints.js H15 rule | ✓ Complete | RULES push, severity=invariant. Codex F2 R1 absorption: 두 fence(backtick+tilde) strip + CommonMark ATX `^ {0,3}#{4,6}\s` |
| 4 | output-constraints.js H16 rule | ✓ Complete | RULES push, severity=absolute-ban. Codex F3 R1 absorption: 15 dunder. Codex F4 R1 absorption: 3 entity backtick variant + paired entity-asterisk + paired entity-underscore |
| 5 | output-constraints.test.js 갱신 | ✓ Complete | RULES.length 14 → 16 + 22 신규 test (H15 6 + H16 16). plan 47 target은 R1 absorption expansion으로 68/68 pass |
| 6 | design-invariants.test.js drift fixture | ✓ Complete | 16-rule baseline 회귀 0 + drift fixture (H15+H16 강제 검출). 5/5 pass |
| 7 | m3-redux dry-run | △ Advisory | H15 0건. H16 16건 — entity-backtick 15(format-utils.js#escapeHtml의 XSS-방어 escape 결과) + bold-asterisk 1(plan body user content). H10 user content advisory와 동형 by-design. **Follow-up axis 분리**: markdown inline code → `<code>` wrap (별도 plan) |
| 8 | plugin.json bump + CHANGELOG | ✓ Complete | Codex F1 R1 absorption: 1.8.0 → 1.9.0 직접 bump (main 1.8.1 race 회피). CHANGELOG `[1.9.0]` row 추가 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (lint+type) | N/A | JavaScript, no formal type-check (Node 20 native) |
| Unit tests — renderer | ✓ Pass | 15 files × 162 tests, 0 fail |
| Unit tests — derive | ✓ Pass | 14 files × 52 tests, 0 fail |
| Integration | ✓ Pass | `node plugins/mccp/scripts/derive/cli.js render` exit 0, advisory output (H10+H16) by-design |
| Edge cases | ✓ Pass | tilde fence (F2) + entity variants (F4) + expanded dunder (F3) all covered |

## Files Changed

| File | Action | Notes |
|---|---|---|
| `.claude/plans/v1-3-0-design-gate-m3-followup-heading-depth-and-md-literal.plan.md` | CREATE | (already in working tree from session start; Codex Implementation Review + Task 7 acceptance + Stacking note added) |
| `docs/v1.3.0-observability/DESIGN.md` | UPDATE | H15 + H16 row 추가, "H1–H16" 갱신 |
| `plugins/mccp/scripts/lib/renderer/output-constraints.js` | UPDATE | RULES array 14 → 16, header comment "H1-H16" 갱신 |
| `plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js` | UPDATE | RULES.length assertion + 22 신규 test |
| `plugins/mccp/scripts/lib/renderer/tests/design-invariants.test.js` | UPDATE | 16-rule sanity + drift fixture test |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | 1.7.0 → 1.9.0 (Codex F1 R1 absorption) |
| `CHANGELOG.md` | UPDATE | `[1.9.0]` row 추가 |
| `.claude/receipts/mccp-plan-codex/v1-3-0-prd-status-roll.json` | UPDATE | plan body hash refresh × 2 (additive R1 absorption) |
| `.claude/receipts/mccp-implement-codex/v1-3-0-prd-status-roll.json` | CREATE | implement gate receipt |

## Deviations from Plan

| 항목 | What | Why |
|---|---|---|
| Task 0 | preflight skipped | PR #45 stack 모드 사용자 override. plan body Codex Implementation Review의 Stacking note에 audit trail |
| Task 8 version | 1.8.0 → **1.9.0** | Codex F1 R1 absorption — main이 v1.4.x cycle PR #46/#47/#48/#49/#51로 1.8.1까지 진행. 1.8.0 bump 시 non-monotonic 위험 |
| Task 3 H15 fence strip | backtick만 → backtick + tilde | Codex F2 R1 absorption. tilde fenced 예시 false-positive 방지 |
| Task 4 H16 dunder | 10종 → 15종 | Codex F3 R1 absorption. repo skill docs에 `__all__`/`__slots__`/`__dict__` 실 사용 |
| Task 4 H16 entity | `&#96;`/`&#x60;` exact만 → leading-zero + uppercase + named entity + paired asterisk/underscore | Codex F4 R1 absorption. bypass 차단 + entity-encoded bold marker catch |
| Task 5 test count | 47 → 68 | R1 absorption expansion으로 H15 4→6 + H16 11→16 |
| Task 7 acceptance | H10만 advisory → H10 + H16 advisory | format-utils.js#escapeHtml의 XSS-방어 escape가 H16을 fire (by-design). 별도 follow-up plan으로 분리 |

## Issues Encountered

| 항목 | 해결 |
|---|---|
| `.git/` is a file in worktree (not directory) → `mkdir -p .git/mccp/tmp` 실패 | `git rev-parse --git-dir` 으로 진짜 gitdir 얻은 후 사용 (CLAUDE.md feedback memory + STATE.md OQ에 누적된 mechanical patch axis) |
| Plan-codex receipt가 hash mismatch로 stale 2회 | R1 absorption이 plan body에 누적되면서 hash가 변동. 동일 decision 유지 → receipt refresh로 해소. (구조적 axis: implement-time absorption은 별도 surface로 분리 권장) |
| validate-cmd가 "default" decision slug fallback | CLAUDE.md §4 + OQ에 누적된 issue. `--decision` 명시로 우회 |
| Codex 4 finding (HIGH×1 + MEDIUM×3) | 모두 R1 ACCEPT_NOW로 plan body + implementation 양쪽 갱신. R2 escalate 미트리거 (cap=1 + ACCEPT_NOW 모두 R1 resolved) |
| m3-redux dry-run H16 16건 발화 | `escapeHtml` backtick escape의 by-design 결과 — H10 user content em-dash advisory와 동형으로 acceptable |

## Tests Written

| Test File | Tests Added | Coverage |
|---|---|---|
| `output-constraints.test.js` | 22 (H15 6 + H16 16) + 1 RULES.length 갱신 | H15: html-pass, html-fail, md-fail, indented-md-fail, backtick-fenced-pass, tilde-fenced-pass. H16: baseline-pass, 4 bold/link/MD0xx fail, carve-out, raw backtick, entity decimal/hex/leading-zero/upper-hex/named, entity-asterisk pair, 3 dunder pass, expanded dunder pass, non-dunder fail, pre carve-out |
| `design-invariants.test.js` | 1 (drift fixture) | H15+H16 violation surface end-to-end |

## Codex Implement-Codex Review

- **호출**: `node codex-invoke.js adversarial-review --impeccable-available` (fail-closed wrapper, classification=ok, blocking=false, durationMs=337461ms)
- **threadId**: `019eeaf7-2e8b-7a30-aecf-1d7fc4977274`
- **라운드 수**: 1 (cap=1, 4 finding R1 absorbed → R2 미escalate)
- **합치 결론**: needs-attention → R1 absorption 후 ship-ready
- **YAGNI Triage**: F1 HIGH (version race) / F2 MEDIUM (H15 fence) / F3 MEDIUM (H16 dunder) / F4 MEDIUM (H16 entity) — 모두 ACCEPT_NOW
- **Deferred to backlog**: 0
- **Auto-CRITICAL catalog 6종 hit**: 0
- **Cross-gate dedupe 사전 점검**: `mccp-receipt dedupe` `skip_safe=false` (residual 84 files in PR #45 branch) → full Codex run

## Acceptance Checklist

- [x] Task 1 — DESIGN.md H15 spec row 추가 + "H1–H16" 갱신
- [x] Task 2 — DESIGN.md H16 spec row 추가 (5 pattern catalog + 15 dunder + 3 entity variant)
- [x] Task 3 — output-constraints.js H15 rule (backtick + tilde fence strip + CommonMark ATX)
- [x] Task 4 — output-constraints.js H16 rule (6 pattern + 15 dunder + 3 entity backtick + paired entity-asterisk/underscore)
- [x] Task 5 — output-constraints.test.js 68/68 pass (RULES.length=16 + 22 신규 test)
- [x] Task 6 — design-invariants.test.js 5/5 pass (16-rule baseline + drift fixture)
- [△] Task 7 — m3-redux dry-run: H15 미등장 ✓ / H16 16건 advisory by-design (XSS escape + user content surface, H10 동형) — follow-up axis 분리
- [x] Task 8 — plugin.json 1.7.0 → 1.9.0 (F1 R1) + CHANGELOG `[1.9.0]` row
- [x] 회귀 0 — renderer 15 files × 162 tests, derive 14 files × 52 tests
- [ ] Task 0 — preflight (SKIPPED, 사용자 override audit)

## Follow-up Axes

1. **Renderer inline-code wrap** — `format-utils.js#escapeHtml`이 backtick을 XSS escape하는 것은 정당, 그러나 markdown inline code(`` ` ``)는 `<code>` HTML tag로 wrap돼야 한다. 현재 escape만 적용 → H16 fire. 별도 plan: `output-constraints-followup-renderer-inline-code-wrap`. 
2. **STATE.md body 자동 roll** — `/mccp:pr` Phase 1 VALIDATE에 plugin.json + STATE.md freshness check 추가 (STATE.md OQ에 이미 기재)
3. **`pr.md` worktree `.git/` hardcode 결함** — 본 cycle에서도 hit. `git rev-parse --git-dir` 우회 patch (누적 7+ cycle 1줄 mechanical fix)
4. **validate-cmd `--decision/--plan` 누락 시 default fallback v0.2.8 quarantine block** — prp-implement.md Phase 2.5.7 Step C/D에 `--decision/--plan` 자동 propagate axis (CLAUDE.md §4 + OQ 누적)
5. **plan body의 R1 absorption surface 분리** — implement-time absorption이 plan-codex receipt를 stale 만드는 구조적 race. implement absorption은 별도 file (`.claude/notes/<topic>-absorption.md`)로 분리하거나 receipt schema에 absorption journal 추가

## Next Steps

- **이 세션**: Phase 7 auto-chain은 cost-hard-ceiling으로 abort 예상 (commit/PR 자동화 비활성). 사용자 manual commit 권장
- **PR #45 merge 후**: `claude plugin update`로 cache 1.9.0 hot-fix
- **Follow-up**: 위 5 axis 중 우선순위 결정 (1번은 H16 advisory 해소, 3/4번은 mechanical 1-line patch)
- **archived 안 함**: PR #45와 함께 stacked ship → PR #45가 merge될 때 plan 자동 closed. 별도 archive 동작 없음 (parent plan과 동일 PR 안에 살아있음)
