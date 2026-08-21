# Plan: Codex Review Intent-Context Preservation — M2 (심판 컨텍스트 분리)

**Source PRD**: `.claude/prds/codex-intent-context.prd.md`
**Selected Milestone**: 2 — arbiter 컨텍스트 분리 (이종 2차 리뷰어 축은 M3로 분리 — DD7)
**Complexity**: Medium

## Summary

M1은 **누락**을 닫았고 M1.5는 **오심**을 반증 가능하게 만들었다. 둘 다 남긴 것이 하나 있다 — **심판이 여전히 저자다.** `commands/plan.md` Phase 5.5a에서 adjudication 파일을 쓰는 것은 plan을 작성한 바로 그 세션이며, 그 세션은 자기 설계 근거를 전부 들고 있다. PRD Problem 2·3(자기심판 + sycophancy)이 정확히 이 지점이다.

M2는 두 축을 닫는다. **(A) 심판 분리** — adjudication을 저자 컨텍스트를 상속하지 않는 fresh subagent(`mccp:intent-arbiter`)로 옮기고, 그 subagent에게 **읽기 능력을 주지 않는다**. 판정에 필요한 것은 whitelist로 뽑아낸 projection으로 프롬프트에 실려 가고, arbiter의 도구는 `Write` 하나뿐이라 저자 정당화가 있는 파일을 **열 수단 자체가 없다**. **(C) 반입 결함** — `intent-claims.js`의 `stripQuotedStructures` 2건으로, backlog가 "같은 함수·같은 커밋"으로 예약해 둔 것이다.

**M2가 주장하지 않는 것**: 심판이 옳아진다고 주장하지 않는다. 심판이 **저자의 근거를 볼 수 없게** 될 뿐이다. 그리고 분리는 **암호학적 증명이 아니다** — 봉인되는 `intent_arbiter`는 *요구된 모드와 관측된 강등*이지, 그 subagent가 실제로 발화했다는 증명이 아니다(DD4).

## User Intent

<!-- Reference-only. 리뷰어 focus에 verbatim 주입된다(L1). USER-STATED 제약만 —
     저자 정당화는 절대 여기 쓰지 않는다(anchoring 회피, PRD Risk 4). -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 심판을 저자 컨텍스트에서 완전히 분리한다 — fresh subagent | direction |
| UI2 | 이종 리뷰어 다양성 복원은 이번 milestone에서 분리한다 | exclusion |
| UI3 | 리뷰어에게 전달하는 것은 사용자가 무엇을 요구했는지뿐이다 | constraint |
| UI4 | 저자 정당화는 리뷰어에게 전달하지 않는다 | constraint |
| UI5 | 판정 누락을 mechanical하게 막되 판정 내용은 LLM이 수행한다 | constraint |
| UI6 | prp-implement의 Implement-Codex는 이번 범위에서 제외한다 | exclusion |
| UI7 | Codex 자체를 교체하지 않는다 | exclusion |
| UI8 | 완벽한 리뷰어 독립성은 추구하지 않는다 | exclusion |
| UI9 | 게이트 성능과 비용 최적화는 이번 범위가 아니다 | exclusion |
| UI10 | M2에 예약된 backlog 결함은 이번에 함께 닫는다 | direction |
| UI11 | 지적이 한 축에 몰리면 사전 선언한 분할선을 발동한다 | direction |
| UI12 | 범위 판단은 Claude에게 위임한다 | direction |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 순수 오라클 | `plugins/mccp/scripts/lib/intent-claims.js:27` | fs/process/clock 없음 — 모든 I/O는 runner 소유 |
| 3-mode 토글 | `plugins/mccp/scripts/lib/intent-context.js:876` | 미설정·오타는 명명 상수 + loud warn |
| 소비처 분리 | `plugins/mccp/scripts/lib/intent-context.js:752` | 단일 `pass` 불리언 없음 — runtime/chain/dedupe 3분리 |
| 프롬프트에 데이터를 싣는다 | `plugins/mccp/scripts/lib/plan-review/perspectives.js:24` | 리뷰어가 파일을 찾아가지 않고 필요한 것이 프롬프트로 온다 |
| 명령→runner 단방향 인자 | `plugins/mccp/scripts/lib/plan-codex-runner.js:701` | `parseArgs`가 받는 것만 runner에 존재 — env 재해석 없음 |
| 도구 부재로 보장 | `plugins/mccp/agents/review-architect.md:1` | 능력 제거가 통제이고 프롬프트 문구는 방어 심층화일 뿐 |
| present-only meta | `plugins/mccp/scripts/receipt/schema.js:738` | `!== undefined` 가드 + `makeSkeleton` 미포함(hash 안정성) |
| 봉인 페어링 규칙 | `plugins/mccp/scripts/receipt/write.js:569` | 적용되지 않은 값의 사유는 봉인하지 않는다 |
| 명령 본문 lint | `plugins/mccp/scripts/lib/tests/plan-command-marker-states.test.js:1` | markdown 안 Bash 분기를 정규식으로 고정 + mutation-check |
| 테스트 위치 | `plugins/mccp/scripts/lib/tests/intent-claims.test.js:1` | `node --test`, 모듈당 1파일 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/intent-claims.js` | UPDATE | `stripQuotedStructures` 재구조화 — CommonMark HTML block 7종 + 주석을 라인 상태 기계 안으로 |
| `plugins/mccp/scripts/lib/tests/intent-claims.test.js` | UPDATE | 반입 결함 2건 회귀 + 과다 제거 오탐 회귀 |
| `plugins/mccp/scripts/lib/intent-arbiter.js` | CREATE | 모드 파서 + **whitelist projection** + 프롬프트 빌더 + 강등 판정(순수 오라클) |
| `plugins/mccp/scripts/lib/tests/intent-arbiter.test.js` | CREATE | projection whitelist·프롬프트 결정성·경로 미노출·강등 4조합 회귀 |
| `plugins/mccp/agents/intent-arbiter.md` | CREATE | 읽기 능력 없는 심판 에이전트(`tools: [Write]`) |
| `plugins/mccp/scripts/lib/intent-context.js` | UPDATE | adjudication 스키마에 `arbiter_degraded` 수용 + 형태 검증 |
| `plugins/mccp/scripts/lib/tests/intent-context.test.js` | UPDATE | `arbiter_degraded` 형태 거부 + 구 파일 무손상 회귀 |
| `plugins/mccp/scripts/lib/plan-codex-runner.js` | UPDATE | awaiting에 `intent_items` 투영 · `--arbiter-mode` 수용 · 강등 해소 · 봉인 |
| `plugins/mccp/scripts/lib/tests/plan-codex-runner.test.js` | UPDATE | 투영 누출 회귀 + 강등 채널 + 봉인값 |
| `plugins/mccp/scripts/lib/tests/intent-arbiter-e2e.test.js` | CREATE | runner → 실제 `write.js` → 디스크 receipt 관통(DD8) |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | present-only `intent_arbiter` + `intent_arbiter_degraded_reason` 페어링 |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | `intentDecision.arbiter` stamp + carve-out 경로에서 null |
| `plugins/mccp/scripts/receipt/tests/intent-gate-fields.test.js` | UPDATE | present-only + 페어링 + hash 포함 + 구 receipt 무손상 |
| `plugins/mccp/scripts/receipt/validate-cmd.js` | UPDATE | 강등 사실을 blocking 복구 문구에 덧붙이는 분기 |
| `plugins/mccp/scripts/receipt/tests/validate-cmd-intent-gate.test.js` | UPDATE | 강등 문구 회귀 |
| `plugins/mccp/commands/plan.md` | UPDATE | 5.5a를 projection + Task 디스패치로 교체 + 강등 분기 + `--arbiter-mode` forward |
| `plugins/mccp/scripts/lib/tests/plan-command-marker-states.test.js` | UPDATE | 신규 분기 lint 6건 + mutation-check |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.23.9` → `1.23.10`(patch — PRD에 M3가 남으므로 minor 아님, §3.7) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기(§3.7 5면) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | version 단언 2건 동기 |
| `docs/codex-intent-context/arbiter-separation.md` | CREATE | 무엇이 증명이고 무엇이 기록인지 — DD4·DD5 근거 문서 |
| `docs/ENVIRONMENT.md` | UPDATE | `MCCP_INTENT_ARBITER` 토글 1건 |
| `CHANGELOG.md` | UPDATE | `[1.23.10]` 엔트리 |
| `CLAUDE.md` | UPDATE | §3.13.2 M2 절 + §4 토글 |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | 반입 2건 종결 + M3 이연 항목 갱신 |
| `.claude/prds/codex-intent-context.prd.md` | UPDATE | M2 범위 축소 + M3 신설(이종 리뷰어 축) |

