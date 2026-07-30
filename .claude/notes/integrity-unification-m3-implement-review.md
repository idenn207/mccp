# Implement-Codex Review — integrity-unification M3 (audit notes)

> Moved out of the plan body to keep the plan_hash pristine (== plan-codex receipt). The receipt is the mechanical anchor; this file is the human audit trail.

## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, cross-model GPT-5.x). 환경 companion이 R0 probe에선 timeout이었으나 실 review는 정상 작동(라운드당 ~8분).
- 라운드 수: 4 (R1→R4, 각 라운드 실코드 재현 검증 후 흡수 — 액면 수용 아님)
- 합치 결론: **core 무결성(non-approving mechanical hard-stop)의 fail-open 구멍 5건을 4라운드에 걸쳐 전부 fail-closed로 흡수. 잔여 1건(F6 dedupe-proof 재검증)은 후속 milestone 규모라 DEFER_TO_BACKLOG. 최종 raw verdict = needs-attention(divergent) — §3.12 dogfood대로 divergent 봉인(dedupe fail-closes → M3 코드가 PR-Codex를 실제로 받음).**
- YAGNI Triage:
  | Finding | Round | Severity | Verdict | Why |
  |---|---|---|---|---|
  | F1 missing-receipt fail-open (validate null→no-op, ok=true) | R1 | HIGH | ACCEPT_NOW | `ship-gate-receipt-missing` blocking으로 fail-closed (57011a0) |
  | F2 unproven-skip ships (proof 마커 없는 skipped) | R1 | HIGH | ACCEPT_NOW | `deriveShipDecision`이 proof 마커 요구, 부재 시 `skipped-unproven` (57011a0) |
  | F3 finalize primary가 무결성 미검증 후 verdict 신뢰 | R2 | HIGH | ACCEPT_NOW | finalize가 schema+subject+receipt hash 검증 후 판정 (0b3c787) |
  | F4 self-gate가 write에 미bind (stale converged 인증) | R2 | HIGH | ACCEPT_NOW | 양 locus가 `head_sha==current HEAD` staleness 체크 (0b3c787) |
  | F5 same-head receipt swap이 head/self-consistency 통과 | R3 | HIGH | ACCEPT_NOW | 정확한 sealed `receipt_hash` write-binding (finalize) + read-back `--expected-receipt-hash` (c4a7d88) |
  | F6 dedupe skip proof가 ship gate에서 미재검증 | R4 | HIGH | DEFER_TO_BACKLOG | upstream `evaluateForDedupe`(v1.20.3 fail-closed)가 이미 검증 · exploit은 FS 위조(위협모델 밖) · 완전 fix(sealed verifiable dedupe proof)는 후속 milestone |
- Deferred to backlog: 1 → `.claude/plans/codex-findings-backlog.md` (2026-07-30 HIGH F6)
- Open Questions: F6 — severity HIGH (defense-in-depth, DEFER; M3 core 범위 밖 — auto-CRITICAL 아님)
- Codex session 참조: R1~R4 background tasks (bf1pmhs5b / b03qt7t2b / bj9oib4pl / bncl4q781)

### Security Reviewer

> security-reviewer 미필요(non-§0 surface): 변경은 receipt/gate 무결성 로직으로 §0 카테고리(auth/authz·session/token·crypto-key·secret/credential·input-validation·SQL/cmd-injection·SSRF·path-traversal·privilege-escalation) 표면 부재. 보안-인접(enforcement 메커니즘)이나 §0 아님. tamper/forge/swap/stale/unproven 공격면은 Codex adversarial review 4라운드가 cross-model로 이미 정밀 검증. `--security-skipped` 미forward(blocking fallback 아님).

### Design Review

> impeccable: design surface 부재(footer version-string sync + backend schema 필드). critique CONVERGED (round 1). rendered design 변경 없음.
