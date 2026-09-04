# Plan: review-record-linkage M5 — live-firing-closure

**Source PRD**: `.claude/prds/review-record-linkage.prd.md`
**Selected Milestone**: M5 — live-firing-closure
**Decision slug**: `review-record-linkage-m5` (명시 슬러그 — F12. 기본 파생값 `review-record-linkage`는 라운드 예산이 소진돼 있고 M1이 커밋한 레코드를 덮어쓴다)
**Complexity**: Medium

## Summary

M1~M4는 이 PRD가 약속한 배선을 **전부 구현했다**. 그런데 라이브 실값은 지표 2가 `0`이고
분모가 `null`이다. 원인은 코드가 아니다 — 게이트가 실행하는 명령 본문이 **설치 캐시
`1.33.6`**(commit `647dfecb`, 2026-09-01)의 것이고 그 판본에는 M3·M4 배선이 존재하지 않는다.
`marketplace.json`이 `ref: release`를 가리키므로 `claude plugin update`로도 그 격차는
좁혀지지 않는다. 즉 **캐시가 뒤처지는 것은 사고가 아니라 릴리스 채널 분리 이후의 항구적
기본 상태**다.

M5는 새 배선을 만들지 않는다. 이미 있는 배선이 **발화하게 만들고**, 발화하지 못했을 때
그 사실이 조용히 지나가지 않게 만든다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | backlog에 쌓인 미해소 항목에 대한 수정 계획을 세운다 | direction |
| UI2 | fix-task에 남은 미해소 항목에 대한 수정 계획을 세운다 | direction |
| UI3 | PRD의 Open Questions에 대한 수정 계획을 세운다 | direction |
| UI4 | 의도대로 동작하지 않은 기능에 대한 수정 계획을 세운다 | direction |
| UI5 | 그 계획을 이 PRD의 마일스톤으로 추가한다 | direction |
| UI6 | 과거 코퍼스는 소급하지 않는다. 재봉인도 사이드카도 만들지 않는다 | exclusion |
| UI7 | acceptance는 producer가 아니라 산출된 실값이다. 배선 부재를 보는 test가 없으면 완료가 아니다 | constraint |
| UI8 | 자식 브랜치는 plugin.json version을 선언하지 않는다. 번호는 릴리스 컷이 소유한다 | constraint |
| UI9 | 게이트 리뷰는 1라운드가 기본이다. plan을 다듬어 재리뷰하기보다 triage 후 진행한다 | direction |
| UI10 | 리뷰 finding은 HIGH와 CRITICAL만 그 자리에서 흡수하고 나머지는 backlog로 이연한다 | direction |
| UI11 | 얇은 ship receipt 설계와 backlog 표 4열 헤더는 바꾸지 않는다 | exclusion |
| UI12 | 리드타임 목표치는 설정하지 않는다. 그 해석은 C4가 소유한다 | exclusion |

## 관측된 사실 (전부 이 워크트리에서 재현)

