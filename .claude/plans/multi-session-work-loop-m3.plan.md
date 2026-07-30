# Plan: Multi-Session Work Loop — M3 (증거 충돌 소거)

**Source PRD**: `.claude/prds/multi-session-work-loop.prd.md`
**Selected Milestone**: M3 — 증거 충돌 소거
**Complexity**: Large

## Summary

M3은 게이트 증거(receipt)가 세션 간에 조용히 덮이는 경로를 **구조적으로** 닫고, 같은 작업 단위를 두 세션이 동시에 잡는 상황을 감지·차단한다. grounding 결과 PRD의 "동시 쓰기 보호 없음"은 실제보다 **더 나쁘다** — `store.js#writeReceipt`(L149-156)는 lock이 없는 것에 더해 **원자성도 없다**(`fs.writeFileSync` 최종 경로 직접 write). 게다가 `assertNoTrackedOverwrite`는 read-then-write TOCTOU이고, 그 보호는 **git-tracked ship receipt에만** 적용돼 실제 대다수인 plan/implement receipt는 완전 무보호다. read-modify-write 하는 writer가 store 밖에 **둘 더** 있다(`briefing/index.js:69`, `completion-ledger/index.js:87`) — 전형적 lost update 삼중 경로.

따라서 M3은 (1) receipt write를 **fail-closed 짧은 임계구역 + 원자 rename**으로 감싸 lost update·torn read를 불가능하게 하고, (2) 작업 단위(=decision slug) **점유 레지스트리 + claim epoch fencing**을 도입하고, (3) M2가 "live collision producer 부재"로 `forward-only` 강등한 **B2를 반증 가능한 coverage gate 뒤에서 산출 가능하게** 만든다. (3)이 M3의 기계적 수용 증거다 — 코드 존재가 아니라 지표가 `computed`로 뒤집히는 것이 완료 판정이며, gate가 실패하면 정직하게 `forward-only`로 남는다.

### 보증 범위 (santa-loop R1 확정 — 이 문구가 plan 전체의 단일 기준)

M3이 보증하는 것은 정확히 셋이다. 이 목록 밖의 표현은 plan 어디에도 쓰지 않는다.

| # | 보증 | 메커니즘 |
|---|---|---|
| G1 | **live 세션 간 동일 작업 단위 중복 점유 불가** | claim 레지스트리 + **암묵 claim-on-first-write**(lock 안, fence 판정 이전) → "미claim" 상태가 최초 write 1회로 소멸하므로 standalone ingress도 fence 안으로 들어온다 |
| G2 | **stale·부활 holder의 write-time 거부** | **`{session_id, host, session_pid}`** 3원소 holder 대조(전부 `cli.js` 재실행에 안정 — OQ-1) + 승계 시 기록되는 tombstone(TTL 창 안) |
| G3 | **모든 덮어쓰기는 보고되거나 감사에서 검출된다** | heartbeat 연장 lease → post-rename **소유 재확인** → `evidence_overwrite_observed` + fail-closed throw · **그 보고가 실패해도**(OQ-2: 덮어쓴 쪽이 rename 직후 crash) **B2 런타임 감사가 pre-hash 불일치로 독립 검출** |

**G3의 문구는 santa R2에서 두 번째로 정정됐다(J2).** round 1의 "어떤 증거 손실도 조용히 지나가지 않는다"도 **여전히 거짓**이었다 — Reviewer B가 정확한 순서를 지적했다: post-rename 검증은 *내가 덮인* 경우를 잡지만, 위험한 순서는 **B가 commit·검증까지 마치고 성공을 반환한 뒤, lease를 잃었던 A의 지연 rename이 B를 덮는 것**이다. 이미 반환한 B는 다시 확인하지 않으므로 **B 관점에서는 조용한 손실**이다. 따라서 보증을 다시 좁힌다:

- **덮어쓴 쪽(A)이 보고한다** — A는 rename **후**에도 lock 소유를 재확인하고, 자기 token이 이미 lock에 없으면 "나는 소유 없이 썼다"를 확정 인지해 `evidence_overwrite_observed` + fail-closed throw.
- **(santa R3 OQ-2) A의 보고도 실패할 수 있다 → 독립 관찰자가 backstop이다**: Reviewer B가 "A가 rename 직후 post-rename 검증 **전에** 죽으면 아무도 보고하지 않는다"고 지적했고 옳다. 따라서 G3는 A의 생존에 의존하지 않는다 — **B2 런타임 변형 감사가 crash-proof 사후 관찰자**로서 같은 사건을 독립 검출한다(A가 남긴 guard 이벤트의 `pre_hash`가 관측된 사전 상태와 어긋나거나, guard 이벤트 자체가 없는 hash 변경으로 드러난다). 이 감사는 write 프로세스와 **다른 시점·다른 프로세스**에서 돌므로 writer의 죽음에 영향받지 않는다. G3의 정확한 문구는 그래서 "덮어쓴 쪽이 보고한다"가 아니라 **"보고되거나 감사에서 검출된다"**이다.
- **덮인 쪽(B)은 이미 성공을 반환했을 수 있다** — 이것이 **남는 잔여**다. 숨기지 않는다.
- **B2 런타임 감사가 사후 그물** — guard 이벤트의 pre-hash가 관측 사전 상태와 어긋나므로 감사에서 드러난다.

무조건적 상호배제는 파일시스템 원자 CAS 또는 단일 writer 프로세스를 요구하며 **M3 범위 밖**이다. 이 잔여(덮인 쪽의 늦은 인지)를 완전히 닫으려면 write에 전역 순번이 필요하고 그것은 **M5** 소관이다. plan 어디에서도 이보다 강한 표현을 쓰지 않는다.

**M5로 남는 것**: 전역 단조 순번, 파생 상태 재생 순서, 이력 보존, 그리고 **tombstone TTL 만료 이후의 무기한 replay 방어**.

**PRD 문장과의 대응(문구 미편집 — 운영자 지시로 PR 시점 이연)**: PRD M3 행은 "같은 작업을 두 세션이 잡는 상황이 **구조적으로 불가능**해진다"라고 적는다. G1이 그 문장의 **점유(잡는) 축**을 충족한다 — 두 live 세션은 같은 slug의 holder가 될 수 없다. 그 문장이 "쓰기까지 물리적으로 불가능"으로 읽힌다면 G3의 한계를 초과하므로, **PR 작성 시 PRD 문구를 G1~G3에 맞춰 조정**한다(§3.11 status 편집과 함께 처리). 이 대응을 명시하지 않으면 plan과 PRD가 서로 다른 강도를 주장하게 되고, 그것이 santa R1에서 두 리뷰어가 C3·C4로 지목한 지점이다.

**enforcement locus는 command body가 아니라 write path다.** LLM이 지시를 건너뛰어도 receipt write는 `writeReceipt`를 지나므로(store.js:112-121이 `assertNoTrackedOverwrite`에 대해 이미 같은 논거를 세움), 보호가 **현재 알려진 모든 caller**에 자동 적용된다. command body 변경은 조기 경고(UX)일 뿐 enforcement가 아니다 — Task 7이 그 문구를 본문에 명시한다.

**(santa R2 J6 — Reviewer A) "모든 caller"는 *현재* 알려진 경로에 한정된다.** 초안 표현은 미래까지 자동 보장하는 것처럼 읽혔으나, M3 이후 누군가 `.claude/receipts`에 직접 쓰는 신규 경로를 추가하면 보증은 조용히 증발한다(실제로 지금도 store 밖 직접 writer가 2개 있다). 이 간극은 Task 6 coverage gate의 **정적 lint가 그대로 guardrail 역할을 겸한다** — 승인 helper 밖의 receipt-path write가 생기면 lint가 실패하고 B2도 `forward-only`로 떨어진다. 즉 "신규 미보호 writer 유입"은 별도 장치가 아니라 **B2 gate의 사전 축과 동일한 검사**이며, 이 겸용 관계를 명시해 두 곳이 따로 놀지 않게 한다.

## GROUND — 조사 경로 (inline, fail-open)

Phase 2.5 Workflow fan-out 대신 **인라인 Pattern Grounding**으로 수행했다(command body가 명시한 fail-open 경로 — fan-out은 GROUND *enhancement*이고 게이트가 아니다). M2 plan이 같은 PRD에서 확립한 선례를 따른다. 확정된 사실(전부 실파일 대조):

- **`store.js#writeReceipt`(L149-156)** = `mkdirSync` → `assertNoTrackedOverwrite` → `fs.writeFileSync(최종경로)`. lock 0 · tmp+rename 0. 즉 (a) 동시 writer 2명이 lost update, (b) 쓰는 중 reader가 torn JSON을 읽음, (c) 쓰는 중 크래시가 receipt를 손상. PRD가 적은 "파일 단위 원자성만 있다"는 **과대평가**였다.
- **`assertNoTrackedOverwrite`(L122-147)** 는 TOCTOU다 — disk hash를 읽고(L127) 검사 후 caller가 write(L154). 두 세션이 같은 창에서 둘 다 통과 가능. 또한 `isGitTracked` false면 즉시 return(L124)이라 **untracked plan/implement receipt는 보호 밖**이다(`.gitignore:31-32` — tracked는 `mccp-pr-codex/`만).
- **store 밖 직접 writer 2건**: `briefing/index.js:69`, `completion-ledger/index.js:87`. store.js:117-120 주석은 "hash-carved 필드만 mutate하므로 receipt_hash를 바꿀 수 없다"고 정당화하는데, 그건 맞지만 **lost update와 무관한 논거**다 — 둘 다 read→modify→write이므로 `writeReceipt`와 경쟁하면 상대의 변경을 통째로 되돌린다.
- **`session-ledger.js#withLedgerLock`(L275-299)** 이 가장 가까운 선례다 — `O_EXCL`(`openSync wx`, L258) + bounded retry(50×20ms) + stale unlink(30s). **단 실패 정책이 fail-soft**다: 획득 실패 시 경고만 남기고 lock 없이 진행(L285-289, last-writer-wins). 이는 PRD가 STATE.md의 구조적 취약으로 지목한 바로 그 동작이다 → M3은 **메커니즘은 mirror하되 실패 정책을 반전**한다(fail-closed). 이 구분이 M3의 핵심 설계 결정이다.
- **`writeLedgerAtomic`(L301-311)** 은 tmp 이름이 고정(`target + '.tmp'`)이라 동시 writer가 tmp에서 충돌한다 → M3은 `context-state.js:69-98`의 **pid+random unique tmp** 패턴을 쓴다.
- **`.gitignore` 상호작용(중요)**: `.claude/receipts/*`는 무시되나 `mccp-pr-codex/`는 negate(L32)되고 그 안의 `*.lock`/`*.tmp`만 무시된다(L33-34). 따라서 신규 tmp 파일명은 **반드시 `.tmp`로 끝나야** 하고(`<name>.<pid>.<rand>.tmp`) lock은 `.lock`으로 끝나야 한다 — `.tmp-<pid>` 같은 이름은 glob에 안 걸려 ship receipt 디렉토리를 오염시킨다.
- ~~**live 세션 판정 substrate 완비**: `listLedgers({activeOnly:true})`를 재사용하면 된다.~~ **← 이 GROUND 결론은 santa R2(J4)에서 실측으로 반증됐다.** 기록되는 pid가 SessionStart **hook 프로세스**의 것이고 heartbeat가 pid를 갱신하지 않으므로, 단일 머신에서 `activeOnly`는 사실상 공집합이다. 상세와 대체 설계는 Task 4의 J4 항목 참조. **이 문장을 지우지 않고 취소선으로 남기는 이유**: 최초 GROUND의 오판이 두 라운드를 지나서야 잡혔다는 사실 자체가 감사 가치가 있고, 같은 전제가 다른 milestone에서 재사용되는 것을 막기 위해서다. 스키마는 M2 F1대로 **미변경**(strict unknown-key validator L102-171).
- **B2 현황**: `msw-metrics/index.js#computeB2`(L205-233)가 `forward-only`이며 주석(L210-214)이 차단 이유를 명시한다 — "production은 session_start/session_end만 emit하므로 collision producer가 없고, collision 관측으로 producer-present를 파생하면 정당한 computed-zero가 도달 불가해진다. **INDEPENDENT collision-producer-presence signal이 필요**하다." `session-activity.js:144`는 `kind === 'conflict' || 'collision'`을 읽지만 그 kind를 쓰는 producer가 없어 **dead read**다(back-compat 부담 0). `msw-events.js` ALLOWED_FIELDS(L29-39)에도 충돌 관련 필드가 없다.
- **M5 경계**: PRD L170-172가 "점유 만료·재생 방어(세션 epoch·순번·tombstone)"를 **M5** 소관으로 명시. M3은 그 모델을 만들지 않고, 대신 write 시점 **fencing**(현 소유자 확인)만 제공하고 잔여 gap을 설계 문서에 기록한다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 짧은 임계구역 lock | `plugins/mccp/scripts/state/session-ledger.js:256-299` | `openSync 'wx'`(O_EXCL) + bounded retry(50×20ms) + stale unlink. **실패 정책만 반전**(fail-soft → fail-closed) |
| host-aware stale reclaim | `plugins/mccp/scripts/lib/pr-phase-lock.js:264,295` | `isPidAlive`(process.kill(pid,0), Windows EPERM=alive) + `tryReclaimStaleLock` tri-state(same-host+alive = NEVER reclaim) |
| lock body + 0o600 | `plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js` | advisory raw-token in body + owner-only mode + ownership 일치 시에만 unlink |
| 원자 write(unique tmp) | `plugins/mccp/scripts/lib/context-state.js:69-98` | tmp+pid+random nonce → rename. 고정 tmp 이름 금지 |
| ~~live 세션 열거~~ | ~~`session-ledger.js:558-660`~~ | **미러 대상에서 제외(santa R2 J4)** — PID 축이 이 아키텍처에서 무효. claim liveness는 자기완결 `last_touch` TTL로 자체 정의(Task 4). ledger 스키마는 여전히 미변경 |
| sidecar 이벤트 append | `plugins/mccp/scripts/state/msw-events.js:161-214` | allowlist bounded 스키마 + O_APPEND + per-line malformed 격리 + retention GC |
| derive source | `plugins/mccp/scripts/derive/sources/session-activity.js` | read-only·dep-free·`{ok, degraded, producer_coverage}` emit |
| hook fail-loud-open | `plugins/mccp/scripts/hooks/session-end-trace.js:70-82` | 모듈 로드 실패에도 진행 보장 + degraded loud stderr |
| worktree-safe 경로 | CLAUDE.md §3.8 / `git rev-parse --git-path` | `.git/` hardcode 금지 |
| version bump | CLAUDE.md §3.7 | 단일 milestone = patch. `plugin.json` + footer 2면 동기 |

## Files to Change

경로는 repo-root 상대 full 경로(§1.2 dedupe planned-matcher 요구 — 축약 경로는 dedupe 불발).

