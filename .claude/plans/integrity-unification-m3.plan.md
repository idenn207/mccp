# Plan: Integrity Unification (무결성 통일 cycle) M3

**Source**: `.claude/plans/integrity-unification-m1.plan.md` (Delivery Milestones M3 행, reference mode) + `.claude/plans/codex-findings-backlog.md` 2026-07-21 HIGH(terminal `/mccp:pr` mechanical hard-stop 부재)
**Selected Milestone**: M3 — terminal `/mccp:pr` non-approving mechanical hard-stop 재설계
**Complexity**: Medium (단일 축, 좁은 blast radius — 그러나 **적대 리뷰 민감도 최상**: 이 축의 즉시 흡수 시도가 8라운드 비수렴 루프의 직접 원인이었다. 그래서 M1/M2와 분리된 독립 재설계 단위로 격리됐다.)

## Summary

M1이 durable corpus의 verdict-SoT를 세우고(`resolution.codex_verdict` authoritative + `receipt-convergence.js` 공유 헬퍼) M2가 독립 무결성 표면 4개를 닫았지만, **terminal `/mccp:pr` 게이트 자체는 여전히 non-approving PR-Codex 결과를 mechanical하게 막지 못한다**. `pr.md:480`이 스스로 명시한다 — "`codex_actionable_findings` has **no mechanical hard-stop** here (this body only parses it, and validate-cmd does not gate on it)". 실측 재현: receipt `mccp-pr-codex/*.json`이 `resolution.codex_verdict='divergent'`(Codex raw=`needs-attention`, "No-ship")인데 `cli.js validate --command mccp:pr`가 `{ok:true, blocking:[]}` exit 0을 낸다. 즉 v1.22.3 M3가 복구한 verdict 파서는 terminal 게이트에서 **audit-only**다.

현재 유효한 "차단"은 둘뿐이고 **둘 다 이번 호출을 막지 않는다**: (a) receipt가 `divergent`를 봉인 → cross-gate dedupe fail-closed로 **다음** `/mccp:pr`이 PR-Codex를 재실행, (b) LLM/운영자가 판정을 자발적으로 존중. M3는 이 gap을 닫아 — non-approving verdict(`divergent`/`critical`/`unavailable`/absent)를 낸 pr-codex receipt는 push/`gh pr create` **전에** mechanical하게 HALT되고, 유일한 우회는 audited override env `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE="<reason>"`(기존 strict reason validator 재사용)다. override는 verdict를 `converged`로 **재작성하지 않는다** — receipt는 실제 divergent verdict를 봉인한 채로, `meta.pr_codex_force_override=true`와 함께 auditable하게 ship된다(§3.12 봉인 원칙 + dedupe fail-closed 무손상).

**핵심 설계 원칙(8라운드 비수렴 회피)**: 강제 메커니즘을 적대적으로 리뷰하면 우회 표면이 매 라운드 새로 노출된다(env opt-out · lock-fail · crash window · session key · absent-verdict · re-entrancy). M3는 이 표면들을 plan 단계에서 **선제 열거·설계로 닫는다**(§Design Decisions & Bypass-Surface Analysis). enforcement는 단일 pure 오라클(`pr-ship-gate.js#deriveShipDecision`)로 통일하고, 이를 (1) **runtime 1차 강제**(finalize-receipt 무조건 경로 + exit code) + (2) **canonical/외부 validate 표면**(validate-cmd `--check-ship-verdict`) 두 locus에서 소비하되 **오라클을 공유해 drift를 구조적으로 차단**한다.

## Delivery Milestones

| Milestone | Scope | Status | Plan |
|---|---|---|---|
| M1 | verdict-SoT + hash 무결성 core: ledger 승인 술어(+소비처 sweep) · stage-guard write-side · audit read-side · migration | complete | `.claude/plans/integrity-unification-m1.plan.md` |
| M2 | 독립 무결성 fixes: subject_hash tamper 대칭 · history-leak-scan path-precision · parseReviewPayload 실-producer fixture · briefing convergence residual | complete | `.claude/plans/integrity-unification-m2.plan.md` |
| **M3** | terminal `/mccp:pr` non-approving mechanical hard-stop 재설계(2026-07-21 HIGH) — bounded semantics(re-entrancy·lock·crash-window·self-receipt) + absent-verdict fail-closed(M1 Codex R1 F2) + audited override + 자체 minor bump·acceptance gates | **in-progress** | (this plan) |

