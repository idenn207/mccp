# orchestrator-step-wiring M4 — implement gate notes

plan: `.claude/plans/orchestrator-step-wiring-m4.plan.md`

이 섹션을 plan 본문이 아니라 여기에 둔 이유: `receipt/hash.js`에는 섹션 carve-out이 없어 plan에
`## Codex Implementation Review`를 넣으면 `plan_hash`가 바뀌고, 방금 봉인한
`mccp-plan-codex/orchestrator-step-wiring-m4.json`이 stale이 되어 2.5.7 validate가 Phase 3 진입을 막는다.
plan 이연 표의 "prp-implement 2.5.4가 plan receipt를 구조적으로 stale화" 결함과 같은 축이다.

## plan receipt 경위

- plan 게이트(hybrid · 캡 1/1): L1 converged · L2 converged(4/4) · L3 Codex divergent. 리뷰 시점 해시
  `sha256:4284fe…`, 이후 Gate Record·L3-F1 반영으로 현재 `sha256:352e84…` → DD13 가드가 hybrid proof 봉인을 거부.
- 사용자 결정(2026-09-14): `MCCP_SKIP_INTENT_GATE` audited override + `--codex-verdict divergent`(`--review-mode` 없음).
  전역 규칙의 해당 금지 조항을 이 decision에 한해 사용자가 해제했다.
  - override만 쓰면 `resolveEffectiveVerdict` axis=none → `isConvergedVerdict=true`로 읽혀 converged 위장이 된다(실측).
  - 봉인 결과: `codex_verdict=divergent` · `intent_gate_verdict=incomplete` · `intent_gate_force_override=true`.
    dedupe는 닫혀 있으므로 `/mccp:pr`에서 PR-Codex가 발화한다.

## Codex Implementation Review

- 호출: `node /home/madsc/.claude/plugins/cache/mccp/mccp/1.33.6/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (캡 1, `mccp-implement-codex__orchestrator-step-wiring-m4`)
- 합치 결론: 결정 (1)(3)(4)(5)(6)은 지적 없음. 결정 (2) 격리 스니펫이 no-clobber를 주장만 하고 코드로 갖지 않는다 — 구현에서 흡수.
- raw verdict: `needs-attention` (structured) → gate verdict `divergent`
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 격리가 기존 격리본을 덮어쓴다 (`plan:190-191` `renameSync`) | HIGH | ACCEPT_NOW | Task 2 실행 스니펫을 `fs.linkSync`(대상 존재 시 EEXIST로 원자 실패) → 원본 unlink로 바꾸고, 대상이 이미 있으면 exit 1. plan L3-F2와 같은 축이라 R1 안에서 완결 |
- Deferred to backlog: 0
- Open Questions: 없음 (F1은 R1 흡수로 해소 — escalate 불요)
- Codex session 참조: envelope `$(git rev-parse --git-dir)/mccp/tmp/implement-codex-m4.json` (durationMs 48354)

### Security Reviewer

`mccp:security-reviewer` (read-only, Task 1·2·4·5 대상) — **HIGH/CRITICAL 0건.**

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| Task 2 `renameSync`가 기존 격리본을 덮는다 | MEDIUM | 흡수 (Codex F1과 동일) | 위 F1 처분 그대로 |
| `RESIDUAL_CONTROL_RE`(`plugins/mccp/scripts/lib/work-orchestrator.js:278`)가 U+2028/U+2029 미포함 | LOW | DEFER_TO_BACKLOG | `chain_progress`는 `JSON.stringify` 한 줄로 직렬화돼(`state-writer.js:318-322`) 구조 파괴 불가. `sanitizeField` 동일 계열 기존 부채 |
| Task 5 catch가 `resolved` 대신 `process.cwd()`를 root로 씀 | LOW | DEFER_TO_BACKLOG | 오판 방향이 과잉 마스킹뿐이라 누출 없음. plan Mirror(`work-orchestrator.js:639-646`) 그대로 둔다 |

Task 1 잔존 누출 경로 없음 확인: `receipt-prompt.js:233-238` → `msw-events.js:472-473`이 `opts.repoRoot`를 최우선으로 쓰고 강등 분기도 같은 root를 쓴다.
