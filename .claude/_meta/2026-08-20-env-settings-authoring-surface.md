# 환경변수 발견성과 settings.json 작성 표면 — 외부 스키마 import 대 setup 시드 대 제3안

**Status**: active
**Date**: 2026-08-20
**Topic**: 환경변수 발견성과 settings.json 작성 표면 — 외부 스키마 import 대 setup 시드 대 제3안

## Premises

| # | 참조 | 시점 | 무엇을 전제하는가 |
|---|---|---|---|
| P1 | plugins/mccp/scripts/lib/env-contract/registry.js | c1115c3 | 161개 항목이 `name`·`kind`·`values`·`default`·`polarity`·`status`·`domain`·`doc`·`evidence`·`summary` 10필드를 갖는 단일 선언표(`RAW`)로 존재하고 `ENTRIES`/`get`/`byKind`/`byDomain`으로 export된다. 운영자가 알고 싶어 하는 정보는 이미 기계 판독 가능한 형태로 저장소 안에 있다. |
| P2 | plugins/mccp/scripts/lib/env-contract/registry.js:322 | c1115c3 | 이 파일에는 `require.main === module` 블록이 없다. 레지스트리는 CLI 표면이 0개이며 소비하려면 Node로 `require`하는 수밖에 없다. |
| P3 | plugins/mccp/scripts/lib/env-contract/lint.js:426 | c1115c3 | lint는 CLI를 갖고 9개 검사를 fail-closed로 수행하지만 대상은 레지스트리·`docs/ENVIRONMENT.md`·`docs/environment/*.md`·런타임 스캔이다. 운영자의 `.claude/settings.json`은 어느 검사에도 들어가지 않는다. |
| P4 | plugins/mccp/scripts/lib/env-contract/value.js:38 | c1115c3 | `bool`의 파서 수용집합(`on 1 true yes enabled`)이 문서 canonical 어휘(`on`/`off`)보다 넓다. 동작은 하지만 문서가 가르치는 표기와 다른 값이 경고 없이 존재할 수 있다. |
| P5 | docs/ENVIRONMENT.md:44 | c1115c3 | 색인은 6열 표(`변수`·`종류`·`값`·`Default`·`한 줄 설명`·`상세`)이고 도메인 8장으로 분기하며 §6이 변경 절차를 레지스트리 → 색인 → 상세 → lint 순으로 고정한다. 문서는 완비돼 있고 부족한 것은 문서가 아니다. |
| P6 | docs/environment/gates.md:23 | c1115c3 | 각 토글 앵커가 `.claude/settings.json`의 `env` 블록에 그대로 붙여 넣을 수 있는 JSON 스니펫을 갖는다(lint L7이 존재·파싱·values 정합을 강제). |
| P7 | plugins/mccp/scripts/lib/settings-writer.js:3 | c1115c3 | mccp는 이미 `~/.claude/settings.json`의 `env` 블록만 건드리는 writer를 갖는다 — 나머지 키 verbatim 보존, tmp+rename 원자 쓰기, `.bak` 1회전, `set`/`unset`/`read` CLI + `--dry-run`. |
| P8 | plugins/mccp/commands/setup.md:138 | c1115c3 | `/mccp:setup` Phase 4는 `AskUserQuestion`으로 사용자가 그 선택지를 고른 경우에만 `settings-writer.js set --key MCCP_CODEX_DISABLED --value 1`을 실행한다. setup이 env를 시드하는 선례는 정확히 1건이고 그 발화 조건은 사용자가 골랐을 때다. |
| P9 | plugins/mccp/scripts/lib/gitignore-provision.js:31 | c1115c3 | marker로 구분된 managed block만 교체하고 블록 바깥 줄은 바이트 단위로 보존한다. 소유권 경계를 파일 안에 기록하는 것이 setup이 남의 파일을 안전하게 갱신하는 방식이다. |
| P10 | plugins/mccp/scripts/lib/settings-signal.js:81 | c1115c3 | settings 우선순위는 managed < user < project이며 mccp의 병합 헬퍼는 `Object.assign` 얕은 병합이고 스스로 merged는 activation의 canonical 소스가 아니라고 명시한다. |
| P11 | plugins/mccp/scripts/state/toggle-snapshot.js:29 | c1115c3 | `TOGGLE_DEFAULTS`가 레지스트리에서 파생되고 세션 스냅샷은 비기본값 토글만 기록한다. "설정 파일에 적혀 있다 = 기본에서 벗어났다"가 계측에 실제로 쓰이는 신호다. |
| P12 | .claude/audit/v1.0.0-fallback-ux.md:906 | 2026-06-13 | Finding A(11m) — 세션 시작 후 settings.json의 env를 편집해도 같은 세션의 프로세스에는 반영되지 않는 divergence가 실측됐다. settings.json env는 세션 시작 시점의 스냅샷이다. |
| P13 | plugins/mccp/scripts/hooks/config-protection.js:23 | c1115c3 | `PROTECTED_FILES`에 `settings.json`이 없다. settings.json 쓰기를 막는 hook은 존재하지 않으므로 시드는 기술적으로 가능하다 — 막히지 않는다는 것이 해도 된다는 뜻은 아니라는 점이 아래 판정의 출발점이다. |
| P14 | .claude/settings.json | c1115c3 | 현재 프로젝트 `env` 블록은 10키이고 그중 `MCCP_*`는 4개다. 나머지 6개는 Claude Code 자신의 이름이라 레지스트리가 소유하지 않는다. |
| P15 | plugins/mccp/scripts/lib/dashboard-server.js:41 | c1115c3 | `--write` 모드가 이미 존재한다. POST `/__mccp_resolve` 라우트가 loopback Host 게이트 · Origin/Referer 검사 · per-process CSPRNG nonce · opaque id 재열거 · `.claude/**/*.md` containment · CAS/lock으로 fail-closed 보호되며, **기본 서버에는 mutation 라우트가 아예 없다**. mccp에는 이미 보안 리뷰를 거친 브라우저 write 표면이 있다. |
| P16 | plugins/mccp/commands/dashboard.md:2 | c1115c3 | 그 표면에 도달하려면 `/mccp:dashboard --write`를 알아야 한다 — 기능의 존재와 옵션의 존재를 둘 다 알아야 하는 구조다. |
| P17 | plugins/mccp/commands/prp-pr.md:2 | c1115c3 | mccp에는 verbatim alias 커맨드 선례가 2건 있다(`prp-pr` → `pr`, `review-pr` → `code-review`). 한 기능에 두 이름을 주는 비용은 파일 하나다. |
| P18 | .claude/_meta/2026-08-20-env-contract-behavior-drift.md | 2026-08-20 | 같은 날 작성된 자매 조사가 실측으로 **문서가 가르치는 값이 코드에 없는 토글 9건**(D1~D9), 셸 bool 계약 위반 3건, kind 오기 5건, evidence 드리프트 98/161, 미등재 live 게이트 토글 5건, **enum 27개 중 15개의 값 의미 미문서**, **list 9개 전부의 멤버 어휘 미문서**를 확인했다. 근인은 레지스트리 `values`가 코드에서 파생되지 않고 손으로 채워졌다는 것 하나다. |
| P19 | plugins/mccp/scripts/lib/plan-review/decide.js:50 | c1115c3 | `MODES = ['codex','multi-agent','hybrid']`이고 미상값은 `TYPO_MODE = 'codex'`로 착지한다. `off`는 원소가 아니다 — 문서가 가르치는 `MCCP_PLAN_REVIEW=off`를 넣으면 **리뷰가 꺼지는 것이 아니라 Codex 리뷰가 켜진다.** |
| P20 | plugins/mccp/scripts/lib/hook-flags.js:12 | c1115c3 | `VALID_PROFILES = {minimal, standard, strict}`이고 기본값은 `standard`다. 문서가 가르치는 `full`·`lean`은 존재하지 않는다. |
| P21 | plugins/mccp/scripts/lib/receipt-mode.js:12 | c1115c3 | `VALID_MODES = new Set(['hard','soft','off'])` + `DEFAULT_MODE='hard'` + 미상값 loud warn 후 기본값 복귀. `stop-review-loop.js:47`의 `modeFromEnv`도 같은 형태다. 즉 **정상 형태의 enum 소비처가 무엇인지에 대한 저장소 내 기준이 존재한다.** |

