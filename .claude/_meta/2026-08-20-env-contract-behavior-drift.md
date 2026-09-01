# 환경변수 계약 대 실제 동작 — 선언 값이 코드에 없는 결함과 값 의미 문서 부재

**Status**: active
**Date**: 2026-08-20
**Topic**: 환경변수 계약 대 실제 동작 — 선언 값이 코드에 없는 결함과 값 의미 문서 부재

## Premises

| # | 참조 | 시점 | 무엇을 전제하는가 |
|---|---|---|---|
| P1 | plugins/mccp/scripts/lib/env-contract/registry.js | c1115c3 | 161개 항목이 단일 선언표 `RAW`로 존재하고, `values` 필드는 "문서에 적히는 canonical 어휘"로 정의된다. 이 필드가 색인·상세 8장·사용 예시의 유일한 파생원이다. |
| P2 | plugins/mccp/scripts/lib/env-contract/lint.js | c1115c3 | lint는 L1~L9 9종이며 대상이 레지스트리·색인·상세 8장·런타임 스캔이다. **레지스트리의 `values`와 소비처 파서의 수용 집합을 맞대는 검사는 존재하지 않는다.** |
| P3 | plugins/mccp/scripts/lib/env-contract/lint.js:119 | c1115c3 | L8 `evidenceLexicalProblem`은 evidence 문자열의 형태(절대경로·UNC·`..`·URL 여부)와 파일 실존만 본다. 그 줄이 해당 토글을 실제로 읽는지는 검사하지 않는다. |
| P4 | plugins/mccp/scripts/lib/env-contract/lint.js:137 | c1115c3 | L9 `rawComparisonHits`는 `boolNames`(kind가 boolean인 토글)만 순회하고 대상 파일도 `scan.js#walkSurfaces`가 여는 JS 표면이다. enum의 raw 비교와 command `.md`의 셸 비교는 범위 밖이다. |
| P5 | plugins/mccp/scripts/lib/plan-review/decide.js:50 | c1115c3 | `MODES = ['codex','multi-agent','hybrid']`이고 `TYPO_MODE = 'codex'`다. `off`는 원소가 아니며 미상값은 `DEFAULT_MODE`가 아니라 `TYPO_MODE`로 착지한다. |
| P6 | plugins/mccp/scripts/hooks/ecc-context-monitor.js:61 | c1115c3 | `costNotifyOnly`가 참을 돌려주는 값은 `notify`·`notification`·`info`·`informational` 넷이다. |
| P7 | plugins/mccp/scripts/lib/hook-flags.js:12 | c1115c3 | `VALID_PROFILES = {minimal, standard, strict}`이고 기본값은 `standard`다. |
| P8 | plugins/mccp/scripts/lib/santa/gate.js:81 | c1115c3 | `SEVERITY_GATE_VALUES = ['enforce','off']`. severity 이름을 받는 축이 아니다. |
| P9 | plugins/mccp/scripts/lib/santa/adjudication.js:40 | c1115c3 | adjudication gate의 어휘도 `enforce`/`off` 2값이며 중간 단계가 없다. |
| P10 | plugins/mccp/scripts/lib/briefing/cost-guard.js:76 | c1115c3 | `MCCP_BRIEFING`을 읽는 지점은 `env.MCCP_BRIEFING === 'off'` 한 줄뿐이다. 대소문자 정규화도 `always` 분기도 없다. |
| P11 | plugins/mccp/scripts/state/session-ledger.js:33 | c1115c3 | `VALID_SCOPES = ['global','repo','hybrid']`이고 미상값은 warn 없이 `global`로 떨어진다. |
| P12 | plugins/mccp/scripts/lib/plan-review/quorum.js:44 | c1115c3 | `parseQuorum`이 받는 형식은 `^(\d+)\s*of\s*(\d+)$`이며 `required < MIN_QUORUM_REQUIRED`는 거부된다. 정수 단독 입력은 파싱 실패다. |
| P13 | plugins/mccp/commands/pr.md:759 | c1115c3 | `A11Y_AUTO=$([ "${MCCP_A11Y_AUTO_INVOKE:-1}" != "0" ] && echo 1 || echo 0)`. 이 토글의 유일한 구현이며 JS 소비처가 없다. |
| P14 | plugins/mccp/commands/work.md:194 | c1115c3 | `ISOLATE="${MCCP_WORK_ISOLATE_IMPLEMENT:-1}"` 이후 `[ "$ISOLATE" != "0" ]`로 분기한다. 같은 파일 :334·:372도 동일 형태다. |
| P15 | plugins/mccp/scripts/lib/orchestration-preview.js:77 | c1115c3 | `resolveIsolate`가 `envValue.parseBool`을 호출하며, 바로 위 주석이 스스로를 work.md `!= "0"`의 mirror라고 선언한다. |
| P16 | docs/environment/review.md:15 | c1115c3 | `MCCP_PLAN_REVIEW` 앵커의 구조부는 값으로 `off`를 싣고 사용 예시가 `"MCCP_PLAN_REVIEW": "off"`인데, 같은 앵커 하단의 v1.29.0 원문은 `codex|multi-agent|hybrid` 3값만 서술한다. |
| P17 | docs/environment/review.md:480 | c1115c3 | `MCCP_DESIGN_GROUNDING` 앵커는 종류·값·한 줄·소비처·사용 예시 5항목으로 끝나며 v1.29.0 원문 블록이 없다. 값 `enforce`/`warn`/`off`의 의미 서술이 문서 어디에도 없다. |
| P18 | plugins/mccp/scripts/lib/implement-dispatch/budget.js:158 | c1115c3 | `parseTierOverride`의 허용 집합은 `{green, notice, warning, critical}`이고 미상 토큰 하나로 override 전체가 무효화된다(loud fail-open). |
| P19 | plugins/mccp/scripts/lib/impeccable-routing.js:42 | c1115c3 | `MOOD_COMMANDS = ['bolder','quieter','overdrive','delight']`이며 `parseIntentCommands`가 이 집합 밖 토큰을 조용히 버린다. |
| P20 | plugins/mccp/hooks/hooks.json | c1115c3 | 등록된 hook 항목이 `id` 필드를 갖고 29개가 열거돼 있다. `MCCP_DISABLED_HOOKS`가 받는 멤버 어휘는 이 파일에서 기계적으로 도출 가능하다. |
| P21 | plugins/mccp/scripts/lib/subscription.js:89 | c1115c3 | tool 축은 `toolCritical > 0`일 때만 발효하고, 그렇지 않으면 `toolWarn`을 무조건 0으로 되돌린다. context 축도 `0 < critical < warn <= 100` 불변식 위반 시 두 값을 함께 기본값으로 되돌린다. |
| P22 | plugins/mccp/scripts/hooks/gateguard-fact-force.js:434 | c1115c3 | `GATEGUARD_DISABLED === '1'`이 GateGuard를 끄는 독립 경로로 살아 있다. 이 이름은 레지스트리에 없다. |
| P23 | plugins/mccp/scripts/lib/env-contract/registry.js:132 | c1115c3 | `MCCP_A11Y_AUTO_INVOKE`의 evidence가 `plugins/mccp/commands/pr.md:759`다. 레지스트리 스스로 이 토글에 JS 소비처가 없음을 기록하고 있다. |
| P24 | .claude/_meta/2026-08-20-env-settings-authoring-surface.md | 2026-08-20 | 같은 날 작성된 선행 조사가 "문제는 정보 부재가 아니라 정보가 작성 지점에 없다"로 판정하고, 레지스트리의 투영이 3개인데 운영자 손끝에 닿는 것이 0개라고 적었다. |

