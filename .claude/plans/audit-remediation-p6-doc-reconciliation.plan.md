# Plan: 문서 정합화 (CLAUDE.md drift, audit-remediation P6)

**Source PRD**: `.claude/prds/audit-remediation-followup.prd.md`
**Selected Milestone**: P6 — 문서 정합화 (CLAUDE.md drift)
**Complexity**: Small (doc-only + 주석 1건)

## Summary

감사 A(Haiku 광범위) + B(Opus 심화)가 지목한 CLAUDE.md ↔ 코드 드리프트 8지점을 실제 동작에 정합화한다. 유일한 코드 touch는 `codex-invoke.js` **주석** enum(`parse-error` 누락 보정)이고 나머지는 전부 문서 정정이다(PRD 결정: quarantine 등 로직은 손대지 않음 — `0o600` 보호로 무해). 감사가 **1.20.2 기준**이라 P2~P5(1.20.5~1.20.9)가 이미 일부 드리프트를 고쳤을 수 있으므로(예: §3.2 advisory-lock은 이미 정확), 각 지점을 **현재 CLAUDE.md에 재대조(staleness guard)** 후에만 편집한다. behavior 변경 0.

> **Codex Plan-R1 흡수 (F1/F2/F3)**: 이 plan 초안은 stale baseline(1.20.9)을 가정했으나, 검토 중 working tree가 **1.20.11**로 전진(#94 P5·#95 workflow-orch M2b=1.20.10·#93 worktree fix=1.20.11 머지)했다. 따라서 (F1) 버전 bump 타깃은 하드코딩이 아니라 **implement 시점 현재 max에서 재도출**하며 현 시점 값은 **1.20.12**(1.20.10은 M2b가 선점), staleness guard는 CLAUDE.md 드리프트뿐 아니라 **release-surface**(plugin.json/footer/CHANGELOG/i18n)까지 확장한다. (F2) §3.6 정정은 quarantine을 "무해"로 단정하지 않고 **실제 모델 + no-token legacy release 잔여 리스크를 정직 서술**한다(코드 hardening은 PRD out-of-scope → backlog). (F3) §3.3은 **strict 14값 codex-invoke 표 + 별도 tempfail note**로 분리한다(tempfail은 classify.js 계층이라 표에서 제외).

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Doc SoT | `docs/v1.3.0-observability/schema-surface.md` | derive "9 source"의 authoritative 기준 — §1.4/§5 정정 대조 원본 |
| Enum SoT | `plugins/mccp/scripts/lib/codex-invoke.js:167,243,289` | 실제 생산되는 classification(`ok`/`disabled`/`parse-error` + error reason enum). CLAUDE.md §3.3 + 주석 enum이 이 코드에 수렴해야 함 |
| Lock SoT | `pr-phase-lock.js:132-193`(hash+stdin) vs `migrations/v0.2.8-generic-receipt-quarantine.js:102-130`(raw `randomUUID`, hash/stdin 부재) | §3.6 "Canonical schema (양쪽 공통)" 정정 대조 |
| Version bump | 직전 P5 plan `Files to Change` + §3.7 체크리스트 | `plugin.json` + footer 2곳(html.js L1417 / markdown.js L154) + i18n-surface.test.js + CHANGELOG 동기 |
| Tests | `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js:88,125` | footer 버전 assertion — 유일한 mechanical 검증 대상 |

## 드리프트 지점 대조표 (grounding 완료)

각 항목은 **현재 CLAUDE.md 라인**·**실제 코드**·**정정 방향**을 담는다. `re-verify`는 감사(1.20.2) 이후 이미 고쳐졌을 수 있어 편집 전 현재 상태 확인이 필수임을 표시한다.

| # (감사) | CLAUDE.md 위치 | 실측(코드) | 정정 방향 |
|---|---|---|---|
| A④/B#12 (F3) | §3.3 표 L192-208(현재 **14행**=tempfail 포함·registry-malformed 부재) · 주석 codex-invoke.js:14-17 | 실제 codex-invoke classification 14종(주석 13 + `parse-error`). `tempfail`은 classify.js 개념(exit 75)이지 codex-invoke classification 아님 → 표에 있으면 안 됨 | **strict 14값 표로 재구성**: `registry-malformed` 행 추가(registry-missing 뒤) **+ `tempfail` 행을 표 밖 별도 note로 이동** → 표=정확히 14행(주석 13+`parse-error`). 주석 enum에 `parse-error` 추가. tempfail은 표 하단 별도 문단(classify.js/validate 계층 transient outcome) |
| A⑤ | §1.4 L125 · §5 L680 | derive source **9개**(`backlog envelopes fix-task ledger plans pr receipts state worktrees`). schema-surface.md는 9로 정확 | 두 곳 "7 source" → "9 source", 괄호 목록에 `ledger`(v1.18.3)·`worktrees`(v1.18.12) 추가 |
| A⑥/B#14 | §1.3 L106 "(mechanical enforcement)" | terminal `/mccp:pr`은 hard-block이나, 비-terminal 게이트(plan/prp-implement/resume)는 v1.3.1 informational allow-path(missing-only → ALLOW + info context). B가 실제 동작 solid 확인 | "mechanical enforcement" 옆에 v1.3.1 informational allow-path 단서 추가(missing-only는 정보성 ALLOW, terminal PR은 hard-block) |
| B#7/B#8 (F2) | §3.6 L241 "#### Canonical schema (양쪽 공통)" | pr-phase-lock만 `ownership_token_hash`+`sha256`+stdin-pipe. quarantine은 raw `randomUUID`가 lock body에 평문 기록 + `releaseLock`이 `body.token===token` ownership 검증(mismatch 시 unlink 안 함) — **단 L249-254에 no-token legacy 경로**(token 미전달 시 ownership 검증 없이 unlink, loud stderr warn). 현 `migrate()`는 항상 token 전달 | "양쪽 공통" 서술 해체 — canonical hash+stdin-pipe는 **pr-phase.lock 전용**, quarantine.lock은 raw-token/advisory(token in-memory 평문, 0o600 보호) + **no-token legacy release 잔여 리스크를 정직 명시**("무해" 단정 금지). 코드 변경 없음(hardening=backlog) |
| A⑧ | §3.9 L389-392 | oracle enum = `CONVERGED`/`ESCALATE_NEXT_ROUND`/`DIVERGENT_UNRESOLVED`(design-critique-decide.js). 표는 축약 `ESCALATE`/`DIVERGENT` 사용 | L389-392 축약형을 full enum으로(또는 "축약 표기는 …_NEXT_ROUND/…_UNRESOLVED의 준말" 명시) |
| A⑦ | §3.9 L419 | `.claude/cache/test-fixture-status.html` **미커밋·미추적·미존재**. dogfood는 `MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL` env로 이미 보장 | (기본) L419 문서 정정 — fixture는 커밋물이 아니라 test-time 합성/미사용, dogfood는 env force-fail 경유. **결정 필요**(아래 Open Q1) |
| A⑨ | §3.2 L182-188 | SessionEnd `.end` marker 메커니즘이 gate-design.md엔 있으나 §3.2 미기재. P2(1.20.5)가 방금 이 marker의 silent-failure 복구 | §3.2에 SessionEnd marker 1줄 추가(fail-loud-open · hook-trace 로드 실패 시 degraded 폴백 · gate-design.md 교차참조) |
| A⑩ | §1.4 L116 "최대 2회 bounded retry" | 실제는 실패 카운터(자동 재시도 아님) — **implement 시 stop-loop 코드 재확인 후 정정** | L116을 실제 메커니즘(bounded 실패 카운터, 자동 재시도 아님)으로 정정 |
| B#16 | §3.2 L186 | **이미 정확** — "advisory lock (fail-soft: ~1s … last-writer-wins)". 감사 이후 정정된 것으로 추정 | re-verify 후 잔여 "atomic" 오기재만 정정. 없으면 noop(정합 확인만 기록) |

## Files to Change

| File | Action | Why |
|---|---|---|
| `CLAUDE.md` | UPDATE | 위 대조표 8지점(A④~A⑩, B#7/8/12/14/16) 문서 정정 |
| `plugins/mccp/scripts/lib/codex-invoke.js` | UPDATE | 주석 classification enum(L14-17)에 `parse-error` 추가 — **유일한 코드 파일 touch(주석)** |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `version` 1.20.11 → **1.20.12** (§3.7 patch bump — 코드 주석 포함이라 patch; **implement 시 현재 max 재확인**, Codex F1) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | footer `v1.20.11` → `v1.20.12` (L1417) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | footer `v1.20.11` → `v1.20.12` (L154) |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | footer 버전 assertion 1.20.11 → 1.20.12 동기 |
| `CHANGELOG.md` | UPDATE | `[1.20.12]` row 추가(P6 doc-reconciliation) |
| `.claude/prds/audit-remediation-followup.prd.md` | UPDATE | P6 status `pending`→`in-progress`→`complete` + **version 셀 1.20.10→1.20.12 forward-reconcile**(1.20.10은 M2b 선점, Codex F1) |

## Tasks

### Task 1: §3.3 strict 14값 표 재구성 + tempfail 분리 + codex-invoke.js 주석 정합 (Codex F3)
- **Action**: (a) CLAUDE.md §3.3 표에 `registry-malformed` 행 추가(registry-missing 뒤; 원인=`installed_plugins.json` malformed JSON, block / warn+통과). (b) **`tempfail` 행을 표에서 제거해 표 하단 별도 문단으로 이동** — "tempfail(exit 75)은 codex-invoke classification이 아니라 `classify.js`/validate 계층의 transient outcome(quarantine migration in-progress)"로 서술. 결과 표 = **정확히 14행**(주석 13종 + `parse-error`). (c) `codex-invoke.js:14-17` 주석 enum 목록에 `parse-error` 추가. **왜 분리**: 현 표는 tempfail 포함 14행이므로 registry-malformed만 추가하면 15행이 되어 "codex-invoke 14종"과 불일치 — tempfail을 빼야 strict 14가 성립(Codex F3 grounded).
- **Mirror**: `codex-invoke.js:167/243/289` 실제 생산값 + error `reason` enum. 표 행 포맷은 기존 §3.3 행 재사용.
- **Verify(implement-time)**: `CodexInvokeError` reason enum 전체를 실측 열거(grep `reason:`/`new CodexInvokeError`)해 표·주석이 정확히 14종 동일 집합인지 대조. tempfail은 표 밖.
- **Validate**: 표 body 행 수 = 14 = 주석 enum. tempfail은 표 아래 문단에만 등장. (mechanical test 없음 — doc 육안)

### Task 2: derive "7 source" → "9 source"
- **Action**: CLAUDE.md L125(§1.4 derive engine 행) + L680(§5 item 6) "7 source(plans/receipts/STATE/backlog/fix-task/PR/envelopes)"를 "9 source"로, 목록에 `ledger`·`worktrees` 추가.
- **Mirror**: `docs/v1.3.0-observability/schema-surface.md`(이미 9) + `ls plugins/mccp/scripts/derive/sources/`(9 파일).
- **Validate**: `ls plugins/mccp/scripts/derive/sources/*.js | wc -l` = 9 와 문서 일치.

### Task 3: §1.3 enforcement — v1.3.1 informational allow-path 문서화
- **Action**: CLAUDE.md L106 "(mechanical enforcement)" 서술에 비-terminal 게이트의 v1.3.1 informational allow-path(missing-only → 정보성 ALLOW + hook context, terminal `/mccp:pr`은 hard-block 유지) 단서 추가.
- **Mirror**: plan.md Phase 0 "RECOVER FROM HOOK CONTEXT"(v1.3.1) + `receipt-context-schema.js`. implement 시 실제 allow-path 코드 재확인.
- **Validate**: 문서 서술이 plan.md Phase 0 informational 계약과 정합(육안).

### Task 4: §3.6 "Canonical schema (양쪽 공통)" 분리 + 잔여 리스크 정직 서술 (B#7/B#8, Codex F2, 최대 지점)
- **Action**: CLAUDE.md L241 "#### Canonical schema (양쪽 공통)" 블록을 두 락 구분으로 재작성 —
  1. canonical hash+stdin-pipe(`ownership_token_hash`/sealed channel) schema는 **`pr-phase.lock` 전용**(`pr-phase-lock.js:132-193` 실측).
  2. `quarantine.lock`은 **raw-token/advisory 모델** — `crypto.randomUUID()` 토큰이 lock body에 **평문**으로 기록(`acquireLock` L111-117), `releaseLock`이 `body.token===token` ownership 검증 후에만 unlink(mismatch/unparsable/zero-byte 시 unlink 안 함), `0o600` 파일 보호.
  3. **잔여 리스크 정직 명시(Codex F2)**: `releaseLock` L249-254에 **no-token legacy 경로** — 호출자가 token 미전달 시 ownership 검증 없이 unlink(단 loud stderr warn). 현 유일 호출자 `migrate()`는 항상 token을 전달하므로 실제 트리거 caller는 없으나, "무해(harmless)"로 단정하지 말고 **문서화된 잔여 리스크**로 표기. §3.6·§4 runbook의 quarantine=hash 서술 동반 정정.
- **코드는 손대지 않음**(PRD out-of-scope 결정) — no-token 경로 제거/test-gate 같은 hardening은 **backlog에 이연**(`codex-findings-backlog.md`).
- **Mirror**: `pr-phase-lock.js:132-193`(hash+stdin) vs `migrations/v0.2.8-generic-receipt-quarantine.js:102-138`(acquireLock raw token)·`:239-263`(releaseLock ownership 검증 + no-token legacy).
- **Validate**: `grep -c "ownership_token_hash\|sha256\|stdin" migrations/v0.2.8-generic-receipt-quarantine.js` = 0(문서가 "quarantine=hash 아님"과 정합) + 문서에 no-token legacy 잔여 리스크 문장 존재.

### Task 5: §3.9 design-critique enum full form + fixture 정정
- **Action**: (a) CLAUDE.md L389-392 축약 enum(`ESCALATE`/`DIVERGENT`)을 full(`ESCALATE_NEXT_ROUND`/`DIVERGENT_UNRESOLVED`)로 정정 또는 준말 명시. (b) L419 미커밋 fixture 서술 정정(Open Q1 결정에 따라 문서-정정 or fixture 생성).
- **Mirror**: `design-critique-decide.js:33-48` 실제 enum. `git ls-files .claude/cache/test-fixture-status.html` = ∅(미추적) 실측.
- **Validate**: `grep -oE "CONVERGED|ESCALATE_NEXT_ROUND|DIVERGENT_UNRESOLVED" design-critique-decide.js` 와 문서 enum 일치.

### Task 6: §3.2 SessionEnd marker 문서화 + §1.4 stop-loop 정정 + B#16 re-verify
- **Action**: (a) §3.2에 SessionEnd `.end` marker 메커니즘 1줄 추가(fail-loud-open · degraded 폴백 · gate-design.md 교차참조 — P2 1.20.5 반영). (b) L116 stop-loop "최대 2회 bounded retry"를 실제 메커니즘(실패 카운터, 자동 재시도 아님)으로 정정 — **implement 시 stop-loop 코드로 실측 확인 후**. (c) B#16 §3.2 L186 advisory-lock re-verify — 이미 정확하면 noop(정합 확인만).
- **Mirror**: `docs/gate-design.md`(SessionEnd marker 서술) · P2 plan(`audit-remediation-p2-session-continuity.plan.md`) · stop-loop 실제 코드.
- **Validate**: 육안 — §3.2 서술이 gate-design.md + P2 구현과 정합.

### Task 7: 버전 bump 하우스키핑 (§3.7, Codex F1 — implement 시 재도출)
- **Action(선행)**: implement 착수 시 **현재 max 버전 재확인** — `plugin.json` + CHANGELOG head + footer 2곳 + i18n test를 grep해 실제 max를 확정하고 **next-free patch**를 타깃한다. 하드코딩 금지(초안이 1.20.9→1.20.10을 가정했으나 검토 중 1.20.11로 전진, 1.20.10은 M2b 선점). **현 시점 타깃 = 1.20.11 → 1.20.12** (단 병렬 트랙 workflow-orch M3 등이 먼저 1.20.12를 점유할 수 있으므로 PR 직전 재확인, §3.7 forward-reconcile).
- **Action(본)**: `plugin.json` 1.20.11→1.20.12 · html.js(L1417)/markdown.js(L154) footer 2곳 동기 · i18n-surface.test.js assertion 동기 · CHANGELOG `[1.20.12]` row(직전 row 형식 미러) · PRD P6 version 셀 1.20.10→1.20.12 reconcile.
- **Mirror**: 직전 `[1.20.11]`/`[1.20.10]` CHANGELOG row + footer 편집 패턴.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` · `grep -rln "<target>" plugin.json html.js markdown.js`(3곳 hit) · `grep -c "\[<target>\]" CHANGELOG.md`(=1) · 이전 버전 문자열(1.20.11) 잔존 0.

### Task 8: 전 지점 재대조 sweep (staleness guard — CLAUDE.md **+ release-surface**, Codex F1)
- **Action**: 편집 착수 전 2축 재대조 —
  1. **CLAUDE.md 드리프트 8지점**을 현재 CLAUDE.md에 1:1 재확인(감사 1.20.2 이후 P2~P5가 고친 지점 식별 — B#16이 그 예). 이미 정합이면 "verified-noop" 기록. 추가로 표 밖 **prose의 stale enum/count 언급**(예: "7 source"·classification 개수)이 §1.4/§5 외 다른 곳에도 있는지 grep sweep(Codex F3 checklist 확장).
  2. **release-surface**(plugin.json/footer×2/CHANGELOG/i18n test)의 현재 max 버전을 재확인 — 초안 baseline(1.20.9)이 검토 중 1.20.11로 skew된 사고 재발 방지(Codex F1). Task 7 타깃을 여기서 확정.
  이후 PRD 표 P6 `pending`→`in-progress`(Plan 셀=본 파일)→`complete` + version 셀 reconcile.
- **Mirror**: PRD 표 기존 행 형식 · §3.7 forward-reconcile 규율.
- **Validate**: 드리프트 각 행이 (edited | verified-noop)으로 종결 · release-surface 버전이 단일 max로 정합 · PRD 표 in-progress 잔존 0(P6 complete 시점).

## Validation

```bash
# 렌더러 footer surface (유일한 mechanical 검증)
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 버전 일관성 (implement 시 현재 max에서 재도출한 target, 현 시점 1.20.12)
TARGET=1.20.12   # implement 착수 시 Task 8로 재확인 (Codex F1 — 하드코딩 금지)
grep -rn "$TARGET" plugins/mccp/.claude-plugin/plugin.json \
  plugins/mccp/scripts/lib/renderer/html.js \
  plugins/mccp/scripts/lib/renderer/markdown.js
grep -c "\[$TARGET\]" CHANGELOG.md   # = 1

# 드리프트 재대조 앵커 (문서가 코드와 정합인지 grounding)
ls plugins/mccp/scripts/derive/sources/*.js | wc -l                       # = 9 (Task 2)
grep -c "ownership_token_hash\|sha256" plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js  # = 0 (Task 4)
grep -oE "ESCALATE_NEXT_ROUND|DIVERGENT_UNRESOLVED" plugins/mccp/scripts/lib/design-critique-decide.js       # present (Task 5)
git ls-files .claude/cache/test-fixture-status.html                        # ∅ (Task 5)

# receipt/렌더러 회귀 무손상 (behavior 변경 0 확인)
node --test plugins/mccp/scripts/receipt/tests/ plugins/mccp/scripts/lib/renderer/tests/
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **release-surface 버전 skew(Codex F1)** — 병렬 트랙(workflow-orch)이 버전을 소진해 baseline이 이동(초안 1.20.9 → 검토 중 1.20.11). 하드코딩된 bump이 이미 쓰인 버전을 중복/역행 | **High** | Task 7/8이 **implement 시 현재 max 재도출** → next-free patch(현 1.20.12). §3.7 forward-reconcile. PR 직전 재확인(M3 등이 1.20.12 선점 가능) |
| 감사(1.20.2)가 stale — 지목 드리프트가 이미 P2~P5에서 정정됨 → 존재하지 않는 텍스트 편집 시도 | High | **Task 8 재대조 sweep 선행** — 각 지점을 현재 CLAUDE.md에 확인 후에만 편집. B#16(L186)이 이미 정확한 실증 사례. verified-noop 기록 |
| §3.6 재작성이 새 부정확 도입 — quarantine을 "무해"로 단정하나 no-token release 잔여 존재(Codex F2) | Medium | Task 4가 실제 모델 + no-token legacy 잔여를 **정직 서술**("무해" 금지). code hardening은 backlog. Validate로 잔여 문장 존재 확인 |
| **stacked-PR 함정([[stacked-pr-merge-order]])** | Low(완화됨) | #94 P5·#95 M2b·#93 worktree fix가 **이미 머지**(HEAD=1.20.11) → P6는 현재 main에서 독립 분기 → 1.20.12. 초안 시점 우려는 대부분 해소. worktree cleanup(§3.8)은 PR 직후 |
| fixture 결정(문서정정 vs 생성) 미확정 → Task 5 지연 | Low | Open Q1 기본값=문서정정(env force-fail이 이미 dogfood 보장). implement 미세결정 |
| doc-only인데 codex-invoke.js 주석 touch로 patch bump 필요 판단 누락 → cache stuck(§3.7) | Low | Task 7이 1.20.12 bump을 acceptance에 포함. 코드 파일 포함이라 patch가 정답 |

## Acceptance
- [ ] 대조표 8지점 전부 (edited | verified-noop)으로 종결 — 현재 CLAUDE.md 기준 재대조(Task 8)
- [ ] §3.3이 **strict 14값 codex-invoke 표**(`registry-malformed`·`parse-error` 포함) + **별도 tempfail note**(classify.js 계층)로 분리 — 표 body=14행, tempfail 표 밖(Codex F3)
- [ ] codex-invoke.js 주석 enum에 `parse-error` 추가 → 주석 = 표 = 실제 생산값 14종 동일 집합
- [ ] §1.4 + §5 derive "9 source"(ledger·worktrees 포함)
- [ ] §1.3에 v1.3.1 informational allow-path 단서(terminal PR hard-block 유지 명시)
- [ ] §3.6이 pr-phase.lock(hash+stdin-pipe) ↔ quarantine.lock(raw-token/advisory) 구분 + **no-token release 잔여 리스크 정직 서술**("무해" 단정 부재, Codex F2) — quarantine 코드 무변경
- [ ] §3.9 full enum(`ESCALATE_NEXT_ROUND`/`DIVERGENT_UNRESOLVED`) + fixture 서술 정확
- [ ] §3.2 SessionEnd marker 문서화 + §1.4 stop-loop 정정 + B#16 정합
- [ ] **implement 시 재도출한 next-free patch**(현 1.20.12) — plugin.json + footer 2곳 + i18n test + CHANGELOG 동기, 이전 버전 문자열 잔존 0(Codex F1)
- [ ] behavior 변경 0 — receipt/렌더러 회귀 green, 코드 로직 파일 diff 부재(codex-invoke.js는 주석만)
- [ ] PRD P6 complete + version 셀 reconcile + in-progress 잔존 0
- [ ] backlog에 quarantine no-token release hardening 이연 항목 append(Codex F2)
- [ ] Patterns mirrored — schema-surface.md·실제 lock/enum 코드를 SoT로, 새 서술 발명 금지

## Open Questions
- [ ] **Q1 (Task 5)**: A⑦ fixture — (a) 문서 정정(fixture는 커밋물 아님, env force-fail이 dogfood 보장) **[기본]** vs (b) `.claude/cache/test-fixture-status.html` 1줄 생성해 문서와 일치. 기본=(a): P6는 doc-only 스코프이고 env 경로가 이미 회귀 보장. implement 미세결정.
- [ ] **Q2 (Risk, 해소)**: #94 P5·#95 M2b·#93 worktree fix가 이미 머지(HEAD=1.20.11) → P6는 현재 main에서 독립 분기, 버전=1.20.12. stacked-PR 우려 대부분 해소. 남은 결정: workflow-orch M3가 1.20.12를 먼저 점유하면 P6는 next-free로 재reconcile(PR 직전, §3.7).

## External Research Provenance

- Source PRD: .claude/prds/audit-remediation-followup.prd.md
- References section sha256: 0eecc0ea19cbb247ddb9b217f324ad3c5a8e7057076f94c97c2366508c21c861
- Stamped at: 2026-07-08T06:27:13.940Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.20.8/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available`). classification=`ok`, blocking=0.
- 라운드 수: 1 (R1 — 3 finding 모두 plan 수정으로 흡수, 미해소 HIGH/CRITICAL 부재로 R2 미발화)
- 합치 결론: **converged** — Codex `result.verdict='needs-attention'`의 3 finding(HIGH×2, MEDIUM×1)을 전부 실측 검증 후 흡수. F1/F2는 CONFIRMED(refute 아님), F3도 grounded.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — Task 7이 1.20.9→1.20.10 하드코딩·grep 검증하나 repo가 이미 1.20.11(1.20.10=M2b 선점, [1.20.10] changelog 존재) → 다운그레이드/중복 위험. staleness guard가 CLAUDE.md만 봐 release-surface skew 누락 | HIGH | ACCEPT_NOW | **CONFIRMED** — 세션 초반 내 grounding(1.20.9)이 검토 중 1.20.11로 skew(#94/#95/#93 머지 실측). Task 7/8을 "implement 시 현재 max 재도출→next-free(1.20.12)"로 개정, staleness guard에 release-surface 추가 |
| F2 — §3.6를 doc-only "무해"로 닫으나 `releaseLock` L249-254에 no-token legacy 경로(ownership 검증 없이 unlink) 잔존. 레거시/직접 호출자가 쓰면 live holder 락 삭제 가능 | HIGH | ACCEPT_NOW | **CONFIRMED**(코드 실측 L249-254 — token 미전달 시 unlink, loud warn). 현 `migrate()`는 항상 token 전달이라 트리거 caller 부재. 흡수: Task 4가 "무해" 단정 대신 실제 모델+잔여 리스크 정직 서술, code hardening은 backlog(PRD out-of-scope 준수) |
| F3 — Task 1의 "표=14행" 기준이 모순 — 현 표는 tempfail 포함 14행, registry-malformed 추가 시 15. tempfail은 classify.js 소유(codex-invoke enum 아님) | MEDIUM | ACCEPT_NOW | **CONFIRMED**(현 §3.3 14행 실측, tempfail 포함·registry-malformed 부재). 흡수: Task 1을 strict 14값 표(registry-malformed 추가 + tempfail 표 밖 이동) + 별도 tempfail note로 분리 |
- Deferred to backlog: 1 → `.claude/plans/codex-findings-backlog.md` (F2 quarantine no-token release 경로 hardening — 제거/test-gate, PRD out-of-scope로 code는 이연·문서만 P6)
- Open Questions: 없음 (F1/F2/F3 전부 R1 흡수, auto-CRITICAL 부재 — secret/data-loss/irreversible-migration/auth-bypass/external-destination/crypto 해당 없음)
- Codex session 참조: threadId `019f406a-e9ad-7533-b5e3-db79085f158d`

> 주: wrapper의 `bridge.parseVerdict`는 companion structured JSON을 "unavailable"로 파싱(포맷 seam, P5와 동일)했으나 실제 `result.verdict='needs-attention'` + 3 finding이 반환됐고, Codex 자체 파일 조회 도구는 정책 차단(`rg`/powershell blocked)됐음에도 F1 버전 skew를 정확히 짚었다. 세 finding 모두 caller(본 gate)가 실측 재확인 후 흡수 → receipt `codex_verdict='converged'`.

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected (doc-only reconciliation + single comment enum edit; no file layout, abstraction, dependency, or concurrency decisions introduced). `git diff --name-only origin/main..HEAD` ⊆ plan's Files to Change (no implement-time file expansion). Cross-gate dedupe applied.