## Evidence

### E1 — 문제는 정보 부재가 아니라 정보가 작성 지점에 없다는 것

P1·P5·P6을 합치면 이렇게 된다. 161개 토글의 종류·허용값·기본값·소비처·붙여넣기용 JSON 예시가 전부 이미 존재하고, 세 표현(레지스트리 · 색인 · 상세 8장)이 lint 9종으로 fail-closed 대조된다. 실행해 보면 오늘 기준 전부 green이다.

```
ok   L1 … ok   L9   (9/9, node plugins/mccp/scripts/lib/env-contract/lint.js)
```

그런데 운영자가 `.claude/settings.json`을 여는 순간, 이 정보 중 에디터 화면에 도달하는 것은 0개다. `docs/ENVIRONMENT.md`를 따로 열어 도메인을 고르고 앵커로 내려가야 한다. 사용자가 말한 "어떤 값을 넣어야 할지 잘 모르겠다"는 문서가 없어서가 아니라 **문서와 작성 지점이 분리돼 있어서** 생긴다. 이 구분이 이후 판정 전체를 가른다 — 문서를 더 쓰는 처방은 이 증상을 고치지 못한다.

### E2 — 투영은 3개인데 운영자 손끝에 닿는 것은 0개

레지스트리의 소비처를 전수하면:

| 투영 | 소비자 | 운영자가 작성 중에 보는가 |
|---|---|---|
| `state/toggle-snapshot.js`의 `TOGGLE_DEFAULTS` (P11) | 계측(B3 분자/분모) | 아니오 |
| `docs/ENVIRONMENT.md` 색인 + 상세 8장 (P5·P6) | 사람이 브라우저/에디터로 따로 열 때 | 아니오 |
| `value.js` 파싱 판정 (P4) | 런타임 | 아니오 |

빠진 것은 네 번째 투영이며, 그 투영의 소비자는 **운영자와 그의 에디터**다.

### E3 — 실측: 사용자의 현재 settings.json을 레지스트리로 검사하면 위반이 나온다

레지스트리를 그대로 써서 `.claude/settings.json`의 `env`를 대조했다(read-only, 상태 미변경).

```
  [미등재] MAX_OUTPUT_TOKENS=8000
  [미등재] MAX_THINKING_TOKENS=10000
  [미등재] ENABLE_TOOL_SEARCH=auto:3
  [미등재] CLAUDE_CODE_SUBAGENT_MODEL=haiku
  [미등재] CLAUDE_CODE_MAX_OUTPUT_TOKENS=100000
  [미등재] CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50
  [값불일치] MCCP_RECEIPT_DEBUG=1  허용=on|off
settings.json env: ok=3 미등재=6 값불일치=1
```

두 가지를 읽어야 한다.

- **미등재 6건은 위반이 아니다.** Claude Code 자신의 이름이고 레지스트리는 이를 소유하지 않는다(P14). 검사기를 만든다면 이 6건을 오류로 내면 안 된다 — mccp가 소유하지 않는 이름에 오류를 내는 검사기는 즉시 무시당한다.
- **`MCCP_RECEIPT_DEBUG=1`은 정확히 사용자가 말한 증상이다.** `1`은 P4의 TRUE 별칭이라 동작한다. 그러나 레지스트리가 가르치는 canonical 어휘는 `on`/`off`이고 색인 §2가 "평소엔 on/off, 우회 플래그는 1"을 규칙으로 못 박았다. 이 값은 규칙의 반대편 관용에 우연히 걸려 있고, **오늘 그것을 알려 주는 장치가 하나도 없다**(P3). 작성 시점에 신호가 없으니 운영자는 자기 값이 규약 안에 있는지 알 방법이 없다.

이 한 줄이 본 조사의 핵심 실측이다. 사용자의 질문은 추상적 불편이 아니라 자기 파일에 이미 존재하는 상태였다.

### E4 — setup은 이미 env를 시드한다. 단 1개이고 조건은 사용자가 골랐을 때다

P8이 결정적이다. "setup이 환경변수를 default로 넣어 주면 좋겠다"는 제안은 새 축이 아니라 기존 선례의 확대다. 그래서 질문은 "해도 되는가"가 아니라 **1건에서 75건으로 늘릴 때 무엇이 달라지는가**가 된다.