## Evidence

### E1 — lint 9종이 green인 것과 계약이 지켜지는 것은 다른 명제다

`node plugins/mccp/scripts/lib/env-contract/lint.js`는 L1~L9 전부 통과한다. 그러나 P2대로 그 9종에는 **레지스트리 `values` ↔ 소비처 파서 수용 집합** 축이 없다. 검사되는 것은 문서와 레지스트리의 상호 정합이고, 레지스트리가 코드와 어긋나면 문서는 그 어긋남을 충실히 복제한 뒤 green을 보고한다.

이 구조에서 문서 품질이 좋을수록 결함이 잘 숨는다. 색인·상세·사용 예시가 전부 레지스트리에서 파생되므로, 레지스트리의 `values`에 존재하지 않는 값이 하나 들어가면 그 값은 **세 표면에 동시에, 일관되게, 권위 있는 형태로** 나타난다.

### E2 — 실측: 문서가 가르치는 값이 코드에 없는 토글 9개

측정 방법은 두 축이다. (1) 주석·문자열을 제거한 뒤 `process.env.X` · `env[X]` · `envValue.parse*(env, X)`를 수집하고 `const ENV_MODE = 'MCCP_…'` 형태의 1단계 별칭을 해석해 실소비처를 특정했다. (2) 토글마다 자식 프로세스에 실제 환경변수를 설정하고 require 캐시를 비운 뒤 모듈을 재로드해 소비 함수를 호출했다(load-time 캡처 재현). 비-export 함수는 `Module._compile`로 export를 덧붙여 도달했다.

