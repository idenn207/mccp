# Implement-Codex 게이트 기록 — multi-session-work-loop M3

> **이 기록이 plan 본문이 아니라 여기 있는 이유**: `.claude/plans/multi-session-work-loop-m3.plan.md`는
> `mccp-plan-codex/multi-session-work-loop` receipt의 `plan_hash`(`sha256:aed680ac…`)로 **봉인**돼 있다.
> `/mccp:prp-implement` Phase 2.5.4가 지시하는 대로 리뷰 섹션을 plan 본문에 append하면 그 hash가 바뀌어
> 상류 receipt가 `stale`로 떨어지고, 그것을 되돌리려면 Plan-Codex가 본 적 없는 본문에 plan receipt를
> 재봉인해야 한다(§3.12 tamper 축). plan 본문은 Plan-Codex가 실제로 서명한 바이트 그대로 두고,
> implement 게이트 기록은 hash-anchored 아티팩트 **밖**에 둔다. Phase 2.5.6 Step A가 notes 경로를
> 명시적으로 허용하는 근거가 이것이다.
>
> Plan 원문 대조: `node <plugin>/scripts/receipt/cli.js hash-markdown .claude/plans/multi-session-work-loop-m3.plan.md`

## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2) + `--impeccable-available` (design-scope preamble)
- 실측: `classification=ok · blocking=false · durationMs=386674`(~6.4분). **Codex 실발화**. background + exit marker로 호출(codex `--timeout-ms 900000`이 Bash 도구 상한 600s를 초과)
- 라운드 수: **1** (`MCCP_GATE_ROUND_CAP` default). 아래 6건 전부 R1에서 완전 해소 가능 → escalate 조건 (b) 미충족
- 합치 결론: **needs-attention (No ship)** — `"the uncommitted plan decisions still have race and observability holes that can make B2 look computed while the primary guarantee is unproven"`. HIGH 4 + MEDIUM 2. **plan이 pre-commit하지 않은 implement-time 결정 10건(D1~D10)을 focus로 제시**했고 그중 D1(lock API 형태)·D8(gate CLI 정직성)이 각각 F3·F4로 확증됐다
- verdict 파생: `codex-review-payload#deriveGateVerdict` → `verdict=divergent · source=structured`(raw `needs-attention`). 흡수했다는 이유로 `converged`로 재작성하지 **않는다**