> M3는 M1/M2 없이 단독 land 가능하나 **PRD 전체의 마지막 milestone**이다 — 완료 시 integrity-unification cycle 종료 → §3.7에 따라 **minor bump `1.22.6 → 1.23.0`**. M3는 여전히 M1/M2와 분리된 독립 재설계 단위: advisory→mechanical 승격은 강제 메커니즘을 적대 리뷰하면 우회 표면이 매 라운드 노출되는 축이라(backlog 2026-07-21 HIGH가 8라운드 비수렴 근거를 명시) 별도 cycle로 격리됐다.

## Absorbed Findings (backlog → Task 매핑)

| Backlog 행 | Severity | Task | 상태(실측 재검증) |
|---|---|---|---|
| 2026-07-21 HIGH — terminal `/mccp:pr` non-approving mechanical hard-stop 부재 | HIGH | M3 전 Task | OPEN 확인(`pr.md:480` 자체 명시 · `validate-cmd.js`의 `mccp:pr` `requires_preceding=[plan,implement]`라 `mccp-pr-codex` self-verdict를 어떤 validate도 게이트 안 함 · finalize-receipt:753 exit만 write 실패를 잡고 verdict는 audit-only) |

> **명시적 제외**(M3 scope 밖, 별도 cycle): briefing **hang**(2026-07-21 HIGH exit-127 — PR-gate operability, verdict-SoT 아님. `MCCP_BRIEFING=off` 우회는 문서화됨) · derive-decision branch fallback(2026-07-21 HIGH — 남의 slug 상속) · finalize-receipt `--deferred-findings`(2026-07-21 MEDIUM) · fan-out debt marker residual(2026-07-16/21) · `--apply-fix-task` 유령 플래그(2026-07-15) · pre-existing test 실패 2건(`verdict-label` · `design-critique-loop-e2e` fixture). 이들 중 **briefing hang은 M3 dogfood를 막으므로** implement/PR 시 `MCCP_BRIEFING=off` 토글로 우회(리뷰 약화 아님 — 요약 stamp만 끔).

## Design Decisions & Bypass-Surface Analysis (선제 흡수 — 이 축의 8라운드 비수렴 회피)

> 이 섹션은 Plan-Codex가 매 라운드 새로 노출시킬 우회 표면을 plan 단계에서 명시적으로 닫는다. 각 결정에 대안·기각 근거·잔여 리스크를 붙인다.

### DD1 — 강제 verdict 파티션(무엇이 ship이고 무엇이 no-ship인가)

`pr-ship-gate.js#deriveShipDecision(receipt, opts)`는 `receipt.resolution.codex_verdict`를 authoritative 키로 본다(M1 원칙 — `converged` 필드는 은퇴).

| codex_verdict | 판정 | 근거 |
|---|---|---|
| `converged` | **SHIP** | Codex approve |
| `skipped` | **SHIP** | dedupe(upstream 양 게이트 converged, v1.20.3 fail-closed 보장) · `MCCP_CODEX_DISABLED`(env policy, Phase 0.3 mutex) · `MCCP_PR_SKIP_CODEX_REVIEW`(audited escape, reason+`meta.codex_skipped_at_pr`). 세 경로 모두 **구성상 이미 승인된 ship 상태** |
| `divergent` | **NO-SHIP** | Codex No-ship(needs-attention) 또는 scope-excluded non-approve. M3의 핵심 차단 대상 |
| `critical` | **NO-SHIP** | divergent의 상위 severity |
| `unavailable` | **NO-SHIP(fail-closed)** | `invoked`+verdict-unreadable = 승인 certify 불가. terminal `/mccp:pr`은 advisory(`MCCP_ALLOW_CODEX_UNAVAILABLE`)를 Phase 0에서 이미 거부하므로, finalize에 `unavailable`이 도달하는 유일 경로는 companion defect뿐 → fail-closed 정당 |
| **absent**(필드 부재) | **NO-SHIP(fail-closed)** | M1 Codex R1 F2 제약. 아래 DD5 참조 |

- **대안 기각**: "`!== 'converged'`를 전부 block"(backlog 원문 표현) → `skipped`(dedupe happy-path·disabled·audited-skip)까지 막아 정상 ship을 봉쇄. 정확한 파티션은 **no-ship 집합 = {divergent, critical, unavailable, absent}**이지 `converged`의 여집합 전부가 아니다.
- 오라클은 `receipt-convergence.js#isDivergentVerdict`(divergent/critical)를 재사용하고 `unavailable`/absent를 추가로 판정 — M1 공유 헬퍼 위에 얹어 drift 최소화.

### DD2 — enforcement locus: 이중 locus, 단일 오라클(drift 구조 차단)

강제 메커니즘의 핵심 취약점은 "LLM이 markdown 스텝을 건너뛴다"이다. 이를 두 층으로 방어하되 **판정 로직은 한 곳**에 둔다.

