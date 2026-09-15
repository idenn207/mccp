# ci-full-suite M5 — Implement-Codex 게이트 기록

이 파일이 게이트 기록의 목적지인 이유는 하나다: `planAwareMarkdownHash`의 carve-out은
frontmatter 3키·체크박스·PR placeholder·표의 status 토큰뿐이고 **본문 산문은 해시에
들어간다**(`scripts/receipt/hash.js:93-176`). plan 본문에 이 섹션을 주입하면
`mccp-plan-codex/ci-full-suite-m5.json`의 `plan_hash`가 어긋나 `validate-cmd`가 그 receipt를
`stale`로 분류하고(`validate-cmd.js:376-387`), 이 사이클이 자기 게이트에 막힌다. M4가 그
경로를 이미 겪었다(`0530364`). `prp-implement` 2.5.4·2.5.6 Step A가 notes 경로를 대안으로
허용하므로 여기 쓴다 — plan 해시는 보존되고 재게이트도 추가 라운드도 없다.

## Codex Implementation Review

- 호출: `node /home/madsc/.claude/plugins/cache/mccp/mccp/1.33.6/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper)
- 라운드 수: 1 (cap 1 — `MCCP_GATE_ROUND_CAP=1` · 2.5.0에서 `mccp-implement-codex__ci-full-suite-m5`로 봉인)
- classification `ok` · `blocking=false` · durationMs 69495 · threadId `01a09e87-117b-78f1-a092-a48c5a3dde08`
- 리뷰어 verdict: `needs-attention` → `deriveGateVerdict` source=structured → **`divergent`**
- 합치 결론: V3 기대값 정정(`blocked`→`ready`)과 원문 부재 6건의 `open` 유지는 타당하다고 리뷰어가
  동의했다. 남은 지적은 Task 2 복구 절차의 동시 쓰기 보호와 V4의 실패 처리 두 축이고 둘 다 흡수했다.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — 재측정·백업이 checkout 사이의 동시 쓰기를 보호하지 못한다 | HIGH | ACCEPT_NOW | `checkout`은 파일 전체를 되돌리므로 c2 live 세션이 그 사이 append한 정당한 이벤트까지 지운다. registry는 잠금 없이 `O_APPEND`한다(`findings-registry.js:380-386`). 절차를 **식별된 77줄만 제거**로 바꾸고 비대상 이벤트 보존을 사후 단언한다 |
  | F2 — V4가 git 조회 실패를 잔재 부재로 판정한다 | MEDIUM | ACCEPT_NOW | §3.14는 MEDIUM을 backlog로 보내지만 이 건은 F1과 같은 축이다 — V4가 거짓 통과하면 F1 흡수를 확인할 방법이 없다. 동일 지적이 `codex-findings-backlog.md`의 2026-09-14 MEDIUM 행으로 이미 있어(plan-review L2 산출) 중복 append 대신 함께 흡수한다 |
- Deferred to backlog: 0 (F2의 동일 지적은 이미 등재돼 있다 — 새 행을 만들면 같은 지적이 두 줄이 된다)
- Open Questions: 없음 — 두 finding 모두 ACCEPT_NOW로 흡수했다
- Codex session 참조: threadId `01a09e87-117b-78f1-a092-a48c5a3dde08` · envelope `<git-dir>/mccp/tmp/codex-implement.json`

### F1 흡수 — Task 2 절차 교체 (plan Task 2 대체 절차)

plan Task 2의 `git checkout -- <16 shard>`를 쓰지 않는다. 대신:

1. 대상 이벤트(추가된 77줄)를 파일별로 스냅샷한다.
2. 각 shard를 읽어 **그 77줄과 정확히 일치하는 줄만** 제거하고 나머지는 보존한다(스냅샷 이후
   들어온 이벤트 포함).
3. 쓰기 직전에 파일을 다시 읽어 스냅샷과 대조한다. 새 줄이 생겼으면 **중단하고 보고**한다 —
   read-modify-write 경쟁 창을 남겨 두지 않는다.
4. 쓰기 후 각 파일이 "HEAD 버전 + (비대상 신규 이벤트)"와 같은지 단언한다.
5. 실행 전 diff patch와 marker를 scratchpad에 백업한다 — 실패 시 복원 경로.

잔여(PR-Codex R1 F1로 정정, 2026-09-15): 3단계 재판독과 재작성 사이에는 경쟁 창이 남는다.
registry writer가 잠금 없는 `O_APPEND`(`plugins/mccp/scripts/state/findings-registry.js:481`)라
그 창에 c2가 append한 이벤트는 재작성이 지우고, 그 이벤트는 기대 스냅샷에도 백업에도 없으므로
4단계 단언과 V4는 통과한다. 즉 이 절차는 그 창의 동시 쓰기 손실을 막지도 탐지하지도 못한다.
이전 판의 "3단계와 4단계 사이 append는 보존된다"는 거짓이었다. 실제 손실 여부는 미판정이며
`.claude/plans/codex-findings-backlog.md` 2026-09-15 HIGH 행이 소유한다.

### F2 흡수 — V4 교체 (plan Validation V4 대체 명령)

plan의 V4는 `test -z "$(git -C "$C2" status --porcelain …)"`이라 git이 실패해도 stdout이 비어
통과한다. 대체 명령은 (a) worktree 절대경로를 검증하고, (b) `git status`의 **종료코드를 먼저**
검사하며, (c) 출력을 변수에 담아 따로 판정한다. 조회 실패는 검증 실패다. 실행 결과는
`docs/ci-full-suite/m5-findings-closure.md`에 싣는다.

### Security Reviewer

해당 없음 — 이 사이클의 변경은 문서 2개 신규 + PRD 행 서술 정정이고, 코드 변경 0건이다.
auth·crypto·secret·입력 검증·injection·SSRF·경로 traversal·권한 상승 축에 닿지 않는다.
(Task 2의 파일 제거는 데이터 손실 축이고, 그 축은 위 F1이 다뤘다.)

### Design Review

`impeccable-detect --mode implement` → `skill_available=true` · `design_signal=false` ·
`silent_skip_reason=no-signal` · `signal_files=[]`. 렌더 표면 0건이라 critique retry loop ·
stage-aware routing · 2.5.5c grounding capture는 돌지 않는다. receipt에
`--impeccable-silent-skip --impeccable-silent-skip-reason "no-signal"`로 정직하게 싣는다.

## 이 사이클의 plan 대비 편차

| # | 편차 | 사유 |
|---|---|---|
| 1 | V3 기대값 `blocked` → `ready` | closure-accounting M2(PR #194)가 main에 머지되고 재봉인(`sealed_at 2026-09-08T08:25:23.521Z` · 2841건)이 대상 8건을 전부 포함한다(실측). 운영자가 2026-09-14 "main 병합 · dispose 적용 보류"를 선택했다 |
| 2 | dispose batch 8줄 → 2줄 | m1 santa CRITICAL 6건의 claim 원문이 `.claude/state/santa-loop/<slug>.json`에 있었고 그 경로가 `.gitignore:53`으로 무시돼 남지 않았다. plan Task 0 규칙대로 `open`이다 |
| 3 | Task 2 절차·V4 명령 교체 | 위 F1·F2 흡수 |
| 4 | plan 본문 미편집 | 위 해시 결속 때문. 편차는 이 파일과 증거 문서, Phase 5 보고서에 남는다 |
