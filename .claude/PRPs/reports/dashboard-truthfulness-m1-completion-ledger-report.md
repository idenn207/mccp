# Implementation Report: Dashboard Truthfulness M1 — 완료 이력 영속화 레지스터

## Summary

`/mccp:pr` 게이트 수렴(pr-codex receipt write) 직후, git-tracked **one-file-per-entry 디렉토리**(`.claude/state/completion-ledger/<id>.json`)에 완료 요약 1건을 append하는 epilogue를 구현했다. receipt는 gitignore + worktree-local이라 merge + `git worktree remove` 후 사라지지만(post-merge amnesia), 이 레지스터는 git-tracked라 살아남는다. derive 엔진에 `ledger` count-source를 추가하고 `milestone-history.js`가 live receipt 부재 시 이 레지스터를 durable history로 읽어 **"날짜 미상"을 해소**한다. 데이터 레이어 전용 — UI/렌더 마크업 변경 없음.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | ~20 (Files to Change) | 24 (signal 9 + test 7 + docs/version/changelog 4 + receipt write 1 + 기타) |
| 회귀 | 0 | 0 (4 affected suites green) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | completion-ledger store (one-file-per-entry, F2) | 완료 | session-ledger lock+atomic+strict validate 미러 |
| 2 | clean-tree git-safety gate (F1) | 완료 | `isLedgerAppendSafe` — allowlist에 `.claude/receipts/` 추가(아래 Deviations) |
| 3 | plan body Risks/OQ 스냅샷 추출 | 완료 | 기존 `parseRisks`/`parseOpenQuestions` 위 fail-open 추출기 |
| 4 | ledger facade (`triggerLedgerAppend`) | 완료 | briefing facade 미러, gate-gating + diagnostic skip stamp |
| 5 | hash carve-out + schema 필드 (F3) | 완료 | `ledger_write_skipped` 단일 diagnostic 필드 |
| 6 | write.js epilogue 와이어 | 완료 | briefing 다음, render-trigger 이전. e2e 통합 검증 통과 |
| 7 | derive ledger source | 완료 | count-source + index/model 등록, MODEL_VERSION v1 불변 |
| 8 | milestone-history ledger fallback (headline) | 완료 | live receipt → ledger → git time 사다리 |
| 9 | schema-surface 문서 | 완료 | §11 신규 + present-only 필드 행 |
| 10 | version bump + footer + CHANGELOG | 완료 | 1.18.2 → 1.18.3 (plugin.json + 양 footer + i18n 테스트) |
| 11 | PRD milestone 테이블 갱신 | 이미 충족 | plan 작성 시 M1 row가 이미 in-progress + plan 경로 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (require resolution / no-new-deps) | Pass | 신규 모듈 전부 `plugins/mccp/scripts/**` + built-in only |
| Unit Tests | Pass | completion-ledger 19, derive 74, renderer 387, receipt 397(+1 pre-existing skip) |
| Build | N/A | Node 프로젝트, build 단계 없음 |
| Integration | Pass | pr-codex receipt write fixture → ledger 항목 1건 생성(verdict/commit_sha/snapshot 정확) + F1 dirty-tree skip 동작 확인 |
| e2e smoke | Pass | `derive run --json` ledger source 노출 + `derive render` STATUS.md 재생성 |

## Files Changed

| File | Action | Notes |
|---|---|---|
| `scripts/lib/completion-ledger/store.js` | CREATED | store + git-safety |
| `scripts/lib/completion-ledger/index.js` | CREATED | facade |
| `scripts/lib/completion-ledger/tests/store.test.js` | CREATED | 12 tests |
| `scripts/lib/completion-ledger/tests/index.test.js` | CREATED | 7 tests |
| `scripts/derive/sources/ledger.js` | CREATED | count-source |
| `scripts/derive/tests/ledger-source.test.js` | CREATED | 5 tests |
| `scripts/receipt/tests/hash-ledger-exclusion.test.js` | CREATED | 5 carve-out/schema tests |
| `scripts/receipt/hash.js` | UPDATED | carve-out `ledger_write_skipped` |
| `scripts/receipt/schema.js` | UPDATED | present-only validation |
| `scripts/receipt/write.js` | UPDATED | epilogue wire |
| `scripts/derive/index.js` · `model.js` | UPDATED | source 등록 + validateShape |
| `scripts/derive/tests/schema-drift.test.js` | UPDATED | ledger drift guard |
| `scripts/lib/renderer/parsers/plan-body.js` | UPDATED | `extractRisksAndOpenQuestions` |
| `scripts/lib/renderer/sections/milestone-history.js` | UPDATED | `pickLedgerEntry` fallback |
| `scripts/lib/renderer/tests/{milestone-history,plan-body-parser,i18n-surface}.test.js` | UPDATED | headline 회귀 + 스냅샷 + footer 버전 |
| `scripts/lib/renderer/{html,markdown}.js` | UPDATED | footer v1.18.3 |
| `.claude-plugin/plugin.json` | UPDATED | 1.18.2 → 1.18.3 |
| `docs/v1.3.0-observability/schema-surface.md` | UPDATED | §11 + 필드 행 |
| `CHANGELOG.md` | UPDATED | 1.18.3 row |

## Deviations from Plan

1. **git-safety allowlist에 `.claude/receipts/` 추가** (plan은 3개 enumerate, 4개로 확장). 근거: receipt-write epilogue가 ledger facade **이전에** receipt 파일을 `.claude/receipts/`에 persist한다. 실제 mccp repo에선 receipts가 gitignore라 `git status --porcelain`에 안 보이지만(no-op), 그렇지 않은 환경/통합 테스트에선 방금 쓴 receipt가 트리를 dirty로 만들어 append를 false-skip시킨다. receipts는 completion-ledger/STATE.md/cache와 동일한 worktree-local ephemera 범주이므로 F1 원칙("mccp 자체 bookkeeping은 dirty로 치지 않음") 범위 내 hardening. 통합 테스트가 이 결함을 검출했고 수정으로 e2e green.
2. **plan 아카이빙 생략**: 일반 prp-implement Phase 5는 plan을 `completed/`로 이동하지만, mccp 게이트 체인(`/mccp:pr`이 plan을 validate)과 이 repo의 dashboard-cycle 관행(console-redesign/pipeline-chart plans 모두 `.claude/plans/` 유지)에 따라 plan을 제자리에 둔다.
3. **PRD M1 row를 complete로 올리지 않음**: M1은 PR merge 시점에 ship된다. implement 단계에서 complete 표기는 조기. in-progress 유지(정직 표기).

## Next Steps

- [ ] `/mccp:prp-commit` — 변경 커밋
- [ ] `/mccp:pr` — pr-codex 게이트 통과 후 PR 생성 (PR 시 첫 ledger 항목 생성 — dogfood)
- [ ] PR merge 후 PRD M1 row → complete