1. **runtime 1차 강제 = `finalize-receipt.js`**(primary). finalize는 pr.md 2.5.7에서 **무조건** 실행되고 그 exit code는 **무조건** 검사된다(`pr.md:754-758` — 이미 존재하는 mechanical HALT). finalize가 receipt write 성공 직후 `deriveShipDecision`을 호출해 no-ship이면 `[MCCP-GATE-STOP]` stderr + **distinct exit(EX_SHIP_BLOCKED=12)**를 반환 → pr.md가 `exit 1` HALT. 이는 codex-runner fail-stop(`pr.md:426`)·merged-verify runtime HALT과 동형(runtime 1차, receipt는 audit anchor). **finalize를 고른 이유**: 별도 스텝은 LLM이 누락 가능하지만 finalize는 write 경로 자체라 누락 불가 + exit 재사용이라 신규 chokepoint 불필요.
2. **canonical/외부 validate 표면 = `validate-cmd.js` `--check-ship-verdict`**(defense-in-depth). backlog가 명시한 fix locus. pr.md **Phase 2.5.9**(신규, finalize 직후)가 `validate --command mccp:pr --decision <slug> --check-ship-verdict`를 read-back으로 호출 → 같은 오라클 → 같은 판정. 외부 audit(`/mccp:receipt-validate`)·후속 도구도 재사용 가능.

- **두 locus가 같은 `deriveShipDecision`을 소비**하므로 판정이 drift할 수 없다(M1의 `receipt-convergence.js` single-helper 철학 mirror). finalize가 primary spine, validate-cmd가 auditable/external + belt-and-suspenders.
- **대안 기각**: validate-cmd 단독 → 강제가 별도 스텝(2.5.9)에만 의존해 LLM 누락 시 무력. finalize 단독 → backlog가 지정한 canonical validate 표면 미충족 + 외부 audit 불가.

### DD3 — audited override: unblock하되 verdict는 봉인 유지

`MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE="<reason>"`(strict reason validator 재사용 — ≥30자·≥3단어·no placeholder/URL-only/banlist).

- **Phase 0.4**(신규 preflight, Phase 0.1/0.2 mirror): env 설정 시 reason 검증 → 통과하면 `export PR_CODEX_FORCE_OVERRIDE_REASON`. 실패 시 즉시 `[MCCP-GATE-STOP] exit 1`.
- **2.5.7 finalize**: `--pr-codex-force-override-reason "$PR_CODEX_FORCE_OVERRIDE_REASON"` forward → `write.js`가 `meta.pr_codex_force_override=true`+reason stamp(schema-time strict 재검증 — 나쁜 reason은 write REJECT, security/impeccable override 패턴과 동일 defense-in-depth).
- **오라클**: `meta.pr_codex_force_override===true`면 `ship=true` — **그러나 `resolution.codex_verdict`는 실제 값(divergent) 그대로 봉인**. override는 이번 호출의 mechanical HALT만 해제하지 verdict를 converged로 바꾸지 않는다 → cross-gate dedupe 여전히 fail-closed, §3.12 "divergent 봉인" 무손상, ledger 승인 술어(M1)에 거짓 converged 미유입.
- **Phase 4**: `## PR-Codex Override` PR body 섹션 auto-inject(canonical audit — `## Impeccable Override` mirror). raw verdict·override reason·drop 건수 명시.
- **대안 기각**: override가 verdict를 `converged`로 매핑 → v1.22.3 M3 follow-up R1 F1/F4가 이미 철회한 위험(dedupe 무력화·감사 거짓). 이번 M3도 정확히 이 축을 반복하지 않는다.

### DD4 — re-entrancy: 재실행이 stale divergent에 self-poison 안 되도록

self-verdict 게이트를 **Phase 1.6 조기 preflight**(`validate --command mccp:pr`, `--check-ship-verdict` 미전달)에는 **넣지 않는다**. 조기 preflight가 stale divergent receipt를 보고 막으면 재실행 자체가 불가능해진다(fix→재실행 경로 차단).

- **조기 preflight**(1.6): self-gate 미발화 → 재실행이 PR-Codex를 재invoke하도록 통과.
- **post-finalize self-gate**(finalize exit + 2.5.9): 이번 호출이 방금 쓴 fresh receipt만 판정.
- 재실행(코드 수정, HEAD 변경): plan/impl receipt stale → dedupe 미발화 → PR-Codex 재invoke → fresh verdict. 수렴 시 ship.
- 재실행(동일 HEAD·동일 상태): dedupe 결정은 결정적 — run1에서 미dedupe였으면 run2도 미dedupe → PR-Codex 재invoke → 또 divergent → block(정당: 아무것도 안 바꿈).
- **dedupe 상호작용 명시**: run1↔run2 사이 사용자가 실제로 plan/implement를 재수렴시켰다면 dedupe가 새로 발화해 `skipped`(ship) 가능 — 이는 우회가 아니라 **dual-review가 upstream에서 수렴한 sanctioned dedupe 경로**다(오라클은 최종 verdict를 키로 보고 `skipped`=upstream 수렴).