## Design Decisions

**DD1 — 분리는 "안 알려준다"가 아니라 "열 수 없다"로 만든다.** 초안은 arbiter에게 `Read`를 주고 awaiting 파일 하나만 읽게 하면 저자 정당화에 도달할 경로가 없다고 적었다. **거짓이었다** — `plugins/mccp/scripts/lib/plan-codex-runner.js:406`이 그 awaiting 아티팩트에 `plan_path`를 이미 싣고 있으므로, `Read`를 가진 arbiter는 거기서 경로를 꺼내 plan을 열고 `## Design Decisions`를 그대로 읽을 수 있다. 필드 하나를 지워 막는 것도 부족하다 — 경로를 몰라도 `Read`가 있는 한 추측이 가능하고, 무엇보다 runner에 새 필드가 추가될 때마다 같은 누출이 다시 열린다.

따라서 **능력을 제거한다**:

- `mccp:intent-arbiter`의 도구는 **`Write` 하나**다. 파일을 여는 수단이 없으므로 경로를 알든 모르든 plan에 도달하지 못한다.
- 판정에 필요한 것은 `buildArbiterProjection(awaitingJson)`이 **whitelist로** 뽑아 프롬프트에 인라인한다. 통과 키는 정확히 `review_payload_digest` · `intent_items` · `findings[]{finding_index, finding_digest, reviewer_claim, reviewer_claim_status, finding}` · `adjudication_path`. blacklist가 아니라 whitelist인 것이 핵심이다 — **runner에 새 필드가 생겨도 자동으로 새어 들어오지 않는다.**
- 이는 L2 패널이 이미 쓰는 형태와 같다(`plugins/mccp/scripts/lib/plan-review/perspectives.js:24` — 리뷰어가 파일을 찾아가지 않고 필요한 것이 프롬프트로 온다).

**대가를 정직하게 적는다**: 데이터가 저자 세션을 경유하므로 저자가 projection을 조작할 수 있다. 그러나 (a) finding 조작은 DD3의 `finding_digest` 대조에서 죽고, (b) `intent_items` 조작은 새 구멍이 아니다 — `## User Intent` 표는 애초에 저자가 쓴다. 남는 것은 DD10 위협모델(단일 신뢰 사용자)이 이미 범위 밖으로 둔 축이며, M2가 겨냥하는 것은 적대적 저자가 아니라 **anchoring과 sycophancy**다. 그 축에서는 "arbiter가 저자 근거를 볼 수 없다"가 결정적이고, 그것이 이제 도구 부재로 성립한다.

**DD2 — arbiter가 파일을 직접 쓴다.** subagent가 adjudication JSON을 *반환*하고 저자 세션이 그것을 디스크에 옮기면, 그 옮기는 단계가 곧 심판이다(저자가 내용을 바꿀 수 있고 아무 기록도 남지 않는다). 따라서 arbiter는 `$ADJUDICATION`을 **직접** 쓴다. `Write`만 갖는 도구 집합은 그 최소 능력이자 DD1의 통제다 — `Read`·`Grep`·`Glob`·`Bash`·`Edit` 부재가 저장소 탐색 불가를 프롬프트가 아니라 레지스트리로 보장한다(`plugins/mccp/agents/review-architect.md:1` 미러).

**DD3 — 바인딩은 이미 존재하며 재발명하지 않는다.** arbiter 산출물의 정당성은 M1이 이미 강제한다: `review_payload_digest` 일치 · finding 개수 일치 · `finding_index` 유일·범위 · per-finding `finding_digest` 일치(`plugins/mccp/scripts/lib/intent-context.js:650`). 심판이 바뀌어도 이 검사는 그대로이므로, 위조된·오래된 adjudication은 심판 주체와 무관하게 `incomplete`로 죽는다. M2는 **누가 썼는가**만 바꾸고 **무엇이 유효한가**는 건드리지 않는다.

**DD4 — `intent_arbiter`는 증명이 아니라 기록이며, 그렇게 적는다.** runner는 파일을 누가 썼는지 관측할 수 없다. 그래서 봉인되는 값은 "subagent가 썼다"가 아니라 **"이 실행이 요구한 심판 모드와 관측된 강등"** 이다(`intent_mislabel_mode`와 같은 성질·같은 이유). 명령 본문이 실제로 Task를 디스패치하는지는 본문 lint가 고정한다(Task 11).

같은 권한으로 Node를 실행할 수 있는 주체는 receipt를 직접 봉인할 수 있으므로(backlog 2026-08-09 MEDIUM — `write.js` 프로그래매틱 caller) 어떤 필드도 그 주체 앞에서 증명이 되지 못한다. M2가 사는 것은 **정상 운용에서 저자가 심판을 겸하지 않는다**이지 적대자 방어가 아니다.

**두 신규 필드는 `receipt_hash` 봉인 대상이며 carve-out을 만들지 않는다.** §3.12상 carve-out은 briefing·completion-ledger 진단 2건뿐이고, 감사 필드를 hash 밖에 두면 미서명 편집이 `validate-cmd`의 receipt-tamper 검사를 통과한다. `intent_*`가 이미 hash에 포함되는 성질을 그대로 잇는다.

**DD5 — 강등은 채널을 갖고, 그 채널은 실패 원인을 가리지 않는다.** 모드를 runner가 env에서 읽고 Task 실패는 명령 본문이 발견하면, 두 사실을 잇는 채널이 없어 강등이 receipt에 **도달하지 못한다**. 순서와 채널을 확정한다.

1. **명령 본문이 `parseArbiterMode(env)`를 먼저 호출**해 요구 모드를 정하고, runner를 `--arbiter-mode <subagent|author>`로 띄운다. **runner는 이 축의 env를 읽지 않는다** — 두 프로세스가 각자 해석하면 서로 다른 답을 낼 수 있고, 그때 봉인값은 어느 쪽 사실도 아니게 된다(`plugins/mccp/scripts/lib/plan-codex-runner.js:701`의 "인자로 받은 것만 존재한다" 성질).
2. runner가 `$AWAITING`을 쓰고 대기한다(M1 흐름 무변경).
3. 요구 모드가 `subagent`면 명령 본문이 projection을 만들어 `Task(mccp:intent-arbiter, …)`를 디스패치한다.
4. Task가 끝나면 명령 본문이 **유효성 probe**를 돌린다. **probe의 셸 계약을 확정한다**: `node -e`가 `parseAdjudicationFile`을 호출해 `ok`가 참이면 **exit 0**, 거짓이면 **exit 1**로 끝나고 stdout에는 아무것도 쓰지 않는다(사유는 stderr). 명령 본문은 `if node -e '…'; then` 형태로 **종료 코드만** 분기하며 stdout 파싱을 하지 않는다 — 문자열 비교는 빈 출력·개행·로케일에 흔들린다. **probe 자체가 실패하면(node 부재·모듈 로드 실패·크래시) 비영점 종료이므로 자동으로 "무효" 쪽으로 떨어진다** — 이것이 의도된 fail-closed 방향이고, "판정 불가"를 "유효"로 접으면 강등이 조용히 꺼진다. **`[ -f ]` 존재 검사로는 부족하다**: arbiter가 문법적으로 깨진 JSON을 쓰면 존재 검사는 통과하고, runner의 파싱은 실패하며, 명령 본문은 강등하지 않아 adjudication이 영영 갱신되지 않는다 — 그러면 runner가 기본 30분 타임아웃을 다 쓰고서야 `incomplete`로 죽는다. 이 절이 없애려던 바로 그 정지가 되돌아온다.
5. **probe가 `ok:false`이거나 파일이 없으면** 강등한다. 원인은 **열거하지 않는다** — Task 실패(에이전트 미등록 · 도구 거부 · 에러 · 취소)든 성공 반환 후 산출 부재든 파손이든 전부 같은 분기다. 초안은 `agent type not found` 하나만 다뤄 나머지가 전부 30분 정지로 떨어졌다.
6. **강등 쓰기는 별도 채널이 아니라 같은 파일이고, 내용을 만드는 주체는 M1과 동일한 저자 LLM이다.** 명령 본문이 기존 5.5a 절차 — **`$AWAITING`을 읽고 finding마다 판정을 직접 작성하는, 지금 shipped된 그 절차 그대로** — 로 `$ADJUDICATION`에 완전한 adjudication을 쓰고, 그 최상위에 `"arbiter_degraded": {"from":"subagent","to":"author","reason":"<사유>"}`를 얹는다.

   **"프로그래매틱 재구성"이 아니다.** 강등의 의미는 *심판이 저자로 되돌아간다*는 것이므로, 판정 내용을 코드가 만들면 심판이 사라진다(UI5 — 판정 내용은 LLM이 수행한다). default verdict를 채워 넣는 함수도 두지 않는다: 그런 함수가 있으면 강등이 곧 **자동 승인**이 되고, M1이 막은 "기록 없는 수용"이 강등 한 번으로 부활한다. 따라서 신규 재구성 함수는 **0개**이고, 명령 본문이 하는 일은 (i) probe, (ii) 기존 5.5a 작성, (iii) `arbiter_degraded` 키 1개 추가뿐이다.

   **불완전한 강등 산출은 fail-closed로 끝난다.** 저자가 필드를 빠뜨리면 runner의 `parseAdjudicationFile`과 `decideIntentGate`가 M1 규칙(개수·index·digest·`rationale` 비어있지 않음·verdict enum)으로 거부해 `incomplete`가 되고 receipt가 써지지 않는다 — `arbiter_degraded`가 그 검사를 우회시키지 않는다(Task 6은 키의 *형태*만 검증하며 M1 규칙에 손대지 않는다). runner는 평소대로 `parseAdjudicationFile`로 읽고 Task 6의 형태 검증이 이 키를 받는다 — 새 IPC 경로도, runner의 새 판독 분기도 없다. `reason`을 확정할 수 없으면 생략하지 말고 canonical `"unknown-task-failure"`를 쓴다(빈 사유는 Task 6 검증이 거부하므로 생략은 강등 자체를 무효로 만든다).