| # | 사실 | 재현 |
|---|---|---|
| F1 | 활성 설치는 `1.33.6` @ `647dfecb`이고 워크트리는 `1.34.4`다 | `~/.claude/plugins/installed_plugins.json` · `plugins/mccp/.claude-plugin/plugin.json` |
| F2 | 배포 표면은 `release` 브랜치다 — 캐시는 main을 추종하지 않는다 | `.claude-plugin/marketplace.json:13` `"ref": "release"` |
| F3 | 라이브 링크가 전부 0이다 (HEAD 트리 ship 88 · 레코드 72) | `node plugins/mccp/scripts/lib/linkage-audit.js --json` → `post_baseline.linkage.{receipt_to_review,review_to_receipt,bidirectional}` 전부 `0` |
| F4 | 지표 2의 분모가 계산 불가다 — ship 88건 전건 `undecidable` | 같은 출력의 `post_baseline.ship_eligibility.counts.undecidable = 88`, `linkage.denominator = null` |
| F5 | M3·M4 자신의 ship receipt에도 링크 필드가 없다 | `.claude/receipts/mccp-pr-codex/review-record-linkage-m3.json` · `-m4.json` → `meta.review_record_path` 부재 · `meta.plan_review_expected` 부재 |
| F6 | 배선 자체는 워크트리에 실재한다 | `commands/plan.md:2884-2892`(`--review-record-path` 전달) · `commands/pr.md:1049-1085`(back-patch) · `lib/pr-phase-helpers/finalize-receipt.js:309-315`(carry-forward) |
| F7 | skip-path ship의 `rounds`가 리터럴 1이다 | M4 ship receipt: `resolution.rounds = 1` 이면서 `meta.round_ledger_count = 0` |
| F8 | 강제 뷰의 범위가 1건뿐이다 | `--check-round-structure --since $(git merge-base origin/main HEAD)` → `in_scope=1 present=1 absent=0`, exit 0 |
| F9 | backlog `m3-seal-leak`은 이미 해소됐다 | `plan-review-cli-emit.test.js` **12 pass / 0 fail**. 해소자는 `plan-review/cli.js:288-302`의 `opts.gitDir` 프로그래매틱 시임(ci-full-suite M2) |
| F10 | 이 PRD의 backlog 잔량은 79행이다 | `codex-findings-backlog.md`의 `review-record-linkage` 매칭 — m1(FAIL 2·HIGH 3·MED 14·LOW 10) · m3(FAIL 4·HIGH 6·MED 13·INFO 2) · m4(FAIL 4·HIGH 8) · 출처 미상(HIGH 3·MED 9·LOW 12) |
| F11 | fix-task는 비었고 escalation만 남았다 | `.claude/state/fix-task.md` 0바이트 · `fix-task-applied.md`가 `escalate: true` + `verdict: codex_divergent` 보유 · STATE.md `Escalation Pending`이 미러 |
| F12 | 이 게이트의 라운드 예산은 이미 소진이다 | `.claude/state/review-rounds/mccp-plan-codex__review-record-linkage.json` 3라운드 · `.claude/settings.json` `MCCP_GATE_ROUND_CAP=1` |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 진단 모듈 배선 | `plugins/mccp/scripts/lib/dep-check.js:116-157` | `checkImpeccable`가 오라클을 **지연 require + try/catch**로 감싸 fail-closed sentinel을 돌려준다. 헤더의 "Never throws" 계약을 깨지 않는 방식 |
| 진단 소비처 1 | `plugins/mccp/scripts/hooks/session-start.js:1063-1136` | 24시간 throttle + STATE 갱신. 배너는 **경고만** 하고 세션을 막지 않는다 |
| 진단 소비처 2 | `plugins/mccp/commands/setup.md` (40 · 168 · 275 · 432행) | 같은 `dep-check --json`을 네 곳이 읽고 표로 렌더 |
| 읽기 전용 감사 축 | `plugins/mccp/scripts/lib/linkage-audit.js:308-360` | 계수만 하고 임계를 갖지 않는다. 사유는 `by_reason` 열린 맵 |
| 사유 enum화 (경로 유출 방지) | `plan-review/cli.js#errCode` (M4 H1 흡수) | `err.message`를 싣지 않고 **원인 enum만** 싣는다 |
| 배선 부재를 보는 정적 단언 | `plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js` | 명령 본문에 그 호출 줄이 **실재하는지**를 파일 스캔으로 단언 |
| 3값 자격 판정 | `plugins/mccp/scripts/lib/plan-review/linkage-defs.js:186-233` | `eligible` / `not_eligible` / `undecidable` — 모르는 것을 `0`으로 접지 않는다 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/install-skew.js` | CREATE | 활성 설치 판본과 워크트리 HEAD의 격차를 판정하는 순수 오라클 (F1·F2) |
| `plugins/mccp/scripts/lib/dep-check.js` | UPDATE | `checkAll`에 `install_skew` 키를 얹는 엄격한 상위집합. 기존 키 불변 |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATE | 배너가 skew를 `MCCP_CODEX_DISABLED` 가드 **밖**의 자기 블록에서 보고 (DD4a) |
| `plugins/mccp/commands/setup.md` | UPDATE | Phase 3 표에 skew 행 추가 |
| `plugins/mccp/scripts/lib/linkage-audit.js` | UPDATE | (a) `undecidable` 사유 이분화(**라이브 파티션 한정**) · (b) `rounds_fidelity` 읽기 축. (c) 강제 범위 문구는 이미 실재하므로 철회 — M6 이연 |
| `plugins/mccp/scripts/lib/plan-review/linkage-defs.js` | UPDATE | DD5의 사유 판별을 정의 소유 모듈에 둔다 |
| `plugins/mccp/scripts/lib/tests/install-skew.test.js` | CREATE | 오라클 단위 test |
| `plugins/mccp/scripts/lib/tests/install-skew-wiring.test.js` | CREATE | 배선 부재를 보는 정적 단언 (UI7) |
| `plugins/mccp/scripts/lib/tests/linkage-audit.test.js` | UPDATE | 신규 축 회귀 |
| `docs/dogfood-install.md` | UPDATE | 배선 마일스톤의 라이브 acceptance는 `--plugin-dir` 아래에서만 성립한다는 절 |
| `docs/review-record-linkage/frozen-baseline.md` | UPDATE | 동결 블록은 **불변이며 그것이 계약이다**(DD5). 라이브 절에만 M5 실값 추가 |
| `docs/review-record-linkage/deferred-triage.md` | CREATE | Task 7의 backlog 3분류 산출물 |
| `.claude/prds/review-record-linkage.prd.md` | UPDATE | M5·M6 행 추가, M5 in-progress |
| `.claude/plans/review-record-linkage-m5.plan.md` | UPDATE | 이 파일. 게이트 2.5.4가 `## Codex Implementation Review`를 주입한다 |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | §3.14 이연 채널 |
| `.claude/PRPs/reports/review-record-linkage-m5-report.md` | CREATE | 구현 보고 |
| `.claude/state/STATE.md` | UPDATE | hook 소유 (`state-writer.js` API 경유) |
| `.claude/state/fix-task-applied.md` | UPDATE | Task 8의 escalation 종결 기록 |
| `CHANGELOG.md` | UPDATE | `## [Unreleased]` 아래 누적 (UI8 — 번호 미선언) |

## Design Decisions

### DD1 — M5는 새 배선을 만들지 않는다. 진단을 만든다

지표 2가 `0`인 원인은 배선 부재가 아니라 **판본 격차**다(F5·F6). 같은 배선을 한 번 더
만들면 이 PRD가 M1에서 세운 "정의는 한 곳이 소유한다"를 결정층에서 위반하고, 원인은
그대로 남는다. M5가 만드는 것은 **격차를 말하는 입**이고, 격차를 없애는 것은 실행
절차(DD3)다.

### DD2 — skew 판정은 version 문자열 비교가 아니라 **커밋 도달성**이다

`plugin.json`의 version만 비교하면 UI8 이후로 자식 브랜치가 번호를 선언하지 않으므로 두
값이 같아 보이면서 내용이 다른 상태가 **정상**이 된다. 판정은 `installed_plugins.json`의
`gitCommitSha`가 현재 HEAD의 조상인가로 한다 —
`git merge-base --is-ancestor <installedSha> HEAD`.

| state | 조건 |
|---|---|
| `current` | 조상이고 HEAD와 같다 |
| `behind` | 조상이지만 HEAD보다 뒤 (+ `git rev-list --count <sha>..HEAD`로 격차) |
| `diverged` | 조상이 아니다 |
| `unknown` | sha를 못 읽는다 / repo가 아니다 / git 실패 |

**`unknown`을 `current`로 접지 않는다.** 접으면 진단이 조용히 꺼진다. 다만 판정은 경고일
뿐이고 어떤 게이트도 막지 않는다(DD4).

### DD3 — 라이브 발화의 유일한 합법 경로는 `--plugin-dir`이고, 캐시 덮어쓰기는 금지다

§3.7 v1.34.5 정정이 이미 못박았다 — 캐시 디렉토리는 version으로 키가 잡히므로 내용만
바꾸면 `installed_plugins.json`의 `version`·`gitCommitSha`가 디스크와 어긋난 거짓이 된다.
M5의 라이브 acceptance(Task 6)는 `claude --plugin-dir <worktree>/plugins/mccp` 아래에서
수행하고, 그 실행이 설치 상태를 바꾸지 않았음을 `installed_plugins.json`의 sha256 불변으로
확인한다.

### DD4 — 진단은 fail-open이고 어떤 경로도 차단하지 않는다

