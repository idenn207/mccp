# Implementation Report: v1.5.0-m1 Multi-Session Continuity Primitive

## Summary

PRD `.claude/prds/v1-4-0-multi-session-first-class.prd.md`의 M1 milestone — per-session JSON ledger 디렉토리를 신설해 cross-worktree 활성 세션 발견의 단일 진실 원천으로 삼는 primitive를 출시. STATE.md frontmatter는 변경 없음 (Codex Implement R1 F2 absorption). Default scope는 global (`~/.local/share/ecc-homunculus/projects/<projectId>/.session-ledgers/`), repo opt-in + hybrid 모드 지원. derive engine `sources/state.js`에 scope-aware `listLedgers({activeOnly:true})` 호출 추가로 `item.active_session_ledgers` surface.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Confidence | High (R1 absorption converged) | Confirmed — 25 신규 + 178 기존 회귀 모두 green |
| Files Changed | 12 (CREATE + UPDATE) | 12 + 2 absorption-triggered (backlog 1줄 append + plan body amend) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | session-ledger.js 모듈 + schema | Complete | 10-field v1 schema + 5개 public API |
| 1b | session-ledger 단위 테스트 | Complete | 16/16 green (round-trip / scope / TTL / namespace) |
| ~~2~~ | ~~STATE.md frontmatter anchor 2 fields~~ | DROPPED | Codex Implement R1 F2 absorption — hash-skip 분기와 git-clean 양립 불가 구조적 모순 |
| ~~2b~~ | ~~state-writer 테스트 확장~~ | DROPPED | 동상 |
| 3 | SessionStart hook ledger 생성 | Complete | observer-lease 등록 직후 createLedger 호출, loud fail-open |
| 4 | SessionEnd hook ledger finalize | Complete | process.exit(0) 직전 finalizeLedger 호출 |
| 5 | derive sources/state.js scope-aware | Complete | `collectActiveSessionLedgers` 헬퍼 + `item.active_session_ledgers` surface |
| 5b | derive state-source 테스트 | Complete | 9/9 green (F2/F3 absorption 검증 포함) |
| 6 | 문서 3건 | Complete | session-ledger-schema.md + state-md-narrowing.md + schema-surface.md §8 신설 |
| 7 | plugin.json + CHANGELOG + .gitignore | Complete | 1.4.1 → 1.5.0 minor bump |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | Pass | `node -c` 모든 신규/변경 파일 OK |
| Unit Tests (state) | Pass | 160/160 (이전 144 + 신규 16) |
| Unit Tests (derive) | Pass | 43/43 (이전 34 + 신규 9) |
| Build | N/A | Node.js project — no compile step |
| Integration (derive CLI) | Pass | `derive/cli.js run --json`이 `sources.state.item.active_session_ledgers: []` surface, `degraded:false` |
| Integration (renderer) | Pass | `derive/cli.js render` 정상, STATUS.md 무회귀 (M3 surface는 M1 변경 무시) |
| Edge Cases | Pass | TTL cutoff (25h → 제외) / corrupt JSON → degraded=true / hybrid dedupe / namespace isolation / minimum-spec mode (sessionId 빈 문자열 silent skip) |

## Codex Implementation Review

- Round 1, classification=ok, durationMs=299599
- 4 findings (3 HIGH + 1 MEDIUM) 모두 plan body 재구성으로 absorb:
  - **F1 HIGH** — Ledger namespace collision with `.observer-sessions/<sessionId>.json` lease files → ACCEPT_NOW: 새 namespace `.session-ledgers/` 격리
  - **F2 HIGH** — STATE.md anchor 영구화 + git-clean 양립 불가 구조적 모순 → ACCEPT_NOW: anchor 자체 도입 안 함, discovery surface는 ledger 디렉토리 scan 단일화
  - **F3 HIGH** — derive sources/state.js hardcoded repo path → ACCEPT_NOW: `listLedgers({activeOnly:true})` scope-aware 호출
  - **F4 MEDIUM** — crash-orphan ledger 영구 active surface → ACCEPT_NOW (partial M1: 24h TTL cutoff) + DEFER_TO_BACKLOG (M2 heartbeat 기반 정확 reclaim)