| File | Action | Why |
|---|---|---|
| `.gitignore` | UPDATE | **선행(M2 santa R1 교훈 — 아티팩트 생성보다 먼저)**: `.claude/state/evidence-claims/` 추가. receipt lock/tmp는 기존 `*.lock`/`*.tmp` glob에 걸리므로 신규 파일명이 그 확장자로 끝나도록 강제(GROUND 참조) |
| `docs/multi-session-work-loop/evidence-conflict-design.md` | CREATE | M3 설계 — 점유 모델(키·수명·advisory vs enforce), 충돌 taxonomy 4종, B2 producer 계약(independent presence signal), fail-closed 근거, **M5로 이연되는 재생 방어 gap 명시** |
| `plugins/mccp/scripts/receipt/evidence-lock.js` | CREATE | 짧은 임계구역 lock + 원자 write. `withEvidenceLock(targetFile, fn)` = O_EXCL + bounded retry + host-aware stale reclaim + **fail-closed throw**(fail-soft 아님). `writeFileAtomic(target, content)` = unique tmp(`.tmp` suffix) + Windows rename bounded retry |
| `plugins/mccp/scripts/receipt/store.js` | UPDATE | `writeReceipt`를 lock 임계구역으로 감싸고 그 **안에서** `assertNoTrackedOverwrite` 재검(TOCTOU 폐쇄) + `writeFileAtomic`으로 교체. 모든 caller 자동 적용(L112-121 논거 계승). 출력 바이트는 불변(§3.12 no-rehash) |
| `plugins/mccp/scripts/lib/briefing/index.js` | UPDATE | L69 직접 `writeFileSync` → 같은 lock + atomic write 경유. read-modify-write 구간 전체가 임계구역 안 |
| `plugins/mccp/scripts/lib/completion-ledger/index.js` | UPDATE | L87 직접 `writeFileSync` → 동일. (ledger 엔트리 store는 이미 tmp+rename — 그쪽은 미변경) |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | `restampGroundingVerdict`(L~520-560) read-modify-write를 lock 안으로. `write()`는 store 경유라 자동 |
| `plugins/mccp/scripts/state/evidence-claim.js` | CREATE | 작업 단위 점유 레지스트리 — 키=decision slug, `.claude/state/evidence-claims/<slug>.json`. `acquireClaim`(O_EXCL)/`verifyClaim`/`releaseClaim`/`listClaims`. live 판정은 **자기완결 `last_touch` TTL**(santa R2 J4 — `listLedgers` PID 축은 무효라 미사용). 동일 세션 재진입 멱등성은 **santa R3에서 미해결로 남음**(아래 ESCALATION OQ-1) |
| `plugins/mccp/scripts/state/msw-events.js` | UPDATE | ALLOWED_FIELDS에 `work_unit`·`conflict_kind`·`holder_session`·**`pre_hash`·`post_hash`·`claim_epoch`**(santa R2 J5 — 미추가 시 `eventToJsonLine`이 조용히 strip해 B2 감사가 무효) 추가. 신규 kind 4종(`evidence_guard_active`·`evidence_conflict_prevented`·`evidence_overwrite_observed`·`work_claim_denied`). bounded cap·malformed 격리 계약 불변. **(CL-5)** 기본 경로를 cwd 상대(L22,177)에서 **명시 repoRoot 해석**으로 교정 — reader(`session-activity.js:34`)와 기준점 일치 |
| `plugins/mccp/scripts/hooks/session-end.js` | UPDATE | **(CL-5)** `appendEvent` 호출(L363)에 repoRoot 전달 — 현재 미전달로 cwd 종속 |
| `plugins/mccp/scripts/derive/sources/session-activity.js` | UPDATE | dead read(`kind==='conflict'\|\|'collision'`, L144) → 신규 taxonomy. **`collision_producer_present`를 guard_active 관측에서 파생**(충돌 건수와 독립 — 이것이 M2가 요구한 independent signal). `overwrite_observed`만 B2 분자 |
| `plugins/mccp/scripts/lib/msw-metrics/index.js` | UPDATE | `computeB2`(L205-233)를 producer-present 시 `computed`로 flip(분자=overwrite_observed, 분모=concurrent_pairs). 분모 0 → invalid(무결성 규칙) 유지. prevented는 분자에 **미계상**(예방은 사고가 아님) 하되 병기 |
| `plugins/mccp/scripts/lib/msw-metrics/fixture.js` | UPDATE | `claimedComputable`에 B2 추가(현재 `[B3]`). guard_active + concurrent pair fixture 주입 |
| `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js` | UPDATE | B2를 `forward-only` 대신 실수치로 표시. **(critique F1)** expanded 슬라이스를 index 순서 → **의사결정 우선순위**로(B2가 `TOP_EXPANDED=3` 밖 index 4라 현행대로면 collapse에 묻힘). **(critique F2)** `METRICS_META.B2` `name`/`desc` 갱신(분자가 "파일 충돌"이 아니라 `overwrite_observed`). prevented는 collapse 상세로. Output Constraints 준수(Task 8 Design) |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATE | advisory 통보 — 다른 live 세션이 점유한 작업 단위를 `<system-reminder>`에 주입(차단 아님, PRD Risk "감지·통보 우선"). fail-loud-open |
| `plugins/mccp/commands/work.md` | UPDATE | Step 0에 조기 점유 확인(경고 목적). **enforcement locus 아님** — 본문에 그 사실 명시 |
| `plugins/mccp/scripts/receipt/tests/evidence-lock.test.js` | CREATE | O_EXCL 배타성·bounded retry·stale reclaim tri-state·fail-closed throw·unique tmp·Windows rename retry 회귀 |
| `plugins/mccp/scripts/receipt/tests/receipt-write-concurrency.test.js` | CREATE | **N-writer stress** — 동일 (gate, decision)에 N 프로세스 동시 write → torn/partial 0, lost update 0, 승자 1. 세 writer 경로(store/briefing/completion-ledger) 교차 |
| `plugins/mccp/scripts/lib/tests/evidence-claim.test.js` | CREATE | 점유 획득/거부/멱등 재진입/dead-holder reclaim/fencing 실패 회귀 |
| `plugins/mccp/scripts/lib/msw-metrics/b2-coverage-gate.js` | CREATE | **(Codex R1 F2 + R2 F3)** B2 flip을 종속시키는 반증 가능 coverage gate. **primary = 런타임 변형 감사**(`snapshotReceiptsTree` 사전/사후 `path → {receipt_hash, mtime, size}` → 대응 guard 이벤트 없는 delta 검출) · 보조 = 정적 lint(승인 helper 밖 `.claude/receipts` write 금지) + mutation entrypoint 레지스트리 + **receipt corpus 출발** 건별 상관(CL-4 방향) → `{ok, failures[]}`. gate 미통과 시 `computeB2`가 `forward-only` 유지 |
| `plugins/mccp/scripts/lib/tests/msw-metrics-b2.test.js` | CREATE | B2 flip 회귀 — gate 미통과 시 forward-only, 통과+충돌 0 시 `computed` 0, 분모 0 시 invalid, prevented가 분자에 안 섞임 |
| `plugins/mccp/scripts/lib/tests/b2-coverage-gate.test.js` | CREATE | **(Codex R1 F2 + R2 F3)** gate 각 항 독립 회귀 + **부정 fixture**(guard 우회 write 주입 시 B2가 `computed`로 뒤집히지 않음) + **런타임 변형 감사**(guard 이벤트 없는 delta 검출) |
| `plugins/mccp/scripts/lib/tests/msw-events-path.test.js` | CREATE | **(CL-5)** cwd를 repo 하위로 바꿔도 reader와 동일 경로 기록 + worktree 2개 fixture 교차 계상 0 |
| `plugins/mccp/scripts/receipt/tests/receipt-bytes-stable.test.js` | CREATE | §3.12 no-rehash — 변경 전후 동일 입력의 receipt 바이트·`receipt_hash` 동일 assert |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version `1.23.0 → 1.23.1`(§3.7 단일 milestone = patch, branch `v1.23.1-multi-session-m3`와 정합) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version `v1.23.0 → v1.23.1`(L1419) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기(L163) |
| `CHANGELOG.md` | UPDATE | v1.23.1 row |
| `CLAUDE.md` | UPDATE | §3.6에 **세 번째 lock**(evidence write lock) 등록 + §4에 신규 토글 1개 문서화 |
| `.claude/prds/multi-session-work-loop.prd.md` | UPDATE | M3 행 `pending → in-progress` + Plan 셀 = 본 plan 경로 |

## Tasks

### Task 1: `.gitignore` 선행 + 설계 문서
- **Action**: (a) `.claude/state/evidence-claims/` 를 `.gitignore`에 **먼저** 추가 — 아티팩트가 생기는 Task 3/5 이전에 등록해 커밋 오염 창을 원천 차단(M2 santa R1 교훈). (b) `evidence-conflict-design.md` 작성: 점유 키(=decision slug, PRD 작업단위 freeze 준수)·수명·advisory↔enforce 경계, 충돌 taxonomy 4종과 각각의 B2 계상 규칙, fail-closed 선택 근거(`withLedgerLock` fail-soft와의 대비), receipt lock/tmp 파일명 규약(`.lock`/`.tmp` suffix 강제 이유 = gitignore glob). **Codex R1 흡수 3절을 문서의 1급 내용으로 포함**: (i) **caller별 실패 정책 표**(`writeReceipt` fail-closed vs 메타 stamper 2건 fail-open + loud skip — 의도적 비대칭임을 선언), (ii) **lease 정책이 `pr-phase-lock` tri-state를 의도적으로 차용하지 않는 근거**(ms-scale 임계구역에서 live holder의 lease 초과는 작업 중이 아니라 고장 → liveness는 reclaim 차단 조건이 아니라 추가 trigger), (iii) **B2 coverage gate 명세** — primary인 **런타임 변형 감사**(스냅샷 필드·delta 판정·guard 이벤트 대응 규칙)와 보조 축(정적 lint 대상 경로·승인 helper 목록·entrypoint 레지스트리·**receipt corpus 출발** 건별 상관·부정 fixture), 그리고 "gate 실패 시 `forward-only` 유지" 계약. 정적 축이 사전 차단, 런타임 축이 사후 검출이라는 **역할 분담**을 명시(R2 F3 — 정적 단독은 동적·셸·repo 밖 writer를 반증 불가). **보증 범위 경계**: M3 = live 중복 점유 불가 + stale epoch write 거부(tombstone TTL 내). M5 = 전역 단조 순번·파생 상태 재생 순서·이력 보존. `claim_epoch`가 M5 모델의 대체물이 **아님**을 명시.
- **Mirror**: `docs/multi-session-work-loop/measurement-instrumentation.md` 구성, CLAUDE.md §3.6 lock 표
- **Validate**: `git check-ignore -v .claude/state/evidence-claims/x.json` 통과. 문서 cross-link 유효.

### Task 2: `evidence-lock.js` — fail-closed 짧은 임계구역 + 원자 write
- **Action**: `withEvidenceLock(targetFile, fn, opts)` — lock 경로 `<targetFile>.lock`, `openSync 'wx'` + 0o600, body에 `{pid, host, started_at, token}`. bounded retry(default 50×20ms) 후에도 미획득이면 **throw(fail-closed)** — `withLedgerLock`의 fail-soft 경고-후-진행을 의도적으로 반전한다(그 동작이 PRD가 지목한 결함 자체다). release는 token 일치 시에만 unlink. `writeFileAtomic(target, content)` — tmp = `<target>.<pid>.<rand>.tmp`(**`.tmp`로 끝나야 함** — gitignore glob), write → `renameSync`, Windows `EPERM`/`EACCES`/`EBUSY`는 bounded retry 후 throw(AV·열린 핸들 대응), 실패 시 tmp 정리.
- **(Codex R1 F1) lease 정책 — tri-state를 그대로 mirror하지 않는다**: 초안은 `pr-phase-lock.js:295`의 "same-host + PID alive → 절대 reclaim 안 함"을 복사했는데, **그 tri-state의 정당화가 이 lock에는 전이되지 않는다**. `pr-phase.lock`은 Codex review 전체(분 단위)를 감싸므로 live holder는 정상 작업 중일 가능성이 높다. 반면 evidence lock의 임계구역은 **파일 IO ms 단위**이므로, live holder가 lease를 넘겨 보유한다는 것은 *작업 중*이 아니라 **고장**(임계구역 내 crash·중단된 턴·PID 재사용·긴 FS hold)이라는 뜻이다. tri-state를 그대로 두면 fail-closed와 결합해 **해당 receipt가 영구 차단**되는 stall class가 생긴다(Codex 지적 정확). 따라서: **짧은 lease(default 5s)는 PID liveness와 무관하게 항상 적용**되고, PID liveness는 reclaim을 *막는* 조건이 아니라 lease 이전에도 즉시 reclaim하게 하는 **추가 trigger**로만 쓴다(dead PID → 즉시 reclaim). host 상이도 즉시 reclaim.
- **(santa R1 I1 — 두 리뷰어 수렴) pre-rename 재확인만으로는 닫히지 않는다. 보증을 "무손실"이 아니라 "무-무성(無silent)손실"로 정직하게 재정의한다**: A·B 리뷰어가 독립적으로 같은 반례를 냈다 — writer A가 base-hash와 lock 소유를 **둘 다 통과한 뒤** lease를 잃고, B가 reclaim해 commit하고, 그 다음 A의 지연된 `renameSync`가 B를 덮는다. 확인과 rename 사이는 원리상 닫히지 않는다(`rename`은 advisory lock에 대해 CAS가 아니다). 사전 점검을 아무리 촘촘히 해도 이 창은 남으므로, **"lost update가 불가능하다"는 주장을 철회**하고 3중 구조로 대체한다:
  1. **heartbeat 연장 lease** — 임계구역 진입 시와 rename **직전**에 lock mtime을 갱신한다(§3.6 in-loop heartbeat 미러). 느린 FS에서 *진행 중인* holder는 lease를 유지하고, **정지한** holder만 reclaim 대상이 된다. R1 F1이 지적한 영구 stall을 재도입하지 않으면서 reclaim 창을 "진짜 고장"으로 좁힌다.
  2. **post-rename 검증** — rename 후 파일을 다시 읽어 우리가 쓴 내용의 hash와 일치하는지 확인한다. 불일치 = 경쟁에서 졌다는 **확정 관측**.
  3. **감지 시 fail-closed** — 진 writer는 `evidence_overwrite_observed`를 기록하고 **throw**한다. 게이트는 조용히 진행하지 않고 중단되며, 운영자는 재실행으로 복구한다.
  이 재정의는 후퇴가 아니라 PRD 정합이다 — B2는 "덮어쓴 **사고 건수**"를 세고 목표는 0건인데, 감지되어 차단된 경합은 조용한 덮어쓰기가 아니다. **(santa R3 — Reviewer A C3 교정) 단, 이 문단이 round 1에 쓴 "어떤 증거 손실도 조용히 지나가지 않는다"를 그대로 두고 "plan 전체에서 이 문구로 통일한다"고까지 적은 것은 오류였다** — R2(J2)가 그 문구를 이미 거짓으로 판정했는데 보증 표만 고치고 이 문단을 놓쳤다. **단일 기준은 상단 G1~G3 표이며 이 문단은 그것을 참조할 뿐이다.** G3의 정확한 문구는 "덮어쓴 쪽이 보고하거나 B2 런타임 감사가 검출한다"이고, 덮인 쪽의 늦은 인지는 명시된 잔여다.
