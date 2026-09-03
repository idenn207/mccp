# M2 — suite-green

> **범위**: ci-full-suite PRD milestone 2. M1이 남긴 red 16파일을 6갈래로 분해해 각각의
> 실제 원인을 닫는다. 목표치를 적지 않고 관측값과 그로부터 따라오는 제약만 적는다(UI5).
> 이 milestone은 벽시계를 축으로 삼지 않는다 — 그 축은 M1 실측(Linux 75.5초)으로 이미
> 충족됐고, 운영자가 2026-09-02에 축을 green화로 재지정했다. 그런데 green화가 벽시계를
> **부수효과로** 크게 줄였다(§4 참조). 그것은 목표가 아니었고 지금도 목표가 아니다.

## 1. 무엇이 뒤집혔는가 — 갈래 H는 러너 오염이 아니었다

M2 계획은 갈래 H(harness 오염)를 이렇게 귀속했다:

> `run.js`가 저장소 루트를 cwd로 자식을 띄우므로 test가 저장소의 *살아있는* 게이트
> 상태(round 원장 · 정책 seal)를 읽는다.

**이 귀속은 틀렸다.** 반증은 한 줄이다 — 해당 파일들을 러너 없이 `node --test`로 직접
돌려도 똑같이 실패한다. 러너는 이 갈래에 관여하지 않는다.

실제 원인은 **소비처가 이미 격리 시임을 갖고 있는데 test가 그것을 쓰지 않은 것**이다:

| 소비처 | 시임 | 상태 |
|---|---|---|
| `codex-invoke.js` `resolveDisabledPolicy` · `resolveRoundBudget` | `opts.gitDir` | 존재했다. 주석: "so tests can point at a scratch repo without chdir" |
| `plan-review/cli.js` `resolveRoundBudget` | 없었다 | `--repo-root`를 받아 다른 모든 경로에 쓰면서 라운드 캡 초크포인트만 `process.cwd()`를 읽었다 |

`codex-invoke.test.js`는 자기 파일 안에 이미 규약을 적어 두었다 — "Any NEW case asserting a
NON-disabled outcome must pin gitDir the same way." 그 뒤에 추가된 test들이 그 규약을
따르지 않았다. **계약은 있었고 준수가 없었다.**

그리고 이 저장소는 게이트 자체를 개발하므로 로컬에 신선한 봉인이 상시 존재하고, CI는
fresh checkout이라 존재하지 않는다. 그래서 같은 결함이 "Windows 전용 실패"로 보였다.

## 2. 갈래별 판정

| 갈래 | 파일 | 판정 | 수리 지점 |
|---|---|---|---|
| H | `codex-invoke.test.js` · `codex-invoke-json.test.js` | 수리 | test가 `gitDir: null`을 핀 (파일 자신의 규약) |
| H | `plan-review-cli-emit.test.js` | 수리 | `plan-review/cli.js`에 프로그래매틱 `gitDir` 시임 추가 |
| H? | `validate-cmd-intent-gate.test.js` | 해소 — 현재 green (17/17). M1 관측 재현 안 됨 | 없음 |
| P | `history-leak-scan.test.js` F4 | **가드** | 단언이 드라이브 문자 루트에서만 참 |
| P | `dispatch-controller.test.js` | **수리** | 주장("no real fs")과 구현(heartbeat mkdir)의 불일치 |
| P | `goal-phase-lock.test.js` S14 | **수리** | mkdir 실패 술어가 substring이라 POSIX 임시 경로 전체에 걸렸다 |
| P | `derive/tests/mask.test.js` | 미판정 — 진단 강화 | Windows 재현 불가. 어느 필드가 새는지 좌표를 내게 함 |
| P | `santa-loop-cap.test.js` DD3 | 미판정 | Linux 전용. DD9와 값이 뒤바뀐 관측이라 F 가능성 |
| C | `instruction-contract.test.js` | 수리 | `fetch-depth: 0` — shallow checkout에 before-ref가 없다 |
| D | `codex-reachability.test.js` | 수리 | 15번째 분류 + 새 kind `budget-spent` |
| D | `meta-research.test.js` | 수리 | 실제 메타 문서의 L3 위반 15건 |
| F | `dispatch-fullcycle-smoke.test.js` · `review-verdict-corpus-hash.test.js` | 로컬 4회 **전부 green** — Linux 대기 | §5c |
| R | `validate-cmd.test.js` · `review-single-pass-fields.test.js` | 로컬 4회 **전부 green** — Linux 대기 | §5c |
| F(신규) | `hooks/tests/post-edit-format-md.test.js` | **flaky 확정** (4회 중 1회 red, 격리 3/3 green). 격리하지 않음 | §5b |

