# Arbiter separation — 무엇이 증명이고 무엇이 기록인가

> codex-intent-context M2 (v1.23.10). 근거 문서 — DD1·DD4·DD5.
> 운용 방법은 [CLAUDE.md §3.13.2](../../CLAUDE.md), 토글은 [ENVIRONMENT.md](../ENVIRONMENT.md) 참조.

## 이 milestone이 강제하는 명제

**정상 운용에서 plan을 작성한 세션이 그 plan에 대한 intent 판정을 겸하지 않는다.**

그것뿐이다. 아래는 M2가 **주장하지 않는** 것들이며, 하나씩 왜 주장할 수 없는지 적는다.

| 주장하지 않는 것 | 왜 |
|---|---|
| 심판이 옳아진다 | 분리는 판단력을 높이지 않는다. 저자의 근거를 볼 수 없게 만들 뿐이다 |
| 위조를 막는다 | 같은 권한으로 Node를 실행할 수 있는 주체는 receipt를 직접 봉인할 수 있다(backlog 2026-08-09 MEDIUM). 어떤 필드도 그 주체 앞에서 증명이 되지 못한다 |
| subagent가 실제로 발화했음을 증명한다 | runner는 파일을 **누가** 썼는지 관측할 수 없다. 봉인되는 것은 요구된 모드와 관측된 강등이다 |
| 기본 모드에서 게이트가 발화한다 | `MCCP_PLAN_REVIEW` 미설정 → `multi-agent` → intent 축은 *만족*이 아니라 *skip*된다(아래 잔여 참조) |

## DD1 — "안 알려준다"에서 "열 수 없다"로

초안의 설계는 arbiter에게 `Read`를 주고 awaiting 아티팩트 하나만 읽게 하는 것이었다. 근거는 "그 파일에는 저자 정당화가 없다"였고, **그 근거는 거짓이었다**.

`plugins/mccp/scripts/lib/plan-codex-runner.js`가 awaiting 아티팩트에 `plan_path`를 싣는다. `Read`를 가진 arbiter는 거기서 경로를 꺼내 plan을 열고 `## Design Decisions`를 그대로 읽는다. 필드를 지워 막는 것도 부족하다 — 경로를 몰라도 `Read`가 있는 한 추측이 가능하고, 무엇보다 **runner에 새 필드가 추가될 때마다 같은 누출이 다시 열린다.**

그래서 통제를 프롬프트 문구에서 **능력 부재**로 옮겼다.

- `plugins/mccp/agents/intent-arbiter.md`의 `tools`는 `[Write]` 하나다. `Read`·`Grep`·`Glob`·`Bash`·`Edit` 부재가 저장소 탐색 불가를 **레지스트리로** 보장한다(`agents/review-architect.md`의 read-only 보장과 같은 형태, 방향만 반대).
- 판정에 필요한 것은 `buildArbiterProjection`이 whitelist로 뽑아 프롬프트에 인라인한다.

**whitelist인 것이 핵심이다.** blacklist(=빼야 할 키 목록)였다면 runner가 필드를 추가하는 순간 그것이 자동으로 arbiter에게 흘러간다. whitelist는 반대로, 누군가 `intent-arbiter.js`를 직접 고치지 않는 한 새 필드가 도달하지 못한다. 같은 이유로 whitelist는 최상위뿐 아니라 **항목 안쪽**(`findings[]` · `intent_items[]`)에도 걸린다 — 최상위만 검사하면 구현이 awaiting의 항목을 통째로 복사해도 test가 통과한다.

### 인정하는 잔여 2건

1. **`finding` 본문은 필터하지 않는다.** 그것이 arbiter가 판정해야 할 대상이기 때문이다. 리뷰어가 자기 finding에 plan을 인용했다면 그것은 리뷰의 일부이지 우회 채널이 아니다. 다만 그 표면은 test의 경로-누출 정규식이 관측한다.
2. **데이터가 저자 세션을 경유한다.** 저자가 투영을 조작할 수 있다. 그러나 (a) finding 조작은 M1의 `finding_digest` 대조에서 죽고, (b) `intent_items` 조작은 새 구멍이 아니다 — `## User Intent` 표는 애초에 저자가 쓴다. 남는 것은 단일 신뢰 사용자 위협모델이 이미 범위 밖으로 둔 축이며, M2가 겨냥하는 것은 적대적 저자가 아니라 **anchoring과 sycophancy**다.

