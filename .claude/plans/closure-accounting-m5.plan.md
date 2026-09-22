# Plan: closure-accounting M5 — residual-repair

**Source PRD**: `.claude/prds/closure-accounting.prd.md`
**Selected Milestone**: 5 — residual-repair
**Complexity**: Medium
**Branch**: `c11-closure-accounting` (HEAD `cc3ec4c` · 트리가 `origin/main` `d4f8296`과 동일 — `git diff --stat HEAD origin/main` 빈 출력)

## Summary

M1~M4가 착지한 뒤 남은 것을 닫는다. 대상은 네 갈래다. 첫째, closure-accounting 태그가 붙은
**backlog 미해소 행**. 둘째, **fix-task**(M4 PR-Codex F1: 여러 줄 code span 안의 수락 마커가
진짜 승인이 된다). 셋째, PRD의 **열린 질문 2건**. 넷째, 이번 사이클에서 **실측한 오작동**이다.
closure 계기가 소유한 결함은 코드와 test로 닫는다. 다른 서브시스템이 소유한 결함은 file:line
증거와 함께 backlog 새 행으로 넘긴다. 부채 상환 없음 · 재봉인 없음 · 새 임계 없음 · 게이트 없음.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | closure-accounting backlog에 남은 항목을 이번 마일스톤에서 수정한다 | direction |
| UI2 | fix-task가 가리키는 closure-accounting-m4 PR-Codex 결함을 수정한다 | direction |
| UI3 | PRD에 남아 있는 열린 질문을 처리한다 | direction |
| UI4 | 의도대로 동작하지 않는 기능을 실측하고 그 결함을 수정한다 | direction |
| UI5 | PRD의 Delivery Milestones 표에 새 마일스톤을 추가한다 | direction |
| UI6 | 분모 밖 부채의 목표값은 두지 않는 것으로 질문을 닫고, CI가 json 리포트를 artifact로 남겨 증가 속도를 사후에 재구성할 수 있게 한다 | constraint |
| UI7 | deferred 판정의 표본 판독은 이번 마일스톤에서 하지 않고 별도 meta-research로 분리하며, 그 질문은 열어 둔다 | exclusion |
| UI8 | closure-accounting 소유가 아닌 실측 결함을 이번 마일스톤에 포함할지는 Claude 판단으로 정한다 | exception |
| UI9 | 스냅샷 의미론과 봉인 결속 inventory_sha256은 바꾸지 않는다 (PRD 결정 1) | constraint |
| UI10 | 판정과 해소와 수정을 한 수로 접지 않는다 (PRD 결정 2) | constraint |
| UI11 | 리포트는 게이트가 아니며 근거 없는 임계를 만들지 않는다 (PRD 결정 4) | constraint |
| UI12 | backlog에 상태 열을 추가하지 않는다 (PRD 결정 5) | exclusion |

UI8의 판단 결과는 DD9에 적었다. closure 계기 소유분만 코드로 고치고, 타 소유분은 증거째
backlog로 넘긴다.

## Evidence (2026-09-15 · HEAD `cc3ec4c` · 전부 이 세션 실측)

**라이브 계기**
- `closure report`: sealed 2841 · live 3318 · gap **488 (14.71%)** · `net_change` 477 ·
  `sealed_not_live` **11** · Disposed 1101 / 2841 · Resolved 131 (fixed 1) · exit 0.
- 표 출력(`cli.js:82-90`)은 `sealed_not_live`와 `net_change`를 **렌더하지 않는다**. JSON에만 있다.
- `verifyDispositions`: `ok:false` · `open` 1740 · `invalid_dispositions` 0 · `binding_mismatch` 0 ·
  `ancestor_bound_lines` 1115 · `deferrals_by_successor` {minor 627, high 312, critical 31}.
- `m10-coverage-gate.js` exit **1** (사유 `dispositions.open` 1740 — M4 설계대로, 결함 아님) ·
  `reseal.js` plan exit 0 · `carried` 1100 · `dropped` 1 (`backlog:1072df3033b2d6c9`, deferred MEDIUM).
- CI `closure-report.yml`: run `34932510154`(pull_request) · `34935365492`(push main) 둘 다 success,
  step 전부 success. **json은 artifact로 남지 않는다** — 격차 증가 속도(0 → 454 → 488)를 사후에
  재구성할 수단이 없다.

**실측 오작동 (MF)**

| # | 결함 | 증거 | 소유 | M5 처리 |
|---|---|---|---|---|
| MF1 | 여러 줄 inline code span 안의 수락 마커가 승인으로 수락된다 (fix-task F1) | 한 줄 span → `[]`, 여러 줄 span → `["sha256:aaaa…"]` (`collectAcceptedShas` 직접 호출). `stripInlineCode`가 줄 단위로 호출된다(`debt-inventory.js:725-774`) | closure | Task 1 |
| MF2 | 봉인됐지만 라이브에 없는 11행 중 1행은 판정을 가지고 있어 다음 재봉인에서 떨어진다. 리포트 표에는 이 사실이 보이지 않는다 | `rowId`가 네 셀을 전부 해시한다(`derive/sources/backlog.js:63-72`) → 행을 제자리에서 편집하면 키가 바뀐다. 봉인 backlog 1584 중 11건이 라이브에 없고, 그중 판정 보유 1건 | closure (표면) · 식별 설계 (backlog) | Task 3 · Task 10 |
| MF3 | `escalate_pending: closure-accounting-m4`는 해제 경로가 없다 | `write.js:1240-1247`은 **같은 decision_id**의 receipt를 다시 쓸 때만 해제한다. m4 ship receipt는 git-tracked라 재봉인이 금지다(§3.12). PR #203 머지 후에도 STATE.md에 남아 있었고, M5 plan receipt write가 그 값을 `closure-accounting-m5`로 **덮어써서** 사라졌다 — 해제가 아니라 교체다 | receipt/write.js | Task 10 (backlog) |
| MF4 | fix-task 문구가 `divergent unresolved (rounds >= 3)`인데 실제 트리거는 `codex_verdict=divergent`이고 rounds=1이다 | `write.js:1193` 하드코딩 · `escalate-detector.js:58-64` · receipt `resolution.rounds` 1 | receipt/write.js | Task 10 (backlog) |
| MF5 | santa 채널은 `closures reachable: fixed`로 표기되지만 396건 opened · 0건 closed이다 | santa 실행 4건 모두 비수렴(divergent 3 · degraded 1)이다. **통과를 가정한** 시뮬레이션에서도 `deriveNonRecurrenceClosures`는 0/0/0을 낸다(ci-full-suite-m1 prior 204 · key null 93). `findings-registry.js:853-878` | findings-registry (MSW M7) · santa | Task 10 (backlog) |
| MF6 | PRD 경로로 `/mccp:plan`을 부르면 slug가 `closure-accounting`이 되어 라운드 원장(`rounds_so_far` 3)에 막힌다 | `derive-decision` → `closure-accounting` · `review-rounds status` → 3 / 캡 1. backlog 1837행의 **2회째 재현** | commands/plan.md | Task 10 (backlog **새 행**) |
| MF7 | M4 report의 "Task 7 PR run URL 미확보"가 낡은 서술로 남아 있다 | 위 CI run 2건 | closure 문서 | Task 11 |
| MF8 | CI가 json을 남기지 않아 OQ2의 실질(격차 증가 속도)을 측정할 수 없다 | `closure-report.yml`에 upload step 0개 | closure CI | Task 9 |
| MF9 | hybrid 모드는 L3 Codex finding을 판정할 경로가 없어, plan receipt를 `MCCP_SKIP_INTENT_GATE` 없이 쓸 수 없다 | `plugins/mccp/commands/plan.md` 5.6b는 "panel 모드는 `write.js`가 intent를 skipped로 찍는다"고 적지만 `plugins/mccp/scripts/receipt/write.js:291-349`는 `review_source === 'multi-agent'`만 skip한다. 이 M5 게이트도 `INTENT_GATE_BLOCKED`로 거부됐다. `closure-accounting-m3`·`m4`·`m5` plan receipt **3연속** `intent_gate_force_override:true` | codex-intent-context · commands/plan.md | Task 10 (backlog) |

