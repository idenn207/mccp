# Implementation Report: codex-intent-context M2 — 심판 컨텍스트 분리

**Plan**: `.claude/plans/codex-intent-context-m2.plan.md`
**Branch**: `feat/codex-intent-context-m2` · **Version**: `1.23.9 → 1.23.10`
**Date**: 2026-08-16

## Summary

심판을 저자에게서 분리했다. `/mccp:plan` 5.5a의 adjudication을 `Task(mccp:intent-arbiter)`로 옮기고, 그 에이전트의 도구를 `Write` 하나로 제한해 **plan을 여는 수단 자체를 없앴다**. 판정에 필요한 것은 whitelist projection으로 프롬프트에 실려 간다. arbiter가 실패하면 원인 불문 저자 경로로 강등되고, 강등 사실과 사유가 receipt에 봉인된다. 반입 backlog 결함 2건(`stripQuotedStructures`의 CommonMark 미구현 3종 + 주석 스트리퍼의 처리 순서)도 같은 커밋에서 닫았다.

**강제되는 명제는 하나다**: 정상 운용에서 저자가 심판을 겸하지 않는다. 심판이 옳아진다는 뜻도, 위조를 막는다는 뜻도 아니다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 설계는 plan대로였고, 미명세였던 셸 원자성 1건이 구현 중 표면화 |
| Files Changed | 27 | 27 (plan 목록 25 착지 + 미이행 1 + 계획 밖 2) |
| Tasks | 12 | 12 complete |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `intent-claims.js` 인용 판정 단일 상태 기계 | 완료 | 주석을 라인 루프로 이전 + CommonMark type 3/4/5 추가 |
| 2 | `intent-claims.test.js` 반입 결함 회귀 | 완료 | 8케이스 추가. 구 구현 mutation-check에서 4건 실패 확인 |
| 3 | `intent-arbiter.js` 순수 오라클 4종 | 완료 | fs/process/clock 0 — test가 소스 스캔으로 단언 |
| 4 | `intent-arbiter.test.js` | 완료 | 23 tests |
| 5 | `agents/intent-arbiter.md` | 완료 | `tools: [Write]` |
| 6 | `intent-context.js` `arbiter_degraded` 수용 | 완료 | 형태만 검증, M1 규칙 무변경 |
| 7 | `intent-context.test.js` 형태 회귀 | 완료 | 8케이스(homoglyph 포함) |
| 8 | `plan-codex-runner.js` 투영·인자·봉인 | 완료 | env 이름 0회 등장 유지 |
| 9 | runner 회귀 + e2e 관통 | 완료 | runner +5, e2e 9 시나리오 |
| 10 | receipt 표면 (schema·write·validate-cmd) | 완료 | 페어링을 schema 검증 함수 안에서 강제 |
| 11 | `commands/plan.md` projection + Task 디스패치 | 완료 | lint 정규식 9개 전부 HEAD 미매칭(mutation-check) |
| 12 | 버전·문서 동기 | 완료 | 아래 D3 참조(i18n test는 파생이라 무변경) |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | JS 프로젝트에 lint/type-check 스크립트 없음(`package.json` 부재) |
| Unit Tests | Pass | 아래 표 |
| Build | N/A | 빌드 단계 없음 |
| Integration | Pass | `intent-arbiter-e2e.test.js` 9 시나리오 — plan.md의 `node -e` 프로그램을 **추출해 실행** → runner → 실제 `write.js` → 디스크 receipt |
| Edge Cases | Pass | 강등 4분기 · 경합 2방향 · 모드 4조합 · 인용 구조 7종 |

| Suite | Result |
|---|---|
| `intent-claims.test.js` | 62/62 |
| `intent-arbiter.test.js` | 23/23 |
| `intent-arbiter-e2e.test.js` | 9/9 |
| `intent-context.test.js` | 66/66 |
| `plan-codex-runner.test.js` | 45/45 |
| `plan-command-marker-states.test.js` | 18/18 |
| `intent-gate-fields.test.js` | 53/53 |
| `validate-cmd-intent-gate.test.js` | 17/17 |
| `instruction-contract.test.js` | 28/28 |
| `receipt/tests/` 전체 | 589 → 초록 유지 |
| `lib/tests/` 전체 | 1714 중 **2건 실패 — 선재 red** (아래 참조) |

