# 게이트 · receipt · Codex

> `docs/ENVIRONMENT.md`의 **gates** 도메인 상세. 색인은 값과 기본값만 싣고 서사는 여기 있다.

receipt chain, Codex 호출, Stop-loop, auto-chain, 그리고 감사되는 우회(audited escape)를 지배하는 토글이다. 이 도메인의 토글은 «리뷰가 실제로 일어났는가»를 바꾸므로, 값을 바꾸기 전에 무엇이 꺼지는지 확인한다.

## 읽는 법

각 토글은 자기 이름의 앵커를 갖고, 그 아래에 값·기본값·소비처·사용 예시가 온다. `값` 열의 어휘는 **문서가 가르치는 표기**이고, 파서가 실제로 받아 주는 별칭 집합은 그보다 넓다 — 정확한 집합은 색인의 «값 규약»에 있다.

**사용 예시**는 전부 `.claude/settings.json`의 `env` 블록에 그대로 붙여 넣을 수 있는 형태다. 1회성으로만 쓰는 토글은 셸 예시를 함께 둔다.

## 토글

### MCCP_RECEIPT_GATE_MODE

**종류** `enum` — **값** `hard` · `soft` · `off` — **기본값** `hard`

**한 줄** receipt 게이트 강도.

**소비처** `plugins/mccp/scripts/hooks/receipt-prompt.js:217`

**사용 예시**

```json
{
  "env": {
    "MCCP_RECEIPT_GATE_MODE": "soft"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_RECEIPT_GATE_MODE` | `hard` \| `soft` \| `off` | `hard` | ✅ live | receipt 게이트 운용 모드. `hard`=chain-of-custody 강제(누락 receipt 차단), `soft`=누락 시 `decision="skipped-soft"` placeholder를 자동 write(다운스트림 validator는 non-approving 처리), `off`=게이트 자체 비활성(개인 디버깅 전용, stderr 큰 경고). 알 수 없는 값은 hard로 fallback + stderr warning. [receipt-mode.js](../plugins/mccp/scripts/lib/receipt-mode.js). |
  MCCP_RECEIPT_GATE_MODE=soft|hard|off     # v0.2.2 live. default=hard. soft/off는 opt-in only.
```

### MCCP_SKIP_RECEIPT

**종류** `bypass-flag` — **값** `1` — **기본값** `off`

**한 줄** receipt 게이트 1회 우회.

**소비처** `plugins/mccp/scripts/hooks/receipt-prompt.js:260`

**극성** 미설정이면 **꺼져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_SKIP_RECEIPT": "1"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
MCCP_SKIP_RECEIPT=1 /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_SKIP_RECEIPT` | `1` | unset | 단일 게이트 호출에 한해 receipt 발급 + 검증을 bypass. **운영용이 아닌 디버깅 용**. |
  > 운영 settings.json에 `MCCP_SKIP_RECEIPT=1`을 영구 set하지 마세요 — chain-of-custody가 깨집니다.
  MCCP_SKIP_RECEIPT=1                      # 일회성 bypass (한 호출만) ─ live
```

### MCCP_RECEIPT_DEBUG

**종류** `bool` — **값** `on` · `off` — **기본값** `off`

**한 줄** receipt 디버그 출력.

**소비처** `plugins/mccp/scripts/hooks/goal-phase-guard.js:196`

**극성** 미설정이면 **꺼져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_RECEIPT_DEBUG": "on"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_RECEIPT_DEBUG` | `1` | unset | receipt 관련 hook에서 진단 stderr 출력을 켭니다. v0.2.7부터 ALLOW path에서 `systemMessage`도 emit합니다 (L2a). |
  ### MCCP_RECEIPT_DEBUG precedence (v0.2.7 C7)
  MCCP_RECEIPT_DEBUG=1                     # 디버그 출력 활성화 ─ live