현재 1건이 안전한 이유는 셋이 동시에 성립하기 때문이다.

- 사용자가 `AskUserQuestion`에서 그 선택지를 명시적으로 골랐다.
- 값이 기본값이 아니다(`MCCP_CODEX_DISABLED`의 default는 `off`, 시드되는 값은 `1`). 기록되는 것은 기본의 복제가 아니라 기본에서 벗어난 결정이다.
- 항목이 1개라 사후에 사람이 그것을 자기 결정으로 인식할 수 있다.

75건 전량 시드는 셋 다 깬다.

### E5 — JSON에는 소유권 경계를 적을 수 없다

P9의 managed block이 `.gitignore`에서 성립하는 이유는 `#` 주석 줄이 파일 문법 안에 있기 때문이다. setup은 자기 구간을 표시하고, 다음 실행에서 그 구간만 교체하며, 바깥은 손대지 않는다. **JSON에는 주석이 없다.** 따라서 setup이 `settings.json`에 시드하면 다음 실행에서 이 질문에 답할 수 없다.

> 이 `"MCCP_STOP_LOOP": "observe"`는 (a) 내가 지난번에 시드한 기본값인가, (b) 사용자가 숙고 끝에 그 값으로 정한 것인가?

두 경우의 올바른 처리가 정반대다. (a)라면 mccp의 기본값이 바뀔 때 따라 올라가야 하고, (b)라면 절대 건드리면 안 된다. 구분할 수 없으면 setup은 둘 중 하나를 반드시 틀린다. 우회로는 별도 manifest 파일(`.claude/mccp-seeded.json` 같은)에 "내가 시드한 키와 그때의 값"을 기록하는 것인데, 이는 운영자 소유 파일에 대한 그림자 상태를 새로 만드는 것이고 그 둘의 동기화 실패가 새 결함 축이 된다.

### E6 — 전량 시드는 env-contract가 없앤 바로 그 drift를 되살린다

`registry.js` 헤더가 자기 존재 이유를 이렇게 적는다.

> 이 파일이 없던 시절, 같은 사실이 세 곳에 흩어져 있었다 (…) 셋은 서로를 모르므로 조용히 갈라졌다 — 실측 결과 문서 미등재 22개, 문서에만 있는 이름 10개, defaults 모순 1건.

75개 기본값을 `settings.json`에 복사하는 것은 **네 번째 사본을 만드는 것**이며, 그 사본은 앞의 셋과 결정적으로 다르다: 앞의 셋은 저장소 안에 있어 lint가 대조할 수 있지만, 이 사본은 운영자 소유 공간에 있어 mccp가 일방적으로 고칠 수 없다. 결과는 이렇게 나타난다.

- mccp가 v1.31에서 `MCCP_WORK_MERGED_VERIFY`의 기본값을 `enforce`에서 다른 값으로 바꾼다.
- v1.29 시절 시드를 받은 사용자의 파일에는 `"enforce"`가 명시돼 있다.
- 그 사용자는 자신이 고른 적 없는 값에 영구히 고정된다. 업그레이드해도 동작이 안 바뀌고, 그 이유가 자기 설정 파일에 있다는 것을 알아채기 어렵다.

이론적 위험이 아니라 기본값 시드의 정의상 귀결이다. 명시적으로 적힌 값은 기본값이 아니게 된다.

### E7 — 신호 파괴: 적혀 있다 = 벗어났다

P11에 따라 세션 스냅샷은 비기본값 토글만 기록하고 그 수치가 B3 분자다. 스냅샷 자체는 레지스트리 기본값과 비교하므로 시드가 있어도 **계측은 살아남는다** — 이 점은 정확히 해 둔다. 무너지는 것은 계측이 아니라 사람의 판독이다. 오늘 사용자의 파일에서 `MCCP_*` 4줄은 전부 의도적 선택이라 한눈에 읽힌다. 79줄이 되면 그 4줄은 사라지고 "내가 뭘 바꿨더라"는 diff를 떠야 알 수 있게 된다.

### E8 — bypass-flag를 상주 파일에 적는 것은 방향이 반대다

색인 §1이 배치 규약을 명시한다.

> 셸 — 한 호출에만 적용. 우회 플래그와 audited override는 보통 이쪽이다.

`MCCP_SKIP_RECEIPT` · `MCCP_ALLOW_CODEX_UNAVAILABLE` · `MCCP_CODEX_DISABLED` 3종은 활성화가 리뷰 게이트를 제거·약화하기 때문에 별도 kind로 분리됐고 활성 리터럴이 `1` 하나로 고정돼 있다. 이 이름들을 `"off"`라는 값과 함께 상주 파일에 적어 두는 것은 게이트 해제를 **한 글자 편집 거리**로 만든다. 기본값이 안전하다는 사실은 이 문제를 상쇄하지 않는다 — 문제는 값이 아니라 접근성이다.

`string` kind의 override 사유 변수(`MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE` 등)도 같다. 이들은 default가 `null`이라 시드할 값 자체가 없다(P1 기준 active 75개 중 14개가 여기 해당).

### E9 — 시드는 사용자가 기대하는 시점에 효력을 내지 않는다

P12가 실측한 divergence는 시드 제안의 편익 절반을 잘라낸다. "나중에 사용자가 수정하기 쉬울 것"이라는 기대는 *파일을 고치면 동작이 바뀐다*를 전제하는데, 실제로는 다음 세션부터 바뀐다. 같은 세션에서 고치고 재실행하면 예전 값이 그대로 걸린다. 시드는 이 함정을 없애지 않고 오히려 편집을 유도해서 더 자주 밟게 만든다.

### E10 — 외부 파일로 빼서 import는 Claude Code에 존재하지 않는 기제다

저장소 전체에서 settings 해석 경로를 소유하는 코드는 `settings-signal.js` 하나이고(P10) 그것이 아는 합성 방식은 managed/user/project 3계층 병합뿐이다. 파일 참조·include·`extends` 같은 것을 읽는 코드는 없다. Claude Code 본체가 그런 기제를 갖는지는 이 저장소로 판정할 수 없어 Open Question에 남기지만, 적어도 다음은 확실하다.