7. **강등 쓰기는 `wx`(존재 시 실패)로 한다.** probe와 강등 쓰기 사이에 늦게 살아난 arbiter가 유효한 파일을 떨어뜨리면, 무조건 덮어쓰기는 **실제로 일어난 분리를 지우고 `author`로 기록**한다. `EEXIST`를 받으면 probe를 한 번 더 돌려 — 유효하면 강등을 **취소**하고(arbiter가 이겼다), 여전히 무효면 그때만 덮어쓰되 `reason`에 `"replaced-invalid-arbiter-output"`을 기록한다. `plugins/mccp/scripts/lib/plan-codex-runner.js:109`의 `openSync(..., 'wx')` 선례와 같은 형태다.
8. runner의 봉인 규칙: `--arbiter-mode subagent` ∧ `arbiter_degraded` 부재 → `'subagent'` · `subagent` ∧ 존재 → `'author'` + 사유 봉인 · `--arbiter-mode author` → 언제나 `'author'`.
9. `--arbiter-mode author`인데 `arbiter_degraded`가 실려 오면 **모순**이다(강등할 것이 없다) → `incomplete`. 조용히 무시하면 파일이 주장하는 이력과 봉인값이 어긋난 채 통과한다.

**이 필드도 검증되지 않은 주장이다** — 강등이 실제로 일어났는지 runner는 확인할 수 없다. 다만 방향이 자기불리하다: 플래그를 넣는 행위는 자기 실행을 "분리 실패"로 기록하는 것이고, 빼는 것은 DD4가 이미 범위 밖으로 인정한 위조 축이다. 게이트가 사는 것은 **정상 운용에서 강등이 조용하지 않다**이다.

**DD6 — 반입 결함 2건은 정규식이 아니라 구조 문제이므로 함께 고친다.** backlog 2026-08-13 HIGH는 `plugins/mccp/scripts/lib/intent-claims.js:92`가 `<` 다음에 글자를 요구해 CommonMark HTML block start condition 7종 중 5종(주석·`<?`·`<!LETTER`·`<![CDATA[`·단독 완전 태그)을 놓친다는 것이고, 같은 날 MEDIUM은 `stripHtmlComments`가 라인 상태 기계 **밖의** 전체-텍스트 선처리(`plugins/mccp/scripts/lib/intent-claims.js:140`)라 fence 안의 `<!--` 예시가 뒤따르는 진짜 주장을 삼킨다는 것이다.

방향이 반대인 두 결함(전자는 fail-open 탐지 소실, 후자는 false block)이지만 **원인은 하나** — 인용 판정이 한 상태 기계 안에 있지 않다. 따라서 주석을 fence·blockquote와 같은 루프 안으로 옮기고 남은 5종을 한 번에 구현해 "다음 캐리어"가 원리상 없게 만든다.

**DD7 — 이종 2차 리뷰어 축은 M3로 분리한다(실측 근거 있음).** 초안은 PRD M2 행의 두 축을 함께 이행했고, 그 판본을 L2 반박 패널이 판정했다: blocking finding 9건 중 **CRITICAL 1 + HIGH 2가 전부 hybrid 축 하나**에 몰렸다(runner 호출 미명세 · 이중 writer 순서 보장 부재 · 5.6b 갱신 불충분). 심판 분리 축에서 나온 blocking은 1건뿐이었고 DD5가 흡수했다.

M1 → M1.5 분할과 같은 신호다. hybrid 재배선은 진리표 추출 + runner의 receipt 소유권 + 명령 본문 3분기 재배선이 얽힌 **자체 설계 라운드가 필요한 축**이며, 안고 가면 이미 검증된 심판 분리가 함께 묶여 못 나간다. Axis A는 Axis B에 의존하지 않는다 — 심판 분리는 Codex가 발화하는 모든 경로에서 성립하고 역방향 의존은 없다.

**DD8 — 배선은 지금 반증 가능하게, 판단은 머지 후에. 그 경계를 정확히 긋는다.** 심판 분리는 M2의 정의적 성질인데 에이전트가 존재하기 전이라 이 게이트에서 전부 검증할 수는 없다. 그러나 검증 불가한 조각은 하나뿐이므로 셋으로 쪼갠다.

| 조각 | 지금 반증 가능? | 무엇이 잡는가 |
|---|---|---|
| projection이 저자 근거를 싣지 않는가 | **예** | Task 4 — whitelist 오라클의 순수 함수 test |
| runner ← adjudication ← receipt가 실제로 관통하는가 | **예** | Task 9 — `intent-arbiter-e2e.test.js`(arbiter 자리에만 대역) |
| 명령 본문이 실제로 Task를 디스패치하는가 | **부분** | Task 11 — 본문 lint(존재는 잡고 실행은 못 잡는다) |
| 실제 subagent의 판정 품질 | **아니오** | Acceptance의 **머지 후** 라이브 완주 |

e2e는 backlog 2026-08-09 MEDIUM(runner-produced intent decision이 실제 persistence를 통과하는 test 부재)도 함께 닫는다. 마지막 행이 이번 사이클에서 반증 불가라는 것은 M1.5와 같은 유보이며 숨기지 않는다.

**DD9 — 범위에서 명시적으로 뺀 것: 패널 자체의 intent 편입.** backlog 2026-08-09 MEDIUM(패널 항목)은 `multi-agent`에서 intent 게이트가 *만족*이 아니라 *skip*된다고 기록한다(`plugins/mccp/scripts/receipt/write.js:213`의 `KNOWN GAP` 주석). M2는 이것을 **닫지 않는다** — 귀속이 diverse-agent-review PRD이고, 수정 방향이 또 하나의 대형 축이기 때문이다.

**따라서 M2를 완주해도 기본 모드에서는 M1·M1.5·M2 기계가 발화하지 않는다.** 이 plan의 게이트 실행이 그 사실을 실증했다 — `MCCP_PLAN_REVIEW` 미설정 → `multi-agent` → intent 축 skip. 잔여의 안전 논증은 intent 축에 기대지 않는다(패널 승인은 cross-gate dedupe를 만족하지 못하므로 terminal `/mccp:pr`에서 PR-Codex가 반드시 발화한다). M3 후보로 남긴다.