```

### MCCP_RECEIPT_DEBUG_LEGACY_INLINE

**종류** `bool` — **값** `on` · `off` — **기본값** `on`

**한 줄** 구형 inline 디버그 유지.

**소비처** `plugins/mccp/scripts/hooks/receipt-prompt.js:125`

**극성** 미설정이면 **켜져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_RECEIPT_DEBUG_LEGACY_INLINE": "off"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_RECEIPT_DEBUG_LEGACY_INLINE` | `0` | unset | v0.2.7 advanced opt-out — `MCCP_RECEIPT_DEBUG=1`일 때 ALLOW-path `systemMessage`를 끄고 기존 block-payload inline 모드만 유지. |
  | `MCCP_RECEIPT_DEBUG` | `MCCP_RECEIPT_DEBUG_LEGACY_INLINE` | ALLOW path systemMessage | Block-payload inline | stderr |
  MCCP_RECEIPT_DEBUG_LEGACY_INLINE=0                 # v0.2.7 advanced opt-out. MCCP_RECEIPT_DEBUG=1일 때 L2a ALLOW-path systemMessage emit을 끄고 기존 block-payload inline 모드만 유지. Default(unset 또는 =1)는 L2a active. 자세한 precedence는 docs/ENVIRONMENT.md §1.
```

### MCCP_ALLOW_CODEX_UNAVAILABLE

**종류** `bypass-flag` — **값** `1` — **기본값** `off`

**한 줄** Codex 미가용 시 advisory.

**소비처** `plugins/mccp/scripts/lib/codex-invoke.js:168`

**극성** 미설정이면 **꺼져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_ALLOW_CODEX_UNAVAILABLE": "1"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
MCCP_ALLOW_CODEX_UNAVAILABLE=1 /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_ALLOW_CODEX_UNAVAILABLE` | `1` | unset | ✅ live | Codex 호출이 unavailable/blocking으로 떨어졌을 때 wrapper exit 0로 진행하되 receipt body에 `advisory=true`로 stamp (converged receipt 미발급). 미설정이면 unavailable = hard fail. [codex-invoke.js:104,222](../plugins/mccp/scripts/lib/codex-invoke.js), [auto-chain.js:161](../plugins/mccp/scripts/lib/auto-chain.js). |
  `MCCP_CODEX_DISABLED` vs `MCCP_ALLOW_CODEX_UNAVAILABLE` 차이:
  - `MCCP_ALLOW_CODEX_UNAVAILABLE=1` → 호출은 하되, 실패하면 advisory mode로 진행 (Codex 일시 장애 대응).
  MCCP_ALLOW_CODEX_UNAVAILABLE=1           # advisory mode (non-approving receipt). terminal /mccp:pr은 거부 ─ live (v0.2.2)
```

### MCCP_CODEX_DISABLED

**종류** `bypass-flag` — **값** `1` — **기본값** `off`

**한 줄** Codex 호출 영구 skip.

**소비처** `plugins/mccp/scripts/lib/codex-bridge.js:135`

**극성** 미설정이면 **꺼져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_CODEX_DISABLED": "1"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
MCCP_CODEX_DISABLED=1 /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_CODEX_DISABLED` | `1` | unset | Codex 호출 자체를 skip하고 즉시 `{verdict:'skipped', reason:'codex_disabled'}` 반환. Codex 미설치/미인증 사용자가 mccp 게이트를 noise 없이 통과시키려고 쓰는 토글. `/mccp:setup` Phase 4가 사용자의 동의를 받아 자동 write. SessionStart 누락 안내도 이 변수가 `1`이면 침묵. |
  - `MCCP_CODEX_DISABLED=1` → Codex CLI를 **호출조차 안 함** (의도적 비활성).
  MCCP_CODEX_DISABLED=1                    # Codex 호출 영구 skip. v0.3.5부터 wrapper(codex-invoke.js)가 first-class honor — spawn 직전 short-circuit으로 classification='disabled' 즉시 반환. codex-runner는 codex_outcome='disabled', receipt는 meta.codex_disabled=true + meta.codex_skip_reason='codex_disabled' 자동 stamp. terminal /mccp:pr Phase 0 advisory-rejection 예외 + Phase 0.3 3-way mutex(disabled ⊕ skipped ⊕ dedupe) 통과. codex-bridge는 v0.2.x부터 이미 honor — 두 layer 동기화 완료. /mccp:setup Phase 4가 자동 write.