### 2a. 가드인가 수리인가

계획이 정한 기준을 그대로 썼다: **단언이 특정 플랫폼에서만 참이면 가드, 코드가 플랫폼을
잘못 다루면 수리.** 적용하면 갈래 P 5건 중 가드는 **1건뿐**이다.

`history-leak-scan.test.js`가 그 하나다. 스캐너가 repo-root 패턴을 case-insensitive로
컴파일하는 것은 드라이브 문자 루트일 때만이고, 그것은 오버매칭 회피를 위한 의도된
비대칭이다(소스 주석이 그렇게 적었다). POSIX에서 그 단언은 참이 아니다. 기존 가드
`if (variant === root) return;`은 그 성질의 **틀린 프록시**였다 — `fs.mkdtempSync`의 6자
난수에 대문자가 하나만 섞여도 POSIX에서 가드가 열린다.

나머지 2건은 수리였고 둘 다 **주장과 구현의 불일치**였다. 플랫폼 차이가 아니라, 한쪽
플랫폼이 우연히 관대해서 드러나지 않았을 뿐이다.

### 2b. `dispatch-controller.test.js` — "no real fs"는 거짓이었고 대가가 있었다

이 test는 제목으로 "no real fs"를 주장하고 `envelopeWrite` DI로 envelope 쓰기를 가로챈다.
그러나 그 뒤 `writeHeartbeat`가 `fs.mkdirSync(dir, {recursive:true})`를 그대로 돌린다.
`parentCwd`가 `/synthetic/repo`이므로 Linux에서는 EACCES로 터졌고, Windows에서는 현재
드라이브 루트로 해석돼 **조용히 생성됐다**.

실측: 이 개발 머신의 드라이브 루트 `synthetic/` 아래에서 **204개의 heartbeat 파일**이
발견됐다. 전부 이 test가 여러 실행에 걸쳐 흘린 것이었다(비-heartbeat 파일 0건). 정리했다.

수리는 이미 존재하던 별도 축의 opt-out(`skipHeartbeat`)을 켜는 것이고, 그 위에 **생성
여부를 단언**했다 — 제목의 주장을 산문이 아니라 기계가 지키게 했다.

## 3. 갈래 H 검증은 봉인이 디스크에 존재하는 상태에서 통과했다

계획이 명시한 수용 조건이다 — "seal을 지워서 통과시키지 않는다. 지우면 무엇이 고쳐졌는지
알 수 없다."

```
$ ls "$(git rev-parse --git-path mccp/tmp)" | grep -E "seal|policy"
codex-policy.json
review-rounds-seal.json

$ MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
    plugins/mccp/scripts/lib/tests/codex-invoke.test.js \
    plugins/mccp/scripts/lib/tests/codex-invoke-json.test.js \
    plugins/mccp/scripts/lib/tests/plan-review-cli-emit.test.js \
    plugins/mccp/scripts/receipt/tests/validate-cmd-intent-gate.test.js \
    plugins/mccp/scripts/lib/tests/codex-reachability.test.js
pass 88 · fail 0 · skipped 0
```

봉인은 이 게이트 실행이 Phase 2.5.0에서 직접 쓴 것이고(`cap=1 pinned-by=codex-disabled`),
그 봉인이 살아있는 채로 통과했다.

### 3a. 음성 통제 — 시임이 캡 강제를 끄지 않았다

`gitDir` 시임을 추가하면 그것으로 캡을 우회할 수 있는지가 즉시 문제가 된다. 그래서
**CLI 플래그를 만들지 않았다** — `opts`는 `runCli(argv, opts)`의 두 번째 인자이고 argv에서
조립되지 않으므로 셸 호출자가 닿을 수 없다(§3.13의 "intent 결정은 CLI 표면을 갖지 않는다"와
같은 논거).

`--repo-root`를 따르게 하는 안은 **기각했다**: `resolveGitDir`는 위로 걸어 올라가므로
저장소의 부모를 넘기면 plan은 여전히 contained이면서 git dir을 못 찾아 `canRecord:false`
→ inert가 되어 캡이 조용히 우회된다.

실행으로 확인:

```
(a) ambient gitDir  -> 12  BLOCKED (cap still enforced)
(b) gitDir:null     ->  0  allowed (test isolation works)
```

## 4. 러너의 codex 정책 (UI2) — 그리고 예상하지 못한 벽시계 효과