| # | 토글 | 문서가 가르치는 값 | 실측 결과 | 근거 |
|---|---|---|---|---|
| D1 | `MCCP_PLAN_REVIEW` | `off` | **`codex`로 착지** — 리뷰를 끄려는 입력이 Codex 리뷰를 켠다. 미상값 fallback도 레지스트리 기본값이 아니라 `codex` | P5·P16 |
| D2 | `MCCP_CONTEXT_MONITOR_COST_MODE` | `off`·`observe`·`enforce` | **세 값 전부 no-op.** 실제 수용 4값은 미문서 | P6 |
| D3 | `MCCP_HOOK_PROFILE` | `full`·`lean` | 무시되어 `standard`. 실제 기본값 `standard`와 강화 모드 `strict`가 미문서 | P7 |
| D4 | `MCCP_SANTA_SEVERITY_GATE` | `high`·`critical` | loud warn 후 `enforce` 복귀. severity 선택 축이 아니라 on/off 축 | P8 |
| D5 | `MCCP_SANTA_ADJUDICATION_GATE` | `warn` | `enforce`와 동일 차단. "경고만 받겠다"가 전면 차단이 된다 | P9 |
| D6 | `MCCP_BRIEFING` | `always`, 그리고 `OFF`·`Off` | `always` 미구현. 이 토글만 대소문자를 구분한다 | P10 |
| D7 | `MCCP_SESSION_LEDGER_SCOPE` | `host` | warn 없이 `global`. 실제 존재하는 `hybrid`가 미문서 | P11 |
| D8 | `MCCP_PLAN_REVIEW_QUORUM` | 종류 `int`, 예시 `"1"` | 실제 형식은 `<M>of<N>`. **문서 예시 `"1"`을 코드가 명시적으로 거부**한다 | P12 |
| D9 | `MCCP_AUTO_CHAIN_SKIP_PR` | 종류 `bool`, 예시 `"on"` | JS 소비처 0건. 산문이 스스로 "no hook/script enforces this"라고 적는다. 원문의 미구현 표식이 색인 요약에서 소실됐다 | — |

D1·D2는 방향이 나쁘다. 나머지는 무해한 no-op이지만, 운영자가 "설정했는데 왜 안 되지"를 진단할 단서가 없다는 점에서 같은 비용을 만든다.

### E3 — 실측: 셸 구현이 bool 계약을 지키지 않는 축 3건

`value.js`가 bool을 `on/1/true/yes/enabled` ↔ `off/0/false/no/disabled`로 통일했지만, command 본문의 셸은 그 파서를 거치지 않는다. P4대로 L9는 이 축을 보지 않는다.

