# santa-evidence-diversity M3 — implement-gate notes

> plan 본문(`.claude/plans/santa-evidence-diversity-m3.plan.md`)은 `mccp-plan-codex`
> receipt가 `plan_hash`(`sha256:9af3f69e…`)로 봉인한 대상이라 게이트 산출물을 본문에
> 주입하지 않는다(M1·M2 · santa-adjudication M1~M3 선례). `/mccp:prp-implement`
> Phase 2.5.4가 허용하는 대체 자리에 기록한다. 본문을 편집하면 receipt가 stale이 되어
> `/mccp:pr`이 §3.11 guard 2에 막힌다.

## Codex Implementation Review

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 결과: `classification=disabled` · `blocking=false` · `durationMs=0`
- 사유: `MCCP_CODEX_DISABLED=1` (user-level `~/.claude/settings.json` `env` 블록). v0.3.5
  first-class skip이라 advisory env가 필요 없고 receipt에 `meta.codex_disabled=true` +
  `meta.codex_skip_reason='codex_disabled'`가 자동 stamp된다
- 라운드 수: 1 (§3.15 — `MCCP_GATE_ROUND_CAP=1`)
- `CODEX_VERDICT`: `skipped`

> Codex skipped per MCCP_CODEX_DISABLED=1

### Security Reviewer

호출: `Task(mccp:security-reviewer)` — 구현 이전 설계 리뷰. 대상 축 5개(입력 검증 ·
push 게이트를 여는 audited override · PATH 재도출 · receipt 양방향 불변식 · verdict 사영).

#### YAGNI Triage

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| F1 `familyOf` 부분일치 충돌 — 평가 순서 미명세라 `claude-gpt-x`가 순서에 따라 갈린다 | CRITICAL | ACCEPT_NOW | 실재. plan Task 1이 카탈로그만 적고 순서를 안 적었다. 흡수 방향은 **순서표가 아니라 다중매치=unknown**(아래) |
| F2 PATH 재도출 TOCTOU | CRITICAL | REJECT_EVIDENCE | 리뷰어 자신이 "DD6이 이미 천장으로 명시, 코드 변경 불필요"로 결론. plan `:298-305`가 막는 것/못 막는 것을 열거하고 검증을 결과 분포에 맡긴다고 적었다 |
| F3 양방향 불변식 — `pr_codex_force_override` 선례를 미러하면 `reason: null`이 실려 불변식이 깨진다 | HIGH | ACCEPT_NOW | 실재. plan Task 3은 문자열을 `santa_exit_reason` 미러(비어있지 않을 때만)로 지시했으나, 같은 파일의 force-override 블록이 반대 모양이라 복사 사고가 쉽다 |
| F4 `familyOf` 비문자열 입력 — `String(model)`이 `toString()`을 호출한다 | HIGH | ACCEPT_NOW | 실재. `cli.js:326`은 `--model`을 검사하지만 `familyOf`의 다른 입력원인 **투영된 `e.model`**(legacy 원장)은 그 검사를 안 거친다 |
| F5 verdict 사영 누수 회귀 test 필요 | MEDIUM | ALREADY_PLANNED | plan Task 6.3이 "DD2 사영 회귀"로 이미 요구한다(`review_verdict='divergent'` ∧ `santa_model_degraded=true` ∧ proof에 `degraded` 부재) |
| F6 Windows PATHEXT 처리 누락 | MEDIUM | ALREADY_PLANNED | plan Task 4가 "Windows는 `PATHEXT` 확장자를 함께 시도"로 이미 지시한다 |
| F7 CLI 플래그 대소문자 | MEDIUM | REJECT_YAGNI | 리뷰어 자신이 "보안 문제 아님, 검증은 정상 실패"로 자기 기각 |

- Deferred to backlog: 2 (F2 · F7) → `.claude/plans/codex-findings-backlog.md`
- Open Questions: 없음 (auto-CRITICAL 카탈로그 — secret 노출 · 데이터 손실 · 비가역
  마이그레이션 · auth 우회 · 외부 목적지 변경 · crypto 키 — 해당 0건)

#### F1 흡수 — 다중매치는 `unknown`이지 순서가 아니다