**선재 red(범위 밖, 재확인만)**: `M8-B3-SET-EQUALITY`(`msw-m8-producers.test.js`) ·
`santa-loop-cap` DD3 symlink — 2026-09-15에도 fail 2, 이미 backlog 1853·1854행.

## Backlog triage (closure-accounting 태그 · M4 이후 미해소 후보 전수)

행 번호는 `cc3ec4c` 기준 `.claude/plans/codex-findings-backlog.md` 줄 번호다.

| 행 | 요지 | 판정 | 근거 / 처리 |
|---|---|---|---|
| 1005 | 소비처 연속성 test가 reseal 출력을 보지 않아 반증 불가 | **FIX** | Task 6 |
| 1679 | manifest가 목표 inventory를 영속화하지 않아 봉인 교체 전 크래시 창의 복구가 없다 | 이연 유지 | 내구성 설계 축이다. manifest가 없으면 시작하지 않으므로 fail-closed이고, 재봉인은 수명 전체에서 2회뿐이며 사고 0건이다 |
| 1828 · 1851 | 소스 스캔 falsifier가 emitter **호출**을 증명하지 못한다 | **FIX** | Task 8 (R9) |
| 1829 | `formatTable` 채널별 행에 자동 test가 없다 | **FIX** | Task 4 |
| 1830 | 패널 종결 경로가 `accepted`를 거른다 | 범위 밖 | `plan-review/cli.js:1074` — diverse-agent-review 소유 |
| 1831 | DD5 서술("판정·종결 이벤트는 gate_id를 싣지 않는다")이 부분적으로 거짓 | obsolete | plan 산문이다. 분류 결과는 성립한다(fold가 opened의 gate_id를 물려받는다) |
| 1832 | `PRODUCER_CHANNELS` ↔ `channelOf` 결속 부재 | 이연 유지 | 결속하려면 패널의 동적 perspective를 파싱해야 한다. R7이 규칙 순서를 고정한다 |
| 1833 | producers degraded 사유 스크럽 미지정 | 해소됨 | `report.js:620-625` 사유가 고정 문자열이라 경로가 섞일 수 없다 |
| 1834 | R4가 죽은 코드의 `CLOSURE_FROM_ADJUDICATION[`로도 통과한다 | 부분 해소 · 이연 유지 | Task 8의 R9가 "호출되지 않는 emitter 함수"를 잡는다. 호출되는 함수 밖의 죽은 참조는 남는다 |
| 1835 | R6 전수 스캔에 주석 줄 제외가 없다 | 해소됨 | `findings-producer-reachability.test.js:40-57` `stripCommentLines` · R8 innocent-doc/block 대조 |
| 1836 | DD3 영향 표면 누락 | obsolete | M3 plan 산문 · 런타임 무관 |
| 1839 | M3 Validation test 경로 오기 | obsolete | ship 완료된 plan |
| 1840 | 리포트를 못 만든 실행이 green으로 게시된다 | 해소됨 | `closure-report.yml` "Check the json report parses" · redirect 그룹 밖 실행 · `(w2)` |
| 1841 | m10 `checkSeal`의 조상 판정이 verify와 갈릴 수 있다 | **FIX** | Task 2 |
| 1842 | 리포트가 `sealAncestry`를 한 실행에 두 번 부른다 | **FIX** | Task 3 |
| 1843 | reseal lock 소유권이 pid(+host·시각)뿐이다 | **FIX** | Task 5 |
| 1844 | `aborted:'locked'` 경로 스크럽 | 해소됨 | `reseal.js:131-189`의 사유는 `LOCK_REL`(상대경로)만 쓴다 · `:487` |
| 1845 | "소비처 4곳 모두 degraded 경로가 있다"가 거짓 | **FIX** (handoff) · 해소됨 (derive) | `derive/sources/findings.js:135-140`에는 경로가 있다. `state/handoff-items.js`에는 0건 → Task 7 |
| 1846 · 1847 | Task 0 `grep -c` · Validation 7 미단언 | obsolete | M5 Validation은 종료코드를 단언한다 |
| 1848 | `invalid_dispositions` 부재 → 유효로 접힘 | 해소됨 | `report.js:364-370` typeof 가드 · `(v4)` |
| 1849 | 빈 lock body가 영구 `locked` | 해소됨 | `reseal.js:136-143` 복구 지침과 함께 거절 · `msw-reseal.test.js:720` |
| 1850 | `sealed_at_commit` 도달성 미검증 | 해소됨(실측) | `git merge-base --is-ancestor e5d274c HEAD` → reachable. 이 필드를 읽는 게이트는 없다 |
| 1852 | job summary의 텍스트 fence를 리포트 내용이 조기 종료시킬 수 있다 | **FIX** | Task 9 |
| 1853 · 1854 | 선재 red 2건 | 범위 밖 | msw M8 · santa-loop 소유 — 재확인만 |
| 1855 | `debt-inventory.js` 1314줄 | 이연 유지 | 동작 변화 없는 분할이다. 소비처가 많고 결함은 없다. 경계에 걸친 분할은 별도 축이다 |
| 1856 | successor 파일 소실 시 행 전체가 null | 이연 유지 | 실측: deferred successor **1953줄 전부**가 `docs/multi-session-work-loop/` 아래다. `/mccp:archive-complete`가 옮기는 경로가 아니므로 현재 도달 불가다 |
| 1857 | 여러 줄 code span 마커 (fix-task F1) | **FIX** | Task 1 |
| 1837 · 1838 | PRD 경로 slug · STATE.md fingerprint | 범위 밖 | commands/plan.md · state 소유 — 1837은 재현 증거를 **새 행**으로 append (Task 10) |

## Open Questions 처리

| OQ | 처리 |
|---|---|
| 분모 밖 부채의 목표값 | **닫는다 — 목표값을 두지 않는다** (UI6, 사용자 판정 2026-09-15). 결정 4의 확정이다. M5는 CI가 json을 run artifact로 남기게 해서(Task 9) 속도를 사후에 재구성할 수 있게 한다 |
| `deferred` 판정을 어떻게 볼 것인가 | **열어 둔다 · M5 범위 밖** (UI7). `/mccp:meta-research`가 표본 판독으로 답한다. PRD의 해당 OQ를 그 방향으로 갱신한다 |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 줄 보존 치환 | `plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js:695-697` | `blankPreservingLines` — 지운 구간의 개행 수를 보존해 줄 구조를 유지한다 |
| producer 대조 | `plugins/mccp/scripts/lib/msw-metrics/m10-coverage-gate.js:164-170` | `checkDispositions`가 자체 계산 후 `verifyDispositions`와 대조한다. 어긋나면 `producer_agrees:false` → `ok:false` |
| 판독 불가는 0이 아니다 | `plugins/mccp/scripts/lib/closure/report.js:353-374` | typeof 가드 → degraded 사유 명시, 성공 방향 기본값 금지 |
| lock 소유 토큰 | `CLAUDE.md` §3.6 `quarantine.lock` · `plugins/mccp/scripts/lib/msw-metrics/reseal.js:112-118` | body에 `crypto.randomUUID()` 평문 · release는 토큰 일치 시에만 |
| fail-open stderr | `plugins/mccp/scripts/state/handoff-items.js:158-162` | `[mccp:handoff-items] … — nothing is suppressed` 형태의 loud 경고 후 진행 |
| 스캐너 양성 대조 | `plugins/mccp/scripts/lib/tests/findings-producer-reachability.test.js:193-245` | `makeTree`로 임시 트리를 만들어 스캐너가 실제로 잡는지 확인 (R8) |
| 실제 git fixture | `plugins/mccp/scripts/lib/tests/msw-reseal.test.js:43-100` | `makeRepo` · `sealAndDispose` — 가짜 `.git`이면 조상 test가 공허해진다 |
| workflow test | `scripts/tests/closure-report-workflow.test.js` `(w1)`~`(w6)` | 주석 제거 후 YAML 텍스트 단언 + `(w6)` CLI 실제 spawn |
| artifact step | `.github/workflows/test-suite.yml:210-218` | `actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4` SHA 핀 |
| test 라벨 | `plugins/mccp/scripts/lib/tests/msw-m10-producers.test.js:735-770` | `(t1)`… 케이스 라벨 + 양성 대조를 같은 test 안에 |
| backlog 행 | `.claude/plans/codex-findings-backlog.md` 1855-1857행 | `\| date \| SEV \| \`path:line\` (출처 — 이연 사유) \| **제목.** 본문 \|` — **새 행만 append** |