- `MCCP_A11Y_AUTO_INVOKE`(P13·P23) — 문서가 가르치는 `off`·`false`·`no`·`disabled` 전부 무효. 오직 `0`. 셸 실측: `on→1 off→1 false→1 no→1 disabled→1 0→0`.
- `MCCP_WORK_ISOLATE_IMPLEMENT`(P14·P15) — `off`를 넣으면 firing-preview는 `isolate=false`로 예고하고 live `/mccp:work`는 격리를 유지한다. **P15의 주석이 주장하는 mirror가 실제로 성립하지 않는다.**
- `MCCP_GATEGUARD`·`MCCP_SESSION_START_CONTEXT` — 국지 disable 집합이 각각 `{0,false,off,disabled,disable}`·`{0,false,off,none,disabled}`다. 공유 계약의 `no`가 빠지고 미문서 별칭이 하나씩 들어 있다.

### E4 — 종류(kind) 오기 5건

`MCCP_IMPECCABLE_SKILL`·`MCCP_DEEP_RESEARCH_SKILL`은 `string`("skill 이름")으로 문서화됐지만 실제는 `available`/`missing`(/`unknown`) 강제 override다. `MCCP_EVIDENCE_STAGE_ROOT`는 `list`인데 단일 경로 문자열로 쓰인다. `MCCP_WORK_MERGE_STRATEGY`는 enum 선언이지만 검증이 없어 오타가 warn 없이 통과하고, `work.md`가 `= "worktree-merge"`로만 비교하므로 오타는 조용히 병렬 경로를 끈다. `MCCP_SANTA_TERMINATOR`·`MCCP_SANTA_LEDGER_SUPPRESSION`·`MCCP_STATE_JOURNAL`은 `on`이 어휘에 없어 기본값 `enforce`로 떨어진다(결과 동치, 어휘 불일치).

### E5 — evidence 포인터 드리프트 98/161

레지스트리 헤더는 evidence가 read site를 가리킨다고 못박는다. 실측하면 지정된 줄에 그 이름이 실제로 있는 항목은 63개다. 60개는 3줄 밖, 15개는 같은 파일 다른 위치, **23개는 그 파일에 이름이 아예 없다**(IMPECCABLE_* 15개가 전부 무관한 `impeccable-detect.js:135`를 가리킨다). P3대로 L8은 경로 형태와 실존만 보므로 이 드리프트를 볼 수 없다.

`MCCP_AUTO_HANDOFF`의 evidence는 실소비처(`state/session-spawner.js`의 `modeFromEnv`)가 아니라 카운트 표(`derive/sources/toggle-usage.js`)를 가리킨다. 이 종류의 오지정은 "소비처를 보고 값 의미를 확인한다"는 문서의 사용법 자체를 무력화한다.

### E6 — 레지스트리 밖에서 동작하는 게이트 토글

`value.js`는 미등재 이름으로 호출하면 throw하지만, 그 방어는 `value.js`를 거치는 읽기에만 적용된다. 직접 읽기는 방어 밖이다. 게이트에 영향을 주는 미등재 live 이름: `GATEGUARD_DISABLED=1`(P22, GateGuard 무력화) · `MCCP_IMPECCABLE_CLI_MOCK`(제외 표에는 test-only로 적혀 있으나 실제 read는 production 경로) · `CLAUDE_CODE_DISABLE_WORKFLOWS` · `GATEGUARD_STATE_DIR` · `COMPACT_THRESHOLD`.

### E7 — 값 의미 서술의 부재: enum 27개 중 15개가 값 뜻을 알 수 없다

운영자가 제기한 축이다. 상세 앵커의 구조부는 색인에서 파생된 고정 6항목(종류 · 값 · 기본값 · 한 줄 설명 · 소비처 · 사용 예시)이고, **값별 결과 서술은 그 템플릿에 자리가 없다.** 값 의미가 문서에 존재하는 경우는 전부 하단의 v1.29.0 원문 블록에서 나온다. 즉 값 설명의 유무가 "설계된 계약"이 아니라 "축약 이전 산문이 마침 그 내용을 담고 있었는가"에 달려 있다.