- YAGNI Triage:

  | Finding | Sev | Verdict | Why |
  |---|---|---|---|
  | F1 divergent fix-task가 해소 전에 applied로 표시됨 | HIGH | **REJECT (코드로 반증)** | Codex는 diff만 보고 `fix-task.md` 삭제를 "억제"로 읽었으나, 이는 `state-injector.js`(헤더 L5 `Rotates fix-task.md → fix-task-applied.md after inject`)의 **설계된 inject-후-rotate**다. 본 세션 SessionStart가 실제로 그 블록을 주입했고(컨텍스트에 존재), 지속 신호인 `escalate_pending: true` + `escalate_pending_decision_id: multi-session-work-loop`는 STATE.md에 **그대로 살아 있다**. 복원하면 매 세션 재주입 루프가 되어 mechanism과 싸운다 |
  | F2 claim **변형**이 gate별 lock에 직렬화되지 않음 | HIGH | **ACCEPT_NOW** | santa J1은 *생성* 원자성만 닫았다. stale 승계·`last_touch` 갱신·tombstone 기록은 slug 단위 mutation인데 evidence lock 키는 `(gate, slug)` → A가 `mccp-plan-codex/x`, B가 `mccp-implement-codex/x`를 쓰면 서로 다른 lock을 들고 **같은 stale claim을 둘 다 승계**한다. receipt write가 fence에 닿기 전에 G1·G2가 깨진다. 흡수: **모든 claim mutation을 per-slug claim lock(`<slug>.json.lock`)으로 감싼다**(생성만이 아니라) |
  | F3 caller-driven lock context가 fence를 조용히 우회 | HIGH | **ACCEPT_NOW** | D1 확증. `withEvidenceLock(target, fn, ctx)`가 base-hash 선조건·소유 재확인·post-rename 검증을 **caller 규율**에 맡기면, 승인 helper를 쓰면서 `assertOwned`를 빼먹은 caller가 정적 커버리지를 통과하고 guard 이벤트까지 emit하는데 lost-update 창이 재개방된다. writer 통합이 3곳이라 특히 위험. 흡수: **monolithic guarded API**(`guardedWrite`/`guardedReadModifyWrite`)가 capture→fence→rename→검증→emit 전 구간을 소유, raw lock context는 **private/test-only** |
  | F4 primary 축을 못 돌리는 CLI로 B2가 flip 가능 | HIGH | **ACCEPT_NOW** | D8 확증. primary falsifier가 런타임 변형 감사인데 acceptance 명령이 standalone `b2-coverage-gate.js --json`이다. 정적 lint만으로 `{ok:true}`가 나오면 **primary 축을 관측하지 않고** `computed`로 뒤집힌다. 흡수: `--json`은 **런타임 관측 아티팩트(사전/사후 스냅샷 + 상관된 guard 이벤트) 없이는 `ok:false`/indeterminate**를 반환하고, `computeB2`는 **런타임 감사 verdict에만** 종속. 정적 축은 secondary diagnostics |
  | F5 2점 heartbeat가 rename retry 창을 남김 | MED | **ACCEPT_NOW** | `writeFileAtomic`의 Windows `EPERM`/`EBUSY` bounded retry가 lease(5s)를 넘기면, pre-rename heartbeat 이후에도 B가 reclaim·commit하고 A가 뒤늦게 성공해 덮는다 — heartbeat가 좁히려던 바로 그 창. 흡수: **retry 루프 안에서 매 재시도 전 heartbeat + 소유 재확인**, 그리고 **총 retry 예산을 lease보다 마진 두고 하한**. rename을 lease 초과로 지연시키는 회귀 test 추가 |
  | F6 back-compat 이중 스캔에 안정적 dedupe 키 부재 | MED | **ACCEPT_NOW** | CL-5가 reader에게 구(cwd 상대)·신(repoRoot) 두 위치 스캔을 요구하는데 이벤트에 **id가 없다**. cwd가 repo root면 두 경로가 aliasing되고, 본문 전체로 dedupe하면 필드가 우연히 같은 **별개 이벤트가 붕괴**한다. 흡수: append 시 `event_id` 부여 + `ALLOWED_FIELDS` 등재 + **canonical realpath 기준 distinct 디렉토리만 스캔**. aliasing fixture와 "본문 동일하지만 별개 이벤트" fixture 양쪽 추가 |

- Deferred to backlog: **0** (`.claude/plans/codex-findings-backlog.md` append 없음)
- **Security-reviewer**: §2.5.5 catalog(auth/crypto/secrets/input validation/injection/SSRF/path traversal/privilege escalation) **미해당**으로 판정 — 본 변경은 단일 운영자 신뢰경계 안의 동시성·무결성 축이고, plan이 위협 모델에서 **적대적 위조자를 명시적 범위 밖**으로 선언한다. slug→경로 구성은 기존 `receiptPath`와 동일 신뢰 수준(내부 `derive-decision` 산출). fallback이 아니라 **미trigger**이므로 `security_skipped` flag는 세우지 않는다. 단 방어적으로 claim 파일 경로의 slug 정규화는 구현에 포함한다
- **Open Questions**: `divergent` — 6건 중 5건을 흡수하고 1건을 코드로 반증했으나 **그 흡수에 대한 Codex 재검증은 미획득**(R2 미실행, cap=1). 이 저장소의 반복 교훈("흡수가 새 결함을 낳는다" 5회 재현)상 자기평가를 신뢰하지 않는다. auto-CRITICAL 카테고리(비밀 노출·데이터 손실·비가역 마이그레이션·인증 우회·외부 전송·키 취급) 해당 **없음**. plan/implement 양 게이트가 `converged`가 아니므로 cross-gate dedupe가 fail-closed → **`/mccp:pr`에서 PR-Codex 실발화 보장**(dual-review 무손상)
- Codex session 참조: thread `019fd28c-5750-7bf3-9cd8-e0bcf221cc36`