- **(Claude 독립분석 CL-2) lease 단독은 정확하지 않다 — write-side fencing과 반드시 쌍으로 간다**: F1 흡수가 lease를 liveness-무관하게 만든 순간 새 구멍이 열린다. holder가 **정말로 쓰는 중**인데(AV 스캔·네트워크 드라이브·Windows 핸들 경합으로 5s 초과) 다른 프로세스가 reclaim하면 임계구역에 **writer 2명**이 생긴다. 원자 tmp+rename은 torn file만 막고 **lost update는 못 막는다** — M3이 존재하는 이유인 바로 그 결함이 되돌아온다. lease는 liveness 판정을 대체할 뿐 상호배제를 보장하지 않으므로, **fencing 없는 lease는 그 자체로 부정확**하다. 따라서 write는 두 단계 방어를 **반드시** 통과한다: (a) **base-hash 선조건** — 임계구역 진입 시 읽은 disk hash를 기억하고, rename 직전 disk가 그대로인지 재확인. 다르면 write를 **거부**하고 `evidence_overwrite_observed` 기록(reclaim 경쟁이 실제로 일어났다는 관측). (b) **rename 직전 lock 소유 재확인** — 우리 token이 아직 lock body에 있는지 검사, 아니면 abort. 잔여 창은 `rename` 시스콜 자체로 축소된다. Task 5의 `overwrite_observed` 검출은 별개 기능이 아니라 **이 fencing의 관측 면**이다(초안은 둘을 분리 서술해 이 의존을 놓쳤다).
- **(Codex R1 F1) 운영자 가시 복구 경로**: `EVIDENCE_LOCK_UNAVAILABLE` 메시지는 lock 절대경로 + 잔여 lease + 재시도 지침 + kill switch(`MCCP_EVIDENCE_CONFLICT_GUARD=warn`)를 반드시 포함한다(조용한 실패도, 진단 불가한 실패도 금지).
- **Mirror**: `session-ledger.js:256-299`(메커니즘 — 실패 정책만 반전), `pr-phase-lock.js:264`(`isPidAlive`만 차용, tri-state **미차용** — 위 근거), `context-state.js:69-98`(unique tmp), quarantine lock(0o600 + token)
- **Validate**: 두 프로세스 동시 acquire → 1승 1throw. **abandoned-live-lock**(holder PID는 살아 있으나 임계구역서 중단) → lease 만료 후 reclaim 성공(영구 차단 부재 회귀). **PID 재사용**(기록 pid가 무관한 live 프로세스) → lease로 reclaim. dead PID holder → lease 전에도 즉시 reclaim. tmp 파일명 `git check-ignore` 통과. rename 실패 주입 시 tmp 잔여 0. 에러 메시지에 lock 경로·lease·kill switch 문자열 존재. **(Codex R2 F1) slow-live-holder 회귀 — 반드시 별도 test**: 느린 holder가 임계구역에 머무는 동안 다른 프로세스가 reclaim·재획득한 뒤, **원래 holder가 뒤늦게 write를 시도**하면 rename 직전 소유 재확인과 base-hash 선조건이 그 write를 **거부**해야 한다(두 writer가 순차로 rename해 앞선 변경이 조용히 사라지는 시나리오가 정확히 M3이 닫으려는 lost update다).

### Task 3: receipt write 3경로를 임계구역으로 통합 (TOCTOU 폐쇄 + 원자성)
- **Action**: `store.js#writeReceipt`를 `withEvidenceLock(p, () => { assertNoTrackedOverwrite(...); writeFileAtomic(p, json); })`로 재구성 — 핵심은 guard 재검이 **lock 안**이라는 것(현재는 검사 후 write 사이가 열려 있어 두 세션이 함께 통과). 직접 writer 2건(`briefing/index.js:69`, `completion-ledger/index.js:87`)의 read-modify-write **전체**를 같은 lock 안으로 이동(read도 포함해야 lost update가 닫힌다). `write.js#restampGroundingVerdict`도 동일. **임계구역은 ms 단위 파일 IO만** — LLM 호출을 절대 포함하지 않는다(`pr-phase.lock`이 Codex review 전체를 감싸는 것과 대조적 설계).
- **(Codex R1 F1) caller별 실패 정책을 의도적 비대칭으로 명문화**: Codex는 "callers get a mix of gate aborts and silently missing metadata"를 결함으로 지적했다. 그 mix 자체는 **옳지만 초안이 그것을 선언하지 않아** 우발적으로 보였다 — 이제 명시한다. (a) **`writeReceipt` = fail-closed** — 증거는 선택 사항이 아니고 `write.js:451`이 fail-open 에필로그(escalate/briefing/ledger)보다 **앞**이라 throw가 게이트를 정직히 중단시킨다(실측 확인). (b) **hash-carved 메타 stamper 2건(briefing · completion-ledger 진단) = 기존 fail-open 유지** — 이들은 `receipt_hash`를 바꿀 수 없는 부가 메타이므로, lock 미획득으로 게이트를 중단시키는 것이 손실보다 크다. 단 skip은 **loud stderr + 이유 기록**(조용한 누락 금지). 이 두 축을 caller 표로 설계 문서에 고정하고 test로 각각 강제한다.
- **Mirror**: `store.js:112-121`(모든 caller 커버 논거), `write.js:451-466`(fail-open 삼중 try 위치 — 실측)
- **Validate**: N-writer stress에서 lost update 0. 동일 입력 receipt 바이트·`receipt_hash` 변경 전후 동일(§3.12). 기존 receipt 회귀 스위트 green. **caller별 정책 test**: lock 미획득 주입 시 `writeReceipt`는 `EVIDENCE_LOCK_UNAVAILABLE` throw(조용한 성공 금지) · 메타 stamper 2건은 게이트를 중단시키지 않고 loud stderr + skip 이유 기록.

### Task 4: `evidence-claim.js` — 작업 단위 점유 + write-side fencing
- **(santa R2 J4 — Reviewer B, 본 리뷰 체인 최대 결함) live 판정 기반을 교체한다. `listLedgers({activeOnly:true})`는 이 아키텍처에서 작동하지 않는다**: 초안은 "heartbeat TTL·PID liveness·host 분기가 **이미 검증된 substrate**"라며 그대로 재사용했다. **그 전제가 실측으로 거짓이다.** (a) `session-start.js:671`이 `createLedger`에 `pid`를 넘기지 않아 기록되는 pid는 **SessionStart hook 프로세스**의 것이고(`session-ledger.js:338` `process.pid` fallback), (b) `updateLedgerHeartbeat`는 `last_seen_at`만 갱신하며 **`pid`를 영원히 갱신하지 않고**, (c) `listLedgers`의 same-host 분기(`session-ledger.js:643`)는 `pidProbe(ledger.pid)`가 참일 것을 요구한다. hook 프로세스는 수 초 내 종료하므로 **단일 머신(= 본 PRD의 전 범위)에서 activeOnly는 사실상 공집합**이고, 그러면 "다른 live holder" 분기가 **한 번도 발화하지 않아 G1·G2가 함께 붕괴**한다. 이 구조에서는 모든 writer가 단명 hook/CLI 프로세스라 **PID liveness 자체가 부적합한 축**이다. 따라서 claim의 생사를 **자기완결 시간축**으로 정의한다: claim 레코드가 자신의 `last_touch`를 갖고, holder가 write할 때마다 갱신하며, `MCCP_EVIDENCE_CLAIM_TTL`(default 15분) 안이면 live로 본다. ledger의 `last_seen_at`은 **보강 신호로만** 참조하고 PID 축은 쓰지 않는다. session-ledger 자체 수정은 M3 범위 밖이므로(M2 F1의 스키마 불변 계약) **상류 결함으로 별도 기록**해 backlog에 남긴다.
- **Action**: 키 = decision slug(PRD 작업단위 freeze = milestone = plan = PR = slug). `acquireClaim({slug, sessionId})` → `.claude/state/evidence-claims/<slug>.json`에 `{slug, session_id, host, pid, claimed_at, last_touch, claim_epoch}` 기록. **(santa R2 J1 — Reviewer A) 생성은 receipt lock에 기대지 않고 자체 `O_EXCL`로 원자화한다**: evidence lock의 키는 `<gate>/<slug>.json.lock`이라 **(gate, slug)별**인데 claim의 키는 **slug별**이다(실측: `receiptPath`가 `gate_id`를 경로에 포함). 따라서 같은 slug라도 게이트가 다르면 **서로 다른 lock**이 잡히고, round 1이 적은 "생성과 판정이 같은 임계구역이라 원자적"은 **거짓**이다. `acquireClaim`은 `openSync(path,'wx')`(O_EXCL, `session-ledger.js:258`·quarantine lock과 동일 primitive)로 생성하고 `EEXIST`면 재read 후 holder 대조로 분기한다. 동일 `session_id` 재진입은 **멱등 no-op**(단일 세션 사용성 무해 — PRD Risk 대응). 다른 **live** 세션 보유 시 `{ok:false, holder}` 반환. holder의 `last_touch`가 TTL을 넘겼으면 자동 승계.
- **(santa R2 J3 — Reviewer B) tombstone을 자발적 release가 아니라 *승계 시점*에 쓴다. 그러지 않으면 G2가 겨냥하는 바로 그 시나리오에서 tombstone이 존재하지 않는다**: 초안은 `releaseClaim`이 tombstone을 남긴다고 했는데, B가 두 가지를 짚었다 — (a) `releaseClaim`을 **누가 호출하는지 어떤 Task에도 배정돼 있지 않고**, (b) 더 치명적으로 **G2의 전제 시나리오는 "A가 죽어서 release를 못 한 경우"**다. 죽은 세션은 정의상 release를 호출하지 못하므로 tombstone이 안 생기고, 부활한 A는 "레코드 없음 → 통과"로 떨어져 fence가 **전혀 발화하지 않는다**. 해소: **승계자가 tombstone을 쓴다** — B가 stale claim을 승계할 때 이전 holder의 `{session_id, host, session_pid, claim_epoch}`를 `superseded` 항목으로 같은 레코드에 보존한다(별도 파일 아님 — 원자성 유지). 부활한 A는 "레코드 있음 + 내 epoch은 superseded 목록에 있음" → **거부**. 자발적 `releaseClaim`은 여전히 제공하되 **정확성의 전제가 아니라 최적화**(즉시 승계 허용)로 격하하고, 호출처를 `session-end.js`에 명시 배정한다(호출 누락이 정확성을 깨지 않음이 이 재설계의 요점). **advisory↔enforce**: 코스한 착수 차단은 advisory 통보, enforce는 write-side fencing만 — CoAgent 근거(차단형 락보다 advisory가 처리량 1.4×) + PRD Risk "차단은 실제 충돌 시에만".
- **(Codex R1 F3) 최소 replay fence를 M3으로 끌어온다 — 이연은 M3의 순서 정당화를 자기부정한다**: 초안은 재생 방어 전부를 M5로 미뤘는데, Codex가 정확한 반례를 냈다 — A가 liveness를 잃고 → B가 승계하고 → **B가 release한 뒤** → A가 부활하면, live holder가 없으므로 `verifyClaim`이 통과해 **이미 닫힌 작업이 되살아난다**. 그런데 PRD가 M3을 M5보다 **앞에** 둔 이유가 바로 "손상 가능한 상태로 진실원을 옮기지 않기"이므로, 이 구멍을 열어둔 채 ship하면 순서의 근거 자체가 거짓이 된다. 초안의 Acceptance("재생 gap은 M5 소관")와 PRD milestone("구조적으로 불가능")이 **서로 모순**이었던 것도 같은 지점이다. 따라서 두 가지를 **함께** 한다: (1) **최소 fence 구현** — `claim_epoch`(acquire 시 생성하는 불투명 id)를 claim 파일에 기록하고 receipt write가 epoch을 제시하게 한다(fencing token). release는 파일 삭제가 아니라 **tombstone**(`released_at` + 직전 epoch 보존, TTL 후 GC)을 남겨, live holder가 없어도 stale epoch 제시자를 거부한다.
- **(Claude 독립분석 CL-1) fence는 무조건이 아니라 조건부다 — 초안대로면 standalone 게이트가 전부 깨진다**: 초안은 "**모든** receipt write가 epoch 제시를 요구"라고 적었는데, 실측하면 receipt write를 호출하는 command body가 5개(`plan.md`·`prp-implement.md`·`pr.md`·`code-review.md`·`receipt-write.md`)이고 **어느 것도 claim을 획득하지 않는다**(본 `/mccp:plan` 실행이 그 산 증거다). 무조건 요구는 파이프라인 전체를 즉시 차단하고, 반대로 "있으면 검사"로 완화하면 fence가 아니게 된다 — 초안은 이 딜레마를 인지하지 못했다. 해소: **fence의 발화 조건을 slug 단위 claim 레코드의 존재로 정의**한다. 해당 slug에 claim 레코드(live 또는 tombstone)가 **존재하면** write는 현재 epoch 제시를 **요구**하고 불일치·부재는 거부한다. 레코드가 **없으면** 중재할 경합 자체가 없으므로 통과한다(무claim = 단일 세션 = 현행 동작 보존). 이것이 fence를 약화시키지 않는 이유는 구조적이다 — F3의 재생 시나리오는 **claim이 존재했어야만** 성립하고(A가 잡았다가 만료), tombstone이 그 레코드를 TTL 동안 유지하므로 부활한 A는 정확히 "레코드 있음 + stale epoch" 분기에 떨어진다.
- **(Codex R2 F2가 CL-1을 반박 → 흡수, 판정: Codex 우세)** Codex는 조건부 fence를 "epoch을 optional로 만들어 fence를 제거하는 나쁜 구현"으로 분류했다. 그 분류 전체는 받지 않는다 — 위 tombstone 논거대로 재생 경로는 실제로 닫힌다. **그러나 Codex가 정확히 짚은 것이 하나 있고 그것이 치명적이다: plan이 "누가 어떻게 epoch을 획득해 `writeReceipt`까지 전달하는가"의 lifecycle을 전혀 규정하지 않았다.** 그 결과 **정당한 holder 자신이 거부되는** 모순이 생긴다 — B가 slug를 점유한 상태에서 B의 `/mccp:plan` Phase 5.6이 `cli.js write --gate ... --decision ... --plan ...`을 호출하는데(현 CLI 인자에 epoch 개념이 없다), "레코드 있음 + epoch 미제시"로 **B 자신의 receipt write가 막힌다**. 공격 경로가 아니라 정상 경로가 깨지는 것이다. 해소: **epoch을 LLM이 flag로 실어 나르게 하지 않는다**(그 방식은 command body 누락에 취약하고 §게이트 신뢰 금지 원칙에도 어긋난다). 대신 `writeReceipt`가 slug의 claim 레코드를 **스스로 읽고 호출자 세션 정체와 대조**한다:

  | claim 레코드 | 호출자 = holder? | 동작 |
  |---|---|---|
  | 부재 | — | **통과**(경합 없음 = 현행 standalone 동작 보존) |
  | live holder | 예 | **통과** + 파일의 현재 epoch을 guard 이벤트에 기록(호출자가 값을 만들지 않으므로 위조 불가) |
  | live holder | 아니오 | **거부** + `evidence_conflict_prevented` |
  | tombstone | 예(단 epoch 불일치) | **거부** — 부활 holder(F3 핵심 시나리오) |
  | tombstone | 아니오 | **통과**(승계자의 정상 write) |

  호출자 세션 정체는 `session-start.js`가 쓰는 것과 **동일 소스**(observer session id / `CLAUDE_SESSION_ID`)를 재사용한다. 즉 fence의 신뢰 근거는 "호출자가 제시한 토큰"이 아니라 "**파일에 기록된 holder 정체 ↔ 실행 중 세션 정체**"의 대조이며, epoch은 그 대조의 tamper-resistant 바인딩이다. 이 설계는 `/mccp:receipt-write` 같은 bare CLI 경로에도 **인자 변경 없이** 적용된다(Codex가 요구한 "모든 ingress 커버"를 flag 배선 없이 만족).
