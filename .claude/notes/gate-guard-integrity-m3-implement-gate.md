# Implement-Gate Record — gate-guard-integrity M3

> `/mccp:prp-implement` Phase 2.5의 게이트 기록. **plan 본문이 아니라 이 노트에 둔다** —
> 2.5.4가 지시하는 plan 본문 주입은 plan hash를 바꿔 상위 `mccp-plan-codex` receipt를
> 즉시 stale로 만들고(가드 2), 그 stale은 `/mccp:pr` 시점까지 남는다. 이 PRD가 복원한
> 바로 그 가드를 명령 본문이 스스로 무력화하는 형태라 본 cycle은 plan hash를 보존한다.
> 근거·선례는 아래 §게이트 자기-stale 을 참조.

- plan: `.claude/plans/gate-guard-integrity-m3.plan.md`
- decision: `gate-guard-integrity-m3`
- branch: `feat/gate-guard-integrity-m3` (base `origin/main` @ v1.25.1)
## Codex Implementation Review

> Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy, first-class)

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review` → `classification=disabled` · `blocking=false` · `durationMs=0` (spawn 직전 short-circuit)
- 라운드 수: 0
- 합치 결론: **없음 — implement 단계에서도 cross-model 검증을 획득하지 못했다.** plan 게이트와 동일한 공백을 승계하며 §D가 이미 기록했다.
- YAGNI Triage: 해당 없음 (finding 0건 — Codex 미발화)
- Deferred to backlog: 0
- Open Questions: 없음
- Codex session 참조: 없음

### 착수 시점 base 재정합 (implement-time 결정 4건)

plan은 `git rev-list --left-right --count origin/main...HEAD` = `1 0`(2026-08-14~15 실측)을 전제로 작성됐다. 착수 시점(2026-08-16) 재실측은 **`56 0`** 이었다 — 브랜치는 여전히 0 ahead(완전 머지)이나 main이 56 커밋 전진했다. 아래는 그 격차가 강제한 결정이며, 전부 plan이 이미 규정한 규칙의 적용이지 새 정책이 아니다.

| # | 결정 | 근거 |
|---|---|---|
| D1 | 착수 base를 `origin/main`으로 재정합하고 새 브랜치 `feat/gate-guard-integrity-m3`를 만든다. 이전 브랜치 `docs/gate-guard-integrity-m2-completion`은 0 ahead라 고유 커밋이 없으므로 손실이 없다 | 56 커밋 stale base 위에서 만든 diff는 그 56 커밋을 되돌리는 것으로 읽힌다(§3.5.1이 경고하는 형태). 0-ahead이므로 fast-forward 등가이며 §3.5.1의 위험(양방향 divergence)은 성립하지 않는다 |
| D2 | Task 9의 version 목표를 `1.23.11 → 1.23.12`에서 **`1.25.1 → 1.25.2`** 로 상향한다 | `origin/main`의 `plugin.json`이 이미 `1.25.1`. plan Task 9가 규정한 **forward-only 상향** 규칙(§3.7 병렬 브랜치 충돌)의 직접 적용이다. 1.23.12는 발행된 번호 아래이므로 선택지가 아니다 |
| D3 | A2(Stop-loop 상태 파일 커밋)를 **철회**한다 | main의 `fix-task-applied.md`가 `setup-gitignore-m1`(2026-08-14)로 로컬(`multi-session-work-loop-m5`, 2026-08-13)보다 **최신**이고, `fix-task.md`는 main에서 이미 삭제됐다. 로컬 dirty를 커밋하면 main을 되돌린다. Task 0의 "이미 해소된 행은 제거" 규칙에 해당 |
| D4 | receipt 조작은 저장소 자체 CLI(`plugins/mccp/scripts/receipt/cli.js`)를 쓴다 | command body가 인용하는 cache 경로는 `1.23.7`인데 저장소·설치 cache 모두 `1.25.1`이다. schema drift를 피하려면 대상 저장소와 같은 코드가 정본이다 |

### Design Review

`impeccable-detect --mode implement` → `skill_available=true` · `design_signal=false` · `reason=no-signal` → **silent-skip**.

plan 게이트에서는 `design_signal=true`였다(Files to Change의 `renderer/html.js` · `renderer/markdown.js` version 리터럴 2면이 whitelist에 걸린다). implement 게이트의 detector는 **착수 시점의 diff**를 읽으므로 아직 비어 있는 diff에서 신호가 없다 — v1.3.0 M1이 `silent_skip`을 관측 가능하게 만든 바로 그 경로다. receipt에 `impeccable_silent_skip=true` + `reason=no-signal`을 정직하게 forward하고 critique retry loop·stage routing·Phase 3.6/3.7 grounding은 **모두 미실행**이다.

### Security Reviewer

2.5.5의 보안 트리거(auth · crypto · secrets · input validation · SQL/cmd injection · SSRF · path traversal · privilege escalation) **미해당 판정** — 따라서 `security_skipped`를 stamp하지 않는다(가용성 실패가 아니라 트리거 미발화이므로 skip이 아니다). 근거:

- C6·C2는 게이트를 **강화**하는 방향이며 새 신뢰 경계를 만들지 않는다. 죽은 가드를 되살리는 것이지 우회로를 여는 것이 아니다.
- C3의 `parsePlanFiles`는 **저장소 내 신뢰된 plan 마크다운**을 읽는 파서이고, 변경은 허용 입력을 넓히되 표 부재 시 fail-closed를 유지한다(입력 검증 완화가 아니라 오탐 제거).
- C1은 test fixture 경로를 저장소 트리 밖 `os.tmpdir()`로 옮긴다 — path traversal이 아니라 그 반대 방향(저장소 오염 제거)이다.
- 나머지(B1~B5 · C4 · C5 · Task 9)는 문서·진단 필드·version 리터럴이다.

### 게이트 자기-stale (**신규 발견 아님** — backlog 2026-08-09 MEDIUM 기등재)

`prp-implement.md` Phase 2.5.4는 plan 본문에 `## Codex Implementation Review`를 주입하라고
지시한다. 그런데 M1이 2.5.9에서 복원한 가드 2는 `plan_hash` 동일성으로 "게이트 이후 plan이
바뀌었는가"를 판정하므로, **그 주입이 곧바로 상위 `mccp-plan-codex` receipt를 stale로 만든다.**