- mccp 쪽 소비자는 그런 기제를 전제하지 않는다.
- 사용자가 원하는 "값 목록을 외부에 두고 settings.json이 그것을 가져온다"는 형태는 **설령 import가 있어도 목적을 달성하지 못한다.** import가 가져오는 것은 *값*이지 *허용값의 설명*이 아니기 때문이다. 발견성 문제는 값을 다른 파일로 옮긴다고 풀리지 않는다.

즉 질문 A는 어렵다가 아니라 문제와 처방이 어긋나 있다.

### E11 — 브라우저 GUI는 그린필드가 아니다. 다만 도달 경로가 발견성 실패다

P15대로 `--write` 모드가 이미 있고 보안 체인은 Codex 리뷰를 거쳐 짜였다. 그러나 P16이 지적하는 도달 경로가 문제다 — **기능의 존재와 옵션의 존재를 둘 다 알아야** 환경변수 설정 화면에 닿는다. 운영자가 알 리 없는 것을 알아야 쓸 수 있는 표면은 없는 것과 같다.

또한 write-mode가 지금 쓰는 것은 `.md`에 붙는 **비파괴 마커 주석**이고, 게이트 토글은 **파괴적 정책 치환**이다. 보안 체인이 같아도 뚫렸을 때의 impact가 다르므로(우회 성공 = 게이트 무력화) containment 확장은 그 자체로 재리뷰 대상이다.

### E12 — 물어볼 수 있는 것이 41개다. 계층 없이는 walkthrough가 성립하지 않는다

레지스트리로 계산했다 — `status:'active'` ∧ `domain ∉ {external, retired}` ∧ `kind ∈ {bool, enum}`:

```
41  (gates 11 · review 10 · orchestration 12 · cost 3 · hooks 3 · observability 2)
제외: bypass-flag 3 · string override 사유 10 · undocumented-default 58 · int 노브 16
```

`AskUserQuestion`은 호출당 질문 4개가 상한이므로 41개는 **최소 11회 호출**이다. 완주하지 않으며, 완주하지 않으면 기억도 남지 않는다 — 피로해서 스킵한 것은 읽지 않은 것과 같다.

그리고 계층을 `kind`에서 **파생할 수 없다**. `MCCP_GATE_ROUND_CAP`은 `int`지만 실질은 `1|2|3` 열거이고 리뷰 비용의 주 축이라 반드시 물어야 한다(CLAUDE.md §3.16이 프로젝트 기본을 1로 못 박은 그 축). 반대로 `MCCP_RECLAIM_OUTLIVES`는 `bool`이지만 첫 실행에서 물을 이유가 없다. **"모르면 나중에 놀라는가"는 데이터에서 도출되지 않는 판단**이므로 선언 필드여야 한다.

### E13 — walkthrough는 자매 조사가 찾은 드리프트를 증폭한다 (교차 판정)

**본 조사에서 가장 중요한 발견이다.** P18의 드리프트 9건과 본 조사의 walkthrough 설계를 교차하면, core tier 초안 9개 중 2개가 **존재하지 않는 값을 권위 있는 선택지로 제시**한다.

| core 후보 | 드리프트 | 결과 |
|---|---|---|
| `MCCP_PLAN_REVIEW` | D1 (P19) | walkthrough가 `off`를 선택지로 내고, 고르면 **리뷰가 꺼지는 대신 Codex 리뷰가 켜진다** |
| `MCCP_HOOK_PROFILE` | D3 (P20) | `full`·`lean`을 선택지로 내지만 둘 다 무시되고 `standard`로 간다 |
| `MCCP_RECEIPT_GATE_MODE` · `MCCP_STOP_LOOP` | 없음 (P21) | 정상 — 열거 검증 + loud warn + 기본값 복귀 |

이 교차가 드러내는 구조는 이렇다. 오늘 `values`의 오류는 **아무도 안 읽는 문서** 안에 있어서 잠재적이다(E1이 판정한 바로 그 사실 — 정보가 작성 지점에 없다). walkthrough는 그 오류를 **모든 신규 사용자 앞에 객관식으로 꺼내 놓고 고르게 한다.** 즉 walkthrough는 잠재된 문서 결함을 **능동적 오교육 장치로 전환**한다.

그리고 피해가 문서보다 크다. 잘못된 문서를 읽은 사용자는 "안 되네"에서 멈추지만, walkthrough에서 고른 사용자는 **자기가 그것을 설정했다고 기억한다.** 본 설계의 목적이 정확히 그 기억이므로, 기억이 거짓일 때 비용도 그만큼 크다.

따라서 순서는 선호가 아니라 **의존이다**: 드리프트 조사의 P0(`values` ↔ 코드 대조 lint)가 walkthrough보다 먼저 착지해야 한다.

## Prior Art

**미조사.** 이 커맨드는 문헌 조사를 자동화하지 않으며(`/mccp:meta-research` 계약), 사용자가 외부 조사 결과를 제공하지 않았다. 따라서 아래 판정은 저장소 내부 근거만으로 성립한다.

조사할 가치가 있는 축을 남긴다 — 다음 사이클에서 `/deep-research` 등으로 채울 것.

- JSON Schema를 설정 파일 UX에 쓰는 도구들의 관행 — 특히 열린 map(여기서는 `env`)에 대해 `properties`로 알려진 키만 좁히고 나머지를 허용하는 패턴의 에디터 지원 범위.
- `$schema` 인밴드 선언 대 에디터측 연결(VS Code `json.schemas`, JetBrains schema mapping)의 트레이드오프. 전자는 파일 하나에 키가 하나뿐이라 schemastore 스키마와 배타적이라는 제약이 있다(V2 참조).
- 도구가 사용자 설정 파일에 기본값을 시드하는 관행의 사후 평가 — ESLint `--init`, Prettier, `tsc --init` 계열이 명시적 기본값 고정의 업그레이드 비용을 어떻게 처리하는지. E6의 귀결이 업계에서 어떻게 나타났는지가 직접 대응한다.

## Precedent