| 축 | 수 | 비고 |
|---|---|---|
| 선언된 값 전부가 산문에 등장 | 12 | 전부 v1.29.0 원문 블록 덕분 |
| 일부 값만 등장 | 6 | `MCCP_PLAN_REVIEW`(`off` 미언급) · `MCCP_SANTA_SEVERITY_GATE`(`high`·`critical`) · `MCCP_SANTA_TERMINATOR`(`off`) · `MCCP_WORK_MERGE_STRATEGY`(`sequential`) · `MCCP_BRIEFING`(`always`) · `MCCP_HOOK_PROFILE`(`full`·`lean`) |
| 어느 값도 등장하지 않음 | 9 | `MCCP_GOAL_FEATURE` · `MCCP_ULTRACODE_FEATURE` · `MCCP_SANTA_BLIND_LANE` · `MCCP_SANTA_ALWAYS_SCOPE` · `MCCP_SANTA_DEGRADE_GATE` · `MCCP_INTENT_MISLABEL` · `MCCP_DESIGN_GROUNDING` · `MCCP_CONTEXT_MONITOR_COST_MODE` · `MCCP_SESSION_LEDGER_SCOPE` |

**E2와 E7의 교집합이 중요하다.** 값 설명이 없거나 부분적인 15개 중 6개(D1~D7 계열)가 바로 값이 실제로 동작하지 않는 토글이다. 산문이 값을 설명하지 않는 것과 코드가 값을 받지 않는 것은 같은 뿌리에서 나온다 — **`values` 배열이 코드를 읽고 쓰인 것이 아니라 손으로 채워졌기 때문이다.**

P17의 `MCCP_DESIGN_GROUNDING`이 순수한 형태다. 앵커 전체가 다섯 줄이고 값은 `enforce`·`warn`·`off` 셋으로 나열되지만, `warn`이 무엇을 warn하고 `off`가 무엇을 멈추는지는 문서 어디에도 없다. 운영자가 알아내려면 `design-grounding.js`를 읽는 수밖에 없다.

### E8 — list 9개는 멤버 어휘가 문서에 0개다

더 나쁜 축이다. enum은 최소한 값이 열거되지만, `list`는 색인의 `값` 열이 `—`이고 상세도 종류만 적는다. 실측 결과 9개 전부 **허용 멤버 후보를 문서에서 얻을 수 없다.** 유추 가능한 것은 기본값 문자열이 있는 둘(`MCCP_BRIEFING_AUTODISABLE_TIER` = `notice,warning,critical` · `MCCP_HANDOFF_THRESHOLDS_USD` = `50,80,100`)뿐이고, 나머지 7개는 기본값도 비어 있다.

그런데 멤버 어휘는 **코드에 상수로 이미 열거돼 있다**:

| 토글 | 실제 멤버 어휘 | 출처 |
|---|---|---|
| `MCCP_WORK_PARALLEL_AUTODISABLE_TIER`<br>`MCCP_PLAN_FANOUT_AUTODISABLE_TIER`<br>`MCCP_BRIEFING_AUTODISABLE_TIER` | `green` · `notice` · `warning` · `critical` | P18 |
| `MCCP_IMPECCABLE_INTENT_COMMANDS` | `bolder` · `quieter` · `overdrive` · `delight` | P19 |
| `MCCP_DISABLED_HOOKS` | 등록된 hook id 29개 | P20 |
| `MCCP_HANDOFF_THRESHOLDS_USD` | 오름차순 정수 3개 | 기본값에서 유추 |
| `MCCP_MCP_CONFIG_PATH` · `MCCP_EVIDENCE_STAGE_ROOT` | 경로(후자는 실제로 단일 값, E4) | — |

`parseTierOverride`는 미상 토큰 **하나**로 override 전체를 무효화하고 기본 정책으로 돌아간다(P18). 어휘를 모르는 운영자가 `high,critical` 같은 그럴듯한 값을 넣으면 설정 전체가 조용히 무시된다. 어휘를 문서화하지 않은 비용이 여기서 실현된다.