실측 (2026-08-16, 이 cycle):

| 시점 | `validate --command mccp:prp-implement` |
|---|---|
| 주입 전 | `ok:true` · stale 0 |
| 주입 후 | `ok:false` · `stale[0].reason = "plan file hash differs from receipt (plan changed since gate)"` (`e65be5b8… → 6a8af227…`) |

선례로 이미 발생했다 — M1(`gate-guard-integrity`)의 두 receipt는 plan_hash가 다르고
(`mccp-plan-codex: 1bc24ac…` vs `mccp-implement-codex: 98429b0…`), 그 상태로 ship됐다.
`validate --command mccp:pr --decision gate-guard-integrity`를 지금 돌리면 여전히
`ok:false` + 같은 stale이 나온다. 즉 이 stale은 **PR 시점까지 남는다.**

이것이 C2와 같은 종인 이유: C2는 Phase 5의 `mv`가 `--plan` 경로를 없애 자기 PR을 막는
자기차단이고, 이것은 Phase 2.5.4의 Edit이 `--plan` **내용**을 바꿔 같은 가드를 발화시키는
자기차단이다. 축(경로 부재 vs 해시 변경)만 다르고 형태가 같다.

**이미 등재된 결함이다 — 본 cycle의 신규 발견이 아니다.** `.claude/plans/codex-findings-backlog.md`
`2026-08-09 | MEDIUM | multi-session-work-loop-m4.plan.md` 행이 같은 것을 같은 근거로 적어 뒀다
("2.5.4는 … 주입을 **의무화**하는데, 그 편집이 상위 `mccp-plan-codex` receipt의 `plan_hash`를
어긋나게 해 2.5.7의 read-back validate가 `stale`로 exit 2 한다", 실측 `e2763b5d → 82862974`).
M4는 "verdict를 바꾸지 않은 채 현재 본문에 plan-codex receipt를 재anchor"해 통과했고, 그 행이
그것을 **"매 사이클 반복되는 수동 우회"** 라고 부른다. 본 cycle의 관측은 그 행을 반증하지 않고
재확인할 뿐이다(`e65be5b8 → 6a8af227`, M1 선례는 `1bc24ac… ≠ 98429b0…`).

**본 cycle의 대응**: 그 행이 나열한 후보 수정 3종 중 **(b)** — "2.5.4의 주입 대상을 plan 본문이
아니라 `.claude/notes/<topic>.md`로 이전(command body가 이미 대안 경로로 언급)" — 를 이 cycle에
한해 적용했다. 즉 새 해법을 발명한 것이 아니라 등재된 후보 하나를 실행한 것이다. 2.5.6 Step A가
`<plan or notes path>`를 검증 대상으로 허용하므로 명령 본문 안이다.

**주장하지 않는 것**: 이 회피는 결함을 닫지 않는다. `prp-implement.md` 2.5.4 자체를 고치는 것은
M3 plan의 Files to Change 밖이며, 후보 (a)(hash carve-out) vs (b)(주입 대상 이전) vs (c)(2.5.7이
gate-authored 편집에 한해 stale 허용) 중 무엇이 옳은지는 설계 판단이라 여기서 내리지 않는다.
M3이 backlog에 추가하는 것은 **본 cycle이 (b)를 실행해 통과했다는 관측 1행**뿐이다(Task 8).