### DD5 — absent-verdict fail-closed(historical 예외의 구조적 충족)

M1 Codex R1 F2: "current terminal receipt의 absent codex_verdict는 fail-closed, historical만 예외". self-gate가 **이번 호출이 방금 쓴 receipt만** 판정하므로(finalize 직후 locus) historical 예외는 **locus로 자동 충족** — 과거 receipt는 이 게이트를 절대 통과 경유하지 않는다. fresh receipt의 absent verdict = finalize의 verdict 파생 defect → fail-closed block 정당.

- validate-cmd `--check-ship-verdict`가 외부에서 임의 receipt에 돌 때도 동일: absent=block. 단 이는 opt-in flag라 default 경로(다른 명령의 chain-check)엔 영향 없음 → 표준 `/mccp:code-review` 등 read-only 경로 회귀 0.

### DD6 — crash-window·lock 무해성

- **crash(finalize write 후 ~ ship-decision 전)**: receipt는 쓰였고 finalize는 crash로 non-zero → pr.md HALT. push 없음. fail-closed.
- **crash(finalize 통과 후 ~ push 전)**: PR 미생성. 재실행이 재판정. safe.
- **lock**: ship-gate는 codex-runner가 `pr-phase.lock`을 exit한 **후** 실행(2.5.7 이후) → lock 상호작용 없음. lock-fail 표면이 ship-gate에 존재하지 않음.

### DD7 — divergent receipt는 git-commit되지 않음(§3.12와 정합)

finalize가 divergent에서 HALT하면 그 receipt는 working-tree에만 남고 Phase 3.0b evidence-commit(git-track)에 도달하지 않는다 — §3.12의 git-track은 **shipped**(converged/override) receipt 대상이므로 정합. divergent working-tree receipt는 여전히 dedupe fail-closed + 이번 attempt의 audit anchor 역할. override-ship 시엔 Phase 3가 override-meta 포함 receipt를 정상 commit.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| convergence 판정 헬퍼 | `receipt-convergence.js#isDivergentVerdict` (M1) | divergent/critical → non-converged. ship 오라클이 재사용 + unavailable/absent 추가 |
| audited override preflight | `pr.md:40-62`(Phase 0.1 impeccable) · `:66-88`(Phase 0.2 codex-skip) | env → reason 검증(≥30자·≥3단어) → export → 2.5.7 forward → Phase 4 body inject |
| strict reason validator | `receipt/lib/force-override-reason.js#validateReason({strict:true})` | banlist/URL-only/placeholder/len/words. schema-time REJECT(impeccable 패턴) |
| force-override 스키마 필드 | `schema.js:214-272`(impeccable_force_override + reason + schema-time validateReason) | `pr_codex_force_override`(bool default false) + `_reason`(string|null, override=true 시 strict 검증) |
| write flag stamp | `write.js:197-198`(impeccable) · `:154-156`(codex_verdict) | `--pr-codex-force-override[-reason]` → `meta.pr_codex_force_override` |
| finalize forward | `finalize-receipt.js:211-266`(security/impeccable/pr-design-chain reason forward) | `--pr-codex-force-override-reason` → writeFlags |
| runtime mechanical HALT | `pr.md:754-758`(FINALIZE_EXIT != 0 → GATE-STOP) · `:426`(codex-runner exit) | finalize distinct exit → 기존 HALT 재사용 |
| validate-cmd blocking kind + preflight relay | `validate-cmd.js:487-498`(design_critique_chain_divergent) · `pr.md:155-190`(Phase 1.6 relay) | 신규 `kind:'pr_codex_nonconverged'` + Phase 2.5.9 relay |
| block-format label | `block-format.js` entryLabel/tamperGuidanceLines | 신규 kind 라벨(필요 시) |
| 실-producer 회귀 test | M1/M2 `verify.js`/`codex-result-filter` 선례 | 실 codex-runner envelope 형태 fixture로 오라클·finalize test |