### 선재 red 2건 (본 변경과 무관)

`b2-coverage-gate.test.js`의 `static lint passes on the real repo` · `full gate: covered observation on the real repo`. 위반 지점은 `plan-codex-runner.js`의 `fs.renameSync(receiptPath, dest)` (`quarantineReceipt`) — **본 사이클이 만들지 않은 기존 코드**다. `git stash push -- plugins/mccp/scripts/lib/plan-codex-runner.js`로 제 변경만 되돌린 상태에서도 동일하게 `21 pass / 2 fail`이었다(실측). 라인 번호만 제 삽입으로 이동했다.

`a3-instruction-cost.test.js`는 전체 glob 1회차에서 file-level ✖이 났으나 단독 실행 13/13 초록이고 2회차 glob에서도 재현되지 않았다 — 부하 하 flaky로 판단한다.

## Deviations from Plan

### D1 — 게이트 기록을 plan 본문이 아니라 notes에 썼다 (Phase 2.5.4)

**WHAT**: `## Codex Implementation Review` 절을 `.claude/notes/codex-intent-context-m2.md`에 기록했다.

**WHY**: plan 본문을 편집하면 상위 `mccp-plan-codex` receipt의 `plan_hash`가 어긋나 2.5.7 read-back이 `stale`로 exit 2 한다. 실측했다 — `sha256:9e22d72b…` → `sha256:10109025…`, `ok:false`. 이는 backlog 2026-08-09 MEDIUM("prp-implement Phase 2.5가 자기 자신을 stale로 만든다")에 이미 등재된 구조 결함이고, 그 항목이 나열한 후보 수정 **(b)** 가 정확히 이 경로다. 2.5.6 Step A의 검증 대상도 문언상 `<plan or notes path>`다. 대안(plan 주입 후 `/mccp:plan` 재실행)은 590초짜리 4관점 패널 심의와 그 `review_proof`를 덮어쓰므로 채택하지 않았다. backlog 항목에 이번 선례를 추가했다(결함 자체는 **미해결**).

### D2 — arbiter는 `$ADJUDICATION.tmp`에 쓰고 명령 본문이 publish한다

**WHAT**: plan Task 5 (v)는 "`$ADJUDICATION.tmp` 작성 후 rename"이라고 적었으나, 같은 Task가 정한 `tools: [Write]`에는 rename 수단이 없다.

**WHY**: runner의 `waitForAdjudication`은 파일이 나타나는 즉시 읽고 parse 실패를 **재시도하지 않는다**(`plan-codex-runner.js:180`). arbiter가 목표 경로에 직접 쓰면 반쯤 쓰인 파일이 읽혀 `incomplete`가 된다. 그래서 arbiter는 `.tmp`에 쓰고, 명령 본문이 **검증 후** 원자적으로 publish한다. DD2가 사려는 것(판정 *내용*이 저자 컨텍스트를 경유하지 않음)은 그대로다 — `mv`는 저작이 아니고 본문은 바이트를 읽지도 쓰지도 않는다.

**부수 효과(정직 표기)**: publisher가 하나뿐이 되어 DD5 7번의 `EEXIST` 경합은 **정상 경로에서 도달 불가**가 됐다. 그래도 `wx`/`link(2)` create-exclusive 분기와 재-probe 취소를 구현했다 — 올바른 프리미티브이고, 미래에 arbiter나 동시 행위자가 직접 publish하면 그때 유효하다. e2e 시나리오 3은 plan이 지시한 그대로(강등 쓰기 직전 test가 유효 파일을 배치) 결정적으로 그 분기를 탄다. **Acceptance 항목은 하나도 잃지 않았다.**