### E9 — 결합 규칙 미문서 2건

`MCCP_SUBSCRIPTION_OVERFLOW_TOOL_WARN`은 단독으로는 무효다. `..._TOOL_CRITICAL > 0`이어야 발효하고 아니면 0으로 리셋된다(P21). `..._CONTEXT_WARN_PCT`도 `critical < warn` 불변식 때문에 단독 하향은 두 값을 함께 기본값으로 되돌린다. 색인은 넷을 독립 int 4행으로 싣는다.

## Prior Art

**미조사.** 외부 문헌(설정 스키마 검증, 12-factor config, feature-flag 카탈로그 도구의 값 문서화 관행 등)은 이번 조사에서 다루지 않았다. 필요하면 별도 채널로 수집해 이 절을 채운다.

다만 저장소 안에 이미 사용 가능한 기성 형식이 하나 있다. `docs/ENVIRONMENT.md` §2의 "값 규약" 표는 종류별로 파서가 받는 값과 불량값 처리를 한 표로 정리했다. **그 표가 종류 수준에서 하는 일을 개별 토글 수준에서 하지 않는 것**이 E7·E8의 형태다.

## Precedent

### 선행 조사와의 관계 — 보완이지 중복이 아니다

P24의 [2026-08-20-env-settings-authoring-surface.md](2026-08-20-env-settings-authoring-surface.md)는 같은 날 같은 영역을 다뤘고 **"문제는 정보 부재가 아니라 정보가 작성 지점에 없다"**로 판정했다. 그 판정의 전제는 "161개 토글의 종류·허용값·기본값·소비처·예시가 전부 이미 존재하고 lint 9종으로 fail-closed 대조된다"는 것이다(그 문서 E1).

본 조사는 그 전제의 두 부분을 좁힌다.

1. **"허용값이 이미 존재한다"가 9건에서 거짓이다**(E2). 존재하는 것은 값의 *목록*이고, 그 목록이 코드의 수용 집합과 다르다.
2. **"정보가 이미 존재한다"가 값 의미 축에서 거짓이다**(E7·E8). enum 15개와 list 9개는 작성 지점으로 옮겨 봐야 옮길 내용이 없다.

따라서 선행 판정은 **무효가 아니라 조건부**다. 작성 지점 투영(그 문서의 제3안)은 여전히 옳은 방향이지만, 투영 대상 데이터가 먼저 정확해져야 한다. 선행 문서의 `**Status**`는 `active` 유지가 맞다고 본다 — 전제가 뒤집힌 것이 아니라 범위가 좁혀졌다. 다만 그 문서를 인용할 때 본 문서를 함께 읽도록 상호 참조를 다는 것을 **제안**한다(이 커맨드는 남의 문서를 임의로 고치지 않는다).

### 저장소 선례 — 같은 실패 형태가 이미 두 번 판정됐다

`env-contract` 자체가 이 종류의 드리프트에 대한 대응이었다. `registry.js` 헤더는 "같은 사실이 세 곳에 흩어져 있었고 셋은 서로를 모르므로 조용히 갈라졌다"고 적고, 실측 결과 문서 미등재 22개·문서 전용 10개·defaults 모순 1건을 근거로 든다. **그 처방은 선언을 하나로 모으는 것이었고, 모은 뒤 그 선언이 코드와 맞는지는 검사 대상이 아니었다.** 본 조사가 찾은 것은 정확히 그 잔여 축이다.

`value.js` 헤더도 같은 구조다. boolean 파싱 규약 8종이 공존하던 것을 2종으로 통일했지만, 통일의 범위를 스스로 "boolean 계열"로 한정한다고 명시했다. enum·int의 불량값 처리 방향 통일은 별개 축으로 남겼고, E2의 D1(미상값이 기본값이 아니라 `codex`로 착지)이 그 남은 축에서 나왔다.

## Verdict

### V1 — 근인은 `values` 필드가 코드로부터 파생되지 않는다는 것 하나다