- **(santa R1 I2 — 두 리뷰어 수렴) `레코드 부재 → 통과`가 fence에 구멍을 남긴다 → 암묵 claim-on-first-write로 닫는다**: A·B 모두 같은 지적을 했다 — 5개 standalone ingress를 살리려고 "레코드 없으면 통과"로 두면 **그 5개끼리는 claim 없이 같은 slug를 순차로 덮어쓸 수 있다**. 그러면 PRD가 말한 중복 방지가 "claim을 만든 흐름에만" 성립하고 milestone 결과가 전역으로 성립하지 않는다. 해소: **`writeReceipt`가 evidence lock 안에서, fence 판정 *이전에*, 레코드가 없으면 실행 세션을 holder로 하는 claim을 암묵 생성한다.** 그 결과 "레코드 부재" 분기는 **최초 write 1회로 소멸**하고, 이후 다른 live 세션의 write는 "다른 live holder → 거부"로 떨어진다. 진짜 동시 진입(둘 다 부재를 관측)의 원자성은 **~~evidence lock의 직렬화~~가 아니라 `acquireClaim` 자체의 `O_EXCL`이 보장한다** — santa R2 J1이 반증했듯 evidence lock 키는 `(gate, slug)`라 **같은 slug·다른 게이트면 직렬화해 주지 않는다**(이 문장의 원래 근거였던 "같은 임계구역이라 원자적"은 거짓이었고, 아래 J1 항목이 대체 설계다). standalone 단일 세션은 자기 자신이 holder가 될 뿐이라 동작이 바뀌지 않고(멱등 재진입), **CLI 인자·command body 변경은 여전히 0**이다.
- **(santa R3 OQ-1 — 운영자 승인 R4에서 해소) holder 정체에서 `process.pid`를 뺀다. 세션-안정 식별자로 교체**: R1(I3)은 "정체 공유 붕괴"를 막으려 `{session_id, host, session_pid}` 3원소를 넣었는데, Reviewer B가 R3에서 **그 pid가 정상 경로를 깨뜨린다**고 지적했고 옳다 — `receipt/cli.js`는 **write마다 새 node 프로세스**라 `process.pid`가 매번 달라져 **같은 세션의 두 번째 write가 "다른 holder"로 거부**된다. 실측으로 확인한 대체 소스가 있다: write 프로세스 env에 **`CLAUDE_CODE_SESSION_ID`**와 **`CLAUDE_PID`**(= Claude **세션** 프로세스의 pid, CLI 프로세스가 아님)가 모두 도달한다. 따라서 정체를 **`{session_id, host, session_pid}`**로 정의한다 — `session_id`는 기존 선례 `orchestration-runaway.js:559 resolveSessionKey`(`MCCP_SESSION_ID || CLAUDE_CODE_SESSION_ID || CLAUDE_SESSION_ID`)를 **재사용**하고, `session_pid`는 `process.pid`가 **아니라** `CLAUDE_PID`다. 세 값 모두 `cli.js` 재실행 사이에 **안정**하므로 동일 세션 재진입이 멱등이고, I3가 겨냥한 정체-공유 판별력도 `session_pid`가 유지한다.
  - **측정 증거(santa R4 — Reviewer A가 "무근거 가정"으로 지목해 기록)**: 별개 node 프로세스 3회 실행에서 `CLAUDE_PID`는 **4756으로 3회 모두 동일**했고 `process.pid`는 **43832 / 94636 / 103764**로 매번 달랐다. `process.kill(4756, 0)`은 **ALIVE**. `CLAUDE_CODE_SESSION_ID`도 3회 동일(`df6ef99e…`). 즉 (a) 세션-안정성과 (b) 프로세스 실재가 모두 확인됐다. 재현 명령을 Validation 블록에 넣어 **리뷰어가 직접 재현 가능**하게 한다 — plan이 "실측했다"고만 적고 증거를 안 남긴 것이 R4에서 정당하게 지적됐다.
  - **런타임 가드(가정에 기대지 않는다)**: `CLAUDE_PID`가 **부재하거나 `kill(pid,0)`이 실패**하면 정체에서 그 축을 빼고 `{session_id, host}`로 강등하며 liveness는 `last_touch` TTL 단독으로 판정한다(+ loud 기록). 즉 env가 사라져도 **fence가 붕괴하지 않고 판별력만 낮아진다**. 이 강등 경로 자체를 test로 고정한다(env 제거 후 정상 동작 확인).
  - **부수 효과 — liveness가 다시 의미를 갖는다**: `CLAUDE_PID`는 실제로 살아 있는 세션 프로세스이므로 `process.kill(CLAUDE_PID, 0)`이 **진짜 생존 판정**이 된다(J4가 무효화한 것은 *hook 프로세스* pid였지 이 값이 아니다). claim liveness는 `last_touch` TTL을 **1차**로 쓰되 `session_pid` 생존을 **보강 신호**로 병용한다(TTL 안이라도 세션이 죽었으면 즉시 승계 → 대기 단축). `CLAUDE_PID` 부재 환경은 TTL 단독으로 강등 + loud 기록.
  - **`session_id` 부재 시**: claim을 **생성하지 않고 fence도 걸지 않는다**(`claim_skipped_no_identity` + loud warn). 무명 프로세스에 nonce를 주면 자기 자신의 다음 write와도 불일치해 정상 경로가 깨지고, host만 쓰면 전부 하나로 붕괴한다 — 둘 다 나쁘다. 이때도 evidence lock + post-rename 검증 + B2 감사는 그대로이므로 **G3는 유지되고 해당 write에 대해서만 G1·G2가 비활성**이며 그 사실을 기록한다.
  - **J4 상류 결함의 구체적 수정안이 여기서 나온다**: `session-start.js:671`이 `createLedger`에 `pid: Number(process.env.CLAUDE_PID)`를 넘기면 ledger의 PID 축도 되살아난다. M3 범위 밖이므로 **backlog에 이 구체안과 함께** 기록한다(막연한 "고쳐야 함"이 아니라 실행 가능한 형태로).
- **(santa R1 I3b) tombstone TTL 만료 후의 정직한 기록**: TTL이 지나면 부활 holder가 다시 통과한다 — 즉 replay fence는 **시간 유계**다. 이를 숨기지 않고 명시한다: M3은 "TTL 창 안의 부활 거부"를 보증하고, 무기한 replay 방어는 전역 단조 순번을 요구하므로 **M5** 소관이다. TTL 값과 그 근거(승계 후 원 세션이 되살아날 현실적 상한)를 설계 문서에 기록하고, TTL 경과 시나리오를 **통과가 아니라 known-gap으로 test에 고정**한다(동작이 조용히 바뀌면 잡히도록). (2) **주장 범위 축소** — M3이 보증하는 것은 "**live 세션** 간 중복 점유 불가 + stale holder의 write-time 거부"이고, 상태 진실원 전체의 **순서·재생 의미론**(전역 단조 순번, 파생 상태 재생 순서)은 M5다. `claim_epoch`는 M5 모델의 대체물이 아니라 그 축의 최소 선행 조건이다.
- **Mirror**: `session-ledger.js:558-660`(live 판정), `context-state.js`(원자 write), quarantine lock(ownership 일치 unlink), `pr-phase-lock.js:144-227`(token hash + 제시 검증 계약)
- **Validate**: 두 live 세션이 같은 slug 요청 → 1승 1거부 + 거부 이벤트 기록. 같은 세션 2회 → no-op(에러 아님). holder PID kill 후 승계 성공. `verifyClaim` 실패 시 receipt write가 **거부되고 파일 미변경**. **(F3 핵심 회귀) A 만료 → B 승계 → B release → A 부활 → A의 write가 stale epoch로 거부**(tombstone TTL 내). tombstone TTL 경과 후 동작도 명시적으로 test(무제한 보존 금지 — 이력 보존 정책은 M5).

### Task 5: 충돌 taxonomy producer (msw-events 확장)
- **Action**: ALLOWED_FIELDS에 `work_unit`·`conflict_kind`·`holder_session` **+ (santa R2 J5) `pre_hash`·`post_hash`·`claim_epoch`** 추가(bounded cap 256·line cap·malformed 격리 계약 불변). **J5가 없으면 I4 수정이 무효**다 — `msw-events.js:125`의 `eventToJsonLine`은 allowlist에 없는 키를 **조용히 버리므로**, pre/post hash를 emit해도 디스크에 남지 않고 B2 감사는 영원히 대조할 값을 못 찾는다(Reviewer B 지적). allowlist 확장과 감사 요구는 **같은 Task에서 함께** 처리한다. 신규 kind 4종을 각 발생점에서 emit: `evidence_guard_active`(guard가 감싼 write마다 — **충돌 유무와 무관**), `evidence_conflict_prevented`(lock/fencing이 실제로 막음), `evidence_overwrite_observed`(방어를 뚫고 덮인 실사고 — 목표 0), `work_claim_denied`. `overwrite_observed` 검출: lock 안에서 write 직전 disk hash가 이 writer가 읽은 base hash와 다르면 사고로 기록(fail-closed 거부 + 기록). 기존 dead kind(`conflict`/`collision`)는 producer가 없었으므로 back-compat 부담 0 — reader만 교체.
- **(Claude 독립분석 CL-5) writer↔reader 경로 불일치를 먼저 고친다 — M3 헤드라인 지표가 이 위에 얹힌다**: 실측하면 `msw-events.js:22,177`의 기본 경로가 **상대경로**(`path.join('.claude','state','msw-events')`)이고 `appendEvent(sessionId, event)`의 두 caller(`session-start.js:710`, `session-end.js:363`) **어느 쪽도 `opts.dir`을 넘기지 않는다** → 실제 write 위치가 hook 프로세스의 `process.cwd()`에 종속된다. 반면 reader인 `session-activity.js:34`는 `path.join(repoRoot, '.claude','state','msw-events')`로 **repoRoot 고정**이다. 두 축이 어긋나는 순간 (a) 이벤트가 reader가 보지 않는 디렉토리에 쌓여 조용히 0건이 되거나, (b) **worktree가 여럿일 때 A의 이벤트가 B의 reader에 잡혀 동시성 측정이 교차 오염**된다. (b)는 가설이 아니다 — 지금 이 저장소에 worktree 3개(`main` · `feat/codex-intent-context` · 본 브랜치)가 동시에 살아 있다(CL-3). M2에서는 이 결함이 A1/A2를 흐리는 데 그쳤지만, **M3에서는 B2의 분모(concurrent pair)와 `evidence_guard_active` 커버리지 신호가 전부 같은 sidecar에 실리므로 헤드라인 acceptance가 직접 무너진다**. 따라서 M3은 `appendEvent`가 **명시 repoRoot에서 경로를 해석**하도록 고치고(§3.8 · `git rev-parse --show-toplevel` 규약), 두 caller가 repoRoot를 전달하게 한다. 기존 M2 이벤트와의 back-compat은 read-side에서 두 위치를 모두 스캔하되 **중복 계상 금지**로 처리한다.
- **Mirror**: `msw-events.js:29-39,161-214`, §3.8 worktree-safe 경로 규약, `derive/sources/session-activity.js:34`(reader 기준점)
- **Validate**: guarded write 1회 → `evidence_guard_active` 1건. 인위적 base-hash 불일치 주입 → `overwrite_observed` 기록 + write 거부. 필드 cap·malformed 격리 회귀 유지. **(CL-5) cwd를 repo 하위 디렉토리로 바꿔 hook을 실행해도 이벤트가 reader가 스캔하는 동일 경로에 기록됨** + **worktree 2개 fixture에서 서로의 이벤트가 교차 계상되지 않음**.