`dep-check.js` 헤더의 "Never throws" 계약이 있고, session-start 배너는 세션을 막지 않는
자리다. skew가 게이트를 막으면 **캐시가 뒤처진 모든 사용자의 모든 게이트가 죽는다** —
F2대로 그것이 기본 상태이므로 차단은 곧 전면 정지다. 모듈 로드 실패는 §3.17 M2 선례대로
`{ state: 'unknown', reason: 'oracle_unavailable' }` sentinel로 접는다. 이 문단은 모듈
헤더에 축자로 옮겨 적는다 — 후속 사이클이 "fail-closed가 더 안전하다"로 뒤집는 것을
막는 근거가 코드 옆에 있어야 한다.

### DD4a — 배너는 `MCCP_CODEX_DISABLED` 가드 **밖**에 산다 (L2 security HIGH 흡수)

초안 Task 3은 배너를 `session-start.js`의 dep-check 블록 "안에서" 내라고 지시했다.
**그 지시대로 하면 이 진단은 이 저장소에서 한 번도 발화하지 않는다.**

```
session-start.js:1066  if (!envValue.parseBool(process.env, 'MCCP_CODEX_DISABLED')) {
```

1063–1136 블록 전체가 그 가드 안에 있고, 이 저장소의 실행 환경에는 `MCCP_CODEX_DISABLED=1`이
실제로 설정돼 있다(이 사이클의 게이트가 `codex_disabled=true`로 봉인했다). §3.12는 그것을
**표준 설치**라고 부른다. 즉 초안대로면 M5의 유일한 탐지 채널이 기본 구성에서 침묵하고,
그것은 이 마일스톤이 닫으려는 실패 자체다 — 통로를 만들고 부르지 않는 것.

**판본 격차는 Codex 가용성과 무관한 축이다.** 두 축을 한 가드에 묶을 근거가 없다. 배너는
그 가드 **밖**의 자기 블록에 산다.

같은 이유로 **throttle도 공유하지 않는다**. `session-start.js:1114-1121`이 자기 코드
주석으로 그 이유를 이미 적었다 — `dep_check_at`은 dep-check가 도는 매 세션 재스탬프되므로
24h 시계 단독은 rate-limit이 아니고, 그래서 그 축은 `dep_check_eclipsed`라는 **자기
present-only 필드**를 갖는다(`:1093`). skew 축도 같은 형태로 `install_skew_at` +
`install_skew_state`를 갖는다. 없으면 배너는 한 번 뜨고 다시는 뜨지 않으며, 상태 변화
(새로 뒤처짐 / 해소됨)도 말하지 못해 위와 같은 침묵으로 수렴한다.

> 초안의 "새 throttle 채널을 만들지 않는다"는 **철회한다**. 그 문장은 절제로 읽혔지만
> 실제로는 진단을 1회성으로 만드는 지시였다.

### DD5 — `undecidable` 사유를 두 갈래로 가른다

현재 사유 문자열은 "upstream plan receipt was never git-tracked"라고 단정하는데, M3
이후로는 **생산자가 실재한다**(F6). 그 문구는 이제 사실이 아니다.

| 사유 | 뜻 |
|---|---|
| `producer_absent_in_build` | 이 receipt를 발행한 빌드에 생산자가 없었다 (오늘의 88건) |
| `producer_present_but_unstamped` | 생산자가 있는 빌드인데 값이 없다 (진짜 배선 결함) |

가르는 기준은 `meta.plan_path` 유무가 **아니다** — M4 receipt는 그것을 갖는데도 링크가
없다(F5). 기준은 receipt에 **M3가 도입한 키 집합** 중 하나라도 있는가다:
`review_record_path` · `plan_review_expected` · `no_plan_review_reason` ·
`link_evidence_skip_reason`. 하나도 없으면 전자, 있는데 자격 키만 없으면 후자.

**적용 범위는 라이브(HEAD) 파티션 단독이다. `pre_baseline`은 손대지 않는다** (L2
architect + invariant HIGH 흡수). 초안은 "동결 블록 바이트가 움직이면 문서를 함께
갱신하고 이탈로 적는다"로 두었는데, 그것은 **확실히 움직인다**:

```
docs/review-record-linkage/frozen-baseline.md:318
  "no explicit meta.plan_review_expected — … the upstream plan receipt was never git-tracked": 75
```

`linkage-audit.js:539`가 같은 `by_reason`을 `pre_baseline`에 싣고 `frozenOnly()`가 그것을
화이트리스트로 통과시키므로, 사유를 바꾸면 75건 전건의 키가 바뀐다. 초안의 처방은
**UI6(no-retro 동결 불변식)를 block에서 warn으로 강등**하는 것이었다 — 동결 블록은 "값이
안 움직인다"는 것 자체가 계약이고, 움직였을 때 문서를 따라 고치면 그 계약은 탐지 기능을
잃는다. 그래서 처방을 뒤집는다: **사유 이분화는 `post_baseline`에만 적용하고
`pre_baseline`은 봉인된 문자열을 그대로 반환한다.** `linkage-frozen-baseline.test.js`가
red가 되면 그것은 이 Task의 **버그**이지 문서 갱신 신호가 아니다.

**나머지 두 `undecidable` 사유는 손대지 않는다** (L2 architect MEDIUM 흡수). 초안은
`undecidable`이 단일 문자열이라 전제했으나 `linkage-defs.js`의 `classifyShipEligibility`는
셋을 낸다 — `:198` meta 판독 불가 · `:212-216` `plan_review_expected=false`인데 사유 부재 ·
`:218-223` 명시 필드 부재. 이분화는 **`:218-223` 갈래에만** 적용한다. 앞의 둘은 "M3 키가
있는가"를 물을 수 없거나(판독 불가) 이미 다른 축의 결함이므로(무증거 exclusion), 같은
규칙을 적용하면 없는 사실을 만든다.

> 이 판별은 **완전하지 않다.** M3 키를 하나도 쓰지 않는 정상 ship과 생산자 없는 빌드가
> 구분되지 않는다. 그래서 사유 이름이 `build`가 아니라 `producer_absent_in_build`이고,
> `by_reason`은 열린 맵이라 후속 축이 사유를 늘릴 수 있다. 모르는 것을 아는 척하지 않는
> 것이 이 필드의 계약이다.

### DD6 — `rounds_fidelity`는 판정하지 않고 대조만 한다

F7은 M2 dropped 노트가 "소실이 아니라 표현 한계"로 이연했고 C4가 소비 시점에 정하기로
했다(UI12). M5는 그 결정을 **선점하지 않는다.** `resolution.rounds`와
`meta.round_ledger_count`를 나란히 세어 상태로 보고만 한다.