| 선례 | 이번 판정과의 관계 |
|---|---|
| `env-contract` 3모듈 + lint 9종 (v1.29.1) | **어긋나지 않는다.** 본 조사는 레지스트리를 SoT로 재확인하고 그 위에 투영을 하나 더 얹자고 판정한다. 새 선언원을 만들자는 제안은 전부 기각 대상이다. |
| `gitignore-provision.js` DD2 — canonical 목록은 코드에 있고 런타임에 대상 파일에서 역산하지 않는다 (P9) | **그대로 계승한다.** 다만 marker 기제는 JSON에 이식 불가라(E5) setup의 쓰기 대상이 달라져야 한다는 것이 V4의 근거다. |
| `toggle-snapshot.js`가 `TOGGLE_DEFAULTS`를 리터럴에서 파생으로 바꾼 전환 (P11) | **동형이다.** "두 번째 리터럴을 파생으로 바꿨더니 모순이 구조적으로 불가능해졌다"는 그 이동이, 여기서는 "스키마를 손으로 쓰지 말고 레지스트리에서 생성하라"로 나타난다. |
| `.claude/_meta/2026-08-12-review-loop-meta-analysis.md` — 계측 부재를 단일 근인으로 지목 | **패턴이 반복된다.** 그때는 리뷰 루프에 계측이 없었고 지금은 운영자 설정에 검사가 없다(P3). 처방의 형태도 같다: 이미 있는 데이터를 관측 가능한 지점으로 투영. |
| `/mccp:setup` Phase 4의 조건부 1건 시드 (P8) | **부정하지 않는다.** V4는 그 선례를 폐기하지 않고 그 발화 조건(사용자가 골랐다 · 값이 기본이 아니다)을 일반 규칙으로 승격시킨다. |
| CLAUDE.md §3.12의 "표준 설치(`MCCP_CODEX_DISABLED=1`이 사용자 settings.json에 존재)" | **전제가 이 설치에서 성립하지 않는다.** 실측상 `MCCP_CODEX_DISABLED`는 user·project 어느 settings.json에도 없다(`process.env`에서 `undefined`). 본 판정에 영향은 없으나 그 문장을 근거로 삼는 다른 서술이 있다면 재확인 대상이다. |

선행 `_meta` 문서 중 전제가 무효화된 것은 발견되지 않았다. 위 마지막 행은 `_meta` 문서가 아니라 CLAUDE.md 서술이므로 상태 갱신 제안 대상이 아니고 Open Questions에 확인 항목으로 남긴다.

### 자매 조사와의 상호 참조 (2026-08-21 추가)

[2026-08-20-env-contract-behavior-drift.md](2026-08-20-env-contract-behavior-drift.md)가 본 문서의 전제 하나를 **좁혔다**. 그 문서의 Precedent가 정확히 적은 대로다.

> "허용값이 이미 존재한다"가 9건에서 거짓이다. 존재하는 것은 값의 *목록*이고, 그 목록이 코드의 수용 집합과 다르다. (…) 따라서 선행 판정은 **무효가 아니라 조건부**다.

동의한다. 본 문서 E1의 "161개 토글의 정보가 전부 이미 존재한다"는 **`values` 축에서 9건, 값 의미 축에서 enum 15개 + list 9개가 거짓**이다. 그래서 V1~V4는 유지하되 **선행 조건이 붙는다**: 투영 대상 데이터가 먼저 정확해져야 한다. 그 조건을 E13이 walkthrough 축에서 다시 확인했고, 본 문서의 `**Status**`는 `active` 유지가 맞다 — 전제가 뒤집힌 것이 아니라 순서가 강제됐다.

**두 문서를 함께 읽어야 한다.** 이 문서만 읽으면 "데이터는 정확하니 투영만 하면 된다"로 오독되고, 그 오독 위에 walkthrough를 지으면 E13의 오교육이 발생한다.

## Verdict

### V1 — 질문 A(외부 파일 import)는 기각. 문제와 처방이 어긋난다

E10대로다. mccp가 아는 설정 합성은 3계층 병합뿐이고, 값을 외부 파일로 옮기는 것은 발견성을 전혀 개선하지 않는다. 발견성의 대상은 값이 아니라 *허용값의 설명*이기 때문이다. 이 선택지는 더 조사할 필요 없이 닫는다.

다만 3계층 병합 자체는 다른 용도로 유용하다: 게이트를 약화하는 우회 토글을 project `settings.json`(git-tracked)이 아니라 `settings.local.json`(개인)에 두는 배치 규약. 발견성 축이 아니라 위생 축이며 별개다.

### V2 — 질문 B($schema)는 조건부 채택. 유효하되 에디터 한정이고 반드시 생성물이어야 한다

JSON Schema는 `env` 아래 알려진 키에 `enum`을 걸고 모르는 키는 통과시킬 수 있다(E3이 요구하는 정확히 그 형태). 그러면 에디터가 `MCCP_STOP_LOOP`에 `off|observe|enforce` 자동완성을 준다 — 이것이 사용자가 원한 것의 본체다.

세 조건이 붙는다.

1. **손으로 쓰지 않는다.** 레지스트리에서 생성하고, 생성물과 레지스트리의 일치를 lint 검사로 붙인다(P11의 전환과 동형). 손으로 쓴 스키마는 다섯 번째 선언원이고 E6의 재발이다.
2. **런타임 강제력이 없음을 명시한다.** 스키마는 에디터 affordance다. 잘못된 값을 실제로 막는 것은 여전히 `value.js`의 default 복귀 + loud warn이다. 스키마를 게이트로 착각하면 안 된다.
3. **`$schema` 키는 하나뿐이라 schemastore와 배타적이다.** 현재 프로젝트·사용자 settings.json 둘 다 `https://json.schemastore.org/claude-code-settings.json`을 가리킨다(P14). 이를 mccp 로컬 스키마로 교체하면 Claude Code 자체 키의 검증을 잃는다. 그래서 인밴드 `$schema` 교체보다 에디터측 연결이 낫다 — `.vscode/settings.json`의 `json.schemas`로 `.claude/settings.json`에 스키마를 추가 연결하면 `$schema`를 건드리지 않고 둘 다 얻는다. 현재 이 저장소의 `.vscode/settings.json`에는 그런 매핑이 없다(키 1개뿐).

### V3 — 진짜로 빠진 것은 레지스트리의 CLI 투영이다 (1순위 처방)

P2가 지목하는 공백이다. 161개 항목이 구조화돼 있는데 `require` 외에는 꺼내는 길이 없다. 여기에 CLI를 붙이면 사용자의 질문이 한 번에 닫힌다.