### Task 6: B2 산출 가능화 (M2 강등 해제)
- **Action**: `session-activity.js` — dead read를 신규 taxonomy로 교체. `msw-metrics/index.js#computeB2`: **coverage gate 통과** ∧ 분모>0 → `computed`(분자 = `overwrite_observed`, 분모 = `concurrent_pairs`), 분모 0 → `invalid`(무결성 규칙 유지), gate 미통과 → **기존 `forward-only` 유지**. `prevented` 건수는 병기하되 **분자 미계상**(예방은 사고가 아니다 — 계상하면 방어가 잘 될수록 지표가 나빠지는 역인센티브). `fixture.js`의 `claimedComputable`에 B2 추가.
- **(Codex R1 F2) `guard_active` 단독은 자기증언이다 — coverage gate로 대체**: 초안은 `collision_producer_present`를 `evidence_guard_active`에서 파생했는데, 그것이 증명하는 것은 "**어떤** guarded write가 1회 이상 있었다"뿐이고 "**모든** receipt 변형 경로가 덮였다"가 아니다. writer 하나를 놓치거나 나중에 직접 write가 추가되면 그 경로는 `guard_active`도 `overwrite_observed`도 emit하지 않으므로, **덮이지 않은 writer가 있는데 B2가 `computed 0/N`으로 뒤집힌다** — M2가 거부한 결함이 한 층 위로 올라간 것(Codex 지적 정확). 초안 Risk 표에 교차검증을 적었으나 **Task 6 validate·Acceptance에 기계적 gate가 없었고**, 그것이 정확히 "risk 표에만 적힌 방어"라는 이 repo의 반복 실패 형태다. 따라서 B2 flip을 아래 **coverage gate 통과에 종속**시키고, 하나라도 실패하면 B2는 정직하게 `forward-only`로 남는다:
  0. **(Codex R2 F3 — primary falsifier) 런타임 파일시스템 변형 감사**. R2는 위 정적 접근이 여전히 반증 불가라고 지적했고 **옳다** — 소스 텍스트 스캔은 동적 경로·셸/스크립트 writer·생성 코드·repo 밖 writer를 원리상 못 본다. 따라서 **관측을 guarded producer 밖으로 옮긴다**: acceptance/e2e 하니스가 receipts 트리의 **사전/사후 스냅샷**(`path → {receipt_hash, mtime, size}`)을 뜨고, 관측된 모든 delta가 대응 guard 이벤트를 갖는지 검사한다. 대응 없는 delta가 **하나라도** 있으면 gate 실패 → B2는 `forward-only` 유지. 이 감사는 writer가 무엇이든(우리 코드든 셸이든) **파일시스템 결과로만** 판정하므로 *우발적* 미계측 writer에 대해 회피 불가능하고, 아래 정적 축의 blind spot을 실제로 덮는다(적대적 위조자에 대해서는 아래 I4의 위협 모델 참조 — "위조 불가능"이라고 쓰지 않는다). **(santa R2 J7 — Reviewer A) gate-pass 판정 규칙을 모호하지 않게 고정한다**: "delta에 대응 guard 이벤트가 있다"의 정확한 정의는 — 관측된 `receipt_hash` 변경 각각에 대해, 같은 `target` 경로를 가리키고 `pre_hash`가 **변경 전 관측값**과 같고 `post_hash`가 **변경 후 관측값**과 같은 guard 이벤트가 msw-events 로그에 **정확히 1건 이상** 존재할 것. 시계 오차 흡수를 위해 이벤트 `ts`는 관측 창 ±30s까지 허용한다. carved 5필드만 바뀐 변형(hash 불변, mtime 변경)은 **별도 분류**로 세고 hash-변경 커버리지 판정에는 넣지 않는다(범위 축소가 판정식에도 반영돼야 해석 차이가 안 생긴다). **mtime 축이 carved-field 변형까지 포착**하므로 항목 4의 범위 축소는 이제 *설명*이지 *구멍*이 아니다. **(santa R1 I4 — Reviewer B) 단, "delta + 아무 guard 이벤트"로는 부족하다** — 그러면 우회 writer가 write와 함께 `evidence_guard_active`를 하나 흘려 **자기증명**할 수 있고, 초안의 부정 fixture는 "이벤트 없음" 한 형태만 검사했다. 따라서 guard 이벤트에 **변형 전 hash와 변형 후 hash를 함께** 기록하고, 감사는 이벤트의 pre-hash가 관측된 **사전** 상태와, post-hash가 관측된 **사후** 상태와 각각 일치할 것을 요구한다(사후만 맞추는 사후조작으로는 통과 못 함). 부정 fixture를 **2종**으로 늘린다: (i) 이벤트 없는 우회 write, (ii) **위조 이벤트를 동반한** 우회 write. **위협 모델은 정직하게 명시한다** — 이 gate가 겨냥하는 것은 *우발적 미계측 writer*(신규 직접 write 유입·셸 스크립트·생성 코드)이지 **repo write 권한을 가진 적대적 위조자가 아니다**. 후자는 in-repo gate로 원리상 방어 불가이며(감사 자체를 고칠 수 있으므로), 단일 운영자 신뢰경계라는 PRD 전제상 범위 밖이다. 이 한계를 설계 문서에 적고, gate가 막지 *못하는* 것을 막는다고 주장하지 않는다.
  1. **정적 lint(보조)** — `.claude/receipts` 경로에 write하는 코드가 승인된 helper(`store.js#writeReceipt` · 2 메타 stamper · sanctioned migration) 밖에 존재하면 실패(신규 직접 writer 유입을 **사전** 차단 — 0번이 사후 검출인 것과 역할 분담).
  2. **변형 entrypoint 레지스트리** — 기대 mutation 경로를 명시 목록으로 두고 lint 결과와 대조(목록 밖 = 실패, 목록에 있는데 guard 미경유 = 실패).
  3. **per-mutation 상관 — 방향이 결정적이다(Claude 독립분석 CL-4)**. 초안은 "각 receipt 변형이 guard 이벤트와 1:1 대응"이라고만 적어 방향을 명시하지 않았는데, **guard 이벤트에서 출발해 receipt를 확인하는 방향은 미커버 writer를 원리상 볼 수 없다**(guard를 안 탄 write는 guard 이벤트를 남기지 않으므로 열거 자체에 안 잡힌다 — F2가 지적한 자기증언이 한 층 위에서 재발). 따라서 열거의 출발점은 **guard가 만들지 않은 독립 소스**여야 한다: **receipt corpus의 `receipt_hash` 관측값**에서 출발해, 각 hash 변경이 대응 guard 이벤트를 갖는지 요구한다. 미커버 writer는 "guard 이벤트 없는 hash 변경"으로 **가시화**된다. 총량 비교는 금지(누락 은폐).
  4. **커버리지 주장의 범위를 증명 가능한 만큼으로 축소(CL-4)** — `receipt_hash`는 카브아웃 5필드(`meta.briefing_summary`·`briefing_token_count`·`briefing_token_estimated`·`briefing_invocation_count`·`ledger_write_skipped`, `hash.js:198-224` 실측)에 **불변**이므로, hash 기반 열거는 hash-carved 변형을 구조적으로 못 본다. 이를 구멍으로 두지 않고 **주장 범위로 전환**한다: B2가 보증하는 것은 **hash 변경 변형(=봉인된 증거)의 커버리지**이고, carved 변형은 §3.12상 봉인 증거를 바꿀 수 없으므로 그 손실은 **증거 손실이 아니라 메타 손실**이다. 이 분할이 F1의 caller 비대칭(메타 stamper fail-open)과 **동일한 원리**라는 점이 중요하다 — 두 결정이 임기응변이 아니라 하나의 경계(봉인 내용 vs carved 메타)에서 나온다.
  5. **부정 fixture** — 의도적으로 guard를 우회한 write를 주입하면 B2가 `computed`로 **뒤집히지 않아야** 한다(gate의 반증 가능성 입증).
- **Mirror**: `msw-metrics/index.js#computeB3`(computed 반환 형태 + anti-gaming 병기), `fixture.js` 강등 주석 규약, `msw-metrics/index.js:210-214`(M2가 명시한 independence 요구 — 이 gate가 그 요구의 답)
- **Validate**: `derive/cli.js metrics-assert --fixtures --dry-run`이 B2를 claimed-computable로 강제(baseline-forming/null이면 non-zero exit). **coverage gate 각 항 독립 test**(런타임 감사 primary 포함) + **부정 fixture에서 B2가 forward-only로 남음**(가장 중요한 회귀 — 통과하면 gate가 실효) + **정적 축만으로는 통과하지만 런타임 축이 잡는 케이스**(셸 write 주입 — 두 축의 역할 분담 입증). 실 corpus에서 gate 통과 시 `computed`. 분모 0 fixture → invalid.

### Task 7: advisory 통보 (SessionStart + work.md 조기 경고)
- **Action**: `session-start.js` — **`listClaims()` 단독**으로(각 claim의 `last_touch` TTL로 live 판정) 다른 세션이 점유한 작업 단위를 `<system-reminder>`에 주입(차단 없음). **(santa R3 — Reviewer B) 초안은 여기서 `listLedgers({activeOnly:true})`를 교차 참조했는데, Task 4가 그 substrate를 무효로 판정한 뒤에도 남아 있어 자체 모순이었다** — advisory 표면이 plan 스스로 실격시킨 소스 위에 서 있으면 "경고가 안 뜬다"가 "충돌이 없다"로 오독된다. ledger는 참조하지 않는다. 모듈 로드 실패에도 세션 부팅 무중단(fail-loud-open). `work.md` Step 0 — 착수 slug의 점유를 조기 확인해 사용자에게 알린다. **본문에 다음 문장을 그대로 넣는다(santa R2 J9 — Reviewer A)**: "이 단계는 **조기 경고 전용**이다. 실제 강제는 receipt write 시점(evidence lock + claim 판정)에서 일어난다. 이 경고를 무시하고 진행해도 안전하며, 중복 점유는 write 시점에 기계적으로 거부된다." — advisory 게이트와 enforcement locus를 같은 문장 안에서 구분해, 둘을 혼동해 "여기서 막히지 않았으니 안전하다"로 읽히는 것을 차단한다(command body 게이트 신뢰 금지).
- **Mirror**: `session-end-trace.js:70-82`(fail-loud-open), 기존 SessionStart STATE.md 주입
- **Validate**: 다른 live 세션 점유 fixture → SessionStart 출력에 통보 등장, 부팅 차단 0. 모듈 삭제 주입 시 세션 정상 부팅 + loud stderr.

### Task 8: 대시보드 B2 표면 + 릴리스 메타
- **Action**: `renderer/sections/msw-metrics.js`가 B2를 실수치로 표시. **(critique F1)** 단순히 값만 바꾸면 안 된다 — `METRICS_ORDER`에서 B2는 index 4이고 `TOP_EXPANDED=3`이라 **B2 행이 `<details>` collapse 안으로 떨어진다**. M3의 헤드라인 지표가 첫 화면에서 안 보이면 PRD 수용조건("운영자가 문서를 읽지 않고 판정")을 충족하지 못한다. 따라서 expanded 슬라이스를 **index 순서가 아니라 의사결정 우선순위**로 선정한다(severe/invalid → computed 중 결정 관련도 순). 제약 (4)의 상한 3은 그대로 유지 — 순서만 바뀌고 개수는 안 늘어난다. **(critique F2)** `METRICS_META.B2`의 `name`/`desc`를 같은 Task에서 갱신한다 — 현재 desc가 "동시 활동 쌍당 **파일 충돌** 이벤트"인데 M3 이후 분자는 `overwrite_observed`(증거 덮어쓰기 사고)이므로 라벨이 의미상 거짓이 된다. computed 값을 stale 라벨 아래 노출하는 것은 PRODUCT.md 원칙 2(PM voice) 위반이고 PRD B1(drift) 정신에도 반한다. 릴리스 메타: `plugin.json` 1.23.1, footer 2면(`html.js:1419`·`markdown.js:163`) 동기, `CHANGELOG.md` row, `CLAUDE.md` §3.6에 세 번째 lock(evidence write lock — canonical hash 모델 아님·token+0o600 advisory·**fail-closed**, 기존 두 lock과의 차이 명시) 등록 + §4에 토글 1개 문서화, PRD M3 행 in-progress + Plan 셀.
- **Design (Output Constraints — SKILL.md, §3.9)**: 렌더 표면이므로 4제약 준수 —
  1. **heading depth ≤ 3** — B2는 기존 `## 계측` 하위 **표 셀**로만. 신규 heading 추가 금지(H15 produced-diff lint 대상).
  2. **강조색 화면당 ≤ 1** — `overwrite_observed > 0`(실사고)만 severe 색. `prevented`는 **중립 톤**(예방 성공이 경고색으로 보이면 정반대로 오독된다). 기존 `STATUS_META`의 ok/warn/bad 공존은 pre-existing이므로 신규 색을 **추가하지 않는다**.
  3. **raw markdown marker 금지** — 신규 문자열(`prevented` 라벨 등)은 렌더 문자열만. html escape 경유. 기존 `**${id}**` 패턴은 pre-existing(critique F5, M3 미유발)이므로 **새 marker를 늘리지 않는 것**이 이번 범위.
  4. **list-of-N 상한** — expanded는 **3개 유지**(늘리지 않음). B2 노출은 개수 확대가 아니라 위 F1의 우선순위 정렬로 달성한다. 초과분은 기존 `<details>` collapse.
  - **(critique F3) 배치 확정** — `값` 셀은 `n/N`(예 `0/20`) **한 지표만**. `prevented` 건수는 `<details>` 상세로 내린다(값 셀에 숫자 3개를 넣으면 PRODUCT.md의 compact/telegraphic 톤이 깨진다). **producer-present 전용 표시는 만들지 않는다** — `status=computed`가 이미 producer 배선을 함의하므로 중복이고 5번째 컬럼은 4-컬럼 compact 레이아웃을 깬다.
  - **(critique F4) 카피 규칙** — 신규 렌더 문자열에 **em-dash 금지**(`—`/`--`). 근거: impeccable detector가 현 `status.html`에 em-dash 7건(warning)을 이미 보고하고, `formatValue`가 H10-safe 주석으로 같은 규칙을 이미 인지한다. 구분자는 `·` 또는 괄호. 한국어 primary + 기술 식별자는 영어 유지(PRODUCT.md).
- **Mirror**: `renderer/sections/msw-metrics.js` 기존 행 구성(`METRICS_META`·`STATUS_META`·`TOP_EXPANDED`), `renderer/sections/multi-session.js`, CLAUDE.md §3.7
- **Validate**: `node plugins/mccp/scripts/derive/cli.js render` → STATUS.md의 **expanded(non-collapse) 영역**에 B2 실수치 존재(collapse 안이면 실패). B2 `name`/`desc`가 `overwrite_observed` 의미와 일치. 신규 문자열에 em-dash 0. heading depth ≤ 3. 신규 색 클래스 0. version 3면(plugin.json + 2 footer) 일치. XSS payload 자기주입 escape.

### Task 9: 동시성 stress + 단일 세션 무회귀
- **Action**: `receipt-write-concurrency.test.js` — N개 자식 프로세스가 동일 `(gate, decision)`에 동시 write(세 경로 store/briefing/completion-ledger 교차). 불변식: 최종 파일이 항상 파싱 가능(torn 0) · 각 writer의 변경이 조용히 소실되지 않음(lost update 0) · 거부는 전부 `evidence_conflict_prevented`로 기록 · `overwrite_observed` 0. `receipt-bytes-stable.test.js` — 변경 전후 바이트 동일(§3.12). 단일 세션 경로: 기존 전체 스위트 green + 멱등 재진입 no-op.
- **Mirror**: `msw-events.test.js`의 N-writer stress 구성(M2 R2 F1)
- **Validate**: 아래 Validation 블록 전 항목 통과. Windows에서 flake 없이 반복 통과(rename retry가 실효).

## Validation

> **셸 명시 (santa R1 I7 — Reviewer B)**: 아래 블록은 **POSIX sh(Git Bash)** 기준이다. 이 저장소의 CLAUDE.md는 PowerShell을 primary로 적는데, `!` 부정·`grep -q`·파이프는 PowerShell에서 그대로 돌지 않는다. 본 세션에서 Bash 도구로 전 항목 실행을 확인했으므로 명령 자체는 유효하며, **implementer는 Bash로 실행**한다. PowerShell만 쓰는 환경이면 `Select-String` + `$LASTEXITCODE` 분기로 옮기되, **판정 기준(무엇이 실패인가)은 바꾸지 않는다**.