`childEnv`가 자식에게 `MCCP_CODEX_DISABLED=1`을 **기본 강제**하고 `--allow-codex`로만
해제된다. 근거는 CLAUDE.md §3.4이고 그 대가는 M1 §11이 실측했다 — 중단된 재측정에서
orphan node 289개(codex broker 146+143)가 쌓여 셸이 `fork: Resource temporarily
unavailable`에 도달했다.

**측정되지 않았던 것은 그 정책이 벽시계에 미치는 영향이다.** 같은 머신 · 같은 Node에서:

| 원소 | 플랫폼 | Node | 벽시계 | red 파일 | codex |
|---|---|---|---|---|---|
| `local` (M1) | win32 | v24.19.0 | 1,883초 (31.4분) | 8 | 상속(활성) |
| `local-m2-r1..r4` | win32 | v24.19.0 | **372~453초 (6.2~7.6분)** | **0~1** | 강제 비활성 |

**4.2~5.1배**다. shard 0개로. M1이 "벽시계는 스위트가 아니라 플랫폼의 성질"이라 적었고 그
결론은 여전히 Linux 대비로는 유효하지만, Windows 31.4분의 상당 부분은 플랫폼도 스위트도
아니라 **자식들이 실제 Codex를 호출하고 있었던 것**이다.

이 수치는 **목표 달성 주장이 아니다.** 두 원소는 같은 커밋이 아니고(M2가 red를 고쳤다)
red가 줄면 실패 경로의 재시도·타임아웃도 함께 사라지므로 4.2~5.1배 전부를 codex 정책에
귀속할 수 없다. 분리 측정은 하지 않았다 — `--allow-codex`로 한 번 더 돌리면 얻을 수
있지만 그것은 이 milestone의 축이 아니고, M1 §11이 실측한 orphan 폭주 위험을 다시 여는
일이다. **관측만 기록하고 귀속은 하지 않는다.**

### 4a. `MCCP_ROUND_LEDGER`는 싣지 않는다

계획 Task 1 Action 2가 그것을 지시했으나 세 리뷰 관점(architect · security · invariant)이
각각 독립적으로 반증했고, 실독으로 확인했다:

- `review-rounds/seal.js:207-213`이 **봉인 우선 · env fallback**을 의도로 명시한다.
  봉인이 존재하면(= 계획 자신의 Validate가 요구하는 바로 그 상태) 자식 env는 판정에
  도달하지 않는다. 즉 Action 2와 그 Validate는 **서로 만족 불가**였다.
- `round-cap-command-body.test.js:209-212`가 "이 변수는 운영자 정책이지 게이트 상태가
  아니므로 어떤 게이트도 대입하지 않는다"를 단언한다. 그 test는 `commands/*.md`만
  스캔하므로 러너를 보지 못한다 — 러너가 대입하면 **그 test가 볼 수 없는 곳에서**
  불변식이 깨진다.

그래서 `scripts/tests/test-suite.test.js` `(12c)`가 그 불변식을 러너 축에서 단언한다.
강제 목록에 그 이름이 들어오는 순간 red가 된다.

### 4b. `MCCP_SUITE_REPO_ROOT`는 유지한다

계획은 소비처가 0건이라 적었으나 실측은 반대다 — `scripts/test-suite/reporter.mjs:223`이
repo-relative 산출의 기준점으로 읽는다. `--include=*.js` grep이 `.mjs`를 놓친 결과였고,
제거했다면 redaction/attribution 경로가 조용히 깨졌을 것이다. `(12d)`가 그 소비를 고정한다.

### 4c. 원소가 자기 codex 조건을 들고 다닌다 — 그리고 앞선 4개는 들고 있지 않다

`runOnce`가 원소에 `codex_allowed`(boolean)를 싣는다. 기계 소비처는 없고 **사람이 읽는
provenance**다 — 벽시계도 red 집합도 이 조건에서만 의미를 가지므로, 그 표시 없이 두
원소를 나란히 놓으면 위 표 같은 비교가 조용히 틀린다.

**그 표시는 M2 이후 원소에만 있다.** 컨테이너의 앞선 5개(`local` · `ci-node20` ·
`ci-node20-r2` · `ci-node24` · `ci-node24-r2`)는 필드가 생기기 전에 측정돼 키 자체가
없다. 즉 `codex_allowed`의 부재는 "비활성"이 아니라 **"기록되지 않음"** 이고, 위 표가
`local` 행에 "상속(활성)"이라 적을 수 있는 근거는 컨테이너가 아니라 M1 §11의 orphan
실측이다. CI 4개 원소의 codex 조건은 이 문서가 주장하지 않는다 — workflow가
`--allow-codex`를 배선하지 않으므로 M3 이후의 재측정은 강제 비활성이겠지만, **이미
기록된 4개에 대해 그것을 소급 주장할 근거는 없다.**