| 사용자 질문 | 닫는 것 |
|---|---|
| 어떤 환경변수가 있는가 | `list` — 도메인·상태 필터로 열거 |
| 어떤 동작을 하는가 | `explain <NAME>` — kind·values·default·소비처·상세 앵커·JSON 예시 |
| enum/list에 무슨 값을 넣는가 | `explain`의 values + `emit-schema`가 만든 에디터 자동완성 |
| (아직 안 물었지만 E3이 드러낸 것) 내가 지금 넣어 둔 값이 맞는가 | `doctor` — 실제 `.claude/settings.json`을 레지스트리로 대조 |

`doctor`가 특히 중요하다. P3의 공백을 직접 메우고 E3의 `MCCP_RECEIPT_DEBUG=1`을 오늘 당장 잡아낸다. 설계 제약은 하나: **mccp가 소유하지 않는 이름을 오류로 내지 않는다**(E3의 미등재 6건). 등급을 나눠야 한다 — 미등재 `MCCP_*`는 오류(레지스트리 누락), 그 외 이름은 무언(informational), 값 불일치는 경고.

이 처방이 1순위인 이유는 **새 파일도 새 선언원도 만들지 않기 때문**이다. 전부 호출 시점에 레지스트리에서 파생되므로 drift가 구조적으로 불가능하다. V2의 스키마도 이 CLI의 한 서브커맨드(`emit-schema`)로 나오는 것이 옳다.

**단, `doctor`가 검사하는 기준값은 레지스트리 `values`이므로 P18의 드리프트에 그대로 노출된다.** `MCCP_PLAN_REVIEW=off`를 넣은 운영자에게 오늘의 `doctor`는 "정상"을 보고한다 — `off`가 `values`에 있기 때문이다. 실제로는 Codex 리뷰가 켜져 있다. `doctor`는 드리프트를 **고치지 않고 상속한다.**

### V4 — 질문 C(setup 전량 시드)는 기각. 좁힌 형태만 조건부 채택

**전량 시드(active 75개 기본값을 `settings.json`에 적는다)는 하지 않는다.** 근거는 독립 5축이며 어느 하나만으로도 충분하다.

1. **업그레이드 고정** (E6) — 명시된 값은 기본값이 아니게 되어, 사용자가 고른 적 없는 값에 영구 고정된다.
2. **소유권 구분 불가** (E5) — JSON에 주석이 없어 "내가 시드한 것"과 "사용자가 정한 것"을 구별할 수 없고 두 경우의 올바른 처리가 정반대다.
3. **신호 파괴** (E7) — "적혀 있다 = 기본에서 벗어났다"라는 판독이 4줄에서 79줄로 묻힌다.
4. **우회 표면 근접화** (E8) — 게이트를 약화하는 3종을 상주 파일에 한 글자 편집 거리로 놓는다. 배치 규약(색인 §1)의 반대다.
5. **효력 시점 불일치** (E9) — 편집이 같은 세션에 반영되지 않으므로 편집을 유도할수록 함정을 더 자주 밟는다.

**채택하는 좁힌 형태** — P8의 발화 조건을 규칙으로 승격한다.

- `/mccp:setup`은 **기본값을 시드하지 않는다.** 시드는 *결정*에만 쓴다 — 사용자가 `AskUserQuestion`으로 고른 항목, 그리고 그 결과가 기본값과 다를 때만. 기본값과 같은 값을 쓰는 것은 언제나 no-op이어야 한다(그래야 2·3이 발생하지 않는다).
- 대신 setup은 **plumbing을 provision한다** — 정확히 `.gitignore`에 대해 하는 일과 같은 종류다(P9). 구체적으로 (a) 레지스트리에서 생성한 스키마 파일, (b) `.vscode/settings.json`의 `json.schemas` 연결(managed block 규약으로 자기 구간만). 둘 다 정책이 아니라 배관이라 소유권 모호성이 없고 언제 다시 써도 안전하다.
- 시드해야 할 후보가 있다면 그것은 기본값 75개가 아니라 **신규 설치가 실제로 결정해야 하는 소수**다(Codex 사용 여부 등 — 이미 P8이 그 1건을 다룬다). 이 목록을 늘리려면 각 항목마다 "이건 기본값 복제가 아니라 결정이다"를 논증해야 한다.

**정정 (2026-08-21) — V4의 목적 서술이 좁았다.** 위 5축은 *쓰기*가 만드는 문제이고, **묻기는 그 축을 하나도 건드리지 않는다.** `settings-writer.setEnv`는 `prior === next`면 `action:'noop'`이므로, 41개를 전부 물어도 사용자가 기본값을 고르는 한 파일에는 한 줄도 안 쓰인다. 따라서 정확한 문장은 이렇다.

> **setup은 값을 시드하지 않는다. 지식을 시드한다.**

시드 금지는 *쓰기*에 대한 규칙이고, 그 규칙을 지키면서도 전 토글을 안내할 수 있다. 이것이 V5다.

정리하면 사용자의 직관 — "setup이 넣어 주면 나중에 수정하기 쉽다" — 에서 **수정 용이성은 맞고 값 시드는 틀렸다.** 다만 그 직관의 진짜 내용은 값이 아니라 **인지**였고, 그건 V5가 쓰기 없이 준다.

### V5 — 주 작업은 단건 편집이 아니라 첫 실행 walkthrough다 (2026-08-21 추가)

운영자 관찰이 설계를 뒤집었다. **사용자는 환경변수를 찾아보지 않는다. 기본값으로 쓴다.** mccp 설계자 본인도 각 토글의 역할을 완전히 파악하지 못한 상태다. 따라서 단건 편집(`explain` + `set`)은 **이미 mccp에 익숙한 사용자에게만 유용한 설계**이고, 그 사용자는 존재하지 않거나 극소수다.

주 작업은 **첫 실행에서 하나씩 설명하며 값을 정하게 하는 것**이고, 그 산출물은 설정값이 아니라 **기억**이다. 나중에 "아 이런 걸 설정했던 것 같은데"가 떠올라야 수정하려는 의지가 생긴다. 기억이 없으면 그 뒤의 모든 표면(CLI · 스키마 · HTML)이 도달되지 않는다.

#### V5.1 — 계층은 레지스트리 선언 필드여야 한다

E12대로 41개는 완주 불가이고 계층은 `kind`에서 파생되지 않는다. 레지스트리에 필드를 추가한다.

```
onboarding: 'core' | 'advanced' | 'never'
```