```bash
cd C:/_project/my/mccp/.worktrees/v1.23.1-multi-session-m3

# 1. 신규/변경 단위 테스트
node --test plugins/mccp/scripts/receipt/tests/evidence-lock.test.js \
            plugins/mccp/scripts/receipt/tests/receipt-write-concurrency.test.js \
            plugins/mccp/scripts/receipt/tests/receipt-bytes-stable.test.js \
            plugins/mccp/scripts/lib/tests/evidence-claim.test.js \
            plugins/mccp/scripts/lib/tests/msw-metrics-b2.test.js \
            plugins/mccp/scripts/lib/tests/b2-coverage-gate.test.js

# 2. B2 강등 해제가 기계적으로 강제되는지 (truthy 체크로는 통과 못 함)
node plugins/mccp/scripts/derive/cli.js metrics-assert --fixtures --dry-run   # B2 claimed-computable, 실패 시 non-zero
node plugins/mccp/scripts/derive/cli.js run --strict                          # schema contract probe

# 2b. (Codex R1 F2) coverage gate — 승인 helper 밖에서 receipt 경로에 write하는 코드 0.
#     gate가 실패하면 B2는 forward-only로 남아야 하고, 부정 fixture가 그것을 입증한다.
node plugins/mccp/scripts/lib/msw-metrics/b2-coverage-gate.js --json          # {ok:true} 아니면 non-zero
! grep -rnE "(writeFileSync|writeFile|appendFileSync|createWriteStream)\([^)]*receipts" \
    plugins/mccp/scripts --include=*.js \
  | grep -vE "receipt/store\.js|receipt/evidence-lock\.js|lib/briefing/index\.js|lib/completion-ledger/index\.js|migrations/|/tests/"

# 2b-1. (santa R4) 세션-안정 정체 소스 재현 — 리뷰어가 직접 확인할 수 있어야 한다.
#       CLAUDE_PID는 3회 모두 동일해야 하고, process.pid는 매번 달라야 한다.
for i in 1 2 3; do node -e 'console.log(process.env.CLAUDE_PID+" "+process.pid)'; done
node -e 'process.kill(Number(process.env.CLAUDE_PID),0); console.log("session process ALIVE")'

# 2c. 핵심 안전 회귀 — 이 5건이 통과하지 않으면 M3의 주장이 거짓이다.
node --test plugins/mccp/scripts/receipt/tests/evidence-lock.test.js   # (R1F1) abandoned-live-lock reclaim + PID-reuse
                                                                      # (R2F1/CL-2) slow-live-holder: reclaim 후 원 holder의 뒤늦은 write 거부
node --test plugins/mccp/scripts/lib/tests/evidence-claim.test.js      # (R1F3) A만료→B승계→A부활 → superseded epoch 거부
                                                                      # (R2F2/CL-1) holder 본인 write 통과 · claim 없는 standalone 통과
                                                                      # (santa R2 J1/J8) 서로 다른 게이트 2 프로세스가 같은 slug에 동시 write
                                                                      #   → O_EXCL로 정확히 1개만 claim 생성, 나머지는 EEXIST 후 holder 대조
                                                                      # (santa R2 J3) A가 release 없이 죽어도 승계자가 tombstone 기록 → 부활 A 거부
                                                                      # (santa R2 J4) claim liveness가 ledger PID에 의존하지 않음
                                                                      #   (PID가 죽은 상태에서도 last_touch TTL 안이면 live로 판정)
node --test plugins/mccp/scripts/lib/tests/b2-coverage-gate.test.js    # (R1F2) 부정 fixture: 우회 write → B2 미flip
                                                                      # (R2F3) 런타임 변형 감사: guard 이벤트 없는 delta 검출
node --test plugins/mccp/scripts/lib/tests/msw-events-path.test.js     # (CL-5) cwd 무관 기록 + worktree 교차 계상 0

# 3. lock/tmp 파일명이 gitignore glob에 실제로 걸리는지 (ship receipt 디렉토리 오염 방지)
git check-ignore -v .claude/state/evidence-claims/x.json
git check-ignore -v .claude/receipts/mccp-pr-codex/x.json.lock
git check-ignore -v ".claude/receipts/mccp-pr-codex/x.json.1234.abcd.tmp"

# 4. 대시보드 렌더 + B2 표면
node plugins/mccp/scripts/derive/cli.js render && grep -q "B2" .claude/cache/STATUS.md

# 5. version 3면 동기 (plugin.json + html footer + markdown footer)
node -e 'const v=require("./plugins/mccp/.claude-plugin/plugin.json").version; if(v!=="1.23.1")process.exit(1)'
grep -q "v1.23.1" plugins/mccp/scripts/lib/renderer/html.js
grep -q "v1.23.1" plugins/mccp/scripts/lib/renderer/markdown.js

# 6. 추가 LLM 호출 0 (M2 no-LLM 계약을 신규 hot path로 확장)
! grep -rn "codex-invoke\|briefing/invoke\|Skill(\|Agent(" \
    plugins/mccp/scripts/receipt/evidence-lock.js \
    plugins/mccp/scripts/state/evidence-claim.js

# 7. 머지 사고 검증 (§3.5.1 의무)
git diff --diff-filter=D --name-only origin/main...HEAD

# 8. 전체 회귀
node --test plugins/mccp/scripts/**/tests/*.test.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **fail-closed lock이 receipt write를 하드 차단 → 파이프라인 정지**(최악: 게이트 재실행 = 가장 비싼 연산) | 중 | **(Codex R1 F1 흡수)** 임계구역이 **ms 단위 파일 IO만**(LLM 미포함) + **짧은 lease(5s)가 PID liveness와 무관하게 적용**(tri-state 미차용 — 그것이 영구 stall의 원인) + **heartbeat 연장**(진행 중 holder는 lease 유지, 정지한 holder만 reclaim 대상 — santa R1 I1) + abandoned-live-lock·PID-reuse 회귀 test + **caller별 정책 명문화**(evidence는 fail-closed, hash-carved 메타는 fail-open + loud skip) + `warn` kill switch + 에러에 lock 경로·잔여 lease·복구 지침 포함 |
| **(santa R1 I1) reclaim ↔ rename TOCTOU로 sealed 증거가 조용히 유실** | 높음 | **원리상 완전 차단 불가**(`rename`은 advisory lock에 대한 CAS가 아님) — 두 리뷰어가 독립 확인. 따라서 보증을 **"무손실"이 아니라 "무-무성손실"**로 재정의: heartbeat 연장으로 창을 "진짜 고장"으로 축소 → **post-rename 검증**(재read 후 our-hash 대조)으로 패배를 확정 관측 → `evidence_overwrite_observed` 기록 + **fail-closed throw**로 게이트 중단. B2가 세는 것은 *사고 건수*이고 **감지·차단된 경합은 조용한 덮어쓰기가 아니다**. plan 전 구간에서 이 문구로 통일 |
| **재생(replay) — 좌초된 holder가 부활해 승계된 작업에 write** | 중 | **(Codex R1 F3 → santa R1 I3 정정)** 최소 fence를 M3으로 이동. **epoch을 caller가 "제시"하지 않는다**(그 문구는 Task 4 재설계 전 잔재였고 santa R2 리뷰어 B가 자체 모순으로 지목) — `writeReceipt`가 claim 레코드를 스스로 읽어 **`{session_id, host, session_pid}` 3원소 holder 정체**와 실행 프로세스를 대조하고, release는 삭제 대신 **tombstone**(TTL) 보존이라 live holder가 없어도 stale 부활을 거부한다. "A 만료 → B 승계 → B release → A 부활" 회귀 필수. **TTL 만료 후에는 fence가 lapse**하며 이는 숨기지 않고 known-gap test로 고정 — 무기한 방어는 전역 단조 순번을 요구하므로 **M5** 소관 |
| **Windows rename/unlink 실패**(AV·열린 핸들 → EPERM/EBUSY) 로 원자 write가 간헐 실패 | 중 | bounded retry + 실패 시 tmp 정리 + throw(부분 write 잔존 금지). 플랫폼이 win32이므로 stress test를 Windows에서 반복 실행해 flake 부재 확인 |
| **토글 1개 추가가 B3 방향(≤40, 단조 증가 억제)과 역행** | 높음 | 신규 toggle을 **정확히 1개**로 제한하고 설계 문서 + CLAUDE.md §4에 등재해 M4 축 인벤토리의 명시 대상으로 넘긴다. default 고정 원칙(제거는 삭제 아니라 default 고정) 준수 |
| **B2 flip이 값싸게 위조 가능**(guard_active만 emit하고 실제 커버리지 없음) | 높음 | **(Codex R1 F2 흡수)** `guard_active` 단독 파생 폐기 — 4중 **coverage gate**(정적 lint · entrypoint 레지스트리 · **건별** guard 상관 · 부정 fixture)를 Task 6 validate와 Acceptance에 **기계적으로** 인코딩. 총량 비교 금지(누락 은폐). gate 실패 시 `forward-only` 유지. prevented를 분자에 넣지 않아 "방어 잘하면 지표 악화" 역인센티브 제거 |
| **§3.12 no-rehash 위반** — write 경로 변경이 기존 tracked receipt hash를 흔듦 | 중 | 바이트 동일성 회귀 test(변경 전후 동일 입력 → 동일 `receipt_hash`). `assertNoTrackedOverwrite`는 제거하지 않고 lock **안으로만** 이동(보호 강화, 완화 아님) |
| **점유 도입이 단일 세션 사용성 해침** | 중 | 동일 세션 재진입 멱등 no-op + 코스한 착수는 advisory(차단 아님) + enforce는 실제 충돌 시 write-side만. 기존 스위트 green이 수용 조건 |
| **M2 하위 표면 회귀** — msw-events allowlist·session-activity 변경이 A1/A2 산출을 깨뜨림 | 중 | allowlist는 **추가만**(기존 필드·cap·malformed 격리 불변). M2 test 스위트를 무수정 통과가 조건 |
| 3파일 write 경로 통합이 미묘한 데드락(중첩 lock) 유발 | 낮음 | 같은 target에 대한 재진입 금지 규약 + 중첩 획득 시 즉시 throw하는 assert. store→briefing→ledger 순차 호출이 각각 acquire/release하도록(감싸는 lock 없음) |
| **(Claude 독립분석 CL-3) version 충돌 — sibling worktree가 같은 `1.23.1`을 선언** | 높음 | 실측(**santa R1 I5 정정 — 아래 두 사실을 분리한다**): (a) sibling `plugins/mccp/.claude-plugin/plugin.json`의 **현재 값은 `1.23.0`**(아직 bump 안 됨), (b) 그 worktree의 `.claude/plans/codex-intent-context-m1.plan.md` **Files-to-Change 표가 `plugin.json` `1.23.0 → 1.23.1`을 선언**한다. 따라서 충돌은 **현재 파일 상태가 아니라 장래(둘 다 ship 시) 충돌**이다. 초안은 이 구분을 흐렸고 줄 번호도 `L67`로 잘못 적었다(실제 `L71`) — 교차-worktree 인용은 상대 worktree가 계속 편집되어 줄이 밀리므로 **줄 번호가 아니라 내용(Files-to-Change 표의 `plugin.json` 행)으로 고정**한다. `git worktree list`에 `feat/codex-intent-context`가 동시 존재(base 동일 `ee1cfb8`). 둘 다 1.23.1로 머지되면 §3.7 cache 디렉토리가 충돌하고 `claude plugin update`가 한쪽을 조용히 덮는다. **완화**: 나중에 머지되는 쪽이 `1.23.2`로 상향(§3.7 forward-only reconcile 선례) — PR 작성 시 `origin/main`의 `plugin.json`을 재확인해 결정하고, footer 2면도 같은 값으로 동기. **부수 관측**: 이 충돌 자체가 M3이 다루는 문제(동시 세션의 상태 발산)의 실사례이며, 현 파이프라인이 그것을 **자동으로 감지하지 못한다**는 증거다 — B2 분모(concurrent pair)에 계상될 실제 세션 쌍 |

## Acceptance
- [ ] `.gitignore` 등록이 아티팩트 생성 Task보다 **선행**(커밋 오염 창 0) + `git check-ignore` 3건 통과
- [ ] receipt write 3경로(store / briefing / completion-ledger) 전부 동일 lock 임계구역 경유 · `assertNoTrackedOverwrite`가 lock **안**에서 재검(TOCTOU 폐쇄)
- [ ] N-writer stress에서 **torn/partial 0 · lost update 0 · 승자 1**, 거부는 전부 이벤트로 기록
- [ ] lock 획득 실패가 **fail-closed**(조용한 성공 0) + `EVIDENCE_LOCK_UNAVAILABLE` loud 전파(lock 경로·잔여 lease·복구 지침 포함)
- [ ] **(Codex F1) 영구 stall class 부재** — abandoned-live-lock(holder PID 생존 + 임계구역 중단)이 lease 만료로 reclaim됨 · PID-reuse도 reclaim됨 · caller별 정책 test 통과(evidence fail-closed / 메타 stamper fail-open + loud skip)
- [ ] 동일 slug를 두 live 세션이 잡을 수 없음(1승 1거부) · 동일 세션 재진입 멱등 · dead holder 자동 승계
- [ ] **(Codex F3) 부활 holder 거부** — "A 만료 → B 승계 → B release → A 부활 → A의 write가 stale `claim_epoch`로 거부" 회귀 통과(tombstone TTL 내). TTL 경과 후 동작도 명시 test
- [ ] **B2가 `forward-only` → `computed`로 flip** — 단 **coverage gate 통과가 전제**(Codex R1 F2 + R2 F3: 런타임 변형 감사 primary + 정적 축 보조). `metrics-assert --fixtures --dry-run`이 B2를 claimed-computable로 강제(baseline-forming이면 실패). 분모 0 → invalid 유지, prevented 분자 미계상
- [ ] **(Codex F2) gate가 반증 가능** — 부정 fixture(guard 우회 write 주입)에서 B2가 `computed`로 **뒤집히지 않음**. 승인 helper 밖 receipt-path write 0(정적 lint). 상관은 총량이 아니라 **건별**
- [ ] **(CL-1 + Codex R2 F2) epoch lifecycle 5분기 전수 통과** — Task 4 표 그대로: 레코드 부재 → 통과(standalone 게이트 5개 `plan`/`prp-implement`/`pr`/`code-review`/`receipt-write` 무회귀) · live holder 본인 → **통과**(정당 경로가 막히지 않음) · 다른 live holder → 거부 · tombstone + stale epoch → 거부 · tombstone + 승계자 → 통과. **CLI 인자 변경 0**(epoch을 LLM이 flag로 나르지 않음)
- [ ] **(santa R1 I1) G3 "무-무성손실"이 기계적으로 성립** — heartbeat 연장으로 진행 중 holder가 reclaim되지 않음 · reclaim↔rename 경합을 인위 주입하면 **post-rename 검증이 패배를 감지**해 `evidence_overwrite_observed` 기록 + throw(조용한 통과 0). plan 어디에도 "lost update 불가능" 표현이 남아 있지 않음
- [ ] **(santa R1 I2) 암묵 claim-on-first-write로 "레코드 부재" 분기가 소멸** — 미claim slug에 첫 write 후 레코드가 존재하고, 두 번째 live 세션의 write가 거부됨 · 진짜 동시 진입(둘 다 부재 관측)에서 lock 직렬화로 한쪽만 생성 성공 · standalone 단일 세션 동작 무변화(멱등) · CLI 인자/command body 변경 0
- [ ] **(santa R1 I3) 정체 분기 전수** — holder 정체가 `{session_id, host, session_pid}` 3원소이고 셋 모두 일치할 때만 동일 holder · `session_id` 부재 프로세스 2개가 서로를 자기 자신으로 오인하지 않음 · 동일 `session_id` 공유 2 프로세스가 하나로 붕괴하지 않음 · **tombstone TTL 만료 후 fence lapse가 known-gap test로 고정**(조용한 동작 변화 감지)
- [ ] **(santa R2 J4) claim liveness가 ledger PID 축에 의존하지 않음** — `listLedgers({activeOnly:true})`가 공집합을 반환하는 환경(= 실제 단일 머신 환경)에서도 G1·G2가 정상 발화 · claim 자체 `last_touch` TTL로 판정 · session-ledger PID 결함은 상류 이슈로 backlog 기록
- [ ] **(santa R3 OQ-1) 동일 세션 재진입이 실제로 멱등** — 같은 세션이 `cli.js`를 **여러 번 별도 프로세스로** 실행해도(=정상 게이트 동작) 두 번째 이후 write가 거부되지 않음 · 정체가 `{session_id, host, session_pid}`이고 `session_pid`가 `process.pid`가 **아니라** `CLAUDE_PID`임을 회귀로 고정 · `session_id` 부재 시 claim 미생성 + `claim_skipped_no_identity` 기록(정상 경로 무중단) · `CLAUDE_PID` 부재 시 TTL 단독 강등 + loud
- [ ] **(santa R3 OQ-2) G3가 writer 생존에 의존하지 않음** — 덮어쓴 쪽이 rename 직후 보고 **전에** 죽는 시나리오를 주입해도 B2 런타임 감사가 같은 사건을 독립 검출 · plan 어디에도 "덮어쓴 쪽이 **반드시** 보고한다"는 표현 없음
- [ ] **(santa R2 J1) claim 생성이 `O_EXCL`로 원자적** — 같은 slug·**서로 다른 게이트**의 두 프로세스가 동시 write해도 정확히 1개만 생성 성공(receipt lock이 (gate,slug)별이라 직렬화해주지 않음을 회귀로 고정)
- [ ] **(santa R2 J3) tombstone이 승계 시점에 기록됨** — A가 `releaseClaim` 없이 죽어도 승계자 B가 superseded epoch를 보존 → 부활 A 거부. `releaseClaim` 호출 누락이 정확성을 깨지 않음
- [ ] **(santa R2 J2) G3 문구가 실제 보증과 일치** — 덮어쓴 쪽이 rename **후** 소유 재확인으로 항상 보고 · 덮인 쪽의 늦은 인지가 **잔여로 명시 기록**(plan 어디에도 그보다 강한 표현 없음)
- [ ] **(santa R2 J5) `pre_hash`·`post_hash`·`claim_epoch`가 ALLOWED_FIELDS에 존재** — emit한 필드가 `eventToJsonLine`에 strip되지 않고 디스크에 남음(미추가 시 I4 전체가 무효)
- [ ] **(santa R2 J7) gate-pass 판정식이 모호하지 않음** — target 일치 + pre/post hash 일치 + ts ±30s 창 · carved-only 변형은 별도 분류
- [ ] **(santa R1 I4) 위조 이벤트 방어 + 위협 모델 명시** — guard 이벤트가 pre/post hash를 모두 기록하고 감사가 양쪽을 관측 상태와 대조 · 부정 fixture **2종**(이벤트 없는 우회 · **위조 이벤트 동반 우회**) 모두 B2 flip 차단 · 설계 문서에 "적대적 위조자는 범위 밖(단일 운영자 신뢰경계)"을 명시
- [ ] **(Codex R2 F3) 런타임 변형 감사가 primary falsifier로 동작** — e2e에서 guard를 우회한 셸 write를 주입하면 사전/사후 스냅샷 delta가 대응 guard 이벤트 없이 검출되어 gate 실패 → B2 `forward-only` 유지. 정적 lint 단독으로는 통과하는 케이스여야 유효(두 축의 역할 분담 입증)
- [ ] **(CL-5) msw-events writer↔reader 경로 일치** — cwd를 repo 하위 디렉토리로 바꿔 hook 실행 시에도 reader가 스캔하는 동일 경로에 기록 · worktree 2개 fixture에서 교차 계상 0(B2 분모 오염 부재)
- [ ] **(CL-2) lease reclaim이 lost update를 재도입하지 않음** — 느린 writer 시뮬(임계구역 인위 지연 > lease)에서 reclaim 발생 시 **base-hash 선조건**과 **rename 직전 lock 소유 재확인**이 write를 거부하고 `evidence_overwrite_observed`를 기록(조용한 덮어쓰기 0)
- [ ] **(CL-4) 커버리지 상관의 출발점이 guard가 아니라 receipt corpus** — 미커버 writer가 "guard 이벤트 없는 `receipt_hash` 변경"으로 검출됨 · 커버리지 주장 범위가 **hash 변경 변형**으로 문서에 명시 축소되고 carved 5필드 예외가 §3.12 근거와 함께 기록됨
- [ ] **(CL-3) version 충돌 해소** — PR 작성 시 `origin/main`의 `plugin.json`을 재확인해 sibling(`feat/codex-intent-context`)과 중복되지 않는 값 채택 + footer 2면 동기
- [ ] B2가 대시보드 **expanded(non-collapse) 영역**에 실수치로 표시(critique F1 — collapse 안이면 미충족) · `METRICS_META.B2` 라벨이 `overwrite_observed` 의미와 일치(F2) · prevented는 collapse 상세·producer 전용 표시 없음(F3) · 신규 렌더 문자열에 em-dash 0(F4) · 신규 색 클래스 0 · heading depth ≤ 3
- [ ] §3.12 no-rehash — 변경 전후 동일 입력 receipt 바이트·`receipt_hash` 동일
- [ ] 추가 LLM 호출 0(no-LLM denylist를 신규 hot path로 확장) · 임계구역에 LLM 호출 부재
- [ ] M2 하위 표면 무회귀 — 기존 msw-metrics/msw-events/session-activity 스위트 무수정 통과
- [ ] **보증 범위가 축소·명시 선언됨**(Codex F3) — M3 = live 중복 점유 불가 + stale epoch write 거부. M5 = 전역 단조 순번·파생 상태 재생 순서·이력 보존. Summary·설계 문서·Acceptance 사이에 "구조적으로 불가능" 표현의 모순 0
- [ ] 신규 토글 정확히 1개 + CLAUDE.md §3.6(세 번째 lock)·§4(토글) 등재
- [ ] `git diff --diff-filter=D origin/main...HEAD`에 의도치 않은 삭제 0(§3.5.1)
- [ ] All tasks complete · Validation passes · Patterns mirrored, not reinvented
- [ ] plugin.json 1.23.1 + footer 2면 동기

## External Research Provenance

- Source PRD: .claude/prds/multi-session-work-loop.prd.md
- References section sha256: 1aaa7924f4e1ebed8993b242c00788e1c0ad84319463ff89f3a29625b33aa880
- Stamped at: 2026-07-30T09:34:48.058Z
- Anchor: plan body is hash-anchored by the plan-codex receipt plan_hash. Any post-stamp PRD ## References mutation mismatches on next /mccp:plan validate.

## Design Critique

- **SKILL first-step**: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints`(L80-109) Read 완료. 4 anchor(정보위계 3단계·강조색 ≤1·raw marker 금지·list-of-N top3+collapse) + H15 produced-diff lint 계약 확인.
- **Design surface**: `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js` → `.claude/cache/STATUS.md` + `status.html`. detector `design_signal=true`(signal_files 7건 — renderer 3면 + derive/receipt 경유).
- **Assessment A(design review)**: PRODUCT.md register=`product` · anti-refs(SaaS hero-metric / AI-cream / Bloomberg terminal) 대조. hero number 미도입 · 표 1행 추가 방식이라 anti-ref 저촉 0.
- **Assessment B(detector)**: `detect.mjs --json .claude/cache/status.html` 실행 — `em-dash-overuse`(warning, 7건) + `numbered-section-markers`(advisory, `06/10/11/12` = milestone id → false positive). **둘 다 pre-existing이며 M3이 유발하지 않는다**; F4가 신규 문자열에 대해 em-dash를 금지해 증가를 차단.