| 상태 | 조건 |
|---|---|
| `agree` | 두 값이 같다 |
| `ledger_zero` | `round_ledger_count === 0` 이면서 `rounds === 1` (F7의 형태) |
| `disagree` | 그 밖의 불일치 |
| `unreadable` | 둘 중 하나를 읽을 수 없다 |

임계도 종료코드도 붙이지 않는다. 붙이면 C4가 소유할 해석을 M5가 먼저 못박게 된다.

### DD7 — 이 사이클의 게이트 이탈을 미리 선언한다

F12대로 슬러그 `review-record-linkage`의 라운드 예산은 소진이고 캡은 `1`이다. 이 plan의
게이트는 5.2c(`emit-workflow-args`)에서 실제로 거부됐다 —
`BLOCK: round cap reached (3/1 for mccp-plan-codex__review-record-linkage) pinned by
single-pass+codex-disabled`.

**초안이 여기 적었던 "문서화된 감사 우회를 쓴다"는 거짓이었고 철회한다** (L2 invariant
HIGH 흡수). §3.16이 열거한 우회 넷(`MCCP_SKIP_RECEIPT` · `MCCP_SKIP_INTENT_GATE` ·
`MCCP_ALLOW_CODEX_UNAVAILABLE` · `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE`) 중 **어느
것도 이 초크포인트에 작용하지 않는다.** `describeRoundCapRecovery`(`plan-review/cli.js:387-405`)가
직접 말한다 — in-band 복구는 캡 상향뿐이고, 캡이 `codex-disabled`로 pin되면 그 경로조차
없다. 존재하지 않는 escape를 선언하는 것은 이 마일스톤이 닫으려는 종류의 거짓이다.

**실제로 한 일은 다르다: 마일스톤 슬러그로 원장을 키잉했다.** 소진된 3라운드는
2026-09-01에 **M1의 plan**을 리뷰한 것이고(`rounds[].at` 전건 그 날짜), 원장이 PRD 경로
파생 슬러그로 키잉되기 때문에 후속 마일스톤이 시작부터 소진 상태로 태어난다. M3와 M4는
각자 `review-record-linkage-m3` · `-m4` 원장을 갖는 것으로 같은 문제를 지났고, 이 plan은
헤더에 `**Decision slug**: review-record-linkage-m5`를 선언한다. 재봉인은 그 선언을
`review-rounds/cli.js seal`에 반영한 것이지 캡 상향이 아니다.

- **원장은 지우지 않았다.** `mccp-plan-codex__review-record-linkage.json`은 3라운드 그대로다.
- **캡은 그대로 1이다.** `review-record-linkage-m5` 원장이 0라운드였을 뿐이고, 이 사이클이
  그중 1을 썼다.
- **재봉인 자체가 이탈이다.** 5.-1은 게이트 진입 시 한 번 봉인하도록 돼 있고, 이 실행은
  두 번 봉인했다. 그 사실을 감추지 않고 보고서와 PR 본문 `## Gate Deviation`에 적는다.
- 이 사이클의 verdict는 `divergent`로 실제 값 그대로 봉인됐으므로 cross-gate dedupe는 닫힌
  채 남는다 — `/mccp:pr`에서 PR-Codex가 반드시 발화한다.

**남는 결함은 M6가 소유한다**: 라운드 원장이 마일스톤이 아니라 PRD로 키잉되는 탓에 매
마일스톤이 슬러그를 손으로 선언해야 하고, 그것을 잊으면 게이트가 원인 불명으로 막힌다.
이 사이클이 그 비용을 실측했다.

### DD8 — backlog·OQ 종결은 M5가 아니라 M6가 소유한다

F10의 79행과 Open Question 5건을 M5에 넣으면 이 마일스톤의 acceptance가 "판정 79건"이
되어 라이브 실값 축이 그 안에 묻힌다. M5는 UI4(동작하지 않은 기능)를 닫고, M6가
UI1~UI3(원장 종결)을 닫는다. **단, 그 분리를 근거 없이 하지는 않는다** — Task 7이 79행을
M5 흡수 대상과 M6 이연 대상으로 기계 분류하고 산출물을 남긴다. 분류 없이 "다음 마일스톤"
이라고 적는 것은 이연이 아니라 유실이다.

## Tasks

### Task 1: `install-skew.js` — 판정 오라클

- **Action**: 순수 함수 `resolveInstallSkew({ env, repoRoot, readInstalled, runGit })`를
  export한다. 반환은 `{ state, installed_version, installed_sha, head_sha,
  commits_behind, plugin_dir_override, reason }`이고 `state`는 DD2의 4값.
  `plugin_dir_override`는 `CLAUDE_PLUGIN_ROOT`가 `.claude/plugins/cache/` 밖을 가리킬 때
  `true`다. **그러나 그것만으로 침묵하지 않는다** (L2 security MEDIUM 흡수) — override
  디렉토리가 M3·M4 이전의 오래된 sibling 워크트리일 수 있고, 그 경우가 바로 M5가 탐지해야
  할 상태다. override일 때는 그 디렉토리의 저장소 HEAD 도달성을 **다시 판정**하고, 판정할
  수 없으면 `unknown` + `reason: 'override_unjudged'`로 접는다. 무판정 침묵은 금지다.
  `installed_sha`는 외부 소유 파일(`installed_plugins.json`)에서 오므로 git 인자로 넘기기
  전에 `^[0-9a-f]{7,40}$`로 검증한다 — `-`로 시작하는 값은 rev가 아니라 옵션으로
  해석된다(L2 security LOW 흡수). **절대 throw하지 않는다.** git 호출은 `execFileSync` +
  try/catch이고 실패는 `unknown` + 원인 **enum** (`git_failed` · `not_a_repo` ·
  `registry_unreadable` · `sha_absent` · `sha_malformed` · `override_unjudged` ·
  `oracle_unavailable`) — `err.message`를 싣지 않는다 (M4 H1 선례: 호스트 절대경로 유출).
  DD4·DD4a를 모듈 헤더에 축자 기록한다.