```

### MCCP_CODEX_DESIGN_SCOPE_HONOR

**종류** `bool` — **값** `on` · `off` — **기본값** `on`

**한 줄** Codex design-scope preamble.

**소비처** `plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js:275`

**극성** 미설정이면 **켜져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_CODEX_DESIGN_SCOPE_HONOR": "off"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_CODEX_DESIGN_SCOPE_HONOR=0|1        # v0.3.6 default: 1. 축 1 kill switch (디버그용). impeccable 가용 시 codex-invoke wrapper가 focus 앞에 DESIGN_SCOPE_PREAMBLE prepend + codex-result-filter가 design/a11y keyword 매칭 finding을 drop. =0이면 두 layer 모두 no-op (기존 v0.3.5 동작 복원). receipt meta 4 fields(`codex_design_scope_excluded`, `design_findings_dropped`, `a11y_routed_to_impeccable`, `dropped_findings_digest`)는 어느 쪽이든 audit용으로 작성.
```

### MCCP_STOP_LOOP

**종류** `enum` — **값** `off` · `observe` · `enforce` — **기본값** `observe`

**한 줄** Stop-loop 게이트 모드.

**소비처** `plugins/mccp/scripts/hooks/stop-review-loop.js:47`

**사용 예시**

```json
{
  "env": {
    "MCCP_STOP_LOOP": "off"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_STOP_LOOP` | `off` \| `observe` \| `enforce` | `observe` | Claude 응답 종료 직전 자동 게이트(lint/typecheck/test/e2e) 동작 모드. `off`=완전 비활성, `observe`=실행 후 stdout verdict만(block X), `enforce`=실패 시 Stop 차단 + `fix-task.md` 생성 + 최대 2회 bounded retry. |
  | `MCCP_STOP_LOOP_E2E` | `1` | unset | Quality runner의 `e2e` stage 활성화. unset이면 e2e는 `skipped`로 처리되어 lint/typecheck/test만 게이트로 작동. [quality/runner.js:90](../plugins/mccp/scripts/quality/runner.js). |
  MCCP_STOP_LOOP=off|observe|enforce       # default: observe (관측만, block 안 함)
```

### MCCP_STOP_LOOP_CODEX

**종류** `bool` — **값** `on` · `off` — **기본값** `off`

**한 줄** Stop-loop에 Codex 병행.

**소비처** `plugins/mccp/scripts/hooks/stop-review-loop.js:53`

**극성** 미설정이면 **꺼져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_STOP_LOOP_CODEX": "on"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_STOP_LOOP_CODEX` | `0` \| `1` | `0` | Quality runner 통과 후 Codex diff review를 추가로 실행할지. `1`이면 `<repo>/.claude/state/codex-stop-loop-input.txt`에서 사전 기록된 Codex review를 읽어 분류 (`verdict='critical'` 또는 `escalate=true` → 실패). 파일 부재 시 stderr notice 1줄 + fail-open. |
  MCCP_STOP_LOOP_CODEX=0|1                 # default: 0 (Codex diff review opt-in)
```

### MCCP_AUTO_CHAIN_DISABLE

**종류** `bool` — **값** `on` · `off` — **기본값** `off`

**한 줄** auto-chain 자동 진행 중단.

**소비처** `plugins/mccp/scripts/lib/auto-chain.js:141`

**극성** 미설정이면 **꺼져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_AUTO_CHAIN_DISABLE": "on"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_AUTO_CHAIN_DISABLE` | `1` | unset | ✅ live | `prp-implement → prp-commit → prp-pr` 자동 chain을 비활성화하는 operator kill switch. `auto-chain.js`의 `shouldAbort()`가 첫 번째로 검사. |
  MCCP_AUTO_CHAIN_DISABLE=1                # kill switch ─ live
