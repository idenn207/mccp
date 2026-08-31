# Implementation Report: env-contract-integrity M3 — 라운드 캡 기계 강제

**Plan**: `.claude/plans/env-contract-integrity-m3.plan.md`
**Branch**: `env-contract-integrity`
**Version (잠정)**: `1.33.4` — §3.7대로 머지 해소 시점과 `/mccp:pr` 진입 직전 **두 번** 재계산 필요

## Summary

캡은 그동안 **판정만 있고 강제가 없었다.** `effectiveRoundCap`은 정확한 수를 돌려주고 세 게이트가
그 오라클을 실제로 불렀지만, 라운드를 여는 것은 LLM이 읽는 산문이라 초과를 막는 장치가 없었다
(실측 15+ 라운드, 그런데 receipt는 `rounds: 1`을 봉인 — 저자 서술과 봉인된 사실이 같은 리터럴이라
그 필드는 아무 정보도 나르지 않았다).

M3은 캡을 **리뷰어 발화 지점**에서 강제한다: 게이트 진입 시 정책을 봉인하고, 라운드 수의 단일
출처인 원장을 두고, 이미 fail-closed로 배선된 두 chokepoint가 원장을 읽어 초과를 거부한다.
그리고 `resolution.rounds`를 원장에서 파생시켜 저자 서술과 분리한다.

## 이 사이클이 이어받은 상태

이전 세션이 Task 1~6을 착지시키고 중단했다. 이 사이클은 **남은 범위**를 닫았고, 그 범위는
plan-review 패널이 남긴 HIGH 3건이 정확히 지목한 것이었다: test 파일 전무 · Task 7 배선 미착지 ·
G7 미판정.

게이트 receipt(`mccp-plan-codex` · `mccp-implement-codex`, slug `env-contract-integrity`)는 M3
plan과 `plan_hash`가 정확히 일치하고 `validate` exit 0이므로, §3.16대로 **라운드를 늘리지 않고**
그 chain 위에서 진행했다. hook이 보고한 "missing mccp-plan-codex"는 slug derivation 아티팩트다
(hook은 `env-contract-integrity-m3`을 파생하고 게이트는 canonical `env-contract-integrity`에 썼다 —
M2와 같은 이유).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large — 일치 |
| Files Changed | 27 | 27 수정 + 8 신규(코드/test) |
| Tasks | 9 | 9 완료 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 라운드 원장 | 완료 | 이전 세션 착지, 이 사이클에서 test로 봉인 |
| 2 | 캡 봉인 | 완료 | 동일 |
| 3 | `MCCP_ROUND_LEDGER` 어휘·등재 | 완료 | 동일. 인구조사 test 갱신은 이 사이클(아래 참조) |
| 4 | Codex 채널 강제 | 완료 | + **면제 축 추가**(아래 Deviations) |
| 5 | 패널 채널 강제 | 완료 | 이전 세션 착지, test로 봉인 |
| 6 | receipt 진짜 라운드 수 | 완료 | 동일 |
| 7 | 세 명령 본문 배선 | 완료 | **이 사이클** — seal 3건 + `round-cap-reached` 분기 + 산문 정정 |
| 8 | 문서·사실 정정 | 완료 | **이 사이클** — `.gitignore` · gate-design 앵커 · CLAUDE.md 3면 · G7 |
| 9 | 버전 4면 + PRD 종결 | 완료 | **이 사이클** — 1.32.8 → 1.33.4 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| 계약 정합 (lint L1~L12) | 통과 | exit 0. **L10이 이 사이클의 드리프트를 잡았다**(아래) |
| doctor | 통과 | warnings 0 |
| review-rounds (신규 3파일) | 통과 | 59 tests · pass 56 · fail 0 · skip 3 (Windows POSIX 모드) |
| round-cap-command-body (신규) | 통과 | 11/11 |
| round-ledger-fields (신규) | 통과 | 16/16 |
| review-single-pass (회귀) | 통과 | 31/31 |
| env-contract (회귀) | 통과 | 138/138 — 인구조사 1건 갱신 후 |
| i18n-surface (버전 4면) | 통과 | 10/10 |
| plan-review (회귀) | 통과 | 293 tests · pass 292 · fail 0 (실제 경로 `lib/tests/plan-review-*` — plan의 Validation 경로는 오기, 아래 Deviation 3) |
| receipt 전량 (회귀, 53파일) | 통과 | exit 0 (독립 2회). 건수는 출력 필터가 놓쳤다 — 아래 절 참조 |
| §3.5.1 삭제 검증 | 통과 | 삭제 0건 (커밋 범위·워킹트리 양쪽) |