### D3 — `i18n-surface.test.js`를 고치지 않았다

plan Task 12는 "단언 2건 동기"를 요구했으나, 그 파일은 v1.x 어느 시점에 이미 `MANIFEST_VERSION = require('.../plugin.json').version`으로 **파생**하도록 바뀌어 있었다(파일 주석이 §3.7을 근거로 그 결정을 설명한다). 리터럴이 없으므로 동기할 대상이 없고, `plugin.json` bump만으로 두 footer 단언이 새 버전을 검사한다(10/10 초록). 5면 중 4면만 실제 편집 대상이었다.

### D4 — 계획 밖 파일 1개

`docs/multi-session-work-loop/instruction-contract.md`에 `S3.13.2` 행 1줄 추가. CLAUDE.md에 절을 추가하면 `instruction-contract.test.js`가 "모든 heading은 ledger에 disposition을 가져야 한다"로 실패한다(실측). Task 12의 §3.13.2 추가에 대한 **기계적 귀결**이지 새 축이 아니다.

### D5 — plan을 아카이브하지 않았다 (Phase 5)

명령 본문은 `.claude/PRPs/plans/completed/`로 `mv`하라고 지시하지만, **두 가지 이유로 하지 않았다**: (1) CLAUDE.md §3.11이 정한 목적지는 `archived/`이고 `completed/`는 어느 대시보드 스캔에도 잡히지 않는다 — 이 불일치는 backlog 2026-08-13 MEDIUM에 이미 등재된 명령 본문 결함이다. (2) §3.11 **C2**: plan 아카이브는 **PRD 전체 완료 시에만** 한다. 이 PRD는 M3가 `pending`이므로 지금 옮기면 PRD가 활성 표면에서 소실된다.

### D6 — PRD milestone status를 `in-progress`로 남겼다

M2 행의 Outcome 두 절 중 "저자 정당화에 도달할 경로가 코드에 없음"은 지금 검증됐지만, "adjudication을 쓰는 주체가 plan 저자가 아니고"는 **머지 후 라이브 완주로만** 확인된다(plan Acceptance 마지막 항목 · DD8 표 마지막 행). M1.5 선례를 따라 그 조건이 충족될 때 `complete`로 올린다.

## Issues Encountered

### 구현 중 발견한 실제 결함 1건 — probe가 검증 전에 publish했다

초안 probe는 `.tmp`를 무조건 목표 경로로 rename한 뒤 검증했다. e2e 시나리오 2가 이를 잡았다: 파손 JSON이 runner가 폴링하는 경로에 올라가 **강등 대신 `incomplete`** 가 났다(exit 4 관측). 순서를 "검증 → publish"로 뒤집었다. 이 결함은 정적 lint로는 보이지 않는다 — 키워드가 전부 제자리에 있기 때문이다. 행위 test가 값을 한 지점이다.

### 자기무력화 스캔 1건

`plan-codex-runner.js`에 "이 env 이름은 0회 등장한다"는 **주석을 쓰면서 그 이름을 적어** 스캔이 자기 주석에 걸렸다. 주석에서 이름을 빼고, 사유 문구에서도 뺐다(토글 이름은 `docs/ENVIRONMENT.md`가 소유). 같은 부류를 test가 잡았다는 것 자체가 그 스캔이 무디되 유효하다는 증거다.

### 헬퍼 이름 충돌 1건

