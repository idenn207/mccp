# 리뷰 · 승인 · 디자인 critique

> `docs/ENVIRONMENT.md`의 **review** 도메인 상세. 색인은 값과 기본값만 싣고 서사는 여기 있다.

plan 승인 패널(L1/L2/L3), santa-loop, 단일통과, intent 게이트, design critique 루프를 지배한다. 여기서 켜고 끄는 것은 «몇 번 볼 것인가»이지 «볼 것인가»가 아니다.

## 읽는 법

각 토글은 자기 이름의 앵커를 갖고, 그 아래에 값·기본값·소비처·사용 예시가 온다. `값` 열의 어휘는 **문서가 가르치는 표기**이고, 파서가 실제로 받아 주는 별칭 집합은 그보다 넓다 — 정확한 집합은 색인의 «값 규약»에 있다.

**사용 예시**는 전부 `.claude/settings.json`의 `env` 블록에 그대로 붙여 넣을 수 있는 형태다. 1회성으로만 쓰는 토글은 셸 예시를 함께 둔다.

## 토글

### MCCP_PLAN_REVIEW

**종류** `enum` — **값** `off` · `multi-agent` · `codex` · `hybrid` — **기본값** `multi-agent`

**한 줄** plan 승인 리뷰 소스.

**소비처** `plugins/mccp/scripts/lib/plan-review/decide.js:50`

**사용 예시**

```json
{
  "env": {
    "MCCP_PLAN_REVIEW": "off"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_PLAN_REVIEW=codex|multi-agent|hybrid  # v1.23.1 M1 default: **multi-agent**(미설정 시). `/mccp:plan` Phase 5 게이트의 승인을 누가 발급하는지 선택. `codex`=v1.23.0 경로 정확 복원(Phase 5.2z, `review_*` 필드 미생성) · `multi-agent`=L1(mechanical) + L2(4관점 refute 패널) · `hybrid`=L1+L2+L3(Codex). **미상·오타 → `codex` + loud warn**(DD7) — 이 축의 실패 모드는 "검증이 꺼짐"이 아니라 "**승인 발급자 오인**"이라, 안전한 착지가 `parseMergedVerifyMode`처럼 "가장 엄격한 신규 모드"가 아니라 "**이미 검증된 기존 경로**"다(두 파서의 fallback 방향이 반대인 것은 의도적). multi-agent 승인은 cross-gate dedupe를 **구조적으로 만족하지 못하므로**(DD2 — skip 술어가 `source ∈ {codex,hybrid}` 요구) terminal `/mccp:pr`에서 PR-Codex가 반드시 발화한다: cross-model은 제거된 게 아니라 반복 지점(plan)에서 ship 지점으로 **이동**했다. receipt에 present-only `resolution.review_verdict`/`review_source`/`review_proof` + `meta.review_l3_invoked`/`review_l3_reason`/`review_wall_clock_ms` stamp(전부 `receipt_hash` 봉인 대상 — carve-out 없음, DD6).
```

### MCCP_PLAN_REVIEW_L3

**종류** `bool` — **값** `on` · `off` — **기본값** `off`

**한 줄** hybrid에서 L3 요구.

**소비처** `plugins/mccp/scripts/lib/plan-review/decide.js:51`

**극성** 미설정이면 **꺼져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_PLAN_REVIEW_L3": "on"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_PLAN_REVIEW_L3=0|1                    # v1.23.1 M1 default: 0. `hybrid` 모드에서 L3(Codex) 발화 여부의 kill switch. mode와 별 축인 이유는 Codex 사용량 소진 시 mode를 건드리지 않고 L3만 끌 수 있어야 하기 때문. `mode=hybrid ∧ L3 미발화`는 `hybrid`가 **아니므로** verdict `unavailable`(HALT) + source는 정직하게 `multi-agent`이며 `codex_verdict`를 forward하지 않는다 — "요청했다"와 "일어났다"를 구분하지 않으면 dedupe가 없는 cross-model 확증을 인정한다.
```

### MCCP_PLAN_REVIEW_BUDGET

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 리뷰어 1인 최소 예산.

**소비처** `plugins/mccp/scripts/lib/plan-review/budget.js:26`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_PLAN_REVIEW_BUDGET": "1"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_PLAN_REVIEW_BUDGET=150000             # v1.23.8 M4 default: 150000. L2 패널 리뷰어 1명당 최소 예상 토큰. `cli.js emit-workflow-args`가 **`--granted`로 fleet을 상한한 뒤** `minRemaining = 이 값 × fleet.length`를 payload에 emit하고, `workflows/plan-review.js`가 Workflow `budget.total` 설정 시(사용자 `+Nk` 지시) `budget.remaining() < minRemaining`이면 패널을 발화하지 않는다. M1에서는 payload에 키 자체가 없어 값이 항상 0이었고 그 조건은 **구조적으로 도달 불가**였다(게이트가 실행될 수 없는 소스로 존재). `plan-fanout/budget.js#parseFanoutMinPerAgent` 미러 — 0·음수·비수치·미상 → **default + loud warn**이며 **절대 0으로 가지 않는다**(0은 게이트를 완화하는 게 아니라 꺼버린다). 빈 값은 "미설정"이라 warn 없이 default. `budget.total` 미설정(비계량 턴)이면 어떤 값이든 무발화 — 그것이 M1 이전 동작이고 test로 고정돼 있다.
```

### MCCP_PLAN_REVIEW_QUORUM

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 수렴에 필요한 승인 수.

**소비처** `plugins/mccp/scripts/lib/plan-review/quorum.js:22`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_PLAN_REVIEW_QUORUM": "1"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_PLAN_REVIEW_QUORUM="3of4"             # v1.23.1 M1 default: `3of4`. L2 통과 임계 `<M>of<N>` — M=필요 응답 수(**≥2 강제**: 1은 패널의 어휘를 쓴 단일 심판일 뿐) · N=발화 관점 수(≤4, fleet 상한). 오타·불만족(of<required)·상한 초과 → default + loud warn.
```