- **Mirror**: `dep-check.js:116-157`의 lazy-require + sentinel · `cli.js#errCode`
- **Validate**: 4상태 각각 · 레지스트리 부재 · 잘린 JSON · git 부재 · `-`로 시작하는 sha ·
  `plugin_dir_override=true`가 **침묵이 아니라 재판정**으로 가는지 · 반환 어디에도 경로
  형태 문자열이 없음. 유출 회귀 단언은 Windows 드라이브·`/home/`만이 아니라
  **`[A-Za-z]:[\\/]` · `/home/` · `/Users/` · `\\\\` (UNC)** 넷을 본다 (L2 security LOW
  흡수 — 좁은 목록은 macOS·UNC 유출을 green인 채 통과시킨다). 특정 머신에 묶이지 않도록
  값이 아니라 **형태**로 단언한다

### Task 2: `dep-check.js` — `install_skew` 키를 얹는다

- **Action**: `checkAll`이 기존 반환에 `install_skew`를 **추가**한다(기존 키 불변 —
  §3.17 M2가 impeccable을 붙인 것과 같은 엄격한 상위집합). 오라클은 지연 require +
  try/catch, 실패 시 `{ state: 'unknown', reason: 'oracle_unavailable' }`.
- **Mirror**: `dep-check.js#checkImpeccable`
- **Validate**: `checkAll()` 반환에 기존 키가 그대로 있고 `install_skew`가 더해짐 ·
  오라클 모듈을 못 읽어도 throw하지 않음

### Task 3: 소비처 배선 — SessionStart 배너 + `/mccp:setup`

- **Action**: `session-start.js`의 dep-check 블록 **밖**에, `MCCP_CODEX_DISABLED` 가드에
  걸리지 않는 자기 블록으로 배너를 둔다(DD4a). `install_skew.state`가 `behind`/`diverged`
  일 때만 한 줄 경고를 내고, throttle은 `dep_check_eclipsed`(`session-start.js:1093`)
  선례대로 **자기 present-only 필드** `install_skew_at` + `install_skew_state`로 한다 —
  상태가 바뀌면(새로 뒤처짐 / 해소됨) 24h 안이라도 다시 말한다.
  `setup.md` Phase 3 표에 행 하나 추가.
- **Mirror**: `session-start.js:1093`(present-only throttle 필드) ·
  `session-start.js:1114-1121`(왜 24h 시계 단독이 rate-limit이 아닌지) ·
  `plugins/mccp/commands/setup.md:168`
- **Validate**: 정적 단언 **하나로는 부족하다** (L2 test HIGH 흡수). 셋을 함께 돌린다 —
  (i) `install-skew-wiring.test.js`가 `session-start.js`의 소비 줄과 `setup.md` 행의
  **실재**를 스캔하고, (ii) 같은 test가 그 소비 줄이 `MCCP_CODEX_DISABLED` 가드 블록
  **바깥**에 있음을 단언하며(DD4a의 회귀 가드 — 이것이 없으면 초안의 결함이 조용히
  되돌아온다), (iii) 기존 `plugins/mccp/scripts/hooks/tests/session-start-dep-check.test.js`
  를 실행해 그 블록의 24h 규율이 보존됐는지 본다. 정적 스캔은 배너가 **발화하는지**를
  보지 못하므로 (iii)이 그 축을 덮는다

### Task 4: `linkage-audit.js` — `undecidable` 사유 이분화 (DD5)

- **Action**: `ship_eligibility.by_reason`의 단일 문자열을 DD5의 두 사유로 가른다. 판별
  함수는 `linkage-defs.js`가 소유한다(정의의 단일 소유권 — M1 DD1a). `linkage-audit.js`는
  그것을 호출만 한다.
- **Mirror**: `linkage-defs.js:186-233`
- **Validate**: M3 키를 하나도 안 가진 fixture → `producer_absent_in_build` ·
  `review_record_path`만 가진 fixture → `producer_present_but_unstamped` ·
  **동결 블록 바이트 불변**(`--frozen-only` diff 0줄). 사유 문자열은 `pre_baseline`에도
  실리므로 이것이 UI6의 실제 시험이다. 바이트가 움직이면 동결 문서를 함께 갱신하고 그
  사실을 보고서에 이탈로 적는다 — 조용히 넘기지 않는다

### Task 5: `rounds_fidelity` 축 (DD6) + 강제 범위 문구 정합

- **Action**: (a) `post_baseline`에 `rounds_fidelity: { agree, ledger_zero, disagree,
  unreadable }`를 추가한다. 임계·종료코드 없음.
  (b) **초안의 "문구로 닫는다"는 철회한다** (L2 invariant MEDIUM 흡수) — 그 문구는
  `linkage-audit.js:659-661`에 **이미 있다**(`REPORT only — the enforced denominator is
  the M4 landing boundary…`). 실질 변경 0인 작업을 HIGH 항목의 종결로 기록하는 것은 이
  마일스톤이 닫으려는 종류의 거짓 완료다. backlog L1454는 **M6로 이연**하고, 이연 사유를
  `deferred-triage.md`에 적는다: 범위를 지표 범위로 넓히려면 경계 이전 레코드를 강제
  대상에 넣어야 하는데 그것은 UI6(소급 금지) 위반이므로, 이 항목은 **문구가 아니라
  지표 정의 자체**를 다시 여는 작업이고 M5 범위 밖이다.
- **Mirror**: `linkage-audit.js:308-360`
- **Validate**: F7 형태 fixture → `ledger_zero: 1` · 두 값 일치 fixture → `agree: 1` ·
  `--check-round-structure`의 종료코드 사다리 불변

### Task 6: 라이브 실값 산출 (UI7의 acceptance — 이 마일스톤의 유일한 실측 근거)

- **Action**: DD3의 경로로 이 사이클 자신의 `/mccp:pr`을 완주해 다음을 **산출**한다.
  1. 발행된 `mccp-pr-codex/review-record-linkage-m5.json`이 `meta.review_record_path`를 봉인
  2. 그 경로의 레코드가 `measurement.receipt_hash`로 그 receipt를 되짚음
  3. `linkage-audit --json` → `post_baseline.linkage.bidirectional >= 1`
  4. `meta.plan_review_expected`가 실려 `denominator != null`
  - **1~2가 되고 3~4가 안 되면 그 이유를 보고서에 적는다.** 부트스트랩 상태와 결함을
    구분하는 것이 이 Task의 절반이다.
  - 실행 전후로 `installed_plugins.json`의 sha256이 불변임을 확인한다(DD3).
- **Validate**: 위 네 값을 보고서에 **명령과 출력째로** 싣는다

### Task 7: backlog 79행 기계 분류 (DD8의 근거)