## DD4 — 봉인 2필드는 기록이지 증명이 아니다

`meta.intent_arbiter` · `meta.intent_arbiter_degraded_reason`.

runner는 adjudication 파일을 누가 썼는지 알 수 없다. 그래서 `intent_arbiter='subagent'`가 뜻하는 것은 **"이 실행은 분리된 심판을 요구했고 강등을 관측하지 않았다"** 이지 그 이상이 아니다. `intent_mislabel_mode`와 같은 성질·같은 이유다.

두 필드는 **`receipt_hash` 봉인 대상이며 carve-out을 만들지 않는다.** 감사 필드를 hash 밖에 두면 서명되지 않은 필드가 되고, `validate-cmd`의 receipt-tamper 검사가 그 편집을 그대로 지나친다. carve-out은 briefing·completion-ledger 진단 2건뿐이고 그 둘은 hash 계산 이후에 stamp되는 성질 때문이지 감사 가치가 낮아서가 아니다.

**페어링은 `schema.js` 검증 함수 안에 있다.** test에만 두면 런타임 수용 경로가 스키마상 불가능한 receipt를 그대로 받는다 — 그리고 그 수용 경로가 운영자의 증거가 나오는 곳이다. 규칙은 한 방향이다: *사유가 있으면 반드시 `author`* (역방향은 성립하지 않는다 — `author`는 "강등됐다"와 "처음부터 저자를 요구했다" 둘을 덮고, 후자에는 설명할 fallback이 없다).

## DD5 — 강등 채널

순서와 소유권을 확정한다. 이것이 없으면 모드는 runner가 env에서 읽고 Task 실패는 명령 본문이 발견해, 두 사실을 잇는 채널이 없어 강등이 receipt에 **도달하지 못한다**.

1. **모드는 명령 본문이 정한다.** `plan.md` 5.2z가 `parseArbiterMode(env)`를 호출해 runner를 `--arbiter-mode <subagent|author>`로 띄운다. **runner는 이 축의 env를 읽지 않으며 그 변수 이름조차 소스에 등장하지 않는다** — 두 프로세스가 각자 해석하면 서로 다른 답을 낼 수 있고, 그때 봉인값은 어느 쪽 사실도 아니게 된다. e2e가 소스 스캔으로 부재를 단언한다(사람 리뷰가 아니라 test가 잡게 하기 위해서다).
   **그리고 그 모드는 runner를 통해 다시 내려온다.** 모드를 정하는 곳(5.2z)과 그것으로 분기하는 곳(5.5a) 사이에는 Codex 호출과 triage가 있고, 셸 상태는 도구 호출을 건너 살아남지 않는다. `$ARBITER_MODE`는 **디스크 어디에서도 복구되지 않는** 유일한 값이었다(`$AWAITING`·`$RUN_NONCE`는 nonce-named 파일이 실재해 복구된다). 잃어버린 본문이 `author`로 추정하면 강등 기록 없이 저자가 판정하고, argv로 진짜 값을 쥔 runner는 `subagent`를 봉인한다 — **일어나지 않은 분리를 주장하는 receipt**이고, 정확히 이 milestone이 막으려는 것이다. 그래서 runner가 *자신이 해석한* 값을 `$AWAITING`에 싣고(`arbiter_mode`) 5.5a가 거기서 읽는다. 5.2z의 계산에 `|| echo "subagent"` fallback을 둔 것도 같은 축이다 — node 실패로 빈 변수가 되면 runner는 안전하게 `subagent`로 떨어지지만 본문의 분기표에는 빈 값에 해당하는 행이 없다.

   그 필드는 **arbiter에게 도달하지 않는다** — `ARBITER_PROJECTION_KEYS`에 없기 때문이며, blacklist 대신 whitelist를 고른 값을 치르는 지점이 여기다. blacklist였다면 이 필드를 추가하면서 배제 목록도 함께 고쳐야 했고, 그 편집이 빠지면 심판이 자기가 1지망이었는지를 알게 된다.