## Files to Change (M3)

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/pr-ship-gate.js` | CREATE | pure 오라클 `deriveShipDecision(receipt, {forceOverride})` → `{ship, blockingVerdict, absent, overrideActive, reason}`. `receipt-convergence` 재사용(DD1/DD2) |
| `plugins/mccp/scripts/lib/tests/pr-ship-gate.test.js` | CREATE | 전 verdict 파티션 + absent fail-closed + override + 실-producer receipt fixture 회귀 |
| `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js` | UPDATE | `--pr-codex-force-override-reason` accept+forward · write 성공 후 gate==='mccp-pr-codex'이면 `deriveShipDecision` → no-ship 시 `[MCCP-GATE-STOP]`+EX_SHIP_BLOCKED(12) 반환(DD2/DD3) |
| `plugins/mccp/scripts/lib/pr-phase-helpers/tests/finalize-receipt.test.js` | UPDATE(또는 CREATE) | divergent→exit 12 · converged/skipped→0 · override→0+meta stamp · write-flag forward |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | `meta.pr_codex_force_override`(bool) + `_reason`(string|null, override=true 시 strict validateReason) + defaults(731 블록 mirror) |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | `--pr-codex-force-override[-reason]` 파싱 → meta stamp(197-198 mirror) |
| `plugins/mccp/scripts/receipt/cli.js` | UPDATE | usage + write flag passthrough + `validate --check-ship-verdict` 옵션 배선 |
| `plugins/mccp/scripts/receipt/validate-cmd.js` | UPDATE | preceding-loop **후** PR-terminal self-verdict gate(`opts.checkShipVerdict` gated, `deriveShipDecision` 소비, env override 존중) → `kind:'pr_codex_nonconverged'`(DD2/DD4/DD5) |
| `plugins/mccp/scripts/receipt/tests/validate-cmd.test.js` | UPDATE | check-ship-verdict: divergent→block · converged/skipped→ok · absent→block · override→warning · **flag 없으면 조기 preflight 무영향**(re-entrancy 회귀) |
| `plugins/mccp/scripts/receipt/block-format.js` | UPDATE(조건부) | 신규 kind 라벨(preflight 출력 일관 — design_critique_chain_divergent 선례) |
| `plugins/mccp/scripts/receipt/tests/schema.test.js` · `write.test.js` | UPDATE | 신규 meta 필드 valid/invalid-reason REJECT · round-trip |
| `plugins/mccp/commands/pr.md` | UPDATE | Phase 0.4 override preflight · 2.5.4 line 480 노트 갱신("이제 mechanical hard-stop 있음") · 2.5.7 `--pr-codex-force-override-reason` forward + finalize exit 12 분기 메시지 · **Phase 2.5.9 self-gate read-back** · Phase 4 `## PR-Codex Override` inject |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.22.6 → 1.23.0`(minor — integrity-unification PRD 종료, §3.7) |
| `plugins/mccp/scripts/lib/renderer/html.js` · `lib/renderer/markdown.js` | UPDATE | footer version 동기(§3.7 surface drift 방지) |
| `.claude/plans/integrity-unification-m1.plan.md` | UPDATE | Delivery Milestones M3 행 pending→in-progress + Plan cell = 본 plan 경로 |
| `CLAUDE.md` | UPDATE | §1.4 cycle 표 M3 행 + §3.6/§4에 `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE` 문서화 + §3.3 fail-closed matrix 정합 |
| `CHANGELOG.md` · `.claude/plans/codex-findings-backlog.md` | UPDATE | cycle 행 + 2026-07-21 HIGH(terminal hard-stop) ABSORBED 표식(row 보존) |

## Tasks (M3)

### Task 1: `pr-ship-gate.js` pure 오라클 + 회귀 test (foundation)
- **Action**:
  1. CREATE `pr-ship-gate.js`: `deriveShipDecision(receipt, opts)`. `receipt.resolution.codex_verdict`로 DD1 파티션 판정 — `converged`/`skipped`→ship, `divergent`/`critical`/`unavailable`→no-ship, 필드 부재→no-ship(fail-closed). `opts.forceOverrideActive`(finalize가 meta에서, validate가 meta OR env에서 계산해 전달) true면 `ship=true`+`overrideActive=true`이되 `blockingVerdict`는 원 verdict 보존(감사용). 반환 `{ship, blockingVerdict|null, absent, overrideActive, reason}`. `receipt-convergence.isDivergentVerdict` 재사용.
  2. `EX_SHIP_BLOCKED = 12` 상수 export(codex-invoke blocking exit 12와 정합).
  3. CREATE test: 5 verdict × override on/off + absent + `resolution` 자체 부재(null-safe) + 실-producer receipt 형태(finalize가 실제로 쓰는 `resolution.codex_verdict`) fixture.