한 가지가 이 필드로도 안 닫힌다: 실제 companion을 부르는 유일한 smoke test
(`codex-companion-smoke.test.js`)는 강제 비활성 하에서 항상 skip이므로, 새 분류
`round-cap-reached` → `budget-spent` 매핑은 §6의 enum 표 test로만 검증되고 e2e로는
한 번도 실행되지 않는다. 그 커버리지 분모 축은 backlog에 등재돼 M3 소유다.

## 5. 반복 측정 (Metric 3 프로토콜)

신규 기제를 만들지 않고 M1의 `--merge-into <container> --label <axis>-r{1,2,3}`을 그대로
썼다. 판정 규칙: **실패 집합이 회차마다 변하면 flaky, 항상 같으면 상시 red.**

| 원소 | 벽시계 | ok | attribution | redaction_ok | red 파일 |
|---|---|---|---|---|---|
| `local-m2-r1` | 382초 | true | complete | true | 1 — `env-contract/tests/evidence-debt.test.js` |
| `local-m2-r2` | 372초 | true | complete | true | **0** |
| `local-m2-r3` | 431초 | true | complete | true | 1 — `hooks/tests/post-edit-format-md.test.js` |
| `local-m2-r4` | 453초 | true | complete | true | **0** |

네 원소 전부 `ok:true` · `attribution:complete` · `redaction_ok:true`다.

### 5a. r1은 다른 트리다 — 그리고 그 red는 이 milestone이 만든 것이었다

r1의 유일한 red는 **자기 유발 drift**였다. `plan-review/cli.js`에 줄을 삽입해 registry의
evidence 앵커(`:699`)가 실제 read site(`:715`)에서 밀렸고 L10 정방향이 그것을 잡았다.
게이트가 자기 변경을 잡은 것이므로 결함이 아니라 계약이 작동한 사례다. 앵커를 갱신해
닫았고, 그래서 **r1과 r2 이후는 같은 트리가 아니다.** 동일-커밋 비교는 r2·r3·r4다.

### 5b. 판정 — flaky 1건, 상시 red 0건, 그리고 수용 기준은 충족되지 않았다

r2·r3·r4의 실패 집합은 `{}` · `{post-edit-format-md}` · `{}` 로 **변한다.** 규칙대로
`post-edit-format-md.test.js`는 **flaky**다. 격리 실행은 3/3 green이고, 이 test는 모든
의존성을 주입받아 spawn도 PATH 접촉도 없다(`runMdBranch`에 CLI 러너를 주입한다). 즉
파일 자체의 결함 근거가 없고 전수 부하 하에서만 관측된다.

**그런데 원인을 귀속할 수 없다.** 컨테이너의 `failing[].error`가 `"test failed"` 한 줄이기
때문이다 — reporter가 `nesting !== 0` 이벤트를 버리므로(그 필터는 M1의 `data.file` 귀속
불변식이 서 있는 바닥이다) 어느 단언이 깨졌는지가 산출에 남지 않는다. red 분류가 이
milestone의 목적이므로 이 공백은 정확히 그 목적을 제한한다. 별도 축으로 backlog에 등재했다.

**격리하지 않았다.** UI4는 재현되지 않는 실패를 사유와 함께 명시 격리하라고 하지만, 4회 중
3회 green이고 격리 실행이 3/3 green인 파일을 `--exclude-from`에 올리면 실재하는 커버리지를
아무 대가 없이 버리는 것이다. 계획 자신의 Risk 행이 "격리 목록이 고치지 않기 위한 통로가
된다"를 위험으로 적었고, 이것이 그 통로의 첫 후보였다. 관측만 기록한다.

**따라서 계획의 Acceptance 2번("3원소의 `failing` 파일 집합이 **동일**하고, 비었거나 전부
`exclusions`에 등재")은 로컬 축에서 충족되지 않았다.** 충족된 것은 1번(3원소 이상이
ok/attribution/redaction 3조건 통과)과 3번(갈래 H 검증이 봉인 존재 하 통과)이다. 이것을
green으로 반올림하지 않는다 — 반올림하면 이 milestone이 만들려던 신호가 사라진다.

### 5c. Linux 3회는 CI에서 얻는다 (미완)

로컬 4회는 같은 머신에서 순차로 돌렸다(병렬 아님 — M1 §11이 경합 오염을 실측했다).
Linux 3회는 `test-suite-baseline.yml`을 dispatch해 artifact를 `--merge-into`로 병합해야
하며, 그것은 브랜치가 원격에 올라간 뒤에 가능하다.

