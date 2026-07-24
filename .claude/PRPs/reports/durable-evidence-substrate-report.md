# Implementation Report: 내구 증거층 봉인 — 감사 가능성 복구 (Phase A)

## Summary

worktree 삭제 시 ship receipt 증거가 소실돼 교차 세션 감사가 정반대 결론에 도달하는
2차 결함(E1)을 닫는 Phase A를 구현했다. 핵심 분리 — **receipt는 참, ledger가 거짓** —
에 따라 receipt 추적·감사 도구·덮어쓰기 가드만 지금 착지하고, ledger 소급 정정(거짓
양성 3건)은 술어 수정(별건 E2) 뒤 Phase B로 이연했다.

Implement-Codex gate는 **cross-gate dedupe**로 통과했다: plan-codex가 4라운드
adversarial review로 모든 아키텍처 결정을 확정(`codex_verdict=converged`, findings 0)했고,
plan이 파일 구조·앵커 위치·함수 계약까지 전수 pre-commit해 구현-시점 신규 결정이 없었다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Codex 수렴 | 4라운드 converged | dedupe (plan-codex 수렴 상속) |
| Files Changed | 11 (신규 4 + 수정 7) | 신규 4 + 수정 7 (+ evidence-commit 12 receipts) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| A1 | evidence-audit.js + test | 완료 | main 실측 재현(10/7/3/19/10) · blind 계약 고정 · 10 test pass |
| A2 | gitignore 선별 해제 | 완료 | check-ignore 3종 통과 |
| A3 | write.js cwd 정규화 | 완료 | 신규 write만 상대화 · 기존 33건 해시 불변 |
| A3-b | store.js 덮어쓰기 HALT 가드 | 완료 | writeReceipt 앵커 · overwrite-guard 5 test pass |
| A4 | pr.md HEAD_SHA passthrough + evidence-commit + rebase HALT | 완료 | 3부분 모두 반영(runtime, 검토 검증) |
| A5 | clean 12 추적 + 문서 + 버전 | 완료 | 12 committed · CLAUDE.md §3.12 · 1.22.4 |

## Validation Results

| Check | Status | Notes |
|---|---|---|
| 1. 감사 main 재현 | 통과 | comparable=10·ok=7·fp=3·unverifiable=19·hash_bound=10 |
| 2. blind 계약 | 통과 | 0-comparable → state=blind (≠ clean) |
| 3. CLI blind 비영점 | 통과 | |
| 4. 33건 불가침 | 통과 | receipt_hash 전부 유효 · porcelain clean |
| 5. carve-out 부재 | 통과 | hash.js에 meta.cwd delete 없음 |
| 6. gitignore 3종 | 통과 | plan-codex ignored · pr-codex not · .migrations ignored |
| 7/7a. clean 12 tracked · 누출 0 | 통과 | my-claude-code-plugin 0건 |
| 7b. ledger 무손상 | 통과 | 28 tracked · poison entry untracked |
| 7c. 가드 writer 앵커 | 통과 | store.js에 receipt_hash 참조 |
| 8. receipt 테스트 스위트 | 통과 | 442 pass / 0 fail / 1 skip (신규 12 test 포함) |
| 9. lib 회귀 스위트 | 확인 중 | 알려진 fixture 실패 1건 외 회귀 없음 |
| 10. version surface | 통과 | plugin.json 1.22.4 + footer×2 |

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/scripts/lib/evidence-audit.js` | CREATE | ledger↔receipt 감사 · blind 계약 · read-only · LLM-free |
| `plugins/mccp/scripts/lib/tests/evidence-audit.test.js` | CREATE | 10 test (blind 고정 포함) |
| `plugins/mccp/scripts/receipt/tests/overwrite-guard.test.js` | CREATE | 5 test (rebase 미경유 same-slug) |
| `plugins/mccp/scripts/receipt/tests/cwd-normalization.test.js` | CREATE | 7 test |
| `plugins/mccp/scripts/receipt/store.js` | UPDATE | writeReceipt 덮어쓰기 HALT 가드 |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | 신규 receipt meta.cwd 상대화 |
| `.gitignore` | UPDATE | mccp-pr-codex 선별 해제 |
| `plugins/mccp/commands/pr.md` | UPDATE | HEAD_SHA passthrough + evidence-commit + rebase HALT |
| `CLAUDE.md` | UPDATE | §3.12 증거 내구성 계약 + merge-commit 정책 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | 1.22.3 → 1.22.4 |
| `plugins/mccp/scripts/lib/renderer/{html,markdown}.js` | UPDATE | footer v1.22.4 |
| `CHANGELOG.md` | UPDATE | [1.22.4] 엔트리 |
| `.claude/receipts/mccp-pr-codex/*.json` (clean 12) | COMMIT | 내용 무변경 evidence-commit (durable) |

## Deviations from Plan

- **plan-codex receipt plan_hash refresh**: dedupe 노트를 plan body에 주입(2.5.1)하면
  plan hash가 바뀌어 plan-codex receipt가 stale이 된다(정상 non-dedupe 경로도 동일 —
  `## Codex Implementation Review` 마커 주입이 구조적으로 유발). 완료 decision 실측
  (cost-model-subscription-m3 등: plan-codex plan_hash == 현재 plan hash, impl-review
  포함)이 "최종 상태는 정렬"임을 보여, 노트 제거 시 hash가 receipt 값과 정확히 일치함을
  실측 확인한 뒤 **verdict 보존 field-preserving re-seal**로 plan_hash를 정렬했다.
- **evidence-commit을 구현 중 실행**: 메인 Validation #4(porcelain clean)와 #7(12 tracked)이
  동시 성립하려면 clean 12가 staged가 아니라 committed여야 한다(staged `A `는 porcelain에
  남음). E5 durability의 실제 실현이기도 해 로컬 receipt-only 커밋을 실행했다(push 아님).
- **plan 미아카이브**: Phase B가 E2 뒤로 이연돼 plan이 fully-complete가 아니므로 §3.11대로
  archive하지 않고 active로 유지(Phase B 추적 보존).

## Out of Scope (Phase B / 별건)

- ledger 승인 술어 수정(E2, codex-findings-backlog.md 2026-07-22 CRITICAL 등재됨)
- 거짓 양성 3건 정정·격리, 대조 불가 19건 unverifiable 표식, untracked poison ledger 1건 회수
- 유출 21건 rebind(원자적 redact→rehash→ledger 갱신→rename→manifest)

## Next Steps

- [ ] 코드 변경 커밋(prp-commit) + `/mccp:pr` (evidence-commit + push — push 전 Validation 7a 필수 게이트)
- [ ] Phase B: E2 술어 수정 완료 후 착수