### receipt 전량 스위트 — 완주 (exit 0)

`node --test plugins/mccp/scripts/receipt/tests/*.test.js`(53 파일)가 **exit 0으로 완주**했다.
`node --test`는 실패 test가 하나라도 있으면 비영점으로 끝나므로 exit 0이 pass 신호다. 같은 명령이
이전 세션에서도 exit 0으로 끝나 **독립 2회** 확인이다.

완주에 30분 이상 걸린 것은 코드가 아니라 머신 부하다 — 같은 저장소에서 다른 mccp 세션 2개가 동시에
돌아 node 프로세스가 445개까지 올라갔고, 이 스위트는 파일마다 자식 프로세스를 띄우며 receipt-write
경로가 briefing LLM 호출(실패 시 75초 대기)을 포함한다. 로그에 남은
`[mccp:briefing] FAILED classification=timeout … (allow)`가 그 대기이며, `(allow)`가 가리키듯
briefing 실패는 설계상 fail-open이라 receipt write를 오염시키지 않는다.

**정직하게 적는 한 가지**: 출력 필터(`grep`/`tail`)가 요약 줄을 놓쳐 **test 건수는 캡처하지
못했다.** 판정 근거는 종료코드다. 그와 별개로 M3이 실제로 건드린 표면은 표적 실행해 건수까지
확인했고 전부 green이다:

| 표적 | 결과 | 왜 이것이 대리 근거가 되는가 |
|---|---|---|
| `schema.test.js` · `v1-3-0-baseline.test.js` · `receipt-bytes-stable.test.js` · `hash-ledger-exclusion.test.js` · `hash-briefing-exclusion.test.js` | **84/84** | present-only 3필드가 (a) 기존 corpus의 hash를 흔들지 않고 (b) `makeSkeleton`에 없으며 (c) 구 receipt의 backcompat를 깨지 않는다 — §3.12가 지키는 축 전부 |
| `round-ledger-fields.test.js` | **16/16** | 파생 · 불일치 fail-closed · 3필드 형태 계약 |
| `write.test.js` · `review-single-pass-fields.test.js` · `dedupe.test.js` · `pr-codex-dedupe.test.js` | **exit 0** (건수 미캡처) | write 경로와 cross-gate dedupe — `resolution.rounds` 파생이 기존 dedupe 판정을 흔들지 않는다 |

**주장하지 않는 것**: 위 표는 전량 스위트를 대신하지 않는다 — 전량은 별도로 exit 0으로 완주했고,
표적 실행은 그 위에 «어느 표면이 왜 안전한가»를 건수로 덧붙인 것이다. 그리고 종료코드는
«실패한 test가 없다»만 말하지 «몇 건이 돌았다»를 말하지 않으므로, 만약 glob이 0개 파일에
매치했다면 그것도 exit 0이다 — 이 스위트는 53개 파일에 매치함을 `ls`로 확인했다.

### Design Grounding

N/A — 디자인 트리거 없음. 이 사이클의 렌더 표면 변경은 `html.js` page-foot과 `markdown.js`
derived 줄의 version 리터럴 교체 하나뿐이고, plan의 Design Critique이 R0에서 `CONVERGED`로
판정한 그대로다(새 컴포넌트·레이아웃·색·타이포그래피 0). 검증 수단은
`renderer/tests/i18n-surface.test.js`이며 10/10 통과했다.

### Security Reviewer

`mccp:security-reviewer`를 2026-08-31 머지 해소 뒤 실행했다(리뷰 전용, 파일 미편집).
대상은 M3이 신설·개변한 6파일이고 질문은 4축 + OWASP였다 — 경로 봉쇄 · 파일 모드 ·
심볼릭 링크/TOCTOU · 봉인 대 live env의 신뢰 경계.

**CRITICAL·HIGH 0건.** CLAUDE.md §3.14 임계에 따라 그 자리 흡수는 없고 4건 전부
[codex-findings-backlog.md](../../plans/codex-findings-backlog.md)로 이연했다.