## Design Decisions

**DD1 — F1은 span을 짝짓지 않는다. 원문의 빈 줄로 나눈 문단에 backtick이 하나라도 있으면 그 문단의 마커를 받지 않는다.**
(L3 Codex R1 HIGH 흡수. 초안은 "앞 단계가 비운 줄도 경계로 보고 문단 단위로 짝짓는다"였고, 그 근사가 과다 제거
방향으로만 틀린다고 주장했다. 거짓이었다 — 4칸 들여쓰기 줄은 CommonMark에서 문단을 끊지 못하는 연속 줄인데,
들여쓰기 pass가 그 줄을 비우면 초안은 거기서 span을 끊어 마커를 노출한다. Codex가 markdown-it으로 확인했다.)
짝짓기는 어느 방향으로 근사해도 안전하지 않다. 경계를 CommonMark보다 **늘리면** span이 잘려 노출되고,
**줄이면**(빈 줄로만 묶으면) 앞 문단의 짝 없는 backtick이 뒤 문단의 여는 backtick을 가져가 짝이 밀리고 노출된다.
그래서 짝을 계산하지 않는다. CommonMark code span은 빈 줄을 넘지 못하므로, 원문 기준으로 빈 줄 사이 묶음에
backtick이 없으면 그 묶음의 어떤 글자도 code span 안에 있을 수 없다 — 이 판정은 **구성상 과다 제거로만** 틀린다.
판정은 앞 pass들이 비우기 **전의 원문**으로 한다(비운 줄에 있던 backtick도 센다). 비용: 인라인 코드와 같은
문단에 둔 진짜 마커는 거절된다. 실측: 라이브 successor 문서 3개의 마커는 모두 backtick 없는 독립 문단에 있다
(`docs/multi-session-work-loop/debt-deferred-{critical,high,minor}.md` 7행). 쓰이지 않게 되는 `stripInlineCode`
(`debt-inventory.js:703-723`, 유일 호출처 `:763`)는 지운다.

**DD2 — m10은 독립 재계산을 유지하고 대조를 더한다.** m10 헤더(`:24-29`)는 "producer의 자기 보고를
그대로 믿지 않는다"를 원칙으로 적었다. 따라서 1841을 "복제 제거"로 풀면 원칙이 무너진다.
`checkSeal`이 `verifyDispositions`의 `ancestor_bound_lines`·`binding_mismatch`와 자기 계산을
대조하고, 조상 판정이 불가한 경우는 verify의 `ancestry_depth === null`과 대조한다. 어긋나면
`producer_agrees:false` → `ok:false`다. `checkDispositions`와 같은 형태다.

**DD3 — 리포트의 조상 깊이는 이미 한 번 부른 verify에서 읽는다.** `verifyDispositions`는
`ancestry_depth`를 이미 반환한다(`debt-inventory.js:1036`). `report.js:436-443`의 두 번째
`sealAncestry` 호출을 지운다. verify를 부르지 못한 경로(모듈에 함수 없음 · throw · early return)는
`null`이다. 판독 불가는 0이 아니라는 기존 규칙과 같다.

**DD4 — `rowId`는 바꾸지 않고, 떨어질 판정 수를 표면화한다.** 식별을 안정 키로 바꾸면 봉인 2841건과
판정 줄 전부의 결속이 끊긴다(UI9 · 결정 1). 대신 리포트가 `denominator_gap.sealed_not_live_disposed`
(라이브에 없는데 현재 봉인에 묶인 판정을 가진 항목 수)를 싣고, 표가 `sealed_not_live`·`net_change`와
함께 렌더한다. 식별 설계 문제 자체는 backlog로 넘긴다(Task 10).

**DD5 — lock 토큰은 body 안의 nonce다.** `quarantine.lock`과 같은 모델이다. IPC는 없다 — 단일 프로세스
안에서만 쓰기 때문이다. `sameOwner`는 양쪽 body에 nonce가 있으면 nonce까지 비교한다. nonce가 없는
구 body끼리는 기존 3필드로 비교한다. 그래야 구 코드가 남긴 dead-pid lock의 회수 경로가 유지된다.

**DD6 — handoff는 fail-open을 유지하고, degraded를 표면화만 한다.** 계측이 인계를 막으면 안 된다는
기존 원칙(`handoff-items.js:131-132`)을 따른다. `readAll`이 degraded면 stderr 경고를 내고, 반환에
`degraded`(모든 경로에서 boolean) · `degraded_reasons`를 **추가**한다. 기존 소비처는 `.items`만 읽으므로
하위 호환이다.

**DD7 — R9는 호출처 존재를 소스 스캔으로 증명한다.** 행동 spawn test는 emitter 3개가 각자 무거운 실행
경로를 가져 비용이 크다. R9는 "`appendFindings(`를 부르는 함수는 자기 정의 밖에서 비-test 소스로부터
적어도 한 번 호출된다"를 단언하고, R8처럼 양성 대조를 둔다. 주장 범위는 "어딘가에서 호출된다"이다.
"라이브 경로에서 실행된다"는 주장하지 않는다.

**DD8 — CI artifact는 기본 보존 기간을 쓰고 부재 시 실패한다.** `retention-days`를 명시하지 않는다.
저장소 설정의 상한을 넘기면 동작이 달라질 수 있기 때문이다. `if-no-files-found: error`로 둔다. 앞 step이
json을 이미 검증하므로, 여기서 파일이 없다는 것은 "계기가 실행되지 못했다"와 같은 뜻이다 —
red의 의미(M4 OQ5 답)와 일치한다. fence 길이는 리포트 안의 가장 긴 backtick 연속보다 1 길게 계산한다.

**DD9 — UI8 판단: 타 소유 결함은 코드가 아니라 증거로 넘긴다.** MF3·MF4(`receipt/write.js`)는 모든
게이트의 receipt writer다. 여기서 해제 규칙을 새로 만들면 영향이 전 게이트로 번지고, 그 규칙
자체가 설계를 요구한다. MF5(비재발 오라클)의 보수성은 의도된 설계이고 소유자가 다르다. MF6은
`commands/plan.md` 소유다. 넷 모두 file:line과 재현 명령을 담은 backlog **새 행**으로 넘긴다.
fix-task에 대해 M5가 하는 일은 그 **결함(F1)을 흡수**하는 것이다. escalation 경고는 MF3이 고쳐지기
전까지 남으며, 그 사실을 report에 적는다.

**DD10 — 재봉인도 판정 append도 하지 않는다.** M4 선례를 따른다. M5가 고친 행 대부분(09-14·09-15자)은
봉인(09-08) 뒤에 생겨 현재 분모에 없으므로, `fixed` 판정을 붙일 수 없다. `fixed`는 1로 남는다(UI10).