- **Mirror**: `receipt-convergence.js`(순수·no-I/O·단위 test) · M1/M2 실-producer fixture 선례
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/pr-ship-gate.test.js` — 파티션 전건 + override가 verdict를 재작성하지 않음(blockingVerdict 보존) assert.

### Task 2: schema + write + cli — `pr_codex_force_override` 필드 배선
- **Action**:
  1. `schema.js`: `meta.pr_codex_force_override`(boolean, default false) + `meta.pr_codex_force_override_reason`(string|null). override=true 시 `validateReason(reason, {strict:true})` REJECT(impeccable 268-272 mirror). defaults 블록(731) 추가.
  2. `write.js`: `--pr-codex-force-override` + `--pr-codex-force-override-reason` 파싱 → `meta.pr_codex_force_override` stamp(197-198 mirror). override 없으면 field 존재하되 false/null(present schema).
  3. `cli.js`: usage 문자열 + 두 flag passthrough. `validate` 서브커맨드에 `--check-ship-verdict` boolean 배선 → `validateCommand(command, {..., checkShipVerdict:true})`.
- **Mirror**: `schema.js:214-272` · `write.js:193-198` · `cli.js` 기존 write/validate flag 배선
- **Validate**: valid override receipt round-trip green · 나쁜 reason(1-token/URL/<30자) write REJECT(schema invalid) · `--check-ship-verdict` 옵션이 validateCommand로 전달됨.

### Task 3: `validate-cmd.js` PR-terminal self-verdict gate (canonical 표면)
- **Action**:
  1. preceding-gate 루프 **후**(572줄 result.ok 계산 전) 블록 추가: `isPrTerminal && opts.checkShipVerdict`일 때만 발화. `readReceipt(repoRoot, 'mccp-pr-codex', decisionId)` — 부재면 no-op(pre-write). 존재하면 schema/tamper 통과 후 `deriveShipDecision(receipt, {forceOverrideActive})` 호출.
  2. `forceOverrideActive` = `receipt.meta.pr_codex_force_override===true` **OR** (`MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE` env가 strict validateReason 통과). no-ship이고 override 미활성 → `result.blocking.push({kind:'pr_codex_nonconverged', reason, prior_verdict})`. override 활성 → `result.warnings.push`(audit — security/impeccable override warning mirror).
  3. **조기 preflight 무영향 불변식**: `opts.checkShipVerdict` 미전달(Phase 1.6·표준 code-review chain)이면 self-gate 전체 skip → re-entrancy(DD4)·historical(DD5) 자동 충족.
- **Mirror**: `validate-cmd.js:480-511`(design_critique_chain_divergent blocking + audited escape warning 분기) · `:182-198`(env reason 검증)
- **Validate**: divergent+flag→blocking(kind pr_codex_nonconverged) · converged/skipped+flag→ok · absent+flag→blocking · override(meta 또는 env)+flag→warning·ok · **flag 없으면 어떤 verdict에도 무영향**(회귀).

### Task 4: `finalize-receipt.js` runtime 1차 강제 (primary spine)
- **Action**:
  1. `--pr-codex-force-override-reason` accept: `run()`에서 `args['pr-codex-force-override-reason']`이 있고 truthy면 `writeFlags.push('--pr-codex-force-override','--pr-codex-force-override-reason', <reason>)`(security force-override forward 211-217 mirror).
  2. write **성공 후**(result.exitCode===0) `gateId==='mccp-pr-codex'`일 때: 방금 쓴 receipt를 `readReceipt`로 재read → `deriveShipDecision(receipt, {forceOverrideActive: receipt.meta.pr_codex_force_override===true})`. `!ship`이면 `[MCCP-GATE-STOP] PR-Codex non-approving (verdict=<v>) — push blocked. Set MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE="<reason>" for audited override.` stderr + **return EX_SHIP_BLOCKED(12)**. ship이면 기존 emit(0).
  3. 다른 gate(plan/implement)엔 미발화(gate 스코프). 재read 실패는 fail-closed(certify 불가 → block, loud stderr).
- **Mirror**: `finalize-receipt.js:211-217`(reason forward) · `:268-288`(write 성공 후 emit) · `pr.md:426`(runtime fail-stop)
- **Validate**: divergent receipt write → exit 12 + GATE-STOP · converged/skipped → exit 0 · override reason forward 시 meta stamp + exit 0 · plan gate finalize는 ship-gate 미발화.

### Task 5: `pr.md` 게이트 본문 배선 (사용자 대면 계약)
- **Action**:
  1. **Phase 0.4**(신규, 0.2 mirror): `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE` reason 검증 → `export PR_CODEX_FORCE_OVERRIDE_REASON`. 실패 즉시 `[MCCP-GATE-STOP] exit 1`. Phase 0.3 mutex와 독립(override는 verdict를 재작성 안 하므로 skip/dedupe/disabled와 배타 아님 — 문서 명시).
  2. **2.5.4**: line 480 노트 갱신 — "no mechanical hard-stop" → "runtime hard-stop은 이제 finalize(2.5.7)+self-gate(2.5.9)가 강제. `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE`만 우회, verdict는 봉인 유지". "Do not describe as blocked" 문구 제거/정정.
  3. **2.5.7**: `PR_CODEX_FORCE_OVERRIDE_REASON` 설정 시 `--pr-codex-force-override-reason` forward. `FINALIZE_EXIT` 분기 — `==12`면 ship-block(helper stderr 이미 정확), 그 외 non-zero면 write 실패. 둘 다 `exit 1` HALT하되 메시지 구분.
  4. **Phase 2.5.9**(신규, finalize 직후): `validate --command mccp:pr --decision <slug> --check-ship-verdict` read-back(defense-in-depth). `blocking[].kind==='pr_codex_nonconverged'` 발견 시 `[MCCP-GATE-STOP] exit 1`(Phase 1.6 relay mirror). override warning은 통과+로그.
  5. **Phase 4**: `PR_CODEX_FORCE_OVERRIDE_REASON` 활성 시 `## PR-Codex Override` 섹션 inject(raw verdict·reason·drop 건수 — `## Impeccable Override` mirror).