## Tasks

### Task 1: `intent-claims.js` — 인용 판정을 하나의 상태 기계로

- **Action**: UPDATE. `stripHtmlComments` 전체-텍스트 선처리를 제거하고 주석을 `stripQuotedStructures`의 라인 루프 안 상태(`inComment`)로 옮긴다 — fence·blockquote·raw-text 블록에 이미 삼켜진 줄은 주석 스캐너에 도달하지 않는다. `HTML_BLOCK_START_RE`를 CommonMark 7종 전부로 확장: type 1(raw text 4태그) · type 2(`<!--`) · type 3(`<?`) · type 4(`<!` + 글자) · type 5(`<![CDATA[`) · type 6(줄 선두 태그) · type 7(단독 완전 태그). 종료 조건을 종별 규칙대로 구현한다(2·3·5는 각자의 닫는 시퀀스, 4는 `>`, 1은 닫는 태그, 6·7은 빈 줄, 전부 EOF로도 종료).
- **Mirror**: 같은 파일의 기존 fence 상태 기계(여는 문자·길이 보존, 미닫힘은 EOF까지).
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/intent-claims.test.js`

### Task 2: `intent-claims.test.js` — 반입 결함 2건 회귀

- **Action**: UPDATE. (a) backlog 실측 3케이스 재현 — `<![CDATA[` · `<!DOCTYPE html>` · `<?php` 안의 `INTENT: none`이 전부 `unclaimed` · (b) type 2 여러 줄 주석 둘째 줄 · (c) type 7 단독 완전 태그 · (d) **false block 회귀** — 백틱 fence 안에 `<!--`가 든 예시 **뒤**의 진짜 `INTENT: UI1`이 살아남아 `claimed` · (e) blockquote 안 `<!--`도 동일 · (f) 인라인 `<code>` 언급이 뒤따르는 진짜 주장을 삼키지 않음 · (g) 미닫힘 주석이 EOF까지 삼키되 그 시작이 fence 안이면 삼키지 않음.
- **Mirror**: 같은 파일의 기존 인용구조 5종 케이스.
- **Validate**: 위와 동일 — 신규 7케이스 green, 기존 전부 green.

### Task 3: `intent-arbiter.js` — projection · 프롬프트 · 모드 · 강등 오라클

- **Action**: CREATE 4함수, 전부 순수(fs/process/clock 없음). (a) `parseArbiterMode(env, onWarn)` → `subagent`(기본) | `author`. 미설정·오타·`off` → `DEFAULT_ARBITER_MODE`(`'subagent'`) + loud warn. (b) **`buildArbiterProjection(awaitingJson)`** → `ARBITER_PROJECTION_KEYS` **whitelist**로만 구성한 객체. 통과 키는 `review_payload_digest` · `intent_items` · `adjudication_path`, 그리고 `findings[]`는 항목당 `finding_index` · `finding_digest` · `reviewer_claim` · `reviewer_claim_status` · `finding`만. **입력에 있는 다른 어떤 키도 출력에 나타나지 않는다**(`plan_path` 포함 — DD1). (c) `buildArbiterTaskPrompt({ projection, adjudicationPath })` → 결정적 문자열. **awaiting 경로도 plan 경로도 인자로 받지 않는다** — arbiter는 파일을 열 수 없으므로 경로가 무의미하고, 시그니처가 곧 DD1의 강제다. 템플릿은 **frozen 상수**이고 plan의 섹션명(`Design Decisions`·`Summary`·`Tasks`)이나 plan 파일 위치를 **문구로도 언급하지 않는다** — 정규식 test가 최종 문자열만 보므로, 템플릿이 구조를 이름으로 부르면 test는 통과하면서 anchoring 힌트가 새어 나간다. (d) `resolveArbiterSeal({ requiredMode, degraded })` → `{ arbiter, reason, conflict }` — DD5 8·9번 규칙의 **유일한** 구현체.
- **Mirror**: `plugins/mccp/scripts/lib/intent-context.js:876`의 모드 파서; `plugins/mccp/scripts/lib/plan-review/perspectives.js:24`의 "데이터를 프롬프트에 싣는다" 구조.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/intent-arbiter.test.js`

### Task 4: `intent-arbiter.test.js` — 분리·강등 불변식 고정

- **Action**: CREATE. 단언 **메커니즘까지** 고정한다(모호한 서술 금지). (a) 모드 파싱 4케이스. (b) **projection whitelist — 최상위와 중첩 양쪽**. 입력에 `plan_path` · `decision_id` · `run_nonce` · `claims_digest` · 임의의 신규 키 `zz_future`를 넣고, `Object.keys(projection)`이 `ARBITER_PROJECTION_KEYS`와 **정확히 일치**함을 단언(부분집합이 아니라 등가). **`findings[]` 항목에도 같은 등가 단언을 건다** — 최상위만 검사하면 구현이 실수로 awaiting의 finding 항목을 통째로 복사해도 통과한다. 단, 항목 안의 `finding`(Codex 리뷰 본문) 자체는 arbiter가 판정해야 할 대상이므로 내용을 필터하지 않는다. 리뷰어가 자기 finding에 plan을 인용했다면 그것은 **리뷰의 일부**이지 우회 채널이 아니다 — 이 잔여는 인정하고 (c)의 정규식이 그 표면을 관측한다. (c) **경로 누출 0** — `JSON.stringify(projection)` 전체와 `buildArbiterTaskPrompt(...)` 반환 문자열 둘 다에 대해 `/\.plan\.md/` · `/\.claude[\/\\]plans/` · `/Design Decisions/` · `/## Summary/` 정규식이 **모두 미매칭**임을 단언. (d) `buildArbiterTaskPrompt`가 같은 입력에 byte-identical. (e) **`resolveArbiterSeal` 4조합**(subagent+미강등→`subagent` · subagent+강등→`author`+사유 · author+미강등→`author` · author+강등→`conflict:true`). (f) `plugins/mccp/agents/intent-arbiter.md` frontmatter의 `tools`가 **정확히 `['Write']`** 임을 파싱해 단언 — `Read`가 다시 들어오면 실패한다.
- **Mirror**: `plugins/mccp/scripts/lib/tests/intent-context.test.js:1` 구조.
- **Validate**: 위와 동일.

### Task 5: `intent-arbiter.md` — 심판 에이전트

- **Action**: CREATE. frontmatter `tools: [Write]`, `model: opus`. 본문은 (i) 역할("너는 심판이며 저자가 아니다"), (ii) **판정에 필요한 것은 전부 프롬프트에 있고 파일을 여는 능력이 없다**, (iii) 5.5a 필드 규칙, (iv) `intent_conflict`를 편의상 `none`으로 찍지 말라는 명시(M1이 막는 것은 누락이지 오심이 아님), (v) 산출은 `$ADJUDICATION.tmp` 작성 후 rename.
- **Mirror**: `plugins/mccp/agents/review-architect.md:1`(도구 부재 보장 + Prompt Defense Baseline 블록).
- **Validate**: Task 4 (f)가 이 파일의 frontmatter를 파싱해 단언한다.

### Task 6: `intent-context.js` — `arbiter_degraded` 수용

- **Action**: UPDATE `parseAdjudicationFile`. 최상위 선택 키 `arbiter_degraded`를 허용하되 형태를 검증한다 — 객체이고 `from`·`to`가 `subagent|author`, `reason`이 비어있지 않은 문자열, 상한은 `ADJUDICATION_LIMITS.DISPUTE_REASON_CHARS` 재사용. 위반은 예외가 아니라 **거부 사유**(M1의 "위반은 verdict" 원칙). 키 부재는 정상(구 파일 무손상).
- **Mirror**: 같은 파일의 `hasForbiddenKeys` + 상한 freeze 규약.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/intent-context.test.js`

### Task 7: `intent-context.test.js` — 형태 검증 회귀

- **Action**: UPDATE. (a) `arbiter_degraded` 부재 → M1 동작 불변 · (b) 정상 객체 → 통과하고 값 보존 · (c) `from`/`to` enum 밖 · (d) `reason` 빈 문자열 · (e) 상한 초과 · (f) 비객체 → 각각 거부.
- **Validate**: 위와 동일.

### Task 8: `plan-codex-runner.js` — 투영·인자·봉인

- **Action**: UPDATE. (a) awaiting 아티팩트에 `intent_items`(= `section.items`) 추가 — projection의 원천이자 author 경로의 대조 자료. **`plan_path`는 그대로 둔다**: awaiting은 저자 경로가 계속 쓰는 파일이고, arbiter 격리는 필드 삭제가 아니라 whitelist projection + 도구 부재가 맡는다(DD1). (b) `parseArgs`에 `--arbiter-mode` 추가. **이 축의 env는 읽지 않는다**(DD5 1번). (c) adjudication 파싱 후 `resolveArbiterSeal({requiredMode, degraded})` 호출 — `conflict`면 `incomplete`로 종료(DD5 9번). (d) `intentDecision`에 `arbiter` + `arbiter_degraded_reason` 추가. 사유는 **강등이 실제로 적용됐을 때만** 봉인한다(`plugins/mccp/scripts/receipt/write.js:569`의 페어링 선례).
- **Mirror**: 같은 파일 `:536`의 기존 `passThrough` 블록과 `:701`의 `parseArgs`.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/plan-codex-runner.test.js`

### Task 9: runner 회귀 + e2e 관통

- **Action**: UPDATE 1 + CREATE 1. `plan-codex-runner.test.js`: (a) awaiting에 `intent_items`가 실리고 `section.items`와 일치 · (b) **awaiting → `buildArbiterProjection` 결과에 `plan_path`가 없고 `## Design Decisions` 본문도 없음**(DD1 누출 회귀 — awaiting 자체가 아니라 **arbiter가 실제로 받는 것**을 검사한다) · (c) DD5 봉인 4조합이 receipt 인자에 반영 · (d) `conflict` 조합이 `incomplete`로 종료하고 receipt 미작성 · (e) M1.5의 awaiting 변조 회귀가 `intent_items` 추가 후에도 불변. `intent-arbiter-e2e.test.js`: 임시 repo에서 runner를 **실제 `receipt/write.js`** 와 함께 돌리되(대역은 arbiter 자리에만) **성공·강등·거부 3시나리오를 전부** 돌린다 — 정적 정규식은 키워드 존재만 보므로 강등 축의 주장은 **행위 test로만** 성립한다.

  1. **성공** — 대역이 유효한 adjudication을 쓴다 → receipt에 `intent_arbiter='subagent'` 봉인 + 그 필드가 `receipt_hash`에 포함됨(필드를 바꾸면 hash가 바뀐다 — carve-out 부재의 실증).
  2. **강등(파손 산출)** — 대역이 **문법이 깨진 JSON**을 쓴다 → probe가 `ok:false`를 내고, 저자 경로가 유효한 adjudication + `arbiter_degraded`를 쓰며, **타임아웃에 도달하지 않고**(테스트는 `--adjudication-timeout-ms`를 수 초로 낮춰 30분 대기 없이 이를 관측한다) receipt가 `intent_arbiter='author'` + 사유로 봉인된다.
  3. **경합(늦은 유효 산출)** — `EEXIST`는 동시성으로 만들지 않는다(재현 불가한 test가 된다): 대역이 아무것도 쓰지 않아 probe가 실패하게 한 뒤, 강등 쓰기 **직전에 test가 유효한 adjudication을 그 경로에 미리 놓는다**. 그러면 `wx`가 결정적으로 `EEXIST`를 받고, 재-probe가 유효를 확인해 **강등이 취소**되며 최종 봉인이 `'subagent'`가 된다.
  5. **runner가 이 축의 env를 읽지 않음**(DD5 1번) — `plan-codex-runner.js` 소스에 `MCCP_INTENT_ARBITER` 문자열이 **0회** 등장함을 스캔으로 단언한다. 나중에 누군가 runner에 env fallback을 추가하면 명령 본문의 결정과 runner의 봉인이 갈라지므로, 그 회귀를 사람 리뷰가 아니라 test가 잡는다.
  4. **강등이 우회가 아님** — 대역이 파손 JSON을 쓰고 저자 경로가 `rationale`을 빠뜨린 adjudication + `arbiter_degraded`를 쓰면 **`incomplete`로 죽고 receipt가 없다**(강등이 M1 규칙을 면제하지 않음).
- **Mirror**: 같은 파일의 기존 변조 회귀; `plugins/mccp/scripts/receipt/tests/intent-gate-fields.test.js:1`의 실제 write 경로 사용.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/plan-codex-runner.test.js` + `node --test plugins/mccp/scripts/lib/tests/intent-arbiter-e2e.test.js`

### Task 10: receipt 표면 — schema · write · validate-cmd

- **Action**: UPDATE 5파일. `schema.js`: present-only `intent_arbiter` enum `subagent|author`|null + `intent_arbiter_degraded_reason` 문자열|null. **페어링 불변식은 test가 아니라 `schema.js`의 검증 함수 안에서 강제한다** — `plugins/mccp/scripts/receipt/schema.js:365`의 `pr_codex_force_override` ↔ `_reason` 선례와 같은 형태(`if (flag) { require(reason) }` + 역방향 거부)로, `intent_arbiter !== 'author'`인데 사유가 non-null이면 reject. 스키마에 규칙이 없으면 test만 통과하고 **런타임 수용 경로는 검증되지 않은 receipt를 그대로 받는다**. 두 필드 모두 **hash carve-out을 만들지 않는다**(§3.12). `write.js`: `stampIntentDecision`이 두 필드를 stamp하고 carve-out 경로(free-form · multi-agent 패널)에서는 둘 다 null. `validate-cmd.js`: blocking verdict 복구 문구에 강등 사실을 덧붙이는 분기(별 verdict를 만들지 **않는다** — verdict 인플레이션 회피). 테스트 2파일에 present-only · 페어링 위반 reject · 구 receipt 무손상 · 강등 문구 회귀 추가.
- **Mirror**: `plugins/mccp/scripts/receipt/schema.js:738` present-only 가드; M1.5 `intent_mislabel_mode` 봉인 선례.
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/intent-gate-fields.test.js` + `node --test plugins/mccp/scripts/receipt/tests/validate-cmd-intent-gate.test.js`

### Task 11: `commands/plan.md` — projection + Task 디스패치 + 강등 분기

- **Action**: UPDATE. (a) 5.2z가 `parseArbiterMode`를 호출해 요구 모드를 정하고 runner에 `--arbiter-mode`를 forward. (b) 5.5a의 heredoc 절차를 `node -e`로 `buildArbiterProjection` + `buildArbiterTaskPrompt`를 얻어 `Task(mccp:intent-arbiter, …)`를 디스패치하는 절차로 교체. (c) Task 반환 후 **유효성 probe**(DD5 4번) — `node -e`로 `parseAdjudicationFile`을 돌려 `ok`를 읽고, `ok:false`이거나 파일이 없으면(원인 불문, DD5 5번) 기존 5.5a heredoc 절차로 **완전한** adjudication을 `$ADJUDICATION`에 쓰되 최상위에 `arbiter_degraded`를 얹는다(DD5 6번). 쓰기는 `wx`이고 `EEXIST`면 재-probe 후 DD5 7번대로 분기한다. `reason`을 특정할 수 없으면 `"unknown-task-failure"`, 무효 산출을 덮었으면 `"replaced-invalid-arbiter-output"`. loud stderr 동반. (d) 요구 모드가 `author`면 처음부터 heredoc 경로 + 강등 필드 **없이**. 각 분기는 자기 블록에서 종료 조건을 계산한다(shell state가 블록을 넘지 않는다는 5.2 불변식 (i)).
- **Mirror**: 5.6b의 기존 `mode=codex` early-exit 분기 형태; 5.2z의 detached 실행 + marker poll; `plugins/mccp/scripts/lib/plan-codex-runner.js:109`의 `wx` 생성.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/plan-command-marker-states.test.js` — 신규 단언 **6개를 정규식으로 명시**한다: `/--arbiter-mode/` · `/Task\(mccp:intent-arbiter/` · `/arbiter_degraded/` · `/parseAdjudicationFile/`(존재 검사가 아니라 유효성 probe임을 고정) · `/wx/`(경합 시 무조건 덮어쓰지 않음) · `/unknown-task-failure/`(사유 생략 불가). **여섯 모두** `git show HEAD:plugins/mccp/commands/plan.md`에 대해 실패함을 mutation-check로 확인한다(매칭되지 않는 lint가 영원히 통과하는 함정 회피).

  **이 lint가 무엇을 못 하는지 적어 둔다**: 정규식은 **키워드 존재만** 본다 — 주석이나 문자열 안의 `arbiter_degraded`도 매칭되고, `parseAdjudicationFile`이 실제로 *유효성 판정에* 쓰였는지는 알 수 없다. 그래서 이 lint는 "분기가 사라지지 않았다"는 **회귀 방지**이지 정합성 증명이 아니며, 강등 축의 실제 동작은 Task 9의 e2e 시나리오 2~4가 담당한다. 두 층을 합쳐 하나로 주장하지 않는다.

### Task 12: 버전·문서 동기 + 분할 반영

- **Action**: UPDATE. `plugin.json` `1.23.9`→`1.23.10` + renderer footer 2면 + `i18n-surface.test.js` 단언 2건 + `CHANGELOG.md` `[1.23.10]` + `CLAUDE.md` §3.13.2(M2 절 — DD1의 도구 부재 논증 · DD4의 정확한 주장 · DD5 채널 · DD9 잔여) + §4 `MCCP_INTENT_ARBITER` + `docs/ENVIRONMENT.md` 항목 + `docs/codex-intent-context/arbiter-separation.md` 신규 + backlog 반입 2건 종결 · 패널 항목을 M3 후보로 갱신 + PRD 분할 반영 확인(plan 시점에 이미 착지 — Acceptance가 검사).
- **Mirror**: §3.7 5면 동기 체크리스트.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

## Validation

```bash
# 신규 + 변경 모듈 단위
node --test plugins/mccp/scripts/lib/tests/intent-claims.test.js
node --test plugins/mccp/scripts/lib/tests/intent-arbiter.test.js
node --test plugins/mccp/scripts/lib/tests/intent-arbiter-e2e.test.js
node --test plugins/mccp/scripts/lib/tests/intent-context.test.js
node --test plugins/mccp/scripts/lib/tests/plan-codex-runner.test.js
node --test plugins/mccp/scripts/lib/tests/plan-command-marker-states.test.js

# receipt 표면 전체 (기존 corpus 무손상)
node --test plugins/mccp/scripts/receipt/tests/

# lib 전체 회귀
node --test plugins/mccp/scripts/lib/tests/

# 버전 5면 동기
grep -rn "1\.23\.10" plugins/mccp/.claude-plugin/plugin.json \
  plugins/mccp/scripts/lib/renderer/html.js \
  plugins/mccp/scripts/lib/renderer/markdown.js CHANGELOG.md

# 심판 분리 정적 확인
grep -n "mccp:intent-arbiter" plugins/mccp/commands/plan.md
grep -n "arbiter-mode" plugins/mccp/commands/plan.md
grep -n "parseAdjudicationFile" plugins/mccp/commands/plan.md   # 존재 검사가 아닌 유효성 probe
grep -n "tools:" plugins/mccp/agents/intent-arbiter.md          # [Write] 하나여야 한다

# 페어링 불변식 — grep은 필드명 존재만 보므로 규칙 검증이 아니다.
# 실제 판정은 아래 test의 "페어링 위반 reject" 케이스가 하고, grep은 필드가
# schema.js에 아예 없는 상태(=규칙이 있을 수 없음)만 조기에 걸러낸다.
grep -n "intent_arbiter_degraded_reason" plugins/mccp/scripts/receipt/schema.js

# runner가 arbiter 축의 env를 읽지 않는가 (DD5 1번) — 0이어야 한다
grep -c "MCCP_INTENT_ARBITER" plugins/mccp/scripts/lib/plan-codex-runner.js

# PRD 분할이 실제로 착지했는가 (Acceptance 자동 검증)
grep -n "^| 3 |" .claude/prds/codex-intent-context.prd.md
grep -c "cross-vendor 독립 2차 리뷰어" .claude/prds/codex-intent-context.prd.md

# 머지 사고 방지 (§3.5.1)
git diff --diff-filter=D --name-only origin/main...HEAD
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| projection이 판정에 필요한 정보를 빠뜨려 arbiter가 판단 불가 | 中 | whitelist가 M1 바인딩이 요구하는 필드(`finding_index`·`finding_digest`·`review_payload_digest`)를 전부 포함하고, 빠지면 adjudication이 M1에서 거부돼 **fail-closed로 드러난다**. Task 9 e2e가 실제 통과를 확인 |
| 저자 세션이 projection을 경유하므로 데이터 조작 가능 | 中 | finding 조작은 DD3 digest에서 죽고, `intent_items` 조작은 새 구멍이 아니다(표는 원래 저자가 쓴다). DD10 위협모델 밖이며 DD1이 명시 |
| subagent 심판이 커버리지를 자주 놓쳐 `incomplete`가 잦다 | 中 | M1 바인딩 그대로라 fail-closed. 빈도가 높으면 복구는 프롬프트 개선이지 `author` 상시 강등이 아니며, 봉인된 `intent_arbiter`가 빈도를 감사에서 셀 수 있게 한다 |
| 강등 플래그가 검증되지 않은 주장이다 | 中 | **부정하지 않는다**(DD5 말미). 방향이 자기불리하고, 생략은 DD4가 인정한 위조 축이다 |
| 심판 판단 품질이 이번 사이클에서 반증 불가 | **高(잔존)** | DD8 표가 반증 가능한 3조각과 불가능한 1조각을 나눈다. 마지막 조각은 머지 후 라이브 완주로 이연 |
| `stripQuotedStructures` 재구조화가 기존 통과 케이스를 깬다 | 中 | Task 2 (d)(e)(f)가 false block 방향을 명시 고정. 기존 인용 5종은 한 줄도 고치지 않고 green 유지가 수용 조건 |
| 기본 모드에서 intent 축이 여전히 skip | **高(잔존)** | **부정하지 않는다**(DD9). 이 plan의 게이트 실행이 실증했다. M3 후보로 남긴다 |
| 병렬 브랜치 version 충돌 | 中 | §3.7 forward-only 상향. 머지 순서에 따라 `1.23.11`로 상향 준비 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] **backlog 반입 2건이 실측 재현 케이스로 닫힘** — `<![CDATA[`·`<!DOCTYPE`·`<?php` 안의 `INTENT:`가 `unclaimed`이고, fence 안 `<!--` 뒤의 진짜 주장이 `claimed`
- [ ] **arbiter의 `tools`가 정확히 `['Write']`** — `Read`가 들어오면 Task 4 (f)가 실패한다
- [ ] **projection이 whitelist 등가** — 입력에 `plan_path`·`zz_future`를 넣어도 `Object.keys(projection)`이 `ARBITER_PROJECTION_KEYS`와 정확히 일치
- [ ] **arbiter가 실제로 받는 것에 경로가 0건** — projection과 프롬프트 문자열 양쪽에서 `/\.plan\.md/`·`/\.claude[\/\\]plans/`·`/Design Decisions/`가 전부 미매칭
- [ ] **DD5 봉인 4조합이 test로 고정**되고 `author` + `arbiter_degraded` 모순이 `incomplete`로 죽음
- [ ] **강등 판정이 존재 검사가 아니라 유효성 probe** — e2e 시나리오 2가 파손 JSON을 넣어 강등이 실제로 발동하고 **타임아웃에 도달하지 않음**을 관측(정규식이 아니라 행위로 고정)
- [ ] **경합 시 실제 분리를 지우지 않음** — e2e 시나리오 3이 `EEXIST` → 재-probe → **강등 취소** → 최종 봉인 `'subagent'`를 관측(DD5 7번)
- [ ] **강등이 M1 규칙의 면제가 아님** — e2e 시나리오 4가 불완전한 강등 adjudication을 `incomplete` + receipt 부재로 확인
- [ ] **강등 경로에 신규 재구성 함수가 0개** — 판정 내용은 M1과 동일하게 저자 LLM이 작성하며, default verdict를 채우는 코드가 존재하지 않음(존재하면 강등이 곧 자동 승인이 된다)
- [ ] **강등 사유가 절대 비지 않음** — 원인 미상은 `unknown-task-failure`, 무효 산출 대체는 `replaced-invalid-arbiter-output`
- [ ] `intent_arbiter`·`intent_arbiter_degraded_reason`이 present-only이고 **페어링 불변식이 `schema.js` 검증 함수 안에서 강제**되며(test-only 아님) 두 필드가 **`receipt_hash`에 포함**됨(carve-out 부재를 e2e가 실증)
- [ ] **e2e가 runner → 실제 `write.js` → 디스크 receipt를 관통**(DD8 배선 반증 + backlog e2e 부재 항목 동시 종결)
- [ ] 명령 본문 lint 신규 정규식 **6개 전부**가 `git show HEAD:` 판본에서 실패함을 mutation-check로 확인
- [ ] 문서가 강제하는 명제를 **"정상 운용에서 저자가 심판을 겸하지 않는다"** 로 서술하고, "심판이 옳아진다"·"위조 방지"로 읽히는 문구가 DD·Summary·CLAUDE.md 어디에도 없음
- [ ] **DD9 잔여가 명시됨** — 기본 모드에서 intent 축이 skip된다는 사실이 CLAUDE.md와 CHANGELOG에 있고 M3 후보로 backlog에 남음
- [ ] **PRD가 분할을 반영** — M2가 심판 분리로 축소되고 M3(이종 2차 리뷰어)가 신설되며, 그 행에 패널이 지적한 hybrid 결함 3건이 설계 입력으로 기재됨. **수동 체크가 아니라 `## Validation`의 grep 2건**(`^| 3 |` 행 존재 · M3 문구 출현)이 검증한다
- [ ] **(머지 후)** 게이트를 실제로 1회 완주 — `claude plugin update` 후 `MCCP_PLAN_REVIEW=codex`로 PRD-mode plan 1건을 돌려 (1) `Task(mccp:intent-arbiter)` 실발화, (2) arbiter가 쓴 `$ADJUDICATION`이 M1 바인딩 통과, (3) receipt에 `intent_arbiter='subagent'` 봉인, (4) `/mccp:prp-implement` 진입 가능을 확인. **이 항목만 사이클 내 반증 불가이며 DD8 표의 마지막 행이다**

## Adversarial Review Record

L2 반박 패널(4관점 read-only, quorum 3of4) 라운드 기록. 무엇을 받아들였고 무엇을 **증거로 기각**했는지 남긴다.

**R1 — divergent (blocking 9건, CRITICAL 1).** 지적의 무게중심이 hybrid 축 하나(CRITICAL 1 + HIGH 2)에 몰렸다. 사전 선언한 분할선을 발동해 그 축을 M3로 분리(DD7). 심판 축의 유일한 blocking(강등 채널 미명세)은 DD5로 흡수.

**R2 — divergent (blocking 다수).** 흡수 항목:

| 지적 | 처리 |
|---|---|
| architect HIGH · security HIGH ×2 — `plan_path`가 awaiting에 있어 `Read` 가진 arbiter가 plan에 도달 | **인정**. `plugins/mccp/scripts/lib/plan-codex-runner.js:406`에서 실측 확인. DD1을 "안 알려준다"에서 **"열 수 없다"**(도구 `[Write]` 단독 + whitelist projection)로 재설계 |
| architect HIGH · security MEDIUM — acceptance/test가 `plan_path` 부재를 검사하지 않음 | **인정**. Task 9 (b)를 awaiting이 아니라 **arbiter가 실제로 받는 projection**에 대한 검사로 바꾸고, Acceptance에 whitelist 등가 항목 추가 |
| invariant HIGH — Task 실패 원인이 `agent type not found` 하나만 다뤄짐 | **인정**. DD5 4번을 원인 불문 + 파일 부재 2조건으로 일반화(초안대로면 그 밖의 실패가 30분 타임아웃으로 죽는다) |
| invariant MEDIUM — 신규 필드의 hash carve-out 지위 미선언 | **인정**. DD4 말미에 carve-out 부재를 명시하고 e2e가 실증 |
| invariant MEDIUM — 강등 필드가 검증되지 않은 주장 | **인정하되 설계는 유지**. DD5 말미에 명시 — 방향이 자기불리하고 생략은 DD4가 인정한 위조 축 |
| test MEDIUM — mutation-check 단언 4개가 프로즈로만 존재 | **인정**. Task 11 Validate에 정규식 4개를 리터럴로 기재 |
| test LOW — Task 4 (c)의 검사 메커니즘 모호 | **인정**. 정규식과 `Object.keys` 등가 비교로 메커니즘 확정 |

**증거로 기각한 지적:**

- **invariant HIGH — "adjudication 부재·파손 시 runner가 `subagent`를 봉인할 수 있다".** 오탐이다. `plugins/mccp/scripts/lib/plan-codex-runner.js:432`가 타임아웃을, `:438`이 parse 거부를 각각 `incomplete`로 종료하며 **receipt를 쓰지 않는다**. 봉인될 receipt 자체가 없으므로 서술된 실패는 발생하지 않는다.
- **invariant MEDIUM — "`--arbiter-mode`가 `parseArgs`에 없다".** 그것이 Task 8 (b)가 추가하는 대상이다. 현재 부재는 결함이 아니라 변경의 전제다.
- **invariant MEDIUM — "`$AWAITING`/`$ADJUDICATION`이 phase 경계에서 소실되어 복구 불가".** M1이 이미 해결했다 — 두 경로는 `RUN_NONCE`에서 파생돼 runner가 소유하고, 크래시 복구는 marker와 `receipt.meta.intent_run_nonce`가 담당한다(`commands/plan.md` 5.2·5.6의 markerless 분기).
- **test MEDIUM — "Acceptance 라이브 항목이 사전 반증 불가".** 사실이며 **이미 그렇게 적혀 있다**. DD8 표의 마지막 행이고 Acceptance에도 `(머지 후)`로 표기했다. 반증 가능한 나머지 3조각은 Task 4·9·11이 덮는다.

**R3 — architect·security PASS, test·invariant fail (2/4, quorum 3 미달).** 구조 축(도구 부재 + whitelist projection + digest 바인딩 + env/CLI 분리)은 두 관점 모두 반박에 실패해 통과했다. 남은 지적은 전부 **강등 채널의 정밀도와 스키마 강제 위치**였고, 그중 둘은 실제 설계 버그였다.

| 지적 | 처리 |
|---|---|
| invariant HIGH — 파손 JSON이 `[ -f ]` 검사를 통과해 30분 타임아웃으로 회귀 | **인정 — 실제 버그**. 판정을 존재 검사에서 `parseAdjudicationFile` **유효성 probe**로 교체(DD5 4번). 이 절이 없애려던 정지가 그대로 되돌아오던 경로다 |
| invariant HIGH — 늦게 도착한 arbiter 산출과 강등 쓰기의 경합 | **인정 — 실제 버그**. 강등 쓰기를 `wx`로 하고 `EEXIST` 시 재-probe 후 **강등을 취소**한다(DD5 7번). 무조건 덮어쓰기는 실제로 일어난 분리를 지우고 `author`로 기록한다 |
| invariant CRITICAL · test MEDIUM — 강등 정보가 어디에 어떤 형식으로 쓰이는지 미명세 | **인정(등급은 조정)**. 별도 IPC가 아니라 **같은 `$ADJUDICATION` 파일의 최상위 키**임을 DD5 6번에 명시하고, 사유 canonical fallback(`unknown-task-failure`)으로 "생략 = 강등 무효"를 닫았다. CRITICAL이 상정한 "false `subagent` 봉인"은 저자가 플래그를 고의로 빠뜨리는 경우에만 성립하며 그 축은 DD4·DD5 말미가 이미 범위 밖으로 선언했다 |
| test HIGH · invariant MEDIUM — 페어링 불변식이 스키마가 아니라 test에만 존재 | **인정**. `plugins/mccp/scripts/receipt/schema.js:365`의 `pr_codex_force_override` 선례를 지목해 검증 함수 안에서 강제하도록 Task 10에 명시 |
| invariant MEDIUM — whitelist 검증이 최상위에만 걸림 | **인정**. `findings[]` 항목에도 등가 단언을 건다(Task 4 b). 단 `finding` 본문은 판정 대상이라 필터하지 않으며, 그 잔여를 명시했다 |
| test MEDIUM — 프롬프트 템플릿 미명세라 정규식 test가 형식을 가정 | **인정**. 템플릿을 frozen 상수로 두고 plan 섹션명을 문구로도 부르지 않게 Task 3 (c)에 못박았다 |
| test MEDIUM — Task 실패 사유를 Bash에서 어떻게 얻는지 미명세 | **인정**. 사유는 명령 본문이 쓰는 bounded 자유 텍스트이고, 특정 불가 시 canonical `unknown-task-failure`를 쓴다(생략 금지) |
| test LOW — PRD 분할 acceptance에 자동 검증 없음 | **인정**. `## Validation`에 grep 2건 추가 |

**R4 — architect·security PASS(2연속), test·invariant fail (2/4).** 구조 축은 두 라운드 연속 반박 실패로 통과했고, 남은 지적은 전부 **강등 경로 하나**로 수렴했다. 성격이 바뀌었다 — R3까지는 "설계가 틀렸다"였고 R4는 "설계는 맞는데 *어떻게*가 안 적혀 있고 *행위 test*가 없다"였다.

| 지적 | 처리 |
|---|---|
| invariant HIGH ×2 · MEDIUM — 강등 시 완전한 adjudication을 **무엇이** 만드는지 미명세(프로그래매틱 재구성인가?) | **인정**. DD5 6번에 명시: **M1과 동일한 저자 LLM**이 기존 5.5a 절차로 작성하며 **신규 재구성 함수는 0개**다. 이유도 적었다 — 코드가 판정을 채우면 강등이 곧 자동 승인이 되어 M1이 막은 "기록 없는 수용"이 부활한다(UI5 위반). 불완전한 산출은 M1 규칙이 그대로 `incomplete`로 죽인다 |
| test HIGH ×2 · invariant MEDIUM — 파손 JSON·경합 시나리오에 **행위 test가 없다**(정규식은 키워드만 본다) | **인정**. Task 9 e2e를 성공 1시나리오에서 **4시나리오**(성공 · 파손→강등 · 경합→강등취소 · 불완전 강등→`incomplete`)로 확장하고, Acceptance를 정규식이 아니라 그 시나리오에 걸었다. 타임아웃 관측은 `--adjudication-timeout-ms`를 낮춰 30분 대기 없이 한다 |
| test MEDIUM · invariant MEDIUM — 정규식 lint가 의미를 검증하지 못한다 | **인정하되 층을 분리**. lint는 "분기가 사라지지 않았다"는 회귀 방지이지 정합성 증명이 아니라고 Task 11에 명시했다. 두 층을 합쳐 하나로 주장하지 않는다 |

**R5 — architect·security PASS(3연속), test·invariant fail (2/4). 게이트 예산 소진으로 여기서 종료.** 흡수한 것과, **이 라운드에서 지적의 성격이 바뀐 것**을 함께 남긴다.

| 지적 | 처리 |
|---|---|
| invariant CRITICAL — probe의 셸 계약(종료 코드·출력·probe 자체 실패)이 미명세 | **인정**. DD5 4번에 계약을 확정 — `ok`면 exit 0, 아니면 exit 1, stdout 비움, 명령 본문은 종료 코드만 분기. **probe 자체가 죽으면 비영점이므로 자동으로 "무효"로 떨어진다**(판정 불가를 유효로 접으면 강등이 조용히 꺼진다) |
| invariant HIGH — runner에 나중에 env fallback이 생기면 명령 본문과 봉인이 갈라진다 | **인정**. `plan-codex-runner.js` 소스에 `MCCP_INTENT_ARBITER`가 0회 등장함을 스캔으로 단언하는 회귀를 추가(사람 리뷰가 아니라 test가 잡는다) |
| test MEDIUM · invariant MEDIUM — `EEXIST` 재현 방법 미명세 | **인정**. 동시성으로 만들지 않는다 — 강등 쓰기 직전에 test가 유효 파일을 미리 놓아 결정적으로 `EEXIST`를 유발한다 |
| test MEDIUM — 페어링 grep이 필드명 존재만 본다 | **인정**. grep은 조기 필터일 뿐이고 규칙 판정은 test의 "페어링 위반 reject" 케이스가 한다고 `## Validation`에 명시 |

**기각 — 아티팩트 종류의 오인(이번 라운드 blocking의 다수).** test 관점의 HIGH 3건은 전부 *"`intent-claims.test.js`에서 `CDATA`를 grep했더니 0건"* · *"6개 정규식 단언이 test 파일에 아직 없다"* 형태다. 그 파일들은 **Task 2·11이 만들 대상**이고, 아직 없는 것이 곧 plan이 존재하는 이유다. plan을 완료된 구현으로 간주한 판정이므로 흡수 대상이 아니다. `ARBITER_PROJECTION_KEYS` 상수와 timeout test 코드를 "plan에 보여 달라"는 지적도 같은 부류다 — plan은 구현 명세이지 구현이 아니다.

이 구분을 기록에 남기는 이유: R5의 blocking 다수가 이 부류라면 **라운드를 더 돌려도 수렴하지 않는다**. 남은 것은 plan의 결함이 아니라 리뷰어의 기준과 아티팩트 종류의 불일치이고, 그것은 다음 라운드가 아니라 구현(Task 2·11 착지) 이후에만 해소된다.

## External Research Provenance

- Source PRD: .claude/prds/codex-intent-context.prd.md
- References section sha256: 8fece5c94acfa1a583e0de7beae9e1d075c2461b9be38072f36cd8c9d21fd9bf
- Stamped at: 2026-08-13T23:19:15.714Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## Design Critique

- detector: `design_signal=true` — `## Files to Change`가 `plugins/mccp/scripts/lib/renderer/html.js` · `markdown.js` · `tests/i18n-surface.test.js`를 포함(§3.7 5면 version 동기)
- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` Read 완료
- rounds: 1 (R0) / cap 2 · verdict: **CONVERGED**

| Anchor | 판정 | 근거 |
|---|---|---|
| 정보 위계 3단계 (heading depth ≤ 3) | pass | 본문은 `#`/`##`/`###`만 사용 — depth 4 이상 없음 |
| 강조색 화면당 1개 | n/a | plan은 accent token을 갖지 않는 소스 문서다 |
| raw markdown marker 금지 | pass | 미렌더 마커 누출 없음 |
| 한 화면 항목 수 상한 (`list-of-N`) | LOW — 미적용 판정 | 아래 참조 |

**`list-of-N` 상한을 적용하지 않은 이유.** anchor는 긴 표를 상위 3개만 펼치고 나머지를 `<details>`로 접으라고 요구한다. 그러나 이 문서는 **렌더 표면이 아니라 게이트가 파싱하는 아티팩트**다 — `plugins/mccp/scripts/lib/plan-review/l1-check.js:119`가 `## Files to Change` 표를 행 단위로 읽어 C2/C3를 판정하고, `receipt/dedupe.js`의 planned matcher가 같은 표의 첫 열을 git diff 경로와 대조한다(§1.2). 접으면 그 소비처들이 조용히 빈 목록을 보게 되며, 이는 anchor가 막으려는 인지 부하보다 훨씬 큰 실패다. 렌더 표면(`status.html` · `STATUS.md`)에는 이 anchor가 그대로 적용되며 그쪽은 renderer의 lint가 소유한다. severity LOW로 기각한다.

## Design Routing Guide

routing mode: `auto` (effective at implement stage). plan 단계는 렌더된 UI가 없어 **호출하지 않고** 체크리스트만 기록한다. 이번 milestone의 렌더 표면 변경은 version footer 문자열 2건뿐이라 아래 대부분은 해당 없음이 예상된다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` |
| refine | `/impeccable typeset` |
| refine | `/impeccable animate` |
| refine | `/impeccable colorize` |
| refine | `/impeccable bolder` |
| refine | `/impeccable quieter` |
| refine | `/impeccable overdrive` |
| refine | `/impeccable delight` |
| simplify | `/impeccable adapt` |
| simplify | `/impeccable distill` |
| simplify | `/impeccable clarify` |
| evaluate | `/impeccable critique` |
| evaluate | `/impeccable audit` |
| harden | `/impeccable harden` |
| harden | `/impeccable optimize` |
| harden | `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` |
| system | `/impeccable extract` |

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