**DD11 — backlog 행은 제자리에서 편집하지 않는다.** MF2가 보여주듯 편집은 식별을 바꾸고 판정을
떨어뜨린다. 1837행의 재현 증거도 새 행으로 append한다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js` | UPDATE | Task 1 — backtick 있는 문단의 마커 거절 · `stripInlineCode` 삭제 (MF1 · 1857 · L3 HIGH) |
| `plugins/mccp/scripts/lib/tests/msw-m10-producers.test.js` | UPDATE | Task 1 — `(t5)`~`(t10)` 여러 줄 span · 들여쓰기 연속 · 짝 밀림 · 비용 고정 · 양성 대조 |
| `plugins/mccp/scripts/lib/msw-metrics/m10-coverage-gate.js` | UPDATE | Task 2 — 봉인 축 producer 대조 (1841) |
| `plugins/mccp/scripts/lib/msw-metrics/reseal.js` | UPDATE | Task 5 — lock body nonce (1843) |
| `plugins/mccp/scripts/lib/tests/msw-reseal.test.js` | UPDATE | Task 2 · Task 5 · Task 6 test |
| `plugins/mccp/scripts/lib/closure/report.js` | UPDATE | Task 3 — 조상 깊이 단일 호출 (1842) · `sealed_not_live_disposed` (MF2) |
| `plugins/mccp/scripts/lib/closure/cli.js` | UPDATE | Task 3 표 렌더 · Task 4 `formatTable` export |
| `plugins/mccp/scripts/lib/closure/tests/report.test.js` | UPDATE | Task 3 test |
| `plugins/mccp/scripts/lib/closure/tests/cli.test.js` | CREATE | Task 4 — `formatTable` 채널 행 · null 렌더 · gap 행 (1829) |
| `plugins/mccp/scripts/state/handoff-items.js` | UPDATE | Task 7 — registry degraded 표면화 (1845) |
| `plugins/mccp/scripts/lib/tests/c1-feedback-loop.test.js` | UPDATE | Task 7 test |
| `plugins/mccp/scripts/lib/tests/findings-producer-reachability.test.js` | UPDATE | Task 8 — R9 호출 도달성 + 양성 대조 (1828 · 1851) |
| `.github/workflows/closure-report.yml` | UPDATE | Task 9 — json artifact (OQ2 · MF8) · 동적 fence (1852) |
| `scripts/tests/closure-report-workflow.test.js` | UPDATE | Task 9 — `(w7)` artifact step · `(w8)` fence 행동 test |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | Task 10 — 타 소유 실측 결함 6행 append (MF2 식별 · MF3 · MF4 · MF5 · MF6 · MF9) |
| `docs/multi-session-work-loop/debt-inventory.md` | UPDATE | Task 11 — 마커 규칙 · 봉인 축 대조 · lock nonce · 행 편집 재키잉 · artifact |
| `.claude/prds/closure-accounting.prd.md` | UPDATE | Task 11 — M5 행 status (ship 시 `complete`) |
| `.claude/PRPs/reports/closure-accounting-m4-report.md` | UPDATE | Task 11 — "PR run URL 미확보" 정정 (MF7) |
| `CHANGELOG.md` | UPDATE | Task 11 — `## [Unreleased]` 항목 |
| `.claude/PRPs/reports/closure-accounting-m5-report.md` | CREATE | Task 12 — 라이브 완주 산출 |
| `.claude/plans/closure-accounting-m5.plan.md` | GATE | 게이트 산출물 — 이 plan 자체(리뷰 절·이탈 기록이 붙는다). 구현 범위 아님 |
| `.claude/reviews/plan-review-closure-accounting-m5.md` | GATE | 게이트 산출물 — plan 리뷰 기록 |
| `.claude/state/findings/closure-accounting-m5.jsonl` | GATE | 게이트 산출물 — findings registry shard |
| `.claude/state/STATE.md` | GATE | 게이트 산출물 — 세션 연속성(state-writer가 쓴다) |
| `.claude/state/fix-task-applied.md` | GATE | 게이트 산출물 — escalation fix-task(receipt writer가 쓴다, MF3·MF4) |

`plugins/mccp/.claude-plugin/plugin.json`은 **건드리지 않는다** (§3.7 · `version-declaration-guard`).

## Tasks

### Task 0: 전제 확인

- **Action**: (a) 트리가 `origin/main`과 같은지 확인한다. (b) 수정 대상 함수가 **존재하는지** `node -e`의
  `typeof`로 확인한다 — `grep -c`는 함수 부재를 잡지 못한다(1846). 대상: `stripQuotedForMarker` ·
  `collectAcceptedShas` · `verifyDispositions`(debt-inventory) · `acquireLock`/`releaseLock`(reseal) ·
  `enumerateOpenFindings`(handoff) · `buildClosureReport`(report). (c) 라이브 불변식 기준값을 scratch에
  저장한다: `verifyDispositions`의 `invalid_dispositions`와 `deferrals_by_successor`.
- **Mirror**: M4 Task 0.
- **Validate**: `git diff --quiet HEAD origin/main && echo same` · 각 `typeof === 'function'` 단언이 exit 0.

### Task 1: 인라인 코드와 문단을 공유하는 수락 마커를 받지 않는다 (MF1 · 1857 · fix-task · L3 HIGH)

- **Action**: `stripQuotedForMarker`(`debt-inventory.js:725`)의 마지막 pass를 바꾼다. 입력 원문을 빈 줄
  (`trim() === ''`)로 묶고, 묶음의 **원문**에 backtick이 하나라도 있으면 그 묶음에 속한 출력 줄을 전부 빈 줄로
  만든다. 그 밖의 줄은 앞 pass(fence · blockquote · 들여쓰기 · raw-text)의 결과를 그대로 둔다. 줄 수는 보존한다.
  span 짝짓기는 하지 않으며, 호출처가 사라지는 `stripInlineCode`(`:703-723`)는 지운다(DD1).
- **Mirror**: `blankPreservingLines`(`:695-697`)의 줄 수 보존 · 같은 함수의 "미종결 fence·raw-text는 EOF까지 거절" 규칙(과다 제거 방향).
- **Validate**: `msw-m10-producers.test.js`의 "a marker inside a code span or a raw-text block is not acceptance"를 확장한다.
  기존 단언은 **전부 그대로 통과해야 한다**(양성 대조 3건 포함).
  `(t5)` 여는 backtick 줄 + 마커 줄 + 닫는 backtick 줄 → 거절.
  `(t6)` 양성 대조: backtick 문단, 빈 줄, 마커만 있는 문단, 빈 줄, backtick 문단 → **수락**.
  `(t7)` 이중 backtick span이 줄을 넘는 경우 → 거절.
  `(t8)` L3 반례: 여는 backtick 1개로 끝나는 줄, 4칸 들여쓰기 연속 줄, 마커 줄, 닫는 backtick 줄 → 거절.
  `(t9)` 짝 밀림: 짝 없는 backtick 1개가 있는 문단, 빈 줄, 마커를 backtick으로 감싼 문단 → 거절.
  `(t10)` 비용 고정: 인라인 코드와 마커가 같은 문단 → 거절(DD1이 받아들인 과다 제거를 test 이름으로 명시).
  줄 수 보존 단언(`stripQuotedForMarker(x).split(/\r?\n/).length === x.split(/\r?\n/).length`)을 함께 둔다.
  라이브 불변식: Task 0 기준값과 비교해 `invalid_dispositions` 0 유지 · `deferrals_by_successor` 동일.

### Task 2: m10 봉인 축이 verify와 어긋나면 스스로 실패한다 (1841)

- **Action**: `checkSeal`(`m10-coverage-gate.js:74`)에서 `debt.verifyDispositions(repoRoot)`를 한 번 부른다.
  조상 판정 가능 시 `reported.ancestor_bound_lines === ancestorBound && reported.binding_mismatch === mismatched`,
  판정 불가(`anc === null`) 시 `reported.ancestry_depth === null`이면 `producer_agrees:true`다. 결과에
  `producer_agrees`를 싣고, `ok`에 `producer_agrees`를 AND한다. 판정 불가 분기의 반환에도 같은 필드를 싣는다.
  verify가 throw하거나 객체가 아니면 `producer_agrees:false`다(판독 불가는 동의가 아니다).
- **Mirror**: `checkDispositions`의 `agrees` 계산(`:164-170`) · DD2.
- **Validate**: `msw-reseal.test.js` 새 test "the gate seal axis fails when verify disagrees, and agrees on a
  malformed chain". (a) 정상 재봉인 fixture → `producer_agrees:true` · `seal.ok:true`. (b) `debt` 모듈을
  얕게 감싸 `verifyDispositions`만 `ancestor_bound_lines`를 1 늘려 돌려주게 한다 → `producer_agrees:false` ·
  `ok:false`. (c) 조상 판정 불가 fixture(기존 "a malformed ancestry folds the whole array to null" 구성) →
  `ok:false`이면서 `producer_agrees:true`(두 계산이 같은 결론). (d) verify throw stub → `producer_agrees:false`.

### Task 3: 리포트 — 조상 깊이 단일 호출 · 떨어질 판정 수 표면화 (1842 · MF2)