2. runner가 `$AWAITING`을 쓰고 대기한다(M1 흐름 무변경 — 위 `arbiter_mode` 한 필드만 추가).
3. 요구 모드가 `subagent`면 명령 본문이 projection을 만들어 `Task(mccp:intent-arbiter, …)`를 디스패치한다. 프롬프트 파일은 awaiting과 같은 내용(findings + constraints)을 담으므로 `0600`으로 쓰고, **runner의 `finally`가 지운다** — 산문 속 정리 단계는 건너뛰어지는 단계다.
4. **유효성 probe.** 계약이 좁다: `parseAdjudicationFile`이 `ok`면 exit 0, 아니면 exit 1, stdout은 비우고 사유는 stderr로. 명령 본문은 **종료 코드만** 분기한다(문자열 비교는 빈 출력·개행·로케일에 흔들린다). **probe 자체가 실패해도(node 부재·모듈 로드 실패·크래시) 비영점이라 자동으로 "무효"로 떨어진다** — 이것이 의도된 fail-closed 방향이고, "판정 불가"를 "유효"로 접으면 강등이 조용히 꺼진다.

   **`[ -f ]` 존재 검사로는 부족하다**: arbiter가 문법이 깨진 JSON을 쓰면 존재 검사는 통과하고, runner의 파싱은 실패하며, 명령 본문은 강등하지 않는다 → runner가 기본 30분 타임아웃을 다 쓰고서야 `incomplete`로 죽는다. 이 절이 없애려던 바로 그 정지가 되돌아온다.

   **검증이 publish보다 먼저다.** arbiter는 `Write`만 갖고 있어 rename할 수 없으므로 `$ADJUDICATION.tmp`에 쓰고 명령 본문이 원자적으로 publish한다. staged 파일을 검증 없이 옮기면 runner에게 파손된 읽기를 건네게 되어, 강등 대신 `incomplete`가 나온다.
5. **원인을 열거하지 않는다.** 에이전트 미등록 · 도구 거부 · 에러 · 취소 · 성공 반환 후 산출 부재 · 파손이 전부 같은 분기다. 초안은 `agent type not found` 하나만 다뤄 나머지가 전부 타임아웃으로 떨어졌다.
6. **강등 쓰기는 별도 채널이 아니라 같은 파일의 최상위 키다.** 명령 본문이 기존 5.5a 절차로 `$ADJUDICATION`에 **완전한** adjudication을 쓰고 `"arbiter_degraded": {"from","to","reason"}`를 얹는다.

   **"프로그래매틱 재구성"이 아니다.** 강등의 의미는 *심판이 저자로 되돌아간다*는 것이므로, 판정 내용을 코드가 만들면 심판이 사라진다. default verdict를 채우는 함수도 두지 않는다 — 그런 함수가 있으면 강등이 곧 **자동 승인**이 되고, M1이 막은 "기록 없는 수용"이 강등 한 번으로 부활한다. 따라서 신규 재구성 함수는 **0개**다.

   **불완전한 강등 산출은 fail-closed로 끝난다.** M1 규칙(개수·index·digest·비어있지 않은 `rationale`·verdict enum)이 그대로 적용된다. `arbiter_degraded`는 그 검사를 우회시키지 않는다 — 파서는 키의 *형태*만 받는다.