리뷰어의 처방은 "명시적 precedence 표"였다. **그것을 그대로 쓰지 않았다.** precedence는
`claude-gpt-bridge`에 *어떤 계열이든 하나를 준다* — 그리고 그 하나가 다른 리뷰어와 다르면
곧바로 이종 판정(`degraded=false`)을 산다. DD3이 세운 원칙은 "모르겠다가 승인을 사지
못하게 한다"이고, 두 카탈로그에 동시에 걸리는 문자열은 **모르는 것**이다.

그래서 `familyOf`는 매치된 계열 수를 세고 `!== 1`이면 `unknown`을 낸다. 0건도 unknown,
2건 이상도 unknown. 이것은 precedence보다 **엄격한 쪽**이고 DD3의 순서(unknown 우선)와
같은 방향이라 plan의 판정 2줄을 바꾸지 않는다.

#### F3 흡수 — 미러 대상을 `santa_exit_reason`으로 고정

`write.js`의 `pr_codex_force_override` 블록(`:779-785`)은 사유 부재 시 `null`을 **명시
저장**한다. 그 모양을 복사하면 `santa_degrade_ack=true` + `santa_degrade_ack_reason=null`이
나오고 plan Task 3이 요구한 양방향 불변식이 write 시점에 깨진다. plan이 지목한 미러는
`santa_exit_reason`(`:771-773` — 비어있지 않은 문자열일 때만)이고 그쪽을 따른다.

schema 쪽 불변식은 리뷰어가 제안한 truthiness 검사(`!m.santa_degrade_ack_reason`)를 쓰지
**않는다** — present-only 의미론에서 판정 기준은 진위값이 아니라 **키의 존재**다.
`undefined`/`null` 부재 검사로 양방향을 건다.

#### F4 흡수 — `typeof` 가드가 코어션보다 먼저

`familyOf`의 첫 줄이 `typeof model !== 'string'` → `unknown`이다. `String(model)`을 먼저
부르면 `{toString(){return 'gpt-5.4'}}` 같은 값이 계열을 살 수 있고, 그 입력은 `--model`
검사를 거치지 않는 경로 — `seal.project()`가 원장에서 읽어 넘기는 `e.model` — 로 도달
가능하다.

## Task 7 실측 — 게이트 경로 1회 완주 (2026-08-19)

**무엇을 돌렸나.** 실제 CLI 바이너리(`plugins/mccp/scripts/lib/santa/cli.js`)를 실제 git
repo(임시 probe)에서 `begin-round → record ×2 → verdict → seal → receipt`까지 돌리고, 봉인
결과를 `santa-loop.md` Step 5.5와 **같은 형태의 분기**에 먹였다. 대역인 것은 **리뷰어 기동
하나**다 — M3은 리뷰어 경로를 바꾸지 않으므로(리뷰어 수 무변경 · fallback 문구 외 Step 3
무변경) 그 대역이 관측 대상 어느 것도 가리지 않는다. 바꿔 말하면 M3이 손댄 코드는 **전부**
리뷰어 출력 하류에 있고, 그 하류가 여기서 실제로 돌았다.

### 1. Claude fallback 라운드 → `degraded` 봉인 + push 차단

```
seal.verdict       = "degraded"
seal.degraded      = true
seal.degradeReason = "same_family"
seal.degradeAck    = false
STEP5.5 -> BLOCKED (no push): verdict=degraded reason=same_family

receipt.review_verdict        = "divergent"
meta.santa_model_families     = 1
meta.santa_model_degraded     = true
meta.santa_degrade_reason     = "same_family"
proof.verification_verdict    = "divergent"
"degraded" appears anywhere   = false
```

리포트 행:

```
- models: A=opus(anthropic) B=opus(anthropic) · distinct=1 · degraded=true reason=same_family
```

**Acceptance의 최소 조건이 이 블록이다** — `verdict=degraded`로 봉인되어 push가 일어나지
않고, 그 receipt가 `review_verdict='divergent'`와 `meta.santa_model_degraded=true`를 **함께**
갖는다. 마지막 줄이 DD2 사영의 실측이다: `degraded`라는 토큰이 receipt 전문 어디에도 값으로
없다.

### 2. 같은 원장 + `MCCP_SANTA_DEGRADE_ACK` → push는 열리고 verdict는 그대로