- **Action**:
  1. `report.js:353-374`의 `verified`를 블록 밖에서 보이게 하고, `:436-443`의 `debtInv.sealAncestry` 직접
     호출을 지운다. `sealAncestryDepth`는 `verified`의 `ancestry_depth`가 정수면 그 값, 아니면 `null`이다(DD3).
  2. `:475-495`에서 `sealed_not_live` 항목 id 중 **현재 봉인 sha에 묶인 판정 줄**(`:273-275`에서 이미 거르는
     집합)을 가진 수를 `sealedNotLiveDisposed`로 센다. `identityIncomplete`거나 판정 축이 막혔으면
     (`disposalBlocked`) `null`이다. `finalDenominatorGap`(`:688-696`)에 `sealed_not_live_disposed`로 싣는다.
  3. `reseal_warning`(`:652-661`)은 `sealedNotLiveDisposed > 0`일 때 "그중 N건은 판정을 가지고 있어 다음 재봉인이
     dropped로 보고한다"를 덧붙인다. 0이거나 null이면 문구를 바꾸지 않는다.
  4. `cli.js:82-90` 표에 `Net change:       477 (live − sealed; may be negative)`와
     `Sealed not live:  11 (1 with a disposition — dropped at the next re-seal)` 줄을 추가한다.
     `Net change`의 괄호 힌트는 바로 위 `Count`(집합 차이)와 의미가 다르다는 것을 줄 안에서 말한다
     (design critique R0 P2 — 크기가 비슷한 두 수가 나란히 서면 중복이나 불일치로 읽힌다).
     값이 null이면 `n/a`로 렌더한다(`null` 문자열 금지 — M4 L1 규칙).
- **Mirror**: M4의 `(o1)` 순서 무관 · DD4 · "판독 불가는 0이 아니다".
- **Validate**: `report.test.js`. `(d1)` mock `debtInv`가 `sealAncestry` 호출 수를 센다 → 리포트는 **0회**
  직접 호출하고, `seal.ancestry_depth`가 mock verify의 값과 같다. `(d2)` verify 함수가 없는 mock →
  `ancestry_depth === null`. `(s1)` 봉인 3건 중 1건이 라이브에서 사라지고 그 항목에 현재 sha 판정이 있음 →
  `sealed_not_live 1` · `sealed_not_live_disposed 1` · 경고 문구에 포함. `(s2)` 사라진 항목에 판정 없음 →
  `sealed_not_live_disposed 0` · 경고 문구 불변. `(s3)` `identityIncomplete` → `null`.

### Task 4: `formatTable` 채널 행에 자동 test를 둔다 (1829)

- **Action**: `cli.js`의 `module.exports`에 `formatTable`을 추가한다(동작 변경 없음).
  `plugins/mccp/scripts/lib/closure/tests/cli.test.js`를 새로 만든다.
- **Mirror**: `report.test.js`의 `REPO_ROOT` 부팅 단언 · 라벨 스타일.
- **Validate**: `(c1)` producers 5채널 fixture → `Producers:` 아래 5줄. 미등록 채널은 `not registered in the findings
  registry`, `unattributed`는 `not a declared producer`, owner가 있으면 `(owner: …)` 접미사. `(c2)` `closed:null`
  ledger → `not counted (see Denominator)` · `n/a` · `null` 문자열 0회. `(c3)` Task 3의 gap 3줄 렌더와 null →
  `n/a`. `(c4)` producers 필드 부재 → `Producers:` 줄 0회(키 존재 기반 분기).

### Task 5: reseal lock 소유권에 nonce를 더한다 (1843)

- **Action**: `selfBody`(`reseal.js:112`)에 `nonce: crypto.randomUUID()`를 추가한다. `sameOwner`(`:116`)는
  양쪽에 `nonce`가 있으면 `nonce`까지 비교하고, 한쪽이라도 없으면 기존 3필드로 비교한다(DD5).
- **Mirror**: §3.6 `quarantine.lock` raw token in-body.
- **Validate**: `msw-reseal.test.js`. `(n1)` pid·host·started_at이 같고 nonce만 다른 body가 lock 파일에 있으면
  `releaseLock`이 unlink하지 **않는다**(pid 재사용 시나리오). `(n2)` nonce 없는 구 body의 dead-pid lock은
  기존대로 회수된다(기존 "reclaims a dead one" test가 구 body로도 green). `(n3)` 정상 acquire→release 왕복이
  lock을 남기지 않는다.

### Task 6: 소비처 연속성을 reseal 출력으로 반증 가능하게 만든다 (1005)

- **Action**: `msw-reseal.test.js`에 test를 추가한다. `makeRepo` + `sealAndDispose` fixture에서 재봉인 전
  `scanBacklog(root)`의 `closed_count`·`resolved_count`를 잰다. 그다음 backlog 행 1개를 append하고
  `applyReseal`로 승계한 뒤 다시 잰다. 기존 행 판정이 승계됐으므로 두 값은 **같아야** 하고,
  새 행은 `open_count`에만 더해져야 한다.
- **Mirror**: 같은 파일 "a re-seal appends carried lines and never edits the old ones"(`:102`)의 호출 형태.
- **Validate**: test green. 비공허성 확인: 승계 줄의 `inventory_sha256`을 옛 sha로 바꾸는 mutation(fixture에서
  승계 직후 ledger 줄을 치환) → `closed_count`가 0으로 떨어져 red.

### Task 7: handoff 승격이 registry degraded를 조용히 삼키지 않는다 (1845)

- **Action**: `enumerateOpenFindings`(`handoff-items.js:133`)에서 `all.degraded`면 stderr에
  `[mccp:handoff-items] findings registry degraded (<n> reason(s)) — the promotion list may be incomplete`를
  쓰고, 반환에 `degraded: true` · `degraded_reasons`를 싣는다. 정상 경로와 catch 경로(`:194-198`) 모두
  `degraded`를 boolean으로 싣는다(EMPTY 형태 규칙). 승격 동작 자체는 바꾸지 않는다(DD6).
- **Mirror**: 같은 함수의 suppression 실패 경고(`:158-162`) · `derive/sources/findings.js:135-140`.
- **Validate**: `c1-feedback-loop.test.js`. `(p1)` `.claude/state/findings`를 **파일**로 만들어 열거를 ENOTDIR로
  실패시킨다(M4 `findings-registry.test.js` 선례) → `degraded:true` · `items` 빈 배열 · stderr 경고 1회.
  `(p2)` 정상 registry → `degraded:false`. 경고 문자열에 절대경로가 없음을 음성 단언한다.

### Task 8: R9 — 선언된 emitter 함수는 실제로 호출된다 (1828 · 1851)

- **Action**: `findings-producer-reachability.test.js`에 helper 두 개와 test 두 개를 추가한다.
  `appendFindingsCallers(code)`는 `appendFindings(`가 나오는 줄마다 가장 가까운 앞의 `function NAME(`을 모아
  이름 집합을 만든다(ponytail: 줄 단위 근사 — 화살표 함수·메서드 속성은 보지 못한다). `uncalledEmitters(root, rels)`는
  `scanSources(root)`의 주석 제거 코드 전체에서 `\bNAME\s*\(` 매칭 중 `function NAME(` 정의를 뺀 수가 0인 이름을 돌려준다.
  `(R9)`는 `registers:true`인 선언 채널마다 `uncalledEmitters`가 빈 배열임을 단언한다.
  `(R9b)`는 `makeTree` 양성 대조다. 호출되지 않는 `emitX`를 가진 트리 → `['emitX']`, 호출 파일을 더한 트리 → `[]`,
  **주석 안의 호출만 있는** 트리 → `['emitX']`.
- **Mirror**: R8(`:213`)의 `makeTree` · `scanSources` · DD7.
- **Validate**: 오늘 R9 green(실측: `emitSantaFindings` · `emitCodexFindings` · `emitAdjudicationOutcomes` ·
  `emitPanelClosures` · `emitPanelFindings` 비-test 호출처 각 1). mutation: `plan-codex-runner.js:599`의
  `emitAdjudicationOutcomes(` 호출을 임시로 주석 처리 → `(R9)` red(1828이 적은 정확한 시나리오).