- `core` — 첫 실행에서 묻는다. 목표 8~10개.
- `advanced` — 도메인 지정이나 `--all`에서 묻는다.
- `never` — bypass-flag 3 · override 사유 10 · `internal` · 튜닝 노브.

**lint가 강제해야 한다** — `status:'active'`인데 `onboarding`이 없으면 실패(fail-closed). 이것이 없으면 v1.35에서 새 core 토글이 추가돼도 walkthrough는 그것을 모르고 **조용히 낡는다.** env-contract가 존재하는 이유와 정확히 같은 실패 모드이고, 같은 처방(선언 하나 + 나머지는 투영 + drift는 lint)이 적용된다.

#### V5.2 — core tier (운영자 확정 2026-08-21, 9개)

`MCCP_RECEIPT_GATE_MODE` · `MCCP_GATE_ROUND_CAP` · `MCCP_PLAN_REVIEW` · `MCCP_REVIEW_SINGLE_PASS` · `MCCP_STOP_LOOP` · `MCCP_WORK_IMPLEMENT_PARALLEL` · `MCCP_AUTO_HANDOFF` · `MCCP_HOOK_PROFILE` · `MCCP_SUBSCRIPTION`

기준은 "이걸 모르면 나중에 게이트가 막히거나 비용이 튀었을 때 원인을 못 찾는가"다. Codex 사용 여부는 이미 setup Phase 4가 다룬다(P8).

**이 중 2개가 E13의 오교육 대상이다** — `MCCP_PLAN_REVIEW`(D1)와 `MCCP_HOOK_PROFILE`(D3). 둘의 `values`가 고쳐지기 전에는 walkthrough에 올릴 수 없다.

#### V5.3 — 기본 경로는 결정이 0이어야 한다

각 질문의 첫 선택지는 **"기본값 유지 (Recommended)"**이고 `description`이 그 기본값의 의미를 한 줄로 말한다(레지스트리 `summary`가 이미 그 문장이다). 엔터 연타로 끝나고, **그래도 기억은 남는다.**

리마인드의 기제는 결정이 아니라 **읽음**이다. 결정을 강요하면 피로 → 스킵 → 기억 없음으로 간다. walkthrough의 성공 지표는 **완주율**이지 설정 변경 건수가 아니다.

#### V5.4 — 무엇을 물었는지의 기록은 mccp 소유 state다

`.claude/state/env-onboarding.json`에 `{asked:[names], plugin_version, at}`.

**E5에서 기각한 manifest와 다르다.** 그것은 사용자 *값*의 그림자여서 settings.json과 어긋날 수 있었다. 이것은 mccp가 사용자와 나눈 **대화의 기록**이고 값을 담지 않으므로 어긋날 대상이 없다. 값의 유일 소유자는 여전히 settings.json이다.

세 가지가 이 기록에 달려 있다.

- **중단·재개** — walkthrough는 높은 확률로 중단된다. 재개가 없으면 처음부터 다시이고, 그러면 두 번째 시도도 안 한다. 옵션이 아니라 필수다.
- **증분 안내** — 다음 버전에서 core가 늘면 "새 설정 N개"를 먼저 보여준다. 이것이 walkthrough의 **지속 가치**다. 첫 실행 1회짜리로 끝나면 투자 회수가 안 된다.
- **사용자가 말한 그 순간에 답하기** — 무엇을 물었고 무엇을 골랐고 지금 값이 무엇인지.

### V6 — 명령 표면: `/mccp:config` 무인자 · 매체 분담 (2026-08-21 추가)

#### V6.1 — 이름은 `/mccp:config`

Claude Code가 `/config`로 `settings.json`을 편집한다. **그 쌍을 그대로 미러링하는 것이 직관성 최대치**다 — 명령은 `config`, 파일은 `settings.json`. namespace가 있으므로 `/config` 옆에 서는 것이 혼동이 아니라 대응으로 읽힌다. P17의 alias 선례가 있으니 `/mccp:settings`를 verbatim alias로 함께 두는 비용은 파일 하나다.

#### V6.2 — 무인자 동작이 상태로 분기한다

플래그 없이 옳은 일을 한다. 이것이 P16의 "있는지도 모르는 옵션" 문제를 구조적으로 없앤다.

| 상태 | 동작 |
|---|---|
| 온보딩 기록 없음 | walkthrough (core 9) |
| 기록 있고 새 core 토글 있음 | "새 설정 N개" 먼저, 그 다음 요약 |
| 그 외 | 비기본값 목록 + `doctor` 결과 + 전체 보기 제안 |

`--all` · `--domain <name>` · `<NAME>`은 전부 선택이다.

**setup과의 관계**: setup Phase가 walkthrough를 *호출*하되 본문 소유는 `/mccp:config`가 한다. 두 곳이 각자 본문을 가지면 갈라진다 — env-contract가 없앤 그 실패다.

#### V6.3 — 매체 분담: walkthrough는 터미널, 훑어보기는 전용 HTML

브라우저는 walkthrough에 맞지 않는다. walkthrough는 순차적·설명 중심이고 무엇보다 **대화 흐름 안에** 있어야 한다 — setup 도중 브라우저를 열면 흐름이 끊기고 사용자는 탭을 닫고 돌아오지 않는다. `AskUserQuestion`은 터미널 네이티브 picker라 이 작업에 정확히 맞는다.

브라우저의 강점은 훑어보기이고, 사용자가 "리마인드된 다음 수정하려는 의지가 생기는" 그 시점에 필요한 것이 정확히 훑어보기다.

| 작업 | 매체 |
|---|---|
| walkthrough (첫 실행, 기억 형성) | 터미널 `AskUserQuestion` |
| 훑어보기 ("뭐 있었더라") | 전용 HTML |
| 단건 변경 | `/mccp:config <NAME>` 또는 에디터 자동완성 |

#### V6.4 — 전용 HTML은 dashboard에 묶지 않고 read-only로 시작

E11대로 dashboard 패널로 얹으면 도달 경로가 발견성 실패를 상속한다. `.claude/cache/env.html`을 **정적 생성**해 `file://`로 연다 — 서버도 포트도 nonce도 없으므로 **보안 표면이 0**이다. `renderer/`의 CSS 토큰·테마·레이아웃은 재사용하되 dashboard 패널이 아니다.