```
seal.verdict    = "degraded"        ← 재작성되지 않았다
seal.degradeAck = true
STEP5.5 -> PUSH UNDER ACK: verdict=degraded reason=same_family (verdict NOT rewritten)

receipt.review_verdict         = "divergent"
meta.santa_model_degraded      = true          ← 여전히 참이다
meta.santa_degrade_ack         = true
meta.santa_degrade_ack_reason  = "codex is not installed on this probe host so rev…"
```

DD5가 주장한 것이 여기 있다: ack 아래에서도 degraded 사실이 계속 봉인되므로 상주 ack
환경에서 degraded **비율**이 측정 가능하게 남는다.

### 2b. (계획 외 추가) 부실한 사유는 ack를 세우지 못한다

`MCCP_SANTA_DEGRADE_ACK="no"` → `seal.degradeAck=false` → `STEP5.5 -> BLOCKED`. strict
`validateReason` 위임이 실제 경로에서 작동한다. 계획의 5건에는 없었으나, ack가 push 게이트를
여는 유일한 열쇠라 "아무 문자열이나 열쇠가 되는가"는 확인할 가치가 있었다.

### 3. 이종 라운드(`opus` + `gpt-5.4`) → `converged`

```
seal.verdict      = "converged"
seal.degraded     = false
seal.degradeReason= null
STEP5.5 -> PUSH: verdict=converged

meta.santa_model_families  = 2
meta.santa_model_degraded  = undefined     ← present-only: 키 자체가 없다
meta.santa_degrade_reason  = undefined
```

`- models: A=opus(anthropic) B=gpt-5.4(openai) · distinct=2 · degraded=false reason=(none)`

정상 경로가 막히지 않는다는 대조군이다. 그리고 degrade 필드 2종이 **부재**로 남는 것이
present-only 규약의 실측이다(값 `false`를 쓰지 않는다).

### 4. `MCCP_SANTA_DEGRADE_GATE=off` → verdict는 되돌아가되 관측은 남는다

```
seal.verdict      = "converged"     ← 강등이 꺼졌다
seal.degraded     = true            ← 관측은 그대로다
seal.degradeReason= "same_family"
STEP5.5 -> PUSH: verdict=converged

receipt.review_verdict     = "converged"
meta.santa_model_families  = 1
meta.santa_model_degraded  = true          ← off에서도 stamp된다
meta.santa_degrade_reason  = "same_family"
```

DD4가 요구한 정확한 조합이다. `off` 실행은 M3 이전 실행과 **구분된다** — 후자는 이 세 키가
아예 없다.

### 5. 미설치 CLI 계열 선언 → exit 2, 라운드는 열린 채

```
[mccp:santa-cli] SANTA_MODEL_UNAVAILABLE: reviewer B declared --model "gemini-2.5-pro"
  (family google) but "gemini" is not on PATH, so that model cannot have produced this
  review. The round stays open; re-record with the model you actually ran (…)
exit=2

round0.reviewers = 0 | round0.verdict = null      ← 원장에 아무것도 append되지 않았다
re-record --model opus → exit=0                   ← 같은 라운드에 정직한 값으로 재기록 성립
```

이 머신에는 `codex`가 설치돼 있고 `gemini`는 없어, **두 방향 모두** 실측 가능했다(3번이
`gpt-5.4`로 통과하는 것이 설치 쪽 대조군이다).

### 이 실측이 말하지 않는 것

- **리뷰어가 실제로 무엇을 받았는지**는 여기서도 관측되지 않는다. PATH 대조가 막는 것은
  *설치되지 않은 CLI를 참칭하는* 경로뿐이고, codex가 설치된 상태에서 Claude fallback을
  쓰고 `gpt-5.4`라고 적는 경로는 3번 블록과 **구분되지 않는다**. DD6이 명시한 천장이고
  M3은 이것을 주장하지 않는다.
- **포착률은 측정하지 않았다.** 이 probe가 증명하는 것은 강등 배선이지 degrade가 실제로
  놓친 결함과 상관하는지가 아니다. 그 축은 PRD 지표 5(두 레인 동시 미포착 비율)이고 P1
  종료 후 산출이다.