### Task 9: CI가 json을 artifact로 남기고, summary fence를 내용이 닫지 못한다 (OQ2 · MF8 · 1852)

- **Action**: `closure-report.yml`.
  1. "Check the json report parses" 뒤에 step "Upload the json report"를 추가한다.
     `uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4` ·
     `name: closure-report` · `path: closure-report.json` · `if-no-files-found: error`. `if:`와 `retention-days`는
     두지 않는다(DD8).
  2. "Publish to the job summary"는 fence를 `node -e`로 계산한다. 리포트 안의 가장 긴 backtick 연속 + 1,
     최소 3이다. 같은 문자열로 열고 닫는다.
- **Mirror**: `.github/workflows/test-suite.yml:210-218` · 기존 `(w1)`~`(w6)`.
- **Validate**: `closure-report-workflow.test.js`. `(w7)` upload step이 json parse step **뒤**에 있고, `path`가
  `closure-report.json`이며, `if-no-files-found: error`다(SHA 핀은 `(w4)`가 자동 검사). `(w8)` publish step의
  `run:` 블록을 추출해 임시 디렉토리에서 `bash`로 실행한다. `closure-report.txt`에 ```` ``` ```` 줄과
  ```` ```` ```` 줄을 넣고 `GITHUB_STEP_SUMMARY`를 임시 파일로 지정한다 → 첫 줄 fence 길이 ≥ 5, 마지막 줄이
  첫 줄과 같고, 두 backtick 줄이 그 사이에 있다. mutation: fence를 리터럴 ```` ``` ````으로 되돌리면 `(w8)` red.

### Task 10: 타 소유 실측 결함을 증거째 backlog에 넘긴다 (DD9 · DD11)

- **Action**: `.claude/plans/codex-findings-backlog.md` 끝에 `2026-09-15` 새 행 6개를 append한다. **기존 행은 편집하지 않는다.** (plan 게이트가 이미 같은 날짜로 리뷰 findings 5행을 append했다 — 그 행들과 겹치지 않는다.)
  1. MEDIUM `plugins/mccp/scripts/receipt/write.js:1240-1247` — tracked ship receipt에 붙은 `escalate_pending`은
     해제 경로가 없다(MF3). 재현: STATE.md `escalate_pending_decision_id: closure-accounting-m4`가 PR #203
     머지 후에도 남음. 해제 조건 "같은 decision_id receipt 재기록"은 §3.12 `TRACKED_RECEIPT_OVERWRITE`와 충돌.
  2. LOW `plugins/mccp/scripts/receipt/write.js:1193` — `deriveEscalateSummary`가 `divergent_unresolved`를 항상
     `(rounds >= 3)`으로 적는다. `codex_verdict` 트리거(`escalate-detector.js:58-64`)에서는 rounds=1이다(MF4).
  3. MEDIUM `plugins/mccp/scripts/state/findings-registry.js:853-878` — 비재발 종결이 실제 santa 데이터에서
     통과를 가정해도 0건이다. santa 실행 4건 모두 비수렴이라 `closures reachable: fixed`는 선언상으로만 참이다(MF5).
     시뮬레이션 수치를 싣는다.
  4. MEDIUM `plugins/mccp/commands/plan.md` Phase 5 — 1837행의 **2회째 재현**. 이번 `/mccp:plan` 실행이
     `closure-accounting`(rounds_so_far 3)으로 해소됐다. 행 편집이 식별을 바꾸므로(5번) 새 행으로 둔다(MF6).
  5. MEDIUM `plugins/mccp/scripts/derive/sources/backlog.js:63-72` — `rowId`가 네 셀을 전부 해시해 행을 제자리에서
     편집하면 키가 바뀐다. 봉인 11건이 라이브에 없고 그중 1건(`backlog:1072df3033b2d6c9`)의 판정이 다음 재봉인에서
     떨어진다. 안정 식별로 바꾸려면 전 결속 마이그레이션이 필요하다. M5는 표면화만 한다(MF2 · DD4).
  6. MEDIUM `plugins/mccp/commands/plan.md` 5.6b ↔ `plugins/mccp/scripts/receipt/write.js:291-349` — hybrid에는 L3 Codex
     finding의 intent adjudication 경로가 없어 plan receipt가 매번 감사 우회를 요구한다(MF9). 증거: `closure-accounting-m3`·`m4`·`m5`
     receipt 3연속 `intent_gate_force_override:true`. 명령 본문 5.6b의 서술이 writer와 모순이다.
- **Mirror**: 1855-1857행 형식.
- **Validate**: `node -e`로 `scanBacklog(process.cwd())`를 호출해 `invalid_count` 불변 · 새 행 6개가 `items`에
  파싱됨 · 기존 행 수가 줄지 않았음(`git diff -U0`에 `-|` 삭제 줄 0)을 단언한다.

### Task 11: 문서 · PRD · CHANGELOG

- **Action**:
  1. `docs/multi-session-work-loop/debt-inventory.md`
     - `### Acceptance is a marker, not a substring`: 마커는 backtick 없는 독립 문단에 둬야 한다는 규칙(DD1)과 그 이유(span 짝짓기는 어느 방향으로 근사해도 노출을 만든다)를 추가한다.
     - `### After a re-seal, \`verify\` goes red…` 뒤에 `### The gate cross-checks verify on the seal axis`를 추가한다.
     - `### The apply lock, and what it does not cover`: nonce를 추가한다.
     - `### What succession does NOT carry` 뒤에 `### Editing a backlog row re-keys it`을 추가한다 — `sealed_not_live_disposed`와 append-only 규칙.
     - `## What this does not claim` 앞에 `### The json report is a run artifact`를 추가한다 — `gh run download`로 속도를 재구성하는 방법과 기본 보존 기간.
  2. PRD M5 행: ship 시점에 `complete`로 바꾼다(이 plan 작성 시 `in-progress`로 등재됨).
  3. M4 report "Task 7 PR run URL — 미확보" 절에 run `34932510154`(pull_request, success)과
     `34935365492`(push main, success)를 적는다. 원문은 지우지 않고 정정 한 줄을 붙인다.
  4. `CHANGELOG.md` `## [Unreleased]` → `### Fixed`에 M5 항목 1개를 추가한다.
- **Validate**: `grep -c 'Editing a backlog row re-keys it' docs/multi-session-work-loop/debt-inventory.md` = 1 ·
  `grep -n '| 5 | residual-repair' .claude/prds/closure-accounting.prd.md` 1줄 · `node scripts/version-declaration-guard.js` exit 0.

### Task 12: 라이브 1회 완주와 보고서

- **Action**: 아래 Validation 1~8을 전부 실행하고 출력을 `.claude/PRPs/reports/closure-accounting-m5-report.md`에 붙인다.
  PR을 연 뒤 `closure-report.yml` PR run의 artifact 존재를 확인한다:
  `gh api repos/{owner}/{repo}/actions/runs/<id>/artifacts --jq '.artifacts[].name'`에 `closure-report`가 나와야 한다.
- **Validate**: 보고서에 (a) 표 출력의 `Sealed not live:` 줄, (b) m10 `seal.producer_agrees:true`,
  (c) 불변식 비교 결과, (d) PR run artifact 이름이 실려 있다.

## Validation