각 행에 현재값·기본값·허용값·값별 의미·상세 링크 + JSON 스니펫 복사. 값 변경은 `/mccp:config`나 스키마 자동완성이 담당한다. write-back은 필요가 실증되면 그때 `--write` 보안 체인을 재사용하되 **bypass-flag 3종은 절대 올리지 않는다**(E8 — 게이트 해제가 클릭 하나가 된다).

### 권장 순서 (2026-08-21 개정)

E13이 순서를 **의존으로** 만들었다. 아래 1은 선호가 아니라 전제조건이다.

| 단계 | 무엇 | 왜 이 순서 |
|---|---|---|
| 0 | **자매 조사 P0** — `values` ↔ 코드 어휘 대조 lint(L10) + D1~D9 수정 | **E13.** 이것 없이 walkthrough를 켜면 오교육 장치가 된다. `doctor`도 드리프트를 상속한다 |
| 1 | `env-contract` CLI — `list` · `explain` · `doctor` | 새 파일 0개. 나머지 전부의 토대 |
| 2 | 레지스트리 `onboarding` 필드 + lint 강제 + core 9 지정 | walkthrough가 낡지 않게 만드는 유일한 구조적 장치 |
| 3 | `/mccp:config` — walkthrough + 무인자 분기 + 온보딩 기록 | 사용자가 실제로 하는 작업. setup이 호출 |
| 4 | `emit-schema` + 생성물·레지스트리 일치 lint | 에디터를 GUI로. 손으로 쓴 스키마 경로를 차단 |
| 5 | 전용 HTML (read-only) + setup의 배관 provision | 훑어보기 매체. 보안 표면 0 |
| 6 | (선택) `doctor` 게이트 편입 · HTML write-back | **본 조사의 범위 밖.** 별도 판정 필요 |

## Open Questions

- **Claude Code가 `settings.json`을 `$schema`로 실제 검증하는가, 아니면 에디터 전용 affordance인가.** V2는 후자를 전제한다. 반증 방법: `env`에 스키마 위반 값을 넣고 Claude Code를 재기동해 경고 유무를 관찰. 전자로 밝혀지면 V2의 제약 3(배타성)이 훨씬 무거워진다.
- **Claude Code의 `env` 병합이 계층 간 deep merge인가 shallow replace인가.** mccp 자체 헬퍼는 shallow이고 스스로 canonical이 아니라고 밝힌다(P10). shallow라면 "user에 공통, project에 프로젝트별"이라는 배치가 user 쪽을 통째로 날린다. 현재 설치로는 판별 불가(user env 1키가 project env에도 있어 판별자가 없다). 반증 방법: user에만 있는 더미 키를 넣고 project `env`가 있는 상태에서 `process.env` 도달 여부 확인.
- **`doctor`의 미등재 `MCCP_*` 처리 등급.** 오류로 두면 신규 토글 개발 중에 계속 붉어지고, 무언으로 두면 레지스트리 누락(lint L1이 잡는 바로 그것)을 운영자 쪽에서 놓친다. L1이 이미 코드 표면을 덮으므로 `doctor`는 경고면 충분하다는 것이 잠정 입장이나 확정하지 않았다.
- **CLAUDE.md §3.12의 "표준 설치" 전제.** `MCCP_CODEX_DISABLED=1`이 사용자 settings.json에 있다는 서술이 이 설치에서 성립하지 않는다(Precedent 마지막 행). 그 문장을 근거로 삼는 다른 판정이 있는지 확인이 필요하다 — 본 조사의 결론에는 영향이 없다.
- **`undocumented-default` 58건(P1).** 전체 161개 중 3분의 1이 정적 default 리터럴 없이 소비처가 값을 정한다. `explain`은 이들에 대해 무엇을 출력해야 하는가 — "기본값 없음"은 정직하지만 운영자에게 쓸모가 적다. 소비처의 inline default를 evidence line에서 읽어 오는 것은 `evidence`의 정의(read site이지 default 리터럴이 아니다 — P1 헤더)와 충돌한다. 별도 축이다.

### 2026-08-21 추가

- **walkthrough 완주율이 미측정이다.** core 9개여도 `AskUserQuestion` 4문항 상한 때문에 최소 3회 호출이다. 그 피로가 실제로 어떤지는 돌려 봐야 안다. 측정 전까지 core 9는 상한 가설이지 검증값이 아니며, 낮으면 대응은 tier 축소가 아니라 **질문 묶음 재설계**(도메인 1회당 4문항)일 수 있다.
- **`MCCP_PLAN_REVIEW=off`를 만들 것인가 값 목록에서 뺄 것인가** — 자매 조사의 Open Question이지만 **walkthrough가 그 결정을 강제한다.** core tier에 있는 이상 선택지 목록이 확정돼야 하고, `off`가 없으면 "리뷰를 끄고 싶다"는 운영자에게 walkthrough가 줄 답이 없다. `MCCP_REVIEW_SINGLE_PASS`(1회 통과)와 의미가 겹치지 않으므로 대체재가 아니다.
- **전용 HTML의 read-only가 충분한지 미검증.** 훑어보다 바꾸고 싶어질 때 `/mccp:config`로 돌아가는 왕복이 거슬릴 수 있다. 실사용 후 판단할 문제이나, 먼저 write를 붙이면 되돌리기 어렵다.
- **`onboarding` 필드의 lint 강제 시점.** 기존 75개 active 항목에 값을 채우기 전에 검사를 켜면 즉시 red다. 자매 조사의 P0(L10)와 같은 문제이고, 같은 해법(먼저 채우고 켠다)이 적용되지만 **누가 `advanced`와 `never`를 판정하는가**는 정해지지 않았다. 기계적 초기값(bypass-flag·override 사유·`internal` → `never`)으로 절반은 덮이나 나머지는 판단이다.
- **`MCCP_WORK_IMPLEMENT_PARALLEL`의 셸/JS 이원 소비.** `work.md:200`의 `PARALLEL="${…:-1}"`와 `implement-dispatch/budget.js:120`의 `ENV_MODE`가 둘 다 이 이름을 읽는다. 자매 조사 E3이 `MCCP_WORK_ISOLATE_IMPLEMENT`에서 실측한 preview/live 분기와 같은 형태일 수 있으나 **본 조사에서 확인하지 않았다.** core tier 항목이므로 walkthrough 전에 확인이 필요하다.