**미판정으로 남은 것들이 그 Linux 3회에 달려 있다** — 갈래 F 2건
(`dispatch-fullcycle-smoke` · `review-verdict-corpus-hash`) · 갈래 R 2건
(`validate-cmd` · `review-single-pass-fields`) · 갈래 P 2건(`mask` · `santa-loop-cap` DD3).
로컬 4회에서 이 6건은 **한 번도 실패하지 않았다**(갈래 R 2건은 M1의 Windows red 목록에
있었으므로, `MCCP_CODEX_DISABLED=1` 강제가 부하를 줄인 것이 유력한 설명이지만 분리
측정을 하지 않았으므로 귀속하지 않는다). 3회 뒤에도 남으면 삭제가 아니라 사유를 붙여
`--exclude-from`으로 명시 격리하고 티켓을 단다(UI4).

## 6. `round-cap-reached`에는 정직한 kind가 없었다

`codex-invoke.js`는 v1.33.5에 15번째 분류를 넣었는데 `codex-reachability.js`는 14에 멈춰
있었다. 모르는 값은 fail-closed 대체 경로(`transport` + "unknown classification")로
떨어지므로 **안전하긴 했으나 사유가 거짓**이었다 — 예산 소진을 "도달하지 못함"으로 보고했다.

기존 5종 중 어디에 넣어도 거짓이 된다:

| 후보 kind | 그 kind의 사유 문자열 | 왜 거짓인가 |
|---|---|---|
| `env-policy` | "MCCP_CODEX_DISABLED=1" | 그 env와 무관하다 |
| `transport` | "could not be reached or produced no usable response" | 도달 실패가 아니라 의도적 미질의다 |
| `not-installed` · `unauthenticated` | — | 설치·인증과 무관 |
| `reached` | "the companion answered" | 답한 적이 없다 |

그래서 **새 kind `budget-spent`**를 만들었다. CLAUDE.md §3.3이 `disabled`와
`round-cap-reached`를 "서로 다른 축"이라 못박았고, 같은 버킷에 넣으면 오라클이 그 구분을
지운다. `reachable`은 여전히 `ok` 하나뿐이다(단일 도달 불변식 보존).

같은 drift가 `codex-invoke-json.test.js`에도 있었다 — 하드코딩된 14종 집합이 정상 분류를
"unexpected classification"으로 보고했다. 그 목록을 손으로 쓰지 않고 오라클에서 파생하게
바꿨다. 그리고 `codex-reachability.test.js`의 `14` 리터럴 **3곳**을 상수 하나로 모았다 —
셋이던 것이 enum이 늘 때 하나가 누락된 이유였다.

## 7. 이 문서가 주장하지 않는 것

- **Windows runner를 matrix에 넣을지 답하지 않는다.** M1 §6의 근거는 약해졌지만
  ([m1-baseline.md](m1-baseline.md) §6a) 그 판단은 M3 소유다(UI6 · OQ3).
- **커버리지가 100%라고 주장하지 않는다.** 이 milestone은 분모를 정하지 않는다(OQ4는 M3).
- **벽시계 4.2~5.1배 단축을 성과로 주장하지 않는다.** §4의 두 원소는 같은 커밋이 아니므로
  귀속이 불가능하다. 관측만 기록한다.
- **`MCCP_CODEX_DISABLED=1` 기본 강제가 공짜라고 주장하지 않는다.** 실제 companion을 부르는
  유일한 smoke test(`codex-companion-smoke.test.js`)가 전수 러너 경로에서 항상 skip으로
  접힌다. 그 파일에 대해 전수는 "실행됐다"만 주장하고 "단언이 돌았다"는 주장하지 못한다 —
  PRD 축 D가 겨냥한 허위 커버리지 형태다. `--allow-codex`가 해제 경로이고, 커버리지 분모
  축은 M3로 이연했다(backlog 등재).
- **cross-model 반증을 받지 않았다.** 이 사이클의 Implement-Codex는 운영자 정책
  (`MCCP_CODEX_DISABLED=1`)으로 발화하지 않았다. 반증은 plan 단계 L2 패널(4관점,
  verdict=divergent)과 security-reviewer가 제공했고, Codex 축의 회수 지점은 `/mccp:pr`이다.
- **스위트가 green이라고 주장하지 않는다.** Windows 로컬이 red 1 → 0으로 향했을 뿐이고,
  Linux 3회가 아직 없다. §5a가 남은 것을 명시한다.