- **Action**: 79행을 분류한다 — (a) 이미 해소(F9의 `m3-seal-leak`, `[ABSORBED → v1.34.2]`,
  `[RESOLVED → 2026-09-02]`) · (b) M5가 이 사이클에 흡수(§3.14 임계 HIGH/CRITICAL 중 M5
  범위와 겹치는 것) · (c) M6 이연. `FAIL` 24행은 §3.14 해제 조건(`quorum.js`가 bare
  `verdict='fail'`을 blocking finding으로 합성하는 문제)에 걸린 항목이므로 **별도
  분류**하고 개별 판정하지 않는다. 산출물은 `docs/review-record-linkage/deferred-triage.md`.
- **Validate**: 분류 합계 = 79 (누락 0) · 각 (a) 행에 해소 근거가 file:line으로 붙음

### Task 8: fix-task escalation 종결 (UI2)

- **Action**: `fix-task-applied.md`의 `escalate: true`는 M4 사이클의 것이고 그 사이클은
  ship됐다(`completion-ledger/review-record-linkage-m4__029d01d7d6e6.json`,
  `commit_sha: 9fd6f7b`). 그러나 `/mccp:santa-loop`은 실행되지 않았고 STATE.md의
  `Escalation Pending`이 남아 있다. **둘 중 하나를 명시 선택한다** — (i) santa-loop을
  실제로 돌린다, (ii) M4가 ship된 사실을 근거로 만료 처리하고 그 판단을 파일에 남긴다.
  **기본 선택은 (ii)** — escalation의 대상 결정(`review-record-linkage-m4`)이 이미
  종결됐으므로 지금의 santa-loop은 **종결된 결정을 리뷰한다**. 선택 근거를 보고서에 적고
  STATE.md는 `state-writer.js` API로만 갱신한다(직접 편집 금지 — §3.2).

  > **(ii)의 근거는 skip predicate이고 그것을 인정한다** (L2 invariant MEDIUM 흡수).
  > "M4가 ship됐다"는 escalation이 **미해소인 채로도 참**이다 — 실제로 M4가 그렇게
  > ship됐다. 즉 그 사실은 "수행됐다"의 증거가 아니라 "수행되지 않아도 존재하는" 사실이다.
  > 그래서 (ii)를 택할 때 기록하는 것은 "해소됐다"가 **아니라** "이 escalation은 종결된
  > 결정을 겨냥하므로 지금 실행해도 무의미하다고 판단해 만료시킨다"이다. 만료(expired)와
  > 해소(resolved)를 같은 단어로 적지 않는다. 두 상태를 구분할 수 없다면 (i)을 택하라.
- **Validate**: STATE.md에서 `Escalation Pending`이 사라지고, `fix-task-applied.md`에
  **`expired` (해소 아님)** 로 기록되며, 그 기록이 ledger 엔트리 경로 + commit sha를
  인용함. (i)을 택했다면 santa-loop receipt가 실재함

### Task 9: 문서 — dogfood 경로를 acceptance 절차로 못박는다

- **Action**: `docs/dogfood-install.md`에 절을 추가한다 — "**배선 마일스톤의 라이브
  acceptance**: `${CLAUDE_PLUGIN_ROOT}`가 캐시를 가리키는 한 in-flight 명령 본문은
  실행되지 않는다. 라이브 실값을 acceptance로 갖는 마일스톤은 `--plugin-dir` 아래에서
  완주해야 하고 보고서가 그 사실을 명시해야 한다." `frozen-baseline.md`는 **동결 블록을
  건드리지 않고** 라이브 절에만 M5 실값을 더한다.
- **Mirror**: `docs/release-channel.md`가 절차를 소유하는 방식
- **Validate**: `--frozen-only` 출력이 문서의 동결 블록과 바이트 동일(0줄 diff)

### Task 10: PRD 표 갱신 · CHANGELOG (UI5 · UI8)

- **Action**: PRD `Delivery Milestones`에 M5·M6 행을 추가하고 M5를 `in-progress` +
  이 plan 경로로 둔다. **`plugin.json` version은 선언하지 않는다**(UI8). CHANGELOG는
  `## [Unreleased]` 아래에 누적한다.
- **Validate**: `node scripts/version-declaration-guard.js` → exit 0

## Validation