### MCCP_PLAN_REVIEW_ROLES_MIN

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 최소 역할 수.

**소비처** `plugins/mccp/scripts/lib/plan-review/quorum.js:23`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_PLAN_REVIEW_ROLES_MIN": "1"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_PLAN_REVIEW_ROLES_MIN=3               # v1.23.1 M1 default: 3. 통과에 필요한 **고유 역할** 수 K. quorum의 M과 **다른 축**이다 — M은 "몇 개가 응답했나", K는 "서로 다른 렌즈가 몇 개였나". 같은 역할이 중복 응답해 M을 채우는 것을 막는 것이 K의 유일한 목적이므로 별 토글로 유지한다(중복 응답은 M에는 계수되고 K에는 계수되지 않는다). 범위 밖·비정수 → default + warn.
```

### MCCP_REVIEW_SINGLE_PASS

**종류** `enum` — **값** `scope_too_small` · `deadline_pressure` · `deferred_to_prd_completion` — **기본값** 없음 (미설정이 기본)

**한 줄** 리뷰 단일통과 + 사유.

**소비처** `plugins/mccp/scripts/lib/review-single-pass.js:21`

**사용 예시**

```json
{
  "env": {
    "MCCP_REVIEW_SINGLE_PASS": "scope_too_small"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_GATE_ROUND_CAP=1|2|3                # v0.2.9 default: 1. R2/R3은 ACCEPT_NOW × {HIGH, CRITICAL} 미해소 시에만 trigger. DEFER_TO_BACKLOG 항목은 .claude/plans/codex-findings-backlog.md에 1줄 append. plan.md/prp-implement.md/pr.md 3 게이트 모두 honor. **v1.28.1부터 이 값은 MCCP_REVIEW_SINGLE_PASS에 종속된다** — 토글이 유효한 사유를 담고 있으면 여기 무엇을 적든 유효 캡은 1이다(effectiveRoundCap이 pinned:true로 반환하고 stderr에 사유를 남긴다). 토글이 상위 정책 선언이고 이 캡은 그 아래 조정값이라는 것이 근거다. 세 게이트는 리터럴이 아니라 그 오라클(plugins/mccp/scripts/lib/review-single-pass.js)에서 읽으며, 그 배선은 review-single-pass-command-body.test.js가 정적으로 단언한다. 불량값(0·4·비정수)은 loud warn 후 1로 fail-open — 오타가 라운드를 무한히 열지 못하게.
  MCCP_REVIEW_SINGLE_PASS=scope_too_small|deadline_pressure|deferred_to_prd_completion  # v1.28.1 review-loop-bypass M1. default: 미설정(비활성). 작업 단위 opt-in으로 **리뷰 루프의 반복을 없앤다 — 리뷰 자체를 없애지 않는다.** 켜지면 셋이 동시에 일어난다: (1) `/mccp:plan`의 L2 승인 패널이 1회만 발화하고 quorum 비수렴이 진행을 **차단하지 않으며**, (2) 세 게이트의 Codex 라운드 캡이 MCCP_GATE_ROUND_CAP과 무관하게 1로 고정되고, (3) `/mccp:santa-loop`의 `begin-round`가 라운드를 열지 않는다(exit 2 + `SANTA_SINGLE_PASS_ACTIVE`, 원장 미변경이라 캡 미소모, receipt 미작성). **사유가 값 자체인 것이 설계다** — 별도 사유 변수를 두면 잊을 수 있고 잊힌 사유는 감사 불가라, 토글을 켜는 행위와 사유를 대는 행위를 같은 동작으로 묶었다. 열거 밖 값(대소문자 불일치 포함 — 비교는 case-sensitive다. 값이 receipt에 그대로 봉인되므로 정규화하면 서로 다른 입력이 같은 감사 필드를 채운다)은 **fail-closed**: 토글을 꺼진 것으로 보고 loud warn을 낸다. **완화되는 경로는 정확히 하나**다 — L1(mechanical) 실패·L2 아티팩트 부재/판독 불가·`responded=0`·budget skip·DD13 plan hash 불일치·hybrid인데 L3 미수렴은 토글이 켜져 있어도 전부 HALT한다(`divergent`=보고 결함을 찾았다 / `unavailable`=인증할 수 없었다의 구분이며, 후자를 통과시키는 것은 단일 통과가 아니라 무통과다). receipt는 **미작성도 미승인도 아니라 사유가 봉인된 기록**으로 남는다: `resolution.review_verdict`는 실제 `divergent` 그대로 봉인되고(converged로 위장하지 않으므로 대시보드·evidence-audit·ship gate가 전부 정직하게 비승인으로 읽는다) present-only `meta.review_single_pass_reason`(env ambient + 명시 우선)과 `meta.review_single_pass_bypassed_verdict`(명시 전용, 실제 강등이 일어났음의 감사 축)가 함께 실린다 — 두 필드를 섞지 말 것(§3.12의 codex_disabled 대 codex_disabled_at_pr과 같은 구분). **주장하지 않는 것**: 라운드 루프는 plan/prp-implement에서 여전히 LLM이 읽는 산문이라 배선 누락만 기계로 막히고(정적 test), L2 비용은 1회분 그대로 발생하며, 미흡수 지적의 backlog 자동 회수는 M2 소유다(지적은 l2.json과 .claude/reviews/plan-review-<slug>.md에 그대로 남지만 자동 이동하지 않는다).
```

### MCCP_SANTA_ROUND_CAP

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** santa 라운드 상한.

**소비처** `plugins/mccp/scripts/lib/santa/counter.js:13`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_SANTA_ROUND_CAP": "1"
  }
}
```

### MCCP_SANTA_SEVERITY_GATE

**종류** `enum` — **값** `off` · `high` · `critical` — **기본값** 없음 (미설정이 기본)

**한 줄** santa 차단 최소 severity.

**소비처** `plugins/mccp/scripts/lib/santa/gate.js:81`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_SANTA_SEVERITY_GATE": "off"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_SANTA_SEVERITY_GATE=enforce|off     # v1.26.1 santa-adjudication M1. default: enforce. /mccp:santa-loop 라운드 판정에서 **완화 한 축만** 토글한다 — 완화란 "리뷰어의 verdict 문자열을 무시하고 병합·중복제거된 blocking 건수만 본다"이고, 그 자격은 severityGate='enforce' ∧ contract='full'일 때만 성립한다. **끄지 못하는 축이 둘 있다**: blocking 게이트(blocking.length === 0)와 {A,B} 완전성(distinct reviewer id ≥ 2)은 어느 값에서도 적용된다. 판정 순서는 세 항(noBlocking · bothIds · allPass)을 전부 불리언으로 만든 뒤 AND이며, 완화는 allPass 한 항의 면제일 뿐 다른 항을 덮어쓰지 않는다. **비대칭 주의 — `off`가 `enforce`보다 엄격하다**: `off`의 NICE 조건은 `enforce`의 조건에 allPass가 더 붙은 것이므로 포함 관계가 성립한다. 그럼에도 불량값(대소문자 불일치 포함 — 열거 비교는 case-sensitive)을 loud stderr warn 후 `enforce`로 fail-open하는 이유는 셋이다: (1) 이 축으로 도달 가능한 가장 느슨한 상태조차 강화 축 둘이 켜져 있어 M1 이전보다 엄격하고, (2) `off`를 default로 삼으면 오타가 kill switch를 켜며, (3) 같은 모듈군의 MCCP_SANTA_ROUND_CAP(counter.parseCap)과 실패 규약을 일치시킨다. blocking 자격은 severity ∈ {CRITICAL, HIGH} ∧ failure_scenario 실질(receipt/lib/force-override-reason#validateReason strict + allowCodeVocabulary — ≥30·≥3단어·1-token 금칙·filler 거부)이고, **길이 하한의 단위는 문자 수가 아니라 표시폭**이다 — 검증기의 30은 영어 override 사유용으로 보정된 문자 수라 같은 정보량을 한글·CJK로 쓰면 하한 아래로 떨어져 구체적 시나리오가 조용히 강등됐고(fail-open), 그래서 gate.js가 전각 코드포인트를 2로 세어 같은 검증기에 먹인다. 길이 축 하나만 스크립트 중립이 되고 단어 수·금칙·filler 규칙은 원본 그대로이며, 순수 ASCII 입력에는 항등이라 영어 경로의 판정은 무변경이다. MEDIUM/LOW와 강등된 항목은 사라지지 않고 gitignored 원장의 envelope.findings에 남아 `cli.js verdict`의 stdout JSON(`contract`·`blocking`·`mismatches`)으로 표면화된다. contract가 계속 `partial`이면 처방은 임계 완화가 아니라 리뷰어 프롬프트 재작성이다.
```

### MCCP_SANTA_TERMINATOR

**종류** `enum` — **값** `off` · `on` — **기본값** 없음 (미설정이 기본)

**한 줄** santa 종료 판정기.

**소비처** `plugins/mccp/scripts/lib/santa/terminator.js:18`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_SANTA_TERMINATOR": "off"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_SANTA_ROUND_CAP=1..10               # v1.23.8 santa-loop-materialize M1. default: 3. /mccp:santa-loop의 adversarial 라운드 상한. 이전에는 santa-loop.md 산문("Maximum 3 iterations")이 유일한 근거였고 코드가 세지 않았다 — 이제 plugins/mccp/scripts/lib/santa/cli.js `begin-round`가 **리뷰어 발화 직전**에 판정해 캡 도달 시 exit 12로 거부한다(라운드가 열리는 시점이 리뷰어를 띄우는 순간이므로 거부가 토큰 소진보다 앞선다). 라운드 수는 gitignored 원장 `.claude/state/santa-loop/<decision-slug>.json`이 소유하고, MCCP_GATE_ROUND_CAP(plan/implement/pr 게이트의 Codex 라운드 상한)과는 **별개 축**이다 — 서로 영향 없음. 허용 범위 밖(0·11·비정수·비수치)은 loud stderr warn 후 default 3으로 fail-open. **0은 허용하지 않는다**: 리뷰 없이 통과하는 조용한 kill switch가 되어 게이트가 있다는 사실 자체가 거짓이 되기 때문. 캡의 단위는 decision slug(브랜치명 파생)라 브랜치 rename/switch는 캡을 새로 시작하고(다른 브랜치 = 다른 리뷰 스코프), 고정이 필요하면 전 subcommand의 `--decision <slug>`로 스코프를 핀한다(rebase·commit·force-push는 브랜치 *이름*을 안 바꾸므로 영향 없음). 강제 등급의 정직한 천장: 캡은 **인덱스 경계**에서 구속된다 — `record`·`verdict`가 `begin-round`가 연 적 없는 인덱스를 거부(exit 2)하므로 거부를 무시하고 리뷰어를 띄워도 그 인덱스로는 원장에 못 들어가고 verdict도 안 나온다. 막지 못하는 것 둘: (1) **리뷰어 토큰이 실제로 소모되는 것**(리뷰어 기동은 LLM 행위라 셸로 추출할 대상이 없음), (2) **마지막 FINAL 인덱스 재사용** — `record --round <cap-1>`은 통과한다(`record`를 OPEN 라운드로 한정하는 규칙은 판정 lifecycle이라 P1 소유). exit code: 0 정상 · 12 캡 도달 · 75 원장 lock 경합(재시도) · 2 그 외. **v1.28.0 santa-adjudication M3 — 캡은 이제 2차 조건이다**: 1차 종료 조건은 `MCCP_SANTA_TERMINATOR`(patch-chasing terminator)이고 캡은 그것이 실패했을 때의 안전망이다. 두 축은 배타다 — `decideTermination`의 `capAllowsAnotherRound` 항이 캡이 이미 끝낼 run에서는 terminator를 미발화시키므로 한 루프의 `exit_reason`은 `cap_reached`와 `patch_chasing` 중 하나만 갖는다(부재는 자연 수렴). 따라서 "자연 종료 비율"은 `cap_reached` 대 나머지로 읽는다. **PRD 문언의 `MCCP_SANTA_MAX_ROUNDS`(1~5)는 폐기됐다** — 이름·범위 모두 본 항목이 정본이다(M3 DD8, 근거는 `.claude/prds/santa-adjudication.prd.md` Open Questions): 이름을 바꾸면 기존 `settings.json`이 조용히 무시된 채 default 3으로 fail-open하고 그 사고는 로그에 아무것도 남기지 않으며, 범위를 1~5로 좁히면 6~10을 쓰던 설정이 캡이 **낮아지는** 방향으로 무효화돼 진행 중인 루프가 즉시 종료된다.
```

### MCCP_SANTA_ADJUDICATION_GATE

**종류** `enum` — **값** `off` · `warn` · `enforce` — **기본값** 없음 (미설정이 기본)

**한 줄** santa 심판 게이트 모드.

**소비처** `plugins/mccp/scripts/lib/santa/adjudication.js:40`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_SANTA_ADJUDICATION_GATE": "off"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_SANTA_ADJUDICATION_GATE=enforce|off # v1.27.1 santa-adjudication M2. default: enforce. /mccp:santa-loop의 **begin-round coverage 선검사 하나**를 토글한다 — 마지막 FINAL 라운드 N의 effective blocking 전건에 `round === N`인 판정 행(`entries`)이 있어야 다음 라운드가 열리고, 없으면 `SANTA_ADJUDICATION_INCOMPLETE`로 exit 2다. 검사는 `ledger.beginRound` **이전**이라 거부 시 **캡이 소모되지 않는다**(라운드가 열리지 않으므로). 불량값은 loud stderr warn 후 `enforce` — 여기서는 default가 엄격한 쪽이라 MCCP_SANTA_SEVERITY_GATE가 감수한 비대칭이 없다. `off`의 방향은 **덜 엄격**이고, 그 구간은 귀납의 예외로 남는다: 검사는 마지막 FINAL 라운드만 보므로(그 이전은 자기 후속 라운드가 열릴 때 이미 통과했다) `off`로 건너뛴 라운드는 나중에 재검사되지 않는다. 전 라운드를 매번 재검사하지 않는 이유는 그러면 한 번의 audited skip이 그 slug의 루프를 **영구히** 막기 때문이다. 끄기 전에 볼 것: 탈출구는 env가 아니라 원장 안에도 있다 — `adjudicate --disposition skipped`는 같은 writer·같은 검증을 지나면서 "이 지적은 판정되지 않았다"를 기록으로 남기고 라운드를 열어 주되, suppress하지 않으므로 그 지적은 다음 라운드에도 계속 blocking이다(회피가 공짜가 아니다). stderr는 빠진 issue_id와 claim 앞부분을 **전부 열거**하므로 판정 비용이 원장 JSON을 손으로 읽는 것보다 낮다.
  MCCP_SANTA_TERMINATOR=enforce|off        # v1.28.0 santa-adjudication M3. default: enforce. **patch-chasing terminator 하나**를 토글한다 — 라운드 2 이후(0-based index ≥ 1) 살아남은 effective blocking이 **전부** 직전 라운드의 수정을 겨누면 루프를 종료하고 `state.terminated`에 `{reason:'patch_chasing'}`을 결속 기록한다. 대상 판정은 리뷰어의 자기 선언이 아니라 집계 단계가 finding의 `locations`(선택 필드)를 `git show --unified=0 <prev-fix-rev>`의 hunk 범위와 대조해 기계적으로 내리며, 대조할 수 없는 항목은 전부 `unknown` → 미발화 쪽으로 떨어진다. 발화 조건은 AND 5항(`mode=='enforce'` · `round >= minRound` · effective blocking 1건 이상 · 전량 `round_n_patch` · `capAllowsAnotherRound`)이고 그중 첫 항이 이 kill switch, 마지막 항이 캡과의 배타를 만든다(위 MCCP_SANTA_ROUND_CAP 참조). **`off`는 두 배선 지점을 함께 끈다** — `check-termination`은 `{terminate:false, reason:'env-off'}`를 내고 **마커를 쓰지 않으며**, `begin-round`는 이미 결속된 마커를 지나 라운드를 열고 그 마커를 지운다(재개 경로). 즉 `off`는 판정을 사후에 뒤집는 것이 아니라 경로에 진입하지 않는 것이고, 이미 종료된 루프를 되살리는 유일한 수단이기도 하다. 불량값은 loud stderr warn 후 `enforce` — 여기서는 default가 **덜 엄격**한 쪽이라는 점이 MCCP_SANTA_SEVERITY_GATE·MCCP_SANTA_ADJUDICATION_GATE와 다르다: `off`가 라운드를 더 돌리므로 리뷰는 더 받는다. 그럼에도 `enforce`를 default로 두는 이유는 M3이 닫으려는 결함이 "루프가 끝나지 않는다"이고 오타가 그 결함을 되살리면 안 되기 때문이며, 오발화의 대가는 승인이 아니라 **한 라운드 이른 종료 + 미해결 항목 열거**다(santa verdict는 게이트 승인이 아니다 — PRD UI3). **알려진 한계**: `locations`에 `line`이 없으면 파일 단위 일치만으로 `round_n_patch`가 되므로, 직전 패치가 손댄 파일의 선재 결함이 오분류될 수 있다(M3 DD11이 명시적으로 수용한 trade-off — 라인을 요구하면 대부분이 `unknown`이 되어 terminator가 사실상 죽는다). 남는 방어는 전량 조건 · 미해결 항목의 터미널 출력 · `off` 재개 셋이다.
```

### MCCP_SANTA_LEDGER_SUPPRESSION

**종류** `enum` — **값** `off` · `on` — **기본값** 없음 (미설정이 기본)

**한 줄** santa 원장 억제.

**소비처** `plugins/mccp/scripts/lib/santa/adjudication.js:41`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_SANTA_LEDGER_SUPPRESSION": "off"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_SANTA_LEDGER_SUPPRESSION=enforce|off # v1.27.1 santa-adjudication M2. default: enforce. **종결된 항목의 blocking 면제 하나**를 토글한다 — 라운드 `< N`에서 `absorbed`/`rejected`로 종결된 issue가 라운드 N에 **같은 id로** 재등장하면 `blocking`에서 빠져 `suppressed[]`로 옮겨진다(`skipped`·`reopened`는 종결이 아니라 면제하지 않는다). `off`의 방향은 **더 엄격**(M1 등가)이고, 불량값이 `enforce`로 떨어지는 것은 완화 쪽이지만 그 완화의 대상이 M1 동작 자체라 위 SEVERITY_GATE의 3항 근거가 필요 없다. **의미 주의**: `off`는 "사후에 suppression을 되돌린다"가 아니라 **"suppression 경로를 아예 타지 않는다"**이다 — `cmdVerdict`가 `resolved`를 넘기지 않으므로 판정은 M1과 같은 계산을 하고 반환의 `blocking`은 raw와 effective가 같은 배열이 된다. 이 축은 **대조군 도구**이기도 하다: 같은 원장에 대해 켠 판정과 끈 판정을 비교하면 M2의 효과가 한 라운드 안에서 관측된다(PRD가 미결로 남긴 "대조군 측정을 별도 축으로 세울지"가 요구하는 것이 정확히 이 스위치다). 축을 SANTA_ADJUDICATION_GATE와 합치지 않는 이유: 둘은 서로 다른 실패에 대응한다 — 전자는 "판정을 강요당하는 것이 지금 곤란하다"이고 후자는 "이 원장의 판정을 믿지 못하겠다"라, 하나로 묶으면 앞을 끄려는 운영자가 뒤까지 끄게 된다.
```

### MCCP_SANTA_BLIND_LANE

**종류** `enum` — **값** `a` · `b` · `off` — **기본값** `a`

**한 줄** santa 증거 레인 배정.

**소비처** `plugins/mccp/scripts/lib/santa/lanes.js:26`

**상태** `active` — v1.28.2 santa-evidence-diversity M1에서 도입.

**사용 예시**

```json
{
  "env": {
    "MCCP_SANTA_BLIND_LANE": "off"
  }
}
```

**서사** `a`는 Reviewer A가 블라인드(B는 번들), `b`는 그 반대, `off`는 전원 번들(M1 이전 동작)이다. 블라인드 레인은 파일 번들과 사전 요약을 **받지 않고** 저장소 루트 + 대상 경로 포인터 + "주어진 서술을 사실로 취급하지 말 것" 지시만 받는다. 리뷰어 컨텍스트가 전부 오케스트레이터 한 곳에서 나오면 인스턴스를 몇을 띄우든 라운드를 몇을 돌든 그 번들 밖의 사실이 구조적으로 발견 불가능하기 때문이다(#125 실측). **`both`(전원 블라인드)는 없다** — 오케스트레이터가 스코프를 정하는 의미가 사라진다. 불량값은 loud stderr warn 후 `a`로 fail-open. **비대칭 주의 — `off`가 덜 엄격하다**: 그럼에도 default를 발화 쪽에 두는 이유는 `off`가 default면 오타 하나가 kill switch를 켜고 **그 실행이 M1 이전과 똑같아 보이기** 때문이다. **천장** — `--lane`은 선언이지 관측이 아니다: 대조가 막는 것은 커맨드 본문이 oracle을 우회하는 경로이고, 블라인드로 선언된 리뷰어의 프롬프트에 실제로 번들이 없었는지는 막지 못한다. 커버리지는 receipt `meta.santa_blind_records` · `meta.santa_blind_rounds`로 봉인된다.

### MCCP_SANTA_ALWAYS_SCOPE

**종류** `enum` — **값** `enforce` · `off` — **기본값** `enforce`

**한 줄** santa 상시 스코프 + 정합 rubric.

**소비처** `plugins/mccp/scripts/lib/santa/scope-always.js:27`

**상태** `active` — v1.29.2 santa-evidence-diversity M2에서 도입.

**사용 예시**

```json
{
  "env": {
    "MCCP_SANTA_ALWAYS_SCOPE": "off"
  }
}
```

**서사** `enforce`면 Step 1이 "현재 decision의 plan + 그 plan이 `**Source PRD**:`로 스스로 선언한 PRD"를 diff 여부와 무관하게 스코프에 합치고, 고정 rubric 1행이 그 쌍을 **지금 워킹트리 기준으로** 대조하라고 지시한다. 두 문서의 *관계*인 불변식은 PRD가 diff에 없으면 리뷰어가 몇 명이든 구조적으로 검증 불가이기 때문이다(#125 실측). **스코프는 코퍼스가 아니라 폐포다**(M2 DD1) — 글롭을 문자 그대로 취하면 이 저장소에서 7 MB이고 그것은 "더 많이 보게 했더니 아무것도 못 보게 됐다"가 되므로 비재귀 + `archived/` 제외로 좁혔다(실측 약 70 KB). `MAX_ALWAYS_PATHS`(40)가 상한이고 절삭은 `truncated` 수로 표면화된다. **`off`는 스코프 추가와 rubric 행을 함께 끈다**(DD5) — PRD가 스코프에 없는데 대조하라고만 지시하면 근거를 댈 수 없는 FAIL을 유도하는 소음이 된다. 불량값은 loud warn 후 `enforce`. **관측의 한계**(DD7): 라운드 형태가 P0 동결 시그니처라 receipt는 이 축을 봉인하지 않는다 — 표면은 Step 1의 stderr · 블라인드 프롬프트 본문 · 회귀 test 셋뿐이다.

### MCCP_SANTA_DEGRADE_GATE

**종류** `enum` — **값** `enforce` · `off` — **기본값** `enforce`

**한 줄** santa 모델 계열 degrade 강등.

**소비처** `plugins/mccp/scripts/lib/santa/model-diversity.js:28`

**상태** `active` — v1.30.0 santa-evidence-diversity M3에서 도입.

**사용 예시**

```json
{
  "env": {
    "MCCP_SANTA_DEGRADE_GATE": "off"
  }
}
```

**서사** `enforce`면 `seal.deriveVerdict`가 FINAL 라운드 리뷰어들의 `model` 문자열을 `model-diversity.js#familyOf`로 계열 분류해, distinct 계열이 2 미만이거나 `unknown`이 하나라도 섞이면 `converged`를 **`degraded`로 좁힌다**. `codex`도 `gemini`도 없는 머신에서 Reviewer B가 두 번째 Claude Opus로 떨어지는데 그 조합의 NICE가 이종 조합의 NICE와 어느 표면에서도 구분되지 않았기 때문이다. **강등은 봉인 층에서만 한다** — 라운드 판정(`gate.decideVerdict`)은 P0 동결 시그니처이고 봉인 verdict는 이미 push를 막는 자리다. 우선순위는 `divergent` > `degraded` > `converged`이고 degraded는 converged를 **좁히는 것**이지 divergent를 완화하는 것이 아니다. **`familyOf`는 다중매치도 unknown이다** — precedence로 하나를 주면 그 하나가 상대와 달라 곧바로 이종 판정을 사므로, 매치된 계열이 정확히 1이 아니면 unknown으로 접는다. 불량값은 loud warn 후 `enforce`. **`off`는 verdict 강등만 끄고 관측은 끄지 않는다** — `meta.santa_model_families` · `meta.santa_model_degraded`는 `off`에서도 stamp된다(키 부재는 "모름", 값은 "관측했다"라 서로 다른 상태이고, 관측이 원장의 기존 문자열에서 파생되므로 끌 비용 자체가 없다). 봉인되는 사유는 `same_family` · `unknown_model` 2값뿐이다.

### MCCP_SANTA_DEGRADE_ACK

**종류** `string` — **값** 자유 문자열(strict 사유 검증) — **기본값** 없음 (미설정이 기본)

**한 줄** santa degrade audited override 사유.

**소비처** `plugins/mccp/scripts/lib/santa/model-diversity.js:33`

**상태** `active` — v1.30.0 santa-evidence-diversity M3 audited override. **default 없음** — 부재가 곧 "승인 없음"이고 그것이 안전한 쪽이다.

**사용 예시**

```json
{
  "env": {
    "MCCP_SANTA_DEGRADE_ACK": "codex 미설치 머신이라 Reviewer B가 동일 계열로 떨어진다. 교차 검증은 PR 단계 Codex 게이트가 맡는다."
  }
}
```

**서사** 봉인된 verdict가 `degraded`일 때 `/mccp:santa-loop` Step 5.5의 push 차단을 여는 유일한 수단이다. 사유는 strict `validateReason`(`receipt/lib/force-override-reason`)에 **위임**한다 — 30자 이상 · 3단어 이상 · 1-token 금칙 · filler 거부이고 `allowCodeVocabulary`는 넘기지 않는다(CLAUDE.md §3.13.1이 override 표면을 면제에서 제외한다). **verdict를 재작성하지 않는다** — 봉인은 `degraded` 그대로이고 receipt에는 `review_verdict='divergent'`(어휘 사영) + `meta.santa_model_degraded=true` + `meta.santa_degrade_ack=true` + `meta.santa_degrade_ack_reason`이 함께 남는다. 이것이 없으면 축이 장식이 된다: codex 미설치 머신에서는 모든 실행이 degraded라 ack가 상주하게 되는데, ack가 verdict를 바꾸면 그 순간부터 degraded 실행 수가 영구히 0이 되어 지표가 측정 대상을 잃는다. **ack와 사유는 receipt에서 양방향으로 결속된다** — `schema.js`가 둘 중 하나만 있는 receipt를 거부한다. 효력을 발휘하지 않은 ack는 stamp되지 않는다(플래그는 *설정 여부*가 아니라 *효력 발휘 여부*를 뜻한다).

### MCCP_INTENT_MISLABEL

**종류** `enum` — **값** `enforce` · `warn` · `off` — **기본값** `enforce`

**한 줄** 오심 대조 모드.

**소비처** `plugins/mccp/scripts/lib/intent-context.js:878`

**사용 예시**

```json
{
  "env": {
    "MCCP_INTENT_MISLABEL": "warn"
  }
}
```

### MCCP_SKIP_INTENT_GATE

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** intent 게이트 override.

**소비처** `plugins/mccp/scripts/lib/intent-context.js:868`

**사용 예시**

```json
{
  "env": {
    "MCCP_SKIP_INTENT_GATE": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
MCCP_SKIP_INTENT_GATE=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_INTENT_MISLABEL=enforce|warn|off      # v1.23.9 M1.5 default: **enforce**(2026-08-13 실측 — 아래). 오심 탐지 축(§3.13.1)의 효력을 정한다. `enforce` = `inconclusive`(리뷰어가 `INTENT:` 계약 불응) / `mislabel_unresolved`(리뷰어가 지목한 id를 저자가 지목 안 했고 응답도 없음)에서 **receipt 미작성** → `/mccp:prp-implement` 진입 불가. `warn` = receipt가 **blocking verdict를 봉인한 채** 작성되고 chain은 통과하되 `isIntentApproved`는 false 유지 → cross-gate dedupe가 닫힌 채라 PR-Codex가 실제로 발화한다(warn이 공짜가 아닌 지점). `off` = 판정 억제가 아니라 **경로 미진입** — 계약 문단을 리뷰어 프롬프트에 붙이지 않고(따라서 focus가 v1.23.4와 byte-identical) claims를 파싱조차 하지 않아 M1과 end-to-end 등가다. 오타·미설정 → default + loud stderr warn. **default가 `enforce`인 것은 실측 결과다** — Task 0이 production 경로로 10회 측정해 finding 50건 전부 유효 주장, 리뷰 단위 `full` 도달률 **100%**를 얻었고(2026-08-13), 사전 선언된 규칙 ≥95%가 이 값을 정했다. 근거·한계·재현법은 `docs/codex-intent-context/reviewer-contract-compliance.md`. 측정 표본은 **단일 fixture 10회 반복**이라 실제 plan에서 계약 준수가 떨어지면 liveness 비용이 `enforce`에서 곧바로 나타난다 — 그때의 복구는 이 토글을 `warn`으로 두고 실제 plan으로 재측정하는 것이지 임계를 사후에 낮추는 것이 아니다. `warn`에서는 **UI10이 달성되지 않는다**. `MCCP_SKIP_INTENT_GATE`와의 관계는 순서가 정한다: mode가 먼저 판정하고 여전히 blocking일 때만 override가 적용되므로, warn이 통과시킨 경우 `intent_gate_force_override`는 `false`로 봉인된다(적용되지 않은 override를 참으로 기록하지 않는다).
```

### MCCP_INTENT_ADJUDICATION_TIMEOUT_MS

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 판정 대기 상한.

**소비처** `plugins/mccp/scripts/lib/plan-codex-runner.js:471`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_INTENT_ADJUDICATION_TIMEOUT_MS": "1"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_INTENT_ADJUDICATION_TIMEOUT_MS=1800000 # v1.23.1 default: 1800000(30분). plan-codex-runner가 adjudication 파일을 기다리는 bounded 상한. 초과 시 `incomplete`로 종료하고 receipt를 쓰지 않는다(무한 대기 금지). runner는 대기 중 lease lock에 heartbeat를 찍어 동시 runner가 자신을 live로 인식하게 한다.
```

### MCCP_INTENT_ARBITER

**종류** `enum` — **값** `subagent` · `author` — **기본값** `subagent`

**한 줄** 판정 주체(심판 분리).

**소비처** `plugins/mccp/scripts/lib/intent-arbiter.js:116`

**사용 예시**

```json
{
  "env": {
    "MCCP_INTENT_ARBITER": "author"
  }
}
```

### MCCP_DESIGN_CRITIQUE_MAX_RETRY

**종류** `int` — **값** 자유 문자열 — **기본값** `2`

**한 줄** critique 재시도 상한.

**소비처** `plugins/mccp/scripts/lib/design-critique-decide.js:26`

**사용 예시**

```json
{
  "env": {
    "MCCP_DESIGN_CRITIQUE_MAX_RETRY": "2"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_DESIGN_CRITIQUE_MAX_RETRY=0|1|2|3    # v1.3.0-m2 default: 2. plan.md/prp-implement.md/plan-prd.md design-critique retry loop의 round cap. =0 → R0 1회만 + DIVERGENT 즉시 (kill-switch, loud stderr warn). cap 도달 시 receipt meta.design_critique_verdict='divergent' stamp + PR step chain-check이 BLOCK. /mccp:pr scope는 무시 (retry 없음).
  MCCP_DESIGN_GROUNDING=off|warn|enforce    # v1.18.22 default: enforce (fail-closed). /mccp:prp-implement Phase 3.7 post-EXECUTE produced-diff grounding lint. 디자인 trigger 발화(SKILL_AVAIL=1 & (SIGNAL=1|DESIGN_INTENT_ACTIVE=1)) + Phase 2.5.5c capture 아티팩트 존재 시에만 실행 — produced rendered-surface delta(added line만)를 H15(heading depth ≤ 3) anchor로 mechanical(LLM-free) lint. enforce=violations/inconclusive 시 fix-task + bounded retry(MCCP_DESIGN_CRITIQUE_MAX_RETRY 공유 cap, default 2) 후 hard-stop / warn=advisory pass(verdict 정직 기록) / off=skipped(loud stderr warn). 오타·미설정 → enforce. critique loop(§3.9)과 **별도 locus** — 이건 produced diff mechanical, critique은 pre-EXECUTE LLM-judged(중복 아님). rendered surface scope=.css/.scss·.tsx/.jsx/.vue/.svelte/.astro·.html·.claude/cache/*.md (generic .md 제외 — command-doc #### 오발화 회피). H17(nested-card)은 DOM-aware라 added-line 버킷서 enforce 불가 → renderer full-HTML lint 소유. control-plane-only 변경은 no-op. pr/code-review(review-only) 미적용. receipt meta.design_grounding_captured(gate-time bool)+design_grounding_verdict(post-EXECUTE enum: grounded|anchor_clean|inconclusive|violations|skipped) stamp.
```

### MCCP_DESIGN_GROUNDING

**종류** `enum` — **값** `enforce` · `warn` · `off` — **기본값** `enforce`

**한 줄** grounding lint 모드.

**소비처** `plugins/mccp/scripts/lib/design-grounding.js:31`

**사용 예시**

```json
{
  "env": {
    "MCCP_DESIGN_GROUNDING": "warn"
  }
}
```

### MCCP_DESIGN_INTENT_REASON

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** critique 강제 override.

**소비처** `plugins/mccp/commands/plan-prd.md:187`

**사용 예시**

```json
{
  "env": {
    "MCCP_DESIGN_INTENT_REASON": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
MCCP_DESIGN_INTENT_REASON=<사유를 한 문장으로> /mccp:pr
```

### MCCP_IMPECCABLE_ROUTING_MODE

**종류** `enum` — **값** `auto` · `hybrid` · `recommend` — **기본값** `auto`

**한 줄** impeccable 라우팅 모드.

**소비처** `plugins/mccp/scripts/lib/impeccable-routing.js:118`

**사용 예시**

```json
{
  "env": {
    "MCCP_IMPECCABLE_ROUTING_MODE": "hybrid"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_IMPECCABLE_ROUTING_MODE=auto|hybrid|recommend  # v1.13.0 default: auto. 디자인 게이트가 stage-appropriate impeccable 명령(shape/layout/typeset/audit/harden/polish)을 어떻게 다룰지 결정. auto=실제 호출 / hybrid=evaluate(critique/audit)만 invoke·나머지 recommend / recommend=전부 권장만. 미지정·오타 시 auto. critique은 모드 무관하게 §3.9 retry loop가 소유(divergent blocking 보존). pr 게이트는 모드 무관 recommend-only(review-only invariant). prp-implement은 renderingSurface=0(control-plane-only diff)일 때 auto에서도 refine/discovery를 recommend로 강등(Codex F4). receipt에 meta.impeccable_routing_mode + meta.impeccable_commands_routed(structured outcome) stamp.
```

### MCCP_IMPECCABLE_INTENT_COMMANDS

**종류** `list` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 추가 라우팅 명령 목록.

**소비처** `plugins/mccp/scripts/lib/impeccable-routing.js:127`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_IMPECCABLE_INTENT_COMMANDS": "a,b"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_IMPECCABLE_INTENT_COMMANDS="bolder,quieter,overdrive,delight"  # v1.13.0 M2. mood/direction 명령은 diff로 감지 불가 → 기본 recommend-only. 이 env에 나열된 mood 명령은 4중 AND(auto + renderingSurface + designIntentActive(=MCCP_DESIGN_INTENT_REASON 활성) + 본 membership)에서만 prp-implement이 invoke로 승격. 미지정/조건 미충족 시 recommend. comma-separated, 알 수 없는 토큰은 무시. content-detectable 명령(animate/colorize/typeset/adapt)은 본 env와 무관 — diff signal positive-presence로 자동 선별(§3.10 M2).
```

### MCCP_IMPECCABLE_SKILL

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** impeccable skill 이름.

**소비처** `plugins/mccp/scripts/lib/impeccable-detect.js:135`

**사용 예시**

```json
{
  "env": {
    "MCCP_IMPECCABLE_SKILL": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
MCCP_IMPECCABLE_SKILL=<사유를 한 문장으로> /mccp:pr
```

### MCCP_A11Y_AUTO_INVOKE

**종류** `bool` — **값** `on` · `off` — **기본값** `on`

**한 줄** PR에서 a11y 자동 호출.

**소비처** `plugins/mccp/commands/pr.md:759`

**극성** 미설정이면 **켜져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_A11Y_AUTO_INVOKE": "off"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_A11Y_AUTO_INVOKE=0|1                 # v1.13.0 M3 default: 1. /mccp:pr 게이트에서 PR diff에 rendered design surface(UI ext)가 있으면 mccp:a11y-architect를 review-only로 auto-invoke해 WCAG 2.2 관점 review를 PR body `## Accessibility Review`에 inject. 트리거는 rendering_surface(Codex finding 유무 아님 — design-scope preamble starvation 회피, Codex R1 F1). 전용 a11y-review pr-phase lock window + mutations finalizer로 review-only 보증(편집 시 hard-stop, R1 F2). receipt meta.a11y_auto_invoked stamp via finalize-receipt --a11y-auto-invoked(R1 F3). =0이면 auto-invoke 비활성(기존 routing-only count 동작 유지). rendering_surface=false면 어느 값이든 skip. remediation은 advisory — 적용은 별도 /mccp:prp-implement cycle.
```

### MCCP_DEEP_RESEARCH_SKILL

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** deep-research skill 이름.

**소비처** `plugins/mccp/scripts/lib/deep-research-detect.js:45`

**사용 예시**

```json
{
  "env": {
    "MCCP_DEEP_RESEARCH_SKILL": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
MCCP_DEEP_RESEARCH_SKILL=<사유를 한 문장으로> /mccp:pr
```