```bash
set -e
export MCCP_CODEX_DISABLED=1

# 1. 변경 모듈과 인접 스위트 (선재 red 2건의 파일은 목록에 없다)
node --test --test-concurrency=2 \
  plugins/mccp/scripts/lib/tests/msw-m10-producers.test.js \
  plugins/mccp/scripts/lib/tests/msw-reseal.test.js \
  plugins/mccp/scripts/lib/closure/tests/report.test.js \
  plugins/mccp/scripts/lib/closure/tests/cli.test.js \
  plugins/mccp/scripts/lib/tests/findings-producer-reachability.test.js \
  plugins/mccp/scripts/lib/tests/c1-feedback-loop.test.js \
  plugins/mccp/scripts/lib/tests/findings-registry.test.js \
  plugins/mccp/scripts/derive/tests/backlog-source.test.js \
  scripts/tests/closure-report-workflow.test.js

# 2. cwd 독립 (B17 회귀 방지)
(cd plugins/mccp && node --test scripts/lib/closure/tests/report.test.js scripts/lib/closure/tests/cli.test.js)

# 3. 리포트: exit 0 유지 (결정 4) + 새 필드 형태
node plugins/mccp/scripts/lib/closure/cli.js report --json > "$TMPDIR/cr.json"
node -e 'const j=require(process.argv[1]);const g=j.denominator_gap;
  if(!g||!(Number.isInteger(g.sealed_not_live_disposed)||g.sealed_not_live_disposed===null)) process.exit(1);
  if(!(Number.isInteger(j.seal.ancestry_depth)||j.seal.ancestry_depth===null)) process.exit(1);' "$TMPDIR/cr.json"
node plugins/mccp/scripts/lib/closure/cli.js report | grep -q '^  Sealed not live:'

# 4. m10: 봉인 축이 producer와 동의하고, 게이트는 여전히 open 때문에 exit 1
set +e; node plugins/mccp/scripts/lib/msw-metrics/m10-coverage-gate.js > "$TMPDIR/m10.json"; M10=$?; set -e
test "$M10" -eq 1
node -e 'const j=require(process.argv[1]); if(j.seal.producer_agrees!==true||j.seal.ok!==true) process.exit(1)' "$TMPDIR/m10.json"

# 5. 라이브 판정 유효성 불변 (Task 0 기준값과 비교 — 값 자체는 고정하지 않는다)
node -e 'const d=require("./plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js").verifyDispositions(process.cwd());
  const b=require(process.argv[1]);
  if(d.invalid_dispositions!==b.invalid_dispositions) process.exit(1);
  if(JSON.stringify(d.deferrals_by_successor)!==JSON.stringify(b.deferrals_by_successor)) process.exit(1);' "$TMPDIR/m5-baseline.json"

# 6. reseal plan 종료코드를 단언한다 (1847)
node plugins/mccp/scripts/lib/msw-metrics/reseal.js > /dev/null

# 7. 선언·삭제 가드
node scripts/version-declaration-guard.js
test -z "$(git diff --diff-filter=D --name-only origin/main...HEAD)"

# 8. backlog 파싱 불변 (Task 10)
node -e 'const r=require("./plugins/mccp/scripts/derive/sources/backlog.js").scanBacklog(process.cwd()); if(r.invalid_count!==0||!r.ok) process.exit(1)'
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Task 1의 문단 backtick 규칙이 실제 successor 문서의 진짜 마커를 거절해 deferred 970건이 무효가 되고 리포트 행이 null이 된다 | LOW | 실측: successor 문서 3개의 마커 문단에 backtick 0개(2026-09-15). Validation 5가 라이브 `invalid_dispositions`·`deferrals_by_successor`를 Task 0 기준값과 대조한다. `(t6)` 양성 대조 |
| 앞으로 successor 문서를 쓰는 사람이 인라인 코드와 같은 문단에 마커를 둬서 거절된다 | MEDIUM | `(t10)`이 그 비용을 이름으로 고정하고, Task 11이 "마커는 backtick 없는 독립 문단"을 규칙으로 문서화한다. 거절 사유는 `checkSuccessor` 메시지로 드러난다 |
| Task 2 대조가 정상 상태에서 거짓 불일치를 내 m10 봉인 축이 red로 뒤집힌다 | LOW | 두 계산의 정의가 같다(`sha≠current ∧ ∉ancestors`). Validation 4가 라이브에서 `producer_agrees:true`를 단언한다 |
| Task 5 nonce 비교가 구 코드가 남긴 lock의 회수를 막는다 | LOW | DD5 — nonce가 한쪽이라도 없으면 3필드 비교. `(n2)` |
| R9 줄 단위 근사가 화살표 함수 emitter를 놓친다 | MEDIUM | 주장 범위를 "`function` 선언 emitter"로 한정해 test 이름과 주석에 적는다. 현재 emitter 5개는 전부 `function` 선언이다 |
| `(w8)`이 publish 블록 추출에 실패해 공허 통과한다 | MEDIUM | 추출 결과가 비었거나 `GITHUB_STEP_SUMMARY`를 참조하지 않으면 test가 실패하도록 단언한다. mutation(리터럴 fence 복원)으로 red를 확인한다 |
| upload-artifact가 저장소 설정 때문에 실패해 CI가 red가 된다 | LOW | 같은 SHA가 `.github/workflows/test-suite.yml`에서 이미 돈다. red의 의미는 "계기가 실행되지 못했다"(M4 OQ5)와 일치한다 |
| escalation 경고(MF3)가 M5 뒤에도 매 세션 주입된다 | HIGH | 소유가 `write.js`라 M5에서 고치지 않는다(DD9). backlog 새 행과 report에 명시한다 |

## M5가 주장하지 않는 것

- **부채를 줄이지 않는다.** `fixed`는 1로 남는다. 고친 행 대부분이 봉인 뒤에 생겨 분모에 없다(DD10).
- **fix-task의 escalation을 해제하지 않는다.** F1은 흡수하지만 해제 기계(`write.js`)는 타 소유다(DD9).
- **`rowId` 식별 문제를 고치지 않는다.** 떨어질 판정 수를 보이게 할 뿐이다(DD4).
- **santa 채널 종결률을 올리지 않는다.** 오라클의 보수성은 소유자가 따로 판단할 문제다(MF5).
- **R9는 라이브 실행을 증명하지 않는다.** 호출처가 소스에 존재한다는 것만 증명한다(DD7).
- **격차 목표값은 없다.** CI는 속도를 재구성할 재료만 남긴다(UI6).
- **deferred 판정의 정당성에 답하지 않는다.** meta-research 소관이다(UI7).

## Gate note

`/mccp:plan`에 PRD 경로를 주면 `derive-decision`이 `closure-accounting`을 낸다(MF6). 그 slug는 M1이 이미
라운드를 소진했다(`rounds_so_far` 3, 캡 1). M4 선례(`dispatch-log-closure-accounting-m4.jsonl`)와
`/mccp:prp-implement <plan>`이 해소할 slug에 맞춰, Phase 5는 plan 경로로 decision을 해소한다
(`closure-accounting-m5`). receipt·리뷰 기록·dispatch log가 모두 이 slug를 쓴다.

## Acceptance

- [ ] All tasks complete
- [ ] Validation 1~8 전건 exit 0
- [ ] Patterns mirrored, not reinvented
- [ ] 비공허성 mutation 실측 — 각 행을 되돌리면 red: Task 1 문단 backtick 검사 제거 → `(t5)`·`(t8)` · Task 2 `ok`에서 agrees 제거 → 대조 test · Task 3 `sealAncestry` 직접 호출 복원 → `(d1)` · Task 5 nonce 비교 제거 → `(n1)` · Task 6 승계 sha 치환 → closed_count · Task 7 `degraded` 필드 제거 → `(p1)` · Task 8 runner 호출 주석 처리 → `(R9)` · Task 9 리터럴 fence 복원 → `(w8)`
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동): 라이브 `closure report` 표에 `Sealed not live:` 줄이 나오고, 라이브 m10 출력에 `seal.producer_agrees: true`가 나오고, PR의 `closure-report.yml` run에 `closure-report` artifact가 존재한다 — 셋 다 M5 report에 원문 첨부
- [ ] backlog 새 행 6개 append · 기존 행 삭제·편집 0 (`git diff -U0 .claude/plans/codex-findings-backlog.md`에 `-|` 줄 0)
- [ ] PRD OQ2 `[x]` · OQ3 meta-research 분리 표기 · M5 행 등재

## External Research Provenance

- Source PRD: .claude/prds/closure-accounting.prd.md
- References section sha256: f0e684f1fd00c5fe7ebd1b418efd2e119072b6364be46f4648e0827938702505
- Stamped at: 2026-09-15T06:45:58.837Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## Design Critique

- 트리거: `impeccable-detect --mode plan` → `design_signal:true` (`signal_files`: `plugins/mccp/scripts/derive/sources/backlog.js:63-72` — M5가 **수정하지 않는** 인용 경로). SKILL first-step Read 완료(`frontend-design-direction/SKILL.md` `## Output Constraints`).
- 호출: `Skill(impeccable:impeccable, critique closure-accounting-m5)` · Method dual-agent(A design review · B detector) · cap 2.
- R0 verdict: **CONVERGED** — Output Constraints 4규칙 전부 pass(plan 도입 표면 기준), 차단 finding 0건. detector `cli.js` · `closure-report.yml` · `closure/` exit 0 · 0건.
- 흡수: P2 `Count`↔`Net change` 구분 힌트 → Task 3 step 4. 비차단 잔여: 용어 help 부재(기존), `Sealed not live` 한 줄 2사실(P3).