```bash
# 1. 단위 + 계약 test (§3.4 — codex 경로 차단 필수)
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/lib/tests/install-skew.test.js \
  plugins/mccp/scripts/lib/tests/install-skew-wiring.test.js \
  plugins/mccp/scripts/lib/tests/linkage-audit.test.js

# 2. 이 plan이 건드리는 모듈의 **기존** falsifier suite (L2 test HIGH x4 흡수).
#    초안은 이 다섯을 하나도 돌리지 않았다 — 즉 Task 2/3/4의 계약 주장이
#    전부 반증 불가였다. dep-check 상위집합·session-start 배너 발화·
#    linkage-defs 정의 소유권·배선·동결 바이트가 각각 여기서 반증된다.
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/lib/tests/dep-check.test.js \
  plugins/mccp/scripts/hooks/tests/session-start-dep-check.test.js \
  plugins/mccp/scripts/lib/tests/linkage-defs.test.js \
  plugins/mccp/scripts/lib/tests/linkage-wiring.test.js \
  plugins/mccp/scripts/lib/tests/linkage-frozen-baseline.test.js

# 2b. 인접 회귀 (plan-review 를 공유하는 test)
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/lib/tests/plan-review-cli-emit.test.js \
  plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js

# 3. 동결 baseline 바이트 불변 (UI6). **이 명령 단독은 비교하지 않는다** —
#    출력만 뿜고 드리프트가 나도 exit 0이다(L2 test HIGH 흡수). 실제 falsifier는
#    검사 2의 linkage-frozen-baseline.test.js:41-62 이고, 아래는 사람이 눈으로 볼
#    보조 출력일 뿐이다. DD5는 pre_baseline 을 건드리지 않으므로 이 test 가 red 면
#    그것은 Task 4 의 버그이지 문서 갱신 신호가 아니다.
node plugins/mccp/scripts/lib/linkage-audit.js --frozen-only

# 4. 강제 뷰 (경계는 merge-base 명시형 — M4 local code-review M3)
node plugins/mccp/scripts/lib/linkage-audit.js --check-round-structure \
  --since "$(git merge-base origin/main HEAD)"

# 5. 라이브 실값 (Task 6 착지 후에만 통과한다 — 그 이전 실패는 정직한 부트스트랩 상태다)
node plugins/mccp/scripts/lib/linkage-audit.js --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const l=JSON.parse(s).post_baseline.linkage;console.log('bidirectional='+l.bidirectional+' denominator='+l.denominator);process.exit(l.bidirectional>=1?0:1)})"

# 6. version 선언 금지 (UI8)
node scripts/version-declaration-guard.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Task 6이 이 사이클에서도 발화하지 않는다** — M4의 R10이 정확히 이것이었고 두 번째 재발이 된다 | **높음** | DD3의 `--plugin-dir` 경로를 acceptance **절차**로 못박고, 실패 시 "실패했다"를 보고서에 값으로 적는다. Task 1~5는 Task 6과 독립이라 발화 실패가 마일스톤 전체를 무효화하지 않는다 |
| 라운드 예산 소진으로 이 plan의 게이트가 5.2c에서 거부된다 (F12) | **확정** | DD7에 미리 선언. §3.16의 문서화된 우회 + 사유. 원장 미삭제 |
| skew 경고가 노이즈가 된다 — 캐시가 뒤처지는 것이 기본 상태라 매 세션 발화한다 | 중 | 기존 24h throttle을 공유하고(새 채널 없음), `plugin_dir_override=true`면 침묵. 배너는 한 줄 |
| DD5의 사유 이분화가 `pre_baseline` 바이트를 움직여 동결이 깨진다 | 중 | Validation 3이 그 시험이다. 움직이면 문서를 함께 갱신하고 이탈로 보고 |
| `install-skew`가 게이트를 막는 방향으로 오해되어 후속 사이클이 fail-closed로 바꾼다 | 낮음 | DD4를 모듈 헤더에 축자 기록. 차단 시 캐시가 뒤처진 모든 사용자의 게이트가 죽는다는 근거를 함께 |
| Task 8의 (ii) 선택이 escalation 회피로 읽힌다 | 중 | 근거를 ledger 엔트리 + commit sha로 인용하고 판단이 아니라 사실로 남긴다. (i)의 여지도 열어 둔다 |
| `linkage-audit.js`가 1104줄에서 더 늘어난다 (backlog L5 이연분) | 중 | 신규 축은 계수뿐이라 증가폭이 작다. 추출은 여전히 M1 DD1a(코퍼스 소속 판정 복제 금지)에 막혀 있으므로 backlog 유지 |
| in-flight sibling 브랜치가 `dep-check.js` / `session-start.js`를 공유 소유한다 | 중 | 착수 전 `git diff --name-only origin/main...<sibling>`으로 확인. 겹치면 Task 3의 소비처를 `setup.md` 단독으로 축소 |
| 머지·리베이스가 다른 PR의 신규 파일을 조용히 삭제한다 (§3.5.1, PR #110 선례) | 중 | commit·PR 직전 `git diff --diff-filter=D --name-only origin/main...HEAD` 확인 |

## Acceptance

- [ ] All tasks complete
- [ ] **Validation 1·2·2b·3·4·5·6이 전부 통과** — 5(라이브 실값)는 조건부가 아니다
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)
- [ ] **`linkage-audit --json`의 `post_baseline.linkage.bidirectional >= 1`**
- [ ] **`ship_eligibility.by_reason`의 라이브 파티션이 두 사유로 갈려 있고** 그 값이
      오늘의 88건 단일 사유와 다르다 (`pre_baseline`은 불변)
- [ ] `linkage-frozen-baseline.test.js`가 green (UI6의 실제 falsifier)
- [ ] backlog 79행이 남김없이 분류되고 `deferred-triage.md`가 실재
- [ ] STATE.md의 `Escalation Pending`이 근거와 함께 만료 또는 해소
- [ ] `plugin.json` version 미선언 (`version-declaration-guard.js` exit 0)

> **산문 escape를 제거했다** (L2 invariant MEDIUM 흡수). 초안은 라이브 실값 항목에
> "또는 그것이 `0`인 이유가 보고서에 적혀 있다"를 붙이고 Validation 5를 조건부로 뒀다.
> 그러면 **미발화가 곧 완료**가 되어, PRD Risks 첫 행이 지목한 "통로는 만들었는데 안
> 부른다"의 재발을 이 마일스톤이 구조적으로 잡지 못한다 — UI7이 요구하는 것은 정확히
> 그 반대다.
>
> 발화하지 못하는 경우의 정직한 처리는 acceptance를 무르게 하는 것이 아니라 **이
> 마일스톤을 완료로 선언하지 않는 것**이다. 그때 남는 선택지는 둘이다: (a) 원인을 고쳐
> 다시 시도한다, (b) M5를 `in-progress`로 남기고 미발화 원인을 M6 또는 새 축으로 연다.
> 부분 착지가 필요하면 Task 1~5·7~10을 먼저 ship하고 Task 6을 별도 마일스톤으로 분리하되,
> 그 경우 **M5의 outcome 문장에서 라이브 실값 주장을 빼야 한다** — 주장을 남긴 채
> acceptance만 무르게 하는 것이 M2가 dropped된 이유이자 이 PRD의 지배적 실패 모드다.

## Design Critique

- 트리거: `design_signal=true` · `signal_files: ["<keyword:design>"]` — 실제 렌더링
  표면이 아니라 `## Design Decisions` 헤딩의 **키워드 일치**다.
- 호출 형태: `Skill(impeccable, ...)` (오라클 해소값 — `impeccable_source=user`,
  `version=4.0.4`). 하드코딩하지 않았다.
- 라운드: `round=0/2` · **verdict=CONVERGED** · findings **0건**

판정 근거는 산문이 아니라 실측이다.

| Output Constraint | 판정 | 근거 |
|---|---|---|
| 정보 위계 3단계 (heading depth ≤ 3, H15) | **PASS** | 코드 fence 제외 실측 `H1=1 · H2=12 · H3=18 · H4+=0` |
| 강조색 화면당 1개 | **N/A** | 이 plan의 `Files to Change`에 `.html/.jsx/.tsx/.css/.scss/.vue`가 **0건** — viewport도 accent token도 도입하지 않는다 |
| raw markdown marker 금지 | **N/A** | 같은 근거. 이 문서는 렌더 산출물이 아니라 마크다운 원본이며, 제약의 대상은 렌더된 표면의 마커 누출이다 |
| 한 화면 항목 수 상한 (list-of-N) | **N/A** | 같은 근거. 표는 `/mccp:plan` 템플릿이 요구하는 plan 아티팩트 구조이지 대시보드 표면이 아니다 |