- Deferred to backlog: 1 entry (`.claude/plans/codex-findings-backlog.md`에 2026-06-19 MEDIUM 추가)
- Open Questions: 없음
- Codex thread: `019ede9f-1de7-70b2-b8b4-ece2583c53aa`

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/state/session-ledger.js` | CREATED | +325 |
| `plugins/mccp/scripts/state/tests/session-ledger.test.js` | CREATED | +220 |
| `plugins/mccp/scripts/derive/sources/state.js` | UPDATED | +50 / -10 |
| `plugins/mccp/scripts/derive/tests/state-source.test.js` | CREATED | +175 |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATED | +35 |
| `plugins/mccp/scripts/hooks/session-end.js` | UPDATED | +22 |
| `docs/v1.4.0-multi-session/session-ledger-schema.md` | CREATED | +130 |
| `docs/v1.4.0-multi-session/state-md-narrowing.md` | CREATED | +95 |
| `docs/v1.3.0-observability/schema-surface.md` | UPDATED | +10 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | +1 / -1 |
| `CHANGELOG.md` | UPDATED | +20 |
| `.gitignore` | UPDATED | +6 |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | +1 (F4 deferred entry) |
| `.claude/plans/v1-4-0-multi-session-m1-continuity-primitive.plan.md` | AMENDED + ARCHIVED | R1 absorption + final form |

## Deviations from Plan

Codex Implementation R1 F1/F2/F3 absorption은 plan body 재구성 형태로 적용 (Phase 2.5.4 protocol mirror). 주요 deviation:

- **Task 2 + 2b 전체 drop**: STATE.md frontmatter에 anchor 2 fields 추가 + HASH_EXCLUDE 확장 방안은 state-writer.update의 hash-match skip 분기와 양립 불가 (state-writer.js:580-584 read-verified). discovery surface를 ledger 디렉토리 scan 단일화. 결과적으로 STATE.md schema 변경 0 hunk, plan scope 축소.
- **Namespace `.session-ledgers/` 격리** (Task 1): 원래 plan은 `.observer-sessions/<sessionId>.json` 재사용을 명시했으나 observer-sessions.js:124가 같은 경로 + 파일명을 lease로 이미 사용. 별도 subdir 도입으로 collision 0건.
- **derive scope-aware 호출** (Task 5): 원래 plan은 `<repo>/.claude/state/sessions/` 하드코드 스캔이었으나, global default ledger 미소비 문제 발생 → `listLedgers({activeOnly:true})` 호출로 통일.
- **24h TTL cutoff** (Task 1, F4 partial): crash-orphan ledger 영구 active 방지를 위해 `listLedgers({activeOnly:true})`에 `activeTtlMs=86_400_000` default 추가. M2 heartbeat 기반 정확 reclaim은 `.claude/plans/codex-findings-backlog.md`로 backlog.

## Issues Encountered

1. `validate()` schema regex `^[0-9a-f]{1,64}$`가 너무 엄격해 fake projectContext 테스트(`project_id: 'state-source-test'`) + `createLedger`의 fallback `'global'` literal 모두 reject — `^[a-z0-9_-]{1,64}$`로 완화. 실제 producer의 hex output은 그대로 포함.
2. `node --test <dir>` Windows에서 디렉토리 인자 해석 실패 — `find ... -name "*.test.js" | xargs node --test`로 명시 enumerate.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/state/tests/session-ledger.test.js` | 16 | scope resolution / round-trip / schema reject / TTL cutoff / hybrid dedupe / namespace isolation / canonical field names |
| `plugins/mccp/scripts/derive/tests/state-source.test.js` | 9 | derive surface / F2 absorption (no anchor) / F3 absorption (scope-aware) / TTL filtering / corrupt JSON degraded flag |

## Next Steps

- [ ] `/mccp:code-review` 통과 확인
- [ ] `/mccp:pr` 통한 PR 생성 — PR 본문에 4 Open Questions 결정 사유 + PRD `Open Questions` 섹션 amend lock-in
- [ ] PR merge 후 `claude plugin update` → `~/.claude/plugins/cache/mccp/mccp/1.5.0/` 디렉토리 생성 확인 (CLAUDE.md §3.7 hot-fix 절차)
- [ ] Manual dogfood: 2개 worktree 병렬 cycle — ledger 2건 생성 + git status에 STATE.md 변경 없음 + PR squash merge 후 다른 worktree 컨텍스트 0건 손실 검증
- [ ] M2 plan 작성: SessionStart hook 단계 다른 worktree active session 표면화 + heartbeat 기반 정확 reclaim (F4 deferred portion)