`validate-cmd-intent-gate.test.js`에 이미 `blockingReason(repo)`가 있는데 동명 `blockingReason(res)`를 추가해, 함수 선언 호이스팅으로 **기존 test 2건이 잘못된 인자를 받았다**. `blockingReasonOf`로 분리.

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/intent-arbiter.js` | CREATED | +215 |
| `plugins/mccp/agents/intent-arbiter.md` | CREATED | +60 |
| `plugins/mccp/scripts/lib/tests/intent-arbiter.test.js` | CREATED | +246 |
| `plugins/mccp/scripts/lib/tests/intent-arbiter-e2e.test.js` | CREATED | +316 |
| `docs/codex-intent-context/arbiter-separation.md` | CREATED | +82 |
| `plugins/mccp/commands/plan.md` | UPDATED | +181 / -2 |
| `plugins/mccp/scripts/lib/tests/intent-claims.test.js` | UPDATED | +124 |
| `plugins/mccp/scripts/receipt/tests/intent-gate-fields.test.js` | UPDATED | +117 |
| `plugins/mccp/scripts/lib/intent-claims.js` | UPDATED | +93 / -31 |
| `plugins/mccp/scripts/lib/tests/intent-context.test.js` | UPDATED | +87 |
| `plugins/mccp/scripts/lib/tests/plan-codex-runner.test.js` | UPDATED | +82 |
| `plugins/mccp/scripts/receipt/tests/validate-cmd-intent-gate.test.js` | UPDATED | +67 |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATED | +54 |
| `plugins/mccp/scripts/lib/plan-codex-runner.js` | UPDATED | +52 |
| `plugins/mccp/scripts/lib/tests/plan-command-marker-states.test.js` | UPDATED | +55 |
| `CLAUDE.md` | UPDATED | +37 |
| `CHANGELOG.md` | UPDATED | +32 / -1 |
| `plugins/mccp/scripts/lib/intent-context.js` | UPDATED | +29 |
| `plugins/mccp/scripts/receipt/write.js` | UPDATED | +16 |
| `plugins/mccp/scripts/receipt/validate-cmd.js` | UPDATED | +14 / -1 |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | +5 / -5 |
| `docs/ENVIRONMENT.md` | UPDATED | +2 / -1 |
| `plugins/mccp/.claude-plugin/plugin.json` · `renderer/html.js` · `renderer/markdown.js` | UPDATED | version 3면 |
| `docs/multi-session-work-loop/instruction-contract.md` | UPDATED | +1 (D4) |
| `.claude/notes/codex-intent-context-m2.md` | CREATED | 게이트 기록 (D1) |

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `intent-arbiter.test.js` | 23 | 모드 파싱 4 · whitelist 등가(최상위·`findings[]`·`intent_items[]`) · 경로 누출 0(projection + 프롬프트) · 결정성 · 봉인 4조합 · agent `tools` |
| `intent-arbiter-e2e.test.js` | 9 | 성공 · 파손→강등 · 경합→취소 · 무효 late→교체 · 불완전 강등→`incomplete` · `author`+강등 모순 · env 미독 2 |
| `intent-claims.test.js` | +8 | CommonMark type 3/4/5 · 주석 2행 · type 7 · fence/blockquote false-block · mid-line 주석 · EOF |
| `intent-context.test.js` | +8 | `arbiter_degraded` 형태 6분기 + M1 무면제 |
| `plan-codex-runner.test.js` | +5 | `intent_items` 투영 · 실제 projection 누출 0 · 봉인 3조합 · 모순 writer 0회 · skip null |
| `intent-gate-fields.test.js` | +7 | present-only · 페어링 schema 강제 · enum · hash 포함 · carve-out null |
| `validate-cmd-intent-gate.test.js` | +4 | 강등 문구 · 비강등 무추가 · `author` 선택 구분 · legacy 무손상 |
| `plan-command-marker-states.test.js` | +5 | 본문 lint 9정규식(전부 HEAD 미매칭 확인) |

## Next Steps

- [ ] `/mccp:code-review` 또는 `/mccp:prp-commit` → `/mccp:pr`
- [ ] **(머지 후)** `claude plugin update` → `MCCP_PLAN_REVIEW=codex`로 PRD-mode plan 1건 라이브 완주 → `Task(mccp:intent-arbiter)` 실발화 · M1 바인딩 통과 · `intent_arbiter='subagent'` 봉인 확인 → PRD M2 행 `complete`로 승격
- [ ] `MCCP_INTENT_ARBITER`는 v1.23.10부터 default `subagent` — 라이브 완주 전까지 실사용 관측 없음