| 축 | 판정 | 근거 |
|---|---|---|
| 경로 봉쇄 (Q1) | **SAFE** | `assertKeyComponent`(`ledger.js:75-81` · `seal.js:90-96`)가 `decision.js:32`의 `SLUG_RE`로 gate·decision을 게이트하고, 그 정규식이 `.`·`/`·`\`·`:`·NUL·제어문자를 전부 배제한다. 파일명이 항상 복합 `<gate>__<decision>.json`(`ledger.js:106-108`)이라 Windows 예약 장치명으로 축약될 수 없다. 2차 방어로 `ensureStateDir`(`:131-138`)이 `realpathSync.native` 기반 `assertContained`로 디렉토리 탈출을 막는다 — `santa/ledger.js:240-252`와 동형이고, `/` 다중 세그먼트를 허용하는 `review-verdict.js:80-95`보다 오히려 좁다 |
| 파일 모드 (Q2) | LOW · 기존 잔여 | `writeFileAtomic:246`이 tmp에 mode를 안 넘겨 rename 직후 umask 기본을 잠깐 갖는다. `chmodState`(`ledger.js:227`) + `repairModeIfNeeded`(`:145-151`)가 교정. `santa/ledger.js:254-264`가 이미 출하한 trade-off이며 본 파일이 그 주석을 축자 복제해 잔여로 명시. `seal.js:127-131`은 해당 없음(`seal.test.js:227` 단언) |
| 심볼릭 링크·TOCTOU (Q3) | LOW · 기존 잔여 | 원장은 안전 — lock이 `O_EXCL`(`evidence-lock.js:175`), 내용은 `renameSync`(`:251`)라 목적지 링크로 write가 리다이렉트되지 않는다. seal의 unlink→write 창은 `codex-policy.js:108-123`에서 축자 상속(v1.32.6 production) |
| 봉인 대 env (Q4) | **MEDIUM** | `readCap()`(`seal.js:170`)이 `>= 1`만 보고 상한이 없어, `parseRoundCap`이 `[1,3]`으로 clamp하는 env와 달리 봉인 파일 손편집이 무제한 예산을 준다. 권한 경계는 넘지 않고 더 단순한 by-design 우회(봉인 미실행 → `inert` fail-open)가 이미 존재해 MEDIUM |
| 기타 (Q5) | LOW | `resolveRoundBudget`가 `codex-invoke.js`·`plan-review/cli.js`에 독립 중복 — 한쪽만 하드닝하면 두 발화 지점이 갈라진다. 주입 표면·하드코딩 비밀 0건. `receipt/write.js`의 `ROUND_LEDGER_MISMATCH`는 fail-closed로 정상 |

**Q4를 그 자리에서 고치지 않은 이유**는 §3.14다(HIGH 이상만 흡수). 처방 자체는 작지만
(`readCap()`에서 `MAX_ROUND_CAP` clamp + `schema.js:428-431` 동형 정렬) 리뷰어 자신이
"더 큰 by-design 문이 이미 열려 있어" MEDIUM으로 보정했고, 그 문(봉인 미실행 fail-open)은
plan이 의도한 설계라 함께 다루는 것이 맞는 별도 축이다.

## Acceptance — 라이브 실증

단위 test 통과와 **별도로** 실제 바이너리·실제 원장·실제 receipt로 확인했다.

| Acceptance 항목 | 결과 |
|---|---|
| cap=1에서 2회차 Codex 호출이 spawn 없이 `round-cap-reached` | **확인** — `classification=round-cap-reached blocking=false advisory=false durationMs=0 roundsSoFar=1 cap=1`, exit 0, 원장 불변(count=1) |
| 같은 조건에서 `emit-workflow-args` 2회차가 `workflow-args.json` 미생성 + exit 12 | **확인** — `EMIT_EXIT=12`, 파일 `NO` |
| `MCCP_ROUND_LEDGER=observe`에서 둘 다 발화하고 원장에 2건 | **확인** — `EMIT_EXIT=0`, 파일 `YES`, count=2 |
| 원장 파일 실제 생성 + receipt 3필드 + `rounds`가 원장 count와 일치 | **확인** — `.claude/state/review-rounds/mccp-implement-codex__<slug>.json` 생성, receipt에 `resolution.rounds=2` · `round_ledger_count=2` · `round_cap=1` · `round_cap_pinned_by=null` |
| CLAUDE.md §3.16 캡 값 == `.claude/settings.json` (G7) | **확인** — 둘 다 `1`. 세션 env가 `MCCP_GATE_ROUND_CAP=1`로 실제 도달함도 관측 |

**미달성 1건 — 라이브 `/mccp:plan` 완주는 하지 않았다.** plan의 Acceptance는 그 항목에 대해
"단위 test 통과만으로 체크하지 않는다"고 명시하는데, 그것은 별도 게이트 명령의 완주이고
implement 안에서 정직하게 주장할 수 없다. 위 표의 마지막-1행이 그 항목의 **실질**(원장 파일 생성 ·
receipt 3필드 · `rounds` 일치)을 실제 아티팩트로 대신 실증하지만, "`/mccp:plan`을 끝까지 돌렸다"는
**주장하지 않는다**. 데모 잔여물(scratch 원장·receipt·봉인)은 전부 정리했다.

## Deviations from Plan

### 1. `opts.notAReviewRound` 면제 축 추가 (Files to Change 밖 2파일)

**무엇** — `codex-invoke.js`에 프로그래매틱 opt-out을 추가하고 `briefing/invoke.js`와
`plan-review/cli.js l3`가 그것을 넘기게 했다.

**왜** — `invokeAdversarialReview`는 두 곳에서 **리뷰가 아닌 용도**로 재사용된다. 실측으로
드러났다(round-ledger test가 briefing 호출 때문에 test당 75초를 소모하는 것을 추적하다 발견):

- `briefing/invoke.js`는 receipt 요약을 "degenerate adversarial-review"로 부른다. receipt-**write**
  시점에 돌므로, 계상하면 캡 1인 decision의 예산을 요약 하나가 전부 먹고 `resolution.rounds`가
  **리뷰가 0건인 수**를 봉인한다 — M3의 headline 산출물을 M3 자신이 오염시킨다.
- `plan-review/cli.js l3`는 `emit-workflow-args`가 이미 과금한 pass의 3번째 **층**이다. 다시
  과금하면 hybrid 한 번이 2라운드가 되어 기본 캡 1에서 **매번 산술로 멎는다**(shipped 기능이
  구조적으로 실행 불가).

**안전 방향** — opt-**out**이다(선언을 잊은 리뷰는 여전히 세어진다 — 세어지지 않는 라운드는 곧
구속하지 않는 캡이다). 그리고 **프로그래매틱 전용**이다: `parseCliArgs`가 임의 `--*` passthrough
없는 닫힌 allowlist라 셸 호출자는 자기에게 면제를 발급할 수 없다(§3.13의 intent 결정과 같은
구조 논증). 3개 test가 이 셋을 각각 단언한다.

### 2. `/mccp:pr`은 `round-cap-reached`를 `divergent`로 매핑하지 않는다 (범위 축소, 명시)

plan Task 7은 세 게이트 모두에 매핑을 요구하지만, PR 게이트의 Codex 호출은 `codex-runner.js`
자식 프로세스 안에 있고 매핑하려면 `codex_outcome` enum과 `finalize-receipt.js`의 verdict map —
즉 **ship-gate proof 경로** — 를 바꿔야 한다. 그것은 Files to Change 밖이고, gate-guard-integrity
M1이 수리했던 고위험 영역이다.

**판단 근거**: 운영자 결과가 어느 쪽이든 동일하다(감사된 조치가 필요한 차단). 차이는 메시지
품질뿐이므로, proof 경로를 건드리는 대신 `codex-runner.js`가 HALT하되 **예산 소진을 장애와
구별해** 말하고 두 복구 경로를 제시하게 했다. 이 결정과 잔여는 `pr.md` 본문·
`gate-design.md#round-cap-enforcement`·CLAUDE.md §3.3에 각각 명시했고, backlog에 이연했다.