```

### MCCP_AUTO_CHAIN_SKIP_PR

**종류** `bool` — **값** `on` · `off` — **기본값** `off`

**한 줄** commit까지만, PR 생략.

**소비처** `plugins/mccp/commands/prp-implement.md:1615`

**극성** 미설정이면 **꺼져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_AUTO_CHAIN_SKIP_PR": "on"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_AUTO_CHAIN_SKIP_PR` | `1` | unset | 📖 LLM-observed | **mechanical 미구현** — `auto-chain.js`/`prp-implement` hook이 이 변수를 honor하지 않습니다. `prp-implement.md` Phase 7 직전에 LLM이 본인 환경에서 읽어 `/mccp:pr` invocation을 skip할지 판단하는 prompt-level toggle. 사용자가 mechanical 강제를 기대하면 fail-open (chain은 그대로 PR로 진행됨). W-VERDICT C2 axis M (F-W10-1) 강등 결과 — mechanical 구현은 axis M follow-up patch. |
  MCCP_AUTO_CHAIN_SKIP_PR=1                # commit-only chain (직접 push cycles 용) ─ LLM-observed (mechanical 미구현; auto-chain.js는 honor하지 않음, W-VERDICT C2 axis M)
```

### MCCP_GATE_ROUND_CAP

**종류** `int` — **값** 자유 문자열 — **기본값** `1`

**한 줄** 게이트 라운드 상한.

**소비처** `plugins/mccp/scripts/lib/review-single-pass.js:31`

**사용 예시**

```json
{
  "env": {
    "MCCP_GATE_ROUND_CAP": "1"
  }
}
```

### MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 비수렴 ship override.

**소비처** `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js:318`

**사용 예시**

```json
{
  "env": {
    "MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE="<reason>" # v1.23.0 integrity-unification M3 audited override. terminal /mccp:pr의 M3 ship gate가 non-approving PR-Codex verdict(resolution.codex_verdict ∈ {divergent, critical, unavailable, absent})를 finalize exit 12 + validate --check-ship-verdict로 mechanical HALT하는데, 이 env + substantive reason 설정 시 그 이번 ship만 우회한다. reason validator는 strict SCHEMA REJECT (empty/1-token/URL-only/<30자/<3단어 → Phase 0.4 preflight 즉시 exit 1 + receipt write 시점 재차단). MCCP_PR_SKIP_CODEX_REVIEW과 근본적으로 다름 — 저건 Codex를 아예 skip(review 부재)이고 이건 Codex가 실제로 "No ship"이라 말한 뒤의 override다. **verdict를 converged로 재작성하지 않는다** — receipt는 실제 divergent를 봉인한 채 meta.pr_codex_force_override=true + reason과 ship돼 cross-gate dedupe fail-closed·§3.12 봉인·ledger 승인 술어(M1) 무손상(DD3). Phase 0.3 3-way mutex와 독립(Codex-skip 경로 아님). Phase 4가 ## PR-Codex Override 섹션 auto-inject(raw verdict·reason·drop 건수 명시). 1회용 권장 (예: upstream에서 이미 adversarial-review 거친 cherry-pick PR).
  MCCP_SKIP_INTENT_GATE="<reason>"           # v1.23.1 audited override. /mccp:plan의 intent gate가 **판정으로서** block(`incomplete`/`conflict_unresolved`/`skipped-unproven`/`inconclusive`/`mislabel_unresolved`)일 때 **이번 호출의 mechanical HALT만** 해제한다. **운영 실패에는 적용되지 않는다** — review payload 판독 불가·adjudication 미도착(timeout)·adjudication JSON 파손·post-write `plan_hash` 불일치는 override 지점(`plan-codex-runner.js`의 `deriveIntentGateDecision` 호출) **이전에** exit하며, 이는 결함이 아니라 경계다: 앞의 셋은 봉인할 리뷰 자체가 완료된 적이 없어(판정 입력 부재) receipt에 쓸 내용이 없고, 마지막은 자기가 주장하는 plan과 불일치하는 receipt를 봉인하는 것이라 감사 코퍼스를 오염시킨다. 이들의 복구는 override가 아니라 원인 제거(재실행·adjudication 작성·JSON 수정)다. strict reason validator(≥30자·≥3단어·placeholder/URL-only/banlist 거부 — `MCCP_FORCE_PR_WITHOUT_IMPECCABLE`와 동일 규칙). **verdict를 세탁하지 않는다** — receipt는 실제 blocking verdict를 봉인한 채 `meta.intent_gate_force_override=true` + reason과 함께 작성되므로, cross-gate dedupe는 여전히 fail-closed고(PR-Codex 실발화) 감사 corpus도 거짓이 되지 않는다(DD6, M3 `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE`와 동형). `cli.js write --gate mccp-plan-codex`가 in-scope fail-closed로 막힐 때의 유일한 비-runner 통로이기도 하다. 1회용 권장.
```

### MCCP_FORCE_PR_WITHOUT_IMPECCABLE

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** impeccable 미가용 override.

**소비처** `plugins/mccp/commands/pr.md:45`

**사용 예시**

```json
{
  "env": {
    "MCCP_FORCE_PR_WITHOUT_IMPECCABLE": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
MCCP_FORCE_PR_WITHOUT_IMPECCABLE=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_FORCE_PR_WITHOUT_IMPECCABLE="<reason>"        # v0.2.6 audited escape (Codex R1 F4 strict). terminal /mccp:pr에서 impeccable Skill 미가용 + 이 env var의 specific reason 설정 시 force-override 진입. v0.2.4 security와 달리 reason validator가 SCHEMA REJECT — empty/whitespace/1-token banlist(yes/ok/true)/URL-only/<30자/<3단어/placeholder는 receipt write 시점에 차단. receipt에 meta.impeccable_force_override=true + reason 기록, PR body에 ## Impeccable Override section auto-inject (canonical audit source). 1회용 권장.
  MCCP_PR_SKIP_CODEX_REVIEW="<reason>"               # v0.2.8 audited escape (Task 2.6.1 C). terminal /mccp:pr에서 Codex review 호출 자체를 skip — cross-gate dedupe 조건은 충족 못 했지만 PR 본문에 review를 inject할 필요가 없는 경우 (예: receipt chain 외부에서 이미 다른 검증을 거친 cherry-pick PR). reason validator는 MCCP_FORCE_PR_WITHOUT_IMPECCABLE과 동일 SCHEMA REJECT 규칙 (empty/1-token/URL-only/<30자/<3단어 → write 시점 차단 + receipt schema invalid). receipt에 meta.codex_skipped_at_pr=true + codex_skip_reason 기록, PR body footer에 ## Codex Review Skipped section auto-inject. F9 mutex preflight: 본 env var는 CODEX_DEDUPE_AT_PR=1과 mutually exclusive — Phase 0.3에서 둘 다 설정 시 STOP exit 1. 1회용 권장.
```

### MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** security 미가용 override.

**소비처** `plugins/mccp/commands/pr.md:659`

**사용 예시**

```json
{
  "env": {
    "MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER="<reason>" # v0.2.4 audited escape. terminal /mccp:pr이 security-reviewer agent unavailable + 이 env var의 specific reason 설정 시 advisory mode 진입. receipt에 meta.security_force_override=true + reason 기록, PR body에 ## Security Reviewer Override section auto-inject (canonical audit source). 1-token reason(=1, =yes)은 schema warning 발동. 1회용 권장.
```

### MCCP_PR_SKIP_CODEX_REVIEW

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** PR-Codex skip escape.

**소비처** `plugins/mccp/commands/pr.md:71`

**사용 예시**

```json
{
  "env": {
    "MCCP_PR_SKIP_CODEX_REVIEW": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
MCCP_PR_SKIP_CODEX_REVIEW=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  CODEX_DEDUPE_AT_PR=1                               # v0.2.8 internal signal. cross-gate dedupe가 활성화돼 PR step의 Codex 호출이 skip됐음을 receipt가 명시. 사용자가 직접 설정할 일은 없음 — dedupe 로직이 자동 export. F9 mutex preflight: MCCP_PR_SKIP_CODEX_REVIEW와 mutually exclusive.
```

### MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** design chain 차단 1회 우회.

**소비처** `plugins/mccp/commands/pr.md:846`

**사용 예시**

```json
{
  "env": {
    "MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN="<reason>" # v1.3.0-m2 audited escape (PR scope chain-check). /mccp:pr Phase 1.6 preflight가 prior receipt verdict='divergent' 발견 시 BLOCK하지만, 이 env + substantive reason 설정 시 advisory mode 진입. strict reason validator (위와 동일). 활성 시 receipt meta.pr_design_chain_skip_reason stamp + PR body footer에 ## Design Critique Chain Skipped section auto-inject (canonical audit source). cherry-pick PR + prior receipt unavailable 같은 좁은 use case 전용.
```

### MCCP_GATEGUARD

**종류** `enum` — **값** `on` · `off` — **기본값** `on`

**한 줄** gateguard hook 활성.

**소비처** `plugins/mccp/scripts/hooks/gateguard-fact-force.js:438`

**사용 예시**

```json
{
  "env": {
    "MCCP_GATEGUARD": "off"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_GATEGUARD` | `off` | (on) | GateGuard fact-force hook을 일시 비활성. setup/repair 중 GateGuard가 막을 때 임시 우회. |
  | `GATEGUARD_DISABLED` | `1`/truthy | unset | `MCCP_GATEGUARD=off`와 별개의 GateGuard 비활성 토글. 두 변수 중 하나라도 set이면 GateGuard 우회. [gateguard-fact-force.js:434](../plugins/mccp/scripts/hooks/gateguard-fact-force.js). |
```

### CODEX_DEDUPE_AT_PR

**종류** `string` — **값** `1` — **기본값** 없음 (미설정이 기본)

**한 줄** cross-gate dedupe 전달 신호.

**소비처** `plugins/mccp/commands/pr.md:101`

**상태** `internal` — 런타임이 주입하는 이름이다. 보통 직접 설정하지 않지만 test에서 고정할 수 있다.

**사용 예시**

```json
{
  "env": {
    "CODEX_DEDUPE_AT_PR": "1"
  }
}
```

### MCCP_GOAL_FEATURE

**종류** `enum` — **값** `available` · `missing` · `unknown` — **기본값** 없음 (미설정이 기본)

**한 줄** native /goal 가용성 강제.

**소비처** `plugins/mccp/scripts/lib/goal-detect.js:59`

**사용 예시**

```json
{
  "env": {
    "MCCP_GOAL_FEATURE": "available"
  }
}
```

### MCCP_ULTRACODE_FEATURE

**종류** `enum` — **값** `available` · `missing` · `unknown` — **기본값** 없음 (미설정이 기본)

**한 줄** ultracode 가용성 강제.

**소비처** `plugins/mccp/scripts/lib/ultracode-detect.js:50`

**사용 예시**

```json
{
  "env": {
    "MCCP_ULTRACODE_FEATURE": "available"
  }
}
```

## 보존된 배경 서술

아래는 특정 토글 하나에 귀속되지 않는 원문 줄이다. 축약이 삭제가 아니라 이전임을 기계로 확인할 수 있도록 줄 단위로 보존한다.

```text
  값은 모두 문자열(JSON spec). 모든 `MCCP_*`/`ECC_*` 변수는 **opt-in** — 키를 빼면 안전한 기본값으로 동작합니다.
  - ECC fork에서 가져온 거면 `ECC_*` 유지 (rename은 깨질 위험)
  - 다른 plugin/skill 거면 그 prefix 그대로 (`IMPECCABLE_*`, `CLV2_*` 등) — 본 문서는 mccp가 read하거나 vendor한 skill에 한정해 등재
```