- **Mirror**: `pr.md:40-88`(Phase 0.1/0.2) · `:155-190`(Phase 1.6 relay) · `:64`/`:86`(body inject 계약)
- **Validate**: 문서 정합 — grep로 Phase 0.4/2.5.9 존재, line 480 갱신, override forward 조건. (mechanical dogfood는 Acceptance e2e.)

### Task 6: 문서·버전·roadmap 동기
- **Action**:
  1. `plugin.json` `1.22.6 → 1.23.0` + renderer footer(html.js/markdown.js) 동기.
  2. `CLAUDE.md`: §1.4 cycle 표 M3 행 · §4 `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE` 문서(strict reason·verdict 봉인·§3.12 정합) · §3.3 fail-closed matrix에 pr-codex non-approving hard-stop 정합.
  3. `CHANGELOG.md` 새 row · `codex-findings-backlog.md` 2026-07-21 HIGH(terminal hard-stop) `[ABSORBED → v1.23.0 integrity-unification M3]` 표식(row 보존) · `integrity-unification-m1.plan.md` Delivery Milestones M3 in-progress.
- **Mirror**: M1/M2 문서 동기 선례(§3.7 version bump 체크리스트)
- **Validate**: version 4-surface(plugin.json·footer×2·plan) 일관 · backlog row 보존(삭제 0).

## Validation (M3)