## Design Routing Guide

routing mode: auto (effective at implement stage). At implement the design gate routes these stage-appropriate impeccable commands; here they are a checklist only.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Codex Adversarial Review

- 호출: hybrid L3 `node plugins/mccp/scripts/lib/plan-review/cli.js l3` (detached · run nonce `af901760-3e59-4d38-9916-94edea253391`) · decision `closure-accounting-m5` · 라운드 1/1 (캡 소진)
- 합치 결론: L1 converged · L2 4/4 pass(LOW만) · L3 Codex raw `needs-attention` → **divergent**. 요약: "DD1 still permits a quoted marker to authorize a handoff."
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | L3 F1 — 비운 줄을 문단 경계로 쓰면 유효한 여러 줄 span 안의 마커가 노출된다 (plan Task 1) | HIGH | ACCEPT_NOW | 반례 실재(markdown-it 확인). receipt 봉인 **후** DD1 · Task 1 · Risks · Acceptance에 흡수 — 짝짓기를 버리고 backtick 있는 문단의 마커를 거절한다 |
  | L2 architect — m10이 `verifyDispositions`를 한 실행에 두 번 부른다 | LOW | DEFER_TO_BACKLOG | 성능만의 문제, 정합성 불변 |
  | L2 architect·invariant — Validation 3이 정당한 null gap을 실패로 본다 | LOW | DEFER_TO_BACKLOG | 라이브는 degraded가 아니고, 틀려도 fail-closed 방향 |
  | L2 test·invariant — Validation 5 기준값 파일 경로가 정해지지 않았다 | LOW | DEFER_TO_BACKLOG | require가 throw해 fail-closed |
  | L2 security — 문단 짝짓기가 줄 단위 거절을 수락으로 바꿀 수 있다 | LOW | REJECTED_BY_DESIGN | CommonMark상 실제로 보이는 텍스트다. 흡수 뒤 DD1은 짝짓기 자체를 하지 않는다 |

- Deferred to backlog: LOW 4 + HIGH 흡수 기록 1 → `.claude/plans/codex-findings-backlog.md` (2026-09-15)
- Open Questions: 없음 (auto-CRITICAL 0)
- receipt: `.claude/receipts/mccp-plan-codex/closure-accounting-m5.json` — `codex_verdict=divergent` · `review_verdict=divergent` · `intent_gate_verdict=incomplete`(`MCCP_SKIP_INTENT_GATE` 감사 우회 — MF9, M3·M4 선례) · 봉인 plan hash `sha256:dd62bd74…`
- **봉인 뒤 plan 편집이 있다.** L3 HIGH 흡수와 MF3·MF9·Task 10 갱신이다. 그래서 `/mccp:prp-implement` 진입 시 `mccp-plan-codex`가 stale로 보인다. §3.16대로 재리뷰 대신 진행하며, 실질 델타는 위 triage 첫 행과 MF9뿐이다.
- 리뷰 기록: `.claude/reviews/plan-review-closure-accounting-m5.md`

## Codex Implementation Review

- 호출: `node /home/madsc/.claude/plugins/cache/mccp/mccp/1.33.6/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2) · class `ok` · 57s · scope auto → branch diff(작업 트리 clean — 구현 전 plan diff)
- 라운드 수: 1 (캡 1 — `review-rounds` 봉인 `enforce`, rounds_so_far 1)
- 합치 결론: structured `needs-attention` → `codex_verdict=divergent`. 요약: "M5 is plan-only in this checkout; the seven implementation decisions cannot be validated." 유일 finding은 Task 1이 고치려는 결함 자체(MF1)의 재현이다.
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — `stripQuotedForMarker`가 줄마다 `stripInlineCode`를 불러 여러 줄 code span 안의 마커가 수락된다 (`debt-inventory.js:763`) | HIGH | ACCEPT_NOW | MF1 · fix-task F1과 같은 결함이다. Task 1이 그대로 흡수한다(새 결정 아님). 권고한 회귀 사례(여러 줄 · 들여쓰기 연속 · 독립 마커 양성)는 `(t5)`~`(t10)`과 일치한다 |

- 구현 시점 결정(plan이 못박지 않은 것): 빈 줄 판정은 `trim() === ''`이 아니라 CommonMark 정의(`/^[ \t]*$/`)로 한다. JS `trim()`은 NBSP 같은 유니코드 공백 줄도 빈 줄로 보는데, CommonMark에서는 그 줄이 문단을 끊지 못하므로 3줄 이상에 걸친 span의 가운데 묶음이 backtick 없이 남아 노출된다 — 과다 제거 방향이 아니다.
- Deferred to backlog: 0
- Open Questions: 없음 (auto-CRITICAL 0)
- Codex session 참조: `$(git rev-parse --git-dir)/mccp/tmp/codex-implement-m5.stdout`

### Security Reviewer

`Task(security-reviewer)` — 대상: 수락 마커 판정(Task 1) · reseal lock(Task 5) · handoff 경고(Task 7) · CI summary step(Task 9).

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| S1 — `trim() === ''`는 NBSP 등 유니코드 공백 줄을 문단 경계로 봐서, NBSP 줄로 나눈 가운데 묶음(마커만)이 backtick 없이 남아 수락된다 | HIGH | ACCEPT_NOW | 위 구현 시점 결정과 같은 결함이다 — 빈 줄은 `/^[ \t]*$/`로 판정하고 `(t11)` NBSP 반례를 Task 1 test에 둔다 |
| S2 — nonce 선택적 비교의 과도기(한쪽에 nonce가 없으면 3필드 비교)를 잔여 리스크로 문서화 | LOW | ACCEPT_NOW (문서) | Task 11의 lock 절에 한 문장으로 적는다. 동작 변경 없음 |
| S3 — 핸드오프 경고는 개수만 싣는다 | INFO | — | finding 아님 |
| S4 — Task 9의 fence 계산이 리포트 내용을 `$(cat …)`로 `-e` 인자에 끼우면 셸·JS 주입이 된다. 정적 `(w9)` 가드 권고 | MEDIUM | DEFER_TO_BACKLOG (가드만) | 구현은 `node -e` 안에서 `fs.readFileSync`로 읽고 `(w8)`이 backtick 내용으로 행동을 확인한다. 정적 가드 test는 §3.14에 따라 backlog |

## Gate Deviation

- **무엇**: `/mccp:prp-implement` 2.5.7 read-back `cli.js validate --command mccp:prp-implement --decision closure-accounting-m5 --plan <plan>`이 exit 2로 끝났다. 사유는 `mccp-plan-codex` stale 1건뿐이다(`receipt_plan_hash sha256:dd62bd74…` ≠ 현재). `missing`·`blocking`·`open_critical`은 0건이다.
- **왜 진행했나**: 명령 본문은 여기서 멈추라고 하지만, 이 validate에는 문서화된 감사 우회가 없다(`MCCP_SKIP_RECEIPT`는 preflight·hook만 읽는다). §3.16은 재리뷰를 기본 선택지로 두지 않는다. 사용자가 2026-09-22에 "이탈 기록 후 진행"으로 판정했다.
- **receipt가 덮지 못하는 델타**: 봉인 뒤 plan 편집(L3 HIGH를 흡수한 DD1·Task 1 재작성, MF3·MF9·Task 10 갱신)과 이 절·`## Codex Implementation Review`. 앞의 것은 이번 Implement-Codex R1(branch diff 리뷰)과 security-reviewer가 현재 본문 그대로 읽었다.
- **남는 비용**: `/mccp:pr`에서도 같은 stale이 걸린다. 그때 사유를 담은 감사 우회로 처리하고 PR 본문 `## Gate Deviation`에 옮겨 적는다.