### 3. plan의 Validation 경로 1건이 오기

`node --test plugins/mccp/scripts/lib/plan-review/tests/*.test.js` — 그 디렉토리는 **존재하지
않는다**. 실제 경로는 `plugins/mccp/scripts/lib/tests/plan-review-*.test.js`이며 그것으로 실행했다.
(plan 본문은 편집하지 않았다 — `plan_hash`가 어긋나면 §3.11 guard 2에 PR이 막힌다.)

### 4. 인구조사 test 갱신 (Files to Change 밖 1파일)

`env-contract/tests/registry.test.js`의 어휘 결속 대상 수가 38 → 39가 됐다. 이전 세션이
`MCCP_ROUND_LEDGER` 레지스트리 행만 넣고 이 인구조사를 갱신하지 않아 red였다. **그 test가
붉어진 것 자체가 의도된 동작**이므로(행만 넣고 분포를 안 보면 잡힌다) 기대값과 이력 주석을 함께
갱신했다. 분포는 ref=30 · derive=1 · gap=8이고 `deriveForm===1` 불변식은 그대로다.

### 5. command-body test가 버전 리터럴을 pin하지 않도록 수정

`/이 캡은 v1\.32\.9부터 산문이 아니다/`를 `v[\d.]+`로 완화했다. §3.7 forward-only 상향은 이번
사이클에서만 두 번 일어났고(1.32.9 → 1.33.4), 리터럴을 박으면 무관한 test가 매번 붉어진다 —
그 붉음을 끄는 가장 쉬운 방법이 단언을 지우는 것이 되므로 그 유인을 없앴다.