E2(9건) · E7(15건) · E8(9건)은 증상이 셋으로 보이지만 원인이 하나다. 레지스트리의 `values`가 **손으로 채워진 문서용 목록**이고, 코드의 수용 집합(`const X_VALUES = [...]`)과 결속돼 있지 않다. 결속이 없으므로 (a) 코드에 없는 값이 들어갈 수 있고, (b) 값의 의미를 옮겨 적을 원본이 지정되지 않으며, (c) list의 멤버 어휘는 애초에 표현할 필드가 없다.

수리 순서는 이 인과를 따른다. **어휘를 먼저 맞추고(검사 추가), 그 다음에 의미를 붙이고, 마지막에 작성 지점으로 투영한다.** 순서를 뒤집으면 틀린 값에 설명을 다는 일이 된다.

### V2 — 우선순위 3단

**P0 — `values` ↔ 코드 대조 검사 (L10) 신설.** 대부분의 파서가 어휘를 모듈 상수에 담고 있으므로 기계적 대조가 가능하다. 레지스트리에 소비처의 어휘 상수를 가리키는 필드(예: `vocabulary: 'lib/santa/gate.js#SEVERITY_GATE_VALUES'`)를 추가하고, lint가 그 상수를 읽어 `values`와 집합 비교한다. 상수로 표현되지 않은 소수(`briefing/cost-guard.js`의 인라인 `=== 'off'` 등)는 먼저 상수로 승격한다. **D1~D8이 한 번에 걸린다.**

동시에 L8을 evidence 줄 내용 검사로 확장한다(E5). 이건 독립적이고 훨씬 싸다 — 지정된 줄 근처에서 토글 이름이 등장하는지만 보면 된다.

**P1 — 9건의 결함 자체를 수정.** 두 갈래로 갈린다.

- *코드를 문서에 맞춘다*: `MCCP_PLAN_REVIEW=off`(리뷰 없이 진행하는 모드를 실제로 만들 것인가는 별개 판단이 필요하다) · `MCCP_SANTA_ADJUDICATION_GATE=warn`(중간 단계는 다른 게이트에 이미 있는 패턴이다) · `MCCP_BRIEFING=always`.
- *문서를 코드에 맞춘다*: `MCCP_HOOK_PROFILE`(`standard`/`strict` 노출) · `MCCP_CONTEXT_MONITOR_COST_MODE`(실제 4값 노출) · `MCCP_SESSION_LEDGER_SCOPE`(`hybrid` 노출, `host` 삭제) · `MCCP_SANTA_SEVERITY_GATE`(on/off 축임을 명시) · `MCCP_PLAN_REVIEW_QUORUM`(종류를 `string`+형식 명시로) · `MCCP_AUTO_CHAIN_SKIP_PR`(미구현 표식 복원).

`MCCP_PLAN_REVIEW`의 미상값 착지(`codex`)는 DD7이 근거를 갖고 선택한 것이므로 유지하되, **`off`가 값 목록에 있는 것만 제거**하면 된다. 지금은 문서가 존재하지 않는 모드를 광고하고 그 광고를 따르면 정반대 모드가 켜진다.

**P2 — 값 의미와 list 어휘를 상세 템플릿의 필수 항목으로.** 구조부에 두 항목을 추가한다.

- **값별 결과** — enum·bool의 각 값에 한 줄. "무엇이 켜지고 무엇이 꺼지는가"를 동사로. 예: `warn` = grounding 위반을 stderr로 보고하되 게이트를 통과시킨다.
- **멤버 어휘** — list 전용. 허용 토큰과 미상 토큰의 처리(P18처럼 override 전체 무효화인지, 해당 토큰만 버리는지)를 명시. `MCCP_DISABLED_HOOKS`처럼 어휘가 다른 파일에서 도출되는 경우는 그 파일을 가리킨다.

P0의 `vocabulary` 필드가 있으면 이 두 항목의 lint 강제(L7 확장 — 예시뿐 아니라 값별 서술 존재까지)가 가능해진다. 순서가 P0 → P2인 이유다.

### V3 — 셸 축은 별도 축이며 P1과 함께 처리한다