| Round | Verdict | 처리 |
|---|---|---|
| R0 | ESCALATE_NEXT_ROUND | HIGH 1 + MEDIUM 3 지목 → Task 8 Design / Files-to-Change / Acceptance **명시 섹션만** 편집 |
| R1 | **CONVERGED** | HIGH/CRITICAL 잔존 0. LOW 3건은 pre-existing·M3 미유발로 문서화 |

R0 findings 흡수:

| # | Sev | Finding | 흡수 |
|---|---|---|---|
| F1 | HIGH | `METRICS_ORDER`에서 B2가 index 4이고 `TOP_EXPANDED=3`이라 **B2 행이 `<details>` collapse로 떨어진다** — M3 헤드라인 지표가 첫 화면에 없으면 PRD 수용조건("문서 읽지 않고 판정") 미충족 | expanded 슬라이스를 index → **의사결정 우선순위**로. 제약(4) 상한 3은 유지(순서만 변경, 개수 불변). Acceptance에 "expanded(non-collapse) 영역" 명시 |
| F2 | MEDIUM | `METRICS_META.B2` desc가 "동시 활동 쌍당 **파일 충돌** 이벤트"인데 M3 이후 분자는 `overwrite_observed` → computed 값이 stale 라벨 아래 노출(PRODUCT.md 원칙 2 위반 · PRD B1 drift 정신 위배) | 같은 Task에서 `name`/`desc` 갱신 + Validate 항목 추가 |
| F3 | MEDIUM | `prevented`·producer 표시의 **배치 미확정** — 값 셀에 숫자 3개 또는 5번째 컬럼이면 compact 4-컬럼 톤이 깨짐 | 값 셀 = `n/N` 단일, prevented는 collapse 상세. **producer 전용 표시 폐기**(`status=computed`가 이미 producer 배선을 함의 — 중복) |
| F4 | MEDIUM | 4제약 목록에 **em-dash 금지 카피 규칙 부재** — detector가 현 표면에 7건 warning 중이고 `formatValue`가 이미 H10-safe 주석으로 같은 규칙 인지 | Task 8 Design에 카피 규칙 추가(구분자 `·`/괄호) + Validate에 "신규 문자열 em-dash 0" |
| F5 | LOW | 기존 `**${id}**` raw marker(제약 3) — repo 전역 pre-existing, M3 미유발 | 범위 밖으로 명시. 이번 범위는 "**새 marker를 늘리지 않는 것**" |

- **Verdict**: **converged** (rounds=2, cap=2). H15(heading ≤ 3)는 implement 시 Phase 3.7 produced-diff lint이 mechanical 재검증.

## Design Routing Guide

routing mode: `auto` (effective at implement stage). Plan 단계는 렌더된 UI가 없어 어떤 impeccable 명령도 **invoke하지 않는다** — 아래는 implementer 체크리스트다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

본 M3의 렌더 표면 변경은 기존 섹션의 표 1행 수준이라 implement 시 `renderingSurface` selector가 refine/discovery를 recommend로 강등할 수 있다(control-plane 비중이 큼). `evaluate`(critique/audit)는 모드 무관 유지.

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed wrapper, v0.2.2) + impeccable design-scope preamble(`--impeccable-available`)
- 실측: `classification=ok · blocking=0 · durationMs=389128`(~6.5분). **Codex 실발화**(usage limit 해소 — M2 사이클의 `exit-nonzero` advisory와 대조)
- 라운드 수: **2** — R1은 `MCCP_GATE_ROUND_CAP=1` default로 종료했고, **R2는 운영자의 명시 계속 지시("plan 고도화를 계속해줘")로 cap을 연장**해 실행했다. R2는 5.4 규정대로 focus를 **R1 흡수분의 재검증으로 한정**(신규 논점 개시 금지)
- 합치 결론: **R1·R2 모두 needs-attention (No ship)** — R1 `"still overclaims structural safety while introducing a hard-stop lock path and a self-attesting B2 gate"` · R2 `"the R1 absorptions close the named happy-path objections but introduce new split-brain and unverifiable-coverage holes"`. 누적 HIGH 6건 + Claude 독립 HIGH 4 / MED 1, **전건 ACCEPT_NOW**, DEFER 0 · REJECT 0
- **R2 실측**: `classification=ok · blocking=0 · durationMs=342350`. **background + exit marker로 호출**(codex `--timeout-ms 900000`이 Bash 도구 상한 600s를 초과하므로 foreground면 SIGTERM으로 리뷰를 통째로 버린다)
- **verdict 파생은 구조화 SoT 경유**: `codex-review-payload#deriveGateVerdict` → `verdict=divergent · source=structured`(raw `needs-attention`). free-text 스캔이 아니라 `.result.verdict`를 읽었다(v1.22.3 F5 계약). 흡수했다는 이유로 `converged`로 재작성하지 **않는다** — Codex의 재검증이 없으므로 cross-gate dedupe가 fail-closed되어 `/mccp:pr`에서 PR-Codex가 실발화하는 것이 옳다

- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 fail-closed lock이 복구 불가 stall class를 만든다 | HIGH | **ACCEPT_NOW** | 실코드 재현됨 — 초안이 `pr-phase-lock` tri-state("same-host+alive는 절대 reclaim 안 함")를 복사했으나 그 정당화는 **분 단위** lock에만 성립한다. ms 단위 임계구역에서 live holder의 lease 초과 = 고장이므로, tri-state + fail-closed 조합은 해당 receipt를 영구 차단한다. lease를 liveness와 무관하게 항상 적용 + caller별 정책 명문화로 흡수 |
  | F2 B2 producer presence가 자기증언이라 미커버 writer가 있어도 computed 0 | HIGH | **ACCEPT_NOW** | `guard_active`는 "**어떤** guarded write가 있었다"만 증명하고 "**모든** 경로가 덮였다"를 증명하지 않는다 — M2가 거부한 결함이 한 층 위로 이동. 초안 Risk 표에 교차검증을 적었으나 **validate·acceptance에 기계적 gate가 없었다**(이 repo의 반복 실패 형태). 4중 coverage gate + 부정 fixture로 흡수 |
  | F3 replay 방어 없이 "구조적으로 불가능"을 주장 | HIGH | **ACCEPT_NOW** | 반례 정확 — "A 만료 → B 승계 → **B release** → A 부활"에서 live holder가 없어 fencing이 통과, 닫힌 작업이 되살아난다. 게다가 초안 Acceptance("gap은 M5")와 PRD milestone("구조적으로 불가능")이 **상호 모순**이었다. 최소 fence(`claim_epoch` + release tombstone)를 M3으로 이동 + 보증 범위 축소 선언으로 흡수 |

### R2 — needs-attention (No ship), R1 흡수분 재검증

R2는 **CL 편집이 반영되기 전 스냅샷**을 봤다(호출 시점 기준). 그런데 그 3건이 같은 창에서 진행한 Claude 독립 분석의 CL-2 / CL-1 / CL-4와 **정확히 같은 세 지점에 독립 수렴**했다 — 서로의 출력을 보지 않은 두 리뷰어가 동일 결함을 지목한 것이므로 강한 신호다.

| Finding | Sev | Verdict | 처리 |
|---|---|---|---|
| F1 5s stale reclaim이 같은 임계구역에 writer 2명을 만든다(원자 rename은 torn만 막고 lost update는 못 막음) | HIGH | **ACCEPT_NOW** | CL-2와 동일 결론 · **이미 흡수**(base-hash 선조건 + rename 직전 lock 소유 재확인). R2가 요구한 **slow-live-holder 회귀 test**를 Task 2 Validate에 명시 추가 |
| F2 claim epoch fence가 기존 receipt entrypoint에 배선되지 않음 | HIGH | **ACCEPT_NOW** | CL-1과 같은 지점이나 **해소 방향은 Codex가 우세** — 내 "조건부 fence"만으로는 *정당한 holder 자신*이 epoch을 제시할 방법이 없어 정상 경로가 깨진다. epoch을 flag로 나르지 않고 `writeReceipt`가 **holder 정체 ↔ 실행 세션 정체**를 대조하는 lifecycle 표로 재설계(Task 4) |
| F3 coverage gate가 여전히 미계측 writer를 반증하지 못함(정적 스캔은 동적·셸·repo 밖 writer 불가시) | HIGH | **ACCEPT_NOW** | CL-4가 상관 *방향*을 고쳤으나 R2 지적대로 출발점이 여전히 소스 텍스트였다 → **런타임 파일시스템 변형 감사**(사전/사후 `hash`+`mtime` 스냅샷)를 primary falsifier로 승격, 정적 lint는 보조로 강등. mtime 축이 carved-field 변형까지 덮어 CL-4의 범위 축소가 *구멍*에서 *설명*으로 바뀜 |

### Claude 독립 분석 (R2와 병행, 출력 미공유)

