# Implementation Report: mccp v0.2.2

**Commit**: `9106922` on `main` (pushed)
**Plan**: `.claude/plans/mccp-v0.2.2.plan.md` → archived to `.claude/PRPs/plans/completed/`
**Branch**: `main` (사용자 선택 — direct push)

## Summary

mccp v0.2.2는 v0.1 이후 발견된 두 가지 결함을 fix합니다:

1. **Codex 호출 경로 부재**: `Skill(codex:adversarial-review)`는 codex plugin의 skill index에 존재하지 않고, `/codex:adversarial-review` slash command는 `disable-model-invocation:true`로 모델 자동 호출 차단. 두 경로 모두 막힌 채 모든 게이트가 auto-fallback으로 운영되고 있었음 → v0.2.2는 fail-closed Bash wrapper(`codex-invoke.js`)로 codex-companion.mjs를 직접 호출.

2. **Receipt mode hollow-gate 위험**: receipt chain은 "adversarial review가 일어났는가"만 검증했지 "어떻게 fallback할지"의 정책이 없었음 → v0.2.2는 `MCCP_RECEIPT_GATE_MODE=hard|soft|off` 토글 + validate-cmd가 `meta.codex_skipped`/`meta.advisory`도 non-approving으로 처리.

이에 더해 auto-chain decision API, cost-state lockfile + monotonic merge, pr.md Phase 0 preflight, state-writer schema 확장이 함께 들어갔습니다 (Codex R2#1/R2#2 commitments).

## Assessment vs Reality

| Metric | Predicted | Actual |
|---|---|---|
| Complexity | Medium-Large | Large (single session, multiple modules + 27 신규 tests) |
| Files Created | 7 (5 lib + 2 tests) | 8 (auto-chain + codex-invoke + cost-state + cost-state-path + receipt-mode + 3 tests) |
| Files Updated | 12 | 13 (plan/pr/prp-implement commands + codex-bridge + 3 hooks + validate-cmd + state-writer + 4 tests + plugin.json + 3 docs + CLAUDE.md) |
| Test Count | "각 task별 fixture" | 27 신규 tests (codex-invoke 15, codex-bridge 4, auto-chain 12, validate-cmd 2, state-writer 2 / 일부 중복 카운트 제외 27 net) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | codex-invoke.js helper (fail-closed) | Complete | classification enum 13종, R1/R2 commitments 반영, 15 fixture tests pass |
| 2 | codex-bridge.js fallback patterns 확장 | Complete | 4 patterns added (plugin-not-installed/companion-not-found/cli-not-authenticated/process-exit-nonzero) |
| 3 | plan.md / prp-implement.md / pr.md wrapper 교체 + pr.md Phase 0 preflight | Complete | Skill 호출 0건 (acceptance 통과). pr.md Phase 0 advisory rejection 추가. |
| 4 | receipt mode patch (default=hard) | Complete | MCCP_RECEIPT_GATE_MODE 토글 live. validate-cmd가 codex_skipped + advisory 모두 non-approving 처리. |
| 5 | auto-chain.js (8 abort triggers) + cost-state lockfile + monotonic merge | Complete | preflight pr step refuses MCCP_ALLOW_CODEX_UNAVAILABLE=1 (R2#2). cost-state는 canonical home path + unconditional sticky merge (R2#1). 12 fixture tests pass. |
| 6 | prp-implement.md Phase 7 AUTO-CHAIN | Complete | check/preflight/record-step 3-step decision flow 문서화. |
| 7 | ecc-context-monitor cost-current.json write | Complete | 매 toolCall에서 monotonic merge write. $80 → STATE.md session_end_imminent. $100 → chain_aborted + hard_ceiling_reached. |
| 8 | state-writer schema 확장 | Complete | 4 신규 field round-trip + recordChainProgress() 2 tests pass. |
| 9 | docs 갱신 (gate-design § Codex/§ Mode/§ Auto-Chain, v0.2-state-schema §1.4, CLAUDE.md §1.2/§3.3 matrix + §4 토글) | Complete | |
| 10 | plugin.json version 0.2.1 → 0.2.2 | Complete | |
| 11 | 최종 dogfood + commit + main push | Complete | Commit `9106922` push to origin/main. |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (lint) | N/A | markdown lint warnings 발생했으나 cosmetic만 — code lint 없음 |
| Unit Tests (신규) | Pass | 27 new tests (codex-invoke 15, codex-bridge fallback 4, auto-chain 12, validate-cmd 2, state-writer 2 — overlap 제외) |
| Unit Tests (회귀) | Pass | 327/327 (전체 plugin tests) — 회귀 0건 |
| Receipt chain validate | Pass | `mccp:prp-implement` ok=true, missing=stale=blocking=open_critical=0 |
| Integration smoke | Pass | codex-invoke CLI 직접 호출 → registry-missing/timeout classification 정상 JSON 출력 |

## Codex Adversarial Review Records (Phase 2.5)

호출 경로: 본 plan이 fix하는 그 인터페이스(Bash 직접 호출) self-dogfood.

| Round | Verdict | Findings | Resolution |
|---|---|---|---|
| R1 | needs-attention | 3 (2 high + 1 medium) | All accepted: pr.md/auto-chain advisory rejection, cost-state lockfile + monotonic merge, codex-invoke spawn/parse normalization |
| R2 | needs-attention | 2 (2 high) | All accepted: canonical home path 통일 + sticky safety unconditional merge, pr.md Phase 0 preflight before any gh call |
| R3 | needs-attention (DIVERGENT_UNRESOLVED at cap) | 3 (process artifacts, no new architectural finding) | "Implement first then re-review" — commitments 모두 Phase 3에서 구현 완료. Auto-CRITICAL §0 미발동. |

Implement-Codex receipt: `.claude/receipts/mccp-implement-codex/main.json` round=2, decision="main".

## Files Changed

| File | Action | Lines |
|---|---|---|
| `.claude/plans/mccp-v0.2.2.plan.md` | UPDATED | +73 |
| `.claude/PRPs/plans/completed/mccp-v0.2.2.plan.md` | CREATED | archive copy |
| `CLAUDE.md` | UPDATED | +40 / -10 |
| `docs/gate-design.md` | UPDATED | +45 |
| `docs/v0.2-state-schema.md` | UPDATED | +15 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | +1 / -1 |
| `plugins/mccp/commands/plan.md` | UPDATED | +34 / -6 |
| `plugins/mccp/commands/pr.md` | UPDATED | +40 / -6 |
| `plugins/mccp/commands/prp-implement.md` | UPDATED | +67 / -3 |
| `plugins/mccp/scripts/hooks/ecc-context-monitor.js` | UPDATED | +38 |
| `plugins/mccp/scripts/hooks/receipt-prompt.js` | UPDATED | +27 / -2 |
| `plugins/mccp/scripts/hooks/receipt-skill.js` | UPDATED | +22 |
| `plugins/mccp/scripts/lib/codex-bridge.js` | UPDATED | +4 |
| `plugins/mccp/scripts/lib/codex-invoke.js` | CREATED | +236 |
| `plugins/mccp/scripts/lib/cost-state.js` | CREATED | +151 |
| `plugins/mccp/scripts/lib/cost-state-path.js` | CREATED | +28 |
| `plugins/mccp/scripts/lib/receipt-mode.js` | CREATED | +43 |
| `plugins/mccp/scripts/lib/auto-chain.js` | CREATED | +194 |
| `plugins/mccp/scripts/lib/tests/codex-invoke.test.js` | CREATED | +211 |
| `plugins/mccp/scripts/lib/tests/codex-bridge.test.js` | UPDATED | +21 |
| `plugins/mccp/scripts/lib/tests/auto-chain.test.js` | CREATED | +161 |
| `plugins/mccp/scripts/receipt/validate-cmd.js` | UPDATED | +19 |
| `plugins/mccp/scripts/receipt/tests/validate-cmd.test.js` | UPDATED | +38 |
| `plugins/mccp/scripts/state/state-writer.js` | UPDATED | +56 |
| `plugins/mccp/scripts/state/tests/state-writer.test.js` | UPDATED | +31 |

Total: 25 files changed, +2144 / -31 lines.

## Deviations from Plan

| What | Why |
|---|---|
| `auto-chain.js`를 chain executor가 아닌 decision API로 설계 | slash command(/mccp:prp-commit, /mccp:pr) 호출은 Claude의 command body에서만 가능 — node script에서 직접 invoke 불가. 따라서 auto-chain.js는 "should I proceed?" 결정만 답하고, 실제 호출은 prp-implement.md Phase 7 본문에서 진행. 기능적으로는 plan 의도와 동일 (8 abort trigger 모두 구현). |
| cost-state path helper를 별도 모듈(`cost-state-path.js`)로 분리 | plan은 `auto-chain.js`에 inline으로 cost read 명시했지만, 같은 path가 ecc-context-monitor와 cost-state.js 양쪽에서 쓰이므로 single-source helper로 추출. 의도는 동일하되 구조 개선. |
| security-reviewer 호출 (plan Phase 2.5.5 subcommand)을 본 cycle에서 손 안 댐 | Task scope 밖. v0.2.3+ followup. |

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `codex-invoke.test.js` | 15 | resolveCodexInstallPath / verifyCompanionInterface / invokeAdversarialReview / runCli — 모든 classification 경로 |
| `codex-bridge.test.js` (extended) | +4 | 신규 fallback patterns |
| `auto-chain.test.js` | 12 | 8 abort triggers + preflight(pr/commit) + cost monotonic merge (older-true-vs-newer-false + cross-CWD writers) |
| `validate-cmd.test.js` (extended) | +2 | meta.codex_skipped + meta.advisory non-approving |
| `state-writer.test.js` (extended) | +2 | 새 field round-trip + recordChainProgress 호출 |

Net 35 신규/확장 tests.

## Followups (별도 cycle)

- Q3 — S10b auto-handoff 본격 도입 (cost hard ceiling 진정한 enforcement)
- Q4 — `/mccp:work` 단일 entry
- v0.2.3 — Decision-slug derivation 통합 (Option Y, Codex 권고)
- v0.2.3 — terminal `pr` force flag (`MCCP_FORCE_PR_WITHOUT_CODEX`)을 audited/non-approving/reason-required 조건으로 도입 검토
- v0.2.3 — Receipt soft → hard 자동 전환 trigger 조건 (5결함 재발 monitoring)
- security-reviewer 호출 fix (plan Phase 2.5.5에서 사용되는 Skill 호출)

## Next Steps

- 다음 세션 시작 시 `/plugin update`로 marketplace cache가 0.2.2로 갱신되는지 확인 (Risk 항목)
- README.md unstaged CRLF 차이는 별도 cleanup