## Issues Encountered

- **lint L10이 이 사이클의 드리프트를 잡았다.** 명령 본문에 줄을 넣어 registry evidence 행 번호가
  밀렸다(pr.md +18, prp-implement.md +40 — 삽입 줄 수와 정확히 일치). 4건을 실제 read site로
  갱신해 L1~L12 green 복구. 이것이 M1이 세운 계약이 실제로 값을 하는 실측 사례다.
- **`mccp-plan-codex` receipt는 CLI로 쓸 수 없다.** 라이브 실증 중 확인 — `cli.js write`가
  intent 게이트 부재를 이유로 거부한다(§3.13의 설계된 fail-closed). implement 게이트로 실증을
  옮겼다.
- **Task 7 배선이 도달 가능하게 만든 결함 하나를 닫았다 — stale 봉인의 키 오염.**
  `review-rounds/cli.js`의 `cmdSeal`은 `--gate`/`--decision`이 비면 조기반환하는데, 그 경로가
  **기존 봉인을 지우지 않았다.** 세 본문이 `--decision "$ROUND_SLUG"`를 넘기므로
  `derive-decision`이 실패해 그 변수가 비면, 앞 게이트가 남긴 봉인이 살아남아 이 게이트의
  chokepoint가 **남의 `(gate, decision)` 키**로 판정·계상한다(한 decision은 거짓 소진, 다른
  decision은 무제한 라운드). `sealCap`의 정상 경로는 이미 «지우고-쓰기»라 write 실패도 stale을
  남기지 않는데, 조기반환만 그 규율 밖에 있었다. 조기반환에 `clearCap`을 넣어 상태가
  «absent»(fail-open + loud)가 되게 했고, 전용 test가 봉인 소멸 + 이후 호출이 통과하되
  세어지지 않음을 단언한다.
- **`.claude/cache/` test 잔여물.** 새 L3 fixture가 저장소 안에 살아야 해서(`--review-dir`가
  격리를 요구) 실행마다 디렉토리를 남기고 있었다 — 기존 `plan-review-l3.test.js`는 `rmFixtureDir`로
  정리하는데 내 test만 규약 밖이었다. `try/finally` 정리를 넣었다.
- **§3.7 버전 충돌 7번째 재발.** `origin/main`이 마지막 병합(`19f6dd1`) 이후 20여 커밋을 더
  발행해 최대치가 `1.33.1`이 됐다. 이 브랜치의 M1 `[1.32.7]`은 main이 santa-delta-review에 발행한
  같은 번호와 **정면 충돌**하고 M2 `[1.32.8]`은 역행이다. 머지 자체는 이 명령의 범위 밖이므로
  M3만 `1.33.4`로 잡고, 필요한 재번호(M1→1.33.2 · M2→1.33.3)를 CHANGELOG 항목에 표로 명시했다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `review-rounds/tests/ledger.test.js` | 15 | 과소 계상 경로 부재 — 파손을 0으로 읽지 않음 · 동시 기록(kill switch 상속 하에서도) · 경로 주입 거부 |
| `review-rounds/tests/seal.test.js` | 21 | 봉인이 env를 이김 · 열화 3상태 구별 · read-back 가드 · 모드 어휘 fail-closed |
| `review-rounds/tests/enforcement.test.js` | 23 | 두 chokepoint의 실제 거부(spawn 마커로 증명) · DD3 계상 시점 · 면제 축 3건 |
| `lib/tests/round-cap-command-body.test.js` | 11 | 세 본문 배선·위치·분기 정적 단언 |
| `receipt/tests/round-ledger-fields.test.js` | 16 | 파생 · 불일치 fail-closed · present-only · hash 포함 |
| **합계** | **86** | |

## Next Steps

- [x] **receipt 전량 스위트 완주** — exit 0 확인 완료
- [ ] **머지 해소** — `git merge origin/main`(20여 커밋). CHANGELOG 3항목 재번호 + §3.5.1 삭제 검증
- [ ] 재번호 후 4면 동기 재확인 + `i18n-surface.test.js` 재실행
- [ ] `/mccp:prp-commit` → `/mccp:pr` (진입 직전 version 3차 재계산)