세 항목을 `PASS`가 아니라 `N/A`로 적은 것은 의도적이다 — 판정 대상이 없는 것을 통과로
적으면 이 마일스톤이 닫으려는 종류의 침묵이 된다. 이 plan이 렌더링 표면을 도입하면 그때
세 항목은 실제 판정 대상이 된다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 없으므로 **어떤
impeccable 명령도 호출하지 않는다** — 아래는 구현자용 체크리스트다. 이 plan의 산출물이
렌더링 표면을 갖지 않으므로(위 표) 실제로는 전 행이 비해당일 가능성이 높고, 그 판정은
implement 시점의 `rendering_surface` 탐지가 소유한다.

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

## L2 패널 흡수 기록 (2026-09-04)

`mode=multi-agent` 4관점 반증 패널이 **전원 fail**, blocking 12건(HIGH 8 · FAIL 4)을
냈다. 판정은 `divergent`이고 `MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion`으로
진행했다 — verdict는 **위장 없이 `divergent` 그대로 봉인**됐으므로 cross-gate dedupe는
닫힌 채 남고 `/mccp:pr`에서 PR-Codex가 반드시 발화한다.

§3.14대로 **HIGH 8건을 그 자리에서 흡수**했고, 구조적 MEDIUM 3건도 함께 흡수했다.
12건 전부는 `backlog-append`가 `.claude/plans/codex-findings-backlog.md`에 기계 적재했다
(완화의 부수효과가 아니라 전제조건 — 적재 실패였다면 `EX_BLOCK`이었다).

| 관점 | Sev | 지적 | 흡수 |
|---|---|---|---|
| security | HIGH | 배너를 `MCCP_CODEX_DISABLED` 가드 안에 두면 **표준 설치에서 한 번도 발화하지 않는다**(`session-start.js:1066`, 이 저장소 env에 실제로 `=1`) | **DD4a 신설** — 가드 밖 자기 블록으로 이동. 이 사이클이 닫으려는 실패 자체였다 |
| architect · invariant | HIGH ×2 | DD5가 동결 baseline 바이트를 **확정적으로** 깬다(`docs/review-record-linkage/frozen-baseline.md:318` 축자 봉인). 초안 처방("문서를 함께 갱신")은 UI6를 block에서 warn으로 강등한다 | **처방 반전** — 사유 이분화를 `post_baseline`에만 적용. `pre_baseline` 불변이 계약이고, red는 문서 갱신 신호가 아니라 **버그**다 |
| invariant | HIGH | DD7이 선언한 감사 우회 경로가 **실재하지 않는다**(`describeRoundCapRecovery`가 직접 반박) | **DD7 재작성** — 실제로 한 일(마일스톤 슬러그 원장 키잉)을 적고, 재봉인이 이탈임을 명시 |
| test | HIGH ×4 | Validation이 이 plan이 건드리는 모듈의 **기존 falsifier suite 5종을 하나도 돌리지 않는다** — 계약 주장 전부가 반증 불가 | **검사 2 신설** — `dep-check` · `session-start-dep-check` · `linkage-defs` · `linkage-wiring` · `linkage-frozen-baseline` 실행 |
| security | MEDIUM | 24h throttle 공유는 코드 주석이 스스로 반박한 설계(`:1114-1121`) — 배너가 1회성이 된다 | 자기 present-only 필드 `install_skew_at`·`install_skew_state` (`dep_check_eclipsed` 선례) |
| security | MEDIUM | `plugin_dir_override=true`가 무판정 침묵인데, 낡은 sibling 워크트리가 바로 탐지 대상이다 | override 디렉토리를 **재판정**, 불가 시 `override_unjudged` |
| architect | MEDIUM | `undecidable`은 단일 문자열이 아니라 **3갈래**(`linkage-defs.js:198 · 212-216 · 218-223`) | 이분화는 `:218-223` 갈래 **한정**. 나머지 둘은 불변 |
| invariant | MEDIUM | Acceptance의 산문 escape("또는 이유가 적혀 있다")로 **미발화가 곧 완료**가 된다 | escape 제거. Validation 5를 무조건화하고, 미발화 시 완료 선언을 금지 |
| invariant | MEDIUM | Task 5(b)가 닫겠다는 문구는 `linkage-audit.js:659-661`에 **이미 있다** — 실질 변경 0 | (b) 철회 · backlog L1454를 M6 이연 + 사유 기록 |
| invariant | MEDIUM | Task 8의 (ii)가 skip predicate — "M4가 ship됐다"는 escalation 미해소인 채로도 참 | **만료(expired)와 해소(resolved)를 구분**해 기록하도록 명시 |
| security | LOW ×2 | 경로 유출 단언이 macOS·UNC 미포함 · `gitCommitSha` 형태 미검증 | 4형태 단언 + `^[0-9a-f]{7,40}$` |

**이 흡수는 receipt를 stale로 만든다.** `mccp-plan-codex/review-record-linkage-m5`의
`reviewed_plan_hash`는 흡수 **이전** 판본(`sha256:6fd9ad77…`)을 가리킨다. 이 저장소의
모든 shipped 사이클이 겪는 구조적 상태이고(§3.16 · memory `plan-receipt-goes-stale-at-implement`),
라운드를 늘려 재리뷰하는 대신 그대로 보고한다. `## Gate Deviation`에 기록한다.

## Codex Adversarial Review

> **이 사이클에서 Codex는 발화하지 않았다.** `MCCP_CODEX_DISABLED=1`이 운영자 정책으로
> 설정돼 있고(§3.3 — 1회성 escape가 아니다), 게이트 진입 시 `codex-policy.js seal`이
> `codex_disabled=true`로 봉인했다. 승인은 `mode=multi-agent` L2 패널이 발행했으며 그
> 판정은 위 흡수 기록과 `.claude/reviews/plan-review-review-record-linkage-m5.md`에 있다.
> 패널 승인은 cross-gate dedupe를 만족하지 못하므로 `/mccp:pr`에서 PR-Codex가 발화한다
> (DD2 — 다만 Codex 정책이 그대로면 그쪽도 `skipped`로 봉인된다).

## External Research Provenance

- Source PRD: .claude/prds/review-record-linkage.prd.md
- References section sha256: 6285d0d8018061d14bd81f59fab68b7c3fcdd25580472eb34dd5b2f6449f5647
- Stamped at: 2026-09-04T05:33:40.771Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.