7. **강등 쓰기는 create-exclusive다.** probe와 쓰기 사이에 늦게 살아난 arbiter가 유효한 파일을 떨어뜨리면, 무조건 덮어쓰기는 **실제로 일어난 분리를 지우고 `author`로 기록한다**. `link(2)`를 우선 쓰고(원자적 + `EEXIST`) `openSync(…, 'wx')`를 이식성 fallback으로 둔다. `EEXIST`면 재-probe해 유효하면 강등을 **취소**하고, 여전히 무효면 그때만 덮어쓰되 사유를 `replaced-invalid-arbiter-output`으로 바꾼다. 재-probe와 조건부 쓰기는 **한 프로세스** 안에서 이뤄진다 — 셸 두 단계로 나누면 그 사이가 다시 창이 된다.
8. **봉인 규칙**: `subagent` ∧ 강등 부재 → `'subagent'` · `subagent` ∧ 강등 존재 → `'author'` + 사유 · `author` → 언제나 `'author'`(사유 없음).
9. **`author`인데 `arbiter_degraded`가 실려 오면 모순**이다(강등할 것이 없다) → `incomplete`. 조용히 무시하면 파일이 주장하는 이력과 봉인값이 어긋난 채 통과한다.

**사유는 절대 비지 않는다.** 원인 미상은 `unknown-task-failure`, 무효 산출 대체는 `replaced-invalid-arbiter-output`. 빈 사유는 `parseAdjudicationFile`이 강등 기록 전체를 거부하므로, 생략은 "말하지 않음"이 아니라 **강등 무효화**다.

**이 필드도 검증되지 않은 주장이다** — 강등이 실제로 일어났는지 runner는 확인할 수 없다. 다만 방향이 자기불리하다: 플래그를 넣는 행위는 자기 실행을 "분리 실패"로 기록하는 것이고, 빼는 것은 DD4가 이미 범위 밖으로 인정한 위조 축이다. 게이트가 사는 것은 **정상 운용에서 강등이 조용하지 않다**이다.

## 검증층이 각각 무엇을 잡는가

두 층을 합쳐 하나로 주장하지 않는다.

| 층 | 파일 | 잡는 것 | **못** 잡는 것 |
|---|---|---|---|
| 순수 오라클 test | `tests/intent-arbiter.test.js` | whitelist 등가 · 경로 누출 0 · 프롬프트 결정성 · 봉인 4조합 · 에이전트 `tools` | 그 오라클이 실제로 호출되는지 |
| 본문 lint | `tests/plan-command-marker-states.test.js` | 분기가 **사라지지 않았다** | 키워드가 주석 안에 있는지, `parseAdjudicationFile`이 *판정에* 쓰였는지 |
| e2e | `tests/intent-arbiter-e2e.test.js` | plan.md의 `node -e` 프로그램을 **추출해 실행** → runner → 실제 `write.js` → 디스크 receipt. 파손→강등 · 경합→취소 · 불완전 강등→`incomplete` · hash 포함 | 실제 subagent의 판정 품질 |
| (머지 후) 라이브 완주 | — | `Task(mccp:intent-arbiter)` 실발화와 그 판정의 유용성 | — |

e2e가 **사본이 아니라 출하되는 텍스트**를 실행하는 것이 요점이다. 사본을 test하면 test는 사본이 옳다는 것만 증명하고, 명령 본문이 틀려도 green이다.

## 잔여 — 기본 모드에서 intent 축은 여전히 skip된다

`MCCP_PLAN_REVIEW` 미설정 → `multi-agent` → `write.js`의 패널 carve-out이 intent 게이트를 *만족*이 아니라 *skip*으로 처리한다(그 코드의 `KNOWN GAP` 주석이 같은 사실을 적고 있다). **따라서 M2를 완주해도 기본 모드에서는 M1·M1.5·M2 기계가 발화하지 않는다.** 이 milestone의 게이트 실행 자체가 그 사실을 실증했다.

닫지 않는 이유는 귀속이다 — 패널에 intent 축을 편입하는 것은 diverse-agent-review PRD의 축이고 수정 방향이 또 하나의 대형 설계 라운드다. M3 후보로 남긴다.

**잔여의 안전 논증은 intent 축에 기대지 않는다**: 패널 승인은 cross-gate dedupe를 만족하지 못하므로 terminal `/mccp:pr`에서 PR-Codex가 반드시 발화한다.
