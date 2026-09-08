# Plan Review Panel — orchestrator-step-wiring-m3-rev2

**Plan**: `.claude/plans/orchestrator-step-wiring-m3-rev2.plan.md` · **Plan version**: `sha256:6818cd91b666d858a945537ec0e7eca5470da1a58097d5d9cef7c5a436b96f79`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 8 blocking finding(s): architect/HIGH, architect/HIGH, architect/FAIL, test/HIGH — MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | Task 5의 '세 단언이 함께 있으면 dirIsShared 구현과 구별된다'는 주장이 거짓이다. 구별자로 지정한 3번 단언이 두 구현 모두에서 자동으로 참이라 아무것도 반증하지 못한다. | plan L229-230/L414: "공유 위치에 A1 이벤트만 남긴 **자기 세션**이 B2 분모에서 사라지지 않는다 — … 1번만 있으면 `dirIsShared` 구현과 구별되지 않는다". 그러나 B2 분모는 `concurrent_pairs_count`(msw-metrics/index.js:538)이고 그 값은 `spanOf`가 만든 span에서만 증가하는데, session-activity.js:336-337 `const startEvt = sess.events.find(e => e.kind === 'session_start'); if (!startEvt) return null;` — A1 kind(`task_started`·`task_completed`·`task_ship_sealed`, state/msw-events.js:254)만 가진 세션은 span이 없어 **이미** 어떤 pair에도 기여하지 않는다. 따라서 kind 기준 가드든 `dirIsShared` 기준 가드든 이 단언은 0==0으로 통과한다. 세 단언 중 어느 것도 두 구현을 가르지 못하므로, plan L394 Risks의 mitigation('경계를 kind로 잡고 Validate가 셋을 함께 단언한다')이 지목한 위험(자기 세션이 집계에서 깎임)은 실제로 그물에 걸리지 않는다. |
| architect | HIGH | Task 6이 지시하는 착지 지점('registry의 note 열')은 존재하지 않고, Mirror로 인용한 :205의 마지막 열은 사유 note가 아니라 `vocabularyGap`이다. 그 열에 bool 토글의 사유를 적으면 기존 test가 red가 된다 — 즉 Task 6은 명시된 형태로 구현 불가다. | registry.js:100-101이 열을 열거한다: "name, kind, values, default, polarity, status, domain, evidence, summary, vocabulary, vocabularyGap" — `note` 열은 없다. registry.js:331 `const vocabularyGap = row[10]`이므로 plan이 Mirror로 든 `:205`의 마지막 문자열("멤버가 USD 임계 숫자 3단계라…")은 `vocabularyGap`이며 그 정의는 registry.js:68 "어휘를 읽을 수 없는 이유"다. `MCCP_MSW_EVENTS_SHARED`(registry.js:201)는 kind `bool`이고, tests/registry.test.js:198-203은 "그 밖의 kind에는 어휘 열이 붙지 않는다"로 `bool`의 `vocabularyGap`이 null임을 단언한다. 남는 자유 텍스트 열 `summary`는 registry.js:57 "1문장을 넘기지 않는다" + lint L2가 docs/ENVIRONMENT.md와 양방향 대조하는데, 그 문서는 plan의 `## Files to Change`에 없다. DD5는 새 열 추가를 명시적으로 금지한다(plan L118-119). |
| security | MEDIUM | DD3의 요약 문장과 Task 5 Action이 서로 다른 술어를 지시한다. DD3는 "가드는 출처 디렉토리가 아니라 kind가 A1 축인가로 판정한다"(plan:106)라고 못박는데, 이를 문자 그대로 구현하면(dir 조건 없이 kind만) 로컬 worktree의 `session_start`/`session_end`도 `sessions[sessionId]` 엔트리를 만들지 못한다. 그 결과 `concurrent_pairs_count`(session-activity.js:353-366, `spanOf`가 session_start를 요구)가 0이 되고 A2의 `context_remaining_pct`(index.js:217-218, session_end에서만 채워짐)가 전량 소실된다. 즉 오염을 막으려는 reader 가드가 실재하는 B2·A2 모집단을 통째로 지운다. | plan:106 "가드는 출처 디렉토리가 아니라 **kind가 A1 축인가**로 판정한다" vs plan:211-213 "…비-A1 이벤트가 **공유 위치에서 읽혔을 때** 엔트리를 만들지 않게 한다"; 소비 경로: plugins/mccp/scripts/derive/sources/session-activity.js:196-223, :335-366, :403 및 plugins/mccp/scripts/lib/msw-metrics/index.js:216-229 |
| security | MEDIUM | Task 5의 세 Validate 단언 중 어느 것도 kind-only 오구현을 붉게 만들지 못한다. 1번(공유 비-A1이 pairs를 안 늘림) · 2번(공유 A1이 startups를 늘림) · 3번(공유에 A1만 남긴 자기 세션이 B2 분모에 남음) 모두 kind-only 구현에서 통과하며, "로컬 session_start/session_end는 여전히 B2·A2에 기여한다"는 단언이 빠져 있다. 위 MEDIUM 결함이 test 그물 밖에 있다. | plan:222-230 (Validate 1·2·3 전문) 및 plan:412-414 Acceptance — 로컬 비-A1 이벤트 보존을 요구하는 항목이 0건. 기존 회귀는 msw-a1-boundary.test.js:319-320이 공유 위치 케이스만 고정한다 |
| security | LOW | Task 9는 `escalate_pending`을 receipt에 결속된 유일한 clear 경로 밖에서 손으로 해제한다. 그 경로(write.js:1240-1252)는 *같은 decision_id의 후속 clean receipt*를 요구하는 증거 기반 가드인데, `state-writer.update()` 직접 호출은 그 증거 없이 알람을 끈다. Acceptance는 두 소비 표면의 **침묵**만 확인하므로(plan:419-420) 결과 상태는 "증거로 해제됨"과 "애초에 escalate된 적 없음"·"손으로 껐음"을 기계적으로 구별하지 못한다. 이번 인스턴스는 정당하지만(M1 머지됨) 남는 것은 산문 기록뿐이다. | plugins/mccp/scripts/receipt/write.js:1240-1252 (clear는 동일 decision_id의 후속 clean receipt를 전제) vs plan:293-312 "해소는 `state-writer.js`의 `update()` API를 지나야 한다" · plan:419-420 Acceptance |
| test | HIGH | Task 5의 세 단언 중 어느 것도 kind 기반 가드와 dirIsShared 기반 가드를 구별하지 못한다 — plan이 명시적으로 주장하는 반증력('1번만 있으면 dirIsShared 구현과 구별되지 않는다', plan L230)이 거짓이다. (a) 단언 2(공유 위치의 A1 kind가 task_startups_count를 증가시킨다)는 판별력이 없다: session-activity.js:232-256의 task_completed/task_started/task_ship_sealed 계수는 sessions[sessionId] 엔트리 생성 분기 **밖**에서 이벤트마다 무조건 실행되므로, 엔트리 생성을 dirIsShared로 막아도 A1 카운트는 그대로 증가한다. (b) 단언 3(A1 이벤트만 남긴 자기 세션이 B2 분모에 남는다)은 공허하다: concurrent_pairs는 spanOf(:335-336)가 요구하는 session_start가 있어야만 증가하는데, 그 세션에 A1 이벤트만 있으면 span은 가드 유무와 무관하게 null이고, 반대로 그 세션이 로컬 session_start를 갖는다면 엔트리는 로컬 읽기(:211)에서 이미 생성되므로 shared 가드가 무엇이든 살아남는다. 즉 security/MEDIUM 흡수의 유일한 반증 수단이 test로 존재하지 않으며, Acceptance L412-414가 같은 공허한 트리오를 그대로 인코딩한다. | plugins/mccp/scripts/derive/sources/session-activity.js:196-256(엔트리 생성 분기 밖의 무조건 계수) · :335-336(spanOf가 session_start 요구) · :211(로컬 읽기가 observed_local 표식) vs plan L222-230, L412-414 |
| test | MEDIUM | Task 9의 Validate와 Acceptance가 스스로 반증 불가라고 적은 표면을 여전히 확인 수단으로 지정한다 — 통과와 미실행을 구별하지 못하는 체크박스다. plan Task 8(e)는 'renderer/verdict.js:127은 fixTask && escalate_pending을 요구하는데 이 저장소에는 .claude/state/fix-task.md가 없어 amber는 값과 무관하게 이미 침묵 중'이라고 적고 이연하면서, 같은 plan의 Task 9 Validate(L313-315)와 Acceptance(L419-420)는 '소비처 양쪽에서 확인'을 요구한다. 실측으로 fix-task.md는 부재(fix-task-applied.md만 존재)이므로 그 절반은 변경 전에도 이미 참이다. | plan L279-283 vs L313-315, L419-420 · plugins/mccp/scripts/lib/renderer/verdict.js:126-129 · .claude/state/에 fix-task.md 부재(fix-task-applied.md만 존재) |
| test | LOW | Task 4의 Validate fixture는 실제 producer가 만들 수 없는 형태이고, Task 5 착지 후에는 sessions와 sessions_local이 런타임 항진명제가 되어 test가 소비처 행동을 증명하지 못한다. plan 자신이 8(f)에서 architect/LOW로 이연했으나, 그 결과 Task 4의 '코드로 고정한다'는 주장은 손으로 조립한 model 객체에 대해서만 성립한다. | plan L197-203(Task 4 Validate) vs plan L284-288(8(f) 항진명제 이연) · session-activity.js:216-218(context_remaining_pct는 session_end에서만 수집, session_end는 A1_AXIS_KINDS 밖이라 공유 위치에 도달 불가 — msw-events.js:254,419) |
| invariant | HIGH | 이 계획은 라운드 캡을 데이터 재키잉으로 우회하고, 그 우회를 어떤 기계도 기록하지 않는다. `review-rounds/ledger.js:106-107`이 원장을 `<gate-id>__<decision-slug>.json`으로 키잉하므로 plan 파일을 `-m3` → `-m3-rev2`로 `git mv`하는 것은 `rounds_so_far`를 0으로 되돌리는 것과 기능적으로 동일하다. CLAUDE.md §3.16은 '캡에 걸렸을 때 정당한 행동'을 열거하며 '원장을 지우는 것은 그 목록에 없다'고 명시하는데, 재키잉은 지우기와 구별 불가한 효과를 갖는다. 즉 캡은 slug를 바꿀 줄 아는 실행자에게는 캡이 아니고, 이번 사이클이 그것을 실증한다. | plan.md:607-608 "따라서 slug를 `orchestrator-step-wiring-m3-rev2`로 재키잉했다 (`git mv` + PRD 밀스톤 행 갱신)" + `plugins/mccp/scripts/lib/review-rounds/ledger.js:106-107` (`ledgerBasename = gateId + '__' + decisionId`) + plan.md:598 "불가 — 원장 `rounds_so_far=1 cap=1 mode=enforce`" |
| invariant | HIGH | 완화가 산문에만 있다. 계획은 재키잉의 감사 공백을 인정하면서(plan.md:616-624) 그 공백을 닫는 기계를 하나도 만들지 않고 backlog 항목(Task 8 (d))으로만 이연한다. 새 slug의 receipt가 `rounds_so_far=0`을 봉인하면 ship 감사는 앞선 두 키의 차단을 읽지 못하며, 이 사실을 붉게 만들 단언이 `## Validation`의 8개 명령 어디에도 없다 — receipt anchoring이 실제 리뷰 이력과 끊긴다. | plan.md:627-630 "ship 감사가 세 키를 함께 읽지 않는다는 것이 등재하는 결함이며, 이 문단이 그 공백을 산문으로 메운다" · `## Validation`(plan.md:333-384)에 원장/receipt 대조 명령 0건 |
| invariant | MEDIUM | Task 1은 알 수 없는 입력(기준선 부재)을 허용 방향으로 접는다. 기준선 없음 → `status:'computed'`이므로 소비처는 A1을 '무결성 검증된 값'으로 읽지만, DD2가 producer를 만들지 않기로 확정하므로 anti-gaming 축은 어떤 실 입력으로도 도달 불가다(계획 자신이 인정). 판정 불가를 표현하는 제3상태(`forward-only` 계열이 같은 파일 `index.js:139-151`에 이미 존재)를 쓰지 않고 permissive 상태로 접은 이유가 계획에 없다. 유일한 표면은 `cli.js a1` 배너 토큰이며 어떤 게이트도 그것을 읽지 않는다. | plan.md:74-79 "M3 이후 anti-gaming 가드는 어떤 실 입력으로도 도달 불가" · plan.md:151-152 Validate "기준선 부재 → `status='computed'`" · `msw-metrics/index.js:114-133`(현재 invalid 경로) 대 `:139-151`(판정 불가를 표현하는 기존 3상태 선례) |
| invariant | MEDIUM | Task 9는 escalation 알람을 sanctioned 경로 밖의 데이터 편집으로 해제한다. `receipt/write.js:1240-1252`의 유일한 clear 경로는 같은 `decision_id`의 후속 clean receipt인데, Task 9는 그 조건 없이 `state-writer.update()`로 플래그를 내린다. 계획은 구조적 결함을 backlog로 이연하면서(Task 8 (a)) '수명 끝난 decision의 알람은 수동으로 내려도 된다'는 선례를 만들고, 그 선례를 제한하는 test나 가드는 계획에 없다. 계획 자신이 Task 8 (f)에서 '이 사이클 자신의 receipt write가 되살릴 수 있고 순서 보장이 없다'고 적으면서 순서 보장을 세우지 않는다. | plan.md:294-301, 309-312 · plan.md:284-285 "Task 9의 `escalate_pending`을 이 사이클 자신의 receipt write가 되살릴 수 있고 순서 보장이 없다(test/MEDIUM)" · `plugins/mccp/scripts/receipt/write.js:1240-1252` |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | 인용 검증: msw-metrics/index.js:114-115 spike 가드(참) · computeA2의 `samples`가 `sessions`에서 오고 분모만 `localSessions`인 비대칭(참, :216-231) · work-orchestrator.js:400-417의 `worktree=` safeField 우회와 JSON :582(참) · session-activity.js:114-136 commonDirOf 직접 호출·throw 금지(참) · state/msw-events.js:419 A1 kind 라우팅과 :541 A1_AXIS_KINDS export(이미 export돼 있어 writer 파일 미등재는 문제 아님). 공격한 축: (a) Task 5 가드의 술어 경계가 실제로 두 설계를 가르는가 → 가르지 못함(finding 1), (b) Task 6의 착지 열이 실재하는가 → 실재하지 않음(finding 2), (c) Task 4가 항진명제인지 → 아님(공유 A1-only 외래 세션이 sessions에는 남으므로 sessions≠sessions_local 유지), (d) Files to Change 누락(dedupe 리터럴 매칭) → msw-events.js는 변경 불요라 무해, (e) Task 9의 STATE.md 경계(state-writer API 경유) → 위반 없음, (f) DD2의 dormant 가드 대가 → plan이 이미 backlog 등재로 정직하게 처리. |
| security | pass | 공격한 것: (1) 배너 유출 축 — `last-halt` 텍스트/JSON 경로에서 절대경로·머신명이 커밋물이나 터미널로 새는지 확인. work-orchestrator.js:557은 `scrubAbsPaths`로 마스킹하고, :582의 `worktree`는 basename뿐이며 plan Task 2가 `safeField` 우회(:414-415, :582)를 정확히 지목한다 — 인용 TRUE, 유출 확대 없음. (2) 공유 corpus 신뢰 경계 — Task 3 삭제 근거(`A1_AXIS_KINDS`가 비-A1을 공유 위치로 라우팅하지 않음)를 msw-events.js:254/:419, migrations/msw-events-common-dir.js:453에서 실측 확인, 삭제 판단이 오히려 신뢰 경계를 CLI 초크포인트 안에 유지한다 — 결함 못 만듦. (3) 세션 id → 파일명 경로 주입 — reader는 readdir 결과만 키로 쓰고 경로를 합성하지 않아 traversal 경로 없음. (4) A1 spike 가드 부호 정정이 anti-gaming을 무력화하는지 — index.js:114-115 인용 정확하고 DD2가 영구 dormant 대가를 명시·backlog 등재하므로 은폐 아님. (5) Task 1 present-only 필드가 hash·receipt 위조 표면을 여는지 — receipt 축을 건드리지 않아 무관. 남긴 것은 위 3건이며 HIGH/CRITICAL 도달 근거를 찾지 못했다. |
| test | fail | plan이 인용한 file:line을 전부 열어 대조했다. 정확했던 것: msw-metrics/index.js:114-115 부호 결함, work-orchestrator.js:400-418·:582의 worktree= safeField 우회, state-injector.js:145, renderer/verdict.js:93-96·127, msw-events.js:254/419의 A1_AXIS_KINDS 라우팅(및 :541 export — Task 5가 요구하는 export는 이미 존재), env-contract lint의 L12 실재(L1~L12 표기 정확), Validation 스니펫 4의 require·computeMetrics 시그니처(동작함). Validation에 열거된 test 파일 11개는 전부 디스크에 실재한다. 반증에 성공한 축은 셋: (1) Task 5의 판별 단언 3종이 실제로는 kind vs dirIsShared를 구별하지 못한다 — A1 계수가 sessions 엔트리 경로 밖이고 B2는 session_start를 요구하기 때문(HIGH), (2) Task 9의 amber 확인이 자기 plan이 반증 불가라 적은 표면(MEDIUM), (3) Task 4 fixture의 producer 비현실성(LOW, 이미 이연 등재). 추가로 work-halt-record.test.js가 기존 결함을 pin하는지(:274 `· worktree=wt-second$`) 확인했으나 평문 이름이라 Task 2 착지 후에도 green이므로 회귀 아님. |
| invariant | fail | plan과 PRD를 읽고, 인용된 모듈을 직접 열어 대조했다: `msw-metrics/index.js:102-170`(A1 spike 가드의 실제 부호·기존 3상태 선례 확인), `receipt/write.js:1230-1252`(escalation clear 경로가 같은 decision_id의 후속 clean receipt를 요구함 확인), `review-rounds/ledger.js`(원장이 `<gate>__<slug>` 파일명으로 키잉됨 확인 → 재키잉이 원장 초기화와 동치임 실증), `msw-metrics/index.js:195-244`(A2 `sessions_local` fallback이 실재하며 Task 4가 오늘 동작을 유지함 — 여기서는 결함을 찾지 못했다). 열어본 게이트: 라운드 캡(열림 — 재키잉으로), A1 무결성 게이트(M3 이후 영구 dormant), escalation 알람 clear(수동 데이터 편집으로 열림). 반증하려다 실패한 축: DD3/Task 5의 kind 기준 경계는 `msw-events.js` 라우팅 주장과 정합하고 Validate가 세 방향(비-A1 차단 · A1 보존 · 자기 세션 보존)을 함께 요구해 fail-open 방향을 찾지 못했다. Task 2의 빈 값 생략 규율도 결함을 찾지 못했다. |

## Measurement

<!-- Written by plan-review/cli.js record on EVERY exit path, pass or halt.
     Machine-readable; do not hand-edit. A null field means the axis was
     not observed, never that it was zero. -->

```json
{
  "verdict": "divergent",
  "source": "multi-agent",
  "layers": {
    "l1": "converged",
    "l2": "divergent",
    "l3": "not fired"
  },
  "quorum": {
    "responded": 4,
    "required": 3,
    "roles": 4,
    "of": 4,
    "passed": false
  },
  "wall_clock_ms": 494188,
  "halt_stage": null,
  "backlog_appended": 8,
  "backlog_skipped_nonblocking": 7,
  "granted": 4,
  "reviewed_plan_hash": "sha256:6818cd91b666d858a945537ec0e7eca5470da1a58097d5d9cef7c5a436b96f79",
  "plan_path": ".claude/plans/orchestrator-step-wiring-m3-rev2.plan.md",
  "recorded_at": "2026-09-07T09:38:02.269Z"
}
```