```bash
node --test plugins/mccp/scripts/lib/tests/pr-ship-gate.test.js
node --test plugins/mccp/scripts/lib/pr-phase-helpers/tests/finalize-receipt.test.js
node --test plugins/mccp/scripts/receipt/tests/validate-cmd.test.js
node --test plugins/mccp/scripts/receipt/tests/schema.test.js
node --test plugins/mccp/scripts/receipt/tests/                       # receipt 계열 전체
# 조기 preflight 무영향 회귀(DD4/DD5) — flag 없는 mccp:pr / code-review validate는 verdict 무관
node plugins/mccp/scripts/receipt/cli.js validate --command mccp:pr --decision <any> 2>&1 | tail -3
# self-gate 실측(divergent receipt fixture 준비 후)
node plugins/mccp/scripts/receipt/cli.js validate --command mccp:pr --decision <slug> --check-ship-verdict
node plugins/mccp/scripts/lib/evidence-audit.js --json                # M1/M2 corpus 불변
node --test $(ls plugins/mccp/scripts/lib/renderer/tests/*.test.js)   # renderer pre-existing 1 제외 불변
# 전체 회귀(pre-existing 실패 2건 baseline — verdict-label · design-critique-loop-e2e fixture)
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| self-gate가 `skipped`(dedupe/disabled/audited-skip)를 잘못 막아 정상 ship 봉쇄 | LOW | DD1 파티션 명시(`skipped`=ship) + validate/finalize/oracle 3중 test에 skipped→ship 회귀 |
| 조기 preflight self-gate가 재실행 self-poison(8라운드 재현) | LOW | DD4 — self-gate는 `opts.checkShipVerdict` gated, 조기 1.6은 미전달. "flag 없으면 무영향" 회귀 test |
| override가 verdict를 converged로 오염(dedupe 무력화) | LOW | DD3 — override는 `ship`만 뒤집고 `codex_verdict` 봉인. blockingVerdict 보존 assert + dedupe fail-closed 회귀 |
| finalize 강제가 briefing hang(별도 결함)과 얽혀 dogfood 불가 | MEDIUM | `MCCP_BRIEFING=off`로 격리(문서화된 §4 토글, 리뷰 무약화). ship-gate는 write 성공 후라 briefing hang과 독립 |
| 신규 meta 필드가 receipt_hash carve-out/기존 receipt 호환 깨뜨림 | LOW | present-only field(default false/null) — `receiptHash` carve-out 무변경(briefing_*만 carve). 기존 receipt는 default로 valid |
| 이중 locus(finalize+validate)가 판정 drift | LOW | 단일 `deriveShipDecision` 오라클 공유 — 두 소비처가 동일 함수 호출, 재구현 0 |
| absent-verdict fail-closed가 historical receipt 소급 차단 | LOW | DD5 — self-gate는 fresh receipt locus. flag-gated라 표준 chain 무영향 · historical 미경유 |

## Acceptance (M3)
- [ ] Task 1: `deriveShipDecision` 파티션 전건(converged/skipped→ship · divergent/critical/unavailable/absent→no-ship) + override가 verdict 보존(재작성 0). 순수·no-I/O.
- [ ] Task 2: schema/write/cli 배선 — override receipt round-trip green, 나쁜 reason write REJECT, `--check-ship-verdict` 배선.
- [ ] Task 3: validate-cmd self-gate — divergent+flag→blocking(kind pr_codex_nonconverged), converged/skipped→ok, absent→block, override(meta/env)→warning. **flag 없으면 verdict 무관 무영향**(re-entrancy 회귀).
- [ ] Task 4: finalize divergent→exit 12+GATE-STOP, converged/skipped→0, override→0+meta stamp, plan gate 미발화. 재read 실패 fail-closed.
- [ ] Task 5: pr.md Phase 0.4/2.5.9 존재, 2.5.4 line 480 갱신, 2.5.7 forward+exit 분기, Phase 4 override inject. **e2e dogfood**: divergent receipt로 finalize→exit12→pr.md HALT 재현(`MCCP_BRIEFING=off`), override env→ship+`## PR-Codex Override` body.
- [ ] `node --test` 회귀 0(신규 + M1 79/79·M2 불변 + renderer pre-existing 1). evidence-audit corpus 불변.
- [ ] plugin.json minor bump(1.22.6→1.23.0) + footer×2 동기 + CLAUDE.md(§1.4/§3.3/§4)/CHANGELOG/backlog(1행 ABSORBED, row 보존) + M1 plan M3 in-progress→완료 시 complete.
- [ ] Delivery Milestones 표 정확(M1/M2 complete, M3 in-progress→complete). integrity-unification PRD 종료 신호(minor).
- [ ] Patterns mirrored, not reinvented(receipt-convergence 헬퍼 · force-override preflight/validator/schema · finalize exit HALT · validate blocking-kind relay).

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review --focus "<4 plan decisions>" --impeccable-available` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 0 (Codex unavailable — companion timeout 180s, classification=`timeout`, blocking=true, exit 12)
- 합치 결론: Codex unavailable → **advisory mode**. non-approving receipt (`resolution.codex_verdict='unavailable'`). `/mccp:plan`은 non-terminal 게이트라 advisory 허용(terminal `/mccp:pr`만 거부). 실제 cross-model 적대 검토는 downstream `/mccp:pr` PR-Codex로 이연 — plan-codex가 non-approving이라 cross-gate dedupe fail-closed → PR-Codex가 전체 diff를 재검토(dual-review 보존, this-cycle 약화). M1 #110·M2 선례와 동일.
- YAGNI Triage: n/a (Codex 미발화)
- Open Questions: none (auto-CRITICAL 없음 — 신규 secret/data-loss/auth-bypass/irreversible-migration 표면 0; override는 verdict 봉인 유지라 dual-review 무손상)
- Codex session 참조: n/a

> Codex unavailable, skipped (auto-fallback): timeout

> **선제 흡수 노트**: 이 축은 8라운드 비수렴 이력(backlog 2026-07-21 HIGH)이 있어, Codex 부재를 틈타 우회 표면을 놓치지 않도록 plan 본문 §Design Decisions & Bypass-Surface Analysis(DD1~DD7)에서 verdict 파티션·이중 locus 단일 오라클·override 봉인·re-entrancy flag-gating·absent fail-closed·crash/lock 무해성·git-commit 정합을 선제 설계로 닫았다. PR-Codex는 이 설계를 diff로 재검증한다.

### Design Critique

- detector: `skill_available=true` · `design_signal=true`(signal_files=`write.js`, `renderer/html.js`) — SIGNAL=1은 **footer version-string sync 경로**(`renderer/html.js`)에서 발화. 실질 rendered design surface 변경 없음(version 문자열 sync + backend schema 필드 추가).
- critique retry loop: findings=[] (design surface 부재) → `decideCritique` → **CONVERGED** (round 1/cap 2). `design_critique_verdict='converged'`.
