# Implementation Report: v1.4.x cwd-mask + branch-validation polish

## Summary

v1.4.0 multi-session PRD audit가 검출한 2개 polish axis를 single PR로 처리. (A) receipts source `meta.cwd` emit + `derive/mask.js#maskPath` outside-root 보강으로 sibling worktree / parent / UNC / cross-drive cwd 누수 차단. (B) `session-ledger.js` git_branch ref-format invariant 강화 (write-side strict + read-side lift) + WARN cardinality cap. plugin.json 1.8.0 → 1.8.1 patch bump. 회귀 0 (state 188/188 + derive 66/66).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small | Small |
| plugin.json bump | 1.6.0 → 1.6.1 (plan baseline 오류) | **1.8.0 → 1.8.1** (실제 baseline — friction-zero M3 commit이 1.7→1.8 이미 bump) |
| Files Changed | 9 | 8 (CLAUDE.md/CHANGELOG.md/plugin.json + 5 source/test) |

## Codex Gates

- **mccp-plan-codex** (prior session): R1 3 findings → ACCEPT_NOW 3건, plan body absorbed. threadId `019ee5ee-db8e-7ec2-aee0-1209a64632e6`.
- **mccp-implement-codex** (this session): R1 3 findings (HIGH 0.93 + MEDIUM 0.82 + MEDIUM 0.74) → ACCEPT_NOW 3건, plan body absorbed in-place. R2 skipped per `MCCP_GATE_ROUND_CAP=1` default. threadId `019ee7b2-a36a-7d60-98b7-94961e041f27`. Receipt `.claude/receipts/mccp-implement-codex/v1-4-x-cwd-mask-branch-validation.json`.

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | session-ledger.js validate + lift | [done] | `isValidGitBranch` total helper + `liftLegacyBranch` + WARN memo + 4 read-site lift insertions |
| 2 | session-ledger.test.js (11 new) | [done] | 5 negative + 1 positive + 1 helper-total + 2 lift + 1 WARN cardinality + control-char via `String.fromCharCode(7)` |
| 3 | derive/sources/receipts.js cwd emit | [done] | `pick(meta, 'cwd')` 1줄 |
| 4 | derive/mask.js maskPath outside-root | [done] | `isOutsideRoot` 3축 detect + `safeTrailingSegment` platform-independent sanitizer |
| 5 | derive/tests/mask.test.js (7 new) | [done] | 6 maskPath case + 1 no-separator-leak invariant + 1 edge (empty rel) → 8건 |
| 6 | plugin.json + CHANGELOG + CLAUDE.md bump | [done] | 1.8.0 → 1.8.1, CHANGELOG `## [1.8.1]` row 추가, CLAUDE.md gate table row 추가 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| L1 Lint/Typecheck | N/A | JavaScript, no TS/lint suite wired for these paths |
| L2 Unit Tests | [done] | session-ledger 44/44 + mask 14/14 |
| L3 Build | N/A | No bundler step |
| L4 Integration / Regression | [done] | state-tests 188/188 + derive-tests 66/66 |
| L5 Derive smoke (Validation 절) | [done] | receipts.items[].cwd POSIX absolute / Windows-drive / UNC 0건 (post empty-rel fix) |

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/state/session-ledger.js` | UPDATED | +47 |
| `plugins/mccp/scripts/state/tests/session-ledger.test.js` | UPDATED | +118 |
| `plugins/mccp/scripts/derive/sources/receipts.js` | UPDATED | +3 |
| `plugins/mccp/scripts/derive/mask.js` | UPDATED | +57 / -3 |
| `plugins/mccp/scripts/derive/tests/mask.test.js` | UPDATED | +41 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | +1 / -1 |
| `CHANGELOG.md` | UPDATED | +22 / -1 |
| `CLAUDE.md` | UPDATED | +1 |

## Deviations from Plan

| What | Why |
|---|---|
| `plugin.json` bump 1.8.0 → 1.8.1 (plan said 1.6.0 → 1.6.1) | Plan body baseline이 stale — friction-zero M3 PR (b1d09a3)이 이미 1.7 → 1.8 bump 적용. 실제 디스크 값 기준으로 정정. |
| `maskPath` empty rel 추가 fix (input === repoRoot → `.`) | Plan-time에 미인지된 edge case. Derive smoke가 actively detect (이 worktree의 receipts.cwd가 실제로 repoRoot와 동일). 보안적으로 `.`로 정규화하는 게 raw absolute leak보다 strictly better. Test 1건 추가로 cover. |
| Test count: 11 (session-ledger) + 8 (mask) | Plan 11 + 7로 예측. mask는 outside-root invariant test 1건 더 추가 + empty-rel 1건 → 8. |

## Issues Encountered

1. **`.git` worktree path treated as directory** — `mkdir -p .git/...` 실패. `git rev-parse --git-dir`로 실제 gitdir 경로 사용. CLAUDE.md §3.5 memory feedback hit.
2. **Control char literal in test fixture** — Edit 도구가 `\x01` literal 매칭 못함. `String.fromCharCode(7)`로 작성. 다음 control-char negative test도 같은 패턴 권장.
3. **Derive smoke initially failed** — `path.relative(root, root) === ''` edge case. maskPath `if (!rel) return absOrRel` → `return '.'` 정정 + test 1건 추가.
4. **`node --test <dir>` Windows에서 디렉토리 인자 처리 안 됨** — `*.test.js` glob 사용으로 우회.

## Tests Written

| Test File | New Tests | Coverage |
|---|---|---|
| `session-ledger.test.js` | +11 | branch validate negative (5) + positive (1) + helper total (1) + read-side lift (2) + WARN cardinality (1) + 6th total-function guard pre-existing in same block |
| `mask.test.js` | +8 | maskPath 7 case (inside/sibling/Windows-drive/UNC/POSIX-host-Windows-input/degenerate-drive-root/input-equals-root) + 1 no-separator-leak invariant |

## Codex R2 Absorptions (in-plan)

| Finding | Severity | Verdict | Where absorbed |
|---|---|---|---|
| F1 — Lift ordered post-validate → silent drop | HIGH 0.93 | ACCEPT_NOW | Plan Task 1 본문 invariant 정정 + 4 call-site `read → liftLegacyBranch → validate` 순서로 실제 코드 작성. Read-side test가 검증. |
| F2 — `path.basename` host-platform leaks | MEDIUM 0.82 | ACCEPT_NOW | `safeTrailingSegment(input)` self-contained helper + `isOutsideRoot` 3축 detect + `WIN_DRIVE_RE` / `UNC_RE` 자체 정의 (Node.js `path` 의존성 없이 cross-platform). POSIX-host-Windows-input test 케이스. |
| F3 — Per-ledger stderr WARN spam | MEDIUM 0.74 | ACCEPT_NOW | `WARNED_LEGACY_BRANCH_PATHS = new Set()` module-level memo. WARN cardinality test (`liftLegacyBranch` 3회 호출, 같은 sourcePath, stderr 1회). |

## PRD Audit Linkage

- **§85** Risk "`~/.claude` 글로벌 storage가 cross-repo contamination" → cwd emit + outside-root mask로 raw 누수 차단
- **§87** Risk "git-tracked receipt 파일 mtime + ownership_token_hash 비교" → branch invariant 강화가 같은 surface
- **§69** M1 ship note "session-ledger primitive" → validate() 강화 + lift로 active discovery 보존
- **§43** M2 metric "session transcript 정성 grep" → branch name STATE.md/logging inject 경로 grep noise 감소

## Next Steps

- [ ] `/mccp:code-review` 또는 `/mccp:prp-commit "v1.4.x patch — cwd mask + branch validation"` 후 `/mccp:pr`
- [ ] Cache directory 추적: PR merge 후 `claude plugin update`로 `~/.claude/plugins/cache/mccp/mccp/1.8.1/` 생성 확인 (이 cycle은 1.8.0이 이미 누락된 시점 — hot-fix axis 누적 중)