| # | Sev | Finding | 처리 |
|---|---|---|---|
| CL-1 | HIGH | "모든 receipt write가 epoch 요구"는 claim을 획득하지 않는 **5개 command body**(`plan`/`prp-implement`/`pr`/`code-review`/`receipt-write`)를 전부 깨뜨린다(실측) | 조건부 fence → R2 F2와 병합해 holder-정체 대조 lifecycle로 확정 |
| CL-2 | HIGH | liveness-무관 lease가 느린 writer에게서 lock을 뺏어 lost update를 재도입 | base-hash 선조건 + rename 직전 소유 재확인(R2 F1과 동일 결론) |
| CL-3 | MED | sibling worktree `feat/codex-intent-context`의 plan이 **같은 `1.23.1`을 선언**(실측, base 동일 `ee1cfb8`) | Risk 등재 + PR 시 `origin/main` 재확인 후 상향. **Codex 미발견**(diff 밖 worktree라 구조적으로 불가시) |
| CL-4 | HIGH | 커버리지 상관의 **방향**이 미규정 — guard→receipt 방향은 미커버 writer를 원리상 못 본다 | receipt corpus 출발 + hash-carve 5필드 실측 범위 명시(R2 F3가 런타임 감사로 보강) |
| CL-5 | HIGH | `msw-events` writer는 **cwd 상대경로**(L22,177, 두 caller 모두 `opts.dir` 미전달)인데 reader는 repoRoot 고정 → worktree 3개 동시 존재 환경에서 이벤트 유실·교차 오염. M3의 B2 분모와 guard 커버리지가 전부 이 sidecar 위에 얹힘 | `appendEvent` repoRoot 해석 교정 + 두 caller 전달 + worktree 2개 교차 계상 회귀(Task 5). **Codex 미발견** |

> **관측**: Codex는 diff/플랜 텍스트 안의 논리 결함(F1~F3)을 잡았고, Claude 독립 분석은 그에 더해 **실행 환경 사실**(CL-3 sibling worktree · CL-5 caller 실측)에서 2건을 추가로 잡았다. 이 저장소가 기록해 온 "asymmetric dual-review" 패턴의 재현이며, 이번에는 **양방향**으로 작동했다.

- Deferred to backlog: **0** (전건 ACCEPT_NOW — `.claude/plans/codex-findings-backlog.md` append 없음)
- **Open Questions**: `divergent` — 누적 HIGH 6건(+ Claude 독립 5건)을 전부 흡수했으나 **R2 흡수분에 대한 Codex 재검증은 미획득**(R3 미실행). R2가 R1 흡수분에서 새 구멍을 찾아냈다는 사실 자체가 "흡수했으니 수렴"이라는 자기평가를 신뢰하면 안 된다는 근거이므로, verdict를 `converged`로 올리지 않는다. 흡수 품질의 cross-model 확인은 `/mccp:prp-implement`의 Implement-Codex + `/mccp:pr`의 PR-Codex로 이연된다. plan/implement 양 게이트가 `converged`가 아니면 dedupe가 fail-closed되므로 **PR-Codex 실발화가 보장**된다(dual-review 무손상). auto-CRITICAL 카테고리(비밀 노출·데이터 손실·비가역 마이그레이션·인증 우회·외부 전송·키 취급) 해당 항목 **없음** — F3은 증거 손상 축이지만 M3의 목적 자체가 그 방지이고 최소 fence로 흡수됐으며, write 경로 변경은 현행 비원자 `writeFileSync`보다 손상 위험을 **낮춘다**(원자 rename + §3.12 바이트 동일성 회귀)
- Codex session 참조: R1 thread `019fb265-ab22-7532-aefa-9f0a690f1482` · R2 thread `019fb38c-296c-7ee1-8e9d-1855a45061ef`

## Santa-loop 에스컬레이션 (DIVERGENT_UNRESOLVED, 운영자 지시)

- **트리거**: `escalate_pending=true` + `escalate_pending_decision_id=multi-session-work-loop`(receipt write가 divergent 감지 → `.claude/state/fix-task.md`). 운영자가 implement 착수 **전** 흡수 품질 판정을 선택.
- **리뷰어**: A = Claude Opus(`code-reviewer`) · B = **Codex GPT-5.4**(`codex exec --sandbox read-only`). CLI 실재 확인 → **model diversity 달성**(M2 사이클의 Opus×2 fallback과 대조). 컨텍스트 격리, 출력 미공유, 프롬프트에 "흡수했다는 사실은 증거 가치 0" 명시.
- **R1 결과**: **A FAIL · B FAIL → NAUGHTY**. 두 리뷰어가 **독립적으로 같은 두 축에 수렴**.

| # | 출처 | Finding | 처리 |
|---|---|---|---|
| I1 | **A+B 수렴** | reclaim↔rename TOCTOU — base-hash·lock 재확인을 **둘 다 통과한 뒤** lease를 잃고 지연 rename이 승계자를 덮는다. pre-rename 점검으로는 원리상 못 닫음 | 보증을 **G3 "무-무성손실"**로 재정의 + heartbeat 연장 lease + post-rename 검증 + fail-closed throw. "lost update 불가능" 주장 **철회** |
| I2 | **A+B 수렴** | `레코드 부재 → 통과`가 5개 standalone ingress를 fence 밖에 남겨 그들끼리 순차 덮어쓰기 가능 → milestone 결과가 전역으로 성립 안 함 | **암묵 claim-on-first-write**(lock 안, fence 이전) → "부재" 분기가 최초 write 1회로 소멸. CLI·command body 변경 0 |
| I3 | B | 세션 정체 부재/공유 분기 미정의 · tombstone TTL 만료 후 재개방 | holder 정체 `{session_id, host, session_pid}` 3원소 + 무명 프로세스 nonce + **TTL lapse를 known-gap test로 고정** |
| I4 | B | 런타임 감사가 guard 이벤트를 **무인증** 신뢰 → 우회 writer가 위조 이벤트로 자기증명. 부정 fixture가 "이벤트 없음"만 검사 | 이벤트에 **pre/post hash** 기록 + 감사가 양쪽 대조 + 부정 fixture **2종**(무이벤트·위조이벤트) + **위협 모델 명시**(적대적 위조자는 범위 밖) |
| I5 | A | grounding 오류 — sibling plan 인용이 `L67`인데 실제 `L71`, "선언"과 "현재 값"을 혼동 유발 | 두 사실 분리 기재(현재 `1.23.0` / plan이 `1.23.1` 선언) + **줄 번호 대신 내용으로 인용** |
| I6 | **A+B 수렴** | Risk 행이 Task 4 재설계 전 문구(`epoch 제시를 모든 write에 요구`) 잔존 → 자체 모순. 보증 강도가 구간마다 진동 | Risk 행 정정 + **보증 범위 G1~G3 표를 단일 기준으로 신설** + PRD 문장 대응 명시 |
| I7 | B | Validation 블록이 셸 미명시(PowerShell primary 문서 vs bash 문법) | 블록 상단에 **POSIX sh(Git Bash) 기준** 명시 + PowerShell 이관 시 판정 기준 불변 규정 |

- **리뷰어 불일치 1건 — CL-3**: A는 sibling `plugin.json` **현재 값**(`1.23.0`)을 보고 `REFUTED`, B는 sibling **plan의 선언**을 확인해 `CONFIRMED in substance`(planned bump collision). **B가 정확**하다 — 독립 재확인 결과 현재 값 `1.23.0` ∧ plan 선언 `1.23.0 → 1.23.1`이 동시에 참이며, 충돌은 장래 충돌이다. A의 오판을 유발한 내 모호한 문장과 줄 번호 오류는 I5로 흡수했다. **CL-5는 A·B 모두 CONFIRMED**.
- **관측**: I1·I2·I6이 서로 다른 모델에서 독립 수렴했다. 특히 **I1은 내가 직전 라운드에서 "흡수 완료"로 선언한 항목**(CL-2)이었고 두 리뷰어가 그 흡수의 불충분함을 각자 찾아냈다 — "흡수했으니 수렴"을 신뢰하면 안 된다는 이 저장소의 반복 교훈이 3번째로 재현됐다.

### R2 (fresh 리뷰어, R1 findings 미공유) — **A FAIL · B FAIL → NAUGHTY**

R1 수정이 C5·C7(A 기준)을 FAIL→PASS로 올렸으나, **양쪽 모두 R1 수정 자체에서 새 결함을 찾아냈다.** CL-3는 A가 R1의 `REFUTED`를 뒤집어 **양쪽 CONFIRMED**로 수렴(I5 교정 효과).

| # | 출처 | Finding | 처리 |
|---|---|---|---|
| **J4** | B | **live 판정 기반이 작동하지 않는다** — `session-start.js:671`이 pid 미전달 → 기록 pid = SessionStart **hook 프로세스**(`session-ledger.js:338`), `updateLedgerHeartbeat`는 pid 미갱신, `listLedgers` same-host 분기는 `pidProbe` 요구(`:643`). hook은 수 초 내 종료 → **단일 머신에서 activeOnly ≈ 공집합** → G1·G2 동반 붕괴 | claim liveness를 **자기완결 `last_touch` TTL**로 교체, ledger PID 축 미사용. session-ledger 수정은 M3 범위 밖 → **상류 결함으로 backlog 기록** |
| **J1** | A | 암묵 claim 생성이 **원자적이지 않다** — evidence lock 키는 `(gate, slug)`인데 claim 키는 `slug`. 같은 slug·다른 게이트면 **다른 lock**이라 직렬화 안 됨(실측 `receiptPath`에 `gate_id` 포함). R1의 "같은 임계구역이라 원자적"은 거짓 | `acquireClaim`이 자체 `openSync 'wx'`(O_EXCL)로 생성, `EEXIST`면 재read 후 holder 대조 |
| **J3** | B | **tombstone이 G2 시나리오에서 생기지 않는다** — 자발적 `releaseClaim`에서만 쓰는데 G2의 전제는 "A가 죽어 release 못 함". 죽은 세션은 tombstone을 못 남기고 부활 A는 "레코드 없음 → 통과". 게다가 `releaseClaim` 호출자가 어떤 Task에도 미배정 | **승계자가 tombstone을 쓴다**(superseded epoch 보존). `releaseClaim`은 정확성 전제가 아니라 최적화로 격하 + 호출처 명시 배정 |
| **J2** | B | **G3가 여전히 거짓** — post-rename 검증은 *내가 덮인* 경우만 잡는다. 위험한 순서는 "B가 검증까지 마치고 성공 반환 → A의 지연 rename이 B를 덮음"이고 B는 영영 모른다 | G3를 **"덮어쓴 쪽이 항상 보고한다"**로 재정의(rename **후** 소유 재확인) + **덮인 쪽의 늦은 인지를 잔여로 명시**(완전 폐쇄는 전역 순번 = M5) |
| **J5** | B | I4의 pre/post hash가 **ALLOWED_FIELDS에 없어 `eventToJsonLine`이 조용히 strip** → B2 감사가 대조할 값을 못 찾음. I4 수정이 무효 | allowlist에 `pre_hash`·`post_hash`·`claim_epoch` 추가를 **같은 Task로 묶음** |
| **J6** | A | "모든 caller에 자동 적용"이 **미래 writer까지 보장하는 것처럼** 읽힘 | "현재 알려진 caller"로 한정 + Task 6 정적 lint가 신규 미보호 writer guardrail을 **겸함**을 명시 |
| **J7** | A | B2 gate-pass 판정이 모호 | target 일치 + pre/post hash 일치 + `ts` ±30s 창으로 고정, carved-only 변형은 별도 분류 |
| **J8** | A | 동시 claim 생성 회귀 test 부재 | 서로 다른 게이트 2 프로세스 동시 write 회귀 추가 |
| **J9** | A | advisory 게이트와 enforcement locus 혼동 소지 | work.md 본문에 넣을 문장을 **축자 지정** |

- **관측 2회차**: J4는 내가 **최초 GROUND에서 "검증된 substrate"라고 단정한 전제**였고, 두 라운드를 거쳐서야 리뷰어가 실측으로 깨뜨렸다. J1은 R1에서 내가 새로 도입한 메커니즘의 원자성 결함이다. 즉 **R1 수정이 J1·J2·J5 세 건을 새로 만들었다** — "흡수가 새 결함을 낳는다"는 패턴의 4번째 재현이며, round 3가 마지막 허용 라운드다.

### R3 (fresh 리뷰어) — **A FAIL(6/7 PASS) · B FAIL(1/7 PASS) → NAUGHTY. 3라운드 소진 → ESCALATION**

R2 수정이 A 기준 C1·C2·C4·C5·C6·C7을 **전부 PASS**로 끌어올렸고 A의 유일한 FAIL은 C3(문서 모순)이었다. B는 더 엄격하게 판정했고 **새 설계 결함 1건**을 추가로 찾았다.

| # | 출처 | Finding | 상태 |
|---|---|---|---|
| K1 | A(C3) + B(C3) | round 1 문단(Task 2)이 R2에서 거짓 판정된 옛 G3 문구를 유지하고 "plan 전체에서 이 문구로 통일한다"고까지 적음 | **교정 완료** — 단일 기준은 G1~G3 표임을 명시 |
| K2 | B | Task 4가 `listLedgers`를 실격시킨 뒤에도 GROUND·Patterns·Files-to-Change·Task 7이 그대로 의존 → advisory 표면이 plan 스스로 부정한 소스 위에 섬 | **교정 완료** — 4곳 모두 제거/취소선, Task 7은 `listClaims` 단독 |
| **OQ-1** | **B (신규)** | **`{session_id, host, process.pid}` 정체가 실제 ingress 형태와 비호환** — `receipt/cli.js`는 매 write마다 **새 node 프로세스**로 실행되므로 `process.pid`가 매번 다르다. R2에서 "정체 공유 붕괴"를 막으려 넣은 그 pid가 **정상 단일 세션의 재진입을 깨뜨린다**(같은 세션의 두 번째 write가 "다른 holder"로 거부됨) | **R4에서 해소** — `process.pid` → **`CLAUDE_PID`**(세션 프로세스). 실측: 별개 node 3회 실행에서 `CLAUDE_PID`는 `4756` 고정, `process.pid`는 43832/94636/103764로 매번 상이, `process.kill(4756,0)` = ALIVE |
| **OQ-2** | **B (신규)** | **G3의 "덮어쓴 쪽이 항상 보고한다"가 crash에 취약** — A가 rename 직후 post-rename 검증 전에 죽으면 아무도 보고하지 않는다 | **R4에서 해소** — G3를 "보고**되거나** 감사에서 검출된다"로 재정의. B2 런타임 감사는 write 프로세스와 다른 시점·다른 프로세스에서 도는 crash-proof 독립 관찰자 |
| **OQ-3** | A(C4) + B | PRD 문장("구조적으로 불가능")과 plan 보증(G1~G3)의 강도 차이가 PR 시점까지 열려 있음 | **운영자 지시로 이연**(PR 시 PRD 문구 조정) — 매 라운드 재지목됨 |

- **verdict**: **NAUGHTY (escalated)** — push 안 함. santa-method 계약상 3라운드 초과.
- **패턴 5회차**: OQ-1은 **R2에서 내가 J3를 고치며 새로 넣은 필드**가 원인이다. R1 수정이 3건, R2 수정이 1건의 새 결함을 낳았다. 4라운드째 자체 흡수는 같은 패턴을 6번째로 재현할 가능성이 높으므로 **운영자 판단으로 넘긴다**.
- **수렴한 것**: CL-3·CL-5·J4는 **양 리뷰어·전 라운드에서 일관 CONFIRMED**이고 더 이상 논쟁 대상이 아니다. A 기준 C1(설계 정합성)·C7(증거 안전성)은 R3에서 PASS로 전환됐다.