E3의 3건은 `values` 문제가 아니라 **파서 이원화** 문제다. command 본문의 셸이 `value.js`를 못 쓰는 것이 원인이므로, 처방은 두 가지 중 하나다.

1. command 본문이 `node -e`로 `envValue.parseBool`을 호출해 결과를 셸 변수에 받는다(이미 여러 Phase가 같은 패턴으로 오라클을 호출한다).
2. 그렇게 하지 않는 토글은 레지스트리 kind를 `bool`이 아니라 `bypass-flag`로 정정한다 — `1`만 받는다는 사실을 계약에 반영한다.

`MCCP_A11Y_AUTO_INVOKE`는 2번이 정직하다(kill switch가 `=0` 하나라는 것이 원래 설계다). `MCCP_WORK_ISOLATE_IMPLEMENT`는 1번이어야 한다 — preview와 live가 갈리는 것은 계약 위반이고, P15의 주석이 이미 mirror를 약속하고 있다.

### V4 — 이 조사가 주장하지 않는 것

- **모든 토글을 검증하지 않았다.** 실측 프로브는 소비 함수가 특정 가능한 토글에 걸었고, 그 수는 약 70개다. 나머지는 정적 축(읽기 지점 해석)으로만 확인했다. "나머지 90여 개가 정상"이 아니라 "같은 방법으로 아직 재지 않았다"가 정확하다.
- **`values`가 맞는 12개도 의미가 문서화됐다는 뜻은 아니다.** E7의 "전 값 언급 12"는 값 토큰이 산문에 *등장*하는지의 근사이며, 그 등장이 결과를 설명하는지는 별도 판정이 필요하다.
- **선행 조사(P24)의 제3안을 대체하지 않는다.** 작성 지점 투영은 여전히 옳고, 본 조사는 그 앞에 놓일 선행 조건을 지정할 뿐이다.

## Open Questions

- **`MCCP_PLAN_REVIEW=off`를 만들 것인가, 값 목록에서 뺄 것인가.** 리뷰를 완전히 끄는 모드는 `MCCP_REVIEW_SINGLE_PASS`(1회 통과)와 겹치지 않는 별개 의미다. 만든다면 receipt에 무엇을 봉인할지가 함께 정해져야 한다 — 승인 없이 진행한 기록이 남지 않으면 `unavailable`과 구분되지 않는다.
- **`vocabulary` 필드를 어떤 형태로 표현할 것인가.** `path#CONST_NAME`로 두고 lint가 모듈을 require해 읽는 방식은 side-effect 있는 모듈에서 위험하다. 소스 텍스트에서 상수 리터럴을 정규식으로 뽑는 방식은 안전하지만 표현식으로 만든 집합(`new Set([...].map(…))`)을 못 읽는다. 후자로 시작하고 못 읽는 항목을 명시적으로 열거하는 편이 정직해 보인다.
- **미등재 live 토글(E6)을 레지스트리에 넣을 것인가, 없앨 것인가.** `GATEGUARD_DISABLED`는 ECC 상속 이름이라 하위 호환 부담이 있다. `MCCP_IMPECCABLE_CLI_MOCK`은 production 경로에서 읽히므로 test-only 분류 자체가 부정확하다 — 분류를 고칠지 read를 test 경로로 옮길지 판단이 필요하다.
- **evidence 드리프트 98건을 일괄 재생성할 것인가.** 정적 해석으로 실소비처를 찾는 스크립트는 이미 이 조사에서 썼다. 다만 소비처가 여럿인 토글에서 어느 것을 대표로 삼을지의 규칙이 없다 — 현재 레지스트리도 그 규칙을 적지 않는다.
- **`MCCP_SUBSCRIPTION_OVERFLOW_*` 4개를 결합 단위로 문서화할 것인가.** 색인은 토글 1행 = 1항목 구조라 "둘을 함께 설정해야 발효"를 표현할 자리가 없다. 상세 앵커의 값별 결과 항목이 그 자리를 대신할 수 있다.
