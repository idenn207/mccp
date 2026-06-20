# Implementation Report — v1.4.0 axis C (M3): `/goal` → `/mccp:milestone-close`

## Summary

Anthropic native `/goal` completion-condition loop를 mccp의 receipt chain 안에 anchor하는 신규 `/mccp:milestone-close` slash command + 3축 isolation(detect probe + PreToolUse guard + Stop hook short-circuit) 출시. closure-doc body + plan-body provenance hash로 mutation custody invariant 보존 (option B). PRD M1+M2+M3 누적으로 M4 (integration template doc) row 별도 milestone redundant 결정 → status `dropped`.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large (신규 slash command + multi-turn isolation lock + Stop hook 측 lock-aware short-circuit + 신규 receipt gate 후보) | Large — 첫 cut option B로 신규 gate 도입 회피 |
| Confidence | n/a | High (회귀 0, 80+172 unit tests pass, smoke validated) |
| Files Changed | 17 (예측: 7 신규 + 5 update + 신규 디렉토리) | 16 (신규 9 + update 6 + closures 디렉토리 1) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | WebFetch `/goal` native spec | ✓ | https://code.claude.com/docs/en/goal — stop_hook_fires=true (`/goal` IS a session-scoped prompt-based Stop hook), sub_session_id_exposed=false (same session_id), turn_bound_default=none, evaluator_event_exposed=false. 5 boolean stamped to plan body footer HTML comment. |
| 2 | `goal-detect.js` probe library | ✓ | mode-aware probe + PRD `Delivery Milestones` table row parser + Status+Plan+plan-file-exists 휴리스틱 + S2 realpath path-traversal guard + env override. |
| 3 | `goal-detect` tests | ✓ | 15 pass + 1 Windows symlink skip. |
| 4 | `goal-phase-lock.js` multi-turn lock | ✓ | ultracode-phase-lock v0.2.8 hardened 1:1 mirror. lease 90s (vs M2's 60s). sidecar mode 0o600 (S1) + mkdir-before-lock (H2/S6). milestone_id + owner_session_id fields. |
| 5 | `goal-phase-lock` tests | ✓ | 17 pass + 1 Windows mode skip. multi-turn heartbeat sim + sidecar mkdir EACCES included. |
| 6 | `goal-phase-guard.js` PreToolUse hook | ✓ | F2 fail-CLOSED + F3 STRICT non-owner (read-only ALLOW only, writes DENY regardless) + F4 MultiEdit + S3 Bash whitelist-only. |
| 7 | `goal-phase-guard` tests | ✓ | 31 pass — full deny/allow matrix + F3 non-owner write+read split + F2 malformed + F4 MultiEdit + S3 bash-c wrapper bypass attempt. |
| 8 | `stop-review-loop.js` short-circuit | ✓ | ~20-line inline freshness validation (host + pid + mtime < 90s lease). loud fail-open on parse error. backward-compat: 기존 13 시나리오 회귀 0. |
| 9 | `stop-review-loop` tests | ✓ | 신규 4 시나리오 (fresh=suppress, stale=fall-through, foreign-dead=fall-through, parse-error=loud fail-open). 기존 13 + 신규 4 = 17 pass. |
| 10 | `/mccp:milestone-close` command body | ✓ | Phase 0-5 모두 명세. cooperative guide prompt에 `◎ /goal active` indicator + `/goal clear` early-exit + 90s lease heartbeat 안내 포함. |
| 11 | `hooks.json` PreToolUse 등록 | ✓ | `mccp:goal-phase-guard:pre` entry 추가. JSON syntax 검증 통과. plugin.json version은 PR ship 시점 결정 (CLAUDE.md §3.7). |
| 12 | `integration-template.md` axis C | ✓ | §3 layer 4 axis C cell (2-axis isolation) + §5 matrix axis C (option B) + §6 anti-pattern (multi-turn Stop-hook leakage) + §9 M3 reference (placeholder → reference) + §10 2 신규 checklist + status mark M1+M2+M3-validated. |
| 13 | PRD + CHANGELOG + closures README | ✓ | M2 row complete (stale fix) + M3 row in-progress + M4 row dropped + Open Q 3개 결정 stamp. CHANGELOG [Unreleased] entry + S1-S6 absorption section. |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis (`node -c`) | ✓ Pass | goal-detect/goal-phase-lock/goal-phase-guard/stop-review-loop 모두 syntax ok |
| Unit Tests — M3 4 files | ✓ Pass | 80/82 pass + 2 Windows skip (symlink path-traversal + sidecar mode 0o600 POSIX-only) |
| Regression Sweep — M1+M2+pr-phase-guard | ✓ Pass | 172/172 (deep-research-detect + ultracode-detect + ultracode-phase-lock + ultracode-phase-guard + pr-phase-guard) — 회귀 0 |
| hooks.json JSON | ✓ Pass | `JSON.parse` valid + grep `mccp:goal-phase-guard:pre` = 1 |
| goal-detect CLI smoke | ✓ Pass | env=missing → `availability=missing reason=command-missing`. `--milestone 99` → `reason=milestone-not-found`. |
| goal-phase-lock CLI smoke | ✓ Pass | enter+exit round-trip (sidecar token via run-id, no shell-var stash). cleared=true. |
| integration template doc | ✓ Pass | axis C 언급 11회 (≥10 acceptance), status mark M1+M2+M3-validated 1회, PRD M3 row in-progress 갱신 확인 |
| Manual dogfood smoke | Deferred | 본 cycle ship 후 첫 invocation에서 검증 (Task 10 Validate per plan: "수동 dogfood 세션") |

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/scripts/lib/goal-detect.js` | CREATE | ~280 LOC. probe + milestone-ref parsing + realpath traversal guard. |
| `plugins/mccp/scripts/lib/tests/goal-detect.test.js` | CREATE | 16 scenarios. |
| `plugins/mccp/scripts/lib/goal-phase-lock.js` | CREATE | ~440 LOC. ultracode-phase-lock 1:1 mirror + lease 90s + milestone_id field. |
| `plugins/mccp/scripts/lib/tests/goal-phase-lock.test.js` | CREATE | 18 scenarios incl. multi-turn heartbeat sim + sidecar mode + sidecar mkdir EACCES. |
| `plugins/mccp/scripts/hooks/goal-phase-guard.js` | CREATE | ~370 LOC. F2 fail-CLOSED + F3 STRICT non-owner + F4 MultiEdit + S3 Bash whitelist. |
| `plugins/mccp/scripts/hooks/tests/goal-phase-guard.test.js` | CREATE | 31 scenarios. |
| `plugins/mccp/scripts/hooks/stop-review-loop.js` | UPDATE | +38 lines (os import + ~20-line inline freshness validation). 기존 함수/decision tree 무수정. |
| `plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js` | UPDATE | +116 lines (4 신규 scenarios). |
| `plugins/mccp/commands/milestone-close.md` | CREATE | Phase 0-5 명세 + cooperative guide prompt + failure-mode handling. |
| `plugins/mccp/hooks/hooks.json` | UPDATE | +11 lines (goal-phase-guard PreToolUse entry). |
| `docs/automation-modernization/integration-template.md` | UPDATE | +54/-31 (axis C 셀 + status mark + anti-pattern + audit checklist 2개). |
| `.claude/prds/v1-4-0-automation-modernization.prd.md` | UPDATE | M2 row complete + M3 row in-progress + M4 row dropped + Open Q 3개 stamp. |
| `CHANGELOG.md` | UPDATE | [Unreleased] entry — Added/Changed + S1-S6 security absorption section. |
| `.claude/milestone-closures/README.md` | CREATE | spec + git-tracked invariant. |
| `.claude/plans/v1-4-0-m3-goal-milestone-close.plan.md` | UPDATE (HTML comment) | Task 1 native spec footer stamp. |

## Deviations from Plan

- **Plan body footer stamp 위치**: plan은 `<!-- version-bump-policy: ... -->` 한 줄을 명시했고 본 update가 그 아래에 `<!-- goal native spec confirmed at ... -->`를 추가. 두 줄 모두 보존되며 audit-trail 명확.
- **§9 numbering**: plan Task 12 spec은 "§8 placeholder → reference"라고 표현했지만 실제 doc 구조에서 §9가 M3 placeholder였음. §9를 reference로 채움 (의도와 일치).
- **PRD M1 row 무변경**: 이미 `complete` 상태였음 (M1 ship 시 housekeeping 완료). Task 13 "M1 row Status complete (already complete)"와 일치.

## Issues Encountered

- **PostToolUse Edit loop 경고 (false positive)**: integration-template.md 편집 중 동일 파일의 서로 다른 unique string에 대한 연속 Edit 호출이 hook의 loop detector를 trigger. 실제로는 정상 진행 — 각 Edit는 distinct old_string을 대상으로 함. 진행을 멈추지 않고 계속.
- **`/goal` mode banner 안내**: WebFetch 결과 `◎ /goal active` indicator가 표시되므로 cooperative-guide prompt에 명시. plan은 indicator를 mention 안 했지만 UX 개선으로 추가.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `goal-detect.test.js` | 16 | env override × 3, milestone status combos (in-progress/complete/pending), no-table, out-of-range, partial-name match, path traversal (relative + symlink), mode mismatch, availability=unknown bonus |
| `goal-phase-lock.test.js` | 18 | lifecycle + race + token mismatch + tri-state reclaim + 0-byte/parse-error/missing-field + milestone-id field + multi-turn heartbeat sim + sidecar mode 0o600 + sidecar mkdir EACCES + hashToken/verifyTokenAgainstLock unit |
| `goal-phase-guard.test.js` | 31 | Bash allow/deny matrix + S3 bash-c wrapper + Skill mccp:* deny + F3 STRICT non-owner policy (owner-match + non-owner read + non-owner write + absent) + E2E PreToolUse 14 scenarios (incl. F4 MultiEdit both same+non-owner) |
| `stop-review-loop.test.js` (+4) | 17 (13 baseline + 4 new) | M3-S1 fresh=suppress + M3-S2 stale=fall-through + M3-S3 foreign-dead=fall-through + M3-S4 parse-error=loud fail-open |

## Next Steps

- [ ] Manual dogfood smoke: 본 PR ship 후 첫 `/mccp:milestone-close 3` invocation으로 Phase 0-5 전체 흐름 검증 (Phase 4 closure-doc write + plan-body provenance stamp).
- [ ] Code review via `/mccp:code-review` (자동 chain의 일부) — 후속.
- [ ] `/mccp:pr` (자동 chain의 일부) — closure-doc anchor가 PR body의 plan_hash anchor에 포함되는지 확인.
- [ ] plugin.json version bump — PR ship 시점 main HEAD 기준 결정 (CLAUDE.md §3.7).
